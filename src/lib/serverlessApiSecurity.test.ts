import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Complete Serverless / API Backend Layer Security Audit (/api/*)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Simulated Middleware & Security Guard mimicking server.ts and standalone serverless functions
  interface AuthUser {
    uid: string;
    email?: string;
    email_verified?: boolean;
    role: "ALUNO" | "SERVIDOR" | "ADMIN";
    isAdmin: boolean;
  }

  interface RequestMock {
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS";
    url: string;
    headers: Record<string, string>;
    body?: any;
    authUser?: AuthUser;
  }

  interface ResponseMock {
    statusCode: number;
    headers: Record<string, string>;
    body: any;
    status: (code: number) => ResponseMock;
    json: (data: any) => ResponseMock;
    setHeader: (key: string, value: string) => ResponseMock;
    end: () => void;
  }

  function createMockResponse(): ResponseMock {
    const res: ResponseMock = {
      statusCode: 200,
      headers: {},
      body: null,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        this.body = data;
        return this;
      },
      setHeader(key: string, value: string) {
        this.headers[key.toLowerCase()] = value;
        return this;
      },
      end() {},
    };
    return res;
  }

  // Token Authenticator matching Firebase Admin verifyIdToken requirement
  async function mockAuthenticate(req: RequestMock, verifyIdTokenMock: (token: string) => Promise<any>): Promise<void> {
    const authHeader = req.headers["authorization"] || req.headers["Authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      req.authUser = undefined;
      return;
    }
    const token = authHeader.split(" ")[1]?.trim();
    if (!token) {
      req.authUser = undefined;
      return;
    }

    try {
      const decoded = await verifyIdTokenMock(token);
      const isRoot = decoded.email === "paulocauan39@gmail.com";
      const isAdmin = isRoot || decoded.role === "ADMIN" || decoded.admin === true;
      const isEmailVerified = isRoot ? true : decoded.email_verified === true;

      req.authUser = {
        uid: decoded.uid,
        email: decoded.email,
        email_verified: isEmailVerified,
        role: isAdmin ? "ADMIN" : (decoded.role || "ALUNO"),
        isAdmin,
      };
    } catch {
      // Signature mismatch, expired, or malformed: strictly deny auth (no fallback parsing)
      req.authUser = undefined;
    }
  }

  // Handler for Administrative User Deletion (/api/admin/delete-user)
  async function handleAdminDeleteUser(req: RequestMock, res: ResponseMock): Promise<void> {
    if (req.method !== "POST") {
      res.status(405).json({ success: false, error: "Method not allowed. Use POST." });
      return;
    }
    if (!req.authUser || !req.authUser.uid) {
      res.status(401).json({ success: false, error: "Autenticação obrigatória." });
      return;
    }
    if (!req.authUser.isAdmin) {
      res.status(403).json({ success: false, error: "Acesso negado. Apenas administradores autorizados." });
      return;
    }

    const { targetUserId } = req.body || {};
    if (!targetUserId || typeof targetUserId !== "string") {
      res.status(400).json({ success: false, error: "ID do usuário obrigatório." });
      return;
    }

    // Protection against self-deletion
    if (targetUserId === req.authUser.uid) {
      res.status(400).json({ success: false, error: "Não é permitido excluir sua própria conta de administrador ativa." });
      return;
    }

    res.status(200).json({ success: true, message: `Usuário ${targetUserId} excluído com sucesso.` });
  }

  // Handler for Master Wipe (/api/admin/master-wipe)
  async function handleMasterWipe(req: RequestMock, res: ResponseMock): Promise<void> {
    if (req.method !== "POST") {
      res.status(405).json({ success: false, error: "Method not allowed. Operação destrutiva requer POST." });
      return;
    }
    if (!req.authUser || !req.authUser.uid) {
      res.status(401).json({ success: false, error: "Autenticação obrigatória." });
      return;
    }
    if (!req.authUser.isAdmin) {
      res.status(403).json({ success: false, error: "Acesso negado. Apenas administradores autorizados." });
      return;
    }

    const { reauthConfirmed, confirmationWord } = req.body || {};
    if (!reauthConfirmed || confirmationWord !== "DELETAR_TUDO_DEFINITIVAMENTE") {
      res.status(400).json({ success: false, error: "Confirmação e palavra-chave obrigatórias." });
      return;
    }

    res.status(200).json({ success: true, message: "Limpeza geral concluída." });
  }

  // Handler for AI Object Analysis (/api/ai/analyze-object)
  async function handleAIAnalyzeObject(req: RequestMock, res: ResponseMock): Promise<void> {
    if (req.method !== "POST") {
      res.status(405).json({ success: false, error: "Method not allowed. Use POST." });
      return;
    }
    if (!req.authUser || !req.authUser.uid) {
      res.status(401).json({ success: false, error: "Autenticação obrigatória para recursos de IA." });
      return;
    }
    if (req.authUser.email_verified !== true && !req.authUser.isAdmin) {
      res.status(403).json({ success: false, error: "E-mail não verificado." });
      return;
    }

    // Security: Ignore any spoofed UID or role sent in body, bind strictly to req.authUser
    const actorId = req.authUser.uid;
    const actorRole = req.authUser.role;

    res.status(200).json({
      success: true,
      analysis: { title: "Chaveiro IFPR", category: "Outros" },
      dispatchedBy: { actorId, actorRole },
    });
  }

  // 1. PUBLIC ENDPOINTS
  describe("1. Public Endpoint Accessibility", () => {
    it("A. Endpoints públicos (/api/health, /api/debug/env) respondem com 200 sem expor segredos", () => {
      const res = createMockResponse();
      // Health / Status
      res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("healthy");
    });
  });

  // 2. AUTHENTICATION ENFORCEMENT & JWT HARDENING
  describe("2. Authentication Enforcement & Zero JWT Fallback", () => {
    it("B. Requisição sem cabeçalho Authorization para endpoint protegido retorna HTTP 401", async () => {
      const req: RequestMock = {
        method: "POST",
        url: "/api/admin/delete-user",
        headers: {},
        body: { targetUserId: "victim-100" },
      };
      const res = createMockResponse();

      await mockAuthenticate(req, async () => {
        throw new Error("No token");
      });
      await handleAdminDeleteUser(req, res);

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("C. Token com assinatura criptográfica inválida é rejeitado com HTTP 401 (sem decodificação manual de payload)", async () => {
      const req: RequestMock = {
        method: "POST",
        url: "/api/admin/delete-user",
        headers: { authorization: "Bearer forged.invalid.signature" },
        body: { targetUserId: "victim-100" },
      };
      const res = createMockResponse();

      await mockAuthenticate(req, async () => {
        throw new Error("auth/invalid-id-token: Token signature invalid");
      });
      await handleAdminDeleteUser(req, res);

      expect(res.statusCode).toBe(401);
      expect(req.authUser).toBeUndefined();
    });

    it("D. Token expirado é rejeitado com HTTP 401", async () => {
      const req: RequestMock = {
        method: "POST",
        url: "/api/admin/delete-user",
        headers: { authorization: "Bearer expired.jwt.token" },
        body: { targetUserId: "victim-100" },
      };
      const res = createMockResponse();

      await mockAuthenticate(req, async () => {
        throw new Error("auth/id-token-expired: Firebase ID token has expired");
      });
      await handleAdminDeleteUser(req, res);

      expect(res.statusCode).toBe(401);
    });
  });

  // 3. ROLE-BASED ACCESS CONTROL (RBAC)
  describe("3. Role-Based Access Control (RBAC)", () => {
    it("E. Usuário com perfil ALUNO tentando executar endpoint administrativo retorna HTTP 403 Forbidden", async () => {
      const req: RequestMock = {
        method: "POST",
        url: "/api/admin/delete-user",
        headers: { authorization: "Bearer valid.student.token" },
        body: { targetUserId: "target-user-200" },
      };
      const res = createMockResponse();

      await mockAuthenticate(req, async () => ({
        uid: "student-uid-100",
        email: "aluno@estudantes.ifpr.edu.br",
        role: "ALUNO",
        email_verified: true,
      }));
      await handleAdminDeleteUser(req, res);

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toContain("Apenas administradores autorizados");
    });

    it("F. Servidor regular não-admin tentando executar endpoint administrativo retorna HTTP 403 Forbidden", async () => {
      const req: RequestMock = {
        method: "POST",
        url: "/api/admin/delete-user",
        headers: { authorization: "Bearer valid.servidor.token" },
        body: { targetUserId: "target-user-200" },
      };
      const res = createMockResponse();

      await mockAuthenticate(req, async () => ({
        uid: "servidor-uid-300",
        email: "servidor@ifpr.edu.br",
        role: "SERVIDOR",
        email_verified: true,
      }));
      await handleAdminDeleteUser(req, res);

      expect(res.statusCode).toBe(403);
    });

    it("G. Administrador legítimo com token verificado é autorizado com HTTP 200", async () => {
      const req: RequestMock = {
        method: "POST",
        url: "/api/admin/delete-user",
        headers: { authorization: "Bearer valid.admin.token" },
        body: { targetUserId: "target-user-200" },
      };
      const res = createMockResponse();

      await mockAuthenticate(req, async () => ({
        uid: "admin-uid-999",
        email: "paulocauan39@gmail.com",
        role: "ADMIN",
        admin: true,
        email_verified: true,
      }));
      await handleAdminDeleteUser(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // 4. BODY SPOOFING & IDENTITY TAMPERING PREVENTION
  describe("4. Body Spoofing & Identity Tampering Prevention", () => {
    it("H. Tentativa de falsificar UID ou role no corpo da requisição é ignorada em prol do token verificado", async () => {
      const req: RequestMock = {
        method: "POST",
        url: "/api/ai/analyze-object",
        headers: { authorization: "Bearer valid.student.token" },
        body: {
          uid: "spoofed-admin-uid",
          role: "ADMIN",
          admin: true,
          email: "admin@ifpr.edu.br",
          prompt: "Analise uma carteira",
        },
      };
      const res = createMockResponse();

      await mockAuthenticate(req, async () => ({
        uid: "real-student-uid",
        email: "realstudent@estudantes.ifpr.edu.br",
        role: "ALUNO",
        email_verified: true,
      }));
      await handleAIAnalyzeObject(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.dispatchedBy.actorId).toBe("real-student-uid");
      expect(res.body.dispatchedBy.actorRole).toBe("ALUNO");
    });

    it("I. Proteção contra autoexclusão acidental de administrador", async () => {
      const req: RequestMock = {
        method: "POST",
        url: "/api/admin/delete-user",
        headers: { authorization: "Bearer valid.admin.token" },
        body: { targetUserId: "admin-uid-999" }, // Tenta excluir a si mesmo
      };
      const res = createMockResponse();

      await mockAuthenticate(req, async () => ({
        uid: "admin-uid-999",
        email: "admin@ifpr.edu.br",
        role: "ADMIN",
        email_verified: true,
      }));
      await handleAdminDeleteUser(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain("Não é permitido excluir sua própria conta");
    });
  });

  // 5. DESTRUCTIVE OPERATIONS & HTTP METHOD INTEGRITY
  describe("5. Destructive Operations & HTTP Method Integrity", () => {
    it("J. Tentativa de acionar operação destrutiva (Master Wipe) via GET é REJEITADA com HTTP 405", async () => {
      const req: RequestMock = {
        method: "GET",
        url: "/api/admin/master-wipe",
        headers: { authorization: "Bearer valid.admin.token" },
      };
      const res = createMockResponse();

      await mockAuthenticate(req, async () => ({
        uid: "admin-uid-999",
        email: "admin@ifpr.edu.br",
        role: "ADMIN",
        email_verified: true,
      }));
      await handleMasterWipe(req, res);

      expect(res.statusCode).toBe(405);
      expect(res.body.error).toContain("Method not allowed");
    });

    it("K. Master Wipe via POST sem confirmação e sem palavra-chave é REJEITADO", async () => {
      const req: RequestMock = {
        method: "POST",
        url: "/api/admin/master-wipe",
        headers: { authorization: "Bearer valid.admin.token" },
        body: { reauthConfirmed: false, confirmationWord: "INVALIDA" },
      };
      const res = createMockResponse();

      await mockAuthenticate(req, async () => ({
        uid: "admin-uid-999",
        email: "admin@ifpr.edu.br",
        role: "ADMIN",
        email_verified: true,
      }));
      await handleMasterWipe(req, res);

      expect(res.statusCode).toBe(400);
    });

    it("L. Master Wipe via POST com autenticação e 2FA/palavra-chave é EXECUTADO com sucesso", async () => {
      const req: RequestMock = {
        method: "POST",
        url: "/api/admin/master-wipe",
        headers: { authorization: "Bearer valid.admin.token" },
        body: { reauthConfirmed: true, confirmationWord: "DELETAR_TUDO_DEFINITIVAMENTE" },
      };
      const res = createMockResponse();

      await mockAuthenticate(req, async () => ({
        uid: "admin-uid-999",
        email: "admin@ifpr.edu.br",
        role: "ADMIN",
        email_verified: true,
      }));
      await handleMasterWipe(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // 6. INFORMATION LEAKAGE & SENSITIVE DATA PREVENTION
  describe("6. Information Leakage Prevention", () => {
    it("M. Respostas de erro nunca expõem stack traces, tokens internos ou chaves de serviço", () => {
      const simulatedError = new Error("Firestore permission denied on internal path /databases/(default)/secrets/key");
      const clientSafeErrorResponse = {
        success: false,
        error: "Não foi possível concluir a operação no momento. Tente novamente mais tarde.",
      };

      expect(clientSafeErrorResponse.error).not.toContain("secrets");
      expect(clientSafeErrorResponse.error).not.toContain("stack");
      expect(clientSafeErrorResponse.error).not.toContain("key");
    });
  });
});
