#!/usr/bin/env node
/**
 * LOCALIZA+ v1.10.13 — Etapa 28 (Copia Candidata Integral)
 * Sonda read-only `probe-readonly-v4` para verificacao minima de conectividade ao banco nomeado.
 *
 * ATENCAO — LIMITACAO DE ESCOPO:
 * - Esta sonda executa no maximo `db.collection("users").select().limit(1).get()` quando
 *   explicitamente invocada em estacao externa autorizada com `--execute-probe-readonly`.
 * - A sonda de 1 documento NAO comprova integridade, compatibilidade ou cobertura da colecao `/users`,
 *   NAO substitui a auditoria integral e NAO comprova ausencia de permissoes IAM excessivas.
 * - Sem `--execute-probe-readonly`, o script NAO conecta ao Firebase, NAO le ADC e NAO emite tokens.
 * - Zero imports estaticos de `firebase-admin` e zero metodos de escrita no codigo.
 */

import { existsSync, lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  EXPECTED_COLLECTION_NAME,
  EXPECTED_DATABASE_ID,
  EXPECTED_PROJECT_ID,
  SERVICE_ACCOUNT_RE,
  verifySignedApprovalRecord,
} from "./verify-approval-record.candidate.mjs";

export const PROBE_VERSION = "probe-readonly-v4";
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
  "CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT",
  "GOOGLE_API_USE_CLIENT_CERTIFICATE",
  "NODE_TLS_REJECT_UNAUTHORIZED",
]);

const IMPERSONATION_PATH_RE =
  /^\/v1\/projects\/-\/serviceAccounts\/([a-z][a-z0-9-]{4,28}[a-z0-9]@gen-lang-client-0490390966\.iam\.gserviceaccount\.com):generateAccessToken$/;

function makeError(code, message) {
  return Object.assign(new Error(message), { code });
}

/**
 * 1. Bloqueia variaveis de ambiente capazes de redirecionar projeto, emuladores,
 *    credenciais ou Metadata Server, e exige NO_GCE_CHECK=true.
 */
export function assertSafeProbeEnvironment(env = process.env) {
  if (!env || typeof env !== "object") {
    throw makeError("INVALID_ENVIRONMENT", "Environment map is invalid");
  }
  for (const key of BLOCKED_ENV_VARS) {
    const val = env[key];
    if (typeof val === "string" && val.trim().length > 0) {
      throw makeError("BLOCKED_ENV_VAR_PRESENT", `Blocked environment variable is set: ${key}`);
    }
  }
  if (String(env.NO_GCE_CHECK || "").trim().toLowerCase() !== "true") {
    throw makeError("METADATA_FALLBACK_NOT_DISABLED", "NO_GCE_CHECK must be explicitly set to 'true'");
  }
  const adcPath = typeof env.GOOGLE_APPLICATION_CREDENTIALS === "string" ? env.GOOGLE_APPLICATION_CREDENTIALS.trim() : "";
  if (!adcPath) {
    throw makeError("ADC_FILE_ENV_MISSING", "GOOGLE_APPLICATION_CREDENTIALS must point to an explicit ADC file");
  }
  return { adcPath };
}

/**
 * 2. Valida estritamente o JSON de credenciais ADC de impersonacao:
 *    - type === "impersonated_service_account"
 *    - URL de impersonacao sem redirecionamento de host, porta, usuario/senha, caminho ou query/hash
 *    - Correspondencia exata da conta de servico com o registro assinado Ed25519
 *    - source_credentials obrigatoriamente `authorized_user` (bloqueia chave privada estatica)
 *    - delegates vazio/ausente, quota_project_id coerente, universe_domain padrao
 */
export function validateImpersonatedAdcPayload(
  adcJsonText,
  {
    expectedServiceAccountEmail,
    expectedSourceClientId = null,
    expectedProjectId = EXPECTED_PROJECT_ID,
  }
) {
  if (typeof expectedServiceAccountEmail !== "string" || !SERVICE_ACCOUNT_RE.test(expectedServiceAccountEmail)) {
    throw makeError("INVALID_EXPECTED_SERVICE_ACCOUNT", "Expected service account email is invalid");
  }
  if (typeof adcJsonText !== "string" || adcJsonText.trim().length === 0) {
    throw makeError("EMPTY_ADC_PAYLOAD", "ADC file content is empty");
  }

  let adc;
  try {
    adc = JSON.parse(adcJsonText);
  } catch {
    throw makeError("INVALID_ADC_JSON", "ADC file is not valid JSON");
  }
  if (!adc || typeof adc !== "object" || Array.isArray(adc)) {
    throw makeError("INVALID_ADC_STRUCTURE", "ADC payload must be a JSON object");
  }
  if (adc.type !== "impersonated_service_account") {
    throw makeError("UNEXPECTED_ADC_TYPE", `ADC type must be impersonated_service_account, got ${String(adc.type)}`);
  }

  // Validacao estrita da URL de impersonacao
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
  // Nota: URL API normaliza :443 para "", portanto verificamos tambem a string bruta contra porta explicita
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

  // Validacao de delegates (sem cadeia oculta de delegacao)
  if (adc.delegates !== undefined) {
    if (!Array.isArray(adc.delegates) || adc.delegates.length > 0) {
      throw makeError("NON_EMPTY_DELEGATES_FORBIDDEN", "ADC delegates chain must be empty");
    }
  }

  // Validacao de quota_project_id e universe_domain
  if (adc.quota_project_id !== undefined && adc.quota_project_id !== expectedProjectId) {
    throw makeError("QUOTA_PROJECT_MISMATCH", "ADC quota_project_id does not match target project");
  }
  if (adc.universe_domain !== undefined && adc.universe_domain !== "googleapis.com") {
    throw makeError("UNEXPECTED_UNIVERSE_DOMAIN", "ADC universe_domain must be googleapis.com");
  }

  // Validacao das credenciais de origem (source_credentials)
  const src = adc.source_credentials;
  if (!src || typeof src !== "object" || Array.isArray(src)) {
    throw makeError("MISSING_SOURCE_CREDENTIALS", "ADC source_credentials must be present");
  }
  if (Object.prototype.hasOwnProperty.call(src, "private_key") || Object.prototype.hasOwnProperty.call(src, "private_key_id")) {
    throw makeError("STATIC_PRIVATE_KEY_SOURCE_FORBIDDEN", "source_credentials must not contain static private key material");
  }
  if (src.type !== "authorized_user") {
    throw makeError("UNEXPECTED_SOURCE_CREDENTIAL_TYPE", `source_credentials.type must be authorized_user, got ${String(src.type)}`);
  }
  if (typeof src.client_id !== "string" || src.client_id.trim().length === 0) {
    throw makeError("INVALID_SOURCE_CLIENT_ID", "source_credentials.client_id must be a non-empty string");
  }
  if (typeof src.refresh_token !== "string" || src.refresh_token.trim().length === 0) {
    throw makeError("MISSING_SOURCE_REFRESH_TOKEN", "source_credentials.refresh_token must be present");
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

  return {
    adcType: adc.type,
    impersonatedServiceAccount: impersonatedSa,
    sourceCredentialType: src.type,
    quotaProjectId: adc.quota_project_id ?? null,
    originIdentityNotice:
      "SOURCE_CREDENTIALS_TYPE_CHECKED_ONLY_DOES_NOT_PROVE_HUMAN_OPERATOR_EMAIL_WITHOUT_OAUTH_TOKENINFO_AND_IAM_EVIDENCE",
  };
}

/**
 * 3. Valida alvo exato da sonda (rejeita explicitamente `(default)` e qualquer limit != 1).
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

function readRegularFile(filePath, missingCode) {
  if (!filePath || !existsSync(filePath)) {
    throw makeError(missingCode, `Required file missing (${missingCode})`);
  }
  const st = lstatSync(filePath);
  if (st.isSymbolicLink() || !st.isFile()) {
    throw makeError("SYMLINK_INPUT_FORBIDDEN", `File must be a regular non-symlink file (${missingCode})`);
  }
  return readFileSync(filePath, "utf8");
}

/**
 * 4. Orquestracao completa da sonda com validacao fail-closed ANTES de qualquer import
 *    ou inicializacao do Firebase Admin, tratamento de erros, `finally` e `deleteApp(app)`.
 */
export async function runProbeReadOnlyV4({
  env = process.env,
  targetOverrides = {},
  executeLiveQuery = null,
} = {}) {
  // ETAPA A — Validar registro assinado Ed25519 ANTES de ler ADC ou inicializar Firebase Admin
  const recordPath = String(env.APPROVED_AUDIT_RECORD_FILE || "").trim();
  const sigPath = String(env.APPROVED_AUDIT_SIGNATURE_FILE || "").trim();
  const pubKeyPath = String(env.TRUSTED_ADMIN_PUBKEY_FILE || "").trim();
  const pubKeyPin = String(env.TRUSTED_ADMIN_PUBKEY_SHA256 || "").trim();
  const expectedSa = String(env.EXPECTED_AUDIT_SA || "").trim();
  const revokedFile = String(env.REVOKED_APPROVAL_IDS_FILE || "").trim();

  if (!expectedSa) {
    throw makeError("EXPECTED_AUDIT_SA_MISSING", "EXPECTED_AUDIT_SA is required");
  }

  const recordJsonText = readRegularFile(recordPath, "APPROVAL_RECORD_FILE_MISSING");
  const signatureBase64 = readRegularFile(sigPath, "APPROVAL_SIGNATURE_FILE_MISSING");
  const trustedPublicKeyPem = readRegularFile(pubKeyPath, "TRUSTED_PUBKEY_FILE_MISSING");

  let revokedIds = [];
  if (revokedFile) {
    const parsedRevoked = JSON.parse(readRegularFile(revokedFile, "REVOKED_LIST_FILE_MISSING"));
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

  // ETAPA B — Validar variaveis de ambiente bloqueadas e desativacao de Metadata Server
  const { adcPath } = assertSafeProbeEnvironment(env);

  // ETAPA C — Ler e validar o arquivo ADC de impersonacao contra a SA aprovada
  const adcJsonText = readRegularFile(adcPath, "ADC_FILE_MISSING");
  const expectedSourceClientId = String(env.EXPECTED_ADC_SOURCE_CLIENT_ID || "").trim() || null;
  const adcCheck = validateImpersonatedAdcPayload(adcJsonText, {
    expectedServiceAccountEmail: approval.serviceAccountEmail,
    expectedSourceClientId,
    expectedProjectId: approval.projectId,
  });

  // ETAPA D — Validar alvo exato (rejeita `(default)` e qualquer limit != 1)
  const target = validateProbeTarget({
    projectId: targetOverrides.projectId ?? approval.projectId,
    databaseId: targetOverrides.databaseId ?? approval.databaseId,
    collectionName: targetOverrides.collectionName ?? approval.collectionName,
    limit: targetOverrides.limit ?? PROBE_LIMIT,
  });

  // ETAPA E — Consulta read-only minima (`users`, `limit(1)`) com encerramento garantido em `finally`
  let firebaseApp = null;
  let deleteAppFn = null;
  try {
    let documentsReturned;
    let hasAtLeastOneDocument;

    if (typeof executeLiveQuery === "function") {
      const injected = await executeLiveQuery({ target, approval, adcCheck });
      documentsReturned = injected.size;
      hasAtLeastOneDocument = !injected.empty;
    } else {
      const { applicationDefault, deleteApp, initializeApp } = await import("firebase-admin/app");
      const { getFirestore } = await import("firebase-admin/firestore");
      deleteAppFn = deleteApp;

      const appName = `probe-readonly-v4-${target.projectId}-${target.databaseId}`;
      firebaseApp = initializeApp(
        {
          credential: applicationDefault(),
          projectId: target.projectId,
        },
        appName
      );

      const db = getFirestore(firebaseApp, target.databaseId);
      // `.select()` sem campos evita trafegar campos do documento; apenas `snap.size` e `snap.empty` sao lidos.
      const snap = await db.collection(target.collectionName).select().limit(target.limit).get();
      documentsReturned = snap.size;
      hasAtLeastOneDocument = !snap.empty;
    }

    return {
      probeVersion: PROBE_VERSION,
      status: "PROBE_READONLY_OK",
      approvalId: approval.approvalId,
      projectId: target.projectId,
      databaseId: target.databaseId,
      collectionName: target.collectionName,
      limit: target.limit,
      adcType: adcCheck.adcType,
      sourceCredentialType: adcCheck.sourceCredentialType,
      documentsReturned,
      hasAtLeastOneDocument,
      scopeNotice: "SINGLE_DOCUMENT_CONNECTIVITY_PROBE_ONLY_NOT_FULL_COLLECTION_AUDIT",
    };
  } finally {
    if (firebaseApp && typeof deleteAppFn === "function") {
      try {
        await deleteAppFn(firebaseApp);
      } catch {
        // Evita mascarar erro principal de execucao
      }
    }
  }
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
          usage: "NO_GCE_CHECK=true node scripts/audit/candidates/etapa28/probe-readonly-v4.candidate.mjs --execute-probe-readonly",
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
        process.stderr.write(
          JSON.stringify({
            probeVersion: PROBE_VERSION,
            status: "PROBE_READONLY_REJECTED",
            errorCode: code,
          }) + "\n"
        );
        process.exitCode = 1;
      });
  }
}
