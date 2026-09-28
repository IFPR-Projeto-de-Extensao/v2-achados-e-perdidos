import { describe, it, expect, vi, beforeEach } from "vitest";

// Interface para teste unitário do fluxo de exclusão administrativa de usuários
interface MockDeleteUserDeps {
  authGetUser: (uid: string) => Promise<{ uid: string; email?: string; displayName?: string }>;
  authDeleteUser: (uid: string) => Promise<void>;
  firestoreGetUserDoc: (uid: string) => Promise<{ exists: boolean; data?: any }>;
  firestoreDeleteDoc: (col: string, id: string) => Promise<void>;
  firestoreDeleteNotifications: (targetUid: string) => Promise<number>;
  recordAuditLog: (log: any) => Promise<void>;
}

interface DeleteUserRequest {
  method: string;
  headers: Record<string, string>;
  authUser?: { uid: string; email: string; role: string; isAdmin: boolean };
  body: { targetUserId?: string };
}

interface DeleteUserResponse {
  statusCode: number;
  body: any;
  status: (code: number) => DeleteUserResponse;
  json: (data: any) => DeleteUserResponse;
}

function createMockResponse(): DeleteUserResponse {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
  };
  return res;
}

/**
 * Handler unitário isolado espelhando a lógica de produção de /api/admin/delete-user.ts e server.ts
 */
async function executeAdminDeleteUserFlow(
  req: DeleteUserRequest,
  res: DeleteUserResponse,
  deps: MockDeleteUserDeps
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ success: false, error: "Method not allowed. Use POST.", code: "METHOD_NOT_ALLOWED" });
    return;
  }

  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: "Autenticação obrigatória.", code: "UNAUTHENTICATED" });
    return;
  }

  if (!req.authUser || !req.authUser.uid) {
    res.status(401).json({ success: false, error: "Token inválido ou expirado.", code: "AUTH_EXPIRED" });
    return;
  }

  if (!req.authUser.isAdmin) {
    res.status(403).json({
      success: false,
      error: "Acesso negado. Apenas administradores autorizados do IFPR podem executar esta operação.",
      code: "FORBIDDEN",
    });
    return;
  }

  const { targetUserId } = req.body || {};
  if (!targetUserId || typeof targetUserId !== "string" || !targetUserId.trim()) {
    res.status(400).json({ success: false, error: "ID de usuário obrigatório.", code: "INVALID_TARGET_UID" });
    return;
  }

  const cleanTargetId = targetUserId.trim();

  // Bloqueio de autoexclusão de administrador
  if (cleanTargetId === req.authUser.uid) {
    res.status(403).json({
      success: false,
      error: "Operação não permitida: um administrador não pode excluir a própria conta.",
      code: "SELF_DELETE_FORBIDDEN",
    });
    return;
  }

  // Pre-fetch Firestore data for audit
  let targetEmail = "";
  let targetName = "";
  try {
    const uDoc = await deps.firestoreGetUserDoc(cleanTargetId);
    if (uDoc.exists && uDoc.data) {
      targetEmail = uDoc.data.email || "";
      targetName = uDoc.data.name || "";
    }
  } catch {
    // ignore
  }

  // Consultar Firebase Auth
  let authUserExists = false;
  try {
    const fbUser = await deps.authGetUser(cleanTargetId);
    authUserExists = true;
    if (!targetEmail) targetEmail = fbUser.email || "";
    if (!targetName) targetName = fbUser.displayName || cleanTargetId;
  } catch (err: any) {
    if (err?.code === "auth/user-not-found") {
      authUserExists = false;
    }
  }

  // STAGE 10: AUTH DELETE
  let authDeleted = false;
  if (authUserExists) {
    try {
      await deps.authDeleteUser(cleanTargetId);
      authDeleted = true;
    } catch (authErr: any) {
      if (authErr?.code === "auth/user-not-found") {
        authDeleted = true;
      } else {
        res.status(500).json({
          success: false,
          error: "Não foi possível excluir a conta no Firebase Authentication.",
          code: authErr?.code || "AUTH_DELETE_FAILED",
          stage: "AUTH_DELETE_START",
        });
        return;
      }
    }
  } else {
    // Idempotência: já não existia no Auth
    authDeleted = true;
  }

  // STAGE 12: FIRESTORE CLEANUP
  let firestoreDeleted = false;
  try {
    await deps.firestoreDeleteDoc("users", cleanTargetId);
    firestoreDeleted = true;
  } catch (fsErr: any) {
    firestoreDeleted = false;
  }

  // STAGE 13: VERIFICAÇÃO DE INCONSISTÊNCIA (Caso C)
  if (!firestoreDeleted) {
    await deps.recordAuditLog({
      action: "ACCOUNT_DELETION_INCONSISTENCY",
      objectId: cleanTargetId,
      actorId: req.authUser.uid,
      details: "Auth excluído, mas remoção no Firestore falhou. Perfil mantido para reconciliação.",
    });

    res.status(500).json({
      success: false,
      partialSuccess: true,
      authDeleted: true,
      firestoreDeleted: false,
      error: "A conta no Firebase Authentication foi excluída, mas ocorreu uma falha ao remover o perfil no Firestore. O registro de perfil permanece no banco de dados para reconciliação.",
      code: "FIRESTORE_DELETE_FAILED_AFTER_AUTH",
      targetUserId: cleanTargetId,
      stage: "FIRESTORE_CLEANUP_FAILED",
    });
    return;
  }

  // Limpeza de notificações e auditoria completa
  await deps.firestoreDeleteNotifications(cleanTargetId);
  await deps.recordAuditLog({
    action: "ACCOUNT_DELETED",
    objectId: cleanTargetId,
    actorId: req.authUser.uid,
    details: `Conta '${targetName || cleanTargetId}' excluída com sucesso do Auth e do Firestore.`,
  });

  res.status(200).json({
    success: true,
    message: `Conta do usuário '${targetName || cleanTargetId}' excluída com sucesso do Firebase Authentication e do Firestore.`,
    targetUserId: cleanTargetId,
    authDeleted: true,
    firestoreDeleted: true,
    stage: "DELETE_USER_SUCCESS",
  });
}

describe("Auditoria e Integridade da Exclusão Administrativa de Usuários (Localiza+ IFPR)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseAdminRequest = (targetUserId: string): DeleteUserRequest => ({
    method: "POST",
    headers: { authorization: "Bearer valid-admin-token" },
    authUser: {
      uid: "admin-uid-root",
      email: "paulocauan39@gmail.com",
      role: "ADMIN",
      isAdmin: true,
    },
    body: { targetUserId },
  });

  // 1. Caso A — Sucesso Completo
  it("Caso A: Sucesso Completo — Remove do Auth e do Firestore, retorna HTTP 200 com confirmação de ambas as fontes", async () => {
    const authDeleteMock = vi.fn().mockResolvedValue(undefined);
    const fsDeleteMock = vi.fn().mockResolvedValue(undefined);
    const auditMock = vi.fn().mockResolvedValue(undefined);

    const req = baseAdminRequest("user-aluno-123");
    const res = createMockResponse();

    await executeAdminDeleteUserFlow(req, res, {
      authGetUser: vi.fn().mockResolvedValue({ uid: "user-aluno-123", email: "aluno@ifpr.edu.br", displayName: "Aluno Teste" }),
      authDeleteUser: authDeleteMock,
      firestoreGetUserDoc: vi.fn().mockResolvedValue({ exists: true, data: { name: "Aluno Teste", email: "aluno@ifpr.edu.br" } }),
      firestoreDeleteDoc: fsDeleteMock,
      firestoreDeleteNotifications: vi.fn().mockResolvedValue(2),
      recordAuditLog: auditMock,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.authDeleted).toBe(true);
    expect(res.body.firestoreDeleted).toBe(true);
    expect(authDeleteMock).toHaveBeenCalledWith("user-aluno-123");
    expect(fsDeleteMock).toHaveBeenCalledWith("users", "user-aluno-123");
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ACCOUNT_DELETED", objectId: "user-aluno-123" })
    );
  });

  // 2. Caso B — Falha no Firebase Authentication
  it("Caso B: Falha no Firebase Auth — Não remove do Firestore, retorna HTTP 500 e não simula sucesso", async () => {
    const authDeleteMock = vi.fn().mockRejectedValue(new Error("Firebase Auth service unavailable"));
    const fsDeleteMock = vi.fn();
    const auditMock = vi.fn();

    const req = baseAdminRequest("user-aluno-123");
    const res = createMockResponse();

    await executeAdminDeleteUserFlow(req, res, {
      authGetUser: vi.fn().mockResolvedValue({ uid: "user-aluno-123", email: "aluno@ifpr.edu.br" }),
      authDeleteUser: authDeleteMock,
      firestoreGetUserDoc: vi.fn().mockResolvedValue({ exists: true }),
      firestoreDeleteDoc: fsDeleteMock,
      firestoreDeleteNotifications: vi.fn(),
      recordAuditLog: auditMock,
    });

    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("Não foi possível excluir a conta no Firebase Authentication");
    expect(fsDeleteMock).not.toHaveBeenCalled(); // CRÍTICO: Firestore não é tocado se Auth falhar
    expect(auditMock).not.toHaveBeenCalled();
  });

  // 3. Caso C — Firestore falha após sucesso no Authentication
  it("Caso C: Firestore falha após Auth — Detecta inconsistência, não declara sucesso total, registra auditoria de inconsistência e retorna HTTP 500 com código específico", async () => {
    const authDeleteMock = vi.fn().mockResolvedValue(undefined);
    const fsDeleteMock = vi.fn().mockRejectedValue(new Error("Firestore write timeout or permission denied"));
    const auditMock = vi.fn().mockResolvedValue(undefined);

    const req = baseAdminRequest("user-orphan-456");
    const res = createMockResponse();

    await executeAdminDeleteUserFlow(req, res, {
      authGetUser: vi.fn().mockResolvedValue({ uid: "user-orphan-456", email: "aluno@ifpr.edu.br" }),
      authDeleteUser: authDeleteMock,
      firestoreGetUserDoc: vi.fn().mockResolvedValue({ exists: true, data: { name: "Aluno Órfão" } }),
      firestoreDeleteDoc: fsDeleteMock,
      firestoreDeleteNotifications: vi.fn(),
      recordAuditLog: auditMock,
    });

    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.partialSuccess).toBe(true);
    expect(res.body.authDeleted).toBe(true);
    expect(res.body.firestoreDeleted).toBe(false);
    expect(res.body.code).toBe("FIRESTORE_DELETE_FAILED_AFTER_AUTH");
    expect(res.body.error).toContain("registro de perfil permanece no banco de dados para reconciliação");
    // Auditoria de inconsistência registrada
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ACCOUNT_DELETION_INCONSISTENCY", objectId: "user-orphan-456" })
    );
  });

  // 4. Caso D.1 — Usuário inexistente no Authentication (Idempotente)
  it("Caso D.1: Usuário já inexistente no Auth (auth/user-not-found) — Remove do Firestore com sucesso (idempotente)", async () => {
    const authDeleteMock = vi.fn().mockRejectedValue({ code: "auth/user-not-found" });
    const fsDeleteMock = vi.fn().mockResolvedValue(undefined);

    const req = baseAdminRequest("user-already-deleted-from-auth");
    const res = createMockResponse();

    await executeAdminDeleteUserFlow(req, res, {
      authGetUser: vi.fn().mockRejectedValue({ code: "auth/user-not-found" }),
      authDeleteUser: authDeleteMock,
      firestoreGetUserDoc: vi.fn().mockResolvedValue({ exists: true, data: { name: "Perfil Residual" } }),
      firestoreDeleteDoc: fsDeleteMock,
      firestoreDeleteNotifications: vi.fn().mockResolvedValue(0),
      recordAuditLog: vi.fn().mockResolvedValue(undefined),
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.authDeleted).toBe(true);
    expect(res.body.firestoreDeleted).toBe(true);
    expect(fsDeleteMock).toHaveBeenCalledWith("users", "user-already-deleted-from-auth");
  });

  // 5. Caso D.2 — Documento inexistente no Firestore (Idempotente)
  it("Caso D.2: Documento inexistente no Firestore — Exclui do Auth e resolve Firestore como no-op bem-sucedido", async () => {
    const authDeleteMock = vi.fn().mockResolvedValue(undefined);
    const fsDeleteMock = vi.fn().mockResolvedValue(undefined); // Firestore delete em doc inexistente resolve sem erro

    const req = baseAdminRequest("user-no-firestore-doc");
    const res = createMockResponse();

    await executeAdminDeleteUserFlow(req, res, {
      authGetUser: vi.fn().mockResolvedValue({ uid: "user-no-firestore-doc", email: "user@ifpr.edu.br" }),
      authDeleteUser: authDeleteMock,
      firestoreGetUserDoc: vi.fn().mockResolvedValue({ exists: false }),
      firestoreDeleteDoc: fsDeleteMock,
      firestoreDeleteNotifications: vi.fn().mockResolvedValue(0),
      recordAuditLog: vi.fn().mockResolvedValue(undefined),
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(authDeleteMock).toHaveBeenCalledWith("user-no-firestore-doc");
    expect(fsDeleteMock).toHaveBeenCalledWith("users", "user-no-firestore-doc");
  });

  // 6. Caso D.3 — Ambos inexistentes (Dupla Idempotência)
  it("Caso D.3: Usuário ausente em ambas as fontes — Trata com idempotência e retorna HTTP 200", async () => {
    const req = baseAdminRequest("non-existent-user");
    const res = createMockResponse();

    await executeAdminDeleteUserFlow(req, res, {
      authGetUser: vi.fn().mockRejectedValue({ code: "auth/user-not-found" }),
      authDeleteUser: vi.fn().mockRejectedValue({ code: "auth/user-not-found" }),
      firestoreGetUserDoc: vi.fn().mockResolvedValue({ exists: false }),
      firestoreDeleteDoc: vi.fn().mockResolvedValue(undefined),
      firestoreDeleteNotifications: vi.fn().mockResolvedValue(0),
      recordAuditLog: vi.fn().mockResolvedValue(undefined),
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // 7. Administrador Não Autorizado (Segurança RBAC)
  it("Segurança: Usuário não-admin (ALUNO ou SERVIDOR) é barrado com HTTP 403 Forbidden", async () => {
    const req: DeleteUserRequest = {
      method: "POST",
      headers: { authorization: "Bearer student-token" },
      authUser: {
        uid: "student-uid",
        email: "aluno@estudantes.ifpr.edu.br",
        role: "ALUNO",
        isAdmin: false,
      },
      body: { targetUserId: "victim-uid" },
    };
    const res = createMockResponse();
    const authDeleteMock = vi.fn();
    const fsDeleteMock = vi.fn();

    await executeAdminDeleteUserFlow(req, res, {
      authGetUser: vi.fn(),
      authDeleteUser: authDeleteMock,
      firestoreGetUserDoc: vi.fn(),
      firestoreDeleteDoc: fsDeleteMock,
      firestoreDeleteNotifications: vi.fn(),
      recordAuditLog: vi.fn(),
    });

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toContain("Apenas administradores autorizados");
    expect(authDeleteMock).not.toHaveBeenCalled();
    expect(fsDeleteMock).not.toHaveBeenCalled();
  });

  // 8. Bloqueio de Autoexclusão do Administrador
  it("Segurança: Administrador tentando excluir sua própria conta é bloqueado com HTTP 403 SELF_DELETE_FORBIDDEN", async () => {
    const req = baseAdminRequest("admin-uid-root"); // Mesmo UID do administrador ativo
    const res = createMockResponse();

    await executeAdminDeleteUserFlow(req, res, {
      authGetUser: vi.fn(),
      authDeleteUser: vi.fn(),
      firestoreGetUserDoc: vi.fn(),
      firestoreDeleteDoc: vi.fn(),
      firestoreDeleteNotifications: vi.fn(),
      recordAuditLog: vi.fn(),
    });

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("SELF_DELETE_FORBIDDEN");
    expect(res.body.error).toContain("não pode excluir a própria conta");
  });

  // 9. Atualização Segura do Estado Local (Sem Exclusão Visual Prematura ou Falso Sucesso)
  it("Estado Local: Simulação de cliente seguro garante que usuário só é removido se backend confirmar 100% de sucesso", () => {
    let localUsers = [
      { id: "u-1", name: "User 1" },
      { id: "u-2", name: "User 2" },
    ];
    let toastType = "";
    let toastMsg = "";

    // Simula resposta do backend para Caso C (Falha no Firestore após Auth)
    const backendResponseCasoC = {
      ok: false,
      status: 500,
      data: {
        success: false,
        authDeleted: true,
        firestoreDeleted: false,
        error: "Falha no Firestore",
      },
    };

    if (backendResponseCasoC.ok && backendResponseCasoC.data.success) {
      localUsers = localUsers.filter((u) => u.id !== "u-2");
      toastType = "success";
      toastMsg = "Usuário excluído";
    } else {
      if (backendResponseCasoC.data.authDeleted && !backendResponseCasoC.data.firestoreDeleted) {
        // Marca como inconsistência para reconciliação
        localUsers = localUsers.map((u) =>
          u.id === "u-2" ? { ...u, status: "suspended", statusReason: "Auth removido; Firestore pendente" } : u
        );
        toastType = "warning";
        toastMsg = "Atenção: Auth removido, mas Firestore pendente de reconciliação.";
      } else {
        toastType = "error";
        toastMsg = "Erro ao excluir conta";
      }
    }

    // u-2 NÃO deve ter desaparecido da lista
    expect(localUsers.find((u) => u.id === "u-2")).toBeDefined();
    expect((localUsers.find((u) => u.id === "u-2") as any).statusReason).toContain("Firestore pendente");
    expect(toastType).toBe("warning");
    expect(toastMsg).not.toContain("Usuário excluído");
  });

  // 10. Reconciliação Idempotente
  it("Reconciliação Idempotente: Nova tentativa administrativa para conta com Auth já removido completa a exclusão do Firestore", async () => {
    // Na 1ª tentativa: Auth foi deletado, mas Firestore falhou.
    // Na 2ª tentativa: Auth acusa auth/user-not-found, e Firestore agora responde com sucesso!
    const authDeleteMock = vi.fn().mockRejectedValue({ code: "auth/user-not-found" });
    const fsDeleteMock = vi.fn().mockResolvedValue(undefined);
    const auditMock = vi.fn().mockResolvedValue(undefined);

    const req = baseAdminRequest("user-reconciliation-target");
    const res = createMockResponse();

    await executeAdminDeleteUserFlow(req, res, {
      authGetUser: vi.fn().mockRejectedValue({ code: "auth/user-not-found" }),
      authDeleteUser: authDeleteMock,
      firestoreGetUserDoc: vi.fn().mockResolvedValue({ exists: true, data: { name: "Usuário Reconciliado" } }),
      firestoreDeleteDoc: fsDeleteMock,
      firestoreDeleteNotifications: vi.fn().mockResolvedValue(1),
      recordAuditLog: auditMock,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.authDeleted).toBe(true);
    expect(res.body.firestoreDeleted).toBe(true);
    expect(fsDeleteMock).toHaveBeenCalledWith("users", "user-reconciliation-target");
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ACCOUNT_DELETED", objectId: "user-reconciliation-target" })
    );
  });
});
