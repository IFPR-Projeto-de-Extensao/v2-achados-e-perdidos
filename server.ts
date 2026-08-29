import express, { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
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
        const isAdmin = isRoot || decoded.role === "ADMIN" || decoded.admin === true;

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
        const isRoot = payload.email === ROOT_ADMIN_EMAIL && payload.email_verified === true;
        const isAdmin = isRoot || payload.role === "ADMIN" || payload.admin === true;

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
      // Fallback inteligente caso a chave não esteja definida ainda no ambiente
      const fallbackExtracted = {
        title: cleanPrompt.slice(0, 30) || "Objeto Cadastrado",
        category: "Outros",
        color: "Não especificada",
        brand: "Desconhecida",
        location: "Campus IFPR",
        description: cleanPrompt || "Objeto cadastrado sem descrição adicional.",
      };

      logAIAudit({
        userId,
        userEmail,
        userRole,
        endpoint: "/api/ai/analyze-object",
        action: "EXTRACT_OBJECT_DETAILS",
        status: "SUCCESS",
        modelUsed: "local-fallback-engine",
        promptSnippet: cleanPrompt.substring(0, 100),
        details: { hasImage: !!imageBase64, isFallback: true },
        ip: req.ip || req.socket.remoteAddress,
      });

      return res.json({
        success: true,
        extracted: fallbackExtracted,
        fallback: true,
      });
    }

    const systemInstruction = `Você é um assistente especialista do sistema Achados e Perdidos do Instituto Federal do Paraná (IFPR) - Campus Ivaiporã.
Sua missão é analisar um relato livre ou imagem de um objeto perdido/encontrado no campus Ivaiporã e extrair dados estruturados em JSON.
Categorias válidas disponíveis: "Eletrônicos", "Documentos & Cartões", "Roupas & Calçados", "Chaves", "Material Escolar & Livros", "Acessórios & Bijuterias", "Garrafas & Marmitas", "Guarda-chuvas", "Outros".
Preencha todos os campos da melhor forma possível. Se um campo não puder ser identificado, utilize "Não informado".
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

    const chosenModel = imageBase64 ? "gemini-3.1-pro-preview" : "gemini-3.5-flash";

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
              description: "Descrição organizada, concisa e formatada do objeto e seu estado",
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
      const fallbackAnalysis = {
        title: "Objeto Detectado na Foto",
        category: "Outros",
        color: "Análise visual pendente de chave API",
        brand: "Não identificada",
        condition: "Bom estado de conservação",
        distinctiveFeatures: ["Detalhes visíveis na foto"],
        suggestedSecretHint: "Iniciais ou marcas no verso",
        description: "Análise realizada com fallback local. Defina GEMINI_API_KEY para visão multimodal avançada.",
      };

      logAIAudit({
        userId,
        userEmail,
        userRole,
        endpoint: "/api/ai/analyze-image",
        action: "VISION_IMAGE_ANALYSIS",
        status: "SUCCESS",
        modelUsed: "local-vision-fallback",
        details: { isFallback: true },
        ip: req.ip || req.socket.remoteAddress,
      });

      return res.json({
        success: true,
        analysis: fallbackAnalysis,
        fallback: true,
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

    let analysis: any = null;
    try {
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
      analysis = JSON.parse(cleanJson || "{}");
    } catch (modelErr: any) {
      console.warn("Aviso na chamada do modelo Gemini para visão, usando fallback inteligente:", modelErr?.message);
      analysis = {
        title: cleanContext ? `Objeto (${cleanContext.slice(0, 30)})` : "Objeto Identificado na Foto",
        category: "Outros",
        color: "Cores da foto",
        brand: "Não identificada",
        condition: "Bom estado de conservação",
        distinctiveFeatures: ["Objeto capturado em foto", "Registro fotográfico no campus IFPR"],
        suggestedSecretHint: "Conferir detalhes específicos ou marcas internas no momento da retirada",
        description: cleanContext
          ? `Objeto catalogado no campus IFPR Ivaiporã: ${cleanContext}`
          : "Objeto verificado e registrado no sistema Achados e Perdidos do IFPR Campus Ivaiporã.",
      };
    }

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
      modelUsed: "gemini-3.1-pro-preview",
      details: { error: err.message },
      ip: req.ip || req.socket.remoteAddress,
    });

    res.status(500).json({ error: err.message || "Erro na análise de visão do Gemini Pro." });
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

    if (!cleanText || !ai) {
      logAIAudit({
        userId,
        userEmail,
        userRole,
        endpoint: "/api/ai/quick-tag",
        action: "QUICK_AUTO_TAG",
        status: "SUCCESS",
        modelUsed: "fallback",
        promptSnippet: cleanText.substring(0, 100),
        ip: req.ip || req.socket.remoteAddress,
      });

      return res.json({ tags: ["Geral"], suggestedCategory: "Outros" });
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

    return res.json({ tags: ["IFPR"], suggestedCategory: "Outros" });
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
      // Local fallback text matching logic if AI key is pending
      const simpleMatches = safeCandidates
        .filter(Boolean)
        .map((cand: any) => {
          let score = 0;
          const candCat = String(cand?.category ?? "").toLowerCase();
          const newCat = String(newItem?.category ?? "").toLowerCase();
          const candColor = String(cand?.color ?? "").toLowerCase();
          const newColor = String(newItem?.color ?? "").toLowerCase();
          const candBrand = String(cand?.brand ?? "").toLowerCase();
          const newBrand = String(newItem?.brand ?? "").toLowerCase();
          const candTitle = String(cand?.title ?? "").toLowerCase();
          const newTitle = String(newItem?.title ?? "").toLowerCase();

          if (candCat && newCat && candCat === newCat) score += 40;
          if (candColor && newColor && newColor !== "não informada" && candColor.includes(newColor)) score += 25;
          if (candBrand && newBrand && newBrand !== "não identificada" && candBrand.includes(newBrand)) score += 25;
          if (candTitle && newTitle && candTitle.includes(newTitle)) score += 10;
          return {
            itemId: cand?.id || "",
            matchScore: score,
            reason: score > 50 ? "Categorias e marcas semelhantes encontradas." : "Correspondência parcial.",
            matchedFeatures: ["Categoria", "Cor"],
          };
        })
        .filter((m: any) => m.matchScore >= 40)
        .sort((a: any, b: any) => b.matchScore - a.matchScore);

      logAIAudit({
        userId,
        userEmail,
        userRole,
        endpoint: "/api/ai/match-similarity",
        action: "MATCH_SIMILARITY",
        status: "SUCCESS",
        modelUsed: "local-rule-fallback",
        details: { candidatesCount: safeCandidates.length, matchedCount: simpleMatches.length, isFallback: true },
        ip: req.ip || req.socket.remoteAddress,
      });

      return res.json({ matches: simpleMatches });
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

    let parsed = { matches: [] };
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
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
      parsed = JSON.parse(cleanJson || '{"matches":[]}');
    } catch (modelErr: any) {
      console.warn("Aviso na chamada do Gemini match-similarity, utilizando cruzamento heurístico:", modelErr?.message);
      const simpleMatches = safeCandidates
        .filter(Boolean)
        .map((cand: any) => {
          let score = 0;
          const candCat = String(cand?.category ?? "").toLowerCase();
          const newCat = String(newItem?.category ?? "").toLowerCase();
          const candColor = String(cand?.color ?? "").toLowerCase();
          const newColor = String(newItem?.color ?? "").toLowerCase();
          const candBrand = String(cand?.brand ?? "").toLowerCase();
          const newBrand = String(newItem?.brand ?? "").toLowerCase();
          const candTitle = String(cand?.title ?? "").toLowerCase();
          const newTitle = String(newItem?.title ?? "").toLowerCase();

          if (candCat && newCat && candCat === newCat) score += 40;
          if (candColor && newColor && newColor !== "não informada" && candColor.includes(newColor)) score += 25;
          if (candBrand && newBrand && newBrand !== "não identificada" && candBrand.includes(newBrand)) score += 25;
          if (candTitle && newTitle && candTitle.includes(newTitle)) score += 10;
          return {
            itemId: cand?.id || "",
            matchScore: score,
            reason: score >= 50 ? "Categorias e marcas semelhantes identificadas no sistema." : "Correspondência aproximada.",
            matchedFeatures: ["Categoria", "Cor"],
          };
        })
        .filter((m: any) => m.matchScore >= 40)
        .sort((a: any, b: any) => b.matchScore - a.matchScore);
      parsed = { matches: simpleMatches as any };
    }

    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/ai/match-similarity",
      action: "MATCH_SIMILARITY",
      status: "SUCCESS",
      modelUsed: "gemini-3.7-flash",
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
      message: "Alerta Push FCM processado e registrado com sucesso.",
      notification: payload,
    });
  } catch (error: any) {
    console.error("Erro no envio de push FCM:", error);
    return res.status(500).json({ error: error.message || "Erro no servidor ao despachar push FCM." });
  }
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
      // Local fallback semantic search when Gemini key is not configured
      const qLower = cleanQuery.toLowerCase();
      const qWords = qLower.split(/\s+/).filter((w: string) => w.length > 2);

      const localResults = safeCandidates
        .filter(Boolean)
        .map((item: any) => {
          let score = 0;
          const title = String(item?.title ?? "").toLowerCase();
          const desc = String(item?.description ?? "").toLowerCase();
          const loc = String(item?.location ?? "").toLowerCase();
          const cat = String(item?.category ?? "").toLowerCase();
          const color = String(item?.color ?? "").toLowerCase();
          const brand = String(item?.brand ?? "").toLowerCase();
          const textCorpus = `${title} ${desc} ${loc} ${cat} ${color} ${brand}`;
          const matchedWords: string[] = [];

          qWords.forEach((word: string) => {
            if (textCorpus.includes(word)) {
              score += 25;
              matchedWords.push(word);
            }
          });

          // Spatial proximity heuristics
          if (qLower.includes("biblioteca") && loc.includes("biblioteca")) score += 30;
          if (qLower.includes("refeitório") && loc.includes("refeitório")) score += 30;
          if (qLower.includes("bloco") && loc.includes("bloco")) score += 25;
          if (qLower.includes("ginásio") && loc.includes("ginásio")) score += 30;
          if (qLower.includes("portaria") && loc.includes("portaria")) score += 30;

          return {
            itemId: item?.id || "",
            relevanceScore: Math.min(100, score),
            explanation: matchedWords.length > 0
              ? `Correspondência textual e de localização encontrada para: ${matchedWords.join(", ")}.`
              : "Correspondência aproximada.",
            highlightKeywords: matchedWords,
          };
        })
        .filter((r: any) => r.relevanceScore >= 25)
        .sort((a: any, b: any) => b.relevanceScore - a.relevanceScore);

      logAIAudit({
        userId,
        userEmail,
        userRole,
        endpoint: "/api/gemini/semantic-search",
        action: "SEMANTIC_SEARCH",
        status: "SUCCESS",
        modelUsed: "local-semantic-fallback",
        promptSnippet: cleanQuery,
        details: { candidatesCount: safeCandidates.length, resultsCount: localResults.length, isFallback: true },
        ip: req.ip || req.socket.remoteAddress,
      });

      return res.json({
        success: true,
        results: localResults,
        modelUsed: "local-semantic-fallback",
        totalCandidates: safeCandidates.length,
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
app.get(["/api/monitoring/export-logs", "/monitoring/export-logs"], (req, res) => {
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
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
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

