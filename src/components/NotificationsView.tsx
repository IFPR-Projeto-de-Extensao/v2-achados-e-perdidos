import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../context/RouterContext";
import { filterNotificationsForUser } from "../lib/notificationHelper";
import { formatDateTime, vibrateClick, vibrateSuccess } from "../lib/utils";
import {
  Bell,
  CheckCheck,
  Trash2,
  Sparkles,
  Smartphone,
  ExternalLink,
  Volume2,
  Info,
  PackageSearch,
  CheckCircle2,
  ShieldAlert,
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
    t,
  } = useApp();
  const { navigate } = useRouter();

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
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#1E1E1E] p-6 sm:p-8 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-xs">
        <div>
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 text-[#00843D] dark:text-green-400 text-xs font-black uppercase tracking-wider mb-2">
            <Bell className="w-3.5 h-3.5" />
            <span>Central de Comunicações</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white tracking-tight">
            Notificações & Alertas
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Receba atualizações em tempo real sobre itens encontrados, correspondências inteligentes e devoluções.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="px-4 py-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-[#00843D] dark:text-green-400 font-bold text-xs border border-emerald-300 dark:border-emerald-800 transition-all flex items-center space-x-1.5"
            >
              <CheckCheck className="w-4 h-4" />
              <span>Marcar todas lidas</span>
            </button>
          )}

          {userNotifications.length > 0 && (
            <button
              onClick={() => {
                vibrateClick();
                clearAllNotifications();
              }}
              className="px-4 py-2.5 rounded-2xl bg-neutral-100 dark:bg-neutral-800 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 text-neutral-600 dark:text-neutral-400 font-bold text-xs border border-neutral-200 dark:border-neutral-700 transition-all flex items-center space-x-1.5"
            >
              <Trash2 className="w-4 h-4" />
              <span>Limpar histórico</span>
            </button>
          )}
        </div>
      </div>

      {/* FCM Web Push Alert Card */}
      {!fcmPermissionGranted && (
        <div className="bg-gradient-to-r from-[#00843D]/10 via-emerald-500/10 to-transparent p-5 sm:p-6 rounded-3xl border border-[#00843D]/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-2xl bg-[#00843D] text-white flex items-center justify-center shrink-0 shadow-md">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
                Ativar Notificações Push do IFPR
              </h3>
              <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-0.5 max-w-xl">
                Seja avisado instantaneamente no seu navegador ou smartphone quando alguém encontrar um objeto que você perdeu no campus.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              vibrateClick();
              requestNotificationPermission();
            }}
            className="px-5 py-2.5 rounded-2xl bg-[#00843D] hover:bg-[#006e33] text-white font-extrabold text-xs shadow-md transition-all whitespace-nowrap shrink-0"
          >
            Ativar Notificações Push
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center justify-between bg-white dark:bg-[#1E1E1E] p-2 rounded-2xl border border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center space-x-1">
          <button
            onClick={() => {
              vibrateClick();
              setFilter("ALL");
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              filter === "ALL"
                ? "bg-[#00843D] text-white shadow-xs"
                : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
          >
            Todas ({userNotifications.length})
          </button>

          <button
            onClick={() => {
              vibrateClick();
              setFilter("UNREAD");
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
              filter === "UNREAD"
                ? "bg-[#00843D] text-white shadow-xs"
                : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
          >
            <span>Não Lidas</span>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-black">
                {unreadCount}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              vibrateClick();
              setFilter("READ");
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              filter === "READ"
                ? "bg-[#00843D] text-white shadow-xs"
                : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
          >
            Lidas ({readCount})
          </button>
        </div>

        {/* Test Notification Sound */}
        <button
          onClick={() => {
            vibrateClick();
            testFCMAlert();
          }}
          title="Testar som e sinal de alerta"
          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-neutral-500 hover:text-neutral-900 dark:hover:text-white flex items-center space-x-1.5"
        >
          <Volume2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Testar Som</span>
        </button>
      </div>

      {/* Notifications List */}
      {filteredNotifications.length === 0 ? (
        <div className="bg-white dark:bg-[#1E1E1E] p-12 rounded-3xl border border-neutral-200 dark:border-neutral-800 text-center">
          <Bell className="w-12 h-12 text-neutral-300 dark:text-neutral-700 mx-auto mb-3" />
          <h3 className="text-base font-bold text-neutral-900 dark:text-white mb-1">
            Nenhuma notificação encontrada
          </h3>
          <p className="text-xs text-neutral-500 max-w-sm mx-auto">
            {filter === "UNREAD"
              ? "Você já leu todas as suas notificações!"
              : "Quando houver novas correspondências de objetos ou mensagens, elas aparecerão aqui."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map((notification) => {
            const relatedItem = notification.relatedItemId
              ? items.find((i) => i.id === notification.relatedItemId)
              : null;

            return (
              <div
                key={notification.id}
                onClick={() => {
                  vibrateClick();
                  if (!notification.read) {
                    markNotificationRead(notification.id);
                  }
                  if (relatedItem) {
                    setSelectedItemForDetail(relatedItem);
                  }
                }}
                className={`p-5 rounded-2xl border transition-all cursor-pointer ${
                  !notification.read
                    ? "bg-[#00843D]/5 dark:bg-[#00843D]/10 border-[#00843D]/30 shadow-xs"
                    : "bg-white dark:bg-[#1E1E1E] border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start space-x-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        !notification.read
                          ? "bg-[#00843D] text-white"
                          : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500"
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

                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <h4 className="text-sm font-bold text-neutral-900 dark:text-white">
                          {notification.title}
                        </h4>
                        {!notification.read && (
                          <span className="w-2 h-2 rounded-full bg-[#00843D]" />
                        )}
                      </div>
                      <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                        {notification.message}
                      </p>

                      {relatedItem && (
                        <div className="mt-2 inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-[#00843D] dark:text-green-400 text-xs font-bold border border-emerald-500/20">
                          <span>Objeto relacionado: {relatedItem.title}</span>
                          <ExternalLink className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                  </div>

                  <span className="text-[11px] text-neutral-400 dark:text-neutral-500 whitespace-nowrap shrink-0">
                    {formatDateTime(notification.timestamp || (notification as any).createdAt)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
