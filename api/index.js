// server.ts
import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// firebase-applet-config.json
var firebase_applet_config_default = {
  projectId: "gen-lang-client-0490390966",
  appId: "1:965991369560:web:e3a8c1506c5ffbd81e732d",
  apiKey: "AIzaSyCWdYzD9jmM0vSDTAHXLuxFQB4hNxRY6-8",
  authDomain: "gen-lang-client-0490390966.firebaseapp.com",
  storageBucket: "gen-lang-client-0490390966.firebasestorage.app",
  messagingSenderId: "965991369560",
  measurementId: "G-Q2BWFJTJ8K",
  oAuthClientId: "965991369560-lhbj4jbhjjet9knkc0cjsbvlvbnd1vi8.apps.googleusercontent.com",
  recaptchaSiteKey: "",
  firestoreDatabaseId: "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1"
};

// server.ts
dotenv.config();
var app = express();
var PORT = 3e3;
var FIREBASE_PROJECT_ID = firebase_applet_config_default.projectId || "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1";
var ROOT_ADMIN_EMAIL = "paulocauan39@gmail.com";
if (!getApps().length) {
  try {
    initializeApp({
      projectId: FIREBASE_PROJECT_ID
    });
    console.log("[Firebase Admin] Inicializado com sucesso para o projeto:", FIREBASE_PROJECT_ID);
  } catch (adminInitErr) {
    console.warn("[Firebase Admin] Inicializa\xE7\xE3o sem credenciais completas:", adminInitErr);
  }
}
app.use(express.json({ limit: "10mb" }));
var rateLimitStore = /* @__PURE__ */ new Map();
function createRateLimiter(maxRequests, windowMs, label) {
  return (req, res, next) => {
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
        error: `Limite de requisi\xE7\xF5es excedido para ${label}. Aguarde ${Math.ceil((current.resetTime - now) / 1e3)}s antes de tentar novamente.`
      });
    }
    current.count++;
    return next();
  };
}
var aiRateLimiter = createRateLimiter(20, 60 * 1e3, "IA");
var generalRateLimiter = createRateLimiter(120, 60 * 1e3, "API");
var rateLimitCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitStore.entries()) {
    if (now > val.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1e3);
if (typeof rateLimitCleanupInterval?.unref === "function") {
  rateLimitCleanupInterval.unref();
}
function parseJwtPayload(token) {
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
async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }
  const token = authHeader.split(" ")[1];
  if (!token) return next();
  try {
    if (getApps().length) {
      try {
        const decoded = await getAuth().verifyIdToken(token);
        const isRoot = decoded.email === ROOT_ADMIN_EMAIL && decoded.email_verified === true;
        const isAdmin = isRoot || decoded.role === "ADMIN" || decoded.admin === true;
        req.authUser = {
          uid: decoded.uid,
          email: decoded.email,
          email_verified: decoded.email_verified,
          role: isAdmin ? "ADMIN" : decoded.role || "ALUNO",
          isAdmin
        };
        return next();
      } catch (_adminErr) {
      }
    }
    const payload = parseJwtPayload(token);
    if (payload) {
      const nowInSec = Math.floor(Date.now() / 1e3);
      const isValidIss = payload.iss === `https://securetoken.google.com/${FIREBASE_PROJECT_ID}` || payload.iss && payload.iss.includes("securetoken.google.com");
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
          isAdmin
        };
      }
    }
  } catch (authErr) {
    console.warn("[Auth Middleware Warning]:", authErr);
  }
  next();
}
function requireAuth(req, res, next) {
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
        headersSent: Object.keys(req.headers)
      },
      ip: req.ip || req.socket.remoteAddress
    });
    console.warn(`[Security Alert] Tentativa de acesso n\xE3o autenticado a recurso de IA rejeitada com 401. Audit ID: ${unauthAudit.id}`);
    return res.status(401).json({
      success: false,
      error: "Autentica\xE7\xE3o obrigat\xF3ria. Fa\xE7a login com sua conta institucional para utilizar os recursos de intelig\xEAncia artificial.",
      auditId: unauthAudit.id
    });
  }
  next();
}
function requireAdmin(req, res, next) {
  if (!req.authUser || !req.authUser.isAdmin) {
    return res.status(403).json({
      success: false,
      error: "Acesso negado. Apenas administradores autorizados do IFPR podem executar esta opera\xE7\xE3o."
    });
  }
  next();
}
var aiAuditLogs = [];
function logAIAudit(entry) {
  const record = {
    id: `audit_ai_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    ...entry
  };
  aiAuditLogs.unshift(record);
  if (aiAuditLogs.length > 1e3) {
    aiAuditLogs.pop();
  }
  const counterKey = `ai_audit:${entry.action}:${entry.status}`;
  eventCounters[counterKey] = (eventCounters[counterKey] || 0) + 1;
  console.log(`[AI AUDIT LOG] [${record.status}] UID: ${record.userId} (${record.userEmail || "none"}) | Endpoint: ${record.endpoint} | Action: ${record.action} | Model: ${record.modelUsed || "none"}`);
  return record;
}
app.use(authenticateToken);
app.use(generalRateLimiter);
var aiClient = null;
function getGenAIClient() {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    try {
      aiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });
    } catch (err) {
      console.error("Erro ao inicializar GoogleGenAI:", err);
    }
  }
  return aiClient;
}
var serverStartTime = Date.now();
var totalServerRequests = 0;
var analyticsEvents = [];
var eventCounters = {};
var DEFAULT_SYSTEM_CONFIG = {
  maintenanceMode: false,
  maintenanceCustomMessage: "\u26A0\uFE0F ATEN\xC7\xC3O: O SISTEMA EST\xC1 EM MODO DE MANUTEN\xC7\xC3O / ATUALIZA\xC7\xC3O PROGRAMADA NO CAMPUS IVAIPOR\xC3",
  lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
  updatedBy: "SYSTEM"
};
var globalSystemConfig = { ...DEFAULT_SYSTEM_CONFIG };
function getValidatedSystemConfig() {
  if (!globalSystemConfig || typeof globalSystemConfig !== "object") {
    console.warn("[System Config Warning] globalSystemConfig inv\xE1lido. Restaurando estado padr\xE3o.");
    globalSystemConfig = { ...DEFAULT_SYSTEM_CONFIG, lastUpdated: (/* @__PURE__ */ new Date()).toISOString() };
  }
  return {
    maintenanceMode: Boolean(globalSystemConfig.maintenanceMode),
    maintenanceCustomMessage: typeof globalSystemConfig.maintenanceCustomMessage === "string" && globalSystemConfig.maintenanceCustomMessage.trim() ? globalSystemConfig.maintenanceCustomMessage.trim() : DEFAULT_SYSTEM_CONFIG.maintenanceCustomMessage,
    lastUpdated: globalSystemConfig.lastUpdated || (/* @__PURE__ */ new Date()).toISOString(),
    updatedBy: globalSystemConfig.updatedBy || "SYSTEM"
  };
}
app.use((_req, _res, next) => {
  totalServerRequests++;
  next();
});
app.get("/api/system/config", (req, res) => {
  try {
    const config = getValidatedSystemConfig();
    return res.status(200).json({
      success: true,
      config,
      environment: {
        isVercel: Boolean(process.env.VERCEL),
        nodeEnv: process.env.NODE_ENV || "development",
        serverTimestamp: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
  } catch (err) {
    console.error("[System Config Error] Falha ao ler configura\xE7\xE3o do sistema:", {
      message: err?.message || String(err),
      stack: err?.stack,
      ip: req.ip || req.socket.remoteAddress,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    return res.status(200).json({
      success: true,
      config: { ...DEFAULT_SYSTEM_CONFIG, lastUpdated: (/* @__PURE__ */ new Date()).toISOString() },
      warning: "Configura\xE7\xE3o recuperada via fallback de seguran\xE7a."
    });
  }
});
app.post("/api/system/config", requireAdmin, (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      console.warn("[System Config POST Warning] Corpo da requisi\xE7\xE3o ausente ou inv\xE1lido:", {
        body: req.body,
        user: req.authUser?.email || req.authUser?.uid,
        ip: req.ip
      });
      return res.status(400).json({
        success: false,
        error: "Corpo da requisi\xE7\xE3o inv\xE1lido. Envie um objeto JSON v\xE1lido."
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
    current.lastUpdated = (/* @__PURE__ */ new Date()).toISOString();
    current.updatedBy = req.authUser?.email || req.authUser?.uid || "ADMIN_SESSION";
    globalSystemConfig = current;
    console.log(
      `[System Config Updated] Modo Manuten\xE7\xE3o: ${globalSystemConfig.maintenanceMode} por ${globalSystemConfig.updatedBy} \xE0s ${globalSystemConfig.lastUpdated}`
    );
    return res.status(200).json({ success: true, config: globalSystemConfig });
  } catch (err) {
    console.error("[System Config POST Error] Falha ao atualizar configura\xE7\xE3o do sistema:", {
      message: err?.message || String(err),
      stack: err?.stack,
      user: req.authUser?.email || req.authUser?.uid,
      ip: req.ip,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    return res.status(500).json({
      success: false,
      error: "Erro ao atualizar configura\xE7\xE3o do sistema.",
      details: process.env.NODE_ENV !== "production" ? err?.message : void 0
    });
  }
});
app.post("/api/admin/master-wipe", requireAuth, requireAdmin, async (req, res) => {
  const adminUid = req.authUser.uid;
  const adminEmail = req.authUser.email || "root_admin";
  const { reauthConfirmed, confirmationWord } = req.body || {};
  if (!reauthConfirmed || confirmationWord !== "DELETAR_TUDO_DEFINITIVAMENTE") {
    return res.status(400).json({
      success: false,
      error: "Confirma\xE7\xE3o de seguran\xE7a de dois fatores e palavra de confirma\xE7\xE3o obrigat\xF3rias."
    });
  }
  console.log(`[MASTER WIPE INICIADO] Solicitado por Admin: ${adminUid} (${adminEmail}) \xE0s ${(/* @__PURE__ */ new Date()).toISOString()}`);
  try {
    const deletedCounts = { items: 0, claims: 0, comments: 0, notifications: 0 };
    if (getApps().length) {
      const firestore = getFirestore();
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
      await firestore.collection("activity_logs").add({
        action: "MASTER_WIPE",
        performedBy: adminUid,
        performedByEmail: adminEmail,
        performedByName: "Administrador TI",
        role: "ADMIN",
        details: `Master Wipe executado com sucesso no servidor pelo Admin ${adminEmail}. Cole\xE7\xF5es exclu\xEDdas: ${JSON.stringify(deletedCounts)}`,
        status: "SUCCESS",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        ip: req.ip || req.socket.remoteAddress
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
      ip: req.ip || req.socket.remoteAddress
    });
    return res.status(200).json({
      success: true,
      message: "Limpeza geral do sistema conclu\xEDda com sucesso.",
      deletedCounts,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (wipeErr) {
    console.error("[MASTER WIPE ERROR]:", wipeErr);
    return res.status(500).json({
      success: false,
      error: "Falha ao executar limpeza no servidor: " + (wipeErr?.message || String(wipeErr))
    });
  }
});
app.get("/api/health", (_req, res) => {
  try {
    const memUsage = process.memoryUsage ? Math.round(process.memoryUsage().heapUsed / 1024 / 1024) : 0;
    const uptimeSec = Math.floor((Date.now() - serverStartTime) / 1e3);
    res.status(200).json({
      status: "ok",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      uptimeSeconds: uptimeSec >= 0 ? uptimeSec : 0,
      geminiAvailable: !!process.env.GEMINI_API_KEY,
      memoryUsageMB: memUsage,
      isVercel: Boolean(process.env.VERCEL)
    });
  } catch (err) {
    res.status(200).json({
      status: "ok",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      uptimeSeconds: 0,
      geminiAvailable: !!process.env.GEMINI_API_KEY,
      memoryUsageMB: 0
    });
  }
});
app.post("/api/analytics/track", (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      console.warn("[Analytics Track Warning] Payload inv\xE1lido recebido em /api/analytics/track", {
        body: req.body,
        ip: req.ip
      });
      return res.status(400).json({ success: false, error: "Payload JSON inv\xE1lido." });
    }
    const { eventName, params, timestamp, url } = req.body;
    if (!eventName || typeof eventName !== "string" || eventName.trim().length === 0 || eventName.length > 100) {
      console.warn("[Analytics Track Warning] Nome do evento inv\xE1lido ou ausente:", {
        eventName,
        ip: req.ip
      });
      return res.status(400).json({ success: false, error: "Nome do evento ('eventName') inv\xE1lido ou ausente." });
    }
    const sanitizedEventName = eventName.trim().replace(/[^a-zA-Z0-9_-]/g, "");
    if (!sanitizedEventName) {
      return res.status(400).json({ success: false, error: "Nome do evento cont\xE9m apenas caracteres inv\xE1lidos." });
    }
    const safeParams = params && typeof params === "object" && !Array.isArray(params) ? params : {};
    const safeTimestamp = timestamp && typeof timestamp === "string" && !isNaN(Date.parse(timestamp)) ? timestamp : (/* @__PURE__ */ new Date()).toISOString();
    const safeUrl = typeof url === "string" ? url.substring(0, 300) : "";
    const eventRecord = {
      eventName: sanitizedEventName,
      params: safeParams,
      timestamp: safeTimestamp,
      url: safeUrl,
      ip: req.ip || req.socket.remoteAddress || "unknown",
      userId: req.authUser?.uid || "ANONYMOUS",
      userEmail: req.authUser?.email
    };
    analyticsEvents.unshift(eventRecord);
    if (analyticsEvents.length > 500) {
      analyticsEvents.pop();
    }
    eventCounters[sanitizedEventName] = (eventCounters[sanitizedEventName] || 0) + 1;
    return res.status(200).json({ success: true, logged: eventRecord });
  } catch (err) {
    console.error("[Analytics Track Error] Falha ao processar telemetria:", {
      message: err?.message || String(err),
      stack: err?.stack,
      ip: req.ip,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    return res.status(500).json({
      success: false,
      error: "Erro interno ao processar telemetria de anal\xEDticos.",
      details: process.env.NODE_ENV !== "production" ? err?.message : void 0
    });
  }
});
app.get("/api/analytics/metrics", (req, res) => {
  try {
    const memoryHeap = process.memoryUsage ? Math.round(process.memoryUsage().heapUsed / 1024 / 1024) : 0;
    const uptimeSec = Math.floor((Date.now() - (serverStartTime || Date.now())) / 1e3);
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
      serverTimestamp: (/* @__PURE__ */ new Date()).toISOString(),
      environment: {
        isVercel: Boolean(process.env.VERCEL),
        nodeVersion: process.version
      }
    };
    return res.status(200).json(metricsData);
  } catch (err) {
    console.error("[Analytics Metrics Error] Falha ao compilar m\xE9tricas do sistema:", {
      message: err?.message || String(err),
      stack: err?.stack,
      ip: req.ip,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    return res.status(500).json({
      success: false,
      error: "Erro ao gerar m\xE9tricas do sistema.",
      details: process.env.NODE_ENV !== "production" ? err?.message : void 0
    });
  }
});
app.post("/api/ai/analyze-object", requireAuth, aiRateLimiter, async (req, res) => {
  const userId = req.authUser.uid;
  const userEmail = req.authUser?.email;
  const userRole = req.authUser?.role;
  try {
    const { promptText, imageBase64 } = req.body;
    const cleanPrompt = typeof promptText === "string" ? promptText.substring(0, 1e4) : "";
    const ai = getGenAIClient();
    if (!ai) {
      const fallbackExtracted = {
        title: cleanPrompt.slice(0, 30) || "Objeto Cadastrado",
        category: "Outros",
        color: "N\xE3o especificada",
        brand: "Desconhecida",
        location: "Campus IFPR",
        description: cleanPrompt || "Objeto cadastrado sem descri\xE7\xE3o adicional."
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
        ip: req.ip || req.socket.remoteAddress
      });
      return res.json({
        success: true,
        extracted: fallbackExtracted,
        fallback: true
      });
    }
    const systemInstruction = `Voc\xEA \xE9 um assistente especialista do sistema Achados e Perdidos do Instituto Federal do Paran\xE1 (IFPR) - Campus Ivaipor\xE3.
Sua miss\xE3o \xE9 analisar um relato livre ou imagem de um objeto perdido/encontrado no campus Ivaipor\xE3 e extrair dados estruturados em JSON.
Categorias v\xE1lidas dispon\xEDveis: "Eletr\xF4nicos", "Documentos & Cart\xF5es", "Roupas & Cal\xE7ados", "Chaves", "Material Escolar & Livros", "Acess\xF3rios & Bijuterias", "Garrafas & Marmitas", "Guarda-chuvas", "Outros".
Preencha todos os campos da melhor forma poss\xEDvel. Se um campo n\xE3o puder ser identificado, utilize "N\xE3o informado".
A resposta DEVE ser estritamente no formato JSON definido no schema.`;
    const contents = [];
    if (imageBase64 && typeof imageBase64 === "string" && imageBase64.length < 8e6) {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      contents.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: cleanBase64
        }
      });
    }
    contents.push({
      text: cleanPrompt ? `Analise este relato/objeto no IFPR: "${cleanPrompt}"` : "Analise esta foto de objeto encontrado/perdido no IFPR e descreva com precis\xE3o."
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
              description: "T\xEDtulo curto e claro para o objeto (ex: Garrafa Kouda Verde 750ml)"
            },
            category: {
              type: Type.STRING,
              description: "Categoria mais apropriada dentre as op\xE7\xF5es v\xE1lidas"
            },
            color: {
              type: Type.STRING,
              description: "Cor principal ou combina\xE7\xE3o de cores do objeto"
            },
            brand: {
              type: Type.STRING,
              description: "Marca ou fabricante (ex: Casio, Nike, JBL, Tupperware, IFPR)"
            },
            location: {
              type: Type.STRING,
              description: "Local mencionado no campus (ex: Refeit\xF3rio, Biblioteca, Bloco A, Quadra)"
            },
            description: {
              type: Type.STRING,
              description: "Descri\xE7\xE3o organizada, concisa e formatada do objeto e seu estado"
            }
          },
          required: ["title", "category", "color", "brand", "location", "description"]
        }
      }
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
        extractedCategory: extractedData?.category
      },
      ip: req.ip || req.socket.remoteAddress
    });
    return res.json({
      success: true,
      extracted: extractedData
    });
  } catch (error) {
    console.error("Erro na rota /api/ai/analyze-object:", error);
    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/ai/analyze-object",
      action: "EXTRACT_OBJECT_DETAILS",
      status: "FAILED",
      details: { error: error.message },
      ip: req.ip || req.socket.remoteAddress
    });
    res.status(500).json({
      success: false,
      error: error.message || "Erro interno ao processar intelig\xEAncia artificial."
    });
  }
});
app.post("/api/ai/analyze-image", requireAuth, aiRateLimiter, async (req, res) => {
  const userId = req.authUser.uid;
  const userEmail = req.authUser?.email;
  const userRole = req.authUser?.role;
  try {
    const { imageBase64, customContext } = req.body;
    const cleanContext = typeof customContext === "string" ? customContext.substring(0, 5e3) : "";
    const ai = getGenAIClient();
    if (!imageBase64 || typeof imageBase64 !== "string" || imageBase64.length > 8e6) {
      return res.status(400).json({ error: "Imagem em formato Base64 n\xE3o fornecida ou excede o tamanho limite permitido." });
    }
    if (!ai) {
      const fallbackAnalysis = {
        title: "Objeto Detectado na Foto",
        category: "Outros",
        color: "An\xE1lise visual pendente de chave API",
        brand: "N\xE3o identificada",
        condition: "Bom estado de conserva\xE7\xE3o",
        distinctiveFeatures: ["Detalhes vis\xEDveis na foto"],
        suggestedSecretHint: "Iniciais ou marcas no verso",
        description: "An\xE1lise realizada com fallback local. Defina GEMINI_API_KEY para vis\xE3o multimodal avan\xE7ada."
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
        ip: req.ip || req.socket.remoteAddress
      });
      return res.json({
        success: true,
        analysis: fallbackAnalysis,
        fallback: true
      });
    }
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const systemInstruction = `Voc\xEA \xE9 um motor de Intelig\xEAncia Artificial de Vis\xE3o Computacional de \xFAltima gera\xE7\xE3o alimentado pelo Gemini 3.1 Pro no IFPR Campus Ivaipor\xE3.
Sua tarefa \xE9 analisar minuciosamente uma imagem enviada pelo usu\xE1rio referente a um pertencente achado ou perdido no campus.
Examine atentamente:
1. Objeto principal, formato, utilidade e marca visualiz\xE1vel.
2. Cores predominantes e detalhes crom\xE1ticos.
3. Marcas de uso, adesivos, gravuras, danos, n\xFAmeros de s\xE9rie ou inscri\xE7\xF5es (\xFAtil como pista de verifica\xE7\xE3o).
4. Sugest\xE3o de Pergunta/Pista Secreta de seguran\xE7a para comprovar propriedade do objeto sem revelar aos impostores.
5. Categoria oficial ("Eletr\xF4nicos", "Documentos & Cart\xF5es", "Roupas & Cal\xE7ados", "Chaves", "Material Escolar & Livros", "Acess\xF3rios & Bijuterias", "Garrafas & Marmitas", "Guarda-chuvas", "Outros").
Retorne um JSON rigorosamente estruturado conforme o schema.`;
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: cleanBase64
            }
          },
          {
            text: cleanContext ? `Contexto adicional do usu\xE1rio: "${cleanContext}". Realize a an\xE1lise completa da imagem.` : "Analise esta fotografia de objeto com m\xE1xima precis\xE3o e descreva todos os aspectos para o cadastro no IFPR Ivaipor\xE3."
          }
        ]
      },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: "T\xEDtulo resumido e preciso do objeto (ex: Rel\xF3gio Digital Casio Vintage Prata)"
            },
            category: {
              type: Type.STRING,
              description: "Uma das categorias oficiais do IFPR"
            },
            color: {
              type: Type.STRING,
              description: "Cores detalhadas identificadas na foto"
            },
            brand: {
              type: Type.STRING,
              description: "Marca ou fabricante identificado na foto, ou 'N\xE3o identificada'"
            },
            condition: {
              type: Type.STRING,
              description: "Estado aparente de conserva\xE7\xE3o (ex: Novo, Usado com riscos leves, etc)"
            },
            distinctiveFeatures: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Lista de marca\xE7\xF5es, adesivos, riscos, chaveiros ou tra\xE7os \xFAnicos vis\xEDveis"
            },
            suggestedSecretHint: {
              type: Type.STRING,
              description: "Pista ou detalhe n\xE3o \xF3bvio para confirma\xE7\xE3o de propriedade (ex: adesivo colado no fundo)"
            },
            description: {
              type: Type.STRING,
              description: "Descri\xE7\xE3o visual rica e profissional pronta para o cadastro de achados e perdidos"
            }
          },
          required: [
            "title",
            "category",
            "color",
            "brand",
            "condition",
            "distinctiveFeatures",
            "suggestedSecretHint",
            "description"
          ]
        }
      }
    });
    const analysis = JSON.parse(response.text || "{}");
    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/ai/analyze-image",
      action: "VISION_IMAGE_ANALYSIS",
      status: "SUCCESS",
      modelUsed: "gemini-3.1-pro-preview",
      details: {
        detectedTitle: analysis?.title,
        detectedCategory: analysis?.category,
        brand: analysis?.brand
      },
      ip: req.ip || req.socket.remoteAddress
    });
    return res.json({
      success: true,
      analysis
    });
  } catch (err) {
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
      ip: req.ip || req.socket.remoteAddress
    });
    res.status(500).json({ error: err.message || "Erro na an\xE1lise de vis\xE3o do Gemini Pro." });
  }
});
app.post("/api/ai/quick-tag", requireAuth, aiRateLimiter, async (req, res) => {
  const userId = req.authUser.uid;
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
        ip: req.ip || req.socket.remoteAddress
      });
      return res.json({ tags: ["Geral"], suggestedCategory: "Outros" });
    }
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: `Gere 3 a 5 tags curtas e indique a categoria ideal para o texto: "${cleanText}". Categorias: Eletr\xF4nicos, Documentos & Cart\xF5es, Roupas & Cal\xE7ados, Chaves, Material Escolar & Livros, Acess\xF3rios & Bijuterias, Garrafas & Marmitas, Guarda-chuvas, Outros.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            suggestedCategory: { type: Type.STRING }
          },
          required: ["tags", "suggestedCategory"]
        }
      }
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
      ip: req.ip || req.socket.remoteAddress
    });
    return res.json(parsedResult);
  } catch (err) {
    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/ai/quick-tag",
      action: "QUICK_AUTO_TAG",
      status: "FAILED",
      details: { error: err.message },
      ip: req.ip || req.socket.remoteAddress
    });
    return res.json({ tags: ["IFPR"], suggestedCategory: "Outros" });
  }
});
app.post("/api/ai/match-similarity", requireAuth, aiRateLimiter, async (req, res) => {
  const userId = req.authUser.uid;
  const userEmail = req.authUser?.email;
  const userRole = req.authUser?.role;
  try {
    const { newItem, candidateItems } = req.body;
    if (!newItem || typeof newItem !== "object") {
      return res.status(400).json({ error: "Item de refer\xEAncia inv\xE1lido." });
    }
    const safeCandidates = Array.isArray(candidateItems) ? candidateItems.slice(0, 50) : [];
    const ai = getGenAIClient();
    if (safeCandidates.length === 0) {
      return res.json({ matches: [] });
    }
    if (!ai) {
      const simpleMatches = safeCandidates.filter(Boolean).map((cand) => {
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
        if (candColor && newColor && newColor !== "n\xE3o informada" && candColor.includes(newColor)) score += 25;
        if (candBrand && newBrand && newBrand !== "n\xE3o identificada" && candBrand.includes(newBrand)) score += 25;
        if (candTitle && newTitle && candTitle.includes(newTitle)) score += 10;
        return {
          itemId: cand?.id || "",
          matchScore: score,
          reason: score > 50 ? "Categorias e marcas semelhantes encontradas." : "Correspond\xEAncia parcial.",
          matchedFeatures: ["Categoria", "Cor"]
        };
      }).filter((m) => m.matchScore >= 40).sort((a, b) => b.matchScore - a.matchScore);
      logAIAudit({
        userId,
        userEmail,
        userRole,
        endpoint: "/api/ai/match-similarity",
        action: "MATCH_SIMILARITY",
        status: "SUCCESS",
        modelUsed: "local-rule-fallback",
        details: { candidatesCount: safeCandidates.length, matchedCount: simpleMatches.length, isFallback: true },
        ip: req.ip || req.socket.remoteAddress
      });
      return res.json({ matches: simpleMatches });
    }
    const prompt = `Voc\xEA \xE9 um algoritmo de correspond\xEAncia inteligente do Achados & Perdidos IFPR Campus Ivaipor\xE3.
Compare o novo objeto cadastrado:
- T\xEDtulo: ${String(newItem.title || "").substring(0, 100)}
- Tipo: ${newItem.type}
- Categoria: ${newItem.category}
- Cor: ${newItem.color}
- Marca: ${newItem.brand}
- Local: ${newItem.location}
- Descri\xE7\xE3o: ${String(newItem.description || "").substring(0, 500)}

E compare com esta lista de objetos pr\xE9-cadastrados:
${JSON.stringify(safeCandidates.map((c) => ({
      id: c.id,
      title: String(c.title || "").substring(0, 100),
      category: c.category,
      color: c.color,
      brand: c.brand,
      location: c.location,
      description: String(c.description || "").substring(0, 200)
    })), null, 2)}

Avalie a probabilidade de algum desses objetos pr\xE9-cadastrados ser O MESMO objeto ou a contraparte.
Calcule uma pontua\xE7\xE3o de similaridade de 0 a 100 para cada um. Retorne apenas os itens com pontua\xE7\xE3o >= 50.`;
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
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
                  reason: { type: Type.STRING, description: "Explica\xE7\xE3o em portugu\xEAs da semelhan\xE7a" },
                  matchedFeatures: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Lista de caracter\xEDsticas que bateram (ex: Categoria, Cor, Marca)"
                  }
                },
                required: ["itemId", "matchScore", "reason", "matchedFeatures"]
              }
            }
          },
          required: ["matches"]
        }
      }
    });
    const parsed = JSON.parse(response.text || '{"matches":[]}');
    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/ai/match-similarity",
      action: "MATCH_SIMILARITY",
      status: "SUCCESS",
      modelUsed: "gemini-3.5-flash",
      details: {
        referenceTitle: newItem.title,
        candidatesCount: safeCandidates.length,
        matchedCount: parsed.matches?.length || 0
      },
      ip: req.ip || req.socket.remoteAddress
    });
    return res.json(parsed);
  } catch (err) {
    console.error("Erro no endpoint /api/ai/match-similarity:", err);
    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/ai/match-similarity",
      action: "MATCH_SIMILARITY",
      status: "FAILED",
      details: { error: err.message },
      ip: req.ip || req.socket.remoteAddress
    });
    res.status(500).json({ error: err.message || "Erro no cruzamento de dados de IA." });
  }
});
app.post("/api/fcm/send-match-alert", requireAuth, generalRateLimiter, async (req, res) => {
  const userId = req.authUser.uid;
  const userEmail = req.authUser?.email;
  const userRole = req.authUser?.role;
  try {
    const { targetUserId, matchScore, newRegisteredItem, userLostItem, matchedFeatures } = req.body;
    if (!targetUserId || !newRegisteredItem || !userLostItem) {
      return res.status(400).json({ error: "Par\xE2metros incompletos para envio do alerta push FCM." });
    }
    const payload = {
      title: `\u{1F50D} Objeto Similar Encontrado (${matchScore || 85}%)`,
      body: `Um(a) "${newRegisteredItem.title}" com alta similaridade com seu relato "${userLostItem.title}" foi registrado no IFPR Campus Ivaipor\xE3 (${newRegisteredItem.location}).`,
      data: {
        url: `/?item=${newRegisteredItem.id}`,
        itemId: newRegisteredItem.id,
        matchScore: String(matchScore || 85)
      }
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
        matchedFeatures
      },
      ip: req.ip || req.socket.remoteAddress
    });
    return res.json({
      success: true,
      message: "Alerta Push FCM processado e registrado com sucesso.",
      notification: payload
    });
  } catch (error) {
    console.error("Erro no envio de push FCM:", error);
    return res.status(500).json({ error: error.message || "Erro no servidor ao despachar push FCM." });
  }
});
function getDiscordFeedbackWebhookUrl() {
  return (process.env.DISCORD_FEEDBACK_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || "").trim();
}
async function sendFeedbackToDiscord(ticket) {
  const webhookUrl = getDiscordFeedbackWebhookUrl();
  if (!webhookUrl) {
    console.info(
      "[Discord Feedback Notice] DISCORD_FEEDBACK_WEBHOOK_URL n\xE3o configurada no ambiente seguro do servidor. O feedback foi registrado e enviado por e-mail normalmente."
    );
    return false;
  }
  try {
    const categoryMap = {
      BUG_REPORT: { label: "Relato de Bug / Erro no Sistema", color: 15680580, emoji: "\u{1F41B}" },
      FEEDBACK: { label: "Sugest\xE3o ou Melhoria", color: 16096779, emoji: "\u{1F4A1}" },
      BELONGING_QUERY: { label: "D\xFAvida sobre Pertence / Retirada", color: 3900150, emoji: "\u{1F50D}" },
      OTHER: { label: "Elogio ou Outro Assunto", color: 1096065, emoji: "\u{1F4AC}" }
    };
    const cat = categoryMap[ticket.category] || {
      label: ticket.category || "Feedback Geral",
      color: 6514417,
      emoji: "\u{1F4DD}"
    };
    const priorityLabel = ticket.priority === "ALTA" ? "\u{1F534} Alta" : ticket.priority === "BAIXA" ? "\u{1F7E2} Baixa" : "\u{1F7E1} M\xE9dia";
    let dateFormatted = ticket.timestamp;
    try {
      dateFormatted = new Date(ticket.timestamp).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    } catch {
    }
    const fields = [
      { name: "\u{1F464} Usu\xE1rio", value: ticket.name || "N\xE3o informado", inline: true },
      { name: "\u{1F4E7} E-mail", value: ticket.email || "N\xE3o informado", inline: true },
      { name: "\u{1F3F7}\uFE0F Tipo de Feedback", value: `${cat.emoji} ${cat.label}`, inline: true },
      { name: "\u26A1 Prioridade", value: priorityLabel, inline: true },
      { name: "\u{1F4CB} Protocolo", value: `\`${ticket.protocol}\``, inline: true },
      { name: "\u{1F552} Data e Hora", value: dateFormatted, inline: true }
    ];
    if (ticket.clientDiagnostics && typeof ticket.clientDiagnostics === "object") {
      const diagParts = [
        ticket.clientDiagnostics.screen ? `\u{1F5A5}\uFE0F Tela: ${ticket.clientDiagnostics.screen}` : null,
        ticket.clientDiagnostics.currentPath ? `\u{1F4CD} Rota: \`${ticket.clientDiagnostics.currentPath}\`` : null,
        typeof ticket.clientDiagnostics.online === "boolean" ? `\u{1F4F6} Conex\xE3o: ${ticket.clientDiagnostics.online ? "Online" : "Offline"}` : null
      ].filter(Boolean);
      if (diagParts.length > 0) {
        fields.push({
          name: "\u{1F6E0}\uFE0F Diagn\xF3stico do Cliente",
          value: diagParts.join(" | ").substring(0, 1024),
          inline: false
        });
      }
    }
    const discordPayload = {
      username: "IFPR Achados e Perdidos - Feedback",
      avatar_url: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/life-buoy.png",
      embeds: [
        {
          title: `${cat.emoji} [${cat.label}] ${ticket.subject}`.substring(0, 256),
          description: ticket.message.substring(0, 4e3),
          color: cat.color,
          fields,
          footer: {
            text: "IFPR Campus Ivaipor\xE3 \u2022 Central de Atendimento & Feedback"
          },
          timestamp: ticket.timestamp
        }
      ]
    };
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(discordPayload)
    });
    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[Discord Feedback Warning] Resposta HTTP ${response.status} do Webhook:`, errText);
      return false;
    }
    console.log(`[Discord Feedback Success] Webhook despachado com sucesso para o protocolo ${ticket.protocol}.`);
    return true;
  } catch (webhookErr) {
    console.error("[Discord Feedback Error] Falha de conex\xE3o ao enviar para o Discord:", webhookErr?.message || webhookErr);
    return false;
  }
}
app.post("/api/support/send-feedback", generalRateLimiter, async (req, res) => {
  try {
    const { name, email, category, subject, message, priority, clientDiagnostics } = req.body;
    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        error: "Por favor, preencha todos os campos obrigat\xF3rios: nome, e-mail, assunto e descri\xE7\xE3o da mensagem."
      });
    }
    const ticketProtocol = `IFPR-SUP-${Date.now().toString(36).toUpperCase()}`;
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
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
      body: String(message).trim().substring(0, 4e3),
      priority: priority || "NORMAL",
      timestamp,
      clientDiagnostics: clientDiagnostics || {
        userAgent: req.headers["user-agent"] || "unknown",
        ip: req.ip || req.socket.remoteAddress || "unknown"
      }
    };
    console.log(`[Support Ticket Dispatched] Protocol: ${ticketProtocol} | From: ${emailPayload.senderEmail} | Category: ${emailPayload.category} | To: ${destinationEmail}`);
    sendFeedbackToDiscord({
      protocol: ticketProtocol,
      name: emailPayload.senderName,
      email: emailPayload.senderEmail,
      category: emailPayload.category,
      subject: String(subject).trim(),
      message: emailPayload.body,
      priority: String(priority || "MEDIA"),
      timestamp,
      clientDiagnostics
    }).catch((err) => {
      console.error("[Discord Webhook Background Error]:", err);
    });
    return res.json({
      success: true,
      protocol: ticketProtocol,
      message: "Seu relato/feedback foi registrado e encaminhado diretamente para a equipe de suporte do Campus Ivaipor\xE3 via e-mail.",
      timestamp,
      destinationEmail,
      emailSubject: emailPayload.subject
    });
  } catch (error) {
    console.error("Erro no envio do feedback de suporte:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Erro ao processar envio do formul\xE1rio de contato."
    });
  }
});
function parseDateSafeServer(dateInput) {
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
      }
    }
    const secs = typeof dateInput.seconds === "number" ? dateInput.seconds : dateInput._seconds;
    if (typeof secs === "number") {
      const d = new Date(secs * 1e3);
      if (!isNaN(d.getTime())) return d;
    }
  }
  if (typeof dateInput === "number") {
    const d = new Date(dateInput > 1e11 ? dateInput : dateInput * 1e3);
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
      const d2 = new Date(Date.UTC(year, month, day, 12, 0, 0));
      return isNaN(d2.getTime()) ? null : d2;
    }
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
function formatBrtDateServer(dateInput) {
  const parsed = parseDateSafeServer(dateInput);
  if (!parsed) return typeof dateInput === "string" && dateInput ? dateInput : "Data n\xE3o informada";
  try {
    return parsed.toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  } catch {
    return String(dateInput);
  }
}
function formatBrtDateTimeServer(dateInput) {
  const parsed = parseDateSafeServer(dateInput);
  if (!parsed) return typeof dateInput === "string" && dateInput ? dateInput : "Momento do registro";
  try {
    const datePart = parsed.toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
    const timePart = parsed.toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit"
    });
    return `${datePart} \xE0s ${timePart} (BRT)`;
  } catch {
    return String(dateInput);
  }
}
function getIsoDatabaseTimestampServer(createdAt, updatedAt) {
  const parsed = parseDateSafeServer(createdAt) || parseDateSafeServer(updatedAt);
  if (parsed) {
    return parsed.toISOString();
  }
  return (/* @__PURE__ */ new Date()).toISOString();
}
function getDiscordNovosAchadosWebhookUrl() {
  return (process.env.DISCORD_NOVOS_ACHADOS_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL_NOVOS_ACHADOS || process.env.DISCORD_ACHADOS_WEBHOOK_URL || process.env.DISCORD_ACHADOS_URL || process.env.DISCORD_WEBHOOK_ACHADOS || "").trim();
}
async function sendNovoAchadoToDiscord(item) {
  console.log("[NOVO_ACHADO_DISCORD] fun\xE7\xE3o chamada");
  const normalizedType = String(item?.type || "").toUpperCase().trim();
  if (normalizedType !== "ENCONTRADO" && normalizedType !== "ACHADO") {
    console.log(`[NOVO_ACHADO_DISCORD] Item do tipo "${item?.type}" ignorado para o canal #novos-achados.`);
    return false;
  }
  const webhookUrl = getDiscordNovosAchadosWebhookUrl();
  console.log(`[NOVO_ACHADO_DISCORD] webhook configurado: ${webhookUrl ? "SIM" : "N\xC3O"}`);
  if (!webhookUrl) {
    console.info(
      "[Discord Novos Achados Notice] DISCORD_NOVOS_ACHADOS_WEBHOOK_URL n\xE3o configurada no servidor. O cadastro do achado foi salvo normalmente."
    );
    return false;
  }
  try {
    const sanitizedTitle = String(item.title || "Objeto Encontrado").trim().substring(0, 200);
    const sanitizedDesc = String(item.description || "Nenhuma descri\xE7\xE3o fornecida.").trim().substring(0, 3900);
    const sanitizedLocation = String(item.location || "Campus Ivaipor\xE3").trim().substring(0, 100);
    const sanitizedCategory = String(item.category || "Outros").trim().substring(0, 80);
    const sanitizedColor = item.color && item.color.trim() ? item.color.trim() : null;
    const sanitizedBrand = item.brand && item.brand.trim() ? item.brand.trim() : null;
    const dateFormatted = formatBrtDateServer(item.date);
    const createdAtFormatted = formatBrtDateTimeServer(item.createdAt || item.updatedAt || (/* @__PURE__ */ new Date()).toISOString());
    const databaseIsoTimestamp = getIsoDatabaseTimestampServer(item.createdAt, item.updatedAt);
    const fields = [
      { name: "\u{1F3F7}\uFE0F Categoria", value: `**${sanitizedCategory}**`, inline: true },
      { name: "\u{1F4CD} Local onde foi Encontrado", value: sanitizedLocation, inline: true },
      { name: "\u{1F4C5} Data do Achado", value: `**${dateFormatted}**`, inline: true },
      { name: "\u{1F4CA} Status do Item", value: "\u{1F7E2} **Sob Cust\xF3dia** *(Aguardando Retirada)*", inline: true }
    ];
    const rawRegistrar = item.registeredByName || item.userName || item.authorName;
    if (rawRegistrar && typeof rawRegistrar === "string" && rawRegistrar.trim()) {
      const cleanRegistrar = rawRegistrar.trim().substring(0, 100);
      const roleSuffix = item.registeredByRole ? ` (${item.registeredByRole})` : "";
      fields.push({
        name: "\u{1F464} Registrado Por",
        value: `${cleanRegistrar}${roleSuffix}`,
        inline: true
      });
    }
    const rawProtocol = item.qrCodeId || item.protocolNumber || item.protocol || item.id;
    if (rawProtocol && typeof rawProtocol === "string" && rawProtocol.trim() && rawProtocol.trim().toUpperCase() !== "N/A") {
      const cleanProtocol = rawProtocol.trim().substring(0, 80);
      fields.push({
        name: "\u{1F4CB} N\xFAmero / Protocolo",
        value: `\`${cleanProtocol}\``,
        inline: true
      });
    }
    if (sanitizedColor || sanitizedBrand) {
      const visualParts = [
        sanitizedColor ? `Cor: **${sanitizedColor}**` : null,
        sanitizedBrand ? `Marca: **${sanitizedBrand}**` : null
      ].filter(Boolean);
      fields.push({
        name: "\u{1F3A8} Caracter\xEDsticas Visuais",
        value: visualParts.join(" \u2022 ").substring(0, 1024),
        inline: false
      });
    }
    fields.push({
      name: "\u{1F550} Registro no Banco de Dados",
      value: createdAtFormatted,
      inline: false
    });
    const embed = {
      title: `\u{1F4E6} Novo Achado Cadastrado: ${sanitizedTitle}`.substring(0, 256),
      description: sanitizedDesc || "Objeto cadastrado no sistema do IFPR Campus Ivaipor\xE3.",
      color: 1096065,
      // Emerald Green representing IFPR / Achados
      fields,
      footer: {
        text: "IFPR Campus Ivaipor\xE3 \u2022 Central de Achados e Perdidos \u2022 Evento Registrado",
        icon_url: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/shield-check.png"
      },
      timestamp: databaseIsoTimestamp
    };
    if (item.imageUrl && (item.imageUrl.startsWith("http://") || item.imageUrl.startsWith("https://"))) {
      embed.image = { url: item.imageUrl };
    }
    const discordPayload = {
      username: "IFPR Achados e Perdidos \u2022 #novos-achados",
      avatar_url: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/package-search.png",
      embeds: [embed]
    };
    console.log("[NOVO_ACHADO_DISCORD] dados preparados");
    console.log("[NOVO_ACHADO_DISCORD] requisi\xE7\xE3o enviada");
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(discordPayload)
    });
    console.log(`[NOVO_ACHADO_DISCORD] status HTTP: ${response.status}`);
    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[Discord Novos Achados Warning] HTTP ${response.status} do Webhook:`, errText);
      return false;
    }
    console.log(`[Discord Novos Achados Success] Notifica\xE7\xE3o enviada para #novos-achados: "${item.title}" (${item.id})`);
    return true;
  } catch (err) {
    console.error("[Discord Novos Achados Error] Falha ao enviar para o Discord:", err?.message || err);
    return false;
  }
}
app.post("/api/items/notify-novos-achados", generalRateLimiter, async (req, res) => {
  try {
    const item = req.body?.item || req.body;
    if (!item || !item.title) {
      return res.status(400).json({ success: false, error: "Dados do item ausentes ou incompletos." });
    }
    const normalizedType = String(item?.type || "").toUpperCase().trim();
    if (normalizedType !== "ENCONTRADO" && normalizedType !== "ACHADO") {
      return res.json({
        success: true,
        message: `Item com tipo "${item?.type}" n\xE3o \xE9 ENCONTRADO/ACHADO. Ignorado para o canal #novos-achados.`
      });
    }
    sendNovoAchadoToDiscord(item).catch((err) => {
      console.error("[Discord Novos Achados Background Error]:", err);
    });
    return res.json({
      success: true,
      message: "Notifica\xE7\xE3o de novo achado encaminhada para o canal #novos-achados.",
      itemId: item.id
    });
  } catch (error) {
    console.error("Erro no endpoint notify-novos-achados:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Erro ao processar notifica\xE7\xE3o para o Discord."
    });
  }
});
function getDiscordNovasPerdasWebhookUrl() {
  return (process.env.DISCORD_NOVAS_PERDAS_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL_NOVAS_PERDAS || process.env.DISCORD_PERDAS_WEBHOOK_URL || process.env.DISCORD_PERDAS_URL || process.env.DISCORD_WEBHOOK_PERDAS || "").trim();
}
async function sendNovaPerdaToDiscord(item) {
  console.log("[NOVA_PERDA_DISCORD] fun\xE7\xE3o chamada");
  const normalizedType = String(item?.type || "").toUpperCase().trim();
  if (normalizedType !== "PERDIDO" && normalizedType !== "PERDA") {
    console.log(`[NOVA_PERDA_DISCORD] Item do tipo "${item?.type}" ignorado para o canal #novas-perdas.`);
    return false;
  }
  const webhookUrl = getDiscordNovasPerdasWebhookUrl();
  console.log(`[NOVA_PERDA_DISCORD] webhook configurado: ${webhookUrl ? "SIM" : "N\xC3O"}`);
  if (!webhookUrl) {
    console.info(
      "[Discord Novas Perdas Notice] DISCORD_NOVAS_PERDAS_WEBHOOK_URL n\xE3o configurada no servidor. O cadastro da perda foi salvo normalmente."
    );
    return false;
  }
  try {
    const sanitizedTitle = String(item.title || "Objeto Perdido").trim().substring(0, 200);
    const sanitizedDesc = String(item.description || "Nenhuma descri\xE7\xE3o detalhada fornecida.").trim().substring(0, 3900);
    const sanitizedLocation = String(item.location || "Campus Ivaipor\xE3 (Local n\xE3o especificado)").trim().substring(0, 100);
    const sanitizedCategory = String(item.category || "Outros").trim().substring(0, 80);
    const sanitizedColor = item.color && item.color.trim() ? item.color.trim() : null;
    const sanitizedBrand = item.brand && item.brand.trim() ? item.brand.trim() : null;
    const dateFormatted = formatBrtDateServer(item.date);
    const createdAtFormatted = formatBrtDateTimeServer(item.createdAt || item.updatedAt || (/* @__PURE__ */ new Date()).toISOString());
    const databaseIsoTimestamp = getIsoDatabaseTimestampServer(item.createdAt, item.updatedAt);
    const fields = [
      { name: "\u{1F3F7}\uFE0F Categoria", value: `**${sanitizedCategory}**`, inline: true },
      { name: "\u{1F4CD} \xDAltimo Local Onde Foi Visto", value: sanitizedLocation, inline: true },
      { name: "\u{1F4C5} Data da Perda", value: `**${dateFormatted}**`, inline: true },
      { name: "\u{1F4CA} Status do Item", value: "\u{1F7E1} **Perdido** *(Procura Ativa no Campus)*", inline: true }
    ];
    const rawRegistrar = item.registeredByName || item.userName || item.authorName;
    if (rawRegistrar && typeof rawRegistrar === "string" && rawRegistrar.trim()) {
      const cleanRegistrar = rawRegistrar.trim().substring(0, 100);
      const roleSuffix = item.registeredByRole ? ` (${item.registeredByRole})` : "";
      fields.push({
        name: "\u{1F464} Usu\xE1rio Respons\xE1vel pelo Cadastro",
        value: `${cleanRegistrar}${roleSuffix}`,
        inline: true
      });
    }
    const rawProtocol = item.qrCodeId || item.protocolNumber || item.protocol || item.id;
    if (rawProtocol && typeof rawProtocol === "string" && rawProtocol.trim() && rawProtocol.trim().toUpperCase() !== "N/A") {
      const cleanProtocol = rawProtocol.trim().substring(0, 80);
      fields.push({
        name: "\u{1F4CB} N\xFAmero / Protocolo",
        value: `\`${cleanProtocol}\``,
        inline: true
      });
    }
    if (sanitizedColor || sanitizedBrand) {
      const visualParts = [
        sanitizedColor ? `Cor: **${sanitizedColor}**` : null,
        sanitizedBrand ? `Marca: **${sanitizedBrand}**` : null
      ].filter(Boolean);
      fields.push({
        name: "\u{1F3A8} Caracter\xEDsticas Visuais",
        value: visualParts.join(" \u2022 ").substring(0, 1024),
        inline: false
      });
    }
    fields.push({
      name: "\u{1F550} Registro no Banco de Dados",
      value: createdAtFormatted,
      inline: false
    });
    const embed = {
      title: `\u{1F50E} Novo Objeto Perdido Cadastrado: ${sanitizedTitle}`.substring(0, 256),
      description: sanitizedDesc || "Objeto registrado como perdido no IFPR Campus Ivaipor\xE3.",
      color: 16096779,
      // Amber 0xf59e0b representing alert/lost item
      fields,
      footer: {
        text: "IFPR Campus Ivaipor\xE3 \u2022 Central de Achados e Perdidos \u2022 Evento Registrado",
        icon_url: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/shield-check.png"
      },
      timestamp: databaseIsoTimestamp
    };
    if (item.imageUrl && (item.imageUrl.startsWith("http://") || item.imageUrl.startsWith("https://"))) {
      embed.image = { url: item.imageUrl };
    }
    const discordPayload = {
      username: "IFPR Achados e Perdidos \u2022 #novas-perdas",
      avatar_url: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/search.png",
      embeds: [embed]
    };
    console.log("[NOVA_PERDA_DISCORD] dados preparados");
    console.log("[NOVA_PERDA_DISCORD] requisi\xE7\xE3o enviada");
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(discordPayload)
    });
    console.log(`[NOVA_PERDA_DISCORD] status HTTP: ${response.status}`);
    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[Discord Novas Perdas Warning] HTTP ${response.status} do Webhook:`, errText);
      return false;
    }
    console.log(`[Discord Novas Perdas Success] Notifica\xE7\xE3o enviada para #novas-perdas: "${item.title}" (${item.id})`);
    return true;
  } catch (err) {
    console.error("[Discord Novas Perdas Error] Falha ao enviar para o Discord:", err?.message || err);
    return false;
  }
}
app.post("/api/items/notify-novas-perdas", generalRateLimiter, async (req, res) => {
  try {
    const item = req.body?.item || req.body;
    if (!item || !item.title) {
      return res.status(400).json({ success: false, error: "Dados do item ausentes ou incompletos." });
    }
    const normalizedType = String(item?.type || "").toUpperCase().trim();
    if (normalizedType !== "PERDIDO" && normalizedType !== "PERDA") {
      return res.json({
        success: true,
        message: `Item com tipo "${item?.type}" n\xE3o \xE9 PERDIDO/PERDA. Ignorado para o canal #novas-perdas.`
      });
    }
    sendNovaPerdaToDiscord(item).catch((err) => {
      console.error("[Discord Novas Perdas Background Error]:", err);
    });
    return res.json({
      success: true,
      message: "Notifica\xE7\xE3o de nova perda encaminhada para o canal #novas-perdas.",
      itemId: item.id
    });
  } catch (error) {
    console.error("Erro no endpoint notify-novas-perdas:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Erro ao processar notifica\xE7\xE3o para o Discord."
    });
  }
});
app.post("/api/gemini/semantic-search", requireAuth, aiRateLimiter, async (req, res) => {
  const userId = req.authUser.uid;
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
      const qLower = cleanQuery.toLowerCase();
      const qWords = qLower.split(/\s+/).filter((w) => w.length > 2);
      const localResults = safeCandidates.filter(Boolean).map((item) => {
        let score = 0;
        const title = String(item?.title ?? "").toLowerCase();
        const desc = String(item?.description ?? "").toLowerCase();
        const loc = String(item?.location ?? "").toLowerCase();
        const cat = String(item?.category ?? "").toLowerCase();
        const color = String(item?.color ?? "").toLowerCase();
        const brand = String(item?.brand ?? "").toLowerCase();
        const textCorpus = `${title} ${desc} ${loc} ${cat} ${color} ${brand}`;
        const matchedWords = [];
        qWords.forEach((word) => {
          if (textCorpus.includes(word)) {
            score += 25;
            matchedWords.push(word);
          }
        });
        if (qLower.includes("biblioteca") && loc.includes("biblioteca")) score += 30;
        if (qLower.includes("refeit\xF3rio") && loc.includes("refeit\xF3rio")) score += 30;
        if (qLower.includes("bloco") && loc.includes("bloco")) score += 25;
        if (qLower.includes("gin\xE1sio") && loc.includes("gin\xE1sio")) score += 30;
        if (qLower.includes("portaria") && loc.includes("portaria")) score += 30;
        return {
          itemId: item?.id || "",
          relevanceScore: Math.min(100, score),
          explanation: matchedWords.length > 0 ? `Correspond\xEAncia textual e de localiza\xE7\xE3o encontrada para: ${matchedWords.join(", ")}.` : "Correspond\xEAncia aproximada.",
          highlightKeywords: matchedWords
        };
      }).filter((r) => r.relevanceScore >= 25).sort((a, b) => b.relevanceScore - a.relevanceScore);
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
        ip: req.ip || req.socket.remoteAddress
      });
      return res.json({
        success: true,
        results: localResults,
        modelUsed: "local-semantic-fallback",
        totalCandidates: safeCandidates.length
      });
    }
    const itemsSummary = safeCandidates.map((c) => ({
      id: c.id,
      title: String(c.title || "").substring(0, 80),
      description: String(c.description || "").substring(0, 150),
      location: c.location,
      category: c.category,
      color: c.color,
      brand: c.brand,
      status: c.status,
      type: c.type
    }));
    const systemInstruction = `Voc\xEA \xE9 um motor de busca sem\xE2ntica inteligente para o Achados e Perdidos do IFPR Campus Ivaipor\xE3.
Sua miss\xE3o \xE9 receber a consulta em linguagem natural do usu\xE1rio e identificar os objetos mais relevantes na lista fornecida.
Calcule a pontua\xE7\xE3o de relev\xE2ncia de 0 a 100 para cada objeto correspondente.
Retorne apenas itens com relevanceScore >= 40, ordenados do mais relevante para o menos relevante.`;
    const prompt = `Consulta do usu\xE1rio: "${cleanQuery}"

Lista de objetos cadastrados no IFPR Campus Ivaipor\xE3:
${JSON.stringify(itemsSummary, null, 2)}

Retorne a lista com os IDs dos itens correspondentes, nota de relev\xE2ncia de 0 a 100, breve explica\xE7\xE3o em portugu\xEAs e palavras-chave destacadas.`;
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
                  itemId: { type: Type.STRING, description: "ID \xFAnico do item correspondente" },
                  relevanceScore: { type: Type.INTEGER, description: "Pontua\xE7\xE3o de 0 a 100" },
                  explanation: { type: Type.STRING, description: "Justificativa clara da correspond\xEAncia sem\xE2ntica" },
                  highlightKeywords: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Termos ou pistas coincidentes"
                  }
                },
                required: ["itemId", "relevanceScore", "explanation", "highlightKeywords"]
              }
            }
          },
          required: ["results"]
        }
      }
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
        resultsCount: parsed.results?.length || 0
      },
      ip: req.ip || req.socket.remoteAddress
    });
    return res.json({
      success: true,
      results: parsed.results || [],
      modelUsed: "gemini-3.7-flash",
      totalCandidates: safeCandidates.length
    });
  } catch (err) {
    console.error("Erro no endpoint /api/gemini/semantic-search:", err);
    logAIAudit({
      userId,
      userEmail,
      userRole,
      endpoint: "/api/gemini/semantic-search",
      action: "SEMANTIC_SEARCH",
      status: "FAILED",
      details: { error: err.message },
      ip: req.ip || req.socket.remoteAddress
    });
    res.status(500).json({ error: err.message || "Erro na busca sem\xE2ntica Gemini." });
  }
});
app.get("/api/ai/audit-logs", requireAuth, requireAdmin, (_req, res) => {
  res.json({
    success: true,
    totalRecords: aiAuditLogs.length,
    logs: aiAuditLogs.slice(0, 100)
  });
});
app.get("/api/monitoring/export-logs", (req, res) => {
  try {
    const memory = process.memoryUsage();
    const payload = {
      institution: "Instituto Federal do Paran\xE1 (IFPR) - Campus Ivaipor\xE3",
      system: "IFPR Achados & Perdidos - Monitoramento & Telemetria",
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      requestedBy: req.authUser?.email || "anonymous_session",
      server: {
        uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1e3),
        startTime: new Date(serverStartTime).toISOString(),
        totalRequestsHandled: totalServerRequests,
        memoryUsage: {
          rssMB: Math.round(memory.rss / 1024 / 1024),
          heapTotalMB: Math.round(memory.heapTotal / 1024 / 1024),
          heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024),
          externalMB: Math.round(memory.external / 1024 / 1024)
        },
        nodeVersion: process.version,
        platform: process.platform
      },
      systemConfig: globalSystemConfig,
      eventCounters,
      recentAnalyticsEvents: analyticsEvents.slice(0, 100),
      recentAIAuditEvents: aiAuditLogs.slice(0, 100),
      diagnosticsSummary: {
        status: "OPERATIONAL",
        healthCheck: "HEALTHY",
        totalAnalyticsEventsCaptured: analyticsEvents.length,
        totalAIAuditRecordsCaptured: aiAuditLogs.length
      }
    };
    res.setHeader("Content-Disposition", `attachment; filename=Relatorio_Logs_Monitoramento_IFPR_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`);
    res.setHeader("Content-Type", "application/json");
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ error: "Erro ao gerar exporta\xE7\xE3o de logs de monitoramento." });
  }
});
app.get("/api", (_req, res) => {
  res.json({
    status: "ok",
    service: "IFPR Achados & Perdidos Backend API",
    institution: "Instituto Federal do Paran\xE1 (IFPR) - Campus Ivaipor\xE3",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    environment: {
      isVercel: Boolean(process.env.VERCEL),
      nodeEnv: process.env.NODE_ENV || "development"
    }
  });
});
async function startServer() {
  const isProduction = process.env.NODE_ENV === "production";
  const distPath = path.join(process.cwd(), "dist");
  if (!isProduction) {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa"
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
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
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
var server_default = app;

// api/index.ts
var index_default = server_default;
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
