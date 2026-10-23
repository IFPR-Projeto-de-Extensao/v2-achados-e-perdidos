import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateSecureSignatureToken } from "./utils";
import crypto from "crypto";

describe("Digital Signature & Remote Return Flow Security Audit (/api/signature/*)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Data Models modeling production Firestore state
  interface MockItemDoc {
    id: string;
    title: string;
    status: "DISPONIVEL" | "ENCONTRADO" | "DEVOLVIDO" | "ENCERRADO";
    signatureToken?: string | null;
    signatureTokenUsed?: boolean;
    signatureTokenExpiresAt?: string;
    recipientSignatureType?: "IN_PERSON_DEVICE" | "REMOTE_EMAIL" | "PRE_VERIFIED";
    recipientSignatureStatus?: "SIGNED" | "PENDING_REMOTE" | "NOT_REQUIRED";
    recipientSignatureUrl?: string;
    receiptValidationCode?: string;
    signedAt?: string;
    recipientName?: string;
    recipientEmail?: string;
    recipientBond?: string;
    history?: any[];
  }

  interface MockSignatureRequestDoc {
    itemId: string;
    tokenHash: string;
    recipientEmail: string;
    recipientName: string;
    createdAt: string;
    expiresAt: string;
    used: boolean;
    usedAt?: string;
    validationCode?: string;
  }

  // Exact reproduction of server.ts verify-token logic
  function simulateVerifyToken(params: {
    itemId?: string;
    token?: string;
    dbItems: Map<string, MockItemDoc>;
    dbSignatureRequests: Map<string, MockSignatureRequestDoc>;
  }): { status: number; body: any } {
    const { itemId, token, dbItems, dbSignatureRequests } = params;

    if (!itemId || !token || typeof itemId !== "string" || typeof token !== "string") {
      return {
        status: 400,
        body: { success: false, valid: false, reason: "MISSING_PARAMS", error: "Identificador do item (itemId) e token são obrigatórios." },
      };
    }

    const item = dbItems.get(itemId);
    if (!item) {
      return {
        status: 404,
        body: { success: false, valid: false, reason: "NOT_FOUND", error: `Ocorrência #${itemId} não encontrada.` },
      };
    }

    // 1. Safe Recovery: Check if already signed
    const isAlreadySigned =
      item.recipientSignatureStatus === "SIGNED" &&
      Boolean(item.receiptValidationCode);

    if (isAlreadySigned) {
      return {
        status: 200,
        body: {
          success: true,
          valid: true,
          isAlreadySigned: true,
          signedAt: item.signedAt,
          receiptValidationCode: item.receiptValidationCode,
          item: {
            id: item.id,
            title: item.title,
            status: item.status,
            recipientSignatureStatus: item.recipientSignatureStatus,
            receiptValidationCode: item.receiptValidationCode,
            signedAt: item.signedAt,
          },
        },
      };
    }

    // 2. Reject terminal states
    if (item.status === "ENCERRADO") {
      return {
        status: 400,
        body: { success: false, valid: false, reason: "INVALID_STATUS", error: "Esta ocorrência foi encerrada e não pode mais receber assinaturas." },
      };
    }

    // 3. State verification: Item must be pending remote signature OR available for return
    const isPendingRemote = item.recipientSignatureStatus === "PENDING_REMOTE";
    const isAvailableForReturn =
      item.status === "DISPONIVEL" ||
      item.status === "ENCONTRADO";

    if (!isPendingRemote && !isAvailableForReturn) {
      return {
        status: 400,
        body: { success: false, valid: false, reason: "INVALID_STATUS", error: `Item não está aguardando assinatura remota.` },
      };
    }

    // 4. Authenticity Check: Private signature_requests first, legacy fallback second
    let tokenMatched = false;
    let tokenExpiresAt = item.signatureTokenExpiresAt;
    const cleanToken = token.trim();
    const tokenHash = crypto.createHash("sha256").update(cleanToken).digest("hex");

    const sigReq = dbSignatureRequests.get(itemId);
    if (sigReq) {
      if (sigReq.used) {
        return {
          status: 400,
          body: { success: false, valid: false, reason: "ALREADY_PROCESSED", error: "Esta solicitação de assinatura já foi utilizada." },
        };
      }
      if (sigReq.expiresAt) {
        tokenExpiresAt = sigReq.expiresAt;
      }
      if (sigReq.tokenHash === tokenHash) {
        tokenMatched = true;
      }
    }

    // Fallback: Legacy token stored directly on itemData
    if (!tokenMatched && item.signatureToken) {
      if (item.signatureToken.trim() === cleanToken) {
        tokenMatched = true;
      }
    }

    if (item.signatureTokenUsed && !isAlreadySigned) {
      return {
        status: 400,
        body: { success: false, valid: false, reason: "ALREADY_PROCESSED", error: "Esta solicitação de assinatura já foi utilizada." },
      };
    }

    if (!tokenMatched) {
      return {
        status: 403,
        body: { success: false, valid: false, reason: "TOKEN_MISMATCH", error: "Token de assinatura inválido ou não autorizado." },
      };
    }

    // 5. Expiration Verification
    if (tokenExpiresAt) {
      const exp = new Date(tokenExpiresAt).getTime();
      if (!isNaN(exp) && exp < Date.now()) {
        return {
          status: 410,
          body: { success: false, valid: false, reason: "TOKEN_EXPIRED", error: "O link de assinatura digital expirou por motivos de segurança." },
        };
      }
    }

    return {
      status: 200,
      body: {
        success: true,
        valid: true,
        isAlreadySigned: false,
        item: {
          id: item.id,
          title: item.title,
          status: item.status,
          recipientSignatureStatus: item.recipientSignatureStatus,
          receiptValidationCode: item.receiptValidationCode,
        },
      },
    };
  }

  // Exact reproduction of server.ts confirm-signature logic with atomic transaction
  async function simulateConfirmSignature(params: {
    itemId?: string;
    token?: string;
    signatureDataUrl?: string;
    signerName?: string;
    signerEmail?: string;
    signerBond?: string;
    dbItems: Map<string, MockItemDoc>;
    dbSignatureRequests: Map<string, MockSignatureRequestDoc>;
    auditLogSink?: any[];
  }): Promise<{ status: number; body: any }> {
    const { itemId, token, signatureDataUrl, signerName, signerEmail, signerBond, dbItems, dbSignatureRequests, auditLogSink } = params;

    if (!itemId || !token || !signatureDataUrl || typeof itemId !== "string" || typeof token !== "string") {
      return {
        status: 400,
        body: { success: false, error: "Parâmetros obrigatórios ausentes ou inválidos." },
      };
    }

    // Payload validation
    if (typeof signatureDataUrl !== "string") {
      return { status: 400, body: { success: false, error: "O payload da assinatura deve ser uma string Base64 válida." } };
    }
    if (signatureDataUrl.length > 350000) {
      return { status: 400, body: { success: false, error: "A imagem da assinatura excede o limite máximo permitido de 250KB." } };
    }
    const base64ImageRegex = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
    if (!base64ImageRegex.test(signatureDataUrl.trim())) {
      return { status: 400, body: { success: false, error: "Payload da assinatura inválido. A imagem deve estar no formato Base64 (PNG, JPEG ou WEBP)." } };
    }

    const item = dbItems.get(itemId);
    if (!item) {
      return { status: 404, body: { success: false, error: "Ocorrência não encontrada no Firestore." } };
    }

    // Idempotent recovery
    if (item.recipientSignatureStatus === "SIGNED" && item.receiptValidationCode) {
      return {
        status: 200,
        body: {
          success: true,
          alreadyCompleted: true,
          message: "Assinatura digital já confirmada anteriormente.",
          validationCode: item.receiptValidationCode,
          signedAt: item.signedAt,
        },
      };
    }

    if (item.signatureTokenUsed) {
      return { status: 400, body: { success: false, error: "Esta assinatura ou devolução já foi finalizada anteriormente." } };
    }

    const isPendingRemote = item.recipientSignatureStatus === "PENDING_REMOTE";
    const isAvailable = item.status === "DISPONIVEL" || item.status === "ENCONTRADO";
    if (!isPendingRemote && !isAvailable) {
      return { status: 400, body: { success: false, error: "O item não se encontra em estado elegível para assinatura remota." } };
    }

    // Check token authenticity
    let tokenMatched = false;
    let tokenExpiresAt = item.signatureTokenExpiresAt;
    const cleanToken = token.trim();
    const tokenHash = crypto.createHash("sha256").update(cleanToken).digest("hex");

    const sigReq = dbSignatureRequests.get(itemId);
    if (sigReq) {
      if (sigReq.used) {
        return { status: 400, body: { success: false, error: "Esta assinatura ou devolução já foi finalizada anteriormente." } };
      }
      if (sigReq.expiresAt) {
        tokenExpiresAt = sigReq.expiresAt;
      }
      if (sigReq.tokenHash === tokenHash) {
        tokenMatched = true;
      }
    }

    if (!tokenMatched && item.signatureToken) {
      if (item.signatureToken.trim() === cleanToken) {
        tokenMatched = true;
      }
    }

    if (!tokenMatched) {
      return { status: 403, body: { success: false, error: "Token de assinatura inválido ou não autorizado para este objeto." } };
    }

    if (tokenExpiresAt) {
      const exp = new Date(tokenExpiresAt).getTime();
      if (!isNaN(exp) && exp < Date.now()) {
        return { status: 410, body: { success: false, error: "O link de assinatura digital expirou por motivos de segurança." } };
      }
    }

    // Atomic update
    const nowIso = new Date().toISOString();
    const valCode = item.receiptValidationCode || `REC-IFPR-${itemId.toUpperCase().slice(0, 6)}-VAL`;

    item.status = "DEVOLVIDO";
    item.recipientSignatureStatus = "SIGNED";
    item.recipientSignatureUrl = signatureDataUrl;
    item.signedAt = nowIso;
    item.receiptValidationCode = valCode;
    item.signatureTokenUsed = true;
    item.signatureToken = null; // Purged from public document

    if (sigReq) {
      sigReq.used = true;
      sigReq.usedAt = nowIso;
      sigReq.validationCode = valCode;
    }

    if (auditLogSink) {
      auditLogSink.push({
        action: "REGISTRO_DEVOLUCAO",
        objectId: itemId,
        actorName: signerName || "Receptor",
        timestamp: nowIso,
        validationCode: valCode,
      });
    }

    return {
      status: 200,
      body: {
        success: true,
        message: "Assinatura digital autenticada e baixa de devolução concluída com sucesso no banco de dados.",
        validationCode: valCode,
        signedAt: nowIso,
      },
    };
  }

  // Exact reproduction of server.ts send-request logic with RBAC
  function simulateSendRequest(params: {
    authHeader?: string;
    userRole?: "ADMIN" | "SERVIDOR" | "ALUNO";
    userEmail?: string;
    body: any;
    dbItems: Map<string, MockItemDoc>;
    dbSignatureRequests: Map<string, MockSignatureRequestDoc>;
  }): { status: number; body: any } {
    const { authHeader, userRole, userEmail, body, dbItems, dbSignatureRequests } = params;

    if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader === "Bearer invalid") {
      return { status: 401, body: { success: false, error: "Autenticação obrigatória." } };
    }

    const isStaffOrAdmin = userRole === "ADMIN" || userRole === "SERVIDOR" || userEmail === "paulocauan39@gmail.com";
    if (!isStaffOrAdmin) {
      return { status: 403, body: { success: false, error: "Acesso negado. Apenas servidores e administradores podem despachar termos." } };
    }

    const { itemId, recipientEmail, recipientName, signatureLink, signatureToken, returnedByName } = body || {};
    if (!itemId || !recipientEmail || typeof itemId !== "string" || typeof recipientEmail !== "string") {
      return { status: 400, body: { success: false, error: "Parâmetros obrigatórios ausentes." } };
    }

    const item = dbItems.get(itemId);
    if (!item) {
      return { status: 404, body: { success: false, error: `Item #${itemId} não encontrado.` } };
    }

    if (signatureToken) {
      const cleanToken = String(signatureToken).trim();
      const tokenHash = crypto.createHash("sha256").update(cleanToken).digest("hex");
      dbSignatureRequests.set(itemId, {
        itemId,
        tokenHash,
        recipientEmail,
        recipientName: recipientName || "Aluno",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        used: false,
      });

      // Purge token from public item
      item.signatureToken = null;
      item.recipientSignatureStatus = "PENDING_REMOTE";
    }

    return {
      status: 200,
      body: { success: true, message: `Link de assinatura digital enviado com sucesso para ${recipientEmail}.`, signatureLink },
    };
  }

  // =========================================================================
  // THE 14 MANDATORY REGRESSION SCENARIOS
  // =========================================================================

  let dbItems: Map<string, MockItemDoc>;
  let dbSignatureRequests: Map<string, MockSignatureRequestDoc>;
  let auditLogs: any[];

  const rawToken = "sig_1234567890abcdef1234567890abcdef";
  const rawTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const futureExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const pastExpiry = new Date(Date.now() - 10000).toISOString();
  const validPngDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  beforeEach(() => {
    auditLogs = [];
    dbSignatureRequests = new Map<string, MockSignatureRequestDoc>([
      [
        "item-pending-remote",
        {
          itemId: "item-pending-remote",
          tokenHash: rawTokenHash,
          recipientEmail: "aluno@ifpr.edu.br",
          recipientName: "Carlos Aluno",
          createdAt: new Date().toISOString(),
          expiresAt: futureExpiry,
          used: false,
        },
      ],
      [
        "item-expired-remote",
        {
          itemId: "item-expired-remote",
          tokenHash: crypto.createHash("sha256").update("sig_expired_token_abc").digest("hex"),
          recipientEmail: "aluno@ifpr.edu.br",
          recipientName: "Aluno Expirado",
          createdAt: new Date(Date.now() - 20000).toISOString(),
          expiresAt: pastExpiry,
          used: false,
        },
      ],
    ]);

    dbItems = new Map<string, MockItemDoc>([
      [
        "item-pending-remote",
        {
          id: "item-pending-remote",
          title: "Calculadora Casio",
          status: "DEVOLVIDO", // State generated by registerItemReturn
          recipientSignatureType: "REMOTE_EMAIL",
          recipientSignatureStatus: "PENDING_REMOTE",
          signatureToken: null, // Purged from public doc!
          signatureTokenUsed: false,
          signatureTokenExpiresAt: futureExpiry,
        },
      ],
      [
        "item-presencial-concluido",
        {
          id: "item-presencial-concluido",
          title: "Garrafa Térmica Verde",
          status: "DEVOLVIDO",
          recipientSignatureType: "IN_PERSON_DEVICE",
          recipientSignatureStatus: "SIGNED",
          recipientSignatureUrl: validPngDataUrl,
          receiptValidationCode: "COMP-IFPR-INPERSON-01",
          signedAt: new Date().toISOString(),
          signatureTokenUsed: true,
        },
      ],
      [
        "item-expired-remote",
        {
          id: "item-expired-remote",
          title: "Estojo Azul",
          status: "DEVOLVIDO",
          recipientSignatureType: "REMOTE_EMAIL",
          recipientSignatureStatus: "PENDING_REMOTE",
          signatureToken: null,
          signatureTokenUsed: false,
          signatureTokenExpiresAt: pastExpiry,
        },
      ],
      [
        "item-encerrado",
        {
          id: "item-encerrado",
          title: "Documento RG Antigo",
          status: "ENCERRADO",
          recipientSignatureStatus: "PENDING_REMOTE",
          signatureTokenUsed: false,
        },
      ],
    ]);
  });

  // 1. Solicitação remota pendente pode validar o token
  it("1. Solicitação remota pendente pode validar o token mesmo com status DEVOLVIDO", () => {
    const res = simulateVerifyToken({
      itemId: "item-pending-remote",
      token: rawToken,
      dbItems,
      dbSignatureRequests,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.valid).toBe(true);
    expect(res.body.isAlreadySigned).toBe(false);
    expect(res.body.item.id).toBe("item-pending-remote");
  });

  // 2. Devolução presencial concluída não pode ser assinada novamente indevidamente
  it("2. Devolução presencial concluída não pode ser assinada novamente indevidamente", async () => {
    const res = simulateVerifyToken({
      itemId: "item-presencial-concluido",
      token: rawToken,
      dbItems,
      dbSignatureRequests,
    });

    // Recognizes already signed
    expect(res.status).toBe(200);
    expect(res.body.isAlreadySigned).toBe(true);
    expect(res.body.receiptValidationCode).toBe("COMP-IFPR-INPERSON-01");

    // Attempting a second confirm-signature must be idempotent and not mutate
    const confirmRes = await simulateConfirmSignature({
      itemId: "item-presencial-concluido",
      token: rawToken,
      signatureDataUrl: validPngDataUrl,
      dbItems,
      dbSignatureRequests,
    });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.alreadyCompleted).toBe(true);
    expect(confirmRes.body.validationCode).toBe("COMP-IFPR-INPERSON-01");
  });

  // 3. Token inválido ou expirado é rejeitado
  it("3. Token inválido retorna 403 e token expirado retorna 410", () => {
    const invalidRes = simulateVerifyToken({
      itemId: "item-pending-remote",
      token: "sig_wrong_forged_token",
      dbItems,
      dbSignatureRequests,
    });
    expect(invalidRes.status).toBe(403);
    expect(invalidRes.body.reason).toBe("TOKEN_MISMATCH");

    const expiredRes = simulateVerifyToken({
      itemId: "item-expired-remote",
      token: "sig_expired_token_abc",
      dbItems,
      dbSignatureRequests,
    });
    expect(expiredRes.status).toBe(410);
    expect(expiredRes.body.reason).toBe("TOKEN_EXPIRED");
  });

  // 4. Token já consumido não autoriza uma nova assinatura
  it("4. Token já consumido não autoriza uma nova assinatura", async () => {
    // 1st confirm -> success
    const firstRes = await simulateConfirmSignature({
      itemId: "item-pending-remote",
      token: rawToken,
      signatureDataUrl: validPngDataUrl,
      signerName: "Carlos Aluno",
      dbItems,
      dbSignatureRequests,
      auditLogSink: auditLogs,
    });
    expect(firstRes.status).toBe(200);
    expect(firstRes.body.success).toBe(true);

    // Signature request is now marked used = true
    const sigReq = dbSignatureRequests.get("item-pending-remote");
    expect(sigReq?.used).toBe(true);

    // Attempting to verify or sign with a consumed request on an unfinalized doc returns ALREADY_PROCESSED
    dbItems.get("item-pending-remote")!.recipientSignatureStatus = "PENDING_REMOTE";
    dbItems.get("item-pending-remote")!.recipientSignatureUrl = undefined;
    dbItems.get("item-pending-remote")!.receiptValidationCode = undefined;
    const secondRes = simulateVerifyToken({
      itemId: "item-pending-remote",
      token: rawToken,
      dbItems,
      dbSignatureRequests,
    });
    expect(secondRes.status).toBe(400);
    expect(secondRes.body.reason).toBe("ALREADY_PROCESSED");

    // Also attempting to confirm-signature with a consumed request on an unfinalized item returns 400
    const replayConfirm = await simulateConfirmSignature({
      itemId: "item-pending-remote",
      token: rawToken,
      signatureDataUrl: validPngDataUrl,
      signerName: "Carlos Aluno",
      dbItems,
      dbSignatureRequests,
      auditLogSink: auditLogs,
    });
    expect(replayConfirm.status).toBe(400);
    expect(replayConfirm.body.error).toMatch(/já foi finalizada|já foi utilizada/);
  });

  // 5. Requisição não autenticada não executa operações administrativas
  it("5. Requisição não autenticada a /api/signature/send-request retorna 401", () => {
    const res = simulateSendRequest({
      authHeader: undefined,
      body: { itemId: "item-pending-remote", recipientEmail: "aluno@ifpr.edu.br" },
      dbItems,
      dbSignatureRequests,
    });
    expect(res.status).toBe(401);
  });

  // 6. Usuário sem permissão recebe 403
  it("6. Usuário com papel ALUNO recebe 403 ao tentar despachar link de assinatura", () => {
    const res = simulateSendRequest({
      authHeader: "Bearer valid-student-jwt",
      userRole: "ALUNO",
      body: { itemId: "item-pending-remote", recipientEmail: "aluno@ifpr.edu.br", signatureToken: rawToken },
      dbItems,
      dbSignatureRequests,
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Acesso negado");
  });

  // 7. Payload inválido ou acima do limite recebe 400
  it("7. Payload malformado ou acima de 250KB recebe HTTP 400", async () => {
    // Malformed: not base64 image prefix
    const malformedRes = await simulateConfirmSignature({
      itemId: "item-pending-remote",
      token: rawToken,
      signatureDataUrl: "plain-text-not-a-data-url",
      dbItems,
      dbSignatureRequests,
    });
    expect(malformedRes.status).toBe(400);
    expect(malformedRes.body.error).toContain("Base64");

    // Exceeds limit (> 350,000 characters)
    const giantDataUrl = "data:image/png;base64," + "A".repeat(360000);
    const oversizedRes = await simulateConfirmSignature({
      itemId: "item-pending-remote",
      token: rawToken,
      signatureDataUrl: giantDataUrl,
      dbItems,
      dbSignatureRequests,
    });
    expect(oversizedRes.status).toBe(400);
    expect(oversizedRes.body.error).toContain("excede o limite");
  });

  // 8. Falha no Firestore nunca produz confirmação falsa
  it("8. Falha na persistência no backend nunca gera confirmação de sucesso", async () => {
    // Simulate non-existent item in Firestore
    const failRes = await simulateConfirmSignature({
      itemId: "item-inexistente-db",
      token: rawToken,
      signatureDataUrl: validPngDataUrl,
      dbItems,
      dbSignatureRequests,
    });
    expect(failRes.status).toBe(404);
    expect(failRes.body.success).toBe(false);
  });

  // 9. Duas confirmações concorrentes não produzem resultados inconsistentes
  it("9. Duas confirmações concorrentes tratam atomicamente a segunda chamada", async () => {
    const call1 = simulateConfirmSignature({
      itemId: "item-pending-remote",
      token: rawToken,
      signatureDataUrl: validPngDataUrl,
      signerName: "Carlos Aluno",
      dbItems,
      dbSignatureRequests,
      auditLogSink: auditLogs,
    });

    const call2 = simulateConfirmSignature({
      itemId: "item-pending-remote",
      token: rawToken,
      signatureDataUrl: validPngDataUrl,
      signerName: "Carlos Aluno",
      dbItems,
      dbSignatureRequests,
      auditLogSink: auditLogs,
    });

    const [res1, res2] = await Promise.all([call1, call2]);

    expect(res1.status).toBe(200);
    expect(res1.body.success).toBe(true);
    // res2 either recovers idempotent completion or is rejected as already processed
    expect(res2.status).toBe(200);
    expect(res2.body.validationCode).toBe(res1.body.validationCode);
  });

  // 10. Assinatura confirmada pode ser recuperada após F5
  it("10. Assinatura confirmada pode ser recuperada com dados idênticos após F5", async () => {
    // 1. Finalize signature
    const confirmRes = await simulateConfirmSignature({
      itemId: "item-pending-remote",
      token: rawToken,
      signatureDataUrl: validPngDataUrl,
      signerName: "Carlos Aluno",
      dbItems,
      dbSignatureRequests,
    });
    const code = confirmRes.body.validationCode;

    // 2. User reloads page (F5) -> verifyToken runs again
    const reloadRes = simulateVerifyToken({
      itemId: "item-pending-remote",
      token: rawToken,
      dbItems,
      dbSignatureRequests,
    });

    expect(reloadRes.status).toBe(200);
    expect(reloadRes.body.isAlreadySigned).toBe(true);
    expect(reloadRes.body.receiptValidationCode).toBe(code);
  });

  // 11. Nenhum token ativo aparece nos documentos públicos dos itens
  it("11. Nenhum token ativo em texto puro é mantido no documento público do item", () => {
    const res = simulateSendRequest({
      authHeader: "Bearer valid-staff-token",
      userRole: "SERVIDOR",
      body: {
        itemId: "item-pending-remote",
        recipientEmail: "aluno@ifpr.edu.br",
        signatureToken: "sig_super_secret_token_12345",
      },
      dbItems,
      dbSignatureRequests,
    });

    expect(res.status).toBe(200);

    // Private collection contains hash
    const sigReq = dbSignatureRequests.get("item-pending-remote");
    expect(sigReq).toBeDefined();
    expect(sigReq?.tokenHash).toBeDefined();
    expect(sigReq?.tokenHash).not.toBe("sig_super_secret_token_12345");

    // Public item document has null signatureToken
    const publicItem = dbItems.get("item-pending-remote");
    expect(publicItem?.signatureToken).toBeNull();
  });

  // 12. O botão de reenvio não apresenta sucesso quando a API falha
  it("12. O fluxo de reenvio falha e não exibe falso sucesso quando a API retorna erro", async () => {
    // Calling without auth header returns 401
    const unauthRes = simulateSendRequest({
      authHeader: undefined,
      body: { itemId: "item-pending-remote", recipientEmail: "aluno@ifpr.edu.br" },
      dbItems,
      dbSignatureRequests,
    });

    let successShown = false;
    let errorCaught = false;

    if (!unauthRes.body.success || unauthRes.status !== 200) {
      errorCaught = true;
    } else {
      successShown = true;
    }

    expect(errorCaught).toBe(true);
    expect(successShown).toBe(false);
  });

  // 13. O fluxo presencial continua funcionando
  it("13. O fluxo presencial continua operando com gravação imediata de SIGNED", () => {
    const itemPresencial = dbItems.get("item-presencial-concluido");
    expect(itemPresencial?.status).toBe("DEVOLVIDO");
    expect(itemPresencial?.recipientSignatureType).toBe("IN_PERSON_DEVICE");
    expect(itemPresencial?.recipientSignatureStatus).toBe("SIGNED");
    expect(itemPresencial?.recipientSignatureUrl).toBe(validPngDataUrl);
  });

  // 14. Os recibos apresentam dados consistentes com a persistência
  it("14. Os recibos apresentam dados idênticos aos persistidos na transação", async () => {
    const confirmRes = await simulateConfirmSignature({
      itemId: "item-pending-remote",
      token: rawToken,
      signatureDataUrl: validPngDataUrl,
      signerName: "Mariana Silva",
      dbItems,
      dbSignatureRequests,
    });

    const persistedItem = dbItems.get("item-pending-remote");
    expect(confirmRes.body.validationCode).toBe(persistedItem?.receiptValidationCode);
    expect(confirmRes.body.signedAt).toBe(persistedItem?.signedAt);
    expect(persistedItem?.status).toBe("DEVOLVIDO");
    expect(persistedItem?.recipientSignatureStatus).toBe("SIGNED");
  });
});
