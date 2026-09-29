import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import {
  LostFoundItem,
  User,
  AccountStatus,
  NotificationItem,
  ItemClaim,
  ItemStatus,
  AIMatchResult,
  UserRole,
  ApprovalStatus,
  ItemComment,
  ActivityLog,
  BackupLog,
  BackupScheduleConfig,
  ItemHistoryLog,
  UploadTaskStatus,
  UploadStatusType,
  RegistrationStatus,
  DocumentTemplate,
  GeneratedDocumentRecord,
  ProjectSettings,
  PendingPostLoginAction,
  ItemReturnData,
  SystemAuditLog,
  AuditObjectType,
} from "../types";
import { DEFAULT_DOCUMENT_TEMPLATES } from "../lib/defaultDocumentTemplates";
import { DEFAULT_PROJECT_SETTINGS } from "../lib/projectSettingsConstants";
import { sortUsersByCreationDesc, isAccountBlocked } from "../lib/accountStatusUtils";
import { INITIAL_ITEMS, MOCK_NOTIFICATIONS, MOCK_CLAIMS, MOCK_COMMENTS, MOCK_ACTIVITY_LOGS } from "../data/mockData";
import { safeFetchJson, clientMatchSimilarity, sendMatchEmailAlert } from "../lib/apiHelper";
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
  writeBatch,
} from "firebase/firestore";
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  reload,
  updateProfile,
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
import {
  saveItemsToIndexedDB,
  getItemsFromIndexedDB,
  saveSingleItemIndexedDB,
  queueOfflineItemRegistration,
  getPendingSyncQueue,
  removeSyncQueueEntry,
  removeSyncQueueEntryByItemId,
  updateSyncQueueEntry,
  getSyncQueueCount,
  clearSyncQueue,
  getUploadTaskId,
} from "../lib/indexedDB";
import { clear30DayUptimeRecords } from "../lib/uptimeManager";
import {
  calculatePayloadSizeBytes,
  classifySyncError,
  FIRESTORE_DEFENSIVE_PAYLOAD_LIMIT_BYTES,
} from "../lib/payloadSizeGuard";
import { triggerVibration, vibrateClick, vibrateSuccess, vibrateWarning, vibrateCritical, safeToLower, safeParseDate, formatPhone, isValidPhone, generateSecureSignatureToken, isFutureDate, validateItemOccurrenceDate, validateItemTextFields, ITEM_FIELD_LIMITS } from "../lib/utils";
import {
  DEFAULT_MAINTENANCE_MESSAGE,
  STORAGE_KEYS,
  LOCAL_STORAGE_THEME_KEY,
  LOCAL_STORAGE_CURRENT_USER_KEY,
  LOCAL_STORAGE_ALL_USERS_KEY,
  DEFAULT_GUEST_USER,
  sanitizeUserList,
  sanitizeFirestoreData,
  type AppTabType,
} from "../lib/shared-constants";
import { SupportedLanguage, TranslationDictionary, translations } from "../lib/i18n";
import { parseAuthError, handleAuthError } from "../lib/authErrorHandler";
import { isNotificationForUser, filterNotificationsForUser } from "../lib/notificationHelper";
import {
  requestFCMPermissionAndToken,
  displayWebPushNotification,
  checkFCMSubscriptionStatus,
  sendRealtimeMatchPushAlert,
  playNotificationChime,
  setupFCMForegroundListener,
} from "../lib/fcm";

export interface InstitutionalRoleDetermination {
  role: UserRole;
  isInstitutional: boolean;
  label: string;
}

export function previewInstitutionalRole(email: string): InstitutionalRoleDetermination {
  const cleanEmail = safeToLower(email).trim();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return {
      role: "INTRUSO",
      isInstitutional: false,
      label: "Usuário externo",
    };
  }

  // Superadmin whitelist
  if (cleanEmail === "paulocauan39@gmail.com") {
    return {
      role: "ADMIN",
      isInstitutional: true,
      label: "Administrador Geral",
    };
  }

  const atIdx = cleanEmail.lastIndexOf("@");
  const domain = cleanEmail.substring(atIdx + 1);

  // 1. Aluno: @estudantes.ifpr.edu.br (and variants @estudante.ifpr.edu.br, @aluno.ifpr.edu.br)
  if (
    domain === "estudantes.ifpr.edu.br" ||
    domain === "estudante.ifpr.edu.br" ||
    domain === "aluno.ifpr.edu.br" ||
    domain.endsWith(".estudantes.ifpr.edu.br") ||
    domain.endsWith(".estudante.ifpr.edu.br") ||
    domain.endsWith(".aluno.ifpr.edu.br")
  ) {
    return {
      role: "ALUNO",
      isInstitutional: true,
      label: "Estudante IFPR (Aluno)",
    };
  }

  // 2. Servidor: @ifpr.edu.br or subdomains like @reitoria.ifpr.edu.br, @ivaipora.ifpr.edu.br, etc.
  if (
    (domain === "ifpr.edu.br" || domain.endsWith(".ifpr.edu.br")) &&
    !domain.includes("estudante") &&
    !domain.includes("aluno") &&
    !domain.includes("escola")
  ) {
    return {
      role: "SERVIDOR",
      isInstitutional: true,
      label: "Servidor IFPR (Docente / TAE)",
    };
  }

  // 3. Qualquer outro domínio -> Intruso / Usuário externo
  return {
    role: "INTRUSO",
    isInstitutional: false,
    label: "Usuário externo",
  };
}

export function determineInstitutionalRole(email: string, isEmailVerified: boolean = false): InstitutionalRoleDetermination {
  const cleanEmail = safeToLower(email).trim();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return {
      role: "INTRUSO",
      isInstitutional: false,
      label: "Usuário externo",
    };
  }

  // Superadmin whitelist
  if (cleanEmail === "paulocauan39@gmail.com") {
    return {
      role: "ADMIN",
      isInstitutional: true,
      label: "Administrador Geral",
    };
  }

  // CRITICAL ZERO-TRUST RULE:
  // If email is not verified by Firebase Authentication, it MUST NOT receive institutional classification or privileges.
  if (!isEmailVerified) {
    return {
      role: "INTRUSO",
      isInstitutional: false,
      label: "Conta não verificada (Externa/Intrusa)",
    };
  }

  return previewInstitutionalRole(cleanEmail);
}

interface Toast {
  id: string;
  type: "success" | "error" | "info" | "warning";
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
  updateUserStatus: (
    targetUserId: string,
    newStatus: AccountStatus,
    reason?: string,
    suspendedUntil?: string
  ) => Promise<void>;
  deleteUser: (targetUserId: string) => Promise<void>;
  switchUserRole: (role: UserRole) => void;
  loginWithGoogle: () => Promise<void>;
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
  isAuthenticated: boolean;
  isGuest: boolean;
  isEmailVerified: boolean;
  isEmailVerificationRequired: boolean;
  checkVerificationStatus: () => Promise<boolean>;
  resendVerificationEmail: () => Promise<void>;
  pendingPostLoginAction: PendingPostLoginAction | null;
  setPendingPostLoginAction: (action: PendingPostLoginAction | null) => void;
  requestAuthForRegistration: (
    registerType?: "PERDIDO" | "ENCONTRADO",
    prefilledItem?: Partial<LostFoundItem> | null,
    customMsg?: string
  ) => boolean;
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
  approveAllPendingUsers: () => Promise<void>;
  backupLogs: BackupLog[];
  backupScheduleConfig: BackupScheduleConfig;
  updateBackupScheduleConfig: (config: Partial<BackupScheduleConfig>) => Promise<void>;
  executeFirestoreBackupNow: (triggerType?: "MANUAL" | "PROGRAMADO") => Promise<BackupLog>;
  bulkUpdateItemStatus: (itemIds: string[], status: ItemStatus) => Promise<{ succeededIds: string[]; failedIds: string[] }>;
  bulkDeleteItems: (itemIds: string[]) => Promise<{ succeededIds: string[]; failedIds: string[] }>;
  addUserByAdmin: (newUser: Omit<User, "id">) => Promise<void>;
  resetSystemData: () => Promise<void>;
  clearAllLogsAndMetrics: () => Promise<void>;
  exportFirestoreDataToJson: () => Promise<void>;
  masterWipeFirestore: () => Promise<void>;
  activityLogs: ActivityLog[];
  systemAuditLogs: SystemAuditLog[];
  logAdminAction: (action: ActivityLog["action"], details: string) => Promise<void>;
  recordAuditLog: (entry: {
    objectId: string;
    objectType: AuditObjectType;
    objectTitle?: string;
    action: string;
    fieldChanged?: string;
    oldValue?: string | null;
    newValue?: string | null;
    details: string;
    transactionId?: string;
    actorOverride?: Partial<User>;
  }) => Promise<SystemAuditLog>;
  activeTab: AppTabType;
  setActiveTab: (tab: AppTabType) => void;
  prefilledItemFromAI: Partial<LostFoundItem> | null;
  setPrefilledItemFromAI: (data: Partial<LostFoundItem> | null) => void;
  selectedItemForDetail: LostFoundItem | null;
  setSelectedItemForDetail: (item: LostFoundItem | null) => void;
  addItem: (
    itemData: Omit<LostFoundItem, "id" | "createdAt" | "qrCodeId" | "registeredByUserId" | "registeredByName" | "registeredByRole">
  ) => Promise<{ newItem: LostFoundItem; matches: AIMatchResult[]; persistenceStatus: RegistrationStatus; isOffline: boolean }>;
  updateItemStatus: (id: string, status: ItemStatus) => void;
  updateItemData: (id: string, updatedFields: Partial<LostFoundItem>) => Promise<void>;
  registerItemReturn: (
    itemId: string,
    returnData: ItemReturnData
  ) => Promise<void>;
  submitItemDigitalSignature: (
    itemId: string,
    signatureData: {
      signatureDataUrl: string;
      signerName: string;
      signerEmail?: string;
      signerBond?: string;
      documentNumber?: string;
      signatureType?: "IN_PERSON_DEVICE" | "REMOTE_EMAIL";
    }
  ) => Promise<void>;
  updateDocDirectly: (collectionName: string, docId: string, data: Record<string, any>) => Promise<void>;
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
  addToast: (text: string, type?: "success" | "error" | "info" | "warning") => void;
  registerTypeSelection: "PERDIDO" | "ENCONTRADO";
  setRegisterTypeSelection: (type: "PERDIDO" | "ENCONTRADO") => void;
  systemLatencyMs: number | null;
  isOnline: boolean;
  isSyncing: boolean;
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
  cancelUploadTask: (taskId: string) => Promise<void>;
  retryUploadTask: (taskId: string) => Promise<void>;
  documentTemplates: DocumentTemplate[];
  generatedDocuments: GeneratedDocumentRecord[];
  projectSettings: ProjectSettings;
  saveDocumentTemplate: (template: DocumentTemplate) => Promise<void>;
  deleteDocumentTemplate: (templateId: string) => Promise<void>;
  duplicateDocumentTemplate: (templateId: string) => Promise<DocumentTemplate>;
  toggleDocumentTemplateStatus: (templateId: string) => Promise<void>;
  logGeneratedDocument: (record: Omit<GeneratedDocumentRecord, "id" | "generatedAt" | "generatedByUserId" | "generatedByName">) => Promise<void>;
  deleteGeneratedDocument: (docId: string) => Promise<void>;
  saveProjectSettings: (settings: ProjectSettings) => Promise<void>;
  resetProjectSettingsToDefault: () => Promise<void>;
  suggestMatchesForItem: (targetItem: LostFoundItem) => Promise<AIMatchResult[]>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export { sanitizeFirestoreData, DEFAULT_GUEST_USER, sanitizeUserList };

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<LostFoundItem[]>([]);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);

  // Heartbeat & System Health Monitoring (RNF01 & RNF02)
  const [systemLatencyMs, setSystemLatencyMs] = useState<number | null>(24);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const isSyncingRef = useRef<boolean>(false);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [lastHeartbeatTimestamp, setLastHeartbeatTimestamp] = useState<string | null>(new Date().toISOString());
  const [indexedDbLoaded, setIndexedDbLoaded] = useState<boolean>(false);
  const [errorLogsList, setErrorLogsList] = useState<any[]>([]);

  // Active Upload Tasks (Service Worker Background Sync & Compression Progress)
  const [activeUploadTasks, setActiveUploadTasks] = useState<UploadTaskStatus[]>([]);

  const addUploadTask = (task: UploadTaskStatus) => {
    // Enforce at most ONE active upload task per itemId
    setActiveUploadTasks((prev) => [
      task,
      ...prev.filter((t) => t.id !== task.id && t.itemId !== task.itemId),
    ]);
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
        if (t.id === taskId || (updates.itemId && t.itemId === updates.itemId)) {
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

  const cancelUploadTask = async (taskId: string): Promise<void> => {
    const task = activeUploadTasks.find((t) => t.id === taskId);
    const resolvedItemId = task?.itemId || taskId.replace(/^(task|sync-task|upload-task)-/, "");

    // 1. Remove physical entry from IndexedDB by itemId and by entry id
    await removeSyncQueueEntryByItemId(resolvedItemId);
    await removeSyncQueueEntry(taskId);
    if (task) {
      await removeSyncQueueEntry(task.id);
    }
    console.info(`[Offline Upload Cancel] Tarefa ${taskId} (Item: ${resolvedItemId}) removida da fila IndexedDB.`);

    // 2. Refresh actual count from IndexedDB
    const remaining = await getSyncQueueCount();
    setPendingSyncCount(remaining);

    // 3. Remove task from React active upload tasks state
    setActiveUploadTasks((prev) => prev.filter((t) => t.id !== taskId && t.itemId !== resolvedItemId));
  };

  const triggerManualSync = async () => {
    console.log("[Manual Sync Trigger] Sincronização manual solicitada pelo usuário.");
    await syncOfflineQueue();
  };

  const retryUploadTask = async (taskId: string) => {
    const task = activeUploadTasks.find((t) => t.id === taskId);
    const resolvedItemId = task?.itemId || taskId.replace(/^(task|sync-task|upload-task)-/, "");
    const canonicalTaskId = getUploadTaskId(resolvedItemId);

    // Check if error is permanent in pending queue
    const queue = await getPendingSyncQueue();
    const entry = queue.find(
      (e) => (e.itemId && e.itemId === resolvedItemId) || (e.payload && e.payload.id === resolvedItemId) || e.id === taskId
    );

    if (entry) {
      // Re-evaluate actual payload and fields in real-time instead of relying on stale error strings
      const payloadToTest = (entry.payload || {}) as Partial<LostFoundItem>;
      const actualByteSize = calculatePayloadSizeBytes(payloadToTest);
      const isSizeExceeded = actualByteSize > FIRESTORE_DEFENSIVE_PAYLOAD_LIMIT_BYTES;

      const textValidation = validateItemTextFields({
        title: payloadToTest.title,
        description: payloadToTest.description,
        location: payloadToTest.location,
        color: payloadToTest.color,
        brand: payloadToTest.brand,
        contactInfo: payloadToTest.contactInfo,
      }, false);

      if (isSizeExceeded) {
        console.warn(`[Retry Upload Blocked] Item #${resolvedItemId} excede o limite defensivo (${actualByteSize} bytes > ${FIRESTORE_DEFENSIVE_PAYLOAD_LIMIT_BYTES} bytes). O retry foi bloqueado.`);
        addToast(
          "Este item possui dados ou imagem grandes demais para sincronização. O cadastro precisa ser ajustado.",
          "warning"
        );
        return;
      }

      if (!textValidation.isValid) {
        console.warn(`[Retry Upload Blocked] Item #${resolvedItemId} excede limite de caracteres: ${textValidation.error}`);
        addToast(textValidation.error || "Limite de caracteres excedido.", "warning");
        return;
      }

      await updateSyncQueueEntry(entry.id, {
        status: "PENDENTE",
        error: undefined,
        errorType: undefined,
      });
    }

    updateUploadTask(canonicalTaskId, {
      status: "UPLOADING",
      progress: 30,
      statusMessage: "Tentando sincronizar novamente...",
      error: undefined,
    });
    await syncOfflineQueue();
  };

  // Synchronize pending offline registration queue with Firestore (Idempotent)
  const syncOfflineQueue = async () => {
    if (isSyncingRef.current) {
      console.log("[Offline Sync Notice] Sincronização já em execução. Evitando execução concorrente.");
      return;
    }

    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      const queue = await getPendingSyncQueue();
      const count = queue ? queue.length : 0;
      console.log(`[Offline Sync Pipeline] Iniciando verificação de fila: ${count} item(ns) encontrado(s).`);

      if (!queue || queue.length === 0) {
        setPendingSyncCount(0);
        return;
      }

      let syncedCount = 0;
      let temporaryErrorCount = 0;
      let permanentErrorCount = 0;

      // Deduplicate queue entries by itemId during sync run
      const processedItemIds = new Set<string>();

      for (const entry of queue) {
        const itemId = entry.itemId || entry.payload?.id || entry.id.replace(/^queue-/, "");
        if (processedItemIds.has(itemId)) {
          // Remove duplicate legacy entry for already processed item
          await removeSyncQueueEntry(entry.id);
          continue;
        }
        processedItemIds.add(itemId);

        const taskId = getUploadTaskId(itemId);
        const itemTitle = entry.payload?.title || "Objeto sem título";

        // 1. Guard against PERMANENT errors: Skip automatic retry to prevent loop
        if (entry.status === "ERRO_PERMANENTE" || entry.errorType === "PERMANENT") {
          console.log(`[Offline Sync] Pulando item com erro permanente #${entry.id} ("${itemTitle}"). Preservado no dispositivo.`);
          permanentErrorCount++;
          addUploadTask({
            id: taskId,
            itemId: itemId,
            itemTitle: itemTitle,
            itemType: entry.payload?.type || "ENCONTRADO",
            thumbnailUrl: entry.payload?.imageUrl,
            progress: 100,
            status: "ERROR",
            error: entry.error || "ERRO_PERMANENTE",
            statusMessage: entry.error?.includes("PAYLOAD_SIZE")
              ? "Este item possui dados ou imagem grandes demais para sincronização. O cadastro foi preservado no dispositivo e precisa ser ajustado."
              : "Um item precisa de atenção antes de ser sincronizado.",
            startedAt: entry.createdAt,
          });
          continue;
        }

        console.log(`[Offline Sync] Processando item #${entry.id} (Item ID: ${itemId}, Título: "${itemTitle}", Tentativa: ${(entry.attempts || 0) + 1})...`);

        // Create or update real-time progress task for UI visibility using deterministic taskId
        addUploadTask({
          id: taskId,
          itemId: itemId,
          itemTitle: itemTitle,
          itemType: entry.payload?.type || "ENCONTRADO",
          thumbnailUrl: entry.payload?.imageUrl,
          progress: 30,
          status: "UPLOADING",
          statusMessage: `Sincronizando "${itemTitle}" com o Firestore...`,
          startedAt: new Date().toISOString(),
        });

        const itemToSave = {
          ...entry.payload,
          id: itemId,
          isOfflineQueued: false,
          syncedAt: new Date().toISOString(),
        };

        const sanitizedPayload = sanitizeFirestoreData(itemToSave);
        const payloadSizeBytes = calculatePayloadSizeBytes(sanitizedPayload);

        // 2. Defensive Size Guard check (900,000 bytes)
        if (payloadSizeBytes > FIRESTORE_DEFENSIVE_PAYLOAD_LIMIT_BYTES) {
          console.warn(`[Offline Sync] Item #${entry.id} excede o limite defensivo (${payloadSizeBytes} bytes > ${FIRESTORE_DEFENSIVE_PAYLOAD_LIMIT_BYTES} bytes). Bloqueando setDoc() e marcando como ERRO_PERMANENTE.`);
          permanentErrorCount++;
          await updateSyncQueueEntry(entry.id, {
            status: "ERRO_PERMANENTE",
            errorType: "PERMANENT",
            error: `PAYLOAD_SIZE_EXCEEDS_DEFENSIVE_LIMIT (${payloadSizeBytes} bytes)`,
            payloadSizeBytes,
            lastAttempt: new Date().toISOString(),
          });

          updateUploadTask(taskId, {
            status: "ERROR",
            error: "PAYLOAD_SIZE_EXCEEDS_DEFENSIVE_LIMIT",
            statusMessage: "Este item possui dados ou imagem grandes demais para sincronização. O cadastro foi preservado no dispositivo e precisa ser ajustado.",
          });
          continue;
        }

        // 3. TEXT FIELDS DEFENSIVE BOUNDARY GUARD
        const syncTextValidation = validateItemTextFields({
          title: itemToSave.title,
          description: itemToSave.description,
          location: itemToSave.location,
          color: itemToSave.color,
          brand: itemToSave.brand,
          contactInfo: itemToSave.contactInfo,
        }, false);
        if (!syncTextValidation.isValid) {
          console.warn(`[Offline Sync Guard] Item #${itemToSave.id} rejeitado por exceder limite de caracteres: ${syncTextValidation.error}`);
          await updateSyncQueueEntry(entry.id, {
            status: "ERRO_PERMANENTE",
            errorType: "PERMANENT",
            error: `FIELD_LIMIT_EXCEEDED: ${syncTextValidation.error}`,
            lastAttempt: new Date().toISOString(),
          });
          updateUploadTask(taskId, {
            status: "ERROR",
            error: "FIELD_LIMIT_EXCEEDED",
            statusMessage: syncTextValidation.error || "Limite de caracteres excedido.",
          });
          continue;
        }

        // 3.5. DEFENSIVE AUTHENTICATION GUARD BEFORE SETDOC
        const currentAuthUser = auth.currentUser;
        if (!currentAuthUser || !currentAuthUser.uid) {
          console.warn(`[Offline Sync Auth Guard] Usuário não autenticado no Firebase Auth. Sincronização do item #${itemToSave.id} pausada.`);
          updateUploadTask(taskId, {
            status: "ERROR",
            error: "AUTH_REQUIRED",
            statusMessage: "Faça login com sua conta institucional para sincronizar este item.",
          });
          continue;
        }

        const isUserRootAdmin = currentAuthUser.email === "paulocauan39@gmail.com" || currentUser?.role === "ADMIN";

        if (itemToSave.registeredByUserId && itemToSave.registeredByUserId !== currentAuthUser.uid && !isUserRootAdmin) {
          console.warn(`[Offline Sync Auth Guard] Item #${itemToSave.id} pertence a outro UID (${itemToSave.registeredByUserId} !== ${currentAuthUser.uid}). Sincronização bloqueada.`);
          updateUploadTask(taskId, {
            status: "ERROR",
            error: "AUTH_MISMATCH",
            statusMessage: "Este item foi cadastrado por outra conta. Faça login com a conta criadora original para sincronizar.",
          });
          continue;
        }

        if (!currentAuthUser.emailVerified && !isUserRootAdmin) {
          console.warn(`[Offline Sync Auth Guard] E-mail do usuário não verificado (${currentAuthUser.email}). Sincronização pausada.`);
          updateUploadTask(taskId, {
            status: "ERROR",
            error: "EMAIL_NOT_VERIFIED",
            statusMessage: "Verifique seu e-mail institucional para sincronizar ocorrências com o servidor.",
          });
          continue;
        }

        try {
          await updateSyncQueueEntry(entry.id, {
            status: "SINCRONIZANDO",
            attempts: (entry.attempts || 0) + 1,
            lastAttempt: new Date().toISOString(),
            payloadSizeBytes,
          });

          // 🔍 Temporary Forensic Runtime Instrumentation (Diagnostic Only)
          const firebaseUser = auth.currentUser;
          const tokenResult = firebaseUser ? await firebaseUser.getIdTokenResult(true).catch(() => null) : null;
          let userDocExists = false;
          let userDocData: any = null;
          if (firebaseUser?.uid) {
            try {
              const uSnap = await getDoc(doc(db, "users", firebaseUser.uid));
              userDocExists = uSnap.exists();
              userDocData = userDocExists ? uSnap.data() : null;
            } catch (_) {}
          }

          console.log("[FIRESTORE_FORENSIC_RUNTIME]", {
            uid: firebaseUser?.uid ?? null,
            email: firebaseUser?.email ?? null,
            emailVerifiedClient: firebaseUser?.emailVerified ?? null,
            tokenEmailVerified: tokenResult?.claims?.email_verified ?? null,
            tokenRole: tokenResult?.claims?.role ?? null,
            tokenAdmin: tokenResult?.claims?.admin ?? null,
            registeredByUserId: itemToSave.registeredByUserId ?? null,
            registeredByRole: itemToSave.registeredByRole ?? null,
            itemId: itemToSave.id ?? null,
            userDocExists,
            userDocRole: userDocData?.role ?? null,
            userDocStatus: userDocData?.status ?? null,
            userDocApprovalStatus: userDocData?.approvalStatus ?? null,
          });

          // 4. Persist to Firestore with merge to prevent duplicate records
          await setDoc(doc(db, "items", itemToSave.id), sanitizedPayload, { merge: true });
          console.log(`[Offline Sync Success] Item #${itemToSave.id} gravado e confirmado no Firestore (${payloadSizeBytes} bytes).`);

          // 5. Remove successfully synchronized entry from local IndexedDB queue
          await removeSyncQueueEntry(entry.id);
          await removeSyncQueueEntryByItemId(itemId);
          console.log(`[Offline Sync Success] Item #${entry.id} (${itemId}) removido da fila local IndexedDB.`);

          updateUploadTask(taskId, {
            progress: 100,
            status: "COMPLETED",
            statusMessage: "Sincronizado com sucesso com o servidor em nuvem!",
            completedAt: new Date().toISOString(),
          });

          syncedCount++;

          // 6. Update local state immediately so item appears as confirmed and synchronized (isOfflineQueued: false)
          setItems((prev) => {
            const exists = prev.some((it) => it.id === itemToSave.id);
            if (exists) {
              return prev.map((it) => (it.id === itemToSave.id ? itemToSave : it));
            }
            return [itemToSave, ...prev];
          });

          // 7. Asynchronous Discord Webhook dispatch (non-blocking)
          const discordItemPayload = {
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
                body: JSON.stringify({ item: discordItemPayload }),
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
                body: JSON.stringify({ item: discordItemPayload }),
              },
              () => ({ success: true })
            ).catch((discordErr) => {
              console.warn("[Novas Perdas Webhook Notice] Envio offline-sync ao Discord:", discordErr);
            });
          }
        } catch (syncErr: any) {
          const originalCode = syncErr?.code || (syncErr?.name === "FirebaseError" ? "firestore/unknown" : undefined);
          const originalName = syncErr?.name || "UnknownError";
          const originalMessage = syncErr?.message || String(syncErr);
          const originalStack = syncErr?.stack;

          console.error("[SYNC_FIRESTORE_ORIGINAL_ERROR]", {
            code: originalCode,
            name: originalName,
            message: originalMessage,
            stack: originalStack,
            itemId: itemToSave.id,
            taskId,
            collection: "items",
            documentId: itemToSave.id,
            operation: "setDoc(..., { merge: true })",
            payloadSizeBytes,
            online: typeof navigator !== "undefined" ? navigator.onLine : undefined,
            authUid: auth.currentUser?.uid || null,
            authEmail: auth.currentUser?.email || null,
            authEmailVerified: auth.currentUser?.emailVerified ?? null,
            registeredByUserId: itemToSave.registeredByUserId,
            registeredByRole: itemToSave.registeredByRole,
          });

          const classifiedErr = classifySyncError(syncErr, payloadSizeBytes);
          console.error(`[Offline Sync Error] Falha ao sincronizar item #${entry.id} (${classifiedErr.category}):`, syncErr?.message || syncErr);

          if (classifiedErr.isPermanent) {
            permanentErrorCount++;
          } else {
            temporaryErrorCount++;
          }
          
          await updateSyncQueueEntry(entry.id, {
            status: classifiedErr.isPermanent ? "ERRO_PERMANENTE" : "ERRO_TEMPORARIO",
            errorType: classifiedErr.category,
            error: classifiedErr.reason,
            payloadSizeBytes,
          });

          updateUploadTask(taskId, {
            status: "ERROR",
            error: classifiedErr.reason,
            statusMessage: classifiedErr.isPermanent
              ? classifiedErr.userMessage
              : "Falha temporária ao sincronizar. O item permanece seguro na fila.",
          });
        }
      }

      const remainingEntries = await getPendingSyncQueue();
      const remainingCount = remainingEntries.length;
      setPendingSyncCount(remainingCount);

      const hasPermanent = remainingEntries.some(
        (e) => e.status === "ERRO_PERMANENTE" || e.errorType === "PERMANENT"
      );
      const hasTemporary = remainingEntries.some(
        (e) => e.status === "ERRO_TEMPORARIO" || (e.status === "ERRO" && e.errorType !== "PERMANENT")
      );

      if (syncedCount > 0) {
        vibrateSuccess();
        if (hasPermanent) {
          addToast(
            `${syncedCount} ${syncedCount === 1 ? "ocorrência sincronizada" : "ocorrências sincronizadas"}. Um item com dados excessivos foi mantido no dispositivo para ajuste.`,
            "info"
          );
        } else {
          addToast(
            `Sincronização concluída! ${syncedCount} ${
              syncedCount === 1
                ? "ocorrência enviada ao Firestore com sucesso"
                : "ocorrências enviadas ao Firestore com sucesso"
            }!`,
            "success"
          );
        }
      } else if (hasPermanent && !hasTemporary) {
        addToast(
          "Um item precisa de atenção antes de ser sincronizado.",
          "warning"
        );
      } else if (hasTemporary) {
        addToast(
          "Não foi possível sincronizar agora devido a instabilidade de rede. Tentaremos novamente automaticamente.",
          "warning"
        );
      }
    } catch (e: any) {
      console.warn("[Offline Sync Notice] Erro geral ao processar fila:", e?.message || e);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
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

  // Load items and sync queue count from IndexedDB instantly on boot & auto-trigger sync if online
  useEffect(() => {
    getItemsFromIndexedDB()
      .then((cached) => {
        if (cached && cached.length > 0) {
          setItems(cached);
          setIndexedDbLoaded(true);
        }
      })
      .catch((e) => console.warn("IndexedDB inicialização notice:", e));

    getSyncQueueCount()
      .then((count) => {
        setPendingSyncCount(count);
        if (count > 0 && typeof navigator !== "undefined" && navigator.onLine) {
          console.log(`[Offline Sync Boot] ${count} item(ns) pendente(s) na fila IndexedDB na inicialização. Iniciando sincronização automática...`);
          syncOfflineQueue();
        }
      })
      .catch(() => {});
  }, []);

  // Save items snapshot to IndexedDB whenever items state updates
  useEffect(() => {
    if (items && items.length > 0) {
      saveItemsToIndexedDB(items).catch(() => {});
    }
  }, [items]);

  // Listen to browser online/offline network connectivity events
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      console.log("[Rede] Dispositivo online conectado à internet. Disparando sincronização automática da fila...");
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

  // Current User State - initialized with safe guest default, authenticated state driven exclusively by Firebase Auth
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState<User>(DEFAULT_GUEST_USER);
  const pendingRegistrationDataRef = useRef<Map<string, Omit<User, "id">>>(new Map());

  // Sync System Error Logs for Admin Dashboard Monitoring
  useEffect(() => {
    if (!firebaseUser || (currentUser?.role !== "ADMIN" && currentUser?.role !== "SERVIDOR")) {
      setErrorLogsList([]);
      return;
    }
    const unsubscribe = onSnapshot(
      collection(db, "error_logs"),
      (snapshot) => {
        if (!snapshot.empty) {
          const logs = snapshot.docs.map((d) => d.data());
          logs.sort((a, b) => (safeParseDate(b.timestamp)?.getTime() || 0) - (safeParseDate(a.timestamp)?.getTime() || 0));
          setErrorLogsList(logs);
        }
      },
      (err) => {
        console.warn("Aviso ao sincronizar error_logs:", err);
      }
    );
    return () => unsubscribe();
  }, [firebaseUser, currentUser?.role]);

  const [allUsers, setAllUsers] = useState<User[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_ALL_USERS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter((u: User) => u && u.id && !u.id.startsWith("u-") && u.id !== "guest_visitor");
          if (valid.length > 0) {
            return sanitizeUserList(valid);
          }
        }
      }
    } catch (e) {
      console.warn("Erro ao carregar usuários salvos do localStorage:", e);
    }
    return [];
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

  // System Audit Logs state (Immutable Institutional Traceability)
  const [systemAuditLogs, setSystemAuditLogs] = useState<SystemAuditLog[]>([]);

  // Document Templates & Generated Documents State (Módulo de Documentos PDF Editáveis)
  const [documentTemplates, setDocumentTemplates] = useState<DocumentTemplate[]>(() => {
    try {
      const saved = localStorage.getItem("ifpr_document_templates_cache");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const cachedIds = new Set(parsed.map((t: DocumentTemplate) => t.id));
          const missingDefaults = DEFAULT_DOCUMENT_TEMPLATES.filter((def) => !cachedIds.has(def.id));
          return [...parsed, ...missingDefaults];
        }
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

  // Project Settings (Dados Permanentes do Projeto InovaIF, Equipe, Docente e Campus)
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>(() => {
    try {
      const saved = localStorage.getItem("ifpr_project_settings_cache");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && parsed.teamName) return parsed;
      }
    } catch (_) {}
    return DEFAULT_PROJECT_SETTINGS;
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
    if (!firebaseUser || currentUser?.role !== "ADMIN") {
      setBackupLogs([]);
      return;
    }
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
  }, [firebaseUser, currentUser?.role]);

  // Sync Backup Schedule Config from Firestore
  useEffect(() => {
    if (!firebaseUser || currentUser?.role !== "ADMIN") return;
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
  }, [firebaseUser, currentUser?.role]);

  const updateMaintenanceCustomMessage = async (msg: string) => {
    vibrateClick();
    try {
      await setDoc(doc(db, "system", "config"), { maintenanceCustomMessage: msg }, { merge: true });
      setMaintenanceCustomMessage(msg);
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
      console.error("Erro ao salvar mensagem de manutenção no Firestore:", e);
      addToast("Erro ao gravar mensagem de manutenção no banco de dados.", "error");
      throw e;
    }
  };

  const approveUser = async (userId: string, approved: boolean) => {
    const nextStatus = approved ? "APROVADO" : "REJEITADO";
    const userObj = allUsers.find((u) => u.id === userId);
    const userName = userObj ? userObj.name : userId;

    try {
      await setDoc(doc(db, "users", userId), { approvalStatus: nextStatus }, { merge: true });
      // Atualizar estado local APENAS após confirmação inequívoca do Firestore
      setAllUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, approvalStatus: nextStatus } : u))
      );
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
      console.error("Erro ao atualizar aprovação no Firestore:", e);
      addToast(`Erro ao gravar alteração de aprovação do usuário '${userName}' no Firestore.`, "error");
      throw e;
    }
  };

  const approveAllPendingUsers = async () => {
    if (currentUser.role !== "ADMIN") {
      addToast("Apenas administradores têm permissão para aprovar cadastros em lote.", "error");
      return;
    }
    const pendingList = (allUsers || []).filter((u) => u && u.approvalStatus === "PENDENTE");
    if (pendingList.length === 0) {
      addToast("Nenhuma solicitação pendente de aprovação no momento.", "info");
      return;
    }

    try {
      const batch = writeBatch(db);
      for (const u of pendingList) {
        batch.set(doc(db, "users", u.id), { approvalStatus: "APROVADO" }, { merge: true });
      }
      await batch.commit();

      // Somente após a persistência bem-sucedida do lote no Firestore o estado local é atualizado
      setAllUsers((prev) =>
        prev.map((u) => (u.approvalStatus === "PENDENTE" ? { ...u, approvalStatus: "APROVADO" } : u))
      );

      await logAdminAction(
        "APROVACAO_EM_LOTE",
        `Aprovou todos os ${pendingList.length} cadastros acadêmicos pendentes no sistema em lote por ${currentUser.name}.`
      );
      addToast(`✅ Todos os ${pendingList.length} cadastros pendentes foram aprovados com sucesso!`, "success");
    } catch (e) {
      console.error("Erro ao aprovar cadastros em lote:", e);
      addToast("Erro ao gravar aprovações em lote no Firestore. Nenhum cadastro foi alterado.", "error");
      throw e;
    }
  };

  const updateBackupScheduleConfig = async (configPartial: Partial<BackupScheduleConfig>) => {
    const updated = { ...backupScheduleConfig, ...configPartial };
    try {
      await setDoc(doc(db, "system", "backup_config"), updated, { merge: true });
      setBackupScheduleConfig(updated);
      await logAdminAction(
        "CONFIG_BACKUP",
        `Atualizou a configuração de backups automáticos do Firestore (Ativo: ${updated.enabled}, Frequência: ${updated.frequency}).`
      );
      addToast("Configuração de backup automático atualizada com sucesso!", "success");
    } catch (e) {
      console.error("Erro ao salvar backup_config no Firestore:", e);
      addToast("Erro ao salvar configuração de backup no Firestore.", "error");
      throw e;
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
      setBackupLogs((prev) => [newLog, ...prev]);
      await logAdminAction(
        "BACKUP_SISTEMA",
        `Executou o backup snapshot completo do banco Firestore (${(fileSizeBytes / 1024).toFixed(1)} KB, ${items.length} objetos, ${allUsers.length} usuários).`
      );
      addToast(`⚡ Backup do Firestore gerado e baixado: ${filename}`, "success");
    } catch (e) {
      console.error("Erro ao registrar log de backup no Firestore:", e);
      addToast("Backup baixado, mas houve falha ao registrar o log no Firestore.", "warning");
      throw e;
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
    try {
      await setDoc(doc(db, "system", "config"), { maintenanceMode: nextVal }, { merge: true });
      setMaintenanceMode(nextVal);
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
      console.error("Erro ao salvar modo de manutenção no Firestore:", e);
      addToast("Erro ao persistir o estado do modo de manutenção no banco de dados.", "error");
      throw e;
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

  // Bulk Operations com integridade e fidelidade estrita ao Firestore
  const bulkUpdateItemStatus = async (itemIds: string[], status: ItemStatus): Promise<{ succeededIds: string[]; failedIds: string[] }> => {
    if (itemIds.length === 0) return { succeededIds: [], failedIds: [] };
    const succeededIds: string[] = [];
    const failedIds: string[] = [];

    for (const id of itemIds) {
      try {
        await updateDoc(doc(db, "items", id), sanitizeFirestoreData({ status }));
        succeededIds.push(id);
      } catch (err) {
        failedIds.push(id);
        console.error(`[bulkUpdateItemStatus] Falha ao atualizar item #${id} no Firestore:`, err);
      }
    }

    // Apenas os itens cuja alteração foi EFETIVAMENTE confirmada pelo Firestore têm o estado local modificado
    if (succeededIds.length > 0) {
      setItems((prev) =>
        prev.map((it) => (succeededIds.includes(it.id) ? { ...it, status } : it))
      );
    }

    // Exibição de feedback fiel à realidade das operações
    if (failedIds.length === 0) {
      // Cenário A: Todas confirmadas com sucesso
      addToast(`${succeededIds.length} item(ns) alterado(s) para ${status} com sucesso!`, "success");
    } else if (succeededIds.length === 0) {
      // Cenário C: Todas falharam no Firestore
      addToast(`Falha ao alterar o status dos ${failedIds.length} item(ns) no Firestore. Nenhuma alteração foi persistida.`, "error");
      throw new Error(`Falha total na atualização em lote de ${failedIds.length} item(ns).`);
    } else {
      // Cenário B: Falha parcial (alguns sucederam e outros falharam)
      addToast(
        `${succeededIds.length} item(ns) alterado(s) com sucesso e ${failedIds.length} falharam na gravação remota.`,
        "warning"
      );
    }

    return { succeededIds, failedIds };
  };

  const bulkDeleteItems = async (itemIds: string[]): Promise<{ succeededIds: string[]; failedIds: string[] }> => {
    if (itemIds.length === 0) return { succeededIds: [], failedIds: [] };
    const succeededIds: string[] = [];
    const failedIds: string[] = [];

    for (const id of itemIds) {
      try {
        await deleteDoc(doc(db, "items", id));
        succeededIds.push(id);
      } catch (err) {
        failedIds.push(id);
        console.error(`[bulkDeleteItems] Falha ao excluir item #${id} no Firestore:`, err);
      }
    }

    // Apenas os itens cuja exclusão foi EFETIVAMENTE confirmada pelo Firestore são removidos do estado local
    if (succeededIds.length > 0) {
      setItems((prev) => prev.filter((it) => !succeededIds.includes(it.id)));
    }

    // Exibição de feedback fiel à realidade das operações
    if (failedIds.length === 0) {
      // Cenário A: Todas as exclusões confirmadas no Firestore
      addToast(`${succeededIds.length} item(ns) excluído(s) permanentemente!`, "success");
    } else if (succeededIds.length === 0) {
      // Cenário C: Todas as exclusões falharam no Firestore
      addToast(`Falha ao excluir os ${failedIds.length} item(ns) no Firestore. Nenhum item foi removido.`, "error");
      throw new Error(`Falha total na exclusão em lote de ${failedIds.length} item(ns).`);
    } else {
      // Cenário B: Falha parcial
      addToast(
        `${succeededIds.length} item(ns) excluído(s) com sucesso e ${failedIds.length} falharam na exclusão remota.`,
        "warning"
      );
    }

    return { succeededIds, failedIds };
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
      // Somente após confirmação do Firestore o usuário é adicionado ao estado local
      setAllUsers((prev) => [...prev, newUser]);
      addToast(`Usuário ${newUser.name} cadastrado no sistema com sucesso!`, "success");
    } catch (e) {
      console.error("Erro ao cadastrar usuário no Firestore:", e);
      addToast(`Falha ao cadastrar o usuário '${newUser.name}' no banco de dados. Tente novamente.`, "error");
      throw e;
    }
  };

  // One-time cleanup of legacy mock items and fictitious data from Firestore & LocalStorage
  useEffect(() => {
    const purgeMockDataFromFirestore = async () => {
      const mockItemIds = ["ifpr-101", "ifpr-102", "ifpr-103", "ifpr-104", "ifpr-105", "ifpr-106", "ifpr-107", "ifpr-108"];
      const mockClaimIds = ["claim-1"];
      const mockNotifIds = ["n1", "n2"];
      const mockCommentIds = ["comment-1", "comment-2", "comment-3"];
      const mockUserIds = ["u1", "u2", "u3", "u4", "u5", "u-paulocauan"];

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
  const [activeTab, setActiveTab] = useState<AppTabType>("home");

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

  // Email verification status: check provider and emailVerified directly from Firebase Auth
  const isEmailVerified = Boolean(firebaseUser?.emailVerified);

  const isEmailVerificationRequired = Boolean(
    firebaseUser &&
      !firebaseUser.emailVerified &&
      (firebaseUser.providerData.some((p) => p.providerId === "password") ||
        firebaseUser.providerData.length === 0)
  );

  // Authenticated state check: True ONLY when verified in Firebase Auth, profile matches, and email verification is fulfilled
  const isAuthenticated = Boolean(
    firebaseUser &&
      firebaseUser.uid &&
      currentUser &&
      currentUser.id !== DEFAULT_GUEST_USER.id &&
      currentUser.id === firebaseUser.uid &&
      !isEmailVerificationRequired
  );
  const isGuest = !isAuthenticated;

  // Pending Post-Login Action (intent to register an item or open a specific form after auth)
  const [pendingPostLoginAction, setPendingPostLoginActionState] = useState<PendingPostLoginAction | null>(() => {
    try {
      const saved = sessionStorage.getItem("ifpr_pending_post_login");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (_) {}
    return null;
  });

  const setPendingPostLoginAction = (action: PendingPostLoginAction | null) => {
    setPendingPostLoginActionState(action);
    try {
      if (action) {
        sessionStorage.setItem("ifpr_pending_post_login", JSON.stringify(action));
      } else {
        sessionStorage.removeItem("ifpr_pending_post_login");
      }
    } catch (_) {}
  };

  // Request auth gate for registering an item (used across all navigation, buttons, shortcuts)
  const requestAuthForRegistration = (
    registerType?: "PERDIDO" | "ENCONTRADO",
    prefilledItem?: Partial<LostFoundItem> | null,
    customMsg?: string
  ): boolean => {
    if (registerType) {
      setRegisterTypeSelection(registerType);
    }
    if (prefilledItem) {
      setPrefilledItemFromAI(prefilledItem);
    }

    if (isAuthenticated) {
      setActiveTab("register");
      return true;
    }

    vibrateClick();
    setPendingPostLoginAction({
      action: "REGISTER_ITEM",
      tab: "register",
      registerType: registerType || registerTypeSelection,
      prefilledItem: prefilledItem || prefilledItemFromAI,
      message: customMsg || "É necessário fazer login para cadastrar um item.",
      customMessage: customMsg || "Autenticação Obrigatória para Cadastro",
    });
    setAuthModalOpen(true);
    addToast(customMsg || "É necessário fazer login para cadastrar um item.", "warning");
    return false;
  };

  // Execute pending post-login action seamlessly (e.g. redirect to registration form)
  useEffect(() => {
    if (isAuthenticated && pendingPostLoginAction) {
      const action = pendingPostLoginAction;
      setPendingPostLoginAction(null);
      if (action.registerType) {
        setRegisterTypeSelection(action.registerType);
      }
      if (action.prefilledItem) {
        setPrefilledItemFromAI(action.prefilledItem);
      }
      if (action.tab) {
        setActiveTab(action.tab);
      }
      addToast(
        "Você está autenticado! Agora você pode preencher e cadastrar o item.",
        "success"
      );
    }
  }, [isAuthenticated, pendingPostLoginAction]);

  const addToast = (text: string, type: "success" | "error" | "info" | "warning" = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Helper to verify and sync user document in Firestore using uid as primary document key
  const verifyUserInFirestore = async (
    fbUser: FirebaseUser,
    extraData?: { name?: string; role?: UserRole; avatarUrl?: string; phone?: string; courseOrDept?: string; registrationNumber?: string }
  ): Promise<User> => {
    const userEmail = safeToLower(fbUser.email);
    const isRoot = userEmail === "paulocauan39@gmail.com";
    const uidRef = doc(db, "users", fbUser.uid);

    // Check if there is pending registration data for this user to guarantee consistent profile creation
    const pendingData = userEmail ? pendingRegistrationDataRef.current.get(userEmail) : undefined;
    if (userEmail && pendingData) {
      pendingRegistrationDataRef.current.delete(userEmail);
    }

    const verifiedRoleDetermination = determineInstitutionalRole(userEmail, Boolean(fbUser.emailVerified));
    const previewDetermination = previewInstitutionalRole(userEmail);

    // 1. Direct check in 'users' collection by fbUser.uid
    try {
      const userSnap = await getDoc(uidRef);
      if (userSnap.exists()) {
        const existingData = userSnap.data() as User;
        const targetRole: UserRole = isRoot
          ? "ADMIN"
          : (existingData.role === "ADMIN" && existingData.approvalStatus === "APROVADO")
          ? "ADMIN"
          : verifiedRoleDetermination.role;

        const resolvedName = pendingData?.name || existingData.name || fbUser.displayName || extraData?.name || (userEmail ? userEmail.split("@")[0] : "Usuário IFPR");
        const resolvedAvatar = pendingData?.avatarUrl || existingData.avatarUrl || fbUser.photoURL || extraData?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(resolvedName)}`;
        const resolvedPhone = pendingData?.phone ?? existingData.phone ?? extraData?.phone ?? "";
        const resolvedCourse = pendingData?.courseOrDept || existingData.courseOrDept || extraData?.courseOrDept || (previewDetermination.role === "SERVIDOR" ? "Servidor IFPR Campus Ivaiporã" : "Estudante IFPR Campus Ivaiporã");
        const resolvedRegistration = pendingData?.registrationNumber || existingData.registrationNumber || extraData?.registrationNumber || `2026${fbUser.uid.substring(0, 6)}`;
        const isVerified = Boolean(fbUser.emailVerified);
        const resolvedApprovalStatus: ApprovalStatus = isRoot
          ? "APROVADO"
          : isVerified
          ? "APROVADO"
          : (existingData.approvalStatus || "APROVADO");

        const updatedUser: User = sanitizeFirestoreData({
          ...existingData,
          id: fbUser.uid,
          email: userEmail || existingData.email || "",
          name: resolvedName,
          role: targetRole,
          status: existingData.status || "active",
          avatarUrl: resolvedAvatar,
          courseOrDept: resolvedCourse,
          registrationNumber: resolvedRegistration,
          phone: resolvedPhone,
          approvalStatus: resolvedApprovalStatus,
          createdAt: existingData.createdAt || (fbUser.metadata?.creationTime ? new Date(fbUser.metadata.creationTime).toISOString() : new Date().toISOString()),
          emailVerified: isVerified,
        }) as User;

        // Persist if role changed (e.g. upgraded from INTRUSO to ALUNO/SERVIDOR upon email verification), or missing critical fields
        if (
          !existingData.id ||
          existingData.id !== fbUser.uid ||
          existingData.role !== targetRole ||
          !existingData.email ||
          existingData.emailVerified !== isVerified ||
          (isVerified && existingData.approvalStatus !== "APROVADO") ||
          !existingData.createdAt ||
          (pendingData && pendingData.name !== existingData.name)
        ) {
          try {
            await setDoc(uidRef, updatedUser, { merge: true });
          } catch (writeErr) {
            console.warn("Aviso ao sincronizar campos pendentes no perfil:", writeErr);
          }
        }
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

    // 2. Query 'users' collection using email to migrate legacy documents if any
    if (userEmail) {
      try {
        const q = query(collection(db, "users"), where("email", "==", userEmail));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          const legacyDoc = querySnap.docs[0];
          const legacyData = legacyDoc.data() as User;
          const targetRole: UserRole = isRoot
            ? "ADMIN"
            : (legacyData.role === "ADMIN" && legacyData.approvalStatus === "APROVADO")
            ? "ADMIN"
            : verifiedRoleDetermination.role;

          const resolvedName = pendingData?.name || legacyData.name || fbUser.displayName || extraData?.name || (userEmail ? userEmail.split("@")[0] : "Usuário IFPR");
          const resolvedAvatar = pendingData?.avatarUrl || legacyData.avatarUrl || fbUser.photoURL || extraData?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(resolvedName)}`;
          const resolvedPhone = pendingData?.phone ?? legacyData.phone ?? extraData?.phone ?? "";
          const resolvedCourse = pendingData?.courseOrDept || legacyData.courseOrDept || extraData?.courseOrDept || (previewDetermination.role === "SERVIDOR" ? "Servidor IFPR Campus Ivaiporã" : "Estudante IFPR Campus Ivaiporã");
          const resolvedRegistration = pendingData?.registrationNumber || legacyData.registrationNumber || extraData?.registrationNumber || `2026${fbUser.uid.substring(0, 6)}`;
          const isVerified = Boolean(fbUser.emailVerified);
          const resolvedApprovalStatus: ApprovalStatus = isRoot
            ? "APROVADO"
            : isVerified
            ? "APROVADO"
            : (legacyData.approvalStatus || "APROVADO");

          const migratedUser: User = sanitizeFirestoreData({
            ...legacyData,
            id: fbUser.uid,
            email: userEmail,
            name: resolvedName,
            role: targetRole,
            status: legacyData.status || "active",
            avatarUrl: resolvedAvatar,
            courseOrDept: resolvedCourse,
            registrationNumber: resolvedRegistration,
            phone: resolvedPhone,
            approvalStatus: resolvedApprovalStatus,
            createdAt: legacyData.createdAt || (fbUser.metadata?.creationTime ? new Date(fbUser.metadata.creationTime).toISOString() : new Date().toISOString()),
            emailVerified: isVerified,
          }) as User;
          try {
            await setDoc(uidRef, migratedUser, { merge: true });
            if (legacyDoc.id !== fbUser.uid) {
              await deleteDoc(doc(db, "users", legacyDoc.id));
            }
          } catch (_) {}
          return migratedUser;
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

    // 3. Create new user document in Firestore if no previous profile exists
    // External users (@gmail.com, etc.) are allowed, classified as INTRUSO with active status and restricted permissions
    const isVerified = Boolean(fbUser.emailVerified);
    const resolvedRole: UserRole = isRoot ? "ADMIN" : verifiedRoleDetermination.role;
    const defaultApprovalStatus: ApprovalStatus = "APROVADO";
    const resolvedName = fbUser.displayName || pendingData?.name || extraData?.name || (userEmail ? userEmail.split("@")[0] : "Usuário");
    const resolvedCourse = pendingData?.courseOrDept || extraData?.courseOrDept || (
      previewDetermination.role === "SERVIDOR" ? "Servidor IFPR Campus Ivaiporã" :
      previewDetermination.role === "ALUNO" ? "Estudante IFPR Campus Ivaiporã" :
      "Usuário Externo / Comunidade"
    );
    const resolvedRegistration = pendingData?.registrationNumber || extraData?.registrationNumber || `EXT${fbUser.uid.substring(0, 6)}`;
    const resolvedPhone = pendingData?.phone ?? extraData?.phone ?? "";
    const resolvedAvatar = fbUser.photoURL || pendingData?.avatarUrl || extraData?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(resolvedName)}`;

    const newUser: User = sanitizeFirestoreData({
      id: fbUser.uid,
      name: resolvedName,
      email: userEmail,
      role: resolvedRole,
      status: "active",
      courseOrDept: resolvedCourse,
      registrationNumber: resolvedRegistration,
      phone: resolvedPhone,
      approvalStatus: defaultApprovalStatus,
      avatarUrl: resolvedAvatar,
      createdAt: fbUser.metadata?.creationTime ? new Date(fbUser.metadata.creationTime).toISOString() : new Date().toISOString(),
      emailVerified: isVerified,
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
      throw err;
    }
    return newUser;
  };

  const verifyAndSyncUserDoc = verifyUserInFirestore;

  // Process getRedirectResult for Google auth redirects
  useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (result?.user) {
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

      setAuthLoading(true);

      // Asynchronously fetch/sync full Firestore user profile before finishing auth loading
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
              const userData = { id: userSnap.id, ...(userSnap.data() as User) };
              setCurrentUser(userData);
            }
          },
          (e) => {
            console.warn("Aviso ao escutar perfil no Firestore:", e);
          }
        );
      } catch (profileErr) {
        console.warn("Aviso ao sincronizar perfil do Firestore:", profileErr);
        // Reset to guest user to prevent unauthenticated/rejected access
        setCurrentUser(DEFAULT_GUEST_USER);
      } finally {
        setAuthLoading(false);
      }
    });

    return () => {
      if (unsubscribeProfileSnapshot) unsubscribeProfileSnapshot();
      unsubscribeAuth();
    };
  }, []);

  // Sync Users from Firestore (Least Privilege: Only Admins and Servidores query the full directory)
  useEffect(() => {
    if (!firebaseUser) {
      setAllUsers([]);
      return;
    }

    const email = safeToLower(firebaseUser.email);
    const isRoot = email === "paulocauan39@gmail.com";
    const isPrivileged = isRoot || currentUser?.role === "ADMIN";

    // Non-admin users (students and regular staff) do not harvest or enumerate the users collection
    if (!isPrivileged) {
      setAllUsers(currentUser ? [currentUser] : []);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        if (snapshot.empty) {
          setAllUsers([]);
        } else {
          // Strictly map Firestore documents by unique doc.id
          const usersMap = new Map<string, User>();
          snapshot.docs.forEach((d) => {
            const data = d.data() as User;
            const uid = d.id;
            const userEmail = safeToLower(data.email);
            if (!uid) return;
            // Ignore legacy mock doc u-paulocauan if another document exists or if fake
            if (uid.startsWith("u-") && userEmail === "paulocauan39@gmail.com") {
              return;
            }
            const userObj: User = {
              ...data,
              id: uid,
              email: userEmail || data.email,
              role: (userEmail === "paulocauan39@gmail.com" ? "ADMIN" : (data.role || "ALUNO")),
            };
            if (userEmail && usersMap.has(userEmail)) {
              const existing = usersMap.get(userEmail)!;
              if (existing.id.startsWith("usr_") || existing.id.startsWith("u-")) {
                usersMap.set(userEmail, userObj);
              }
            } else if (userEmail) {
              usersMap.set(userEmail, userObj);
            } else {
              usersMap.set(uid, userObj);
            }
          });
          const loadedUsers = sortUsersByCreationDesc(Array.from(usersMap.values()));
          setAllUsers(loadedUsers);
        }
      },
      (error) => {
        console.warn("Aviso ao sincronizar usuários do Firestore:", error);
      }
    );
    return () => unsubscribe();
  }, [firebaseUser, currentUser?.role]);

  // Sync Items from Firestore with Offline IndexedDB Resilience & Background Queue Processor
  useEffect(() => {
    let isMounted = true;

    // 1. Instantly load items from IndexedDB offline storage so history is viewable without internet
    getItemsFromIndexedDB()
      .then((cachedItems) => {
        if (isMounted && cachedItems && cachedItems.length > 0) {
          setItems((curr) => (curr.length === 0 ? cachedItems : curr));
        }
      })
      .catch((err) => console.warn("Aviso ao ler cache IndexedDB inicial:", err));

    // 2. Real-time Firestore sync with continuous IndexedDB persistence
    const unsubscribe = onSnapshot(
      collection(db, "items"),
      async (snapshot) => {
        if (snapshot.empty) {
          if (isMounted) setItems([]);
          saveItemsToIndexedDB([]).catch(() => {});
        } else {
          const loadedItems: LostFoundItem[] = snapshot.docs.map((d) => d.data() as LostFoundItem);
          // Sort by creation date safely
          loadedItems.sort((a, b) => (safeParseDate(b.createdAt || b.date)?.getTime() || 0) - (safeParseDate(a.createdAt || a.date)?.getTime() || 0));
          if (isMounted) {
            setItems(loadedItems);
            setSelectedItemForDetail((prev) => {
              if (!prev) return null;
              const updated = loadedItems.find((it) => it.id === prev.id);
              return updated || prev;
            });
          }
          saveItemsToIndexedDB(loadedItems).catch((e) => console.warn("Aviso ao persistir itens no IndexedDB:", e));
        }
      },
      async (error) => {
        handleFirestoreError(error, OperationType.GET, "items");
        // Fallback to local IndexedDB cache when network is offline
        try {
          const cached = await getItemsFromIndexedDB();
          if (isMounted && cached && cached.length > 0) {
            setItems(cached);
          }
        } catch (_) {}
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Sync Claims from Firestore
  useEffect(() => {
    if (!firebaseUser) {
      setClaims([]);
      return;
    }
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
  }, [firebaseUser]);

  // Track seen notification IDs to only alert on newly arriving real-time notifications
  const initialNotifsLoadedRef = React.useRef(false);
  const seenNotifsRef = React.useRef<Set<string>>(new Set());

  // Sync Notifications from Firestore
  useEffect(() => {
    // Unauthenticated visitors do not have access to notifications
    if (!firebaseUser) {
      setNotifications([]);
      return;
    }

    // Determine query scope: Admins can view all notifications for oversight;
    // non-admin users only listen to notifications addressed to their UID or broadcast targets.
    const isAdminUser = currentUser?.role === "ADMIN";
    const currentUid = currentUser?.id && currentUser.id !== DEFAULT_GUEST_USER.id ? currentUser.id : null;
    const fbUid = firebaseUser.uid;

    let notifsQuery;
    if (isAdminUser) {
      notifsQuery = collection(db, "notifications");
    } else {
      const allowedTargets = Array.from(
        new Set([currentUid, fbUid, "all", "todos_alunos", "todos", "global"].filter(Boolean))
      ) as string[];
      notifsQuery = query(collection(db, "notifications"), where("userId", "in", allowedTargets));
    }

    const unsubscribe = onSnapshot(
      notifsQuery,
      async (snapshot) => {
        if (snapshot.empty) {
          setNotifications([]);
        } else {
          const rawNotifs: NotificationItem[] = snapshot.docs.map((d) => d.data() as NotificationItem);
          const loadedNotifs = filterNotificationsForUser(rawNotifs, currentUser, firebaseUser?.uid);
          loadedNotifs.sort((a, b) => (safeParseDate(b.timestamp)?.getTime() || 0) - (safeParseDate(a.timestamp)?.getTime() || 0));
          
          // Real-time Push Alert for newly received notifications for the active user
          if (initialNotifsLoadedRef.current && (currentUser?.id || firebaseUser?.uid)) {
            snapshot.docChanges().forEach((change) => {
              if (change.type === "added") {
                const notif = change.doc.data() as NotificationItem;
                if (
                  isNotificationForUser(notif, currentUser, firebaseUser?.uid) &&
                  !notif.read &&
                  !seenNotifsRef.current.has(notif.id)
                ) {
                  seenNotifsRef.current.add(notif.id);
                  playNotificationChime();
                  displayWebPushNotification(
                    notif.title || "IFPR Achados & Perdidos",
                    notif.message,
                    {
                      url: notif.relatedItemId ? `/?item=${notif.relatedItemId}` : "/",
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
  }, [currentUser?.id, currentUser?.role, firebaseUser?.uid]);

  // Sync Comments from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "comments"),
      async (snapshot) => {
        if (snapshot.empty) {
          setComments([]);
        } else {
          const loadedComments: ItemComment[] = snapshot.docs.map((d) => d.data() as ItemComment);
          loadedComments.sort((a, b) => (safeParseDate(a.createdAt)?.getTime() || 0) - (safeParseDate(b.createdAt)?.getTime() || 0));
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
    if (!firebaseUser || (currentUser?.role !== "ADMIN" && currentUser?.role !== "SERVIDOR")) {
      setActivityLogs([]);
      return;
    }
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
  }, [firebaseUser, currentUser?.role]);

  // Sync System Audit Logs from Firestore (Immutable Audit Trail)
  useEffect(() => {
    if (!firebaseUser || currentUser?.role !== "ADMIN") {
      setSystemAuditLogs([]);
      return;
    }
    const unsubscribe = onSnapshot(
      collection(db, "audit_logs"),
      async (snapshot) => {
        if (!snapshot.empty) {
          const loaded: SystemAuditLog[] = snapshot.docs.map((d) => d.data() as SystemAuditLog);
          loaded.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setSystemAuditLogs(loaded);
        }
      },
      (error) => {
        console.warn("Aviso ao sincronizar audit_logs:", error);
      }
    );
    return () => unsubscribe();
  }, [firebaseUser, currentUser?.role]);

  const recordAuditLog = async (entry: {
    objectId: string;
    objectType: AuditObjectType;
    objectTitle?: string;
    action: string;
    fieldChanged?: string;
    oldValue?: string | null;
    newValue?: string | null;
    details: string;
    transactionId?: string;
    actorOverride?: Partial<User>;
  }): Promise<SystemAuditLog> => {
    const now = new Date();
    const txId = entry.transactionId || `TX-${entry.objectType}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    
    // Strict identity binding: prioritize real authenticated Firebase user to prevent identity spoofing
    const realAuthUid = auth.currentUser?.uid;
    const realAuthEmail = auth.currentUser?.email;
    const effectiveRole: UserRole = (currentUser?.role as UserRole) || (realAuthEmail === "paulocauan39@gmail.com" ? "ADMIN" : "ALUNO");

    const auditLogDoc: SystemAuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      transactionId: txId,
      objectId: entry.objectId,
      objectType: entry.objectType,
      objectTitle: entry.objectTitle || entry.objectId,
      action: entry.action,
      actorId: realAuthUid || currentUser?.id || "sistema-ifpr",
      actorName: currentUser?.name || auth.currentUser?.displayName || "Sistema IFPR",
      actorEmail: realAuthEmail || currentUser?.email || "localizamais0@gmail.com",
      actorRole: effectiveRole,
      timestamp: now.toISOString(),
      fieldChanged: entry.fieldChanged,
      oldValue: entry.oldValue !== undefined && entry.oldValue !== null ? String(entry.oldValue) : undefined,
      newValue: entry.newValue !== undefined && entry.newValue !== null ? String(entry.newValue) : undefined,
      details: entry.details,
      immutable: true,
    };

    setSystemAuditLogs((prev) => [auditLogDoc, ...prev.filter((l) => l.id !== auditLogDoc.id)]);

    try {
      await setDoc(doc(db, "audit_logs", auditLogDoc.id), sanitizeFirestoreData(auditLogDoc));
    } catch (err) {
      console.warn("Aviso ao salvar log de auditoria no Firestore:", err);
    }

    // Also update activity_logs for backward compatibility with synchronized actor fields
    try {
      const actLog: Record<string, any> = {
        id: auditLogDoc.id,
        adminId: auditLogDoc.actorId,
        actorId: auditLogDoc.actorId,
        actorRole: auditLogDoc.actorRole,
        adminName: auditLogDoc.actorName,
        action: auditLogDoc.action,
        transactionId: auditLogDoc.transactionId,
        objectId: auditLogDoc.objectId,
        objectType: auditLogDoc.objectType,
        fieldChanged: auditLogDoc.fieldChanged,
        oldValue: auditLogDoc.oldValue || undefined,
        newValue: auditLogDoc.newValue || undefined,
        details: `${auditLogDoc.details} [TX: ${auditLogDoc.transactionId} | OBJ: ${auditLogDoc.objectId}]${auditLogDoc.fieldChanged ? ` (${auditLogDoc.fieldChanged}: ${auditLogDoc.oldValue || 'Nenhum'} ➔ ${auditLogDoc.newValue || 'Nenhum'})` : ''}`,
        timestamp: auditLogDoc.timestamp,
      };
      await setDoc(doc(db, "activity_logs", actLog.id), sanitizeFirestoreData(actLog));
    } catch (_) {}

    return auditLogDoc;
  };

  const logAdminAction = async (action: ActivityLog["action"], details: string) => {
    if (!currentUser || (currentUser.role !== "ADMIN" && currentUser.role !== "SERVIDOR")) return;
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
      setActivityLogs((prev) => [newLog, ...prev]);
    } catch (e) {
      console.warn("Aviso ao gravar log no Firestore:", e);
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
          // Persistir os 6 modelos padrão diretamente no Firestore
          DEFAULT_DOCUMENT_TEMPLATES.forEach(async (tpl) => {
            try {
              await setDoc(doc(db, "document_templates", tpl.id), tpl);
            } catch (e) {
              console.warn("Aviso ao semear template no Firestore:", e);
            }
          });
          try {
            localStorage.setItem("ifpr_document_templates_cache", JSON.stringify(DEFAULT_DOCUMENT_TEMPLATES));
          } catch (_) {}
        } else {
          const loaded: DocumentTemplate[] = snapshot.docs.map((d) => d.data() as DocumentTemplate);
          const loadedIds = new Set(loaded.map((t) => t.id));
          const missingDefaults = DEFAULT_DOCUMENT_TEMPLATES.filter((def) => !loadedIds.has(def.id));

          if (missingDefaults.length > 0) {
            missingDefaults.forEach(async (tpl) => {
              try {
                await setDoc(doc(db, "document_templates", tpl.id), tpl);
              } catch (e) {
                console.warn("Aviso ao persistir modelo padrão faltante no Firestore:", e);
              }
            });
          }

          const combined = [...loaded, ...missingDefaults];
          combined.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
          setDocumentTemplates(combined);
          try {
            localStorage.setItem("ifpr_document_templates_cache", JSON.stringify(combined));
          } catch (_) {}
        }
      },
      (error) => {
        console.warn("Aviso ao sincronizar document_templates:", error);
      }
    );
    return () => unsubscribe();
  }, [currentUser?.role]);

  // Sync Project Settings from Firestore (Real-time updates - Admin Only)
  useEffect(() => {
    if (!currentUser || currentUser.role !== "ADMIN") return;
    const unsubscribe = onSnapshot(
      doc(db, "project_settings", "inovaif"),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as ProjectSettings;
          setProjectSettings(data);
          try {
            localStorage.setItem("ifpr_project_settings_cache", JSON.stringify(data));
          } catch (_) {}
        } else {
          setProjectSettings(DEFAULT_PROJECT_SETTINGS);
        }
      },
      (error) => {
        console.warn("Aviso ao sincronizar project_settings:", error);
      }
    );
    return () => unsubscribe();
  }, [currentUser?.role]);

  const saveProjectSettings = async (settings: ProjectSettings) => {
    const updated: ProjectSettings = {
      ...settings,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser.name,
      updatedByEmail: currentUser.email,
    };

    setProjectSettings(updated);
    try {
      localStorage.setItem("ifpr_project_settings_cache", JSON.stringify(updated));
    } catch (_) {}

    try {
      await setDoc(doc(db, "project_settings", "inovaif"), sanitizeFirestoreData(updated), { merge: true });
      await logAdminAction(
        "SALVAR_DADOS_PROJETO",
        `Atualizou os dados permanentes do Projeto InovaIF, Equipe (${updated.members?.length || 0} integrantes), Professor e Campus.`
      );
      addToast("Dados do projeto salvos e sincronizados com sucesso!", "success");
    } catch (e) {
      console.warn("Aviso ao salvar dados do projeto no Firestore:", e);
      addToast("Dados do projeto salvos localmente!", "info");
    }
  };

  const resetProjectSettingsToDefault = async () => {
    await saveProjectSettings(DEFAULT_PROJECT_SETTINGS);
    addToast("Configurações do projeto restauradas para os dados padrão do InovaIF.", "info");
  };

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

    try {
      await setDoc(doc(db, "document_templates", updatedTemplate.id), updatedTemplate);
      setDocumentTemplates((prev) => {
        const idx = prev.findIndex((t) => t.id === updatedTemplate.id);
        const next = idx >= 0 ? prev.map((t) => (t.id === updatedTemplate.id ? updatedTemplate : t)) : [updatedTemplate, ...prev];
        try {
          localStorage.setItem("ifpr_document_templates_cache", JSON.stringify(next));
        } catch (_) {}
        return next;
      });
      await logAdminAction(
        "SALVAR_MODELO_DOCUMENTO",
        `Modelo de documento '${updatedTemplate.title}' (${updatedTemplate.code}) salvo/atualizado.`
      );
      addToast(`Modelo '${updatedTemplate.title}' salvo com sucesso!`, "success");
    } catch (e) {
      console.error("Erro ao salvar modelo no Firestore:", e);
      addToast(`Erro ao gravar modelo '${updatedTemplate.title}' no Firestore.`, "error");
      throw e;
    }
  };

  const deleteDocumentTemplate = async (templateId: string) => {
    const target = documentTemplates.find((t) => t.id === templateId);

    try {
      await deleteDoc(doc(db, "document_templates", templateId));
      setDocumentTemplates((prev) => {
        const next = prev.filter((t) => t.id !== templateId);
        try {
          localStorage.setItem("ifpr_document_templates_cache", JSON.stringify(next));
        } catch (_) {}
        return next;
      });
      if (target) {
        await logAdminAction(
          "EXCLUIR_MODELO_DOCUMENTO",
          `Modelo de documento '${target.title}' (${target.code}) excluído.`
        );
      }
      addToast("Modelo excluído com sucesso.", "info");
    } catch (e) {
      console.error("Erro ao excluir modelo no Firestore:", e);
      addToast("Erro ao excluir modelo no banco de dados.", "error");
      throw e;
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

    try {
      await setDoc(doc(db, "generated_documents", newRecord.id), newRecord);
      setGeneratedDocuments((prev) => {
        const next = [newRecord, ...prev];
        try {
          localStorage.setItem("ifpr_generated_documents_cache", JSON.stringify(next));
        } catch (_) {}
        return next;
      });
      await logAdminAction(
        "GERAR_DOCUMENTO_PDF",
        `Documento '${newRecord.templateTitle}' emitido (Nº ${newRecord.documentNumber}) para '${newRecord.recipientOrOrg}'.`
      );
    } catch (e) {
      console.warn("Aviso ao registrar documento gerado no Firestore:", e);
    }
  };

  const deleteGeneratedDocument = async (docId: string) => {
    const target = generatedDocuments.find((d) => d.id === docId);

    try {
      await deleteDoc(doc(db, "generated_documents", docId));
      setGeneratedDocuments((prev) => {
        const next = prev.filter((d) => d.id !== docId);
        try {
          localStorage.setItem("ifpr_generated_documents_cache", JSON.stringify(next));
        } catch (_) {}
        return next;
      });
      if (target) {
        await logAdminAction(
          "EXCLUIR_DOCUMENTO_GERADO",
          `Documento emitido '${target.templateTitle}' (${target.documentNumber}) excluído do histórico.`
        );
      }
      addToast("Documento removido do histórico com sucesso.", "info");
    } catch (e) {
      console.error("Erro ao excluir documento gerado no Firestore:", e);
      addToast("Erro ao excluir documento no banco de dados.", "error");
      throw e;
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
        if (popupError?.code === "auth/popup-blocked") {
          await signInWithRedirect(auth, googleProvider);
          return;
        }
        throw popupError;
      }

      const verifiedUser = await verifyUserInFirestore(res.user);
      setCurrentUser(verifiedUser);
      addToast(`Bem-vindo, ${verifiedUser.name}! Autenticado com a Conta Google com sucesso.`, "success");
    } catch (e: any) {
      console.warn("Aviso no login via Google:", e);
      handleAuthError(e, { addToast, showToastForUserCancellation: false });
      throw e;
    }
  };

  const loginWithEmailPassword = async (email: string, pass: string) => {
    const cleanEmail = safeToLower(email);
    if (!cleanEmail || !pass) {
      addToast("Preencha e-mail e senha para entrar.", "warning");
      throw new Error("Preencha e-mail e senha.");
    }

    try {
      const res = await signInWithEmailAndPassword(auth, cleanEmail, pass);
      const syncedUser = await verifyUserInFirestore(res.user);
      setCurrentUser(syncedUser);
      if (!res.user.emailVerified) {
        addToast("Seu e-mail ainda não foi verificado. Por favor, confirme o endereço em sua caixa de entrada para liberar o acesso.", "warning");
      } else {
        addToast(`Bem-vindo de volta, ${syncedUser.name}! Login efetuado com sucesso.`, "success");
      }
    } catch (e: any) {
      console.warn("Erro no login por e-mail/senha:", e);
      const parsed = handleAuthError(e, { addToast });
      throw new Error(parsed.userMessage);
    }
  };

  const registerWithEmailPassword = async (
    email: string,
    pass: string,
    userData: Omit<User, "id">
  ) => {
    const cleanEmail = safeToLower(email);
    const trimmedName = userData.name?.trim() || "";
    const cleanPass = pass?.trim() || "";

    if (!cleanEmail || !cleanPass || !trimmedName) {
      addToast("Preencha todos os campos obrigatórios (Nome, E-mail e Senha).", "error");
      throw new Error("Campos obrigatórios ausentes.");
    }

    if (cleanPass.length < 6) {
      addToast("A senha deve ter no mínimo 6 caracteres.", "warning");
      throw new Error("A senha deve ter no mínimo 6 caracteres.");
    }

    if (userData.phone && userData.phone.trim() && !isValidPhone(userData.phone)) {
      addToast("Número de telefone inválido.", "warning");
      throw new Error("Telefone inválido. Informe o DDD e o número completo (ex: (43) 99876-5432).");
    }

    const institutionalPreview = previewInstitutionalRole(cleanEmail);
    const isRoot = cleanEmail === "paulocauan39@gmail.com";

    // Zero-Trust: Initial role is INTRUSO until email is verified (unless root admin)
    const resolvedRole: UserRole = isRoot ? "ADMIN" : "INTRUSO";
    const statusVal: ApprovalStatus = "APROVADO";
    const resolvedCourse = userData.courseOrDept?.trim() || (
      institutionalPreview.role === "SERVIDOR" ? "Servidor IFPR Campus Ivaiporã" :
      institutionalPreview.role === "ALUNO" ? "Estudante IFPR Campus Ivaiporã" :
      "Usuário Externo / Comunidade"
    );
    const resolvedPhone = userData.phone && userData.phone.trim() ? formatPhone(userData.phone.trim()) : "";
    const resolvedAvatar = userData.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(trimmedName)}`;

    // Store in pending registration ref to guarantee atomic consistency during onAuthStateChanged
    pendingRegistrationDataRef.current.set(cleanEmail, {
      ...userData,
      name: trimmedName,
      email: cleanEmail,
      role: resolvedRole,
      courseOrDept: resolvedCourse,
      phone: resolvedPhone,
      approvalStatus: statusVal,
      avatarUrl: resolvedAvatar,
    });

    let newlyCreatedAuthUser: FirebaseUser | null = null;

    try {
      const res = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPass);
      newlyCreatedAuthUser = res.user;

      // Trigger official Firebase email verification
      try {
        await sendEmailVerification(res.user);
        sessionStorage.setItem("ifpr_last_email_verification_sent", String(Date.now()));
      } catch (verifySendErr: any) {
        console.warn("[Email Verification Send Notice]:", verifySendErr);
      }

      const creationTimeIso = res.user.metadata?.creationTime
        ? new Date(res.user.metadata.creationTime).toISOString()
        : new Date().toISOString();

      const newUserObj: User = {
        id: res.user.uid,
        name: trimmedName,
        email: cleanEmail,
        role: resolvedRole,
        status: "active",
        courseOrDept: resolvedCourse,
        registrationNumber: userData.registrationNumber?.trim() || `2026${res.user.uid.substring(0, 6)}`,
        phone: resolvedPhone,
        approvalStatus: statusVal,
        avatarUrl: resolvedAvatar,
        createdAt: creationTimeIso,
        emailVerified: false,
      };

      await setDoc(doc(db, "users", newUserObj.id), newUserObj, { merge: true });
      setCurrentUser(newUserObj);
      setAllUsers((prev) =>
        sortUsersByCreationDesc([
          newUserObj,
          ...prev.filter((u) => u && safeToLower(u.email) !== cleanEmail),
        ])
      );
      addToast("Conta criada com sucesso! Enviamos um link de confirmação para o seu e-mail.", "info");
    } catch (e: any) {
      pendingRegistrationDataRef.current.delete(cleanEmail);
      console.error("[Cadastro]: Erro no fluxo de criação de usuário:", e);

      // COMPENSATING TRANSACTION: If the auth account was newly created in this operation but Firestore failed,
      // roll back by deleting the newly created Auth user so it doesn't become an orphan account!
      if (newlyCreatedAuthUser) {
        console.warn("[Compensação Ativa]: Removendo conta Auth recém-criada após falha na persistência no Firestore...");
        try {
          await newlyCreatedAuthUser.delete();
          console.log("[Compensação Concluída]: Conta Auth removida via client.");
        } catch (delErr: any) {
          console.warn("[Compensação Client Falhou]: Acionando endpoint de compensação no servidor...", delErr);
          try {
            await fetch("/api/auth/compensate-failed-registration", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ uid: newlyCreatedAuthUser.uid, email: cleanEmail }),
            });
            console.log("[Compensação Backend Concluída]: Conta Auth removida via Admin SDK.");
          } catch (backendErr) {
            console.error("[Compensação Erro Crítico]: Falha ao acionar compensação no backend:", backendErr);
          }
        }
      }

      const parsed = handleAuthError(e, { addToast });
      throw new Error(parsed.userMessage);
    }
  };

  const checkVerificationStatus = async (): Promise<boolean> => {
    if (!auth.currentUser) {
      addToast("Nenhum usuário conectado.", "warning");
      return false;
    }

    try {
      await reload(auth.currentUser);
      const updatedUser = auth.currentUser;
      setFirebaseUser({ ...updatedUser } as FirebaseUser);

      if (updatedUser.emailVerified) {
        const syncedUser = await verifyUserInFirestore(updatedUser);
        setCurrentUser(syncedUser);
        setAllUsers((prev) =>
          sortUsersByCreationDesc(prev.map((u) => (u.id === syncedUser.id ? syncedUser : u)))
        );
        vibrateSuccess();
        addToast("E-mail verificado com sucesso! Vínculo institucional liberado.", "success");
        return true;
      } else {
        vibrateWarning();
        addToast("Seu e-mail ainda não consta como verificado. Certifique-se de clicar no link enviado para o seu e-mail (verifique também o Spam).", "warning");
        return false;
      }
    } catch (err: any) {
      console.error("[Email Verification Check Error]:", err);
      handleAuthError(err, { addToast });
      return false;
    }
  };

  const resendVerificationEmail = async (): Promise<void> => {
    if (!auth.currentUser) {
      addToast("Nenhum usuário conectado.", "warning");
      return;
    }

    const lastSentStr = sessionStorage.getItem("ifpr_last_email_verification_sent");
    const now = Date.now();
    if (lastSentStr) {
      const elapsed = Math.floor((now - parseInt(lastSentStr, 10)) / 1000);
      if (elapsed < 60) {
        const remaining = 60 - elapsed;
        addToast(`Aguarde ${remaining}s antes de solicitar um novo e-mail de verificação.`, "warning");
        return;
      }
    }

    try {
      await sendEmailVerification(auth.currentUser);
      sessionStorage.setItem("ifpr_last_email_verification_sent", String(now));
      vibrateSuccess();
      addToast(`E-mail de verificação reenviado para ${auth.currentUser.email}. Verifique a caixa de entrada e o spam.`, "success");
    } catch (err: any) {
      console.error("[Resend Verification Error]:", err);
      if (err?.code === "auth/too-many-requests") {
        addToast("Muitas solicitações recentes. O Firebase bloqueou temporariamente novos envios. Aguarde alguns minutos.", "error");
      } else {
        handleAuthError(err, { addToast });
      }
    }
  };

  const updateUserProfileData = async (updatedUser: User) => {
    try {
      if (auth.currentUser && updatedUser.avatarUrl && updatedUser.avatarUrl !== auth.currentUser.photoURL) {
        try {
          await updateProfile(auth.currentUser, {
            photoURL: updatedUser.avatarUrl,
            displayName: updatedUser.name || auth.currentUser.displayName,
          });
        } catch (authProfileErr) {
          console.warn("[Auth Profile Sync Notice]:", authProfileErr);
        }
      }
      await setDoc(doc(db, "users", updatedUser.id), updatedUser, { merge: true });
      setCurrentUser(updatedUser);
      addToast("Perfil atualizado no banco de dados!", "success");
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${updatedUser.id}`);
      throw e;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn("Aviso ao sair do Firebase Auth:", e);
    }
    try {
      localStorage.removeItem(LOCAL_STORAGE_CURRENT_USER_KEY);
      sessionStorage.removeItem("ifpr_pending_post_login");
    } catch (_) {}
    setPendingPostLoginActionState(null);
    setCurrentUser(DEFAULT_GUEST_USER);
    if (activeTab === "register") {
      setActiveTab("home");
    }
    addToast("Sessão encerrada com sucesso.", "info");
  };

  const updateUserRole = async (targetUserId: string, newRole: UserRole) => {
    if (!targetUserId) {
      addToast("ID de usuário inválido.", "error");
      return;
    }

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

      const targetUser = allUsers.find((u) => u.id === targetUserId);
      await recordAuditLog({
        objectId: targetUserId,
        objectType: "USER",
        objectTitle: targetUser?.name || targetUserId,
        action: "ALTERACAO_PERMISSAO",
        fieldChanged: "role",
        oldValue: targetUser?.role || "ALUNO",
        newValue: newRole,
        details: `Permissão de acesso do usuário '${targetUser?.name || targetUserId}' alterada de ${targetUser?.role || "ALUNO"} para ${newRole}.`,
      });

      if (currentUser.id === targetUserId) {
        setCurrentUser((prev) => ({ ...prev, role: newRole }));
      }

      addToast(`Função do usuário atualizada para ${newRole} com sucesso!`, "success");
    } catch (e: any) {
      console.error("Erro ao alterar função do usuário no Firestore:", e);
      addToast("Erro de permissão ou rede ao salvar permissão no banco de dados.", "error");
      throw e;
    }
  };

  const updateUserStatus = async (
    targetUserId: string,
    newStatus: AccountStatus,
    reason?: string,
    suspendedUntil?: string
  ) => {
    if (!targetUserId) {
      addToast("ID de usuário inválido.", "error");
      return;
    }

    if (currentUser.role !== "ADMIN") {
      addToast("Apenas Administradores têm permissão para alterar o status de contas.", "error");
      return;
    }

    if (targetUserId === currentUser.id && newStatus !== "active") {
      addToast("Você não pode suspender ou banir sua própria conta de administrador.", "error");
      return;
    }

    const targetUser = allUsers.find((u) => u.id === targetUserId);
    const nowIso = new Date().toISOString();

    const updatePayload: Partial<User> = {
      status: newStatus,
      statusUpdatedAt: nowIso,
      statusUpdatedBy: currentUser.name || currentUser.email || "Administrador",
      statusChangedAt: nowIso,
      statusChangedBy: currentUser.id,
      statusChangedByName: currentUser.name || currentUser.email || "Administrador",
      statusChangedByEmail: currentUser.email || "",
      statusReason: reason?.trim() || undefined,
      suspendedUntil: newStatus === "suspended" ? suspendedUntil : undefined,
    };

    try {
      const userRef = doc(db, "users", targetUserId);
      await setDoc(userRef, sanitizeFirestoreData(updatePayload), { merge: true });

      setAllUsers((prev) =>
        prev.map((u) => (u.id === targetUserId ? { ...u, ...updatePayload } : u))
      );

      if (currentUser.id === targetUserId) {
        setCurrentUser((prev) => ({ ...prev, ...updatePayload }));
      }

      const actionType =
        newStatus === "suspended"
          ? "ACCOUNT_SUSPENDED"
          : newStatus === "banned"
          ? "ACCOUNT_BANNED"
          : "ACCOUNT_REACTIVATED";

      await recordAuditLog({
        objectId: targetUserId,
        objectType: "USER",
        objectTitle: targetUser?.name || targetUserId,
        action: actionType,
        fieldChanged: "status",
        oldValue: targetUser?.status || "active",
        newValue: newStatus,
        details: `Status do usuário '${targetUser?.name || targetUserId}' (${targetUser?.email || ""}) alterado de '${targetUser?.status || "active"}' para '${newStatus}'. Motivo: ${reason || "Não informado"}${suspendedUntil ? ` | Até: ${suspendedUntil}` : ""}`,
      });

      await logAdminAction(
        actionType as any,
        `Alterou status da conta de '${targetUser?.name || targetUserId}' para '${newStatus}'. Motivo: ${reason || "Não informado"}`
      );

      const statusLabels: Record<AccountStatus, string> = {
        active: "reativada",
        suspended: "suspensa",
        banned: "banida",
      };

      addToast(`Conta do usuário '${targetUser?.name || targetUserId}' ${statusLabels[newStatus]} com sucesso!`, "success");
    } catch (e: any) {
      console.error("Erro ao alterar status do usuário no Firestore:", e);
      addToast("Erro ao gravar alteração de status no banco de dados.", "error");
      throw e;
    }
  };

  const deleteUser = async (targetUserId: string) => {
    if (!targetUserId || typeof targetUserId !== "string" || !targetUserId.trim()) {
      addToast("ID de usuário inválido para exclusão.", "error");
      return;
    }

    const cleanTargetId = targetUserId.trim();

    if (currentUser.role !== "ADMIN") {
      addToast("Apenas o Administrador pode remover usuários do sistema.", "error");
      return;
    }

    if (cleanTargetId === currentUser.id) {
      addToast("Operação não permitida: Você não pode remover sua própria conta de administrador ativa.", "error");
      return;
    }

    const targetUser = allUsers.find((u) => u.id === cleanTargetId);
    const targetName = targetUser?.name || cleanTargetId;

    try {
      // 1. Obter Bearer Token atualizado do usuário autenticado no Firebase Auth
      const idToken = await auth.currentUser?.getIdToken(true);
      if (!idToken) {
        throw new Error("Sessão administrativa não autenticada. Faça login novamente.");
      }

      // 2. Chamar endpoint administrativo server-authoritative exclusivo
      const res = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
        },
        body: JSON.stringify({ targetUserId: cleanTargetId }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        // Caso C: Inconsistência real (Auth excluído, Firestore falhou)
        if (data?.authDeleted && !data?.firestoreDeleted) {
          // Atualiza estado local para indicar conta com Auth removido e pendente de reconciliação no Firestore
          setAllUsers((prev) =>
            prev.map((u) =>
              u.id === cleanTargetId
                ? {
                    ...u,
                    status: "suspended",
                    statusReason: "Conta Auth removida; perfil pendente de reconciliação no Firestore.",
                  }
                : u
            )
          );
          addToast(
            `Atenção: A conta no Firebase Auth de '${targetName}' foi removida, mas a exclusão no Firestore falhou. O perfil foi mantido na lista para reconciliação.`,
            "warning"
          );
          throw new Error(data?.error || "Falha ao remover o perfil no Firestore após exclusão da conta de autenticação.");
        }

        const errorMsg =
          data?.error ||
          data?.message ||
          `Falha na exclusão administrativa do usuário (HTTP ${res.status}).`;
        throw new Error(errorMsg);
      }

      // 3. Sucesso completo comprovado: ambas as fontes (Auth e Firestore) foram confirmadas
      setAllUsers((prev) => prev.filter((u) => u.id !== cleanTargetId));

      addToast(
        data?.message || `Conta de '${targetName}' excluída definitivamente com sucesso!`,
        "success"
      );
    } catch (e: any) {
      console.error("[deleteUser] Erro ao excluir conta do usuário:", e);
      // Se já disparou o toast de aviso específico de inconsistência, não sobrescreve com toast genérico
      if (!e?.message?.includes("perfil no Firestore após exclusão")) {
        addToast(`Erro ao excluir conta: ${e?.message || "Operação não autorizada"}`, "error");
      }
      throw e;
    }
  };

  const switchUserRole = (role: UserRole) => {
    if (currentUser.role !== "ADMIN") {
      addToast("Apenas Administradores do IFPR podem alternar perfis e permissões.", "error");
      return;
    }
    const found = allUsers.find((u) => u.role === role);
    if (found) {
      setCurrentUser(found);
      addToast(`Sessão alterada para ${found.name} (${found.role})`, "info");
    }
  };

  // Add Item (Canonical State Pipeline: SAVING -> PENDING_SYNC -> CONFIRMED / ERROR)
  const addItem = async (
    itemData: Omit<LostFoundItem, "id" | "createdAt" | "qrCodeId" | "registeredByUserId" | "registeredByName" | "registeredByRole">
  ): Promise<{ newItem: LostFoundItem; matches: AIMatchResult[]; persistenceStatus: RegistrationStatus; isOffline: boolean }> => {
    // 🔒 Security Guard: Only authenticated users with verified institutional identity can register items
    if (authLoading) {
      addToast("Aguardando inicialização da autenticação institucional...", "info");
      throw new Error("Autenticação em carregamento: Aguarde a inicialização da sessão Firebase.");
    }

    const authUser = auth.currentUser;
    if (!authUser || !authUser.uid || !authUser.email || isGuest) {
      setPendingPostLoginAction({ tab: "register", registerType: itemData.type });
      setAuthModalOpen(true);
      addToast("É necessário fazer login com sua conta institucional para cadastrar um item.", "warning");
      throw new Error("Autenticação obrigatória: Sessão Firebase Authentication ativa não encontrada.");
    }

    if (!authUser.emailVerified && authUser.email !== "paulocauan39@gmail.com") {
      addToast("Seu e-mail institucional precisa ser verificado para cadastrar itens no sistema.", "warning");
      throw new Error("E-mail não verificado: A confirmação de e-mail institucional é obrigatória.");
    }

    // Role derivation strictly from authenticated profile or verified root admin
    const isRootAdmin = authUser.email === "paulocauan39@gmail.com";
    const effectiveUserRole: UserRole | undefined = isRootAdmin
      ? "ADMIN"
      : currentUser?.role && currentUser.role !== "INTRUSO"
      ? currentUser.role
      : undefined;

    if (!effectiveUserRole) {
      addToast("Perfil de usuário não carregado ou sem permissão válida. Aguarde a sincronização do perfil.", "error");
      throw new Error("Perfil institucional não disponível para autorização no Firestore.");
    }

    if (isAccountBlocked(currentUser)) {
      addToast("Sua conta institucional está suspensa ou banida.", "error");
      throw new Error("Ação bloqueada: Conta suspensa ou banida.");
    }

    // Strict input and length boundary validations (Defense in Depth)
    const textValidation = validateItemTextFields({
      title: itemData.title,
      description: itemData.description,
      location: itemData.location,
      color: itemData.color,
      brand: itemData.brand,
      contactInfo: itemData.contactInfo,
    }, false);
    if (!textValidation.isValid) {
      addToast(textValidation.error || "Limite de caracteres excedido.", "error");
      throw new Error(textValidation.error || "Campo de texto excede o limite permitido.");
    }
    if (!itemData.type || (itemData.type !== "PERDIDO" && itemData.type !== "ENCONTRADO")) {
      throw new Error("O tipo do objeto deve ser PERDIDO ou ENCONTRADO.");
    }
    const dateValidation = validateItemOccurrenceDate(itemData.date, "A data da ocorrência");
    if (!dateValidation.isValid) {
      addToast(dateValidation.error || "Data inválida ou futura não permitida.", "error");
      throw new Error(dateValidation.error || "A data da ocorrência não pode ser futura.");
    }

    const uniqueTimestamp = Date.now().toString(36).toUpperCase();
    const uniqueRand = Math.floor(100 + Math.random() * 900);
    const newItemId = `ifpr-${uniqueTimestamp}-${uniqueRand}`;
    const safeTitle = String(itemData.title ?? "ITEM").substring(0, 10).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const qrCodeId = `QR-IFPR-${uniqueTimestamp}-${safeTitle || "ITEM"}`;

    // Canonical single task ID per item
    const taskId = getUploadTaskId(newItemId);
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

    const effectiveUserId = authUser.uid;
    const effectiveUserName = currentUser?.name || authUser.displayName || "Usuário IFPR";

    const initialHistory: ItemHistoryLog[] = [
      {
        id: `hist-${Date.now()}-1`,
        action: "Ocorrência cadastrada",
        actorId: effectiveUserId,
        actorName: effectiveUserName,
        actorRole: effectiveUserRole,
        userId: effectiveUserId,
        userName: effectiveUserName,
        userRole: effectiveUserRole,
        timestamp: new Date().toISOString(),
        details: `Ocorrência registrada no sistema do IFPR Campus Ivaiporã como ${itemData.type}.`,
        objectId: newItemId,
        transactionId: `tx-init-${newItemId}`,
        newValue: `Tipo: ${itemData.type} | Local: ${itemData.location}`,
      },
    ];

    const newItem: LostFoundItem = {
      ...itemData,
      imageUrl: processedImageUrl,
      id: newItemId,
      createdAt: new Date().toISOString(),
      qrCodeId,
      registeredByUserId: effectiveUserId,
      registeredByName: effectiveUserName,
      registeredByRole: effectiveUserRole,
      status: itemData.type === "PERDIDO" ? "PERDIDO" : "ENCONTRADO",
      history: initialHistory,
      storageDeadlineDays: 90,
      storageDeadlineDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      isOfflineQueued: false,
    };

    // Request Service Worker Background Sync registration
    if (typeof window !== "undefined" && "serviceWorker" in navigator && "SyncManager" in window) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await (reg as any).sync.register("sync-item-uploads");
      } catch (_) {}
    }

    // Sanitize item and compute real UTF-8 payload byte size
    const sanitizedItemPayload = sanitizeFirestoreData(newItem);
    const payloadSizeBytes = calculatePayloadSizeBytes(sanitizedItemPayload);

    // 1. DEFENSIVE SIZE GUARD (900,000 bytes limit)
    if (payloadSizeBytes > FIRESTORE_DEFENSIVE_PAYLOAD_LIMIT_BYTES) {
      console.warn(
        `[Tamanho Defensivo] Ocorrência #${newItem.id} ultrapassa o limite defensivo (${payloadSizeBytes} bytes > ${FIRESTORE_DEFENSIVE_PAYLOAD_LIMIT_BYTES} bytes). Gravação no Firestore bloqueada.`
      );
      const queuedItem: LostFoundItem = { ...newItem, isOfflineQueued: true };
      await queueOfflineItemRegistration(queuedItem, {
        status: "ERRO_PERMANENTE",
        errorType: "PERMANENT",
        error: `PAYLOAD_SIZE_EXCEEDS_DEFENSIVE_LIMIT (${payloadSizeBytes} bytes)`,
        payloadSizeBytes,
      });
      setItems((prev) => [queuedItem, ...prev.filter((i) => i.id !== newItem.id)]);
      const queueCount = await getSyncQueueCount();
      setPendingSyncCount(queueCount);
      updateUploadTask(taskId, {
        progress: 100,
        status: "ERROR",
        error: "PAYLOAD_SIZE_EXCEEDS_DEFENSIVE_LIMIT",
        statusMessage: "Este item possui dados ou imagem grandes demais para sincronização. O cadastro foi preservado no dispositivo e precisa ser ajustado.",
        completedAt: new Date().toISOString(),
      });
      addToast(
        "Este item possui dados ou imagem grandes demais para sincronização. O cadastro foi preservado no dispositivo e precisa ser ajustado.",
        "warning"
      );
      return { newItem: queuedItem, matches: [], persistenceStatus: "ERROR", isOffline: false };
    }

    // Check offline status before attempting Firestore write
    const isCurrentlyOffline = typeof navigator !== "undefined" && !navigator.onLine;

    if (isCurrentlyOffline) {
      const queuedItem: LostFoundItem = { ...newItem, isOfflineQueued: true };
      try {
        await queueOfflineItemRegistration(queuedItem, {
          status: "PENDENTE",
          payloadSizeBytes,
        });
        setItems((prev) => [queuedItem, ...prev.filter((i) => i.id !== newItem.id)]);
        const queueCount = await getSyncQueueCount();
        setPendingSyncCount(queueCount);
        updateUploadTask(taskId, {
          progress: 100,
          status: "QUEUED_SYNC",
          statusMessage: "Salvo no armazenamento seguro. Background Sync enviará assim que houver conexão.",
          isBackgroundSyncRegistered: true,
          completedAt: new Date().toISOString(),
        });
      } catch (offErr) {
        console.warn("Aviso ao enfileirar offline:", offErr);
        setItems((prev) => [queuedItem, ...prev.filter((i) => i.id !== newItem.id)]);
        updateUploadTask(taskId, {
          status: "ERROR",
          error: "Falha ao gravar na fila local",
          statusMessage: "Erro ao gravar offline",
        });
      }
      return { newItem: queuedItem, matches: [], persistenceStatus: "PENDING_SYNC", isOffline: true };
    }

    // Online: Save item to Firestore with strict persistence check
    updateUploadTask(taskId, {
      progress: 70,
      status: "UPLOADING",
      statusMessage: "Enviando ao servidor em nuvem e aguardando confirmação do Firestore...",
    });

    // Strict identity defensive verification prior to calling Firestore setDoc
    if (!auth.currentUser || auth.currentUser.uid !== newItem.registeredByUserId) {
      console.error("[ADD_ITEM_AUTH_MISMATCH]", {
        authUid: auth.currentUser?.uid || null,
        registeredByUserId: newItem.registeredByUserId,
      });
      throw new Error("Falha de consistência de autenticação: UID do autor não coincide com a sessão ativa.");
    }

    // 🔍 Temporary Forensic Runtime Instrumentation (Diagnostic Only)
    const firebaseUser = auth.currentUser;
    const tokenResult = firebaseUser ? await firebaseUser.getIdTokenResult(true).catch(() => null) : null;
    let userDocExists = false;
    let userDocData: any = null;
    if (firebaseUser?.uid) {
      try {
        const uSnap = await getDoc(doc(db, "users", firebaseUser.uid));
        userDocExists = uSnap.exists();
        userDocData = userDocExists ? uSnap.data() : null;
      } catch (_) {}
    }

    console.log("[FIRESTORE_FORENSIC_RUNTIME]", {
      uid: firebaseUser?.uid ?? null,
      email: firebaseUser?.email ?? null,
      emailVerifiedClient: firebaseUser?.emailVerified ?? null,
      tokenEmailVerified: tokenResult?.claims?.email_verified ?? null,
      tokenRole: tokenResult?.claims?.role ?? null,
      tokenAdmin: tokenResult?.claims?.admin ?? null,
      registeredByUserId: newItem.registeredByUserId ?? null,
      registeredByRole: newItem.registeredByRole ?? null,
      itemId: newItem.id ?? null,
      userDocExists,
      userDocRole: userDocData?.role ?? null,
      userDocStatus: userDocData?.status ?? null,
      userDocApprovalStatus: userDocData?.approvalStatus ?? null,
    });

    try {
      await setDoc(doc(db, "items", newItem.id), sanitizedItemPayload);
      const confirmedItem: LostFoundItem = { ...newItem, isOfflineQueued: false, syncedAt: new Date().toISOString() };
      
      // Remove any residual pending queue entry for this item
      await removeSyncQueueEntryByItemId(newItem.id);
      const queueCount = await getSyncQueueCount();
      setPendingSyncCount(queueCount);

      setItems((prev) => [confirmedItem, ...prev.filter((i) => i.id !== newItem.id)]);
      
      const itemTxId = `TX-ITEM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      await recordAuditLog({
        objectId: newItem.id,
        objectType: "ITEM",
        objectTitle: newItem.title,
        action: "CADASTRO_OCORRENCIA",
        fieldChanged: "status_inicial",
        oldValue: "NAO_REGISTRADO",
        newValue: newItem.status,
        details: `Ocorrência #${newItem.id} "${newItem.title}" (${newItem.type}) cadastrada no campus ${newItem.location} com persistência confirmada (${payloadSizeBytes} bytes).`,
        transactionId: itemTxId,
      });

      if (currentUser?.role === "ADMIN" || currentUser?.role === "SERVIDOR") {
        await logAdminAction(
          "CADASTRO_OCORRENCIA",
          `Cadastrou a ocorrência #${newItem.id} "${newItem.title}" (${newItem.type}) - Local: ${newItem.location}`
        );
      }
      updateUploadTask(taskId, {
        progress: 100,
        status: "COMPLETED",
        statusMessage: "Persistência confirmada com sucesso no Firestore!",
        completedAt: new Date().toISOString(),
      });
      vibrateSuccess();

      // Trigger automatic Discord Webhook notification ONLY after confirmed database save
      const discordItemPayload = {
        ...confirmedItem,
        imageUrl:
          confirmedItem.imageUrl &&
          (confirmedItem.imageUrl.startsWith("http://") || confirmedItem.imageUrl.startsWith("https://"))
            ? confirmedItem.imageUrl
            : undefined,
      };

      if (confirmedItem.type === "ENCONTRADO") {
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
      } else if (confirmedItem.type === "PERDIDO") {
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
      const originalCode = e?.code || (e?.name === "FirebaseError" ? "firestore/unknown" : undefined);
      const originalName = e?.name || "UnknownError";
      const originalMessage = e?.message || String(e);
      const originalStack = e?.stack;

      console.error("[ADD_ITEM_FIRESTORE_ORIGINAL_ERROR]", {
        code: originalCode,
        name: originalName,
        message: originalMessage,
        stack: originalStack,
        itemId: newItem.id,
        taskId,
        collection: "items",
        documentId: newItem.id,
        operation: "setDoc()",
        payloadSizeBytes,
        online: typeof navigator !== "undefined" ? navigator.onLine : undefined,
        authUid: auth.currentUser?.uid || null,
        authEmail: auth.currentUser?.email || null,
        authEmailVerified: auth.currentUser?.emailVerified ?? null,
        registeredByUserId: newItem.registeredByUserId,
        registeredByRole: newItem.registeredByRole,
      });

      const classifiedErr = classifySyncError(e, payloadSizeBytes);
      console.warn(`[Cadastro] Falha ao persistir no Firestore (${classifiedErr.category}):`, e);
      const queuedItem: LostFoundItem = { ...newItem, isOfflineQueued: true };
      try {
        await queueOfflineItemRegistration(queuedItem, {
          status: classifiedErr.isPermanent ? "ERRO_PERMANENTE" : "PENDENTE",
          errorType: classifiedErr.category,
          error: classifiedErr.reason,
          payloadSizeBytes,
        });
        setItems((prev) => [queuedItem, ...prev.filter((i) => i.id !== newItem.id)]);
        const queueCount = await getSyncQueueCount();
        setPendingSyncCount(queueCount);
        updateUploadTask(taskId, {
          progress: 100,
          status: classifiedErr.isPermanent ? "ERROR" : "QUEUED_SYNC",
          error: classifiedErr.reason,
          statusMessage: classifiedErr.isPermanent
            ? classifiedErr.userMessage
            : "Conexão instável. Salvo no IndexedDB para Background Sync.",
          isBackgroundSyncRegistered: !classifiedErr.isPermanent,
          completedAt: new Date().toISOString(),
        });
        addToast(classifiedErr.userMessage, classifiedErr.isPermanent ? "warning" : "info");
        return { newItem: queuedItem, matches: [], persistenceStatus: classifiedErr.isPermanent ? "ERROR" : "PENDING_SYNC", isOffline: true };
      } catch (_) {}
      updateUploadTask(taskId, {
        status: "ERROR",
        error: classifiedErr.reason || "Erro durante upload",
        statusMessage: classifiedErr.userMessage,
      });
      handleFirestoreError(e, OperationType.WRITE, `items/${newItem.id}`);
      return { newItem: queuedItem, matches: [], persistenceStatus: "ERROR", isOffline: true };
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

          // Institutional accounts (Admin/Servidor) can persist counterpart notifications directly;
          // for regular users, the backend route /api/fcm/send-match-alert securely creates the record via Admin SDK.
          if (currentUser?.role === "ADMIN" || currentUser?.role === "SERVIDOR") {
            try {
              await setDoc(doc(db, "notifications", counterpartNotif.id), sanitizeFirestoreData(counterpartNotif));
            } catch (e) {
              handleFirestoreError(e, OperationType.WRITE, `notifications/${counterpartNotif.id}`);
            }
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
        title: "Encontramos objetos semelhantes.",
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

      // Display system notification and toast
      addToast("Encontramos objetos semelhantes.", "info");
      setAiMatchAlert({ newItem, matches: aiMatches });

      displayWebPushNotification(
        "Encontramos objetos semelhantes.",
        `A IA encontrou ${topMatch.matchScore}% de similaridade com: ${topMatch.matchedItem.title} (${topMatch.matchedItem.location})`,
        {
          url: `/?item=${topMatch.matchedItem.id}`,
          itemId: topMatch.matchedItem.id,
          matchScore: topMatch.matchScore,
        }
      );

      // Dispatch real email notifications to counterpart owners and registering user
      for (const match of aiMatches) {
        try {
          sendMatchEmailAlert({
            targetUserId: match.matchedItem.registeredByUserId,
            targetEmail: match.matchedItem.contactInfo,
            matchScore: match.matchScore,
            newItem: {
              id: newItem.id,
              title: newItem.title,
              type: newItem.type,
              category: newItem.category,
              color: newItem.color,
              brand: newItem.brand,
              location: newItem.location,
              description: newItem.description,
              date: newItem.date,
            },
            counterpartItem: {
              id: match.matchedItem.id,
              title: match.matchedItem.title,
              type: match.matchedItem.type,
              category: match.matchedItem.category,
              color: match.matchedItem.color,
              brand: match.matchedItem.brand,
              location: match.matchedItem.location,
              description: match.matchedItem.description,
            },
            matchedFeatures: match.matchedFeatures,
            reason: match.reason,
            currentUserEmail: currentUser?.email,
            currentUserName: currentUser?.name,
          }).catch((mailErr) => console.warn("Aviso ao despachar e-mail de correspondência:", mailErr));
        } catch (_) {}
      }
    }

    addToast(`Objeto "${newItem.title}" cadastrado com sucesso no Firestore!`, "success");
    return { newItem, matches: aiMatches, persistenceStatus: "CONFIRMED", isOffline: false };
  };

  const suggestMatchesForItem = async (targetItem: LostFoundItem): Promise<AIMatchResult[]> => {
    const counterpartType = targetItem.type === "PERDIDO" ? "ENCONTRADO" : "PERDIDO";
    const candidates = items.filter(
      (it) => it.type === counterpartType && it.id !== targetItem.id && it.status !== "DEVOLVIDO" && it.status !== "ENCERRADO"
    );
    if (candidates.length === 0) return [];

    try {
      const aiRes = await safeFetchJson(
        "/api/ai/match-similarity",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newItem: targetItem,
            candidateItems: candidates.slice(0, 20),
          }),
        },
        () => ({ matches: clientMatchSimilarity(targetItem, candidates.slice(0, 20)) })
      );

      const rawMatches = Array.isArray(aiRes?.matches) ? aiRes.matches : [];
      return rawMatches
        .map((m: any) => {
          const found = candidates.find((c) => c.id === m.itemId);
          return found
            ? {
                matchedItem: found,
                matchScore: m.matchScore,
                reason: m.reason || "Semelhança identificada pela IA",
                matchedFeatures: m.matchedFeatures || [],
              }
            : null;
        })
        .filter(Boolean) as AIMatchResult[];
    } catch (err) {
      console.error("Erro ao sugerir correspondências:", err);
      return [];
    }
  };

  const updateItemStatus = async (id: string, status: ItemStatus) => {
    // 🔒 Security Guard: Only authenticated users can change status
    if (isGuest || !auth.currentUser) {
      setAuthModalOpen(true);
      addToast("É necessário fazer login para alterar o status do objeto.", "warning");
      throw new Error("Autenticação necessária para alterar o status.");
    }

    const existing = items.find((i) => i.id === id);
    if (!existing) {
      addToast("Objeto não encontrado no sistema.", "error");
      throw new Error("Objeto não encontrado.");
    }

    // 🔒 Authorization Check: Only creator or Staff/Admin can change status
    const isOwner = Boolean(
      (auth.currentUser && existing.registeredByUserId === auth.currentUser.uid) ||
      (currentUser && currentUser.id !== DEFAULT_GUEST_USER.id && existing.registeredByUserId === currentUser.id)
    );
    const isStaffOrAdmin =
      currentUser?.role === "ADMIN" ||
      currentUser?.role === "SERVIDOR" ||
      auth.currentUser?.email === "paulocauan39@gmail.com";

    if (!isOwner && !isStaffOrAdmin) {
      addToast("Você não possui permissão para alterar o status deste pertence.", "error");
      throw new Error("Permissão negada para alteração de status.");
    }

    const effectiveUserId = auth.currentUser.uid;
    const effectiveUserName = currentUser?.name || auth.currentUser.displayName || "Usuário IFPR";
    const effectiveUserRole: UserRole = currentUser?.role || (auth.currentUser.email === "paulocauan39@gmail.com" ? "ADMIN" : "ALUNO");

    const existingHistory = existing?.history || existing?.historyLogs || [];
    const isResolved = status === "DEVOLVIDO" || status === "ENCERRADO";

    const newHistLog: ItemHistoryLog = {
      id: `hist-${Date.now()}`,
      action: `Status alterado para ${status}`,
      actorId: effectiveUserId,
      actorName: effectiveUserName,
      actorRole: effectiveUserRole,
      userId: effectiveUserId,
      userName: effectiveUserName,
      userRole: effectiveUserRole,
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

      // Immediately update local state
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? { ...it, status, resolutionDate: isResolved ? new Date().toISOString() : undefined, history: [...existingHistory, newHistLog] }
            : it
        )
      );
      
      const statusTxId = `TX-STAT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      await recordAuditLog({
        objectId: id,
        objectType: "ITEM",
        objectTitle: existing?.title || id,
        action: "STATUS_OVERRIDE",
        fieldChanged: "status",
        oldValue: existing?.status || "DESCONHECIDO",
        newValue: status,
        details: `Status do objeto '${existing?.title || id}' alterado de ${existing?.status || "DESCONHECIDO"} para ${status}.`,
        transactionId: statusTxId,
      });

      if (isStaffOrAdmin) {
        await logAdminAction(
          "STATUS_OVERRIDE",
          `Alterou o status do objeto #${id} para '${status}'`
        );
      }
      addToast(`Status do objeto atualizado para: ${status.replace("_", " ")}`, "info");

      // Automated email notification when marked as DEVOLVIDO
      if (status === "DEVOLVIDO" && existing) {
        const ownerEmail = (existing as any).registeredByUserEmail || existing.contactInfo || "localizamais0@gmail.com";
        safeFetchJson(
          "/api/automation/notify-item-returned",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              itemId: id,
              itemTitle: existing.title,
              recipientEmail: ownerEmail,
              recipientName: existing.registeredByName || "Comunidade IFPR",
              qrCodeId: existing.qrCodeId,
              location: existing.location,
              category: existing.category,
              resolutionNotes: `Devolução finalizada no sistema por ${effectiveUserName}.`,
            }),
          },
          () => ({ success: true })
        ).catch(() => {});
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `items/${id}`);
      throw e;
    }
  };

  const updateItemData = async (id: string, updatedFields: Partial<LostFoundItem>) => {
    // 🔒 Security Guard: Only authenticated users can update items
    if (isGuest || !auth.currentUser) {
      setAuthModalOpen(true);
      addToast("É necessário fazer login para editar informações do objeto.", "warning");
      throw new Error("Autenticação necessária para editar o item.");
    }

    const existing = items.find((i) => i.id === id);
    if (!existing) {
      addToast("Objeto não encontrado no sistema.", "error");
      throw new Error("Objeto não encontrado.");
    }

    // 🔒 Authorization Check: Only creator or Staff/Admin can edit item
    const isOwner = Boolean(
      (auth.currentUser && existing.registeredByUserId === auth.currentUser.uid) ||
      (currentUser && currentUser.id !== DEFAULT_GUEST_USER.id && existing.registeredByUserId === currentUser.id)
    );
    const isStaffOrAdmin =
      currentUser?.role === "ADMIN" ||
      currentUser?.role === "SERVIDOR" ||
      auth.currentUser?.email === "paulocauan39@gmail.com";

    if (!isOwner && !isStaffOrAdmin) {
      addToast("Você não possui permissão para editar os dados deste pertence.", "error");
      throw new Error("Permissão negada: apenas o autor ou servidores/administradores podem editar este item.");
    }

    // Strict text field length validation (Defense in Depth)
    const textValidation = validateItemTextFields({
      title: updatedFields.title,
      description: updatedFields.description,
      location: updatedFields.location,
      color: updatedFields.color,
      brand: updatedFields.brand,
      contactInfo: updatedFields.contactInfo,
    }, true);
    if (!textValidation.isValid) {
      addToast(textValidation.error || "Limite de caracteres excedido.", "error");
      throw new Error(textValidation.error || "Campo de texto excede o limite permitido.");
    }

    if (updatedFields.date !== undefined) {
      const dateValidation = validateItemOccurrenceDate(updatedFields.date, "A data da ocorrência");
      if (!dateValidation.isValid) {
        addToast(dateValidation.error || "Data inválida ou futura não permitida.", "error");
        throw new Error(dateValidation.error || "A data da ocorrência não pode ser futura.");
      }
    }

    const effectiveUserId = auth.currentUser.uid;
    const effectiveUserName = currentUser?.name || auth.currentUser.displayName || "Usuário IFPR";
    const effectiveUserRole: UserRole = currentUser?.role || (auth.currentUser.email === "paulocauan39@gmail.com" ? "ADMIN" : "ALUNO");

    const existingHistory = existing?.history || [];
    const newHistLog: ItemHistoryLog = {
      id: `hist-${Date.now()}`,
      action: "Alteração da ocorrência",
      actorId: effectiveUserId,
      actorName: effectiveUserName,
      actorRole: effectiveUserRole,
      userId: effectiveUserId,
      userName: effectiveUserName,
      userRole: effectiveUserRole,
      timestamp: new Date().toISOString(),
      details: "Dados da ocorrência foram atualizados no sistema.",
    };

    const safeUpdates = { ...updatedFields };
    delete (safeUpdates as any).id;
    delete (safeUpdates as any).registeredByUserId;
    delete (safeUpdates as any).registeredByRole;
    delete (safeUpdates as any).createdAt;
    if (!isStaffOrAdmin) {
      delete (safeUpdates as any).status;
    }

    const mergedData = sanitizeFirestoreData({
      ...safeUpdates,
      lastEditedByUserId: effectiveUserId,
      lastEditedByName: effectiveUserName,
      lastEditedByRole: effectiveUserRole,
      lastEditedAt: new Date().toISOString(),
      history: [...existingHistory, newHistLog],
    });

    try {
      await updateDoc(doc(db, "items", id), mergedData);

      // Update local state immediately
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? { ...it, ...safeUpdates, history: [...existingHistory, newHistLog], lastEditedAt: mergedData.lastEditedAt }
            : it
        )
      );
      
      const editTxId = `TX-EDIT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const fieldsList = Object.keys(updatedFields).join(", ");
      await recordAuditLog({
        objectId: id,
        objectType: "ITEM",
        objectTitle: updatedFields.title || existing?.title || id,
        action: "EDIT_OCORRENCIA",
        fieldChanged: fieldsList || "dados_gerais",
        oldValue: existing?.title || "Valores anteriores",
        newValue: updatedFields.title || "Valores atualizados",
        details: `Atualização cadastral do objeto #${id} (${existing?.title || ""}) nos campos: ${fieldsList}.`,
        transactionId: editTxId,
      });

      if (isStaffOrAdmin) {
        await logAdminAction(
          "EDIT_OCORRENCIA",
          `Atualizou os dados da ocorrência #${id} por ${effectiveUserName} (${effectiveUserRole})`
        );
      }
      addToast("Ocorrência atualizada com sucesso!", "success");
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `items/${id}`);
      throw e;
    }
  };

  const registerItemReturn = async (
    itemId: string,
    returnData: ItemReturnData
  ) => {
    // 🔒 Security Guard: Only Staff / Admin can register returns
    if (isGuest || !auth.currentUser) {
      setAuthModalOpen(true);
      addToast("É necessário fazer login como servidor ou administrador para registrar devoluções.", "warning");
      throw new Error("Autenticação necessária.");
    }

    const isStaffOrAdmin =
      currentUser?.role === "ADMIN" ||
      currentUser?.role === "SERVIDOR" ||
      auth.currentUser?.email === "paulocauan39@gmail.com";

    if (!isStaffOrAdmin) {
      addToast("Apenas servidores ou administradores podem registrar a devolução oficial de itens.", "error");
      throw new Error("Permissão negada para registrar devolução.");
    }

    const existing = items.find((i) => i.id === itemId);
    const existingHistory = existing?.history || [];
    const validationCode = "COMP-IFPR-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    const now = new Date();
    const returnDate = now.toLocaleDateString("pt-BR");
    const returnTime = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const signatureToken = returnData.signatureToken || generateSecureSignatureToken("sig_");
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const isDirectlySigned = returnData.signatureType === "IN_PERSON_DEVICE" && !!returnData.signatureDataUrl;
    const isRemoteEmail = returnData.signatureType === "REMOTE_EMAIL";

    const effectiveUserId = auth.currentUser.uid;
    const effectiveUserName = currentUser?.name || auth.currentUser.displayName || "Servidor IFPR";
    const effectiveUserRole: UserRole = currentUser?.role || (auth.currentUser.email === "paulocauan39@gmail.com" ? "ADMIN" : "SERVIDOR");

    const newHistLog: ItemHistoryLog = {
      id: `hist-${Date.now()}`,
      action: isDirectlySigned
        ? "Devolução registrada com Assinatura Presencial"
        : isRemoteEmail
        ? "Devolução registrada (Aguardando Assinatura por E-mail)"
        : "Devolução registrada",
      actorId: effectiveUserId,
      actorName: effectiveUserName,
      actorRole: effectiveUserRole,
      userId: effectiveUserId,
      userName: effectiveUserName,
      userRole: effectiveUserRole,
      timestamp: now.toISOString(),
      details: `Devolução concluída para ${returnData.recipientName} (${returnData.recipientBond}). Servidor responsável: ${effectiveUserName}.${
        isDirectlySigned ? " Assinatura digital colhida no dispositivo." : isRemoteEmail ? " Link de assinatura enviado por e-mail." : ""
      }`,
    };

    const updatePayload = sanitizeFirestoreData({
      status: "DEVOLVIDO" as ItemStatus,
      resolutionDate: now.toISOString(),
      returnDate,
      returnTime,
      returnedByUserId: effectiveUserId,
      returnedByName: effectiveUserName,
      returnedByRole: effectiveUserRole,
      recipientName: returnData.recipientName,
      recipientEmail: returnData.recipientEmail,
      recipientBond: returnData.recipientBond,
      recipientDocument: returnData.recipientDocument || "",
      returnObservations: returnData.returnObservations || returnData.observations || "",
      receiptValidationCode: validationCode,
      recipientSignatureUrl: returnData.signatureDataUrl || "",
      recipientSignatureType: returnData.signatureType || (isDirectlySigned ? "IN_PERSON_DEVICE" : isRemoteEmail ? "REMOTE_EMAIL" : "PRE_VERIFIED"),
      recipientSignatureStatus: isDirectlySigned ? "SIGNED" : isRemoteEmail ? "PENDING_REMOTE" : "NOT_REQUIRED",
      signatureToken: isRemoteEmail ? signatureToken : undefined,
      signatureTokenExpiresAt: isRemoteEmail ? expiresAt : undefined,
      signedAt: isDirectlySigned ? now.toISOString() : undefined,
      history: [...existingHistory, newHistLog],
      historyLogs: [...existingHistory, newHistLog],
    });

    try {
      await updateDoc(doc(db, "items", itemId), updatePayload);

      // Immediately update local state
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId
            ? { ...it, ...updatePayload, status: "DEVOLVIDO" }
            : it
        )
      );
      
      const returnTxId = `TX-RET-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      await recordAuditLog({
        objectId: itemId,
        objectType: "RETURN",
        objectTitle: existing?.title || itemId,
        action: "REGISTRO_DEVOLUCAO",
        fieldChanged: "status_devolucao",
        oldValue: existing?.status || "ENCONTRADO",
        newValue: "DEVOLVIDO",
        details: `Devolução do item #${itemId} (${existing?.title || ""}) concluída para ${returnData.recipientName} (${returnData.recipientBond}). Código validador: ${validationCode}.${isDirectlySigned ? " Assinatura presencial colhida." : ""}`,
        transactionId: returnTxId,
      });

      await logAdminAction(
        "REGISTRO_DEVOLUCAO",
        `Registrou a devolução do item #${itemId} (${existing?.title || ""}) para ${returnData.recipientName} (${returnData.recipientBond}). Responsável: ${effectiveUserName}`
      );
      addToast(`Devolução do item #${itemId} registrada com sucesso!`, "success");

      // Automated email notification / remote signature link
      const targetEmail = returnData.recipientEmail || (existing as any)?.registeredByUserEmail || "localizamais0@gmail.com";
      const originUrl = typeof window !== "undefined" ? window.location.origin : "";
      const signatureLink = `${originUrl}/?tab=sign-receipt&itemId=${encodeURIComponent(itemId)}&token=${encodeURIComponent(signatureToken)}`;

      if (isRemoteEmail) {
        // Send email with remote signature request
        safeFetchJson(
          "/api/signature/send-request",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              itemId,
              itemTitle: existing?.title || "Pertence",
              recipientEmail: targetEmail,
              recipientName: returnData.recipientName,
              signatureLink,
              signatureToken,
              returnedByName: effectiveUserName,
            }),
          },
          () => ({ success: true })
        ).catch(() => {});
      } else {
        // Standard automated return confirmation email
        safeFetchJson(
          "/api/automation/notify-item-returned",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              itemId,
              itemTitle: existing?.title || "Pertence",
              recipientEmail: targetEmail,
              recipientName: returnData.recipientName,
              qrCodeId: existing?.qrCodeId,
              location: existing?.location,
              category: existing?.category,
              resolutionNotes: returnData.returnObservations || returnData.observations || `Devolução concluída por ${effectiveUserName}`,
            }),
          },
          () => ({ success: true })
        ).catch(() => {});
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `items/${itemId}`);
      throw e;
    }
  };

  const submitItemDigitalSignature = async (
    itemId: string,
    signatureData: {
      signatureDataUrl: string;
      signerName: string;
      signerEmail?: string;
      signerBond?: string;
      documentNumber?: string;
      signatureType?: "IN_PERSON_DEVICE" | "REMOTE_EMAIL";
    }
  ) => {
    const existing = items.find((i) => i.id === itemId);
    const existingHistory = existing?.history || [];
    const now = new Date().toISOString();

    const newHistLog: ItemHistoryLog = {
      id: `hist-sign-${Date.now()}`,
      action: "Assinatura Digital Gravada",
      actorId: currentUser?.id || "remote-user",
      actorName: signatureData.signerName,
      actorRole: (signatureData.signerBond === "Servidor" ? "SERVIDOR" : "ALUNO") as any,
      timestamp: now,
      details: `Assinatura digital do termo de recebimento concluída (${signatureData.signerName}).`,
    };

    const updatePayload = sanitizeFirestoreData({
      recipientSignatureUrl: signatureData.signatureDataUrl,
      recipientSignatureType: signatureData.signatureType || "IN_PERSON_DEVICE",
      recipientSignatureStatus: "SIGNED",
      recipientDocument: signatureData.documentNumber || existing?.recipientDocument || "",
      signedAt: now,
      status: "DEVOLVIDO" as ItemStatus,
      history: [...existingHistory, newHistLog],
      historyLogs: [...existingHistory, newHistLog],
    });

    try {
      await updateDoc(doc(db, "items", itemId), updatePayload);
      await logAdminAction(
        "ASSINATURA_DIGITAL_RECEBIDA",
        `Gravou a assinatura digital da ocorrência #${itemId} para ${signatureData.signerName}`
      );
      addToast("Assinatura digital registrada com sucesso!", "success");
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `items/${itemId}`);
    }
  };

  const updateDocDirectly = async (collectionName: string, docId: string, data: Record<string, any>) => {
    try {
      await updateDoc(doc(db, collectionName, docId), sanitizeFirestoreData(data));
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${collectionName}/${docId}`);
      throw e;
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
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId
            ? {
                ...it,
                status: previousStatus,
                resolutionDate: undefined,
                returnedByUserId: undefined,
                returnedByName: undefined,
                returnedByRole: undefined,
                returnDate: undefined,
                returnTime: undefined,
                recipientName: undefined,
                recipientEmail: undefined,
                recipientBond: undefined,
                history: [...existingHistory, newHistLog],
                historyLogs: [...existingHistory, newHistLog],
              }
            : it
        )
      );
      await logAdminAction(
        "REABERTURA_DEVOLUCAO",
        `Reabriu a devolução do objeto #${itemId} (${existing.title}). Motivo: ${reason}`
      );
      addToast(`Devolução do objeto #${itemId} reaberta! O item retornou para a lista de pendentes.`, "success");
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `items/${itemId}`);
      throw e;
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
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId
            ? {
                ...it,
                status: "ENCERRADO" as ItemStatus,
                destinationType: destType,
                destinationReason: destReason,
                destinationDate: now.toISOString(),
                destinationResponsible: currentUser.name,
                history: [...existingHistory, newHistLog],
                historyLogs: [...existingHistory, newHistLog],
              }
            : it
        )
      );
      await logAdminAction(
        "DESTINACAO_ITEM",
        `Registrou destinação do item não reclamado #${itemId} (${existing.title}). Tipo: ${destType}. Motivo: ${destReason}`
      );
      addToast(`Destinação do objeto #${itemId} registrada com sucesso.`, "success");
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `items/${itemId}`);
      throw e;
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
    // 🔒 Security Guard: Only authenticated users can delete items
    if (isGuest || !auth.currentUser) {
      setAuthModalOpen(true);
      addToast("É necessário fazer login para excluir um item.", "warning");
      throw new Error("Autenticação necessária para excluir.");
    }

    const existing = items.find((i) => i.id === id);
    if (!existing) {
      addToast("Objeto não encontrado.", "error");
      return;
    }

    // 🔒 Authorization Check: Only creator or Admin can delete
    const isOwner = Boolean(
      (auth.currentUser && existing.registeredByUserId === auth.currentUser.uid) ||
      (currentUser && currentUser.id !== DEFAULT_GUEST_USER.id && existing.registeredByUserId === currentUser.id)
    );
    const isAdmin =
      currentUser?.role === "ADMIN" ||
      auth.currentUser?.email === "paulocauan39@gmail.com";

    if (!isOwner && !isAdmin) {
      addToast("Você não possui permissão para excluir este pertence.", "error");
      throw new Error("Permissão negada para exclusão.");
    }

    try {
      await deleteDoc(doc(db, "items", id));
      setItems((prev) => prev.filter((i) => i.id !== id));
      addToast("Objeto removido com sucesso.", "info");

      await recordAuditLog({
        objectId: id,
        objectType: "ITEM",
        objectTitle: existing?.title || id,
        action: "EXCLUSAO_ITEM",
        fieldChanged: "status",
        oldValue: existing?.status || "ATIVO",
        newValue: "EXCLUIDO",
        details: `Objeto #${id} (${existing?.title || ""}) foi excluído do sistema por ${currentUser?.name || auth.currentUser?.displayName || "Usuário"}.`,
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `items/${id}`);
      throw e;
    }
  };

  const submitClaim = async (itemId: string, verificationAnswer: string) => {
    if (isGuest || !auth.currentUser) {
      setAuthModalOpen(true);
      addToast("Faça login para solicitar a devolução deste objeto.", "warning");
      throw new Error("Autenticação necessária para solicitar devolução.");
    }

    const item = items.find((i) => i.id === itemId);
    if (!item) {
      addToast("Objeto não encontrado.", "error");
      return;
    }

    const effectiveUserId = auth.currentUser.uid;
    const effectiveUserName = currentUser?.name || auth.currentUser.displayName || "Usuário IFPR";
    const effectiveUserEmail = auth.currentUser.email || currentUser?.email || "";
    const effectiveUserRole: UserRole = currentUser?.role || "ALUNO";

    const newClaim: ItemClaim = {
      id: `claim-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      itemId,
      itemTitle: item.title,
      claimerId: effectiveUserId,
      claimerName: effectiveUserName,
      claimerEmail: effectiveUserEmail,
      claimerRole: effectiveUserRole,
      verificationAnswer,
      status: "PENDENTE",
      createdAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, "claims", newClaim.id), sanitizeFirestoreData(newClaim));
      await updateItemStatus(itemId, "EM_ANALISE");

      const claimerNotif: NotificationItem = {
        id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        userId: effectiveUserId,
        isGlobal: false,
        title: "Solicitação de Devolução Registrada",
        message: `Sua solicitação de devolução para "${item.title}" foi enviada com sucesso e está em análise pela equipe do IFPR.`,
        timestamp: new Date().toISOString(),
        read: false,
        type: "CLAIM_UPDATE",
        relatedItemId: itemId,
      };
      await setDoc(doc(db, "notifications", claimerNotif.id), sanitizeFirestoreData(claimerNotif));

      addToast("Solicitação salva no Firestore! A equipe do IFPR analisará a comprovação.", "success");
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `claims/${newClaim.id}`);
      throw e;
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
      setNotifications((prev) => [notif, ...prev]);
      const targetUserName = allUsers.find((u) => u.id === targetUserId)?.name || targetUserId;
      await logAdminAction(
        "ADMIN_NOTIFICATION",
        `Notificação enviada por ${currentUser.name} (${currentUser.role}) para ${targetUserName}: "${title}"`
      );
      addToast(`Notificação enviada para ${targetUserName} com sucesso!`, "success");
    } catch (e) {
      console.error("Erro ao salvar notificação no Firestore:", e);
      addToast("Erro ao gravar notificação no banco de dados.", "error");
      throw e;
    }
  };

  const markNotificationRead = async (id: string) => {
    try {
      await updateDoc(doc(db, "notifications", id), sanitizeFirestoreData({ read: true }));
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `notifications/${id}`);
      throw e;
    }
  };

  const clearAllNotifications = async () => {
    try {
      const userNotifs = notifications.filter(
        (n) => isNotificationForUser(n, currentUser, firebaseUser?.uid) && !n.read
      );
      const succeededIds: string[] = [];
      for (const n of userNotifs) {
        try {
          await updateDoc(doc(db, "notifications", n.id), sanitizeFirestoreData({ read: true }));
          succeededIds.push(n.id);
        } catch (err) {
          console.error(`Erro ao marcar notificação ${n.id} como lida:`, err);
        }
      }
      if (succeededIds.length > 0) {
        setNotifications((prev) =>
          prev.map((n) =>
            succeededIds.includes(n.id) ? { ...n, read: true } : n
          )
        );
      }
      if (userNotifs.length > 0 && succeededIds.length === userNotifs.length) {
        addToast("Notificações marcadas como lidas.", "info");
      } else if (succeededIds.length > 0) {
        addToast(`${succeededIds.length} notificações atualizadas no servidor.`, "info");
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, "notifications");
      throw e;
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
        updateUserStatus,
        deleteUser,
        switchUserRole,
        loginWithGoogle,
        loginWithEmailPassword,
        registerWithEmailPassword,
        updateUserProfileData,
        logout,
        firebaseUser,
        authLoading,
        isAuthLoading: authLoading,
        isAuthenticated,
        isGuest,
        isEmailVerified,
        isEmailVerificationRequired,
        checkVerificationStatus,
        resendVerificationEmail,
        pendingPostLoginAction,
        setPendingPostLoginAction,
        requestAuthForRegistration,
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
        approveAllPendingUsers,
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
        systemAuditLogs,
        recordAuditLog,
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
        submitItemDigitalSignature,
        updateDocDirectly,
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
        isSyncing,
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
        cancelUploadTask,
        retryUploadTask,
        documentTemplates,
        generatedDocuments,
        projectSettings,
        saveDocumentTemplate,
        deleteDocumentTemplate,
        duplicateDocumentTemplate,
        toggleDocumentTemplateStatus,
        logGeneratedDocument,
        deleteGeneratedDocument,
        saveProjectSettings,
        resetProjectSettingsToDefault,
        suggestMatchesForItem,
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
