#!/usr/bin/env node
/**
 * LOCALIZA+ v1.10.13 — Etapa 30 Consolidada (Copia Candidata)
 * Verificador criptografico endurecido de registro de aprovacao administrativa (Ed25519).
 *
 * Melhorias consolidadas sobre `scripts/audit/candidates/etapa28/verify-approval-record.candidate.mjs`:
 * - E30-V1: Deteccao recursiva de chaves JSON duplicadas em qualquer profundidade (nao apenas nivel 1).
 * - E30-V2: Protecao explicita contra replay via lista de `approvalId` ja consumidos (`usedApprovalIds` /
 *           `USED_APPROVAL_IDS_FILE`), rejeitando reutilizacao com `APPROVAL_RECORD_REPLAYED`.
 * - E30-V3: Separacao explicita entre validade criptografica da assinatura e autoridade legitima do
 *           signatario via allowlist opcional/configuravel de `authorizedIssuerKeyIds` (`UNAUTHORIZED_SIGNER_KEY_ID`)
 *           e aviso estruturado de confianca out-of-band (`signerAuthorityNotice`).
 * - E30-V4: Endurecimento fisico dos arquivos de entrada na CLI: caminho absoluto obrigatorio, rejeicao de
 *           symlink direto (`lstatSync`), rejeicao de symlink em diretorio pai (`realpathSync`), rejeicao de
 *           diretorio pai com permissao de escrita para grupo/outros (`(dirMode & 0o022) !== 0`) e rejeicao de
 *           argumentos CLI inesperados (`UNEXPECTED_CLI_ARGUMENT`).
 *
 * Restricoes preservadas:
 * - Zero conexao Firebase, zero escrita no Firestore, zero exposicao de chaves privadas ou tokens.
 * - Nao modifica artefatos originais nem candidatos anteriores.
 */

import { createHash, createPublicKey, timingSafeEqual, verify } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const VERIFIER_VERSION = "verify-approval-record-etapa30-candidate";
export const EXPECTED_PROJECT_ID = "gen-lang-client-0490390966";
export const EXPECTED_DATABASE_ID = "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1";
export const EXPECTED_COLLECTION_NAME = "users";
export const EXPECTED_SCHEMA_VERSION = "localiza-audit-approval-v1";
export const EXPECTED_SCOPE = "READ_ONLY";
export const EXPECTED_PURPOSE = "READ_ONLY_USERS_COMPATIBILITY_AUDIT";
export const SIGNATURE_DOMAIN_PREFIX = "LOCALIZA_AUDIT_APPROVAL_V1\n";

export const APPROVAL_RECORD_KEYS = Object.freeze([
  "schemaVersion",
  "approvalId",
  "projectId",
  "databaseId",
  "collectionName",
  "serviceAccountEmail",
  "purpose",
  "scope",
  "issuedAt",
  "expiresAt",
  "revoked",
  "issuerKeyId",
]);

const APPROVAL_ID_RE = /^[A-Z0-9][A-Z0-9._-]{3,63}$/;
const ISSUER_KEY_ID_RE = /^[a-zA-Z0-9._-]{3,64}$/;
export const SERVICE_ACCOUNT_RE = /^[a-z][a-z0-9-]{4,28}[a-z0-9]@gen-lang-client-0490390966\.iam\.gserviceaccount\.com$/;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
const SHA256_HEX_RE = /^[a-f0-9]{64}$/;
const CANONICAL_ED25519_B64_RE = /^[A-Za-z0-9+/]{86}==$/;
const MAX_VALIDITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_TOLERANCE_MS = 60 * 1000;

function makeError(code, message) {
  return Object.assign(new Error(message), { code });
}

function assertExactKeys(obj, allowedKeys, context) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw makeError("INVALID_RECORD_STRUCTURE", `Expected object at ${context}`);
  }
  const allowedSet = new Set(allowedKeys);
  for (const key of Object.keys(obj)) {
    if (!allowedSet.has(key)) {
      throw makeError("UNEXPECTED_RECORD_KEY", `Unexpected key ${context}.${key}`);
    }
  }
  for (const key of allowedKeys) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      throw makeError("MISSING_RECORD_KEY", `Missing required key ${context}.${key}`);
    }
  }
}

/**
 * Detecta chaves duplicadas em qualquer nivel de objeto JSON na string bruta
 * antes que `JSON.parse` sobrescreva silenciosamente entradas anteriores.
 */
export function assertNoDuplicateJsonKeys(jsonText, errorCode = "DUPLICATE_RECORD_KEY") {
  if (typeof jsonText !== "string") {
    throw makeError("INVALID_RECORD_JSON", "JSON input must be a string");
  }
  const len = jsonText.length;
  let i = 0;

  const readString = () => {
    const start = i;
    i += 1;
    while (i < len) {
      const ch = jsonText[i];
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === '"') {
        i += 1;
        return JSON.parse(jsonText.slice(start, i));
      }
      i += 1;
    }
    throw makeError("INVALID_RECORD_JSON", "Unterminated JSON string");
  };

  const stack = [];
  while (i < len) {
    const ch = jsonText[i];
    if (ch === '"') {
      const parsedStr = readString();
      const top = stack[stack.length - 1];
      if (top && top.kind === "object" && top.expectingKey) {
        if (top.keys.has(parsedStr)) {
          throw makeError(errorCode, `Duplicate JSON key detected: ${parsedStr}`);
        }
        top.keys.add(parsedStr);
        top.expectingKey = false;
      }
      continue;
    }
    if (ch === "{") {
      stack.push({ kind: "object", keys: new Set(), expectingKey: true });
    } else if (ch === "[") {
      stack.push({ kind: "array" });
    } else if (ch === "}" || ch === "]") {
      stack.pop();
    } else if (ch === ",") {
      const top = stack[stack.length - 1];
      if (top && top.kind === "object") {
        top.expectingKey = true;
      }
    }
    i += 1;
  }
}

function canonicalSort(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalSort(item));
  }
  if (value && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = canonicalSort(value[key]);
    }
    return sorted;
  }
  return value;
}

export function canonicalizeApprovalRecord(record) {
  assertExactKeys(record, APPROVAL_RECORD_KEYS, "approvalRecord");
  const json = JSON.stringify(canonicalSort(record));
  return Buffer.from(`${SIGNATURE_DOMAIN_PREFIX}${json}`, "utf8");
}

export function computePublicKeyFingerprintSha256(publicKeyPem) {
  if (typeof publicKeyPem !== "string" || publicKeyPem.trim().length === 0) {
    throw makeError("INVALID_PUBLIC_KEY", "Public key PEM must be a non-empty string");
  }
  let keyObj;
  try {
    keyObj = createPublicKey(publicKeyPem);
  } catch {
    throw makeError("INVALID_PUBLIC_KEY", "Unable to parse public key PEM");
  }
  if (keyObj.asymmetricKeyType !== "ed25519") {
    throw makeError("UNSUPPORTED_KEY_ALGORITHM", `Expected ed25519 public key, received ${String(keyObj.asymmetricKeyType)}`);
  }
  const spkiDer = keyObj.export({ type: "spki", format: "der" });
  return createHash("sha256").update(spkiDer).digest("hex");
}

export function parseStrictIsoUtc(value, fieldName) {
  if (typeof value !== "string" || !ISO_UTC_RE.test(value)) {
    throw makeError("INVALID_TIMESTAMP_FORMAT", `Field ${fieldName} must be strict ISO-8601 UTC`);
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw makeError("INVALID_TIMESTAMP_FORMAT", `Field ${fieldName} is not a valid date`);
  }
  const normalizedExpected = value.includes(".") ? value : value.replace(/Z$/, ".000Z");
  const roundTripIso = new Date(ms).toISOString();
  if (roundTripIso !== normalizedExpected) {
    throw makeError("INVALID_TIMESTAMP_CALENDAR", `Field ${fieldName} contains a non-existent calendar date`);
  }
  return ms;
}

/**
 * Valida assinatura Ed25519, pin SPKI SHA-256 confiavel, autoridade do signatario (issuerKeyId),
 * integridade estrutural, expiracao, revogacao e protecao contra replay (`usedApprovalIds`).
 */
export function verifySignedApprovalRecord({
  recordJsonText,
  signatureBase64,
  trustedPublicKeyPem,
  trustedPublicKeySha256,
  expectedServiceAccountEmail = null,
  authorizedIssuerKeyIds = null,
  revokedApprovalIds = [],
  usedApprovalIds = [],
  referenceTime = new Date(),
}) {
  if (typeof recordJsonText !== "string" || recordJsonText.trim().length === 0) {
    throw makeError("MISSING_APPROVAL_RECORD", "Approval record content is empty");
  }
  if (typeof signatureBase64 !== "string" || signatureBase64.trim().length === 0) {
    throw makeError("MISSING_SIGNATURE", "Signature base64 is required");
  }
  const expectedPin = typeof trustedPublicKeySha256 === "string" ? trustedPublicKeySha256.trim().toLowerCase() : "";
  if (!SHA256_HEX_RE.test(expectedPin)) {
    throw makeError("INVALID_TRUSTED_KEY_PIN", "trustedPublicKeySha256 must be a valid 64-char hex SHA-256");
  }
  if (!Array.isArray(revokedApprovalIds) || !revokedApprovalIds.every((id) => typeof id === "string")) {
    throw makeError("INVALID_REVOKED_LIST", "revokedApprovalIds must be an array of strings");
  }
  if (!Array.isArray(usedApprovalIds) || !usedApprovalIds.every((id) => typeof id === "string")) {
    throw makeError("INVALID_USED_APPROVAL_LIST", "usedApprovalIds must be an array of strings");
  }
  if (authorizedIssuerKeyIds !== null && authorizedIssuerKeyIds !== undefined) {
    if (
      !Array.isArray(authorizedIssuerKeyIds) ||
      authorizedIssuerKeyIds.length === 0 ||
      !authorizedIssuerKeyIds.every((id) => typeof id === "string" && ISSUER_KEY_ID_RE.test(id))
    ) {
      throw makeError("INVALID_AUTHORIZED_ISSUER_LIST", "authorizedIssuerKeyIds must be a non-empty array of valid issuerKeyIds");
    }
  }

  let refMs;
  if (referenceTime instanceof Date) {
    refMs = referenceTime.getTime();
  } else if (typeof referenceTime === "number") {
    refMs = referenceTime;
  } else {
    throw makeError("INVALID_REFERENCE_TIME", "referenceTime must be a valid Date or finite epoch number");
  }
  if (!Number.isFinite(refMs)) {
    throw makeError("INVALID_REFERENCE_TIME", "referenceTime is invalid");
  }

  // 1. Verificar pin criptografico SPKI SHA-256 com comparacao em tempo constante
  const actualPin = computePublicKeyFingerprintSha256(trustedPublicKeyPem);
  const pinMatches = timingSafeEqual(Buffer.from(actualPin, "hex"), Buffer.from(expectedPin, "hex"));
  if (!pinMatches) {
    throw makeError("UNTRUSTED_PUBLIC_KEY_FINGERPRINT", "Public key SPKI SHA-256 does not match trusted out-of-band pin");
  }

  // 2. Detectar chaves JSON duplicadas em qualquer nivel, parsear e validar allowlist exata
  assertNoDuplicateJsonKeys(recordJsonText, "DUPLICATE_RECORD_KEY");
  let record;
  try {
    record = JSON.parse(recordJsonText);
  } catch {
    throw makeError("INVALID_RECORD_JSON", "Approval record is not valid JSON");
  }
  assertExactKeys(record, APPROVAL_RECORD_KEYS, "approvalRecord");

  // 3. Verificar assinatura Ed25519 canonica (88 chars Base64 -> 64 bytes -> round-trip exato)
  const canonicalBytes = canonicalizeApprovalRecord(record);
  const sigTrimmed = signatureBase64.trim();
  if (!CANONICAL_ED25519_B64_RE.test(sigTrimmed)) {
    throw makeError("INVALID_SIGNATURE_FORMAT", "Signature must be canonical 88-char base64 for 64-byte Ed25519");
  }
  const sigBytes = Buffer.from(sigTrimmed, "base64");
  if (sigBytes.length !== 64 || sigBytes.toString("base64") !== sigTrimmed) {
    throw makeError("INVALID_SIGNATURE_LENGTH", `Ed25519 signature must be canonical 64 bytes, got ${sigBytes.length}`);
  }
  const publicKeyObj = createPublicKey(trustedPublicKeyPem);
  const signatureValid = verify(null, canonicalBytes, publicKeyObj, sigBytes);
  if (!signatureValid) {
    throw makeError("INVALID_DIGITAL_SIGNATURE", "Ed25519 digital signature verification failed");
  }

  // 4. Validar campos semanticos, autoridade do signatario, revogacao, replay e janela temporal
  if (record.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    throw makeError("INVALID_SCHEMA_VERSION", `Unsupported schemaVersion: ${String(record.schemaVersion)}`);
  }
  if (typeof record.approvalId !== "string" || !APPROVAL_ID_RE.test(record.approvalId)) {
    throw makeError("INVALID_APPROVAL_ID", "Invalid approvalId format");
  }
  if (record.projectId !== EXPECTED_PROJECT_ID) {
    throw makeError("PROJECT_ID_MISMATCH", "Approval record projectId does not match target project");
  }
  if (record.databaseId !== EXPECTED_DATABASE_ID) {
    throw makeError("DATABASE_ID_MISMATCH", "Approval record databaseId does not match target named database");
  }
  if (record.collectionName !== EXPECTED_COLLECTION_NAME) {
    throw makeError("COLLECTION_NAME_MISMATCH", "Approval record collectionName must be users");
  }
  if (typeof record.serviceAccountEmail !== "string" || !SERVICE_ACCOUNT_RE.test(record.serviceAccountEmail)) {
    throw makeError("INVALID_SERVICE_ACCOUNT_FORMAT", "Invalid dedicated service account email format");
  }
  if (record.purpose !== EXPECTED_PURPOSE) {
    throw makeError("INVALID_PURPOSE", "Approval record purpose mismatch");
  }
  if (record.scope !== EXPECTED_SCOPE) {
    throw makeError("INVALID_SCOPE", "Approval record scope must be READ_ONLY");
  }
  if (typeof record.issuerKeyId !== "string" || !ISSUER_KEY_ID_RE.test(record.issuerKeyId)) {
    throw makeError("INVALID_ISSUER_KEY_ID", "Invalid issuerKeyId format");
  }
  if (Array.isArray(authorizedIssuerKeyIds) && !authorizedIssuerKeyIds.includes(record.issuerKeyId)) {
    throw makeError(
      "UNAUTHORIZED_SIGNER_KEY_ID",
      "Cryptographic signature is valid, but issuerKeyId is not authorized to approve this audit"
    );
  }
  if (typeof record.revoked !== "boolean") {
    throw makeError("INVALID_REVOKED_TYPE", "revoked must be boolean");
  }

  const revokedSet = new Set(revokedApprovalIds);
  if (record.revoked === true || revokedSet.has(record.approvalId)) {
    throw makeError("APPROVAL_RECORD_REVOKED", "Approval record has been revoked");
  }
  const usedSet = new Set(usedApprovalIds);
  if (usedSet.has(record.approvalId)) {
    throw makeError("APPROVAL_RECORD_REPLAYED", "Approval record approvalId has already been consumed (replay rejected)");
  }

  const issuedMs = parseStrictIsoUtc(record.issuedAt, "issuedAt");
  const expiresMs = parseStrictIsoUtc(record.expiresAt, "expiresAt");
  if (expiresMs <= issuedMs) {
    throw makeError("INVALID_VALIDITY_WINDOW", "expiresAt must be strictly after issuedAt");
  }
  if (expiresMs - issuedMs > MAX_VALIDITY_WINDOW_MS) {
    throw makeError("VALIDITY_WINDOW_TOO_LONG", "Approval record validity window exceeds 7 days");
  }
  if (refMs < issuedMs - CLOCK_SKEW_TOLERANCE_MS) {
    throw makeError("APPROVAL_RECORD_NOT_YET_VALID", "Approval record issuedAt is in the future");
  }
  if (refMs >= expiresMs) {
    throw makeError("APPROVAL_RECORD_EXPIRED", "Approval record has expired");
  }

  if (expectedServiceAccountEmail !== null && expectedServiceAccountEmail !== undefined) {
    if (typeof expectedServiceAccountEmail !== "string") {
      throw makeError("INVALID_EXPECTED_SERVICE_ACCOUNT", "expectedServiceAccountEmail must be a string");
    }
    const trimmedExpected = expectedServiceAccountEmail.trim();
    if (!SERVICE_ACCOUNT_RE.test(trimmedExpected)) {
      throw makeError("INVALID_EXPECTED_SERVICE_ACCOUNT", "expectedServiceAccountEmail has invalid format");
    }
    if (trimmedExpected !== record.serviceAccountEmail) {
      throw makeError("SERVICE_ACCOUNT_MISMATCH", "Service account does not match signed approval record");
    }
  }

  const recordSha256 = createHash("sha256").update(canonicalBytes).digest("hex");

  return {
    verifierVersion: VERIFIER_VERSION,
    verified: true,
    algorithm: "ed25519",
    approvalId: record.approvalId,
    projectId: record.projectId,
    databaseId: record.databaseId,
    collectionName: record.collectionName,
    serviceAccountEmail: record.serviceAccountEmail,
    scope: record.scope,
    purpose: record.purpose,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
    issuerKeyId: record.issuerKeyId,
    trustedPublicKeySha256: actualPin,
    canonicalRecordSha256: recordSha256,
    signerAuthorityNotice:
      "VALID_ED25519_SIGNATURE_PROVES_KEY_POSSESSION_ONLY_OUT_OF_BAND_TRUST_AND_SIGNER_AUTHORITY_REQUIRED",
  };
}

/**
 * Le arquivo regular seguro validando caminho absoluto, ausencia de symlink direto e em diretorios pais,
 * e diretorio pai protegido contra escrita por grupo/outros.
 */
export function readSecureRegularFile(
  filePath,
  missingCode,
  { requireAbsolute = true, requireNoGroupOtherWriteOnParent = true, requireStrictFileMode = false } = {}
) {
  if (typeof filePath !== "string" || filePath.trim().length === 0) {
    throw makeError(missingCode, `Required file missing: ${missingCode}`);
  }
  if (requireAbsolute && !isAbsolute(filePath)) {
    throw makeError("INPUT_PATH_NOT_ABSOLUTE", `Input path must be absolute (${missingCode})`);
  }
  if (!existsSync(filePath)) {
    throw makeError(missingCode, `Required file missing: ${missingCode}`);
  }
  const st = lstatSync(filePath);
  if (st.isSymbolicLink()) {
    throw makeError("SYMLINK_INPUT_FORBIDDEN", `Input path must not be a symbolic link (${missingCode})`);
  }
  if (!st.isFile()) {
    throw makeError("SPECIAL_INPUT_FILE_FORBIDDEN", `Input path must be a regular file (${missingCode})`);
  }
  const resolvedPath = resolve(filePath);
  const realPath = realpathSync(filePath);
  if (realPath !== resolvedPath) {
    throw makeError("PARENT_SYMLINK_INPUT_FORBIDDEN", `Input path contains a symbolic link in parent directory (${missingCode})`);
  }
  if (requireStrictFileMode && (st.mode & 0o077) !== 0) {
    throw makeError("INSECURE_INPUT_FILE_PERMISSIONS", `Input file must not grant group/other permissions (${missingCode})`);
  }
  if (requireNoGroupOtherWriteOnParent) {
    const parentStat = lstatSync(dirname(resolvedPath));
    if ((parentStat.mode & 0o022) !== 0) {
      throw makeError("INSECURE_PARENT_DIR_PERMISSIONS", `Parent directory must not be group/world writable (${missingCode})`);
    }
  }
  return readFileSync(filePath, "utf8");
}

function readJsonStringArrayFile(filePath, missingCode, invalidCode) {
  const raw = readSecureRegularFile(filePath, missingCode);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw makeError(invalidCode, `File is not valid JSON (${invalidCode})`);
  }
  if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "string")) {
    throw makeError(invalidCode, `File must be a JSON string array (${invalidCode})`);
  }
  return parsed;
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

function runCli() {
  const extraArgs = process.argv.slice(2);
  if (extraArgs.length > 0) {
    throw makeError("UNEXPECTED_CLI_ARGUMENT", "Unexpected CLI arguments are rejected (configure via controlled env vars)");
  }

  const recordPath = (process.env.APPROVED_AUDIT_RECORD_FILE || "").trim();
  const sigPath = (process.env.APPROVED_AUDIT_SIGNATURE_FILE || "").trim();
  const pubKeyPath = (process.env.TRUSTED_ADMIN_PUBKEY_FILE || "").trim();
  const pubKeyPin = (process.env.TRUSTED_ADMIN_PUBKEY_SHA256 || "").trim();
  const expectedSa = (process.env.EXPECTED_AUDIT_SA || "").trim();
  const revokedFile = (process.env.REVOKED_APPROVAL_IDS_FILE || "").trim();
  const usedFile = (process.env.USED_APPROVAL_IDS_FILE || "").trim();
  const authorizedIssuersRaw = (process.env.AUTHORIZED_ISSUER_KEY_IDS || "").trim();

  if (!expectedSa) {
    throw makeError("EXPECTED_AUDIT_SA_MISSING", "EXPECTED_AUDIT_SA environment variable is required");
  }

  const recordJsonText = readSecureRegularFile(recordPath, "APPROVAL_RECORD_FILE_MISSING");
  const signatureBase64 = readSecureRegularFile(sigPath, "APPROVAL_SIGNATURE_FILE_MISSING");
  const trustedPublicKeyPem = readSecureRegularFile(pubKeyPath, "TRUSTED_PUBKEY_FILE_MISSING");

  const revokedIds = revokedFile
    ? readJsonStringArrayFile(revokedFile, "REVOKED_LIST_FILE_MISSING", "INVALID_REVOKED_LIST")
    : [];
  const usedIds = usedFile
    ? readJsonStringArrayFile(usedFile, "USED_APPROVAL_LIST_FILE_MISSING", "INVALID_USED_APPROVAL_LIST")
    : [];
  const authorizedIssuerKeyIds = authorizedIssuersRaw
    ? authorizedIssuersRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  const verification = verifySignedApprovalRecord({
    recordJsonText,
    signatureBase64,
    trustedPublicKeyPem,
    trustedPublicKeySha256: pubKeyPin,
    expectedServiceAccountEmail: expectedSa,
    authorizedIssuerKeyIds,
    revokedApprovalIds: revokedIds,
    usedApprovalIds: usedIds,
  });

  process.stdout.write(JSON.stringify(verification, null, 2) + "\n");
}

if (isDirectExecution()) {
  try {
    runCli();
  } catch (err) {
    const code = err && typeof err.code === "string" ? err.code : "APPROVAL_VERIFICATION_ERROR";
    process.stderr.write(JSON.stringify({ verifierVersion: VERIFIER_VERSION, verified: false, errorCode: code }) + "\n");
    process.exitCode = 1;
  }
}
