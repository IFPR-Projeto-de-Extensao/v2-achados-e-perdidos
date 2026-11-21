/**
 * LOCALIZA+ v1.10.13 — Etapa 29
 * Suite de testes sinteticos independentes (100% dados ficticios, zero Firebase real, zero credenciais ADC)
 * verificando todas as exigencias tecnicas da Secao 7 da Etapa 29.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  canonicalizeApprovalRecord,
  computePublicKeyFingerprintSha256,
} from "../etapa28/verify-approval-record.candidate.mjs";
import {
  EXPECTED_COLLECTION_NAME,
  EXPECTED_DATABASE_ID,
  EXPECTED_PROJECT_ID,
  assertSafeProbeEnvironment,
  readControlledAdcFile,
  runProbeReadOnlyV4,
  validateImpersonatedAdcPayload,
} from "./probe-readonly-v4.etapa29.candidate.mjs";

const require = createRequire(import.meta.url);
const FICTITIOUS_SA = "audit-readonly-ficticio@gen-lang-client-0490390966.iam.gserviceaccount.com";
const OTHER_FICTITIOUS_SA = "outra-conta-ficticia@gen-lang-client-0490390966.iam.gserviceaccount.com";
const PROBE_E29_PATH = resolve("scripts/audit/candidates/etapa29/probe-readonly-v4.etapa29.candidate.mjs");
const PROBE_E28_PATH = resolve("scripts/audit/candidates/etapa28/probe-readonly-v4.candidate.mjs");

function makeApprovalFixture(recordOverrides = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const trustedPin = computePublicKeyFingerprintSha256(publicKeyPem);
  const now = new Date();
  const issuedAt = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();

  const record = {
    schemaVersion: "localiza-audit-approval-v1",
    approvalId: "APPR-2026-FICTICIO-029",
    projectId: EXPECTED_PROJECT_ID,
    databaseId: EXPECTED_DATABASE_ID,
    collectionName: EXPECTED_COLLECTION_NAME,
    serviceAccountEmail: FICTITIOUS_SA,
    purpose: "READ_ONLY_USERS_COMPATIBILITY_AUDIT",
    scope: "READ_ONLY",
    issuedAt,
    expiresAt,
    revoked: false,
    issuerKeyId: "gcp-admin-ed25519-ficticio-29",
    ...recordOverrides,
  };
  const canonical = canonicalizeApprovalRecord(record);
  const signatureBase64 = sign(null, canonical, privateKey).toString("base64");
  return { record, recordJsonText: JSON.stringify(record, null, 2), signatureBase64, publicKeyPem, trustedPin };
}

function makeValidAdc(overrides = {}) {
  return {
    type: "impersonated_service_account",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${FICTITIOUS_SA}:generateAccessToken`,
    quota_project_id: EXPECTED_PROJECT_ID,
    delegates: [],
    source_credentials: {
      type: "authorized_user",
      client_id: "fictitious-client-id-29.apps.googleusercontent.com",
      client_secret: "fictitious-client-secret-placeholder",
      refresh_token: "fictitious-refresh-token-placeholder",
      account: "operador.ficticio@ifpr.example.invalid",
    },
    ...overrides,
  };
}

function createSyntheticEnvDir({ approvalFx = makeApprovalFixture(), adcObj = makeValidAdc(), adcMode = 0o600 } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "localiza-e29-test-")));
  const recPath = join(dir, "approval.json");
  const sigPath = join(dir, "approval.sig");
  const pubPath = join(dir, "trusted.pub.pem");
  const adcPath = join(dir, "adc-controlled.json");
  writeFileSync(recPath, approvalFx.recordJsonText, { mode: 0o600 });
  writeFileSync(sigPath, approvalFx.signatureBase64, { mode: 0o600 });
  writeFileSync(pubPath, approvalFx.publicKeyPem, { mode: 0o600 });
  writeFileSync(adcPath, JSON.stringify(adcObj, null, 2), { mode: adcMode });
  chmodSync(adcPath, adcMode);
  return {
    dir,
    recPath,
    sigPath,
    pubPath,
    adcPath,
    env: {
      METADATA_SERVER_DETECTION: "none",
      GOOGLE_APPLICATION_CREDENTIALS: adcPath,
      APPROVED_AUDIT_RECORD_FILE: recPath,
      APPROVED_AUDIT_SIGNATURE_FILE: sigPath,
      TRUSTED_ADMIN_PUBKEY_FILE: pubPath,
      TRUSTED_ADMIN_PUBKEY_SHA256: approvalFx.trustedPin,
      EXPECTED_AUDIT_SA: FICTITIOUS_SA,
      EXPECTED_ADC_SOURCE_ACCOUNT: "operador.ficticio@ifpr.example.invalid",
    },
  };
}

test("E29-01. Ordem efetiva de execucao dos imports e eventos (zero import estatico Firebase; eventos em sequencia estrita)", async () => {
  // 1. Verificacao estatica: sonda Etapa 29 importa estaticamente APENAS built-ins node:fs, node:path, node:url
  const srcE29 = readFileSync(PROBE_E29_PATH, "utf8");
  const staticImports = [...srcE29.matchAll(/^\s*import\s+[\s\S]*?from\s+["']([^"']+)["'];/gm)].map((m) => m[1]);
  assert.deepEqual(staticImports, ["node:fs", "node:path", "node:url"]);

  // 2. Verificacao estatica comparativa na sonda Etapa 28 (documenta que importa apenas node:* + verificador local)
  const srcE28 = readFileSync(PROBE_E28_PATH, "utf8");
  const staticImportsE28 = [...srcE28.matchAll(/^\s*import\s+[\s\S]*?from\s+["']([^"']+)["'];/gm)].map((m) => m[1]);
  assert.equal(staticImportsE28.some((spec) => spec.includes("firebase")), false);

  // 3. Registro cronologico real de eventos durante runProbeReadOnlyV4 com modulo Firebase injetado (zero rede)
  const fx = createSyntheticEnvDir();
  const events = [];
  try {
    const res = await runProbeReadOnlyV4({
      env: fx.env,
      onEvent: (ev) => events.push(ev),
      loadFirebaseModules: async () => {
        events.push("HOOK_LOAD_FIREBASE_CALLED");
        return {
          applicationDefault: () => ({ kind: "synthetic" }),
          initializeApp: (_opts, name) => {
            events.push("HOOK_INITIALIZE_APP_CALLED");
            return { name };
          },
          getFirestore: () => ({
            collection: (col) => {
              assert.equal(col, "users");
              return {
                select: (...args) => {
                  assert.equal(args.length, 0);
                  return {
                    limit: (n) => {
                      assert.equal(n, 1);
                      return {
                        get: async () => {
                          events.push("HOOK_FIRESTORE_GET_CALLED");
                          return { size: 1, empty: false };
                        },
                      };
                    },
                  };
                },
              };
            },
          }),
          deleteApp: async () => {
            events.push("HOOK_DELETE_APP_CALLED");
          },
        };
      },
    });
    assert.equal(res.status, "PROBE_READONLY_OK");
    assert.deepEqual(events, [
      "STAGE_A_APPROVAL_VERIFY_START",
      "STAGE_A_APPROVAL_VERIFY_OK",
      "STAGE_B_ENV_CHECK_START",
      "STAGE_B_ENV_CHECK_OK",
      "STAGE_C_ADC_READ_START",
      "STAGE_C_ADC_READ_OK",
      "STAGE_D_ADC_VALIDATE_START",
      "STAGE_D_ADC_VALIDATE_OK",
      "STAGE_E_TARGET_VALIDATE_START",
      "STAGE_E_TARGET_VALIDATE_OK",
      "STAGE_F_FIREBASE_IMPORT_START",
      "HOOK_LOAD_FIREBASE_CALLED",
      "STAGE_F_FIREBASE_IMPORT_OK",
      "STAGE_F_FIREBASE_INIT",
      "HOOK_INITIALIZE_APP_CALLED",
      "STAGE_F_FIRESTORE_QUERY_START",
      "HOOK_FIRESTORE_GET_CALLED",
      "STAGE_F_FIRESTORE_QUERY_OK",
      "STAGE_F_FIREBASE_CLEANUP_START",
      "HOOK_DELETE_APP_CALLED",
      "STAGE_F_FIREBASE_CLEANUP_OK",
    ]);
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
});

test("E29-02. Tentativa de inicializacao do Firebase antes da aprovacao (bloqueio total antes de import ou initializeApp)", async () => {
  const fx = createSyntheticEnvDir();
  let loadCalled = false;
  let initCalled = false;
  try {
    // Corrompe pin confiavel -> deve falhar na Etapa A sem jamais chamar loadFirebaseModules ou initializeApp
    const badEnv = { ...fx.env, TRUSTED_ADMIN_PUBKEY_SHA256: "0".repeat(64) };
    await assert.rejects(
      () =>
        runProbeReadOnlyV4({
          env: badEnv,
          loadFirebaseModules: async () => {
            loadCalled = true;
            return {
              applicationDefault: () => ({}),
              initializeApp: () => {
                initCalled = true;
                return {};
              },
              getFirestore: () => ({}),
              deleteApp: async () => {},
            };
          },
        }),
      { code: "UNTRUSTED_PUBLIC_KEY_FINGERPRINT" }
    );
    assert.equal(loadCalled, false);
    assert.equal(initCalled, false);
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
});

test("E29-03. Variaveis ADC conflitantes, METADATA_SERVER_DETECTION ausente/invalido e well-known ADC paralelo", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "localiza-e29-env-")));
  try {
    const controlledAdc = join(dir, "controlled.json");
    writeFileSync(controlledAdc, "{}", { mode: 0o600 });

    // 1. Sem METADATA_SERVER_DETECTION=none (mesmo com NO_GCE_CHECK=true legado) -> REJEITADO
    assert.throws(
      () =>
        assertSafeProbeEnvironment({
          NO_GCE_CHECK: "true",
          GOOGLE_APPLICATION_CREDENTIALS: controlledAdc,
        }),
      { code: "METADATA_SERVER_DETECTION_NOT_NONE" }
    );

    // 2. google_application_credentials minusculo conflitante -> REJEITADO
    assert.throws(
      () =>
        assertSafeProbeEnvironment({
          METADATA_SERVER_DETECTION: "none",
          GOOGLE_APPLICATION_CREDENTIALS: controlledAdc,
          google_application_credentials: "/tmp/outro.json",
        }),
      { code: "CONFLICTING_ADC_ENV_VARS" }
    );

    // 3. PROBE_ADC_FILE divergente de GOOGLE_APPLICATION_CREDENTIALS -> REJEITADO
    assert.throws(
      () =>
        assertSafeProbeEnvironment({
          METADATA_SERVER_DETECTION: "none",
          GOOGLE_APPLICATION_CREDENTIALS: controlledAdc,
          PROBE_ADC_FILE: join(dir, "diferente.json"),
        }),
      { code: "CONFLICTING_ADC_ENV_VARS" }
    );

    // 4. Variaveis serverless GCP (K_SERVICE) ou CLOUDSDK_CONFIG -> REJEITADO
    for (const v of ["K_SERVICE", "CLOUD_RUN_JOB", "FUNCTION_NAME", "CLOUDSDK_CONFIG"]) {
      assert.throws(
        () =>
          assertSafeProbeEnvironment({
            METADATA_SERVER_DETECTION: "none",
            GOOGLE_APPLICATION_CREDENTIALS: controlledAdc,
            [v]: "valor-indevido",
          }),
        { code: "BLOCKED_ENV_VAR_PRESENT" }
      );
    }

    // 5. Existencia de arquivo well-known paralelo sob HOME/.config/gcloud -> REJEITADO
    const fakeHome = join(dir, "fake-home");
    mkdirSync(join(fakeHome, ".config", "gcloud"), { recursive: true });
    writeFileSync(join(fakeHome, ".config", "gcloud", "application_default_credentials.json"), "{}", { mode: 0o600 });
    assert.throws(
      () =>
        assertSafeProbeEnvironment({
          METADATA_SERVER_DETECTION: "none",
          GOOGLE_APPLICATION_CREDENTIALS: controlledAdc,
          HOME: fakeHome,
        }),
      { code: "WELL_KNOWN_ADC_CONFLICT" }
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("E29-04. Arquivo ADC com symlink direto, symlink em diretorio pai, diretorio e caminho relativo", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "localiza-e29-sym-")));
  try {
    const realFile = join(dir, "real-adc.json");
    writeFileSync(realFile, JSON.stringify(makeValidAdc()), { mode: 0o600 });
    chmodSync(realFile, 0o600);

    // 1. Symlink direto -> REJEITADO
    const directLink = join(dir, "link-adc.json");
    symlinkSync(realFile, directLink);
    assert.throws(() => readControlledAdcFile(directLink), { code: "ADC_SYMLINK_FORBIDDEN" });

    // 2. Symlink em diretorio pai -> REJEITADO
    const realSub = join(dir, "real-sub");
    mkdirSync(realSub, { mode: 0o700 });
    const nestedFile = join(realSub, "adc.json");
    writeFileSync(nestedFile, JSON.stringify(makeValidAdc()), { mode: 0o600 });
    chmodSync(nestedFile, 0o600);
    const parentLink = join(dir, "link-sub");
    symlinkSync(realSub, parentLink);
    assert.throws(() => readControlledAdcFile(join(parentLink, "adc.json")), { code: "ADC_PARENT_SYMLINK_FORBIDDEN" });

    // 3. Diretorio no lugar de arquivo regular -> REJEITADO
    assert.throws(() => readControlledAdcFile(realSub), { code: "ADC_SPECIAL_FILE_FORBIDDEN" });

    // 4. Caminho relativo -> REJEITADO
    assert.throws(() => readControlledAdcFile("relative/adc.json"), { code: "ADC_PATH_NOT_ABSOLUTE" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("E29-05. Arquivo ADC com permissoes inadequadas (0644, 0640, 0604 rejeitados; 0600 aceito)", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "localiza-e29-perm-")));
  try {
    const adcFile = join(dir, "adc.json");
    writeFileSync(adcFile, JSON.stringify(makeValidAdc()), { mode: 0o600 });

    for (const badMode of [0o644, 0o640, 0o604, 0o666]) {
      chmodSync(adcFile, badMode);
      assert.throws(() => readControlledAdcFile(adcFile), { code: "ADC_INSECURE_PERMISSIONS" });
    }

    chmodSync(adcFile, 0o600);
    const content = readControlledAdcFile(adcFile);
    assert.equal(JSON.parse(content).type, "impersonated_service_account");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("E29-06. Divergencia entre identidade de origem e conta impersonada, campos inesperados e chaves duplicadas no ADC", () => {
  // 1. Conta de origem igual a conta impersonada -> REJEITADO
  const sameAsSa = makeValidAdc();
  sameAsSa.source_credentials.account = FICTITIOUS_SA;
  assert.throws(
    () => validateImpersonatedAdcPayload(JSON.stringify(sameAsSa), { expectedServiceAccountEmail: FICTITIOUS_SA }),
    { code: "SOURCE_EQUALS_IMPERSONATED_SA" }
  );

  // 2. Conta de origem e outra conta de servico -> REJEITADO
  const srcIsSa = makeValidAdc();
  srcIsSa.source_credentials.account = OTHER_FICTITIOUS_SA;
  assert.throws(
    () => validateImpersonatedAdcPayload(JSON.stringify(srcIsSa), { expectedServiceAccountEmail: FICTITIOUS_SA }),
    { code: "SOURCE_ACCOUNT_IS_SERVICE_ACCOUNT" }
  );

  // 3. Conta de origem diverge do operador esperado -> REJEITADO
  const validAdc = makeValidAdc();
  assert.throws(
    () =>
      validateImpersonatedAdcPayload(JSON.stringify(validAdc), {
        expectedServiceAccountEmail: FICTITIOUS_SA,
        expectedSourceAccount: "outro.operador@ifpr.example.invalid",
      }),
    { code: "SOURCE_ACCOUNT_MISMATCH" }
  );

  // 4. Campo inesperado na raiz do ADC -> REJEITADO
  const extraRoot = { ...makeValidAdc(), token_uri: "https://evil.example.invalid/token" };
  assert.throws(
    () => validateImpersonatedAdcPayload(JSON.stringify(extraRoot), { expectedServiceAccountEmail: FICTITIOUS_SA }),
    { code: "ADC_UNEXPECTED_KEY" }
  );

  // 5. Campo inesperado em source_credentials -> REJEITADO
  const extraSrc = makeValidAdc();
  extraSrc.source_credentials.extra = "nao-permitido";
  assert.throws(
    () => validateImpersonatedAdcPayload(JSON.stringify(extraSrc), { expectedServiceAccountEmail: FICTITIOUS_SA }),
    { code: "ADC_SOURCE_UNEXPECTED_KEY" }
  );

  // 6. Chave JSON duplicada na string bruta do ADC -> REJEITADO
  const dupAdcText = JSON.stringify(makeValidAdc(), null, 2).replace(
    '"type": "authorized_user",',
    '"type": "service_account", "type": "authorized_user",'
  );
  assert.throws(
    () => validateImpersonatedAdcPayload(dupAdcText, { expectedServiceAccountEmail: FICTITIOUS_SA }),
    { code: "ADC_DUPLICATE_JSON_KEY" }
  );
});

test("E29-07. Importacao dinamica e falha durante carregamento dos modulos Firebase Admin", async () => {
  const fx = createSyntheticEnvDir();
  try {
    await assert.rejects(
      () =>
        runProbeReadOnlyV4({
          env: fx.env,
          loadFirebaseModules: async () => {
            throw Object.assign(new Error("Simulated module load failure"), { code: "FIREBASE_MODULE_LOAD_FAILED" });
          },
        }),
      { code: "FIREBASE_MODULE_LOAD_FAILED" }
    );
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
});

test("E29-08. Erro de encerramento da instancia Firebase Admin (deleteApp) nao e mascarado", async () => {
  const fx = createSyntheticEnvDir();
  try {
    // Caso A: Query bem-sucedida, mas deleteApp falha -> deve propagar FIREBASE_APP_CLEANUP_FAILED
    await assert.rejects(
      () =>
        runProbeReadOnlyV4({
          env: fx.env,
          loadFirebaseModules: async () => ({
            applicationDefault: () => ({}),
            initializeApp: (_o, name) => ({ name }),
            getFirestore: () => ({
              collection: () => ({
                select: () => ({
                  limit: () => ({
                    get: async () => ({ size: 1, empty: false }),
                  }),
                }),
              }),
            }),
            deleteApp: async () => {
              throw new Error("Simulated deleteApp hang/error");
            },
          }),
        }),
      { code: "FIREBASE_APP_CLEANUP_FAILED" }
    );

    // Caso B: Query falha E deleteApp tambem falha -> preserva erro principal + anexa cleanupErrorCode
    let caught = null;
    try {
      await runProbeReadOnlyV4({
        env: fx.env,
        loadFirebaseModules: async () => ({
          applicationDefault: () => ({}),
          initializeApp: (_o, name) => ({ name }),
          getFirestore: () => ({
            collection: () => ({
              select: () => ({
                limit: () => ({
                  get: async () => {
                    throw Object.assign(new Error("Simulated query denial"), { code: "permission-denied" });
                  },
                }),
              }),
            }),
          }),
          deleteApp: async () => {
            throw new Error("Simulated secondary cleanup failure");
          },
        }),
      });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught);
    assert.equal(caught.code, "permission-denied");
    assert.equal(caught.cleanupErrorCode, "FIREBASE_APP_CLEANUP_FAILED");
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
});

test("E29-09. Ausencia total de dados individuais em stdout e stderr (sucesso e falha)", async () => {
  const fx = createSyntheticEnvDir();
  const SENSITIVE_UID = "RAW_UID_PESSOAL_987654321";
  const SENSITIVE_EMAIL = "aluno.ficticio.pii@ifpr.edu.br";
  const SENSITIVE_NAME = "Fulano Sintetico Confidencial";

  try {
    // 1. Caminho de sucesso com resposta contendo documento PII em memoria (simula SDK)
    const outObj = await runProbeReadOnlyV4({
      env: fx.env,
      loadFirebaseModules: async () => ({
        applicationDefault: () => ({}),
        initializeApp: (_o, name) => ({ name }),
        getFirestore: () => ({
          collection: () => ({
            select: () => ({
              limit: () => ({
                get: async () => ({
                  size: 1,
                  empty: false,
                  docs: [
                    {
                      id: SENSITIVE_UID,
                      ref: { path: `users/${SENSITIVE_UID}` },
                      data: () => ({ email: SENSITIVE_EMAIL, name: SENSITIVE_NAME }),
                    },
                  ],
                }),
              }),
            }),
          }),
        }),
        deleteApp: async () => {},
      }),
    });

    const serializedStdout = JSON.stringify(outObj);
    assert.equal(serializedStdout.includes(SENSITIVE_UID), false);
    assert.equal(serializedStdout.includes(SENSITIVE_EMAIL), false);
    assert.equal(serializedStdout.includes(SENSITIVE_NAME), false);
    assert.equal(serializedStdout.includes(fx.dir), false);
    assert.equal(outObj.wireProjectionField, "__name__");

    // 2. Caminho CLI de falha (sem pin valido) -> stderr nao vaza caminhos locais, tokens ou PII
    const cliFail = spawnSync(process.execPath, [PROBE_E29_PATH, "--execute-probe-readonly"], {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        ...fx.env,
        TRUSTED_ADMIN_PUBKEY_SHA256: "0".repeat(64),
      },
    });
    assert.notEqual(cliFail.status, 0);
    assert.equal(cliFail.stdout, "");
    const errJson = JSON.parse(cliFail.stderr);
    assert.deepEqual(Object.keys(errJson).sort(), ["errorCode", "probeVersion", "status"]);
    assert.equal(cliFail.stderr.includes(fx.dir), false);
    assert.equal(cliFail.stderr.includes("fictitious-refresh-token"), false);
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
});

test("E29-10. Comportamento exato de select() sem argumentos no @google-cloud/firestore@8.7.1 (offline, zero rede)", () => {
  const { Firestore, FieldPath } = require("@google-cloud/firestore");
  const db = new Firestore({
    projectId: EXPECTED_PROJECT_ID,
    databaseId: EXPECTED_DATABASE_ID,
    credentials: { client_email: "ficticio@example.invalid", private_key: "ficticio" },
  });

  const protoEmptySelect = db.collection("users").select().limit(1).toProto();
  const protoExplicitDocId = db.collection("users").select(FieldPath.documentId()).limit(1).toProto();
  const protoNoSelect = db.collection("users").limit(1).toProto();

  // Prova 1: select() sem argumentos solicita exatamente projection: { fields: [{ fieldPath: "__name__" }] }
  assert.deepEqual(protoEmptySelect.structuredQuery.select, {
    fields: [{ fieldPath: "__name__" }],
  });
  assert.deepEqual(protoEmptySelect, protoExplicitDocId);

  // Prova 2: Diferenca frente a consulta sem select() (que omitiria `select` e pediria todos os campos do documento)
  assert.equal(protoNoSelect.structuredQuery.select, undefined);

  // Prova 3: Alvo exato no proto aponta para o banco nomeado e limite 1
  assert.equal(
    protoEmptySelect.parent,
    `projects/${EXPECTED_PROJECT_ID}/databases/${EXPECTED_DATABASE_ID}/documents`
  );
  assert.deepEqual(protoEmptySelect.structuredQuery.limit, { value: 1 });
});

test(
  "E29-11. [NAO EXECUTADO - DEPENDE DE FIREBASE REAL] Verificacao de bytes gRPC RunQuery reais no banco nomeado",
  { skip: "NAO EXECUTADO: Conexao ao Firebase/Firestore proibida na Etapa 29 (aprovacao exclusivamente estatica)" },
  () => {}
);
