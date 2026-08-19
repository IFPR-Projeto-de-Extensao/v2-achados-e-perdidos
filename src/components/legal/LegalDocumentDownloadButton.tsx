import React, { useState } from "react";
import { Download, CheckCircle2, AlertCircle, Loader2, FileDown } from "lucide-react";
import { LegalDocumentData } from "../../data/legalDocumentsData";
import { generateLegalDocumentPdf } from "../../lib/legalDocumentPdfGenerator";

interface LegalDocumentDownloadButtonProps {
  documentData: LegalDocumentData;
  className?: string;
  variant?: "primary" | "secondary" | "header";
}

export const LegalDocumentDownloadButton: React.FC<LegalDocumentDownloadButtonProps> = ({
  documentData,
  className = "",
  variant = "primary",
}) => {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const handleDownload = async () => {
    if (status === "loading") return;

    try {
      setStatus("loading");
      setErrorMessage("");

      // Pequeno timeout assíncrono para garantir que a UI atualize o estado de carregamento
      await new Promise((resolve) => setTimeout(resolve, 150));

      generateLegalDocumentPdf(documentData);

      setStatus("success");
      setTimeout(() => {
        setStatus("idle");
      }, 4000);
    } catch (err) {
      console.error("[Download Legal PDF Error]", err);
      setStatus("error");
      setErrorMessage("Não foi possível gerar o PDF. Tente novamente.");
      setTimeout(() => {
        setStatus("idle");
        setErrorMessage("");
      }, 5000);
    }
  };

  const getButtonText = () => {
    if (status === "loading") {
      return "Gerando PDF...";
    }
    if (status === "success") {
      return "PDF baixado com sucesso.";
    }
    if (status === "error") {
      return errorMessage || "Não foi possível gerar o PDF. Tente novamente.";
    }
    return documentData.id === "privacy_policy"
      ? "Baixar Política de Privacidade em PDF"
      : "Baixar Termos de Uso em PDF";
  };

  // Estilos base com foco visível e acessibilidade
  const baseClasses =
    "inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-3 rounded-2xl text-xs sm:text-sm font-bold transition-all duration-200 shadow-sm cursor-pointer select-none focus:outline-hidden focus:ring-2 focus:ring-offset-2 min-h-[44px]";

  let variantClasses = "";
  if (status === "success") {
    variantClasses =
      "bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500 border border-emerald-500";
  } else if (status === "error") {
    variantClasses =
      "bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-500 border border-rose-500";
  } else if (variant === "header") {
    variantClasses =
      "bg-[#00843D] hover:bg-[#006e32] text-white focus:ring-[#00843D] border border-emerald-600/30 active:scale-[0.98]";
  } else if (variant === "secondary") {
    variantClasses =
      "bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-700 focus:ring-[#00843D]";
  } else {
    variantClasses =
      "bg-[#00843D] hover:bg-[#006e32] text-white focus:ring-[#00843D] border border-emerald-600/30 active:scale-[0.98]";
  }

  return (
    <button
      type="button"
      id={`btn-download-pdf-${documentData.id}`}
      onClick={handleDownload}
      disabled={status === "loading"}
      aria-label={getButtonText()}
      aria-busy={status === "loading"}
      className={`${baseClasses} ${variantClasses} ${className}`}
    >
      {status === "loading" && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
      {status === "success" && <CheckCircle2 className="w-4 h-4 text-white shrink-0" />}
      {status === "error" && <AlertCircle className="w-4 h-4 text-white shrink-0" />}
      {status === "idle" && <FileDown className="w-4 h-4 shrink-0" />}

      <span className="truncate">{getButtonText()}</span>
    </button>
  );
};
