import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { User, AccountStatus, UserRole } from "../types";
import { resolveAccountStatus, formatAccountStatusDetails, sortUsersByCreationDesc } from "../lib/accountStatusUtils";
import { ManageUserStatusModal } from "./ManageUserStatusModal";
import { getSafeAvatarUrl, handleAvatarError } from "../lib/avatarUtils";
import { vibrateClick, vibrateSuccess, safeIncludes, sanitizeQuery, safeParseDate } from "../lib/utils";
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
  Trash2,
  AlertOctagon,
  X,
  Loader2,
} from "lucide-react";

export const AccountManagementView: React.FC = () => {
  const { allUsers, currentUser, updateUserStatus, updateUserRole, deleteUser, addToast } = useApp();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | AccountStatus>("ALL");
  const [selectedUserForStatusModal, setSelectedUserForStatusModal] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmationChecked, setDeleteConfirmationChecked] = useState(false);
  const [isReactivatingId, setIsReactivatingId] = useState<string | null>(null);
  const [isUpdatingRoleId, setIsUpdatingRoleId] = useState<string | null>(null);

  // Filter and sort real users list: newest created accounts first (mais recente -> mais antiga)
  const filteredUsers = sortUsersByCreationDesc(
    (allUsers || []).filter((u) => {
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
    })
  );

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

  const handleConfirmDelete = async () => {
    if (!userToDelete || userToDelete.id === currentUser.id) return;
    try {
      setIsDeleting(true);
      vibrateClick();
      await deleteUser(userToDelete.id);
      vibrateSuccess();
      setUserToDelete(null);
      setDeleteConfirmationChecked(false);
    } catch (err) {
      console.error("Erro ao excluir conta:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header with Title & Stats */}
      <div className="bg-white dark:bg-[#111827] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-[0_1px_3px_rgba(23,43,42,0.04)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/40 text-[#16845B] dark:text-emerald-400 border border-[#16845B]/15">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#172B2A] dark:text-white tracking-tight">
              Gerenciamento de Contas e Usuários
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Controle de acesso, suspensão temporária e banimento de contas da comunidade acadêmica
            </p>
          </div>
        </div>

        {/* Status Counters */}
        <div className="flex items-center gap-2 flex-wrap tabular-nums">
          <span className="px-3 py-1.5 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/40 border border-[#16845B]/20 text-[#16845B] dark:text-emerald-300 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <span className="w-2 h-2 rounded-full bg-[#16845B]" />
            Ativos: {activeCount}
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-300 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Suspensos: {suspendedCount}
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-300 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            Banidos: {bannedCount}
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-[#111827] p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-[0_1px_3px_rgba(23,43,42,0.04)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-[#F8FAFC] dark:bg-slate-800/70 p-1 rounded-xl border border-slate-200 dark:border-slate-700 tabular-nums">
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setStatusFilter("ALL");
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === "ALL"
                  ? "bg-white dark:bg-[#111827] text-[#172B2A] dark:text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-[#172B2A] dark:hover:text-white"
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
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === "active"
                  ? "bg-[#16845B] text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-[#172B2A] dark:hover:text-white"
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
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === "suspended"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-[#172B2A] dark:hover:text-white"
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
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === "banned"
                  ? "bg-red-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-[#172B2A] dark:hover:text-white"
              }`}
            >
              Banidos ({bannedCount})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome, e-mail, curso..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-[#F8FAFC] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-[#172B2A] dark:text-white outline-none focus:ring-2 focus:ring-[#16845B]"
            />
          </div>
        </div>

        {/* Users Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAFC] dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 uppercase font-bold tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3.5">Nome / Usuário</th>
                <th className="p-3.5">E-mail</th>
                <th className="p-3.5">Função (Role)</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-[#111827]">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    <p className="text-sm font-semibold">Nenhum usuário encontrado</p>
                    <p className="text-xs text-slate-400 mt-1">
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
                      className="hover:bg-[#F8FAFC] dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Name & Avatar */}
                      <td className="p-3.5">
                        <div className="flex items-center space-x-3">
                          <img
                            src={getSafeAvatarUrl(u.avatarUrl, u.name)}
                            alt=""
                            referrerPolicy="no-referrer"
                            onError={(e) => handleAvatarError(e, u.name)}
                            className="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                          />
                          <div>
                            <p className="font-semibold text-[#172B2A] dark:text-white flex items-center gap-1.5">
                              <span>{u.name}</span>
                              {isSelf && (
                                <span className="px-1.5 py-0.5 rounded-md bg-[#EBF5F0] dark:bg-emerald-950/40 text-[#16845B] dark:text-emerald-400 text-[9px] font-bold">
                                  (Você)
                                </span>
                              )}
                              {u.createdAt && (Date.now() - new Date(u.createdAt).getTime() < 48 * 3600 * 1000) && (
                                <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-[9px] font-bold uppercase tracking-wider">
                                  Novo
                                </span>
                              )}
                            </p>
                            <p className="text-[10px] text-slate-400 tabular-nums">
                              {u.courseOrDept || "IFPR Campus Ivaiporã"}
                              {u.registrationNumber ? ` • Matrícula: ${u.registrationNumber}` : ""}
                              {u.createdAt ? ` • Cadastro: ${new Date(u.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="p-3.5 font-mono text-slate-600 dark:text-slate-300">
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
                                } finally {
                                  setIsUpdatingRoleId(null);
                                }
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border cursor-pointer outline-none transition-all ${
                                u.role === "ADMIN"
                                  ? "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30 hover:bg-purple-500/20"
                                  : u.role === "SERVIDOR"
                                  ? "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30 hover:bg-sky-500/20"
                                  : u.role === "INTRUSO"
                                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20"
                                  : "bg-[#EBF5F0] text-[#16845B] dark:bg-emerald-950/50 dark:text-emerald-400 border-[#16845B]/30 hover:bg-[#16845B]/15"
                              } ${isUpdatingRoleId === u.id ? "opacity-50 pointer-events-none" : ""}`}
                              title="Clique para alterar a função institucional deste usuário"
                            >
                              <option value="ALUNO" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">ALUNO</option>
                              <option value="SERVIDOR" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">SERVIDOR</option>
                              <option
                                value="ADMIN"
                                disabled={currentUser.email?.toLowerCase() !== "paulocauan39@gmail.com"}
                                className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                              >
                                ADMIN {currentUser.email?.toLowerCase() !== "paulocauan39@gmail.com" ? "(Exclusivo Root Admin)" : ""}
                              </option>
                              <option value="INTRUSO" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">USUÁRIO EXTERNO</option>
                            </select>
                            {u.roleAssignedBy && (
                              <div className="text-[9px] text-slate-400 mt-0.5" title={`Atribuído por: ${u.roleAssignedByName || u.roleAssignedBy}`}>
                                Designado
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-start gap-0.5">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border ${
                                u.role === "ADMIN"
                                  ? "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20"
                                  : u.role === "SERVIDOR"
                                  ? "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20"
                                  : u.role === "INTRUSO"
                                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20"
                                  : "bg-[#EBF5F0] text-[#16845B] dark:bg-emerald-950/50 dark:text-emerald-400 border-[#16845B]/20"
                              }`}
                            >
                              {u.role === "INTRUSO" ? "USUÁRIO EXTERNO" : u.role || "ALUNO"}
                            </span>
                            {u.roleAssignedBy && (
                              <span className="text-[9px] text-slate-400 font-mono" title={`Designado administrativamente por ${u.roleAssignedByName || u.roleAssignedBy}`}>
                                Designado
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="p-3.5">
                        <div className="flex flex-col items-start gap-0.5">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusDetails.badgeClass}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${statusDetails.dotClass}`} />
                            {statusDetails.label}
                          </span>
                          {resolved.status === "suspended" && resolved.suspendedUntil && (
                            <span className="text-[9px] text-slate-400 font-mono">
                              Até {safeParseDate(resolved.suspendedUntil)?.toLocaleDateString("pt-BR")}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Direct Actions by Status */}
                      <td className="p-3.5 text-right whitespace-nowrap">
                        {isSelf ? (
                          <span className="text-[11px] text-slate-400 italic">
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
                                  className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-[11px] font-bold transition-all flex items-center space-x-1 cursor-pointer"
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
                                  className="px-2.5 py-1 rounded-lg bg-[#EBF5F0] hover:bg-[#16845B]/20 text-[#16845B] dark:bg-emerald-950/50 dark:text-emerald-400 border border-[#16845B]/30 text-[11px] font-bold transition-all flex items-center space-x-1 cursor-pointer disabled:opacity-50"
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
                                  className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-[11px] font-bold transition-all flex items-center space-x-1 cursor-pointer"
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
                                className="px-3 py-1 rounded-lg bg-[#16845B] hover:bg-[#064E3B] text-white text-[11px] font-bold transition-all flex items-center space-x-1 cursor-pointer shadow-xs disabled:opacity-50"
                              >
                                <RotateCcw className={`w-3 h-3 ${isBusy ? "animate-spin" : ""}`} />
                                <span>Reativar Conta</span>
                              </button>
                            )}

                            {/* Explicit Action: Excluir Conta (Distinct from Suspender, Banir, Reativar) */}
                            <button
                              type="button"
                              onClick={() => {
                                vibrateClick();
                                setUserToDelete(u);
                                setDeleteConfirmationChecked(false);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 dark:bg-slate-800 dark:hover:bg-rose-950/40 dark:text-slate-300 dark:hover:text-rose-300 border border-slate-200 dark:border-slate-700 hover:border-rose-400 text-[11px] font-bold transition-all flex items-center space-x-1 cursor-pointer"
                              title="Excluir conta definitivamente do Firebase Authentication e do Firestore"
                            >
                              <Trash2 className="w-3 h-3 text-rose-500" />
                              <span>Excluir</span>
                            </button>
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

      {/* Permanent Deletion Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#111827] rounded-2xl border border-red-200 dark:border-red-900/60 shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-6 bg-red-50 dark:bg-red-950/40 border-b border-red-100 dark:border-red-900/50 flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-3 rounded-xl bg-red-600 text-white shadow-sm">
                  <AlertOctagon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-red-900 dark:text-red-200">
                    Excluir Conta Permanentemente
                  </h3>
                  <p className="text-xs text-red-700 dark:text-red-300/80">
                    Ação administrativa irreversível e definitiva
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setUserToDelete(null);
                  setDeleteConfirmationChecked(false);
                }}
                className="p-1.5 rounded-xl hover:bg-red-200/50 dark:hover:bg-red-900/40 text-red-700 dark:text-red-300 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <div className="p-4 rounded-xl bg-[#F8FAFC] dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Nome:</span>
                  <span className="font-semibold text-[#172B2A] dark:text-white">{userToDelete.name}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">E-mail:</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">{userToDelete.email}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Perfil / Papel:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{userToDelete.role}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Matrícula:</span>
                  <span className="font-mono tabular-nums text-slate-800 dark:text-slate-200">{userToDelete.registrationNumber || "N/A"}</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300 text-xs leading-relaxed space-y-2">
                <div className="font-bold flex items-center space-x-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Impacto da Exclusão:</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-[11px]">
                  <li>A conta será <strong>excluída permanentemente</strong> do Firebase Authentication.</li>
                  <li>O documento do usuário será <strong>removido</strong> do Firestore (<span className="font-mono">/users/{userToDelete.id}</span>).</li>
                  <li>Notificações privadas vinculadas ao usuário serão limpas.</li>
                  <li><strong>Histórico de auditoria é preservado:</strong> Registros anteriores de rastreabilidade são mantidos intactos.</li>
                </ul>
              </div>

              {/* Checkbox confirmation */}
              <label className="flex items-start space-x-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-900/40 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteConfirmationChecked}
                  onChange={(e) => setDeleteConfirmationChecked(e.target.checked)}
                  disabled={isDeleting}
                  className="mt-0.5 rounded text-red-600 focus:ring-red-500 w-4 h-4 cursor-pointer"
                />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Estou ciente de que esta ação é permanente, irreversível e remove o acesso do usuário ao sistema.
                </span>
              </label>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-[#F8FAFC] dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end space-x-3">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setUserToDelete(null);
                  setDeleteConfirmationChecked(false);
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!deleteConfirmationChecked || isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-all flex items-center space-x-2 shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Excluindo permanentemente...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Excluir Definitivamente</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountManagementView;
