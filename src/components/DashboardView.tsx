import React, { useState, useEffect, useMemo } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useApp } from "../context/AppContext";
import { useRouter } from "../context/RouterContext";
import { formatDate, formatDateTime, safeParseDate, triggerVibration, vibrateClick, vibrateSuccess, vibrateWarning, vibrateCritical, safeToLower, safeIncludes, sanitizeQuery } from "../lib/utils";
import { UserRole, User, AccountStatus, ActivityLog, BackupScheduleConfig, ItemClaim } from "../types";
import { AppUptimeMonitor } from "./AppUptimeMonitor";
import { MonthlyItemsD3Chart } from "./MonthlyItemsD3Chart";
import { WeeklyFlowD3Chart } from "./WeeklyFlowD3Chart";
import { DocumentManagerView } from "./DocumentManagerView";
import { ProjectConfigView } from "./documents/ProjectConfigView";
import { VersionHistoryView } from "./VersionHistoryView";
import { TestBatteryManagerView } from "./TestBatteryManagerView";
import { AuditTrailManagerView } from "./AuditTrailManagerView";
import { CustodyRemindersView } from "./CustodyRemindersView";
import { DigitalReturnsD3Chart } from "./DigitalReturnsD3Chart";
import { ExportFoundItemsReportModal } from "./ExportFoundItemsReportModal";
import { ManageUserStatusModal } from "./ManageUserStatusModal";
import { AccountManagementView } from "./AccountManagementView";
import { getSafeAvatarUrl, handleAvatarError } from "../lib/avatarUtils";
import { resolveAccountStatus, formatAccountStatusDetails } from "../lib/accountStatusUtils";
import { CANONICAL_ITEM_CATEGORIES } from "../lib/categoryUtils";
import {
  computeDashboardReturnMetrics,
  isRecipientReturnConcluded,
  sortAndFilterAdminTableItems,
  buildPieCategoryData,
  readAvailableMemoryUsageMB,
} from "../lib/dashboardMetricsUtils";
import { SurfaceCard, UIButton, UIBadge, EmptyState } from "./ui";
import { auth, db, traceFirebasePerformance } from "../lib/firebase";
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
  Sparkles,
  GitBranch,
  Mail,
  Send,
  Bell,
  MessageSquare,
  PackageCheck,
  FileCheck2,
  ShieldCheck,
  Shuffle,
  Settings,
  Ban,
  UserMinus,
  Loader2,
  FileSignature,
  PenTool,
} from "lucide-react";

export const DashboardView: React.FC = () => {
  const {
    items,
    currentUser,
    allUsers,
    updateUserRole,
    updateUserStatus,
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
    approveAllPendingUsers,
    backupLogs,
    backupScheduleConfig,
    updateBackupScheduleConfig,
    executeFirestoreBackupNow,
    claims,
    updateClaimStatus,
    activityLogs,
    logAdminAction,
    systemLatencyMs,
    isOnline,
    lastHeartbeatTimestamp,
    indexedDbLoaded,
    errorLogsList,
    sendNotificationToUser,
    darkMode,
    requestAuthForRegistration,
  } = useApp();

  const { navigate } = useRouter();

  // Notification Modal State (Admin to Student)
  const [notifyModalUser, setNotifyModalUser] = useState<any | null>(null);
  const [isBroadcastNotification, setIsBroadcastNotification] = useState(false);
  const [notifyTitle, setNotifyTitle] = useState("");
  const [notifyMessage, setNotifyMessage] = useState("");
  const [notifyRelatedItemId, setNotifyRelatedItemId] = useState("");
  const [isSendingNotif, setIsSendingNotif] = useState(false);

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
  const [userStatusFilter, setUserStatusFilter] = useState<"ALL" | "active" | "suspended" | "banned">("ALL");
  const [userSearchText, setUserSearchText] = useState("");
  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [userForStatusModal, setUserForStatusModal] = useState<User | null>(null);
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
  const [adminTableLimit, setAdminTableLimit] = useState<number>(15);
  const [serverFilterStatus, setServerFilterStatus] = useState<string>("TODOS");
  const [confirmingArrivalId, setConfirmingArrivalId] = useState<string | null>(null);
  const [serverOverviewLimit, setServerOverviewLimit] = useState<number>(15);

  useEffect(() => {
    setAdminTableLimit(15);
  }, [tableSearch, tableCategory]);

  useEffect(() => {
    setServerOverviewLimit(15);
  }, [serverFilterStatus, tableSearch]);

  const serverCustodyFilteredItems = useMemo(() => {
    return sortAndFilterAdminTableItems(items, {
      search: tableSearch,
      statusFilter: serverFilterStatus,
    });
  }, [items, serverFilterStatus, tableSearch]);

  const handleConfirmArrival = async (it: (typeof items)[number]) => {
    if (!it || confirmingArrivalId) return;
    vibrateClick();
    setConfirmingArrivalId(it.id);
    try {
      await updateItemStatus(it.id, "EM_ANALISE");
      vibrateSuccess();
    } catch (err) {
      console.error("[DashboardView] Falha ao confirmar chegada do objeto:", err);
    } finally {
      setConfirmingArrivalId(null);
    }
  };

  const handleAdminStatusOverride = async (
    it: (typeof items)[number],
    newStatus: "PERDIDO" | "ENCONTRADO" | "EM_ANALISE"
  ) => {
    if (!it || newStatus === it.status) return;
    try {
      await updateItemStatus(it.id, newStatus);
    } catch (err) {
      console.error("[DashboardView] Falha ao atualizar status via override:", err);
    }
  };

  const handleOpenNotifyModalForItem = (it: (typeof items)[number]) => {
    if (!it) return;
    vibrateClick();
    const studentUser = (allUsers || []).find(
      (u) =>
        u &&
        (u.id === it.registeredByUserId ||
          (it.contactInfo && (u.email === it.contactInfo || u.phone === it.contactInfo)))
    );
    const targetUser = studentUser || {
      id: it.registeredByUserId || "aluno-ifpr",
      name: it.registeredByName || "Aluno(a) Cadastrante",
      email: (studentUser as any)?.email || it.contactInfo || "aluno@estudantes.ifpr.edu.br",
      role: "ALUNO" as UserRole,
      courseOrDept: "IFPR Campus Ivaiporã",
      registrationNumber: "20261001",
      reputationScore: 10,
    };
    setNotifyModalUser(targetUser);
    setIsBroadcastNotification(false);
    setNotifyRelatedItemId(it.id);
    setNotifyTitle(`Atualização sobre seu item: ${it.title}`);
    setNotifyMessage(
      `Olá, ${targetUser.name}! Há uma atualização referente ao seu objeto "${it.title}" registrado no Achados e Perdidos do IFPR Campus Ivaiporã.`
    );
  };

  // Admin & Server Sub-Tab State
  const [adminSubTab, setAdminSubTab] = useState<
    | "server_overview"
    | "server_analytics"
    | "users"
    | "accounts"
    | "audit"
    | "health"
    | "approvals"
    | "backups"
    | "documents"
    | "project_settings"
    | "versions"
    | "test_batteries"
    | "test_distribution"
    | "custody_reminders"
    | "digital_returns"
    | "pending_signatures"
    | "claims"
  >(currentUser.role === "SERVIDOR" ? "server_overview" : "users");

  useEffect(() => {
    if (currentUser.role === "SERVIDOR" || activeDashboardRole === "SERVIDOR") {
      const allowedTabs = [
        "server_overview",
        "server_analytics",
        "claims",
        "pending_signatures",
        "custody_reminders",
        "digital_returns",
      ];
      if (!allowedTabs.includes(adminSubTab)) {
        setAdminSubTab("server_overview");
      }
    }
  }, [currentUser.role, activeDashboardRole, adminSubTab]);

  // Claim Management State (Secretaria / SEBAC)
  const [claimSearchText, setClaimSearchText] = useState("");
  const [claimStatusFilter, setClaimStatusFilter] = useState<"TODAS" | "PENDENTE" | "APROVADO" | "REJEITADO" | "CONCLUIDO" | "CANCELADO">("PENDENTE");
  const [claimToReject, setClaimToReject] = useState<ItemClaim | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState("");
  const [claimToApprove, setClaimToApprove] = useState<ItemClaim | null>(null);
  const [isProcessingClaimAction, setIsProcessingClaimAction] = useState(false);



  // Items with pending institutional staff signature (filtered strictly per identified issuer)
  const pendingSignaturesItems = items.filter(
    (it) =>
      it &&
      it.status === "DEVOLVIDO" &&
      it.recipientSignatureStatus === "SIGNED" &&
      it.staffSignatureStatus !== "SIGNED" &&
      Boolean(it.returnedByUserId) &&
      it.returnedByUserId === currentUser.id
  );
  const pendingSignaturesCount = pendingSignaturesItems.length;

  // Items with pending staff signature where issuer is NOT assigned/identified
  const unassignedPendingSignaturesItems = items.filter(
    (it) =>
      it &&
      it.status === "DEVOLVIDO" &&
      it.recipientSignatureStatus === "SIGNED" &&
      it.staffSignatureStatus !== "SIGNED" &&
      !it.returnedByUserId
  );
  const unassignedPendingSignaturesCount = unassignedPendingSignaturesItems.length;

  const returnMetrics = computeDashboardReturnMetrics(items);
  const digitalReturnedItemsCount = returnMetrics.concludedReturnsCount;
  const pendingRemoteSignaturesCount = returnMetrics.pendingRemoteSignaturesCount;
  const registeredReturnsCount = returnMetrics.registeredReturnsCount;
  const pendingStaffAttestationCount = returnMetrics.pendingStaffAttestationCount;
  const dualSignedReturnsCount = returnMetrics.dualSignedReturnsCount;

  // Items held for >90 days count
  const itemsOver90DaysCount = items.filter((it) => {
    if (!it || it.status === "DEVOLVIDO" || it.status === "ENCERRADO" || (it.status as string) === "DOADO" || (it.status as string) === "DESCARTE") {
      return false;
    }
    const itemDate = safeParseDate(it.date || it.createdAt);
    if (!itemDate) return false;
    const diffDays = Math.floor((Date.now() - itemDate.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 90;
  }).length;

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

  // Telemetry Ping Latency & Performance State (Strict real measurements; null/[] when unmeasured)
  const [pingLatencyMs, setPingLatencyMs] = useState<number | null>(null);
  const [dbLatencyMs, setDbLatencyMs] = useState<number | null>(null);
  const [memoryUsageMB, setMemoryUsageMB] = useState<number | null>(null);
  const [isPinging, setIsPinging] = useState(false);
  const [latencyHistory, setLatencyHistory] = useState<
    Array<{ time: string; network: number | null; db: number | null }>
  >([]);

  const measurePing = async () => {
    setIsPinging(true);
    const startNet = performance.now();
    let netMs: number | null = null;
    let dbMs: number | null = null;

    try {
      const res = await fetch("/api/analytics/metrics", { cache: "no-store" });
      if (res.ok) {
        netMs = Math.max(1, Math.round(performance.now() - startNet));
      }
    } catch (_) {
      netMs = null;
    }
    setPingLatencyMs(netMs);

    // Measure Firestore DB response time with Firebase Performance trace
    const perfTrace = traceFirebasePerformance("firestore_db_latency");
    const startDb = performance.now();
    try {
      if (db) {
        const q = query(collection(db, "items"), limit(1));
        await getDocs(q);
        dbMs = Math.max(1, Math.round(performance.now() - startDb));
      }
    } catch (_) {
      dbMs = null;
    } finally {
      if (perfTrace) {
        try {
          perfTrace.stop();
        } catch (_) {}
      }
    }
    setDbLatencyMs(dbMs);

    // Real JS heap memory usage (null when browser doesn't expose performance.memory)
    setMemoryUsageMB(readAvailableMemoryUsageMB());

    if (netMs !== null || dbMs !== null) {
      const timeLabel = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      setLatencyHistory((prev) => [
        ...prev.slice(-8),
        { time: timeLabel, network: netMs, db: dbMs },
      ]);
    }
    setIsPinging(false);
  };

  useEffect(() => {
    measurePing();
    const interval = setInterval(measurePing, 10000);
    return () => clearInterval(interval);
  }, []);

  // Backup Manual Triggering state
  const [isExecutingBackup, setIsExecutingBackup] = useState(false);
  const [isExportFoundModalOpen, setIsExportFoundModalOpen] = useState(false);

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
      const headers: Record<string, string> = {};
      if (auth.currentUser) {
        try {
          const token = await auth.currentUser.getIdToken();
          if (token) headers["Authorization"] = `Bearer ${token}`;
        } catch (_) {}
      }
      const res = await fetch("/api/analytics/metrics", { headers });
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

    try {
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
    } catch (_) {
      // Falha tratada pelo addUserByAdmin com notificação de erro. O modal permanece aberto com os dados preenchidos para nova tentativa.
    }
  };

  const handleSendAdminNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifyTitle.trim() || !notifyMessage.trim()) {
      addToast("Preencha o título e o conteúdo da notificação.", "error");
      return;
    }
    setIsSendingNotif(true);
    try {
      if (isBroadcastNotification) {
        const studentUsers = (allUsers || []).filter((u) => u && u.role === "ALUNO");
        for (const student of studentUsers) {
          await sendNotificationToUser(
            student.id,
            notifyTitle.trim(),
            notifyMessage.trim(),
            notifyRelatedItemId || undefined
          );
        }
        vibrateSuccess();
        addToast(`Notificação enviada em massa para ${studentUsers.length} alunos!`, "success");
      } else if (notifyModalUser) {
        await sendNotificationToUser(
          notifyModalUser.id,
          notifyTitle.trim(),
          notifyMessage.trim(),
          notifyRelatedItemId || undefined
        );
        vibrateSuccess();
        addToast(`Notificação enviada para ${notifyModalUser.name}!`, "success");
      }
      setNotifyModalUser(null);
      setIsBroadcastNotification(false);
      setNotifyTitle("");
      setNotifyMessage("");
      setNotifyRelatedItemId("");
    } catch (err: any) {
      vibrateCritical();
      addToast("Erro ao enviar notificação para o aluno.", "error");
    } finally {
      setIsSendingNotif(false);
    }
  };

  // Metrics Calculations (Strict separation between registered returns, pending remote signatures, and concluded returns)
  const totalItems = items.length;
  const lostCount = items.filter((i) => i.type === "PERDIDO").length;
  const foundCount = items.filter((i) => i.type === "ENCONTRADO").length;
  const returnedCount = returnMetrics.concludedReturnsCount;
  const inAnalysisCount = items.filter((i) => i.status === "EM_ANALISE").length;
  const successRate = returnMetrics.successRate;
  const pendingClaimsCount = claims.filter((c) => c.status === "PENDENTE").length;

  // Dynamic Chart 1 Data: Monthly Lost vs Found vs Concluded Returned Trend (Fetched from Firestore)
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
        if (isRecipientReturnConcluded(it)) targetMonth.devolvidos++;
      }
    }
  });

  const monthlyData = last6Months.map((m) => ({
    month: m.label,
    perdidos: m.perdidos,
    encontrados: m.encontrados,
    devolvidos: m.devolvidos,
  }));

  // Chart 2 Data: Categories Distribution (Pie / Donut - strict real stored data)
  const categoryCounts: Record<string, number> = {};
  items.forEach((it) => {
    if (!it || !it.category) return;
    categoryCounts[it.category] = (categoryCounts[it.category] || 0) + 1;
  });

  const COLORS = ["#16845B", "#DC2626", "#2563EB", "#D97706", "#7C3AED", "#DB2777", "#0D9488"];

  const pieCategoryData = useMemo(() => buildPieCategoryData(items), [items]);

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

  // Filtered & Priority-Sorted Items for Admin Management Table
  const filteredTableItems = useMemo(
    () =>
      sortAndFilterAdminTableItems(items, {
        search: tableSearch,
        category: tableCategory,
      }),
    [items, tableSearch, tableCategory]
  );

  const visibleAdminTableItems = useMemo(
    () => filteredTableItems.slice(0, adminTableLimit),
    [filteredTableItems, adminTableLimit]
  );

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
    doc.setFillColor(22, 132, 91); // Localiza+ Green #16845B
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
      headStyles: { fillColor: [22, 132, 91], textColor: [255, 255, 255], fontStyle: "bold" },
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
    doc.setFillColor(22, 132, 91); // Localiza+ Green #16845B
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
      headStyles: { fillColor: [22, 132, 91], textColor: [255, 255, 255], fontStyle: "bold" },
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
      let token = "";
      if (auth.currentUser) {
        try {
          token = await auth.currentUser.getIdToken();
        } catch (_) {}
      }
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const res = await fetch("/api/monitoring/export-logs", { headers });
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
    <div className="space-y-5 pb-12">
      {/* CABEÇALHO PRINCIPAL DO PAINEL (MINIMALISTA E MOBILE-FIRST) */}
      <header className="pb-4 border-b border-slate-200/80 dark:border-slate-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#16845B] dark:text-emerald-400">
              {activeDashboardRole === "SERVIDOR"
                ? "Atendimento & Portaria • IFPR Campus Ivaiporã"
                : activeDashboardRole === "ADMIN"
                ? "Administração Institucional • IFPR Campus Ivaiporã"
                : "Acompanhamento Discente • IFPR Campus Ivaiporã"}
            </p>
            <h1 className="text-lg sm:text-xl font-bold text-[#0F172A] dark:text-white tracking-tight">
              {activeDashboardRole === "SERVIDOR"
                ? "Painel do Servidor"
                : activeDashboardRole === "ADMIN"
                ? "Painel Administrativo"
                : "Painel do Discente"}
            </h1>
          </div>

          {/* Controles Superiores: Alternador de Visão (Admin) e Ações Rápidas */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {currentUser.role === "ADMIN" ? (
              <div className="bg-slate-100 dark:bg-slate-800/90 p-0.5 rounded-lg flex items-center border border-slate-200/80 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setActiveDashboardRole("ALUNO")}
                  className={`min-h-[34px] px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    activeDashboardRole === "ALUNO"
                      ? "bg-white dark:bg-slate-900 text-[#16845B] dark:text-emerald-400 font-semibold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  Aluno
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveDashboardRole("SERVIDOR");
                    setAdminSubTab("server_overview");
                  }}
                  className={`min-h-[34px] px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    activeDashboardRole === "SERVIDOR"
                      ? "bg-white dark:bg-slate-900 text-[#16845B] dark:text-emerald-400 font-semibold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  Servidor
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveDashboardRole("ADMIN");
                    if (adminSubTab === "server_overview" || adminSubTab === "server_analytics") {
                      setAdminSubTab("users");
                    }
                  }}
                  className={`min-h-[34px] px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    activeDashboardRole === "ADMIN"
                      ? "bg-[#16845B] text-white"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  Admin
                </button>
              </div>
            ) : (
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {currentUser.role === "SERVIDOR"
                  ? "Servidor Autorizado • Portaria / SEPAE"
                  : `Perfil: ${currentUser.role}`}
              </span>
            )}

            {(currentUser.role === "ADMIN" || currentUser.role === "SERVIDOR") && (
              <>
                <button
                  type="button"
                  onClick={() => setQrScannerOpen(true)}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#16845B] hover:bg-[#126B49] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>QR Code</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportItemsCSV}
                  aria-label="Exportar relatório completo de itens em CSV"
                  title="Download do Relatório Completo de Achados & Perdidos (CSV)"
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[#16845B]" />
                  <span>CSV</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* FAIXA COMPACTA DE INDICADORES OPERACIONAIS (Sem cartões pesados) */}
        {(activeDashboardRole === "ADMIN" || activeDashboardRole === "SERVIDOR") && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 pt-3 border-t border-slate-100 dark:border-slate-800/80">
            <div className="space-y-0.5">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                Objetos no Acervo
              </span>
              <p className="text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-white tracking-tight tabular-nums">
                {totalItems}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {foundCount} encontrados · {lostCount} perdidos
              </p>
            </div>

            <div className="space-y-0.5">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                Em Custódia / Análise
              </span>
              <p className="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400 tracking-tight tabular-nums">
                {inAnalysisCount}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {pendingClaimsCount} solicitações pendentes
              </p>
            </div>

            <div className="space-y-0.5">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                Devoluções Concluídas
              </span>
              <p className="text-xl sm:text-2xl font-bold text-sky-600 dark:text-sky-400 tracking-tight tabular-nums">
                {returnedCount}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {registeredReturnsCount} reg. · {pendingRemoteSignaturesCount} pend. remota · {dualSignedReturnsCount} dupla
              </p>
            </div>

            <div className="space-y-0.5">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                Taxa de Restituição
              </span>
              <p className="text-xl sm:text-2xl font-bold text-[#16845B] dark:text-emerald-400 tracking-tight tabular-nums">
                {successRate}%
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {pendingStaffAttestationCount} aguardando servidor
              </p>
            </div>
          </div>
        )}
      </header>

      {/* ========================================================================= */}
      {/* 1. MÓDULO ALUNO (Discente) */}
      {/* ========================================================================= */}
      {activeDashboardRole === "ALUNO" && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-3 py-3 border-b border-slate-200/80 dark:border-slate-800">
            <div>
              <p className="text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-white tabular-nums">
                {items.filter((i) => i.registeredByUserId === currentUser.id).length}
              </p>
              <p className="text-[11px] text-slate-500">Minhas ocorrências</p>
            </div>

            <div>
              <p className="text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-white tabular-nums">
                {claims.filter((c) => c.claimerId === currentUser.id).length}
              </p>
              <p className="text-[11px] text-slate-500">Solicitações</p>
            </div>

            <div>
              <p className="text-xl sm:text-2xl font-bold text-[#16845B] tabular-nums">
                {currentUser.reputationScore || 10} pts
              </p>
              <p className="text-[11px] text-slate-500">Cidadania</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-[#0F172A] dark:text-white">
                Seus Objetos e Ocorrências Vinculadas
              </h2>
              {((currentUser.role === "SERVIDOR" && currentUser.approvalStatus === "APROVADO") ||
                currentUser.role === "ADMIN") && (
                <button
                  type="button"
                  onClick={() => {
                    vibrateClick();
                    if (requestAuthForRegistration()) {
                      navigate("/cadastrar");
                    }
                  }}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#16845B] text-white text-xs font-semibold hover:bg-[#126B49] transition-colors cursor-pointer"
                >
                  + Registrar Objeto
                </button>
              )}
            </div>

            {/* Mobile Stacked List for Student Items */}
            <div className="md:hidden divide-y divide-slate-200/80 dark:divide-slate-800 border-y border-slate-200/80 dark:border-slate-800">
              {items.filter((i) => i.registeredByUserId === currentUser.id).length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">
                  Você ainda não cadastrou nenhum objeto.
                </p>
              ) : (
                items
                  .filter((i) => i.registeredByUserId === currentUser.id)
                  .map((item) => (
                    <div key={item.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#0F172A] dark:text-white truncate">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {item.type} · {item.status} · {formatDate(item.date)}
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedItemForDetail(item)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 shrink-0 cursor-pointer"
                      >
                        Detalhes
                      </button>
                    </div>
                  ))
              )}
            </div>

            {/* Desktop Table for Student Items */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8FAFC] dark:bg-slate-800 text-slate-500 uppercase font-bold text-[10px] border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-3.5">Objeto</th>
                    <th className="p-3.5">Categoria</th>
                    <th className="p-3.5">Tipo</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5">Data</th>
                    <th className="p-3.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.filter((i) => i.registeredByUserId === currentUser.id).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400">
                        Você ainda não cadastrou nenhum objeto.
                      </td>
                    </tr>
                  ) : (
                    items
                      .filter((i) => i.registeredByUserId === currentUser.id)
                      .map((item) => (
                        <tr key={item.id} className="hover:bg-[#F8FAFC] dark:hover:bg-slate-800/50">
                          <td className="p-3.5 font-bold text-[#172B2A] dark:text-white">{item.title}</td>
                          <td className="p-3.5">{item.category}</td>
                          <td className="p-3.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap shrink-0 ${item.type === "PERDIDO" ? "bg-rose-500/10 text-rose-600" : "bg-[#EBF5F0] dark:bg-emerald-950/40 text-[#16845B] dark:text-emerald-400"}`}>
                              {item.type}
                            </span>
                          </td>
                          <td className="p-3.5 font-bold">{item.status}</td>
                          <td className="p-3.5 text-slate-500 tabular-nums">{formatDate(item.date)}</td>
                          <td className="p-3.5 text-right">
                            <button
                              onClick={() => setSelectedItemForDetail(item)}
                              className="px-3 py-1.5 rounded-lg bg-[#F8FAFC] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-[#16845B] hover:text-white hover:border-[#16845B] text-[11px] font-bold transition-colors cursor-pointer"
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
      {/* 2 & 3. WORKSPACE UNIFICADO: PAINEL DO SERVIDOR & PAINEL ADMIN */}
      {/* ========================================================================= */}
      {(activeDashboardRole === "ADMIN" || activeDashboardRole === "SERVIDOR") && (
        <div>
          {currentUser.role !== "ADMIN" &&
          !(currentUser.role === "SERVIDOR" && currentUser.approvalStatus === "APROVADO") ? (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-6 text-center space-y-3">
              <Lock className="w-5 h-5 text-rose-500 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">
                  Acesso Restrito
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Sua conta atual ({currentUser.email}) possui permissão de <strong>{currentUser.role}</strong>. Apenas servidores e administradores autenticados podem acessar o módulo de custódia e assinaturas.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-5 items-start">
              {/* NAVEGAÇÃO DISCRETA (FAIXA HORIZONTAL NO MOBILE + LISTA LATERAL NO DESKTOP) */}
              <aside
                aria-label={
                  activeDashboardRole === "SERVIDOR"
                    ? "Navegação do Painel do Servidor"
                    : "Navegação do Painel Administrativo"
                }
                className="w-full lg:w-56 shrink-0 lg:sticky lg:top-18 lg:pr-4 lg:border-r border-slate-200/80 dark:border-slate-800"
              >
                {activeDashboardRole === "SERVIDOR" ? (
                  /* MENU DO PAINEL DO SERVIDOR */
                  <div className="space-y-3">
                    <nav className="flex lg:flex-col gap-1 overflow-x-auto no-scrollbar pb-1 lg:pb-0 border-b lg:border-b-0 border-slate-200/80 dark:border-slate-800">
                      {[
                        {
                          id: "server_overview",
                          label: "Custódia & Atendimento",
                          badge: inAnalysisCount,
                        },
                        {
                          id: "claims",
                          label: "Solicitações",
                          badge: pendingClaimsCount,
                        },
                        {
                          id: "pending_signatures",
                          label: "Assinaturas",
                          badge: pendingSignaturesCount,
                        },
                        {
                          id: "custody_reminders",
                          label: "Prazos (+90d)",
                          badge: itemsOver90DaysCount,
                        },
                        {
                          id: "digital_returns",
                          label: "Devoluções (D3)",
                          badge: digitalReturnedItemsCount,
                        },
                        {
                          id: "server_analytics",
                          label: "Relatórios",
                          badge: 0,
                        },
                      ].map((item) => {
                        const isActive = adminSubTab === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              vibrateClick();
                              setAdminSubTab(item.id as any);
                            }}
                            className={`min-h-[38px] px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-between gap-2 cursor-pointer whitespace-nowrap lg:whitespace-normal text-left ${
                              isActive
                                ? "bg-[#16845B] text-white font-semibold"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/70"
                            }`}
                          >
                            <span>{item.label}</span>
                            {item.badge > 0 && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums shrink-0 ${
                                  isActive
                                    ? "bg-white/20 text-white"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                                }`}
                              >
                                {item.badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </nav>
                  </div>
                ) : (
                  /* MENU DO PAINEL ADMINISTRATIVO */
                  <div className="space-y-3">
                    {/* Mobile Single Horizontal Strip for Admin Tabs */}
                    <nav className="flex lg:hidden gap-1 overflow-x-auto no-scrollbar pb-2 border-b border-slate-200/80 dark:border-slate-800">
                      {[
                        { id: "users", label: "Usuários & Objetos", badge: allUsers.length },
                        { id: "accounts", label: "Contas", badge: 0 },
                        {
                          id: "approvals",
                          label: "Aprovações",
                          badge: (allUsers || []).filter((u) => u && u.approvalStatus === "PENDENTE").length,
                        },
                        { id: "claims", label: "Solicitações", badge: pendingClaimsCount },
                        { id: "pending_signatures", label: "Assinaturas", badge: pendingSignaturesCount },
                        { id: "custody_reminders", label: "Prazos +90d", badge: itemsOver90DaysCount },
                        { id: "digital_returns", label: "Devoluções D3", badge: digitalReturnedItemsCount },
                        { id: "server_overview", label: "Guarita", badge: inAnalysisCount },
                        { id: "audit", label: "Auditoria", badge: 0 },
                        { id: "health", label: "Saúde", badge: 0 },
                        { id: "backups", label: "Backups", badge: 0 },
                        { id: "server_analytics", label: "Relatórios", badge: 0 },
                        { id: "documents", label: "PDFs", badge: 0 },
                        { id: "project_settings", label: "Configurações", badge: 0 },
                        { id: "test_batteries", label: "QA", badge: 0 },
                        { id: "test_distribution", label: "Distribuição QA", badge: 0 },
                        { id: "versions", label: "Versões", badge: 0 },
                      ].map((navItem) => {
                        const isActive = adminSubTab === navItem.id;
                        return (
                          <button
                            key={navItem.id}
                            type="button"
                            onClick={() => {
                              vibrateClick();
                              setAdminSubTab(navItem.id as any);
                            }}
                            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer ${
                              isActive
                                ? "bg-[#16845B] text-white font-semibold"
                                : "bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400"
                            }`}
                          >
                            <span>{navItem.label}</span>
                            {navItem.badge > 0 && (
                              <span
                                className={`px-1.5 py-0.2 rounded text-[10px] font-semibold tabular-nums ${
                                  isActive
                                    ? "bg-white/20 text-white"
                                    : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300"
                                }`}
                              >
                                {navItem.badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </nav>

                    {/* Desktop Grouped Sidebar Navigation */}
                    <div className="hidden lg:block space-y-3">
                      {[
                        {
                          groupTitle: "Acesso",
                          items: [
                            { id: "users", label: "Usuários & Objetos", badge: allUsers.length },
                            { id: "accounts", label: "Status de Contas", badge: 0 },
                            {
                              id: "approvals",
                              label: "Aprovações (@ifpr)",
                              badge: (allUsers || []).filter((u) => u && u.approvalStatus === "PENDENTE").length,
                            },
                          ],
                        },
                        {
                          groupTitle: "Custódia",
                          items: [
                            { id: "claims", label: "Solicitações", badge: pendingClaimsCount },
                            { id: "pending_signatures", label: "Assinaturas Pendentes", badge: pendingSignaturesCount },
                            { id: "custody_reminders", label: "Prazos (+90 Dias)", badge: itemsOver90DaysCount },
                            { id: "digital_returns", label: "Devoluções Digitais", badge: digitalReturnedItemsCount },
                            { id: "server_overview", label: "Recepção & Guarita", badge: inAnalysisCount },
                          ],
                        },
                        {
                          groupTitle: "Sistema",
                          items: [
                            { id: "audit", label: "Logs de Auditoria", badge: 0 },
                            { id: "health", label: "Saúde do Sistema", badge: 0 },
                            { id: "backups", label: "Backups & Segurança", badge: 0 },
                            { id: "server_analytics", label: "Relatórios", badge: 0 },
                            { id: "documents", label: "Documentos PDF", badge: 0 },
                            { id: "project_settings", label: "Configurações", badge: 0 },
                            { id: "test_batteries", label: "Bateria de Testes QA", badge: 0 },
                            {
                              id: "test_distribution",
                              domId: "btn-tab-test-distribution",
                              label: "Distribuição de Testes",
                              badge: 0,
                            },
                            { id: "versions", label: "Versões & Changelog", badge: 0 },
                          ],
                        },
                      ].map((group) => (
                        <div key={group.groupTitle} className="space-y-1">
                          <span className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                            {group.groupTitle}
                          </span>
                          <div className="flex flex-col gap-0.5">
                            {group.items.map((navItem) => {
                              const isActive = adminSubTab === navItem.id;
                              return (
                                <button
                                  key={navItem.id}
                                  id={(navItem as any).domId}
                                  type="button"
                                  onClick={() => {
                                    vibrateClick();
                                    setAdminSubTab(navItem.id as any);
                                  }}
                                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-between gap-2 cursor-pointer text-left ${
                                    isActive
                                      ? "bg-[#16845B] text-white font-semibold"
                                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/70"
                                  }`}
                                >
                                  <span className="truncate">{navItem.label}</span>
                                  {navItem.badge > 0 && (
                                    <span
                                      className={`px-1.5 py-0.2 rounded text-[10px] font-semibold tabular-nums shrink-0 ${
                                        isActive
                                          ? "bg-white/20 text-white"
                                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                                      }`}
                                    >
                                      {navItem.badge}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Ações Administrativas Rápidas */}
                    <div className="pt-2 lg:pt-3 border-t border-slate-200/80 dark:border-slate-800">
                      <div className="flex flex-wrap lg:flex-col gap-1.5">
                        <button
                          type="button"
                          onClick={() => setIsAddingUserOpen(true)}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#16845B] hover:bg-[#126B49] text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>+ Cadastrar Usuário</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            vibrateClick();
                            const firstStudent =
                              (allUsers || []).find((u) => u && u.role === "ALUNO") ||
                              allUsers[0];
                            setNotifyModalUser(firstStudent || null);
                            setIsBroadcastNotification(false);
                            setNotifyTitle("Aviso Institucional - Achados e Perdidos");
                            setNotifyMessage(
                              "Olá! Informamos que há uma atualização referente aos seus registros no sistema do IFPR."
                            );
                            setNotifyRelatedItemId("");
                          }}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>Notificar Alunos</span>
                        </button>

                        <button
                          type="button"
                          onClick={toggleMaintenanceMode}
                          className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer border ${
                            maintenanceMode
                              ? "bg-amber-500 text-black border-amber-600 font-semibold"
                              : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <span>
                            {maintenanceMode ? "Manutenção Ativa" : "Modo Manutenção"}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </aside>

              {/* ÁREA PRINCIPAL DE CONTEÚDO DO PAINEL */}
              <div className="flex-1 min-w-0 w-full space-y-6">
                {/* SEÇÃO: PAINEL DO SERVIDOR — VISÃO GERAL, PENDÊNCIAS PRIORITÁRIAS E OBJETOS SOB CUSTÓDIA */}
                {adminSubTab === "server_overview" && (
                  <div className="space-y-6">
                    {/* 1. Pendências Prioritárias & Ações Rápidas */}
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                      {/* Pendências Prioritárias */}
                      <div className="xl:col-span-7 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 bg-white dark:bg-slate-900 space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                          <h2 className="text-sm font-bold text-[#0F172A] dark:text-white">
                            Pendências do Atendimento
                          </h2>
                          <span className="text-[11px] font-medium text-[#16845B] dark:text-emerald-400">
                            Tempo Real
                          </span>
                        </div>

                        <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                          <div className="py-2.5 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-[#0F172A] dark:text-white">
                                Solicitações de Recuperação ({pendingClaimsCount})
                              </p>
                              <p className="text-[11px] text-slate-500">
                                Aguardando análise documental de titularidade
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setAdminSubTab("claims")}
                              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
                            >
                              Analisar
                            </button>
                          </div>

                          <div className="py-2.5 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-[#0F172A] dark:text-white">
                                Confirmações de Entrega ({pendingSignaturesCount})
                              </p>
                              <p className="text-[11px] text-slate-500">
                                Termos que aguardam atestação do servidor
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setAdminSubTab("pending_signatures")}
                              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
                            >
                              Atestar
                            </button>
                          </div>

                          <div className="py-2.5 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-[#0F172A] dark:text-white">
                                Prazos de Guarda +90d ({deadlineAlertItems.length})
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {expiredItems.length} vencidos · {nearExpirationItems.length} próximos
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setAdminSubTab("custody_reminders")}
                              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
                            >
                              Ver Prazos
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Ferramentas Rápidas de Atendimento */}
                      <div className="xl:col-span-5 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 bg-white dark:bg-slate-900 space-y-3">
                        <div className="border-b border-slate-100 dark:border-slate-800 pb-2.5">
                          <h2 className="text-sm font-bold text-[#0F172A] dark:text-white">
                            Ações Rápidas de Balcão
                          </h2>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setQrScannerOpen(true)}
                            className="min-h-[42px] px-3 py-2 rounded-lg bg-[#16845B] hover:bg-[#126B49] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <QrCode className="w-4 h-4 shrink-0" />
                            <span>Ler QR Code</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              vibrateClick();
                              if (requestAuthForRegistration()) {
                                navigate("/cadastrar");
                              }
                            }}
                            className="min-h-[42px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span>+ Registrar Objeto</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              vibrateClick();
                              setIsExportFoundModalOpen(true);
                            }}
                            aria-label="Abrir modal para emitir Relatório de Prestação de Contas de Itens Encontrados em PDF"
                            className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span>Relatório SEBAC (PDF)</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleExportPendingItemsPDF}
                            aria-label="Exportar Relatório em PDF contendo a listagem de objetos pendentes"
                            className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span>Pendentes (PDF)</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleExportItemsCSV}
                            aria-label="Exportar todos os dados em formato CSV para a Secretaria"
                            className="col-span-2 min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span>Exportar Base Completa (CSV)</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 2. Objetos sob Responsabilidade — Recepção e Custódia na Guarita / Secretaria */}
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-800 pb-3">
                        <div>
                          <h3 className="text-sm sm:text-base font-bold text-[#0F172A] dark:text-white">
                            Objetos sob Custódia ({serverCustodyFilteredItems.length}
                            {serverCustodyFilteredItems.length !== items.length ? ` de ${items.length}` : ""})
                          </h3>
                          <p className="text-xs text-slate-500">
                            Confirmação presencial de chegada, guarda física e formalização de devoluções.
                          </p>
                        </div>
                      </div>

                      {/* Filtros e Busca Rápida */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
                          {["TODOS", "PERDIDO", "ENCONTRADO", "EM_ANALISE", "DEVOLVIDO"].map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => setServerFilterStatus(st)}
                              className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                                serverFilterStatus === st
                                  ? "bg-[#16845B] text-white font-semibold"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200/70"
                              }`}
                            >
                              {st === "TODOS"
                                ? "Todos"
                                : st === "EM_ANALISE"
                                ? "Em Custódia"
                                : st}
                            </button>
                          ))}
                        </div>

                        <div className="relative w-full sm:w-64">
                          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={tableSearch}
                            onChange={(e) => setTableSearch(e.target.value)}
                            placeholder="Buscar objeto, ID, QR ou local..."
                            className="w-full h-9 pl-9 pr-3 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[#0F172A] dark:text-white outline-none focus:border-[#16845B]"
                          />
                        </div>
                      </div>

                      {/* Lista Mobile Empilhada (Evita tabelas largas no celular) */}
                      <div className="md:hidden divide-y divide-slate-200/80 dark:divide-slate-800 border-y border-slate-200/80 dark:border-slate-800">
                        {serverCustodyFilteredItems.length === 0 ? (
                          <p className="py-8 text-center text-xs text-slate-500">
                            Nenhum objeto encontrado para os filtros aplicados.
                          </p>
                        ) : (
                          serverCustodyFilteredItems
                            .slice(0, serverOverviewLimit)
                            .map((it) => (
                              <div key={it.id} className="py-3 space-y-2.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-[#0F172A] dark:text-white truncate">
                                      {it.title}
                                    </p>
                                    <p className="text-[11px] text-slate-500 truncate">
                                      {it.status} · {it.location || "Campus IFPR"} · {formatDate(it.createdAt || it.date)}
                                    </p>
                                  </div>
                                  <span className="text-[10px] font-mono text-slate-400 shrink-0">
                                    #{String(it.id).slice(0, 6)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {it.status !== "EM_ANALISE" && it.status !== "DEVOLVIDO" && it.status !== "ENCERRADO" && (
                                    <button
                                      type="button"
                                      disabled={confirmingArrivalId === it.id}
                                      onClick={() => handleConfirmArrival(it)}
                                      className="flex-1 min-h-[38px] px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 text-xs font-semibold cursor-pointer disabled:opacity-50"
                                    >
                                      {confirmingArrivalId === it.id ? "Confirmando..." : "Confirmar Chegada"}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setSelectedItemForDetail(it)}
                                    className="flex-1 min-h-[38px] px-3 py-1.5 rounded-lg bg-[#16845B] text-white text-xs font-semibold cursor-pointer"
                                  >
                                    Ver / Devolver
                                  </button>
                                </div>
                              </div>
                            ))
                        )}
                      </div>

                      {/* Tabela Desktop Limpa de Objetos */}
                      <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-[#F8FAFC] dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase text-[10px] font-bold">
                            <tr>
                              <th className="py-3 px-4">Objeto</th>
                              <th className="py-3 px-4">Tipo</th>
                              <th className="py-3 px-4">Localização</th>
                              <th className="py-3 px-4 text-center">Situação</th>
                              <th className="py-3 px-4">Data</th>
                              <th className="py-3 px-4 text-right">Ações Operacionais</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {serverCustodyFilteredItems.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="py-8 text-center text-slate-400">
                                  Nenhum objeto encontrado para os filtros aplicados.
                                </td>
                              </tr>
                            ) : (
                              serverCustodyFilteredItems
                                .slice(0, serverOverviewLimit)
                                .map((it) => (
                                  <tr key={it.id} className="hover:bg-[#F8FAFC] dark:hover:bg-slate-800/40">
                                    <td className="py-3 px-4">
                                      <div className="flex items-center gap-3">
                                        {it.imageUrl ? (
                                          <img
                                            src={it.imageUrl}
                                            alt={it.title}
                                            className="w-9 h-9 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                                          />
                                        ) : (
                                          <div className="w-9 h-9 rounded-lg bg-[#F8FAFC] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold text-slate-400 text-[10px]">
                                            IF
                                          </div>
                                        )}
                                        <div>
                                          <span className="font-bold text-[#172B2A] dark:text-white block">
                                            {it.title}
                                          </span>
                                          <span className="text-[11px] text-slate-400 font-mono">
                                            #{it.id} • {it.category} {it.color ? `• ${it.color}` : ""}
                                          </span>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="py-3 px-4">
                                      <UIBadge tone={it.type === "ENCONTRADO" ? "emerald" : "rose"}>
                                        {it.type}
                                      </UIBadge>
                                    </td>
                                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300 font-medium">
                                      {it.location || "Campus IFPR"}
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                      <UIBadge
                                        tone={
                                          it.status === "ENCONTRADO"
                                            ? "emerald"
                                            : it.status === "EM_ANALISE"
                                            ? "amber"
                                            : it.status === "DEVOLVIDO"
                                            ? "blue"
                                            : "rose"
                                        }
                                      >
                                        {it.status}
                                      </UIBadge>
                                    </td>
                                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px] tabular-nums">
                                      {formatDate(it.createdAt || it.date)}
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                      <div className="flex items-center justify-end gap-1.5">
                                        {it.status !== "EM_ANALISE" && it.status !== "DEVOLVIDO" && it.status !== "ENCERRADO" && (
                                          <button
                                            type="button"
                                            disabled={confirmingArrivalId === it.id}
                                            onClick={() => handleConfirmArrival(it)}
                                            className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-600 text-amber-800 hover:text-white dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap disabled:opacity-50"
                                            title="Confirmar que o objeto foi recebido fisicamente na guarita / secretaria"
                                          >
                                            {confirmingArrivalId === it.id ? "Confirmando..." : "Confirmar Chegada"}
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => setSelectedItemForDetail(it)}
                                          className="px-3 py-1.5 rounded-lg bg-[#16845B] hover:bg-[#064E3B] text-white text-xs font-semibold transition-all cursor-pointer whitespace-nowrap"
                                        >
                                          Ver / Devolver
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {serverCustodyFilteredItems.length > serverOverviewLimit && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
                          <span className="text-[11px] text-slate-500 tabular-nums">
                            Exibindo {Math.min(serverOverviewLimit, serverCustodyFilteredItems.length)} de {serverCustodyFilteredItems.length} objetos
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              vibrateClick();
                              setServerOverviewLimit((prev) => prev + 20);
                            }}
                            className="min-h-[36px] px-4 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                          >
                            Mostrar mais objetos (restam {serverCustodyFilteredItems.length - serverOverviewLimit})
                          </button>
                        </div>
                      )}
                    </div>

                    {/* 3. Controle de Prazo de Armazenamento (Portaria IFPR 90 Dias) */}
                    <SurfaceCard padding="lg" className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200/70 dark:border-amber-800/50">
                            <Clock className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-[#172B2A] dark:text-white flex items-center gap-2">
                              <span>Controle de Prazo de Armazenamento</span>
                              <UIBadge tone="amber">Portaria IFPR 90 Dias</UIBadge>
                            </h3>
                            <p className="text-xs text-slate-500">
                              Monitoramento preventivo de objetos guardados no acervo próximos ou acima do prazo regulamentar.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <UIBadge tone="rose">{expiredItems.length} Expirados</UIBadge>
                          <UIBadge tone="amber">
                            {nearExpirationItems.length} Próximos do Vencimento
                          </UIBadge>
                        </div>
                      </div>

                      {deadlineAlertItems.length === 0 ? (
                        <div className="p-4 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/30 border border-[#16845B]/20 text-[#064E3B] dark:text-emerald-300 text-xs flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#16845B] shrink-0" />
                          <span>
                            Todos os objetos guardados no acervo do IFPR estão dentro do prazo de guarda de 90 dias. Nenhuma destinação necessária no momento.
                          </span>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-[#F8FAFC] dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase text-[10px] font-bold">
                              <tr>
                                <th className="py-3 px-4">Objeto</th>
                                <th className="py-3 px-4">Categoria</th>
                                <th className="py-3 px-4">Data Cadastro</th>
                                <th className="py-3 px-4">Data Limite</th>
                                <th className="py-3 px-4 text-center">Status do Prazo</th>
                                <th className="py-3 px-4 text-right">Ação</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {deadlineAlertItems.slice(0, 6).map((item) => (
                                <tr key={item.id} className="hover:bg-[#F8FAFC] dark:hover:bg-slate-800/40">
                                  <td className="py-3 px-4 font-bold text-[#172B2A] dark:text-white">
                                    {item.title}
                                  </td>
                                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                                    {item.category}
                                  </td>
                                  <td className="py-3 px-4 text-slate-500 font-mono text-[11px] tabular-nums">
                                    {formatDate(item.createdAt)}
                                  </td>
                                  <td className="py-3 px-4 font-mono font-bold text-slate-800 dark:text-slate-200 text-[11px] tabular-nums">
                                    {item.data_limite
                                      ? formatDate(item.data_limite)
                                      : item.storageDeadlineDate
                                      ? formatDate(item.storageDeadlineDate)
                                      : "—"}
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    {item.isExpired ? (
                                      <UIBadge tone="rose">
                                        Prazo Vencido ({Math.abs(item.daysRemaining)}d atrás)
                                      </UIBadge>
                                    ) : (
                                      <UIBadge tone="amber">
                                        Vence em {item.daysRemaining} dias
                                      </UIBadge>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-right">
                                    <UIButton
                                      type="button"
                                      variant="primary"
                                      size="sm"
                                      onClick={() => setSelectedItemForDetail(item)}
                                    >
                                      <span>Destinar / Gerenciar</span>
                                    </UIButton>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </SurfaceCard>
                  </div>
                )}

                {/* SEÇÃO: RELATÓRIOS ANALÍTICOS E HISTÓRICO DE ATIVIDADES (SERVIDOR & ADMIN) */}
                {adminSubTab === "server_analytics" && (
                  <div className="space-y-6 animate-in fade-in duration-200">
                    <SurfaceCard padding="lg" className="space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-[#16845B]" />
                            <h2 className="text-lg font-bold text-[#172B2A] dark:text-white tracking-tight">
                              Relatórios Analíticos & Histórico Temporal
                            </h2>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Análise temporal, estatísticas por categoria e exportações oficiais do IFPR Campus Ivaiporã.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <UIButton
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              vibrateClick();
                              setIsExportFoundModalOpen(true);
                            }}
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Prestação de Contas SEBAC (PDF)</span>
                          </UIButton>

                          <UIButton
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={handleExportPendingItemsPDF}
                          >
                            <FileText className="w-3.5 h-3.5 text-[#16845B]" />
                            <span>Exportar Pendentes (PDF)</span>
                          </UIButton>

                          <UIButton
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleExportItemsCSV}
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5 text-[#16845B]" />
                            <span>Base Completa (CSV)</span>
                          </UIButton>
                        </div>
                      </div>

                      {/* Tendência Mensal Recharts */}
                      <div className="bg-[#F8FAFC] dark:bg-slate-900/50 p-5 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <h3 className="text-xs font-bold uppercase text-slate-700 dark:text-slate-300 tracking-wider">
                              Tendência Mensal: Itens Perdidos vs. Recuperados (Campus Ivaiporã)
                            </h3>
                            <p className="text-[11px] text-slate-500">
                              Evolução temporal entre perdas registradas, itens encontrados e devoluções concluídas
                            </p>
                          </div>
                        </div>

                        <div className="h-64 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={monthlyData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                              <XAxis dataKey="month" stroke="#64748B" fontSize={11} />
                              <YAxis stroke="#64748B" fontSize={11} allowDecimals={false} />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: "#111827",
                                  borderColor: "#334155",
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
                                stroke="#DC2626"
                                strokeWidth={3}
                                dot={{ r: 4, stroke: "#DC2626", fill: "#fff", strokeWidth: 2 }}
                                activeDot={{ r: 7 }}
                              />
                              <Line
                                type="monotone"
                                dataKey="devolvidos"
                                name="Itens Recuperados / Devolvidos"
                                stroke="#16845B"
                                strokeWidth={3}
                                dot={{ r: 4, stroke: "#16845B", fill: "#fff", strokeWidth: 2 }}
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

                      <WeeklyFlowD3Chart items={items} darkMode={darkMode} />
                      <MonthlyItemsD3Chart items={items} darkMode={darkMode} />

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-[#F8FAFC] dark:bg-slate-900/50 p-5 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold uppercase text-slate-700 dark:text-slate-300 tracking-wider">
                              Categorias de Objetos
                            </h3>
                            <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                              {pieCategoryData.length} categorias
                            </span>
                          </div>
                          {pieCategoryData.length === 0 ? (
                            <div className="h-44 flex flex-col items-center justify-center text-center px-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
                              <PackageSearch className="w-7 h-7 text-slate-400 mb-2" />
                              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                                Nenhum objeto cadastrado para exibir distribuição por categoria.
                              </p>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                Os gráficos refletem exclusivamente os registros reais armazenados no banco.
                              </p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                {pieCategoryData.map((cat, idx) => {
                                  const totalCount = items.length || 1;
                                  const pct = Math.round((cat.value / totalCount) * 100);
                                  return (
                                    <div
                                      key={cat.name}
                                      className="flex items-center justify-between text-xs py-1 px-1.5 rounded-lg"
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span
                                          className="w-2 h-2 rounded-full shrink-0"
                                          style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                                        />
                                        <span className="text-slate-700 dark:text-slate-300 text-[11px] font-medium truncate">
                                          {cat.name}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0 tabular-nums">
                                        <span className="font-bold text-[#172B2A] dark:text-white text-xs">
                                          {cat.value}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-mono w-7 text-right">
                                          {pct}%
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="h-44 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                    <Pie
                                      data={pieCategoryData}
                                      cx="50%"
                                      cy="50%"
                                      innerRadius={40}
                                      outerRadius={65}
                                      paddingAngle={3}
                                      dataKey="value"
                                    >
                                      {pieCategoryData.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                      ))}
                                    </Pie>
                                    <Tooltip />
                                  </PieChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="bg-[#F8FAFC] dark:bg-slate-900/50 p-5 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold uppercase text-slate-700 dark:text-slate-300 tracking-wider">
                              Revisões Pendentes por Categoria
                            </h3>
                            <UIBadge tone="amber">
                              {inAnalysisCount + pendingClaimsCount} Pendentes
                            </UIBadge>
                          </div>
                          {barPendingData.length === 0 ? (
                            <div className="h-44 flex flex-col items-center justify-center text-center px-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
                              <CheckCircle2 className="w-7 h-7 text-[#16845B] mb-2" />
                              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                                Nenhuma revisão pendente por categoria no momento.
                              </p>
                            </div>
                          ) : (
                            <div className="h-44 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={barPendingData}>
                                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                                  <XAxis dataKey="category" stroke="#64748B" fontSize={10} />
                                  <YAxis stroke="#64748B" fontSize={11} />
                                  <Tooltip />
                                  <Bar
                                    dataKey="pendentes"
                                    fill="#F59E0B"
                                    radius={[6, 6, 0, 0]}
                                    name="Aguardando Revisão"
                                  />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                        </div>
                      </div>
                    </SurfaceCard>
                  </div>
                )}

              {/* TAB 0: ACCOUNT STATUS MANAGEMENT */}
              {adminSubTab === "accounts" && (
                <div className="space-y-6">
                  <AccountManagementView />
                </div>
              )}

              {/* TAB 1: USERS & CONTROLS */}
              {adminSubTab === "users" && (
                <div className="space-y-6">
                  {/* Maintenance Message Input Box */}
                  <SurfaceCard padding="md" className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase text-[#172B2A] dark:text-slate-200 flex items-center gap-2">
                        <SlidersHorizontal className="w-4 h-4 text-[#16845B]" />
                        <span>Mensagem do Banner de Manutenção Global (Tempo Real)</span>
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Sincronização instantânea no Firestore para todos os usuários
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-2">
                      <input
                        type="text"
                        value={customMsgInput}
                        onChange={(e) => setCustomMsgInput(e.target.value)}
                        placeholder="Escreva a mensagem personalizada que aparecerá no banner de manutenção global..."
                        className="flex-1 w-full px-4 py-2.5 rounded-xl bg-[#F8FAFC] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium outline-none focus:border-[#16845B] text-[#172B2A] dark:text-slate-100"
                      />
                      <UIButton
                        type="button"
                        variant="primary"
                        size="md"
                        onClick={handleSaveCustomMsg}
                        className="w-full sm:w-auto shrink-0"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Salvar Mensagem</span>
                      </UIButton>
                    </div>
                  </SurfaceCard>

                  {/* Resumo de Usuários e Aprovações (Sem truncamento) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <SurfaceCard padding="md" className="flex items-center gap-3.5">
                      <div className="p-2.5 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/50 text-[#16845B] dark:text-emerald-400 border border-[#16845B]/15">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500">Total de Usuários Cadastrados</p>
                        <p className="text-2xl font-bold text-[#172B2A] dark:text-white tabular-nums">{allUsers.length}</p>
                      </div>
                    </SurfaceCard>

                    <SurfaceCard padding="md" className="flex items-center gap-3.5">
                      <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200/70 dark:border-amber-800/50">
                        <GraduationCap className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500">Aprovações Institucionais Pendentes</p>
                        <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                          {allUsers.filter((u) => u.approvalStatus === "PENDENTE").length}
                        </p>
                      </div>
                    </SurfaceCard>

                    <SurfaceCard padding="md" className="flex items-center gap-3.5">
                      <div className="p-2.5 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/50 text-[#16845B] dark:text-emerald-400 border border-[#16845B]/15">
                        <Activity className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500">Status do Servidor e Firestore</p>
                        <p className="text-lg font-bold text-[#16845B] dark:text-emerald-400">100% Operacional</p>
                      </div>
                    </SurfaceCard>
                  </div>

                  {/* USER MANAGEMENT & PERMISSIONS TABLE */}
                  <div className="bg-white dark:bg-[#111827] rounded-2xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-[0_1px_3px_rgba(23,43,42,0.04)] space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center space-x-2">
                          <Users className="w-5 h-5 text-[#16845B]" />
                          <h2 className="text-lg font-bold text-[#172B2A] dark:text-white tracking-tight">
                            Gerenciamento de Usuários e Permissões
                          </h2>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Alteração de perfis (Aluno, Servidor, Admin) e remoção de usuários no IFPR.
                        </p>
                      </div>
                      <span className="self-start sm:self-auto px-3 py-1 rounded-full bg-[#EBF5F0] dark:bg-emerald-950/40 text-[#064E3B] dark:text-emerald-400 text-xs font-bold border border-[#16845B]/20 tabular-nums whitespace-nowrap shrink-0">
                        {allUsers.length} Usuários Cadastrados
                      </span>
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => setUserRoleFilter("ALL")}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer tabular-nums ${
                            userRoleFilter === "ALL" ? "bg-[#16845B] text-white shadow-xs" : "bg-[#F8FAFC] dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          Todos ({allUsers.length})
                        </button>
                        <button
                          onClick={() => setUserRoleFilter("ALUNO")}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer tabular-nums ${
                            userRoleFilter === "ALUNO" ? "bg-[#16845B] text-white shadow-xs" : "bg-[#F8FAFC] dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          Alunos ({(allUsers || []).filter((u) => u && u.role === "ALUNO").length})
                        </button>
                        <button
                          onClick={() => setUserRoleFilter("SERVIDOR")}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer tabular-nums ${
                            userRoleFilter === "SERVIDOR" ? "bg-blue-600 text-white shadow-xs" : "bg-[#F8FAFC] dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          Servidores ({(allUsers || []).filter((u) => u && u.role === "SERVIDOR").length})
                        </button>
                        <button
                          onClick={() => setUserRoleFilter("ADMIN")}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer tabular-nums ${
                            userRoleFilter === "ADMIN" ? "bg-purple-600 text-white shadow-xs" : "bg-[#F8FAFC] dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          Admins ({(allUsers || []).filter((u) => u && u.role === "ADMIN").length})
                        </button>

                        <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 hidden sm:block mx-1" />

                        {/* Status Quick Filters */}
                        <button
                          onClick={() => setUserStatusFilter("active")}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 tabular-nums ${
                            userStatusFilter === "active"
                              ? "bg-[#16845B] text-white shadow-xs"
                              : "bg-[#F8FAFC] dark:bg-slate-800 text-[#16845B] dark:text-emerald-400 border border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block mr-1" />
                          <span>Ativos ({(allUsers || []).filter((u) => resolveAccountStatus(u).status === "active").length})</span>
                        </button>

                        <button
                          onClick={() => setUserStatusFilter("suspended")}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 tabular-nums ${
                            userStatusFilter === "suspended"
                              ? "bg-amber-600 text-white shadow-xs"
                              : "bg-[#F8FAFC] dark:bg-slate-800 text-amber-700 dark:text-amber-400 border border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block mr-1" />
                          <span>Suspensos ({(allUsers || []).filter((u) => resolveAccountStatus(u).status === "suspended").length})</span>
                        </button>

                        <button
                          onClick={() => setUserStatusFilter("banned")}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 tabular-nums ${
                            userStatusFilter === "banned"
                              ? "bg-red-600 text-white shadow-xs"
                              : "bg-[#F8FAFC] dark:bg-slate-800 text-red-700 dark:text-red-400 border border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block mr-1" />
                          <span>Banidos ({(allUsers || []).filter((u) => resolveAccountStatus(u).status === "banned").length})</span>
                        </button>
                      </div>

                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                        <input
                          type="text"
                          value={userSearchText}
                          onChange={(e) => setUserSearchText(e?.target?.value ?? "")}
                          placeholder="Buscar por nome, e-mail, matrícula..."
                          className="pl-8 pr-3 py-1.5 rounded-xl bg-[#F8FAFC] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs outline-none w-full md:w-64"
                        />
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#F8FAFC] dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 uppercase font-bold tracking-wider text-[10px]">
                          <tr>
                            <th className="p-3.5 rounded-l-xl">Usuário</th>
                            <th className="p-3.5">E-mail</th>
                            <th className="p-3.5">Curso / Setor</th>
                            <th className="p-3.5">Matrícula</th>
                            <th className="p-3.5">Permissão (Função)</th>
                            <th className="p-3.5">Status da Conta</th>
                            <th className="p-3.5 rounded-r-xl text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {allUsers
                            .filter((u) => {
                              if (!u) return false;
                              const matchRole = userRoleFilter === "ALL" || u.role === userRoleFilter;
                              const resolvedStatus = resolveAccountStatus(u).status;
                              const matchStatus = userStatusFilter === "ALL" || resolvedStatus === userStatusFilter;
                              const uq = sanitizeQuery(userSearchText);
                              const matchQuery =
                                !uq ||
                                safeIncludes(u.name, uq) ||
                                safeIncludes(u.email, uq) ||
                                safeIncludes(u.registrationNumber, uq) ||
                                safeIncludes(u.courseOrDept, uq) ||
                                safeIncludes(u.statusReason, uq);
                              return matchRole && matchStatus && matchQuery;
                            })
                            .map((u, index) => {
                              const statusDetails = formatAccountStatusDetails(u);
                              return (
                                <tr key={u.id || `user-${u.email}-${index}`} className="hover:bg-[#F8FAFC] dark:hover:bg-slate-800/40 transition-colors">
                                  <td className="p-3.5 font-bold text-[#172B2A] dark:text-white">
                                    <div className="flex items-center space-x-2.5">
                                      <img
                                        src={getSafeAvatarUrl(u.avatarUrl, u.name)}
                                        alt=""
                                        referrerPolicy="no-referrer"
                                        onError={(e) => handleAvatarError(e, u.name)}
                                        className="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                                      />
                                      <div className="flex flex-col">
                                        <span className="font-bold">{u.name}</span>
                                        {u.id === currentUser.id && (
                                          <span className="text-[9px] text-[#16845B] dark:text-emerald-400 font-bold">(Sua Conta)</span>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="p-3.5 font-mono text-slate-600 dark:text-slate-300">{u.email}</td>
                                  <td className="p-3.5 text-slate-600 dark:text-slate-300">{u.courseOrDept}</td>
                                  <td className="p-3.5 font-mono text-slate-500 tabular-nums">{u.registrationNumber || "N/A"}</td>
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
                                          : u.role === "INTRUSO"
                                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
                                          : "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30"
                                      }`}
                                    >
                                      <option value="ALUNO">ALUNO (Discente)</option>
                                      <option value="SERVIDOR">SERVIDOR (Docente/TAE)</option>
                                      <option value="ADMIN">ADMIN (TI)</option>
                                      <option value="INTRUSO">USUÁRIO EXTERNO (Intruso)</option>
                                    </select>
                                  </td>
                                  <td className="p-3.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        vibrateClick();
                                        setUserForStatusModal(u);
                                      }}
                                      title="Clique para gerenciar o status desta conta (Suspender/Banir/Reativar)"
                                      className={`inline-flex flex-col items-start gap-0.5 px-2.5 py-1 rounded-xl border text-[11px] font-extrabold cursor-pointer transition-all hover:scale-105 ${statusDetails.badgeClass}`}
                                    >
                                      <span className="flex items-center space-x-1.5">
                                        <span className={`w-1.5 h-1.5 rounded-full ${statusDetails.dotClass}`} />
                                        <span>{statusDetails.label}</span>
                                      </span>
                                      {u.status === "suspended" && u.suspendedUntil && (
                                        <span className="text-[9px] font-normal opacity-80">
                                          Até {safeParseDate(u.suspendedUntil)?.toLocaleDateString("pt-BR")}
                                        </span>
                                      )}
                                    </button>
                                  </td>
                                  <td className="p-3.5 text-right whitespace-nowrap">
                                    <button
                                      type="button"
                                      title={`Gerenciar Status da Conta de ${u.name}`}
                                      onClick={() => {
                                        vibrateClick();
                                        setUserForStatusModal(u);
                                      }}
                                      className="p-2 rounded-xl bg-amber-500/10 text-amber-600 hover:bg-amber-600 hover:text-white border border-amber-500/20 transition-all mr-1.5 inline-flex items-center justify-center cursor-pointer"
                                    >
                                      <ShieldAlert className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      title={`Enviar notificação direta para ${u.name}`}
                                      onClick={() => {
                                        vibrateClick();
                                        setNotifyModalUser(u);
                                        setIsBroadcastNotification(false);
                                        setNotifyTitle("Aviso Institucional - Achados e Perdidos");
                                        setNotifyMessage(`Olá, ${u.name}. Informamos que há uma atualização sobre o Achados & Perdidos para você.`);
                                        setNotifyRelatedItemId("");
                                      }}
                                      className="p-2 rounded-xl bg-purple-500/10 text-purple-600 hover:bg-purple-600 hover:text-white border border-purple-500/20 transition-all mr-1.5 inline-flex items-center justify-center cursor-pointer"
                                    >
                                      <Bell className="w-4 h-4" />
                                    </button>
                                    <button
                                      disabled={u.id === currentUser.id}
                                      onClick={() => setUserToDelete({ id: u.id, name: u.name })}
                                      className={`p-2 rounded-xl border transition-all inline-flex items-center justify-center ${
                                        u.id === currentUser.id
                                          ? "opacity-30 cursor-not-allowed bg-slate-100 text-slate-400 border-slate-200"
                                          : "bg-rose-500/10 text-rose-600 hover:bg-rose-500 hover:text-white border-rose-500/20 cursor-pointer"
                                      }`}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* OVERRIDE ITEM STATUS TABLE (Responsive Mobile Cards + Desktop Table) */}
                  <div className="bg-white dark:bg-[#111827] rounded-2xl p-4 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-[0_1px_3px_rgba(23,43,42,0.04)] space-y-5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-bold text-[#172B2A] dark:text-white">
                          Controle de Objetos e Override de Status
                        </h2>
                        <p className="text-xs text-slate-500">
                          Alteração direta do status das ocorrências registradas no campus (prioridade para itens ativos).
                        </p>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 w-full md:w-auto">
                        <input
                          type="text"
                          value={tableSearch}
                          onChange={(e) => setTableSearch(e.target.value)}
                          placeholder="Buscar por objeto, ID ou QR..."
                          className="px-3.5 py-2 sm:py-1.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-xs outline-none w-full sm:w-52 focus:border-[#16845B]"
                        />
                        <select
                          value={tableCategory}
                          onChange={(e) => setTableCategory(e.target.value)}
                          className="px-3 py-2 sm:py-1.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-xs font-semibold outline-none focus:border-[#16845B] w-full sm:w-auto"
                        >
                          <option value="TODAS">Todas as Categorias</option>
                          {CANONICAL_ITEM_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {filteredTableItems.length === 0 ? (
                      <div className="py-10 px-4 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 space-y-2.5">
                        <PackageSearch className="w-8 h-8 text-slate-400 mx-auto" />
                        <p className="text-sm font-bold text-[#172B2A] dark:text-white">
                          Nenhum objeto encontrado neste filtro
                        </p>
                        <p className="text-xs text-slate-500 max-w-md mx-auto">
                          Não há ocorrências correspondentes aos critérios atuais de busca ou categoria.
                        </p>
                        {(tableSearch.trim() !== "" || tableCategory !== "TODAS") && (
                          <button
                            type="button"
                            onClick={() => {
                              setTableSearch("");
                              setTableCategory("TODAS");
                            }}
                            className="inline-flex items-center px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-[#172B2A] dark:text-slate-200 cursor-pointer"
                          >
                            Limpar filtros
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        {/* Mobile Stacked Cards (md:hidden) */}
                        <div className="md:hidden space-y-3">
                          {visibleAdminTableItems.map((item) => (
                            <div
                              key={item.id}
                              className="p-4 rounded-xl bg-[#F8FAFC] dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <h3 className="text-sm font-bold text-[#172B2A] dark:text-white break-words">
                                    {item.title}
                                  </h3>
                                  <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                    #{item.id} {item.qrCodeId ? `• ${item.qrCodeId}` : ""}
                                  </p>
                                </div>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                                  {formatDate(item.date)}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                                <span className="font-semibold text-[#16845B] dark:text-emerald-400">
                                  {item.category}
                                </span>
                                <span className="text-slate-300 dark:text-slate-700">•</span>
                                <span className="truncate max-w-[200px]">{item.location}</span>
                              </div>

                              <div className="space-y-2 pt-1">
                                {item.status === "DEVOLVIDO" || item.status === "ENCERRADO" ? (
                                  <span
                                    className={`inline-flex items-center py-1.5 px-2.5 rounded-xl text-xs font-bold border ${
                                      item.status === "DEVOLVIDO"
                                        ? "bg-sky-500/10 text-sky-600 border-sky-500/30"
                                        : "bg-slate-500/10 text-slate-600 border-slate-500/30"
                                    }`}
                                    title="Status final gerenciado pelo fluxo formal (abra os detalhes para consultar ou reabrir)"
                                  >
                                    {item.status} (Formal)
                                  </span>
                                ) : (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <select
                                      aria-label={`Alterar status de ${item.title}`}
                                      value={item.status}
                                      onChange={(e) =>
                                        handleAdminStatusOverride(
                                          item,
                                          e.target.value as "PERDIDO" | "ENCONTRADO" | "EM_ANALISE"
                                        )
                                      }
                                      className={`flex-1 min-w-[140px] min-h-[40px] py-1.5 px-2.5 rounded-xl text-xs font-bold border outline-none cursor-pointer ${
                                        item.status === "ENCONTRADO"
                                          ? "bg-[#EBF5F0] text-[#16845B] border-[#16845B]/30 dark:bg-emerald-950/50 dark:text-emerald-400"
                                          : item.status === "PERDIDO"
                                          ? "bg-rose-500/10 text-rose-600 border-rose-500/30"
                                          : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                                      }`}
                                    >
                                      <option value="PERDIDO">PERDIDO</option>
                                      <option value="ENCONTRADO">ENCONTRADO</option>
                                      <option value="EM_ANALISE">EM ANÁLISE</option>
                                    </select>
                                    {item.status !== "EM_ANALISE" && (
                                      <button
                                        type="button"
                                        disabled={confirmingArrivalId === item.id}
                                        onClick={() => handleConfirmArrival(item)}
                                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-600 text-amber-800 hover:text-white dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap disabled:opacity-50"
                                        title="Confirmar chegada física na guarita / secretaria (EM ANÁLISE)"
                                      >
                                        {confirmingArrivalId === item.id
                                          ? "Confirmando..."
                                          : "Confirmar Chegada"}
                                      </button>
                                    )}
                                  </div>
                                )}

                                <div className="grid grid-cols-2 gap-2 pt-1">
                                  <button
                                    type="button"
                                    title={`Enviar notificação para o aluno que cadastrou "${item.title}"`}
                                    onClick={() => handleOpenNotifyModalForItem(item)}
                                    className="min-h-[40px] px-3 py-2 rounded-xl bg-[#EBF5F0] hover:bg-[#16845B] text-[#16845B] hover:text-white dark:bg-emerald-950/50 dark:text-emerald-400 dark:hover:bg-[#16845B] dark:hover:text-white font-semibold text-xs transition-colors border border-[#16845B]/20 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                                  >
                                    <Bell className="w-3.5 h-3.5" />
                                    <span>Notificar</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedItemForDetail(item)}
                                    className="min-h-[40px] px-3 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-[#16845B] hover:text-white font-semibold text-xs border border-slate-200 dark:border-slate-700 transition-colors inline-flex items-center justify-center cursor-pointer"
                                  >
                                    Detalhes
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Desktop Table (hidden md:block) */}
                        <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-[#F8FAFC] dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 uppercase font-bold text-[10px]">
                              <tr>
                                <th className="p-3.5 rounded-l-xl">Título / Código</th>
                                <th className="p-3.5">Categoria</th>
                                <th className="p-3.5">Localização</th>
                                <th className="p-3.5">Data</th>
                                <th className="p-3.5">Status (Override)</th>
                                <th className="p-3.5 rounded-r-xl text-right">Ação</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {visibleAdminTableItems.map((item) => (
                                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                  <td className="p-3.5 font-bold text-[#172B2A] dark:text-white">
                                    <div>{item.title}</div>
                                    <div className="text-[10px] font-mono text-slate-400">{item.id}</div>
                                  </td>
                                  <td className="p-3.5">{item.category}</td>
                                  <td className="p-3.5 truncate max-w-[140px]">{item.location}</td>
                                  <td className="p-3.5 text-slate-500">{formatDate(item.date)}</td>
                                  <td className="p-3.5">
                                    {item.status === "DEVOLVIDO" || item.status === "ENCERRADO" ? (
                                      <span
                                        className={`inline-flex items-center py-1.5 px-2.5 rounded-xl text-xs font-bold border ${
                                          item.status === "DEVOLVIDO"
                                            ? "bg-sky-500/10 text-sky-600 border-sky-500/30"
                                            : "bg-slate-500/10 text-slate-600 border-slate-500/30"
                                        }`}
                                        title="Status final gerenciado pelo fluxo formal (abra os detalhes para consultar ou reabrir)"
                                      >
                                        {item.status} (Formal)
                                      </span>
                                    ) : (
                                      <div className="flex items-center gap-1.5">
                                        <select
                                          value={item.status}
                                          onChange={(e) =>
                                            handleAdminStatusOverride(
                                              item,
                                              e.target.value as "PERDIDO" | "ENCONTRADO" | "EM_ANALISE"
                                            )
                                          }
                                          className={`py-1.5 px-2.5 rounded-xl text-xs font-bold border outline-none cursor-pointer ${
                                            item.status === "ENCONTRADO"
                                              ? "bg-[#EBF5F0] text-[#16845B] border-[#16845B]/30 dark:bg-emerald-950/50 dark:text-emerald-400"
                                              : item.status === "PERDIDO"
                                              ? "bg-rose-500/10 text-rose-600 border-rose-500/30"
                                              : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                                          }`}
                                        >
                                          <option value="PERDIDO">PERDIDO</option>
                                          <option value="ENCONTRADO">ENCONTRADO</option>
                                          <option value="EM_ANALISE">EM ANÁLISE</option>
                                        </select>
                                        {item.status !== "EM_ANALISE" && (
                                          <button
                                            type="button"
                                            disabled={confirmingArrivalId === item.id}
                                            onClick={() => handleConfirmArrival(item)}
                                            className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-600 text-amber-800 hover:text-white dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap disabled:opacity-50"
                                            title="Confirmar chegada física na guarita / secretaria (EM ANÁLISE)"
                                          >
                                            {confirmingArrivalId === item.id ? "Confirmando..." : "Confirmar Chegada"}
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  <td className="p-3.5 text-right whitespace-nowrap">
                                    <button
                                      type="button"
                                      title={`Enviar notificação para o aluno que cadastrou "${item.title}"`}
                                      onClick={() => handleOpenNotifyModalForItem(item)}
                                      className="p-1.5 rounded-lg bg-[#EBF5F0] hover:bg-[#16845B] text-[#16845B] hover:text-white dark:bg-emerald-950/50 dark:text-emerald-400 dark:hover:bg-[#16845B] dark:hover:text-white font-semibold text-[11px] transition-colors border border-[#16845B]/20 mr-1.5 inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <Bell className="w-3.5 h-3.5" />
                                      <span>Notificar</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedItemForDetail(item)}
                                      className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-[#16845B] hover:text-white font-semibold text-[11px] transition-colors inline-flex items-center cursor-pointer"
                                    >
                                      Detalhes
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Progressive Pagination Controls */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            Exibindo <strong>{visibleAdminTableItems.length}</strong> de{" "}
                            <strong>{filteredTableItems.length}</strong> objetos
                          </span>
                          {filteredTableItems.length > adminTableLimit && (
                            <button
                              type="button"
                              onClick={() => setAdminTableLimit((prev) => prev + 15)}
                              className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-[#16845B] hover:text-white text-xs font-bold text-[#172B2A] dark:text-slate-200 transition-colors cursor-pointer"
                            >
                              Mostrar mais objetos ({filteredTableItems.length - adminTableLimit} restantes)
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* TAB: AUDITORIA E LOGS DO SISTEMA */}
              {adminSubTab === "audit" && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <AuditTrailManagerView darkMode={darkMode} />
                </div>
              )}

              {/* TAB 2: SAÚDE DO SISTEMA (FIREBASE PERFORMANCE MONITORING & SERVICE WORKER UPTIME) */}
              {adminSubTab === "health" && (
                <div className="space-y-6">
                  {/* VISUAL APP UPTIME MONITOR (30 DIAS VIA SERVICE WORKER) */}
                  <AppUptimeMonitor />

                  <div className="bg-white dark:bg-[#111827] rounded-2xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-[0_1px_3px_rgba(23,43,42,0.04)] space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                      <div className="flex items-center space-x-3">
                        <div className="p-2.5 rounded-xl bg-[#EBF5F0] text-[#16845B] dark:bg-emerald-950/60 dark:text-emerald-400 border border-[#16845B]/20">
                          <Activity className="w-6 h-6 animate-pulse" />
                        </div>
                        <div>
                          <h2 className="text-lg font-bold text-[#172B2A] dark:text-white flex items-center flex-wrap gap-2">
                            <span>Métricas da Saúde do Sistema (Firebase Performance)</span>
                            <span
                              className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                                !isOnline
                                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                  : pingLatencyMs === null && dbLatencyMs === null
                                  ? "bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                  : (pingLatencyMs ?? 0) > 800 || (dbLatencyMs ?? 0) > 800
                                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                  : "bg-[#EBF5F0] text-[#16845B] dark:bg-emerald-950/60 dark:text-emerald-400"
                              }`}
                            >
                              {!isOnline
                                ? "🔴 Offline"
                                : pingLatencyMs === null && dbLatencyMs === null
                                ? "⚪ Aguardando medição"
                                : (pingLatencyMs ?? 0) > 800 || (dbLatencyMs ?? 0) > 800
                                ? "🟡 Oscilando"
                                : "🟢 Estável"}
                            </span>
                          </h2>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Monitoramento em tempo real da latência de rede, tempo de resposta do banco de dados e alocação de memória
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                        <button
                          onClick={handleExportMonitoringLogsJSON}
                          disabled={isExportingMonitoringJSON}
                          className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[#172B2A] dark:text-slate-200 text-xs font-bold transition-all flex items-center space-x-2 shadow-xs border border-slate-200 dark:border-slate-700 cursor-pointer"
                        >
                          <Download className={`w-4 h-4 text-[#16845B] ${isExportingMonitoringJSON ? "animate-bounce" : ""}`} />
                          <span>{isExportingMonitoringJSON ? "Baixando..." : "Baixar Relatório JSON"}</span>
                        </button>

                        <button
                          onClick={measurePing}
                          disabled={isPinging}
                          className="px-4 py-2.5 rounded-xl bg-[#16845B] hover:bg-[#064E3B] text-white text-xs font-bold transition-all flex items-center space-x-2 shadow-sm cursor-pointer"
                        >
                          <RefreshCw className={`w-4 h-4 ${isPinging ? "animate-spin" : ""}`} />
                          <span>Medir Desempenho Agora</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Latência de Rede */}
                      <div className="bg-[#F8FAFC] dark:bg-slate-900/60 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-500 uppercase flex items-center space-x-1.5">
                            <Wifi className="w-4 h-4 text-sky-500" />
                            <span>Latência de Rede Ping</span>
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              !isOnline
                                ? "bg-rose-500/10 text-rose-600"
                                : pingLatencyMs === null
                                ? "bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                : "bg-sky-500/10 text-sky-600"
                            }`}
                          >
                            {!isOnline
                              ? "Offline 🔴"
                              : pingLatencyMs === null
                              ? "Indisponível"
                              : "Conectado 🟢"}
                          </span>
                        </div>
                        <div className="flex items-baseline space-x-2">
                          <span className="text-3xl font-bold text-[#172B2A] dark:text-white tabular-nums">
                            {pingLatencyMs !== null ? `${pingLatencyMs} ms` : "Indisponível"}
                          </span>
                          <span className="text-xs text-slate-400">API Gateway</span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {pingLatencyMs !== null
                            ? "Medição real obtida do endpoint de métricas."
                            : "Aguardando resposta válida da API para exibir latência real."}
                        </p>
                      </div>

                      {/* Tempo de Resposta Firestore BD */}
                      <div className="bg-[#F8FAFC] dark:bg-slate-900/60 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-500 uppercase flex items-center space-x-1.5">
                            <Database className="w-4 h-4 text-[#16845B]" />
                            <span>Resposta Banco Firestore</span>
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              dbLatencyMs === null
                                ? "bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                : dbLatencyMs < 300
                                ? "bg-[#EBF5F0] text-[#16845B] dark:bg-emerald-950/60 dark:text-emerald-400"
                                : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                            }`}
                          >
                            {dbLatencyMs === null
                              ? "Indisponível"
                              : dbLatencyMs < 300
                              ? "Rápido"
                              : "Moderado"}
                          </span>
                        </div>
                        <div className="flex items-baseline space-x-2">
                          <span className="text-3xl font-bold text-[#16845B] dark:text-emerald-400 tabular-nums">
                            {dbLatencyMs !== null ? `${dbLatencyMs} ms` : "Indisponível"}
                          </span>
                          <span className="text-xs text-slate-400">leitura/escrita</span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {dbLatencyMs !== null
                            ? "Medido via consulta real e Firebase Performance Trace (firestore_db_latency)."
                            : "Não foi possível obter tempo de resposta real do Firestore neste momento."}
                        </p>
                      </div>

                      {/* Uso de Memória RAM */}
                      <div className="bg-[#F8FAFC] dark:bg-slate-900/60 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-500 uppercase flex items-center space-x-1.5">
                            <Cpu className="w-4 h-4 text-purple-500" />
                            <span>Uso de Memória RAM</span>
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              memoryUsageMB === null
                                ? "bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                : "bg-purple-500/10 text-purple-600"
                            }`}
                          >
                            {memoryUsageMB === null
                              ? "Indisponível"
                              : memoryUsageMB < 100
                              ? "Baixo"
                              : "Médio"}
                          </span>
                        </div>
                        <div className="flex items-baseline space-x-2">
                          <span className="text-3xl font-bold text-[#172B2A] dark:text-white tabular-nums">
                            {memoryUsageMB !== null ? `${memoryUsageMB} MB` : "Indisponível"}
                          </span>
                          <span className="text-xs text-slate-400">
                            {memoryUsageMB !== null ? "/ 512 MB JS Heap" : "Métrica não exposta pelo navegador"}
                          </span>
                        </div>
                        {memoryUsageMB !== null ? (
                          <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-[#16845B] h-full rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(100, Math.round((memoryUsageMB / 512) * 100))}%` }}
                            />
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-500">
                            Disponível apenas em navegadores que expõem a API <code>performance.memory</code>.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Chart: Network vs DB Latency */}
                    <div className="bg-[#F8FAFC] dark:bg-slate-900/40 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <h3 className="text-xs font-bold uppercase text-slate-700 dark:text-slate-300">
                          Gráfico de Latência em Tempo Real (ms)
                        </h3>
                        <div className="flex items-center space-x-4 text-[10px] font-bold">
                          <span className="flex items-center space-x-1 text-sky-600">
                            <span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block" />
                            <span>Latência de Rede</span>
                          </span>
                          <span className="flex items-center space-x-1 text-[#16845B]">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#16845B] inline-block" />
                            <span>Firestore BD</span>
                          </span>
                        </div>
                      </div>

                      {latencyHistory.length === 0 ? (
                        <div className="h-56 w-full flex flex-col items-center justify-center text-center px-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                          <Activity className="w-7 h-7 text-slate-400 mb-2" />
                          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Nenhuma amostra real de latência coletada nesta sessão.
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Clique em &quot;Medir Desempenho Agora&quot; ou aguarde a coleta em tempo real.
                          </p>
                        </div>
                      ) : (
                        <div className="h-56 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={latencyHistory}>
                              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                              <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                              <YAxis tick={{ fontSize: 10 }} unit="ms" />
                              <Tooltip contentStyle={{ borderRadius: "12px", fontSize: "11px" }} />
                              <Area type="monotone" dataKey="network" name="Rede (ms)" stroke="#0284c7" fill="#0284c7" fillOpacity={0.15} connectNulls={false} />
                              <Area type="monotone" dataKey="db" name="Firestore (ms)" stroke="#16845B" fill="#16845B" fillOpacity={0.15} connectNulls={false} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>

                    {/* LOG DE ERROS GLOBAL FIRESTORE */}
                    <div className="space-y-4 pt-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase text-rose-600 dark:text-rose-400 flex items-center space-x-2">
                          <ShieldAlert className="w-4 h-4" />
                          <span>Capturas do Error Boundary Global (Exceções em Dispositivos Móveis - RNF02)</span>
                        </h3>
                        <span className="px-2.5 py-0.5 rounded-lg bg-rose-500/10 text-rose-600 text-[10px] font-bold">
                          {errorLogsList.length} Registros
                        </span>
                      </div>

                      {errorLogsList.length === 0 ? (
                        <div className="bg-[#F8FAFC] dark:bg-slate-900/50 rounded-xl p-6 text-center space-y-2 border border-dashed border-slate-200 dark:border-slate-800">
                          <CheckCircle2 className="w-8 h-8 text-[#16845B] mx-auto" />
                          <p className="text-xs font-bold text-[#172B2A] dark:text-slate-200">
                            Sem exceções ou erros não tratados recentes!
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Nenhum travamento detectado em dispositivos móveis no IFPR Campus Ivaiporã.
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-[#F8FAFC] dark:bg-slate-800 text-slate-500 uppercase font-bold text-[10px]">
                              <tr>
                                <th className="p-3">Exceção / Mensagem</th>
                                <th className="p-3">Dispositivo</th>
                                <th className="p-3">Usuário</th>
                                <th className="p-3">Resolução Tela</th>
                                <th className="p-3">Data e Hora</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                              {errorLogsList.slice(0, 10).map((log, idx) => (
                                <tr key={log.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                  <td className="p-3 text-rose-600 dark:text-rose-400 font-bold max-w-xs truncate">
                                    {log.errorMessage}
                                  </td>
                                  <td className="p-3 text-slate-600 dark:text-slate-300">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${log.isMobile ? "bg-purple-500/10 text-purple-600" : "bg-sky-500/10 text-sky-600"}`}>
                                      {log.isMobile ? "📱 Mobile" : "💻 Desktop"}
                                    </span>
                                  </td>
                                  <td className="p-3 text-slate-500">{log.userEmail || "Anônimo"}</td>
                                  <td className="p-3 text-slate-400">{log.screenWidth}x{log.screenHeight}</td>
                                  <td className="p-3 text-slate-400">{new Date(log.timestamp).toLocaleString()}</td>
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
                <div className="bg-white dark:bg-[#111827] rounded-2xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-[0_1px_3px_rgba(23,43,42,0.04)] space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                    <div className="flex items-center space-x-3">
                      <div className="p-2.5 rounded-xl bg-[#EBF5F0] text-[#16845B] dark:bg-emerald-950/60 dark:text-emerald-400 border border-[#16845B]/20">
                        <GraduationCap className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-[#172B2A] dark:text-white flex items-center space-x-2">
                          <span>Workflow de Aprovação de Contas (@ifpr.edu.br)</span>
                          {(allUsers || []).filter((u) => u && u.approvalStatus === "PENDENTE").length > 0 && (
                            <span className="px-2.5 py-0.5 rounded-lg bg-amber-500 text-black text-[10px] font-bold uppercase">
                              {(allUsers || []).filter((u) => u && u.approvalStatus === "PENDENTE").length} Em Espera
                            </span>
                          )}
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Validação das solicitações de cadastro com e-mails @estudantes.ifpr.edu.br e @ifpr.edu.br antes da liberação do sistema
                        </p>
                      </div>
                    </div>

                    {(allUsers || []).filter((u) => u && u.approvalStatus === "PENDENTE").length > 0 && (
                      <button
                        onClick={approveAllPendingUsers}
                        className="py-2.5 px-4 rounded-xl bg-[#16845B] hover:bg-[#064E3B] text-white font-bold text-xs transition-all shadow-sm flex items-center justify-center space-x-2 shrink-0 cursor-pointer"
                        title="Aprovar todas as solicitações pendentes de uma só vez"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Aprovar Todos os Pendentes ({(allUsers || []).filter((u) => u && u.approvalStatus === "PENDENTE").length})</span>
                      </button>
                    )}
                  </div>

                  {(allUsers || []).filter((u) => u && u.approvalStatus === "PENDENTE").length === 0 ? (
                    <div className="bg-[#F8FAFC] dark:bg-slate-900/50 rounded-xl p-6 text-center space-y-2 border border-dashed border-slate-200 dark:border-slate-800">
                      <UserCheck className="w-8 h-8 text-[#16845B] mx-auto" />
                      <p className="text-xs font-bold text-[#172B2A] dark:text-slate-200">
                        Nenhuma conta pendente de aprovação no momento!
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Todas as solicitações de alunos e servidores do IFPR Campus Ivaiporã foram validadas.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                        Solicitações em Espera para Análise de Identidade:
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(allUsers || [])
                          .filter((u) => u && u.approvalStatus === "PENDENTE")
                          .map((pendingUser, index) => {
                            const userEmail = String(pendingUser?.email ?? "");
                            const isStudent = userEmail.endsWith("@estudantes.ifpr.edu.br") || userEmail.endsWith("@estudante.ifpr.edu.br");
                            const isStaff = userEmail.endsWith("@ifpr.edu.br");
                            const isPending = pendingUser?.approvalStatus === "PENDENTE";

                            return (
                              <div
                                key={pendingUser.id || `pending-${pendingUser.email}-${index}`}
                                className={`rounded-xl p-5 border space-y-4 shadow-xs transition-all ${
                                  isPending
                                    ? "bg-amber-500/5 border-amber-500/30 dark:bg-amber-950/20"
                                    : "bg-[#F8FAFC] dark:bg-slate-900/80 border-slate-200 dark:border-slate-800"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center space-x-3">
                                    <img
                                      src={getSafeAvatarUrl(pendingUser.avatarUrl, pendingUser.name)}
                                      alt={pendingUser.name}
                                      referrerPolicy="no-referrer"
                                      onError={(e) => handleAvatarError(e, pendingUser.name)}
                                      className="w-10 h-10 rounded-full object-cover border border-slate-300 dark:border-slate-700"
                                    />
                                    <div>
                                      <h4 className="text-xs font-bold text-[#172B2A] dark:text-white">
                                        {pendingUser.name}
                                      </h4>
                                      <p className="text-[11px] text-slate-500 font-mono">{pendingUser.email}</p>
                                    </div>
                                  </div>

                                  <span
                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border ${
                                      isPending
                                        ? "bg-amber-500 text-black border-amber-500 animate-pulse"
                                        : "bg-[#EBF5F0] text-[#16845B] border-[#16845B]/20"
                                    }`}
                                  >
                                    {isPending ? "⏳ Em Espera" : "✅ Aprovado"}
                                  </span>
                                </div>

                                <div className="bg-white dark:bg-slate-900/90 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] space-y-1">
                                  <p className="text-slate-600 dark:text-slate-400">
                                    <strong>Tipo de Vínculo:</strong> {isStudent ? "🎓 Estudante IFPR" : isStaff ? "🏫 Servidor / Docente IFPR" : "Usuário"}
                                  </p>
                                  <p className="text-slate-600 dark:text-slate-400">
                                    <strong>Curso / Departamento:</strong> {pendingUser.courseOrDept}
                                  </p>
                                  <p className="text-slate-600 dark:text-slate-400">
                                    <strong>Matrícula IFPR:</strong> {pendingUser.registrationNumber}
                                  </p>
                                </div>

                                {isPending && (
                                  <div className="flex items-center gap-2 pt-1">
                                    <button
                                      onClick={() => approveUser(pendingUser.id, true)}
                                      className="flex-1 py-2.5 px-3 rounded-xl bg-[#16845B] hover:bg-[#064E3B] text-white font-bold text-xs transition-all shadow-sm flex items-center justify-center space-x-1.5 cursor-pointer"
                                    >
                                      <CheckCircle2 className="w-4 h-4" />
                                      <span>Aprovar Acesso</span>
                                    </button>
                                    <button
                                      onClick={() => approveUser(pendingUser.id, false)}
                                      className="py-2.5 px-4 rounded-xl bg-rose-600/10 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-500/20 font-bold text-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
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
                  <div className="bg-white dark:bg-[#111827] rounded-2xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-[0_1px_3px_rgba(23,43,42,0.04)] space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                      <div className="flex items-center space-x-3">
                        <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20">
                          <HardDrive className="w-6 h-6" />
                        </div>
                        <div>
                          <h2 className="text-lg font-bold text-[#172B2A] dark:text-white">
                            Backups Automáticos & Snapshots do Firestore
                          </h2>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Exportação periódica e agendamento de segurança do banco de dados do Campus Ivaiporã
                          </p>
                        </div>
                      </div>

                      <button
                        id="btn-download-full-backup"
                        onClick={handleManualBackup}
                        disabled={isExecutingBackup}
                        className="px-5 py-2.5 rounded-xl bg-[#16845B] hover:bg-[#064E3B] active:scale-95 text-white font-bold text-xs transition-all shadow-sm flex items-center space-x-2 self-start sm:self-auto cursor-pointer"
                        title="Exportar snapshot JSON com todas as coleções do Firestore do IFPR"
                      >
                        <Download className={`w-4 h-4 ${isExecutingBackup ? "animate-bounce" : ""}`} />
                        <span>{isExecutingBackup ? "Gerando Backup..." : "Baixar Backup Completo"}</span>
                      </button>
                    </div>

                    {/* Configuration Controls */}
                    <div className="bg-[#F8FAFC] dark:bg-slate-900/60 p-5 rounded-xl border border-slate-200 dark:border-slate-800/80 space-y-4">
                      <h3 className="text-xs font-bold uppercase text-slate-700 dark:text-slate-300 tracking-wider">
                        Agendamento & Frequência do Backup
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Toggle */}
                        <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                          <span className="text-xs font-bold text-[#172B2A] dark:text-slate-200">
                            Backup Automático
                          </span>
                          <input
                            type="checkbox"
                            checked={backupScheduleConfig.enabled}
                            onChange={(e) => updateBackupScheduleConfig({ enabled: e.target.checked })}
                            className="w-4 h-4 accent-[#16845B] rounded cursor-pointer"
                          />
                        </div>

                        {/* Frequency */}
                        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                          <span className="text-xs font-bold text-[#172B2A] dark:text-slate-200">
                            Frequência:
                          </span>
                          <select
                            value={backupScheduleConfig.frequency}
                            onChange={(e) =>
                              updateBackupScheduleConfig({ frequency: e.target.value as BackupScheduleConfig["frequency"] })
                            }
                            className="bg-transparent text-xs font-bold text-[#16845B] dark:text-emerald-400 outline-none cursor-pointer"
                          >
                            <option value="A_CADA_12H">A cada 12 Horas</option>
                            <option value="DIARIO_0200">Diário às 02:00h</option>
                            <option value="SEMANAL_DOMINGO">Semanal (Domingos)</option>
                          </select>
                        </div>

                        {/* Auto download */}
                        <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                          <span className="text-xs font-bold text-[#172B2A] dark:text-slate-200">
                            Baixar JSON Automático
                          </span>
                          <input
                            type="checkbox"
                            checked={backupScheduleConfig.autoDownload}
                            onChange={(e) => updateBackupScheduleConfig({ autoDownload: e.target.checked })}
                            className="w-4 h-4 accent-[#16845B] rounded cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Backup History Logs Table */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase text-slate-700 dark:text-slate-300 tracking-wider">
                    Histórico de Backups Realizados ({backupLogs.length})
                  </h3>

                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#F8FAFC] dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800">
                          <th className="p-3">Data / Hora</th>
                          <th className="p-3">Nome do Arquivo</th>
                          <th className="p-3">Tamanho</th>
                          <th className="p-3">Gatilho</th>
                          <th className="p-3">Status</th>
                          <th className="p-3 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {backupLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                            <td className="p-3 font-medium text-[#172B2A] dark:text-slate-200 whitespace-nowrap">
                              {formatDate(log.timestamp)}
                            </td>
                            <td className="p-3 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                              {log.filename}
                            </td>
                            <td className="p-3 font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {(log.fileSizeBytes / 1024).toFixed(1)} KB
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  log.triggerType === "MANUAL"
                                    ? "bg-purple-500/10 text-purple-600"
                                    : "bg-sky-500/10 text-sky-600"
                                }`}
                              >
                                {log.triggerType}
                              </span>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#EBF5F0] text-[#16845B] dark:bg-emerald-950/60 dark:text-emerald-400">
                                SUCESSO
                              </span>
                            </td>
                            <td className="p-3 text-right whitespace-nowrap">
                              <button
                                onClick={() => handleManualBackup()}
                                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-[#16845B] hover:text-white text-slate-700 dark:text-slate-300 font-bold transition-all text-[11px] cursor-pointer"
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
              <div className="bg-white dark:bg-[#111827] rounded-2xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-[0_1px_3px_rgba(23,43,42,0.04)] space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 rounded-xl bg-[#EBF5F0] text-[#16845B] dark:bg-emerald-950/60 dark:text-emerald-400">
                      <History className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-[#172B2A] dark:text-white">
                        Log de Atividades do Administrador (Audit Trail)
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Registro transparente de exclusões, alterações de permissão, manutenção e overrides de status.
                      </p>
                    </div>
                  </div>

                  {/* Filters */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={logSearchQuery}
                        onChange={(e) => setLogSearchQuery(e?.target?.value ?? "")}
                        placeholder="Buscar nos logs..."
                        className="pl-8 pr-3 py-1.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-xs outline-none w-44 focus:border-[#16845B]"
                      />
                    </div>

                    <select
                      value={logFilterAction}
                      onChange={(e) => setLogFilterAction(e?.target?.value ?? "TODOS")}
                      className="py-1.5 px-3 rounded-xl bg-[#F8FAFC] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-xs font-bold outline-none focus:border-[#16845B]"
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
                    <thead className="bg-[#F8FAFC] dark:bg-slate-800 text-slate-500 uppercase font-bold text-[10px]">
                      <tr>
                        <th className="p-3.5 rounded-l-xl">Data / Hora</th>
                        <th className="p-3.5">Administrador</th>
                        <th className="p-3.5">Ação Executada</th>
                        <th className="p-3.5 rounded-r-xl">Detalhes da Operação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
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
                          <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="p-3.5 font-mono text-slate-500 whitespace-nowrap">
                              {formatDate(log.timestamp)}
                            </td>
                            <td className="p-3.5 font-bold text-[#172B2A] dark:text-white">
                              {log.adminName}
                            </td>
                            <td className="p-3.5">
                              <span
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border ${
                                  log.action === "MODO_MANUTENCAO"
                                    ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                                    : log.action === "EXCLUSAO_USUARIO" || log.action === "EXCLUSAO_EM_MASSA"
                                    ? "bg-rose-500/10 text-rose-600 border-rose-500/30"
                                    : log.action === "ALTERACAO_PERMISSAO"
                                    ? "bg-[#EBF5F0] text-[#16845B] border-[#16845B]/30 dark:bg-emerald-950/50 dark:text-emerald-400"
                                    : "bg-sky-500/10 text-sky-600 border-sky-500/30"
                                }`}
                              >
                                {String(log?.action || "LOG").replace("_", " ")}
                              </span>
                            </td>
                            <td className="p-3.5 text-slate-700 dark:text-slate-300">
                              {log.details}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* FIRESTORE CLEANUP & MASTER WIPE TOOLS CARD */}
              <div className="bg-white dark:bg-[#111827] rounded-2xl p-6 sm:p-8 border border-rose-500/20 dark:border-rose-500/30 shadow-[0_1px_3px_rgba(23,43,42,0.04)] space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-rose-500/10 dark:border-rose-500/20 pb-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-3 rounded-xl bg-rose-500/10 text-rose-600 border border-rose-500/20">
                      <Trash2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-[#172B2A] dark:text-white flex items-center space-x-2">
                        <span>Gestão de Banco de Dados & Reset para Próxima Fase</span>
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Ferramentas avançadas para backup local em JSON, limpeza de logs/métricas e script de Master Wipe do Firestore
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* 1. Export JSON Backup */}
                  <div className="bg-[#F8FAFC] dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 flex flex-col justify-between shadow-xs">
                    <div className="space-y-1.5">
                      <div className="flex items-center space-x-2 text-[#16845B] dark:text-emerald-400 font-bold text-xs">
                        <Download className="w-4 h-4" />
                        <span>Backup Completo em JSON</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
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
                      className="w-full py-2.5 px-3 rounded-xl bg-[#16845B] hover:bg-[#064E3B] text-white font-bold text-xs transition-all shadow-sm flex items-center justify-center space-x-2 cursor-pointer"
                    >
                      <Download className={`w-4 h-4 ${isExportingBackup ? "animate-bounce" : ""}`} />
                      <span>{isExportingBackup ? "Gerando JSON..." : "Exportar JSON Local"}</span>
                    </button>
                  </div>

                  {/* 2. Clear Logs & Metrics */}
                  <div className="bg-[#F8FAFC] dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 flex flex-col justify-between shadow-xs">
                    <div className="space-y-1.5">
                      <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-300 font-bold text-xs">
                        <BarChart3 className="w-4 h-4" />
                        <span>Limpar Logs & Métricas</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        Exclui todo o histórico de logs de atividades (audit trail), logs de backup e métricas de desempenho no Firestore para reiniciar as estatísticas do zero.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsClearLogsConfirmOpen(true)}
                      className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold text-xs transition-all shadow-sm flex items-center justify-center space-x-2 cursor-pointer"
                    >
                      <BarChart3 className="w-4 h-4" />
                      <span>Limpar Logs e Métricas</span>
                    </button>
                  </div>

                  {/* 3. Master Wipe Script */}
                  <div className="bg-[#F8FAFC] dark:bg-slate-900 p-5 rounded-xl border border-rose-500/30 dark:border-rose-500/30 space-y-3 flex flex-col justify-between shadow-xs">
                    <div className="space-y-1.5">
                      <div className="flex items-center space-x-2 text-rose-600 dark:text-rose-400 font-bold text-xs">
                        <ShieldAlert className="w-4 h-4" />
                        <span>Master Wipe (Zerar Banco)</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        Script administrativo que deleta todos os objetos, usuários fictícios e logs do Firestore com um único comando, mantendo apenas sua conta ativa de administrador.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsMasterWipeConfirmOpen(true)}
                      className="w-full py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-all shadow-sm flex items-center justify-center space-x-2 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Zerar Banco de Dados</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: GERADOR DE DOCUMENTOS PDF EDITÁVEIS (ADMIN ONLY) */}
          {adminSubTab === "documents" && (
            <div className="space-y-6">
              <DocumentManagerView />
            </div>
          )}

          {/* TAB 6: DADOS DO PROJETO INOVAIF & INSTITUCIONAIS (ADMIN ONLY) */}
          {adminSubTab === "project_settings" && (
            <div className="space-y-6">
              <ProjectConfigView />
            </div>
          )}

          {/* TAB 7: HISTÓRICO DE VERSÕES & CHANGELOG (ADMIN ONLY) */}
          {adminSubTab === "versions" && (
            <div className="space-y-6">
              <VersionHistoryView darkMode={darkMode} />
            </div>
          )}

          {/* TAB 7.1: BATERIA DE TESTES & VALIDAÇÃO DO SISTEMA (GOVERNANÇA & AUDITORIA) */}
          {adminSubTab === "test_batteries" && (
            <div className="space-y-6">
              <TestBatteryManagerView darkMode={darkMode} />
            </div>
          )}

          {/* TAB 7.2: SEÇÃO DE DISTRIBUIÇÃO DE TESTES */}
          {adminSubTab === "test_distribution" && (
            <div className="space-y-6">
              <TestBatteryManagerView darkMode={darkMode} initialTab="DISTRIBUTION" />
            </div>
          )}


          {/* TAB: GESTÃO DE SOLICITAÇÕES DE DEVOLUÇÃO (SECRETARIA / SEBAC / RNF04) */}
          {adminSubTab === "claims" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="bg-white dark:bg-[#111827] rounded-2xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-[0_1px_3px_rgba(23,43,42,0.04)] space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 rounded-xl bg-[#EBF5F0] text-[#16845B] dark:bg-emerald-950/60 dark:text-emerald-400 border border-[#16845B]/20">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-[#172B2A] dark:text-white flex items-center space-x-2">
                        <span>Solicitações de Devolução de Objetos</span>
                        {pendingClaimsCount > 0 && (
                          <span className="px-2.5 py-0.5 rounded-lg bg-amber-500 text-black text-[10px] font-bold uppercase">
                            {pendingClaimsCount} Pendentes
                          </span>
                        )}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Análise de posse, aprovação de pedidos e triagem da Secretaria / SEBAC (IFPR Campus Ivaiporã)
                      </p>
                    </div>
                  </div>
                  <span className="self-start sm:self-auto px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold border border-slate-200 dark:border-slate-700">
                    {(claims || []).length} Registros no Total
                  </span>
                </div>

                {/* Filter and Search Bar */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(["TODAS", "PENDENTE", "APROVADO", "REJEITADO", "CONCLUIDO", "CANCELADO"] as const).map((st) => {
                      const count = st === "TODAS"
                        ? (claims || []).length
                        : (claims || []).filter((c) => c && c.status === st).length;
                      const isActive = claimStatusFilter === st;
                      return (
                        <button
                          key={st}
                          type="button"
                          onClick={() => {
                            vibrateClick();
                            setClaimStatusFilter(st);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isActive
                              ? "bg-[#16845B] text-white shadow-xs"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                          }`}
                        >
                          {st === "TODAS" ? "Todas" : st === "PENDENTE" ? "Pendentes" : st === "APROVADO" ? "Aprovadas" : st === "REJEITADO" ? "Rejeitadas" : st === "CONCLUIDO" ? "Concluídas" : "Canceladas"} ({count})
                        </button>
                      );
                    })}
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={claimSearchText}
                      onChange={(e) => setClaimSearchText(e.target.value)}
                      placeholder="Buscar por objeto, solicitante, matrícula..."
                      className="pl-8 pr-3 py-1.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-xs outline-none w-full md:w-64 focus:border-[#16845B]"
                    />
                  </div>
                </div>

                {/* Claims Table / List */}
                {(() => {
                  const filteredClaims = (claims || []).filter((c) => {
                    if (!c) return false;
                    const matchStatus = claimStatusFilter === "TODAS" || c.status === claimStatusFilter;
                    const q = sanitizeQuery(claimSearchText);
                    const matchQuery =
                      !q ||
                      safeIncludes(c.itemTitle, q) ||
                      safeIncludes(c.claimerName, q) ||
                      safeIncludes(c.claimerEmail, q) ||
                      safeIncludes(c.claimerRegistration, q) ||
                      safeIncludes(c.distinctiveFeatures, q) ||
                      safeIncludes(c.additionalInfo, q) ||
                      safeIncludes(c.itemId, q);
                    return matchStatus && matchQuery;
                  });

                  if (filteredClaims.length === 0) {
                    return (
                      <div className="bg-[#F8FAFC] dark:bg-slate-900/50 rounded-xl p-8 text-center space-y-2 border border-dashed border-slate-200 dark:border-slate-800">
                        <CheckCircle2 className="w-10 h-10 text-slate-400 mx-auto" />
                        <p className="text-sm font-bold text-[#172B2A] dark:text-slate-200">
                          Nenhuma solicitação encontrada
                        </p>
                        <p className="text-xs text-slate-500 max-w-md mx-auto">
                          Não foram localizadas solicitações de devolução para o filtro selecionado.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#F8FAFC] dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 uppercase font-bold text-[10px]">
                          <tr>
                            <th className="p-3.5">Objeto / Categoria</th>
                            <th className="p-3.5">Solicitante</th>
                            <th className="p-3.5">Características Declaradas (RNF04)</th>
                            <th className="p-3.5">Data / Status</th>
                            <th className="p-3.5 text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredClaims.map((claim) => {
                            const relatedItem = items.find((it) => it.id === claim.itemId);
                            return (
                              <tr key={claim.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                <td className="p-3.5">
                                  <div className="font-bold text-[#172B2A] dark:text-white">
                                    {claim.itemTitle || relatedItem?.title || "Objeto"}
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                                    <span>#{claim.itemId}</span>
                                    <span>•</span>
                                    <span>{claim.itemCategory || relatedItem?.category || "Categoria"}</span>
                                  </div>
                                  {relatedItem && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        vibrateClick();
                                        setSelectedItemForDetail(relatedItem);
                                      }}
                                      className="text-[10px] text-[#16845B] hover:underline font-bold mt-1 inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <span>Ver ficha completa do item</span>
                                    </button>
                                  )}
                                </td>

                                <td className="p-3.5">
                                  <div className="font-bold text-[#172B2A] dark:text-slate-200">
                                    {claim.claimerName}
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    {claim.claimerEmail}
                                  </div>
                                  <div className="text-[10px] text-slate-400 mt-0.5">
                                    {claim.claimerRole || "Aluno"} {claim.claimerRegistration ? `• Matrícula: ${claim.claimerRegistration}` : ""}
                                  </div>
                                </td>

                                <td className="p-3.5 max-w-xs">
                                  <div className="text-[#172B2A] dark:text-slate-200 text-xs bg-[#F8FAFC] dark:bg-slate-800/70 p-2 rounded-xl border border-slate-200 dark:border-slate-700/60 leading-relaxed whitespace-pre-wrap">
                                    {claim.distinctiveFeatures || "Sem características registradas."}
                                  </div>
                                  {claim.additionalInfo && (
                                    <div className="text-[10px] text-slate-500 mt-1 italic">
                                      Info adicional: {claim.additionalInfo}
                                    </div>
                                  )}
                                  {claim.rejectionReason && (
                                    <div className="text-[10px] text-rose-600 dark:text-rose-400 font-bold mt-1 bg-rose-500/10 p-1.5 rounded-lg border border-rose-500/20">
                                      Motivo da Rejeição: {claim.rejectionReason}
                                    </div>
                                  )}
                                </td>

                                <td className="p-3.5 whitespace-nowrap">
                                  <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 mb-1">
                                    {formatDateTime(claim.createdAt)}
                                  </div>
                                  <span
                                    className={`inline-block px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${
                                      claim.status === "PENDENTE"
                                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
                                        : claim.status === "APROVADO"
                                        ? "bg-[#EBF5F0] text-[#16845B] dark:bg-emerald-950/60 dark:text-emerald-400 border-[#16845B]/30"
                                        : claim.status === "REJEITADO"
                                        ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30"
                                        : claim.status === "CONCLUIDO"
                                        ? "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30"
                                        : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700"
                                    }`}
                                  >
                                    {claim.status === "PENDENTE"
                                      ? "Em Análise"
                                      : claim.status === "APROVADO"
                                      ? "Aprovado (Aguardando Retirada)"
                                      : claim.status === "REJEITADO"
                                      ? "Rejeitado"
                                      : claim.status === "CONCLUIDO"
                                      ? "Devolvido ao Dono"
                                      : "Cancelado"}
                                  </span>
                                  {claim.reviewedByName && (
                                    <div className="text-[9px] text-slate-400 mt-1">
                                      Por: {claim.reviewedByName}
                                    </div>
                                  )}
                                </td>

                                <td className="p-3.5 text-right whitespace-nowrap">
                                  {claim.status === "PENDENTE" && (
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        type="button"
                                        disabled={isProcessingClaimAction}
                                        onClick={async () => {
                                          vibrateClick();
                                          try {
                                            setIsProcessingClaimAction(true);
                                            await updateClaimStatus(claim.id, "APROVADO", {
                                              decisionNotes: "Solicitação deferida após conferência das características particulares.",
                                            });
                                            vibrateSuccess();
                                            addToast(`Solicitação de ${claim.claimerName} APROVADA com sucesso!`, "success");
                                          } catch (e: any) {
                                            addToast(e?.message || "Erro ao aprovar solicitação.", "error");
                                          } finally {
                                            setIsProcessingClaimAction(false);
                                          }
                                        }}
                                        className="px-3 py-1.5 rounded-xl bg-[#16845B] hover:bg-[#064E3B] text-white font-bold text-xs transition-all shadow-xs cursor-pointer disabled:opacity-50"
                                        title="Aprovar posse e autorizar retirada no balcão"
                                      >
                                        Aprovar
                                      </button>
                                      <button
                                        type="button"
                                        disabled={isProcessingClaimAction}
                                        onClick={() => {
                                          vibrateClick();
                                          setClaimToReject(claim);
                                          setRejectionReasonInput("");
                                        }}
                                        className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-all shadow-xs cursor-pointer disabled:opacity-50"
                                        title="Rejeitar solicitação com justificativa"
                                      >
                                        Rejeitar
                                      </button>
                                    </div>
                                  )}

                                  {claim.status === "APROVADO" && (
                                    <div className="flex items-center justify-end gap-1.5">
                                      {relatedItem && relatedItem.status !== "DEVOLVIDO" && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            vibrateClick();
                                            setSelectedItemForDetail(relatedItem);
                                          }}
                                          className="px-3 py-1.5 rounded-xl bg-[#064E3B] hover:bg-[#16845B] text-white font-bold text-xs transition-all shadow-xs cursor-pointer inline-flex items-center gap-1"
                                          title="Abrir o modal do objeto para registrar entrega formal com assinatura"
                                        >
                                          <FileSignature className="w-3.5 h-3.5" />
                                          <span>Devolução Formal</span>
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        disabled={isProcessingClaimAction}
                                        onClick={() => {
                                          vibrateClick();
                                          setClaimToReject(claim);
                                          setRejectionReasonInput("");
                                        }}
                                        className="px-2.5 py-1.5 rounded-xl border border-rose-500/40 text-rose-600 hover:bg-rose-500/10 font-bold text-xs transition-all cursor-pointer"
                                        title="Revogar aprovação e rejeitar"
                                      >
                                        Revogar
                                      </button>
                                    </div>
                                  )}

                                  {(claim.status === "REJEITADO" || claim.status === "CONCLUIDO" || claim.status === "CANCELADO") && (
                                    <span className="text-[11px] text-slate-400 italic">
                                      Encerrada
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Modal de Rejeição de Solicitação */}
          {claimToReject && (
            <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm transition-all duration-200">
              <div className="bg-white dark:bg-[#111827] rounded-2xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                    <div>
                      <h3 className="font-bold text-base text-[#172B2A] dark:text-white">
                        Rejeitar Solicitação de Devolução
                      </h3>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                        Secretaria IFPR • Decisão Administrativa
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setClaimToReject(null)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs space-y-1">
                  <p className="text-rose-900 dark:text-rose-300">
                    Solicitante: <strong>{claimToReject.claimerName}</strong> ({claimToReject.claimerEmail})
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    Objeto: {claimToReject.itemTitle} (#{claimToReject.itemId})
                  </p>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!rejectionReasonInput.trim()) {
                      addToast("Informe o motivo da rejeição para registrar a decisão.", "error");
                      return;
                    }
                    try {
                      setIsProcessingClaimAction(true);
                      await updateClaimStatus(claimToReject.id, "REJEITADO", {
                        rejectionReason: rejectionReasonInput.trim(),
                        decisionNotes: `Rejeitado por ${currentUser.name} (${currentUser.role}).`,
                      });
                      vibrateSuccess();
                      addToast("Solicitação rejeitada e requerente notificado.", "info");
                      setClaimToReject(null);
                      setRejectionReasonInput("");
                    } catch (err: any) {
                      addToast(err?.message || "Erro ao rejeitar solicitação.", "error");
                    } finally {
                      setIsProcessingClaimAction(false);
                    }
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                      Justificativa da Rejeição * (Será exibida ao solicitante)
                    </label>
                    <textarea
                      required
                      rows={3}
                      value={rejectionReasonInput}
                      onChange={(e) => setRejectionReasonInput(e.target.value)}
                      placeholder="Ex: Características informadas não coincidem com o objeto arquivado na guarita..."
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8FAFC] dark:bg-[#0B0F17] text-[#172B2A] dark:text-white text-xs outline-none focus:border-rose-500"
                    />
                  </div>

                  <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setClaimToReject(null)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isProcessingClaimAction || !rejectionReasonInput.trim()}
                      className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      <span>{isProcessingClaimAction ? "Processando..." : "Confirmar Rejeição"}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* TAB: FILA DE ASSINATURAS INSTITUCIONAIS PENDENTES (ATENDENTE / SERVIDOR) */}
          {adminSubTab === "pending_signatures" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <SurfaceCard padding="lg" className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50">
                      <FileSignature className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-[#172B2A] dark:text-white flex flex-wrap items-center gap-2">
                        <span>Fila de Assinaturas Institucionais Pendentes</span>
                        {pendingSignaturesCount > 0 && (
                          <UIBadge tone="amber">{pendingSignaturesCount} Pendentes</UIBadge>
                        )}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Devoluções com termo assinado pelo receptor que aguardam atestação e assinatura institucional do servidor atendente
                      </p>
                    </div>
                  </div>
                </div>

                {pendingSignaturesItems.length === 0 ? (
                  <EmptyState
                    icon={<CheckCircle2 className="w-7 h-7" />}
                    title="Nenhuma assinatura institucional pendente para suas devoluções!"
                    description="Todas as devoluções emitidas por você que necessitam de atestação possuem a assinatura dupla concluída ou nenhuma pendência foi registrada para seu usuário."
                  />
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F8FAFC] dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 uppercase font-bold text-[10px]">
                        <tr>
                          <th className="p-3.5">Objeto / Identificador</th>
                          <th className="p-3.5">Receptor / Proprietário</th>
                          <th className="p-3.5">Assinatura do Receptor</th>
                          <th className="p-3.5">Data / Código Recibo</th>
                          <th className="p-3.5 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {pendingSignaturesItems.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="p-3.5 font-bold text-[#172B2A] dark:text-white">
                              <div>{item.title}</div>
                              <div className="text-[10px] font-mono text-slate-400">#{item.id} • {item.category}</div>
                            </td>
                            <td className="p-3.5">
                              <div className="font-bold text-[#172B2A] dark:text-slate-200">
                                {item.recipientName || item.recipientSignatureName || "Receptor"}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {item.recipientBond || "Aluno(a)"} • {item.recipientEmail || "Sem e-mail"}
                              </div>
                            </td>
                            <td className="p-3.5">
                              <UIBadge tone="emerald">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Receptor Assinou</span>
                              </UIBadge>
                            </td>
                            <td className="p-3.5 font-mono text-slate-600 dark:text-slate-400">
                              <div>{formatDate(item.signedAt || item.resolutionDate || item.date)}</div>
                              <div className="text-[10px] text-slate-400">{item.receiptValidationCode || "CÓDIGO PENDENTE"}</div>
                            </td>
                            <td className="p-3.5 text-right whitespace-nowrap">
                              <UIButton
                                type="button"
                                variant="primary"
                                size="sm"
                                onClick={() => {
                                  vibrateClick();
                                  setSelectedItemForDetail(item);
                                }}
                              >
                                <PenTool className="w-3.5 h-3.5" />
                                <span>Atestar e Assinar</span>
                              </UIButton>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Section for Unassigned Pending Signatures (Missing Issuer) */}
                {unassignedPendingSignaturesItems.length > 0 && (
                  <div className="pt-6 border-t border-slate-200 dark:border-slate-800 space-y-4">
                    <div className="flex items-center space-x-2 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="w-5 h-5 shrink-0" />
                      <div>
                        <h3 className="text-sm font-bold uppercase tracking-wide">
                          Devoluções Pendentes Sem Emissor Identificado ({unassignedPendingSignaturesCount})
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Devoluções com assinatura do receptor que não possuem servidor emissor registrado. A atestação está bloqueada até a verificação da autoria original.
                        </p>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/40 dark:bg-amber-950/20 p-1">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-amber-500/10 text-amber-900 dark:text-amber-200 uppercase font-bold text-[10px]">
                          <tr>
                            <th className="p-3.5">Objeto / Identificador</th>
                            <th className="p-3.5">Receptor</th>
                            <th className="p-3.5">Status Autoria</th>
                            <th className="p-3.5">Data Recibo</th>
                            <th className="p-3.5 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-200/40 dark:divide-amber-800/30">
                          {unassignedPendingSignaturesItems.map((item) => (
                            <tr key={item.id} className="hover:bg-amber-500/10 transition-colors">
                              <td className="p-3.5 font-bold text-[#172B2A] dark:text-white">
                                <div>{item.title}</div>
                                <div className="text-[10px] font-mono text-slate-400">#{item.id} • {item.category}</div>
                              </td>
                              <td className="p-3.5">
                                <div className="font-bold text-[#172B2A] dark:text-slate-200">
                                  {item.recipientName || item.recipientSignatureName || "Receptor"}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  {item.recipientBond || "Aluno(a)"}
                                </div>
                              </td>
                              <td className="p-3.5">
                                <UIBadge tone="amber">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>Emissor Não Identificado</span>
                                </UIBadge>
                              </td>
                              <td className="p-3.5 font-mono text-slate-600 dark:text-slate-400">
                                <div>{formatDate(item.signedAt || item.resolutionDate || item.date)}</div>
                              </td>
                              <td className="p-3.5 text-right whitespace-nowrap">
                                <UIButton
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    vibrateClick();
                                    setSelectedItemForDetail(item);
                                  }}
                                >
                                  <span>Verificar Detalhes</span>
                                </UIButton>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </SurfaceCard>
            </div>
          )}

          {/* TAB 9: LEMBRETES DE CUSTÓDIA >90 DIAS */}
          {adminSubTab === "custody_reminders" && (
            <div className="space-y-6">
              <CustodyRemindersView />
            </div>
          )}

          {/* TAB 10: MÉTRICAS DE DEVOLUÇÕES DIGITAIS VIA D3.JS */}
          {adminSubTab === "digital_returns" && (
            <div className="space-y-6">
              <DigitalReturnsD3Chart
                items={items}
                activityLogs={activityLogs}
                darkMode={darkMode}
                onSelectItem={(it) => setSelectedItemForDetail(it)}
              />
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  )}

      {/* MODAL: ADICIONAR NOVO USUÁRIO PELO ADMIN */}
      {isAddingUserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white dark:bg-[#111827] rounded-2xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center space-x-2.5">
                <div className="p-2.5 rounded-xl bg-[#EBF5F0] text-[#16845B] dark:bg-emerald-950/60 dark:text-emerald-400">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#172B2A] dark:text-white">
                    Cadastrar Novo Usuário no IFPR
                  </h3>
                  <p className="text-xs text-slate-500">
                    Administrador TI • Adicionar aluno ou servidor
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingUserOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddUserSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nome Completo <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Ex: Carlos Eduardo da Silva"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-[#172B2A] dark:text-white outline-none focus:border-[#16845B]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  E-mail Institucional <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="Ex: carlos.silva@estudante.ifpr.edu.br"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-[#172B2A] dark:text-white outline-none focus:border-[#16845B]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Perfil / Função
                  </label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-[#172B2A] dark:text-white outline-none focus:border-[#16845B]"
                  >
                    <option value="ALUNO">ALUNO (Discente)</option>
                    <option value="SERVIDOR">SERVIDOR (Docente / TAE)</option>
                    <option value="ADMIN">ADMINISTRADOR (TI)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Matrícula / Prontuário
                  </label>
                  <input
                    type="text"
                    value={newUserRegNumber}
                    onChange={(e) => setNewUserRegNumber(e.target.value)}
                    placeholder="Ex: 2026100987"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-[#172B2A] dark:text-white outline-none focus:border-[#16845B]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Curso ou Setor no IFPR Campus Ivaiporã
                </label>
                <input
                  type="text"
                  value={newUserDept}
                  onChange={(e) => setNewUserDept(e.target.value)}
                  placeholder="Ex: Técnico em Informática"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-[#172B2A] dark:text-white outline-none focus:border-[#16845B]"
                />
              </div>

              <div className="pt-4 flex justify-end space-x-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddingUserOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#16845B] hover:bg-[#064E3B] text-white font-bold shadow-sm transition-all flex items-center space-x-1.5 cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-[#111827] rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5">
            <div className="flex items-center space-x-3 text-rose-600 dark:text-rose-400">
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#172B2A] dark:text-white">
                  Resetar Banco de Dados do Sistema
                </h3>
                <p className="text-xs text-slate-500">
                  Exclusivo para Fases de Testes do IFPR
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Esta ação redefinirá todas as ocorrências, notificações e usuários para os valores padrão de fábrica (Mock Baseline do IFPR Campus Ivaiporã).
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await resetSystemData();
                    await logAdminAction("RESET_SISTEMA", "Efetuou o reset total do banco de dados do sistema.");
                    setIsResetConfirmOpen(false);
                  } catch {
                    // Erro real já reportado pelo resetSystemData; não registrar RESET_SISTEMA falso
                  }
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm cursor-pointer"
              >
                Sim, Resetar Sistema
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: LIMPAR LOGS E MÉTRICAS DE DESEMPENHO */}
      {isClearLogsConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-[#111827] rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5">
            <div className="flex items-center space-x-3 text-[#16845B] dark:text-emerald-400">
              <div className="p-3 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/60 border border-[#16845B]/20">
                <BarChart3 className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#172B2A] dark:text-white">
                  Limpar Logs e Métricas de Desempenho
                </h3>
                <p className="text-xs text-slate-500">
                  Reiniciar histórico de estatísticas do Firestore
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Esta ação apagará permanentemente todo o histórico de logs de atividades (audit trail), registros de backup, logs de erro e métricas de desempenho no Firestore. As estatísticas e o monitor de uptime serão iniciados do zero para a próxima fase de testes.
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setIsClearLogsConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
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
                className="px-4 py-2 rounded-xl bg-[#16845B] hover:bg-[#064E3B] text-white text-xs font-bold shadow-sm cursor-pointer"
              >
                Sim, Limpar Logs e Métricas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SCRIPT MASTER WIPE (ZERAR BANCO FIRESTORE) */}
      {isMasterWipeConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-[#111827] rounded-2xl p-6 border border-rose-500/30 dark:border-rose-500/30 shadow-2xl space-y-5">
            <div className="flex items-center space-x-3 text-rose-600 dark:text-rose-400">
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <Trash2 className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#172B2A] dark:text-white">
                  🔥 Master Wipe - Limpeza Completa
                </h3>
                <p className="text-xs text-rose-500 font-bold">
                  Ação Irreversível no Firestore
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <strong>ATENÇÃO:</strong> Esta ação executará o script de limpeza total no Firestore. Todos os objetos achados/perdidos, reivindicações, comentários, notificações e usuários (exceto sua conta atual de administrador) serão <strong>DELETADOS PERMANENTEMENTE</strong>.
              <br /><br />
              💡 <em>Recomenda-se exportar o backup em JSON antes de continuar.</em>
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setIsMasterWipeConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
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
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm flex items-center space-x-1.5 cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-[#111827] rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5">
            <div className="flex items-center space-x-3 text-rose-600 dark:text-rose-400">
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <UserX className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#172B2A] dark:text-white">
                  Confirmar Remoção de Usuário
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ação exclusiva para Administradores
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Tem certeza que deseja remover o usuário <strong>{userToDelete.name}</strong>? Esta ação removerá os dados de perfil do banco de dados do IFPR.
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={isDeletingUser}
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingUser}
                onClick={async () => {
                  if (!userToDelete) return;
                  try {
                    setIsDeletingUser(true);
                    vibrateClick();
                    await deleteUser(userToDelete.id);
                    vibrateSuccess();
                    setUserToDelete(null);
                  } catch (delErr) {
                    console.error("Falha ao excluir usuário no painel administrativo:", delErr);
                  } finally {
                    setIsDeletingUser(false);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white text-xs font-bold transition-colors shadow-xs flex items-center space-x-1.5 cursor-pointer"
              >
                {isDeletingUser && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isDeletingUser ? "Removendo..." : "Sim, Remover Usuário"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Enviar Notificação Direta para Aluno(s) */}
      {(notifyModalUser || isBroadcastNotification) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white dark:bg-[#111827] rounded-2xl p-6 sm:p-7 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-3 text-[#16845B] dark:text-emerald-400">
                <div className="p-3 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/60 border border-[#16845B]/20">
                  <Send className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#172B2A] dark:text-white">
                    Enviar Notificação do Sistema
                  </h3>
                  <p className="text-xs text-slate-500">
                    Aviso direto ao discente no painel e sininho do app
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNotifyModalUser(null);
                  setIsBroadcastNotification(false);
                }}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendAdminNotification} className="space-y-4">
              {/* Target Selector */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-400 mb-1.5">
                  Destinatário da Notificação
                </label>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsBroadcastNotification(false);
                      if (!notifyModalUser) {
                        const first = (allUsers || []).find((u) => u && u.role === "ALUNO") || allUsers[0];
                        setNotifyModalUser(first || null);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      !isBroadcastNotification
                        ? "bg-[#16845B] text-white"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    Aluno Específico
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsBroadcastNotification(true);
                      setNotifyModalUser(null);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isBroadcastNotification
                        ? "bg-[#16845B] text-white"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    📢 Todos os Alunos ({allUsers.filter((u) => u && u.role === "ALUNO").length})
                  </button>
                </div>

                {!isBroadcastNotification && (
                  <select
                    value={notifyModalUser?.id || ""}
                    onChange={(e) => {
                      const sel = allUsers.find((u) => u.id === e.target.value);
                      setNotifyModalUser(sel || null);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-xs text-[#172B2A] dark:text-white outline-none font-bold focus:border-[#16845B]"
                  >
                    {allUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} — {u.email} ({u.role})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Quick Presets */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                  Modelos Rápidos:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setNotifyTitle("Objeto com características similares registrado!");
                      setNotifyMessage(
                        `Olá${notifyModalUser ? ` ${notifyModalUser.name}` : ""}! Um novo item similar ao seu relato foi cadastrado no sistema. Acesse a aba 'Encontrados' para conferir e solicitar a devolução.`
                      );
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-[#EBF5F0] hover:text-[#16845B] text-[11px] font-semibold text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    ✨ Objeto Similar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNotifyTitle("Comparecer à Recepção / Seção de Achados");
                      setNotifyMessage(
                        `Prezado(a)${notifyModalUser ? ` ${notifyModalUser.name}` : ""}, favor comparecer à recepção do campus IFPR Ivaiporã com documento com foto para retirada de seu item.`
                      );
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-[#EBF5F0] hover:text-[#16845B] text-[11px] font-semibold text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    🏢 Retirada Presencial
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNotifyTitle("Solicitação de Devolução Aprovada");
                      setNotifyMessage(
                        `Sua comprovação de propriedade foi validada pela equipe do IFPR. O item está liberado para entrega.`
                      );
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-[#EBF5F0] hover:text-[#16845B] text-[11px] font-semibold text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    ✅ Devolução Aprovada
                  </button>
                </div>
              </div>

              {/* Title Input */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-400 mb-1.5">
                  Título da Notificação
                </label>
                <input
                  type="text"
                  required
                  value={notifyTitle}
                  onChange={(e) => setNotifyTitle(e.target.value)}
                  placeholder="Ex: Item similar encontrado na Biblioteca..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-xs text-[#172B2A] dark:text-white outline-none focus:border-[#16845B] font-bold"
                />
              </div>

              {/* Related Item (Optional) */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-400 mb-1.5">
                  Objeto Relacionado (Opcional)
                </label>
                <select
                  value={notifyRelatedItemId}
                  onChange={(e) => setNotifyRelatedItemId(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#F8FAFC] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-xs text-[#172B2A] dark:text-white outline-none focus:border-[#16845B]"
                >
                  <option value="">Nenhum objeto específico vinculado</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      #{it.id.slice(-6)} - {it.title} ({it.type} - {it.category})
                    </option>
                  ))}
                </select>
              </div>

              {/* Message Textarea */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-400 mb-1.5">
                  Mensagem Detalhada
                </label>
                <textarea
                  required
                  rows={3}
                  value={notifyMessage}
                  onChange={(e) => setNotifyMessage(e.target.value)}
                  placeholder="Digite as instruções e informações para o aluno..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-xs text-[#172B2A] dark:text-white outline-none focus:border-[#16845B]"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  disabled={isSendingNotif}
                  onClick={() => {
                    setNotifyModalUser(null);
                    setIsBroadcastNotification(false);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSendingNotif}
                  className="px-5 py-2.5 rounded-xl bg-[#16845B] hover:bg-[#064E3B] text-white text-xs font-bold shadow-sm flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSendingNotif ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Enviando...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Enviar Notificação</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage User Status (Suspend / Ban / Reactivate) Modal */}
      <ManageUserStatusModal
        isOpen={Boolean(userForStatusModal)}
        user={userForStatusModal}
        onClose={() => setUserForStatusModal(null)}
        onUpdateStatus={async (targetUserId, newStatus, reason, suspendedUntil) => {
          await updateUserStatus(targetUserId, newStatus, reason, suspendedUntil);
          setUserForStatusModal(null);
        }}
        currentAdminId={currentUser.id}
      />

      {/* Export Official Found Items Accountability PDF Report Modal */}
      <ExportFoundItemsReportModal
        isOpen={isExportFoundModalOpen}
        onClose={() => setIsExportFoundModalOpen(false)}
      />
    </div>
  );
};

export default DashboardView;
