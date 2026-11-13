import React from "react";
import { LostFoundItem, NotificationItem } from "../types";
import { isItemNew, safeParseDate, formatDate } from "../lib/utils";
import { SurfaceCard, UIBadge, EmptyState } from "./ui";
import {
  Activity,
  CheckCircle2,
  PackageSearch,
  Clock,
  ArrowRight,
  UserCheck,
  Inbox,
} from "lucide-react";

interface RecentActivityWidgetProps {
  items: LostFoundItem[];
  notifications: NotificationItem[];
  onSelectItem: (item: LostFoundItem) => void;
}

export const RecentActivityWidget: React.FC<RecentActivityWidgetProps> = ({
  items,
  onSelectItem,
}) => {
  const recentFeed = (items || [])
    .slice()
    .sort(
      (a, b) =>
        (safeParseDate(b.createdAt || b.date)?.getTime() || 0) -
        (safeParseDate(a.createdAt || a.date)?.getTime() || 0)
    )
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
    <SurfaceCard padding="md" className="space-y-4 sm:space-y-5">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3.5 sm:pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[#EBF5F0] dark:bg-[#16845B]/20 text-[#16845B] dark:text-emerald-400 border border-[#16845B]/15 shrink-0">
            <Activity className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="font-bold text-sm sm:text-base text-[#172B2A] dark:text-white tracking-tight">
              Atividade Recente no Campus
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 hidden xs:block">
              Últimos registros e restituições sincronizados em tempo real
            </p>
          </div>
        </div>

        <UIBadge tone="emerald">
          <span className="w-1.5 h-1.5 rounded-full bg-[#16845B] dark:bg-emerald-400 animate-pulse" />
          <span>Tempo Real</span>
        </UIBadge>
      </div>

      {recentFeed.length === 0 ? (
        <EmptyState
          icon={<Inbox className="w-6 h-6" />}
          title="Nenhuma atividade recente registrada"
          description="Assim que objetos forem cadastrados ou restituídos no IFPR Campus Ivaiporã, eles aparecerão automaticamente neste histórico."
          className="border-0 shadow-none p-6 sm:p-8"
        />
      ) : (
        <div className="space-y-2.5">
          {recentFeed.map((activity) => (
            <div
              key={activity.id}
              onClick={() => onSelectItem(activity.item)}
              className="p-3.5 rounded-xl bg-[#F8FAFC] dark:bg-slate-800/50 hover:bg-[#EBF5F0]/50 dark:hover:bg-slate-800 transition-all border border-slate-200/80 dark:border-slate-700/70 cursor-pointer flex items-center gap-3 group"
            >
              {/* Status Icon */}
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  activity.type === "DEVOLVIDO"
                    ? "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60"
                    : activity.type === "PERDIDO"
                    ? "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60"
                    : "bg-[#EBF5F0] text-[#16845B] dark:bg-emerald-950/50 dark:text-emerald-300 border border-[#16845B]/20"
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
                  <div className="flex items-center gap-2 min-w-0">
                    <h4 className="font-semibold text-xs sm:text-sm text-[#172B2A] dark:text-white truncate group-hover:text-[#16845B] dark:group-hover:text-emerald-400 transition-colors">
                      {activity.title}
                    </h4>
                    {isItemNew(activity.item) && <UIBadge tone="emerald">Novo</UIBadge>}
                  </div>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1 shrink-0 font-medium tabular-nums">
                    <Clock className="w-3 h-3" /> {formatDate(activity.time)}
                  </span>
                </div>

                <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  <span className="truncate">
                    Local: <strong className="font-medium text-slate-700 dark:text-slate-300">{activity.location}</strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {activity.userRole}
                  </span>
                </div>
              </div>

              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#16845B] dark:group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all shrink-0" />
            </div>
          ))}
        </div>
      )}
    </SurfaceCard>
  );
};
