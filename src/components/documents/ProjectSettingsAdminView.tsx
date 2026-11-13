import React, { useState } from "react";
import { useApp } from "../../context/AppContext";
import { ProjectSettings, ProjectTeamMember } from "../../types";
import {
  PROJECT_AVAILABLE_TAGS,
  DEFAULT_PROJECT_SETTINGS,
  getProjectSettingsTags,
} from "../../lib/projectSettingsConstants";
import {
  SurfaceCard,
  SubtlePanel,
  UIButton,
  UIBadge,
  UIFieldGroup,
  UIInput,
  EmptyState,
  ModalShell,
} from "../ui";
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
    <div id="project-settings-admin-view" className="space-y-8 pb-12 text-[#172B2A] dark:text-slate-100">
      {/* Top Header Banner */}
      <SurfaceCard padding="md" className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="p-2 bg-[#EBF5F0] dark:bg-emerald-950/60 text-[#16845B] dark:text-emerald-400 rounded-xl border border-[#16845B]/20 dark:border-emerald-800/50">
              <Sparkles className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-[#172B2A] dark:text-slate-100">
              Dados do Projeto & Informações Permanentes
            </h1>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
            Configure as informações da equipe <span className="font-semibold text-[#16845B] dark:text-emerald-400">InovaIF</span>,
            matrículas dos integrantes, orientador e campus. Estas variáveis são integradas automaticamente aos modelos e geradores de documentos oficiais em PDF.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          <UIButton
            id="btn-reset-project-settings"
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={isSaving}
            title="Restaurar dados padrão recomendados do InovaIF"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Restaurar Padrão InovaIF</span>
          </UIButton>

          <UIButton
            id="btn-save-project-settings"
            type="button"
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? "Salvando..." : "Salvar Alterações"}</span>
          </UIButton>
        </div>
      </SurfaceCard>

      {/* Synchronized metadata badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-[#EBF5F0] dark:bg-emerald-950/30 border border-[#16845B]/20 dark:border-emerald-800/50 rounded-xl text-xs text-[#064E3B] dark:text-emerald-300">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#16845B] dark:text-emerald-400 shrink-0" />
          <span>
            Persistência em tempo real via <strong>Firestore</strong> (Coleção <code>/project_settings/inovaif</code>).
          </span>
        </div>
        {formData.updatedAt && (
          <span className="text-[#16845B] dark:text-emerald-400/80 font-medium">
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
          <SurfaceCard padding="md" className="space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <Users className="w-5 h-5 text-[#16845B] dark:text-emerald-400" />
              <h2 className="text-base font-bold text-[#172B2A] dark:text-slate-100">
                1. Identificação da Equipe & Projeto
              </h2>
            </div>

            <UIFieldGroup
              label="Nome da Equipe / Solução"
              htmlFor="input-team-name"
              hint="Disponível na tag: {{nome_equipe}}"
            >
              <UIInput
                id="input-team-name"
                type="text"
                value={formData.teamName}
                onChange={(e) => setFormData({ ...formData, teamName: e.target.value })}
                placeholder="Ex: InovaIF"
              />
            </UIFieldGroup>
          </SurfaceCard>

          {/* Card 2: Integrantes da Equipe */}
          <SurfaceCard padding="md" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <Users className="w-5 h-5 text-[#16845B] dark:text-emerald-400" />
                <div>
                  <h2 className="text-base font-bold text-[#172B2A] dark:text-slate-100">
                    2. Integrantes da Equipe (Estudantes)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formData.members?.length || 0} estudantes cadastrados no InovaIF
                  </p>
                </div>
              </div>

              <UIButton
                id="btn-add-member"
                type="button"
                variant="primary"
                size="sm"
                onClick={handleOpenAddMember}
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar Integrante</span>
              </UIButton>
            </div>

            {/* List of members */}
            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {formData.members?.length === 0 ? (
                <EmptyState
                  icon={<Users className="w-7 h-7" />}
                  title="Nenhum integrante cadastrado"
                  description='Clique em "Adicionar Integrante" para incluir estudantes na equipe.'
                />
              ) : (
                formData.members.map((member, idx) => (
                  <SubtlePanel
                    key={member.id}
                    padding="sm"
                    className="flex items-center justify-between gap-2 hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#EBF5F0] dark:bg-emerald-950/60 text-xs font-bold text-[#16845B] dark:text-emerald-400 shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#172B2A] dark:text-slate-100 truncate">
                          {member.name}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-mono bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                            Matrícula: {member.registrationNumber || "Não informada"}
                          </span>
                          {member.role && (
                            <span className="hidden sm:inline text-slate-400 dark:text-slate-500 truncate">
                              • {member.role}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMoveMember(idx, "up")}
                        disabled={idx === 0}
                        className="p-1 text-slate-400 hover:text-[#172B2A] dark:hover:text-slate-200 disabled:opacity-20 rounded cursor-pointer"
                        title="Mover para cima"
                      >
                        <MoveUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveMember(idx, "down")}
                        disabled={idx === formData.members.length - 1}
                        className="p-1 text-slate-400 hover:text-[#172B2A] dark:hover:text-slate-200 disabled:opacity-20 rounded cursor-pointer"
                        title="Mover para baixo"
                      >
                        <MoveDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEditMember(member)}
                        className="p-1.5 text-[#16845B] dark:text-emerald-400 hover:bg-[#EBF5F0] dark:hover:bg-emerald-950/40 rounded-lg transition-colors cursor-pointer"
                        title="Editar integrante"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteMember(member.id)}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                        title="Excluir integrante"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </SubtlePanel>
                ))
              )}
            </div>

            {/* Live formatting preview */}
            <SubtlePanel padding="sm" className="space-y-2 text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-[#16845B] dark:text-emerald-400" />
                Prévia da tag {"{{integrantes_com_matricula}}"}:
              </span>
              <p className="font-mono text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 break-words">
                {projectTags.integrantes_com_matricula || "Nenhum integrante cadastrado."}
              </p>
            </SubtlePanel>
          </SurfaceCard>
        </div>

        {/* Right Column: Professor e Instituição */}
        <div className="space-y-8">
          {/* Card 3: Professor Responsável */}
          <SurfaceCard padding="md" className="space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <GraduationCap className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              <h2 className="text-base font-bold text-[#172B2A] dark:text-slate-100">
                3. Professor(a) Responsável & Orientador
              </h2>
            </div>

            <div className="space-y-3.5">
              <UIFieldGroup label="Nome Completo do Docente" htmlFor="input-prof-name">
                <UIInput
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
                />
              </UIFieldGroup>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <UIFieldGroup label="Titulação Acadêmica" htmlFor="input-prof-title">
                  <UIInput
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
                  />
                </UIFieldGroup>

                <UIFieldGroup label="Cargo / Função no Campus" htmlFor="input-prof-role">
                  <UIInput
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
                  />
                </UIFieldGroup>
              </div>

              {/* Tag doc preview */}
              <SubtlePanel padding="sm" className="space-y-1 text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  Prévia da tag {"{{docente_completo}}"}:
                </span>
                <p className="font-mono text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                  {projectTags.docente_completo}
                </p>
              </SubtlePanel>
            </div>
          </SurfaceCard>

          {/* Card 4: Dados Institucionais do IFPR */}
          <SurfaceCard padding="md" className="space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <Building2 className="w-5 h-5 text-[#16845B] dark:text-emerald-400" />
              <h2 className="text-base font-bold text-[#172B2A] dark:text-slate-100">
                4. Dados Institucionais do Campus
              </h2>
            </div>

            <div className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <UIFieldGroup label="Instituição" htmlFor="input-inst-name">
                  <UIInput
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
                  />
                </UIFieldGroup>

                <UIFieldGroup label="Campus" htmlFor="input-inst-campus">
                  <UIInput
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
                  />
                </UIFieldGroup>
              </div>

              <UIFieldGroup label="Endereço / Logradouro" htmlFor="input-inst-address">
                <UIInput
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
                />
              </UIFieldGroup>

              <div className="grid grid-cols-3 gap-3.5">
                <UIFieldGroup label="Cidade" htmlFor="input-inst-city">
                  <UIInput
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
                  />
                </UIFieldGroup>

                <UIFieldGroup label="Estado (UF)" htmlFor="input-inst-state">
                  <UIInput
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
                  />
                </UIFieldGroup>

                <UIFieldGroup label="CEP" htmlFor="input-inst-zip">
                  <UIInput
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
                  />
                </UIFieldGroup>
              </div>

              {/* Tag address preview */}
              <SubtlePanel padding="sm" className="space-y-1 text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  Prévia da tag {"{{endereco_completo}}"}:
                </span>
                <p className="font-mono text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                  {projectTags.endereco_completo}
                </p>
              </SubtlePanel>
            </div>
          </SurfaceCard>
        </div>
      </div>

      {/* Section 5: Dynamic Tags Palette for Template Authors */}
      <SurfaceCard padding="md" className="space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <FileCode2 className="w-5 h-5 text-[#16845B] dark:text-emerald-400" />
            <div>
              <h2 className="text-base font-bold text-[#172B2A] dark:text-slate-100">
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
            <SubtlePanel
              key={item.tag}
              padding="sm"
              className="flex flex-col justify-between hover:border-[#16845B]/40 dark:hover:border-emerald-700 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-xs font-bold text-[#172B2A] dark:text-slate-100">
                    {item.label}
                  </span>
                  <UIBadge tone="emerald">{item.category}</UIBadge>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  {item.description}
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/60">
                <code className="text-xs font-mono font-bold text-[#16845B] dark:text-emerald-400">
                  {`{{${item.tag}}}`}
                </code>
                <UIButton
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyTag(item.tag)}
                  className="!px-2.5 !py-1 !text-[11px]"
                >
                  {copiedTag === item.tag ? (
                    <>
                      <Check className="w-3 h-3 text-[#16845B] dark:text-emerald-400" />
                      <span>Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-slate-400" />
                      <span>Copiar</span>
                    </>
                  )}
                </UIButton>
              </div>
            </SubtlePanel>
          ))}
        </div>
      </SurfaceCard>

      {/* Member Modal (Add / Edit) */}
      <ModalShell
        isOpen={isMemberModalOpen}
        onClose={() => setIsMemberModalOpen(false)}
        maxWidthClass="max-w-md"
        ariaLabel={editingMember ? "Editar Integrante" : "Novo Integrante da Equipe"}
      >
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-[#EBF5F0] dark:bg-emerald-950/60 text-[#16845B] dark:text-emerald-400">
                <Users className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-[#172B2A] dark:text-slate-100">
                {editingMember ? "Editar Integrante" : "Novo Integrante da Equipe"}
              </h3>
            </div>
            <UIButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsMemberModalOpen(false)}
              className="!p-1.5"
              aria-label="Fechar modal"
            >
              ✕
            </UIButton>
          </div>

          <form onSubmit={handleSaveMemberModal} className="space-y-4">
            <UIFieldGroup label="Nome Completo" required>
              <UIInput
                type="text"
                required
                value={memberForm.name}
                onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
                placeholder="Ex: Gabriel Oliveira da Silva"
              />
            </UIFieldGroup>

            <UIFieldGroup label="Número de Matrícula (IFPR)" required>
              <UIInput
                type="text"
                required
                value={memberForm.registrationNumber}
                onChange={(e) =>
                  setMemberForm({ ...memberForm, registrationNumber: e.target.value })
                }
                placeholder="Ex: 20251IVA10030010"
                className="font-mono"
              />
            </UIFieldGroup>

            <UIFieldGroup label="Função no Projeto">
              <UIInput
                type="text"
                value={memberForm.role}
                onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })}
                placeholder="Ex: Estudante Pesquisador / Desenvolvedor"
              />
            </UIFieldGroup>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <UIButton
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsMemberModalOpen(false)}
              >
                Cancelar
              </UIButton>
              <UIButton type="submit" variant="primary" size="sm">
                {editingMember ? "Salvar Alterações" : "Adicionar Integrante"}
              </UIButton>
            </div>
          </form>
        </div>
      </ModalShell>
    </div>
  );
};

export { ProjectConfigView } from "./ProjectConfigView";
