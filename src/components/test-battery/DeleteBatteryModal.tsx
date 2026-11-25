import React, { useState } from "react";
import { X, Trash2, AlertTriangle, ShieldAlert } from "lucide-react";
import { TestBatteryExecution } from "../../types";
import { vibrateClick, vibrateWarning, vibrateSuccess } from "../../lib/utils";
import { useApp } from "../../context/AppContext";
import { localize } from "../../lib/i18n";

interface DeleteBatteryModalProps {
  isOpen: boolean;
  onClose: () => void;
  battery: TestBatteryExecution;
  onConfirmDeleteBattery: (batteryId: string) => Promise<void>;
  darkMode?: boolean;
}

export const DeleteBatteryModal: React.FC<DeleteBatteryModalProps> = ({
  isOpen,
  onClose,
  battery,
  onConfirmDeleteBattery,
  darkMode,
}) => {
  const { language } = useApp();
  const L = (pt: string, en: string) => localize(language, pt, en);
  const [typedConfirm, setTypedConfirm] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen || !battery) return null;

  const testCount = battery.tests?.length || 0;
  const participantCount = battery.participants?.length || 0;
  const isMatch = typedConfirm.trim().toUpperCase() === battery.id.toUpperCase();

  const handleDelete = async () => {
    if (!isMatch) {
      vibrateWarning();
      return;
    }

    setIsDeleting(true);
    vibrateClick();
    await onConfirmDeleteBattery(battery.id);
    setIsDeleting(false);
    vibrateSuccess();
    onClose();
  };

  return (
    <div
      id="modal-delete-battery"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in"
    >
      <div
        className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${
          darkMode ? "bg-neutral-900 border-neutral-800 text-white" : "bg-white border-neutral-200 text-neutral-900"
        }`}
      >
        <div className="p-5 border-b flex items-center justify-between dark:border-neutral-800 border-neutral-200 bg-rose-600 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/20">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight">{L("Excluir Bateria de Testes", "Delete Test Battery")}</h2>
              <p className="text-xs text-white/80">{L("Ação Crítica Exclusiva para Administrador", "Critical Administrator-Only Action")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={L("Fechar", "Close")}
            className="p-1.5 rounded-lg text-white/80 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="p-3.5 rounded-xl bg-rose-500/10 border-2 border-rose-500/30 text-rose-950 dark:text-rose-200 text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold text-rose-700 dark:text-rose-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {L("Atenção: Ação Permanente e Irreversível", "Warning: Permanent and Irreversible Action")}
            </div>
            <p>
              {L("Você está prestes a excluir a bateria ", "You are about to delete the test battery ")}
              <strong>{battery.title || battery.name || battery.id}</strong> ({battery.id}).
            </p>
            <p>
              {L("Isso removerá permanentemente do Firestore:", "This will permanently remove from Firestore:")}
            </p>
            <ul className="list-disc pl-5 space-y-1 font-semibold">
              <li>{L(`${testCount} caso(s) de teste e seus resultados associados`, `${testCount} test case(s) and their associated results`)}</li>
              <li>{L(`${participantCount} registro(s) de atribuição de testadores`, `${participantCount} tester assignment record(s)`)}</li>
              <li>{L("Toda a trilha de auditoria e métricas desta bateria", "The entire audit trail and metrics for this battery")}</li>
            </ul>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-neutral-500 uppercase">
              {L("Para confirmar, digite exatamente o ID da bateria (", "To confirm, type the exact battery ID (")}
              <span className="font-mono text-rose-600 dark:text-rose-400">{battery.id}</span>):
            </label>
            <input
              type="text"
              value={typedConfirm}
              onChange={(e) => setTypedConfirm(e.target.value)}
              placeholder={L(`Digite ${battery.id}`, `Type ${battery.id}`)}
              className={`w-full text-xs font-mono font-bold px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-rose-500 ${
                darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
              }`}
            />
          </div>
        </div>

        <div className="p-4 bg-neutral-50 dark:bg-neutral-800/50 border-t dark:border-neutral-800 border-neutral-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2.5 text-xs font-semibold rounded-xl border dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
          >
            {L("Cancelar", "Cancel")}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!isMatch || isDeleting}
            className={`px-5 py-2.5 text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5 ${
              isMatch && !isDeleting
                ? "bg-rose-600 hover:bg-rose-700 active:scale-95 text-white cursor-pointer"
                : "bg-neutral-300 dark:bg-neutral-700 text-neutral-500 cursor-not-allowed"
            }`}
          >
            <Trash2 className="w-4 h-4" />
            {isDeleting ? L("Excluindo...", "Deleting...") : L("Excluir Definitivamente", "Delete Permanently")}
          </button>
        </div>
      </div>
    </div>
  );
};
