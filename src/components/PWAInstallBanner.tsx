import React from "react";
import { Download, RefreshCw, X, HelpCircle, Smartphone, CheckCircle } from "lucide-react";
import { usePWA } from "../hooks/usePWA";
import { InstallInstructionsModal } from "./InstallInstructionsModal";
import { vibrateClick } from "../lib/utils";

export const PWAInstallBanner: React.FC = () => {
  const {
    isInstallable,
    isInstalled,
    isIOS,
    isAndroid,
    canPromptNative,
    showInstructionsModal,
    setShowInstructionsModal,
    isUpdateAvailable,
    installToHomescreen,
    promptInstall,
    dismissInstallPrompt,
    applyUpdate,
  } = usePWA();

  return (
    <>
      {/* 1. New Version Available Notification Bar (Top floating pill) */}
      {isUpdateAvailable && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md bg-neutral-900/95 dark:bg-neutral-800/95 backdrop-blur-md text-white px-4 py-3 rounded-2xl shadow-2xl border border-emerald-500/40 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4 duration-300"
        >
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#00843D] text-white flex items-center justify-center shrink-0 animate-spin">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">
                Nova versão do Localiza+
              </p>
              <p className="text-[11px] text-neutral-400">
                Toque para atualizar agora
              </p>
            </div>
          </div>
          <button
            onClick={applyUpdate}
            className="px-3.5 py-1.5 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white text-xs font-bold shrink-0 transition-all shadow-md active:scale-95"
          >
            Atualizar
          </button>
        </div>
      )}

      {/* 2. Discrete Install Banner with Dedicated 'Install to Homescreen' Trigger Button */}
      {isInstallable && !isInstalled && (
        <div
          role="region"
          aria-label="Instalação do Aplicativo Localiza+"
          className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-40 max-w-md w-[calc(100%-2rem)] sm:w-auto bg-white/95 dark:bg-[#1e1e1e]/95 backdrop-blur-md border border-gray-200 dark:border-neutral-700/80 rounded-2xl shadow-xl p-3.5 flex items-center justify-between gap-3 transition-all duration-300 animate-in fade-in slide-in-from-bottom-2"
        >
          <div
            className="flex items-center space-x-3 min-w-0 cursor-pointer select-none"
            onClick={() => {
              vibrateClick();
              setShowInstructionsModal(true);
            }}
          >
            {/* App Icon preview */}
            <div className="relative w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center shrink-0">
              <img
                src="/ifpr-logo.svg"
                alt="Localiza+ IFPR"
                className="w-full h-full object-contain select-none"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-extrabold text-neutral-900 dark:text-white">
                  Instalar Localiza+
                </span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-[#00843D]/10 text-[#00843D] dark:text-green-400">
                  PWA Nativo
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                {isAndroid
                  ? "Instale direto na tela inicial do Android"
                  : isIOS
                  ? "Adicionar à tela de início do iOS"
                  : "Acesso rápido e funcionamento offline"}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            {/* Dedicated Android / Chromium 'Install to Homescreen' Trigger Button */}
            {canPromptNative ? (
              <button
                onClick={installToHomescreen}
                title="Instalar na Tela Inicial via prompt nativo do Android"
                className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white text-xs font-bold shadow-md shadow-[#00843D]/20 active:scale-95 transition-all"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Adicionar à</span>
                <span>Tela Inicial</span>
              </button>
            ) : (
              <button
                onClick={() => promptInstall(true)}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white text-xs font-bold shadow-md shadow-[#00843D]/20 active:scale-95 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Instalar</span>
              </button>
            )}

            <button
              onClick={() => {
                vibrateClick();
                setShowInstructionsModal(true);
              }}
              title="Instruções de instalação"
              aria-label="Ver instruções detalhadas de instalação"
              className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
            <button
              onClick={dismissInstallPrompt}
              aria-label="Dispensar aviso de instalação nesta sessão"
              title="Dispensar nesta sessão"
              className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 3. Platform-Specific Guided Installation Modal (iOS, Android, Desktop) */}
      <InstallInstructionsModal
        isOpen={showInstructionsModal}
        onClose={() => setShowInstructionsModal(false)}
        isIOS={isIOS}
        canPromptNative={canPromptNative}
        onPromptNative={installToHomescreen}
      />
    </>
  );
};
