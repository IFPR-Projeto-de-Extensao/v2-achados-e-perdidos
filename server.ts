import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

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

app.post("/api/system/config", (req, res) => {
  try {
    const { maintenanceMode, maintenanceCustomMessage, updatedBy } = req.body;
    if (typeof maintenanceMode === "boolean") {
      globalSystemConfig.maintenanceMode = maintenanceMode;
    }
    if (typeof maintenanceCustomMessage === "string" && maintenanceCustomMessage.trim()) {
      globalSystemConfig.maintenanceCustomMessage = maintenanceCustomMessage.trim();
    }
    globalSystemConfig.lastUpdated = new Date().toISOString();
    globalSystemConfig.updatedBy = updatedBy || "ADMIN_SESSION";

    console.log(`[System Config Updated] Modo Manutenção: ${globalSystemConfig.maintenanceMode}`);
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
    if (!eventName) {
      return res.status(400).json({ error: "Nome do evento obrigatório." });
    }

    const eventRecord = {
      eventName,
      params: params || {},
      timestamp: timestamp || new Date().toISOString(),
      url: url || "",
      ip: req.ip,
    };

    analyticsEvents.unshift(eventRecord);
    if (analyticsEvents.length > 500) {
      analyticsEvents.pop();
    }

    eventCounters[eventName] = (eventCounters[eventName] || 0) + 1;

    console.log(`[Analytics Tracked] Evento: ${eventName}`, params || "");
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
    eventCounters,
    recentEvents: analyticsEvents.slice(0, 50),
    uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
    systemMemoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  });
});

// AI Endpoint: Extrair detalhes de um objeto com base no relato ou imagem
app.post("/api/ai/analyze-object", async (req, res) => {
  try {
    const { promptText, imageBase64 } = req.body;
    const ai = getGenAIClient();

    if (!ai) {
      // Fallback inteligente caso a chave não esteja definida ainda no ambiente
      return res.json({
        success: true,
        extracted: {
          title: promptText?.slice(0, 30) || "Objeto Cadastrado",
          category: "Outros",
          color: "Não especificada",
          brand: "Desconhecida",
          location: "Campus IFPR",
          description: promptText || "Objeto cadastrado sem descrição adicional.",
        },
        fallback: true,
      });
    }

    const systemInstruction = `Você é um assistente especialista do sistema Achados e Perdidos do Instituto Federal do Paraná (IFPR) - Campus Ivaiporã.
Sua missão é analisar um relato livre ou imagem de um objeto perdido/encontrado no campus Ivaiporã e extrair dados estruturados em JSON.
Categorias válidas disponíveis: "Eletrônicos", "Documentos & Cartões", "Roupas & Calçados", "Chaves", "Material Escolar & Livros", "Acessórios & Bijuterias", "Garrafas & Marmitas", "Guarda-chuvas", "Outros".
Preencha todos os campos da melhor forma possível. Se um campo não puder ser identificado, utilize "Não informado".
A resposta DEVE ser estritamente no formato JSON definido no schema.`;

    const contents: any[] = [];
    if (imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      contents.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: cleanBase64,
        },
      });
    }
    
    contents.push({
      text: promptText 
        ? `Analise este relato/objeto no IFPR: "${promptText}"`
        : "Analise esta foto de objeto encontrado/perdido no IFPR e descreva com precisão.",
    });

    // Use gemini-3.1-pro-preview for vision/images or complex requests, otherwise gemini-3.5-flash
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

    return res.json({
      success: true,
      extracted: extractedData,
    });
  } catch (error: any) {
    console.error("Erro na rota /api/ai/analyze-object:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Erro interno ao processar inteligência artificial.",
    });
  }
});

// Dedicated Vision & Image Understanding Endpoint using gemini-3.1-pro-preview
app.post("/api/ai/analyze-image", async (req, res) => {
  try {
    const { imageBase64, customContext } = req.body;
    const ai = getGenAIClient();

    if (!imageBase64) {
      return res.status(400).json({ error: "Imagem em formato Base64 não fornecida." });
    }

    if (!ai) {
      return res.json({
        success: true,
        analysis: {
          title: "Objeto Detectado na Foto",
          category: "Outros",
          color: "Análise visual pendente de chave API",
          brand: "Não identificada",
          condition: "Bom estado de conservação",
          distinctiveFeatures: ["Detalhes visíveis na foto"],
          suggestedSecretHint: "Iniciais ou marcas no verso",
          description: "Análise realizada com fallback local. Defina GEMINI_API_KEY para visão multimodal avançada.",
        },
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
            text: customContext
              ? `Contexto adicional do usuário: "${customContext}". Realize a análise completa da imagem.`
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

    return res.json({
      success: true,
      analysis,
    });
  } catch (err: any) {
    console.error("Erro no endpoint /api/ai/analyze-image:", err);
    res.status(500).json({ error: err.message || "Erro na análise de visão do Gemini Pro." });
  }
});

// AI Endpoint Fast Query Expansion / Quick Auto-Tagging using gemini-3.1-flash-lite
app.post("/api/ai/quick-tag", async (req, res) => {
  try {
    const { text } = req.body;
    const ai = getGenAIClient();

    if (!text || !ai) {
      return res.json({ tags: ["Geral"], suggestedCategory: "Outros" });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: `Gere 3 a 5 tags curtas e indique a categoria ideal para o texto: "${text}". Categorias: Eletrônicos, Documentos & Cartões, Roupas & Calçados, Chaves, Material Escolar & Livros, Acessórios & Bijuterias, Garrafas & Marmitas, Guarda-chuvas, Outros.`,
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

    return res.json(JSON.parse(response.text || "{}"));
  } catch (err: any) {
    return res.json({ tags: ["IFPR"], suggestedCategory: "Outros" });
  }
});

// AI Endpoint: Comparação de similaridade textual e semântica entre novo item e existentes
app.post("/api/ai/match-similarity", async (req, res) => {
  try {
    const { newItem, candidateItems } = req.body;
    const ai = getGenAIClient();

    if (!candidateItems || candidateItems.length === 0) {
      return res.json({ matches: [] });
    }

    if (!ai) {
      // Local fallback text matching logic if AI key is pending
      const simpleMatches = candidateItems
        .map((cand: any) => {
          let score = 0;
          if (cand.category === newItem.category) score += 40;
          if (cand.color?.toLowerCase().includes(newItem.color?.toLowerCase() || "___")) score += 25;
          if (cand.brand?.toLowerCase().includes(newItem.brand?.toLowerCase() || "___")) score += 25;
          if (cand.title?.toLowerCase().includes(newItem.title?.toLowerCase() || "___")) score += 10;
          return {
            itemId: cand.id,
            matchScore: score,
            reason: score > 50 ? "Categorias e marcas semelhantes encontradas." : "Correspondência parcial.",
            matchedFeatures: ["Categoria", "Cor"],
          };
        })
        .filter((m: any) => m.matchScore >= 40)
        .sort((a: any, b: any) => b.matchScore - a.matchScore);

      return res.json({ matches: simpleMatches });
    }

    const prompt = `Você é um algoritmo de correspondência inteligente do Achados & Perdidos IFPR Campus Ivaiporã.
Compare o novo objeto cadastrado:
- Título: ${newItem.title}
- Tipo: ${newItem.type} (Buscando oposto nos existentes)
- Categoria: ${newItem.category}
- Cor: ${newItem.color}
- Marca: ${newItem.brand}
- Local: ${newItem.location}
- Descrição: ${newItem.description}

E compare com esta lista de objetos pré-cadastrados:
${JSON.stringify(candidateItems.map((c: any) => ({
  id: c.id,
  title: c.title,
  category: c.category,
  color: c.color,
  brand: c.brand,
  location: c.location,
  description: c.description
})), null, 2)}

Avalie a probabilidade de algum desses objetos pré-cadastrados ser O MESMO objeto ou a contraparte (por exemplo: um objeto perdido que coincide com um encontrado).
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
    return res.json(parsed);
  } catch (err: any) {
    console.error("Erro no endpoint /api/ai/match-similarity:", err);
    res.status(500).json({ error: err.message || "Erro no cruzamento de dados de IA." });
  }
});

// Gemini Semantic Search Endpoint (Home Search Bar NL Search)
app.post("/api/gemini/semantic-search", async (req, res) => {
  try {
    const { query: searchQuery, items: candidateItems } = req.body;
    const ai = getGenAIClient();

    if (!searchQuery || !candidateItems || candidateItems.length === 0) {
      return res.json({ success: true, results: [], totalCandidates: 0 });
    }

    if (!ai) {
      // Local fallback semantic search when Gemini key is not configured
      const qLower = searchQuery.toLowerCase();
      const qWords = qLower.split(/\s+/).filter((w: string) => w.length > 2);

      const localResults = candidateItems
        .map((item: any) => {
          let score = 0;
          const textCorpus = `${item.title} ${item.description} ${item.location} ${item.category} ${item.color} ${item.brand}`.toLowerCase();
          const matchedWords: string[] = [];

          qWords.forEach((word: string) => {
            if (textCorpus.includes(word)) {
              score += 25;
              matchedWords.push(word);
            }
          });

          // Spatial proximity heuristics
          if (qLower.includes("biblioteca") && item.location?.toLowerCase().includes("biblioteca")) score += 30;
          if (qLower.includes("refeitório") && item.location?.toLowerCase().includes("refeitório")) score += 30;
          if (qLower.includes("bloco") && item.location?.toLowerCase().includes("bloco")) score += 25;
          if (qLower.includes("ginásio") && item.location?.toLowerCase().includes("ginásio")) score += 30;
          if (qLower.includes("portaria") && item.location?.toLowerCase().includes("portaria")) score += 30;

          return {
            itemId: item.id,
            relevanceScore: Math.min(100, score),
            explanation: matchedWords.length > 0
              ? `Correspondência textual e de localização encontrada para: ${matchedWords.join(", ")}.`
              : "Correspondência aproximada.",
            highlightKeywords: matchedWords,
          };
        })
        .filter((r: any) => r.relevanceScore >= 25)
        .sort((a: any, b: any) => b.relevanceScore - a.relevanceScore);

      return res.json({
        success: true,
        results: localResults,
        modelUsed: "local-semantic-fallback",
        totalCandidates: candidateItems.length,
      });
    }

    const itemsSummary = candidateItems.map((c: any) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      location: c.location,
      category: c.category,
      color: c.color,
      brand: c.brand,
      status: c.status,
      type: c.type,
    }));

    const systemInstruction = `Você é um motor de busca semântica inteligente para o Achados e Perdidos do IFPR Campus Ivaiporã.
Sua missão é receber a consulta em linguagem natural do usuário (por exemplo: "chave azul esquecida perto da biblioteca" ou "garrafa térmica preta deixada no refeitório") e identificar os objetos mais relevantes na lista fornecida.
Leve em consideração:
- Sinônimos e variações de palavras (ex: chaves, chaveiro, chaveiro com fita).
- Cores e características descritivas.
- Proximidade espacial e locais citados no Campus Ivaiporã (ex: Biblioteca, SEBAC, Refeitório, Ginásio, Bloco A/B, Quadra, Portaria).
- Descrição detalhada do objeto.

Calcule a pontuação de relevância de 0 a 100 para cada objeto correspondente.
Retorne apenas itens com relevanceScore >= 40, ordenados do mais relevante para o menos relevante.`;

    const prompt = `Consulta do usuário: "${searchQuery}"

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
    return res.json({
      success: true,
      results: parsed.results || [],
      modelUsed: "gemini-3.7-flash",
      totalCandidates: candidateItems.length,
    });
  } catch (err: any) {
    console.error("Erro no endpoint /api/gemini/semantic-search:", err);
    res.status(500).json({ error: err.message || "Erro na busca semântica Gemini." });
  }
});

// Endpoint to export comprehensive monitoring & performance diagnostic logs
app.get("/api/monitoring/export-logs", (_req, res) => {
  try {
    const memory = process.memoryUsage();
    const payload = {
      institution: "Instituto Federal do Paraná (IFPR) - Campus Ivaiporã",
      system: "IFPR Achados & Perdidos - Monitoramento & Telemetria",
      exportedAt: new Date().toISOString(),
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
      recentAnalyticsEvents: analyticsEvents,
      diagnosticsSummary: {
        status: "OPERATIONAL",
        healthCheck: "HEALTHY",
        totalAnalyticsEventsCaptured: analyticsEvents.length,
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
    app.get("*", (req, res) => {
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
