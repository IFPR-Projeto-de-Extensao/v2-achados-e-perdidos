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
          ? "bg-red-600 text-white border-red-700 shadow-md"
          : "bg-amber-500 text-neutral-950 border-amber-600 shadow-sm"
      }`}
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center space-x-3">
          <div
            className={`p-2 rounded-xl shrink-0 ${
              isBanned ? "bg-red-800/60 text-white" : "bg-amber-600/30 text-neutral-950"
            }`}
          >
            {isBanned ? (
              <AlertOctagon className="w-5 h-5" />
            ) : (
              <Clock className="w-5 h-5" />
            )}
          </div>

          <div className="space-y-0.5">
            <h4 className="text-xs sm:text-sm font-black flex items-center gap-2">
              <span>{isBanned ? "🚨 CONTA BANIDA INSTITUCIONALMENTE" : "⚠️ CONTA TEMPORARIAMENTE SUSPENSA"}</span>
              {!isBanned && (
                <span className="px-2 py-0.5 rounded-full bg-neutral-950/15 text-[10px] font-extrabold uppercase">
                  {untilStr}
                </span>
              )}
            </h4>
            <p
              className={`text-xs ${
                isBanned ? "text-red-100" : "text-neutral-900"
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

        <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto">
          <a
            href="mailto:localizamais6@gmail.com"
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all inline-flex items-center space-x-1.5 ${
              isBanned
                ? "bg-white text-red-700 hover:bg-neutral-100 shadow-xs"
                : "bg-neutral-950 text-white hover:bg-neutral-800 shadow-xs"
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
