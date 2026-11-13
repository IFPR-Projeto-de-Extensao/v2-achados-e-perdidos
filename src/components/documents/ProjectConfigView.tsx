import React, { useState, useEffect, useRef } from "react";
import { useApp } from "../../context/AppContext";
import { ProjectSettings, ProjectTeamMember, UserRole } from "../../types";
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
  ShieldAlert,
  Download,
  Upload,
  RefreshCw,
  Eye,
  FileText,
} from "lucide-react";
import { SurfaceCard, SubtlePanel, UIButton, UIBadge, UIFieldGroup, UIInput, EmptyState, ModalShell } from "../ui";

/**
 * Componente ProjectConfigView
 * Painel Administrativo de Configuração dos Dados do Projeto (InovaIF),
 * Integrantes da Equipe, Professor Responsável e Dados Institucionais do IFPR.
 *
 * Inclui validação de permissão de Administrador (role === 'ADMIN').
 */
export const ProjectConfigView: React.FC = () => {
  const {
    currentUser,
    projectSettings,
    saveProjectSettings,
    resetProjectSettingsToDefault,
    addToast,
  } = useApp();

  const isAdmin = currentUser?.role === "ADMIN";

  const [formData, setFormData] = useState<ProjectSettings>(() => {
    return JSON.parse(JSON.stringify(projectSettings || DEFAULT_PROJECT_SETTINGS));
  });

  // Atualizar o estado local caso as configurações venham do Firestore posteriormente
  useEffect(() => {
    if (projectSettings) {
      setFormData(JSON.parse(JSON.stringify(projectSettings)));
    }
  }, [projectSettings]);

  const [isSaving, setIsSaving] = useState(false);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"equipe" | "professor" | "instituicao" | "tags">("equipe");

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

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Se o usuário não for administrador, exibir tela de aviso com bloqueio
  if (!isAdmin) {
    return (
      <SurfaceCard padding="lg" className="max-w-4xl mx-auto text-center border-red-200 dark:border-red-900/30 space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto border border-red-200/70 dark:border-red-900/40">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-[#172B2A] dark:text-white tracking-tight">
          Acesso Restrito a Administradores
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          Apenas usuários com a função de <strong>ADMINISTRADOR</strong> possuem permissão para visualizar e configurar as informações permanentes do projeto no Firebase/Firestore.
        </p>
      </SurfaceCard>
    );
  }

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
      addToast("Dados do projeto salvos com sucesso no Firestore!", "success");
    } catch (e) {
      console.error(e);
      addToast("Erro ao salvar dados do projeto.", "error");
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
        addToast("Configurações restauradas para o padrão oficial!", "success");
      } catch (e) {
        console.error(e);
        addToast("Erro ao restaurar configurações.", "error");
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Exportar JSON
  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(formData, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `inovaif-project-settings-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    addToast("Backup JSON dos dados do projeto exportado!", "success");
  };

  // Importar JSON
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed.teamName || !parsed.institution) {
          throw new Error("Estrutura de arquivo inválida.");
        }
        setFormData(parsed);
        addToast("Arquivo JSON importado com sucesso! Clique em 'Salvar Alterações' para persistir.", "success");
      } catch {
        addToast("Erro ao processar arquivo JSON. Verifique o formato.", "error");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
    <div className="space-y-6">
      {/* Top Banner / Controls */}
      <SurfaceCard padding="md" className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-[#EBF5F0] dark:bg-[#16845B]/20 text-[#16845B] dark:text-emerald-400 border border-[#16845B]/15 flex items-center justify-center shrink-0">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center flex-wrap gap-2">
              <h2 className="text-xl font-bold text-[#172B2A] dark:text-white tracking-tight">
                Dados do Projeto InovaIF
              </h2>
              <UIBadge tone="emerald">Firestore Conectado</UIBadge>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Informações permanentes da equipe, integrantes, orientador e campus para preenchimento de documentos e PDFs
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <UIButton variant="secondary" size="sm" onClick={handleExportJson} title="Exportar dados em JSON">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar</span>
          </UIButton>

          <label
            title="Importar JSON"
            className="inline-flex items-center justify-center font-semibold px-3 py-1.5 text-xs rounded-lg gap-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#172B2A] dark:text-slate-100 hover:bg-[#F8FAFC] dark:hover:bg-slate-700 cursor-pointer transition-all shadow-2xs"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Importar</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportJson}
              className="hidden"
            />
          </label>

          <UIButton variant="secondary" size="sm" onClick={handleReset} disabled={isSaving}>
            <RotateCcw className="w-4 h-4" />
            <span>Restaurar Padrão</span>
          </UIButton>

          <UIButton variant="primary" size="md" onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Salvando no Firestore...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Salvar Alterações</span>
              </>
            )}
          </UIButton>
        </div>
      </SurfaceCard>

      {/* Sub navigation within Project Config */}
      <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto">
        <UIButton
          variant={activeTab === "equipe" ? "primary" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("equipe")}
        >
          <Users className="w-4 h-4" />
          <span>Equipe & Integrantes ({formData.members?.length || 0})</span>
        </UIButton>

        <UIButton
          variant={activeTab === "professor" ? "primary" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("professor")}
        >
          <GraduationCap className="w-4 h-4" />
          <span>Professor Orientador</span>
        </UIButton>

        <UIButton
          variant={activeTab === "instituicao" ? "primary" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("instituicao")}
        >
          <Building2 className="w-4 h-4" />
          <span>Campus & Instituição</span>
        </UIButton>

        <UIButton
          variant={activeTab === "tags" ? "primary" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("tags")}
        >
          <FileCode2 className="w-4 h-4" />
          <span>Marcadores Dinâmicos (Tags)</span>
        </UIButton>
      </div>

      {/* TAB 1: EQUIPE E INTEGRANTES */}
      {activeTab === "equipe" && (
        <div className="space-y-6">
          {/* Nome da Equipe */}
          <SurfaceCard padding="md" className="space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-[#EBF5F0] dark:bg-[#16845B]/20 text-[#16845B] dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#172B2A] dark:text-white">
                  Identificação da Equipe / Projeto
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Nome oficial exibido no cabeçalho e corpo dos termos de aceite
                </p>
              </div>
            </div>

            <UIFieldGroup label="Nome da Equipe / Solução">
              <UIInput
                type="text"
                value={formData.teamName}
                onChange={(e) => setFormData({ ...formData, teamName: e.target.value })}
                placeholder="Ex: InovaIF"
                className="font-semibold"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Disponível na tag: <code className="text-[#16845B] dark:text-emerald-400 font-mono font-bold">{"{{nome_equipe}}"}</code>
              </p>
            </UIFieldGroup>
          </SurfaceCard>

          {/* Lista de Integrantes */}
          <SurfaceCard padding="md" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#172B2A] dark:text-white">
                    Integrantes da Equipe ({formData.members?.length || 0})
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Estudantes pesquisadores e desenvolvedores com respectivas matrículas acadêmicas
                  </p>
                </div>
              </div>

              <UIButton variant="primary" size="sm" onClick={handleOpenAddMember}>
                <Plus className="w-4 h-4" />
                <span>Adicionar Integrante</span>
              </UIButton>
            </div>

            {/* Tabela / Lista de Membros */}
            {(!formData.members || formData.members.length === 0) ? (
              <EmptyState
                icon={<Users className="w-6 h-6" />}
                title="Nenhum integrante cadastrado"
                description="Clique no botão acima para adicionar estudantes participantes à equipe."
              />
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                {formData.members.map((member, idx) => (
                  <div
                    key={member.id || idx}
                    className="p-4 flex items-center justify-between hover:bg-[#F8FAFC] dark:hover:bg-slate-800/40 transition-colors gap-3"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center justify-center shrink-0 tabular-nums">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center flex-wrap gap-2">
                          <span className="text-sm font-bold text-[#172B2A] dark:text-white truncate">
                            {member.name}
                          </span>
                          {idx === 0 && <UIBadge tone="emerald">Representante</UIBadge>}
                        </div>
                        <div className="flex items-center flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          <span>
                            Matrícula:{" "}
                            <strong className="font-mono text-[#172B2A] dark:text-slate-300">
                              {member.registrationNumber || "Não informada"}
                            </strong>
                          </span>
                          <span>•</span>
                          <span>{member.role || "Desenvolvedor"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMoveMember(idx, "up")}
                        disabled={idx === 0}
                        title="Mover para cima"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-[#172B2A] dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                      >
                        <MoveUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveMember(idx, "down")}
                        disabled={idx === (formData.members?.length || 0) - 1}
                        title="Mover para baixo"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-[#172B2A] dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                      >
                        <MoveDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEditMember(member)}
                        title="Editar integrante"
                        className="p-1.5 rounded-lg text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteMember(member.id)}
                        title="Remover integrante"
                        className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SurfaceCard>
        </div>
      )}

      {/* TAB 2: PROFESSOR ORIENTADOR */}
      {activeTab === "professor" && (
        <SurfaceCard padding="md" className="space-y-6">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <GraduationCap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#172B2A] dark:text-white">
                Professor(a) Responsável / Orientador(a)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Docente orientador responsável pela validação e visto dos documentos de extensão
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UIFieldGroup label="Nome Completo do Professor">
              <UIInput
                type="text"
                value={formData.professor?.name || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    professor: { ...formData.professor, name: e.target.value },
                  })
                }
                placeholder="Ex: Ronan Anacleto Lopes"
                className="font-semibold"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Tag: <code className="text-[#16845B] dark:text-emerald-400 font-mono font-bold">{"{{professor_responsavel}}"}</code>
              </p>
            </UIFieldGroup>

            <UIFieldGroup label="Titulação Acadêmica">
              <UIInput
                type="text"
                value={formData.professor?.title || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    professor: { ...formData.professor, title: e.target.value },
                  })
                }
                placeholder="Ex: Mestre, Doutor, Especialista"
                className="font-semibold"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Tag: <code className="text-[#16845B] dark:text-emerald-400 font-mono font-bold">{"{{formacao_professor}}"}</code>
              </p>
            </UIFieldGroup>

            <div className="md:col-span-2">
              <UIFieldGroup label="Cargo / Função no IFPR">
                <UIInput
                  type="text"
                  value={formData.professor?.role || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      professor: { ...formData.professor, role: e.target.value },
                    })
                  }
                  placeholder="Ex: Coordenador do Curso de Sistemas de Informação"
                  className="font-semibold"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Tag: <code className="text-[#16845B] dark:text-emerald-400 font-mono font-bold">{"{{cargo_professor}}"}</code>
                </p>
              </UIFieldGroup>
            </div>
          </div>
        </SurfaceCard>
      )}

      {/* TAB 3: CAMPUS & INSTITUIÇÃO */}
      {activeTab === "instituicao" && (
        <SurfaceCard padding="md" className="space-y-6">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-[#EBF5F0] dark:bg-[#16845B]/20 text-[#16845B] dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#172B2A] dark:text-white">
                Dados Institucionais do IFPR
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Endereçamento oficial, campus e informações que compõem o cabeçalho e rodapé dos documentos
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UIFieldGroup label="Nome da Instituição">
              <UIInput
                type="text"
                value={formData.institution?.name || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    institution: { ...formData.institution, name: e.target.value },
                  })
                }
                placeholder="Ex: Instituto Federal do Paraná"
                className="font-semibold"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Tag: <code className="text-[#16845B] dark:text-emerald-400 font-mono font-bold">{"{{instituicao}}"}</code>
              </p>
            </UIFieldGroup>

            <UIFieldGroup label="Campus de Lotação">
              <UIInput
                type="text"
                value={formData.institution?.campus || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    institution: { ...formData.institution, campus: e.target.value },
                  })
                }
                placeholder="Ex: Campus Ivaiporã"
                className="font-semibold"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Tag: <code className="text-[#16845B] dark:text-emerald-400 font-mono font-bold">{"{{campus}}"}</code>
              </p>
            </UIFieldGroup>

            <div className="md:col-span-2">
              <UIFieldGroup label="Endereço do Campus (Rua, Número, Bairro)">
                <UIInput
                  type="text"
                  value={formData.institution?.address || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      institution: { ...formData.institution, address: e.target.value },
                    })
                  }
                  placeholder="Ex: Rua Max Arthur Greipel, nº 505 - Parque Industrial"
                  className="font-semibold"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Tag: <code className="text-[#16845B] dark:text-emerald-400 font-mono font-bold">{"{{endereco_instituicao}}"}</code>
                </p>
              </UIFieldGroup>
            </div>

            <UIFieldGroup label="Cidade">
              <UIInput
                type="text"
                value={formData.institution?.city || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    institution: { ...formData.institution, city: e.target.value },
                  })
                }
                placeholder="Ex: Ivaiporã"
                className="font-semibold"
              />
            </UIFieldGroup>

            <div className="grid grid-cols-2 gap-2">
              <UIFieldGroup label="UF (Estado)">
                <UIInput
                  type="text"
                  value={formData.institution?.state || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      institution: { ...formData.institution, state: e.target.value },
                    })
                  }
                  placeholder="PR"
                  maxLength={2}
                  className="font-semibold uppercase"
                />
              </UIFieldGroup>
              <UIFieldGroup label="CEP">
                <UIInput
                  type="text"
                  value={formData.institution?.zipCode || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      institution: { ...formData.institution, zipCode: e.target.value },
                    })
                  }
                  placeholder="86873-400"
                  className="font-semibold"
                />
              </UIFieldGroup>
            </div>

            <div className="md:col-span-2 p-3.5 bg-[#EBF5F0] dark:bg-emerald-950/20 border border-[#16845B]/20 dark:border-emerald-900/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <span className="text-[#064E3B] dark:text-emerald-300 font-medium">
                Endereço unificado para rodapé: <strong>{projectTags.endereco_completo}</strong>
              </span>
              <UIButton variant="primary" size="sm" onClick={() => handleCopyTag("endereco_completo")}>
                <Copy className="w-3 h-3" />
                <span>Copiar Tag</span>
              </UIButton>
            </div>
          </div>
        </SurfaceCard>
      )}

      {/* TAB 4: VISUALIZADOR DE MARCADORES DINÂMICOS */}
      {activeTab === "tags" && (
        <SurfaceCard padding="md" className="space-y-4">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <FileCode2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#172B2A] dark:text-white">
                Marcadores Dinâmicos Disponíveis para Modelos
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Insira estas tags nos modelos de documentos (cabeçalho, seções, parágrafos ou assinaturas). Ao gerar o PDF, os valores abaixo serão substituídos automaticamente.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {PROJECT_AVAILABLE_TAGS.map((tagInfo) => {
              const currentValue = projectTags[tagInfo.tag] || tagInfo.example(formData);
              const isCopied = copiedTag === tagInfo.tag;

              return (
                <SubtlePanel
                  key={tagInfo.tag}
                  padding="sm"
                  className="flex flex-col justify-between space-y-2 hover:border-[#16845B]/40 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center flex-wrap gap-1.5">
                        <code className="text-xs font-mono font-bold text-[#064E3B] dark:text-emerald-300 bg-[#EBF5F0] dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-[#16845B]/20">
                          {"{{" + tagInfo.tag + "}}"}
                        </code>
                        <UIBadge tone="slate">{tagInfo.category}</UIBadge>
                      </div>
                      <span className="text-xs font-bold text-[#172B2A] dark:text-slate-200 mt-1.5 block">
                        {tagInfo.label}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopyTag(tagInfo.tag)}
                      title="Copiar marcador"
                      className="p-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-[#EBF5F0] dark:hover:bg-[#16845B]/20 hover:text-[#16845B] transition-all shadow-2xs cursor-pointer"
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5 text-[#16845B]" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {tagInfo.description}
                  </p>

                  <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 text-xs">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Valor resolvido atual:
                    </span>
                    <span className="text-[#172B2A] dark:text-white font-medium break-words">
                      {currentValue || "(Vazio)"}
                    </span>
                  </div>
                </SubtlePanel>
              );
            })}
          </div>
        </SurfaceCard>
      )}

      {/* MODAL: ADICIONAR / EDITAR INTEGRANTE */}
      <ModalShell
        isOpen={isMemberModalOpen}
        onClose={() => setIsMemberModalOpen(false)}
        maxWidthClass="max-w-md"
        ariaLabel={editingMember ? "Editar Integrante" : "Novo Integrante"}
      >
        <div className="p-6 space-y-5">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-[#EBF5F0] dark:bg-[#16845B]/20 text-[#16845B] dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#172B2A] dark:text-white">
                {editingMember ? "Editar Integrante" : "Novo Integrante"}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Membro da equipe desenvolvedora
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveMemberModal} className="space-y-4">
            <UIFieldGroup label="Nome Completo do Estudante" required>
              <UIInput
                type="text"
                required
                value={memberForm.name}
                onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
                placeholder="Ex: Gabriel Oliveira da Silva"
              />
            </UIFieldGroup>

            <UIFieldGroup label="Número de Matrícula" required>
              <UIInput
                type="text"
                required
                value={memberForm.registrationNumber}
                onChange={(e) =>
                  setMemberForm({ ...memberForm, registrationNumber: e.target.value })
                }
                placeholder="Ex: 20251IVA10030010"
                className="font-mono uppercase"
              />
            </UIFieldGroup>

            <UIFieldGroup label="Função / Papel no Projeto">
              <UIInput
                type="text"
                value={memberForm.role}
                onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })}
                placeholder="Ex: Estudante Pesquisador / Desenvolvedor"
              />
            </UIFieldGroup>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <UIButton variant="secondary" size="md" onClick={() => setIsMemberModalOpen(false)}>
                Cancelar
              </UIButton>
              <UIButton type="submit" variant="primary" size="md">
                {editingMember ? "Atualizar" : "Adicionar"}
              </UIButton>
            </div>
          </form>
        </div>
      </ModalShell>
    </div>
  );
};
