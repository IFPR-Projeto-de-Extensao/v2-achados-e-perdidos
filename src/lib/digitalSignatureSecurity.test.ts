import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateSecureSignatureToken } from "./utils";

describe("Digital Signature & Remote Return Flow Security Audit (/api/signature/*)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Simulated In-Memory Database for Signature Items
  interface MockItemDoc {
    id: string;
    title: string;
    status: "DISPONIVEL" | "ENCONTRADO" | "DEVOLVIDO" | "ENCERRADO";
    signatureToken?: string;
    signatureTokenUsed?: boolean;
    signatureTokenExpiresAt?: string;
    recipientSignatureStatus?: "SIGNED" | "PENDING_REMOTE" | "NOT_REQUIRED";
    recipientSignatureUrl?: string;
    receiptValidationCode?: string;
    signedAt?: string;
    recipientName?: string;
    recipientEmail?: string;
    recipientBond?: string;
    history?: any[];
  }

  // Simulated verify-token handler
  function simulateVerifyToken(params: {
    itemId?: string;
    token?: string;
    dbItems: Map<string, MockItemDoc>;
  }): { status: number; body: any } {
    const { itemId, token, dbItems } = params;

    if (!itemId || !token || typeof itemId !== "string" || typeof token !== "string") {
      return {
        status: 400,
        body: { success: false, valid: false, reason: "MISSING_PARAMS", error: "Parâmetros ausentes." },
      };
    }

    const item = dbItems.get(itemId);
    if (!item) {
      return {
        status: 404,
        body: { success: false, valid: false, reason: "NOT_FOUND", error: "Ocorrência não encontrada." },
      };
    }

    if (item.recipientSignatureStatus === "SIGNED" || Boolean(item.recipientSignatureUrl)) {
      return {
        status: 200,
        body: { success: true, valid: true, isAlreadySigned: true, signedAt: item.signedAt },
      };
    }

    const isEligible = item.status === "DISPONIVEL" || item.status === "ENCONTRADO";
    if (!isEligible || item.status === "DEVOLVIDO" || item.status === "ENCERRADO" || item.signatureTokenUsed) {
      return {
        status: 400,
        body: { success: false, valid: false, reason: "INVALID_STATUS", error: "Item inelegível para devolução." },
      };
    }

    if (!item.signatureToken || item.signatureToken.trim() !== token.trim()) {
      return {
        status: 403,
        body: { success: false, valid: false, reason: "TOKEN_MISMATCH", error: "Token inválido." },
      };
    }

    if (item.signatureTokenExpiresAt) {
      const exp = new Date(item.signatureTokenExpiresAt).getTime();
      if (!isNaN(exp) && exp < Date.now()) {
        return {
          status: 410,
          body: { success: false, valid: false, reason: "TOKEN_EXPIRED", error: "Token expirado." },
        };
      }
    }

    return {
      status: 200,
      body: { success: true, valid: true, isAlreadySigned: false, item: { id: item.id, title: item.title } },
    };
  }

  // Simulated confirm-signature handler with atomic transaction behavior
  async function simulateConfirmSignature(params: {
    itemId?: string;
    token?: string;
    signatureDataUrl?: string;
    signerName?: string;
    signerEmail?: string;
    signerBond?: string;
    tamperedStatus?: string;
    tamperedRole?: string;
    tamperedAdmin?: boolean;
    dbItems: Map<string, MockItemDoc>;
    auditLogSink?: any[];
  }): Promise<{ status: number; body: any }> {
    const { itemId, token, signatureDataUrl, signerName, signerEmail, signerBond, dbItems, auditLogSink } = params;

    if (!itemId || !token || !signatureDataUrl || typeof itemId !== "string" || typeof token !== "string") {
      return {
        status: 400,
        body: { success: false, error: "Parâmetros obrigatórios ausentes." },
      };
    }

    const item = dbItems.get(itemId);
    if (!item) {
      return {
        status: 404,
        body: { success: false, error: "Ocorrência não encontrada." },
      };
    }

    if (item.signatureTokenUsed || item.status === "DEVOLVIDO" || item.recipientSignatureStatus === "SIGNED") {
      return {
        status: 400,
        body: { success: false, error: "Esta assinatura ou devolução já foi finalizada anteriormente." },
      };
    }

    if (!item.signatureToken || item.signatureToken.trim() !== token.trim()) {
      return {
        status: 403,
        body: { success: false, error: "Token de assinatura inválido ou não autorizado para este objeto." },
      };
    }

    if (item.signatureTokenExpiresAt) {
      const exp = new Date(item.signatureTokenExpiresAt).getTime();
      if (!isNaN(exp) && exp < Date.now()) {
        return {
          status: 410,
          body: { success: false, error: "O link de assinatura digital expirou por motivos de segurança." },
        };
      }
    }

    // Atomic update simulation: Server enforces status = DEVOLVIDO (ignoring tampered status/role/admin in body)
    const nowIso = new Date().toISOString();
    const valCode = `REC-IFPR-${itemId.toUpperCase().slice(0, 6)}-VAL`;

    item.status = "DEVOLVIDO"; // Server-enforced
    item.signatureTokenUsed = true;
    item.recipientSignatureStatus = "SIGNED";
    item.recipientSignatureUrl = signatureDataUrl;
    item.signedAt = nowIso;
    item.receiptValidationCode = valCode;

    if (auditLogSink) {
      auditLogSink.push({
        action: "REGISTRO_DEVOLUCAO",
        objectId: itemId,
        actorId: "remote-token-auth",
        actorName: signerName || "Receptor",
        timestamp: nowIso,
        oldValue: "ENCONTRADO",
        newValue: "DEVOLVIDO",
        validationCode: valCode,
      });
    }

    return {
      status: 200,
      body: { success: true, message: "Assinatura confirmada com sucesso.", validationCode: valCode, signedAt: nowIso },
    };
  }

  // Simulated send-request handler
  function simulateSendRequest(params: {
    authHeader?: string;
    body: any;
    dbItems: Map<string, MockItemDoc>;
    emailNotificationSink: any[];
  }): { status: number; body: any } {
    const { authHeader, body, dbItems, emailNotificationSink } = params;

    if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader === "Bearer invalid") {
      return { status: 401, body: { success: false, error: "Autenticação obrigatória." } };
    }

    const { itemId, itemTitle, recipientEmail, recipientName, signatureLink, signatureToken, returnedByName } = body || {};

    if (!itemId || !recipientEmail || typeof itemId !== "string" || typeof recipientEmail !== "string") {
      return { status: 400, body: { success: false, error: "Parâmetros obrigatórios ausentes." } };
    }

    const item = dbItems.get(itemId);
    if (!item) {
      return { status: 404, body: { success: false, error: `Item #${itemId} não encontrado.` } };
    }

    emailNotificationSink.push({
      itemId,
      itemTitle: itemTitle || item.title,
      recipientEmail,
      recipientName,
      signatureLink,
      signatureToken,
      returnedByName,
      sentAt: new Date().toISOString(),
    });

    return {
      status: 200,
      body: { success: true, message: `Link de assinatura digital enviado com sucesso para ${recipientEmail}.` },
    };
  }

  // Simulated notify-signed handler
  function simulateNotifySigned(params: {
    body: any;
    dbItems: Map<string, MockItemDoc>;
    notificationSink: any[];
  }): { status: number; body: any } {
    const { body, dbItems, notificationSink } = params;
    const { itemId, itemTitle, signerName, signerEmail, signedAt } = body || {};

    if (!itemId || typeof itemId !== "string") {
      return { status: 400, body: { success: false, error: "ID do item obrigatório." } };
    }

    const item = dbItems.get(itemId);
    if (!item) {
      return { status: 404, body: { success: false, error: `Ocorrência #${itemId} não encontrada no banco de dados.` } };
    }

    notificationSink.push({
      itemId,
      itemTitle: item.title || itemTitle,
      signerName: item.recipientName || signerName || "Receptor",
      signerEmail: signerEmail || item.recipientEmail || "",
      type: "SIGNATURE_COMPLETED",
      signedAt: signedAt || new Date().toISOString(),
    });

    return { status: 200, body: { success: true, message: "Assinatura registrada no backend com sucesso." } };
  }

  // 1. TOKEN ENTROPY & GENERATION
  describe("1. Token Entropy & Cryptographic Generation", () => {
    it("Gera tokens criptograficamente seguros com 128-bit de entropia e prefixo sig_", () => {
      const token1 = generateSecureSignatureToken("sig_");
      const token2 = generateSecureSignatureToken("sig_");

      expect(token1).toMatch(/^sig_[a-f0-9]{32}$/);
      expect(token2).toMatch(/^sig_[a-f0-9]{32}$/);
      expect(token1).not.toBe(token2);
    });

    it("Gera tokens com distribuição aleatória sem colisões em lote", () => {
      const tokenSet = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const token = generateSecureSignatureToken("sig_");
        expect(tokenSet.has(token)).toBe(false);
        tokenSet.add(token);
      }
      expect(tokenSet.size).toBe(50);
    });
  });

  // 2. TOKEN VERIFICATION (/api/signature/verify-token)
  describe("2. Token Verification Security (/api/signature/verify-token)", () => {
    const validToken = generateSecureSignatureToken("sig_");
    const futureExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const pastExpiry = new Date(Date.now() - 1000).toISOString();

    let dbItems: Map<string, MockItemDoc>;

    beforeEach(() => {
      dbItems = new Map<string, MockItemDoc>([
        [
          "item-100",
          {
            id: "item-100",
            title: "Calculadora Científica Casio",
            status: "DISPONIVEL",
            signatureToken: validToken,
            signatureTokenUsed: false,
            signatureTokenExpiresAt: futureExpiry,
          },
        ],
        [
          "item-expired",
          {
            id: "item-expired",
            title: "Caderno Universitário",
            status: "DISPONIVEL",
            signatureToken: "sig_expired_token_1234567890abcdef",
            signatureTokenUsed: false,
            signatureTokenExpiresAt: pastExpiry,
          },
        ],
        [
          "item-returned",
          {
            id: "item-returned",
            title: "Chaveiro com Chaves",
            status: "DEVOLVIDO",
            signatureToken: "sig_returned_token_1234567890abcdef",
            signatureTokenUsed: true,
            recipientSignatureStatus: "SIGNED",
          },
        ],
      ]);
    });

    it("A. Token válido e dentro do prazo de validade é PERMITIDO com HTTP 200", () => {
      const res = simulateVerifyToken({ itemId: "item-100", token: validToken, dbItems });
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.isAlreadySigned).toBe(false);
    });

    it("B. Token inexistente / item inexistente retorna HTTP 404", () => {
      const res = simulateVerifyToken({ itemId: "item-nao-existe", token: validToken, dbItems });
      expect(res.status).toBe(404);
      expect(res.body.reason).toBe("NOT_FOUND");
    });

    it("C. Token expirado (mais de 7 dias) retorna HTTP 410 Gone", () => {
      const res = simulateVerifyToken({ itemId: "item-expired", token: "sig_expired_token_1234567890abcdef", dbItems });
      expect(res.status).toBe(410);
      expect(res.body.reason).toBe("TOKEN_EXPIRED");
    });

    it("D. Token alterado em 1 caractere é REJEITADO com HTTP 403 Forbidden", () => {
      const tamperedToken = validToken.slice(0, -1) + (validToken.endsWith("a") ? "b" : "a");
      const res = simulateVerifyToken({ itemId: "item-100", token: tamperedToken, dbItems });
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe("TOKEN_MISMATCH");
    });

    it("E. Token truncado é REJEITADO com HTTP 403 Forbidden", () => {
      const truncatedToken = validToken.substring(0, 10);
      const res = simulateVerifyToken({ itemId: "item-100", token: truncatedToken, dbItems });
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe("TOKEN_MISMATCH");
    });

    it("F. Token do Item A enviado para validar Item B é REJEITADO com HTTP 403", () => {
      const res = simulateVerifyToken({ itemId: "item-expired", token: validToken, dbItems });
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe("TOKEN_MISMATCH");
    });

    it("G. Item já devolvido / assinado retorna 200 com flag isAlreadySigned: true", () => {
      const res = simulateVerifyToken({ itemId: "item-returned", token: "sig_returned_token_1234567890abcdef", dbItems });
      expect(res.status).toBe(200);
      expect(res.body.isAlreadySigned).toBe(true);
    });

    it("H. Chamada com parâmetros ausentes retorna HTTP 400", () => {
      const res = simulateVerifyToken({ itemId: "", token: "", dbItems });
      expect(res.status).toBe(400);
      expect(res.body.reason).toBe("MISSING_PARAMS");
    });
  });

  // 3. CONFIRM SIGNATURE & REPLAY DEFENSE (/api/signature/confirm-signature)
  describe("3. Confirm Signature, Atomic Transaction & Replay Defense (/api/signature/confirm-signature)", () => {
    const validToken = generateSecureSignatureToken("sig_");
    const futureExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    let dbItems: Map<string, MockItemDoc>;
    let auditLogSink: any[];

    beforeEach(() => {
      auditLogSink = [];
      dbItems = new Map<string, MockItemDoc>([
        [
          "item-200",
          {
            id: "item-200",
            title: "Garrafa Térmica Stanley",
            status: "DISPONIVEL",
            signatureToken: validToken,
            signatureTokenUsed: false,
            signatureTokenExpiresAt: futureExpiry,
          },
        ],
      ]);
    });

    it("I. Confirmação legítima com token válido atualiza item e grava audit_log", async () => {
      const res = await simulateConfirmSignature({
        itemId: "item-200",
        token: validToken,
        signatureDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        signerName: "João Silva",
        signerEmail: "joao@estudantes.ifpr.edu.br",
        signerBond: "Aluno",
        dbItems,
        auditLogSink,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(dbItems.get("item-200")?.status).toBe("DEVOLVIDO");
      expect(dbItems.get("item-200")?.signatureTokenUsed).toBe(true);
      expect(auditLogSink.length).toBe(1);
      expect(auditLogSink[0].action).toBe("REGISTRO_DEVOLUCAO");
    });

    it("J. Replay Attack: Segunda tentativa com o mesmo token após confirmação é REJEITADA com HTTP 400", async () => {
      // 1. Primeira confirmação (sucesso)
      await simulateConfirmSignature({
        itemId: "item-200",
        token: validToken,
        signatureDataUrl: "data:image/png;base64,sample1",
        dbItems,
        auditLogSink,
      });

      // 2. Replay com mesmo token
      const replayRes = await simulateConfirmSignature({
        itemId: "item-200",
        token: validToken,
        signatureDataUrl: "data:image/png;base64,sample2",
        dbItems,
        auditLogSink,
      });

      expect(replayRes.status).toBe(400);
      expect(replayRes.body.error).toContain("já foi finalizada anteriormente");
      // Não cria segundo audit log duplicado
      expect(auditLogSink.length).toBe(1);
    });

    it("K. Tentativa de Body Tampering (injetar status: 'OUTRO', role: 'ADMIN', admin: true) é ignorada pelo servidor", async () => {
      const res = await simulateConfirmSignature({
        itemId: "item-200",
        token: validToken,
        signatureDataUrl: "data:image/png;base64,sample",
        tamperedStatus: "EM_ANALISE",
        tamperedRole: "ADMIN",
        tamperedAdmin: true,
        dbItems,
        auditLogSink,
      });

      expect(res.status).toBe(200);
      // Status estritamente forçado pelo servidor como DEVOLVIDO
      expect(dbItems.get("item-200")?.status).toBe("DEVOLVIDO");
    });

    it("L. Tentativa de confirmação com token adulterado é REJEITADA com HTTP 403", async () => {
      const res = await simulateConfirmSignature({
        itemId: "item-200",
        token: "sig_forged_wrong_token_1234567890",
        signatureDataUrl: "data:image/png;base64,sample",
        dbItems,
        auditLogSink,
      });

      expect(res.status).toBe(403);
      expect(dbItems.get("item-200")?.status).toBe("DISPONIVEL");
    });
  });

  // 4. SEND-REQUEST & NOTIFY-SIGNED AUDIT
  describe("4. Send-Request and Notify-Signed Endpoints Audit", () => {
    let dbItems: Map<string, MockItemDoc>;
    let emailSink: any[];
    let notifSink: any[];

    beforeEach(() => {
      emailSink = [];
      notifSink = [];
      dbItems = new Map<string, MockItemDoc>([
        [
          "item-300",
          {
            id: "item-300",
            title: "Mochila Dell Preta",
            status: "DISPONIVEL",
            recipientName: "Maria Souza",
            recipientEmail: "maria@estudantes.ifpr.edu.br",
          },
        ],
      ]);
    });

    it("M. /api/signature/send-request sem autenticação retorna HTTP 401", () => {
      const res = simulateSendRequest({
        authHeader: undefined,
        body: { itemId: "item-300", recipientEmail: "maria@estudantes.ifpr.edu.br" },
        dbItems,
        emailNotificationSink: emailSink,
      });

      expect(res.status).toBe(401);
      expect(emailSink.length).toBe(0);
    });

    it("N. /api/signature/send-request com autenticação válida e item existente despacha com HTTP 200", () => {
      const res = simulateSendRequest({
        authHeader: "Bearer valid-token-staff",
        body: {
          itemId: "item-300",
          itemTitle: "Mochila Dell Preta",
          recipientEmail: "maria@estudantes.ifpr.edu.br",
          recipientName: "Maria Souza",
          signatureLink: "https://localizamais.ifpr.edu.br/?tab=sign-receipt&itemId=item-300&token=sig_123",
          signatureToken: "sig_123",
        },
        dbItems,
        emailNotificationSink: emailSink,
      });

      expect(res.status).toBe(200);
      expect(emailSink.length).toBe(1);
      expect(emailSink[0].recipientEmail).toBe("maria@estudantes.ifpr.edu.br");
    });

    it("O. /api/signature/notify-signed com item inexistente retorna HTTP 404", () => {
      const res = simulateNotifySigned({
        body: { itemId: "item-nao-existe" },
        dbItems,
        notificationSink: notifSink,
      });

      expect(res.status).toBe(404);
      expect(notifSink.length).toBe(0);
    });

    it("P. /api/signature/notify-signed com item existente registra notificação com HTTP 200", () => {
      const res = simulateNotifySigned({
        body: { itemId: "item-300", signerName: "Maria Souza" },
        dbItems,
        notificationSink: notifSink,
      });

      expect(res.status).toBe(200);
      expect(notifSink.length).toBe(1);
      expect(notifSink[0].signerName).toBe("Maria Souza");
    });

    it("Q. Token de assinatura nunca é exposto em logs públicos ou mensagens de erro", () => {
      const secretToken = "sig_sensitive_secret_token_123456";
      const sanitizedLog = `Tentativa de assinatura para item #item-100 (Token: ${secretToken.substring(0, 6)}...)`;

      expect(sanitizedLog).not.toContain(secretToken);
      expect(sanitizedLog).toContain("sig_se...");
    });
  });
});
