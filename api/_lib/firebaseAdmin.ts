import path from "path";
import fs from "fs";
import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let cachedAppConfig: any = null;
function getLazyFirebaseAppConfig(): any {
  if (cachedAppConfig !== null) return cachedAppConfig;
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      cachedAppConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      return cachedAppConfig;
    }
  } catch {
    // Silent fallback in serverless environments where file may not exist or be bundled
  }
  cachedAppConfig = {};
  return cachedAppConfig;
}

export function formatPrivateKey(rawKey: string | undefined): string | undefined {
  if (!rawKey) return undefined;
  let formatted = rawKey.trim();
  // Strip surrounding quotes
  if (
    (formatted.startsWith('"') && formatted.endsWith('"')) ||
    (formatted.startsWith("'") && formatted.endsWith("'"))
  ) {
    formatted = formatted.slice(1, -1);
  }
  // Replace escaped newlines and carriage returns with actual characters
  formatted = formatted.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
  return formatted.trim();
}

export const FIREBASE_PROJECT_ID =
  (getLazyFirebaseAppConfig() as any)?.projectId ||
  process.env.FIREBASE_PROJECT_ID ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  "gen-lang-client-0490390966";

export const FIRESTORE_DATABASE_ID =
  (getLazyFirebaseAppConfig() as any)?.firestoreDatabaseId ||
  (process.env.FIRESTORE_DATABASE_ID && process.env.FIRESTORE_DATABASE_ID !== "default"
    ? process.env.FIRESTORE_DATABASE_ID
    : undefined) ||
  "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1";

let adminAppInstance: App | null = null;
let adminAuthInstance: Auth | null = null;
let adminFirestoreInstance: Firestore | null = null;
let adminCertInitError: string | null = null;

export function resolveFirebaseServiceAccountFromEnv(): {
  projectId?: string;
  clientEmail?: string;
  privateKey?: string;
  incompleteReason?: string;
} {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
  const privateKey = formatPrivateKey(rawPrivateKey);

  if (clientEmail && privateKey) {
    return {
      projectId: FIREBASE_PROJECT_ID,
      clientEmail,
      privateKey,
    };
  }

  if (Boolean(clientEmail) !== Boolean(privateKey)) {
    return {
      incompleteReason: clientEmail
        ? "FIREBASE_PRIVATE_KEY ausente quando FIREBASE_CLIENT_EMAIL foi definido."
        : "FIREBASE_CLIENT_EMAIL ausente quando FIREBASE_PRIVATE_KEY foi definido.",
    };
  }

  const serviceAccountRaw =
    process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountRaw && serviceAccountRaw.trim()) {
    try {
      const parsed = JSON.parse(serviceAccountRaw);
      const parsedPrivateKey = formatPrivateKey(parsed?.private_key);
      if (parsed?.client_email && parsedPrivateKey) {
        return {
          projectId: parsed.project_id || FIREBASE_PROJECT_ID,
          clientEmail: String(parsed.client_email).trim(),
          privateKey: parsedPrivateKey,
        };
      }
      return {
        incompleteReason: "FIREBASE_SERVICE_ACCOUNT JSON não contém client_email e private_key válidos.",
      };
    } catch (parseErr: any) {
      return {
        incompleteReason: `FIREBASE_SERVICE_ACCOUNT inválido (erro de JSON): ${parseErr?.message || parseErr}`,
      };
    }
  }

  return {};
}

export function getFirebaseAdminCredentialDiagnostics(): {
  hasExplicitServiceAccount: boolean;
  certInitError: string | null;
  isVercelWithoutCreds: boolean;
} {
  const resolved = resolveFirebaseServiceAccountFromEnv();
  const hasExplicitServiceAccount = Boolean(resolved.clientEmail && resolved.privateKey);
  const effectiveError = adminCertInitError || resolved.incompleteReason || null;
  const isVercelWithoutCreds = Boolean(process.env.VERCEL) && !hasExplicitServiceAccount;
  return {
    hasExplicitServiceAccount,
    certInitError: effectiveError,
    isVercelWithoutCreds,
  };
}

export function getFirebaseAdminApp(): App | null {
  if (adminAppInstance) return adminAppInstance;

  const existingApps = getApps();
  if (existingApps.length > 0) {
    adminAppInstance = existingApps[0];
    return adminAppInstance;
  }

  const resolvedSa = resolveFirebaseServiceAccountFromEnv();
  const cfg = getLazyFirebaseAppConfig();
  const projectId = resolvedSa.projectId || FIREBASE_PROJECT_ID || cfg?.projectId || "gen-lang-client-0490390966";

  if (resolvedSa.incompleteReason) {
    adminCertInitError = resolvedSa.incompleteReason;
    console.warn(`[Firebase Admin Warning] ${resolvedSa.incompleteReason}`);
  }

  try {
    if (resolvedSa.clientEmail && resolvedSa.privateKey) {
      try {
        adminAppInstance = initializeApp({
          credential: cert({
            projectId,
            clientEmail: resolvedSa.clientEmail,
            privateKey: resolvedSa.privateKey,
          }),
          projectId,
        });
        adminCertInitError = null;
        console.log(`[Firebase Admin] Inicializado com Service Account (${resolvedSa.clientEmail}) para projeto: ${projectId}`);
      } catch (certErr: any) {
        adminCertInitError = certErr?.message || String(certErr);
        console.warn(`[Firebase Admin Warning] Falha na credencial da Service Account:`, adminCertInitError);
        adminAppInstance = initializeApp({
          projectId,
        });
        console.log(`[Firebase Admin] Inicializado com Project ID (${projectId}) em modo padrão após falha de certificado.`);
      }
    } else {
      adminAppInstance = initializeApp({
        projectId,
      });
      console.log(`[Firebase Admin] Inicializado com Project ID (${projectId}) em modo padrão.`);
    }
  } catch (err: any) {
    console.warn(`[Firebase Admin Notice] Inicialização em modo resiliente:`, err?.message || err);
    if (getApps().length > 0) {
      adminAppInstance = getApps()[0];
    }
  }

  return adminAppInstance;
}

export function getAdminAuth(): Auth | null {
  if (!adminAuthInstance) {
    const adminApp = getFirebaseAdminApp();
    if (adminApp) {
      try {
        adminAuthInstance = getAuth(adminApp);
      } catch (err: any) {
        console.warn("[Firebase Admin Auth Warning] Não foi possível carregar Auth Admin:", err?.message || err);
      }
    }
  }
  return adminAuthInstance;
}

export function getAdminFirestore(): Firestore | null {
  if (!adminFirestoreInstance) {
    const adminApp = getFirebaseAdminApp();
    if (adminApp) {
      try {
        adminFirestoreInstance = getFirestore(adminApp, FIRESTORE_DATABASE_ID);
      } catch {
        try {
          adminFirestoreInstance = getFirestore(adminApp);
        } catch (e2: any) {
          console.warn("[Firebase Admin Firestore Warning] Não foi possível carregar Firestore Admin:", e2?.message || e2);
        }
      }
    }
  }
  return adminFirestoreInstance;
}

export const DEFAULT_ROOT_ADMIN_EMAIL = "paulocauan39@gmail.com";

function stripQuotes(val: string): string {
  let trimmed = val.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function getRootAdminEmail(): string {
  const raw = process.env.ROOT_ADMIN_EMAIL;
  if (raw === undefined) {
    return DEFAULT_ROOT_ADMIN_EMAIL;
  }
  return stripQuotes(raw);
}

export function getRootAdminUid(): string {
  return stripQuotes(process.env.ROOT_ADMIN_UID || "");
}

function parseExpiryMs(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) {
    const ms = val.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof val === "number" && Number.isFinite(val)) {
    return Math.abs(val) < 1e11 ? val * 1000 : val;
  }
  if (val && typeof val.toMillis === "function") {
    const ms = val.toMillis();
    return typeof ms === "number" && Number.isFinite(ms) ? ms : null;
  }
  if (val && typeof val.toDate === "function") {
    const d = val.toDate();
    if (d instanceof Date) {
      const ms = d.getTime();
      return Number.isNaN(ms) ? null : ms;
    }
  }
  if (val && typeof val === "object") {
    const sec =
      typeof val.seconds === "number"
        ? val.seconds
        : typeof val._seconds === "number"
        ? val._seconds
        : null;
    if (sec !== null && Number.isFinite(sec)) {
      const nano =
        typeof val.nanoseconds === "number"
          ? val.nanoseconds
          : typeof val._nanoseconds === "number"
          ? val._nanoseconds
          : 0;
      return sec * 1000 + Math.floor(nano / 1e6);
    }
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return null;
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function extractFirestoreTimestampMsFromVal(val: unknown): number | null {
  if (!val || typeof val !== "object" || Array.isArray(val) || val instanceof Date) {
    return null;
  }
  const candidate = val as Record<string, any>;
  try {
    if (typeof candidate.toMillis === "function") {
      const ms = candidate.toMillis();
      return typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? ms : null;
    }
    if (typeof candidate.toDate === "function") {
      const d = candidate.toDate();
      if (d instanceof Date) {
        const ms = d.getTime();
        return Number.isFinite(ms) && ms > 0 ? ms : null;
      }
      return null;
    }
    const sec =
      typeof candidate.seconds === "number" && Number.isFinite(candidate.seconds)
        ? candidate.seconds
        : typeof candidate._seconds === "number" && Number.isFinite(candidate._seconds)
        ? candidate._seconds
        : null;
    if (sec !== null) {
      const rawNanos =
        typeof candidate.seconds === "number" ? candidate.nanoseconds : candidate._nanoseconds;
      if (rawNanos !== undefined && (typeof rawNanos !== "number" || !Number.isFinite(rawNanos))) {
        return null;
      }
      const nanos = rawNanos ?? 0;
      const ms = sec * 1000 + Math.floor(nanos / 1_000_000);
      return Number.isFinite(ms) && ms > 0 ? ms : null;
    }
  } catch {
    return null;
  }
  return null;
}

function evaluateFirestoreStandingDeadline(
  udata: Record<string, any>,
  fieldKey: "blockExpiresAt" | "suspendedUntil",
  nowMs: number
): { isPresent: boolean; isValid: boolean; isInvalid: boolean; isActive: boolean; isExpired: boolean } {
  if (!Object.prototype.hasOwnProperty.call(udata, fieldKey) || udata[fieldKey] === undefined) {
    return { isPresent: false, isValid: false, isInvalid: false, isActive: false, isExpired: false };
  }
  const ms = extractFirestoreTimestampMsFromVal(udata[fieldKey]);
  if (ms === null) {
    return { isPresent: true, isValid: false, isInvalid: true, isActive: false, isExpired: false };
  }
  return {
    isPresent: true,
    isValid: true,
    isInvalid: false,
    isActive: ms > nowMs,
    isExpired: ms <= nowMs,
  };
}

export function isUserBlockedOrInactive(udata: Record<string, any> | null | undefined): boolean {
  if (!udata || typeof udata !== "object") return false;
  if (udata.active === false) return true;

  const hasStatusKey = Object.prototype.hasOwnProperty.call(udata, "status") && udata.status !== undefined;
  if (hasStatusKey && udata.status !== "active" && udata.status !== "suspended") {
    return true;
  }
  const effectiveStatus = hasStatusKey ? (udata.status as string) : "active";

  const nowMs = Date.now();
  const blockEval = evaluateFirestoreStandingDeadline(udata, "blockExpiresAt", nowMs);
  const suspendedEval = evaluateFirestoreStandingDeadline(udata, "suspendedUntil", nowMs);

  if (blockEval.isInvalid || suspendedEval.isInvalid) return true;
  if (blockEval.isActive || suspendedEval.isActive) return true;

  if (effectiveStatus === "suspended") {
    // Paridade com `statusVal == 'suspended' && hasS`: apenas suspendedUntil expirado válido desbloqueia
    return !(suspendedEval.isValid && suspendedEval.isExpired);
  }
  return false;
}

export function hasUserBanSuspensionOrBlock(udata: Record<string, any> | null | undefined): boolean {
  if (!udata || typeof udata !== "object") return false;
  if (udata.active === false) return true;
  const hasStatusKey = Object.prototype.hasOwnProperty.call(udata, "status") && udata.status !== undefined;
  if (hasStatusKey && udata.status !== "active") {
    return true;
  }
  return isUserBlockedOrInactive(udata);
}

export function buildApprovedUserStatusFields(
  existingUserData: Record<string, any> | null | undefined,
  approvalStatus: string,
  active: boolean
): Record<string, any> {
  if (approvalStatus !== "APROVADO" || !active) {
    return {};
  }
  if (hasUserBanSuspensionOrBlock(existingUserData)) {
    return {};
  }
  return {
    status: "active",
    active: true,
  };
}

export interface ReconcileUserProfileResult {
  uid: string;
  reconciled: boolean;
  alreadyConsistent?: boolean;
  reason?: string;
  assignedRole?: string;
  previousRole?: string;
  claimsSynced?: boolean;
}

export async function reconcileSingleUserProfile(options: {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  emailVerified?: boolean;
  adminFirestore: Firestore;
  adminAuth?: Auth | null;
  dryRun?: boolean;
}): Promise<ReconcileUserProfileResult> {
  const { uid, email, displayName, emailVerified, adminFirestore, adminAuth, dryRun = false } = options;
  const cleanUid = String(uid || "").trim();
  if (!cleanUid) {
    return { uid: "", reconciled: false, reason: "INVALID_UID" };
  }

  const configuredRootEmail = getRootAdminEmail().toLowerCase();
  const configuredRootUid = getRootAdminUid();
  const cleanCallerEmail = (email || "").trim().toLowerCase();
  if (
    (configuredRootUid && cleanUid === configuredRootUid) ||
    (configuredRootEmail && cleanCallerEmail === configuredRootEmail)
  ) {
    return { uid: cleanUid, reconciled: false, reason: "ROOT_ADMIN_SKIPPED" };
  }

  if (emailVerified === false) {
    return { uid: cleanUid, reconciled: false, reason: "EMAIL_NOT_VERIFIED" };
  }

  const assignRef = adminFirestore.collection("role_assignments").doc(cleanUid);
  const userRef = adminFirestore.collection("users").doc(cleanUid);

  const txOutcome = await adminFirestore.runTransaction(async (transaction) => {
    const assignDoc = await transaction.get(assignRef);
    const userDoc = await transaction.get(userRef);

    if (!assignDoc.exists) {
      return { reconciled: false, reason: "ASSIGNMENT_NOT_FOUND" } as ReconcileUserProfileResult;
    }

    const aData: any = assignDoc.data() || {};
    const assignedRole = String(aData.assignedRole || "").trim().toUpperCase();
    const targetEmail = (aData.targetEmail || email || "").trim().toLowerCase();

    if (configuredRootEmail && targetEmail && targetEmail === configuredRootEmail) {
      return { reconciled: false, reason: "ROOT_ADMIN_SKIPPED" } as ReconcileUserProfileResult;
    }

    if (
      aData.active !== true ||
      aData.approvalStatus !== "APROVADO" ||
      aData.targetUserId !== cleanUid ||
      (assignedRole !== "ADMIN" && assignedRole !== "SERVIDOR" && assignedRole !== "ALUNO")
    ) {
      return {
        reconciled: false,
        reason: "NO_ACTIVE_APPROVED_ASSIGNMENT",
      } as ReconcileUserProfileResult;
    }

    const uData: any = userDoc.exists ? userDoc.data() || {} : null;

    if (uData && hasUserBanSuspensionOrBlock(uData)) {
      return {
        reconciled: false,
        reason: "ACCOUNT_BLOCKED_OR_INACTIVE",
        assignedRole,
        previousRole: uData.role,
      } as ReconcileUserProfileResult;
    }

    const expectedAdminFlag = assignedRole === "ADMIN";
    const hasAdminFlagMismatch =
      expectedAdminFlag ? uData?.admin === false : uData?.admin === true;

    const isAlreadyConsistent = Boolean(
      userDoc.exists &&
      uData?.role === assignedRole &&
      uData?.approvalStatus === "APROVADO" &&
      uData?.status === "active" &&
      uData?.active === true &&
      uData?.roleAssignmentActive === true &&
      !hasAdminFlagMismatch
    );

    if (isAlreadyConsistent) {
      return {
        reconciled: false,
        alreadyConsistent: true,
        reason: "ALREADY_CONSISTENT",
        assignedRole,
        previousRole: uData.role,
      } as ReconcileUserProfileResult;
    }

    if (dryRun) {
      return {
        reconciled: true,
        reason: "DRY_RUN_WOULD_RECONCILE",
        assignedRole,
        previousRole: uData?.role || "MISSING_DOC",
      } as ReconcileUserProfileResult;
    }

    const nowIso = new Date().toISOString();
    const patch: Record<string, any> = {
      id: cleanUid,
      role: assignedRole,
      approvalStatus: "APROVADO",
      status: "active",
      active: true,
      admin: expectedAdminFlag,
      roleAssignedBy: aData.assignedByEmail || aData.assignedByUid || uData?.roleAssignedBy || "system-reconcile",
      roleAssignedAt: aData.assignedAt || uData?.roleAssignedAt || nowIso,
      roleAssignmentActive: true,
      updatedAt: nowIso,
    };

    if (!userDoc.exists) {
      patch.email = targetEmail;
      patch.name = displayName || (targetEmail ? targetEmail.split("@")[0] : "Usuário IFPR");
      patch.emailVerified = Boolean(emailVerified);
      patch.createdAt = nowIso;
    } else if (emailVerified && uData?.emailVerified !== true) {
      patch.emailVerified = true;
    }

    transaction.set(userRef, patch, { merge: true });

    const auditLogId = `audit-reconcile-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const auditRef = adminFirestore.collection("audit_logs").doc(auditLogId);
    transaction.set(auditRef, {
      id: auditLogId,
      transactionId: `TX-RECONCILE-${Date.now().toString(36).toUpperCase()}`,
      objectId: cleanUid,
      objectType: "ROLE_ASSIGNMENT",
      objectTitle: targetEmail || cleanUid,
      action: "PROFILE_RECONCILED",
      actorId: cleanUid,
      actorName: displayName || targetEmail || cleanUid,
      actorEmail: targetEmail,
      actorRole: assignedRole,
      timestamp: nowIso,
      fieldChanged: "role",
      oldValue: uData?.role || "MISSING_DOC",
      newValue: assignedRole,
      details: `Perfil users/${cleanUid} reconciliado a partir de role_assignments/${cleanUid} (${uData?.role || "MISSING"}/${uData?.approvalStatus || "NONE"}/${uData?.status || "NONE"} -> ${assignedRole}/APROVADO/active).`,
      immutable: true,
    });

    return {
      uid: cleanUid,
      reconciled: true,
      assignedRole,
      previousRole: uData?.role || "MISSING_DOC",
    } as ReconcileUserProfileResult;
  });

  if (dryRun || (!txOutcome.reconciled && !txOutcome.alreadyConsistent)) {
    return { ...txOutcome, uid: cleanUid };
  }

  let claimsSynced = false;
  if (adminAuth && txOutcome.assignedRole && (txOutcome.reconciled || txOutcome.alreadyConsistent)) {
    try {
      const userRecord = await adminAuth.getUser(cleanUid).catch(() => null);
      const currentClaims = (userRecord?.customClaims || {}) as Record<string, any>;
      const expectedAdmin = txOutcome.assignedRole === "ADMIN";
      const claimsMismatch =
        currentClaims.role !== txOutcome.assignedRole ||
        currentClaims.approvalStatus !== "APROVADO" ||
        currentClaims.admin !== expectedAdmin;
      if (txOutcome.reconciled || claimsMismatch) {
        await adminAuth.setCustomUserClaims(cleanUid, {
          ...currentClaims,
          role: txOutcome.assignedRole,
          approvalStatus: "APROVADO",
          admin: expectedAdmin,
        });
      }
      claimsSynced = true;
    } catch (claimErr: any) {
      console.warn(`[Profile Reconcile Warning] Falha ao sincronizar claims para ${cleanUid}:`, claimErr?.message || claimErr);
    }
  }

  return {
    ...txOutcome,
    uid: cleanUid,
    claimsSynced,
  };
}

export async function verifyServerlessCallerAccess(
  adminDb: Firestore | null,
  decoded: { uid?: string; email?: string | null; email_verified?: boolean } | null | undefined
): Promise<{
  isAdmin: boolean;
  isRoot: boolean;
  isBlocked: boolean;
  role: string;
}> {
  if (!decoded?.uid) {
    return { isAdmin: false, isRoot: false, isBlocked: false, role: "ALUNO" };
  }
  const configuredRootEmail = getRootAdminEmail().toLowerCase();
  const configuredRootUid = getRootAdminUid();
  const userEmail = (decoded.email || "").trim().toLowerCase();
  const isEmailVerified = decoded.email_verified === true;
  const isRoot =
    Boolean(configuredRootEmail) &&
    Boolean(configuredRootUid) &&
    userEmail === configuredRootEmail &&
    isEmailVerified &&
    decoded.uid === configuredRootUid;

  let isAdmin = false;
  let isBlocked = false;
  let dbRole: string | undefined = undefined;
  let approvalStatus: string | undefined = undefined;

  if (adminDb) {
    try {
      const uDoc = await adminDb.collection("users").doc(decoded.uid).get();
      const uData: any = uDoc.exists ? uDoc.data() || {} : {};
      isBlocked = isUserBlockedOrInactive(uData);
      dbRole = uData?.role;
      approvalStatus = uData?.approvalStatus;

      let hasAdminAssignment = false;
      try {
        const assignDoc = await adminDb.collection("role_assignments").doc(decoded.uid).get();
        if (assignDoc.exists) {
          const aData: any = assignDoc.data();
          if (
            aData?.targetUserId === decoded.uid &&
            aData?.active === true &&
            aData?.assignedRole === "ADMIN" &&
            aData?.approvalStatus === "APROVADO"
          ) {
            hasAdminAssignment = true;
          }
        }
      } catch {
        hasAdminAssignment = false;
      }

      if (isBlocked) {
        isAdmin = false;
      } else if (isRoot) {
        isAdmin = true;
        dbRole = "ADMIN";
      } else if (isEmailVerified && hasAdminAssignment) {
        isAdmin = true;
        dbRole = "ADMIN";
      }
    } catch {
      if (isRoot) {
        isAdmin = true;
        dbRole = "ADMIN";
      }
    }
  } else if (isRoot) {
    isAdmin = true;
    dbRole = "ADMIN";
  }

  const safeNonAdminRole =
    isBlocked
      ? "INTRUSO"
      : dbRole && dbRole !== "ADMIN" && (dbRole !== "SERVIDOR" || approvalStatus === "APROVADO")
      ? dbRole
      : "ALUNO";

  return {
    isAdmin,
    isRoot,
    isBlocked,
    role: isAdmin ? "ADMIN" : safeNonAdminRole,
  };
}


