import React, { useState } from "react";
import { X, Trash2, AlertTriangle, UserX, AlertCircle } from "lucide-react";
import { TestCaseItem } from "../../types";
import { vibrateClick, vibrateWarning, vibrateSuccess } from "../../lib/utils";

interface DeleteTestCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  test: TestCaseItem | null;
  onConfirmDelete: (testId: string) => Promise<void>;
  darkMode?: boolean;
}

export const DeleteTestCaseModal: React.FC<DeleteTestCaseModalProps> = ({
  isOpen,
  onClose,
  test,
  onConfirmDelete,
  darkMode,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen || !test) return null;

  const isAssigned = !!(test.assignedToName || test.assignedToUserId || test.assignedToEmail);

  const handleDelete = async () => {
    setIsDeleting(true);
    vibrateClick();
    await onConfirmDelete(test.id);
    setIsDeleting(false);
    vibrateSuccess();
    onClose();
  };

  return (
    <div
      id="modal-delete-test-case"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
    >
      <div
        className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${
          darkMode ? "bg-neutral-900 border-neutral-800 text-white" : "bg-white border-neutral-200 text-neutral-900"
        }`}
      >
        {/* Header com aviso vermelho */}
        <div className="p-5 border-b flex items-center justify-between dark:border-neutral-800 border-neutral-200 bg-rose-500/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-600 text-white shadow-sm">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight text-rose-600 dark:text-rose-400">
                Confirmar Exclusão de Caso de Teste
              </h2>
              <p className="text-xs text-neutral-500 font-mono">ID: {test.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold">
              Você tem certeza de que deseja excluir permanentemente o seguinte caso de teste desta bateria?
            </p>
            <div
              className={`p-3.5 rounded-xl border space-y-1 text-xs ${
                darkMode ? "bg-neutral-800/60 border-neutral-700" : "bg-neutral-50 border-neutral-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold px-2 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-[10px]">
                  {test.id}
                </span>
                <span className="text-[10px] font-bold text-neutral-500 uppercase">{test.categoryName || test.category}</span>
              </div>
              <p className="font-bold text-neutral-900 dark:text-white pt-1">{test.title}</p>
            </div>
          </div>

          {/* Aviso crítico caso esteja atribuído a um testador */}
          {isAssigned ? (
            <div className="p-3.5 rounded-xl bg-amber-500/15 border-2 border-amber-500/40 text-amber-950 dark:text-amber-200 space-y-1.5 text-xs">
              <div className="flex items-center gap-2 font-black text-amber-800 dark:text-amber-300 uppercase tracking-wide">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                Atenção: Teste com Atribuição Ativa
              </div>
              <p className="leading-relaxed">
                Este teste está atualmente distribuído para o testador{" "}
                <strong className="underline">{test.assignedToName || test.assignedToEmail}</strong>.
              </p>
              <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90">
                Ao excluir, a atribuição será revogada imediatamente e o teste será removido da fila de trabalho do participante sem deixar registros órfãos.
              </p>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-neutral-400 shrink-0" />
              <span>O teste não possui nenhum testador atribuído no momento.</span>
            </div>
          )}

          <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
            Esta operação é definitiva e atualizará os contadores da bateria e a trilha de auditoria no Firestore.
          </p>
        </div>

        <div className="p-4 bg-neutral-50 dark:bg-neutral-800/50 border-t dark:border-neutral-800 border-neutral-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2.5 text-xs font-semibold rounded-xl border dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            {isDeleting ? "Excluindo..." : "Confirmar Exclusão"}
          </button>
        </div>
      </div>
    </div>
  );
};
