/**
 * LOCALIZA+ v1.10.13 — Etapa 27
 * Suite independente de testes sinteticos (100% dados ficticios, zero Firebase)
 * para `verify-approval-record.mjs` e `validate-audit-summary.mjs`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  EXPECTED_DATABASE_ID,
  EXPECTED_PROJECT_ID,
  canonicalizeApprovalRecord,
  computePublicKeyFingerprintSha256,
  verifySignedApprovalRecord,
} from "./verify-approval-record.mjs";
import {
  CLASSIFICATION_KEYS,
  EXPECTED_AUDITOR_VERSION,
  EXPECTED_COLLECTION_NAME,
  EXPECTED_IMPLEMENTATION_ORIGIN,
  EXPECTED_MODE,
  EXPECTED_ROOT_MASKED_UID,
  EXPECTED_RULES_COMMIT,
  EXPECTED_RULES_SHA256,
  VERDICT_MAP,
  assertShareableSummarySafe,
  validateAndExtractAuditSummary,
} from "./validate-audit-summary.mjs";

const VALIDATOR_CLI = resolve("scripts/audit/validate-audit-summary.mjs");
const VERIFIER_CLI = resolve("scripts/audit/verify-approval-record.mjs");

const REF_NS = Object.freeze({ seconds: 1_750_000_000, nanoseconds: 0 });
const REF_ISO = new Date(REF_NS.seconds * 1000).toISOString();
const FICTITIOUS_SA = "audit-readonly-ficticio@gen-lang-client-0490390966.iam.gserviceaccount.com";

function makeSyntheticResult(index, classification) {
  const hex = index.toString(16).padStart(12, "0");
  return {
    maskedUid: `uid_${hex}`,
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
  let verdictCode;
  let inconclusiveReasons = [];
  if (totalRead === 0) {
    verdictCode = "D";
    inconclusiveReasons = ["EMPTY_COLLECTION"];
  } else if (counts.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE > 0) {
    verdictCode = "C";
  } else if (counts.INCONSISTENCIA_DE_DADOS > 0 || counts.DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO > 0) {
    verdictCode = "B";
  } else {
    verdictCode = "A";
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

function runValidatorCli(reportObj, stderrText = "") {
  const dir = mkdtempSync(join(tmpdir(), "localiza-val-test-"));
  const rawPath = join(dir, "raw.json");
  const errPath = join(dir, "stderr.log");
  const outPath = join(dir, "summary.json");
  try {
    writeFileSync(rawPath, JSON.stringify(reportObj, null, 2), { mode: 0o600 });
    writeFileSync(errPath, stderrText, { mode: 0o600 });
    const proc = spawnSync(process.execPath, [VALIDATOR_CLI], {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        AUDIT_RAW_QUARANTINE_FILE: rawPath,
        AUDIT_STDERR_QUARANTINE_FILE: errPath,
        AUDIT_SUMMARY_OUT_FILE: outPath,
      },
    });
    const outExists = existsSync(outPath);
    const outJson = outExists ? JSON.parse(readFileSync(outPath, "utf8")) : null;
    return { status: proc.status, stdout: proc.stdout, stderr: proc.stderr, outExists, outJson };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function makeSignedApprovalFixture(recordOverrides = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const trustedPin = computePublicKeyFingerprintSha256(publicKeyPem);
  const now = new Date();
  const issuedAt = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();

  const record = {
    schemaVersion: "localiza-audit-approval-v1",
    approvalId: "APPR-2026-FICTICIO-001",
    projectId: EXPECTED_PROJECT_ID,
    databaseId: EXPECTED_DATABASE_ID,
    collectionName: EXPECTED_COLLECTION_NAME,
    serviceAccountEmail: FICTITIOUS_SA,
    purpose: "READ_ONLY_USERS_COMPATIBILITY_AUDIT",
    scope: "READ_ONLY",
    issuedAt,
    expiresAt,
    revoked: false,
    issuerKeyId: "gcp-admin-ed25519-test-key-01",
    ...recordOverrides,
  };
  const canonical = canonicalizeApprovalRecord(record);
  const signatureBase64 = sign(null, canonical, privateKey).toString("base64");
  return { record, recordJsonText: JSON.stringify(record, null, 2), signatureBase64, publicKeyPem, trustedPin };
}

function runVerifierCli({ recordJsonText, signatureBase64, publicKeyPem, trustedPin, expectedSa = FICTITIOUS_SA }) {
  const dir = mkdtempSync(join(tmpdir(), "localiza-ver-test-"));
  const recPath = join(dir, "approval.json");
  const sigPath = join(dir, "approval.sig");
  const pubPath = join(dir, "trusted.pub.pem");
  try {
    writeFileSync(recPath, recordJsonText, { mode: 0o600 });
    writeFileSync(sigPath, signatureBase64, { mode: 0o600 });
    writeFileSync(pubPath, publicKeyPem, { mode: 0o600 });
    const proc = spawnSync(process.execPath, [VERIFIER_CLI], {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        APPROVED_AUDIT_RECORD_FILE: recPath,
        APPROVED_AUDIT_SIGNATURE_FILE: sigPath,
        TRUSTED_ADMIN_PUBKEY_FILE: pubPath,
        TRUSTED_ADMIN_PUBKEY_SHA256: trustedPin,
        EXPECTED_AUDIT_SA: expectedSa,
      },
    });
    return { status: proc.status, stdout: proc.stdout, stderr: proc.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("01. Relatorio valido com zero documentos (preserva veredito D EMPTY_COLLECTION e rejeita falso veredito A)", () => {
  const emptyReport = makeValidReport([]);
  const cliRes = runValidatorCli(emptyReport);
  assert.equal(cliRes.status, 0);
  assert.equal(cliRes.outExists, true);
  assert.equal(cliRes.outJson.pagination.totalRead, 0);
  assert.equal(cliRes.outJson.verdictCode, "D");
  assert.deepEqual(cliRes.outJson.inconclusiveReasons, ["EMPTY_COLLECTION"]);
  assert.equal(Object.prototype.hasOwnProperty.call(cliRes.outJson, "results"), false);

  // Falso relatorio com zero documentos tentando se passar por veredito A deve ser rejeitado
  const fakeA = makeValidReport([], { verdictCode: "A", verdict: VERDICT_MAP.A, inconclusiveReasons: [] });
  assert.throws(() => validateAndExtractAuditSummary(fakeA), { code: "INVALID_EMPTY_COLLECTION_VERDICT" });
  const cliFake = runValidatorCli(fakeA);
  assert.notEqual(cliFake.status, 0);
  assert.equal(cliFake.outExists, false);
});

test("02. Relatorio valido com documentos de todas as 5 classificacoes", () => {
  const allFive = CLASSIFICATION_KEYS.map((cls, idx) => makeSyntheticResult(idx + 1, cls));
  const report = makeValidReport(allFive);
  const cliRes = runValidatorCli(report);
  assert.equal(cliRes.status, 0);
  assert.equal(cliRes.outExists, true);
  assert.equal(cliRes.outJson.verdictCode, "C");
  assert.equal(cliRes.outJson.pagination.totalRead, 5);
  for (const key of CLASSIFICATION_KEYS) {
    assert.equal(cliRes.outJson.counts[key], 1);
  }
  assert.equal(Object.prototype.hasOwnProperty.call(cliRes.outJson, "results"), false);
});

test("03. Contagem divergente (soma diferente de totalRead e divergencia frente a recontagem de results)", () => {
  const reportSumMismatch = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  reportSumMismatch.counts.DOCUMENTO_COMPATIVEL = 2;
  assert.throws(() => validateAndExtractAuditSummary(reportSumMismatch), { code: "COUNTS_SUM_MISMATCH" });
  const cli1 = runValidatorCli(reportSumMismatch);
  assert.notEqual(cli1.status, 0);
  assert.equal(cli1.outExists, false);

  const reportRecountMismatch = makeValidReport([
    makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL"),
    makeSyntheticResult(2, "BLOQUEIO_INTENCIONAL_COMPATIVEL"),
  ]);
  reportRecountMismatch.counts.DOCUMENTO_COMPATIVEL = 2;
  reportRecountMismatch.counts.BLOQUEIO_INTENCIONAL_COMPATIVEL = 0;
  assert.throws(() => validateAndExtractAuditSummary(reportRecountMismatch), { code: "RECOUNT_MISMATCH" });
  const cli2 = runValidatorCli(reportRecountMismatch);
  assert.notEqual(cli2.status, 0);
  assert.equal(cli2.outExists, false);
});

test("04. Resultado individual ausente (results.length menor que pagination.totalRead)", () => {
  const report = makeValidReport([
    makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL"),
    makeSyntheticResult(2, "DOCUMENTO_COMPATIVEL"),
  ]);
  report.results = [report.results[0]];
  assert.throws(() => validateAndExtractAuditSummary(report), { code: "RESULTS_LENGTH_MISMATCH" });
  const cli = runValidatorCli(report);
  assert.notEqual(cli.status, 0);
  assert.equal(cli.outExists, false);
});

test("05. Resultado individual duplicado (maskedUid duplicado em results e duplicateDocIdsCount > 0)", () => {
  const dupItem = makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL");
  const reportDupArray = makeValidReport([dupItem, { ...dupItem }]);
  assert.throws(() => validateAndExtractAuditSummary(reportDupArray), { code: "DUPLICATE_RESULT_ENTRY" });
  const cli1 = runValidatorCli(reportDupArray);
  assert.notEqual(cli1.status, 0);
  assert.equal(cli1.outExists, false);

  const reportDupCounter = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  reportDupCounter.pagination.duplicateDocIdsCount = 1;
  assert.throws(() => validateAndExtractAuditSummary(reportDupCounter), { code: "DUPLICATE_DOC_IDS_DETECTED" });
  const cli2 = runValidatorCli(reportDupCounter);
  assert.notEqual(cli2.status, 0);
});

test("06. Paginacao incompleta (pagination.completed === false)", () => {
  const report = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  report.pagination.completed = false;
  assert.throws(() => validateAndExtractAuditSummary(report), { code: "INCOMPLETE_PAGINATION" });
  const cli = runValidatorCli(report);
  assert.notEqual(cli.status, 0);
  assert.equal(cli.outExists, false);
});

test("07. Erro de leitura (pagination.readError preenchido)", () => {
  const report = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  report.pagination.readError = "READ_ERROR:permission-denied";
  assert.throws(() => validateAndExtractAuditSummary(report), { code: "READ_ERROR_PRESENT" });
  const cli = runValidatorCli(report);
  assert.notEqual(cli.status, 0);
  assert.equal(cli.outExists, false);
});

test("08. Cursor estagnado (pagination.stagnantCursorDetected === true)", () => {
  const report = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  report.pagination.stagnantCursorDetected = true;
  assert.throws(() => validateAndExtractAuditSummary(report), { code: "STAGNANT_CURSOR_DETECTED" });
  const cli = runValidatorCli(report);
  assert.notEqual(cli.status, 0);
  assert.equal(cli.outExists, false);
});

test("09. Classificacao desconhecida em results e em counts", () => {
  const reportUnknownResult = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  reportUnknownResult.results[0].classification = "CLASSIFICACAO_DESCONHECIDA";
  assert.throws(() => validateAndExtractAuditSummary(reportUnknownResult), { code: "UNKNOWN_CLASSIFICATION" });
  const cli1 = runValidatorCli(reportUnknownResult);
  assert.notEqual(cli1.status, 0);

  const reportUnknownCountKey = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  reportUnknownCountKey.counts.CLASSIFICACAO_EXTRA = 0;
  assert.throws(() => validateAndExtractAuditSummary(reportUnknownCountKey), { code: "UNEXPECTED_KEY" });
  const cli2 = runValidatorCli(reportUnknownCountKey);
  assert.notEqual(cli2.status, 0);
});

test("10. Campo inesperado na raiz", () => {
  const report = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  report.campoInesperado = "nao-permitido";
  assert.throws(() => validateAndExtractAuditSummary(report), { code: "UNEXPECTED_KEY" });
  const cli = runValidatorCli(report);
  assert.notEqual(cli.status, 0);
  assert.equal(cli.outExists, false);
});

test("11. Campo inesperado em objeto aninhado (metadata e pagination)", () => {
  const rMeta = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  rMeta.metadata.extraNested = true;
  assert.throws(() => validateAndExtractAuditSummary(rMeta), { code: "UNEXPECTED_KEY" });
  assert.notEqual(runValidatorCli(rMeta).status, 0);

  const rPag = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  rPag.pagination.extraPag = 123;
  assert.throws(() => validateAndExtractAuditSummary(rPag), { code: "UNEXPECTED_KEY" });
  assert.notEqual(runValidatorCli(rPag).status, 0);
});

test("12. Campo obrigatorio ausente", () => {
  const report = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  delete report.metadata.rulesSha256Expected;
  assert.throws(() => validateAndExtractAuditSummary(report), { code: "MISSING_REQUIRED_KEY" });
  const cli = runValidatorCli(report);
  assert.notEqual(cli.status, 0);
  assert.equal(cli.outExists, false);
});

test("13. Tipo incorreto em campos numericos e booleanos", () => {
  const rTotal = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  rTotal.pagination.totalRead = "1";
  assert.throws(() => validateAndExtractAuditSummary(rTotal), { code: "INVALID_TOTAL_READ" });
  assert.notEqual(runValidatorCli(rTotal).status, 0);

  const rFloat = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  rFloat.counts.DOCUMENTO_COMPATIVEL = 1.5;
  assert.throws(() => validateAndExtractAuditSummary(rFloat), { code: "INVALID_COUNT_VALUE" });
  assert.notEqual(runValidatorCli(rFloat).status, 0);
});

test("14. SHA-256 invalido ou divergente", () => {
  const report = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  report.metadata.rulesSha256Expected = "0".repeat(64);
  assert.throws(() => validateAndExtractAuditSummary(report), { code: "INVALID_RULES_SHA256" });
  const cli = runValidatorCli(report);
  assert.notEqual(cli.status, 0);
  assert.equal(cli.outExists, false);
});

test("15. Commit invalido ou divergente", () => {
  const report = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  report.metadata.rulesCommit = "1".repeat(40);
  assert.throws(() => validateAndExtractAuditSummary(report), { code: "INVALID_RULES_COMMIT" });
  const cli = runValidatorCli(report);
  assert.notEqual(cli.status, 0);
  assert.equal(cli.outExists, false);
});

test("16. Veredito divergente do codigo e das contagens", () => {
  const rTextMismatch = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  rTextMismatch.verdict = VERDICT_MAP.C;
  assert.throws(() => validateAndExtractAuditSummary(rTextMismatch), { code: "VERDICT_TEXT_MISMATCH" });
  assert.notEqual(runValidatorCli(rTextMismatch).status, 0);

  const rCountsMismatch = makeValidReport([makeSyntheticResult(1, "PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE")]);
  rCountsMismatch.verdictCode = "A";
  rCountsMismatch.verdict = VERDICT_MAP.A;
  assert.throws(() => validateAndExtractAuditSummary(rCountsMismatch), { code: "VERDICT_COUNTS_INCONSISTENCY" });
  assert.notEqual(runValidatorCli(rCountsMismatch).status, 0);
});

test("17. Resultado inconclusivo (verdictCode D com documentos lidos)", () => {
  const report = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  report.verdictCode = "D";
  report.verdict = VERDICT_MAP.D;
  assert.throws(() => validateAndExtractAuditSummary(report), { code: "INCONCLUSIVE_VERDICT_REJECTED" });
  const cli = runValidatorCli(report);
  assert.notEqual(cli.status, 0);
  assert.equal(cli.outExists, false);
});

test("18. unexpectedClassificationsCount diferente de zero", () => {
  const report = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  report.unexpectedClassificationsCount = 1;
  assert.throws(() => validateAndExtractAuditSummary(report), { code: "UNEXPECTED_CLASSIFICATIONS_NON_ZERO" });
  const cli = runValidatorCli(report);
  assert.notEqual(cli.status, 0);
  assert.equal(cli.outExists, false);
});

test("19. inconclusiveReasons nao vazio em relatorio nao vazio", () => {
  const report = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  report.inconclusiveReasons = ["PAGE_READ_ERROR"];
  assert.throws(() => validateAndExtractAuditSummary(report), { code: "INCONCLUSIVE_REASONS_NON_EMPTY" });
  const cli = runValidatorCli(report);
  assert.notEqual(cli.status, 0);
  assert.equal(cli.outExists, false);
});

test("20. Registro de aprovacao adulterado apos assinatura Ed25519", () => {
  const fx = makeSignedApprovalFixture();
  // Fluxo positivo base primeiro
  const okCli = runVerifierCli(fx);
  assert.equal(okCli.status, 0);

  const tampered = { ...fx.record, approvalId: "APPR-2026-ADULTERADO-999" };
  const tamperedJson = JSON.stringify(tampered, null, 2);
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: tamperedJson,
        signatureBase64: fx.signatureBase64,
        trustedPublicKeyPem: fx.publicKeyPem,
        trustedPublicKeySha256: fx.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "INVALID_DIGITAL_SIGNATURE" }
  );
  const badCli = runVerifierCli({ ...fx, recordJsonText: tamperedJson });
  assert.notEqual(badCli.status, 0);
});

test("21. Assinatura digital invalida", () => {
  const fx = makeSignedApprovalFixture();
  const badSig = Buffer.alloc(64, 0xaa).toString("base64");
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: fx.recordJsonText,
        signatureBase64: badSig,
        trustedPublicKeyPem: fx.publicKeyPem,
        trustedPublicKeySha256: fx.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "INVALID_DIGITAL_SIGNATURE" }
  );
  const badCli = runVerifierCli({ ...fx, signatureBase64: badSig });
  assert.notEqual(badCli.status, 0);
});

test("22. Chave publica nao confiavel (assinatura propria de atacante sem pin confiavel)", () => {
  const trustedAdminFx = makeSignedApprovalFixture();
  const attackerFx = makeSignedApprovalFixture();
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: attackerFx.recordJsonText,
        signatureBase64: attackerFx.signatureBase64,
        trustedPublicKeyPem: attackerFx.publicKeyPem,
        trustedPublicKeySha256: trustedAdminFx.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "UNTRUSTED_PUBLIC_KEY_FINGERPRINT" }
  );
  const badCli = runVerifierCli({
    recordJsonText: attackerFx.recordJsonText,
    signatureBase64: attackerFx.signatureBase64,
    publicKeyPem: attackerFx.publicKeyPem,
    trustedPin: trustedAdminFx.trustedPin,
  });
  assert.notEqual(badCli.status, 0);
});

test("23. Registro administrativo expirado e registro revogado", () => {
  const pastIssued = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const pastExpired = new Date(Date.now() - 60 * 1000).toISOString();
  const expiredFx = makeSignedApprovalFixture({ issuedAt: pastIssued, expiresAt: pastExpired });
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: expiredFx.recordJsonText,
        signatureBase64: expiredFx.signatureBase64,
        trustedPublicKeyPem: expiredFx.publicKeyPem,
        trustedPublicKeySha256: expiredFx.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "APPROVAL_RECORD_EXPIRED" }
  );
  assert.notEqual(runVerifierCli(expiredFx).status, 0);

  const revokedFx = makeSignedApprovalFixture({ revoked: true });
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: revokedFx.recordJsonText,
        signatureBase64: revokedFx.signatureBase64,
        trustedPublicKeyPem: revokedFx.publicKeyPem,
        trustedPublicKeySha256: revokedFx.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "APPROVAL_RECORD_REVOKED" }
  );
  assert.notEqual(runVerifierCli(revokedFx).status, 0);
});

test("24. Conta de servico diferente da aprovada no registro assinado", () => {
  const fx = makeSignedApprovalFixture();
  const wrongSa = "outra-conta-nao-aprovada@gen-lang-client-0490390966.iam.gserviceaccount.com";
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: fx.recordJsonText,
        signatureBase64: fx.signatureBase64,
        trustedPublicKeyPem: fx.publicKeyPem,
        trustedPublicKeySha256: fx.trustedPin,
        expectedServiceAccountEmail: wrongSa,
      }),
    { code: "SERVICE_ACCOUNT_MISMATCH" }
  );
  const badCli = runVerifierCli({ ...fx, expectedSa: wrongSa });
  assert.notEqual(badCli.status, 0);
});

test("25. Tentativa de inserir dados individuais no resumo final e verificacao de stderr nao vazio", () => {
  const validSummary = validateAndExtractAuditSummary(makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]));
  assert.equal(assertShareableSummarySafe(validSummary), true);

  // Tentativa de injetar `results` ou campo PII no objeto de resumo
  const withResults = { ...validSummary, results: [makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")] };
  assert.throws(() => assertShareableSummarySafe(withResults), { code: "UNEXPECTED_KEY" });

  const withEmail = { ...validSummary, email: "ficticio@example.invalid" };
  assert.throws(() => assertShareableSummarySafe(withEmail), { code: "UNEXPECTED_KEY" });

  // Relatorio bruto com stderr nao vazio tambem deve falhar com exit code != 0 e nao gerar resumo
  const cliNonEmptyStderr = runValidatorCli(makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]), "WARN: detalhe em stderr");
  assert.notEqual(cliNonEmptyStderr.status, 0);
  assert.equal(cliNonEmptyStderr.outExists, false);
});
