import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { useRouter, Link } from "../context/RouterContext";
import { vibrateClick } from "../lib/utils";
import { filterNotificationsForUser } from "../lib/notificationHelper";
import { usePWA } from "../hooks/usePWA";
import { ThemeToggle } from "./ThemeToggle";
import { ContactSupportModal } from "./ContactSupportModal";
import { getSafeAvatarUrl, handleAvatarError } from "../lib/avatarUtils";
import { BrandLogo, UIButton, UIBadge } from "./ui";
import {
  Search,
  PlusCircle,
  Home,
  PackageSearch,
  CheckCircle2,
  LayoutDashboard,
  UserCheck,
  Bell,
  QrCode,
  Menu,
  X,
  Building2,
  LogIn,
  LogOut,
  Smartphone,
  Download,
  WifiOff,
  RefreshCw,
  LifeBuoy,
  Settings,
  Layers,
  ExternalLink,
  GitBranch,
} from "lucide-react";

export const Navbar: React.FC = () => {
  const {
    currentUser,
    notifications,
    markNotificationRead,
    fcmPermissionGranted,
    requestNotificationPermission,
    setQrScannerOpen,
    setAuthModalOpen,
    firebaseUser,
    logout,
    isOnline,
    pendingSyncCount,
    syncOfflineQueue,
    items,
    setSelectedItemForDetail,
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

  const canRegister =
    (currentUser?.role === "SERVIDOR" && currentUser?.approvalStatus === "APROVADO") ||
    currentUser?.role === "ADMIN";

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
    <header
      role="banner"
      className="navbar-main-container sticky top-0 z-40 w-full border-b border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-[#111827]/95 backdrop-blur-md"
    >
      <div className="max-w-6xl mx-auto px-2.5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-15 gap-1.5 sm:gap-3">
          {/* Brand Lockup + Sync Status */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 min-w-0">
            <Link
              to="/"
              className="flex items-center cursor-pointer select-none group focus-visible:outline-none rounded-lg"
              title="Ir para a página inicial do Localiza+ IFPR"
            >
              <BrandLogo size="sm" showSubtitle={false} showIfprBadge />
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
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/70 text-amber-800 dark:text-amber-300 text-[11px] font-medium shrink-0"
              >
                <WifiOff className="w-3 h-3" />
                <span className="hidden xs:inline">Offline</span>
                {pendingSyncCount > 0 && (
                  <span className="font-bold tabular-nums">({pendingSyncCount})</span>
                )}
              </div>
            ) : pendingSyncCount > 0 ? (
              <button
                onClick={() => {
                  vibrateClick();
                  syncOfflineQueue(true);
                }}
                title="Sincronizar dados pendentes do IndexedDB com o Firestore"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#EBF5F0] hover:bg-[#16845B]/15 text-[#16845B] dark:bg-emerald-950/50 dark:text-emerald-300 text-[11px] font-medium transition-colors shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span className="tabular-nums">Sincronizar ({pendingSyncCount})</span>
              </button>
            ) : null}
          </div>

          {/* Extreme Minimal Desktop Navigation (Clean Typography Links) */}
          <nav
            role="navigation"
            aria-label="Navegação Principal do Sistema"
            className="hidden lg:flex items-center gap-6 shrink-0"
          >
            <Link
              to="/"
              aria-current={routeKey === "home" ? "page" : undefined}
              className={`py-1 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                routeKey === "home"
                  ? "border-[#16845B] text-[#172B2A] dark:text-white font-semibold"
                  : "border-transparent text-slate-600 dark:text-slate-400 hover:text-[#172B2A] dark:hover:text-white"
              }`}
            >
              Início
            </Link>

            <Link
              to="/objetos"
              aria-current={routeKey === "search" && (pathname === "/buscar" || pathname === "/objetos") ? "page" : undefined}
              className={`py-1 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                routeKey === "search" && (pathname === "/buscar" || pathname === "/objetos")
                  ? "border-[#16845B] text-[#172B2A] dark:text-white font-semibold"
                  : "border-transparent text-slate-600 dark:text-slate-400 hover:text-[#172B2A] dark:hover:text-white"
              }`}
            >
              Objetos
            </Link>

            <Link
              to="/encontrados"
              aria-current={pathname === "/encontrados" ? "page" : undefined}
              className={`py-1 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                pathname === "/encontrados"
                  ? "border-[#16845B] text-[#16845B] dark:text-emerald-400 font-semibold"
                  : "border-transparent text-slate-600 dark:text-slate-400 hover:text-[#16845B] dark:hover:text-emerald-400"
              }`}
            >
              Encontrados
            </Link>

            <Link
              to="/perdidos"
              aria-current={pathname === "/perdidos" ? "page" : undefined}
              className={`py-1 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                pathname === "/perdidos"
                  ? "border-rose-600 text-rose-700 dark:text-rose-400 font-semibold"
                  : "border-transparent text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
              }`}
            >
              Perdidos
            </Link>

            {(currentUser.role === "ADMIN" || currentUser.role === "SERVIDOR") && (
              <Link
                to="/admin"
                aria-current={routeKey === "admin" ? "page" : undefined}
                className={`py-1 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                  routeKey === "admin"
                    ? "border-[#16845B] text-[#16845B] dark:text-emerald-400 font-semibold"
                    : "border-transparent text-slate-600 dark:text-slate-400 hover:text-[#16845B] dark:hover:text-emerald-400"
                }`}
              >
                {currentUser.role === "ADMIN" ? "Admin" : "Painel do Servidor"}
              </Link>
            )}
          </nav>

          {/* Right Action Cluster */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Primary Action CTA: Novo Registro (Restricted to Approved SERVIDOR or ADMIN) */}
            {canRegister && (
              <Link
                to="/cadastrar"
                title="Cadastrar Novo Objeto Perdido ou Encontrado"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#16845B] hover:bg-[#064E3B] text-white text-xs font-medium transition-colors cursor-pointer"
              >
                <span>Registrar</span>
              </Link>
            )}

            {/* Quick Action Icons Group */}
            <div className="navbar-icons-group flex items-center gap-0.5 shrink-0">
              {/* Quick Support Link to /suporte - Desktop only */}
              <Link
                to="/suporte"
                id="navbar-quick-support-btn"
                title="Central de Suporte & Dúvidas"
                className={`hidden sm:inline-flex w-9 h-9 items-center justify-center rounded-lg transition-colors shrink-0 ${
                  routeKey === "support" || routeKey === "support_feedback" || routeKey === "support_bug"
                    ? "text-[#16845B] dark:text-emerald-400 bg-[#EBF5F0] dark:bg-emerald-950/50"
                    : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <LifeBuoy className="w-4 h-4" />
              </Link>

              {/* Quick QR Code Scanner Shortcut */}
              <button
                onClick={handleQrScannerClick}
                type="button"
                aria-label="Abrir Scanner de QR Code de Devolução"
                title="Escanear QR Code"
                className="hidden sm:inline-flex w-9 h-9 items-center justify-center rounded-lg text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
              >
                <QrCode className="w-4 h-4 text-[#16845B] dark:text-emerald-400" />
              </button>

              {/* Notifications Button & Dropdown */}
              <div className="relative shrink-0 flex items-center">
                <button
                  onClick={() => {
                    vibrateClick();
                    setNotificationsOpen(!notificationsOpen);
                  }}
                  type="button"
                  aria-label={`Notificações: ${unreadCount} não lidas`}
                  aria-expanded={notificationsOpen}
                  aria-haspopup="dialog"
                  className={`w-8 h-8 flex items-center justify-center rounded-xl transition-colors relative shrink-0 cursor-pointer ${
                    routeKey === "notifications" || notificationsOpen
                      ? "bg-[#EBF5F0] text-[#16845B] dark:bg-emerald-950/50 dark:text-emerald-400"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute top-0.5 right-0.5 min-w-[15px] h-[15px] px-1 bg-rose-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {/* Notifications Dropdown Drawer */}
                {notificationsOpen && (
                  <div
                    role="dialog"
                    aria-label="Painel de Notificações do IFPR"
                    className="absolute right-0 top-full mt-2 w-72 xs:w-80 sm:w-96 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-[#111827] rounded-2xl shadow-[0_12px_36px_rgba(23,43,42,0.12)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.6)] border border-slate-200 dark:border-slate-800 z-50 p-4"
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                      <h3 className="font-bold text-xs sm:text-sm text-[#172B2A] dark:text-white flex items-center gap-2">
                        <Bell className="w-4 h-4 text-[#16845B] dark:text-emerald-400" />
                        <span>Notificações</span>
                      </h3>
                      <button
                        onClick={() => {
                          vibrateClick();
                          setNotificationsOpen(false);
                          navigate("/notificacoes");
                        }}
                        className="text-xs text-[#16845B] dark:text-emerald-400 hover:underline font-semibold cursor-pointer"
                      >
                        Ver todas
                      </button>
                    </div>

                    {/* FCM Push Notification Request Button */}
                    {!fcmPermissionGranted && (
                      <div className="mt-3 p-2.5 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/40 border border-[#16845B]/20 flex items-center justify-between gap-2">
                        <div className="text-[11px] text-[#064E3B] dark:text-emerald-300 font-medium">
                          Ative alertas em tempo real no navegador.
                        </div>
                        <button
                          onClick={() => {
                            vibrateClick();
                            requestNotificationPermission();
                          }}
                          className="px-2.5 py-1 rounded-lg bg-[#16845B] hover:bg-[#064E3B] text-white font-semibold text-[10px] shrink-0 transition-colors cursor-pointer"
                        >
                          Ativar Push
                        </button>
                      </div>
                    )}

                    <div className="mt-3 space-y-2 max-h-64 sm:max-h-72 overflow-y-auto pr-1">
                      {userNotifications.length === 0 ? (
                        <p className="text-xs text-center py-6 text-slate-500 dark:text-slate-400">
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
                                ? "bg-[#EBF5F0]/60 border-[#16845B]/25 dark:bg-emerald-950/30 dark:border-emerald-800/60 hover:bg-[#EBF5F0]"
                                : "bg-[#F8FAFC] dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                            }`}
                          >
                            <div className="flex justify-between items-start font-semibold text-[#172B2A] dark:text-white mb-1">
                              <span className="truncate pr-2">{n.title}</span>
                              {!n.read && (
                                <span className="w-2 h-2 rounded-full bg-[#16845B] shrink-0 mt-1" />
                              )}
                            </div>
                            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">
                              {n.message}
                            </p>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 mt-3 text-center">
                      <Link
                        to="/notificacoes"
                        onClick={() => setNotificationsOpen(false)}
                        className="text-xs font-semibold text-[#16845B] dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
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
              <UIButton
                variant="primary"
                size="sm"
                className="!px-2.5 sm:!px-3"
                onClick={() => {
                  vibrateClick();
                  setAuthModalOpen(true);
                }}
                aria-label="Entrar ou cadastrar conta"
              >
                <LogIn className="w-3.5 h-3.5 hidden min-[380px]:inline-block" />
                <span>Entrar</span>
              </UIButton>
            ) : (
              <div className="user-profile-widget flex items-center gap-1 shrink-0">
                <Link
                  to="/perfil"
                  title={`Perfil: ${currentUser.name} • Cargo: ${
                    currentUser.role === "ADMIN"
                      ? "Administrador"
                      : currentUser.role === "SERVIDOR"
                      ? "Servidor / TAE"
                      : "Aluno"
                  } • Campus Ivaiporã`}
                  className="flex items-center gap-1.5 p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 group"
                >
                  <img
                    src={getSafeAvatarUrl(currentUser.avatarUrl, currentUser.name)}
                    alt={currentUser.name}
                    referrerPolicy="no-referrer"
                    onError={(e) => handleAvatarError(e, currentUser.name)}
                    className="w-7 h-7 rounded-full object-cover border border-[#16845B]/50 shrink-0"
                  />
                  <span className="hidden xl:inline text-xs font-semibold text-[#172B2A] dark:text-slate-200 max-w-[96px] truncate whitespace-nowrap group-hover:text-[#16845B] dark:group-hover:text-emerald-400">
                    {currentUser.name.split(" ")[0]}
                  </span>
                </Link>
                <button
                  onClick={() => {
                    vibrateClick();
                    logout();
                  }}
                  type="button"
                  aria-label="Sair da Conta"
                  title="Sair da Conta (Logout)"
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors shrink-0 cursor-pointer"
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
              type="button"
              aria-label={mobileMenuOpen ? "Fechar menu móvel" : "Abrir menu móvel"}
              aria-expanded={mobileMenuOpen}
              className="lg:hidden p-1.5 sm:p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
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
            className="fixed inset-0 top-14 sm:top-15 bg-[#172B2A]/40 dark:bg-black/60 backdrop-blur-xs z-30 lg:hidden animate-in fade-in duration-150"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          <div
            role="navigation"
            aria-label="Menu Móvel de Navegação"
            className="lg:hidden fixed top-14 sm:top-15 right-0 left-0 max-h-[calc(100dvh-3.5rem)] overflow-y-auto overscroll-contain bg-white dark:bg-[#111827] border-b border-slate-200 dark:border-slate-800 z-40 shadow-xl animate-in slide-in-from-top-2 duration-200 p-4 pb-20 space-y-4"
          >
            {/* User Session Row */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={getSafeAvatarUrl(currentUser.avatarUrl, currentUser.name)}
                  alt={currentUser.name}
                  referrerPolicy="no-referrer"
                  onError={(e) => handleAvatarError(e, currentUser.name)}
                  className="w-9 h-9 rounded-full object-cover border border-[#16845B]/50 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#172B2A] dark:text-white truncate">
                    {currentUser.name}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                    {currentUser.role === "ADMIN"
                      ? "Administrador TI • IFPR"
                      : currentUser.role === "SERVIDOR"
                      ? "Servidor / Portaria"
                      : "Discente / Aluno IFPR"}
                  </p>
                </div>
              </div>

              {currentUser.id === "guest_visitor" && !firebaseUser ? (
                <UIButton
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    vibrateClick();
                    setAuthModalOpen(true);
                    setMobileMenuOpen(false);
                  }}
                >
                  <span>Entrar</span>
                </UIButton>
              ) : (
                <button
                  onClick={() => {
                    vibrateClick();
                    logout();
                    setMobileMenuOpen(false);
                  }}
                  title="Sair da conta"
                  aria-label="Sair da conta"
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors shrink-0 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Quick Registration Row: Visible only to profiles authorized to register items */}
            {canRegister && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleRegisterClick("PERDIDO")}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 border border-rose-200 dark:border-rose-800/60 transition-all cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Perdi um Objeto</span>
                </button>

                <button
                  onClick={() => handleRegisterClick("ENCONTRADO")}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold text-[#064E3B] dark:text-emerald-300 bg-[#EBF5F0] dark:bg-emerald-950/50 hover:bg-[#16845B]/15 border border-[#16845B]/25 transition-all cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Achei um Objeto</span>
                </button>
              </div>
            )}

            {/* Group 1: Navegação Principal */}
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block px-2.5 pb-1">
                Navegação
              </span>

              <button
                onClick={() => handleNavClick("/buscar")}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                  routeKey === "search"
                    ? "bg-[#EBF5F0] dark:bg-emerald-950/50 text-[#16845B] dark:text-emerald-400 font-semibold"
                    : "text-[#172B2A] dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Search className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <span>Catálogo de Achados & Perdidos</span>
                </div>
                <span className="text-[11px] text-slate-400 tabular-nums">{items.length} itens</span>
              </button>

              <button
                onClick={() => handleNavClick("/meus-registros")}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                  routeKey === "my_items"
                    ? "bg-[#EBF5F0] dark:bg-emerald-950/50 text-[#16845B] dark:text-emerald-400 font-semibold"
                    : "text-[#172B2A] dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                }`}
              >
                <Layers className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Meus Registros & Ocorrências</span>
              </button>
            </div>

            {/* Group 2: Ferramentas do Campus */}
            <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block px-2.5 pb-1">
                Ferramentas do Campus
              </span>

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleQrScannerClick();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium text-[#172B2A] dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
              >
                <QrCode className="w-4 h-4 text-[#16845B] dark:text-emerald-400" />
                <span>Leitor de QR Code</span>
              </button>
            </div>

            {/* Group 3: Administração & Gestão (Restricted) */}
            {(currentUser.role === "ADMIN" || currentUser.role === "SERVIDOR") && (
              <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block px-2.5 pb-1">
                  {currentUser.role === "ADMIN" ? "Administração & TI" : "Gestão do Servidor"}
                </span>

                <button
                  onClick={() => handleNavClick("/admin")}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    routeKey === "admin"
                      ? "bg-[#16845B] text-white"
                      : "text-[#16845B] dark:text-emerald-400 hover:bg-[#EBF5F0] dark:hover:bg-emerald-950/40"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
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
                  <UIBadge tone="emerald">{currentUser.role}</UIBadge>
                </button>
              </div>
            )}

            {/* Group 4: Conta, Suporte & Sistema */}
            <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block px-2.5 pb-1">
                Conta & Apoio
              </span>

              <button
                onClick={() => handleNavClick("/perfil")}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                  routeKey === "profile"
                    ? "bg-[#EBF5F0] dark:bg-emerald-950/50 text-[#16845B] dark:text-emerald-400 font-semibold"
                    : "text-[#172B2A] dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                }`}
              >
                <UserCheck className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Meu Perfil</span>
              </button>

              <button
                onClick={() => handleNavClick("/configuracoes")}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                  routeKey === "settings"
                    ? "bg-[#EBF5F0] dark:bg-emerald-950/50 text-[#16845B] dark:text-emerald-400 font-semibold"
                    : "text-[#172B2A] dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                }`}
              >
                <Settings className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Configurações & Acessibilidade</span>
              </button>

              <button
                onClick={() => handleNavClick("/suporte")}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                  routeKey === "support"
                    ? "bg-[#EBF5F0] dark:bg-emerald-950/50 text-[#16845B] dark:text-emerald-400 font-semibold"
                    : "text-[#172B2A] dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                }`}
              >
                <LifeBuoy className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Central de Suporte & Dúvidas</span>
              </button>

              <button
                onClick={() => handleNavClick("/versoes")}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                  pathname === "/versoes" || routeKey === "versions"
                    ? "bg-[#EBF5F0] dark:bg-emerald-950/50 text-[#16845B] dark:text-emerald-400 font-semibold"
                    : "text-[#172B2A] dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60"
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
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold text-[#064E3B] dark:text-emerald-300 bg-[#EBF5F0] dark:bg-emerald-950/40 hover:bg-[#16845B]/15 transition-colors cursor-pointer mt-1"
                >
                  <div className="flex items-center gap-2.5">
                    <Smartphone className="w-4 h-4 text-[#16845B] dark:text-emerald-400" />
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
