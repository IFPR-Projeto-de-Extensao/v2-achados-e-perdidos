import React, { useState } from "react";
import {
  CloudUpload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
  RefreshCw,
  HardDrive,
  Check,
  Smartphone,
  WifiOff,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { UploadTaskStatus } from "../types";
import { vibrateClick, vibrateSuccess } from "../lib/utils";

export const UploadStatusIndicator: React.FC = () => {
  const {
    activeUploadTasks,
    removeUploadTask,
    retryUploadTask,
    pendingSyncCount,
    isOnline,
    triggerManualSync,
  } = useApp();

  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  // If no tasks and no pending offline syncs, do not render
  if ((!activeUploadTasks || activeUploadTasks.length === 0) && pendingSyncCount === 0) {
    return null;
  }

  const inProgressCount = (activeUploadTasks || []).filter(
    (t) => t.status !== "COMPLETED" && t.status !== "ERROR"
  ).length;

  const errorCount = (activeUploadTasks || []).filter((t) => t.status === "ERROR").length;
  const completedCount = (activeUploadTasks || []).filter((t) => t.status === "COMPLETED").length;

  const latestTask: UploadTaskStatus | undefined =
    activeUploadTasks && activeUploadTasks.length > 0
      ? activeUploadTasks[activeUploadTasks.length - 1]
      : undefined;

  const getStatusBadge = (status: UploadTaskStatus["status"]) => {
    switch (status) {
      case "COMPRESSING":
        return (
          <span className="inline-flex items-center space-x-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Comprimindo</span>
          </span>
        );
      case "SAVING_LOCAL":
        return (
          <span className="inline-flex items-center space-x-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-md">
            <HardDrive className="w-3 h-3" />
            <span>IndexedDB</span>
          </span>
        );
      case "QUEUED_SYNC":
        return (
          <span className="inline-flex items-center space-x-1 text-[11px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded-md">
            <Smartphone className="w-3 h-3" />
            <span>Segundo Plano</span>
          </span>
        );
      case "UPLOADING":
        return (
          <span className="inline-flex items-center space-x-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md">
            <CloudUpload className="w-3 h-3 animate-pulse" />
            <span>Enviando</span>
          </span>
        );
      case "COMPLETED":
        return (
          <span className="inline-flex items-center space-x-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md">
            <Check className="w-3 h-3" />
            <span>Concluído</span>
          </span>
        );
      case "ERROR":
        return (
          <span className="inline-flex items-center space-x-1 text-[11px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-md">
            <AlertCircle className="w-3 h-3" />
            <span>Erro</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <aside
      id="pwa-upload-status-indicator"
      aria-label="Status de upload em segundo plano"
      className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 max-w-sm w-[calc(100vw-2rem)] sm:w-96 transition-all duration-300"
    >
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl overflow-hidden backdrop-blur-md">
        {/* Header Bar */}
        <div
          id="upload-status-header"
          className="px-4 py-3 bg-neutral-50 dark:bg-neutral-800/80 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between cursor-pointer select-none"
          onClick={() => {
            vibrateClick();
            setIsExpanded(!isExpanded);
          }}
        >
          <div className="flex items-center space-x-2.5">
            <div className="relative">
              <div className="w-8 h-8 rounded-xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                {inProgressCount > 0 ? (
                  <CloudUpload className="w-4 h-4 animate-bounce" />
                ) : errorCount > 0 ? (
                  <AlertCircle className="w-4 h-4 text-red-500" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                )}
              </div>
              {inProgressCount > 0 && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full animate-ping" />
              )}
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                  Status de Upload
                </span>
                {inProgressCount > 0 && (
                  <span className="text-[10px] bg-emerald-500 text-white font-black px-1.5 py-0.2 rounded-full">
                    {inProgressCount}
                  </span>
                )}
                {!isOnline && (
                  <span className="text-[10px] bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold px-1.5 py-0.2 rounded-md flex items-center space-x-0.5">
                    <WifiOff className="w-2.5 h-2.5" />
                    <span>Offline</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate max-w-[180px] sm:max-w-[220px]">
                {latestTask?.statusMessage ||
                  (pendingSyncCount > 0
                    ? `${pendingSyncCount} item(ns) na fila offline`
                    : "Todos os envios foram sincronizados")}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1">
            <button
              type="button"
              id="btn-toggle-upload-details"
              aria-label={isExpanded ? "Recolher detalhes" : "Expandir detalhes"}
              className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
            {completedCount > 0 && inProgressCount === 0 && (
              <button
                type="button"
                id="btn-dismiss-upload-status"
                aria-label="Fechar painel de status"
                onClick={(e) => {
                  e.stopPropagation();
                  vibrateClick();
                  (activeUploadTasks || []).forEach((t) => {
                    if (t.status === "COMPLETED") removeUploadTask(t.id);
                  });
                }}
                className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Active Progress Bar if there is an in-progress task */}
        {latestTask && latestTask.status !== "COMPLETED" && latestTask.status !== "ERROR" && (
          <div className="w-full bg-neutral-100 dark:bg-neutral-800 h-1 overflow-hidden">
            <div
              className="bg-emerald-500 h-full transition-all duration-300 ease-out"
              style={{ width: `${Math.max(8, latestTask.progress)}%` }}
            />
          </div>
        )}

        {/* Background Sync Notice */}
        <div className="px-4 py-2 bg-emerald-50/60 dark:bg-emerald-950/30 border-b border-emerald-100/50 dark:border-emerald-900/30 flex items-start space-x-2">
          <Smartphone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-tight text-emerald-800 dark:text-emerald-300">
            <strong>Background Sync:</strong> Você pode fechar o aplicativo com segurança. Suas fotos e itens serão sincronizados em segundo plano.
          </p>
        </div>

        {/* Expanded Task List Details */}
        {isExpanded && (
          <div id="upload-status-expanded-list" className="p-3 max-h-60 overflow-y-auto space-y-2 divide-y divide-neutral-100 dark:divide-neutral-800">
            {activeUploadTasks && activeUploadTasks.length > 0 ? (
              activeUploadTasks.map((task) => (
                <div key={task.id} className="pt-2 first:pt-0">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-2">
                      {task.thumbnailUrl && (
                        <img
                          src={task.thumbnailUrl}
                          alt=""
                          className="w-9 h-9 rounded-lg object-cover border border-neutral-200 dark:border-neutral-700 shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-1.5">
                          <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 truncate">
                            {task.itemTitle || "Objeto sem título"}
                          </h4>
                          {getStatusBadge(task.status)}
                        </div>

                        <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                          {task.statusMessage}
                        </p>

                        {task.savingsPercentage !== undefined && task.savingsPercentage > 0 && (
                          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                            Economia de dados: {task.savingsPercentage}%
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0 ml-2">
                      {task.status === "ERROR" && (
                        <button
                          type="button"
                          onClick={() => {
                            vibrateClick();
                            retryUploadTask(task.id);
                          }}
                          title="Tentar novamente"
                          className="p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 rounded hover:bg-blue-50 dark:hover:bg-blue-950/40"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {(task.status === "COMPLETED" || task.status === "ERROR") && (
                        <button
                          type="button"
                          onClick={() => {
                            vibrateClick();
                            removeUploadTask(task.id);
                          }}
                          title="Remover da lista"
                          className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {task.status !== "COMPLETED" && task.status !== "ERROR" && (
                    <div className="w-full bg-neutral-100 dark:bg-neutral-800 h-1.5 rounded-full overflow-hidden mt-2">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-200"
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-3 text-xs text-neutral-500 dark:text-neutral-400">
                Nenhum upload ativo no momento.
              </div>
            )}

            {/* Offline Sync Controls */}
            {pendingSyncCount > 0 && (
              <div className="pt-2 flex items-center justify-between bg-neutral-50 dark:bg-neutral-800/50 p-2 rounded-xl mt-2">
                <div className="flex items-center space-x-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-neutral-500" />
                  <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                    Fila offline: {pendingSyncCount} {pendingSyncCount === 1 ? "item" : "itens"}
                  </span>
                </div>
                {isOnline && (
                  <button
                    type="button"
                    onClick={() => {
                      vibrateClick();
                      triggerManualSync();
                    }}
                    className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center space-x-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Sincronizar Agora</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
