import React, { useState, useEffect, useMemo } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useApp } from "../context/AppContext";
import { useRouter } from "../context/RouterContext";
import {
  getLocaleForLanguage,
  localize,
  translateUserRole,
  translateCategory,
  translateColor,
  translateItemStatus,
  translateCampusLocation,
  translateClaimStatus,
  translateActivityAction,
} from "../lib/i18n";
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
import { isVerifiedRootAdminAuthUser } from "../lib/devolutionAuth";
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
  KeyRound,
  Copy,
  Check,
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
    sendUserFirstAccessLink,
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
    language,
    t,
  } = useApp();

  const { navigate } = useRouter();
  const l = (pt: string, en: string) => localize(language, pt, en);
  const locale = getLocaleForLanguage(language);

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
  const [isSubmittingNewUser, setIsSubmittingNewUser] = useState(false);
  const [sendingFirstAccessUserId, setSendingFirstAccessUserId] = useState<string | null>(null);
  const [firstAccessFeedback, setFirstAccessFeedback] = useState<{
    email: string;
    emailSent: boolean;
    deliveryMethod: string;
    deliveryError?: string;
    manualSetupLink?: string;
    authProvisioned?: boolean;
  } | null>(null);
  const [copiedSetupLink, setCopiedSetupLink] = useState(false);
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

  const isRootAdminUser = useMemo(() => {
    return isVerifiedRootAdminAuthUser(auth.currentUser);
  }, [currentUser?.id, currentUser?.email, currentUser?.emailVerified]);

  useEffect(() => {
    if (!isRootAdminUser && newUserRole === "ADMIN") {
      setNewUserRole("ALUNO");
    }
  }, [isRootAdminUser, newUserRole]);

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
    setNotifyTitle(
      l(`Atualização sobre seu item: ${it.title}`, `Update about your item: ${it.title}`)
    );
    setNotifyMessage(
      l(
        `Olá, ${targetUser.name}! Há uma atualização referente ao seu objeto "${it.title}" registrado no Achados e Perdidos do IFPR Campus Ivaiporã.`,
        `Hello, ${targetUser.name}! There is an update regarding your item "${it.title}" registered in IFPR Ivaiporã Campus Lost & Found.`
      )
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
      addToast(
        l("Digite uma mensagem válida para o modo de manutenção.", "Enter a valid message for maintenance mode."),
        "error"
      );
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
      addToast(l("Erro ao executar cópia de segurança do Firestore.", "Error executing Firestore backup."), "error");
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
    if (!newUserName.trim() || !newUserEmail.trim()) {
      addToast(l("Preencha o nome e o e-mail do novo usuário.", "Fill in the new user's name and email."), "error");
      return;
    }

    setIsSubmittingNewUser(true);
    try {
      const effectiveRole: UserRole =
        newUserRole === "ADMIN" && !isRootAdminUser ? "ALUNO" : newUserRole;

      const result = await addUserByAdmin({
        name: newUserName.trim(),
        email: newUserEmail.trim().toLowerCase(),
        role: effectiveRole,
        courseOrDept: newUserDept.trim() || "IFPR Campus Ivaiporã",
        registrationNumber:
          newUserRegNumber.trim() || "2026100" + Math.floor(100 + Math.random() * 900),
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(newUserName.trim())}`,
        reputationScore: 100,
      });

      setFirstAccessFeedback({
        email: result.user.email,
        emailSent: result.emailSent,
        deliveryMethod: result.deliveryMethod,
        deliveryError: result.deliveryError,
        manualSetupLink: result.manualSetupLink,
        authProvisioned: result.authCreated,
      });

      setNewUserName("");
      setNewUserEmail("");
      setNewUserRole("ALUNO");
      setNewUserRegNumber("");
      setIsAddingUserOpen(false);
    } catch (_) {
      // Falha tratada pelo addUserByAdmin com notificação de erro. O modal permanece aberto com os dados preenchidos para nova tentativa.
    } finally {
      setIsSubmittingNewUser(false);
    }
  };

  const handleSendFirstAccessForUser = async (targetUser: User) => {
    vibrateClick();
    setSendingFirstAccessUserId(targetUser.id);
    try {
      const result = await sendUserFirstAccessLink(targetUser);
      setFirstAccessFeedback({
        email: result.email,
        emailSent: result.emailSent,
        deliveryMethod: result.deliveryMethod,
        deliveryError: result.deliveryError,
        manualSetupLink: result.manualSetupLink,
        authProvisioned: result.authProvisioned,
      });
    } catch (_) {
      // Erro já reportado em toast por sendUserFirstAccessLink
    } finally {
      setSendingFirstAccessUserId(null);
    }
  };

  const handleSendAdminNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifyTitle.trim() || !notifyMessage.trim()) {
      addToast(
        l("Preencha o título e o conteúdo da notificação.", "Fill in the notification title and message."),
        "error"
      );
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
        addToast(
          l(
            `Notificação enviada em massa para ${studentUsers.length} alunos!`,
            `Notification broadcast to ${studentUsers.length} students!`
          ),
          "success"
        );
      } else if (notifyModalUser) {
        await sendNotificationToUser(
          notifyModalUser.id,
          notifyTitle.trim(),
          notifyMessage.trim(),
          notifyRelatedItemId || undefined
        );
        vibrateSuccess();
        addToast(
          l(`Notificação enviada para ${notifyModalUser.name}!`, `Notification sent to ${notifyModalUser.name}!`),
          "success"
        );
      }
      setNotifyModalUser(null);
      setIsBroadcastNotification(false);
      setNotifyTitle("");
      setNotifyMessage("");
      setNotifyRelatedItemId("");
    } catch (err: any) {
      vibrateCritical();
      addToast(l("Erro ao enviar notificação para o aluno.", "Error sending notification to the student."), "error");
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
  const monthNames =
    language === "en"
      ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
      : ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
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

  const barPendingData = Object.keys(pendingByCat).map((cat) => {
    const label = translateCategory(cat, language);
    return {
      category: label.length > 15 ? label.substring(0, 15) + "..." : label,
      pendentes: pendingByCat[cat],
    };
  });

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
    const headers = l(
      "ID,Titulo,Categoria,Tipo,Situacao,Local,Data,CadastradoPor,Contato\n",
      "ID,Title,Category,Type,Status,Location,Date,RegisteredBy,Contact\n"
    );
    const rows = items
      .map(
        (i) =>
          `"${i.id}","${i.title}","${translateCategory(i.category, language)}","${translateItemStatus(i.type, language)}","${translateItemStatus(i.status, language)}","${translateCampusLocation(i.location, language)}","${i.date}","${i.registeredByName}","${i.contactInfo}"`
      )
      .join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `${l("relatorio_achados_perdidos_ifpr", "ifpr_lost_and_found_report")}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast(
      l("Relatório CSV gerado e baixado com sucesso!", "CSV report generated and downloaded successfully!"),
      "success"
    );
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
    doc.text(l("INSTITUTO FEDERAL DO PARANÁ - CAMPUS IVAIPORÃ", "FEDERAL INSTITUTE OF PARANÁ - IVAIPORÃ CAMPUS"), 14, 12);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(
      l(
        "Sistema Achados e Perdidos • Relatório Oficial de Objetos Pendentes",
        "Lost & Found System • Official Pending Items Report"
      ),
      14,
      19
    );

    // Document Metadata
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(l("LISTAGEM OFICIAL DE OBJETOS PENDENTES NO ACERVO", "OFFICIAL LIST OF PENDING CATALOG ITEMS"), 14, 38);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`${l("Data de Emissão:", "Issue Date:")} ${new Date().toLocaleString(locale)}`, 14, 44);
    doc.text(
      `${l("Emitido por:", "Issued by:")} ${currentUser.name} (${translateUserRole(currentUser.role, language)} • ${currentUser.email})`,
      14,
      49
    );
    doc.text(
      l(
        `Total de Itens Pendentes: ${pendingItems.length} | Perdidos: ${pendingItems.filter((i) => i.type === "PERDIDO").length} | Encontrados: ${pendingItems.filter((i) => i.type === "ENCONTRADO").length} | Em Análise: ${pendingItems.filter((i) => i.status === "EM_ANALISE").length}`,
        `Total Pending Items: ${pendingItems.length} | Lost: ${pendingItems.filter((i) => i.type === "PERDIDO").length} | Found: ${pendingItems.filter((i) => i.type === "ENCONTRADO").length} | Under Review: ${pendingItems.filter((i) => i.status === "EM_ANALISE").length}`
      ),
      14,
      54
    );

    const tableRows = pendingItems.map((item) => [
      item.id,
      item.title,
      translateCategory(item.category, language),
      translateItemStatus(item.type, language),
      translateCampusLocation(item.location, language),
      formatDate(item.date),
      translateItemStatus(item.status, language),
      item.registeredByName || l("Não informado", "Not informed"),
    ]);

    autoTable(doc, {
      startY: 59,
      head: [
        [
          "ID / QR",
          l("Título do Objeto", "Item Title"),
          l("Categoria", "Category"),
          l("Tipo", "Type"),
          l("Local Encontrado/Perdido", "Location Found/Lost"),
          l("Data Registro", "Reg. Date"),
          l("Situação", "Status"),
          l("Registrado Por", "Registered By"),
        ],
      ],
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
        l(
          `IFPR Campus Ivaiporã • Achados e Perdidos Oficial • Página ${i} de ${totalPages} • Documento gerado em ${new Date().toLocaleDateString(locale)}`,
          `IFPR Ivaiporã Campus • Official Lost & Found • Page ${i} of ${totalPages} • Generated on ${new Date().toLocaleDateString(locale)}`
        ),
        14,
        287
      );
    }

    doc.save(`${l("Relatorio_Objetos_Pendentes_IFPR", "IFPR_Pending_Items_Report")}_${new Date().toISOString().slice(0, 10)}.pdf`);
    vibrateSuccess();
    addToast(
      l("Relatório de Objetos Pendentes exportado em PDF com sucesso!", "Pending Items PDF report exported successfully!"),
      "success"
    );
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
    doc.text(l("INSTITUTO FEDERAL DO PARANÁ - CAMPUS IVAIPORÃ", "FEDERAL INSTITUTE OF PARANÁ - IVAIPORÃ CAMPUS"), 14, 12);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(
      l(
        "Sistema Achados e Perdidos • Relatório Oficial de Auditoria do Sistema",
        "Lost & Found System • Official System Audit Report"
      ),
      14,
      18
    );

    doc.setTextColor(30, 30, 30);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(l("RELATÓRIO DE AUDITORIA E REGISTROS DE ATIVIDADE", "AUDIT REPORT & ACTIVITY LOGS"), 14, 34);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`${l("Data de Emissão:", "Issue Date:")} ${new Date().toLocaleString(locale)}`, 14, 40);
    doc.text(`${l("Administrador Responsável:", "Responsible Admin:")} ${currentUser.name} (${currentUser.email})`, 14, 45);
    doc.text(
      l(
        `Filtro Ação: ${logFilterAction} | Data Início: ${logStartDate || "Livre"} | Data Fim: ${logEndDate || "Livre"} | Total Registros: ${filteredLogs.length}`,
        `Action Filter: ${logFilterAction} | Start Date: ${logStartDate || "Any"} | End Date: ${logEndDate || "Any"} | Total Records: ${filteredLogs.length}`
      ),
      14,
      50
    );

    const tableRows = filteredLogs.map((log) => [
      formatDate(log.timestamp),
      log.adminName,
      translateActivityAction(log.action, language),
      log.details,
    ]);

    autoTable(doc, {
      startY: 55,
      head: [[l("Data e Hora", "Date & Time"), l("Responsável", "Responsible"), l("Operação", "Operation"), l("Detalhes da Operação", "Operation Details")]],
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
      doc.text(
        l(
          `IFPR Achados e Perdidos • Documento para fins de auditoria e transparência pública • Página ${i} de ${totalPages}`,
          `IFPR Lost & Found • Public transparency and audit document • Page ${i} of ${totalPages}`
        ),
        14,
        287
      );
    }

    doc.save(`${l("Auditoria_IFPR", "IFPR_Audit")}_${new Date().toISOString().slice(0, 10)}.pdf`);
    addToast(l("Relatório de Auditoria exportado em PDF!", "Audit Report exported to PDF!"), "success");
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
      link.download = `${l("relatorio_monitoramento_ifpr", "ifpr_monitoring_report")}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      vibrateSuccess();
      addToast(
        l(
          "Relatório JSON com registros de desempenho e erros baixado com sucesso!",
          "JSON report with performance and error logs downloaded successfully!"
        ),
        "success"
      );
    } catch (err: any) {
      vibrateCritical();
      addToast(
        l("Erro ao baixar relatório de registros de monitoramento.", "Error downloading monitoring logs report."),
        "error"
      );
    } finally {
      setIsExportingMonitoringJSON(false);
    }
  };

  // Export Complete Items List in CSV for Campus Secretariat / Archive
  const handleExportItemsCSV = () => {
    vibrateClick();
    try {
      if (items.length === 0) {
        addToast(l("Nenhum item disponível para exportação em CSV.", "No items available for CSV export."), "info");
        return;
      }

      const headers = language === "en"
        ? [
            "System_ID",
            "QR_Code",
            "Title",
            "Category",
            "Type",
            "Status",
            "Campus_Location",
            "Color",
            "Brand",
            "Incident_Date",
            "Registration_Date",
            "Registered_By",
            "Registrant_Role",
            "Returned_To",
            "Recipient_Email",
            "Recipient_Affiliation",
            "Return_Date",
            "Returned_By",
            "Description",
            "Return_Observations",
          ]
        : [
            "ID_Sistema",
            "Codigo_QR",
            "Titulo",
            "Categoria",
            "Tipo",
            "Situacao",
            "Local_Campus",
            "Cor",
            "Marca",
            "Data_Ocorrencia",
            "Data_Cadastro",
            "Cadastrado_Por",
            "Funcao_Cadastrador",
            "Devolvido_Para",
            "Email_Destinatario",
            "Vinculo_Destinatario",
            "Data_Devolucao",
            "Responsavel_Devolucao",
            "Descricao",
            "Observacoes_Devolucao",
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
        escapeCSV(translateCategory(item.category, language)),
        escapeCSV(translateItemStatus(item.type, language)),
        escapeCSV(translateItemStatus(item.status, language)),
        escapeCSV(translateCampusLocation(item.location, language)),
        escapeCSV(item.color ? translateColor(item.color, language) : ""),
        escapeCSV(item.brand),
        escapeCSV(item.date),
        escapeCSV(item.createdAt),
        escapeCSV(item.registeredByName),
        escapeCSV(translateUserRole(item.registeredByRole, language)),
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
      link.download = `${l("relatorio_secretaria_itens_ifpr", "ifpr_secretariat_items_report")}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      vibrateSuccess();
      addToast(
        l("Listagem completa exportada em formato CSV com sucesso!", "Complete listing exported to CSV successfully!"),
        "success"
      );
    } catch (err: any) {
      vibrateCritical();
      addToast(l("Erro ao exportar arquivo CSV.", "Error exporting CSV file."), "error");
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
                ? language === "en"
                  ? `Help Desk & Reception • ${t("campusName")}`
                  : "Atendimento & Portaria • IFPR Campus Ivaiporã"
                : activeDashboardRole === "ADMIN"
                ? language === "en"
                  ? `Institutional Administration • ${t("campusName")}`
                  : "Administração Institucional • IFPR Campus Ivaiporã"
                : language === "en"
                ? `Student Tracking • ${t("campusName")}`
                : "Acompanhamento Discente • IFPR Campus Ivaiporã"}
            </p>
            <h1 className="text-lg sm:text-xl font-bold text-[#0F172A] dark:text-white tracking-tight">
              {activeDashboardRole === "SERVIDOR"
                ? t("staffPanel")
                : activeDashboardRole === "ADMIN"
                ? language === "en" ? "Administrative Panel" : "Painel Administrativo"
                : language === "en" ? "Student Panel" : "Painel do Discente"}
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
                  {translateUserRole("ALUNO", language)}
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
                  {language === "en" ? "Staff" : "Servidor"}
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
                  {t("adminPanel")}
                </button>
              </div>
            ) : (
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {currentUser.role === "SERVIDOR"
                  ? language === "en"
                    ? "Authorized Staff • Main Gate / SEPAE"
                    : "Servidor Autorizado • Portaria / SEPAE"
                  : `${t("profile")}: ${translateUserRole(currentUser.role, language)}`}
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
                  aria-label={l("Exportar relatório completo de itens em CSV", "Export complete items report in CSV")}
                  title={l("Baixar Relatório Completo de Achados e Perdidos (CSV)", "Download Complete Lost & Found Report (CSV)")}
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
                {l("Objetos no Acervo", "Catalog Items")}
              </span>
              <p className="text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-white tracking-tight tabular-nums">
                {totalItems}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {foundCount} {l("encontrados", "found")} · {lostCount} {l("perdidos", "lost")}
              </p>
            </div>

            <div className="space-y-0.5">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                {l("Em Custódia / Análise", "In Custody / Review")}
              </span>
              <p className="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400 tracking-tight tabular-nums">
                {inAnalysisCount}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {pendingClaimsCount} {l("solicitações pendentes", "pending claims")}
              </p>
            </div>

            <div className="space-y-0.5">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                {l("Devoluções Concluídas", "Completed Returns")}
              </span>
              <p className="text-xl sm:text-2xl font-bold text-sky-600 dark:text-sky-400 tracking-tight tabular-nums">
                {returnedCount}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {registeredReturnsCount} {l("reg.", "rec.")} · {pendingRemoteSignaturesCount} {l("pend. remota", "pend. remote")} · {dualSignedReturnsCount} {l("dupla", "dual")}
              </p>
            </div>

            <div className="space-y-0.5">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                {l("Taxa de Restituição", "Return Rate")}
              </span>
              <p className="text-xl sm:text-2xl font-bold text-[#16845B] dark:text-emerald-400 tracking-tight tabular-nums">
                {successRate}%
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {pendingStaffAttestationCount} {l("aguardando servidor", "awaiting staff")}
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
              <p className="text-[11px] text-slate-500">{l("Minhas ocorrências", "My records")}</p>
            </div>

            <div>
              <p className="text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-white tabular-nums">
                {claims.filter((c) => c.claimerId === currentUser.id).length}
              </p>
              <p className="text-[11px] text-slate-500">{l("Solicitações", "Claims")}</p>
            </div>

            <div>
              <p className="text-xl sm:text-2xl font-bold text-[#16845B] tabular-nums">
                {currentUser.reputationScore || 10} pts
              </p>
              <p className="text-[11px] text-slate-500">{l("Cidadania", "Citizenship")}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-[#0F172A] dark:text-white">
                {l("Seus Objetos e Ocorrências Vinculadas", "Your Linked Items & Records")}
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
                  + {l("Registrar Objeto", "Register Item")}
                </button>
              )}
            </div>

            {/* Mobile Stacked List for Student Items */}
            <div className="md:hidden divide-y divide-slate-200/80 dark:divide-slate-800 border-y border-slate-200/80 dark:border-slate-800">
              {items.filter((i) => i.registeredByUserId === currentUser.id).length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">
                  {l("Você ainda não cadastrou nenhum objeto.", "You have not registered any items yet.")}
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
                          {translateItemStatus(item.type, language)} · {translateItemStatus(item.status, language)} · {formatDate(item.date)}
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedItemForDetail(item)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 shrink-0 cursor-pointer"
                      >
                        {l("Detalhes", "Details")}
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
                    <th className="p-3.5">{l("Objeto", "Item")}</th>
                    <th className="p-3.5">{l("Categoria", "Category")}</th>
                    <th className="p-3.5">{l("Tipo", "Type")}</th>
                    <th className="p-3.5">{l("Situação", "Status")}</th>
                    <th className="p-3.5">{l("Data", "Date")}</th>
                    <th className="p-3.5 text-right">{l("Ação", "Action")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.filter((i) => i.registeredByUserId === currentUser.id).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400">
                        {l("Você ainda não cadastrou nenhum objeto.", "You have not registered any items yet.")}
                      </td>
                    </tr>
                  ) : (
                    items
                      .filter((i) => i.registeredByUserId === currentUser.id)
                      .map((item) => (
                        <tr key={item.id} className="hover:bg-[#F8FAFC] dark:hover:bg-slate-800/50">
                          <td className="p-3.5 font-bold text-[#172B2A] dark:text-white">{item.title}</td>
                          <td className="p-3.5">{translateCategory(item.category, language)}</td>
                          <td className="p-3.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap shrink-0 ${item.type === "PERDIDO" ? "bg-rose-500/10 text-rose-600" : "bg-[#EBF5F0] dark:bg-emerald-950/40 text-[#16845B] dark:text-emerald-400"}`}>
                              {translateItemStatus(item.type, language)}
                            </span>
                          </td>
                          <td className="p-3.5 font-bold">{translateItemStatus(item.status, language)}</td>
                          <td className="p-3.5 text-slate-500 tabular-nums">{formatDate(item.date)}</td>
                          <td className="p-3.5 text-right">
                            <button
                              onClick={() => setSelectedItemForDetail(item)}
                              className="px-3 py-1.5 rounded-lg bg-[#F8FAFC] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-[#16845B] hover:text-white hover:border-[#16845B] text-[11px] font-bold transition-colors cursor-pointer"
                            >
                              {l("Ver Detalhes", "View Details")}
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
                  {l("Acesso Restrito", "Restricted Access")}
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {l(
                    `Sua conta atual (${currentUser.email}) possui permissão de `,
                    `Your current account (${currentUser.email}) has the `
                  )}
                  <strong>{translateUserRole(currentUser.role, language)}</strong>
                  {l(
                    ". Apenas servidores e administradores autenticados podem acessar o módulo de custódia e assinaturas.",
                    " role. Only authenticated staff and administrators can access the custody and signatures module."
                  )}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-5 items-start">
              {/* NAVEGAÇÃO DISCRETA (FAIXA HORIZONTAL NO MOBILE + LISTA LATERAL NO DESKTOP) */}
              <aside
                aria-label={
                  activeDashboardRole === "SERVIDOR"
                    ? l("Navegação do Painel do Servidor", "Staff Panel Navigation")
                    : l("Navegação do Painel Administrativo", "Administrative Panel Navigation")
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
                          label: language === "en" ? "Custody & Desk" : "Custódia & Atendimento",
                          badge: inAnalysisCount,
                        },
                        {
                          id: "claims",
                          label: language === "en" ? "Claims" : "Solicitações",
                          badge: pendingClaimsCount,
                        },
                        {
                          id: "pending_signatures",
                          label: language === "en" ? "Signatures" : "Assinaturas",
                          badge: pendingSignaturesCount,
                        },
                        {
                          id: "custody_reminders",
                          label: language === "en" ? "Deadlines (+90d)" : "Prazos (+90d)",
                          badge: itemsOver90DaysCount,
                        },
                        {
                          id: "digital_returns",
                          label: language === "en" ? "Returns (D3)" : "Devoluções (D3)",
                          badge: digitalReturnedItemsCount,
                        },
                        {
                          id: "server_analytics",
                          label: language === "en" ? "Reports" : "Relatórios",
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
                        { id: "users", label: l("Usuários & Objetos", "Users & Items"), badge: allUsers.length },
                        { id: "accounts", label: l("Contas", "Accounts"), badge: 0 },
                        {
                          id: "approvals",
                          label: l("Aprovações", "Approvals"),
                          badge: (allUsers || []).filter((u) => u && u.approvalStatus === "PENDENTE").length,
                        },
                        { id: "claims", label: l("Solicitações", "Claims"), badge: pendingClaimsCount },
                        { id: "pending_signatures", label: l("Assinaturas", "Signatures"), badge: pendingSignaturesCount },
                        { id: "custody_reminders", label: l("Prazos +90d", "Deadlines +90d"), badge: itemsOver90DaysCount },
                        { id: "digital_returns", label: l("Devoluções D3", "Digital Returns"), badge: digitalReturnedItemsCount },
                        { id: "server_overview", label: l("Guarita", "Front Desk"), badge: inAnalysisCount },
                        { id: "audit", label: l("Auditoria", "Audit"), badge: 0 },
                        { id: "health", label: l("Saúde", "Health"), badge: 0 },
                        { id: "backups", label: l("Cópias", "Backups"), badge: 0 },
                        { id: "server_analytics", label: l("Relatórios", "Reports"), badge: 0 },
                        { id: "documents", label: l("PDFs", "PDFs"), badge: 0 },
                        { id: "project_settings", label: l("Configurações", "Settings"), badge: 0 },
                        { id: "test_batteries", label: l("Testes", "QA"), badge: 0 },
                        { id: "test_distribution", label: l("Distribuição", "QA Allocation"), badge: 0 },
                        { id: "versions", label: l("Versões", "Versions"), badge: 0 },
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
                          groupTitle: l("Acesso", "Access"),
                          items: [
                            { id: "users", label: l("Usuários & Objetos", "Users & Items"), badge: allUsers.length },
                            { id: "accounts", label: l("Situação das Contas", "Account Status"), badge: 0 },
                            {
                              id: "approvals",
                              label: l("Aprovações (@ifpr)", "Approvals (@ifpr)"),
                              badge: (allUsers || []).filter((u) => u && u.approvalStatus === "PENDENTE").length,
                            },
                          ],
                        },
                        {
                          groupTitle: l("Custódia", "Custody"),
                          items: [
                            { id: "claims", label: l("Solicitações", "Claims"), badge: pendingClaimsCount },
                            { id: "pending_signatures", label: l("Assinaturas Pendentes", "Pending Signatures"), badge: pendingSignaturesCount },
                            { id: "custody_reminders", label: l("Prazos (+90 Dias)", "Deadlines (+90 Days)"), badge: itemsOver90DaysCount },
                            { id: "digital_returns", label: l("Devoluções Digitais", "Digital Returns"), badge: digitalReturnedItemsCount },
                            { id: "server_overview", label: l("Recepção & Guarita", "Reception & Front Desk"), badge: inAnalysisCount },
                          ],
                        },
                        {
                          groupTitle: l("Sistema", "System"),
                          items: [
                            { id: "audit", label: l("Registros de Auditoria", "Audit Logs"), badge: 0 },
                            { id: "health", label: l("Saúde do Sistema", "System Health"), badge: 0 },
                            { id: "backups", label: l("Cópias & Segurança", "Backups & Security"), badge: 0 },
                            { id: "server_analytics", label: l("Relatórios", "Reports"), badge: 0 },
                            { id: "documents", label: l("Documentos PDF", "PDF Documents"), badge: 0 },
                            { id: "project_settings", label: l("Configurações", "Settings"), badge: 0 },
                            { id: "test_batteries", label: l("Bateria de Testes", "QA Test Suite"), badge: 0 },
                            {
                              id: "test_distribution",
                              domId: "btn-tab-test-distribution",
                              label: l("Distribuição de Testes", "Test Distribution"),
                              badge: 0,
                            },
                            { id: "versions", label: l("Histórico de Versões", "Version History"), badge: 0 },
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
                          onClick={() => {
                            setNewUserRole("ALUNO");
                            setIsAddingUserOpen(true);
                          }}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#16845B] hover:bg-[#126B49] text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>+ {l("Cadastrar Usuário", "Register User")}</span>
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
                            setNotifyTitle(l("Aviso Institucional - Achados e Perdidos", "Institutional Notice - Lost & Found"));
                            setNotifyMessage(
                              l(
                                "Olá! Informamos que há uma atualização referente aos seus registros no sistema do IFPR.",
                                "Hello! There is an update regarding your records in the IFPR Lost & Found system."
                              )
                            );
                            setNotifyRelatedItemId("");
                          }}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>{l("Notificar Alunos", "Notify Students")}</span>
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
                            {maintenanceMode
                              ? l("Manutenção Ativa", "Maintenance Active")
                              : l("Modo Manutenção", "Maintenance Mode")}
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
                            {l("Pendências do Atendimento", "Pending Desk Actions")}
                          </h2>
                          <span className="text-[11px] font-medium text-[#16845B] dark:text-emerald-400">
                            {l("Tempo Real", "Real-Time")}
                          </span>
                        </div>

                        <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                          <div className="py-2.5 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-[#0F172A] dark:text-white">
                                {l("Solicitações de Recuperação", "Recovery Claims")} ({pendingClaimsCount})
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {l("Aguardando análise documental de titularidade", "Awaiting ownership document review")}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setAdminSubTab("claims")}
                              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
                            >
                              {l("Analisar", "Review")}
                            </button>
                          </div>

                          <div className="py-2.5 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-[#0F172A] dark:text-white">
                                {l("Confirmações de Entrega", "Delivery Confirmations")} ({pendingSignaturesCount})
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {l("Termos que aguardam atestação do servidor", "Receipts awaiting staff attestation")}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setAdminSubTab("pending_signatures")}
                              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
                            >
                              {l("Atestar", "Attest")}
                            </button>
                          </div>

                          <div className="py-2.5 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-[#0F172A] dark:text-white">
                                {l("Prazos de Guarda +90d", "90-Day Storage Deadlines")} ({deadlineAlertItems.length})
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {expiredItems.length} {l("vencidos", "expired")} · {nearExpirationItems.length} {l("próximos", "nearing expiration")}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setAdminSubTab("custody_reminders")}
                              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
                            >
                              {l("Ver Prazos", "View Deadlines")}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Ferramentas Rápidas de Atendimento */}
                      <div className="xl:col-span-5 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 bg-white dark:bg-slate-900 space-y-3">
                        <div className="border-b border-slate-100 dark:border-slate-800 pb-2.5">
                          <h2 className="text-sm font-bold text-[#0F172A] dark:text-white">
                            {l("Ações Rápidas de Balcão", "Quick Front-Desk Actions")}
                          </h2>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setQrScannerOpen(true)}
                            className="min-h-[42px] px-3 py-2 rounded-lg bg-[#16845B] hover:bg-[#126B49] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <QrCode className="w-4 h-4 shrink-0" />
                            <span>{l("Ler Código QR", "Scan QR Code")}</span>
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
                            <span>+ {l("Registrar Objeto", "Register Item")}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              vibrateClick();
                              setIsExportFoundModalOpen(true);
                            }}
                            aria-label={l("Abrir janela para emitir Relatório de Prestação de Contas de Itens Encontrados em PDF", "Open modal to issue Found Items Accountability Report PDF")}
                            className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span>{l("Relatório SEBAC (PDF)", "SEBAC Report (PDF)")}</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleExportPendingItemsPDF}
                            aria-label={l("Exportar Relatório em PDF contendo a listagem de objetos pendentes", "Export PDF report containing pending items list")}
                            className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span>{l("Pendentes (PDF)", "Pending (PDF)")}</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleExportItemsCSV}
                            aria-label={l("Exportar todos os dados em formato CSV para a Secretaria", "Export all data in CSV format for the Secretariat")}
                            className="col-span-2 min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span>{l("Exportar Base Completa (CSV)", "Export Complete Database (CSV)")}</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 2. Objetos sob Responsabilidade — Recepção e Custódia na Guarita / Secretaria */}
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-800 pb-3">
                        <div>
                          <h3 className="text-sm sm:text-base font-bold text-[#0F172A] dark:text-white">
                            {l("Objetos sob Custódia", "Items in Custody")} ({serverCustodyFilteredItems.length}
                            {serverCustodyFilteredItems.length !== items.length ? ` ${l("de", "of")} ${items.length}` : ""})
                          </h3>
                          <p className="text-xs text-slate-500">
                            {l(
                              "Confirmação presencial de chegada, guarda física e formalização de devoluções.",
                              "In-person arrival confirmation, physical safekeeping, and return formalization."
                            )}
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
                                ? l("Todos", "All")
                                : st === "EM_ANALISE"
                                ? l("Em Custódia", "In Custody")
                                : translateItemStatus(st, language)}
                            </button>
                          ))}
                        </div>

                        <div className="relative w-full sm:w-64">
                          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={tableSearch}
                            onChange={(e) => setTableSearch(e.target.value)}
                            placeholder={l("Buscar objeto, ID, QR ou local...", "Search item, ID, QR, or location...")}
                            className="w-full h-9 pl-9 pr-3 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[#0F172A] dark:text-white outline-none focus:border-[#16845B]"
                          />
                        </div>
                      </div>

                      {/* Lista Mobile Empilhada (Evita tabelas largas no celular) */}
                      <div className="md:hidden divide-y divide-slate-200/80 dark:divide-slate-800 border-y border-slate-200/80 dark:border-slate-800">
                        {serverCustodyFilteredItems.length === 0 ? (
                          <p className="py-8 text-center text-xs text-slate-500">
                            {l("Nenhum objeto encontrado para os filtros aplicados.", "No items found for the applied filters.")}
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
                                      {translateItemStatus(it.status, language)} · {translateCampusLocation(it.location || "Campus IFPR", language)} · {formatDate(it.createdAt || it.date)}
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
                                      {confirmingArrivalId === it.id ? l("Confirmando...", "Confirming...") : l("Confirmar Chegada", "Confirm Arrival")}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setSelectedItemForDetail(it)}
                                    className="flex-1 min-h-[38px] px-3 py-1.5 rounded-lg bg-[#16845B] text-white text-xs font-semibold cursor-pointer"
                                  >
                                    {l("Ver / Devolver", "View / Return")}
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
                              <th className="py-3 px-4">{l("Objeto", "Item")}</th>
                              <th className="py-3 px-4">{l("Tipo", "Type")}</th>
                              <th className="py-3 px-4">{l("Localização", "Location")}</th>
                              <th className="py-3 px-4 text-center">{l("Situação", "Status")}</th>
                              <th className="py-3 px-4">{l("Data", "Date")}</th>
                              <th className="py-3 px-4 text-right">{l("Ações Operacionais", "Operational Actions")}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {serverCustodyFilteredItems.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="py-8 text-center text-slate-400">
                                  {l("Nenhum objeto encontrado para os filtros aplicados.", "No items found for the applied filters.")}
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
                                            #{it.id} • {translateCategory(it.category, language)} {it.color ? `• ${translateColor(it.color, language)}` : ""}
                                          </span>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="py-3 px-4">
                                      <UIBadge tone={it.type === "ENCONTRADO" ? "emerald" : "rose"}>
                                        {translateItemStatus(it.type, language)}
                                      </UIBadge>
                                    </td>
                                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300 font-medium">
                                      {translateCampusLocation(it.location || "Campus IFPR", language)}
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
                                        {translateItemStatus(it.status, language)}
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
                                            title={l("Confirmar que o objeto foi recebido fisicamente na guarita / secretaria", "Confirm that the item was physically received at the front desk / secretariat")}
                                          >
                                            {confirmingArrivalId === it.id ? l("Confirmando...", "Confirming...") : l("Confirmar Chegada", "Confirm Arrival")}
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => setSelectedItemForDetail(it)}
                                          className="px-3 py-1.5 rounded-lg bg-[#16845B] hover:bg-[#064E3B] text-white text-xs font-semibold transition-all cursor-pointer whitespace-nowrap"
                                        >
                                          {l("Ver / Devolver", "View / Return")}
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
                            {l(
                              `Exibindo ${Math.min(serverOverviewLimit, serverCustodyFilteredItems.length)} de ${serverCustodyFilteredItems.length} objetos`,
                              `Showing ${Math.min(serverOverviewLimit, serverCustodyFilteredItems.length)} of ${serverCustodyFilteredItems.length} items`
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              vibrateClick();
                              setServerOverviewLimit((prev) => prev + 20);
                            }}
                            className="min-h-[36px] px-4 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                          >
                            {l("Mostrar mais objetos", "Show more items")} ({l("restam", "remaining")} {serverCustodyFilteredItems.length - serverOverviewLimit})
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
                              <span>{l("Controle de Prazo de Armazenamento", "Storage Deadline Control")}</span>
                              <UIBadge tone="amber">{l("Portaria IFPR 90 Dias", "IFPR 90-Day Policy")}</UIBadge>
                            </h3>
                            <p className="text-xs text-slate-500">
                              {l(
                                "Monitoramento preventivo de objetos guardados no acervo próximos ou acima do prazo regulamentar.",
                                "Preventive monitoring of stored items approaching or exceeding the regulatory deadline."
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <UIBadge tone="rose">{expiredItems.length} {l("Expirados", "Expired")}</UIBadge>
                          <UIBadge tone="amber">
                            {nearExpirationItems.length} {l("Próximos do Vencimento", "Nearing Expiration")}
                          </UIBadge>
                        </div>
                      </div>

                      {deadlineAlertItems.length === 0 ? (
                        <div className="p-4 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/30 border border-[#16845B]/20 text-[#064E3B] dark:text-emerald-300 text-xs flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#16845B] shrink-0" />
                          <span>
                            {l(
                              "Todos os objetos guardados no acervo do IFPR estão dentro do prazo de guarda de 90 dias. Nenhuma destinação necessária no momento.",
                              "All items stored in IFPR custody are within the 90-day safekeeping period. No disposal action required at this time."
                            )}
                          </span>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-[#F8FAFC] dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase text-[10px] font-bold">
                              <tr>
                                <th className="py-3 px-4">{l("Objeto", "Item")}</th>
                                <th className="py-3 px-4">{l("Categoria", "Category")}</th>
                                <th className="py-3 px-4">{l("Data Cadastro", "Registered On")}</th>
                                <th className="py-3 px-4">{l("Data Limite", "Deadline")}</th>
                                <th className="py-3 px-4 text-center">{l("Situação do Prazo", "Deadline Status")}</th>
                                <th className="py-3 px-4 text-right">{l("Ação", "Action")}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {deadlineAlertItems.slice(0, 6).map((item) => (
                                <tr key={item.id} className="hover:bg-[#F8FAFC] dark:hover:bg-slate-800/40">
                                  <td className="py-3 px-4 font-bold text-[#172B2A] dark:text-white">
                                    {item.title}
                                  </td>
                                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                                    {translateCategory(item.category, language)}
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
                                        {l(`Prazo Vencido (${Math.abs(item.daysRemaining)}d atrás)`, `Expired (${Math.abs(item.daysRemaining)}d ago)`)}
                                      </UIBadge>
                                    ) : (
                                      <UIBadge tone="amber">
                                        {l(`Vence em ${item.daysRemaining} dias`, `Expires in ${item.daysRemaining} days`)}
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
                                      <span>{l("Destinar / Gerenciar", "Manage / Dispose")}</span>
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
                              {l("Relatórios Analíticos & Histórico Temporal", "Analytical Reports & Timeline")}
                            </h2>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {l(
                              "Análise temporal, estatísticas por categoria e exportações oficiais do IFPR Campus Ivaiporã.",
                              "Timeline analysis, category statistics, and official exports for IFPR Campus Ivaiporã."
                            )}
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
                            <span>{l("Prestação de Contas SEBAC (PDF)", "SEBAC Accountability Report (PDF)")}</span>
                          </UIButton>

                          <UIButton
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={handleExportPendingItemsPDF}
                          >
                            <FileText className="w-3.5 h-3.5 text-[#16845B]" />
                            <span>{l("Exportar Pendentes (PDF)", "Export Pending (PDF)")}</span>
                          </UIButton>

                          <UIButton
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleExportItemsCSV}
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5 text-[#16845B]" />
                            <span>{l("Base Completa (CSV)", "Full Database (CSV)")}</span>
                          </UIButton>
                        </div>
                      </div>

                      {/* Tendência Mensal Recharts */}
                      <div className="bg-[#F8FAFC] dark:bg-slate-900/50 p-5 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <h3 className="text-xs font-bold uppercase text-slate-700 dark:text-slate-300 tracking-wider">
                              {l(
                                "Tendência Mensal: Itens Perdidos vs. Recuperados (Campus Ivaiporã)",
                                "Monthly Trend: Lost vs. Recovered Items (Campus Ivaiporã)"
                              )}
                            </h3>
                            <p className="text-[11px] text-slate-500">
                              {l(
                                "Evolução temporal entre perdas registradas, itens encontrados e devoluções concluídas",
                                "Timeline progression of registered losses, found items, and completed returns"
                              )}
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
                                name={l("Itens Perdidos", "Lost Items")}
                                stroke="#DC2626"
                                strokeWidth={3}
                                dot={{ r: 4, stroke: "#DC2626", fill: "#fff", strokeWidth: 2 }}
                                activeDot={{ r: 7 }}
                              />
                              <Line
                                type="monotone"
                                dataKey="devolvidos"
                                name={l("Itens Recuperados / Devolvidos", "Recovered / Returned Items")}
                                stroke="#16845B"
                                strokeWidth={3}
                                dot={{ r: 4, stroke: "#16845B", fill: "#fff", strokeWidth: 2 }}
                                activeDot={{ r: 7 }}
                              />
                              <Line
                                type="monotone"
                                dataKey="encontrados"
                                name={l("Itens Encontrados", "Found Items")}
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
                              {l("Categorias de Objetos", "Item Categories")}
                            </h3>
                            <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                              {pieCategoryData.length} {l("categorias", "categories")}
                            </span>
                          </div>
                          {pieCategoryData.length === 0 ? (
                            <div className="h-44 flex flex-col items-center justify-center text-center px-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
                              <PackageSearch className="w-7 h-7 text-slate-400 mb-2" />
                              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                                {l(
                                  "Nenhum objeto cadastrado para exibir distribuição por categoria.",
                                  "No registered items to display category distribution."
                                )}
                              </p>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                {l(
                                  "Os gráficos refletem exclusivamente os registros reais armazenados no banco.",
                                  "Charts strictly reflect real records stored in the database."
                                )}
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
                                          {translateCategory(cat.name, language)}
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
                                      data={pieCategoryData.map((c) => ({ ...c, name: translateCategory(c.name, language) }))}
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
                              {l("Revisões Pendentes por Categoria", "Pending Reviews by Category")}
                            </h3>
                            <UIBadge tone="amber">
                              {inAnalysisCount + pendingClaimsCount} {l("Pendentes", "Pending")}
                            </UIBadge>
                          </div>
                          {barPendingData.length === 0 ? (
                            <div className="h-44 flex flex-col items-center justify-center text-center px-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
                              <CheckCircle2 className="w-7 h-7 text-[#16845B] mb-2" />
                              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                                {l(
                                  "Nenhuma revisão pendente por categoria no momento.",
                                  "No pending reviews by category at the moment."
                                )}
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
                                    name={l("Aguardando Revisão", "Awaiting Review")}
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
                        <span>{l("Mensagem do Banner de Manutenção Global (Tempo Real)", "Global Maintenance Banner Message (Real-Time)")}</span>
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {l("Sincronização instantânea no Firestore para todos os usuários", "Instant Firestore synchronization for all users")}
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-2">
                      <input
                        type="text"
                        value={customMsgInput}
                        onChange={(e) => setCustomMsgInput(e.target.value)}
                        placeholder={l("Escreva a mensagem personalizada que aparecerá no banner de manutenção global...", "Write the custom message to display in the global maintenance banner...")}
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
                        <span>{l("Salvar Mensagem", "Save Message")}</span>
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
                        <p className="text-xs font-semibold text-slate-500">{l("Total de Usuários Cadastrados", "Total Registered Users")}</p>
                        <p className="text-2xl font-bold text-[#172B2A] dark:text-white tabular-nums">{allUsers.length}</p>
                      </div>
                    </SurfaceCard>

                    <SurfaceCard padding="md" className="flex items-center gap-3.5">
                      <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200/70 dark:border-amber-800/50">
                        <GraduationCap className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500">{l("Aprovações Institucionais Pendentes", "Pending Institutional Approvals")}</p>
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
                        <p className="text-xs font-semibold text-slate-500">{l("Situação do Servidor e Firestore", "Server & Firestore Status")}</p>
                        <p className="text-lg font-bold text-[#16845B] dark:text-emerald-400">{l("100% Operacional", "100% Operational")}</p>
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
                            {l("Gerenciamento de Usuários e Permissões", "User & Permission Management")}
                          </h2>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {l("Alteração de perfis (Aluno, Servidor, Administrador) e remoção de usuários no IFPR.", "Change user roles (Student, Staff, Administrator) and remove users at IFPR.")}
                        </p>
                      </div>
                      <span className="self-start sm:self-auto px-3 py-1 rounded-full bg-[#EBF5F0] dark:bg-emerald-950/40 text-[#064E3B] dark:text-emerald-400 text-xs font-bold border border-[#16845B]/20 tabular-nums whitespace-nowrap shrink-0">
                        {allUsers.length} {l("Usuários Cadastrados", "Registered Users")}
                      </span>
                    </div>

                    {firstAccessFeedback && (
                      <div
                        className={`p-4 rounded-xl border text-xs space-y-2 ${
                          firstAccessFeedback.emailSent
                            ? "bg-[#EBF5F0] dark:bg-emerald-950/30 border-[#16845B]/30 text-[#064E3B] dark:text-emerald-200"
                            : "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="font-bold">
                              {firstAccessFeedback.emailSent
                                ? l(
                                    `Link de primeiro acesso enviado para ${firstAccessFeedback.email} (${
                                      firstAccessFeedback.deliveryMethod === "RESEND"
                                        ? "Resend"
                                        : firstAccessFeedback.deliveryMethod === "SMTP"
                                        ? "SMTP Institucional"
                                        : "Firebase Auth"
                                    })`,
                                    `First-access link sent to ${firstAccessFeedback.email} (${
                                      firstAccessFeedback.deliveryMethod === "RESEND"
                                        ? "Resend"
                                        : firstAccessFeedback.deliveryMethod === "SMTP"
                                        ? "Institutional SMTP"
                                        : "Firebase Auth"
                                    })`
                                  )
                                : l(
                                    `Atenção no envio de e-mail para ${firstAccessFeedback.email}`,
                                    `Email delivery notice for ${firstAccessFeedback.email}`
                                  )}
                            </p>
                            {!firstAccessFeedback.emailSent && (
                              <p className="opacity-90">
                                {firstAccessFeedback.deliveryError ||
                                  l(
                                    "O envio automático não pôde ser concluído. Copie o link único abaixo e entregue com segurança ao usuário.",
                                    "Automatic delivery could not be completed. Copy the one-time link below and deliver it securely to the user."
                                  )}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setFirstAccessFeedback(null)}
                            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                            aria-label={l("Fechar aviso", "Close notice")}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {firstAccessFeedback.manualSetupLink && (
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                            <input
                              type="text"
                              readOnly
                              value={firstAccessFeedback.manualSetupLink}
                              className="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-[11px] select-all"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (navigator?.clipboard?.writeText && firstAccessFeedback.manualSetupLink) {
                                  navigator.clipboard.writeText(firstAccessFeedback.manualSetupLink).catch(() => {});
                                }
                                setCopiedSetupLink(true);
                                setTimeout(() => setCopiedSetupLink(false), 2500);
                                addToast(l("Link de primeiro acesso copiado!", "First-access link copied!"), "success");
                              }}
                              className="px-3 py-1.5 rounded-lg bg-[#16845B] text-white font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                            >
                              {copiedSetupLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiedSetupLink ? l("Copiado", "Copied") : l("Copiar Link de Primeiro Acesso", "Copy First-Access Link")}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => setUserRoleFilter("ALL")}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer tabular-nums ${
                            userRoleFilter === "ALL" ? "bg-[#16845B] text-white shadow-xs" : "bg-[#F8FAFC] dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          {l("Todos", "All")} ({allUsers.length})
                        </button>
                        <button
                          onClick={() => setUserRoleFilter("ALUNO")}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer tabular-nums ${
                            userRoleFilter === "ALUNO" ? "bg-[#16845B] text-white shadow-xs" : "bg-[#F8FAFC] dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          {l("Alunos", "Students")} ({(allUsers || []).filter((u) => u && u.role === "ALUNO").length})
                        </button>
                        <button
                          onClick={() => setUserRoleFilter("SERVIDOR")}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer tabular-nums ${
                            userRoleFilter === "SERVIDOR" ? "bg-blue-600 text-white shadow-xs" : "bg-[#F8FAFC] dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          {l("Servidores", "Staff")} ({(allUsers || []).filter((u) => u && u.role === "SERVIDOR").length})
                        </button>
                        <button
                          onClick={() => setUserRoleFilter("ADMIN")}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer tabular-nums ${
                            userRoleFilter === "ADMIN" ? "bg-purple-600 text-white shadow-xs" : "bg-[#F8FAFC] dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          {l("Administradores", "Admins")} ({(allUsers || []).filter((u) => u && u.role === "ADMIN").length})
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
                          <span>{l("Ativos", "Active")} ({(allUsers || []).filter((u) => resolveAccountStatus(u).status === "active").length})</span>
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
                          <span>{l("Suspensos", "Suspended")} ({(allUsers || []).filter((u) => resolveAccountStatus(u).status === "suspended").length})</span>
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
                          <span>{l("Banidos", "Banned")} ({(allUsers || []).filter((u) => resolveAccountStatus(u).status === "banned").length})</span>
                        </button>
                      </div>

                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                        <input
                          type="text"
                          value={userSearchText}
                          onChange={(e) => setUserSearchText(e?.target?.value ?? "")}
                          placeholder={l("Buscar por nome, e-mail, matrícula...", "Search by name, email, ID...")}
                          className="pl-8 pr-3 py-1.5 rounded-xl bg-[#F8FAFC] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs outline-none w-full md:w-64"
                        />
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#F8FAFC] dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 uppercase font-bold tracking-wider text-[10px]">
                          <tr>
                            <th className="p-3.5 rounded-l-xl">{l("Usuário", "User")}</th>
                            <th className="p-3.5">{l("E-mail", "Email")}</th>
                            <th className="p-3.5">{l("Curso / Setor", "Course / Dept")}</th>
                            <th className="p-3.5">{l("Matrícula", "ID")}</th>
                            <th className="p-3.5">{l("Permissão (Função)", "Permission (Role)")}</th>
                            <th className="p-3.5">{l("Situação da Conta", "Account Status")}</th>
                            <th className="p-3.5 rounded-r-xl text-right">{l("Ação", "Action")}</th>
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
                              const statusDetails = formatAccountStatusDetails(u, language);
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
                                          <span className="text-[9px] text-[#16845B] dark:text-emerald-400 font-bold">({l("Sua Conta", "Your Account")})</span>
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
                                      disabled={u.role === "ADMIN" && !isRootAdminUser}
                                      onChange={async (e) => {
                                        const newRole = e.target.value as UserRole;
                                        if ((newRole === "ADMIN" || u.role === "ADMIN") && !isRootAdminUser) {
                                          return;
                                        }
                                        await updateUserRole(u.id, newRole);
                                        await logAdminAction(
                                          "ALTERACAO_PERMISSAO",
                                          `Alterou o perfil de '${u.name}' para a permissão ${newRole}.`
                                        );
                                      }}
                                      className={`py-1.5 px-3 rounded-xl text-xs font-bold border outline-none ${
                                        u.role === "ADMIN" && !isRootAdminUser
                                          ? "cursor-not-allowed opacity-75"
                                          : "cursor-pointer"
                                      } ${
                                        u.role === "ADMIN"
                                          ? "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30"
                                          : u.role === "SERVIDOR"
                                          ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30"
                                          : u.role === "INTRUSO"
                                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
                                          : "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30"
                                      }`}
                                    >
                                      <option value="ALUNO">{l("ALUNO (Discente)", "STUDENT")}</option>
                                      <option value="SERVIDOR">{l("SERVIDOR (Docente/TAE)", "STAFF (Faculty/Admin)")}</option>
                                      {(isRootAdminUser || u.role === "ADMIN") && (
                                        <option value="ADMIN">{l("ADMINISTRADOR (TI)", "ADMIN (IT)")}</option>
                                      )}
                                      <option value="INTRUSO">{l("USUÁRIO EXTERNO", "EXTERNAL USER")}</option>
                                    </select>
                                  </td>
                                  <td className="p-3.5">
                                    {(() => {
                                      const resolvedRowStatus = resolveAccountStatus(u);
                                      const activeDeadlineRaw = resolvedRowStatus.suspendedUntilEval.isActive
                                        ? u.suspendedUntil
                                        : resolvedRowStatus.blockExpiresAtEval.isActive
                                        ? u.blockExpiresAt
                                        : undefined;
                                      const activeDeadlineDate = activeDeadlineRaw ? safeParseDate(activeDeadlineRaw) : null;
                                      return (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            vibrateClick();
                                            setUserForStatusModal(u);
                                          }}
                                          title={
                                            statusDetails.inconsistencyAlert ||
                                            l("Clique para gerenciar a situação desta conta (Suspender/Banir/Reativar)", "Click to manage this account's status (Suspend/Ban/Reactivate)")
                                          }
                                          className={`inline-flex flex-col items-start gap-0.5 px-2.5 py-1 rounded-xl border text-[11px] font-extrabold cursor-pointer transition-all hover:scale-105 ${statusDetails.badgeClass}`}
                                        >
                                          <span className="flex items-center space-x-1.5">
                                            <span className={`w-1.5 h-1.5 rounded-full ${statusDetails.dotClass}`} />
                                            <span>{statusDetails.label}</span>
                                          </span>
                                          {resolvedRowStatus.status === "suspended" && activeDeadlineDate && (
                                            <span className="text-[9px] font-normal opacity-80">
                                              {l("Até", "Until")} {activeDeadlineDate.toLocaleDateString(getLocaleForLanguage(language))}
                                            </span>
                                          )}
                                          {resolvedRowStatus.hasLegacyInconsistency && (
                                            <span className="text-[9px] font-semibold text-amber-700 dark:text-amber-300 opacity-90">
                                              {resolvedRowStatus.isDeactivated ? l("Conta desativada", "Deactivated") : l("Revisar registro", "Review record")}
                                            </span>
                                          )}
                                        </button>
                                      );
                                    })()}
                                  </td>
                                  <td className="p-3.5 text-right whitespace-nowrap">
                                    <button
                                      type="button"
                                      disabled={sendingFirstAccessUserId === u.id}
                                      title={l(`Enviar / reenviar link de primeiro acesso para ${u.email}`, `Send / resend first-access link to ${u.email}`)}
                                      onClick={() => handleSendFirstAccessForUser(u)}
                                      className="p-2 rounded-xl bg-emerald-500/10 text-[#16845B] hover:bg-[#16845B] hover:text-white border border-emerald-500/20 transition-all mr-1.5 inline-flex items-center justify-center cursor-pointer disabled:opacity-50"
                                    >
                                      {sendingFirstAccessUserId === u.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <KeyRound className="w-4 h-4" />
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      title={l(`Gerenciar situação da conta de ${u.name}`, `Manage account status for ${u.name}`)}
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
                                      title={l(`Enviar notificação direta para ${u.name}`, `Send direct notification to ${u.name}`)}
                                      onClick={() => {
                                        vibrateClick();
                                        setNotifyModalUser(u);
                                        setIsBroadcastNotification(false);
                                        setNotifyTitle(l("Aviso Institucional - Achados e Perdidos", "Institutional Notice - Lost & Found"));
                                        setNotifyMessage(l(`Olá, ${u.name}. Informamos que há uma atualização sobre o Achados & Perdidos para você.`, `Hello, ${u.name}. There is an update on Lost & Found for you.`));
                                        setNotifyRelatedItemId("");
                                      }}
                                      className="p-2 rounded-xl bg-purple-500/10 text-purple-600 hover:bg-purple-600 hover:text-white border border-purple-500/20 transition-all mr-1.5 inline-flex items-center justify-center cursor-pointer"
                                    >
                                      <Bell className="w-4 h-4" />
                                    </button>
                                    <button
                                      disabled={u.id === currentUser.id}
                                      onClick={() => setUserToDelete({ id: u.id, name: u.name })}
                                      title={l(`Remover usuário ${u.name}`, `Remove user ${u.name}`)}
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
                          {l("Controle de Objetos e Alteração Manual de Situação", "Item Control & Manual Status Change")}
                        </h2>
                        <p className="text-xs text-slate-500">
                          {l(
                            "Alteração direta da situação das ocorrências registradas no campus (prioridade para itens ativos).",
                            "Direct status update for records registered on campus (active items prioritized)."
                          )}
                        </p>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 w-full md:w-auto">
                        <input
                          type="text"
                          value={tableSearch}
                          onChange={(e) => setTableSearch(e.target.value)}
                          placeholder={l("Buscar por objeto, ID ou QR...", "Search by item, ID, or QR...")}
                          className="px-3.5 py-2 sm:py-1.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-xs outline-none w-full sm:w-52 focus:border-[#16845B]"
                        />
                        <select
                          value={tableCategory}
                          onChange={(e) => setTableCategory(e.target.value)}
                          className="px-3 py-2 sm:py-1.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-xs font-semibold outline-none focus:border-[#16845B] w-full sm:w-auto"
                        >
                          <option value="TODAS">{l("Todas as Categorias", "All Categories")}</option>
                          {CANONICAL_ITEM_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {translateCategory(cat, language)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {filteredTableItems.length === 0 ? (
                      <div className="py-10 px-4 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 space-y-2.5">
                        <PackageSearch className="w-8 h-8 text-slate-400 mx-auto" />
                        <p className="text-sm font-bold text-[#172B2A] dark:text-white">
                          {l("Nenhum objeto encontrado neste filtro", "No items found for this filter")}
                        </p>
                        <p className="text-xs text-slate-500 max-w-md mx-auto">
                          {l(
                            "Não há ocorrências correspondentes aos critérios atuais de busca ou categoria.",
                            "There are no records matching your current search or category criteria."
                          )}
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
                            {l("Limpar filtros", "Clear filters")}
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
                                  {translateCategory(item.category, language)}
                                </span>
                                <span className="text-slate-300 dark:text-slate-700">•</span>
                                <span className="truncate max-w-[200px]">{translateCampusLocation(item.location, language)}</span>
                              </div>

                              <div className="space-y-2 pt-1">
                                {item.status === "DEVOLVIDO" || item.status === "ENCERRADO" ? (
                                  <span
                                    className={`inline-flex items-center py-1.5 px-2.5 rounded-xl text-xs font-bold border ${
                                      item.status === "DEVOLVIDO"
                                        ? "bg-sky-500/10 text-sky-600 border-sky-500/30"
                                        : "bg-slate-500/10 text-slate-600 border-slate-500/30"
                                    }`}
                                    title={l("Situação final gerenciada pelo fluxo formal (abra os detalhes para consultar ou reabrir)", "Final status managed by the formal workflow (open details to view or reopen)")}
                                  >
                                    {translateItemStatus(item.status, language)} ({l("Formal", "Formal")})
                                  </span>
                                ) : (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <select
                                      aria-label={l(`Alterar situação de ${item.title}`, `Change status of ${item.title}`)}
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
                                      <option value="PERDIDO">{l("PERDIDO", "LOST")}</option>
                                      <option value="ENCONTRADO">{l("ENCONTRADO", "FOUND")}</option>
                                      <option value="EM_ANALISE">{l("EM ANÁLISE", "IN REVIEW")}</option>
                                    </select>
                                    {item.status !== "EM_ANALISE" && (
                                      <button
                                        type="button"
                                        disabled={confirmingArrivalId === item.id}
                                        onClick={() => handleConfirmArrival(item)}
                                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-600 text-amber-800 hover:text-white dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap disabled:opacity-50"
                                        title={l("Confirmar chegada física na guarita / secretaria (EM ANÁLISE)", "Confirm physical arrival at front desk / secretariat (IN REVIEW)")}
                                      >
                                        {confirmingArrivalId === item.id
                                          ? l("Confirmando...", "Confirming...")
                                          : l("Confirmar Chegada", "Confirm Arrival")}
                                      </button>
                                    )}
                                  </div>
                                )}

                                <div className="grid grid-cols-2 gap-2 pt-1">
                                  <button
                                    type="button"
                                    title={l(`Enviar notificação para o aluno que cadastrou "${item.title}"`, `Send notification to the student who registered "${item.title}"`)}
                                    onClick={() => handleOpenNotifyModalForItem(item)}
                                    className="min-h-[40px] px-3 py-2 rounded-xl bg-[#EBF5F0] hover:bg-[#16845B] text-[#16845B] hover:text-white dark:bg-emerald-950/50 dark:text-emerald-400 dark:hover:bg-[#16845B] dark:hover:text-white font-semibold text-xs transition-colors border border-[#16845B]/20 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                                  >
                                    <Bell className="w-3.5 h-3.5" />
                                    <span>{l("Notificar", "Notify")}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedItemForDetail(item)}
                                    className="min-h-[40px] px-3 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-[#16845B] hover:text-white font-semibold text-xs border border-slate-200 dark:border-slate-700 transition-colors inline-flex items-center justify-center cursor-pointer"
                                  >
                                    {l("Detalhes", "Details")}
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
                                <th className="p-3.5 rounded-l-xl">{l("Título / Código", "Title / Code")}</th>
                                <th className="p-3.5">{l("Categoria", "Category")}</th>
                                <th className="p-3.5">{l("Localização", "Location")}</th>
                                <th className="p-3.5">{l("Data", "Date")}</th>
                                <th className="p-3.5">{l("Situação (Manual)", "Status (Manual)")}</th>
                                <th className="p-3.5 rounded-r-xl text-right">{l("Ação", "Action")}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {visibleAdminTableItems.map((item) => (
                                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                  <td className="p-3.5 font-bold text-[#172B2A] dark:text-white">
                                    <div>{item.title}</div>
                                    <div className="text-[10px] font-mono text-slate-400">{item.id}</div>
                                  </td>
                                  <td className="p-3.5">{translateCategory(item.category, language)}</td>
                                  <td className="p-3.5 truncate max-w-[140px]">{translateCampusLocation(item.location, language)}</td>
                                  <td className="p-3.5 text-slate-500">{formatDate(item.date)}</td>
                                  <td className="p-3.5">
                                    {item.status === "DEVOLVIDO" || item.status === "ENCERRADO" ? (
                                      <span
                                        className={`inline-flex items-center py-1.5 px-2.5 rounded-xl text-xs font-bold border ${
                                          item.status === "DEVOLVIDO"
                                            ? "bg-sky-500/10 text-sky-600 border-sky-500/30"
                                            : "bg-slate-500/10 text-slate-600 border-slate-500/30"
                                        }`}
                                        title={l("Situação final gerenciada pelo fluxo formal (abra os detalhes para consultar ou reabrir)", "Final status managed by the formal workflow (open details to view or reopen)")}
                                      >
                                        {translateItemStatus(item.status, language)} ({l("Formal", "Formal")})
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
                                          <option value="PERDIDO">{l("PERDIDO", "LOST")}</option>
                                          <option value="ENCONTRADO">{l("ENCONTRADO", "FOUND")}</option>
                                          <option value="EM_ANALISE">{l("EM ANÁLISE", "IN REVIEW")}</option>
                                        </select>
                                        {item.status !== "EM_ANALISE" && (
                                          <button
                                            type="button"
                                            disabled={confirmingArrivalId === item.id}
                                            onClick={() => handleConfirmArrival(item)}
                                            className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-600 text-amber-800 hover:text-white dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap disabled:opacity-50"
                                            title={l("Confirmar chegada física na guarita / secretaria (EM ANÁLISE)", "Confirm physical arrival at front desk / secretariat (IN REVIEW)")}
                                          >
                                            {confirmingArrivalId === item.id ? l("Confirmando...", "Confirming...") : l("Confirmar Chegada", "Confirm Arrival")}
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  <td className="p-3.5 text-right whitespace-nowrap">
                                    <button
                                      type="button"
                                      title={l(`Enviar notificação para o aluno que cadastrou "${item.title}"`, `Send notification to the student who registered "${item.title}"`)}
                                      onClick={() => handleOpenNotifyModalForItem(item)}
                                      className="p-1.5 rounded-lg bg-[#EBF5F0] hover:bg-[#16845B] text-[#16845B] hover:text-white dark:bg-emerald-950/50 dark:text-emerald-400 dark:hover:bg-[#16845B] dark:hover:text-white font-semibold text-[11px] transition-colors border border-[#16845B]/20 mr-1.5 inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <Bell className="w-3.5 h-3.5" />
                                      <span>{l("Notificar", "Notify")}</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedItemForDetail(item)}
                                      className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-[#16845B] hover:text-white font-semibold text-[11px] transition-colors inline-flex items-center cursor-pointer"
                                    >
                                      {l("Detalhes", "Details")}
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
                            {l("Exibindo", "Showing")} <strong>{visibleAdminTableItems.length}</strong> {l("de", "of")}{" "}
                            <strong>{filteredTableItems.length}</strong> {l("objetos", "items")}
                          </span>
                          {filteredTableItems.length > adminTableLimit && (
                            <button
                              type="button"
                              onClick={() => setAdminTableLimit((prev) => prev + 15)}
                              className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-[#16845B] hover:text-white text-xs font-bold text-[#172B2A] dark:text-slate-200 transition-colors cursor-pointer"
                            >
                              {l("Mostrar mais objetos", "Show more items")} ({filteredTableItems.length - adminTableLimit} {l("restantes", "remaining")})
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
                            <span>{l("Métricas da Saúde do Sistema (Desempenho Firebase)", "System Health Metrics (Firebase Performance)")}</span>
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
                                ? l("🔴 Sem conexão", "🔴 Offline")
                                : pingLatencyMs === null && dbLatencyMs === null
                                ? l("⚪ Aguardando medição", "⚪ Awaiting measurement")
                                : (pingLatencyMs ?? 0) > 800 || (dbLatencyMs ?? 0) > 800
                                ? l("🟡 Oscilando", "🟡 Fluctuating")
                                : l("🟢 Estável", "🟢 Stable")}
                            </span>
                          </h2>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {l(
                              "Monitoramento em tempo real da latência de rede, tempo de resposta do banco de dados e alocação de memória",
                              "Real-time monitoring of network latency, database response time, and memory allocation"
                            )}
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
                          <span>{isExportingMonitoringJSON ? l("Baixando...", "Downloading...") : l("Baixar Relatório JSON", "Download JSON Report")}</span>
                        </button>

                        <button
                          onClick={measurePing}
                          disabled={isPinging}
                          className="px-4 py-2.5 rounded-xl bg-[#16845B] hover:bg-[#064E3B] text-white text-xs font-bold transition-all flex items-center space-x-2 shadow-sm cursor-pointer"
                        >
                          <RefreshCw className={`w-4 h-4 ${isPinging ? "animate-spin" : ""}`} />
                          <span>{l("Medir Desempenho Agora", "Measure Performance Now")}</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Latência de Rede */}
                      <div className="bg-[#F8FAFC] dark:bg-slate-900/60 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-500 uppercase flex items-center space-x-1.5">
                            <Wifi className="w-4 h-4 text-sky-500" />
                            <span>{l("Latência de Rede", "Network Latency")}</span>
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
                              ? l("Sem conexão 🔴", "Offline 🔴")
                              : pingLatencyMs === null
                              ? l("Indisponível", "Unavailable")
                              : l("Conectado 🟢", "Connected 🟢")}
                          </span>
                        </div>
                        <div className="flex items-baseline space-x-2">
                          <span className="text-3xl font-bold text-[#172B2A] dark:text-white tabular-nums">
                            {pingLatencyMs !== null ? `${pingLatencyMs} ms` : l("Indisponível", "Unavailable")}
                          </span>
                          <span className="text-xs text-slate-400">{l("Servidor API", "API Gateway")}</span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {pingLatencyMs !== null
                            ? l("Medição real obtida do servidor de métricas.", "Real measurement obtained from the metrics endpoint.")
                            : l("Aguardando resposta válida da API para exibir latência real.", "Awaiting valid API response to display real latency.")}
                        </p>
                      </div>

                      {/* Tempo de Resposta Firestore BD */}
                      <div className="bg-[#F8FAFC] dark:bg-slate-900/60 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-500 uppercase flex items-center space-x-1.5">
                            <Database className="w-4 h-4 text-[#16845B]" />
                            <span>{l("Resposta Banco Firestore", "Firestore DB Response")}</span>
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
                              ? l("Indisponível", "Unavailable")
                              : dbLatencyMs < 300
                              ? l("Rápido", "Fast")
                              : l("Moderado", "Moderate")}
                          </span>
                        </div>
                        <div className="flex items-baseline space-x-2">
                          <span className="text-3xl font-bold text-[#16845B] dark:text-emerald-400 tabular-nums">
                            {dbLatencyMs !== null ? `${dbLatencyMs} ms` : l("Indisponível", "Unavailable")}
                          </span>
                          <span className="text-xs text-slate-400">{l("leitura/escrita", "read/write")}</span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {dbLatencyMs !== null
                            ? l("Medido via consulta real e rastreamento de desempenho do Firestore.", "Measured via real query and Firebase Performance Trace (firestore_db_latency).")
                            : l("Não foi possível obter tempo de resposta real do Firestore neste momento.", "Could not obtain real Firestore response time right now.")}
                        </p>
                      </div>

                      {/* Uso de Memória RAM */}
                      <div className="bg-[#F8FAFC] dark:bg-slate-900/60 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-500 uppercase flex items-center space-x-1.5">
                            <Cpu className="w-4 h-4 text-purple-500" />
                            <span>{l("Uso de Memória RAM", "RAM Memory Usage")}</span>
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              memoryUsageMB === null
                                ? "bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                : "bg-purple-500/10 text-purple-600"
                            }`}
                          >
                            {memoryUsageMB === null
                              ? l("Indisponível", "Unavailable")
                              : memoryUsageMB < 100
                              ? l("Baixo", "Low")
                              : l("Médio", "Medium")}
                          </span>
                        </div>
                        <div className="flex items-baseline space-x-2">
                          <span className="text-3xl font-bold text-[#172B2A] dark:text-white tabular-nums">
                            {memoryUsageMB !== null ? `${memoryUsageMB} MB` : l("Indisponível", "Unavailable")}
                          </span>
                          <span className="text-xs text-slate-400">
                            {memoryUsageMB !== null ? "/ 512 MB JS Heap" : l("Métrica não exposta pelo navegador", "Metric not exposed by browser")}
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
                            {l("Disponível apenas em navegadores que expõem a API ", "Only available in browsers that expose the ")}
                            <code>performance.memory</code>
                            {l(".", " API.")}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Chart: Network vs DB Latency */}
                    <div className="bg-[#F8FAFC] dark:bg-slate-900/40 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <h3 className="text-xs font-bold uppercase text-slate-700 dark:text-slate-300">
                          {l("Gráfico de Latência em Tempo Real (ms)", "Real-Time Latency Chart (ms)")}
                        </h3>
                        <div className="flex items-center space-x-4 text-[10px] font-bold">
                          <span className="flex items-center space-x-1 text-sky-600">
                            <span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block" />
                            <span>{l("Latência de Rede", "Network Latency")}</span>
                          </span>
                          <span className="flex items-center space-x-1 text-[#16845B]">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#16845B] inline-block" />
                            <span>{l("Firestore BD", "Firestore DB")}</span>
                          </span>
                        </div>
                      </div>

                      {latencyHistory.length === 0 ? (
                        <div className="h-56 w-full flex flex-col items-center justify-center text-center px-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                          <Activity className="w-7 h-7 text-slate-400 mb-2" />
                          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            {l(
                              "Nenhuma amostra real de latência coletada nesta sessão.",
                              "No real latency samples collected in this session."
                            )}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {l(
                              'Clique em "Medir Desempenho Agora" ou aguarde a coleta em tempo real.',
                              'Click "Measure Performance Now" or wait for real-time collection.'
                            )}
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
                              <Area type="monotone" dataKey="network" name={l("Rede (ms)", "Network (ms)")} stroke="#0284c7" fill="#0284c7" fillOpacity={0.15} connectNulls={false} />
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
                          <span>{l("Capturas da Barreira Global de Erros (Exceções em Dispositivos Móveis - RNF02)", "Global Error Boundary Captures (Mobile Exceptions - RNF02)")}</span>
                        </h3>
                        <span className="px-2.5 py-0.5 rounded-lg bg-rose-500/10 text-rose-600 text-[10px] font-bold">
                          {errorLogsList.length} {l("Registros", "Records")}
                        </span>
                      </div>

                      {errorLogsList.length === 0 ? (
                        <div className="bg-[#F8FAFC] dark:bg-slate-900/50 rounded-xl p-6 text-center space-y-2 border border-dashed border-slate-200 dark:border-slate-800">
                          <CheckCircle2 className="w-8 h-8 text-[#16845B] mx-auto" />
                          <p className="text-xs font-bold text-[#172B2A] dark:text-slate-200">
                            {l("Sem exceções ou erros não tratados recentes!", "No recent unhandled exceptions or errors!")}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {l(
                              "Nenhum travamento detectado em dispositivos móveis no IFPR Campus Ivaiporã.",
                              "No crashes detected on mobile devices at IFPR Campus Ivaiporã."
                            )}
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-[#F8FAFC] dark:bg-slate-800 text-slate-500 uppercase font-bold text-[10px]">
                              <tr>
                                <th className="p-3">{l("Exceção / Mensagem", "Exception / Message")}</th>
                                <th className="p-3">{l("Dispositivo", "Device")}</th>
                                <th className="p-3">{l("Usuário", "User")}</th>
                                <th className="p-3">{l("Resolução Tela", "Screen Resolution")}</th>
                                <th className="p-3">{l("Data e Hora", "Date & Time")}</th>
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
                                      {log.isMobile ? l("📱 Celular", "📱 Mobile") : l("💻 Computador", "💻 Desktop")}
                                    </span>
                                  </td>
                                  <td className="p-3 text-slate-500">{log.userEmail || l("Anônimo", "Anonymous")}</td>
                                  <td className="p-3 text-slate-400">{log.screenWidth}x{log.screenHeight}</td>
                                  <td className="p-3 text-slate-400">{new Date(log.timestamp).toLocaleString(locale)}</td>
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
                          <span>{l("Fluxo de Aprovação de Contas (@ifpr.edu.br)", "Account Approval Workflow (@ifpr.edu.br)")}</span>
                          {(allUsers || []).filter((u) => u && u.approvalStatus === "PENDENTE").length > 0 && (
                            <span className="px-2.5 py-0.5 rounded-lg bg-amber-500 text-black text-[10px] font-bold uppercase">
                              {(allUsers || []).filter((u) => u && u.approvalStatus === "PENDENTE").length} {l("Em Espera", "Waiting")}
                            </span>
                          )}
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {l(
                            "Validação das solicitações de cadastro com e-mails @estudantes.ifpr.edu.br e @ifpr.edu.br antes da liberação do sistema",
                            "Validation of registration requests with @estudantes.ifpr.edu.br and @ifpr.edu.br emails before granting access"
                          )}
                        </p>
                      </div>
                    </div>

                    {(allUsers || []).filter((u) => u && u.approvalStatus === "PENDENTE").length > 0 && (
                      <button
                        onClick={approveAllPendingUsers}
                        className="py-2.5 px-4 rounded-xl bg-[#16845B] hover:bg-[#064E3B] text-white font-bold text-xs transition-all shadow-sm flex items-center justify-center space-x-2 shrink-0 cursor-pointer"
                        title={l("Aprovar todas as solicitações pendentes de uma só vez", "Approve all pending requests at once")}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{l("Aprovar Todos os Pendentes", "Approve All Pending")} ({(allUsers || []).filter((u) => u && u.approvalStatus === "PENDENTE").length})</span>
                      </button>
                    )}
                  </div>

                  {(allUsers || []).filter((u) => u && u.approvalStatus === "PENDENTE").length === 0 ? (
                    <div className="bg-[#F8FAFC] dark:bg-slate-900/50 rounded-xl p-6 text-center space-y-2 border border-dashed border-slate-200 dark:border-slate-800">
                      <UserCheck className="w-8 h-8 text-[#16845B] mx-auto" />
                      <p className="text-xs font-bold text-[#172B2A] dark:text-slate-200">
                        {l("Nenhuma conta pendente de aprovação no momento!", "No accounts pending approval at the moment!")}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {l(
                          "Todas as solicitações de alunos e servidores do IFPR Campus Ivaiporã foram validadas.",
                          "All student and staff requests for IFPR Campus Ivaiporã have been validated."
                        )}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                        {l("Solicitações em Espera para Análise de Identidade:", "Pending Requests for Identity Review:")}
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
                                    {isPending ? l("⏳ Em Espera", "⏳ Waiting") : l("✅ Aprovado", "✅ Approved")}
                                  </span>
                                </div>

                                <div className="bg-white dark:bg-slate-900/90 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] space-y-1">
                                  <p className="text-slate-600 dark:text-slate-400">
                                    <strong>{l("Tipo de Vínculo:", "Affiliation:")}</strong>{" "}
                                    {isStudent
                                      ? l("🎓 Estudante IFPR", "🎓 IFPR Student")
                                      : isStaff
                                      ? l("🏫 Servidor / Docente IFPR", "🏫 IFPR Staff / Faculty")
                                      : l("Usuário", "User")}
                                  </p>
                                  <p className="text-slate-600 dark:text-slate-400">
                                    <strong>{l("Curso / Departamento:", "Course / Department:")}</strong> {pendingUser.courseOrDept}
                                  </p>
                                  <p className="text-slate-600 dark:text-slate-400">
                                    <strong>{l("Matrícula IFPR:", "IFPR ID:")}</strong> {pendingUser.registrationNumber}
                                  </p>
                                </div>

                                {isPending && (
                                  <div className="flex items-center gap-2 pt-1">
                                    <button
                                      onClick={() => approveUser(pendingUser.id, true)}
                                      className="flex-1 py-2.5 px-3 rounded-xl bg-[#16845B] hover:bg-[#064E3B] text-white font-bold text-xs transition-all shadow-sm flex items-center justify-center space-x-1.5 cursor-pointer"
                                    >
                                      <CheckCircle2 className="w-4 h-4" />
                                      <span>{l("Aprovar Acesso", "Approve Access")}</span>
                                    </button>
                                    <button
                                      onClick={() => approveUser(pendingUser.id, false)}
                                      className="py-2.5 px-4 rounded-xl bg-rose-600/10 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-500/20 font-bold text-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
                                    >
                                      <XCircle className="w-4 h-4" />
                                      <span>{l("Recusar", "Reject")}</span>
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
                            {l("Cópias de Segurança Automáticas do Firestore", "Automated Firestore Backups & Snapshots")}
                          </h2>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {l(
                              "Exportação periódica e agendamento de segurança do banco de dados do Campus Ivaiporã",
                              "Periodic export and security scheduling for the Campus Ivaiporã database"
                            )}
                          </p>
                        </div>
                      </div>

                      <button
                        id="btn-download-full-backup"
                        onClick={handleManualBackup}
                        disabled={isExecutingBackup}
                        className="px-5 py-2.5 rounded-xl bg-[#16845B] hover:bg-[#064E3B] active:scale-95 text-white font-bold text-xs transition-all shadow-sm flex items-center space-x-2 self-start sm:self-auto cursor-pointer"
                        title={l("Exportar cópia JSON com todas as coleções do Firestore do IFPR", "Export JSON snapshot with all IFPR Firestore collections")}
                      >
                        <Download className={`w-4 h-4 ${isExecutingBackup ? "animate-bounce" : ""}`} />
                        <span>{isExecutingBackup ? l("Gerando Cópia...", "Generating Backup...") : l("Baixar Cópia Completa", "Download Full Backup")}</span>
                      </button>
                    </div>

                    {/* Configuration Controls */}
                    <div className="bg-[#F8FAFC] dark:bg-slate-900/60 p-5 rounded-xl border border-slate-200 dark:border-slate-800/80 space-y-4">
                      <h3 className="text-xs font-bold uppercase text-slate-700 dark:text-slate-300 tracking-wider">
                        {l("Agendamento & Frequência das Cópias", "Backup Schedule & Frequency")}
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Toggle */}
                        <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                          <span className="text-xs font-bold text-[#172B2A] dark:text-slate-200">
                            {l("Cópia Automática", "Automated Backup")}
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
                            {l("Frequência:", "Frequency:")}
                          </span>
                          <select
                            value={backupScheduleConfig.frequency}
                            onChange={(e) =>
                              updateBackupScheduleConfig({ frequency: e.target.value as BackupScheduleConfig["frequency"] })
                            }
                            className="bg-transparent text-xs font-bold text-[#16845B] dark:text-emerald-400 outline-none cursor-pointer"
                          >
                            <option value="A_CADA_12H">{l("A cada 12 Horas", "Every 12 Hours")}</option>
                            <option value="DIARIO_0200">{l("Diário às 02:00h", "Daily at 02:00")}</option>
                            <option value="SEMANAL_DOMINGO">{l("Semanal (Domingos)", "Weekly (Sundays)")}</option>
                          </select>
                        </div>

                        {/* Auto download */}
                        <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                          <span className="text-xs font-bold text-[#172B2A] dark:text-slate-200">
                            {l("Baixar JSON Automático", "Auto-Download JSON")}
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
                    {l("Histórico de Cópias Realizadas", "Completed Backups History")} ({backupLogs.length})
                  </h3>

                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#F8FAFC] dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800">
                          <th className="p-3">{l("Data / Hora", "Date / Time")}</th>
                          <th className="p-3">{l("Nome do Arquivo", "File Name")}</th>
                          <th className="p-3">{l("Tamanho", "Size")}</th>
                          <th className="p-3">{l("Gatilho", "Trigger")}</th>
                          <th className="p-3">{l("Situação", "Status")}</th>
                          <th className="p-3 text-right">{l("Ação", "Action")}</th>
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
                                {log.triggerType === "MANUAL" ? l("MANUAL", "MANUAL") : l("AGENDADO", "SCHEDULED")}
                              </span>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#EBF5F0] text-[#16845B] dark:bg-emerald-950/60 dark:text-emerald-400">
                                {l("SUCESSO", "SUCCESS")}
                              </span>
                            </td>
                            <td className="p-3 text-right whitespace-nowrap">
                              <button
                                onClick={() => handleManualBackup()}
                                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-[#16845B] hover:text-white text-slate-700 dark:text-slate-300 font-bold transition-all text-[11px] cursor-pointer"
                                title={l("Baixar Cópia JSON", "Download JSON Snapshot")}
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
                        {l("Registro de Atividades do Administrador (Trilha de Auditoria)", "Administrator Activity Log (Audit Trail)")}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {l(
                          "Registro transparente de exclusões, alterações de permissão, manutenção e alterações manuais de situação.",
                          "Transparent record of deletions, permission changes, maintenance, and manual status updates."
                        )}
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
                        placeholder={l("Buscar nos registros...", "Search logs...")}
                        className="pl-8 pr-3 py-1.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-xs outline-none w-44 focus:border-[#16845B]"
                      />
                    </div>

                    <select
                      value={logFilterAction}
                      onChange={(e) => setLogFilterAction(e?.target?.value ?? "TODOS")}
                      className="py-1.5 px-3 rounded-xl bg-[#F8FAFC] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-xs font-bold outline-none focus:border-[#16845B]"
                    >
                      <option value="TODOS">{l("Todas as Ações", "All Actions")}</option>
                      <option value="EXCLUSAO_USUARIO">{l("Exclusão de Usuário", "User Deletion")}</option>
                      <option value="MODO_MANUTENCAO">{l("Modo Manutenção", "Maintenance Mode")}</option>
                      <option value="ALTERACAO_PERMISSAO">{l("Alteração de Permissão", "Permission Change")}</option>
                      <option value="STATUS_OVERRIDE">{l("Alteração Manual de Situação", "Manual Status Change")}</option>
                      <option value="NOVO_USUARIO">{l("Novo Usuário", "New User")}</option>
                      <option value="RESET_SISTEMA">{l("Redefinição do Sistema", "System Reset")}</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F8FAFC] dark:bg-slate-800 text-slate-500 uppercase font-bold text-[10px]">
                      <tr>
                        <th className="p-3.5 rounded-l-xl">{l("Data / Hora", "Date / Time")}</th>
                        <th className="p-3.5">{l("Administrador", "Administrator")}</th>
                        <th className="p-3.5">{l("Ação Executada", "Action Executed")}</th>
                        <th className="p-3.5 rounded-r-xl">{l("Detalhes da Operação", "Operation Details")}</th>
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
                                {translateActivityAction(String(log?.action || "LOG"), language)}
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
                        <span>{l("Gestão de Banco de Dados & Redefinição para Próxima Fase", "Database Management & Next-Phase Reset")}</span>
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {l(
                          "Ferramentas avançadas para cópia local em JSON, limpeza de registros/métricas e limpeza total do Firestore",
                          "Advanced tools for local JSON backup, log/metric clearing, and full Firestore wipe"
                        )}
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
                        <span>{l("Cópia Completa em JSON", "Full JSON Backup")}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        {l("Exporta um arquivo ", "Exports a local ")}
                        <code>.json</code>
                        {l(
                          " local contendo uma cópia de todas as coleções do Firestore (objetos, usuários, reivindicações, comentários e registros).",
                          " file containing a snapshot of all Firestore collections (items, users, claims, comments, and logs)."
                        )}
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
                      <span>{isExportingBackup ? l("Gerando JSON...", "Generating JSON...") : l("Exportar JSON Local", "Export Local JSON")}</span>
                    </button>
                  </div>

                  {/* 2. Clear Logs & Metrics */}
                  <div className="bg-[#F8FAFC] dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 flex flex-col justify-between shadow-xs">
                    <div className="space-y-1.5">
                      <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-300 font-bold text-xs">
                        <BarChart3 className="w-4 h-4" />
                        <span>{l("Limpar Registros & Métricas", "Clear Logs & Metrics")}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        {l(
                          "Exclui todo o histórico de registros de atividades (trilha de auditoria), histórico de cópias e métricas de desempenho no Firestore para reiniciar as estatísticas do zero.",
                          "Deletes all activity log history (audit trail), backup logs, and performance metrics in Firestore to restart statistics from zero."
                        )}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsClearLogsConfirmOpen(true)}
                      className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold text-xs transition-all shadow-sm flex items-center justify-center space-x-2 cursor-pointer"
                    >
                      <BarChart3 className="w-4 h-4" />
                      <span>{l("Limpar Registros e Métricas", "Clear Logs & Metrics")}</span>
                    </button>
                  </div>

                  {/* 3. Master Wipe Script */}
                  <div className="bg-[#F8FAFC] dark:bg-slate-900 p-5 rounded-xl border border-rose-500/30 dark:border-rose-500/30 space-y-3 flex flex-col justify-between shadow-xs">
                    <div className="space-y-1.5">
                      <div className="flex items-center space-x-2 text-rose-600 dark:text-rose-400 font-bold text-xs">
                        <ShieldAlert className="w-4 h-4" />
                        <span>{l("Limpeza Total (Zerar Banco)", "Master Wipe (Reset Database)")}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        {l(
                          "Operação administrativa que remove todos os objetos, contas de teste e registros do Firestore com um único comando, mantendo apenas sua conta ativa de administrador.",
                          "Administrative operation that deletes all items, test accounts, and logs from Firestore in one command, keeping only your active administrator account."
                        )}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsMasterWipeConfirmOpen(true)}
                      className="w-full py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-all shadow-sm flex items-center justify-center space-x-2 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>{l("Zerar Banco de Dados", "Wipe Database")}</span>
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
                        <span>{l("Solicitações de Devolução de Objetos", "Item Return Claims")}</span>
                        {pendingClaimsCount > 0 && (
                          <span className="px-2.5 py-0.5 rounded-lg bg-amber-500 text-black text-[10px] font-bold uppercase">
                            {pendingClaimsCount} {l("Pendentes", "Pending")}
                          </span>
                        )}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {l(
                          "Análise de posse, aprovação de pedidos e triagem da Secretaria / SEBAC (IFPR Campus Ivaiporã)",
                          "Ownership review, claim approval, and triage by Secretariat / SEBAC (IFPR Campus Ivaiporã)"
                        )}
                      </p>
                    </div>
                  </div>
                  <span className="self-start sm:self-auto px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold border border-slate-200 dark:border-slate-700">
                    {(claims || []).length} {l("Registros no Total", "Total Records")}
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
                          {st === "TODAS"
                            ? l("Todas", "All")
                            : st === "PENDENTE"
                            ? l("Pendentes", "Pending")
                            : st === "APROVADO"
                            ? l("Aprovadas", "Approved")
                            : st === "REJEITADO"
                            ? l("Rejeitadas", "Rejected")
                            : st === "CONCLUIDO"
                            ? l("Concluídas", "Completed")
                            : l("Canceladas", "Cancelled")}{" "}
                          ({count})
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
                      placeholder={l("Buscar por objeto, solicitante, matrícula...", "Search by item, claimant, ID...")}
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
                          {l("Nenhuma solicitação encontrada", "No claims found")}
                        </p>
                        <p className="text-xs text-slate-500 max-w-md mx-auto">
                          {l(
                            "Não foram localizadas solicitações de devolução para o filtro selecionado.",
                            "No return claims were found for the selected filter."
                          )}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#F8FAFC] dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 uppercase font-bold text-[10px]">
                          <tr>
                            <th className="p-3.5">{l("Objeto / Categoria", "Item / Category")}</th>
                            <th className="p-3.5">{l("Solicitante", "Claimant")}</th>
                            <th className="p-3.5">{l("Características Declaradas (RNF04)", "Declared Characteristics (RNF04)")}</th>
                            <th className="p-3.5">{l("Data / Situação", "Date / Status")}</th>
                            <th className="p-3.5 text-right">{l("Ações", "Actions")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredClaims.map((claim) => {
                            const relatedItem = items.find((it) => it.id === claim.itemId);
                            return (
                              <tr key={claim.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                <td className="p-3.5">
                                  <div className="font-bold text-[#172B2A] dark:text-white">
                                    {claim.itemTitle || relatedItem?.title || l("Objeto", "Item")}
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                                    <span>#{claim.itemId}</span>
                                    <span>•</span>
                                    <span>{translateCategory(claim.itemCategory || relatedItem?.category || "", language) || l("Categoria", "Category")}</span>
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
                                      <span>{l("Ver ficha completa do item", "View full item record")}</span>
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
                                    {claim.claimerRole ? translateUserRole(claim.claimerRole, language) : l("Aluno", "Student")} {claim.claimerRegistration ? `• ${l("Matrícula", "ID")}: ${claim.claimerRegistration}` : ""}
                                  </div>
                                </td>

                                <td className="p-3.5 max-w-xs">
                                  <div className="text-[#172B2A] dark:text-slate-200 text-xs bg-[#F8FAFC] dark:bg-slate-800/70 p-2 rounded-xl border border-slate-200 dark:border-slate-700/60 leading-relaxed whitespace-pre-wrap">
                                    {claim.distinctiveFeatures || l("Sem características registradas.", "No characteristics recorded.")}
                                  </div>
                                  {claim.additionalInfo && (
                                    <div className="text-[10px] text-slate-500 mt-1 italic">
                                      {l("Info adicional:", "Additional info:")} {claim.additionalInfo}
                                    </div>
                                  )}
                                  {claim.rejectionReason && (
                                    <div className="text-[10px] text-rose-600 dark:text-rose-400 font-bold mt-1 bg-rose-500/10 p-1.5 rounded-lg border border-rose-500/20">
                                      {l("Motivo da Rejeição:", "Rejection Reason:")} {claim.rejectionReason}
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
                                      ? l("Em Análise", "Under Review")
                                      : claim.status === "APROVADO"
                                      ? l("Aprovado (Aguardando Retirada)", "Approved (Awaiting Pickup)")
                                      : claim.status === "REJEITADO"
                                      ? l("Rejeitado", "Rejected")
                                      : claim.status === "CONCLUIDO"
                                      ? l("Devolvido ao Dono", "Returned to Owner")
                                      : l("Cancelado", "Cancelled")}
                                  </span>
                                  {claim.reviewedByName && (
                                    <div className="text-[9px] text-slate-400 mt-1">
                                      {l("Por:", "By:")} {claim.reviewedByName}
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
                                              decisionNotes: l(
                                                "Solicitação deferida após conferência das características particulares.",
                                                "Claim approved after verifying distinctive characteristics."
                                              ),
                                            });
                                            vibrateSuccess();
                                            addToast(
                                              l(
                                                `Solicitação de ${claim.claimerName} APROVADA com sucesso!`,
                                                `Claim from ${claim.claimerName} APPROVED successfully!`
                                              ),
                                              "success"
                                            );
                                          } catch (e: any) {
                                            addToast(e?.message || l("Erro ao aprovar solicitação.", "Error approving claim."), "error");
                                          } finally {
                                            setIsProcessingClaimAction(false);
                                          }
                                        }}
                                        className="px-3 py-1.5 rounded-xl bg-[#16845B] hover:bg-[#064E3B] text-white font-bold text-xs transition-all shadow-xs cursor-pointer disabled:opacity-50"
                                        title={l("Aprovar posse e autorizar retirada no balcão", "Approve ownership and authorize front-desk pickup")}
                                      >
                                        {l("Aprovar", "Approve")}
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
                                        title={l("Rejeitar solicitação com justificativa", "Reject claim with justification")}
                                      >
                                        {l("Rejeitar", "Reject")}
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
                                          title={l("Abrir os detalhes do objeto para registrar entrega formal com assinatura", "Open item details to record formal return with signature")}
                                        >
                                          <FileSignature className="w-3.5 h-3.5" />
                                          <span>{l("Devolução Formal", "Formal Return")}</span>
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
                                        title={l("Revogar aprovação e rejeitar", "Revoke approval and reject")}
                                      >
                                        {l("Revogar", "Revoke")}
                                      </button>
                                    </div>
                                  )}

                                  {(claim.status === "REJEITADO" || claim.status === "CONCLUIDO" || claim.status === "CANCELADO") && (
                                    <span className="text-[11px] text-slate-400 italic">
                                      {l("Encerrada", "Closed")}
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
                        {l("Rejeitar Solicitação de Devolução", "Reject Return Claim")}
                      </h3>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                        {l("Secretaria IFPR • Decisão Administrativa", "IFPR Secretariat • Administrative Decision")}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setClaimToReject(null)}
                    aria-label={l("Fechar", "Close")}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs space-y-1">
                  <p className="text-rose-900 dark:text-rose-300">
                    {l("Solicitante:", "Claimant:")} <strong>{claimToReject.claimerName}</strong> ({claimToReject.claimerEmail})
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    {l("Objeto:", "Item:")} {claimToReject.itemTitle} (#{claimToReject.itemId})
                  </p>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!rejectionReasonInput.trim()) {
                      addToast(l("Informe o motivo da rejeição para registrar a decisão.", "Provide the rejection reason to record the decision."), "error");
                      return;
                    }
                    try {
                      setIsProcessingClaimAction(true);
                      await updateClaimStatus(claimToReject.id, "REJEITADO", {
                        rejectionReason: rejectionReasonInput.trim(),
                        decisionNotes: l(
                          `Rejeitado por ${currentUser.name} (${currentUser.role}).`,
                          `Rejected by ${currentUser.name} (${currentUser.role}).`
                        ),
                      });
                      vibrateSuccess();
                      addToast(l("Solicitação rejeitada e requerente notificado.", "Claim rejected and claimant notified."), "info");
                      setClaimToReject(null);
                      setRejectionReasonInput("");
                    } catch (err: any) {
                      addToast(err?.message || l("Erro ao rejeitar solicitação.", "Error rejecting claim."), "error");
                    } finally {
                      setIsProcessingClaimAction(false);
                    }
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                      {l("Justificativa da Rejeição * (Será exibida ao solicitante)", "Rejection Reason * (Visible to claimant)")}
                    </label>
                    <textarea
                      required
                      rows={3}
                      value={rejectionReasonInput}
                      onChange={(e) => setRejectionReasonInput(e.target.value)}
                      placeholder={l("Ex: Características informadas não coincidem com o objeto arquivado na guarita...", "E.g.: Provided characteristics do not match the item kept at the front desk...")}
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8FAFC] dark:bg-[#0B0F17] text-[#172B2A] dark:text-white text-xs outline-none focus:border-rose-500"
                    />
                  </div>

                  <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setClaimToReject(null)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      {l("Cancelar", "Cancel")}
                    </button>
                    <button
                      type="submit"
                      disabled={isProcessingClaimAction || !rejectionReasonInput.trim()}
                      className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      <span>{isProcessingClaimAction ? l("Processando...", "Processing...") : l("Confirmar Rejeição", "Confirm Rejection")}</span>
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
                        <span>{l("Fila de Assinaturas Institucionais Pendentes", "Pending Institutional Signatures Queue")}</span>
                        {pendingSignaturesCount > 0 && (
                          <UIBadge tone="amber">{pendingSignaturesCount} {l("Pendentes", "Pending")}</UIBadge>
                        )}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {l(
                          "Devoluções com termo assinado pelo receptor que aguardam atestação e assinatura institucional do servidor atendente",
                          "Returns signed by the recipient that await institutional attestation and signature by the attending staff member"
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {pendingSignaturesItems.length === 0 ? (
                  <EmptyState
                    icon={<CheckCircle2 className="w-7 h-7" />}
                    title={l("Nenhuma assinatura institucional pendente para suas devoluções!", "No pending institutional signatures for your returns!")}
                    description={l(
                      "Todas as devoluções emitidas por você que necessitam de atestação possuem a assinatura dupla concluída ou nenhuma pendência foi registrada para seu usuário.",
                      "All returns issued by you that require attestation already have dual signatures completed or have no pending items for your user."
                    )}
                  />
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F8FAFC] dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 uppercase font-bold text-[10px]">
                        <tr>
                          <th className="p-3.5">{l("Objeto / Identificador", "Item / Identifier")}</th>
                          <th className="p-3.5">{l("Receptor / Proprietário", "Recipient / Owner")}</th>
                          <th className="p-3.5">{l("Assinatura do Receptor", "Recipient Signature")}</th>
                          <th className="p-3.5">{l("Data / Código Recibo", "Date / Receipt Code")}</th>
                          <th className="p-3.5 text-right">{l("Ação", "Action")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {pendingSignaturesItems.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="p-3.5 font-bold text-[#172B2A] dark:text-white">
                              <div>{item.title}</div>
                              <div className="text-[10px] font-mono text-slate-400">#{item.id} • {translateCategory(item.category, language)}</div>
                            </td>
                            <td className="p-3.5">
                              <div className="font-bold text-[#172B2A] dark:text-slate-200">
                                {item.recipientName || item.recipientSignatureName || l("Receptor", "Recipient")}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {item.recipientBond || l("Aluno(a)", "Student")} • {item.recipientEmail || l("Sem e-mail", "No email")}
                              </div>
                            </td>
                            <td className="p-3.5">
                              <UIBadge tone="emerald">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>{l("Receptor Assinou", "Recipient Signed")}</span>
                              </UIBadge>
                            </td>
                            <td className="p-3.5 font-mono text-slate-600 dark:text-slate-400">
                              <div>{formatDate(item.signedAt || item.resolutionDate || item.date)}</div>
                              <div className="text-[10px] text-slate-400">{item.receiptValidationCode || l("CÓDIGO PENDENTE", "CODE PENDING")}</div>
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
                                <span>{l("Atestar e Assinar", "Attest & Sign")}</span>
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
                          {l("Devoluções Pendentes Sem Emissor Identificado", "Pending Returns Without Identified Issuer")} ({unassignedPendingSignaturesCount})
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {l(
                            "Devoluções com assinatura do receptor que não possuem servidor emissor registrado. A atestação está bloqueada até a verificação da autoria original.",
                            "Returns signed by the recipient without a registered issuing staff member. Attestation is blocked until original authorship is verified."
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/40 dark:bg-amber-950/20 p-1">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-amber-500/10 text-amber-900 dark:text-amber-200 uppercase font-bold text-[10px]">
                          <tr>
                            <th className="p-3.5">{l("Objeto / Identificador", "Item / Identifier")}</th>
                            <th className="p-3.5">{l("Receptor", "Recipient")}</th>
                            <th className="p-3.5">{l("Situação da Autoria", "Authorship Status")}</th>
                            <th className="p-3.5">{l("Data Recibo", "Receipt Date")}</th>
                            <th className="p-3.5 text-right">{l("Ação", "Action")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-200/40 dark:divide-amber-800/30">
                          {unassignedPendingSignaturesItems.map((item) => (
                            <tr key={item.id} className="hover:bg-amber-500/10 transition-colors">
                              <td className="p-3.5 font-bold text-[#172B2A] dark:text-white">
                                <div>{item.title}</div>
                                <div className="text-[10px] font-mono text-slate-400">#{item.id} • {translateCategory(item.category, language)}</div>
                              </td>
                              <td className="p-3.5">
                                <div className="font-bold text-[#172B2A] dark:text-slate-200">
                                  {item.recipientName || item.recipientSignatureName || l("Receptor", "Recipient")}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  {item.recipientBond || l("Aluno(a)", "Student")}
                                </div>
                              </td>
                              <td className="p-3.5">
                                <UIBadge tone="amber">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>{l("Emissor Não Identificado", "Issuer Not Identified")}</span>
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
                                  <span>{l("Verificar Detalhes", "Check Details")}</span>
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
                    {l("Cadastrar Novo Usuário no IFPR", "Register New IFPR User")}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {l("Administrador TI • Adicionar aluno ou servidor", "IT Administrator • Add student or staff member")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label={l("Fechar janela", "Close modal")}
                onClick={() => setIsAddingUserOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddUserSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {l("Nome Completo", "Full Name")} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder={l("Ex: Carlos Eduardo da Silva", "e.g. Carlos Eduardo da Silva")}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-[#172B2A] dark:text-white outline-none focus:border-[#16845B]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {l("E-mail Institucional", "Institutional E-mail")} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder={l("Ex: carlos.silva@estudante.ifpr.edu.br", "e.g. carlos.silva@estudante.ifpr.edu.br")}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-[#172B2A] dark:text-white outline-none focus:border-[#16845B]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {l("Perfil / Função", "Profile / Role")}
                  </label>
                  <select
                    value={!isRootAdminUser && newUserRole === "ADMIN" ? "ALUNO" : newUserRole}
                    onChange={(e) => {
                      const selectedRole = e.target.value as UserRole;
                      if (selectedRole === "ADMIN" && !isRootAdminUser) {
                        setNewUserRole("ALUNO");
                        return;
                      }
                      setNewUserRole(selectedRole);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-[#172B2A] dark:text-white outline-none focus:border-[#16845B]"
                  >
                    <option value="ALUNO">{l("ALUNO (Discente)", "STUDENT")}</option>
                    <option value="SERVIDOR">{l("SERVIDOR (Docente / TAE)", "STAFF (Faculty / Admin)")}</option>
                    {isRootAdminUser && <option value="ADMIN">{l("ADMINISTRADOR (TI)", "ADMINISTRATOR (IT)")}</option>}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {l("Matrícula / Prontuário", "Registration / ID Number")}
                  </label>
                  <input
                    type="text"
                    value={newUserRegNumber}
                    onChange={(e) => setNewUserRegNumber(e.target.value)}
                    placeholder={l("Ex: 2026100987", "e.g. 2026100987")}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-[#172B2A] dark:text-white outline-none focus:border-[#16845B]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {l("Curso ou Setor no IFPR Campus Ivaiporã", "Course or Department at IFPR Campus Ivaiporã")}
                </label>
                <input
                  type="text"
                  value={newUserDept}
                  onChange={(e) => setNewUserDept(e.target.value)}
                  placeholder={l("Ex: Técnico em Informática", "e.g. Computer Science Program")}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-[#172B2A] dark:text-white outline-none focus:border-[#16845B]"
                />
              </div>

              <div className="p-3 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/30 border border-[#16845B]/20 text-[11px] text-[#064E3B] dark:text-emerald-200 leading-relaxed">
                <strong>{l("Primeiro Acesso Seguro:", "Secure First Access:")}</strong>{" "}
                {l(
                  "Nenhuma senha padrão será criada. A conta será provisionada no Firebase Authentication + Firestore e o usuário receberá um link pessoal para definir sua própria senha.",
                  "No default password will be created. The account will be provisioned in Firebase Authentication + Firestore and the user will receive a personal link to set their own password."
                )}
              </div>

              <div className="pt-4 flex justify-end space-x-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={isSubmittingNewUser}
                  onClick={() => setIsAddingUserOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {l("Cancelar", "Cancel")}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNewUser}
                  className="px-5 py-2.5 rounded-xl bg-[#16845B] hover:bg-[#064E3B] text-white font-bold shadow-sm transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-60"
                >
                  {isSubmittingNewUser ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserCheck className="w-4 h-4" />
                  )}
                  <span>
                    {isSubmittingNewUser
                      ? l("Provisionando...", "Provisioning...")
                      : l("Cadastrar Usuário", "Register User")}
                  </span>
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
                  {l("Redefinir Banco de Dados do Sistema", "Reset System Database")}
                </h3>
                <p className="text-xs text-slate-500">
                  {l("Exclusivo para Fases de Testes do IFPR", "Exclusive to IFPR Testing Phases")}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {l(
                "Esta ação redefinirá todas as ocorrências, notificações e usuários para o padrão inicial de configuração do IFPR Campus Ivaiporã.",
                "This action will reset all reports, notifications, and users to the initial baseline configuration for IFPR Campus Ivaiporã."
              )}
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
              >
                {l("Cancelar", "Cancel")}
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
                {l("Sim, Redefinir Sistema", "Yes, Reset System")}
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
                  {l("Limpar Registros e Métricas de Desempenho", "Clear Logs & Performance Metrics")}
                </h3>
                <p className="text-xs text-slate-500">
                  {l("Reiniciar histórico de estatísticas do Firestore", "Reset Firestore statistics history")}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {l(
                "Esta ação apagará permanentemente todo o histórico de registros de atividades (trilha de auditoria), cópias de segurança, registros de erro e métricas de desempenho no Firestore. As estatísticas e o monitor de disponibilidade serão iniciados do zero para a próxima fase de testes.",
                "This action will permanently erase all activity logs (audit trail), backup records, error logs, and performance metrics in Firestore. Statistics and the uptime monitor will start from scratch for the next testing phase."
              )}
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setIsClearLogsConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
              >
                {l("Cancelar", "Cancel")}
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
                {l("Sim, Limpar Registros e Métricas", "Yes, Clear Logs & Metrics")}
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
                  {l("🔥 Limpeza Total - Zerar Banco de Dados", "🔥 Master Wipe - Full Cleanup")}
                </h3>
                <p className="text-xs text-rose-500 font-bold">
                  {l("Ação Irreversível no Firestore", "Irreversible Action in Firestore")}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <strong>{l("ATENÇÃO:", "WARNING:")}</strong>{" "}
              {l(
                "Esta ação executará a rotina de limpeza total no Firestore. Todos os objetos achados/perdidos, reivindicações, comentários, notificações e usuários (exceto sua conta atual de administrador) serão ",
                "This action will run the full cleanup routine in Firestore. All lost/found items, claims, comments, notifications, and users (except your current administrator account) will be "
              )}
              <strong>{l("EXCLUÍDOS PERMANENTEMENTE", "PERMANENTLY DELETED")}</strong>.
              <br /><br />
              💡 <em>
                {l(
                  "Recomenda-se exportar a cópia de segurança em JSON antes de continuar.",
                  "It is recommended to export a JSON backup before proceeding."
                )}
              </em>
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setIsMasterWipeConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
              >
                {l("Cancelar", "Cancel")}
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
                <span>{l("Confirmar e Excluir Tudo", "Confirm and Delete All")}</span>
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
                  {l("Confirmar Remoção de Usuário", "Confirm User Removal")}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {l("Ação exclusiva para Administradores", "Administrators-only action")}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {l("Tem certeza que deseja remover o usuário ", "Are you sure you want to remove user ")}
              <strong>{userToDelete.name}</strong>
              {l(
                "? Esta ação removerá os dados de perfil do banco de dados do IFPR.",
                "? This action will remove their profile data from the IFPR database."
              )}
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={isDeletingUser}
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
              >
                {l("Cancelar", "Cancel")}
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
                <span>
                  {isDeletingUser
                    ? l("Removendo...", "Removing...")
                    : l("Sim, Remover Usuário", "Yes, Remove User")}
                </span>
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
                    {l("Enviar Notificação do Sistema", "Send System Notification")}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {l("Aviso direto ao discente no painel e sininho do aplicativo", "Direct alert to the student in the dashboard and notification bell")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label={l("Fechar janela", "Close modal")}
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
                  {l("Destinatário da Notificação", "Notification Recipient")}
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
                    {l("Aluno Específico", "Specific Student")}
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
                    {l(
                      `📢 Todos os Alunos (${allUsers.filter((u) => u && u.role === "ALUNO").length})`,
                      `📢 All Students (${allUsers.filter((u) => u && u.role === "ALUNO").length})`
                    )}
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
                        {u.name} — {u.email} ({translateUserRole(u.role, language)})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Quick Presets */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                  {l("Modelos Rápidos:", "Quick Templates:")}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setNotifyTitle(l("Objeto com características similares registrado!", "Item with similar characteristics registered!"));
                      setNotifyMessage(
                        l(
                          `Olá${notifyModalUser ? ` ${notifyModalUser.name}` : ""}! Um novo item similar ao seu relato foi cadastrado no sistema. Acesse a aba 'Encontrados' para conferir e solicitar a devolução.`,
                          `Hello${notifyModalUser ? ` ${notifyModalUser.name}` : ""}! A new item similar to your report has been registered in the system. Open the 'Found' tab to check it and request return.`
                        )
                      );
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-[#EBF5F0] hover:text-[#16845B] text-[11px] font-semibold text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    {l("✨ Objeto Similar", "✨ Similar Item")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNotifyTitle(l("Comparecer à Recepção / Seção de Achados", "Please visit Reception / Lost & Found Desk"));
                      setNotifyMessage(
                        l(
                          `Prezado(a)${notifyModalUser ? ` ${notifyModalUser.name}` : ""}, favor comparecer à recepção do campus IFPR Ivaiporã com documento com foto para retirada de seu item.`,
                          `Dear${notifyModalUser ? ` ${notifyModalUser.name}` : " user"}, please come to the IFPR Campus Ivaiporã reception desk with a photo ID to collect your item.`
                        )
                      );
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-[#EBF5F0] hover:text-[#16845B] text-[11px] font-semibold text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    {l("🏢 Retirada Presencial", "🏢 In-Person Pickup")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNotifyTitle(l("Solicitação de Devolução Aprovada", "Return Request Approved"));
                      setNotifyMessage(
                        l(
                          "Sua comprovação de propriedade foi validada pela equipe do IFPR. O item está liberado para entrega.",
                          "Your proof of ownership has been verified by the IFPR team. The item is cleared for handover."
                        )
                      );
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-[#EBF5F0] hover:text-[#16845B] text-[11px] font-semibold text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    {l("✅ Devolução Aprovada", "✅ Return Approved")}
                  </button>
                </div>
              </div>

              {/* Title Input */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-400 mb-1.5">
                  {l("Título da Notificação", "Notification Title")}
                </label>
                <input
                  type="text"
                  required
                  value={notifyTitle}
                  onChange={(e) => setNotifyTitle(e.target.value)}
                  placeholder={l("Ex: Item similar encontrado na Biblioteca...", "e.g. Similar item found in the Library...")}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-xs text-[#172B2A] dark:text-white outline-none focus:border-[#16845B] font-bold"
                />
              </div>

              {/* Related Item (Optional) */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-400 mb-1.5">
                  {l("Objeto Relacionado (Opcional)", "Related Item (Optional)")}
                </label>
                <select
                  value={notifyRelatedItemId}
                  onChange={(e) => setNotifyRelatedItemId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-xs text-[#172B2A] dark:text-white outline-none focus:border-[#16845B]"
                >
                  <option value="">{l("Nenhum objeto específico vinculado", "No specific item linked")}</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      #{it.id.slice(-6)} - {it.title} ({it.type === "PERDIDO" ? l("Perdido", "Lost") : l("Encontrado", "Found")} - {translateCategory(it.category, language)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Message Textarea */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-400 mb-1.5">
                  {l("Mensagem Detalhada", "Detailed Message")}
                </label>
                <textarea
                  required
                  rows={3}
                  value={notifyMessage}
                  onChange={(e) => setNotifyMessage(e.target.value)}
                  placeholder={l("Digite as instruções e informações para o aluno...", "Enter instructions and details for the student...")}
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
                  {l("Cancelar", "Cancel")}
                </button>
                <button
                  type="submit"
                  disabled={isSendingNotif}
                  className="px-5 py-2.5 rounded-xl bg-[#16845B] hover:bg-[#064E3B] text-white text-xs font-bold shadow-sm flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSendingNotif ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{l("Enviando...", "Sending...")}</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>{l("Enviar Notificação", "Send Notification")}</span>
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
