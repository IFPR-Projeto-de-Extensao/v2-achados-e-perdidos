/**
 * Non-destructive migration script for Item 13 (Localiza+ v1.10.13):
 * Moves `secretVerificationHint` and `secretVerificationKey` out of public item collections
 * (/items, /found_items, /lost_items) into the restricted collection (/item_private/{itemId}).
 *
 * Usage:
 *   npx tsx scripts/migrate-secret-hints.ts --dry-run   # Inspect without mutating Firestore
 *   npx tsx scripts/migrate-secret-hints.ts             # Copy to /item_private and delete source fields
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const SOURCE_COLLECTIONS = ["items", "found_items", "lost_items"] as const;
const TARGET_COLLECTION = "item_private";

function formatPrivateKey(rawKey: string | undefined): string | undefined {
  if (!rawKey) return undefined;
  let formatted = rawKey.trim();
  if (
    (formatted.startsWith('"') && formatted.endsWith('"')) ||
    (formatted.startsWith("'") && formatted.endsWith("'"))
  ) {
    formatted = formatted.slice(1, -1);
  }
  return formatted.replace(/\\n/g, "\n").replace(/\\r/g, "\r").trim();
}

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

function initAdminFirestore() {
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
  return databaseId ? getFirestore(databaseId) : getFirestore();
}

export interface MigrationSummary {
  dryRun: boolean;
  scanned: number;
  matched: number;
  migrated: number;
  byCollection: Record<string, { scanned: number; matched: number; migrated: number }>;
}

export async function migrateSecretHints(options: {
  dryRun: boolean;
  db?: ReturnType<typeof getFirestore>;
}): Promise<MigrationSummary> {
  const db = options.db || initAdminFirestore();
  const summary: MigrationSummary = {
    dryRun: options.dryRun,
    scanned: 0,
    matched: 0,
    migrated: 0,
    byCollection: {},
  };

  for (const colName of SOURCE_COLLECTIONS) {
    const colStats = { scanned: 0, matched: 0, migrated: 0 };
    summary.byCollection[colName] = colStats;

    const snap = await db.collection(colName).get();
    for (const docSnap of snap.docs) {
      colStats.scanned += 1;
      summary.scanned += 1;

      const data = docSnap.data() || {};
      const hasHint = Object.prototype.hasOwnProperty.call(data, "secretVerificationHint") && data.secretVerificationHint !== undefined;
      const hasKey = Object.prototype.hasOwnProperty.call(data, "secretVerificationKey") && data.secretVerificationKey !== undefined;

      if (!hasHint && !hasKey) {
        continue;
      }

      colStats.matched += 1;
      summary.matched += 1;

      const itemId = String(data.id || docSnap.id);
      const privatePayload: Record<string, any> = {
        itemId,
        migratedFromCollection: colName,
        migratedAt: new Date().toISOString(),
      };
      if (typeof data.registeredByUserId === "string" && data.registeredByUserId) {
        privatePayload.registeredByUserId = data.registeredByUserId;
      }
      if (hasHint) {
        privatePayload.secretVerificationHint = data.secretVerificationHint;
      }
      if (hasKey) {
        privatePayload.secretVerificationKey = data.secretVerificationKey;
      }

      if (options.dryRun) {
        console.log(
          `[DRY-RUN] Would migrate ${colName}/${docSnap.id} -> ${TARGET_COLLECTION}/${itemId} (hint=${hasHint}, key=${hasKey})`
        );
        continue;
      }

      const targetRef = db.collection(TARGET_COLLECTION).doc(itemId);
      const sourceRef = db.collection(colName).doc(docSnap.id);

      await db.runTransaction(async (tx) => {
        tx.set(targetRef, privatePayload, { merge: true });
        const sourceRemoval: Record<string, any> = {};
        if (hasHint) sourceRemoval.secretVerificationHint = FieldValue.delete();
        if (hasKey) sourceRemoval.secretVerificationKey = FieldValue.delete();
        tx.update(sourceRef, sourceRemoval);
      });

      colStats.migrated += 1;
      summary.migrated += 1;
      console.log(
        `[MIGRATED] ${colName}/${docSnap.id} -> ${TARGET_COLLECTION}/${itemId} (hint=${hasHint}, key=${hasKey})`
      );
    }
  }

  return summary;
}

const isDirectExecution =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1]?.includes("migrate-secret-hints");

if (isDirectExecution) {
  const dryRun = process.argv.includes("--dry-run");
  migrateSecretHints({ dryRun })
    .then((summary) => {
      console.log("[MIGRATION_SUMMARY]", JSON.stringify(summary, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("[MIGRATION_ERROR]", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
