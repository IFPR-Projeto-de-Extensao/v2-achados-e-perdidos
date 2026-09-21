import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { User, AccountStatus, UserRole } from "../types";
import { resolveAccountStatus, formatAccountStatusDetails } from "../lib/accountStatusUtils";
import { ManageUserStatusModal } from "./ManageUserStatusModal";
import { vibrateClick, vibrateSuccess, safeIncludes, sanitizeQuery } from "../lib/utils";
import {
  Users,
  Search,
  ShieldCheck,
  Clock,
  UserX,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Shield,
} from "lucide-react";

export const AccountManagementView: React.FC = () => {
  const { allUsers, currentUser, updateUserStatus, updateUserRole, addToast } = useApp();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | AccountStatus>("ALL");
  const [selectedUserForStatusModal, setSelectedUserForStatusModal] = useState<User | null>(null);
  const [isReactivatingId, setIsReactivatingId] = useState<string | null>(null);
  const [isUpdatingRoleId, setIsUpdatingRoleId] = useState<string | null>(null);

  // Filter real users list
  const filteredUsers = (allUsers || []).filter((u) => {
    if (!u) return false;
    const resolved = resolveAccountStatus(u);
    const matchStatus = statusFilter === "ALL" || resolved.status === statusFilter;

    const q = sanitizeQuery(searchQuery);
    const matchQuery =
      !q ||
      safeIncludes(u.name, q) ||
      safeIncludes(u.email, q) ||
      safeIncludes(u.registrationNumber, q) ||
      safeIncludes(u.courseOrDept, q);

    return matchStatus && matchQuery;
  });

  const activeCount = (allUsers || []).filter((u) => resolveAccountStatus(u).status === "active").length;
  const suspendedCount = (allUsers || []).filter((u) => resolveAccountStatus(u).status === "suspended").length;
  const bannedCount = (allUsers || []).filter((u) => resolveAccountStatus(u).status === "banned").length;

  const handleQuickReactivate = async (targetUser: User) => {
    if (targetUser.id === currentUser.id) return;
    try {
      setIsReactivatingId(targetUser.id);
      vibrateClick();
      await updateUserStatus(targetUser.id, "active", "Reativação de conta executada pelo administrador");
      vibrateSuccess();
    } catch (err) {
      console.error("Erro ao reativar conta:", err);
    } finally {
      setIsReactivatingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header with Title & Stats */}
      <div className="bg-white dark:bg-[#1E1E1E] p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 rounded-2xl bg-[#00843D]/10 text-[#00843D]">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-neutral-900 dark:text-white">
              Gerenciamento de Contas e Usuários
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Controle de acesso, suspensão temporária e banimento de contas da comunidade acadêmica
            </p>
          </div>
        </div>

        {/* Status Counters */}
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Ativos: {activeCount}
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Suspensos: {suspendedCount}
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-300 text-xs font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            Banidos: {bannedCount}
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-[#1E1E1E] p-4 sm:p-5 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-neutral-100 dark:bg-neutral-800/70 p-1 rounded-2xl">
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setStatusFilter("ALL");
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === "ALL"
                  ? "bg-white dark:bg-[#1E1E1E] text-neutral-900 dark:text-white shadow-xs"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              Todos ({(allUsers || []).length})
            </button>
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setStatusFilter("active");
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === "active"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              Ativos ({activeCount})
            </button>
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setStatusFilter("suspended");
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === "suspended"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              Suspensos ({suspendedCount})
            </button>
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setStatusFilter("banned");
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === "banned"
                  ? "bg-red-600 text-white shadow-xs"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              Banidos ({bannedCount})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome, e-mail, curso..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
            />
          </div>
        </div>

        {/* Users Table */}
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 dark:bg-neutral-800/80 text-neutral-600 dark:text-neutral-400 uppercase font-extrabold tracking-wider text-[10px] border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                <th className="p-3.5">Nome / Usuário</th>
                <th className="p-3.5">E-mail</th>
                <th className="p-3.5">Função (Role)</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 bg-white dark:bg-[#1E1E1E]">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-neutral-500">
                    <p className="text-sm font-semibold">Nenhum usuário encontrado</p>
                    <p className="text-xs text-neutral-400 mt-1">
                      {searchQuery
                        ? "Tente ajustar os termos da busca."
                        : "Nenhum registro com o filtro de status selecionado."}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const resolved = resolveAccountStatus(u);
                  const statusDetails = formatAccountStatusDetails(u);
                  const isSelf = u.id === currentUser.id;
                  const isBusy = isReactivatingId === u.id;

                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40 transition-colors"
                    >
                      {/* Name & Avatar */}
                      <td className="p-3.5">
                        <div className="flex items-center space-x-3">
                          <img
                            src={
                              u.avatarUrl ||
                              "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80"
                            }
                            alt=""
                            className="w-8 h-8 rounded-full object-cover shrink-0 border border-neutral-200 dark:border-neutral-700"
                          />
                          <div>
                            <p className="font-bold text-neutral-900 dark:text-white flex items-center gap-1.5">
                              <span>{u.name}</span>
                              {isSelf && (
                                <span className="px-1.5 py-0.2 rounded-md bg-[#00843D]/10 text-[#00843D] dark:text-green-400 text-[9px] font-extrabold">
                                  (Você)
                                </span>
                              )}
                            </p>
                            <p className="text-[10px] text-neutral-400">
                              {u.courseOrDept || "IFPR Campus Ivaiporã"}
                              {u.registrationNumber ? ` • Matrícula: ${u.registrationNumber}` : ""}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="p-3.5 font-mono text-neutral-600 dark:text-neutral-300">
                        {u.email}
                      </td>

                      {/* Role */}
                      <td className="p-3.5">
                        {currentUser.role === "ADMIN" && !isSelf ? (
                          <div className="relative inline-block">
                            <select
                              value={u.role || "ALUNO"}
                              disabled={isUpdatingRoleId === u.id}
                              onChange={async (e) => {
                                const newRole = e.target.value as UserRole;
                                try {
                                  setIsUpdatingRoleId(u.id);
                                  vibrateClick();
                                  await updateUserRole(u.id, newRole);
                                  vibrateSuccess();
                                  addToast(`Função de ${u.name} atualizada para ${newRole === "INTRUSO" ? "Usuário externo" : newRole}.`, "success");
                                } catch (err) {
                                  console.error("Erro ao alterar função:", err);
                                  addToast("Erro ao alterar função do usuário.", "error");
                                } finally {
                                  setIsUpdatingRoleId(null);
                                }
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase border cursor-pointer outline-none transition-all ${
                                u.role === "ADMIN"
                                  ? "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30 hover:bg-purple-500/20"
                                  : u.role === "SERVIDOR"
                                  ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30 hover:bg-blue-500/20"
                                  : u.role === "INTRUSO"
                                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20"
                                  : "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30 hover:bg-green-500/20"
                              } ${isUpdatingRoleId === u.id ? "opacity-50 pointer-events-none" : ""}`}
                              title="Clique para alterar a função institucional deste usuário"
                            >
                              <option value="ALUNO" className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white">ALUNO</option>
                              <option value="SERVIDOR" className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white">SERVIDOR</option>
                              <option value="ADMIN" className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white">ADMIN</option>
                              <option value="INTRUSO" className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white">USUÁRIO EXTERNO</option>
                            </select>
                          </div>
                        ) : (
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase border ${
                              u.role === "ADMIN"
                                ? "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20"
                                : u.role === "SERVIDOR"
                                ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20"
                                : u.role === "INTRUSO"
                                ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20"
                                : "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20"
                            }`}
                          >
                            {u.role === "INTRUSO" ? "USUÁRIO EXTERNO" : u.role || "ALUNO"}
                          </span>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="p-3.5">
                        <div className="flex flex-col items-start gap-0.5">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${statusDetails.badgeClass}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${statusDetails.dotClass}`} />
                            {statusDetails.label}
                          </span>
                          {resolved.status === "suspended" && resolved.suspendedUntil && (
                            <span className="text-[9px] text-neutral-400 font-mono">
                              Até {new Date(resolved.suspendedUntil).toLocaleDateString("pt-BR")}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Direct Actions by Status */}
                      <td className="p-3.5 text-right whitespace-nowrap">
                        {isSelf ? (
                          <span className="text-[11px] text-neutral-400 italic">
                            Conta protegida
                          </span>
                        ) : (
                          <div className="flex items-center justify-end space-x-1.5">
                            {/* Actions for ACTIVE status: Suspender, Banir */}
                            {resolved.status === "active" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    vibrateClick();
                                    setSelectedUserForStatusModal(u);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[11px] font-bold transition-all flex items-center space-x-1 cursor-pointer"
                                >
                                  <Clock className="w-3 h-3" />
                                  <span>Suspender</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    vibrateClick();
                                    setSelectedUserForStatusModal(u);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-700 dark:text-red-300 border border-red-500/30 text-[11px] font-bold transition-all flex items-center space-x-1 cursor-pointer"
                                >
                                  <UserX className="w-3 h-3" />
                                  <span>Banir</span>
                                </button>
                              </>
                            )}

                            {/* Actions for SUSPENDED status: Reativar, Banir */}
                            {resolved.status === "suspended" && (
                              <>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleQuickReactivate(u)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[11px] font-bold transition-all flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                                >
                                  <RotateCcw className={`w-3 h-3 ${isBusy ? "animate-spin" : ""}`} />
                                  <span>Reativar</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    vibrateClick();
                                    setSelectedUserForStatusModal(u);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-700 dark:text-red-300 border border-red-500/30 text-[11px] font-bold transition-all flex items-center space-x-1 cursor-pointer"
                                >
                                  <UserX className="w-3 h-3" />
                                  <span>Banir</span>
                                </button>
                              </>
                            )}

                            {/* Actions for BANNED status: Reativar */}
                            {resolved.status === "banned" && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleQuickReactivate(u)}
                                className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-all flex items-center space-x-1 cursor-pointer shadow-xs disabled:opacity-50"
                              >
                                <RotateCcw className={`w-3 h-3 ${isBusy ? "animate-spin" : ""}`} />
                                <span>Reativar Conta</span>
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Status Modal */}
      {selectedUserForStatusModal && (
        <ManageUserStatusModal
          user={selectedUserForStatusModal}
          isOpen={!!selectedUserForStatusModal}
          onClose={() => setSelectedUserForStatusModal(null)}
          onUpdateStatus={updateUserStatus}
          currentAdminId={currentUser.id}
        />
      )}
    </div>
  );
};

export default AccountManagementView;
