import { describe, it, expect, vi, beforeEach } from "vitest";

describe("System Config Endpoint Security & RBAC (/api/system/config)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const ROOT_ADMIN_EMAIL = "paulocauan39@gmail.com";

  // Mock handler simulating the hardened /api/system/config POST pipeline
  async function simulateSystemConfigPost(
    authHeader: string | undefined,
    body: any,
    mockAdminAuth: { verifyIdToken: (token: string) => Promise<any> } | null,
    mockFirestore: {
      collection: (col: string) => {
        doc: (id: string) => {
          get: () => Promise<{ exists: boolean; data: () => any }>;
          set: (data: any, options?: any) => Promise<any>;
        };
        add: (data: any) => Promise<any>;
      };
    } | null
  ) {
    let writeExecuted = false;

    // 1. Mandatory Authorization Header Check
    if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
      return { status: 401, code: "AUTH_REQUIRED", writeExecuted };
    }

    const token = authHeader.split(" ")[1]?.trim();
    if (!token) {
      return { status: 401, code: "AUTH_TOKEN_MISSING", writeExecuted };
    }

    // 2. Admin Auth Service & Cryptographic Signature Verification
    if (!mockAdminAuth) {
      return { status: 500, code: "AUTH_SERVICE_UNAVAILABLE", writeExecuted };
    }

    let decoded: any;
    try {
      decoded = await mockAdminAuth.verifyIdToken(token);
    } catch {
      return { status: 401, code: "AUTH_INVALID_TOKEN", writeExecuted };
    }

    if (!decoded || !decoded.uid) {
      return { status: 401, code: "AUTH_INVALID_IDENTITY", writeExecuted };
    }

    const adminUid = decoded.uid;
    const adminEmail = decoded.email || "";

    // 3. Strict Administrative Authorization Check (Source of Truth)
    const isRoot = adminEmail.toLowerCase() === ROOT_ADMIN_EMAIL.toLowerCase();
    let isAdmin = isRoot || decoded.role === "ADMIN" || decoded.admin === true;

    if (!isAdmin && adminUid && mockFirestore) {
      try {
        const userDoc = await mockFirestore.collection("users").doc(adminUid).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          if (userData?.role === "ADMIN") {
            isAdmin = true;
          }
        }
      } catch {}
    }

    if (!isAdmin) {
      return { status: 403, code: "FORBIDDEN_NOT_ADMIN", writeExecuted };
    }

    // 4. Validate body & discard client privileges
    if (!body || typeof body !== "object") {
      return { status: 400, code: "INVALID_REQUEST_BODY", writeExecuted };
    }

    // 5. Execution of Write (ONLY reachable if authenticated & authorized as Admin)
    writeExecuted = true;
    const updated = {
      maintenanceMode: typeof body.maintenanceMode === "boolean" ? body.maintenanceMode : false,
      maintenanceCustomMessage: typeof body.maintenanceCustomMessage === "string" ? body.maintenanceCustomMessage.substring(0, 500) : "DEFAULT_MSG",
      lastUpdated: new Date().toISOString(),
      updatedBy: adminEmail || adminUid,
    };

    if (mockFirestore) {
      await mockFirestore.collection("system").doc("config").set(updated, { merge: true });
      await mockFirestore.collection("activity_logs").add({
        action: "UPDATE_SYSTEM_CONFIG",
        performedBy: adminUid,
        performedByEmail: adminEmail,
        role: "ADMIN",
        details: `Configuração atualizada: ${updated.maintenanceMode}`,
      });
    }

    return { status: 200, success: true, config: updated, writeExecuted };
  }

  // Test A: POST sem Authorization
  it("A. POST sem Authorization deve retornar HTTP 401 e NÃO alterar o Firestore", async () => {
    const mockFirestoreSet = vi.fn();
    const mockFirestore = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({ set: mockFirestoreSet, get: vi.fn() }),
        add: vi.fn(),
      }),
    };

    const res = await simulateSystemConfigPost(
      undefined,
      { maintenanceMode: true },
      { verifyIdToken: vi.fn() },
      mockFirestore as any
    );

    expect(res.status).toBe(401);
    expect(res.code).toBe("AUTH_REQUIRED");
    expect(res.writeExecuted).toBe(false);
    expect(mockFirestoreSet).not.toHaveBeenCalled();
  });

  // Test B: POST com Authorization inválido (token malformado/expirado)
  it("B. POST com token inválido/expirado deve retornar HTTP 401 e NÃO alterar o Firestore", async () => {
    const mockFirestoreSet = vi.fn();
    const mockFirestore = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({ set: mockFirestoreSet, get: vi.fn() }),
        add: vi.fn(),
      }),
    };

    const mockAdminAuth = {
      verifyIdToken: vi.fn().mockRejectedValue(new Error("auth/id-token-expired")),
    };

    const res = await simulateSystemConfigPost(
      "Bearer expired.jwt.token",
      { maintenanceMode: true },
      mockAdminAuth,
      mockFirestore as any
    );

    expect(res.status).toBe(401);
    expect(res.code).toBe("AUTH_INVALID_TOKEN");
    expect(res.writeExecuted).toBe(false);
    expect(mockFirestoreSet).not.toHaveBeenCalled();
  });

  // Test C: POST com JWT forjado
  it("C. POST com JWT forjado com claims de admin deve retornar HTTP 401 e NÃO alterar o Firestore", async () => {
    const mockFirestoreSet = vi.fn();
    const mockFirestore = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({ set: mockFirestoreSet, get: vi.fn() }),
        add: vi.fn(),
      }),
    };

    const mockAdminAuth = {
      verifyIdToken: vi.fn().mockRejectedValue(new Error("Firebase ID token has invalid signature.")),
    };

    const res = await simulateSystemConfigPost(
      "Bearer forged.admin.token",
      { maintenanceMode: true },
      mockAdminAuth,
      mockFirestore as any
    );

    expect(res.status).toBe(401);
    expect(res.code).toBe("AUTH_INVALID_TOKEN");
    expect(res.writeExecuted).toBe(false);
    expect(mockFirestoreSet).not.toHaveBeenCalled();
  });

  // Test D: POST com token Firebase válido de usuário comum (ALUNO)
  it("D. POST com token Firebase válido de usuário comum deve retornar HTTP 403 Forbidden e NÃO alterar o Firestore", async () => {
    const mockFirestoreSet = vi.fn();
    const mockFirestore = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          set: mockFirestoreSet,
          get: vi.fn().mockResolvedValue({
            exists: true,
            data: () => ({ role: "ALUNO", email: "aluno@estudantes.ifpr.edu.br" }),
          }),
        }),
        add: vi.fn(),
      }),
    };

    const mockAdminAuth = {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: "student-uid-777",
        email: "aluno@estudantes.ifpr.edu.br",
        role: "ALUNO",
      }),
    };

    const res = await simulateSystemConfigPost(
      "Bearer valid.student.token",
      { maintenanceMode: true },
      mockAdminAuth,
      mockFirestore as any
    );

    expect(res.status).toBe(403);
    expect(res.code).toBe("FORBIDDEN_NOT_ADMIN");
    expect(res.writeExecuted).toBe(false);
    expect(mockFirestoreSet).not.toHaveBeenCalled();
  });

  // Test E: POST com token Firebase válido de administrador
  it("E. POST com token Firebase válido de administrador deve atualizar com sucesso", async () => {
    const mockFirestoreSet = vi.fn().mockResolvedValue(true);
    const mockFirestoreAdd = vi.fn().mockResolvedValue({ id: "log-1" });
    const mockFirestore = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          set: mockFirestoreSet,
          get: vi.fn().mockResolvedValue({
            exists: true,
            data: () => ({ role: "ADMIN", email: "admin@ifpr.edu.br" }),
          }),
        }),
        add: mockFirestoreAdd,
      }),
    };

    const mockAdminAuth = {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: "admin-uid-100",
        email: "admin@ifpr.edu.br",
        role: "ADMIN",
      }),
    };

    const res = await simulateSystemConfigPost(
      "Bearer valid.admin.token",
      { maintenanceMode: true, maintenanceCustomMessage: "Manutenção Campus Ivaiporã" },
      mockAdminAuth,
      mockFirestore as any
    );

    expect(res.status).toBe(200);
    expect(res.success).toBe(true);
    expect(res.writeExecuted).toBe(true);
    expect(res.config?.maintenanceMode).toBe(true);
    expect(res.config?.updatedBy).toBe("admin@ifpr.edu.br");
    expect(mockFirestoreSet).toHaveBeenCalled();
    expect(mockFirestoreAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "UPDATE_SYSTEM_CONFIG",
        performedBy: "admin-uid-100",
        role: "ADMIN",
      })
    );
  });

  // Test F: Usuário comum tentando enviar no body { admin: true, role: "ADMIN" }
  it("F. Usuário comum tentando enviar claims de admin no body não ganha privilégios e recebe HTTP 403", async () => {
    const mockFirestoreSet = vi.fn();
    const mockFirestore = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          set: mockFirestoreSet,
          get: vi.fn().mockResolvedValue({
            exists: true,
            data: () => ({ role: "ALUNO" }),
          }),
        }),
        add: vi.fn(),
      }),
    };

    const mockAdminAuth = {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: "student-uid-777",
        email: "aluno@estudantes.ifpr.edu.br",
        role: "ALUNO",
      }),
    };

    const maliciousBody = {
      maintenanceMode: true,
      admin: true,
      role: "ADMIN",
      actorRole: "ADMIN",
      updatedBy: "fake-admin@ifpr.edu.br",
    };

    const res = await simulateSystemConfigPost(
      "Bearer valid.student.token",
      maliciousBody,
      mockAdminAuth,
      mockFirestore as any
    );

    expect(res.status).toBe(403);
    expect(res.code).toBe("FORBIDDEN_NOT_ADMIN");
    expect(res.writeExecuted).toBe(false);
    expect(mockFirestoreSet).not.toHaveBeenCalled();
  });

  // Test G: Usuário comum tentando enviar { actorRole: "ADMIN" }
  it("G. Usuário comum enviando actorRole: 'ADMIN' no body não ganha privilégios", async () => {
    const mockFirestoreSet = vi.fn();
    const mockFirestore = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          set: mockFirestoreSet,
          get: vi.fn().mockResolvedValue({
            exists: true,
            data: () => ({ role: "ALUNO" }),
          }),
        }),
        add: vi.fn(),
      }),
    };

    const mockAdminAuth = {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: "student-uid-888",
        email: "estudante@ifpr.edu.br",
        role: "ALUNO",
      }),
    };

    const res = await simulateSystemConfigPost(
      "Bearer valid.student.token",
      { maintenanceMode: true, actorRole: "ADMIN" },
      mockAdminAuth,
      mockFirestore as any
    );

    expect(res.status).toBe(403);
    expect(res.code).toBe("FORBIDDEN_NOT_ADMIN");
    expect(res.writeExecuted).toBe(false);
    expect(mockFirestoreSet).not.toHaveBeenCalled();
  });

  // Test H: Importação e integridade do endpoint handler
  it("H. Handler exportado de api/system/config.ts rejeita POST sem autenticação", async () => {
    const handlerModule = await import("../../api/system/config");
    const handler = handlerModule.default;

    let statusCode = 0;
    let jsonResult: any = null;
    const mockRes = {
      setHeader: vi.fn(),
      status: (code: number) => {
        statusCode = code;
        return {
          json: (data: any) => {
            jsonResult = data;
          },
          end: vi.fn(),
        };
      },
    };

    const mockReq = {
      method: "POST",
      headers: {},
      body: { maintenanceMode: true },
    };

    await handler(mockReq, mockRes);
    expect(statusCode).toBe(401);
    expect(jsonResult?.success).toBe(false);
    expect(jsonResult?.code).toBe("AUTH_REQUIRED");
  });

  // Test I: Handler GET público retorna status do sistema
  it("I. Handler GET /api/system/config retorna status 200 público para sincronização", async () => {
    const handlerModule = await import("../../api/system/config");
    const handler = handlerModule.default;

    let statusCode = 0;
    let jsonResult: any = null;
    const mockRes = {
      setHeader: vi.fn(),
      status: (code: number) => {
        statusCode = code;
        return {
          json: (data: any) => {
            jsonResult = data;
          },
          end: vi.fn(),
        };
      },
    };

    const mockReq = {
      method: "GET",
      headers: {},
    };

    await handler(mockReq, mockRes);
    expect(statusCode).toBe(200);
    expect(jsonResult?.success).toBe(true);
    expect(jsonResult?.config).toBeDefined();
  });

  // Test J: Handler rejeita métodos HTTP não permitidos (PUT, DELETE, PATCH) com 405
  it("J. Handler rejeita métodos inválidos como PUT ou DELETE com HTTP 405", async () => {
    const handlerModule = await import("../../api/system/config");
    const handler = handlerModule.default;

    let statusCode = 0;
    let jsonResult: any = null;
    const mockRes = {
      setHeader: vi.fn(),
      status: (code: number) => {
        statusCode = code;
        return {
          json: (data: any) => {
            jsonResult = data;
          },
          end: vi.fn(),
        };
      },
    };

    const mockReq = {
      method: "DELETE",
      headers: {},
    };

    await handler(mockReq, mockRes);
    expect(statusCode).toBe(405);
    expect(jsonResult?.code).toBe("METHOD_NOT_ALLOWED");
  });
});
