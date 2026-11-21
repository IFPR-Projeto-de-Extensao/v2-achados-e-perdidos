/**
 * LOCALIZA+ v1.10.13 — Etapa 28
 * Suite complementar de testes sinteticos (100% dados ficticios, zero Firebase, zero credenciais ADC)
 * cobrindo as lacunas especificas exigidas na Etapa 28 para:
 * - `verify-approval-record.candidate.mjs`
 * - `validate-audit-summary.candidate.mjs`
 * - `probe-readonly-v4.candidate.mjs`
 */

import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  APPROVAL_RECORD_KEYS,
  EXPECTED_COLLECTION_NAME,
  EXPECTED_DATABASE_ID,
  EXPECTED_PROJECT_ID,
  canonicalizeApprovalRecord,
  computePublicKeyFingerprintSha256,
  verifySignedApprovalRecord,
} from "./verify-approval-record.candidate.mjs";
import {
  CLASSIFICATION_KEYS,
  EXPECTED_AUDITOR_VERSION,
  EXPECTED_IMPLEMENTATION_ORIGIN,
  EXPECTED_MODE,
  EXPECTED_ROOT_MASKED_UID,
  EXPECTED_RULES_COMMIT,
  EXPECTED_RULES_SHA256,
  VERDICT_MAP,
  validateAndExtractAuditSummary,
  writeRestrictedSummaryFile,
} from "./validate-audit-summary.candidate.mjs";
import {
  BLOCKED_ENV_VARS,
  FORBIDDEN_DEFAULT_DATABASE_ID,
  assertSafeProbeEnvironment,
  runProbeReadOnlyV4,
  validateImpersonatedAdcPayload,
  validateProbeTarget,
} from "./probe-readonly-v4.candidate.mjs";

const FICTITIOUS_SA = "audit-readonly-ficticio@gen-lang-client-0490390966.iam.gserviceaccount.com";
const OTHER_FICTITIOUS_SA = "outra-conta-ficticia@gen-lang-client-0490390966.iam.gserviceaccount.com";
const REF_NS = Object.freeze({ seconds: 1_750_000_000, nanoseconds: 0 });
const REF_ISO = new Date(REF_NS.seconds * 1000).toISOString();

const CANDIDATE_VALIDATOR_CLI = resolve("scripts/audit/candidates/etapa28/validate-audit-summary.candidate.mjs");
const CANDIDATE_VERIFIER_CLI = resolve("scripts/audit/candidates/etapa28/verify-approval-record.candidate.mjs");
const CANDIDATE_PROBE_PATH = resolve("scripts/audit/candidates/etapa28/probe-readonly-v4.candidate.mjs");

function makeApprovalFixture(recordOverrides = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const trustedPin = computePublicKeyFingerprintSha256(publicKeyPem);
  const now = new Date();
  const issuedAt = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();

  const record = {
    schemaVersion: "localiza-audit-approval-v1",
    approvalId: "APPR-2026-FICTICIO-028",
    projectId: EXPECTED_PROJECT_ID,
    databaseId: EXPECTED_DATABASE_ID,
    collectionName: EXPECTED_COLLECTION_NAME,
    serviceAccountEmail: FICTITIOUS_SA,
    purpose: "READ_ONLY_USERS_COMPATIBILITY_AUDIT",
    scope: "READ_ONLY",
    issuedAt,
    expiresAt,
    revoked: false,
    issuerKeyId: "gcp-admin-ed25519-ficticio-28",
    ...recordOverrides,
  };
  const canonical = canonicalizeApprovalRecord(record);
  const signatureBase64 = sign(null, canonical, privateKey).toString("base64");
  return { record, recordJsonText: JSON.stringify(record, null, 2), signatureBase64, publicKeyPem, trustedPin, privateKey };
}

function makeSyntheticResult(index, classification) {
  return {
    maskedUid: `uid_${index.toString(16).padStart(12, "0")}`,
    classification,
  };
}

function makeValidReport(resultsList, overrides = {}) {
  const counts = Object.fromEntries(CLASSIFICATION_KEYS.map((k) => [k, 0]));
  for (const r of resultsList) {
    if (Object.prototype.hasOwnProperty.call(counts, r.classification)) {
      counts[r.classification] += 1;
    }
  }
  const totalRead = resultsList.length;
  let verdictCode = "A";
  let inconclusiveReasons = [];
  if (totalRead === 0) {
    verdictCode = "D";
    inconclusiveReasons = ["EMPTY_COLLECTION"];
  } else if (counts.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE > 0) {
    verdictCode = "C";
  } else if (counts.INCONSISTENCIA_DE_DADOS > 0 || counts.DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO > 0) {
    verdictCode = "B";
  }
  return {
    metadata: {
      implementationOrigin: EXPECTED_IMPLEMENTATION_ORIGIN,
      auditorVersion: EXPECTED_AUDITOR_VERSION,
      projectId: EXPECTED_PROJECT_ID,
      databaseId: EXPECTED_DATABASE_ID,
      collectionName: EXPECTED_COLLECTION_NAME,
      rulesCommit: EXPECTED_RULES_COMMIT,
      rulesSha256Expected: EXPECTED_RULES_SHA256,
      rootAdminMaskedUid: EXPECTED_ROOT_MASKED_UID,
      mode: EXPECTED_MODE,
      referenceTimeIso: REF_ISO,
      referenceTimeNs: { ...REF_NS },
    },
    pagination: {
      pageSize: 500,
      pagesFetched: 1,
      totalRead,
      completed: true,
      duplicateDocIdsCount: 0,
      stagnantCursorDetected: false,
      readError: null,
    },
    verdict: VERDICT_MAP[verdictCode],
    verdictCode,
    counts,
    unexpectedClassificationsCount: 0,
    inconclusiveReasons,
    results: resultsList,
    ...overrides,
  };
}

function makeValidImpersonatedAdc(overrides = {}) {
  return {
    type: "impersonated_service_account",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${FICTITIOUS_SA}:generateAccessToken`,
    quota_project_id: EXPECTED_PROJECT_ID,
    delegates: [],
    source_credentials: {
      type: "authorized_user",
      client_id: "fictitious-client-id.apps.googleusercontent.com",
      client_secret: "fictitious-non-secret-placeholder",
      refresh_token: "fictitious-refresh-token-placeholder",
    },
    ...overrides,
  };
}

test("E28-01. Fingerprint alterado junto com chave publica substituida (rejeicao contra ancora confiavel independente)", () => {
  const trustedAdmin = makeApprovalFixture();
  const attacker = makeApprovalFixture();

  // 1) Atacante envia sua propria chave publica contra o pin oficial do administrador -> REJEITADO
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: attacker.recordJsonText,
        signatureBase64: attacker.signatureBase64,
        trustedPublicKeyPem: attacker.publicKeyPem,
        trustedPublicKeySha256: trustedAdmin.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "UNTRUSTED_PUBLIC_KEY_FINGERPRINT" }
  );

  // 2) Atacante altera tambem o fingerprint para um hash divergente da chave -> REJEITADO
  const alteredPin = attacker.trustedPin.startsWith("0")
    ? "f" + attacker.trustedPin.slice(1)
    : "0" + attacker.trustedPin.slice(1);
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: attacker.recordJsonText,
        signatureBase64: attacker.signatureBase64,
        trustedPublicKeyPem: attacker.publicKeyPem,
        trustedPublicKeySha256: alteredPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "UNTRUSTED_PUBLIC_KEY_FINGERPRINT" }
  );

  // 3) Evidencia de modelo de ameaca: se o operador controlasse tanto a chave quanto o pin (sem canal independente),
  //    a matematica local aprovaria, o que comprova por que o pin DEVE vir de canal administrativo independente.
  assert.notEqual(attacker.trustedPin, trustedAdmin.trustedPin);
});

test("E28-02. Registro assinado com finalidade (purpose) ou escopo (scope) incorreto", () => {
  const badPurpose = makeApprovalFixture({ purpose: "MIGRATE_USERS_COLLECTION" });
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: badPurpose.recordJsonText,
        signatureBase64: badPurpose.signatureBase64,
        trustedPublicKeyPem: badPurpose.publicKeyPem,
        trustedPublicKeySha256: badPurpose.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "INVALID_PURPOSE" }
  );

  const badScope = makeApprovalFixture({ scope: "READ_WRITE" });
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: badScope.recordJsonText,
        signatureBase64: badScope.signatureBase64,
        trustedPublicKeyPem: badScope.publicKeyPem,
        trustedPublicKeySha256: badScope.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "INVALID_SCOPE" }
  );
});

test("E28-03. Registro com datas invalidas (calendario inexistente, formato invalido, janela > 7d, inversao e referenceTime invalido)", () => {
  // Data inexistente de calendario (V8 Date.parse rolaria 2026-02-30 para 2026-03-02 sem round-trip)
  const rolloverDate = makeApprovalFixture({
    issuedAt: "2026-02-30T10:00:00.000Z",
    expiresAt: "2026-03-01T10:00:00.000Z",
  });
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: rolloverDate.recordJsonText,
        signatureBase64: rolloverDate.signatureBase64,
        trustedPublicKeyPem: rolloverDate.publicKeyPem,
        trustedPublicKeySha256: rolloverDate.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "INVALID_TIMESTAMP_CALENDAR" }
  );

  // Formato nao-UTC (offset -03:00)
  const badFmt = makeApprovalFixture({ issuedAt: "2026-06-01T10:00:00-03:00" });
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: badFmt.recordJsonText,
        signatureBase64: badFmt.signatureBase64,
        trustedPublicKeyPem: badFmt.publicKeyPem,
        trustedPublicKeySha256: badFmt.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "INVALID_TIMESTAMP_FORMAT" }
  );

  // expiresAt <= issuedAt
  const inverted = makeApprovalFixture({
    issuedAt: "2026-06-01T12:00:00.000Z",
    expiresAt: "2026-06-01T11:00:00.000Z",
  });
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: inverted.recordJsonText,
        signatureBase64: inverted.signatureBase64,
        trustedPublicKeyPem: inverted.publicKeyPem,
        trustedPublicKeySha256: inverted.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
        referenceTime: new Date("2026-06-01T12:00:00.000Z"),
      }),
    { code: "INVALID_VALIDITY_WINDOW" }
  );

  // Janela maior que 7 dias
  const tooLong = makeApprovalFixture({
    issuedAt: "2026-06-01T12:00:00.000Z",
    expiresAt: "2026-06-15T12:00:00.000Z",
  });
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: tooLong.recordJsonText,
        signatureBase64: tooLong.signatureBase64,
        trustedPublicKeyPem: tooLong.publicKeyPem,
        trustedPublicKeySha256: tooLong.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
        referenceTime: new Date("2026-06-02T12:00:00.000Z"),
      }),
    { code: "VALIDITY_WINDOW_TOO_LONG" }
  );

  // referenceTime invalido (null nao deve ser convertido em epoch 0)
  const validFx = makeApprovalFixture();
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: validFx.recordJsonText,
        signatureBase64: validFx.signatureBase64,
        trustedPublicKeyPem: validFx.publicKeyPem,
        trustedPublicKeySha256: validFx.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
        referenceTime: null,
      }),
    { code: "INVALID_REFERENCE_TIME" }
  );
});

test("E28-04. Registro com campos adicionais, ausentes ou chaves JSON duplicadas", () => {
  const validFx = makeApprovalFixture();

  // Campo adicional
  const extraJson = JSON.stringify({ ...validFx.record, extraField: "injetado" });
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: extraJson,
        signatureBase64: validFx.signatureBase64,
        trustedPublicKeyPem: validFx.publicKeyPem,
        trustedPublicKeySha256: validFx.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "UNEXPECTED_RECORD_KEY" }
  );

  // Cada uma das 12 chaves ausente individualmente
  for (const key of APPROVAL_RECORD_KEYS) {
    const missing = { ...validFx.record };
    delete missing[key];
    assert.throws(
      () =>
        verifySignedApprovalRecord({
          recordJsonText: JSON.stringify(missing),
          signatureBase64: validFx.signatureBase64,
          trustedPublicKeyPem: validFx.publicKeyPem,
          trustedPublicKeySha256: validFx.trustedPin,
          expectedServiceAccountEmail: FICTITIOUS_SA,
        }),
      { code: "MISSING_RECORD_KEY" }
    );
  }

  // Chave JSON duplicada na string bruta
  const dupRaw = validFx.recordJsonText.replace('"scope": "READ_ONLY",', '"scope": "ADMIN", "scope": "READ_ONLY",');
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: dupRaw,
        signatureBase64: validFx.signatureBase64,
        trustedPublicKeyPem: validFx.publicKeyPem,
        trustedPublicKeySha256: validFx.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "DUPLICATE_RECORD_KEY" }
  );
});

test("E28-05. URL de impersonacao com hostname, porta, protocolo, caminho ou parametros indevidos", () => {
  const cases = [
    [
      "https://evil.example.invalid/v1/projects/-/serviceAccounts/" + FICTITIOUS_SA + ":generateAccessToken",
      "INVALID_IMPERSONATION_URL_HOST",
    ],
    [
      "https://iamcredentials.googleapis.com.evil.invalid/v1/projects/-/serviceAccounts/" + FICTITIOUS_SA + ":generateAccessToken",
      "INVALID_IMPERSONATION_URL_HOST",
    ],
    [
      "https://iamcredentials.googleapis.com:8443/v1/projects/-/serviceAccounts/" + FICTITIOUS_SA + ":generateAccessToken",
      "INVALID_IMPERSONATION_URL_PORT",
    ],
    [
      "https://iamcredentials.googleapis.com:443/v1/projects/-/serviceAccounts/" + FICTITIOUS_SA + ":generateAccessToken",
      "INVALID_IMPERSONATION_URL_PORT",
    ],
    [
      "http://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" + FICTITIOUS_SA + ":generateAccessToken",
      "INVALID_IMPERSONATION_URL_PROTOCOL",
    ],
    [
      "https://user:pass@iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" + FICTITIOUS_SA + ":generateAccessToken",
      "INVALID_IMPERSONATION_URL_AUTH",
    ],
    [
      "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" + FICTITIOUS_SA + ":signBlob",
      "INVALID_IMPERSONATION_URL_PATH",
    ],
    [
      "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/../serviceAccounts/" + FICTITIOUS_SA + ":generateAccessToken",
      "INVALID_IMPERSONATION_URL_PATH",
    ],
    [
      "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" + FICTITIOUS_SA + ":generateAccessToken?alt=json",
      "INVALID_IMPERSONATION_URL_PARAMS",
    ],
    [
      "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" + FICTITIOUS_SA + ":generateAccessToken#frag",
      "INVALID_IMPERSONATION_URL_PARAMS",
    ],
  ];

  for (const [badUrl, expectedCode] of cases) {
    const adc = makeValidImpersonatedAdc({ service_account_impersonation_url: badUrl });
    assert.throws(
      () =>
        validateImpersonatedAdcPayload(JSON.stringify(adc), {
          expectedServiceAccountEmail: FICTITIOUS_SA,
        }),
      { code: expectedCode },
      `Failed to reject URL: ${badUrl}`
    );
  }
});

test("E28-06. ADC com identidade de origem inesperada, chave privada estatica, delegates ou quota_project divergente", () => {
  // 1. Tipo raiz nao e impersonated_service_account
  assert.throws(
    () =>
      validateImpersonatedAdcPayload(JSON.stringify({ type: "authorized_user", client_id: "x", refresh_token: "y" }), {
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "UNEXPECTED_ADC_TYPE" }
  );

  // 2. source_credentials com chave privada estatica
  const withPrivateKey = makeValidImpersonatedAdc({
    source_credentials: {
      type: "service_account",
      private_key: "-----BEGIN PRIVATE KEY-----\nFICTITIOUS\n-----END PRIVATE KEY-----",
      private_key_id: "fictitious",
    },
  });
  assert.throws(
    () =>
      validateImpersonatedAdcPayload(JSON.stringify(withPrivateKey), {
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "STATIC_PRIVATE_KEY_SOURCE_FORBIDDEN" }
  );

  // 3. source_credentials de tipo inesperado (ex.: external_account)
  const externalSource = makeValidImpersonatedAdc({
    source_credentials: { type: "external_account", client_id: "x", refresh_token: "y" },
  });
  assert.throws(
    () =>
      validateImpersonatedAdcPayload(JSON.stringify(externalSource), {
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "UNEXPECTED_SOURCE_CREDENTIAL_TYPE" }
  );

  // 4. client_id de origem divergente do esperado
  const validAdc = makeValidImpersonatedAdc();
  assert.throws(
    () =>
      validateImpersonatedAdcPayload(JSON.stringify(validAdc), {
        expectedServiceAccountEmail: FICTITIOUS_SA,
        expectedSourceClientId: "outro-client-id-esperado.apps.googleusercontent.com",
      }),
    { code: "SOURCE_CLIENT_ID_MISMATCH" }
  );

  // 5. delegates nao vazio
  const withDelegates = makeValidImpersonatedAdc({
    delegates: ["projects/-/serviceAccounts/" + OTHER_FICTITIOUS_SA],
  });
  assert.throws(
    () =>
      validateImpersonatedAdcPayload(JSON.stringify(withDelegates), {
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "NON_EMPTY_DELEGATES_FORBIDDEN" }
  );

  // 6. quota_project_id divergente
  const wrongQuota = makeValidImpersonatedAdc({ quota_project_id: "outro-projeto-999" });
  assert.throws(
    () =>
      validateImpersonatedAdcPayload(JSON.stringify(wrongQuota), {
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "QUOTA_PROJECT_MISMATCH" }
  );
});

test("E28-07. Conta de servico com identificador divergente no registro, na URL ADC e no dominio do projeto", () => {
  const fx = makeApprovalFixture();

  // Divergente no verificador de aprovacao
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: fx.recordJsonText,
        signatureBase64: fx.signatureBase64,
        trustedPublicKeyPem: fx.publicKeyPem,
        trustedPublicKeySha256: fx.trustedPin,
        expectedServiceAccountEmail: OTHER_FICTITIOUS_SA,
      }),
    { code: "SERVICE_ACCOUNT_MISMATCH" }
  );

  // Divergente na URL de impersonacao do ADC
  const adcOtherSa = makeValidImpersonatedAdc({
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${OTHER_FICTITIOUS_SA}:generateAccessToken`,
  });
  assert.throws(
    () =>
      validateImpersonatedAdcPayload(JSON.stringify(adcOtherSa), {
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "IMPERSONATED_SA_MISMATCH" }
  );

  // SA de outro projeto GCP no registro assinado
  const wrongDomainFx = makeApprovalFixture({
    serviceAccountEmail: "audit-readonly@outro-projeto.iam.gserviceaccount.com",
  });
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: wrongDomainFx.recordJsonText,
        signatureBase64: wrongDomainFx.signatureBase64,
        trustedPublicKeyPem: wrongDomainFx.publicKeyPem,
        trustedPublicKeySha256: wrongDomainFx.trustedPin,
      }),
    { code: "INVALID_SERVICE_ACCOUNT_FORMAT" }
  );
});

test("E28-08. Resumo que omite resultados individuais (results ausente, truncado ou vazio para totalRead > 0)", () => {
  const reportMissingKey = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  delete reportMissingKey.results;
  assert.throws(() => validateAndExtractAuditSummary(reportMissingKey), { code: "MISSING_REQUIRED_KEY" });

  const reportTruncated = makeValidReport([
    makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL"),
    makeSyntheticResult(2, "INCONSISTENCIA_DE_DADOS"),
  ]);
  reportTruncated.results = [reportTruncated.results[0]];
  assert.throws(() => validateAndExtractAuditSummary(reportTruncated), { code: "RESULTS_LENGTH_MISMATCH" });

  const reportEmptyResults = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  reportEmptyResults.results = [];
  assert.throws(() => validateAndExtractAuditSummary(reportEmptyResults), { code: "RESULTS_LENGTH_MISMATCH" });
});

test("E28-09. Resumo com contagens manipuladas e incoerencia matematica de paginacao", () => {
  // Contagem manipulada mantendo soma igual a totalRead
  const manipulated = makeValidReport([
    makeSyntheticResult(1, "PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE"),
    makeSyntheticResult(2, "DOCUMENTO_COMPATIVEL"),
  ]);
  manipulated.counts.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE = 0;
  manipulated.counts.DOCUMENTO_COMPATIVEL = 2;
  manipulated.verdictCode = "A";
  manipulated.verdict = VERDICT_MAP.A;
  assert.throws(() => validateAndExtractAuditSummary(manipulated), { code: "RECOUNT_MISMATCH" });

  // totalRead maior que pagesFetched * pageSize
  const impossiblePagination = makeValidReport([
    makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL"),
    makeSyntheticResult(2, "DOCUMENTO_COMPATIVEL"),
  ]);
  impossiblePagination.pagination.pageSize = 1;
  impossiblePagination.pagination.pagesFetched = 1;
  assert.throws(() => validateAndExtractAuditSummary(impossiblePagination), { code: "PAGINATION_COUNT_EXCEEDS_CAPACITY" });

  // Colecao vazia com pagesFetched != 1
  const weirdEmpty = makeValidReport([]);
  weirdEmpty.pagination.pagesFetched = 3;
  assert.throws(() => validateAndExtractAuditSummary(weirdEmpty), { code: "INVALID_EMPTY_COLLECTION_PAGES" });
});

test("E28-10. Falha de escrita e permissoes inadequadas no arquivo final (0644 pre-existente, symlink, diretorio, pos-escrita)", () => {
  const validSummary = validateAndExtractAuditSummary(makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]));
  const dir = mkdtempSync(join(tmpdir(), "localiza-e28-perms-"));

  try {
    // 1. Gravacao valida gera arquivo com permissao exatamente 0600
    const goodPath = join(dir, "summary-ok.json");
    const written = writeRestrictedSummaryFile(goodPath, validSummary);
    assert.equal(written.mode, 0o600);
    assert.equal(lstatSync(goodPath).mode & 0o777, 0o600);

    // 2. Arquivo pre-existente com permissao 0644 e rejeitado sem sobrescrever
    const loosePath = join(dir, "summary-loose.json");
    writeFileSync(loosePath, '{"sentinel":true}\n', { mode: 0o644 });
    chmodSync(loosePath, 0o644);
    assert.throws(() => writeRestrictedSummaryFile(loosePath, validSummary), {
      code: "INSECURE_EXISTING_OUTPUT_PERMISSIONS",
    });
    assert.equal(readFileSync(loosePath, "utf8"), '{"sentinel":true}\n');

    // 3. Destino symlink e rejeitado
    const linkPath = join(dir, "summary-link.json");
    symlinkSync(goodPath, linkPath);
    assert.throws(() => writeRestrictedSummaryFile(linkPath, validSummary), {
      code: "OUTPUT_PATH_IS_SYMLINK",
    });

    // 4. Destino diretorio e rejeitado
    const subDir = join(dir, "subdir");
    mkdirSync(subDir, { mode: 0o700 });
    assert.throws(() => writeRestrictedSummaryFile(subDir, validSummary), {
      code: "OUTPUT_PATH_IS_DIRECTORY",
    });

    // 5. Diretorio pai inexistente -> falha de escrita controlada (SUMMARY_WRITE_FAILED)
    const missingParentOut = join(dir, "nao-existe", "summary.json");
    assert.throws(() => writeRestrictedSummaryFile(missingParentOut, validSummary), {
      code: "SUMMARY_WRITE_FAILED",
    });

    // 6. Simula falha de permissao pos-escrita (ex.: filesystem ignorando chmod) -> remove arquivo e falha fechado
    const driftPath = join(dir, "summary-drift.json");
    assert.throws(
      () =>
        writeRestrictedSummaryFile(driftPath, validSummary, {
          existsSync,
          writeFileSync,
          chmodSync: () => {},
          unlinkSync,
          lstatSync: () => ({
            isSymbolicLink: () => false,
            isFile: () => true,
            isDirectory: () => false,
            mode: 0o100644,
          }),
        }),
      { code: "INSECURE_OUTPUT_FILE_PERMISSIONS" }
    );
    assert.equal(existsSync(driftPath), false);

    // 7. CLI falha com exit code != 0 quando destino tem permissao inadequada (0644)
    const rawPath = join(dir, "raw.json");
    const errPath = join(dir, "stderr.log");
    writeFileSync(rawPath, JSON.stringify(makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")])), { mode: 0o600 });
    writeFileSync(errPath, "", { mode: 0o600 });
    const cliProc = spawnSync(process.execPath, [CANDIDATE_VALIDATOR_CLI], {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        AUDIT_RAW_QUARANTINE_FILE: rawPath,
        AUDIT_STDERR_QUARANTINE_FILE: errPath,
        AUDIT_SUMMARY_OUT_FILE: loosePath,
      },
    });
    assert.notEqual(cliProc.status, 0);
    assert.match(cliProc.stderr, /INSECURE_EXISTING_OUTPUT_PERMISSIONS/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("E28-11. Sonda probe-readonly-v4: bloqueio de env vars, (default), limit!=1, ordem fail-closed e verificacao estatica integral", async () => {
  // 1. Rejeicao explicita de (default) e limit != 1
  assert.throws(() => validateProbeTarget({ databaseId: FORBIDDEN_DEFAULT_DATABASE_ID }), {
    code: "DEFAULT_DATABASE_FORBIDDEN",
  });
  assert.throws(() => validateProbeTarget({ limit: 2 }), { code: "PROBE_LIMIT_INVALID" });
  assert.throws(() => validateProbeTarget({ collectionName: "items" }), { code: "PROBE_COLLECTION_MISMATCH" });

  // 2. Bloqueio de variaveis de ambiente perigosas e exigencia de NO_GCE_CHECK=true
  assert.throws(
    () => assertSafeProbeEnvironment({ GOOGLE_APPLICATION_CREDENTIALS: "/tmp/ficticio.json" }),
    { code: "METADATA_FALLBACK_NOT_DISABLED" }
  );
  for (const blockedVar of ["FIRESTORE_EMULATOR_HOST", "GOOGLE_CLOUD_PROJECT", "GCE_METADATA_HOST", "FIREBASE_CONFIG"]) {
    assert.equal(BLOCKED_ENV_VARS.includes(blockedVar), true);
    assert.throws(
      () =>
        assertSafeProbeEnvironment({
          NO_GCE_CHECK: "true",
          GOOGLE_APPLICATION_CREDENTIALS: "/tmp/ficticio.json",
          [blockedVar]: "valor-indevido",
        }),
      { code: "BLOCKED_ENV_VAR_PRESENT" }
    );
  }

  // 3. Fluxo sintetico completo da sonda com query injetada (zero Firebase real) e confirmacao de zero PII na saida
  const fx = makeApprovalFixture();
  const dir = mkdtempSync(join(tmpdir(), "localiza-e28-probe-"));
  try {
    const recPath = join(dir, "approval.json");
    const sigPath = join(dir, "approval.sig");
    const pubPath = join(dir, "trusted.pub.pem");
    const adcPath = join(dir, "adc-impersonated.json");
    writeFileSync(recPath, fx.recordJsonText, { mode: 0o600 });
    writeFileSync(sigPath, fx.signatureBase64, { mode: 0o600 });
    writeFileSync(pubPath, fx.publicKeyPem, { mode: 0o600 });
    writeFileSync(adcPath, JSON.stringify(makeValidImpersonatedAdc()), { mode: 0o600 });

    let queryInvoked = false;
    const probeResult = await runProbeReadOnlyV4({
      env: {
        NO_GCE_CHECK: "true",
        GOOGLE_APPLICATION_CREDENTIALS: adcPath,
        APPROVED_AUDIT_RECORD_FILE: recPath,
        APPROVED_AUDIT_SIGNATURE_FILE: sigPath,
        TRUSTED_ADMIN_PUBKEY_FILE: pubPath,
        TRUSTED_ADMIN_PUBKEY_SHA256: fx.trustedPin,
        EXPECTED_AUDIT_SA: FICTITIOUS_SA,
      },
      executeLiveQuery: async ({ target }) => {
        queryInvoked = true;
        assert.equal(target.databaseId, EXPECTED_DATABASE_ID);
        assert.equal(target.collectionName, "users");
        assert.equal(target.limit, 1);
        return { size: 1, empty: false };
      },
    });
    assert.equal(queryInvoked, true);
    assert.equal(probeResult.status, "PROBE_READONLY_OK");
    assert.equal(probeResult.documentsReturned, 1);
    assert.equal(probeResult.hasAtLeastOneDocument, true);
    assert.equal(probeResult.scopeNotice, "SINGLE_DOCUMENT_CONNECTIVITY_PROBE_ONLY_NOT_FULL_COLLECTION_AUDIT");

    // 4. Ordem fail-closed: se a assinatura falhar, executeLiveQuery NUNCA e chamado
    let calledOnBadSig = false;
    await assert.rejects(
      () =>
        runProbeReadOnlyV4({
          env: {
            NO_GCE_CHECK: "true",
            GOOGLE_APPLICATION_CREDENTIALS: adcPath,
            APPROVED_AUDIT_RECORD_FILE: recPath,
            APPROVED_AUDIT_SIGNATURE_FILE: sigPath,
            TRUSTED_ADMIN_PUBKEY_FILE: pubPath,
            TRUSTED_ADMIN_PUBKEY_SHA256: "0".repeat(64),
            EXPECTED_AUDIT_SA: FICTITIOUS_SA,
          },
          executeLiveQuery: async () => {
            calledOnBadSig = true;
            return { size: 0, empty: true };
          },
        }),
      { code: "UNTRUSTED_PUBLIC_KEY_FINGERPRINT" }
    );
    assert.equal(calledOnBadSig, false);

    // 5. CLI do verificador candidato exige EXPECTED_AUDIT_SA (fail-closed)
    const missingSaCli = spawnSync(process.execPath, [CANDIDATE_VERIFIER_CLI], {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        APPROVED_AUDIT_RECORD_FILE: recPath,
        APPROVED_AUDIT_SIGNATURE_FILE: sigPath,
        TRUSTED_ADMIN_PUBKEY_FILE: pubPath,
        TRUSTED_ADMIN_PUBKEY_SHA256: fx.trustedPin,
      },
    });
    assert.notEqual(missingSaCli.status, 0);
    assert.match(missingSaCli.stderr, /EXPECTED_AUDIT_SA_MISSING/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // 6. Auditoria estatica do arquivo da sonda: zero imports estaticos Firebase, zero escrita, presenca de finally + deleteApp
  const probeSource = readFileSync(CANDIDATE_PROBE_PATH, "utf8");
  assert.equal(/^\s*import\s+.*firebase-admin/m.test(probeSource), false);
  for (const forbidden of [".set(", ".add(", ".update(", ".delete(", ".create(", ".batch(", ".runTransaction(", "bulkWriter"]) {
    assert.equal(probeSource.includes(forbidden), false, `Forbidden write method found: ${forbidden}`);
  }
  assert.equal(probeSource.includes("finally {"), true);
  assert.equal(probeSource.includes("deleteAppFn(firebaseApp)"), true);
  assert.equal(probeSource.includes(".limit(target.limit).get()"), true);

  // 7. Execucao direta da sonda SEM --execute-probe-readonly retorna DRY_INFO sem conectar ao Firebase
  const dryCli = spawnSync(process.execPath, [CANDIDATE_PROBE_PATH], {
    encoding: "utf8",
    env: { PATH: process.env.PATH },
  });
  assert.equal(dryCli.status, 0);
  const dryJson = JSON.parse(dryCli.stdout);
  assert.equal(dryJson.status, "DRY_INFO_NO_FIREBASE_CONNECTION");
});
