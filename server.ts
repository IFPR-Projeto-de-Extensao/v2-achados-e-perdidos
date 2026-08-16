import express, { Request, Response, NextFunction } from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import firebaseAppConfig from "./firebase-applet-config.json";

dotenv.config();

const app = express();
const PORT = 3000;
const FIREBASE_PROJECT_ID = firebaseAppConfig.projectId || "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1";
const ROOT_ADMIN_EMAIL = "paulocauan39@gmail.com";

app.use(express.json({ limit: "10mb" }));

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
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitStore.entries()) {
    if (now > val.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

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

function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.split(" ")[1];
  const payload = parseJwtPayload(token);

  if (payload) {
    const nowInSec = Math.floor(Date.now() / 1000);
    // Basic verification of issuer, audience, and expiration
    const isValidIss = payload.iss === `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
    const isValidAud = payload.aud === FIREBASE_PROJECT_ID;
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
const analyticsEvents: Array<{ eventName: string; params?: any; timestamp: string; ip?: string }> = [];
const eventCounters: Record<string, number> = {};

// Global System Configuration State (Maintenance Mode & Campus Announcements)
let globalSystemConfig = {
  maintenanceMode: false,
  maintenanceCustomMessage: "⚠️ ATENÇÃO: O SISTEMA ESTÁ EM MODO DE MANUTENÇÃO / ATUALIZAÇÃO PROGRAMADA NO CAMPUS IVAIPORÃ",
  lastUpdated: new Date().toISOString(),
  updatedBy: "SYSTEM",
};

app.use((_req, _res, next) => {
  totalServerRequests++;
  next();
});

// API System Configuration Endpoints (Works seamlessly online & server-side)
app.get("/api/system/config", (_req, res) => {
  res.json({
    success: true,
    config: globalSystemConfig,
  });
});

app.post("/api/system/config", requireAdmin, (req, res) => {
  try {
    const { maintenanceMode, maintenanceCustomMessage } = req.body;
    if (typeof maintenanceMode === "boolean") {
      globalSystemConfig.maintenanceMode = maintenanceMode;
    }
    if (typeof maintenanceCustomMessage === "string" && maintenanceCustomMessage.trim()) {
      globalSystemConfig.maintenanceCustomMessage = maintenanceCustomMessage.trim().substring(0, 500);
    }
    globalSystemConfig.lastUpdated = new Date().toISOString();
    globalSystemConfig.updatedBy = req.authUser?.email || "ADMIN_SESSION";

    console.log(`[System Config Updated] Modo Manutenção: ${globalSystemConfig.maintenanceMode} por ${globalSystemConfig.updatedBy}`);
    return res.json({ success: true, config: globalSystemConfig });
  } catch (err: any) {
    return res.status(500).json({ error: "Erro ao atualizar configuração do sistema." });
  }
});

// API Health Check & System Monitoring
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
    geminiAvailable: !!process.env.GEMINI_API_KEY,
    memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  });
});

// Analytics Tracking Endpoint (Google Analytics + Firebase Backend Receiver)
app.post("/api/analytics/track", (req, res) => {
  try {
    const { eventName, params, timestamp, url } = req.body;
    if (!eventName || typeof eventName !== "string" || eventName.length > 100) {
      return res.status(400).json({ error: "Nome do evento inválido ou ausente." });
    }

    const eventRecord = {
      eventName: eventName.replace(/[^a-zA-Z0-9_-]/g, ""),
      params: params && typeof params === "object" ? params : {},
      timestamp: timestamp || new Date().toISOString(),
      url: typeof url === "string" ? url.substring(0, 300) : "",
      ip: req.ip,
    };

    analyticsEvents.unshift(eventRecord);
    if (analyticsEvents.length > 500) {
      analyticsEvents.pop();
    }

    eventCounters[eventRecord.eventName] = (eventCounters[eventRecord.eventName] || 0) + 1;

    return res.json({ success: true, logged: eventRecord });
  } catch (err: any) {
    return res.status(500).json({ error: "Erro ao processar telemetria de analíticos." });
  }
});

// Analytics Dashboard Metrics Endpoint
app.get("/api/analytics/metrics", (_req, res) => {
  res.json({
    totalServerRequests,
    totalAnalyticsEvents: analyticsEvents.length,
    totalAIAuditRecords: aiAuditLogs.length,
    eventCounters,
    recentEvents: analyticsEvents.slice(0, 50),
    recentAIAudits: aiAuditLogs.slice(0, 20),
    uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
    systemMemoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  });
});

// AI Endpoint: Extrair detalhes de um objeto com base no relato ou imagem
app.post("/api/ai/analyze-object", requireAuth, aiRateLimiter, async (req, res) => {
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
app.post("/api/ai/analyze-image", requireAuth, aiRateLimiter, async (req, res) => {
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

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const systemInstruction = `Você é um motor de Inteligência Artificial de Visão Computacional de última geração alimentado pelo Gemini 3.1 Pro no IFPR Campus Ivaiporã.
Sua tarefa é analisar minuciosamente uma imagem enviada pelo usuário referente a um pertencente achado ou perdido no campus.
Examine atentamente:
1. Objeto principal, formato, utilidade e marca visualizável.
2. Cores predominantes e detalhes cromáticos.
3. Marcas de uso, adesivos, gravuras, danos, números de série ou inscrições (útil como pista de verificação).
4. Sugestão de Pergunta/Pista Secreta de segurança para comprovar propriedade do objeto sem revelar aos impostores.
5. Categoria oficial ("Eletrônicos", "Documentos & Cartões", "Roupas & Calçados", "Chaves", "Material Escolar & Livros", "Acessórios & Bijuterias", "Garrafas & Marmitas", "Guarda-chuvas", "Outros").
Retorne um JSON rigorosamente estruturado conforme o schema.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
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
app.post("/api/ai/quick-tag", requireAuth, aiRateLimiter, async (req, res) => {
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
app.post("/api/ai/match-similarity", requireAuth, aiRateLimiter, async (req, res) => {
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

// Gemini Semantic Search Endpoint (Home Search Bar NL Search)
app.post("/api/gemini/semantic-search", requireAuth, aiRateLimiter, async (req, res) => {
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
app.get("/api/ai/audit-logs", requireAuth, requireAdmin, (_req, res) => {
  res.json({
    success: true,
    totalRecords: aiAuditLogs.length,
    logs: aiAuditLogs.slice(0, 100),
  });
});

// Endpoint to export comprehensive monitoring & performance diagnostic logs
app.get("/api/monitoring/export-logs", (req, res) => {
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

// Serve frontend assets
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`IFPR Achados & Perdidos backend rodando em http://localhost:${PORT}`);
    });
  }
}

startServer();

export default app;
