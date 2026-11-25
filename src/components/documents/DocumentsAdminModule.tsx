import React, { useState, useMemo } from "react";
import { DocumentTemplate, GeneratedDocumentRecord } from "../../types";
import { useApp } from "../../context/AppContext";
import { localize, getLocaleForLanguage } from "../../lib/i18n";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { DocumentFillForm } from "./DocumentFillForm";
import { DocumentTemplateEditor } from "./DocumentTemplateEditor";
import { ProjectConfigView } from "./ProjectConfigView";
import { generateDocumentPdf } from "../../lib/documentPdfGenerator";
import {
  SurfaceCard,
  SubtlePanel,
  UIButton,
  UIBadge,
  EmptyState,
  UIInput,
  UISelect,
} from "../ui";
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
    language,
  } = useApp();
  const L = (pt: string, en: string) => localize(language, pt, en);
  const locale = getLocaleForLanguage(language);

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
      addToast(
        L("Não foi possível localizar o modelo deste documento.", "Could not find the template for this document."),
        "error"
      );
      return;
    }

    setSelectedTemplate(parentTpl);
    setFillInitialValues(rec.fieldsData);
    setFillInitialDocNumber(rec.documentNumber);
    setViewMode("fill");
    setDetailsRecord(null);
    addToast(
      L(
        `Dados do documento '${rec.documentNumber}' carregados no gerador para edição/nova emissão.`,
        `Document '${rec.documentNumber}' data loaded into the generator for editing/reissue.`
      ),
      "info"
    );
  };

  // Action: Edit Model Schema (Admin Only)
  const handleOpenEdit = (tpl: DocumentTemplate) => {
    if (!isAdmin) {
      addToast(
        L("Apenas administradores podem editar a estrutura de modelos.", "Only administrators can edit template structure."),
        "error"
      );
      return;
    }
    setSelectedTemplate(tpl);
    setViewMode("edit");
  };

  // Action: Create New Model from Scratch (Admin Only)
  const handleOpenCreate = () => {
    if (!isAdmin) {
      addToast(
        L("Apenas administradores podem criar novos modelos.", "Only administrators can create new templates."),
        "error"
      );
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
      addToast(
        L("Apenas administradores podem excluir modelos.", "Only administrators can delete templates."),
        "error"
      );
      return;
    }
    if (
      window.confirm(
        L(
          `Tem certeza que deseja excluir o modelo de documento '${tpl.title}' (${tpl.code})? Esta ação não pode ser desfeita.`,
          `Are you sure you want to delete document template '${tpl.title}' (${tpl.code})? This action cannot be undone.`
        )
      )
    ) {
      await deleteDocumentTemplate(tpl.id);
    }
  };

  // Action: Duplicate Model (Admin Only)
  const handleDuplicate = async (tpl: DocumentTemplate) => {
    if (!isAdmin) {
      addToast(
        L("Apenas administradores podem duplicar modelos.", "Only administrators can duplicate templates."),
        "error"
      );
      return;
    }
    await duplicateDocumentTemplate(tpl.id);
  };

  // Action: Toggle Status (Active / Inactive)
  const handleToggleStatus = async (tpl: DocumentTemplate) => {
    if (!isAdmin) {
      addToast(
        L("Apenas administradores podem alterar a situação do modelo.", "Only administrators can change template status."),
        "error"
      );
      return;
    }
    await toggleDocumentTemplateStatus(tpl.id);
  };

  // Action: Delete from Generated History (Admin Only)
  const handleDeleteHistory = async (rec: GeneratedDocumentRecord) => {
    if (!isAdmin) {
      addToast(
        L("Apenas administradores podem remover registros do histórico.", "Only administrators can remove history records."),
        "error"
      );
      return;
    }
    if (
      window.confirm(
        L(
          `Deseja remover o registro de emissão do documento '${rec.templateTitle}' (Nº ${rec.documentNumber})?`,
          `Do you want to remove the issue record for document '${rec.templateTitle}' (#${rec.documentNumber})?`
        )
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
        addToast(
          L(`Documento ${rec.documentNumber} baixado com sucesso!`, `Document ${rec.documentNumber} downloaded successfully!`),
          "success"
        );
      } catch (err) {
        console.error("Erro ao gerar PDF:", err);
        addToast(L("Erro ao processar o arquivo PDF.", "Error processing the PDF file."), "error");
      }
    } else {
      addToast(
        L("O modelo original deste documento não está mais disponível.", "The original template for this document is no longer available."),
        "error"
      );
    }
  };

  // Helpers for category badges
  const getCategoryBadge = (
    category: string
  ): { label: string; tone: "emerald" | "darkEmerald" | "blue" | "amber" | "slate" } => {
    switch (category) {
      case "EXTENSAO":
        return { label: L("Extensão", "Extension"), tone: "emerald" };
      case "RESPONSABILIDADE":
        return { label: L("Responsabilidade", "Responsibility"), tone: "darkEmerald" };
      case "DECLARACOES":
        return { label: L("Declaração", "Declaration"), tone: "blue" };
      case "RELATORIOS":
        return { label: L("Relatório", "Report"), tone: "amber" };
      case "ACHADOS_PERDIDOS":
        return { label: L("Achados e Perdidos", "Lost & Found"), tone: "blue" };
      case "INSTITUCIONAL":
        return { label: L("Institucional", "Institutional"), tone: "slate" };
      default:
        return { label: category, tone: "slate" };
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
    <div id="documents-admin-module" className="space-y-6 animate-fade-in text-[#172B2A] dark:text-slate-100">
      {/* Top Banner Header */}
      <SurfaceCard padding="md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="p-3 bg-[#EBF5F0] dark:bg-emerald-950/60 border border-[#16845B]/20 dark:border-emerald-800/60 rounded-2xl text-[#16845B] dark:text-emerald-400 shrink-0">
              <FileText className="w-7 h-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-[#172B2A] dark:text-white tracking-tight">
                  {L("Biblioteca de Modelos e Gerador de Documentos", "Template Library & Document Generator")}
                </h2>
                <UIBadge tone="emerald">IFPR A4</UIBadge>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                {L(
                  "Selecione um modelo pré-pronto, personalize os dados específicos e gere PDFs institucionais oficiais com histórico completo de emissões.",
                  "Select a ready-made template, customize specific fields, and generate official institutional PDFs with full issuance history."
                )}
              </p>
            </div>
          </div>

          {/* Primary View Switcher Navigation */}
          <div className="flex flex-wrap items-center gap-2">
            <UIButton
              type="button"
              id="tab-modelos-preprontos"
              onClick={() => setViewMode("gallery")}
              variant={viewMode === "gallery" ? "primary" : "outline"}
              size="sm"
            >
              <FileText className="w-4 h-4" />
              <span>{L(`Modelos Pré-prontos (${activeModelsCount})`, `Ready Templates (${activeModelsCount})`)}</span>
            </UIButton>

            <UIButton
              type="button"
              id="tab-meus-documentos"
              onClick={() => setViewMode("history")}
              variant={viewMode === "history" ? "primary" : "outline"}
              size="sm"
            >
              <History className="w-4 h-4" />
              <span>{L(`Meus Documentos (${generatedDocuments.length})`, `My Documents (${generatedDocuments.length})`)}</span>
            </UIButton>

            <UIButton
              type="button"
              id="tab-dados-projeto"
              onClick={() => setViewMode("project_settings")}
              variant={viewMode === "project_settings" ? "primary" : "outline"}
              size="sm"
            >
              <Sparkles className="w-4 h-4" />
              <span>{L("Dados do Projeto", "Project Data")}</span>
            </UIButton>

            {isAdmin && (
              <UIButton
                type="button"
                id="btn-novo-modelo"
                onClick={handleOpenCreate}
                variant="dark"
                size="sm"
              >
                <Plus className="w-4 h-4" />
                <span>{L("Novo Modelo", "New Template")}</span>
              </UIButton>
            )}
          </div>
        </div>

        {/* Metric Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 text-xs">
          <SubtlePanel padding="sm">
            <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-medium">
              {L("Modelos Disponíveis", "Available Templates")}
            </span>
            <span className="text-lg font-bold text-[#172B2A] dark:text-white mt-0.5 block">
              {documentTemplates.length}
            </span>
          </SubtlePanel>

          <SubtlePanel padding="sm">
            <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-medium">
              {L("Modelos Ativos", "Active Templates")}
            </span>
            <span className="text-lg font-bold text-[#16845B] dark:text-emerald-400 mt-0.5 block">
              {documentTemplates.filter((t) => t.status === "ATIVO").length}
            </span>
          </SubtlePanel>

          <SubtlePanel padding="sm">
            <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-medium">
              {L("Documentos Gerados", "Generated Documents")}
            </span>
            <span className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-0.5 block">
              {generatedDocuments.length}
            </span>
          </SubtlePanel>

          <SubtlePanel padding="sm">
            <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-medium">
              {L("Campus IFPR", "IFPR Campus")}
            </span>
            <span className="text-xs font-bold text-[#064E3B] dark:text-emerald-300 mt-1 block truncate">
              {projectSettings.institution.campus}
            </span>
          </SubtlePanel>
        </div>
      </SurfaceCard>

      {/* VIEW: PROJECT SETTINGS */}
      {viewMode === "project_settings" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <UIButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setViewMode("gallery")}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{L("Voltar para Modelos Pré-prontos", "Back to Ready Templates")}</span>
            </UIButton>
          </div>
          <ProjectConfigView />
        </div>
      ) : viewMode === "history" ? (
        /* VIEW 2: MEUS DOCUMENTOS (HISTÓRICO DE DOCUMENTOS GERADOS) */
        <div className="space-y-4">
          <SurfaceCard padding="sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Search Input for History */}
              <div className="flex-1 max-w-md">
                <UIInput
                  type="text"
                  leftIcon={<Search className="w-4 h-4" />}
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  placeholder={L("Buscar por protocolo, título, parceiro ou usuário...", "Search by protocol, title, partner, or user...")}
                />
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-medium">
                  {L(`${filteredHistory.length} documento(s) encontrado(s)`, `${filteredHistory.length} document(s) found`)}
                </span>
                <UIButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setViewMode("gallery")}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{L("Emitir Novo", "Issue New")}</span>
                </UIButton>
              </div>
            </div>
          </SurfaceCard>

          {filteredHistory.length === 0 ? (
            <SurfaceCard padding="lg">
              <EmptyState
                icon={<FileCheck className="w-7 h-7" />}
                title={
                  generatedDocuments.length === 0
                    ? L("Nenhum documento emitido ainda", "No documents issued yet")
                    : L("Nenhum documento corresponde à busca", "No documents match your search")
                }
                description={
                  generatedDocuments.length === 0
                    ? L(
                        "Na aba 'Modelos Pré-prontos', selecione um modelo e clique em 'Usar modelo' para gerar seu primeiro documento oficial em PDF.",
                        "In the 'Ready Templates' tab, select a template and click 'Use template' to generate your first official PDF document."
                      )
                    : L(
                        "Tente buscar com outros termos de protocolo, nome ou destinatário.",
                        "Try searching with different protocol, name, or recipient terms."
                      )
                }
                action={
                  generatedDocuments.length === 0 ? (
                    <UIButton
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => setViewMode("gallery")}
                    >
                      <FileText className="w-4 h-4" />
                      <span>{L("Explorar Modelos Disponíveis", "Explore Available Templates")}</span>
                    </UIButton>
                  ) : undefined
                }
              />
            </SurfaceCard>
          ) : (
            <SurfaceCard padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                  <thead className="bg-[#F8FAFC] dark:bg-slate-800/80 text-slate-500 dark:text-slate-300 uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-3.5 font-semibold">{L("Nº Protocolo", "Protocol #")}</th>
                      <th className="px-4 py-3.5 font-semibold">{L("Documento / Modelo", "Document / Template")}</th>
                      <th className="px-4 py-3.5 font-semibold">{L("Destinatário / Parte", "Recipient / Party")}</th>
                      <th className="px-4 py-3.5 font-semibold">{L("Data de Emissão", "Issue Date")}</th>
                      <th className="px-4 py-3.5 font-semibold">{L("Responsável", "Issued By")}</th>
                      <th className="px-4 py-3.5 font-semibold">{L("Situação", "Status")}</th>
                      <th className="px-4 py-3.5 font-semibold text-right">{L("Ações", "Actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                    {filteredHistory.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3.5 font-mono text-[#16845B] dark:text-emerald-400 font-bold whitespace-nowrap">
                          {doc.documentNumber}
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-[#172B2A] dark:text-white max-w-xs truncate">
                          {doc.templateTitle}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 max-w-xs truncate">
                          {doc.recipientOrOrg}
                        </td>
                        <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          <div className="flex items-center space-x-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                            <span>
                              {new Date(doc.generatedAt).toLocaleString(locale, {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          <div className="flex items-center space-x-1.5">
                            <div className="w-5 h-5 rounded-full bg-[#EBF5F0] dark:bg-slate-800 border border-[#16845B]/20 dark:border-slate-700 flex items-center justify-center text-[10px] font-bold text-[#16845B] dark:text-slate-300">
                              {doc.generatedByName?.charAt(0) || "U"}
                            </div>
                            <span className="truncate max-w-[130px]">{doc.generatedByName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <UIBadge tone="emerald">{doc.status || L("Emitido", "Issued")}</UIBadge>
                        </td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end space-x-1.5">
                            <UIButton
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setDetailsRecord(doc)}
                              className="!px-2 !py-1.5"
                              title={L("Ver detalhes do preenchimento", "View filled details")}
                              aria-label={L("Ver detalhes do preenchimento", "View filled details")}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </UIButton>

                            <UIButton
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleReuseHistoryDocument(doc)}
                              className="!px-2 !py-1.5 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/50 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                              title={L("Reutilizar / Editar no Gerador", "Reuse / Edit in Generator")}
                              aria-label={L("Reutilizar / Editar no Gerador", "Reuse / Edit in Generator")}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </UIButton>

                            <UIButton
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => handleReDownloadHistory(doc)}
                              className="!px-2.5 !py-1.5"
                              title={L("Baixar PDF novamente", "Download PDF again")}
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>PDF</span>
                            </UIButton>

                            {isAdmin && (
                              <UIButton
                                type="button"
                                variant="danger"
                                size="sm"
                                onClick={() => handleDeleteHistory(doc)}
                                className="!px-2 !py-1.5"
                                title={L("Excluir do histórico", "Delete from history")}
                                aria-label={L("Excluir do histórico", "Delete from history")}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </UIButton>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SurfaceCard>
          )}
        </div>
      ) : (
        /* VIEW 1: MODELOS PRÉ-PRONTOS (BIBLIOTECA DE MODELOS REUTILIZÁVEIS) */
        <div className="space-y-6">
          {/* Section Sub-banner with Workflow Steps */}
          <SurfaceCard padding="md" className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="p-1.5 bg-[#EBF5F0] dark:bg-emerald-950/60 text-[#16845B] dark:text-emerald-400 rounded-lg border border-[#16845B]/20 dark:border-emerald-800/50">
                  <FileText className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-[#172B2A] dark:text-white">
                  {L("Modelos pré-prontos", "Ready-made templates")}
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  ({activeModelsCount}{" "}
                  {activeModelsCount === 1
                    ? L("modelo disponível", "template available")
                    : L("modelos disponíveis", "templates available")}
                  )
                </span>
              </div>
              <span className="text-[11px] text-[#16845B] dark:text-emerald-400 font-semibold">
                {L(
                  "Imutabilidade garantida · Os modelos originais são preservados",
                  "Immutability guaranteed · Original templates are preserved"
                )}
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {L("Selecione um dos modelos institucionais abaixo e clique em ", "Select one of the institutional templates below and click ")}
              <strong className="text-[#172B2A] dark:text-white">"{L("Usar modelo", "Use template")}"</strong>
              {L(
                ". O gerador será aberto com os dados cadastrais do projeto já preenchidos, permitindo que você revise apenas os campos variáveis antes de exportar o PDF oficial.",
                ". The generator opens with project registration data already filled in, allowing you to review only variable fields before exporting the official PDF."
              )}
            </p>

            {/* Workflow steps chip track */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px]">
              <SubtlePanel padding="sm" className="!py-2 !px-2.5 flex items-center space-x-2 text-slate-700 dark:text-slate-300">
                <span className="w-4 h-4 rounded-full bg-[#EBF5F0] dark:bg-emerald-500/20 text-[#16845B] dark:text-emerald-300 font-bold text-[10px] flex items-center justify-center shrink-0">1</span>
                <span className="truncate font-medium">{L("Selecionar modelo", "Select template")}</span>
              </SubtlePanel>
              <SubtlePanel padding="sm" className="!py-2 !px-2.5 flex items-center space-x-2 text-slate-700 dark:text-slate-300">
                <span className="w-4 h-4 rounded-full bg-[#EBF5F0] dark:bg-emerald-500/20 text-[#16845B] dark:text-emerald-300 font-bold text-[10px] flex items-center justify-center shrink-0">2</span>
                <span className="truncate font-medium">{L('Clicar em "Usar modelo"', 'Click "Use template"')}</span>
              </SubtlePanel>
              <SubtlePanel padding="sm" className="!py-2 !px-2.5 flex items-center space-x-2 text-slate-700 dark:text-slate-300">
                <span className="w-4 h-4 rounded-full bg-[#EBF5F0] dark:bg-emerald-500/20 text-[#16845B] dark:text-emerald-300 font-bold text-[10px] flex items-center justify-center shrink-0">3</span>
                <span className="truncate font-medium">{L("Editar campos necessários", "Edit required fields")}</span>
              </SubtlePanel>
              <SubtlePanel padding="sm" className="!py-2 !px-2.5 flex items-center space-x-2 text-slate-700 dark:text-slate-300">
                <span className="w-4 h-4 rounded-full bg-[#EBF5F0] dark:bg-emerald-500/20 text-[#16845B] dark:text-emerald-300 font-bold text-[10px] flex items-center justify-center shrink-0">4</span>
                <span className="truncate font-medium">{L("Gerar e baixar PDF", "Generate & download PDF")}</span>
              </SubtlePanel>
            </div>
          </SurfaceCard>

          {/* Search and Category Filters */}
          <SurfaceCard padding="sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Search Input */}
              <div className="flex-1 max-w-md">
                <UIInput
                  type="text"
                  leftIcon={<Search className="w-4 h-4" />}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={L("Buscar modelo por título, código ou finalidade...", "Search template by title, code, or purpose...")}
                />
              </div>

              {/* Category Pills & Status Filter */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 text-xs">
                {[
                  { id: "TODOS", label: L("Todos", "All") },
                  { id: "EXTENSAO", label: L("Extensão", "Extension") },
                  { id: "RESPONSABILIDADE", label: L("Responsabilidade", "Responsibility") },
                  { id: "DECLARACOES", label: L("Declarações", "Declarations") },
                  { id: "RELATORIOS", label: L("Relatórios", "Reports") },
                  { id: "ACHADOS_PERDIDOS", label: L("Achados e Perdidos", "Lost & Found") },
                  { id: "INSTITUCIONAL", label: L("Institucional", "Institutional") },
                ].map((cat) => (
                  <UIButton
                    key={cat.id}
                    type="button"
                    size="sm"
                    variant={categoryFilter === cat.id ? "primary" : "outline"}
                    onClick={() => setCategoryFilter(cat.id)}
                    className="whitespace-nowrap !py-1.5"
                  >
                    {cat.label}
                  </UIButton>
                ))}

                {/* Status Filter */}
                <div className="min-w-[140px] ml-1 shrink-0">
                  <UISelect
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="!py-1.5 !text-xs"
                  >
                    <option value="TODOS">{L("Situação: Todos", "Status: All")}</option>
                    <option value="ATIVO">{L("Apenas Ativos", "Active Only")}</option>
                    <option value="INATIVO">{L("Apenas Inativos", "Inactive Only")}</option>
                  </UISelect>
                </div>
              </div>
            </div>
          </SurfaceCard>

          {/* Templates Grid Cards */}
          {filteredTemplates.length === 0 ? (
            <SurfaceCard padding="lg">
              <EmptyState
                icon={<FileText className="w-7 h-7" />}
                title={L("Nenhum modelo encontrado", "No templates found")}
                description={L(
                  "Tente ajustar os termos de pesquisa ou os filtros de categoria.",
                  "Try adjusting the search terms or category filters."
                )}
              />
            </SurfaceCard>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredTemplates.map((template) => {
                const catBadge = getCategoryBadge(template.category);

                const lastUpdatedFormatted = template.updatedAt
                  ? new Date(template.updatedAt).toLocaleDateString(locale, {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })
                  : L("Padrão do Sistema", "System Default");

                return (
                  <SurfaceCard
                    key={template.id}
                    id={`template-card-${template.id}`}
                    padding="md"
                    interactive
                    className={`flex flex-col justify-between space-y-4 relative group ${
                      template.status === "ATIVO" ? "" : "opacity-75"
                    }`}
                  >
                    {/* Top Card Header */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-2 py-0.5 text-[11px] font-mono font-bold bg-[#EBF5F0] dark:bg-emerald-500/10 text-[#16845B] dark:text-emerald-400 border border-[#16845B]/20 dark:border-emerald-500/20 rounded-md">
                            {template.code}
                          </span>
                          <UIBadge tone={catBadge.tone}>{catBadge.label}</UIBadge>
                        </div>

                        <div className="flex items-center space-x-1.5 shrink-0">
                          <UIBadge tone={template.status === "ATIVO" ? "emerald" : "slate"}>
                            {template.status === "ATIVO" ? L("ATIVO", "ACTIVE") : L("INATIVO", "INACTIVE")}
                          </UIBadge>

                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(template)}
                              className="text-slate-400 hover:text-[#16845B] dark:hover:text-emerald-400 transition-colors cursor-pointer"
                              title={
                                template.status === "ATIVO"
                                  ? L("Desativar modelo", "Deactivate template")
                                  : L("Ativar modelo", "Activate template")
                              }
                              aria-label={
                                template.status === "ATIVO"
                                  ? L("Desativar modelo", "Deactivate template")
                                  : L("Ativar modelo", "Activate template")
                              }
                            >
                              {template.status === "ATIVO" ? (
                                <ToggleRight className="w-5 h-5 text-[#16845B] dark:text-emerald-400" />
                              ) : (
                                <ToggleLeft className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      <h3 className="text-base font-bold text-[#172B2A] dark:text-white tracking-tight line-clamp-2 leading-snug">
                        {template.title}
                      </h3>

                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3 leading-relaxed">
                        {template.description}
                      </p>
                    </div>

                    {/* Metadata Details (Seções, Campos, Assinaturas, Última Atualização) */}
                    <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                      <div className="flex items-center justify-between font-medium">
                        <span>{L(`${template.sections?.length || 0} seções`, `${template.sections?.length || 0} sections`)}</span>
                        <span>•</span>
                        <span>{L(`${template.fields?.length || 0} campos padrão`, `${template.fields?.length || 0} default fields`)}</span>
                        <span>•</span>
                        <span>{L(`${template.signatures?.length || 0} assinaturas`, `${template.signatures?.length || 0} signatures`)}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
                        <span className="flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>{L(`Atualizado: ${lastUpdatedFormatted}`, `Updated: ${lastUpdatedFormatted}`)}</span>
                        </span>
                        <span>{L(`Versão ${template.version}.0`, `Version ${template.version}.0`)}</span>
                      </div>
                    </div>

                    {/* Action Buttons Bar */}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-1">
                        <UIButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenPreview(template)}
                          className="!p-2 text-slate-500 hover:text-[#16845B] dark:hover:text-emerald-400"
                          title={L("Visualizar prévia A4", "View A4 preview")}
                          aria-label={L("Visualizar prévia A4", "View A4 preview")}
                        >
                          <Eye className="w-4 h-4" />
                        </UIButton>

                        {isAdmin && (
                          <>
                            <UIButton
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenEdit(template)}
                              className="!p-2 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400"
                              title={L("Editar modelo (Estrutura, Campos e Textos)", "Edit template (Structure, Fields & Text)")}
                              aria-label={L("Editar modelo", "Edit template")}
                            >
                              <Edit3 className="w-4 h-4" />
                            </UIButton>

                            <UIButton
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDuplicate(template)}
                              className="!p-2 text-slate-500 hover:text-amber-600 dark:hover:text-amber-400"
                              title={L("Duplicar modelo (Criar nova versão)", "Duplicate template (Create new version)")}
                              aria-label={L("Duplicar modelo", "Duplicate template")}
                            >
                              <Copy className="w-4 h-4" />
                            </UIButton>

                            <UIButton
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(template)}
                              className="!p-2 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400"
                              title={L("Excluir modelo", "Delete template")}
                              aria-label={L("Excluir modelo", "Delete template")}
                            >
                              <Trash2 className="w-4 h-4" />
                            </UIButton>
                          </>
                        )}
                      </div>

                      {/* Primary "Usar modelo" Button */}
                      <UIButton
                        type="button"
                        id={`btn-usar-modelo-${template.id}`}
                        variant="primary"
                        size="sm"
                        onClick={() => handleUseTemplate(template)}
                      >
                        <FilePlus className="w-4 h-4" />
                        <span>{L("Usar modelo", "Use template")}</span>
                      </UIButton>
                    </div>
                  </SurfaceCard>
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#172B2A]/45 dark:bg-black/75 modal-backdrop-smooth animate-fade-in"
        >
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl modal-panel-smooth">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-900/70">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/60 text-[#16845B] dark:text-emerald-400 border border-[#16845B]/20 dark:border-emerald-800/50">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono font-bold text-[#16845B] dark:text-emerald-400">
                      {detailsRecord.documentNumber}
                    </span>
                    <UIBadge tone="emerald">{detailsRecord.status || L("Emitido", "Issued")}</UIBadge>
                  </div>
                  <h3 className="text-sm font-bold text-[#172B2A] dark:text-white mt-0.5">
                    {detailsRecord.templateTitle}
                  </h3>
                </div>
              </div>
              <UIButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDetailsRecord(null)}
                className="!p-1.5"
                aria-label={L("Fechar detalhes", "Close details")}
              >
                <X className="w-5 h-5" />
              </UIButton>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Metadata Info Grid */}
              <SubtlePanel padding="md">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-semibold uppercase tracking-wide">
                      {L("Destinatário / Parte", "Recipient / Party")}
                    </span>
                    <span className="font-semibold text-[#172B2A] dark:text-slate-200 text-xs mt-0.5 block">
                      {detailsRecord.recipientOrOrg}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-semibold uppercase tracking-wide">
                      {L("Data e Hora da Emissão", "Issue Date & Time")}
                    </span>
                    <span className="font-semibold text-[#172B2A] dark:text-slate-200 text-xs mt-0.5 block">
                      {new Date(detailsRecord.generatedAt).toLocaleString(locale)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-semibold uppercase tracking-wide">
                      {L("Emitido Por", "Issued By")}
                    </span>
                    <span className="font-semibold text-[#172B2A] dark:text-slate-200 text-xs mt-0.5 block">
                      {detailsRecord.generatedByName}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-semibold uppercase tracking-wide">
                      {L("E-mail do Emissor", "Issuer E-mail")}
                    </span>
                    <span className="font-semibold text-[#172B2A] dark:text-slate-200 text-xs mt-0.5 block">
                      {detailsRecord.generatedByEmail || L("Sistema Institucional", "Institutional System")}
                    </span>
                  </div>
                </div>
              </SubtlePanel>

              {/* Saved Fields List */}
              <div className="space-y-2">
                <h4 className="font-bold text-[#172B2A] dark:text-slate-200 text-xs flex items-center space-x-1.5">
                  <Info className="w-3.5 h-3.5 text-[#16845B] dark:text-emerald-400" />
                  <span>{L("Dados e Campos Registrados na Emissão:", "Data and Fields Recorded at Issuance:")}</span>
                </h4>
                <div className="bg-[#F8FAFC] dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200/70 dark:divide-slate-800 max-h-60 overflow-y-auto">
                  {Object.entries(detailsRecord.fieldsData || {}).map(([key, val]) => (
                    <div key={key} className="p-3 text-xs flex flex-col sm:flex-row sm:items-start justify-between gap-1">
                      <span className="font-mono text-[#16845B] dark:text-emerald-400 font-semibold text-[11px] min-w-[160px]">
                        {`{{${key}}}`}
                      </span>
                      <span className="text-slate-700 dark:text-slate-300 font-sans whitespace-pre-line flex-1 text-right sm:text-left">
                        {val || <em className="text-slate-400 dark:text-slate-600">{L("(vazio)", "(empty)")}</em>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-900/70 flex flex-wrap items-center justify-between gap-2">
              <UIButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDetailsRecord(null)}
              >
                {L("Fechar", "Close")}
              </UIButton>
              <div className="flex items-center space-x-2">
                <UIButton
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleReuseHistoryDocument(detailsRecord)}
                  className="text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{L("Reutilizar / Editar no Gerador", "Reuse / Edit in Generator")}</span>
                </UIButton>
                <UIButton
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => handleReDownloadHistory(detailsRecord)}
                >
                  <Download className="w-4 h-4" />
                  <span>{L("Baixar PDF", "Download PDF")}</span>
                </UIButton>
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
