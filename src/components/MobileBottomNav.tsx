import React from "react";
import { useApp } from "../context/AppContext";
import { useRouter, Link } from "../context/RouterContext";
import { vibrateClick } from "../lib/utils";
import {
  Home,
  PackageSearch,
  CheckCircle2,
  PlusCircle,
  Sparkles,
  UserCheck,
  LayoutDashboard,
  Building2,
} from "lucide-react";

export const MobileBottomNav: React.FC = () => {
  const { currentUser, requestAuthForRegistration } = useApp();
  const { routeKey, pathname, navigate } = useRouter();

  const handleTab = (path: string) => {
    vibrateClick();
    navigate(path);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleRegisterClick = () => {
    vibrateClick();
    requestAuthForRegistration();
    navigate("/cadastrar");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <nav
      role="navigation"
      aria-label="Barra de navegação inferior mobile PWA"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0b1019]/95 backdrop-blur-xl border-t border-slate-200/90 dark:border-slate-800/90 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.4)]"
    >
      <div className="max-w-md mx-auto grid grid-cols-5 items-center justify-around">
        {/* Início */}
        <button
          onClick={() => handleTab("/")}
          aria-label="Início"
          aria-current={routeKey === "home" ? "page" : undefined}
          className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all cursor-pointer ${
            routeKey === "home"
              ? "text-[#00843D] dark:text-emerald-400 font-bold bg-[#00843D]/10 dark:bg-emerald-950/40"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <Home className="w-4.5 h-4.5 mb-0.5" />
          <span className="text-[10px] font-semibold tracking-tight">Início</span>
        </button>

        {/* Perdidos */}
        <button
          onClick={() => handleTab("/perdidos")}
          aria-label="Objetos Perdidos"
          aria-current={pathname === "/perdidos" ? "page" : undefined}
          className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all cursor-pointer ${
            pathname === "/perdidos"
              ? "text-red-600 dark:text-red-400 font-bold bg-red-500/10 dark:bg-red-950/40"
              : "text-slate-500 dark:text-slate-400 hover:text-red-500"
          }`}
        >
          <PackageSearch className="w-4.5 h-4.5 mb-0.5" />
          <span className="text-[10px] font-semibold tracking-tight">Perdidos</span>
        </button>

        {/* Cadastrar (Center Action - perfectly integrated) */}
        <button
          onClick={handleRegisterClick}
          aria-label="Cadastrar novo item"
          aria-current={routeKey === "register" ? "page" : undefined}
          className="flex flex-col items-center justify-center py-0.5 cursor-pointer group"
        >
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-xs transition-transform group-active:scale-95 ${
              routeKey === "register"
                ? "bg-[#00843D] text-white ring-2 ring-emerald-500/40"
                : "bg-[#00843D] text-white hover:bg-[#006e33]"
            }`}
          >
            <PlusCircle className="w-5 h-5" />
          </div>
          <span className="text-[9px] font-bold text-[#00843D] dark:text-emerald-400 mt-0.5 tracking-tight uppercase">
            Novo
          </span>
        </button>

        {/* Encontrados */}
        <button
          onClick={() => handleTab("/encontrados")}
          aria-label="Objetos Encontrados"
          aria-current={pathname === "/encontrados" ? "page" : undefined}
          className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all cursor-pointer ${
            pathname === "/encontrados"
              ? "text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 dark:bg-emerald-950/40"
              : "text-slate-500 dark:text-slate-400 hover:text-emerald-500"
          }`}
        >
          <CheckCircle2 className="w-4.5 h-4.5 mb-0.5" />
          <span className="text-[10px] font-semibold tracking-tight">Achados</span>
        </button>

        {/* Perfil / Admin / Servidor */}
        <button
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
          aria-current={routeKey === "profile" || routeKey === "admin" ? "page" : undefined}
          className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all cursor-pointer ${
            routeKey === "profile" || routeKey === "admin"
              ? "text-[#00843D] dark:text-emerald-400 font-bold bg-[#00843D]/10 dark:bg-emerald-950/40"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-900"
          }`}
        >
          {currentUser.role === "ADMIN" ? (
            <LayoutDashboard className="w-4.5 h-4.5 mb-0.5 text-[#00843D] dark:text-emerald-400" />
          ) : currentUser.role === "SERVIDOR" ? (
            <Building2 className="w-4.5 h-4.5 mb-0.5 text-[#00843D] dark:text-emerald-400" />
          ) : (
            <UserCheck className="w-4.5 h-4.5 mb-0.5" />
          )}
          <span className="text-[10px] font-semibold tracking-tight">
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
