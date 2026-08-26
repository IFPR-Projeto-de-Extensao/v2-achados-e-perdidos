import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { triggerVibration, vibrateClick, vibrateSuccess } from "../lib/utils";
import { filterNotificationsForUser } from "../lib/notificationHelper";
import { usePWA } from "../hooks/usePWA";
import { ThemeToggle } from "./ThemeToggle";
import { ContactSupportModal } from "./ContactSupportModal";
import {
  Search,
  PlusCircle,
  Home,
  PackageSearch,
  CheckCircle2,
  LayoutDashboard,
  UserCheck,
  Moon,
  Sun,
  Bell,
  QrCode,
  Menu,
  X,
  ShieldAlert,
  GraduationCap,
  Building2,
  LogIn,
  LogOut,
  Sparkles,
  Smartphone,
  Download,
  WifiOff,
  Wifi,
  RefreshCw,
  CloudOff,
  LifeBuoy,
} from "lucide-react";

export const Navbar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    darkMode,
    toggleDarkMode,
    currentUser,
    switchUserRole,
    notifications,
    markNotificationRead,
    fcmPermissionGranted,
    requestNotificationPermission,
    setQrScannerOpen,
    clearAllNotifications,
    setRegisterTypeSelection,
    setAuthModalOpen,
    firebaseUser,
    logout,
    t,
    language,
    isOnline,
    pendingSyncCount,
    syncOfflineQueue,
    items,
    setSelectedItemForDetail,
    isGuest,
    isAuthenticated,
    requestAuthForRegistration,
  } = useApp();

  const { isInstalled, promptInstall } = usePWA();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);

  const userNotifications = filterNotificationsForUser(
    notifications,
    currentUser,
    firebaseUser?.uid
  );

  const unreadCount = userNotifications.filter((n) => !n.read).length;

  const handleNavClick = (tab: "home" | "lost" | "found" | "register" | "dashboard" | "profile" | "image_analyzer") => {
    vibrateClick();
    if (tab === "register") {
      requestAuthForRegistration();
    } else {
      setActiveTab(tab);
    }
    setMobileMenuOpen(false);
  };

  const handleRegisterClick = (type: "PERDIDO" | "ENCONTRADO") => {
    vibrateClick();
    requestAuthForRegistration(type);
    setMobileMenuOpen(false);
  };

  const handleQrScannerClick = () => {
    vibrateClick();
    setQrScannerOpen(true);
  };

  return (
    <header role="banner" className="sticky top-0 z-40 w-full border-b border-gray-200 dark:border-neutral-800 bg-white/95 dark:bg-[#181818]/95 backdrop-blur-md transition-colors duration-200">
      {/* Top green accent border bar IFPR */}
      <div className="h-1 w-full bg-gradient-to-r from-[#00843D] via-[#00843D] to-[#C8102E]" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand Name */}
          <div className="flex items-center space-x-3">
            <div
              role="button"
              tabIndex={0}
              aria-label="Ir para a página inicial do Localiza+ IFPR"
              onKeyDown={(e) => e.key === "Enter" && handleNavClick("home")}
              className="flex items-center space-x-3 cursor-pointer select-none"
              onClick={() => handleNavClick("home")}
            >
              <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-[#00843D] text-white font-bold shadow-md shadow-[#00843D]/20 hover:scale-105 transition-transform">
                <span className="text-xl tracking-tighter font-extrabold">IF</span>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#C8102E] rounded-full border-2 border-white dark:border-[#181818]" />
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="font-extrabold text-lg tracking-tight text-neutral-900 dark:text-white">
                    Localiza+
                  </span>
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-[#00843D]/10 dark:bg-[#00843D]/20 text-[#00843D] dark:text-green-400 border border-[#00843D]/20">
                    IFPR
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 hidden sm:block">
                  Achados &amp; Perdidos • Campus Ivaiporã
                </p>
              </div>
            </div>

            {/* Floating Status Indicator in Navbar for Offline Mode */}
            {!isOnline ? (
              <div
                role="status"
                aria-live="polite"
                title={
                  pendingSyncCount > 0
                    ? `Modo Offline ativado. ${pendingSyncCount} ocorrência(s) salva(s) no IndexedDB aguardando sincronização.`
                    : "Modo Offline: Formulários e dados são preservados com segurança localmente via IndexedDB."
                }
                className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-bold animate-in fade-in duration-300"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                <WifiOff className="w-3.5 h-3.5" />
                <span className="text-[11px] tracking-tight whitespace-nowrap">Modo Offline</span>
                {pendingSyncCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-extrabold">
                    {pendingSyncCount}
                  </span>
                )}
              </div>
            ) : pendingSyncCount > 0 ? (
              <button
                onClick={() => {
                  vibrateClick();
                  syncOfflineQueue();
                }}
                title="Sincronizar dados pendentes do IndexedDB com o Firestore"
                className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-[#00843D]/10 hover:bg-[#00843D]/20 border border-[#00843D]/30 text-[#00843D] dark:text-green-400 text-xs font-bold transition-colors animate-pulse"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="text-[11px]">Sincronizar ({pendingSyncCount})</span>
              </button>
            ) : null}
          </div>

          {/* Desktop Navigation Links */}
          <nav role="navigation" aria-label="Navegação Principal do Sistema" className="hidden lg:flex items-center space-x-1">
            <button
              onClick={() => handleNavClick("home")}
              aria-label={t("home", "Início")}
              aria-current={activeTab === "home" ? "page" : undefined}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "home"
                  ? "bg-[#00843D]/10 dark:bg-[#00843D]/20 text-[#00843D] dark:text-green-400 font-semibold"
                  : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              <Home className="w-4 h-4" />
              <span>{t("home", "Início")}</span>
            </button>

            <button
              onClick={() => handleNavClick("lost")}
              aria-label={t("lostItems", "Perdidos")}
              aria-current={activeTab === "lost" ? "page" : undefined}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "lost"
                  ? "bg-[#EF4444]/10 text-[#EF4444] dark:text-red-400 font-semibold"
                  : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              <PackageSearch className="w-4 h-4 text-[#EF4444]" />
              <span>{t("lostItems", "Perdidos")}</span>
            </button>

            <button
              onClick={() => handleNavClick("found")}
              aria-label={t("foundItems", "Encontrados")}
              aria-current={activeTab === "found" ? "page" : undefined}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "found"
                  ? "bg-[#22C55E]/10 text-[#22C55E] dark:text-green-400 font-semibold"
                  : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
              <span>{t("foundItems", "Encontrados")}</span>
            </button>

            <button
              onClick={() => handleNavClick("image_analyzer")}
              aria-label={t("imageAnalyzer", "Analisador IA")}
              aria-current={activeTab === "image_analyzer" ? "page" : undefined}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === "image_analyzer"
                  ? "bg-emerald-500/15 text-[#00843D] dark:text-green-400 border border-[#00843D]/30"
                  : "text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span>{language === "pt" ? "Analisar Fotos (IA)" : "Photo AI Analyzer"}</span>
            </button>

            <button
              onClick={() => handleNavClick("register")}
              aria-label={t("registerItem", "Registrar Item")}
              aria-current={activeTab === "register" ? "page" : undefined}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "register"
                  ? "bg-[#00843D] text-white shadow-sm font-semibold"
                  : "text-[#00843D] dark:text-green-400 hover:bg-[#00843D]/10 dark:hover:bg-[#00843D]/20 font-semibold"
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              <span>{t("registerItem", "Cadastrar")}</span>
            </button>

            <button
              onClick={() => handleNavClick("dashboard")}
              aria-label={t("dashboard", "Painel Admin")}
              aria-current={activeTab === "dashboard" ? "page" : undefined}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "dashboard"
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold"
                  : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>{t("dashboard", "Dashboard")}</span>
            </button>
          </nav>

          {/* Right Action Icons & Profile Switcher */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Quick Support / Dúvidas Discord Shortcut Button */}
            <button
              id="navbar-quick-support-btn"
              onClick={() => {
                vibrateClick();
                setIsSupportModalOpen(true);
              }}
              role="button"
              aria-label="Tirar Dúvidas ou Enviar Suporte via Discord"
              title="Suporte Rápido & Tirar Dúvidas (Discord)"
              className="p-2 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors relative"
            >
              <LifeBuoy className="w-5 h-5" />
            </button>

            {/* Quick QR Code Scanner Shortcut */}
            <button
              onClick={handleQrScannerClick}
              role="button"
              aria-label="Abrir Scanner de QR Code de Devolução"
              title="Escanear QR Code de Devolução"
              className="p-2 rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors relative"
            >
              <QrCode className="w-5 h-5 text-[#00843D] dark:text-green-400" />
            </button>

            {/* Notifications Button */}
            <div className="relative">
              <button
                onClick={() => {
                  vibrateClick();
                  setNotificationsOpen(!notificationsOpen);
                }}
                role="button"
                aria-label={`Notificações: ${unreadCount} não lidas`}
                aria-expanded={notificationsOpen}
                aria-haspopup="dialog"
                className="p-2 rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors relative"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-[#C8102E] text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown Drawer */}
              {notificationsOpen && (
                <div role="dialog" aria-label="Painel de Notificações do IFPR" className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-[#1E1E1E] rounded-2xl shadow-xl border border-neutral-200 dark:border-neutral-800 z-50 p-4">
                  <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
                    <h3 className="font-bold text-sm text-neutral-900 dark:text-white flex items-center gap-2">
                      <Bell className="w-4 h-4 text-[#00843D]" /> Notificações do IFPR
                    </h3>
                    {unreadCount > 0 && (
                      <button
                        onClick={() => {
                          vibrateClick();
                          clearAllNotifications();
                        }}
                        className="text-xs text-[#00843D] dark:text-green-400 hover:underline font-medium"
                      >
                        Marcar todas lidas
                      </button>
                    )}
                  </div>

                  {/* FCM Push Notification Request Button */}
                  {!fcmPermissionGranted && (
                    <div className="mt-3 p-2.5 rounded-xl bg-[#00843D]/10 border border-[#00843D]/20 flex items-center justify-between gap-2">
                      <div className="text-[11px] text-[#00843D] dark:text-green-400 font-medium">
                        Ative alertas em tempo real no seu navegador para devoluções.
                      </div>
                      <button
                        onClick={() => {
                          vibrateClick();
                          requestNotificationPermission();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#00843D] text-white font-bold text-[10px] shrink-0 hover:bg-[#006830]"
                      >
                        Ativar Push FCM
                      </button>
                    </div>
                  )}

                  <div className="mt-3 space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {userNotifications.length === 0 ? (
                      <p className="text-xs text-center py-6 text-neutral-500">
                        Nenhuma notificação recente.
                      </p>
                    ) : (
                      userNotifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => {
                            vibrateClick();
                            if (!n.read) {
                              markNotificationRead(n.id);
                            }
                            if (n.relatedItemId) {
                              const it = items.find((i) => i.id === n.relatedItemId);
                              if (it) setSelectedItemForDetail(it);
                            }
                          }}
                          className={`p-3 rounded-xl text-xs transition-colors border cursor-pointer ${
                            !n.read
                              ? "bg-[#00843D]/5 border-[#00843D]/20 dark:bg-[#00843D]/10 hover:bg-[#00843D]/10"
                              : "bg-neutral-50 dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                          }`}
                        >
                          <div className="flex justify-between items-start font-semibold text-neutral-900 dark:text-white mb-1">
                            <span>{n.title}</span>
                            {!n.read && (
                              <span className="w-2 h-2 rounded-full bg-[#00843D]" />
                            )}
                          </div>
                          <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
                            {n.message}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Dark Mode Toggle Switch Component */}
            <ThemeToggle />

            {/* Login / Cadastro or User Profile & Logout */}
            {currentUser.id === "guest_visitor" && !firebaseUser ? (
              <button
                onClick={() => {
                  vibrateClick();
                  setAuthModalOpen(true);
                }}
                role="button"
                aria-label="Entrar ou cadastrar conta"
                className="px-3 py-1.5 rounded-xl bg-[#00843D] hover:bg-[#006830] text-white text-xs font-bold transition-all shadow-xs flex items-center space-x-1.5"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Entrar / Cadastrar</span>
              </button>
            ) : (
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={() => handleNavClick("profile")}
                  aria-label={`Ver perfil de ${currentUser.name}`}
                  className="hidden sm:flex items-center space-x-1 px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-bold border border-emerald-500/20 hover:bg-emerald-500 hover:text-white transition-colors"
                >
                  <span>{currentUser.name} ({currentUser.role})</span>
                </button>
                <button
                  onClick={() => {
                    vibrateClick();
                    logout();
                  }}
                  role="button"
                  aria-label="Sair da Conta"
                  title="Sair da Conta (Logout)"
                  className="px-2.5 py-1 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white text-xs font-bold transition-all border border-red-500/20 flex items-center space-x-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Sair</span>
                </button>
              </div>
            )}

            {/* Profile Avatar Trigger */}
            <button
              onClick={() => handleNavClick("profile")}
              role="button"
              aria-label={`Acessar perfil de ${currentUser.name}`}
              className="flex items-center space-x-2 pl-1 cursor-pointer focus:outline-none"
              title="Ver Perfil"
            >
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.name}
                className="w-8 h-8 rounded-full object-cover border-2 border-[#00843D]"
              />
            </button>

            {/* Mobile menu hamburger button */}
            <button
              onClick={() => {
                vibrateClick();
                setMobileMenuOpen(!mobileMenuOpen);
              }}
              role="button"
              aria-label={mobileMenuOpen ? "Fechar menu móvel" : "Abrir menu móvel"}
              aria-expanded={mobileMenuOpen}
              className="lg:hidden p-2 rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div role="navigation" aria-label="Menu Móvel" className="lg:hidden border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#181818] px-4 pt-3 pb-6 space-y-2 animate-in slide-in-from-top-2 duration-200">
          <button
            onClick={() => handleNavClick("home")}
            aria-label="Início"
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
              activeTab === "home"
                ? "bg-[#00843D]/10 text-[#00843D] font-bold"
                : "text-neutral-700 dark:text-neutral-200"
            }`}
          >
            <Home className="w-5 h-5 text-[#00843D]" />
            <span>Início</span>
          </button>

          <button
            onClick={() => handleNavClick("lost")}
            aria-label="Objetos Perdidos"
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
              activeTab === "lost"
                ? "bg-[#EF4444]/10 text-[#EF4444] font-bold"
                : "text-neutral-700 dark:text-neutral-200"
            }`}
          >
            <PackageSearch className="w-5 h-5 text-[#EF4444]" />
            <span>Objetos Perdidos</span>
          </button>

          <button
            onClick={() => handleNavClick("found")}
            aria-label="Objetos Encontrados"
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
              activeTab === "found"
                ? "bg-[#22C55E]/10 text-[#22C55E] font-bold"
                : "text-neutral-700 dark:text-neutral-200"
            }`}
          >
            <CheckCircle2 className="w-5 h-5 text-[#22C55E]" />
            <span>Objetos Encontrados</span>
          </button>

          <button
            onClick={() => handleNavClick("image_analyzer")}
            aria-label="Analisar Fotos com Inteligência Artificial Gemini"
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-bold ${
              activeTab === "image_analyzer"
                ? "bg-emerald-500/15 text-[#00843D] dark:text-green-400 font-extrabold"
                : "text-emerald-700 dark:text-emerald-400"
            }`}
          >
            <Sparkles className="w-5 h-5 text-amber-500 fill-amber-500" />
            <span>Analisar Fotos com Gemini (IA)</span>
          </button>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              onClick={() => handleRegisterClick("PERDIDO")}
              role="button"
              aria-label="Cadastrar novo item perdido"
              className="flex items-center justify-center space-x-1.5 px-3 py-2.5 rounded-xl bg-[#EF4444]/10 text-[#EF4444] font-bold text-xs border border-[#EF4444]/20"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Cadastrar Perdido</span>
            </button>
            <button
              onClick={() => handleRegisterClick("ENCONTRADO")}
              role="button"
              aria-label="Cadastrar novo item encontrado"
              className="flex items-center justify-center space-x-1.5 px-3 py-2.5 rounded-xl bg-[#00843D] text-white font-bold text-xs shadow-xs"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Cadastrar Encontrado</span>
            </button>
          </div>

          <button
            onClick={() => handleNavClick("dashboard")}
            aria-label="Painel Administrativo do Campus"
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
              activeTab === "dashboard"
                ? "bg-amber-500/10 text-amber-600 font-bold"
                : "text-neutral-700 dark:text-neutral-200"
            }`}
          >
            <LayoutDashboard className="w-5 h-5 text-amber-500" />
            <span>Dashboard Administrativo</span>
          </button>

          {/* Mobile Theme Toggle Switch */}
          <div className="flex items-center justify-between py-2 px-3.5 rounded-xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700/80 my-1">
            <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
              {darkMode ? (
                <Moon className="w-4 h-4 text-amber-400 fill-amber-400" />
              ) : (
                <Sun className="w-4 h-4 text-amber-500 fill-amber-500" />
              )}
              <span>{darkMode ? "Modo Escuro Ativo" : "Modo Claro Ativo"}</span>
            </span>
            <ThemeToggle />
          </div>

          {/* PWA Install Button in Mobile Menu */}
          {!isInstalled && (
            <button
              onClick={() => {
                promptInstall();
                setMobileMenuOpen(false);
              }}
              role="button"
              aria-label="Instalar aplicativo Localiza+"
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-bold bg-[#00843D]/10 text-[#00843D] dark:text-green-400 border border-[#00843D]/20 hover:bg-[#00843D]/20 transition-colors"
            >
              <div className="flex items-center space-x-3">
                <Smartphone className="w-5 h-5" />
                <span>Instalar App Localiza+</span>
              </div>
              <Download className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => {
              vibrateClick();
              setIsSupportModalOpen(true);
              setMobileMenuOpen(false);
            }}
            role="button"
            aria-label="Tirar Dúvidas ou Enviar Suporte via Discord"
            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white transition-colors"
          >
            <LifeBuoy className="w-5 h-5" />
            <span>Tirar Dúvidas / Suporte Rápido</span>
          </button>

          <button
            onClick={() => handleNavClick("profile")}
            aria-label={`Meu Perfil (${currentUser.role})`}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
              activeTab === "profile"
                ? "bg-[#00843D]/10 text-[#00843D] font-bold"
                : "text-neutral-700 dark:text-neutral-200"
            }`}
          >
            <UserCheck className="w-5 h-5 text-[#00843D]" />
            <span>Meu Perfil ({currentUser.role})</span>
          </button>

          {(currentUser.id !== "guest_visitor" || firebaseUser) ? (
            <button
              onClick={() => {
                vibrateClick();
                logout();
                setMobileMenuOpen(false);
              }}
              role="button"
              aria-label="Sair da Conta"
              className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-bold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span>Sair da Conta ({currentUser.name})</span>
            </button>
          ) : (
            <button
              onClick={() => {
                vibrateClick();
                setAuthModalOpen(true);
                setMobileMenuOpen(false);
              }}
              role="button"
              aria-label="Entrar ou criar conta"
              className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-bold bg-[#00843D] text-white transition-colors shadow-xs"
            >
              <LogIn className="w-5 h-5" />
              <span>Entrar / Cadastrar</span>
            </button>
          )}
        </div>
      )}

      {/* Quick Support Modal for Discord Feedback */}
      <ContactSupportModal
        isOpen={isSupportModalOpen}
        onClose={() => setIsSupportModalOpen(false)}
      />
    </header>
  );
};

