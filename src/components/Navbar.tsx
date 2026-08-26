import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { useRouter, Link } from "../context/RouterContext";
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
  Settings,
  Layers,
  ExternalLink,
} from "lucide-react";

export const Navbar: React.FC = () => {
  const {
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

  const { routeKey, pathname, navigate } = useRouter();
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

  const handleNavClick = (path: string) => {
    vibrateClick();
    navigate(path);
    setMobileMenuOpen(false);
  };

  const handleRegisterClick = (type: "PERDIDO" | "ENCONTRADO") => {
    vibrateClick();
    requestAuthForRegistration(type);
    navigate(`/cadastrar?tipo=${type.toLowerCase()}`);
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
            <Link
              to="/"
              className="flex items-center space-x-3 cursor-pointer select-none"
              title="Ir para a página inicial do Localiza+ IFPR"
            >
              <div className="relative flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 hover:scale-105 transition-transform shrink-0">
                <img
                  src="/ifpr-logo.svg"
                  alt="IFPR Logo"
                  className="w-full h-full object-contain select-none drop-shadow-xs"
                />
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
            </Link>

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
            <Link
              to="/"
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors ${
                routeKey === "home"
                  ? "bg-[#00843D]/10 dark:bg-[#00843D]/20 text-[#00843D] dark:text-green-400 font-bold"
                  : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              <Home className="w-4 h-4" />
              <span>{t("home", "Início")}</span>
            </Link>

            <Link
              to="/buscar"
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors ${
                routeKey === "search"
                  ? "bg-[#00843D]/10 dark:bg-[#00843D]/20 text-[#00843D] dark:text-green-400 font-bold"
                  : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              <Search className="w-4 h-4" />
              <span>Buscar</span>
            </Link>

            <Link
              to="/perdidos"
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors ${
                pathname === "/perdidos"
                  ? "bg-[#EF4444]/10 text-[#EF4444] dark:text-red-400 font-bold"
                  : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              <PackageSearch className="w-4 h-4 text-[#EF4444]" />
              <span>{t("lostItems", "Perdidos")}</span>
            </Link>

            <Link
              to="/encontrados"
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors ${
                pathname === "/encontrados"
                  ? "bg-[#22C55E]/10 text-[#22C55E] dark:text-green-400 font-bold"
                  : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
              <span>{t("foundItems", "Encontrados")}</span>
            </Link>

            <Link
              to="/analisador-ia"
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-sm font-bold transition-all ${
                routeKey === "image_analyzer"
                  ? "bg-emerald-500/15 text-[#00843D] dark:text-green-400 border border-[#00843D]/30"
                  : "text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span>{language === "pt" ? "Analisar Fotos (IA)" : "Photo AI Analyzer"}</span>
            </Link>

            <Link
              to="/cadastrar"
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-sm font-bold transition-colors ${
                routeKey === "register"
                  ? "bg-[#00843D] text-white shadow-sm"
                  : "text-[#00843D] dark:text-green-400 hover:bg-[#00843D]/10 dark:hover:bg-[#00843D]/20"
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              <span>{t("registerItem", "Cadastrar")}</span>
            </Link>

            {/* Admin Panel Link */}
            {currentUser.role === "ADMIN" && (
              <Link
                to="/admin"
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-sm font-bold transition-colors ${
                  routeKey === "admin"
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40"
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Painel Admin</span>
              </Link>
            )}
          </nav>

          {/* Right Action Icons & Profile Switcher */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Quick Support Link to /suporte */}
            <Link
              to="/suporte"
              id="navbar-quick-support-btn"
              title="Central de Suporte & Dúvidas"
              className={`p-2 rounded-xl transition-colors relative ${
                routeKey === "support" || routeKey === "support_feedback" || routeKey === "support_bug"
                  ? "bg-[#00843D]/15 text-[#00843D] dark:text-green-400"
                  : "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
              }`}
            >
              <LifeBuoy className="w-5 h-5" />
            </Link>

            {/* Quick QR Code Scanner Shortcut */}
            <button
              onClick={handleQrScannerClick}
              role="button"
              aria-label="Abrir Scanner de QR Code de Devolução"
              title="Escanear QR Code de Devolução"
              className="p-2 rounded-xl text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors relative"
            >
              <QrCode className="w-5 h-5 text-[#00843D] dark:text-green-400" />
            </button>

            {/* Notifications Button & Dropdown */}
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
                className={`p-2 rounded-xl transition-colors relative ${
                  routeKey === "notifications"
                    ? "bg-[#00843D]/15 text-[#00843D] dark:text-green-400"
                    : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                }`}
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
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          vibrateClick();
                          setNotificationsOpen(false);
                          navigate("/notificacoes");
                        }}
                        className="text-xs text-[#00843D] dark:text-green-400 hover:underline font-bold"
                      >
                        Ver todas
                      </button>
                    </div>
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
                      userNotifications.slice(0, 5).map((n) => (
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

                  <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 mt-3 text-center">
                    <Link
                      to="/notificacoes"
                      onClick={() => setNotificationsOpen(false)}
                      className="text-xs font-bold text-[#00843D] dark:text-green-400 hover:underline inline-flex items-center gap-1"
                    >
                      <span>Abrir Central de Notificações Completa</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
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
                className="px-3.5 py-2 rounded-xl bg-[#00843D] hover:bg-[#006830] text-white text-xs font-bold transition-all shadow-xs flex items-center space-x-1.5"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Entrar</span>
              </button>
            ) : (
              <div className="flex items-center space-x-1.5">
                <Link
                  to="/perfil"
                  title={`Ver perfil de ${currentUser.name}`}
                  className="hidden sm:flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-bold border border-emerald-500/20 hover:bg-emerald-500 hover:text-white transition-colors"
                >
                  <span>{currentUser.name} ({currentUser.role})</span>
                </Link>
                <button
                  onClick={() => {
                    vibrateClick();
                    logout();
                  }}
                  role="button"
                  aria-label="Sair da Conta"
                  title="Sair da Conta (Logout)"
                  className="px-2.5 py-1.5 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white text-xs font-bold transition-all border border-red-500/20 flex items-center space-x-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Sair</span>
                </button>
              </div>
            )}

            {/* Profile Avatar Trigger */}
            <Link
              to="/perfil"
              title="Meu Perfil"
              className="flex items-center space-x-2 pl-1 cursor-pointer focus:outline-none"
            >
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.name}
                className="w-8 h-8 rounded-full object-cover border-2 border-[#00843D]"
              />
            </Link>

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
            onClick={() => handleNavClick("/")}
            aria-label="Início"
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
              routeKey === "home"
                ? "bg-[#00843D]/10 text-[#00843D] font-bold"
                : "text-neutral-700 dark:text-neutral-200"
            }`}
          >
            <Home className="w-5 h-5 text-[#00843D]" />
            <span>Início</span>
          </button>

          <button
            onClick={() => handleNavClick("/buscar")}
            aria-label="Buscar Itens"
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
              routeKey === "search"
                ? "bg-[#00843D]/10 text-[#00843D] font-bold"
                : "text-neutral-700 dark:text-neutral-200"
            }`}
          >
            <Search className="w-5 h-5 text-[#00843D]" />
            <span>Buscar Objetos</span>
          </button>

          <button
            onClick={() => handleNavClick("/perdidos")}
            aria-label="Objetos Perdidos"
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
              pathname === "/perdidos"
                ? "bg-[#EF4444]/10 text-[#EF4444] font-bold"
                : "text-neutral-700 dark:text-neutral-200"
            }`}
          >
            <PackageSearch className="w-5 h-5 text-[#EF4444]" />
            <span>Objetos Perdidos</span>
          </button>

          <button
            onClick={() => handleNavClick("/encontrados")}
            aria-label="Objetos Encontrados"
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
              pathname === "/encontrados"
                ? "bg-[#22C55E]/10 text-[#22C55E] font-bold"
                : "text-neutral-700 dark:text-neutral-200"
            }`}
          >
            <CheckCircle2 className="w-5 h-5 text-[#22C55E]" />
            <span>Objetos Encontrados</span>
          </button>

          <button
            onClick={() => handleNavClick("/meus-registros")}
            aria-label="Meus Registros"
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
              routeKey === "my_items"
                ? "bg-[#00843D]/10 text-[#00843D] font-bold"
                : "text-neutral-700 dark:text-neutral-200"
            }`}
          >
            <Layers className="w-5 h-5 text-[#00843D]" />
            <span>Meus Registros</span>
          </button>

          <button
            onClick={() => handleNavClick("/analisador-ia")}
            aria-label="Analisar Fotos com Inteligência Artificial Gemini"
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-bold ${
              routeKey === "image_analyzer"
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

          {/* Admin Panel Link on Mobile */}
          {currentUser.role === "ADMIN" && (
            <button
              onClick={() => handleNavClick("/admin")}
              aria-label="Painel Administrativo do Campus"
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-bold ${
                routeKey === "admin"
                  ? "bg-purple-600 text-white"
                  : "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300"
              }`}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span>Painel Administrativo (/admin)</span>
            </button>
          )}

          <button
            onClick={() => handleNavClick("/suporte")}
            role="button"
            aria-label="Central de Suporte e Dúvidas"
            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white transition-colors"
          >
            <LifeBuoy className="w-5 h-5" />
            <span>Central de Suporte & Dúvidas</span>
          </button>

          <button
            onClick={() => handleNavClick("/configuracoes")}
            aria-label="Configurações & Preferências"
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
              routeKey === "settings"
                ? "bg-[#00843D]/10 text-[#00843D] font-bold"
                : "text-neutral-700 dark:text-neutral-200"
            }`}
          >
            <Settings className="w-5 h-5 text-neutral-500" />
            <span>Configurações & Preferências</span>
          </button>

          <button
            onClick={() => handleNavClick("/perfil")}
            aria-label={`Meu Perfil (${currentUser.role})`}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
              routeKey === "profile"
                ? "bg-[#00843D]/10 text-[#00843D] font-bold"
                : "text-neutral-700 dark:text-neutral-200"
            }`}
          >
            <UserCheck className="w-5 h-5 text-[#00843D]" />
            <span>Meu Perfil ({currentUser.role})</span>
          </button>

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

      {/* Quick Support Modal */}
      <ContactSupportModal
        isOpen={isSupportModalOpen}
        onClose={() => setIsSupportModalOpen(false)}
        initialCategory="SUPPORT"
      />
    </header>
  );
};
