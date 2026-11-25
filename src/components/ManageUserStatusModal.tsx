import React, { useState, useEffect } from "react";
import { User, AccountStatus } from "../types";
import { useApp } from "../context/AppContext";
import { localize, translateUserRole, getLocaleForLanguage } from "../lib/i18n";
import {
  resolveAccountStatus,
  getSuspensionPresetOptions,
  calculateSuspensionDeadline,
  formatAccountStatusDetails,
  formatLocalDateTimeInput,
  parseLocalDateTimeInput,
} from "../lib/accountStatusUtils";
import { getSafeAvatarUrl, handleAvatarError } from "../lib/avatarUtils";
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

function getInitialCustomUntilLocal(targetUser: User | null): string {
  if (targetUser) {
    const candidateRaw = targetUser.suspendedUntil ?? targetUser.blockExpiresAt;
    if (candidateRaw) {
      const parsed = safeParseDate(candidateRaw);
      if (parsed && !Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
        const formatted = formatLocalDateTimeInput(parsed);
        if (formatted) return formatted;
      }
    }
  }
  return formatLocalDateTimeInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
}

export const ManageUserStatusModal: React.FC<ManageUserStatusModalProps> = ({
  user,
  isOpen,
  onClose,
  onUpdateStatus,
  currentAdminId,
}) => {
  const { language, t } = useApp();
  const L = (pt: string, en: string) => localize(language, pt, en);
  const locale = getLocaleForLanguage(language);
  const suspensionPresetOptions = getSuspensionPresetOptions(language);
  const initialResolved = user ? resolveAccountStatus(user) : null;

  const [selectedStatus, setSelectedStatus] = useState<AccountStatus>(
    initialResolved?.status || "active"
  );
  const [suspensionPreset, setSuspensionPreset] = useState<string>("7_days");
  const [customUntilDate, setCustomUntilDate] = useState<string>(() =>
    getInitialCustomUntilLocal(user)
  );
  const [reason, setReason] = useState<string>(user?.statusReason || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !user) return;
    const resolved = resolveAccountStatus(user);
    setSelectedStatus(resolved.status);
    setSuspensionPreset("7_days");
    setCustomUntilDate(getInitialCustomUntilLocal(user));
    setReason(user.statusReason || "");
    setErrorMessage(null);
    setIsSubmitting(false);
  }, [
    isOpen,
    user?.id,
    user?.status,
    user?.active,
    user?.suspendedUntil,
    user?.blockExpiresAt,
    user?.statusReason,
  ]);

  if (!isOpen || !user) return null;

  const isSelf = user.id === currentAdminId;
  const currentResolved = resolveAccountStatus(user);
  const currentStatusDisplay = formatAccountStatusDetails(user, language);
  const minLocalDateTime = formatLocalDateTimeInput(new Date());
  const parsedCustomPreview =
    suspensionPreset === "custom" ? parseLocalDateTimeInput(customUntilDate) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (isSelf) {
      vibrateWarning();
      setErrorMessage(
        L(
          "Você não pode suspender, banir ou alterar a situação da sua própria conta de administrador ativa.",
          "You cannot suspend, ban, or alter the status of your own active administrator account."
        )
      );
      return;
    }

    if (selectedStatus === "banned" && !reason.trim()) {
      vibrateWarning();
      setErrorMessage(
        L(
          "O motivo é obrigatório para aplicar um banimento permanente.",
          "A reason is required to apply a permanent ban."
        )
      );
      return;
    }

    if (selectedStatus === "suspended" && !reason.trim()) {
      vibrateWarning();
      setErrorMessage(
        L(
          "O motivo é obrigatório para aplicar uma suspensão de conta.",
          "A reason is required to apply an account suspension."
        )
      );
      return;
    }

    let calculatedUntil: string | undefined;
    if (selectedStatus === "suspended") {
      if (suspensionPreset === "custom") {
        if (!customUntilDate || !customUntilDate.trim()) {
          vibrateWarning();
          setErrorMessage(
            L(
              "Selecione a data e horário limite da suspensão.",
              "Select the end date and time for the suspension."
            )
          );
          return;
        }
        const customDateObj = parseLocalDateTimeInput(customUntilDate);
        if (!customDateObj || customDateObj.getTime() <= Date.now()) {
          vibrateWarning();
          setErrorMessage(
            L(
              "A data e hora personalizadas da suspensão devem ser válidas e estar no futuro.",
              "The custom suspension date and time must be valid and in the future."
            )
          );
          return;
        }
        calculatedUntil = customDateObj.toISOString();
      } else {
        try {
          calculatedUntil = calculateSuspensionDeadline(suspensionPreset, undefined, language);
        } catch (calcErr: any) {
          vibrateWarning();
          setErrorMessage(calcErr?.message || L("Prazo de suspensão inválido.", "Invalid suspension duration."));
          return;
        }
      }
    }

    try {
      setIsSubmitting(true);
      await onUpdateStatus(user.id, selectedStatus, reason.trim(), calculatedUntil);
      vibrateSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || L("Erro ao salvar alteração de situação do usuário.", "Error saving user status update."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="manage-status-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div
        id="manage-status-modal-container"
        className="relative w-full max-w-lg bg-white dark:bg-[#111827] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-900/40">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/40 text-[#16845B] dark:text-emerald-400 border border-[#16845B]/15">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 id="manage-status-modal-title" className="text-base font-bold text-[#172B2A] dark:text-white">
                {L("Gerenciar Situação da Conta", "Manage Account Status")}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {L("Controle de acesso, suspensão temporária e banimento", "Access control, temporary suspension, and banning")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              vibrateClick();
              onClose();
            }}
            className="p-2 rounded-xl text-slate-400 hover:text-[#172B2A] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label={t("close")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Target User Info Summary */}
          <div className="p-4 rounded-xl bg-[#F8FAFC] dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center space-x-3 min-w-0">
              <img
                src={getSafeAvatarUrl(user.avatarUrl, user.name)}
                alt=""
                referrerPolicy="no-referrer"
                onError={(e) => handleAvatarError(e, user.name)}
                className="w-10 h-10 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
              />
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#172B2A] dark:text-white truncate">
                  {user.name}
                </p>
                <p className="text-[11px] font-mono text-slate-500 truncate">
                  {user.email}
                </p>
                <p className="text-[10px] text-slate-400 tabular-nums">
                  {user.courseOrDept} • {L("Matrícula:", "ID:")} {user.registrationNumber || "N/A"}
                </p>
              </div>
            </div>

            <div className="text-right shrink-0">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap shrink-0 ${currentStatusDisplay.badgeClass}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${currentStatusDisplay.dotClass}`} />
                {currentStatusDisplay.label}
              </span>
              {user.role && (
                <p className="text-[9px] text-slate-400 font-semibold uppercase mt-1">
                  {L("Função:", "Role:")} {translateUserRole(user.role, language)}
                </p>
              )}
            </div>
          </div>

          {/* Self User Restriction Warning */}
          {isSelf && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs flex items-start space-x-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">{L("Ação Bloqueada", "Action Blocked")}</p>
                <p className="text-[11px] mt-0.5">
                  {L(
                    "Você está autenticado nesta conta de administrador. Por segurança do sistema, não é permitido suspender ou banir a sua própria conta ativa.",
                    "You are signed in with this administrator account. For system security, you cannot suspend or ban your own active account."
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Legacy / Security Rules Inconsistency Diagnostic */}
          {currentResolved.hasLegacyInconsistency && currentResolved.inconsistencyReasons.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300/70 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs space-y-1.5">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>{L("Inconsistência Cadastral / Legado Detectada", "Legacy / Record Inconsistency Detected")}</span>
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] opacity-90">
                {currentResolved.inconsistencyReasons.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
              <p className="text-[10px] text-amber-800/80 dark:text-amber-300/80">
                {language === "en" ? (
                  <>Confirming a new status (such as <strong>Active</strong>) will normalize and clean up residual or incompatible fields in Firestore.</>
                ) : (
                  <>Ao confirmar uma nova situação (como <strong>Ativo</strong>), os campos residuais ou incompatíveis serão normalizados e limpos no Firestore.</>
                )}
              </p>
            </div>
          )}

          {/* Current Status Info Box if suspended/banned */}
          {currentResolved.status !== "active" && (
            <div className="p-3.5 rounded-2xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 text-xs space-y-1">
              <p className="font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-neutral-500" />
                <span>{L("Situação Atual da Conta:", "Current Account Status:")}</span>
              </p>
              <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                {currentStatusDisplay.description}
              </p>
              {currentResolved.statusUpdatedAt && (
                <p className="text-[10px] text-neutral-400 font-mono">
                  {L("Última atualização:", "Last updated:")} {formatDate(currentResolved.statusUpdatedAt, undefined, language)} {L("por", "by")} {currentResolved.statusUpdatedBy || translateUserRole("ADMIN", language)}
                </p>
              )}
            </div>
          )}

          {/* Status Selection Buttons */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
              {L("Definir Nova Situação", "Set New Status")}
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
                <span className="text-xs font-bold">{L("Ativo", "Active")}</span>
                <span className="text-[10px] text-neutral-400 font-normal">{L("Acesso liberado", "Full access")}</span>
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
                <span className="text-xs font-bold">{L("Suspender", "Suspend")}</span>
                <span className="text-[10px] text-neutral-400 font-normal">{L("Temporário / Indef.", "Temporary / Indef.")}</span>
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
                <span className="text-xs font-bold">{L("Banir", "Ban")}</span>
                <span className="text-[10px] text-neutral-400 font-normal">{L("Permanente", "Permanent")}</span>
              </button>
            </div>
          </div>

          {/* Conditional Duration Options for Suspension */}
          {selectedStatus === "suspended" && (
            <div className="space-y-3 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 animate-in fade-in duration-150">
              <label className="block text-xs font-bold text-amber-900 dark:text-amber-300">
                {L("Prazo da Suspensão", "Suspension Duration")}
              </label>
              <select
                value={suspensionPreset}
                onChange={(e) => setSuspensionPreset(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-xs font-medium text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
              >
                {suspensionPresetOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {suspensionPreset === "custom" && (
                <div className="space-y-1 pt-1">
                  <label className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                    {L("Data e Hora do Término da Suspensão (horário local):", "Suspension End Date & Time (local time):")}
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="datetime-local"
                      value={customUntilDate}
                      onChange={(e) => setCustomUntilDate(e.target.value)}
                      min={minLocalDateTime}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  {parsedCustomPreview && parsedCustomPreview.getTime() > Date.now() && (
                    <p className="text-[10px] text-amber-800 dark:text-amber-300 font-medium">
                      {L("Término previsto:", "Scheduled end:")} {parsedCustomPreview.toLocaleDateString(locale)} {L("às", "at")}{" "}
                      {parsedCustomPreview.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                </div>
              )}

              {suspensionPreset === "indefinite" ? (
                <p className="text-[10px] text-amber-800 dark:text-amber-300 font-medium leading-relaxed">
                  {language === "en" ? (
                    <><strong>Indefinite suspension:</strong> this account will NOT expire automatically and will remain blocked until an administrator manually reactivates it. Residual deadline fields will be removed.</>
                  ) : (
                    <><strong>Suspensão por tempo indeterminado:</strong> esta conta NÃO expira automaticamente e permanecerá bloqueada até que um administrador execute a reativação manual. Prazos temporais residuais serão removidos.</>
                  )}
                </p>
              ) : (
                <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80">
                  {language === "en" ? (
                    <>Once the Firestore Timestamp deadline expires, the status is automatically restored to <strong>Active</strong> by the system without manual intervention.</>
                  ) : (
                    <>Após expirar o prazo registrado no banco de dados, a situação é automaticamente recalculada para <strong>Ativo</strong> pelo sistema sem necessidade de intervenção manual.</>
                  )}
                </p>
              )}
            </div>
          )}

          {/* Reason Input (Mandatory for suspension and ban) */}
          {(selectedStatus === "suspended" || selectedStatus === "banned") && (
            <div className="space-y-1.5 animate-in fade-in duration-150">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {L("Motivo / Justificativa Institucional", "Institutional Reason / Justification")} <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder={
                  selectedStatus === "banned"
                    ? L("Descreva a justificativa para o banimento permanente desta conta...", "Describe the reason for permanently banning this account...")
                    : L("Descreva a justificativa para a suspensão temporária do usuário...", "Describe the reason for temporarily suspending this user...")
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8FAFC] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-[#172B2A] dark:text-white outline-none focus:ring-2 focus:ring-[#16845B] placeholder-slate-400 resize-none"
                required
              />
              <p className="text-[10px] text-slate-400">
                {L(
                  "Este motivo ficará registrado permanentemente na auditoria do sistema e será comunicado ao usuário.",
                  "This reason will be permanently recorded in the system audit trail and communicated to the user."
                )}
              </p>
            </div>
          )}

          {/* Error Message if any */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 text-red-600 dark:text-red-400 text-xs font-medium flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                onClose();
              }}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isSelf}
              className={`px-5 py-2.5 rounded-xl text-white text-xs font-semibold transition-all flex items-center space-x-1.5 shadow-sm cursor-pointer ${
                selectedStatus === "banned"
                  ? "bg-red-600 hover:bg-red-700"
                  : selectedStatus === "suspended"
                  ? "bg-amber-600 hover:bg-amber-700 text-white"
                  : "bg-[#16845B] hover:bg-[#064E3B]"
              } ${isSubmitting || isSelf ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                  <span>{t("saving")}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{L("Confirmar Alteração", "Confirm Change")}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
