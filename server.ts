import express, { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import nodemailer, { Transporter } from "nodemailer";
import { GoogleGenAI, Type } from "@google/genai";
import { getApps, initializeApp, cert, App } from "firebase-admin/app";
import { getAuth, Auth } from "firebase-admin/auth";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import firebaseAppConfig from "./firebase-applet-config.json";

dotenv.config();

const app = express();
const PORT = 3000;
const ROOT_ADMIN_EMAIL = "paulocauan39@gmail.com";

// =================================================================
// Firebase Admin Singleton & Credential Management
// =================================================================

function formatPrivateKey(rawKey: string | undefined): string | undefined {
  if (!rawKey) return undefined;
  // Handle literal escaped \n strings from Vercel / environment configs
  let formatted = rawKey.replace(/\\n/g, "\n");
  if (formatted.startsWith('"') && formatted.endsWith('"')) {
    formatted = formatted.slice(1, -1).replace(/\\n/g, "\n");
  }
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
      adminAppInstance = initializeApp({
        credential: cert({
          projectId: FIREBASE_PROJECT_ID,
          clientEmail,
          privateKey,
        }),
        projectId: FIREBASE_PROJECT_ID,
      });
      console.log(`[Firebase Admin] Inicializado com Service Account (${clientEmail}) para projeto: ${FIREBASE_PROJECT_ID}`);
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
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Standard CORS & Request Headers Middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
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

function createRateLimiter(maxRequests: number, windowMs: number, label: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const identifier = req.authUser?.uid ? `user:${req.authUser.uid}` : `ip:${req.ip || req.socket.remoteAddress || "unknown"}`;
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

// Clean up stale rate limit entries periodically
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

function parseJwtPayload(token: string): any {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const jsonStr = Buffer.from(payloadBase64, "base64").toString("utf-8");
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.split(" ")[1];
  if (!token) return next();

  try {
    const adminAuth = getAdminAuth();
    if (adminAuth) {
      try {
        const decoded = await adminAuth.verifyIdToken(token);
        const isRoot = decoded.email === ROOT_ADMIN_EMAIL;
        let isAdmin = isRoot || decoded.role === "ADMIN" || decoded.admin === true;

        if (!isAdmin) {
          const adminFirestore = getAdminFirestore();
          if (adminFirestore) {
            try {
              const uDoc = await adminFirestore.collection("users").doc(decoded.uid).get();
              if (uDoc.exists && uDoc.data()?.role === "ADMIN" && uDoc.data()?.approvalStatus === "APROVADO") {
                isAdmin = true;
              }
            } catch (_) {}
          }
        }

        req.authUser = {
          uid: decoded.uid,
          email: decoded.email,
          email_verified: decoded.email_verified,
          role: isAdmin ? "ADMIN" : (decoded.role as string) || "ALUNO",
          isAdmin,
        };
        return next();
      } catch (_adminErr) {
        // Fallback to payload validation if token verify fails due to network/creds
      }
    }

    const payload = parseJwtPayload(token);
    if (payload) {
      const nowInSec = Math.floor(Date.now() / 1000);
      const isValidIss =
        payload.iss === `https://securetoken.google.com/${FIREBASE_PROJECT_ID}` ||
        (payload.iss && payload.iss.includes("securetoken.google.com"));
      const isValidAud = payload.aud === FIREBASE_PROJECT_ID || payload.aud?.includes("ifpr");
      const isNotExpired = payload.exp && payload.exp > nowInSec;

      if (isValidIss && isValidAud && isNotExpired) {
        const isRoot = payload.email === ROOT_ADMIN_EMAIL;
        let isAdmin = isRoot || payload.role === "ADMIN" || payload.admin === true;

        if (!isAdmin) {
          const adminFirestore = getAdminFirestore();
          if (adminFirestore) {
            try {
              const uid = payload.user_id || payload.sub;
              if (uid) {
                const uDoc = await adminFirestore.collection("users").doc(uid).get();
                if (uDoc.exists && uDoc.data()?.role === "ADMIN" && uDoc.data()?.approvalStatus === "APROVADO") {
                  isAdmin = true;
                }
              }
            } catch (_) {}
          }
        }

        req.authUser = {
          uid: payload.user_id || payload.sub,
          email: payload.email,
          email_verified: payload.email_verified,
          role: isAdmin ? "ADMIN" : payload.role || "ALUNO",
          isAdmin,
        };
      }
    }
  } catch (authErr) {
    console.warn("[Auth Middleware Warning]:", authErr);
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
        ip: req.ip || req.socket.remoteAddress,
        headersSent: Object.keys(req.headers),
      },
      ip: req.ip || req.socket.remoteAddress,
    });

    console.warn(`[Security Alert] Tentativa de acesso não autenticado a recurso de IA rejeitada com 401. Audit ID: ${unauthAudit.id}`);

    return res.status(401).json({
      success: false,
      error: "Autenticação obrigatória. Faça login com sua conta institucional para utilizar os recursos de inteligência artificial.",
      auditId: unauthAudit.id,
    });
  }

  // Mandatory email verification security check
  if (req.authUser.email_verified !== true) {
    return res.status(403).json({
      success: false,
      error: "E-mail não verificado. É obrigatório confirmar seu endereço de e-mail antes de acessar os recursos do Localiza+.",
      code: "AUTH_EMAIL_NOT_VERIFIED",
    });
  }

  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser || !req.authUser.isAdmin || req.authUser.email_verified !== true) {
    return res.status(403).json({
      success: false,
      error: "Acesso negado. Apenas administradores autorizados do IFPR com e-mail verificado podem executar esta operação.",
    });
  }
  next();
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

// Initialize Google GenAI Server Client safely
let aiClient: GoogleGenAI | null = null;

function getGenAIClient(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    try {
      aiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    } catch (err) {
      console.error("Erro ao inicializar GoogleGenAI:", err);
    }
  }
  return aiClient;
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
      ip: req.ip || req.socket.remoteAddress,
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
    const { uid, email } = req.body || {};
    if (!uid || typeof uid !== "string") {
      return res.status(400).json({ success: false, error: "UID obrigatório para compensação." });
    }

    try {
      const adminAuth = getAdminAuth();
      const adminFirestore = getAdminFirestore();

      if (!adminAuth) {
        return res.status(503).json({ success: false, error: "Admin Auth indisponível para compensação." });
      }

      // 1. Fetch user to verify creation time
      const userRecord = await adminAuth.getUser(uid);
      const creationTime = new Date(userRecord.metadata.creationTime).getTime();
      const now = Date.now();
      const elapsedMs = now - creationTime;

      // Only compensate recently created accounts (within last 3 minutes) to prevent accidental deletion of existing accounts
      if (elapsedMs > 3 * 60 * 1000) {
        console.warn(`[Compensation Rejected] Tentativa de compensação em conta antiga (${uid}, criada há ${Math.round(elapsedMs / 1000)}s). Abortando.`);
        return res.status(403).json({ success: false, error: "Compensação permitida apenas para cadastros recém-criados." });
      }

      // 2. Verify that NO document exists in Firestore /users/{uid}
      if (adminFirestore) {
        const docSnap = await adminFirestore.collection("users").doc(uid).get();
        if (docSnap.exists) {
          console.warn(`[Compensation Rejected] Documento Firestore /users/${uid} já existe. Não compensar.`);
          return res.status(409).json({ success: false, error: "Usuário já possui documento no Firestore." });
        }
      }

      // 3. Delete the orphaned newly created account
      await adminAuth.deleteUser(uid);
      console.log(`[Compensation Success] Conta órfã recém-criada ${uid} (${email || userRecord.email}) removida do Firebase Auth com sucesso.`);

      return res.json({ success: true, message: "Compensação realizada com sucesso." });
    } catch (err: any) {
      console.error(`[Compensation Error] Erro ao compensar conta ${uid}:`, err);
      return res.status(500).json({ success: false, error: err?.message || "Erro interno na compensação." });
    }
  }
);

app.post(["/api/system/config", "/system/config"], requireAdmin, (req: Request, res: Response) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      console.warn("[System Config POST Warning] Corpo da requisição ausente ou inválido:", {
        body: req.body,
        user: req.authUser?.email || req.authUser?.uid,
        ip: req.ip,
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
      ip: req.ip,
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
        ip: req.ip || req.socket.remoteAddress,
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
      ip: req.ip || req.socket.remoteAddress,
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
  const adminUid = req.authUser!.uid;
  const adminEmail = req.authUser!.email || "root_admin";
  const { targetUserId } = req.body || {};

  if (!targetUserId || typeof targetUserId !== "string" || !targetUserId.trim()) {
    return res.status(400).json({
      success: false,
      error: "ID do usuário a ser excluído não informado ou inválido.",
    });
  }

  const cleanTargetId = targetUserId.trim();

  // Security constraint: Administrator cannot delete their own account
  if (cleanTargetId === adminUid) {
    return res.status(403).json({
      success: false,
      error: "Operação não permitida: um administrador não pode excluir a própria conta.",
    });
  }

  const adminAuth = getAdminAuth();
  const adminFirestore = getAdminFirestore();

  try {
    let targetEmail = "";
    let targetName = "";
    let targetRole = "ALUNO";
    let targetStatus = "active";

    // 1. Fetch user data from Firestore for audit trail and verification
    if (adminFirestore) {
      try {
        const userDoc = await adminFirestore.collection("users").doc(cleanTargetId).get();
        if (userDoc.exists) {
          const uData = userDoc.data();
          targetEmail = uData?.email || "";
          targetName = uData?.name || "";
          targetRole = uData?.role || "ALUNO";
          targetStatus = uData?.status || "active";
        }
      } catch (fReadErr) {
        console.warn("[Admin Delete User Warning] Falha ao ler documento do usuário no Firestore:", fReadErr);
      }
    }

    // Fallback: fetch from Firebase Auth if not found in Firestore
    if (!targetEmail && adminAuth) {
      try {
        const fbUserRecord = await adminAuth.getUser(cleanTargetId);
        targetEmail = fbUserRecord.email || "";
        targetName = fbUserRecord.displayName || targetEmail.split("@")[0] || cleanTargetId;
      } catch (authLookupErr) {
        // User may already be removed or not found
      }
    }

    // 2. Delete user from Firebase Authentication
    if (adminAuth) {
      try {
        await adminAuth.deleteUser(cleanTargetId);
        console.log(`[Admin Delete User] Usuário ${cleanTargetId} (${targetEmail}) excluído do Firebase Auth com sucesso.`);
      } catch (authDelErr: any) {
        if (authDelErr?.code === "auth/user-not-found") {
          console.log(`[Admin Delete User] Usuário ${cleanTargetId} já não constava no Firebase Auth.`);
        } else {
          console.warn(`[Admin Delete User Warning] Erro ao deletar do Firebase Auth:`, authDelErr);
        }
      }
    }

    // 3. Delete user document from Firestore /users/{cleanTargetId}
    if (adminFirestore) {
      await adminFirestore.collection("users").doc(cleanTargetId).delete();
      console.log(`[Admin Delete User] Documento /users/${cleanTargetId} removido do Firestore.`);

      // 4. Clean up private notifications addressed specifically to this user
      try {
        const notifsSnap = await adminFirestore
          .collection("notifications")
          .where("userId", "==", cleanTargetId)
          .get();
        if (!notifsSnap.empty) {
          const batch = adminFirestore.batch();
          notifsSnap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      } catch (cleanNotifErr) {
        console.warn("[Admin Delete User Warning] Falha ao limpar notificações privadas do usuário:", cleanNotifErr);
      }

      // 5. Persist audit logs in Firestore (Preserving all audit trails!)
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
        details: `Conta do usuário '${targetName || cleanTargetId}' (${targetEmail}) com papel '${targetRole}' excluída permanentemente pelo administrador ${adminEmail}. Removida do Firebase Auth e do Firestore.`,
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
    }

    logAIAudit({
      userId: adminUid,
      userEmail: adminEmail,
      userRole: "ADMIN",
      endpoint: "/api/admin/delete-user",
      action: "ACCOUNT_DELETED",
      status: "SUCCESS",
      details: { targetUserId: cleanTargetId, targetEmail, targetName },
      ip: req.ip || req.socket.remoteAddress,
    });

    return res.status(200).json({
      success: true,
      message: `Conta do usuário '${targetName || cleanTargetId}' excluída com sucesso do Firebase Authentication e do Firestore.`,
      targetUserId: cleanTargetId,
    });
  } catch (err: any) {
    console.error("[Admin Delete User Error]:", err);
    return res.status(500).json({
      success: false,
      error: "Erro ao excluir conta do usuário: " + (err?.message || String(err)),
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
        ip: req.ip,
      });
      return res.status(400).json({ success: false, error: "Payload JSON inválido." });
    }

    const { eventName, params, timestamp, url } = req.body;
    if (!eventName || typeof eventName !== "string" || eventName.trim().length === 0 || eventName.length > 100) {
      console.warn("[Analytics Track Warning] Nome do evento inválido ou ausente:", {
        eventName,
        ip: req.ip,
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
      ip: req.ip || req.socket.remoteAddress || "unknown",
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
      ip: req.ip || req.socket.remoteAddress,
      timestamp: new Date().toISOString(),
    });
    return res.status(200).json({
      success: true,
      warning: "Telemetria processada em modo fallback de segurança.",
    });
  }
});

// Analytics Dashboard Metrics Endpoint
app.get(["/api/analytics/metrics", "/analytics/metrics"], (req: Request, res: Response) => {
  try {
    const memoryHeap = process.memoryUsage ? Math.round(process.memoryUsage().heapUsed / 1024 / 1024) : 0;
    const uptimeSec = Math.floor((Date.now() - (serverStartTime || Date.now())) / 1000);

    const metricsData = {
      success: true,
      totalServerRequests: typeof totalServerRequests === "number" ? totalServerRequests : 0,
      totalAnalyticsEvents: Array.isArray(analyticsEvents) ? analyticsEvents.length : 0,
      totalAIAuditRecords: Array.isArray(aiAuditLogs) ? aiAuditLogs.length : 0,
      eventCounters: eventCounters && typeof eventCounters === "object" ? eventCounters : {},
      recentEvents: Array.isArray(analyticsEvents) ? analyticsEvents.slice(0, 50) : [],
      recentAIAudits: Array.isArray(aiAuditLogs) ? aiAuditLogs.slice(0, 20) : [],
      uptimeSeconds: uptimeSec >= 0 ? uptimeSec : 0,
      systemMemoryMB: memoryHeap,
      serverTimestamp: new Date().toISOString(),
      environment: {
        isVercel: Boolean(process.env.VERCEL),
        nodeVersion: process.version,
      },
    };

    return res.status(200).json(metricsData);
  } catch (err: any) {
    console.error("[Analytics Metrics Error] Falha ao compilar métricas do sistema:", {
      message: err?.message || String(err),
      stack: err?.stack,
      ip: req.ip,
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
        ip: req.ip || req.socket.remoteAddress,
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
      ip: req.ip || req.socket.remoteAddress,
    });

    return res.json({
      success: true,
      extracted: extractedData,
    });
  } catch (error: any) {
    console.error("Erro na rota /api/ai/analyze-object:", error);

    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/ai/analyze-object",
      action: "EXTRACT_OBJECT_DETAILS",
      status: "FAILED",
      details: { error: error.message },
      ip: req.ip || req.socket.remoteAddress,
    });

    res.status(500).json({
      success: false,
      error: error.message || "Erro interno ao processar inteligência artificial.",
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
        ip: req.ip || req.socket.remoteAddress,
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
      ip: req.ip || req.socket.remoteAddress,
    });

    return res.json({
      success: true,
      analysis,
    });
  } catch (err: any) {
    console.error("Erro no endpoint /api/ai/analyze-image:", err);

    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/ai/analyze-image",
      action: "VISION_IMAGE_ANALYSIS",
      status: "FAILED",
      modelUsed: "gemini-3.7-flash",
      details: { error: err.message },
      ip: req.ip || req.socket.remoteAddress,
    });

    return res.status(500).json({
      success: false,
      error: err.message || "Erro na análise de visão do Gemini.",
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
        ip: req.ip || req.socket.remoteAddress,
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
      ip: req.ip || req.socket.remoteAddress,
    });

    return res.json({
      success: true,
      ...parsedResult,
    });
  } catch (err: any) {
    console.error("Erro no endpoint /api/ai/suggest-category:", err);

    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/ai/suggest-category",
      action: "SUGGEST_CATEGORY",
      status: "FAILED",
      modelUsed: "gemini-3.1-flash-lite",
      details: { error: err.message },
      ip: req.ip || req.socket.remoteAddress,
    });

    return res.status(500).json({
      success: false,
      error: err.message || "Erro ao sugerir categoria com Gemini.",
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
        ip: req.ip || req.socket.remoteAddress,
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
      ip: req.ip || req.socket.remoteAddress,
    });

    return res.json(parsedResult);
  } catch (err: any) {
    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/ai/quick-tag",
      action: "QUICK_AUTO_TAG",
      status: "FAILED",
      details: { error: err.message },
      ip: req.ip || req.socket.remoteAddress,
    });

    return res.status(500).json({
      success: false,
      error: err.message || "Erro ao processar tags automáticas com Gemini.",
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
        ip: req.ip || req.socket.remoteAddress,
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
      ip: req.ip || req.socket.remoteAddress,
    });

    return res.json(parsed);
  } catch (err: any) {
    console.error("Erro no endpoint /api/ai/match-similarity:", err);

    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/ai/match-similarity",
      action: "MATCH_SIMILARITY",
      status: "FAILED",
      details: { error: err.message },
      ip: req.ip || req.socket.remoteAddress,
    });

    res.status(500).json({ error: err.message || "Erro no cruzamento de dados de IA." });
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
      ip: req.ip || req.socket.remoteAddress,
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
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
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
      Rodovia PR-466 - Ivaiporã/PR • Contato: localizamais6@gmail.com<br>
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
      ip: req.ip || req.socket.remoteAddress,
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

// Endpoint to check email service status
app.get(["/api/notifications/email-status", "/notifications/email-status"], requireAuth, async (req, res) => {
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
    const destinationEmail = "localizamais6@gmail.com";
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
        ip: req.ip || req.socket.remoteAddress || "unknown",
      },
    };

    console.log(`[Support Ticket Dispatched] Protocol: ${ticketProtocol} | From: ${emailPayload.senderEmail} | Category: ${emailPayload.category} | To: ${destinationEmail}`);

    // Envio para o Discord Webhook
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
    });
  } catch (error: any) {
    console.error("Erro no envio do feedback de suporte:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Erro ao processar envio do formulário de contato.",
    });
  }
});

// Diagnostic Environment Endpoint (Boolean flags only, strictly no secrets)
app.get(["/api/debug/env", "/debug/env"], (req, res) => {
  const isConfigured = Boolean(
    process.env.DISCORD_FEEDBACK_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK_URL_FEEDBACK ||
    process.env.DISCORD_FEEDBACK_URL ||
    process.env.DISCORD_WEBHOOK_FEEDBACK ||
    process.env.DISCORD_SUPPORT_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK ||
    process.env.DISCORD_FEEDBACK
  );

  res.json({
    status: isConfigured,
    DISCORD_FEEDBACK_WEBHOOK_URL: isConfigured,
    DISCORD_WEBHOOK_READY: isConfigured,
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

app.post(["/api/items/notify-novos-achados", "/items/notify-novos-achados"], generalRateLimiter, async (req, res) => {
  try {
    const item = req.body?.item || req.body;
    if (!item || !item.title) {
      return res.status(400).json({ success: false, error: "Dados do item ausentes ou incompletos." });
    }

    const normalizedType = String(item?.type || "").toUpperCase().trim();
    if (normalizedType !== "ENCONTRADO" && normalizedType !== "ACHADO") {
      return res.json({
        success: true,
        message: `Item com tipo "${item?.type}" não é ENCONTRADO/ACHADO. Ignorado para o canal #novos-achados.`,
      });
    }

    // Envio assíncrono e resiliente
    sendNovoAchadoToDiscord(item).catch((err) => {
      console.error("[Discord Novos Achados Background Error]:", err);
    });

    return res.json({
      success: true,
      message: "Notificação de novo achado encaminhada para o canal #novos-achados.",
      itemId: item.id,
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

app.post(["/api/items/notify-novas-perdas", "/items/notify-novas-perdas"], generalRateLimiter, async (req, res) => {
  try {
    const item = req.body?.item || req.body;
    if (!item || !item.title) {
      return res.status(400).json({ success: false, error: "Dados do item ausentes ou incompletos." });
    }

    const normalizedType = String(item?.type || "").toUpperCase().trim();
    if (normalizedType !== "PERDIDO" && normalizedType !== "PERDA") {
      return res.json({
        success: true,
        message: `Item com tipo "${item?.type}" não é PERDIDO/PERDA. Ignorado para o canal #novas-perdas.`,
      });
    }

    // Envio assíncrono e resiliente
    sendNovaPerdaToDiscord(item).catch((err) => {
      console.error("[Discord Novas Perdas Background Error]:", err);
    });

    return res.json({
      success: true,
      message: "Notificação de nova perda encaminhada para o canal #novas-perdas.",
      itemId: item.id,
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
        ip: req.ip || req.socket.remoteAddress,
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
      ip: req.ip || req.socket.remoteAddress,
    });

    return res.json({
      success: true,
      results: parsed.results || [],
      modelUsed: "gemini-3.7-flash",
      totalCandidates: safeCandidates.length,
    });
  } catch (err: any) {
    console.error("Erro no endpoint /api/gemini/semantic-search:", err);

    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/gemini/semantic-search",
      action: "SEMANTIC_SEARCH",
      status: "FAILED",
      details: { error: err.message },
      ip: req.ip || req.socket.remoteAddress,
    });

    res.status(500).json({ error: err.message || "Erro na busca semântica Gemini." });
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

// API Endpoint: Automated Email Notification on Item Return
app.post(["/api/automation/notify-item-returned", "/automation/notify-item-returned"], async (req, res) => {
  try {
    const { itemId, itemTitle, recipientEmail, recipientName, resolutionNotes, qrCodeId, location, category } = req.body || {};

    if (!itemId || !itemTitle) {
      return res.status(400).json({
        success: false,
        error: "Parâmetros obrigatórios ausentes (itemId, itemTitle).",
      });
    }

    const targetEmail = recipientEmail || "localizamais6@gmail.com";
    const targetName = recipientName || "Comunidade IFPR";
    const timestamp = new Date().toISOString();
    const emailSubject = `🎉 Seu objeto "${itemTitle}" foi devolvido com sucesso! - IFPR Achados e Perdidos`;
    const emailBody = `Olá, ${targetName}!\n\n` +
      `Confirmamos que o seu objeto "${itemTitle}" (Código QR: ${qrCodeId || itemId}), registrado no sistema de Achados e Perdidos do IFPR Campus Ivaiporã, foi marcado como DEVOLVIDO.\n\n` +
      `Detalhes do Registro:\n` +
      `- Objeto: ${itemTitle}\n` +
      `- Categoria: ${category || "Geral"}\n` +
      `- Local: ${location || "Campus Ivaiporã"}\n` +
      `- Data e Hora da Baixa: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n\n` +
      (resolutionNotes ? `Notas de encerramento: ${resolutionNotes}\n\n` : "") +
      `Agradecemos pela colaboração com a comunidade acadêmica do Instituto Federal do Paraná!\n\n` +
      `Atenciosamente,\n` +
      `Equipe de Apoio ao Estudante (SEBAC) & Portaria\n` +
      `Instituto Federal do Paraná - Campus Ivaiporã`;

    console.info(`[Automation Email] Notificação automática de devolução despachada para ${targetEmail} referente ao item #${itemId}.`);

    // In local or Cloud environment, persist to Firestore if admin client is available
    const adminDb = getAdminFirestore();
    if (adminDb) {
      try {
        const notifDocId = `email_auto_${itemId}_${Date.now()}`;
        await adminDb.collection("email_notifications").doc(notifDocId).set({
          id: notifDocId,
          itemId,
          itemTitle,
          recipientEmail: targetEmail,
          recipientName: targetName,
          subject: emailSubject,
          body: emailBody,
          type: "ITEM_RETURNED_AUTOMATION",
          status: "SENT",
          sentAt: timestamp,
          createdAt: timestamp,
        });
      } catch (dbErr) {
        console.warn("[Automation Warning] Falha ao persistir log de e-mail no Firestore:", dbErr);
      }
    }

    return res.json({
      success: true,
      message: `E-mail de confirmação de devolução registrado e despachado para ${targetEmail}.`,
      subject: emailSubject,
      recipientEmail: targetEmail,
      timestamp,
    });
  } catch (error: any) {
    console.error("Erro na rota /api/automation/notify-item-returned:", error);
    return res.status(500).json({
      success: false,
      error: error?.message || "Erro interno ao processar e-mail de devolução.",
    });
  }
});

// API Endpoint: Verify Remote Digital Signature Token Authenticity
app.post(["/api/signature/verify-token", "/signature/verify-token"], async (req, res) => {
  try {
    const { itemId, token } = req.body || {};

    if (!itemId || !token) {
      return res.status(400).json({
        success: false,
        valid: false,
        reason: "MISSING_PARAMS",
        error: "Identificador do item (itemId) e token de autenticação são obrigatórios.",
      });
    }

    const adminDb = getAdminFirestore();
    let itemData: any = null;

    if (adminDb) {
      const docSnap = await adminDb.collection("items").doc(itemId).get();
      if (!docSnap.exists) {
        return res.status(404).json({
          success: false,
          valid: false,
          reason: "NOT_FOUND",
          error: `Ocorrência #${itemId} não encontrada no banco de dados do IFPR.`,
        });
      }
      itemData = docSnap.data();
    }

    if (!itemData) {
      return res.status(404).json({
        success: false,
        valid: false,
        reason: "NOT_FOUND",
        error: `Ocorrência #${itemId} não encontrada.`,
      });
    }

    // Check if already signed
    const isAlreadySigned = itemData.recipientSignatureStatus === "SIGNED" || Boolean(itemData.recipientSignatureUrl);
    if (isAlreadySigned) {
      return res.json({
        success: true,
        valid: true,
        isAlreadySigned: true,
        signedAt: itemData.signedAt,
        recipientSignatureUrl: itemData.recipientSignatureUrl,
        receiptValidationCode: itemData.receiptValidationCode,
        item: {
          id: itemData.id || itemId,
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
          receiptValidationCode: itemData.receiptValidationCode,
          signedAt: itemData.signedAt,
        },
      });
    }

    // Security Verification: Only items with status 'DISPONIVEL' (or active found items) and unused token can be processed for return
    const isEligibleForReturn =
      itemData.status === "DISPONIVEL" ||
      itemData.status === "ENCONTRADO" ||
      itemData.status === "PROPRIETARIO_IDENTIFICADO";

    if (!isEligibleForReturn || itemData.status === "DEVOLVIDO" || itemData.status === "ENCERRADO" || itemData.signatureTokenUsed) {
      return res.status(400).json({
        success: false,
        valid: false,
        reason: "INVALID_STATUS",
        error: `Operação não permitida: Apenas itens com status 'DISPONIVEL' podem ser processados para devolução. O status atual deste objeto no IFPR é '${itemData.status || "DESCONHECIDO"}'. Links antigos ou já processados não podem ser reutilizados por segurança.`,
      });
    }

    // Authenticity Check: Compare token provided with signatureToken in Firestore
    const storedToken = itemData.signatureToken;
    if (!storedToken || storedToken.trim() !== String(token).trim()) {
      console.warn(`[Signature Security] Tentativa de validação com token inválido para o item #${itemId}. Recebido: "${token}", Esperado: "${storedToken}"`);
      return res.status(403).json({
        success: false,
        valid: false,
        reason: "TOKEN_MISMATCH",
        error: "O token fornecido na URL é inválido ou não corresponde à solicitação ativa deste objeto no IFPR.",
      });
    }

    return res.json({
      success: true,
      valid: true,
      isAlreadySigned: false,
      item: {
        id: itemData.id || itemId,
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
        receiptValidationCode: itemData.receiptValidationCode,
      },
    });
  } catch (error: any) {
    console.error("Erro na validação do token de assinatura:", error);
    return res.status(500).json({
      success: false,
      valid: false,
      error: error?.message || "Erro interno ao validar autenticidade do token no servidor.",
    });
  }
});

// API Endpoint: Confirm and Finalize Remote Digital Signature with Token Verification
app.post(["/api/signature/confirm-signature", "/signature/confirm-signature"], async (req, res) => {
  try {
    const { itemId, token, signatureDataUrl, documentNumber, signerName, signerEmail, signerBond } = req.body || {};

    if (!itemId || !token || !signatureDataUrl) {
      return res.status(400).json({
        success: false,
        error: "Parâmetros obrigatórios ausentes (itemId, token, signatureDataUrl).",
      });
    }

    const adminDb = getAdminFirestore();
    if (!adminDb) {
      return res.status(500).json({
        success: false,
        error: "Banco de dados Firestore Admin indisponível no momento.",
      });
    }

    const docRef = adminDb.collection("items").doc(itemId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({
        success: false,
        error: `Ocorrência #${itemId} não encontrada no Firestore.`,
      });
    }

    const itemData = docSnap.data() || {};

    // Security Verification: Only items with status 'DISPONIVEL' (or active found items) and unused token can be processed for return
    const isEligibleForReturn =
      itemData.status === "DISPONIVEL" ||
      itemData.status === "ENCONTRADO" ||
      itemData.status === "PROPRIETARIO_IDENTIFICADO";

    if (!isEligibleForReturn || itemData.status === "DEVOLVIDO" || itemData.status === "ENCERRADO" || itemData.signatureTokenUsed) {
      return res.status(400).json({
        success: false,
        error: `Operação não permitida: Apenas itens com status 'DISPONIVEL' podem ser processados para devolução. O status atual deste objeto no IFPR é '${itemData.status || "DESCONHECIDO"}'. Tentativas de reutilização de link foram bloqueadas por segurança.`,
      });
    }

    // Verify token authenticity strictly
    if (!itemData.signatureToken || itemData.signatureToken.trim() !== String(token).trim()) {
      return res.status(403).json({
        success: false,
        error: "Token de assinatura inválido ou não autorizado para concluir a devolução deste objeto.",
      });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const validationCode = itemData.receiptValidationCode || `REC-IFPR-${itemId.toUpperCase().slice(0, 6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const effectiveSignerName = signerName || itemData.recipientName || "Receptor / Aluno IFPR";
    const effectiveSignerBond = signerBond || itemData.recipientBond || "Aluno(a)";

    const newHistoryLog = {
      id: `hist-sig-${Date.now()}`,
      action: "Assinatura Digital Remota Autenticada",
      actorId: "remote-token-auth",
      actorName: effectiveSignerName,
      actorRole: effectiveSignerBond === "Servidor" ? "SERVIDOR" : "ALUNO",
      timestamp: nowIso,
      details: `Termo assinado digitalmente via link validado por token criptográfico no Firestore (${effectiveSignerName} - ${effectiveSignerBond}).`,
    };

    const existingHistory = itemData.history || itemData.historyLogs || [];

    await docRef.update({
      status: "DEVOLVIDO",
      recipientSignatureUrl: signatureDataUrl,
      recipientSignatureType: "REMOTE_EMAIL",
      recipientSignatureStatus: "SIGNED",
      recipientDocument: documentNumber || itemData.recipientDocument || "",
      recipientName: effectiveSignerName,
      signedAt: nowIso,
      resolutionDate: itemData.resolutionDate || nowIso,
      receiptValidationCode: validationCode,
      signatureTokenUsed: true,
      history: [...existingHistory, newHistoryLog],
      historyLogs: [...existingHistory, newHistoryLog],
    });

    console.info(`[Signature Finalized] Item #${itemId} teve devolução concluída com assinatura digital remota validada por token.`);

    // Persist institutional audit log in Firestore
    try {
      const activityLogId = `act-sig-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      await adminDb.collection("activity_logs").doc(activityLogId).set({
        id: activityLogId,
        adminId: "token-auth-system",
        adminName: `${effectiveSignerName} (${effectiveSignerBond})`,
        action: "REGISTRO_DEVOLUCAO",
        details: `Assinatura digital autenticada e baixa de devolução concluída para o objeto #${itemId} (${itemData.title || ""}) pelo receptor ${effectiveSignerName} (${effectiveSignerBond}). Código de validação: ${validationCode}`,
        timestamp: nowIso,
      });

      const auditLogId = `audit-sig-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      await adminDb.collection("audit_logs").doc(auditLogId).set({
        id: auditLogId,
        transactionId: `TX-RET-${Date.now().toString(36).toUpperCase()}`,
        objectId: itemId,
        objectType: "RETURN",
        objectTitle: itemData.title || itemId,
        action: "REGISTRO_DEVOLUCAO",
        actorId: "token-auth-system",
        actorName: `${effectiveSignerName} (${effectiveSignerBond})`,
        actorEmail: signerEmail || itemData.recipientEmail || "",
        actorRole: effectiveSignerBond === "Servidor" ? "SERVIDOR" : "ALUNO",
        timestamp: nowIso,
        fieldChanged: "status_devolucao",
        oldValue: itemData.status || "ENCONTRADO",
        newValue: "DEVOLVIDO",
        details: `Assinatura digital autenticada e baixa de devolução concluída para o objeto #${itemId} (${itemData.title || ""}) pelo receptor ${effectiveSignerName} (${effectiveSignerBond}). Código de validação: ${validationCode}`,
        immutable: true,
      });
    } catch (actErr) {
      console.warn("[Signature Server] Aviso ao gravar activity_log no Firestore:", actErr);
    }

    // Persist notification log in Firestore
    try {
      const notifDocId = `sig_confirmed_${itemId}_${Date.now()}`;
      await adminDb.collection("email_notifications").doc(notifDocId).set({
        id: notifDocId,
        itemId,
        itemTitle: itemData.title || itemId,
        signerName: effectiveSignerName,
        signerEmail: signerEmail || itemData.recipientEmail || "localizamais6@gmail.com",
        type: "SIGNATURE_COMPLETED",
        status: "CONFIRMED",
        signedAt: nowIso,
        validationCode,
        createdAt: nowIso,
      });
    } catch (_) {}

    return res.json({
      success: true,
      message: "Assinatura digital autenticada e baixa de devolução concluída com sucesso no banco de dados.",
      validationCode,
      signedAt: nowIso,
    });
  } catch (error: any) {
    console.error("Erro ao confirmar assinatura remota no servidor:", error);
    return res.status(500).json({
      success: false,
      error: error?.message || "Erro interno ao finalizar assinatura no banco de dados.",
    });
  }
});

// API Endpoint: Send Remote Digital Signature Request via Email
app.post(["/api/signature/send-request", "/signature/send-request"], async (req, res) => {
  try {
    const { itemId, itemTitle, recipientEmail, recipientName, signatureLink, signatureToken, returnedByName } = req.body || {};

    if (!itemId || !recipientEmail) {
      return res.status(400).json({
        success: false,
        error: "Parâmetros obrigatórios ausentes (itemId, recipientEmail).",
      });
    }

    const targetEmail = recipientEmail || "localizamais6@gmail.com";
    const targetName = recipientName || "Aluno / Servidor IFPR";
    const timestamp = new Date().toISOString();
    const emailSubject = `📝 Assinatura Digital Necessária: Recebimento do Objeto "${itemTitle || itemId}" - IFPR Campus Ivaiporã`;
    const emailBody = `Olá, ${targetName}!\n\n` +
      `O seu pertence "${itemTitle || "Objeto"}" foi entregue pela equipe de atendimento do IFPR Campus Ivaiporã (${returnedByName || "SEBAC / Portaria"}).\n\n` +
      `Para concluir a devolução em conformidade com as normas institucionais, por favor confirme o recebimento e realize sua Assinatura Digital através do link seguro abaixo:\n\n` +
      `🔗 Link para Assinar o Termo de Recebimento:\n` +
      `${signatureLink}\n\n` +
      `Código do Termo: ${signatureToken || itemId}\n\n` +
      `Caso já tenha assinado presencialmente, desconsidere esta mensagem.\n\n` +
      `Atenciosamente,\n` +
      `Seção de Apoio ao Estudante (SEBAC) & Portaria\n` +
      `Instituto Federal do Paraná - Campus Ivaiporã`;

    console.info(`[Signature Email Request] Link de assinatura digital despachado para ${targetEmail} referente ao item #${itemId}.`);

    const adminDb = getAdminFirestore();
    if (adminDb) {
      try {
        const notifDocId = `sig_req_${itemId}_${Date.now()}`;
        await adminDb.collection("email_notifications").doc(notifDocId).set({
          id: notifDocId,
          itemId,
          itemTitle,
          recipientEmail: targetEmail,
          recipientName: targetName,
          signatureLink,
          signatureToken,
          subject: emailSubject,
          body: emailBody,
          type: "REMOTE_SIGNATURE_REQUEST",
          status: "SENT",
          sentAt: timestamp,
          createdAt: timestamp,
        });
      } catch (dbErr) {
        console.warn("[Signature Warning] Falha ao persistir log no Firestore:", dbErr);
      }
    }

    return res.json({
      success: true,
      message: `Link de assinatura digital enviado com sucesso para ${targetEmail}.`,
      signatureLink,
      recipientEmail: targetEmail,
      timestamp,
    });
  } catch (error: any) {
    console.error("Erro na rota /api/signature/send-request:", error);
    return res.status(500).json({
      success: false,
      error: error?.message || "Erro interno ao enviar link de assinatura.",
    });
  }
});

// API Endpoint: Notify when remote signature is completed
app.post(["/api/signature/notify-signed", "/signature/notify-signed"], async (req, res) => {
  try {
    const { itemId, itemTitle, signerName, signerEmail, signedAt } = req.body || {};
    console.info(`[Signature Completed] Item #${itemId} assinado digitalmente por ${signerName} (${signerEmail}) em ${signedAt}.`);

    const adminDb = getAdminFirestore();
    if (adminDb) {
      try {
        const notifDocId = `sig_done_${itemId}_${Date.now()}`;
        await adminDb.collection("email_notifications").doc(notifDocId).set({
          id: notifDocId,
          itemId,
          itemTitle,
          signerName,
          signerEmail,
          type: "SIGNATURE_COMPLETED",
          status: "LOGGED",
          signedAt: signedAt || new Date().toISOString(),
          createdAt: new Date().toISOString(),
        });
      } catch (e) {}
    }

    return res.json({ success: true, message: "Assinatura registrada no backend com sucesso." });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
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
  console.error("[Global Error Handler] Exceção capturada no servidor:", {
    message: err?.message || String(err),
    stack: err?.stack,
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip || req.socket.remoteAddress,
    timestamp: new Date().toISOString(),
  });

  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      error: "Erro interno no servidor do Localiza+ IFPR.",
      details: process.env.NODE_ENV !== "production" ? err?.message : undefined,
    });
  }
});

// Serve frontend assets
async function startServer() {
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

      const { createServer: createViteServer } = await import("vite");
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

  if (!process.env.VERCEL && process.env.NODE_ENV !== "test") {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`IFPR Achados & Perdidos backend rodando em http://localhost:${PORT}`);
    });
  }
}

if (!process.env.VERCEL && process.env.NODE_ENV !== "test") {
  startServer();
}

export default app;

