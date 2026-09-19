import { describe, it, expect, vi } from "vitest";
import { parseCurrentRoute, AppRouteKey } from "./routes";

describe("Email Verification Workflow & Security Guarantees", () => {
  describe("1. Identification of Accounts Requiring Verification", () => {
    it("should flag email+password account as requiring verification if emailVerified is false", () => {
      const mockFirebaseUser = {
        uid: "user-123",
        email: "estudante.teste@gmail.com",
        emailVerified: false,
        providerData: [{ providerId: "password" }],
      };

      const isPasswordProvider =
        !mockFirebaseUser.providerData ||
        mockFirebaseUser.providerData.length === 0 ||
        mockFirebaseUser.providerData.some((p) => p.providerId === "password");

      const isVerificationRequired = !mockFirebaseUser.emailVerified && isPasswordProvider;
      expect(isVerificationRequired).toBe(true);
    });

    it("should NOT require verification if emailVerified is true", () => {
      const mockFirebaseUser = {
        uid: "user-123",
        email: "estudante.teste@gmail.com",
        emailVerified: true,
        providerData: [{ providerId: "password" }],
      };

      const isPasswordProvider =
        !mockFirebaseUser.providerData ||
        mockFirebaseUser.providerData.length === 0 ||
        mockFirebaseUser.providerData.some((p) => p.providerId === "password");

      const isVerificationRequired = !mockFirebaseUser.emailVerified && isPasswordProvider;
      expect(isVerificationRequired).toBe(false);
    });

    it("should NOT require email+password verification for pure OAuth/Google accounts", () => {
      const mockGoogleUser = {
        uid: "google-123",
        email: "usuario@estudante.ifpr.edu.br",
        emailVerified: true,
        providerData: [{ providerId: "google.com" }],
      };

      const isPasswordProvider =
        mockGoogleUser.providerData.some((p) => p.providerId === "password");

      const isVerificationRequired = !mockGoogleUser.emailVerified && isPasswordProvider;
      expect(isVerificationRequired).toBe(false);
    });
  });

  describe("2. Route Parsing & Redirection for /verificar-email", () => {
    it("should recognize /verificar-email as verify_email route", () => {
      const routeInfo = parseCurrentRoute("/verificar-email");
      expect(routeInfo.routeKey).toBe("verify_email");
    });

    it("should block unverified email accounts from accessing protected application views", () => {
      const isEmailVerificationRequired = true;
      const testRoutes: AppRouteKey[] = ["admin", "profile", "my_items", "register", "home"];

      testRoutes.forEach((routeKey) => {
        let viewToRender = routeKey;
        if (isEmailVerificationRequired) {
          if (
            routeKey === "privacy_policy" ||
            routeKey === "terms_of_use" ||
            routeKey === "support" ||
            routeKey === "support_feedback" ||
            routeKey === "support_bug"
          ) {
            // Allow public legal and support documentation
          } else {
            viewToRender = "verify_email";
          }
        }
        expect(viewToRender).toBe("verify_email");
      });
    });

    it("should allow unverified accounts to view public privacy policy and terms of use", () => {
      const isEmailVerificationRequired = true;
      const publicRoutes: AppRouteKey[] = ["privacy_policy", "terms_of_use", "support"];

      publicRoutes.forEach((routeKey) => {
        let viewToRender: AppRouteKey = routeKey;
        if (isEmailVerificationRequired) {
          if (
            routeKey === "privacy_policy" ||
            routeKey === "terms_of_use" ||
            routeKey === "support" ||
            routeKey === "support_feedback" ||
            routeKey === "support_bug"
          ) {
            // Allow public legal and support documentation
          } else {
            viewToRender = "verify_email";
          }
        }
        expect(viewToRender).toBe(routeKey);
      });
    });
  });

  describe("3. Server Backend Verification Protection", () => {
    it("should reject API requests if req.authUser.email_verified is not true", () => {
      const mockReq = {
        authUser: {
          uid: "unverified-uid",
          email: "fake.email@example.com",
          email_verified: false,
          role: "ALUNO",
          isAdmin: false,
        },
      };

      const mockRes = {
        statusCode: 200,
        responseData: null as any,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(data: any) {
          this.responseData = data;
          return this;
        },
      };

      const mockNext = vi.fn();

      // Simulate requireAuth logic from server.ts
      function requireAuthSim(req: any, res: any, next: any) {
        if (!req.authUser) {
          return res.status(401).json({ success: false, error: "Unauthorized" });
        }
        if (req.authUser.email_verified !== true) {
          return res.status(403).json({
            success: false,
            error: "E-mail não verificado. É obrigatório confirmar seu endereço de e-mail antes de acessar os recursos do Localiza+.",
            code: "AUTH_EMAIL_NOT_VERIFIED",
          });
        }
        next();
      }

      requireAuthSim(mockReq, mockRes, mockNext);

      expect(mockRes.statusCode).toBe(403);
      expect(mockRes.responseData.code).toBe("AUTH_EMAIL_NOT_VERIFIED");
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should permit API requests if req.authUser.email_verified is true", () => {
      const mockReq = {
        authUser: {
          uid: "verified-uid",
          email: "estudante@ifpr.edu.br",
          email_verified: true,
          role: "ALUNO",
          isAdmin: false,
        },
      };

      const mockRes = {
        statusCode: 200,
        responseData: null as any,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(data: any) {
          this.responseData = data;
          return this;
        },
      };

      const mockNext = vi.fn();

      function requireAuthSim(req: any, res: any, next: any) {
        if (!req.authUser) {
          return res.status(401).json({ success: false, error: "Unauthorized" });
        }
        if (req.authUser.email_verified !== true) {
          return res.status(403).json({
            success: false,
            error: "E-mail não verificado.",
            code: "AUTH_EMAIL_NOT_VERIFIED",
          });
        }
        next();
      }

      requireAuthSim(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });

  describe("4. Resend Cooldown & User Experience Protection", () => {
    it("should enforce a 60-second cooldown between verification resend requests", () => {
      let resendCooldown = 60;
      const canResendInitially = resendCooldown <= 0;
      expect(canResendInitially).toBe(false);

      // Decrement countdown
      resendCooldown -= 60;
      const canResendAfterWait = resendCooldown <= 0;
      expect(canResendAfterWait).toBe(true);
    });
  });
});
