import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getSafeAvatarUrl,
  handleAvatarError,
  LOCAL_AVATAR_FALLBACK,
  INLINE_AVATAR_SVG_DATA_URI,
} from "./avatarUtils";

describe("Hardening do Sistema de Avatares e Prevenção de Loops de Erro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. getSafeAvatarUrl", () => {
    it("deve retornar avatarUrl válido e aparado quando fornecido", () => {
      const url = "https://lh3.googleusercontent.com/a/ACg8ocL123=s96-c";
      expect(getSafeAvatarUrl(url, "Aluno Teste")).toBe(url);
    });

    it("deve lidar com null, undefined e string vazia aplicando fallback determinístico do DiceBear", () => {
      expect(getSafeAvatarUrl(null, "Paulo Cauan")).toContain("api.dicebear.com");
      expect(getSafeAvatarUrl(null, "Paulo Cauan")).toContain("Paulo%20Cauan");

      expect(getSafeAvatarUrl(undefined, "Kalil")).toContain("api.dicebear.com");
      expect(getSafeAvatarUrl(undefined, "Kalil")).toContain("Kalil");

      expect(getSafeAvatarUrl("", "Servidor")).toContain("api.dicebear.com");
      expect(getSafeAvatarUrl("   ", "User")).toContain("api.dicebear.com");
    });

    it("deve usar 'User' como fallback de nome quando nome for nulo, indefinido ou vazio", () => {
      expect(getSafeAvatarUrl(null, null)).toContain("seed=User");
      expect(getSafeAvatarUrl(null, "")).toContain("seed=User");
      expect(getSafeAvatarUrl(null, undefined)).toContain("seed=User");
    });
  });

  describe("2. handleAvatarError & Prevenção de Loop Recursivo", () => {
    function createMockImg(src: string): HTMLImageElement {
      const img = {
        src,
        dataset: {} as Record<string, string>,
        onerror: vi.fn() as any,
      } as unknown as HTMLImageElement;
      return img;
    }

    it("Degradação Nível 1: falha na foto primária aplica fallback do DiceBear e desliga onerror", () => {
      const img = createMockImg("https://lh3.googleusercontent.com/blocked-avatar.jpg");
      handleAvatarError({ currentTarget: img }, "Paulo Cauan");

      expect(img.dataset.fallbackApplied).toBe("dicebear");
      expect(img.onerror).toBeNull();
      expect(img.src).toContain("https://api.dicebear.com/7.x/avataaars/svg?seed=Paulo%20Cauan");
    });

    it("Degradação Nível 2 (Offline): falha no DiceBear aplica asset local sem rede /avatar-placeholder.svg", () => {
      const img = createMockImg("https://api.dicebear.com/7.x/avataaars/svg?seed=Paulo%20Cauan");
      img.dataset.fallbackApplied = "dicebear";

      handleAvatarError({ currentTarget: img }, "Paulo Cauan");

      expect(img.dataset.fallbackApplied).toBe("local");
      expect(img.onerror).toBeNull();
      expect(img.src).toBe(LOCAL_AVATAR_FALLBACK);
    });

    it("Degradação Nível 3: falha no asset local aplica inline SVG data URI garantindo disponibilidade", () => {
      const img = createMockImg(LOCAL_AVATAR_FALLBACK);
      img.dataset.fallbackApplied = "local";

      handleAvatarError({ currentTarget: img }, "Paulo Cauan");

      expect(img.dataset.fallbackApplied).toBe("final");
      expect(img.onerror).toBeNull();
      expect(img.src).toBe(INLINE_AVATAR_SVG_DATA_URI);
    });

    it("Prevenção Estrita de Loop: erros subsequentes após estado final JAMAIS alteram src e não entram em loop", () => {
      const img = createMockImg(INLINE_AVATAR_SVG_DATA_URI);
      img.dataset.fallbackApplied = "final";

      // Dispara 5 vezes consecutivas simulando eventos repetidos
      for (let i = 0; i < 5; i++) {
        handleAvatarError({ currentTarget: img }, "Paulo Cauan");
        expect(img.onerror).toBeNull();
        expect(img.src).toBe(INLINE_AVATAR_SVG_DATA_URI);
      }
    });

    it("Transição direta: se a imagem primária já era DiceBear e falhou, salta direto para local sem repetir DiceBear", () => {
      const img = createMockImg("https://api.dicebear.com/7.x/avataaars/svg?seed=User");
      // dataset ainda não preenchido, mas src já é DiceBear
      handleAvatarError({ currentTarget: img }, "User");

      expect(img.dataset.fallbackApplied).toBe("local");
      expect(img.onerror).toBeNull();
      expect(img.src).toBe(LOCAL_AVATAR_FALLBACK);
    });

    it("Lida com URLs expiradas, bloqueadas, nulas ou strings malformadas sem lançar exceções", () => {
      const malformedCases = [
        "data:image/broken",
        "blob:http://localhost/broken",
        "https://invalid.domain.xyz/404.png",
      ];

      for (const brokenSrc of malformedCases) {
        const img = createMockImg(brokenSrc);
        expect(() => handleAvatarError({ currentTarget: img }, "Teste")).not.toThrow();
        expect(img.dataset.fallbackApplied).toBeDefined();
      }
    });
  });
});

describe("Exclusão Administrativa Server-Authoritative e Blindagem contra Inconsistência", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  interface MockAdminRequest {
    method: string;
    headers: Record<string, string>;
    body: any;
    authUser?: {
      uid: string;
      email: string;
      role: "ALUNO" | "SERVIDOR" | "ADMIN";
      isAdmin: boolean;
    };
  }

  interface MockAdminResponse {
    statusCode: number;
    body: any;
    status: (code: number) => MockAdminResponse;
    json: (data: any) => MockAdminResponse;
  }

  function createMockRes(): MockAdminResponse {
    const res: MockAdminResponse = {
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

  // Simulação do endpoint autoritativo /api/admin/delete-user
  async function handleServerDeleteUser(
    req: MockAdminRequest,
    res: MockAdminResponse,
    deps: {
      authDeleteUser: (uid: string) => Promise<void>;
      firestoreDeleteDoc: (col: string, id: string) => Promise<void>;
      firestoreDeleteNotifications: (targetUid: string) => Promise<number>;
      recordAudit: (log: any) => Promise<void>;
    }
  ): Promise<void> {
    if (req.method !== "POST") {
      res.status(405).json({ success: false, error: "Method not allowed. Use POST." });
      return;
    }

    const authHeader = req.headers["authorization"] || req.headers["Authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ success: false, error: "Autenticação obrigatória." });
      return;
    }

    if (!req.authUser || !req.authUser.uid) {
      res.status(401).json({ success: false, error: "Token inválido ou expirado." });
      return;
    }

    if (!req.authUser.isAdmin) {
      res.status(403).json({ success: false, error: "Acesso negado. Apenas administradores autorizados." });
      return;
    }

    const { targetUserId } = req.body || {};
    if (!targetUserId || typeof targetUserId !== "string" || !targetUserId.trim()) {
      res.status(400).json({ success: false, error: "ID de usuário obrigatório." });
      return;
    }

    const cleanTargetId = targetUserId.trim();

    // Bloqueio de autoexclusão
    if (cleanTargetId === req.authUser.uid) {
      res.status(403).json({
        success: false,
        error: "Operação não permitida: um administrador não pode excluir a própria conta.",
      });
      return;
    }

    let authDeleted = false;
    try {
      await deps.authDeleteUser(cleanTargetId);
      authDeleted = true;
    } catch (authErr: any) {
      if (authErr?.code === "auth/user-not-found") {
        // Usuário ausente do Auth mas presente no Firestore -> preserva limpeza de conta órfã!
        authDeleted = true;
      } else {
        res.status(500).json({ success: false, error: "Falha ao remover usuário do Firebase Auth." });
        return;
      }
    }

    let firestoreDeleted = false;
    try {
      await deps.firestoreDeleteDoc("users", cleanTargetId);
      firestoreDeleted = true;
    } catch (fsErr: any) {
      res.status(500).json({ success: false, error: "Falha ao remover usuário do Firestore." });
      return;
    }

    // Limpeza de notificações privadas
    const notifsDeleted = await deps.firestoreDeleteNotifications(cleanTargetId);

    // Auditoria imutável
    await deps.recordAudit({
      objectId: cleanTargetId,
      action: "ACCOUNT_DELETED",
      actorId: req.authUser.uid,
    });

    res.status(200).json({
      success: true,
      message: `Conta do usuário '${cleanTargetId}' excluída com sucesso.`,
      targetUserId: cleanTargetId,
      authDeleted,
      firestoreDeleted,
      notificationsCleaned: notifsDeleted,
      stage: "DELETE_USER_SUCCESS",
    });
  }

  // Simulação do cliente seguro e server-authoritative
  async function clientDeleteUser(
    targetUserId: string,
    currentUser: { id: string; role: string },
    getIdToken: () => Promise<string | null>,
    serverCall: (token: string, body: any) => Promise<{ ok: boolean; status: number; data: any }>,
    clientDirectFirestoreDelete: (uid: string) => Promise<void>
  ): Promise<{ success: boolean; allUsersFiltered: boolean }> {
    if (!targetUserId || !targetUserId.trim()) {
      throw new Error("ID de usuário inválido.");
    }
    if (currentUser.role !== "ADMIN") {
      throw new Error("Apenas o Administrador pode remover usuários.");
    }
    if (targetUserId === currentUser.id) {
      throw new Error("Operação não permitida: Você não pode remover sua própria conta.");
    }

    const token = await getIdToken();
    if (!token) {
      throw new Error("Sessão expirada.");
    }

    const res = await serverCall(token, { targetUserId });
    if (!res.ok) {
      // REGRA OBRIGATÓRIA: Em caso de falha no servidor, o cliente NÃO deve executar deleteDoc()!
      throw new Error(res.data?.error || "Falha na exclusão administrativa.");
    }

    // Sucesso server-authoritative: o cliente apenas atualiza a interface local
    return { success: true, allUsersFiltered: true };
  }

  it("A. Fluxo normal: exclusão pelo endpoint servidor remove Auth + Firestore + Notificações e grava auditoria", async () => {
    const authDeleteMock = vi.fn().mockResolvedValue(undefined);
    const fsDeleteMock = vi.fn().mockResolvedValue(undefined);
    const fsNotifMock = vi.fn().mockResolvedValue(3);
    const auditMock = vi.fn().mockResolvedValue(undefined);

    const req: MockAdminRequest = {
      method: "POST",
      headers: { authorization: "Bearer valid-admin-token" },
      body: { targetUserId: "target-uid-100" },
      authUser: {
        uid: "admin-uid-999",
        email: "paulocauan39@gmail.com",
        role: "ADMIN",
        isAdmin: true,
      },
    };
    const res = createMockRes();

    await handleServerDeleteUser(req, res, {
      authDeleteUser: authDeleteMock,
      firestoreDeleteDoc: fsDeleteMock,
      firestoreDeleteNotifications: fsNotifMock,
      recordAudit: auditMock,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(authDeleteMock).toHaveBeenCalledWith("target-uid-100");
    expect(fsDeleteMock).toHaveBeenCalledWith("users", "target-uid-100");
    expect(fsNotifMock).toHaveBeenCalledWith("target-uid-100");
    expect(auditMock).toHaveBeenCalled();
  });

  it("B. Regra de consistência crítica: falha na API administrativa NÃO provoca deleteDoc() direto pelo cliente", async () => {
    const clientDirectDeleteMock = vi.fn().mockResolvedValue(undefined);

    const serverFailMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      data: { error: "Erro interno no Firebase Auth." },
    });

    await expect(
      clientDeleteUser(
        "target-user-failure",
        { id: "admin-uid-999", role: "ADMIN" },
        async () => "valid-admin-token",
        serverFailMock,
        clientDirectDeleteMock
      )
    ).rejects.toThrow("Erro interno no Firebase Auth.");

    // CLIENTE NUNCA DEVE EXECUTAR deleteDoc() se a API falhar!
    expect(clientDirectDeleteMock).not.toHaveBeenCalled();
  });

  it("C. Preserva limpeza de contas órfãs: usuário ausente do Auth (auth/user-not-found) mas presente no Firestore é removido com sucesso", async () => {
    const authDeleteMock = vi.fn().mockRejectedValue({
      code: "auth/user-not-found",
      message: "No user record found",
    });
    const fsDeleteMock = vi.fn().mockResolvedValue(undefined);
    const fsNotifMock = vi.fn().mockResolvedValue(0);
    const auditMock = vi.fn().mockResolvedValue(undefined);

    const req: MockAdminRequest = {
      method: "POST",
      headers: { authorization: "Bearer valid-admin-token" },
      body: { targetUserId: "orphan-doc-uid" },
      authUser: {
        uid: "admin-uid-999",
        email: "paulocauan39@gmail.com",
        role: "ADMIN",
        isAdmin: true,
      },
    };
    const res = createMockRes();

    await handleServerDeleteUser(req, res, {
      authDeleteUser: authDeleteMock,
      firestoreDeleteDoc: fsDeleteMock,
      firestoreDeleteNotifications: fsNotifMock,
      recordAudit: auditMock,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.authDeleted).toBe(true);
    expect(res.body.firestoreDeleted).toBe(true);
    expect(fsDeleteMock).toHaveBeenCalledWith("users", "orphan-doc-uid");
  });

  it("D. Usuário não autorizado (ALUNO / SERVIDOR) recebe 403 Forbidden e exclusão é barrada", async () => {
    const authDeleteMock = vi.fn();
    const fsDeleteMock = vi.fn();

    const req: MockAdminRequest = {
      method: "POST",
      headers: { authorization: "Bearer student-token" },
      body: { targetUserId: "target-user-200" },
      authUser: {
        uid: "student-uid",
        email: "aluno@estudantes.ifpr.edu.br",
        role: "ALUNO",
        isAdmin: false,
      },
    };
    const res = createMockRes();

    await handleServerDeleteUser(req, res, {
      authDeleteUser: authDeleteMock,
      firestoreDeleteDoc: fsDeleteMock,
      firestoreDeleteNotifications: vi.fn(),
      recordAudit: vi.fn(),
    });

    expect(res.statusCode).toBe(403);
    expect(authDeleteMock).not.toHaveBeenCalled();
    expect(fsDeleteMock).not.toHaveBeenCalled();
  });

  it("E. Requisição sem token ou sem header Authorization recebe 401 Unauthorized", async () => {
    const req: MockAdminRequest = {
      method: "POST",
      headers: {},
      body: { targetUserId: "target-user-200" },
    };
    const res = createMockRes();

    await handleServerDeleteUser(req, res, {
      authDeleteUser: vi.fn(),
      firestoreDeleteDoc: vi.fn(),
      firestoreDeleteNotifications: vi.fn(),
      recordAudit: vi.fn(),
    });

    expect(res.statusCode).toBe(401);
  });

  it("F. Tentativa de autoexclusão de administrador ativa é bloqueada com HTTP 403", async () => {
    const req: MockAdminRequest = {
      method: "POST",
      headers: { authorization: "Bearer admin-token" },
      body: { targetUserId: "admin-uid-999" }, // Admin tenta excluir seu próprio UID
      authUser: {
        uid: "admin-uid-999",
        email: "admin@ifpr.edu.br",
        role: "ADMIN",
        isAdmin: true,
      },
    };
    const res = createMockRes();

    await handleServerDeleteUser(req, res, {
      authDeleteUser: vi.fn(),
      firestoreDeleteDoc: vi.fn(),
      firestoreDeleteNotifications: vi.fn(),
      recordAudit: vi.fn(),
    });

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toContain("um administrador não pode excluir a própria conta");
  });

  it("G. Método GET é terminantemente rejeitado com HTTP 405 Method Not Allowed", async () => {
    const req: MockAdminRequest = {
      method: "GET",
      headers: { authorization: "Bearer admin-token" },
      body: {},
    };
    const res = createMockRes();

    await handleServerDeleteUser(req, res, {
      authDeleteUser: vi.fn(),
      firestoreDeleteDoc: vi.fn(),
      firestoreDeleteNotifications: vi.fn(),
      recordAudit: vi.fn(),
    });

    expect(res.statusCode).toBe(405);
    expect(res.body.error).toContain("Method not allowed");
  });

  it("H. Dados manipulados de identidade (spoofed role/uid) no body são descartados em prol dos claims autenticados", async () => {
    const req: MockAdminRequest = {
      method: "POST",
      headers: { authorization: "Bearer non-admin-token" },
      body: {
        targetUserId: "target-user-500",
        role: "ADMIN", // Tentativa de falsificar permissão no body JSON
        isAdmin: true,
        uid: "admin-forged-uid",
      },
      authUser: {
        uid: "real-servidor-uid",
        email: "servidor@ifpr.edu.br",
        role: "SERVIDOR",
        isAdmin: false, // O token real não possui admin
      },
    };
    const res = createMockRes();

    await handleServerDeleteUser(req, res, {
      authDeleteUser: vi.fn(),
      firestoreDeleteDoc: vi.fn(),
      firestoreDeleteNotifications: vi.fn(),
      recordAudit: vi.fn(),
    });

    expect(res.statusCode).toBe(403);
  });
});
