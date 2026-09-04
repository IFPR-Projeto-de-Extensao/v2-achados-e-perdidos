import { doc, runTransaction, updateDoc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import {
  TestBatteryExecution,
  TestCaseItem,
  TestEvidence,
  TestExecutionAuditEntry,
  TestStatus,
  User,
  TestCaseHistoryEntry,
} from "../types";
import { sanitizeForFirestore } from "./utils";
import { logTestError } from "./testErrorLogService";

export interface SaveTestCaseAtomicParams {
  batteryId: string;
  testId: string;
  status: TestStatus;
  obtainedResult: string;
  observations: string;
  evidence: {
    recordId?: string;
    logText?: string;
    url?: string;
    transactionId?: string;
    screenshotUrl?: string;
  };
  currentUser: User | null;
  isAdmin: boolean;
  assignedToUserId?: string;
  assignedToName?: string;
  assignedToEmail?: string;
}

export interface SaveTestCaseAtomicResult {
  success: boolean;
  error?: string;
  updatedTest?: TestCaseItem;
  updatedBattery?: TestBatteryExecution;
}

export interface TestDraftData {
  status: TestStatus;
  obtainedResult: string;
  observations: string;
  recordId: string;
  transactionId: string;
  logText: string;
  url: string;
  screenshotUrl: string;
  savedAt: string;
}

const DRAFT_PREFIX = "localiza_test_draft_";

function getStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== "undefined") {
      return localStorage;
    }
  } catch {
    // Storage access might be restricted by browser settings
  }
  return null;
}

/**
 * Saves a local draft in localStorage so changes are never lost if the user
 * closes the tab, network drops, or a browser crash occurs.
 */
export function saveLocalTestDraft(
  batteryId: string,
  testId: string,
  draft: Omit<TestDraftData, "savedAt">
): void {
  try {
    const storage = getStorage();
    if (!storage) return;
    const key = `${DRAFT_PREFIX}${batteryId}_${testId}`;
    const payload: TestDraftData = {
      ...draft,
      savedAt: new Date().toISOString(),
    };
    storage.setItem(key, JSON.stringify(payload));
  } catch (e) {
    console.warn("Falha ao salvar rascunho local:", e);
  }
}

/**
 * Retrieves a stored local draft for a given test case in a battery.
 */
export function getLocalTestDraft(
  batteryId: string,
  testId: string
): TestDraftData | null {
  try {
    const storage = getStorage();
    if (!storage) return null;
    const key = `${DRAFT_PREFIX}${batteryId}_${testId}`;
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as TestDraftData;
  } catch (e) {
    console.warn("Falha ao recuperar rascunho local:", e);
    return null;
  }
}

/**
 * Clears the local draft once the test is confirmed saved to Firestore.
 */
export function clearLocalTestDraft(batteryId: string, testId: string): void {
  try {
    const storage = getStorage();
    if (!storage) return;
    const key = `${DRAFT_PREFIX}${batteryId}_${testId}`;
    storage.removeItem(key);
  } catch (e) {
    console.warn("Falha ao limpar rascunho local:", e);
  }
}

/**
 * Cleans all stored local drafts belonging to a specific battery execution.
 */
export function cleanAllTestDraftsForBattery(batteryId: string): void {
  try {
    const storage = getStorage();
    if (!storage) return;
    const prefix = `${DRAFT_PREFIX}${batteryId}_`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(prefix)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => storage.removeItem(k));
  } catch (e) {
    console.warn("Falha ao limpar rascunhos da bateria:", e);
  }
}

const BACKUP_PREFIX = "test_backup_";

/**
 * Saves a backup of the current form state in localStorage under a key bound to testId (`test_backup_${testId}`).
 * Used when Firestore saving fails (e.g., network error) to allow prioritized retry.
 */
export function saveTestBackup(
  testId: string,
  backup: Omit<TestDraftData, "savedAt"> | TestDraftData
): void {
  try {
    const storage = getStorage();
    if (!storage) return;
    const key = `${BACKUP_PREFIX}${testId}`;
    const payload: TestDraftData = {
      ...backup,
      savedAt: (backup as any).savedAt || new Date().toISOString(),
    };
    storage.setItem(key, JSON.stringify(payload));
  } catch (e) {
    console.warn(`Falha ao salvar backup local do teste #${testId}:`, e);
  }
}

/**
 * Retrieves the local backup for a given testId.
 */
export function getTestBackup(testId: string): TestDraftData | null {
  try {
    const storage = getStorage();
    if (!storage) return null;
    const key = `${BACKUP_PREFIX}${testId}`;
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as TestDraftData;
  } catch (e) {
    console.warn(`Falha ao carregar backup local do teste #${testId}:`, e);
    return null;
  }
}

/**
 * Clears the local backup bound to testId once successfully saved to Firestore.
 */
export function clearTestBackup(testId: string): void {
  try {
    const storage = getStorage();
    if (!storage) return;
    const key = `${BACKUP_PREFIX}${testId}`;
    storage.removeItem(key);
  } catch (e) {
    console.warn(`Falha ao remover backup local do teste #${testId}:`, e);
  }
}

/**
 * Checks if a local backup exists for testId.
 */
export function hasTestBackup(testId: string): boolean {
  return getTestBackup(testId) !== null;
}

/**
 * Performs an ATOMIC Firestore transaction to save test results, observations,
 * and evidences.
 *
 * CRITICAL ADVANTAGES OVER BLIND setDoc:
 * 1. Reads the latest live Firestore document inside the transaction.
 * 2. Updates ONLY the targeted test case within the tests array.
 * 3. Preserves all other test cases previously modified by other testers.
 * 4. Merges evidence fields so existing attachments are not destroyed.
 * 5. Automatically retries upon concurrent write conflicts.
 * 6. Appends to the immutably ordered audit trail.
 */
export async function saveTestCaseResultAtomic(
  params: SaveTestCaseAtomicParams
): Promise<SaveTestCaseAtomicResult> {
  const {
    batteryId,
    testId,
    status,
    obtainedResult,
    observations,
    evidence,
    currentUser,
    isAdmin,
    assignedToUserId,
    assignedToName,
    assignedToEmail,
  } = params;

  if (!batteryId || !testId) {
    return {
      success: false,
      error: "Identificador da bateria ou do caso de teste ausente.",
    };
  }

  const nowIso = new Date().toISOString();
  const txId =
    evidence.transactionId?.trim() ||
    `tx-evidence-${batteryId}-${testId}-${Date.now()}`;

  try {
    const batteryRef = doc(db, "test_executions", batteryId);

    const result = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(batteryRef);
      if (!snap.exists()) {
        throw new Error(
          `Bateria de testes '${batteryId}' não encontrada no Firestore.`
        );
      }

      const currentBattery = snap.data() as TestBatteryExecution;
      const currentTests = currentBattery.tests || [];

      const targetIndex = currentTests.findIndex((t) => t.id === testId);
      if (targetIndex === -1) {
        throw new Error(
          `Caso de teste #${testId} não foi localizado dentro da bateria '${batteryId}'.`
        );
      }

      const existingTest = currentTests[targetIndex];

      // Merge evidence safely: do not erase previous fields if omitted
      const mergedEvidence: TestEvidence = {
        ...(existingTest.evidence || {}),
        ...(evidence.recordId?.trim()
          ? { recordId: evidence.recordId.trim() }
          : {}),
        ...(evidence.transactionId?.trim()
          ? { transactionId: evidence.transactionId.trim() }
          : {}),
        ...(evidence.logText?.trim()
          ? { logText: evidence.logText.trim() }
          : {}),
        ...(evidence.url?.trim() ? { url: evidence.url.trim() } : {}),
        ...(evidence.screenshotUrl?.trim()
          ? { screenshotUrl: evidence.screenshotUrl.trim() }
          : {}),
      };

      // Construct history entry if status changed
      let updatedHistory = existingTest.history || [];
      if (existingTest.status !== status) {
        const historyEntry: TestCaseHistoryEntry = {
          timestamp: nowIso,
          previousStatus: existingTest.status,
          newStatus: status,
          changedBy: currentUser?.name || "Testador",
          changedByEmail: currentUser?.email || "",
          reason: observations?.trim()
            ? observations.trim().slice(0, 150)
            : `Status alterado para ${status}`,
        };
        updatedHistory = [historyEntry, ...updatedHistory];
      }

      // Build updated test item preserving all original values
      const updatedTest: TestCaseItem = {
        ...existingTest,
        status,
        obtainedResult:
          obtainedResult !== undefined && obtainedResult.trim() !== ""
            ? obtainedResult.trim()
            : existingTest.obtainedResult || "Pendente de validação",
        observations:
          observations !== undefined
            ? observations.trim()
            : existingTest.observations || "",
        evidence: mergedEvidence,
        executedAt: nowIso,
        executedBy:
          currentUser?.name || existingTest.executedBy || "Testador",
        executedByEmail:
          currentUser?.email || existingTest.executedByEmail || "",
        history: updatedHistory,
      };

      // Only administrators can reassign the responsible tester
      if (isAdmin && assignedToUserId !== undefined) {
        updatedTest.assignedToUserId = assignedToUserId || undefined;
        updatedTest.assignedToName = assignedToName || undefined;
        updatedTest.assignedToEmail = assignedToEmail || undefined;
      }

      // Replace test at specific index
      const updatedTests = [...currentTests];
      updatedTests[targetIndex] = updatedTest;

      // Audit trail record
      const auditEntry: TestExecutionAuditEntry = {
        id: `audit-${Date.now()}`,
        changedAt: nowIso,
        changedBy: currentUser?.name || "Testador",
        changedByEmail: currentUser?.email || "",
        changedByRole: currentUser?.role,
        changeType: "UPDATE_DETAILS",
        description: `Caso de teste #${testId} atualizado. Status: ${status}. Resultado e evidências registrados.`,
        testId,
        objectId: testId,
        transactionId: txId,
        previousStatus: existingTest.status,
        newStatus: status,
        oldValue: existingTest.obtainedResult || "Sem resultado",
        newValue: updatedTest.obtainedResult,
        fieldChanged: "evidencias_e_resultado",
      };

      const updatedAuditTrail = [
        auditEntry,
        ...(currentBattery.auditTrail || []),
      ];

      const updatePayload = sanitizeForFirestore({
        tests: updatedTests,
        auditTrail: updatedAuditTrail,
        updatedAt: nowIso,
      });

      transaction.update(batteryRef, updatePayload);

      const finalBattery: TestBatteryExecution = {
        ...currentBattery,
        tests: updatedTests,
        auditTrail: updatedAuditTrail,
        updatedAt: nowIso,
      };

      return {
        updatedTest,
        updatedBattery: finalBattery,
      };
    });

    // Clear local draft and backup now that remote Firestore persistence is confirmed
    clearLocalTestDraft(batteryId, testId);
    clearTestBackup(testId);

    return {
      success: true,
      updatedTest: result.updatedTest,
      updatedBattery: result.updatedBattery,
    };
  } catch (err: any) {
    console.error(
      `[testExecutionPersistence] Erro atômico ao salvar teste #${testId}:`,
      err
    );

    // Store local backup bound to testId for prioritized retry
    saveTestBackup(testId, {
      status,
      obtainedResult,
      observations,
      recordId: evidence.recordId || "",
      transactionId: evidence.transactionId || "",
      logText: evidence.logText || "",
      url: evidence.url || "",
      screenshotUrl: evidence.screenshotUrl || "",
      savedAt: new Date().toISOString(),
    });

    // Log to centralized test error service
    logTestError({
      batteryId,
      testId,
      action: "SAVE_TEST_CASE",
      error: err,
      currentUser,
      formDataSnapshot: {
        status,
        obtainedResult,
        observations,
        recordId: evidence.recordId,
        transactionId: evidence.transactionId,
        logText: evidence.logText,
        url: evidence.url,
        screenshotUrl: evidence.screenshotUrl,
      },
    }).catch(() => {});

    return {
      success: false,
      error:
        err?.message ||
        "Falha ao persistir alterações no Firestore. Backup local preservado.",
    };
  }
}

/**
 * Persists test case changes directly via Firestore `updateDoc` targeting
 * ONLY the modified fields (`tests`, `auditTrail`, `updatedAt`), preventing
 * full-document overwrites.
 *
 * If a network error or failure occurs, it automatically captures the form snapshot
 * into localStorage under `test_backup_${testId}` and reports the error to the
 * centralized test error logger.
 */
export async function updateTestCaseWithUpdateDoc(
  params: SaveTestCaseAtomicParams
): Promise<SaveTestCaseAtomicResult> {
  const {
    batteryId,
    testId,
    status,
    obtainedResult,
    observations,
    evidence,
    currentUser,
    isAdmin,
    assignedToUserId,
    assignedToName,
    assignedToEmail,
  } = params;

  const nowIso = new Date().toISOString();

  try {
    const batteryRef = doc(db, "test_executions", batteryId);
    const snap = await getDoc(batteryRef);

    if (!snap.exists()) {
      throw new Error(`Bateria de teste '${batteryId}' não foi encontrada.`);
    }

    const currentBattery = snap.data() as TestBatteryExecution;
    const currentTests = currentBattery.tests || [];
    const targetIndex = currentTests.findIndex((t) => t.id === testId);

    if (targetIndex === -1) {
      throw new Error(`Caso de teste #${testId} não encontrado na bateria.`);
    }

    const existingTest = currentTests[targetIndex];

    // RBAC check: only admin or assigned tester can save
    if (!isAdmin) {
      const isAssignedToUser = Boolean(
        (currentUser?.id && existingTest.assignedToUserId === currentUser.id) ||
        (currentUser?.email &&
          existingTest.assignedToEmail?.toLowerCase() ===
            currentUser.email.toLowerCase())
      );
      if (!isAssignedToUser && existingTest.assignedToUserId) {
        throw new Error(
          "Apenas o testador atribuído ou administradores podem salvar evidências deste teste."
        );
      }
    }

    let updatedHistory = existingTest.history || [];
    if (existingTest.status !== status) {
      const historyEntry: TestCaseHistoryEntry = {
        timestamp: nowIso,
        previousStatus: existingTest.status,
        newStatus: status,
        changedBy: currentUser?.name || "Testador",
        changedByEmail: currentUser?.email || "",
        reason: `Evidências e resultado prático atualizados (status: ${status})`,
      };
      updatedHistory = [historyEntry, ...updatedHistory];
    }

    const mergedEvidence: TestEvidence = {
      recordId:
        evidence.recordId !== undefined
          ? evidence.recordId
          : existingTest.evidence?.recordId,
      logText:
        evidence.logText !== undefined
          ? evidence.logText
          : existingTest.evidence?.logText,
      url:
        evidence.url !== undefined
          ? evidence.url
          : existingTest.evidence?.url,
      transactionId:
        evidence.transactionId !== undefined
          ? evidence.transactionId
          : existingTest.evidence?.transactionId,
      screenshotUrl:
        evidence.screenshotUrl !== undefined
          ? evidence.screenshotUrl
          : existingTest.evidence?.screenshotUrl,
      updatedAt: nowIso,
    };

    const updatedTest: TestCaseItem = {
      ...existingTest,
      status,
      obtainedResult,
      observations:
        observations !== undefined ? observations : existingTest.observations,
      evidence: mergedEvidence,
      executedAt: nowIso,
      executedBy: currentUser?.name || existingTest.executedBy || "Testador",
      executedByEmail:
        currentUser?.email || existingTest.executedByEmail || "",
      history: updatedHistory,
      assignedToUserId:
        assignedToUserId !== undefined
          ? assignedToUserId
          : existingTest.assignedToUserId,
      assignedToName:
        assignedToName !== undefined
          ? assignedToName
          : existingTest.assignedToName,
      assignedToEmail:
        assignedToEmail !== undefined
          ? assignedToEmail
          : existingTest.assignedToEmail,
    };

    const updatedTests = [...currentTests];
    updatedTests[targetIndex] = updatedTest;

    const auditEntry: TestExecutionAuditEntry = {
      id: `audit-${Date.now()}`,
      changedAt: nowIso,
      changedBy: currentUser?.name || "Testador",
      changedByEmail: currentUser?.email || "",
      changedByRole: currentUser?.role,
      changeType: "EVIDENCE_ATTACHED",
      description: `Evidências e resultado do teste #${testId} salvos via updateDoc parcial. Status: ${status}.`,
      testId,
      objectId: testId,
      previousStatus: existingTest.status,
      newStatus: status,
      fieldChanged: "evidencias_e_resultado",
      oldValue: existingTest.obtainedResult || "Sem resultado",
      newValue: obtainedResult || "Evidências anexadas",
      transactionId: evidence.transactionId,
    };

    const updatedAuditTrail = [
      auditEntry,
      ...(currentBattery.auditTrail || []),
    ];

    // CRITICAL: updateDoc updates ONLY the targeted fields, preserving root fields
    const updatePayload = sanitizeForFirestore({
      tests: updatedTests,
      auditTrail: updatedAuditTrail,
      updatedAt: nowIso,
    });

    await updateDoc(batteryRef, updatePayload);

    // Clear local backup and draft upon confirmed Firestore write
    clearLocalTestDraft(batteryId, testId);
    clearTestBackup(testId);

    const updatedBattery: TestBatteryExecution = {
      ...currentBattery,
      tests: updatedTests,
      auditTrail: updatedAuditTrail,
      updatedAt: nowIso,
    };

    return {
      success: true,
      updatedTest,
      updatedBattery,
    };
  } catch (err: any) {
    console.error(
      `[testExecutionPersistence] Falha ao persistir via updateDoc no teste #${testId}:`,
      err
    );

    // Store local backup bound to testId
    saveTestBackup(testId, {
      status,
      obtainedResult,
      observations,
      recordId: evidence.recordId || "",
      transactionId: evidence.transactionId || "",
      logText: evidence.logText || "",
      url: evidence.url || "",
      screenshotUrl: evidence.screenshotUrl || "",
      savedAt: nowIso,
    });

    // Centralized error log
    logTestError({
      batteryId,
      testId,
      action: "SAVE_TEST_CASE",
      error: err,
      currentUser,
      formDataSnapshot: {
        status,
        obtainedResult,
        observations,
        recordId: evidence.recordId,
        transactionId: evidence.transactionId,
        logText: evidence.logText,
        url: evidence.url,
        screenshotUrl: evidence.screenshotUrl,
      },
    }).catch(() => {});

    return {
      success: false,
      error:
        err?.message ||
        "Erro de rede ao persistir alterações no Firestore. Backup local armazenado.",
    };
  }
}

/**
 * Performs an ATOMIC status update (e.g. Quick Pass/Fail buttons) without
 * overwriting existing custom observations or detailed obtained results.
 */
export async function updateTestCaseStatusAtomic(params: {
  batteryId: string;
  testId: string;
  newStatus: TestStatus;
  currentUser: User | null;
  customNote?: string;
}): Promise<SaveTestCaseAtomicResult> {
  const { batteryId, testId, newStatus, currentUser, customNote } = params;
  const nowIso = new Date().toISOString();

  try {
    const batteryRef = doc(db, "test_executions", batteryId);

    const result = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(batteryRef);
      if (!snap.exists()) {
        throw new Error(`Bateria '${batteryId}' não encontrada.`);
      }

      const currentBattery = snap.data() as TestBatteryExecution;
      const currentTests = currentBattery.tests || [];
      const targetIndex = currentTests.findIndex((t) => t.id === testId);

      if (targetIndex === -1) {
        throw new Error(`Teste #${testId} não encontrado.`);
      }

      const existingTest = currentTests[targetIndex];

      // DO NOT wipe existing custom obtained results!
      // Only inject default text if existing result is missing or the generic pending placeholder.
      let finalObtainedResult = existingTest.obtainedResult;
      if (
        !finalObtainedResult ||
        finalObtainedResult === "Pendente de validação" ||
        finalObtainedResult.trim() === ""
      ) {
        finalObtainedResult =
          newStatus === "APROVADO"
            ? "Comportamento esperado confirmado com persistência validada no banco."
            : newStatus === "REPROVADO"
            ? "Comportamento divergente do esperado. Necessária correção técnica."
            : "Validação pendente de execução.";
      }

      let updatedHistory = existingTest.history || [];
      if (existingTest.status !== newStatus) {
        const historyEntry: TestCaseHistoryEntry = {
          timestamp: nowIso,
          previousStatus: existingTest.status,
          newStatus,
          changedBy: currentUser?.name || "Testador",
          changedByEmail: currentUser?.email || "",
          reason: customNote || `Status alterado rapidamente para ${newStatus}`,
        };
        updatedHistory = [historyEntry, ...updatedHistory];
      }

      const updatedTest: TestCaseItem = {
        ...existingTest,
        status: newStatus,
        obtainedResult: finalObtainedResult,
        executedAt: nowIso,
        executedBy: currentUser?.name || existingTest.executedBy || "Testador",
        executedByEmail:
          currentUser?.email || existingTest.executedByEmail || "",
        history: updatedHistory,
      };

      const updatedTests = [...currentTests];
      updatedTests[targetIndex] = updatedTest;

      const auditEntry: TestExecutionAuditEntry = {
        id: `audit-${Date.now()}`,
        changedAt: nowIso,
        changedBy: currentUser?.name || "Testador",
        changedByEmail: currentUser?.email || "",
        changedByRole: currentUser?.role,
        changeType: "UPDATE_STATUS",
        description: `Status do teste #${testId} alterado de ${existingTest.status} para ${newStatus}.`,
        testId,
        objectId: testId,
        previousStatus: existingTest.status,
        newStatus,
        fieldChanged: "status",
        oldValue: existingTest.status,
        newValue: newStatus,
      };

      const updatedAuditTrail = [
        auditEntry,
        ...(currentBattery.auditTrail || []),
      ];

      const updatePayload = sanitizeForFirestore({
        tests: updatedTests,
        auditTrail: updatedAuditTrail,
        updatedAt: nowIso,
      });

      transaction.update(batteryRef, updatePayload);

      const finalBattery: TestBatteryExecution = {
        ...currentBattery,
        tests: updatedTests,
        auditTrail: updatedAuditTrail,
        updatedAt: nowIso,
      };

      return {
        updatedTest,
        updatedBattery: finalBattery,
      };
    });

    return {
      success: true,
      updatedTest: result.updatedTest,
      updatedBattery: result.updatedBattery,
    };
  } catch (err: any) {
    console.error(
      `[testExecutionPersistence] Erro atômico ao alterar status do teste #${testId}:`,
      err
    );
    return {
      success: false,
      error:
        err?.message || "Falha ao persistir status no Firestore.",
    };
  }
}
