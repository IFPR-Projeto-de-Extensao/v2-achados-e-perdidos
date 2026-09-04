import { collection, addDoc } from "firebase/firestore";
import { db } from "./firebase";
import { User, TestStatus } from "../types";
import { sanitizeForFirestore } from "./utils";

export interface TestErrorLogRecord {
  id: string;
  batteryId: string;
  testId: string;
  testTitle?: string;
  action:
    | "SAVE_TEST_CASE"
    | "UPDATE_STATUS"
    | "AUTO_SAVE"
    | "RESTORE_BACKUP"
    | "NETWORK_TIMEOUT"
    | "OFFLINE_FALLBACK";
  errorMessage: string;
  errorStack?: string;
  timestamp: string; // ISO 8601
  isOnline: boolean;
  userId?: string;
  userEmail?: string;
  user?: {
    id?: string;
    name?: string;
    email?: string;
    role?: string;
  };
  formDataSnapshot?: {
    status?: TestStatus;
    obtainedResult?: string;
    observations?: string;
    recordId?: string;
    transactionId?: string;
    logText?: string;
    url?: string;
    screenshotUrl?: string;
  };
  resolved?: boolean;
}

const ERROR_LOGS_STORAGE_KEY = "localiza_test_error_logs";
const MAX_LOCAL_ERROR_LOGS = 100;

function getStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== "undefined") {
      return localStorage;
    }
  } catch {
    // Storage access may be restricted in sandbox/iframe
  }
  return null;
}

/**
 * Centralized Error Logging Service for Test Executions.
 *
 * Logs test execution errors, persistence failures, network timeouts,
 * and offline events to both local storage (for offline resilience)
 * and the remote Firestore collection (for centralized admin oversight).
 */
export async function logTestError(params: {
  batteryId: string;
  testId: string;
  testTitle?: string;
  action: TestErrorLogRecord["action"];
  error: unknown;
  currentUser?: User | null;
  formDataSnapshot?: TestErrorLogRecord["formDataSnapshot"];
}): Promise<TestErrorLogRecord> {
  const {
    batteryId,
    testId,
    testTitle,
    action,
    error,
    currentUser,
    formDataSnapshot,
  } = params;

  const nowIso = new Date().toISOString();
  const isOnline =
    typeof navigator !== "undefined" && typeof navigator.onLine === "boolean"
      ? navigator.onLine
      : true;

  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : "Erro desconhecido ao processar teste";

  const errorStack = error instanceof Error ? error.stack : undefined;

  const record: TestErrorLogRecord = {
    id: `err-test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    batteryId,
    testId,
    testTitle,
    action,
    errorMessage,
    errorStack,
    timestamp: nowIso,
    isOnline,
    userId: currentUser?.id,
    userEmail: currentUser?.email,
    user: currentUser
      ? {
          id: currentUser.id,
          name: currentUser.name,
          email: currentUser.email,
          role: currentUser.role,
        }
      : undefined,
    formDataSnapshot,
    resolved: false,
  };

  // 1. Always persist in Local Storage (resilient even if offline)
  try {
    const storage = getStorage();
    if (storage) {
      const existingRaw = storage.getItem(ERROR_LOGS_STORAGE_KEY);
      const existing: TestErrorLogRecord[] = existingRaw
        ? JSON.parse(existingRaw)
        : [];
      const updated = [record, ...existing].slice(0, MAX_LOCAL_ERROR_LOGS);
      storage.setItem(ERROR_LOGS_STORAGE_KEY, JSON.stringify(updated));
    }
  } catch (localErr) {
    console.warn("Falha ao salvar log de erro de teste localmente:", localErr);
  }

  // 2. If online and Firestore is available, record in remote collection
  if (isOnline) {
    try {
      const sanitized = sanitizeForFirestore({
        ...record,
        loggedAt: nowIso,
      });
      await addDoc(collection(db, "test_error_logs"), sanitized);
    } catch (remoteErr) {
      // Remote logging failure must never interrupt the user flow
      console.warn("Não foi possível enviar o log para o Firestore:", remoteErr);
    }
  }

  console.error(
    `[TestErrorLogger] [${action}] Test #${testId} (Battery: ${batteryId}):`,
    errorMessage
  );

  return record;
}

/**
 * Returns the most recent test error logs from local storage.
 */
export function getRecentTestErrorLogs(): TestErrorLogRecord[] {
  try {
    const storage = getStorage();
    if (!storage) return [];
    const raw = storage.getItem(ERROR_LOGS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TestErrorLogRecord[];
  } catch {
    return [];
  }
}

/**
 * Returns error logs for a specific test case.
 */
export function getErrorLogsForTest(testId: string): TestErrorLogRecord[] {
  return getRecentTestErrorLogs().filter((log) => log.testId === testId);
}

/**
 * Clears local test error logs.
 */
export function clearTestErrorLogs(): void {
  try {
    const storage = getStorage();
    if (storage) {
      storage.removeItem(ERROR_LOGS_STORAGE_KEY);
    }
  } catch (e) {
    console.warn("Falha ao limpar logs de erro:", e);
  }
}

/**
 * Marks an error log as resolved.
 */
export function markTestErrorResolved(logId: string): void {
  try {
    const storage = getStorage();
    if (!storage) return;
    const logs = getRecentTestErrorLogs();
    const updated = logs.map((l) =>
      l.id === logId ? { ...l, resolved: true } : l
    );
    storage.setItem(ERROR_LOGS_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn("Falha ao atualizar status de resolução do log:", e);
  }
}
