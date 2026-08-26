import React from "react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../context/RouterContext";
import { useAdminGuard, UseAdminGuardOptions } from "../hooks/useAdminGuard";
import { ShieldAlert, LogIn, Home, Lock } from "lucide-react";
import { vibrateClick } from "../lib/utils";

interface AdminGuardProps extends UseAdminGuardOptions {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const AdminGuard: React.FC<AdminGuardProps> = ({
  children,
  fallback,
  redirectTo = "/",
  showToast = true,
  customToastMessage,
  autoRedirect = true,
}) => {
  const { setAuthModalOpen } = useApp();
  const { navigate } = useRouter();

  const { isAdmin, isAuthLoading, authorized, currentUser } = useAdminGuard({
    redirectTo,
    showToast,
    customToastMessage,
    autoRedirect,
  });

  if (isAuthLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-12 h-12 border-4 border-[#00843D] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
          Verificando credenciais administrativas...
        </p>
      </div>
    );
  }

  if (!authorized) {
    if (fallback) {
      return <>{fallback}</>;
    }

    if (autoRedirect) {
      return null;
    }

    return (
      <div className="max-w-2xl mx-auto py-12 px-4 animate-in fade-in zoom-in-95 duration-300">
        <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-8 sm:p-10 border border-red-200 dark:border-red-900/40 shadow-xl text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 flex items-center justify-center mx-auto shadow-inner">
            <Lock className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 text-xs font-black uppercase tracking-wider">
              <ShieldAlert className="w-4 h-4" />
              <span>Acesso Restrito • Painel Administrativo</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
              Área Restrita aos Administradores
            </h1>

            <p className="text-sm text-neutral-600 dark:text-neutral-300 max-w-lg mx-auto leading-relaxed">
              O acesso à rota <strong>/admin</strong> e às ferramentas de gestão do Localiza+ é exclusivo para servidores e administradores autorizados do <strong>IFPR Campus Ivaiporã</strong>.
            </p>
          </div>

          {/* Current role warning if authenticated as student/visitor */}
          <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800 text-left text-xs space-y-1.5">
            <div className="flex items-center justify-between font-bold text-neutral-700 dark:text-neutral-300">
              <span>Sua conta atual:</span>
              <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                {currentUser.role}
              </span>
            </div>
            <p className="text-neutral-500 dark:text-neutral-400 font-mono text-[11px] truncate">
              {currentUser.email || "Visitante não autenticado"}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={() => {
                vibrateClick();
                setAuthModalOpen(true);
              }}
              className="flex-1 py-3.5 px-5 rounded-2xl bg-[#00843D] hover:bg-[#006e33] text-white font-black text-sm shadow-lg shadow-[#00843D]/20 transition-all flex items-center justify-center space-x-2"
            >
              <LogIn className="w-4 h-4" />
              <span>Entrar com Conta Administrativa</span>
            </button>

            <button
              onClick={() => {
                vibrateClick();
                navigate("/");
              }}
              className="py-3.5 px-5 rounded-2xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-bold text-sm transition-all flex items-center justify-center space-x-2 border border-neutral-300 dark:border-neutral-700"
            >
              <Home className="w-4 h-4" />
              <span>Voltar ao Início</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

