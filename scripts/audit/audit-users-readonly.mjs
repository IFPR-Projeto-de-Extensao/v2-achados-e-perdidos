#!/usr/bin/env node
/**
 * LOCALIZA+ v1.10.13 — Etapa 19
 * Implementacao independente e persistente do auditor SOMENTE LEITURA da colecao `/users`.
 *
 * Referencias homologadas:
 * - Projeto Firebase: gen-lang-client-0490390966
 * - Banco Firestore nomeado: ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1
 * - Commit das Rules homologadas: dab549f777c00981028eb5515f65d3a1d7058538
 * - SHA-256 esperado de firestore.rules: 2f2a2ffc8c471d7fe97b5d1d2bb3c2a3ca27d39947be64449ad13a532c851f9e
 *
 * Garantias: zero imports estaticos de Firebase, zero operacoes de escrita,
 * zero exposicao de PII (e-mail, nome, UID bruto) ou caminhos absolutos nos relatorios.
 */

import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_ROOT_ADMIN_UID = "hCG5mDgK1fRaTojULzlM7dXvb7n2";
export const DEFAULT_ROOT_ADMIN_EMAIL_SHA256 = "c36e0e18015c3788d1464ffc028e8f73ff744284ea36f23774caae7b24ab153c";

export function maskUid(docId) {
  const digest = createHash("sha256").update(String(docId ?? "")).digest("hex");
  return `uid_${digest.slice(0, 12)}`;
}

function hashEmailLower(email) {
  return createHash("sha256").update(String(email).toLowerCase()).digest("hex");
}

function getExpectedRootEmailHash(options = {}) {
  if (typeof options.rootAdminEmail === "string" && options.rootAdminEmail.length > 0) {
    return hashEmailLower(options.rootAdminEmail.trim());
  }
  if (typeof options.rootAdminEmailSha256 === "string" && options.rootAdminEmailSha256.length > 0) {
    return options.rootAdminEmailSha256.toLowerCase();
  }
  return DEFAULT_ROOT_ADMIN_EMAIL_SHA256;
}

export const AUDITOR_METADATA = Object.freeze({
  implementationOrigin: "ETAPA_19_INDEPENDENT_IMPLEMENTATION",
  auditorVersion: "etapa21-v1.1.0",
  projectId: "gen-lang-client-0490390966",
  databaseId: "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1",
  collectionName: "users",
  rulesCommit: "dab549f777c00981028eb5515f65d3a1d7058538",
  rulesSha256Expected: "2f2a2ffc8c471d7fe97b5d1d2bb3c2a3ca27d39947be64449ad13a532c851f9e",
  rootAdminMaskedUid: maskUid(DEFAULT_ROOT_ADMIN_UID),
  mode: "READ_ONLY",
});

export const CLASSIFICATIONS = Object.freeze({
  DOCUMENTO_COMPATIVEL: "DOCUMENTO_COMPATIVEL",
  BLOQUEIO_INTENCIONAL_COMPATIVEL: "BLOQUEIO_INTENCIONAL_COMPATIVEL",
  INCONSISTENCIA_DE_DADOS: "INCONSISTENCIA_DE_DADOS",
  PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE: "PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE",
  DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO: "DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO",
});

export const ALLOWED_CLASSIFICATIONS = Object.freeze(new Set(Object.values(CLASSIFICATIONS)));

export const GLOBAL_VERDICTS = Object.freeze({
  A: "A_APTO_SEM_INCOMPATIBILIDADE_DETECTADA",
  B: "B_REQUER_REVISAO_OU_NORMALIZACAO_PREVIA",
  C: "C_NAO_APTO_HA_PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE",
  D: "D_AUDITORIA_INCONCLUSIVA_OU_INCOMPLETA",
});

const ALLOWLISTED_ROLES = new Set(["ALUNO", "SERVIDOR", "ADMIN", "INTRUSO"]);
const ALLOWLISTED_APPROVALS = new Set(["APROVADO", "PENDENTE", "REJEITADO"]);
const ALLOWLISTED_STATUSES = new Set(["active", "suspended", "banned", "inactive", ""]);

function hasPresentField(obj, key) {
  return obj !== null && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined;
}

export function normalizeReferenceTime(refTime = new Date()) {
  if (refTime instanceof Date) {
    const ms = refTime.getTime();
    if (!Number.isFinite(ms)) throw new TypeError("Invalid Date supplied as referenceTime");
    const seconds = Math.floor(ms / 1000);
    return { seconds, nanoseconds: (ms - seconds * 1000) * 1_000_000 };
  }
  if (
    refTime &&
    typeof refTime === "object" &&
    Number.isInteger(refTime.seconds) &&
    Number.isInteger(refTime.nanoseconds) &&
    refTime.nanoseconds >= 0 &&
    refTime.nanoseconds < 1_000_000_000
  ) {
    return { seconds: refTime.seconds, nanoseconds: refTime.nanoseconds };
  }
  throw new TypeError("referenceTime must be a Date or { seconds: int, nanoseconds: int(0..999999999) }");
}

export function compareTimestampsNs(a, b) {
  if (a.seconds !== b.seconds) return a.seconds < b.seconds ? -1 : 1;
  if (a.nanoseconds !== b.nanoseconds) return a.nanoseconds < b.nanoseconds ? -1 : 1;
  return 0;
}

export function isNativeFirestoreTimestamp(val) {
  if (!val || typeof val !== "object" || Array.isArray(val) || val instanceof Date) return false;
  if (
    !Number.isInteger(val.seconds) ||
    !Number.isInteger(val.nanoseconds) ||
    val.nanoseconds < 0 ||
    val.nanoseconds >= 1_000_000_000
  ) {
    return false;
  }
  return typeof val.toDate === "function" && typeof val.toMillis === "function";
}

export function isPlainTimestampMap(val) {
  if (!val || typeof val !== "object" || Array.isArray(val) || val instanceof Date) return false;
  if (isNativeFirestoreTimestamp(val)) return false;
  const hasSec = typeof val.seconds === "number" && Number.isFinite(val.seconds);
  const hasUnderSec = typeof val._seconds === "number" && Number.isFinite(val._seconds);
  if (!hasSec && !hasUnderSec) return false;
  const rawNanos = hasSec ? val.nanoseconds : val._nanoseconds;
  return rawNanos === undefined || (typeof rawNanos === "number" && Number.isFinite(rawNanos));
}

export function extractFrontendTimestampMs(val) {
  if (!val || typeof val !== "object" || Array.isArray(val) || val instanceof Date) return null;
  try {
    if (typeof val.toMillis === "function") {
      const ms = val.toMillis();
      return typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? ms : null;
    }
    if (typeof val.toDate === "function") {
      const d = val.toDate();
      if (d instanceof Date) {
        const ms = d.getTime();
        return Number.isFinite(ms) && ms > 0 ? ms : null;
      }
      return null;
    }
    const hasSec = typeof val.seconds === "number" && Number.isFinite(val.seconds);
    const hasUnderSec = typeof val._seconds === "number" && Number.isFinite(val._seconds);
    if (hasSec || hasUnderSec) {
      const seconds = hasSec ? val.seconds : val._seconds;
      const rawNanos = hasSec ? val.nanoseconds : val._nanoseconds;
      if (rawNanos !== undefined && (typeof rawNanos !== "number" || !Number.isFinite(rawNanos))) return null;
      const ms = seconds * 1000 + Math.floor((rawNanos ?? 0) / 1_000_000);
      return Number.isFinite(ms) && ms > 0 ? ms : null;
    }
  } catch {
    return null;
  }
  return null;
}

function makeDeadlineResult(overrides) {
  return {
    present: false,
    valueKind: "absent",
    rulesValidTimestamp: false,
    rulesExpired: false,
    rulesBlocks: false,
    frontendValid: false,
    frontendActive: false,
    frontendExpired: false,
    frontendInvalid: false,
    isEpochZeroOrPre1970: false,
    isPlainMap: false,
    hasInvalidNanosecondsRange: false,
    isTemporallyInvalid: false,
    interpretationState: "ABSENT",
    hasSubMillisecondDivergence: false,
    ...overrides,
  };
}

export function inspectDeadlineField(doc, fieldName, refTs) {
  if (!hasPresentField(doc, fieldName)) return makeDeadlineResult();
  const refNowMs = refTs.seconds * 1000 + Math.floor(refTs.nanoseconds / 1_000_000);
  const val = doc[fieldName];

  if (val === null) return makeDeadlineResult({ present: true, valueKind: "null", rulesBlocks: true, frontendInvalid: true, isTemporallyInvalid: true, interpretationState: "REJECTED_BY_BOTH_RULES_AND_FRONTEND" });
  if (typeof val === "boolean") return makeDeadlineResult({ present: true, valueKind: "boolean", rulesBlocks: true, frontendInvalid: true, isTemporallyInvalid: true, interpretationState: "REJECTED_BY_BOTH_RULES_AND_FRONTEND" });
  if (typeof val === "number") return makeDeadlineResult({ present: true, valueKind: "number", rulesBlocks: true, frontendInvalid: true, isTemporallyInvalid: true, interpretationState: "REJECTED_BY_BOTH_RULES_AND_FRONTEND" });
  if (Array.isArray(val)) return makeDeadlineResult({ present: true, valueKind: "array", rulesBlocks: true, frontendInvalid: true, isTemporallyInvalid: true, interpretationState: "REJECTED_BY_BOTH_RULES_AND_FRONTEND" });
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "") return makeDeadlineResult({ present: true, valueKind: "empty_string", rulesBlocks: true, frontendInvalid: true, isTemporallyInvalid: true, interpretationState: "REJECTED_BY_BOTH_RULES_AND_FRONTEND" });
    const looksIso = /^\d{4}-\d{2}-\d{2}/.test(trimmed) || /^\d{1,2}[/-]\d{1,2}[/-]\d{4}/.test(trimmed) || !Number.isNaN(Date.parse(trimmed));
    return makeDeadlineResult({ present: true, valueKind: looksIso ? "iso_string" : "invalid_string", rulesBlocks: true, frontendInvalid: true, isTemporallyInvalid: true, interpretationState: "REJECTED_BY_BOTH_RULES_AND_FRONTEND" });
  }

  if (isNativeFirestoreTimestamp(val)) {
    const rulesExpired = compareTimestampsNs(refTs, val) >= 0;
    const rulesBlocks = !rulesExpired;
    const rawMs = val.seconds * 1000 + Math.floor(val.nanoseconds / 1_000_000);
    const isEpochZeroOrPre1970 = rawMs <= 0;
    const frontendMs = extractFrontendTimestampMs(val);
    const frontendValid = frontendMs !== null;
    const frontendExpired = frontendValid && frontendMs <= refNowMs;
    const hasSubMillisecondDivergence = rulesBlocks && frontendExpired;
    const interpretationState = isEpochZeroOrPre1970
      ? "ACCEPTED_BY_RULES_REJECTED_BY_FRONTEND"
      : hasSubMillisecondDivergence
      ? "BLOCKED_BY_RULES_EXPIRED_IN_FRONTEND"
      : "ALIGNED_NATIVE_TIMESTAMP";
    return makeDeadlineResult({
      present: true,
      valueKind: "native_timestamp",
      rulesValidTimestamp: true,
      rulesExpired,
      rulesBlocks,
      frontendValid,
      frontendActive: frontendValid && frontendMs > refNowMs,
      frontendExpired,
      frontendInvalid: !frontendValid,
      isEpochZeroOrPre1970,
      isTemporallyInvalid: false,
      interpretationState,
      hasSubMillisecondDivergence,
    });
  }

  if (isPlainTimestampMap(val)) {
    const hasSec = typeof val.seconds === "number" && Number.isFinite(val.seconds);
    const seconds = hasSec ? val.seconds : val._seconds;
    const rawNanos = hasSec ? val.nanoseconds : val._nanoseconds;
    const hasInvalidNanosecondsRange =
      rawNanos !== undefined && (!Number.isInteger(rawNanos) || rawNanos < 0 || rawNanos >= 1_000_000_000);
    const rawMs = seconds * 1000 + Math.floor((rawNanos ?? 0) / 1_000_000);
    const frontendMs = extractFrontendTimestampMs(val);
    const frontendValid = frontendMs !== null;
    const isTemporallyInvalid = !Number.isInteger(seconds) || rawMs <= 0 || hasInvalidNanosecondsRange;
    return makeDeadlineResult({
      present: true,
      valueKind: "plain_map",
      rulesBlocks: true,
      frontendValid,
      frontendActive: frontendValid && frontendMs > refNowMs,
      frontendExpired: frontendValid && frontendMs <= refNowMs,
      frontendInvalid: !frontendValid,
      isPlainMap: true,
      hasInvalidNanosecondsRange,
      isTemporallyInvalid,
      interpretationState: frontendValid ? "ACCEPTED_BY_FRONTEND_REJECTED_BY_RULES" : "REJECTED_BY_BOTH_RULES_AND_FRONTEND",
    });
  }

  return makeDeadlineResult({ present: true, valueKind: "object", rulesBlocks: true, frontendInvalid: true, isTemporallyInvalid: true, interpretationState: "REJECTED_BY_BOTH_RULES_AND_FRONTEND" });
}

function isInstitutionalStudentEmailStr(email) {
  if (typeof email !== "string" || email.length === 0) return false;
  const lower = email.toLowerCase();
  return /@([a-zA-Z0-9-]+\.)*(estudantes|estudante|aluno|alunos)\.ifpr\.edu\.br$/.test(lower);
}

function isInstitutionalStaffEmailStr(email) {
  if (typeof email !== "string" || email.length === 0) return false;
  const lower = email.toLowerCase();
  return (
    /@([a-zA-Z0-9-]+\.)*ifpr\.edu\.br$/.test(lower) &&
    !/@([a-zA-Z0-9-]+\.)*(aluno|alunos|estudante|estudantes|escola)\.ifpr\.edu\.br$/.test(lower)
  );
}

function valuesDeepEqual(a, b) {
  if (a === b) return true;
  if (isNativeFirestoreTimestamp(a) && isNativeFirestoreTimestamp(b)) {
    return a.seconds === b.seconds && a.nanoseconds === b.nanoseconds;
  }
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a).filter((k) => a[k] !== undefined);
  const keysB = Object.keys(b).filter((k) => b[k] !== undefined);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => hasPresentField(b, k) && valuesDeepEqual(a[k], b[k]));
}

export function computeAffectedKeys(existingDoc, incomingDoc) {
  const keys = new Set([
    ...Object.keys(existingDoc ?? {}).filter((k) => hasPresentField(existingDoc, k)),
    ...Object.keys(incomingDoc ?? {}).filter((k) => hasPresentField(incomingDoc, k)),
  ]);
  const affected = [];
  for (const key of keys) {
    const inExt = hasPresentField(existingDoc, key);
    const inInc = hasPresentField(incomingDoc, key);
    if (inExt !== inInc || !valuesDeepEqual(existingDoc[key], incomingDoc[key])) {
      affected.push(key);
    }
  }
  return affected.sort();
}

export function areUserControlFieldsImmutable(ext, inc) {
  const roleAssignedByOk = !hasPresentField(inc, "roleAssignedBy") || (hasPresentField(ext, "roleAssignedBy") && valuesDeepEqual(inc.roleAssignedBy, ext.roleAssignedBy));
  const roleAssignedAtOk = !hasPresentField(inc, "roleAssignedAt") || (hasPresentField(ext, "roleAssignedAt") && valuesDeepEqual(inc.roleAssignedAt, ext.roleAssignedAt));
  const statusOk =
    (hasPresentField(ext, "status") && hasPresentField(inc, "status") && valuesDeepEqual(inc.status, ext.status)) ||
    (!hasPresentField(ext, "status") && (!hasPresentField(inc, "status") || inc.status === "active"));
  const suspOk =
    (hasPresentField(ext, "suspendedUntil") && hasPresentField(inc, "suspendedUntil") && valuesDeepEqual(inc.suspendedUntil, ext.suspendedUntil)) ||
    (!hasPresentField(ext, "suspendedUntil") && !hasPresentField(inc, "suspendedUntil"));
  const blockOk =
    (hasPresentField(ext, "blockExpiresAt") && hasPresentField(inc, "blockExpiresAt") && valuesDeepEqual(inc.blockExpiresAt, ext.blockExpiresAt)) ||
    (!hasPresentField(ext, "blockExpiresAt") && !hasPresentField(inc, "blockExpiresAt"));
  const repOk =
    (hasPresentField(ext, "reputationScore") && hasPresentField(inc, "reputationScore") && valuesDeepEqual(inc.reputationScore, ext.reputationScore)) ||
    (!hasPresentField(ext, "reputationScore") && (!hasPresentField(inc, "reputationScore") || inc.reputationScore === 100));
  return roleAssignedByOk && roleAssignedAtOk && statusOk && suspOk && blockOk && repOk;
}

/**
 * Avalia identidade Root Admin nas Rules (`firestore.rules:36-42, 127-134`) sem expor PII.
 * Nunca considera `docId === rootUid` suficiente para confirmar identidade Root autenticada.
 */
export function evaluateRootIdentityInRules(docId, doc, options = {}) {
  const rootUid = options.rootAdminUid ?? DEFAULT_ROOT_ADMIN_UID;
  const expectedEmailHash = getExpectedRootEmailHash(options);
  const authContext = options.authContext && typeof options.authContext === "object" ? options.authContext : null;
  const authContextAvailable = authContext !== null;

  const docUidMatchesRoot = docId === rootUid;
  let docEmailState = "NOT_APPLICABLE";
  if (docUidMatchesRoot) {
    if (!hasPresentField(doc, "email")) docEmailState = "ABSENT";
    else if (typeof doc.email !== "string") docEmailState = "NON_STRING";
    else docEmailState = hashEmailLower(doc.email.trim()) === expectedEmailHash ? "MATCHES_ROOT_EMAIL" : "DIFFERS_FROM_ROOT_EMAIL";
  }

  if (!authContextAvailable) {
    return {
      docUidMatchesRoot,
      authContextAvailable: false,
      authUidMatchesRoot: null,
      authEmailMatchesRoot: null,
      authEmailVerified: null,
      docEmailState,
      rulesRootIdentityMatchOnly: false,
      isConfirmedInRules: false,
      status: docUidMatchesRoot ? "AUTH_CONTEXT_UNAVAILABLE" : "NOT_ROOT",
      rootAuthorizationStatus: docUidMatchesRoot ? CLASSIFICATIONS.DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO : "NOT_APPLICABLE",
      rootAuthorizationDependsOnAuthToken: docUidMatchesRoot,
    };
  }

  const authUidMatchesRoot = typeof authContext.uid === "string" && authContext.uid === rootUid;
  const hasAuthEmail = typeof authContext.email === "string" && authContext.email.length > 0;
  // `firestore.rules:39-41`: `('email' in tok) && tok.email != null && tok.email.lower() == expectedRootEmail` (sem fallback em doc.email)
  const authEmailMatchesRoot = hasAuthEmail && hashEmailLower(authContext.email) === expectedEmailHash;
  const authEmailVerified = authContext.emailVerified === true;
  const rulesRootIdentityMatchOnly = authUidMatchesRoot && authEmailMatchesRoot;
  const isConfirmedInRules = rulesRootIdentityMatchOnly && authEmailVerified;

  let status;
  if (!docUidMatchesRoot && !authUidMatchesRoot) status = "NOT_ROOT";
  else if (!authUidMatchesRoot) status = "UID_MISMATCH";
  else if (!authEmailMatchesRoot) status = "EMAIL_MISMATCH";
  else if (!authEmailVerified) status = "EMAIL_NOT_VERIFIED";
  else status = "CONFIRMED";

  return {
    docUidMatchesRoot,
    authContextAvailable: true,
    authUidMatchesRoot,
    authEmailMatchesRoot,
    authEmailVerified,
    docEmailState,
    rulesRootIdentityMatchOnly,
    isConfirmedInRules,
    status,
    rootAuthorizationStatus: isConfirmedInRules ? "CONFIRMED_ROOT_IN_RULES" : status,
    rootAuthorizationDependsOnAuthToken: false,
  };
}

/**
 * Avalia as 3 branches de self-update da colecao `/users` (`firestore.rules:585-633`).
 * Nunca substitui `incoming().id == userId` por `existing().id == userId` e nunca inventa payload ausente.
 */
export function evaluateUsersSelfUpdateBranches(docId, doc, isStandingActive, options = {}) {
  const hasRole = hasPresentField(doc, "role");
  const roleVal = hasRole ? doc.role : undefined;
  const hasApproval = hasPresentField(doc, "approvalStatus");
  const hasStatus = hasPresentField(doc, "status");
  const existingEmailValid = hasPresentField(doc, "email") && typeof doc.email === "string" && doc.email.length > 0;
  // `firestore.rules:597,622`: `!('admin' in existing()) || existing().admin == false` (estrito em CEL)
  const existingAdminEligible = !hasPresentField(doc, "admin") || doc.admin === false;

  const inc = options.incomingDoc && typeof options.incomingDoc === "object" && !Array.isArray(options.incomingDoc) ? options.incomingDoc : null;
  const authContext = options.authContext && typeof options.authContext === "object" ? options.authContext : null;
  const hasIncoming = inc !== null;
  const hasAuth = authContext !== null;

  const authUidMatches = hasAuth ? authContext.uid === docId : null;
  const authEmailVerified = hasAuth ? authContext.emailVerified === true : null;
  const authEmailStr = hasAuth && typeof authContext.email === "string" ? authContext.email : null;

  const incomingIdMatchesUserId = hasIncoming ? hasPresentField(inc, "id") && inc.id === docId : null;
  const incomingEmailValid = hasIncoming ? hasPresentField(inc, "email") && typeof inc.email === "string" && inc.email.length > 0 : null;
  const incomingEmailMatchesExisting =
    hasIncoming && existingEmailValid && incomingEmailValid
      ? inc.email === doc.email || inc.email.toLowerCase() === doc.email.toLowerCase()
      : hasIncoming
      ? false
      : null;
  const incomingEmailMatchesAuthToken =
    hasIncoming && hasAuth && incomingEmailValid && authEmailStr !== null
      ? inc.email === authEmailStr || inc.email.toLowerCase() === authEmailStr.toLowerCase()
      : hasIncoming && hasAuth
      ? false
      : null;

  const baseDocPreconditionsMet = hasRole && isStandingActive && existingEmailValid;
  const baseWithIncomingOk =
    hasIncoming ? baseDocPreconditionsMet && incomingIdMatchesUserId === true && incomingEmailMatchesExisting === true : null;

  // Branch 1: Autopromocao institucional (INTRUSO -> ALUNO ou SERVIDOR) — firestore.rules:593-605
  const b1DocPreconditionsMet = baseDocPreconditionsMet && roleVal === "INTRUSO" && existingAdminEligible;
  let b1Allowed = null;
  if (!b1DocPreconditionsMet) {
    b1Allowed = false;
  } else if (hasIncoming && hasAuth) {
    const incomingAdminOk = !hasPresentField(inc, "admin") || inc.admin === false;
    const controlOk = areUserControlFieldsImmutable(doc, inc);
    const toAluno =
      inc.role === "ALUNO" &&
      authEmailVerified === true &&
      isInstitutionalStudentEmailStr(authEmailStr) &&
      hasApproval &&
      hasPresentField(inc, "approvalStatus") &&
      inc.approvalStatus === doc.approvalStatus;
    const toServidor =
      inc.role === "SERVIDOR" &&
      authEmailVerified === true &&
      isInstitutionalStaffEmailStr(authEmailStr) &&
      inc.approvalStatus === "PENDENTE";
    b1Allowed =
      authUidMatches === true &&
      baseWithIncomingOk === true &&
      incomingEmailMatchesAuthToken === true &&
      incomingAdminOk &&
      controlOk &&
      (toAluno || toServidor);
  } else if (hasIncoming && baseWithIncomingOk === false) {
    b1Allowed = false;
  }

  // Branch 2: Atualizacoes normais de perfil proprio — firestore.rules:607-615
  const b2DocPreconditionsMet = baseDocPreconditionsMet && roleVal !== "INTRUSO" && hasApproval;
  let b2Allowed = null;
  if (!b2DocPreconditionsMet) {
    b2Allowed = false;
  } else if (hasIncoming) {
    const roleUnchanged = hasPresentField(inc, "role") && inc.role === doc.role;
    const approvalUnchanged = hasPresentField(inc, "approvalStatus") && inc.approvalStatus === doc.approvalStatus;
    const adminUnchanged = !hasPresentField(inc, "admin") || (hasPresentField(doc, "admin") && inc.admin === doc.admin);
    const controlOk = areUserControlFieldsImmutable(doc, inc);
    const uidGateOk = hasAuth ? authUidMatches === true : true;
    b2Allowed = uidGateOk && baseWithIncomingOk === true && roleUnchanged && approvalUnchanged && adminUnchanged && controlOk;
  }

  // Branch 3: Inicializacao de status para perfis institucionais legados sem `status` — firestore.rules:616-630
  const b3DocPreconditionsMet =
    baseDocPreconditionsMet && (roleVal === "ALUNO" || roleVal === "SERVIDOR") && !hasStatus && existingAdminEligible;
  let b3AffectedKeys = null;
  let b3HasOnlyStatus = null;
  let b3Allowed = null;
  if (!b3DocPreconditionsMet) {
    b3Allowed = false;
  } else if (hasIncoming) {
    b3AffectedKeys = computeAffectedKeys(doc, inc);
    b3HasOnlyStatus = b3AffectedKeys.length > 0 && b3AffectedKeys.every((k) => k === "status");
    const roleUnchanged = hasPresentField(inc, "role") && inc.role === doc.role;
    const incomingAdminOk = !hasPresentField(inc, "admin") || inc.admin === false;
    const approvalUnchanged = !hasApproval || (hasPresentField(inc, "approvalStatus") && inc.approvalStatus === doc.approvalStatus);
    const statusInitActive = hasPresentField(inc, "status") && inc.status === "active";
    const payloadConditionsOk =
      baseWithIncomingOk === true && roleUnchanged && incomingAdminOk && approvalUnchanged && statusInitActive && b3HasOnlyStatus;
    if (!payloadConditionsOk) {
      b3Allowed = false;
    } else if (hasAuth) {
      const instEmailOk =
        authEmailVerified === true &&
        ((roleVal === "ALUNO" && isInstitutionalStudentEmailStr(authEmailStr)) ||
          (roleVal === "SERVIDOR" && isInstitutionalStaffEmailStr(authEmailStr)));
      b3Allowed = authUidMatches === true && incomingEmailMatchesAuthToken === true && instEmailOk;
    }
  }

  return {
    existingEmailValid,
    existingAdminEligible,
    incomingPayloadProvided: hasIncoming,
    authContextProvided: hasAuth,
    incomingIdMatchesUserId,
    incomingEmailMatchesExisting,
    branch1: {
      docPreconditionsMet: b1DocPreconditionsMet,
      dependsOnIncomingPayload: b1DocPreconditionsMet && !hasIncoming,
      dependsOnAuthContext: b1DocPreconditionsMet && !hasAuth,
      allowed: b1Allowed,
    },
    branch2: {
      docPreconditionsMet: b2DocPreconditionsMet,
      dependsOnIncomingPayload: b2DocPreconditionsMet && !hasIncoming,
      dependsOnAuthUidCheck: b2DocPreconditionsMet && !hasAuth,
      allowed: b2Allowed,
    },
    branch3: {
      docPreconditionsMet: b3DocPreconditionsMet,
      dependsOnIncomingPayload: b3DocPreconditionsMet && !hasIncoming,
      dependsOnAuthContext: b3DocPreconditionsMet && !hasAuth,
      affectedKeys: b3AffectedKeys,
      affectedKeysHasOnlyStatus: b3HasOnlyStatus,
      allowed: b3Allowed,
    },
  };
}

export function evaluateRulesLayer(docId, doc, refTs, options = {}) {
  const rootIdentity = evaluateRootIdentityInRules(docId, doc, options);
  const isRootIdentityDoc = rootIdentity.docUidMatchesRoot;

  const hasActive = hasPresentField(doc, "active");
  const activeClause = !hasActive || doc.active !== false;

  const blockEval = inspectDeadlineField(doc, "blockExpiresAt", refTs);
  const suspEval = inspectDeadlineField(doc, "suspendedUntil", refTs);
  const blockExpiresAtClause = !blockEval.present || (blockEval.rulesValidTimestamp && blockEval.rulesExpired);
  const suspendedUntilClause = !suspEval.present || (suspEval.rulesValidTimestamp && suspEval.rulesExpired);

  const hasStatus = hasPresentField(doc, "status");
  const statusVal = hasStatus ? doc.status : "active";
  const statusClause = statusVal === "active" || (statusVal === "suspended" && suspEval.present);

  const isStandingActive = activeClause && blockExpiresAtClause && suspendedUntilClause && statusClause;

  const hasRole = hasPresentField(doc, "role");
  const roleVal = hasRole ? doc.role : undefined;
  const isUserDocActiveData = (!hasRole || roleVal !== "INTRUSO") && isStandingActive;

  const hasApproval = hasPresentField(doc, "approvalStatus");
  const isApproved = hasApproval && doc.approvalStatus === "APROVADO";

  const isAdminByDoc = isUserDocActiveData && roleVal === "ADMIN" && isApproved;
  const isStaffByDoc = isUserDocActiveData && (roleVal === "ADMIN" || roleVal === "SERVIDOR") && isApproved;
  const isRecognizedRoleByDoc = roleVal === "ALUNO" || roleVal === "SERVIDOR" || (roleVal === "ADMIN" && isApproved);
  const isMemberByDoc = isUserDocActiveData && isRecognizedRoleByDoc;

  const usersUpdateBranches = evaluateUsersSelfUpdateBranches(docId, doc, isStandingActive, options);

  return {
    isRootIdentityDoc,
    rootIdentity,
    activeClause,
    blockExpiresAtClause,
    suspendedUntilClause,
    statusClause,
    isStandingActive,
    isUserDocActiveData,
    isAdminByDoc,
    isStaffByDoc,
    isMemberByDoc,
    isRecognizedRoleByDoc,
    isAdminEffective: rootIdentity.isConfirmedInRules ? true : isAdminByDoc,
    canCreateCatalogItem: rootIdentity.isConfirmedInRules ? true : isStaffByDoc,
    rootBypassActiveInRules: rootIdentity.isConfirmedInRules && (!isStandingActive || !isAdminByDoc),
    rootBypassPotentialIfAuthValid: isRootIdentityDoc && !rootIdentity.authContextAvailable && (!isStandingActive || !isAdminByDoc),
    requiresAuthEmailVerifiedCheck: true,
    requiresAuthRootEmailCheck: isRootIdentityDoc,
    intrusoSelfPromotionPossible: usersUpdateBranches.branch1.docPreconditionsMet,
    selfProfileUpdateBranch2Eligible: usersUpdateBranches.branch2.allowed !== null ? usersUpdateBranches.branch2.allowed : usersUpdateBranches.branch2.docPreconditionsMet,
    usersUpdateBranches,
    blockEval,
    suspEval,
  };
}

/**
 * Avalia exclusivamente as condicoes reais do frontend (`accountStatusUtils.ts`, `listenerGuards.ts`,
 * `devolutionAuth.ts`, `AppContext.tsx`) e helper serverless (`api/_lib/firebaseAdmin.ts`),
 * sem depender de `rulesLayer.isStandingActive` nem de `rulesLayer.isStaffByDoc`.
 */
export function evaluateFrontendLayer(docId, doc, refTs, options = {}) {
  const blockEval = inspectDeadlineField(doc, "blockExpiresAt", refTs);
  const suspEval = inspectDeadlineField(doc, "suspendedUntil", refTs);

  const rootUid = options.rootAdminUid ?? DEFAULT_ROOT_ADMIN_UID;
  const expectedEmailHash = getExpectedRootEmailHash(options);
  const authContext = options.authContext && typeof options.authContext === "object" ? options.authContext : null;
  const authContextAvailable = authContext !== null;
  const docUidMatchesRoot = docId === rootUid;

  // `src/lib/devolutionAuth.ts:13-35`:
  // - `isVerifiedRootAdminAuthUser(authInfo)` (usado em `AppContext.tsx:5251` `addItem`): NAO usa fallback de `user.email`.
  // - `isVerifiedRootAdminIdentity(user, authInfo)` (usado em `canOperateFormalReturn` e `listenerGuards`): usa fallback de `user.email` quando `authInfo.email` e vazio.
  let isVerifiedRootAdminAuthUserConfirmed = false;
  let isVerifiedRootAdminIdentityConfirmed = false;
  let usedDocEmailFallback = false;
  if (authContextAvailable && authContext.uid === rootUid && authContext.emailVerified === true) {
    const authTrimmed = typeof authContext.email === "string" ? authContext.email.trim() : "";
    const docTrimmed = typeof doc.email === "string" ? doc.email.trim() : "";
    const authMatches = authTrimmed.length > 0 && hashEmailLower(authTrimmed) === expectedEmailHash;
    const docFallbackMatches = authTrimmed.length === 0 && docTrimmed.length > 0 && hashEmailLower(docTrimmed) === expectedEmailHash;
    isVerifiedRootAdminAuthUserConfirmed = authMatches;
    isVerifiedRootAdminIdentityConfirmed = authMatches || docFallbackMatches;
    usedDocEmailFallback = !authMatches && docFallbackMatches;
  }

  const hasStatus = hasPresentField(doc, "status");
  const rawStatus = hasStatus ? doc.status : undefined;
  const isAllowedStatus =
    !hasStatus || (typeof rawStatus === "string" && (rawStatus === "active" || rawStatus === "suspended" || rawStatus === "banned"));

  const isDeactivated = doc.active === false;
  const currentStatus = hasStatus && isAllowedStatus ? rawStatus : "active";
  const hasAnyInvalidDeadline = suspEval.frontendInvalid || blockEval.frontendInvalid;
  const hasAnyActiveBlock = suspEval.frontendActive || blockEval.frontendActive;

  let resolvedStatus = "active";
  let isExpiredSuspension = false;
  let blockReasonCode = null;

  if (!isAllowedStatus) {
    resolvedStatus = "suspended";
    blockReasonCode = "INVALID_STATUS";
  } else if (currentStatus === "banned") {
    resolvedStatus = "banned";
    blockReasonCode = "BANNED";
  } else if (isDeactivated) {
    resolvedStatus = "suspended";
    blockReasonCode = "DEACTIVATED_ACTIVE_FALSE";
  } else if (hasAnyInvalidDeadline) {
    resolvedStatus = "suspended";
    blockReasonCode = "INVALID_DEADLINE_FIELD";
  } else if (hasAnyActiveBlock) {
    resolvedStatus = "suspended";
    blockReasonCode = "ACTIVE_FUTURE_DEADLINE";
  } else if (currentStatus === "suspended") {
    if (suspEval.frontendValid && suspEval.frontendExpired) {
      resolvedStatus = "active";
      isExpiredSuspension = true;
    } else {
      resolvedStatus = "suspended";
      blockReasonCode = "INDEFINITE_SUSPENSION";
    }
  }

  const isAccountBlocked = resolvedStatus !== "active";
  const roleVal = hasPresentField(doc, "role") ? doc.role : undefined;
  const isIntruso = roleVal === "INTRUSO";
  const isFrontendApprovedStaffRole =
    (roleVal === "ADMIN" || roleVal === "SERVIDOR") && hasPresentField(doc, "approvalStatus") && doc.approvalStatus === "APROVADO";

  // `AppContext.tsx:593-600`: `isPersistedDocEligibleForItemWrite` usa exclusivamente `accountStatusUtils` (sem `rulesLayer`).
  const isPersistedDocEligibleForItemWrite = !isAccountBlocked && !isDeactivated && isFrontendApprovedStaffRole;
  // `AppContext.tsx:5251-5317`: `addItem` checa `isAccountBlocked(currentUser)` inclusive para Root Admin.
  const canAddItemInFrontend = !isAccountBlocked && (isVerifiedRootAdminAuthUserConfirmed || isPersistedDocEligibleForItemWrite);
  // `listenerGuards.ts:65-70`: bloqueia se conta bloqueada, desativada ou INTRUSO.
  const canAttachListenersInFrontend = !isAccountBlocked && !isDeactivated && !isIntruso;
  // `devolutionAuth.ts:58-70`: bloqueia se conta bloqueada/desativada; aceita Root confirmado (com fallback) ou staff aprovado.
  const canOperateFormalReturnInFrontend =
    !isAccountBlocked && !isDeactivated && (isVerifiedRootAdminIdentityConfirmed || isFrontendApprovedStaffRole);

  return {
    resolvedStatus,
    isAccountBlocked,
    isExpiredSuspension,
    blockReasonCode,
    isPersistedDocEligibleForItemWrite,
    canAddItemInFrontend,
    canAttachListenersInFrontend,
    canOperateFormalReturnInFrontend,
    syncOfflineQueueSkipsStatusCheck: true,
    blockedInServerlessHelper: isAccountBlocked,
    rootIdentity: {
      docUidMatchesRoot,
      authContextAvailable,
      isVerifiedRootAdminAuthUserConfirmed,
      isVerifiedRootAdminIdentityConfirmed,
      usedDocEmailFallback,
      dependsOnAuthContext: docUidMatchesRoot && !authContextAvailable,
    },
  };
}

export function evaluateDataIntegrityLayer(docId, doc, rulesLayer) {
  const { blockEval, suspEval } = rulesLayer;
  const issues = [];
  const hasStatus = hasPresentField(doc, "status");
  const hasActive = hasPresentField(doc, "active");
  const hasId = hasPresentField(doc, "id");

  if (!hasStatus) {
    issues.push("MISSING_STATUS_FIELD");
  } else if (typeof doc.status !== "string" || (doc.status !== "active" && doc.status !== "suspended" && doc.status !== "banned")) {
    issues.push("INVALID_STATUS_VALUE");
  }
  if (hasActive && typeof doc.active !== "boolean") issues.push("NON_BOOLEAN_ACTIVE_FIELD");
  if (hasId && doc.id !== docId) issues.push("INTERNAL_ID_MISMATCH");

  if (suspEval.present && !suspEval.rulesValidTimestamp) {
    if (suspEval.isPlainMap) {
      issues.push(suspEval.frontendValid ? "SUSPENDED_UNTIL_PLAIN_MAP_ACCEPTED_BY_FRONTEND_REJECTED_BY_RULES" : "SUSPENDED_UNTIL_PLAIN_MAP_REJECTED_BY_RULES_AND_FRONTEND");
      if (suspEval.hasInvalidNanosecondsRange) issues.push("SUSPENDED_UNTIL_PLAIN_MAP_INVALID_NANOSECONDS_RANGE");
    } else {
      issues.push(`SUSPENDED_UNTIL_INVALID_TYPE_${suspEval.valueKind.toUpperCase()}`);
    }
  }
  if (blockEval.present && !blockEval.rulesValidTimestamp) {
    if (blockEval.isPlainMap) {
      issues.push(blockEval.frontendValid ? "BLOCK_EXPIRES_AT_PLAIN_MAP_ACCEPTED_BY_FRONTEND_REJECTED_BY_RULES" : "BLOCK_EXPIRES_AT_PLAIN_MAP_REJECTED_BY_RULES_AND_FRONTEND");
      if (blockEval.hasInvalidNanosecondsRange) issues.push("BLOCK_EXPIRES_AT_PLAIN_MAP_INVALID_NANOSECONDS_RANGE");
    } else {
      issues.push(`BLOCK_EXPIRES_AT_INVALID_TYPE_${blockEval.valueKind.toUpperCase()}`);
    }
  }
  if (suspEval.isEpochZeroOrPre1970) issues.push("SUSPENDED_UNTIL_EPOCH_ZERO_OR_PRE_1970");
  if (blockEval.isEpochZeroOrPre1970) issues.push("BLOCK_EXPIRES_AT_EPOCH_ZERO_OR_PRE_1970");
  if (suspEval.hasSubMillisecondDivergence) issues.push("SUSPENDED_UNTIL_SUB_MILLISECOND_DIVERGENCE");
  if (blockEval.hasSubMillisecondDivergence) issues.push("BLOCK_EXPIRES_AT_SUB_MILLISECOND_DIVERGENCE");

  if (hasStatus && doc.status === "suspended" && !suspEval.present) {
    issues.push("INDEFINITE_SUSPENSION_MISSING_SUSPENDED_UNTIL");
    if (blockEval.present && blockEval.rulesValidTimestamp && blockEval.rulesExpired) {
      issues.push("INDEFINITE_SUSPENSION_WITH_EXPIRED_BLOCK_EXPIRES_AT");
    } else if (blockEval.present && blockEval.rulesValidTimestamp && blockEval.rulesBlocks) {
      issues.push("INDEFINITE_SUSPENSION_WITH_FUTURE_BLOCK_EXPIRES_AT");
    }
  }

  return {
    hasIssues: issues.length > 0,
    issues,
    idIntegrity: !hasId ? "ABSENT" : doc.id === docId ? "MATCH" : "MISMATCH",
    hasMissingStatusField: !hasStatus,
    hasNonBooleanActive: hasActive && typeof doc.active !== "boolean",
  };
}

export function evaluateAdministrativeIntent(doc, rulesLayer, frontendLayer) {
  const { blockEval, suspEval } = rulesLayer;
  const statusVal = hasPresentField(doc, "status") ? doc.status : "active";

  if (statusVal === "banned") return "INTENTIONAL_PERMANENT_BAN";
  if (doc.active === false) return "INTENTIONAL_ADMINISTRATIVE_DEACTIVATION";
  if (statusVal === "suspended") {
    if (!suspEval.present) {
      return blockEval.present && blockEval.rulesValidTimestamp && blockEval.rulesExpired
        ? "EXPIRED_LEGACY_BLOCK_TRAPPED_BY_MISSING_SUSPENDED_UNTIL"
        : "AMBIGUOUS_INDEFINITE_SUSPENSION_WITHOUT_DEADLINE";
    }
    if (!suspEval.rulesValidTimestamp) return "AMBIGUOUS_SUSPENSION_WITH_INVALID_DEADLINE";
    return suspEval.rulesBlocks ? "INTENTIONAL_TIMED_SUSPENSION" : "EXPIRED_SUSPENSION_AUTO_RELEASED";
  }
  if (statusVal === "active") {
    if (blockEval.present && blockEval.rulesValidTimestamp && blockEval.rulesBlocks) return "INTENTIONAL_TEMPORARY_BLOCK_VIA_BLOCK_EXPIRES_AT";
    if (suspEval.present && suspEval.rulesValidTimestamp && suspEval.rulesBlocks) return "INTENTIONAL_TEMPORARY_BLOCK_VIA_SUSPENDED_UNTIL";
    if (frontendLayer.isAccountBlocked || !rulesLayer.isStandingActive) return "UNINTENDED_BLOCK_ON_ACTIVE_ACCOUNT";
    return "ACTIVE_STANDING";
  }
  return "UNKNOWN_OR_INVALID_STATUS_INTENT";
}

function sanitizeAllowlisted(doc, key, allowlist) {
  if (!hasPresentField(doc, key)) return "<absent>";
  const val = doc[key];
  if (val === null) return "<null>";
  return typeof val === "string" && allowlist.has(val) ? val : `<non_allowlisted:${typeof val}>`;
}

function sanitizeActive(doc) {
  if (!hasPresentField(doc, "active")) return "<absent>";
  if (doc.active === null) return "<null>";
  return typeof doc.active === "boolean" ? doc.active : `<non_boolean:${typeof doc.active}>`;
}

export function evaluateUserDocument(docId, docData, referenceTime = new Date(), options = {}) {
  const safeDoc = docData && typeof docData === "object" && !Array.isArray(docData) ? docData : {};
  const refTs = normalizeReferenceTime(referenceTime);

  const rulesLayer = evaluateRulesLayer(docId, safeDoc, refTs, options);
  const frontendLayer = evaluateFrontendLayer(docId, safeDoc, refTs, options);
  const dataIntegrityLayer = evaluateDataIntegrityLayer(docId, safeDoc, rulesLayer);
  const administrativeIntent = evaluateAdministrativeIntent(safeDoc, rulesLayer, frontendLayer);

  const { blockEval, suspEval } = rulesLayer;
  const reasons = [];

  const hasInvalidStatus = dataIntegrityLayer.issues.includes("INVALID_STATUS_VALUE");
  const hasRulesVsFrontendDivergence = rulesLayer.isStandingActive !== !frontendLayer.isAccountBlocked;
  const hasInvalidDeadline = (suspEval.present && !suspEval.rulesValidTimestamp) || (blockEval.present && !blockEval.rulesValidTimestamp);
  const hasEpochZeroOrPre1970 = suspEval.isEpochZeroOrPre1970 || blockEval.isEpochZeroOrPre1970;
  const hasSubMsDivergence = suspEval.hasSubMillisecondDivergence || blockEval.hasSubMillisecondDivergence;
  const hasPlainMapAcceptedByFrontend =
    (suspEval.isPlainMap && suspEval.frontendValid) || (blockEval.isPlainMap && blockEval.frontendValid);
  const hasPlainMapRejectedByBoth =
    (suspEval.isPlainMap && !suspEval.frontendValid) || (blockEval.isPlainMap && !blockEval.frontendValid);
  const hasPlainMapInvalidNanos =
    (suspEval.isPlainMap && suspEval.hasInvalidNanosecondsRange) || (blockEval.isPlainMap && blockEval.hasInvalidNanosecondsRange);
  const isCleanlyBannedOrDeactivatedIntent = (hasPresentField(safeDoc, "status") && safeDoc.status === "banned") || safeDoc.active === false;

  const isIndefiniteSuspension = hasPresentField(safeDoc, "status") && safeDoc.status === "suspended" && !suspEval.present;
  const isIndefiniteWithExpiredBlock =
    isIndefiniteSuspension && blockEval.present && blockEval.rulesValidTimestamp && blockEval.rulesExpired;
  const isRootBlockedWithConfirmedAuth =
    rulesLayer.rootIdentity.isConfirmedInRules &&
    (frontendLayer.isAccountBlocked || !rulesLayer.isStandingActive || !rulesLayer.isUserDocActiveData);
  const isRootBypassPendingUnavailableAuth =
    rulesLayer.isRootIdentityDoc &&
    !rulesLayer.rootIdentity.authContextAvailable &&
    (frontendLayer.isAccountBlocked || !rulesLayer.isStandingActive || !rulesLayer.isUserDocActiveData || !rulesLayer.isAdminByDoc);

  let classification;
  if (isRootBlockedWithConfirmedAuth) {
    classification = CLASSIFICATIONS.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE;
    reasons.push("ROOT_ADMIN_FRONTEND_AND_SERVERLESS_BLOCKED_DESPITE_RULES_BYPASS");
  } else if (hasInvalidStatus) {
    classification = CLASSIFICATIONS.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE;
    reasons.push("INVALID_STATUS_VALUE");
  } else if (hasEpochZeroOrPre1970 && !isCleanlyBannedOrDeactivatedIntent) {
    classification = CLASSIFICATIONS.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE;
    reasons.push("EPOCH_ZERO_OR_PRE_1970_FRONTEND_REJECTION");
  } else if (hasSubMsDivergence && !isCleanlyBannedOrDeactivatedIntent) {
    classification = CLASSIFICATIONS.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE;
    reasons.push("SUB_MILLISECOND_RULES_VS_FRONTEND_DIVERGENCE");
  } else if (hasPlainMapAcceptedByFrontend && !isCleanlyBannedOrDeactivatedIntent) {
    classification = CLASSIFICATIONS.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE;
    reasons.push("PLAIN_MAP_ACCEPTED_BY_FRONTEND_REJECTED_BY_RULES");
    if (hasPlainMapInvalidNanos) reasons.push("PLAIN_MAP_INVALID_NANOSECONDS_RANGE");
  } else if (hasPlainMapRejectedByBoth && !isCleanlyBannedOrDeactivatedIntent) {
    classification = CLASSIFICATIONS.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE;
    reasons.push("PLAIN_MAP_REJECTED_BY_RULES_AND_FRONTEND");
    if (hasPlainMapInvalidNanos) reasons.push("PLAIN_MAP_INVALID_NANOSECONDS_RANGE");
  } else if (hasInvalidDeadline && !isCleanlyBannedOrDeactivatedIntent) {
    classification = CLASSIFICATIONS.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE;
    reasons.push("INVALID_DEADLINE_FIELD_CAUSES_FAIL_CLOSED_BLOCK");
  } else if (isIndefiniteWithExpiredBlock) {
    classification = CLASSIFICATIONS.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE;
    reasons.push("INDEFINITE_SUSPENSION_WITH_EXPIRED_BLOCK_EXPIRES_AT");
  } else if (hasRulesVsFrontendDivergence) {
    classification = CLASSIFICATIONS.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE;
    reasons.push("RULES_VS_FRONTEND_STANDING_DIVERGENCE");
  } else if (isIndefiniteSuspension || dataIntegrityLayer.hasIssues) {
    classification = CLASSIFICATIONS.INCONSISTENCIA_DE_DADOS;
    reasons.push(...dataIntegrityLayer.issues);
  } else if (isRootBypassPendingUnavailableAuth) {
    classification = CLASSIFICATIONS.DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO;
    reasons.push("ROOT_AUTHORIZATION_DEPENDS_ON_UNAVAILABLE_AUTH_TOKEN");
    if (!rulesLayer.isAdminByDoc) reasons.push("ROOT_ADMIN_DEPENDS_ON_AUTH_IDENTITY_BYPASS");
  } else if (!rulesLayer.isStandingActive && frontendLayer.isAccountBlocked) {
    classification = CLASSIFICATIONS.BLOQUEIO_INTENCIONAL_COMPATIVEL;
    reasons.push(administrativeIntent);
  } else if (
    !rulesLayer.isUserDocActiveData ||
    !rulesLayer.isRecognizedRoleByDoc ||
    (hasPresentField(safeDoc, "role") && safeDoc.role === "SERVIDOR" && safeDoc.approvalStatus !== "APROVADO") ||
    (rulesLayer.isRootIdentityDoc && !rulesLayer.isAdminByDoc)
  ) {
    classification = CLASSIFICATIONS.DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO;
    if (safeDoc.role === "INTRUSO") reasons.push("ROLE_INTRUSO_EXCLUDED_FROM_ACTIVE_DOC_ACCESS");
    else if (rulesLayer.isRootIdentityDoc && !rulesLayer.isAdminByDoc) reasons.push("ROOT_ADMIN_DEPENDS_ON_AUTH_IDENTITY_BYPASS");
    else if (safeDoc.role === "ADMIN" && safeDoc.approvalStatus !== "APROVADO") reasons.push("ADMIN_NOT_APPROVED");
    else if (safeDoc.role === "SERVIDOR" && safeDoc.approvalStatus !== "APROVADO") reasons.push("SERVIDOR_NOT_APPROVED");
    else reasons.push("ROLE_MISSING_OR_UNRECOGNIZED");
  } else {
    classification = CLASSIFICATIONS.DOCUMENTO_COMPATIVEL;
    if (frontendLayer.isExpiredSuspension) reasons.push("EXPIRED_SUSPENSION_AUTO_RELEASED");
    else if (blockEval.present && blockEval.rulesValidTimestamp && blockEval.rulesExpired) reasons.push("EXPIRED_BLOCK_EXPIRES_AT_AUTO_RELEASED");
    else reasons.push("FULLY_COMPATIBLE_ACTIVE_STANDING");
  }

  const rulesVsFrontendComparison = {
    standingDiverges: hasRulesVsFrontendDivergence,
    itemCreationDiverges: rulesLayer.canCreateCatalogItem !== frontendLayer.canAddItemInFrontend,
    formalReturnDiverges: rulesLayer.canCreateCatalogItem !== frontendLayer.canOperateFormalReturnInFrontend,
    rootIdentityFallbackDiverges:
      frontendLayer.rootIdentity.usedDocEmailFallback && !rulesLayer.rootIdentity.isConfirmedInRules,
    hasOperationalDivergence:
      hasRulesVsFrontendDivergence ||
      rulesLayer.canCreateCatalogItem !== frontendLayer.canAddItemInFrontend ||
      rulesLayer.canCreateCatalogItem !== frontendLayer.canOperateFormalReturnInFrontend ||
      (frontendLayer.rootIdentity.usedDocEmailFallback && !rulesLayer.rootIdentity.isConfirmedInRules),
  };

  const { blockEval: _b, suspEval: _s, ...rulesSummary } = rulesLayer;
  return {
    maskedUid: maskUid(docId),
    isRootIdentityDoc: rulesLayer.isRootIdentityDoc,
    classification,
    reasons,
    administrativeIntent,
    structuralSummary: {
      role: sanitizeAllowlisted(safeDoc, "role", ALLOWLISTED_ROLES),
      approvalStatus: sanitizeAllowlisted(safeDoc, "approvalStatus", ALLOWLISTED_APPROVALS),
      status: sanitizeAllowlisted(safeDoc, "status", ALLOWLISTED_STATUSES),
      active: sanitizeActive(safeDoc),
      idIntegrity: dataIntegrityLayer.idIntegrity,
      suspendedUntilKind: suspEval.valueKind,
      suspendedUntilInterpretation: suspEval.interpretationState,
      blockExpiresAtKind: blockEval.valueKind,
      blockExpiresAtInterpretation: blockEval.interpretationState,
    },
    rulesLayer: rulesSummary,
    frontendLayer,
    rulesVsFrontendComparison,
    dataIntegrityLayer,
  };
}

export function computeGlobalVerdict(auditState) {
  const counts = {
    [CLASSIFICATIONS.DOCUMENTO_COMPATIVEL]: 0,
    [CLASSIFICATIONS.BLOQUEIO_INTENCIONAL_COMPATIVEL]: 0,
    [CLASSIFICATIONS.INCONSISTENCIA_DE_DADOS]: 0,
    [CLASSIFICATIONS.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE]: 0,
    [CLASSIFICATIONS.DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO]: 0,
  };
  const inconclusiveReasons = [];

  if (!auditState || typeof auditState !== "object") {
    return { verdict: GLOBAL_VERDICTS.D, verdictCode: "D", counts, unexpectedClassificationsCount: 0, inconclusiveReasons: ["INVALID_AUDIT_STATE"] };
  }

  const results = Array.isArray(auditState.results) ? auditState.results : null;
  if (!results) inconclusiveReasons.push("RESULTS_NOT_ARRAY");
  if (auditState.readError) inconclusiveReasons.push("PAGE_READ_ERROR");
  if (auditState.completed !== true) inconclusiveReasons.push("INCOMPLETE_PAGINATION");
  if (auditState.stagnantCursorDetected === true) inconclusiveReasons.push("STAGNANT_CURSOR_DETECTED");
  if (typeof auditState.duplicateDocIdsCount === "number" && auditState.duplicateDocIdsCount > 0) {
    inconclusiveReasons.push("DUPLICATE_DOCUMENT_IDS_DETECTED");
  }

  let unexpectedClassificationsCount = 0;
  if (results) {
    for (const item of results) {
      const cls = item?.classification;
      if (typeof cls === "string" && ALLOWED_CLASSIFICATIONS.has(cls)) counts[cls] += 1;
      else unexpectedClassificationsCount += 1;
    }
  }
  if (unexpectedClassificationsCount > 0) inconclusiveReasons.push("UNEXPECTED_CLASSIFICATION_DETECTED");
  if ((results ? results.length : 0) === 0 && inconclusiveReasons.length === 0) inconclusiveReasons.push("EMPTY_COLLECTION");

  if (inconclusiveReasons.length > 0) {
    return { verdict: GLOBAL_VERDICTS.D, verdictCode: "D", counts, unexpectedClassificationsCount, inconclusiveReasons };
  }
  if (counts[CLASSIFICATIONS.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE] > 0) {
    return { verdict: GLOBAL_VERDICTS.C, verdictCode: "C", counts, unexpectedClassificationsCount: 0, inconclusiveReasons: [] };
  }
  if (counts[CLASSIFICATIONS.INCONSISTENCIA_DE_DADOS] > 0 || counts[CLASSIFICATIONS.DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO] > 0) {
    return { verdict: GLOBAL_VERDICTS.B, verdictCode: "B", counts, unexpectedClassificationsCount: 0, inconclusiveReasons: [] };
  }
  return { verdict: GLOBAL_VERDICTS.A, verdictCode: "A", counts, unexpectedClassificationsCount: 0, inconclusiveReasons: [] };
}

export async function auditUsersCollection({
  fetchPage,
  pageSize = 500,
  maxPages = 10_000,
  referenceTime = new Date(),
  rootAdminUid = DEFAULT_ROOT_ADMIN_UID,
  rootAdminEmail,
  rootAdminEmailSha256,
}) {
  if (typeof fetchPage !== "function") throw new TypeError("fetchPage must be a function");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new RangeError("pageSize must be an integer between 1 and 1000");

  const refTs = normalizeReferenceTime(referenceTime);
  const seenDocIds = new Set();
  const results = [];
  let pagesFetched = 0;
  let lastCursorId = null;
  let duplicateDocIdsCount = 0;
  let stagnantCursorDetected = false;
  let readError = null;
  let completed = false;

  try {
    while (pagesFetched < maxPages) {
      const page = await fetchPage({ collectionName: AUDITOR_METADATA.collectionName, pageSize, startAfterDocId: lastCursorId });
      pagesFetched += 1;

      if (!page || !Array.isArray(page.docs)) {
        readError = "INVALID_PAGE_PAYLOAD";
        completed = false;
        break;
      }

      const docs = page.docs;
      if (docs.length === 0) {
        if (page.hasMore === true) {
          stagnantCursorDetected = true;
          completed = false;
        } else {
          completed = true;
        }
        break;
      }

      let pageDuplicateFound = false;
      for (const entry of docs) {
        if (!entry || typeof entry.id !== "string" || entry.id.length === 0) {
          readError = "INVALID_DOCUMENT_ID";
          completed = false;
          break;
        }
        if (seenDocIds.has(entry.id)) {
          duplicateDocIdsCount += 1;
          pageDuplicateFound = true;
          continue;
        }
        seenDocIds.add(entry.id);
        results.push(
          evaluateUserDocument(entry.id, entry.data, refTs, {
            rootAdminUid,
            rootAdminEmail,
            rootAdminEmailSha256,
          })
        );
      }
      if (readError || pageDuplicateFound) {
        completed = false;
        break;
      }

      const nextCursorId = docs[docs.length - 1].id;
      if (lastCursorId !== null && nextCursorId <= lastCursorId) {
        stagnantCursorDetected = true;
        completed = false;
        break;
      }
      lastCursorId = nextCursorId;

      if (docs.length < pageSize && page.hasMore !== true) {
        completed = true;
        break;
      }
    }
    if (!completed && !readError && !stagnantCursorDetected && duplicateDocIdsCount === 0 && pagesFetched >= maxPages) {
      readError = "MAX_PAGES_EXCEEDED";
    }
  } catch (err) {
    readError = err && typeof err.code === "string" ? `READ_ERROR:${err.code}` : "READ_ERROR:EXCEPTION";
    completed = false;
  }

  const verdictSummary = computeGlobalVerdict({ results, completed, readError, stagnantCursorDetected, duplicateDocIdsCount });

  return {
    metadata: {
      ...AUDITOR_METADATA,
      referenceTimeIso: new Date(refTs.seconds * 1000 + Math.floor(refTs.nanoseconds / 1_000_000)).toISOString(),
      referenceTimeNs: refTs,
    },
    pagination: { pageSize, pagesFetched, totalRead: results.length, completed, duplicateDocIdsCount, stagnantCursorDetected, readError },
    verdict: verdictSummary.verdict,
    verdictCode: verdictSummary.verdictCode,
    counts: verdictSummary.counts,
    unexpectedClassificationsCount: verdictSummary.unexpectedClassificationsCount,
    inconclusiveReasons: verdictSummary.inconclusiveReasons,
    results,
  };
}

export async function createReadOnlyFirestoreClient({
  projectId = AUDITOR_METADATA.projectId,
  databaseId = AUDITOR_METADATA.databaseId,
} = {}) {
  const { applicationDefault, getApps, initializeApp } = await import("firebase-admin/app");
  const { FieldPath, getFirestore } = await import("firebase-admin/firestore");

  const appName = `audit-users-readonly-${projectId}-${databaseId}`;
  const existing = getApps().find((a) => a.name === appName);
  const app = existing ?? initializeApp({ credential: applicationDefault(), projectId }, appName);
  const db = getFirestore(app, databaseId);

  return {
    async fetchPage({ collectionName, pageSize, startAfterDocId }) {
      let query = db.collection(collectionName).orderBy(FieldPath.documentId()).limit(pageSize);
      if (startAfterDocId !== null && startAfterDocId !== undefined) query = query.startAfter(startAfterDocId);
      const snap = await query.get();
      return {
        docs: snap.docs.map((d) => ({ id: d.id, data: d.data() })),
        hasMore: snap.docs.length === pageSize,
      };
    },
  };
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

async function runCli() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || !args.has("--execute-readonly-live")) {
    process.stdout.write(
      JSON.stringify(
        {
          metadata: AUDITOR_METADATA,
          status: "DRY_INFO_NO_FIREBASE_CONNECTION",
          usage: "node scripts/audit/audit-users-readonly.mjs --execute-readonly-live",
        },
        null,
        2
      ) + "\n"
    );
    return;
  }
  const client = await createReadOnlyFirestoreClient();
  const report = await auditUsersCollection({ fetchPage: client.fetchPage });
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

if (isDirectExecution()) {
  runCli().catch((err) => {
    const code = err && typeof err.code === "string" ? err.code : "CLI_EXECUTION_ERROR";
    process.stderr.write(JSON.stringify({ errorCode: code }) + "\n");
    process.exitCode = 1;
  });
}
