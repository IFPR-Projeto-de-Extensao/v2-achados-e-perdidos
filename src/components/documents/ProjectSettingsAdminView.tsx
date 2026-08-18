import React, { useState } from "react";
import { useApp } from "../../context/AppContext";
import { ProjectSettings, ProjectTeamMember } from "../../types";
import {
  PROJECT_AVAILABLE_TAGS,
  DEFAULT_PROJECT_SETTINGS,
  getProjectSettingsTags,
} from "../../lib/projectSettingsConstants";
import {
  Building2,
  Users,
  GraduationCap,
  Sparkles,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  MoveUp,
  MoveDown,
  Copy,
  Check,
  Edit3,
  Info,
  MapPin,
  FileCode2,
  CheckCircle2,
} from "lucide-react";

export const ProjectSettingsAdminView: React.FC = () => {
  const { projectSettings, saveProjectSettings, resetProjectSettingsToDefault, addToast } = useApp();

  const [formData, setFormData] = useState<ProjectSettings>(() => {
    return JSON.parse(JSON.stringify(projectSettings || DEFAULT_PROJECT_SETTINGS));
  });

  const [isSaving, setIsSaving] = useState(false);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);

  // Member Modal State
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<ProjectTeamMember | null>(null);
  const [memberForm, setMemberForm] = useState<{
    name: string;
    registrationNumber: string;
    role: string;
  }>({
    name: "",
    registrationNumber: "",
    role: "Estudante Pesquisador / Desenvolvedor",
  });

  const projectTags = getProjectSettingsTags(formData);

  const handleCopyTag = (tag: string) => {
    navigator.clipboard.writeText(`{{${tag}}}`);
    setCopiedTag(tag);
    addToast(`Tag {{${tag}}} copiada para a área de transferência!`, "info");
    setTimeout(() => setCopiedTag(null), 2000);
  };

  const handleSave = async () => {
    if (!formData.teamName.trim()) {
      addToast("O nome da equipe/projeto não pode ficar em branco.", "error");
      return;
    }
    if (!formData.institution.name.trim()) {
      addToast("O nome da instituição não pode ficar em branco.", "error");
      return;
    }

    setIsSaving(true);
    try {
      await saveProjectSettings(formData);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (
      window.confirm(
        "Deseja restaurar as informações permanentes para a configuração padrão da Equipe InovaIF (IFPR Campus Ivaiporã)?"
      )
    ) {
      setIsSaving(true);
      try {
        await resetProjectSettingsToDefault();
        setFormData(JSON.parse(JSON.stringify(DEFAULT_PROJECT_SETTINGS)));
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Member Management Handlers
  const handleOpenAddMember = () => {
    setEditingMember(null);
    setMemberForm({
      name: "",
      registrationNumber: "",
      role: "Estudante Pesquisador / Desenvolvedor",
    });
    setIsMemberModalOpen(true);
  };

  const handleOpenEditMember = (member: ProjectTeamMember) => {
    setEditingMember(member);
    setMemberForm({
      name: member.name,
      registrationNumber: member.registrationNumber || "",
      role: member.role || "Estudante Pesquisador / Desenvolvedor",
    });
    setIsMemberModalOpen(true);
  };

  const handleSaveMemberModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberForm.name.trim()) {
      addToast("Informe o nome do integrante.", "error");
      return;
    }

    if (editingMember) {
      setFormData((prev) => ({
        ...prev,
        members: prev.members.map((m) =>
          m.id === editingMember.id
            ? {
                ...m,
                name: memberForm.name.trim(),
                registrationNumber: memberForm.registrationNumber.trim(),
                role: memberForm.role.trim(),
              }
            : m
        ),
      }));
      addToast("Integrante atualizado na listagem.", "info");
    } else {
      const newMember: ProjectTeamMember = {
        id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: memberForm.name.trim(),
        registrationNumber: memberForm.registrationNumber.trim(),
        role: memberForm.role.trim(),
        order: (formData.members?.length || 0) + 1,
      };
      setFormData((prev) => ({
        ...prev,
        members: [...(prev.members || []), newMember],
      }));
      addToast("Novo integrante adicionado à equipe.", "success");
    }

    setIsMemberModalOpen(false);
  };

  const handleDeleteMember = (memberId: string) => {
    setFormData((prev) => ({
      ...prev,
      members: prev.members.filter((m) => m.id !== memberId),
    }));
    addToast("Integrante removido da equipe.", "info");
  };

  const handleMoveMember = (idx: number, direction: "up" | "down") => {
    const members = [...formData.members];
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= members.length) return;

    const temp = members[idx];
    members[idx] = members[targetIdx];
    members[targetIdx] = temp;

    setFormData((prev) => ({
      ...prev,
      members,
    }));
  };

  return (
    <div id="project-settings-admin-view" className="space-y-8 pb-12">
      {/* Top Header Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 rounded-xl">
              <Sparkles className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Dados do Projeto & Informações Permanentes
            </h1>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
            Configure as informações da equipe <span className="font-semibold text-emerald-600 dark:text-emerald-400">InovaIF</span>,
            matrículas dos integrantes, orientador e campus. Estas variáveis são integradas automaticamente aos modelos e geradores de documentos oficiais em PDF.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-3 self-start md:self-auto">
          <button
            id="btn-reset-project-settings"
            onClick={handleReset}
            disabled={isSaving}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition-colors"
            title="Restaurar dados padrão recomendados do InovaIF"
          >
            <RotateCcw className="w-4 h-4 text-slate-500" />
            Restaurar Padrão InovaIF
          </button>

          <button
            id="btn-save-project-settings"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? "Salvando..." : "Salvar Alterações"}
          </button>
        </div>
      </div>

      {/* Synchronized metadata badge */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-xl text-xs text-emerald-800 dark:text-emerald-300">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>
            Persistência em tempo real via <strong>Firestore</strong> (Coleção <code>/project_settings/inovaif</code>).
          </span>
        </div>
        {formData.updatedAt && (
          <span className="text-emerald-700 dark:text-emerald-400/80">
            Última alteração: {new Date(formData.updatedAt).toLocaleString("pt-BR")}
            {formData.updatedBy ? ` por ${formData.updatedBy}` : ""}
          </span>
        )}
      </div>

      {/* Main Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Equipe e Integrantes */}
        <div className="space-y-8">
          {/* Card 1: Equipe e Nome do Projeto */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                1. Identificação da Equipe & Projeto
              </h2>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Nome da Equipe / Solução
              </label>
              <input
                id="input-team-name"
                type="text"
                value={formData.teamName}
                onChange={(e) => setFormData({ ...formData, teamName: e.target.value })}
                placeholder="Ex: InovaIF"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Disponível na tag: <code className="text-emerald-600 dark:text-emerald-400 font-semibold font-mono">{"{{nome_equipe}}"}</code>
              </p>
            </div>
          </div>

          {/* Card 2: Integrantes da Equipe */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    2. Integrantes da Equipe (Estudantes)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formData.members?.length || 0} estudantes cadastrados no InovaIF
                  </p>
                </div>
              </div>

              <button
                id="btn-add-member"
                onClick={handleOpenAddMember}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Adicionar Integrante
              </button>
            </div>

            {/* List of members */}
            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {formData.members?.length === 0 ? (
                <div className="p-6 text-center text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  Nenhum integrante cadastrado. Clique em "Adicionar Integrante".
                </div>
              ) : (
                formData.members.map((member, idx) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {member.name}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-mono bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                            Matrícula: {member.registrationNumber || "Não informada"}
                          </span>
                          {member.role && (
                            <span className="hidden sm:inline text-slate-400 dark:text-slate-500">• {member.role}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleMoveMember(idx, "up")}
                        disabled={idx === 0}
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-20 rounded"
                        title="Mover para cima"
                      >
                        <MoveUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleMoveMember(idx, "down")}
                        disabled={idx === formData.members.length - 1}
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-20 rounded"
                        title="Mover para baixo"
                      >
                        <MoveDown className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleOpenEditMember(member)}
                        className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors"
                        title="Editar integrante"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteMember(member.id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                        title="Excluir integrante"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Live formatting preview */}
            <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-xl p-3.5 space-y-2 text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-blue-500" />
                Prévia da tag {"{{integrantes_com_matricula}}"}:
              </span>
              <p className="font-mono text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 break-words">
                {projectTags.integrantes_com_matricula || "Nenhum integrante cadastrado."}
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Professor e Instituição */}
        <div className="space-y-8">
          {/* Card 3: Professor Responsável */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <GraduationCap className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                3. Professor(a) Responsável & Orientador
              </h2>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Nome Completo do Docente
                </label>
                <input
                  id="input-prof-name"
                  type="text"
                  value={formData.professor?.name || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      professor: { ...formData.professor, name: e.target.value },
                    })
                  }
                  placeholder="Ex: Ronan Anacleto Lopes"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Titulação Acadêmica
                  </label>
                  <input
                    id="input-prof-title"
                    type="text"
                    value={formData.professor?.title || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        professor: { ...formData.professor, title: e.target.value },
                      })
                    }
                    placeholder="Ex: Mestre, Doutor, Especialista"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Cargo / Função no Campus
                  </label>
                  <input
                    id="input-prof-role"
                    type="text"
                    value={formData.professor?.role || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        professor: { ...formData.professor, role: e.target.value },
                      })
                    }
                    placeholder="Ex: Coordenador do Curso de BSI"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>
              </div>

              {/* Tag doc preview */}
              <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-xl p-3 space-y-1 text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  Prévia da tag {"{{docente_completo}}"}:
                </span>
                <p className="font-mono text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-800">
                  {projectTags.docente_completo}
                </p>
              </div>
            </div>
          </div>

          {/* Card 4: Dados Institucionais do IFPR */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <Building2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                4. Dados Institucionais do Campus
              </h2>
            </div>

            <div className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Instituição
                  </label>
                  <input
                    id="input-inst-name"
                    type="text"
                    value={formData.institution?.name || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        institution: { ...formData.institution, name: e.target.value },
                      })
                    }
                    placeholder="Instituto Federal do Paraná"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Campus
                  </label>
                  <input
                    id="input-inst-campus"
                    type="text"
                    value={formData.institution?.campus || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        institution: { ...formData.institution, campus: e.target.value },
                      })
                    }
                    placeholder="Campus Ivaiporã"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Endereço / Logradouro
                </label>
                <input
                  id="input-inst-address"
                  type="text"
                  value={formData.institution?.address || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      institution: { ...formData.institution, address: e.target.value },
                    })
                  }
                  placeholder="Rua Max Arthur Greipel, nº 505 - Parque Industrial"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Cidade
                  </label>
                  <input
                    id="input-inst-city"
                    type="text"
                    value={formData.institution?.city || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        institution: { ...formData.institution, city: e.target.value },
                      })
                    }
                    placeholder="Ivaiporã"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Estado (UF)
                  </label>
                  <input
                    id="input-inst-state"
                    type="text"
                    value={formData.institution?.state || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        institution: { ...formData.institution, state: e.target.value },
                      })
                    }
                    placeholder="PR"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    CEP
                  </label>
                  <input
                    id="input-inst-zip"
                    type="text"
                    value={formData.institution?.zipCode || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        institution: { ...formData.institution, zipCode: e.target.value },
                      })
                    }
                    placeholder="86873-400"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              {/* Tag address preview */}
              <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-xl p-3 space-y-1 text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  Prévia da tag {"{{endereco_completo}}"}:
                </span>
                <p className="font-mono text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-800">
                  {projectTags.endereco_completo}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 5: Dynamic Tags Palette for Template Authors */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <FileCode2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                5. Catálogo de Tags Dinâmicas do Projeto InovaIF
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Utilize essas variáveis nos textos de cabeçalho, seções e rodapés dos seus modelos de documentos.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {PROJECT_AVAILABLE_TAGS.map((item) => (
            <div
              key={item.tag}
              className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 rounded-xl flex flex-col justify-between hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {item.label}
                  </span>
                  <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400">
                    {item.category}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  {item.description}
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-700/60">
                <code className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                  {`{{${item.tag}}}`}
                </code>
                <button
                  onClick={() => handleCopyTag(item.tag)}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  {copiedTag === item.tag ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-slate-400" />
                      Copiar
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Member Modal (Add / Edit) */}
      {isMemberModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {editingMember ? "Editar Integrante" : "Novo Integrante da Equipe"}
                </h3>
              </div>
              <button
                onClick={() => setIsMemberModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMemberModal} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={memberForm.name}
                  onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
                  placeholder="Ex: Gabriel Oliveira da Silva"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Número de Matrícula (IFPR) *
                </label>
                <input
                  type="text"
                  required
                  value={memberForm.registrationNumber}
                  onChange={(e) =>
                    setMemberForm({ ...memberForm, registrationNumber: e.target.value })
                  }
                  placeholder="Ex: 20251IVA10030010"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Função no Projeto
                </label>
                <input
                  type="text"
                  value={memberForm.role}
                  onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })}
                  placeholder="Ex: Estudante Pesquisador / Desenvolvedor"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsMemberModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm"
                >
                  {editingMember ? "Salvar Alterações" : "Adicionar Integrante"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export { ProjectConfigView } from "./ProjectConfigView";
