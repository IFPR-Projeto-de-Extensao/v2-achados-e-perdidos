/**
 * LOCALIZA+ — Isolated Preload for Candidate Firestore Rules Homologation
 *
 * Purpose:
 *   Allows existing security and Firestore Emulator test suites (which read
 *   `firestore.rules` via `fs.readFileSync` or `node:fs` named `readFileSync`)
 *   to load `firestore.refactor.candidate.rules` WITHOUT modifying or replacing
 *   the active `firestore.rules` file or any test file.
 *
 * Security & Evidence Guarantees:
 *   - Fails closed if the candidate file does not exist or resolves to `firestore.rules`.
 *   - Uses `module.syncBuiltinESMExports()` so both CommonJS (`fs.readFileSync`)
 *     and ESM named imports (`import { readFileSync } from "node:fs"`) receive
 *     the candidate ruleset and pass it directly to `initializeTestEnvironment(...)`
 *     in the real Cloud Firestore Emulator.
 *   - Computes SHA-256 and logs `[CANDIDATE_RULES_LOADED]` evidence (plus optional
 *     JSONL file via `CANDIDATE_RULES_EVIDENCE_LOG`).
 */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const moduleApi = require("node:module");

const cwd = process.cwd();
const activeRulesPath = path.resolve(cwd, "firestore.rules");
const candidateRelative =
  process.env.FIRESTORE_CANDIDATE_RULES_FILE || "firestore.refactor.candidate.rules";
const candidateRulesPath = path.resolve(cwd, candidateRelative);
const evidenceLogPath = process.env.CANDIDATE_RULES_EVIDENCE_LOG
  ? path.resolve(cwd, process.env.CANDIDATE_RULES_EVIDENCE_LOG)
  : null;

if (candidateRulesPath === activeRulesPath) {
  throw new Error(
    `[CANDIDATE_RULES_PRELOAD_ERROR] Candidate path resolves to active firestore.rules (${activeRulesPath}). Aborting fail-closed.`
  );
}

const origReadFileSync = fs.readFileSync.bind(fs);
const origAppendFileSync = fs.appendFileSync.bind(fs);

if (!fs.existsSync(candidateRulesPath)) {
  throw new Error(
    `[CANDIDATE_RULES_PRELOAD_ERROR] Candidate rules file not found: ${candidateRulesPath}`
  );
}

const candidateBuffer = origReadFileSync(candidateRulesPath);
const candidateSha256 = crypto
  .createHash("sha256")
  .update(candidateBuffer)
  .digest("hex");
const candidateBytes = candidateBuffer.byteLength;

let interceptionCount = 0;

function extractCallerHint() {
  const stack = new Error().stack || "";
  const lines = stack
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line && !line.includes("candidate-rules-preload.cjs"));
  for (const line of lines) {
    if (line.includes(".test.") || line.includes("__tests__")) {
      return line;
    }
  }
  return lines[0] || "unknown";
}

function patchedReadFileSync(filePath, ...args) {
  if (typeof filePath === "string") {
    const resolved = path.resolve(filePath);
    if (resolved === activeRulesPath) {
      interceptionCount += 1;
      const caller = extractCallerHint();
      const record = {
        timestamp: new Date().toISOString(),
        pid: process.pid,
        hit: interceptionCount,
        requestedFile: "firestore.rules",
        loadedFile: path.relative(cwd, candidateRulesPath),
        bytes: candidateBytes,
        sha256: candidateSha256,
        caller,
      };
      process.stderr.write(
        `[CANDIDATE_RULES_LOADED] file=${record.loadedFile} bytes=${record.bytes} sha256=${record.sha256} hit=${record.hit} caller="${record.caller}"\n`
      );
      if (evidenceLogPath) {
        try {
          origAppendFileSync(evidenceLogPath, `${JSON.stringify(record)}\n`, "utf8");
        } catch {
          // Never mask rules loading if log append has transient contention
        }
      }
      return origReadFileSync(candidateRulesPath, ...args);
    }
  }
  return origReadFileSync(filePath, ...args);
}

fs.readFileSync = patchedReadFileSync;
if (typeof moduleApi.syncBuiltinESMExports === "function") {
  moduleApi.syncBuiltinESMExports();
}
