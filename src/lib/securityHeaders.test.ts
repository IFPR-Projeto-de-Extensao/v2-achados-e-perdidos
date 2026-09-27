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
    it("should include necessary script sources (self, inline, eval, google apis, firebase)", () => {
      const scriptSrc = CSP_DIRECTIVES["script-src"];
      expect(scriptSrc).toContain("'self'");
      expect(scriptSrc).toContain("'unsafe-inline'");
      expect(scriptSrc).toContain("'unsafe-eval'");
      expect(scriptSrc).toContain("https://apis.google.com");
      expect(scriptSrc).toContain("https://*.firebaseapp.com");
    });

    it("should allow Google Fonts in style-src and font-src", () => {
      expect(CSP_DIRECTIVES["style-src"]).toContain("https://fonts.googleapis.com");
      expect(CSP_DIRECTIVES["font-src"]).toContain("https://fonts.gstatic.com");
    });

    it("should allow image sources for avatars, qr codes, unsplash and firebase storage", () => {
      const imgSrc = CSP_DIRECTIVES["img-src"];
      expect(imgSrc).toContain("'self'");
      expect(imgSrc).toContain("data:");
      expect(imgSrc).toContain("blob:");
      expect(imgSrc).toContain("https://images.unsplash.com");
      expect(imgSrc).toContain("https://*.googleusercontent.com");
      expect(imgSrc).toContain("https://firebasestorage.googleapis.com");
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
