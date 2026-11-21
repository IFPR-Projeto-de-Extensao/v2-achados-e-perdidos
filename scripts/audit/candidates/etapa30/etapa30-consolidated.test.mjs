/**
 * LOCALIZA+ v1.10.13 — Etapa 30 Consolidada
 * Suite abrangente de testes sinteticos, de integracao e de seguranca negativos (Secoes 7 e 8).
 * 100% dados ficticios, zero Firebase real, zero credenciais reais, zero trafego de rede.
 * Testes que dependem de Firebase/GCP real sao explicitamente marcados como SKIP / NAO EXECUTADO.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  lstatSync,
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
  AUDITOR_METADATA,
  CLASSIFICATIONS,
  DEFAULT_ROOT_ADMIN_UID,
  auditUsersCollection,
  evaluateUserDocument,
} from "../../audit-users-readonly.mjs";
import {
  canonicalizeApprovalRecord,
  computePublicKeyFingerprintSha256,
  verifySignedApprovalRecord,
} from "./verify-approval-record.etapa30.candidate.mjs";
import { evaluateIamReadinessBundle } from "./evaluate-iam-readiness.etapa30.candidate.mjs";
import {
  validateAndExtractAuditSummary,
  writeRestrictedSummaryFile,
} from "./validate-audit-summary.etapa30.candidate.mjs";
import {
  EXPECTED_COLLECTION_NAME,
  EXPECTED_DATABASE_ID,
  EXPECTED_PROJECT_ID,
  assertSafeProbeEnvironment,
  detectLocalGcpResidency,
  parseCliArguments,
  readControlledAdcFile,
  runProbeReadOnlyV4,
  validateImpersonatedAdcPayload,
} from "./probe-readonly-v4.etapa30.candidate.mjs";

const require = createRequire(import.meta.url);
const FICTITIOUS_SA = "audit-readonly-ficticio@gen-lang-client-0490390966.iam.gserviceaccount.com";
const OTHER_SA = "outra-conta-ficticia@gen-lang-client-0490390966.iam.gserviceaccount.com";
const OPERATOR_EMAIL = "operador.ficticio@ifpr.example.invalid";
const PROBE_E30_PATH = resolve("scripts/audit/candidates/etapa30/probe-readonly-v4.etapa30.candidate.mjs");
const VERIFIER_E30_PATH = resolve("scripts/audit/candidates/etapa30/verify-approval-record.etapa30.candidate.mjs");
const VALIDATOR_E30_PATH = resolve("scripts/audit/candidates/etapa30/validate-audit-summary.etapa30.candidate.mjs");

function makeApprovalFixture(recordOverrides = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const trustedPin = computePublicKeyFingerprintSha256(publicKeyPem);
  const now = new Date();
  const issuedAt = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();

  const record = {
    schemaVersion: "localiza-audit-approval-v1",
    approvalId: "APPR-2026-FICTICIO-030",
    projectId: EXPECTED_PROJECT_ID,
    databaseId: EXPECTED_DATABASE_ID,
    collectionName: EXPECTED_COLLECTION_NAME,
    serviceAccountEmail: FICTITIOUS_SA,
    purpose: "READ_ONLY_USERS_COMPATIBILITY_AUDIT",
    scope: "READ_ONLY",
    issuedAt,
    expiresAt,
    revoked: false,
    issuerKeyId: "gcp-admin-ed25519-autorizado-30",
    ...recordOverrides,
  };
  const canonical = canonicalizeApprovalRecord(record);
  const signatureBase64 = sign(null, canonical, privateKey).toString("base64");
  return { record, recordJsonText: JSON.stringify(record, null, 2), signatureBase64, publicKeyPem, trustedPin };
}

function makeValidIamBundle(overrides = {}, evidenceOverrides = {}) {
  const futureCond = new Date(Date.now() + 90 * 60 * 1000).toISOString();
  return {
    schemaVersion: "localiza-iam-readiness-v1",
    projectId: EXPECTED_PROJECT_ID,
    databaseId: EXPECTED_DATABASE_ID,
    collectedAt: new Date().toISOString(),
    humanOperatorEmail: OPERATOR_EMAIL,
    oauthTokenEmail: OPERATOR_EMAIL,
    credentialOriginType: "authorized_user",
    effectiveServiceAccountEmail: FICTITIOUS_SA,
    impersonatedServiceAccountEmail: FICTITIOUS_SA,
    ...overrides,
    evidence: {
      operatorTicketVerified: true,
      gcloudAuthAccount: OPERATOR_EMAIL,
      oauthTokenInfoVerified: true,
      saDescribe: {
        email: FICTITIOUS_SA,
        projectId: EXPECTED_PROJECT_ID,
        disabled: false,
      },
      saUserManagedKeysCount: 0,
      tokenCreatorPolicy: {
        members: [`user:${OPERATOR_EMAIL}`],
        hasTemporalCondition: true,
        conditionExpiresAt: futureCond,
        hasOtherSaPolicyRoles: false,
      },
      directProjectRoles: ["roles/datastore.viewer"],
      inheritedAncestorBindings: [],
      groupMembershipsWithIam: [],
      customRoles: [],
      denyPolicies: {
        inspected: true,
        applicablePoliciesCount: 0,
        blocksReadOnlyAudit: false,
      },
      orgPolicies: {
        inspected: true,
        compatibleWithShortLivedImpersonation: true,
      },
      dataAccessAuditLogs: {
        firestoreDataReadEnabled: true,
        iamCredentialsDataReadEnabled: true,
        retentionDays: 90,
        logReaderAccessVerified: true,
      },
      ...evidenceOverrides,
    },
  };
}

function makeValidAdc(overrides = {}) {
  return {
    type: "impersonated_service_account",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${FICTITIOUS_SA}:generateAccessToken`,
    quota_project_id: EXPECTED_PROJECT_ID,
    delegates: [],
    source_credentials: {
      type: "authorized_user",
      client_id: "fictitious-client-id-30.apps.googleusercontent.com",
      client_secret: "fictitious-client-secret-placeholder",
      refresh_token: "fictitious-refresh-token-placeholder",
      account: OPERATOR_EMAIL,
    },
    ...overrides,
  };
}

function createSyntheticWorkspace({
  approvalFx = makeApprovalFixture(),
  iamBundle = makeValidIamBundle(),
  adcObj = makeValidAdc(),
  adcMode = 0o600,
  dirMode = 0o700,
  usedIds = [],
} = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "localiza-e30-ws-")));
  chmodSync(dir, dirMode);
  const recPath = join(dir, "approval.json");
  const sigPath = join(dir, "approval.sig");
  const pubPath = join(dir, "trusted.pub.pem");
  const iamPath = join(dir, "iam-readiness.json");
  const adcPath = join(dir, "adc-controlled.json");
  const usedPath = join(dir, "used-approvals.json");

  writeFileSync(recPath, approvalFx.recordJsonText, { mode: 0o600 });
  writeFileSync(sigPath, approvalFx.signatureBase64, { mode: 0o600 });
  writeFileSync(pubPath, approvalFx.publicKeyPem, { mode: 0o600 });
  writeFileSync(iamPath, JSON.stringify(iamBundle, null, 2), { mode: 0o600 });
  writeFileSync(adcPath, JSON.stringify(adcObj, null, 2), { mode: adcMode });
  writeFileSync(usedPath, JSON.stringify(usedIds), { mode: 0o600 });
  chmodSync(adcPath, adcMode);

  return {
    dir,
    recPath,
    sigPath,
    pubPath,
    iamPath,
    adcPath,
    usedPath,
    env: {
      METADATA_SERVER_DETECTION: "none",
      GOOGLE_APPLICATION_CREDENTIALS: adcPath,
      APPROVED_AUDIT_RECORD_FILE: recPath,
      APPROVED_AUDIT_SIGNATURE_FILE: sigPath,
      TRUSTED_ADMIN_PUBKEY_FILE: pubPath,
      TRUSTED_ADMIN_PUBKEY_SHA256: approvalFx.trustedPin,
      AUTHORIZED_ISSUER_KEY_IDS: approvalFx.record.issuerKeyId,
      USED_APPROVAL_IDS_FILE: usedPath,
      IAM_READINESS_EVIDENCE_FILE: iamPath,
      EXPECTED_AUDIT_SA: FICTITIOUS_SA,
      EXPECTED_ADC_SOURCE_ACCOUNT: OPERATOR_EMAIL,
    },
  };
}

const NON_GCP_RESIDENCY = () => ({ isGcpComputeHost: false, indicators: [] });

function makeSyntheticFirebaseLoader({ snap = { size: 1, empty: false }, queryError = null, delayMs = 0, deleteError = null, onEvents = [] } = {}) {
  return async () => {
    onEvents.push("HOOK_FIREBASE_IMPORT");
    return {
      applicationDefault: () => ({ kind: "synthetic" }),
      initializeApp: (_opts, name) => {
        onEvents.push("HOOK_INITIALIZE_APP");
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
                      onEvents.push("HOOK_FIRESTORE_GET");
                      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
                      if (queryError) throw queryError;
                      return snap;
                    },
                  };
                },
              };
            },
          };
        },
      }),
      deleteApp: async () => {
        onEvents.push("HOOK_DELETE_APP");
        if (deleteError) throw deleteError;
      },
    };
  };
}

// ============================================================================
// TESTES DE ORDEM DE GATES, INICIALIZACAO E FLUXO COMPLETO (E30-01..E30-03)
// ============================================================================

test("E30-01. Zero import estatico Firebase e ordem estrita dos 7 gates (A -> B -> C -> D -> E -> F -> G)", async () => {
  const src = readFileSync(PROBE_E30_PATH, "utf8");
  const staticImports = [...src.matchAll(/^\s*import\s+[\s\S]*?from\s+["']([^"']+)["'];/gm)].map((m) => m[1]);
  assert.deepEqual(staticImports, ["node:fs", "node:os", "node:path", "node:url"]);

  const ws = createSyntheticWorkspace();
  const events = [];
  try {
    const res = await runProbeReadOnlyV4({
      env: ws.env,
      residencyDetector: NON_GCP_RESIDENCY,
      onEvent: (ev) => events.push(ev),
      loadFirebaseModules: makeSyntheticFirebaseLoader({ onEvents: events }),
    });
    assert.equal(res.status, "PROBE_READONLY_OK");
    assert.equal(res.iamReadinessStatus, "READY");
    assert.equal(res.wireProjectionField, "__name__");
    assert.equal(res.collectionEmpty, false);
    assert.deepEqual(events, [
      "GATE_A_APPROVAL_VERIFY_START",
      "GATE_A_APPROVAL_VERIFY_OK",
      "GATE_B_IAM_READINESS_START",
      "GATE_B_IAM_READINESS_OK",
      "GATE_C_ENV_AND_RESIDENCY_START",
      "GATE_C_ENV_AND_RESIDENCY_OK",
      "GATE_D_ADC_READ_START",
      "GATE_D_ADC_READ_OK",
      "GATE_E_ADC_VALIDATE_START",
      "GATE_E_ADC_VALIDATE_OK",
      "GATE_F_TARGET_VALIDATE_START",
      "GATE_F_TARGET_VALIDATE_OK",
      "GATE_G_FIREBASE_IMPORT_START",
      "HOOK_FIREBASE_IMPORT",
      "GATE_G_FIREBASE_IMPORT_OK",
      "GATE_G_FIREBASE_INIT",
      "HOOK_INITIALIZE_APP",
      "GATE_G_FIRESTORE_QUERY_START",
      "HOOK_FIRESTORE_GET",
      "GATE_G_FIRESTORE_QUERY_OK",
      "GATE_G_FIREBASE_CLEANUP_START",
      "HOOK_DELETE_APP",
      "GATE_G_FIREBASE_CLEANUP_OK",
    ]);
  } finally {
    rmSync(ws.dir, { recursive: true, force: true });
  }
});

test("E30-02. Colecao /users vazia na sonda e no fluxo integrado auditor -> validador allowlist", async () => {
  const ws = createSyntheticWorkspace();
  try {
    const probeRes = await runProbeReadOnlyV4({
      env: ws.env,
      residencyDetector: NON_GCP_RESIDENCY,
      loadFirebaseModules: makeSyntheticFirebaseLoader({ snap: { size: 0, empty: true } }),
    });
    assert.equal(probeRes.documentsReturned, 0);
    assert.equal(probeRes.hasAtLeastOneDocument, false);
    assert.equal(probeRes.collectionEmpty, true);

    // Integracao sintetica: auditUsersCollection (vazio) -> validateAndExtractAuditSummary -> escrita atomica 0600
    const rawReport = await auditUsersCollection({
      fetchPage: async () => ({ docs: [], hasMore: false }),
      pageSize: 100,
    });
    assert.equal(rawReport.verdictCode, "D");
    assert.deepEqual(rawReport.inconclusiveReasons, ["EMPTY_COLLECTION"]);

    const summary = validateAndExtractAuditSummary(JSON.stringify(rawReport), { stderrText: "" });
    assert.equal(summary.verdictCode, "D");
    assert.equal(Object.prototype.hasOwnProperty.call(summary, "results"), false);

    const outFile = join(ws.dir, "summary-empty.json");
    const writeRes = writeRestrictedSummaryFile(outFile, summary, { requireStrictParentDirMode: true });
    assert.equal(writeRes.mode, 0o600);
    assert.equal(lstatSync(outFile).mode & 0o777, 0o600);
  } finally {
    rmSync(ws.dir, { recursive: true, force: true });
  }
});

test("E30-03. Integracao sintetica com paginacao multi-pagina, limites e validacao bidirecional do resumo", async () => {
  const docsPool = [
    { id: "uid_sintetico_001", data: { id: "uid_sintetico_001", role: "ALUNO", status: "active", active: true, approvalStatus: "APROVADO", email: "a1@estudantes.ifpr.edu.br" } },
    { id: "uid_sintetico_002", data: { id: "uid_sintetico_002", role: "SERVIDOR", status: "active", active: true, approvalStatus: "APROVADO", email: "s1@ifpr.edu.br" } },
    { id: "uid_sintetico_003", data: { id: "uid_sintetico_003", role: "ALUNO", status: "banned", active: false, approvalStatus: "APROVADO", email: "b1@estudantes.ifpr.edu.br" } },
  ];
  const rawReport = await auditUsersCollection({
    pageSize: 2,
    fetchPage: async ({ startAfterDocId, pageSize }) => {
      const startIdx = startAfterDocId ? docsPool.findIndex((d) => d.id === startAfterDocId) + 1 : 0;
      const slice = docsPool.slice(startIdx, startIdx + pageSize);
      return { docs: slice, hasMore: startIdx + pageSize < docsPool.length };
    },
  });
  assert.equal(rawReport.pagination.pagesFetched, 2);
  assert.equal(rawReport.pagination.totalRead, 3);
  assert.equal(rawReport.verdictCode, "A");

  const summary = validateAndExtractAuditSummary(JSON.stringify(rawReport), { stderrText: "" });
  assert.equal(summary.pagination.pagesFetched, 2);
  assert.equal(summary.counts.DOCUMENTO_COMPATIVEL, 2);
  assert.equal(summary.counts.BLOQUEIO_INTENCIONAL_COMPATIVEL, 1);

  // Manipulacao de pagesFetched excessivo (ex.: 50 paginas para 3 docs com pageSize=2) -> REJEITADO
  const forgedPages = structuredClone(rawReport);
  forgedPages.pagination.pagesFetched = 50;
  assert.throws(() => validateAndExtractAuditSummary(forgedPages), { code: "PAGINATION_EXCESSIVE_PAGES_FETCHED" });

  // Chave JSON duplicada no relatorio bruto -> REJEITADO
  const dupJson = JSON.stringify(rawReport).replace('"verdictCode":"A"', '"verdictCode":"C","verdictCode":"A"');
  assert.throws(() => validateAndExtractAuditSummary(dupJson), { code: "DUPLICATE_REPORT_JSON_KEY" });
});

// ============================================================================
// MATRIZ DE TESTES DE SEGURANCA NEGATIVOS (SECAO 8 — 100% DOS CENARIOS ADVERSOS)
// ============================================================================

test("E30-04. Negativos Ed25519: chave nao confiavel, conteudo adulterado, signatario nao autorizado, replay e expiracao", () => {
  const fx = makeApprovalFixture();
  const attackerKey = generateKeyPairSync("ed25519");
  const attackerPubPem = attackerKey.publicKey.export({ type: "spki", format: "pem" }).toString();

  // 1. Chave publica nao confiavel
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: fx.recordJsonText,
        signatureBase64: fx.signatureBase64,
        trustedPublicKeyPem: attackerPubPem,
        trustedPublicKeySha256: fx.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "UNTRUSTED_PUBLIC_KEY_FINGERPRINT" }
  );

  // 2. Registro assinado com conteudo alterado
  const tampered = fx.recordJsonText.replace("APPR-2026-FICTICIO-030", "APPR-2026-ADULTERADO-9");
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: tampered,
        signatureBase64: fx.signatureBase64,
        trustedPublicKeyPem: fx.publicKeyPem,
        trustedPublicKeySha256: fx.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "INVALID_DIGITAL_SIGNATURE" }
  );

  // 3. Assinatura criptograficamente valida de signatario NAO autorizado (issuerKeyId fora da allowlist)
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: fx.recordJsonText,
        signatureBase64: fx.signatureBase64,
        trustedPublicKeyPem: fx.publicKeyPem,
        trustedPublicKeySha256: fx.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
        authorizedIssuerKeyIds: ["gcp-admin-ed25519-oficial-01"],
      }),
    { code: "UNAUTHORIZED_SIGNER_KEY_ID" }
  );

  // 4. Protecao contra replay (approvalId ja consumido)
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: fx.recordJsonText,
        signatureBase64: fx.signatureBase64,
        trustedPublicKeyPem: fx.publicKeyPem,
        trustedPublicKeySha256: fx.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
        usedApprovalIds: ["APPR-2026-FICTICIO-030"],
      }),
    { code: "APPROVAL_RECORD_REPLAYED" }
  );

  // 5. Expiracao temporal
  const futureRef = new Date(Date.now() + 5 * 60 * 60 * 1000);
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: fx.recordJsonText,
        signatureBase64: fx.signatureBase64,
        trustedPublicKeyPem: fx.publicKeyPem,
        trustedPublicKeySha256: fx.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
        referenceTime: futureRef,
      }),
    { code: "APPROVAL_RECORD_EXPIRED" }
  );
});

test("E30-05. Negativos ADC: outro projeto, usuario sem autorizacao, SA inesperada, impersonacao nao autorizada e chaves duplicadas", () => {
  // 1. ADC apontando para outro projeto (quota_project_id divergente)
  const wrongProj = makeValidAdc({ quota_project_id: "outro-projeto-gcp-999" });
  assert.throws(
    () => validateImpersonatedAdcPayload(JSON.stringify(wrongProj), { expectedServiceAccountEmail: FICTITIOUS_SA }),
    { code: "QUOTA_PROJECT_MISMATCH" }
  );

  // 2. ADC de usuario sem autorizacao (conta de origem divergente)
  assert.throws(
    () =>
      validateImpersonatedAdcPayload(JSON.stringify(makeValidAdc()), {
        expectedServiceAccountEmail: FICTITIOUS_SA,
        expectedSourceAccount: "outro.operador@ifpr.example.invalid",
      }),
    { code: "SOURCE_ACCOUNT_MISMATCH" }
  );

  // 3. Service Account inesperada na URL de impersonacao
  const wrongSaAdc = makeValidAdc({
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${OTHER_SA}:generateAccessToken`,
  });
  assert.throws(
    () => validateImpersonatedAdcPayload(JSON.stringify(wrongSaAdc), { expectedServiceAccountEmail: FICTITIOUS_SA }),
    { code: "IMPERSONATED_SA_MISMATCH" }
  );

  // 4. Impersonacao nao autorizada (delegates encadeados ou tipo authorized_user direto sem impersonacao)
  assert.throws(
    () => validateImpersonatedAdcPayload(JSON.stringify(makeValidAdc({ delegates: [OTHER_SA] })), { expectedServiceAccountEmail: FICTITIOUS_SA }),
    { code: "NON_EMPTY_DELEGATES_FORBIDDEN" }
  );
  assert.throws(
    () => validateImpersonatedAdcPayload(JSON.stringify({ type: "authorized_user" }), { expectedServiceAccountEmail: FICTITIOUS_SA }),
    { code: "UNEXPECTED_ADC_TYPE" }
  );

  // 5. JSON com chaves duplicadas
  const dupAdc = JSON.stringify(makeValidAdc(), null, 2).replace(
    '"client_secret": "fictitious-client-secret-placeholder",',
    '"client_secret": "old", "client_secret": "fictitious-client-secret-placeholder",'
  );
  assert.throws(
    () => validateImpersonatedAdcPayload(dupAdc, { expectedServiceAccountEmail: FICTITIOUS_SA }),
    { code: "ADC_DUPLICATE_JSON_KEY" }
  );
});

test("E30-06. Negativos IAM (13 controles): Token Creator sem condicao, grupo excessivo, custom role com escrita, Deny incompativel, sem Audit Logs e evidencia ausente", () => {
  // 0. Pacote valido completo -> READY
  const okRes = evaluateIamReadinessBundle(makeValidIamBundle(), { expectedServiceAccountEmail: FICTITIOUS_SA });
  assert.equal(okRes.readinessStatus, "READY");
  assert.equal(okRes.approvedForExecution, true);
  assert.equal(okRes.summaryCounts.FAIL, 0);
  assert.equal(okRes.summaryCounts.NOT_VERIFIED, 0);

  // 1. Token Creator sem condicao temporal valida -> FAIL
  const noCond = evaluateIamReadinessBundle(
    makeValidIamBundle({}, { tokenCreatorPolicy: { members: [`user:${OPERATOR_EMAIL}`], hasTemporalCondition: false, conditionExpiresAt: null } }),
    { expectedServiceAccountEmail: FICTITIOUS_SA }
  );
  assert.equal(noCond.approvedForExecution, false);
  assert.equal(noCond.requirements.find((r) => r.id === "TOKEN_CREATOR_CONDITION").status, "FAIL");

  // 2. Grupo herdando permissao excessiva -> FAIL
  const withGroup = evaluateIamReadinessBundle(
    makeValidIamBundle({}, { groupMembershipsWithIam: ["group:admins-ficticios@ifpr.example.invalid"] }),
    { expectedServiceAccountEmail: FICTITIOUS_SA }
  );
  assert.equal(withGroup.approvedForExecution, false);
  assert.equal(withGroup.requirements.find((r) => r.id === "GROUP_INHERITED_PERMISSIONS").status, "FAIL");

  // 3. Papel personalizado com permissao de escrita -> FAIL
  const customWrite = evaluateIamReadinessBundle(
    makeValidIamBundle(
      {},
      {
        directProjectRoles: [`projects/${EXPECTED_PROJECT_ID}/roles/customAuditRole`],
        customRoles: [
          {
            name: `projects/${EXPECTED_PROJECT_ID}/roles/customAuditRole`,
            includedPermissions: ["datastore.entities.get", "datastore.entities.update"],
          },
        ],
      }
    ),
    { expectedServiceAccountEmail: FICTITIOUS_SA }
  );
  assert.equal(customWrite.approvedForExecution, false);
  assert.equal(customWrite.requirements.find((r) => r.id === "CUSTOM_ROLES_PERMISSIONS").status, "FAIL");

  // 4. Deny Policy incompativel -> FAIL
  const badDeny = evaluateIamReadinessBundle(
    makeValidIamBundle({}, { denyPolicies: { inspected: true, applicablePoliciesCount: 1, blocksReadOnlyAudit: true } }),
    { expectedServiceAccountEmail: FICTITIOUS_SA }
  );
  assert.equal(badDeny.approvedForExecution, false);
  assert.equal(badDeny.requirements.find((r) => r.id === "IAM_DENY_POLICIES").status, "FAIL");

  // 5. Ausencia de Data Access Audit Logs -> FAIL
  const noLogs = evaluateIamReadinessBundle(
    makeValidIamBundle(
      {},
      { dataAccessAuditLogs: { firestoreDataReadEnabled: false, iamCredentialsDataReadEnabled: true, retentionDays: 90, logReaderAccessVerified: true } }
    ),
    { expectedServiceAccountEmail: FICTITIOUS_SA }
  );
  assert.equal(noLogs.approvedForExecution, false);
  assert.equal(noLogs.requirements.find((r) => r.id === "DATA_ACCESS_AUDIT_LOGS_DATA_READ").status, "FAIL");

  // 6. Ausencia de evidencia (null) -> NOT_VERIFIED, nunca PASS
  const missingEv = evaluateIamReadinessBundle(
    makeValidIamBundle({}, { inheritedAncestorBindings: null }),
    { expectedServiceAccountEmail: FICTITIOUS_SA }
  );
  assert.equal(missingEv.approvedForExecution, false);
  assert.equal(missingEv.readinessStatus, "BLOCKED_INCOMPLETE_EVIDENCE");
  assert.equal(missingEv.requirements.find((r) => r.id === "INHERITED_ANCESTOR_IAM_ROLES").status, "NOT_VERIFIED");
});

test("E30-07. Negativos fisicos e ambiente: symlink malicioso, diretorio com permissoes excessivas (0755/0777), Metadata Server / GCP residency", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "localiza-e30-phys-")));
  try {
    // 1. Diretorio com permissoes excessivas (0755) -> REJEITADO mesmo com arquivo 0600
    chmodSync(dir, 0o755);
    const adcInLooseDir = join(dir, "adc.json");
    writeFileSync(adcInLooseDir, JSON.stringify(makeValidAdc()), { mode: 0o600 });
    chmodSync(adcInLooseDir, 0o600);
    assert.throws(() => readControlledAdcFile(adcInLooseDir), { code: "ADC_PARENT_DIR_INSECURE_PERMISSIONS" });

    // 2. Diretorio privado 0700 + symlink malicioso -> REJEITADO
    chmodSync(dir, 0o700);
    const sym = join(dir, "sym-adc.json");
    symlinkSync(adcInLooseDir, sym);
    assert.throws(() => readControlledAdcFile(sym), { code: "ADC_SYMLINK_FORBIDDEN" });

    // 3. Diretorio pai 0700 + arquivo 0600 -> ACEITO
    assert.equal(JSON.parse(readControlledAdcFile(adcInLooseDir)).type, "impersonated_service_account");

    // 4. Metadata Server potencialmente acessivel (sem METADATA_SERVER_DETECTION=none OU host GCP Compute Engine via DMI/MAC)
    assert.throws(
      () => assertSafeProbeEnvironment({ NO_GCE_CHECK: "true", GOOGLE_APPLICATION_CREDENTIALS: adcInLooseDir }, { residencyDetector: NON_GCP_RESIDENCY }),
      { code: "METADATA_SERVER_DETECTION_NOT_NONE" }
    );
    const gcpHostDetected = detectLocalGcpResidency({
      readDmiFile: () => "Google Compute Engine\n",
      getNetInterfaces: () => ({}),
    });
    assert.equal(gcpHostDetected.isGcpComputeHost, true);
    assert.throws(
      () =>
        assertSafeProbeEnvironment(
          { METADATA_SERVER_DETECTION: "none", GOOGLE_APPLICATION_CREDENTIALS: adcInLooseDir },
          { residencyDetector: () => gcpHostDetected }
        ),
      { code: "GCP_COMPUTE_RESIDENCY_DETECTED" }
    );

    // 5. Colisao case-insensitive de google_application_credentials -> REJEITADO
    assert.throws(
      () =>
        assertSafeProbeEnvironment(
          { METADATA_SERVER_DETECTION: "none", GOOGLE_APPLICATION_CREDENTIALS: adcInLooseDir, Google_Application_Credentials: "/tmp/x.json" },
          { residencyDetector: NON_GCP_RESIDENCY }
        ),
      { code: "CONFLICTING_ADC_ENV_VARS" }
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("E30-08. Negativos de runtime: bloqueio pre-Firebase, falha de rede, timeout, abort, falha de cleanup e zero PII em logs/CLI", async () => {
  const ws = createSyntheticWorkspace();
  try {
    // 1. Falha no Gate B (IAM incompleto) impede qualquer import ou init do Firebase
    let firebaseTouched = false;
    const incompleteIamPath = join(ws.dir, "iam-incomplete.json");
    writeFileSync(incompleteIamPath, JSON.stringify(makeValidIamBundle({}, { saDescribe: null })), { mode: 0o600 });
    await assert.rejects(
      () =>
        runProbeReadOnlyV4({
          env: { ...ws.env, IAM_READINESS_EVIDENCE_FILE: incompleteIamPath },
          residencyDetector: NON_GCP_RESIDENCY,
          loadFirebaseModules: async () => {
            firebaseTouched = true;
            return {};
          },
        }),
      { code: "IAM_READINESS_INCOMPLETE" }
    );
    assert.equal(firebaseTouched, false);

    // 2. Falha de rede simulada + erro secundario de deleteApp -> preserva erro de rede + cleanupErrorCode
    let netErr = null;
    try {
      await runProbeReadOnlyV4({
        env: ws.env,
        residencyDetector: NON_GCP_RESIDENCY,
        loadFirebaseModules: makeSyntheticFirebaseLoader({
          queryError: Object.assign(new Error("UNAVAILABLE network reset"), { code: "unavailable" }),
          deleteError: new Error("deleteApp failure"),
        }),
      });
    } catch (e) {
      netErr = e;
    }
    assert.equal(netErr?.code, "unavailable");
    assert.equal(netErr?.cleanupErrorCode, "FIREBASE_APP_CLEANUP_FAILED");

    // 3. Timeout de consulta -> PROBE_QUERY_TIMEOUT e deleteApp ainda e chamado
    const timeoutEvents = [];
    await assert.rejects(
      () =>
        runProbeReadOnlyV4({
          env: ws.env,
          targetOverrides: { queryTimeoutMs: 100 },
          residencyDetector: NON_GCP_RESIDENCY,
          onEvent: (e) => timeoutEvents.push(e),
          loadFirebaseModules: makeSyntheticFirebaseLoader({ delayMs: 400, onEvents: timeoutEvents }),
        }),
      { code: "PROBE_QUERY_TIMEOUT" }
    );
    assert.equal(timeoutEvents.includes("HOOK_DELETE_APP"), true);

    // 4. Interrupcao via AbortSignal -> PROBE_INTERRUPTED e deleteApp ainda e chamado
    const ac = new AbortController();
    const abortEvents = [];
    setTimeout(() => ac.abort(), 30);
    await assert.rejects(
      () =>
        runProbeReadOnlyV4({
          env: ws.env,
          abortSignal: ac.signal,
          residencyDetector: NON_GCP_RESIDENCY,
          onEvent: (e) => abortEvents.push(e),
          loadFirebaseModules: makeSyntheticFirebaseLoader({ delayMs: 400, onEvents: abortEvents }),
        }),
      { code: "PROBE_INTERRUPTED" }
    );
    assert.equal(abortEvents.includes("HOOK_DELETE_APP"), true);

    // 5. Tentativa de vazar UID/PII da resposta SDK em stdout/stderr -> ZERO vazamento
    const PII_UID = "UID_CONFIDENCIAL_ETAPA30_XYZ";
    const PII_EMAIL = "pessoa.sigilosa@ifpr.edu.br";
    const resPii = await runProbeReadOnlyV4({
      env: ws.env,
      residencyDetector: NON_GCP_RESIDENCY,
      loadFirebaseModules: makeSyntheticFirebaseLoader({
        snap: {
          size: 1,
          empty: false,
          docs: [{ id: PII_UID, data: () => ({ email: PII_EMAIL }) }],
        },
      }),
    });
    const outStr = JSON.stringify(resPii);
    assert.equal(outStr.includes(PII_UID), false);
    assert.equal(outStr.includes(PII_EMAIL), false);

    // 6. Codigos de saida CLI coerentes (argumento inesperado => exit 2; rejeicao de gate => exit 1; --help => exit 0)
    assert.throws(() => parseCliArguments(["--execute-probe-readonly", "--database=(default)"]), { code: "UNEXPECTED_CLI_ARGUMENT" });
    const cliBadArg = spawnSync(process.execPath, [PROBE_E30_PATH, "--unknown-flag"], { encoding: "utf8" });
    assert.equal(cliBadArg.status, 2);
    assert.equal(JSON.parse(cliBadArg.stderr).errorCode, "UNEXPECTED_CLI_ARGUMENT");

    const cliHelp = spawnSync(process.execPath, [PROBE_E30_PATH, "--help"], { encoding: "utf8" });
    assert.equal(cliHelp.status, 0);
    assert.equal(JSON.parse(cliHelp.stdout).status, "DRY_INFO_NO_FIREBASE_CONNECTION");

    const cliVerifBadArg = spawnSync(process.execPath, [VERIFIER_E30_PATH, "--unexpected"], { encoding: "utf8" });
    assert.equal(cliVerifBadArg.status, 1);
    assert.equal(JSON.parse(cliVerifBadArg.stderr).errorCode, "UNEXPECTED_CLI_ARGUMENT");

    const cliValBadArg = spawnSync(process.execPath, [VALIDATOR_E30_PATH, "--unexpected"], { encoding: "utf8" });
    assert.equal(cliValBadArg.status, 1);
    assert.equal(JSON.parse(cliValBadArg.stderr).errorCode, "UNEXPECTED_CLI_ARGUMENT");
  } finally {
    rmSync(ws.dir, { recursive: true, force: true });
  }
});

test("E30-09. Paridade local homologada entre firestore.rules (SHA-256 2f2a2ffc...) e auditor read-only (Root, ADMIN, SERVIDOR, ALUNO, INTRUSO, standing)", () => {
  const rulesBuf = readFileSync("firestore.rules");
  const rulesSha = createHash("sha256").update(rulesBuf).digest("hex");
  assert.equal(rulesSha, AUDITOR_METADATA.rulesSha256Expected);
  assert.equal(rulesSha, "2f2a2ffc8c471d7fe97b5d1d2bb3c2a3ca27d39947be64449ad13a532c851f9e");

  const refNow = new Date("2026-11-20T12:00:00.000Z");
  const makeTs = (iso) => {
    const d = new Date(iso);
    const ms = d.getTime();
    return { seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1_000_000, toDate: () => d, toMillis: () => ms };
  };

  // Root Admin confirmado via token verificado (sem depender de role no doc)
  const rootOk = evaluateUserDocument(
    DEFAULT_ROOT_ADMIN_UID,
    { id: DEFAULT_ROOT_ADMIN_UID, role: "ADMIN", approvalStatus: "APROVADO", status: "active", active: true },
    refNow,
    { authContext: { uid: DEFAULT_ROOT_ADMIN_UID, email: "paulocauan39@gmail.com", emailVerified: true } }
  );
  assert.equal(rootOk.rulesLayer.rootIdentity.isConfirmedInRules, true);
  assert.equal(rootOk.classification, CLASSIFICATIONS.DOCUMENTO_COMPATIVEL);

  // ADMIN nao-root aprovado vs pendente
  const adminOk = evaluateUserDocument("adm1", { id: "adm1", role: "ADMIN", approvalStatus: "APROVADO", status: "active", active: true }, refNow);
  assert.equal(adminOk.rulesLayer.isAdminByDoc, true);
  assert.equal(adminOk.classification, CLASSIFICATIONS.DOCUMENTO_COMPATIVEL);

  const adminPend = evaluateUserDocument("adm2", { id: "adm2", role: "ADMIN", approvalStatus: "PENDENTE", status: "active", active: true }, refNow);
  assert.equal(adminPend.rulesLayer.isAdminByDoc, false);
  assert.equal(adminPend.classification, CLASSIFICATIONS.DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO);

  // SERVIDOR aprovado, ALUNO ativo, INTRUSO excluido
  const servOk = evaluateUserDocument("srv1", { id: "srv1", role: "SERVIDOR", approvalStatus: "APROVADO", status: "active", active: true }, refNow);
  assert.equal(servOk.rulesLayer.isStaffByDoc, true);
  assert.equal(servOk.classification, CLASSIFICATIONS.DOCUMENTO_COMPATIVEL);

  const alunoOk = evaluateUserDocument("alu1", { id: "alu1", role: "ALUNO", approvalStatus: "APROVADO", status: "active", active: true }, refNow);
  assert.equal(alunoOk.rulesLayer.isMemberByDoc, true);
  assert.equal(alunoOk.classification, CLASSIFICATIONS.DOCUMENTO_COMPATIVEL);

  const intruso = evaluateUserDocument("int1", { id: "int1", role: "INTRUSO", approvalStatus: "PENDENTE", status: "active", active: true }, refNow);
  assert.equal(intruso.rulesLayer.isUserDocActiveData, false);
  assert.equal(intruso.classification, CLASSIFICATIONS.DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO);

  // Standing: suspensao futura valida (bloqueio intencional), expirada (compativel), tipo Timestamp invalido (perda de acesso)
  const suspFuture = evaluateUserDocument(
    "alu2",
    { id: "alu2", role: "ALUNO", approvalStatus: "APROVADO", status: "suspended", active: true, suspendedUntil: makeTs("2026-11-25T12:00:00.000Z") },
    refNow
  );
  assert.equal(suspFuture.rulesLayer.isStandingActive, false);
  assert.equal(suspFuture.classification, CLASSIFICATIONS.BLOQUEIO_INTENCIONAL_COMPATIVEL);

  const blockInvalid = evaluateUserDocument(
    "alu3",
    { id: "alu3", role: "ALUNO", approvalStatus: "APROVADO", status: "active", active: true, blockExpiresAt: "2026-11-25T12:00:00.000Z" },
    refNow
  );
  assert.equal(blockInvalid.classification, CLASSIFICATIONS.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE);
});

test("E30-10. Verificacao offline do wire proto de collection('users').select().limit(1) no @google-cloud/firestore@8.7.1", () => {
  const { Firestore, FieldPath } = require("@google-cloud/firestore");
  const db = new Firestore({
    projectId: EXPECTED_PROJECT_ID,
    databaseId: EXPECTED_DATABASE_ID,
    credentials: { client_email: "ficticio@example.invalid", private_key: "ficticio" },
  });
  const proto = db.collection("users").select().limit(1).toProto();
  assert.deepEqual(proto.structuredQuery.select, { fields: [{ fieldPath: "__name__" }] });
  assert.deepEqual(proto, db.collection("users").select(FieldPath.documentId()).limit(1).toProto());
  assert.equal(proto.parent, `projects/${EXPECTED_PROJECT_ID}/databases/${EXPECTED_DATABASE_ID}/documents`);
  assert.deepEqual(proto.structuredQuery.limit, { value: 1 });
});

// ============================================================================
// TESTES BLOQUEADOS POR DEPENDENCIA EXTERNA (EXPLICITAMENTE NAO EXECUTADOS)
// ============================================================================

test(
  "E30-EXT-01. [BLOQUEADO POR DEPENDENCIA EXTERNA - NAO EXECUTADO] Conectividade TLS/gRPC RunQuery real no banco nomeado",
  { skip: "BLOQUEADO POR DEPENDENCIA EXTERNA: Conexao ao Firebase/Firestore real proibida na Etapa 30" },
  () => {}
);

test(
  "E30-EXT-02. [BLOQUEADO POR DEPENDENCIA EXTERNA - NAO EXECUTADO] Coleta de evidencias reais IAM/OAuth/Cloud Audit Logs no Google Cloud",
  { skip: "BLOQUEADO POR DEPENDENCIA EXTERNA: Consulta IAM/ADC/Logs real no GCP proibida na Etapa 30" },
  () => {}
);
