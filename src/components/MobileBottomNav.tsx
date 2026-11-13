import React from "react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../context/RouterContext";
import { vibrateClick } from "../lib/utils";
import {
  Home,
  Search,
  PlusCircle,
  QrCode,
  UserCheck,
  LayoutDashboard,
  Building2,
} from "lucide-react";

export const MobileBottomNav: React.FC = () => {
  const { currentUser, requestAuthForRegistration, setQrScannerOpen } = useApp();
  const { routeKey, pathname, navigate } = useRouter();

  const handleTab = (path: string) => {
    vibrateClick();
    navigate(path);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleRegisterClick = () => {
    vibrateClick();
    if (requestAuthForRegistration()) {
      navigate("/cadastrar");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleQrClick = () => {
    vibrateClick();
    setQrScannerOpen(true);
  };

  const canRegister =
    (currentUser?.role === "SERVIDOR" && currentUser?.approvalStatus === "APROVADO") ||
    currentUser?.role === "ADMIN";
  const isCatalogActive =
    routeKey === "search" ||
    pathname === "/objetos" ||
    pathname === "/buscar" ||
    pathname === "/perdidos" ||
    pathname === "/encontrados" ||
    pathname === "/devolvidos";
  const isProfileOrPanelActive = routeKey === "profile" || routeKey === "admin";

  return (
    <nav
      role="navigation"
      aria-label="Barra de navegação inferior mobile PWA"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#111827]/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 px-2 pb-[env(safe-area-inset-bottom)]"
    >
      <div
        className={`max-w-md mx-auto grid ${
          canRegister ? "grid-cols-5" : "grid-cols-4"
        } items-center h-14`}
      >
        {/* 1. Início */}
        <button
          type="button"
          onClick={() => handleTab("/")}
          aria-label="Início"
          aria-current={routeKey === "home" ? "page" : undefined}
          className={`relative min-h-[44px] h-full flex flex-col items-center justify-center transition-colors cursor-pointer ${
            routeKey === "home"
              ? "text-[#16845B] dark:text-emerald-400 font-semibold"
              : "text-slate-500 dark:text-slate-400 hover:text-[#172B2A] dark:hover:text-white font-medium"
          }`}
        >
          {routeKey === "home" && (
            <span className="absolute top-0 inset-x-4 h-0.5 bg-[#16845B] dark:bg-emerald-400 rounded-b-full" />
          )}
          <Home className="w-5 h-5" />
          <span className="text-[10px] leading-tight mt-1">Início</span>
        </button>

        {/* 2. Catálogo */}
        <button
          type="button"
          onClick={() => handleTab("/objetos")}
          aria-label="Consultar Objetos"
          aria-current={isCatalogActive ? "page" : undefined}
          className={`relative min-h-[44px] h-full flex flex-col items-center justify-center transition-colors cursor-pointer ${
            isCatalogActive
              ? "text-[#16845B] dark:text-emerald-400 font-semibold"
              : "text-slate-500 dark:text-slate-400 hover:text-[#172B2A] dark:hover:text-white font-medium"
          }`}
        >
          {isCatalogActive && (
            <span className="absolute top-0 inset-x-4 h-0.5 bg-[#16845B] dark:bg-emerald-400 rounded-b-full" />
          )}
          <Search className="w-5 h-5" />
          <span className="text-[10px] leading-tight mt-1">Objetos</span>
        </button>

        {/* 3. Registrar (Restrito a Servidores aprovados e Administradores conforme regras RBAC) */}
        {canRegister && (
          <button
            type="button"
            onClick={handleRegisterClick}
            aria-label="Registrar item"
            aria-current={routeKey === "register" ? "page" : undefined}
            className={`relative min-h-[44px] h-full flex flex-col items-center justify-center transition-colors cursor-pointer ${
              routeKey === "register"
                ? "text-[#16845B] dark:text-emerald-400 font-semibold"
                : "text-slate-500 dark:text-slate-400 hover:text-[#172B2A] dark:hover:text-white font-medium"
            }`}
          >
            {routeKey === "register" && (
              <span className="absolute top-0 inset-x-4 h-0.5 bg-[#16845B] dark:bg-emerald-400 rounded-b-full" />
            )}
            <PlusCircle className="w-5 h-5" />
            <span className="text-[10px] leading-tight mt-1">Registrar</span>
          </button>
        )}

        {/* 4. Leitor QR Code */}
        <button
          type="button"
          onClick={handleQrClick}
          aria-label="Ler QR Code"
          className="relative min-h-[44px] h-full flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 hover:text-[#16845B] dark:hover:text-emerald-400 font-medium transition-colors cursor-pointer"
        >
          <QrCode className="w-5 h-5" />
          <span className="text-[10px] leading-tight mt-1">QR Code</span>
        </button>

        {/* 5. Perfil / Servidor / Admin */}
        <button
          type="button"
          onClick={() =>
            handleTab(
              currentUser.role === "ADMIN" || currentUser.role === "SERVIDOR"
                ? "/admin"
                : "/perfil"
            )
          }
          aria-label={
            currentUser.role === "ADMIN"
              ? "Painel Admin"
              : currentUser.role === "SERVIDOR"
              ? "Painel do Servidor"
              : "Meu Perfil"
          }
          aria-current={isProfileOrPanelActive ? "page" : undefined}
          className={`relative min-h-[44px] h-full flex flex-col items-center justify-center transition-colors cursor-pointer ${
            isProfileOrPanelActive
              ? "text-[#16845B] dark:text-emerald-400 font-semibold"
              : "text-slate-500 dark:text-slate-400 hover:text-[#172B2A] dark:hover:text-white font-medium"
          }`}
        >
          {isProfileOrPanelActive && (
            <span className="absolute top-0 inset-x-4 h-0.5 bg-[#16845B] dark:bg-emerald-400 rounded-b-full" />
          )}
          {currentUser.role === "ADMIN" ? (
            <LayoutDashboard className="w-5 h-5" />
          ) : currentUser.role === "SERVIDOR" ? (
            <Building2 className="w-5 h-5" />
          ) : (
            <UserCheck className="w-5 h-5" />
          )}
          <span className="text-[10px] leading-tight mt-1">
            {currentUser.role === "ADMIN"
              ? "Admin"
              : currentUser.role === "SERVIDOR"
              ? "Servidor"
              : "Perfil"}
          </span>
        </button>
      </div>
    </nav>
  );
};
