import React from "react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../context/RouterContext";
import { ThemeToggle } from "./ThemeToggle";
import {
  Settings,
  Moon,
  Sun,
  Eye,
  Languages,
  Bell,
  Smartphone,
  Wifi,
  WifiOff,
  Database,
  RefreshCw,
  Keyboard,
  Shield,
  HelpCircle,
  LogOut,
  Sparkles,
  Info,
} from "lucide-react";
import { vibrateClick, vibrateSuccess } from "../lib/utils";

export const SettingsView: React.FC = () => {
  const {
    darkMode,
    toggleDarkMode,
    highContrastMode,
    toggleHighContrastMode,
    language,
    setLanguage,
    fcmPermissionGranted,
    requestNotificationPermission,
    fcmSubscribed,
    subscribeToFCM,
    testFCMAlert,
    isOnline,
    pendingSyncCount,
    syncOfflineQueue,
    indexedDbLoaded,
    items,
    currentUser,
    logout,
    t,
  } = useApp();
  const { navigate } = useRouter();

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="bg-white dark:bg-[#1E1E1E] p-6 sm:p-8 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-xs">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 text-[#00843D] dark:text-green-400 text-xs font-black uppercase tracking-wider mb-2">
          <Settings className="w-3.5 h-3.5" />
          <span>Preferências & Sistema</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white tracking-tight">
          Configurações do Localiza+
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          Personalize a aparência, notificações, sincronização offline e idioma do aplicativo.
        </p>
      </div>

      {/* Grid of Settings Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. Appearance & Theme */}
        <div className="bg-white dark:bg-[#1E1E1E] p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-5">
          <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Sun className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                Aparência Visual
              </h3>
              <p className="text-xs text-neutral-500">
                Tema de cores e contraste para leitura confortável
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Dark / Light Mode Switch */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700">
              <div className="flex items-center space-x-3">
                {darkMode ? (
                  <Moon className="w-5 h-5 text-amber-400" />
                ) : (
                  <Sun className="w-5 h-5 text-amber-500" />
                )}
                <div>
                  <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                    Modo Escuro / Claro
                  </h4>
                  <p className="text-[11px] text-neutral-500">
                    {darkMode ? "Modo escuro ativo (ideal para noite)" : "Modo claro ativo"}
                  </p>
                </div>
              </div>
              <ThemeToggle />
            </div>

            {/* High Contrast Mode */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700">
              <div className="flex items-center space-x-3">
                <Eye className="w-5 h-5 text-emerald-500" />
                <div>
                  <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                    Alto Contraste (Acessibilidade)
                  </h4>
                  <p className="text-[11px] text-neutral-500">
                    Bordas destacadas e texto com contraste WCAG AAA
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  vibrateClick();
                  toggleHighContrastMode();
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  highContrastMode ? "bg-[#00843D]" : "bg-neutral-300 dark:bg-neutral-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    highContrastMode ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* 2. Language & Localization */}
        <div className="bg-white dark:bg-[#1E1E1E] p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-5">
          <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Languages className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                Idioma & Localização
              </h3>
              <p className="text-xs text-neutral-500">
                Selecione o idioma de exibição do sistema
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                vibrateClick();
                setLanguage("pt");
              }}
              className={`p-4 rounded-2xl border text-left transition-all ${
                language === "pt"
                  ? "bg-emerald-500/10 border-[#00843D] text-[#00843D] dark:text-green-400 font-bold shadow-xs"
                  : "bg-neutral-50 dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:border-neutral-400"
              }`}
            >
              <span className="text-xl mb-1 block">🇧🇷</span>
              <p className="text-xs font-bold">Português (Brasil)</p>
              <p className="text-[10px] text-neutral-500">Padrão IFPR</p>
            </button>

            <button
              onClick={() => {
                vibrateClick();
                setLanguage("en");
              }}
              className={`p-4 rounded-2xl border text-left transition-all ${
                language === "en"
                  ? "bg-emerald-500/10 border-[#00843D] text-[#00843D] dark:text-green-400 font-bold shadow-xs"
                  : "bg-neutral-50 dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:border-neutral-400"
              }`}
            >
              <span className="text-xl mb-1 block">🇺🇸</span>
              <p className="text-xs font-bold">English (US)</p>
              <p className="text-[10px] text-neutral-500">International</p>
            </button>
          </div>
        </div>

        {/* 3. Notifications & FCM Alerts */}
        <div className="bg-white dark:bg-[#1E1E1E] p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-5">
          <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
            <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                Notificações Push FCM
              </h3>
              <p className="text-xs text-neutral-500">
                Alertas em tempo real sobre correspondências e devoluções
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                  Permissão Push no Navegador
                </h4>
                <p className="text-[11px] text-neutral-500">
                  {fcmPermissionGranted ? "Permitido e ativo" : "Ainda não concedido"}
                </p>
              </div>

              {!fcmPermissionGranted ? (
                <button
                  onClick={() => {
                    vibrateClick();
                    requestNotificationPermission();
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-[#00843D] text-white text-xs font-bold hover:bg-[#006e33]"
                >
                  Conceder
                </button>
              ) : (
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-[#00843D] dark:text-green-400 text-[11px] font-bold">
                  Ativo
                </span>
              )}
            </div>

            <button
              onClick={() => {
                vibrateClick();
                testFCMAlert();
              }}
              className="w-full py-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs font-bold transition-colors"
            >
              Testar Notificação de Demonstração
            </button>
          </div>
        </div>

        {/* 4. Offline Storage & IndexedDB */}
        <div className="bg-white dark:bg-[#1E1E1E] p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-5">
          <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
            <div className="w-9 h-9 rounded-xl bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                Armazenamento Offline
              </h3>
              <p className="text-xs text-neutral-500">
                Cache local no IndexedDB para uso sem internet
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-500">Status da Conexão:</span>
                <span className="font-bold flex items-center space-x-1">
                  {isOnline ? (
                    <>
                      <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-green-400">Online</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-amber-600 dark:text-amber-400">Modo Offline</span>
                    </>
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-500">Itens em Cache Local:</span>
                <span className="font-bold text-neutral-900 dark:text-white">
                  {items.length} objetos
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-500">Fila de Sincronização:</span>
                <span className="font-bold text-neutral-900 dark:text-white">
                  {pendingSyncCount} pendentes
                </span>
              </div>
            </div>

            {pendingSyncCount > 0 && (
              <button
                onClick={() => {
                  vibrateClick();
                  syncOfflineQueue();
                }}
                className="w-full py-2.5 rounded-xl bg-[#00843D] text-white text-xs font-bold hover:bg-[#006e33] flex items-center justify-center space-x-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Sincronizar Fila Agora</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Quick Links Section (Support, Privacy, Terms) */}
      <div className="bg-white dark:bg-[#1E1E1E] p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
          Links Úteis & Suporte
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => {
              vibrateClick();
              navigate("/suporte");
            }}
            className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-left text-xs font-bold text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 flex items-center justify-between transition-colors"
          >
            <span>Central de Suporte</span>
            <HelpCircle className="w-4 h-4 text-[#00843D]" />
          </button>

          <button
            onClick={() => {
              vibrateClick();
              navigate("/politica-de-privacidade");
            }}
            className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-left text-xs font-bold text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 flex items-center justify-between transition-colors"
          >
            <span>Política de Privacidade</span>
            <Shield className="w-4 h-4 text-blue-500" />
          </button>

          <button
            onClick={() => {
              vibrateClick();
              navigate("/termos-de-uso");
            }}
            className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-left text-xs font-bold text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 flex items-center justify-between transition-colors"
          >
            <span>Termos de Uso</span>
            <Info className="w-4 h-4 text-purple-500" />
          </button>
        </div>
      </div>
    </div>
  );
};
