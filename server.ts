import express, { type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import nodemailer, { type Transporter } from "nodemailer";
import { GoogleGenAI, Type } from "@google/genai";
import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, FieldValue, type Firestore } from "firebase-admin/firestore";

// Safe loading of firebase config to prevent Node 22 ESM import assertion errors
let firebaseAppConfig: any = {};
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    firebaseAppConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  }
} catch (configErr) {
  console.warn("[Firebase Config Notice] Não foi possível ler firebase-applet-config.json:", configErr);
}

dotenv.config();

// Global process exception guards to prevent Serverless Function crashes
process.on("unhandledRejection", (reason) => {
  console.error("[Server Process unhandledRejection]:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[Server Process uncaughtException]:", err);
});

const app = express();
const portArgIndex = process.argv.indexOf("--port");
const cliPort = portArgIndex !== -1 && process.argv[portArgIndex + 1] ? Number(process.argv[portArgIndex + 1]) : NaN;
const PORT = (!isNaN(cliPort) && cliPort > 0) ? cliPort : (Number(process.env.PORT) || 3000);
export const ROOT_ADMIN_EMAIL = "paulocauan39@gmail.com";

/**
 * Safely retrieves the pinned Root Admin UID from the runtime environment.
 * Trims whitespace and strips surrounding double or single quotes.
 * Returns an empty string if not configured (strictly enforcing fail-closed security).
 */
export function getRootAdminUid(): string {
  const raw = process.env.ROOT_ADMIN_UID || "";
  let trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export interface RootAdminEvaluationResult {
  isRoot: boolean;
  rejectionReason?:
    | "ROOT_ADMIN_UID_NOT_CONFIGURED"
    | "EMAIL_NOT_ROOT_ADMIN"
    | "EMAIL_NOT_VERIFIED"
    | "UID_NOT_MATCHING_PINNED_ROOT";
}

/**
 * Evaluates whether an authenticated user qualifies as the Root Admin.
 * Strictly requires:
 * 1. Root Admin candidate email (case-insensitive comparison with paulocauan39@gmail.com)
 * 2. ROOT_ADMIN_UID configured in the server environment (fail-closed if missing)
 * 3. Cryptographically verified email (email_verified === true)
 * 4. Exact UID match against configured ROOT_ADMIN_UID
 */
export function evaluateRootAdminAuth(user: {
  uid?: string | null;
  email?: string | null;
  email_verified?: boolean;
}): RootAdminEvaluationResult {
  const configuredRootUid = getRootAdminUid();
  const userEmail = (user?.email || "").trim().toLowerCase();
  const rootEmail = ROOT_ADMIN_EMAIL.toLowerCase();

  if (userEmail !== rootEmail) {
    return { isRoot: false, rejectionReason: "EMAIL_NOT_ROOT_ADMIN" };
  }

  if (!configuredRootUid) {
    return { isRoot: false, rejectionReason: "ROOT_ADMIN_UID_NOT_CONFIGURED" };
  }

  if (user?.email_verified !== true) {
    return { isRoot: false, rejectionReason: "EMAIL_NOT_VERIFIED" };
  }

  if (!user?.uid || user.uid !== configuredRootUid) {
    return { isRoot: false, rejectionReason: "UID_NOT_MATCHING_PINNED_ROOT" };
  }

  return { isRoot: true };
}

const initialRootAdminUid = getRootAdminUid();
if (!initialRootAdminUid) {
  console.warn(
    "[Security Warning] ROOT_ADMIN_UID environment variable is not configured. " +
    "Root Admin authorization (paulocauan39@gmail.com) will be strictly disabled (fail-closed). " +
    "To enable Root Admin operations, set ROOT_ADMIN_UID in the hosting environment (e.g., Cloud Secrets, Vercel, or server .env)."
  );
} else {
  console.log(`[Security Config] ROOT_ADMIN_UID configured (pinned length: ${initialRootAdminUid.length}). Root Admin authorization active.`);
}

// =================================================================
// Firebase Admin Singleton & Credential Management
// =================================================================

function formatPrivateKey(rawKey: string | undefined): string | undefined {
  if (!rawKey) return undefined;
  let formatted = rawKey.trim();
  // Strip surrounding single or double quotes
  if (
    (formatted.startsWith('"') && formatted.endsWith('"')) ||
    (formatted.startsWith("'") && formatted.endsWith("'"))
  ) {
    formatted = formatted.slice(1, -1);
  }
  // Replace escaped \n and \r with real newlines
  formatted = formatted.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
  return formatted.trim();
}

const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  (firebaseAppConfig as any)?.projectId ||
  "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1";

let adminAppInstance: App | null = null;
let adminAuthInstance: Auth | null = null;
let adminFirestoreInstance: Firestore | null = null;

export function getFirebaseAdminApp(): App | null {
  if (adminAppInstance) return adminAppInstance;

  const existingApps = getApps();
  if (existingApps.length > 0) {
    adminAppInstance = existingApps[0];
    return adminAppInstance;
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
  const privateKey = formatPrivateKey(rawPrivateKey);

  try {
    if (clientEmail && privateKey) {
      try {
        adminAppInstance = initializeApp({
          credential: cert({
            projectId: FIREBASE_PROJECT_ID,
            clientEmail,
            privateKey,
          }),
          projectId: FIREBASE_PROJECT_ID,
        });
        console.log(`[Firebase Admin] Inicializado com Service Account (${clientEmail}) para projeto: ${FIREBASE_PROJECT_ID}`);
      } catch (certErr: any) {
        console.warn(`[Firebase Admin Warning] Falha na credencial da Service Account:`, certErr?.message || certErr);
        adminAppInstance = initializeApp({
          projectId: FIREBASE_PROJECT_ID,
        });
        console.log(`[Firebase Admin] Inicializado com Project ID (${FIREBASE_PROJECT_ID}) em modo padrão após falha de certificado.`);
      }
    } else {
      adminAppInstance = initializeApp({
        projectId: FIREBASE_PROJECT_ID,
      });
      console.log(`[Firebase Admin] Inicializado com Project ID (${FIREBASE_PROJECT_ID}) em modo padrão.`);
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
      const dbId =
        (firebaseAppConfig as any)?.firestoreDatabaseId ||
        process.env.FIRESTORE_DATABASE_ID ||
        "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1";
      try {
        adminFirestoreInstance = getFirestore(adminApp, dbId);
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

// Eager initialization safely guarded
try {
  getFirebaseAdminApp();
} catch (e) {
  console.warn("[Firebase Admin Boot Notice]:", e);
}

// Safe Body Parsing Middleware (compatible with standard Node, Express, and Vercel Serverless Function pre-parsing)
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.body && typeof req.body === "object") {
    return next();
  }
  express.json({ limit: "10mb" })(req, res, (err) => {
    if (err) {
      console.warn("[JSON Parse Warning]:", err?.message || err);
    }
    next();
  });
});
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.body && typeof req.body === "object") {
    return next();
  }
  express.urlencoded({ extended: true, limit: "10mb" })(req, res, next);
});

// Standard CORS & Security Headers Middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("X-Content-Type-Options", "nosniff");
  res.header("Referrer-Policy", "strict-origin-when-cross-origin");
  res.header("X-XSS-Protection", "1; mode=block");
  res.header("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()");

  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    res.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  res.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' https://apis.google.com https://*.firebaseapp.com https://*.googleapis.com https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://images.unsplash.com https://api.dicebear.com https://*.dicebear.com https://*.googleusercontent.com https://*.gstatic.com https://*.googleapis.com https://*.firebasestorage.app https://firebasestorage.googleapis.com https://*.githubusercontent.com; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://generativelanguage.googleapis.com https://images.unsplash.com https://*.google.com wss://*.firebaseio.com https://*.googleusercontent.com https://api.dicebear.com https://*.dicebear.com https://*.google-analytics.com https://*.analytics.google.com https://fonts.gstatic.com; frame-src 'self' https://*.firebaseapp.com https://*.google.com; frame-ancestors 'self' https://*.google.com https://*.google.dev https://*.run.app https://*.web.app https://*.firebaseapp.com; object-src 'none'; base-uri 'self'; form-action 'self';"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// =================================================================
// Security & Rate Limiting Infrastructure
// =================================================================

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

function getClientIp(req: Request): string {
  try {
    const forwarded = req.headers?.["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded) {
      return forwarded.split(",")[0].trim();
    }
    const realIp = req.headers?.["x-real-ip"];
    if (typeof realIp === "string" && realIp) {
      return realIp.trim();
    }
    return (
      req.socket?.remoteAddress ||
      (req as any).connection?.remoteAddress ||
      "unknown"
    );
  } catch {
    return "unknown";
  }
}

function createRateLimiter(maxRequests: number, windowMs: number, label: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const identifier = req.authUser?.uid ? `user:${req.authUser.uid}` : `ip:${getClientIp(req)}`;
    const key = `${label}:${identifier}`;
    const now = Date.now();
    const current = rateLimitStore.get(key);

    if (!current || now > current.resetTime) {
      rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (current.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: `Limite de requisições excedido para ${label}. Aguarde ${Math.ceil((current.resetTime - now) / 1000)}s antes de tentar novamente.`,
      });
    }

    current.count++;
    return next();
  };
}

const aiRateLimiter = createRateLimiter(20, 60 * 1000, "IA");
const generalRateLimiter = createRateLimiter(120, 60 * 1000, "API");

// Clean up stale rate limit entries periodically (only in long-running container mode)
if (!process.env.VERCEL) {
  const rateLimitCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, val] of rateLimitStore.entries()) {
      if (now > val.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);
  if (typeof rateLimitCleanupInterval?.unref === "function") {
    rateLimitCleanupInterval.unref();
  }
}

// =================================================================
// Firebase Auth Token Verification Middleware
// =================================================================

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  email_verified?: boolean;
  role?: string;
  isAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
    }
  }
}

async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.split(" ")[1]?.trim();
  if (!token) return next();

  try {
    const adminAuth = getAdminAuth();
    if (adminAuth) {
      try {
        const decoded = await adminAuth.verifyIdToken(token);
        const isEmailVerified = decoded.email_verified === true;
        const rootAuthEval = evaluateRootAdminAuth({
          uid: decoded.uid,
          email: decoded.email,
          email_verified: isEmailVerified,
        });
        const isRoot = rootAuthEval.isRoot;

        if (!isRoot && (decoded.email || "").toLowerCase() === ROOT_ADMIN_EMAIL.toLowerCase()) {
          if (rootAuthEval.rejectionReason === "ROOT_ADMIN_UID_NOT_CONFIGURED") {
            console.warn(`[Security Alert] Root Admin candidate (${ROOT_ADMIN_EMAIL}) attempted authentication, but ROOT_ADMIN_UID is not configured on the server. Elevation denied (fail-closed).`);
          } else if (rootAuthEval.rejectionReason === "UID_NOT_MATCHING_PINNED_ROOT") {
            console.warn(`[Security Alert] Root Admin candidate (${ROOT_ADMIN_EMAIL}) UID mismatch. Expected pinned UID, received ${decoded.uid}. Access denied.`);
          } else if (rootAuthEval.rejectionReason === "EMAIL_NOT_VERIFIED") {
            console.warn(`[Security Alert] Root Admin candidate (${ROOT_ADMIN_EMAIL}) email is not verified by identity provider. Access denied.`);
          }
        }
        let isAdmin = false;
        let dbRole: string | undefined = undefined;

        const adminFirestore = getAdminFirestore();
        if (adminFirestore) {
          try {
            const uDoc = await adminFirestore.collection("users").doc(decoded.uid).get();
            const uData: any = (uDoc.exists && (typeof uDoc.data === "function" ? uDoc.data() : (uDoc as any).data)) || {};
            const isSuspendedOrBanned = uData?.status === "banned" || uData?.status === "suspended";
            dbRole = uData?.role;

            let hasAdminAssignment = false;
            try {
              const assignDoc = await adminFirestore.collection("role_assignments").doc(decoded.uid).get();
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
            } catch (assignErr) {
              // Fail-closed: erro na leitura da atribuição resulta em negação de acesso
              hasAdminAssignment = false;
            }

            if (isSuspendedOrBanned) {
              isAdmin = false;
            } else if (isRoot) {
              isAdmin = true;
              dbRole = "ADMIN";
            } else if (hasAdminAssignment && isEmailVerified) {
              isAdmin = true;
              dbRole = "ADMIN";
            } else {
              isAdmin = false;
            }
          } catch (_) {
            if (isRoot) {
              isAdmin = true;
              dbRole = "ADMIN";
            } else {
              isAdmin = false;
            }
          }
        } else if (isRoot) {
          isAdmin = true;
          dbRole = "ADMIN";
        } else {
          isAdmin = false;
        }

        req.authUser = {
          uid: decoded.uid,
          email: decoded.email,
          email_verified: isEmailVerified,
          role: isAdmin ? "ADMIN" : (dbRole || "ALUNO"),
          isAdmin,
        };
        return next();
      } catch (tokenVerifyErr: any) {
        // Token was provided in Authorization header but failed cryptographic signature verification
        // Strictly reject: do NOT authenticate, do NOT set req.authUser, and do NOT fall back to manual decoding
        console.warn("[Auth Security Warning] verifyIdToken falhou na validação de assinatura criptográfica:", tokenVerifyErr?.message || tokenVerifyErr);
        req.authUser = undefined;
        return next();
      }
    } else {
      console.warn("[Auth Security Warning] Admin Auth não disponível para verificação de token.");
      req.authUser = undefined;
      return next();
    }
  } catch (authErr) {
    console.warn("[Auth Middleware Warning]:", authErr);
    req.authUser = undefined;
  }

  next();
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser || !req.authUser.uid) {
    const unauthAudit = logAIAudit({
      userId: "ANONYMOUS_UNAUTHENTICATED",
      userEmail: "unauthenticated",
      userRole: "NONE",
      endpoint: req.originalUrl || req.path,
      action: "UNAUTHORIZED_AI_ATTEMPT",
      status: "REJECTED_UNAUTHORIZED",
      details: {
        method: req.method,
        ip: getClientIp(req),
        headersSent: Object.keys(req.headers),
      },
      ip: getClientIp(req),
    });

    console.warn(`[Security Alert] Tentativa de acesso não autenticado a recurso de IA rejeitada com 401. Audit ID: ${unauthAudit.id}`);

    return res.status(401).json({
      success: false,
      error: "Autenticação obrigatória. Faça login com sua conta institucional para utilizar os recursos do Localiza+.",
      auditId: unauthAudit.id,
    });
  }

  // Mandatory email verification security check (Admins bypass this check)
  if (req.authUser.email_verified !== true && !req.authUser.isAdmin) {
    return res.status(403).json({
      success: false,
      error: "E-mail não verificado. É obrigatório confirmar seu endereço de e-mail antes de acessar os recursos do Localiza+.",
      code: "AUTH_EMAIL_NOT_VERIFIED",
    });
  }

  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser || !req.authUser.isAdmin) {
    return res.status(403).json({
      success: false,
      error: "Acesso negado. Apenas administradores autorizados do IFPR podem executar esta operação.",
    });
  }
  next();
}

// =================================================================
// Institutional Staff & Devolution Authorization Validators
// =================================================================

export interface StaffOrAdminValidationResult {
  authorized: boolean;
  statusCode: number;
  errorMessage?: string;
  userData?: Record<string, any>;
  signerName?: string;
}

export function parseUserExpiryMs(val: any): number | null {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (val && typeof val.toMillis === "function") return val.toMillis();
  if (typeof val === "string") {
    const parsed = Date.parse(val);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

export function hasUserActiveTemporalBlock(udata: Record<string, any> | null | undefined): boolean {
  if (!udata || typeof udata !== "object") return false;
  const nowMs = Date.now();
  const blockExpiresMs = parseUserExpiryMs(udata.blockExpiresAt);
  const suspendedUntilMs = parseUserExpiryMs(udata.suspendedUntil);
  return Boolean(
    (blockExpiresMs !== null && blockExpiresMs > nowMs) ||
    (suspendedUntilMs !== null && suspendedUntilMs > nowMs)
  );
}

export interface SignatureEncryptionKeyEntry {
  keyId: string;
  keyBuffer: Buffer;
}

const MIN_SIGNATURE_SECRET_LENGTH = 32;

function parseKeyEntry(rawEntry: string, defaultKeyId: string): SignatureEncryptionKeyEntry | null {
  const trimmed = rawEntry.trim();
  if (!trimmed) return null;

  let keyId = defaultKeyId;
  let secretMaterial = trimmed;

  const colonIdx = trimmed.indexOf(":");
  if (colonIdx > 0 && colonIdx <= 32) {
    const candidateId = trimmed.slice(0, colonIdx).trim();
    const candidateSecret = trimmed.slice(colonIdx + 1).trim();
    if (/^[a-zA-Z0-9_-]{1,32}$/.test(candidateId) && candidateSecret.length >= MIN_SIGNATURE_SECRET_LENGTH) {
      keyId = candidateId;
      secretMaterial = candidateSecret;
    }
  }

  if (secretMaterial.length < MIN_SIGNATURE_SECRET_LENGTH) {
    return null;
  }

  // Reject predictable or project-id derived values
  if (
    secretMaterial.includes("localiza-plus-sig-link") ||
    (FIREBASE_PROJECT_ID && secretMaterial === FIREBASE_PROJECT_ID)
  ) {
    return null;
  }

  return {
    keyId,
    keyBuffer: crypto.createHash("sha256").update(secretMaterial, "utf8").digest(),
  };
}

export function getSignatureEncryptionKeyring(): {
  activeKey: SignatureEncryptionKeyEntry;
  allKeys: SignatureEncryptionKeyEntry[];
} {
  const rawPrimary = typeof process.env.SIGNATURE_TOKEN_SECRET === "string" ? process.env.SIGNATURE_TOKEN_SECRET : "";
  const configuredKeyId =
    typeof process.env.SIGNATURE_TOKEN_KEY_ID === "string" && /^[a-zA-Z0-9_-]{1,32}$/.test(process.env.SIGNATURE_TOKEN_KEY_ID.trim())
      ? process.env.SIGNATURE_TOKEN_KEY_ID.trim()
      : "v1";

  const activeKey = parseKeyEntry(rawPrimary, configuredKeyId);
  if (!activeKey) {
    throw new Error("SIGNATURE_ENCRYPTION_KEY_MISSING");
  }

  const allKeys: SignatureEncryptionKeyEntry[] = [activeKey];
  const seenIds = new Set<string>([activeKey.keyId]);

  const rawPrevious =
    typeof process.env.SIGNATURE_TOKEN_SECRET_PREVIOUS === "string"
      ? process.env.SIGNATURE_TOKEN_SECRET_PREVIOUS.trim()
      : "";
  if (rawPrevious) {
    const entries = rawPrevious.split(/[,;]/);
    entries.forEach((entryStr, idx) => {
      const parsed = parseKeyEntry(entryStr, `prev-${idx + 1}`);
      if (parsed && !seenIds.has(parsed.keyId)) {
        seenIds.add(parsed.keyId);
        allKeys.push(parsed);
      } else if (parsed) {
        allKeys.push({ keyId: `${parsed.keyId}-${idx + 1}`, keyBuffer: parsed.keyBuffer });
      }
    });
  }

  return { activeKey, allKeys };
}

export function getSignatureLinkEncryptionKey(): Buffer {
  return getSignatureEncryptionKeyring().activeKey.keyBuffer;
}

export function encryptSignatureToken(rawToken: string): string {
  const { activeKey } = getSignatureEncryptionKeyring();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", activeKey.keyBuffer, iv, { authTagLength: 16 });
  const encrypted = Buffer.concat([cipher.update(rawToken, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${activeKey.keyId}.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSignatureTokenWithMetadata(
  payload: string
): { token: string; keyId: string; usedPreviousKey: boolean } | null {
  try {
    if (!payload || typeof payload !== "string") return null;
    const parts = payload.split(".");
    let payloadKeyId: string | null = null;
    let ivB64 = "";
    let tagB64 = "";
    let dataB64 = "";

    if (parts.length === 4) {
      [payloadKeyId, ivB64, tagB64, dataB64] = parts;
    } else if (parts.length === 3) {
      [ivB64, tagB64, dataB64] = parts;
    } else {
      return null;
    }

    if (!ivB64 || !tagB64 || !dataB64) return null;
    const ivBuf = Buffer.from(ivB64, "base64url");
    const tagBuf = Buffer.from(tagB64, "base64url");
    const dataBuf = Buffer.from(dataB64, "base64url");
    if (ivBuf.length !== 12 || tagBuf.length !== 16 || dataBuf.length === 0) {
      return null;
    }

    const { activeKey, allKeys } = getSignatureEncryptionKeyring();

    const orderedCandidates: SignatureEncryptionKeyEntry[] = [];
    if (payloadKeyId) {
      const exact = allKeys.find((k) => k.keyId === payloadKeyId);
      if (exact) orderedCandidates.push(exact);
    }
    for (const k of allKeys) {
      if (!orderedCandidates.includes(k)) {
        orderedCandidates.push(k);
      }
    }

    for (const candidate of orderedCandidates) {
      try {
        const decipher = crypto.createDecipheriv("aes-256-gcm", candidate.keyBuffer, ivBuf, { authTagLength: 16 });
        decipher.setAuthTag(tagBuf);
        const decrypted = Buffer.concat([decipher.update(dataBuf), decipher.final()]);
        return {
          token: decrypted.toString("utf8"),
          keyId: candidate.keyId,
          usedPreviousKey: candidate.keyId !== activeKey.keyId,
        };
      } catch {
        // Try next key in keyring
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function decryptSignatureToken(payload: string): string | null {
  const res = decryptSignatureTokenWithMetadata(payload);
  return res ? res.token : null;
}

export async function canRemovePreviousEncryptionKey(
  adminDb: any,
  targetKeyId: string
): Promise<{ safeToRemove: boolean; activeDependentCount: number; itemIds: string[] }> {
  const cleanKeyId = String(targetKeyId || "").trim();
  if (!adminDb || !cleanKeyId) {
    return { safeToRemove: false, activeDependentCount: 0, itemIds: [] };
  }
  const snap = await adminDb.collection("signature_requests").where("used", "==", false).get();
  const docs = snap?.docs || [];
  const nowMs = Date.now();
  const itemIds: string[] = [];

  for (const d of docs) {
    const data = (typeof d.data === "function" ? d.data() : d.data) || {};
    if (data.invalidated === true) continue;
    const expMs = data.expiresAt ? Date.parse(String(data.expiresAt)) : NaN;
    if (Number.isNaN(expMs) || expMs <= nowMs) continue;
    const enc = typeof data.encryptedToken === "string" ? data.encryptedToken : "";
    if (data.encryptionKeyId === cleanKeyId || enc.startsWith(`${cleanKeyId}.`)) {
      itemIds.push(data.itemId || d.id);
    }
  }

  return {
    safeToRemove: itemIds.length === 0,
    activeDependentCount: itemIds.length,
    itemIds,
  };
}

export const PRIVATE_RETURN_ITEM_FIELDS = [
  "returnedByUserId",
  "returnedByName",
  "returnedByRole",
  "returnDate",
  "returnTime",
  "recipientName",
  "recipientEmail",
  "recipientBond",
  "recipientDocument",
  "recipientUid",
  "returnObservations",
  "receiptValidationCode",
  "recipientSignatureUrl",
  "recipientSignatureType",
  "recipientSignatureMethod",
  "recipientSignatureStatus",
  "recipientSignatureName",
  "recipientSignatureEmail",
  "recipientSignatureBond",
  "recipientSignatureDate",
  "staffSignatureStatus",
  "staffSignatureMethod",
  "staffSignatureUrl",
  "staffSignedAt",
  "staffSignerUid",
  "staffSignerName",
  "staffSignerEmail",
  "signatureToken",
  "signatureTokenExpiresAt",
  "signatureTokenUsed",
  "signedAt",
  "signatureIpOrDevice",
  "secretVerificationKey",
  "requiresAdminClaimReview",
  "devolutionNotified",
  "returnEmailNotified",
  "devolutionNotificationStatus",
  "devolutionNotifiedAt",
  "devolutionNotifiedBy",
] as const;

export function buildPublicFieldDeletionMap(deleteMarker: any): Record<string, any> {
  const map: Record<string, any> = {};
  for (const field of PRIVATE_RETURN_ITEM_FIELDS) {
    if (field === "secretVerificationKey") continue;
    map[field] = deleteMarker;
  }
  return map;
}

export function sanitizePublicItemDocument(rawItem: Record<string, any>): Record<string, any> {
  if (!rawItem || typeof rawItem !== "object") return {};
  const clean: Record<string, any> = { ...rawItem };
  for (const field of PRIVATE_RETURN_ITEM_FIELDS) {
    delete clean[field];
  }
  const redactLogs = (logs: any[]) =>
    logs.map((log) => {
      if (!log || typeof log !== "object") return log;
      const detailsStr = typeof log.details === "string" ? log.details : typeof log.description === "string" ? log.description : "";
      if (
        /devolu[cç][aã]o|assinatura|receptor|recebedor|comprovante|validador/i.test(String(log.action || "") + " " + detailsStr)
      ) {
        return {
          id: log.id,
          action: log.action?.includes("reaberta") ? "Devolução reaberta" : "Devolução institucional registrada",
          actorRole: log.actorRole || log.userRole || "SERVIDOR",
          timestamp: log.timestamp || log.date,
          details: log.action?.includes("reaberta")
            ? "Registro de devolução reaberto administrativamente."
            : "Movimentação formal de devolução registrada no sistema.",
        };
      }
      return log;
    });
  if (Array.isArray(clean.history)) {
    clean.history = redactLogs(clean.history);
  }
  if (Array.isArray(clean.historyLogs)) {
    clean.historyLogs = redactLogs(clean.historyLogs);
  }
  return clean;
}

export function mergePublicAndPrivateItemData(
  publicData: Record<string, any> | null | undefined,
  privateData: Record<string, any> | null | undefined
): Record<string, any> {
  if (!publicData) return privateData ? { ...privateData } : {};
  if (!privateData) return { ...publicData };
  const merged: Record<string, any> = {
    ...publicData,
    ...privateData,
    id: publicData.id || privateData.itemId,
    status: publicData.status || privateData.status,
  };
  if (Array.isArray(privateData.privateHistory) && privateData.privateHistory.length > 0) {
    merged.history = privateData.privateHistory;
  }
  if (Array.isArray(privateData.privateHistoryLogs) && privateData.privateHistoryLogs.length > 0) {
    merged.historyLogs = privateData.privateHistoryLogs;
  }
  return merged;
}

export function sanitizeEmailNotificationUrl(url: string): string {
  if (!url || typeof url !== "string") return "";
  return url.replace(/([?&](?:token|sigToken)=)[^&\s]+/gi, "$1[REDACTED]");
}

export async function validateStaffOrAdminAccess(
  adminDb: any,
  authUser: { uid: string; email?: string; email_verified?: boolean; isAdmin?: boolean }
): Promise<StaffOrAdminValidationResult> {
  if (!authUser || !authUser.uid) {
    return {
      authorized: false,
      statusCode: 401,
      errorMessage: "Autenticação obrigatória. Faça login com sua conta institucional.",
    };
  }

  if (!adminDb) {
    return {
      authorized: false,
      statusCode: 503,
      errorMessage: "Banco de dados Firestore Admin indisponível no servidor.",
    };
  }

  try {
    const userDoc = await adminDb.collection("users").doc(authUser.uid).get();
    if (!userDoc || !userDoc.exists) {
      console.warn(`[Auth RBAC Security] Documento de perfil /users/${authUser.uid} inexistente no Firestore. Operação negada.`);
      return {
        authorized: false,
        statusCode: 403,
        errorMessage: "Acesso negado: Perfil de usuário não encontrado no sistema institucional.",
      };
    }

    const udata = (typeof userDoc.data === "function" ? userDoc.data() : userDoc.data) || {};
    const normStatus = String(udata.status || "").trim().toLowerCase();
    const hasActiveTemporalBlock = hasUserActiveTemporalBlock(udata);

    // 1. Strict status check: reject suspended, banned, inactive, active === false, or active temporal suspension
    if (
      normStatus === "suspended" ||
      normStatus === "banned" ||
      normStatus === "inactive" ||
      udata.active === false ||
      hasActiveTemporalBlock
    ) {
      console.warn(`[Auth RBAC Security] Usuário ${authUser.uid} com status bloqueado ('${normStatus}', active=${udata.active}, temporalBlock=${hasActiveTemporalBlock}). Operação negada.`);
      return {
        authorized: false,
        statusCode: 403,
        errorMessage: "Conta suspensa ou inativa. Acesso negado aos recursos institucionais.",
      };
    }

    const isRootAdmin = evaluateRootAdminAuth(authUser).isRoot;

    // 2. Cryptographic email verification check: only authUser.email_verified === true or trusted Root Admin
    // Persistent Firestore udata.emailVerified is NOT accepted as a substitute for cryptographic token verification
    const isEmailVerified = Boolean(
      isRootAdmin ||
      authUser.email_verified === true
    );

    if (!isEmailVerified) {
      console.warn(`[Auth RBAC Security] Usuário ${authUser.uid} com e-mail institucional não verificado pelo provedor de identidade. Operação negada.`);
      return {
        authorized: false,
        statusCode: 403,
        errorMessage: "E-mail não verificado. Confirme seu e-mail institucional no provedor de identidade para executar esta operação.",
      };
    }

    // 3. Strict Role & Approval check:
    // ADMIN: strictly requires role === "ADMIN" and approvalStatus === "APROVADO" in Firestore (or approved Root Admin)
    // Stale authUser.isAdmin claims or udata.isAdmin boolean without role "ADMIN" are eliminated.
    const isDocAdmin = udata.role === "ADMIN" && udata.approvalStatus === "APROVADO";
    const isAdminUser = isDocAdmin || (isRootAdmin && udata.approvalStatus === "APROVADO");

    let isAuthorized = false;
    if (isAdminUser) {
      isAuthorized = true;
    } else if (
      udata.role === "SERVIDOR" &&
      udata.approvalStatus === "APROVADO"
    ) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return {
        authorized: false,
        statusCode: 403,
        errorMessage: "Acesso negado. Apenas servidores e administradores do IFPR ativos e aprovados podem executar esta operação.",
      };
    }

    const signerName = udata.name || authUser.email?.split("@")[0] || "Servidor IFPR";

    return {
      authorized: true,
      statusCode: 200,
      userData: udata,
      signerName,
    };
  } catch (err: any) {
    console.error(`[Auth RBAC Error] Falha segura ao consultar perfil /users/${authUser.uid} no Firestore:`, {
      message: err?.message || String(err),
    });
    return {
      authorized: false,
      statusCode: 500,
      errorMessage: "Erro interno ao validar credenciais institucionais no banco de dados.",
    };
  }
}

export interface DevolutionNotificationValidationResult {
  authorized: boolean;
  statusCode: number;
  errorMessage?: string;
  itemData?: Record<string, any>;
  alreadyNotified?: boolean;
}

export async function validateDevolutionNotificationAccess(
  adminDb: any,
  authUser: { uid: string; email?: string; email_verified?: boolean; isAdmin?: boolean },
  itemId: string
): Promise<DevolutionNotificationValidationResult> {
  // 1. Validate caller identity and staff/admin standing
  const staffValidation = await validateStaffOrAdminAccess(adminDb, authUser);
  if (!staffValidation.authorized) {
    return {
      authorized: false,
      statusCode: staffValidation.statusCode,
      errorMessage: staffValidation.errorMessage || "Acesso negado: Apenas servidores e administradores autorizados do IFPR podem disparar notificações de devolução.",
    };
  }

  // 2. Fetch Item from Firestore (Do NOT trust client-supplied data)
  try {
    const itemSnap = await adminDb.collection("items").doc(itemId).get();
    if (!itemSnap || !itemSnap.exists) {
      return {
        authorized: false,
        statusCode: 404,
        errorMessage: `Ocorrência #${itemId} não encontrada no banco de dados.`,
      };
    }

    const itemData = (typeof itemSnap.data === "function" ? itemSnap.data() : itemSnap.data) || {};

    // 3. Status Verification: Must have been legally returned
    if (itemData.status !== "DEVOLVIDO") {
      return {
        authorized: false,
        statusCode: 400,
        errorMessage: `Ocorrência #${itemId} possui status '${itemData.status || "INDEFINIDO"}' e não foi registrada como DEVOLVIDO.`,
      };
    }

    // 4. Author / Attendant Relationship Check:
    // Non-admins must be the attendant who registered the return
    const isRootAdmin = evaluateRootAdminAuth(authUser).isRoot;
    const isUserAdmin = isRootAdmin || (staffValidation.userData?.role === "ADMIN" && staffValidation.userData?.approvalStatus === "APROVADO");
    const callerUid = authUser.uid;

    if (!isUserAdmin) {
      const issuerUid = itemData.returnedByUserId;
      if (issuerUid && issuerUid !== callerUid) {
        console.warn(`[Devolution Notification Blocked] Servidor ${callerUid} tentou disparar notificação de devolução realizada por outro servidor (${issuerUid}).`);
        return {
          authorized: false,
          statusCode: 403,
          errorMessage: "Acesso negado: Apenas o atendente responsável por registrar a devolução deste objeto pode disparar a notificação institucional.",
        };
      }
    }

    // 5. Idempotency Check: Prevent duplicate email dispatches
    if (
      itemData.devolutionNotified === true ||
      itemData.returnEmailNotified === true ||
      itemData.devolutionNotificationStatus === "COMPLETED"
    ) {
      return {
        authorized: true,
        statusCode: 200,
        alreadyNotified: true,
        itemData,
      };
    }

    return {
      authorized: true,
      statusCode: 200,
      alreadyNotified: false,
      itemData,
    };
  } catch (err: any) {
    console.error(`[Devolution Auth Error] Falha ao consultar item #${itemId} no Firestore:`, {
      message: err?.message || String(err),
    });
    return {
      authorized: false,
      statusCode: 500,
      errorMessage: "Erro interno ao validar dados da ocorrência no banco de dados.",
    };
  }
}

/**
 * Resolves the recipient email strictly and exclusively from trusted Firestore record.
 * Client-supplied overrides (such as req.body.recipientEmail) are never accepted.
 */
export function extractTrustedRecipientEmail(itemData: Record<string, any> | null | undefined): string | null {
  if (!itemData || typeof itemData !== "object") return null;

  const primaryCandidates = [
    itemData.recipientEmail,
    itemData.recipientSignatureEmail,
    itemData.contactEmail,
  ];

  for (const candidate of primaryCandidates) {
    if (typeof candidate === "string" && candidate.trim().includes("@")) {
      const match = candidate.trim().match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (match) return match[0];
    }
  }

  // registeredByUserEmail is ONLY valid if item type is PERDIDO (owner registered lost item).
  // For ENCONTRADO items, registeredByUserEmail is the finder and must NOT be used as recipient.
  if (itemData.type === "PERDIDO" && typeof itemData.registeredByUserEmail === "string" && itemData.registeredByUserEmail.trim().includes("@")) {
    const match = itemData.registeredByUserEmail.trim().match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (match) return match[0];
  }

  return null;
}

// =================================================================
// AI Security & Usage Audit Trail Store
// =================================================================

export interface AIAuditRecord {
  id: string;
  userId: string;
  userEmail?: string;
  userRole?: string;
  endpoint: string;
  action: string;
  status: "SUCCESS" | "FAILED" | "REJECTED_UNAUTHORIZED" | "REJECTED_RATE_LIMIT";
  modelUsed?: string;
  promptSnippet?: string;
  details?: Record<string, any>;
  ip?: string;
  timestamp: string;
}

const aiAuditLogs: AIAuditRecord[] = [];

function logAIAudit(entry: Omit<AIAuditRecord, "id" | "timestamp">): AIAuditRecord {
  const record: AIAuditRecord = {
    id: `audit_ai_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };

  aiAuditLogs.unshift(record);
  if (aiAuditLogs.length > 1000) {
    aiAuditLogs.pop();
  }

  const counterKey = `ai_audit:${entry.action}:${entry.status}`;
  eventCounters[counterKey] = (eventCounters[counterKey] || 0) + 1;

  console.log(`[AI AUDIT LOG] [${record.status}] UID: ${record.userId} (${record.userEmail || "none"}) | Endpoint: ${record.endpoint} | Action: ${record.action} | Model: ${record.modelUsed || "none"}`);
  return record;
}

app.use(authenticateToken);
app.use(generalRateLimiter);

// Initialize Google GenAI Server Client safely with multi-source env key resolution
let aiClient: GoogleGenAI | null = null;

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    process.env.API_KEY ||
    ""
  ).trim();

  if (!apiKey) return null;

  if (!aiClient) {
    try {
      aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    } catch (err) {
      console.error("[Gemini AI Init Error] Erro ao inicializar GoogleGenAI:", err);
    }
  }
  return aiClient;
}

export function classifyGeminiError(err: any): { statusCode: number; message: string; errorCode: string } {
  const errMsg = String(err?.message || err || "");
  const status = Number(err?.status || err?.statusCode || 0);

  if (status === 429 || errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.toLowerCase().includes("quota")) {
    return {
      statusCode: 429,
      message: "Limite de cota ou taxa da API Google Gemini excedido. Tente novamente em alguns instantes.",
      errorCode: "RATE_LIMIT_EXCEEDED",
    };
  }

  if (status === 400 || errMsg.includes("INVALID_ARGUMENT") || errMsg.includes("SAFETY") || errMsg.toLowerCase().includes("blocked")) {
    return {
      statusCode: 400,
      message: "A solicitação foi recusada pelos filtros de segurança ou parâmetros inválidos da IA.",
      errorCode: "INVALID_ARGUMENT_OR_SAFETY",
    };
  }

  if (
    status === 401 ||
    status === 403 ||
    errMsg.includes("API_KEY_INVALID") ||
    errMsg.includes("PERMISSION_DENIED") ||
    errMsg.includes("UNAUTHENTICATED")
  ) {
    return {
      statusCode: 503,
      message: "Credencial da API Gemini não autorizada ou chave de API inválida no servidor.",
      errorCode: "API_KEY_UNAUTHORIZED",
    };
  }

  if (status === 503 || status === 504 || errMsg.includes("UNAVAILABLE") || errMsg.includes("DEADLINE_EXCEEDED") || errMsg.includes("ETIMEDOUT")) {
    return {
      statusCode: 503,
      message: "O serviço de Inteligência Artificial do Google Gemini está temporariamente indisponível.",
      errorCode: "GEMINI_UPSTREAM_UNAVAILABLE",
    };
  }

  return {
    statusCode: 502,
    message: `Erro de comunicação com o serviço upstream do Google Gemini: ${errMsg}`,
    errorCode: "GEMINI_UPSTREAM_ERROR",
  };
}

// In-memory Analytics & Monitoring Store
const serverStartTime = Date.now();
let totalServerRequests = 0;
const analyticsEvents: Array<{
  eventName: string;
  params?: any;
  timestamp: string;
  url?: string;
  ip?: string;
  userId?: string;
  userEmail?: string;
}> = [];
const eventCounters: Record<string, number> = {};

// Global System Configuration State (Maintenance Mode & Campus Announcements)
interface SystemConfigState {
  maintenanceMode: boolean;
  maintenanceCustomMessage: string;
  lastUpdated: string;
  updatedBy: string;
}

const DEFAULT_SYSTEM_CONFIG: SystemConfigState = {
  maintenanceMode: false,
  maintenanceCustomMessage: "⚠️ ATENÇÃO: O SISTEMA ESTÁ EM MODO DE MANUTENÇÃO / ATUALIZAÇÃO PROGRAMADA NO CAMPUS IVAIPORÃ",
  lastUpdated: new Date().toISOString(),
  updatedBy: "SYSTEM",
};

let globalSystemConfig: SystemConfigState = { ...DEFAULT_SYSTEM_CONFIG };

function getValidatedSystemConfig(): SystemConfigState {
  if (!globalSystemConfig || typeof globalSystemConfig !== "object") {
    console.warn("[System Config Warning] globalSystemConfig inválido. Restaurando estado padrão.");
    globalSystemConfig = { ...DEFAULT_SYSTEM_CONFIG, lastUpdated: new Date().toISOString() };
  }
  return {
    maintenanceMode: Boolean(globalSystemConfig.maintenanceMode),
    maintenanceCustomMessage:
      typeof globalSystemConfig.maintenanceCustomMessage === "string" && globalSystemConfig.maintenanceCustomMessage.trim()
        ? globalSystemConfig.maintenanceCustomMessage.trim()
        : DEFAULT_SYSTEM_CONFIG.maintenanceCustomMessage,
    lastUpdated: globalSystemConfig.lastUpdated || new Date().toISOString(),
    updatedBy: globalSystemConfig.updatedBy || "SYSTEM",
  };
}

app.use((_req, _res, next) => {
  totalServerRequests++;
  next();
});

// API System Configuration Endpoints (Works seamlessly online, in serverless & container environments)
app.get(["/api/system/config", "/system/config"], (req: Request, res: Response) => {
  try {
    const config = getValidatedSystemConfig();
    return res.status(200).json({
      success: true,
      config,
      environment: {
        isVercel: Boolean(process.env.VERCEL),
        nodeEnv: process.env.NODE_ENV || "development",
        serverTimestamp: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error("[System Config Error] Falha ao ler configuração do sistema:", {
      message: err?.message || String(err),
      stack: err?.stack,
      ip: getClientIp(req),
      timestamp: new Date().toISOString(),
    });
    return res.status(200).json({
      success: true,
      config: { ...DEFAULT_SYSTEM_CONFIG, lastUpdated: new Date().toISOString() },
      warning: "Configuração recuperada via fallback de segurança.",
    });
  }
});

// =================================================================
// Auth Compensation Endpoint for Failed Registrations
// Prevents newly created Auth accounts from becoming orphaned if Firestore creation fails
// =================================================================
app.post(
  ["/api/auth/compensate-failed-registration", "/auth/compensate-failed-registration"],
  generalRateLimiter,
  async (req: Request, res: Response) => {
    // 0. Mandatory Cryptographic Authentication Verification
    const callerUid = req.authUser?.uid;
    if (!callerUid) {
      return res.status(401).json({
        success: false,
        error: "Autenticação obrigatória. Forneça o token Bearer válido para compensação de cadastro.",
        code: "UNAUTHENTICATED",
      });
    }

    const { uid, email } = req.body || {};
    const requestedUid = typeof uid === "string" ? uid.trim() : "";

    // 1. Validate Identity Binding: non-admins can only compensate their own account
    if (requestedUid && requestedUid !== callerUid && !req.authUser?.isAdmin) {
      console.warn(`[Compensation Rejected] Solicitante (${callerUid}) tentou compensar conta alheia (${requestedUid}). Acesso negado.`);
      return res.status(403).json({
        success: false,
        error: "Acesso negado: Você só pode solicitar a compensação de sua própria conta recém-criada.",
        code: "FORBIDDEN_NOT_OWNER",
      });
    }

    const targetUid = req.authUser?.isAdmin ? (requestedUid || callerUid) : callerUid;
    if (!targetUid) {
      return res.status(400).json({
        success: false,
        error: "UID obrigatório para compensação.",
        code: "UID_REQUIRED",
      });
    }

    try {
      const adminAuth = getAdminAuth();
      const adminFirestore = getAdminFirestore();

      if (!adminAuth || !adminFirestore) {
        return res.status(503).json({
          success: false,
          error: "Serviço de autenticação ou banco indisponível para compensação.",
          code: "SERVICE_UNAVAILABLE",
        });
      }

      // 2. Fetch User Record from Admin Auth
      const userRecord = await adminAuth.getUser(targetUid);

      // 3. Verify Creation Time Window (must be recently created, <= 3 minutes)
      const creationTime = new Date(userRecord.metadata.creationTime).getTime();
      const now = Date.now();
      const elapsedMs = now - creationTime;

      if (elapsedMs > 3 * 60 * 1000) {
        console.warn(`[Compensation Rejected] Tentativa de compensação em conta antiga (${targetUid}, criada há ${Math.round(elapsedMs / 1000)}s). Abortando.`);
        return res.status(403).json({
          success: false,
          error: "Compensação permitida apenas para cadastros recém-criados.",
          code: "ACCOUNT_EXPIRED",
        });
      }

      // 4. Verify Consolidated Status: cannot delete account if email is verified (unless admin)
      if (userRecord.emailVerified === true && !req.authUser?.isAdmin) {
        return res.status(409).json({
          success: false,
          error: "Conta já consolidada (e-mail verificado). Compensação não permitida.",
          code: "ACCOUNT_CONSOLIDATED",
        });
      }

      // 5. Verify absence of document in Firestore /users/{targetUid}
      const docSnap = await adminFirestore.collection("users").doc(targetUid).get();
      if (docSnap.exists) {
        console.warn(`[Compensation Rejected] Documento Firestore /users/${targetUid} já existe. Não compensar.`);
        return res.status(409).json({
          success: false,
          error: "Usuário já possui documento no Firestore.",
          code: "ACCOUNT_CONSOLIDATED",
        });
      }

      // 6. Delete the orphaned newly created account
      await adminAuth.deleteUser(targetUid);
      console.log(`[Compensation Success] Conta órfã recém-criada ${targetUid} (${email || userRecord.email}) removida do Firebase Auth com sucesso.`);

      return res.json({
        success: true,
        message: "Compensação realizada com sucesso.",
      });
    } catch (err: any) {
      console.error(`[Compensation Error] Falha ao compensar conta ${targetUid}:`, err?.message || err);
      const isProd = process.env.NODE_ENV === "production";
      return res.status(500).json({
        success: false,
        error: isProd
          ? "Erro interno ao processar compensação de cadastro."
          : (err?.message || "Erro interno na compensação."),
        code: "COMPENSATION_ERROR",
      });
    }
  }
);

app.post(["/api/system/config", "/system/config"], requireAuth, requireAdmin, (req: Request, res: Response) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      console.warn("[System Config POST Warning] Corpo da requisição ausente ou inválido:", {
        body: req.body,
        user: req.authUser?.email || req.authUser?.uid,
        ip: getClientIp(req),
      });
      return res.status(400).json({
        success: false,
        error: "Corpo da requisição inválido. Envie um objeto JSON válido.",
      });
    }

    const { maintenanceMode, maintenanceCustomMessage } = req.body;
    const current = getValidatedSystemConfig();

    if (typeof maintenanceMode === "boolean") {
      current.maintenanceMode = maintenanceMode;
    }
    if (typeof maintenanceCustomMessage === "string" && maintenanceCustomMessage.trim()) {
      current.maintenanceCustomMessage = maintenanceCustomMessage.trim().substring(0, 500);
    }
    current.lastUpdated = new Date().toISOString();
    current.updatedBy = req.authUser?.email || req.authUser?.uid || "ADMIN_SESSION";

    globalSystemConfig = current;

    console.log(
      `[System Config Updated] Modo Manutenção: ${globalSystemConfig.maintenanceMode} por ${globalSystemConfig.updatedBy} às ${globalSystemConfig.lastUpdated}`
    );
    return res.status(200).json({ success: true, config: globalSystemConfig });
  } catch (err: any) {
    console.error("[System Config POST Error] Falha ao atualizar configuração do sistema:", {
      message: err?.message || String(err),
      stack: err?.stack,
      user: req.authUser?.email || req.authUser?.uid,
      ip: getClientIp(req),
      timestamp: new Date().toISOString(),
    });
    return res.status(500).json({
      success: false,
      error: "Erro ao atualizar configuração do sistema.",
      details: process.env.NODE_ENV !== "production" ? err?.message : undefined,
    });
  }
});

// Secure Administrative Master Wipe Endpoint
app.post(["/api/admin/master-wipe", "/admin/master-wipe"], requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const adminUid = req.authUser!.uid;
  const adminEmail = req.authUser!.email || "root_admin";
  const { reauthConfirmed, confirmationWord } = req.body || {};

  if (!reauthConfirmed || confirmationWord !== "DELETAR_TUDO_DEFINITIVAMENTE") {
    return res.status(400).json({
      success: false,
      error: "Confirmação de segurança de dois fatores e palavra de confirmação obrigatórias.",
    });
  }

  console.log(`[MASTER WIPE INICIADO] Solicitado por Admin: ${adminUid} (${adminEmail}) às ${new Date().toISOString()}`);

  try {
    const deletedCounts: Record<string, number> = { items: 0, claims: 0, comments: 0, notifications: 0 };
    const firestore = getAdminFirestore();
    if (firestore) {
      const collectionsToWipe = ["items", "claims", "comments", "notifications", "backup_logs", "error_logs"];
      for (const colName of collectionsToWipe) {
        const snap = await firestore.collection(colName).get();
        deletedCounts[colName] = snap.size;
        if (snap.size > 0) {
          const batch = firestore.batch();
          snap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }

      // Record administrative activity audit log in Firestore
      await firestore.collection("activity_logs").add({
        action: "MASTER_WIPE",
        performedBy: adminUid,
        performedByEmail: adminEmail,
        performedByName: "Administrador TI",
        role: "ADMIN",
        details: `Master Wipe executado com sucesso no servidor pelo Admin ${adminEmail}. Coleções excluídas: ${JSON.stringify(deletedCounts)}`,
        status: "SUCCESS",
        timestamp: new Date().toISOString(),
        ip: getClientIp(req),
      });

      await firestore.collection("audit_logs").add({
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        transactionId: `TX-WIPE-${Date.now().toString(36).toUpperCase()}`,
        objectId: "SYSTEM_DATABASE",
        objectType: "SYSTEM",
        objectTitle: "Master Wipe Geral",
        action: "MASTER_WIPE",
        actorId: adminUid,
        actorName: "Administrador TI",
        actorEmail: adminEmail,
        actorRole: "ADMIN",
        timestamp: new Date().toISOString(),
        details: `Master Wipe executado no servidor pelo Admin ${adminEmail}. Coleções excluídas: ${JSON.stringify(deletedCounts)}`,
        immutable: true,
      });
    }

    logAIAudit({
      userId: adminUid,
      userEmail: adminEmail,
      userRole: "ADMIN",
      endpoint: "/api/admin/master-wipe",
      action: "MASTER_WIPE_EXECUTED",
      status: "SUCCESS",
      details: { deletedCounts },
      ip: getClientIp(req),
    });

    return res.status(200).json({
      success: true,
      message: "Limpeza geral do sistema concluída com sucesso.",
      deletedCounts,
      timestamp: new Date().toISOString(),
    });
  } catch (wipeErr: any) {
    console.error("[MASTER WIPE ERROR]:", wipeErr);
    return res.status(500).json({
      success: false,
      error: "Falha ao executar limpeza no servidor: " + (wipeErr?.message || String(wipeErr)),
    });
  }
});

// Administrative User Deletion Endpoint (Removes user from Firebase Auth and cleans up Firestore users doc)
app.post(["/api/admin/delete-user", "/admin/delete-user"], requireAuth, requireAdmin, async (req: Request, res: Response) => {
  let currentStage = "DELETE_USER_START";

  try {
    // ----------------------------------------------------
    // STAGE 1: DELETE_USER_START
    // ----------------------------------------------------
    currentStage = "DELETE_USER_START";
    const adminUid = req.authUser!.uid;
    const adminEmail = req.authUser!.email || "root_admin";
    console.log(`[Admin Delete User] [STAGE: DELETE_USER_START] Requisição recebida. Admin: ${adminEmail} (${adminUid})`);

    // ----------------------------------------------------
    // STAGE 2: REQUEST_PARSED
    // ----------------------------------------------------
    currentStage = "REQUEST_PARSED";
    const { targetUserId } = req.body || {};
    console.log(`[Admin Delete User] [STAGE: REQUEST_PARSED] Payload recebido com sucesso.`);

    // ----------------------------------------------------
    // STAGE 3 & 4: AUTH_CHECK_START & AUTH_CHECK_OK
    // (Validated by requireAuth middleware)
    // ----------------------------------------------------
    currentStage = "AUTH_CHECK_OK";
    console.log(`[Admin Delete User] [STAGE: AUTH_CHECK_OK] Administrador autenticado: UID ${adminUid} (${adminEmail})`);

    // ----------------------------------------------------
    // STAGE 5 & 6: ADMIN_CHECK_START & ADMIN_CHECK_OK
    // (Validated by requireAdmin middleware)
    // ----------------------------------------------------
    currentStage = "ADMIN_CHECK_OK";
    console.log(`[Admin Delete User] [STAGE: ADMIN_CHECK_OK] Privilégio administrativo validado.`);

    // ----------------------------------------------------
    // STAGE 7: TARGET_UID_VALIDATED
    // ----------------------------------------------------
    currentStage = "TARGET_UID_VALIDATED";
    if (!targetUserId || typeof targetUserId !== "string" || !targetUserId.trim()) {
      console.warn(`[Admin Delete User] [STAGE: TARGET_UID_VALIDATED] targetUserId inválido ou ausente.`, { targetUserId });
      return res.status(400).json({
        success: false,
        error: "ID do usuário a ser excluído não informado ou inválido.",
        code: "INVALID_TARGET_UID",
        stage: "TARGET_UID_VALIDATED",
      });
    }

    const cleanTargetId = targetUserId.trim();

    // Security constraint: Administrator cannot delete their own account
    if (cleanTargetId === adminUid) {
      console.warn(`[Admin Delete User] [STAGE: TARGET_UID_VALIDATED] Tentativa de autoexclusão bloqueada para: ${cleanTargetId}`);
      return res.status(403).json({
        success: false,
        error: "Operação não permitida: um administrador não pode excluir a própria conta.",
        code: "SELF_DELETE_FORBIDDEN",
        stage: "TARGET_UID_VALIDATED",
      });
    }

    console.log(`[Admin Delete User] [STAGE: TARGET_UID_VALIDATED] Target UID validado com sucesso: ${cleanTargetId}`);

    // ----------------------------------------------------
    // STAGE 8 & 9: FIREBASE_ADMIN_INIT_START & FIREBASE_ADMIN_INIT_OK
    // ----------------------------------------------------
    currentStage = "FIREBASE_ADMIN_INIT_START";
    console.log(`[Admin Delete User] [STAGE: FIREBASE_ADMIN_INIT_START] Verificando instâncias do Firebase Admin SDK...`);

    const adminAuth = getAdminAuth();
    const adminFirestore = getAdminFirestore();

    if (!adminAuth) {
      console.error(`[Admin Delete User] [STAGE: FIREBASE_ADMIN_INIT_START] Firebase Admin Auth indisponível.`);
      return res.status(500).json({
        error: "Não foi possível excluir a conta.",
        code: "INTERNAL_ERROR",
        stage: "FIREBASE_ADMIN_INIT_START",
      });
    }

    currentStage = "FIREBASE_ADMIN_INIT_OK";
    console.log(`[Admin Delete User] [STAGE: FIREBASE_ADMIN_INIT_OK] Firebase Admin Auth e Firestore disponíveis.`);

    // 1. Fetch user data from Firestore for audit trail
    let targetEmail = "";
    let targetName = "";
    let targetRole = "ALUNO";
    let targetStatus = "active";

    if (adminFirestore) {
      try {
        const userDoc = await adminFirestore.collection("users").doc(cleanTargetId).get();
        if (userDoc.exists) {
          const uData = userDoc.data();
          targetEmail = uData?.email || "";
          targetName = uData?.name || "";
          targetRole = uData?.role || "ALUNO";
          targetStatus = uData?.status || "active";
          console.log(`[Admin Delete User] Dados no Firestore: ${targetEmail} (${targetName}), Papel: ${targetRole}`);
        } else {
          console.log(`[Admin Delete User] Documento /users/${cleanTargetId} não encontrado no Firestore.`);
        }
      } catch (fReadErr: any) {
        console.warn("[Admin Delete User Warning] Falha ao ler Firestore:", fReadErr?.message);
      }
    }

    // Verify user in Firebase Auth before deletion
    let authUserExists = false;
    try {
      const fbUser = await adminAuth.getUser(cleanTargetId);
      authUserExists = true;
      if (!targetEmail) targetEmail = fbUser.email || "";
      if (!targetName) targetName = fbUser.displayName || targetEmail.split("@")[0] || cleanTargetId;
      console.log(`[Admin Delete User] Usuário localizado no Firebase Auth: ${cleanTargetId} (${targetEmail})`);
    } catch (getUserErr: any) {
      if (getUserErr?.code === "auth/user-not-found") {
        console.warn(`[Admin Delete User] Usuário ${cleanTargetId} não encontrado no Firebase Auth (ou já removido). Continuando limpeza no Firestore.`);
      } else {
        console.warn("[Admin Delete User Warning] Erro na consulta do Firebase Auth:", getUserErr?.message);
      }
    }

    // ----------------------------------------------------
    // STAGE 10: AUTH_DELETE_START
    // ----------------------------------------------------
    currentStage = "AUTH_DELETE_START";
    let authDeleted = false;
    let authErrorCode: string | null = null;
    let authErrorDetail: string | null = null;

    if (authUserExists) {
      console.log(`[Admin Delete User] [STAGE: AUTH_DELETE_START] Excluindo UID ${cleanTargetId} do Firebase Auth...`);
      try {
        await adminAuth.deleteUser(cleanTargetId);
        authDeleted = true;
      } catch (authDelErr: any) {
        authErrorCode = authDelErr?.code || "auth/unknown";
        authErrorDetail = authDelErr?.message || String(authDelErr);
        if (authDelErr?.code === "auth/user-not-found") {
          console.log(`[Admin Delete User] Usuário ${cleanTargetId} já não constava no Firebase Auth.`);
          authDeleted = true;
        } else {
          console.error(`[Admin Delete User Error] [STAGE: AUTH_DELETE_START]:`, {
            code: authErrorCode,
            message: authErrorDetail,
            adminUid,
            adminEmail,
            targetUserId: cleanTargetId,
          });
          return res.status(500).json({
            error: "Não foi possível excluir a conta no Firebase Authentication.",
            code: authErrorCode || "AUTH_DELETE_FAILED",
            stage: "AUTH_DELETE_START",
          });
        }
      }
    } else {
      authDeleted = true;
    }

    // ----------------------------------------------------
    // STAGE 11: AUTH_DELETE_OK
    // ----------------------------------------------------
    currentStage = "AUTH_DELETE_OK";
    console.log(`[Admin Delete User] [STAGE: AUTH_DELETE_OK] Usuário ${cleanTargetId} excluído do Firebase Auth.`);

    // ----------------------------------------------------
    // STAGE 12: FIRESTORE_CLEANUP_START
    // ----------------------------------------------------
    currentStage = "FIRESTORE_CLEANUP_START";
    console.log(`[Admin Delete User] [STAGE: FIRESTORE_CLEANUP_START] Removendo documento /users/${cleanTargetId}...`);

    let firestoreDeleted = false;
    if (adminFirestore) {
      try {
        await adminFirestore.collection("users").doc(cleanTargetId).delete();
        firestoreDeleted = true;
        console.log(`[Admin Delete User] Documento /users/${cleanTargetId} removido do Firestore.`);
      } catch (fsErr: any) {
        console.error(`[Admin Delete User Error] [STAGE: FIRESTORE_CLEANUP_START]:`, {
          code: fsErr?.code,
          message: fsErr?.message,
          targetUserId: cleanTargetId,
        });
      }

      // Cleanup user private notifications
      try {
        const notifsSnap = await adminFirestore
          .collection("notifications")
          .where("userId", "==", cleanTargetId)
          .get();
        if (!notifsSnap.empty) {
          const batch = adminFirestore.batch();
          notifsSnap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
          console.log(`[Admin Delete User] ${notifsSnap.size} notificações privadas removidas.`);
        }
      } catch (cleanNotifErr: any) {
        console.warn("[Admin Delete User Warning] Falha ao limpar notificações privadas:", cleanNotifErr?.message);
      }
    }

    // ----------------------------------------------------
    // STAGE 13: FIRESTORE_CLEANUP_OK OR FAILED
    // ----------------------------------------------------
    if (!firestoreDeleted) {
      currentStage = "FIRESTORE_CLEANUP_FAILED";
      console.error(`[Admin Delete User Inconsistency] [STAGE: FIRESTORE_CLEANUP_FAILED] Auth foi excluído, mas o perfil no Firestore falhou ao ser removido:`, {
        targetUserId: cleanTargetId,
        authDeleted,
        firestoreDeleted,
      });

      if (adminFirestore) {
        try {
          const nowIso = new Date().toISOString();
          const auditLogId = `audit-inc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          await adminFirestore.collection("audit_logs").doc(auditLogId).set({
            id: auditLogId,
            transactionId: `TX-USER-DEL-INC-${Date.now().toString(36).toUpperCase()}`,
            objectId: cleanTargetId,
            objectType: "USER",
            objectTitle: targetName || cleanTargetId,
            action: "ACCOUNT_DELETION_INCONSISTENCY",
            actorId: adminUid,
            actorName: "Administrador TI",
            actorEmail: adminEmail,
            actorRole: "ADMIN",
            timestamp: nowIso,
            fieldChanged: "account_lifecycle",
            oldValue: targetStatus,
            newValue: "AUTH_DELETED_FIRESTORE_PENDING",
            details: `INCONSISTÊNCIA DETECTADA: A conta do usuário '${targetName || cleanTargetId}' (${targetEmail}) foi excluída do Firebase Authentication, mas a remoção do documento /users/${cleanTargetId} no Firestore falhou. Perfil mantido para reconciliação manual ou reintento administrativo.`,
            immutable: true,
          });
        } catch (auditPersistErr: any) {
          console.warn("[Admin Delete User Warning] Falha ao persistir auditoria de inconsistência:", auditPersistErr?.message);
        }
      }

      logAIAudit({
        userId: adminUid,
        userEmail: adminEmail,
        userRole: "ADMIN",
        endpoint: "/api/admin/delete-user",
        action: "ACCOUNT_DELETION_INCONSISTENCY",
        status: "FAILED",
        details: {
          targetUserId: cleanTargetId,
          targetEmail,
          targetName,
          authDeleted: true,
          firestoreDeleted: false,
          error: "FIRESTORE_DELETE_FAILED_AFTER_AUTH",
        },
        ip: getClientIp(req),
      });

      return res.status(500).json({
        success: false,
        partialSuccess: true,
        authDeleted: true,
        firestoreDeleted: false,
        error: "A conta no Firebase Authentication foi excluída, mas ocorreu uma falha ao remover o perfil no Firestore. O registro de perfil permanece no banco de dados para reconciliação.",
        code: "FIRESTORE_DELETE_FAILED_AFTER_AUTH",
        targetUserId: cleanTargetId,
        stage: "FIRESTORE_CLEANUP_FAILED",
      });
    }

    currentStage = "FIRESTORE_CLEANUP_OK";
    console.log(`[Admin Delete User] [STAGE: FIRESTORE_CLEANUP_OK] Limpeza do Firestore concluída.`);

    // ----------------------------------------------------
    // STAGE 14: AUDIT_START
    // ----------------------------------------------------
    currentStage = "AUDIT_START";
    console.log(`[Admin Delete User] [STAGE: AUDIT_START] Gravando registros imutáveis de auditoria...`);

    if (adminFirestore) {
      try {
        const nowIso = new Date().toISOString();
        const auditLogId = `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await adminFirestore.collection("audit_logs").doc(auditLogId).set({
          id: auditLogId,
          transactionId: `TX-USER-DEL-${Date.now().toString(36).toUpperCase()}`,
          objectId: cleanTargetId,
          objectType: "USER",
          objectTitle: targetName || cleanTargetId,
          action: "ACCOUNT_DELETED",
          actorId: adminUid,
          actorName: "Administrador TI",
          actorEmail: adminEmail,
          actorRole: "ADMIN",
          timestamp: nowIso,
          fieldChanged: "account_lifecycle",
          oldValue: targetStatus,
          newValue: "DELETED",
          details: `Conta do usuário '${targetName || cleanTargetId}' (${targetEmail}) excluída permanentemente pelo administrador ${adminEmail}. Removida do Firebase Auth e do Firestore.`,
          immutable: true,
        });

        const actLogId = `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await adminFirestore.collection("activity_logs").doc(actLogId).set({
          id: actLogId,
          adminId: adminUid,
          adminName: "Administrador TI",
          action: "ACCOUNT_DELETED",
          objectId: cleanTargetId,
          objectType: "USER",
          details: `Conta de '${targetName || cleanTargetId}' (${targetEmail}) excluída permanentemente do Firebase Authentication e do Firestore.`,
          timestamp: nowIso,
        });
      } catch (auditPersistErr: any) {
        console.warn("[Admin Delete User Warning] Falha ao persistir auditoria:", auditPersistErr?.message);
      }
    }

    logAIAudit({
      userId: adminUid,
      userEmail: adminEmail,
      userRole: "ADMIN",
      endpoint: "/api/admin/delete-user",
      action: "ACCOUNT_DELETED",
      status: authDeleted || firestoreDeleted ? "SUCCESS" : "FAILED",
      details: {
        targetUserId: cleanTargetId,
        targetEmail,
        targetName,
        authDeleted,
        firestoreDeleted,
      },
      ip: getClientIp(req),
    });

    // ----------------------------------------------------
    // STAGE 15: AUDIT_OK
    // ----------------------------------------------------
    currentStage = "AUDIT_OK";
    console.log(`[Admin Delete User] [STAGE: AUDIT_OK] Auditoria processada com sucesso.`);

    // ----------------------------------------------------
    // STAGE 16: DELETE_USER_SUCCESS
    // ----------------------------------------------------
    currentStage = "DELETE_USER_SUCCESS";
    console.log(`[Admin Delete User] [STAGE: DELETE_USER_SUCCESS] Operação finalizada com sucesso para ${cleanTargetId}.`);

    return res.status(200).json({
      success: true,
      message: `Conta do usuário '${targetName || cleanTargetId}' excluída com sucesso do Firebase Authentication e do Firestore.`,
      targetUserId: cleanTargetId,
      authDeleted,
      firestoreDeleted,
      stage: "DELETE_USER_SUCCESS",
    });
  } catch (fatalErr: any) {
    console.error(`[Admin Delete User Fatal Error] [STAGE: ${currentStage}] Exceção não tratada capturada:`, {
      stage: currentStage,
      errorName: fatalErr?.name || "Error",
      errorMessage: fatalErr?.message || String(fatalErr),
      errorCode: fatalErr?.code || "UNHANDLED_EXCEPTION",
      stack: fatalErr?.stack,
    });

    if (!res.headersSent) {
      return res.status(500).json({
        error: "Não foi possível excluir a conta.",
        code: "INTERNAL_ERROR",
        stage: currentStage,
      });
    }
  }
});

// =================================================================
// Administrative Role Assignment Endpoints (/api/admin/...)
// =================================================================

/**
 * POST /api/admin/assign-role
 * Assigns an institutional or external role to a target user.
 * Protected collection /role_assignments/{targetUid} written exclusively via Firebase Admin SDK.
 */
app.post("/api/admin/assign-role", generalRateLimiter, requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const callerUid = req.authUser!.uid;
  const callerEmail = (req.authUser!.email || "").toLowerCase();
  const isRootAdmin = evaluateRootAdminAuth(req.authUser!).isRoot;

  const { targetUserId, targetRole, reason } = req.body || {};

  if (!targetUserId || typeof targetUserId !== "string" || !targetUserId.trim()) {
    return res.status(400).json({
      success: false,
      error: "targetUserId é obrigatório e deve ser uma string válida.",
      code: "INVALID_TARGET_USER_ID",
    });
  }

  const cleanTargetUid = targetUserId.trim();
  const validRoles = ["ALUNO", "SERVIDOR", "ADMIN", "INTRUSO"];
  if (!targetRole || typeof targetRole !== "string" || !validRoles.includes(targetRole.toUpperCase())) {
    return res.status(400).json({
      success: false,
      error: `targetRole inválido. Valores permitidos: ${validRoles.join(", ")}.`,
      code: "INVALID_ROLE",
    });
  }

  const cleanRole = targetRole.toUpperCase();

  // Self-assignment / self-elevation prevention
  if (cleanTargetUid === callerUid) {
    return res.status(403).json({
      success: false,
      error: "Operação não permitida: um administrador não pode alterar o próprio cargo.",
      code: "SELF_ASSIGNMENT_FORBIDDEN",
    });
  }

  // Only the official Root Admin can grant the ADMIN role
  if (cleanRole === "ADMIN" && !isRootAdmin) {
    return res.status(403).json({
      success: false,
      error: "Apenas o Administrador Raiz oficial (paulocauan39@gmail.com) pode conceder o cargo de ADMIN.",
      code: "ROOT_ADMIN_ONLY_FOR_ADMIN_ROLE",
    });
  }

  const adminAuth = getAdminAuth();
  const adminFirestore = getAdminFirestore();

  if (!adminFirestore) {
    return res.status(500).json({
      success: false,
      error: "Banco de dados administrativo indisponível.",
      code: "FIRESTORE_UNAVAILABLE",
    });
  }

  try {
    const userRef = adminFirestore.collection("users").doc(cleanTargetUid);
    const assignRef = adminFirestore.collection("role_assignments").doc(cleanTargetUid);
    const callerRef = adminFirestore.collection("users").doc(callerUid);
    const auditLogId = `audit-role-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const auditRef = adminFirestore.collection("audit_logs").doc(auditLogId);
    const actLogId = `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const actRef = adminFirestore.collection("activity_logs").doc(actLogId);

    const nowIso = new Date().toISOString();
    const isIntruso = cleanRole === "INTRUSO";
    const approvalStatus = isIntruso ? "PENDENTE" : "APROVADO";
    const active = !isIntruso;

    // Run ACID transaction: reads all documents first, then performs atomic writes
    const txResult = await adminFirestore.runTransaction(async (transaction) => {
      // 1. ALL READS FIRST
      const callerDoc = await transaction.get(callerRef);
      const targetUserDoc = await transaction.get(userRef);
      const targetAssignDoc = await transaction.get(assignRef);

      if (callerDoc.exists) {
        const cData = callerDoc.data();
        if (cData?.status === "banned" || cData?.status === "suspended") {
          const err: any = new Error("Sua conta está suspensa ou desativada.");
          err.code = "ACCOUNT_SUSPENDED";
          err.statusCode = 403;
          throw err;
        }
      }

      let targetEmail = "";
      let targetName = "";
      let previousRole = "INTRUSO";

      if (targetUserDoc.exists) {
        const uData = targetUserDoc.data();
        targetEmail = uData?.email || "";
        targetName = uData?.name || "";
        previousRole = uData?.role || "INTRUSO";
      } else if (targetAssignDoc.exists) {
        const aData = targetAssignDoc.data();
        targetEmail = aData?.targetEmail || "";
        previousRole = aData?.assignedRole || "INTRUSO";
      }

      if (!targetEmail && !targetUserDoc.exists) {
        const err: any = new Error("Usuário alvo não encontrado no sistema.");
        err.code = "USER_NOT_FOUND";
        err.statusCode = 404;
        throw err;
      }

      if (targetEmail.toLowerCase() === ROOT_ADMIN_EMAIL.toLowerCase()) {
        const err: any = new Error("Não é permitido alterar o cargo do Administrador Raiz oficial.");
        err.code = "CANNOT_MODIFY_ROOT_ADMIN";
        err.statusCode = 403;
        throw err;
      }

      if (previousRole === "ADMIN" && !isRootAdmin) {
        const err: any = new Error("Apenas o Administrador Raiz oficial pode alterar o cargo de outro Administrador.");
        err.code = "ROOT_ADMIN_ONLY_TO_MODIFY_ADMIN";
        err.statusCode = 403;
        throw err;
      }

      const callerName = callerDoc.exists ? (callerDoc.data()?.name || callerEmail) : callerEmail;

      const assignmentDoc = {
        id: cleanTargetUid,
        targetUserId: cleanTargetUid,
        targetEmail: targetEmail || "",
        assignedRole: cleanRole,
        approvalStatus,
        assignedByUid: callerUid,
        assignedByEmail: callerEmail,
        assignedByName: callerName,
        assignedAt: nowIso,
        active,
        updatedAt: nowIso,
        reason: reason && typeof reason === "string" ? reason.trim().slice(0, 500) : "Atribuição administrativa de cargo",
        ...(isIntruso ? {
          revokedAt: nowIso,
          revokedByUid: callerUid,
          revokedByEmail: callerEmail,
          revocationReason: reason || "Classificado como INTRUSO",
        } : {}),
      };

      const auditData = {
        id: auditLogId,
        transactionId: `TX-ROLE-${Date.now().toString(36).toUpperCase()}`,
        objectId: cleanTargetUid,
        objectType: "ROLE_ASSIGNMENT",
        objectTitle: targetEmail || cleanTargetUid,
        action: isIntruso ? "ROLE_REVOKED" : "ROLE_ASSIGNED",
        actorId: callerUid,
        actorName: callerName,
        actorEmail: callerEmail,
        actorRole: isRootAdmin ? "ROOT_ADMIN" : "ADMIN",
        timestamp: nowIso,
        fieldChanged: "role",
        oldValue: previousRole,
        newValue: cleanRole,
        details: `Cargo '${cleanRole}' (${approvalStatus}) atribuído a '${targetEmail || cleanTargetUid}' pelo administrador ${callerEmail}. Motivo: ${reason || "N/A"}`,
        immutable: true,
      };

      const actData = {
        id: actLogId,
        adminId: callerUid,
        adminName: callerName,
        action: isIntruso ? "ROLE_REVOKED" : "ROLE_ASSIGNED",
        objectId: cleanTargetUid,
        objectType: "USER",
        details: `Cargo '${cleanRole}' (${approvalStatus}) atribuído ao usuário '${targetEmail || cleanTargetUid}'.`,
        timestamp: nowIso,
      };

      // 2. ALL WRITES INSIDE TRANSACTION
      transaction.set(assignRef, assignmentDoc, { merge: true });
      transaction.set(userRef, {
        role: cleanRole,
        approvalStatus,
        roleAssignedBy: callerEmail,
        roleAssignedAt: nowIso,
        roleAssignmentActive: active,
        updatedAt: nowIso,
      }, { merge: true });
      transaction.set(auditRef, auditData);
      transaction.set(actRef, actData);

      return {
        targetEmail,
        cleanRole,
        approvalStatus,
        assignmentDoc,
        isIntruso,
      };
    });

    // 3. Claims and Refresh Token Revocation (OUTSIDE transaction)
    let claimsSynced = true;
    if (adminAuth) {
      try {
        await adminAuth.setCustomUserClaims(cleanTargetUid, {
          role: txResult.cleanRole,
          approvalStatus: txResult.approvalStatus,
        });
        if (txResult.isIntruso) {
          await adminAuth.revokeRefreshTokens(cleanTargetUid);
        }
      } catch (claimErr: any) {
        claimsSynced = false;
        console.warn("[Admin Assign Role Warning] Não foi possível definir custom claims:", claimErr?.message);
      }
    }

    console.log(`[Admin Role Assignment] Sucesso Transacional: UID=${cleanTargetUid}, Role=${txResult.cleanRole}, ClaimsSynced=${claimsSynced}`);

    return res.status(200).json({
      success: true,
      message: `Cargo '${txResult.cleanRole}' (${txResult.approvalStatus}) atribuído com sucesso ao usuário '${txResult.targetEmail || cleanTargetUid}'.`,
      assignment: txResult.assignmentDoc,
      claimsSynced,
    });
  } catch (err: any) {
    if (err?.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: err.message,
        code: err.code || "ADMIN_ERROR",
      });
    }
    console.error("[Admin Assign Role Error]:", err);
    return res.status(500).json({
      success: false,
      error: "Falha interna ao atribuir cargo ao usuário.",
      code: "ROLE_ASSIGNMENT_ERROR",
      details: err?.message || String(err),
    });
  }
});

/**
 * POST /api/admin/revoke-role
 * Revokes an administrative role assignment and resets target to INTRUSO/PENDENTE.
 */
app.post("/api/admin/revoke-role", generalRateLimiter, requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const callerUid = req.authUser!.uid;
  const callerEmail = (req.authUser!.email || "").toLowerCase();
  const isRootAdmin = evaluateRootAdminAuth(req.authUser!).isRoot;

  const { targetUserId, reason } = req.body || {};

  if (!targetUserId || typeof targetUserId !== "string" || !targetUserId.trim()) {
    return res.status(400).json({
      success: false,
      error: "targetUserId é obrigatório e deve ser uma string válida.",
      code: "INVALID_TARGET_USER_ID",
    });
  }

  const cleanTargetUid = targetUserId.trim();

  // Self-revocation prevention
  if (cleanTargetUid === callerUid) {
    return res.status(403).json({
      success: false,
      error: "Operação não permitida: um administrador não pode revogar o próprio cargo.",
      code: "SELF_REVOCATION_FORBIDDEN",
    });
  }

  const adminAuth = getAdminAuth();
  const adminFirestore = getAdminFirestore();

  if (!adminFirestore) {
    return res.status(500).json({
      success: false,
      error: "Banco de dados administrativo indisponível.",
      code: "FIRESTORE_UNAVAILABLE",
    });
  }

  try {
    const userRef = adminFirestore.collection("users").doc(cleanTargetUid);
    const assignRef = adminFirestore.collection("role_assignments").doc(cleanTargetUid);
    const callerRef = adminFirestore.collection("users").doc(callerUid);
    const auditLogId = `audit-revoke-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const auditRef = adminFirestore.collection("audit_logs").doc(auditLogId);
    const actLogId = `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const actRef = adminFirestore.collection("activity_logs").doc(actLogId);

    const nowIso = new Date().toISOString();

    const txResult = await adminFirestore.runTransaction(async (transaction) => {
      // 1. ALL READS FIRST
      const callerDoc = await transaction.get(callerRef);
      const targetUserDoc = await transaction.get(userRef);
      const targetAssignDoc = await transaction.get(assignRef);

      if (callerDoc.exists) {
        const cData = callerDoc.data();
        if (cData?.status === "banned" || cData?.status === "suspended") {
          const err: any = new Error("Sua conta está suspensa ou desativada.");
          err.code = "ACCOUNT_SUSPENDED";
          err.statusCode = 403;
          throw err;
        }
      }

      let targetEmail = "";
      let previousRole = "UNKNOWN";

      if (targetUserDoc.exists) {
        const uData = targetUserDoc.data();
        targetEmail = uData?.email || "";
        previousRole = uData?.role || "UNKNOWN";
      } else if (targetAssignDoc.exists) {
        const aData = targetAssignDoc.data();
        targetEmail = aData?.targetEmail || "";
        previousRole = aData?.assignedRole || "UNKNOWN";
      }

      if (targetEmail.toLowerCase() === ROOT_ADMIN_EMAIL.toLowerCase()) {
        const err: any = new Error("Não é permitido revogar o cargo do Administrador Raiz oficial.");
        err.code = "CANNOT_REVOKE_ROOT_ADMIN";
        err.statusCode = 403;
        throw err;
      }

      if (previousRole === "ADMIN" && !isRootAdmin) {
        const err: any = new Error("Apenas o Administrador Raiz oficial pode revogar o cargo de outro Administrador.");
        err.code = "ROOT_ADMIN_ONLY_TO_REVOKE_ADMIN";
        err.statusCode = 403;
        throw err;
      }

      const callerName = callerDoc.exists ? (callerDoc.data()?.name || callerEmail) : callerEmail;
      const revocationReason = reason && typeof reason === "string" ? reason.trim().slice(0, 500) : "Revogação administrativa de cargo";

      // 2. ALL WRITES INSIDE TRANSACTION
      transaction.set(assignRef, {
        id: cleanTargetUid,
        targetUserId: cleanTargetUid,
        active: false,
        revokedAt: nowIso,
        revokedByUid: callerUid,
        revokedByEmail: callerEmail,
        revocationReason,
        updatedAt: nowIso,
      }, { merge: true });

      transaction.set(userRef, {
        role: "INTRUSO",
        approvalStatus: "PENDENTE",
        roleAssignmentActive: false,
        updatedAt: nowIso,
      }, { merge: true });

      transaction.set(auditRef, {
        id: auditLogId,
        transactionId: `TX-ROLE-REVOKE-${Date.now().toString(36).toUpperCase()}`,
        objectId: cleanTargetUid,
        objectType: "ROLE_ASSIGNMENT",
        objectTitle: targetEmail || cleanTargetUid,
        action: "ROLE_REVOKED",
        actorId: callerUid,
        actorName: callerName,
        actorEmail: callerEmail,
        actorRole: isRootAdmin ? "ROOT_ADMIN" : "ADMIN",
        timestamp: nowIso,
        fieldChanged: "role",
        oldValue: previousRole,
        newValue: "INTRUSO",
        details: `Atribuição de cargo do usuário '${targetEmail || cleanTargetUid}' revogada pelo administrador ${callerEmail}. Motivo: ${reason || "N/A"}`,
        immutable: true,
      });

      transaction.set(actRef, {
        id: actLogId,
        adminId: callerUid,
        adminName: callerName,
        action: "ROLE_REVOKED",
        objectId: cleanTargetUid,
        objectType: "USER",
        details: `Cargo do usuário '${targetEmail || cleanTargetUid}' revogado pelo administrador ${callerEmail}.`,
        timestamp: nowIso,
      });

      return { targetEmail, previousRole };
    });

    // 3. Claims and Refresh Token Revocation (OUTSIDE transaction)
    let claimsSynced = true;
    if (adminAuth) {
      try {
        await adminAuth.setCustomUserClaims(cleanTargetUid, {
          role: "INTRUSO",
          approvalStatus: "PENDENTE",
        });
      } catch (claimErr: any) {
        claimsSynced = false;
        console.warn("[Admin Revoke Role Warning] Falha ao atualizar claims:", claimErr?.message);
      }
      try {
        await adminAuth.revokeRefreshTokens(cleanTargetUid);
      } catch (revokeErr: any) {
        console.warn("[Admin Revoke Role Warning] Falha ao revogar refresh tokens:", revokeErr?.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Atribuição de cargo revogada com sucesso para '${txResult.targetEmail || cleanTargetUid}'.`,
      claimsSynced,
    });
  } catch (err: any) {
    if (err?.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: err.message,
        code: err.code || "ADMIN_ERROR",
      });
    }
    console.error("[Admin Revoke Role Error]:", err);
    return res.status(500).json({
      success: false,
      error: "Falha interna ao revogar atribuição de cargo.",
      code: "ROLE_REVOCATION_ERROR",
      details: err?.message || String(err),
    });
  }
});

/**
 * GET /api/admin/role-assignments
 * Lists all registered role assignments from /role_assignments.
 */
app.get("/api/admin/role-assignments", generalRateLimiter, requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const adminFirestore = getAdminFirestore();
  if (!adminFirestore) {
    return res.status(500).json({
      success: false,
      error: "Banco de dados administrativo indisponível.",
    });
  }

  try {
    const snapshot = await adminFirestore.collection("role_assignments").get();
    const assignments = snapshot.docs.map((doc) => doc.data());
    return res.status(200).json({
      success: true,
      count: assignments.length,
      assignments,
    });
  } catch (err: any) {
    console.error("[Admin Get Role Assignments Error]:", err);
    return res.status(500).json({
      success: false,
      error: "Falha ao consultar atribuições de cargos.",
      details: err?.message || String(err),
    });
  }
});

// API Health Check & System Monitoring
app.get(["/api/health", "/health"], (_req, res) => {
  try {
    const memUsage = process.memoryUsage ? Math.round(process.memoryUsage().heapUsed / 1024 / 1024) : 0;
    const uptimeSec = Math.floor((Date.now() - serverStartTime) / 1000);
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptimeSeconds: uptimeSec >= 0 ? uptimeSec : 0,
      geminiAvailable: !!process.env.GEMINI_API_KEY,
      memoryUsageMB: memUsage,
      isVercel: Boolean(process.env.VERCEL),
    });
  } catch (err: any) {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptimeSeconds: 0,
      geminiAvailable: !!process.env.GEMINI_API_KEY,
      memoryUsageMB: 0,
    });
  }
});

// Analytics Tracking Endpoint (Google Analytics + Firebase Backend Receiver)
app.post(["/api/analytics/track", "/analytics/track"], (req: Request, res: Response) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      console.warn("[Analytics Track Warning] Payload inválido recebido em /api/analytics/track", {
        body: req.body,
        ip: getClientIp(req),
      });
      return res.status(400).json({ success: false, error: "Payload JSON inválido." });
    }

    const { eventName, params, timestamp, url } = req.body;
    if (!eventName || typeof eventName !== "string" || eventName.trim().length === 0 || eventName.length > 100) {
      console.warn("[Analytics Track Warning] Nome do evento inválido ou ausente:", {
        eventName,
        ip: getClientIp(req),
      });
      return res.status(400).json({ success: false, error: "Nome do evento ('eventName') inválido ou ausente." });
    }

    const sanitizedEventName = eventName.trim().replace(/[^a-zA-Z0-9_-]/g, "");
    if (!sanitizedEventName) {
      return res.status(400).json({ success: false, error: "Nome do evento contém apenas caracteres inválidos." });
    }

    const safeParams = params && typeof params === "object" && !Array.isArray(params) ? params : {};
    const safeTimestamp =
      timestamp && typeof timestamp === "string" && !isNaN(Date.parse(timestamp))
        ? timestamp
        : new Date().toISOString();
    const safeUrl = typeof url === "string" ? url.substring(0, 300) : "";

    const eventRecord = {
      eventName: sanitizedEventName,
      params: safeParams,
      timestamp: safeTimestamp,
      url: safeUrl,
      ip: getClientIp(req),
      userId: req.authUser?.uid || "ANONYMOUS",
      userEmail: req.authUser?.email,
    };

    analyticsEvents.unshift(eventRecord);
    if (analyticsEvents.length > 500) {
      analyticsEvents.pop();
    }

    eventCounters[sanitizedEventName] = (eventCounters[sanitizedEventName] || 0) + 1;

    return res.status(200).json({ success: true, logged: eventRecord });
  } catch (err: any) {
    console.error("[Analytics Track Error] Falha ao processar telemetria:", {
      message: err?.message || String(err),
      stack: err?.stack,
      ip: getClientIp(req),
      timestamp: new Date().toISOString(),
    });
    return res.status(200).json({
      success: true,
      warning: "Telemetria processada em modo fallback de segurança.",
    });
  }
});

// Analytics Dashboard Metrics Endpoint
app.get(["/api/analytics/metrics", "/analytics/metrics"], async (req: Request, res: Response) => {
  try {
    const memoryHeap = process.memoryUsage ? Math.round(process.memoryUsage().heapUsed / 1024 / 1024) : 0;
    const uptimeSec = Math.floor((Date.now() - (serverStartTime || Date.now())) / 1000);

    const basePublicMetrics = {
      success: true,
      scope: "PUBLIC",
      totalServerRequests: typeof totalServerRequests === "number" ? totalServerRequests : 0,
      uptimeSeconds: uptimeSec >= 0 ? uptimeSec : 0,
      systemMemoryMB: memoryHeap,
      serverTimestamp: new Date().toISOString(),
      environment: {
        isVercel: Boolean(process.env.VERCEL),
        nodeVersion: process.version,
      },
    };

    const authHeader = req.headers?.authorization || req.headers?.Authorization;

    // If Authorization header is provided, strictly enforce authentication and Admin RBAC
    if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      if (!req.authUser) {
        return res.status(401).json({
          success: false,
          error: "Token de autenticação inválido ou expirado. Assinatura não verificada.",
          code: "AUTH_INVALID_TOKEN",
        });
      }

      if (!req.authUser.isAdmin) {
        return res.status(403).json({
          success: false,
          error: "Acesso negado. Métricas administrativas e logs de auditoria de IA são restritos a administradores autorizados.",
          code: "FORBIDDEN_NOT_ADMIN",
        });
      }

      // Authenticated Admin Response
      return res.status(200).json({
        ...basePublicMetrics,
        scope: "ADMIN",
        totalAnalyticsEvents: Array.isArray(analyticsEvents) ? analyticsEvents.length : 0,
        totalAIAuditRecords: Array.isArray(aiAuditLogs) ? aiAuditLogs.length : 0,
        eventCounters: eventCounters && typeof eventCounters === "object" ? eventCounters : {},
        recentEvents: Array.isArray(analyticsEvents) ? analyticsEvents.slice(0, 50) : [],
        recentAIAudits: Array.isArray(aiAuditLogs) ? aiAuditLogs.slice(0, 20) : [],
      });
    }

    // Unauthenticated public operational telemetry (safe aggregates only, no audit logs)
    return res.status(200).json(basePublicMetrics);
  } catch (err: any) {
    console.error("[Analytics Metrics Error] Falha ao compilar métricas do sistema:", {
      message: err?.message || String(err),
      stack: err?.stack,
      ip: getClientIp(req),
      timestamp: new Date().toISOString(),
    });
    return res.status(500).json({
      success: false,
      error: "Erro ao gerar métricas do sistema.",
      details: process.env.NODE_ENV !== "production" ? err?.message : undefined,
    });
  }
});

// AI Endpoint: Extrair detalhes de um objeto com base no relato ou imagem
app.post(["/api/ai/analyze-object", "/ai/analyze-object"], requireAuth, aiRateLimiter, async (req, res) => {
  const userId = req.authUser!.uid;
  const userEmail = req.authUser?.email;
  const userRole = req.authUser?.role;

  try {
    const { promptText, imageBase64 } = req.body;
    const cleanPrompt = typeof promptText === "string" ? promptText.substring(0, 10000) : "";
    const ai = getGenAIClient();

    if (!ai) {
      logAIAudit({
        userId,
        userEmail,
        userRole,
        endpoint: "/api/ai/analyze-object",
        action: "EXTRACT_OBJECT_DETAILS",
        status: "FAILED",
        modelUsed: "gemini-3.8-flash",
        promptSnippet: cleanPrompt.substring(0, 100),
        details: { error: "GEMINI_API_KEY não configurada no servidor." },
        ip: getClientIp(req),
      });

      return res.status(503).json({
        success: false,
        error: "A API do Google Gemini não está configurada no ambiente do servidor.",
      });
    }

    const systemInstruction = `Você é um assistente especialista de Inteligência Artificial do sistema Achados e Perdidos do Instituto Federal do Paraná (IFPR) - Campus Ivaiporã.
Sua missão é analisar o relato e/ou imagem do objeto no campus Ivaiporã e extrair com máxima precisão os seguintes dados estruturados em JSON:
1. title: Título claro, objetivo e conciso para o objeto (ex: "Garrafa Térmica Kouda Verde 750ml", "Calculadora Casio fx-82MS Prata", "Chaveiro com 3 chaves").
2. category: Categoria obrigatória dentre as válidas: "Eletrônicos", "Documentos & Cartões", "Roupas & Calçados", "Chaves", "Material Escolar & Livros", "Acessórios & Bijuterias", "Garrafas & Marmitas", "Guarda-chuvas", "Outros".
3. color: Cor principal ou combinação de cores do objeto (ex: "Preto", "Azul Marinho", "Prata e Preto", "Verde").
4. brand: Marca ou fabricante identificado (ex: "Casio", "Nike", "JBL", "Dell", "Tupperware", "Kouda", "IFPR" ou "Não identificada").
5. location: Local específico do campus IFPR Ivaiporã identificado no relato (ex: "Refeitório", "Biblioteca", "Bloco A", "Laboratório de Informática B2", "Quadra Poliesportiva", "Pátio Central", "Secretaria Acadêmica", "Entrada Principal"). Se não mencionado, informe "Campus IFPR Ivaiporã".
6. description: Descrição organizada em tópicos estruturados, formatada com clareza contendo o resumo dos atributos e estado de conservação no formato:
• Categoria: [Categoria]
• Cor: [Cor]
• Marca: [Marca]
• Local no Campus: [Local]
• Detalhes e Características: [Detalhamento do objeto e marcas de uso ou conservação]

A resposta DEVE ser estritamente no formato JSON definido no schema.`;

    const contents: any[] = [];
    if (imageBase64 && typeof imageBase64 === "string" && imageBase64.length < 8000000) {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      contents.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: cleanBase64,
        },
      });
    }
    
    contents.push({
      text: cleanPrompt 
        ? `Analise este relato/objeto no IFPR: "${cleanPrompt}"`
        : "Analise esta foto de objeto encontrado/perdido no IFPR e descreva com precisão.",
    });

    const chosenModel = imageBase64 ? "gemini-3.7-flash" : "gemini-3.8-flash";

    const response = await ai.models.generateContent({
      model: chosenModel,
      contents: contents.length === 1 ? contents[0] : { parts: contents },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: "Título curto e claro para o objeto (ex: Garrafa Kouda Verde 750ml)",
            },
            category: {
              type: Type.STRING,
              description: "Categoria mais apropriada dentre as opções válidas",
            },
            color: {
              type: Type.STRING,
              description: "Cor principal ou combinação de cores do objeto",
            },
            brand: {
              type: Type.STRING,
              description: "Marca ou fabricante (ex: Casio, Nike, JBL, Tupperware, IFPR)",
            },
            location: {
              type: Type.STRING,
              description: "Local mencionado no campus (ex: Refeitório, Biblioteca, Bloco A, Quadra)",
            },
            description: {
              type: Type.STRING,
              description: "Descrição organizada com marcadores contendo categoria, cor, marca, local e detalhes",
            },
          },
          required: ["title", "category", "color", "brand", "location", "description"],
        },
      },
    });

    const responseText = response.text || "{}";
    const extractedData = JSON.parse(responseText);

    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/ai/analyze-object",
      action: "EXTRACT_OBJECT_DETAILS",
      status: "SUCCESS",
      modelUsed: chosenModel,
      promptSnippet: cleanPrompt.substring(0, 100),
      details: {
        hasImage: !!imageBase64,
        extractedTitle: extractedData?.title,
        extractedCategory: extractedData?.category,
      },
      ip: getClientIp(req),
    });

    return res.json({
      success: true,
      extracted: extractedData,
    });
  } catch (error: any) {
    console.error("Erro na rota /api/ai/analyze-object:", error);
    const classified = classifyGeminiError(error);

    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/ai/analyze-object",
      action: "EXTRACT_OBJECT_DETAILS",
      status: "FAILED",
      details: { error: error.message, errorCode: classified.errorCode },
      ip: getClientIp(req),
    });

    return res.status(classified.statusCode).json({
      success: false,
      error: classified.message,
      code: classified.errorCode,
    });
  }
});

// Dedicated Vision & Image Understanding Endpoint using gemini-3.1-pro-preview
app.post(["/api/ai/analyze-image", "/ai/analyze-image"], requireAuth, aiRateLimiter, async (req, res) => {
  const userId = req.authUser!.uid;
  const userEmail = req.authUser?.email;
  const userRole = req.authUser?.role;

  try {
    const { imageBase64, customContext } = req.body;
    const cleanContext = typeof customContext === "string" ? customContext.substring(0, 5000) : "";
    const ai = getGenAIClient();

    if (!imageBase64 || typeof imageBase64 !== "string" || imageBase64.length > 8000000) {
      return res.status(400).json({ error: "Imagem em formato Base64 não fornecida ou excede o tamanho limite permitido." });
    }

    if (!ai) {
      logAIAudit({
        userId,
        userEmail,
        userRole,
        endpoint: "/api/ai/analyze-image",
        action: "VISION_IMAGE_ANALYSIS",
        status: "FAILED",
        modelUsed: "gemini-3.7-flash",
        details: { error: "GEMINI_API_KEY não configurada no servidor." },
        ip: getClientIp(req),
      });

      return res.status(503).json({
        success: false,
        error: "A API do Google Gemini não está configurada no ambiente do servidor.",
      });
    }

    const mimeMatch = imageBase64.match(/^data:(image\/[a-zA-Z0-9.+_-]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9.+_-]+;base64,/, "");

    const systemInstruction = `Você é um motor de Inteligência Artificial de Visão Computacional de última geração alimentado pelo Gemini no IFPR Campus Ivaiporã.
Sua tarefa é analisar minuciosamente uma imagem enviada pelo usuário referente a um pertencente achado ou perdido no campus.
Examine atentamente:
1. Objeto principal, formato, utilidade e marca visualizável.
2. Cores predominantes e detalhes cromáticos.
3. Marcas de uso, adesivos, gravuras, danos, números de série ou inscrições (útil como pista de verificação).
4. Sugestão de Pergunta/Pista Secreta de segurança para comprovar propriedade do objeto sem revelar aos impostores.
5. Categoria oficial ("Eletrônicos", "Documentos & Cartões", "Roupas & Calçados", "Chaves", "Material Escolar & Livros", "Acessórios & Bijuterias", "Garrafas & Marmitas", "Guarda-chuvas", "Outros").
Retorne um JSON rigorosamente estruturado conforme o schema.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          },
          {
            text: cleanContext
              ? `Contexto adicional do usuário: "${cleanContext}". Realize a análise completa da imagem.`
              : "Analise esta fotografia de objeto com máxima precisão e descreva todos os aspectos para o cadastro no IFPR Ivaiporã.",
          },
        ],
      },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: "Título resumido e preciso do objeto (ex: Relógio Digital Casio Vintage Prata)",
            },
            category: {
              type: Type.STRING,
              description: "Uma das categorias oficiais do IFPR",
            },
            color: {
              type: Type.STRING,
              description: "Cores detalhadas identificadas na foto",
            },
            brand: {
              type: Type.STRING,
              description: "Marca ou fabricante identificado na foto, ou 'Não identificada'",
            },
            condition: {
              type: Type.STRING,
              description: "Estado aparente de conservação (ex: Novo, Usado com riscos leves, etc)",
            },
            distinctiveFeatures: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Lista de marcações, adesivos, riscos, chaveiros ou traços únicos visíveis",
            },
            suggestedSecretHint: {
              type: Type.STRING,
              description: "Pista ou detalhe não óbvio para confirmação de propriedade (ex: adesivo colado no fundo)",
            },
            description: {
              type: Type.STRING,
              description: "Descrição visual rica e profissional pronta para o cadastro de achados e perdidos",
            },
          },
          required: [
            "title",
            "category",
            "color",
            "brand",
            "condition",
            "distinctiveFeatures",
            "suggestedSecretHint",
            "description",
          ],
        },
      },
    });

    const rawText = response.text || "{}";
    const cleanJson = rawText.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
    const analysis = JSON.parse(cleanJson || "{}");

    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/ai/analyze-image",
      action: "VISION_IMAGE_ANALYSIS",
      status: "SUCCESS",
      modelUsed: "gemini-3.7-flash",
      details: {
        detectedTitle: analysis?.title,
        detectedCategory: analysis?.category,
        brand: analysis?.brand,
      },
      ip: getClientIp(req),
    });

    return res.json({
      success: true,
      analysis,
    });
  } catch (err: any) {
    console.error("Erro no endpoint /api/ai/analyze-image:", err);
    const classified = classifyGeminiError(err);

    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/ai/analyze-image",
      action: "VISION_IMAGE_ANALYSIS",
      status: "FAILED",
      modelUsed: "gemini-3.7-flash",
      details: { error: err.message, errorCode: classified.errorCode },
      ip: getClientIp(req),
    });

    return res.status(classified.statusCode).json({
      success: false,
      error: classified.message,
      code: classified.errorCode,
    });
  }
});

// AI Endpoint: Análise e sugestão inteligente de categoria com base em título e descrição
app.post(["/api/ai/suggest-category", "/ai/suggest-category"], requireAuth, aiRateLimiter, async (req, res) => {
  const userId = req.authUser!.uid;
  const userEmail = req.authUser?.email;
  const userRole = req.authUser?.role;

  try {
    const { title, description } = req.body;
    const cleanTitle = typeof title === "string" ? title.trim().substring(0, 300) : "";
    const cleanDescription = typeof description === "string" ? description.trim().substring(0, 2000) : "";
    const ai = getGenAIClient();

    if (!cleanTitle && !cleanDescription) {
      return res.status(400).json({
        success: false,
        error: "Título ou descrição necessários para sugerir a categoria.",
      });
    }

    if (!ai) {
      logAIAudit({
        userId,
        userEmail,
        userRole,
        endpoint: "/api/ai/suggest-category",
        action: "SUGGEST_CATEGORY",
        status: "FAILED",
        modelUsed: "gemini-3.1-flash-lite",
        promptSnippet: `Título: ${cleanTitle} | Desc: ${cleanDescription.substring(0, 100)}`,
        details: { error: "GEMINI_API_KEY não configurada no servidor." },
        ip: getClientIp(req),
      });

      return res.status(503).json({
        success: false,
        error: "A API do Google Gemini não está configurada no ambiente do servidor.",
      });
    }

    const systemInstruction = `Você é o classificador especialista de categorias do sistema Achados e Perdidos do IFPR Campus Ivaiporã.
Sua única responsabilidade é analisar o título e/ou descrição de um objeto cadastrado e indicar a categoria mais provável dentre as opções estritas permitidas pelo sistema.

Categorias permitidas:
- "Eletrônicos" (celulares, fones, calculadoras, notebooks, carregadores, pendrives, cabos, smartwatches, caixas de som)
- "Documentos & Cartões" (RG, CPF, CNH, cartão de estudante, carteirinha de transporte, crachás, cartões bancários, certidões)
- "Roupas & Calçados" (casacos, blusas, uniformes, camisetas, calças, tênis, sapatos, chinelos, bonés, toucas, meias)
- "Chaves" (chaves de casa, chaves de moto/carro, chaveiros, tags de acesso, cadeados)
- "Material Escolar & Livros" (cadernos, estojos, livros didáticos, apostilas, canetas, réguas, pastas, mochilas escolares)
- "Acessórios & Bijuterias" (óculos de grau/sol, relógios de pulso comuns, anéis, colares, pulseiras, brincos, carteiras, bolsas)
- "Garrafas & Marmitas" (garrafas térmicas, copos Stanley/Kouda, squeezes, potes plásticos, marmitas, talheres)
- "Guarda-chuvas" (sombrinhas, guarda-chuvas, capas de chuva)
- "Outros" (objetos esportivos diversos, brinquedos, ferramentas, itens não contemplados)

Calcule:
1. suggestedCategory: uma das 9 categorias acima exatamente como grafada.
2. confidenceScore: pontuação de 0 a 100 refletindo o quão certo você está (ex: 95 para "Garrafa Kouda", 90 para "Calculadora Casio", 60 para descrições vagas).
3. confidenceLevel: "HIGH" se score >= 85, "MEDIUM" se score entre 65 e 84, "LOW" se score < 65.
4. reasoning: uma frase curta e objetiva em português explicando o motivo da classificação.
5. autoFillRecommended: booleano verdadeiro se confidenceLevel for "HIGH" (score >= 85).`;

    const promptText = `Título do Objeto: "${cleanTitle}"\nDescrição do Objeto: "${cleanDescription}"\nAnalise e classifique na categoria correta.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: promptText,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestedCategory: {
              type: Type.STRING,
              description: "Categoria sugerida exatamente dentre as 9 permitidas",
            },
            confidenceScore: {
              type: Type.INTEGER,
              description: "Score de 0 a 100",
            },
            confidenceLevel: {
              type: Type.STRING,
              description: "HIGH, MEDIUM ou LOW",
            },
            reasoning: {
              type: Type.STRING,
              description: "Motivo sucinto da sugestão",
            },
            autoFillRecommended: {
              type: Type.BOOLEAN,
              description: "Verdadeiro se confiança for alta (>= 85)",
            },
          },
          required: ["suggestedCategory", "confidenceScore", "confidenceLevel", "reasoning", "autoFillRecommended"],
        },
      },
    });

    const parsedResult = JSON.parse(response.text || "{}");

    // Validação estrita contra a lista oficial
    const validCategories = [
      "Eletrônicos",
      "Documentos & Cartões",
      "Roupas & Calçados",
      "Chaves",
      "Material Escolar & Livros",
      "Acessórios & Bijuterias",
      "Garrafas & Marmitas",
      "Guarda-chuvas",
      "Outros",
    ];

    if (!validCategories.includes(parsedResult.suggestedCategory)) {
      parsedResult.suggestedCategory = "Outros";
      parsedResult.confidenceScore = Math.min(parsedResult.confidenceScore || 50, 50);
      parsedResult.confidenceLevel = "LOW";
      parsedResult.autoFillRecommended = false;
    }

    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/ai/suggest-category",
      action: "SUGGEST_CATEGORY",
      status: "SUCCESS",
      modelUsed: "gemini-3.1-flash-lite",
      promptSnippet: `Título: ${cleanTitle} | Desc: ${cleanDescription.substring(0, 100)}`,
      details: {
        suggestedCategory: parsedResult.suggestedCategory,
        confidenceScore: parsedResult.confidenceScore,
        confidenceLevel: parsedResult.confidenceLevel,
        autoFillRecommended: parsedResult.autoFillRecommended,
      },
      ip: getClientIp(req),
    });

    return res.json({
      success: true,
      ...parsedResult,
    });
  } catch (err: any) {
    console.error("Erro no endpoint /api/ai/suggest-category:", err);
    const classified = classifyGeminiError(err);

    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/ai/suggest-category",
      action: "SUGGEST_CATEGORY",
      status: "FAILED",
      modelUsed: "gemini-3.1-flash-lite",
      details: { error: err.message, errorCode: classified.errorCode },
      ip: getClientIp(req),
    });

    return res.status(classified.statusCode).json({
      success: false,
      error: classified.message,
      code: classified.errorCode,
    });
  }
});

// AI Endpoint Fast Query Expansion / Quick Auto-Tagging using gemini-3.1-flash-lite
app.post(["/api/ai/quick-tag", "/ai/quick-tag"], requireAuth, aiRateLimiter, async (req, res) => {
  const userId = req.authUser!.uid;
  const userEmail = req.authUser?.email;
  const userRole = req.authUser?.role;

  try {
    const { text } = req.body;
    const cleanText = typeof text === "string" ? text.substring(0, 500) : "";
    const ai = getGenAIClient();

    if (!cleanText) {
      return res.status(400).json({ error: "Texto para geração de tags não fornecido." });
    }

    if (!ai) {
      logAIAudit({
        userId,
        userEmail,
        userRole,
        endpoint: "/api/ai/quick-tag",
        action: "QUICK_AUTO_TAG",
        status: "FAILED",
        modelUsed: "gemini-3.1-flash-lite",
        promptSnippet: cleanText.substring(0, 100),
        details: { error: "GEMINI_API_KEY não configurada no servidor." },
        ip: getClientIp(req),
      });

      return res.status(503).json({
        success: false,
        error: "A API do Google Gemini não está configurada no ambiente do servidor.",
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: `Gere 3 a 5 tags curtas e indique a categoria ideal para o texto: "${cleanText}". Categorias: Eletrônicos, Documentos & Cartões, Roupas & Calçados, Chaves, Material Escolar & Livros, Acessórios & Bijuterias, Garrafas & Marmitas, Guarda-chuvas, Outros.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            suggestedCategory: { type: Type.STRING },
          },
          required: ["tags", "suggestedCategory"],
        },
      },
    });

    const parsedResult = JSON.parse(response.text || "{}");

    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/ai/quick-tag",
      action: "QUICK_AUTO_TAG",
      status: "SUCCESS",
      modelUsed: "gemini-3.1-flash-lite",
      promptSnippet: cleanText.substring(0, 100),
      details: { suggestedCategory: parsedResult.suggestedCategory, tagCount: parsedResult.tags?.length },
      ip: getClientIp(req),
    });

    return res.json(parsedResult);
  } catch (err: any) {
    console.error("Erro no endpoint /api/ai/quick-tag:", err);
    const classified = classifyGeminiError(err);

    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/ai/quick-tag",
      action: "QUICK_AUTO_TAG",
      status: "FAILED",
      modelUsed: "gemini-3.1-flash-lite",
      details: { error: err.message, errorCode: classified.errorCode },
      ip: getClientIp(req),
    });

    return res.status(classified.statusCode).json({
      success: false,
      error: classified.message,
      code: classified.errorCode,
    });
  }
});

// AI Endpoint: Comparação de similaridade textual e semântica entre novo item e existentes
app.post(["/api/ai/match-similarity", "/ai/match-similarity"], requireAuth, aiRateLimiter, async (req, res) => {
  const userId = req.authUser!.uid;
  const userEmail = req.authUser?.email;
  const userRole = req.authUser?.role;

  try {
    const { newItem, candidateItems } = req.body;
    if (!newItem || typeof newItem !== "object") {
      return res.status(400).json({ error: "Item de referência inválido." });
    }

    const safeCandidates = Array.isArray(candidateItems) ? candidateItems.slice(0, 50) : [];
    const ai = getGenAIClient();

    if (safeCandidates.length === 0) {
      return res.json({ matches: [] });
    }

    if (!ai) {
      logAIAudit({
        userId,
        userEmail,
        userRole,
        endpoint: "/api/ai/match-similarity",
        action: "MATCH_SIMILARITY",
        status: "FAILED",
        modelUsed: "gemini-3.8-flash",
        details: { error: "GEMINI_API_KEY não configurada no servidor." },
        ip: getClientIp(req),
      });

      return res.status(503).json({
        success: false,
        error: "A API do Google Gemini não está configurada no ambiente do servidor.",
      });
    }

    const prompt = `Você é um algoritmo de correspondência inteligente do Achados & Perdidos IFPR Campus Ivaiporã.
Compare o novo objeto cadastrado:
- Título: ${String(newItem.title || "").substring(0, 100)}
- Tipo: ${newItem.type}
- Categoria: ${newItem.category}
- Cor: ${newItem.color}
- Marca: ${newItem.brand}
- Local: ${newItem.location}
- Descrição: ${String(newItem.description || "").substring(0, 500)}

E compare com esta lista de objetos pré-cadastrados:
${JSON.stringify(safeCandidates.map((c: any) => ({
  id: c.id,
  title: String(c.title || "").substring(0, 100),
  category: c.category,
  color: c.color,
  brand: c.brand,
  location: c.location,
  description: String(c.description || "").substring(0, 200)
})), null, 2)}

Avalie a probabilidade de algum desses objetos pré-cadastrados ser O MESMO objeto ou a contraparte.
Calcule uma pontuação de similaridade de 0 a 100 para cada um. Retorne apenas os itens com pontuação >= 50.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            matches: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  itemId: { type: Type.STRING },
                  matchScore: { type: Type.INTEGER, description: "Score de 0 a 100" },
                  reason: { type: Type.STRING, description: "Explicação em português da semelhança" },
                  matchedFeatures: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Lista de características que bateram (ex: Categoria, Cor, Marca)",
                  },
                },
                required: ["itemId", "matchScore", "reason", "matchedFeatures"],
              },
            },
          },
          required: ["matches"],
        },
      },
    });

    const rawText = response.text || '{"matches":[]}';
    const cleanJson = rawText.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleanJson || '{"matches":[]}');

    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/ai/match-similarity",
      action: "MATCH_SIMILARITY",
      status: "SUCCESS",
      modelUsed: "gemini-3.8-flash",
      details: {
        referenceTitle: newItem.title,
        candidatesCount: safeCandidates.length,
        matchedCount: parsed.matches?.length || 0,
      },
      ip: getClientIp(req),
    });

    return res.json(parsed);
  } catch (err: any) {
    console.error("Erro no endpoint /api/ai/match-similarity:", err);
    const classified = classifyGeminiError(err);

    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/ai/match-similarity",
      action: "MATCH_SIMILARITY",
      status: "FAILED",
      modelUsed: "gemini-3.8-flash",
      details: { error: err.message, errorCode: classified.errorCode },
      ip: getClientIp(req),
    });

    return res.status(classified.statusCode).json({
      success: false,
      error: classified.message,
      code: classified.errorCode,
    });
  }
});

// Firebase Cloud Messaging Push Notification Dispatch Endpoint
app.post(["/api/fcm/send-match-alert", "/fcm/send-match-alert"], requireAuth, generalRateLimiter, async (req, res) => {
  const userId = req.authUser!.uid;
  const userEmail = req.authUser?.email;
  const userRole = req.authUser?.role;

  try {
    const { targetUserId, matchScore, newRegisteredItem, userLostItem, matchedFeatures } = req.body;

    if (!targetUserId || !newRegisteredItem || !userLostItem) {
      return res.status(400).json({ error: "Parâmetros incompletos para envio do alerta push FCM." });
    }

    const payload = {
      title: `🔍 Objeto Similar Encontrado (${matchScore || 85}%)`,
      body: `Um(a) "${newRegisteredItem.title}" com alta similaridade com seu relato "${userLostItem.title}" foi registrado no IFPR Campus Ivaiporã (${newRegisteredItem.location}).`,
      data: {
        url: `/?item=${newRegisteredItem.id}`,
        itemId: newRegisteredItem.id,
        matchScore: String(matchScore || 85),
      },
    };

    // Securely persist counterpart notification directly via Admin Firestore
    const adminDb = getAdminFirestore();
    if (adminDb && targetUserId) {
      try {
        const notifId = `notif-match-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await adminDb.collection("notifications").doc(notifId).set({
          id: notifId,
          userId: targetUserId,
          title: payload.title,
          message: payload.body,
          timestamp: new Date().toISOString(),
          read: false,
          type: "MATCH",
          relatedItemId: newRegisteredItem.id,
          isGlobal: false,
        });
      } catch (firestoreErr) {
        console.error("Erro ao salvar notificação de correspondência no Firestore:", firestoreErr);
      }
    }

    // Also dispatch email notification to the target user if their account/email exists
    if (adminDb && targetUserId) {
      try {
        let recipientEmail = "";
        let recipientName = "";
        const userDoc = await adminDb.collection("users").doc(targetUserId).get();
        if (userDoc.exists) {
          const udata = userDoc.data();
          recipientEmail = udata?.email || "";
          recipientName = udata?.name || "";
        }

        if (recipientEmail) {
          sendMatchNotificationEmail({
            recipientEmail,
            recipientName,
            matchScore: matchScore || 85,
            newRegisteredItem,
            counterpartItem: userLostItem,
            matchedFeatures,
            reason: `Identificado pelo sistema inteligente de correspondência do IFPR com ${matchScore || 85}% de similaridade.`,
          }).catch((mailErr) => console.error("Erro no envio assíncrono de e-mail de match:", mailErr));
        }
      } catch (userLookupErr) {
        console.warn("Aviso ao buscar dados do usuário para e-mail de match:", userLookupErr);
      }
    }

    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/fcm/send-match-alert",
      action: "FCM_PUSH_DISPATCH",
      status: "SUCCESS",
      details: {
        targetUserId,
        matchScore,
        newItemId: newRegisteredItem.id,
        lostItemId: userLostItem.id,
        matchedFeatures,
      },
      ip: getClientIp(req),
    });

    return res.json({
      success: true,
      message: "Alerta Push FCM e e-mail de correspondência processados com sucesso.",
      notification: payload,
    });
  } catch (error: any) {
    console.error("Erro no envio de push FCM:", error);
    return res.status(500).json({ error: error.message || "Erro no servidor ao despachar push FCM." });
  }
});

// =================================================================
// Email Notification Service for Potential Matches
// =================================================================

interface MatchEmailPayload {
  recipientEmail: string;
  recipientName?: string;
  matchScore: number;
  newRegisteredItem: {
    id: string;
    title: string;
    type: "PERDIDO" | "ENCONTRADO";
    category: string;
    color?: string;
    brand?: string;
    location: string;
    description: string;
    date?: string;
  };
  counterpartItem: {
    id: string;
    title: string;
    type: "PERDIDO" | "ENCONTRADO";
    category: string;
    color?: string;
    brand?: string;
    location: string;
    description: string;
  };
  matchedFeatures?: string[];
  reason?: string;
}

function getEmailTransporter(): Transporter | null {
  const host = (process.env.SMTP_HOST || "").trim();
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").trim().replace(/\s+/g, "");
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: {
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
    },
  });
}

export async function sendMatchNotificationEmail(payload: MatchEmailPayload): Promise<{
  success: boolean;
  status: "SENT" | "PENDING_SMTP_CONFIG" | "ERROR";
  messageId?: string;
  details?: string;
}> {
  const { recipientEmail, recipientName, matchScore, newRegisteredItem, counterpartItem, matchedFeatures, reason } = payload;
  const adminDb = getAdminFirestore();
  const logId = `email-match-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const timestamp = new Date().toISOString();

  const subject = `[IFPR Achados & Perdidos] Encontramos objetos semelhantes! (${matchScore}% de compatibilidade)`;

  const htmlContent = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f6f8; color: #1e293b; }
    .container { max-width: 600px; margin: 24px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #00843D 0%, #005a2b 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
    .header p { margin: 6px 0 0 0; font-size: 13px; opacity: 0.9; }
    .badge { display: inline-block; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.4); padding: 5px 16px; border-radius: 999px; font-size: 13px; font-weight: bold; margin-top: 14px; }
    .content { padding: 28px 24px; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin-bottom: 20px; }
    .card h3 { margin: 0 0 10px 0; font-size: 15px; color: #0f172a; }
    .item-grid { display: grid; grid-template-columns: 1fr; gap: 8px; font-size: 13px; }
    .item-prop { display: flex; justify-content: space-between; border-bottom: 1px dashed #cbd5e1; padding-bottom: 4px; }
    .item-prop span:first-child { color: #64748b; font-weight: 500; }
    .item-prop span:last-child { color: #0f172a; font-weight: 600; }
    .ai-box { background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 16px; margin: 20px 0; }
    .ai-box h4 { margin: 0 0 6px 0; font-size: 13px; color: #065f46; font-weight: 700; }
    .ai-box p { margin: 0; font-size: 12px; color: #047857; line-height: 1.5; }
    .features-pill { display: inline-block; background: #d1fae5; color: #065f46; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 6px; margin: 2px; }
    .cta-button { display: block; width: fit-content; margin: 24px auto; background: #00843D; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 700; font-size: 14px; text-align: center; }
    .footer { padding: 20px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>IFPR Campus Ivaiporã • Achados & Perdidos</h1>
      <p>Sistema Oficial de Gestão e Localização de Pertences</p>
      <div class="badge">Encontramos objetos semelhantes! (${matchScore}% de compatibilidade)</div>
    </div>
    <div class="content">
      <p style="font-size: 14px; line-height: 1.6; margin-top: 0;">
        Olá <strong>${recipientName || recipientEmail}</strong>,
      </p>
      <p style="font-size: 13px; line-height: 1.6; color: #475569;">
        O motor de Inteligência Artificial do <strong>Localiza+ / IFPR Achados & Perdidos</strong> identificou uma potencial correspondência de alta relevância (<strong>${matchScore}%</strong>) com um pertence registrado no campus.
      </p>

      <div class="card">
        <h3>🔍 Objeto Cadastrado Recentemente</h3>
        <div class="item-grid">
          <div class="item-prop"><span>Título:</span><span>${newRegisteredItem.title}</span></div>
          <div class="item-prop"><span>Tipo:</span><span>${newRegisteredItem.type}</span></div>
          <div class="item-prop"><span>Categoria:</span><span>${newRegisteredItem.category}</span></div>
          <div class="item-prop"><span>Cor:</span><span>${newRegisteredItem.color || "Não informada"}</span></div>
          <div class="item-prop"><span>Marca:</span><span>${newRegisteredItem.brand || "Desconhecida"}</span></div>
          <div class="item-prop"><span>Local no Campus:</span><span>${newRegisteredItem.location}</span></div>
        </div>
      </div>

      <div class="card">
        <h3>📦 Objeto Relacionado no Sistema</h3>
        <div class="item-grid">
          <div class="item-prop"><span>Título:</span><span>${counterpartItem.title}</span></div>
          <div class="item-prop"><span>Tipo:</span><span>${counterpartItem.type}</span></div>
          <div class="item-prop"><span>Categoria:</span><span>${counterpartItem.category}</span></div>
          <div class="item-prop"><span>Local no Campus:</span><span>${counterpartItem.location}</span></div>
        </div>
      </div>

      <div class="ai-box">
        <h4>🤖 Análise de Similaridade Textual (IA Gemini)</h4>
        <p>${reason || "Características coincidentes de categoria, modelo, cor e local detectadas pela IA."}</p>
        ${matchedFeatures && matchedFeatures.length > 0 ? `
          <div style="margin-top: 8px;">
            ${matchedFeatures.map((f: string) => `<span class="features-pill">${f}</span>`).join(" ")}
          </div>
        ` : ""}
      </div>

      <a href="https://ais-dev-mbimq2qicgl3xitodqasxp-531286486641.us-west2.run.app" class="cta-button">
        Acessar Localiza+ para Verificar Pertence
      </a>

      <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin-bottom: 0;">
        Caso este pertence seja o seu, dirija-se ao setor responsável do campus com um documento oficial ou entre em contato pelo sistema para efetuar a retirada segura.
      </p>
    </div>
    <div class="footer">
      Instituto Federal do Paraná • Campus Ivaiporã<br>
      Rodovia PR-466 - Ivaiporã/PR • Contato: localizamais0@gmail.com<br>
      Mensagem enviada automaticamente pelo sistema Localiza+.
    </div>
  </div>
</body>
</html>
  `;

  const transporter = getEmailTransporter();

  if (!transporter) {
    console.log(`[Email Service Notice] SMTP_HOST/SMTP_USER não configurados no ambiente. Registrando despacho no Firestore e auditoria para ${recipientEmail}.`);
    
    if (adminDb) {
      try {
        await adminDb.collection("email_notifications").doc(logId).set({
          id: logId,
          recipientEmail,
          recipientName: recipientName || null,
          subject,
          matchScore,
          newItemId: newRegisteredItem.id,
          counterpartItemId: counterpartItem.id,
          status: "PENDING_SMTP_CONFIG",
          timestamp,
          reason: reason || null,
          matchedFeatures: matchedFeatures || [],
        });
      } catch (e) {
        console.warn("[Firestore Log Warning] Não foi possível persistir email_notification:", e);
      }
    }

    return {
      success: true,
      status: "PENDING_SMTP_CONFIG",
      details: "Notificação registrada no log do Firestore. Para envio SMTP em produção, configure as variáveis SMTP_* no painel de segredos.",
    };
  }

  try {
    const fromAddress = process.env.SMTP_FROM || `"IFPR Achados & Perdidos" <${process.env.SMTP_USER}>`;
    const info = await transporter.sendMail({
      from: fromAddress,
      to: recipientEmail,
      subject,
      html: htmlContent,
    });

    console.log(`[Email Service Success] E-mail de correspondência enviado com sucesso para ${recipientEmail}. MessageId: ${info.messageId}`);

    if (adminDb) {
      try {
        await adminDb.collection("email_notifications").doc(logId).set({
          id: logId,
          recipientEmail,
          recipientName: recipientName || null,
          subject,
          matchScore,
          newItemId: newRegisteredItem.id,
          counterpartItemId: counterpartItem.id,
          status: "SENT",
          messageId: info.messageId,
          timestamp,
          reason: reason || null,
          matchedFeatures: matchedFeatures || [],
        });
      } catch (e) {
        console.warn("[Firestore Log Warning] Não foi possível persistir email_notification:", e);
      }
    }

    return {
      success: true,
      status: "SENT",
      messageId: info.messageId,
    };
  } catch (error: any) {
    console.error(`[Email Service Error] Falha ao enviar e-mail para ${recipientEmail}:`, error);

    if (adminDb) {
      try {
        await adminDb.collection("email_notifications").doc(logId).set({
          id: logId,
          recipientEmail,
          recipientName: recipientName || null,
          subject,
          matchScore,
          newItemId: newRegisteredItem.id,
          counterpartItemId: counterpartItem.id,
          status: "ERROR",
          error: error?.message || String(error),
          timestamp,
        });
      } catch (_) {}
    }

    return {
      success: false,
      status: "ERROR",
      details: error?.message || "Erro no envio do e-mail SMTP",
    };
  }
}

// Endpoint to send potential match notification email
app.post(["/api/notifications/send-match-email", "/notifications/send-match-email"], requireAuth, generalRateLimiter, async (req, res) => {
  const userId = req.authUser!.uid;
  const userEmail = req.authUser?.email;
  const userRole = req.authUser?.role;

  try {
    const { targetUserId, targetEmail, matchScore, newItem, counterpartItem, matchedFeatures, reason, currentUserEmail, currentUserName } = req.body;

    if (!newItem || !counterpartItem) {
      return res.status(400).json({ error: "Dados incompletos do objeto ou contraparte para envio de e-mail." });
    }

    let recipientEmail = String(targetEmail || "").trim();
    let recipientName = "";

    const adminDb = getAdminFirestore();
    if (!recipientEmail && targetUserId && adminDb) {
      try {
        const udoc = await adminDb.collection("users").doc(targetUserId).get();
        if (udoc.exists) {
          const udata = udoc.data();
          recipientEmail = udata?.email || "";
          recipientName = udata?.name || "";
        }
      } catch (err) {
        console.warn("Erro ao buscar e-mail do usuário no Firestore:", err);
      }
    }

    if (!recipientEmail) {
      // If counterpart user email couldn't be resolved, fallback to notifying currentUser if requested
      recipientEmail = currentUserEmail || userEmail || "";
      recipientName = currentUserName || "";
    }

    if (!recipientEmail) {
      return res.status(400).json({ error: "Nenhum endereço de e-mail destinatário foi localizado para este alerta." });
    }

    const emailResult = await sendMatchNotificationEmail({
      recipientEmail,
      recipientName,
      matchScore: Number(matchScore) || 80,
      newRegisteredItem: newItem,
      counterpartItem,
      matchedFeatures,
      reason,
    });

    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/notifications/send-match-email",
      action: "MATCH_EMAIL_DISPATCH",
      status: emailResult.success ? "SUCCESS" : "FAILED",
      details: {
        recipientEmail,
        status: emailResult.status,
        matchScore,
        newItemId: newItem.id,
        counterpartItemId: counterpartItem.id,
      },
      ip: getClientIp(req),
    });

    return res.json({
      success: emailResult.success,
      status: emailResult.status,
      message: emailResult.status === "SENT" 
        ? `E-mail de notificação enviado com sucesso para ${recipientEmail}.`
        : `Alerta registrado com sucesso. (Status: ${emailResult.status})`,
      details: emailResult.details,
    });
  } catch (error: any) {
    console.error("Erro no endpoint send-match-email:", error);
    return res.status(500).json({ error: error.message || "Erro interno ao processar e-mail de correspondência." });
  }
});

// Endpoint to check email service status (Restricted to Administrators)
app.get(["/api/notifications/email-status", "/notifications/email-status"], requireAuth, requireAdmin, async (req, res) => {
  const isConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  return res.json({
    success: true,
    smtpConfigured: isConfigured,
    provider: process.env.SMTP_HOST ? process.env.SMTP_HOST.split(".")[1] || "Custom SMTP" : "Não configurado",
    host: process.env.SMTP_HOST || null,
    port: process.env.SMTP_PORT || "587",
    from: process.env.SMTP_FROM || (process.env.SMTP_USER ? `"IFPR Achados & Perdidos" <${process.env.SMTP_USER}>` : null),
  });
});

// Support & User Feedback Submission Endpoint (Direct Campus Team Dispatch & Discord Webhook Forwarding)
// Webhook URL is strictly loaded from secure server-side environment secrets / Firebase Functions configuration
function getDiscordFeedbackWebhookUrl(): string {
  return (
    process.env.DISCORD_FEEDBACK_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK_URL_FEEDBACK ||
    process.env.DISCORD_FEEDBACK_URL ||
    process.env.DISCORD_WEBHOOK_FEEDBACK ||
    process.env.DISCORD_SUPPORT_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK_URL ||
    ""
  ).trim();
}

async function sendFeedbackToDiscord(ticket: {
  protocol: string;
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  priority?: string;
  timestamp: string;
  clientDiagnostics?: any;
}): Promise<boolean> {
  const webhookUrl = getDiscordFeedbackWebhookUrl();
  if (!webhookUrl) {
    console.info(
      "[Discord Feedback Notice] DISCORD_FEEDBACK_WEBHOOK_URL não configurada no ambiente seguro do servidor. O feedback foi registrado e processado normalmente."
    );
    return false;
  }

  try {
    const categoryMap: Record<string, { label: string; color: number; emoji: string }> = {
      BUG_REPORT: { label: "Relato de Bug / Erro no Sistema", color: 0xef4444, emoji: "🐛" },
      FEEDBACK: { label: "Sugestão ou Melhoria", color: 0xf59e0b, emoji: "💡" },
      SUPPORT: { label: "Suporte Técnico & Atendimento", color: 0x3b82f6, emoji: "🛠️" },
      BELONGING_QUERY: { label: "Dúvida sobre Pertence / Retirada", color: 0x3b82f6, emoji: "🔍" },
      OTHER: { label: "Elogio ou Outro Assunto", color: 0x10b981, emoji: "💬" },
    };

    const cat = categoryMap[ticket.category] || {
      label: ticket.category || "Feedback Geral",
      color: 0x6366f1,
      emoji: "📝",
    };

    const priorityLabel =
      ticket.priority === "ALTA"
        ? "🔴 Alta"
        : ticket.priority === "BAIXA"
        ? "🟢 Baixa"
        : "🟡 Média";

    let dateFormatted = ticket.timestamp;
    try {
      dateFormatted = new Date(ticket.timestamp).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {}

    const fields: Array<{ name: string; value: string; inline?: boolean }> = [
      { name: "👤 Usuário", value: ticket.name || "Não informado", inline: true },
      { name: "📧 E-mail", value: ticket.email || "Não informado", inline: true },
      { name: "🏷️ Tipo de Feedback", value: `${cat.emoji} ${cat.label}`, inline: true },
      { name: "⚡ Prioridade", value: priorityLabel, inline: true },
      { name: "📋 Protocolo", value: `\`${ticket.protocol}\``, inline: true },
      { name: "🕒 Data e Hora", value: dateFormatted, inline: true },
    ];

    if (ticket.clientDiagnostics && typeof ticket.clientDiagnostics === "object") {
      const diagParts = [
        ticket.clientDiagnostics.screen ? `🖥️ Tela: ${ticket.clientDiagnostics.screen}` : null,
        ticket.clientDiagnostics.currentPath ? `📍 Rota: \`${ticket.clientDiagnostics.currentPath}\`` : null,
        typeof ticket.clientDiagnostics.online === "boolean"
          ? `📶 Conexão: ${ticket.clientDiagnostics.online ? "Online" : "Offline"}`
          : null,
      ].filter(Boolean);

      if (diagParts.length > 0) {
        fields.push({
          name: "🛠️ Diagnóstico do Cliente",
          value: diagParts.join(" | ").substring(0, 1024),
          inline: false,
        });
      }
    }

    const discordPayload = {
      username: "IFPR Achados e Perdidos - Feedback",
      avatar_url: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/life-buoy.png",
      embeds: [
        {
          title: `${cat.emoji} [${cat.label}] ${ticket.subject}`.substring(0, 256),
          description: ticket.message.substring(0, 4000),
          color: cat.color,
          fields,
          footer: {
            text: "IFPR Campus Ivaiporã • Central de Atendimento & Feedback",
          },
          timestamp: ticket.timestamp,
        },
      ],
    };

    console.log(`[Discord Feedback Dispatch] Enviando notificação para o canal de suporte/feedback (Protocolo: ${ticket.protocol}, Categoria: ${ticket.category})...`);

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(discordPayload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[Discord Feedback Warning] Resposta HTTP ${response.status} do Webhook:`, errText);
      return false;
    }

    console.log(`[Discord Feedback Success] Webhook despachado com sucesso para o protocolo ${ticket.protocol}.`);
    return true;
  } catch (webhookErr: any) {
    // Isolamento resiliente: falhas no Discord nunca quebram a resposta do servidor nem o envio por e-mail
    console.error("[Discord Feedback Error] Falha de conexão ao enviar para o Discord:", webhookErr?.message || webhookErr);
    return false;
  }
}

app.post(
  ["/api/support/send-feedback", "/support/send-feedback", "/api/support/feedback", "/api/support/bug-report"],
  generalRateLimiter,
  async (req, res) => {
  try {
    const { name, email, category, subject, message, priority, clientDiagnostics } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        error: "Por favor, preencha todos os campos obrigatórios: nome, e-mail, assunto e descrição da mensagem.",
      });
    }

    const ticketProtocol = `IFPR-SUP-${Date.now().toString(36).toUpperCase()}`;
    const timestamp = new Date().toISOString();
    const destinationEmail = "localizamais0@gmail.com";
    const adminNotificationEmail = ROOT_ADMIN_EMAIL;

    const emailPayload = {
      protocol: ticketProtocol,
      recipient: destinationEmail,
      adminRecipient: adminNotificationEmail,
      senderName: String(name).trim().substring(0, 100),
      senderEmail: String(email).trim().substring(0, 120),
      category: String(category || "FEEDBACK"),
      subject: `[${ticketProtocol}] ${String(subject).trim().substring(0, 150)}`,
      body: String(message).trim().substring(0, 4000),
      priority: priority || "NORMAL",
      timestamp,
      clientDiagnostics: clientDiagnostics || {
        userAgent: req.headers["user-agent"] || "unknown",
        ip: getClientIp(req),
      },
    };

    console.log(`[Support Ticket Dispatched] Protocol: ${ticketProtocol} | From: ${emailPayload.senderEmail} | Category: ${emailPayload.category} | To: ${destinationEmail}`);

    // Persist ticket to Firestore via Admin SDK
    const adminDb = getAdminFirestore();
    if (adminDb) {
      try {
        const ticketDocId = `ticket_${ticketProtocol}`;
        await adminDb.collection("support_tickets").doc(ticketDocId).set({
          id: ticketDocId,
          name: emailPayload.senderName,
          email: emailPayload.senderEmail,
          category: emailPayload.category,
          subject: String(subject).trim(),
          message: emailPayload.body,
          priority: String(priority || "MEDIA"),
          createdAt: timestamp,
          status: "NOVO",
          protocol: ticketProtocol,
          clientDiagnostics: emailPayload.clientDiagnostics,
        });

        // Register email notification log in Firestore
        const notifDocId = `email_ticket_${ticketProtocol}_${Date.now()}`;
        await adminDb.collection("email_notifications").doc(notifDocId).set({
          id: notifDocId,
          ticketProtocol,
          recipientEmail: destinationEmail,
          senderName: emailPayload.senderName,
          senderEmail: emailPayload.senderEmail,
          subject: emailPayload.subject,
          category: emailPayload.category,
          status: "QUEUED_OR_RECORDED",
          timestamp,
        });
      } catch (dbErr) {
        console.warn("[Support Ticket Firestore Warning] Erro ao persistir ticket no Firestore:", dbErr);
      }
    }

    // Try sending email via SMTP transporter if configured
    const transporter = getEmailTransporter();
    let emailSent = false;
    if (transporter) {
      try {
        const fromAddress = process.env.SMTP_FROM || `"Localiza+ Suporte IFPR" <${process.env.SMTP_USER || destinationEmail}>`;
        await transporter.sendMail({
          from: fromAddress,
          to: destinationEmail,
          subject: emailPayload.subject,
          text: `Protocolo: ${ticketProtocol}\nDe: ${emailPayload.senderName} (${emailPayload.senderEmail})\nCategoria: ${emailPayload.category}\nPrioridade: ${emailPayload.priority}\nData: ${timestamp}\n\nMensagem:\n${emailPayload.body}\n\nDiagnóstico: ${JSON.stringify(emailPayload.clientDiagnostics)}`,
        });
        emailSent = true;
      } catch (mailErr: any) {
        console.warn("[Support Ticket Mail Warning] Erro ao despachar SMTP:", mailErr?.message || mailErr);
      }
    }

    // Envio para o Discord Webhook (com isolamento de falhas)
    const discordSent = await sendFeedbackToDiscord({
      protocol: ticketProtocol,
      name: emailPayload.senderName,
      email: emailPayload.senderEmail,
      category: emailPayload.category,
      subject: String(subject).trim(),
      message: emailPayload.body,
      priority: String(priority || "MEDIA"),
      timestamp,
      clientDiagnostics,
    });

    return res.json({
      success: true,
      protocol: ticketProtocol,
      message: "Seu relato/feedback foi registrado e encaminhado diretamente para a equipe de suporte do Campus Ivaiporã.",
      timestamp,
      destinationEmail,
      emailSubject: emailPayload.subject,
      discordDispatched: discordSent,
      emailDispatched: emailSent,
    });
  } catch (error: any) {
    console.error("Erro no envio do feedback de suporte:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Erro ao processar envio do formulário de contato.",
    });
  }
});

// Diagnostic Environment Endpoint (Restricted strictly to authorized Administrators)
app.get(["/api/debug/env", "/debug/env"], requireAuth, requireAdmin, (req, res) => {
  const isDiscordConfigured = Boolean(
    process.env.DISCORD_FEEDBACK_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK_URL_FEEDBACK ||
    process.env.DISCORD_FEEDBACK_URL ||
    process.env.DISCORD_WEBHOOK_FEEDBACK ||
    process.env.DISCORD_SUPPORT_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK ||
    process.env.DISCORD_FEEDBACK
  );

  const smtpHost = (process.env.SMTP_HOST || "").trim();
  const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const smtpUser = (process.env.SMTP_USER || "").trim();
  const smtpPass = (process.env.SMTP_PASS || "").trim();
  const isSmtpConfigured = Boolean(smtpHost && smtpUser && smtpPass);

  const maskEmail = (email: string) => {
    if (!email || !email.includes("@")) return null;
    const [name, domain] = email.split("@");
    return `${name.substring(0, 3)}***@${domain}`;
  };

  const isGeminiConfigured = Boolean(
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    process.env.API_KEY
  );

  const isFirebaseAdminConfigured = Boolean(
    process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY
  );

  res.json({
    status: isDiscordConfigured || isSmtpConfigured || isGeminiConfigured,
    DISCORD_FEEDBACK_WEBHOOK_URL: isDiscordConfigured,
    DISCORD_WEBHOOK_READY: isDiscordConfigured,
    SMTP: {
      configured: isSmtpConfigured,
      hostPresent: Boolean(smtpHost),
      portPresent: Boolean(process.env.SMTP_PORT),
      userPresent: Boolean(smtpUser),
      passPresent: Boolean(smtpPass),
      fromPresent: Boolean(process.env.SMTP_FROM),
      port: smtpPort,
      secure: process.env.SMTP_SECURE === "true" || smtpPort === 465,
      userMasked: maskEmail(smtpUser),
    },
    GEMINI_AI: {
      configured: isGeminiConfigured,
    },
    FIREBASE_ADMIN: {
      configured: isFirebaseAdminConfigured,
      projectIdPresent: Boolean(process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID),
    },
    runtime: "express",
    timestamp: new Date().toISOString(),
  });
});

// ==========================================
// Discord Integration for #novos-achados & #novas-perdas
// ==========================================

function parseDateSafeServer(dateInput?: any): Date | null {
  if (!dateInput) return null;
  if (dateInput instanceof Date) {
    return isNaN(dateInput.getTime()) ? null : dateInput;
  }
  if (typeof dateInput === "object") {
    if (typeof dateInput.toDate === "function") {
      try {
        const d = dateInput.toDate();
        if (d instanceof Date && !isNaN(d.getTime())) return d;
      } catch {
        // Fall through
      }
    }
    const secs = typeof dateInput.seconds === "number" ? dateInput.seconds : dateInput._seconds;
    if (typeof secs === "number") {
      const d = new Date(secs * 1000);
      if (!isNaN(d.getTime())) return d;
    }
  }
  if (typeof dateInput === "number") {
    const d = new Date(dateInput > 1e11 ? dateInput : dateInput * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof dateInput === "string") {
    const trimmed = dateInput.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const parts = trimmed.split("-");
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatBrtDateServer(dateInput?: any): string {
  const parsed = parseDateSafeServer(dateInput);
  if (!parsed) return typeof dateInput === "string" && dateInput ? dateInput : "Data não informada";
  try {
    return parsed.toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return String(dateInput);
  }
}

function formatBrtDateTimeServer(dateInput?: any): string {
  const parsed = parseDateSafeServer(dateInput);
  if (!parsed) return typeof dateInput === "string" && dateInput ? dateInput : "Momento do registro";
  try {
    const datePart = parsed.toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const timePart = parsed.toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${datePart} às ${timePart} (BRT)`;
  } catch {
    return String(dateInput);
  }
}

function getIsoDatabaseTimestampServer(createdAt?: any, updatedAt?: any): string {
  const parsed = parseDateSafeServer(createdAt) || parseDateSafeServer(updatedAt);
  if (parsed) {
    return parsed.toISOString();
  }
  return new Date().toISOString();
}

function getDiscordNovosAchadosWebhookUrl(): string {
  return (
    process.env.DISCORD_NOVOS_ACHADOS_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK_URL_NOVOS_ACHADOS ||
    process.env.DISCORD_ACHADOS_WEBHOOK_URL ||
    process.env.DISCORD_ACHADOS_URL ||
    process.env.DISCORD_WEBHOOK_ACHADOS ||
    ""
  ).trim();
}

async function sendNovoAchadoToDiscord(item: {
  id: string;
  title: string;
  category: string;
  type: string;
  status: string;
  description: string;
  color?: string;
  brand?: string;
  location: string;
  date: string;
  imageUrl?: string;
  qrCodeId?: string;
  registeredByName?: string;
  registeredByRole?: string;
  createdAt?: string;
  updatedAt?: string;
}): Promise<boolean> {
  console.log("[NOVO_ACHADO_DISCORD] função chamada");

  const normalizedType = String(item?.type || "").toUpperCase().trim();
  if (normalizedType !== "ENCONTRADO" && normalizedType !== "ACHADO") {
    console.log(`[NOVO_ACHADO_DISCORD] Item do tipo "${item?.type}" ignorado para o canal #novos-achados.`);
    return false;
  }

  const webhookUrl = getDiscordNovosAchadosWebhookUrl();
  console.log(`[NOVO_ACHADO_DISCORD] webhook configurado: ${webhookUrl ? "SIM" : "NÃO"}`);

  if (!webhookUrl) {
    console.info(
      "[Discord Novos Achados Notice] DISCORD_NOVOS_ACHADOS_WEBHOOK_URL não configurada no servidor. O cadastro do achado foi salvo normalmente."
    );
    return false;
  }

  try {
    const sanitizedTitle = String(item.title || "Objeto Encontrado").trim().substring(0, 200);
    const sanitizedDesc = String(item.description || "Nenhuma descrição fornecida.").trim().substring(0, 3900);
    const sanitizedLocation = String(item.location || "Campus Ivaiporã").trim().substring(0, 100);
    const sanitizedCategory = String(item.category || "Outros").trim().substring(0, 80);
    const sanitizedColor = item.color && item.color.trim() ? item.color.trim() : null;
    const sanitizedBrand = item.brand && item.brand.trim() ? item.brand.trim() : null;

    const dateFormatted = formatBrtDateServer(item.date);
    const createdAtFormatted = formatBrtDateTimeServer(item.createdAt || item.updatedAt || new Date().toISOString());
    const databaseIsoTimestamp = getIsoDatabaseTimestampServer(item.createdAt, item.updatedAt);

    const fields: Array<{ name: string; value: string; inline?: boolean }> = [
      { name: "🏷️ Categoria", value: `**${sanitizedCategory}**`, inline: true },
      { name: "📍 Local onde foi Encontrado", value: sanitizedLocation, inline: true },
      { name: "📅 Data do Achado", value: `**${dateFormatted}**`, inline: true },
      { name: "📊 Status do Item", value: "🟢 **Sob Custódia** *(Aguardando Retirada)*", inline: true },
    ];

    // Inclui usuário responsável apenas se presente
    const rawRegistrar = item.registeredByName || (item as any).userName || (item as any).authorName;
    if (rawRegistrar && typeof rawRegistrar === "string" && rawRegistrar.trim()) {
      const cleanRegistrar = rawRegistrar.trim().substring(0, 100);
      const roleSuffix = item.registeredByRole ? ` (${item.registeredByRole})` : "";
      fields.push({
        name: "👤 Registrado Por",
        value: `${cleanRegistrar}${roleSuffix}`,
        inline: true,
      });
    }

    // Inclui número de protocolo apenas se presente
    const rawProtocol = item.qrCodeId || (item as any).protocolNumber || (item as any).protocol || item.id;
    if (rawProtocol && typeof rawProtocol === "string" && rawProtocol.trim() && rawProtocol.trim().toUpperCase() !== "N/A") {
      const cleanProtocol = rawProtocol.trim().substring(0, 80);
      fields.push({
        name: "📋 Número / Protocolo",
        value: `\`${cleanProtocol}\``,
        inline: true,
      });
    }

    if (sanitizedColor || sanitizedBrand) {
      const visualParts = [
        sanitizedColor ? `Cor: **${sanitizedColor}**` : null,
        sanitizedBrand ? `Marca: **${sanitizedBrand}**` : null,
      ].filter(Boolean);

      fields.push({
        name: "🎨 Características Visuais",
        value: visualParts.join(" • ").substring(0, 1024),
        inline: false,
      });
    }

    fields.push({
      name: "🕐 Registro no Banco de Dados",
      value: createdAtFormatted,
      inline: false,
    });

    const embed: any = {
      title: `📦 Novo Achado Cadastrado: ${sanitizedTitle}`.substring(0, 256),
      description: sanitizedDesc || "Objeto cadastrado no sistema do IFPR Campus Ivaiporã.",
      color: 0x10b981, // Emerald Green representing IFPR / Achados
      fields,
      footer: {
        text: "IFPR Campus Ivaiporã • Central de Achados e Perdidos • Evento Registrado",
        icon_url: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/shield-check.png",
      },
      timestamp: databaseIsoTimestamp,
    };

    if (item.imageUrl && (item.imageUrl.startsWith("http://") || item.imageUrl.startsWith("https://"))) {
      embed.image = { url: item.imageUrl };
    }

    const discordPayload = {
      username: "IFPR Achados e Perdidos • #novos-achados",
      avatar_url: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/package-search.png",
      embeds: [embed],
    };

    console.log("[NOVO_ACHADO_DISCORD] dados preparados");

    console.log("[NOVO_ACHADO_DISCORD] requisição enviada");
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(discordPayload),
    });

    console.log(`[NOVO_ACHADO_DISCORD] status HTTP: ${response.status}`);

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[Discord Novos Achados Warning] HTTP ${response.status} do Webhook:`, errText);
      return false;
    }

    console.log(`[Discord Novos Achados Success] Notificação enviada para #novos-achados: "${item.title}" (${item.id})`);
    return true;
  } catch (err: any) {
    // Isolamento resiliente total: falhas no Discord nunca desfazem o cadastro do achado
    console.error("[Discord Novos Achados Error] Falha ao enviar para o Discord:", err?.message || err);
    return false;
  }
}

app.post(["/api/items/notify-novos-achados", "/items/notify-novos-achados"], requireAuth, generalRateLimiter, async (req, res) => {
  try {
    const rawItem = req.body?.item || req.body;
    const itemId = rawItem?.id || req.body?.itemId;
    if (!itemId || typeof itemId !== "string" || !itemId.trim()) {
      return res.status(400).json({ success: false, error: "Identificador do item (id) ausente ou inválido." });
    }

    const cleanItemId = itemId.trim();
    const adminDb = getAdminFirestore();
    if (!adminDb) {
      return res.status(503).json({ success: false, error: "Serviço de banco de dados indisponível no servidor." });
    }

    // 1. Verify existence of item in Firestore using Admin SDK
    const docSnap = await adminDb.collection("items").doc(cleanItemId).get();
    if (!docSnap.exists) {
      return res.status(404).json({ success: false, error: `Ocorrência #${cleanItemId} não encontrada no banco de dados.` });
    }

    const dbItem: any = docSnap.data();

    // 2. Authorization check: legitimate author, admin, or servidor
    const callerUid = req.authUser!.uid;
    const isAuthor = dbItem.registeredByUserId === callerUid;
    const isStaffOrAdmin = req.authUser!.isAdmin || req.authUser!.role === "SERVIDOR";

    if (!isAuthor && !isStaffOrAdmin) {
      console.warn(`[Discord Novos Achados Security Alert] Usuário ${callerUid} tentou despachar notificação para item de terceiro (${cleanItemId}). Acesso negado.`);
      return res.status(403).json({
        success: false,
        error: "Acesso negado. Apenas o autor do cadastro ou servidores/administradores do IFPR podem notificar este item.",
      });
    }

    const normalizedType = String(dbItem.type || "").toUpperCase().trim();
    if (normalizedType !== "ENCONTRADO" && normalizedType !== "ACHADO") {
      return res.status(400).json({
        success: false,
        error: `Ocorrência #${cleanItemId} possui tipo '${dbItem.type}' e não é um item ENCONTRADO/ACHADO.`,
      });
    }

    // 3. Prevent duplicate Discord notification spam
    if (dbItem.discordNotified === true) {
      return res.json({
        success: true,
        message: "Item já notificado anteriormente no canal #novos-achados.",
        itemId: cleanItemId,
        alreadyNotified: true,
      });
    }

    // 4. Sanitize and prepare verified item data
    const sanitizedItem = {
      id: cleanItemId,
      title: String(dbItem.title || "").trim().substring(0, 100),
      description: String(dbItem.description || "").trim().substring(0, 1000),
      category: String(dbItem.category || "Outros").trim().substring(0, 60),
      location: String(dbItem.location || "Campus IFPR").trim().substring(0, 120),
      status: String(dbItem.status || "DISPONIVEL").trim(),
      date: String(dbItem.date || new Date().toISOString().split("T")[0]).trim(),
      color: dbItem.color ? String(dbItem.color).trim().substring(0, 50) : undefined,
      brand: dbItem.brand ? String(dbItem.brand).trim().substring(0, 60) : undefined,
      imageUrl: (dbItem.imageUrl && (dbItem.imageUrl.startsWith("http://") || dbItem.imageUrl.startsWith("https://"))) ? dbItem.imageUrl : undefined,
      qrCodeId: dbItem.qrCodeId ? String(dbItem.qrCodeId).trim() : undefined,
      registeredByName: dbItem.registeredByName ? String(dbItem.registeredByName).trim() : undefined,
      registeredByRole: dbItem.registeredByRole ? String(dbItem.registeredByRole).trim() : undefined,
      createdAt: dbItem.createdAt || new Date().toISOString(),
      updatedAt: dbItem.updatedAt || undefined,
      type: "ENCONTRADO",
    };

    // Mark as notified to prevent duplicate calls
    docSnap.ref.update({
      discordNotified: true,
      discordNotifiedAt: new Date().toISOString(),
    }).catch(() => {});

    // Envio assíncrono e resiliente
    sendNovoAchadoToDiscord(sanitizedItem).catch((err) => {
      console.error("[Discord Novos Achados Background Error]:", err);
    });

    return res.json({
      success: true,
      message: "Notificação de novo achado encaminhada para o canal #novos-achados.",
      itemId: cleanItemId,
    });
  } catch (error: any) {
    console.error("Erro no endpoint notify-novos-achados:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Erro ao processar notificação para o Discord.",
    });
  }
});

// ==========================================
// Discord Integration for #novas-perdas
// ==========================================
function getDiscordNovasPerdasWebhookUrl(): string {
  return (
    process.env.DISCORD_NOVAS_PERDAS_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK_URL_NOVAS_PERDAS ||
    process.env.DISCORD_PERDAS_WEBHOOK_URL ||
    process.env.DISCORD_PERDAS_URL ||
    process.env.DISCORD_WEBHOOK_PERDAS ||
    ""
  ).trim();
}

async function sendNovaPerdaToDiscord(item: {
  id: string;
  title: string;
  category: string;
  type: string;
  status: string;
  description: string;
  color?: string;
  brand?: string;
  location: string;
  date: string;
  imageUrl?: string;
  qrCodeId?: string;
  registeredByName?: string;
  registeredByRole?: string;
  createdAt?: string;
  updatedAt?: string;
}): Promise<boolean> {
  console.log("[NOVA_PERDA_DISCORD] função chamada");

  const normalizedType = String(item?.type || "").toUpperCase().trim();
  if (normalizedType !== "PERDIDO" && normalizedType !== "PERDA") {
    console.log(`[NOVA_PERDA_DISCORD] Item do tipo "${item?.type}" ignorado para o canal #novas-perdas.`);
    return false;
  }

  const webhookUrl = getDiscordNovasPerdasWebhookUrl();
  console.log(`[NOVA_PERDA_DISCORD] webhook configurado: ${webhookUrl ? "SIM" : "NÃO"}`);

  if (!webhookUrl) {
    console.info(
      "[Discord Novas Perdas Notice] DISCORD_NOVAS_PERDAS_WEBHOOK_URL não configurada no servidor. O cadastro da perda foi salvo normalmente."
    );
    return false;
  }

  try {
    const sanitizedTitle = String(item.title || "Objeto Perdido").trim().substring(0, 200);
    const sanitizedDesc = String(item.description || "Nenhuma descrição detalhada fornecida.").trim().substring(0, 3900);
    const sanitizedLocation = String(item.location || "Campus Ivaiporã (Local não especificado)").trim().substring(0, 100);
    const sanitizedCategory = String(item.category || "Outros").trim().substring(0, 80);
    const sanitizedColor = item.color && item.color.trim() ? item.color.trim() : null;
    const sanitizedBrand = item.brand && item.brand.trim() ? item.brand.trim() : null;

    const dateFormatted = formatBrtDateServer(item.date);
    const createdAtFormatted = formatBrtDateTimeServer(item.createdAt || item.updatedAt || new Date().toISOString());
    const databaseIsoTimestamp = getIsoDatabaseTimestampServer(item.createdAt, item.updatedAt);

    const fields: Array<{ name: string; value: string; inline?: boolean }> = [
      { name: "🏷️ Categoria", value: `**${sanitizedCategory}**`, inline: true },
      { name: "📍 Último Local Onde Foi Visto", value: sanitizedLocation, inline: true },
      { name: "📅 Data da Perda", value: `**${dateFormatted}**`, inline: true },
      { name: "📊 Status do Item", value: "🟡 **Perdido** *(Procura Ativa no Campus)*", inline: true },
    ];

    // Inclui usuário responsável apenas se presente
    const rawRegistrar = item.registeredByName || (item as any).userName || (item as any).authorName;
    if (rawRegistrar && typeof rawRegistrar === "string" && rawRegistrar.trim()) {
      const cleanRegistrar = rawRegistrar.trim().substring(0, 100);
      const roleSuffix = item.registeredByRole ? ` (${item.registeredByRole})` : "";
      fields.push({
        name: "👤 Usuário Responsável pelo Cadastro",
        value: `${cleanRegistrar}${roleSuffix}`,
        inline: true,
      });
    }

    // Inclui número de protocolo apenas se presente
    const rawProtocol = item.qrCodeId || (item as any).protocolNumber || (item as any).protocol || item.id;
    if (rawProtocol && typeof rawProtocol === "string" && rawProtocol.trim() && rawProtocol.trim().toUpperCase() !== "N/A") {
      const cleanProtocol = rawProtocol.trim().substring(0, 80);
      fields.push({
        name: "📋 Número / Protocolo",
        value: `\`${cleanProtocol}\``,
        inline: true,
      });
    }

    if (sanitizedColor || sanitizedBrand) {
      const visualParts = [
        sanitizedColor ? `Cor: **${sanitizedColor}**` : null,
        sanitizedBrand ? `Marca: **${sanitizedBrand}**` : null,
      ].filter(Boolean);

      fields.push({
        name: "🎨 Características Visuais",
        value: visualParts.join(" • ").substring(0, 1024),
        inline: false,
      });
    }

    fields.push({
      name: "🕐 Registro no Banco de Dados",
      value: createdAtFormatted,
      inline: false,
    });

    const embed: any = {
      title: `🔎 Novo Objeto Perdido Cadastrado: ${sanitizedTitle}`.substring(0, 256),
      description: sanitizedDesc || "Objeto registrado como perdido no IFPR Campus Ivaiporã.",
      color: 0xf59e0b, // Amber 0xf59e0b representing alert/lost item
      fields,
      footer: {
        text: "IFPR Campus Ivaiporã • Central de Achados e Perdidos • Evento Registrado",
        icon_url: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/shield-check.png",
      },
      timestamp: databaseIsoTimestamp,
    };

    if (item.imageUrl && (item.imageUrl.startsWith("http://") || item.imageUrl.startsWith("https://"))) {
      embed.image = { url: item.imageUrl };
    }

    const discordPayload = {
      username: "IFPR Achados e Perdidos • #novas-perdas",
      avatar_url: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/search.png",
      embeds: [embed],
    };

    console.log("[NOVA_PERDA_DISCORD] dados preparados");

    console.log("[NOVA_PERDA_DISCORD] requisição enviada");
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(discordPayload),
    });

    console.log(`[NOVA_PERDA_DISCORD] status HTTP: ${response.status}`);

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[Discord Novas Perdas Warning] HTTP ${response.status} do Webhook:`, errText);
      return false;
    }

    console.log(`[Discord Novas Perdas Success] Notificação enviada para #novas-perdas: "${item.title}" (${item.id})`);
    return true;
  } catch (err: any) {
    // Isolamento resiliente total: falhas no Discord nunca desfazem o cadastro da perda
    console.error("[Discord Novas Perdas Error] Falha ao enviar para o Discord:", err?.message || err);
    return false;
  }
}

app.post(["/api/items/notify-novas-perdas", "/items/notify-novas-perdas"], requireAuth, generalRateLimiter, async (req, res) => {
  try {
    const rawItem = req.body?.item || req.body;
    const itemId = rawItem?.id || req.body?.itemId;
    if (!itemId || typeof itemId !== "string" || !itemId.trim()) {
      return res.status(400).json({ success: false, error: "Identificador do item (id) ausente ou inválido." });
    }

    const cleanItemId = itemId.trim();
    const adminDb = getAdminFirestore();
    if (!adminDb) {
      return res.status(503).json({ success: false, error: "Serviço de banco de dados indisponível no servidor." });
    }

    // 1. Verify existence of item in Firestore using Admin SDK
    const docSnap = await adminDb.collection("items").doc(cleanItemId).get();
    if (!docSnap.exists) {
      return res.status(404).json({ success: false, error: `Ocorrência #${cleanItemId} não encontrada no banco de dados.` });
    }

    const dbItem: any = docSnap.data();

    // 2. Authorization check: legitimate author, admin, or servidor
    const callerUid = req.authUser!.uid;
    const isAuthor = dbItem.registeredByUserId === callerUid;
    const isStaffOrAdmin = req.authUser!.isAdmin || req.authUser!.role === "SERVIDOR";

    if (!isAuthor && !isStaffOrAdmin) {
      console.warn(`[Discord Novas Perdas Security Alert] Usuário ${callerUid} tentou despachar notificação para item de terceiro (${cleanItemId}). Acesso negado.`);
      return res.status(403).json({
        success: false,
        error: "Acesso negado. Apenas o autor do cadastro ou servidores/administradores do IFPR podem notificar este item.",
      });
    }

    const normalizedType = String(dbItem.type || "").toUpperCase().trim();
    if (normalizedType !== "PERDIDO" && normalizedType !== "PERDA") {
      return res.status(400).json({
        success: false,
        error: `Ocorrência #${cleanItemId} possui tipo '${dbItem.type}' e não é um item PERDIDO/PERDA.`,
      });
    }

    // 3. Prevent duplicate Discord notification spam
    if (dbItem.discordNotified === true) {
      return res.json({
        success: true,
        message: "Item já notificado anteriormente no canal #novas-perdas.",
        itemId: cleanItemId,
        alreadyNotified: true,
      });
    }

    // 4. Sanitize and prepare verified item data
    const sanitizedItem = {
      id: cleanItemId,
      title: String(dbItem.title || "").trim().substring(0, 100),
      description: String(dbItem.description || "").trim().substring(0, 1000),
      category: String(dbItem.category || "Outros").trim().substring(0, 60),
      location: String(dbItem.location || "Campus IFPR").trim().substring(0, 120),
      status: String(dbItem.status || "PERDIDO").trim(),
      date: String(dbItem.date || new Date().toISOString().split("T")[0]).trim(),
      color: dbItem.color ? String(dbItem.color).trim().substring(0, 50) : undefined,
      brand: dbItem.brand ? String(dbItem.brand).trim().substring(0, 60) : undefined,
      imageUrl: (dbItem.imageUrl && (dbItem.imageUrl.startsWith("http://") || dbItem.imageUrl.startsWith("https://"))) ? dbItem.imageUrl : undefined,
      qrCodeId: dbItem.qrCodeId ? String(dbItem.qrCodeId).trim() : undefined,
      registeredByName: dbItem.registeredByName ? String(dbItem.registeredByName).trim() : undefined,
      registeredByRole: dbItem.registeredByRole ? String(dbItem.registeredByRole).trim() : undefined,
      createdAt: dbItem.createdAt || new Date().toISOString(),
      updatedAt: dbItem.updatedAt || undefined,
      type: "PERDIDO",
    };

    // Mark as notified to prevent duplicate calls
    docSnap.ref.update({
      discordNotified: true,
      discordNotifiedAt: new Date().toISOString(),
    }).catch(() => {});

    // Envio assíncrono e resiliente
    sendNovaPerdaToDiscord(sanitizedItem).catch((err) => {
      console.error("[Discord Novas Perdas Background Error]:", err);
    });

    return res.json({
      success: true,
      message: "Notificação de nova perda encaminhada para o canal #novas-perdas.",
      itemId: cleanItemId,
    });
  } catch (error: any) {
    console.error("Erro no endpoint notify-novas-perdas:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Erro ao processar notificação para o Discord.",
    });
  }
});



// Gemini Semantic Search Endpoint (Home Search Bar NL Search)
app.post(["/api/gemini/semantic-search", "/gemini/semantic-search"], requireAuth, aiRateLimiter, async (req, res) => {
  const userId = req.authUser!.uid;
  const userEmail = req.authUser?.email;
  const userRole = req.authUser?.role;

  try {
    const { query: searchQuery, items: candidateItems } = req.body;
    const cleanQuery = typeof searchQuery === "string" ? searchQuery.substring(0, 500) : "";
    const safeCandidates = Array.isArray(candidateItems) ? candidateItems.slice(0, 60) : [];
    const ai = getGenAIClient();

    if (!cleanQuery || safeCandidates.length === 0) {
      return res.json({ success: true, results: [], totalCandidates: 0 });
    }

    if (!ai) {
      logAIAudit({
        userId,
        userEmail,
        userRole,
        endpoint: "/api/gemini/semantic-search",
        action: "SEMANTIC_SEARCH",
        status: "FAILED",
        modelUsed: "gemini-3.7-flash",
        promptSnippet: cleanQuery,
        details: { error: "GEMINI_API_KEY não configurada no servidor." },
        ip: getClientIp(req),
      });

      return res.status(503).json({
        success: false,
        error: "A API do Google Gemini não está configurada no ambiente do servidor.",
      });
    }

    const itemsSummary = safeCandidates.map((c: any) => ({
      id: c.id,
      title: String(c.title || "").substring(0, 80),
      description: String(c.description || "").substring(0, 150),
      location: c.location,
      category: c.category,
      color: c.color,
      brand: c.brand,
      status: c.status,
      type: c.type,
    }));

    const systemInstruction = `Você é um motor de busca semântica inteligente para o Achados e Perdidos do IFPR Campus Ivaiporã.
Sua missão é receber a consulta em linguagem natural do usuário e identificar os objetos mais relevantes na lista fornecida.
Calcule a pontuação de relevância de 0 a 100 para cada objeto correspondente.
Retorne apenas itens com relevanceScore >= 40, ordenados do mais relevante para o menos relevante.`;

    const prompt = `Consulta do usuário: "${cleanQuery}"

Lista de objetos cadastrados no IFPR Campus Ivaiporã:
${JSON.stringify(itemsSummary, null, 2)}

Retorne a lista com os IDs dos itens correspondentes, nota de relevância de 0 a 100, breve explicação em português e palavras-chave destacadas.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            results: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  itemId: { type: Type.STRING, description: "ID único do item correspondente" },
                  relevanceScore: { type: Type.INTEGER, description: "Pontuação de 0 a 100" },
                  explanation: { type: Type.STRING, description: "Justificativa clara da correspondência semântica" },
                  highlightKeywords: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Termos ou pistas coincidentes",
                  },
                },
                required: ["itemId", "relevanceScore", "explanation", "highlightKeywords"],
              },
            },
          },
          required: ["results"],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{"results":[]}');

    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/gemini/semantic-search",
      action: "SEMANTIC_SEARCH",
      status: "SUCCESS",
      modelUsed: "gemini-3.7-flash",
      promptSnippet: cleanQuery,
      details: {
        candidatesCount: safeCandidates.length,
        resultsCount: parsed.results?.length || 0,
      },
      ip: getClientIp(req),
    });

    return res.json({
      success: true,
      results: parsed.results || [],
      modelUsed: "gemini-3.7-flash",
      totalCandidates: safeCandidates.length,
    });
  } catch (err: any) {
    console.error("Erro no endpoint /api/gemini/semantic-search:", err);
    const classified = classifyGeminiError(err);

    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/gemini/semantic-search",
      action: "SEMANTIC_SEARCH",
      status: "FAILED",
      modelUsed: "gemini-3.7-flash",
      details: { error: err.message, errorCode: classified.errorCode },
      ip: getClientIp(req),
    });

    return res.status(classified.statusCode).json({
      success: false,
      error: classified.message,
      code: classified.errorCode,
    });
  }
});

// Dedicated AI Security & Audit Logs Query Endpoint
app.get(["/api/ai/audit-logs", "/ai/audit-logs"], requireAuth, requireAdmin, (_req, res) => {
  res.json({
    success: true,
    totalRecords: aiAuditLogs.length,
    logs: aiAuditLogs.slice(0, 100),
  });
});

// Endpoint to export comprehensive monitoring & performance diagnostic logs
app.get(["/api/monitoring/export-logs", "/monitoring/export-logs"], requireAuth, requireAdmin, (req, res) => {
  try {
    const memory = process.memoryUsage();
    const payload = {
      institution: "Instituto Federal do Paraná (IFPR) - Campus Ivaiporã",
      system: "IFPR Achados & Perdidos - Monitoramento & Telemetria",
      exportedAt: new Date().toISOString(),
      requestedBy: req.authUser?.email || "anonymous_session",
      server: {
        uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
        startTime: new Date(serverStartTime).toISOString(),
        totalRequestsHandled: totalServerRequests,
        memoryUsage: {
          rssMB: Math.round(memory.rss / 1024 / 1024),
          heapTotalMB: Math.round(memory.heapTotal / 1024 / 1024),
          heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024),
          externalMB: Math.round(memory.external / 1024 / 1024),
        },
        nodeVersion: process.version,
        platform: process.platform,
      },
      systemConfig: globalSystemConfig,
      eventCounters,
      recentAnalyticsEvents: analyticsEvents.slice(0, 100),
      recentAIAuditEvents: aiAuditLogs.slice(0, 100),
      diagnosticsSummary: {
        status: "OPERATIONAL",
        healthCheck: "HEALTHY",
        totalAnalyticsEventsCaptured: analyticsEvents.length,
        totalAIAuditRecordsCaptured: aiAuditLogs.length,
      },
    };

    res.setHeader("Content-Disposition", `attachment; filename=Relatorio_Logs_Monitoramento_IFPR_${new Date().toISOString().slice(0, 10)}.json`);
    res.setHeader("Content-Type", "application/json");
    return res.json(payload);
  } catch (err: any) {
    return res.status(500).json({ error: "Erro ao gerar exportação de logs de monitoramento." });
  }
});

// API Endpoint: Automated Email Notification on Item Return (Requires Authorized Staff/Admin Session & Returned Item Verification)
app.post(["/api/automation/notify-item-returned", "/automation/notify-item-returned"], requireAuth, generalRateLimiter, async (req, res) => {
  let claimId = "";
  try {
    const { itemId, resolutionNotes } = req.body || {};

    if (!itemId || typeof itemId !== "string") {
      return res.status(400).json({
        success: false,
        error: "Identificador da ocorrência (itemId) é obrigatório.",
      });
    }

    const adminDb = getAdminFirestore();
    const devolutionAuth = await validateDevolutionNotificationAccess(adminDb, req.authUser!, itemId);
    if (!devolutionAuth.authorized) {
      return res.status(devolutionAuth.statusCode).json({
        success: false,
        error: devolutionAuth.errorMessage,
      });
    }

    // Fast check: If already completed according to Firestore read, return 200
    if (devolutionAuth.alreadyNotified) {
      return res.json({
        success: true,
        alreadyNotified: true,
        message: `A notificação de devolução referente ao item #${itemId} já foi despachada anteriormente.`,
      });
    }

    // Atomic Concurrency Claim with verifiable claimId: Ensure only one in-flight request can proceed and prevent stale overwrites
    claimId = `claim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    let claimResult: { status: "CLAIMED" | "IN_PROGRESS" | "ALREADY_COMPLETED"; freshData: any } = {
      status: "CLAIMED",
      freshData: devolutionAuth.itemData || {},
    };

    if (adminDb && typeof adminDb.runTransaction === "function") {
      claimResult = await adminDb.runTransaction(async (transaction: any) => {
        const itemRef = adminDb.collection("items").doc(itemId);
        const itemDoc = await transaction.get(itemRef);
        if (!itemDoc || !itemDoc.exists) {
          throw new Error("ITEM_NOT_FOUND");
        }
        const fresh = (typeof itemDoc.data === "function" ? itemDoc.data() : itemDoc.data) || {};

        if (
          fresh.devolutionNotified === true ||
          fresh.returnEmailNotified === true ||
          fresh.devolutionNotificationStatus === "COMPLETED"
        ) {
          return { status: "ALREADY_COMPLETED", freshData: fresh };
        }

        const now = Date.now();
        const claimedAtMs = fresh.devolutionNotificationClaimedAtMs || 0;
        const isStale = (now - claimedAtMs) > 60000; // 60-second recovery timeout

        if (fresh.devolutionNotificationStatus === "PROCESSING" && !isStale) {
          return { status: "IN_PROGRESS", freshData: fresh };
        }

        transaction.set(itemRef, {
          devolutionNotificationStatus: "PROCESSING",
          devolutionNotificationClaimId: claimId,
          devolutionNotificationClaimedAt: new Date().toISOString(),
          devolutionNotificationClaimedAtMs: now,
          devolutionNotificationClaimedBy: req.authUser!.uid,
        }, { merge: true });

        return { status: "CLAIMED", freshData: fresh };
      });
    }

    if (claimResult.status === "ALREADY_COMPLETED") {
      return res.json({
        success: true,
        alreadyNotified: true,
        message: `A notificação de devolução referente ao item #${itemId} já foi despachada anteriormente.`,
      });
    }

    if (claimResult.status === "IN_PROGRESS") {
      return res.status(409).json({
        success: false,
        inProgress: true,
        error: "Uma notificação de devolução para este item já está em processamento concorrente.",
        message: "O envio de notificação já foi iniciado por outra requisição. Aguarde a conclusão do processamento.",
      });
    }

    // Now outside of transaction: Resolve recipient email exclusively from trusted Firestore record
    const itemData = claimResult.freshData || devolutionAuth.itemData || {};
    const targetEmail = extractTrustedRecipientEmail(itemData);

    if (!targetEmail) {
      console.warn(`[Automation Devolution] Item #${itemId} não possui e-mail confiável de destinatário. Envio cancelado.`);
      if (adminDb) {
        try {
          await adminDb.runTransaction(async (transaction: any) => {
            const itemRef = adminDb.collection("items").doc(itemId);
            const itemDoc = await transaction.get(itemRef);
            if (itemDoc.exists) {
              const fresh = itemDoc.data() || {};
              if (fresh.devolutionNotificationClaimId === claimId) {
                transaction.set(itemRef, {
                  devolutionNotificationStatus: "FAILED",
                  devolutionNotificationLastError: "Nenhum e-mail de destinatário confiável registrado na ocorrência.",
                  devolutionNotificationFailedAt: new Date().toISOString(),
                }, { merge: true });
              }
            }
          });
        } catch (_) {}
      }

      return res.status(422).json({
        success: false,
        error: "Nenhum e-mail de destinatário confiável registrado na ocorrência. A notificação institucional foi cancelada para proteger a integridade dos dados e impedir envios arbitrários.",
      });
    }

    const sanitizedTitle = itemData.title || "Objeto Localizado";
    const targetName = itemData.recipientName || itemData.recipientSignatureName || itemData.registeredByName || "Comunidade IFPR";
    const targetQrCode = itemData.qrCodeId || itemId;
    const targetCategory = itemData.category || "Geral";
    const targetLocation = itemData.location || "Campus Ivaiporã";
    const targetResolutionNotes = resolutionNotes || itemData.resolutionNotes || "";
    const timestamp = new Date().toISOString();

    const emailSubject = `🎉 Seu objeto "${sanitizedTitle}" foi devolvido com sucesso! - IFPR Achados e Perdidos`;
    const emailBody = `Olá, ${targetName}!\n\n` +
      `Confirmamos que o seu objeto "${sanitizedTitle}" (Código QR: ${targetQrCode}), registrado no sistema de Achados e Perdidos do IFPR Campus Ivaiporã, foi marcado como DEVOLVIDO.\n\n` +
      `Detalhes do Registro:\n` +
      `- Objeto: ${sanitizedTitle}\n` +
      `- Categoria: ${targetCategory}\n` +
      `- Local: ${targetLocation}\n` +
      `- Data e Hora da Baixa: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n\n` +
      (targetResolutionNotes ? `Notas de encerramento: ${targetResolutionNotes}\n\n` : "") +
      `Agradecemos pela colaboração com a comunidade acadêmica do Instituto Federal do Paraná!\n\n` +
      `Atenciosamente,\n` +
      `Equipe de Apoio ao Estudante (SEBAC) & Portaria\n` +
      `Instituto Federal do Paraná - Campus Ivaiporã`;

    console.info(`[Automation Email] Notificação automática de devolução despachada para ${targetEmail} referente ao item #${itemId} por usuário ${req.authUser?.uid}.`);

    const transporter = getEmailTransporter();
    if (!transporter) {
      console.warn(`[Automation Devolution] SMTP não configurado no servidor. Envio de e-mail para o item #${itemId} cancelado.`);
      if (adminDb) {
        try {
          await adminDb.runTransaction(async (transaction: any) => {
            const itemRef = adminDb.collection("items").doc(itemId);
            const itemDoc = await transaction.get(itemRef);
            if (itemDoc.exists) {
              const fresh = itemDoc.data() || {};
              if (fresh.devolutionNotificationClaimId === claimId) {
                transaction.set(itemRef, {
                  devolutionNotificationStatus: "FAILED",
                  devolutionNotificationLastError: "Serviço SMTP não configurado no ambiente do servidor.",
                  devolutionNotificationFailedAt: new Date().toISOString(),
                }, { merge: true });
              }
            }
          });
        } catch (_) {}
      }

      return res.status(503).json({
        success: false,
        error: "O serviço de envio de e-mail (SMTP) não está configurado no servidor. A notificação de devolução não pôde ser despachada, mas o registro foi mantido em estado recuperável.",
        code: "SMTP_NOT_CONFIGURED",
      });
    }

    let mailInfo: any;
    try {
      const fromAddress = process.env.SMTP_FROM || `"IFPR Achados & Perdidos" <${process.env.SMTP_USER || "campus.ivaipora@ifpr.edu.br"}>`;
      mailInfo = await transporter.sendMail({
        from: fromAddress,
        to: targetEmail,
        subject: emailSubject,
        text: emailBody,
      });
      console.info(`[Automation Email Success] E-mail real de devolução aceito pelo SMTP para ${targetEmail}. MessageId: ${mailInfo?.messageId}`);
    } catch (smtpErr: any) {
      console.error(`[Automation Email Error] Falha no transporte SMTP para ${targetEmail}:`, smtpErr);
      if (adminDb) {
        try {
          await adminDb.runTransaction(async (transaction: any) => {
            const itemRef = adminDb.collection("items").doc(itemId);
            const itemDoc = await transaction.get(itemRef);
            if (itemDoc.exists) {
              const fresh = itemDoc.data() || {};
              if (fresh.devolutionNotificationClaimId === claimId) {
                transaction.set(itemRef, {
                  devolutionNotificationStatus: "FAILED",
                  devolutionNotificationLastError: smtpErr?.message || String(smtpErr),
                  devolutionNotificationFailedAt: new Date().toISOString(),
                }, { merge: true });
              }
            }
          });
        } catch (_) {}
      }

      return res.status(502).json({
        success: false,
        error: "Falha ao enviar e-mail via SMTP. O servidor de e-mail rejeitou ou não pôde entregar a mensagem.",
        code: "SMTP_TRANSPORT_ERROR",
        details: process.env.NODE_ENV !== "production" ? (smtpErr?.message || String(smtpErr)) : undefined,
      });
    }

    if (adminDb) {
      try {
        const notifDocId = `email_auto_${itemId}_ITEM_RETURNED`;
        await adminDb.collection("email_notifications").doc(notifDocId).set({
          id: notifDocId,
          itemId,
          itemTitle: sanitizedTitle,
          recipientEmail: targetEmail,
          recipientName: targetName,
          subject: emailSubject,
          body: emailBody,
          type: "ITEM_RETURNED_AUTOMATION",
          status: "SENT",
          messageId: mailInfo?.messageId || null,
          sentAt: timestamp,
          createdAt: timestamp,
          triggeredByUserId: req.authUser!.uid,
        }, { merge: true });

        let completedSuccessfully = false;
        if (typeof adminDb.runTransaction === "function") {
          await adminDb.runTransaction(async (transaction: any) => {
            const itemRef = adminDb.collection("items").doc(itemId);
            const itemDoc = await transaction.get(itemRef);
            if (itemDoc.exists) {
              const fresh = itemDoc.data() || {};
              if (fresh.devolutionNotificationClaimId === claimId) {
                transaction.set(itemRef, {
                  devolutionNotified: true,
                  returnEmailNotified: true,
                  devolutionNotificationStatus: "COMPLETED",
                  devolutionNotifiedAt: timestamp,
                  devolutionNotifiedBy: req.authUser!.uid,
                }, { merge: true });
                completedSuccessfully = true;
              }
            }
          });
        } else {
          await adminDb.collection("items").doc(itemId).set({
            devolutionNotified: true,
            returnEmailNotified: true,
            devolutionNotificationStatus: "COMPLETED",
            devolutionNotifiedAt: timestamp,
            devolutionNotifiedBy: req.authUser!.uid,
          }, { merge: true });
          completedSuccessfully = true;
        }

        if (!completedSuccessfully) {
          console.warn(`[Automation Warning] Tentativa com claimId ${claimId} foi superada/expirada antes da persistência final. Registro de e-mail criado, mas status do item não foi sobrescrito.`);
        }
      } catch (dbErr: any) {
        console.error("[Automation Error] Falha ao persistir conclusão de e-mail no Firestore:", dbErr);
        try {
          if (typeof adminDb.runTransaction === "function") {
            await adminDb.runTransaction(async (transaction: any) => {
              const itemRef = adminDb.collection("items").doc(itemId);
              const itemDoc = await transaction.get(itemRef);
              if (itemDoc.exists) {
                const fresh = itemDoc.data() || {};
                if (fresh.devolutionNotificationClaimId === claimId) {
                  transaction.set(itemRef, {
                    devolutionNotificationStatus: "FAILED",
                    devolutionNotificationLastError: dbErr?.message || String(dbErr),
                    devolutionNotificationFailedAt: new Date().toISOString(),
                  }, { merge: true });
                }
              }
            });
          }
        } catch (_) {}
        throw dbErr;
      }
    }

    return res.json({
      success: true,
      message: `E-mail de confirmação de devolução enviado via SMTP para ${targetEmail}.`,
      subject: emailSubject,
      recipientEmail: targetEmail,
      messageId: mailInfo?.messageId || null,
      timestamp,
    });
  } catch (error: any) {
    if (error?.message === "ITEM_NOT_FOUND") {
      return res.status(404).json({ success: false, error: "Ocorrência não encontrada no Firestore." });
    }
    console.error("Erro na rota /api/automation/notify-item-returned:", error);
    return res.status(500).json({
      success: false,
      error: error?.message || "Erro interno ao processar e-mail de devolução.",
    });
  }
});

// API Endpoint: Verify Remote Digital Signature Token Authenticity
app.post(["/api/signature/verify-token", "/signature/verify-token"], generalRateLimiter, async (req, res) => {
  try {
    const { itemId, token } = req.body || {};

    if (!itemId || !token || typeof itemId !== "string" || typeof token !== "string") {
      return res.status(400).json({
        success: false,
        valid: false,
        reason: "MISSING_PARAMS",
        error: "Identificador do item (itemId) e token de autenticação são obrigatórios.",
      });
    }

    const cleanItemId = itemId.trim();
    const cleanToken = token.trim();
    if (!cleanItemId || cleanItemId.includes("/") || !cleanToken) {
      return res.status(400).json({
        success: false,
        valid: false,
        reason: "MISSING_PARAMS",
        error: "Identificador do item (itemId) e token de autenticação válidos são obrigatórios.",
      });
    }

    const adminDb = getAdminFirestore();
    if (!adminDb) {
      return res.status(503).json({
        success: false,
        valid: false,
        reason: "SERVICE_UNAVAILABLE",
        error: "Banco de dados Firestore Admin indisponível no momento.",
      });
    }

    let itemData: any = null;
    let sigReqExists = false;
    let sigData: any = null;

    const itemRef = adminDb.collection("items").doc(cleanItemId);
    const privRef = adminDb.collection("item_return_records").doc(cleanItemId);
    const sigReqRef = adminDb.collection("signature_requests").doc(cleanItemId);

    if (typeof adminDb.runTransaction === "function") {
      await adminDb.runTransaction(async (transaction: any) => {
        const docSnap = await transaction.get(itemRef);
        const privSnap = await transaction.get(privRef);
        const sigReqSnap = await transaction.get(sigReqRef);
        const rawItemData = docSnap?.exists
          ? typeof docSnap.data === "function"
            ? docSnap.data()
            : docSnap.data
          : null;
        const privData = privSnap?.exists
          ? typeof privSnap.data === "function"
            ? privSnap.data()
            : privSnap.data
          : null;
        if (rawItemData) {
          itemData = mergePublicAndPrivateItemData(rawItemData, privData);
        }
        if (sigReqSnap?.exists) {
          sigReqExists = true;
          sigData = typeof sigReqSnap.data === "function" ? sigReqSnap.data() : sigReqSnap.data;
        }
      });
    } else {
      const [docSnap, privSnap, sigReqSnap] = await Promise.all([
        itemRef.get(),
        privRef.get(),
        sigReqRef.get(),
      ]);
      const rawItemData = docSnap?.exists
        ? typeof docSnap.data === "function"
          ? docSnap.data()
          : docSnap.data
        : null;
      const privData = privSnap?.exists
        ? typeof privSnap.data === "function"
          ? privSnap.data()
          : privSnap.data
        : null;
      if (rawItemData) {
        itemData = mergePublicAndPrivateItemData(rawItemData, privData);
      }
      if (sigReqSnap?.exists) {
        sigReqExists = true;
        sigData = typeof sigReqSnap.data === "function" ? sigReqSnap.data() : sigReqSnap.data;
      }
    }

    if (!itemData) {
      return res.status(404).json({
        success: false,
        valid: false,
        reason: "NOT_FOUND",
        error: `Ocorrência #${cleanItemId} não encontrada no banco de dados do IFPR.`,
      });
    }

    // 1. Check invalidated token first (e.g. after administrative reopen)
    if (sigReqExists && sigData?.invalidated === true) {
      return res.status(410).json({
        success: false,
        valid: false,
        reason: "TOKEN_INVALIDATED",
        error: "Esta solicitação de assinatura foi invalidada após reabertura administrativa ou cancelamento.",
      });
    }

    // 2. Reject terminal closed states
    if (itemData.status === "ENCERRADO") {
      return res.status(400).json({
        success: false,
        valid: false,
        reason: "INVALID_STATUS",
        error: "Esta ocorrência foi encerrada e não pode mais receber assinaturas.",
      });
    }

    // 3. Token authenticity check BEFORE returning isAlreadySigned or item PII (Finding E & A)
    let tokenMatched = false;
    let tokenExpiresAt = itemData.signatureTokenExpiresAt;
    const tokenHash = crypto.createHash("sha256").update(cleanToken).digest("hex");

    if (sigReqExists && sigData) {
      if (sigData.expiresAt) {
        tokenExpiresAt = sigData.expiresAt;
      }
      if (sigData.tokenHash && sigData.tokenHash === tokenHash) {
        tokenMatched = true;
      } else if (sigData.token && String(sigData.token).trim() === cleanToken) {
        tokenMatched = true;
      }
    }

    // Legacy fallback ONLY when token still exists directly on itemData
    if (!tokenMatched && itemData.signatureToken) {
      if (String(itemData.signatureToken).trim() === cleanToken) {
        tokenMatched = true;
      }
    }

    if (!tokenMatched) {
      return res.status(403).json({
        success: false,
        valid: false,
        reason: "TOKEN_MISMATCH",
        error: "O token fornecido na URL é inválido, foi revogado ou não corresponde à solicitação ativa deste objeto no IFPR.",
      });
    }

    // 4. Safe Idempotency Recovery ONLY after validating token authenticity
    const isAlreadySigned =
      itemData.recipientSignatureStatus === "SIGNED" &&
      Boolean(itemData.receiptValidationCode);

    if (isAlreadySigned) {
      return res.json({
        success: true,
        valid: true,
        isAlreadySigned: true,
        signedAt: itemData.signedAt || itemData.resolutionDate || "",
        receiptValidationCode: itemData.receiptValidationCode,
        recipientSignatureUrl: itemData.recipientSignatureUrl || "",
        item: {
          id: itemData.id || cleanItemId,
          title: itemData.title,
          category: itemData.category,
          location: itemData.location,
          imageUrl: itemData.imageUrl,
          recipientName: itemData.recipientName || itemData.recipientSignatureName,
          recipientEmail: itemData.recipientEmail || itemData.recipientSignatureEmail,
          recipientBond: itemData.recipientBond || itemData.recipientSignatureBond,
          recipientDocument: itemData.recipientDocument,
          returnedByName: itemData.returnedByName,
          returnDate: itemData.returnDate,
          status: itemData.status,
          recipientSignatureStatus: itemData.recipientSignatureStatus,
          recipientSignatureUrl: itemData.recipientSignatureUrl || "",
          staffSignatureStatus: itemData.staffSignatureStatus,
          staffSignatureUrl: itemData.staffSignatureUrl || "",
          receiptValidationCode: itemData.receiptValidationCode,
          signedAt: itemData.signedAt || itemData.resolutionDate || "",
        },
      });
    }

    // 5. Reject already consumed requests
    if ((sigReqExists && sigData?.used) || itemData.signatureTokenUsed) {
      return res.status(400).json({
        success: false,
        valid: false,
        reason: "ALREADY_PROCESSED",
        error: "Esta solicitação de assinatura já foi utilizada e não pode ser reutilizada.",
      });
    }

    // 6. State verification: Item must be pending remote signature OR available with active non-invalidated request
    const isPendingRemote =
      itemData.status === "DEVOLVIDO" &&
      itemData.recipientSignatureStatus === "PENDING_REMOTE" &&
      itemData.recipientSignatureType === "REMOTE_EMAIL";
    const isAvailableForReturn =
      itemData.status === "DISPONIVEL" ||
      itemData.status === "ENCONTRADO" ||
      itemData.status === "PROPRIETARIO_IDENTIFICADO";

    if (!isPendingRemote && !(isAvailableForReturn && ((sigReqExists && !sigData?.invalidated && !sigData?.used) || Boolean(itemData.signatureToken)))) {
      return res.status(400).json({
        success: false,
        valid: false,
        reason: "INVALID_STATUS",
        error: `Operação não permitida: O item #${cleanItemId} possui status '${itemData.status || "DESCONHECIDO"}' e não está aguardando assinatura remota.`,
      });
    }

    // 7. Expiration Verification
    if (tokenExpiresAt) {
      const expTime = new Date(tokenExpiresAt).getTime();
      if (!isNaN(expTime) && expTime < Date.now()) {
        return res.status(410).json({
          success: false,
          valid: false,
          reason: "TOKEN_EXPIRED",
          error: "O link de assinatura digital expirou por motivos de segurança. Solicite um novo envio à equipe de atendimento do IFPR.",
        });
      }
    }

    return res.json({
      success: true,
      valid: true,
      isAlreadySigned: false,
      recipientSignatureUrl: itemData.recipientSignatureUrl || "",
      item: {
        id: itemData.id || cleanItemId,
        title: itemData.title,
        category: itemData.category,
        location: itemData.location,
        imageUrl: itemData.imageUrl,
        recipientName: itemData.recipientName || itemData.recipientSignatureName,
        recipientEmail: itemData.recipientEmail || itemData.recipientSignatureEmail,
        recipientBond: itemData.recipientBond || itemData.recipientSignatureBond,
        recipientDocument: itemData.recipientDocument,
        returnedByName: itemData.returnedByName,
        returnDate: itemData.returnDate,
        status: itemData.status,
        recipientSignatureStatus: itemData.recipientSignatureStatus,
        recipientSignatureUrl: itemData.recipientSignatureUrl || "",
        staffSignatureStatus: itemData.staffSignatureStatus,
        receiptValidationCode: itemData.receiptValidationCode,
      },
    });
  } catch (error: any) {
    console.error("Erro na validação do token de assinatura:", error?.message || error);
    return res.status(500).json({
      success: false,
      valid: false,
      error: "Erro interno ao validar autenticidade do token no servidor.",
    });
  }
});

// API Endpoint: Confirm and Finalize Remote Digital Signature with Token Verification & Atomic Concurrency Guard
app.post(["/api/signature/confirm-signature", "/signature/confirm-signature"], generalRateLimiter, async (req, res) => {
  try {
    const { itemId, token, signatureDataUrl, signatureMethod, documentNumber, signerName, signerEmail, signerBond } = req.body || {};

    if (!itemId || !token || !signatureDataUrl || typeof itemId !== "string" || typeof token !== "string") {
      return res.status(400).json({
        success: false,
        error: "Parâmetros obrigatórios ausentes ou inválidos (itemId, token, signatureDataUrl).",
      });
    }

    const cleanItemId = itemId.trim();
    const cleanToken = token.trim();
    if (!cleanItemId || cleanItemId.includes("/") || !cleanToken) {
      return res.status(400).json({
        success: false,
        error: "Parâmetros obrigatórios ausentes ou inválidos (itemId, token).",
      });
    }

    // Phase 4: Rigorous Signature Payload Validation (Anti-Malformation & Anti-DoS)
    if (typeof signatureDataUrl !== "string") {
      return res.status(400).json({
        success: false,
        error: "O payload da assinatura deve ser uma string Base64 válida.",
      });
    }

    // Limit size to maximum ~250KB (350,000 base64 chars) to protect Firestore document quota (1MB)
    if (signatureDataUrl.length > 350000) {
      return res.status(400).json({
        success: false,
        error: "A imagem da assinatura excede o limite máximo permitido de 250KB.",
      });
    }

    // Validate MIME prefix and standard base64 character set
    const base64ImageRegex = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
    if (!base64ImageRegex.test(signatureDataUrl.trim())) {
      return res.status(400).json({
        success: false,
        error: "Payload da assinatura inválido. A imagem deve estar no formato Base64 (PNG, JPEG ou WEBP).",
      });
    }

    const adminDb = getAdminFirestore();
    if (!adminDb) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados Firestore Admin indisponível no momento.",
      });
    }

    const docRef = adminDb.collection("items").doc(cleanItemId);
    const privRef = adminDb.collection("item_return_records").doc(cleanItemId);
    const sigReqRef = adminDb.collection("signature_requests").doc(cleanItemId);
    const now = new Date();
    const nowIso = now.toISOString();
    const tokenHash = crypto.createHash("sha256").update(cleanToken).digest("hex");

    let finalValidationCode = "";
    let effectiveSignerName = "";
    let effectiveSignerBond = "";
    let itemTitle = "";
    let isIdempotentReturn = false;
    let capturedItemData: any = null;

    // Atomic Execution via Firestore Transaction to prevent race conditions and duplicate signature confirms
    await adminDb.runTransaction(async (transaction: any) => {
      const docSnap = await transaction.get(docRef);
      const privSnap = await transaction.get(privRef);
      const sigReqSnap = await transaction.get(sigReqRef);

      if (!docSnap.exists) {
        throw new Error("ITEM_NOT_FOUND");
      }

      const rawItemData = (typeof docSnap.data === "function" ? docSnap.data() : docSnap.data) || {};
      const privData = privSnap?.exists ? ((typeof privSnap.data === "function" ? privSnap.data() : privSnap.data) || {}) : null;
      const itemData = mergePublicAndPrivateItemData(rawItemData, privData);
      const sigData = sigReqSnap?.exists ? ((typeof sigReqSnap.data === "function" ? sigReqSnap.data() : sigReqSnap.data) || {}) : null;
      capturedItemData = itemData;
      itemTitle = itemData.title || cleanItemId;

      // 1. Invalidation check (e.g. after administrative reopen)
      if (sigReqSnap?.exists && sigData?.invalidated === true) {
        throw new Error("TOKEN_INVALIDATED");
      }

      // 2. Reject terminal closed items
      if (itemData.status === "ENCERRADO") {
        throw new Error("INVALID_STATUS");
      }

      // 3. Token authenticity check BEFORE idempotency return (prevents forged token bypassing auth)
      let tokenMatched = false;
      let tokenExpiresAt = itemData.signatureTokenExpiresAt;

      if (sigReqSnap?.exists && sigData) {
        if (sigData.expiresAt) {
          tokenExpiresAt = sigData.expiresAt;
        }
        if (sigData.tokenHash && sigData.tokenHash === tokenHash) {
          tokenMatched = true;
        } else if (sigData.token && String(sigData.token).trim() === cleanToken) {
          tokenMatched = true;
        }
      }

      if (!tokenMatched && itemData.signatureToken) {
        if (String(itemData.signatureToken).trim() === cleanToken) {
          tokenMatched = true;
        }
      }

      if (!tokenMatched) {
        throw new Error("TOKEN_MISMATCH");
      }

      // 4. Safe idempotency ONLY for holders of the verified token
      if (itemData.recipientSignatureStatus === "SIGNED" && itemData.receiptValidationCode) {
        finalValidationCode = itemData.receiptValidationCode;
        effectiveSignerName = itemData.recipientName || itemData.recipientSignatureName || "Receptor";
        effectiveSignerBond = itemData.recipientBond || itemData.recipientSignatureBond || "Aluno(a)";
        isIdempotentReturn = true;
        return;
      }

      // 5. Reject already consumed requests
      if ((sigReqSnap?.exists && sigData?.used) || itemData.signatureTokenUsed) {
        throw new Error("ALREADY_PROCESSED");
      }

      // 6. State Machine Eligibility Check
      const isPendingRemote =
        itemData.status === "DEVOLVIDO" &&
        itemData.recipientSignatureStatus === "PENDING_REMOTE" &&
        itemData.recipientSignatureType === "REMOTE_EMAIL";
      const isAvailable =
        itemData.status === "DISPONIVEL" ||
        itemData.status === "ENCONTRADO" ||
        itemData.status === "PROPRIETARIO_IDENTIFICADO";

      if (!isPendingRemote && !(isAvailable && ((sigReqSnap?.exists && !sigData?.invalidated && !sigData?.used) || Boolean(itemData.signatureToken)))) {
        throw new Error("INVALID_STATUS");
      }

      // 7. Expiration check
      if (tokenExpiresAt) {
        const expTime = new Date(tokenExpiresAt).getTime();
        if (!isNaN(expTime) && expTime < Date.now()) {
          throw new Error("TOKEN_EXPIRED");
        }
      }

      finalValidationCode = itemData.receiptValidationCode || `REC-IFPR-${cleanItemId.toUpperCase().slice(0, 6)}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
      effectiveSignerName = itemData.recipientName || signerName || "Receptor / Aluno IFPR";
      effectiveSignerBond = itemData.recipientBond || signerBond || "Aluno(a)";

      const privateHistoryLog = {
        id: `hist-sig-${Date.now()}`,
        action: "Assinatura Digital Remota Autenticada",
        actorId: "remote-token-auth",
        actorName: effectiveSignerName,
        actorRole: effectiveSignerBond === "Servidor" ? "SERVIDOR" : "ALUNO",
        timestamp: nowIso,
        details: `Termo assinado digitalmente via link validado por token privado no Firestore (${effectiveSignerName} - ${effectiveSignerBond}).`,
      };

      const publicHistoryLog = {
        id: privateHistoryLog.id,
        action: "Devolução institucional registrada",
        actorRole: "SERVIDOR",
        timestamp: nowIso,
        details: "Devolução institucional confirmada no sistema.",
      };

      const existingPrivateHistory = itemData.history || itemData.historyLogs || [];
      const existingPublicHistory = sanitizePublicItemDocument(rawItemData).history || [];
      const deleteMarker = typeof FieldValue?.delete === "function" ? FieldValue.delete() : null;

      // 1. Public catalog document (/items/{cleanItemId}): keep ONLY public status & sanitized history, purge all private/PII fields
      transaction.update(docRef, {
        ...buildPublicFieldDeletionMap(deleteMarker),
        status: "DEVOLVIDO",
        resolutionDate: itemData.resolutionDate || nowIso,
        history: [...existingPublicHistory, publicHistoryLog],
        historyLogs: [...existingPublicHistory, publicHistoryLog],
      });

      // 2. Private return record (/item_return_records/{cleanItemId}): store all PII, signature URL, and validation code
      transaction.set(
        privRef,
        {
          itemId: cleanItemId,
          status: "DEVOLVIDO",
          recipientSignatureUrl: signatureDataUrl,
          recipientSignatureType: "REMOTE_EMAIL",
          recipientSignatureMethod: signatureMethod || (signatureDataUrl.includes("type") ? "TYPED_NAME" : "DRAWN"),
          recipientSignatureStatus: "SIGNED",
          staffSignatureStatus: itemData.staffSignatureStatus === "SIGNED" ? "SIGNED" : "PENDING_STAFF",
          recipientDocument: documentNumber || itemData.recipientDocument || "",
          recipientName: effectiveSignerName,
          recipientBond: effectiveSignerBond,
          recipientEmail: itemData.recipientEmail || signerEmail || "",
          returnedByUserId: itemData.returnedByUserId || sigData?.dispatchedByUserId || "",
          returnedByName: itemData.returnedByName || "",
          returnedByRole: itemData.returnedByRole || "SERVIDOR",
          returnDate: itemData.returnDate || "",
          returnTime: itemData.returnTime || "",
          signedAt: nowIso,
          resolutionDate: itemData.resolutionDate || nowIso,
          receiptValidationCode: finalValidationCode,
          signatureTokenUsed: true,
          signatureToken: null,
          privateHistory: [...existingPrivateHistory, privateHistoryLog],
          privateHistoryLogs: [...existingPrivateHistory, privateHistoryLog],
          updatedAt: nowIso,
        },
        { merge: true }
      );

      // 3. Mark private signature request as consumed while preserving tokenHash for safe idempotent re-check
      transaction.set(
        sigReqRef,
        {
          itemId: cleanItemId,
          tokenHash,
          encryptedToken: deleteMarker,
          used: true,
          usedAt: nowIso,
          invalidated: false,
          validationCode: finalValidationCode,
          signedBy: effectiveSignerName,
          signatureMethod: signatureMethod || "DRAWN",
        },
        { merge: true }
      );
    });

    console.info(`[Signature Finalized] Item #${cleanItemId} teve devolução remota concluída com sucesso. Validação: ${finalValidationCode}`);

    if (isIdempotentReturn) {
      return res.json({
        success: true,
        alreadyCompleted: true,
        message: "Assinatura digital já confirmada anteriormente.",
        validationCode: finalValidationCode,
        recipientSignatureUrl: capturedItemData?.recipientSignatureUrl || "",
        signedAt: capturedItemData?.signedAt || capturedItemData?.resolutionDate || "",
      });
    }

      // Phase 2: Dispatch institutional notification email to the specific issuer (emissor) requesting attestation signature
    try {
      const sigReqSnap = await adminDb.collection("signature_requests").doc(itemId).get();
      const sigReqData = sigReqSnap.exists ? sigReqSnap.data() : {};
      const issuerUid = capturedItemData?.returnedByUserId || sigReqData?.dispatchedByUserId;

      let staffTargetEmail = "";
      let issuerName = "Servidor Emissor Responsável";

      if (issuerUid) {
        try {
          const issuerDoc = await adminDb.collection("users").doc(issuerUid).get();
          if (issuerDoc.exists) {
            const uData = issuerDoc.data() || {};
            if (uData.email) {
              staffTargetEmail = uData.email.trim();
              if (uData.name) {
                issuerName = uData.name.trim();
              }
            }
          }
        } catch (lookupErr) {
          console.warn(`[Signature Warning] Falha ao buscar e-mail do emissor (${issuerUid}):`, lookupErr);
        }
      }

      if (!staffTargetEmail) {
        console.warn(`[Signature Notice] E-mail do emissor responsável não encontrado para a devolução do item #${itemId}. Notificação SMTP omitida (não é feito fallback para e-mail genérico).`);
        const notifDocId = `staff_notif_${itemId}_${Date.now()}`;
        await adminDb.collection("email_notifications").doc(notifDocId).set({
          id: notifDocId,
          itemId,
          itemTitle: itemTitle || itemId,
          recipientEmail: "",
          recipientName: issuerName,
          subject: `📌 Assinatura Institucional Pendente: Devolução de "${itemTitle || itemId}" (#${itemId}) - IFPR`,
          type: "STAFF_SIGNATURE_PENDING_NOTIFICATION",
          status: "ERROR_NO_ISSUER_EMAIL",
          messageId: null,
          error: "E-mail do emissor responsável não encontrado para notificação.",
          sentAt: nowIso,
          createdAt: nowIso,
        });
      } else {
        const transporter = getEmailTransporter();
        const staffSubject = `📌 Assinatura Institucional Pendente: Devolução de "${itemTitle || itemId}" (#${itemId}) - IFPR`;
        const staffBody = `Atenção ${issuerName}:\n\n` +
          `O receptor ${effectiveSignerName} (${effectiveSignerBond}) assinou digitalmente a devolução do pertence "${itemTitle}" (#${itemId}).\n\n` +
          `O item encontra-se aguardando sua atestação e assinatura institucional no painel do Localiza+ (Aba: Assinaturas Pendentes).\n\n` +
          `Código de Validação do Recibo: ${finalValidationCode}\n\n` +
          `Acesse o sistema Localiza+ para atestar e assinar o recibo de devolução.`;

        const staffHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 20px; }
    .box { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background: #00843D; color: #ffffff; padding: 20px; text-align: center; }
    .header h2 { margin: 0; font-size: 18px; font-weight: 800; }
    .header p { margin: 4px 0 0 0; font-size: 12px; opacity: 0.9; }
    .content { padding: 24px; font-size: 13px; line-height: 1.6; color: #334155; }
    .info-card { background: #f1f5f9; border-radius: 12px; padding: 14px; margin: 16px 0; font-size: 12px; border-left: 4px solid #00843D; }
    .footer { padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="box">
    <div class="header">
      <h2>Instituto Federal do Paraná • Campus Ivaiporã</h2>
      <p>Sistema Localiza+ • Notificação de Devolução Assinada pelo Receptor</p>
    </div>
    <div class="content">
      <p>Prezado(a) <strong>${issuerName}</strong>,</p>
      <p>O receptor <strong>${effectiveSignerName}</strong> (${effectiveSignerBond}) concluiu a assinatura digital de recebimento do objeto <strong>"${itemTitle || itemId}"</strong> (#${itemId}).</p>
      <div class="info-card">
        <strong>Item:</strong> #${itemId} - ${itemTitle}<br/>
        <strong>Receptor:</strong> ${effectiveSignerName} (${effectiveSignerBond})<br/>
        <strong>Código de Validação:</strong> ${finalValidationCode}<br/>
        <strong>Status:</strong> AGUARDANDO SUA ASSINATURA INSTITUCIONAL COMO EMISSOR
      </div>
      <p>Por favor, acesse o painel administrativo do <strong>Localiza+</strong> na aba <strong>Assinaturas Pendentes</strong> para conferir e registrar sua atestação de devolução.</p>
    </div>
    <div class="footer">
      Seção de Apoio ao Estudante (SEBAC) & Portaria • IFPR Campus Ivaiporã
    </div>
  </div>
</body>
</html>
        `;

        let staffEmailSent = false;
        let staffMsgId = null;
        let staffEmailErr = null;

        if (transporter) {
          try {
            const fromAddr = process.env.SMTP_FROM || `"IFPR Achados & Perdidos" <${process.env.SMTP_USER || "campus.ivaipora@ifpr.edu.br"}>`;
            const info = await transporter.sendMail({
              from: fromAddr,
              to: staffTargetEmail,
              subject: staffSubject,
              text: staffBody,
              html: staffHtml,
            });
            staffEmailSent = true;
            staffMsgId = info.messageId;
            console.info(`[Staff Notification Success] Notificação enviada para o e-mail do emissor (${staffTargetEmail}). MessageId: ${info.messageId}`);
          } catch (mErr: any) {
            staffEmailErr = mErr?.message || String(mErr);
            console.error(`[Staff Notification Error] Falha ao enviar notificação por e-mail ao emissor:`, mErr);
          }
        }

        const notifDocId = `staff_notif_${itemId}_${Date.now()}`;
        await adminDb.collection("email_notifications").doc(notifDocId).set({
          id: notifDocId,
          itemId,
          itemTitle: itemTitle || itemId,
          recipientEmail: staffTargetEmail,
          recipientName: issuerName,
          subject: staffSubject,
          type: "STAFF_SIGNATURE_PENDING_NOTIFICATION",
          status: staffEmailSent ? "SENT" : "PENDING_SMTP_CONFIG",
          messageId: staffMsgId,
          error: staffEmailErr,
          sentAt: nowIso,
          createdAt: nowIso,
        });
      }
    } catch (staffNotifErr) {
      console.warn("[Signature Warning] Erro no fluxo de notificação do atendente:", staffNotifErr);
    }

    // Persist institutional activity & audit log in Firestore
    try {
      const activityLogId = `act-sig-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      await adminDb.collection("activity_logs").doc(activityLogId).set({
        id: activityLogId,
        adminId: "token-auth-system",
        adminName: `${effectiveSignerName} (${effectiveSignerBond})`,
        action: "REGISTRO_DEVOLUCAO",
        details: `Assinatura digital autenticada e baixa de devolução concluída para o objeto #${itemId} (${itemTitle}) pelo receptor ${effectiveSignerName} (${effectiveSignerBond}). Código de validação: ${finalValidationCode}`,
        timestamp: nowIso,
      });

      const auditLogId = `audit-sig-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      await adminDb.collection("audit_logs").doc(auditLogId).set({
        id: auditLogId,
        transactionId: `TX-RET-${Date.now().toString(36).toUpperCase()}`,
        objectId: itemId,
        objectType: "RETURN",
        objectTitle: itemTitle,
        action: "REGISTRO_DEVOLUCAO",
        actorId: "token-auth-system",
        actorName: `${effectiveSignerName} (${effectiveSignerBond})`,
        actorEmail: signerEmail || "",
        actorRole: effectiveSignerBond === "Servidor" ? "SERVIDOR" : "ALUNO",
        timestamp: nowIso,
        fieldChanged: "status_devolucao",
        oldValue: "ENCONTRADO",
        newValue: "DEVOLVIDO",
        details: `Assinatura digital autenticada e baixa de devolução concluída para o objeto #${itemId} (${itemTitle}). Código de validação: ${finalValidationCode}`,
        immutable: true,
      });
    } catch (actErr) {
      console.warn("[Signature Server] Aviso ao gravar activity_log no Firestore:", actErr);
    }

    return res.json({
      success: true,
      message: "Assinatura digital autenticada e baixa de devolução concluída com sucesso no banco de dados.",
      validationCode: finalValidationCode,
      recipientSignatureUrl: signatureDataUrl,
      signedAt: nowIso,
    });
  } catch (error: any) {
    if (error?.message === "ITEM_NOT_FOUND") {
      return res.status(404).json({ success: false, error: "Ocorrência não encontrada no Firestore." });
    }
    if (error?.message === "ALREADY_PROCESSED") {
      return res.status(400).json({ success: false, error: "Esta assinatura ou devolução já foi finalizada anteriormente." });
    }
    if (error?.message === "INVALID_STATUS") {
      return res.status(400).json({ success: false, error: "O item não se encontra em estado elegível para assinatura remota." });
    }
    if (error?.message === "TOKEN_MISMATCH") {
      return res.status(403).json({ success: false, error: "Token de assinatura inválido ou não autorizado para este objeto." });
    }
    if (error?.message === "TOKEN_EXPIRED") {
      return res.status(410).json({ success: false, error: "O link de assinatura digital expirou por motivos de segurança." });
    }
    if (error?.message === "TOKEN_INVALIDATED") {
      return res.status(410).json({ success: false, error: "Esta solicitação de assinatura foi invalidada após reabertura administrativa ou cancelamento." });
    }

    console.error("Erro ao confirmar assinatura remota no servidor:", error?.message || error);
    return res.status(500).json({
      success: false,
      error: "Erro interno ao finalizar assinatura no banco de dados.",
    });
  }
});

// API Endpoint: Confirm and Finalize Staff Attendant Signature (Requires Staff/Admin Authentication & Issuer Verification)
app.post(["/api/signature/confirm-staff-signature", "/signature/confirm-staff-signature"], requireAuth, generalRateLimiter, async (req, res) => {
  try {
    const adminDb = getAdminFirestore();
    const staffCheck = await validateStaffOrAdminAccess(adminDb, req.authUser!);
    if (!staffCheck.authorized) {
      return res.status(staffCheck.statusCode).json({
        success: false,
        error: staffCheck.errorMessage,
      });
    }

    const { itemId, signatureDataUrl, signatureMethod } = req.body || {};

    if (!itemId || !signatureDataUrl || typeof itemId !== "string" || typeof signatureDataUrl !== "string") {
      return res.status(400).json({
        success: false,
        error: "Parâmetros obrigatórios ausentes ou inválidos (itemId, signatureDataUrl).",
      });
    }

    // Payload size check (~250KB limit)
    if (signatureDataUrl.length > 350000) {
      return res.status(400).json({
        success: false,
        error: "A imagem da assinatura excede o limite máximo permitido de 250KB.",
      });
    }

    const base64ImageRegex = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
    if (!base64ImageRegex.test(signatureDataUrl.trim())) {
      return res.status(400).json({
        success: false,
        error: "Payload da assinatura inválido. A imagem deve estar no formato Base64 (PNG, JPEG ou WEBP).",
      });
    }

    if (!adminDb) {
      return res.status(500).json({
        success: false,
        error: "Banco de dados Firestore Admin indisponível no momento.",
      });
    }

    const docRef = adminDb.collection("items").doc(itemId);
    const privRef = adminDb.collection("item_return_records").doc(itemId);
    const sigReqRef = adminDb.collection("signature_requests").doc(itemId);
    const nowIso = new Date().toISOString();
    const signerUid = req.authUser!.uid;
    const signerEmail = req.authUser!.email || "servidor@ifpr.edu.br";
    
    // Server-trusted identity resolution from validated Firestore profile
    const signerName = staffCheck.signerName || req.authUser!.email?.split("@")[0] || "Servidor IFPR";

    let isIdempotent = false;
    let itemTitle = "";

    await adminDb.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(docRef);
      const privSnap = await transaction.get(privRef);
      if (!docSnap.exists) {
        throw new Error("ITEM_NOT_FOUND");
      }

      const rawItemData = (typeof docSnap.data === "function" ? docSnap.data() : docSnap.data) || {};
      const privData = privSnap?.exists ? ((typeof privSnap.data === "function" ? privSnap.data() : privSnap.data) || {}) : null;
      const itemData = mergePublicAndPrivateItemData(rawItemData, privData);
      itemTitle = itemData.title || itemId;

      // Strict Issuer Check: Only the specific issuer who emitted the return can sign
      let issuerUid = itemData.returnedByUserId;
      if (!issuerUid) {
        const sigReqSnap = await transaction.get(sigReqRef);
        if (sigReqSnap.exists) {
          issuerUid = sigReqSnap.data()?.dispatchedByUserId;
        }
      }

      // Devoluções sem emissor confiável não podem ser atestadas por terceiros
      if (!issuerUid) {
        throw new Error("MISSING_ISSUER_IDENTITY");
      }

      if (signerUid !== issuerUid) {
        throw new Error("UNAUTHORIZED_ISSUER_ONLY");
      }

      // Recipient signature must be completed first
      if (itemData.recipientSignatureStatus !== "SIGNED") {
        throw new Error("RECIPIENT_SIGNATURE_PENDING");
      }

      // Check if staff signature is already completed
      if (itemData.staffSignatureStatus === "SIGNED" && itemData.staffSignatureUrl) {
        isIdempotent = true;
        return;
      }

      const existingPrivateHistory = itemData.history || itemData.historyLogs || [];
      const privateHistoryLog = {
        id: `hist-staff-sig-${Date.now()}`,
        action: "Assinatura Institucional do Atendente Concluída",
        actorId: signerUid,
        actorName: signerName,
        actorRole: "SERVIDOR",
        timestamp: nowIso,
        details: `Servidor ${signerName} (${signerEmail}) atestou e assinou digitalmente a devolução do item #${itemId}.`,
      };

      const deleteMarker = typeof FieldValue?.delete === "function" ? FieldValue.delete() : null;

      // Keep public catalog document free of private return/signature/staff PII
      transaction.update(docRef, {
        ...buildPublicFieldDeletionMap(deleteMarker),
        status: "DEVOLVIDO",
      });

      // Persist staff attestation in restricted /item_return_records collection
      transaction.set(
        privRef,
        {
          itemId,
          status: "DEVOLVIDO",
          staffSignatureStatus: "SIGNED",
          staffSignatureMethod: signatureMethod || (signatureDataUrl.includes("type") ? "TYPED_NAME" : "DRAWN"),
          staffSignatureUrl: signatureDataUrl,
          staffSignedAt: nowIso,
          staffSignerUid: signerUid,
          staffSignerName: signerName,
          staffSignerEmail: signerEmail,
          returnedByUserId: issuerUid,
          returnedByName: itemData.returnedByName || signerName,
          returnedByRole: itemData.returnedByRole || "SERVIDOR",
          privateHistory: [...existingPrivateHistory, privateHistoryLog],
          privateHistoryLogs: [...existingPrivateHistory, privateHistoryLog],
          updatedAt: nowIso,
        },
        { merge: true }
      );
    });

    console.info(`[Staff Signature Success] Servidor ${signerName} assinou com sucesso a devolução do item #${itemId}.`);

    return res.json({
      success: true,
      alreadyCompleted: isIdempotent,
      message: isIdempotent ? "Assinatura do atendente já estava registrada." : "Assinatura do atendente registrada com sucesso no banco de dados.",
      staffSignedAt: nowIso,
      staffSignerName: signerName,
      staffSignatureUrl: signatureDataUrl,
    });
  } catch (error: any) {
    if (error?.message === "ITEM_NOT_FOUND") {
      return res.status(404).json({ success: false, error: "Ocorrência não encontrada no Firestore." });
    }
    if (error?.message === "MISSING_ISSUER_IDENTITY") {
      return res.status(409).json({
        success: false,
        error: "Devolução sem emissor identificado. A atestação não pode ser concluída sem a confirmação da autoria original.",
      });
    }
    if (error?.message === "UNAUTHORIZED_ISSUER_ONLY") {
      return res.status(403).json({
        success: false,
        error: "Apenas o servidor emissor responsável por registrar/liberar esta devolução pode atestar e assinar o termo.",
      });
    }
    if (error?.message === "RECIPIENT_SIGNATURE_PENDING") {
      return res.status(400).json({ success: false, error: "A assinatura do receptor deve ser concluída antes da atestação do atendente." });
    }

    console.error("Erro ao registrar assinatura do atendente:", error?.message || error);
    return res.status(500).json({
      success: false,
      error: "Erro interno ao registrar assinatura do atendente no banco de dados.",
    });
  }
});


// API Endpoint: Recover or Resend Remote Digital Signature Request via Email (Requires Staff/Admin Authentication & Strict Server Authority)
app.post(["/api/signature/send-request", "/signature/send-request"], requireAuth, generalRateLimiter, async (req, res) => {
  try {
    const adminDb = getAdminFirestore();
    const staffCheck = await validateStaffOrAdminAccess(adminDb, req.authUser!);
    if (!staffCheck.authorized) {
      return res.status(staffCheck.statusCode).json({
        success: false,
        error: staffCheck.errorMessage,
      });
    }

    const {
      itemId,
      mode = "EMAIL",
      originUrl,
      recipientEmail: bodyRecipientEmail,
      recipientName: bodyRecipientName,
      dispatchedByUserId: bodyDispatchedByUserId,
      returnedByUserId: bodyReturnedByUserId,
      issuerUid: bodyIssuerUid,
      signatureToken: bodySignatureToken,
      signatureLink: bodySignatureLink,
      used: bodyUsed,
    } = req.body || {};

    if (!itemId || typeof itemId !== "string" || !itemId.trim() || itemId.includes("/")) {
      return res.status(400).json({
        success: false,
        error: "Identificador da ocorrência (itemId) obrigatório e válido.",
      });
    }

    if (mode !== "EMAIL" && mode !== "LINK_ONLY") {
      return res.status(400).json({
        success: false,
        error: "Modalidade de operação inválida. Utilize 'EMAIL' ou 'LINK_ONLY'.",
      });
    }

    // Block explicit attempts by client to supply arbitrary signature tokens/links or reset consumption flag
    if (bodySignatureToken !== undefined || bodySignatureLink !== undefined) {
      return res.status(400).json({
        success: false,
        error: "Tokens e links de assinatura são emitidos exclusivamente pelo servidor.",
      });
    }
    if (bodyUsed === false) {
      return res.status(403).json({
        success: false,
        error: "Não é permitido redefinir o estado de consumo de uma solicitação de assinatura pelo cliente.",
      });
    }

    if (!adminDb) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados Firestore Admin indisponível.",
      });
    }

    // Fail closed if encryption secret is missing/invalid
    try {
      getSignatureEncryptionKeyring();
    } catch (keyErr: any) {
      if (keyErr?.message === "SIGNATURE_ENCRYPTION_KEY_MISSING") {
        return res.status(503).json({
          success: false,
          code: "SIGNATURE_ENCRYPTION_KEY_MISSING",
          error: "Configuração criptográfica SIGNATURE_TOKEN_SECRET ausente ou inválida no servidor.",
        });
      }
      throw keyErr;
    }

    const cleanItemId = itemId.trim();
    const isRootAdmin = evaluateRootAdminAuth(req.authUser!).isRoot;
    const isAdminCaller = isRootAdmin || staffCheck.userData?.role === "ADMIN";
    const callerRole: "ADMIN" | "SERVIDOR" = isAdminCaller ? "ADMIN" : "SERVIDOR";
    const callerName = staffCheck.signerName || staffCheck.userData?.name || req.authUser!.email?.split("@")[0] || "Servidor IFPR";

    const timestamp = new Date().toISOString();
    let itemTitle = cleanItemId;
    let persistedRecipientEmail = "";
    let persistedRecipientName = "Receptor IFPR";
    let persistedRecipientBond = "Aluno(a)";
    let persistedIssuerUid = "";
    let persistedIssuerName = "SEBAC / Portaria";
    let resolvedRawToken = "";
    let resolvedExpiresAt = "";
    let reissuedExpiredToken = false;

    const itemRef = adminDb.collection("items").doc(cleanItemId);
    const privRef = adminDb.collection("item_return_records").doc(cleanItemId);
    const sigReqRef = adminDb.collection("signature_requests").doc(cleanItemId);

    const runSendRequestTx = async (transaction: any) => {
      const itemSnap = await transaction.get(itemRef);
      const privSnap = await transaction.get(privRef);
      const sigReqSnap = await transaction.get(sigReqRef);

      if (!itemSnap?.exists) {
        throw new Error("ITEM_NOT_FOUND");
      }

      const rawItemData = (typeof itemSnap.data === "function" ? itemSnap.data() : itemSnap.data) || {};
      const privData = privSnap?.exists ? ((typeof privSnap.data === "function" ? privSnap.data() : privSnap.data) || {}) : null;
      const itemData = mergePublicAndPrivateItemData(rawItemData, privData);
      const sigData = sigReqSnap?.exists ? ((typeof sigReqSnap.data === "function" ? sigReqSnap.data() : sigReqSnap.data) || {}) : null;

      itemTitle = itemData.title || cleanItemId;

      if (itemData.status === "ENCERRADO") {
        throw new Error("ITEM_CLOSED");
      }

      if (
        itemData.recipientSignatureStatus === "SIGNED" ||
        Boolean(itemData.recipientSignatureUrl) ||
        itemData.signatureTokenUsed === true
      ) {
        throw new Error("ALREADY_SIGNED");
      }

      if (sigReqSnap?.exists && sigData?.used === true) {
        throw new Error("REQUEST_ALREADY_USED");
      }

      if (sigReqSnap?.exists && sigData?.invalidated === true) {
        throw new Error("REQUEST_INVALIDATED");
      }

      // Item must genuinely be in an active remote return flow
      if (
        itemData.status !== "DEVOLVIDO" ||
        itemData.recipientSignatureStatus !== "PENDING_REMOTE" ||
        itemData.recipientSignatureType !== "REMOTE_EMAIL"
      ) {
        throw new Error("NOT_ELIGIBLE_PENDING_REMOTE");
      }

      persistedIssuerUid = itemData.returnedByUserId || sigData?.dispatchedByUserId || "";
      if (!persistedIssuerUid) {
        throw new Error("MISSING_ISSUER_IDENTITY");
      }

      // Block attempts to substitute original issuer via request body or unauthorized staff caller
      if (
        (typeof bodyDispatchedByUserId === "string" && bodyDispatchedByUserId.trim() && bodyDispatchedByUserId.trim() !== persistedIssuerUid) ||
        (typeof bodyReturnedByUserId === "string" && bodyReturnedByUserId.trim() && bodyReturnedByUserId.trim() !== persistedIssuerUid) ||
        (typeof bodyIssuerUid === "string" && bodyIssuerUid.trim() && bodyIssuerUid.trim() !== persistedIssuerUid)
      ) {
        throw new Error("ISSUER_OVERRIDE_FORBIDDEN");
      }

      if (req.authUser!.uid !== persistedIssuerUid && !isAdminCaller) {
        throw new Error("UNAUTHORIZED_ISSUER_ONLY");
      }

      persistedIssuerName = itemData.returnedByName || sigData?.returnedByName || "SEBAC / Portaria";
      persistedRecipientEmail = String(itemData.recipientEmail || sigData?.recipientEmail || "").trim();
      persistedRecipientName = String(itemData.recipientName || sigData?.recipientName || "Receptor IFPR").trim();
      persistedRecipientBond = String(itemData.recipientBond || sigData?.recipientBond || "Aluno(a)").trim();

      if (!persistedRecipientEmail) {
        throw new Error("MISSING_RECIPIENT_EMAIL");
      }

      // Block attempts to hijack or replace persisted recipient via request body
      if (
        typeof bodyRecipientEmail === "string" &&
        bodyRecipientEmail.trim() &&
        bodyRecipientEmail.trim().toLowerCase() !== persistedRecipientEmail.toLowerCase()
      ) {
        throw new Error("RECIPIENT_TAMPER_FORBIDDEN");
      }
      if (
        typeof bodyRecipientName === "string" &&
        bodyRecipientName.trim() &&
        bodyRecipientName.trim().toLowerCase() !== persistedRecipientName.toLowerCase()
      ) {
        throw new Error("RECIPIENT_TAMPER_FORBIDDEN");
      }

      const existingExpiresAt = sigData?.expiresAt || itemData.signatureTokenExpiresAt;
      const expMs = existingExpiresAt ? Date.parse(String(existingExpiresAt)) : NaN;
      const isExpired = !existingExpiresAt || Number.isNaN(expMs) || expMs < Date.now();

      if (!isExpired && sigData?.tokenHash) {
        // Recover active non-expired token without invalidating previously sent links
        const decryptedMeta = sigData?.encryptedToken ? decryptSignatureTokenWithMetadata(sigData.encryptedToken) : null;
        if (decryptedMeta && crypto.createHash("sha256").update(decryptedMeta.token).digest("hex") === sigData.tokenHash) {
          resolvedRawToken = decryptedMeta.token;
          resolvedExpiresAt = String(existingExpiresAt);
          reissuedExpiredToken = false;

          // Transparent key rotation migration: if decrypted using a previous key from the keyring,
          // re-encrypt under the current active keyId while preserving the exact same rawToken and tokenHash!
          if (decryptedMeta.usedPreviousKey) {
            const { activeKey } = getSignatureEncryptionKeyring();
            transaction.set(
              sigReqRef,
              {
                encryptedToken: encryptSignatureToken(resolvedRawToken),
                encryptionKeyId: activeKey.keyId,
                keyRotatedAt: timestamp,
              },
              { merge: true }
            );
          }
        } else {
          // Cannot decrypt legacy/unencrypted active token and MUST NOT overwrite unexpired token
          throw new Error("ACTIVE_TOKEN_NOT_EXPIRED");
        }
      } else {
        // Previous request is expired (or missing tokenHash on eligible PENDING_REMOTE item): issue new CSPRNG token
        resolvedRawToken = `sig_${crypto.randomBytes(24).toString("hex")}`;
        resolvedExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        reissuedExpiredToken = true;

        const newTokenHash = crypto.createHash("sha256").update(resolvedRawToken).digest("hex");
        const newEncryptedToken = encryptSignatureToken(resolvedRawToken);
        const { activeKey } = getSignatureEncryptionKeyring();
        const deleteMarker = typeof FieldValue?.delete === "function" ? FieldValue.delete() : null;

        transaction.set(
          sigReqRef,
          {
            itemId: cleanItemId,
            tokenHash: newTokenHash,
            encryptedToken: newEncryptedToken,
            encryptionKeyId: activeKey.keyId,
            recipientEmail: persistedRecipientEmail,
            recipientName: persistedRecipientName,
            recipientBond: persistedRecipientBond,
            recipientDocument: itemData.recipientDocument || sigData?.recipientDocument || "",
            createdAt: sigData?.createdAt || timestamp,
            reissuedAt: timestamp,
            expiresAt: resolvedExpiresAt,
            used: false,
            invalidated: false,
            dispatchedByUserId: persistedIssuerUid,
          },
          { merge: true }
        );

        transaction.update(itemRef, {
          ...buildPublicFieldDeletionMap(deleteMarker),
          status: "DEVOLVIDO",
        });

        transaction.set(
          privRef,
          {
            itemId: cleanItemId,
            status: "DEVOLVIDO",
            signatureToken: null,
            signatureTokenExpiresAt: resolvedExpiresAt,
            signatureTokenUsed: false,
            updatedAt: timestamp,
          },
          { merge: true }
        );
      }

      const auditAction = reissuedExpiredToken
        ? "REEMISSAO_LINK_ASSINATURA"
        : mode === "EMAIL"
        ? "REENVIO_SOLICITACAO_ASSINATURA"
        : "RECUPERACAO_LINK_ASSINATURA";

      const auditId = `audit-sigreq-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
      transaction.set(adminDb.collection("audit_logs").doc(auditId), {
        id: auditId,
        transactionId: `TX-SIGREQ-${Date.now().toString(36).toUpperCase()}`,
        objectId: cleanItemId,
        objectType: "RETURN",
        objectTitle: itemTitle,
        action: auditAction,
        actorId: req.authUser!.uid,
        actorName: callerName,
        actorEmail: req.authUser!.email || "",
        actorRole: callerRole,
        timestamp,
        fieldChanged: "signature_request",
        oldValue: reissuedExpiredToken ? "EXPIRED" : "PENDING_REMOTE",
        newValue: "PENDING_REMOTE",
        details: `${auditAction} executada por ${callerName} para o receptor ${persistedRecipientName} (${persistedRecipientEmail}). Emissor original preservado: ${persistedIssuerUid}.`,
        immutable: true,
      });
    };

    if (typeof adminDb.runTransaction === "function") {
      await adminDb.runTransaction(runSendRequestTx);
    } else {
      throw new Error("SERVICE_UNAVAILABLE");
    }

    let sanitizedOrigin = process.env.APP_URL || "https://localiza-plus-ifpr.vercel.app";
    if (typeof originUrl === "string" && /^https?:\/\/[a-zA-Z0-9.-]+(:\d+)?$/.test(originUrl.trim())) {
      sanitizedOrigin = originUrl.trim();
    }
    const signatureLink = `${sanitizedOrigin}/?tab=sign-receipt&itemId=${encodeURIComponent(cleanItemId)}&token=${encodeURIComponent(resolvedRawToken)}`;

    if (mode === "LINK_ONLY") {
      return res.json({
        success: true,
        mode: "LINK_ONLY",
        reissued: reissuedExpiredToken,
        signatureLink,
        token: resolvedRawToken,
        expiresAt: resolvedExpiresAt,
        recipientEmail: persistedRecipientEmail,
        message: reissuedExpiredToken
          ? "Link anterior expirado foi substituído por um novo link seguro."
          : "Link seguro de assinatura digital recuperado com sucesso.",
        timestamp,
      });
    }

    const emailSubject = `📝 Assinatura Digital Necessária: Recebimento do Objeto "${itemTitle}" - IFPR Campus Ivaiporã`;
    const emailBody = `Olá, ${persistedRecipientName}!\n\n` +
      `O seu pertence "${itemTitle}" foi entregue pela equipe de atendimento do IFPR Campus Ivaiporã (${persistedIssuerName}).\n\n` +
      `Para concluir a devolução em conformidade com as normas institucionais, por favor confirme o recebimento e realize sua Assinatura Digital através do link seguro abaixo:\n\n` +
      `🔗 Link para Assinar o Termo de Recebimento:\n` +
      `${signatureLink}\n\n` +
      `Código do Termo: ${cleanItemId}\n\n` +
      `Caso já tenha assinado presencialmente, desconsidere esta mensagem.\n\n` +
      `Atenciosamente,\n` +
      `Seção de Apoio ao Estudante (SEBAC) & Portaria\n` +
      `Instituto Federal do Paraná - Campus Ivaiporã`;

    const emailHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 20px; }
    .box { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background: #00843D; color: #ffffff; padding: 24px; text-align: center; }
    .header h2 { margin: 0; font-size: 20px; font-weight: 800; }
    .header p { margin: 4px 0 0 0; font-size: 12px; opacity: 0.9; }
    .content { padding: 24px; font-size: 13px; line-height: 1.6; color: #334155; }
    .cta-btn { display: block; width: fit-content; margin: 24px auto; background: #00843D; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: bold; font-size: 14px; text-align: center; }
    .info-card { background: #f1f5f9; border-radius: 12px; padding: 14px; margin: 16px 0; font-size: 12px; }
    .footer { padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="box">
    <div class="header">
      <h2>Instituto Federal do Paraná • Campus Ivaiporã</h2>
      <p>Sistema Localiza+ • Termo Oficial de Devolução de Pertence</p>
    </div>
    <div class="content">
      <p>Olá, <strong>${persistedRecipientName}</strong>!</p>
      <p>Seu pertence <strong>"${itemTitle}"</strong> foi entregue pela equipe de atendimento do IFPR Campus Ivaiporã (atendente: ${persistedIssuerName}).</p>
      <div class="info-card">
        <strong>Identificador da Ocorrência:</strong> #${cleanItemId}<br/>
        <strong>Data de Reenvio:</strong> ${new Date().toLocaleDateString("pt-BR")}<br/>
        <strong>Validade até:</strong> ${new Date(resolvedExpiresAt).toLocaleDateString("pt-BR")}
      </div>
      <p>Para concluir a baixa oficial no acervo institucional, realize sua assinatura digital através do botão seguro abaixo:</p>
      <a href="${signatureLink}" class="cta-btn">✍️ Assinar Termo de Recebimento</a>
      <p style="font-size: 11px; color: #64748b; word-break: break-all;">Ou copie e cole no seu navegador:<br/>${signatureLink}</p>
    </div>
    <div class="footer">
      Seção de Apoio ao Estudante (SEBAC) & Portaria • IFPR Campus Ivaiporã
    </div>
  </div>
</body>
</html>
    `;

    // Attempt real email dispatch via configured SMTP transporter
    const transporter = getEmailTransporter();
    let emailDispatched = false;
    let emailStatus: "SENT" | "PENDING_SMTP_CONFIG" | "ERROR" = "PENDING_SMTP_CONFIG";
    let emailError: string | null = null;
    let messageId: string | null = null;

    if (transporter) {
      try {
        const fromAddress = process.env.SMTP_FROM || `"IFPR Achados & Perdidos" <${process.env.SMTP_USER || "campus.ivaipora@ifpr.edu.br"}>`;
        const info = await transporter.sendMail({
          from: fromAddress,
          to: persistedRecipientEmail,
          subject: emailSubject,
          text: emailBody,
          html: emailHtml,
        });
        emailDispatched = true;
        emailStatus = "SENT";
        messageId = info.messageId;
        console.info(`[Signature Email Success] Link de assinatura despachado via SMTP para ${persistedRecipientEmail}. MessageId: ${info.messageId}`);
      } catch (mailErr: any) {
        emailStatus = "ERROR";
        emailError = mailErr?.message || String(mailErr);
        console.error(`[Signature Email Error] Falha ao despachar e-mail via SMTP para ${persistedRecipientEmail}:`, mailErr);
      }
    } else {
      console.info(`[Signature Email Notice] Provedor SMTP não configurado no ambiente. Registro efetuado no Firestore.`);
    }

    try {
      const notifDocId = `sig_req_${cleanItemId}_${Date.now()}`;
      await adminDb.collection("email_notifications").doc(notifDocId).set({
        id: notifDocId,
        itemId: cleanItemId,
        itemTitle,
        recipientEmail: persistedRecipientEmail,
        recipientName: persistedRecipientName,
        signatureLinkRedacted: sanitizeEmailNotificationUrl(signatureLink),
        hasSignatureLink: true,
        expiresAt: resolvedExpiresAt,
        subject: emailSubject,
        bodyPreview: `Solicitação de assinatura digital para ${persistedRecipientName} (link seguro protegido enviado ao destinatário).`,
        type: "REMOTE_SIGNATURE_REQUEST",
        status: emailStatus,
        messageId: messageId || null,
        error: emailError || null,
        sentAt: timestamp,
        createdAt: timestamp,
        dispatchedByUserId: persistedIssuerUid,
        resentByUserId: req.authUser?.uid,
      });
    } catch (dbErr) {
      console.warn("[Signature Warning] Falha ao persistir log no Firestore:", dbErr);
    }

    return res.json({
      success: true,
      mode: "EMAIL",
      reissued: reissuedExpiredToken,
      emailDispatched,
      emailStatus,
      emailError,
      message: emailDispatched
        ? `Link de assinatura digital reenviado com sucesso para ${persistedRecipientEmail}.`
        : `Solicitação de assinatura confirmada (SMTP não configurado no ambiente). Utilize 'Copiar Link' para compartilhar o link seguro com ${persistedRecipientEmail}.`,
      signatureLink,
      token: resolvedRawToken,
      expiresAt: resolvedExpiresAt,
      recipientEmail: persistedRecipientEmail,
      timestamp,
    });
  } catch (error: any) {
    if (error?.message === "SIGNATURE_ENCRYPTION_KEY_MISSING") {
      return res.status(503).json({
        success: false,
        code: "SIGNATURE_ENCRYPTION_KEY_MISSING",
        error: "Configuração criptográfica SIGNATURE_TOKEN_SECRET ausente ou inválida no servidor.",
      });
    }
    if (error?.message === "SERVICE_UNAVAILABLE") {
      return res.status(503).json({ success: false, error: "Transações Firestore Admin indisponíveis no servidor." });
    }
    if (error?.message === "ITEM_NOT_FOUND") {
      return res.status(404).json({ success: false, error: "Ocorrência não encontrada no banco de dados." });
    }
    if (error?.message === "ITEM_CLOSED") {
      return res.status(409).json({ success: false, error: "Esta ocorrência foi encerrada e não aceita novas solicitações de assinatura." });
    }
    if (error?.message === "ALREADY_SIGNED") {
      return res.status(409).json({ success: false, error: "A assinatura do receptor já foi concluída e não pode ser sobrescrita." });
    }
    if (error?.message === "REQUEST_ALREADY_USED") {
      return res.status(409).json({ success: false, error: "Esta solicitação de assinatura já foi consumida e não pode ser reativada." });
    }
    if (error?.message === "REQUEST_INVALIDATED") {
      return res.status(409).json({ success: false, error: "Esta solicitação foi invalidada após reabertura administrativa. Registre uma nova devolução formal." });
    }
    if (error?.message === "NOT_ELIGIBLE_PENDING_REMOTE") {
      return res.status(409).json({ success: false, error: "O item não possui uma devolução remota pendente de assinatura válida." });
    }
    if (error?.message === "MISSING_ISSUER_IDENTITY" || error?.message === "MISSING_RECIPIENT_EMAIL") {
      return res.status(409).json({ success: false, error: "Metadados obrigatórios de autoria ou destinatário ausentes no registro da devolução." });
    }
    if (error?.message === "ISSUER_OVERRIDE_FORBIDDEN" || error?.message === "UNAUTHORIZED_ISSUER_ONLY" || error?.message === "RECIPIENT_TAMPER_FORBIDDEN") {
      return res.status(403).json({
        success: false,
        error:
          error?.message === "RECIPIENT_TAMPER_FORBIDDEN"
            ? "Não é permitido alterar o destinatário registrado na devolução formal."
            : "Não é permitido substituir o emissor original nem reenviar solicitações emitidas por outro servidor.",
      });
    }
    if (error?.message === "ACTIVE_TOKEN_NOT_EXPIRED") {
      return res.status(409).json({
        success: false,
        error: "Já existe uma solicitação de assinatura ativa e ainda não expirada para este item.",
      });
    }
    console.error("Erro na rota /api/signature/send-request:", error?.message || error);
    return res.status(500).json({
      success: false,
      error: "Erro interno ao enviar link de assinatura.",
    });
  }
});

// API Endpoint: Notify when remote signature is completed (ETAPA 15 Achado 2: Hardened with Token/Staff Auth, State Verification, Anti-Spoofing & Idempotency)
app.post(["/api/signature/notify-signed", "/signature/notify-signed"], generalRateLimiter, async (req, res) => {
  try {
    const { itemId, token, signerName: bodySignerName, signerEmail: bodySignerEmail, signedAt: bodySignedAt } = req.body || {};
    if (!itemId || typeof itemId !== "string" || !itemId.trim() || itemId.includes("/")) {
      return res.status(400).json({
        success: false,
        code: "INVALID_ITEM_ID",
        error: "ID do item obrigatório e deve ser uma string válida.",
      });
    }

    const cleanItemId = itemId.trim();
    const cleanToken = typeof token === "string" ? token.trim() : "";

    const adminDb = getAdminFirestore();
    if (!adminDb || typeof adminDb.runTransaction !== "function") {
      return res.status(503).json({
        success: false,
        code: "SERVICE_UNAVAILABLE",
        error: "Banco de dados Firestore Admin indisponível no momento.",
      });
    }

    // 1. Authenticate caller: requires either a valid signature token OR an authenticated active SERVIDOR/ADMIN Bearer token
    let authenticatedActorId = "";
    let authenticatedActorRole = "RECIPIENT_TOKEN";
    const authHeader = req.headers.authorization;
    const hasBearerToken = Boolean(authHeader && authHeader.startsWith("Bearer "));

    if (hasBearerToken && !cleanToken) {
      try {
        const idToken = authHeader!.split("Bearer ")[1].trim();
        const adminAuth = getAdminAuth();
        if (!adminAuth) {
          return res.status(503).json({
            success: false,
            code: "AUTH_SERVICE_UNAVAILABLE",
            error: "Serviço de autenticação indisponível no momento.",
          });
        }
        const decoded = await adminAuth.verifyIdToken(idToken);
        const staffCheck = await validateStaffOrAdminAccess(adminDb, {
          uid: decoded.uid,
          email: decoded.email,
          email_verified: decoded.email_verified,
          isAdmin: decoded.admin === true || decoded.role === "ADMIN",
        });
        if (!staffCheck.authorized) {
          return res.status(403).json({
            success: false,
            code: "FORBIDDEN",
            error: staffCheck.errorMessage || "Usuário autenticado não possui permissão para registrar notificações de assinatura.",
          });
        }
        authenticatedActorId = decoded.uid;
        authenticatedActorRole = staffCheck.userData?.role === "ADMIN" ? "ADMIN" : "SERVIDOR";
      } catch {
        return res.status(401).json({
          success: false,
          code: "INVALID_AUTH_TOKEN",
          error: "Credencial de autenticação inválida ou expirada.",
        });
      }
    } else if (!cleanToken) {
      return res.status(401).json({
        success: false,
        code: "AUTHENTICATION_REQUIRED",
        error: "Autenticação ou token válido de assinatura é obrigatório para registrar confirmação.",
      });
    }

    const nowIso = new Date().toISOString();
    const notifDocId = `sig_done_${cleanItemId}`;
    const itemRef = adminDb.collection("items").doc(cleanItemId);
    const privRef = adminDb.collection("item_return_records").doc(cleanItemId);
    const sigReqRef = adminDb.collection("signature_requests").doc(cleanItemId);
    const notifRef = adminDb.collection("email_notifications").doc(notifDocId);

    let effectiveTitle = cleanItemId;
    let effectiveSigner = "";
    let effectiveEmail = "";
    let effectiveSignedAt = "";

    await adminDb.runTransaction(async (transaction: any) => {
      const [itemSnap, privSnap, sigReqSnap, notifSnap] = await Promise.all([
        transaction.get(itemRef),
        transaction.get(privRef),
        transaction.get(sigReqRef),
        transaction.get(notifRef),
      ]);

      if (!itemSnap?.exists) {
        throw new Error("ITEM_NOT_FOUND");
      }

      const rawItemData = (typeof itemSnap.data === "function" ? itemSnap.data() : itemSnap.data) || {};
      const privData = privSnap?.exists ? ((typeof privSnap.data === "function" ? privSnap.data() : privSnap.data) || {}) : null;
      const itemData = mergePublicAndPrivateItemData(rawItemData, privData);
      const sigData = sigReqSnap?.exists ? ((typeof sigReqSnap.data === "function" ? sigReqSnap.data() : sigReqSnap.data) || {}) : null;

      if (sigReqSnap?.exists && sigData?.invalidated === true) {
        throw new Error("TOKEN_INVALIDATED");
      }

      // If authenticating via signature token, verify constant-time SHA-256 hash match
      if (cleanToken) {
        const providedHash = Buffer.from(crypto.createHash("sha256").update(cleanToken).digest("hex"), "utf8");
        const storedHashStr = typeof sigData?.tokenHash === "string" ? sigData.tokenHash : "";
        const storedHash = Buffer.from(storedHashStr, "utf8");
        const hashMatches =
          storedHashStr.length > 0 &&
          providedHash.length === storedHash.length &&
          crypto.timingSafeEqual(providedHash, storedHash);
        if (!hashMatches) {
          throw new Error("TOKEN_MISMATCH");
        }
        authenticatedActorId = "remote-token-auth";
      }

      // 2. Verify item is genuinely DEVOLVIDO with completed recipient signature
      if (
        itemData.status !== "DEVOLVIDO" ||
        itemData.recipientSignatureStatus !== "SIGNED" ||
        !itemData.receiptValidationCode
      ) {
        throw new Error("SIGNATURE_NOT_COMPLETED");
      }

      effectiveTitle = String(itemData.title || cleanItemId).trim();
      effectiveSigner = String(itemData.recipientName || itemData.recipientSignatureName || sigData?.signedBy || "").trim();
      effectiveEmail = String(itemData.recipientEmail || itemData.recipientSignatureEmail || sigData?.recipientEmail || "").trim();
      effectiveSignedAt = String(itemData.signedAt || itemData.resolutionDate || sigData?.usedAt || "").trim();

      // 3. Anti-spoofing: reject any attempt in req.body to diverge from persisted signerEmail, signerName, or signedAt
      if (
        typeof bodySignerEmail === "string" &&
        bodySignerEmail.trim() &&
        effectiveEmail &&
        bodySignerEmail.trim().toLowerCase() !== effectiveEmail.toLowerCase()
      ) {
        throw new Error("PAYLOAD_TAMPER_DETECTED");
      }
      if (
        typeof bodySignerName === "string" &&
        bodySignerName.trim() &&
        effectiveSigner &&
        bodySignerName.trim().toLowerCase() !== effectiveSigner.toLowerCase()
      ) {
        throw new Error("PAYLOAD_TAMPER_DETECTED");
      }
      if (
        typeof bodySignedAt === "string" &&
        bodySignedAt.trim() &&
        effectiveSignedAt &&
        bodySignedAt.trim() !== effectiveSignedAt
      ) {
        throw new Error("PAYLOAD_TAMPER_DETECTED");
      }

      // 4. Anti-duplication / Idempotency guard
      if (notifSnap?.exists || sigData?.completionNotified === true) {
        throw new Error("NOTIFICATION_ALREADY_LOGGED");
      }

      transaction.set(notifRef, {
        id: notifDocId,
        itemId: cleanItemId,
        itemTitle: effectiveTitle,
        signerName: effectiveSigner || "Receptor IFPR",
        signerEmail: effectiveEmail,
        receiptValidationCode: itemData.receiptValidationCode,
        type: "SIGNATURE_COMPLETED",
        status: "LOGGED",
        signedAt: effectiveSignedAt || nowIso,
        createdAt: nowIso,
      });

      if (sigReqSnap?.exists) {
        transaction.set(
          sigReqRef,
          {
            completionNotified: true,
            completionNotifiedAt: nowIso,
          },
          { merge: true }
        );
      }

      const auditId = `audit-notify-sig-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
      transaction.set(adminDb.collection("audit_logs").doc(auditId), {
        id: auditId,
        transactionId: `TX-NOTIFYSIG-${Date.now().toString(36).toUpperCase()}`,
        objectId: cleanItemId,
        objectType: "RETURN",
        objectTitle: effectiveTitle,
        action: "CONFIRMACAO_NOTIFICACAO_ASSINATURA",
        actorId: authenticatedActorId || "remote-token-auth",
        actorName: effectiveSigner || "Receptor IFPR",
        actorEmail: effectiveEmail,
        actorRole: authenticatedActorRole,
        timestamp: nowIso,
        fieldChanged: "email_notifications",
        oldValue: "NONE",
        newValue: notifDocId,
        details: `Registro auditável de conclusão de assinatura remota confirmado para #${cleanItemId} (${effectiveTitle}).`,
        immutable: true,
      });
    });

    console.info(`[Signature Completed] Item #${cleanItemId} assinado digitalmente por ${effectiveSigner}.`);
    return res.json({
      success: true,
      itemId: cleanItemId,
      notificationId: notifDocId,
      signedAt: effectiveSignedAt,
      message: "Assinatura registrada no backend com sucesso.",
    });
  } catch (err: any) {
    if (err?.message === "ITEM_NOT_FOUND") {
      return res.status(404).json({ success: false, code: "ITEM_NOT_FOUND", error: "Ocorrência não encontrada no banco de dados." });
    }
    if (err?.message === "TOKEN_INVALIDATED") {
      return res.status(410).json({
        success: false,
        code: "TOKEN_INVALIDATED",
        error: "Solicitação de assinatura invalidada após reabertura administrativa.",
      });
    }
    if (err?.message === "TOKEN_MISMATCH") {
      return res.status(403).json({
        success: false,
        code: "TOKEN_MISMATCH",
        error: "Token de assinatura inválido ou não autorizado para este objeto.",
      });
    }
    if (err?.message === "SIGNATURE_NOT_COMPLETED") {
      return res.status(409).json({
        success: false,
        code: "SIGNATURE_NOT_COMPLETED",
        error: "A assinatura remota deste objeto ainda não foi concluída.",
      });
    }
    if (err?.message === "PAYLOAD_TAMPER_DETECTED") {
      return res.status(403).json({
        success: false,
        code: "PAYLOAD_TAMPER_DETECTED",
        error: "Divergência detectada entre os dados informados e os registros oficiais da assinatura.",
      });
    }
    if (err?.message === "NOTIFICATION_ALREADY_LOGGED") {
      return res.status(409).json({
        success: false,
        code: "NOTIFICATION_ALREADY_LOGGED",
        error: "A confirmação desta assinatura já foi registrada anteriormente.",
      });
    }
    console.error("Erro na rota /api/signature/notify-signed:", err?.message || err);
    return res.status(500).json({ success: false, error: "Erro interno ao registrar confirmação." });
  }
});

// =================================================================
// Server-Authoritative Formal Return & Reopen Endpoints (ETAPA 11)
// =================================================================

export interface FormalReturnInput {
  itemId?: string;
  recipientName?: string;
  recipientEmail?: string;
  recipientBond?: string;
  recipientDocument?: string;
  observations?: string;
  returnObservations?: string;
  identityVerified?: boolean;
  signatureType?: "IN_PERSON_DEVICE" | "REMOTE_EMAIL" | string;
  signatureDataUrl?: string;
  signatureMethod?: "DRAWN" | "TYPED_NAME" | string;
  originUrl?: string;
}

export async function executeFormalItemReturn(
  adminDb: any,
  authUser: { uid: string; email?: string; email_verified?: boolean; isAdmin?: boolean },
  body: FormalReturnInput
): Promise<{
  success: boolean;
  statusCode: number;
  error?: string;
  code?: string;
  itemId?: string;
  itemUpdate?: Record<string, any>;
  completedClaimIds?: string[];
  validationCode?: string;
  signatureLink?: string;
  emailDispatched?: boolean;
  emailStatus?: string;
  notificationWarning?: string;
}> {
  const staffCheck = await validateStaffOrAdminAccess(adminDb, authUser);
  if (!staffCheck.authorized) {
    return {
      success: false,
      statusCode: staffCheck.statusCode,
      error: staffCheck.errorMessage || "Acesso negado para registrar devolução formal.",
      code: "UNAUTHORIZED_FORMAL_RETURN",
    };
  }

  const rawItemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";
  const recipientName = typeof body?.recipientName === "string" ? body.recipientName.trim() : "";
  const recipientEmail = typeof body?.recipientEmail === "string" ? body.recipientEmail.trim() : "";
  const recipientBond = typeof body?.recipientBond === "string" ? body.recipientBond.trim() : "";
  const recipientDocument = typeof body?.recipientDocument === "string" ? body.recipientDocument.trim().slice(0, 60) : "";
  const rawObs = typeof body?.returnObservations === "string"
    ? body.returnObservations
    : typeof body?.observations === "string"
    ? body.observations
    : "";
  const observations = rawObs.trim().slice(0, 1000);
  const identityVerified = body?.identityVerified === true;
  const signatureType = body?.signatureType;
  const signatureDataUrl = typeof body?.signatureDataUrl === "string" ? body.signatureDataUrl.trim() : "";

  if (!rawItemId || rawItemId.length > 128 || rawItemId.includes("/")) {
    return {
      success: false,
      statusCode: 400,
      error: "Identificador da ocorrência (itemId) inválido ou ausente.",
      code: "INVALID_ITEM_ID",
    };
  }

  if (!recipientName || recipientName.length < 2 || recipientName.length > 150) {
    return {
      success: false,
      statusCode: 400,
      error: "Nome completo do receptor é obrigatório (2 a 150 caracteres).",
      code: "INVALID_RECIPIENT_NAME",
    };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!recipientEmail || recipientEmail.length > 150 || !emailRegex.test(recipientEmail)) {
    return {
      success: false,
      statusCode: 400,
      error: "E-mail válido do receptor é obrigatório para o protocolo de devolução.",
      code: "INVALID_RECIPIENT_EMAIL",
    };
  }

  if (!recipientBond || recipientBond.length > 60) {
    return {
      success: false,
      statusCode: 400,
      error: "Vínculo institucional do receptor é obrigatório.",
      code: "INVALID_RECIPIENT_BOND",
    };
  }

  if (!identityVerified) {
    return {
      success: false,
      statusCode: 400,
      error: "A confirmação presencial do documento oficial com foto do receptor é obrigatória.",
      code: "IDENTITY_VERIFICATION_REQUIRED",
    };
  }

  if (signatureType !== "IN_PERSON_DEVICE" && signatureType !== "REMOTE_EMAIL") {
    return {
      success: false,
      statusCode: 400,
      error: "Modalidade de assinatura inválida. Utilize IN_PERSON_DEVICE ou REMOTE_EMAIL.",
      code: "INVALID_SIGNATURE_TYPE",
    };
  }

  const isInPerson = signatureType === "IN_PERSON_DEVICE";
  const isRemote = signatureType === "REMOTE_EMAIL";

  if (isInPerson) {
    if (!signatureDataUrl) {
      return {
        success: false,
        statusCode: 400,
        error: "A assinatura digital presencial do recebedor é obrigatória nesta modalidade.",
        code: "MISSING_IN_PERSON_SIGNATURE",
      };
    }
    if (signatureDataUrl.length > 350000) {
      return {
        success: false,
        statusCode: 400,
        error: "A imagem da assinatura excede o limite máximo permitido de 250KB.",
        code: "SIGNATURE_TOO_LARGE",
      };
    }
    const base64ImageRegex = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
    if (!base64ImageRegex.test(signatureDataUrl)) {
      return {
        success: false,
        statusCode: 400,
        error: "Formato de assinatura inválido. A imagem deve estar em Base64 (PNG, JPEG ou WEBP).",
        code: "INVALID_SIGNATURE_FORMAT",
      };
    }
  }

  const isRootAdmin = evaluateRootAdminAuth(authUser).isRoot;
  const effectiveRole: "ADMIN" | "SERVIDOR" =
    isRootAdmin || staffCheck.userData?.role === "ADMIN" ? "ADMIN" : "SERVIDOR";
  const effectiveName =
    staffCheck.signerName || staffCheck.userData?.name || authUser.email?.split("@")[0] || "Servidor IFPR";

  const now = new Date();
  const nowIso = now.toISOString();
  const returnDate = now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const returnTime = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const validationCode = `COMP-IFPR-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const rawSignatureToken = isRemote ? `sig_${crypto.randomBytes(24).toString("hex")}` : "";
  const tokenHash = isRemote ? crypto.createHash("sha256").update(rawSignatureToken).digest("hex") : "";
  const expiresAt = isRemote ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString() : undefined;

  if (isRemote) {
    try {
      getSignatureEncryptionKeyring();
    } catch (keyErr: any) {
      if (keyErr?.message === "SIGNATURE_ENCRYPTION_KEY_MISSING") {
        return {
          success: false,
          statusCode: 503,
          code: "SIGNATURE_ENCRYPTION_KEY_MISSING",
          error: "Configuração criptográfica SIGNATURE_TOKEN_SECRET ausente ou inválida no servidor.",
        };
      }
      throw keyErr;
    }
  }

  let itemUpdate: Record<string, any> = {};
  let completedClaimIds: string[] = [];
  let itemTitle = rawItemId;
  let itemLocation = "Campus Ivaiporã";
  let itemCategory = "Geral";
  let itemQrCode = rawItemId;
  let oldStatus = "ENCONTRADO";

  try {
    if (typeof adminDb.runTransaction !== "function") {
      return {
        success: false,
        statusCode: 503,
        error: "Transações Firestore Admin indisponíveis no servidor.",
      };
    }

    await adminDb.runTransaction(async (transaction: any) => {
      const itemRef = adminDb.collection("items").doc(rawItemId);
      const privRef = adminDb.collection("item_return_records").doc(rawItemId);
      const itemDoc = await transaction.get(itemRef);
      if (!itemDoc || !itemDoc.exists) {
        throw new Error("ITEM_NOT_FOUND");
      }

      const itemData = (typeof itemDoc.data === "function" ? itemDoc.data() : itemDoc.data) || {};
      oldStatus = itemData.status || "ENCONTRADO";

      if (itemData.status === "DEVOLVIDO" || itemData.status === "ENCERRADO") {
        throw new Error("ITEM_ALREADY_RESOLVED");
      }

      itemTitle = itemData.title || rawItemId;
      itemLocation = itemData.location || "Campus Ivaiporã";
      itemCategory = itemData.category || "Geral";
      itemQrCode = itemData.qrCodeId || rawItemId;

      // Read all approved claims inside transaction BEFORE writes
      let approvedClaimDocs: any[] = [];
      const claimsCol = adminDb.collection("claims");
      if (claimsCol && typeof claimsCol.where === "function") {
        const approvedQuery = claimsCol.where("itemId", "==", rawItemId).where("status", "==", "APROVADO");
        const claimsSnap = await transaction.get(approvedQuery);
        approvedClaimDocs = claimsSnap?.docs || [];
      }

      const existingHistory = Array.isArray(itemData.history)
        ? itemData.history
        : Array.isArray(itemData.historyLogs)
        ? itemData.historyLogs
        : [];

      const privateHistLog = {
        id: `hist-${Date.now()}`,
        action: isInPerson
          ? "Devolução registrada com Assinatura Presencial"
          : "Devolução registrada (Aguardando Assinatura por E-mail)",
        actorId: authUser.uid,
        actorName: effectiveName,
        actorRole: effectiveRole,
        userId: authUser.uid,
        userName: effectiveName,
        userRole: effectiveRole,
        timestamp: nowIso,
        details: `Devolução formal concluída para ${recipientName} (${recipientBond}). Responsável: ${effectiveName}.${
          isInPerson
            ? " Assinatura digital colhida no dispositivo."
            : " Link seguro de assinatura enviado por e-mail."
        }`,
      };

      const publicHistLog = {
        id: privateHistLog.id,
        action: "Devolução institucional registrada",
        actorRole: effectiveRole,
        userRole: effectiveRole,
        timestamp: nowIso,
        details: "Devolução institucional registrada no sistema.",
      };

      const existingPublicHistory = sanitizePublicItemDocument(itemData).history || [];
      const nextPublicHistory = [...existingPublicHistory, publicHistLog];
      const nextPrivateHistory = [...existingHistory, privateHistLog];
      const deleteMarker = typeof FieldValue?.delete === "function" ? FieldValue.delete() : null;

      itemUpdate = {
        status: "DEVOLVIDO",
        resolutionDate: nowIso,
        returnDate,
        returnTime,
        returnedByUserId: authUser.uid,
        returnedByName: effectiveName,
        returnedByRole: effectiveRole,
        recipientName,
        recipientEmail,
        recipientBond,
        recipientDocument,
        returnObservations: observations,
        receiptValidationCode: validationCode,
        recipientSignatureUrl: isInPerson ? signatureDataUrl : "",
        recipientSignatureType: signatureType,
        recipientSignatureMethod: isInPerson
          ? body.signatureMethod || (signatureDataUrl.includes("type") ? "TYPED_NAME" : "DRAWN")
          : "REMOTE_EMAIL",
        recipientSignatureStatus: isInPerson ? "SIGNED" : "PENDING_REMOTE",
        staffSignatureStatus: "PENDING_STAFF",
        signatureToken: null,
        signatureTokenUsed: isInPerson ? true : false,
        history: nextPrivateHistory,
        historyLogs: nextPrivateHistory,
      };

      if (isInPerson) {
        itemUpdate.signedAt = nowIso;
      } else if (expiresAt) {
        itemUpdate.signatureTokenExpiresAt = expiresAt;
      }

      // 1. Update public catalog document (/items/{rawItemId}) with ONLY public fields and purge any legacy private fields
      transaction.update(itemRef, {
        ...buildPublicFieldDeletionMap(deleteMarker),
        status: "DEVOLVIDO",
        resolutionDate: nowIso,
        history: nextPublicHistory,
        historyLogs: nextPublicHistory,
      });

      // 2. Persist all private return, recipient PII, validation code, and signature fields in restricted /item_return_records
      transaction.set(
        privRef,
        {
          ...itemUpdate,
          itemId: rawItemId,
          privateHistory: nextPrivateHistory,
          privateHistoryLogs: nextPrivateHistory,
          updatedAt: nowIso,
        },
        { merge: true }
      );

      // Atomically conclude all approved claims for this item
      completedClaimIds = [];
      for (const clmDoc of approvedClaimDocs) {
        completedClaimIds.push(clmDoc.id);
        transaction.update(clmDoc.ref, {
          status: "CONCLUIDO",
          completedAt: nowIso,
          decisionNotes: `Devolução formal concluída para ${recipientName} (${recipientBond}).`,
        });
      }

      // Isolate remote token hash & encrypted recovery payload in private signature_requests collection
      if (isRemote) {
        const sigReqRef = adminDb.collection("signature_requests").doc(rawItemId);
        const { activeKey } = getSignatureEncryptionKeyring();
        transaction.set(sigReqRef, {
          itemId: rawItemId,
          tokenHash,
          encryptedToken: encryptSignatureToken(rawSignatureToken),
          encryptionKeyId: activeKey.keyId,
          recipientEmail,
          recipientName,
          recipientBond,
          recipientDocument,
          createdAt: nowIso,
          expiresAt,
          used: false,
          invalidated: false,
          dispatchedByUserId: authUser.uid,
        });
      }

      // Immutable server-side audit & activity logs
      const txId = `TX-RET-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
      const auditId = `audit-ret-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
      const auditRef = adminDb.collection("audit_logs").doc(auditId);
      transaction.set(auditRef, {
        id: auditId,
        transactionId: txId,
        objectId: rawItemId,
        objectType: "RETURN",
        objectTitle: itemTitle,
        action: "REGISTRO_DEVOLUCAO",
        actorId: authUser.uid,
        actorName: effectiveName,
        actorEmail: authUser.email || "",
        actorRole: effectiveRole,
        timestamp: nowIso,
        fieldChanged: "status_devolucao",
        oldValue: oldStatus,
        newValue: "DEVOLVIDO",
        details: `Devolução formal do item #${rawItemId} (${itemTitle}) para ${recipientName} (${recipientBond}). Código validador: ${validationCode}.${
          isInPerson ? " Assinatura presencial colhida." : " Assinatura remota pendente via token privado."
        }`,
        immutable: true,
      });

      const actId = `act-ret-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
      const actRef = adminDb.collection("activity_logs").doc(actId);
      transaction.set(actRef, {
        id: actId,
        adminId: authUser.uid,
        actorId: authUser.uid,
        adminName: effectiveName,
        actorName: effectiveName,
        actorEmail: authUser.email || "",
        actorRole: effectiveRole,
        action: "REGISTRO_DEVOLUCAO",
        details: `Registrou devolução formal do item #${rawItemId} (${itemTitle}) para ${recipientName} (${recipientBond}). Responsável: ${effectiveName}.`,
        timestamp: nowIso,
      });
    });
  } catch (err: any) {
    if (err?.message === "ITEM_NOT_FOUND") {
      return { success: false, statusCode: 404, error: `Ocorrência #${rawItemId} não encontrada no banco de dados.` };
    }
    if (err?.message === "ITEM_ALREADY_RESOLVED") {
      return {
        success: false,
        statusCode: 409,
        error: `O item #${rawItemId} já foi devolvido ou encerrado anteriormente.`,
        code: "ITEM_ALREADY_RESOLVED",
      };
    }
    if (err?.message === "SIGNATURE_ENCRYPTION_KEY_MISSING") {
      return {
        success: false,
        statusCode: 503,
        code: "SIGNATURE_ENCRYPTION_KEY_MISSING",
        error: "Configuração criptográfica SIGNATURE_TOKEN_SECRET ausente ou inválida no servidor.",
      };
    }
    console.error(`[Formal Return Error] Falha na transação de devolução do item #${rawItemId}:`, err?.message || err);
    return {
      success: false,
      statusCode: 500,
      error: "Erro interno ao persistir devolução formal no banco de dados.",
    };
  }

  // Post-transaction non-blocking email dispatch (failures MUST NOT roll back or fail a committed return)
  let sanitizedOrigin = process.env.APP_URL || "https://localiza-plus-ifpr.vercel.app";
  if (typeof body?.originUrl === "string" && /^https?:\/\/[a-zA-Z0-9.-]+(:\d+)?$/.test(body.originUrl.trim())) {
    sanitizedOrigin = body.originUrl.trim();
  }
  const signatureLink = isRemote
    ? `${sanitizedOrigin}/?tab=sign-receipt&itemId=${encodeURIComponent(rawItemId)}&token=${encodeURIComponent(rawSignatureToken)}`
    : undefined;

  let emailDispatched = false;
  let emailStatus = "SKIPPED";
  let notificationWarning: string | undefined;

  try {
    const transporter = getEmailTransporter();
    const fromAddress = process.env.SMTP_FROM || `"IFPR Achados & Perdidos" <${process.env.SMTP_USER || "campus.ivaipora@ifpr.edu.br"}>`;

    if (isRemote && signatureLink) {
      const emailSubject = `📝 Assinatura Digital Necessária: Recebimento do Objeto "${itemTitle}" - IFPR Campus Ivaiporã`;
      const emailBody = `Olá, ${recipientName}!\n\n` +
        `O seu pertence "${itemTitle}" foi entregue pela equipe de atendimento do IFPR Campus Ivaiporã (${effectiveName}).\n\n` +
        `Para concluir o termo oficial de devolução, realize sua Assinatura Digital através do link seguro abaixo:\n\n` +
        `${signatureLink}\n\n` +
        `Código do Termo: ${rawItemId}\nValidade do link: 7 dias.\n\n` +
        `Atenciosamente,\nSEBAC & Portaria • IFPR Campus Ivaiporã`;

      let messageId: string | null = null;
      let emailError: string | null = null;
      if (transporter) {
        try {
          const info = await transporter.sendMail({
            from: fromAddress,
            to: recipientEmail,
            subject: emailSubject,
            text: emailBody,
          });
          emailDispatched = true;
          emailStatus = "SENT";
          messageId = info?.messageId || null;
        } catch (mailErr: any) {
          emailStatus = "ERROR";
          emailError = mailErr?.message || String(mailErr);
          notificationWarning = `Devolução registrada, mas houve falha ao enviar o e-mail do termo remoto (${emailError}). Utilize 'Reenviar E-mail' nos detalhes do objeto.`;
        }
      } else {
        emailStatus = "PENDING_SMTP_CONFIG";
        notificationWarning = "Devolução registrada, mas o serviço SMTP não está configurado no servidor. Utilize 'Copiar Link' nos detalhes do objeto para enviar ao receptor.";
      }

      try {
        const notifDocId = `sig_req_${rawItemId}_${Date.now()}`;
        await adminDb.collection("email_notifications").doc(notifDocId).set({
          id: notifDocId,
          itemId: rawItemId,
          itemTitle,
          recipientEmail,
          recipientName,
          signatureLinkRedacted: sanitizeEmailNotificationUrl(signatureLink),
          hasSignatureLink: true,
          expiresAt,
          subject: emailSubject,
          bodyPreview: `Solicitação de assinatura digital enviada para ${recipientName} (link seguro protegido enviado por e-mail).`,
          type: "REMOTE_SIGNATURE_REQUEST",
          status: emailStatus,
          messageId,
          error: emailError,
          sentAt: nowIso,
          createdAt: nowIso,
          dispatchedByUserId: authUser.uid,
        });
      } catch (_) {}
    } else if (isInPerson) {
      const emailSubject = `🎉 Seu objeto "${itemTitle}" foi devolvido com sucesso! - IFPR Achados e Perdidos`;
      const emailBody = `Olá, ${recipientName}!\n\n` +
        `Confirmamos que o objeto "${itemTitle}" (Código QR: ${itemQrCode}), registrado no sistema de Achados e Perdidos do IFPR Campus Ivaiporã, foi oficialmente DEVOLVIDO.\n\n` +
        `Detalhes do Registro:\n` +
        `- Objeto: ${itemTitle}\n` +
        `- Categoria: ${itemCategory}\n` +
        `- Local: ${itemLocation}\n` +
        `- Código Validador: ${validationCode}\n` +
        `- Atendente Responsável: ${effectiveName}\n` +
        `- Data e Hora da Baixa: ${returnDate} às ${returnTime}\n\n` +
        (observations ? `Observações: ${observations}\n\n` : "") +
        `Atenciosamente,\nEquipe de Apoio ao Estudante (SEBAC) & Portaria\nInstituto Federal do Paraná - Campus Ivaiporã`;

      let messageId: string | null = null;
      let emailError: string | null = null;
      if (transporter) {
        try {
          const info = await transporter.sendMail({
            from: fromAddress,
            to: recipientEmail,
            subject: emailSubject,
            text: emailBody,
          });
          emailDispatched = true;
          emailStatus = "SENT";
          messageId = info?.messageId || null;

          await adminDb.collection("item_return_records").doc(rawItemId).set({
            devolutionNotified: true,
            returnEmailNotified: true,
            devolutionNotificationStatus: "COMPLETED",
            devolutionNotifiedAt: nowIso,
            devolutionNotifiedBy: authUser.uid,
          }, { merge: true });
        } catch (mailErr: any) {
          emailStatus = "FAILED";
          emailError = mailErr?.message || String(mailErr);
          notificationWarning = `Devolução oficial concluída, mas o e-mail de confirmação não pôde ser enviado (${emailError}).`;
          await adminDb.collection("item_return_records").doc(rawItemId).set({
            devolutionNotificationStatus: "FAILED",
            devolutionNotificationLastError: emailError,
            devolutionNotificationFailedAt: nowIso,
          }, { merge: true }).catch(() => {});
        }
      } else {
        emailStatus = "SMTP_NOT_CONFIGURED";
        notificationWarning = "Devolução oficial concluída, mas o envio de e-mail SMTP não está configurado neste ambiente.";
      }

      try {
        const notifDocId = `email_auto_${rawItemId}_ITEM_RETURNED`;
        await adminDb.collection("email_notifications").doc(notifDocId).set({
          id: notifDocId,
          itemId: rawItemId,
          itemTitle,
          recipientEmail,
          recipientName,
          subject: emailSubject,
          body: emailBody,
          type: "ITEM_RETURNED_AUTOMATION",
          status: emailDispatched ? "SENT" : emailStatus,
          messageId,
          error: emailError,
          sentAt: nowIso,
          createdAt: nowIso,
          triggeredByUserId: authUser.uid,
        }, { merge: true });
      } catch (_) {}
    }
  } catch (postErr: any) {
    console.warn("[Formal Return Post-Hook Warning]", postErr?.message || postErr);
    notificationWarning = notificationWarning || "Devolução gravada, porém a notificação por e-mail não pôde ser concluída.";
  }

  return {
    success: true,
    statusCode: 200,
    itemId: rawItemId,
    itemUpdate,
    completedClaimIds,
    validationCode,
    signatureLink,
    emailDispatched,
    emailStatus,
    notificationWarning,
  };
}

export async function executeAdminReopenReturn(
  adminDb: any,
  authUser: { uid: string; email?: string; email_verified?: boolean; isAdmin?: boolean },
  body: { itemId?: string; reason?: string }
): Promise<{
  success: boolean;
  statusCode: number;
  error?: string;
  itemId?: string;
  previousStatus?: "PERDIDO" | "ENCONTRADO";
  historyEntry?: Record<string, any>;
  signatureRequestInvalidated?: boolean;
  restoredClaimIds?: string[];
  requiresAdminClaimReview?: boolean;
}> {
  if (!authUser || !authUser.uid) {
    return { success: false, statusCode: 401, error: "Autenticação obrigatória." };
  }
  if (!adminDb) {
    return { success: false, statusCode: 503, error: "Banco de dados Firestore Admin indisponível." };
  }

  try {
    const userDoc = await adminDb.collection("users").doc(authUser.uid).get();
    if (!userDoc || !userDoc.exists) {
      return { success: false, statusCode: 403, error: "Perfil administrativo não encontrado no sistema." };
    }
    const udata = (typeof userDoc.data === "function" ? userDoc.data() : userDoc.data) || {};
    const normStatus = String(udata.status || "").trim().toLowerCase();
    const hasActiveTemporalBlock = hasUserActiveTemporalBlock(udata);
    if (
      normStatus === "suspended" ||
      normStatus === "banned" ||
      normStatus === "inactive" ||
      udata.active === false ||
      hasActiveTemporalBlock
    ) {
      return { success: false, statusCode: 403, error: "Conta administrativa suspensa ou inativa." };
    }

    const isRootAdmin = evaluateRootAdminAuth(authUser).isRoot;
    if (!isRootAdmin && authUser.email_verified !== true) {
      return { success: false, statusCode: 403, error: "E-mail administrativo não verificado." };
    }

    const isDocAdmin = udata.role === "ADMIN" && udata.approvalStatus === "APROVADO";
    if (!isDocAdmin && !(isRootAdmin && udata.approvalStatus === "APROVADO")) {
      return {
        success: false,
        statusCode: 403,
        error: "Acesso negado. Apenas Administradores ativos e aprovados podem reabrir devoluções.",
      };
    }

    const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

    if (!itemId || itemId.length > 128 || itemId.includes("/")) {
      return { success: false, statusCode: 400, error: "Identificador da ocorrência inválido ou ausente." };
    }
    if (!reason || reason.length < 5 || reason.length > 500) {
      return {
        success: false,
        statusCode: 400,
        error: "É obrigatório informar uma justificativa detalhada (mínimo 5 caracteres) para reabrir a devolução.",
      };
    }

    const actorName = udata.name || authUser.email?.split("@")[0] || "Administrador IFPR";
    const nowIso = new Date().toISOString();
    let previousStatus: "PERDIDO" | "ENCONTRADO" = "ENCONTRADO";
    let historyEntry: Record<string, any> = {};
    let signatureRequestInvalidated = false;
    let restoredClaimIds: string[] = [];
    let requiresAdminClaimReview = false;

    await adminDb.runTransaction(async (transaction: any) => {
      const itemRef = adminDb.collection("items").doc(itemId);
      const privRef = adminDb.collection("item_return_records").doc(itemId);
      const sigReqRef = adminDb.collection("signature_requests").doc(itemId);

      // All reads MUST precede writes in Firestore transactions
      const itemDoc = await transaction.get(itemRef);
      const privDoc = await transaction.get(privRef);
      const sigReqDoc = await transaction.get(sigReqRef);

      let concludedClaimDocs: any[] = [];
      const claimsCol = adminDb.collection("claims");
      if (claimsCol && typeof claimsCol.where === "function") {
        const concludedQuery = claimsCol.where("itemId", "==", itemId).where("status", "==", "CONCLUIDO");
        const claimsSnap = await transaction.get(concludedQuery);
        concludedClaimDocs = claimsSnap?.docs || [];
      }

      if (!itemDoc || !itemDoc.exists) {
        throw new Error("ITEM_NOT_FOUND");
      }

      const rawItemData = (typeof itemDoc.data === "function" ? itemDoc.data() : itemDoc.data) || {};
      const privData = privDoc?.exists ? ((typeof privDoc.data === "function" ? privDoc.data() : privDoc.data) || {}) : null;
      const itemData = mergePublicAndPrivateItemData(rawItemData, privData);

      if (itemData.status !== "DEVOLVIDO") {
        throw new Error("ITEM_NOT_DEVOLVIDO");
      }

      previousStatus = itemData.type === "PERDIDO" ? "PERDIDO" : "ENCONTRADO";
      const existingHistory = Array.isArray(itemData.history)
        ? itemData.history
        : Array.isArray(itemData.historyLogs)
        ? itemData.historyLogs
        : [];

      // Evaluate concluded claims linked to this item safely
      const eligibleClaims = concludedClaimDocs.filter((cDoc: any) => {
        const cData = (typeof cDoc.data === "function" ? cDoc.data() : cDoc.data) || {};
        return (
          cData.itemId === itemId &&
          cData.status === "CONCLUIDO" &&
          !cData.cancelledAt &&
          cData.status !== "CANCELADO" &&
          cData.status !== "REJEITADO"
        );
      });

      const deleteMarker = typeof FieldValue?.delete === "function" ? FieldValue.delete() : null;

      let claimSummaryNote = "";
      if (eligibleClaims.length === 1) {
        const clmDoc = eligibleClaims[0];
        restoredClaimIds = [clmDoc.id];
        claimSummaryNote = ` Reivindicação #${clmDoc.id} restaurada de CONCLUIDO para APROVADO para revisão/nova retirada.`;
      } else if (eligibleClaims.length > 1) {
        requiresAdminClaimReview = true;
        claimSummaryNote = ` Atenção: ${eligibleClaims.length} reivindicações concluídas vinculadas exigem revisão administrativa manual antes de nova entrega.`;
      }

      const hadRemoteSignature =
        Boolean(sigReqDoc?.exists) ||
        itemData.recipientSignatureType === "REMOTE_EMAIL" ||
        Boolean(itemData.signatureToken);

      if (hadRemoteSignature) {
        signatureRequestInvalidated = true;
      }

      historyEntry = {
        id: `hist-${Date.now()}`,
        action: "Devolução reaberta",
        actorId: authUser.uid,
        actorName,
        actorRole: "ADMIN",
        userId: authUser.uid,
        userName: actorName,
        userRole: "ADMIN",
        timestamp: nowIso,
        details: `Devolução reaberta pelo Admin. Motivo obrigatório: ${reason}.${
          signatureRequestInvalidated ? " Token de assinatura remota invalidado." : ""
        }${claimSummaryNote}`,
      };

      const publicHistoryEntry = {
        id: historyEntry.id,
        action: "Devolução reaberta",
        actorRole: "ADMIN",
        userRole: "ADMIN",
        timestamp: nowIso,
        details: "Registro de devolução reaberto administrativamente.",
      };

      const existingPublicHistory = sanitizePublicItemDocument(rawItemData).history || [];
      const nextPublicHistory = [...existingPublicHistory, publicHistoryEntry];
      const nextPrivateHistory = [...existingHistory, historyEntry];

      transaction.update(itemRef, {
        ...buildPublicFieldDeletionMap(deleteMarker),
        status: previousStatus,
        resolutionDate: deleteMarker,
        history: nextPublicHistory,
        historyLogs: nextPublicHistory,
      });

      if (privDoc?.exists) {
        transaction.set(
          privRef,
          {
            ...buildPublicFieldDeletionMap(deleteMarker),
            itemId,
            status: previousStatus,
            resolutionDate: deleteMarker,
            reopenedAt: nowIso,
            reopenedByUid: authUser.uid,
            privateHistory: nextPrivateHistory,
            privateHistoryLogs: nextPrivateHistory,
          },
          { merge: true }
        );
      }

      // Atomically invalidate any active/previous remote signature request so old links can never finalize the reopened item
      if (hadRemoteSignature) {
        transaction.set(
          sigReqRef,
          {
            itemId,
            tokenHash: deleteMarker,
            token: deleteMarker,
            encryptedToken: deleteMarker,
            used: true,
            invalidated: true,
            invalidatedAt: nowIso,
            invalidatedByUid: authUser.uid,
            invalidatedByName: actorName,
            invalidationReason: reason,
          },
          { merge: true }
        );
      }

      if (eligibleClaims.length === 1) {
        const clmDoc = eligibleClaims[0];
        transaction.update(clmDoc.ref, {
          status: "APROVADO",
          completedAt: deleteMarker,
          reopenedAt: nowIso,
          reopenedByUid: authUser.uid,
          decisionNotes: `Devolução reaberta administrativamente (${reason}). Solicitação restaurada para APROVADO.`,
        });
      }

      const auditId = `audit-reopen-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
      transaction.set(adminDb.collection("audit_logs").doc(auditId), {
        id: auditId,
        transactionId: `TX-REOPEN-${Date.now().toString(36).toUpperCase()}`,
        objectId: itemId,
        objectType: "RETURN",
        objectTitle: itemData.title || itemId,
        action: "REABERTURA_DEVOLUCAO",
        actorId: authUser.uid,
        actorName,
        actorEmail: authUser.email || "",
        actorRole: "ADMIN",
        timestamp: nowIso,
        fieldChanged: "status_devolucao",
        oldValue: "DEVOLVIDO",
        newValue: previousStatus,
        signatureRequestInvalidated,
        restoredClaimIds,
        requiresAdminClaimReview,
        details: `Devolução do item #${itemId} (${itemData.title || itemId}) reaberta pelo Administrador ${actorName}. Motivo: ${reason}.${
          signatureRequestInvalidated ? " Solicitação/token remoto invalidado atomicamente." : ""
        }${claimSummaryNote}`,
        immutable: true,
      });

      const actId = `act-reopen-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
      transaction.set(adminDb.collection("activity_logs").doc(actId), {
        id: actId,
        adminId: authUser.uid,
        actorId: authUser.uid,
        adminName: actorName,
        actorName,
        actorEmail: authUser.email || "",
        actorRole: "ADMIN",
        action: "REABERTURA_DEVOLUCAO",
        details: `Reabriu a devolução do objeto #${itemId} (${itemData.title || itemId}). Motivo: ${reason}.${
          signatureRequestInvalidated ? " Token remoto invalidado." : ""
        }${claimSummaryNote}`,
        timestamp: nowIso,
      });
    });

    return {
      success: true,
      statusCode: 200,
      itemId,
      previousStatus,
      historyEntry,
      signatureRequestInvalidated,
      restoredClaimIds,
      requiresAdminClaimReview,
    };
  } catch (err: any) {
    if (err?.message === "ITEM_NOT_FOUND") {
      return { success: false, statusCode: 404, error: "Ocorrência não encontrada no banco de dados." };
    }
    if (err?.message === "ITEM_NOT_DEVOLVIDO") {
      return { success: false, statusCode: 409, error: "Apenas itens com status DEVOLVIDO podem ser reabertos." };
    }
    console.error("[Admin Reopen Return Error]:", err?.message || err);
    return { success: false, statusCode: 500, error: "Erro interno ao reabrir devolução no banco de dados." };
  }
}

// API Endpoint: Public Sanitized Catalog Projection (Zero-PII fallback for visitors/students)
app.get(["/api/items/public-catalog", "/items/public-catalog"], generalRateLimiter, async (_req, res) => {
  try {
    const adminDb = getAdminFirestore();
    if (!adminDb) {
      return res.status(503).json({ success: false, error: "Catálogo indisponível no momento." });
    }
    const snap = await adminDb.collection("items").get();
    const docs = snap?.docs || [];
    const items = docs.map((d: any) => {
      const raw = (typeof d.data === "function" ? d.data() : d.data) || {};
      return sanitizePublicItemDocument({ ...raw, id: raw.id || d.id });
    });
    return res.json({ success: true, items });
  } catch (err: any) {
    console.error("Erro ao consultar projeção pública do catálogo:", err?.message || err);
    return res.status(500).json({ success: false, error: "Erro interno ao carregar catálogo público." });
  }
});

// API Endpoint: Authoritative Private Return Records for Active Staff & Admin
app.get(["/api/items/private-return-records", "/items/private-return-records"], requireAuth, generalRateLimiter, async (req, res) => {
  try {
    const adminDb = getAdminFirestore();
    if (!adminDb) {
      return res.status(503).json({ success: false, error: "Banco de dados indisponível." });
    }
    const staffCheck = await validateStaffOrAdminAccess(adminDb, req.authUser!);
    if (!staffCheck.authorized) {
      return res.status(staffCheck.statusCode).json({
        success: false,
        error: staffCheck.errorMessage || "Acesso restrito a Servidores ativos e Administradores.",
      });
    }
    const snap = await adminDb.collection("item_return_records").get();
    const docs = snap?.docs || [];
    const records = docs.map((d: any) => {
      const raw = (typeof d.data === "function" ? d.data() : d.data) || {};
      return { ...raw, itemId: raw.itemId || d.id };
    });
    return res.json({ success: true, records });
  } catch (err: any) {
    console.error("Erro ao carregar registros privados de devolução:", err?.message || err);
    return res.status(500).json({ success: false, error: "Erro ao consultar registros privados de devolução." });
  }
});

// API Endpoint: Authoritative Formal Item Return Registration
app.post(["/api/items/register-return", "/items/register-return"], requireAuth, generalRateLimiter, async (req, res) => {
  try {
    const adminDb = getAdminFirestore();
    const result = await executeFormalItemReturn(adminDb, req.authUser!, req.body || {});
    if (!result.success) {
      return res.status(result.statusCode).json({
        success: false,
        error: result.error,
        code: result.code,
      });
    }
    return res.json(result);
  } catch (err: any) {
    console.error("Erro inesperado na rota /api/items/register-return:", err?.message || err);
    return res.status(500).json({
      success: false,
      error: "Erro interno ao processar registro formal de devolução.",
    });
  }
});

// API Endpoint: Admin-Only Formal Return Reopen
app.post(["/api/items/reopen-return", "/items/reopen-return"], requireAuth, generalRateLimiter, async (req, res) => {
  try {
    const adminDb = getAdminFirestore();
    const result = await executeAdminReopenReturn(adminDb, req.authUser!, req.body || {});
    if (!result.success) {
      return res.status(result.statusCode).json({
        success: false,
        error: result.error,
      });
    }
    return res.json(result);
  } catch (err: any) {
    console.error("Erro inesperado na rota /api/items/reopen-return:", err?.message || err);
    return res.status(500).json({
      success: false,
      error: "Erro interno ao reabrir devolução.",
    });
  }
});

// API Root Status Endpoint
app.get(["/api", "/api/status"], (_req, res) => {
  res.json({
    status: "ok",
    service: "IFPR Achados & Perdidos Backend API",
    institution: "Instituto Federal do Paraná (IFPR) - Campus Ivaiporã",
    timestamp: new Date().toISOString(),
    environment: {
      isVercel: Boolean(process.env.VERCEL),
      nodeEnv: process.env.NODE_ENV || "development",
    },
  });
});

// Global Express Error Handler Middleware
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const sanitizedMsg = String(err?.message || err)
    .replace(/bearer\s+[a-zA-Z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, "[REDACTED_EMAIL]")
    .replace(/key=[a-zA-Z0-9_-]+/gi, "key=[REDACTED]")
    .replace(/token=[a-zA-Z0-9._-]+/gi, "token=[REDACTED]");

  console.error("[Global Error Handler] Exceção capturada no servidor:", {
    name: err?.name,
    message: sanitizedMsg,
    method: req.method,
    url: req.originalUrl || req.url,
    ip: getClientIp(req),
    timestamp: new Date().toISOString(),
  });

  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      error: "Erro interno no servidor do Localiza+ IFPR.",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
});

// Serve frontend assets
async function startServer() {
  // Never run startServer in serverless environments (Vercel, AWS Lambda)
  if (
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT ||
    process.env.VERCEL_ENV
  ) {
    return;
  }

  const isProduction = process.env.NODE_ENV === "production";
  const distPath = path.join(process.cwd(), "dist");

  if (!isProduction) {
    try {
      // In tsx/Node ESM execution, a global __dirname='.' string can cause plugins like vite-plugin-pwa to fail createRequire
      if (typeof (globalThis as any).__dirname !== "undefined" && (globalThis as any).__dirname === ".") {
        delete (globalThis as any).__dirname;
      }
      if (typeof (global as any).__dirname !== "undefined" && (global as any).__dirname === ".") {
        delete (global as any).__dirname;
      }

      // Dynamic string package name prevents static bundlers (like @vercel/nft) from bundling Vite into Serverless functions
      const viteModule = "vite";
      const { createServer: createViteServer } = await import(/* @vite-ignore */ viteModule);
      const vite = await createViteServer({
        server: { middlewareMode: true, hmr: false },
        appType: "spa",
      });

      // Intercept /@vite/client in container sandbox to eliminate failing websocket connections and [vite] console alarms
      app.get("/@vite/client", async (_req, res, next) => {
        try {
          const result = await vite.transformRequest("/@vite/client");
          if (result && typeof result.code === "string") {
            let code = result.code;
            code = `function __createSafeWS() { return { addEventListener(){}, removeEventListener(){}, send(){}, close(){}, readyState: 3 }; }\n` + code;
            code = code.replaceAll("new WebSocket(", "__createSafeWS(");
            code = code.replace(/console\.error\(\s*`\[vite\][\s\S]*?`\s*\);/g, "/* suppressed */");
            code = code.replace(/console\.error\(`\[vite\][^`]*`\);/g, "/* suppressed */");
            code = code.replace(/error:\s*\(err\)\s*=>\s*console\.error\(\s*("[^"]*vite[^"]*"|'[^']*vite[^']*')\s*,\s*err\)/g, "error: () => {}");
            code = code.replaceAll("[vite]", "[dev]");

            res.set({
              "Content-Type": "application/javascript",
              "Cache-Control": "no-cache",
            });
            return res.send(code);
          }
        } catch {
          // Fallback to standard vite middleware
        }
        next();
      });

      app.use(vite.middlewares);
    } catch (viteErr) {
      console.warn("[Vite Middleware Warning] Could not load Vite dev server:", viteErr);
      if (fs.existsSync(path.join(distPath, "index.html"))) {
        app.use(express.static(distPath));
        app.get("*", (_req, res) => {
          res.sendFile(path.join(distPath, "index.html"));
        });
      }
    }
  } else {
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
    }
    app.get("*", (_req, res) => {
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).json({
          error: "Not Found",
          message: "Frontend static files not found in build directory.",
        });
      }
    });
  }

  const isServerlessEnv = Boolean(
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT ||
    process.env.VERCEL_ENV
  );

  if (!isServerlessEnv && process.env.NODE_ENV !== "test") {
    const serverInstance = app.listen(PORT, "0.0.0.0", () => {
      console.log(`IFPR Achados & Perdidos backend rodando em http://localhost:${PORT}`);
    });
    serverInstance.on("error", (err: any) => {
      if (err?.code === "EADDRINUSE") {
        console.error(`[Server Port Conflict] A porta ${PORT} já está em uso:`, err.message);
      } else {
        console.error("[Server Listen Error]:", err);
      }
    });
  }
}

const isServerlessRuntime = Boolean(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.LAMBDA_TASK_ROOT ||
  process.env.VERCEL_ENV
);

if (!isServerlessRuntime && process.env.NODE_ENV !== "test") {
  startServer();
}

export default app;

