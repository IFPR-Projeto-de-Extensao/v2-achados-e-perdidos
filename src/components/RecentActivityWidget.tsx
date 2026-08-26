import React from "react";
import { LostFoundItem, NotificationItem } from "../types";
import { isItemNew, safeParseDate, formatDate } from "../lib/utils";
import { Activity, Sparkles, CheckCircle2, PackageSearch, Clock, ArrowRight, UserCheck } from "lucide-react";

interface RecentActivityWidgetProps {
  items: LostFoundItem[];
  notifications: NotificationItem[];
  onSelectItem: (item: LostFoundItem) => void;
}

export const RecentActivityWidget: React.FC<RecentActivityWidgetProps> = ({
  items,
  notifications,
  onSelectItem,
}) => {
  // Generate a live feed combining recent items and system notifications
  const recentFeed = (items || [])
    .slice()
    .sort((a, b) => (safeParseDate(b.createdAt || b.date)?.getTime() || 0) - (safeParseDate(a.createdAt || a.date)?.getTime() || 0))
    .slice(0, 5)
    .map((item) => {
      const isDevolvido = item.status === "DEVOLVIDO";
      const isPerdido = item.type === "PERDIDO";

      return {
        id: item.id,
        item,
        type: isDevolvido ? "DEVOLVIDO" : isPerdido ? "PERDIDO" : "ENCONTRADO",
        title: isDevolvido
          ? `Objeto Devolvido: ${item.title}`
          : isPerdido
          ? `Perda Registrada: ${item.title}`
          : `Novo Achado: ${item.title}`,
        location: item.location,
        time: item.date || item.createdAt,
        userName: item.registeredByName || "Usuário do IFPR",
        userRole: item.registeredByRole || "ALUNO",
      };
    });

  return (
    <div className="bg-white dark:bg-[#1E1E1E] rounded-2xl sm:rounded-3xl border border-neutral-200 dark:border-neutral-800 p-3.5 xs:p-4 sm:p-6 shadow-sm space-y-3.5 sm:space-y-5">
      <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3 sm:pb-4">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 xs:p-2 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400">
            <Activity className="w-4 h-4 xs:w-5 xs:h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm xs:text-base text-neutral-900 dark:text-white">
              Atividade Recente • Feed em Tempo Real
            </h3>
            <p className="text-[11px] xs:text-xs text-neutral-500 dark:text-neutral-400 hidden xs:block">
              Últimas atualizações, novos registros e devoluções no Campus Ivaiporã
            </p>
          </div>
        </div>

        <span className="px-2 xs:px-2.5 py-0.5 xs:py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] xs:text-[10px] font-extrabold uppercase border border-emerald-500/20 flex items-center space-x-1 shrink-0">
          <span className="w-1.5 h-1.5 xs:w-2 xs:h-2 rounded-full bg-emerald-500 animate-ping" />
          <span>Ao Vivo</span>
        </span>
      </div>

      <div className="space-y-3">
        {recentFeed.map((activity) => (
          <div
            key={activity.id}
            onClick={() => onSelectItem(activity.item)}
            className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 hover:bg-[#00843D]/5 dark:hover:bg-neutral-800 transition-all border border-neutral-200/80 dark:border-neutral-700/60 cursor-pointer flex items-start space-x-3 group"
          >
            {/* Status Icon */}
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 font-bold ${
                activity.type === "DEVOLVIDO"
                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                  : activity.type === "PERDIDO"
                  ? "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                  : "bg-[#00843D]/10 text-[#00843D] dark:text-green-400 border border-[#00843D]/20"
              }`}
            >
              {activity.type === "DEVOLVIDO" ? (
                <UserCheck className="w-4 h-4" />
              ) : activity.type === "PERDIDO" ? (
                <PackageSearch className="w-4 h-4" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
            </div>

            {/* Content Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <h4 className="font-bold text-xs text-neutral-900 dark:text-white truncate group-hover:text-[#00843D] dark:group-hover:text-green-400 transition-colors">
                    {activity.title}
                  </h4>
                  {isItemNew(activity.item) && (
                    <span
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-600 text-white shrink-0 shadow-2xs"
                      title="Registrado nas últimas 24 horas"
                    >
                      <Sparkles className="w-2.5 h-2.5 text-amber-300 fill-amber-300" />
                      Novo
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-neutral-400 flex items-center gap-1 shrink-0 font-medium">
                  <Clock className="w-3 h-3" /> {formatDate(activity.time)}
                </span>
              </div>

              <div className="flex items-center space-x-2 mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                <span className="truncate">Local: <strong>{activity.location}</strong></span>
                <span>•</span>
                <span className="px-1.5 py-0.2 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-bold text-[9px]">
                  {activity.userRole}
                </span>
              </div>
            </div>

            <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:text-[#00843D] group-hover:translate-x-1 transition-all shrink-0 self-center" />
          </div>
        ))}
      </div>
    </div>
  );
};
