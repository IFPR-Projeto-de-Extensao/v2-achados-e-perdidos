#!/usr/bin/env node

const targetUrl = process.argv[2] || "https://ifprivp.vercel.app";

async function runDiagnostics() {
  console.log(`\n====================================================================`);
  console.log(`🔍 DIAGNÓSTICO DE PRODUÇÃO EM: ${targetUrl}`);
  console.log(`====================================================================\n`);

  // 1. Check /api/debug/env
  try {
    console.log(`[1/3] Testando ${targetUrl}/api/debug/env ...`);
    const envRes = await fetch(`${targetUrl}/api/debug/env`);
    console.log(`Status HTTP: ${envRes.status} ${envRes.statusText}`);
    const envData = await envRes.json().catch(() => null);
    console.log("Resposta JSON de variáveis de ambiente:", envData);
  } catch (err) {
    console.log("Erro ao consultar /api/debug/env:", err.message);
  }

  // 2. Check /api/support/send-feedback with valid payload
  try {
    console.log(`\n[2/3] Testando POST ${targetUrl}/api/support/send-feedback com payload válido...`);
    const postRes = await fetch(`${targetUrl}/api/support/send-feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Teste de Diagnóstico",
        email: "diagnostico@ifpr.edu.br",
        category: "FEEDBACK",
        subject: "Verificação de API",
        message: "Teste automatizado executado pelo script de validação.",
        priority: "MEDIA",
        clientDiagnostics: {
          screen: "1920x1080",
          currentPath: "/ajuda",
          online: true,
        },
      }),
    });
    console.log(`Status HTTP: ${postRes.status} ${postRes.statusText}`);
    const postData = await postRes.json().catch(() => null);
    console.log("Resposta JSON:", postData);
  } catch (err) {
    console.log("Erro no POST de feedback:", err.message);
  }

  // 3. Check validation (empty payload)
  try {
    console.log(`\n[3/3] Testando POST ${targetUrl}/api/support/send-feedback com payload vazio...`);
    const emptyRes = await fetch(`${targetUrl}/api/support/send-feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    console.log(`Status HTTP (esperado 400): ${emptyRes.status} ${emptyRes.statusText}`);
    const emptyData = await emptyRes.json().catch(() => null);
    console.log("Resposta JSON:", emptyData);
  } catch (err) {
    console.log("Erro no teste de validação:", err.message);
  }

  console.log(`\n====================================================================\n`);
}

runDiagnostics();
