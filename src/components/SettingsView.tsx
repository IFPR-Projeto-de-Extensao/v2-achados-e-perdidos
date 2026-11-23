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
  Compass,
} from "lucide-react";
import { vibrateClick, vibrateSuccess } from "../lib/utils";
import { triggerSpotlightTour } from "../lib/spotlightTourUtils";

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
          <span>{t("settingsEyebrow", "Preferências & Sistema")}</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white tracking-tight">
          {t("settingsTitle", "Configurações do Localiza+")}
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          {t("settingsSubtitle", "Personalize a aparência, notificações, sincronização offline e idioma do aplicativo.")}
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
                {t("visualAppearance", "Aparência Visual")}
              </h3>
              <p className="text-xs text-neutral-500">
                {t("visualAppearanceDesc", "Tema de cores e contraste para leitura confortável")}
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
                    {t("darkLightMode", "Modo Escuro / Claro")}
                  </h4>
                  <p className="text-[11px] text-neutral-500">
                    {darkMode
                      ? t("darkModeActive", "Modo escuro ativo (ideal para noite)")
                      : t("lightModeActive", "Modo claro ativo")}
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
                    {t("highContrastTitle", "Alto Contraste (Acessibilidade)")}
                  </h4>
                  <p className="text-[11px] text-neutral-500">
                    {t("highContrastDesc", "Bordas destacadas e texto com contraste WCAG AAA")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-pressed={highContrastMode}
                aria-label={t("highContrastTitle", "Alto Contraste (Acessibilidade)")}
                onClick={() => {
                  vibrateClick();
                  toggleHighContrastMode();
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
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
                {t("languageLocalization", "Idioma & Localização")}
              </h3>
              <p className="text-xs text-neutral-500">
                {t("languageLocalizationDesc", "Selecione o idioma de exibição do sistema")}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              aria-pressed={language === "pt"}
              onClick={() => {
                vibrateClick();
                setLanguage("pt");
              }}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                language === "pt"
                  ? "bg-emerald-500/10 border-[#00843D] text-[#00843D] dark:text-green-400 font-bold shadow-xs"
                  : "bg-neutral-50 dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:border-neutral-400"
              }`}
            >
              <span className="text-xl mb-1 block">🇧🇷</span>
              <p className="text-xs font-bold">Português (Brasil)</p>
              <p className="text-[10px] text-neutral-500">{t("ifprDefault", "Padrão IFPR")}</p>
            </button>

            <button
              type="button"
              aria-pressed={language === "en"}
              onClick={() => {
                vibrateClick();
                setLanguage("en");
              }}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                language === "en"
                  ? "bg-emerald-500/10 border-[#00843D] text-[#00843D] dark:text-green-400 font-bold shadow-xs"
                  : "bg-neutral-50 dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:border-neutral-400"
              }`}
            >
              <span className="text-xl mb-1 block">🇺🇸</span>
              <p className="text-xs font-bold">English (US)</p>
              <p className="text-[10px] text-neutral-500">{t("international", "International")}</p>
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
                {t("pushNotificationsTitle", "Notificações Push FCM")}
              </h3>
              <p className="text-xs text-neutral-500">
                {t("pushNotificationsDesc", "Alertas em tempo real sobre correspondências e devoluções")}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                  {t("browserPushPermission", "Permissão Push no Navegador")}
                </h4>
                <p className="text-[11px] text-neutral-500">
                  {fcmPermissionGranted
                    ? t("allowedAndActive", "Permitido e ativo")
                    : t("notGrantedYet", "Ainda não concedido")}
                </p>
              </div>

              {!fcmPermissionGranted ? (
                <button
                  type="button"
                  onClick={() => {
                    vibrateClick();
                    requestNotificationPermission();
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-[#00843D] text-white text-xs font-bold hover:bg-[#006e33] cursor-pointer"
                >
                  {t("grantPermission", "Conceder")}
                </button>
              ) : (
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-[#00843D] dark:text-green-400 text-[11px] font-bold">
                  {t("activeLabel", "Ativo")}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                vibrateClick();
                testFCMAlert();
              }}
              className="w-full py-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs font-bold transition-colors cursor-pointer"
            >
              {t("testDemoNotification", "Testar Notificação de Demonstração")}
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
                {t("offlineStorageTitle", "Armazenamento Offline")}
              </h3>
              <p className="text-xs text-neutral-500">
                {t("offlineStorageDesc", "Cache local no IndexedDB para uso sem internet")}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-500">{t("connectionStatus", "Status da Conexão:")}</span>
                <span className="font-bold flex items-center space-x-1">
                  {isOnline ? (
                    <>
                      <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-green-400">{t("online", "Online")}</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-amber-600 dark:text-amber-400">{t("offlineMode", "Modo Offline")}</span>
                    </>
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-500">{t("cachedItemsLabel", "Itens em Cache Local:")}</span>
                <span className="font-bold text-neutral-900 dark:text-white">
                  {items.length} {t("objects", "objetos").toLowerCase()}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-500">{t("syncQueueLabel", "Fila de Sincronização:")}</span>
                <span className="font-bold text-neutral-900 dark:text-white">
                  {pendingSyncCount} {t("pendingLabel", "pendentes")}
                </span>
              </div>
            </div>

            {pendingSyncCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  vibrateClick();
                  syncOfflineQueue(true);
                }}
                className="w-full py-2.5 rounded-xl bg-[#00843D] text-white text-xs font-bold hover:bg-[#006e33] flex items-center justify-center space-x-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{t("syncQueueNow", "Sincronizar Fila Agora")}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Quick Links Section (Support, Privacy, Terms) */}
      <div className="bg-white dark:bg-[#1E1E1E] p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
          {t("usefulLinksSupport", "Links Úteis & Suporte")}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => {
              vibrateClick();
              triggerSpotlightTour();
            }}
            className="p-3.5 rounded-2xl bg-[#EBF5F0]/70 dark:bg-emerald-950/40 hover:bg-[#EBF5F0] dark:hover:bg-emerald-950/60 text-left text-xs font-bold text-[#064E3B] dark:text-emerald-300 border border-[#16845B]/25 flex items-center justify-between transition-colors cursor-pointer"
          >
            <span>{t("tourReplayBtn", "Iniciar Tour Guiado")}</span>
            <Compass className="w-4 h-4 text-[#16845B] dark:text-emerald-400 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => {
              vibrateClick();
              navigate("/suporte");
            }}
            className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-left text-xs font-bold text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 flex items-center justify-between transition-colors cursor-pointer"
          >
            <span>{t("supportCenter", "Central de Suporte")}</span>
            <HelpCircle className="w-4 h-4 text-[#00843D]" />
          </button>

          <button
            type="button"
            onClick={() => {
              vibrateClick();
              navigate("/politica-de-privacidade");
            }}
            className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-left text-xs font-bold text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 flex items-center justify-between transition-colors cursor-pointer"
          >
            <span>{t("privacyPolicy", "Política de Privacidade")}</span>
            <Shield className="w-4 h-4 text-blue-500" />
          </button>

          <button
            type="button"
            onClick={() => {
              vibrateClick();
              navigate("/termos-de-uso");
            }}
            className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-left text-xs font-bold text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 flex items-center justify-between transition-colors cursor-pointer"
          >
            <span>{t("termsOfUse", "Termos de Uso")}</span>
            <Info className="w-4 h-4 text-purple-500" />
          </button>
        </div>
      </div>
    </div>
  );
};
