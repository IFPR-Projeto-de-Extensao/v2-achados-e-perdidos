import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

interface SecurityContext {
  auth: {
    uid: string;
    email?: string;
    role?: "ALUNO" | "SERVIDOR" | "ADMIN";
    approvalStatus?: "APROVADO" | "PENDENTE" | "REJEITADO";
    status?: "ATIVO" | "BLOQUEADO" | "INATIVO";
  } | null;
  incomingData?: any;
  operation: "get" | "list" | "create" | "update" | "delete";
}

function evaluateTestErrorLogsRule(ctx: SecurityContext): { allowed: boolean; reason?: string } {
  const { auth, incomingData, operation } = ctx;

  const isSignedIn = auth !== null && Boolean(auth.uid);
  const isAccountActive =
    isSignedIn &&
    auth.approvalStatus !== "PENDENTE" &&
    auth.approvalStatus !== "REJEITADO" &&
    auth.status !== "BLOQUEADO" &&
    auth.status !== "INATIVO";

  const isAdmin = isSignedIn && auth.role === "ADMIN";
  const isServidor = isSignedIn && auth.role === "SERVIDOR";

  // READ (get, list)
  if (operation === "get" || operation === "list") {
    if (isAdmin || isServidor) {
      return { allowed: true };
    }
    return { allowed: false, reason: "READ_DENIED_ADMIN_OR_SERVIDOR_ONLY" };
  }

  // UPDATE
  if (operation === "update") {
    return { allowed: false, reason: "UPDATE_DENIED_IMMUTABLE" };
  }

  // DELETE
  if (operation === "delete") {
    if (isAdmin) {
      return { allowed: true };
    }
    return { allowed: false, reason: "DELETE_DENIED_ADMIN_ONLY" };
  }

  // CREATE
  if (operation === "create") {
    if (!isSignedIn) {
      return { allowed: false, reason: "UNAUTHENTICATED" };
    }
    if (!isAccountActive) {
      return { allowed: false, reason: "ACCOUNT_INACTIVE_OR_UNAPPROVED" };
    }

    if (!incomingData || typeof incomingData !== "object") {
      return { allowed: false, reason: "INVALID_PAYLOAD" };
    }

    const { batteryId, testId, action, errorMessage, timestamp, userId, userEmail } = incomingData;

    if (typeof batteryId !== "string" || batteryId.length === 0 || batteryId.length > 100) {
      return { allowed: false, reason: "INVALID_BATTERY_ID" };
    }
    if (typeof testId !== "string" || testId.length === 0 || testId.length > 100) {
      return { allowed: false, reason: "INVALID_TEST_ID" };
    }
    if (typeof action !== "string" || action.length === 0 || action.length > 50) {
      return { allowed: false, reason: "INVALID_ACTION" };
    }
    if (typeof errorMessage !== "string" || errorMessage.length === 0 || errorMessage.length > 5000) {
      return { allowed: false, reason: "INVALID_ERROR_MESSAGE" };
    }
    if (typeof timestamp !== "string" || timestamp.length === 0) {
      return { allowed: false, reason: "INVALID_TIMESTAMP" };
    }

    // Spoofing Protection
    if (userId !== undefined && userId !== auth.uid) {
      return { allowed: false, reason: "SPOOFED_USER_ID" };
    }
    if (userEmail !== undefined && auth.email && userEmail !== auth.email) {
      return { allowed: false, reason: "SPOOFED_USER_EMAIL" };
    }

    return { allowed: true };
  }

  return { allowed: false, reason: "UNKNOWN_OPERATION" };
}

describe("Auditoria de Segurança — Coleção /test_error_logs", () => {
  const rulesPath = path.join(process.cwd(), "firestore.rules");
  const rulesContent = fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath, "utf-8") : "";

  describe("1. Inspeção Estática do Arquivo firestore.rules", () => {
    it("deve conter a regra da coleção /test_error_logs", () => {
      expect(rulesContent).toContain("match /test_error_logs/{logId}");
    });

    it("NÃO deve conter allow create: if true", () => {
      const collectionBlock = rulesContent.match(/match \/test_error_logs\/\{logId\}[\s\S]*?\n    \}/)?.[0] || "";
      expect(collectionBlock).not.toMatch(/allow\s+create\s*:\s*if\s+true\s*;/);
      expect(collectionBlock).not.toMatch(/allow\s+write\s*:\s*if\s+true\s*;/);
      expect(collectionBlock).not.toMatch(/allow\s+read\s*:\s*if\s+true\s*;/);
    });

    it("deve restringir leitura exclusivamente a Admin e Servidor", () => {
      const collectionBlock = rulesContent.match(/match \/test_error_logs\/\{logId\}[\s\S]*?\n    \}/)?.[0] || "";
      expect(collectionBlock).toMatch(/allow\s+get,\s*list\s*:\s*if\s+isAdmin\(\)\s*\|\|\s*isServidor\(\);/);
    });

    it("deve declarar imutabilidade estrita (update = false)", () => {
      const collectionBlock = rulesContent.match(/match \/test_error_logs\/\{logId\}[\s\S]*?\n    \}/)?.[0] || "";
      expect(collectionBlock).toMatch(/allow\s+update\s*:\s*if\s+false;/);
    });

    it("deve restringir exclusão exclusivamente a Administradores", () => {
      const collectionBlock = rulesContent.match(/match \/test_error_logs\/\{logId\}[\s\S]*?\n    \}/)?.[0] || "";
      expect(collectionBlock).toMatch(/allow\s+delete\s*:\s*if\s+isAdmin\(\);/);
    });
  });

  describe("2. Cenários de Acesso Não Autenticado (Público / Anônimo)", () => {
    it("deve NEGAR create para visitante anônimo", () => {
      const res = evaluateTestErrorLogsRule({
        operation: "create",
        auth: null,
        incomingData: {
          batteryId: "BT-AUTH-01",
          testId: "TC-01",
          action: "SAVE_TEST_CASE",
          errorMessage: "Network error",
          timestamp: new Date().toISOString(),
        },
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe("UNAUTHENTICATED");
    });

    it("deve NEGAR read (get/list) para visitante anônimo", () => {
      expect(evaluateTestErrorLogsRule({ operation: "get", auth: null }).allowed).toBe(false);
      expect(evaluateTestErrorLogsRule({ operation: "list", auth: null }).allowed).toBe(false);
    });

    it("deve NEGAR update e delete para visitante anônimo", () => {
      expect(evaluateTestErrorLogsRule({ operation: "update", auth: null }).allowed).toBe(false);
      expect(evaluateTestErrorLogsRule({ operation: "delete", auth: null }).allowed).toBe(false);
    });
  });

  describe("3. Cenários de Usuário Autenticado Comum (Aluno / Testador)", () => {
    const studentAuth = {
      uid: "student-uid-100",
      email: "aluno@estudantes.ifpr.edu.br",
      role: "ALUNO" as const,
      approvalStatus: "APROVADO" as const,
      status: "ATIVO" as const,
    };

    it("deve PERMITIR create quando o payload possui dados válidos e identidade legítima", () => {
      const validPayload = {
        batteryId: "BT-AUTH-01",
        testId: "TC-01",
        action: "SAVE_TEST_CASE",
        errorMessage: "Firestore write timeout",
        timestamp: new Date().toISOString(),
        userId: studentAuth.uid,
        userEmail: studentAuth.email,
      };

      const res = evaluateTestErrorLogsRule({
        operation: "create",
        auth: studentAuth,
        incomingData: validPayload,
      });
      expect(res.allowed).toBe(true);
    });

    it("deve NEGAR create se o usuário tentar falsificar o userId (Spoofing)", () => {
      const spoofedPayload = {
        batteryId: "BT-AUTH-01",
        testId: "TC-01",
        action: "SAVE_TEST_CASE",
        errorMessage: "Error",
        timestamp: new Date().toISOString(),
        userId: "admin-victim-uid",
        userEmail: "admin@ifpr.edu.br",
      };

      const res = evaluateTestErrorLogsRule({
        operation: "create",
        auth: studentAuth,
        incomingData: spoofedPayload,
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe("SPOOFED_USER_ID");
    });

    it("deve NEGAR create se o usuário tentar falsificar o userEmail", () => {
      const spoofedPayload = {
        batteryId: "BT-AUTH-01",
        testId: "TC-01",
        action: "SAVE_TEST_CASE",
        errorMessage: "Error",
        timestamp: new Date().toISOString(),
        userId: studentAuth.uid,
        userEmail: "another-student@estudantes.ifpr.edu.br",
      };

      const res = evaluateTestErrorLogsRule({
        operation: "create",
        auth: studentAuth,
        incomingData: spoofedPayload,
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe("SPOOFED_USER_EMAIL");
    });

    it("deve NEGAR read (get/list) para aluno comum para proteger stack traces internos", () => {
      expect(evaluateTestErrorLogsRule({ operation: "get", auth: studentAuth }).allowed).toBe(false);
      expect(evaluateTestErrorLogsRule({ operation: "list", auth: studentAuth }).allowed).toBe(false);
    });

    it("deve NEGAR update e delete para aluno comum", () => {
      expect(evaluateTestErrorLogsRule({ operation: "update", auth: studentAuth }).allowed).toBe(false);
      expect(evaluateTestErrorLogsRule({ operation: "delete", auth: studentAuth }).allowed).toBe(false);
    });

    it("deve NEGAR create para usuário com conta PENDENTE ou BLOQUEADA", () => {
      const pendingAuth = { ...studentAuth, approvalStatus: "PENDENTE" as const };
      const blockedAuth = { ...studentAuth, status: "BLOQUEADO" as const };

      const payload = {
        batteryId: "BT-01",
        testId: "TC-01",
        action: "SAVE_TEST_CASE",
        errorMessage: "Error",
        timestamp: new Date().toISOString(),
        userId: studentAuth.uid,
      };

      expect(evaluateTestErrorLogsRule({ operation: "create", auth: pendingAuth, incomingData: payload }).allowed).toBe(false);
      expect(evaluateTestErrorLogsRule({ operation: "create", auth: blockedAuth, incomingData: payload }).allowed).toBe(false);
    });
  });

  describe("4. Validação Estrutural do Payload (Schema Enforcement)", () => {
    const activeAuth = {
      uid: "tester-uid-1",
      email: "tester@ifpr.edu.br",
      role: "SERVIDOR" as const,
      approvalStatus: "APROVADO" as const,
      status: "ATIVO" as const,
    };

    it("deve NEGAR create com errorMessage vazio ou ausente", () => {
      const res = evaluateTestErrorLogsRule({
        operation: "create",
        auth: activeAuth,
        incomingData: {
          batteryId: "BT-01",
          testId: "TC-01",
          action: "SAVE",
          errorMessage: "",
          timestamp: new Date().toISOString(),
        },
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe("INVALID_ERROR_MESSAGE");
    });

    it("deve NEGAR create com errorMessage excessivamente longo (> 5000 chars)", () => {
      const res = evaluateTestErrorLogsRule({
        operation: "create",
        auth: activeAuth,
        incomingData: {
          batteryId: "BT-01",
          testId: "TC-01",
          action: "SAVE",
          errorMessage: "x".repeat(5001),
          timestamp: new Date().toISOString(),
        },
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe("INVALID_ERROR_MESSAGE");
    });
  });

  describe("5. Cenários de Servidor e Administrador", () => {
    const servidorAuth = {
      uid: "servidor-uid-1",
      email: "servidor@ifpr.edu.br",
      role: "SERVIDOR" as const,
      approvalStatus: "APROVADO" as const,
      status: "ATIVO" as const,
    };

    const adminAuth = {
      uid: "admin-uid-1",
      email: "paulocauan39@gmail.com",
      role: "ADMIN" as const,
      approvalStatus: "APROVADO" as const,
      status: "ATIVO" as const,
    };

    it("Servidor pode consultar logs de erro para suporte técnico", () => {
      expect(evaluateTestErrorLogsRule({ operation: "get", auth: servidorAuth }).allowed).toBe(true);
      expect(evaluateTestErrorLogsRule({ operation: "list", auth: servidorAuth }).allowed).toBe(true);
    });

    it("Servidor NÃO pode atualizar nem excluir logs de erro", () => {
      expect(evaluateTestErrorLogsRule({ operation: "update", auth: servidorAuth }).allowed).toBe(false);
      expect(evaluateTestErrorLogsRule({ operation: "delete", auth: servidorAuth }).allowed).toBe(false);
    });

    it("Administrador pode consultar (get/list) e excluir (delete) logs", () => {
      expect(evaluateTestErrorLogsRule({ operation: "get", auth: adminAuth }).allowed).toBe(true);
      expect(evaluateTestErrorLogsRule({ operation: "list", auth: adminAuth }).allowed).toBe(true);
      expect(evaluateTestErrorLogsRule({ operation: "delete", auth: adminAuth }).allowed).toBe(true);
    });

    it("Administrador NÃO pode atualizar logs existentes (Imutabilidade absoluta)", () => {
      expect(evaluateTestErrorLogsRule({ operation: "update", auth: adminAuth }).allowed).toBe(false);
    });
  });
});
