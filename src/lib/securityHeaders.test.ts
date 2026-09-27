import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  SECURITY_HEADERS,
  CSP_DIRECTIVES,
  buildContentSecurityPolicy,
} from "./securityHeaders";

describe("Security Hardening: Security Headers & Source Maps (Correção 11)", () => {
  describe("Security Headers Integrity", () => {
    it("should enforce X-Content-Type-Options: nosniff to prevent MIME type sniffing", () => {
      expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
    });

    it("should enforce Referrer-Policy: strict-origin-when-cross-origin", () => {
      expect(SECURITY_HEADERS["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    });

    it("should enforce X-XSS-Protection: 1; mode=block for legacy browser defense", () => {
      expect(SECURITY_HEADERS["X-XSS-Protection"]).toBe("1; mode=block");
    });

    it("should configure Strict-Transport-Security appropriately without automatic preload", () => {
      expect(SECURITY_HEADERS["Strict-Transport-Security"]).toBe(
        "max-age=31536000; includeSubDomains"
      );
      expect(SECURITY_HEADERS["Strict-Transport-Security"]).not.toContain("preload");
    });

    it("should NOT set X-Frame-Options: DENY or SAMEORIGIN which would break AI Studio iframe preview", () => {
      expect((SECURITY_HEADERS as any)["X-Frame-Options"]).toBeUndefined();
    });
  });

  describe("Content-Security-Policy (CSP) Architecture", () => {
    it("should include necessary script sources and strictly exclude unsafe-inline and unsafe-eval", () => {
      const scriptSrc = CSP_DIRECTIVES["script-src"];
      expect(scriptSrc).toContain("'self'");
      expect(scriptSrc).not.toContain("'unsafe-inline'");
      expect(scriptSrc).not.toContain("'unsafe-eval'");
      expect(scriptSrc).toContain("https://apis.google.com");
      expect(scriptSrc).toContain("https://*.firebaseapp.com");
      expect(scriptSrc).toContain("https://*.googleapis.com");
    });

    it("should allow Google Fonts in style-src and font-src", () => {
      expect(CSP_DIRECTIVES["style-src"]).toContain("https://fonts.googleapis.com");
      expect(CSP_DIRECTIVES["font-src"]).toContain("https://fonts.gstatic.com");
    });

    it("should explicitly authorize DiceBear avatars in the img-src directive of the CSP", () => {
      const imgSrc = CSP_DIRECTIVES["img-src"];
      // Validates that DiceBear API is strictly present in the runtime CSP configuration
      expect(imgSrc).toContain("https://api.dicebear.com");
      expect(imgSrc).toContain("https://*.dicebear.com");
      
      const serializedCsp = buildContentSecurityPolicy();
      expect(serializedCsp).toMatch(/img-src[^;]*https:\/\/api\.dicebear\.com/);
      expect(SECURITY_HEADERS["Content-Security-Policy"]).toMatch(/img-src[^;]*https:\/\/api\.dicebear\.com/);
    });

    it("should allow image sources for avatars, qr codes, unsplash, dicebear, and firebase storage", () => {
      const imgSrc = CSP_DIRECTIVES["img-src"];
      expect(imgSrc).toContain("'self'");
      expect(imgSrc).toContain("data:");
      expect(imgSrc).toContain("blob:");
      expect(imgSrc).toContain("https://images.unsplash.com");
      expect(imgSrc).toContain("https://api.dicebear.com");
      expect(imgSrc).toContain("https://*.dicebear.com");
      expect(imgSrc).toContain("https://*.googleusercontent.com");
      expect(imgSrc).toContain("https://firebasestorage.googleapis.com");
    });

    it("should enforce script-src directive protections, exclude unsafe-inline and unsafe-eval, and restrict script execution to authorized origins", () => {
      const scriptSrc = CSP_DIRECTIVES["script-src"];
      
      // 1. Validates that script-src is defined and present
      expect(scriptSrc).toBeDefined();
      expect(Array.isArray(scriptSrc)).toBe(true);

      // 2. Validates authorized 1st party and trusted infrastructure origins
      expect(scriptSrc).toContain("'self'");
      expect(scriptSrc).toContain("https://apis.google.com");
      expect(scriptSrc).toContain("https://*.firebaseapp.com");
      expect(scriptSrc).toContain("https://*.googleapis.com");

      // 3. Strict exclusion of unsafe-inline and unsafe-eval across production policies
      expect(scriptSrc).not.toContain("'unsafe-inline'");
      expect(scriptSrc).not.toContain("'unsafe-eval'");

      // 4. Prohibits arbitrary wildcards, insecure protocols, or untrusted external CDNs
      expect(scriptSrc).not.toContain("*");
      expect(scriptSrc).not.toContain("http:");
      expect(scriptSrc).not.toContain("https:");
      expect(scriptSrc.some((src) => src.includes("cdn.jsdelivr.net") || src.includes("unpkg.com"))).toBe(false);

      // 5. Validates that the serialized CSP header contains the full strict script-src directive
      const serializedCsp = buildContentSecurityPolicy();
      expect(serializedCsp).toContain("script-src 'self' https://apis.google.com https://*.firebaseapp.com https://*.googleapis.com");
      expect(serializedCsp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
      expect(serializedCsp).not.toMatch(/script-src[^;]*'unsafe-eval'/);
    });

    it("should verify HTML entrypoints and printable documents in components do not rely on inline onclick or inline script tags", () => {
      const indexHtmlPath = path.join(process.cwd(), "index.html");
      const offlineHtmlPath = path.join(process.cwd(), "public/offline.html");
      const itemDetailPath = path.join(process.cwd(), "src/components/ItemDetailModal.tsx");
      const itemCardPath = path.join(process.cwd(), "src/components/ItemCard.tsx");

      const indexHtmlContent = fs.readFileSync(indexHtmlPath, "utf-8");
      const offlineHtmlContent = fs.readFileSync(offlineHtmlPath, "utf-8");
      const itemDetailContent = fs.readFileSync(itemDetailPath, "utf-8");
      const itemCardContent = fs.readFileSync(itemCardPath, "utf-8");

      // index.html should only have external script module tag, no inline script blocks
      expect(indexHtmlContent).not.toMatch(/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/);

      // offline.html should use external /offline.js
      expect(offlineHtmlContent).not.toMatch(/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/);

      // Components should not inject inline onclick or script tags into popup DOM
      expect(itemDetailContent).not.toMatch(/onclick\s*=\s*["']window\.print\(\)["']/);
      expect(itemDetailContent).not.toMatch(/<script>[\s\S]*?window\.print[\s\S]*?<\/script>/);

      expect(itemCardContent).not.toMatch(/onclick\s*=\s*["']window\.print\(\)["']/);
      expect(itemCardContent).not.toMatch(/<script>[\s\S]*?window\.print[\s\S]*?<\/script>/);
    });

    it("should allow connect-src for Firestore, Auth, Gemini API, and WebSockets", () => {
      const connectSrc = CSP_DIRECTIVES["connect-src"];
      expect(connectSrc).toContain("'self'");
      expect(connectSrc).toContain("https://firestore.googleapis.com");
      expect(connectSrc).toContain("https://identitytoolkit.googleapis.com");
      expect(connectSrc).toContain("https://securetoken.googleapis.com");
      expect(connectSrc).toContain("https://generativelanguage.googleapis.com");
      expect(connectSrc).toContain("wss://*.firebaseio.com");
    });

    it("should allow frame-ancestors for AI Studio preview while restricting unauthorized embedding", () => {
      const frameAncestors = CSP_DIRECTIVES["frame-ancestors"];
      expect(frameAncestors).toContain("'self'");
      expect(frameAncestors).toContain("https://*.google.com");
      expect(frameAncestors).toContain("https://*.google.dev");
      expect(frameAncestors).toContain("https://*.run.app");
      expect(frameAncestors).toContain("https://*.firebaseapp.com");
    });

    it("should restrict object-src to none and base-uri to self", () => {
      expect(CSP_DIRECTIVES["object-src"]).toEqual(["'none'"]);
      expect(CSP_DIRECTIVES["base-uri"]).toEqual(["'self'"]);
      expect(CSP_DIRECTIVES["form-action"]).toEqual(["'self'"]);
    });

    it("should build a valid serialized CSP string", () => {
      const csp = buildContentSecurityPolicy();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp.endsWith(";")).toBe(true);
    });
  });

  describe("Configuration Files Validation", () => {
    it("should verify vercel.json contains security headers matching specification", () => {
      const vercelJsonPath = path.join(process.cwd(), "vercel.json");
      expect(fs.existsSync(vercelJsonPath)).toBe(true);

      const vercelContent = JSON.parse(fs.readFileSync(vercelJsonPath, "utf-8"));
      expect(vercelContent.headers).toBeDefined();
      expect(Array.isArray(vercelContent.headers)).toBe(true);

      const rootHeaders = vercelContent.headers.find(
        (h: any) => h.source === "/(.*)"
      );
      expect(rootHeaders).toBeDefined();

      const headerMap: Record<string, string> = {};
      rootHeaders.headers.forEach((h: { key: string; value: string }) => {
        headerMap[h.key] = h.value;
      });

      expect(headerMap["X-Content-Type-Options"]).toBe("nosniff");
      expect(headerMap["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
      expect(headerMap["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains");
      expect(headerMap["Content-Security-Policy"]).toBeDefined();
      expect(headerMap["Content-Security-Policy"]).toContain("default-src 'self'");
      expect(headerMap["Content-Security-Policy"]).toContain("https://api.dicebear.com");
      expect(headerMap["X-Frame-Options"]).toBeUndefined();
    });

    it("should verify vite.config.ts disables sourcemaps in production builds", () => {
      const viteConfigPath = path.join(process.cwd(), "vite.config.ts");
      expect(fs.existsSync(viteConfigPath)).toBe(true);

      const viteConfigContent = fs.readFileSync(viteConfigPath, "utf-8");
      expect(viteConfigContent).toContain("sourcemap: mode === 'development'");
      expect(viteConfigContent).not.toMatch(/sourcemap:\s*true/);
    });
  });
});
