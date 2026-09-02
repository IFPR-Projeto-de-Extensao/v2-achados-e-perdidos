import React, { useState, useEffect } from "react";
import { useApp } from "../../context/AppContext";
import { useRouter } from "../../context/RouterContext";
import { LegalDocumentData } from "../../data/legalDocumentsData";
import { LegalSectionRenderer } from "./LegalSectionRenderer";
import { LegalDocumentDownloadButton } from "./LegalDocumentDownloadButton";
import {
  FileText,
  ShieldCheck,
  Building2,
  Calendar,
  ArrowLeft,
  Printer,
  Search,
  ChevronRight,
  BookOpen,
  ExternalLink,
  Shield,
  Mail,
} from "lucide-react";
import { vibrateClick } from "../../lib/utils";

interface LegalDocumentLayoutProps {
  data: LegalDocumentData;
  otherDocumentPath: string;
  otherDocumentLabel: string;
  otherDocumentTab: "privacy_policy" | "terms_of_use";
}

export const LegalDocumentLayout: React.FC<LegalDocumentLayoutProps> = ({
  data,
  otherDocumentPath,
  otherDocumentLabel,
  otherDocumentTab,
}) => {
  const { setActiveTab } = useApp();
  const { navigate, goBack } = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSectionId, setActiveSectionId] = useState<string>("sec-1");

  // Scroll to top on initial mount & update page title & meta description
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    const originalTitle = document.title;
    document.title = `${data.title} | Localiza+`;

    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute("content", data.summary);
    }

    return () => {
      document.title = originalTitle;
    };
  }, [data.title, data.summary]);

  const handleBackToSystem = () => {
    vibrateClick();
    if (typeof window !== "undefined" && window.history.length > 1) {
      goBack();
    } else {
      navigate("/");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleOpenOtherDocument = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    vibrateClick();
    navigate(otherDocumentPath);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const filteredSections = data.sections.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.num.toString().includes(searchQuery)
  );

  const scrollToSection = (id: string) => {
    setActiveSectionId(id);
    const element = document.getElementById(id);
    if (element) {
      const yOffset = -90;
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  return (
    <main className="max-w-7xl mx-auto space-y-8 animate-fadeIn pb-12">
      {/* Top Header Card */}
      <header className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 shadow-sm transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-neutral-100 dark:border-neutral-800">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-[#00843D]/10 text-[#00843D] dark:text-green-400 border border-[#00843D]/20">
                Documento Institucional • {data.project}
              </span>
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                {data.institution} – {data.campus}
              </span>
              {data.id === "privacy_policy" && (
                <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40">
                  LGPD (Lei nº 13.709/2018)
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-neutral-900 dark:text-white tracking-tight flex items-center gap-3">
              <FileText className="w-7 h-7 sm:w-9 sm:h-9 text-[#00843D] shrink-0" />
              <span>{data.title}</span>
            </h1>

            <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 max-w-3xl leading-relaxed">
              {data.summary}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Prominent PDF Download Button */}
            <LegalDocumentDownloadButton
              documentData={data}
              variant="header"
            />

            <button
              onClick={handleBackToSystem}
              className="px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/60 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 text-xs font-bold transition-all flex items-center space-x-1.5 shadow-2xs cursor-pointer min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar ao Sistema</span>
            </button>

            <button
              onClick={handlePrint}
              title="Imprimir documento"
              className="px-3.5 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-xs font-bold transition-all flex items-center space-x-1.5 shadow-2xs cursor-pointer min-h-[44px]"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Imprimir</span>
            </button>
          </div>
        </div>

        {/* Date and Key Meta */}
        <div className="pt-4 flex flex-wrap items-center justify-between gap-4 text-xs text-neutral-500 dark:text-neutral-400">
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-[#00843D] shrink-0" />
            <span>
              <strong>Última atualização:</strong> {data.lastUpdated}
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1.5">
              <ShieldCheck className="w-4 h-4 text-[#00843D]" />
              <span>Conformidade Legal & Segurança</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <Building2 className="w-4 h-4 text-neutral-400" />
              <span>IFPR Ivaiporã</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Layout: Sticky Sidebar Navigation + Content Body */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Sticky Table of Contents Sidebar */}
        <aside aria-label={`Índice de ${data.title}`} className="lg:col-span-4 lg:sticky lg:top-20 space-y-4">
          <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wider text-neutral-900 dark:text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#00843D]" />
                <span>Índice de Seções</span>
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
                {data.sections.length} seções
              </span>
            </div>

            {/* Quick Search inside Table of Contents */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-neutral-400" />
              <input
                type="text"
                placeholder="Filtrar seção por número ou palavra..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
              />
            </div>

            {/* Links list with scroll behavior */}
            <nav className="max-h-[52vh] overflow-y-auto pr-1 space-y-1 scrollbar-thin text-xs">
              {filteredSections.map((sec) => (
                <button
                  key={sec.id}
                  onClick={() => scrollToSection(sec.id)}
                  className={`w-full text-left px-3 py-2 rounded-xl transition-all flex items-center justify-between group cursor-pointer ${
                    activeSectionId === sec.id
                      ? "bg-[#00843D] text-white font-bold shadow-xs"
                      : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white font-medium"
                  }`}
                >
                  <span className="truncate mr-2">
                    <span className="font-mono text-[11px] opacity-70 mr-1.5">
                      {sec.num.toString().padStart(2, "0")}.
                    </span>
                    {sec.title}
                  </span>
                  <ChevronRight
                    className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                      activeSectionId === sec.id
                        ? "text-white translate-x-0.5"
                        : "text-neutral-400 group-hover:translate-x-0.5"
                    }`}
                  />
                </button>
              ))}
              {filteredSections.length === 0 && (
                <p className="text-[11px] text-neutral-400 text-center py-4">
                  Nenhuma seção encontrada para a busca realizada.
                </p>
              )}
            </nav>

            {/* Cross-Link Box */}
            <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex flex-col gap-2">
              <a
                href={otherDocumentPath}
                onClick={handleOpenOtherDocument}
                className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-[11px] text-emerald-800 dark:text-emerald-300 font-bold hover:underline flex items-center justify-between"
              >
                <span>Ver {otherDocumentLabel}</span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </a>
            </div>
          </div>

          {/* Quick Contact Sidebar Box */}
          <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-4 shadow-sm space-y-2 text-xs">
            <div className="flex items-center space-x-2 text-[#00843D] dark:text-green-400 font-bold uppercase tracking-wide text-[11px]">
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span>Contato Oficial</span>
            </div>
            <p className="text-neutral-600 dark:text-neutral-400 text-[11px]">
              {data.project} • {data.institution} ({data.campus})
            </p>
            <a
              href={`mailto:${data.contactEmail}`}
              className="text-[#00843D] dark:text-green-400 font-semibold hover:underline block break-all text-[11px]"
            >
              {data.contactEmail}
            </a>
          </div>
        </aside>

        {/* Full Text Document Content */}
        <article
          id="legal-document-article-body"
          className="lg:col-span-8 space-y-8 bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-10 shadow-sm text-neutral-800 dark:text-neutral-200 text-sm leading-relaxed transition-colors"
        >
          {/* Institutional Opening Banner */}
          <div className="p-4 sm:p-5 rounded-2xl bg-neutral-50 dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800 space-y-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-[#00843D] dark:text-green-400 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              <span>Identificação Institucional e Apresentação</span>
            </h2>
            <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-normal">
              O <strong>Localiza+</strong> é um sistema web e aplicativo progressivo (PWA) de achados e perdidos desenvolvido no contexto do projeto de extensão <strong>{data.project}</strong>, vinculado ao <strong>{data.institution} – {data.campus}</strong>, sediado na {data.address}.
            </p>
          </div>

          {/* Render All Structured Sections */}
          <div className="space-y-6">
            {data.sections.map((section) => (
              <LegalSectionRenderer
                key={section.id}
                section={section}
                onOpenOtherDocument={handleOpenOtherDocument}
              />
            ))}
          </div>

          {/* Bottom Back / Action Row */}
          <div className="pt-8 border-t border-neutral-100 dark:border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <LegalDocumentDownloadButton
              documentData={data}
              variant="primary"
              className="w-full sm:w-auto"
            />

            <div className="flex flex-wrap items-center gap-2.5">
              <a
                href={otherDocumentPath}
                onClick={handleOpenOtherDocument}
                className="px-4 py-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs font-bold transition-colors"
              >
                {otherDocumentLabel}
              </a>
              <button
                onClick={handleBackToSystem}
                className="px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer shadow-xs"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Voltar ao Início</span>
              </button>
            </div>
          </div>

          {/* Institutional Document Footer Tag */}
          <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-500">
            <span>Localiza+ • {data.institution} ({data.campus})</span>
            <span className="font-mono">Versão 2.4 (2026)</span>
          </div>
        </article>
      </div>
    </main>
  );
};
