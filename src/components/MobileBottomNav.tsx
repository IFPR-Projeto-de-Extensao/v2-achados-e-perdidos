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
      className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-[#161616]/95 backdrop-blur-lg border-t border-neutral-200 dark:border-neutral-800 px-2 py-1.5 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)] pb-[calc(0.375rem+env(safe-area-inset-bottom))]"
    >
      <div className="max-w-md mx-auto grid grid-cols-5 items-center justify-around">
        {/* Início */}
        <button
          onClick={() => handleTab("/")}
          aria-label="Início"
          aria-current={routeKey === "home" ? "page" : undefined}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all ${
            routeKey === "home"
              ? "text-[#00843D] dark:text-green-400 font-bold scale-105"
              : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
          }`}
        >
          <Home className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] tracking-tight">Início</span>
        </button>

        {/* Perdidos */}
        <button
          onClick={() => handleTab("/perdidos")}
          aria-label="Objetos Perdidos"
          aria-current={pathname === "/perdidos" ? "page" : undefined}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all ${
            pathname === "/perdidos"
              ? "text-[#EF4444] dark:text-red-400 font-bold scale-105"
              : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
          }`}
        >
          <PackageSearch className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] tracking-tight">Perdidos</span>
        </button>

        {/* Cadastrar (Center Highlight Button) */}
        <button
          onClick={handleRegisterClick}
          aria-label="Cadastrar novo item"
          aria-current={routeKey === "register" ? "page" : undefined}
          className="flex flex-col items-center justify-center -mt-4 group"
        >
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform group-active:scale-90 ${
              routeKey === "register"
                ? "bg-[#006e33] text-white ring-4 ring-[#00843D]/20 scale-105"
                : "bg-[#00843D] text-white hover:bg-[#006e33] shadow-[#00843D]/30"
            }`}
          >
            <PlusCircle className="w-6 h-6" />
          </div>
          <span className="text-[9px] font-bold text-[#00843D] dark:text-green-400 mt-0.5 tracking-tight">
            Cadastrar
          </span>
        </button>

        {/* Encontrados */}
        <button
          onClick={() => handleTab("/encontrados")}
          aria-label="Objetos Encontrados"
          aria-current={pathname === "/encontrados" ? "page" : undefined}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all ${
            pathname === "/encontrados"
              ? "text-[#22C55E] dark:text-green-400 font-bold scale-105"
              : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
          }`}
        >
          <CheckCircle2 className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] tracking-tight">Achados</span>
        </button>

        {/* Perfil / Admin */}
        <button
          onClick={() => handleTab(currentUser.role === "ADMIN" ? "/admin" : "/perfil")}
          aria-label={currentUser.role === "ADMIN" ? "Painel Admin" : "Meu Perfil"}
          aria-current={routeKey === "profile" || routeKey === "admin" ? "page" : undefined}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all ${
            routeKey === "profile" || routeKey === "admin"
              ? "text-[#00843D] dark:text-green-400 font-bold scale-105"
              : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
          }`}
        >
          {currentUser.role === "ADMIN" ? (
            <LayoutDashboard className="w-5 h-5 mb-0.5 text-amber-500" />
          ) : (
            <UserCheck className="w-5 h-5 mb-0.5" />
          )}
          <span className="text-[10px] tracking-tight">
            {currentUser.role === "ADMIN" ? "Admin" : "Perfil"}
          </span>
        </button>
      </div>
    </nav>
  );
};
