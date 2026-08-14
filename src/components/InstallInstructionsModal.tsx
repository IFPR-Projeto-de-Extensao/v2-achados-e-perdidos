import React, { useState, useEffect } from "react";
import {
  Share2,
  PlusSquare,
  Smartphone,
  Laptop,
  CheckCircle2,
  X,
  Download,
  HelpCircle,
  Sparkles,
  ChevronRight,
  MonitorCheck,
  Chrome,
} from "lucide-react";
import { vibrateClick, vibrateSuccess } from "../lib/utils";

interface InstallInstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isIOS: boolean;
  canPromptNative?: boolean;
  onPromptNative?: () => void;
}

type PlatformTab = "ios" | "android" | "desktop";

export const InstallInstructionsModal: React.FC<InstallInstructionsModalProps> = ({
  isOpen,
  onClose,
  isIOS,
  canPromptNative,
  onPromptNative,
}) => {
  // Detect default tab
  const [selectedTab, setSelectedTab] = useState<PlatformTab>(() => {
    if (typeof window !== "undefined") {
      const ua = navigator.userAgent.toLowerCase();
      if (/iphone|ipad|ipod/.test(ua)) return "ios";
      if (/android/.test(ua)) return "android";
    }
    return isIOS ? "ios" : "android";
  });

  useEffect(() => {
    if (isIOS) {
      setSelectedTab("ios");
    }
  }, [isIOS]);

  // Handle ESC key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleTabChange = (tab: PlatformTab) => {
    vibrateClick();
    setSelectedTab(tab);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-modal-title"
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-[#1c1c1c] rounded-3xl p-6 sm:p-7 shadow-2xl border border-gray-200 dark:border-neutral-800 space-y-5 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-neutral-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-[#009647] to-[#006E33] text-white flex items-center justify-center font-black text-lg shadow-md shadow-[#00843D]/25">
              <span>IF</span>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#C8102E] rounded-full border-2 border-white dark:border-neutral-900" />
            </div>
            <div>
              <h3
                id="install-modal-title"
                className="font-extrabold text-base sm:text-lg text-neutral-900 dark:text-white flex items-center gap-1.5"
              >
                <span>Instalar Localiza+</span>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-[#00843D]/10 text-[#00843D] dark:text-green-400">
                  App PWA
                </span>
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Experiência de app nativo no IFPR Campus Ivaiporã
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              vibrateClick();
              onClose();
            }}
            aria-label="Fechar janela de instruções"
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Platform Selector Tabs */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-neutral-100 dark:bg-neutral-800/80 rounded-2xl">
          <button
            onClick={() => handleTabChange("ios")}
            className={`flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
              selectedTab === "ios"
                ? "bg-white dark:bg-neutral-900 text-[#00843D] dark:text-green-400 shadow-sm"
                : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>iOS (iPhone)</span>
          </button>

          <button
            onClick={() => handleTabChange("android")}
            className={`flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
              selectedTab === "android"
                ? "bg-white dark:bg-neutral-900 text-[#00843D] dark:text-green-400 shadow-sm"
                : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Android</span>
          </button>

          <button
            onClick={() => handleTabChange("desktop")}
            className={`flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
              selectedTab === "desktop"
                ? "bg-white dark:bg-neutral-900 text-[#00843D] dark:text-green-400 shadow-sm"
                : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>Computador</span>
          </button>
        </div>

        {/* Tab 1: iOS Instructions (Safari) */}
        {selectedTab === "ios" && (
          <div className="space-y-3 animate-in fade-in duration-200">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 rounded-2xl flex items-center space-x-2 text-xs text-emerald-800 dark:text-emerald-300">
              <Sparkles className="w-4 h-4 shrink-0 text-[#00843D]" />
              <span>Abra esta página no navegador <strong>Safari</strong> do seu iPhone ou iPad.</span>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-start space-x-3 p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-750">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 font-bold text-xs">
                  <Share2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-neutral-900 dark:text-white">
                    1. Toque em Compartilhar
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                    Na barra inferior do Safari, toque no ícone de compartilhamento (quadrado com seta apontando para cima).
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-750">
                <div className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 flex items-center justify-center shrink-0 font-bold text-xs">
                  <PlusSquare className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-neutral-900 dark:text-white">
                    2. Selecione "Adicionar à Tela de Início"
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                    Role as opções para baixo até encontrar o botão <strong>"Adicionar à Tela de Início"</strong> com o ícone de soma (+).
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-750">
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-neutral-900 dark:text-white">
                    3. Confirme em "Adicionar"
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                    Toque em <strong>Adicionar</strong> no canto superior direito. O ícone do <strong>Localiza+</strong> estará pronto na tela inicial!
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Android Instructions (Chrome / Samsung Internet) */}
        {selectedTab === "android" && (
          <div className="space-y-3 animate-in fade-in duration-200">
            {canPromptNative && onPromptNative ? (
              <div className="p-4 bg-[#00843D]/10 border border-[#00843D]/25 rounded-2xl space-y-2.5 text-center">
                <p className="text-xs font-bold text-[#00843D] dark:text-green-400">
                  Seu navegador suporta instalação com 1 clique!
                </p>
                <button
                  onClick={() => {
                    vibrateSuccess();
                    onPromptNative();
                    onClose();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white text-xs font-bold shadow-md shadow-[#00843D]/20 transition-all flex items-center justify-center space-x-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Instalar Diretamente Agora</span>
                </button>
              </div>
            ) : null}

            <div className="space-y-2.5">
              <div className="flex items-start space-x-3 p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-750">
                <div className="w-8 h-8 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 font-bold text-xs">
                  <Chrome className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-neutral-900 dark:text-white">
                    1. Toque no Menu do Navegador (⋮)
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                    No canto superior direito do Google Chrome ou Samsung Internet, toque no menu de três pontos verticais.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-750">
                <div className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 flex items-center justify-center shrink-0 font-bold text-xs">
                  <Download className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-neutral-900 dark:text-white">
                    2. Toque em "Instalar aplicativo"
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                    Localize a opção <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong>.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-750">
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 font-bold text-xs">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-neutral-900 dark:text-white">
                    3. Confirme a Instalação
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                    Toque em <strong>Instalar</strong> no aviso que surgir. O aplicativo será adicionado à sua gaveta de apps e tela inicial.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Desktop Instructions (Chrome / Edge / Windows / Mac) */}
        {selectedTab === "desktop" && (
          <div className="space-y-3 animate-in fade-in duration-200">
            {canPromptNative && onPromptNative ? (
              <div className="p-4 bg-[#00843D]/10 border border-[#00843D]/25 rounded-2xl space-y-2.5 text-center">
                <p className="text-xs font-bold text-[#00843D] dark:text-green-400">
                  Instale como aplicativo nativo no seu computador
                </p>
                <button
                  onClick={() => {
                    vibrateSuccess();
                    onPromptNative();
                    onClose();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white text-xs font-bold shadow-md shadow-[#00843D]/20 transition-all flex items-center justify-center space-x-2"
                >
                  <MonitorCheck className="w-4 h-4" />
                  <span>Instalar no Computador</span>
                </button>
              </div>
            ) : null}

            <div className="space-y-2.5">
              <div className="flex items-start space-x-3 p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-750">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 font-bold text-xs">
                  <Download className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-neutral-900 dark:text-white">
                    1. Ícone na Barra de Endereços (URL)
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                    No Chrome ou Edge, clique no ícone de instalação (computador com seta) no lado direito da barra de navegação.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-750">
                <div className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 flex items-center justify-center shrink-0 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-neutral-900 dark:text-white">
                    2. Clique em "Instalar"
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                    Confirme o diálogo para abrir o Localiza+ em sua própria janela independente, com suporte a atalhos e inicialização rápida.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Benefits list footer */}
        <div className="pt-2 border-t border-gray-100 dark:border-neutral-800 flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
          <div className="flex items-center space-x-1 text-[#00843D] dark:text-green-400 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Acesso Rápido</span>
          </div>
          <div className="flex items-center space-x-1 text-[#00843D] dark:text-green-400 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Tela Cheia</span>
          </div>
          <div className="flex items-center space-x-1 text-[#00843D] dark:text-green-400 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>100% Gratuito</span>
          </div>
        </div>

        {/* Close action button */}
        <button
          onClick={() => {
            vibrateClick();
            onClose();
          }}
          className="w-full py-2.5 rounded-2xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 font-bold text-xs transition-colors"
        >
          Fechar
        </button>
      </div>
    </div>
  );
};
