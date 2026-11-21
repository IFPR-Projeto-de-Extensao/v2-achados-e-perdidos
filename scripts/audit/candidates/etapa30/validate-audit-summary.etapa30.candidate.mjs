#!/usr/bin/env node
/**
 * LOCALIZA+ v1.10.13 — Etapa 30 Consolidada (Copia Candidata)
 * Validador independente por allowlist estrita para o resumo agregado da auditoria read-only de `/users`.
 *
 * Melhorias consolidadas sobre `scripts/audit/candidates/etapa28/validate-audit-summary.candidate.mjs`:
 * - E30-S1: Deteccao recursiva de chaves JSON duplicadas na entrada bruta antes de `JSON.parse`.
 * - E30-S2: Validacao estrita de calendario ISO-8601 UTC com round-trip em `metadata.referenceTimeIso`.
 * - E30-S3: Limite matematico bidirecional de paginacao (`Math.ceil(totalRead / pageSize) <= pagesFetched <= Math.floor(totalRead / pageSize) + 1`).
 * - E30-S4: Gravacao atomica resistente a TOCTOU (`O_CREAT | O_EXCL | O_WRONLY | O_NOFOLLOW` em arquivo temporario no mesmo diretorio +
 *           `fchmodSync(0o600)` + `fstatSync` + `renameSync`), rejeitando diretorio pai symlink ou com permissoes frouxas (`(dirMode & 0o022) !== 0`).
 * - E30-S5: Leitura segura na CLI com rejeicao de symlinks em diretorios pais e rejeicao de argumentos CLI inesperados.
 */

import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fchmodSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertNoDuplicateJsonKeys, parseStrictIsoUtc } from "./verify-approval-record.etapa30.candidate.mjs";

export const VALIDATOR_VERSION = "validate-audit-summary-etapa30-candidate";
export const EXPECTED_IMPLEMENTATION_ORIGIN = "ETAPA_19_INDEPENDENT_IMPLEMENTATION";
export const EXPECTED_AUDITOR_VERSION = "etapa21-v1.1.0";
export const EXPECTED_PROJECT_ID = "gen-lang-client-0490390966";
export const EXPECTED_DATABASE_ID = "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1";
export const EXPECTED_COLLECTION_NAME = "users";
export const EXPECTED_RULES_COMMIT = "dab549f777c00981028eb5515f65d3a1d7058538";
export const EXPECTED_RULES_SHA256 = "2f2a2ffc8c471d7fe97b5d1d2bb3c2a3ca27d39947be64449ad13a532c851f9e";
export const EXPECTED_ROOT_MASKED_UID = "uid_d8665880b647";
export const EXPECTED_MODE = "READ_ONLY";

export const TOP_LEVEL_KEYS = Object.freeze([
  "metadata",
  "pagination",
  "verdict",
  "verdictCode",
  "counts",
  "unexpectedClassificationsCount",
  "inconclusiveReasons",
  "results",
]);

export const SUMMARY_TOP_LEVEL_KEYS = Object.freeze([
  "metadata",
  "pagination",
  "verdictCode",
  "verdict",
  "counts",
  "unexpectedClassificationsCount",
  "inconclusiveReasons",
]);

export const METADATA_KEYS = Object.freeze([
  "implementationOrigin",
  "auditorVersion",
  "projectId",
  "databaseId",
  "collectionName",
  "rulesCommit",
  "rulesSha256Expected",
  "rootAdminMaskedUid",
  "mode",
  "referenceTimeIso",
  "referenceTimeNs",
]);

export const REFERENCE_TIME_NS_KEYS = Object.freeze(["seconds", "nanoseconds"]);

export const PAGINATION_KEYS = Object.freeze([
  "pageSize",
  "pagesFetched",
  "totalRead",
  "completed",
  "duplicateDocIdsCount",
  "stagnantCursorDetected",
  "readError",
]);

export const CLASSIFICATION_KEYS = Object.freeze([
  "DOCUMENTO_COMPATIVEL",
  "BLOQUEIO_INTENCIONAL_COMPATIVEL",
  "INCONSISTENCIA_DE_DADOS",
  "PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE",
  "DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO",
]);

export const VERDICT_MAP = Object.freeze({
  A: "A_APTO_SEM_INCOMPATIBILIDADE_DETECTADA",
  B: "B_REQUER_REVISAO_OU_NORMALIZACAO_PREVIA",
  C: "C_NAO_APTO_HA_PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE",
  D: "D_AUDITORIA_INCONCLUSIVA_OU_INCOMPLETA",
});

const CLASSIFICATION_SET = new Set(CLASSIFICATION_KEYS);
const SHA256_RE = /^[a-f0-9]{64}$/;
const COMMIT_RE = /^[a-f0-9]{40}$/;
const MASKED_UID_RE = /^uid_[a-f0-9]{12}$/;

function makeError(code, message) {
  return Object.assign(new Error(message), { code });
}

function assertExactKeys(obj, allowedKeys, context) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw makeError("INVALID_OBJECT_TYPE", `Expected plain object at ${context}`);
  }
  const allowedSet = new Set(allowedKeys);
  for (const key of Object.keys(obj)) {
    if (!allowedSet.has(key)) {
      throw makeError("UNEXPECTED_KEY", `Unexpected key ${context}.${key}`);
    }
  }
  for (const key of allowedKeys) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      throw makeError("MISSING_REQUIRED_KEY", `Missing required key ${context}.${key}`);
    }
  }
}

export function assertShareableSummarySafe(summaryObj) {
  assertExactKeys(summaryObj, SUMMARY_TOP_LEVEL_KEYS, "summary");
  assertExactKeys(summaryObj.metadata, METADATA_KEYS, "summary.metadata");
  assertExactKeys(summaryObj.metadata.referenceTimeNs, REFERENCE_TIME_NS_KEYS, "summary.metadata.referenceTimeNs");
  assertExactKeys(summaryObj.pagination, PAGINATION_KEYS, "summary.pagination");
  assertExactKeys(summaryObj.counts, CLASSIFICATION_KEYS, "summary.counts");
  if (Object.prototype.hasOwnProperty.call(summaryObj, "results")) {
    throw makeError("INDIVIDUAL_RESULTS_FORBIDDEN_IN_SUMMARY", "Summary must never contain results");
  }
  return true;
}

export function validateAndExtractAuditSummary(rawReport, { stderrText = "" } = {}) {
  if (typeof stderrText !== "string") {
    throw makeError("INVALID_STDERR_INPUT", "stderrText must be a string");
  }
  if (stderrText.trim().length > 0) {
    throw makeError("NON_EMPTY_STDERR", "Non-empty stderr requires manual quarantine inspection");
  }

  let data = rawReport;
  if (typeof rawReport === "string") {
    assertNoDuplicateJsonKeys(rawReport, "DUPLICATE_REPORT_JSON_KEY");
    try {
      data = JSON.parse(rawReport);
    } catch {
      throw makeError("INVALID_JSON", "Raw audit report is not valid JSON");
    }
  }

  assertExactKeys(data, TOP_LEVEL_KEYS, "root");
  assertExactKeys(data.metadata, METADATA_KEYS, "metadata");
  assertExactKeys(data.metadata.referenceTimeNs, REFERENCE_TIME_NS_KEYS, "metadata.referenceTimeNs");
  assertExactKeys(data.pagination, PAGINATION_KEYS, "pagination");
  assertExactKeys(data.counts, CLASSIFICATION_KEYS, "counts");

  const m = data.metadata;
  if (m.implementationOrigin !== EXPECTED_IMPLEMENTATION_ORIGIN) {
    throw makeError("INVALID_IMPLEMENTATION_ORIGIN", "Unexpected auditor implementationOrigin");
  }
  if (m.auditorVersion !== EXPECTED_AUDITOR_VERSION) {
    throw makeError("INVALID_AUDITOR_VERSION", "Unexpected auditorVersion");
  }
  if (m.projectId !== EXPECTED_PROJECT_ID) {
    throw makeError("INVALID_PROJECT_ID", "Unexpected projectId");
  }
  if (m.databaseId !== EXPECTED_DATABASE_ID) {
    throw makeError("INVALID_DATABASE_ID", "Unexpected databaseId");
  }
  if (m.collectionName !== EXPECTED_COLLECTION_NAME) {
    throw makeError("INVALID_COLLECTION_NAME", "Unexpected collectionName");
  }
  if (typeof m.rulesCommit !== "string" || !COMMIT_RE.test(m.rulesCommit) || m.rulesCommit !== EXPECTED_RULES_COMMIT) {
    throw makeError("INVALID_RULES_COMMIT", "rulesCommit is invalid or does not match homologated commit");
  }
  if (typeof m.rulesSha256Expected !== "string" || !SHA256_RE.test(m.rulesSha256Expected) || m.rulesSha256Expected !== EXPECTED_RULES_SHA256) {
    throw makeError("INVALID_RULES_SHA256", "rulesSha256Expected is invalid or does not match homologated hash");
  }
  if (typeof m.rootAdminMaskedUid !== "string" || !MASKED_UID_RE.test(m.rootAdminMaskedUid) || m.rootAdminMaskedUid !== EXPECTED_ROOT_MASKED_UID) {
    throw makeError("INVALID_ROOT_MASKED_UID", "rootAdminMaskedUid mismatch");
  }
  if (m.mode !== EXPECTED_MODE) {
    throw makeError("INVALID_MODE", "Auditor mode must be READ_ONLY");
  }
  if (typeof m.referenceTimeIso !== "string" || !m.referenceTimeIso.includes(".")) {
    throw makeError("INVALID_REFERENCE_TIME_ISO", "referenceTimeIso must include milliseconds ISO-8601 UTC");
  }
  parseStrictIsoUtc(m.referenceTimeIso, "metadata.referenceTimeIso");

  const ns = m.referenceTimeNs;
  if (
    !Number.isInteger(ns.seconds) ||
    ns.seconds <= 0 ||
    !Number.isInteger(ns.nanoseconds) ||
    ns.nanoseconds < 0 ||
    ns.nanoseconds >= 1_000_000_000
  ) {
    throw makeError("INVALID_REFERENCE_TIME_NS", "referenceTimeNs out of valid bounds");
  }
  const expectedIso = new Date(ns.seconds * 1000 + Math.floor(ns.nanoseconds / 1_000_000)).toISOString();
  if (m.referenceTimeIso !== expectedIso) {
    throw makeError("REFERENCE_TIME_MISMATCH", "referenceTimeIso does not match referenceTimeNs");
  }

  const p = data.pagination;
  if (!Number.isInteger(p.pageSize) || p.pageSize < 1 || p.pageSize > 1000) {
    throw makeError("INVALID_PAGE_SIZE", "pagination.pageSize must be integer 1..1000");
  }
  if (!Number.isInteger(p.pagesFetched) || p.pagesFetched < 1) {
    throw makeError("INVALID_PAGES_FETCHED", "pagination.pagesFetched must be integer >= 1");
  }
  if (!Number.isInteger(p.totalRead) || p.totalRead < 0) {
    throw makeError("INVALID_TOTAL_READ", "pagination.totalRead must be integer >= 0");
  }
  if (p.totalRead > p.pagesFetched * p.pageSize) {
    throw makeError("PAGINATION_COUNT_EXCEEDS_CAPACITY", "pagination.totalRead exceeds pagesFetched * pageSize");
  }
  if (p.totalRead === 0 && p.pagesFetched !== 1) {
    throw makeError("INVALID_EMPTY_COLLECTION_PAGES", "Empty collection must have exactly pagesFetched === 1");
  }
  if (p.totalRead > 0) {
    const maxExpectedPages = Math.floor(p.totalRead / p.pageSize) + 1;
    if (p.pagesFetched > maxExpectedPages) {
      throw makeError("PAGINATION_EXCESSIVE_PAGES_FETCHED", "pagination.pagesFetched exceeds maximum possible cursor pages");
    }
  }
  if (p.completed !== true) {
    throw makeError("INCOMPLETE_PAGINATION", "pagination.completed must be true");
  }
  if (!Number.isInteger(p.duplicateDocIdsCount) || p.duplicateDocIdsCount !== 0) {
    throw makeError("DUPLICATE_DOC_IDS_DETECTED", "pagination.duplicateDocIdsCount must be 0");
  }
  if (p.stagnantCursorDetected !== false) {
    throw makeError("STAGNANT_CURSOR_DETECTED", "pagination.stagnantCursorDetected must be false");
  }
  if (p.readError !== null) {
    throw makeError("READ_ERROR_PRESENT", "pagination.readError must be null");
  }

  if (!Number.isInteger(data.unexpectedClassificationsCount) || data.unexpectedClassificationsCount !== 0) {
    throw makeError("UNEXPECTED_CLASSIFICATIONS_NON_ZERO", "unexpectedClassificationsCount must be 0");
  }
  if (!Array.isArray(data.inconclusiveReasons) || !data.inconclusiveReasons.every((r) => typeof r === "string")) {
    throw makeError("INVALID_INCONCLUSIVE_REASONS_TYPE", "inconclusiveReasons must be a string array");
  }

  const validatedCounts = {};
  let countsSum = 0;
  for (const key of CLASSIFICATION_KEYS) {
    const val = data.counts[key];
    if (!Number.isInteger(val) || val < 0) {
      throw makeError("INVALID_COUNT_VALUE", `counts.${key} must be a non-negative integer`);
    }
    validatedCounts[key] = val;
    countsSum += val;
  }
  if (countsSum !== p.totalRead) {
    throw makeError("COUNTS_SUM_MISMATCH", `Sum of counts (${countsSum}) does not match pagination.totalRead (${p.totalRead})`);
  }

  if (!Array.isArray(data.results)) {
    throw makeError("INVALID_RESULTS_TYPE", "results must be an array");
  }
  if (data.results.length !== p.totalRead) {
    throw makeError("RESULTS_LENGTH_MISMATCH", `results.length (${data.results.length}) does not match pagination.totalRead (${p.totalRead})`);
  }

  const recounted = Object.fromEntries(CLASSIFICATION_KEYS.map((k) => [k, 0]));
  const seenMaskedUids = new Set();
  for (let i = 0; i < data.results.length; i += 1) {
    const item = data.results[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw makeError("INVALID_RESULT_ITEM", `results[${i}] must be an object`);
    }
    if (typeof item.maskedUid !== "string" || !MASKED_UID_RE.test(item.maskedUid)) {
      throw makeError("INVALID_RESULT_MASKED_UID", `results[${i}].maskedUid has invalid format`);
    }
    if (seenMaskedUids.has(item.maskedUid)) {
      throw makeError("DUPLICATE_RESULT_ENTRY", `Duplicate maskedUid detected at results[${i}]`);
    }
    seenMaskedUids.add(item.maskedUid);
    if (typeof item.classification !== "string" || !CLASSIFICATION_SET.has(item.classification)) {
      throw makeError("UNKNOWN_CLASSIFICATION", `Unknown classification at results[${i}]`);
    }
    recounted[item.classification] += 1;
  }

  for (const key of CLASSIFICATION_KEYS) {
    if (recounted[key] !== validatedCounts[key]) {
      throw makeError("RECOUNT_MISMATCH", `Recounted ${key} (${recounted[key]}) differs from counts.${key} (${validatedCounts[key]})`);
    }
  }

  if (typeof data.verdictCode !== "string" || !Object.prototype.hasOwnProperty.call(VERDICT_MAP, data.verdictCode)) {
    throw makeError("INVALID_VERDICT_CODE", `Unknown verdictCode: ${String(data.verdictCode)}`);
  }
  if (data.verdict !== VERDICT_MAP[data.verdictCode]) {
    throw makeError("VERDICT_TEXT_MISMATCH", "verdict text does not match verdictCode");
  }

  if (p.totalRead === 0) {
    const isExactEmptyCollection =
      data.verdictCode === "D" &&
      data.inconclusiveReasons.length === 1 &&
      data.inconclusiveReasons[0] === "EMPTY_COLLECTION";
    if (!isExactEmptyCollection) {
      throw makeError(
        "INVALID_EMPTY_COLLECTION_VERDICT",
        "Zero-document report must carry verdictCode D and inconclusiveReasons ['EMPTY_COLLECTION']"
      );
    }
  } else {
    if (data.inconclusiveReasons.length !== 0) {
      throw makeError("INCONCLUSIVE_REASONS_NON_EMPTY", "Non-empty report cannot have inconclusiveReasons");
    }
    if (data.verdictCode === "D") {
      throw makeError("INCONCLUSIVE_VERDICT_REJECTED", "Inconclusive verdict D is rejected for non-empty report");
    }
    let expectedCode = "A";
    if (validatedCounts.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE > 0) {
      expectedCode = "C";
    } else if (
      validatedCounts.INCONSISTENCIA_DE_DADOS > 0 ||
      validatedCounts.DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO > 0
    ) {
      expectedCode = "B";
    }
    if (data.verdictCode !== expectedCode) {
      throw makeError("VERDICT_COUNTS_INCONSISTENCY", `Expected verdictCode ${expectedCode} for counts, received ${data.verdictCode}`);
    }
  }

  const validatedSummary = {
    metadata: {
      implementationOrigin: m.implementationOrigin,
      auditorVersion: m.auditorVersion,
      projectId: m.projectId,
      databaseId: m.databaseId,
      collectionName: m.collectionName,
      rulesCommit: m.rulesCommit,
      rulesSha256Expected: m.rulesSha256Expected,
      rootAdminMaskedUid: m.rootAdminMaskedUid,
      mode: m.mode,
      referenceTimeIso: m.referenceTimeIso,
      referenceTimeNs: {
        seconds: ns.seconds,
        nanoseconds: ns.nanoseconds,
      },
    },
    pagination: {
      pageSize: p.pageSize,
      pagesFetched: p.pagesFetched,
      totalRead: p.totalRead,
      completed: p.completed,
      duplicateDocIdsCount: p.duplicateDocIdsCount,
      stagnantCursorDetected: p.stagnantCursorDetected,
      readError: p.readError,
    },
    verdictCode: data.verdictCode,
    verdict: data.verdict,
    counts: { ...validatedCounts },
    unexpectedClassificationsCount: data.unexpectedClassificationsCount,
    inconclusiveReasons: [...data.inconclusiveReasons],
  };

  assertShareableSummarySafe(validatedSummary);
  return validatedSummary;
}

/**
 * Grava atomicamente o resumo compartilhavel com protecao contra TOCTOU, symlinks em diretorio pai,
 * diretorio pai com permissoes frouxas e verificacao estrita de modo 0600 antes e apos rename.
 */
export function writeRestrictedSummaryFile(outPath, summary, { requireStrictParentDirMode = false } = {}) {
  if (typeof outPath !== "string" || outPath.trim().length === 0) {
    throw makeError("SUMMARY_OUT_PATH_MISSING", "Output path is required");
  }
  if (!isAbsolute(outPath)) {
    throw makeError("OUTPUT_PATH_NOT_ABSOLUTE", "Output path must be absolute");
  }
  assertShareableSummarySafe(summary);

  const resolvedOut = resolve(outPath);
  const parentDir = dirname(resolvedOut);
  if (!existsSync(parentDir)) {
    throw makeError("OUTPUT_PARENT_DIR_MISSING", "Output parent directory does not exist");
  }
  const parentReal = realpathSync(parentDir);
  if (parentReal !== parentDir) {
    throw makeError("OUTPUT_PARENT_SYMLINK_FORBIDDEN", "Output parent directory must not traverse symlinks");
  }
  const parentStat = lstatSync(parentDir);
  if (!parentStat.isDirectory()) {
    throw makeError("OUTPUT_PARENT_NOT_DIRECTORY", "Output parent path is not a directory");
  }
  const dirMask = requireStrictParentDirMode ? 0o077 : 0o022;
  if ((parentStat.mode & dirMask) !== 0) {
    throw makeError("INSECURE_OUTPUT_PARENT_DIR_PERMISSIONS", "Output parent directory has overly permissive permissions");
  }

  if (existsSync(resolvedOut)) {
    const preStat = lstatSync(resolvedOut);
    if (preStat.isSymbolicLink()) {
      throw makeError("OUTPUT_PATH_IS_SYMLINK", "Output path must not be a symbolic link");
    }
    if (preStat.isDirectory()) {
      throw makeError("OUTPUT_PATH_IS_DIRECTORY", "Output path must not be a directory");
    }
    if ((preStat.mode & 0o077) !== 0) {
      throw makeError(
        "INSECURE_EXISTING_OUTPUT_PERMISSIONS",
        "Existing output file has overly permissive group/other permissions"
      );
    }
  }

  const serialized = JSON.stringify(summary, null, 2) + "\n";
  const tmpName = `.${basename(resolvedOut)}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  const tmpPath = join(parentDir, tmpName);
  const flags =
    fsConstants.O_CREAT |
    fsConstants.O_EXCL |
    fsConstants.O_WRONLY |
    (typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0);

  let fd = null;
  try {
    fd = openSync(tmpPath, flags, 0o600);
    writeSync(fd, serialized, null, "utf8");
    fchmodSync(fd, 0o600);
    const fdStat = fstatSync(fd);
    if ((fdStat.mode & 0o777) !== 0o600) {
      throw makeError("INSECURE_OUTPUT_FILE_PERMISSIONS", "Temporary output file failed 0600 mode check");
    }
    closeSync(fd);
    fd = null;
    renameSync(tmpPath, resolvedOut);
    chmodSync(resolvedOut, 0o600);
  } catch (err) {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        // Ignora erro ao fechar descritor ja falho
      }
    }
    if (existsSync(tmpPath)) {
      try {
        unlinkSync(tmpPath);
      } catch {
        // Ignora erro de limpeza do temporario
      }
    }
    if (err && typeof err.code === "string" && err.code.startsWith("INSECURE_")) {
      throw err;
    }
    const causeCode = err && typeof err.code === "string" ? err.code : "WRITE_FAILED";
    throw makeError("SUMMARY_WRITE_FAILED", `Failed to atomically write restricted summary file (${causeCode})`);
  }

  const postStat = lstatSync(resolvedOut);
  const actualMode = postStat.mode & 0o777;
  if (postStat.isSymbolicLink() || !postStat.isFile() || actualMode !== 0o600) {
    throw makeError("INSECURE_OUTPUT_FILE_PERMISSIONS", `Output file mode must be 0600, observed 0${actualMode.toString(8)}`);
  }

  return { mode: actualMode };
}

function readRegularInputFile(filePath, missingCode) {
  if (!filePath || !isAbsolute(filePath) || !existsSync(filePath)) {
    throw makeError(missingCode, `Required absolute input file missing (${missingCode})`);
  }
  const st = lstatSync(filePath);
  if (st.isSymbolicLink() || !st.isFile()) {
    throw makeError("SYMLINK_INPUT_FORBIDDEN", `Input file must be a regular non-symlink file (${missingCode})`);
  }
  const resolvedPath = resolve(filePath);
  if (realpathSync(filePath) !== resolvedPath) {
    throw makeError("PARENT_SYMLINK_INPUT_FORBIDDEN", `Input file contains a symlink in parent directory (${missingCode})`);
  }
  return readFileSync(filePath, "utf8");
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

function runCli() {
  if (process.argv.slice(2).length > 0) {
    throw makeError("UNEXPECTED_CLI_ARGUMENT", "Unexpected CLI arguments are rejected");
  }
  const rawPath = (process.env.AUDIT_RAW_QUARANTINE_FILE || "").trim();
  const stderrPath = (process.env.AUDIT_STDERR_QUARANTINE_FILE || "").trim();
  const outPath = (process.env.AUDIT_SUMMARY_OUT_FILE || "").trim();

  const rawText = readRegularInputFile(rawPath, "RAW_QUARANTINE_FILE_MISSING");
  const stderrText = readRegularInputFile(stderrPath, "STDERR_QUARANTINE_FILE_MISSING");
  if (!outPath) {
    throw makeError("SUMMARY_OUT_PATH_MISSING", "AUDIT_SUMMARY_OUT_FILE missing");
  }

  const summary = validateAndExtractAuditSummary(rawText, { stderrText });
  writeRestrictedSummaryFile(outPath, summary);

  process.stdout.write(
    JSON.stringify({
      validatorVersion: VALIDATOR_VERSION,
      status: "SUMMARY_VALIDATED_BY_ALLOWLIST",
      verdictCode: summary.verdictCode,
      totalRead: summary.pagination.totalRead,
    }) + "\n"
  );
}

if (isDirectExecution()) {
  try {
    runCli();
  } catch (err) {
    const code = err && typeof err.code === "string" ? err.code : "SUMMARY_VALIDATION_ERROR";
    process.stderr.write(JSON.stringify({ validatorVersion: VALIDATOR_VERSION, status: "REJECTED", errorCode: code }) + "\n");
    process.exitCode = 1;
  }
}
