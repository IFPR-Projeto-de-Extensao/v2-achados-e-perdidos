import React, { useState } from "react";
import { DocumentTemplate, GeneratedDocumentRecord } from "../../types";
import { useApp } from "../../context/AppContext";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { DocumentFillForm } from "./DocumentFillForm";
import { DocumentTemplateEditor } from "./DocumentTemplateEditor";
import { downloadDocumentPdf } from "../../lib/documentPdfGenerator";
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
} from "lucide-react";

export const DocumentsAdminModule: React.FC = () => {
  const {
    documentTemplates,
    generatedDocuments,
    deleteDocumentTemplate,
    duplicateDocumentTemplate,
    toggleDocumentTemplateStatus,
    currentUser,
    addToast,
  } = useApp();

  // Module Screen State
  const [viewMode, setViewMode] = useState<"gallery" | "history" | "fill" | "edit" | "create">("gallery");
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);

  // Preview Modal
  const [previewTemplate, setPreviewTemplate] = useState<DocumentTemplate | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("TODOS");
  const [statusFilter, setStatusFilter] = useState<"TODOS" | "ATIVO" | "INATIVO">("TODOS");

  // Filtered Templates
  const filteredTemplates = documentTemplates.filter((tpl) => {
    const matchesSearch =
      tpl.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tpl.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tpl.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = categoryFilter === "TODOS" || tpl.category === categoryFilter;
    const matchesStatus = statusFilter === "TODOS" || tpl.status === statusFilter;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Action Triggers
  const handleOpenFill = (tpl: DocumentTemplate) => {
    setSelectedTemplate(tpl);
    setViewMode("fill");
  };

  const handleOpenEdit = (tpl: DocumentTemplate) => {
    setSelectedTemplate(tpl);
    setViewMode("edit");
  };

  const handleOpenCreate = () => {
    setSelectedTemplate(null);
    setViewMode("create");
  };

  const handleOpenPreview = (tpl: DocumentTemplate) => {
    setPreviewTemplate(tpl);
    setIsPreviewOpen(true);
  };

  const handleDelete = async (tpl: DocumentTemplate) => {
    if (window.confirm(`Tem certeza que deseja excluir o modelo '${tpl.title}'?`)) {
      await deleteDocumentTemplate(tpl.id);
    }
  };

  const handleDuplicate = async (tpl: DocumentTemplate) => {
    await duplicateDocumentTemplate(tpl.id);
  };

  const handleToggleStatus = async (tpl: DocumentTemplate) => {
    await toggleDocumentTemplateStatus(tpl.id);
  };

  // Re-download from emission history
  const handleReDownloadHistory = (rec: GeneratedDocumentRecord) => {
    const parentTpl =
      documentTemplates.find((t) => t.id === rec.templateId) ||
      documentTemplates.find((t) => t.title === rec.templateTitle);

    if (parentTpl) {
      downloadDocumentPdf(parentTpl, rec.fieldsData, {
        documentNumber: rec.documentNumber,
      });
      addToast(`Documento ${rec.documentNumber} baixado novamente!`, "success");
    } else {
      addToast("O modelo original deste documento não está mais disponível.", "error");
    }
  };

  // Sub-views rendering
  if (viewMode === "fill" && selectedTemplate) {
    return (
      <DocumentFillForm
        template={selectedTemplate}
        onBack={() => setViewMode("gallery")}
      />
    );
  }

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
      {/* Top Banner / Stats Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center space-x-3.5">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400">
              <FileText className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-bold text-white tracking-tight">Gerador de Documentos e Modelos PDF</h2>
                <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30">
                  Exclusivo Admin
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Crie, personalize, preencha e emita termos de aceite, doações e comprovantes institucionais em PDF no padrão IFPR.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => setViewMode("history")}
              className={`px-3.5 py-2 text-xs font-semibold rounded-xl border transition-colors flex items-center space-x-1.5 ${
                viewMode === "history"
                  ? "bg-slate-800 text-emerald-400 border-emerald-500/30"
                  : "bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700"
              }`}
            >
              <History className="w-4 h-4" />
              <span>Histórico ({generatedDocuments.length})</span>
            </button>

            <button
              type="button"
              onClick={handleOpenCreate}
              className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-md transition-all flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Modelo</span>
            </button>
          </div>
        </div>

        {/* Metric Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800 text-xs">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <span className="text-slate-400 block text-[11px]">Total de Modelos</span>
            <span className="text-lg font-bold text-white mt-0.5 block">{documentTemplates.length}</span>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <span className="text-slate-400 block text-[11px]">Modelos Ativos</span>
            <span className="text-lg font-bold text-emerald-400 mt-0.5 block">
              {documentTemplates.filter((t) => t.status === "ATIVO").length}
            </span>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <span className="text-slate-400 block text-[11px]">Documentos Emitidos</span>
            <span className="text-lg font-bold text-blue-400 mt-0.5 block">{generatedDocuments.length}</span>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <span className="text-slate-400 block text-[11px]">Padrão Institucional</span>
            <span className="text-xs font-bold text-emerald-300 mt-1 block">IFPR Folha A4</span>
          </div>
        </div>
      </div>

      {/* VIEW: EMISSION HISTORY */}
      {viewMode === "history" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMode("gallery")}
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center space-x-1"
            >
              <span>← Voltar para Galeria de Modelos</span>
            </button>
            <span className="text-xs text-slate-400">
              {generatedDocuments.length} documento(s) emitido(s) registrado(s)
            </span>
          </div>

          {generatedDocuments.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
              <FileCheck className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-slate-300">Nenhum documento emitido ainda</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Ao preencher e gerar documentos PDF na galeria de modelos, os registros com número de protocolo e destinatário aparecerão aqui para fácil reemissão.
              </p>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="px-5 py-3.5 font-semibold">Nº de Protocolo</th>
                      <th className="px-5 py-3.5 font-semibold">Modelo</th>
                      <th className="px-5 py-3.5 font-semibold">Destinatário / Parceiro</th>
                      <th className="px-5 py-3.5 font-semibold">Data de Emissão</th>
                      <th className="px-5 py-3.5 font-semibold">Emitido Por</th>
                      <th className="px-5 py-3.5 font-semibold text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {generatedDocuments.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-5 py-3.5 font-mono text-emerald-400 font-bold">{doc.documentNumber}</td>
                        <td className="px-5 py-3.5 font-medium text-white">{doc.templateTitle}</td>
                        <td className="px-5 py-3.5 text-slate-300">{doc.recipientOrOrg}</td>
                        <td className="px-5 py-3.5 text-slate-400">
                          {new Date(doc.generatedAt).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-5 py-3.5 text-slate-400">{doc.generatedByName}</td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleReDownloadHistory(doc)}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-lg border border-emerald-500/30 text-xs font-semibold transition-colors inline-flex items-center space-x-1"
                            title="Baixar novamente"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Baixar</span>
                          </button>
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
        /* VIEW: TEMPLATES GALLERY & MANAGER */
        <div className="space-y-6">
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
                { id: "ACHADOS_PERDIDOS", label: "Achados e Perdidos" },
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

          {/* Templates Grid */}
          {filteredTemplates.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
              <FileText className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-slate-300">Nenhum modelo encontrado</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Tente ajustar os termos de pesquisa ou filtros de categoria.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredTemplates.map((template) => (
                <div
                  key={template.id}
                  className={`bg-slate-900 border rounded-2xl p-5 flex flex-col justify-between space-y-4 transition-all hover:border-slate-700 shadow-sm relative group ${
                    template.status === "ATIVO" ? "border-slate-800" : "border-slate-800/50 opacity-75"
                  }`}
                >
                  {/* Top card header */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
                        {template.code}
                      </span>
                      
                      <div className="flex items-center space-x-2">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                            template.status === "ATIVO"
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : "bg-slate-800 text-slate-400 border border-slate-700"
                          }`}
                        >
                          {template.status}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleToggleStatus(template)}
                          className="text-slate-400 hover:text-emerald-400 transition-colors"
                          title={template.status === "ATIVO" ? "Desativar modelo" : "Ativar modelo"}
                        >
                          {template.status === "ATIVO" ? (
                            <ToggleRight className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <ToggleLeft className="w-5 h-5 text-slate-500" />
                          )}
                        </button>
                      </div>
                    </div>

                    <h3 className="text-base font-bold text-white tracking-tight line-clamp-2 leading-snug">
                      {template.title}
                    </h3>

                    <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                      {template.description}
                    </p>
                  </div>

                  {/* Metadata Chips */}
                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{template.sections?.length || 0} seções</span>
                    <span>•</span>
                    <span>{template.fields?.length || 0} campos dinâmicos</span>
                    <span>•</span>
                    <span>{template.signatures?.length || 0} assinaturas</span>
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

                      <button
                        type="button"
                        onClick={() => handleOpenEdit(template)}
                        className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="Editar modelo"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDuplicate(template)}
                        className="p-2 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="Duplicar modelo"
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
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenFill(template)}
                      className="px-3.5 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow transition-all flex items-center space-x-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Preencher</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Preview Modal */}
      {previewTemplate && (
        <DocumentPreviewModal
          template={previewTemplate}
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          onProceedToFill={() => {
            setIsPreviewOpen(false);
            handleOpenFill(previewTemplate);
          }}
        />
      )}
    </div>
  );
};

export const DocumentManagerView = DocumentsAdminModule;

