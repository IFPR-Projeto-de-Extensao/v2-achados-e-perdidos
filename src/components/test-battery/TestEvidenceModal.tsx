import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  X,
  Save,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ExternalLink,
  Shield,
  UserCheck,
  RotateCcw,
  Loader2,
  Trash2,
  Image as ImageIcon,
  History,
} from "lucide-react";
import { TestCaseItem, TestStatus, TestBatteryExecution, User } from "../../types";
import { vibrateClick, vibrateSuccess, vibrateWarning } from "../../lib/utils";
import {
  saveLocalTestDraft,
  getLocalTestDraft,
  clearLocalTestDraft,
  saveTestBackup,
  getTestBackup,
  clearTestBackup,
  hasTestBackup,
  TestDraftData,
} from "../../lib/testExecutionPersistence";
import { logTestError } from "../../lib/testErrorLogService";
import { AutoResizeTextarea } from "./AutoResizeTextarea";
import { useDebouncedSave } from "../../hooks/useDebouncedSave";

interface TestEvidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  test: TestCaseItem | null;
  battery: TestBatteryExecution;
  currentUser: User | null;
  onSave: (
    testId: string,
    obtainedResult: string,
    observations: string,
    evidence: {
      recordId?: string;
      logText?: string;
      url?: string;
      transactionId?: string;
      screenshotUrl?: string;
    },
    status: TestStatus,
    assignedToUserId?: string,
    assignedToName?: string,
    assignedToEmail?: string
  ) => Promise<{ success: boolean; error?: string }>;
  darkMode?: boolean;
}

export const TestEvidenceModal: React.FC<TestEvidenceModalProps> = ({
  isOpen,
  onClose,
  test,
  battery,
  currentUser,
  onSave,
  darkMode,
}) => {
  if (!isOpen || !test) return null;

  const isAdmin = currentUser?.role === "ADMIN" || currentUser?.role === "SERVIDOR";
  const participants = battery.participants || [];

  // Form states initialized from test data
  const [status, setStatus] = useState<TestStatus>(test.status);
  const [obtainedResult, setObtainedResult] = useState<string>(test.obtainedResult || "");
  const [observations, setObservations] = useState<string>(test.observations || "");
  const [recordId, setRecordId] = useState<string>(test.evidence?.recordId || "");
  const [logText, setLogText] = useState<string>(test.evidence?.logText || "");
  const [url, setUrl] = useState<string>(test.evidence?.url || "");
  const [transactionId, setTransactionId] = useState<string>(test.evidence?.transactionId || "");
  const [screenshotUrl, setScreenshotUrl] = useState<string>(test.evidence?.screenshotUrl || "");
  const [selectedTesterId, setSelectedTesterId] = useState<string>(test.assignedToUserId || "");

  // Persistence & Draft recovery state
  const [detectedDraft, setDetectedDraft] = useState<TestDraftData | null>(null);
  const [detectedBackup, setDetectedBackup] = useState<TestDraftData | null>(null);
  const isInitialMount = useRef(true);

  // Synchronize state when opened test changes
  useEffect(() => {
    setStatus(test.status);
    setObtainedResult(test.obtainedResult || "");
    setObservations(test.observations || "");
    setRecordId(test.evidence?.recordId || "");
    setLogText(test.evidence?.logText || "");
    setUrl(test.evidence?.url || "");
    setTransactionId(test.evidence?.transactionId || "");
    setScreenshotUrl(test.evidence?.screenshotUrl || "");
    setSelectedTesterId(test.assignedToUserId || "");
    isInitialMount.current = true;

    // Check for failure backup linked to testId (`test_backup_${testId}`)
    const failureBackup = getTestBackup(test.id);
    if (failureBackup) {
      const hasBackupDiff =
        failureBackup.status !== test.status ||
        failureBackup.obtainedResult !== (test.obtainedResult || "") ||
        failureBackup.observations !== (test.observations || "");
      if (hasBackupDiff) {
        setDetectedBackup(failureBackup);
      }
    } else {
      setDetectedBackup(null);
    }

    // Check for offline/unsaved draft in localStorage
    const savedDraft = getLocalTestDraft(battery.id, test.id);
    if (savedDraft) {
      const hasDifferences =
        savedDraft.status !== test.status ||
        savedDraft.obtainedResult !== (test.obtainedResult || "") ||
        savedDraft.observations !== (test.observations || "") ||
        savedDraft.recordId !== (test.evidence?.recordId || "") ||
        savedDraft.transactionId !== (test.evidence?.transactionId || "");

      if (hasDifferences) {
        setDetectedDraft(savedDraft);
      }
    } else {
      setDetectedDraft(null);
    }
  }, [test.id, battery.id]);

  // Compare local form state against remote Firestore test state
  const isDifferentFromRemote = useMemo(() => {
    if (!test) return false;
    return (
      status !== test.status ||
      obtainedResult !== (test.obtainedResult || "") ||
      observations !== (test.observations || "") ||
      recordId !== (test.evidence?.recordId || "") ||
      logText !== (test.evidence?.logText || "") ||
      url !== (test.evidence?.url || "") ||
      transactionId !== (test.evidence?.transactionId || "") ||
      screenshotUrl !== (test.evidence?.screenshotUrl || "") ||
      (isAdmin && selectedTesterId !== (test.assignedToUserId || ""))
    );
  }, [
    test,
    status,
    obtainedResult,
    observations,
    recordId,
    logText,
    url,
    transactionId,
    screenshotUrl,
    selectedTesterId,
    isAdmin,
  ]);

  // Form snapshot for debouncing and saving
  const currentFormPayload = useMemo(
    () => ({
      status,
      obtainedResult,
      observations,
      recordId,
      logText,
      url,
      transactionId,
      screenshotUrl,
      selectedTesterId,
    }),
    [
      status,
      obtainedResult,
      observations,
      recordId,
      logText,
      url,
      transactionId,
      screenshotUrl,
      selectedTesterId,
    ]
  );

  // Core execution function for persistence
  const executeFormSave = useCallback(
    async (payload: typeof currentFormPayload): Promise<{ success: boolean; error?: string }> => {
      let assignedName: string | undefined = test.assignedToName;
      let assignedEmail: string | undefined = test.assignedToEmail;

      if (payload.selectedTesterId) {
        const p = participants.find((part) => part.id === payload.selectedTesterId);
        if (p) {
          assignedName = p.name;
          assignedEmail = p.email;
        }
      }

      const payloadEvidence = {
        recordId: payload.recordId.trim() || undefined,
        logText: payload.logText.trim() || undefined,
        url: payload.url.trim() || undefined,
        transactionId: payload.transactionId.trim() || undefined,
        screenshotUrl: payload.screenshotUrl.trim() || undefined,
      };

      try {
        const res = await onSave(
          test.id,
          payload.obtainedResult,
          payload.observations,
          payloadEvidence,
          payload.status,
          isAdmin ? payload.selectedTesterId || undefined : undefined,
          isAdmin ? assignedName : undefined,
          isAdmin ? assignedEmail : undefined
        );

        if (res.success) {
          clearLocalTestDraft(battery.id, test.id);
          clearTestBackup(test.id);
          setDetectedDraft(null);
          setDetectedBackup(null);
          return { success: true };
        } else {
          // If save fails, store current version in localStorage under test_backup_${testId}
          saveTestBackup(test.id, {
            status: payload.status,
            obtainedResult: payload.obtainedResult,
            observations: payload.observations,
            recordId: payload.recordId,
            transactionId: payload.transactionId,
            logText: payload.logText,
            url: payload.url,
            screenshotUrl: payload.screenshotUrl,
            savedAt: new Date().toISOString(),
          });

          logTestError({
            batteryId: battery.id,
            testId: test.id,
            testTitle: test.title,
            action: "SAVE_TEST_CASE",
            error: res.error || "Falha ao persistir alterações no Firestore",
            currentUser,
            formDataSnapshot: {
              status: payload.status,
              obtainedResult: payload.obtainedResult,
              observations: payload.observations,
            },
          }).catch(() => {});

          return {
            success: false,
            error:
              res.error ||
              "Erro de conexão com o Firestore. O backup local deste teste foi preservado.",
          };
        }
      } catch (err: any) {
        const errMsg = err?.message || "Erro inesperado ao persistir dados.";

        saveTestBackup(test.id, {
          status: payload.status,
          obtainedResult: payload.obtainedResult,
          observations: payload.observations,
          recordId: payload.recordId,
          transactionId: payload.transactionId,
          logText: payload.logText,
          url: payload.url,
          screenshotUrl: payload.screenshotUrl,
          savedAt: new Date().toISOString(),
        });

        logTestError({
          batteryId: battery.id,
          testId: test.id,
          testTitle: test.title,
          action: "SAVE_TEST_CASE",
          error: err,
          currentUser,
        }).catch(() => {});

        return { success: false, error: errMsg };
      }
    },
    [battery.id, test, participants, onSave, isAdmin, currentUser]
  );

  // Debounced auto-save hook with 1.5 seconds delay (useDebouncedSave)
  const {
    saveStatus,
    displayStatus,
    errorMessage,
    lastSavedAt,
    saveImmediately,
    retrySave,
  } = useDebouncedSave({
    data: currentFormPayload,
    delay: 1500, // 1.5s delay as requested
    enabled: isOpen && !isInitialMount.current,
    isDirty: isDifferentFromRemote,
    onSave: executeFormSave,
  });

  // Local draft sync on user keystrokes
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    saveLocalTestDraft(battery.id, test.id, {
      status,
      obtainedResult,
      observations,
      recordId,
      transactionId,
      logText,
      url,
      screenshotUrl,
    });
  }, [
    status,
    obtainedResult,
    observations,
    recordId,
    transactionId,
    logText,
    url,
    screenshotUrl,
    battery.id,
    test.id,
  ]);

  // Window beforeunload handler: detects unsaved changes and prompts user, guaranteeing emergency save
  useEffect(() => {
    if (!isOpen || !test) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDifferentFromRemote && saveStatus !== "SUCCESS") {
        // Guarantee immediate emergency sync to local backup
        const emergencyBackup = {
          status,
          obtainedResult,
          observations,
          recordId,
          transactionId,
          logText,
          url,
          screenshotUrl,
          savedAt: new Date().toISOString(),
        };

        saveTestBackup(test.id, emergencyBackup);
        saveLocalTestDraft(battery.id, test.id, emergencyBackup);

        // Prompt the user to prevent accidental page closure
        e.preventDefault();
        e.returnValue = "Você possui alterações não salvas no caso de teste. Deseja sair?";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [
    isOpen,
    test,
    battery.id,
    isDifferentFromRemote,
    saveStatus,
    status,
    obtainedResult,
    observations,
    recordId,
    transactionId,
    logText,
    url,
    screenshotUrl,
  ]);

  // Restore draft handler
  const handleRestoreDraft = () => {
    if (!detectedDraft) return;
    vibrateClick();
    setStatus(detectedDraft.status);
    setObtainedResult(detectedDraft.obtainedResult);
    setObservations(detectedDraft.observations);
    setRecordId(detectedDraft.recordId);
    setTransactionId(detectedDraft.transactionId);
    setLogText(detectedDraft.logText);
    setUrl(detectedDraft.url);
    setScreenshotUrl(detectedDraft.screenshotUrl);
    setDetectedDraft(null);
  };

  const handleDiscardDraft = () => {
    vibrateClick();
    clearLocalTestDraft(battery.id, test.id);
    setDetectedDraft(null);
  };

  // Restore failure backup handler (prioritizing local backup under test_backup_${testId})
  const handleRestoreBackup = () => {
    if (!detectedBackup) return;
    vibrateClick();
    setStatus(detectedBackup.status);
    setObtainedResult(detectedBackup.obtainedResult);
    setObservations(detectedBackup.observations);
    setRecordId(detectedBackup.recordId);
    setTransactionId(detectedBackup.transactionId);
    setLogText(detectedBackup.logText);
    setUrl(detectedBackup.url);
    setScreenshotUrl(detectedBackup.screenshotUrl);
    setDetectedBackup(null);
  };

  // Prioritized Retry: Reads backup under test_backup_${testId} and saves immediately
  const handleRetryFromBackup = async () => {
    vibrateClick();
    const backup = getTestBackup(test.id);

    if (backup) {
      // Prioritize saved backup data
      setStatus(backup.status);
      setObtainedResult(backup.obtainedResult);
      setObservations(backup.observations);
      setRecordId(backup.recordId);
      setTransactionId(backup.transactionId);
      setLogText(backup.logText);
      setUrl(backup.url);
      setScreenshotUrl(backup.screenshotUrl);

      const res = await saveImmediately({
        status: backup.status,
        obtainedResult: backup.obtainedResult,
        observations: backup.observations,
        recordId: backup.recordId,
        logText: backup.logText,
        url: backup.url,
        transactionId: backup.transactionId,
        screenshotUrl: backup.screenshotUrl,
        selectedTesterId,
      });

      if (res.success) {
        clearTestBackup(test.id);
        setDetectedBackup(null);
        vibrateSuccess();
      } else {
        vibrateWarning();
      }
    } else {
      const res = await retrySave();
      if (res.success) {
        vibrateSuccess();
      } else {
        vibrateWarning();
      }
    }
  };

  const handleClose = () => {
    if (isDifferentFromRemote && saveStatus !== "SUCCESS") {
      const confirmDiscard = window.confirm(
        "Você possui alterações não salvas neste caso de teste. Deseja realmente fechar? As alterações digitadas permanecerão salvas localmente como rascunho de segurança."
      );
      if (!confirmDiscard) return;
    }
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saveStatus === "SAVING") return;

    vibrateClick();
    const res = await saveImmediately();

    if (res.success) {
      vibrateSuccess();
      setTimeout(() => {
        onClose();
      }, 700);
    } else {
      vibrateWarning();
    }
  };

  return (
    <div
      id="modal-test-evidence"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in"
    >
      <div
        className={`w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] ${
          darkMode
            ? "bg-neutral-900 border-neutral-800 text-white"
            : "bg-white border-neutral-200 text-neutral-900"
        }`}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b flex items-start justify-between dark:border-neutral-800 border-neutral-200 bg-neutral-500/5">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                {test.id}
              </span>
              <span className="text-xs font-semibold text-neutral-500">
                {test.categoryName || test.category}
              </span>
              {test.isCriticalPersistence && (
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  ★ Persistência Crítica (RNF-04)
                </span>
              )}

              {/* Real-time Debounced Save State Visual Indicator ('Salvando...', 'Salvo', 'Erro') */}
              {saveStatus === "SAVING" && (
                <span
                  id="badge-save-status-saving"
                  className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-300 dark:border-blue-800 animate-pulse"
                >
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Salvando...
                </span>
              )}
              {saveStatus === "SUCCESS" && (
                <span
                  id="badge-save-status-saved"
                  className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                >
                  <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  Salvo
                </span>
              )}
              {saveStatus === "ERROR" && (
                <span
                  id="badge-save-status-error"
                  className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300 border border-red-300 dark:border-red-800"
                >
                  <AlertTriangle className="w-3 h-3 text-red-600 dark:text-red-400" />
                  Erro
                </span>
              )}
              {saveStatus === "IDLE" && isDifferentFromRemote && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  ● Alterações pendentes (Salva em 1,5s)
                </span>
              )}
            </div>
            <h2 className="text-base sm:text-lg font-black tracking-tight">{test.title}</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
            title="Fechar formulário"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Failed Save Local Backup Notification Banner */}
        {detectedBackup && (
          <div className="p-3.5 bg-amber-500/15 border-b border-amber-500/40 flex flex-wrap items-center justify-between gap-2 px-5 text-xs text-amber-950 dark:text-amber-200">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                <strong>Backup de falha localizado no dispositivo:</strong> Versão salva localmente em{" "}
                {new Date(detectedBackup.savedAt).toLocaleTimeString("pt-BR")}.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRestoreBackup}
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition"
              >
                Carregar Backup Local
              </button>
              <button
                type="button"
                onClick={handleRetryFromBackup}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                Tentar Salvar Backup
              </button>
            </div>
          </div>
        )}

        {/* Draft Recovery Notification Banner */}
        {detectedDraft && !detectedBackup && (
          <div className="p-3.5 bg-neutral-500/10 border-b border-neutral-500/20 flex flex-wrap items-center justify-between gap-2 px-5 text-xs text-neutral-800 dark:text-neutral-200">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>
                <strong>Rascunho local detectado:</strong> Há alterações salvas no navegador em{" "}
                {new Date(detectedDraft.savedAt).toLocaleTimeString("pt-BR")}.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRestoreDraft}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition"
              >
                Restaurar Rascunho
              </button>
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="px-2 py-1 border border-neutral-300 dark:border-neutral-700 font-semibold rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition"
              >
                Descartar
              </button>
            </div>
          </div>
        )}

        {/* Error Alert Banner with Prioritized "Tentar Novamente" Button */}
        {saveStatus === "ERROR" && errorMessage && (
          <div
            id="banner-save-error"
            className="p-4 bg-red-500/15 border-b border-red-500/40 px-5 text-xs text-red-950 dark:text-red-200 flex flex-wrap items-center justify-between gap-3 animate-in fade-in"
          >
            <div className="flex items-start gap-3 max-w-xl">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">Falha ao salvar no Firestore:</p>
                <p>{errorMessage}</p>
                <p className="text-[11px] text-red-800 dark:text-red-300 font-medium">
                  Seus dados estão protegidos no armazenamento local sob a chave do teste #{test.id}.
                </p>
              </div>
            </div>

            {/* Prioritized Retry Button */}
            <button
              type="button"
              id="btn-retry-save-backup"
              onClick={handleRetryFromBackup}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold rounded-xl shadow-md transition flex items-center gap-2 self-center shrink-0"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Tentar Novamente</span>
            </button>
          </div>
        )}

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* Objective and Expected Result Reference */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl border dark:border-neutral-800 border-neutral-200 bg-neutral-500/5 space-y-1">
              <span className="font-bold text-neutral-500 uppercase tracking-wider text-[10px]">
                Objetivo do Teste
              </span>
              <p className="font-medium text-neutral-700 dark:text-neutral-300 leading-relaxed">
                {test.description || "Validar conformidade do sistema conforme especificação."}
              </p>
            </div>
            <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-1 text-emerald-950 dark:text-emerald-200">
              <span className="font-bold uppercase tracking-wider text-[10px] text-emerald-600 dark:text-emerald-400">
                Resultado Esperado
              </span>
              <p className="font-medium leading-relaxed">{test.expectedResult}</p>
            </div>
          </div>

          {/* Procedure Steps Guide */}
          {(test.procedureSteps || test.procedure) && (test.procedureSteps || test.procedure)!.length > 0 && (
            <div className="p-4 rounded-xl border dark:border-neutral-800 border-neutral-200 space-y-2 bg-neutral-500/5">
              <span className="font-bold text-neutral-500 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Roteiro de Procedimentos para Validação
              </span>
              <ol className="list-decimal list-inside space-y-1 text-neutral-600 dark:text-neutral-400 font-medium">
                {(test.procedureSteps || test.procedure)!.map((step, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Status Selection & Tester Assignment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Status Selector */}
            <div className="space-y-1.5">
              <label className="font-bold text-neutral-500 uppercase tracking-wider text-[10px] flex items-center justify-between">
                <span>Status da Validação *</span>
                <span className="text-[10px] font-normal text-neutral-400">Obrigatório</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  {
                    key: "APROVADO",
                    label: "Aprovado",
                    color:
                      "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 ring-2 ring-emerald-500",
                  },
                  {
                    key: "REPROVADO",
                    label: "Reprovado",
                    color:
                      "border-red-500 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300 ring-2 ring-red-500",
                  },
                  {
                    key: "PENDENTE",
                    label: "Pendente",
                    color:
                      "border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300 ring-2 ring-amber-500",
                  },
                  {
                    key: "BLOQUEADO",
                    label: "Bloqueado",
                    color:
                      "border-rose-700 bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-300 ring-2 ring-rose-500",
                  },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setStatus(item.key as TestStatus)}
                    className={`py-2.5 px-2 rounded-xl border text-center font-bold text-xs transition ${
                      status === item.key
                        ? `${item.color} shadow-sm font-black scale-[1.02]`
                        : "border-neutral-200 dark:border-neutral-800 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tester Assignment (RBAC Protected) */}
            <div className="space-y-1.5">
              <label className="font-bold text-neutral-500 uppercase tracking-wider text-[10px] flex items-center justify-between">
                <span>Testador Responsável</span>
                {isAdmin ? (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                    Admin: Edição Liberada
                  </span>
                ) : (
                  <span className="text-[10px] text-neutral-400 font-medium">Informativo</span>
                )}
              </label>

              {isAdmin ? (
                <select
                  value={selectedTesterId}
                  onChange={(e) => setSelectedTesterId(e.target.value)}
                  className={`w-full font-semibold px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                    darkMode
                      ? "bg-neutral-800 border-neutral-700 text-white"
                      : "bg-neutral-50 border-neutral-300 text-neutral-900"
                  }`}
                >
                  <option value="">-- Sem atribuição específica --</option>
                  {participants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.email}) - {p.globalRole}
                    </option>
                  ))}
                </select>
              ) : (
                <div
                  className={`w-full p-2.5 rounded-xl border flex items-center justify-between ${
                    darkMode
                      ? "bg-neutral-800/60 border-neutral-700/80 text-neutral-300"
                      : "bg-neutral-100/80 border-neutral-200 text-neutral-800"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div>
                      <p className="font-bold text-xs">
                        {test.assignedToName || "Não atribuído a testador específico"}
                      </p>
                      {test.assignedToEmail && (
                        <p className="text-[11px] text-neutral-500">{test.assignedToEmail}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 font-semibold text-neutral-600 dark:text-neutral-300">
                    Definido na Distribuição
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Field: RESULTADO OBTIDO NA PRÁTICA (AutoResizeTextarea, min-rows: 6, character counter below border) */}
          <AutoResizeTextarea
            id="field-obtained-result"
            label="Resultado Obtido na Prática"
            required
            minRows={6}
            value={obtainedResult}
            onChange={setObtainedResult}
            darkMode={darkMode}
            placeholder="Descreva detalhadamente o comportamento observado no sistema durante o teste na prática, incluindo mensagens exibidas, elementos visuais confirmados e conformidade com o resultado esperado..."
            helperText="Registre a constatação fática: o que ocorreu ao executar as etapas no ambiente real."
          />

          {/* Field: OBSERVAÇÕES ADICIONAIS / SUGESTÃO DE CORREÇÃO TÉCNICA (AutoResizeTextarea, min-rows: 6, character counter below border) */}
          <div className="space-y-1">
            <AutoResizeTextarea
              id="field-observations"
              label="Observações Adicionais / Sugestão de Correção Técnica"
              minRows={6}
              maxLength={4000}
              value={observations}
              onChange={setObservations}
              darkMode={darkMode}
              placeholder={`Utilize este espaço para registrar com riqueza de detalhes:
1. Problema ou inconsistência encontrada (se houver divergência);
2. Comportamento observado e condições de reprodução;
3. Sugestão de correção técnica ou melhoria para a equipe de desenvolvimento;
4. Informações de ambiente, rede, logs e observações relevantes.`}
              helperText="Área de escrita ampla com suporte a textos longos e preservação automática."
            />
            {observations.length > 0 && (
              <div className="flex justify-end px-1 pt-0.5">
                <button
                  type="button"
                  onClick={() => setObservations("")}
                  className="text-neutral-400 hover:text-red-500 transition flex items-center gap-1 text-[11px]"
                >
                  <Trash2 className="w-3 h-3" /> Limpar observações
                </button>
              </div>
            )}
          </div>

          {/* Section: Evidências de Auditoria & Persistência Backend */}
          <div className="p-4 rounded-xl border dark:border-neutral-800 border-neutral-200 space-y-3.5 bg-neutral-500/5">
            <div className="flex items-center justify-between border-b pb-2 dark:border-neutral-800 border-neutral-200">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="font-bold text-xs">Evidências de Auditoria & Persistência Backend</h3>
              </div>
              <span className="text-[10px] text-neutral-500 font-semibold">
                Garantia de Não-Regressão
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-bold text-neutral-500 uppercase tracking-wider text-[10px]">
                  ID do Registro Criado no Firestore
                </label>
                <input
                  type="text"
                  value={recordId}
                  onChange={(e) => setRecordId(e.target.value)}
                  placeholder="ex: item-1725501234567 ou claim-987"
                  className={`w-full font-mono text-xs px-3 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                    darkMode
                      ? "bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-600"
                      : "bg-white border-neutral-300 text-neutral-900 placeholder:text-neutral-400"
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-neutral-500 uppercase tracking-wider text-[10px]">
                  ID da Transação / Operação
                </label>
                <input
                  type="text"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder="ex: tx-audit-1725501234567"
                  className={`w-full font-mono text-xs px-3 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                    darkMode
                      ? "bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-600"
                      : "bg-white border-neutral-300 text-neutral-900 placeholder:text-neutral-400"
                  }`}
                />
              </div>

              {/* Log text */}
              <div className="space-y-1 sm:col-span-2">
                <label className="font-bold text-neutral-500 uppercase tracking-wider text-[10px]">
                  Snippet do Log do Console / Resposta da API
                </label>
                <input
                  type="text"
                  value={logText}
                  onChange={(e) => setLogText(e.target.value)}
                  placeholder="ex: [Firestore] Document written successfully with ID: item-xyz"
                  className={`w-full font-mono text-xs px-3 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                    darkMode
                      ? "bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-600"
                      : "bg-white border-neutral-300 text-neutral-900 placeholder:text-neutral-400"
                  }`}
                />
              </div>

              {/* Screenshot URL */}
              <div className="space-y-1 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-neutral-500 uppercase tracking-wider text-[10px] flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" />
                    URL da Captura de Tela / Imagem
                  </label>
                  {screenshotUrl.trim() && (
                    <a
                      href={screenshotUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-emerald-600 hover:underline flex items-center gap-0.5"
                    >
                      Visualizar <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
                <input
                  type="url"
                  value={screenshotUrl}
                  onChange={(e) => setScreenshotUrl(e.target.value)}
                  placeholder="https://..."
                  className={`w-full font-medium px-3 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                    darkMode
                      ? "bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-600"
                      : "bg-white border-neutral-300 text-neutral-900 placeholder:text-neutral-400"
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Modal Actions Footer */}
          <div className="pt-3 border-t dark:border-neutral-800 border-neutral-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-neutral-500">
                {saveStatus === "SAVING"
                  ? "Salvando..."
                  : saveStatus === "SUCCESS"
                  ? "Salvo no Firestore."
                  : saveStatus === "ERROR"
                  ? "Erro ao salvar. Backup local disponível."
                  : isDifferentFromRemote
                  ? "Modificações detectadas. Salvamento com debounce de 1,5s."
                  : "Todos os dados sincronizados."}
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleClose}
                disabled={saveStatus === "SAVING"}
                className="px-4 py-2.5 font-bold rounded-xl border dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition disabled:opacity-50"
              >
                Cancelar
              </button>

              {/* Retry Button if in ERROR state */}
              {saveStatus === "ERROR" && (
                <button
                  type="button"
                  id="btn-retry-footer"
                  onClick={handleRetryFromBackup}
                  className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-md transition flex items-center gap-2 active:scale-95"
                >
                  <RotateCcw className="w-4 h-4" />
                  Tentar Novamente
                </button>
              )}

              {/* Main Submit Button */}
              <button
                type="submit"
                disabled={saveStatus === "SAVING"}
                className={`px-6 py-2.5 text-white font-bold rounded-xl shadow-md transition flex items-center gap-2 active:scale-95 disabled:opacity-60 ${
                  saveStatus === "SUCCESS"
                    ? "bg-emerald-700"
                    : saveStatus === "ERROR"
                    ? "bg-neutral-700 hover:bg-neutral-800"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {saveStatus === "SAVING" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando...
                  </>
                ) : saveStatus === "SUCCESS" ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Salvo
                  </>
                ) : saveStatus === "ERROR" ? (
                  <>
                    <Save className="w-4 h-4" />
                    Salvar Manualmente
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Salvar Evidências & Atualizar Teste
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
