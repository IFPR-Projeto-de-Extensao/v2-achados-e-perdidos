import React, { useState } from "react";
import { User, AccountStatus } from "../types";
import {
  resolveAccountStatus,
  SUSPENSION_PRESET_OPTIONS,
  calculateSuspensionDeadline,
  formatAccountStatusDetails,
} from "../lib/accountStatusUtils";
import { formatDate, safeParseDate, vibrateClick, vibrateSuccess, vibrateWarning } from "../lib/utils";
import {
  X,
  ShieldAlert,
  ShieldCheck,
  UserX,
  Clock,
  AlertTriangle,
  Info,
  CheckCircle2,
  Calendar,
} from "lucide-react";

interface ManageUserStatusModalProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStatus: (
    targetUserId: string,
    newStatus: AccountStatus,
    reason?: string,
    suspendedUntil?: string
  ) => Promise<void>;
  currentAdminId: string;
}

export const ManageUserStatusModal: React.FC<ManageUserStatusModalProps> = ({
  user,
  isOpen,
  onClose,
  onUpdateStatus,
  currentAdminId,
}) => {
  if (!isOpen || !user) return null;

  const isSelf = user.id === currentAdminId;
  const currentResolved = resolveAccountStatus(user);

  const [selectedStatus, setSelectedStatus] = useState<AccountStatus>(currentResolved.status);
  const [suspensionPreset, setSuspensionPreset] = useState<string>("7_days");
  const [customUntilDate, setCustomUntilDate] = useState<string>(() => {
    if (user.suspendedUntil) {
      try {
        const d = new Date(user.suspendedUntil);
        return d.toISOString().slice(0, 16);
      } catch (_) {}
    }
    const defaultDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return defaultDate.toISOString().slice(0, 16);
  });
  const [reason, setReason] = useState<string>(user.statusReason || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentStatusDisplay = formatAccountStatusDetails(user);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (isSelf) {
      vibrateWarning();
      setErrorMessage("Você não pode suspender, banir ou alterar o status da sua própria conta de administrador ativa.");
      return;
    }

    if (selectedStatus === "banned" && !reason.trim()) {
      vibrateWarning();
      setErrorMessage("O motivo é obrigatório para aplicar um banimento permanente.");
      return;
    }

    if (selectedStatus === "suspended" && !reason.trim()) {
      vibrateWarning();
      setErrorMessage("O motivo é obrigatório para aplicar uma suspensão de conta.");
      return;
    }

    let calculatedUntil: string | undefined;
    if (selectedStatus === "suspended") {
      if (suspensionPreset === "custom") {
        if (!customUntilDate) {
          setErrorMessage("Selecione a data e horário limite da suspensão.");
          return;
        }
        const customDateObj = new Date(customUntilDate);
        if (isNaN(customDateObj.getTime()) || customDateObj.getTime() <= Date.now()) {
          setErrorMessage("A data personalizada da suspensão deve estar no futuro.");
          return;
        }
        calculatedUntil = customDateObj.toISOString();
      } else {
        calculatedUntil = calculateSuspensionDeadline(suspensionPreset);
      }
    }

    try {
      setIsSubmitting(true);
      await onUpdateStatus(user.id, selectedStatus, reason.trim(), calculatedUntil);
      vibrateSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || "Erro ao salvar alteração de status do usuário.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="manage-status-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        id="manage-status-modal-container"
        className="relative w-full max-w-lg bg-white dark:bg-[#1E1E1E] rounded-3xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30">
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-2xl bg-[#00843D]/10 text-[#00843D] dark:bg-[#00843D]/20">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 id="manage-status-modal-title" className="text-base font-black text-neutral-900 dark:text-white">
                Gerenciar Status da Conta
              </h3>
              <p className="text-xs text-neutral-500">
                Controle de acesso, suspensão temporária e banimento
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              vibrateClick();
              onClose();
            }}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Target User Info Summary */}
          <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3">
            <div className="flex items-center space-x-3 min-w-0">
              <img
                src={
                  user.avatarUrl ||
                  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80"
                }
                alt=""
                className="w-10 h-10 rounded-full object-cover shrink-0 border border-neutral-200 dark:border-neutral-700"
              />
              <div className="min-w-0">
                <p className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                  {user.name}
                </p>
                <p className="text-[11px] font-mono text-neutral-500 truncate">
                  {user.email}
                </p>
                <p className="text-[10px] text-neutral-400">
                  {user.courseOrDept} • Matrícula: {user.registrationNumber || "N/A"}
                </p>
              </div>
            </div>

            <div className="text-right shrink-0">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${currentStatusDisplay.badgeClass}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${currentStatusDisplay.dotClass}`} />
                {currentStatusDisplay.label}
              </span>
              {user.role && (
                <p className="text-[9px] text-neutral-400 font-bold uppercase mt-1">
                  Função: {user.role}
                </p>
              )}
            </div>
          </div>

          {/* Self User Restriction Warning */}
          {isSelf && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs flex items-start space-x-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Ação Bloqueada</p>
                <p className="text-[11px] mt-0.5">
                  Você está autenticado nesta conta de administrador. Por segurança do sistema, não é permitido suspender ou banir a sua própria conta ativa.
                </p>
              </div>
            </div>
          )}

          {/* Current Status Info Box if suspended/banned */}
          {currentResolved.status !== "active" && (
            <div className="p-3.5 rounded-2xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 text-xs space-y-1">
              <p className="font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-neutral-500" />
                <span>Situação Atual da Conta:</span>
              </p>
              <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                {currentStatusDisplay.description}
              </p>
              {currentResolved.statusUpdatedAt && (
                <p className="text-[10px] text-neutral-400 font-mono">
                  Última atualização: {formatDate(currentResolved.statusUpdatedAt)} por {currentResolved.statusUpdatedBy || "Administrador"}
                </p>
              )}
            </div>
          )}

          {/* Status Selection Buttons */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
              Definir Novo Status
            </label>
            <div className="grid grid-cols-3 gap-2">
              {/* Option 1: Ativo */}
              <button
                type="button"
                disabled={isSelf}
                onClick={() => {
                  vibrateClick();
                  setSelectedStatus("active");
                }}
                className={`p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center space-y-1 ${
                  selectedStatus === "active"
                    ? "bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-black shadow-xs ring-2 ring-emerald-500/20"
                    : "bg-neutral-50 dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300"
                } ${isSelf ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <span className="text-xs font-bold">Ativo</span>
                <span className="text-[10px] text-neutral-400 font-normal">Acesso liberado</span>
              </button>

              {/* Option 2: Suspenso */}
              <button
                type="button"
                disabled={isSelf}
                onClick={() => {
                  vibrateClick();
                  setSelectedStatus("suspended");
                }}
                className={`p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center space-y-1 ${
                  selectedStatus === "suspended"
                    ? "bg-amber-500/15 border-amber-500 text-amber-700 dark:text-amber-300 font-black shadow-xs ring-2 ring-amber-500/20"
                    : "bg-neutral-50 dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300"
                } ${isSelf ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                <Clock className="w-5 h-5 text-amber-600" />
                <span className="text-xs font-bold">Suspender</span>
                <span className="text-[10px] text-neutral-400 font-normal">Temporário</span>
              </button>

              {/* Option 3: Banido */}
              <button
                type="button"
                disabled={isSelf}
                onClick={() => {
                  vibrateClick();
                  setSelectedStatus("banned");
                }}
                className={`p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center space-y-1 ${
                  selectedStatus === "banned"
                    ? "bg-red-500/15 border-red-500 text-red-700 dark:text-red-300 font-black shadow-xs ring-2 ring-red-500/20"
                    : "bg-neutral-50 dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300"
                } ${isSelf ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                <UserX className="w-5 h-5 text-red-600" />
                <span className="text-xs font-bold">Banir</span>
                <span className="text-[10px] text-neutral-400 font-normal">Permanente</span>
              </button>
            </div>
          </div>

          {/* Conditional Duration Options for Suspension */}
          {selectedStatus === "suspended" && (
            <div className="space-y-3 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 animate-in fade-in duration-150">
              <label className="block text-xs font-bold text-amber-900 dark:text-amber-300">
                Prazo da Suspensão
              </label>
              <select
                value={suspensionPreset}
                onChange={(e) => setSuspensionPreset(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-xs font-medium text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
              >
                {SUSPENSION_PRESET_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {suspensionPreset === "custom" && (
                <div className="space-y-1 pt-1">
                  <label className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                    Data e Hora do Término da Suspensão:
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="datetime-local"
                      value={customUntilDate}
                      onChange={(e) => setCustomUntilDate(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
              )}

              <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80">
                Após expirar o prazo, o status é automaticamente recalculado para <strong>Ativo</strong> pelo sistema sem necessidade de intervenção manual.
              </p>
            </div>
          )}

          {/* Reason Input (Mandatory for suspension and ban) */}
          {(selectedStatus === "suspended" || selectedStatus === "banned") && (
            <div className="space-y-1.5 animate-in fade-in duration-150">
              <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300">
                Motivo / Justificativa Institucional <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder={
                  selectedStatus === "banned"
                    ? "Descreva a justificativa para o banimento permanente desta conta..."
                    : "Descreva a justificativa para a suspensão temporária do usuário..."
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D] placeholder-neutral-400 resize-none shadow-xs"
                required
              />
              <p className="text-[10px] text-neutral-400">
                Este motivo ficará registrado permanentemente na auditoria do sistema e será comunicado ao usuário.
              </p>
            </div>
          )}

          {/* Error Message if any */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-xs font-medium flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                onClose();
              }}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-bold hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isSelf}
              className={`px-5 py-2.5 rounded-xl text-white text-xs font-black transition-all flex items-center space-x-1.5 shadow-md cursor-pointer ${
                selectedStatus === "banned"
                  ? "bg-red-600 hover:bg-red-700"
                  : selectedStatus === "suspended"
                  ? "bg-amber-600 hover:bg-amber-700 text-white"
                  : "bg-[#00843D] hover:bg-[#006e33]"
              } ${isSubmitting || isSelf ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                  <span>Salvando no Firestore...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar Alteração</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
