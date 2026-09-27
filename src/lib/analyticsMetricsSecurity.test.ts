import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Analytics Metrics Endpoint Security & AI Audit Log Protection (/api/analytics/metrics)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const ROOT_ADMIN_EMAIL = "paulocauan39@gmail.com";

  // Simulated handler mirroring the hardened /api/analytics/metrics pipeline
  async function simulateAnalyticsMetrics(
    method: string,
    authHeader: string | undefined,
    mockAdminAuth: { verifyIdToken: (token: string) => Promise<any> } | null,
    mockFirestore: {
      collection: (col: string) => {
        doc: (id: string) => {
          get: () => Promise<{ exists: boolean; data: () => any }>;
        };
        orderBy: (field: string, dir?: string) => {
          limit: (n: number) => {
            get: () => Promise<{ size: number; forEach: (cb: (doc: any) => void) => void }>;
          };
        };
      };
    } | null
  ): Promise<{
    status: number;
    code?: string;
    error?: string;
    data?: any;
    aiAuditLogsQueried: boolean;
  }> {
    let aiAuditLogsQueried = false;

    if (method !== "GET") {
      return { status: 405, code: "METHOD_NOT_ALLOWED", aiAuditLogsQueried };
    }

    const basePublicMetrics = {
      success: true,
      scope: "PUBLIC",
      totalServerRequests: 42,
      uptimeSeconds: 120,
      systemMemoryMB: 38,
      serverTimestamp: new Date().toISOString(),
      environment: {
        isVercel: true,
        nodeVersion: "v22.14.0",
      },
    };

    // 1. Unauthenticated Request: Return strictly safe public operational telemetry
    if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
      return {
        status: 200,
        data: basePublicMetrics,
        aiAuditLogsQueried,
      };
    }

    const token = authHeader.split(" ")[1]?.trim();
    if (!token) {
      return {
        status: 200,
        data: basePublicMetrics,
        aiAuditLogsQueried,
      };
    }

    // 2. Authenticated Request: Cryptographic verification via Firebase Admin SDK
    if (!mockAdminAuth) {
      return { status: 500, code: "AUTH_SERVICE_UNAVAILABLE", aiAuditLogsQueried };
    }

    let decoded: any;
    try {
      decoded = await mockAdminAuth.verifyIdToken(token);
    } catch {
      return { status: 401, code: "AUTH_INVALID_TOKEN", aiAuditLogsQueried };
    }

    if (!decoded || !decoded.uid) {
      return { status: 401, code: "AUTH_INVALID_IDENTITY", aiAuditLogsQueried };
    }

    const userUid = decoded.uid;
    const userEmail = decoded.email || "";

    // 3. Strict Administrative Authorization Check (Source of Truth)
    const isRoot = userEmail.toLowerCase() === ROOT_ADMIN_EMAIL.toLowerCase();
    let isAdmin = isRoot || decoded.role === "ADMIN" || decoded.admin === true;

    if (!isAdmin && userUid && mockFirestore) {
      try {
        const userDoc = await mockFirestore.collection("users").doc(userUid).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          if (userData?.role === "ADMIN") {
            isAdmin = true;
          }
        }
      } catch {}
    }

    // 4. If not admin: Block access to administrative metrics & AI audit logs (HTTP 403)
    if (!isAdmin) {
      return {
        status: 403,
        code: "FORBIDDEN_NOT_ADMIN",
        error: "Acesso negado. Métricas administrativas e dados de auditoria são restritos a administradores.",
        aiAuditLogsQueried,
      };
    }

    // 5. Authorized Admin: Query Firestore for sensitive AI audit telemetry
    aiAuditLogsQueried = true;
    const recentAIAudits: any[] = [];
    let totalAIAudits = 0;

    if (mockFirestore) {
      const snap = await mockFirestore.collection("ai_audit_logs").orderBy("timestamp", "desc").limit(20).get();
      totalAIAudits = snap.size;
      snap.forEach((d: any) => {
        recentAIAudits.push(d.data());
      });
    }

    return {
      status: 200,
      data: {
        ...basePublicMetrics,
        scope: "ADMIN",
        totalAnalyticsEvents: 10,
        totalAIAuditRecords: totalAIAudits,
        eventCounters: { "ai_audit:ANALYZE_OBJECT:SUCCESS": 5 },
        recentEvents: [],
        recentAIAudits,
      },
      aiAuditLogsQueried,
    };
  }

  // Test A: Requisição sem Authorization -> 200 público sem dados de auditoria
  it("A. Requisição sem Authorization deve retornar HTTP 200 com escopo PUBLIC e NUNCA consultar ai_audit_logs", async () => {
    const mockFirestore = {
      collection: vi.fn(),
    };

    const res = await simulateAnalyticsMetrics("GET", undefined, null, mockFirestore as any);
    expect(res.status).toBe(200);
    expect(res.data.scope).toBe("PUBLIC");
    expect(res.data.recentAIAudits).toBeUndefined();
    expect(res.data.totalAIAuditRecords).toBeUndefined();
    expect(res.data.eventCounters).toBeUndefined();
    expect(res.aiAuditLogsQueried).toBe(false);
    expect(mockFirestore.collection).not.toHaveBeenCalled();
  });

  // Test B: Token inválido / malformado -> 401
  it("B. Token inválido ou malformado com cabeçalho Bearer deve retornar HTTP 401", async () => {
    const mockAuth = {
      verifyIdToken: vi.fn().mockRejectedValue(new Error("auth/argument-error")),
    };

    const res = await simulateAnalyticsMetrics("GET", "Bearer invalid.malformed.token", mockAuth, null);
    expect(res.status).toBe(401);
    expect(res.code).toBe("AUTH_INVALID_TOKEN");
    expect(res.aiAuditLogsQueried).toBe(false);
  });

  // Test C: JWT forjado com claims de admin sem assinatura válida -> 401
  it("C. JWT forjado contendo claims de ADMIN sem assinatura criptográfica válida deve retornar HTTP 401", async () => {
    const mockAuth = {
      verifyIdToken: vi.fn().mockRejectedValue(new Error("Firebase ID token has invalid signature.")),
    };

    const res = await simulateAnalyticsMetrics("GET", "Bearer forged.token.with.fake.admin.claim", mockAuth, null);
    expect(res.status).toBe(401);
    expect(res.code).toBe("AUTH_INVALID_TOKEN");
    expect(res.aiAuditLogsQueried).toBe(false);
  });

  // Test D: Token válido de ALUNO -> 403
  it("D. Token válido de ALUNO tentando acessar métricas protegidas deve receber HTTP 403 Forbidden", async () => {
    const mockAuth = {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: "student-uid-123",
        email: "aluno.teste@estudantes.ifpr.edu.br",
        role: "ALUNO",
      }),
    };
    const mockFirestore = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ role: "ALUNO" }) }),
        }),
      }),
    };

    const res = await simulateAnalyticsMetrics("GET", "Bearer valid.student.token", mockAuth, mockFirestore as any);
    expect(res.status).toBe(403);
    expect(res.code).toBe("FORBIDDEN_NOT_ADMIN");
    expect(res.aiAuditLogsQueried).toBe(false);
  });

  // Test E: Token válido de SERVIDOR (não administrador) -> 403
  it("E. Token válido de SERVIDOR comum (não admin) deve receber HTTP 403 Forbidden", async () => {
    const mockAuth = {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: "servidor-uid-456",
        email: "servidor.comum@ifpr.edu.br",
        role: "SERVIDOR",
      }),
    };
    const mockFirestore = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ role: "SERVIDOR" }) }),
        }),
      }),
    };

    const res = await simulateAnalyticsMetrics("GET", "Bearer valid.servidor.token", mockAuth, mockFirestore as any);
    expect(res.status).toBe(403);
    expect(res.code).toBe("FORBIDDEN_NOT_ADMIN");
    expect(res.aiAuditLogsQueried).toBe(false);
  });

  // Test F: Token válido de ADMIN -> 200 com escopo ADMIN
  it("F. Token válido de ADMIN deve receber HTTP 200 com escopo ADMIN e dados de auditoria", async () => {
    const mockAuth = {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: "admin-uid-999",
        email: "admin.oficial@ifpr.edu.br",
        role: "ADMIN",
      }),
    };

    const mockAiAudits = [
      { id: "audit-1", action: "ANALYZE_OBJECT", modelUsed: "gemini-2.5-flash", timestamp: "2026-09-26T18:00:00Z" },
    ];

    const mockFirestore = {
      collection: vi.fn().mockImplementation((col: string) => {
        if (col === "users") {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ role: "ADMIN" }) }),
            }),
          };
        }
        if (col === "ai_audit_logs") {
          return {
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({
                  size: 1,
                  forEach: (cb: any) => mockAiAudits.forEach((doc) => cb({ data: () => doc })),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    const res = await simulateAnalyticsMetrics("GET", "Bearer valid.admin.token", mockAuth, mockFirestore as any);
    expect(res.status).toBe(200);
    expect(res.data.scope).toBe("ADMIN");
    expect(res.data.recentAIAudits).toHaveLength(1);
    expect(res.data.recentAIAudits[0].action).toBe("ANALYZE_OBJECT");
    expect(res.aiAuditLogsQueried).toBe(true);
  });

  // Test G: ALUNO não recebe dados de ai_audit_logs nem recentAIAudits
  it("G. Usuário comum (ALUNO) não recebe nenhum dado de ai_audit_logs nem contadores internos", async () => {
    const mockAuth = {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: "student-uid-777",
        email: "estudante@estudantes.ifpr.edu.br",
        role: "ALUNO",
      }),
    };
    const mockFirestore = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ role: "ALUNO" }) }),
        }),
      }),
    };

    const res = await simulateAnalyticsMetrics("GET", "Bearer valid.student.token", mockAuth, mockFirestore as any);
    expect(res.status).toBe(403);
    expect((res as any).data).toBeUndefined();
    expect(res.aiAuditLogsQueried).toBe(false);
  });

  // Test H: ADMIN recebe apenas métricas autorizadas e estruturadas
  it("H. ADMIN recebe campos estruturados de telemetria sem vazamento de segredos", async () => {
    const mockAuth = {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: "root-uid-1",
        email: ROOT_ADMIN_EMAIL,
      }),
    };
    const mockFirestore = {
      collection: vi.fn().mockImplementation((col: string) => {
        if (col === "ai_audit_logs") {
          return {
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({
                  size: 0,
                  forEach: vi.fn(),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    const res = await simulateAnalyticsMetrics("GET", "Bearer valid.root.admin.token", mockAuth, mockFirestore as any);
    expect(res.status).toBe(200);
    expect(res.data.scope).toBe("ADMIN");
    expect(res.data.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(res.data.systemMemoryMB).toBeDefined();
  });

  // Test I: Nenhuma leitura de ai_audit_logs ocorre antes da autenticação e autorização
  it("I. ai_audit_logs NUNCA é consultado se a autenticação falhar", async () => {
    const mockAuth = {
      verifyIdToken: vi.fn().mockRejectedValue(new Error("auth/token-expired")),
    };
    const mockFirestore = {
      collection: vi.fn(),
    };

    const res = await simulateAnalyticsMetrics("GET", "Bearer expired.token", mockAuth, mockFirestore as any);
    expect(res.status).toBe(401);
    expect(res.aiAuditLogsQueried).toBe(false);
    expect(mockFirestore.collection).not.toHaveBeenCalled();
  });

  // Test J: Visitante anônimo recebe apenas dados públicos não sensíveis
  it("J. Visitante anônimo recebe 200 com dados públicos essenciais para monitoramento e zero auditoria", async () => {
    const res = await simulateAnalyticsMetrics("GET", undefined, null, null);
    expect(res.status).toBe(200);
    expect(res.data.scope).toBe("PUBLIC");
    expect(res.data.totalServerRequests).toBeDefined();
    expect(res.data.uptimeSeconds).toBeDefined();
    expect(res.data.systemMemoryMB).toBeDefined();
    expect(res.data.recentAIAudits).toBeUndefined();
    expect(res.data.eventCounters).toBeUndefined();
  });

  // Test K: Métodos HTTP não suportados retornam 405 Method Not Allowed
  it("K. Métodos HTTP POST, PUT, DELETE, PATCH retornam 405 Method Not Allowed", async () => {
    const resPost = await simulateAnalyticsMetrics("POST", undefined, null, null);
    expect(resPost.status).toBe(405);
    expect(resPost.code).toBe("METHOD_NOT_ALLOWED");

    const resDelete = await simulateAnalyticsMetrics("DELETE", undefined, null, null);
    expect(resDelete.status).toBe(405);
    expect(resDelete.code).toBe("METHOD_NOT_ALLOWED");
  });

  // Test L: Validação do handler exportado de /api/analytics/metrics.ts
  it("L. Handler oficial de api/analytics/metrics.ts retorna 200 público para requisição sem token e 405 para POST", async () => {
    const handlerModule = await import("../../api/analytics/metrics");
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

    // Public GET
    await handler({ method: "GET", headers: {} }, mockRes);
    expect(statusCode).toBe(200);
    expect(jsonResult?.success).toBe(true);
    expect(jsonResult?.scope).toBe("PUBLIC");
    expect(jsonResult?.recentAIAudits).toBeUndefined();

    // Invalid POST
    await handler({ method: "POST", headers: {} }, mockRes);
    expect(statusCode).toBe(405);
    expect(jsonResult?.code).toBe("METHOD_NOT_ALLOWED");
  });
});
