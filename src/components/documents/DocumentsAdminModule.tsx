import React, { useState, useMemo } from "react";
import { DocumentTemplate, GeneratedDocumentRecord } from "../../types";
import { useApp } from "../../context/AppContext";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { DocumentFillForm } from "./DocumentFillForm";
import { DocumentTemplateEditor } from "./DocumentTemplateEditor";
import { ProjectConfigView } from "./ProjectConfigView";
import { generateDocumentPdf } from "../../lib/documentPdfGenerator";
import {
  FileText,
  Plus,
  Search,
  Eye,
  Edit3,
  Copy,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  Filter,
  Layers,
  Sparkles,
  Printer,
  FileCheck,
  Building,
  ShieldCheck,
  History,
  Send,
  ToggleLeft,
  ToggleRight,
  ArrowLeft,
  Users,
  RotateCcw,
  Calendar,
  User,
  Info,
  Check,
  X,
  ExternalLink,
  Shield,
  FilePlus,
  PlayCircle,
  RefreshCw,
} from "lucide-react";

export const DocumentsAdminModule: React.FC = () => {
  const {
    documentTemplates,
    generatedDocuments,
    deleteDocumentTemplate,
    duplicateDocumentTemplate,
    toggleDocumentTemplateStatus,
    deleteGeneratedDocument,
    projectSettings,
    currentUser,
    addToast,
  } = useApp();

  const isAdmin = currentUser?.role === "ADMIN";

  // Module Screen State
  const [viewMode, setViewMode] = useState<
    "gallery" | "history" | "project_settings" | "fill" | "edit" | "create"
  >("gallery");

  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [fillInitialValues, setFillInitialValues] = useState<Record<string, string> | undefined>(undefined);
  const [fillInitialDocNumber, setFillInitialDocNumber] = useState<string | undefined>(undefined);

  // Preview Modal
  const [previewTemplate, setPreviewTemplate] = useState<DocumentTemplate | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);

  // Document Details Modal
  const [detailsRecord, setDetailsRecord] = useState<GeneratedDocumentRecord | null>(null);

  // Filters & Search for Templates Gallery
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("TODOS");
  const [statusFilter, setStatusFilter] = useState<"TODOS" | "ATIVO" | "INATIVO">("TODOS");

  // Filters & Search for Generated Documents (History)
  const [historySearchQuery, setHistorySearchQuery] = useState<string>("");

  // Filtered Templates
  const filteredTemplates = useMemo(() => {
    return documentTemplates.filter((tpl) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        tpl.title.toLowerCase().includes(q) ||
        tpl.code.toLowerCase().includes(q) ||
        tpl.description.toLowerCase().includes(q) ||
        tpl.category.toLowerCase().includes(q);

      const matchesCategory = categoryFilter === "TODOS" || tpl.category === categoryFilter;
      const matchesStatus = statusFilter === "TODOS" || tpl.status === statusFilter;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [documentTemplates, searchQuery, categoryFilter, statusFilter]);

  // Contagem dinâmica de modelos ATIVOS a partir da coleção sincronizada do Firestore
  const activeModelsCount = useMemo(() => {
    return documentTemplates.filter((tpl) => tpl.status === "ATIVO").length;
  }, [documentTemplates]);

  // Filtered Generated Documents (History)
  const filteredHistory = useMemo(() => {
    return generatedDocuments.filter((rec) => {
      const q = historySearchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        rec.documentNumber.toLowerCase().includes(q) ||
        rec.templateTitle.toLowerCase().includes(q) ||
        rec.recipientOrOrg.toLowerCase().includes(q) ||
        rec.generatedByName.toLowerCase().includes(q) ||
        (rec.generatedByEmail && rec.generatedByEmail.toLowerCase().includes(q))
      );
    });
  }, [generatedDocuments, historySearchQuery]);

  // Action: Use Model (Preencher com dados padrão do modelo e projeto como instância independente)
  const handleUseTemplate = (tpl: DocumentTemplate) => {
    // Clona o modelo profundamente para garantir que a nova instância seja tratada de forma estritamente independente,
    // assegurando que as edições no formulário de preenchimento não sobrescrevam a estrutura do modelo original no Firestore.
    const independentInstance: DocumentTemplate = JSON.parse(JSON.stringify(tpl));
    setSelectedTemplate(independentInstance);
    setFillInitialValues(undefined);
    setFillInitialDocNumber(undefined);
    setViewMode("fill");
  };

  // Action: Edit/Reuse from Generated History
  const handleReuseHistoryDocument = (rec: GeneratedDocumentRecord) => {
    const parentTpl =
      documentTemplates.find((t) => t.id === rec.templateId) ||
      documentTemplates.find((t) => t.title === rec.templateTitle) ||
      documentTemplates[0];

    if (!parentTpl) {
      addToast("Não foi possível localizar o modelo deste documento.", "error");
      return;
    }

    setSelectedTemplate(parentTpl);
    setFillInitialValues(rec.fieldsData);
    setFillInitialDocNumber(rec.documentNumber);
    setViewMode("fill");
    setDetailsRecord(null);
    addToast(
      `Dados do documento '${rec.documentNumber}' carregados no gerador para edição/nova emissão.`,
      "info"
    );
  };

  // Action: Edit Model Schema (Admin Only)
  const handleOpenEdit = (tpl: DocumentTemplate) => {
    if (!isAdmin) {
      addToast("Apenas administradores podem editar a estrutura de modelos.", "error");
      return;
    }
    setSelectedTemplate(tpl);
    setViewMode("edit");
  };

  // Action: Create New Model from Scratch (Admin Only)
  const handleOpenCreate = () => {
    if (!isAdmin) {
      addToast("Apenas administradores podem criar novos modelos.", "error");
      return;
    }
    setSelectedTemplate(null);
    setViewMode("create");
  };

  // Action: Open Preview Modal
  const handleOpenPreview = (tpl: DocumentTemplate) => {
    setPreviewTemplate(tpl);
    setIsPreviewOpen(true);
  };

  // Action: Delete Model (Admin Only)
  const handleDelete = async (tpl: DocumentTemplate) => {
    if (!isAdmin) {
      addToast("Apenas administradores podem excluir modelos.", "error");
      return;
    }
    if (
      window.confirm(
        `Tem certeza que deseja excluir o modelo de documento '${tpl.title}' (${tpl.code})? Esta ação não pode ser desfeita.`
      )
    ) {
      await deleteDocumentTemplate(tpl.id);
    }
  };

  // Action: Duplicate Model (Admin Only)
  const handleDuplicate = async (tpl: DocumentTemplate) => {
    if (!isAdmin) {
      addToast("Apenas administradores podem duplicar modelos.", "error");
      return;
    }
    await duplicateDocumentTemplate(tpl.id);
  };

  // Action: Toggle Status (Active / Inactive)
  const handleToggleStatus = async (tpl: DocumentTemplate) => {
    if (!isAdmin) {
      addToast("Apenas administradores podem alterar o status do modelo.", "error");
      return;
    }
    await toggleDocumentTemplateStatus(tpl.id);
  };

  // Action: Delete from Generated History (Admin Only)
  const handleDeleteHistory = async (rec: GeneratedDocumentRecord) => {
    if (!isAdmin) {
      addToast("Apenas administradores podem remover registros do histórico.", "error");
      return;
    }
    if (
      window.confirm(
        `Deseja remover o registro de emissão do documento '${rec.templateTitle}' (Nº ${rec.documentNumber})?`
      )
    ) {
      await deleteGeneratedDocument(rec.id);
      if (detailsRecord?.id === rec.id) {
        setDetailsRecord(null);
      }
    }
  };

  // Re-download PDF from emission history
  const handleReDownloadHistory = (rec: GeneratedDocumentRecord) => {
    const parentTpl =
      documentTemplates.find((t) => t.id === rec.templateId) ||
      documentTemplates.find((t) => t.title === rec.templateTitle);

    if (parentTpl) {
      try {
        const { doc, filename } = generateDocumentPdf(parentTpl, rec.fieldsData, {
          documentNumber: rec.documentNumber,
          projectSettings,
        });
        doc.save(filename);
        addToast(`Documento ${rec.documentNumber} baixado com sucesso!`, "success");
      } catch (err) {
        console.error("Erro ao gerar PDF:", err);
        addToast("Erro ao processar o arquivo PDF.", "error");
      }
    } else {
      addToast("O modelo original deste documento não está mais disponível.", "error");
    }
  };

  // Helpers for category badges
  const getCategoryBadge = (category: string) => {
    switch (category) {
      case "EXTENSAO":
        return {
          label: "Extensão",
          className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
        };
      case "RESPONSABILIDADE":
        return {
          label: "Responsabilidade",
          className: "bg-purple-500/20 text-purple-300 border-purple-500/30",
        };
      case "DECLARACOES":
        return {
          label: "Declaração",
          className: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
        };
      case "RELATORIOS":
        return {
          label: "Relatório",
          className: "bg-amber-500/20 text-amber-300 border-amber-500/30",
        };
      case "ACHADOS_PERDIDOS":
        return {
          label: "Achados e Perdidos",
          className: "bg-blue-500/20 text-blue-300 border-blue-500/30",
        };
      case "INSTITUCIONAL":
        return {
          label: "Institucional",
          className: "bg-slate-700 text-slate-300 border-slate-600",
        };
      default:
        return {
          label: category,
          className: "bg-slate-800 text-slate-400 border-slate-700",
        };
    }
  };

  // Sub-views rendering (Fill Form)
  if (viewMode === "fill" && selectedTemplate) {
    return (
      <DocumentFillForm
        template={selectedTemplate}
        initialValues={fillInitialValues}
        initialDocumentNumber={fillInitialDocNumber}
        onBack={() => {
          setViewMode("gallery");
          setFillInitialValues(undefined);
          setFillInitialDocNumber(undefined);
        }}
      />
    );
  }

  // Sub-views rendering (Editor / Create)
  if (viewMode === "edit" || viewMode === "create") {
    return (
      <DocumentTemplateEditor
        initialTemplate={selectedTemplate}
        onBack={() => setViewMode("gallery")}
      />
    );
  }

  return (
    <div id="documents-admin-module" className="space-y-6 animate-fade-in text-slate-100">
      {/* Top Banner Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center space-x-3.5">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400">
              <FileText className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Biblioteca de Modelos e Gerador de Documentos
                </h2>
                <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30">
                  IFPR A4
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Selecione um modelo pré-pronto, personalize os dados específicos e gere PDFs institucionais oficiais com histórico completo de emissões.
              </p>
            </div>
          </div>

          {/* Primary View Switcher Navigation */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              id="tab-modelos-preprontos"
              onClick={() => setViewMode("gallery")}
              className={`px-3.5 py-2 text-xs font-semibold rounded-xl border transition-colors flex items-center space-x-1.5 ${
                viewMode === "gallery"
                  ? "bg-slate-800 text-emerald-400 border-emerald-500/30 shadow-xs"
                  : "bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700"
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Modelos Pré-prontos ({activeModelsCount})</span>
            </button>

            <button
              type="button"
              id="tab-meus-documentos"
              onClick={() => setViewMode("history")}
              className={`px-3.5 py-2 text-xs font-semibold rounded-xl border transition-colors flex items-center space-x-1.5 ${
                viewMode === "history"
                  ? "bg-slate-800 text-emerald-400 border-emerald-500/30 shadow-xs"
                  : "bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700"
              }`}
            >
              <History className="w-4 h-4" />
              <span>Meus Documentos ({generatedDocuments.length})</span>
            </button>

            <button
              type="button"
              id="tab-dados-projeto"
              onClick={() => setViewMode("project_settings")}
              className={`px-3.5 py-2 text-xs font-semibold rounded-xl border transition-colors flex items-center space-x-1.5 ${
                viewMode === "project_settings"
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-xs"
                  : "bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700"
              }`}
            >
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Dados do Projeto</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                id="btn-novo-modelo"
                onClick={handleOpenCreate}
                className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-md transition-all flex items-center space-x-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Modelo</span>
              </button>
            )}
          </div>
        </div>

        {/* Metric Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800 text-xs">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <span className="text-slate-400 block text-[11px]">Modelos Disponíveis</span>
            <span className="text-lg font-bold text-white mt-0.5 block">
              {documentTemplates.length}
            </span>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <span className="text-slate-400 block text-[11px]">Modelos Ativos</span>
            <span className="text-lg font-bold text-emerald-400 mt-0.5 block">
              {documentTemplates.filter((t) => t.status === "ATIVO").length}
            </span>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <span className="text-slate-400 block text-[11px]">Documentos Gerados</span>
            <span className="text-lg font-bold text-cyan-400 mt-0.5 block">
              {generatedDocuments.length}
            </span>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <span className="text-slate-400 block text-[11px]">Campus IFPR</span>
            <span className="text-xs font-bold text-emerald-300 mt-1 block">
              {projectSettings.institution.campus}
            </span>
          </div>
        </div>
      </div>

      {/* VIEW: PROJECT SETTINGS */}
      {viewMode === "project_settings" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMode("gallery")}
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center space-x-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar para Modelos Pré-prontos</span>
            </button>
          </div>
          <ProjectConfigView />
        </div>
      ) : viewMode === "history" ? (
        /* VIEW 2: MEUS DOCUMENTOS (HISTÓRICO DE DOCUMENTOS GERADOS) */
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
            {/* Search Input for History */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                placeholder="Buscar por protocolo, título, parceiro ou usuário..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            <div className="flex items-center space-x-3 text-xs text-slate-400">
              <span>{filteredHistory.length} documento(s) encontrado(s)</span>
              <button
                type="button"
                onClick={() => setViewMode("gallery")}
                className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl font-semibold transition-colors flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Emitir Novo</span>
              </button>
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
              <FileCheck className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-slate-300">
                {generatedDocuments.length === 0
                  ? "Nenhum documento emitido ainda"
                  : "Nenhum documento corresponde à busca"}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {generatedDocuments.length === 0
                  ? "Na aba 'Modelos Pré-prontos', selecione um modelo e clique em 'Usar modelo' para gerar seu primeiro documento oficial em PDF."
                  : "Tente buscar com outros termos de protocolo, nome ou destinatário."}
              </p>
              {generatedDocuments.length === 0 && (
                <button
                  type="button"
                  onClick={() => setViewMode("gallery")}
                  className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-md transition-all inline-flex items-center space-x-1.5 mt-2"
                >
                  <FileText className="w-4 h-4" />
                  <span>Explorar Modelos Disponíveis</span>
                </button>
              )}
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3.5 font-semibold">Nº Protocolo</th>
                      <th className="px-4 py-3.5 font-semibold">Documento / Modelo</th>
                      <th className="px-4 py-3.5 font-semibold">Destinatário / Parte</th>
                      <th className="px-4 py-3.5 font-semibold">Data de Emissão</th>
                      <th className="px-4 py-3.5 font-semibold">Responsável</th>
                      <th className="px-4 py-3.5 font-semibold">Status</th>
                      <th className="px-4 py-3.5 font-semibold text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredHistory.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3.5 font-mono text-emerald-400 font-bold whitespace-nowrap">
                          {doc.documentNumber}
                        </td>
                        <td className="px-4 py-3.5 font-medium text-white max-w-xs truncate">
                          {doc.templateTitle}
                        </td>
                        <td className="px-4 py-3.5 text-slate-300 max-w-xs truncate">
                          {doc.recipientOrOrg}
                        </td>
                        <td className="px-4 py-3.5 text-slate-400 whitespace-nowrap">
                          <div className="flex items-center space-x-1">
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            <span>
                              {new Date(doc.generatedAt).toLocaleString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-slate-400 whitespace-nowrap">
                          <div className="flex items-center space-x-1.5">
                            <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300">
                              {doc.generatedByName?.charAt(0) || "U"}
                            </div>
                            <span className="truncate max-w-[130px]">{doc.generatedByName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30">
                            {doc.status || "Emitido"}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              type="button"
                              onClick={() => setDetailsRecord(doc)}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition-colors"
                              title="Ver detalhes do preenchimento"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleReuseHistoryDocument(doc)}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 rounded-lg border border-amber-500/30 transition-colors"
                              title="Reutilizar / Editar no Gerador"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleReDownloadHistory(doc)}
                              className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 rounded-lg border border-emerald-500/30 text-xs font-semibold transition-colors inline-flex items-center space-x-1"
                              title="Baixar PDF novamente"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>PDF</span>
                            </button>

                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleDeleteHistory(doc)}
                                className="p-1.5 bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 rounded-lg border border-slate-700 transition-colors"
                                title="Excluir do histórico"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* VIEW 1: MODELOS PRÉ-PRONTOS (BIBLIOTECA DE MODELOS REUTILIZÁVEIS) */
        <div className="space-y-6">
          {/* Section Sub-banner with Workflow Steps */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg">
                  <FileText className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-white">Modelos pré-prontos</h3>
                <span className="text-xs text-slate-400 font-medium">
                  ({activeModelsCount} {activeModelsCount === 1 ? "modelo disponível" : "modelos disponíveis"})
                </span>
              </div>
              <span className="text-[11px] text-emerald-400/90 font-medium">
                Imutabilidade garantida · Os templates originais são preservados
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Selecione um dos modelos institucionais abaixo e clique em <strong className="text-white">"Usar modelo"</strong>. O gerador será aberto com os dados cadastrais do projeto já preenchidos, permitindo que você revise apenas os campos variáveis antes de exportar o PDF oficial.
            </p>

            {/* Workflow steps chip track */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-slate-800/80 text-[11px]">
              <div className="flex items-center space-x-2 text-slate-300 bg-slate-950/60 px-2.5 py-1.5 rounded-lg border border-slate-800/60">
                <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px] flex items-center justify-center">1</span>
                <span className="truncate">Selecionar modelo</span>
              </div>
              <div className="flex items-center space-x-2 text-slate-300 bg-slate-950/60 px-2.5 py-1.5 rounded-lg border border-slate-800/60">
                <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px] flex items-center justify-center">2</span>
                <span className="truncate">Clicar "Usar modelo"</span>
              </div>
              <div className="flex items-center space-x-2 text-slate-300 bg-slate-950/60 px-2.5 py-1.5 rounded-lg border border-slate-800/60">
                <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px] flex items-center justify-center">3</span>
                <span className="truncate">Editar campos necessários</span>
              </div>
              <div className="flex items-center space-x-2 text-slate-300 bg-slate-950/60 px-2.5 py-1.5 rounded-lg border border-slate-800/60">
                <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px] flex items-center justify-center">4</span>
                <span className="truncate">Gerar e baixar PDF</span>
              </div>
            </div>
          </div>

          {/* Search and Category Filters */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar modelo por título, código ou finalidade..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              {[
                { id: "TODOS", label: "Todos" },
                { id: "EXTENSAO", label: "Extensão" },
                { id: "RESPONSABILIDADE", label: "Responsabilidade" },
                { id: "DECLARACOES", label: "Declarações" },
                { id: "RELATORIOS", label: "Relatórios" },
                { id: "ACHADOS_PERDIDOS", label: "Achados & Perdidos" },
                { id: "INSTITUCIONAL", label: "Institucional" },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                    categoryFilter === cat.id
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                  }`}
                >
                  {cat.label}
                </button>
              ))}

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 ml-2"
              >
                <option value="TODOS">Status: Todos</option>
                <option value="ATIVO">Apenas Ativos</option>
                <option value="INATIVO">Apenas Inativos</option>
              </select>
            </div>
          </div>

          {/* Templates Grid Cards */}
          {filteredTemplates.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
              <FileText className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-slate-300">Nenhum modelo encontrado</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Tente ajustar os termos de pesquisa ou os filtros de categoria.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredTemplates.map((template) => {
                const catBadge = getCategoryBadge(template.category);

                const lastUpdatedFormatted = template.updatedAt
                  ? new Date(template.updatedAt).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })
                  : "Padrão Sistema";

                return (
                  <div
                    key={template.id}
                    id={`template-card-${template.id}`}
                    className={`bg-slate-900 border rounded-2xl p-5 flex flex-col justify-between space-y-4 transition-all hover:border-slate-700 shadow-sm relative group ${
                      template.status === "ATIVO"
                        ? "border-slate-800"
                        : "border-slate-800/50 opacity-75"
                    }`}
                  >
                    {/* Top Card Header */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-1.5">
                          <span className="px-2 py-0.5 text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
                            {template.code}
                          </span>
                          <span
                            className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${catBadge.className}`}
                          >
                            {catBadge.label}
                          </span>
                        </div>

                        <div className="flex items-center space-x-1.5">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                              template.status === "ATIVO"
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                : "bg-slate-800 text-slate-400 border border-slate-700"
                            }`}
                          >
                            {template.status}
                          </span>

                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(template)}
                              className="text-slate-400 hover:text-emerald-400 transition-colors"
                              title={
                                template.status === "ATIVO"
                                  ? "Desativar modelo"
                                  : "Ativar modelo"
                              }
                            >
                              {template.status === "ATIVO" ? (
                                <ToggleRight className="w-5 h-5 text-emerald-400" />
                              ) : (
                                <ToggleLeft className="w-5 h-5 text-slate-500" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      <h3 className="text-base font-bold text-white tracking-tight line-clamp-2 leading-snug">
                        {template.title}
                      </h3>

                      <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                        {template.description}
                      </p>
                    </div>

                    {/* Metadata Details (Seções, Campos, Assinaturas, Última Atualização) */}
                    <div className="space-y-2 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400">
                      <div className="flex items-center justify-between">
                        <span>{template.sections?.length || 0} seções</span>
                        <span>•</span>
                        <span>{template.fields?.length || 0} campos padrão</span>
                        <span>•</span>
                        <span>{template.signatures?.length || 0} assinaturas</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span className="flex items-center space-x-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>Atualizado: {lastUpdatedFormatted}</span>
                        </span>
                        <span>Versão {template.version}.0</span>
                      </div>
                    </div>

                    {/* Action Buttons Bar */}
                    <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-1">
                        <button
                          type="button"
                          onClick={() => handleOpenPreview(template)}
                          className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors"
                          title="Visualizar prévia A4"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {isAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(template)}
                              className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-colors"
                              title="Editar modelo (Estrutura, Campos e Textos)"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDuplicate(template)}
                              className="p-2 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition-colors"
                              title="Duplicar modelo (Criar nova versão)"
                            >
                              <Copy className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDelete(template)}
                              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                              title="Excluir modelo"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>

                      {/* Primary "Usar modelo" Button */}
                      <button
                        type="button"
                        id={`btn-usar-modelo-${template.id}`}
                        onClick={() => handleUseTemplate(template)}
                        className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-md transition-all flex items-center space-x-1.5 group-hover:shadow-emerald-950/50"
                      >
                        <FilePlus className="w-4 h-4" />
                        <span>Usar modelo</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Full A4 Preview Modal */}
      {previewTemplate && (
        <DocumentPreviewModal
          template={previewTemplate}
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          onProceedToFill={() => {
            setIsPreviewOpen(false);
            handleUseTemplate(previewTemplate);
          }}
        />
      )}

      {/* Document Details Modal (Histórico de Emissões) */}
      {detailsRecord && (
        <div
          id="modal-document-details"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      {detailsRecord.documentNumber}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30 font-semibold">
                      {detailsRecord.status || "Emitido"}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white mt-0.5">
                    {detailsRecord.templateTitle}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailsRecord(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Metadata Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-500 block text-[10px]">Destinatário / Parte</span>
                  <span className="font-semibold text-slate-200 text-xs mt-0.5 block">
                    {detailsRecord.recipientOrOrg}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Data e Hora da Emissão</span>
                  <span className="font-semibold text-slate-200 text-xs mt-0.5 block">
                    {new Date(detailsRecord.generatedAt).toLocaleString("pt-BR")}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Emitido Por</span>
                  <span className="font-semibold text-slate-200 text-xs mt-0.5 block">
                    {detailsRecord.generatedByName}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">E-mail do Emissor</span>
                  <span className="font-semibold text-slate-200 text-xs mt-0.5 block">
                    {detailsRecord.generatedByEmail || "Sistema Institucional"}
                  </span>
                </div>
              </div>

              {/* Saved Fields List */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-300 text-xs flex items-center space-x-1.5">
                  <Info className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Dados e Campos Registrados na Emissão:</span>
                </h4>
                <div className="bg-slate-950 border border-slate-800 rounded-xl divide-y divide-slate-800/80 max-h-60 overflow-y-auto">
                  {Object.entries(detailsRecord.fieldsData || {}).map(([key, val]) => (
                    <div key={key} className="p-3 text-xs flex flex-col sm:flex-row sm:items-start justify-between gap-1">
                      <span className="font-mono text-emerald-400/90 text-[11px] min-w-[160px]">
                        {`{{${key}}}`}
                      </span>
                      <span className="text-slate-300 font-sans whitespace-pre-line flex-1 text-right sm:text-left">
                        {val || <em className="text-slate-600">(vazio)</em>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setDetailsRecord(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
              >
                Fechar
              </button>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handleReuseHistoryDocument(detailsRecord)}
                  className="px-3.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-xl border border-amber-500/30 transition-colors flex items-center space-x-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reutilizar / Editar no Gerador</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleReDownloadHistory(detailsRecord)}
                  className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-md transition-all flex items-center space-x-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar PDF</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const DocumentManagerView = DocumentsAdminModule;
export default DocumentsAdminModule;
