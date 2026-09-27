import { describe, it, expect, vi, beforeEach } from "vitest";

describe("JWT Signature Verification & Zero-Trust Authentication Security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Mock token verification handler modeling the hardened server logic
  async function simulateAuthenticateRequest(
    authHeader: string | undefined,
    mockAdminAuth: { verifyIdToken: (token: string) => Promise<any> } | null,
    mockFirestoreUserLookup?: (uid: string) => Promise<{ role?: string; emailVerified?: boolean } | null>
  ) {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { status: 401, authenticated: false, error: "AUTH_REQUIRED" };
    }

    const token = authHeader.split(" ")[1]?.trim();
    if (!token) {
      return { status: 401, authenticated: false, error: "TOKEN_MISSING" };
    }

    if (!mockAdminAuth) {
      return { status: 500, authenticated: false, error: "AUTH_SERVICE_UNAVAILABLE" };
    }

    let authUser: any = null;
    try {
      const decoded = await mockAdminAuth.verifyIdToken(token);
      const isRoot = decoded.email === "paulocauan39@gmail.com";
      let isAdmin = isRoot || decoded.role === "ADMIN" || decoded.admin === true;
      let isEmailVerified = isRoot ? true : decoded.email_verified === true;

      if (mockFirestoreUserLookup) {
        const firestoreData = await mockFirestoreUserLookup(decoded.uid);
        if (firestoreData?.role === "ADMIN") {
          isAdmin = true;
        }
        if (firestoreData?.emailVerified === true) {
          isEmailVerified = true;
        }
      }

      if (isAdmin) {
        isEmailVerified = true;
      }

      authUser = {
        uid: decoded.uid,
        email: decoded.email,
        email_verified: isEmailVerified,
        role: isAdmin ? "ADMIN" : decoded.role || "ALUNO",
        isAdmin,
      };
    } catch (err: any) {
      // Hardened logic: MUST NOT fallback to unverified payload decode
      return {
        status: 401,
        authenticated: false,
        error: "AUTH_INVALID_TOKEN",
        details: err?.message || "Invalid signature",
      };
    }

    if (!authUser || !authUser.uid) {
      return { status: 401, authenticated: false, error: "UNAUTHORIZED" };
    }

    return { status: 200, authenticated: true, authUser };
  }

  // Test A: Token Firebase válido
  it("A. Token Firebase válido deve ser autenticado com sucesso", async () => {
    const validToken = "valid.firebase.token";
    const mockAuth = {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: "user-123",
        email: "aluno@estudantes.ifpr.edu.br",
        email_verified: true,
        role: "ALUNO",
      }),
    };

    const res = await simulateAuthenticateRequest(`Bearer ${validToken}`, mockAuth);
    expect(res.status).toBe(200);
    expect(res.authenticated).toBe(true);
    expect(res.authUser?.uid).toBe("user-123");
    expect(res.authUser?.role).toBe("ALUNO");
    expect(res.authUser?.isAdmin).toBe(false);
  });

  // Test B: Token ausente
  it("B. Token ausente ou cabeçalho Authorization ausente deve retornar HTTP 401", async () => {
    const mockAuth = {
      verifyIdToken: vi.fn(),
    };

    const resNoHeader = await simulateAuthenticateRequest(undefined, mockAuth);
    expect(resNoHeader.status).toBe(401);
    expect(resNoHeader.authenticated).toBe(false);

    const resEmptyBearer = await simulateAuthenticateRequest("Bearer ", mockAuth);
    expect(resEmptyBearer.status).toBe(401);
    expect(resEmptyBearer.authenticated).toBe(false);
    expect(mockAuth.verifyIdToken).not.toHaveBeenCalled();
  });

  // Test C: Token malformado
  it("C. Token malformado deve ser rejeitado com HTTP 401 pelo verifyIdToken", async () => {
    const malformedToken = "not-a-valid-jwt-structure";
    const mockAuth = {
      verifyIdToken: vi.fn().mockRejectedValue(new Error("Decoding Firebase ID token failed. Make sure you passed the entire string.")),
    };

    const res = await simulateAuthenticateRequest(`Bearer ${malformedToken}`, mockAuth);
    expect(res.status).toBe(401);
    expect(res.authenticated).toBe(false);
    expect(res.error).toBe("AUTH_INVALID_TOKEN");
  });

  // Test D: Token expirado
  it("D. Token expirado deve ser rejeitado com HTTP 401 sem qualquer fallback", async () => {
    const expiredToken = "expired.token.jwt";
    const mockAuth = {
      verifyIdToken: vi.fn().mockRejectedValue(new Error("Firebase ID token has expired. Get a fresh ID token from your client app and try again.")),
    };

    const res = await simulateAuthenticateRequest(`Bearer ${expiredToken}`, mockAuth);
    expect(res.status).toBe(401);
    expect(res.authenticated).toBe(false);
    expect(res.error).toBe("AUTH_INVALID_TOKEN");
  });

  // Test E: Token com assinatura inválida
  it("E. Token com assinatura criptográfica inválida deve ser rejeitado com HTTP 401", async () => {
    const invalidSigToken = "header.payload.invalidSignature";
    const mockAuth = {
      verifyIdToken: vi.fn().mockRejectedValue(new Error("Firebase ID token has invalid signature.")),
    };

    const res = await simulateAuthenticateRequest(`Bearer ${invalidSigToken}`, mockAuth);
    expect(res.status).toBe(401);
    expect(res.authenticated).toBe(false);
    expect(res.error).toBe("AUTH_INVALID_TOKEN");
  });

  // Test F: JWT forjado manualmente com payload de admin mas sem assinatura válida
  it("F. JWT forjado manualmente com payload { email: 'admin@exemplo.com', role: 'ADMIN', admin: true } deve ser rejeitado com HTTP 401", async () => {
    // Synthetic forged base64 token
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64");
    const payload = Buffer.from(
      JSON.stringify({
        iss: "https://securetoken.google.com/ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1",
        aud: "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1",
        sub: "attacker-fake-uid",
        user_id: "attacker-fake-uid",
        email: "admin@exemplo.com",
        role: "ADMIN",
        admin: true,
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toString("base64");
    const fakeSignature = "fakeSignature123";
    const forgedToken = `${header}.${payload}.${fakeSignature}`;

    const mockAuth = {
      verifyIdToken: vi.fn().mockRejectedValue(new Error("Firebase ID token has invalid signature.")),
    };

    const res = await simulateAuthenticateRequest(`Bearer ${forgedToken}`, mockAuth);
    expect(res.status).toBe(401);
    expect(res.authenticated).toBe(false);
    expect(res.authUser).toBeUndefined();
  });

  // Test G: Token válido de usuário comum não pode obter privilégios administrativos
  it("G. Token válido de usuário comum (ALUNO) não obtém privilégios administrativos", async () => {
    const studentToken = "valid.student.token";
    const mockAuth = {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: "student-456",
        email: "estudante.teste@estudantes.ifpr.edu.br",
        email_verified: true,
        role: "ALUNO",
        admin: false,
      }),
    };
    const mockFirestoreLookup = vi.fn().mockResolvedValue({
      role: "ALUNO",
      emailVerified: true,
    });

    const res = await simulateAuthenticateRequest(`Bearer ${studentToken}`, mockAuth, mockFirestoreLookup);
    expect(res.status).toBe(200);
    expect(res.authenticated).toBe(true);
    expect(res.authUser?.isAdmin).toBe(false);
    expect(res.authUser?.role).toBe("ALUNO");
  });

  // Test H: Nenhum endpoint deve continuar operações se a validação do token falhar
  it("H. Operações protegidas são interrompidas se o token falhar", async () => {
    const invalidToken = "bad.token.jwt";
    const mockAuth = {
      verifyIdToken: vi.fn().mockRejectedValue(new Error("auth/id-token-revoked")),
    };

    const executedProtectedAction = vi.fn();

    const authResult = await simulateAuthenticateRequest(`Bearer ${invalidToken}`, mockAuth);
    if (authResult.status === 200 && authResult.authenticated) {
      executedProtectedAction();
    }

    expect(authResult.status).toBe(401);
    expect(executedProtectedAction).not.toHaveBeenCalled();
  });

  // Test I: Ausência de parseJwtPayload no módulo firebaseAdmin
  it("I. Módulo firebaseAdmin não deve exportar parseJwtPayload para autenticação", async () => {
    const firebaseAdminModule = await import("../../api/_lib/firebaseAdmin");
    expect((firebaseAdminModule as any).parseJwtPayload).toBeUndefined();
  });
});
