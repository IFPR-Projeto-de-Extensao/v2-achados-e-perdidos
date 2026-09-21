import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Firestore Security Rules - Audit & Privilege Escalation Hardening", () => {
  const rulesPath = path.resolve(process.cwd(), "firestore.rules");
  const rulesContent = fs.readFileSync(rulesPath, "utf-8");

  it("should enforce default deny catch-all at root", () => {
    expect(rulesContent).toContain("match /{document=**} {");
    expect(rulesContent).toContain("allow read, write: if false;");
  });

  describe("Scenario A: Aluno trying to become Admin", () => {
    it("should reject creation of Admin role by non-admin authenticated users", () => {
      // In create rule for /users/{userId}
      expect(rulesContent).toMatch(/match \/users\/\{userId\}/);
      expect(rulesContent).toContain("incoming().role == 'ALUNO'");
    });

    it("should prevent updating own role from ALUNO to ADMIN", () => {
      // User update requires incoming().role == existing().role
      expect(rulesContent).toContain("incoming().role == existing().role");
    });
  });

  describe("Scenario B: Aluno trying to become Servidor", () => {
    it("should reject setting role to SERVIDOR on creation for non-institutional accounts", () => {
      expect(rulesContent).toContain("(incoming().role == 'SERVIDOR' && isServidor())");
    });

    it("should prevent updating role to SERVIDOR unless performed by an ADMIN", () => {
      expect(rulesContent).toContain("incoming().role == existing().role");
    });
  });

  describe("Scenario C: Servidor trying to become Admin", () => {
    it("should disallow Servidor self-elevation to Admin", () => {
      // Servidor is not Admin, so only non-admin update branch applies:
      // incoming().role == existing().role ensures role remains SERVIDOR
      expect(rulesContent).toContain("isAdmin() ||");
      expect(rulesContent).toContain("incoming().role == existing().role");
    });
  });

  describe("Scenario D: User trying to modify another user's role", () => {
    it("should restrict non-admin users to updating ONLY their own document (request.auth.uid == userId)", () => {
      expect(rulesContent).toContain("request.auth.uid == userId");
    });
  });

  describe("Scenario E: User trying to modify administrative fields (e.g. approvalStatus)", () => {
    it("should strictly preserve approvalStatus unless updater is Admin", () => {
      expect(rulesContent).toContain("incoming().approvalStatus == existing().approvalStatus");
    });

    it("should force new user registration to PENDENTE status", () => {
      expect(rulesContent).toContain("incoming().approvalStatus == 'PENDENTE'");
    });
  });

  describe("Scenario F: User trying to spoof another user's UID", () => {
    it("should enforce incoming ID and email match auth credentials on user creation", () => {
      expect(rulesContent).toContain("incoming().id == userId");
      expect(rulesContent).toContain("incoming().email == request.auth.token.email");
    });

    it("should enforce author identity in items registration (registeredByUserId == request.auth.uid)", () => {
      expect(rulesContent).toContain("incoming().registeredByUserId == request.auth.uid");
    });

    it("should enforce claimer identity in claims (claimerId == request.auth.uid)", () => {
      expect(rulesContent).toContain("incoming().claimerId == request.auth.uid");
    });

    it("should enforce actor identity in audit logs (actorId == request.auth.uid)", () => {
      expect(rulesContent).toContain("incoming().actorId == request.auth.uid");
    });
  });

  describe("Least Privilege & Personal Data Protection (/users)", () => {
    it("should block indiscriminate user directory listing by students", () => {
      expect(rulesContent).toMatch(/allow list: if isAdmin\(\) \|\|\s*\(isServidor\(\) && isAccountActive\(\)\) \|\|\s*\(isSignedIn\(\) && isAccountActive\(\) && resource\.data\.email == request\.auth\.token\.email\);/);
    });

    it("should allow individual users to only read their own profile doc", () => {
      expect(rulesContent).toMatch(/allow get: if isAuthUser\(userId\) \|\| \(isServidor\(\) && isAccountActive\(\)\) \|\| isAdmin\(\);/);
    });
  });

  describe("Audit Logs & Activity Logs Immutability", () => {
    it("should strictly forbid updates and deletions on audit logs", () => {
      expect(rulesContent).toMatch(/match \/audit_logs\/\{logId\}[\s\S]*?allow update: if false;[\s\S]*?allow delete: if false;/);
    });

    it("should strictly forbid updates and deletions on activity logs", () => {
      expect(rulesContent).toMatch(/match \/activity_logs\/\{logId\}[\s\S]*?allow update: if false;[\s\S]*?allow delete: if false;/);
    });

    it("should prevent students from forging actorRole in audit logs", () => {
      expect(rulesContent).toContain("incoming().actorRole == 'ALUNO'");
    });
  });

  describe("Root Admin & Institutional Integrity", () => {
    it("should recognize paulocauan39@gmail.com as root admin without client manipulation", () => {
      expect(rulesContent).toContain("paulocauan39@gmail.com");
      expect(rulesContent).toContain("function isRootAdmin()");
    });

    it("should prevent deletion of an admin's own active account", () => {
      expect(rulesContent).toContain("allow delete: if isAdmin() && request.auth.uid != userId;");
    });
  });

  describe("System Metrics Hardening (/system_metrics)", () => {
    it("should restrict collection listing to administrators", () => {
      expect(rulesContent).toMatch(/match \/system_metrics\/\{metricId\}[\s\S]*?allow list: if isAdmin\(\);/);
    });

    it("should strictly limit writes to the heartbeat metric document by signed in users", () => {
      expect(rulesContent).toContain("allow create, update: if isSignedIn() && metricId == 'heartbeat';");
    });

    it("should only allow administrators to delete system metrics", () => {
      expect(rulesContent).toMatch(/match \/system_metrics\/\{metricId\}[\s\S]*?allow delete: if isAdmin\(\);/);
    });
  });

  describe("Support Tickets Protection & Identity Spoofing Prevention (/support_tickets)", () => {
    it("should only allow administrators to list all support tickets", () => {
      expect(rulesContent).toMatch(/match \/support_tickets\/\{ticketId\}[\s\S]*?allow list: if isAdmin\(\);/);
    });

    it("should prevent cross-user ticket inspection (users can only get their own ticket)", () => {
      expect(rulesContent).toMatch(/allow get: if isSignedIn\(\) && \(resource\.data\.userId == request\.auth\.uid \|\| isAdmin\(\)\);/);
    });

    it("should prevent authenticated users from spoofing another userId or author email", () => {
      expect(rulesContent).toContain("incoming().userId == request.auth.uid");
      expect(rulesContent).toContain("incoming().email == request.auth.token.email");
    });

    it("should disallow unauthenticated visitors from setting an arbitrary userId", () => {
      expect(rulesContent).toContain("(!('userId' in incoming()) || incoming().userId == null || incoming().userId == '')");
    });

    it("should disallow non-admins from updating or deleting support tickets", () => {
      expect(rulesContent).toMatch(/match \/support_tickets\/\{ticketId\}[\s\S]*?allow update, delete: if isAdmin\(\);/);
    });
  });
});
