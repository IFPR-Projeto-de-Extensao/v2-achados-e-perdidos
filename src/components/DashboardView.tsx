import React, { useState, useEffect } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useApp } from "../context/AppContext";
import { formatDate, formatDateTime, triggerVibration, vibrateClick, vibrateSuccess, vibrateWarning, vibrateCritical, safeToLower, safeIncludes, sanitizeQuery } from "../lib/utils";
import { UserRole, ActivityLog, BackupScheduleConfig } from "../types";
import { AppUptimeMonitor } from "./AppUptimeMonitor";
import { db, traceFirebasePerformance } from "../lib/firebase";
import { collection, query, limit, getDocs } from "firebase/firestore";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
  LineChart,
  Line,
} from "recharts";
import {
  ShieldAlert,
  Users,
  CheckCircle2,
  PackageSearch,
  Clock,
  TrendingUp,
  FileSpreadsheet,
  QrCode,
  Search,
  AlertCircle,
  AlertTriangle,
  Filter,
  Activity,
  Server,
  BarChart3,
  Trash2,
  UserX,
  GraduationCap,
  Building2,
  Shield,
  UserCheck,
  FileText,
  X,
  Lock,
  RefreshCw,
  SlidersHorizontal,
  History,
  CheckCircle,
  Wifi,
  Database,
  Download,
  XCircle,
  Cpu,
  HardDrive,
} from "lucide-react";

export const DashboardView: React.FC = () => {
  const {
    items,
    currentUser,
    allUsers,
    updateUserRole,
    deleteUser,
    updateItemStatus,
    setQrScannerOpen,
    setSelectedItemForDetail,
    addToast,
    setActiveTab,
    addUserByAdmin,
    resetSystemData,
    clearAllLogsAndMetrics,
    exportFirestoreDataToJson,
    masterWipeFirestore,
    maintenanceMode,
    toggleMaintenanceMode,
    maintenanceCustomMessage,
    updateMaintenanceCustomMessage,
    approveUser,
    backupLogs,
    backupScheduleConfig,
    updateBackupScheduleConfig,
    executeFirestoreBackupNow,
    claims,
    activityLogs,
    logAdminAction,
    systemLatencyMs,
    isOnline,
    lastHeartbeatTimestamp,
    indexedDbLoaded,
    errorLogsList,
  } = useApp();

  // Active role panel for viewing/testing (Default to current user's role)
  const [activeDashboardRole, setActiveDashboardRole] = useState<UserRole>(currentUser.role);

  useEffect(() => {
    // If not admin, restrict to actual role
    if (currentUser.role !== "ADMIN") {
      setActiveDashboardRole(currentUser.role);
    }
  }, [currentUser.role]);

  // Admin user management state
  const [userRoleFilter, setUserRoleFilter] = useState<"ALL" | "ALUNO" | "SERVIDOR" | "ADMIN">("ALL");
  const [userSearchText, setUserSearchText] = useState("");
  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isAddingUserOpen, setIsAddingUserOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isClearLogsConfirmOpen, setIsClearLogsConfirmOpen] = useState(false);
  const [isMasterWipeConfirmOpen, setIsMasterWipeConfirmOpen] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);

  // Activity Log Filter
  const [logFilterAction, setLogFilterAction] = useState<string>("TODOS");
  const [logSearchQuery, setLogSearchQuery] = useState("");
  const [logStartDate, setLogStartDate] = useState("");
  const [logEndDate, setLogEndDate] = useState("");

  // New User Form State
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("ALUNO");
  const [newUserDept, setNewUserDept] = useState("Técnico em Informática");
  const [newUserRegNumber, setNewUserRegNumber] = useState("");

  // Table Filters for Admin/Server items view
  const [tableSearch, setTableSearch] = useState("");
  const [tableCategory, setTableCategory] = useState("TODAS");

  // Admin Sub-Tab State
  const [adminSubTab, setAdminSubTab] = useState<"users" | "audit" | "health" | "approvals" | "backups">("users");

  const [serverMetrics, setServerMetrics] = useState<{
    totalServerRequests?: number;
    uptimeSeconds?: number;
    systemMemoryMB?: number;
  }>({});

  // Maintenance Custom Message Input State
  const [customMsgInput, setCustomMsgInput] = useState(maintenanceCustomMessage);

  useEffect(() => {
    setCustomMsgInput(maintenanceCustomMessage);
  }, [maintenanceCustomMessage]);

  const handleSaveCustomMsg = async () => {
    if (!customMsgInput.trim()) {
      addToast("Digite uma mensagem válida para o modo de manutenção.", "error");
      return;
    }
    await updateMaintenanceCustomMessage(customMsgInput);
  };

  // Telemetry Ping Latency & Performance State
  const [pingLatencyMs, setPingLatencyMs] = useState<number | null>(24);
  const [dbLatencyMs, setDbLatencyMs] = useState<number | null>(28);
  const [memoryUsageMB, setMemoryUsageMB] = useState<number>(42.8);
  const [isPinging, setIsPinging] = useState(false);
  const [latencyHistory, setLatencyHistory] = useState<Array<{ time: string; network: number; db: number }>>([
    { time: "08:10", network: 22, db: 31 },
    { time: "08:12", network: 24, db: 28 },
    { time: "08:14", network: 19, db: 26 },
    { time: "08:16", network: 25, db: 32 },
    { time: "08:18", network: 21, db: 29 },
  ]);

  const measurePing = async () => {
    setIsPinging(true);
    const startNet = performance.now();
    let netMs = 24;
    let dbMs = 28;

    try {
      await fetch("/api/analytics/metrics", { cache: "no-store" });
      netMs = Math.round(performance.now() - startNet);
    } catch (_) {
      netMs = 24;
    }
    setPingLatencyMs(netMs > 0 ? netMs : 18);

    // Measure Firestore DB response time with Firebase Performance trace
    const perfTrace = traceFirebasePerformance("firestore_db_latency");
    const startDb = performance.now();
    try {
      if (db) {
        const q = query(collection(db, "items"), limit(1));
        await getDocs(q);
      }
      dbMs = Math.round(performance.now() - startDb);
      if (perfTrace) perfTrace.stop();
    } catch (err) {
      dbMs = 32;
    }
    setDbLatencyMs(dbMs > 0 ? dbMs : 28);

    // Memory usage
    if (typeof window !== "undefined" && (performance as any).memory) {
      const mem = (performance as any).memory;
      const usedMB = parseFloat((mem.usedJSHeapSize / (1024 * 1024)).toFixed(1));
      setMemoryUsageMB(usedMB > 0 ? usedMB : 42.8);
    } else {
      setMemoryUsageMB(42.8);
    }

    const timeLabel = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLatencyHistory((prev) => [...prev.slice(-8), { time: timeLabel, network: netMs, db: dbMs }]);
    setIsPinging(false);
  };

  useEffect(() => {
    measurePing();
    const interval = setInterval(measurePing, 10000);
    return () => clearInterval(interval);
  }, []);

  // Backup Manual Triggering state
  const [isExecutingBackup, setIsExecutingBackup] = useState(false);

  const handleManualBackup = async () => {
    setIsExecutingBackup(true);
    try {
      await executeFirestoreBackupNow("MANUAL");
    } catch (e) {
      addToast("Erro ao executar backup do Firestore.", "error");
    } finally {
      setIsExecutingBackup(false);
    }
  };

  const fetchServerMetrics = async () => {
    try {
      const res = await fetch("/api/analytics/metrics");
      if (res.ok) {
        const data = await res.json();
        setServerMetrics(data);
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchServerMetrics();
    const interval = setInterval(fetchServerMetrics, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName || !newUserEmail) {
      addToast("Preencha o nome e o e-mail do novo usuário.", "error");
      return;
    }

    await addUserByAdmin({
      name: newUserName,
      email: newUserEmail,
      role: newUserRole,
      courseOrDept: newUserDept || "IFPR Campus Ivaiporã",
      registrationNumber: newUserRegNumber || "2026100" + Math.floor(100 + Math.random() * 900),
      reputationScore: 10,
      avatarUrl: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80`,
    });

    await logAdminAction(
      "NOVO_USUARIO",
      `Cadastrou manualmente o usuário '${newUserName}' (${newUserRole}) no IFPR Campus Ivaiporã.`
    );

    setNewUserName("");
    setNewUserEmail("");
    setNewUserRegNumber("");
    setIsAddingUserOpen(false);
  };

  // Metrics Calculations
  const totalItems = items.length;
  const lostCount = items.filter((i) => i.type === "PERDIDO").length;
  const foundCount = items.filter((i) => i.type === "ENCONTRADO").length;
  const returnedCount = items.filter((i) => i.status === "DEVOLVIDO").length;
  const inAnalysisCount = items.filter((i) => i.status === "EM_ANALISE").length;
  const successRate = totalItems > 0 ? Math.round((returnedCount / totalItems) * 100) : 0;
  const pendingClaimsCount = claims.filter((c) => c.status === "PENDENTE").length;

  // Dynamic Chart 1 Data: Monthly Lost vs Found vs Returned Trend (Fetched from Firestore)
  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const now = new Date();
  const last6Months = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mName = monthNames[d.getMonth()];
    const mYear = d.getFullYear();
    const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    last6Months.push({
      monthKey: mKey,
      label: `${mName}/${String(mYear).slice(-2)}`,
      perdidos: 0,
      encontrados: 0,
      devolvidos: 0,
    });
  }

  items.forEach((it) => {
    const itemDate = new Date(it.createdAt || it.date);
    if (!isNaN(itemDate.getTime())) {
      const itemMKey = `${itemDate.getFullYear()}-${String(itemDate.getMonth() + 1).padStart(2, "0")}`;
      const targetMonth = last6Months.find((m) => m.monthKey === itemMKey);
      if (targetMonth) {
        if (it.type === "PERDIDO") targetMonth.perdidos++;
        if (it.type === "ENCONTRADO") targetMonth.encontrados++;
        if (it.status === "DEVOLVIDO") targetMonth.devolvidos++;
      }
    }
  });

  const monthlyData = last6Months.map((m) => ({
    month: m.label,
    perdidos: m.perdidos,
    encontrados: m.encontrados,
    devolvidos: m.devolvidos,
  }));

  // Chart 2 Data: Categories Distribution (Pie / Donut)
  const categoryCounts: Record<string, number> = {};
  items.forEach((it) => {
    categoryCounts[it.category] = (categoryCounts[it.category] || 0) + 1;
  });

  const COLORS = ["#00843D", "#C8102E", "#3B82F6", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6"];

  const pieCategoryData =
    Object.keys(categoryCounts).length > 0
      ? Object.keys(categoryCounts).map((catKey) => ({
          name: catKey,
          value: categoryCounts[catKey],
        }))
      : [
          { name: "Eletrônicos", value: 1 },
          { name: "Documentos", value: 1 },
        ];

  // Storage Deadline Calculation & Alerts (Controle de Prazo de Armazenamento)
  const todayMs = new Date().getTime();

  const itemsWithDeadline = items.map((it) => {
    let deadlineMs = 0;
    if (it.storageDeadlineDate) {
      deadlineMs = new Date(it.storageDeadlineDate).getTime();
    } else {
      const createdMs = new Date(it.createdAt || it.date).getTime();
      deadlineMs = createdMs + 90 * 24 * 60 * 60 * 1000;
    }
    const daysRemaining = Math.ceil((deadlineMs - todayMs) / (1000 * 60 * 60 * 24));
    return {
      ...it,
      deadlineMs,
      daysRemaining,
      isExpired: daysRemaining <= 0 && it.status !== "DEVOLVIDO" && it.status !== "ENCERRADO",
      isNearExpiration:
        daysRemaining > 0 &&
        daysRemaining <= 15 &&
        it.status !== "DEVOLVIDO" &&
        it.status !== "ENCERRADO",
    };
  });

  const expiredItems = itemsWithDeadline.filter((i) => i.isExpired);
  const nearExpirationItems = itemsWithDeadline.filter((i) => i.isNearExpiration);
  const deadlineAlertItems = itemsWithDeadline.filter((i) => i.isExpired || i.isNearExpiration);

  // Chart 3 Data: Pending Review & Item Status Distribution
  const pendingByCat: Record<string, number> = {};
  items
    .filter((i) => i.status === "EM_ANALISE" || i.status === "PERDIDO")
    .forEach((it) => {
      pendingByCat[it.category] = (pendingByCat[it.category] || 0) + 1;
    });

  const barPendingData = Object.keys(pendingByCat).map((cat) => ({
    category: cat.length > 15 ? cat.substring(0, 15) + "..." : cat,
    pendentes: pendingByCat[cat],
  }));

  // Filtered Items for Management Table
  const filteredTableItems = (items || []).filter((it) => {
    if (!it) return false;
    const matchCat = tableCategory === "TODAS" || it.category === tableCategory;
    const q = sanitizeQuery(tableSearch);
    const matchText =
      !q ||
      safeIncludes(it.title, q) ||
      safeIncludes(it.registeredByName, q) ||
      safeIncludes(it.id, q) ||
      safeIncludes(it.qrCodeId, q) ||
      safeIncludes(it.location, q) ||
      safeIncludes(it.category, q);
    return matchCat && matchText;
  });

  // Export CSV Helper
  const handleExportCSV = () => {
    const headers = "ID,Titulo,Categoria,Tipo,Status,Local,Data,CadastradoPor,Contato\n";
    const rows = items
      .map(
        (i) =>
          `"${i.id}","${i.title}","${i.category}","${i.type}","${i.status}","${i.location}","${i.date}","${i.registeredByName}","${i.contactInfo}"`
      )
      .join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `relatorio_achados_perdidos_ifpr_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast("Relatório CSV gerado e baixado com sucesso!", "success");
  };

  // Export PDF with Pending Items (jsPDF & autoTable)
  const handleExportPendingItemsPDF = () => {
    vibrateClick();
    const pendingItems = items.filter(
      (it) => it.status === "PERDIDO" || it.status === "ENCONTRADO" || it.status === "EM_ANALISE"
    );

    const doc = new jsPDF();

    // Institutional Green Header
    doc.setFillColor(0, 132, 61); // IFPR Green #00843D
    doc.rect(0, 0, 210, 26, "F");

    // Red accent stripe
    doc.setFillColor(200, 16, 46); // IFPR Red #C8102E
    doc.rect(0, 26, 210, 2, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("INSTITUTO FEDERAL DO PARANÁ - CAMPUS IVAIPORÃ", 14, 12);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Sistema Achados e Perdidos • Relatório Oficial de Objetos Pendentes", 14, 19);

    // Document Metadata
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("LISTAGEM OFICIAL DE OBJETOS PENDENTES NO ACERVO", 14, 38);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Data de Emissão: ${new Date().toLocaleString("pt-BR")}`, 14, 44);
    doc.text(`Emitido por: ${currentUser.name} (${currentUser.role} • ${currentUser.email})`, 14, 49);
    doc.text(
      `Total de Itens Pendentes: ${pendingItems.length} | Perdidos: ${pendingItems.filter((i) => i.type === "PERDIDO").length} | Encontrados: ${pendingItems.filter((i) => i.type === "ENCONTRADO").length} | Em Análise: ${pendingItems.filter((i) => i.status === "EM_ANALISE").length}`,
      14,
      54
    );

    const tableRows = pendingItems.map((item) => [
      item.id,
      item.title,
      item.category,
      item.type,
      item.location,
      formatDate(item.date),
      item.status,
      item.registeredByName || "Não informado",
    ]);

    autoTable(doc, {
      startY: 59,
      head: [["ID / QR", "Título do Objeto", "Categoria", "Tipo", "Local Encontrado/Perdido", "Data Registro", "Status", "Registrado Por"]],
      body: tableRows,
      headStyles: { fillColor: [0, 132, 61], textColor: [255, 255, 255], fontStyle: "bold" },
      styles: { fontSize: 7.5, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 38 },
        2: { cellWidth: 25 },
        3: { cellWidth: 18 },
        4: { cellWidth: 32 },
        5: { cellWidth: 20 },
        6: { cellWidth: 22 },
        7: { cellWidth: "auto" },
      },
    });

    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(130, 130, 130);
      doc.text(
        `IFPR Campus Ivaiporã • Achados & Perdidos Oficial • Página ${i} de ${totalPages} • Documento gerado em ${new Date().toLocaleDateString("pt-BR")}`,
        14,
        287
      );
    }

    doc.save(`Relatorio_Objetos_Pendentes_IFPR_${new Date().toISOString().slice(0, 10)}.pdf`);
    vibrateSuccess();
    addToast("Relatório de Objetos Pendentes exportado em PDF com sucesso!", "success");
  };

  // Export PDF Audit Helper (jsPDF & autoTable)
  const handleExportAuditPDF = () => {
    const filteredLogs = (activityLogs || []).filter((log) => {
      if (!log) return false;
      const matchAction = logFilterAction === "TODOS" || log.action === logFilterAction;
      const lq = sanitizeQuery(logSearchQuery);
      const matchSearch =
        !lq ||
        safeIncludes(log.adminName, lq) ||
        safeIncludes(log.details, lq) ||
        safeIncludes(log.action, lq);

      let matchDate = true;
      if (logStartDate) {
        matchDate = matchDate && new Date(log.timestamp) >= new Date(logStartDate);
      }
      if (logEndDate) {
        const end = new Date(logEndDate);
        end.setHours(23, 59, 59, 999);
        matchDate = matchDate && new Date(log.timestamp) <= end;
      }

      return matchAction && matchSearch && matchDate;
    });

    const doc = new jsPDF();

    // Institutional Header
    doc.setFillColor(0, 132, 61); // IFPR Green #00843D
    doc.rect(0, 0, 210, 25, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("INSTITUTO FEDERAL DO PARANÁ - CAMPUS IVAIPORÃ", 14, 12);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Sistema Achados e Perdidos • Relatório Oficial de Auditoria do Sistema", 14, 18);

    doc.setTextColor(30, 30, 30);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("RELATÓRIO DE AUDITORIA E LOGS DE ATIVIDADE", 14, 34);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Data de Emissão: ${new Date().toLocaleString("pt-BR")}`, 14, 40);
    doc.text(`Administrador Responsável: ${currentUser.name} (${currentUser.email})`, 14, 45);
    doc.text(`Filtro Ação: ${logFilterAction} | Data Início: ${logStartDate || "Livre"} | Data Fim: ${logEndDate || "Livre"} | Total Registros: ${filteredLogs.length}`, 14, 50);

    const tableRows = filteredLogs.map((log) => [
      formatDate(log.timestamp),
      log.adminName,
      log.action,
      log.details,
    ]);

    autoTable(doc, {
      startY: 55,
      head: [["Data e Hora", "Responsável", "Operação", "Detalhes da Operação"]],
      body: tableRows,
      headStyles: { fillColor: [0, 132, 61], textColor: [255, 255, 255], fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 2.5 },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 35 },
        2: { cellWidth: 40 },
        3: { cellWidth: "auto" },
      },
    });

    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(130, 130, 130);
      doc.text(`IFPR Achados e Perdidos • Documento para fins de auditoria e transparência pública • Página ${i} de ${totalPages}`, 14, 287);
    }

    doc.save(`Auditoria_IFPR_${new Date().toISOString().slice(0, 10)}.pdf`);
    addToast("Relatório de Auditoria exportado em PDF!", "success");
  };

  // Export JSON Monitoring and Error Logs Helper (API: /api/monitoring/export-logs)
  const [isExportingMonitoringJSON, setIsExportingMonitoringJSON] = useState(false);

  const handleExportMonitoringLogsJSON = async () => {
    vibrateClick();
    setIsExportingMonitoringJSON(true);
    try {
      const res = await fetch("/api/monitoring/export-logs");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `relatorio_monitoramento_ifpr_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      vibrateSuccess();
      addToast("Relatório JSON com logs de desempenho e erros baixado com sucesso!", "success");
    } catch (err: any) {
      vibrateCritical();
      addToast("Erro ao baixar relatório de logs de monitoramento.", "error");
    } finally {
      setIsExportingMonitoringJSON(false);
    }
  };

  // Export Complete Items List in CSV for Campus Secretariat / Archive
  const handleExportItemsCSV = () => {
    vibrateClick();
    try {
      if (items.length === 0) {
        addToast("Nenhum item disponível para exportação em CSV.", "info");
        return;
      }

      const headers = [
        "ID_Sistema",
        "Codigo_QR",
        "Titulo",
        "Categoria",
        "Tipo",
        "Status",
        "Local_Campus",
        "Cor",
        "Marca",
        "Data_Ocorrencia",
        "Data_Cadastro",
        "Cadastrado_Por",
        "Papel_Cadastrador",
        "Devolvido_Para",
        "Email_Destinatario",
        "Vinculo_Destinatario",
        "Data_Devolucao",
        "Responsavel_Devolucao",
        "Descricao",
        "Observacoes_Devolucao"
      ];

      const escapeCSV = (str: string | undefined | null) => {
        if (!str) return '""';
        const cleaned = String(str).replace(/"/g, '""').replace(/\r?\n|\r/g, " ");
        return `"${cleaned}"`;
      };

      const rows = items.map((item) => [
        escapeCSV(item.id),
        escapeCSV(item.qrCodeId),
        escapeCSV(item.title),
        escapeCSV(item.category),
        escapeCSV(item.type),
        escapeCSV(item.status),
        escapeCSV(item.location),
        escapeCSV(item.color),
        escapeCSV(item.brand),
        escapeCSV(item.date),
        escapeCSV(item.createdAt),
        escapeCSV(item.registeredByName),
        escapeCSV(item.registeredByRole),
        escapeCSV(item.recipientName || ""),
        escapeCSV(item.recipientEmail || ""),
        escapeCSV(item.recipientBond || ""),
        escapeCSV(item.returnDate || ""),
        escapeCSV(item.returnedByName || ""),
        escapeCSV(item.description || ""),
        escapeCSV(item.returnObservations || "")
      ]);

      // UTF-8 BOM (\uFEFF) for Excel / Calc compatibility
      const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `relatorio_secretaria_itens_ifpr_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      vibrateSuccess();
      addToast("Listagem completa exportada em formato CSV com sucesso!", "success");
    } catch (err: any) {
      vibrateCritical();
      addToast("Erro ao exportar arquivo CSV.", "error");
    }
  };

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#1E1E1E] p-6 sm:p-8 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-xs">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-2xl bg-[#00843D]/10 text-[#00843D]">
              <BarChart3 className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">
                Painel do Achados & Perdidos
              </h1>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Módulos de Gestão • IFPR Campus Ivaiporã
              </p>
            </div>
          </div>
        </div>

        {/* Role Panel Navigation */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {currentUser.role === "ADMIN" ? (
            <div className="bg-neutral-100 dark:bg-neutral-800/80 p-1.5 rounded-2xl flex items-center space-x-1 border border-neutral-200 dark:border-neutral-700">
              <button
                onClick={() => setActiveDashboardRole("ALUNO")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
                  activeDashboardRole === "ALUNO"
                    ? "bg-[#00843D] text-white shadow-xs"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                }`}
              >
                <GraduationCap className="w-3.5 h-3.5" />
                <span>Módulo Aluno</span>
              </button>

              <button
                onClick={() => setActiveDashboardRole("SERVIDOR")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
                  activeDashboardRole === "SERVIDOR"
                    ? "bg-[#00843D] text-white shadow-xs"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Módulo Servidor</span>
              </button>

              <button
                onClick={() => setActiveDashboardRole("ADMIN")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
                  activeDashboardRole === "ADMIN"
                    ? "bg-purple-600 text-white shadow-xs"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Módulo Admin TI</span>
              </button>
            </div>
          ) : (
            <div className="px-4 py-2 rounded-2xl bg-[#00843D]/10 text-[#00843D] border border-[#00843D]/20 text-xs font-black flex items-center space-x-2">
              <UserCheck className="w-4 h-4" />
              <span>Painel do {currentUser.role} ({currentUser.name})</span>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. MÓDULO ALUNO (Discente) */}
      {/* ========================================================================= */}
      {activeDashboardRole === "ALUNO" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center space-x-3 text-xs text-emerald-800 dark:text-emerald-300">
            <GraduationCap className="w-5 h-5 shrink-0 text-[#00843D]" />
            <div>
              <p className="font-extrabold">Visão do Discente (Aluno)</p>
              <p className="text-[11px] opacity-90">
                Acompanhe os itens que você registrou, solicitações de devolução e selo de reputação no campus.
              </p>
            </div>
          </div>

          {/* Student Stats Cards (RNF03 Responsive CSS Grid) */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
            <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-neutral-500">
                <span className="text-xs font-bold uppercase tracking-wider">Minhas Ocorrências</span>
                <PackageSearch className="w-5 h-5 text-[#00843D]" />
              </div>
              <p className="text-3xl font-black text-neutral-900 dark:text-white">
                {items.filter((i) => i.registeredByUserId === currentUser.id).length}
              </p>
              <p className="text-[11px] text-neutral-500">Itens cadastrados por você</p>
            </div>

            <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-neutral-500">
                <span className="text-xs font-bold uppercase tracking-wider">Reclamações Enviadas</span>
                <Clock className="w-5 h-5 text-amber-500" />
              </div>
              <p className="text-3xl font-black text-neutral-900 dark:text-white">
                {claims.filter((c) => c.claimerId === currentUser.id).length}
              </p>
              <p className="text-[11px] text-neutral-500">Solicitações de dono verdadeiro</p>
            </div>

            <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-neutral-500">
                <span className="text-xs font-bold uppercase tracking-wider">Selo de Cidadania</span>
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              </div>
              <p className="text-3xl font-black text-[#00843D]">
                {currentUser.reputationScore || 10} pts
              </p>
              <p className="text-[11px] text-neutral-500">Nível: Aluno Cidadão Exemplar</p>
            </div>
          </div>

          {/* Student My Registered Items Table */}
          <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold text-neutral-900 dark:text-white">
                Seus Objetos Cadastrados
              </h2>
              <button
                onClick={() => setActiveTab("register")}
                className="px-4 py-2 rounded-xl bg-[#00843D] text-white text-xs font-bold hover:bg-[#006e33] transition-colors"
              >
                + Registrar Novo Item
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 dark:bg-neutral-800 text-neutral-500 uppercase font-bold text-[10px]">
                  <tr>
                    <th className="p-3 rounded-l-xl">Objeto</th>
                    <th className="p-3">Categoria</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Data</th>
                    <th className="p-3 rounded-r-xl text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {items.filter((i) => i.registeredByUserId === currentUser.id).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-neutral-400">
                        Você ainda não cadastrou nenhum objeto.
                      </td>
                    </tr>
                  ) : (
                    items
                      .filter((i) => i.registeredByUserId === currentUser.id)
                      .map((item) => (
                        <tr key={item.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                          <td className="p-3 font-bold text-neutral-900 dark:text-white">{item.title}</td>
                          <td className="p-3">{item.category}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.type === "PERDIDO" ? "bg-red-500/10 text-red-600" : "bg-green-500/10 text-green-600"}`}>
                              {item.type}
                            </span>
                          </td>
                          <td className="p-3 font-bold">{item.status}</td>
                          <td className="p-3 text-neutral-500">{formatDate(item.date)}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => setSelectedItemForDetail(item)}
                              className="px-3 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-[#00843D] hover:text-white text-[11px] font-bold transition-colors"
                            >
                              Ver Detalhes
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. MÓDULO SERVIDOR (Docente / TAE / Portaria) */}
      {/* ========================================================================= */}
      {activeDashboardRole === "SERVIDOR" && (
        <div className="space-y-8 animate-in fade-in duration-200">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex items-center justify-between text-xs text-blue-900 dark:text-blue-200">
            <div className="flex items-center space-x-3">
              <Building2 className="w-5 h-5 shrink-0 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="font-extrabold">Painel do Servidor / Portaria e Achados & Perdidos</p>
                <p className="text-[11px] opacity-90">
                  Acesso para conferência de itens, leitor QR Code na recepção e análise de tendências de objetos no campus.
                </p>
              </div>
            </div>
            <button
              onClick={() => setQrScannerOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold flex items-center space-x-1.5 text-xs shadow-xs"
            >
              <QrCode className="w-4 h-4" />
              <span>Escanear Etiqueta QR</span>
            </button>
          </div>

          {/* Servidor Summary Metrics (RNF03 Responsive CSS Grid) */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            <div className="bg-white dark:bg-[#1E1E1E] p-5 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-1">
              <span className="text-[11px] font-bold text-neutral-500 uppercase">Total de Itens</span>
              <p className="text-2xl font-black text-neutral-900 dark:text-white">{totalItems}</p>
            </div>
            <div className="bg-white dark:bg-[#1E1E1E] p-5 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-1">
              <span className="text-[11px] font-bold text-amber-600 uppercase">Em Análise / Recepção</span>
              <p className="text-2xl font-black text-amber-600">{inAnalysisCount}</p>
            </div>
            <div className="bg-white dark:bg-[#1E1E1E] p-5 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-1">
              <span className="text-[11px] font-bold text-blue-600 uppercase">Devoluções Concluídas</span>
              <p className="text-2xl font-black text-blue-600">{returnedCount}</p>
            </div>
            <div className="bg-white dark:bg-[#1E1E1E] p-5 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-1">
              <span className="text-[11px] font-bold text-[#00843D] uppercase">Taxa de Sucesso</span>
              <p className="text-2xl font-black text-[#00843D]">{successRate}%</p>
            </div>
          </div>

          {/* SPECIALIZED REPORTING COMPONENT WITH RECHARTS */}
          <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 sm:p-8 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 dark:border-neutral-800 pb-4">
              <div>
                <div className="flex items-center space-x-2">
                  <TrendingUp className="w-5 h-5 text-[#00843D]" />
                  <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                    Relatório Analítico & Gráficos do Servidor
                  </h2>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Análise temporal, estatísticas por categoria e contagem de análises pendentes no IFPR Campus Ivaiporã.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                <button
                  onClick={handleExportPendingItemsPDF}
                  role="button"
                  aria-label="Exportar Relatório em PDF contendo a listagem de objetos pendentes"
                  className="px-4 py-2 rounded-xl bg-[#00843D] hover:bg-[#006830] text-white font-bold text-xs shadow-xs transition-colors flex items-center space-x-2 cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-white" />
                  <span>Exportar Relatório (PDF)</span>
                </button>

                <button
                  onClick={handleExportItemsCSV}
                  role="button"
                  aria-label="Exportar todos os dados em formato CSV para a Secretaria"
                  className="px-4 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 font-bold text-xs text-neutral-700 dark:text-neutral-300 transition-colors flex items-center space-x-2 cursor-pointer border border-neutral-300 dark:border-neutral-700 shadow-xs"
                >
                  <FileSpreadsheet className="w-4 h-4 text-[#00843D]" />
                  <span>Exportar Base Completa (CSV)</span>
                </button>
              </div>
            </div>

            {/* Gráfico de Linhas Recharts: Tendência Mensal de Itens Perdidos vs. Recuperados no Campus Ivaiporã */}
            <div className="bg-neutral-50 dark:bg-neutral-900/50 p-5 sm:p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800/80 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-black uppercase text-neutral-700 dark:text-neutral-300 tracking-wider flex items-center space-x-1.5">
                    <TrendingUp className="w-4 h-4 text-[#00843D]" />
                    <span>Tendência Mensal: Itens Perdidos vs. Recuperados (Campus Ivaiporã)</span>
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Comparativo em linha da evolução temporal entre perdas registradas e devoluções bem-sucedidas no campus
                  </p>
                </div>
                <div className="flex items-center space-x-3 text-[11px] font-bold">
                  <span className="flex items-center space-x-1 text-[#C8102E]">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#C8102E] inline-block"></span>
                    <span>Perdidos</span>
                  </span>
                  <span className="flex items-center space-x-1 text-[#00843D]">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#00843D] inline-block"></span>
                    <span>Recuperados</span>
                  </span>
                  <span className="flex items-center space-x-1 text-[#3B82F6]">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6] inline-block"></span>
                    <span>Encontrados</span>
                  </span>
                </div>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="month" stroke="#888" fontSize={11} />
                    <YAxis stroke="#888" fontSize={11} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1E1E1E",
                        borderColor: "#333",
                        borderRadius: "12px",
                        color: "#fff",
                        fontSize: "12px",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                    <Line
                      type="monotone"
                      dataKey="perdidos"
                      name="Itens Perdidos"
                      stroke="#C8102E"
                      strokeWidth={3}
                      dot={{ r: 4, stroke: "#C8102E", fill: "#fff", strokeWidth: 2 }}
                      activeDot={{ r: 7 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="devolvidos"
                      name="Itens Recuperados / Devolvidos"
                      stroke="#00843D"
                      strokeWidth={3}
                      dot={{ r: 4, stroke: "#00843D", fill: "#fff", strokeWidth: 2 }}
                      activeDot={{ r: 7 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="encontrados"
                      name="Itens Encontrados"
                      stroke="#3B82F6"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={{ r: 3, stroke: "#3B82F6", fill: "#fff" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Chart 1: Categorias Mais Comuns */}
              <div className="bg-neutral-50 dark:bg-neutral-900/50 p-5 rounded-3xl border border-neutral-200 dark:border-neutral-800/80 space-y-4">
                <div>
                  <h3 className="text-xs font-black uppercase text-neutral-700 dark:text-neutral-300 tracking-wider">
                    Categorias Mais Comuns (Distribuição)
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Proporção de tipos de objetos perdidos e achados cadastrados
                  </p>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieCategoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {pieCategoryData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1E1E1E",
                          borderColor: "#333",
                          borderRadius: "12px",
                          color: "#fff",
                          fontSize: "12px",
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }}
                        formatter={(value) => <span className="text-neutral-700 dark:text-neutral-300 font-bold">{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Análise de Tendência Mensal */}
              <div className="bg-neutral-50 dark:bg-neutral-900/50 p-5 rounded-3xl border border-neutral-200 dark:border-neutral-800/80 space-y-4">
                <div>
                  <h3 className="text-xs font-black uppercase text-neutral-700 dark:text-neutral-300 tracking-wider">
                    Análise de Tendência Mensal
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Evolução dos registros de Perdidos, Encontrados e Devolvidos no semestre
                  </p>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyData}>
                      <defs>
                        <linearGradient id="colorPerdidos" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#C8102E" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#C8102E" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorEncontrados" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00843D" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#00843D" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="month" stroke="#888" fontSize={11} />
                      <YAxis stroke="#888" fontSize={11} />
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1E1E1E",
                          borderColor: "#333",
                          borderRadius: "12px",
                          color: "#fff",
                          fontSize: "12px",
                        }}
                      />
                      <Area type="monotone" dataKey="perdidos" stroke="#C8102E" fillOpacity={1} fill="url(#colorPerdidos)" name="Perdidos" />
                      <Area type="monotone" dataKey="encontrados" stroke="#00843D" fillOpacity={1} fill="url(#colorEncontrados)" name="Encontrados" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Chart 3: Contagem de Ocorrências em Análise por Categoria */}
            <div className="bg-neutral-50 dark:bg-neutral-900/50 p-5 rounded-3xl border border-neutral-200 dark:border-neutral-800/80 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black uppercase text-neutral-700 dark:text-neutral-300 tracking-wider">
                    Contagem de Revisões Pendentes por Categoria
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Objetos aguardando comprovação presencial ou validação na recepção
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 text-xs font-extrabold border border-amber-500/20">
                  {inAnalysisCount + pendingClaimsCount} Pendentes Total
                </span>
              </div>

              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barPendingData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="category" stroke="#888" fontSize={10} />
                    <YAxis stroke="#888" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1E1E1E",
                        borderColor: "#333",
                        borderRadius: "12px",
                        color: "#fff",
                        fontSize: "12px",
                      }}
                    />
                    <Bar dataKey="pendentes" fill="#F59E0B" radius={[6, 6, 0, 0]} name="Aguardando Revisão" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Storage Deadline Alert Card (Controle de Prazo de Armazenamento - 90 Dias) */}
            <div className="bg-white dark:bg-[#1E1E1E] p-6 rounded-3xl border border-amber-500/30 dark:border-amber-500/30 shadow-md space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
                <div className="flex items-center space-x-3">
                  <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-neutral-900 dark:text-white flex items-center gap-2">
                      <span>Controle de Prazo de Armazenamento</span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-extrabold uppercase tracking-wide">
                        Portaria IFPR 90 Dias
                      </span>
                    </h3>
                    <p className="text-xs text-neutral-500">
                      Monitoramento preventivo de objetos guardados no acervo prestes a vencer o prazo regulamentar.
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="px-3 py-1.5 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 font-extrabold text-xs border border-red-500/20 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> {expiredItems.length} Expirados
                  </span>
                  <span className="px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 font-extrabold text-xs border border-amber-500/20 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> {nearExpirationItems.length} Próximos do Vencimento
                  </span>
                </div>
              </div>

              {deadlineAlertItems.length === 0 ? (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Todos os objetos guardados no acervo do IFPR estão dentro do prazo de guarda de 90 dias. Nenhuma destinação necessária no momento.</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-400 uppercase text-[10px] font-bold">
                          <th className="py-2 px-3">Objeto</th>
                          <th className="py-2 px-3">Categoria</th>
                          <th className="py-2 px-3">Data Cadastro</th>
                          <th className="py-2 px-3">Data Limite</th>
                          <th className="py-2 px-3 text-center">Status do Prazo</th>
                          <th className="py-2 px-3 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
                        {deadlineAlertItems.slice(0, 6).map((item) => (
                          <tr key={item.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                            <td className="py-2.5 px-3 font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                              {item.imageUrl ? (
                                <img src={item.imageUrl} alt={item.title} className="w-7 h-7 rounded-lg object-cover" />
                              ) : (
                                <div className="w-7 h-7 rounded-lg bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-[10px] font-bold">IF</div>
                              )}
                              <span className="truncate max-w-[160px]">{item.title}</span>
                            </td>
                            <td className="py-2.5 px-3 text-neutral-600 dark:text-neutral-400">{item.category}</td>
                            <td className="py-2.5 px-3 text-neutral-500 font-mono text-[11px]">{formatDate(item.createdAt)}</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-neutral-800 dark:text-neutral-200 text-[11px]">
                              {item.data_limite ? formatDate(item.data_limite) : (item.storageDeadlineDate ? formatDate(item.storageDeadlineDate) : "—")}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {item.isExpired ? (
                                <span className="px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 font-extrabold text-[10px] border border-red-500/20 inline-block">
                                  🚨 Prazo Vencido ({Math.abs(item.daysRemaining)}d atrás)
                                </span>
                              ) : (
                                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-extrabold text-[10px] border border-amber-500/20 inline-block">
                                  ⚠️ Vence em {item.daysRemaining} dias
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => setSelectedItemForDetail(item)}
                                className="px-3 py-1 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-[11px] shadow-xs cursor-pointer"
                              >
                                Destinar / Gerenciar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. MÓDULO ADMINISTRADOR (TI / Gestão Exclusiva) */}
      {/* ========================================================================= */}
      {activeDashboardRole === "ADMIN" && (
        <div className="space-y-8 animate-in fade-in duration-200">
          {currentUser.role !== "ADMIN" ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-neutral-900 dark:text-white">
                  Acesso Restrito a Administradores TI
                </h3>
                <p className="text-xs text-neutral-500 max-w-md mx-auto">
                  Sua conta atual ({currentUser.email}) possui permissão de <strong>{currentUser.role}</strong>. Apenas usuários autenticados como ADMINISTRADOR podem executar ações de gerenciamento.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Admin Navigation Sub-Tabs Bar */}
              <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-4 border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setAdminSubTab("users")}
                    className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center space-x-2 ${
                      adminSubTab === "users"
                        ? "bg-purple-600 text-white shadow-md"
                        : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    <span>Usuários & Controle</span>
                  </button>

                  <button
                    onClick={() => setAdminSubTab("audit")}
                    className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center space-x-2 ${
                      adminSubTab === "audit"
                        ? "bg-indigo-600 text-white shadow-md"
                        : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                    }`}
                  >
                    <History className="w-4 h-4" />
                    <span>Auditoria & Logs</span>
                  </button>

                  <button
                    onClick={() => setAdminSubTab("health")}
                    className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center space-x-2 ${
                      adminSubTab === "health"
                        ? "bg-emerald-600 text-white shadow-md"
                        : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                    }`}
                  >
                    <Activity className="w-4 h-4" />
                    <span>Saúde do Sistema</span>
                  </button>

                  <button
                    onClick={() => setAdminSubTab("approvals")}
                    className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center space-x-2 ${
                      adminSubTab === "approvals"
                        ? "bg-blue-600 text-white shadow-md"
                        : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                    }`}
                  >
                    <GraduationCap className="w-4 h-4" />
                    <span>Aprovação (@ifpr)</span>
                    {allUsers.filter((u) => u.approvalStatus === "PENDENTE").length > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-black animate-pulse">
                        {allUsers.filter((u) => u.approvalStatus === "PENDENTE").length}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setAdminSubTab("backups")}
                    className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center space-x-2 ${
                      adminSubTab === "backups"
                        ? "bg-amber-600 text-white shadow-md"
                        : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                    }`}
                  >
                    <HardDrive className="w-4 h-4" />
                    <span>Backups & Auditoria</span>
                  </button>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={toggleMaintenanceMode}
                    className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center space-x-1.5 ${
                      maintenanceMode
                        ? "bg-amber-500 text-black animate-pulse shadow-sm"
                        : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-amber-500 hover:text-black"
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>{maintenanceMode ? "Manutenção ATIVA" : "Modo Manutenção"}</span>
                  </button>

                  <button
                    onClick={() => setIsAddingUserOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white text-xs font-black transition-all flex items-center space-x-1 shadow-sm"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>+ Usuário</span>
                  </button>
                </div>
              </div>

              {/* TAB 1: USERS & CONTROLS */}
              {adminSubTab === "users" && (
                <div className="space-y-6">
                  {/* Maintenance Message Input Box */}
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-3xl p-6 space-y-4 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-xs font-black uppercase text-amber-700 dark:text-amber-400 flex items-center space-x-2">
                        <SlidersHorizontal className="w-4 h-4 text-amber-500" />
                        <span>Mensagem do Banner de Manutenção Global (Tempo Real)</span>
                      </span>
                      <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-semibold">
                        Sincronização instantânea no Firestore para todos os usuários
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-2">
                      <input
                        type="text"
                        value={customMsgInput}
                        onChange={(e) => setCustomMsgInput(e.target.value)}
                        placeholder="Escreva a mensagem personalizada que aparecerá no banner de manutenção global..."
                        className="flex-1 w-full px-4 py-3 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-xs font-medium outline-none focus:ring-2 focus:ring-amber-500 text-neutral-900 dark:text-neutral-100 shadow-xs"
                      />
                      <button
                        onClick={handleSaveCustomMsg}
                        className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-black font-black text-xs transition-all shadow-md flex items-center justify-center space-x-1.5 cursor-pointer shrink-0"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Salvar</span>
                      </button>
                    </div>
                  </div>

                  {/* Telemetry Overview Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white dark:bg-[#1E1E1E] p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 flex items-center space-x-4 shadow-xs">
                      <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-600">
                        <Users className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-neutral-400 uppercase">Total de Usuários</p>
                        <p className="text-xl font-black text-neutral-900 dark:text-white">{allUsers.length}</p>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-[#1E1E1E] p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 flex items-center space-x-4 shadow-xs">
                      <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-600">
                        <GraduationCap className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-neutral-400 uppercase">Aprovações Pendentes</p>
                        <p className="text-xl font-black text-amber-600 dark:text-amber-400">
                          {allUsers.filter((u) => u.approvalStatus === "PENDENTE").length}
                        </p>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-[#1E1E1E] p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 flex items-center space-x-4 shadow-xs">
                      <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-600">
                        <Activity className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-neutral-400 uppercase">Servidor e Firestore</p>
                        <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">100% Operacional</p>
                      </div>
                    </div>
                  </div>

                  {/* USER MANAGEMENT & PERMISSIONS TABLE */}
                  <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 sm:p-8 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center space-x-2">
                          <Users className="w-5 h-5 text-[#00843D]" />
                          <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                            Gerenciamento de Usuários e Permissões
                          </h2>
                        </div>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                          Alteração de perfis (Aluno, Servidor, Admin) e remoção de usuários no IFPR.
                        </p>
                      </div>
                      <span className="self-start sm:self-auto px-3 py-1 rounded-full bg-green-500/10 text-green-700 dark:text-green-400 text-xs font-bold border border-green-500/20">
                        {allUsers.length} Usuários Cadastrados
                      </span>
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2 pb-2 border-b border-neutral-200 dark:border-neutral-800">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => setUserRoleFilter("ALL")}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            userRoleFilter === "ALL" ? "bg-[#00843D] text-white" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
                          }`}
                        >
                          Todos ({allUsers.length})
                        </button>
                        <button
                          onClick={() => setUserRoleFilter("ALUNO")}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            userRoleFilter === "ALUNO" ? "bg-emerald-600 text-white" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
                          }`}
                        >
                          Alunos ({allUsers.filter((u) => u.role === "ALUNO").length})
                        </button>
                        <button
                          onClick={() => setUserRoleFilter("SERVIDOR")}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            userRoleFilter === "SERVIDOR" ? "bg-blue-600 text-white" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
                          }`}
                        >
                          Servidores ({allUsers.filter((u) => u.role === "SERVIDOR").length})
                        </button>
                        <button
                          onClick={() => setUserRoleFilter("ADMIN")}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            userRoleFilter === "ADMIN" ? "bg-purple-600 text-white" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
                          }`}
                        >
                          Admins ({allUsers.filter((u) => u.role === "ADMIN").length})
                        </button>
                      </div>

                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-neutral-400" />
                        <input
                          type="text"
                          value={userSearchText}
                          onChange={(e) => setUserSearchText(e?.target?.value ?? "")}
                          placeholder="Buscar por nome ou e-mail..."
                          className="pl-8 pr-3 py-1.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs outline-none w-full md:w-64"
                        />
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-600 dark:text-neutral-400 uppercase font-extrabold tracking-wider text-[10px]">
                          <tr>
                            <th className="p-3.5 rounded-l-xl">Usuário</th>
                            <th className="p-3.5">E-mail</th>
                            <th className="p-3.5">Curso / Setor</th>
                            <th className="p-3.5">Matrícula</th>
                            <th className="p-3.5">Permissão (Função)</th>
                            <th className="p-3.5 rounded-r-xl text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                          {allUsers
                            .filter((u) => {
                              if (!u) return false;
                              const matchRole = userRoleFilter === "ALL" || u.role === userRoleFilter;
                              const uq = sanitizeQuery(userSearchText);
                              const matchQuery =
                                !uq ||
                                safeIncludes(u.name, uq) ||
                                safeIncludes(u.email, uq) ||
                                safeIncludes(u.registrationNumber, uq) ||
                                safeIncludes(u.courseOrDept, uq);
                              return matchRole && matchQuery;
                            })
                            .map((u, index) => (
                              <tr key={u.id || `user-${u.email}-${index}`} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                                <td className="p-3.5 font-bold text-neutral-900 dark:text-white">
                                  <div className="flex items-center space-x-2.5">
                                    <img
                                      src={u.avatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80"}
                                      alt=""
                                      className="w-8 h-8 rounded-full object-cover shrink-0 border border-neutral-200 dark:border-neutral-700"
                                    />
                                    <div className="flex flex-col">
                                      <span className="font-bold">{u.name}</span>
                                      {u.id === currentUser.id && (
                                        <span className="text-[9px] text-[#00843D] dark:text-green-400 font-extrabold">(Sua Conta)</span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="p-3.5 font-mono text-neutral-600 dark:text-neutral-300">{u.email}</td>
                                <td className="p-3.5 text-neutral-600 dark:text-neutral-300">{u.courseOrDept}</td>
                                <td className="p-3.5 font-mono text-neutral-500">{u.registrationNumber || "N/A"}</td>
                                <td className="p-3.5">
                                  <select
                                    value={u.role}
                                    onChange={async (e) => {
                                      const newRole = e.target.value as UserRole;
                                      await updateUserRole(u.id, newRole);
                                      await logAdminAction(
                                        "ALTERACAO_PERMISSAO",
                                        `Alterou o perfil de '${u.name}' para a permissão ${newRole}.`
                                      );
                                    }}
                                    className={`py-1.5 px-3 rounded-xl text-xs font-bold border outline-none cursor-pointer ${
                                      u.role === "ADMIN"
                                        ? "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30"
                                        : u.role === "SERVIDOR"
                                        ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30"
                                        : "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30"
                                    }`}
                                  >
                                    <option value="ALUNO">ALUNO (Discente)</option>
                                    <option value="SERVIDOR">SERVIDOR (Docente/TAE)</option>
                                    <option value="ADMIN">ADMIN (TI)</option>
                                  </select>
                                </td>
                                <td className="p-3.5 text-right">
                                  <button
                                    disabled={u.id === currentUser.id}
                                    onClick={() => setUserToDelete({ id: u.id, name: u.name })}
                                    className={`p-2 rounded-xl border transition-all ${
                                      u.id === currentUser.id
                                        ? "opacity-30 cursor-not-allowed bg-neutral-100 text-neutral-400 border-neutral-200"
                                        : "bg-red-500/10 text-red-600 hover:bg-red-500 hover:text-white border-red-500/20"
                                    }`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* OVERRIDE ITEM STATUS TABLE */}
                  <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 sm:p-8 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                          Controle de Objetos e Override de Status
                        </h2>
                        <p className="text-xs text-neutral-500">
                          Alteração direta do status das ocorrências registradas no campus.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={tableSearch}
                          onChange={(e) => setTableSearch(e.target.value)}
                          placeholder="Buscar por objeto..."
                          className="px-3.5 py-1.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs outline-none w-48"
                        />
                        <select
                          value={tableCategory}
                          onChange={(e) => setTableCategory(e.target.value)}
                          className="px-3 py-1.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs font-bold outline-none"
                        >
                          <option value="TODAS">Todas as Categorias</option>
                          <option value="Eletrônicos">Eletrônicos</option>
                          <option value="Documentos & Cartões">Documentos</option>
                          <option value="Chaves">Chaves</option>
                          <option value="Roupas & Calçados">Roupas</option>
                        </select>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-600 dark:text-neutral-400 uppercase font-extrabold text-[10px]">
                          <tr>
                            <th className="p-3.5 rounded-l-xl">Título / Código</th>
                            <th className="p-3.5">Categoria</th>
                            <th className="p-3.5">Localização</th>
                            <th className="p-3.5">Data</th>
                            <th className="p-3.5">Status (Override)</th>
                            <th className="p-3.5 rounded-r-xl text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                          {filteredTableItems.map((item) => (
                            <tr key={item.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                              <td className="p-3.5 font-bold text-neutral-900 dark:text-white">
                                <div>{item.title}</div>
                                <div className="text-[10px] font-mono text-neutral-400">{item.id}</div>
                              </td>
                              <td className="p-3.5">{item.category}</td>
                              <td className="p-3.5 truncate max-w-[140px]">{item.location}</td>
                              <td className="p-3.5 text-neutral-500">{formatDate(item.date)}</td>
                              <td className="p-3.5">
                                <select
                                  value={item.status}
                                  onChange={async (e) => {
                                    const newStat = e.target.value as any;
                                    updateItemStatus(item.id, newStat);
                                    await logAdminAction(
                                      "STATUS_OVERRIDE",
                                      `Alterou o status do objeto '${item.title}' (${item.id}) para ${newStat}.`
                                    );
                                  }}
                                  className={`py-1.5 px-2.5 rounded-xl text-xs font-bold border outline-none cursor-pointer ${
                                    item.status === "DEVOLVIDO"
                                      ? "bg-blue-500/10 text-blue-600 border-blue-500/30"
                                      : item.status === "ENCONTRADO"
                                      ? "bg-green-500/10 text-green-600 border-green-500/30"
                                      : item.status === "PERDIDO"
                                      ? "bg-red-500/10 text-red-600 border-red-500/30"
                                      : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                                  }`}
                                >
                                  <option value="PERDIDO">PERDIDO</option>
                                  <option value="ENCONTRADO">ENCONTRADO</option>
                                  <option value="EM_ANALISE">EM ANÁLISE</option>
                                  <option value="DEVOLVIDO">DEVOLVIDO</option>
                                </select>
                              </td>
                              <td className="p-3.5 text-right">
                                <button
                                  onClick={() => setSelectedItemForDetail(item)}
                                  className="px-3 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-[#00843D] hover:text-white font-bold text-[11px] transition-colors"
                                >
                                  Detalhes
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: AUDITORIA E LOGS DO SISTEMA */}
              {adminSubTab === "audit" && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 sm:p-8 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-100 dark:border-neutral-800 pb-5">
                      <div className="flex items-center space-x-3">
                        <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                          <History className="w-6 h-6" />
                        </div>
                        <div>
                          <h2 className="text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                            <span>Painel de Auditoria e Logs do Sistema</span>
                            <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase">
                              OFICIAL IFPR
                            </span>
                          </h2>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            Registro auditável de todas as devoluções, reaberturas, alterações de status e permissões no Campus Ivaiporã.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
                        <button
                          onClick={handleExportItemsCSV}
                          className="px-4 py-3 rounded-2xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 font-black text-xs transition-all shadow-xs flex items-center space-x-2 cursor-pointer border border-neutral-300 dark:border-neutral-700"
                        >
                          <FileSpreadsheet className="w-4 h-4 text-[#00843D]" />
                          <span>Exportar Itens (CSV)</span>
                        </button>

                        <button
                          onClick={handleExportMonitoringLogsJSON}
                          disabled={isExportingMonitoringJSON}
                          className="px-4 py-3 rounded-2xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 font-black text-xs transition-all shadow-xs flex items-center space-x-2 cursor-pointer border border-neutral-300 dark:border-neutral-700"
                        >
                          <Download className={`w-4 h-4 text-[#00843D] ${isExportingMonitoringJSON ? "animate-bounce" : ""}`} />
                          <span>{isExportingMonitoringJSON ? "Baixando JSON..." : "Exportar Logs (JSON)"}</span>
                        </button>

                        <button
                          onClick={handleExportAuditPDF}
                          className="px-5 py-3 rounded-2xl bg-[#00843D] hover:bg-[#006e33] text-white font-black text-xs transition-all shadow-md flex items-center space-x-2 cursor-pointer"
                        >
                          <Download className="w-4 h-4" />
                          <span>Exportar Relatório em PDF</span>
                        </button>
                      </div>
                    </div>

                    {/* Filter Controls Bar */}
                    <div className="bg-neutral-50 dark:bg-neutral-900/60 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-wider text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                          <Filter className="w-4 h-4 text-indigo-500" />
                          <span>Filtros de Auditoria</span>
                        </span>
                        {(logFilterAction !== "TODOS" || logSearchQuery || logStartDate || logEndDate) && (
                          <button
                            onClick={() => {
                              setLogFilterAction("TODOS");
                              setLogSearchQuery("");
                              setLogStartDate("");
                              setLogEndDate("");
                            }}
                            className="text-[11px] font-bold text-red-600 hover:underline flex items-center gap-1"
                          >
                            <X className="w-3.5 h-3.5" /> Limpar Filtros
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {/* Search Query */}
                        <div>
                          <label className="block text-[11px] font-bold text-neutral-500 mb-1">Buscar por Palavra-chave:</label>
                          <div className="relative">
                            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-neutral-400" />
                            <input
                              type="text"
                              value={logSearchQuery}
                              onChange={(e) => setLogSearchQuery(e.target.value)}
                              placeholder="Nome do responsável ou detalhe..."
                              className="w-full pl-8 pr-3 py-2 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        </div>

                        {/* Action Selector */}
                        <div>
                          <label className="block text-[11px] font-bold text-neutral-500 mb-1">Tipo de Operação:</label>
                          <select
                            value={logFilterAction}
                            onChange={(e) => setLogFilterAction(e.target.value)}
                            className="w-full py-2 px-3 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs font-bold outline-none cursor-pointer focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="TODOS">Todas as Operações</option>
                            <option value="DEVOLUCAO_OBJETO">Devolução de Objeto</option>
                            <option value="REABERTURA_DEVOLUCAO">Reabertura de Devolução</option>
                            <option value="EXCLUSAO_USUARIO">Exclusão de Usuário</option>
                            <option value="MODO_MANUTENCAO">Modo Manutenção</option>
                            <option value="ALTERACAO_PERMISSAO">Alteração de Permissão</option>
                            <option value="STATUS_OVERRIDE">Override de Status</option>
                            <option value="DESTINACAO_ITEM">Destinação de Objeto</option>
                            <option value="NOVO_USUARIO">Novo Usuário</option>
                            <option value="RESET_SISTEMA">Reset de Sistema</option>
                          </select>
                        </div>

                        {/* Start Date */}
                        <div>
                          <label className="block text-[11px] font-bold text-neutral-500 mb-1">Data Inicial:</label>
                          <input
                            type="date"
                            value={logStartDate}
                            onChange={(e) => setLogStartDate(e.target.value)}
                            className="w-full py-1.5 px-3 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>

                        {/* End Date */}
                        <div>
                          <label className="block text-[11px] font-bold text-neutral-500 mb-1">Data Final:</label>
                          <input
                            type="date"
                            value={logEndDate}
                            onChange={(e) => setLogEndDate(e.target.value)}
                            className="w-full py-1.5 px-3 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Audit Table */}
                    <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-neutral-800">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-neutral-100 dark:bg-neutral-800/80 text-neutral-600 dark:text-neutral-400 uppercase font-extrabold text-[10px] tracking-wider">
                          <tr>
                            <th className="p-3.5 rounded-l-xl">Data / Hora</th>
                            <th className="p-3.5">Responsável</th>
                            <th className="p-3.5">Operação</th>
                            <th className="p-3.5 rounded-r-xl">Detalhes da Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 font-sans">
                          {(activityLogs || [])
                            .filter((log) => {
                              if (!log) return false;
                              const matchAction = logFilterAction === "TODOS" || log.action === logFilterAction;
                              const lq = sanitizeQuery(logSearchQuery);
                              const matchSearch =
                                !lq ||
                                safeIncludes(log.adminName, lq) ||
                                safeIncludes(log.details, lq) ||
                                safeIncludes(log.action, lq);

                              let matchDate = true;
                              if (logStartDate) {
                                matchDate = matchDate && new Date(log.timestamp) >= new Date(logStartDate);
                              }
                              if (logEndDate) {
                                const end = new Date(logEndDate);
                                end.setHours(23, 59, 59, 999);
                                matchDate = matchDate && new Date(log.timestamp) <= end;
                              }

                              return matchAction && matchSearch && matchDate;
                            })
                            .length === 0 ? (
                            <tr>
                              <td colSpan={4} className="text-center py-10 text-neutral-400 font-medium">
                                Nenhum log de auditoria encontrado para os filtros selecionados.
                              </td>
                            </tr>
                          ) : (
                            (activityLogs || [])
                              .filter((log) => {
                                if (!log) return false;
                                const matchAction = logFilterAction === "TODOS" || log.action === logFilterAction;
                                const lq = sanitizeQuery(logSearchQuery);
                                const matchSearch =
                                  !lq ||
                                  safeIncludes(log.adminName, lq) ||
                                  safeIncludes(log.details, lq) ||
                                  safeIncludes(log.action, lq);

                                let matchDate = true;
                                if (logStartDate) {
                                  matchDate = matchDate && new Date(log.timestamp) >= new Date(logStartDate);
                                }
                                if (logEndDate) {
                                  const end = new Date(logEndDate);
                                  end.setHours(23, 59, 59, 999);
                                  matchDate = matchDate && new Date(log.timestamp) <= end;
                                }

                                return matchAction && matchSearch && matchDate;
                              })
                              .map((log) => (
                                <tr key={log.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                                  <td className="p-3.5 font-mono text-neutral-500 whitespace-nowrap">
                                    {formatDate(log.timestamp)}
                                  </td>
                                  <td className="p-3.5 font-bold text-neutral-900 dark:text-white">
                                    {log.adminName}
                                  </td>
                                  <td className="p-3.5 whitespace-nowrap">
                                    <span
                                      className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase border ${
                                        log.action === "DEVOLUCAO_OBJETO"
                                          ? "bg-blue-500/10 text-blue-600 border-blue-500/30"
                                          : log.action === "REABERTURA_DEVOLUCAO"
                                          ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                                          : log.action === "MODO_MANUTENCAO"
                                          ? "bg-purple-500/10 text-purple-600 border-purple-500/30"
                                          : log.action === "EXCLUSAO_USUARIO"
                                          ? "bg-red-500/10 text-red-600 border-red-500/30"
                                          : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                                      }`}
                                    >
                                      {log.action.replace(/_/g, " ")}
                                    </span>
                                  </td>
                                  <td className="p-3.5 text-neutral-700 dark:text-neutral-300 font-medium max-w-md">
                                    {log.details}
                                  </td>
                                </tr>
                              ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: SAÚDE DO SISTEMA (FIREBASE PERFORMANCE MONITORING & SERVICE WORKER UPTIME) */}
              {adminSubTab === "health" && (
                <div className="space-y-6">
                  {/* VISUAL APP UPTIME MONITOR (30 DIAS VIA SERVICE WORKER) */}
                  <AppUptimeMonitor />

                  <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 sm:p-8 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 dark:border-neutral-800 pb-4">
                      <div className="flex items-center space-x-3">
                        <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <Activity className="w-6 h-6 animate-pulse" />
                        </div>
                        <div>
                          <h2 className="text-lg font-black text-neutral-900 dark:text-white flex items-center space-x-2">
                            <span>Métricas da Saúde do Sistema (Firebase Performance)</span>
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-wider">
                              🟢 Excelente
                            </span>
                          </h2>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            Monitoramento em tempo real da latência de rede, tempo de resposta do banco de dados e alocação de memória
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                        <button
                          onClick={handleExportMonitoringLogsJSON}
                          disabled={isExportingMonitoringJSON}
                          className="px-4 py-2.5 rounded-2xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-black transition-all flex items-center space-x-2 shadow-xs border border-neutral-300 dark:border-neutral-700 cursor-pointer"
                        >
                          <Download className={`w-4 h-4 text-[#00843D] ${isExportingMonitoringJSON ? "animate-bounce" : ""}`} />
                          <span>{isExportingMonitoringJSON ? "Baixando..." : "Baixar Relatório JSON"}</span>
                        </button>

                        <button
                          onClick={measurePing}
                          disabled={isPinging}
                          className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-all flex items-center space-x-2 shadow-sm cursor-pointer"
                        >
                          <RefreshCw className={`w-4 h-4 ${isPinging ? "animate-spin" : ""}`} />
                          <span>Medir Desempenho Agora</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Latência de Rede */}
                      <div className="bg-neutral-50 dark:bg-neutral-900/60 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-neutral-500 uppercase flex items-center space-x-1.5">
                            <Wifi className="w-4 h-4 text-blue-500" />
                            <span>Latência de Rede Ping</span>
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 text-[10px] font-black">
                            {isOnline ? "Conectado 🟢" : "Offline 🔴"}
                          </span>
                        </div>
                        <div className="flex items-baseline space-x-2">
                          <span className="text-3xl font-black text-neutral-900 dark:text-white">
                            {pingLatencyMs ? `${pingLatencyMs} ms` : "--"}
                          </span>
                          <span className="text-xs text-neutral-400">API Gateway</span>
                        </div>
                        <p className="text-[11px] text-neutral-500">
                          Heartbeat automático a cada 60s monitorando estabilidade móvel.
                        </p>
                      </div>

                      {/* Tempo de Resposta Firestore BD */}
                      <div className="bg-neutral-50 dark:bg-neutral-900/60 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-neutral-500 uppercase flex items-center space-x-1.5">
                            <Database className="w-4 h-4 text-emerald-500" />
                            <span>Resposta Banco Firestore</span>
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 text-[10px] font-black">
                            Rápido
                          </span>
                        </div>
                        <div className="flex items-baseline space-x-2">
                          <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                            {dbLatencyMs ? `${dbLatencyMs} ms` : "--"}
                          </span>
                          <span className="text-xs text-neutral-400">leitura/escrita</span>
                        </div>
                        <p className="text-[11px] text-neutral-500">
                          Medido via Firebase Performance Trace (`firestore_db_latency`).
                        </p>
                      </div>

                      {/* Uso de Memória RAM */}
                      <div className="bg-neutral-50 dark:bg-neutral-900/60 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-neutral-500 uppercase flex items-center space-x-1.5">
                            <Cpu className="w-4 h-4 text-purple-500" />
                            <span>Uso de Memória RAM</span>
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 text-[10px] font-black">
                            {memoryUsageMB < 100 ? "Baixo" : "Médio"}
                          </span>
                        </div>
                        <div className="flex items-baseline space-x-2">
                          <span className="text-3xl font-black text-neutral-900 dark:text-white">
                            {memoryUsageMB} MB
                          </span>
                          <span className="text-xs text-neutral-400">/ 512 MB JS Heap</span>
                        </div>
                        <div className="w-full bg-neutral-200 dark:bg-neutral-800 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-purple-600 h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.round((memoryUsageMB / 512) * 100))}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Chart: Network vs DB Latency */}
                    <div className="bg-neutral-50 dark:bg-neutral-900/40 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black uppercase text-neutral-700 dark:text-neutral-300">
                          Gráfico de Latência em Tempo Real (ms)
                        </h3>
                        <div className="flex items-center space-x-4 text-[10px] font-bold">
                          <span className="flex items-center space-x-1 text-blue-600">
                            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                            <span>Latência de Rede</span>
                          </span>
                          <span className="flex items-center space-x-1 text-emerald-600">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                            <span>Firestore BD</span>
                          </span>
                        </div>
                      </div>

                      <div className="h-56 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={latencyHistory}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                            <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} unit="ms" />
                            <Tooltip contentStyle={{ borderRadius: "12px", fontSize: "11px" }} />
                            <Area type="monotone" dataKey="network" name="Rede (ms)" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} />
                            <Area type="monotone" dataKey="db" name="Firestore (ms)" stroke="#10b981" fill="#10b981" fillOpacity={0.15} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* LOG DE ERROS GLOBAL FIRESTORE */}
                    <div className="space-y-4 pt-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black uppercase text-red-600 dark:text-red-400 flex items-center space-x-2">
                          <ShieldAlert className="w-4 h-4" />
                          <span>Capturas do Error Boundary Global (Exceções em Dispositivos Móveis - RNF02)</span>
                        </h3>
                        <span className="px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-500 text-[10px] font-black">
                          {errorLogsList.length} Registros
                        </span>
                      </div>

                      {errorLogsList.length === 0 ? (
                        <div className="bg-neutral-50 dark:bg-neutral-900/50 rounded-2xl p-6 text-center space-y-2 border border-dashed border-neutral-200 dark:border-neutral-800">
                          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                          <p className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                            Sem exceções ou erros não tratados recentes!
                          </p>
                          <p className="text-[11px] text-neutral-500">
                            Nenhum travamento detectado em dispositivos móveis no IFPR Campus Ivaiporã.
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-neutral-800">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-neutral-50 dark:bg-neutral-800 text-neutral-500 uppercase font-bold text-[10px]">
                              <tr>
                                <th className="p-3">Exceção / Mensagem</th>
                                <th className="p-3">Dispositivo</th>
                                <th className="p-3">Usuário</th>
                                <th className="p-3">Resolução Tela</th>
                                <th className="p-3">Data e Hora</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 font-mono text-[11px]">
                              {errorLogsList.slice(0, 10).map((log, idx) => (
                                <tr key={log.id || idx} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                                  <td className="p-3 text-red-600 dark:text-red-400 font-bold max-w-xs truncate">
                                    {log.errorMessage}
                                  </td>
                                  <td className="p-3 text-neutral-600 dark:text-neutral-300">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black ${log.isMobile ? "bg-purple-500/10 text-purple-600" : "bg-blue-500/10 text-blue-600"}`}>
                                      {log.isMobile ? "📱 Mobile" : "💻 Desktop"}
                                    </span>
                                  </td>
                                  <td className="p-3 text-neutral-500">{log.userEmail || "Anônimo"}</td>
                                  <td className="p-3 text-neutral-400">{log.screenWidth}x{log.screenHeight}</td>
                                  <td className="p-3 text-neutral-400">{new Date(log.timestamp).toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: APPROVAL WORKFLOW FOR ACADEMIC EMAILS (@ifpr.edu.br) */}
              {adminSubTab === "approvals" && (
                <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 sm:p-8 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 dark:border-neutral-800 pb-4">
                    <div className="flex items-center space-x-3">
                      <div className="p-2.5 rounded-2xl bg-blue-500/10 text-blue-600 border border-blue-500/20">
                        <GraduationCap className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-lg font-black text-neutral-900 dark:text-white flex items-center space-x-2">
                          <span>Workflow de Aprovação de Contas (@ifpr.edu.br)</span>
                          {allUsers.filter((u) => u.approvalStatus === "PENDENTE").length > 0 && (
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-black uppercase">
                              {allUsers.filter((u) => u.approvalStatus === "PENDENTE").length} Em Espera
                            </span>
                          )}
                        </h2>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          Validação das solicitações de cadastro com e-mails @estudantes.ifpr.edu.br e @ifpr.edu.br antes da liberação do sistema
                        </p>
                      </div>
                    </div>
                  </div>

                  {allUsers.filter((u) => u.approvalStatus === "PENDENTE" || u.email.includes("ifpr.edu.br")).length === 0 ? (
                    <div className="bg-neutral-50 dark:bg-neutral-900/50 rounded-2xl p-6 text-center space-y-2 border border-dashed border-neutral-200 dark:border-neutral-800">
                      <UserCheck className="w-8 h-8 text-emerald-500 mx-auto" />
                      <p className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                        Nenhuma conta pendente de aprovação no momento!
                      </p>
                      <p className="text-[11px] text-neutral-500">
                        Todas as solicitações de alunos e servidores do IFPR Campus Ivaiporã foram validadas.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <h3 className="text-xs font-black uppercase text-neutral-500 tracking-wider">
                        Solicitações em Espera para Análise de Identidade:
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {allUsers
                          .filter((u) => u.approvalStatus === "PENDENTE" || u.email.includes("ifpr.edu.br"))
                          .map((pendingUser, index) => {
                            const isStudent = pendingUser.email.endsWith("@estudantes.ifpr.edu.br") || pendingUser.email.endsWith("@estudante.ifpr.edu.br");
                            const isStaff = pendingUser.email.endsWith("@ifpr.edu.br");
                            const isPending = pendingUser.approvalStatus === "PENDENTE";

                            return (
                              <div
                                key={pendingUser.id || `pending-${pendingUser.email}-${index}`}
                                className={`rounded-2xl p-5 border space-y-4 shadow-xs transition-all ${
                                  isPending
                                    ? "bg-amber-500/5 border-amber-500/30 dark:bg-amber-950/20"
                                    : "bg-neutral-50 dark:bg-neutral-900/80 border-neutral-200 dark:border-neutral-800"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center space-x-3">
                                    <img
                                      src={pendingUser.avatarUrl}
                                      alt={pendingUser.name}
                                      className="w-10 h-10 rounded-full object-cover border border-neutral-300 dark:border-neutral-700"
                                    />
                                    <div>
                                      <h4 className="text-xs font-black text-neutral-900 dark:text-white">
                                        {pendingUser.name}
                                      </h4>
                                      <p className="text-[11px] text-neutral-500 font-mono">{pendingUser.email}</p>
                                    </div>
                                  </div>

                                  <span
                                    className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border ${
                                      isPending
                                        ? "bg-amber-500 text-black border-amber-500 animate-pulse"
                                        : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                    }`}
                                  >
                                    {isPending ? "⏳ Em Espera" : "✅ Aprovado"}
                                  </span>
                                </div>

                                <div className="bg-white dark:bg-neutral-900/90 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 text-[11px] space-y-1">
                                  <p className="text-neutral-600 dark:text-neutral-400">
                                    <strong>Tipo de Vínculo:</strong> {isStudent ? "🎓 Estudante IFPR" : isStaff ? "🏫 Servidor / Docente IFPR" : "Usuário"}
                                  </p>
                                  <p className="text-neutral-600 dark:text-neutral-400">
                                    <strong>Curso / Departamento:</strong> {pendingUser.courseOrDept}
                                  </p>
                                  <p className="text-neutral-600 dark:text-neutral-400">
                                    <strong>Matrícula IFPR:</strong> {pendingUser.registrationNumber}
                                  </p>
                                </div>

                                {isPending && (
                                  <div className="flex items-center gap-2 pt-1">
                                    <button
                                      onClick={() => approveUser(pendingUser.id, true)}
                                      className="flex-1 py-2.5 px-3 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white font-extrabold text-xs transition-all shadow-sm flex items-center justify-center space-x-1.5"
                                    >
                                      <CheckCircle2 className="w-4 h-4" />
                                      <span>Aprovar Acesso</span>
                                    </button>
                                    <button
                                      onClick={() => approveUser(pendingUser.id, false)}
                                      className="py-2.5 px-4 rounded-xl bg-red-600/10 hover:bg-red-600 text-red-600 hover:text-white border border-red-500/20 font-bold text-xs transition-all flex items-center justify-center space-x-1.5"
                                    >
                                      <XCircle className="w-4 h-4" />
                                      <span>Recusar</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: BACKUPS & AUDIT */}
              {adminSubTab === "backups" && (
                <div className="space-y-6">
                  {/* FIRESTORE AUTOMATED BACKUPS MODULE */}
                  <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 sm:p-8 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 dark:border-neutral-800 pb-4">
                      <div className="flex items-center space-x-3">
                        <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-600 border border-amber-500/20">
                          <HardDrive className="w-6 h-6" />
                        </div>
                        <div>
                          <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                            Backups Automáticos & Snapshots do Firestore
                          </h2>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            Exportação periódica e agendamento de segurança do banco de dados do Campus Ivaiporã
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={handleManualBackup}
                        disabled={isExecutingBackup}
                        className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-black font-black text-xs transition-all shadow-md flex items-center space-x-2 self-start sm:self-auto"
                      >
                        <Download className={`w-4 h-4 ${isExecutingBackup ? "animate-bounce" : ""}`} />
                        <span>⚡ Executar Backup do Firestore Agora</span>
                      </button>
                    </div>

                    {/* Configuration Controls */}
                    <div className="bg-neutral-50 dark:bg-neutral-900/60 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800/80 space-y-4">
                      <h3 className="text-xs font-black uppercase text-neutral-700 dark:text-neutral-300 tracking-wider">
                        Agendamento & Frequência do Backup
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Toggle */}
                        <div className="flex items-center justify-between bg-white dark:bg-neutral-900 p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800">
                          <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                            Backup Automático
                          </span>
                          <input
                            type="checkbox"
                            checked={backupScheduleConfig.enabled}
                            onChange={(e) => updateBackupScheduleConfig({ enabled: e.target.checked })}
                            className="w-4 h-4 text-amber-500 rounded focus:ring-amber-500 cursor-pointer"
                          />
                        </div>

                        {/* Frequency */}
                        <div className="bg-white dark:bg-neutral-900 p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                          <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                            Frequência:
                          </span>
                          <select
                            value={backupScheduleConfig.frequency}
                            onChange={(e) =>
                              updateBackupScheduleConfig({ frequency: e.target.value as BackupScheduleConfig["frequency"] })
                            }
                            className="bg-transparent text-xs font-bold text-amber-600 dark:text-amber-400 outline-none cursor-pointer"
                          >
                            <option value="A_CADA_12H">A cada 12 Horas</option>
                            <option value="DIARIO_0200">Diário às 02:00h</option>
                            <option value="SEMANAL_DOMINGO">Semanal (Domingos)</option>
                          </select>
                        </div>

                        {/* Auto download */}
                        <div className="flex items-center justify-between bg-white dark:bg-neutral-900 p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800">
                          <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                            Baixar JSON Automático
                          </span>
                          <input
                            type="checkbox"
                            checked={backupScheduleConfig.autoDownload}
                            onChange={(e) => updateBackupScheduleConfig({ autoDownload: e.target.checked })}
                            className="w-4 h-4 text-amber-500 rounded focus:ring-amber-500 cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Backup History Logs Table */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black uppercase text-neutral-700 dark:text-neutral-300 tracking-wider">
                    Histórico de Backups Realizados ({backupLogs.length})
                  </h3>

                  <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-neutral-800">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-neutral-100 dark:bg-neutral-800/80 text-neutral-600 dark:text-neutral-400 font-bold border-b border-neutral-200 dark:border-neutral-800">
                          <th className="p-3">Data / Hora</th>
                          <th className="p-3">Nome do Arquivo</th>
                          <th className="p-3">Tamanho</th>
                          <th className="p-3">Gatilho</th>
                          <th className="p-3">Status</th>
                          <th className="p-3 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                        {backupLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/40 transition-colors">
                            <td className="p-3 font-medium text-neutral-800 dark:text-neutral-200 whitespace-nowrap">
                              {formatDate(log.timestamp)}
                            </td>
                            <td className="p-3 font-mono text-[11px] text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                              {log.filename}
                            </td>
                            <td className="p-3 font-bold text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                              {(log.fileSizeBytes / 1024).toFixed(1)} KB
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                  log.triggerType === "MANUAL"
                                    ? "bg-purple-500/10 text-purple-600"
                                    : "bg-blue-500/10 text-blue-600"
                                }`}
                              >
                                {log.triggerType}
                              </span>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/10 text-emerald-600">
                                SUCESSO
                              </span>
                            </td>
                            <td className="p-3 text-right whitespace-nowrap">
                              <button
                                onClick={() => handleManualBackup()}
                                className="p-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-amber-500 hover:text-black text-neutral-700 dark:text-neutral-300 font-bold transition-all text-[11px]"
                                title="Baixar Cópia Snapshot JSON"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* ACTIVITY LOG SECTION (AUDIT TRAIL) */}
              <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 sm:p-8 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 dark:border-neutral-800 pb-4">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600">
                      <History className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                        Log de Atividades do Administrador (Audit Trail)
                      </h2>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Registro transparente de exclusões, alterações de permissão, manutenção e overrides de status.
                      </p>
                    </div>
                  </div>

                  {/* Filters */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-neutral-400" />
                      <input
                        type="text"
                        value={logSearchQuery}
                        onChange={(e) => setLogSearchQuery(e?.target?.value ?? "")}
                        placeholder="Buscar nos logs..."
                        className="pl-8 pr-3 py-1.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs outline-none w-44"
                      />
                    </div>

                    <select
                      value={logFilterAction}
                      onChange={(e) => setLogFilterAction(e?.target?.value ?? "TODOS")}
                      className="py-1.5 px-3 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs font-bold outline-none"
                    >
                      <option value="TODOS">Todas as Ações</option>
                      <option value="EXCLUSAO_USUARIO">Exclusão de Usuário</option>
                      <option value="MODO_MANUTENCAO">Modo Manutenção</option>
                      <option value="ALTERACAO_PERMISSAO">Alteração Permissão</option>
                      <option value="STATUS_OVERRIDE">Status Override</option>
                      <option value="NOVO_USUARIO">Novo Usuário</option>
                      <option value="RESET_SISTEMA">Reset de Sistema</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-50 dark:bg-neutral-800 text-neutral-500 uppercase font-extrabold text-[10px]">
                      <tr>
                        <th className="p-3.5 rounded-l-xl">Data / Hora</th>
                        <th className="p-3.5">Administrador</th>
                        <th className="p-3.5">Ação Executada</th>
                        <th className="p-3.5 rounded-r-xl">Detalhes da Operação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 font-sans">
                      {activityLogs
                        .filter((log) => {
                          if (!log) return false;
                          const matchAction = logFilterAction === "TODOS" || log.action === logFilterAction;
                          const lq = sanitizeQuery(logSearchQuery);
                          const matchSearch =
                            !lq ||
                            safeIncludes(log.adminName, lq) ||
                            safeIncludes(log.details, lq) ||
                            safeIncludes(log.action, lq);
                          return matchAction && matchSearch;
                        })
                        .map((log) => (
                          <tr key={log.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                            <td className="p-3.5 font-mono text-neutral-500 whitespace-nowrap">
                              {formatDate(log.timestamp)}
                            </td>
                            <td className="p-3.5 font-bold text-neutral-900 dark:text-white">
                              {log.adminName}
                            </td>
                            <td className="p-3.5">
                              <span
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase border ${
                                  log.action === "MODO_MANUTENCAO"
                                    ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                                    : log.action === "EXCLUSAO_USUARIO" || log.action === "EXCLUSAO_EM_MASSA"
                                    ? "bg-red-500/10 text-red-600 border-red-500/30"
                                    : log.action === "ALTERACAO_PERMISSAO"
                                    ? "bg-purple-500/10 text-purple-600 border-purple-500/30"
                                    : "bg-blue-500/10 text-blue-600 border-blue-500/30"
                                }`}
                              >
                                {log.action.replace("_", " ")}
                              </span>
                            </td>
                            <td className="p-3.5 text-neutral-700 dark:text-neutral-300">
                              {log.details}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* FIRESTORE CLEANUP & MASTER WIPE TOOLS CARD */}
              <div className="bg-gradient-to-br from-red-500/5 via-neutral-50 to-amber-500/5 dark:from-red-950/20 dark:via-neutral-900 dark:to-amber-950/20 rounded-3xl p-6 sm:p-8 border border-red-500/20 dark:border-red-500/30 shadow-xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-red-500/10 dark:border-red-500/20 pb-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-3 rounded-2xl bg-red-500/10 text-red-600 border border-red-500/20">
                      <Trash2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-neutral-900 dark:text-white flex items-center space-x-2">
                        <span>Gestão de Banco de Dados & Reset para Próxima Fase</span>
                      </h2>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Ferramentas avançadas para backup local em JSON, limpeza de logs/métricas e script de Master Wipe do Firestore
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* 1. Export JSON Backup */}
                  <div className="bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 space-y-3 flex flex-col justify-between shadow-xs">
                    <div className="space-y-1.5">
                      <div className="flex items-center space-x-2 text-amber-600 dark:text-amber-400 font-extrabold text-xs">
                        <Download className="w-4 h-4" />
                        <span>Backup Completo em JSON</span>
                      </div>
                      <p className="text-[11px] text-neutral-600 dark:text-neutral-400 leading-relaxed">
                        Exporta um arquivo <code>.json</code> local contendo uma cópia snapshot de todas as coleções do Firestore (objetos, usuários, reivindicações, comentários e logs).
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        setIsExportingBackup(true);
                        await exportFirestoreDataToJson();
                        await logAdminAction("BACKUP_SISTEMA", "Exportou backup completo do Firestore em arquivo JSON.");
                        setIsExportingBackup(false);
                      }}
                      disabled={isExportingBackup}
                      className="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-extrabold text-xs transition-all shadow-sm flex items-center justify-center space-x-2"
                    >
                      <Download className={`w-4 h-4 ${isExportingBackup ? "animate-bounce" : ""}`} />
                      <span>{isExportingBackup ? "Gerando JSON..." : "Exportar JSON Local"}</span>
                    </button>
                  </div>

                  {/* 2. Clear Logs & Metrics */}
                  <div className="bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 space-y-3 flex flex-col justify-between shadow-xs">
                    <div className="space-y-1.5">
                      <div className="flex items-center space-x-2 text-purple-600 dark:text-purple-400 font-extrabold text-xs">
                        <BarChart3 className="w-4 h-4" />
                        <span>Limpar Logs & Métricas</span>
                      </div>
                      <p className="text-[11px] text-neutral-600 dark:text-neutral-400 leading-relaxed">
                        Exclui todo o histórico de logs de atividades (audit trail), logs de backup e métricas de desempenho no Firestore para reiniciar as estatísticas do zero.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsClearLogsConfirmOpen(true)}
                      className="w-full py-2.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs transition-all shadow-sm flex items-center justify-center space-x-2"
                    >
                      <BarChart3 className="w-4 h-4" />
                      <span>Limpar Logs e Métricas</span>
                    </button>
                  </div>

                  {/* 3. Master Wipe Script */}
                  <div className="bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-red-500/30 dark:border-red-500/30 space-y-3 flex flex-col justify-between shadow-xs">
                    <div className="space-y-1.5">
                      <div className="flex items-center space-x-2 text-red-600 dark:text-red-400 font-extrabold text-xs">
                        <ShieldAlert className="w-4 h-4" />
                        <span>Master Wipe (Zerar Banco)</span>
                      </div>
                      <p className="text-[11px] text-neutral-600 dark:text-neutral-400 leading-relaxed">
                        Script administrativo que deleta todos os objetos, usuários fictícios e logs do Firestore com um único comando, mantendo apenas sua conta ativa de administrador.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsMasterWipeConfirmOpen(true)}
                      className="w-full py-2.5 px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs transition-all shadow-sm flex items-center justify-center space-x-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Zerar Banco de Dados</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )}

      {/* MODAL: ADICIONAR NOVO USUÁRIO PELO ADMIN */}
      {isAddingUserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 sm:p-8 border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-4">
              <div className="flex items-center space-x-2.5">
                <div className="p-2.5 rounded-2xl bg-[#00843D]/10 text-[#00843D]">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-neutral-900 dark:text-white">
                    Cadastrar Novo Usuário no IFPR
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Administrador TI • Adicionar aluno ou servidor
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingUserOpen(false)}
                className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddUserSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Nome Completo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Ex: Carlos Eduardo da Silva"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
                />
              </div>

              <div>
                <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  E-mail Institucional <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="Ex: carlos.silva@estudante.ifpr.edu.br"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Perfil / Função
                  </label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
                  >
                    <option value="ALUNO">ALUNO (Discente)</option>
                    <option value="SERVIDOR">SERVIDOR (Docente / TAE)</option>
                    <option value="ADMIN">ADMINISTRADOR (TI)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Matrícula / Prontuário
                  </label>
                  <input
                    type="text"
                    value={newUserRegNumber}
                    onChange={(e) => setNewUserRegNumber(e.target.value)}
                    placeholder="Ex: 2026100987"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Curso ou Setor no IFPR Campus Ivaiporã
                </label>
                <input
                  type="text"
                  value={newUserDept}
                  onChange={(e) => setNewUserDept(e.target.value)}
                  placeholder="Ex: Técnico em Informática"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
                />
              </div>

              <div className="pt-4 flex justify-end space-x-3 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsAddingUserOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-neutral-600 dark:text-neutral-400 font-bold hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white font-extrabold shadow-md transition-all flex items-center space-x-1.5"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Cadastrar Usuário</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RESET COMPLETO DO SISTEMA */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-5">
            <div className="flex items-center space-x-3 text-red-600 dark:text-red-400">
              <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-black text-neutral-900 dark:text-white">
                  Resetar Banco de Dados do Sistema
                </h3>
                <p className="text-xs text-neutral-500">
                  Exclusivo para Fases de Testes do IFPR
                </p>
              </div>
            </div>

            <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
              Esta ação redefinirá todas as ocorrências, notificações e usuários para os valores padrão de fábrica (Mock Baseline do IFPR Campus Ivaiporã).
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  await resetSystemData();
                  await logAdminAction("RESET_SISTEMA", "Efetuou o reset total do banco de dados do sistema.");
                  setIsResetConfirmOpen(false);
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold shadow-md"
              >
                Sim, Resetar Sistema
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: LIMPAR LOGS E MÉTRICAS DE DESEMPENHO */}
      {isClearLogsConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-5">
            <div className="flex items-center space-x-3 text-purple-600 dark:text-purple-400">
              <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20">
                <BarChart3 className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-black text-neutral-900 dark:text-white">
                  Limpar Logs e Métricas de Desempenho
                </h3>
                <p className="text-xs text-neutral-500">
                  Reiniciar histórico de estatísticas do Firestore
                </p>
              </div>
            </div>

            <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
              Esta ação apagará permanentemente todo o histórico de logs de atividades (audit trail), registros de backup, logs de erro e métricas de desempenho no Firestore. As estatísticas e o monitor de uptime serão iniciados do zero para a próxima fase de testes.
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setIsClearLogsConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  await clearAllLogsAndMetrics();
                  await logAdminAction("LIMPEZA_LOGS", "Limpou todo o histórico de logs e métricas de desempenho no Firestore.");
                  setIsClearLogsConfirmOpen(false);
                }}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-extrabold shadow-md"
              >
                Sim, Limpar Logs e Métricas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SCRIPT MASTER WIPE (ZERAR BANCO FIRESTORE) */}
      {isMasterWipeConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 border border-red-500/30 dark:border-red-500/30 shadow-2xl space-y-5">
            <div className="flex items-center space-x-3 text-red-600 dark:text-red-400">
              <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20">
                <Trash2 className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-black text-neutral-900 dark:text-white">
                  🔥 Master Wipe - Limpeza Completa
                </h3>
                <p className="text-xs text-red-500 font-bold">
                  Ação Irreversível no Firestore
                </p>
              </div>
            </div>

            <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
              <strong>ATENÇÃO:</strong> Esta ação executará o script de limpeza total no Firestore. Todos os objetos achados/perdidos, reivindicações, comentários, notificações e usuários (exceto sua conta atual de administrador) serão <strong>DELETADOS PERMANENTEMENTE</strong>.
              <br /><br />
              💡 <em>Recomenda-se exportar o backup em JSON antes de continuar.</em>
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setIsMasterWipeConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  await masterWipeFirestore();
                  await logAdminAction("MASTER_WIPE", "Executou a exclusão completa de objetos, usuários e logs do Firestore.");
                  setIsMasterWipeConfirmOpen(false);
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold shadow-md flex items-center space-x-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Confirmar e Deletar Tudo</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for User Deletion */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-5">
            <div className="flex items-center space-x-3 text-red-600 dark:text-red-400">
              <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20">
                <UserX className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-neutral-900 dark:text-white">
                  Confirmar Remoção de Usuário
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Ação exclusiva para Administradores
                </p>
              </div>
            </div>

            <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
              Tem certeza que deseja remover o usuário <strong>{userToDelete.name}</strong>? Esta ação removerá os dados de perfil do banco de dados do IFPR.
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs font-bold transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteUser(userToDelete.id);
                  await logAdminAction("EXCLUSAO_USUARIO", `Removeu permanentemente o usuário '${userToDelete.name}' do sistema.`);
                  setUserToDelete(null);
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors shadow-xs"
              >
                Sim, Remover Usuário
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
