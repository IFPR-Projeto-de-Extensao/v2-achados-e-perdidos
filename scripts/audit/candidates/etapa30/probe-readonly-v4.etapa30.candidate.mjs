#!/usr/bin/env node
/**
 * LOCALIZA+ v1.10.13 — Etapa 30 Consolidada (Copia Candidata)
 * Sonda read-only `probe-readonly-v4` endurecida de ponta a ponta.
 *
 * Consolidacao integral das correcoes locais das Etapas 28, 29 e 30:
 * - Zero imports estaticos externos (apenas built-ins `node:fs`, `node:os`, `node:path`, `node:url`);
 *   todos os verificadores locais e modulos `firebase-admin/*` sao carregados dinamicamente na ordem estrita dos gates.
 * - Gate A: Verificacao criptografica Ed25519 + pin SPKI + autoridade do signatario (`AUTHORIZED_ISSUER_KEY_IDS`) +
 *           revogacao + protecao contra replay (`USED_APPROVAL_IDS_FILE`).
 * - Gate B: Avaliacao obrigatoria da Matriz de Prontidao IAM e Data Access Audit Logs (13 requisitos, `IAM_READINESS_EVIDENCE_FILE`),
 *           rejeitando qualquer requisito `FAIL` ou `NOT_VERIFIED` (nunca converte ausencia de evidencia em aprovacao).
 * - Gate C: Validacao inequivoca do ambiente e protecao contra Metadata Server:
 *           - Exige `METADATA_SERVER_DETECTION=none` (rejeita `NO_GCE_CHECK=true` isolado);
 *           - Bloqueia colisoes case-insensitive de `GOOGLE_APPLICATION_CREDENTIALS` e 21 variaveis conflitantes;
 *           - Bloqueia ADC well-known paralelo sob `HOME`, `APPDATA` e `XDG_CONFIG_HOME`;
 *           - Deteccao local (zero rede) de residencia GCP Compute Engine via DMI/BIOS e prefixo MAC `42:01:` (`GCP_COMPUTE_RESIDENCY_DETECTED`).
 * - Gate D: Leitura fisica segura do ADC: caminho absoluto, arquivo regular, sem symlink direto nem em diretorios pais,
 *           permissoes do arquivo `0600`/`0400` (`(mode & 0o077) === 0`) E diretorio pai privado `0700` (`(dirMode & 0o077) === 0`).
 * - Gate E: Validacao estrita do JSON ADC: sem chaves duplicadas, allowlist estrita, URL canonica, `client_secret` obrigatorio,
 *           zero chave privada estatica, separacao explicita das 5 identidades (operador humano, OAuth, origem, SA efetiva, SA impersonada).
 * - Gate F: Validacao estrita do alvo (`gen-lang-client-0490390966`, banco nomeado != `(default)`, `users`, `limit === 1`, timeout valido).
 * - Gate G: Somente apos A–F, importacao dinamica de `firebase-admin/*`, consulta `select().limit(1).get()` com timeout
 *           (`PROBE_QUERY_TIMEOUT`) e suporte a interrupcao (`AbortSignal` / `SIGINT` / `SIGTERM`), leitura exclusiva de
 *           `snap.size` e `snap.empty`, e encerramento obrigatorio via `deleteApp()` sem mascarar falhas (`FIREBASE_APP_CLEANUP_FAILED`).
 * - CLI fail-closed: rejeita argumentos desconhecidos (`UNEXPECTED_CLI_ARGUMENT`) e sem `--execute-probe-readonly` nao conecta ao Firebase.
 */

import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PROBE_VERSION = "probe-readonly-v4-etapa30-candidate";
export const EXPECTED_PROJECT_ID = "gen-lang-client-0490390966";
export const EXPECTED_DATABASE_ID = "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1";
export const EXPECTED_COLLECTION_NAME = "users";
export const PROBE_LIMIT = 1;
export const FORBIDDEN_DEFAULT_DATABASE_ID = "(default)";
export const DEFAULT_QUERY_TIMEOUT_MS = 15_000;
export const MIN_QUERY_TIMEOUT_MS = 100;
export const MAX_QUERY_TIMEOUT_MS = 60_000;

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
  "GAE_SERVICE",
  "GOOGLE_CLOUD_WORKSTATIONS",
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
const SAFE_ERROR_CODE_RE = /^[A-Za-z0-9._-]{1,64}$/;
const ALLOWED_CLI_ARGS = new Set(["--execute-probe-readonly", "--help"]);

function makeError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

export function sanitizeErrorCode(rawCode, fallback = "PROBE_READONLY_FAILED") {
  if (typeof rawCode === "string" && SAFE_ERROR_CODE_RE.test(rawCode)) {
    return rawCode;
  }
  return fallback;
}

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
 * Deteccao estritamente local (ZERO trafego de rede) de residencia em VM Google Compute Engine,
 * espelhando os heuristicos de `gcp-metadata@6.1.1/build/src/gcp-residency.js` (DMI/BIOS e prefixo MAC `42:01:`).
 */
export function detectLocalGcpResidency({
  readDmiFile = (p) => (existsSync(p) ? readFileSync(p, "utf8") : ""),
  getNetInterfaces = () => networkInterfaces(),
} = {}) {
  const indicators = [];
  const dmiPaths = ["/sys/class/dmi/id/product_name", "/sys/class/dmi/id/bios_vendor"];
  for (const p of dmiPaths) {
    try {
      const content = String(readDmiFile(p) || "").trim();
      if (/google/i.test(content)) {
        indicators.push("DMI_GOOGLE_DETECTED");
        break;
      }
    } catch {
      // Arquivo DMI inacessivel fora de Linux ou sem permissao — segue para MAC
    }
  }

  try {
    const ifaces = getNetInterfaces() || {};
    for (const entries of Object.values(ifaces)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const mac = typeof entry?.mac === "string" ? entry.mac.toLowerCase() : "";
        if (mac.startsWith("42:01:")) {
          indicators.push("GCE_MAC_PREFIX_DETECTED");
          break;
        }
      }
      if (indicators.includes("GCE_MAC_PREFIX_DETECTED")) break;
    }
  } catch {
    // Falha de enumeracao de interfaces nao assume residencia
  }

  return { isGcpComputeHost: indicators.length > 0, indicators };
}

/**
 * Gate C — Validacao inequivoca de ambiente, variaveis conflitantes (case-insensitive) e residencia GCP.
 */
export function assertSafeProbeEnvironment(env = process.env, { residencyDetector = detectLocalGcpResidency } = {}) {
  if (!env || typeof env !== "object") {
    throw makeError("INVALID_ENVIRONMENT", "Environment map is invalid");
  }

  const blockedUpper = new Set(BLOCKED_ENV_VARS.map((k) => k.toUpperCase()));
  for (const rawKey of Object.keys(env)) {
    const val = env[rawKey];
    if (typeof val !== "string" || val.trim().length === 0) continue;
    const upperKey = rawKey.toUpperCase();

    // Qualquer variacao de caixa diferente de GOOGLE_APPLICATION_CREDENTIALS (ex.: google_application_credentials) e bloqueada
    if (upperKey === "GOOGLE_APPLICATION_CREDENTIALS" && rawKey !== "GOOGLE_APPLICATION_CREDENTIALS") {
      throw makeError("CONFLICTING_ADC_ENV_VARS", `Conflicting case variant of GOOGLE_APPLICATION_CREDENTIALS is set: ${rawKey}`);
    }
    if (upperKey === "METADATA_SERVER_DETECTION" && rawKey !== "METADATA_SERVER_DETECTION") {
      throw makeError("CONFLICTING_METADATA_ENV_VARS", `Conflicting case variant of METADATA_SERVER_DETECTION is set: ${rawKey}`);
    }
    if (blockedUpper.has(upperKey)) {
      throw makeError("BLOCKED_ENV_VAR_PRESENT", `Blocked environment variable is set: ${rawKey}`);
    }
  }

  const msd = String(env.METADATA_SERVER_DETECTION || "").trim().toLowerCase();
  if (msd !== "none") {
    throw makeError(
      "METADATA_SERVER_DETECTION_NOT_NONE",
      "METADATA_SERVER_DETECTION must be explicitly set to 'none' (NO_GCE_CHECK is ignored by gcp-metadata@6.1.1)"
    );
  }

  const residency = residencyDetector();
  if (residency && residency.isGcpComputeHost === true) {
    throw makeError(
      "GCP_COMPUTE_RESIDENCY_DETECTED",
      "Execution blocked: local host exhibits GCP Compute Engine residency where Metadata Server fallback may exist"
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

  // Bloqueia existencia de ADC well-known paralelo sob HOME, APPDATA ou XDG_CONFIG_HOME
  const wellKnownCandidates = [];
  if (typeof env.HOME === "string" && env.HOME.trim().length > 0) {
    wellKnownCandidates.push(join(env.HOME.trim(), ".config", "gcloud", "application_default_credentials.json"));
  }
  if (typeof env.XDG_CONFIG_HOME === "string" && env.XDG_CONFIG_HOME.trim().length > 0) {
    wellKnownCandidates.push(join(env.XDG_CONFIG_HOME.trim(), "gcloud", "application_default_credentials.json"));
  }
  if (typeof env.APPDATA === "string" && env.APPDATA.trim().length > 0) {
    wellKnownCandidates.push(join(env.APPDATA.trim(), "gcloud", "application_default_credentials.json"));
  }
  for (const wk of wellKnownCandidates) {
    if (existsSync(wk) && resolve(wk) !== resolve(gacPath)) {
      throw makeError("WELL_KNOWN_ADC_CONFLICT", "A separate well-known gcloud ADC file exists under HOME/XDG_CONFIG_HOME/APPDATA");
    }
  }

  return { adcPath: resolve(gacPath) };
}

/**
 * Gate D — Leitura fisica segura do ADC (caminho absoluto, arquivo regular, sem symlinks, arquivo 0600/0400 E diretorio pai 0700).
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
    throw makeError("ADC_SPECIAL_FILE_FORBIDDEN", "ADC path must be a regular file");
  }

  const resolvedExpected = resolve(adcPath);
  const realResolved = fsOps.realpathSync(adcPath);
  if (realResolved !== resolvedExpected) {
    throw makeError("ADC_PARENT_SYMLINK_FORBIDDEN", "ADC path contains a symbolic link in parent directory");
  }

  const parentStat = fsOps.lstatSync(dirname(resolvedExpected));
  if (!parentStat.isDirectory() || (parentStat.mode & 0o077) !== 0) {
    throw makeError(
      "ADC_PARENT_DIR_INSECURE_PERMISSIONS",
      "ADC parent directory must be private (0700, no group or other permissions)"
    );
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
 * Gate E — Validacao estrita do payload ADC e separacao explicita das 5 identidades.
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
    effectiveServiceAccount: impersonatedSa,
    sourceCredentialType: src.type,
    quotaProjectId: adc.quota_project_id ?? null,
    identityModelNotice:
      "ADC_LOCAL_VALIDATION_ONLY_REQUIRES_EXTERNAL_OAUTH_TOKENINFO_AND_CLOUD_AUDIT_LOGS_TO_PROVE_FIVE_IDENTITY_CHAIN",
  };
}

/**
 * Gate F — Validacao estrita do alvo e timeout da sonda.
 */
export function validateProbeTarget({
  projectId = EXPECTED_PROJECT_ID,
  databaseId = EXPECTED_DATABASE_ID,
  collectionName = EXPECTED_COLLECTION_NAME,
  limit = PROBE_LIMIT,
  queryTimeoutMs = DEFAULT_QUERY_TIMEOUT_MS,
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
  if (!Number.isInteger(queryTimeoutMs) || queryTimeoutMs < MIN_QUERY_TIMEOUT_MS || queryTimeoutMs > MAX_QUERY_TIMEOUT_MS) {
    throw makeError("PROBE_TIMEOUT_INVALID", `queryTimeoutMs must be integer ${MIN_QUERY_TIMEOUT_MS}..${MAX_QUERY_TIMEOUT_MS}`);
  }
  return { projectId, databaseId, collectionName, limit, queryTimeoutMs };
}

function readJsonStringArraySecure(readSecureRegularFile, filePath, missingCode, invalidCode) {
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
    const causeCode = sanitizeErrorCode(err?.code, "IMPORT_ERROR");
    throw makeError("FIREBASE_MODULE_LOAD_FAILED", `Failed to dynamically load firebase-admin modules (${causeCode})`);
  }
}

function runWithTimeoutAndAbort(promiseFactory, timeoutMs, abortSignal) {
  if (abortSignal && abortSignal.aborted) {
    return Promise.reject(makeError("PROBE_INTERRUPTED", "Probe aborted before Firestore query started"));
  }
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(makeError("PROBE_INTERRUPTED", "Probe interrupted by signal during Firestore query"));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (abortSignal) abortSignal.removeEventListener("abort", onAbort);
      rejectPromise(makeError("PROBE_QUERY_TIMEOUT", `Firestore read-only probe timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    if (typeof timer.unref === "function") timer.unref();

    if (abortSignal) {
      abortSignal.addEventListener("abort", onAbort, { once: true });
    }

    Promise.resolve()
      .then(() => promiseFactory())
      .then(
        (val) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (abortSignal) abortSignal.removeEventListener("abort", onAbort);
          resolvePromise(val);
        },
        (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (abortSignal) abortSignal.removeEventListener("abort", onAbort);
          rejectPromise(err);
        }
      );
  });
}

/**
 * Orquestracao fail-closed de ponta a ponta (Gates A -> B -> C -> D -> E -> F -> G).
 */
export async function runProbeReadOnlyV4({
  env = process.env,
  targetOverrides = {},
  loadFirebaseModules = defaultLoadFirebaseModules,
  residencyDetector = detectLocalGcpResidency,
  abortSignal = null,
  onEvent = null,
} = {}) {
  const emit = (eventName) => {
    if (typeof onEvent === "function") onEvent(eventName);
  };

  // GATE A — Verificacao criptografica Ed25519 + pin SPKI + autoridade do signatario + revogacao + replay
  emit("GATE_A_APPROVAL_VERIFY_START");
  const { readSecureRegularFile, verifySignedApprovalRecord } = await import(
    "./verify-approval-record.etapa30.candidate.mjs"
  );

  const recordPath = String(env.APPROVED_AUDIT_RECORD_FILE || "").trim();
  const sigPath = String(env.APPROVED_AUDIT_SIGNATURE_FILE || "").trim();
  const pubKeyPath = String(env.TRUSTED_ADMIN_PUBKEY_FILE || "").trim();
  const pubKeyPin = String(env.TRUSTED_ADMIN_PUBKEY_SHA256 || "").trim();
  const expectedSa = String(env.EXPECTED_AUDIT_SA || "").trim();
  const revokedFile = String(env.REVOKED_APPROVAL_IDS_FILE || "").trim();
  const usedFile = String(env.USED_APPROVAL_IDS_FILE || "").trim();
  const authorizedIssuersRaw = String(env.AUTHORIZED_ISSUER_KEY_IDS || "").trim();

  if (!expectedSa) {
    throw makeError("EXPECTED_AUDIT_SA_MISSING", "EXPECTED_AUDIT_SA is required");
  }

  const recordJsonText = readSecureRegularFile(recordPath, "APPROVAL_RECORD_FILE_MISSING");
  const signatureBase64 = readSecureRegularFile(sigPath, "APPROVAL_SIGNATURE_FILE_MISSING");
  const trustedPublicKeyPem = readSecureRegularFile(pubKeyPath, "TRUSTED_PUBKEY_FILE_MISSING");
  const revokedIds = revokedFile
    ? readJsonStringArraySecure(readSecureRegularFile, revokedFile, "REVOKED_LIST_FILE_MISSING", "INVALID_REVOKED_LIST")
    : [];
  const usedIds = usedFile
    ? readJsonStringArraySecure(
        readSecureRegularFile,
        usedFile,
        "USED_APPROVAL_LIST_FILE_MISSING",
        "INVALID_USED_APPROVAL_LIST"
      )
    : [];
  const authorizedIssuerKeyIds = authorizedIssuersRaw
    ? authorizedIssuersRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  const approval = verifySignedApprovalRecord({
    recordJsonText,
    signatureBase64,
    trustedPublicKeyPem,
    trustedPublicKeySha256: pubKeyPin,
    expectedServiceAccountEmail: expectedSa,
    authorizedIssuerKeyIds,
    revokedApprovalIds: revokedIds,
    usedApprovalIds: usedIds,
  });
  emit("GATE_A_APPROVAL_VERIFY_OK");

  // GATE B — Avaliacao obrigatoria da Matriz IAM e Data Access Audit Logs (13 requisitos)
  emit("GATE_B_IAM_READINESS_START");
  const iamEvidencePath = String(env.IAM_READINESS_EVIDENCE_FILE || "").trim();
  const iamEvidenceText = readSecureRegularFile(iamEvidencePath, "IAM_READINESS_EVIDENCE_FILE_MISSING");
  const { evaluateIamReadinessBundle } = await import("./evaluate-iam-readiness.etapa30.candidate.mjs");
  const iamReadiness = evaluateIamReadinessBundle(iamEvidenceText, {
    expectedServiceAccountEmail: approval.serviceAccountEmail,
  });
  if (!iamReadiness.approvedForExecution) {
    throw makeError(
      iamReadiness.readinessStatus === "BLOCKED_FAIL" ? "IAM_READINESS_FAILED" : "IAM_READINESS_INCOMPLETE",
      `IAM readiness gate blocked execution (${iamReadiness.readinessStatus})`
    );
  }
  emit("GATE_B_IAM_READINESS_OK");

  // GATE C — Validacao inequivoca de ambiente, bloqueio de Metadata Server e residencia GCP
  emit("GATE_C_ENV_AND_RESIDENCY_START");
  const { adcPath } = assertSafeProbeEnvironment(env, { residencyDetector });
  emit("GATE_C_ENV_AND_RESIDENCY_OK");

  // GATE D — Leitura fisica segura do arquivo ADC (arquivo 0600/0400 + diretorio pai 0700 + sem symlinks)
  emit("GATE_D_ADC_READ_START");
  const adcJsonText = readControlledAdcFile(adcPath);
  emit("GATE_D_ADC_READ_OK");

  // GATE E — Validacao rigorosa do payload ADC e separacao das 5 identidades
  emit("GATE_E_ADC_VALIDATE_START");
  const expectedSourceClientId = String(env.EXPECTED_ADC_SOURCE_CLIENT_ID || "").trim() || null;
  const expectedSourceAccount = String(env.EXPECTED_ADC_SOURCE_ACCOUNT || "").trim() || null;
  const adcCheck = validateImpersonatedAdcPayload(adcJsonText, {
    expectedServiceAccountEmail: approval.serviceAccountEmail,
    expectedSourceClientId,
    expectedSourceAccount,
    expectedProjectId: approval.projectId,
  });
  emit("GATE_E_ADC_VALIDATE_OK");

  // GATE F — Validacao estrita do alvo e timeout
  emit("GATE_F_TARGET_VALIDATE_START");
  const target = validateProbeTarget({
    projectId: targetOverrides.projectId ?? approval.projectId,
    databaseId: targetOverrides.databaseId ?? approval.databaseId,
    collectionName: targetOverrides.collectionName ?? approval.collectionName,
    limit: targetOverrides.limit ?? PROBE_LIMIT,
    queryTimeoutMs: targetOverrides.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS,
  });
  emit("GATE_F_TARGET_VALIDATE_OK");

  // GATE G — Somente agora carregar dinamicamente Firebase Admin, consultar com timeout e encerrar sem mascarar erros
  emit("GATE_G_FIREBASE_IMPORT_START");
  const { applicationDefault, initializeApp, deleteApp, getFirestore } = await loadFirebaseModules();
  emit("GATE_G_FIREBASE_IMPORT_OK");

  let firebaseApp = null;
  let primaryError = null;
  let resultPayload = null;

  try {
    emit("GATE_G_FIREBASE_INIT");
    const appName = `probe-readonly-v4-${target.projectId}-${target.databaseId}`;
    firebaseApp = initializeApp(
      {
        credential: applicationDefault(),
        projectId: target.projectId,
      },
      appName
    );

    const db = getFirestore(firebaseApp, target.databaseId);
    emit("GATE_G_FIRESTORE_QUERY_START");
    const snap = await runWithTimeoutAndAbort(
      () => db.collection(target.collectionName).select().limit(target.limit).get(),
      target.queryTimeoutMs,
      abortSignal
    );
    emit("GATE_G_FIRESTORE_QUERY_OK");

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
      iamReadinessStatus: iamReadiness.readinessStatus,
      wireProjectionField: "__name__",
      documentsReturned,
      hasAtLeastOneDocument,
      collectionEmpty: !hasAtLeastOneDocument,
      sdkMemoryExposureNotice:
        "WIRE_RESPONSE_INCLUDES_DOCUMENT_NAME_WITH_RAW_UID_IN_SDK_MEMORY_NOT_ACCESSED_PROCESSED_OR_LOGGED",
      scopeNotice: "SINGLE_DOCUMENT_CONNECTIVITY_PROBE_ONLY_NOT_FULL_COLLECTION_AUDIT",
    };
  } catch (err) {
    primaryError = err;
  } finally {
    if (firebaseApp) {
      emit("GATE_G_FIREBASE_CLEANUP_START");
      try {
        await deleteApp(firebaseApp);
        emit("GATE_G_FIREBASE_CLEANUP_OK");
      } catch {
        emit("GATE_G_FIREBASE_CLEANUP_FAILED");
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

export function parseCliArguments(argvSlice) {
  for (const arg of argvSlice) {
    if (!ALLOWED_CLI_ARGS.has(arg)) {
      throw makeError("UNEXPECTED_CLI_ARGUMENT", `Unexpected CLI argument rejected: ${arg}`);
    }
  }
  const argSet = new Set(argvSlice);
  return {
    help: argSet.has("--help"),
    execute: argSet.has("--execute-probe-readonly"),
  };
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isDirectExecution()) {
  let parsedArgs;
  try {
    parsedArgs = parseCliArguments(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(
      JSON.stringify({
        probeVersion: PROBE_VERSION,
        status: "PROBE_READONLY_REJECTED",
        errorCode: sanitizeErrorCode(err?.code, "UNEXPECTED_CLI_ARGUMENT"),
      }) + "\n"
    );
    process.exitCode = 2;
  }

  if (parsedArgs) {
    if (parsedArgs.help || !parsedArgs.execute) {
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
              "METADATA_SERVER_DETECTION=none node scripts/audit/candidates/etapa30/probe-readonly-v4.etapa30.candidate.mjs --execute-probe-readonly",
          },
          null,
          2
        ) + "\n"
      );
    } else {
      const controller = new AbortController();
      const onSignal = () => controller.abort();
      process.once("SIGINT", onSignal);
      process.once("SIGTERM", onSignal);

      runProbeReadOnlyV4({ env: process.env, abortSignal: controller.signal })
        .then((result) => {
          process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        })
        .catch((err) => {
          const code = sanitizeErrorCode(err?.code, "PROBE_READONLY_FAILED");
          const errPayload = {
            probeVersion: PROBE_VERSION,
            status: "PROBE_READONLY_REJECTED",
            errorCode: code,
          };
          if (err && typeof err.cleanupErrorCode === "string") {
            errPayload.cleanupErrorCode = sanitizeErrorCode(err.cleanupErrorCode, "FIREBASE_APP_CLEANUP_FAILED");
          }
          process.stderr.write(JSON.stringify(errPayload) + "\n");
          process.exitCode = 1;
        })
        .finally(() => {
          process.removeListener("SIGINT", onSignal);
          process.removeListener("SIGTERM", onSignal);
        });
    }
  }
}
