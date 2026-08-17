import React, { useState, useRef } from "react";
import { DocumentTemplate } from "../../types";
import {
  replaceDynamicTags,
  downloadDocumentPdf,
} from "../../lib/documentPdfGenerator";
import { downloadDocumentFromElement } from "../../lib/pdfGenerator";
import {
  X,
  Download,
  Printer,
  FileText,
  CheckCircle2,
  Calendar,
  Building,
  Users,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sparkles,
} from "lucide-react";

interface DocumentPreviewModalProps {
  template: DocumentTemplate;
  fieldValues?: Record<string, string>;
  isOpen: boolean;
  onClose: () => void;
  onProceedToFill?: () => void;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  template,
  fieldValues = {},
  isOpen,
  onClose,
  onProceedToFill,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isExportingCanvas, setIsExportingCanvas] = useState<boolean>(false);
  const paperRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  // Preencher valores padrão caso o formulário não tenha passado valores
  const resolvedValues: Record<string, string> = { ...fieldValues };
  if (template.fields) {
    template.fields.forEach((fld) => {
      if (resolvedValues[fld.name] === undefined && fld.defaultValue) {
        resolvedValues[fld.name] = fld.defaultValue;
      }
    });
  }

  const handleDownload = () => {
    downloadDocumentPdf(template, resolvedValues);
  };

  const handleDownloadVisualPdf = async () => {
    if (!paperRef.current) {
      handleDownload();
      return;
    }
    try {
      setIsExportingCanvas(true);
      await downloadDocumentFromElement(paperRef.current, `${template.code || "documento"}_oficial.pdf`);
    } catch (err) {
      console.error("Erro ao gerar PDF visual com html2canvas:", err);
      // Fallback para o gerador vetorial nativo jsPDF
      handleDownload();
    } finally {
      setIsExportingCanvas(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      id="document-preview-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto animate-fade-in"
    >
      <div
        id="document-preview-modal-container"
        className="relative w-full max-w-5xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-100"
      >
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-white tracking-tight">{template.title}</h3>
                <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
                  {template.code}
                </span>
              </div>
              <p className="text-xs text-slate-400">Prévia em folha A4 oficial institucional IFPR</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center space-x-2">
            {/* Zoom Controls */}
            <div className="hidden sm:flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700 space-x-1 mr-2">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(75, z - 10))}
                className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors"
                title="Diminuir Zoom"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs font-medium text-slate-300 px-1">{zoomLevel}%</span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(130, z + 10))}
                className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors"
                title="Aumentar Zoom"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>

            {onProceedToFill && (
              <button
                type="button"
                onClick={onProceedToFill}
                className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-all shadow-sm flex items-center space-x-1.5"
              >
                <span>Preencher Dados</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownload}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 rounded-lg transition-all flex items-center space-x-1.5"
              title="Baixar PDF Vetorial Oficial"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Baixar PDF</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadVisualPdf}
              disabled={isExportingCanvas}
              className="hidden md:flex px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-500/30 rounded-lg transition-all items-center space-x-1.5 disabled:opacity-50"
              title="Exportar via Renderização HTML Canvas (html2canvas)"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isExportingCanvas ? "Renderizando..." : "Exportar Imagem/Canvas"}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Imprimir"
            >
              <Printer className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors ml-1"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: A4 Paper Preview Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-950/60 flex justify-center items-start">
          {/* A4 Paper Mockup (Pure CSS Simulation matching jsPDF output) */}
          <div
            ref={paperRef}
            style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: "top center" }}
            className="w-full max-w-[210mm] min-h-[297mm] bg-white text-slate-900 p-8 sm:p-12 shadow-2xl rounded-sm border border-slate-300 font-sans transition-transform duration-150 relative text-left"
          >
            {/* Top Institutional Header Line */}
            <div className="w-full h-1.5 bg-[#00843D] mb-1"></div>
            <div className="w-12 h-1 bg-[#EF4444] mb-4"></div>

            {/* Header Text */}
            {template.includeHeader && (
              <div className="text-center pb-4 mb-4 border-b border-slate-200">
                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-600">
                  República Federativa do Brasil • Ministério da Educação
                </div>
                <div className="text-xs font-extrabold uppercase text-[#00843D] tracking-wide mt-0.5">
                  Instituto Federal do Paraná — Campus Ivaiporã
                </div>
                <div className="text-[9px] uppercase font-semibold text-slate-500 mt-0.5">
                  {template.headerText?.split("\n")[3] || "Disciplina de Extensão · Bacharelado em Sistemas de Informação"}
                </div>
              </div>
            )}

            {/* Document Title Box */}
            <div className="bg-slate-50 border border-slate-300 rounded p-3 text-center my-4">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight uppercase">
                {template.title}
              </h1>
              {template.includeDocNumber && (
                <div className="text-[10px] text-slate-500 font-mono mt-1">
                  Nº DE CONTROLE: DOC-{template.code}-2026/0042 • VERSÃO {template.version || 1}.0
                </div>
              )}
            </div>

            {/* Sections Content */}
            <div className="space-y-4 my-6 text-[11px] sm:text-xs text-slate-800 leading-relaxed">
              {template.sections &&
                template.sections.map((section, idx) => {
                  const contentFormatted = replaceDynamicTags(section.content, resolvedValues);

                  if (section.type === "heading") {
                    return (
                      <h2 key={section.id || idx} className="font-bold text-emerald-800 text-xs sm:text-sm mt-4 border-b border-emerald-100 pb-1">
                        {section.title}
                      </h2>
                    );
                  }

                  if (section.type === "numbered_section" || section.type === "declarations_list") {
                    return (
                      <div key={section.id || idx} className="rounded border border-slate-200 overflow-hidden bg-slate-50/50">
                        <div className="bg-slate-100/80 px-3 py-1.5 text-[11px] font-bold text-slate-800 border-b border-slate-200 flex items-center justify-between">
                          <span>{section.title}</span>
                        </div>
                        <div className="p-3 whitespace-pre-line text-slate-700 font-normal leading-relaxed">
                          {contentFormatted}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={section.id || idx}
                      className={`whitespace-pre-line ${
                        section.align === "center"
                          ? "text-center"
                          : section.align === "right"
                          ? "text-right"
                          : section.align === "justify"
                          ? "text-justify"
                          : "text-left"
                      } ${section.isBold ? "font-bold text-slate-900" : ""} ${
                        section.isItalic ? "italic" : ""
                      }`}
                    >
                      {contentFormatted}
                    </div>
                  );
                })}
            </div>

            {/* Signatures Area */}
            {template.signatures && template.signatures.length > 0 && (
              <div className="mt-12 pt-6 border-t border-slate-200">
                <div
                  className={`grid ${
                    template.signatures.length === 2
                      ? "grid-cols-2 gap-8"
                      : template.signatures.length === 3
                      ? "grid-cols-2 gap-8"
                      : "grid-cols-1 gap-6"
                  }`}
                >
                  {template.signatures.map((sig, idx) => {
                    const name = replaceDynamicTags(sig.nameTag || "", resolvedValues) || "___________________________";
                    const role = replaceDynamicTags(sig.roleTag || "", resolvedValues) || sig.title;
                    const docInfo = replaceDynamicTags(sig.cpfOrDocTag || "", resolvedValues);

                    const isThirdCentered = template.signatures.length === 3 && idx === 2;

                    return (
                      <div
                        key={sig.id || idx}
                        className={`text-center ${isThirdCentered ? "col-span-2 max-w-xs mx-auto mt-6" : ""}`}
                      >
                        <div className="w-full border-b border-slate-400 mb-2"></div>
                        <div className="font-bold text-[11px] text-slate-900">{name}</div>
                        <div className="text-[10px] text-slate-600">{role}</div>
                        {docInfo && <div className="text-[9px] text-slate-500">{docInfo}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Footer Line & Pagination */}
            {template.includeFooter && (
              <div className="absolute bottom-6 left-8 right-8 pt-2 border-t border-slate-200 flex justify-between items-center text-[9px] text-slate-400">
                <span>{template.footerText || "Instituto Federal do Paraná — Campus Ivaiporã"}</span>
                <span>Página 1 de 1</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
