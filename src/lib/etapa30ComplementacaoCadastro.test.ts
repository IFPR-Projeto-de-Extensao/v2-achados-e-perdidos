import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { LostFoundItem, SyncQueueEntry, User } from "../types";
import { ROOT_ADMIN_EMAIL, ROOT_ADMIN_UID } from "./devolutionAuth";
import {
  evaluateItemRegistrationEligibility,
  evaluateRegisterViewAccess,
  buildSanitizedInitialHistoryEntry,
  buildSanitizedItemPrivatePayload,
  buildItemRegistrationWritePlan,
  evaluateLocalRulesMirrorForRegistrationBatch,
  mergeConfirmedItemIntoCatalogSnapshot,
  shouldIncludeRegistrationItemInCatalog,
  TARGET_FIRESTORE_DATABASE_ID,
} from "./itemRegistrationPipeline";
import { evaluateExistingRemoteItem, evaluateOfflineSyncOwnership } from "./offlineSyncRecovery";
import { classifySyncError } from "./payloadSizeGuard";
import { validateItemTextFields } from "./utils";
import { validateItemImageAndPayloadSize, MAX_SAFE_ITEM_IMAGE_BYTES } from "./imageCompression";
import { resolveEffectiveUserIdentity } from "../context/AppContext";

/**
 * LOCALIZA+ v1.10.13 — Complementação Funcional da Etapa 30
 * Suíte Abrangente de Regressão e Diagnóstico do Cadastro de Objetos (19 Cenários Obrigatórios)
 *
 * AVISO TRANSPARENTE:
 * Esta suíte executa validação LOCAL e SINTÉTICA da lógica de frontend, fila offline,
 * sanitização do lote atômico (/items, /item_history, /item_private) e espelho estático
 * local de firestore.rules. NÃO se conecta ao Firebase/Firestore real nem substitui a
 * execução do Firestore Emulator ou a conferência das regras efetivamente publicadas no
 * banco nomeado de produção (ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1).
 */

function makeBaseItem(overrides: Partial<LostFoundItem> = {}): LostFoundItem {
  return {
    id: "ifpr-MWMUBPTI-536",
    title: "Chave de Laboratório com Chaveiro Verde",
    description: "Chave encontrada próximo ao Bloco 2 no intervalo da manhã.",
    category: "Chaves",
    type: "ENCONTRADO",
    status: "ENCONTRADO",
    color: "Prata e Verde",
    brand: "Desconhecida",
    location: "Bloco 2 — Corredor térreo",
    date: "2026-11-18",
    imageUrl: "",
    contactInfo: "Contato/Ponto: Guarita Principal IFPR",
    qrCodeId: "QR-IFPR-MWMUBPTI-CHAVE",
    registeredByUserId: ROOT_ADMIN_UID,
    registeredByName: "Paulo Cauan",
    registeredByRole: "ADMIN",
    createdAt: "2026-11-18T12:00:00.000Z",
    history: [
      {
        id: "hist-ifpr-MWMUBPTI-536-init",
        action: "Ocorrência cadastrada",
        actorId: ROOT_ADMIN_UID,
        actorName: "Paulo Cauan",
        actorRole: "ADMIN",
        userId: ROOT_ADMIN_UID,
        userName: "Paulo Cauan",
        userRole: "ADMIN",
        timestamp: "2026-11-18T12:00:00.000Z",
        details: "Ocorrência registrada como ENCONTRADO.",
        objectId: "ifpr-MWMUBPTI-536",
      },
    ],
    storageDeadlineDays: 90,
    isOfflineQueued: false,
    ...overrides,
  };
}

describe("Complementação Etapa 30 — Diagnóstico e Correção do Cadastro de Objetos (19 Cenários Obrigatórios)", () => {
  // =========================================================================
  // 1 a 8: Matriz de Permissões dos 8 Perfis Obrigatórios + Precedência Gmail
  // =========================================================================
  describe("A. Matriz de Permissões (8 Perfis Obrigatórios + Precedência Administrativa Gmail)", () => {
    it("1. Root Admin verificado (UID + e-mail + emailVerified=true, tokenRole=null, userDocActive=null) — PERMITIDO", () => {
      const rootAuth = {
        uid: ROOT_ADMIN_UID,
        email: ROOT_ADMIN_EMAIL,
        emailVerified: true,
      };
      const forensicRootDoc: Record<string, any> = {
        id: ROOT_ADMIN_UID,
        email: ROOT_ADMIN_EMAIL,
        role: "ADMIN",
        approvalStatus: "APROVADO",
        status: "active",
        active: null,
      };

      const eligibility = evaluateItemRegistrationEligibility({
        authUser: rootAuth,
        tokenEmailVerified: true,
        userDocData: forensicRootDoc,
      });
      expect(eligibility.allowed).toBe(true);
      expect(eligibility.isRootAdmin).toBe(true);
      expect(eligibility.effectiveRole).toBe("ADMIN");

      const viewAccess = evaluateRegisterViewAccess({
        isAuthLoading: false,
        isGuest: false,
        currentUser: forensicRootDoc as Partial<User>,
        authUser: rootAuth,
      });
      expect(viewAccess.canRegister).toBe(true);
      expect(viewAccess.isUnauthorized).toBe(false);

      const plan = buildItemRegistrationWritePlan({
        item: makeBaseItem({ id: "ifpr-MWMUBPTI-536" }),
        authUid: ROOT_ADMIN_UID,
        actorName: "Paulo Cauan",
        effectiveRole: "ADMIN",
      });
      const rulesEval = evaluateLocalRulesMirrorForRegistrationBatch({
        auth: {
          uid: ROOT_ADMIN_UID,
          email: ROOT_ADMIN_EMAIL,
          email_verified: true,
          role: null, // ausência de token.role conforme registro forense
        },
        userDoc: forensicRootDoc,
        writePlan: plan,
      });
      expect(rulesEval.evaluatorMode).toBe("LOCAL_STATIC_MIRROR_NOT_LIVE_FIREBASE");
      expect(rulesEval.batchAllowed).toBe(true);
      expect(rulesEval.perCollection.items.allowed).toBe(true);
      expect(rulesEval.perCollection.item_history.allowed).toBe(true);
    });

    it("2. ADMIN não-root ativo e aprovado — PERMITIDO (inclusive sem custom claims)", () => {
      const uid = "admin-nonroot-01";
      const authUser = { uid, email: "admin.campus@gmail.com", emailVerified: true };
      const userDoc = {
        id: uid,
        email: "admin.campus@gmail.com",
        role: "ADMIN" as const,
        approvalStatus: "APROVADO" as const,
        status: "active" as const,
        active: true,
      };

      const eligibility = evaluateItemRegistrationEligibility({
        authUser,
        tokenEmailVerified: true,
        userDocData: userDoc,
      });
      expect(eligibility.allowed).toBe(true);
      expect(eligibility.effectiveRole).toBe("ADMIN");

      const plan = buildItemRegistrationWritePlan({
        item: makeBaseItem({
          id: "ifpr-ADM-001",
          registeredByUserId: uid,
          registeredByRole: "ADMIN",
          secretVerificationHint: "Adesivo azul",
        }),
        authUid: uid,
        actorName: "Admin Campus",
        effectiveRole: "ADMIN",
      });
      const rulesEval = evaluateLocalRulesMirrorForRegistrationBatch({
        auth: { uid, email: "admin.campus@gmail.com", email_verified: true, role: null },
        userDoc,
        writePlan: plan,
      });
      expect(rulesEval.batchAllowed).toBe(true);
      expect(rulesEval.perCollection.item_private.allowed).toBe(true);
    });

    it("3. SERVIDOR/TAE ativo e aprovado — PERMITIDO (institucional e Gmail promovido)", () => {
      const uid = "serv-gmail-01";
      const authUser = { uid, email: "servidor.designado@gmail.com", emailVerified: true };
      const userDoc = {
        id: uid,
        email: "servidor.designado@gmail.com",
        role: "SERVIDOR" as const,
        approvalStatus: "APROVADO" as const,
        status: "active" as const,
        active: true,
        roleAssignedBy: ROOT_ADMIN_UID,
      };

      // Preservação da precedência administrativa sobre domínio Gmail
      const identity = resolveEffectiveUserIdentity({
        email: authUser.email,
        emailVerified: true,
        userDocData: userDoc,
        roleAssignment: null,
      });
      expect(identity.role).toBe("SERVIDOR");
      expect(identity.approvalStatus).toBe("APROVADO");

      const eligibility = evaluateItemRegistrationEligibility({
        authUser,
        tokenEmailVerified: true,
        userDocData: userDoc,
      });
      expect(eligibility.allowed).toBe(true);
      expect(eligibility.effectiveRole).toBe("SERVIDOR");

      const plan = buildItemRegistrationWritePlan({
        item: makeBaseItem({
          id: "ifpr-SRV-001",
          registeredByUserId: uid,
          registeredByRole: "SERVIDOR",
        }),
        authUid: uid,
        actorName: "Servidor Designado",
        effectiveRole: "SERVIDOR",
      });
      const rulesEval = evaluateLocalRulesMirrorForRegistrationBatch({
        auth: { uid, email: authUser.email, email_verified: true, role: null },
        userDoc,
        writePlan: plan,
      });
      expect(rulesEval.batchAllowed).toBe(true);
    });

    it("4. SERVIDOR pendente — NEGADO (UI, pipeline e regras)", () => {
      const uid = "serv-pend-01";
      const authUser = { uid, email: "novo.servidor@ifpr.edu.br", emailVerified: true };
      const userDoc = {
        id: uid,
        email: authUser.email,
        role: "SERVIDOR" as const,
        approvalStatus: "PENDENTE" as const,
        status: "active" as const,
      };

      const eligibility = evaluateItemRegistrationEligibility({
        authUser,
        tokenEmailVerified: true,
        userDocData: userDoc,
      });
      expect(eligibility.allowed).toBe(false);
      expect(eligibility.reasonCode).toBe("APPROVAL_PENDING");

      const viewAccess = evaluateRegisterViewAccess({
        isAuthLoading: false,
        isGuest: false,
        currentUser: userDoc,
        authUser,
      });
      expect(viewAccess.isUnauthorized).toBe(true);

      const forgedPlan = buildItemRegistrationWritePlan({
        item: makeBaseItem({ id: "ifpr-PEND-001", registeredByUserId: uid }),
        authUid: uid,
        actorName: "Servidor Pendente",
        effectiveRole: "SERVIDOR",
      });
      const rulesEval = evaluateLocalRulesMirrorForRegistrationBatch({
        auth: { uid, email: authUser.email, email_verified: true },
        userDoc,
        writePlan: forgedPlan,
      });
      expect(rulesEval.batchAllowed).toBe(false);
      expect(rulesEval.perCollection.items.allowed).toBe(false);
      expect(rulesEval.perCollection.item_history.allowed).toBe(false);
    });

    it("5. ALUNO (institucional ou Gmail atribuído como ALUNO) — NEGADO no cadastro, mantendo precedência de ALUNO sem rebaixar para INTRUSO", () => {
      const uid = "aluno-gmail-01";
      const authUser = { uid, email: "estudante.autorizado@gmail.com", emailVerified: true };
      const userDoc = {
        id: uid,
        email: authUser.email,
        role: "ALUNO" as const,
        approvalStatus: "APROVADO" as const,
        status: "active" as const,
        roleAssignedBy: ROOT_ADMIN_UID,
      };

      // Precedência preservada: Gmail atribuído como ALUNO continua ALUNO (jamais INTRUSO)
      const identity = resolveEffectiveUserIdentity({
        email: authUser.email,
        emailVerified: true,
        userDocData: userDoc,
        roleAssignment: null,
      });
      expect(identity.role).toBe("ALUNO");
      expect(identity.role).not.toBe("INTRUSO");

      // Porém ALUNO nunca pode cadastrar objetos
      const eligibility = evaluateItemRegistrationEligibility({
        authUser,
        tokenEmailVerified: true,
        userDocData: userDoc,
      });
      expect(eligibility.allowed).toBe(false);
      expect(eligibility.reasonCode).toBe("ROLE_ALUNO_FORBIDDEN");

      const viewAccess = evaluateRegisterViewAccess({
        isAuthLoading: false,
        isGuest: false,
        currentUser: userDoc,
        authUser,
      });
      expect(viewAccess.isUnauthorized).toBe(true);

      const forgedPlan = buildItemRegistrationWritePlan({
        item: makeBaseItem({ id: "ifpr-ALU-001", registeredByUserId: uid }),
        authUid: uid,
        actorName: "Aluno",
        effectiveRole: "SERVIDOR",
      });
      const rulesEval = evaluateLocalRulesMirrorForRegistrationBatch({
        auth: { uid, email: authUser.email, email_verified: true },
        userDoc,
        writePlan: forgedPlan,
      });
      expect(rulesEval.batchAllowed).toBe(false);
      expect(rulesEval.perCollection.items.allowed).toBe(false);
    });

    it("6. INTRUSO — NEGADO em todas as camadas", () => {
      const uid = "intruso-01";
      const authUser = { uid, email: "externo.desconhecido@gmail.com", emailVerified: true };
      const userDoc = {
        id: uid,
        email: authUser.email,
        role: "INTRUSO" as const,
        approvalStatus: "APROVADO" as const,
        status: "active" as const,
      };

      const eligibility = evaluateItemRegistrationEligibility({
        authUser,
        tokenEmailVerified: true,
        userDocData: userDoc,
      });
      expect(eligibility.allowed).toBe(false);
      expect(eligibility.reasonCode).toBe("ROLE_INTRUSO_FORBIDDEN");

      const viewAccess = evaluateRegisterViewAccess({
        isAuthLoading: false,
        isGuest: false,
        currentUser: userDoc,
        authUser,
      });
      expect(viewAccess.isUnauthorized).toBe(true);

      const forgedPlan = buildItemRegistrationWritePlan({
        item: makeBaseItem({ id: "ifpr-INT-001", registeredByUserId: uid }),
        authUid: uid,
        actorName: "Externo",
        effectiveRole: "SERVIDOR",
      });
      const rulesEval = evaluateLocalRulesMirrorForRegistrationBatch({
        auth: { uid, email: authUser.email, email_verified: true },
        userDoc,
        writePlan: forgedPlan,
      });
      expect(rulesEval.batchAllowed).toBe(false);
    });

    it("7. Usuário suspenso — NEGADO (UI, pipeline e regras)", () => {
      const uid = "serv-susp-01";
      const authUser = { uid, email: "suspenso@ifpr.edu.br", emailVerified: true };
      const futureMs = Date.now() + 86_400_000;
      const userDoc = {
        id: uid,
        email: authUser.email,
        role: "SERVIDOR" as const,
        approvalStatus: "APROVADO" as const,
        status: "suspended" as const,
        suspendedUntil: new Date(futureMs).toISOString(),
      };

      const eligibility = evaluateItemRegistrationEligibility({
        authUser,
        tokenEmailVerified: true,
        userDocData: userDoc,
      });
      expect(eligibility.allowed).toBe(false);
      expect(eligibility.reasonCode).toBe("ACCOUNT_SUSPENDED");

      const viewAccess = evaluateRegisterViewAccess({
        isAuthLoading: false,
        isGuest: false,
        currentUser: userDoc,
        authUser,
      });
      expect(viewAccess.isUnauthorized).toBe(true);

      const forgedPlan = buildItemRegistrationWritePlan({
        item: makeBaseItem({ id: "ifpr-SUSP-001", registeredByUserId: uid }),
        authUid: uid,
        actorName: "Suspenso",
        effectiveRole: "SERVIDOR",
      });
      const rulesEval = evaluateLocalRulesMirrorForRegistrationBatch({
        auth: { uid, email: authUser.email, email_verified: true },
        userDoc: { ...userDoc, suspendedUntil: futureMs },
        writePlan: forgedPlan,
      });
      expect(rulesEval.batchAllowed).toBe(false);
    });

    it("8. Usuário bloqueado (banned ou active: false) — NEGADO em todas as camadas", () => {
      const uid = "admin-blocked-01";
      const authUser = { uid, email: "bloqueado@ifpr.edu.br", emailVerified: true };
      const bannedDoc = {
        id: uid,
        email: authUser.email,
        role: "ADMIN" as const,
        approvalStatus: "APROVADO" as const,
        status: "banned" as const,
        active: false,
      };

      const eligibility = evaluateItemRegistrationEligibility({
        authUser,
        tokenEmailVerified: true,
        userDocData: bannedDoc,
      });
      expect(eligibility.allowed).toBe(false);
      expect(eligibility.reasonCode).toBe("ACCOUNT_BLOCKED");

      const viewAccess = evaluateRegisterViewAccess({
        isAuthLoading: false,
        isGuest: false,
        currentUser: bannedDoc,
        authUser,
      });
      expect(viewAccess.isUnauthorized).toBe(true);

      const forgedPlan = buildItemRegistrationWritePlan({
        item: makeBaseItem({ id: "ifpr-BAN-001", registeredByUserId: uid }),
        authUid: uid,
        actorName: "Bloqueado",
        effectiveRole: "ADMIN",
      });
      const rulesEval = evaluateLocalRulesMirrorForRegistrationBatch({
        auth: { uid, email: authUser.email, email_verified: true },
        userDoc: bannedDoc,
        writePlan: forgedPlan,
      });
      expect(rulesEval.batchAllowed).toBe(false);
    });
  });

  // =========================================================================
  // 9 a 14: Claims ausentes, estado desatualizado, falhas por coleção e lote atômico
  // =========================================================================
  describe("B. Edge Cases de Claims, Estado Desatualizado, Regras Candidatas e Lote Atômico", () => {
    it("9. Ausência de token.role não bloqueia Root Admin, ADMIN aprovado nem SERVIDOR aprovado", () => {
      const servDoc = {
        id: "serv-no-claim",
        email: "serv@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "active",
      };
      const plan = buildItemRegistrationWritePlan({
        item: makeBaseItem({ id: "ifpr-NOCLAIM-1", registeredByUserId: "serv-no-claim" }),
        authUid: "serv-no-claim",
        actorName: "Serv",
        effectiveRole: "SERVIDOR",
      });
      const evalRes = evaluateLocalRulesMirrorForRegistrationBatch({
        auth: { uid: "serv-no-claim", email: "serv@ifpr.edu.br", email_verified: true, role: null },
        userDoc: servDoc,
        writePlan: plan,
      });
      expect(evalRes.batchAllowed).toBe(true);
    });

    it("10. [Etapa 31] Paridade fail-closed de isStandingActive(u): null em blockExpiresAt/suspendedUntil bloqueia em firestore.rules e no candidato corrigido (preservando SEC-07 C-50)", () => {
      const uid = "admin-null-block";
      const userDocWithNullField = {
        id: uid,
        email: "admin.legado@ifpr.edu.br",
        role: "ADMIN",
        approvalStatus: "APROVADO",
        status: "active",
        blockExpiresAt: null, // Campo residual nulo incompatível com Timestamp (Etapa 10 / C-50 exige deleteField())
      };
      const plan = buildItemRegistrationWritePlan({
        item: makeBaseItem({ id: "ifpr-NULLTS-1", registeredByUserId: uid }),
        authUid: uid,
        actorName: "Admin Legado",
        effectiveRole: "ADMIN",
      });

      // Comportamento fail-closed canônico (firestore.rules + candidato corrigido + accountStatusUtils + server.ts + C-50):
      const currentEval = evaluateLocalRulesMirrorForRegistrationBatch({
        auth: { uid, email: "admin.legado@ifpr.edu.br", email_verified: true },
        userDoc: userDocWithNullField,
        writePlan: plan,
        strictNullTimestampBehavior: "CURRENT_RULES_2F2A",
      });
      expect(currentEval.batchAllowed).toBe(false);

      // Reativação correta via deleteField() remove blockExpiresAt/suspendedUntil -> permitido
      const reactivatedDoc = {
        id: uid,
        email: "admin.legado@ifpr.edu.br",
        role: "ADMIN",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
      };
      const reactivatedEval = evaluateLocalRulesMirrorForRegistrationBatch({
        auth: { uid, email: "admin.legado@ifpr.edu.br", email_verified: true },
        userDoc: reactivatedDoc,
        writePlan: plan,
        strictNullTimestampBehavior: "CURRENT_RULES_2F2A",
      });
      expect(reactivatedEval.batchAllowed).toBe(true);

      // Suspensão indefinida (status: 'suspended', suspendedUntil: null) continua estritamente BLOQUEADA
      const indefiniteSuspEval = evaluateLocalRulesMirrorForRegistrationBatch({
        auth: { uid, email: "admin.legado@ifpr.edu.br", email_verified: true },
        userDoc: { ...userDocWithNullField, status: "suspended", suspendedUntil: null },
        writePlan: plan,
        strictNullTimestampBehavior: "CURRENT_RULES_2F2A",
      });
      expect(indefiniteSuspEval.batchAllowed).toBe(false);
    });

    it("11. Falha específica em /items (ex: campo proibido ou título > 100 chars) bloqueia o lote inteiro", () => {
      const plan = buildItemRegistrationWritePlan({
        item: makeBaseItem({ id: "ifpr-FAIL-ITEMS", title: "X".repeat(105) }),
        authUid: ROOT_ADMIN_UID,
        actorName: "Root",
        effectiveRole: "ADMIN",
      });
      const evalRes = evaluateLocalRulesMirrorForRegistrationBatch({
        auth: { uid: ROOT_ADMIN_UID, email: ROOT_ADMIN_EMAIL, email_verified: true },
        userDoc: { role: "ADMIN", approvalStatus: "APROVADO", status: "active" },
        writePlan: plan,
      });
      expect(evalRes.batchAllowed).toBe(false);
      expect(evalRes.perCollection.items.allowed).toBe(false);
      expect(evalRes.perCollection.items.failedChecks).toContain("isValidItemTextFields:title");
    });

    it("12. Sanitização de /item_history impede falha em lote por rawInitHistory corrompido (actorRole ALUNO, action vazia ou PII)", () => {
      const corruptedRawHistory = {
        id: "hist-corrupted-1",
        action: "", // vazio -> violaria incoming().action.size() > 0
        actorId: "uid-estranho",
        actorRole: "ALUNO", // papel inválido -> violaria actorRole in ['ADMIN','SERVIDOR']
        recipientName: "Vazamento PII", // campo proibido -> violaria hasNoReturnOrSignatureFields
        signatureToken: "tok_forjado",
      };

      const { entryId, payload } = buildSanitizedInitialHistoryEntry({
        itemId: "ifpr-MWMUBPTI-536",
        itemType: "ENCONTRADO",
        itemLocation: "Bloco 1",
        authUid: ROOT_ADMIN_UID,
        actorName: "Paulo Cauan",
        effectiveRole: "ADMIN",
        rawHistoryEntry: corruptedRawHistory,
      });

      expect(entryId).toBe("hist-corrupted-1");
      expect(payload.actorId).toBe(ROOT_ADMIN_UID);
      expect(payload.actorRole).toBe("ADMIN");
      expect(payload.action).toBe("Ocorrência cadastrada");
      expect(payload.objectId).toBe("ifpr-MWMUBPTI-536");
      expect("recipientName" in payload).toBe(false);
      expect("signatureToken" in payload).toBe(false);
    });

    it("13. Escrita condicional em /item_private: omitida sem segredo; validada com itemId e registeredByUserId quando presente", () => {
      const noSecret = buildSanitizedItemPrivatePayload({
        itemId: "ifpr-NO-PRIV",
        authUid: ROOT_ADMIN_UID,
      });
      expect(noSecret).toBeNull();

      const withSecret = buildSanitizedItemPrivatePayload({
        itemId: "ifpr-WITH-PRIV",
        authUid: ROOT_ADMIN_UID,
        secretVerificationHint: "Etiqueta interna com iniciais",
      });
      expect(withSecret).not.toBeNull();
      expect(withSecret?.itemId).toBe("ifpr-WITH-PRIV");
      expect(withSecret?.registeredByUserId).toBe(ROOT_ADMIN_UID);

      const plan = buildItemRegistrationWritePlan({
        item: makeBaseItem({
          id: "ifpr-WITH-PRIV",
          secretVerificationHint: "Etiqueta interna com iniciais",
        }),
        authUid: ROOT_ADMIN_UID,
        actorName: "Paulo Cauan",
        effectiveRole: "ADMIN",
      });
      expect(plan.targetCollections).toEqual(["items", "item_history", "item_private"]);
      expect("secretVerificationHint" in plan.itemPayload).toBe(false);
    });

    it("14. Falha em lote atômico (writeBatch): se qualquer coleção falhar, nenhuma é confirmada; pós-commit audit_logs/activity_logs isolado não reverte CONFIRMED", async () => {
      // Verifica isolamento estrutural em AppContext.tsx: recordAuditLog e logAdminAction estão FORA do try/catch de createBatch.commit()
      const ctxSrc = fs.readFileSync(path.resolve(process.cwd(), "src/context/AppContext.tsx"), "utf8");
      const addItemStart = ctxSrc.indexOf("const addItem = async");
      const addItemEnd = ctxSrc.indexOf("const suggestMatchesForItem", addItemStart);
      const addItemBlock = ctxSrc.slice(addItemStart, addItemEnd);

      const commitPos = addItemBlock.indexOf("await createBatch.commit();");
      const catchPos = addItemBlock.indexOf("} catch (e: any) {", commitPos);
      const postCommitAuditPos = addItemBlock.indexOf("await recordAuditLog({", catchPos);
      const postCommitLogPos = addItemBlock.indexOf("await logAdminAction(", catchPos);

      expect(commitPos).toBeGreaterThan(-1);
      expect(catchPos).toBeGreaterThan(commitPos);
      // Confirmar que recordAuditLog e logAdminAction só ocorrem APÓS o catch de writeBatch.commit()
      expect(postCommitAuditPos).toBeGreaterThan(catchPos);
      expect(postCommitLogPos).toBeGreaterThan(catchPos);
      expect(addItemBlock.slice(commitPos, catchPos)).not.toContain("recordAuditLog(");
      expect(addItemBlock.slice(commitPos, catchPos)).not.toContain("logAdminAction(");
    });
  });

  // =========================================================================
  // 15 a 19: Fila Offline (ifpr-MWMUBPTI-536), Reprocessamento, Antiduplicação e Recuperação
  // =========================================================================
  describe("C. Fila Offline (padrão ifpr-MWMUBPTI-536), Reprocessamento, Antiduplicação e Recuperação", () => {
    let localQueue: Map<string, SyncQueueEntry>;
    let remoteItems: Map<string, Record<string, any>>;
    let remoteHistory: Map<string, Record<string, any>>;

    beforeEach(() => {
      localQueue = new Map();
      remoteItems = new Map();
      remoteHistory = new Map();
    });

    async function runSafeOfflineSyncSimulation(params: {
      authUser: { uid: string; email: string; emailVerified: boolean };
      userDoc: Record<string, any> | null;
      simulateWriteError?: Error | null;
    }) {
      let synced = 0;
      let preserved = 0;
      const seenItemIds = new Set<string>();

      for (const [entryId, entry] of Array.from(localQueue.entries())) {
        const itemId = entry.itemId || entry.payload.id;
        if (seenItemIds.has(itemId)) {
          localQueue.delete(entryId);
          continue;
        }
        seenItemIds.add(itemId);

        const ownership = evaluateOfflineSyncOwnership(entry.payload.registeredByUserId, params.authUser.uid);
        if (!ownership.allowed) {
          preserved++;
          continue;
        }

        const elig = evaluateItemRegistrationEligibility({
          authUser: params.authUser,
          tokenEmailVerified: params.authUser.emailVerified,
          userDocData: params.userDoc,
        });
        if (!elig.allowed || !elig.effectiveRole) {
          localQueue.set(entryId, {
            ...entry,
            status: "ERRO_PERMANENTE",
            errorType: "AUTHORIZATION",
            error: `AUTHORIZATION_${elig.reasonCode}`,
          });
          preserved++;
          continue;
        }

        const plan = buildItemRegistrationWritePlan({
          item: entry.payload,
          authUid: params.authUser.uid,
          actorName: entry.payload.registeredByName || "Root",
          effectiveRole: elig.effectiveRole,
        });

        const existingRemote = remoteItems.get(itemId) || null;
        const remoteEval = evaluateExistingRemoteItem(plan.itemPayload, existingRemote);

        if (remoteEval.action === "CONFLICT_STOP") {
          localQueue.set(entryId, {
            ...entry,
            status: "ERRO_PERMANENTE",
            errorType: "PERMANENT",
            error: `SYNC_CONFLICT_EXISTING_ITEM: ${remoteEval.reason}`,
          });
          preserved++;
          continue;
        }

        try {
          if (params.simulateWriteError) {
            throw params.simulateWriteError;
          }

          if (remoteEval.action === "CREATE_NEW") {
            remoteItems.set(itemId, plan.itemPayload);
          }
          if (!remoteHistory.has(plan.historyEntryId)) {
            remoteHistory.set(plan.historyEntryId, plan.historyPayload);
          }

          // Remoção da fila SOMENTE após commit confirmado
          localQueue.delete(entryId);
          synced++;
        } catch (err) {
          const classified = classifySyncError(err, plan.payloadSizeBytes);
          localQueue.set(entryId, {
            ...entry,
            status: classified.isPermanent ? "ERRO_PERMANENTE" : "ERRO_TEMPORARIO",
            errorType: classified.category,
            error: classified.reason,
          });
          preserved++;
        }
      }

      return { synced, preserved, remainingQueueSize: localQueue.size };
    }

    it("15. Preservação da fila offline com o objeto de teste ifpr-MWMUBPTI-536 sob permission-denied (jamais descartar)", async () => {
      const testItem = makeBaseItem({ id: "ifpr-MWMUBPTI-536", isOfflineQueued: true });
      localQueue.set("queue-ifpr-MWMUBPTI-536", {
        id: "queue-ifpr-MWMUBPTI-536",
        itemId: "ifpr-MWMUBPTI-536",
        type: "REGISTER_ITEM",
        payload: testItem,
        createdAt: testItem.createdAt,
        status: "PENDENTE",
        attempts: 0,
      });

      const permErr = Object.assign(new Error("Missing or insufficient permissions."), {
        code: "permission-denied",
      });
      const res = await runSafeOfflineSyncSimulation({
        authUser: { uid: ROOT_ADMIN_UID, email: ROOT_ADMIN_EMAIL, emailVerified: true },
        userDoc: { role: "ADMIN", approvalStatus: "APROVADO", status: "active", active: null },
        simulateWriteError: permErr,
      });

      expect(res.synced).toBe(0);
      expect(res.remainingQueueSize).toBe(1);
      const kept = localQueue.get("queue-ifpr-MWMUBPTI-536");
      expect(kept?.itemId).toBe("ifpr-MWMUBPTI-536");
      expect(kept?.status).toBe("ERRO_PERMANENTE");
      expect(kept?.errorType).toBe("AUTHORIZATION");
    });

    it("16 e 18. Recuperação após permission-denied e reprocessamento seguro da fila preservando ID original", async () => {
      const testItem = makeBaseItem({ id: "ifpr-MWMUBPTI-536", isOfflineQueued: true });
      localQueue.set("queue-ifpr-MWMUBPTI-536", {
        id: "queue-ifpr-MWMUBPTI-536",
        itemId: "ifpr-MWMUBPTI-536",
        type: "REGISTER_ITEM",
        payload: testItem,
        createdAt: testItem.createdAt,
        status: "ERRO_PERMANENTE",
        errorType: "AUTHORIZATION",
        error: "Missing or insufficient permissions.",
        attempts: 1,
      });

      // Após correção das regras / retry manual, reprocessamento envia mantendo o mesmo ID
      const res = await runSafeOfflineSyncSimulation({
        authUser: { uid: ROOT_ADMIN_UID, email: ROOT_ADMIN_EMAIL, emailVerified: true },
        userDoc: { role: "ADMIN", approvalStatus: "APROVADO", status: "active", active: null },
        simulateWriteError: null,
      });

      expect(res.synced).toBe(1);
      expect(res.remainingQueueSize).toBe(0);
      expect(remoteItems.has("ifpr-MWMUBPTI-536")).toBe(true);
      expect(remoteItems.get("ifpr-MWMUBPTI-536")?.registeredByRole).toBe("ADMIN");
      expect(remoteHistory.size).toBe(1);
    });

    it("17. Antiduplicação no reenvio: item já persistido no servidor reconcilia sem sobrescrever nem duplicar", async () => {
      const testItem = makeBaseItem({ id: "ifpr-MWMUBPTI-536", isOfflineQueued: true });
      const plan = buildItemRegistrationWritePlan({
        item: testItem,
        authUid: ROOT_ADMIN_UID,
        actorName: "Paulo Cauan",
        effectiveRole: "ADMIN",
      });
      // Servidor já possui o item (inclusive com status avançado para EM_ANALISE)
      remoteItems.set("ifpr-MWMUBPTI-536", { ...plan.itemPayload, status: "EM_ANALISE" });

      localQueue.set("queue-ifpr-MWMUBPTI-536", {
        id: "queue-ifpr-MWMUBPTI-536",
        itemId: "ifpr-MWMUBPTI-536",
        type: "REGISTER_ITEM",
        payload: testItem,
        createdAt: testItem.createdAt,
        status: "PENDENTE",
        attempts: 1,
      });

      const res = await runSafeOfflineSyncSimulation({
        authUser: { uid: ROOT_ADMIN_UID, email: ROOT_ADMIN_EMAIL, emailVerified: true },
        userDoc: { role: "ADMIN", approvalStatus: "APROVADO", status: "active", active: null },
      });

      expect(res.synced).toBe(1);
      expect(res.remainingQueueSize).toBe(0);
      expect(remoteItems.size).toBe(1);
      // Status avançado no servidor foi preservado (não regredido para ENCONTRADO)
      expect(remoteItems.get("ifpr-MWMUBPTI-536")?.status).toBe("EM_ANALISE");
    });

    it("19. Recuperação após erro de rede transitório (unavailable -> PENDENTE -> sucesso)", async () => {
      const testItem = makeBaseItem({ id: "ifpr-NET-REC-01", isOfflineQueued: true });
      localQueue.set("queue-ifpr-NET-REC-01", {
        id: "queue-ifpr-NET-REC-01",
        itemId: "ifpr-NET-REC-01",
        type: "REGISTER_ITEM",
        payload: testItem,
        createdAt: testItem.createdAt,
        status: "PENDENTE",
        attempts: 0,
      });

      const netErr = Object.assign(new Error("The service is currently unavailable."), {
        code: "unavailable",
      });
      const failRun = await runSafeOfflineSyncSimulation({
        authUser: { uid: ROOT_ADMIN_UID, email: ROOT_ADMIN_EMAIL, emailVerified: true },
        userDoc: { role: "ADMIN", approvalStatus: "APROVADO", status: "active", active: true },
        simulateWriteError: netErr,
      });

      expect(failRun.synced).toBe(0);
      expect(failRun.remainingQueueSize).toBe(1);
      expect(localQueue.get("queue-ifpr-NET-REC-01")?.status).toBe("ERRO_TEMPORARIO");
      expect(localQueue.get("queue-ifpr-NET-REC-01")?.errorType).toBe("TEMPORARY");

      const okRun = await runSafeOfflineSyncSimulation({
        authUser: { uid: ROOT_ADMIN_UID, email: ROOT_ADMIN_EMAIL, emailVerified: true },
        userDoc: { role: "ADMIN", approvalStatus: "APROVADO", status: "active", active: true },
        simulateWriteError: null,
      });
      expect(okRun.synced).toBe(1);
      expect(okRun.remainingQueueSize).toBe(0);
      expect(remoteItems.has("ifpr-NET-REC-01")).toBe(true);
    });
  });

  // =========================================================================
  // Integridade dos Artefatos Protegidos da Etapa 30 e Banco Nomeado
  // =========================================================================
  describe("D. Integridade do Banco Nomeado, Telemetria e Artefatos Homologados", () => {
    it("TARGET_FIRESTORE_DATABASE_ID corresponde ao banco nomeado do projeto", () => {
      expect(TARGET_FIRESTORE_DATABASE_ID).toBe(
        "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1"
      );
    });

    it("firestore.rules homologado permanece intacto (SHA-256 2f2a2ffc...) enquanto melhorias ficam no arquivo candidato separado", () => {
      const rulesBytes = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"));
      const sha = crypto.createHash("sha256").update(rulesBytes).digest("hex");
      expect(sha).toBe("2f2a2ffc8c471d7fe97b5d1d2bb3c2a3ca27d39947be64449ad13a532c851f9e");

      const candidatePath = path.resolve(
        process.cwd(),
        "scripts/audit/candidates/etapa30-complementacao/firestore.rules.candidate"
      );
      expect(fs.existsSync(candidatePath)).toBe(true);
      const candSrc = fs.readFileSync(candidatePath, "utf8");
      // Etapa 31: R-01 revertido para fail-closed (preserva SEC-07 C-50 e paridade com accountStatusUtils/server.ts)
      expect(candSrc).toContain("let hasB = 'blockExpiresAt' in u;");
      expect(candSrc).toContain("let hasS = 'suspendedUntil' in u;");
      expect(candSrc).not.toContain("let hasB = 'blockExpiresAt' in u && u.blockExpiresAt != null;");
      expect(candSrc).not.toContain("let hasS = 'suspendedUntil' in u && u.suspendedUntil != null;");
      // R-02 e R-03 preservados na candidata
      expect(candSrc).toContain("incoming().actorEmail.lower() == request.auth.token.email.lower()");
      expect(candSrc).toContain("(!('registeredByUserId' in incoming()) || incoming().registeredByUserId == request.auth.uid)");
    });

    it("syncOfflineQueue registra operation: writeBatch.commit() (sem rótulo falso de setDoc) e RegisterItemView exibe registrationFeedback.error", () => {
      const ctxSrc = fs.readFileSync(path.resolve(process.cwd(), "src/context/AppContext.tsx"), "utf8");
      const syncStart = ctxSrc.indexOf("const syncOfflineQueue = async");
      const syncEnd = ctxSrc.indexOf("const handleSwMessage", syncStart);
      const syncBlock = ctxSrc.slice(syncStart, syncEnd);
      expect(syncBlock).toContain('operation: "writeBatch.commit()"');
      expect(syncBlock).not.toContain('operation: "setDoc(..., { merge: true })"');
      expect(syncBlock).toContain("evaluateItemRegistrationEligibility(");

      const regSrc = fs.readFileSync(path.resolve(process.cwd(), "src/components/RegisterItemView.tsx"), "utf8");
      expect(regSrc).toContain("evaluateRegisterViewAccess(");
      expect(regSrc).toContain("error: classifiedMsg,");
      expect(regSrc).toContain("{registrationFeedback.error && (");
    });
  });

  // =========================================================================
  // E. Validação Integrada: Isolamento Pós-Commit em syncOfflineQueue,
  //    Visibilidade Determinística no Catálogo, Exclusão de Falhas e Guards
  // =========================================================================
  describe("E. Validação Integrada — Catálogo, Isolamento Pós-Commit e Guardas Finais", () => {
    it("20. [Cenário 10] Falha permanente (ERROR) nunca entra no catálogo, enquanto CONFIRMED e PENDING_SYNC são permitidos", () => {
      expect(shouldIncludeRegistrationItemInCatalog("CONFIRMED")).toBe(true);
      expect(shouldIncludeRegistrationItemInCatalog("PENDING_SYNC")).toBe(true);
      expect(shouldIncludeRegistrationItemInCatalog("ERROR")).toBe(false);

      const ctxSrc = fs.readFileSync(path.resolve(process.cwd(), "src/context/AppContext.tsx"), "utf8");
      const addIdx = ctxSrc.indexOf("const addItem = async");
      const addEnd = ctxSrc.indexOf("const updateItemStatus", addIdx);
      const addBlock = ctxSrc.slice(addIdx, addEnd);

      // Caminho de erro de tamanho não injeta item no estado do catálogo
      expect(addBlock).toContain("do NOT inject into confirmed catalog");
      // Caminho de catch do writeBatch só injeta item em setItems quando PENDING_SYNC
      expect(addBlock).toContain("if (shouldIncludeRegistrationItemInCatalog(nextStatus))");
      // Remoção de { merge: true } redundante na criação inédita de /item_private
      expect(addBlock).toContain('createBatch.set(doc(db, "item_private", newItem.id), sanitizedItemPrivate);');
      expect(addBlock).not.toContain('createBatch.set(doc(db, "item_private", newItem.id), sanitizedItemPrivate, { merge: true });');
    });

    it("21. [Cenário 11] syncOfflineQueue isola limpeza da fila IndexedDB, atualização de catálogo e Discord fora do catch de syncBatch.commit()", () => {
      const ctxSrc = fs.readFileSync(path.resolve(process.cwd(), "src/context/AppContext.tsx"), "utf8");
      const syncStart = ctxSrc.indexOf("const syncOfflineQueue = async");
      const syncEnd = ctxSrc.indexOf("const handleSwMessage", syncStart);
      const syncBlock = ctxSrc.slice(syncStart, syncEnd);

      const commitPos = syncBlock.indexOf("await syncBatch.commit();");
      const catchPos = syncBlock.indexOf("} catch (syncErr: any) {");
      const removeQueuePos = syncBlock.indexOf("await removeSyncQueueEntry(entry.id);", catchPos);
      const mergeCatalogPos = syncBlock.indexOf("mergeConfirmedItemIntoCatalogSnapshot(", catchPos);

      expect(commitPos).toBeGreaterThan(-1);
      expect(catchPos).toBeGreaterThan(commitPos);
      expect(removeQueuePos).toBeGreaterThan(catchPos);
      expect(mergeCatalogPos).toBeGreaterThan(catchPos);

      // retryUploadTask aciona syncOfflineQueue com isExplicitRetry=true para não sofrer no-op silencioso
      const retryStart = ctxSrc.indexOf("const retryUploadTask = async");
      const retryBlock = ctxSrc.slice(retryStart, syncStart);
      expect(retryBlock).toContain("await syncOfflineQueue(false, true);");
    });

    it("22. [Cenário 16] mergeConfirmedItemIntoCatalogSnapshot atualiza rawPublicItemsRef e itemHistoryEntriesRef sem perda por corrida de snapshot e ItemCard sinaliza pendentes", () => {
      const existingItem = makeBaseItem({ id: "ifpr-OLD-001", isOfflineQueued: false });
      const newItem = makeBaseItem({
        id: "ifpr-NEW-999",
        title: "Caderno Universitário Espiral",
        isOfflineQueued: false,
      });
      const initialHist = {
        id: "hist-ifpr-NEW-999-init",
        timestamp: "2026-11-20T12:00:00.000Z",
      };

      const merged = mergeConfirmedItemIntoCatalogSnapshot({
        prevRawPublicItems: [existingItem],
        prevHistoryMap: {},
        confirmedPublicItem: newItem,
        initialHistoryEntry: initialHist,
      });

      expect(merged.nextRawPublicItems).toHaveLength(2);
      expect(merged.nextRawPublicItems[0].id).toBe("ifpr-NEW-999");
      expect(merged.nextRawPublicItems[0].isOfflineQueued).toBe(false);
      expect(merged.nextHistoryMap["ifpr-NEW-999"]).toHaveLength(1);
      expect(merged.nextHistoryMap["ifpr-NEW-999"][0].id).toBe("hist-ifpr-NEW-999-init");

      // Re-aplicação idempotente não duplica item nem entrada de histórico
      const mergedTwice = mergeConfirmedItemIntoCatalogSnapshot({
        prevRawPublicItems: merged.nextRawPublicItems,
        prevHistoryMap: merged.nextHistoryMap,
        confirmedPublicItem: newItem,
        initialHistoryEntry: initialHist,
      });
      expect(mergedTwice.nextRawPublicItems).toHaveLength(2);
      expect(mergedTwice.nextHistoryMap["ifpr-NEW-999"]).toHaveLength(1);

      // ItemCard distingue visualmente itens locais pendentes de sincronização
      const cardSrc = fs.readFileSync(path.resolve(process.cwd(), "src/components/ItemCard.tsx"), "utf8");
      expect(cardSrc).toContain("item?.isOfflineQueued");
      expect(cardSrc).toContain("Pendente de sincronização");
    });

    it("23. [Cenário 9] addItem bloqueia JWT com claims.email_verified === false inclusive para Root Admin", () => {
      const ctxSrc = fs.readFileSync(path.resolve(process.cwd(), "src/context/AppContext.tsx"), "utf8");
      const addIdx = ctxSrc.indexOf("const addItem = async");
      const addEnd = ctxSrc.indexOf("const updateItemStatus", addIdx);
      const addBlock = ctxSrc.slice(addIdx, addEnd);

      expect(addBlock).toContain("if (tokenResult && tokenResult.claims?.email_verified === false)");

      const mirrorRes = evaluateLocalRulesMirrorForRegistrationBatch({
        auth: { uid: ROOT_ADMIN_UID, email: ROOT_ADMIN_EMAIL, email_verified: false },
        userDoc: { role: "ADMIN", approvalStatus: "APROVADO", status: "active", active: true },
        writePlan: buildItemRegistrationWritePlan({
          item: makeBaseItem(),
          authUid: ROOT_ADMIN_UID,
          actorName: "Paulo Cauan",
          effectiveRole: "ADMIN",
        }),
      });
      expect(mirrorRes.batchAllowed).toBe(false);
      expect(mirrorRes.perCollection.items.failedChecks).toContain("hasVerifiedEmailToken");
    });

    it("24. [Cenário 17] Validação defensiva de imagem, tamanho de payload e limites de texto bloqueia excessos antes do Firestore", () => {
      const oversizedImage = "data:image/jpeg;base64," + "A".repeat(MAX_SAFE_ITEM_IMAGE_BYTES + 2048);
      const imgValidation = validateItemImageAndPayloadSize({
        imageUrl: oversizedImage,
        fields: { title: "Objeto Teste", description: "Descrição válida" },
      });
      expect(imgValidation.isValid).toBe(false);
      expect(imgValidation.reason).toBe("IMAGE_TOO_LARGE");

      const validImg = validateItemImageAndPayloadSize({
        imageUrl: "data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=",
        fields: { title: "Garrafa Térmica", description: "Garrafa azul encontrada no Bloco 1." },
      });
      expect(validImg.isValid).toBe(true);

      const badFields = validateItemTextFields({
        title: "T".repeat(121),
        description: "Descrição normal",
        location: "Bloco 1",
      });
      expect(badFields.isValid).toBe(false);
      expect(badFields.field).toBe("title");
    });

    it("25. [Seção 9 #6 e #8] Usuário não autenticado e conta Gmail sem atribuição válida são negados em UI, pipeline e espelho de Rules", () => {
      const unauthElig = evaluateItemRegistrationEligibility({
        authUser: null,
        isGuest: true,
        userDocData: null,
      });
      expect(unauthElig.allowed).toBe(false);
      expect(unauthElig.reasonCode).toBe("UNAUTHENTICATED");

      const unauthView = evaluateRegisterViewAccess({
        isAuthLoading: false,
        isGuest: true,
        currentUser: null,
        authUser: null,
      });
      expect(unauthView.canRegister).toBe(false);
      expect(unauthView.showsGuestScreen).toBe(true);

      const gmailNoDocElig = evaluateItemRegistrationEligibility({
        authUser: { uid: "gmail-no-doc", email: "alguem@gmail.com", emailVerified: true },
        userDocData: null,
      });
      expect(gmailNoDocElig.allowed).toBe(false);
      expect(gmailNoDocElig.reasonCode).toBe("USER_DOC_MISSING_OR_INELIGIBLE");

      const plan = buildItemRegistrationWritePlan({
        item: makeBaseItem({ id: "ifpr-UNAUTH-01" }),
        authUid: "gmail-no-doc",
        actorName: "Externo",
        effectiveRole: "SERVIDOR",
      });
      const unauthMirror = evaluateLocalRulesMirrorForRegistrationBatch({
        auth: null,
        userDoc: null,
        writePlan: plan,
      });
      expect(unauthMirror.batchAllowed).toBe(false);

      const gmailNoDocMirror = evaluateLocalRulesMirrorForRegistrationBatch({
        auth: { uid: "gmail-no-doc", email: "alguem@gmail.com", email_verified: true },
        userDoc: null,
        writePlan: plan,
      });
      expect(gmailNoDocMirror.batchAllowed).toBe(false);
      expect(gmailNoDocMirror.perCollection.items.allowed).toBe(false);
      expect(gmailNoDocMirror.perCollection.item_history.allowed).toBe(false);
    });

    it("26. [Seção 9 #10] buildSanitizedItemPrivatePayload omite /item_private quando dicas/chaves forem vazias ou null e gera payload válido quando preenchidas", () => {
      expect(
        buildSanitizedItemPrivatePayload({
          itemId: "ifpr-PRIV-EMPTY-1",
          authUid: ROOT_ADMIN_UID,
          secretVerificationHint: "",
          secretVerificationKey: "   ",
        })
      ).toBeNull();

      expect(
        buildSanitizedItemPrivatePayload({
          itemId: "ifpr-PRIV-NULL-1",
          authUid: ROOT_ADMIN_UID,
          secretVerificationHint: null,
          secretVerificationKey: undefined,
        })
      ).toBeNull();

      const validPriv = buildSanitizedItemPrivatePayload({
        itemId: "ifpr-PRIV-OK-1",
        authUid: ROOT_ADMIN_UID,
        secretVerificationHint: "  Adesivo no verso  ",
        secretVerificationKey: "",
      });
      expect(validPriv).not.toBeNull();
      expect(validPriv?.itemId).toBe("ifpr-PRIV-OK-1");
      expect(validPriv?.registeredByUserId).toBe(ROOT_ADMIN_UID);
      expect(validPriv?.secretVerificationHint).toBe("Adesivo no verso");
      expect("secretVerificationKey" in (validPriv || {})).toBe(false);
    });

    it("27. [Seção 9 #11] Reprodução da divergência REGRAS.txt vs firestore.rules: negação em /item_history aborta atomicamente o batch inteiro sem gravação parcial", () => {
      const plan = buildItemRegistrationWritePlan({
        item: makeBaseItem({
          id: "ifpr-ATOMIC-DIV-01",
          secretVerificationHint: "Marca no interior",
        }),
        authUid: ROOT_ADMIN_UID,
        actorName: "Paulo Cauan",
        effectiveRole: "ADMIN",
      });

      // Com firestore.rules local completo -> todas as 3 coleções passam
      const localEval = evaluateLocalRulesMirrorForRegistrationBatch({
        auth: { uid: ROOT_ADMIN_UID, email: ROOT_ADMIN_EMAIL, email_verified: true },
        userDoc: { role: "ADMIN", approvalStatus: "APROVADO", status: "active", active: null },
        writePlan: plan,
        rulesProfile: "LOCAL_FIRESTORE_RULES",
      });
      expect(localEval.batchAllowed).toBe(true);
      expect(localEval.perCollection.items.allowed).toBe(true);
      expect(localEval.perCollection.item_history.allowed).toBe(true);
      expect(localEval.perCollection.item_private.allowed).toBe(true);

      // Com regras legadas estilo REGRAS.txt (sem match /item_history e /item_private) ->
      // /items passa, mas /item_history e /item_private caem no default deny e abortam TODO o batch!
      const legacyEval = evaluateLocalRulesMirrorForRegistrationBatch({
        auth: { uid: ROOT_ADMIN_UID, email: ROOT_ADMIN_EMAIL, email_verified: true },
        userDoc: { role: "ADMIN", approvalStatus: "APROVADO", status: "active", active: null },
        writePlan: plan,
        rulesProfile: "LEGACY_WITHOUT_HISTORY_OR_PRIVATE",
      });
      expect(legacyEval.perCollection.items.allowed).toBe(true);
      expect(legacyEval.perCollection.item_history.allowed).toBe(false);
      expect(legacyEval.perCollection.item_history.failedChecks).toContain(
        "default_deny_catch_all_missing_item_history_match"
      );
      expect(legacyEval.perCollection.item_private.allowed).toBe(false);
      expect(legacyEval.batchAllowed).toBe(false);

      // Simulação de store atômico: falha no batch resulta em ZERO documentos persistidos
      const committedItems = new Map<string, any>();
      const committedHistory = new Map<string, any>();
      const committedPrivate = new Map<string, any>();
      if (legacyEval.batchAllowed) {
        committedItems.set(plan.itemId, plan.itemPayload);
        committedHistory.set(plan.historyEntryId, plan.historyPayload);
        if (plan.privatePayload) committedPrivate.set(plan.itemId, plan.privatePayload);
      }
      expect(committedItems.size).toBe(0);
      expect(committedHistory.size).toBe(0);
      expect(committedPrivate.size).toBe(0);
    });
  });

  // =========================================================================
  // F. Etapa 31 — Validação Integrada do Frontend, IndexedDB, Fila Offline,
  //    Reconexão, Retentativa Manual, Catálogo e Ausência de Duplicidade/Falso Sucesso
  // =========================================================================
  describe("F. [Etapa 31] Fluxo Integrado Online/Offline, IndexedDB, Reconexão, Retentativa Manual e Catálogo", () => {
    it("28. indexedDB.ts preserva ERRO_PERMANENTE apenas em sync_queue_store sem vazar para items_store (catálogo offline)", () => {
      const idbSrc = fs.readFileSync(path.resolve(process.cwd(), "src/lib/indexedDB.ts"), "utf8");
      expect(idbSrc).toContain('if (queueEntry.status !== "ERRO_PERMANENTE")');
      expect(idbSrc).toContain("saveSingleItemIndexedDB(queueEntry.payload)");
      // Deduplicação determinística por itemId na fila IndexedDB (id = queue-${resolvedItemId})
      expect(idbSrc).toContain("const entryId = existing?.id || `queue-${resolvedItemId}`;");
    });

    it("29. Ciclo completo offline -> reconexão -> repetição de sincronização -> reconciliação sem duplicidade e sem falso sucesso", () => {
      const ctxSrc = fs.readFileSync(path.resolve(process.cwd(), "src/context/AppContext.tsx"), "utf8");
      const addIdx = ctxSrc.indexOf("const addItem = async");
      const addEnd = ctxSrc.indexOf("const updateItemStatus", addIdx);
      const addBlock = ctxSrc.slice(addIdx, addEnd);

      // 1. Cadastro online só retorna CONFIRMED após await createBatch.commit() concluir sem exceção
      const commitPos = addBlock.indexOf("await createBatch.commit();");
      const confirmedPos = addBlock.indexOf('persistenceStatus: "CONFIRMED"');
      expect(commitPos).toBeGreaterThan(-1);
      expect(confirmedPos).toBeGreaterThan(commitPos);

      // 2. Cadastro offline grava em IndexedDB com status PENDENTE e retorna PENDING_SYNC (nunca CONFIRMED)
      const offlineIdx = addBlock.indexOf("if (isCurrentlyOffline)");
      const offlineEnd = addBlock.indexOf("// Online: Save item to Firestore", offlineIdx);
      const offlineBlock = addBlock.slice(offlineIdx, offlineEnd);
      expect(offlineBlock).toContain('status: "PENDENTE"');
      expect(offlineBlock).toContain('persistenceStatus: "PENDING_SYNC"');
      expect(offlineBlock).not.toContain('persistenceStatus: "CONFIRMED"');

      // 3. Reconexão (evento online) e trava anti-concorrência (isSyncingRef) impedem sincronizações duplicadas
      expect(ctxSrc).toContain('window.addEventListener("online", handleOnline)');
      expect(ctxSrc).toContain("if (isSyncingRef.current) {");

      // 4. Deduplicação na fila durante syncOfflineQueue + verificação remota anti-sobrescrita/anti-duplicidade
      const syncStart = ctxSrc.indexOf("const syncOfflineQueue = async");
      const syncEnd = ctxSrc.indexOf("const handleSwMessage", syncStart);
      const syncBlock = ctxSrc.slice(syncStart, syncEnd);
      expect(syncBlock).toContain("const processedItemIds = new Set<string>();");
      expect(syncBlock).toContain("evaluateExistingRemoteItem(");
      expect(syncBlock).toContain('remoteEvaluation.action === "CONFIRM_ALREADY_SYNCED"');
      expect(syncBlock).toContain('remoteEvaluation.action === "CONFLICT_STOP"');

      // 5. Falha de autorização (permission-denied) vs falha temporária de rede (unavailable)
      const permErr = classifySyncError({ code: "permission-denied", message: "Missing or insufficient permissions" }, 1200);
      expect(permErr.category).toBe("AUTHORIZATION");
      expect(permErr.isPermanent).toBe(true);

      const netErr = classifySyncError({ code: "unavailable", message: "Failed to get document because the client is offline" }, 1200);
      expect(netErr.category).toBe("TEMPORARY");
      expect(netErr.isPermanent).toBe(false);

      // 6. Retentativa manual de item único reabilita entrada na fila e chama syncOfflineQueue(false, true)
      const retryIdx = ctxSrc.indexOf("const retryUploadTask = async");
      const retryEnd = ctxSrc.indexOf("const syncOfflineQueue = async", retryIdx);
      const retryBlock = ctxSrc.slice(retryIdx, retryEnd);
      expect(retryBlock).toContain('status: "PENDENTE"');
      expect(retryBlock).toContain("syncOfflineQueue(false, true)");
    });
  });
});

