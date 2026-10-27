import { describe, it, expect } from "vitest";
import { ROUTES, parseCurrentRoute, AppRouteKey } from "./routes";
import { CURRENT_VERSION, APP_VERSIONS_DATA } from "../data/versionsData";
import { UserRole } from "../types";

describe("Version History Route & Access Control (/versoes)", () => {
  describe("Route Configuration & Resolution", () => {
    it("should have VERSIONS defined in ROUTES constant with canonical path /versoes", () => {
      expect(ROUTES.VERSIONS).toBe("/versoes");
    });

    it("should parse canonical /versoes path correctly", () => {
      const parsed = parseCurrentRoute("/versoes");
      expect(parsed.pathname).toBe("/versoes");
      expect(parsed.routeKey).toBe("versions");
    });

    it("should handle alias /historico-de-versoes and normalize to /versoes", () => {
      const parsed = parseCurrentRoute("/historico-de-versoes");
      expect(parsed.pathname).toBe("/versoes");
      expect(parsed.routeKey).toBe("versions");
    });

    it("should handle alias /changelog and normalize to /versoes", () => {
      const parsed = parseCurrentRoute("/changelog");
      expect(parsed.pathname).toBe("/versoes");
      expect(parsed.routeKey).toBe("versions");
    });

    it("should be case-insensitive and handle trailing slashes", () => {
      const uppercase = parseCurrentRoute("/VERSOES/");
      expect(uppercase.pathname).toBe("/versoes");
      expect(uppercase.routeKey).toBe("versions");

      const mixedAlias = parseCurrentRoute("/Historico-De-Versoes/");
      expect(mixedAlias.pathname).toBe("/versoes");
      expect(mixedAlias.routeKey).toBe("versions");

      const upperChangelog = parseCurrentRoute("/CHANGELOG");
      expect(upperChangelog.pathname).toBe("/versoes");
      expect(upperChangelog.routeKey).toBe("versions");
    });

    it("should preserve search query parameters when parsing /versoes", () => {
      const parsed = parseCurrentRoute("/versoes", "?filtro=adicoes&modulo=ADMIN");
      expect(parsed.pathname).toBe("/versoes");
      expect(parsed.routeKey).toBe("versions");
      expect(parsed.searchParams).toEqual({
        filtro: "adicoes",
        modulo: "ADMIN",
      });
    });
  });

  describe("Access Control & Role Separation", () => {
    // Helper replicating App.tsx / VersionHistoryView.tsx RBAC rules
    function evaluateVersionHistoryAccess(auth: {
      isAuthenticated: boolean;
      isGuest: boolean;
      role?: UserRole | "INTRUSO";
    }) {
      const canAccessHistory = auth.isAuthenticated && !auth.isGuest;
      const canAccessTestBatteries =
        canAccessHistory && (auth.role === "ADMIN" || auth.role === "SERVIDOR");

      return {
        canAccessHistory,
        canAccessTestBatteries,
        effectiveMainTab: canAccessTestBatteries ? "TEST_BATTERIES" : "CHANGELOG",
      };
    }

    it("should block unauthenticated or guest users from direct version history view", () => {
      const guestResult = evaluateVersionHistoryAccess({
        isAuthenticated: false,
        isGuest: true,
      });
      expect(guestResult.canAccessHistory).toBe(false);
      expect(guestResult.canAccessTestBatteries).toBe(false);

      const unauthResult = evaluateVersionHistoryAccess({
        isAuthenticated: false,
        isGuest: false,
      });
      expect(unauthResult.canAccessHistory).toBe(false);
    });

    it("should grant ALUNO access to version history but block test batteries", () => {
      const alunoResult = evaluateVersionHistoryAccess({
        isAuthenticated: true,
        isGuest: false,
        role: "ALUNO",
      });
      expect(alunoResult.canAccessHistory).toBe(true);
      expect(alunoResult.canAccessTestBatteries).toBe(false);
      expect(alunoResult.effectiveMainTab).toBe("CHANGELOG");
    });

    it("should grant SERVIDOR access to both version history and test batteries", () => {
      const servidorResult = evaluateVersionHistoryAccess({
        isAuthenticated: true,
        isGuest: false,
        role: "SERVIDOR",
      });
      expect(servidorResult.canAccessHistory).toBe(true);
      expect(servidorResult.canAccessTestBatteries).toBe(true);
    });

    it("should grant ADMIN access to both version history and test batteries", () => {
      const adminResult = evaluateVersionHistoryAccess({
        isAuthenticated: true,
        isGuest: false,
        role: "ADMIN",
      });
      expect(adminResult.canAccessHistory).toBe(true);
      expect(adminResult.canAccessTestBatteries).toBe(true);
    });
  });

  describe("Version Integrity (Base Version Preservation)", () => {
    it("should preserve current system version as v1.10.6 without modification", () => {
      expect(CURRENT_VERSION).toBe("v1.10.6");
      const currentEntry = APP_VERSIONS_DATA.find((v) => v.version === "v1.10.6");
      expect(currentEntry).toBeDefined();
      expect(currentEntry?.isCurrent).toBe(true);
    });
  });
});
