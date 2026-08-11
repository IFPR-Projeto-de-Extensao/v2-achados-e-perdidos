import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { ItemCard } from "./ItemCard";
import { formatDate, formatDateTime } from "../lib/utils";
import { UserRole } from "../types";
import {
  User as UserIcon,
  GraduationCap,
  Mail,
  Building2,
  ShieldCheck,
  PackageSearch,
  CheckCircle2,
  Clock,
  IdCard,
  Edit,
  Phone,
  Lock,
  Shield,
  LogOut,
} from "lucide-react";

export const ProfileView: React.FC = () => {
  const {
    currentUser,
    updateUserRole,
    loginWithGoogle,
    logout,
    firebaseUser,
    items,
    claims,
    setSelectedItemForDetail,
    addToast,
    updateUserProfileData,
    setAuthModalOpen,
  } = useApp();

  const [activeTab, setActiveTab] = useState<"my_items" | "claims">("my_items");
  const [isEditing, setIsEditing] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState(currentUser.name);
  const [editCourse, setEditCourse] = useState(currentUser.courseOrDept);
  const [editMatricula, setEditMatricula] = useState(currentUser.registrationNumber);
  const [editPhone, setEditPhone] = useState(currentUser.phone || "");

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateUserProfileData({
      ...currentUser,
      name: editName,
      courseOrDept: editCourse,
      registrationNumber: editMatricula,
      phone: editPhone,
    });
    setIsEditing(false);
  };

  // User registered items
  const userItems = items.filter((it) => it.registeredByUserId === currentUser.id);

  // User claims
  const userClaims = claims.filter((c) => c.claimerId === currentUser.id);

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16">
      {/* Profile Header Card */}
      <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 sm:p-8 border border-neutral-200 dark:border-neutral-800 shadow-sm flex flex-col md:flex-row items-center md:items-start space-y-4 md:space-y-0 md:space-x-6">
        {/* Avatar */}
        <div className="relative">
          <img
            src={currentUser.avatarUrl}
            alt={currentUser.name}
            className="w-24 h-24 rounded-2xl object-cover border-4 border-[#00843D] shadow-md"
          />
          <span className="absolute -bottom-2 -right-2 px-2.5 py-0.5 rounded-full bg-[#00843D] text-white text-[10px] font-bold uppercase tracking-wide border-2 border-white dark:border-[#1E1E1E]">
            {currentUser.role}
          </span>
        </div>

        {/* User Details */}
        <div className="flex-1 text-center md:text-left space-y-2">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
                {currentUser.name}
              </h1>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {currentUser.courseOrDept}
              </p>
            </div>

            {/* Role switch prompt, Google Login & Edit */}
            <div className="flex flex-wrap items-center gap-2 justify-center md:justify-end">
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="px-3 py-1.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-xs font-bold hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors flex items-center gap-1"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>{isEditing ? "Cancelar" : "Editar Perfil"}</span>
              </button>

              {(currentUser.id !== "guest_visitor" || firebaseUser) ? (
                <button
                  onClick={logout}
                  className="px-3.5 py-1.5 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-500 hover:text-white transition-colors flex items-center gap-1.5 border border-red-500/20"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sair da Conta</span>
                </button>
              ) : (
                <button
                  onClick={() => setAuthModalOpen(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-[#00843D] text-white text-xs font-bold hover:bg-[#006830] transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Login / Cadastro</span>
                </button>
              )}
              {currentUser.role === "ADMIN" ? (
                <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-green-50 dark:bg-green-950/40 border border-[#00843D]/30 text-xs font-bold text-[#00843D] dark:text-green-400">
                  <Shield className="w-3.5 h-3.5 text-[#00843D]" />
                  <span>Função:</span>
                  <select
                    value={currentUser.role}
                    onChange={(e) => updateUserRole(currentUser.id, e.target.value as UserRole)}
                    className="bg-transparent text-xs font-bold text-neutral-900 dark:text-white outline-none cursor-pointer"
                  >
                    <option value="ALUNO" className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white">ALUNO</option>
                    <option value="SERVIDOR" className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white">SERVIDOR</option>
                    <option value="ADMIN" className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white">ADMIN</option>
                  </select>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => addToast("Sua função é definida e alterada apenas pelo Administrador do IFPR.", "info")}
                  className="px-3 py-1.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-xs font-bold text-neutral-600 dark:text-neutral-300 flex items-center gap-1.5 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                  title="Somente Administradores do IFPR podem alterar perfis e permissões"
                >
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Função: {currentUser.role}</span>
                </button>
              )}
            </div>
          </div>

          {!isEditing ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 text-xs text-neutral-600 dark:text-neutral-300 border-t border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center justify-center md:justify-start space-x-2">
                <Mail className="w-4 h-4 text-[#00843D]" />
                <span className="truncate">{currentUser.email}</span>
              </div>
              <div className="flex items-center justify-center md:justify-start space-x-2">
                <IdCard className="w-4 h-4 text-[#00843D]" />
                <span>Matrícula: {currentUser.registrationNumber}</span>
              </div>
              <div className="flex items-center justify-center md:justify-start space-x-2">
                <Phone className="w-4 h-4 text-[#00843D]" />
                <span>{currentUser.phone || "(43) 99999-0000"}</span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveProfile} className="pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 dark:text-neutral-400 mb-1">
                    Nome Completo
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 outline-none focus:ring-2 focus:ring-[#00843D]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 dark:text-neutral-400 mb-1">
                    Curso / Departamento
                  </label>
                  <input
                    type="text"
                    value={editCourse}
                    onChange={(e) => setEditCourse(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 outline-none focus:ring-2 focus:ring-[#00843D]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 dark:text-neutral-400 mb-1">
                    Matrícula / Registro
                  </label>
                  <input
                    type="text"
                    value={editMatricula}
                    onChange={(e) => setEditMatricula(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 outline-none focus:ring-2 focus:ring-[#00843D]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 dark:text-neutral-400 mb-1">
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 outline-none focus:ring-2 focus:ring-[#00843D]"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-1">
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#00843D] text-white font-bold text-xs rounded-xl hover:bg-[#006830] transition-colors"
                >
                  Salvar Alterações no Banco de Dados
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-neutral-200 dark:border-neutral-800 pb-3">
        <button
          onClick={() => setActiveTab("my_items")}
          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center space-x-2 transition-all ${
            activeTab === "my_items"
              ? "bg-[#00843D] text-white shadow-xs"
              : "bg-white dark:bg-[#1E1E1E] text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800"
          }`}
        >
          <PackageSearch className="w-4 h-4" />
          <span>Meus Cadastros ({userItems.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("claims")}
          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center space-x-2 transition-all ${
            activeTab === "claims"
              ? "bg-[#00843D] text-white shadow-xs"
              : "bg-white dark:bg-[#1E1E1E] text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800"
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Minhas Solicitações ({userClaims.length})</span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "my_items" ? (
        <div className="space-y-4">
          {userItems.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-8 space-y-3">
              <PackageSearch className="w-12 h-12 text-neutral-300 dark:text-neutral-600 mx-auto" />
              <h3 className="font-bold text-base text-neutral-800 dark:text-white">
                Nenhum objeto cadastrado por você ainda.
              </h3>
              <p className="text-xs text-neutral-500">
                Caso tenha perdido ou encontrado um pertence no campus, faça o registro.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {userItems.map((item) => (
                <ItemCard key={item.id} item={item} onSelect={setSelectedItemForDetail} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {userClaims.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-8 space-y-3">
              <ShieldCheck className="w-12 h-12 text-neutral-300 dark:text-neutral-600 mx-auto" />
              <h3 className="font-bold text-base text-neutral-800 dark:text-white">
                Nenhuma solicitação de devolução efetuada.
              </h3>
              <p className="text-xs text-neutral-500">
                Ao solicitar a posse de um objeto encontrado, o histórico ficará listado aqui.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {userClaims.map((claim) => (
                <div
                  key={claim.id}
                  className="p-5 rounded-2xl bg-white dark:bg-[#1E1E1E] border border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-sm text-neutral-900 dark:text-white">
                        {claim.itemTitle}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                          claim.status === "PENDENTE"
                            ? "bg-amber-500/10 text-amber-600"
                            : "bg-green-500/10 text-green-600"
                        }`}
                      >
                        {claim.status}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500">
                      Sua comprovação: &quot;{claim.verificationAnswer}&quot;
                    </p>
                    <span className="text-[11px] text-neutral-400 block">
                      Solicitado em: {formatDateTime(claim.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
