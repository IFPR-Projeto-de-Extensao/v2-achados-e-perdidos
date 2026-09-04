import { useState, useEffect, useRef, useCallback } from "react";

export type DebouncedSaveStatus = "IDLE" | "SAVING" | "SUCCESS" | "ERROR";
export type DisplaySaveStatus = "Salvando..." | "Salvo" | "Erro" | "";

export interface UseDebouncedSaveOptions<T> {
  /** The current form data or state to persist */
  data: T;
  /** Async function that executes the persistence (e.g. to Firestore) */
  onSave: (data: T) => Promise<{ success: boolean; error?: string }>;
  /** Debounce delay in milliseconds. Defaults to 1500 (1.5 seconds) */
  delay?: number;
  /** Whether autosave is enabled */
  enabled?: boolean;
  /** Whether the user has made unsaved modifications */
  isDirty?: boolean;
  /** Callback fired after successful save */
  onSuccess?: () => void;
  /** Callback fired after save failure */
  onError?: (errorMessage: string) => void;
}

export interface UseDebouncedSaveReturn<T> {
  /** Machine status */
  saveStatus: DebouncedSaveStatus;
  /** Visual human-readable status: 'Salvando...' | 'Salvo' | 'Erro' | '' */
  displayStatus: DisplaySaveStatus;
  /** Error message if failed */
  errorMessage: string | null;
  /** Timestamp of the last successful save */
  lastSavedAt: Date | null;
  /** Trigger an immediate save without waiting for the 1.5s delay */
  saveImmediately: (overrideData?: T) => Promise<{ success: boolean; error?: string }>;
  /** Retry the save using the latest data (or a provided backup) */
  retrySave: (backupData?: T) => Promise<{ success: boolean; error?: string }>;
  /** Manually reset the status to IDLE */
  resetStatus: () => void;
}

/**
 * Hook `useDebouncedSave` that manages asynchronous saving with a 1.5-second debounce.
 *
 * Provides visual state tracking for:
 * - 'Salvando...' (while persisting)
 * - 'Salvo' (on confirmed persistence)
 * - 'Erro' (on failure, triggering local backup & retry flow)
 */
export function useDebouncedSave<T>({
  data,
  onSave,
  delay = 1500, // 1.5 seconds required
  enabled = true,
  isDirty = false,
  onSuccess,
  onError,
}: UseDebouncedSaveOptions<T>): UseDebouncedSaveReturn<T> {
  const [saveStatus, setSaveStatus] = useState<DebouncedSaveStatus>("IDLE");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const latestDataRef = useRef<T>(data);
  latestDataRef.current = data;

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Execute actual save
  const executeSave = useCallback(
    async (payloadToSave: T): Promise<{ success: boolean; error?: string }> => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      setSaveStatus("SAVING");
      setErrorMessage(null);

      try {
        const result = await onSaveRef.current(payloadToSave);
        if (result.success) {
          setSaveStatus("SUCCESS");
          setErrorMessage(null);
          setLastSavedAt(new Date());
          if (onSuccessRef.current) {
            onSuccessRef.current();
          }
          return { success: true };
        } else {
          const err = result.error || "Erro ao salvar dados no Firestore.";
          setSaveStatus("ERROR");
          setErrorMessage(err);
          if (onErrorRef.current) {
            onErrorRef.current(err);
          }
          return { success: false, error: err };
        }
      } catch (err: any) {
        const errStr =
          err instanceof Error ? err.message : "Erro desconhecido ao salvar.";
        setSaveStatus("ERROR");
        setErrorMessage(errStr);
        if (onErrorRef.current) {
          onErrorRef.current(errStr);
        }
        return { success: false, error: errStr };
      }
    },
    []
  );

  // Debounced auto-save effect
  useEffect(() => {
    if (!enabled || !isDirty) {
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      executeSave(latestDataRef.current);
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [data, enabled, isDirty, delay, executeSave]);

  // Immediate save trigger
  const saveImmediately = useCallback(
    async (overrideData?: T) => {
      const payload = overrideData !== undefined ? overrideData : latestDataRef.current;
      return executeSave(payload);
    },
    [executeSave]
  );

  // Retry save
  const retrySave = useCallback(
    async (backupData?: T) => {
      const payload = backupData !== undefined ? backupData : latestDataRef.current;
      return executeSave(payload);
    },
    [executeSave]
  );

  // Reset status
  const resetStatus = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setSaveStatus("IDLE");
    setErrorMessage(null);
  }, []);

  // Map machine status to required human visual label
  let displayStatus: DisplaySaveStatus = "";
  if (saveStatus === "SAVING") {
    displayStatus = "Salvando...";
  } else if (saveStatus === "SUCCESS") {
    displayStatus = "Salvo";
  } else if (saveStatus === "ERROR") {
    displayStatus = "Erro";
  }

  return {
    saveStatus,
    displayStatus,
    errorMessage,
    lastSavedAt,
    saveImmediately,
    retrySave,
    resetStatus,
  };
}
