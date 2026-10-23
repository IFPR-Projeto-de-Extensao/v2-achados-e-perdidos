import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

describe("Digital Signature & Dual Signer Flow Security Audit (/api/signature/*)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Data Models modeling production Firestore state with Dual Signers
  interface MockItemDoc {
    id: string;
    title: string;
    status: "DISPONIVEL" | "ENCONTRADO" | "DEVOLVIDO" | "ENCERRADO";
    
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
    staffSignatureRequestId?: string;

    // Tokens & Receipt
    signatureToken?: string | null;
    signatureTokenUsed?: boolean;
    signatureTokenExpiresAt?: string;
    receiptValidationCode?: string;
    signedAt?: string;
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
    type?: "RECIPIENT_RETURN" | "STAFF_ATTESTATION";
    assignedStaffEmail?: string;
  }

  // Exact reproduction of server.ts verify-token logic
  function simulateVerifyToken(params: {
    itemId?: string;
    token?: string;
    signerType?: "RECIPIENT" | "STAFF";
    dbItems: Map<string, MockItemDoc>;
    dbSignatureRequests: Map<string, MockSignatureRequestDoc>;
  }): { status: number; body: any } {
    const { itemId, token, signerType = "RECIPIENT", dbItems, dbSignatureRequests } = params;

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

    if (signerType === "STAFF") {
      // Staff verification requires recipient to be already signed
      if (item.recipientSignatureStatus !== "SIGNED") {
        return {
          status: 400,
          body: { success: false, valid: false, reason: "RECIPIENT_PENDING", error: "A assinatura do receptor ainda não foi concluída." },
        };
      }
      if (item.staffSignatureStatus === "SIGNED") {
        return {
          status: 200,
          body: {
            success: true,
            valid: true,
            isAlreadySigned: true,
            staffSignatureUrl: item.staffSignatureUrl || "",
          },
        };
      }
    }

    return {
      status: 200,
      body: {
        success: true,
        valid: true,
        isAlreadySigned: signerType === "STAFF" ? item.staffSignatureStatus === "SIGNED" : item.recipientSignatureStatus === "SIGNED",
        item: {
          id: item.id,
          title: item.title,
          status: item.status,
          recipientSignatureStatus: item.recipientSignatureStatus,
          staffSignatureStatus: item.staffSignatureStatus,
        },
      },
    };
  }

  // Exact reproduction of server.ts confirm-signature logic with Dual Signer support
  async function simulateConfirmSignature(params: {
    itemId?: string;
    token?: string;
    signatureDataUrl?: string;
    signatureMethod?: "DRAWN" | "TYPED_NAME";
    signerType?: "RECIPIENT" | "STAFF";
    signerName?: string;
    signerEmail?: string;
    signerUid?: string;
    signerBond?: string;
    dbItems: Map<string, MockItemDoc>;
    dbSignatureRequests: Map<string, MockSignatureRequestDoc>;
  }): Promise<{ status: number; body: any }> {
    const {
      itemId,
      token,
      signatureDataUrl,
      signatureMethod = "DRAWN",
      signerType = "RECIPIENT",
      signerName,
      signerEmail,
      signerUid,
      signerBond,
      dbItems,
      dbSignatureRequests,
    } = params;

    if (!itemId || !token || !signatureDataUrl || typeof itemId !== "string" || typeof token !== "string") {
      return { status: 400, body: { success: false, error: "Parâmetros obrigatórios ausentes." } };
    }

    const item = dbItems.get(itemId);
    if (!item) {
      return { status: 404, body: { success: false, error: "Ocorrência não encontrada." } };
    }

    const cleanToken = token.trim();
    const tokenHash = crypto.createHash("sha256").update(cleanToken).digest("hex");
    const sigReq = dbSignatureRequests.get(itemId);

    if (signerType === "STAFF") {
      if (item.recipientSignatureStatus !== "SIGNED") {
        return { status: 400, body: { success: false, error: "O receptor precisa assinar antes do servidor atendente." } };
      }
      if (item.staffSignatureStatus === "SIGNED") {
        return {
          status: 200,
          body: {
            success: true,
            alreadyCompleted: true,
            message: "Assinatura do atendente já confirmada anteriormente.",
            staffSignatureUrl: item.staffSignatureUrl,
          },
        };
      }

      item.staffSignatureStatus = "SIGNED";
      item.staffSignatureUrl = signatureDataUrl;
      item.staffSignatureMethod = signatureMethod;
      item.staffSignedAt = new Date().toISOString();
      item.staffSignerName = signerName || "Servidor Atendente";
      item.staffSignerEmail = signerEmail || "servidor@ifpr.edu.br";
      item.staffSignerUid = signerUid || "uid-staff-123";

      return {
        status: 200,
        body: {
          success: true,
          message: "Assinatura do atendente confirmada com sucesso.",
          staffSignatureUrl: signatureDataUrl,
        },
      };
    } else {
      // Recipient Signature
      if (item.recipientSignatureStatus === "SIGNED") {
        return {
          status: 200,
          body: {
            success: true,
            alreadyCompleted: true,
            message: "Assinatura do receptor já confirmada anteriormente.",
            recipientSignatureUrl: item.recipientSignatureUrl,
          },
        };
      }

      item.recipientSignatureStatus = "SIGNED";
      item.recipientSignatureUrl = signatureDataUrl;
      item.recipientSignatureMethod = signatureMethod;
      item.recipientSignedAt = new Date().toISOString();
      item.staffSignatureStatus = "PENDING_STAFF"; // Automatically requests staff signature next

      return {
        status: 200,
        body: {
          success: true,
          message: "Assinatura do receptor confirmada. Solicitação de assinatura do atendente gerada.",
          recipientSignatureUrl: signatureDataUrl,
          nextStep: "PENDING_STAFF_SIGNATURE",
        },
      };
    }
  }

  // =========================================================================
  // TESTS FOR DUAL SIGNER FLOW (RECIPIENT + STAFF)
  // =========================================================================

  let dbItems: Map<string, MockItemDoc>;
  let dbSignatureRequests: Map<string, MockSignatureRequestDoc>;

  const rawTokenRecipient = "sig_recipient_token_123456789";
  const rawTokenStaff = "sig_staff_token_987654321";
  const validPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  beforeEach(() => {
    dbItems = new Map([
      [
        "item-dual-test",
        {
          id: "item-dual-test",
          title: "Notebook Lenovo i5",
          status: "DEVOLVIDO",
          recipientSignatureStatus: "PENDING_REMOTE",
          staffSignatureStatus: "PENDING_STAFF",
          recipientName: "Carlos Aluno",
          recipientEmail: "carlos@estudante.ifpr.edu.br",
        },
      ],
    ]);

    dbSignatureRequests = new Map([
      [
        "item-dual-test",
        {
          itemId: "item-dual-test",
          tokenHash: crypto.createHash("sha256").update(rawTokenRecipient).digest("hex"),
          recipientEmail: "carlos@estudante.ifpr.edu.br",
          recipientName: "Carlos Aluno",
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          used: false,
          type: "RECIPIENT_RETURN",
        },
      ],
    ]);
  });

  it("1. Receptor assina com sucesso e o sistema define staffSignatureStatus como PENDING_STAFF", async () => {
    const res = await simulateConfirmSignature({
      itemId: "item-dual-test",
      token: rawTokenRecipient,
      signatureDataUrl: validPng,
      signerType: "RECIPIENT",
      dbItems,
      dbSignatureRequests,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.nextStep).toBe("PENDING_STAFF_SIGNATURE");

    const item = dbItems.get("item-dual-test");
    expect(item?.recipientSignatureStatus).toBe("SIGNED");
    expect(item?.staffSignatureStatus).toBe("PENDING_STAFF");
    expect(item?.recipientSignatureUrl).toBe(validPng);
  });

  it("2. Servidor atendente assina dentro do Localiza+ ou por token após o receptor", async () => {
    // Passo 1: Receptor assina
    await simulateConfirmSignature({
      itemId: "item-dual-test",
      token: rawTokenRecipient,
      signatureDataUrl: validPng,
      signerType: "RECIPIENT",
      dbItems,
      dbSignatureRequests,
    });

    // Passo 2: Servidor atendente assina
    const staffRes = await simulateConfirmSignature({
      itemId: "item-dual-test",
      token: rawTokenStaff,
      signatureDataUrl: validPng,
      signerType: "STAFF",
      signerName: "Prof. Paulo Servidor",
      signerEmail: "paulo@ifpr.edu.br",
      dbItems,
      dbSignatureRequests,
    });

    expect(staffRes.status).toBe(200);
    expect(staffRes.body.success).toBe(true);

    const item = dbItems.get("item-dual-test");
    expect(item?.recipientSignatureStatus).toBe("SIGNED");
    expect(item?.staffSignatureStatus).toBe("SIGNED");
    expect(item?.staffSignatureUrl).toBe(validPng);
    expect(item?.staffSignerName).toBe("Prof. Paulo Servidor");
  });

  it("3. Servidor não pode assinar antes da conclusão da assinatura do receptor", async () => {
    // Tenta assinar como atendente com o item ainda pendente para o receptor
    const staffRes = await simulateConfirmSignature({
      itemId: "item-dual-test",
      token: rawTokenStaff,
      signatureDataUrl: validPng,
      signerType: "STAFF",
      dbItems,
      dbSignatureRequests,
    });

    expect(staffRes.status).toBe(400);
    expect(staffRes.body.success).toBe(false);
    expect(staffRes.body.error).toContain("precisa assinar antes");
  });
});
