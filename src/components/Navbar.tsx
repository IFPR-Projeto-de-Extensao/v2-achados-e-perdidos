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
    <header role="banner" className="navbar-main-container sticky top-0 z-40 w-full border-b border-gray-200 dark:border-neutral-800 bg-white/95 dark:bg-[#181818]/95 backdrop-blur-md transition-colors duration-200">
      {/* Top green accent border bar IFPR */}
      <div className="h-1 w-full bg-gradient-to-r from-[#00843D] via-[#00843D] to-[#C8102E]" />

      <div className="max-w-7xl mx-auto px-2.5 sm:px-4 lg:px-6">
        <div className="flex items-center justify-between h-13 sm:h-14 gap-1.5 sm:gap-2">
          {/* Logo & Brand Name */}
          <div className="flex items-center space-x-2 shrink-0 min-w-0">
            <Link
              to="/"
              className="flex items-center space-x-2 cursor-pointer select-none shrink-0"
              title="Ir para a página inicial do Localiza+ IFPR"
            >
              <div className="relative flex items-center justify-center w-8 h-8 hover:scale-105 transition-transform shrink-0">
                <img
                  src="/ifpr-logo.svg"
                  alt="IFPR Logo"
                  className="w-full h-full object-contain select-none drop-shadow-xs"
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-1">
                  <span className="font-extrabold text-base sm:text-lg tracking-tight text-neutral-900 dark:text-white whitespace-nowrap">
                    Localiza+
                  </span>
                  <span className="px-1 py-0.2 text-[9px] font-bold rounded bg-[#00843D]/10 dark:bg-[#00843D]/20 text-[#00843D] dark:text-green-400 border border-[#00843D]/20 shrink-0">
                    IFPR
                  </span>
                </div>
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 hidden xl:block truncate max-w-[150px]">
                  Achados &amp; Perdidos
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
                    ? `Modo Offline ativado. ${pendingSyncCount} ocorrência(s) salva(s) aguardando sincronização.`
                    : "Modo Offline: Registros são salvos localmente com segurança."
                }
                className="hidden md:flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[10px] font-bold shrink-0 whitespace-nowrap"
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                </span>
                <WifiOff className="w-3 h-3" />
                <span className="hidden xl:inline">Offline</span>
                {pendingSyncCount > 0 && (
                  <span className="px-1 rounded-full bg-amber-500 text-white text-[9px]">
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
                className="hidden md:flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-[#00843D]/10 hover:bg-[#00843D]/20 border border-[#00843D]/30 text-[#00843D] dark:text-green-400 text-[10px] font-bold transition-colors animate-pulse shrink-0 whitespace-nowrap"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Sincronizar ({pendingSyncCount})</span>
              </button>
            ) : null}
          </div>

          {/* Desktop Navigation Links - Compact, clean hierarchy, whitespace-nowrap */}
          <nav role="navigation" aria-label="Navegação Principal do Sistema" className="hidden lg:flex items-center space-x-0.5 xl:space-x-1 shrink-0">
            {/* Navegação principal */}
            <Link
              to="/"
              className={`flex items-center space-x-1.5 px-2 xl:px-2.5 py-1.5 rounded-lg text-xs xl:text-sm font-semibold whitespace-nowrap transition-colors shrink-0 ${
                routeKey === "home"
                  ? "bg-[#00843D]/10 dark:bg-[#00843D]/20 text-[#00843D] dark:text-green-400 font-bold"
                  : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              <Home className="w-3.5 h-3.5 xl:w-4 xl:h-4 shrink-0" />
              <span>{t("home", "Início")}</span>
            </Link>

            <Link
              to="/buscar"
              className={`flex items-center space-x-1.5 px-2 xl:px-2.5 py-1.5 rounded-lg text-xs xl:text-sm font-semibold whitespace-nowrap transition-colors shrink-0 ${
                routeKey === "search"
                  ? "bg-[#00843D]/10 dark:bg-[#00843D]/20 text-[#00843D] dark:text-green-400 font-bold"
                  : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              <Search className="w-3.5 h-3.5 xl:w-4 xl:h-4 shrink-0" />
              <span>Buscar</span>
            </Link>

            <Link
              to="/perdidos"
              className={`flex items-center space-x-1.5 px-2 xl:px-2.5 py-1.5 rounded-lg text-xs xl:text-sm font-semibold whitespace-nowrap transition-colors shrink-0 ${
                pathname === "/perdidos"
                  ? "bg-[#EF4444]/10 text-[#EF4444] dark:text-red-400 font-bold"
                  : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              <PackageSearch className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-[#EF4444] shrink-0" />
              <span>{t("lostItems", "Perdidos")}</span>
            </Link>

            <Link
              to="/encontrados"
              className={`flex items-center space-x-1.5 px-2 xl:px-2.5 py-1.5 rounded-lg text-xs xl:text-sm font-semibold whitespace-nowrap transition-colors shrink-0 ${
                pathname === "/encontrados"
                  ? "bg-[#22C55E]/10 text-[#22C55E] dark:text-green-400 font-bold"
                  : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-[#22C55E] shrink-0" />
              <span>{t("foundItems", "Encontrados")}</span>
            </Link>

            {/* Divisor sutil */}
            <div className="h-3.5 w-px bg-neutral-200 dark:bg-neutral-800 mx-0.5 shrink-0" />

            {/* Ações específicas */}
            <Link
              to="/analisador-ia"
              title="Analisar Fotos de Itens com Inteligência Artificial"
              className={`flex items-center space-x-1 px-2 xl:px-2.5 py-1.5 rounded-lg text-xs xl:text-sm font-semibold whitespace-nowrap transition-all shrink-0 ${
                routeKey === "image_analyzer"
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 font-bold border border-amber-500/30"
                  : "text-neutral-700 dark:text-neutral-300 hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-amber-500 fill-amber-500 shrink-0" />
              <span>Analisar IA</span>
            </Link>

            <Link
              to="/cadastrar"
              title="Cadastrar Novo Objeto Perdido ou Encontrado"
              className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs xl:text-sm font-semibold whitespace-nowrap transition-colors shrink-0 ${
                routeKey === "register"
                  ? "bg-[#00843D] text-white shadow-xs font-bold"
                  : "bg-[#00843D]/10 dark:bg-[#00843D]/20 text-[#00843D] dark:text-green-400 hover:bg-[#00843D] hover:text-white"
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5 xl:w-4 xl:h-4 shrink-0" />
              <span>Registrar</span>
            </Link>

            {/* Acesso administrativo */}
            {currentUser.role === "ADMIN" && (
              <Link
                to="/admin"
                title="Painel Administrativo do Campus"
                className={`flex items-center space-x-1 px-2 xl:px-2.5 py-1.5 rounded-lg text-xs xl:text-sm font-semibold whitespace-nowrap transition-colors shrink-0 ${
                  routeKey === "admin"
                    ? "bg-purple-600 text-white shadow-xs font-bold"
                    : "text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40"
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5 xl:w-4 xl:h-4 shrink-0" />
                <span>Admin</span>
              </Link>
            )}
          </nav>

          {/* Right Action Icons & Profile Switcher */}
          <div className="flex items-center space-x-1 sm:space-x-1.5 shrink-0">
            {/* Quick Action Icons Group (Suporte, QR Code, Notificações, Tema) */}
            <div className="navbar-icons-group flex items-center space-x-1 sm:space-x-1.5 shrink-0">
              {/* Quick Support Link to /suporte - Desktop only */}
              <Link
                to="/suporte"
                id="navbar-quick-support-btn"
                title="Central de Suporte & Dúvidas"
                className={`hidden sm:inline-flex w-7 h-7 sm:w-8 sm:h-8 items-center justify-center rounded-lg transition-colors shrink-0 ${
                  routeKey === "support" || routeKey === "support_feedback" || routeKey === "support_bug"
                    ? "bg-[#00843D]/15 text-[#00843D] dark:text-green-400"
                    : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                }`}
              >
                <LifeBuoy className="w-4 h-4" />
              </Link>

              {/* Quick QR Code Scanner Shortcut - Desktop only */}
              <button
                onClick={handleQrScannerClick}
                role="button"
                aria-label="Abrir Scanner de QR Code de Devolução"
                title="Escanear QR Code de Devolução"
                className="hidden sm:inline-flex w-7 h-7 sm:w-8 sm:h-8 items-center justify-center rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors shrink-0"
              >
                <QrCode className="w-4 h-4 text-[#00843D] dark:text-green-400" />
              </button>

              {/* Notifications Button & Dropdown */}
              <div className="relative shrink-0 flex items-center">
                <button
                  onClick={() => {
                    vibrateClick();
                    setNotificationsOpen(!notificationsOpen);
                  }}
                  role="button"
                  aria-label={`Notificações: ${unreadCount} não lidas`}
                  aria-expanded={notificationsOpen}
                  aria-haspopup="dialog"
                  className={`w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg transition-colors relative shrink-0 ${
                    routeKey === "notifications"
                      ? "bg-[#00843D]/15 text-[#00843D] dark:text-green-400"
                      : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-[#C8102E] text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {/* Notifications Dropdown Drawer */}
                {notificationsOpen && (
                  <div role="dialog" aria-label="Painel de Notificações do IFPR" className="absolute right-0 top-full mt-2 w-72 xs:w-80 sm:w-96 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-[#1E1E1E] rounded-2xl shadow-xl border border-neutral-200 dark:border-neutral-800 z-50 p-3.5 xs:p-4">
                    <div className="flex items-center justify-between pb-2.5 xs:pb-3 border-b border-neutral-200 dark:border-neutral-800">
                      <h3 className="font-bold text-xs xs:text-sm text-neutral-900 dark:text-white flex items-center gap-1.5 xs:gap-2">
                        <Bell className="w-3.5 h-3.5 xs:w-4 xs:h-4 text-[#00843D]" /> Notificações IFPR
                      </h3>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {
                            vibrateClick();
                            setNotificationsOpen(false);
                            navigate("/notificacoes");
                          }}
                          className="text-[11px] xs:text-xs text-[#00843D] dark:text-green-400 hover:underline font-bold"
                        >
                          Ver todas
                        </button>
                      </div>
                    </div>

                    {/* FCM Push Notification Request Button */}
                    {!fcmPermissionGranted && (
                      <div className="mt-2.5 xs:mt-3 p-2 xs:p-2.5 rounded-xl bg-[#00843D]/10 border border-[#00843D]/20 flex items-center justify-between gap-2">
                        <div className="text-[10px] xs:text-[11px] text-[#00843D] dark:text-green-400 font-medium">
                          Ative alertas em tempo real no navegador.
                        </div>
                        <button
                          onClick={() => {
                            vibrateClick();
                            requestNotificationPermission();
                          }}
                          className="px-2 py-1 rounded-lg bg-[#00843D] text-white font-bold text-[9px] xs:text-[10px] shrink-0 hover:bg-[#006830]"
                        >
                          Ativar Push
                        </button>
                      </div>
                    )}

                    <div className="mt-2.5 xs:mt-3 space-y-2 max-h-64 sm:max-h-72 overflow-y-auto pr-1">
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
                            className={`p-2.5 xs:p-3 rounded-xl text-xs transition-colors border cursor-pointer ${
                              !n.read
                                ? "bg-[#00843D]/5 border-[#00843D]/20 dark:bg-[#00843D]/10 hover:bg-[#00843D]/10"
                                : "bg-neutral-50 dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                            }`}
                          >
                            <div className="flex justify-between items-start font-semibold text-neutral-900 dark:text-white mb-1">
                              <span className="truncate pr-2">{n.title}</span>
                              {!n.read && (
                                <span className="w-2 h-2 rounded-full bg-[#00843D] shrink-0 mt-1" />
                              )}
                            </div>
                            <p className="text-[11px] xs:text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed line-clamp-2">
                              {n.message}
                            </p>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="pt-2.5 xs:pt-3 border-t border-neutral-100 dark:border-neutral-800 mt-2.5 text-center">
                      <Link
                        to="/notificacoes"
                        onClick={() => setNotificationsOpen(false)}
                        className="text-[11px] xs:text-xs font-bold text-[#00843D] dark:text-green-400 hover:underline inline-flex items-center gap-1"
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
            </div>

            {/* Login / Cadastro or User Profile & Logout */}
            {currentUser.id === "guest_visitor" && !firebaseUser ? (
              <button
                onClick={() => {
                  vibrateClick();
                  setAuthModalOpen(true);
                }}
                role="button"
                aria-label="Entrar ou cadastrar conta"
                className="px-2.5 py-1.5 rounded-lg bg-[#00843D] hover:bg-[#006830] text-white text-xs font-bold transition-all shadow-xs flex items-center space-x-1 shrink-0 whitespace-nowrap"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Entrar</span>
              </button>
            ) : (
              <div className="user-profile-widget flex items-center space-x-0.5 sm:space-x-1 shrink-0">
                <Link
                  to="/perfil"
                  title={`Perfil: ${currentUser.name} • Cargo: ${currentUser.role === 'ADMIN' ? 'Administrador' : currentUser.role === 'SERVIDOR' ? 'Servidor / TAE' : 'Aluno'} • Campus Ivaiporã`}
                  className="flex items-center space-x-1.5 p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors shrink-0 group"
                >
                  <img
                    src={currentUser.avatarUrl}
                    alt={currentUser.name}
                    className="w-7 h-7 rounded-full object-cover border border-[#00843D] shrink-0"
                  />
                  <span className="hidden md:inline text-xs font-semibold text-neutral-700 dark:text-neutral-300 max-w-[80px] xl:max-w-[105px] truncate whitespace-nowrap group-hover:text-[#00843D] dark:group-hover:text-green-400">
                    {currentUser.name.split(" ")[0]}
                  </span>
                </Link>
                <button
                  onClick={() => {
                    vibrateClick();
                    logout();
                  }}
                  role="button"
                  aria-label="Sair da Conta"
                  title="Sair da Conta (Logout)"
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Mobile menu hamburger button */}
            <button
              onClick={() => {
                vibrateClick();
                setMobileMenuOpen(!mobileMenuOpen);
              }}
              role="button"
              aria-label={mobileMenuOpen ? "Fechar menu móvel" : "Abrir menu móvel"}
              aria-expanded={mobileMenuOpen}
              className="lg:hidden p-1.5 rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 shrink-0"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
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
            <span>Analisar Fotos com IA</span>
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
