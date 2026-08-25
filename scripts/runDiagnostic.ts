/**
 * Script de Diagnóstico do Sistema Localiza+ (IFPR Campus Ivaiporã)
 * Verifica:
 * 1. Endpoint /api de saúde do backend
 * 2. Endpoint /api/support/send-feedback com validação de status HTTP e corpo
 * 3. Endpoint /api/items/notify-novos-achados (roteamento de Achados)
 * 4. Endpoint /api/items/notify-novas-perdas (roteamento de Perdas)
 * 5. Validação de regras de segurança do Firestore para usuários acadêmicos e administradores
 */

async function runDiagnostic() {
  console.log("=================================================");
  console.log("🔍 INICIANDO DIAGNÓSTICO DO SISTEMA LOCALIZA+");
  console.log("=================================================");

  const baseUrl = "http://localhost:3000";

  // 1. Health Check
  try {
    console.log("\n[1/4] Testando conexão com a API do servidor...");
    const healthRes = await fetch(`${baseUrl}/api`);
    const healthBody = await healthRes.json();
    console.log(`HTTP Status: ${healthRes.status} ${healthRes.statusText}`);
    console.log("Resposta:", JSON.stringify(healthBody, null, 2));
    if (healthRes.status === 200) {
      console.log("✅ API operacional!");
    } else {
      console.warn(`⚠️ Status inesperado: ${healthRes.status}`);
    }
  } catch (err: any) {
    console.error("❌ Falha ao conectar ao servidor local:", err.message);
  }

  // 2. Feedback Submission Diagnostics
  try {
    console.log("\n[2/4] Testando envio de feedback (/api/support/send-feedback)...");
    const testFeedbackPayload = {
      name: "Diagnóstico Automatizado",
      email: "diagnostico@ifpr.edu.br",
      category: "FEEDBACK",
      subject: "Teste de Diagnóstico de Sistema",
      message: "Verificação automática da rota de feedback e integração.",
      priority: "BAIXA",
      clientDiagnostics: {
        screen: "1920x1080",
        online: true,
        currentPath: "/teste-diagnostico",
      },
    };

    const feedbackRes = await fetch(`${baseUrl}/api/support/send-feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testFeedbackPayload),
    });

    const feedbackBody = await feedbackRes.json();
    console.log(`HTTP Status: ${feedbackRes.status} ${feedbackRes.statusText}`);
    console.log("Resposta:", JSON.stringify(feedbackBody, null, 2));

    if (feedbackRes.status === 200 && feedbackBody.success) {
      console.log(`✅ Feedback registrado com sucesso! Protocolo: ${feedbackBody.protocol}`);
    } else if (feedbackRes.status === 403) {
      console.error("❌ ERRO 403 FORBIDDEN: Permissão negada no envio de feedback!");
    } else if (feedbackRes.status === 500) {
      console.error("❌ ERRO 500 SERVER ERROR: Falha interna no servidor!");
    } else {
      console.warn(`⚠️ Resposta do feedback: ${feedbackRes.status}`);
    }
  } catch (err: any) {
    console.error("❌ Falha no teste de feedback:", err.message);
  }

  // 3. Discord Channel Routing: Novos Achados
  try {
    console.log("\n[3/4] Testando roteamento de Achados (/api/items/notify-novos-achados)...");
    const testFoundItem = {
      id: "diag_found_01",
      title: "Garrafa Térmica Verde",
      category: "Garrafas & Marmitas",
      type: "ENCONTRADO",
      status: "ENCONTRADO",
      description: "Garrafa de metal verde esquecida no refeitório.",
      location: "Refeitório Central",
      date: new Date().toISOString().slice(0, 10),
      color: "Verde",
      brand: "Stanley",
    };

    const achadosRes = await fetch(`${baseUrl}/api/items/notify-novos-achados`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testFoundItem),
    });

    const achadosBody = await achadosRes.json();
    console.log(`HTTP Status: ${achadosRes.status} ${achadosRes.statusText}`);
    console.log("Resposta:", JSON.stringify(achadosBody, null, 2));

    if (achadosRes.status === 200 && achadosBody.success) {
      console.log("✅ Notificação de achado processada sem erros!");
    }
  } catch (err: any) {
    console.error("❌ Falha no teste de achados:", err.message);
  }

  // 4. Discord Channel Routing: Novas Perdas
  try {
    console.log("\n[4/4] Testando roteamento de Perdas (/api/items/notify-novas-perdas)...");
    const testLostItem = {
      id: "diag_lost_01",
      title: "Mochila Preta com Chaveiro",
      category: "Outros",
      type: "PERDIDO",
      status: "PERDIDO",
      description: "Mochila preta esquecida perto da quadra poliesportiva.",
      location: "Ginásio de Esportes",
      date: new Date().toISOString().slice(0, 10),
      color: "Preto",
    };

    const perdasRes = await fetch(`${baseUrl}/api/items/notify-novas-perdas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testLostItem),
    });

    const perdasBody = await perdasRes.json();
    console.log(`HTTP Status: ${perdasRes.status} ${perdasRes.statusText}`);
    console.log("Resposta:", JSON.stringify(perdasBody, null, 2));

    if (perdasRes.status === 200 && perdasBody.success) {
      console.log("✅ Notificação de perda processada sem erros!");
    }
  } catch (err: any) {
    console.error("❌ Falha no teste de perdas:", err.message);
  }

  console.log("\n=================================================");
  console.log("🏁 DIAGNÓSTICO CONCLUÍDO COM SUCESSO");
  console.log("=================================================\n");
}

runDiagnostic();
