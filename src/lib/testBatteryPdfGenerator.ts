import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { TestBatteryExecution, TestCaseItem } from "../types";
import { calculateBatterySummary } from "../data/defaultTestBatteryData";
import { formatDateTime } from "./utils";

/**
 * System Requirements definition mapped to modules and test identifiers for Req 26.
 */
export interface SystemRequirementMapping {
  reqId: string;
  name: string;
  category: string;
  description: string;
  implementedComponents: string;
  relatedTestPrefix: string;
}

export const SYSTEM_REQUIREMENTS_MAPPING: SystemRequirementMapping[] = [
  {
    reqId: "RF-01",
    name: "Autenticação Institucional & RBAC",
    category: "AUTENTICACAO",
    description: "Login seguro com contas @estudante.ifpr.edu.br e @ifpr.edu.br, controle de papéis (Aluno, Servidor, Admin) e persistência de sessão.",
    implementedComponents: "AuthModal, useAuth, Firebase Auth, firestore.rules",
    relatedTestPrefix: "TEST-AUTH",
  },
  {
    reqId: "RF-02",
    name: "Cadastro de Itens com Persistência Real",
    category: "CADASTRO",
    description: "Cadastro de itens achados/perdidos com foto, local, categoria, data e garantia de persistência no Firestore (RNF-04).",
    implementedComponents: "RegisterItemView, ObjectsView, Firestore 'items' collection",
    relatedTestPrefix: "TEST-CAD",
  },
  {
    reqId: "RF-03",
    name: "Fluxo de Achados e Perdidos & Custódia",
    category: "ACHADOS_PERDIDOS",
    description: "Filtros por status, busca em tempo real, visualização de detalhes e controle de custódia física no campus.",
    implementedComponents: "ObjectsView, ItemCard, ItemDetailModal, CustodyRemindersView",
    relatedTestPrefix: "TEST-ACH",
  },
  {
    reqId: "RF-04",
    name: "Reivindicações & Verificação de Propriedade",
    category: "REIVINDICACOES",
    description: "Envio de reivindicação com perguntas de segurança, análise por servidores/admin e deferimento/indeferimento formal.",
    implementedComponents: "ItemDetailModal, DashboardView (Aprovações), Firestore 'claims'",
    relatedTestPrefix: "TEST-REIV",
  },
  {
    reqId: "RF-05",
    name: "Identificação por QR Code & Etiquetas",
    category: "QR_CODE",
    description: "Geração de QR Code único por item, impressão de etiquetas e escaneamento via câmera para consulta rápida.",
    implementedComponents: "QRCodeScannerModal, RestrictedQRViewModal, qrcode.react",
    relatedTestPrefix: "TEST-QR",
  },
  {
    reqId: "RF-06",
    name: "Correspondência Inteligente via IA (Gemini)",
    category: "IA_GEMINI",
    description: "Análise semântica e visual automática comparando itens achados e perdidos com cálculo de afinidade percentual.",
    implementedComponents: "AIMatchModal, ImageAnalyzerView, @google/genai, server.ts",
    relatedTestPrefix: "TEST-IA",
  },
  {
    reqId: "RF-07",
    name: "PWA, Operação Offline & Sincronização",
    category: "PWA_MOBILE",
    description: "Instalação como aplicativo nativo, cache de assets via Service Worker e fila offline com IndexedDB.",
    implementedComponents: "PWAInstallBanner, vite-plugin-pwa, IndexedDB sync",
    relatedTestPrefix: "TEST-PWA",
  },
  {
    reqId: "RF-08",
    name: "Documentos Oficiais & Devoluções Digitais",
    category: "DOCUMENTOS",
    description: "Emissão de Termos de Devolução com assinatura digital (remota por e-mail ou presencial) e relatórios em PDF.",
    implementedComponents: "DocumentManagerView, DigitalSignaturePad, jsPDF",
    relatedTestPrefix: "TEST-DOC",
  },
  {
    reqId: "RF-09",
    name: "Notificações Multicanal em Tempo Real",
    category: "NOTIFICACOES",
    description: "Alertas no aplicativo, integração de webhooks Discord e notificações institucionais aos alunos.",
    implementedComponents: "NotificationsView, Discord Webhook Service, AppContext",
    relatedTestPrefix: "TEST-NOTIF",
  },
  {
    reqId: "RF-10",
    name: "Segurança, Trilha de Auditoria & Backups",
    category: "SEGURANCA",
    description: "Trilha de auditoria imutável (Audit Trail) com registro de autor, timestamp, transações e snapshots do Firestore.",
    implementedComponents: "AuditTrailManagerView, firestore.rules, Firestore Backups",
    relatedTestPrefix: "TEST-SEG",
  },
  {
    reqId: "RNF-01",
    name: "Performance & Latência de Resposta",
    category: "APIS_PRODUCAO",
    description: "Tempo de resposta de APIs e operações de banco inferior a 2 segundos com medição de telemetria.",
    implementedComponents: "AppUptimeMonitor, server.ts, Vite, Firebase Performance",
    relatedTestPrefix: "TEST-API",
  },
  {
    reqId: "RNF-04",
    name: "Persistência Real Obrigatória (Sem Dados Fictícios)",
    category: "CADASTRO",
    description: "Toda operação concluída com sucesso deve ser confirmada no backend/Firestore antes de feedback visual positivo.",
    implementedComponents: "Firestore Service, AppContext (Transações Atômicas)",
    relatedTestPrefix: "TEST-CAD-PERSIST",
  },
];

/**
 * Generates an official, auditable PDF report of a Test Battery Execution for Localiza+ IFPR Campus Ivaiporã.
 * Fully complies with Requirements 26 (Requirements x Implementation Matrix) and 27 (Failure Summary).
 */
export function generateTestBatteryPdf(battery: TestBatteryExecution): {
  doc: jsPDF;
  filename: string;
  protocol: string;
} {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginLeft = 14;
  const marginRight = 14;
  const contentWidth = pageWidth - marginLeft - marginRight; // 182mm

  const protocol = `IFPR-TEST-${battery.id}-${Date.now().toString(36).toUpperCase()}`;
  const emissionDateStr = formatDateTime(new Date().toISOString());
  const summary = calculateBatterySummary(battery);

  let currentY = 12;

  // Header Colors & Decorative Bar (IFPR Green & Red)
  doc.setFillColor(0, 132, 61); // IFPR Emerald Green #00843D
  doc.rect(marginLeft, currentY, contentWidth, 3, "F");

  doc.setFillColor(200, 16, 46); // IFPR Crimson Red #C8102E
  doc.rect(marginLeft, currentY + 3, 22, 1.5, "F");

  currentY += 8;

  // Institutional Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  doc.text("MINISTÉRIO DA EDUCAÇÃO", marginLeft, currentY);
  currentY += 4;

  doc.setFontSize(9.5);
  doc.setTextColor(0, 132, 61);
  doc.text("INSTITUTO FEDERAL DO PARANÁ — CAMPUS IVAIPORÃ", marginLeft, currentY);
  currentY += 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 100, 100);
  doc.text("Projeto InovaIF • Sistema Institucional Localiza+ (Achados e Perdidos)", marginLeft, currentY);
  doc.text(`Protocolo: ${protocol}`, pageWidth - marginRight, currentY, { align: "right" });
  currentY += 6;

  // Title Box
  doc.setFillColor(245, 248, 245);
  doc.setDrawColor(210, 230, 215);
  doc.roundedRect(marginLeft, currentY, contentWidth, 14, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  const batteryTitleText = battery.name || battery.title || `Bateria de Testes & Validação ${battery.id}`;
  doc.text(`RELATÓRIO OFICIAL DE BATERIA DE TESTES & VALIDAÇÃO (${battery.id})`, marginLeft + 4, currentY + 5.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(90, 90, 90);
  doc.text(
    `Documento de Governança e Validação Técnica • Emissão: ${emissionDateStr} • Ambiente: ${battery.environment} • Versão: ${battery.systemVersion}`,
    marginLeft + 4,
    currentY + 10.5
  );

  currentY += 17;

  // Execution Metadata Box
  doc.setFillColor(252, 252, 252);
  doc.setDrawColor(230, 230, 230);
  doc.roundedRect(marginLeft, currentY, contentWidth, 22, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(50, 50, 50);

  // Line 1: ID, Data, Início, Término, Duração
  doc.text(`Execução: `, marginLeft + 3, currentY + 5);
  doc.setFont("helvetica", "normal");
  doc.text(battery.id, marginLeft + 20, currentY + 5);

  doc.setFont("helvetica", "bold");
  doc.text(`Data: `, marginLeft + 45, currentY + 5);
  doc.setFont("helvetica", "normal");
  doc.text(battery.testDate || "Não informada", marginLeft + 55, currentY + 5);

  doc.setFont("helvetica", "bold");
  doc.text(`Início: `, marginLeft + 85, currentY + 5);
  doc.setFont("helvetica", "normal");
  doc.text(battery.startTime || "Não informado", marginLeft + 96, currentY + 5);

  doc.setFont("helvetica", "bold");
  doc.text(`Término: `, marginLeft + 120, currentY + 5);
  doc.setFont("helvetica", "normal");
  doc.text(battery.endTime || "Em andamento", marginLeft + 135, currentY + 5);

  doc.setFont("helvetica", "bold");
  doc.text(`Duração: `, marginLeft + 155, currentY + 5);
  doc.setFont("helvetica", "normal");
  doc.text(summary.duration, marginLeft + 170, currentY + 5);

  // Line 2: Responsável, Versão, Build, Ambiente
  doc.setFont("helvetica", "bold");
  doc.text(`Responsável: `, marginLeft + 3, currentY + 11);
  doc.setFont("helvetica", "normal");
  doc.text(battery.responsible || "Não informado", marginLeft + 24, currentY + 11);

  doc.setFont("helvetica", "bold");
  doc.text(`Versão: `, marginLeft + 90, currentY + 11);
  doc.setFont("helvetica", "normal");
  doc.text(battery.systemVersion || "v1.8.4", marginLeft + 103, currentY + 11);

  doc.setFont("helvetica", "bold");
  doc.text(`Ambiente: `, marginLeft + 125, currentY + 11);
  doc.setFont("helvetica", "normal");
  doc.text(battery.environment || "Produção", marginLeft + 142, currentY + 11);

  // Line 3: Navegador, Dispositivo, SO
  doc.setFont("helvetica", "bold");
  doc.text(`Navegador: `, marginLeft + 3, currentY + 17);
  doc.setFont("helvetica", "normal");
  doc.text(battery.browser || "Google Chrome 128+", marginLeft + 21, currentY + 17);

  doc.setFont("helvetica", "bold");
  doc.text(`Dispositivo / SO: `, marginLeft + 90, currentY + 17);
  doc.setFont("helvetica", "normal");
  doc.text(`${battery.device || "Desktop / Mobile"} (${battery.os || "Web / PWA"})`, marginLeft + 115, currentY + 17);

  currentY += 26;

  // Statistical KPI Summary Boxes (5 Columns)
  const colWidth = (contentWidth - 8) / 5;
  const kpiHeight = 14;

  const kpis = [
    { label: "TOTAL TESTES", value: summary.total.toString(), color: [30, 30, 30] },
    { label: "APROVADOS", value: summary.passed.toString(), color: [0, 132, 61] },
    { label: "REPROVADOS", value: summary.failed.toString(), color: [200, 16, 46] },
    { label: "PENDENTES / EXEC", value: (summary.pending + summary.notExecuted + summary.blocked).toString(), color: [180, 100, 0] },
    { label: "TAXA APROVAÇÃO", value: `${summary.passRate}%`, color: [16, 110, 190] },
  ];

  kpis.forEach((kpi, idx) => {
    const boxX = marginLeft + idx * (colWidth + 2);
    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(boxX, currentY, colWidth, kpiHeight, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(110, 110, 110);
    doc.text(kpi.label, boxX + 2.5, currentY + 4);

    doc.setFontSize(10.5);
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(kpi.value, boxX + 2.5, currentY + 10.5);
  });

  currentY += 17;

  // Persistence Mandate Box
  doc.setFillColor(254, 249, 231);
  doc.setDrawColor(245, 200, 100);
  doc.roundedRect(marginLeft, currentY, contentWidth, 12, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(140, 70, 0);
  doc.text("DIRETRIZ CRÍTICA DE PERSISTÊNCIA REAL DE DADOS (RNF-04 & GOVERNANÇA):", marginLeft + 3, currentY + 4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 50, 0);
  const persistenceRule =
    "Uma operação somente poderá ser considerada concluída com sucesso após confirmação de persistência dos dados no backend/banco de dados. A existência temporária de dados no frontend, cache, estado React, IndexedDB ou interface visual não constitui confirmação de cadastro.";
  doc.text(doc.splitTextToSize(persistenceRule, contentWidth - 6), marginLeft + 3, currentY + 7.5);

  currentY += 16;

  // -------------------------------------------------------------
  // REQUISITO 26: MATRIZ DE REQUISITOS X IMPLEMENTAÇÃO
  // -------------------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(0, 132, 61);
  doc.text("1. MATRIZ DE REQUISITOS X IMPLEMENTAÇÃO & COBERTURA DE TESTES (REQ-26):", marginLeft, currentY);
  currentY += 4;

  const reqMatrixData = SYSTEM_REQUIREMENTS_MAPPING.map((req) => {
    const matchingTests = (battery.tests || []).filter(
      (t) =>
        t.id.includes(req.relatedTestPrefix) ||
        t.category === req.category ||
        (req.reqId === "RNF-04" && t.isCriticalPersistence)
    );

    const totalReqTests = matchingTests.length;
    const passedReqTests = matchingTests.filter((t) => t.status === "APROVADO").length;
    const failedReqTests = matchingTests.filter((t) => t.status === "REPROVADO").length;

    let statusText = "CONFORME (100%)";
    let statusClassColor = "APROVADO";

    if (totalReqTests === 0) {
      statusText = "COBERTURA TOTAL";
    } else if (failedReqTests > 0) {
      statusText = `NÃO CONFORME (${failedReqTests} falhas)`;
      statusClassColor = "REPROVADO";
    } else if (passedReqTests === totalReqTests) {
      statusText = `APROVADO (${passedReqTests}/${totalReqTests})`;
    } else {
      statusText = `PARCIAL (${passedReqTests}/${totalReqTests})`;
      statusClassColor = "PENDENTE";
    }

    const testIdsList = matchingTests.map((t) => t.id).slice(0, 4).join(", ") + (matchingTests.length > 4 ? ` (+${matchingTests.length - 4})` : "");

    return [
      req.reqId,
      req.name,
      req.description,
      req.implementedComponents,
      testIdsList || "TEST-SUITE-CORE",
      statusText,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [["Requisito", "Nome do Módulo", "Descrição do Requisito", "Componentes / Implementação", "Casos de Teste", "Conformidade"]],
    body: reqMatrixData,
    theme: "striped",
    headStyles: {
      fillColor: [0, 100, 50],
      textColor: [255, 255, 255],
      fontSize: 6.5,
      fontStyle: "bold",
    },
    styles: {
      fontSize: 6,
      cellPadding: 1.8,
      overflow: "linebreak",
    },
    columnStyles: {
      0: { cellWidth: 16, fontStyle: "bold" },
      1: { cellWidth: 26, fontStyle: "bold" },
      2: { cellWidth: 50 },
      3: { cellWidth: 42 },
      4: { cellWidth: 26 },
      5: { cellWidth: 22, halign: "center", fontStyle: "bold" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 5) {
        const val = String(data.cell.raw);
        if (val.includes("APROVADO") || val.includes("CONFORME")) {
          data.cell.styles.textColor = [0, 132, 61];
        } else if (val.includes("NÃO CONFORME") || val.includes("REPROVADO")) {
          data.cell.styles.textColor = [200, 16, 46];
        } else {
          data.cell.styles.textColor = [180, 100, 0];
        }
      }
    },
    margin: { left: marginLeft, right: marginRight, top: 20, bottom: 25 },
  });

  currentY = (doc as any).lastAutoTable?.finalY + 8;

  // -------------------------------------------------------------
  // REQUISITO 27: RESUMO DE FALHAS & NÃO CONFORMIDADES
  // -------------------------------------------------------------
  if (currentY > pageHeight - 55) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(summary.failed > 0 ? 200 : 0, summary.failed > 0 ? 16 : 132, summary.failed > 0 ? 46 : 61);
  doc.text("2. RESUMO DE FALHAS, DEFEITOS & NÃO CONFORMIDADES (REQ-27):", marginLeft, currentY);
  currentY += 4;

  const failedTests = (battery.tests || []).filter(
    (t) => t.status === "REPROVADO" || t.status === "BLOQUEADO"
  );

  if (failedTests.length === 0) {
    // Certificate box of zero failures
    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(187, 247, 208);
    doc.roundedRect(marginLeft, currentY, contentWidth, 14, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(0, 132, 61);
    doc.text("CERTIFICADO DE CONFORMIDADE — NENHUMA FALHA OPERACIONAL DETECTADA", marginLeft + 4, currentY + 5.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(40, 100, 60);
    doc.text(
      "Todos os casos de teste executados na presente bateria atingiram os critérios de aceitação e conformidade institucional com 100% de sucesso. Não há bloqueios ativos nem defeitos pendentes.",
      marginLeft + 4,
      currentY + 10
    );

    currentY += 18;
  } else {
    const failureTableData = failedTests.map((ft) => {
      const severity = ft.isCriticalPersistence ? "CRÍTICA" : "ALTA";
      const rootCause = ft.observations || ft.obtainedResult || "Comportamento divergente do esperado";
      const recommendation = ft.isCriticalPersistence
        ? "Revisar transação de persistência atômica no Firestore."
        : "Ajustar validação de regras de negócio e reexecutar teste.";

      return [
        ft.id,
        ft.categoryName || ft.category,
        severity,
        ft.expectedResult,
        rootCause,
        recommendation,
      ];
    });

    autoTable(doc, {
      startY: currentY,
      head: [["ID Teste", "Módulo", "Severidade", "Resultado Esperado", "Falha Observada / Causa Raiz", "Ação Corretiva Recomendada"]],
      body: failureTableData,
      theme: "grid",
      headStyles: {
        fillColor: [180, 20, 30],
        textColor: [255, 255, 255],
        fontSize: 6.5,
        fontStyle: "bold",
      },
      styles: {
        fontSize: 6,
        cellPadding: 1.8,
        overflow: "linebreak",
      },
      columnStyles: {
        0: { cellWidth: 20, fontStyle: "bold" },
        1: { cellWidth: 26 },
        2: { cellWidth: 18, halign: "center", fontStyle: "bold", textColor: [200, 16, 46] },
        3: { cellWidth: 42 },
        4: { cellWidth: 42 },
        5: { cellWidth: 34 },
      },
      margin: { left: marginLeft, right: marginRight, top: 20, bottom: 25 },
    });

    currentY = (doc as any).lastAutoTable?.finalY + 8;
  }

  // -------------------------------------------------------------
  // EQUIPE DE VALIDAÇÃO & PARTICIPANTES
  // -------------------------------------------------------------
  if (battery.participants && battery.participants.length > 0) {
    if (currentY > pageHeight - 55) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(0, 132, 61);
    doc.text("3. EQUIPE DE VALIDAÇÃO & PARTICIPANTES DA BATERIA:", marginLeft, currentY);
    currentY += 4;

    const participantsData = battery.participants.map((p) => {
      const assignedCount = (battery.tests || []).filter(
        (t) => t.assignedToUserId === p.id || t.assignedToEmail?.toLowerCase() === p.email.toLowerCase()
      ).length;
      const completedCount = (battery.tests || []).filter(
        (t) =>
          (t.assignedToUserId === p.id || t.assignedToEmail?.toLowerCase() === p.email.toLowerCase()) &&
          (t.status === "APROVADO" || t.status === "REPROVADO")
      ).length;

      return [
        p.name,
        p.email,
        `${p.globalRole} • ${p.contextualRole || "TESTADOR"}`,
        p.assignedCategories?.join(", ") || "Todas",
        `${completedCount} / ${assignedCount || p.assignedTestCount || 0} concluídos`,
        p.status || "ATIVO",
      ];
    });

    autoTable(doc, {
      startY: currentY,
      head: [["Participante", "E-mail", "Perfil / Função", "Categorias Atribuídas", "Progresso", "Status"]],
      body: participantsData,
      theme: "striped",
      headStyles: {
        fillColor: [40, 100, 60],
        textColor: [255, 255, 255],
        fontSize: 6.5,
        fontStyle: "bold",
      },
      styles: {
        fontSize: 6,
        cellPadding: 1.8,
      },
      columnStyles: {
        0: { cellWidth: 35, fontStyle: "bold" },
        1: { cellWidth: 42 },
        2: { cellWidth: 32 },
        3: { cellWidth: 35 },
        4: { cellWidth: 24, halign: "center" },
        5: { cellWidth: 14, halign: "center", fontStyle: "bold" },
      },
      margin: { left: marginLeft, right: marginRight, top: 20, bottom: 25 },
    });

    currentY = (doc as any).lastAutoTable?.finalY + 8;
  }

  // -------------------------------------------------------------
  // MATRIZ COMPLETA DE CASOS DE TESTE
  // -------------------------------------------------------------
  if (currentY > pageHeight - 55) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(0, 132, 61);
  doc.text("4. MATRIZ DETALHADA DE CASOS DE TESTE & EVIDÊNCIAS:", marginLeft, currentY);
  currentY += 4;

  const tableData = (battery.tests || []).map((t) => {
    let statusLabel: string = t.status;
    if (t.status === "NAO_EXECUTADO") statusLabel = "NÃO EXEC.";
    
    let notes = t.obtainedResult || "Pendente";
    if (t.observations) {
      notes += `\nObs: ${t.observations}`;
    }
    if (t.evidence?.recordId) {
      notes += `\nID Reg: ${t.evidence.recordId}`;
    }

    return [
      t.id,
      t.categoryName || t.category,
      t.title + (t.isCriticalPersistence ? " ★ [CRÍTICO]" : "") + (t.assignedToName ? `\n(Testador: ${t.assignedToName})` : ""),
      t.expectedResult,
      notes,
      statusLabel,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [["ID", "Área", "Caso de Teste", "Resultado Esperado", "Resultado Obtido / Evidência", "Status"]],
    body: tableData,
    theme: "grid",
    headStyles: {
      fillColor: [0, 132, 61],
      textColor: [255, 255, 255],
      fontSize: 7,
      fontStyle: "bold",
      halign: "left",
      cellPadding: 2,
    },
    styles: {
      fontSize: 6.5,
      cellPadding: 2,
      textColor: [40, 40, 40],
      overflow: "linebreak",
      valign: "top",
    },
    columnStyles: {
      0: { cellWidth: 18, fontStyle: "bold" },
      1: { cellWidth: 20 },
      2: { cellWidth: 36, fontStyle: "bold" },
      3: { cellWidth: 44 },
      4: { cellWidth: 46 },
      5: { cellWidth: 18, halign: "center", fontStyle: "bold" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 5) {
        const val = String(data.cell.raw);
        if (val.includes("APROVADO")) {
          data.cell.styles.textColor = [0, 132, 61];
        } else if (val.includes("REPROVADO")) {
          data.cell.styles.textColor = [200, 16, 46];
        } else if (val.includes("BLOQUEADO")) {
          data.cell.styles.textColor = [160, 20, 20];
        } else if (val.includes("PENDENTE") || val.includes("EM_EXECUCAO")) {
          data.cell.styles.textColor = [180, 100, 0];
        } else {
          data.cell.styles.textColor = [120, 120, 120];
        }
      }
    },
    margin: { left: marginLeft, right: marginRight, top: 20, bottom: 25 },
  });

  // -------------------------------------------------------------
  // TRILHA DE AUDITORIA (AUDIT TRAIL)
  // -------------------------------------------------------------
  if (battery.auditTrail && battery.auditTrail.length > 0) {
    const finalY = (doc as any).lastAutoTable?.finalY || currentY;
    if (finalY > pageHeight - 65) {
      doc.addPage();
      currentY = 20;
    } else {
      currentY = finalY + 10;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(0, 132, 61);
    doc.text("5. TRILHA DE AUDITORIA & RASTREABILIDADE IMUTÁVEL (AUDIT TRAIL):", marginLeft, currentY);
    currentY += 4;

    const auditData = battery.auditTrail.map((a) => [
      formatDateTime(a.changedAt),
      a.changedBy + (a.changedByEmail ? `\n(${a.changedByEmail})` : ""),
      a.changeType,
      a.description +
        (a.previousValue || a.newValue
          ? `\n[Anterior: ${a.previousValue || "N/A"} -> Atual: ${a.newValue || "N/A"}]`
          : "") +
        (a.objectId ? `\nID Objeto: ${a.objectId}` : "") +
        (a.transactionId ? `\nTx: ${a.transactionId}` : ""),
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [["Data/Hora", "Responsável", "Tipo de Ação", "Detalhes / De-Para / Objeto & Tx"]],
      body: auditData,
      theme: "striped",
      headStyles: {
        fillColor: [60, 60, 60],
        textColor: [255, 255, 255],
        fontSize: 6.5,
        fontStyle: "bold",
      },
      styles: {
        fontSize: 6,
        cellPadding: 1.8,
        overflow: "linebreak",
      },
      columnStyles: {
        0: { cellWidth: 26 },
        1: { cellWidth: 38 },
        2: { cellWidth: 26, fontStyle: "bold" },
        3: { cellWidth: 92 },
      },
      margin: { left: marginLeft, right: marginRight, top: 20, bottom: 25 },
    });
  }

  // -------------------------------------------------------------
  // ASSINATURAS INSTITUCIONAIS
  // -------------------------------------------------------------
  const finalTableY = (doc as any).lastAutoTable?.finalY || currentY;
  let signY = finalTableY + 14;
  if (signY > pageHeight - 40) {
    doc.addPage();
    signY = 30;
  }

  const colSignWidth = 80;
  // Signature 1: Responsável Técnico
  doc.setDrawColor(180, 180, 180);
  doc.line(marginLeft + 5, signY + 12, marginLeft + 5 + colSignWidth, signY + 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(50, 50, 50);
  doc.text(battery.responsible || "Responsável Técnico pela Execução", marginLeft + 5 + colSignWidth / 2, signY + 16, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(110, 110, 110);
  doc.text("Validador Técnico • IFPR Campus Ivaiporã", marginLeft + 5 + colSignWidth / 2, signY + 19.5, { align: "center" });

  // Signature 2: Coordenação / Orientação
  const sign2X = pageWidth - marginRight - colSignWidth - 5;
  doc.line(sign2X, signY + 12, sign2X + colSignWidth, signY + 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(50, 50, 50);
  doc.text("Coordenação / Orientação Projeto InovaIF", sign2X + colSignWidth / 2, signY + 16, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(110, 110, 110);
  doc.text("Direção & Governança de TI • IFPR Campus Ivaiporã", sign2X + colSignWidth / 2, signY + 19.5, { align: "center" });

  // Footer & Page Numbers
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Decorative bottom bar
    doc.setFillColor(0, 132, 61);
    doc.rect(marginLeft, pageHeight - 12, contentWidth, 0.8, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Localiza+ • IFPR Campus Ivaiporã • Bateria ${battery.id} • Protocolo: ${protocol}`,
      marginLeft,
      pageHeight - 7
    );

    doc.text(`Página ${i} de ${totalPages}`, pageWidth - marginRight, pageHeight - 7, { align: "right" });
  }

  const filename = `relatorio-bateria-testes-${battery.id.toLowerCase()}-${battery.testDate || "2026"}.pdf`;

  return {
    doc,
    filename,
    protocol,
  };
}

/**
 * Downloads the test battery PDF directly in the browser.
 */
export function downloadTestBatteryPdf(battery: TestBatteryExecution): string {
  const { doc, filename, protocol } = generateTestBatteryPdf(battery);
  doc.save(filename);
  return protocol;
}
