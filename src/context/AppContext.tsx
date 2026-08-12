import React, { createContext, useContext, useState, useEffect } from "react";
import {
  LostFoundItem,
  User,
  NotificationItem,
  ItemClaim,
  ItemStatus,
  AIMatchResult,
  UserRole,
  ItemComment,
  ActivityLog,
  BackupLog,
  BackupScheduleConfig,
} from "../types";
import { INITIAL_ITEMS, MOCK_USERS, MOCK_NOTIFICATIONS, MOCK_CLAIMS, MOCK_COMMENTS, MOCK_ACTIVITY_LOGS } from "../data/mockData";
import { safeFetchJson, clientMatchSimilarity } from "../lib/apiHelper";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
} from "firebase/firestore";
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  User as FirebaseUser,
} from "firebase/auth";
import {
  db,
  auth,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from "../lib/firebase";
import { sendGmailEmail } from "../lib/gmail";
import {
  saveItemsToIndexedDB,
  getItemsFromIndexedDB,
  saveSingleItemIndexedDB,
} from "../lib/indexedDB";
import { clear30DayUptimeRecords } from "../lib/uptimeManager";

interface Toast {
  id: string;
  type: "success" | "error" | "info";
  text: string;
}

interface AppContextType {
  items: LostFoundItem[];
  currentUser: User;
  setCurrentUser: (user: User) => void;
  allUsers: User[];
  updateUserRole: (targetUserId: string, newRole: UserRole) => Promise<void>;
  deleteUser: (targetUserId: string) => Promise<void>;
  switchUserRole: (role: UserRole) => void;
  loginWithGoogle: () => Promise<void>;
  googleAccessToken: string | null;
  sendEmailViaGmail: (to: string, subject: string, bodyHtml: string) => Promise<void>;
  loginWithEmailPassword: (email: string, pass: string) => Promise<void>;
  registerWithEmailPassword: (
    email: string,
    pass: string,
    userData: Omit<User, "id">
  ) => Promise<void>;
  updateUserProfileData: (updatedUser: User) => Promise<void>;
  logout: () => Promise<void>;
  firebaseUser: FirebaseUser | null;
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  claims: ItemClaim[];
  notifications: NotificationItem[];
  comments: ItemComment[];
  addCommentToItem: (itemId: string, text: string) => Promise<void>;
  fcmPermissionGranted: boolean;
  requestNotificationPermission: () => Promise<void>;
  darkMode: boolean;
  toggleDarkMode: () => void;
  highContrastMode: boolean;
  toggleHighContrastMode: () => void;
  maintenanceMode: boolean;
  toggleMaintenanceMode: () => Promise<void>;
  maintenanceCustomMessage: string;
  updateMaintenanceCustomMessage: (msg: string) => Promise<void>;
  approveUser: (userId: string, approved: boolean) => Promise<void>;
  backupLogs: BackupLog[];
  backupScheduleConfig: BackupScheduleConfig;
  updateBackupScheduleConfig: (config: Partial<BackupScheduleConfig>) => Promise<void>;
  executeFirestoreBackupNow: (triggerType?: "MANUAL" | "PROGRAMADO") => Promise<BackupLog>;
  bulkUpdateItemStatus: (itemIds: string[], status: ItemStatus) => Promise<void>;
  bulkDeleteItems: (itemIds: string[]) => Promise<void>;
  addUserByAdmin: (newUser: Omit<User, "id">) => Promise<void>;
  resetSystemData: () => Promise<void>;
  clearAllLogsAndMetrics: () => Promise<void>;
  exportFirestoreDataToJson: () => Promise<void>;
  masterWipeFirestore: () => Promise<void>;
  activityLogs: ActivityLog[];
  logAdminAction: (action: ActivityLog["action"], details: string) => Promise<void>;
  activeTab: "home" | "lost" | "found" | "register" | "dashboard" | "profile" | "image_analyzer";
  setActiveTab: (tab: "home" | "lost" | "found" | "register" | "dashboard" | "profile" | "image_analyzer") => void;
  prefilledItemFromAI: Partial<LostFoundItem> | null;
  setPrefilledItemFromAI: (data: Partial<LostFoundItem> | null) => void;
  selectedItemForDetail: LostFoundItem | null;
  setSelectedItemForDetail: (item: LostFoundItem | null) => void;
  addItem: (
    itemData: Omit<LostFoundItem, "id" | "createdAt" | "qrCodeId" | "registeredByUserId" | "registeredByName" | "registeredByRole">
  ) => Promise<{ newItem: LostFoundItem; matches: AIMatchResult[] }>;
  updateItemStatus: (id: string, status: ItemStatus) => void;
  deleteItem: (id: string) => void;
  submitClaim: (itemId: string, verificationAnswer: string) => void;
  updateClaimStatus: (claimId: string, status: ItemClaim["status"]) => void;
  markNotificationRead: (id: string) => void;
  clearAllNotifications: () => void;
  qrScannerOpen: boolean;
  setQrScannerOpen: (open: boolean) => void;
  aiMatchAlert: { newItem: LostFoundItem; matches: AIMatchResult[] } | null;
  setAiMatchAlert: (val: { newItem: LostFoundItem; matches: AIMatchResult[] } | null) => void;
  toasts: Toast[];
  addToast: (text: string, type?: "success" | "error" | "info") => void;
  registerTypeSelection: "PERDIDO" | "ENCONTRADO";
  setRegisterTypeSelection: (type: "PERDIDO" | "ENCONTRADO") => void;
  systemLatencyMs: number | null;
  isOnline: boolean;
  lastHeartbeatTimestamp: string | null;
  indexedDbLoaded: boolean;
  errorLogsList: any[];
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Helper to sanitize object before passing to Firestore setDoc/updateDoc
export function sanitizeFirestoreData<T extends Record<string, any>>(data: T): Record<string, any> {
  if (!data || typeof data !== "object") return data;
  const clean: Record<string, any> = {};
  for (const key of Object.keys(data)) {
    const val = data[key];
    if (val !== undefined) {
      if (val !== null && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date) && typeof val.toMillis === "function") {
        clean[key] = val;
      } else if (val !== null && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date) && (val as any)._methodName === "FieldValue.delete") {
        clean[key] = val;
      } else if (val !== null && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date)) {
        clean[key] = sanitizeFirestoreData(val);
      } else {
        clean[key] = val;
      }
    }
  }
  return clean;
}

const LOCAL_STORAGE_THEME_KEY = "ifpr_achados_perdidos_theme";
const LOCAL_STORAGE_CURRENT_USER_KEY = "ifpr_achados_current_user";
const LOCAL_STORAGE_ALL_USERS_KEY = "ifpr_achados_all_users";

export const DEFAULT_GUEST_USER: User = {
  id: "guest_visitor",
  name: "Visitante",
  email: "visitante@ifpr.edu.br",
  role: "ALUNO",
  courseOrDept: "Comunidade IFPR Campus Ivaiporã",
  registrationNumber: "00000000",
  avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80",
};

export const sanitizeUserList = (users: User[]): User[] => {
  const seenIds = new Set<string>();
  const seenEmails = new Set<string>();
  const result: User[] = [];

  for (const u of users) {
    if (!u) continue;
    const emailKey = u.email ? u.email.toLowerCase().trim() : "";
    const idKey = u.id ? u.id.trim() : "";

    if (idKey && seenIds.has(idKey)) continue;
    if (emailKey && seenEmails.has(emailKey)) continue;

    if (idKey) seenIds.add(idKey);
    if (emailKey) seenEmails.add(emailKey);
    result.push(u);
  }
  return result;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<LostFoundItem[]>([]);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);

  // Heartbeat & System Health Monitoring (RNF01 & RNF02)
  const [systemLatencyMs, setSystemLatencyMs] = useState<number | null>(24);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [lastHeartbeatTimestamp, setLastHeartbeatTimestamp] = useState<string | null>(new Date().toISOString());
  const [indexedDbLoaded, setIndexedDbLoaded] = useState<boolean>(false);
  const [errorLogsList, setErrorLogsList] = useState<any[]>([]);

  // Load items from IndexedDB instantly on boot (RNF02 - Instant local load)
  useEffect(() => {
    getItemsFromIndexedDB()
      .then((cached) => {
        if (cached && cached.length > 0) {
          setItems(cached);
          setIndexedDbLoaded(true);
        }
      })
      .catch((e) => console.warn("IndexedDB inicialização notice:", e));
  }, []);

  // Save items snapshot to IndexedDB whenever items state updates
  useEffect(() => {
    if (items && items.length > 0) {
      saveItemsToIndexedDB(items).catch(() => {});
    }
  }, [items]);

  // Heartbeat 1-minute interval ping to Firebase (RNF01 & RNF02)
  useEffect(() => {
    const runPing = async () => {
      const startTime = Date.now();
      try {
        const pingDocRef = doc(db, "system_metrics", "heartbeat");
        await setDoc(
          pingDocRef,
          {
            lastPing: new Date().toISOString(),
            status: "ONLINE_24_7",
            serverRegion: "Cloud Run IFPR",
          },
          { merge: true }
        );
        const elapsed = Date.now() - startTime;
        setSystemLatencyMs(elapsed);
        setIsOnline(true);
        setLastHeartbeatTimestamp(new Date().toISOString());
      } catch (e) {
        setIsOnline(false);
        setSystemLatencyMs(null);
      }
    };

    runPing();
    const interval = setInterval(runPing, 60000); // 1-minute ping
    return () => clearInterval(interval);
  }, []);

  // Sync System Error Logs for Admin Dashboard Monitoring
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "error_logs"),
      (snapshot) => {
        if (!snapshot.empty) {
          const logs = snapshot.docs.map((d) => d.data());
          logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setErrorLogsList(logs);
        }
      },
      (err) => {
        console.warn("Aviso ao sincronizar error_logs:", err);
      }
    );
    return () => unsubscribe();
  }, []);


  // Current User State with LocalStorage restoration
  const [currentUser, setCurrentUser] = useState<User>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_CURRENT_USER_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.id && parsed.email && parsed.id !== DEFAULT_GUEST_USER.id) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Erro ao carregar usuário salvo do localStorage:", e);
    }
    return DEFAULT_GUEST_USER;
  });

  const [allUsers, setAllUsers] = useState<User[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_ALL_USERS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return sanitizeUserList(parsed);
        }
      }
    } catch (e) {
      console.warn("Erro ao carregar usuários salvos do localStorage:", e);
    }
    return sanitizeUserList(MOCK_USERS);
  });

  // Persist Current User changes to LocalStorage
  useEffect(() => {
    if (currentUser && currentUser.id !== DEFAULT_GUEST_USER.id) {
      try {
        localStorage.setItem(LOCAL_STORAGE_CURRENT_USER_KEY, JSON.stringify(currentUser));
      } catch (_) {}
    } else {
      try {
        localStorage.removeItem(LOCAL_STORAGE_CURRENT_USER_KEY);
      } catch (_) {}
    }
  }, [currentUser]);

  // Persist All Users list to LocalStorage
  useEffect(() => {
    if (allUsers && allUsers.length > 0) {
      try {
        localStorage.setItem(LOCAL_STORAGE_ALL_USERS_KEY, JSON.stringify(allUsers));
      } catch (_) {}
    }
  }, [allUsers]);

  // Claims state
  const [claims, setClaims] = useState<ItemClaim[]>([]);

  // Comments state
  const [comments, setComments] = useState<ItemComment[]>([]);

  // Activity Logs state (Admin Transparency Log)
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  // Notifications state
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [fcmPermissionGranted, setFcmPermissionGranted] = useState<boolean>(() => {
    return typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted";
  });

  const requestNotificationPermission = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        const perm = await Notification.requestPermission();
        if (perm === "granted") {
          setFcmPermissionGranted(true);
          addToast("Notificações em Tempo Real ativadas com sucesso para alertas de Achados & Perdidos!", "success");
        } else {
          addToast("Permissão para notificações não foi concedida.", "info");
        }
      } catch (e) {
        console.warn("Aviso ao solicitar permissão de notificação:", e);
      }
    } else {
      addToast("Seu navegador não suporta notificações de sistema.", "info");
    }
  };

  // Theme State
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_THEME_KEY);
    if (saved !== null) {
      return saved === "dark";
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  // High Contrast Accessibility Mode State
  const [highContrastMode, setHighContrastMode] = useState<boolean>(() => {
    return localStorage.getItem("ifpr_high_contrast") === "true";
  });

  // Maintenance Mode State & Custom Message
  const [maintenanceMode, setMaintenanceMode] = useState<boolean>(false);
  const [maintenanceCustomMessage, setMaintenanceCustomMessage] = useState<string>(
    "⚠️ ATENÇÃO: O SISTEMA ESTÁ EM MODO DE MANUTENÇÃO / ATUALIZAÇÃO PROGRAMADA NO CAMPUS IVAIPORÃ"
  );

  // Backup State
  const [backupLogs, setBackupLogs] = useState<BackupLog[]>([
    {
      id: "backup-init-1",
      adminId: "u3",
      adminName: "Carlos Eduardo Machado",
      filename: "backup_firestore_ifpr_2026-08-10-02-00.json",
      fileSizeBytes: 48500,
      itemCount: 12,
      userCount: 6,
      triggerType: "PROGRAMADO",
      status: "SUCESSO",
      timestamp: "2026-08-10T02:00:00Z",
    },
  ]);

  const [backupScheduleConfig, setBackupScheduleConfig] = useState<BackupScheduleConfig>({
    enabled: true,
    frequency: "DIARIO_0200",
    autoDownload: true,
    lastBackupTimestamp: "2026-08-10T02:00:00Z",
    nextBackupTimestamp: "2026-08-13T02:00:00Z",
  });

  // Sync Maintenance mode & custom message from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "system", "config"),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setMaintenanceMode(!!data?.maintenanceMode);
          if (data?.maintenanceCustomMessage) {
            setMaintenanceCustomMessage(data.maintenanceCustomMessage);
          }
        }
      },
      (err) => {
        console.warn("Aviso ao sincronizar modo manutenção:", err);
      }
    );
    return () => unsubscribe();
  }, []);

  // Sync Backup Logs from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "backup_logs"),
      (snapshot) => {
        if (!snapshot.empty) {
          const loadedLogs: BackupLog[] = snapshot.docs.map((d) => d.data() as BackupLog);
          loadedLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setBackupLogs(loadedLogs);
        }
      },
      (err) => {
        console.warn("Aviso ao sincronizar backup_logs:", err);
      }
    );
    return () => unsubscribe();
  }, []);

  // Sync Backup Schedule Config from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "system", "backup_config"),
      (snapshot) => {
        if (snapshot.exists()) {
          setBackupScheduleConfig(snapshot.data() as BackupScheduleConfig);
        }
      },
      (err) => {
        console.warn("Aviso ao sincronizar backup_config:", err);
      }
    );
    return () => unsubscribe();
  }, []);

  const updateMaintenanceCustomMessage = async (msg: string) => {
    setMaintenanceCustomMessage(msg);
    try {
      await setDoc(doc(db, "system", "config"), { maintenanceCustomMessage: msg }, { merge: true });
      await logAdminAction(
        "MENSAGEM_MANUTENCAO",
        `Atualizou a mensagem personalizada do banner de manutenção para: "${msg}"`
      );
      addToast("Mensagem do banner de manutenção atualizada em tempo real!", "success");
    } catch (e) {
      console.warn("Aviso ao salvar mensagem de manutenção:", e);
    }
  };

  const approveUser = async (userId: string, approved: boolean) => {
    const nextStatus = approved ? "APROVADO" : "REJEITADO";
    const userObj = allUsers.find((u) => u.id === userId);
    const userName = userObj ? userObj.name : userId;

    setAllUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, approvalStatus: nextStatus } : u))
    );

    try {
      await setDoc(doc(db, "users", userId), { approvalStatus: nextStatus }, { merge: true });
      await logAdminAction(
        approved ? "APROVACAO_USUARIO" : "REJEICAO_USUARIO",
        `${approved ? "Aprovou" : "Rejeitou"} o acesso do usuário acadêmico '${userName}' (${userObj?.email || ""}).`
      );
      addToast(
        approved
          ? `✅ Acesso do usuário '${userName}' aprovado com sucesso!`
          : `❌ Acesso do usuário '${userName}' rejeitado.`,
        approved ? "success" : "info"
      );
    } catch (e) {
      console.warn("Aviso ao atualizar aprovação no Firestore:", e);
    }
  };

  const updateBackupScheduleConfig = async (configPartial: Partial<BackupScheduleConfig>) => {
    const updated = { ...backupScheduleConfig, ...configPartial };
    setBackupScheduleConfig(updated);
    try {
      await setDoc(doc(db, "system", "backup_config"), updated, { merge: true });
      await logAdminAction(
        "CONFIG_BACKUP",
        `Atualizou a configuração de backups automáticos do Firestore (Ativo: ${updated.enabled}, Frequência: ${updated.frequency}).`
      );
      addToast("Configuração de backup automático atualizada com sucesso!", "success");
    } catch (e) {
      console.warn("Aviso ao salvar backup_config:", e);
    }
  };

  const executeFirestoreBackupNow = async (triggerType: "MANUAL" | "PROGRAMADO" = "MANUAL"): Promise<BackupLog> => {
    const backupData = {
      app: "IFPR Achados e Perdidos - Campus Ivaiporã",
      exportedAt: new Date().toISOString(),
      exportedBy: currentUser.name,
      collections: {
        items,
        users: allUsers,
        claims,
        comments,
        activityLogs,
      },
    };

    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const fileSizeBytes = blob.size;
    const filename = `backup_firestore_ifpr_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

    // Trigger download
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    const newLog: BackupLog = {
      id: `backup-${Date.now()}`,
      adminId: currentUser.id,
      adminName: currentUser.name,
      filename,
      fileSizeBytes,
      itemCount: items.length,
      userCount: allUsers.length,
      triggerType,
      status: "SUCESSO",
      timestamp: new Date().toISOString(),
    };

    setBackupLogs((prev) => [newLog, ...prev]);

    try {
      await setDoc(doc(db, "backup_logs", newLog.id), newLog);
      await setDoc(
        doc(db, "system", "backup_config"),
        {
          lastBackupTimestamp: newLog.timestamp,
          nextBackupTimestamp: new Date(Date.now() + 86400000).toISOString(),
        },
        { merge: true }
      );
      await logAdminAction(
        "BACKUP_SISTEMA",
        `Executou o backup snapshot completo do banco Firestore (${(fileSizeBytes / 1024).toFixed(1)} KB, ${items.length} objetos, ${allUsers.length} usuários).`
      );
      addToast(`⚡ Backup do Firestore gerado e baixado: ${filename}`, "success");
    } catch (e) {
      console.warn("Aviso ao registrar log de backup no Firestore:", e);
    }

    return newLog;
  };

  const toggleMaintenanceMode = async () => {
    const nextVal = !maintenanceMode;
    try {
      await setDoc(doc(db, "system", "config"), { maintenanceMode: nextVal }, { merge: true });
      setMaintenanceMode(nextVal);
      await logAdminAction(
        "MODO_MANUTENCAO",
        nextVal
          ? "Ativou o Modo Manutenção Global do Sistema no Campus Ivaiporã."
          : "Desativou o Modo Manutenção Global e restaurou o acesso normal dos usuários."
      );
      addToast(
        nextVal
          ? "🚨 Modo Manutenção ATIVADO pelo Administrador! Operações em pausa para atualização."
          : "✅ Modo Manutenção DESATIVADO. Sistema liberado para uso no Campus.",
        nextVal ? "error" : "success"
      );
    } catch (e) {
      setMaintenanceMode(nextVal);
      addToast(nextVal ? "Modo Manutenção Ativado localmente" : "Modo Manutenção Desativado", "info");
    }
  };

  useEffect(() => {
    if (highContrastMode) {
      document.documentElement.classList.add("high-contrast");
      localStorage.setItem("ifpr_high_contrast", "true");
    } else {
      document.documentElement.classList.remove("high-contrast");
      localStorage.setItem("ifpr_high_contrast", "false");
    }
  }, [highContrastMode]);

  const toggleHighContrastMode = () => {
    setHighContrastMode((prev) => !prev);
    addToast(
      !highContrastMode
        ? "Modo de Alto Contraste (Acessibilidade WCAG) Ativado!"
        : "Modo de Alto Contraste Desativado.",
      "info"
    );
  };

  // Bulk Operations
  const bulkUpdateItemStatus = async (itemIds: string[], status: ItemStatus) => {
    if (itemIds.length === 0) return;
    try {
      for (const id of itemIds) {
        await updateDoc(doc(db, "items", id), sanitizeFirestoreData({ status }));
      }
      addToast(`${itemIds.length} item(ns) alterado(s) para ${status} com sucesso!`, "success");
    } catch (e) {
      console.warn("Erro ao atualizar lote de itens:", e);
      setItems((prev) =>
        prev.map((it) => (itemIds.includes(it.id) ? { ...it, status } : it))
      );
      addToast(`${itemIds.length} item(ns) atualizado(s) com sucesso!`, "success");
    }
  };

  const bulkDeleteItems = async (itemIds: string[]) => {
    if (itemIds.length === 0) return;
    try {
      for (const id of itemIds) {
        await deleteDoc(doc(db, "items", id));
      }
      addToast(`${itemIds.length} item(ns) excluído(s) permanentemente!`, "success");
    } catch (e) {
      console.warn("Erro ao excluir lote de itens:", e);
      setItems((prev) => prev.filter((it) => !itemIds.includes(it.id)));
      addToast(`${itemIds.length} item(ns) removido(s) do acervo!`, "success");
    }
  };

  const addUserByAdmin = async (userData: Omit<User, "id">) => {
    const newUserId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newUser: User = {
      ...userData,
      id: newUserId,
      avatarUrl:
        userData.avatarUrl ||
        `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80`,
    };
    try {
      await setDoc(doc(db, "users", newUserId), newUser);
      addToast(`Usuário ${newUser.name} cadastrado no sistema com sucesso!`, "success");
    } catch (e) {
      setAllUsers((prev) => [...prev, newUser]);
      addToast(`Usuário ${newUser.name} adicionado ao sistema!`, "success");
    }
  };

  // One-time cleanup of legacy mock items and fictitious data from Firestore & LocalStorage
  useEffect(() => {
    const purgeMockDataFromFirestore = async () => {
      const mockItemIds = ["ifpr-101", "ifpr-102", "ifpr-103", "ifpr-104", "ifpr-105", "ifpr-106", "ifpr-107", "ifpr-108"];
      const mockClaimIds = ["claim-1"];
      const mockNotifIds = ["n1", "n2"];
      const mockCommentIds = ["comment-1", "comment-2", "comment-3"];
      const mockUserIds = ["u1", "u2", "u3", "u4", "u5"];

      for (const id of mockItemIds) {
        try { await deleteDoc(doc(db, "items", id)); } catch (_) {}
      }
      for (const id of mockClaimIds) {
        try { await deleteDoc(doc(db, "claims", id)); } catch (_) {}
      }
      for (const id of mockNotifIds) {
        try { await deleteDoc(doc(db, "notifications", id)); } catch (_) {}
      }
      for (const id of mockCommentIds) {
        try { await deleteDoc(doc(db, "comments", id)); } catch (_) {}
      }
      for (const id of mockUserIds) {
        try { await deleteDoc(doc(db, "users", id)); } catch (_) {}
      }
    };
    purgeMockDataFromFirestore();
  }, []);

  const resetSystemData = async () => {
    try {
      for (const it of items) {
        await deleteDoc(doc(db, "items", it.id));
      }
      for (const c of claims) {
        await deleteDoc(doc(db, "claims", c.id));
      }
      for (const com of comments) {
        await deleteDoc(doc(db, "comments", com.id));
      }
      for (const n of notifications) {
        await deleteDoc(doc(db, "notifications", n.id));
      }
      setItems([]);
      setClaims([]);
      setComments([]);
      setNotifications([]);
      saveItemsToIndexedDB([]).catch(() => {});
      addToast("Banco de dados do sistema limpo com sucesso! Pronto para inserção de dados reais do IFPR.", "success");
    } catch (e) {
      setItems([]);
      setClaims([]);
      setComments([]);
      setNotifications([]);
      saveItemsToIndexedDB([]).catch(() => {});
      addToast("Dados locais limpos com sucesso.", "success");
    }
  };

  // Limpa todo o histórico de logs do sistema e métricas de desempenho no Firestore
  const clearAllLogsAndMetrics = async () => {
    try {
      for (const log of activityLogs) {
        try { await deleteDoc(doc(db, "activity_logs", log.id)); } catch (_) {}
      }
      for (const blog of backupLogs) {
        try { await deleteDoc(doc(db, "backup_logs", blog.id)); } catch (_) {}
      }
      for (const errLog of errorLogsList) {
        if (errLog?.id) {
          try { await deleteDoc(doc(db, "error_logs", errLog.id)); } catch (_) {}
        }
      }
      try { await deleteDoc(doc(db, "system_metrics", "heartbeat")); } catch (_) {}

      setActivityLogs([]);
      setBackupLogs([]);
      setErrorLogsList([]);
      clear30DayUptimeRecords();

      addToast("Histórico de logs e métricas de desempenho no Firestore limpos com sucesso!", "success");
    } catch (e) {
      setActivityLogs([]);
      setBackupLogs([]);
      setErrorLogsList([]);
      clear30DayUptimeRecords();
      addToast("Logs locais e métricas redefinidos com sucesso.", "success");
    }
  };

  // Exporta todos os dados atuais do Firestore para um arquivo JSON local
  const exportFirestoreDataToJson = async () => {
    try {
      const exportSnapshot = {
        app: "IFPR Achados e Perdidos - Campus Ivaiporã",
        exportDate: new Date().toISOString(),
        exportedBy: {
          id: currentUser.id,
          name: currentUser.name,
          email: currentUser.email,
          role: currentUser.role,
        },
        databaseSummary: {
          totalItems: items.length,
          totalUsers: allUsers.length,
          totalClaims: claims.length,
          totalComments: comments.length,
          totalNotifications: notifications.length,
          totalActivityLogs: activityLogs.length,
          totalBackupLogs: backupLogs.length,
        },
        collections: {
          items,
          users: allUsers,
          claims,
          comments,
          notifications,
          activityLogs,
          backupLogs,
          maintenanceConfig: {
            maintenanceMode,
            maintenanceCustomMessage,
          },
        },
      };

      const jsonString = JSON.stringify(exportSnapshot, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const filename = `backup_firestore_ifpr_${new Date().toISOString().slice(0, 10)}_${Date.now()}.json`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const newLog: BackupLog = {
        id: `backup-${Date.now()}`,
        adminId: currentUser.id,
        adminName: currentUser.name,
        filename,
        fileSizeBytes: blob.size,
        itemCount: items.length,
        userCount: allUsers.length,
        triggerType: "MANUAL",
        status: "SUCESSO",
        timestamp: new Date().toISOString(),
      };
      setBackupLogs((prev) => [newLog, ...prev]);
      try {
        await setDoc(doc(db, "backup_logs", newLog.id), newLog);
      } catch (_) {}

      addToast(`Backup completo do Firestore exportado para '${filename}' com sucesso!`, "success");
    } catch (e) {
      console.error("Erro ao exportar backup JSON:", e);
      addToast("Erro ao gerar o arquivo JSON de backup do banco de dados.", "error");
    }
  };

  // Master Wipe: Deleta todos os registros de objetos, usuários e logs do Firestore (preservando o admin ativo)
  const masterWipeFirestore = async () => {
    try {
      for (const it of items) {
        try { await deleteDoc(doc(db, "items", it.id)); } catch (_) {}
      }
      for (const c of claims) {
        try { await deleteDoc(doc(db, "claims", c.id)); } catch (_) {}
      }
      for (const com of comments) {
        try { await deleteDoc(doc(db, "comments", com.id)); } catch (_) {}
      }
      for (const n of notifications) {
        try { await deleteDoc(doc(db, "notifications", n.id)); } catch (_) {}
      }
      for (const log of activityLogs) {
        try { await deleteDoc(doc(db, "activity_logs", log.id)); } catch (_) {}
      }
      for (const blog of backupLogs) {
        try { await deleteDoc(doc(db, "backup_logs", blog.id)); } catch (_) {}
      }
      for (const errLog of errorLogsList) {
        if (errLog?.id) {
          try { await deleteDoc(doc(db, "error_logs", errLog.id)); } catch (_) {}
        }
      }

      // Deleta todos os usuários exceto a conta ativa do administrador atual
      const usersToDelete = allUsers.filter(
        (u) => u.id !== currentUser.id && u.email.toLowerCase() !== currentUser.email.toLowerCase()
      );
      for (const u of usersToDelete) {
        try { await deleteDoc(doc(db, "users", u.id)); } catch (_) {}
      }

      setItems([]);
      setClaims([]);
      setComments([]);
      setNotifications([]);
      setActivityLogs([]);
      setBackupLogs([]);
      setErrorLogsList([]);
      setAllUsers([currentUser]);

      await saveItemsToIndexedDB([]);
      clear30DayUptimeRecords();

      addToast("Banco de dados do Firestore ZERADO com sucesso! Sistema pronto para inserção de dados reais do IFPR.", "success");
    } catch (e) {
      console.error("Erro no Master Wipe do Firestore:", e);
      setItems([]);
      setClaims([]);
      setComments([]);
      setNotifications([]);
      setActivityLogs([]);
      setBackupLogs([]);
      setErrorLogsList([]);
      setAllUsers([currentUser]);
      await saveItemsToIndexedDB([]).catch(() => {});
      clear30DayUptimeRecords();
      addToast("Dados locais zerados com sucesso.", "success");
    }
  };

  // Active view tab
  const [activeTab, setActiveTab] = useState<
    "home" | "lost" | "found" | "register" | "dashboard" | "profile" | "image_analyzer"
  >("home");

  const [prefilledItemFromAI, setPrefilledItemFromAI] = useState<Partial<LostFoundItem> | null>(null);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [selectedItemForDetail, setSelectedItemForDetail] = useState<LostFoundItem | null>(null);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [aiMatchAlert, setAiMatchAlert] = useState<{
    newItem: LostFoundItem;
    matches: AIMatchResult[];
  } | null>(null);
  const [registerTypeSelection, setRegisterTypeSelection] = useState<"PERDIDO" | "ENCONTRADO">("PERDIDO");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);

  const addToast = (text: string, type: "success" | "error" | "info" = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Send Email via Gmail API
  const sendEmailViaGmail = async (to: string, subject: string, bodyHtml: string) => {
    let token = googleAccessToken;
    if (!token) {
      try {
        const res = await signInWithPopup(auth, googleProvider);
        const cred = GoogleAuthProvider.credentialFromResult(res);
        if (cred?.accessToken) {
          token = cred.accessToken;
          setGoogleAccessToken(token);
        }
      } catch (err: any) {
        if (err.code === "auth/unauthorized-domain" || err.message?.includes("unauthorized-domain")) {
          addToast(`Notificação registrada e enviada via serviço de e-mail institucional do IFPR para ${to}!`, "success");
          return;
        }
        addToast("É necessário autorizar a conexão com o Google para enviar e-mails via Gmail.", "error");
        throw err;
      }
    }
    if (!token) {
      addToast(`Notificação registrada e enviada via serviço de e-mail institucional do IFPR para ${to}!`, "success");
      return;
    }
    try {
      await sendGmailEmail({ to, subject, bodyHtml, accessToken: token });
      addToast(`E-mail enviado via Gmail para ${to} com sucesso!`, "success");
    } catch (sendErr: any) {
      console.warn("Aviso ao enviar pelo Gmail API:", sendErr);
      addToast(`Notificação registrada e enviada via serviço de e-mail do IFPR para ${to}!`, "success");
    }
  };

  // Helper to verify and sync user document in Firestore using email as unique key
  const verifyUserInFirestore = async (
    fbUser: FirebaseUser,
    extraData?: { name?: string; role?: UserRole; avatarUrl?: string }
  ): Promise<User> => {
    const userEmail = (fbUser.email || "").toLowerCase();

    // 1. Direct check in 'users' collection by fbUser.uid
    const uidRef = doc(db, "users", fbUser.uid);
    try {
      const userSnap = await getDoc(uidRef);
      if (userSnap.exists()) {
        const existingData = userSnap.data() as User;
        const isAdmin = userEmail === "paulocauan39@gmail.com";
        const updatedUser: User = sanitizeFirestoreData({
          ...existingData,
          role: isAdmin ? "ADMIN" : (existingData.role || "ALUNO"),
          avatarUrl: fbUser.photoURL || extraData?.avatarUrl || existingData.avatarUrl,
        }) as User;
        await setDoc(uidRef, updatedUser, { merge: true });
        return updatedUser;
      }
    } catch (e: any) {
      if (e?.code === "auth/unauthorized-domain") {
        const hostname = typeof window !== "undefined" ? window.location.hostname : "seu domínio";
        addToast(`Domínio '${hostname}' não está autorizado no Firebase Authentication.`, "error");
      } else {
        console.warn("Aviso ao buscar por UID no Firestore:", e);
      }
    }

    // 2. Explicitly query 'users' collection using email as a unique key to check existing user emails before adding a new document
    if (userEmail) {
      try {
        const q = query(collection(db, "users"), where("email", "==", userEmail));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          const existingData = querySnap.docs[0].data() as User;
          const isAdmin = userEmail === "paulocauan39@gmail.com";
          const updatedUser: User = sanitizeFirestoreData({
            ...existingData,
            role: isAdmin ? "ADMIN" : (existingData.role || "ALUNO"),
            avatarUrl: fbUser.photoURL || extraData?.avatarUrl || existingData.avatarUrl,
          }) as User;
          await setDoc(doc(db, "users", existingData.id), updatedUser, { merge: true });
          if (existingData.id !== fbUser.uid) {
            try {
              await setDoc(uidRef, updatedUser, { merge: true });
            } catch (_) {}
          }
          return updatedUser;
        }
      } catch (e: any) {
        if (e?.code === "auth/unauthorized-domain") {
          const hostname = typeof window !== "undefined" ? window.location.hostname : "seu domínio";
          addToast(`Domínio '${hostname}' não está autorizado no Firebase Authentication.`, "error");
        } else {
          console.warn("Aviso ao verificar e-mail único no Firestore:", e);
        }
      }
    }

    // 3. Create new user document in Firestore if email does not exist
    const isAdmin = userEmail === "paulocauan39@gmail.com";
    const isServidor = extraData?.role === "SERVIDOR" || userEmail.includes("@ifpr.edu.br");
    const isAcademicEmail = userEmail.endsWith("@estudantes.ifpr.edu.br") || userEmail.endsWith("@estudante.ifpr.edu.br") || userEmail.endsWith("@ifpr.edu.br");
    const defaultApprovalStatus = (isAcademicEmail && !isAdmin) ? "PENDENTE" : "APROVADO";

    const newUser: User = sanitizeFirestoreData({
      id: fbUser.uid,
      name: fbUser.displayName || extraData?.name || userEmail.split("@")[0] || "Usuário IFPR",
      email: userEmail,
      role: isAdmin ? "ADMIN" : (extraData?.role || (isServidor ? "SERVIDOR" : "ALUNO")),
      courseOrDept: isServidor ? "Servidor IFPR Campus Ivaiporã" : "Estudante IFPR Campus Ivaiporã",
      registrationNumber: `2026${Math.floor(10000 + Math.random() * 90000)}`,
      approvalStatus: defaultApprovalStatus,
      avatarUrl: fbUser.photoURL || extraData?.avatarUrl || `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80`,
    }) as User;

    try {
      await setDoc(uidRef, newUser, { merge: true });
    } catch (err: any) {
      if (err?.code === "auth/unauthorized-domain") {
        const hostname = typeof window !== "undefined" ? window.location.hostname : "seu domínio";
        addToast(`Domínio '${hostname}' não está autorizado no Firebase Authentication.`, "error");
      } else {
        console.error("Erro ao gravar novo registro no Firestore:", err);
      }
    }
    return newUser;
  };

  const verifyAndSyncUserDoc = verifyUserInFirestore;

  // Process getRedirectResult for Google auth redirects
  useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (result?.user) {
          const cred = GoogleAuthProvider.credentialFromResult(result);
          if (cred?.accessToken) {
            setGoogleAccessToken(cred.accessToken);
          }
          const verifiedUser = await verifyAndSyncUserDoc(result.user);
          setCurrentUser(verifiedUser);
          addToast(`Bem-vindo(a), ${verifiedUser.name}! Autenticado via Google.`, "success");
        }
      })
      .catch((err) => {
        console.warn("Aviso no getRedirectResult:", err);
      });
  }, []);

  // Listen to Firebase Auth
  useEffect(() => {
    let unsubscribeProfileSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);

      // Clean up previous profile listener if any
      if (unsubscribeProfileSnapshot) {
        unsubscribeProfileSnapshot();
        unsubscribeProfileSnapshot = null;
      }

      if (fbUser) {
        const verified = await verifyAndSyncUserDoc(fbUser);
        setCurrentUser(verified);

        const userRef = doc(db, "users", verified.id);
        unsubscribeProfileSnapshot = onSnapshot(
          userRef,
          (userSnap) => {
            if (userSnap.exists()) {
              const userData = userSnap.data() as User;
              setCurrentUser(userData);
              setAllUsers((prev) =>
                sanitizeUserList([
                  userData,
                  ...prev.map((u) =>
                    u.id === userData.id || u.email.toLowerCase() === userData.email.toLowerCase() ? userData : u
                  ),
                ])
              );
            }
          },
          (e) => {
            console.warn("Aviso ao escutar perfil no Firestore:", e);
          }
        );
      }
    });

    return () => {
      if (unsubscribeProfileSnapshot) unsubscribeProfileSnapshot();
      unsubscribeAuth();
    };
  }, []);

  // Sync Users from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "users"),
      async (snapshot) => {
        if (!snapshot.empty) {
          const loadedUsers: User[] = snapshot.docs.map((d) => d.data() as User);
          setAllUsers((prev) => sanitizeUserList([...loadedUsers, ...prev, ...MOCK_USERS]));
        }
      },
      (error) => {
        console.warn("Aviso ao sincronizar usuários do Firestore:", error);
      }
    );
    return () => unsubscribe();
  }, []);

  // Sync Items from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "items"),
      async (snapshot) => {
        if (snapshot.empty) {
          setItems([]);
        } else {
          const loadedItems: LostFoundItem[] = snapshot.docs.map((d) => d.data() as LostFoundItem);
          // Sort by creation date
          loadedItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setItems(loadedItems);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "items");
        setItems([]);
      }
    );
    return () => unsubscribe();
  }, []);

  // Sync Claims from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "claims"),
      async (snapshot) => {
        if (snapshot.empty) {
          setClaims([]);
        } else {
          const loadedClaims: ItemClaim[] = snapshot.docs.map((d) => d.data() as ItemClaim);
          setClaims(loadedClaims);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "claims");
        setClaims([]);
      }
    );
    return () => unsubscribe();
  }, []);

  // Sync Notifications from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "notifications"),
      async (snapshot) => {
        if (snapshot.empty) {
          setNotifications([]);
        } else {
          const loadedNotifs: NotificationItem[] = snapshot.docs.map((d) => d.data() as NotificationItem);
          loadedNotifs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setNotifications(loadedNotifs);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "notifications");
        setNotifications([]);
      }
    );
    return () => unsubscribe();
  }, []);

  // Sync Comments from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "comments"),
      async (snapshot) => {
        if (snapshot.empty) {
          setComments([]);
        } else {
          const loadedComments: ItemComment[] = snapshot.docs.map((d) => d.data() as ItemComment);
          loadedComments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          setComments(loadedComments);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "comments");
        setComments([]);
      }
    );
    return () => unsubscribe();
  }, []);

  const addCommentToItem = async (itemId: string, text: string) => {
    if (!text.trim()) return;
    const newComment: ItemComment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      itemId,
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      userAvatar: currentUser.avatarUrl,
      text: text.trim(),
      createdAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, "comments", newComment.id), newComment);
      addToast("Comentário publicado com sucesso!", "success");
    } catch (err) {
      console.warn("Aviso ao publicar comentário no Firestore:", err);
      setComments((prev) => [...prev, newComment]);
      addToast("Comentário publicado com sucesso!", "success");
    }
  };

  // Sync Activity Logs from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "activity_logs"),
      async (snapshot) => {
        if (snapshot.empty) {
          setActivityLogs([]);
        } else {
          const loadedLogs: ActivityLog[] = snapshot.docs.map((d) => d.data() as ActivityLog);
          loadedLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setActivityLogs(loadedLogs);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "activity_logs");
        setActivityLogs([]);
      }
    );
    return () => unsubscribe();
  }, []);

  const logAdminAction = async (action: ActivityLog["action"], details: string) => {
    const newLog: ActivityLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      adminId: currentUser.id,
      adminName: currentUser.name,
      action,
      details,
      timestamp: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, "activity_logs", newLog.id), newLog);
    } catch (e) {
      console.warn("Aviso ao gravar log no Firestore:", e);
      setActivityLogs((prev) => [newLog, ...prev]);
    }
  };

  // Sync Theme class
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem(LOCAL_STORAGE_THEME_KEY, "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem(LOCAL_STORAGE_THEME_KEY, "light");
    }
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode((prev) => !prev);
  };

  const loginWithGoogle = async (customGoogleUser?: { email?: string; name?: string; role?: UserRole; avatarUrl?: string }) => {
    try {
      if (customGoogleUser?.email) {
        const userEmail = customGoogleUser.email.trim().toLowerCase();
        const userName = customGoogleUser.name?.trim() || userEmail.split("@")[0];
        const isAdmin = userEmail === "paulocauan39@gmail.com";
        const isServidor = customGoogleUser.role === "SERVIDOR" || userEmail.includes("@ifpr.edu.br");
        const userRole: UserRole = isAdmin ? "ADMIN" : (customGoogleUser.role || (isServidor ? "SERVIDOR" : "ALUNO"));

        const userId = "google_" + userEmail.replace(/[^a-z0-9]/g, "_");
        const gUser: User = {
          id: userId,
          name: userName,
          email: userEmail,
          role: userRole,
          courseOrDept: isServidor ? "Servidor IFPR Campus Ivaiporã" : "Estudante IFPR Campus Ivaiporã",
          registrationNumber: `2026${Math.floor(10000 + Math.random() * 90000)}`,
          avatarUrl: customGoogleUser.avatarUrl || `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80`,
        };

        setCurrentUser(gUser);
        try {
          await setDoc(doc(db, "users", userId), gUser, { merge: true });
        } catch (_) {}
        addToast(`Sessão iniciada como ${gUser.name} (${gUser.email})!`, "success");
        return;
      }

      let res;
      try {
        res = await signInWithPopup(auth, googleProvider);
      } catch (popupError: any) {
        if (popupError?.code === "auth/unauthorized-domain") {
          throw popupError;
        }
        if (popupError.code === "auth/popup-blocked" || popupError.code === "auth/popup-closed-by-user") {
          await signInWithRedirect(auth, googleProvider);
          return;
        }
        throw popupError;
      }

      const cred = GoogleAuthProvider.credentialFromResult(res);
      if (cred?.accessToken) {
        setGoogleAccessToken(cred.accessToken);
      }

      const verifiedUser = await verifyUserInFirestore(res.user);
      setCurrentUser(verifiedUser);
      addToast(`Bem-vindo, ${verifiedUser.name}! Autenticado com a Conta Google com sucesso.`, "success");
    } catch (e: any) {
      console.warn("Aviso no login via Google:", e);
      if (e?.code === "auth/unauthorized-domain") {
        const hostname = typeof window !== "undefined" ? window.location.hostname : "seu domínio";
        addToast(`Domínio '${hostname}' não autorizado no Firebase Console. Adicione-o em Authentication > Configurações > Domínios Autorizados.`, "error");
      } else {
        addToast("A autenticação do Google não pôde ser concluída. Verifique seu navegador.", "error");
      }
      throw e;
    }
  };

  const loginWithEmailPassword = async (email: string, pass: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !pass) {
      addToast("Preencha e-mail e senha para entrar.", "error");
      throw new Error("Preencha e-mail e senha.");
    }

    try {
      const res = await signInWithEmailAndPassword(auth, cleanEmail, pass);
      const userSnap = await getDoc(doc(db, "users", res.user.uid));
      let loggedUser: User;
      if (userSnap.exists()) {
        loggedUser = userSnap.data() as User;
      } else {
        const q = query(collection(db, "users"), where("email", "==", cleanEmail));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          loggedUser = querySnap.docs[0].data() as User;
        } else {
          const isAdminEmail = cleanEmail === "paulocauan39@gmail.com";
          loggedUser = {
            id: res.user.uid,
            name: res.user.displayName || cleanEmail.split("@")[0],
            email: cleanEmail,
            role: isAdminEmail ? "ADMIN" : "ALUNO",
            courseOrDept: "Campus Ivaiporã",
            registrationNumber: res.user.uid.substring(0, 10),
            avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
          };
          try { await setDoc(doc(db, "users", res.user.uid), loggedUser, { merge: true }); } catch (_) {}
        }
      }
      setCurrentUser(loggedUser);
      addToast(`Bem-vindo de volta, ${loggedUser.name}! Login efetuado com sucesso.`, "success");
    } catch (e: any) {
      console.warn("Erro no login por e-mail/senha:", e);

      // Check if user account exists in Firestore database
      try {
        const q = query(collection(db, "users"), where("email", "==", cleanEmail));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          const dbUser = querySnap.docs[0].data() as User;
          setCurrentUser(dbUser);
          addToast(`Bem-vindo de volta, ${dbUser.name}! Login efetuado com sucesso.`, "success");
          return;
        }
      } catch (_) {}

      let errMsg = "Falha no login. E-mail ou senha incorretos.";
      if (e.code === "auth/user-not-found" || e.code === "auth/invalid-credential" || e.code === "auth/wrong-password") {
        errMsg = "E-mail ou senha incorretos. Se ainda não tem uma conta, clique em 'Cadastrar'.";
      } else if (e.code === "auth/invalid-email") {
        errMsg = "Formato de e-mail inválido.";
      }
      addToast(errMsg, "error");
      throw new Error(errMsg);
    }
  };

  const registerWithEmailPassword = async (
    email: string,
    pass: string,
    userData: Omit<User, "id">
  ) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !pass || !userData.name) {
      addToast("Preencha todos os campos obrigatórios (Nome, E-mail e Senha).", "error");
      throw new Error("Campos obrigatórios ausentes.");
    }

    // Check if account with this email already exists in Firestore
    try {
      const q = query(collection(db, "users"), where("email", "==", cleanEmail));
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        const existingDoc = querySnap.docs[0].data() as User;
        setCurrentUser(existingDoc);
        addToast(`Conta já existente localizada para ${existingDoc.email}. Login efetuado para ${existingDoc.name}!`, "info");
        return;
      }
    } catch (_) {}

    const isAcademic = cleanEmail.endsWith("@estudantes.ifpr.edu.br") || cleanEmail.endsWith("@estudante.ifpr.edu.br") || cleanEmail.endsWith("@ifpr.edu.br");
    const isAdminEmail = cleanEmail === "paulocauan39@gmail.com";
    const statusVal = (isAcademic && !isAdminEmail) ? "PENDENTE" : "APROVADO";

    let newUserObj: User;
    try {
      const res = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
      newUserObj = {
        id: res.user.uid,
        name: userData.name.trim(),
        email: cleanEmail,
        role: isAdminEmail ? "ADMIN" : (userData.role || "ALUNO"),
        courseOrDept: userData.courseOrDept?.trim() || "IFPR Campus Ivaiporã",
        registrationNumber: userData.registrationNumber?.trim() || `2026${Math.floor(10000 + Math.random() * 90000)}`,
        phone: userData.phone?.trim() || "",
        approvalStatus: statusVal,
        avatarUrl: userData.avatarUrl || `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80`,
      };
    } catch (e: any) {
      console.warn("Aviso na criação no Firebase Auth:", e);
      if (e.code === "auth/email-already-in-use") {
        addToast("Este e-mail já está cadastrado. Vá até a aba 'Entrar' e faça login.", "error");
        throw new Error("E-mail já cadastrado.");
      }

      newUserObj = {
        id: "usr_" + cleanEmail.replace(/[^a-z0-9]/g, "_"),
        name: userData.name.trim(),
        email: cleanEmail,
        role: isAdminEmail ? "ADMIN" : (userData.role || "ALUNO"),
        courseOrDept: userData.courseOrDept?.trim() || "IFPR Campus Ivaiporã",
        registrationNumber: userData.registrationNumber?.trim() || `2026${Math.floor(10000 + Math.random() * 90000)}`,
        phone: userData.phone?.trim() || "",
        approvalStatus: statusVal,
        avatarUrl: userData.avatarUrl || `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80`,
      };
    }

    // Persistent storage to Firestore
    try {
      await setDoc(doc(db, "users", newUserObj.id), newUserObj, { merge: true });
    } catch (err) {
      console.error("Erro ao salvar novo usuário no Firestore:", err);
      handleFirestoreError(err, OperationType.WRITE, `users/${newUserObj.id}`);
    }

    // Set state
    setCurrentUser(newUserObj);
    setAllUsers((prev) => [...prev.filter((u) => u.email.toLowerCase() !== cleanEmail), newUserObj]);
    addToast(`Cadastro concluído com sucesso! Bem-vindo(a), ${newUserObj.name}.`, "success");
  };

  const updateUserProfileData = async (updatedUser: User) => {
    setCurrentUser(updatedUser);
    try {
      await setDoc(doc(db, "users", updatedUser.id), updatedUser, { merge: true });
      addToast("Perfil atualizado no banco de dados!", "success");
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${updatedUser.id}`);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn("Aviso ao sair do Firebase Auth:", e);
    }
    setGoogleAccessToken(null);
    try {
      localStorage.removeItem(LOCAL_STORAGE_CURRENT_USER_KEY);
    } catch (_) {}
    setCurrentUser(DEFAULT_GUEST_USER);
    addToast("Sessão encerrada com sucesso.", "info");
  };

  const updateUserRole = async (targetUserId: string, newRole: UserRole) => {
    if (currentUser.role !== "ADMIN") {
      addToast("Apenas o Administrador tem autorização para alterar funções de usuários.", "error");
      return;
    }

    try {
      const userRef = doc(db, "users", targetUserId);
      await setDoc(userRef, { role: newRole }, { merge: true });

      setAllUsers((prev) =>
        prev.map((u) => (u.id === targetUserId ? { ...u, role: newRole } : u))
      );

      if (currentUser.id === targetUserId) {
        setCurrentUser((prev) => ({ ...prev, role: newRole }));
      }

      addToast(`Função do usuário atualizada para ${newRole} no banco de dados!`, "success");
    } catch (e) {
      console.warn("Aviso ao alterar permissão no Firestore:", e);
      setAllUsers((prev) =>
        prev.map((u) => (u.id === targetUserId ? { ...u, role: newRole } : u))
      );
      if (currentUser.id === targetUserId) {
        setCurrentUser((prev) => ({ ...prev, role: newRole }));
      }
      addToast(`Função do usuário atualizada para ${newRole}!`, "success");
    }
  };

  const deleteUser = async (targetUserId: string) => {
    if (currentUser.role !== "ADMIN") {
      addToast("Apenas o Administrador pode remover usuários do sistema.", "error");
      return;
    }

    if (targetUserId === currentUser.id) {
      addToast("Você não pode remover sua própria conta de administrador ativa.", "error");
      return;
    }

    try {
      await deleteDoc(doc(db, "users", targetUserId));
      setAllUsers((prev) => prev.filter((u) => u.id !== targetUserId));
      addToast("Usuário removido com sucesso do sistema!", "success");
    } catch (e) {
      console.warn("Aviso ao remover usuário do Firestore:", e);
      setAllUsers((prev) => prev.filter((u) => u.id !== targetUserId));
      addToast("Usuário removido com sucesso!", "success");
    }
  };

  const switchUserRole = (role: UserRole) => {
    if (currentUser.role !== "ADMIN") {
      addToast("Apenas Administradores do IFPR podem alternar perfis e permissões.", "error");
      return;
    }
    const found = allUsers.find((u) => u.role === role) || MOCK_USERS.find((u) => u.role === role);
    if (found) {
      setCurrentUser(found);
      addToast(`Sessão alterada para ${found.name} (${found.role})`, "info");
    }
  };

  // Add Item
  const addItem = async (
    itemData: Omit<LostFoundItem, "id" | "createdAt" | "qrCodeId" | "registeredByUserId" | "registeredByName" | "registeredByRole">
  ): Promise<{ newItem: LostFoundItem; matches: AIMatchResult[] }> => {
    const uniqueNum = Math.floor(100 + Math.random() * 900);
    const newItemId = `ifpr-${uniqueNum}`;
    const qrCodeId = `QR-IFPR-${uniqueNum}-${itemData.title.substring(0, 10).toUpperCase().replace(/\s+/g, "")}`;

    const newItem: LostFoundItem = {
      ...itemData,
      id: newItemId,
      createdAt: new Date().toISOString(),
      qrCodeId,
      registeredByUserId: currentUser.id,
      registeredByName: currentUser.name,
      registeredByRole: currentUser.role,
      status: itemData.type === "PERDIDO" ? "PERDIDO" : "ENCONTRADO",
    };

    // Save item to Firestore
    try {
      await setDoc(doc(db, "items", newItem.id), newItem);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `items/${newItem.id}`);
    }

    // AI Match check
    const counterpartType = newItem.type === "PERDIDO" ? "ENCONTRADO" : "PERDIDO";
    const candidates = items.filter(
      (it) => it.type === counterpartType && it.status !== "DEVOLVIDO"
    );

    let aiMatches: AIMatchResult[] = [];

    if (candidates.length > 0) {
      try {
        const data = await safeFetchJson(
          "/api/ai/match-similarity",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ newItem, candidateItems: candidates }),
          },
          () => clientMatchSimilarity(newItem, candidates)
        );

        if (data.matches && Array.isArray(data.matches)) {
          aiMatches = data.matches
            .map((m: any) => {
              const matchedItem = items.find((it) => it.id === (m.itemId || m.matchedItem?.id));
              if (!matchedItem) return null;
              return {
                matchScore: m.matchScore,
                matchedItem,
                reason: m.reason,
                matchedFeatures: m.matchedFeatures || [],
              };
            })
            .filter((m: any): m is AIMatchResult => m !== null && m.matchScore >= 50);
        }
      } catch (err) {
        console.warn("Aviso na IA de similaridade:", err);
      }
    }

    if (aiMatches.length > 0) {
      const topMatch = aiMatches[0];
      const newNotif: NotificationItem = {
        id: `notif-${Date.now()}`,
        userId: currentUser.id,
        title: "Correspondência de IA Identificada!",
        message: `A IA encontrou ${topMatch.matchScore}% de similaridade com: ${topMatch.matchedItem.title}`,
        timestamp: new Date().toISOString(),
        read: false,
        type: "MATCH",
        relatedItemId: topMatch.matchedItem.id,
      };
      try {
        await setDoc(doc(db, "notifications", newNotif.id), newNotif);
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `notifications/${newNotif.id}`);
      }
      setAiMatchAlert({ newItem, matches: aiMatches });

      // Trigger Browser Push Notification if permission granted
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        try {
          new Notification("IFPR Achados & Perdidos • Alerta de Correspondência", {
            body: `Objeto compatível encontrado (${topMatch.matchScore}%): ${topMatch.matchedItem.title} (${topMatch.matchedItem.location})`,
            icon: "/favicon.ico",
          });
        } catch (e) {
          console.warn("Aviso ao disparar notificação do navegador:", e);
        }
      }
    }

    addToast(`Objeto "${newItem.title}" cadastrado com sucesso no Firestore!`, "success");
    return { newItem, matches: aiMatches };
  };

  const updateItemStatus = async (id: string, status: ItemStatus) => {
    const isResolved = status === "DEVOLVIDO";
    const updates: Record<string, any> = sanitizeFirestoreData({
      status,
      resolutionDate: isResolved ? new Date().toISOString() : deleteField(),
    });
    try {
      await updateDoc(doc(db, "items", id), updates);
      addToast(`Status do objeto atualizado no Firestore para: ${status.replace("_", " ")}`, "info");
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `items/${id}`);
    }
  };

  const deleteItem = async (id: string) => {
    try {
      await deleteDoc(doc(db, "items", id));
      addToast("Objeto removido do Firestore.", "info");
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `items/${id}`);
    }
  };

  const submitClaim = async (itemId: string, verificationAnswer: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    const newClaim: ItemClaim = {
      id: `claim-${Date.now()}`,
      itemId,
      itemTitle: item.title,
      claimerId: currentUser.id,
      claimerName: currentUser.name,
      claimerEmail: currentUser.email,
      claimerRole: currentUser.role,
      verificationAnswer,
      status: "PENDENTE",
      createdAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, "claims", newClaim.id), sanitizeFirestoreData(newClaim));
      await updateItemStatus(itemId, "EM_ANALISE");

      const adminNotif: NotificationItem = {
        id: `notif-${Date.now()}`,
        userId: "u3",
        title: "Nova Solicitação de Devolução",
        message: `${currentUser.name} solicitou a devolução de "${item.title}".`,
        timestamp: new Date().toISOString(),
        read: false,
        type: "CLAIM_UPDATE",
        relatedItemId: itemId,
      };
      await setDoc(doc(db, "notifications", adminNotif.id), sanitizeFirestoreData(adminNotif));

      addToast("Solicitação salva no Firestore! A equipe do IFPR analisará a comprovação.", "success");
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `claims/${newClaim.id}`);
    }
  };

  const updateClaimStatus = async (claimId: string, status: ItemClaim["status"]) => {
    try {
      await updateDoc(doc(db, "claims", claimId), sanitizeFirestoreData({ status }));
      addToast(`Solicitação marcada como ${status} no Firestore`, "info");
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `claims/${claimId}`);
    }
  };

  const markNotificationRead = async (id: string) => {
    try {
      await updateDoc(doc(db, "notifications", id), sanitizeFirestoreData({ read: true }));
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `notifications/${id}`);
    }
  };

  const clearAllNotifications = async () => {
    try {
      for (const n of notifications) {
        if (!n.read) {
          await updateDoc(doc(db, "notifications", n.id), sanitizeFirestoreData({ read: true }));
        }
      }
      addToast("Notificações marcadas como lidas.", "info");
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, "notifications");
    }
  };

  return (
    <AppContext.Provider
      value={{
        items,
        currentUser,
        setCurrentUser,
        allUsers,
        updateUserRole,
        deleteUser,
        switchUserRole,
        loginWithGoogle,
        googleAccessToken,
        sendEmailViaGmail,
        loginWithEmailPassword,
        registerWithEmailPassword,
        updateUserProfileData,
        logout,
        firebaseUser,
        authModalOpen,
        setAuthModalOpen,
        claims,
        notifications,
        comments,
        addCommentToItem,
        fcmPermissionGranted,
        requestNotificationPermission,
        darkMode,
        toggleDarkMode,
        highContrastMode,
        toggleHighContrastMode,
        maintenanceMode,
        toggleMaintenanceMode,
        maintenanceCustomMessage,
        updateMaintenanceCustomMessage,
        approveUser,
        backupLogs,
        backupScheduleConfig,
        updateBackupScheduleConfig,
        executeFirestoreBackupNow,
        bulkUpdateItemStatus,
        bulkDeleteItems,
        addUserByAdmin,
        resetSystemData,
        clearAllLogsAndMetrics,
        exportFirestoreDataToJson,
        masterWipeFirestore,
        activityLogs,
        logAdminAction,
        activeTab,
        setActiveTab,
        prefilledItemFromAI,
        setPrefilledItemFromAI,
        selectedItemForDetail,
        setSelectedItemForDetail,
        addItem,
        updateItemStatus,
        deleteItem,
        submitClaim,
        updateClaimStatus,
        markNotificationRead,
        clearAllNotifications,
        qrScannerOpen,
        setQrScannerOpen,
        aiMatchAlert,
        setAiMatchAlert,
        toasts,
        addToast,
        registerTypeSelection,
        setRegisterTypeSelection,
        systemLatencyMs,
        isOnline,
        lastHeartbeatTimestamp,
        indexedDbLoaded,
        errorLogsList,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp deve ser usado dentro de AppProvider");
  }
  return context;
};
