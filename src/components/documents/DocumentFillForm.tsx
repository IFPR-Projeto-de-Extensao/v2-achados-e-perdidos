import React, { useState, useMemo, useRef } from "react";
import { DocumentTemplate, DocumentField } from "../../types";
import { useApp } from "../../context/AppContext";
import {
  generateDocumentPdf,
  replaceDynamicTags,
} from "../../lib/documentPdfGenerator";
import {
  buildDynamicFormFields,
  extractDynamicTags,
  downloadDocumentFromElement,
} from "../../lib/pdfGenerator";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import {
  ArrowLeft,
  Download,
  Eye,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  FileText,
  Building,
  User,
  Calendar,
  AlertCircle,
  HelpCircle,
  Hash,
} from "lucide-react";
import { SurfaceCard, UIButton, UIBadge, UIFieldGroup, UIInput, UITextarea } from "../ui";

interface DocumentFillFormProps {
  template: DocumentTemplate;
  initialValues?: Record<string, string>;
  initialDocumentNumber?: string;
  onBack: () => void;
}

export const DocumentFillForm: React.FC<DocumentFillFormProps> = ({
  template,
  initialValues,
  initialDocumentNumber,
  onBack,
}) => {
  const { logGeneratedDocument, addToast, projectSettings } = useApp();
  const livePreviewRef = useRef<HTMLDivElement>(null);

  // Extrair automaticamente todos os campos dinâmicos do modelo com defaults do projeto
  const consolidatedFields = useMemo(() => {
    return buildDynamicFormFields(template, projectSettings);
  }, [template, projectSettings]);

  const detectedTags = useMemo(() => {
    return extractDynamicTags(template);
  }, [template]);

  // Initial state derived from consolidated fields defaults, merged with initialValues if provided
  const [formData, setFormData] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    consolidatedFields.forEach((field) => {
      initial[field.name] = field.defaultValue || "";
    });
    if (initialValues && typeof initialValues === "object") {
      Object.assign(initial, initialValues);
    }
    return initial;
  });

  const [documentNumber, setDocumentNumber] = useState<string>(() => {
    if (initialDocumentNumber) return initialDocumentNumber;
    return `DOC-${template.code || "IFPR"}-${new Date().getFullYear()}/${String(
      Math.floor(1000 + Math.random() * 9000)
    )}`;
  });

  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isGeneratingCanvas, setIsGeneratingCanvas] = useState<boolean>(false);

  // Group fields by section
  const groupedFields = useMemo(() => {
    const groups: Record<string, DocumentField[]> = {};
    consolidatedFields.forEach((field) => {
      const sectionName = field.section || "Campos Gerais do Documento";
      if (!groups[sectionName]) {
        groups[sectionName] = [];
      }
      groups[sectionName].push(field);
    });
    return groups;
  }, [consolidatedFields]);

  const handleInputChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleResetDefaults = () => {
    const reset: Record<string, string> = {};
    consolidatedFields.forEach((field) => {
      reset[field.name] = field.defaultValue || "";
    });
    setFormData(reset);
    addToast("Valores restaurados para o padrão do modelo e dados do projeto.", "info");
  };

  const handleGeneratePdf = async () => {
    setIsGenerating(true);
    try {
      // Validação de campos obrigatórios
      const missingRequired = consolidatedFields.filter(
        (f) => f.required && !formData[f.name]?.trim()
      );

      if (missingRequired.length > 0) {
        addToast(
          `Preencha o campo obrigatório: ${missingRequired[0].label}`,
          "error"
        );
        setIsGenerating(false);
        return;
      }

      const { doc, filename } = generateDocumentPdf(template, formData, {
        documentNumber,
        projectSettings,
      });

      // Baixar arquivo
      doc.save(filename);

      // Registrar no histórico de emissões
      const recipient =
        formData["nome_organizacao"] ||
        formData["nome_reclamante"] ||
        formData["entidade_donataria"] ||
        formData["responsavel"] ||
        formData["nome_interessado"] ||
        "Geral / Institucional";

      await logGeneratedDocument({
        templateId: template.id,
        templateTitle: template.title,
        documentNumber,
        recipientOrOrg: recipient,
        fieldsData: formData,
      });

      addToast(`Documento PDF '${filename}' gerado com sucesso!`, "success");
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      addToast("Erro ao processar o PDF. Verifique os dados informados.", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateCanvasPdf = async () => {
    if (!livePreviewRef.current) {
      handleGeneratePdf();
      return;
    }

    setIsGeneratingCanvas(true);
    try {
      await downloadDocumentFromElement(
        livePreviewRef.current,
        `${template.code || "documento"}_${new Date().toISOString().slice(0, 10)}.pdf`
      );

      const recipient =
        formData["nome_organizacao"] ||
        formData["nome_reclamante"] ||
        formData["entidade_donataria"] ||
        formData["responsavel"] ||
        formData["nome_interessado"] ||
        "Geral / Institucional";

      await logGeneratedDocument({
        templateId: template.id,
        templateTitle: template.title,
        documentNumber,
        recipientOrOrg: recipient,
        fieldsData: formData,
      });

      addToast("PDF gerado via captura de alta resolução!", "success");
    } catch (err) {
      console.error("Erro no download html2canvas:", err);
      // Fallback para geração vetorial
      handleGeneratePdf();
    } finally {
      setIsGeneratingCanvas(false);
    }
  };

  return (
    <div id="document-fill-form-view" className="space-y-6 animate-fade-in text-[#172B2A] dark:text-slate-100">
      {/* Top Bar Navigation */}
      <SurfaceCard padding="md" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3 min-w-0">
          <UIButton
            variant="secondary"
            size="sm"
            onClick={onBack}
            className="!p-2.5"
            title="Voltar para lista de modelos"
          >
            <ArrowLeft className="w-5 h-5" />
          </UIButton>
          <div className="min-w-0">
            <div className="flex items-center flex-wrap gap-2">
              <UIBadge tone="emerald">{template.code}</UIBadge>
              <h2 className="text-lg font-bold text-[#172B2A] dark:text-white tracking-tight truncate">
                {template.title}
              </h2>
              <UIBadge tone="blue" className="hidden sm:inline-flex">
                <Sparkles className="w-3 h-3" />
                {detectedTags.length} campos detectados
              </UIBadge>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{template.description}</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center flex-wrap gap-2 shrink-0">
          <UIButton
            variant="secondary"
            size="sm"
            onClick={handleResetDefaults}
            title="Restaurar valores padrão"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Padrões</span>
          </UIButton>

          <UIButton
            variant="outline"
            size="sm"
            onClick={() => setIsPreviewModalOpen(true)}
          >
            <Eye className="w-4 h-4" />
            <span>Ver Prévia A4</span>
          </UIButton>

          <UIButton
            variant="primary"
            size="sm"
            onClick={handleGeneratePdf}
            disabled={isGenerating || isGeneratingCanvas}
          >
            <Download className="w-4 h-4" />
            <span>{isGenerating ? "Gerando..." : "Gerar e Baixar PDF"}</span>
          </UIButton>
        </div>
      </SurfaceCard>

      {/* Main Grid: Form on Left, Live Mini Preview on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form Fields */}
        <div className="lg:col-span-7 space-y-6">
          {/* Document Number / Emission details card */}
          <SurfaceCard padding="md" className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-[#16845B] dark:text-emerald-400 font-semibold text-sm">
                <Hash className="w-4 h-4" />
                <span>Identificação do Documento</span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Versão {template.version}.0</span>
            </div>

            <UIFieldGroup label="Número de Registro / Protocolo" htmlFor="doc-protocol-number">
              <UIInput
                id="doc-protocol-number"
                type="text"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                className="font-mono"
                placeholder="Ex: DOC-EXT-2026/0042"
              />
            </UIFieldGroup>
          </SurfaceCard>

          {/* Grouped Field Sections */}
          {Object.entries(groupedFields).map(([sectionTitle, fields], sIdx) => (
            <SurfaceCard key={sIdx} padding="md" className="space-y-4">
              <div className="flex items-center space-x-2 text-[#172B2A] dark:text-white font-semibold text-sm border-b border-slate-100 dark:border-slate-800 pb-3">
                <FileText className="w-4 h-4 text-[#16845B] dark:text-emerald-400" />
                <span>{sectionTitle}</span>
              </div>

              <div className="space-y-4">
                {fields.map((field) => {
                  const val = formData[field.name] !== undefined ? formData[field.name] : "";

                  return (
                    <div key={field.id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs font-semibold text-[#172B2A] dark:text-slate-200 flex items-center space-x-1">
                          <span>{field.label}</span>
                          {field.required && <span className="text-red-500 font-bold">*</span>}
                        </label>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                          {`{{${field.name}}}`}
                        </span>
                      </div>

                      {field.type === "textarea" ? (
                        <UITextarea
                          rows={4}
                          value={val}
                          onChange={(e) => handleInputChange(field.name, e.target.value)}
                          placeholder={field.placeholder || ""}
                          className="leading-relaxed"
                        />
                      ) : (
                        <UIInput
                          type={field.type === "number" ? "number" : "text"}
                          value={val}
                          onChange={(e) => handleInputChange(field.name, e.target.value)}
                          placeholder={field.placeholder || ""}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </SurfaceCard>
          ))}

          {/* Bottom Action Footer */}
          <SurfaceCard padding="sm" className="flex items-center justify-between">
            <UIButton variant="ghost" size="sm" onClick={onBack}>
              Cancelar
            </UIButton>
            <UIButton
              variant="primary"
              size="md"
              onClick={handleGeneratePdf}
              disabled={isGenerating}
            >
              <Download className="w-4 h-4" />
              <span>{isGenerating ? "Processando..." : "Gerar e Baixar Documento PDF"}</span>
            </UIButton>
          </SurfaceCard>
        </div>

        {/* Right Column: Dynamic Live Preview Card */}
        <div className="lg:col-span-5 space-y-4">
          <SurfaceCard padding="sm" className="sticky top-20 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <div className="flex items-center space-x-2 text-[#172B2A] dark:text-slate-200 font-semibold text-xs">
                <Eye className="w-4 h-4 text-[#16845B] dark:text-emerald-400" />
                <span>Prévia em Tempo Real</span>
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewModalOpen(true)}
                className="text-[11px] text-[#16845B] dark:text-emerald-400 hover:text-[#064E3B] dark:hover:text-emerald-300 font-semibold cursor-pointer"
              >
                Expandir A4
              </button>
            </div>

            {/* Document Paper Preview Card (Strictly white paper contrast) */}
            <div
              ref={livePreviewRef}
              className="bg-white text-slate-900 p-5 rounded-lg border border-slate-200 shadow-inner max-h-[680px] overflow-y-auto text-[10px] space-y-3 font-sans"
            >
              <div className="w-full h-1 bg-[#00843D]"></div>
              <div className="text-center font-bold text-[9px] uppercase text-slate-700">
                IFPR — Campus Ivaiporã
              </div>
              <div className="bg-slate-100 p-2 text-center font-bold text-[10px] uppercase text-slate-900 rounded border border-slate-200">
                {template.title}
              </div>

              {template.sections?.map((sec, idx) => {
                const previewText = replaceDynamicTags(sec.content, formData, projectSettings);
                if (sec.type === "numbered_section" || sec.type === "declarations_list") {
                  return (
                    <div key={idx} className="bg-slate-50 border border-slate-200 rounded p-2 text-[9px]">
                      <div className="font-bold text-slate-800 mb-1">{sec.title}</div>
                      <div className="whitespace-pre-line text-slate-600">{previewText}</div>
                    </div>
                  );
                }
                return (
                  <div
                    key={idx}
                    className={`whitespace-pre-line text-[9px] text-slate-700 ${
                      sec.isBold ? "font-bold text-slate-900" : ""
                    } ${sec.align === "right" ? "text-right" : ""}`}
                  >
                    {previewText}
                  </div>
                );
              })}

              {/* Signatures Preview */}
              {template.signatures && template.signatures.length > 0 && (
                <div className="pt-4 border-t border-slate-200 space-y-3">
                  {template.signatures.map((sig, idx) => {
                    const name = replaceDynamicTags(sig.nameTag || "", formData, projectSettings) || "_____________________";
                    const role = replaceDynamicTags(sig.roleTag || "", formData, projectSettings) || sig.title;
                    return (
                      <div key={idx} className="text-center">
                        <div className="w-32 border-b border-slate-400 mx-auto mb-1"></div>
                        <div className="font-bold text-[9px] text-slate-900">{name}</div>
                        <div className="text-[8px] text-slate-500">{role}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center">
              As alterações preenchidas à esquerda atualizam a visualização instantaneamente.
            </p>
          </SurfaceCard>
        </div>
      </div>

      {/* Full A4 Preview Modal */}
      <DocumentPreviewModal
        template={template}
        fieldValues={formData}
        projectSettings={projectSettings}
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
      />
    </div>
  );
};
