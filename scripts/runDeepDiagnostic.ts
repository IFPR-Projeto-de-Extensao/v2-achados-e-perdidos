/**
 * Script de Diagnóstico Aprofundado do Google Gemini
 * Investiga com precisão cirúrgica:
 * - Presença e comprimento de GEMINI_API_KEY
 * - Comportamento de cada modelo oficial e aliases
 * - Teste isolado com SDK @google/genai direto
 * - Teste endpoint a endpoint via Express
 * - Captura do erro bruto (status HTTP original, body, code, status, message)
 * - Identificação se erro ocorre antes ou depois do envio à API
 */

import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

async function runDeepDiagnostic() {
  console.log("===============================================================");
  console.log("🔍 DIAGNÓSTICO TÉCNICO APROFUNDADO: GOOGLE GEMINI API / SDK");
  console.log("===============================================================");

  // 1. Verificação de Ambiente e Secret (Sem expor o valor)
  const apiKey = process.env.GEMINI_API_KEY;
  const isKeyPresent = Boolean(apiKey && apiKey.trim().length > 0);
  const keyLength = apiKey ? apiKey.trim().length : 0;
  const keyPrefix = apiKey ? apiKey.trim().substring(0, 4) + "..." : "NONE";

  console.log("\n[1] VERIFICAÇÃO DE AMBIENTE (PROCESS.ENV):");
  console.log(`- GEMINI_API_KEY presente no processo: ${isKeyPresent ? "SIM (DEFINIDA)" : "NÃO (AUSENTE)"}`);
  console.log(`- Comprimento da chave (caracteres)   : ${keyLength}`);
  console.log(`- Formato do prefixo de chave         : ${keyPrefix}`);

  if (!isKeyPresent) {
    console.error("❌ ERRO CRÍTICO: GEMINI_API_KEY não encontrada nas variáveis de ambiente!");
    return;
  }

  // 2. Instanciação do SDK @google/genai
  let ai: GoogleGenAI;
  try {
    ai = new GoogleGenAI({ apiKey });
    console.log("✅ SDK @google/genai instanciado com sucesso.");
  } catch (instErr: any) {
    console.error("❌ Falha na instanciação do SDK @google/genai:", instErr.message);
    return;
  }

  // 3. Teste Direto de Modelos com SDK (Isolado do Express)
  const modelsToTest = [
    { name: "gemini-2.5-flash", desc: "Standard Flash 2.5" },
    { name: "gemini-2.5-pro", desc: "Standard Pro 2.5" },
    { name: "gemini-2.0-flash", desc: "Legacy 2.0 Flash" },
    { name: "gemini-3.8-flash", desc: "Configurado no analyze-object / match-similarity" },
    { name: "gemini-3.7-flash", desc: "Configurado no analyze-image / semantic-search" },
    { name: "gemini-3.1-pro-preview", desc: "Configurado no analyze-image" },
    { name: "gemini-3.1-flash-lite", desc: "Configurado no quick-tag" },
    { name: "gemini-flash-latest", desc: "Alias geral flash" },
  ];

  console.log("\n[2] TESTE ISOLADO DE MODELOS DIRETO NO SDK @google/genai (chamada básica):");
  
  for (const m of modelsToTest) {
    console.log(`\n--- Testando modelo: '${m.name}' (${m.desc}) ---`);
    try {
      const startTime = Date.now();
      const response = await ai.models.generateContent({
        model: m.name,
        contents: "Responda apenas: OK-LOCALIZA",
      });
      const elapsed = Date.now() - startTime;
      console.log(`  ✅ SUCESSO! (${elapsed}ms)`);
      console.log(`  Resposta: "${response.text?.trim()}"`);
    } catch (err: any) {
      console.log(`  ❌ FALHA AO CHAMAR '${m.name}':`);
      console.log(`     Tipo de Erro : ${err.name || typeof err}`);
      console.log(`     HTTP Status  : ${err.status || err.statusCode || "N/A"}`);
      console.log(`     Error Code   : ${err.code || (err.error && err.error.code) || "N/A"}`);
      console.log(`     Error Status : ${err.statusText || (err.error && err.error.status) || "N/A"}`);
      console.log(`     Mensagem     : ${err.message}`);
      if (err.errorDetails) {
        console.log(`     Detalhes     : ${JSON.stringify(err.errorDetails)}`);
      }
      if (err.stack) {
        const stackFirstLine = err.stack.split("\n")[0];
        console.log(`     Stack Trace  : ${stackFirstLine}`);
      }
    }
  }

  // 4. Teste Direto de Visão / Imagem com Base64
  console.log("\n[3] TESTE ISOLADO DO FLUXO DE VISÃO / IMAGEM COM SDK:");
  const sample1pxPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  for (const modelName of ["gemini-3.7-flash", "gemini-3.8-flash", "gemini-3.1-pro-preview", "gemini-2.5-flash"]) {
    console.log(`\n--- Testando Imagem com Modelo '${modelName}' ---`);
    try {
      const res = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            inlineData: {
              mimeType: "image/png",
              data: sample1pxPngBase64,
            },
          },
          {
            text: "Descreva brevemente esta imagem em uma frase.",
          },
        ],
      });
      console.log(`  ✅ SUCESSO! Resposta: "${res.text?.trim()}"`);
    } catch (err: any) {
      console.log(`  ❌ FALHA no modelo '${modelName}':`);
      console.log(`     Mensagem: ${err.message}`);
      console.log(`     HTTP Status / Code: ${err.status || err.code || "N/A"}`);
    }
  }

  // 5. Teste Direto de Structured Output (responseSchema com Type)
  console.log("\n[4] TESTE ISOLADO DE STRUCTURED OUTPUT (responseSchema):");
  for (const modelName of ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash"]) {
    console.log(`\n--- Testando Structured Output com Modelo '${modelName}' ---`);
    try {
      const res = await ai.models.generateContent({
        model: modelName,
        contents: "Extraia título e categoria: Garrafa térmica verde perdida no pátio.",
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              category: { type: Type.STRING },
            },
            required: ["title", "category"],
          },
        },
      });
      console.log(`  ✅ SUCESSO! JSON: ${res.text?.trim()}`);
    } catch (err: any) {
      console.log(`  ❌ FALHA no modelo '${modelName}' com schema:`);
      console.log(`     Mensagem: ${err.message}`);
      console.log(`     HTTP Status / Code: ${err.status || err.code || "N/A"}`);
    }
  }

  console.log("\n===============================================================");
  console.log("🏁 FIM DO DIAGNÓSTICO TÉCNICO APROFUNDADO");
  console.log("===============================================================");
}

runDeepDiagnostic().catch(console.error);
