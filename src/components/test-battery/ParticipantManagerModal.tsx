import React, { useState } from "react";
import {
  Users,
  UserPlus,
  Trash2,
  Shield,
  X,
  Plus,
  Mail,
  UserCheck,
  ArrowRight,
} from "lucide-react";
import { TestBatteryExecution, TestParticipant, User } from "../../types";
import { vibrateClick, vibrateSuccess, vibrateWarning } from "../../lib/utils";

interface ParticipantManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  battery: TestBatteryExecution;
  allUsers: User[];
  onAddParticipant: (participant: TestParticipant) => Promise<void>;
  onRemoveParticipant: (participantId: string) => Promise<void>;
  onNavigateToDistribution?: () => void;
  darkMode?: boolean;
}

export const ParticipantManagerModal: React.FC<ParticipantManagerModalProps> = ({
  isOpen,
  onClose,
  battery,
  allUsers,
  onAddParticipant,
  onRemoveParticipant,
  onNavigateToDistribution,
  darkMode,
}) => {
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [customName, setCustomName] = useState<string>("");
  const [customEmail, setCustomEmail] = useState<string>("");
  const [customRole, setCustomRole] = useState<"ALUNO" | "SERVIDOR" | "ADMIN">("ALUNO");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<"LIST" | "ADD">("LIST");

  if (!isOpen) return null;

  const participants = battery.participants || [];

  const handleSelectExistingUser = (userId: string) => {
    setSelectedUserId(userId);
    const found = allUsers.find((u) => u.id === userId);
    if (found) {
      setCustomName(found.name);
      setCustomEmail(found.email);
      setCustomRole(found.role);
    }
  };

  const handleCreateParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim() || !customEmail.trim()) {
      vibrateWarning();
      return;
    }

    setIsSubmitting(true);
    vibrateClick();

    const newParticipant: TestParticipant = {
      id: selectedUserId || `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: customName.trim(),
      email: customEmail.trim().toLowerCase(),
      globalRole: customRole,
      contextualRole: "TESTADOR",
      status: "ATIVO",
      assignedCategories: [],
      assignedTestCount: 0,
      completedTestCount: 0,
      passedTestCount: 0,
      failedTestCount: 0,
      addedAt: new Date().toISOString(),
      addedBy: "Administrador / Coordenador IFPR",
    };

    await onAddParticipant(newParticipant);
    setIsSubmitting(false);
    vibrateSuccess();
    setCustomName("");
    setCustomEmail("");
    setSelectedUserId("");
    setActiveSubTab("LIST");
  };

  return (
    <div
      id="modal-test-participants"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
    >
      <div
        className={`w-full max-w-4xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
          darkMode ? "bg-neutral-900 border-neutral-800 text-white" : "bg-white border-neutral-200 text-neutral-900"
        }`}
      >
        {/* Modal Header */}
        <div className="p-5 border-b flex items-center justify-between dark:border-neutral-800 border-neutral-200 bg-emerald-600/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-sm">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
                Participantes & Papel Contextual de Testador
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  {participants.length} Cadastrados
                </span>
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Bateria #{battery.id} • Adicione membros à equipe antes de realizar a distribuição de testes.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="flex items-center justify-between px-5 pt-3 border-b dark:border-neutral-800 border-neutral-200">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveSubTab("LIST")}
              className={`px-3 py-2 text-xs font-bold border-b-2 transition ${
                activeSubTab === "LIST"
                  ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
                  : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
              }`}
            >
              Equipe da Bateria ({participants.length})
            </button>
            <button
              onClick={() => setActiveSubTab("ADD")}
              className={`px-3 py-2 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
                activeSubTab === "ADD"
                  ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
                  : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar Testador
            </button>
          </div>

          {onNavigateToDistribution && participants.length > 0 && (
            <button
              onClick={() => {
                onClose();
                onNavigateToDistribution();
              }}
              className="text-xs font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 flex items-center gap-1 pb-1"
            >
              Ir para Distribuição de Testes
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {activeSubTab === "LIST" && (
            <div className="space-y-4">
              {participants.length === 0 ? (
                <div className="text-center py-10 px-4 rounded-2xl border border-dashed dark:border-neutral-800 border-neutral-300 space-y-3">
                  <UserPlus className="w-10 h-10 mx-auto text-neutral-400" />
                  <div>
                    <h3 className="text-sm font-bold">Nenhum testador vinculado a esta bateria</h3>
                    <p className="text-xs text-neutral-500 mt-1 max-w-md mx-auto">
                      Adicione alunos, servidores ou administradores à equipe. Os participantes são cadastrados inicialmente com 0 testes e receberão atribuições na etapa de Distribuição.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveSubTab("ADD")}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Adicionar Primeiro Testador
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border dark:border-neutral-800 border-neutral-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-100 dark:bg-neutral-800/80 font-bold uppercase text-[10px] text-neutral-600 dark:text-neutral-400 border-b dark:border-neutral-800 border-neutral-200">
                      <tr>
                        <th className="py-3 px-4">Participante</th>
                        <th className="py-3 px-3">Perfil Global</th>
                        <th className="py-3 px-3">Papel Contextual</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3 text-right">Testes Atribuídos</th>
                        <th className="py-3 px-3 text-right">Concluídos</th>
                        <th className="py-3 px-3 text-right">Aprovados</th>
                        <th className="py-3 px-3 text-right">Reprovados</th>
                        <th className="py-3 px-3 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                      {participants.map((p) => {
                        const assignedTests = (battery.tests || []).filter(
                          (t) =>
                            t.assignedToUserId === p.id ||
                            (t.assignedToEmail && t.assignedToEmail.toLowerCase() === p.email.toLowerCase())
                        );
                        const assignedCount = assignedTests.length;
                        const completedCount = assignedTests.filter(
                          (t) => t.status === "APROVADO" || t.status === "REPROVADO"
                        ).length;
                        const passedCount = assignedTests.filter((t) => t.status === "APROVADO").length;
                        const failedCount = assignedTests.filter((t) => t.status === "REPROVADO").length;

                        return (
                          <tr
                            key={p.id}
                            className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                          >
                            <td className="py-3 px-4 font-semibold">
                              <div className="font-bold text-neutral-900 dark:text-white">{p.name}</div>
                              <div className="text-[11px] text-neutral-500 flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {p.email}
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                  p.globalRole === "ADMIN"
                                    ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                                    : p.globalRole === "SERVIDOR"
                                    ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                                    : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                }`}
                              >
                                {p.globalRole}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-mono font-semibold text-neutral-600 dark:text-neutral-400 text-[11px]">
                              {p.contextualRole || "TESTADOR"}
                            </td>
                            <td className="py-3 px-3">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                {p.status || "ATIVO"}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right font-black text-xs text-neutral-900 dark:text-white">
                              {assignedCount}
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-xs text-neutral-600 dark:text-neutral-300">
                              {completedCount}
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-xs text-emerald-600 dark:text-emerald-400">
                              {passedCount}
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-xs text-rose-600 dark:text-rose-400">
                              {failedCount}
                            </td>
                            <td className="py-3 px-3 text-center">
                              <button
                                onClick={() => onRemoveParticipant(p.id)}
                                className="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition"
                                title="Desvincular Participante da Bateria"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeSubTab === "ADD" && (
            <form onSubmit={handleCreateParticipant} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-900 dark:text-blue-200 text-xs">
                <p className="font-bold flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-blue-500" />
                  Isolamento Seguro de Permissões (Etapa 1)
                </p>
                <p className="mt-0.5 opacity-90 leading-relaxed">
                  O participante ingressa na bateria com o papel contextual de <strong>TESTADOR (ATIVO)</strong> e <strong>0 testes atribuídos</strong>. A distribuição de testes é realizada separadamente na aba de Distribuição.
                </p>
              </div>

              {/* Pre-select Existing User */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-500 uppercase">
                  Vincular a partir de Usuário Cadastrado no Sistema (Opcional)
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => handleSelectExistingUser(e.target.value)}
                  className={`w-full text-xs font-semibold px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                    darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                  }`}
                >
                  <option value="">-- Selecionar Usuário Existente --</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email}) - {u.role}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-neutral-500 uppercase">Nome Completo *</label>
                  <input
                    type="text"
                    required
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Ex: Gabriel Santos"
                    className={`w-full text-xs font-semibold px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                      darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                    }`}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-neutral-500 uppercase">E-mail Institucional *</label>
                  <input
                    type="email"
                    required
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    placeholder="gabriel.testador@ifpr.edu.br"
                    className={`w-full text-xs font-semibold px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                      darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-neutral-500 uppercase">Perfil Global no Campus</label>
                  <select
                    value={customRole}
                    onChange={(e) => setCustomRole(e.target.value as any)}
                    className={`w-full text-xs font-semibold px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                      darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                    }`}
                  >
                    <option value="ALUNO">Discente / Bolsista (ALUNO)</option>
                    <option value="SERVIDOR">Servidor / TAE (SERVIDOR)</option>
                    <option value="ADMIN">Administrador de TI (ADMIN)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-neutral-500 uppercase">Papel Contextual na Bateria</label>
                  <div className={`w-full text-xs font-bold px-3 py-2.5 rounded-xl border flex items-center justify-between ${
                    darkMode ? "bg-neutral-800/60 border-neutral-700 text-neutral-300" : "bg-neutral-100 border-neutral-300 text-neutral-700"
                  }`}>
                    <span>TESTADOR</span>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-extrabold uppercase">STATUS: ATIVO</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t dark:border-neutral-800 border-neutral-200">
                <button
                  type="button"
                  onClick={() => setActiveSubTab("LIST")}
                  className="px-4 py-2.5 text-xs font-semibold rounded-xl border dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5"
                >
                  <UserCheck className="w-4 h-4" />
                  Adicionar Testador
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t dark:border-neutral-800 border-neutral-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded-xl transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
