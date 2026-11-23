import React from "react";
import { User } from "../types";
import { useApp } from "../context/AppContext";
import { resolveAccountStatus } from "../lib/accountStatusUtils";
import { safeParseDate } from "../lib/utils";
import { getLocaleForLanguage } from "../lib/i18n";
import { AlertOctagon, Clock, Mail } from "lucide-react";

interface AccountStatusBannerProps {
  user: User | null;
}

export const AccountStatusBanner: React.FC<AccountStatusBannerProps> = ({ user }) => {
  const { language, t } = useApp();

  if (!user || user.id === "guest_visitor") return null;

  const resolved = resolveAccountStatus(user);
  if (resolved.status === "active") return null;

  const isBanned = resolved.status === "banned";
  const hasInvalidFields = resolved.suspendedUntilEval.isInvalid || resolved.blockExpiresAtEval.isInvalid;
  const activeDeadlineRaw = resolved.suspendedUntilEval.isActive
    ? user.suspendedUntil
    : resolved.blockExpiresAtEval.isActive
    ? user.blockExpiresAt
    : undefined;
  const untilDate = activeDeadlineRaw ? safeParseDate(activeDeadlineRaw) : null;
  const locale = getLocaleForLanguage(language);
  const untilStr = resolved.isDeactivated
    ? language === "en"
      ? "account deactivated"
      : "conta desativada"
    : hasInvalidFields
    ? language === "en"
      ? "record inconsistency"
      : "inconsistência cadastral"
    : untilDate
    ? language === "en"
      ? `until ${untilDate.toLocaleDateString(locale)} at ${untilDate.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`
      : `até ${untilDate.toLocaleDateString(locale)} às ${untilDate.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`
    : language === "en"
    ? "indefinitely"
    : "por tempo indeterminado";

  return (
    <aside
      id="account-status-alert-banner"
      aria-label={isBanned ? t("accountBannedTitle") : t("accountSuspendedTitle")}
      className={`w-full border-b px-4 py-3 sm:px-6 transition-all animate-in fade-in duration-200 ${
        isBanned
          ? "bg-rose-600 text-white border-rose-700 shadow-xs"
          : "bg-amber-50 dark:bg-amber-950/60 text-[#172B2A] dark:text-amber-100 border-amber-200 dark:border-amber-800/70"
      }`}
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div
            className={`p-2 rounded-xl shrink-0 ${
              isBanned
                ? "bg-rose-700/70 text-white"
                : "bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200"
            }`}
          >
            {isBanned ? (
              <AlertOctagon className="w-5 h-5" />
            ) : (
              <Clock className="w-5 h-5" />
            )}
          </div>

          <div className="space-y-0.5">
            <h4 className="text-xs sm:text-sm font-bold flex flex-wrap items-center gap-2">
              <span>
                {isBanned
                  ? t("accountBannedTitle", "Conta Banida Institucionalmente")
                  : resolved.isDeactivated
                  ? t("accountDeactivatedTitle", "Conta Administrativamente Desativada")
                  : hasInvalidFields
                  ? t("accountInconsistencyTitle", "Conta Temporariamente Bloqueada por Inconsistência")
                  : t("accountSuspendedTitle", "Conta Temporariamente Suspensa")}
              </span>
              {!isBanned && (
                <span className="px-2 py-0.5 rounded-full bg-amber-200/80 dark:bg-amber-900/70 text-amber-900 dark:text-amber-200 text-[10px] font-semibold uppercase tracking-wide">
                  {untilStr}
                </span>
              )}
            </h4>
            <p
              className={`text-xs leading-relaxed ${
                isBanned ? "text-rose-100" : "text-amber-900/90 dark:text-amber-200/90"
              }`}
            >
              {resolved.statusReason
                ? `${t("reasonRecorded", "Motivo registrado:")} "${resolved.statusReason}". `
                : ""}
              {isBanned
                ? t("accountBannedDesc", "As operações de cadastro, reivindicação e comentários estão permanentemente bloqueadas nesta conta.")
                : hasInvalidFields
                ? t("accountInconsistencyDesc", "Há um registro temporal incompatível no seu perfil que exige reativação ou normalização administrativa.")
                : t("accountSuspendedDesc", "Seu acesso a novas ocorrências e reivindicações está pausado durante o bloqueio.")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          <a
            href="mailto:localizamais0@gmail.com"
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-1.5 ${
              isBanned
                ? "bg-white text-rose-700 hover:bg-rose-50 shadow-2xs"
                : "bg-[#172B2A] dark:bg-amber-500 text-white dark:text-slate-950 hover:opacity-90 shadow-2xs"
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>{t("accountSupportBtn", "Suporte / Ouvidoria")}</span>
          </a>
        </div>
      </div>
    </aside>
  );
};
