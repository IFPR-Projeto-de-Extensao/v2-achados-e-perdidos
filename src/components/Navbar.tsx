import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { useRouter, Link } from "../context/RouterContext";
import { triggerVibration, vibrateClick, vibrateSuccess } from "../lib/utils";
import { filterNotificationsForUser } from "../lib/notificationHelper";
import { usePWA } from "../hooks/usePWA";
import { ThemeToggle } from "./ThemeToggle";
import { ContactSupportModal } from "./ContactSupportModal";
import { getSafeAvatarUrl, handleAvatarError } from "../lib/avatarUtils";
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
  GitBranch,
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
    <header role="banner" className="navbar-main-container sticky top-0 z-40 w-full border-b border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-[#0a0f18]/90 backdrop-blur-xl transition-colors duration-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
      {/* Top Emerald Accent Line IFPR */}
      <div className="h-[2.5px] w-full bg-gradient-to-r from-[#00843D] via-emerald-400 to-[#00843D]" />

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-15 sm:h-16 gap-2 sm:gap-4">
          {/* Brand Lockup */}
          <div className="flex items-center space-x-3 shrink-0">
            <Link
              to="/"
              className="flex items-center space-x-2.5 cursor-pointer select-none group"
              title="Ir para a página inicial do Localiza+ IFPR"
            >
              <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20 group-hover:scale-105 transition-all shrink-0">
                <img
                  src="/ifpr-logo.svg"
                  alt="IFPR Logo"
                  className="w-5 h-5 object-contain select-none drop-shadow-xs"
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-1.5">
                  <span className="font-black text-base sm:text-lg tracking-tight text-slate-900 dark:text-white uppercase">
                    Localiza<span className="text-[#00843D] dark:text-emerald-400">+</span>
                  </span>
                  <span className="px-1.5 py-0.5 text-[9px] font-black rounded-md bg-[#00843D] text-white tracking-widest uppercase">
                    IFPR
                  </span>
                </div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider hidden sm:block">
                  Campus Ivaiporã
                </p>
              </div>
            </Link>

            {/* Offline Sync Status Badge */}
            {!isOnline ? (
              <div
                role="status"
                aria-live="polite"
                title={
                  pendingSyncCount > 0
                    ? `Modo Offline ativado. ${pendingSyncCount} ocorrência(s) salva(s) aguardando sincronização.`
                    : "Modo Offline: Registros salvos localmente com segurança."
                }
                className="hidden md:flex items-center space-x-1.5 px-2 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[10px] font-extrabold shrink-0"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                <WifiOff className="w-3 h-3" />
                <span>Offline</span>
                {pendingSyncCount > 0 && (
                  <span className="px-1.5 rounded-full bg-amber-500 text-white text-[9px]">
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
                className="hidden md:flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-[#00843D]/10 hover:bg-[#00843D]/20 border border-[#00843D]/30 text-[#00843D] dark:text-emerald-400 text-[10px] font-extrabold transition-colors animate-pulse shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Sincronizar ({pendingSyncCount})</span>
              </button>
            ) : null}
          </div>

          {/* Segmented Desktop Navigation */}
          <nav role="navigation" aria-label="Navegação Principal do Sistema" className="hidden lg:flex items-center p-1 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 shrink-0 space-x-0.5">
            <Link
              to="/"
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                routeKey === "home"
                  ? "bg-white dark:bg-slate-900 text-[#00843D] dark:text-emerald-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              <span>Início</span>
            </Link>

            <Link
              to="/buscar"
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                routeKey === "search"
                  ? "bg-white dark:bg-slate-900 text-[#00843D] dark:text-emerald-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Catálogo</span>
            </Link>

            <Link
              to="/perdidos"
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                pathname === "/perdidos"
                  ? "bg-red-500/15 text-red-600 dark:text-red-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-300 hover:text-red-600"
              }`}
            >
              <PackageSearch className="w-3.5 h-3.5 text-red-500" />
              <span>Perdidos</span>
            </Link>

            <Link
              to="/encontrados"
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                pathname === "/encontrados"
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-300 hover:text-emerald-600"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Achados</span>
            </Link>

            {(currentUser.role === "ADMIN" || currentUser.role === "SERVIDOR") && (
              <Link
                to="/admin"
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                  routeKey === "admin"
                    ? currentUser.role === "ADMIN"
                      ? "bg-purple-600 text-white shadow-xs"
                      : "bg-[#00843D] text-white shadow-xs"
                    : currentUser.role === "ADMIN"
                    ? "text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
                    : "text-[#00843D] dark:text-emerald-400 hover:bg-[#00843D]/10"
                }`}
              >
                {currentUser.role === "ADMIN" ? (
                  <>
                    <LayoutDashboard className="w-3.5 h-3.5" />
                    <span>Admin</span>
                  </>
                ) : (
                  <>
                    <Building2 className="w-3.5 h-3.5" />
                    <span>Painel do Servidor</span>
                  </>
                )}
              </Link>
            )}
          </nav>

          {/* Right Action Cluster */}
          <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
            {/* Primary Action CTA: Novo Registro */}
            {currentUser?.role !== "ALUNO" && (
              <Link
                to="/cadastrar"
                title="Cadastrar Novo Objeto Perdido ou Encontrado"
                className="hidden sm:inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white text-xs font-black tracking-wide uppercase shadow-[0_2px_10px_rgba(0,132,61,0.28)] transition-all cursor-pointer active:scale-95"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Novo Registro</span>
              </Link>
            )}
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
                    src={getSafeAvatarUrl(currentUser.avatarUrl, currentUser.name)}
                    alt={currentUser.name}
                    referrerPolicy="no-referrer"
                    onError={(e) => handleAvatarError(e, currentUser.name)}
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

      {/* Mobile Hierarchical Navigation Drawer */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 top-[57px] bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs z-30 lg:hidden animate-in fade-in duration-150"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          <div
            role="navigation"
            aria-label="Menu Móvel de Navegação"
            className="lg:hidden fixed top-[57px] right-0 left-0 max-h-[calc(100vh-4.25rem)] overflow-y-auto bg-white/98 dark:bg-[#0c121e]/98 backdrop-blur-xl border-b border-slate-200/90 dark:border-slate-800/90 z-40 shadow-2xl animate-in slide-in-from-top-2 duration-200 p-4 space-y-3.5"
          >
            {/* User Session Row */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center space-x-2.5 min-w-0">
                <img
                  src={getSafeAvatarUrl(currentUser.avatarUrl, currentUser.name)}
                  alt={currentUser.name}
                  referrerPolicy="no-referrer"
                  onError={(e) => handleAvatarError(e, currentUser.name)}
                  className="w-9 h-9 rounded-full object-cover border border-[#00843D]/50 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {currentUser.name}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate">
                    {currentUser.role === "ADMIN"
                      ? "Administrador TI • IFPR"
                      : currentUser.role === "SERVIDOR"
                      ? "Servidor / Portaria"
                      : "Discente / Aluno IFPR"}
                  </p>
                </div>
              </div>

              {currentUser.id === "guest_visitor" && !firebaseUser ? (
                <button
                  onClick={() => {
                    vibrateClick();
                    setAuthModalOpen(true);
                    setMobileMenuOpen(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#00843D] hover:bg-[#006e33] text-white text-xs font-bold shadow-xs shrink-0 cursor-pointer transition-colors"
                >
                  Entrar
                </button>
              ) : (
                <button
                  onClick={() => {
                    vibrateClick();
                    logout();
                    setMobileMenuOpen(false);
                  }}
                  title="Sair da conta"
                  aria-label="Sair da conta"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Quick Registration Row: Compact dual-action */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleRegisterClick("PERDIDO")}
                className="flex items-center justify-center space-x-2 px-3 py-2 rounded-xl text-xs font-bold text-red-600 dark:text-red-400 bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 transition-all cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Perdi um Objeto</span>
              </button>

              <button
                onClick={() => handleRegisterClick("ENCONTRADO")}
                className="flex items-center justify-center space-x-2 px-3 py-2 rounded-xl text-xs font-bold text-[#00843D] dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/15 border border-[#00843D]/25 transition-all cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Achei um Objeto</span>
              </button>
            </div>

            {/* Group 1: Navegação Principal */}
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block px-2.5 pb-1">
                Navegação
              </span>

              <button
                onClick={() => handleNavClick("/buscar")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  routeKey === "search"
                    ? "bg-emerald-500/10 text-[#00843D] dark:text-emerald-400 font-bold border-l-2 border-[#00843D]"
                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <Search className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <span>Catálogo de Achados & Perdidos</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">{items.length} itens</span>
              </button>

              <button
                onClick={() => handleNavClick("/meus-registros")}
                className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  routeKey === "my_items"
                    ? "bg-emerald-500/10 text-[#00843D] dark:text-emerald-400 font-bold border-l-2 border-[#00843D]"
                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                }`}
              >
                <Layers className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Meus Registros & Ocorrências</span>
              </button>
            </div>

            {/* Group 2: Ferramentas Inteligentes */}
            <div className="space-y-0.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block px-2.5 pb-1">
                Ferramentas do Campus
              </span>

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleQrScannerClick();
                }}
                className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
              >
                <QrCode className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Leitor de QR Code</span>
              </button>
            </div>

            {/* Group 3: Administração & Gestão (Restricted) */}
            {(currentUser.role === "ADMIN" || currentUser.role === "SERVIDOR") && (
              <div className="space-y-0.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block px-2.5 pb-1">
                  {currentUser.role === "ADMIN" ? "Administração & TI" : "Gestão do Servidor"}
                </span>

                <button
                  onClick={() => handleNavClick("/admin")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                    routeKey === "admin"
                      ? "bg-[#00843D] text-white"
                      : "text-[#00843D] dark:text-emerald-400 hover:bg-emerald-500/10"
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    {currentUser.role === "SERVIDOR" ? (
                      <Building2 className="w-4 h-4" />
                    ) : (
                      <LayoutDashboard className="w-4 h-4" />
                    )}
                    <span>
                      {currentUser.role === "SERVIDOR"
                        ? "Painel do Servidor"
                        : "Painel Administrativo Institucional"}
                    </span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-700/20 dark:bg-emerald-400/20">
                    {currentUser.role}
                  </span>
                </button>
              </div>
            )}

            {/* Group 4: Conta, Suporte & Sistema */}
            <div className="space-y-0.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block px-2.5 pb-1">
                Conta & Apoio
              </span>

              <button
                onClick={() => handleNavClick("/perfil")}
                className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  routeKey === "profile"
                    ? "bg-emerald-500/10 text-[#00843D] dark:text-emerald-400 font-bold border-l-2 border-[#00843D]"
                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                }`}
              >
                <UserCheck className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Meu Perfil</span>
              </button>

              <button
                onClick={() => handleNavClick("/configuracoes")}
                className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  routeKey === "settings"
                    ? "bg-emerald-500/10 text-[#00843D] dark:text-emerald-400 font-bold border-l-2 border-[#00843D]"
                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                }`}
              >
                <Settings className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Configurações & Acessibilidade</span>
              </button>

              <button
                onClick={() => handleNavClick("/suporte")}
                className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  routeKey === "support"
                    ? "bg-emerald-500/10 text-[#00843D] dark:text-emerald-400 font-bold border-l-2 border-[#00843D]"
                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                }`}
              >
                <LifeBuoy className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Central de Suporte & Dúvidas</span>
              </button>

              <button
                onClick={() => handleNavClick("/versoes")}
                className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  pathname === "/versoes" || routeKey === "versions"
                    ? "bg-emerald-500/10 text-[#00843D] dark:text-emerald-400 font-bold border-l-2 border-[#00843D]"
                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                }`}
              >
                <GitBranch className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Histórico de Versões</span>
              </button>

              {!isInstalled && (
                <button
                  onClick={() => {
                    promptInstall();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-[#00843D] dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/15 transition-colors cursor-pointer"
                >
                  <div className="flex items-center space-x-2.5">
                    <Smartphone className="w-4 h-4" />
                    <span>Instalar Aplicativo (PWA)</span>
                  </div>
                  <Download className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </>
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
