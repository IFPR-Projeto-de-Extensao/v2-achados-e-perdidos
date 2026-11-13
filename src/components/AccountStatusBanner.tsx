import React from "react";
import { User } from "../types";
import { resolveAccountStatus } from "../lib/accountStatusUtils";
import { safeParseDate, formatDate } from "../lib/utils";
import { ShieldAlert, AlertOctagon, Clock, Mail } from "lucide-react";

interface AccountStatusBannerProps {
  user: User | null;
}

export const AccountStatusBanner: React.FC<AccountStatusBannerProps> = ({ user }) => {
  if (!user || user.id === "guest_visitor") return null;

  const resolved = resolveAccountStatus(user);
  if (resolved.status === "active") return null;

  const isBanned = resolved.status === "banned";
  const untilDate = resolved.suspendedUntil ? safeParseDate(resolved.suspendedUntil) : null;
  const untilStr = untilDate
    ? `até ${untilDate.toLocaleDateString("pt-BR")} às ${untilDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
    : "por tempo indeterminado";

  return (
    <aside
      id="account-status-alert-banner"
      aria-label="Aviso de restrição da conta"
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
              <span>{isBanned ? "Conta Banida Institucionalmente" : "Conta Temporariamente Suspensa"}</span>
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
                ? `Motivo registrado: "${resolved.statusReason}". `
                : ""}
              {isBanned
                ? "As operações de cadastro, reivindicação e comentários estão permanentemente bloqueadas nesta conta."
                : "Seu acesso a novas ocorrências e reivindicações está pausado durante a suspensão."}
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
            <span>Suporte / Ouvidoria</span>
          </a>
        </div>
      </div>
    </aside>
  );
};
