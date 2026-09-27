import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

describe("Operational & Administrative Collections Least Privilege Security Audit (/system_metrics, /test_executions, /test_error_logs, /support_tickets, /comments, etc.)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const rulesPath = path.resolve(process.cwd(), "firestore.rules");
  const rulesContent = fs.readFileSync(rulesPath, "utf-8");

  // Simulated evaluator for operational collection rules
  function evaluateSystemMetricsRule(params: {
    operation: "get" | "list" | "create" | "update" | "delete";
    metricId: string;
    auth: {
      uid: string;
      email?: string;
      role?: string;
      approvalStatus?: string;
      status?: "active" | "suspended" | "banned";
      token?: { email?: string; role?: string; admin?: boolean };
    } | null;
  }): { allowed: boolean; reason?: string } {
    const { operation, metricId, auth } = params;
    if (!auth || !auth.uid) {
      return { allowed: false, reason: "UNAUTHENTICATED" };
    }
    const tokenEmail = auth.token?.email || auth.email || "";
    const isRoot = tokenEmail.toLowerCase() === "paulocauan39@gmail.com";
    const hasAdminClaim = auth.token?.role === "ADMIN" || auth.token?.admin === true;
    const isDocAdmin = auth.role === "ADMIN" && auth.approvalStatus === "APROVADO";
    const isAdmin = isRoot || hasAdminClaim || isDocAdmin;
    const isAccountActive = auth.status !== "banned" && auth.status !== "suspended";

    if (operation === "get") {
      if (isAdmin || metricId === "heartbeat") return { allowed: true };
      return { allowed: false, reason: "GET_METRICS_ADMIN_ONLY" };
    }
    if (operation === "list") {
      if (isAdmin) return { allowed: true };
      return { allowed: false, reason: "LIST_METRICS_ADMIN_ONLY" };
    }
    if (operation === "create" || operation === "update") {
      if (isAdmin || (isAccountActive && metricId === "heartbeat")) return { allowed: true };
      return { allowed: false, reason: "WRITE_METRICS_ADMIN_ONLY" };
    }
    if (operation === "delete") {
      if (isAdmin) return { allowed: true };
      return { allowed: false, reason: "DELETE_METRICS_ADMIN_ONLY" };
    }
    return { allowed: false };
  }

  function evaluateTestExecutionsRule(params: {
    operation: "get" | "list" | "create" | "update" | "delete";
    auth: {
      uid: string;
      role?: string;
      approvalStatus?: string;
      status?: "active" | "suspended" | "banned";
      isParticipant?: boolean;
    } | null;
  }): { allowed: boolean; reason?: string } {
    const { operation, auth } = params;
    if (!auth || !auth.uid) return { allowed: false, reason: "UNAUTHENTICATED" };

    const isAdmin = auth.role === "ADMIN" && auth.approvalStatus === "APROVADO";
    const isServidor = auth.role === "SERVIDOR";
    const isParticipant = Boolean(auth.isParticipant);
    const isAccountActive = auth.status !== "banned" && auth.status !== "suspended";

    if (operation === "get" || operation === "list") {
      if (isAdmin || isServidor || isParticipant) return { allowed: true };
      return { allowed: false, reason: "GET_TEST_EXECUTIONS_FORBIDDEN" };
    }
    if (operation === "create") {
      if (isAdmin || isServidor) return { allowed: true };
      return { allowed: false, reason: "CREATE_TEST_EXECUTIONS_COORDINATOR_ONLY" };
    }
    if (operation === "update") {
      if (isAdmin || isServidor || (isAccountActive && isParticipant)) return { allowed: true };
      return { allowed: false, reason: "UPDATE_TEST_EXECUTIONS_FORBIDDEN" };
    }
    if (operation === "delete") {
      if (isAdmin) return { allowed: true };
      return { allowed: false, reason: "DELETE_TEST_EXECUTIONS_ADMIN_ONLY" };
    }
    return { allowed: false };
  }

  function evaluateTestErrorLogsRule(params: {
    operation: "get" | "list" | "create" | "update" | "delete";
    auth: { uid: string; email?: string; role?: string; approvalStatus?: string } | null;
    incomingData?: Record<string, any>;
  }): { allowed: boolean; reason?: string } {
    const { operation, auth, incomingData } = params;
    if (operation === "get" || operation === "list") {
      if (!auth) return { allowed: false, reason: "UNAUTHENTICATED" };
      const isAdmin = auth.role === "ADMIN" && auth.approvalStatus === "APROVADO";
      const isServidor = auth.role === "SERVIDOR";
      if (isAdmin || isServidor) return { allowed: true };
      return { allowed: false, reason: "READ_TEST_ERROR_LOGS_ADMIN_SERVIDOR_ONLY" };
    }
    if (operation === "create") {
      if (!auth) return { allowed: false, reason: "UNAUTHENTICATED" };
      if (incomingData?.userId && incomingData.userId !== auth.uid) {
        return { allowed: false, reason: "SPOOFED_USER_ID" };
      }
      if (incomingData?.userEmail && auth.email && incomingData.userEmail !== auth.email) {
        return { allowed: false, reason: "SPOOFED_USER_EMAIL" };
      }
      return { allowed: true };
    }
    if (operation === "update") {
      return { allowed: false, reason: "TEST_ERROR_LOGS_IMMUTABLE" };
    }
    if (operation === "delete") {
      if (!auth) return { allowed: false, reason: "UNAUTHENTICATED" };
      const isAdmin = auth.role === "ADMIN" && auth.approvalStatus === "APROVADO";
      if (isAdmin) return { allowed: true };
      return { allowed: false, reason: "DELETE_TEST_ERROR_LOGS_ADMIN_ONLY" };
    }
    return { allowed: false };
  }

  function evaluateSupportTicketsRule(params: {
    operation: "get" | "list" | "create" | "update" | "delete";
    auth: { uid: string; email?: string; role?: string; approvalStatus?: string; status?: "active" | "suspended" } | null;
    ticketOwnerUserId?: string;
    incomingData?: Record<string, any>;
  }): { allowed: boolean; reason?: string } {
    const { operation, auth, ticketOwnerUserId, incomingData } = params;
    const isAdmin = auth?.role === "ADMIN" && auth?.approvalStatus === "APROVADO";

    if (operation === "get") {
      if (!auth) return { allowed: false, reason: "UNAUTHENTICATED" };
      if (isAdmin || auth.uid === ticketOwnerUserId) return { allowed: true };
      return { allowed: false, reason: "GET_TICKET_FORBIDDEN_NOT_OWNER" };
    }
    if (operation === "list") {
      if (!auth) return { allowed: false, reason: "UNAUTHENTICATED" };
      if (isAdmin || (auth.status !== "suspended" && ticketOwnerUserId === auth.uid)) return { allowed: true };
      return { allowed: false, reason: "LIST_TICKETS_FORBIDDEN" };
    }
    if (operation === "create") {
      if (!incomingData) return { allowed: false };
      if (incomingData.status !== "NOVO") return { allowed: false, reason: "INITIAL_STATUS_MUST_BE_NOVO" };
      if (auth) {
        if (incomingData.userId && incomingData.userId !== auth.uid) return { allowed: false, reason: "SPOOFED_USER_ID" };
        if (incomingData.email && auth.email && incomingData.email !== auth.email) return { allowed: false, reason: "SPOOFED_EMAIL" };
        return { allowed: true };
      } else {
        if (incomingData.userId || incomingData.userRole) return { allowed: false, reason: "VISITOR_CANNOT_INJECT_IDENTITY" };
        return { allowed: true };
      }
    }
    if (operation === "update" || operation === "delete") {
      if (isAdmin) return { allowed: true };
      return { allowed: false, reason: "ADMIN_ONLY" };
    }
    return { allowed: false };
  }

  function evaluateCommentsRule(params: {
    operation: "get" | "list" | "create" | "update" | "delete";
    auth: { uid: string; role?: string; approvalStatus?: string; status?: "active" | "suspended" } | null;
    existingData?: Record<string, any>;
    incomingData?: Record<string, any>;
  }): { allowed: boolean; reason?: string } {
    const { operation, auth, existingData, incomingData } = params;
    if (!auth) return { allowed: false, reason: "UNAUTHENTICATED" };
    const isAdmin = auth.role === "ADMIN" && auth.approvalStatus === "APROVADO";
    const isServidor = auth.role === "SERVIDOR";
    const isAccountActive = auth.status !== "suspended";

    if (operation === "get" || operation === "list") {
      return { allowed: true };
    }
    if (operation === "create") {
      if (!isAccountActive) return { allowed: false, reason: "ACCOUNT_INACTIVE" };
      if (!incomingData || incomingData.userId !== auth.uid) return { allowed: false, reason: "SPOOFED_USER_ID" };
      if (incomingData.userRole === "ADMIN" && !isAdmin) return { allowed: false, reason: "SPOOFED_ADMIN_ROLE" };
      if (incomingData.userRole === "SERVIDOR" && !isServidor && !isAdmin) return { allowed: false, reason: "SPOOFED_SERVIDOR_ROLE" };
      return { allowed: true };
    }
    if (operation === "update") {
      if (!isAccountActive) return { allowed: false, reason: "ACCOUNT_INACTIVE" };
      if (!existingData || !incomingData) return { allowed: false };
      if (existingData.userId !== auth.uid || incomingData.userId !== existingData.userId) return { allowed: false, reason: "CANNOT_UPDATE_OTHER_USER_COMMENT" };
      if (incomingData.itemId !== existingData.itemId || incomingData.createdAt !== existingData.createdAt) return { allowed: false, reason: "IMMUTABLE_FIELDS_CHANGED" };
      if (incomingData.userRole && incomingData.userRole !== existingData.userRole) return { allowed: false, reason: "CANNOT_CHANGE_ROLE" };
      return { allowed: true };
    }
    if (operation === "delete") {
      if (!isAccountActive) return { allowed: false, reason: "ACCOUNT_INACTIVE" };
      if (isAdmin || existingData?.userId === auth.uid) return { allowed: true };
      return { allowed: false, reason: "DELETE_FORBIDDEN" };
    }
    return { allowed: false };
  }

  // 1. SYSTEM METRICS TESTS
  describe("1. System Metrics (/system_metrics)", () => {
    it("A. Usuário não autenticado tentando ler métricas é REJEITADO", () => {
      const res = evaluateSystemMetricsRule({ operation: "get", metricId: "ai_cost_breakdown", auth: null });
      expect(res.allowed).toBe(false);
    });

    it("B. Usuário autenticado comum (ALUNO) lendo métrica interna privada é REJEITADO", () => {
      const res = evaluateSystemMetricsRule({
        operation: "get",
        metricId: "internal_system_costs",
        auth: { uid: "student-1", role: "ALUNO", status: "active" },
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe("GET_METRICS_ADMIN_ONLY");
    });

    it("C. Usuário autenticado comum lendo ou atualizando probe de heartbeat é PERMITIDO", () => {
      const resGet = evaluateSystemMetricsRule({
        operation: "get",
        metricId: "heartbeat",
        auth: { uid: "student-1", role: "ALUNO", status: "active" },
      });
      expect(resGet.allowed).toBe(true);

      const resWrite = evaluateSystemMetricsRule({
        operation: "update",
        metricId: "heartbeat",
        auth: { uid: "student-1", role: "ALUNO", status: "active" },
      });
      expect(resWrite.allowed).toBe(true);
    });

    it("D. Usuário autenticado comum tentando listar toda a coleção system_metrics é REJEITADO", () => {
      const res = evaluateSystemMetricsRule({
        operation: "list",
        metricId: "",
        auth: { uid: "student-1", role: "ALUNO", status: "active" },
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe("LIST_METRICS_ADMIN_ONLY");
    });

    it("E. Administrador tem acesso total a get, list e delete de system_metrics", () => {
      const adminAuth = { uid: "admin-1", role: "ADMIN", approvalStatus: "APROVADO", status: "active" as const };
      expect(evaluateSystemMetricsRule({ operation: "get", metricId: "internal_system_costs", auth: adminAuth }).allowed).toBe(true);
      expect(evaluateSystemMetricsRule({ operation: "list", metricId: "", auth: adminAuth }).allowed).toBe(true);
      expect(evaluateSystemMetricsRule({ operation: "delete", metricId: "old_metric", auth: adminAuth }).allowed).toBe(true);
    });
  });

  // 2. TEST EXECUTIONS TESTS
  describe("2. Test Battery Executions (/test_executions)", () => {
    it("A. Usuário não autenticado é REJEITADO para get/list/create/update", () => {
      expect(evaluateTestExecutionsRule({ operation: "get", auth: null }).allowed).toBe(false);
      expect(evaluateTestExecutionsRule({ operation: "create", auth: null }).allowed).toBe(false);
    });

    it("B. Aluno comum não vinculado como participante de teste é REJEITADO para consultar execuções", () => {
      const res = evaluateTestExecutionsRule({
        operation: "get",
        auth: { uid: "student-random", role: "ALUNO", isParticipant: false },
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe("GET_TEST_EXECUTIONS_FORBIDDEN");
    });

    it("C. Aluno explicitamente registrado como participante de teste é PERMITIDO a ler e atualizar execuções", () => {
      const participantAuth = { uid: "student-tester", role: "ALUNO", isParticipant: true, status: "active" as const };
      expect(evaluateTestExecutionsRule({ operation: "get", auth: participantAuth }).allowed).toBe(true);
      expect(evaluateTestExecutionsRule({ operation: "update", auth: participantAuth }).allowed).toBe(true);
      // Mas não pode criar nova bateria ou excluir bateria
      expect(evaluateTestExecutionsRule({ operation: "create", auth: participantAuth }).allowed).toBe(false);
      expect(evaluateTestExecutionsRule({ operation: "delete", auth: participantAuth }).allowed).toBe(false);
    });

    it("D. Servidor e Administrador podem coordenar e gerenciar baterias de teste", () => {
      const servidorAuth = { uid: "servidor-qa", role: "SERVIDOR", status: "active" as const };
      const adminAuth = { uid: "admin-qa", role: "ADMIN", approvalStatus: "APROVADO", status: "active" as const };

      expect(evaluateTestExecutionsRule({ operation: "create", auth: servidorAuth }).allowed).toBe(true);
      expect(evaluateTestExecutionsRule({ operation: "create", auth: adminAuth }).allowed).toBe(true);
      expect(evaluateTestExecutionsRule({ operation: "delete", auth: adminAuth }).allowed).toBe(true);
    });
  });

  // 3. TEST ERROR LOGS TESTS
  describe("3. Test Error Logs (/test_error_logs)", () => {
    it("A. Usuário não autenticado é REJEITADO para criar ou ler logs de erro", () => {
      expect(evaluateTestErrorLogsRule({ operation: "create", auth: null }).allowed).toBe(false);
      expect(evaluateTestErrorLogsRule({ operation: "get", auth: null }).allowed).toBe(false);
    });

    it("B. Aluno comum tentando listar/ler logs de erro internos com stack traces é REJEITADO", () => {
      const res = evaluateTestErrorLogsRule({
        operation: "list",
        auth: { uid: "student-1", role: "ALUNO" },
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe("READ_TEST_ERROR_LOGS_ADMIN_SERVIDOR_ONLY");
    });

    it("C. Usuário gravando erro com UID ou e-mail falsificado de terceiro é REJEITADO", () => {
      const auth = { uid: "student-attacker", email: "attacker@estudantes.ifpr.edu.br", role: "ALUNO" };
      const spoofedPayload = {
        userId: "admin-victim-uid",
        userEmail: "admin@ifpr.edu.br",
        errorMessage: "Simulated error",
      };
      const res = evaluateTestErrorLogsRule({
        operation: "create",
        auth,
        incomingData: spoofedPayload,
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe("SPOOFED_USER_ID");
    });

    it("D. Usuário autenticado gravando log com seu próprio UID e e-mail é PERMITIDO", () => {
      const auth = { uid: "student-tester", email: "tester@estudantes.ifpr.edu.br", role: "ALUNO" };
      const validPayload = {
        userId: "student-tester",
        userEmail: "tester@estudantes.ifpr.edu.br",
        errorMessage: "Network timeout on save",
      };
      expect(evaluateTestErrorLogsRule({ operation: "create", auth, incomingData: validPayload }).allowed).toBe(true);
    });

    it("E. Logs de erro são estritamente imutáveis (update = false) e exclusão restrita a Admin", () => {
      const adminAuth = { uid: "admin-1", role: "ADMIN", approvalStatus: "APROVADO" };
      expect(evaluateTestErrorLogsRule({ operation: "update", auth: adminAuth }).allowed).toBe(false);
      expect(evaluateTestErrorLogsRule({ operation: "delete", auth: adminAuth }).allowed).toBe(true);
    });
  });

  // 4. SUPPORT TICKETS TESTS
  describe("4. Support & Feedback Tickets (/support_tickets)", () => {
    it("A. Visitante anônimo pode criar ticket com status NOVO sem injetar userId", () => {
      const res = evaluateSupportTicketsRule({
        operation: "create",
        auth: null,
        incomingData: { name: "Visitante", email: "visitante@gmail.com", status: "NOVO" },
      });
      expect(res.allowed).toBe(true);
    });

    it("B. Visitante anônimo tentando injetar userId ou userRole é REJEITADO", () => {
      const res = evaluateSupportTicketsRule({
        operation: "create",
        auth: null,
        incomingData: { name: "Fake", email: "fake@gmail.com", userId: "admin-uid", userRole: "ADMIN", status: "NOVO" },
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe("VISITOR_CANNOT_INJECT_IDENTITY");
    });

    it("C. Usuário autenticado criando ticket com seu próprio UID é PERMITIDO", () => {
      const auth = { uid: "student-1", email: "student@estudantes.ifpr.edu.br", role: "ALUNO", status: "active" as const };
      const res = evaluateSupportTicketsRule({
        operation: "create",
        auth,
        incomingData: { name: "Aluno", email: "student@estudantes.ifpr.edu.br", userId: "student-1", status: "NOVO" },
      });
      expect(res.allowed).toBe(true);
    });

    it("D. Usuário tentando ler ticket de outro usuário é REJEITADO", () => {
      const auth = { uid: "student-1", email: "student@estudantes.ifpr.edu.br", role: "ALUNO", status: "active" as const };
      const res = evaluateSupportTicketsRule({
        operation: "get",
        auth,
        ticketOwnerUserId: "victim-student-2",
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe("GET_TICKET_FORBIDDEN_NOT_OWNER");
    });

    it("E. Usuário lendo seu próprio ticket é PERMITIDO", () => {
      const auth = { uid: "student-1", email: "student@estudantes.ifpr.edu.br", role: "ALUNO", status: "active" as const };
      const res = evaluateSupportTicketsRule({
        operation: "get",
        auth,
        ticketOwnerUserId: "student-1",
      });
      expect(res.allowed).toBe(true);
    });

    it("F. Administrador pode listar e responder tickets; usuário comum não pode listar todos", () => {
      const auth = { uid: "student-1", email: "student@estudantes.ifpr.edu.br", role: "ALUNO", status: "active" as const };
      const adminAuth = { uid: "admin-1", email: "admin@ifpr.edu.br", role: "ADMIN", approvalStatus: "APROVADO", status: "active" as const };

      expect(evaluateSupportTicketsRule({ operation: "list", auth, ticketOwnerUserId: "other" }).allowed).toBe(false);
      expect(evaluateSupportTicketsRule({ operation: "list", auth: adminAuth }).allowed).toBe(true);
      expect(evaluateSupportTicketsRule({ operation: "update", auth: adminAuth }).allowed).toBe(true);
    });
  });

  // 5. COMMENTS TESTS
  describe("5. Item Comments Anti-Spoofing & Immutability (/comments)", () => {
    it("A. Aluno criando comentário com userRole falsificado como ADMIN é REJEITADO", () => {
      const authStudent = { uid: "student-1", role: "ALUNO", status: "active" as const };
      const res = evaluateCommentsRule({
        operation: "create",
        auth: authStudent,
        incomingData: { itemId: "item-100", userId: "student-1", userRole: "ADMIN", text: "Mensagem" },
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe("SPOOFED_ADMIN_ROLE");
    });

    it("B. Aluno criando comentário com seu próprio role legítimo (ALUNO) é PERMITIDO", () => {
      const authStudent = { uid: "student-1", role: "ALUNO", status: "active" as const };
      const res = evaluateCommentsRule({
        operation: "create",
        auth: authStudent,
        incomingData: { itemId: "item-100", userId: "student-1", userRole: "ALUNO", text: "Mensagem legítima" },
      });
      expect(res.allowed).toBe(true);
    });

    it("C. Aluno tentando alterar comentário de outro usuário é REJEITADO", () => {
      const authStudent = { uid: "student-1", role: "ALUNO", status: "active" as const };
      const existing = { id: "com-1", itemId: "item-100", userId: "student-victim", createdAt: "2026-09-26T12:00:00Z", text: "Original" };
      const incoming = { id: "com-1", itemId: "item-100", userId: "student-victim", createdAt: "2026-09-26T12:00:00Z", text: "Adulterado" };

      const res = evaluateCommentsRule({
        operation: "update",
        auth: authStudent,
        existingData: existing,
        incomingData: incoming,
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe("CANNOT_UPDATE_OTHER_USER_COMMENT");
    });

    it("D. Aluno alterando seu próprio comentário mantendo itemId, userId e createdAt é PERMITIDO", () => {
      const authStudent = { uid: "student-1", role: "ALUNO", status: "active" as const };
      const existing = { id: "com-1", itemId: "item-100", userId: "student-1", userRole: "ALUNO", createdAt: "2026-09-26T12:00:00Z", text: "Original" };
      const incoming = { id: "com-1", itemId: "item-100", userId: "student-1", userRole: "ALUNO", createdAt: "2026-09-26T12:00:00Z", text: "Atualizado" };

      const res = evaluateCommentsRule({
        operation: "update",
        auth: authStudent,
        existingData: existing,
        incomingData: incoming,
      });
      expect(res.allowed).toBe(true);
    });
  });

  // 6. DECLARATIVE SYNTAX & REGEX AUDIT IN FIRESTORE.RULES
  describe("6. Declarative Syntax in firestore.rules", () => {
    it("Declaração estrita de least-privilege para /system_metrics", () => {
      expect(rulesContent).toMatch(/match \/system_metrics\/\{metricId\}[\s\S]*?allow get: if isAdmin\(\) \|\| \(isSignedIn\(\) && metricId == 'heartbeat'\);/);
      expect(rulesContent).toMatch(/match \/system_metrics\/\{metricId\}[\s\S]*?allow list: if isAdmin\(\);/);
    });

    it("Declaração estrita de least-privilege para /test_error_logs", () => {
      expect(rulesContent).toMatch(/match \/test_error_logs\/\{logId\}[\s\S]*?allow get, list: if isAdmin\(\) \|\| isServidor\(\);/);
      expect(rulesContent).toMatch(/match \/test_error_logs\/\{logId\}[\s\S]*?allow update: if false;/);
    });

    it("Declaração estrita de anti-spoofing para /support_tickets", () => {
      expect(rulesContent).toMatch(/match \/support_tickets\/\{ticketId\}[\s\S]*?allow get: if isSignedIn\(\) && \(resource\.data\.userId == request\.auth\.uid \|\| isAdmin\(\)\);/);
      expect(rulesContent).toMatch(/match \/support_tickets\/\{ticketId\}[\s\S]*?allow update: if isAdmin\(\);/);
    });

    it("Declaração estrita de anti-spoofing para /comments", () => {
      expect(rulesContent).toMatch(/match \/comments\/\{commentId\}[\s\S]*?incoming\(\)\.userId == request\.auth\.uid/);
      expect(rulesContent).toMatch(/match \/comments\/\{commentId\}[\s\S]*?incoming\(\)\.userRole == 'ADMIN' && isAdmin\(\)/);
    });
  });
});
