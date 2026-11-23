import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  escapeHtml,
  isSafeDataImageUrl,
  stripHeaderInjection,
  sanitizeAnalyticsParams,
} from "./htmlSanitizer";
import { parseCurrentRoute, ROUTES } from "./routes";
import { USER_MANUAL_SECTIONS, USER_MANUAL_VERSION } from "./userManualPdfGenerator";
import { buildSupportEmailHtml } from "../../api/support/send-feedback";

describe("Academic Compliance & Security Hardening (APS Audit)", () => {
  describe("HTML & Email Injection Protection (PoC Verification)", () => {
    it("escapes stored XSS payloads in printable HTML templates", () => {
      const payload = `Carteira <img src=x onerror="alert('xss')"> & 'teste'`;
      const escaped = escapeHtml(payload);
      expect(escaped).not.toContain("<img");
      expect(escaped).not.toContain("<");
      expect(escaped).toContain("&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot;&gt;");
    });

    it("rejects non-raster or script-bearing data URLs for signature images", () => {
      expect(isSafeDataImageUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
      expect(isSafeDataImageUrl("data:image/jpeg;base64,/9j/4AAQ")).toBe(true);
      expect(isSafeDataImageUrl("data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+")).toBe(false);
      expect(isSafeDataImageUrl(`" onerror="alert(1)`)).toBe(false);
      expect(isSafeDataImageUrl("javascript:alert(1)")).toBe(false);
    });

    it("strips CR/LF and angle brackets to block email header injection", () => {
      const injected = "Atacante\r\nBcc: victim@example.com\nSubject: Hijacked";
      const cleaned = stripHeaderInjection(injected);
      expect(cleaned).not.toMatch(/[\r\n]/);
      expect(cleaned).not.toContain("<");
      expect(cleaned).not.toContain(">");
    });

    it("escapes user-controlled fields in buildSupportEmailHtml", () => {
      const html = buildSupportEmailHtml({
        protocol: "IFPR-SUP-TEST",
        name: `<script>alert(1)</script>`,
        email: `evil@test.com"><img src=x onerror=alert(1)>`,
        category: "BUG_REPORT",
        subject: `<b>Assunto</b>`,
        message: `<svg onload=alert(1)>Mensagem`,
        priority: "ALTA",
        timestamp: "2026-11-23T12:00:00.000Z",
      });
      expect(html).not.toContain("<script>alert(1)</script>");
      expect(html).not.toContain("<svg onload=alert(1)>");
      expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
      expect(html).toContain("&lt;svg onload=alert(1)&gt;Mensagem");
    });

    it("bounds analytics params to max 20 safe primitive keys and <= 2KB", () => {
      const bigPayload: Record<string, unknown> = {
        __proto__: "bad",
        constructor: "bad",
        nested: { deep: true },
        arr: [1, 2, 3],
      };
      for (let i = 0; i < 40; i++) {
        bigPayload[`key_${i}`] = "x".repeat(500);
      }
      const sanitized = sanitizeAnalyticsParams(bigPayload);
      expect(Object.keys(sanitized).length).toBeLessThanOrEqual(20);
      expect(Object.prototype.hasOwnProperty.call(sanitized, "nested")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(sanitized, "arr")).toBe(false);
      expect(JSON.stringify(sanitized).length).toBeLessThanOrEqual(2048);
    });
  });

  describe("Routing & Home Navigation Fixes", () => {
    it("maps /devolvidos to search with tipo=devolvido instead of 404", () => {
      const parsed = parseCurrentRoute("/devolvidos");
      expect(parsed.routeKey).toBe("search");
      expect(parsed.searchParams.tipo).toBe("devolvido");
      expect(ROUTES.RETURNED).toBe("/devolvidos");
    });

    it("maps /ajuda and /manual to the dedicated User Manual view", () => {
      expect(parseCurrentRoute("/ajuda").routeKey).toBe("manual");
      expect(parseCurrentRoute("/manual").routeKey).toBe("manual");
      expect(parseCurrentRoute("/manual-do-usuario").routeKey).toBe("manual");
      expect(parseCurrentRoute("/suporte").routeKey).toBe("support");
    });
  });

  describe("User Manual (HTML/PDF), Delivery Doc & Zero Production Mocks", () => {
    it("includes all 11 mandatory sections in USER_MANUAL_SECTIONS", () => {
      expect(USER_MANUAL_VERSION).toBe("v1.10.13");
      expect(USER_MANUAL_SECTIONS).toHaveLength(11);
      const ids = USER_MANUAL_SECTIONS.map((s) => s.id);
      expect(ids).toEqual([
        "apresentacao",
        "perfis",
        "criar-conta",
        "login-senha",
        "consultar-objetos",
        "cadastrar-objeto",
        "reivindicar-devolucao",
        "qr-code",
        "analise-ia",
        "instalar-pwa",
        "suporte",
      ]);
    });

    it("provides a valid standalone HTML manual at public/manual-usuario.html", () => {
      const htmlPath = path.resolve(process.cwd(), "public/manual-usuario.html");
      expect(fs.existsSync(htmlPath)).toBe(true);
      const content = fs.readFileSync(htmlPath, "utf8");
      expect(content).toContain("Manual de Utilização — Localiza+");
      expect(content).toContain("Comunidade Externa");
      expect(content).toContain("QR Code");
      expect(content).toContain("PWA");
    });

    it("provides the professor delivery document at docs/ENTREGA_PROFESSOR_APS.md without invented credentials", () => {
      const docPath = path.resolve(process.cwd(), "docs/ENTREGA_PROFESSOR_APS.md");
      expect(fs.existsSync(docPath)).toBe(true);
      const content = fs.readFileSync(docPath, "utf8");
      expect(content).toContain("Documentação de Entrega — Localiza+ (APS)");
      expect(content).toContain("[PREENCHER PELO RESPONSÁVEL");
      expect(content).toContain("manual-usuario.html");
    });

    it("ensures TestBatteryManagerView no longer imports INITIAL_TEST_BATTERIES mock data", () => {
      const viewPath = path.resolve(process.cwd(), "src/components/TestBatteryManagerView.tsx");
      const content = fs.readFileSync(viewPath, "utf8");
      expect(content).not.toContain("INITIAL_TEST_BATTERIES");
    });
  });
});
