#!/usr/bin/env node
/**
 * LOCALIZA+ v1.10.13 — Etapa 29 (Copia Candidata Independente)
 * Sonda read-only `probe-readonly-v4` endurecida apos auditoria independente da Etapa 29.
 *
 * Correcoes implementadas sobre `scripts/audit/candidates/etapa28/probe-readonly-v4.candidate.mjs`:
 * - P29-1: Zero imports estaticos de modulos externos ou de terceiros (apenas `node:fs`, `node:path`, `node:url`);
 *          carregamento dinamico do verificador Ed25519 na Etapa A e de `firebase-admin/*` somente na Etapa F
 *          apos aprovacao de todas as barreiras fail-closed, com tratamento explicito de falha de importacao
 *          (`FIREBASE_MODULE_LOAD_FAILED`) e rastreamento opcional de ordem de eventos.
 * - P29-2: Modelo ADC inequivoco:
 *          - Exige `METADATA_SERVER_DETECTION=none` (variavel efetivamente lida por `gcp-metadata@6.1.1` / `google-auth-library@9.15.1`),
 *            em vez de depender da variavel legada `NO_GCE_CHECK`;
 *          - Bloqueia 20 variaveis de redirecionamento/conflito incluindo `google_application_credentials` (minusculo),
 *            `CLOUDSDK_CONFIG`, `K_SERVICE`, `CLOUD_RUN_JOB`, `FUNCTION_NAME`;
 *          - Define `GOOGLE_APPLICATION_CREDENTIALS` (maiusculo, caminho absoluto) como fonte unica controlada;
 *            rejeita conflito com `PROBE_ADC_FILE` e rejeita existencia de ADC well-known sob `$HOME/.config/gcloud` / `%APPDATA%\gcloud`;
 *          - Valida em disco antes de entregar ao SDK: caminho absoluto, nao-symlink direto nem em diretorio pai (`realpathSync`),
 *            arquivo regular (rejeita FIFO/socket/device/diretorio) e permissoes estritas sem bits de grupo/outros (`(mode & 0o077) === 0`);
 *          - Valida no JSON ADC: deteccao de chaves duplicadas (raiz e `source_credentials`), allowlist estrita em ambos os niveis,
 *            validacao de `source_credentials.client_secret` (exigido pelo `firebase-admin@14.2.0`), rejeicao de conta de origem
 *            `.gserviceaccount.com` ou igual a SA impersonada.
 * - P29-3: Documentacao e saida tecnicamente exatas sobre `db.collection("users").select().limit(1).get()`:
 *          No `@google-cloud/firestore@8.7.1`, `select()` sem argumentos solicita `projection: { fields: [{ fieldPath: "__name__" }] }`.
 *          Nenhum campo de negocio do documento e solicitado, MAS o `document.name` (contendo o UID bruto de ate 1 documento)
 *          trafega pela rede e existe na memoria do SDK (`snap.docs[0].id`), sendo nao acessado e nao impresso pela sonda.
 * - P29-4: Erro de encerramento (`deleteApp`) no `finally` NAO e mais silenciado: falha apos consulta bem-sucedida gera
 *          `FIREBASE_APP_CLEANUP_FAILED`; falha apos erro principal anexa `cleanupErrorCode` sem mascarar a causa raiz.
 *
 * AVISO: Sem `--execute-probe-readonly`, o script NAO conecta ao Firebase, NAO le ADC e NAO emite tokens.
 */

import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PROBE_VERSION = "probe-readonly-v4-etapa29-candidate";
export const EXPECTED_PROJECT_ID = "gen-lang-client-0490390966";
export const EXPECTED_DATABASE_ID = "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1";
export const EXPECTED_COLLECTION_NAME = "users";
export const PROBE_LIMIT = 1;
export const FORBIDDEN_DEFAULT_DATABASE_ID = "(default)";

export const BLOCKED_ENV_VARS = Object.freeze([
  "FIREBASE_CONFIG",
  "FIRESTORE_EMULATOR_HOST",
  "FIREBASE_AUTH_EMULATOR_HOST",
  "GCLOUD_PROJECT",
  "GOOGLE_CLOUD_PROJECT",
  "GCP_PROJECT",
  "GOOGLE_CLOUD_QUOTA_PROJECT",
  "GCE_METADATA_HOST",
  "GCE_METADATA_ROOT",
  "GCE_METADATA_IP",
  "METADATA_SERVER_HOST",
  "CLOUDSDK_CORE_PROJECT",
  "CLOUDSDK_CONFIG",
  "CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT",
  "GOOGLE_API_USE_CLIENT_CERTIFICATE",
  "NODE_TLS_REJECT_UNAUTHORIZED",
  "K_SERVICE",
  "CLOUD_RUN_JOB",
  "FUNCTION_NAME",
  "google_application_credentials",
]);

export const ADC_TOP_LEVEL_ALLOWED_KEYS = Object.freeze([
  "type",
  "service_account_impersonation_url",
  "source_credentials",
  "delegates",
  "quota_project_id",
  "universe_domain",
]);

export const ADC_SOURCE_ALLOWED_KEYS = Object.freeze([
  "type",
  "client_id",
  "client_secret",
  "refresh_token",
  "quota_project_id",
  "universe_domain",
  "account",
]);

const SERVICE_ACCOUNT_RE = /^[a-z][a-z0-9-]{4,28}[a-z0-9]@gen-lang-client-0490390966\.iam\.gserviceaccount\.com$/;
const IMPERSONATION_PATH_RE =
  /^\/v1\/projects\/-\/serviceAccounts\/([a-z][a-z0-9-]{4,28}[a-z0-9]@gen-lang-client-0490390966\.iam\.gserviceaccount\.com):generateAccessToken$/;
const ANY_SERVICE_ACCOUNT_DOMAIN_RE = /\.gserviceaccount\.com$/i;

function makeError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

/**
 * Detecta chaves duplicadas em qualquer nivel de objeto JSON na string bruta
 * antes que `JSON.parse` sobrescreva silenciosamente entradas anteriores.
 */
export function assertNoDuplicateJsonKeys(jsonText) {
  if (typeof jsonText !== "string") {
    throw makeError("INVALID_ADC_JSON", "JSON text must be a string");
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
    throw makeError("INVALID_ADC_JSON", "Unterminated JSON string");
  };

  const stack = [];
  while (i < len) {
    const ch = jsonText[i];
    if (ch === '"') {
      const strVal = readString();
      const top = stack[stack.length - 1];
      if (top && top.kind === "object" && top.expectingKey) {
        if (top.keys.has(strVal)) {
          throw makeError("ADC_DUPLICATE_JSON_KEY", `Duplicate JSON key detected in ADC: ${strVal}`);
        }
        top.keys.add(strVal);
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

/**
 * 1. Valida o ambiente de execucao da sonda de forma inequivoca:
 *    - Bloqueia variaveis de redirecionamento, emuladores, serverless e `google_application_credentials` minusculo;
 *    - Exige `METADATA_SERVER_DETECTION=none` (efetivamente honrado por `gcp-metadata@6.1.1`);
 *    - Exige `GOOGLE_APPLICATION_CREDENTIALS` (maiusculo) como caminho absoluto unico;
 *    - Rejeita conflito com `PROBE_ADC_FILE` e bloqueia presenca de arquivo ADC well-known em HOME/APPDATA.
 */
export function assertSafeProbeEnvironment(env = process.env) {
  if (!env || typeof env !== "object") {
    throw makeError("INVALID_ENVIRONMENT", "Environment map is invalid");
  }

  for (const key of BLOCKED_ENV_VARS) {
    const val = env[key];
    if (typeof val === "string" && val.trim().length > 0) {
      const code = key === "google_application_credentials" ? "CONFLICTING_ADC_ENV_VARS" : "BLOCKED_ENV_VAR_PRESENT";
      throw makeError(code, `Blocked or conflicting environment variable is set: ${key}`);
    }
  }

  const msd = String(env.METADATA_SERVER_DETECTION || "").trim().toLowerCase();
  if (msd !== "none") {
    throw makeError(
      "METADATA_SERVER_DETECTION_NOT_NONE",
      "METADATA_SERVER_DETECTION must be explicitly set to 'none' (required by gcp-metadata@6.1.1)"
    );
  }

  const gacPath = typeof env.GOOGLE_APPLICATION_CREDENTIALS === "string" ? env.GOOGLE_APPLICATION_CREDENTIALS.trim() : "";
  const probeAdcFile = typeof env.PROBE_ADC_FILE === "string" ? env.PROBE_ADC_FILE.trim() : "";

  if (!gacPath) {
    throw makeError("ADC_FILE_ENV_MISSING", "GOOGLE_APPLICATION_CREDENTIALS must specify a controlled absolute ADC file path");
  }
  if (!isAbsolute(gacPath)) {
    throw makeError("ADC_PATH_NOT_ABSOLUTE", "GOOGLE_APPLICATION_CREDENTIALS must be an absolute path");
  }
  if (probeAdcFile && resolve(probeAdcFile) !== resolve(gacPath)) {
    throw makeError("CONFLICTING_ADC_ENV_VARS", "PROBE_ADC_FILE conflicts with GOOGLE_APPLICATION_CREDENTIALS");
  }

  // Verifica risco de arquivo ADC well-known paralelo em HOME ou APPDATA
  const wellKnownCandidates = [];
  if (typeof env.HOME === "string" && env.HOME.trim().length > 0) {
    wellKnownCandidates.push(join(env.HOME.trim(), ".config", "gcloud", "application_default_credentials.json"));
  }
  if (typeof env.APPDATA === "string" && env.APPDATA.trim().length > 0) {
    wellKnownCandidates.push(join(env.APPDATA.trim(), "gcloud", "application_default_credentials.json"));
  }
  for (const wk of wellKnownCandidates) {
    if (existsSync(wk) && resolve(wk) !== resolve(gacPath)) {
      throw makeError("WELL_KNOWN_ADC_CONFLICT", "A separate well-known gcloud ADC file exists under HOME/APPDATA");
    }
  }

  return { adcPath: resolve(gacPath) };
}

/**
 * 2. Le o arquivo ADC controlado aplicando barreiras fisicas em disco:
 *    - Rejeita caminho relativo ou inexistente;
 *    - Rejeita symlink direto (`lstatSync`), symlink em diretorio pai (`realpathSync`) e arquivos especiais/diretorios;
 *    - Rejeita permissoes frouxas com bits de grupo ou outros (`(mode & 0o077) !== 0`).
 */
export function readControlledAdcFile(adcPath, fsOps = { existsSync, lstatSync, realpathSync, readFileSync }) {
  if (typeof adcPath !== "string" || adcPath.trim().length === 0) {
    throw makeError("ADC_FILE_MISSING", "ADC file path is empty");
  }
  if (!isAbsolute(adcPath)) {
    throw makeError("ADC_PATH_NOT_ABSOLUTE", "ADC file path must be absolute");
  }
  if (!fsOps.existsSync(adcPath)) {
    throw makeError("ADC_FILE_MISSING", "Controlled ADC file does not exist");
  }

  const st = fsOps.lstatSync(adcPath);
  if (st.isSymbolicLink()) {
    throw makeError("ADC_SYMLINK_FORBIDDEN", "ADC file must not be a symbolic link");
  }
  if (!st.isFile()) {
    throw makeError("ADC_SPECIAL_FILE_FORBIDDEN", "ADC path must be a regular file (not directory, FIFO, socket or device)");
  }

  const resolvedExpected = resolve(adcPath);
  const realResolved = fsOps.realpathSync(adcPath);
  if (realResolved !== resolvedExpected) {
    throw makeError("ADC_PARENT_SYMLINK_FORBIDDEN", "ADC path contains a symbolic link in parent directory");
  }

  if ((st.mode & 0o077) !== 0) {
    throw makeError("ADC_INSECURE_PERMISSIONS", "ADC file must not grant group or other permissions (use 0600 or 0400)");
  }

  return fsOps.readFileSync(adcPath, "utf8");
}

function assertAllowedSubsetKeys(obj, allowedKeys, unexpectedCode, context) {
  const allowedSet = new Set(allowedKeys);
  for (const key of Object.keys(obj)) {
    if (!allowedSet.has(key)) {
      throw makeError(unexpectedCode, `Unexpected key in ${context}: ${key}`);
    }
  }
}

/**
 * 3. Valida integralmente o payload JSON do ADC antes de entrega-lo ao SDK:
 *    - Rejeita chaves JSON duplicadas (raiz e aninhadas);
 *    - Allowlist estrita de chaves na raiz e em `source_credentials`;
 *    - Identifica `impersonated_service_account` e `source_credentials.type === "authorized_user"`;
 *    - Valida URL canonica `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/<SA>:generateAccessToken`;
 *    - Separa e valida conta de origem vs. conta impersonada aprovada no registro Ed25519.
 */
export function validateImpersonatedAdcPayload(
  adcJsonText,
  {
    expectedServiceAccountEmail,
    expectedSourceClientId = null,
    expectedSourceAccount = null,
    expectedProjectId = EXPECTED_PROJECT_ID,
  }
) {
  if (typeof expectedServiceAccountEmail !== "string" || !SERVICE_ACCOUNT_RE.test(expectedServiceAccountEmail)) {
    throw makeError("INVALID_EXPECTED_SERVICE_ACCOUNT", "Expected service account email is invalid");
  }
  if (typeof adcJsonText !== "string" || adcJsonText.trim().length === 0) {
    throw makeError("EMPTY_ADC_PAYLOAD", "ADC file content is empty");
  }

  assertNoDuplicateJsonKeys(adcJsonText);

  let adc;
  try {
    adc = JSON.parse(adcJsonText);
  } catch {
    throw makeError("INVALID_ADC_JSON", "ADC file is not valid JSON");
  }
  if (!adc || typeof adc !== "object" || Array.isArray(adc)) {
    throw makeError("INVALID_ADC_STRUCTURE", "ADC payload must be a JSON object");
  }

  assertAllowedSubsetKeys(adc, ADC_TOP_LEVEL_ALLOWED_KEYS, "ADC_UNEXPECTED_KEY", "adc");

  if (adc.type !== "impersonated_service_account") {
    throw makeError("UNEXPECTED_ADC_TYPE", `ADC type must be impersonated_service_account, got ${String(adc.type)}`);
  }

  const rawUrl = adc.service_account_impersonation_url;
  if (typeof rawUrl !== "string" || rawUrl.trim() !== rawUrl || rawUrl.length === 0) {
    throw makeError("INVALID_IMPERSONATION_URL", "service_account_impersonation_url must be a non-empty trimmed string");
  }
  if (/%2f|%5c|\.\./i.test(rawUrl)) {
    throw makeError("INVALID_IMPERSONATION_URL_PATH", "Impersonation URL contains forbidden traversal or encoded slash");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw makeError("INVALID_IMPERSONATION_URL", "Unable to parse service_account_impersonation_url");
  }
  if (parsedUrl.protocol !== "https:") {
    throw makeError("INVALID_IMPERSONATION_URL_PROTOCOL", "Impersonation URL must use https:");
  }
  if (parsedUrl.hostname !== "iamcredentials.googleapis.com") {
    throw makeError("INVALID_IMPERSONATION_URL_HOST", "Impersonation URL hostname must be iamcredentials.googleapis.com");
  }
  if (parsedUrl.port !== "" || /^https:\/\/iamcredentials\.googleapis\.com:\d+/i.test(rawUrl)) {
    throw makeError("INVALID_IMPERSONATION_URL_PORT", "Impersonation URL must not specify an explicit port");
  }
  if (parsedUrl.username !== "" || parsedUrl.password !== "") {
    throw makeError("INVALID_IMPERSONATION_URL_AUTH", "Impersonation URL must not contain userinfo");
  }
  if (parsedUrl.search !== "" || parsedUrl.hash !== "" || rawUrl.includes("?") || rawUrl.includes("#")) {
    throw makeError("INVALID_IMPERSONATION_URL_PARAMS", "Impersonation URL must not contain query parameters or fragments");
  }

  const pathMatch = IMPERSONATION_PATH_RE.exec(parsedUrl.pathname);
  if (!pathMatch) {
    throw makeError("INVALID_IMPERSONATION_URL_PATH", "Impersonation URL path does not match canonical generateAccessToken endpoint");
  }
  const impersonatedSa = pathMatch[1];
  if (impersonatedSa !== expectedServiceAccountEmail) {
    throw makeError("IMPERSONATED_SA_MISMATCH", "Impersonated service account in ADC does not match approved service account");
  }

  if (adc.delegates !== undefined) {
    if (!Array.isArray(adc.delegates) || adc.delegates.length > 0) {
      throw makeError("NON_EMPTY_DELEGATES_FORBIDDEN", "ADC delegates chain must be empty");
    }
  }
  if (adc.quota_project_id !== undefined && adc.quota_project_id !== expectedProjectId) {
    throw makeError("QUOTA_PROJECT_MISMATCH", "ADC quota_project_id does not match target project");
  }
  if (adc.universe_domain !== undefined && adc.universe_domain !== "googleapis.com") {
    throw makeError("UNEXPECTED_UNIVERSE_DOMAIN", "ADC universe_domain must be googleapis.com");
  }

  const src = adc.source_credentials;
  if (!src || typeof src !== "object" || Array.isArray(src)) {
    throw makeError("MISSING_SOURCE_CREDENTIALS", "ADC source_credentials must be present");
  }
  if (Object.prototype.hasOwnProperty.call(src, "private_key") || Object.prototype.hasOwnProperty.call(src, "private_key_id")) {
    throw makeError("STATIC_PRIVATE_KEY_SOURCE_FORBIDDEN", "source_credentials must not contain static private key material");
  }
  assertAllowedSubsetKeys(src, ADC_SOURCE_ALLOWED_KEYS, "ADC_SOURCE_UNEXPECTED_KEY", "adc.source_credentials");

  if (src.type !== "authorized_user") {
    throw makeError("UNEXPECTED_SOURCE_CREDENTIAL_TYPE", `source_credentials.type must be authorized_user, got ${String(src.type)}`);
  }
  if (typeof src.client_id !== "string" || src.client_id.trim().length === 0) {
    throw makeError("INVALID_SOURCE_CLIENT_ID", "source_credentials.client_id must be a non-empty string");
  }
  if (typeof src.client_secret !== "string" || src.client_secret.trim().length === 0) {
    throw makeError("INVALID_SOURCE_CLIENT_SECRET", "source_credentials.client_secret must be a non-empty string");
  }
  if (typeof src.refresh_token !== "string" || src.refresh_token.trim().length === 0) {
    throw makeError("MISSING_SOURCE_REFRESH_TOKEN", "source_credentials.refresh_token must be present");
  }
  if (src.quota_project_id !== undefined && src.quota_project_id !== expectedProjectId) {
    throw makeError("SOURCE_QUOTA_PROJECT_MISMATCH", "source_credentials.quota_project_id does not match target project");
  }
  if (src.universe_domain !== undefined && src.universe_domain !== "googleapis.com") {
    throw makeError("UNEXPECTED_SOURCE_UNIVERSE_DOMAIN", "source_credentials.universe_domain must be googleapis.com");
  }

  if (expectedSourceClientId !== null && expectedSourceClientId !== undefined) {
    const trimmedClientId = String(expectedSourceClientId).trim();
    if (trimmedClientId.length > 0 && src.client_id !== trimmedClientId) {
      throw makeError("SOURCE_CLIENT_ID_MISMATCH", "ADC source_credentials.client_id does not match expected origin client");
    }
  }

  // Validacao da conta de origem (quando presente ou esperada) frente a conta impersonada
  if (src.account !== undefined) {
    if (typeof src.account !== "string" || src.account.trim().length === 0) {
      throw makeError("INVALID_SOURCE_ACCOUNT", "source_credentials.account must be a non-empty string when present");
    }
    const normalizedSrcAccount = src.account.trim().toLowerCase();
    if (normalizedSrcAccount === impersonatedSa.toLowerCase()) {
      throw makeError("SOURCE_EQUALS_IMPERSONATED_SA", "Origin account cannot be identical to the impersonated service account");
    }
    if (ANY_SERVICE_ACCOUNT_DOMAIN_RE.test(normalizedSrcAccount)) {
      throw makeError("SOURCE_ACCOUNT_IS_SERVICE_ACCOUNT", "Origin account in authorized_user must not be a service account");
    }
  }
  if (expectedSourceAccount !== null && expectedSourceAccount !== undefined) {
    const trimmedExpectedAcc = String(expectedSourceAccount).trim().toLowerCase();
    if (trimmedExpectedAcc.length > 0) {
      const actualSrcAcc = typeof src.account === "string" ? src.account.trim().toLowerCase() : "";
      if (!actualSrcAcc || actualSrcAcc !== trimmedExpectedAcc) {
        throw makeError("SOURCE_ACCOUNT_MISMATCH", "source_credentials.account is missing or differs from expected origin account");
      }
    }
  }

  return {
    adcType: adc.type,
    impersonatedServiceAccount: impersonatedSa,
    sourceCredentialType: src.type,
    quotaProjectId: adc.quota_project_id ?? null,
    originIdentityNotice:
      "SOURCE_CREDENTIALS_LOCAL_CHECK_ONLY_DOES_NOT_CRYPTOGRAPHICALLY_PROVE_HUMAN_OPERATOR_WITHOUT_OAUTH_AND_CLOUD_AUDIT_EVIDENCE",
  };
}

/**
 * 4. Valida alvo exato da sonda (rejeita explicitamente `(default)` e qualquer limit != 1).
 */
export function validateProbeTarget({
  projectId = EXPECTED_PROJECT_ID,
  databaseId = EXPECTED_DATABASE_ID,
  collectionName = EXPECTED_COLLECTION_NAME,
  limit = PROBE_LIMIT,
} = {}) {
  if (databaseId === FORBIDDEN_DEFAULT_DATABASE_ID) {
    throw makeError("DEFAULT_DATABASE_FORBIDDEN", "Explicitly forbidden to probe (default) Firestore database");
  }
  if (projectId !== EXPECTED_PROJECT_ID) {
    throw makeError("PROBE_PROJECT_ID_MISMATCH", "Probe projectId does not match target project");
  }
  if (databaseId !== EXPECTED_DATABASE_ID) {
    throw makeError("PROBE_DATABASE_ID_MISMATCH", "Probe databaseId does not match target named database");
  }
  if (collectionName !== EXPECTED_COLLECTION_NAME) {
    throw makeError("PROBE_COLLECTION_MISMATCH", "Probe collectionName must be users");
  }
  if (limit !== PROBE_LIMIT) {
    throw makeError("PROBE_LIMIT_INVALID", "Probe limit must be strictly 1");
  }
  return { projectId, databaseId, collectionName, limit };
}

function readRegularInputFile(filePath, missingCode) {
  if (!filePath || !existsSync(filePath)) {
    throw makeError(missingCode, `Required file missing (${missingCode})`);
  }
  const st = lstatSync(filePath);
  if (st.isSymbolicLink() || !st.isFile()) {
    throw makeError("SYMLINK_INPUT_FORBIDDEN", `Input file must be a regular non-symlink file (${missingCode})`);
  }
  return readFileSync(filePath, "utf8");
}

async function defaultLoadFirebaseModules() {
  try {
    const appMod = await import("firebase-admin/app");
    const firestoreMod = await import("firebase-admin/firestore");
    return {
      applicationDefault: appMod.applicationDefault,
      initializeApp: appMod.initializeApp,
      deleteApp: appMod.deleteApp,
      getFirestore: firestoreMod.getFirestore,
    };
  } catch (err) {
    const causeCode = err && typeof err.code === "string" ? err.code : "IMPORT_ERROR";
    throw makeError("FIREBASE_MODULE_LOAD_FAILED", `Failed to dynamically load firebase-admin modules (${causeCode})`);
  }
}

/**
 * 5. Orquestracao fail-closed da sonda com ordem verificavel de eventos:
 *    Etapa A: Validacao criptografica Ed25519 (import dinamico do verificador, sem Firebase);
 *    Etapa B: Validacao de ambiente (`METADATA_SERVER_DETECTION=none`, fonte ADC unica, zero conflitos);
 *    Etapa C: Leitura fisica segura do ADC (absoluto, regular, nao-symlink, permissoes 0600/0400);
 *    Etapa D: Validacao estrita do JSON ADC (sem duplicidades, allowlist, URL, origem vs. impersonada);
 *    Etapa E: Validacao do alvo (`gen-lang-client-0490390966`, banco nomeado != `(default)`, `users`, `limit=1`);
 *    Etapa F: SOMENTE ENTÃO importacao dinamica de `firebase-admin/app` e `firebase-admin/firestore`,
 *             consulta `db.collection("users").select().limit(1).get()` e encerramento obrigatorio via `deleteApp`.
 */
export async function runProbeReadOnlyV4({
  env = process.env,
  targetOverrides = {},
  loadFirebaseModules = defaultLoadFirebaseModules,
  onEvent = null,
} = {}) {
  const emit = (eventName) => {
    if (typeof onEvent === "function") onEvent(eventName);
  };

  // ETAPA A — Carregar dinamicamente verificador Ed25519 e validar registro ANTES de ADC ou Firebase
  emit("STAGE_A_APPROVAL_VERIFY_START");
  const { verifySignedApprovalRecord } = await import("../etapa28/verify-approval-record.candidate.mjs");

  const recordPath = String(env.APPROVED_AUDIT_RECORD_FILE || "").trim();
  const sigPath = String(env.APPROVED_AUDIT_SIGNATURE_FILE || "").trim();
  const pubKeyPath = String(env.TRUSTED_ADMIN_PUBKEY_FILE || "").trim();
  const pubKeyPin = String(env.TRUSTED_ADMIN_PUBKEY_SHA256 || "").trim();
  const expectedSa = String(env.EXPECTED_AUDIT_SA || "").trim();
  const revokedFile = String(env.REVOKED_APPROVAL_IDS_FILE || "").trim();

  if (!expectedSa) {
    throw makeError("EXPECTED_AUDIT_SA_MISSING", "EXPECTED_AUDIT_SA is required");
  }

  const recordJsonText = readRegularInputFile(recordPath, "APPROVAL_RECORD_FILE_MISSING");
  const signatureBase64 = readRegularInputFile(sigPath, "APPROVAL_SIGNATURE_FILE_MISSING");
  const trustedPublicKeyPem = readRegularInputFile(pubKeyPath, "TRUSTED_PUBKEY_FILE_MISSING");

  let revokedIds = [];
  if (revokedFile) {
    let parsedRevoked;
    try {
      parsedRevoked = JSON.parse(readRegularInputFile(revokedFile, "REVOKED_LIST_FILE_MISSING"));
    } catch {
      throw makeError("INVALID_REVOKED_LIST", "REVOKED_APPROVAL_IDS_FILE is not valid JSON");
    }
    if (!Array.isArray(parsedRevoked) || !parsedRevoked.every((v) => typeof v === "string")) {
      throw makeError("INVALID_REVOKED_LIST", "REVOKED_APPROVAL_IDS_FILE must be a string array");
    }
    revokedIds = parsedRevoked;
  }

  const approval = verifySignedApprovalRecord({
    recordJsonText,
    signatureBase64,
    trustedPublicKeyPem,
    trustedPublicKeySha256: pubKeyPin,
    expectedServiceAccountEmail: expectedSa,
    revokedApprovalIds: revokedIds,
  });
  emit("STAGE_A_APPROVAL_VERIFY_OK");

  // ETAPA B — Validar ambiente e bloquear caminhos alternativos de autenticacao
  emit("STAGE_B_ENV_CHECK_START");
  const { adcPath } = assertSafeProbeEnvironment(env);
  emit("STAGE_B_ENV_CHECK_OK");

  // ETAPA C — Ler arquivo ADC controlado com verificacoes de caminho, symlink, tipo e permissoes
  emit("STAGE_C_ADC_READ_START");
  const adcJsonText = readControlledAdcFile(adcPath);
  emit("STAGE_C_ADC_READ_OK");

  // ETAPA D — Validar payload JSON do ADC (allowlist, duplicidades, URL, origem vs. impersonada)
  emit("STAGE_D_ADC_VALIDATE_START");
  const expectedSourceClientId = String(env.EXPECTED_ADC_SOURCE_CLIENT_ID || "").trim() || null;
  const expectedSourceAccount = String(env.EXPECTED_ADC_SOURCE_ACCOUNT || "").trim() || null;
  const adcCheck = validateImpersonatedAdcPayload(adcJsonText, {
    expectedServiceAccountEmail: approval.serviceAccountEmail,
    expectedSourceClientId,
    expectedSourceAccount,
    expectedProjectId: approval.projectId,
  });
  emit("STAGE_D_ADC_VALIDATE_OK");

  // ETAPA E — Validar alvo exato da sonda (rejeita `(default)` e `limit != 1`)
  emit("STAGE_E_TARGET_VALIDATE_START");
  const target = validateProbeTarget({
    projectId: targetOverrides.projectId ?? approval.projectId,
    databaseId: targetOverrides.databaseId ?? approval.databaseId,
    collectionName: targetOverrides.collectionName ?? approval.collectionName,
    limit: targetOverrides.limit ?? PROBE_LIMIT,
  });
  emit("STAGE_E_TARGET_VALIDATE_OK");

  // ETAPA F — Somente agora carregar dinamicamente Firebase Admin, consultar e encerrar em `finally`
  emit("STAGE_F_FIREBASE_IMPORT_START");
  const { applicationDefault, initializeApp, deleteApp, getFirestore } = await loadFirebaseModules();
  emit("STAGE_F_FIREBASE_IMPORT_OK");

  let firebaseApp = null;
  let primaryError = null;
  let resultPayload = null;

  try {
    emit("STAGE_F_FIREBASE_INIT");
    const appName = `probe-readonly-v4-${target.projectId}-${target.databaseId}`;
    firebaseApp = initializeApp(
      {
        credential: applicationDefault(),
        projectId: target.projectId,
      },
      appName
    );

    const db = getFirestore(firebaseApp, target.databaseId);
    emit("STAGE_F_FIRESTORE_QUERY_START");
    // No @google-cloud/firestore@8.7.1, select() sem argumentos projeta `{ fieldPath: "__name__" }`.
    // Zero campos do corpo do documento sao solicitados; porem `document.name` (com UID de ate 1 doc)
    // e recebido em memoria pelo SDK. A sonda acessa exclusivamente `snap.size` e `snap.empty`.
    const snap = await db.collection(target.collectionName).select().limit(target.limit).get();
    emit("STAGE_F_FIRESTORE_QUERY_OK");

    const documentsReturned = Number.isInteger(snap?.size) ? snap.size : 0;
    const hasAtLeastOneDocument = Boolean(snap && snap.empty === false);

    resultPayload = {
      probeVersion: PROBE_VERSION,
      status: "PROBE_READONLY_OK",
      approvalId: approval.approvalId,
      projectId: target.projectId,
      databaseId: target.databaseId,
      collectionName: target.collectionName,
      limit: target.limit,
      adcType: adcCheck.adcType,
      sourceCredentialType: adcCheck.sourceCredentialType,
      wireProjectionField: "__name__",
      documentsReturned,
      hasAtLeastOneDocument,
      sdkMemoryExposureNotice:
        "WIRE_RESPONSE_INCLUDES_DOCUMENT_NAME_WITH_RAW_UID_IN_SDK_MEMORY_NOT_ACCESSED_PROCESSED_OR_LOGGED",
      scopeNotice: "SINGLE_DOCUMENT_CONNECTIVITY_PROBE_ONLY_NOT_FULL_COLLECTION_AUDIT",
    };
  } catch (err) {
    primaryError = err;
  } finally {
    if (firebaseApp) {
      emit("STAGE_F_FIREBASE_CLEANUP_START");
      try {
        await deleteApp(firebaseApp);
        emit("STAGE_F_FIREBASE_CLEANUP_OK");
      } catch {
        emit("STAGE_F_FIREBASE_CLEANUP_FAILED");
        if (primaryError) {
          primaryError.cleanupErrorCode = "FIREBASE_APP_CLEANUP_FAILED";
        } else {
          primaryError = makeError(
            "FIREBASE_APP_CLEANUP_FAILED",
            "Firebase Admin app cleanup via deleteApp() failed after probe query"
          );
        }
      }
    }
  }

  if (primaryError) {
    throw primaryError;
  }
  return resultPayload;
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isDirectExecution()) {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || !args.has("--execute-probe-readonly")) {
    process.stdout.write(
      JSON.stringify(
        {
          probeVersion: PROBE_VERSION,
          status: "DRY_INFO_NO_FIREBASE_CONNECTION",
          targetProjectId: EXPECTED_PROJECT_ID,
          targetDatabaseId: EXPECTED_DATABASE_ID,
          targetCollection: EXPECTED_COLLECTION_NAME,
          limit: PROBE_LIMIT,
          usage:
            "METADATA_SERVER_DETECTION=none node scripts/audit/candidates/etapa29/probe-readonly-v4.etapa29.candidate.mjs --execute-probe-readonly",
        },
        null,
        2
      ) + "\n"
    );
  } else {
    runProbeReadOnlyV4({ env: process.env })
      .then((result) => {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      })
      .catch((err) => {
        const code = err && typeof err.code === "string" ? err.code : "PROBE_READONLY_FAILED";
        const errPayload = {
          probeVersion: PROBE_VERSION,
          status: "PROBE_READONLY_REJECTED",
          errorCode: code,
        };
        if (err && typeof err.cleanupErrorCode === "string") {
          errPayload.cleanupErrorCode = err.cleanupErrorCode;
        }
        process.stderr.write(JSON.stringify(errPayload) + "\n");
        process.exitCode = 1;
      });
  }
}
