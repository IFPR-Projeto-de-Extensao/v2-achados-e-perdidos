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
  isFirefox?: boolean;
  isFirefoxDesktop?: boolean;
  isFirefoxAndroid?: boolean;
  isLinux?: boolean;
  canPromptNative?: boolean;
  onPromptNative?: () => void;
}

type PlatformTab = "ios" | "android" | "desktop";

export const InstallInstructionsModal: React.FC<InstallInstructionsModalProps> = ({
  isOpen,
  onClose,
  isIOS,
  isFirefox,
  isFirefoxDesktop,
  isFirefoxAndroid,
  isLinux,
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
    return isIOS ? "ios" : "desktop";
  });

  useEffect(() => {
    if (isIOS) {
      setSelectedTab("ios");
    } else if (isFirefoxAndroid) {
      setSelectedTab("android");
    } else if (isFirefoxDesktop || isLinux) {
      setSelectedTab("desktop");
    }
  }, [isIOS, isFirefoxAndroid, isFirefoxDesktop, isLinux]);

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
      className="fixed inset-0 z-50 bg-black/65 dark:bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200 transition-all"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-[#1c1c1c] rounded-3xl p-6 sm:p-7 shadow-2xl border border-gray-200 dark:border-neutral-800 space-y-5 animate-in zoom-in-95 duration-200 transition-colors"
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

        {/* Tab 2: Android Instructions (Chrome / Samsung Internet / Firefox Android) */}
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

            {/* Google Chrome & Samsung Internet */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-black text-neutral-800 dark:text-neutral-200 px-1">
                <span>Google Chrome & Samsung Internet</span>
                <span className="text-[10px] text-neutral-400 font-normal">Navegadores Chromium</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-start space-x-3 p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-750">
                  <div className="w-7 h-7 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 font-bold text-xs">
                    <Chrome className="w-3.5 h-3.5" />
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

                <div className="flex items-start space-x-3 p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-750">
                  <div className="w-7 h-7 rounded-lg bg-[#00843D]/10 text-[#00843D] dark:text-green-400 flex items-center justify-center shrink-0 font-bold text-xs">
                    <Download className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-neutral-900 dark:text-white">
                      2. Toque em "Instalar aplicativo" ou "Adicionar à tela inicial"
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                      Confirme no diálogo para adicionar o ícone à sua tela inicial com abertura instantânea.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Mozilla Firefox para Android */}
            <div className="space-y-2 pt-2 border-t border-neutral-200/60 dark:border-neutral-800">
              <div className="flex items-center justify-between text-xs font-black text-neutral-800 dark:text-neutral-200 px-1">
                <span>Mozilla Firefox para Android</span>
                <span className="text-[10px] text-orange-500 font-bold">Firefox Gecko</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-start space-x-3 p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-750">
                  <div className="w-7 h-7 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 font-bold text-xs">
                    <span>⋮</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-neutral-900 dark:text-white">
                      1. Toque no Menu de Três Pontos (⋮)
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                      No Firefox para Android, toque no menu de três pontos (localizado na barra de endereço inferior ou superior).
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-750">
                  <div className="w-7 h-7 rounded-lg bg-[#00843D]/10 text-[#00843D] dark:text-green-400 flex items-center justify-center shrink-0 font-bold text-xs">
                    <Smartphone className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-neutral-900 dark:text-white">
                      2. Selecione "Instalar" ou "Adicionar à tela principal"
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                      Toque na opção e confirme para fixar o Localiza+ na sua tela inicial, com suporte completo a cache offline.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Desktop Instructions (Chrome / Edge / Linux / Firefox Desktop) */}
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

            {/* Chromium / Chrome / Brave / Edge on Windows and Linux */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-black text-neutral-800 dark:text-neutral-200 px-1 pt-1">
                <span>Google Chrome, Brave & Microsoft Edge</span>
                <span className="text-[10px] text-blue-500 font-bold">Windows & Linux</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-start space-x-3 p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-750">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 font-bold text-xs">
                    <Download className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-neutral-900 dark:text-white">
                      1. Ícone na Barra de Endereços (URL)
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                      Clique no ícone de instalação (computador com seta para baixo) no lado direito da barra de endereços, ou abra o menu (⋮) e selecione <strong>"Instalar Localiza+"</strong>.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-750">
                  <div className="w-7 h-7 rounded-lg bg-[#00843D]/10 text-[#00843D] dark:text-green-400 flex items-center justify-center shrink-0 font-bold text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-neutral-900 dark:text-white">
                      2. Integração no Sistema Operacional
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                      No <strong>Linux</strong>, o navegador gera um lançador <code>.desktop</code> no menu de aplicativos (compatível com GNOME, KDE Plasma, XFCE e padrões XDG). No <strong>Windows</strong>, cria atalhos no Menu Iniciar e Barra de Tarefas.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Mozilla Firefox Desktop (Windows & Linux) */}
            <div className="space-y-2 pt-2 border-t border-neutral-200/60 dark:border-neutral-800">
              <div className="flex items-center justify-between text-xs font-black text-neutral-800 dark:text-neutral-200 px-1">
                <span>Mozilla Firefox no Computador</span>
                <span className="text-[10px] text-orange-500 font-bold">Windows & Linux</span>
              </div>
              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 rounded-2xl text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                <strong>Nota técnica:</strong> O Firefox Desktop não possui suporte nativo à instalação de PWAs em janela separada (recurso SSB descontinuado pela Mozilla). Todo o cache e funcionamento offline do Localiza+ funcionam perfeitamente nesta aba.
              </div>
              <div className="space-y-2">
                <div className="flex items-start space-x-3 p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-750">
                  <div className="w-7 h-7 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 font-bold text-xs">
                    <span>📌</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-neutral-900 dark:text-white">
                      Opção Recomendada: Fixar Aba no Firefox
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                      Clique com o botão direito na aba do <strong>Localiza+</strong> no topo e selecione <strong>"Fixar aba"</strong>. A aba ficará compacta, sempre aberta e com acesso instantâneo.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-750">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 font-bold text-xs">
                    <span>🔗</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-neutral-900 dark:text-white">
                      Criar Atalho na Área de Trabalho
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                      Arraste o ícone de cadeado na barra de endereços do Firefox para a sua Área de Trabalho (Desktop) para criar um atalho direto.
                    </p>
                  </div>
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
