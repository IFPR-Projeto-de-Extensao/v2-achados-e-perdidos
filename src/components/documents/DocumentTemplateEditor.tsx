import React, { useState } from "react";
import {
  DocumentTemplate,
  DocumentSection,
  DocumentField,
  DocumentSignature,
  DocumentSectionType,
  DocumentFieldType,
} from "../../types";
import { useApp } from "../../context/AppContext";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { PROJECT_AVAILABLE_TAGS } from "../../lib/projectSettingsConstants";
import {
  ArrowLeft,
  Save,
  Eye,
  Plus,
  Trash2,
  MoveUp,
  MoveDown,
  FileText,
  Tag,
  Settings,
  PenTool,
  CheckCircle2,
  Layers,
  Sparkles,
  HelpCircle,
} from "lucide-react";

interface DocumentTemplateEditorProps {
  initialTemplate?: DocumentTemplate | null;
  onBack: () => void;
  onSaveSuccess?: () => void;
}

export const DocumentTemplateEditor: React.FC<DocumentTemplateEditorProps> = ({
  initialTemplate,
  onBack,
  onSaveSuccess,
}) => {
  const { saveDocumentTemplate, addToast, currentUser } = useApp();

  const isEditing = Boolean(initialTemplate && initialTemplate.id);

  // Template State
  const [template, setTemplate] = useState<DocumentTemplate>(() => {
    if (initialTemplate) return JSON.parse(JSON.stringify(initialTemplate));
    return {
      id: `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: "Novo Modelo de Documento",
      code: "NOVO-01",
      category: "INSTITUCIONAL",
      description: "Descrição da finalidade deste documento oficial.",
      status: "ATIVO",
      version: 1,
      headerText:
        "REPÚBLICA FEDERATIVA DO BRASIL\nMINISTÉRIO DA EDUCAÇÃO\nINSTITUTO FEDERAL DO PARANÁ — CAMPUS IVAIPORÃ\nSETOR INSTITUCIONAL",
      institutionLogoUrl: "",
      includeLogo: true,
      includeDocNumber: true,
      includeHeader: true,
      includeFooter: true,
      footerText: "Instituto Federal do Paraná — Campus Ivaiporã · Rodovia PR-466, Gleba Pindaúba",
      sections: [
        {
          id: `sec_${Date.now()}_1`,
          title: "Introdução",
          type: "paragraph",
          content: "O presente documento formaliza a manifestação de interesse entre as partes interessadas.",
          fontSize: 10.5,
          isBold: false,
          isItalic: false,
          align: "justify",
          spacingBottom: 4,
        },
        {
          id: `sec_${Date.now()}_2`,
          title: "1. Dados do Interessado",
          type: "numbered_section",
          content: "• Nome / Entidade: {{nome_interessado}}\n• Documento: {{documento_interessado}}\n• Contato: {{contato_interessado}}",
          fontSize: 10,
          isBold: false,
          isItalic: false,
          align: "left",
          spacingBottom: 4,
        },
        {
          id: `sec_${Date.now()}_3`,
          title: "Local e Data",
          type: "paragraph",
          content: "Ivaiporã - PR, {{data}}.",
          fontSize: 10.5,
          isBold: true,
          isItalic: false,
          align: "right",
          spacingBottom: 8,
        },
      ],
      fields: [
        {
          id: `fld_${Date.now()}_1`,
          name: "nome_interessado",
          label: "Nome do Interessado",
          type: "text",
          defaultValue: "Fulano de Tal",
          placeholder: "Nome completo",
          required: true,
          section: "1. Identificação",
        },
        {
          id: `fld_${Date.now()}_2`,
          name: "documento_interessado",
          label: "Documento (CPF ou CNPJ)",
          type: "text",
          defaultValue: "000.000.000-00",
          placeholder: "CPF ou CNPJ",
          required: true,
          section: "1. Identificação",
        },
        {
          id: `fld_${Date.now()}_3`,
          name: "contato_interessado",
          label: "Contato Telefônico / E-mail",
          type: "text",
          defaultValue: "(43) 99999-9999",
          placeholder: "Telefone ou e-mail",
          required: true,
          section: "1. Identificação",
        },
        {
          id: `fld_${Date.now()}_4`,
          name: "data",
          label: "Data do Documento",
          type: "text",
          defaultValue: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date()),
          placeholder: "Data atual",
          required: true,
          section: "Assinaturas",
        },
      ],
      signatures: [
        {
          id: `sig_${Date.now()}_1`,
          title: "Interessado / Requerente",
          nameTag: "{{nome_interessado}}",
          roleTag: "Requerente",
          cpfOrDocTag: "{{documento_interessado}}",
        },
        {
          id: `sig_${Date.now()}_2`,
          title: "Servidor Responsável (IFPR)",
          nameTag: "Administração IFPR",
          roleTag: "Campus Ivaiporã",
          cpfOrDocTag: "Portaria de Designação",
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdByName: currentUser.name,
      createdByEmail: currentUser.email,
    };
  });

  const [activeEditorTab, setActiveEditorTab] = useState<"general" | "sections" | "fields" | "signatures">("sections");
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Section Handlers
  const handleAddSection = () => {
    const newSection: DocumentSection = {
      id: `sec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: "Nova Seção",
      type: "paragraph",
      content: "Insira o conteúdo do parágrafo aqui...",
      fontSize: 10,
      isBold: false,
      isItalic: false,
      align: "justify",
      spacingBottom: 4,
    };
    setTemplate((prev) => ({ ...prev, sections: [...prev.sections, newSection] }));
  };

  const handleUpdateSection = (id: string, updates: Partial<DocumentSection>) => {
    setTemplate((prev) => ({
      ...prev,
      sections: prev.sections.map((sec) => (sec.id === id ? { ...sec, ...updates } : sec)),
    }));
  };

  const handleRemoveSection = (id: string) => {
    setTemplate((prev) => ({
      ...prev,
      sections: prev.sections.filter((sec) => sec.id !== id),
    }));
  };

  const handleMoveSection = (idx: number, direction: "up" | "down") => {
    const newSections = [...template.sections];
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= newSections.length) return;
    const temp = newSections[idx];
    newSections[idx] = newSections[targetIdx];
    newSections[targetIdx] = temp;
    setTemplate((prev) => ({ ...prev, sections: newSections }));
  };

  const insertTagIntoSection = (sectionId: string, tagName: string) => {
    setTemplate((prev) => ({
      ...prev,
      sections: prev.sections.map((sec) => {
        if (sec.id === sectionId) {
          return {
            ...sec,
            content: `${sec.content} {{${tagName}}}`,
          };
        }
        return sec;
      }),
    }));
    addToast(`Tag {{${tagName}}} inserida na seção.`, "info");
  };

  // Field Handlers
  const handleAddField = () => {
    const newField: DocumentField = {
      id: `fld_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: `campo_${template.fields.length + 1}`,
      label: `Novo Campo ${template.fields.length + 1}`,
      type: "text",
      defaultValue: "",
      placeholder: "",
      required: false,
      section: "Campos Adicionais",
    };
    setTemplate((prev) => ({ ...prev, fields: [...prev.fields, newField] }));
  };

  const handleUpdateField = (id: string, updates: Partial<DocumentField>) => {
    setTemplate((prev) => ({
      ...prev,
      fields: prev.fields.map((fld) => (fld.id === id ? { ...fld, ...updates } : fld)),
    }));
  };

  const handleRemoveField = (id: string) => {
    setTemplate((prev) => ({
      ...prev,
      fields: prev.fields.filter((fld) => fld.id !== id),
    }));
  };

  // Signature Handlers
  const handleAddSignature = () => {
    const newSig: DocumentSignature = {
      id: `sig_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: "Signatário",
      nameTag: "Nome do Signatário",
      roleTag: "Cargo ou Função",
      cpfOrDocTag: "Documento de Identificação",
    };
    setTemplate((prev) => ({ ...prev, signatures: [...(prev.signatures || []), newSig] }));
  };

  const handleUpdateSignature = (id: string, updates: Partial<DocumentSignature>) => {
    setTemplate((prev) => ({
      ...prev,
      signatures: prev.signatures.map((sig) => (sig.id === id ? { ...sig, ...updates } : sig)),
    }));
  };

  const handleRemoveSignature = (id: string) => {
    setTemplate((prev) => ({
      ...prev,
      signatures: prev.signatures.filter((sig) => sig.id !== id),
    }));
  };

  // Save Full Template
  const handleSave = async () => {
    if (!template.title.trim()) {
      addToast("Informe o título do modelo.", "error");
      return;
    }
    if (!template.code.trim()) {
      addToast("Informe o código identificador do modelo.", "error");
      return;
    }

    setIsSaving(true);
    try {
      await saveDocumentTemplate(template);
      if (onSaveSuccess) onSaveSuccess();
      onBack();
    } catch (err) {
      console.error("Erro ao salvar modelo:", err);
      addToast("Erro ao salvar o modelo.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div id="document-template-editor-view" className="space-y-6 animate-fade-in text-slate-100">
      {/* Top Bar Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors border border-slate-700"
            title="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {isEditing ? "Edição de Modelo" : "Novo Modelo"}
              </span>
              <h2 className="text-lg font-bold text-white tracking-tight">{template.title || "Sem Título"}</h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Configure cabeçalho, seções dinâmicas, variáveis e assinaturas</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setIsPreviewOpen(true)}
            className="px-3.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-xl border border-emerald-500/30 transition-colors flex items-center space-x-1.5"
          >
            <Eye className="w-4 h-4" />
            <span>Ver Prévia A4</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-md transition-all flex items-center space-x-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? "Salvando..." : "Salvar Modelo"}</span>
          </button>
        </div>
      </div>

      {/* Editor Navigation Tabs */}
      <div className="flex border-b border-slate-800 space-x-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setActiveEditorTab("sections")}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-colors flex items-center space-x-2 border-b-2 whitespace-nowrap ${
            activeEditorTab === "sections"
              ? "bg-slate-800/80 text-emerald-400 border-emerald-500"
              : "text-slate-400 hover:text-slate-200 border-transparent"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>1. Seções do Documento ({template.sections?.length || 0})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveEditorTab("fields")}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-colors flex items-center space-x-2 border-b-2 whitespace-nowrap ${
            activeEditorTab === "fields"
              ? "bg-slate-800/80 text-emerald-400 border-emerald-500"
              : "text-slate-400 hover:text-slate-200 border-transparent"
          }`}
        >
          <Tag className="w-4 h-4" />
          <span>2. Campos & Variáveis ({template.fields?.length || 0})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveEditorTab("signatures")}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-colors flex items-center space-x-2 border-b-2 whitespace-nowrap ${
            activeEditorTab === "signatures"
              ? "bg-slate-800/80 text-emerald-400 border-emerald-500"
              : "text-slate-400 hover:text-slate-200 border-transparent"
          }`}
        >
          <PenTool className="w-4 h-4" />
          <span>3. Assinaturas ({template.signatures?.length || 0})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveEditorTab("general")}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-colors flex items-center space-x-2 border-b-2 whitespace-nowrap ${
            activeEditorTab === "general"
              ? "bg-slate-800/80 text-emerald-400 border-emerald-500"
              : "text-slate-400 hover:text-slate-200 border-transparent"
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>4. Cabeçalho & Geral</span>
        </button>
      </div>

      {/* Tab 1: SECTIONS OF DOCUMENT */}
      {activeEditorTab === "sections" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-900/50 p-4 rounded-xl border border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white">Estrutura de Conteúdo e Parágrafos</h3>
              <p className="text-xs text-slate-400">
                Organize os blocos de texto. Você pode clicar nas pílulas de variáveis abaixo para inseri-las no texto.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddSection}
              className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-lg transition-colors flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar Seção</span>
            </button>
          </div>

          {/* Quick Insertion Palette */}
          {template.fields && template.fields.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2">
              <span className="text-[11px] font-semibold text-slate-400 flex items-center space-x-1">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Variáveis disponíveis para inserção no texto:</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {template.fields.map((fld) => (
                  <span
                    key={fld.id}
                    className="px-2 py-0.5 text-xs bg-slate-800 text-emerald-300 rounded border border-slate-700 font-mono select-all"
                  >
                    {`{{${fld.name}}}`}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Sections List */}
          <div className="space-y-4">
            {template.sections.map((section, idx) => (
              <div
                key={section.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 relative shadow-sm"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-2">
                    <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-300 text-xs font-bold flex items-center justify-center border border-slate-700">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={section.title}
                      onChange={(e) => handleUpdateSection(section.id, { title: e.target.value })}
                      placeholder="Título da Seção (ex: 1. Dados do Parceiro)"
                      className="bg-transparent border-none text-sm font-bold text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded px-1.5 py-0.5"
                    />
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => handleMoveSection(idx, "up")}
                      disabled={idx === 0}
                      className="p-1 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800 transition-colors"
                      title="Mover para cima"
                    >
                      <MoveUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveSection(idx, "down")}
                      disabled={idx === template.sections.length - 1}
                      className="p-1 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800 transition-colors"
                      title="Mover para baixo"
                    >
                      <MoveDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveSection(section.id)}
                      className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors ml-2"
                      title="Excluir seção"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Tipo de Seção</label>
                    <select
                      value={section.type}
                      onChange={(e) =>
                        handleUpdateSection(section.id, { type: e.target.value as DocumentSectionType })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="paragraph">Parágrafo Padrão</option>
                      <option value="numbered_section">Seção Numerada / Caixa de Dados</option>
                      <option value="declarations_list">Lista de Declarações (I, II, III...)</option>
                      <option value="heading">Título Destacado</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Alinhamento do Texto</label>
                    <select
                      value={section.align || "justify"}
                      onChange={(e) =>
                        handleUpdateSection(section.id, { align: e.target.value as any })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="justify">Justificado</option>
                      <option value="left">Alinhado à Esquerda</option>
                      <option value="center">Centralizado</option>
                      <option value="right">Alinhado à Direita</option>
                    </select>
                  </div>

                  <div className="flex items-center space-x-3 pt-5">
                    <label className="flex items-center space-x-1.5 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(section.isBold)}
                        onChange={(e) => handleUpdateSection(section.id, { isBold: e.target.checked })}
                        className="rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Negrito</span>
                    </label>

                    <label className="flex items-center space-x-1.5 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(section.isItalic)}
                        onChange={(e) => handleUpdateSection(section.id, { isItalic: e.target.checked })}
                        className="rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Itálico</span>
                    </label>
                  </div>
                </div>

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
                    <label className="text-xs text-slate-400">Conteúdo do Texto (Suporta tags dinâmicas)</label>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[10px] text-slate-500 font-semibold mr-1">Inserir:</span>
                      {/* Project quick tags */}
                      {["nome_equipe", "integrantes_com_matricula", "professor_responsavel", "instituicao", "endereco_completo"].map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => insertTagIntoSection(section.id, tag)}
                          className="text-[10px] px-1.5 py-0.5 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 rounded border border-emerald-700/50 transition-colors"
                          title={`Inserir tag do projeto {{${tag}}}`}
                        >
                          + {tag}
                        </button>
                      ))}
                      {/* Custom fields tags */}
                      {template.fields.slice(0, 3).map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => insertTagIntoSection(section.id, f.name)}
                          className="text-[10px] px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded border border-slate-700 transition-colors"
                          title={`Inserir {{${f.name}}}`}
                        >
                          + {f.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    rows={4}
                    value={section.content}
                    onChange={(e) => handleUpdateSection(section.id, { content: e.target.value })}
                    placeholder="Conteúdo do texto..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-emerald-500 leading-relaxed font-sans"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: DYNAMIC FIELDS & VARIABLES */}
      {activeEditorTab === "fields" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-900/50 p-4 rounded-xl border border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white">Campos Dinâmicos e Formulário</h3>
              <p className="text-xs text-slate-400">
                Campos que o administrador preencherá ao gerar o PDF. Cada campo cria uma tag `&#123;&#123;nome_tag&#125;&#125;`.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddField}
              className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-lg transition-colors flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Campo</span>
            </button>
          </div>

          <div className="space-y-3">
            {template.fields.map((field) => (
              <div
                key={field.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
                      {`{{${field.name}}}`}
                    </span>
                    <span className="text-xs font-bold text-slate-200">{field.label}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveField(field.id)}
                    className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                    title="Remover campo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Nome da Tag (sem espaços)</label>
                    <input
                      type="text"
                      value={field.name}
                      onChange={(e) =>
                        handleUpdateField(field.id, {
                          name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Rótulo / Label no Formulário</label>
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) => handleUpdateField(field.id, { label: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Tipo de Campo</label>
                    <select
                      value={field.type}
                      onChange={(e) =>
                        handleUpdateField(field.id, { type: e.target.value as DocumentFieldType })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="text">Texto Curto</option>
                      <option value="textarea">Texto Longo (Parágrafo)</option>
                      <option value="number">Número</option>
                      <option value="date">Data</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Seção de Agrupamento</label>
                    <input
                      type="text"
                      value={field.section || ""}
                      onChange={(e) => handleUpdateField(field.id, { section: e.target.value })}
                      placeholder="Ex: 1. Dados do Parceiro"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                  <div>
                    <label className="block text-slate-400 mb-1">Valor Padrão Inicial</label>
                    <input
                      type="text"
                      value={field.defaultValue || ""}
                      onChange={(e) => handleUpdateField(field.id, { defaultValue: e.target.value })}
                      placeholder="Texto pré-preenchido no formulário"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex items-center space-x-4 pt-4">
                    <label className="flex items-center space-x-1.5 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(field.required)}
                        onChange={(e) => handleUpdateField(field.id, { required: e.target.checked })}
                        className="rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Preenchimento Obrigatório</span>
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: SIGNATURES */}
      {activeEditorTab === "signatures" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-900/50 p-4 rounded-xl border border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white">Blocos de Assinatura</h3>
              <p className="text-xs text-slate-400">
                Configure as linhas de assinatura e os cargos institucionais ao final do documento.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddSignature}
              className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-lg transition-colors flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar Assinatura</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {template.signatures.map((sig, idx) => (
              <div
                key={sig.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 shadow-sm"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-slate-200">Assinatura #{idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveSignature(sig.id)}
                    className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Título do Signatário</label>
                    <input
                      type="text"
                      value={sig.title}
                      onChange={(e) => handleUpdateSignature(sig.id, { title: e.target.value })}
                      placeholder="Ex: Representante do Parceiro"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Nome / Tag Dinâmica</label>
                    <input
                      type="text"
                      value={sig.nameTag || ""}
                      onChange={(e) => handleUpdateSignature(sig.id, { nameTag: e.target.value })}
                      placeholder="Ex: {{responsavel}} ou Nome Fixo"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Cargo / Função / Tag</label>
                    <input
                      type="text"
                      value={sig.roleTag || ""}
                      onChange={(e) => handleUpdateSignature(sig.id, { roleTag: e.target.value })}
                      placeholder="Ex: {{cargo_responsavel}} ou Diretor Geral"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Documento / Vínculo / Tag</label>
                    <input
                      type="text"
                      value={sig.cpfOrDocTag || ""}
                      onChange={(e) => handleUpdateSignature(sig.id, { cpfOrDocTag: e.target.value })}
                      placeholder="Ex: CPF: {{cpf}} ou IFPR Campus Ivaiporã"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: GENERAL & HEADER */}
      {activeEditorTab === "general" && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1.5">Título do Modelo</label>
              <input
                type="text"
                value={template.title}
                onChange={(e) => setTemplate((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-semibold"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1.5">Código Identificador</label>
              <input
                type="text"
                value={template.code}
                onChange={(e) =>
                  setTemplate((prev) => ({
                    ...prev,
                    code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""),
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1.5">Categoria</label>
              <select
                value={template.category}
                onChange={(e) => setTemplate((prev) => ({ ...prev, category: e.target.value as any }))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="EXTENSAO">Extensão Universitária</option>
                <option value="ACHADOS_PERDIDOS">Achados e Perdidos / Custódia</option>
                <option value="INSTITUCIONAL">Institucional / Direção</option>
                <option value="ESTAGIO">Estágio & Carreira</option>
                <option value="OUTRO">Outros</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1.5">Status do Modelo</label>
              <select
                value={template.status}
                onChange={(e) => setTemplate((prev) => ({ ...prev, status: e.target.value as any }))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="ATIVO">ATIVO (Disponível para emissão)</option>
                <option value="INATIVO">INATIVO (Oculto na listagem padrão)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1.5 text-xs">
              Descrição da Finalidade
            </label>
            <textarea
              rows={2}
              value={template.description}
              onChange={(e) => setTemplate((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1.5 text-xs">
              Texto do Cabeçalho Oficial (Linhas separadas por Enter)
            </label>
            <textarea
              rows={4}
              value={template.headerText}
              onChange={(e) => setTemplate((prev) => ({ ...prev, headerText: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1.5 text-xs">
              Texto do Rodapé Oficial
            </label>
            <input
              type="text"
              value={template.footerText}
              onChange={(e) => setTemplate((prev) => ({ ...prev, footerText: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2">
            <label className="flex items-center space-x-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={template.includeHeader}
                onChange={(e) => setTemplate((prev) => ({ ...prev, includeHeader: e.target.checked }))}
                className="rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
              />
              <span>Exibir Cabeçalho</span>
            </label>

            <label className="flex items-center space-x-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={template.includeDocNumber}
                onChange={(e) =>
                  setTemplate((prev) => ({ ...prev, includeDocNumber: e.target.checked }))
                }
                className="rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
              />
              <span>Número de Controle</span>
            </label>

            <label className="flex items-center space-x-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={template.includeFooter}
                onChange={(e) => setTemplate((prev) => ({ ...prev, includeFooter: e.target.checked }))}
                className="rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
              />
              <span>Exibir Rodapé</span>
            </label>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      <DocumentPreviewModal
        template={template}
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
      />
    </div>
  );
};
