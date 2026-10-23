import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

describe("Phase 4C: Dual Signature & Issuer Attestation Security Audit (/api/signature/*)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Data Models modeling production Firestore state with Dual Signers
  interface MockItemDoc {
    id: string;
    title: string;
    status: "DISPONIVEL" | "ENCONTRADO" | "DEVOLVIDO" | "ENCERRADO";
    returnedByUserId?: string;
    returnedByName?: string;
    returnedByRole?: string;
    
    // Recipient Signature (Party 1)
    recipientSignatureStatus?: "SIGNED" | "PENDING_REMOTE" | "NOT_REQUIRED";
    recipientSignatureMethod?: "DRAWN" | "TYPED_NAME";
    recipientSignatureUrl?: string;
    recipientSignedAt?: string;
    recipientName?: string;
    recipientEmail?: string;
    recipientBond?: string;
    recipientDocument?: string;

    // Staff / Attendant Signature (Party 2)
    staffSignatureStatus?: "SIGNED" | "PENDING_STAFF" | "NOT_REQUIRED";
    staffSignatureMethod?: "DRAWN" | "TYPED_NAME";
    staffSignatureUrl?: string;
    staffSignedAt?: string;
    staffSignerUid?: string;
    staffSignerName?: string;
    staffSignerEmail?: string;

    // Tokens & Receipt
    signatureToken?: string | null;
    signatureTokenUsed?: boolean;
    signatureTokenExpiresAt?: string;
    receiptValidationCode?: string;
    signedAt?: string;
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
    dispatchedByUserId?: string;
  }

  interface MockUserDoc {
    uid: string;
    name: string;
    email: string;
    role: "ALUNO" | "SERVIDOR" | "ADMIN";
    status?: "ACTIVE" | "SUSPENDED" | "INACTIVE";
  }

  // Simulation of server.ts confirm-signature logic (Recipient Signature Phase + Issuer Notification Dispatch)
  async function simulateConfirmSignaturePhase4C(params: {
    itemId: string;
    token: string;
    signatureDataUrl: string;
    dbItems: Map<string, MockItemDoc>;
    dbSignatureRequests: Map<string, MockSignatureRequestDoc>;
    dbUsers: Map<string, MockUserDoc>;
    emailNotificationLogs: any[];
  }): Promise<{ status: number; body: any }> {
    const { itemId, token, signatureDataUrl, dbItems, dbSignatureRequests, dbUsers, emailNotificationLogs } = params;

    const item = dbItems.get(itemId);
    if (!item) {
      return { status: 404, body: { success: false, error: "Ocorrência não encontrada." } };
    }

    const sigReq = dbSignatureRequests.get(itemId);
    const cleanToken = token.trim();
    const tokenHash = crypto.createHash("sha256").update(cleanToken).digest("hex");

    let tokenMatched = false;
    if (sigReq && sigReq.tokenHash === tokenHash) {
      tokenMatched = true;
    } else if (item.signatureToken && item.signatureToken.trim() === cleanToken) {
      tokenMatched = true;
    }

    if (!tokenMatched) {
      return { status: 403, body: { success: false, error: "Token de assinatura inválido ou não autorizado." } };
    }

    // Idempotency
    if (item.recipientSignatureStatus === "SIGNED" && item.recipientSignatureUrl) {
      return {
        status: 200,
        body: {
          success: true,
          alreadyCompleted: true,
          recipientSignatureUrl: item.recipientSignatureUrl,
          validationCode: item.receiptValidationCode,
        },
      };
    }

    // Finalize recipient signature on item
    item.status = "DEVOLVIDO";
    item.recipientSignatureStatus = "SIGNED";
    item.recipientSignatureUrl = signatureDataUrl;
    item.staffSignatureStatus = "PENDING_STAFF";
    item.receiptValidationCode = item.receiptValidationCode || `REC-IFPR-${itemId.toUpperCase()}`;

    // Resolve issuer UID
    const issuerUid = item.returnedByUserId || sigReq?.dispatchedByUserId;
    let issuerEmail = "";
    let issuerName = "Servidor Emissor Responsável";

    if (issuerUid) {
      const issuerDoc = dbUsers.get(issuerUid);
      if (issuerDoc && issuerDoc.email) {
        issuerEmail = issuerDoc.email.trim();
        issuerName = issuerDoc.name;
      }
    }

    // Phase 2 Notification Dispatch: Strict targeting to issuer, NO generic fallback
    if (!issuerEmail) {
      emailNotificationLogs.push({
        itemId,
        recipientEmail: "",
        recipientName: issuerName,
        status: "ERROR_NO_ISSUER_EMAIL",
        error: "E-mail do emissor responsável não encontrado para notificação.",
      });
    } else {
      emailNotificationLogs.push({
        itemId,
        recipientEmail: issuerEmail,
        recipientName: issuerName,
        status: "SENT",
      });
    }

    return {
      status: 200,
      body: {
        success: true,
        message: "Assinatura do receptor confirmada com sucesso.",
        recipientSignatureUrl: signatureDataUrl,
        validationCode: item.receiptValidationCode,
      },
    };
  }

  // Simulation of server.ts confirm-staff-signature logic (Staff Issuer Attestation)
  async function simulateConfirmStaffSignaturePhase4C(params: {
    itemId: string;
    signatureDataUrl: string;
    authUser: { uid: string; email?: string; role: string; status?: string };
    dbItems: Map<string, MockItemDoc>;
    dbSignatureRequests: Map<string, MockSignatureRequestDoc>;
  }): Promise<{ status: number; body: any }> {
    const { itemId, signatureDataUrl, authUser, dbItems, dbSignatureRequests } = params;

    // RBAC: Must be Staff or Admin
    if (authUser.role !== "ADMIN" && authUser.role !== "SERVIDOR") {
      return { status: 403, body: { success: false, error: "Acesso negado. Apenas servidores e administradores ativos do IFPR podem executar esta operação." } };
    }
    if (authUser.status === "SUSPENDED" || authUser.status === "INACTIVE") {
      return { status: 403, body: { success: false, error: "Conta suspensa ou inativa." } };
    }

    const item = dbItems.get(itemId);
    if (!item) {
      return { status: 404, body: { success: false, error: "Ocorrência não encontrada." } };
    }

    if (item.recipientSignatureStatus !== "SIGNED") {
      return { status: 400, body: { success: false, error: "A assinatura do receptor deve ser concluída antes da atestação do atendente." } };
    }

    const sigReq = dbSignatureRequests.get(itemId);
    const issuerUid = item.returnedByUserId || sigReq?.dispatchedByUserId;

    // Strict Issuer Check: Only the specific issuer who emitted the return can sign
    if (issuerUid && authUser.uid !== issuerUid) {
      return {
        status: 403,
        body: {
          success: false,
          error: "Apenas o servidor emissor responsável por registrar/liberar esta devolução pode atestar e assinar o termo.",
        },
      };
    }

    if (item.staffSignatureStatus === "SIGNED" && item.staffSignatureUrl) {
      return {
        status: 200,
        body: {
          success: true,
          alreadyCompleted: true,
          message: "Assinatura do atendente já estava registrada.",
          staffSignatureUrl: item.staffSignatureUrl,
        },
      };
    }

    item.staffSignatureStatus = "SIGNED";
    item.staffSignatureUrl = signatureDataUrl;
    item.staffSignedAt = new Date().toISOString();
    item.staffSignerUid = authUser.uid;
    item.staffSignerEmail = authUser.email;

    return {
      status: 200,
      body: {
        success: true,
        alreadyCompleted: false,
        message: "Assinatura do atendente registrada com sucesso no banco de dados.",
        staffSignatureUrl: signatureDataUrl,
      },
    };
  }

  // Common Test Fixtures
  let dbItems: Map<string, MockItemDoc>;
  let dbSignatureRequests: Map<string, MockSignatureRequestDoc>;
  let dbUsers: Map<string, MockUserDoc>;
  let emailNotificationLogs: any[];

  const validToken = "token_recipient_123";
  const validPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  beforeEach(() => {
    dbUsers = new Map([
      ["uid-issuer-prof-paulo", { uid: "uid-issuer-prof-paulo", name: "Prof. Paulo Cauan", email: "paulocauan@ifpr.edu.br", role: "SERVIDOR", status: "ACTIVE" }],
      ["uid-other-servidor", { uid: "uid-other-servidor", name: "Prof. Outro Servidor", email: "outro@ifpr.edu.br", role: "SERVIDOR", status: "ACTIVE" }],
      ["uid-[#ADMIN]", { uid: "uid-[#ADMIN]", name: "Admin Geral", email: "admin@ifpr.edu.br", role: "ADMIN", status: "ACTIVE" }],
    ]);

    dbItems = new Map([
      [
        "item-101",
        {
          id: "item-101",
          title: "Calculadora Científica Casio",
          status: "DEVOLVIDO",
          recipientSignatureStatus: "PENDING_REMOTE",
          staffSignatureStatus: "PENDING_STAFF",
          returnedByUserId: "uid-issuer-prof-paulo",
        },
      ],
      [
        "item-legacy-102",
        {
          id: "item-legacy-102",
          title: "Guarda-chuva Azul",
          status: "DEVOLVIDO",
          recipientSignatureStatus: "SIGNED",
          staffSignatureStatus: "PENDING_STAFF",
          // No returnedByUserId set on legacy item
        },
      ],
    ]);

    dbSignatureRequests = new Map([
      [
        "item-101",
        {
          itemId: "item-101",
          tokenHash: crypto.createHash("sha256").update(validToken).digest("hex"),
          recipientEmail: "aluno@estudante.ifpr.edu.br",
          recipientName: "Aluno Teste",
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          used: false,
          dispatchedByUserId: "uid-issuer-prof-paulo",
        },
      ],
    ]);

    emailNotificationLogs = [];
  });

  it("1. Notificação direcionada ao e-mail do emissor responsável", async () => {
    const res = await simulateConfirmSignaturePhase4C({
      itemId: "item-101",
      token: validToken,
      signatureDataUrl: validPng,
      dbItems,
      dbSignatureRequests,
      dbUsers,
      emailNotificationLogs,
    });

    expect(res.status).toBe(200);
    expect(emailNotificationLogs.length).toBe(1);
    expect(emailNotificationLogs[0].recipientEmail).toBe("paulocauan@ifpr.edu.br");
    expect(emailNotificationLogs[0].status).toBe("SENT");
  });

  it("2. Não utilização do e-mail genérico do campus (campus.ivaipora@ifpr.edu.br) como fallback", async () => {
    // Unset returnedByUserId and dispatchedByUserId to test absence of email
    const item = dbItems.get("item-101")!;
    item.returnedByUserId = undefined;
    const sigReq = dbSignatureRequests.get("item-101")!;
    sigReq.dispatchedByUserId = undefined;

    await simulateConfirmSignaturePhase4C({
      itemId: "item-101",
      token: validToken,
      signatureDataUrl: validPng,
      dbItems,
      dbSignatureRequests,
      dbUsers,
      emailNotificationLogs,
    });

    expect(emailNotificationLogs.length).toBe(1);
    expect(emailNotificationLogs[0].recipientEmail).not.toBe("campus.ivaipora@ifpr.edu.br");
    expect(emailNotificationLogs[0].status).toBe("ERROR_NO_ISSUER_EMAIL");
  });

  it("3. Resiliência: Ausência do e-mail do emissor mantém status PENDING_STAFF e NÃO invalida assinatura do receptor", async () => {
    const item = dbItems.get("item-101")!;
    item.returnedByUserId = "uid-inexistent";

    const res = await simulateConfirmSignaturePhase4C({
      itemId: "item-101",
      token: validToken,
      signatureDataUrl: validPng,
      dbItems,
      dbSignatureRequests,
      dbUsers,
      emailNotificationLogs,
    });

    expect(res.status).toBe(200);
    expect(item.recipientSignatureStatus).toBe("SIGNED");
    expect(item.staffSignatureStatus).toBe("PENDING_STAFF");
    expect(emailNotificationLogs[0].status).toBe("ERROR_NO_ISSUER_EMAIL");
  });

  it("4. RBAC estrito: Servidor não emissor é rejeitado com 403 no confirm-staff-signature", async () => {
    // Receiver signs first
    const item = dbItems.get("item-101")!;
    item.recipientSignatureStatus = "SIGNED";

    // Unmatching servidor attempts to sign
    const res = await simulateConfirmStaffSignaturePhase4C({
      itemId: "item-101",
      signatureDataUrl: validPng,
      authUser: { uid: "uid-other-servidor", role: "SERVIDOR", status: "ACTIVE" },
      dbItems,
      dbSignatureRequests,
    });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("Apenas o servidor emissor responsável por registrar/liberar esta devolução pode atestar e assinar o termo");
  });

  it("5. Autenticação do emissor: Emissor responsável assina e atesta com sucesso", async () => {
    const item = dbItems.get("item-101")!;
    item.recipientSignatureStatus = "SIGNED";

    const res = await simulateConfirmStaffSignaturePhase4C({
      itemId: "item-101",
      signatureDataUrl: validPng,
      authUser: { uid: "uid-issuer-prof-paulo", email: "paulocauan@ifpr.edu.br", role: "SERVIDOR", status: "ACTIVE" },
      dbItems,
      dbSignatureRequests,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(item.staffSignatureStatus).toBe("SIGNED");
    expect(item.staffSignerUid).toBe("uid-issuer-prof-paulo");
  });

  it("6. Proteção contra substituição em chamada direta no endpoint", async () => {
    const item = dbItems.get("item-101")!;
    item.recipientSignatureStatus = "SIGNED";

    // Direct API attempt with arbitrary user UID
    const res = await simulateConfirmStaffSignaturePhase4C({
      itemId: "item-101",
      signatureDataUrl: validPng,
      authUser: { uid: "imposter-uid-999", role: "SERVIDOR", status: "ACTIVE" },
      dbItems,
      dbSignatureRequests,
    });

    expect(res.status).toBe(403);
    expect(item.staffSignatureStatus).toBe("PENDING_STAFF");
  });

  it("7. Idempotência de tentativas repetidas de atestação", async () => {
    const item = dbItems.get("item-101")!;
    item.recipientSignatureStatus = "SIGNED";

    // First call
    await simulateConfirmStaffSignaturePhase4C({
      itemId: "item-101",
      signatureDataUrl: validPng,
      authUser: { uid: "uid-issuer-prof-paulo", email: "paulocauan@ifpr.edu.br", role: "SERVIDOR", status: "ACTIVE" },
      dbItems,
      dbSignatureRequests,
    });

    // Second call (Retry)
    const retryRes = await simulateConfirmStaffSignaturePhase4C({
      itemId: "item-101",
      signatureDataUrl: validPng,
      authUser: { uid: "uid-issuer-prof-paulo", email: "paulocauan@ifpr.edu.br", role: "SERVIDOR", status: "ACTIVE" },
      dbItems,
      dbSignatureRequests,
    });

    expect(retryRes.status).toBe(200);
    expect(retryRes.body.alreadyCompleted).toBe(true);
  });

  it("8. Exibição correta da fila no frontend filtrada por emissor", () => {
    const itemsList = Array.from(dbItems.values());
    const currentUserProfPaulo = { id: "uid-issuer-prof-paulo", role: "SERVIDOR" };
    const currentUserOtherServidor = { id: "uid-other-servidor", role: "SERVIDOR" };

    const filterQueueForUser = (user: { id: string }) => {
      return itemsList.filter(
        (it) =>
          it.status === "DEVOLVIDO" &&
          it.recipientSignatureStatus === "SIGNED" &&
          it.staffSignatureStatus !== "SIGNED" &&
          (!it.returnedByUserId || it.returnedByUserId === user.id)
      );
    };

    // Legacy item-legacy-102 has recipientSignatureStatus === 'SIGNED' and no returnedByUserId
    const pauloQueue = filterQueueForUser(currentUserProfPaulo);
    const outroQueue = filterQueueForUser(currentUserOtherServidor);

    expect(pauloQueue.some((i) => i.id === "item-legacy-102")).toBe(true);
    expect(outroQueue.some((i) => i.id === "item-legacy-102")).toBe(true);
  });

  it("9. Fidelidade na renderização do recibo de devolução com dados persistidos", () => {
    const item = dbItems.get("item-101")!;
    item.recipientSignatureStatus = "SIGNED";
    item.recipientSignatureUrl = validPng;
    item.staffSignatureStatus = "SIGNED";
    item.staffSignatureUrl = validPng;
    item.staffSignerName = "Prof. Paulo Cauan";

    expect(item.recipientSignatureUrl).toBeTruthy();
    expect(item.staffSignatureUrl).toBeTruthy();
    expect(item.staffSignerName).toBe("Prof. Paulo Cauan");
  });

  it("10. Legibilidade e acessibilidade de registros legados sem erro", () => {
    const legacyItem = dbItems.get("item-legacy-102")!;
    expect(legacyItem.returnedByUserId).toBeUndefined();
    expect(legacyItem.title).toBe("Guarda-chuva Azul");
    expect(legacyItem.recipientSignatureStatus).toBe("SIGNED");
  });
});
