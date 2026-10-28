import { describe, it, expect, vi, beforeEach } from "vitest";
import { ItemClaim, LostFoundItem, User } from "../types";

/**
 * Unit & Adversarial Security Test Suite for Localiza+ v1.10.8:
 * - Claim Workflow (RNF04 declarative possession verification)
 * - Concurrency & Duplicate Prevention (Atomic Transactions & Deterministic IDs)
 * - Notification Decoupling & Resilience
 * - Firestore Security Rules Engine replication (/claims/{claimId})
 */

interface ClaimSubmissionPayload {
  distinctiveFeatures: string;
  additionalInfo?: string;
  [key: string]: any;
}

interface MockFirestoreDB {
  items: Map<string, LostFoundItem>;
  claims: Map<string, ItemClaim>;
  notifications: Array<{ toUserId: string; title: string; message: string; itemId?: string }>;
}

/**
 * Replicates the Firestore Security Rules evaluator for /claims/{claimId}
 * as implemented in firestore.rules.
 */
class FirestoreRulesEvaluator {
  constructor(private db: MockFirestoreDB) {}

  private hasNoAdminReviewFields(data: Record<string, any>): boolean {
    return (
      !("reviewedByUserId" in data) &&
      !("reviewedByName" in data) &&
      !("reviewedByRole" in data) &&
      !("reviewedAt" in data) &&
      !("rejectionReason" in data) &&
      !("decisionNotes" in data) &&
      !("completedAt" in data) &&
      !("cancelledAt" in data)
    );
  }

  private areImmutableFieldsPreserved(existing: ItemClaim, incoming: Record<string, any>): boolean {
    return (
      incoming.id === existing.id &&
      incoming.itemId === existing.itemId &&
      incoming.claimerId === existing.claimerId &&
      incoming.createdAt === existing.createdAt &&
      incoming.distinctiveFeatures === existing.distinctiveFeatures
    );
  }

  evaluateCreate(auth: Partial<User> | null, claimId: string, incoming: Record<string, any>): void {
    if (!auth || !auth.id || auth.id === "guest") {
      throw new Error("PERMISSION_DENIED: Unauthenticated user cannot create claims.");
    }
    if (auth.status === "suspended" || auth.status === "banned") {
      throw new Error("PERMISSION_DENIED: Inactive or blocked account.");
    }
    if (auth.role === "INTRUSO") {
      throw new Error("PERMISSION_DENIED: Intruso role blocked.");
    }
    if (incoming.claimerId !== auth.id) {
      throw new Error("PERMISSION_DENIED: Claimer ID must match authenticated UID.");
    }
    if (claimId !== `claim_${auth.id}_${incoming.itemId}`) {
      throw new Error("PERMISSION_DENIED: Claim document ID must match deterministic format claim_{uid}_{itemId}.");
    }
    if (incoming.status !== "PENDENTE") {
      throw new Error("PERMISSION_DENIED: New claim status must strictly be 'PENDENTE'.");
    }
    if (!incoming.itemId || typeof incoming.itemId !== "string" || incoming.itemId.trim().length === 0) {
      throw new Error("PERMISSION_DENIED: Valid itemId is required.");
    }
    if (!incoming.distinctiveFeatures || typeof incoming.distinctiveFeatures !== "string" || incoming.distinctiveFeatures.trim().length === 0) {
      throw new Error("PERMISSION_DENIED: distinctiveFeatures cannot be empty.");
    }
    if (incoming.distinctiveFeatures.length > 1000) {
      throw new Error("PERMISSION_DENIED: distinctiveFeatures exceeds 1000 characters limit.");
    }
    if (incoming.additionalInfo && incoming.additionalInfo.length > 1000) {
      throw new Error("PERMISSION_DENIED: additionalInfo exceeds 1000 characters limit.");
    }
    if (!this.hasNoAdminReviewFields(incoming)) {
      throw new Error("PERMISSION_DENIED: Administrative review fields cannot be injected on claim creation.");
    }
    const item = this.db.items.get(incoming.itemId);
    if (!item) {
      throw new Error("PERMISSION_DENIED: Target item does not exist in the catalog.");
    }
    if (item.status === "DEVOLVIDO" || item.status === "ENCERRADO") {
      throw new Error("PERMISSION_DENIED: Target item is already DEVOLVIDO or ENCERRADO.");
    }
  }

  evaluateUpdate(auth: Partial<User> | null, claimId: string, existing: ItemClaim, incoming: Record<string, any>): void {
    if (!auth || !auth.id || auth.id === "guest") {
      throw new Error("PERMISSION_DENIED: Unauthenticated update.");
    }
    if (auth.status === "suspended" || auth.status === "banned") {
      throw new Error("PERMISSION_DENIED: Account is inactive or blocked.");
    }

    const isStaffOrAdmin = auth.role === "ADMIN" || auth.role === "SERVIDOR" || auth.email === "paulocauan39@gmail.com";

    // Branch 1: Claimant Cancellation
    const isClaimant = existing.claimerId === auth.id;
    if (isClaimant && existing.status === "PENDENTE" && incoming.status === "CANCELADO") {
      // Must only touch affected keys: ['status', 'cancelledAt']
      const changedKeys = Object.keys(incoming).filter((k) => (incoming as any)[k] !== (existing as any)[k]);
      const disallowedKeys = changedKeys.filter((k) => k !== "status" && k !== "cancelledAt");
      if (disallowedKeys.length > 0) {
        throw new Error(`PERMISSION_DENIED: Claimant can only modify 'status' and 'cancelledAt' during cancellation. Disallowed: ${disallowedKeys.join(", ")}`);
      }
      return;
    }

    // Branch 2: Claimant Resubmission if previously CANCELADO or REJEITADO
    if (isClaimant && (existing.status === "CANCELADO" || existing.status === "REJEITADO") && incoming.status === "PENDENTE") {
      if (incoming.id !== existing.id) {
        throw new Error("PERMISSION_DENIED: Claim ID cannot be changed on resubmission.");
      }
      if (incoming.claimerId !== auth.id || incoming.itemId !== existing.itemId) {
        throw new Error("PERMISSION_DENIED: Cannot change claimer or item on resubmission.");
      }
      if (incoming.createdAt !== existing.createdAt) {
        throw new Error("PERMISSION_DENIED: Original createdAt timestamp must be preserved on resubmission.");
      }
      if (!incoming.distinctiveFeatures || typeof incoming.distinctiveFeatures !== "string" || incoming.distinctiveFeatures.trim().length === 0) {
        throw new Error("PERMISSION_DENIED: distinctiveFeatures cannot be empty on resubmission.");
      }
      if (incoming.distinctiveFeatures.length > 1000) {
        throw new Error("PERMISSION_DENIED: distinctiveFeatures exceeds 1000 characters limit.");
      }
      if (!this.hasNoAdminReviewFields(incoming)) {
        throw new Error("PERMISSION_DENIED: Administrative review fields cannot be injected on claim resubmission.");
      }
      const item = this.db.items.get(incoming.itemId);
      if (!item || item.status === "DEVOLVIDO" || item.status === "ENCERRADO") {
        throw new Error("PERMISSION_DENIED: Item is unavailable for resubmission.");
      }
      return;
    }

    // Branch 3: Staff / Admin Review & Finite State Machine
    if (isStaffOrAdmin) {
      if (!this.areImmutableFieldsPreserved(existing, incoming)) {
        throw new Error("PERMISSION_DENIED: Immutable claim fields (id, itemId, claimerId, createdAt, distinctiveFeatures) cannot be altered.");
      }

      // Settled terminal states cannot be altered
      if (existing.status === "CONCLUIDO") {
        throw new Error("PERMISSION_DENIED: Concluded claims are terminal and cannot be modified.");
      }
      if (existing.status === "CANCELADO") {
        throw new Error("PERMISSION_DENIED: Cancelled claims cannot be modified by staff.");
      }

      // Valid lifecycle transitions
      const isValidTransition =
        (existing.status === "PENDENTE" && ["APROVADO", "REJEITADO", "CANCELADO"].includes(incoming.status)) ||
        (existing.status === "APROVADO" && ["CONCLUIDO", "REJEITADO"].includes(incoming.status)) ||
        (existing.status === "REJEITADO" && incoming.status === "APROVADO") ||
        (incoming.status === existing.status && ["PENDENTE", "APROVADO"].includes(existing.status));

      if (!isValidTransition) {
        throw new Error(`PERMISSION_DENIED: Invalid lifecycle transition from '${existing.status}' to '${incoming.status}'.`);
      }

      if (incoming.status === "REJEITADO") {
        if (!incoming.rejectionReason || typeof incoming.rejectionReason !== "string" || incoming.rejectionReason.trim().length === 0) {
          throw new Error("PERMISSION_DENIED: Rejection requires a non-empty rejectionReason.");
        }
      }

      if (incoming.status === "CONCLUIDO") {
        if (!incoming.completedAt || typeof incoming.completedAt !== "string" || incoming.completedAt.trim().length === 0) {
          throw new Error("PERMISSION_DENIED: Conclusion requires a valid completedAt timestamp.");
        }
      }
      return;
    }

    throw new Error("PERMISSION_DENIED: Unauthorized claim update.");
  }

  evaluateGet(auth: Partial<User> | null, claimId: string): void {
    if (!auth || !auth.id || auth.id === "guest") {
      throw new Error("PERMISSION_DENIED: Unauthenticated user cannot read claims.");
    }
    if (auth.status === "suspended" || auth.status === "banned") {
      throw new Error("PERMISSION_DENIED: Suspended or banned accounts cannot read claims.");
    }
    const isStaffOrAdmin = auth.role === "ADMIN" || auth.role === "SERVIDOR" || auth.email === "paulocauan39@gmail.com";

    // Branch A: Deterministic claim ID pattern for claimant's own UID (requires active account)
    if (claimId.startsWith(`claim_${auth.id}_`)) {
      return; // Allowed whether doc exists or not
    }

    const existingDoc = this.db.claims.get(claimId);

    // Branch B: Existing claim document read by owner or item author (requires active account & existing doc)
    if (existingDoc && auth.status === "active") {
      if (existingDoc.claimerId === auth.id) {
        return; // Allowed: owner
      }
      const item = this.db.items.get(existingDoc.itemId);
      if (item && item.registeredByUserId === auth.id) {
        return; // Allowed: item author
      }
    }

    // Branch C: Staff / Admin full read access
    if (isStaffOrAdmin && auth.status === "active") {
      return; // Allowed: active staff/admin
    }

    throw new Error("PERMISSION_DENIED: Unauthorized claim read.");
  }

  evaluateList(auth: Partial<User> | null, filterClaimerId?: string): void {
    if (!auth || !auth.id || auth.id === "guest") {
      throw new Error("PERMISSION_DENIED: Unauthenticated user cannot list claims.");
    }
    const isStaffOrAdmin = auth.role === "ADMIN" || auth.role === "SERVIDOR" || auth.email === "paulocauan39@gmail.com";
    if (!isStaffOrAdmin) {
      if (filterClaimerId !== auth.id) {
        throw new Error("PERMISSION_DENIED: Regular users can only list their own claims (where claimerId == auth.uid).");
      }
    }
  }
}

/**
 * Replicates the AppContext claim workflow methods, including atomic transactions,
 * deterministic claim IDs, concurrency guards, and decoupled notifications.
 */
class ClaimWorkflowSimulator {
  private inFlightSubmissions = new Set<string>();
  public rulesEvaluator: FirestoreRulesEvaluator;
  public failNotification = false;
  public failAuditLog = false;

  constructor(public db: MockFirestoreDB) {
    this.rulesEvaluator = new FirestoreRulesEvaluator(db);
  }

  async submitClaim(
    user: Partial<User> | null,
    itemId: string,
    payload: ClaimSubmissionPayload | string
  ): Promise<ItemClaim> {
    if (!user || !user.id || user.id === "guest" || user.id === "guest_visitor") {
      throw new Error("Apenas usuários autenticados com conta institucional ativa podem solicitar a devolução de pertences.");
    }

    if (user.status === "suspended" || user.status === "banned") {
      throw new Error("Sua conta institucional encontra-se restrita para solicitações.");
    }

    const distinctiveFeatures = typeof payload === "string" ? payload.trim() : (payload.distinctiveFeatures || "").trim();
    const additionalInfo = typeof payload === "object" && payload.additionalInfo ? payload.additionalInfo.trim() : undefined;

    if (!distinctiveFeatures) {
      throw new Error("Informe as características particulares e detalhes do objeto para comprovar a posse.");
    }

    if (distinctiveFeatures.length > 1000 || (additionalInfo && additionalInfo.length > 1000)) {
      throw new Error("A descrição das características não pode ultrapassar 1000 caracteres.");
    }

    // In-flight guard (single tab rapid clicks)
    const inFlightKey = `${user.id}_${itemId}`;
    if (this.inFlightSubmissions.has(inFlightKey)) {
      throw new Error("Uma solicitação para este objeto já está sendo processada. Aguarde.");
    }
    this.inFlightSubmissions.add(inFlightKey);

    const claimDocId = `claim_${user.id}_${itemId}`;

    try {
      // Local duplicate check
      const localDuplicate = Array.from(this.db.claims.values()).find(
        (c) => c.itemId === itemId && c.claimerId === user.id && (c.status === "PENDENTE" || c.status === "APROVADO")
      );
      if (localDuplicate) {
        throw new Error(
          localDuplicate.status === "APROVADO"
            ? "Sua solicitação para este objeto já foi aprovada. Compareça à Secretaria/SEBAC para retirada."
            : "Você já possui uma solicitação em análise para este objeto. Aguarde a avaliação da Secretaria."
        );
      }

      const item = this.db.items.get(itemId);
      if (!item) {
        throw new Error("Objeto não encontrado no acervo do campus.");
      }

      if (item.status === "DEVOLVIDO" || item.status === "ENCERRADO") {
        throw new Error("Este pertence já foi devolvido ou seu ciclo de custódia foi encerrado.");
      }

      const newClaim: ItemClaim = {
        id: claimDocId,
        itemId: item.id,
        itemTitle: item.title,
        itemCategory: item.category,
        itemLocation: item.location,
        claimerId: user.id,
        claimerName: user.name || "Aluno IFPR",
        claimerEmail: user.email || "aluno@ifpr.edu.br",
        claimerRole: user.role || "ALUNO",
        claimerRegistration: user.registrationNumber,
        distinctiveFeatures,
        additionalInfo,
        verificationAnswer: distinctiveFeatures,
        status: "PENDENTE",
        createdAt: new Date().toISOString(),
      };

      // Atomic transactional execution
      const existingDoc = this.db.claims.get(claimDocId);
      if (existingDoc) {
        if (existingDoc.status === "PENDENTE" || existingDoc.status === "APROVADO") {
          throw new Error("Já existe solicitação pendente ou aprovada para este objeto.");
        }
        if (existingDoc.status === "CONCLUIDO") {
          throw new Error("Este pertence já foi retirado e sua solicitação encontra-se concluída.");
        }
        // Resubmission: preserve historical createdAt and id
        newClaim.createdAt = existingDoc.createdAt;
        newClaim.resubmittedAt = new Date().toISOString();
        this.rulesEvaluator.evaluateUpdate(user, claimDocId, existingDoc, newClaim);
      } else {
        // First submission: evaluate create rule
        this.rulesEvaluator.evaluateCreate(user, claimDocId, newClaim);
      }

      this.db.claims.set(claimDocId, newClaim);

      // Decoupled notification dispatch (non-fatal)
      try {
        if (this.failNotification) {
          throw new Error("Simulated network notification failure");
        }
        this.db.notifications.push({
          toUserId: user.id,
          title: "Solicitação Registrada",
          message: `Sua declaração de posse para "${item.title}" foi registrada com sucesso.`,
          itemId,
        });
      } catch (notifErr) {
        // Notification failure does not roll back database record
      }

      return newClaim;
    } finally {
      this.inFlightSubmissions.delete(inFlightKey);
    }
  }

  async updateClaimStatus(
    operator: Partial<User>,
    claimId: string,
    newStatus: ItemClaim["status"],
    options?: { rejectionReason?: string; decisionNotes?: string }
  ): Promise<ItemClaim> {
    const isStaffOrAdmin = operator.role === "ADMIN" || operator.role === "SERVIDOR" || operator.email === "paulocauan39@gmail.com";
    if (!isStaffOrAdmin) {
      throw new Error("Apenas servidores ou administradores da Secretaria podem aprovar ou rejeitar solicitações.");
    }

    const claim = this.db.claims.get(claimId);
    if (!claim) {
      throw new Error("Solicitação não encontrada.");
    }

    if (claim.status === "CONCLUIDO" && newStatus !== "CONCLUIDO") {
      throw new Error("Esta solicitação já foi concluída e vinculada à devolução física do objeto.");
    }

    if (claim.status === "CANCELADO" && newStatus !== "CANCELADO") {
      throw new Error("Solicitações canceladas pelo usuário não podem ter seu status alterado.");
    }

    if (newStatus === "REJEITADO" && (!options?.rejectionReason || !options.rejectionReason.trim())) {
      throw new Error("Informe a justificativa da rejeição da solicitação para ciência do requerente.");
    }

    const updatedClaim: ItemClaim = {
      ...claim,
      status: newStatus,
      reviewedByUserId: operator.id,
      reviewedByName: operator.name || "Servidor IFPR",
      reviewedByRole: operator.role || "SERVIDOR",
      reviewedAt: new Date().toISOString(),
      rejectionReason: newStatus === "REJEITADO" ? options?.rejectionReason?.trim() : undefined,
      decisionNotes: options?.decisionNotes?.trim(),
      completedAt: newStatus === "CONCLUIDO" ? new Date().toISOString() : claim.completedAt,
    };

    // Evaluate Firestore security rules
    this.rulesEvaluator.evaluateUpdate(operator, claimId, claim, updatedClaim);

    // Database commit
    this.db.claims.set(claimId, updatedClaim);

    // Decoupled notification dispatch (non-fatal)
    try {
      if (this.failNotification) {
        throw new Error("Notification dispatch network error");
      }
      this.db.notifications.push({
        toUserId: claim.claimerId,
        title: newStatus === "APROVADO" ? "Solicitação de Devolução Aprovada!" : "Solicitação de Devolução Não Aprovada",
        message:
          newStatus === "APROVADO"
            ? `Sua solicitação para "${claim.itemTitle}" foi aprovada.`
            : `Sua solicitação para "${claim.itemTitle}" foi rejeitada: ${options?.rejectionReason}`,
        itemId: claim.itemId,
      });
    } catch (notifErr) {
      // Non-fatal, operation remains committed
    }

    return updatedClaim;
  }

  async cancelClaim(applicant: Partial<User>, claimId: string): Promise<ItemClaim> {
    const claim = this.db.claims.get(claimId);
    if (!claim) {
      throw new Error("Solicitação não encontrada.");
    }

    if (claim.claimerId !== applicant.id) {
      throw new Error("Você só pode cancelar solicitações originadas pelo seu próprio usuário.");
    }

    if (claim.status !== "PENDENTE") {
      throw new Error(`Esta solicitação já se encontra com status '${claim.status}' e não pode mais ser cancelada pelo requerente.`);
    }

    const cancelledClaim: ItemClaim = {
      ...claim,
      status: "CANCELADO",
      cancelledAt: new Date().toISOString(),
    };

    // Evaluate security rules for claimant cancellation
    this.rulesEvaluator.evaluateUpdate(applicant, claimId, claim, cancelledClaim);

    this.db.claims.set(claimId, cancelledClaim);
    return cancelledClaim;
  }

  async registerItemReturn(operator: Partial<User>, itemId: string): Promise<void> {
    if (operator.role !== "ADMIN" && operator.role !== "SERVIDOR") {
      throw new Error("Apenas servidores ou administradores podem registrar devolução formal.");
    }

    const item = this.db.items.get(itemId);
    if (!item) throw new Error("Item não encontrado.");

    item.status = "DEVOLVIDO";
    this.db.items.set(itemId, item);

    // Automatic transition of any linked APROVADO claim to CONCLUIDO
    for (const [id, claim] of this.db.claims.entries()) {
      if (claim.itemId === itemId && claim.status === "APROVADO") {
        const completedClaim: ItemClaim = {
          ...claim,
          status: "CONCLUIDO",
          completedAt: new Date().toISOString(),
          decisionNotes: "Devolução presencial concluída no balcão da Secretaria.",
        };
        this.rulesEvaluator.evaluateUpdate(operator, id, claim, completedClaim);
        this.db.claims.set(id, completedClaim);
      }
    }
  }
}

describe("LOCALIZA+ v1.10.8 — Fluxo de Solicitação de Devolução (RNF04) e Regras de Segurança", () => {
  let db: MockFirestoreDB;
  let workflow: ClaimWorkflowSimulator;

  const mockItem: LostFoundItem = {
    id: "item_caderno_001",
    title: "Caderno Espiral Capa Dura",
    description: "Caderno encontrado no corredor do Bloco A com anotações de matemática",
    category: "Material Escolar & Livros",
    location: "Bloco A - Corredor",
    date: "2026-10-25",
    type: "ENCONTRADO",
    status: "ENCONTRADO",
    color: "Azul",
    brand: "Tilibra",
    imageUrl: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c",
    contactInfo: "SEBAC Campus Ivaiporã",
    registeredByUserId: "outro_usuario_registrador",
    registeredByName: "Maria Cadastradora",
    registeredByRole: "SERVIDOR",
    qrCodeId: "QR_CADERNO_001",
    createdAt: "2026-10-25T10:00:00Z",
  };

  const mockStudent: User = {
    id: "student_google_123",
    name: "João Aluno IFPR",
    email: "joao.aluno@estudante.ifpr.edu.br",
    role: "ALUNO",
    status: "active",
    approvalStatus: "APROVADO",
    reputationScore: 10,
    createdAt: "2026-02-01T00:00:00Z",
    registrationNumber: "2026001234",
    courseOrDept: "Técnico em Informática",
    avatarUrl: "https://lh3.googleusercontent.com/a/default-student",
  };

  const mockStaff: User = {
    id: "staff_sebac_456",
    name: "Ana Servidora SEBAC",
    email: "ana.sebac@ifpr.edu.br",
    role: "SERVIDOR",
    status: "active",
    approvalStatus: "APROVADO",
    reputationScore: 10,
    createdAt: "2026-01-01T00:00:00Z",
    registrationNumber: "1982736",
    courseOrDept: "Secretaria Acadêmica",
    avatarUrl: "https://lh3.googleusercontent.com/a/default-staff",
  };

  beforeEach(() => {
    db = {
      items: new Map([[mockItem.id, { ...mockItem }]]),
      claims: new Map(),
      notifications: [],
    };
    workflow = new ClaimWorkflowSimulator(db);
  });

  // ==========================================
  // PARTE 1: Fluxos Funcionais Básicos (1 a 15)
  // ==========================================

  it("1 & 2: deve permitir submissão legítima por aluno Google informando apenas características particulares sem senha/PIN", async () => {
    const claim = await workflow.submitClaim(mockStudent, mockItem.id, {
      distinctiveFeatures: "Possui um adesivo prateado na capa com o nome 'João' e um elástico azul",
      additionalInfo: "Perdi na segunda-feira após a aula de cálculo",
    });

    expect(claim).toBeDefined();
    expect(claim.status).toBe("PENDENTE");
    expect(claim.claimerId).toBe(mockStudent.id);
    expect(claim.distinctiveFeatures).toContain("adesivo prateado");
    expect(claim.additionalInfo).toContain("segunda-feira");
    expect(claim.claimerRegistration).toBe("2026001234");
    expect(claim.id).toBe(`claim_${mockStudent.id}_${mockItem.id}`);
  });

  it("3: deve rejeitar submissão de solicitação por visitante ou usuário não autenticado", async () => {
    const guestUser = { id: "guest", role: "ALUNO" as const };
    await expect(
      workflow.submitClaim(guestUser, mockItem.id, {
        distinctiveFeatures: "Meu caderno",
      })
    ).rejects.toThrow("Apenas usuários autenticados");

    await expect(
      workflow.submitClaim(null, mockItem.id, {
        distinctiveFeatures: "Meu caderno",
      })
    ).rejects.toThrow("Apenas usuários autenticados");
  });

  it("4: deve prevenir submissões duplicadas em concorrência pelo mesmo usuário", async () => {
    (workflow as any).inFlightSubmissions.add(`${mockStudent.id}_${mockItem.id}`);

    await expect(
      workflow.submitClaim(mockStudent, mockItem.id, {
        distinctiveFeatures: "Segunda submissão concorrente",
      })
    ).rejects.toThrow("já está sendo processada");
  });

  it("5: deve rejeitar nova solicitação quando o usuário já tiver pedido PENDENTE ou APROVADO para o mesmo item", async () => {
    await workflow.submitClaim(mockStudent, mockItem.id, {
      distinctiveFeatures: "Características primárias",
    });

    await expect(
      workflow.submitClaim(mockStudent, mockItem.id, {
        distinctiveFeatures: "Tentativa de enviar de novo",
      })
    ).rejects.toThrow("já possui uma solicitação em análise");
  });

  it("6: deve impedir solicitação de devolução para item cujo status já seja DEVOLVIDO ou ENCERRADO", async () => {
    const returnedItem = db.items.get(mockItem.id)!;
    returnedItem.status = "DEVOLVIDO";

    await expect(
      workflow.submitClaim(mockStudent, mockItem.id, {
        distinctiveFeatures: "Tentativa de reclamar item já entregue",
      })
    ).rejects.toThrow("já foi devolvido ou seu ciclo de custódia foi encerrado");
  });

  it("7: submissão de solicitação não deve alterar o status do item no catálogo para 'EM_ANALISE'", async () => {
    const initialStatus = db.items.get(mockItem.id)!.status;

    await workflow.submitClaim(mockStudent, mockItem.id, {
      distinctiveFeatures: "Adesivo e marcas de caneta",
    });

    const itemAfterClaim = db.items.get(mockItem.id)!;
    expect(itemAfterClaim.status).toBe(initialStatus);
    expect(itemAfterClaim.status).toBe("ENCONTRADO");
  });

  it("8 & 9: deve gravar status inicial estritamente como PENDENTE e sem dados de revisor na criação", async () => {
    const claim = await workflow.submitClaim(mockStudent, mockItem.id, {
      distinctiveFeatures: "Marcas particulares",
    });

    expect(claim.status).toBe("PENDENTE");
    expect(claim.reviewedByUserId).toBeUndefined();
    expect(claim.reviewedByName).toBeUndefined();
    expect(claim.rejectionReason).toBeUndefined();
    expect(claim.completedAt).toBeUndefined();
  });

  it("10: aprovação por Servidor atualiza status para APROVADO, grava metadados do servidor e envia notificação", async () => {
    const claim = await workflow.submitClaim(mockStudent, mockItem.id, {
      distinctiveFeatures: "Detalhes confirmados",
    });

    const approvedClaim = await workflow.updateClaimStatus(mockStaff, claim.id, "APROVADO", {
      decisionNotes: "Conferido presencialmente no balcão",
    });

    expect(approvedClaim.status).toBe("APROVADO");
    expect(approvedClaim.reviewedByUserId).toBe(mockStaff.id);
    expect(approvedClaim.reviewedByName).toBe(mockStaff.name);
    expect(approvedClaim.reviewedByRole).toBe("SERVIDOR");
    expect(approvedClaim.reviewedAt).toBeDefined();

    expect(db.notifications.length).toBe(2); // 1 on creation + 1 on approval
    const approvalNotif = db.notifications.find((n) => n.title.includes("Aprovada"));
    expect(approvalNotif).toBeDefined();
    expect(approvalNotif!.toUserId).toBe(mockStudent.id);
  });

  it("11: rejeição por Servidor exige justificativa e notifica o requerente", async () => {
    const claim = await workflow.submitClaim(mockStudent, mockItem.id, {
      distinctiveFeatures: "Detalhes divergentes",
    });

    await expect(
      workflow.updateClaimStatus(mockStaff, claim.id, "REJEITADO", {
        rejectionReason: "",
      })
    ).rejects.toThrow("Informe a justificativa da rejeição");

    const rejectedClaim = await workflow.updateClaimStatus(mockStaff, claim.id, "REJEITADO", {
      rejectionReason: "Características não coincidem com o objeto arquivado",
    });

    expect(rejectedClaim.status).toBe("REJEITADO");
    expect(rejectedClaim.rejectionReason).toBe("Características não coincidem com o objeto arquivado");
    const rejectionNotif = db.notifications.find((n) => n.message.includes("não coincidem"));
    expect(rejectionNotif).toBeDefined();
  });

  it("12: aluno comum não pode avaliar, aprovar ou rejeitar solicitações", async () => {
    const claim = await workflow.submitClaim(mockStudent, mockItem.id, {
      distinctiveFeatures: "Minhas marcas",
    });

    await expect(
      workflow.updateClaimStatus(mockStudent, claim.id, "APROVADO")
    ).rejects.toThrow("Apenas servidores ou administradores da Secretaria");
  });

  it("13: aluno pode cancelar com sucesso sua própria solicitação PENDENTE", async () => {
    const claim = await workflow.submitClaim(mockStudent, mockItem.id, {
      distinctiveFeatures: "Me confundi de objeto",
    });

    const cancelledClaim = await workflow.cancelClaim(mockStudent, claim.id);
    expect(cancelledClaim.status).toBe("CANCELADO");
    expect(cancelledClaim.cancelledAt).toBeDefined();

    // After cancellation, the student can submit a new legitimate claim
    const newClaim = await workflow.submitClaim(mockStudent, mockItem.id, {
      distinctiveFeatures: "Agora sim as características corretas",
    });
    expect(newClaim.status).toBe("PENDENTE");
  });

  it("14: aluno não pode cancelar solicitação já APROVADA nem solicitação pertencente a outro aluno", async () => {
    const claim = await workflow.submitClaim(mockStudent, mockItem.id, {
      distinctiveFeatures: "Marcas iniciais",
    });

    await workflow.updateClaimStatus(mockStaff, claim.id, "APROVADO");

    await expect(workflow.cancelClaim(mockStudent, claim.id)).rejects.toThrow(
      "não pode mais ser cancelada pelo requerente"
    );

    const otherStudent: User = {
      ...mockStudent,
      id: "other_student_999",
      email: "outro@estudante.ifpr.edu.br",
    };

    const mockItem2: LostFoundItem = { ...mockItem, id: "item_estojo_002", title: "Estojo Azul" };
    db.items.set(mockItem2.id, mockItem2);

    const newClaim = await workflow.submitClaim(mockStudent, mockItem2.id, {
      distinctiveFeatures: "Nova solicitação em item diferente",
    });

    await expect(workflow.cancelClaim(otherStudent, newClaim.id)).rejects.toThrow(
      "Você só pode cancelar solicitações originadas pelo seu próprio usuário"
    );
  });

  it("15: registro formal de devolução do item transiciona automaticamente a solicitação aprovada para CONCLUIDO", async () => {
    const claim = await workflow.submitClaim(mockStudent, mockItem.id, {
      distinctiveFeatures: "Objeto que será devolvido com assinatura",
    });

    await workflow.updateClaimStatus(mockStaff, claim.id, "APROVADO");
    expect(db.claims.get(claim.id)!.status).toBe("APROVADO");

    await workflow.registerItemReturn(mockStaff, mockItem.id);

    expect(db.items.get(mockItem.id)!.status).toBe("DEVOLVIDO");
    const finalizedClaim = db.claims.get(claim.id)!;
    expect(finalizedClaim.status).toBe("CONCLUIDO");
    expect(finalizedClaim.completedAt).toBeDefined();
  });

  // ==========================================
  // PARTE 2: 12 Cenários Adversariais e de Estresse
  // ==========================================

  // Cenário Adverso 1: Tentativa de aluno criar claim com status 'APROVADO' ou com reviewedByUserId preenchido
  it("Adversarial 1: deve rejeitar tentativa de aluno criar claim com status 'APROVADO' ou com reviewedByUserId preenchido", () => {
    const maliciousClaim1 = {
      id: `claim_${mockStudent.id}_${mockItem.id}`,
      itemId: mockItem.id,
      claimerId: mockStudent.id,
      distinctiveFeatures: "Tentando forjar aprovação direta",
      status: "APROVADO",
      createdAt: new Date().toISOString(),
    };

    expect(() =>
      workflow.rulesEvaluator.evaluateCreate(mockStudent, maliciousClaim1.id, maliciousClaim1)
    ).toThrow("PERMISSION_DENIED: New claim status must strictly be 'PENDENTE'.");

    const maliciousClaim2 = {
      id: `claim_${mockStudent.id}_${mockItem.id}`,
      itemId: mockItem.id,
      claimerId: mockStudent.id,
      distinctiveFeatures: "Tentando forjar autor de revisão",
      status: "PENDENTE",
      reviewedByUserId: "fake_staff_id",
      createdAt: new Date().toISOString(),
    };

    expect(() =>
      workflow.rulesEvaluator.evaluateCreate(mockStudent, maliciousClaim2.id, maliciousClaim2)
    ).toThrow("PERMISSION_DENIED: Administrative review fields cannot be injected on claim creation.");
  });

  // Cenário Adverso 2: Tentativa de aluno alterar distinctiveFeatures após a criação
  it("Adversarial 2: deve rejeitar tentativa de aluno alterar distinctiveFeatures ou comprovação após a criação", async () => {
    const claim = await workflow.submitClaim(mockStudent, mockItem.id, {
      distinctiveFeatures: "Características originais declaradas",
    });

    const maliciousTamperedUpdate = {
      ...claim,
      distinctiveFeatures: "Alterando características após ver detalhes adicionais",
      status: "CANCELADO",
      cancelledAt: new Date().toISOString(),
    };

    expect(() =>
      workflow.rulesEvaluator.evaluateUpdate(mockStudent, claim.id, claim, maliciousTamperedUpdate)
    ).toThrow("PERMISSION_DENIED: Claimant can only modify 'status' and 'cancelledAt'");
  });

  // Cenário Adverso 3: Tentativa de aluno cancelar claim de outro aluno
  it("Adversarial 3: deve rejeitar tentativa de aluno cancelar claim de outro aluno", async () => {
    const claim = await workflow.submitClaim(mockStudent, mockItem.id, {
      distinctiveFeatures: "Objeto do aluno João",
    });

    const otherAttackerStudent: User = {
      ...mockStudent,
      id: "attacker_student_666",
      email: "atacante@estudante.ifpr.edu.br",
    };

    await expect(workflow.cancelClaim(otherAttackerStudent, claim.id)).rejects.toThrow(
      "Você só pode cancelar solicitações originadas pelo seu próprio usuário"
    );

    const maliciousCancelled = {
      ...claim,
      status: "CANCELADO",
      cancelledAt: new Date().toISOString(),
    };

    expect(() =>
      workflow.rulesEvaluator.evaluateUpdate(otherAttackerStudent, claim.id, claim, maliciousCancelled)
    ).toThrow("PERMISSION_DENIED: Unauthorized claim update.");
  });

  // Cenário Adverso 4: Tentativa de transição inválida por servidor (ex.: CONCLUIDO -> PENDENTE)
  it("Adversarial 4: deve rejeitar transição inválida de status por servidor (ex.: CONCLUIDO -> PENDENTE ou CANCELADO -> APROVADO)", async () => {
    const claim = await workflow.submitClaim(mockStudent, mockItem.id, {
      distinctiveFeatures: "Objeto que será concluído",
    });

    await workflow.updateClaimStatus(mockStaff, claim.id, "APROVADO");
    await workflow.registerItemReturn(mockStaff, mockItem.id);

    const concludedClaim = db.claims.get(claim.id)!;
    expect(concludedClaim.status).toBe("CONCLUIDO");

    // Attempt to illegally revert CONCLUIDO back to PENDENTE
    await expect(
      workflow.updateClaimStatus(mockStaff, claim.id, "PENDENTE")
    ).rejects.toThrow("Esta solicitação já foi concluída");

    expect(() =>
      workflow.rulesEvaluator.evaluateUpdate(mockStaff, claim.id, concludedClaim, {
        ...concludedClaim,
        status: "PENDENTE",
      })
    ).toThrow("PERMISSION_DENIED: Concluded claims are terminal and cannot be modified.");
  });

  // Cenário Adverso 5: Criação de claim concorrente simultânea (mesmo aluno, mesmo item, 2 requisições paralelas)
  it("Adversarial 5: criação de claim concorrente simultânea (mesmo aluno, mesmo item, 2 requisições paralelas) deve aprovar apenas uma e rejeitar duplicata", async () => {
    const promise1 = workflow.submitClaim(mockStudent, mockItem.id, {
      distinctiveFeatures: "Requisição Paralela 1",
    });
    const promise2 = workflow.submitClaim(mockStudent, mockItem.id, {
      distinctiveFeatures: "Requisição Paralela 2",
    });

    const results = await Promise.allSettled([promise1, promise2]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(db.claims.size).toBe(1);
  });

  // Cenário Adverso 6: Submissão de claim para item já DEVOLVIDO ou ENCERRADO
  it("Adversarial 6: deve bloquear submissão de claim para item já DEVOLVIDO ou ENCERRADO", async () => {
    const item = db.items.get(mockItem.id)!;

    item.status = "DEVOLVIDO";
    await expect(
      workflow.submitClaim(mockStudent, mockItem.id, { distinctiveFeatures: "Teste devolução" })
    ).rejects.toThrow("já foi devolvido ou seu ciclo de custódia foi encerrado");

    item.status = "ENCERRADO";
    await expect(
      workflow.submitClaim(mockStudent, mockItem.id, { distinctiveFeatures: "Teste encerramento" })
    ).rejects.toThrow("já foi devolvido ou seu ciclo de custódia foi encerrado");
  });

  // Cenário Adverso 7: Tentativa de aluno listar claims de outros usuários
  it("Adversarial 7: regra de listagem deve rejeitar tentativa de aluno listar claims de outros usuários (anti-enumeração)", () => {
    // Staff/Admin can list all claims
    expect(() => workflow.rulesEvaluator.evaluateList(mockStaff)).not.toThrow();

    // Student listing strictly their own claims is allowed
    expect(() => workflow.rulesEvaluator.evaluateList(mockStudent, mockStudent.id)).not.toThrow();

    // Student attempting global list without filtering by their UID is blocked
    expect(() => workflow.rulesEvaluator.evaluateList(mockStudent)).toThrow(
      "PERMISSION_DENIED: Regular users can only list their own claims"
    );

    // Student attempting to list claims of a different UID is blocked
    expect(() => workflow.rulesEvaluator.evaluateList(mockStudent, "other_user_id")).toThrow(
      "PERMISSION_DENIED: Regular users can only list their own claims"
    );
  });

  // Cenário Adverso 8: Transição para REJEITADO sem preenchimento de justificativa (rejectionReason)
  it("Adversarial 8: transição para REJEITADO sem justificativa não-vazia deve ser bloqueada tanto no client quanto nas regras", async () => {
    const claim = await workflow.submitClaim(mockStudent, mockItem.id, {
      distinctiveFeatures: "Solicitação sem justificativa de rejeição",
    });

    await expect(
      workflow.updateClaimStatus(mockStaff, claim.id, "REJEITADO", { rejectionReason: "   " })
    ).rejects.toThrow("Informe a justificativa da rejeição");

    expect(() =>
      workflow.rulesEvaluator.evaluateUpdate(mockStaff, claim.id, claim, {
        ...claim,
        status: "REJEITADO",
        rejectionReason: "",
      })
    ).toThrow("PERMISSION_DENIED: Rejection requires a non-empty rejectionReason.");
  });

  // Cenário Adverso 9: Resiliência a falha de notificação (claim deve ser atualizada mesmo se notificação falhar)
  it("Adversarial 9: falha no serviço de notificação não deve abortar nem reverter a decisão sobre a solicitação", async () => {
    const claim = await workflow.submitClaim(mockStudent, mockItem.id, {
      distinctiveFeatures: "Características normais",
    });

    // Simulate notification failure during status update
    workflow.failNotification = true;

    const approvedClaim = await workflow.updateClaimStatus(mockStaff, claim.id, "APROVADO", {
      decisionNotes: "Aprovado mesmo com instabilidade no envio de push",
    });

    expect(approvedClaim.status).toBe("APROVADO");
    expect(db.claims.get(claim.id)!.status).toBe("APROVADO");
  });

  // Cenário Adverso 10: Tentativa de injeção de campos administrativos na criação ou no cancelamento pelo aluno
  it("Adversarial 10: deve rejeitar injeção de campos administrativos (completedAt, decisionNotes, reviewedByName) na criação e no cancelamento", () => {
    const injectionClaim = {
      id: `claim_${mockStudent.id}_${mockItem.id}`,
      itemId: mockItem.id,
      claimerId: mockStudent.id,
      distinctiveFeatures: "Injetando campos de conclusão",
      status: "PENDENTE",
      completedAt: new Date().toISOString(),
      decisionNotes: "Auto-aprovado pelo cliente",
      createdAt: new Date().toISOString(),
    };

    expect(() =>
      workflow.rulesEvaluator.evaluateCreate(mockStudent, injectionClaim.id, injectionClaim)
    ).toThrow("PERMISSION_DENIED: Administrative review fields cannot be injected on claim creation.");
  });

  // Cenário Adverso 11: Validação de limite de caracteres e campos vazios
  it("Adversarial 11: deve rejeitar descrições vazias ou que excedam o limite defensivo de 1000 caracteres", async () => {
    // Empty field
    await expect(
      workflow.submitClaim(mockStudent, mockItem.id, { distinctiveFeatures: "   " })
    ).rejects.toThrow("Informe as características particulares");

    // Over 1000 characters
    const hugeText = "A".repeat(1001);
    await expect(
      workflow.submitClaim(mockStudent, mockItem.id, { distinctiveFeatures: hugeText })
    ).rejects.toThrow("A descrição das características não pode ultrapassar 1000 caracteres.");

    expect(() =>
      workflow.rulesEvaluator.evaluateCreate(mockStudent, `claim_${mockStudent.id}_${mockItem.id}`, {
        id: `claim_${mockStudent.id}_${mockItem.id}`,
        itemId: mockItem.id,
        claimerId: mockStudent.id,
        distinctiveFeatures: hugeText,
        status: "PENDENTE",
        createdAt: new Date().toISOString(),
      })
    ).toThrow("exceeds 1000 characters limit");
  });

  // Cenário Adverso 12: Garantia de que a devolução presencial atualiza todas as claims aprovadas para CONCLUIDO
  it("Adversarial 12: devolução presencial formal deve atualizar deterministicamente todas as claims aprovadas para CONCLUIDO com completedAt", async () => {
    const claim = await workflow.submitClaim(mockStudent, mockItem.id, {
      distinctiveFeatures: "Pertence retirado na secretaria",
    });

    await workflow.updateClaimStatus(mockStaff, claim.id, "APROVADO");

    await workflow.registerItemReturn(mockStaff, mockItem.id);

    const completed = db.claims.get(claim.id)!;
    expect(completed.status).toBe("CONCLUIDO");
    expect(completed.completedAt).toBeDefined();
    expect(completed.decisionNotes).toContain("Devolução presencial concluída");
    expect(db.items.get(mockItem.id)!.status).toBe("DEVOLVIDO");
  });

  // Cenário Adverso 13: Reenvio após CANCELADO preserva createdAt original e registra resubmittedAt
  it("Adversarial 13: reenvio após cancelamento deve preservar o createdAt original e registrar resubmittedAt", async () => {
    const claim = await workflow.submitClaim(mockStudent, mockItem.id, {
      distinctiveFeatures: "Primeira tentativa",
    });
    const originalCreatedAt = claim.createdAt;

    // Claimant cancels
    await workflow.cancelClaim(mockStudent, claim.id);
    expect(db.claims.get(claim.id)!.status).toBe("CANCELADO");

    // Claimant resubmits with new features
    const resubmitted = await workflow.submitClaim(mockStudent, mockItem.id, {
      distinctiveFeatures: "Segunda tentativa com detalhes corretos",
    });

    expect(resubmitted.id).toBe(claim.id);
    expect(resubmitted.status).toBe("PENDENTE");
    expect(resubmitted.createdAt).toBe(originalCreatedAt);
    expect((resubmitted as any).resubmittedAt).toBeDefined();
  });

  // Cenário Adverso 14: Tentativa de alterar createdAt, claimerId ou itemId no reenvio é bloqueada
  it("Adversarial 14: tentativa de adulterar createdAt, claimerId ou itemId durante reenvio deve ser rejeitada", async () => {
    const claim = await workflow.submitClaim(mockStudent, mockItem.id, {
      distinctiveFeatures: "Primeira tentativa",
    });
    await workflow.cancelClaim(mockStudent, claim.id);
    const cancelledClaim = db.claims.get(claim.id)!;

    // Tampering with createdAt
    const tamperedCreatedAt = {
      ...cancelledClaim,
      status: "PENDENTE" as const,
      createdAt: "1999-01-01T00:00:00.000Z",
      distinctiveFeatures: "Tentando forjar data antiga",
    };
    expect(() =>
      workflow.rulesEvaluator.evaluateUpdate(mockStudent, claim.id, cancelledClaim, tamperedCreatedAt)
    ).toThrow("PERMISSION_DENIED: Original createdAt timestamp must be preserved on resubmission.");

    // Tampering with claimerId
    const tamperedClaimer = {
      ...cancelledClaim,
      status: "PENDENTE" as const,
      claimerId: "another_user_id",
      distinctiveFeatures: "Tentando mudar dono",
    };
    expect(() =>
      workflow.rulesEvaluator.evaluateUpdate(mockStudent, claim.id, cancelledClaim, tamperedClaimer)
    ).toThrow("PERMISSION_DENIED: Cannot change claimer or item on resubmission.");
  });

  // Cenário Adverso 15: Bloqueio estrito de edições por servidor em solicitações CONCLUIDO ou CANCELADO
  it("Adversarial 15: solicitações CONCLUIDO ou CANCELADO são terminais e bloqueadas contra qualquer alteração por servidor", async () => {
    // Test CANCELADO terminality for staff
    const claim1 = await workflow.submitClaim(mockStudent, mockItem.id, {
      distinctiveFeatures: "Objeto cancelado",
    });
    await workflow.cancelClaim(mockStudent, claim1.id);
    const cancelledDoc = db.claims.get(claim1.id)!;

    expect(() =>
      workflow.rulesEvaluator.evaluateUpdate(mockStaff, claim1.id, cancelledDoc, {
        ...cancelledDoc,
        status: "APROVADO",
      })
    ).toThrow("PERMISSION_DENIED: Cancelled claims cannot be modified by staff.");

    // Test CONCLUIDO terminality for staff
    const mockItem2 = { ...mockItem, id: "item_mochila_003", title: "Mochila Preta" };
    db.items.set(mockItem2.id, mockItem2);
    const claim2 = await workflow.submitClaim(mockStudent, mockItem2.id, {
      distinctiveFeatures: "Mochila da marca Dell",
    });
    await workflow.updateClaimStatus(mockStaff, claim2.id, "APROVADO");
    await workflow.registerItemReturn(mockStaff, mockItem2.id);
    const concludedDoc = db.claims.get(claim2.id)!;

    expect(() =>
      workflow.rulesEvaluator.evaluateUpdate(mockStaff, claim2.id, concludedDoc, {
        ...concludedDoc,
        decisionNotes: "Tentando alterar notas após devolução concluída",
      })
    ).toThrow("PERMISSION_DENIED: Concluded claims are terminal and cannot be modified.");
  });

  describe("LOCALIZA+ v1.10.9 — Validação Estrita das 7 Condições de Segurança de /claims/{claimId}", () => {
    const studentA: Partial<User> = {
      id: "std_student_A",
      name: "Aluno A",
      email: "aluno.a@estudantes.ifpr.edu.br",
      role: "ALUNO",
      status: "active",
      approvalStatus: "APROVADO",
      createdAt: "2026-01-01T00:00:00Z",
    };

    const studentB: Partial<User> = {
      id: "std_student_B",
      name: "Aluno B",
      email: "aluno.b@estudantes.ifpr.edu.br",
      role: "ALUNO",
      status: "active",
      approvalStatus: "APROVADO",
      createdAt: "2026-01-01T00:00:00Z",
    };

    const suspendedStudent: Partial<User> = {
      id: "std_suspended",
      name: "Aluno Suspenso",
      email: "suspenso@estudantes.ifpr.edu.br",
      role: "ALUNO",
      status: "suspended",
      approvalStatus: "APROVADO",
      createdAt: "2026-01-01T00:00:00Z",
    };

    const mockAdmin: Partial<User> = {
      id: "admin_master",
      name: "Admin Master",
      email: "admin@ifpr.edu.br",
      role: "ADMIN",
      status: "active",
      approvalStatus: "APROVADO",
      createdAt: "2026-01-01T00:00:00Z",
    };

    const mockStaffUser: Partial<User> = {
      id: "staff_servidor",
      name: "Servidor SEBAC",
      email: "servidor@ifpr.edu.br",
      role: "SERVIDOR",
      status: "active",
      approvalStatus: "APROVADO",
      createdAt: "2026-01-01T00:00:00Z",
    };

    it("1. ID próprio com documento inexistente: permite leitura transacional para verificação de duplicidade", () => {
      const nonexistentOwnClaimId = `claim_${studentA.id}_item_999`;
      expect(() =>
        workflow.rulesEvaluator.evaluateGet(studentA, nonexistentOwnClaimId)
      ).not.toThrow();
    });

    it("2. ID de terceiro com documento inexistente: bloqueia sondagem ou leitura indevida por aluno", () => {
      const nonexistentOtherClaimId = `claim_${studentB.id}_item_999`;
      expect(() =>
        workflow.rulesEvaluator.evaluateGet(studentA, nonexistentOtherClaimId)
      ).toThrow("PERMISSION_DENIED: Unauthorized claim read.");
    });

    it("3. claim própria existente: permite leitura e acompanhamento pelo requerente legítimo", async () => {
      const claim = await workflow.submitClaim(studentA, mockItem.id, {
        distinctiveFeatures: "Pertence próprio existente",
      });
      expect(() => workflow.rulesEvaluator.evaluateGet(studentA, claim.id)).not.toThrow();
    });

    it("4. claim de terceiro existente: bloqueia acesso de outro aluno à solicitação privada", async () => {
      const claim = await workflow.submitClaim(studentB, mockItem.id, {
        distinctiveFeatures: "Pertence do Aluno B",
      });
      expect(() => workflow.rulesEvaluator.evaluateGet(studentA, claim.id)).toThrow(
        "PERMISSION_DENIED: Unauthorized claim read."
      );
    });

    it("5. claim com ID que não corresponde ao claimerId: rejeita criação se claimId não respeitar padrão determinístico", () => {
      const mismatchedClaimId = `claim_${studentB.id}_${mockItem.id}`; // Attempting studentA claim with studentB's claimId
      const payload = {
        id: mismatchedClaimId,
        itemId: mockItem.id,
        claimerId: studentA.id,
        status: "PENDENTE",
        distinctiveFeatures: "Tentativa de injeção de ID de outro usuário",
      };
      expect(() =>
        workflow.rulesEvaluator.evaluateCreate(studentA, mismatchedClaimId, payload)
      ).toThrow("PERMISSION_DENIED: Claim document ID must match deterministic format claim_{uid}_{itemId}.");
    });

    it("6. usuário sem perfil ativo: bloqueia criação e leituras (existente ou inexistente) por conta suspensa ou banida", async () => {
      // 1. Existing claim created by studentA
      const claim = await workflow.submitClaim(studentA, mockItem.id, {
        distinctiveFeatures: "Solicitação para teste de conta suspensa",
      });

      // Suspended user trying to read existing claim
      expect(() => workflow.rulesEvaluator.evaluateGet(suspendedStudent, claim.id)).toThrow(
        "PERMISSION_DENIED: Suspended or banned accounts cannot read claims."
      );

      // Banned user trying to consult nonexistent own claim
      const bannedUser: User = {
        id: "std_banned",
        name: "Aluno Banido",
        email: "banido@estudantes.ifpr.edu.br",
        role: "ALUNO",
        courseOrDept: "Informática",
        registrationNumber: "20260099",
        avatarUrl: "",
        status: "banned",
        approvalStatus: "APROVADO",
        createdAt: "2026-01-01T00:00:00Z",
      };
      const nonexistentBannedClaimId = `claim_${bannedUser.id}_item_999`;
      expect(() => workflow.rulesEvaluator.evaluateGet(bannedUser, nonexistentBannedClaimId)).toThrow(
        "PERMISSION_DENIED: Suspended or banned accounts cannot read claims."
      );

      // Block creation by suspended account
      expect(() =>
        workflow.rulesEvaluator.evaluateCreate(suspendedStudent, `claim_${suspendedStudent.id}_${mockItem.id}`, {
          itemId: mockItem.id,
          claimerId: suspendedStudent.id,
          status: "PENDENTE",
          distinctiveFeatures: "Tentativa por usuário suspenso",
        })
      ).toThrow("PERMISSION_DENIED: Inactive or blocked account.");
    });

    it("7. acesso administrativo autorizado e não autorizado: SERVIDOR/ADMIN pode ler claims de terceiros; ALUNO não", async () => {
      const claim = await workflow.submitClaim(studentB, mockItem.id, {
        distinctiveFeatures: "Solicitação do Aluno B para análise do Servidor",
      });
      // Servidor e Admin autorizados
      expect(() => workflow.rulesEvaluator.evaluateGet(mockStaffUser, claim.id)).not.toThrow();
      expect(() => workflow.rulesEvaluator.evaluateGet(mockAdmin, claim.id)).not.toThrow();

      // Aluno tentando se passar por perfil não autorizado ao tentar ler claim alheia
      expect(() => workflow.rulesEvaluator.evaluateGet(studentA, claim.id)).toThrow(
        "PERMISSION_DENIED: Unauthorized claim read."
      );
    });
  });
});
