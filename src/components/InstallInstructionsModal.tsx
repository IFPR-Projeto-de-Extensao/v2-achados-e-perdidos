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
import { useApp } from "../context/AppContext";
import { localize } from "../lib/i18n";

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
  const { language } = useApp();
  const l = (pt: string, en: string) => localize(language, pt, en);

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
      className="fixed inset-0 z-50 bg-black/65 dark:bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto overscroll-contain animate-in fade-in duration-200 transition-all"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg my-auto max-h-[90dvh] overflow-y-auto overscroll-contain bg-white dark:bg-[#1c1c1c] rounded-3xl p-5 sm:p-7 shadow-2xl border border-gray-200 dark:border-neutral-800 space-y-5 animate-in zoom-in-95 duration-200 transition-colors"
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
                <span>{l("Instalar Localiza+", "Install Localiza+")}</span>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-[#00843D]/10 text-[#00843D] dark:text-green-400">
                  {l("Aplicativo PWA", "PWA App")}
                </span>
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {l(
                  "Experiência de aplicativo nativo no IFPR Campus Ivaiporã",
                  "Native app experience at IFPR Ivaiporã Campus"
                )}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              vibrateClick();
              onClose();
            }}
            aria-label={l("Fechar janela de instruções", "Close instructions window")}
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
            <span>{l("Computador", "Desktop")}</span>
          </button>
        </div>

        {/* Tab 1: iOS Instructions (Safari) */}
        {selectedTab === "ios" && (
          <div className="space-y-3 animate-in fade-in duration-200">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 rounded-2xl flex items-center space-x-2 text-xs text-emerald-800 dark:text-emerald-300">
              <Sparkles className="w-4 h-4 shrink-0 text-[#00843D]" />
              <span>
                {language === "en" ? (
                  <>Open this page in the <strong>Safari</strong> browser on your iPhone or iPad.</>
                ) : (
                  <>Abra esta página no navegador <strong>Safari</strong> do seu iPhone ou iPad.</>
                )}
              </span>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-start space-x-3 p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-750">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 font-bold text-xs">
                  <Share2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-neutral-900 dark:text-white">
                    {l("1. Toque em Compartilhar", "1. Tap Share")}
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                    {l(
                      "Na barra inferior do Safari, toque no ícone de compartilhamento (quadrado com seta apontando para cima).",
                      "In Safari's bottom bar, tap the Share icon (square with an upward arrow)."
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-750">
                <div className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 flex items-center justify-center shrink-0 font-bold text-xs">
                  <PlusSquare className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-neutral-900 dark:text-white">
                    {l('2. Selecione "Adicionar à Tela de Início"', '2. Select "Add to Home Screen"')}
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                    {language === "en" ? (
                      <>Scroll down the options until you find <strong>"Add to Home Screen"</strong> with the plus (+) icon.</>
                    ) : (
                      <>Role as opções para baixo até encontrar o botão <strong>"Adicionar à Tela de Início"</strong> com o ícone de soma (+).</>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-750">
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-neutral-900 dark:text-white">
                    {l('3. Confirme em "Adicionar"', '3. Confirm with "Add"')}
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                    {language === "en" ? (
                      <>Tap <strong>Add</strong> in the top-right corner. The <strong>Localiza+</strong> icon will be ready on your home screen!</>
                    ) : (
                      <>Toque em <strong>Adicionar</strong> no canto superior direito. O ícone do <strong>Localiza+</strong> estará pronto na tela inicial!</>
                    )}
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
                  {l("Seu navegador suporta instalação com 1 clique!", "Your browser supports 1-click installation!")}
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
                  <span>{l("Instalar Diretamente Agora", "Install Directly Now")}</span>
                </button>
              </div>
            ) : null}

            {/* Google Chrome & Samsung Internet */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-black text-neutral-800 dark:text-neutral-200 px-1">
                <span>Google Chrome & Samsung Internet</span>
                <span className="text-[10px] text-neutral-400 font-normal">
                  {l("Navegadores Chromium", "Chromium Browsers")}
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex items-start space-x-3 p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-750">
                  <div className="w-7 h-7 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 font-bold text-xs">
                    <Chrome className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-neutral-900 dark:text-white">
                      {l("1. Toque no Menu do Navegador (⋮)", "1. Tap the Browser Menu (⋮)")}
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                      {l(
                        "No canto superior direito do Google Chrome ou Samsung Internet, toque no menu de três pontos verticais.",
                        "In the top-right corner of Google Chrome or Samsung Internet, tap the three vertical dots menu."
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-750">
                  <div className="w-7 h-7 rounded-lg bg-[#00843D]/10 text-[#00843D] dark:text-green-400 flex items-center justify-center shrink-0 font-bold text-xs">
                    <Download className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-neutral-900 dark:text-white">
                      {l(
                        '2. Toque em "Instalar aplicativo" ou "Adicionar à tela inicial"',
                        '2. Tap "Install app" or "Add to Home screen"'
                      )}
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                      {l(
                        "Confirme no diálogo para adicionar o ícone à sua tela inicial com abertura instantânea.",
                        "Confirm in the dialog to add the icon to your home screen for instant launch."
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Mozilla Firefox para Android */}
            <div className="space-y-2 pt-2 border-t border-neutral-200/60 dark:border-neutral-800">
              <div className="flex items-center justify-between text-xs font-black text-neutral-800 dark:text-neutral-200 px-1">
                <span>{l("Mozilla Firefox para Android", "Mozilla Firefox for Android")}</span>
                <span className="text-[10px] text-orange-500 font-bold">Firefox Gecko</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-start space-x-3 p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-750">
                  <div className="w-7 h-7 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 font-bold text-xs">
                    <span>⋮</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-neutral-900 dark:text-white">
                      {l("1. Toque no Menu de Três Pontos (⋮)", "1. Tap the Three-Dot Menu (⋮)")}
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                      {l(
                        "No Firefox para Android, toque no menu de três pontos (localizado na barra de endereço inferior ou superior).",
                        "In Firefox for Android, tap the three-dot menu (located on the bottom or top address bar)."
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-750">
                  <div className="w-7 h-7 rounded-lg bg-[#00843D]/10 text-[#00843D] dark:text-green-400 flex items-center justify-center shrink-0 font-bold text-xs">
                    <Smartphone className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-neutral-900 dark:text-white">
                      {l(
                        '2. Selecione "Instalar" ou "Adicionar à tela principal"',
                        '2. Select "Install" or "Add to Home screen"'
                      )}
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                      {l(
                        "Toque na opção e confirme para fixar o Localiza+ na sua tela inicial, com suporte completo a modo offline.",
                        "Tap the option and confirm to pin Localiza+ to your home screen with full offline cache support."
                      )}
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
                  {l("Instale como aplicativo nativo no seu computador", "Install as a native app on your computer")}
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
                  <span>{l("Instalar no Computador", "Install on Desktop")}</span>
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
                      {l("1. Ícone na Barra de Endereços (URL)", "1. Icon in the Address Bar (URL)")}
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                      {language === "en" ? (
                        <>Click the install icon (computer with downward arrow) on the right side of the address bar, or open the menu (⋮) and select <strong>"Install Localiza+"</strong>.</>
                      ) : (
                        <>Clique no ícone de instalação (computador com seta para baixo) no lado direito da barra de endereços, ou abra o menu (⋮) e selecione <strong>"Instalar Localiza+"</strong>.</>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-750">
                  <div className="w-7 h-7 rounded-lg bg-[#00843D]/10 text-[#00843D] dark:text-green-400 flex items-center justify-center shrink-0 font-bold text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-neutral-900 dark:text-white">
                      {l("2. Integração no Sistema Operacional", "2. Operating System Integration")}
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                      {language === "en" ? (
                        <>On <strong>Linux</strong>, the browser creates a <code>.desktop</code> launcher in your applications menu (compatible with GNOME, KDE Plasma, XFCE, and XDG standards). On <strong>Windows</strong>, it creates Start Menu and Taskbar shortcuts.</>
                      ) : (
                        <>No <strong>Linux</strong>, o navegador gera um lançador <code>.desktop</code> no menu de aplicativos (compatível com GNOME, KDE Plasma, XFCE e padrões XDG). No <strong>Windows</strong>, cria atalhos no Menu Iniciar e Barra de Tarefas.</>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Mozilla Firefox Desktop (Windows & Linux) */}
            <div className="space-y-2 pt-2 border-t border-neutral-200/60 dark:border-neutral-800">
              <div className="flex items-center justify-between text-xs font-black text-neutral-800 dark:text-neutral-200 px-1">
                <span>{l("Mozilla Firefox no Computador", "Mozilla Firefox on Desktop")}</span>
                <span className="text-[10px] text-orange-500 font-bold">Windows & Linux</span>
              </div>
              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 rounded-2xl text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                {language === "en" ? (
                  <><strong>Technical note:</strong> Firefox Desktop does not natively support installing PWAs in a standalone window (SSB was discontinued by Mozilla). All Localiza+ offline caching and functionality work seamlessly in this tab.</>
                ) : (
                  <><strong>Nota técnica:</strong> O Firefox no computador não possui suporte nativo à instalação de PWAs em janela separada (recurso SSB descontinuado pela Mozilla). Todo o armazenamento e funcionamento offline do Localiza+ funcionam perfeitamente nesta aba.</>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-start space-x-3 p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-750">
                  <div className="w-7 h-7 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 font-bold text-xs">
                    <span>📌</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-neutral-900 dark:text-white">
                      {l("Opção Recomendada: Fixar Aba no Firefox", "Recommended Option: Pin Tab in Firefox")}
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                      {language === "en" ? (
                        <>Right-click the <strong>Localiza+</strong> tab at the top and select <strong>"Pin Tab"</strong>. The tab will stay compact, always open, and instantly accessible.</>
                      ) : (
                        <>Clique com o botão direito na aba do <strong>Localiza+</strong> no topo e selecione <strong>"Fixar aba"</strong>. A aba ficará compacta, sempre aberta e com acesso instantâneo.</>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/70 dark:border-neutral-750">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 font-bold text-xs">
                    <span>🔗</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-neutral-900 dark:text-white">
                      {l("Criar Atalho na Área de Trabalho", "Create Desktop Shortcut")}
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                      {l(
                        "Arraste o ícone de cadeado na barra de endereços do Firefox para a sua Área de Trabalho para criar um atalho direto.",
                        "Drag the padlock icon from Firefox's address bar onto your Desktop to create a direct shortcut."
                      )}
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
            <span>{l("Acesso Rápido", "Quick Access")}</span>
          </div>
          <div className="flex items-center space-x-1 text-[#00843D] dark:text-green-400 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{l("Tela Cheia", "Full Screen")}</span>
          </div>
          <div className="flex items-center space-x-1 text-[#00843D] dark:text-green-400 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{l("100% Gratuito", "100% Free")}</span>
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
          {l("Fechar", "Close")}
        </button>
      </div>
    </div>
  );
};
