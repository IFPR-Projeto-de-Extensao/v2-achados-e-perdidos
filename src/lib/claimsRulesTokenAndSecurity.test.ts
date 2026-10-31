import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

/**
 * LOCALIZA+ v1.10.10 — Validação Cirúrgica das Regras Firestore (Claims e Custom Claims)
 * 
 * Bateria completa de testes automatizados para verificar a eliminação da falha HTTP 403 (CEL NullPropertyError)
 * e o suporte a transações (transaction.get) na coleção /claims/{claimId}, cobrindo todos os 12 cenários mandatórios:
 * 
 * 1. Google Auth Root Admin sem custom claims ('role' / 'admin' ausentes no token).
 * 2. Usuário institucional ALUNO (@estudantes.ifpr.edu.br).
 * 3. Usuário institucional SERVIDOR (@ifpr.edu.br).
 * 4. Usuário INTRUSO com approvalStatus irregular.
 * 5. Usuário bloqueado (isAccountBlocked).
 * 6. Usuário suspenso ativo.
 * 7. Reivindicação inexistente com ID determinístico correto (transaction.get tolerante a resource == null).
 * 8. Reivindicação existente pertencente ao próprio solicitante.
 * 9. Tentativa de leitura de reivindicação de terceiro por usuário comum.
 * 10. Tentativa de injeção de campos administrativos de revisão (hasNoAdminReviewFields).
 * 11. Tentativa de reivindicação de objeto com status DEVOLVIDO.
 * 12. Tentativa de reivindicação de objeto com status ENCERRADO.
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
  blockExpiresAt?: number;
  suspendedUntil?: number;
  [key: string]: any;
}

interface MockItemDoc {
  id: string;
  title: string;
  status: "NOVO" | "DEVOLVIDO" | "ENCERRADO" | "PERDIDO";
  registeredByUserId: string;
  registeredByRole: "ADMIN" | "SERVIDOR";
}

interface MockClaimDoc {
  id: string;
  itemId: string;
  claimerId: string;
  status: "PENDENTE" | "APROVADO" | "REJEITADO" | "CONCLUIDO" | "CANCELADO";
  distinctiveFeatures: string;
  createdAt: string;
  additionalInfo?: string;
  [key: string]: any;
}

/**
 * Simulador de Semântica CEL idêntico ao Firestore Rules v2 (firestore.rules)
 * Simula fielmente as regras para /claims/{claimId} e as funções auxiliares de autorização.
 */
class FirestoreRulesCelSimulator {
  constructor(
    public usersDb: Map<string, MockFirestoreUserDoc> = new Map(),
    public itemsDb: Map<string, MockItemDoc> = new Map(),
    public claimsDb: Map<string, MockClaimDoc> = new Map()
  ) {}

  // ==========================================
  // Helper Functions fiéis a firestore.rules
  // ==========================================

  isSignedIn(auth: MockAuthToken | null): boolean {
    return auth !== null && auth.uid != null;
  }

  isEmailVerified(auth: MockAuthToken | null): boolean {
    if (!this.isSignedIn(auth) || !auth) return false;
    return "email_verified" in auth && auth.email_verified === true;
  }

  getUserData(uid: string): MockFirestoreUserDoc | undefined {
    return this.usersDb.get(uid);
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
    const userData = this.getUserData(auth.uid);
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
    // Guarded key accesses: prevents CEL NullPropertyError
    const hasRoleAdmin = "role" in auth && auth.role === "ADMIN";
    const hasAdminTrue = "admin" in auth && auth.admin === true;
    return hasRoleAdmin || hasAdminTrue;
  }

  isDocAdmin(auth: MockAuthToken | null, requestTime: number): boolean {
    if (!this.isSignedIn(auth) || !auth) return false;
    if (!this.isEmailVerified(auth)) return false;
    if (!this.isAccountActive(auth, requestTime)) return false;
    if ("role" in auth && auth.role === "INTRUSO") return false;

    const userData = this.getUserData(auth.uid);
    if (!userData) return false;
    return userData.role === "ADMIN" && userData.approvalStatus === "APROVADO";
  }

  isAdmin(auth: MockAuthToken | null, requestTime: number): boolean {
    if (!auth) return false;
    if ("role" in auth && auth.role === "INTRUSO") return false;
    return this.isRootAdmin(auth) || (this.isAccountActive(auth, requestTime) && (this.hasAdminClaim(auth) || this.isDocAdmin(auth, requestTime)));
  }

  isDocServidor(auth: MockAuthToken | null, requestTime: number): boolean {
    if (!this.isSignedIn(auth) || !auth) return false;
    if (!this.isEmailVerified(auth)) return false;
    if (!this.isAccountActive(auth, requestTime)) return false;
    if ("role" in auth && auth.role === "INTRUSO") return false;

    const userData = this.getUserData(auth.uid);
    if (!userData) return false;
    return userData.role === "SERVIDOR" && userData.approvalStatus === "APROVADO";
  }

  isServidor(auth: MockAuthToken | null, requestTime: number): boolean {
    if (!this.isSignedIn(auth) || !auth) return false;
    return this.isAdmin(auth, requestTime) || (this.isAccountActive(auth, requestTime) && this.isEmailVerified(auth) && this.isDocServidor(auth, requestTime));
  }

  isDocAluno(auth: MockAuthToken | null): boolean {
    if (!this.isSignedIn(auth) || !auth) return false;
    if (!this.isEmailVerified(auth)) return false;
    if ("role" in auth && auth.role === "INTRUSO") return false;

    const userData = this.getUserData(auth.uid);
    if (!userData) return false;
    return userData.role === "ALUNO";
  }

  isDocIntruso(auth: MockAuthToken | null): boolean {
    if (!this.isSignedIn(auth) || !auth) return false;
    const userData = this.getUserData(auth.uid);
    if (!userData) return false;
    return userData.role === "INTRUSO";
  }

  isAccountActive(auth: MockAuthToken | null, requestTime: number): boolean {
    if (!this.isSignedIn(auth) || !auth) return false;
    if (this.isRootAdmin(auth)) return true;

    if ("role" in auth && auth.role === "INTRUSO") return false;
    const userData = this.getUserData(auth.uid);
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

    if (!this.isAdmin(auth, requestTime) && !this.isServidor(auth, requestTime) && !this.isDocAluno(auth)) {
      if ("email" in auth && auth.email) {
        const isStudent =
          auth.email.endsWith("@estudantes.ifpr.edu.br") ||
          auth.email.endsWith("@estudante.ifpr.edu.br") ||
          auth.email.endsWith("@aluno.ifpr.edu.br");
        const isStaff = auth.email.endsWith("@ifpr.edu.br");
        if (!isStudent && !isStaff) return true;
      }
    }
    return false;
  }

  hasNoAdminReviewFields(data: Record<string, any>): boolean {
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

  // ==========================================
  // Regras de /claims/{claimId}
  // ==========================================

  evaluateGet(auth: MockAuthToken | null, claimId: string, requestTime: number): boolean {
    if (!this.isSignedIn(auth) || !auth) return false;

    const existingDoc = this.claimsDb.get(claimId);
    const resourceExists = existingDoc !== undefined;

    // 1. Transactional read tolerance EXCLUSIVELY for non-existent documents (resource == null)
    if (!resourceExists && this.isAccountActive(auth, requestTime) && auth.uid != null && claimId.startsWith(`claim_${auth.uid}_`)) {
      return true;
    }

    // 2. Existing claim read by claimer or author of the original item
    if (resourceExists && this.isAccountActive(auth, requestTime)) {
      if (existingDoc.claimerId === auth.uid) return true;
      const item = this.itemsDb.get(existingDoc.itemId);
      if (item && item.registeredByUserId === auth.uid) return true;
    }

    // 3. Servidor ativo ou Administrador
    if (this.isServidor(auth, requestTime) && this.isAccountActive(auth, requestTime)) return true;
    if (this.isAdmin(auth, requestTime)) return true;

    return false;
  }

  evaluateList(auth: MockAuthToken | null, filteredClaimerId: string | null, requestTime: number): boolean {
    if (!this.isSignedIn(auth) || !auth) return false;
    if (this.isServidor(auth, requestTime) && this.isAccountActive(auth, requestTime)) return true;
    if (this.isAdmin(auth, requestTime)) return true;
    if (this.isAccountActive(auth, requestTime) && filteredClaimerId === auth.uid) return true;
    return false;
  }

  evaluateCreate(
    auth: MockAuthToken | null,
    claimId: string,
    incoming: Record<string, any>,
    requestTime: number
  ): boolean {
    if (!this.isEmailVerified(auth)) return false;
    if (!this.isAccountActive(auth, requestTime)) return false;
    if (this.isIntruso(auth, requestTime)) return false;

    if (claimId !== `claim_${auth!.uid}_${incoming.itemId}`) return false;
    if (incoming.claimerId !== auth!.uid) return false;
    if (incoming.status !== "PENDENTE") return false;
    if (typeof incoming.itemId !== "string" || incoming.itemId.length === 0) return false;
    if (typeof incoming.distinctiveFeatures !== "string" || incoming.distinctiveFeatures.length === 0 || incoming.distinctiveFeatures.length > 1000) return false;
    if ("additionalInfo" in incoming && incoming.additionalInfo !== null) {
      if (typeof incoming.additionalInfo !== "string" || incoming.additionalInfo.length > 1000) return false;
    }
    if (!this.hasNoAdminReviewFields(incoming)) return false;

    const targetItem = this.itemsDb.get(incoming.itemId);
    if (!targetItem) return false;
    if (targetItem.status === "DEVOLVIDO" || targetItem.status === "ENCERRADO") return false;

    return true;
  }
}

describe("LOCALIZA+ v1.10.10 — Validação Cirúrgica de Regras Firestore (Claims e Custom Claims)", () => {
  const rulesPath = path.resolve(process.cwd(), "firestore.rules");
  const rulesContent = fs.readFileSync(rulesPath, "utf-8");

  describe("Análise Estática do Arquivo firestore.rules", () => {
    it("deve conter proteção 'role' in request.auth.token e 'admin' in request.auth.token em hasAdminClaim()", () => {
      expect(rulesContent).toMatch(
        /'role' in request\.auth\.token && request\.auth\.token\.role == 'ADMIN'/
      );
      expect(rulesContent).toMatch(
        /'admin' in request\.auth\.token && request\.auth\.token\.admin == true/
      );
    });

    it("deve conter proteção 'role' in request.auth.token em isIntruso() para prevenir exceção de chave ausente", () => {
      expect(rulesContent).toMatch(
        /'role' in request\.auth\.token && request\.auth\.token\.role == 'INTRUSO'/
      );
    });

    it("deve permitir allow get com exigência estrita de resource == null para leitura transacional de IDs determinísticos do próprio usuário", () => {
      expect(rulesContent).toMatch(
        /resource == null && isAccountActive\(\) && request\.auth\.uid != null && claimId\.matches\('claim_' \+ request\.auth\.uid \+ '_.*'\)/
      );
    });

    it("deve manter a restrição contra injeção de campos administrativos (hasNoAdminReviewFields)", () => {
      expect(rulesContent).toContain("hasNoAdminReviewFields(incoming())");
    });
  });

  describe("Simulação dos 12 Cenários Obrigatórios de Autorização e Reivindicações", () => {
    let sim: FirestoreRulesCelSimulator;
    const now = 1730310000000;

    beforeEach(() => {
      sim = new FirestoreRulesCelSimulator();

      // Objeto ativo de teste
      sim.itemsDb.set("item-teste-01", {
        id: "item-teste-01",
        title: "Caderno Espiral IFPR",
        status: "PERDIDO",
        registeredByUserId: "author-servidor-uid",
        registeredByRole: "SERVIDOR",
      });

      // Objeto já devolvido
      sim.itemsDb.set("item-devolvido-02", {
        id: "item-devolvido-02",
        title: "Mochila Preta",
        status: "DEVOLVIDO",
        registeredByUserId: "author-servidor-uid",
        registeredByRole: "SERVIDOR",
      });

      // Objeto encerrado
      sim.itemsDb.set("item-encerrado-03", {
        id: "item-encerrado-03",
        title: "Calculadora Científica",
        status: "ENCERRADO",
        registeredByUserId: "author-servidor-uid",
        registeredByRole: "SERVIDOR",
      });
    });

    // Cenário 1: Google Auth Root Admin sem custom claims
    it("Cenário 1: Administrador Root Google (sem token.role ou token.admin) deve ser aprovado em claims", () => {
      const rootAdminAuth: MockAuthToken = {
        uid: "hCG5mDgK1fRaTojULzlM7dXvb7n2",
        email: "paulocauan39@gmail.com",
        email_verified: true,
        // Ausência explícita de role e admin no token (Google login padrão)
      };

      // Usuário no Firestore
      sim.usersDb.set(rootAdminAuth.uid, {
        id: rootAdminAuth.uid,
        email: "paulocauan39@gmail.com",
        role: "ADMIN",
        approvalStatus: "APROVADO",
        status: "active",
      });

      expect(sim.isRootAdmin(rootAdminAuth)).toBe(true);
      expect(sim.isAdmin(rootAdminAuth, now)).toBe(true);
      expect(sim.isIntruso(rootAdminAuth, now)).toBe(false);
      expect(sim.isAccountActive(rootAdminAuth, now)).toBe(true);

      const claimId = `claim_${rootAdminAuth.uid}_item-teste-01`;
      const validPayload = {
        id: claimId,
        itemId: "item-teste-01",
        claimerId: rootAdminAuth.uid,
        status: "PENDENTE",
        distinctiveFeatures: "Possui meu adesivo na capa",
        createdAt: new Date().toISOString(),
      };

      const canCreate = sim.evaluateCreate(rootAdminAuth, claimId, validPayload, now);
      expect(canCreate).toBe(true);
    });

    // Cenário 2: Usuário institucional ALUNO
    it("Cenário 2: Aluno institucional (@estudantes.ifpr.edu.br) ativo pode submeter reivindicação válida", () => {
      const alunoAuth: MockAuthToken = {
        uid: "aluno-uid-100",
        email: "aluno.teste@estudantes.ifpr.edu.br",
        email_verified: true,
      };

      sim.usersDb.set(alunoAuth.uid, {
        id: alunoAuth.uid,
        email: alunoAuth.email!,
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "active",
      });

      expect(sim.isIntruso(alunoAuth, now)).toBe(false);
      expect(sim.isAccountActive(alunoAuth, now)).toBe(true);

      const claimId = `claim_${alunoAuth.uid}_item-teste-01`;
      const validPayload = {
        id: claimId,
        itemId: "item-teste-01",
        claimerId: alunoAuth.uid,
        status: "PENDENTE",
        distinctiveFeatures: "Capa azul com etiqueta de identificação",
        createdAt: new Date().toISOString(),
      };

      expect(sim.evaluateCreate(alunoAuth, claimId, validPayload, now)).toBe(true);
    });

    // Cenário 3: Usuário institucional SERVIDOR
    it("Cenário 3: Servidor institucional aprovado tem permissões administrativas em claims", () => {
      const servidorAuth: MockAuthToken = {
        uid: "servidor-uid-200",
        email: "servidor.teste@ifpr.edu.br",
        email_verified: true,
      };

      sim.usersDb.set(servidorAuth.uid, {
        id: servidorAuth.uid,
        email: servidorAuth.email!,
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "active",
      });

      expect(sim.isServidor(servidorAuth, now)).toBe(true);
      expect(sim.evaluateGet(servidorAuth, "claim_alheio_qualquer", now)).toBe(true);
    });

    // Cenário 4: Usuário INTRUSO com approvalStatus irregular
    it("Cenário 4: Usuário INTRUSO (mesmo com approvalStatus APROVADO indevido) é estritamente bloqueado", () => {
      const intrusoAuth: MockAuthToken = {
        uid: "intruso-uid-300",
        email: "estranho@gmail.com",
        email_verified: true,
      };

      sim.usersDb.set(intrusoAuth.uid, {
        id: intrusoAuth.uid,
        email: intrusoAuth.email!,
        role: "INTRUSO",
        approvalStatus: "APROVADO", // Simulação de tentativa de bypass
        status: "active",
      });

      expect(sim.isIntruso(intrusoAuth, now)).toBe(true);
      expect(sim.isAccountActive(intrusoAuth, now)).toBe(false);

      const claimId = `claim_${intrusoAuth.uid}_item-teste-01`;
      const payload = {
        id: claimId,
        itemId: "item-teste-01",
        claimerId: intrusoAuth.uid,
        status: "PENDENTE",
        distinctiveFeatures: "Tentativa indevida",
        createdAt: new Date().toISOString(),
      };

      expect(sim.evaluateCreate(intrusoAuth, claimId, payload, now)).toBe(false);
      expect(sim.evaluateGet(intrusoAuth, claimId, now)).toBe(false);
    });

    // Cenário 5: Usuário bloqueado (isAccountBlocked / banned)
    it("Cenário 5: Usuário banido tem criação e consulta de reivindicações bloqueadas", () => {
      const bannedAuth: MockAuthToken = {
        uid: "banned-uid-400",
        email: "banido@estudantes.ifpr.edu.br",
        email_verified: true,
      };

      sim.usersDb.set(bannedAuth.uid, {
        id: bannedAuth.uid,
        email: bannedAuth.email!,
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "banned",
      });

      expect(sim.isAccountBlocked(bannedAuth, now)).toBe(true);
      expect(sim.isAccountActive(bannedAuth, now)).toBe(false);

      const claimId = `claim_${bannedAuth.uid}_item-teste-01`;
      const payload = {
        id: claimId,
        itemId: "item-teste-01",
        claimerId: bannedAuth.uid,
        status: "PENDENTE",
        distinctiveFeatures: "Tentativa de usuário banido",
      };

      expect(sim.evaluateCreate(bannedAuth, claimId, payload, now)).toBe(false);
      expect(sim.evaluateGet(bannedAuth, claimId, now)).toBe(false);
    });

    // Cenário 6: Usuário suspenso ativo
    it("Cenário 6: Usuário suspenso com prazo não expirado tem ações bloqueadas", () => {
      const suspendedAuth: MockAuthToken = {
        uid: "suspended-uid-500",
        email: "suspenso@estudantes.ifpr.edu.br",
        email_verified: true,
      };

      sim.usersDb.set(suspendedAuth.uid, {
        id: suspendedAuth.uid,
        email: suspendedAuth.email!,
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "suspended",
        suspendedUntil: now + 3600000, // expira no futuro
      });

      expect(sim.isAccountActive(suspendedAuth, now)).toBe(false);

      const claimId = `claim_${suspendedAuth.uid}_item-teste-01`;
      const payload = {
        id: claimId,
        itemId: "item-teste-01",
        claimerId: suspendedAuth.uid,
        status: "PENDENTE",
        distinctiveFeatures: "Tentativa durante suspensão",
      };

      expect(sim.evaluateCreate(suspendedAuth, claimId, payload, now)).toBe(false);
      expect(sim.evaluateGet(suspendedAuth, claimId, now)).toBe(false);
    });

    // Cenário 7: Leitura transacional (transaction.get) de reivindicação inexistente com ID próprio
    it("Cenário 7: transaction.get em documento inexistente com claim_{auth.uid}_* é permitido", () => {
      const alunoAuth: MockAuthToken = {
        uid: "aluno-uid-700",
        email: "aluno700@estudantes.ifpr.edu.br",
        email_verified: true,
      };

      sim.usersDb.set(alunoAuth.uid, {
        id: alunoAuth.uid,
        email: alunoAuth.email!,
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "active",
      });

      const nonExistentClaimId = `claim_${alunoAuth.uid}_item-teste-01`;
      // Documento NÃO existe em claimsDb
      expect(sim.claimsDb.has(nonExistentClaimId)).toBe(false);

      // Deve permitir allow get para viabilizar transaction.get no AppContext
      const canReadNonExistent = sim.evaluateGet(alunoAuth, nonExistentClaimId, now);
      expect(canReadNonExistent).toBe(true);
    });

    // Cenário 8: Reivindicação existente pertencente ao próprio usuário
    it("Cenário 8: Reivindicação existente é legível pelo próprio solicitante", () => {
      const alunoAuth: MockAuthToken = {
        uid: "aluno-uid-800",
        email: "aluno800@estudantes.ifpr.edu.br",
        email_verified: true,
      };

      sim.usersDb.set(alunoAuth.uid, {
        id: alunoAuth.uid,
        email: alunoAuth.email!,
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "active",
      });

      const claimId = `claim_${alunoAuth.uid}_item-teste-01`;
      sim.claimsDb.set(claimId, {
        id: claimId,
        itemId: "item-teste-01",
        claimerId: alunoAuth.uid,
        status: "PENDENTE",
        distinctiveFeatures: "Marcações a lápis",
        createdAt: new Date().toISOString(),
      });

      expect(sim.evaluateGet(alunoAuth, claimId, now)).toBe(true);
    });

    // Cenário 9: Tentativa de leitura de reivindicação de terceiro
    it("Cenário 9: Usuário comum não pode ler reivindicações de outros usuários", () => {
      const alunoAuth: MockAuthToken = {
        uid: "aluno-uid-900",
        email: "aluno900@estudantes.ifpr.edu.br",
        email_verified: true,
      };

      sim.usersDb.set(alunoAuth.uid, {
        id: alunoAuth.uid,
        email: alunoAuth.email!,
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "active",
      });

      const otherClaimId = "claim_outro_usuario_uid_item-teste-01";
      sim.claimsDb.set(otherClaimId, {
        id: otherClaimId,
        itemId: "item-teste-01",
        claimerId: "outro_usuario_uid",
        status: "PENDENTE",
        distinctiveFeatures: "Pertence a outro",
        createdAt: new Date().toISOString(),
      });

      expect(sim.evaluateGet(alunoAuth, otherClaimId, now)).toBe(false);
    });

    // Cenário 10: Tentativa de injeção de campos administrativos de revisão
    it("Cenário 10: Criação com injeção forjada de campos administrativos é bloqueada", () => {
      const alunoAuth: MockAuthToken = {
        uid: "aluno-uid-1000",
        email: "aluno1000@estudantes.ifpr.edu.br",
        email_verified: true,
      };

      sim.usersDb.set(alunoAuth.uid, {
        id: alunoAuth.uid,
        email: alunoAuth.email!,
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "active",
      });

      const claimId = `claim_${alunoAuth.uid}_item-teste-01`;
      const forgedPayload = {
        id: claimId,
        itemId: "item-teste-01",
        claimerId: alunoAuth.uid,
        status: "PENDENTE",
        distinctiveFeatures: "Legítimo",
        reviewedByUserId: "admin-uid", // Injeção maliciosa
        reviewedByRole: "ADMIN",       // Injeção maliciosa
      };

      expect(sim.evaluateCreate(alunoAuth, claimId, forgedPayload, now)).toBe(false);
    });

    // Cenário 11: Tentativa de reivindicação de objeto DEVOLVIDO
    it("Cenário 11: Reivindicação de objeto com status DEVOLVIDO é rejeitada", () => {
      const alunoAuth: MockAuthToken = {
        uid: "aluno-uid-1100",
        email: "aluno1100@estudantes.ifpr.edu.br",
        email_verified: true,
      };

      sim.usersDb.set(alunoAuth.uid, {
        id: alunoAuth.uid,
        email: alunoAuth.email!,
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "active",
      });

      const claimId = `claim_${alunoAuth.uid}_item-devolvido-02`;
      const payload = {
        id: claimId,
        itemId: "item-devolvido-02",
        claimerId: alunoAuth.uid,
        status: "PENDENTE",
        distinctiveFeatures: "Tentativa em item devolvido",
      };

      expect(sim.evaluateCreate(alunoAuth, claimId, payload, now)).toBe(false);
    });

    // Cenário 12: Tentativa de reivindicação de objeto ENCERRADO
    it("Cenário 12: Reivindicação de objeto com status ENCERRADO é rejeitada", () => {
      const alunoAuth: MockAuthToken = {
        uid: "aluno-uid-1200",
        email: "aluno1200@estudantes.ifpr.edu.br",
        email_verified: true,
      };

      sim.usersDb.set(alunoAuth.uid, {
        id: alunoAuth.uid,
        email: alunoAuth.email!,
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "active",
      });

      const claimId = `claim_${alunoAuth.uid}_item-encerrado-03`;
      const payload = {
        id: claimId,
        itemId: "item-encerrado-03",
        claimerId: alunoAuth.uid,
        status: "PENDENTE",
        distinctiveFeatures: "Tentativa em item encerrado",
      };

      expect(sim.evaluateCreate(alunoAuth, claimId, payload, now)).toBe(false);
    });
  });

  describe("Seção 3: Validação das Restrições Específicas de Leitura de Claims e Exigência de resource == null", () => {
    let sim: FirestoreRulesCelSimulator;
    const now = 1730310000000;
    const activeAluno: MockAuthToken = {
      uid: "aluno_ativo_uid",
      email: "aluno.ativo@estudantes.ifpr.edu.br",
      email_verified: true,
    };

    beforeEach(() => {
      sim = new FirestoreRulesCelSimulator();
      sim.usersDb.set(activeAluno.uid, {
        id: activeAluno.uid,
        email: activeAluno.email!,
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "active",
      });

      sim.itemsDb.set("item_01", {
        id: "item_01",
        title: "Garrafa Térmica",
        status: "PERDIDO",
        registeredByUserId: "servidor_origem",
        registeredByRole: "SERVIDOR",
      });
    });

    // 1. Usuário ativo consegue executar get de Claim inexistente com ID determinístico próprio
    it("1. Usuário ativo consegue executar get de Claim inexistente (resource == null) com ID determinístico próprio", () => {
      const nonExistentId = `claim_${activeAluno.uid}_item_01`;
      expect(sim.claimsDb.has(nonExistentId)).toBe(false); // Confirma que não existe
      expect(sim.evaluateGet(activeAluno, nonExistentId, now)).toBe(true);
    });

    // 2. Usuário ativo consegue consultar sua Claim existente
    it("2. Usuário ativo consegue consultar sua Claim existente (resource != null)", () => {
      const existingId = `claim_${activeAluno.uid}_item_01`;
      sim.claimsDb.set(existingId, {
        id: existingId,
        itemId: "item_01",
        claimerId: activeAluno.uid,
        status: "PENDENTE",
        distinctiveFeatures: "Adesivo azul",
        createdAt: new Date().toISOString(),
      });

      expect(sim.evaluateGet(activeAluno, existingId, now)).toBe(true);
    });

    // 3. Usuário não consegue consultar Claim existente de terceiro, mesmo que o ID comece com seu próprio UID
    it("3. Usuário não consegue consultar Claim existente de terceiro, mesmo que o ID comece com seu próprio UID (exigência estrita de resource == null)", () => {
      const spoofedId = `claim_${activeAluno.uid}_item_01`;
      // O documento EXISTE (resource != null), porém o claimerId pertence a OUTRO usuário
      sim.claimsDb.set(spoofedId, {
        id: spoofedId,
        itemId: "item_01",
        claimerId: "terceiro_legitimo_uid",
        status: "PENDENTE",
        distinctiveFeatures: "Pertence a terceiro",
        createdAt: new Date().toISOString(),
      });

      // A regra determinística falha porque resource != null, e a regra de titularidade falha porque claimerId != auth.uid
      expect(sim.evaluateGet(activeAluno, spoofedId, now)).toBe(false);
    });

    // 4. Usuário não consegue consultar Claim existente de terceiro por manipulação do identificador
    it("4. Usuário não consegue consultar Claim existente de terceiro por manipulação do identificador", () => {
      const thirdPartyClaimId = "claim_terceiro_uid_item_01";
      sim.claimsDb.set(thirdPartyClaimId, {
        id: thirdPartyClaimId,
        itemId: "item_01",
        claimerId: "terceiro_uid",
        status: "PENDENTE",
        distinctiveFeatures: "Pertence a terceiro",
        createdAt: new Date().toISOString(),
      });

      expect(sim.evaluateGet(activeAluno, thirdPartyClaimId, now)).toBe(false);
    });

    // 5. Usuário comum não consegue listar indiscriminadamente a coleção claims
    it("5. Usuário comum não consegue listar indiscriminadamente a coleção claims", () => {
      // Listagem sem filtro (ou filtrando por outro usuário) deve ser rejeitada
      const listWithoutFilter = sim.evaluateList(activeAluno, null, now);
      const listForOther = sim.evaluateList(activeAluno, "outro_usuario_uid", now);
      const listOwnClaims = sim.evaluateList(activeAluno, activeAluno.uid, now);

      expect(listWithoutFilter).toBe(false);
      expect(listForOther).toBe(false);
      expect(listOwnClaims).toBe(true);
    });

    // 6. Root Admin Google sem custom claims continua autorizado
    it("6. Root Admin Google sem custom claims continua autorizado para consultar e gerenciar claims", () => {
      const googleRootAdmin: MockAuthToken = {
        uid: "root_cauan_uid",
        email: "paulocauan39@gmail.com",
        email_verified: true,
        // Ausência de role e admin no token
      };

      const existingId = "claim_qualquer_item_01";
      sim.claimsDb.set(existingId, {
        id: existingId,
        itemId: "item_01",
        claimerId: "outro_aluno_uid",
        status: "PENDENTE",
        distinctiveFeatures: "Verificação administrativa",
        createdAt: new Date().toISOString(),
      });

      expect(sim.isRootAdmin(googleRootAdmin)).toBe(true);
      expect(sim.isAdmin(googleRootAdmin, now)).toBe(true);
      expect(sim.evaluateGet(googleRootAdmin, existingId, now)).toBe(true);
    });

    // 7. INTRUSO, contas bloqueadas e suspensas continuam bloqueados
    it("7. INTRUSO, contas bloqueadas e suspensas continuam estritamente bloqueados", () => {
      const intruso: MockAuthToken = {
        uid: "intruso_uid",
        email: "intruso@gmail.com",
        email_verified: true,
      };
      sim.usersDb.set(intruso.uid, {
        id: intruso.uid,
        email: intruso.email!,
        role: "INTRUSO",
        approvalStatus: "APROVADO",
        status: "active",
      });

      const banido: MockAuthToken = {
        uid: "banido_uid",
        email: "banido@estudantes.ifpr.edu.br",
        email_verified: true,
      };
      sim.usersDb.set(banido.uid, {
        id: banido.uid,
        email: banido.email!,
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "banned",
      });

      const suspenso: MockAuthToken = {
        uid: "suspenso_uid",
        email: "suspenso@estudantes.ifpr.edu.br",
        email_verified: true,
      };
      sim.usersDb.set(suspenso.uid, {
        id: suspenso.uid,
        email: suspenso.email!,
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "suspended",
        suspendedUntil: now + 5000000,
      });

      const targetId = `claim_${activeAluno.uid}_item_01`;

      expect(sim.evaluateGet(intruso, targetId, now)).toBe(false);
      expect(sim.evaluateGet(banido, targetId, now)).toBe(false);
      expect(sim.evaluateGet(suspenso, targetId, now)).toBe(false);
    });
  });
});
