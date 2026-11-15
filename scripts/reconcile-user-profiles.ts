/**
 * Idempotent profile reconciliation script (Localiza+ v1.10.13):
 * Scans /role_assignments where active == true && approvalStatus == "APROVADO"
 * and reconciles divergent /users/{uid} documents + Firebase Auth custom claims.
 * Never elevates Root Admin or accounts that are banned, suspended, temporally blocked, or active == false.
 *
 * Usage:
 *   npx tsx scripts/reconcile-user-profiles.ts --dry-run   # Inspect divergences without mutating Firestore/Auth
 *   npx tsx scripts/reconcile-user-profiles.ts             # Reconcile divergent /users/{uid} docs and custom claims
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  formatPrivateKey,
  getRootAdminEmail,
  getRootAdminUid,
  reconcileSingleUserProfile,
} from "../api/_lib/firebaseAdmin.js";

function loadAppletConfig(): { projectId?: string; firestoreDatabaseId?: string } {
  try {
    const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch {
    // Ignore missing/invalid local config
  }
  return {};
}

function initAdminClients(): { db: Firestore; auth: Auth } {
  const appletConfig = loadAppletConfig();
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    appletConfig.projectId ||
    "gen-lang-client-0490390966";

  if (getApps().length === 0) {
    const serviceAccountRaw =
      process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (serviceAccountRaw) {
      const parsed = JSON.parse(serviceAccountRaw);
      if (parsed.private_key) {
        parsed.private_key = formatPrivateKey(parsed.private_key);
      }
      initializeApp({
        credential: cert(parsed),
        projectId: parsed.project_id || projectId,
      });
    } else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY),
        }),
        projectId,
      });
    } else {
      throw new Error(
        "Firebase Admin credentials not configured. Set FIREBASE_SERVICE_ACCOUNT (or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY)."
      );
    }
  }

  const databaseId = process.env.FIRESTORE_DATABASE_ID || appletConfig.firestoreDatabaseId;
  const db = databaseId ? getFirestore(databaseId) : getFirestore();
  const auth = getAuth();
  return { db, auth };
}

export interface ReconcileProfilesSummary {
  dryRun: boolean;
  scanned: number;
  eligible: number;
  divergent: number;
  reconciled: number;
  alreadyConsistent: number;
  skippedBlocked: number;
  skippedRoot: number;
  skippedInvalid: number;
  claimsSynced: number;
  errors: Array<{ uid: string; error: string }>;
  details: Array<{
    uid: string;
    email?: string;
    assignedRole?: string;
    previousRole?: string;
    action: string;
  }>;
}

export async function reconcileUserProfiles(options: {
  dryRun: boolean;
  db?: Firestore;
  auth?: Auth | null;
}): Promise<ReconcileProfilesSummary> {
  const clients = options.db ? { db: options.db, auth: options.auth ?? null } : initAdminClients();
  const { db, auth } = clients;

  const summary: ReconcileProfilesSummary = {
    dryRun: options.dryRun,
    scanned: 0,
    eligible: 0,
    divergent: 0,
    reconciled: 0,
    alreadyConsistent: 0,
    skippedBlocked: 0,
    skippedRoot: 0,
    skippedInvalid: 0,
    claimsSynced: 0,
    errors: [],
    details: [],
  };

  const rootEmail = getRootAdminEmail().toLowerCase();
  const rootUid = getRootAdminUid();

  const snap = await db
    .collection("role_assignments")
    .where("active", "==", true)
    .where("approvalStatus", "==", "APROVADO")
    .get();

  for (const docSnap of snap.docs) {
    summary.scanned += 1;
    const data = docSnap.data() || {};
    const uid = String(docSnap.id || "").trim();
    const targetEmail = String(data.targetEmail || "").trim().toLowerCase();
    const assignedRole = String(data.assignedRole || "").trim().toUpperCase();

    if ((rootUid && uid === rootUid) || (rootEmail && targetEmail === rootEmail)) {
      summary.skippedRoot += 1;
      summary.details.push({ uid, email: targetEmail, assignedRole, action: "SKIPPED_ROOT" });
      continue;
    }

    if (
      data.active !== true ||
      data.approvalStatus !== "APROVADO" ||
      data.targetUserId !== uid ||
      (assignedRole !== "ADMIN" && assignedRole !== "SERVIDOR")
    ) {
      summary.skippedInvalid += 1;
      summary.details.push({ uid, email: targetEmail, assignedRole, action: "SKIPPED_INVALID" });
      continue;
    }

    summary.eligible += 1;

    try {
      let authEmailVerified = true;
      let authDisplayName: string | undefined = undefined;
      if (auth) {
        try {
          const userRecord = await auth.getUser(uid);
          authEmailVerified = userRecord.emailVerified === true;
          authDisplayName = userRecord.displayName || undefined;
        } catch {
          // Proceed with Firestore reconciliation even if Auth user lookup is unavailable
        }
      }

      const result = await reconcileSingleUserProfile({
        uid,
        email: targetEmail,
        displayName: authDisplayName,
        emailVerified: authEmailVerified,
        adminFirestore: db,
        adminAuth: auth,
        dryRun: options.dryRun,
      });

      if (result.reason === "ACCOUNT_BLOCKED_OR_INACTIVE") {
        summary.skippedBlocked += 1;
        summary.details.push({
          uid,
          email: targetEmail,
          assignedRole: result.assignedRole,
          previousRole: result.previousRole,
          action: "SKIPPED_BLOCKED",
        });
        console.log(`[SKIP_BLOCKED] ${uid} (${targetEmail || "sem email"}) — conta bloqueada/suspensa/banida/inativa.`);
        continue;
      }

      if (result.reason === "ROOT_ADMIN_SKIPPED") {
        summary.skippedRoot += 1;
        summary.details.push({ uid, email: targetEmail, assignedRole, action: "SKIPPED_ROOT" });
        continue;
      }

      if (result.alreadyConsistent) {
        summary.alreadyConsistent += 1;
        if (result.claimsSynced) summary.claimsSynced += 1;
        summary.details.push({
          uid,
          email: targetEmail,
          assignedRole: result.assignedRole,
          previousRole: result.previousRole,
          action: "ALREADY_CONSISTENT",
        });
        continue;
      }

      if (result.reconciled) {
        summary.divergent += 1;
        if (!options.dryRun) {
          summary.reconciled += 1;
          if (result.claimsSynced) summary.claimsSynced += 1;
          console.log(
            `[RECONCILED] ${uid} (${targetEmail || "sem email"}): ${result.previousRole} -> ${result.assignedRole} (APROVADO/active, claimsSynced=${result.claimsSynced})`
          );
          summary.details.push({
            uid,
            email: targetEmail,
            assignedRole: result.assignedRole,
            previousRole: result.previousRole,
            action: "RECONCILED",
          });
        } else {
          console.log(
            `[DRY-RUN] Divergência em users/${uid} (${targetEmail || "sem email"}): ${result.previousRole} -> ${result.assignedRole} (APROVADO/active)`
          );
          summary.details.push({
            uid,
            email: targetEmail,
            assignedRole: result.assignedRole,
            previousRole: result.previousRole,
            action: "WOULD_RECONCILE",
          });
        }
      }
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push({ uid, error: msg });
      console.error(`[RECONCILE_USER_ERROR] ${uid}:`, msg);
    }
  }

  return summary;
}

const isDirectExecution =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1]?.includes("reconcile-user-profiles");

if (isDirectExecution) {
  const dryRun = process.argv.includes("--dry-run");
  reconcileUserProfiles({ dryRun })
    .then((summary) => {
      console.log("[RECONCILE_SUMMARY]", JSON.stringify(summary, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("[RECONCILE_ERROR]", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
