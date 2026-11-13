import React from "react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../context/RouterContext";
import { vibrateClick } from "../lib/utils";
import {
  Home,
  PackageSearch,
  CheckCircle2,
  PlusCircle,
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

  const isAluno = currentUser?.role === "ALUNO";

  return (
    <nav
      role="navigation"
      aria-label="Barra de navegação inferior mobile PWA"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#111827]/95 backdrop-blur-md border-t border-slate-200/90 dark:border-slate-800 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-2px_12px_rgba(23,43,42,0.05)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.45)]"
    >
      <div
        className={`max-w-md mx-auto grid ${
          isAluno ? "grid-cols-4" : "grid-cols-5"
        } items-center gap-1`}
      >
        {/* Início */}
        <button
          type="button"
          onClick={() => handleTab("/")}
          aria-label="Início"
          aria-current={routeKey === "home" ? "page" : undefined}
          className={`min-h-[44px] flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all cursor-pointer ${
            routeKey === "home"
              ? "text-[#16845B] dark:text-emerald-400 font-semibold bg-[#EBF5F0] dark:bg-emerald-950/50"
              : "text-slate-500 dark:text-slate-400 hover:text-[#172B2A] dark:hover:text-white"
          }`}
        >
          <Home className="w-4.5 h-4.5 mb-0.5" />
          <span className="text-[10px] tracking-tight">Início</span>
        </button>

        {/* Perdidos */}
        <button
          type="button"
          onClick={() => handleTab("/perdidos")}
          aria-label="Objetos Perdidos"
          aria-current={pathname === "/perdidos" ? "page" : undefined}
          className={`min-h-[44px] flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all cursor-pointer ${
            pathname === "/perdidos"
              ? "text-rose-700 dark:text-rose-400 font-semibold bg-rose-50 dark:bg-rose-950/50"
              : "text-slate-500 dark:text-slate-400 hover:text-rose-600"
          }`}
        >
          <PackageSearch className="w-4.5 h-4.5 mb-0.5" />
          <span className="text-[10px] tracking-tight">Perdidos</span>
        </button>

        {/* Cadastrar (Center Action - Restricted from ALUNO) */}
        {!isAluno && (
          <button
            type="button"
            onClick={handleRegisterClick}
            aria-label="Cadastrar novo item"
            aria-current={routeKey === "register" ? "page" : undefined}
            className="min-h-[44px] flex flex-col items-center justify-center py-0.5 cursor-pointer group"
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-2xs transition-transform group-active:scale-95 ${
                routeKey === "register"
                  ? "bg-[#064E3B] text-white ring-2 ring-[#16845B]/40"
                  : "bg-[#16845B] text-white hover:bg-[#064E3B]"
              }`}
            >
              <PlusCircle className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-semibold text-[#16845B] dark:text-emerald-400 mt-0.5 tracking-tight">
              Registrar
            </span>
          </button>
        )}

        {/* Encontrados */}
        <button
          type="button"
          onClick={() => handleTab("/encontrados")}
          aria-label="Objetos Encontrados"
          aria-current={pathname === "/encontrados" ? "page" : undefined}
          className={`min-h-[44px] flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all cursor-pointer ${
            pathname === "/encontrados"
              ? "text-[#16845B] dark:text-emerald-400 font-semibold bg-[#EBF5F0] dark:bg-emerald-950/50"
              : "text-slate-500 dark:text-slate-400 hover:text-[#16845B]"
          }`}
        >
          <CheckCircle2 className="w-4.5 h-4.5 mb-0.5" />
          <span className="text-[10px] tracking-tight">Achados</span>
        </button>

        {/* Perfil / Admin / Servidor */}
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
          aria-current={routeKey === "profile" || routeKey === "admin" ? "page" : undefined}
          className={`min-h-[44px] flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all cursor-pointer ${
            routeKey === "profile" || routeKey === "admin"
              ? "text-[#16845B] dark:text-emerald-400 font-semibold bg-[#EBF5F0] dark:bg-emerald-950/50"
              : "text-slate-500 dark:text-slate-400 hover:text-[#172B2A] dark:hover:text-white"
          }`}
        >
          {currentUser.role === "ADMIN" ? (
            <LayoutDashboard className="w-4.5 h-4.5 mb-0.5 text-[#16845B] dark:text-emerald-400" />
          ) : currentUser.role === "SERVIDOR" ? (
            <Building2 className="w-4.5 h-4.5 mb-0.5 text-[#16845B] dark:text-emerald-400" />
          ) : (
            <UserCheck className="w-4.5 h-4.5 mb-0.5" />
          )}
          <span className="text-[10px] tracking-tight">
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
