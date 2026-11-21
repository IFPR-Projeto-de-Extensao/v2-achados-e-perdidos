/**
 * LOCALIZA+ v1.10.13 — Etapa 19 / Etapa 21
 * Suite de testes automatizados reproduziveis (100% em memoria, zero conexao Firebase)
 * para `scripts/audit/audit-users-readonly.mjs`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  AUDITOR_METADATA,
  CLASSIFICATIONS,
  DEFAULT_ROOT_ADMIN_UID,
  GLOBAL_VERDICTS,
  auditUsersCollection,
  compareTimestampsNs,
  computeGlobalVerdict,
  evaluateUserDocument,
  inspectDeadlineField,
  maskUid,
} from "./audit-users-readonly.mjs";

const REF_TS = Object.freeze({ seconds: 1_750_000_000, nanoseconds: 0 });
const FICTITIOUS_ROOT_UID = "root-ficticio-uid-teste-001";
const FICTITIOUS_ROOT_EMAIL = "root.ficticio.teste@example.invalid";

/** Cria um objeto simulando fielmente um Timestamp nativo do Firestore (com metodos toDate/toMillis). */
function makeNativeTs(seconds, nanoseconds = 0) {
  return {
    seconds,
    nanoseconds,
    toMillis() {
      return seconds * 1000 + Math.floor(nanoseconds / 1_000_000);
    },
    toDate() {
      return new Date(seconds * 1000 + Math.floor(nanoseconds / 1_000_000));
    },
  };
}

function makeBaseUser(overrides = {}) {
  return {
    id: "user-default",
    email: "usuario.teste@estudantes.ifpr.edu.br",
    role: "ALUNO",
    approvalStatus: "APROVADO",
    status: "active",
    active: true,
    ...overrides,
  };
}

test("Metadados identificam implementacao independente da Etapa 19 sem expor UID bruto", () => {
  assert.equal(AUDITOR_METADATA.implementationOrigin, "ETAPA_19_INDEPENDENT_IMPLEMENTATION");
  assert.equal(AUDITOR_METADATA.projectId, "gen-lang-client-0490390966");
  assert.equal(AUDITOR_METADATA.databaseId, "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1");
  assert.equal(AUDITOR_METADATA.rulesCommit, "dab549f777c00981028eb5515f65d3a1d7058538");
  assert.equal(
    AUDITOR_METADATA.rulesSha256Expected,
    "2f2a2ffc8c471d7fe97b5d1d2bb3c2a3ca27d39947be64449ad13a532c851f9e"
  );
  assert.equal(AUDITOR_METADATA.rootAdminMaskedUid, maskUid(DEFAULT_ROOT_ADMIN_UID));
  assert.equal(JSON.stringify(AUDITOR_METADATA).includes(DEFAULT_ROOT_ADMIN_UID), false);
});

test("Root Admin: documento limpo, bloqueado com token Auth confirmado (divergencia Rules vs Frontend/Serverless) e sem role/aprovacao", () => {
  const cleanRoot = evaluateUserDocument(
    DEFAULT_ROOT_ADMIN_UID,
    makeBaseUser({ id: DEFAULT_ROOT_ADMIN_UID, role: "ADMIN", approvalStatus: "APROVADO" }),
    REF_TS
  );
  assert.equal(cleanRoot.classification, CLASSIFICATIONS.DOCUMENTO_COMPATIVEL);
  assert.equal(cleanRoot.rulesLayer.isRootIdentityDoc, true);
  assert.equal(cleanRoot.rulesLayer.canCreateCatalogItem, true);
  assert.equal(cleanRoot.frontendLayer.canAddItemInFrontend, true);
  assert.equal(cleanRoot.frontendLayer.canAttachListenersInFrontend, true);
  assert.equal(cleanRoot.frontendLayer.canOperateFormalReturnInFrontend, true);

  const confirmedRootOpts = {
    rootAdminUid: FICTITIOUS_ROOT_UID,
    rootAdminEmail: FICTITIOUS_ROOT_EMAIL,
    authContext: { uid: FICTITIOUS_ROOT_UID, email: FICTITIOUS_ROOT_EMAIL, emailVerified: true },
  };

  const deactivatedRoot = evaluateUserDocument(
    FICTITIOUS_ROOT_UID,
    makeBaseUser({ id: FICTITIOUS_ROOT_UID, email: FICTITIOUS_ROOT_EMAIL, role: "ADMIN", approvalStatus: "APROVADO", active: false }),
    REF_TS,
    confirmedRootOpts
  );
  assert.equal(deactivatedRoot.classification, CLASSIFICATIONS.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE);
  assert.equal(deactivatedRoot.rulesLayer.isStandingActive, false);
  assert.equal(deactivatedRoot.rulesLayer.canCreateCatalogItem, true);
  assert.equal(deactivatedRoot.rulesLayer.rootBypassActiveInRules, true);
  assert.equal(deactivatedRoot.frontendLayer.canAddItemInFrontend, false);
  assert.equal(deactivatedRoot.frontendLayer.canAttachListenersInFrontend, false);
  assert.equal(deactivatedRoot.frontendLayer.canOperateFormalReturnInFrontend, false);
  assert.equal(deactivatedRoot.frontendLayer.syncOfflineQueueSkipsStatusCheck, true);
  assert.equal(deactivatedRoot.frontendLayer.blockedInServerlessHelper, true);

  const bannedRoot = evaluateUserDocument(
    FICTITIOUS_ROOT_UID,
    makeBaseUser({ id: FICTITIOUS_ROOT_UID, email: FICTITIOUS_ROOT_EMAIL, role: "ADMIN", status: "banned" }),
    REF_TS,
    confirmedRootOpts
  );
  assert.equal(bannedRoot.classification, CLASSIFICATIONS.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE);
  assert.equal(bannedRoot.frontendLayer.canAddItemInFrontend, false);

  const unapprovedRoleRoot = evaluateUserDocument(
    DEFAULT_ROOT_ADMIN_UID,
    makeBaseUser({ id: DEFAULT_ROOT_ADMIN_UID, role: "ALUNO", approvalStatus: "PENDENTE" }),
    REF_TS
  );
  assert.equal(unapprovedRoleRoot.classification, CLASSIFICATIONS.DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO);
  assert.ok(unapprovedRoleRoot.reasons.includes("ROOT_ADMIN_DEPENDS_ON_AUTH_IDENTITY_BYPASS"));
});

test("Papeis nao-root: ADMIN (aprovado/pendente/sem approvalStatus), SERVIDOR (aprovado/pendente), ALUNO e INTRUSO", () => {
  const adminOk = evaluateUserDocument("adm-1", makeBaseUser({ id: "adm-1", role: "ADMIN", approvalStatus: "APROVADO" }), REF_TS);
  assert.equal(adminOk.classification, CLASSIFICATIONS.DOCUMENTO_COMPATIVEL);
  assert.equal(adminOk.rulesLayer.isAdminByDoc, true);
  assert.equal(adminOk.rulesLayer.canCreateCatalogItem, true);

  const adminPending = evaluateUserDocument("adm-2", makeBaseUser({ id: "adm-2", role: "ADMIN", approvalStatus: "PENDENTE" }), REF_TS);
  assert.equal(adminPending.classification, CLASSIFICATIONS.DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO);
  assert.equal(adminPending.rulesLayer.isAdminByDoc, false);
  assert.equal(adminPending.rulesLayer.isMemberByDoc, false);

  const adminNoApprovalDoc = makeBaseUser({ id: "adm-3", role: "ADMIN" });
  delete adminNoApprovalDoc.approvalStatus;
  const adminNoApproval = evaluateUserDocument("adm-3", adminNoApprovalDoc, REF_TS);
  assert.equal(adminNoApproval.classification, CLASSIFICATIONS.DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO);

  const servidorOk = evaluateUserDocument("srv-1", makeBaseUser({ id: "srv-1", role: "SERVIDOR", approvalStatus: "APROVADO" }), REF_TS);
  assert.equal(servidorOk.classification, CLASSIFICATIONS.DOCUMENTO_COMPATIVEL);
  assert.equal(servidorOk.rulesLayer.isStaffByDoc, true);

  const servidorPending = evaluateUserDocument("srv-2", makeBaseUser({ id: "srv-2", role: "SERVIDOR", approvalStatus: "PENDENTE" }), REF_TS);
  assert.equal(servidorPending.classification, CLASSIFICATIONS.DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO);
  assert.equal(servidorPending.rulesLayer.isMemberByDoc, true);
  assert.equal(servidorPending.rulesLayer.isStaffByDoc, false);

  const alunoOk = evaluateUserDocument("alu-1", makeBaseUser({ id: "alu-1", role: "ALUNO" }), REF_TS);
  assert.equal(alunoOk.classification, CLASSIFICATIONS.DOCUMENTO_COMPATIVEL);
  assert.equal(alunoOk.rulesLayer.isMemberByDoc, true);
  assert.equal(alunoOk.rulesLayer.isStaffByDoc, false);

  const intruso = evaluateUserDocument("int-1", makeBaseUser({ id: "int-1", role: "INTRUSO" }), REF_TS);
  assert.equal(intruso.classification, CLASSIFICATIONS.DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO);
  assert.equal(intruso.rulesLayer.isStandingActive, true);
  assert.equal(intruso.rulesLayer.isUserDocActiveData, false);
  assert.equal(intruso.rulesLayer.intrusoSelfPromotionPossible, true);
  assert.equal(intruso.frontendLayer.canAttachListenersInFrontend, false);
});

test("Suspensao indefinida (status suspended sem suspendedUntil) NUNCA e BLOQUEIO_INTENCIONAL_COMPATIVEL", () => {
  const pureIndefinite = evaluateUserDocument("susp-1", makeBaseUser({ id: "susp-1", status: "suspended" }), REF_TS);
  assert.equal(pureIndefinite.rulesLayer.statusClause, false);
  assert.equal(pureIndefinite.rulesLayer.isStandingActive, false);
  assert.equal(pureIndefinite.frontendLayer.isAccountBlocked, true);
  assert.notEqual(pureIndefinite.classification, CLASSIFICATIONS.BLOQUEIO_INTENCIONAL_COMPATIVEL);
  assert.equal(pureIndefinite.classification, CLASSIFICATIONS.INCONSISTENCIA_DE_DADOS);

  const indefiniteWithFutureBlock = evaluateUserDocument(
    "susp-2",
    makeBaseUser({ id: "susp-2", status: "suspended", blockExpiresAt: makeNativeTs(REF_TS.seconds + 3600) }),
    REF_TS
  );
  assert.equal(indefiniteWithFutureBlock.rulesLayer.statusClause, false);
  assert.equal(indefiniteWithFutureBlock.rulesLayer.isStandingActive, false);
  assert.notEqual(indefiniteWithFutureBlock.classification, CLASSIFICATIONS.BLOQUEIO_INTENCIONAL_COMPATIVEL);
  assert.equal(indefiniteWithFutureBlock.classification, CLASSIFICATIONS.INCONSISTENCIA_DE_DADOS);

  const indefiniteWithExpiredBlock = evaluateUserDocument(
    "susp-3",
    makeBaseUser({ id: "susp-3", status: "suspended", blockExpiresAt: makeNativeTs(REF_TS.seconds - 3600) }),
    REF_TS
  );
  assert.equal(indefiniteWithExpiredBlock.rulesLayer.statusClause, false);
  assert.equal(indefiniteWithExpiredBlock.rulesLayer.isStandingActive, false);
  assert.equal(indefiniteWithExpiredBlock.classification, CLASSIFICATIONS.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE);
});

test("Suspensao com prazo (futuro, expirado, null) e blockExpiresAt (ausente, null, futuro, expirado)", () => {
  const futureSusp = evaluateUserDocument(
    "t-1",
    makeBaseUser({ id: "t-1", status: "suspended", suspendedUntil: makeNativeTs(REF_TS.seconds + 60) }),
    REF_TS
  );
  assert.equal(futureSusp.classification, CLASSIFICATIONS.BLOQUEIO_INTENCIONAL_COMPATIVEL);
  assert.equal(futureSusp.rulesLayer.isStandingActive, false);
  assert.equal(futureSusp.frontendLayer.isAccountBlocked, true);

  const expiredSusp = evaluateUserDocument(
    "t-2",
    makeBaseUser({ id: "t-2", status: "suspended", suspendedUntil: makeNativeTs(REF_TS.seconds - 60) }),
    REF_TS
  );
  assert.equal(expiredSusp.classification, CLASSIFICATIONS.DOCUMENTO_COMPATIVEL);
  assert.equal(expiredSusp.rulesLayer.isStandingActive, true);
  assert.equal(expiredSusp.frontendLayer.isAccountBlocked, false);
  assert.equal(expiredSusp.frontendLayer.isExpiredSuspension, true);

  const nullSusp = evaluateUserDocument(
    "t-3",
    makeBaseUser({ id: "t-3", status: "suspended", suspendedUntil: null }),
    REF_TS
  );
  assert.equal(nullSusp.classification, CLASSIFICATIONS.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE);
  assert.equal(nullSusp.rulesLayer.suspendedUntilClause, false);

  const blockAbsent = evaluateUserDocument("b-1", makeBaseUser({ id: "b-1" }), REF_TS);
  assert.equal(blockAbsent.classification, CLASSIFICATIONS.DOCUMENTO_COMPATIVEL);

  const blockNull = evaluateUserDocument("b-2", makeBaseUser({ id: "b-2", blockExpiresAt: null }), REF_TS);
  assert.equal(blockNull.classification, CLASSIFICATIONS.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE);

  const blockFuture = evaluateUserDocument(
    "b-3",
    makeBaseUser({ id: "b-3", blockExpiresAt: makeNativeTs(REF_TS.seconds + 120) }),
    REF_TS
  );
  assert.equal(blockFuture.classification, CLASSIFICATIONS.BLOQUEIO_INTENCIONAL_COMPATIVEL);

  const blockExpired = evaluateUserDocument(
    "b-4",
    makeBaseUser({ id: "b-4", blockExpiresAt: makeNativeTs(REF_TS.seconds - 120) }),
    REF_TS
  );
  assert.equal(blockExpired.classification, CLASSIFICATIONS.DOCUMENTO_COMPATIVEL);

  const bannedClean = evaluateUserDocument("ban-1", makeBaseUser({ id: "ban-1", status: "banned" }), REF_TS);
  assert.equal(bannedClean.classification, CLASSIFICATIONS.BLOQUEIO_INTENCIONAL_COMPATIVEL);
});

test("Precisao de nanossegundos (=, -1ns, +1ns mesmo ms, +1ms) e Epoch 0 / pre-1970", () => {
  assert.equal(compareTimestampsNs({ seconds: 10, nanoseconds: 5 }, { seconds: 10, nanoseconds: 5 }), 0);
  assert.equal(compareTimestampsNs({ seconds: 10, nanoseconds: 4 }, { seconds: 10, nanoseconds: 5 }), -1);
  assert.equal(compareTimestampsNs({ seconds: 10, nanoseconds: 6 }, { seconds: 10, nanoseconds: 5 }), 1);

  const exactEq = evaluateUserDocument(
    "ns-eq",
    makeBaseUser({ id: "ns-eq", suspendedUntil: makeNativeTs(REF_TS.seconds, 0) }),
    REF_TS
  );
  assert.equal(exactEq.classification, CLASSIFICATIONS.DOCUMENTO_COMPATIVEL);

  const minus1Ns = evaluateUserDocument(
    "ns-m1",
    makeBaseUser({ id: "ns-m1", suspendedUntil: makeNativeTs(REF_TS.seconds - 1, 999_999_999) }),
    REF_TS
  );
  assert.equal(minus1Ns.classification, CLASSIFICATIONS.DOCUMENTO_COMPATIVEL);

  const plus1NsSameMs = evaluateUserDocument(
    "ns-p1",
    makeBaseUser({ id: "ns-p1", suspendedUntil: makeNativeTs(REF_TS.seconds, 1) }),
    REF_TS
  );
  assert.equal(plus1NsSameMs.rulesLayer.isStandingActive, false);
  assert.equal(plus1NsSameMs.frontendLayer.isAccountBlocked, false);
  assert.equal(plus1NsSameMs.classification, CLASSIFICATIONS.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE);
  assert.ok(plus1NsSameMs.reasons.includes("SUB_MILLISECOND_RULES_VS_FRONTEND_DIVERGENCE"));

  const plus1Ms = evaluateUserDocument(
    "ns-p1ms",
    makeBaseUser({ id: "ns-p1ms", suspendedUntil: makeNativeTs(REF_TS.seconds, 1_000_000) }),
    REF_TS
  );
  assert.equal(plus1Ms.rulesLayer.isStandingActive, false);
  assert.equal(plus1Ms.frontendLayer.isAccountBlocked, true);
  assert.equal(plus1Ms.classification, CLASSIFICATIONS.BLOQUEIO_INTENCIONAL_COMPATIVEL);

  const epochZero = evaluateUserDocument(
    "ep-0",
    makeBaseUser({ id: "ep-0", blockExpiresAt: makeNativeTs(0, 0) }),
    REF_TS
  );
  assert.equal(epochZero.rulesLayer.isStandingActive, true);
  assert.equal(epochZero.frontendLayer.isAccountBlocked, true);
  assert.equal(epochZero.classification, CLASSIFICATIONS.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE);
  assert.ok(epochZero.reasons.includes("EPOCH_ZERO_OR_PRE_1970_FRONTEND_REJECTION"));

  const pre1970 = evaluateUserDocument(
    "ep-neg",
    makeBaseUser({ id: "ep-neg", suspendedUntil: makeNativeTs(-86_400, 0) }),
    REF_TS
  );
  assert.equal(pre1970.rulesLayer.isStandingActive, true);
  assert.equal(pre1970.frontendLayer.isAccountBlocked, true);
  assert.equal(pre1970.classification, CLASSIFICATIONS.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE);
});

test("Tipos temporais invalidos (ISO string, string vazia, numero, boolean, array, mapa plano, Date)", () => {
  const invalidValues = [
    ["iso", "2025-01-01T00:00:00Z"],
    ["empty", ""],
    ["text", "invalido"],
    ["number", 1_750_000_000_000],
    ["boolean", true],
    ["array", [1, 2]],
    ["date", new Date(REF_TS.seconds * 1000 - 1000)],
  ];
  for (const [label, val] of invalidValues) {
    const res = evaluateUserDocument(`inv-${label}`, makeBaseUser({ id: `inv-${label}`, blockExpiresAt: val }), REF_TS);
    assert.equal(res.rulesLayer.isStandingActive, false, `Rules deveria bloquear ${label}`);
    assert.equal(res.frontendLayer.isAccountBlocked, true, `Frontend deveria bloquear ${label}`);
    assert.equal(res.classification, CLASSIFICATIONS.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE, `Classificacao incorreta para ${label}`);
  }

  const plainMap = evaluateUserDocument(
    "inv-map",
    makeBaseUser({ id: "inv-map", blockExpiresAt: { seconds: REF_TS.seconds - 100, nanoseconds: 0 } }),
    REF_TS
  );
  assert.equal(plainMap.rulesLayer.isStandingActive, false);
  assert.equal(plainMap.frontendLayer.isAccountBlocked, false);
  assert.equal(plainMap.classification, CLASSIFICATIONS.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE);
  assert.ok(plainMap.reasons.includes("PLAIN_MAP_ACCEPTED_BY_FRONTEND_REJECTED_BY_RULES"));
});

test("Campos status (ausente, null, vazio, inactive, desconhecido), active (ausente, null, false) e id !== docId", () => {
  const missingStatusDoc = makeBaseUser({ id: "st-absent" });
  delete missingStatusDoc.status;
  const missingStatus = evaluateUserDocument("st-absent", missingStatusDoc, REF_TS);
  assert.equal(missingStatus.rulesLayer.isStandingActive, true);
  assert.equal(missingStatus.frontendLayer.isAccountBlocked, false);
  assert.equal(missingStatus.classification, CLASSIFICATIONS.INCONSISTENCIA_DE_DADOS);

  for (const badStatus of [null, "", "inactive", "unknown_legacy"]) {
    const res = evaluateUserDocument(`st-${String(badStatus)}`, makeBaseUser({ id: `st-${String(badStatus)}`, status: badStatus }), REF_TS);
    assert.equal(res.rulesLayer.statusClause, false);
    assert.equal(res.classification, CLASSIFICATIONS.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE);
  }

  const activeAbsentDoc = makeBaseUser({ id: "act-absent" });
  delete activeAbsentDoc.active;
  assert.equal(evaluateUserDocument("act-absent", activeAbsentDoc, REF_TS).classification, CLASSIFICATIONS.DOCUMENTO_COMPATIVEL);

  const activeNull = evaluateUserDocument("act-null", makeBaseUser({ id: "act-null", active: null }), REF_TS);
  assert.equal(activeNull.rulesLayer.activeClause, true);
  assert.equal(activeNull.classification, CLASSIFICATIONS.INCONSISTENCIA_DE_DADOS);

  const activeFalse = evaluateUserDocument("act-false", makeBaseUser({ id: "act-false", active: false }), REF_TS);
  assert.equal(activeFalse.rulesLayer.activeClause, false);
  assert.equal(activeFalse.classification, CLASSIFICATIONS.BLOQUEIO_INTENCIONAL_COMPATIVEL);

  const idMismatch = evaluateUserDocument("doc-real-id", makeBaseUser({ id: "outro-id" }), REF_TS);
  assert.equal(idMismatch.classification, CLASSIFICATIONS.INCONSISTENCIA_DE_DADOS);
  assert.equal(idMismatch.dataIntegrityLayer.idIntegrity, "MISMATCH");
  assert.equal(idMismatch.rulesLayer.usersUpdateBranches.branch2.docPreconditionsMet, true);
  assert.equal(idMismatch.rulesLayer.usersUpdateBranches.branch2.dependsOnIncomingPayload, true);
  assert.equal(idMismatch.rulesLayer.usersUpdateBranches.branch2.allowed, null);
});

test("Paginacao por cursor e agregador global A, B, C e D (vazia, erro, incompleta, cursor estagnado, duplicado, inesperada)", async () => {
  const allDocs = [
    { id: "u-01", data: makeBaseUser({ id: "u-01" }) },
    { id: "u-02", data: makeBaseUser({ id: "u-02", status: "banned" }) },
    { id: "u-03", data: makeBaseUser({ id: "u-03", role: "SERVIDOR", approvalStatus: "APROVADO" }) },
  ];
  const repA = await auditUsersCollection({
    pageSize: 2,
    referenceTime: REF_TS,
    async fetchPage({ startAfterDocId, pageSize }) {
      const startIdx = startAfterDocId ? allDocs.findIndex((d) => d.id === startAfterDocId) + 1 : 0;
      const slice = allDocs.slice(startIdx, startIdx + pageSize);
      return { docs: slice, hasMore: startIdx + pageSize < allDocs.length };
    },
  });
  assert.equal(repA.verdictCode, "A");
  assert.equal(repA.verdict, GLOBAL_VERDICTS.A);
  assert.equal(repA.pagination.pagesFetched, 2);
  assert.equal(repA.pagination.totalRead, 3);
  assert.equal(repA.pagination.completed, true);

  const repB = await auditUsersCollection({
    referenceTime: REF_TS,
    async fetchPage() {
      return { docs: [{ id: "u-b", data: makeBaseUser({ id: "u-b", role: "ADMIN", approvalStatus: "PENDENTE" }) }], hasMore: false };
    },
  });
  assert.equal(repB.verdictCode, "B");

  const repC = await auditUsersCollection({
    referenceTime: REF_TS,
    async fetchPage() {
      return { docs: [{ id: "u-c", data: makeBaseUser({ id: "u-c", blockExpiresAt: null }) }], hasMore: false };
    },
  });
  assert.equal(repC.verdictCode, "C");

  const repEmpty = await auditUsersCollection({
    referenceTime: REF_TS,
    async fetchPage() {
      return { docs: [], hasMore: false };
    },
  });
  assert.equal(repEmpty.verdictCode, "D");
  assert.ok(repEmpty.inconclusiveReasons.includes("EMPTY_COLLECTION"));

  const repErr = await auditUsersCollection({
    referenceTime: REF_TS,
    async fetchPage() {
      const err = new Error("Simulated read error");
      err.code = "permission-denied";
      throw err;
    },
  });
  assert.equal(repErr.verdictCode, "D");
  assert.ok(repErr.inconclusiveReasons.includes("PAGE_READ_ERROR"));

  const repIncomplete = await auditUsersCollection({
    pageSize: 1,
    maxPages: 1,
    referenceTime: REF_TS,
    async fetchPage({ startAfterDocId }) {
      return { docs: [{ id: startAfterDocId ? "u-2" : "u-1", data: makeBaseUser({ id: "u-1" }) }], hasMore: true };
    },
  });
  assert.equal(repIncomplete.verdictCode, "D");
  assert.ok(repIncomplete.inconclusiveReasons.includes("INCOMPLETE_PAGINATION"));

  const repStagnant = await auditUsersCollection({
    pageSize: 1,
    referenceTime: REF_TS,
    async fetchPage({ startAfterDocId }) {
      if (!startAfterDocId) return { docs: [{ id: "u-10", data: makeBaseUser({ id: "u-10" }) }], hasMore: true };
      return { docs: [{ id: "u-05", data: makeBaseUser({ id: "u-05" }) }], hasMore: true };
    },
  });
  assert.equal(repStagnant.verdictCode, "D");
  assert.ok(repStagnant.inconclusiveReasons.includes("STAGNANT_CURSOR_DETECTED"));

  const repDup = await auditUsersCollection({
    pageSize: 1,
    referenceTime: REF_TS,
    async fetchPage() {
      return { docs: [{ id: "u-dup", data: makeBaseUser({ id: "u-dup" }) }], hasMore: true };
    },
  });
  assert.equal(repDup.verdictCode, "D");
  assert.ok(repDup.inconclusiveReasons.includes("DUPLICATE_DOCUMENT_IDS_DETECTED"));

  const unexpectedVerdict = computeGlobalVerdict({
    completed: true,
    readError: null,
    stagnantCursorDetected: false,
    duplicateDocIdsCount: 0,
    results: [{ classification: "CLASSIFICACAO_INVENTADA" }],
  });
  assert.equal(unexpectedVerdict.verdictCode, "D");
  assert.equal(unexpectedVerdict.unexpectedClassificationsCount, 1);
  assert.ok(unexpectedVerdict.inconclusiveReasons.includes("UNEXPECTED_CLASSIFICATION_DETECTED"));
});

test("Zero vazamento de PII, UID bruto ou caminhos locais na saida serializada", async () => {
  const sensitiveUid = "uid-sensivel-teste-998877";
  const secretEmail = "pessoa.sensivel@ifpr.edu.br";
  const secretName = "Fulano Confidencial Silva";
  const secretStatus = "status_com_pii_secreta";

  const report = await auditUsersCollection({
    referenceTime: REF_TS,
    async fetchPage() {
      return {
        docs: [
          {
            id: sensitiveUid,
            data: {
              id: sensitiveUid,
              email: secretEmail,
              name: secretName,
              displayName: secretName,
              phone: "41999990000",
              matricula: "2026999999",
              statusReason: `Contato: ${secretEmail}`,
              statusUpdatedBy: DEFAULT_ROOT_ADMIN_UID,
              role: "PAPEL_COM_PII",
              status: secretStatus,
            },
          },
        ],
        hasMore: false,
      };
    },
  });

  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes(sensitiveUid), false);
  assert.equal(serialized.includes(DEFAULT_ROOT_ADMIN_UID), false);
  assert.equal(serialized.includes(secretEmail), false);
  assert.equal(serialized.includes(secretName), false);
  assert.equal(serialized.includes(secretStatus), false);
  assert.equal(serialized.includes("PAPEL_COM_PII"), false);
  assert.equal(serialized.includes("41999990000"), false);
  assert.equal(serialized.includes("2026999999"), false);
  assert.equal(serialized.includes(process.cwd()), false);
  assert.equal(serialized.includes("/app/applet"), false);
});

test("Verificacao estatica: zero imports estaticos do Firebase e zero metodos de escrita no auditor", () => {
  const sourcePath = resolve("scripts/audit/audit-users-readonly.mjs");
  const source = readFileSync(sourcePath, "utf8");

  assert.equal(/^\s*import\s+[^;]*["']firebase/m.test(source), false, "Nao pode haver import estatico de Firebase");
  assert.equal(
    /\.(set|delete|create|batch|runTransaction|bulkWriter|recursiveDelete|setCustomUserClaims|updateUser|deleteUser)\s*\(/.test(source),
    false,
    "Nenhum metodo de escrita do Firestore/Auth pode existir no auditor"
  );

  const updateMatches = source.match(/[^\n]*\.update\s*\([^\n]*/g) ?? [];
  for (const line of updateMatches) {
    assert.ok(line.includes('createHash("sha256").update('), `Uso inesperado de .update(): ${line}`);
  }

  const addMatches = source.match(/[^\n]*\.add\s*\([^\n]*/g) ?? [];
  for (const line of addMatches) {
    assert.ok(line.includes("seenDocIds.add("), `Uso inesperado de .add(): ${line}`);
  }
});

test("Etapa 21 Correcao 1: Identidade Root Admin em Rules vs Frontend (token valido, ausente, e-mail divergente/nao verificado, UID diferente, fallback doc.email)", () => {
  const rootOpts = { rootAdminUid: FICTITIOUS_ROOT_UID, rootAdminEmail: FICTITIOUS_ROOT_EMAIL };

  // 1. Token Auth valido e confirmado com doc.email ausente -> Rules ainda confirma isRootIdentity()
  const docWithoutEmail = makeBaseUser({ id: FICTITIOUS_ROOT_UID, role: "ADMIN", approvalStatus: "APROVADO" });
  delete docWithoutEmail.email;
  const confirmedMissingDocEmail = evaluateUserDocument(FICTITIOUS_ROOT_UID, docWithoutEmail, REF_TS, {
    ...rootOpts,
    authContext: { uid: FICTITIOUS_ROOT_UID, email: FICTITIOUS_ROOT_EMAIL.toUpperCase(), emailVerified: true },
  });
  assert.equal(confirmedMissingDocEmail.rulesLayer.rootIdentity.isConfirmedInRules, true);
  assert.equal(confirmedMissingDocEmail.rulesLayer.rootIdentity.status, "CONFIRMED");
  assert.equal(confirmedMissingDocEmail.rulesLayer.rootIdentity.docEmailState, "ABSENT");
  assert.equal(confirmedMissingDocEmail.rulesLayer.isAdminEffective, true);
  assert.equal(confirmedMissingDocEmail.frontendLayer.rootIdentity.isVerifiedRootAdminAuthUserConfirmed, true);
  assert.equal(confirmedMissingDocEmail.frontendLayer.rootIdentity.usedDocEmailFallback, false);

  // 2. Fallback de doc.email no frontend (`canOperateFormalReturn`) vs ausencia de fallback em Rules e `addItem`
  const fallbackCase = evaluateUserDocument(
    FICTITIOUS_ROOT_UID,
    makeBaseUser({ id: FICTITIOUS_ROOT_UID, email: FICTITIOUS_ROOT_EMAIL, role: "ALUNO" }),
    REF_TS,
    {
      ...rootOpts,
      authContext: { uid: FICTITIOUS_ROOT_UID, email: "", emailVerified: true },
    }
  );
  assert.equal(fallbackCase.rulesLayer.rootIdentity.isConfirmedInRules, false);
  assert.equal(fallbackCase.rulesLayer.rootIdentity.status, "EMAIL_MISMATCH");
  assert.equal(fallbackCase.rulesLayer.canCreateCatalogItem, false);
  assert.equal(fallbackCase.frontendLayer.rootIdentity.isVerifiedRootAdminAuthUserConfirmed, false);
  assert.equal(fallbackCase.frontendLayer.rootIdentity.isVerifiedRootAdminIdentityConfirmed, true);
  assert.equal(fallbackCase.frontendLayer.rootIdentity.usedDocEmailFallback, true);
  assert.equal(fallbackCase.frontendLayer.canAddItemInFrontend, false);
  assert.equal(fallbackCase.frontendLayer.canOperateFormalReturnInFrontend, true);
  assert.equal(fallbackCase.rulesVsFrontendComparison.rootIdentityFallbackDiverges, true);
  assert.equal(fallbackCase.rulesVsFrontendComparison.formalReturnDiverges, true);
  assert.equal(fallbackCase.rulesVsFrontendComparison.hasOperationalDivergence, true);

  // 3. UID correto + e-mail divergente no token + doc desativado -> sem bypass Root, bloqueio intencional compativel
  const emailMismatch = evaluateUserDocument(
    FICTITIOUS_ROOT_UID,
    makeBaseUser({ id: FICTITIOUS_ROOT_UID, email: FICTITIOUS_ROOT_EMAIL, role: "ADMIN", active: false }),
    REF_TS,
    {
      ...rootOpts,
      authContext: { uid: FICTITIOUS_ROOT_UID, email: "outro.email@example.invalid", emailVerified: true },
    }
  );
  assert.equal(emailMismatch.rulesLayer.rootIdentity.status, "EMAIL_MISMATCH");
  assert.equal(emailMismatch.rulesLayer.rootIdentity.isConfirmedInRules, false);
  assert.equal(emailMismatch.rulesLayer.rootBypassActiveInRules, false);
  assert.equal(emailMismatch.rulesLayer.canCreateCatalogItem, false);
  assert.equal(emailMismatch.classification, CLASSIFICATIONS.BLOQUEIO_INTENCIONAL_COMPATIVEL);

  // 4. UID correto + e-mail Root no token, mas emailVerified === false -> isRootIdentity() falso
  const unverifiedEmail = evaluateUserDocument(
    FICTITIOUS_ROOT_UID,
    makeBaseUser({ id: FICTITIOUS_ROOT_UID, email: FICTITIOUS_ROOT_EMAIL, role: "ADMIN", active: false }),
    REF_TS,
    {
      ...rootOpts,
      authContext: { uid: FICTITIOUS_ROOT_UID, email: FICTITIOUS_ROOT_EMAIL, emailVerified: false },
    }
  );
  assert.equal(unverifiedEmail.rulesLayer.rootIdentity.status, "EMAIL_NOT_VERIFIED");
  assert.equal(unverifiedEmail.rulesLayer.rootIdentity.rulesRootIdentityMatchOnly, true);
  assert.equal(unverifiedEmail.rulesLayer.rootIdentity.isConfirmedInRules, false);
  assert.equal(unverifiedEmail.rulesLayer.rootBypassActiveInRules, false);
  assert.equal(unverifiedEmail.classification, CLASSIFICATIONS.BLOQUEIO_INTENCIONAL_COMPATIVEL);

  // 5. UID diferente mesmo com e-mail Root verificado -> NOT_ROOT
  const differentUid = evaluateUserDocument(
    "outro-uid-nao-root",
    makeBaseUser({ id: "outro-uid-nao-root", email: FICTITIOUS_ROOT_EMAIL, role: "ADMIN", active: false }),
    REF_TS,
    {
      ...rootOpts,
      authContext: { uid: "outro-uid-nao-root", email: FICTITIOUS_ROOT_EMAIL, emailVerified: true },
    }
  );
  assert.equal(differentUid.rulesLayer.rootIdentity.status, "NOT_ROOT");
  assert.equal(differentUid.rulesLayer.rootIdentity.docUidMatchesRoot, false);
  assert.equal(differentUid.rulesLayer.rootIdentity.isConfirmedInRules, false);
  assert.equal(differentUid.classification, CLASSIFICATIONS.BLOQUEIO_INTENCIONAL_COMPATIVEL);

  // 6. Contexto Auth indisponivel para UID Root com doc bloqueado -> DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO (nao afirma bypass)
  const unavailableAuth = evaluateUserDocument(
    FICTITIOUS_ROOT_UID,
    makeBaseUser({ id: FICTITIOUS_ROOT_UID, email: FICTITIOUS_ROOT_EMAIL, role: "ADMIN", active: false }),
    REF_TS,
    rootOpts
  );
  assert.equal(unavailableAuth.rulesLayer.rootIdentity.status, "AUTH_CONTEXT_UNAVAILABLE");
  assert.equal(unavailableAuth.rulesLayer.rootIdentity.authContextAvailable, false);
  assert.equal(unavailableAuth.rulesLayer.rootIdentity.isConfirmedInRules, false);
  assert.equal(
    unavailableAuth.rulesLayer.rootIdentity.rootAuthorizationStatus,
    CLASSIFICATIONS.DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO
  );
  assert.equal(unavailableAuth.rulesLayer.rootBypassActiveInRules, false);
  assert.equal(unavailableAuth.rulesLayer.rootBypassPotentialIfAuthValid, true);
  assert.equal(unavailableAuth.rulesLayer.canCreateCatalogItem, false);
  assert.equal(unavailableAuth.classification, CLASSIFICATIONS.DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO);
  assert.ok(unavailableAuth.reasons.includes("ROOT_AUTHORIZATION_DEPENDS_ON_UNAVAILABLE_AUTH_TOKEN"));

  // 7. Zero vazamento de UID ou e-mail ficticio na saida serializada
  const serialized = JSON.stringify([confirmedMissingDocEmail, fallbackCase, emailMismatch, unverifiedEmail, unavailableAuth]);
  assert.equal(serialized.includes(FICTITIOUS_ROOT_UID), false);
  assert.equal(serialized.includes(FICTITIOUS_ROOT_EMAIL), false);
});

test("Etapa 21 Correcao 2: Separacao estrita entre camada Rules e camada Frontend (mapa plano expirado e divergencia +1ns)", () => {
  for (const role of ["ADMIN", "SERVIDOR"]) {
    // Cenario A: Mapa plano expirado em blockExpiresAt (Rules rejeita mapa plano; Frontend aceita e considera expirado)
    const plainMapExpired = evaluateUserDocument(
      `sep-map-${role.toLowerCase()}`,
      makeBaseUser({
        id: `sep-map-${role.toLowerCase()}`,
        role,
        approvalStatus: "APROVADO",
        blockExpiresAt: { seconds: REF_TS.seconds - 100, nanoseconds: 0 },
      }),
      REF_TS
    );
    assert.equal(plainMapExpired.rulesLayer.isStandingActive, false);
    assert.equal(plainMapExpired.rulesLayer.canCreateCatalogItem, false);
    assert.equal(plainMapExpired.frontendLayer.isAccountBlocked, false);
    assert.equal(plainMapExpired.frontendLayer.isPersistedDocEligibleForItemWrite, true);
    assert.equal(plainMapExpired.frontendLayer.canAddItemInFrontend, true);
    assert.equal(plainMapExpired.frontendLayer.canOperateFormalReturnInFrontend, true);
    assert.equal(plainMapExpired.rulesVsFrontendComparison.standingDiverges, true);
    assert.equal(plainMapExpired.rulesVsFrontendComparison.itemCreationDiverges, true);
    assert.equal(plainMapExpired.rulesVsFrontendComparison.formalReturnDiverges, true);
    assert.equal(plainMapExpired.rulesVsFrontendComparison.hasOperationalDivergence, true);
    assert.equal(plainMapExpired.classification, CLASSIFICATIONS.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE);

    // Cenario B: Divergencia de nanossegundos (+1ns no mesmo milissegundo em suspendedUntil)
    const subMsDivergence = evaluateUserDocument(
      `sep-ns-${role.toLowerCase()}`,
      makeBaseUser({
        id: `sep-ns-${role.toLowerCase()}`,
        role,
        approvalStatus: "APROVADO",
        suspendedUntil: makeNativeTs(REF_TS.seconds, 1),
      }),
      REF_TS
    );
    assert.equal(subMsDivergence.rulesLayer.isStandingActive, false);
    assert.equal(subMsDivergence.rulesLayer.canCreateCatalogItem, false);
    assert.equal(subMsDivergence.frontendLayer.isAccountBlocked, false);
    assert.equal(subMsDivergence.frontendLayer.isPersistedDocEligibleForItemWrite, true);
    assert.equal(subMsDivergence.frontendLayer.canAddItemInFrontend, true);
    assert.equal(subMsDivergence.frontendLayer.canOperateFormalReturnInFrontend, true);
    assert.equal(subMsDivergence.rulesVsFrontendComparison.standingDiverges, true);
    assert.equal(subMsDivergence.rulesVsFrontendComparison.itemCreationDiverges, true);
    assert.equal(subMsDivergence.rulesVsFrontendComparison.formalReturnDiverges, true);
    assert.equal(subMsDivergence.rulesVsFrontendComparison.hasOperationalDivergence, true);
    assert.equal(subMsDivergence.classification, CLASSIFICATIONS.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE);
  }
});

test("Etapa 21 Correcao 3: Modelagem fiel dos Branches 1, 2 e 3 de update em /users", () => {
  // --- Branch 1 (INTRUSO): 6 estados de `admin` e validacao de `existing().email` ---
  const adminCases = [
    ["absent", undefined, true],
    ["false", false, true],
    ["true", true, false],
    ["null", null, false],
    ["string_false", "false", false],
    ["number_zero", 0, false],
  ];
  for (const [label, adminVal, expectedDocPrecond] of adminCases) {
    const doc = makeBaseUser({ id: `b1-${label}`, role: "INTRUSO", email: "aluno.b1@estudantes.ifpr.edu.br" });
    if (adminVal !== undefined) doc.admin = adminVal;
    const res = evaluateUserDocument(`b1-${label}`, doc, REF_TS);
    assert.equal(
      res.rulesLayer.usersUpdateBranches.branch1.docPreconditionsMet,
      expectedDocPrecond,
      `Branch 1 admin=${label}`
    );
    assert.equal(res.rulesLayer.intrusoSelfPromotionPossible, expectedDocPrecond, `Legacy alias admin=${label}`);
    if (expectedDocPrecond) {
      assert.equal(res.rulesLayer.usersUpdateBranches.branch1.dependsOnIncomingPayload, true);
      assert.equal(res.rulesLayer.usersUpdateBranches.branch1.allowed, null);
    } else {
      assert.equal(res.rulesLayer.usersUpdateBranches.branch1.allowed, false);
    }
  }

  // Branch 1: existing().email ausente ou nao-string -> falso
  for (const badEmail of [undefined, null, 123, ""]) {
    const doc = makeBaseUser({ id: "b1-bademail", role: "INTRUSO" });
    if (badEmail === undefined) delete doc.email;
    else doc.email = badEmail;
    const res = evaluateUserDocument("b1-bademail", doc, REF_TS);
    assert.equal(res.rulesLayer.usersUpdateBranches.branch1.docPreconditionsMet, false);
    assert.equal(res.rulesLayer.usersUpdateBranches.branch1.allowed, false);
  }

  // Branch 1: com incomingDoc + authContext validos (promocao ALUNO institucional) -> allowed true vs email nao institucional -> false
  const intrusoDoc = makeBaseUser({ id: "b1-promo", role: "INTRUSO", email: "discente@estudantes.ifpr.edu.br", admin: false });
  const b1AllowedRes = evaluateUserDocument("b1-promo", intrusoDoc, REF_TS, {
    authContext: { uid: "b1-promo", email: "discente@estudantes.ifpr.edu.br", emailVerified: true },
    incomingDoc: {
      id: "b1-promo",
      email: "discente@estudantes.ifpr.edu.br",
      role: "ALUNO",
      approvalStatus: "APROVADO",
      status: "active",
      active: true,
      admin: false,
    },
  });
  assert.equal(b1AllowedRes.rulesLayer.usersUpdateBranches.branch1.allowed, true);

  const b1ExternalEmailRes = evaluateUserDocument(
    "b1-ext",
    makeBaseUser({ id: "b1-ext", role: "INTRUSO", email: "externo@example.invalid" }),
    REF_TS,
    {
      authContext: { uid: "b1-ext", email: "externo@example.invalid", emailVerified: true },
      incomingDoc: {
        id: "b1-ext",
        email: "externo@example.invalid",
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
      },
    }
  );
  assert.equal(b1ExternalEmailRes.rulesLayer.usersUpdateBranches.branch1.allowed, false);

  // --- Branch 2 (autoatualizacao de perfil): incoming().id == userId, sem exigir existing().id == userId ---
  const b2BaseDoc = makeBaseUser({ id: "id-legado-divergente", role: "ALUNO", email: "aluno.b2@estudantes.ifpr.edu.br" });
  const b2NoIncoming = evaluateUserDocument("doc-b2", b2BaseDoc, REF_TS);
  assert.equal(b2NoIncoming.rulesLayer.usersUpdateBranches.branch2.docPreconditionsMet, true);
  assert.equal(b2NoIncoming.rulesLayer.usersUpdateBranches.branch2.dependsOnIncomingPayload, true);
  assert.equal(b2NoIncoming.rulesLayer.usersUpdateBranches.branch2.allowed, null);

  const b2IncomingMatchesId = evaluateUserDocument("doc-b2", b2BaseDoc, REF_TS, {
    authContext: { uid: "doc-b2", email: "aluno.b2@estudantes.ifpr.edu.br", emailVerified: true },
    incomingDoc: { ...b2BaseDoc, id: "doc-b2", name: "Nome Atualizado" },
  });
  assert.equal(b2IncomingMatchesId.rulesLayer.usersUpdateBranches.branch2.allowed, true);

  const b2IncomingWrongId = evaluateUserDocument("doc-b2", b2BaseDoc, REF_TS, {
    authContext: { uid: "doc-b2", email: "aluno.b2@estudantes.ifpr.edu.br", emailVerified: true },
    incomingDoc: { ...b2BaseDoc, id: "ainda-errado", name: "Nome Atualizado" },
  });
  assert.equal(b2IncomingWrongId.rulesLayer.usersUpdateBranches.branch2.allowed, false);

  const b2ChangedControlField = evaluateUserDocument("doc-b2", b2BaseDoc, REF_TS, {
    authContext: { uid: "doc-b2", email: "aluno.b2@estudantes.ifpr.edu.br", emailVerified: true },
    incomingDoc: { ...b2BaseDoc, id: "doc-b2", reputationScore: 999 },
  });
  assert.equal(b2ChangedControlField.rulesLayer.usersUpdateBranches.branch2.allowed, false);

  const b2ChangedEmail = evaluateUserDocument("doc-b2", b2BaseDoc, REF_TS, {
    authContext: { uid: "doc-b2", email: "aluno.b2@estudantes.ifpr.edu.br", emailVerified: true },
    incomingDoc: { ...b2BaseDoc, id: "doc-b2", email: "outro@estudantes.ifpr.edu.br" },
  });
  assert.equal(b2ChangedEmail.rulesLayer.usersUpdateBranches.branch2.allowed, false);

  // --- Branch 3 (inicializacao legada de `status: 'active'` ausente) ---
  const b3AlunoLegacy = makeBaseUser({ id: "b3-aluno", role: "ALUNO", email: "legado@estudantes.ifpr.edu.br" });
  delete b3AlunoLegacy.status;

  // Sem incomingDoc -> depende do payload
  const b3Pending = evaluateUserDocument("b3-aluno", b3AlunoLegacy, REF_TS);
  assert.equal(b3Pending.rulesLayer.usersUpdateBranches.branch3.docPreconditionsMet, true);
  assert.equal(b3Pending.rulesLayer.usersUpdateBranches.branch3.dependsOnIncomingPayload, true);
  assert.equal(b3Pending.rulesLayer.usersUpdateBranches.branch3.allowed, null);

  // ALUNO adicionando apenas status: "active"
  const b3AlunoOk = evaluateUserDocument("b3-aluno", b3AlunoLegacy, REF_TS, {
    authContext: { uid: "b3-aluno", email: "legado@estudantes.ifpr.edu.br", emailVerified: true },
    incomingDoc: { ...b3AlunoLegacy, status: "active" },
  });
  assert.equal(b3AlunoOk.rulesLayer.usersUpdateBranches.branch3.affectedKeysHasOnlyStatus, true);
  assert.equal(b3AlunoOk.rulesLayer.usersUpdateBranches.branch3.allowed, true);

  // SERVIDOR adicionando apenas status: "active"
  const b3ServidorLegacy = makeBaseUser({ id: "b3-srv", role: "SERVIDOR", email: "servidor.legado@ifpr.edu.br" });
  delete b3ServidorLegacy.status;
  const b3ServidorOk = evaluateUserDocument("b3-srv", b3ServidorLegacy, REF_TS, {
    authContext: { uid: "b3-srv", email: "servidor.legado@ifpr.edu.br", emailVerified: true },
    incomingDoc: { ...b3ServidorLegacy, status: "active" },
  });
  assert.equal(b3ServidorOk.rulesLayer.usersUpdateBranches.branch3.allowed, true);

  // ADMIN e INTRUSO sem status -> NAO elegiveis ao Branch 3
  for (const disallowedRole of ["ADMIN", "INTRUSO"]) {
    const legacyDoc = makeBaseUser({ id: `b3-${disallowedRole}`, role: disallowedRole, email: "x@ifpr.edu.br" });
    delete legacyDoc.status;
    const res = evaluateUserDocument(`b3-${disallowedRole}`, legacyDoc, REF_TS, {
      authContext: { uid: `b3-${disallowedRole}`, email: "x@ifpr.edu.br", emailVerified: true },
      incomingDoc: { ...legacyDoc, status: "active" },
    });
    assert.equal(res.rulesLayer.usersUpdateBranches.branch3.docPreconditionsMet, false);
    assert.equal(res.rulesLayer.usersUpdateBranches.branch3.allowed, false);
  }

  // Campo extra no payload -> affectedKeys().hasOnly(['status']) falha
  const b3ExtraField = evaluateUserDocument("b3-aluno", b3AlunoLegacy, REF_TS, {
    authContext: { uid: "b3-aluno", email: "legado@estudantes.ifpr.edu.br", emailVerified: true },
    incomingDoc: { ...b3AlunoLegacy, status: "active", name: "Alteracao indevida" },
  });
  assert.equal(b3ExtraField.rulesLayer.usersUpdateBranches.branch3.affectedKeysHasOnlyStatus, false);
  assert.equal(b3ExtraField.rulesLayer.usersUpdateBranches.branch3.allowed, false);

  // Status incompativel ('suspended' ou 'banned') -> falha
  for (const badStatus of ["suspended", "banned"]) {
    const res = evaluateUserDocument("b3-aluno", b3AlunoLegacy, REF_TS, {
      authContext: { uid: "b3-aluno", email: "legado@estudantes.ifpr.edu.br", emailVerified: true },
      incomingDoc: { ...b3AlunoLegacy, status: badStatus },
    });
    assert.equal(res.rulesLayer.usersUpdateBranches.branch3.allowed, false);
  }
});

test("Etapa 21 Correcao 4: Matriz de classificacao de mapa plano { seconds, nanoseconds }", () => {
  // 1. Segundos positivos + nanossegundos validos (expirado e futuro) -> ACCEPTED_BY_FRONTEND_REJECTED_BY_RULES
  const validExpiredMap = evaluateUserDocument(
    "pm-exp",
    makeBaseUser({ id: "pm-exp", blockExpiresAt: { seconds: REF_TS.seconds - 10, nanoseconds: 0 } }),
    REF_TS
  );
  assert.equal(validExpiredMap.structuralSummary.blockExpiresAtInterpretation, "ACCEPTED_BY_FRONTEND_REJECTED_BY_RULES");
  assert.equal(validExpiredMap.frontendLayer.isAccountBlocked, false);
  assert.equal(validExpiredMap.rulesLayer.isStandingActive, false);
  assert.ok(validExpiredMap.reasons.includes("PLAIN_MAP_ACCEPTED_BY_FRONTEND_REJECTED_BY_RULES"));

  const validFutureMap = evaluateUserDocument(
    "pm-fut",
    makeBaseUser({ id: "pm-fut", blockExpiresAt: { seconds: REF_TS.seconds + 3600, nanoseconds: 500_000_000 } }),
    REF_TS
  );
  assert.equal(validFutureMap.structuralSummary.blockExpiresAtInterpretation, "ACCEPTED_BY_FRONTEND_REJECTED_BY_RULES");
  assert.equal(validFutureMap.frontendLayer.isAccountBlocked, true);
  assert.equal(validFutureMap.rulesLayer.isStandingActive, false);
  assert.ok(validFutureMap.reasons.includes("PLAIN_MAP_ACCEPTED_BY_FRONTEND_REJECTED_BY_RULES"));

  // 2. seconds: 0 -> REJECTED_BY_BOTH_RULES_AND_FRONTEND (NUNCA PLAIN_MAP_ACCEPTED_BY_FRONTEND_REJECTED_BY_RULES)
  const zeroSecEval = inspectDeadlineField({ blockExpiresAt: { seconds: 0, nanoseconds: 0 } }, "blockExpiresAt", REF_TS);
  assert.equal(zeroSecEval.isPlainMap, true);
  assert.equal(zeroSecEval.frontendValid, false);
  assert.equal(zeroSecEval.isTemporallyInvalid, true);
  assert.equal(zeroSecEval.interpretationState, "REJECTED_BY_BOTH_RULES_AND_FRONTEND");

  const zeroSecDoc = evaluateUserDocument(
    "pm-zero",
    makeBaseUser({ id: "pm-zero", blockExpiresAt: { seconds: 0, nanoseconds: 0 } }),
    REF_TS
  );
  assert.equal(zeroSecDoc.structuralSummary.blockExpiresAtInterpretation, "REJECTED_BY_BOTH_RULES_AND_FRONTEND");
  assert.equal(zeroSecDoc.frontendLayer.isAccountBlocked, true);
  assert.equal(zeroSecDoc.rulesLayer.isStandingActive, false);
  assert.ok(zeroSecDoc.reasons.includes("PLAIN_MAP_REJECTED_BY_RULES_AND_FRONTEND"));
  assert.equal(zeroSecDoc.reasons.includes("PLAIN_MAP_ACCEPTED_BY_FRONTEND_REJECTED_BY_RULES"), false);

  // 3. Segundos negativos -> REJECTED_BY_BOTH_RULES_AND_FRONTEND
  const negSecDoc = evaluateUserDocument(
    "pm-neg-sec",
    makeBaseUser({ id: "pm-neg-sec", suspendedUntil: { seconds: -86_400, nanoseconds: 0 } }),
    REF_TS
  );
  assert.equal(negSecDoc.structuralSummary.suspendedUntilInterpretation, "REJECTED_BY_BOTH_RULES_AND_FRONTEND");
  assert.ok(negSecDoc.reasons.includes("PLAIN_MAP_REJECTED_BY_RULES_AND_FRONTEND"));
  assert.equal(negSecDoc.reasons.includes("PLAIN_MAP_ACCEPTED_BY_FRONTEND_REJECTED_BY_RULES"), false);

  // 4. Nanossegundos negativos (com seconds positivo -> frontend aceita mas marca faixa invalida; com seconds 0 -> rejeitado por ambos)
  const negNanosPosSec = evaluateUserDocument(
    "pm-neg-ns-pos",
    makeBaseUser({ id: "pm-neg-ns-pos", blockExpiresAt: { seconds: REF_TS.seconds, nanoseconds: -1 } }),
    REF_TS
  );
  assert.equal(negNanosPosSec.structuralSummary.blockExpiresAtInterpretation, "ACCEPTED_BY_FRONTEND_REJECTED_BY_RULES");
  assert.ok(negNanosPosSec.reasons.includes("PLAIN_MAP_ACCEPTED_BY_FRONTEND_REJECTED_BY_RULES"));
  assert.ok(negNanosPosSec.reasons.includes("PLAIN_MAP_INVALID_NANOSECONDS_RANGE"));

  const negNanosZeroSec = evaluateUserDocument(
    "pm-neg-ns-zero",
    makeBaseUser({ id: "pm-neg-ns-zero", blockExpiresAt: { seconds: 0, nanoseconds: -1 } }),
    REF_TS
  );
  assert.equal(negNanosZeroSec.structuralSummary.blockExpiresAtInterpretation, "REJECTED_BY_BOTH_RULES_AND_FRONTEND");
  assert.ok(negNanosZeroSec.reasons.includes("PLAIN_MAP_REJECTED_BY_RULES_AND_FRONTEND"));
  assert.ok(negNanosZeroSec.reasons.includes("PLAIN_MAP_INVALID_NANOSECONDS_RANGE"));

  // 5. Nanossegundos >= 1_000_000_000 -> hasInvalidNanosecondsRange true, isTemporallyInvalid true
  const overNanosEval = inspectDeadlineField(
    { blockExpiresAt: { seconds: REF_TS.seconds, nanoseconds: 1_000_000_000 } },
    "blockExpiresAt",
    REF_TS
  );
  assert.equal(overNanosEval.hasInvalidNanosecondsRange, true);
  assert.equal(overNanosEval.isTemporallyInvalid, true);
  const overNanosDoc = evaluateUserDocument(
    "pm-over-ns",
    makeBaseUser({ id: "pm-over-ns", blockExpiresAt: { seconds: REF_TS.seconds, nanoseconds: 1_000_000_000 } }),
    REF_TS
  );
  assert.ok(overNanosDoc.reasons.includes("PLAIN_MAP_INVALID_NANOSECONDS_RANGE"));

  // 6. Nanossegundos ausentes com seconds valido -> frontend aceita como 0ns, sem invalid range
  const absentNanosEval = inspectDeadlineField({ blockExpiresAt: { seconds: REF_TS.seconds - 100 } }, "blockExpiresAt", REF_TS);
  assert.equal(absentNanosEval.isPlainMap, true);
  assert.equal(absentNanosEval.frontendValid, true);
  assert.equal(absentNanosEval.hasInvalidNanosecondsRange, false);
  assert.equal(absentNanosEval.interpretationState, "ACCEPTED_BY_FRONTEND_REJECTED_BY_RULES");

  // 7. Campo de tipo incompativel dentro do mapa -> REJECTED_BY_BOTH_RULES_AND_FRONTEND
  for (const badMap of [
    { seconds: REF_TS.seconds, nanoseconds: "0" },
    { seconds: "1750000000", nanoseconds: 0 },
  ]) {
    const evalBad = inspectDeadlineField({ blockExpiresAt: badMap }, "blockExpiresAt", REF_TS);
    assert.equal(evalBad.frontendValid, false);
    assert.equal(evalBad.interpretationState, "REJECTED_BY_BOTH_RULES_AND_FRONTEND");
    const docBad = evaluateUserDocument("pm-bad-type", makeBaseUser({ id: "pm-bad-type", blockExpiresAt: badMap }), REF_TS);
    assert.equal(docBad.rulesLayer.isStandingActive, false);
    assert.equal(docBad.frontendLayer.isAccountBlocked, true);
    assert.equal(docBad.classification, CLASSIFICATIONS.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE);
  }
});
