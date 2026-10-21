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
      className="lg:hidden fixed bottom-3 left-3 right-3 max-w-md mx-auto z-40 bg-white/95 dark:bg-[#0c121e]/95 backdrop-blur-xl border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-[0_10px_32px_rgba(0,0,0,0.15)] dark:shadow-[0_10px_32px_rgba(0,0,0,0.6)] px-2 py-1.5 transition-all"
    >
      <div className="grid grid-cols-5 items-center justify-around">
        {/* Início */}
        <button
          onClick={() => handleTab("/")}
          aria-label="Início"
          aria-current={routeKey === "home" ? "page" : undefined}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all cursor-pointer ${
            routeKey === "home"
              ? "text-[#00843D] dark:text-emerald-400 font-extrabold bg-[#00843D]/10 dark:bg-emerald-950/40"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <Home className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-bold tracking-tight">Início</span>
        </button>

        {/* Perdidos */}
        <button
          onClick={() => handleTab("/perdidos")}
          aria-label="Objetos Perdidos"
          aria-current={pathname === "/perdidos" ? "page" : undefined}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all cursor-pointer ${
            pathname === "/perdidos"
              ? "text-red-600 dark:text-red-400 font-extrabold bg-red-500/10 dark:bg-red-950/40"
              : "text-slate-500 dark:text-slate-400 hover:text-red-500"
          }`}
        >
          <PackageSearch className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-bold tracking-tight">Perdidos</span>
        </button>

        {/* Cadastrar (Center Highlight Action) */}
        <button
          onClick={handleRegisterClick}
          aria-label="Cadastrar novo item"
          aria-current={routeKey === "register" ? "page" : undefined}
          className="flex flex-col items-center justify-center -mt-5 group cursor-pointer"
        >
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-active:scale-90 ${
              routeKey === "register"
                ? "bg-[#006e33] text-white ring-4 ring-emerald-500/30 scale-105"
                : "bg-gradient-to-tr from-[#006e33] to-[#00843D] text-white hover:scale-105 shadow-[#00843D]/30"
            }`}
          >
            <PlusCircle className="w-6 h-6" />
          </div>
          <span className="text-[9px] font-black text-[#00843D] dark:text-emerald-400 mt-0.5 tracking-tight uppercase">
            Novo
          </span>
        </button>

        {/* Encontrados */}
        <button
          onClick={() => handleTab("/encontrados")}
          aria-label="Objetos Encontrados"
          aria-current={pathname === "/encontrados" ? "page" : undefined}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all cursor-pointer ${
            pathname === "/encontrados"
              ? "text-emerald-600 dark:text-emerald-400 font-extrabold bg-emerald-500/10 dark:bg-emerald-950/40"
              : "text-slate-500 dark:text-slate-400 hover:text-emerald-500"
          }`}
        >
          <CheckCircle2 className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-bold tracking-tight">Achados</span>
        </button>

        {/* Perfil / Admin */}
        <button
          onClick={() => handleTab(currentUser.role === "ADMIN" ? "/admin" : "/perfil")}
          aria-label={currentUser.role === "ADMIN" ? "Painel Admin" : "Meu Perfil"}
          aria-current={routeKey === "profile" || routeKey === "admin" ? "page" : undefined}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all cursor-pointer ${
            routeKey === "profile" || routeKey === "admin"
              ? "text-[#00843D] dark:text-emerald-400 font-extrabold bg-[#00843D]/10 dark:bg-emerald-950/40"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-900"
          }`}
        >
          {currentUser.role === "ADMIN" ? (
            <LayoutDashboard className="w-5 h-5 mb-0.5 text-purple-600 dark:text-purple-400" />
          ) : (
            <UserCheck className="w-5 h-5 mb-0.5" />
          )}
          <span className="text-[10px] font-bold tracking-tight">
            {currentUser.role === "ADMIN" ? "Admin" : "Perfil"}
          </span>
        </button>
      </div>
    </nav>
  );
};
