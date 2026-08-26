import React from "react";
import { withAdminProtection } from "../hooks/useAdminGuard";
import { DashboardView } from "./DashboardView";
import { useRouter } from "../context/RouterContext";
import { ShieldCheck } from "lucide-react";

const RawAdminView: React.FC = () => {
  const { pathname } = useRouter();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Admin Header Banner */}
      <div className="bg-gradient-to-r from-neutral-900 via-[#004d24] to-neutral-900 text-white p-6 sm:p-8 rounded-3xl border border-[#00843D]/40 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#00843D]/40 border border-[#00843D]/60 text-green-300 text-xs font-black uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4 text-green-400" />
            <span>Painel Administrativo Institucional</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            Gestão & Controle do Sistema Localiza+
          </h1>
          <p className="text-xs sm:text-sm text-neutral-300 max-w-2xl">
            Instituto Federal do Paraná • Campus Ivaiporã • Área de Controle de Usuários, Itens, Documentos e Auditoria
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <span className="px-3.5 py-1.5 rounded-xl bg-black/40 border border-white/10 text-neutral-300 text-xs font-mono">
            Rota: <strong className="text-white">{pathname}</strong>
          </span>
        </div>
      </div>

      {/* Render the complete DashboardView */}
      <DashboardView />
    </div>
  );
};

/**
 * AdminView wrapped with the 'withAdminProtection' Higher-Order Component.
 * Enforces role: 'ADMIN' authorization check from AppContext, redirecting unauthorized users to '/'.
 */
export const AdminView = withAdminProtection(RawAdminView);
export const ProtectedAdminView = AdminView;
export default AdminView;
