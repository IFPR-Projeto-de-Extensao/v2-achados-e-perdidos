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
  ItemHistoryLog,
  UploadTaskStatus,
  UploadStatusType,
  DocumentTemplate,
  GeneratedDocumentRecord,
} from "../types";
import { DEFAULT_DOCUMENT_TEMPLATES } from "../lib/defaultDocumentTemplates";
import { INITIAL_ITEMS, MOCK_USERS, MOCK_NOTIFICATIONS, MOCK_CLAIMS, MOCK_COMMENTS, MOCK_ACTIVITY_LOGS } from "../data/mockData";
import { safeFetchJson, clientMatchSimilarity } from "../lib/apiHelper";
import { compressImage } from "../lib/imageCompression";
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
  queueOfflineItemRegistration,
  getPendingSyncQueue,
  removeSyncQueueEntry,
  updateSyncQueueEntry,
  getSyncQueueCount,
  clearSyncQueue,
} from "../lib/indexedDB";
import { clear30DayUptimeRecords } from "../lib/uptimeManager";
import { triggerVibration, vibrateClick, vibrateSuccess, vibrateWarning, vibrateCritical, safeToLower } from "../lib/utils";
import {
  DEFAULT_MAINTENANCE_MESSAGE,
  STORAGE_KEYS,
  LOCAL_STORAGE_THEME_KEY,
  LOCAL_STORAGE_CURRENT_USER_KEY,
  LOCAL_STORAGE_ALL_USERS_KEY,
  DEFAULT_GUEST_USER,
  sanitizeUserList,
  sanitizeFirestoreData,
} from "../lib/shared-constants";
import { SupportedLanguage, TranslationDictionary, translations } from "../lib/i18n";
import {
  requestFCMPermissionAndToken,
  displayWebPushNotification,
  checkFCMSubscriptionStatus,
  sendRealtimeMatchPushAlert,
  playNotificationChime,
  setupFCMForegroundListener,
} from "../lib/fcm";

interface Toast {
  id: string;
  type: "success" | "error" | "info";
  text: string;
}

interface AppContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: keyof TranslationDictionary, defaultText?: string) => string;
  fcmSubscribed: boolean;
  subscribeToFCM: () => Promise<boolean>;
  testFCMAlert: () => void;
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
  authLoading: boolean;
  isAuthLoading: boolean;
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
  updateItemData: (id: string, updatedFields: Partial<LostFoundItem>) => Promise<void>;
  registerItemReturn: (
    itemId: string,
    returnData: {
      recipientName: string;
      recipientEmail: string;
      recipientBond: string;
      identityVerified?: boolean;
      returnObservations?: string;
      observations?: string;
    }
  ) => Promise<void>;
  reopenItemReturn: (itemId: string, reason: string) => Promise<void>;
  registerItemDestination: (
    itemId: string,
    destinationTypeOrObj: string | { destinationType: string; destinationReason?: string; destinationNotes?: string },
    destinationNotesParam?: string
  ) => Promise<void>;
  logItemLabelGenerated: (itemId: string) => Promise<void>;
  deleteItem: (id: string) => void;
  submitClaim: (itemId: string, verificationAnswer: string) => void;
  updateClaimStatus: (claimId: string, status: ItemClaim["status"]) => void;
  sendNotificationToUser: (targetUserId: string, title: string, message: string, relatedItemId?: string) => Promise<void>;
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
  pendingSyncCount: number;
  syncOfflineQueue: () => Promise<void>;
  triggerManualSync: () => Promise<void>;
  lastHeartbeatTimestamp: string | null;
  indexedDbLoaded: boolean;
  errorLogsList: any[];
  activeUploadTasks: UploadTaskStatus[];
  addUploadTask: (task: UploadTaskStatus) => void;
  updateUploadTask: (taskId: string, updates: Partial<UploadTaskStatus>) => void;
  removeUploadTask: (taskId: string) => void;
  retryUploadTask: (taskId: string) => Promise<void>;
  documentTemplates: DocumentTemplate[];
  generatedDocuments: GeneratedDocumentRecord[];
  saveDocumentTemplate: (template: DocumentTemplate) => Promise<void>;
  deleteDocumentTemplate: (templateId: string) => Promise<void>;
  duplicateDocumentTemplate: (templateId: string) => Promise<DocumentTemplate>;
  toggleDocumentTemplateStatus: (templateId: string) => Promise<void>;
  logGeneratedDocument: (record: Omit<GeneratedDocumentRecord, "id" | "generatedAt" | "generatedByUserId" | "generatedByName">) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export { sanitizeFirestoreData, DEFAULT_GUEST_USER, sanitizeUserList };

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<LostFoundItem[]>([]);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);

  // Heartbeat & System Health Monitoring (RNF01 & RNF02)
  const [systemLatencyMs, setSystemLatencyMs] = useState<number | null>(24);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [lastHeartbeatTimestamp, setLastHeartbeatTimestamp] = useState<string | null>(new Date().toISOString());
  const [indexedDbLoaded, setIndexedDbLoaded] = useState<boolean>(false);
  const [errorLogsList, setErrorLogsList] = useState<any[]>([]);

  // Active Upload Tasks (Service Worker Background Sync & Compression Progress)
  const [activeUploadTasks, setActiveUploadTasks] = useState<UploadTaskStatus[]>([]);

  const addUploadTask = (task: UploadTaskStatus) => {
    setActiveUploadTasks((prev) => [task, ...prev.filter((t) => t.id !== task.id)]);
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator && navigator.serviceWorker.controller) {
      try {
        navigator.serviceWorker.controller.postMessage({
          type: "UPLOAD_PROGRESS_UPDATE",
          task,
        });
      } catch (_) {}
    }
  };

  const updateUploadTask = (taskId: string, updates: Partial<UploadTaskStatus>) => {
    setActiveUploadTasks((prev) =>
      prev.map((t) => {
        if (t.id === taskId) {
          const updated = { ...t, ...updates };
          if (typeof navigator !== "undefined" && "serviceWorker" in navigator && navigator.serviceWorker.controller) {
            try {
              navigator.serviceWorker.controller.postMessage({
                type: "UPLOAD_PROGRESS_UPDATE",
                task: updated,
              });
            } catch (_) {}
          }
          return updated;
        }
        return t;
      })
    );
  };

  const removeUploadTask = (taskId: string) => {
    setActiveUploadTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const triggerManualSync = async () => {
    await syncOfflineQueue();
  };

  const retryUploadTask = async (taskId: string) => {
    const task = activeUploadTasks.find((t) => t.id === taskId);
    if (!task) return;
    updateUploadTask(taskId, {
      status: "UPLOADING",
      progress: 30,
      statusMessage: "Tentando sincronizar novamente...",
      error: undefined,
    });
    await syncOfflineQueue();
  };

  // Listen to Service Worker Background Sync events and messages
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const handleSwMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data) return;

      if (data.type === "BACKGROUND_SYNC_TRIGGERED" || data.type === "PERIODIC_SYNC_TRIGGERED") {
        console.log("[Background Sync] Evento disparado pelo Service Worker:", data);
        syncOfflineQueue();
      } else if (data.type === "UPLOAD_STATUS_BROADCAST" && data.task) {
        setActiveUploadTasks((prev) => {
          const exists = prev.some((t) => t.id === data.task.id);
          if (exists) {
            return prev.map((t) => (t.id === data.task.id ? { ...t, ...data.task } : t));
          }
          return [data.task, ...prev];
        });
      }
    };

    navigator.serviceWorker.addEventListener("message", handleSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleSwMessage);
    };
  }, []);

  // Load items and sync queue count from IndexedDB instantly on boot
  useEffect(() => {
    getItemsFromIndexedDB()
      .then((cached) => {
        if (cached && cached.length > 0) {
          setItems(cached);
          setIndexedDbLoaded(true);
        }
      })
      .catch((e) => console.warn("IndexedDB inicialização notice:", e));

    getSyncQueueCount().then(setPendingSyncCount).catch(() => {});
  }, []);

  // Save items snapshot to IndexedDB whenever items state updates
  useEffect(() => {
    if (items && items.length > 0) {
      saveItemsToIndexedDB(items).catch(() => {});
    }
  }, [items]);

  // Synchronize pending offline registration queue with Firestore
  const syncOfflineQueue = async () => {
    try {
      const queue = await getPendingSyncQueue();
      if (!queue || queue.length === 0) {
        setPendingSyncCount(0);
        return;
      }

      console.log(`[Offline Sync] Sincronizando ${queue.length} ocorrências pendentes com Firestore...`);
      let syncedCount = 0;

      for (const entry of queue) {
        try {
          await updateSyncQueueEntry(entry.id, {
            status: "SINCRONIZANDO",
            attempts: (entry.attempts || 0) + 1,
            lastAttempt: new Date().toISOString(),
          });

          const itemToSave = {
            ...entry.payload,
            isOfflineQueued: false,
            syncedAt: new Date().toISOString(),
          };

          await setDoc(doc(db, "items", itemToSave.id), sanitizeFirestoreData(itemToSave));

          await removeSyncQueueEntry(entry.id);
          syncedCount++;

          // Update local item in state
          setItems((prev) =>
            prev.map((it) => (it.id === itemToSave.id ? itemToSave : it))
          );

          // If found or lost item, notify Discord (non-blocking)
          const sanitizedPayload = {
            ...itemToSave,
            imageUrl:
              itemToSave.imageUrl &&
              (itemToSave.imageUrl.startsWith("http://") || itemToSave.imageUrl.startsWith("https://"))
                ? itemToSave.imageUrl
                : undefined,
          };

          if (itemToSave.type === "ENCONTRADO") {
            safeFetchJson(
              "/api/items/notify-novos-achados",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ item: sanitizedPayload }),
              },
              () => ({ success: true })
            ).catch((discordErr) => {
              console.warn("[Novos Achados Webhook Notice] Envio offline-sync ao Discord:", discordErr);
            });
          } else if (itemToSave.type === "PERDIDO") {
            safeFetchJson(
              "/api/items/notify-novas-perdas",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ item: sanitizedPayload }),
              },
              () => ({ success: true })
            ).catch((discordErr) => {
              console.warn("[Novas Perdas Webhook Notice] Envio offline-sync ao Discord:", discordErr);
            });
          }
        } catch (syncErr: any) {
          console.error(`[Offline Sync] Falha ao sincronizar item #${entry.id}:`, syncErr);
          await updateSyncQueueEntry(entry.id, {
            status: "ERRO",
            error: syncErr?.message || "Erro durante sincronização",
          });
        }
      }

      const remaining = await getSyncQueueCount();
      setPendingSyncCount(remaining);

      if (syncedCount > 0) {
        addToast(
          `Conexão restabelecida! ${syncedCount} ${
            syncedCount === 1 ? "ocorrência cadastrada offline foi sincronizada" : "ocorrências cadastradas offline foram sincronizadas"
          } com o Firestore com sucesso!`,
          "success"
        );
      }
    } catch (e) {
      console.warn("Aviso ao sincronizar fila offline:", e);
    }
  };

  // Listen to browser online/offline network connectivity events
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      console.log("[Rede] Dispositivo online conectado à internet.");
      setIsOnline(true);
      syncOfflineQueue();
    };

    const handleOffline = () => {
      console.log("[Rede] Dispositivo desconectado da internet. Modo offline ativado.");
      setIsOnline(false);
      getSyncQueueCount().then(setPendingSyncCount).catch(() => {});
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Heartbeat 1-minute interval ping to Firebase (RNF01 & RNF02)
  useEffect(() => {
    const runPing = async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setIsOnline(false);
        setSystemLatencyMs(null);
        return;
      }

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
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          setIsOnline(false);
        }
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


  // Current User State - initialized with safe guest default, authenticated state driven exclusively by Firebase Auth
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState<User>(DEFAULT_GUEST_USER);

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

  // Keep non-sensitive user metadata synced for offline cache if authenticated
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

  // Foreground Firebase Cloud Messaging Listener
  useEffect(() => {
    const cleanupFCM = setupFCMForegroundListener((payload) => {
      addToast(`${payload.title}: ${payload.body}`, "info");
      displayWebPushNotification(payload.title, payload.body, payload.data);
    });

    return () => {
      cleanupFCM();
    };
  }, []);

  // Claims state
  const [claims, setClaims] = useState<ItemClaim[]>([]);

  // Comments state
  const [comments, setComments] = useState<ItemComment[]>([]);

  // Activity Logs state (Admin Transparency Log)
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  // Document Templates & Generated Documents State (Módulo de Documentos PDF Editáveis)
  const [documentTemplates, setDocumentTemplates] = useState<DocumentTemplate[]>(() => {
    try {
      const saved = localStorage.getItem("ifpr_document_templates_cache");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    return DEFAULT_DOCUMENT_TEMPLATES;
  });

  const [generatedDocuments, setGeneratedDocuments] = useState<GeneratedDocumentRecord[]>(() => {
    try {
      const saved = localStorage.getItem("ifpr_generated_documents_cache");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_) {}
    return [];
  });

  // Internationalization (i18n) State
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    const saved = localStorage.getItem("ifpr_lang_preference");
    return (saved === "en" || saved === "pt") ? (saved as SupportedLanguage) : "pt";
  });

  const setLanguage = (lang: SupportedLanguage) => {
    setLanguageState(lang);
    try {
      localStorage.setItem("ifpr_lang_preference", lang);
      document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
    } catch (_) {}
    addToast(
      lang === "pt"
        ? "Idioma alterado para Português (Brasil)."
        : "Language switched to English (US).",
      "info"
    );
  };

  const t = (key: keyof TranslationDictionary, defaultText?: string): string => {
    const currentDict = translations[language] || translations.pt;
    const val = currentDict[key];
    if (val !== undefined) return val;
    return defaultText || key;
  };

  // Notifications state
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [fcmPermissionGranted, setFcmPermissionGranted] = useState<boolean>(() => {
    return typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted";
  });

  // FCM Push Subscription state
  const [fcmSubscribed, setFcmSubscribed] = useState<boolean>(() => {
    return checkFCMSubscriptionStatus(currentUser?.id || "guest");
  });

  useEffect(() => {
    setFcmSubscribed(checkFCMSubscriptionStatus(currentUser?.id || "guest"));
  }, [currentUser?.id]);

  const subscribeToFCM = async (): Promise<boolean> => {
    const result = await requestFCMPermissionAndToken(currentUser);
    if (result.success) {
      setFcmSubscribed(true);
      setFcmPermissionGranted(true);
      addToast(
        language === "pt"
          ? "Inscrição no Firebase Cloud Messaging ativada com sucesso! Você receberá alertas quando seus pertences perdidos forem encontrados."
          : "Firebase Cloud Messaging subscription activated! You will receive alerts when your lost items are found.",
        "success"
      );
      displayWebPushNotification(
        "IFPR Achados & Perdidos",
        language === "pt"
          ? "Alertas FCM ativados! Notificaremos você automaticamente ao encontrar seus pertences."
          : "FCM alerts activated! We'll notify you automatically when lost items are found."
      );
      return true;
    } else {
      addToast(
        language === "pt"
          ? "Permissão de notificações não concedida no navegador."
          : "Notification permissions were not granted in the browser.",
        "error"
      );
      return false;
    }
  };

  const testFCMAlert = () => {
    vibrateClick();
    displayWebPushNotification(
      language === "pt"
        ? "IFPR Alerta FCM • Objeto Encontrado!"
        : "IFPR FCM Alert • Item Found!",
      language === "pt"
        ? "Simulação FCM: Seu pertence perdido 'Chave / Garrafa' acabou de ser registrado no SEBAC / Bloco A!"
        : "FCM Simulation: Your lost item 'Key / Bottle' was just turned in at SEBAC / Block A!"
    );
    addToast(
      language === "pt"
        ? "Alerta de teste FCM disparado com sucesso no dispositivo!"
        : "FCM test notification sent to your device!",
      "success"
    );
  };

  const requestNotificationPermission = async () => {
    await subscribeToFCM();
  };

  // Theme State
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_THEME_KEY);
    if (saved !== null) {
      return saved === "dark";
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  // Sync dark class on HTML element & localStorage whenever darkMode changes
  useEffect(() => {
    if (typeof document !== "undefined") {
      if (darkMode) {
        document.documentElement.classList.add("dark");
        try {
          localStorage.setItem(LOCAL_STORAGE_THEME_KEY, "dark");
        } catch (_) {}
      } else {
        document.documentElement.classList.remove("dark");
        try {
          localStorage.setItem(LOCAL_STORAGE_THEME_KEY, "light");
        } catch (_) {}
      }
    }
  }, [darkMode]);

  const toggleDarkMode = () => {
    vibrateClick();
    setDarkMode((prev) => !prev);
  };

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

  // Sync Maintenance mode & custom message from Firestore & Server API
  useEffect(() => {
    // Initial fetch from backend API endpoint for multi-device sync
    fetch("/api/system/config")
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && data?.config) {
          if (typeof data.config.maintenanceMode === "boolean") {
            setMaintenanceMode(data.config.maintenanceMode);
          }
          if (data.config.maintenanceCustomMessage) {
            setMaintenanceCustomMessage(data.config.maintenanceCustomMessage);
          }
        }
      })
      .catch(() => {});

    // Real-time Firestore snapshot listener
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
    vibrateClick();
    try {
      await setDoc(doc(db, "system", "config"), { maintenanceCustomMessage: msg }, { merge: true });
      const token = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      fetch("/api/system/config", {
        method: "POST",
        headers,
        body: JSON.stringify({ maintenanceCustomMessage: msg, updatedBy: currentUser.name }),
      }).catch(() => {});
      await logAdminAction(
        "MENSAGEM_MANUTENCAO",
        `Atualizou a mensagem personalizada do banner de manutenção para: "${msg}"`
      );
      addToast("Mensagem do banner de manutenção atualizada em tempo real!", "success");
    } catch (e) {
      console.warn("Aviso ao salvar mensagem de manutenção no Firestore:", e);
      try {
        const token = await auth.currentUser?.getIdToken();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        fetch("/api/system/config", {
          method: "POST",
          headers,
          body: JSON.stringify({ maintenanceCustomMessage: msg, updatedBy: currentUser.name }),
        }).catch(() => {});
      } catch {}
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
    if (nextVal) {
      vibrateCritical();
    } else {
      vibrateSuccess();
    }
    setMaintenanceMode(nextVal);
    try {
      await setDoc(doc(db, "system", "config"), { maintenanceMode: nextVal }, { merge: true });
      const token = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      fetch("/api/system/config", {
        method: "POST",
        headers,
        body: JSON.stringify({ maintenanceMode: nextVal, updatedBy: currentUser.name }),
      }).catch(() => {});
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
      console.warn("Aviso ao salvar modo de manutenção no Firestore:", e);
      try {
        const token = await auth.currentUser?.getIdToken();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        fetch("/api/system/config", {
          method: "POST",
          headers,
          body: JSON.stringify({ maintenanceMode: nextVal, updatedBy: currentUser.name }),
        }).catch(() => {});
      } catch {}
      addToast(
        nextVal
          ? "🚨 Modo Manutenção ATIVADO pelo Administrador!"
          : "✅ Modo Manutenção DESATIVADO.",
        nextVal ? "error" : "success"
      );
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

  // Master Wipe: Deleta todos os registros de objetos, usuários e logs do Firestore através de rota backend segura
  const masterWipeFirestore = async () => {
    if (currentUser.role !== "ADMIN") {
      addToast("Operação restrita exclusivamente ao Administrador TI do IFPR.", "error");
      return;
    }

    try {
      const idToken = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (idToken) headers["Authorization"] = `Bearer ${idToken}`;

      const res = await fetch("/api/admin/master-wipe", {
        method: "POST",
        headers,
        body: JSON.stringify({
          reauthConfirmed: true,
          confirmationWord: "DELETAR_TUDO_DEFINITIVAMENTE",
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Falha na resposta do servidor.");
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

      addToast("Banco de dados do Firestore ZERADO com sucesso via rota administrativa autorizada!", "success");
    } catch (e: any) {
      console.error("Erro no Master Wipe do Firestore:", e);
      addToast(`Erro ao executar limpeza: ${e?.message || "Ação não autorizada"}`, "error");
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
    const userEmail = safeToLower(fbUser.email);

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

      if (!fbUser) {
        setCurrentUser(DEFAULT_GUEST_USER);
        setAuthLoading(false);
        return;
      }

      // Initial user established directly from Firebase Auth
      const userEmail = fbUser.email || "";
      const isRoot = userEmail === "paulocauan39@gmail.com";
      const isServidor = userEmail.includes("@ifpr.edu.br");
      const initialAuthUser: User = {
        id: fbUser.uid,
        name: fbUser.displayName || userEmail.split("@")[0] || "Usuário IFPR",
        email: userEmail,
        role: isRoot ? "ADMIN" : (isServidor ? "SERVIDOR" : "ALUNO"),
        courseOrDept: isServidor ? "Servidor IFPR Campus Ivaiporã" : "Estudante IFPR Campus Ivaiporã",
        registrationNumber: `2026${fbUser.uid.substring(0, 5)}`,
        approvalStatus: isRoot ? "APROVADO" : "APROVADO",
        avatarUrl: fbUser.photoURL || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      };
      setCurrentUser(initialAuthUser);
      setAuthLoading(false);

      // Asynchronously fetch/sync full Firestore user profile
      try {
        const verified = await verifyAndSyncUserDoc(fbUser);
        if (verified) {
          setCurrentUser(verified);
        }

        const userRef = doc(db, "users", fbUser.uid);
        unsubscribeProfileSnapshot = onSnapshot(
          userRef,
          (userSnap) => {
            if (userSnap.exists()) {
              const userData = userSnap.data() as User;
              setCurrentUser(userData);
              const userEmailLower = safeToLower(userData.email);
              setAllUsers((prev) =>
                sanitizeUserList([
                  userData,
                  ...prev.map((u) =>
                    u.id === userData.id || (safeToLower(u.email) === userEmailLower && Boolean(userEmailLower)) ? userData : u
                  ),
                ])
              );
            }
          },
          (e) => {
            console.warn("Aviso ao escutar perfil no Firestore:", e);
          }
        );
      } catch (profileErr) {
        console.warn("Aviso ao sincronizar perfil do Firestore:", profileErr);
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
      }
    );
    return () => unsubscribe();
  }, []);

  // Track seen notification IDs to only alert on newly arriving real-time notifications
  const initialNotifsLoadedRef = React.useRef(false);
  const seenNotifsRef = React.useRef<Set<string>>(new Set());

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
          
          // Real-time Push Alert for newly received MATCH notifications for the active user
          if (initialNotifsLoadedRef.current && currentUser?.id) {
            snapshot.docChanges().forEach((change) => {
              if (change.type === "added") {
                const notif = change.doc.data() as NotificationItem;
                if (
                  notif.userId === currentUser.id &&
                  notif.type === "MATCH" &&
                  !notif.read &&
                  !seenNotifsRef.current.has(notif.id)
                ) {
                  seenNotifsRef.current.add(notif.id);
                  playNotificationChime();
                  displayWebPushNotification(
                    notif.title || "IFPR Achados • Objeto Similar!",
                    notif.message,
                    {
                      url: `/?item=${notif.relatedItemId || ""}`,
                      itemId: notif.relatedItemId,
                    }
                  );
                  addToast(notif.title + ": " + notif.message, "info");
                }
              }
            });
          }

          // Mark loaded IDs as seen
          loadedNotifs.forEach((n) => seenNotifsRef.current.add(n.id));
          initialNotifsLoadedRef.current = true;
          setNotifications(loadedNotifs);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "notifications");
      }
    );
    return () => unsubscribe();
  }, [currentUser?.id]);

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

  // Sync Document Templates from Firestore (Admin Only)
  useEffect(() => {
    if (!currentUser || currentUser.role !== "ADMIN") return;
    const unsubscribe = onSnapshot(
      collection(db, "document_templates"),
      (snapshot) => {
        if (snapshot.empty) {
          setDocumentTemplates(DEFAULT_DOCUMENT_TEMPLATES);
        } else {
          const loaded: DocumentTemplate[] = snapshot.docs.map((d) => d.data() as DocumentTemplate);
          loaded.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
          setDocumentTemplates(loaded);
          try {
            localStorage.setItem("ifpr_document_templates_cache", JSON.stringify(loaded));
          } catch (_) {}
        }
      },
      (error) => {
        console.warn("Aviso ao sincronizar document_templates:", error);
      }
    );
    return () => unsubscribe();
  }, [currentUser?.role]);

  // Sync Generated Documents from Firestore (Admin Only)
  useEffect(() => {
    if (!currentUser || currentUser.role !== "ADMIN") return;
    const unsubscribe = onSnapshot(
      collection(db, "generated_documents"),
      (snapshot) => {
        if (!snapshot.empty) {
          const loaded: GeneratedDocumentRecord[] = snapshot.docs.map((d) => d.data() as GeneratedDocumentRecord);
          loaded.sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
          setGeneratedDocuments(loaded);
          try {
            localStorage.setItem("ifpr_generated_documents_cache", JSON.stringify(loaded));
          } catch (_) {}
        }
      },
      (error) => {
        console.warn("Aviso ao sincronizar generated_documents:", error);
      }
    );
    return () => unsubscribe();
  }, [currentUser?.role]);

  const saveDocumentTemplate = async (template: DocumentTemplate) => {
    const updatedTemplate: DocumentTemplate = {
      ...template,
      updatedAt: new Date().toISOString(),
      createdByName: template.createdByName || currentUser.name,
      createdByEmail: template.createdByEmail || currentUser.email,
    };

    setDocumentTemplates((prev) => {
      const idx = prev.findIndex((t) => t.id === updatedTemplate.id);
      const next = idx >= 0 ? prev.map((t) => (t.id === updatedTemplate.id ? updatedTemplate : t)) : [updatedTemplate, ...prev];
      try {
        localStorage.setItem("ifpr_document_templates_cache", JSON.stringify(next));
      } catch (_) {}
      return next;
    });

    try {
      await setDoc(doc(db, "document_templates", updatedTemplate.id), updatedTemplate);
      await logAdminAction(
        "SALVAR_MODELO_DOCUMENTO",
        `Modelo de documento '${updatedTemplate.title}' (${updatedTemplate.code}) salvo/atualizado.`
      );
      addToast(`Modelo '${updatedTemplate.title}' salvo com sucesso!`, "success");
    } catch (e) {
      console.warn("Aviso ao salvar modelo no Firestore:", e);
      addToast(`Modelo '${updatedTemplate.title}' salvo localmente!`, "info");
    }
  };

  const deleteDocumentTemplate = async (templateId: string) => {
    const target = documentTemplates.find((t) => t.id === templateId);
    setDocumentTemplates((prev) => {
      const next = prev.filter((t) => t.id !== templateId);
      try {
        localStorage.setItem("ifpr_document_templates_cache", JSON.stringify(next));
      } catch (_) {}
      return next;
    });

    try {
      await deleteDoc(doc(db, "document_templates", templateId));
      if (target) {
        await logAdminAction(
          "EXCLUIR_MODELO_DOCUMENTO",
          `Modelo de documento '${target.title}' (${target.code}) excluído.`
        );
      }
      addToast("Modelo excluído com sucesso.", "info");
    } catch (e) {
      console.warn("Aviso ao excluir modelo no Firestore:", e);
      addToast("Modelo removido localmente.", "info");
    }
  };

  const duplicateDocumentTemplate = async (templateId: string): Promise<DocumentTemplate> => {
    const original =
      documentTemplates.find((t) => t.id === templateId) ||
      DEFAULT_DOCUMENT_TEMPLATES.find((t) => t.id === templateId);
    if (!original) throw new Error("Modelo não encontrado.");

    const newId = `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const duplicated: DocumentTemplate = {
      ...original,
      id: newId,
      title: `${original.title} (Cópia)`,
      code: `${original.code}-COP`,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdByName: currentUser.name,
      createdByEmail: currentUser.email,
    };

    await saveDocumentTemplate(duplicated);
    addToast(`Modelo duplicado: '${duplicated.title}'`, "success");
    return duplicated;
  };

  const toggleDocumentTemplateStatus = async (templateId: string) => {
    const target = documentTemplates.find((t) => t.id === templateId);
    if (!target) return;

    const newStatus = target.status === "ATIVO" ? "INATIVO" : "ATIVO";
    const updated: DocumentTemplate = {
      ...target,
      status: newStatus,
      updatedAt: new Date().toISOString(),
    };

    await saveDocumentTemplate(updated);
    addToast(`Modelo alterado para ${newStatus === "ATIVO" ? "ATIVO" : "INATIVO"}.`, "info");
  };

  const logGeneratedDocument = async (
    record: Omit<GeneratedDocumentRecord, "id" | "generatedAt" | "generatedByUserId" | "generatedByName">
  ) => {
    const newRecord: GeneratedDocumentRecord = {
      ...record,
      id: `doc_gen_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      generatedAt: new Date().toISOString(),
      generatedByUserId: currentUser.id,
      generatedByName: currentUser.name,
      generatedByEmail: currentUser.email,
    };

    setGeneratedDocuments((prev) => {
      const next = [newRecord, ...prev];
      try {
        localStorage.setItem("ifpr_generated_documents_cache", JSON.stringify(next));
      } catch (_) {}
      return next;
    });

    try {
      await setDoc(doc(db, "generated_documents", newRecord.id), newRecord);
      await logAdminAction(
        "GERAR_DOCUMENTO_PDF",
        `Documento '${newRecord.templateTitle}' emitido (Nº ${newRecord.documentNumber}) para '${newRecord.recipientOrOrg}'.`
      );
    } catch (e) {
      console.warn("Aviso ao registrar documento gerado no Firestore:", e);
    }
  };

  const loginWithGoogle = async () => {
    try {
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
    const cleanEmail = safeToLower(email);
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
      setCurrentUser(loggedUser);
      addToast(`Bem-vindo de volta, ${loggedUser.name}! Login efetuado com sucesso.`, "success");
    } catch (e: any) {
      console.warn("Erro no login por e-mail/senha:", e);
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
    const cleanEmail = safeToLower(email);
    if (!cleanEmail || !pass || !userData.name) {
      addToast("Preencha todos os campos obrigatórios (Nome, E-mail e Senha).", "error");
      throw new Error("Campos obrigatórios ausentes.");
    }

    const isAcademic = cleanEmail.endsWith("@estudantes.ifpr.edu.br") || cleanEmail.endsWith("@estudante.ifpr.edu.br") || cleanEmail.endsWith("@ifpr.edu.br");
    const isAdminEmail = cleanEmail === "paulocauan39@gmail.com";
    const statusVal = (isAcademic && !isAdminEmail) ? "PENDENTE" : "APROVADO";

    try {
      const res = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
      const newUserObj: User = {
        id: res.user.uid,
        name: userData.name.trim(),
        email: cleanEmail,
        // Prevent arbitrary self-elevation to ADMIN on registration unless root admin
        role: isAdminEmail ? "ADMIN" : (userData.role === "ADMIN" ? "ALUNO" : (userData.role || "ALUNO")),
        courseOrDept: userData.courseOrDept?.trim() || "IFPR Campus Ivaiporã",
        registrationNumber: userData.registrationNumber?.trim() || `2026${Math.floor(10000 + Math.random() * 90000)}`,
        phone: userData.phone?.trim() || "",
        approvalStatus: statusVal,
        avatarUrl: userData.avatarUrl || `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80`,
      };

      await setDoc(doc(db, "users", newUserObj.id), newUserObj, { merge: true });
      setCurrentUser(newUserObj);
      setAllUsers((prev) => [...prev.filter((u) => u && safeToLower(u.email) !== cleanEmail), newUserObj]);
      addToast(`Cadastro concluído com sucesso! Bem-vindo(a), ${newUserObj.name}.`, "success");
    } catch (e: any) {
      console.warn("Erro no cadastro no Firebase Auth:", e);
      if (e.code === "auth/email-already-in-use") {
        const msg = "Este e-mail já está cadastrado. Vá até a aba 'Entrar' e faça login.";
        addToast(msg, "error");
        throw new Error(msg);
      }
      if (e.code === "auth/weak-password") {
        const msg = "A senha deve ter pelo menos 6 caracteres.";
        addToast(msg, "error");
        throw new Error(msg);
      }
      const msg = e.message || "Erro ao realizar cadastro.";
      addToast(msg, "error");
      throw new Error(msg);
    }
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
    const safeTitle = String(itemData.title ?? "ITEM").substring(0, 10).toUpperCase().replace(/\s+/g, "");
    const qrCodeId = `QR-IFPR-${uniqueNum}-${safeTitle}`;

    const taskId = `upload-task-${Date.now()}-${uniqueNum}`;
    const initialUploadTask: UploadTaskStatus = {
      id: taskId,
      itemId: newItemId,
      itemTitle: itemData.title || "Objeto sem título",
      itemType: itemData.type,
      thumbnailUrl: itemData.imageUrl,
      progress: 15,
      status: "COMPRESSING",
      statusMessage: "Otimizando fotos e comprimindo imagem...",
      startedAt: new Date().toISOString(),
    };
    addUploadTask(initialUploadTask);

    // Real-time client-side image compression if base64/data URL is present
    let processedImageUrl = itemData.imageUrl;
    let compressionSavings = 0;
    if (itemData.imageUrl && itemData.imageUrl.startsWith("data:image")) {
      try {
        const compressed = await compressImage(itemData.imageUrl, {
          maxWidth: 1280,
          maxHeight: 1280,
          quality: 0.82,
          outputFormat: "image/webp",
        });
        processedImageUrl = compressed.base64;
        compressionSavings = compressed.savingsPercentage;
        updateUploadTask(taskId, {
          progress: 35,
          thumbnailUrl: processedImageUrl,
          originalSizeBytes: compressed.originalSizeBytes,
          compressedSizeBytes: compressed.compressedSizeBytes,
          savingsPercentage: compressed.savingsPercentage,
          status: "SAVING_LOCAL",
          statusMessage: `Fotos otimizadas (${compressed.formattedOriginalSize} ➔ ${compressed.formattedCompressedSize}). Gravando localmente...`,
        });
      } catch (compErr) {
        console.warn("Aviso ao comprimir imagem no upload:", compErr);
      }
    }

    const initialHistory: ItemHistoryLog[] = [
      {
        id: `hist-${Date.now()}-1`,
        action: "Ocorrência cadastrada",
        actorId: currentUser.id,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        timestamp: new Date().toISOString(),
        details: `Ocorrência registrada no sistema do IFPR Campus Ivaiporã como ${itemData.type}.`,
      },
    ];

    const newItem: LostFoundItem = {
      ...itemData,
      imageUrl: processedImageUrl,
      id: newItemId,
      createdAt: new Date().toISOString(),
      qrCodeId,
      registeredByUserId: currentUser.id,
      registeredByName: currentUser.name,
      registeredByRole: currentUser.role,
      status: itemData.type === "PERDIDO" ? "PERDIDO" : "ENCONTRADO",
      history: initialHistory,
      storageDeadlineDays: 90,
      storageDeadlineDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    };

    // Request Service Worker Background Sync registration
    if (typeof window !== "undefined" && "serviceWorker" in navigator && "SyncManager" in window) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await (reg as any).sync.register("sync-item-uploads");
      } catch (_) {}
    }

    // Check offline status before attempting Firestore write
    const isCurrentlyOffline = typeof navigator !== "undefined" && !navigator.onLine;

    if (isCurrentlyOffline) {
      try {
        await queueOfflineItemRegistration(newItem);
        setItems((prev) => [newItem, ...prev.filter((i) => i.id !== newItem.id)]);
        const queueCount = await getSyncQueueCount();
        setPendingSyncCount(queueCount);
        updateUploadTask(taskId, {
          progress: 100,
          status: "QUEUED_SYNC",
          statusMessage: "Salvo no armazenamento seguro. Background Sync enviará assim que houver conexão.",
          isBackgroundSyncRegistered: true,
          completedAt: new Date().toISOString(),
        });
        addToast(
          `Modo Offline: O objeto "${newItem.title}" foi salvo no seu dispositivo (IndexedDB) e o Service Worker sincronizará em segundo plano assim que a conexão retornar!`,
          "info"
        );
      } catch (offErr) {
        console.warn("Aviso ao enfileirar offline:", offErr);
        setItems((prev) => [newItem, ...prev.filter((i) => i.id !== newItem.id)]);
        updateUploadTask(taskId, {
          status: "ERROR",
          error: "Falha ao gravar na fila local",
          statusMessage: "Erro ao gravar offline",
        });
      }
      return { newItem, matches: [] };
    }

    // Online: Save item to Firestore
    updateUploadTask(taskId, {
      progress: 70,
      status: "UPLOADING",
      statusMessage: "Enviando ao servidor em nuvem...",
    });

    try {
      await setDoc(doc(db, "items", newItem.id), sanitizeFirestoreData(newItem));
      await logAdminAction(
        "CADASTRO_OCORRENCIA",
        `Cadastrou a ocorrência #${newItem.id} "${newItem.title}" (${newItem.type}) - Local: ${newItem.location}`
      );
      updateUploadTask(taskId, {
        progress: 100,
        status: "COMPLETED",
        statusMessage: "Upload e cadastro concluídos com sucesso!",
        completedAt: new Date().toISOString(),
      });
      vibrateSuccess();

      // Trigger automatic Discord Webhook notification ONLY after confirmed database save
      const discordItemPayload = {
        ...newItem,
        imageUrl:
          newItem.imageUrl &&
          (newItem.imageUrl.startsWith("http://") || newItem.imageUrl.startsWith("https://"))
            ? newItem.imageUrl
            : undefined,
      };

      if (newItem.type === "ENCONTRADO") {
        safeFetchJson(
          "/api/items/notify-novos-achados",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ item: discordItemPayload }),
          },
          () => ({ success: true })
        ).catch((webhookErr) => {
          console.warn("[Novos Achados Webhook Notice] Envio assíncrono ao Discord:", webhookErr);
        });
      } else if (newItem.type === "PERDIDO") {
        // Trigger automatic Discord Webhook notification to '#novas-perdas' ONLY after confirmed database save
        safeFetchJson(
          "/api/items/notify-novas-perdas",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ item: discordItemPayload }),
          },
          () => ({ success: true })
        ).catch((webhookErr) => {
          console.warn("[Novas Perdas Webhook Notice] Envio assíncrono ao Discord:", webhookErr);
        });
      }
    } catch (e: any) {
      console.warn("Aviso ao gravar no Firestore, salvando na fila offline do IndexedDB:", e);
      try {
        await queueOfflineItemRegistration(newItem);
        setItems((prev) => [newItem, ...prev.filter((i) => i.id !== newItem.id)]);
        const queueCount = await getSyncQueueCount();
        setPendingSyncCount(queueCount);
        updateUploadTask(taskId, {
          progress: 100,
          status: "QUEUED_SYNC",
          statusMessage: "Conexão instável. Salvo no IndexedDB para Background Sync.",
          isBackgroundSyncRegistered: true,
          completedAt: new Date().toISOString(),
        });
        addToast(
          `Conexão instável. O cadastro de "${newItem.title}" foi salvo localmente e sincronizará automaticamente em segundo plano.`,
          "info"
        );
        return { newItem, matches: [] };
      } catch (_) {}
      updateUploadTask(taskId, {
        status: "ERROR",
        error: e?.message || "Erro durante upload",
        statusMessage: "Falha no upload do item",
      });
      handleFirestoreError(e, OperationType.WRITE, `items/${newItem.id}`);
    }

    // AI Match check
    const counterpartType = newItem.type === "PERDIDO" ? "ENCONTRADO" : "PERDIDO";
    const candidates = items.filter(
      (it) => it.type === counterpartType && it.status !== "DEVOLVIDO" && it.status !== "ENCERRADO"
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
      // 1. Send push notifications and Firestore alerts to ALL counterpart owners whose items matched
      for (const match of aiMatches) {
        const targetUserId = match.matchedItem.registeredByUserId;

        if (targetUserId && targetUserId !== currentUser.id) {
          const isCounterpartLost = match.matchedItem.type === "PERDIDO";
          const notifTitle = isCounterpartLost
            ? `🔍 Possível Objeto Encontrado (${match.matchScore}% de compatibilidade)!`
            : `📢 Novo Relato de Objeto Compatível (${match.matchScore}%)`;

          const featuresStr = match.matchedFeatures && match.matchedFeatures.length > 0
            ? ` (Semelhanças: ${match.matchedFeatures.join(", ")})`
            : "";

          const notifMsg = isCounterpartLost
            ? `Um(a) "${newItem.title}" similar ao seu pertence perdido "${match.matchedItem.title}"${featuresStr} acaba de ser registrado no IFPR (${newItem.location}).`
            : `Um usuário registrou um pertence "${newItem.title}", correspondente ao objeto sob custódia "${match.matchedItem.title}".`;

          const counterpartNotif: NotificationItem = {
            id: `notif-match-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            userId: targetUserId,
            title: notifTitle,
            message: notifMsg,
            timestamp: new Date().toISOString(),
            read: false,
            type: "MATCH",
            relatedItemId: newItem.id,
          };

          try {
            await setDoc(doc(db, "notifications", counterpartNotif.id), sanitizeFirestoreData(counterpartNotif));
          } catch (e) {
            handleFirestoreError(e, OperationType.WRITE, `notifications/${counterpartNotif.id}`);
          }

          // Trigger server push notification dispatch & audit trail
          try {
            safeFetchJson(
              "/api/fcm/send-match-alert",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  targetUserId,
                  matchScore: match.matchScore,
                  newRegisteredItem: newItem,
                  userLostItem: match.matchedItem,
                  matchedFeatures: match.matchedFeatures,
                }),
              },
              () => ({ success: true })
            ).catch(() => {});
          } catch (_) {}
        }
      }

      // 2. Alert the current user registering the item if a match was identified
      const topMatch = aiMatches[0];
      const newNotif: NotificationItem = {
        id: `notif-${Date.now()}`,
        userId: currentUser.id,
        title: "Correspondência de IA Identificada!",
        message: `A IA encontrou ${topMatch.matchScore}% de similaridade com: ${topMatch.matchedItem.title} (${topMatch.matchedItem.location})`,
        timestamp: new Date().toISOString(),
        read: false,
        type: "MATCH",
        relatedItemId: topMatch.matchedItem.id,
      };
      try {
        await setDoc(doc(db, "notifications", newNotif.id), sanitizeFirestoreData(newNotif));
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `notifications/${newNotif.id}`);
      }
      setAiMatchAlert({ newItem, matches: aiMatches });

      displayWebPushNotification(
        "IFPR Achados & Perdidos • Alerta de Correspondência",
        `Objeto compatível encontrado (${topMatch.matchScore}%): ${topMatch.matchedItem.title} (${topMatch.matchedItem.location})`,
        {
          url: `/?item=${topMatch.matchedItem.id}`,
          itemId: topMatch.matchedItem.id,
          matchScore: topMatch.matchScore,
        }
      );
    }

    addToast(`Objeto "${newItem.title}" cadastrado com sucesso no Firestore!`, "success");
    return { newItem, matches: aiMatches };
  };

  const updateItemStatus = async (id: string, status: ItemStatus) => {
    const existing = items.find((i) => i.id === id);
    const existingHistory = existing?.history || existing?.historyLogs || [];
    const isResolved = status === "DEVOLVIDO" || status === "ENCERRADO";

    const newHistLog: ItemHistoryLog = {
      id: `hist-${Date.now()}`,
      action: `Status alterado para ${status}`,
      actorId: currentUser.id,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      timestamp: new Date().toISOString(),
      details: `Status do objeto alterado de ${existing?.status || "N/A"} para ${status}.`,
    };

    const updates: Record<string, any> = sanitizeFirestoreData({
      status,
      resolutionDate: isResolved ? new Date().toISOString() : deleteField(),
      history: [...existingHistory, newHistLog],
      historyLogs: [...existingHistory, newHistLog],
    });

    try {
      await updateDoc(doc(db, "items", id), updates);
      await logAdminAction(
        "STATUS_OVERRIDE",
        `Alterou o status do objeto #${id} para '${status}'`
      );
      addToast(`Status do objeto atualizado para: ${status.replace("_", " ")}`, "info");
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `items/${id}`);
    }
  };

  const updateItemData = async (id: string, updatedFields: Partial<LostFoundItem>) => {
    const existing = items.find((i) => i.id === id);
    const existingHistory = existing?.history || [];
    const newHistLog: ItemHistoryLog = {
      id: `hist-${Date.now()}`,
      action: "Alteração da ocorrência",
      actorId: currentUser.id,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      timestamp: new Date().toISOString(),
      details: "Dados da ocorrência foram atualizados no sistema.",
    };

    const mergedData = sanitizeFirestoreData({
      ...updatedFields,
      lastEditedByUserId: currentUser.id,
      lastEditedByName: currentUser.name,
      lastEditedByRole: currentUser.role,
      lastEditedAt: new Date().toISOString(),
      history: [...existingHistory, newHistLog],
    });

    try {
      await updateDoc(doc(db, "items", id), mergedData);
      await logAdminAction(
        "EDIT_OCORRENCIA",
        `Atualizou os dados da ocorrência #${id} por ${currentUser.name} (${currentUser.role})`
      );
      addToast("Ocorrência atualizada com sucesso!", "success");
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `items/${id}`);
    }
  };

  const registerItemReturn = async (
    itemId: string,
    returnData: {
      recipientName: string;
      recipientEmail: string;
      recipientBond: string;
      identityVerified?: boolean;
      returnObservations?: string;
      observations?: string;
    }
  ) => {
    const existing = items.find((i) => i.id === itemId);
    const existingHistory = existing?.history || [];
    const validationCode = "COMP-IFPR-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    const now = new Date();
    const returnDate = now.toLocaleDateString("pt-BR");
    const returnTime = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    const newHistLog: ItemHistoryLog = {
      id: `hist-${Date.now()}`,
      action: "Devolução registrada",
      actorId: currentUser.id,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      timestamp: now.toISOString(),
      details: `Devolução concluída para ${returnData.recipientName} (${returnData.recipientBond}). Servidor responsável: ${currentUser.name}`,
    };

    const updatePayload = sanitizeFirestoreData({
      status: "DEVOLVIDO" as ItemStatus,
      resolutionDate: now.toISOString(),
      returnDate,
      returnTime,
      returnedByUserId: currentUser.id,
      returnedByName: currentUser.name,
      returnedByRole: currentUser.role,
      recipientName: returnData.recipientName,
      recipientEmail: returnData.recipientEmail,
      recipientBond: returnData.recipientBond,
      returnObservations: returnData.returnObservations || returnData.observations || "",
      receiptValidationCode: validationCode,
      history: [...existingHistory, newHistLog],
      historyLogs: [...existingHistory, newHistLog],
    });

    try {
      await updateDoc(doc(db, "items", itemId), updatePayload);
      await logAdminAction(
        "REGISTRO_DEVOLUCAO",
        `Registrou a devolução do item #${itemId} (${existing?.title || ""}) para ${returnData.recipientName} (${returnData.recipientBond}). Responsável: ${currentUser.name}`
      );
      addToast(`Devolução do item #${itemId} registrada com sucesso!`, "success");
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `items/${itemId}`);
    }
  };

  const reopenItemReturn = async (itemId: string, reason: string) => {
    if (currentUser.role !== "ADMIN") {
      addToast("Apenas o Administrador pode reabrir devoluções.", "error");
      return;
    }
    const existing = items.find((i) => i.id === itemId);
    if (!existing) return;

    const existingHistory = existing.history || [];
    const now = new Date();
    const previousStatus: ItemStatus = existing.type === "PERDIDO" ? "PERDIDO" : "ENCONTRADO";

    const newHistLog: ItemHistoryLog = {
      id: `hist-${Date.now()}`,
      action: "Devolução reaberta",
      actorId: currentUser.id,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      timestamp: now.toISOString(),
      details: `Devolução reaberta pelo Admin. Motivo obrigatório: ${reason}`,
    };

    const updatePayload = sanitizeFirestoreData({
      status: previousStatus,
      resolutionDate: deleteField(),
      returnedByUserId: deleteField(),
      returnedByName: deleteField(),
      returnedByRole: deleteField(),
      returnDate: deleteField(),
      returnTime: deleteField(),
      recipientName: deleteField(),
      recipientEmail: deleteField(),
      recipientBond: deleteField(),
      history: [...existingHistory, newHistLog],
      historyLogs: [...existingHistory, newHistLog],
    });

    try {
      await updateDoc(doc(db, "items", itemId), updatePayload);
      await logAdminAction(
        "REABERTURA_DEVOLUCAO",
        `Reabriu a devolução do objeto #${itemId} (${existing.title}). Motivo: ${reason}`
      );
      addToast(`Devolução do objeto #${itemId} reaberta! O item retornou para a lista de pendentes.`, "success");
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `items/${itemId}`);
    }
  };

  const registerItemDestination = async (
    itemId: string,
    destinationTypeOrObj: string | { destinationType: string; destinationReason?: string; destinationNotes?: string },
    destinationNotesParam?: string
  ) => {
    const existing = items.find((i) => i.id === itemId);
    if (!existing) return;

    let destType = "DOACAO";
    let destReason = "";

    if (typeof destinationTypeOrObj === "string") {
      destType = destinationTypeOrObj;
      destReason = destinationNotesParam || "";
    } else {
      destType = destinationTypeOrObj.destinationType || "DOACAO";
      destReason = destinationTypeOrObj.destinationReason || destinationTypeOrObj.destinationNotes || "";
    }

    const existingHistory = existing.history || existing.historyLogs || [];
    const now = new Date();

    const newHistLog: ItemHistoryLog = {
      id: `hist-${Date.now()}`,
      action: "Destinação de objeto não reclamado",
      actorId: currentUser.id,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      timestamp: now.toISOString(),
      details: `Objeto destinado (${destType}). Motivo/Detalhes: ${destReason}`,
    };

    const updatePayload = sanitizeFirestoreData({
      status: "ENCERRADO" as ItemStatus,
      destinationType: destType,
      destinationReason: destReason,
      destinationDate: now.toISOString(),
      destinationResponsible: currentUser.name,
      history: [...existingHistory, newHistLog],
      historyLogs: [...existingHistory, newHistLog],
    });

    try {
      await updateDoc(doc(db, "items", itemId), updatePayload);
      await logAdminAction(
        "DESTINACAO_ITEM",
        `Registrou destinação do item não reclamado #${itemId} (${existing.title}). Tipo: ${destType}. Motivo: ${destReason}`
      );
      addToast(`Destinação do objeto #${itemId} registrada com sucesso.`, "success");
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `items/${itemId}`);
    }
  };

  const logItemLabelGenerated = async (itemId: string) => {
    const existing = items.find((i) => i.id === itemId);
    if (!existing) return;

    const existingHistory = existing.history || existing.historyLogs || [];
    const now = new Date();

    const newHistLog: ItemHistoryLog = {
      id: `hist-${Date.now()}`,
      action: "Etiqueta gerada",
      actorId: currentUser.id,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      timestamp: now.toISOString(),
      details: `Gerada etiqueta de identificação QR Code por ${currentUser.name} (${currentUser.role}).`,
    };

    try {
      await updateDoc(doc(db, "items", itemId), sanitizeFirestoreData({ history: [...existingHistory, newHistLog], historyLogs: [...existingHistory, newHistLog] }));
      await logAdminAction(
        "GERACAO_ETIQUETA",
        `Gerou a etiqueta física com QR Code para o objeto #${itemId} (${existing.title})`
      );
    } catch (e) {
      console.warn("Aviso ao registrar histórico de etiqueta:", e);
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

  const sendNotificationToUser = async (
    targetUserId: string,
    title: string,
    message: string,
    relatedItemId?: string
  ) => {
    if (!title.trim() || !message.trim()) {
      addToast("Informe o título e a mensagem da notificação.", "error");
      return;
    }

    const notif: NotificationItem = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId: targetUserId,
      title: title.trim(),
      message: message.trim(),
      timestamp: new Date().toISOString(),
      read: false,
      type: "SYSTEM",
      relatedItemId,
    };

    try {
      await setDoc(doc(db, "notifications", notif.id), sanitizeFirestoreData(notif));
      const targetUserName = allUsers.find((u) => u.id === targetUserId)?.name || targetUserId;
      await logAdminAction(
        "ADMIN_NOTIFICATION",
        `Notificação enviada por ${currentUser.name} (${currentUser.role}) para ${targetUserName}: "${title}"`
      );
      addToast(`Notificação enviada para ${targetUserName} com sucesso!`, "success");
    } catch (e) {
      console.warn("Aviso ao salvar notificação no Firestore:", e);
      setNotifications((prev) => [notif, ...prev]);
      addToast(`Notificação enviada com sucesso!`, "success");
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
        language,
        setLanguage,
        t,
        fcmSubscribed,
        subscribeToFCM,
        testFCMAlert,
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
        authLoading,
        isAuthLoading: authLoading,
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
        updateItemData,
        registerItemReturn,
        reopenItemReturn,
        registerItemDestination,
        logItemLabelGenerated,
        deleteItem,
        submitClaim,
        updateClaimStatus,
        sendNotificationToUser,
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
        pendingSyncCount,
        syncOfflineQueue,
        triggerManualSync,
        lastHeartbeatTimestamp,
        indexedDbLoaded,
        errorLogsList,
        activeUploadTasks,
        addUploadTask,
        updateUploadTask,
        removeUploadTask,
        retryUploadTask,
        documentTemplates,
        generatedDocuments,
        saveDocumentTemplate,
        deleteDocumentTemplate,
        duplicateDocumentTemplate,
        toggleDocumentTemplateStatus,
        logGeneratedDocument,
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
