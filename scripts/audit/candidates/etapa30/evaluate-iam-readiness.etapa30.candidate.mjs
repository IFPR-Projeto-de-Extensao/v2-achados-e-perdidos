#!/usr/bin/env node
/**
 * LOCALIZA+ v1.10.13 — Etapa 30 Consolidada (Copia Candidata)
 * Avaliador deterministico e fail-closed da Matriz de Prontidao IAM e Data Access Audit Logs (13 requisitos).
 *
 * Produz status individuais objetivos para cada requisito:
 *   - "PASS"
 *   - "FAIL"
 *   - "NOT_VERIFIED"
 *   - "NOT_APPLICABLE"
 *
 * Garantias:
 * - Nunca converte ausencia de evidencia ("NOT_VERIFIED") em aprovacao ("PASS").
 * - Rejeita JSON com chaves duplicadas, campos desconhecidos, tipos invalidos e permissoes de escrita/admin.
 * - Distingue explicitamente as 5 identidades: operador humano, identidade OAuth, origem das credenciais,
 *   Service Account efetiva e Service Account impersonada.
 * - Zero conexao ao Google Cloud/Firebase nesta avaliacao estatica local.
 */

import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertNoDuplicateJsonKeys, parseStrictIsoUtc, SERVICE_ACCOUNT_RE } from "./verify-approval-record.etapa30.candidate.mjs";

export const IAM_EVALUATOR_VERSION = "evaluate-iam-readiness-etapa30-candidate";
export const EXPECTED_PROJECT_ID = "gen-lang-client-0490390966";
export const EXPECTED_DATABASE_ID = "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1";
export const EXPECTED_IAM_SCHEMA_VERSION = "localiza-iam-readiness-v1";

export const REQUIREMENT_IDS = Object.freeze([
  "HUMAN_OPERATOR_IDENTITY",
  "OAUTH_ORIGIN_CORRELATION",
  "IMPERSONATED_SERVICE_ACCOUNT",
  "USER_MANAGED_SA_KEYS",
  "TOKEN_CREATOR_CONDITION",
  "DIRECT_PROJECT_IAM_ROLES",
  "INHERITED_ANCESTOR_IAM_ROLES",
  "GROUP_INHERITED_PERMISSIONS",
  "PREDEFINED_AND_BASIC_ROLES_AUDIT",
  "CUSTOM_ROLES_PERMISSIONS",
  "IAM_DENY_POLICIES",
  "ORG_POLICY_CONSTRAINTS",
  "DATA_ACCESS_AUDIT_LOGS_DATA_READ",
]);

export const BUNDLE_TOP_LEVEL_KEYS = Object.freeze([
  "schemaVersion",
  "projectId",
  "databaseId",
  "collectedAt",
  "humanOperatorEmail",
  "oauthTokenEmail",
  "credentialOriginType",
  "effectiveServiceAccountEmail",
  "impersonatedServiceAccountEmail",
  "evidence",
]);

export const EVIDENCE_KEYS = Object.freeze([
  "operatorTicketVerified",
  "gcloudAuthAccount",
  "oauthTokenInfoVerified",
  "saDescribe",
  "saUserManagedKeysCount",
  "tokenCreatorPolicy",
  "directProjectRoles",
  "inheritedAncestorBindings",
  "groupMembershipsWithIam",
  "customRoles",
  "denyPolicies",
  "orgPolicies",
  "dataAccessAuditLogs",
]);

export const ALLOWED_READONLY_PROJECT_ROLES = Object.freeze([
  "roles/datastore.viewer",
  "roles/firebase.viewer",
]);

export const FORBIDDEN_BASIC_OR_WRITE_ROLES = Object.freeze([
  "roles/owner",
  "roles/editor",
  "roles/datastore.owner",
  "roles/datastore.user",
  "roles/firebase.admin",
  "roles/firebase.developAdmin",
  "roles/firebase.sdkAdminServiceAgent",
  "roles/iam.securityAdmin",
  "roles/iam.serviceAccountAdmin",
  "roles/iam.serviceAccountKeyAdmin",
  "roles/resourcemanager.projectIamAdmin",
]);

const ALLOWED_CUSTOM_READONLY_PERMISSIONS = new Set([
  "datastore.entities.get",
  "datastore.entities.list",
  "datastore.databases.get",
  "firebase.projects.get",
  "serviceusage.services.use",
]);

const MUTATION_PERMISSION_RE =
  /(create|update|delete|write|patch|setIamPolicy|import|export|commit|rollback|allocateIds|bulkDelete|admin)/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CUSTOM_ROLE_RE = /^projects\/gen-lang-client-0490390966\/roles\/[a-zA-Z0-9_.]{3,64}$/;

function makeError(code, message) {
  return Object.assign(new Error(message), { code });
}

function assertExactKeys(obj, allowedKeys, context) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw makeError("INVALID_IAM_BUNDLE_STRUCTURE", `Expected object at ${context}`);
  }
  const allowedSet = new Set(allowedKeys);
  for (const key of Object.keys(obj)) {
    if (!allowedSet.has(key)) {
      throw makeError("UNEXPECTED_IAM_BUNDLE_KEY", `Unexpected key ${context}.${key}`);
    }
  }
  for (const key of allowedKeys) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      throw makeError("MISSING_IAM_BUNDLE_KEY", `Missing required key ${context}.${key}`);
    }
  }
}

function itemResult(id, status, reasonCode) {
  return { id, status, reasonCode };
}

/**
 * Avalia um pacote estruturado de evidencias externas de IAM e Data Access Audit Logs.
 * Retorna resultados individualizados (PASS, FAIL, NOT_VERIFIED, NOT_APPLICABLE) e veredito global.
 */
export function evaluateIamReadinessBundle(
  bundleInput,
  { expectedServiceAccountEmail, referenceTime = new Date() } = {}
) {
  if (typeof expectedServiceAccountEmail !== "string" || !SERVICE_ACCOUNT_RE.test(expectedServiceAccountEmail)) {
    throw makeError("INVALID_EXPECTED_SERVICE_ACCOUNT", "expectedServiceAccountEmail must be a valid project service account");
  }
  const refMs = referenceTime instanceof Date ? referenceTime.getTime() : referenceTime;
  if (!Number.isFinite(refMs)) {
    throw makeError("INVALID_REFERENCE_TIME", "referenceTime must be a valid Date or epoch ms");
  }

  let bundle = bundleInput;
  if (typeof bundleInput === "string") {
    assertNoDuplicateJsonKeys(bundleInput, "DUPLICATE_IAM_BUNDLE_KEY");
    try {
      bundle = JSON.parse(bundleInput);
    } catch {
      throw makeError("INVALID_IAM_BUNDLE_JSON", "IAM readiness bundle is not valid JSON");
    }
  }

  assertExactKeys(bundle, BUNDLE_TOP_LEVEL_KEYS, "iamBundle");
  assertExactKeys(bundle.evidence, EVIDENCE_KEYS, "iamBundle.evidence");

  if (bundle.schemaVersion !== EXPECTED_IAM_SCHEMA_VERSION) {
    throw makeError("INVALID_IAM_SCHEMA_VERSION", `Unsupported schemaVersion: ${String(bundle.schemaVersion)}`);
  }
  if (bundle.projectId !== EXPECTED_PROJECT_ID) {
    throw makeError("IAM_PROJECT_ID_MISMATCH", "IAM bundle projectId does not match target project");
  }
  if (bundle.databaseId !== EXPECTED_DATABASE_ID) {
    throw makeError("IAM_DATABASE_ID_MISMATCH", "IAM bundle databaseId does not match target named database");
  }
  parseStrictIsoUtc(bundle.collectedAt, "collectedAt");

  const ev = bundle.evidence;
  const results = [];

  // 1. HUMAN_OPERATOR_IDENTITY
  const humanEmail = typeof bundle.humanOperatorEmail === "string" ? bundle.humanOperatorEmail.trim().toLowerCase() : "";
  const gcloudAcc = typeof ev.gcloudAuthAccount === "string" ? ev.gcloudAuthAccount.trim().toLowerCase() : "";
  if (ev.operatorTicketVerified === null || !gcloudAcc) {
    results.push(itemResult("HUMAN_OPERATOR_IDENTITY", "NOT_VERIFIED", "MISSING_OPERATOR_EVIDENCE"));
  } else if (
    ev.operatorTicketVerified !== true ||
    !EMAIL_RE.test(humanEmail) ||
    humanEmail.endsWith(".gserviceaccount.com") ||
    gcloudAcc !== humanEmail
  ) {
    results.push(itemResult("HUMAN_OPERATOR_IDENTITY", "FAIL", "OPERATOR_IDENTITY_INVALID_OR_MISMATCH"));
  } else {
    results.push(itemResult("HUMAN_OPERATOR_IDENTITY", "PASS", "HUMAN_OPERATOR_VERIFIED"));
  }

  // 2. OAUTH_ORIGIN_CORRELATION (distincao das 5 identidades)
  const oauthEmail = typeof bundle.oauthTokenEmail === "string" ? bundle.oauthTokenEmail.trim().toLowerCase() : "";
  if (ev.oauthTokenInfoVerified === null || !oauthEmail) {
    results.push(itemResult("OAUTH_ORIGIN_CORRELATION", "NOT_VERIFIED", "MISSING_OAUTH_TOKENINFO_EVIDENCE"));
  } else if (
    ev.oauthTokenInfoVerified !== true ||
    bundle.credentialOriginType !== "authorized_user" ||
    oauthEmail !== humanEmail ||
    oauthEmail === expectedServiceAccountEmail.toLowerCase() ||
    oauthEmail.endsWith(".gserviceaccount.com")
  ) {
    results.push(itemResult("OAUTH_ORIGIN_CORRELATION", "FAIL", "OAUTH_ORIGIN_MISMATCH_OR_INVALID"));
  } else {
    results.push(itemResult("OAUTH_ORIGIN_CORRELATION", "PASS", "OAUTH_ORIGIN_CORRELATED_TO_OPERATOR"));
  }

  // 3. IMPERSONATED_SERVICE_ACCOUNT (SA efetiva == SA impersonada == SA aprovada)
  const saDesc = ev.saDescribe;
  if (saDesc === null) {
    results.push(itemResult("IMPERSONATED_SERVICE_ACCOUNT", "NOT_VERIFIED", "MISSING_SA_DESCRIBE_EVIDENCE"));
  } else if (
    !saDesc ||
    typeof saDesc !== "object" ||
    bundle.effectiveServiceAccountEmail !== expectedServiceAccountEmail ||
    bundle.impersonatedServiceAccountEmail !== expectedServiceAccountEmail ||
    saDesc.email !== expectedServiceAccountEmail ||
    saDesc.projectId !== EXPECTED_PROJECT_ID ||
    saDesc.disabled !== false
  ) {
    results.push(itemResult("IMPERSONATED_SERVICE_ACCOUNT", "FAIL", "IMPERSONATED_SA_MISMATCH_OR_DISABLED"));
  } else {
    results.push(itemResult("IMPERSONATED_SERVICE_ACCOUNT", "PASS", "IMPERSONATED_SA_VERIFIED"));
  }

  // 4. USER_MANAGED_SA_KEYS
  if (ev.saUserManagedKeysCount === null) {
    results.push(itemResult("USER_MANAGED_SA_KEYS", "NOT_VERIFIED", "MISSING_SA_KEYS_EVIDENCE"));
  } else if (!Number.isInteger(ev.saUserManagedKeysCount) || ev.saUserManagedKeysCount !== 0) {
    results.push(itemResult("USER_MANAGED_SA_KEYS", "FAIL", "STATIC_USER_MANAGED_SA_KEYS_PRESENT"));
  } else {
    results.push(itemResult("USER_MANAGED_SA_KEYS", "PASS", "ZERO_USER_MANAGED_KEYS"));
  }

  // 5. TOKEN_CREATOR_CONDITION
  const tcp = ev.tokenCreatorPolicy;
  if (tcp === null) {
    results.push(itemResult("TOKEN_CREATOR_CONDITION", "NOT_VERIFIED", "MISSING_TOKEN_CREATOR_POLICY_EVIDENCE"));
  } else if (!tcp || typeof tcp !== "object" || !Array.isArray(tcp.members)) {
    results.push(itemResult("TOKEN_CREATOR_CONDITION", "FAIL", "INVALID_TOKEN_CREATOR_POLICY"));
  } else {
    const expectedMember = `user:${humanEmail}`;
    const exactSingleOperator = tcp.members.length === 1 && tcp.members[0].toLowerCase() === expectedMember;
    const hasCondition = Boolean(tcp.hasTemporalCondition === true && typeof tcp.conditionExpiresAt === "string");
    let condFuture = false;
    if (hasCondition) {
      try {
        condFuture = parseStrictIsoUtc(tcp.conditionExpiresAt, "tokenCreatorPolicy.conditionExpiresAt") > refMs;
      } catch {
        condFuture = false;
      }
    }
    if (!exactSingleOperator || !hasCondition || !condFuture || tcp.hasOtherSaPolicyRoles === true) {
      results.push(itemResult("TOKEN_CREATOR_CONDITION", "FAIL", "TOKEN_CREATOR_SCOPE_OR_CONDITION_INVALID"));
    } else {
      results.push(itemResult("TOKEN_CREATOR_CONDITION", "PASS", "TOKEN_CREATOR_RESTRICTED_WITH_VALID_CONDITION"));
    }
  }

  // 6. DIRECT_PROJECT_IAM_ROLES
  const directRoles = ev.directProjectRoles;
  if (directRoles === null) {
    results.push(itemResult("DIRECT_PROJECT_IAM_ROLES", "NOT_VERIFIED", "MISSING_DIRECT_PROJECT_IAM_EVIDENCE"));
  } else if (!Array.isArray(directRoles) || directRoles.length === 0 || !directRoles.every((r) => typeof r === "string")) {
    results.push(itemResult("DIRECT_PROJECT_IAM_ROLES", "FAIL", "INVALID_OR_EMPTY_DIRECT_ROLES"));
  } else {
    const allAllowed = directRoles.every(
      (r) => ALLOWED_READONLY_PROJECT_ROLES.includes(r) || CUSTOM_ROLE_RE.test(r)
    );
    const hasForbidden = directRoles.some((r) => FORBIDDEN_BASIC_OR_WRITE_ROLES.includes(r));
    if (!allAllowed || hasForbidden) {
      results.push(itemResult("DIRECT_PROJECT_IAM_ROLES", "FAIL", "EXCESSIVE_OR_UNAPPROVED_DIRECT_ROLE"));
    } else {
      results.push(itemResult("DIRECT_PROJECT_IAM_ROLES", "PASS", "DIRECT_ROLES_READONLY_ONLY"));
    }
  }

  // 7. INHERITED_ANCESTOR_IAM_ROLES
  const inherited = ev.inheritedAncestorBindings;
  if (inherited === null) {
    results.push(itemResult("INHERITED_ANCESTOR_IAM_ROLES", "NOT_VERIFIED", "MISSING_ANCESTOR_IAM_EVIDENCE"));
  } else if (!Array.isArray(inherited) || inherited.length > 0) {
    results.push(itemResult("INHERITED_ANCESTOR_IAM_ROLES", "FAIL", "UNEXPECTED_INHERITED_ANCESTOR_BINDINGS"));
  } else {
    results.push(itemResult("INHERITED_ANCESTOR_IAM_ROLES", "PASS", "ZERO_INHERITED_ANCESTOR_BINDINGS"));
  }

  // 8. GROUP_INHERITED_PERMISSIONS
  const groups = ev.groupMembershipsWithIam;
  if (groups === null) {
    results.push(itemResult("GROUP_INHERITED_PERMISSIONS", "NOT_VERIFIED", "MISSING_GROUP_MEMBERSHIP_EVIDENCE"));
  } else if (!Array.isArray(groups) || groups.length > 0) {
    results.push(itemResult("GROUP_INHERITED_PERMISSIONS", "FAIL", "GROUP_INHERITED_PERMISSIONS_DETECTED"));
  } else {
    results.push(itemResult("GROUP_INHERITED_PERMISSIONS", "PASS", "ZERO_GROUP_IAM_BINDINGS"));
  }

  // 9. PREDEFINED_AND_BASIC_ROLES_AUDIT
  if (directRoles === null) {
    results.push(itemResult("PREDEFINED_AND_BASIC_ROLES_AUDIT", "NOT_VERIFIED", "MISSING_ROLE_LIST_FOR_AUDIT"));
  } else if (
    !Array.isArray(directRoles) ||
    directRoles.some(
      (r) =>
        FORBIDDEN_BASIC_OR_WRITE_ROLES.includes(r) ||
        (!ALLOWED_READONLY_PROJECT_ROLES.includes(r) && !CUSTOM_ROLE_RE.test(r))
    )
  ) {
    results.push(itemResult("PREDEFINED_AND_BASIC_ROLES_AUDIT", "FAIL", "FORBIDDEN_BASIC_OR_PREDEFINED_ROLE_PRESENT"));
  } else {
    results.push(itemResult("PREDEFINED_AND_BASIC_ROLES_AUDIT", "PASS", "NO_BASIC_OR_WRITE_PREDEFINED_ROLES"));
  }

  // 10. CUSTOM_ROLES_PERMISSIONS
  const customRoles = ev.customRoles;
  const usesCustomRole = Array.isArray(directRoles) && directRoles.some((r) => CUSTOM_ROLE_RE.test(r));
  if (customRoles === null) {
    results.push(
      itemResult(
        "CUSTOM_ROLES_PERMISSIONS",
        usesCustomRole ? "NOT_VERIFIED" : "NOT_VERIFIED",
        "MISSING_CUSTOM_ROLES_EVIDENCE"
      )
    );
  } else if (!Array.isArray(customRoles)) {
    results.push(itemResult("CUSTOM_ROLES_PERMISSIONS", "FAIL", "INVALID_CUSTOM_ROLES_PAYLOAD"));
  } else if (customRoles.length === 0 && !usesCustomRole) {
    results.push(itemResult("CUSTOM_ROLES_PERMISSIONS", "NOT_APPLICABLE", "NO_CUSTOM_ROLES_ASSIGNED"));
  } else if (customRoles.length === 0 && usesCustomRole) {
    results.push(itemResult("CUSTOM_ROLES_PERMISSIONS", "FAIL", "ASSIGNED_CUSTOM_ROLE_NOT_DESCRIBED"));
  } else {
    let customOk = true;
    for (const cr of customRoles) {
      if (!cr || typeof cr !== "object" || !Array.isArray(cr.includedPermissions) || cr.includedPermissions.length === 0) {
        customOk = false;
        break;
      }
      for (const perm of cr.includedPermissions) {
        if (
          typeof perm !== "string" ||
          MUTATION_PERMISSION_RE.test(perm) ||
          !ALLOWED_CUSTOM_READONLY_PERMISSIONS.has(perm)
        ) {
          customOk = false;
          break;
        }
      }
      if (!customOk) break;
    }
    results.push(
      itemResult(
        "CUSTOM_ROLES_PERMISSIONS",
        customOk ? "PASS" : "FAIL",
        customOk ? "CUSTOM_ROLES_STRICTLY_READONLY" : "CUSTOM_ROLE_CONTAINS_WRITE_OR_UNAPPROVED_PERMISSION"
      )
    );
  }

  // 11. IAM_DENY_POLICIES
  const deny = ev.denyPolicies;
  if (deny === null) {
    results.push(itemResult("IAM_DENY_POLICIES", "NOT_VERIFIED", "MISSING_DENY_POLICIES_EVIDENCE"));
  } else if (!deny || typeof deny !== "object" || deny.inspected !== true) {
    results.push(itemResult("IAM_DENY_POLICIES", "NOT_VERIFIED", "DENY_POLICIES_NOT_INSPECTED"));
  } else if (deny.blocksReadOnlyAudit === true) {
    results.push(itemResult("IAM_DENY_POLICIES", "FAIL", "INCOMPATIBLE_IAM_DENY_POLICY"));
  } else if (deny.applicablePoliciesCount === 0) {
    results.push(itemResult("IAM_DENY_POLICIES", "NOT_APPLICABLE", "NO_APPLICABLE_DENY_POLICIES"));
  } else if (Number.isInteger(deny.applicablePoliciesCount) && deny.applicablePoliciesCount > 0) {
    results.push(itemResult("IAM_DENY_POLICIES", "PASS", "DENY_POLICIES_COMPATIBLE_WITH_READONLY"));
  } else {
    results.push(itemResult("IAM_DENY_POLICIES", "FAIL", "INVALID_DENY_POLICY_COUNT"));
  }

  // 12. ORG_POLICY_CONSTRAINTS
  const org = ev.orgPolicies;
  if (org === null) {
    results.push(itemResult("ORG_POLICY_CONSTRAINTS", "NOT_VERIFIED", "MISSING_ORG_POLICY_EVIDENCE"));
  } else if (!org || typeof org !== "object" || org.inspected !== true) {
    results.push(itemResult("ORG_POLICY_CONSTRAINTS", "NOT_VERIFIED", "ORG_POLICIES_NOT_INSPECTED"));
  } else if (org.compatibleWithShortLivedImpersonation !== true) {
    results.push(itemResult("ORG_POLICY_CONSTRAINTS", "FAIL", "ORG_POLICY_INCOMPATIBLE"));
  } else {
    results.push(itemResult("ORG_POLICY_CONSTRAINTS", "PASS", "ORG_POLICIES_COMPATIBLE"));
  }

  // 13. DATA_ACCESS_AUDIT_LOGS_DATA_READ
  const logs = ev.dataAccessAuditLogs;
  if (logs === null) {
    results.push(itemResult("DATA_ACCESS_AUDIT_LOGS_DATA_READ", "NOT_VERIFIED", "MISSING_DATA_ACCESS_LOGS_EVIDENCE"));
  } else if (
    !logs ||
    typeof logs !== "object" ||
    logs.firestoreDataReadEnabled !== true ||
    logs.iamCredentialsDataReadEnabled !== true ||
    !Number.isInteger(logs.retentionDays) ||
    logs.retentionDays < 30 ||
    logs.logReaderAccessVerified !== true
  ) {
    results.push(itemResult("DATA_ACCESS_AUDIT_LOGS_DATA_READ", "FAIL", "DATA_ACCESS_AUDIT_LOGS_DISABLED_OR_INCOMPLETE"));
  } else {
    results.push(itemResult("DATA_ACCESS_AUDIT_LOGS_DATA_READ", "PASS", "DATA_READ_AUDIT_LOGS_ENABLED_AND_RETAINED"));
  }

  const summaryCounts = { PASS: 0, FAIL: 0, NOT_VERIFIED: 0, NOT_APPLICABLE: 0 };
  for (const r of results) summaryCounts[r.status] += 1;

  let readinessStatus = "READY";
  if (summaryCounts.FAIL > 0) {
    readinessStatus = "BLOCKED_FAIL";
  } else if (summaryCounts.NOT_VERIFIED > 0) {
    readinessStatus = "BLOCKED_INCOMPLETE_EVIDENCE";
  }

  return {
    evaluatorVersion: IAM_EVALUATOR_VERSION,
    projectId: bundle.projectId,
    databaseId: bundle.databaseId,
    readinessStatus,
    approvedForExecution: readinessStatus === "READY",
    identitySeparationVerified:
      results[0].status === "PASS" && results[1].status === "PASS" && results[2].status === "PASS",
    summaryCounts,
    requirements: results,
  };
}

function readSecureBundleFile(filePath) {
  if (!filePath || !isAbsolute(filePath) || !existsSync(filePath)) {
    throw makeError("IAM_BUNDLE_FILE_MISSING", "IAM readiness bundle file must be an existing absolute path");
  }
  const st = lstatSync(filePath);
  if (st.isSymbolicLink() || !st.isFile()) {
    throw makeError("SYMLINK_INPUT_FORBIDDEN", "IAM bundle path must be a regular non-symlink file");
  }
  const resolved = resolve(filePath);
  if (realpathSync(filePath) !== resolved) {
    throw makeError("PARENT_SYMLINK_INPUT_FORBIDDEN", "IAM bundle path contains a symlink in parent directory");
  }
  const dirStat = lstatSync(dirname(resolved));
  if ((dirStat.mode & 0o022) !== 0) {
    throw makeError("INSECURE_PARENT_DIR_PERMISSIONS", "IAM bundle parent directory must not be group/world writable");
  }
  return readFileSync(filePath, "utf8");
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isDirectExecution()) {
  try {
    if (process.argv.slice(2).length > 0) {
      throw makeError("UNEXPECTED_CLI_ARGUMENT", "Unexpected CLI arguments are rejected");
    }
    const bundlePath = (process.env.IAM_READINESS_EVIDENCE_FILE || "").trim();
    const expectedSa = (process.env.EXPECTED_AUDIT_SA || "").trim();
    const raw = readSecureBundleFile(bundlePath);
    const out = evaluateIamReadinessBundle(raw, { expectedServiceAccountEmail: expectedSa });
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    if (!out.approvedForExecution) {
      process.exitCode = 1;
    }
  } catch (err) {
    const code = err && typeof err.code === "string" ? err.code : "IAM_READINESS_EVALUATION_ERROR";
    process.stderr.write(JSON.stringify({ evaluatorVersion: IAM_EVALUATOR_VERSION, approvedForExecution: false, errorCode: code }) + "\n");
    process.exitCode = 1;
  }
}
