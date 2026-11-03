import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

/**
 * LOCALIZA+ v1.10.10 — Testes de Identidade Institucional e Autorização
 * 
 * Bateria de testes que valida:
 * 1. Promoção de INTRUSO para ALUNO (com e-mail institucional de estudante verificado).
 * 2. Promoção de INTRUSO para SERVIDOR (com e-mail institucional de servidor verificado).
 * 3. Bloqueio de promoção com e-mail não verificado.
 * 4. Bloqueio de promoção com domínio externo (ex: @gmail.com).
 * 5. Bloqueio de auto-promoção para ADMIN (prevenção de escalonamento de privilégios).
 * 6. Servidor com aprovação PENDENTE solicita devolução (Permitida para objeto próprio).
 * 7. Servidor com aprovação PENDENTE tenta aprovar reivindicação de terceiro (Bloqueada).
 * 8. ALUNO solicita devolução de pertence (Permitida).
 * 9. ALUNO tenta aprovar reivindicação de terceiro (Bloqueada).
 * 10. INTRUSO tenta solicitar devolução (Bloqueada).
 * 11. Conta suspensa ou banida tenta solicitar devolução (Bloqueada).
 * 12. ADMIN executa operação administrativa autorizada (Permitida).
 * 13. Prevenção de adulteração: UID, e-mail, approvalStatus, admin, status e suspensão.
 */

interface MockAuthToken {
  uid: string;
  email?: string;
  email_verified?: boolean;
  role?: string;
  admin?: boolean;
  [key: string]: any;
}

interface MockFirestoreUserDoc {
  id: string;
  email: string;
  role?: string;
  approvalStatus?: string;
  status?: string;
  admin?: boolean;
  blockExpiresAt?: number;
  suspendedUntil?: number;
  reputationScore?: number;
  [key: string]: any;
}

interface MockItemDoc {
  id: string;
  title: string;
  status: "NOVO" | "DEVOLVIDO" | "ENCERRADO" | "PERDIDO";
  registeredByUserId: string;
  registeredByRole: "ADMIN" | "SERVIDOR" | "ALUNO";
}

interface MockClaimDoc {
  id: string;
  itemId: string;
  claimerId: string;
  status: "PENDENTE" | "APROVADO" | "REJEITADO" | "CONCLUIDO" | "CANCELADO";
  distinctiveFeatures: string;
  createdAt: string;
  additionalInfo?: string;
  rejectionReason?: string;
  completedAt?: string;
  [key: string]: any;
}

class InstitutionalSecuritySimulator {
  constructor(
    public usersDb: Map<string, MockFirestoreUserDoc> = new Map(),
    public itemsDb: Map<string, MockItemDoc> = new Map(),
    public claimsDb: Map<string, MockClaimDoc> = new Map()
  ) {}

  isSignedIn(auth: MockAuthToken | null): boolean {
    return auth !== null && auth.uid != null;
  }

  isEmailVerified(auth: MockAuthToken | null): boolean {
    if (!this.isSignedIn(auth) || !auth) return false;
    return "email_verified" in auth && auth.email_verified === true;
  }

  isTemporaryBlockActive(userData: MockFirestoreUserDoc, requestTime: number): boolean {
    if ("blockExpiresAt" in userData && typeof userData.blockExpiresAt === "number" && requestTime < userData.blockExpiresAt) {
      return true;
    }
    if ("suspendedUntil" in userData && typeof userData.suspendedUntil === "number" && requestTime < userData.suspendedUntil) {
      return true;
    }
    return false;
  }

  isTemporaryBlockExpired(userData: MockFirestoreUserDoc, requestTime: number): boolean {
    if (this.isTemporaryBlockActive(userData, requestTime)) return false;
    const hasBlock = "blockExpiresAt" in userData;
    const hasSuspend = "suspendedUntil" in userData;
    if (!hasBlock && !hasSuspend) return false;

    if (hasBlock && (typeof userData.blockExpiresAt !== "number" || requestTime < userData.blockExpiresAt)) return false;
    if (hasSuspend && (typeof userData.suspendedUntil !== "number" || requestTime < userData.suspendedUntil)) return false;
    return true;
  }

  isAccountBlocked(auth: MockAuthToken | null, requestTime: number): boolean {
    if (!this.isSignedIn(auth) || !auth) return false;
    const userData = this.usersDb.get(auth.uid);
    if (!userData) return false;

    if ("status" in userData) {
      if (userData.status === "banned") return true;
      if (userData.status === "suspended" && !this.isTemporaryBlockExpired(userData, requestTime)) return true;
    }
    return this.isTemporaryBlockActive(userData, requestTime);
  }

  isRootAdmin(auth: MockAuthToken | null): boolean {
    if (!this.isSignedIn(auth) || !auth) return false;
    if (!this.isEmailVerified(auth)) return false;
    if ("role" in auth && auth.role === "INTRUSO") return false;
    if (!("email" in auth) || !auth.email) return false;
    return (
      auth.email === "paulocauan39@gmail.com" ||
      auth.email.toLowerCase() === "paulocauan39@gmail.com"
    );
  }

  hasAdminClaim(auth: MockAuthToken | null): boolean {
    if (!this.isSignedIn(auth) || !auth) return false;
    if (!this.isEmailVerified(auth)) return false;
    if ("role" in auth && auth.role === "INTRUSO") return false;
    return ("role" in auth && auth.role === "ADMIN") || ("admin" in auth && auth.admin === true);
  }

  isDocAdmin(auth: MockAuthToken | null, requestTime: number): boolean {
    if (!this.isSignedIn(auth) || !auth) return false;
    if (!this.isEmailVerified(auth)) return false;
    if (!this.isAccountActive(auth, requestTime)) return false;
    if ("role" in auth && auth.role === "INTRUSO") return false;

    const userData = this.usersDb.get(auth.uid);
    if (!userData) return false;
    return userData.role === "ADMIN" && userData.approvalStatus === "APROVADO";
  }

  isAdmin(auth: MockAuthToken | null, requestTime: number): boolean {
    if (!auth) return false;
    if ("role" in auth && auth.role === "INTRUSO") return false;
    return this.isRootAdmin(auth) || (this.isAccountActive(auth, requestTime) && (this.hasAdminClaim(auth) || this.isDocAdmin(auth, requestTime)));
  }

  isDocServidorIdentity(auth: MockAuthToken | null): boolean {
    if (!this.isSignedIn(auth) || !auth) return false;
    if (!this.isEmailVerified(auth)) return false;
    if ("role" in auth && auth.role === "INTRUSO") return false;
    const userData = this.usersDb.get(auth.uid);
    if (!userData) return false;
    return userData.role === "SERVIDOR";
  }

  isDocServidor(auth: MockAuthToken | null, requestTime: number): boolean {
    if (!this.isDocServidorIdentity(auth)) return false;
    if (!this.isAccountActive(auth, requestTime)) return false;
    const userData = this.usersDb.get(auth.uid);
    return userData?.approvalStatus === "APROVADO";
  }

  isDocAluno(auth: MockAuthToken | null): boolean {
    if (!this.isSignedIn(auth) || !auth) return false;
    if (!this.isEmailVerified(auth)) return false;
    if ("role" in auth && auth.role === "INTRUSO") return false;
    const userData = this.usersDb.get(auth.uid);
    return userData?.role === "ALUNO";
  }

  isDocIntruso(auth: MockAuthToken | null): boolean {
    if (!this.isSignedIn(auth) || !auth) return false;
    const userData = this.usersDb.get(auth.uid);
    return userData?.role === "INTRUSO";
  }

  isInstitutionalStudentEmail(auth: MockAuthToken | null): boolean {
    if (!this.isSignedIn(auth) || !auth) return false;
    if (!this.isEmailVerified(auth)) return false;
    if (!("email" in auth) || !auth.email) return false;
    return /^.*@([a-zA-Z0-9-]+\.)*(estudantes|estudante|aluno)\.ifpr\.edu\.br$/i.test(auth.email);
  }

  isInstitutionalStaffEmail(auth: MockAuthToken | null): boolean {
    if (!this.isSignedIn(auth) || !auth) return false;
    if (!this.isEmailVerified(auth)) return false;
    if (!("email" in auth) || !auth.email) return false;
    const isStaffPattern = /^.*@([a-zA-Z0-9-]+\.)*ifpr\.edu\.br$/i.test(auth.email);
    const isExcluded = /^.*@([a-zA-Z0-9-]+\.)*(aluno|estudante|estudantes|escola)\.ifpr\.edu\.br$/i.test(auth.email);
    return isStaffPattern && !isExcluded;
  }

  isServidor(auth: MockAuthToken | null, requestTime: number): boolean {
    if (!this.isSignedIn(auth) || !auth) return false;
    return this.isAdmin(auth, requestTime) || (this.isAccountActive(auth, requestTime) && this.isEmailVerified(auth) && this.isDocServidor(auth, requestTime));
  }

  isAccountActive(auth: MockAuthToken | null, requestTime: number): boolean {
    if (!this.isSignedIn(auth) || !auth) return false;
    if (this.isRootAdmin(auth)) return true;

    if ("role" in auth && auth.role === "INTRUSO") return false;
    const userData = this.usersDb.get(auth.uid);
    if (!userData) return false;
    if (!("status" in userData)) return false;

    const isStatusOk =
      userData.status === "active" ||
      (userData.status === "suspended" && this.isTemporaryBlockExpired(userData, requestTime));

    if (!isStatusOk) return false;
    if ("role" in userData && userData.role === "INTRUSO") return false;
    if (this.isAccountBlocked(auth, requestTime)) return false;

    return true;
  }

  isIntruso(auth: MockAuthToken | null, requestTime: number): boolean {
    if (!this.isSignedIn(auth) || !auth) return false;
    if (!this.isEmailVerified(auth)) return true;
    if ("role" in auth && auth.role === "INTRUSO") return true;
    if (this.isDocIntruso(auth) && !this.isRootAdmin(auth)) return true;

    if (!this.isAdmin(auth, requestTime) && !this.isServidor(auth, requestTime) && !this.isDocAluno(auth) && !this.isDocServidorIdentity(auth)) {
      if (!this.isInstitutionalStudentEmail(auth) && !this.isInstitutionalStaffEmail(auth)) {
        return true;
      }
    }
    return false;
  }

  // Avaliação de allow update em /users/{userId}
  allowUpdateUser(
    auth: MockAuthToken | null,
    userId: string,
    existingData: MockFirestoreUserDoc,
    incomingData: MockFirestoreUserDoc,
    requestTime: number = Date.now()
  ): { allowed: boolean; reason?: string } {
    if (!this.isSignedIn(auth) || !auth) return { allowed: false, reason: "UNAUTHENTICATED" };

    // Branch 1: Admin
    if (this.isAdmin(auth, requestTime)) {
      return { allowed: true };
    }

    // Branch 2: Promoção Institucional Legítima (INTRUSO -> ALUNO ou SERVIDOR)
    const isSelf = auth.uid === userId;
    const isIdMatch = incomingData.id === userId;
    const isEmailUnchanged = incomingData.email?.toLowerCase() === existingData.email?.toLowerCase();
    const isEmailTokenMatch = incomingData.email?.toLowerCase() === auth.email?.toLowerCase();
    const isCurrentlyIntruso = existingData.role === "INTRUSO";
    const isNotBlocked = !this.isAccountBlocked(auth, requestTime);
    const noAdminClaimIncoming = !("admin" in incomingData) || incomingData.admin === false;
    const noAdminClaimExisting = !("admin" in existingData) || existingData.admin === false;
    const approvalStatusUnchanged = incomingData.approvalStatus === existingData.approvalStatus;
    const statusUnchanged =
      ("status" in existingData && incomingData.status === existingData.status) ||
      (!("status" in existingData) && (!("status" in incomingData) || incomingData.status === "active"));
    const suspendedUntilUnchanged =
      ("suspendedUntil" in existingData && incomingData.suspendedUntil === existingData.suspendedUntil) ||
      (!("suspendedUntil" in existingData) && !("suspendedUntil" in incomingData));
    const blockExpiresAtUnchanged =
      ("blockExpiresAt" in existingData && incomingData.blockExpiresAt === existingData.blockExpiresAt) ||
      (!("blockExpiresAt" in existingData) && !("blockExpiresAt" in incomingData));
    const reputationScoreUnchanged =
      ("reputationScore" in existingData && incomingData.reputationScore === existingData.reputationScore) ||
      (!("reputationScore" in existingData) && (!("reputationScore" in incomingData) || incomingData.reputationScore === 100));

    const isStudentPromotion = incomingData.role === "ALUNO" && this.isInstitutionalStudentEmail(auth);
    const isStaffPromotion = incomingData.role === "SERVIDOR" && this.isInstitutionalStaffEmail(auth);

    if (
      isSelf &&
      isIdMatch &&
      isEmailUnchanged &&
      isEmailTokenMatch &&
      isCurrentlyIntruso &&
      isNotBlocked &&
      noAdminClaimIncoming &&
      noAdminClaimExisting &&
      approvalStatusUnchanged &&
      statusUnchanged &&
      suspendedUntilUnchanged &&
      blockExpiresAtUnchanged &&
      reputationScoreUnchanged &&
      (isStudentPromotion || isStaffPromotion)
    ) {
      return { allowed: true };
    }

    // Branch 3: Atualizações normais de perfil próprio por usuários com conta ativa
    const isAccountActive = this.isAccountActive(auth, requestTime);
    const roleUnchanged = incomingData.role === existingData.role;
    const adminUnchanged = !("admin" in incomingData) || incomingData.admin === existingData.admin;

    if (
      isSelf &&
      isAccountActive &&
      isIdMatch &&
      isEmailUnchanged &&
      roleUnchanged &&
      adminUnchanged &&
      approvalStatusUnchanged &&
      statusUnchanged &&
      suspendedUntilUnchanged &&
      blockExpiresAtUnchanged &&
      reputationScoreUnchanged
    ) {
      return { allowed: true };
    }

    // Branch 4: Inicialização de status para perfis institucionais legados sem o campo status (affectedKeys hasOnly status)
    const isLegacyInstitutional = existingData.role === "ALUNO" || existingData.role === "SERVIDOR";
    const isMissingStatus = !("status" in existingData);
    const isSettingActive = incomingData.status === "active";
    const isValidInstitutionalEmail =
      (existingData.role === "ALUNO" && this.isInstitutionalStudentEmail(auth)) ||
      (existingData.role === "SERVIDOR" && this.isInstitutionalStaffEmail(auth));
    
    // Verifica se apenas 'status' foi afetado em relação ao documento existente
    const existingKeys = Object.keys(existingData);
    const incomingKeys = Object.keys(incomingData);
    const allKeys = new Set([...existingKeys, ...incomingKeys]);
    const affectedKeys = Array.from(allKeys).filter(k => JSON.stringify(incomingData[k]) !== JSON.stringify(existingData[k]));
    const hasOnlyStatusAffected = affectedKeys.length === 1 && affectedKeys[0] === "status";

    if (
      isSelf &&
      isIdMatch &&
      isEmailUnchanged &&
      isEmailTokenMatch &&
      isNotBlocked &&
      isLegacyInstitutional &&
      roleUnchanged &&
      adminUnchanged &&
      approvalStatusUnchanged &&
      isMissingStatus &&
      isSettingActive &&
      hasOnlyStatusAffected &&
      isValidInstitutionalEmail
    ) {
      return { allowed: true };
    }

    return { allowed: false, reason: "UPDATE_REJECTED_PERMISSION_DENIED" };
  }

  // Avaliação de allow create em /claims/{claimId}
  allowCreateClaim(
    auth: MockAuthToken | null,
    claimId: string,
    incomingClaim: Record<string, any>,
    requestTime: number = Date.now()
  ): { allowed: boolean; reason?: string } {
    if (!this.isSignedIn(auth) || !auth) return { allowed: false, reason: "UNAUTHENTICATED" };
    if (!this.isEmailVerified(auth)) return { allowed: false, reason: "EMAIL_UNVERIFIED" };
    if (!this.isAccountActive(auth, requestTime)) return { allowed: false, reason: "ACCOUNT_INACTIVE" };
    if (this.isIntruso(auth, requestTime)) return { allowed: false, reason: "USER_IS_INTRUSO" };

    if (claimId !== `claim_${auth.uid}_${incomingClaim.itemId}`) {
      return { allowed: false, reason: "CLAIM_ID_MISMATCH" };
    }
    if (incomingClaim.claimerId !== auth.uid) {
      return { allowed: false, reason: "CLAIMER_ID_MISMATCH" };
    }
    if (incomingClaim.status !== "PENDENTE") {
      return { allowed: false, reason: "INITIAL_STATUS_MUST_BE_PENDENTE" };
    }
    if (!incomingClaim.itemId || typeof incomingClaim.itemId !== "string" || incomingClaim.itemId.length === 0) {
      return { allowed: false, reason: "INVALID_ITEM_ID" };
    }
    if (!incomingClaim.distinctiveFeatures || typeof incomingClaim.distinctiveFeatures !== "string" || incomingClaim.distinctiveFeatures.length === 0 || incomingClaim.distinctiveFeatures.length > 1000) {
      return { allowed: false, reason: "INVALID_DISTINCTIVE_FEATURES" };
    }

    // hasNoAdminReviewFields
    const forbiddenAdminFields = ["reviewedByUserId", "reviewedByName", "reviewedByRole", "reviewedAt", "rejectionReason", "decisionNotes", "completedAt", "cancelledAt"];
    for (const f of forbiddenAdminFields) {
      if (f in incomingClaim) return { allowed: false, reason: `ADMIN_FIELD_INJECTION_${f}` };
    }

    const item = this.itemsDb.get(incomingClaim.itemId);
    if (!item) return { allowed: false, reason: "ITEM_NOT_FOUND" };
    if (item.status === "DEVOLVIDO" || item.status === "ENCERRADO") {
      return { allowed: false, reason: "ITEM_ALREADY_SETTLED" };
    }

    return { allowed: true };
  }

  // Avaliação de allow update em /claims/{claimId} (Revisão Administrativa)
  allowReviewClaim(
    auth: MockAuthToken | null,
    claimId: string,
    existingClaim: MockClaimDoc,
    incomingClaim: Record<string, any>,
    requestTime: number = Date.now()
  ): { allowed: boolean; reason?: string } {
    if (!this.isSignedIn(auth) || !auth) return { allowed: false, reason: "UNAUTHENTICATED" };

    const isAdmin = this.isAdmin(auth, requestTime);
    const isServidor = this.isServidor(auth, requestTime) && this.isAccountActive(auth, requestTime);

    if (!isAdmin && !isServidor) {
      return { allowed: false, reason: "UNAUTHORIZED_NOT_STAFF_OR_ADMIN" };
    }

    // Campos imutáveis
    if (
      incomingClaim.id !== existingClaim.id ||
      incomingClaim.itemId !== existingClaim.itemId ||
      incomingClaim.claimerId !== existingClaim.claimerId ||
      incomingClaim.createdAt !== existingClaim.createdAt ||
      incomingClaim.distinctiveFeatures !== existingClaim.distinctiveFeatures
    ) {
      return { allowed: false, reason: "IMMUTABLE_FIELDS_MODIFIED" };
    }

    if (existingClaim.status === "CONCLUIDO" || existingClaim.status === "CANCELADO") {
      return { allowed: false, reason: "TERMINAL_STATE_CANNOT_BE_ALTERED" };
    }

    const isValidTransition =
      (existingClaim.status === "PENDENTE" && ["APROVADO", "REJEITADO", "CANCELADO"].includes(incomingClaim.status)) ||
      (existingClaim.status === "APROVADO" && ["CONCLUIDO", "REJEITADO"].includes(incomingClaim.status)) ||
      (existingClaim.status === "REJEITADO" && incomingClaim.status === "APROVADO") ||
      (incomingClaim.status === existingClaim.status && ["PENDENTE", "APROVADO"].includes(existingClaim.status));

    if (!isValidTransition) {
      return { allowed: false, reason: "INVALID_LIFECYCLE_TRANSITION" };
    }

    if (incomingClaim.status === "REJEITADO" && (!incomingClaim.rejectionReason || typeof incomingClaim.rejectionReason !== "string" || incomingClaim.rejectionReason.length === 0)) {
      return { allowed: false, reason: "MISSING_REJECTION_REASON" };
    }

    if (incomingClaim.status === "CONCLUIDO" && (!incomingClaim.completedAt || typeof incomingClaim.completedAt !== "string" || incomingClaim.completedAt.length === 0)) {
      return { allowed: false, reason: "MISSING_COMPLETED_AT" };
    }

    return { allowed: true };
  }
}

describe("LOCALIZA+ v1.10.10 — Suite de Homologação: Identidade Institucional, Promoção de Papel e Autorização de Claims", () => {
  let sim: InstitutionalSecuritySimulator;

  beforeEach(() => {
    sim = new InstitutionalSecuritySimulator();
  });

  // ==========================================
  // 1. Promoção de INTRUSO para ALUNO
  // ==========================================
  it("Cenário 1: Promoção INTRUSO → ALUNO é PERMITIDA com identidade e e-mail de estudante verificados", () => {
    const uid = "aluno_123";
    const email = "joao.silva@estudantes.ifpr.edu.br";
    const auth: MockAuthToken = { uid, email, email_verified: true };

    const existingDoc: MockFirestoreUserDoc = {
      id: uid,
      email,
      name: "João Silva",
      role: "INTRUSO",
      status: "active",
      approvalStatus: "APROVADO",
      admin: false,
    };
    sim.usersDb.set(uid, existingDoc);

    const incomingDoc: MockFirestoreUserDoc = {
      ...existingDoc,
      role: "ALUNO",
    };

    const res = sim.allowUpdateUser(auth, uid, existingDoc, incomingDoc);
    expect(res.allowed).toBe(true);
  });

  it("Cenário 1b: Promoção INTRUSO → ALUNO com subdomínio de campus (@ivaipora.estudantes.ifpr.edu.br) é PERMITIDA", () => {
    const uid = "aluno_ivaipora_123";
    const email = "maria.aluna@ivaipora.estudantes.ifpr.edu.br";
    const auth: MockAuthToken = { uid, email, email_verified: true };

    const existingDoc: MockFirestoreUserDoc = {
      id: uid,
      email,
      name: "Maria Aluna",
      role: "INTRUSO",
      status: "active",
      approvalStatus: "APROVADO",
      admin: false,
    };
    sim.usersDb.set(uid, existingDoc);

    const incomingDoc: MockFirestoreUserDoc = {
      ...existingDoc,
      role: "ALUNO",
    };

    const res = sim.allowUpdateUser(auth, uid, existingDoc, incomingDoc);
    expect(res.allowed).toBe(true);
  });

  // ==========================================
  // 2. Promoção de INTRUSO para SERVIDOR
  // ==========================================
  it("Cenário 2: Promoção INTRUSO → SERVIDOR é PERMITIDA com identidade de servidor válida e preserva approvalStatus PENDENTE", () => {
    const uid = "servidor_456";
    const email = "carlos.professor@ifpr.edu.br";
    const auth: MockAuthToken = { uid, email, email_verified: true };

    const existingDoc: MockFirestoreUserDoc = {
      id: uid,
      email,
      name: "Carlos Professor",
      role: "INTRUSO",
      status: "active",
      approvalStatus: "PENDENTE",
      admin: false,
    };
    sim.usersDb.set(uid, existingDoc);

    const incomingDoc: MockFirestoreUserDoc = {
      ...existingDoc,
      role: "SERVIDOR",
      approvalStatus: "PENDENTE",
    };

    const res = sim.allowUpdateUser(auth, uid, existingDoc, incomingDoc);
    expect(res.allowed).toBe(true);
  });

  it("Cenário 2b: Promoção INTRUSO → SERVIDOR com subdomínio (@ivaipora.ifpr.edu.br e @reitoria.ifpr.edu.br) é PERMITIDA", () => {
    const uid1 = "servidor_ivaipora";
    const email1 = "coordenacao@ivaipora.ifpr.edu.br";
    const auth1: MockAuthToken = { uid: uid1, email: email1, email_verified: true };

    const existingDoc1: MockFirestoreUserDoc = {
      id: uid1,
      email: email1,
      role: "INTRUSO",
      status: "active",
      approvalStatus: "PENDENTE",
      admin: false,
    };
    sim.usersDb.set(uid1, existingDoc1);

    const res1 = sim.allowUpdateUser(auth1, uid1, existingDoc1, { ...existingDoc1, role: "SERVIDOR" });
    expect(res1.allowed).toBe(true);

    const uid2 = "servidor_reitoria";
    const email2 = "gabinete@reitoria.ifpr.edu.br";
    const auth2: MockAuthToken = { uid: uid2, email: email2, email_verified: true };

    const existingDoc2: MockFirestoreUserDoc = {
      id: uid2,
      email: email2,
      role: "INTRUSO",
      status: "active",
      approvalStatus: "PENDENTE",
      admin: false,
    };
    sim.usersDb.set(uid2, existingDoc2);

    const res2 = sim.allowUpdateUser(auth2, uid2, existingDoc2, { ...existingDoc2, role: "SERVIDOR" });
    expect(res2.allowed).toBe(true);
  });

  // ==========================================
  // 3. Bloqueio de Promoção com E-mail Não Verificado
  // ==========================================
  it("Cenário 3: Promoção com e-mail não verificado é BLOQUEADA", () => {
    const uid = "aluno_unverified";
    const email = "teste@estudantes.ifpr.edu.br";
    const auth: MockAuthToken = { uid, email, email_verified: false };

    const existingDoc: MockFirestoreUserDoc = {
      id: uid,
      email,
      role: "INTRUSO",
      status: "active",
      approvalStatus: "APROVADO",
      admin: false,
    };
    sim.usersDb.set(uid, existingDoc);

    const res = sim.allowUpdateUser(auth, uid, existingDoc, { ...existingDoc, role: "ALUNO" });
    expect(res.allowed).toBe(false);
  });

  // ==========================================
  // 4. Bloqueio de Promoção com Domínio Externo
  // ==========================================
  it("Cenário 4: Promoção com domínio externo (@gmail.com / @fakeifpr.edu.br) é BLOQUEADA", () => {
    const uid = "externo_123";
    const email = "usuario.externo@gmail.com";
    const auth: MockAuthToken = { uid, email, email_verified: true };

    const existingDoc: MockFirestoreUserDoc = {
      id: uid,
      email,
      role: "INTRUSO",
      status: "active",
      approvalStatus: "APROVADO",
      admin: false,
    };
    sim.usersDb.set(uid, existingDoc);

    const res1 = sim.allowUpdateUser(auth, uid, existingDoc, { ...existingDoc, role: "ALUNO" });
    expect(res1.allowed).toBe(false);

    const res2 = sim.allowUpdateUser(auth, uid, existingDoc, { ...existingDoc, role: "SERVIDOR" });
    expect(res2.allowed).toBe(false);

    // Domínio falso
    const fakeAuth: MockAuthToken = { uid, email: "hacker@fakeifpr.edu.br", email_verified: true };
    const resFake = sim.allowUpdateUser(fakeAuth, uid, existingDoc, { ...existingDoc, email: "hacker@fakeifpr.edu.br", role: "SERVIDOR" });
    expect(resFake.allowed).toBe(false);
  });

  // ==========================================
  // 5. Prevenção de Escalonamento de Privilégios para ADMIN
  // ==========================================
  it("Cenário 5: Tentativa própria de alteração de papel para ADMIN é BLOQUEADA", () => {
    const uid = "aluno_esperto";
    const email = "aluno@estudantes.ifpr.edu.br";
    const auth: MockAuthToken = { uid, email, email_verified: true };

    const existingDoc: MockFirestoreUserDoc = {
      id: uid,
      email,
      role: "INTRUSO",
      status: "active",
      approvalStatus: "APROVADO",
      admin: false,
    };
    sim.usersDb.set(uid, existingDoc);

    // Tentativa de definir role: ADMIN
    const res1 = sim.allowUpdateUser(auth, uid, existingDoc, { ...existingDoc, role: "ADMIN" });
    expect(res1.allowed).toBe(false);

    // Tentativa de injetar admin: true
    const res2 = sim.allowUpdateUser(auth, uid, existingDoc, { ...existingDoc, role: "ALUNO", admin: true });
    expect(res2.allowed).toBe(false);
  });

  // ==========================================
  // 6. Servidor com Aprovação PENDENTE Solicita Devolução
  // ==========================================
  it("Cenário 6: Servidor com aprovação PENDENTE pode solicitar devolução de objeto próprio", () => {
    const uid = "servidor_pendente_uid";
    const email = "servidor.novo@ivaipora.ifpr.edu.br";
    const auth: MockAuthToken = { uid, email, email_verified: true };

    sim.usersDb.set(uid, {
      id: uid,
      email,
      role: "SERVIDOR",
      status: "active",
      approvalStatus: "PENDENTE",
      admin: false,
    });

    sim.itemsDb.set("item-001", {
      id: "item-001",
      title: "Garrafa Térmica Azul",
      status: "NOVO",
      registeredByUserId: "outro_usuario",
      registeredByRole: "ADMIN",
    });

    const incomingClaim = {
      id: `claim_${uid}_item-001`,
      itemId: "item-001",
      claimerId: uid,
      status: "PENDENTE",
      distinctiveFeatures: "Adesivo do IFPR Campus Ivaiporã no fundo",
      createdAt: new Date().toISOString(),
    };

    const res = sim.allowCreateClaim(auth, incomingClaim.id, incomingClaim);
    expect(res.allowed).toBe(true);
  });

  // ==========================================
  // 7. Servidor com Aprovação PENDENTE Aprova Reivindicação
  // ==========================================
  it("Cenário 7: Servidor com aprovação PENDENTE é BLOQUEADO ao tentar aprovar ou rejeitar reivindicações", () => {
    const uid = "servidor_pendente_uid";
    const email = "servidor.novo@ifpr.edu.br";
    const auth: MockAuthToken = { uid, email, email_verified: true };

    sim.usersDb.set(uid, {
      id: uid,
      email,
      role: "SERVIDOR",
      status: "active",
      approvalStatus: "PENDENTE",
      admin: false,
    });

    const existingClaim: MockClaimDoc = {
      id: "claim_aluno1_item-001",
      itemId: "item-001",
      claimerId: "aluno1",
      status: "PENDENTE",
      distinctiveFeatures: "Capa preta",
      createdAt: new Date().toISOString(),
    };
    sim.claimsDb.set(existingClaim.id, existingClaim);

    const incomingApproval = {
      ...existingClaim,
      status: "APROVADO",
      reviewedByUserId: uid,
      reviewedByName: "Servidor Pendente",
      reviewedAt: new Date().toISOString(),
    };

    const res = sim.allowReviewClaim(auth, existingClaim.id, existingClaim, incomingApproval);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("UNAUTHORIZED_NOT_STAFF_OR_ADMIN");
  });

  // ==========================================
  // 8. ALUNO Solicita Devolução
  // ==========================================
  it("Cenário 8: ALUNO ativo com e-mail verificado solicita devolução de seu pertence com SUCESSO", () => {
    const uid = "aluno_ativo_uid";
    const email = "aluna.maria@estudantes.ifpr.edu.br";
    const auth: MockAuthToken = { uid, email, email_verified: true };

    sim.usersDb.set(uid, {
      id: uid,
      email,
      role: "ALUNO",
      status: "active",
      approvalStatus: "APROVADO",
      admin: false,
    });

    sim.itemsDb.set("item-caderno", {
      id: "item-caderno",
      title: "Caderno Espiral Tilibra",
      status: "NOVO",
      registeredByUserId: "servidor_achados",
      registeredByRole: "SERVIDOR",
    });

    const incomingClaim = {
      id: `claim_${uid}_item-caderno`,
      itemId: "item-caderno",
      claimerId: uid,
      status: "PENDENTE",
      distinctiveFeatures: "Meu nome escrito a caneta na primeira página",
      createdAt: new Date().toISOString(),
    };

    const res = sim.allowCreateClaim(auth, incomingClaim.id, incomingClaim);
    expect(res.allowed).toBe(true);
  });

  // ==========================================
  // 9. ALUNO Aprova Reivindicação
  // ==========================================
  it("Cenário 9: ALUNO tentando aprovar ou alterar status de reivindicação de terceiro é BLOQUEADO", () => {
    const uid = "aluno_intrusivo";
    const email = "aluno.curioso@estudantes.ifpr.edu.br";
    const auth: MockAuthToken = { uid, email, email_verified: true };

    sim.usersDb.set(uid, {
      id: uid,
      email,
      role: "ALUNO",
      status: "active",
      approvalStatus: "APROVADO",
      admin: false,
    });

    const existingClaim: MockClaimDoc = {
      id: "claim_outro_item-1",
      itemId: "item-1",
      claimerId: "outro_aluno",
      status: "PENDENTE",
      distinctiveFeatures: "Chaveiro verde",
      createdAt: new Date().toISOString(),
    };
    sim.claimsDb.set(existingClaim.id, existingClaim);

    const incomingReview = {
      ...existingClaim,
      status: "APROVADO",
    };

    const res = sim.allowReviewClaim(auth, existingClaim.id, existingClaim, incomingReview);
    expect(res.allowed).toBe(false);
  });

  // ==========================================
  // 10. INTRUSO Solicita Devolução
  // ==========================================
  it("Cenário 10: INTRUSO (usuário externo ou conta sem papel institucional) tentando solicitar devolução é BLOQUEADO", () => {
    const uid = "intruso_externo";
    const email = "visitante@gmail.com";
    const auth: MockAuthToken = { uid, email, email_verified: true };

    sim.usersDb.set(uid, {
      id: uid,
      email,
      role: "INTRUSO",
      status: "active",
      approvalStatus: "APROVADO",
      admin: false,
    });

    sim.itemsDb.set("item-001", {
      id: "item-001",
      title: "Chave de Carro",
      status: "NOVO",
      registeredByUserId: "admin",
      registeredByRole: "ADMIN",
    });

    const incomingClaim = {
      id: `claim_${uid}_item-001`,
      itemId: "item-001",
      claimerId: uid,
      status: "PENDENTE",
      distinctiveFeatures: "Chave canivete",
      createdAt: new Date().toISOString(),
    };

    const res = sim.allowCreateClaim(auth, incomingClaim.id, incomingClaim);
    expect(res.allowed).toBe(false);
    expect(["ACCOUNT_INACTIVE", "USER_IS_INTRUSO"]).toContain(res.reason);
  });

  // ==========================================
  // 11. Conta Suspensa Solicita Devolução
  // ==========================================
  it("Cenário 11: Conta suspensa ou banida tentando solicitar devolução é BLOQUEADA", () => {
    const uid = "aluno_suspenso";
    const email = "aluno.infrator@estudantes.ifpr.edu.br";
    const auth: MockAuthToken = { uid, email, email_verified: true };

    // Conta suspensa com prazo no futuro
    sim.usersDb.set(uid, {
      id: uid,
      email,
      role: "ALUNO",
      status: "suspended",
      suspendedUntil: Date.now() + 1000000,
      approvalStatus: "APROVADO",
      admin: false,
    });

    sim.itemsDb.set("item-001", {
      id: "item-001",
      title: "Calculadora Científica",
      status: "NOVO",
      registeredByUserId: "servidor",
      registeredByRole: "SERVIDOR",
    });

    const incomingClaim = {
      id: `claim_${uid}_item-001`,
      itemId: "item-001",
      claimerId: uid,
      status: "PENDENTE",
      distinctiveFeatures: "Casio fx-82ms",
      createdAt: new Date().toISOString(),
    };

    const res = sim.allowCreateClaim(auth, incomingClaim.id, incomingClaim);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("ACCOUNT_INACTIVE");
  });

  // ==========================================
  // 12. ADMIN Executa Operação Administrativa Autorizada
  // ==========================================
  it("Cenário 12: ADMIN executa revisão e aprovação de reivindicação com sucesso", () => {
    const adminUid = "admin_root";
    const adminEmail = "paulocauan39@gmail.com";
    const auth: MockAuthToken = { uid: adminUid, email: adminEmail, email_verified: true };

    sim.usersDb.set(adminUid, {
      id: adminUid,
      email: adminEmail,
      role: "ADMIN",
      status: "active",
      approvalStatus: "APROVADO",
      admin: true,
    });

    const existingClaim: MockClaimDoc = {
      id: "claim_aluno1_item-99",
      itemId: "item-99",
      claimerId: "aluno1",
      status: "PENDENTE",
      distinctiveFeatures: "Casaco moletom cinza com capuz",
      createdAt: new Date().toISOString(),
    };
    sim.claimsDb.set(existingClaim.id, existingClaim);

    const incomingApproval = {
      ...existingClaim,
      status: "APROVADO",
      reviewedByUserId: adminUid,
      reviewedByName: "Paulo Cauan",
      reviewedByRole: "ADMIN",
      reviewedAt: new Date().toISOString(),
      decisionNotes: "Pertence devidamente reconhecido pelo estudante.",
    };

    const res = sim.allowReviewClaim(auth, existingClaim.id, existingClaim, incomingApproval);
    expect(res.allowed).toBe(true);
  });

  // ==========================================
  // 13. Testes de Anti-Adulteração durante Promoção
  // ==========================================
  describe("Anti-Adulteração durante Promoção", () => {
    const studentUid = "aluno_tamper";
    const studentEmail = "aluno.tamper@estudantes.ifpr.edu.br";
    const auth: MockAuthToken = { uid: studentUid, email: studentEmail, email_verified: true };

    const baseIntrusoDoc: MockFirestoreUserDoc = {
      id: studentUid,
      email: studentEmail,
      name: "Aluno Tamper",
      role: "INTRUSO",
      status: "active",
      approvalStatus: "APROVADO",
      admin: false,
      reputationScore: 50,
    };

    beforeEach(() => {
      sim.usersDb.set(studentUid, { ...baseIntrusoDoc });
    });

    it("Tentativa de alterar o próprio e-mail durante promoção é BLOQUEADA", () => {
      const res = sim.allowUpdateUser(auth, studentUid, baseIntrusoDoc, {
        ...baseIntrusoDoc,
        role: "ALUNO",
        email: "hacked@ifpr.edu.br",
      });
      expect(res.allowed).toBe(false);
    });

    it("Tentativa de alterar o UID durante promoção é BLOQUEADA", () => {
      const res = sim.allowUpdateUser(auth, studentUid, baseIntrusoDoc, {
        ...baseIntrusoDoc,
        role: "ALUNO",
        id: "vitima_uid",
      });
      expect(res.allowed).toBe(false);
    });

    it("Tentativa de Servidor auto-alterar approvalStatus para APROVADO durante promoção é BLOQUEADA", () => {
      const staffEmail = "servidor.tamper@ifpr.edu.br";
      const staffAuth: MockAuthToken = { uid: "staff_tamper", email: staffEmail, email_verified: true };
      const staffDoc: MockFirestoreUserDoc = {
        id: "staff_tamper",
        email: staffEmail,
        role: "INTRUSO",
        status: "active",
        approvalStatus: "PENDENTE",
        admin: false,
      };
      sim.usersDb.set("staff_tamper", staffDoc);

      const res = sim.allowUpdateUser(staffAuth, "staff_tamper", staffDoc, {
        ...staffDoc,
        role: "SERVIDOR",
        approvalStatus: "APROVADO", // Auto-aprovação ilegal
      });
      expect(res.allowed).toBe(false);
    });

    it("Tentativa de remover status suspenso durante promoção é BLOQUEADA", () => {
      const suspendedDoc: MockFirestoreUserDoc = {
        ...baseIntrusoDoc,
        status: "suspended",
        suspendedUntil: Date.now() + 500000,
      };
      sim.usersDb.set(studentUid, suspendedDoc);

      const res = sim.allowUpdateUser(auth, studentUid, suspendedDoc, {
        ...suspendedDoc,
        role: "ALUNO",
        status: "active", // Tentativa de auto-desbloqueio
      });
      expect(res.allowed).toBe(false);
    });

    it("Tentativa de alterar dados de outro usuário é BLOQUEADA", () => {
      const res = sim.allowUpdateUser(auth, "outro_usuario_uid", baseIntrusoDoc, {
        ...baseIntrusoDoc,
        role: "ALUNO",
      });
      expect(res.allowed).toBe(false);
    });
  });

  // ==========================================
  // 14. Integridade do Arquivo firestore.rules Real
  // ==========================================
  it("O arquivo firestore.rules real contém as funções corrigidas e a regra de promoção sem dependência circular", () => {
    const rulesPath = path.resolve(process.cwd(), "firestore.rules");
    const rulesContent = fs.readFileSync(rulesPath, "utf-8");

    // Confirmação de isDocServidorIdentity
    expect(rulesContent).toContain("function isDocServidorIdentity()");
    // Confirmação da regex de servidores com suporte a subdomínios
    expect(rulesContent).toContain("request.auth.token.email.matches('.*@([a-zA-Z0-9-]+\\\\.)*ifpr[.]edu[.]br')");
    // Confirmação da regex de estudantes com suporte a subdomínios
    expect(rulesContent).toContain("request.auth.token.email.matches('.*@([a-zA-Z0-9-]+\\\\.)*(estudantes|estudante|aluno)[.]ifpr[.]edu[.]br')");
    // Confirmação do ramo de promoção institucional na regra update de users
    expect(rulesContent).toContain("existing().role == 'INTRUSO'");
    expect(rulesContent).toContain("(incoming().role == 'ALUNO' && isInstitutionalStudentEmail())");
    expect(rulesContent).toContain("(incoming().role == 'SERVIDOR' && isInstitutionalStaffEmail())");
    // Confirmação de que a promoção não é acoplada a isAccountActive() circular
    expect(rulesContent).toContain("Promoção institucional legítima (INTRUSO -> ALUNO ou SERVIDOR)");
    // Confirmação do endurecimento de integridade contra exclusão de status
    expect(rulesContent).toContain("('status' in existing() && incoming().status == existing().status)");
    // Confirmação do endurecimento contra exclusão de suspensão
    expect(rulesContent).toContain("('suspendedUntil' in existing() && incoming().suspendedUntil == existing().suspendedUntil)");
  });

  // ==========================================
  // 15. Endurecimento Final: Proteção contra Exclusão de Campos de Controle
  // ==========================================
  describe("15. Proteção contra Exclusão de Campos de Controle em /users/{userId}", () => {
    let sim: InstitutionalSecuritySimulator;
    const studentUid = "aluno_hardening_123";
    const studentEmail = "estudante.teste@estudantes.ifpr.edu.br";
    const staffUid = "servidor_hardening_456";
    const staffEmail = "docente.teste@ifpr.edu.br";

    const studentAuth: MockAuthToken = {
      uid: studentUid,
      email: studentEmail,
      email_verified: true,
    };

    const staffAuth: MockAuthToken = {
      uid: staffUid,
      email: staffEmail,
      email_verified: true,
    };

    const baseStudentDoc: MockFirestoreUserDoc = {
      id: studentUid,
      email: studentEmail,
      name: "Aluno Teste",
      role: "ALUNO",
      status: "active",
      approvalStatus: "APROVADO",
      admin: false,
    };

    const baseStaffDoc: MockFirestoreUserDoc = {
      id: staffUid,
      email: staffEmail,
      name: "Servidor Teste",
      role: "SERVIDOR",
      status: "active",
      approvalStatus: "PENDENTE",
      admin: false,
    };

    beforeEach(() => {
      sim = new InstitutionalSecuritySimulator();
      sim.usersDb.set(studentUid, { ...baseStudentDoc });
      sim.usersDb.set(staffUid, { ...baseStaffDoc });
    });

    // 1. Exclusão de "status" por ALUNO
    it("1. Exclusão de 'status' por ALUNO (via FieldValue.delete) é BLOQUEADA", () => {
      const incomingWithoutStatus = { ...baseStudentDoc };
      delete (incomingWithoutStatus as any).status;

      const res = sim.allowUpdateUser(studentAuth, studentUid, baseStudentDoc, incomingWithoutStatus);
      expect(res.allowed).toBe(false);
    });

    // 2. Exclusão de "status" por SERVIDOR
    it("2. Exclusão de 'status' por SERVIDOR (via FieldValue.delete) é BLOQUEADA", () => {
      const incomingWithoutStatus = { ...baseStaffDoc };
      delete (incomingWithoutStatus as any).status;

      const res = sim.allowUpdateUser(staffAuth, staffUid, baseStaffDoc, incomingWithoutStatus);
      expect(res.allowed).toBe(false);
    });

    // 3. Exclusão de "approvalStatus"
    it("3. Exclusão de 'approvalStatus' por qualquer usuário é BLOQUEADA", () => {
      const incomingWithoutApproval = { ...baseStudentDoc };
      delete (incomingWithoutApproval as any).approvalStatus;

      const res = sim.allowUpdateUser(studentAuth, studentUid, baseStudentDoc, incomingWithoutApproval);
      expect(res.allowed).toBe(false);
    });

    // 4. Exclusão de "role"
    it("4. Exclusão de 'role' é BLOQUEADA", () => {
      const incomingWithoutRole = { ...baseStudentDoc };
      delete (incomingWithoutRole as any).role;

      const res = sim.allowUpdateUser(studentAuth, studentUid, baseStudentDoc, incomingWithoutRole);
      expect(res.allowed).toBe(false);
    });

    // 5. Exclusão de "admin" e prevenção de escalonamento
    it("5. Exclusão de 'admin' e tentativa de injetar admin: true são rigorosamente controladas", () => {
      const maliciousAdminEscalation = {
        ...baseStudentDoc,
        admin: true,
      };

      const res = sim.allowUpdateUser(studentAuth, studentUid, baseStudentDoc, maliciousAdminEscalation);
      expect(res.allowed).toBe(false);

      // Em Branch 1 (promoção de INTRUSO), a injeção de admin: true também é BLOQUEADA
      const intrusoUid = "intruso_admin_exploit";
      const intrusoEmail = "intruso@estudantes.ifpr.edu.br";
      const intrusoAuth: MockAuthToken = { uid: intrusoUid, email: intrusoEmail, email_verified: true };
      const intrusoDoc: MockFirestoreUserDoc = { id: intrusoUid, email: intrusoEmail, role: "INTRUSO", status: "active", approvalStatus: "APROVADO", admin: false };
      sim.usersDb.set(intrusoUid, intrusoDoc);

      const maliciousPromotion = { ...intrusoDoc, role: "ALUNO" as const, admin: true };
      const promoRes = sim.allowUpdateUser(intrusoAuth, intrusoUid, intrusoDoc, maliciousPromotion);
      expect(promoRes.allowed).toBe(false);
    });

    // 6. Alteração de "role" para ADMIN
    it("6. Alteração de 'role' para ADMIN por usuário comum é BLOQUEADA", () => {
      const maliciousPayload = {
        ...baseStudentDoc,
        role: "ADMIN" as any,
        admin: true,
      };

      const res = sim.allowUpdateUser(studentAuth, studentUid, baseStudentDoc, maliciousPayload);
      expect(res.allowed).toBe(false);
    });

    // 7. Autopromoção de SERVIDOR PENDENTE
    it("7. Autopromoção de SERVIDOR PENDENTE para APROVADO é BLOQUEADA", () => {
      const maliciousStaffPayload = {
        ...baseStaffDoc,
        approvalStatus: "APROVADO" as any,
      };

      const res = sim.allowUpdateUser(staffAuth, staffUid, baseStaffDoc, maliciousStaffPayload);
      expect(res.allowed).toBe(false);
    });

    // 8. Promoção legítima de INTRUSO para ALUNO
    it("8. Promoção legítima de INTRUSO para ALUNO é PERMITIDA", () => {
      const intrusoUid = "intruso_aluno_valid";
      const intrusoEmail = "novo.estudante@estudantes.ifpr.edu.br";
      const intrusoAuth: MockAuthToken = {
        uid: intrusoUid,
        email: intrusoEmail,
        email_verified: true,
      };
      const existingIntrusoDoc: MockFirestoreUserDoc = {
        id: intrusoUid,
        email: intrusoEmail,
        name: "Novo Estudante",
        role: "INTRUSO",
        status: "active",
        approvalStatus: "APROVADO",
        admin: false,
      };
      sim.usersDb.set(intrusoUid, existingIntrusoDoc);

      const legitimatePromotion = {
        ...existingIntrusoDoc,
        role: "ALUNO" as const,
      };

      const res = sim.allowUpdateUser(intrusoAuth, intrusoUid, existingIntrusoDoc, legitimatePromotion);
      expect(res.allowed).toBe(true);
    });

    // 9. Promoção legítima de INTRUSO para SERVIDOR
    it("9. Promoção legítima de INTRUSO para SERVIDOR é PERMITIDA com approvalStatus PENDENTE", () => {
      const intrusoUid = "intruso_servidor_valid";
      const intrusoEmail = "novo.docente@ifpr.edu.br";
      const intrusoAuth: MockAuthToken = {
        uid: intrusoUid,
        email: intrusoEmail,
        email_verified: true,
      };
      const existingIntrusoDoc: MockFirestoreUserDoc = {
        id: intrusoUid,
        email: intrusoEmail,
        name: "Novo Docente",
        role: "INTRUSO",
        status: "active",
        approvalStatus: "PENDENTE",
        admin: false,
      };
      sim.usersDb.set(intrusoUid, existingIntrusoDoc);

      const legitimatePromotion = {
        ...existingIntrusoDoc,
        role: "SERVIDOR" as const,
      };

      const res = sim.allowUpdateUser(intrusoAuth, intrusoUid, existingIntrusoDoc, legitimatePromotion);
      expect(res.allowed).toBe(true);
    });

    // 10. Atualização legítima de campos comuns do perfil
    it("10. Atualização legítima de campos comuns do perfil (nome, telefone, avatar) é PERMITIDA", () => {
      const legitimateProfileUpdate = {
        ...baseStudentDoc,
        name: "Aluno Nome Atualizado",
        phone: "(43) 98888-7777",
        avatarUrl: "https://example.com/avatar.png",
      };

      const res = sim.allowUpdateUser(studentAuth, studentUid, baseStudentDoc, legitimateProfileUpdate);
      expect(res.allowed).toBe(true);
    });
  });
});
