import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { filterNotificationsForUser } from "../lib/notificationHelper";
import { formatDateTime, vibrateClick, vibrateSuccess } from "../lib/utils";
import {
  PageHeader,
  SurfaceCard,
  UIButton,
  UIBadge,
  EmptyState,
} from "./ui";
import {
  Bell,
  CheckCheck,
  Trash2,
  Sparkles,
  Smartphone,
  ExternalLink,
  Volume2,
  CheckCircle2,
} from "lucide-react";

export const NotificationsView: React.FC = () => {
  const {
    notifications,
    markNotificationRead,
    clearAllNotifications,
    currentUser,
    firebaseUser,
    fcmPermissionGranted,
    requestNotificationPermission,
    testFCMAlert,
    items,
    setSelectedItemForDetail,
  } = useApp();

  const [filter, setFilter] = useState<"ALL" | "UNREAD" | "READ">("ALL");

  const userNotifications = filterNotificationsForUser(
    notifications,
    currentUser,
    firebaseUser?.uid
  );

  const unreadCount = userNotifications.filter((n) => !n.read).length;
  const readCount = userNotifications.filter((n) => n.read).length;

  const filteredNotifications = userNotifications.filter((n) => {
    if (filter === "UNREAD") return !n.read;
    if (filter === "READ") return n.read;
    return true;
  });

  const handleMarkAllRead = () => {
    vibrateSuccess();
    userNotifications.forEach((n) => {
      if (!n.read) {
        markNotificationRead(n.id);
      }
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5 animate-in fade-in duration-300">
      {/* Header */}
      <PageHeader
        eyebrow="Central de Comunicações"
        title="Notificações & Alertas"
        description="Receba atualizações em tempo real sobre itens encontrados, correspondências inteligentes e devoluções."
        icon={<Bell className="w-5 h-5" />}
        badge={
          unreadCount > 0 ? (
            <UIBadge tone="emerald">{unreadCount} não lidas</UIBadge>
          ) : undefined
        }
        actions={
          <>
            {unreadCount > 0 && (
              <UIButton
                variant="outline"
                size="sm"
                onClick={handleMarkAllRead}
              >
                <CheckCheck className="w-4 h-4" />
                <span>Marcar todas lidas</span>
              </UIButton>
            )}

            {userNotifications.length > 0 && (
              <UIButton
                variant="secondary"
                size="sm"
                onClick={() => {
                  vibrateClick();
                  clearAllNotifications();
                }}
              >
                <Trash2 className="w-4 h-4 text-rose-500" />
                <span>Limpar histórico</span>
              </UIButton>
            )}
          </>
        }
      />

      {/* FCM Web Push Alert Card */}
      {!fcmPermissionGranted && (
        <SurfaceCard
          padding="md"
          className="border-[#16845B]/25 dark:border-emerald-800/60 bg-[#EBF5F0]/50 dark:bg-emerald-950/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#16845B] text-white flex items-center justify-center shrink-0 shadow-2xs">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#172B2A] dark:text-white">
                Ativar Notificações Push do IFPR
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 max-w-xl leading-relaxed">
                Seja avisado instantaneamente no seu navegador ou smartphone quando alguém encontrar um objeto que você perdeu no campus.
              </p>
            </div>
          </div>

          <UIButton
            variant="primary"
            size="md"
            onClick={() => {
              vibrateClick();
              requestNotificationPermission();
            }}
          >
            Ativar Notificações Push
          </UIButton>
        </SurfaceCard>
      )}

      {/* Filter Tabs */}
      <SurfaceCard
        padding="sm"
        className="flex flex-wrap items-center justify-between gap-2"
      >
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70">
          <button
            type="button"
            onClick={() => {
              vibrateClick();
              setFilter("ALL");
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filter === "ALL"
                ? "bg-[#16845B] text-white shadow-2xs"
                : "text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 hover:text-[#172B2A] dark:hover:text-white"
            }`}
          >
            Todas ({userNotifications.length})
          </button>

          <button
            type="button"
            onClick={() => {
              vibrateClick();
              setFilter("UNREAD");
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              filter === "UNREAD"
                ? "bg-[#16845B] text-white shadow-2xs"
                : "text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 hover:text-[#172B2A] dark:hover:text-white"
            }`}
          >
            <span>Não Lidas</span>
            {unreadCount > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  filter === "UNREAD"
                    ? "bg-white/20 text-white"
                    : "bg-rose-600 text-white"
                }`}
              >
                {unreadCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              vibrateClick();
              setFilter("READ");
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filter === "READ"
                ? "bg-[#16845B] text-white shadow-2xs"
                : "text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 hover:text-[#172B2A] dark:hover:text-white"
            }`}
          >
            Lidas ({readCount})
          </button>
        </div>

        {/* Test Notification Sound */}
        <UIButton
          variant="ghost"
          size="sm"
          onClick={() => {
            vibrateClick();
            testFCMAlert();
          }}
          title="Testar som e sinal de alerta"
        >
          <Volume2 className="w-3.5 h-3.5 text-[#16845B] dark:text-emerald-400" />
          <span>Testar Som</span>
        </UIButton>
      </SurfaceCard>

      {/* Notifications List */}
      {filteredNotifications.length === 0 ? (
        <EmptyState
          icon={<Bell className="w-7 h-7" />}
          title="Nenhuma notificação encontrada"
          description={
            filter === "UNREAD"
              ? "Você já leu todas as suas notificações!"
              : "Quando houver novas correspondências de objetos ou mensagens, elas aparecerão aqui."
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map((notification) => {
            const relatedItem = notification.relatedItemId
              ? items.find((i) => i.id === notification.relatedItemId)
              : null;

            const handleNotificationActivate = () => {
              vibrateClick();
              if (!notification.read) {
                markNotificationRead(notification.id);
              }
              if (relatedItem) {
                setSelectedItemForDetail(relatedItem);
              }
            };

            return (
              <SurfaceCard
                key={notification.id}
                padding="md"
                interactive
                role="button"
                tabIndex={0}
                onClick={handleNotificationActivate}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleNotificationActivate();
                  }
                }}
                className={`cursor-pointer ${
                  !notification.read
                    ? "bg-[#EBF5F0]/45 dark:bg-emerald-950/20 border-[#16845B]/30 dark:border-emerald-800/70"
                    : ""
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        !notification.read
                          ? "bg-[#16845B] text-white"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {notification.type === "MATCH" ? (
                        <Sparkles className="w-4 h-4" />
                      ) : notification.type === "CLAIM_UPDATE" ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <Bell className="w-4 h-4" />
                      )}
                    </div>

                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-bold text-[#172B2A] dark:text-white">
                          {notification.title}
                        </h4>
                        {!notification.read && (
                          <UIBadge tone="emerald">Nova</UIBadge>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        {notification.message}
                      </p>

                      {relatedItem && (
                        <div className="pt-0.5">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EBF5F0] dark:bg-emerald-950/50 text-[#064E3B] dark:text-emerald-300 text-xs font-semibold border border-[#16845B]/20 dark:border-emerald-800/60">
                            <span>Objeto relacionado: {relatedItem.title}</span>
                            <ExternalLink className="w-3 h-3" />
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono tabular-nums whitespace-nowrap shrink-0 sm:pt-0.5">
                    {formatDateTime(notification.timestamp || (notification as any).createdAt)}
                  </span>
                </div>
              </SurfaceCard>
            );
          })}
        </div>
      )}
    </div>
  );
};
