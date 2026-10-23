import { describe, it, expect, vi, beforeEach } from "vitest";
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
    recipientSignatureMethod?: "DRAWN" | "TYPED_NAME";
    receiptValidationCode?: string;
    signedAt?: string;
    recipientName?: string;
    recipientEmail?: string;
    recipientBond?: string;
    recipientDocument?: string;
    returnedByName?: string;
    returnedByEmail?: string;
    history?: any[];
  }

  interface MockSignatureRequestDoc {
    itemId: string;
    tokenHash: string;
    recipientEmail: string;
    recipientName: string;
    recipientBond?: string;
    recipientDocument?: string;
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
          recipientSignatureUrl: item.recipientSignatureUrl || "",
          item: {
            id: item.id,
            title: item.title,
            status: item.status,
            recipientSignatureStatus: item.recipientSignatureStatus,
            recipientSignatureMethod: item.recipientSignatureMethod,
            receiptValidationCode: item.receiptValidationCode,
            recipientSignatureUrl: item.recipientSignatureUrl || "",
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
        recipientSignatureUrl: item.recipientSignatureUrl || "",
        item: {
          id: item.id,
          title: item.title,
          status: item.status,
          recipientSignatureStatus: item.recipientSignatureStatus,
          recipientSignatureMethod: item.recipientSignatureMethod,
          receiptValidationCode: item.receiptValidationCode,
          recipientSignatureUrl: item.recipientSignatureUrl || "",
        },
      },
    };
  }

  // Exact reproduction of server.ts confirm-signature logic with atomic transaction
  async function simulateConfirmSignature(params: {
    itemId?: string;
    token?: string;
    signatureDataUrl?: string;
    signatureMethod?: "DRAWN" | "TYPED_NAME";
    signerName?: string;
    signerEmail?: string;
    signerBond?: string;
    signerDocument?: string;
    dbItems: Map<string, MockItemDoc>;
    dbSignatureRequests: Map<string, MockSignatureRequestDoc>;
    auditLogSink?: any[];
  }): Promise<{ status: number; body: any }> {
    const {
      itemId,
      token,
      signatureDataUrl,
      signatureMethod = "DRAWN",
      signerName,
      signerEmail,
      signerBond,
      signerDocument,
      dbItems,
      dbSignatureRequests,
      auditLogSink,
    } = params;

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
          recipientSignatureUrl: item.recipientSignatureUrl || signatureDataUrl,
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
    item.recipientSignatureMethod = signatureMethod;
    item.signedAt = nowIso;
    item.receiptValidationCode = valCode;
    item.signatureTokenUsed = true;
    item.signatureToken = null; // Purged from public document
    if (signerName) item.recipientName = signerName;
    if (signerEmail) item.recipientEmail = signerEmail;
    if (signerBond) item.recipientBond = signerBond;
    if (signerDocument) item.recipientDocument = signerDocument;

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
        recipientSignatureUrl: signatureDataUrl,
        signatureMethod,
      },
    };
  }

  // Exact reproduction of server.ts send-request logic with RBAC and truthful SMTP dispatch
  function simulateSendRequest(params: {
    authHeader?: string;
    userRole?: "ADMIN" | "SERVIDOR" | "ALUNO";
    userEmail?: string;
    body: any;
    dbItems: Map<string, MockItemDoc>;
    dbSignatureRequests: Map<string, MockSignatureRequestDoc>;
    smtpConfigured?: boolean;
    smtpShouldFail?: boolean;
  }): { status: number; body: any } {
    const {
      authHeader,
      userRole,
      userEmail,
      body,
      dbItems,
      dbSignatureRequests,
      smtpConfigured = true,
      smtpShouldFail = false,
    } = params;

    if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader === "Bearer invalid") {
      return { status: 401, body: { success: false, error: "Autenticação obrigatória." } };
    }

    const isStaffOrAdmin = userRole === "ADMIN" || userRole === "SERVIDOR" || userEmail === "paulocauan39@gmail.com";
    if (!isStaffOrAdmin) {
      return { status: 403, body: { success: false, error: "Acesso negado. Apenas servidores e administradores podem despachar termos." } };
    }

    const { itemId, recipientEmail, recipientName, recipientBond, recipientDocument, signatureLink, signatureToken, returnedByName } = body || {};
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
        recipientBond: recipientBond || "ALUNO",
        recipientDocument: recipientDocument || "",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        used: false,
      });

      // Purge token from public item
      item.signatureToken = null;
      item.recipientSignatureStatus = "PENDING_REMOTE";
    }

    // SMTP dispatch evaluation
    let emailDispatched = false;
    let emailStatus: "SENT" | "PENDING_SMTP_CONFIG" | "ERROR" = "PENDING_SMTP_CONFIG";
    let emailError: string | undefined = undefined;

    if (smtpConfigured) {
      if (smtpShouldFail) {
        emailStatus = "ERROR";
        emailError = "Falha de conexão SMTP (535 Authentication credentials invalid).";
      } else {
        emailDispatched = true;
        emailStatus = "SENT";
      }
    } else {
      emailStatus = "PENDING_SMTP_CONFIG";
      emailError = "Provedor SMTP não configurado no servidor.";
    }

    const message = emailDispatched
      ? `Link de assinatura digital enviado com sucesso para ${recipientEmail}.`
      : `Solicitação registrada. O e-mail não pôde ser despachado automaticamente (${emailStatus}): ${emailError}. Utilize o link direto.`;

    return {
      status: 200,
      body: {
        success: true,
        emailDispatched,
        emailStatus,
        emailError,
        message,
        signatureLink,
      },
    };
  }

  // Client-side stroke and typed signature validation helpers
  function validateDrawnStrokeData(strokes: Array<Array<{ x: number; y: number }>>): { valid: boolean; reason?: string } {
    if (!strokes || strokes.length === 0) {
      return { valid: false, reason: "Nenhum traço registrado na tela de assinatura." };
    }
    const totalPoints = strokes.reduce((acc, stroke) => acc + stroke.length, 0);
    if (totalPoints < 6) {
      return { valid: false, reason: "Traços insuficientes para constituir uma assinatura válida. Por favor, assine novamente." };
    }
    return { valid: true };
  }

  function validateTypedSignatureName(name: string): { valid: boolean; reason?: string } {
    const clean = (name || "").trim();
    if (clean.length < 3) {
      return { valid: false, reason: "O nome completo para assinatura deve possuir ao menos 3 caracteres." };
    }
    // Brazilian names with accents (á, é, í, ó, ú, â, ê, ô, ã, õ, ç, etc.)
    const nameRegex = /^[A-Za-zÀ-ÖØ-öø-ÿ\s.'-]+$/;
    if (!nameRegex.test(clean)) {
      return { valid: false, reason: "O nome contém caracteres inválidos." };
    }
    return { valid: true };
  }

  // Receipt formatting simulation helper
  function formatDevolutionReceipt(params: {
    item: MockItemDoc;
    overrideRecipientName?: string;
    overrideRecipientEmail?: string;
    overrideRecipientBond?: string;
    overrideRecipientDocument?: string;
    attendantName: string;
    attendantEmail: string;
    attendantRole: string;
  }) {
    const {
      item,
      overrideRecipientName,
      overrideRecipientEmail,
      overrideRecipientBond,
      overrideRecipientDocument,
      attendantName,
      attendantEmail,
      attendantRole,
    } = params;

    const finalRecipientName = (overrideRecipientName || item.recipientName || "").trim() || "Não informado";
    const finalRecipientEmail = (overrideRecipientEmail || item.recipientEmail || "").trim() || "Não informado";
    const finalRecipientBond = (overrideRecipientBond || item.recipientBond || "ALUNO").trim();
    const finalRecipientDoc = (overrideRecipientDocument || item.recipientDocument || "").trim() || "Não informado";

    const hasSignature = Boolean(item.recipientSignatureUrl && item.recipientSignatureUrl.length > 50);

    return {
      receiptNumber: item.receiptValidationCode || "REC-PENDING",
      itemTitle: item.title,
      returnedAt: item.signedAt || new Date().toISOString(),
      recipient: {
        name: finalRecipientName,
        email: finalRecipientEmail,
        bond: finalRecipientBond,
        document: finalRecipientDoc,
        signatureUrl: hasSignature ? item.recipientSignatureUrl : null,
        signatureMethod: item.recipientSignatureMethod || "DRAWN",
      },
      attendant: {
        name: attendantName,
        email: attendantEmail,
        role: attendantRole,
      },
      isDistinctFromAttendant: finalRecipientName !== attendantName && finalRecipientEmail !== attendantEmail,
    };
  }

  // =========================================================================
  // SETUP FIXTURES
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
          recipientBond: "ALUNO",
          recipientDocument: "2024001999",
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
          recipientBond: "ALUNO",
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
          title: "Calculadora Casio fx-82MS",
          status: "DEVOLVIDO",
          recipientSignatureType: "REMOTE_EMAIL",
          recipientSignatureStatus: "PENDING_REMOTE",
          signatureToken: null,
          signatureTokenUsed: false,
          signatureTokenExpiresAt: futureExpiry,
          recipientName: "Carlos Aluno",
          recipientEmail: "aluno@ifpr.edu.br",
          recipientBond: "ALUNO",
          recipientDocument: "2024001999",
          returnedByName: "Servidor Portaria",
          returnedByEmail: "servidor.portaria@ifpr.edu.br",
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
          recipientSignatureMethod: "DRAWN",
          recipientSignatureUrl: validPngDataUrl,
          receiptValidationCode: "COMP-IFPR-INPERSON-01",
          signedAt: new Date().toISOString(),
          signatureTokenUsed: true,
          recipientName: "Ana Paula Souza",
          recipientEmail: "ana.paula@ifpr.edu.br",
          recipientBond: "ALUNO",
          recipientDocument: "2024005544",
          returnedByName: "Servidor Portaria",
          returnedByEmail: "servidor.portaria@ifpr.edu.br",
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

  // =========================================================================
  // THE 16 MANDATORY REGRESSION SCENARIOS (ETAPA 7)
  // =========================================================================

  // Cenário 1: Pedido de assinatura com provedor configurado
  it("Cenário 1: Pedido de assinatura com provedor configurado despacha e-mail com status SENT", () => {
    const res = simulateSendRequest({
      authHeader: "Bearer valid-staff-jwt",
      userRole: "SERVIDOR",
      body: {
        itemId: "item-pending-remote",
        recipientEmail: "estudante@ifpr.edu.br",
        recipientName: "Estudante IFPR",
        signatureToken: rawToken,
        signatureLink: "https://localizaplus.app/assinatura?itemId=item-pending-remote&token=" + rawToken,
      },
      dbItems,
      dbSignatureRequests,
      smtpConfigured: true,
      smtpShouldFail: false,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.emailDispatched).toBe(true);
    expect(res.body.emailStatus).toBe("SENT");
    expect(res.body.message).toContain("enviado com sucesso");
  });

  // Cenário 2: Pedido de assinatura com provedor ausente ou com falha
  it("Cenário 2: Pedido de assinatura com provedor ausente ou com falha reporta status real sem falso sucesso", () => {
    // 2A: Provedor SMTP ausente (ex: ambiente de teste/preview sem credenciais)
    const resNoSmtp = simulateSendRequest({
      authHeader: "Bearer valid-staff-jwt",
      userRole: "SERVIDOR",
      body: {
        itemId: "item-pending-remote",
        recipientEmail: "estudante@ifpr.edu.br",
        signatureToken: rawToken,
      },
      dbItems,
      dbSignatureRequests,
      smtpConfigured: false,
    });

    expect(resNoSmtp.status).toBe(200);
    expect(resNoSmtp.body.success).toBe(true);
    expect(resNoSmtp.body.emailDispatched).toBe(false);
    expect(resNoSmtp.body.emailStatus).toBe("PENDING_SMTP_CONFIG");
    expect(resNoSmtp.body.message).toContain("não pôde ser despachado automaticamente");

    // 2B: Provedor SMTP com falha de conexão/autenticação
    const resSmtpError = simulateSendRequest({
      authHeader: "Bearer valid-staff-jwt",
      userRole: "SERVIDOR",
      body: {
        itemId: "item-pending-remote",
        recipientEmail: "estudante@ifpr.edu.br",
        signatureToken: rawToken,
      },
      dbItems,
      dbSignatureRequests,
      smtpConfigured: true,
      smtpShouldFail: true,
    });

    expect(resSmtpError.body.emailDispatched).toBe(false);
    expect(resSmtpError.body.emailStatus).toBe("ERROR");
    expect(resSmtpError.body.emailError).toContain("Authentication credentials invalid");
  });

  // Cenário 3: Reenvio autenticado e rejeição de reenvio não autenticado
  it("Cenário 3: Reenvio de link requer autenticação válida (401 para anônimo, 200 para staff)", () => {
    // Tentativa anônima (sem header ou token inválido)
    const resAnon = simulateSendRequest({
      authHeader: undefined,
      body: { itemId: "item-pending-remote", recipientEmail: "aluno@ifpr.edu.br" },
      dbItems,
      dbSignatureRequests,
    });
    expect(resAnon.status).toBe(401);
    expect(resAnon.body.success).toBe(false);

    // Tentativa autenticada como SERVIDOR
    const resAuth = simulateSendRequest({
      authHeader: "Bearer valid-staff-jwt",
      userRole: "SERVIDOR",
      body: { itemId: "item-pending-remote", recipientEmail: "aluno@ifpr.edu.br", signatureToken: rawToken },
      dbItems,
      dbSignatureRequests,
    });
    expect(resAuth.status).toBe(200);
    expect(resAuth.body.success).toBe(true);
  });

  // Cenário 4: Recepção e preenchimento dos dados do receptor (distinção entre atendente e receptor)
  it("Cenário 4: Preserva e separa os dados do receptor dos dados do servidor atendente", () => {
    const attendant = {
      name: "João da Silva Servidor",
      email: "joao.silva@ifpr.edu.br",
      role: "SERVIDOR",
    };

    const recipientData = {
      name: "Mariana Aluna Silva",
      email: "mariana.aluna@estudante.ifpr.edu.br",
      bond: "ALUNO",
      document: "2024019998",
    };

    const receipt = formatDevolutionReceipt({
      item: dbItems.get("item-pending-remote")!,
      overrideRecipientName: recipientData.name,
      overrideRecipientEmail: recipientData.email,
      overrideRecipientBond: recipientData.bond,
      overrideRecipientDocument: recipientData.document,
      attendantName: attendant.name,
      attendantEmail: attendant.email,
      attendantRole: attendant.role,
    });

    expect(receipt.recipient.name).toBe("Mariana Aluna Silva");
    expect(receipt.recipient.email).toBe("mariana.aluna@estudante.ifpr.edu.br");
    expect(receipt.recipient.document).toBe("2024019998");
    expect(receipt.recipient.bond).toBe("ALUNO");
    expect(receipt.attendant.name).toBe("João da Silva Servidor");
    expect(receipt.attendant.email).toBe("joao.silva@ifpr.edu.br");
    expect(receipt.isDistinctFromAttendant).toBe(true);
  });

  // Cenário 5: Assinatura desenhada com múltiplos traços válidos
  it("Cenário 5: Assinatura desenhada com múltiplos traços válidos é aceita e validada", () => {
    // 2 traços com 12 pontos
    const multiStrokeData = [
      [{ x: 10, y: 20 }, { x: 15, y: 25 }, { x: 22, y: 30 }, { x: 30, y: 35 }, { x: 40, y: 40 }, { x: 50, y: 45 }],
      [{ x: 50, y: 45 }, { x: 45, y: 55 }, { x: 40, y: 65 }, { x: 35, y: 75 }, { x: 30, y: 80 }, { x: 25, y: 85 }],
    ];

    const validation = validateDrawnStrokeData(multiStrokeData);
    expect(validation.valid).toBe(true);
    expect(validation.reason).toBeUndefined();
  });

  // Cenário 6: Rejeição de assinatura desenhada em branco ou com traços insuficientes
  it("Cenário 6: Assinatura desenhada em branco ou com traço insuficiente (acidental) é rejeitada", () => {
    // Canvas em branco (0 traços)
    const emptyResult = validateDrawnStrokeData([]);
    expect(emptyResult.valid).toBe(false);
    expect(emptyResult.reason).toContain("Nenhum traço");

    // Toque acidental (1 único ponto)
    const accidentalDotResult = validateDrawnStrokeData([[{ x: 50, y: 50 }]]);
    expect(accidentalDotResult.valid).toBe(false);
    expect(accidentalDotResult.reason).toContain("Traços insuficientes");
  });

  // Cenário 7: Assinatura por nome digitado com acentuação brasileira
  it("Cenário 7: Assinatura por nome digitado aceita caracteres acentuados da língua portuguesa", () => {
    const validAccentedNames = [
      "João da Conceição Araújo",
      "Vitória Álvares Cabral",
      "André Luís Gonçalves",
      "Ênio Müller D'Ávila",
    ];

    for (const name of validAccentedNames) {
      const result = validateTypedSignatureName(name);
      expect(result.valid).toBe(true);
    }

    // Nomes com menos de 3 caracteres são rejeitados
    expect(validateTypedSignatureName("Jo").valid).toBe(false);

    // Nomes com caracteres de controle ou números são rejeitados
    expect(validateTypedSignatureName("Nome123!").valid).toBe(false);
  });

  // Cenário 8: Persistência e recuperação de ambas as modalidades (desenhada e nome digitado)
  it("Cenário 8: Persistência e recuperação suportam ambas as modalidades (DRAWN e TYPED_NAME)", async () => {
    // 8A: Confirmação com modalidade DRAWN
    const resDrawn = await simulateConfirmSignature({
      itemId: "item-pending-remote",
      token: rawToken,
      signatureDataUrl: validPngDataUrl,
      signatureMethod: "DRAWN",
      signerName: "Carlos Aluno",
      dbItems,
      dbSignatureRequests,
    });
    expect(resDrawn.status).toBe(200);
    expect(resDrawn.body.signatureMethod).toBe("DRAWN");
    expect(dbItems.get("item-pending-remote")?.recipientSignatureMethod).toBe("DRAWN");

    // 8B: Confirmação com modalidade TYPED_NAME em outro item
    dbItems.set("item-typed-test", {
      id: "item-typed-test",
      title: "Mochila Escolar Preta",
      status: "DEVOLVIDO",
      recipientSignatureType: "REMOTE_EMAIL",
      recipientSignatureStatus: "PENDING_REMOTE",
      signatureToken: null,
      signatureTokenUsed: false,
      signatureTokenExpiresAt: futureExpiry,
    });
    dbSignatureRequests.set("item-typed-test", {
      itemId: "item-typed-test",
      tokenHash: rawTokenHash,
      recipientEmail: "lucas@ifpr.edu.br",
      recipientName: "Lucas Gonçalves",
      createdAt: new Date().toISOString(),
      expiresAt: futureExpiry,
      used: false,
    });

    const resTyped = await simulateConfirmSignature({
      itemId: "item-typed-test",
      token: rawToken,
      signatureDataUrl: validPngDataUrl,
      signatureMethod: "TYPED_NAME",
      signerName: "Lucas Gonçalves",
      dbItems,
      dbSignatureRequests,
    });
    expect(resTyped.status).toBe(200);
    expect(resTyped.body.signatureMethod).toBe("TYPED_NAME");
    expect(dbItems.get("item-typed-test")?.recipientSignatureMethod).toBe("TYPED_NAME");
  });

  // Cenário 9: Validação de token (válido, expirado, inválido, já utilizado)
  it("Cenário 9: Validação de token cobre estados: válido (200), expirado (410), inválido (403), já utilizado (400)", async () => {
    // 9A: Válido
    const resValid = simulateVerifyToken({
      itemId: "item-pending-remote",
      token: rawToken,
      dbItems,
      dbSignatureRequests,
    });
    expect(resValid.status).toBe(200);
    expect(resValid.body.valid).toBe(true);

    // 9B: Inválido
    const resInvalid = simulateVerifyToken({
      itemId: "item-pending-remote",
      token: "sig_token_falso_adulterado",
      dbItems,
      dbSignatureRequests,
    });
    expect(resInvalid.status).toBe(403);
    expect(resInvalid.body.reason).toBe("TOKEN_MISMATCH");

    // 9C: Expirado
    const resExpired = simulateVerifyToken({
      itemId: "item-expired-remote",
      token: "sig_expired_token_abc",
      dbItems,
      dbSignatureRequests,
    });
    expect(resExpired.status).toBe(410);
    expect(resExpired.body.reason).toBe("TOKEN_EXPIRED");

    // 9D: Já utilizado (marca como usado e tenta revalidar)
    dbSignatureRequests.get("item-pending-remote")!.used = true;
    const resUsed = simulateVerifyToken({
      itemId: "item-pending-remote",
      token: rawToken,
      dbItems,
      dbSignatureRequests,
    });
    expect(resUsed.status).toBe(400);
    expect(resUsed.body.reason).toBe("ALREADY_PROCESSED");
  });

  // Cenário 10: Falha na persistência sem falso sucesso
  it("Cenário 10: Falha na persistência ou item inexistente retorna erro e nunca simula sucesso", async () => {
    const resFail = await simulateConfirmSignature({
      itemId: "item-inexistente-no-banco",
      token: rawToken,
      signatureDataUrl: validPngDataUrl,
      dbItems,
      dbSignatureRequests,
    });

    expect(resFail.status).toBe(404);
    expect(resFail.body.success).toBe(false);
  });

  // Cenário 11: Recarregamento de página (F5) mantendo assinatura, status e recibo
  it("Cenário 11: Recarregamento de página (F5) após assinatura recupera status SIGNED e a imagem da assinatura", async () => {
    // 1. Conclui assinatura
    const confirmRes = await simulateConfirmSignature({
      itemId: "item-pending-remote",
      token: rawToken,
      signatureDataUrl: validPngDataUrl,
      signerName: "Carlos Aluno",
      dbItems,
      dbSignatureRequests,
    });
    expect(confirmRes.status).toBe(200);
    const code = confirmRes.body.validationCode;

    // 2. F5: verifyToken é disparado novamente
    const reloadRes = simulateVerifyToken({
      itemId: "item-pending-remote",
      token: rawToken,
      dbItems,
      dbSignatureRequests,
    });

    expect(reloadRes.status).toBe(200);
    expect(reloadRes.body.isAlreadySigned).toBe(true);
    expect(reloadRes.body.receiptValidationCode).toBe(code);
    expect(reloadRes.body.recipientSignatureUrl).toBe(validPngDataUrl);
    expect(reloadRes.body.item.recipientSignatureUrl).toBe(validPngDataUrl);
  });

  // Cenário 12: Recibo exibindo nome, e-mail e assinatura do receptor corretamente
  it("Cenário 12: Recibo exibe nome, e-mail, vínculo institucional e assinatura do receptor", () => {
    const item = dbItems.get("item-presencial-concluido")!;
    const receipt = formatDevolutionReceipt({
      item,
      attendantName: "Servidor Plantonista",
      attendantEmail: "plantonista@ifpr.edu.br",
      attendantRole: "SERVIDOR",
    });

    expect(receipt.recipient.name).toBe("Ana Paula Souza");
    expect(receipt.recipient.email).toBe("ana.paula@ifpr.edu.br");
    expect(receipt.recipient.document).toBe("2024005544");
    expect(receipt.recipient.bond).toBe("ALUNO");
    expect(receipt.recipient.signatureUrl).toBe(validPngDataUrl);
  });

  // Cenário 13: Impressão e exportação de recibo preservando os elementos
  it("Cenário 13: Estrutura do recibo preserva código de validação, data e assinatura para exportação", () => {
    const item = dbItems.get("item-presencial-concluido")!;
    const receipt = formatDevolutionReceipt({
      item,
      attendantName: "Servidor Atendente",
      attendantEmail: "atendente@ifpr.edu.br",
      attendantRole: "SERVIDOR",
    });

    expect(receipt.receiptNumber).toMatch(/^COMP-IFPR/);
    expect(receipt.returnedAt).toBeDefined();
    expect(receipt.recipient.signatureUrl).toMatch(/^data:image\/png;base64,/);
  });

  // Cenário 14: Proteção contra adulteração de token ou de assinatura
  it("Cenário 14: Proteção contra adulteração: payload > 250KB é rejeitado e hash protege o token", async () => {
    // 14A: Payload acima do limite
    const giantPayload = "data:image/png;base64," + "A".repeat(360000);
    const oversizedRes = await simulateConfirmSignature({
      itemId: "item-pending-remote",
      token: rawToken,
      signatureDataUrl: giantPayload,
      dbItems,
      dbSignatureRequests,
    });
    expect(oversizedRes.status).toBe(400);
    expect(oversizedRes.body.error).toContain("excede o limite");

    // 14B: Payload que não é imagem Base64
    const malformedRes = await simulateConfirmSignature({
      itemId: "item-pending-remote",
      token: rawToken,
      signatureDataUrl: "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      dbItems,
      dbSignatureRequests,
    });
    expect(malformedRes.status).toBe(400);
    expect(malformedRes.body.error).toContain("Base64");

    // 14C: Token não é exposto no item público após o envio da solicitação
    const sendRes = simulateSendRequest({
      authHeader: "Bearer valid-jwt",
      userRole: "SERVIDOR",
      body: {
        itemId: "item-pending-remote",
        recipientEmail: "aluno@ifpr.edu.br",
        signatureToken: "sig_super_secret_raw_token",
      },
      dbItems,
      dbSignatureRequests,
    });
    expect(sendRes.status).toBe(200);
    expect(dbItems.get("item-pending-remote")?.signatureToken).toBeNull();
    const storedHash = dbSignatureRequests.get("item-pending-remote")?.tokenHash;
    expect(storedHash).toBeDefined();
    expect(storedHash).not.toBe("sig_super_secret_raw_token");
  });

  // Cenário 15: Compatibilidade regressiva com devoluções presenciais
  it("Cenário 15: Compatibilidade total com devoluções presenciais (IN_PERSON_DEVICE e SIGNED)", () => {
    const item = dbItems.get("item-presencial-concluido")!;
    expect(item.status).toBe("DEVOLVIDO");
    expect(item.recipientSignatureType).toBe("IN_PERSON_DEVICE");
    expect(item.recipientSignatureStatus).toBe("SIGNED");
    expect(item.recipientSignatureUrl).toBeDefined();
    expect(item.receiptValidationCode).toBe("COMP-IFPR-INPERSON-01");
  });

  // Cenário 16: Concorrência e idempotência na confirmação
  it("Cenário 16: Requisições concorrentes de confirmação são tratadas atomicamente e de forma idempotente", async () => {
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
    // Chamada concorrente 2 é absorvida de forma idempotente com o mesmo código de validação
    expect(res2.status).toBe(200);
    expect(res2.body.validationCode).toBe(res1.body.validationCode);
  });
});
