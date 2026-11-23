import React, { useState } from "react";
import {
  BookOpen,
  Download,
  ExternalLink,
  Compass,
  LifeBuoy,
  CheckCircle2,
  AlertCircle,
  FileText,
  Printer,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../context/RouterContext";
import { vibrateClick, vibrateSuccess } from "../lib/utils";
import { triggerSpotlightTour } from "../lib/spotlightTourUtils";
import {
  USER_MANUAL_SECTIONS,
  USER_MANUAL_VERSION,
  downloadUserManualPdf,
} from "../lib/userManualPdfGenerator";

export const UserManualView: React.FC = () => {
  const { addToast, language, t } = useApp();
  const { navigate } = useRouter();
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const handleDownloadPdf = () => {
    vibrateClick();
    setIsDownloadingPdf(true);
    try {
      const filename = downloadUserManualPdf();
      vibrateSuccess();
      addToast(
        language === "en"
          ? `User Manual downloaded (${filename}).`
          : `Manual do Usuário baixado com sucesso (${filename}).`,
        "success"
      );
    } catch (err) {
      console.error("Erro ao gerar PDF do Manual do Usuário:", err);
      addToast(
        language === "en"
          ? "Could not generate the PDF manual. Use the HTML version or print option."
          : "Não foi possível gerar o PDF. Utilize a versão HTML ou a opção de impressão.",
        "error"
      );
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Header Card */}
      <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 sm:p-7 space-y-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EBF5F0] dark:bg-emerald-950/60 text-[#16845B] dark:text-emerald-400 text-[11px] font-bold uppercase tracking-wide">
              <BookOpen className="w-3.5 h-3.5" />
              <span>{t("helpButton", "Ajuda")} • {USER_MANUAL_VERSION}</span>
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              IFPR Campus Ivaiporã
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-[#172B2A] dark:text-white tracking-tight">
            {t("userManualTitle", "Manual de Utilização do Localiza+")}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
            {language === "en"
              ? "Complete guide for students, staff, administrators, and external community members on how to register, search, track QR Codes, claim items, and install Localiza+ as an app."
              : "Guia completo para estudantes, servidores, administradores e comunidade externa sobre como criar conta, consultar objetos, usar QR Code, solicitar devolução e instalar o Localiza+ como aplicativo."}
          </p>
        </div>

        {/* Action Buttons: PDF, Standalone HTML, Guided Tour, Support */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            id="btn-download-manual-pdf"
            type="button"
            disabled={isDownloadingPdf}
            onClick={handleDownloadPdf}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#16845B] hover:bg-[#064E3B] text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
          >
            <Download className="w-4 h-4" />
            <span>
              {isDownloadingPdf
                ? language === "en"
                  ? "Generating PDF..."
                  : "Gerando PDF..."
                : language === "en"
                ? "Download Manual (PDF)"
                : "Baixar Manual (PDF)"}
            </span>
          </button>

          <a
            id="link-open-manual-html"
            href="/manual-usuario.html"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => vibrateClick()}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-[#172B2A] dark:text-slate-100 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors"
          >
            <FileText className="w-4 h-4 text-[#16845B] dark:text-emerald-400" />
            <span>
              {language === "en" ? "Open Manual (HTML)" : "Abrir Manual (HTML)"}
            </span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </a>

          <button
            type="button"
            onClick={() => {
              vibrateClick();
              navigate("/");
              setTimeout(() => triggerSpotlightTour(), 250);
            }}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/40 hover:bg-[#16845B]/15 text-[#16845B] dark:text-emerald-400 border border-[#16845B]/25 text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Compass className="w-4 h-4" />
            <span>{t("tourReplayBtn", "Iniciar Tour Guiado")}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              vibrateClick();
              navigate("/suporte");
            }}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
          >
            <LifeBuoy className="w-4 h-4" />
            <span>{t("contactSupport", "Suporte")}</span>
          </button>
        </div>
      </section>

      {/* Quick Index / Table of Contents */}
      <nav
        aria-label="Sumário do Manual"
        className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-4 sm:p-5"
      >
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
          {language === "en" ? "Quick Index" : "Índice Rápido"}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {USER_MANUAL_SECTIONS.map((sec) => (
            <a
              key={sec.id}
              href={`#manual-${sec.id}`}
              className="px-3 py-2 rounded-lg text-xs sm:text-sm font-medium text-[#172B2A] dark:text-slate-200 hover:bg-[#EBF5F0] dark:hover:bg-emerald-950/40 hover:text-[#16845B] dark:hover:text-emerald-400 transition-colors flex items-center gap-2"
            >
              <span className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-bold flex items-center justify-center shrink-0 text-[#16845B] dark:text-emerald-400">
                {sec.number}
              </span>
              <span className="truncate">{sec.title}</span>
            </a>
          ))}
        </div>
      </nav>

      {/* Full Manual Sections */}
      <div className="space-y-4">
        {USER_MANUAL_SECTIONS.map((sec) => (
          <article
            key={sec.id}
            id={`manual-${sec.id}`}
            className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-3 scroll-mt-20"
          >
            <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
              <span className="w-7 h-7 rounded-lg bg-[#EBF5F0] dark:bg-emerald-950/60 text-[#16845B] dark:text-emerald-400 text-xs font-bold flex items-center justify-center shrink-0">
                {sec.number}
              </span>
              <h2 className="text-base sm:text-lg font-bold text-[#172B2A] dark:text-white">
                {sec.title}
              </h2>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {sec.summary}
            </p>

            <ul className="space-y-2 pt-1">
              {sec.bullets.map((bullet, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300 leading-relaxed"
                >
                  <CheckCircle2 className="w-4 h-4 text-[#16845B] dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>

            {sec.note && (
              <div className="mt-2 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-2.5 text-xs sm:text-sm text-amber-900 dark:text-amber-200">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <span>{sec.note}</span>
              </div>
            )}
          </article>
        ))}
      </div>

      {/* Bottom Print/Download Bar */}
      <div className="rounded-2xl bg-[#EBF5F0] dark:bg-emerald-950/30 border border-[#16845B]/20 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-[#064E3B] dark:text-emerald-300">
            {language === "en"
              ? "Need an offline copy of the manual?"
              : "Precisa de uma cópia offline ou impressa do manual?"}
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {language === "en"
              ? "Download the official PDF or open the standalone HTML page ready for printing."
              : "Baixe o arquivo PDF oficial ou abra a página HTML independente pronta para impressão."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-[#16845B] hover:bg-[#064E3B] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>PDF</span>
          </button>
          <a
            href="/manual-usuario.html"
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[40px] px-4 py-2 rounded-xl bg-white dark:bg-slate-900 text-[#172B2A] dark:text-white border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            <Printer className="w-3.5 h-3.5 text-[#16845B] dark:text-emerald-400" />
            <span>HTML / Imprimir</span>
          </a>
        </div>
      </div>
    </div>
  );
};
