import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  SECURITY_HEADERS,
  PERMISSIONS_POLICY_DIRECTIVES,
  buildPermissionsPolicy,
} from "./securityHeaders";
import {
  PERMISSIONS_POLICY_HEADER,
  applySecurityHeaders,
  BASE_SECURITY_HEADERS,
} from "../../api/_lib/securityHeaders";

describe("SEC-07: Permissions-Policy Least Privilege & Security Header Audit", () => {
  describe("1. Permissions-Policy Directives & Least Privilege Analysis", () => {
    it("should allow camera only for self to support legitimate QR scanner and photo capture features", () => {
      expect(PERMISSIONS_POLICY_DIRECTIVES.camera).toEqual(["self"]);
      const serialized = buildPermissionsPolicy();
      expect(serialized).toContain("camera=(self)");
      expect(serialized).not.toContain("camera=*");
    });

    it("should allow microphone only for self to support voice search and dictation features", () => {
      expect(PERMISSIONS_POLICY_DIRECTIVES.microphone).toEqual(["self"]);
      const serialized = buildPermissionsPolicy();
      expect(serialized).toContain("microphone=(self)");
      expect(serialized).not.toContain("microphone=*");
    });

    it("should strictly disable geolocation with empty allowlist () as the app does not use browser GPS", () => {
      expect(PERMISSIONS_POLICY_DIRECTIVES.geolocation).toEqual([]);
      const serialized = buildPermissionsPolicy();
      expect(serialized).toContain("geolocation=()");
      expect(serialized).not.toContain("geolocation=(self)");
      expect(serialized).not.toContain("geolocation=*");
    });

    it("should strictly disable payment and usb with empty allowlist ()", () => {
      expect(PERMISSIONS_POLICY_DIRECTIVES.payment).toEqual([]);
      expect(PERMISSIONS_POLICY_DIRECTIVES.usb).toEqual([]);
      const serialized = buildPermissionsPolicy();
      expect(serialized).toContain("payment=()");
      expect(serialized).toContain("usb=()");
    });

    it("should produce the exact canonical Permissions-Policy header string", () => {
      const expected = "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()";
      expect(buildPermissionsPolicy()).toBe(expected);
      expect(SECURITY_HEADERS["Permissions-Policy"]).toBe(expected);
      expect(PERMISSIONS_POLICY_HEADER).toBe(expected);
    });
  });

  describe("2. Architectural Consistency Across Deployment Layers", () => {
    it("should ensure vercel.json headers match SECURITY_HEADERS exactly", () => {
      const vercelJsonPath = path.join(process.cwd(), "vercel.json");
      expect(fs.existsSync(vercelJsonPath)).toBe(true);
      const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, "utf-8"));

      const rootRule = vercelConfig.headers?.find((h: any) => h.source === "/(.*)");
      expect(rootRule).toBeDefined();

      const headersMap: Record<string, string> = {};
      rootRule.headers.forEach((h: { key: string; value: string }) => {
        headersMap[h.key] = h.value;
      });

      expect(headersMap["Permissions-Policy"]).toBe(SECURITY_HEADERS["Permissions-Policy"]);
      expect(headersMap["X-Content-Type-Options"]).toBe(SECURITY_HEADERS["X-Content-Type-Options"]);
      expect(headersMap["Referrer-Policy"]).toBe(SECURITY_HEADERS["Referrer-Policy"]);
      expect(headersMap["Strict-Transport-Security"]).toBe(SECURITY_HEADERS["Strict-Transport-Security"]);
    });

    it("should ensure server.ts sets identical Permissions-Policy in Express middleware", () => {
      const serverPath = path.join(process.cwd(), "server.ts");
      const serverCode = fs.readFileSync(serverPath, "utf-8");

      expect(serverCode).toContain(
        `res.header("Permissions-Policy", "${SECURITY_HEADERS["Permissions-Policy"]}");`
      );
      expect(serverCode).toContain('res.header("X-Content-Type-Options", "nosniff");');
      expect(serverCode).toContain('res.header("Referrer-Policy", "strict-origin-when-cross-origin");');
    });

    it("should ensure api/index.ts imports and applies fallback security headers", () => {
      const apiIndexPath = path.join(process.cwd(), "api/index.ts");
      const apiIndexCode = fs.readFileSync(apiIndexPath, "utf-8");

      expect(apiIndexCode).toMatch(/import \{ applySecurityHeaders \} from "\.\/_lib\/securityHeaders(\.js)?";/);
      expect(apiIndexCode).toContain("applySecurityHeaders(res);");
    });
  });

  describe("3. Serverless Helper Defense-in-Depth (api/_lib/securityHeaders.ts)", () => {
    it("should apply all base security headers to a mock response object", () => {
      const mockHeaders: Record<string, string> = {};
      const mockRes = {
        setHeader: (k: string, v: string) => {
          mockHeaders[k] = v;
        },
      };

      applySecurityHeaders(mockRes);

      expect(mockHeaders["Permissions-Policy"]).toBe(
        "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()"
      );
      expect(mockHeaders["X-Content-Type-Options"]).toBe("nosniff");
      expect(mockHeaders["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
      expect(mockHeaders["X-XSS-Protection"]).toBe("1; mode=block");
      expect(mockHeaders["Strict-Transport-Security"]).toBeUndefined();
    });

    it("should include HSTS when isSecure is true", () => {
      const mockHeaders: Record<string, string> = {};
      const mockRes = {
        setHeader: (k: string, v: string) => {
          mockHeaders[k] = v;
        },
      };

      applySecurityHeaders(mockRes, true);

      expect(mockHeaders["Strict-Transport-Security"]).toBe(
        "max-age=31536000; includeSubDomains"
      );
      expect(mockHeaders["Permissions-Policy"]).toBe(
        "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()"
      );
    });

    it("should handle mock objects with .header() instead of .setHeader()", () => {
      const mockHeaders: Record<string, string> = {};
      const mockRes = {
        header: (k: string, v: string) => {
          mockHeaders[k] = v;
        },
      };

      applySecurityHeaders(mockRes);

      expect(mockHeaders["Permissions-Policy"]).toBe(
        "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()"
      );
    });

    it("should safely handle null or invalid response objects without throwing", () => {
      expect(() => applySecurityHeaders(null)).not.toThrow();
      expect(() => applySecurityHeaders({})).not.toThrow();
      expect(() => applySecurityHeaders(undefined)).not.toThrow();
    });
  });

  describe("4. Preservation of Pre-existing Security Headers", () => {
    it("should maintain CSP integrity without unsafe-inline or unsafe-eval in scripts", () => {
      const csp = SECURITY_HEADERS["Content-Security-Policy"];
      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
      expect(csp).not.toMatch(/script-src[^;]*'unsafe-eval'/);
    });

    it("should maintain nosniff, strict-origin-when-cross-origin, and HSTS", () => {
      expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
      expect(SECURITY_HEADERS["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
      expect(SECURITY_HEADERS["Strict-Transport-Security"]).toBe(
        "max-age=31536000; includeSubDomains"
      );
      expect(SECURITY_HEADERS["X-XSS-Protection"]).toBe("1; mode=block");
    });
  });
});
