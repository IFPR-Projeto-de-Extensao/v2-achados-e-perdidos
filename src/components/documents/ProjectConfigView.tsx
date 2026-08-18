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
      <div className="p-8 max-w-4xl mx-auto text-center bg-white dark:bg-[#1E1E1E] rounded-3xl border border-red-200 dark:border-red-900/30 shadow-lg space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-neutral-900 dark:text-white">
          Acesso Restrito a Administradores
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-md mx-auto">
          Apenas usuários com a função de <strong>ADMINISTRADOR</strong> possuem permissão para visualizar e configurar as informações permanentes do projeto no Firebase/Firestore.
        </p>
      </div>
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#1E1E1E] p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-black text-neutral-900 dark:text-white">
                Dados do Projeto InovaIF
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
                Firestore Conectado
              </span>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Informações permanentes da equipe, integrantes, orientador e campus para preenchimento de documentos e PDFs
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportJson}
            title="Exportar dados em JSON"
            className="p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 text-xs font-bold flex items-center space-x-1.5 transition-all"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar</span>
          </button>

          <label
            title="Importar JSON"
            className="p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 text-xs font-bold flex items-center space-x-1.5 cursor-pointer transition-all"
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

          <button
            onClick={handleReset}
            disabled={isSaving}
            className="px-3.5 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-xs font-bold flex items-center space-x-1.5 transition-all shadow-xs"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Restaurar Padrão</span>
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-black flex items-center space-x-2 transition-all shadow-md"
          >
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
          </button>
        </div>
      </div>

      {/* Sub navigation within Project Config */}
      <div className="flex items-center space-x-2 border-b border-neutral-200 dark:border-neutral-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab("equipe")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
            activeTab === "equipe"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Equipe & Integrantes ({formData.members?.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveTab("professor")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
            activeTab === "professor"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          <span>Professor Orientador</span>
        </button>

        <button
          onClick={() => setActiveTab("instituicao")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
            activeTab === "instituicao"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Campus & Instituição</span>
        </button>

        <button
          onClick={() => setActiveTab("tags")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
            activeTab === "tags"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          }`}
        >
          <FileCode2 className="w-4 h-4" />
          <span>Marcadores Dinâmicos (Tags)</span>
        </button>
      </div>

      {/* TAB 1: EQUIPE E INTEGRANTES */}
      {activeTab === "equipe" && (
        <div className="space-y-6">
          {/* Nome da Equipe */}
          <div className="bg-white dark:bg-[#1E1E1E] p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-black text-neutral-900 dark:text-white">
                  Identificação da Equipe / Projeto
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Nome oficial exibido no cabeçalho e corpo dos termos de aceite
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-neutral-700 dark:text-neutral-300 mb-1.5">
                Nome da Equipe / Solução
              </label>
              <input
                type="text"
                value={formData.teamName}
                onChange={(e) => setFormData({ ...formData, teamName: e.target.value })}
                placeholder="Ex: InovaIF"
                className="w-full px-4 py-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              />
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                Disponível na tag: <code className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">{"{{nome_equipe}}"}</code>
              </p>
            </div>
          </div>

          {/* Lista de Integrantes */}
          <div className="bg-white dark:bg-[#1E1E1E] p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-neutral-900 dark:text-white">
                    Integrantes da Equipe ({formData.members?.length || 0})
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Estudantes pesquisadores e desenvolvedores com respectivas matrículas acadêmicas
                  </p>
                </div>
              </div>

              <button
                onClick={handleOpenAddMember}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center space-x-1.5 transition-all shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar Integrante</span>
              </button>
            </div>

            {/* Tabela / Lista de Membros */}
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden">
              {formData.members?.map((member, idx) => (
                <div
                  key={member.id || idx}
                  className="p-4 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 text-xs font-black flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-black text-neutral-900 dark:text-white truncate">
                          {member.name}
                        </span>
                        {idx === 0 && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                            Representante
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-3 text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                        <span>Matrícula: <strong className="font-mono text-neutral-700 dark:text-neutral-300">{member.registrationNumber || "Não informada"}</strong></span>
                        <span>•</span>
                        <span>{member.role || "Desenvolvedor"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 shrink-0">
                    <button
                      onClick={() => handleMoveMember(idx, "up")}
                      disabled={idx === 0}
                      title="Mover para cima"
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 disabled:opacity-30"
                    >
                      <MoveUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleMoveMember(idx, "down")}
                      disabled={idx === (formData.members?.length || 0) - 1}
                      title="Mover para baixo"
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 disabled:opacity-30"
                    >
                      <MoveDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleOpenEditMember(member)}
                      title="Editar integrante"
                      className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteMember(member.id)}
                      title="Remover integrante"
                      className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

              {(!formData.members || formData.members.length === 0) && (
                <div className="p-8 text-center text-xs text-neutral-400">
                  Nenhum integrante cadastrado. Clique no botão acima para adicionar.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PROFESSOR ORIENTADOR */}
      {activeTab === "professor" && (
        <div className="bg-white dark:bg-[#1E1E1E] p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-6">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <GraduationCap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-neutral-900 dark:text-white">
                Professor(a) Responsável / Orientador(a)
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Docente orientador responsável pela validação e visto dos documentos de extensão
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-neutral-700 dark:text-neutral-300 mb-1.5">
                Nome Completo do Professor
              </label>
              <input
                type="text"
                value={formData.professor?.name || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    professor: { ...formData.professor, name: e.target.value },
                  })
                }
                placeholder="Ex: Ronan Anacleto Lopes"
                className="w-full px-4 py-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              />
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                Tag: <code className="text-emerald-600 font-mono font-bold">{"{{professor_responsavel}}"}</code>
              </p>
            </div>

            <div>
              <label className="block text-xs font-black text-neutral-700 dark:text-neutral-300 mb-1.5">
                Titulação Acadêmica
              </label>
              <input
                type="text"
                value={formData.professor?.title || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    professor: { ...formData.professor, title: e.target.value },
                  })
                }
                placeholder="Ex: Mestre, Doutor, Especialista"
                className="w-full px-4 py-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              />
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                Tag: <code className="text-emerald-600 font-mono font-bold">{"{{formacao_professor}}"}</code>
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-black text-neutral-700 dark:text-neutral-300 mb-1.5">
                Cargo / Função no IFPR
              </label>
              <input
                type="text"
                value={formData.professor?.role || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    professor: { ...formData.professor, role: e.target.value },
                  })
                }
                placeholder="Ex: Coordenador do Curso de Sistemas de Informação"
                className="w-full px-4 py-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              />
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                Tag: <code className="text-emerald-600 font-mono font-bold">{"{{cargo_professor}}"}</code>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CAMPUS & INSTITUIÇÃO */}
      {activeTab === "instituicao" && (
        <div className="bg-white dark:bg-[#1E1E1E] p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-6">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-neutral-900 dark:text-white">
                Dados Institucionais do IFPR
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Endereçamento oficial, campus e informações que compõem o cabeçalho e rodapé dos documentos
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-neutral-700 dark:text-neutral-300 mb-1.5">
                Nome da Instituição
              </label>
              <input
                type="text"
                value={formData.institution?.name || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    institution: { ...formData.institution, name: e.target.value },
                  })
                }
                placeholder="Ex: Instituto Federal do Paraná"
                className="w-full px-4 py-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              />
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                Tag: <code className="text-emerald-600 font-mono font-bold">{"{{instituicao}}"}</code>
              </p>
            </div>

            <div>
              <label className="block text-xs font-black text-neutral-700 dark:text-neutral-300 mb-1.5">
                Campus de Lotação
              </label>
              <input
                type="text"
                value={formData.institution?.campus || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    institution: { ...formData.institution, campus: e.target.value },
                  })
                }
                placeholder="Ex: Campus Ivaiporã"
                className="w-full px-4 py-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              />
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                Tag: <code className="text-emerald-600 font-mono font-bold">{"{{campus}}"}</code>
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-black text-neutral-700 dark:text-neutral-300 mb-1.5">
                Endereço do Campus (Rua, Número, Bairro)
              </label>
              <input
                type="text"
                value={formData.institution?.address || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    institution: { ...formData.institution, address: e.target.value },
                  })
                }
                placeholder="Ex: Rua Max Arthur Greipel, nº 505 - Parque Industrial"
                className="w-full px-4 py-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              />
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                Tag: <code className="text-emerald-600 font-mono font-bold">{"{{endereco_instituicao}}"}</code>
              </p>
            </div>

            <div>
              <label className="block text-xs font-black text-neutral-700 dark:text-neutral-300 mb-1.5">
                Cidade
              </label>
              <input
                type="text"
                value={formData.institution?.city || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    institution: { ...formData.institution, city: e.target.value },
                  })
                }
                placeholder="Ex: Ivaiporã"
                className="w-full px-4 py-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              />
            </div>

            <div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-black text-neutral-700 dark:text-neutral-300 mb-1.5">
                    UF (Estado)
                  </label>
                  <input
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
                    className="w-full px-4 py-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-neutral-700 dark:text-neutral-300 mb-1.5">
                    CEP
                  </label>
                  <input
                    type="text"
                    value={formData.institution?.zipCode || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        institution: { ...formData.institution, zipCode: e.target.value },
                      })
                    }
                    placeholder="86873-400"
                    className="w-full px-4 py-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>

            <div className="md:col-span-2 p-3 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl flex items-center justify-between text-xs">
              <span className="text-emerald-900 dark:text-emerald-300 font-medium">
                Endereço unificado para rodapé: <strong>{projectTags.endereco_completo}</strong>
              </span>
              <button
                onClick={() => handleCopyTag("endereco_completo")}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[11px] flex items-center space-x-1 shrink-0"
              >
                <Copy className="w-3 h-3" />
                <span>Copiar Tag</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: VISUALIZADOR DE MARCADORES DINÂMICOS */}
      {activeTab === "tags" && (
        <div className="bg-white dark:bg-[#1E1E1E] p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-4">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <FileCode2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-neutral-900 dark:text-white">
                Marcadores Dinâmicos Disponíveis para Modelos
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Insira estas tags nos modelos de documentos (cabeçalho, seções, parágrafos ou assinaturas). Ao gerar o PDF, os valores abaixo serão substituídos automaticamente.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {PROJECT_AVAILABLE_TAGS.map((tagInfo) => {
              const currentValue = projectTags[tagInfo.tag] || tagInfo.example(formData);
              const isCopied = copiedTag === tagInfo.tag;

              return (
                <div
                  key={tagInfo.tag}
                  className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 flex flex-col justify-between space-y-2 hover:border-emerald-300 dark:hover:border-emerald-800 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <code className="text-xs font-mono font-black text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md">
                          {"{{" + tagInfo.tag + "}}"}
                        </code>
                        <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded-sm bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300">
                          {tagInfo.category}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200 mt-1 block">
                        {tagInfo.label}
                      </span>
                    </div>

                    <button
                      onClick={() => handleCopyTag(tagInfo.tag)}
                      title="Copiar marcador"
                      className="p-1.5 rounded-lg bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 transition-all shadow-2xs"
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    {tagInfo.description}
                  </p>

                  <div className="pt-2 border-t border-neutral-200/60 dark:border-neutral-800 text-xs">
                    <span className="text-[10px] uppercase font-bold text-neutral-400 block">
                      Valor resolvido atual:
                    </span>
                    <span className="text-neutral-900 dark:text-white font-medium break-words">
                      {currentValue || "(Vazio)"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL: ADICIONAR / EDITAR INTEGRANTE */}
      {isMemberModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-neutral-900 dark:text-white">
                    {editingMember ? "Editar Integrante" : "Novo Integrante"}
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Membro da equipe desenvolvedora
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveMemberModal} className="space-y-4">
              <div>
                <label className="block text-xs font-black text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Nome Completo do Estudante *
                </label>
                <input
                  type="text"
                  required
                  value={memberForm.name}
                  onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
                  placeholder="Ex: Gabriel Oliveira da Silva"
                  className="w-full px-4 py-2.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Número de Matrícula *
                </label>
                <input
                  type="text"
                  required
                  value={memberForm.registrationNumber}
                  onChange={(e) =>
                    setMemberForm({ ...memberForm, registrationNumber: e.target.value })
                  }
                  placeholder="Ex: 20251IVA10030010"
                  className="w-full px-4 py-2.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-sm font-mono font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Função / Papel no Projeto
                </label>
                <input
                  type="text"
                  value={memberForm.role}
                  onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })}
                  placeholder="Ex: Estudante Pesquisador / Desenvolvedor"
                  className="w-full px-4 py-2.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsMemberModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs font-bold hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-all shadow-sm"
                >
                  {editingMember ? "Atualizar" : "Adicionar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
