import React, { useState, useMemo } from "react";
import {
  GitBranch,
  Sparkles,
  Wrench,
  Search,
  Filter,
  CheckCircle2,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
  Download,
  Copy,
  Check,
  Tag,
  Shield,
  Zap,
  Globe,
  HardDrive,
  QrCode,
  FileText,
  Bot,
  Smartphone,
  Server,
  Code2,
  ArrowUpRight,
  Clock,
  Printer,
  SlidersHorizontal,
  X,
  FileSpreadsheet,
  Milestone,
  ListFilter,
  CheckCircle,
  ShieldCheck,
} from "lucide-react";
import {
  APP_VERSIONS_DATA,
  AppVersion,
  VersionChangeItem,
  TOTAL_VERSIONS_COUNT,
  TOTAL_ADDITIONS_COUNT,
  TOTAL_FIXES_COUNT,
  CURRENT_VERSION,
} from "../data/versionsData";
import { downloadVersionsReportPdf } from "../lib/versionsReportPdfGenerator";
import { useApp } from "../context/AppContext";
import { vibrateClick, vibrateSuccess } from "../lib/utils";
import { localize } from "../lib/i18n";
import { TestBatteryManagerView } from "./TestBatteryManagerView";

interface VersionHistoryViewProps {
  darkMode?: boolean;
}

export const VersionHistoryView: React.FC<VersionHistoryViewProps> = ({ darkMode }) => {
  const { addToast, currentUser, language } = useApp();
  const tr = (pt: string, en: string) => localize(language, pt, en);

  // Role-Based Access Control: Test Batteries & Validation are restricted to Staff/Admins
  const canAccessTestBatteries = currentUser?.role === "ADMIN" || currentUser?.role === "SERVIDOR";

  // Top-level Navigation Tab: Changelog vs Test Battery Manager (guarded by role)
  const [mainTab, setMainTab] = useState<"CHANGELOG" | "TEST_BATTERIES">("CHANGELOG");
  const effectiveMainTab = canAccessTestBatteries ? mainTab : "CHANGELOG";

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"ALL" | "ADDITIONS" | "FIXES">("ALL");
  const [selectedModule, setSelectedModule] = useState<string>("ALL");
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [viewMode, setViewMode] = useState<"TIMELINE" | "CARDS">("TIMELINE");

  // Export PDF Modal state
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfFilterType, setPdfFilterType] = useState<"ALL" | "ADDITIONS" | "FIXES">("ALL");
  const [pdfSelectedVersion, setPdfSelectedVersion] = useState<string>("ALL");
  const [pdfIncludeSignatures, setPdfIncludeSignatures] = useState<boolean>(true);

  const [expandedVersions, setExpandedVersions] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    APP_VERSIONS_DATA.forEach((v, idx) => {
      initial[v.version] = idx < 3; // First 3 expanded by default
    });
    return initial;
  });
  const [copiedVersion, setCopiedVersion] = useState<string | null>(null);

  const toggleVersion = (version: string) => {
    vibrateClick();
    setExpandedVersions((prev) => ({
      ...prev,
      [version]: !prev[version],
    }));
  };

  const expandAll = () => {
    vibrateClick();
    const all: Record<string, boolean> = {};
    APP_VERSIONS_DATA.forEach((v) => {
      all[v.version] = true;
    });
    setExpandedVersions(all);
  };

  const collapseAll = () => {
    vibrateClick();
    setExpandedVersions({});
  };

  const getModuleIcon = (module: VersionChangeItem["module"]) => {
    switch (module) {
      case "DISCORD":
        return <Globe className="w-3.5 h-3.5 text-indigo-500" />;
      case "VERCEL":
        return <Server className="w-3.5 h-3.5 text-blue-500" />;
      case "ADMIN":
        return <Shield className="w-3.5 h-3.5 text-purple-500" />;
      case "IA_GEMINI":
        return <Bot className="w-3.5 h-3.5 text-teal-500" />;
      case "PWA":
        return <Smartphone className="w-3.5 h-3.5 text-amber-500" />;
      case "FIRESTORE":
        return <HardDrive className="w-3.5 h-3.5 text-orange-500" />;
      case "QR_CODE":
        return <QrCode className="w-3.5 h-3.5 text-emerald-500" />;
      case "DOCUMENTOS":
        return <FileText className="w-3.5 h-3.5 text-emerald-600" />;
      case "AUTH":
        return <Zap className="w-3.5 h-3.5 text-amber-600" />;
      default:
        return <Code2 className="w-3.5 h-3.5 text-neutral-500" />;
    }
  };

  const getModuleName = (module: VersionChangeItem["module"]) => {
    switch (module) {
      case "DISCORD":
        return "Discord";
      case "VERCEL":
        return "Vercel";
      case "ADMIN":
        return tr("Painel Admin", "Admin Panel");
      case "IA_GEMINI":
        return tr("IA Gemini", "Gemini AI");
      case "PWA":
        return tr("PWA / Celular", "PWA / Mobile");
      case "FIRESTORE":
        return "Firestore";
      case "QR_CODE":
        return "QR Code";
      case "DOCUMENTOS":
        return tr("Documentos", "Documents");
      case "AUTH":
        return tr("Autenticação", "Authentication");
      default:
        return tr("Sistema", "System");
    }
  };

  const getVersionTypeLabel = (type: AppVersion["type"]) => {
    switch (type) {
      case "MAJOR":
        return tr("PRINCIPAL", "MAJOR");
      case "MINOR":
        return tr("INTERMEDIÁRIA", "MINOR");
      default:
        return tr("CORREÇÃO", "PATCH");
    }
  };

  // Filter versions based on search, module, and change type
  const filteredVersions = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    return APP_VERSIONS_DATA.map((v) => {
      let matchingAdditions = v.additions;
      let matchingFixes = v.bugFixes;

      // Filter by module if selected
      if (selectedModule !== "ALL") {
        matchingAdditions = matchingAdditions.filter((a) => a.module === selectedModule);
        matchingFixes = matchingFixes.filter((f) => f.module === selectedModule);
      }

      // Filter by search query
      if (query) {
        matchingAdditions = matchingAdditions.filter(
          (a) =>
            a.title.toLowerCase().includes(query) ||
            a.description.toLowerCase().includes(query) ||
            (a.tag && a.tag.toLowerCase().includes(query)) ||
            a.module.toLowerCase().includes(query)
        );
        matchingFixes = matchingFixes.filter(
          (f) =>
            f.title.toLowerCase().includes(query) ||
            f.description.toLowerCase().includes(query) ||
            (f.tag && f.tag.toLowerCase().includes(query)) ||
            f.module.toLowerCase().includes(query)
        );
      }

      // Filter by change category (All vs Additions vs Fixes)
      if (activeFilter === "ADDITIONS") {
        matchingFixes = [];
      } else if (activeFilter === "FIXES") {
        matchingAdditions = [];
      }

      const versionMatchesQuery =
        !query ||
        v.version.toLowerCase().includes(query) ||
        v.codename.toLowerCase().includes(query) ||
        v.summary.toLowerCase().includes(query) ||
        v.releaseDate.includes(query);

      const typeMatches = selectedType === "ALL" || v.type === selectedType;
      const hasContent = matchingAdditions.length > 0 || matchingFixes.length > 0 || (versionMatchesQuery && activeFilter === "ALL" && selectedModule === "ALL");

      return {
        ...v,
        filteredAdditions: matchingAdditions,
        filteredFixes: matchingFixes,
        shouldShow: typeMatches && (hasContent || (versionMatchesQuery && selectedModule === "ALL")),
      };
    }).filter((v) => v.shouldShow);
  }, [searchQuery, activeFilter, selectedModule, selectedType]);

  // Handle direct PDF export
  const handleExportPdf = (options?: { filterType?: "ALL" | "ADDITIONS" | "FIXES"; selectedVersion?: string; includeSignatures?: boolean }) => {
    try {
      setIsExportingPdf(true);
      vibrateClick();

      const filterToUse = options?.filterType || pdfFilterType;
      const verToUse = options?.selectedVersion || pdfSelectedVersion;
      const signaturesToUse = options?.includeSignatures !== undefined ? options.includeSignatures : pdfIncludeSignatures;

      setTimeout(() => {
        const protocol = downloadVersionsReportPdf({
          filterType: filterToUse,
          selectedVersion: verToUse,
          selectedModule: selectedModule,
          issuedByName: currentUser?.name || tr("Membro da Comunidade Acadêmica", "Academic Community Member"),
          issuedByRole:
            currentUser?.role === "ADMIN"
              ? tr("Administrador do Sistema", "System Administrator")
              : currentUser?.role === "SERVIDOR"
              ? tr("Servidor / SEBAC", "Staff / SEBAC")
              : tr("Aluno / Acadêmico", "Student / Academic"),
          includeSignatures: signaturesToUse,
        });

        vibrateSuccess();
        setIsExportingPdf(false);
        setIsExportModalOpen(false);

        addToast(
          tr(
            `Relatório de versões baixado com sucesso! Protocolo oficial: ${protocol}`,
            `Version report downloaded successfully! Official protocol: ${protocol}`
          ),
          "success"
        );
      }, 400);
    } catch (err) {
      console.error("Erro ao gerar PDF de versões:", err);
      setIsExportingPdf(false);
      addToast(
        tr("Não foi possível gerar o documento. Tente novamente.", "Could not generate the document. Please try again."),
        "error"
      );
    }
  };

  const copyChangelogMarkdown = (version: AppVersion) => {
    vibrateClick();
    const md = `### ${version.version} - ${version.codename} (${version.releaseDate})
${version.summary}

#### 🚀 ${tr("Novas Funcionalidades / Adições:", "New Features / Additions:")}
${version.additions.map((a) => `- **${a.title}**: ${a.description}`).join("\n")}

#### 🛠️ ${tr("Correções de Erros e Ajustes Técnicos:", "Bug Fixes & Technical Adjustments:")}
${version.bugFixes.map((f) => `- **${f.title}**: ${f.description}`).join("\n")}`;

    navigator.clipboard.writeText(md);
    setCopiedVersion(version.version);
    setTimeout(() => setCopiedVersion(null), 2000);
  };

  const exportFullChangelog = () => {
    vibrateClick();
    let fullText = `# Localiza+ (IFPR Campus Ivaiporã) - ${tr("Histórico Oficial de Versões", "Official Version History")}
${tr(
  "Relatório completo de atualizações e manutenções desde a criação do sistema.",
  "Complete report of updates and maintenance since the creation of the system."
)}\n\n`;

    APP_VERSIONS_DATA.forEach((v) => {
      fullText += `## ${v.version} - ${v.codename} (${v.releaseDateTime})\n`;
      fullText += `> ${v.summary}\n\n`;
      fullText += `### 🚀 ${tr("Adições e Novas Funcionalidades", "Additions & New Features")} (${v.additions.length}):\n`;
      v.additions.forEach((a) => {
        fullText += `- [${a.module}] **${a.title}**: ${a.description}\n`;
      });
      fullText += `\n### 🛠️ ${tr("Correções de Erros", "Bug Fixes")} (${v.bugFixes.length}):\n`;
      v.bugFixes.forEach((f) => {
        fullText += `- [${f.module}] **${f.title}**: ${f.description}\n`;
      });
      fullText += `\n---\n\n`;
    });

    const blob = new Blob([fullText], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `localiza-ifpr-historico-versoes.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    addToast(
      tr("Histórico de versões exportado em Markdown com sucesso!", "Version history exported to Markdown successfully!"),
      "success"
    );
  };

  return (
    <div className="space-y-6">
      {/* 0. Top Navigation Switcher: Changelog vs Test Battery Manager */}
      <div className="bg-white dark:bg-[#1E1E1E] p-2 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-xl">
          <button
            type="button"
            onClick={() => {
              vibrateClick();
              setMainTab("CHANGELOG");
            }}
            className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center space-x-2 cursor-pointer ${
              effectiveMainTab === "CHANGELOG"
                ? "bg-[#00843D] text-white shadow-sm"
                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
            }`}
          >
            <GitBranch className="w-4 h-4" />
            <span>{tr("Histórico de Versões", "Version History & Changelog")}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              effectiveMainTab === "CHANGELOG" ? "bg-white/20 text-white" : "bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300"
            }`}>
              {TOTAL_VERSIONS_COUNT} {tr("Versões", "Releases")}
            </span>
          </button>

          {canAccessTestBatteries && (
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setMainTab("TEST_BATTERIES");
              }}
              className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center space-x-2 cursor-pointer ${
                effectiveMainTab === "TEST_BATTERIES"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{tr("Bateria de Testes e Validação", "Test Battery & Validation")}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                effectiveMainTab === "TEST_BATTERIES" ? "bg-white/20 text-white" : "bg-purple-500/10 text-purple-600 dark:text-purple-400"
              }`}>
                {tr("Governança e Qualidade", "Governance & QA")}
              </span>
            </button>
          )}
        </div>

        <div className="text-[11px] text-neutral-500 font-medium px-3">
          {effectiveMainTab === "CHANGELOG"
            ? tr("Relatório Oficial de Alterações", "Official Change Report")
            : tr("Validação com Trilha de Auditoria", "Validation with Audit Trail")}
        </div>
      </div>

      {effectiveMainTab === "TEST_BATTERIES" && canAccessTestBatteries ? (
        <TestBatteryManagerView darkMode={darkMode} />
      ) : (
        <>
          {/* 1. Header Banner & Action Buttons */}
          <div className="bg-gradient-to-r from-[#00843D]/10 via-purple-500/10 to-blue-500/10 dark:from-[#00843D]/20 dark:via-purple-900/20 dark:to-blue-900/20 rounded-3xl p-6 sm:p-8 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2.5">
              <div className="p-2.5 rounded-2xl bg-[#00843D] text-white shadow-sm">
                <GitBranch className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-xl font-black text-neutral-900 dark:text-white">
                    {tr("Histórico Oficial de Versões", "Official Version History")}
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#00843D]/15 text-[#00843D] dark:text-[#00c75c] text-xs font-black">
                    {CURRENT_VERSION} {tr("Atual", "Current")}
                  </span>
                </div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                  {tr(
                    "Registro cronológico consolidado de todas as atividades, novas funcionalidades e correções de erros (IFPR Campus Ivaiporã).",
                    "Consolidated chronological record of all activities, new features, and bug fixes (IFPR Campus Ivaiporã)."
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons: PDF Export & MD Export */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsExportModalOpen(true)}
              type="button"
              className="px-4 py-2.5 rounded-xl bg-[#00843D] hover:bg-[#007033] text-white font-black text-xs shadow-md transition-all flex items-center space-x-2 cursor-pointer active:scale-98"
            >
              <FileText className="w-4 h-4" />
              <span>{tr("Exportar Relatório PDF", "Export PDF Report")}</span>
            </button>

            <button
              onClick={exportFullChangelog}
              type="button"
              className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-bold text-xs border border-neutral-200 dark:border-neutral-700 shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-neutral-500" />
              <span>{tr("Exportar .MD", "Export .MD")}</span>
            </button>
          </div>
        </div>

        {/* Metric Cards Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="bg-white dark:bg-neutral-900 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-1">
            <span className="text-[10px] font-extrabold text-neutral-500 uppercase flex items-center space-x-1">
              <Layers className="w-3.5 h-3.5 text-purple-500" />
              <span>{tr("Total de Versões", "Total Versions")}</span>
            </span>
            <p className="text-2xl font-black text-neutral-900 dark:text-white">{TOTAL_VERSIONS_COUNT}</p>
            <p className="text-[10px] text-neutral-400">
              {tr(`${TOTAL_VERSIONS_COUNT} versões registradas`, `${TOTAL_VERSIONS_COUNT} recorded releases`)}
            </p>
          </div>

          <div className="bg-white dark:bg-neutral-900 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-1">
            <span className="text-[10px] font-extrabold text-emerald-600 uppercase flex items-center space-x-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
              <span>{tr("Novas Funcionalidades", "New Features")}</span>
            </span>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">+{TOTAL_ADDITIONS_COUNT}</p>
            <p className="text-[10px] text-neutral-400">{tr("Recursos e módulos ativos", "Active features & modules")}</p>
          </div>

          <div className="bg-white dark:bg-neutral-900 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-1">
            <span className="text-[10px] font-extrabold text-amber-600 uppercase flex items-center space-x-1">
              <Wrench className="w-3.5 h-3.5 text-amber-500" />
              <span>{tr("Correções de Erros", "Bug Fixes")}</span>
            </span>
            <p className="text-2xl font-black text-amber-600 dark:text-amber-400">{TOTAL_FIXES_COUNT}</p>
            <p className="text-[10px] text-neutral-400">{tr("Erros e ajustes resolvidos", "Resolved fixes & improvements")}</p>
          </div>

          <div className="bg-white dark:bg-neutral-900 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-1">
            <span className="text-[10px] font-extrabold text-blue-600 uppercase flex items-center space-x-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
              <span>{tr("Situação em Produção", "Production Status")}</span>
            </span>
            <p className="text-2xl font-black text-blue-600 dark:text-blue-400">{tr("100% Ativo", "100% Live")}</p>
            <p className="text-[10px] text-neutral-400">ifprivp.vercel.app</p>
          </div>
        </div>
      </div>

      {/* 2. Interactive Clickable Filter Tabs & View Mode Switcher */}
      <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Main Clickable Filter Tabs: Todas / Nova Funcionalidade / Correção de Erros */}
          <div className="flex flex-wrap items-center gap-2 p-1.5 bg-neutral-100 dark:bg-neutral-800/90 rounded-2xl">
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setActiveFilter("ALL");
              }}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center space-x-2 ${
                activeFilter === "ALL"
                  ? "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-sm ring-1 ring-neutral-300 dark:ring-neutral-700"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-neutral-500" />
              <span>{tr("Todas as Alterações", "All Changes")}</span>
              <span className="px-2 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-[10px]">
                {TOTAL_ADDITIONS_COUNT + TOTAL_FIXES_COUNT}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setActiveFilter("ADDITIONS");
              }}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center space-x-2 ${
                activeFilter === "ADDITIONS"
                  ? "bg-emerald-600 text-white shadow-md ring-2 ring-emerald-500/30"
                  : "text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>🚀 {tr("Novas Funcionalidades", "New Features")}</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  activeFilter === "ADDITIONS"
                    ? "bg-emerald-700 text-white"
                    : "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300"
                }`}
              >
                +{TOTAL_ADDITIONS_COUNT}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setActiveFilter("FIXES");
              }}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center space-x-2 ${
                activeFilter === "FIXES"
                  ? "bg-amber-600 text-white shadow-md ring-2 ring-amber-500/30"
                  : "text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40"
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>🛠️ {tr("Correção de Erros", "Bug Fixes")}</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  activeFilter === "FIXES"
                    ? "bg-amber-700 text-white"
                    : "bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300"
                }`}
              >
                {TOTAL_FIXES_COUNT}
              </span>
            </button>
          </div>

          {/* View Mode Switcher (Timeline vs Detailed Cards) + Expand/Collapse */}
          <div className="flex items-center space-x-2">
            <div className="flex items-center p-1 bg-neutral-100 dark:bg-neutral-800 rounded-2xl">
              <button
                type="button"
                onClick={() => {
                  vibrateClick();
                  setViewMode("TIMELINE");
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center space-x-1.5 ${
                  viewMode === "TIMELINE"
                    ? "bg-[#00843D] text-white shadow-xs"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{tr("Linha do Tempo", "Timeline")}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  vibrateClick();
                  setViewMode("CARDS");
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center space-x-1.5 ${
                  viewMode === "CARDS"
                    ? "bg-[#00843D] text-white shadow-xs"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{tr("Cartões Detalhados", "Detailed Cards")}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={expandAll}
              className="px-2.5 py-1.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs font-bold transition-colors"
              title={tr("Expandir todas as versões", "Expand all versions")}
            >
              {tr("Expandir", "Expand")}
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="px-2.5 py-1.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs font-bold transition-colors"
              title={tr("Recolher todas as versões", "Collapse all versions")}
            >
              {tr("Recolher", "Collapse")}
            </button>
          </div>
        </div>

        {/* Search & Select Filter Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-neutral-100 dark:border-neutral-800">
          <div className="relative">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tr("Buscar por termo, erro ou funcionalidade...", "Search by term, bug, or feature...")}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 text-xs font-bold text-neutral-900 dark:text-white outline-none focus:border-[#00843D]"
            />
          </div>

          <div>
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 text-xs font-bold text-neutral-900 dark:text-white outline-none focus:border-[#00843D]"
            >
              <option value="ALL">{tr("Todos os Módulos do Sistema", "All System Modules")}</option>
              <option value="DISCORD">🌐 {tr("Webhooks e Notificações Discord", "Discord Webhooks & Notifications")}</option>
              <option value="VERCEL">⚡ {tr("Vercel Serverless e Rotas de API", "Vercel Serverless & API Routes")}</option>
              <option value="ADMIN">🛡️ {tr("Painel Administrativo e Governança", "Admin Panel & Governance")}</option>
              <option value="IA_GEMINI">🤖 {tr("IA Google Gemini Multimodal", "Google Gemini Multimodal AI")}</option>
              <option value="PWA">📱 {tr("PWA, Modo Offline e Resposta Tátil", "PWA, Offline & Haptics")}</option>
              <option value="FIRESTORE">🗄️ {tr("Banco Firestore e Sincronização", "Firestore DB & Sync")}</option>
              <option value="QR_CODE">🏷️ {tr("QR Code e Leitor de Câmera", "QR Code & Camera Scanner")}</option>
              <option value="DOCUMENTOS">📄 {tr("Gerador de Termos em PDF", "PDF Receipt Generator")}</option>
              <option value="AUTH">🔑 {tr("Autenticação e E-mails @ifpr", "Authentication & @ifpr Emails")}</option>
              <option value="GERAL">⚙️ {tr("Núcleo e Interface Geral", "Core & General Interface")}</option>
            </select>
          </div>

          <div>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 text-xs font-bold text-neutral-900 dark:text-white outline-none focus:border-[#00843D]"
            >
              <option value="ALL">{tr("Todas as Versões (Principal, Intermediária, Correção)", "All Versions (Major, Minor, Patch)")}</option>
              <option value="MAJOR">{tr("Versões Principais (Grandes Marcos)", "Major Releases (Milestones)")}</option>
              <option value="MINOR">{tr("Versões Intermediárias (Novos Módulos)", "Minor Releases (New Modules)")}</option>
              <option value="PATCH">{tr("Correções Rápidas (Ajustes e Segurança)", "Patch Releases (Quick Fixes)")}</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Main Content: Visual Timeline or Cards Mode */}
      {filteredVersions.length === 0 ? (
        <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-10 text-center space-y-3 border border-neutral-200 dark:border-neutral-800">
          <Filter className="w-10 h-10 text-neutral-400 mx-auto opacity-50" />
          <h3 className="text-sm font-black text-neutral-800 dark:text-neutral-200">
            {tr("Nenhuma alteração encontrada com os filtros atuais", "No changes found matching the current filters")}
          </h3>
          <p className="text-xs text-neutral-500 max-w-sm mx-auto">
            {tr(
              "Tente redefinir o termo de busca ou selecione \"Todas as Alterações\" para ver todas as versões.",
              "Try resetting the search term or selecting \"All Changes\" to see all versions."
            )}
          </p>
          <button
            onClick={() => {
              setSearchQuery("");
              setActiveFilter("ALL");
              setSelectedModule("ALL");
              setSelectedType("ALL");
            }}
            className="px-4 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-xs font-bold text-neutral-700 dark:text-neutral-300"
          >
            {tr("Limpar Filtros", "Clear Filters")}
          </button>
        </div>
      ) : viewMode === "TIMELINE" ? (
        /* VISUAL TIMELINE COMPONENT (LINHA DO TEMPO CRONOLÓGICA) */
        <div className="relative pl-6 sm:pl-10 space-y-10">
          {/* Continuous Vertical Timeline Spine */}
          <div className="absolute left-3 sm:left-4.5 top-4 bottom-4 w-1 bg-gradient-to-b from-[#00843D] via-blue-500 to-purple-500/30 rounded-full" />

          {filteredVersions.map((version, vIdx) => {
            const isExpanded = !!expandedVersions[version.version];
            const additionsToShow = version.filteredAdditions || [];
            const fixesToShow = version.filteredFixes || [];

            return (
              <div key={version.version} className="relative group">
                {/* Timeline Milestone Node Point */}
                <div
                  className={`absolute -left-6 sm:-left-10 top-1 w-7 h-7 rounded-full flex items-center justify-center border-2 bg-white dark:bg-neutral-900 z-10 transition-transform ${
                    version.isCurrent
                      ? "border-[#00843D] ring-4 ring-[#00843D]/20 scale-110"
                      : version.type === "MAJOR"
                      ? "border-purple-600 ring-2 ring-purple-500/20"
                      : version.type === "MINOR"
                      ? "border-blue-600 ring-2 ring-blue-500/20"
                      : "border-neutral-400 dark:border-neutral-600"
                  }`}
                >
                  {version.isCurrent ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-[#00843D] animate-pulse" />
                  ) : (
                    <div
                      className={`w-2 h-2 rounded-full ${
                        version.type === "MAJOR"
                          ? "bg-purple-600"
                          : version.type === "MINOR"
                          ? "bg-blue-600"
                          : "bg-neutral-500"
                      }`}
                    />
                  )}
                </div>

                {/* Timeline Version Card Container */}
                <div
                  className={`bg-white dark:bg-[#1E1E1E] rounded-3xl border transition-all duration-200 overflow-hidden shadow-xs ${
                    version.isCurrent
                      ? "border-[#00843D]/50 ring-1 ring-[#00843D]/30"
                      : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700"
                  }`}
                >
                  {/* Version Milestone Header */}
                  <div
                    onClick={() => toggleVersion(version.version)}
                    className="p-5 sm:p-6 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-b from-transparent to-neutral-50/50 dark:to-neutral-900/30"
                  >
                    <div className="flex items-start space-x-3.5">
                      <div
                        className={`p-3 rounded-2xl font-mono text-sm font-black text-white shadow-xs ${
                          version.isCurrent
                            ? "bg-[#00843D]"
                            : version.type === "MAJOR"
                            ? "bg-purple-600"
                            : version.type === "MINOR"
                            ? "bg-blue-600"
                            : "bg-neutral-700"
                        }`}
                      >
                        {version.version}
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-black text-neutral-900 dark:text-white">
                            {version.codename}
                          </h3>

                          {version.isCurrent && (
                            <span className="px-2.5 py-0.5 rounded-full bg-[#00843D] text-white text-[10px] font-black uppercase tracking-wider animate-pulse">
                              {tr("Versão Atual em Produção", "Current Production Version")}
                            </span>
                          )}

                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                              version.type === "MAJOR"
                                ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                                : version.type === "MINOR"
                                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                                : "bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border border-neutral-500/20"
                            }`}
                          >
                            {getVersionTypeLabel(version.type)}
                          </span>
                        </div>

                        <p className="text-xs text-neutral-600 dark:text-neutral-400 max-w-2xl">
                          {version.summary}
                        </p>

                        <div className="flex items-center space-x-3 text-[11px] text-neutral-500 font-bold pt-0.5">
                          <span className="flex items-center space-x-1">
                            <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                            <span>{version.releaseDateTime}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Summary badges and toggle */}
                    <div className="flex items-center space-x-3 self-end md:self-center">
                      <div className="flex items-center space-x-2">
                        {version.additions.length > 0 && (
                          <span className="px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-black flex items-center space-x-1 border border-emerald-500/20">
                            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                            <span>+{version.additions.length} {tr("Adições", "Additions")}</span>
                          </span>
                        )}

                        {version.bugFixes.length > 0 && (
                          <span className="px-2.5 py-1 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-black flex items-center space-x-1 border border-amber-500/20">
                            <Wrench className="w-3.5 h-3.5 text-amber-600" />
                            <span>{version.bugFixes.length} {tr("Correções", "Fixes")}</span>
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyChangelogMarkdown(version);
                        }}
                        title={tr("Copiar notas em Markdown", "Copy release notes as Markdown")}
                        className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 transition-colors cursor-pointer"
                      >
                        {copiedVersion === version.version ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>

                      <button
                        type="button"
                        aria-label={isExpanded ? tr("Recolher versão", "Collapse version") : tr("Expandir versão", "Expand version")}
                        className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 cursor-pointer"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Timeline Node Body Details */}
                  {isExpanded && (
                    <div className="p-5 sm:p-6 border-t border-neutral-100 dark:border-neutral-800/80 space-y-6 bg-neutral-50/40 dark:bg-neutral-900/20">
                      {/* SECTION 1: NOVA FUNCIONALIDADE / ADIÇÕES */}
                      {additionsToShow.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black uppercase text-emerald-700 dark:text-emerald-400 flex items-center space-x-2 tracking-wider">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                              <Sparkles className="w-4 h-4" />
                              <span>{tr("Novas Funcionalidades Entregues", "Delivered New Features")} ({additionsToShow.length})</span>
                            </h4>
                            <span className="text-[10px] font-bold text-neutral-400">
                              {tr("Adicionado nesta versão", "Added in this release")}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 gap-2.5">
                            {additionsToShow.map((item) => (
                              <div
                                key={item.id}
                                className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-emerald-500/20 dark:border-emerald-500/20 shadow-2xs space-y-1.5 hover:border-emerald-500/40 transition-colors"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center space-x-2">
                                    <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600">
                                      {getModuleIcon(item.module)}
                                    </span>
                                    <h5 className="text-xs font-black text-neutral-900 dark:text-white">
                                      {item.title}
                                    </h5>
                                  </div>

                                  <div className="flex items-center space-x-1.5">
                                    <span className="px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 text-[10px] font-bold">
                                      {getModuleName(item.module)}
                                    </span>
                                    {item.tag && (
                                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-extrabold flex items-center space-x-1">
                                        <Tag className="w-2.5 h-2.5" />
                                        <span>{item.tag}</span>
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed pl-8">
                                  {item.description}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* SECTION 2: CORREÇÃO DE ERROS */}
                      {fixesToShow.length > 0 && (
                        <div className="space-y-3 pt-2">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black uppercase text-amber-700 dark:text-amber-400 flex items-center space-x-2 tracking-wider">
                              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                              <Wrench className="w-4 h-4" />
                              <span>{tr("Correções de Erros e Ajustes Técnicos", "Bug Fixes & Technical Adjustments")} ({fixesToShow.length})</span>
                            </h4>
                            <span className="text-[10px] font-bold text-neutral-400">
                              {tr("Resolvido e Otimizado", "Resolved & Optimized")}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 gap-2.5">
                            {fixesToShow.map((item) => (
                              <div
                                key={item.id}
                                className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-amber-500/20 dark:border-amber-500/20 shadow-2xs space-y-1.5 hover:border-amber-500/40 transition-colors"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center space-x-2">
                                    <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600">
                                      {getModuleIcon(item.module)}
                                    </span>
                                    <h5 className="text-xs font-black text-neutral-900 dark:text-white">
                                      {item.title}
                                    </h5>
                                  </div>

                                  <div className="flex items-center space-x-1.5">
                                    <span className="px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 text-[10px] font-bold">
                                      {getModuleName(item.module)}
                                    </span>
                                    {item.tag && (
                                      <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] font-extrabold flex items-center space-x-1">
                                        <Tag className="w-2.5 h-2.5" />
                                        <span>{item.tag}</span>
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed pl-8">
                                  {item.description}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* CARDS VIEW MODE */
        <div className="space-y-4">
          {filteredVersions.map((version) => {
            const isExpanded = !!expandedVersions[version.version];
            const additionsToShow = version.filteredAdditions || [];
            const fixesToShow = version.filteredFixes || [];

            return (
              <div
                key={version.version}
                className={`bg-white dark:bg-[#1E1E1E] rounded-3xl border transition-all duration-200 overflow-hidden shadow-xs ${
                  version.isCurrent
                    ? "border-[#00843D]/50 ring-1 ring-[#00843D]/30"
                    : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700"
                }`}
              >
                {/* Version Card Header */}
                <div
                  onClick={() => toggleVersion(version.version)}
                  className="p-5 sm:p-6 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-b from-transparent to-neutral-50/50 dark:to-neutral-900/30"
                >
                  <div className="flex items-start space-x-3.5">
                    <div
                      className={`p-3 rounded-2xl font-mono text-sm font-black text-white shadow-xs ${
                        version.isCurrent
                          ? "bg-[#00843D]"
                          : version.type === "MAJOR"
                          ? "bg-purple-600"
                          : version.type === "MINOR"
                          ? "bg-blue-600"
                          : "bg-neutral-700"
                      }`}
                    >
                      {version.version}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-black text-neutral-900 dark:text-white">
                          {version.codename}
                        </h3>

                        {version.isCurrent && (
                          <span className="px-2.5 py-0.5 rounded-full bg-[#00843D] text-white text-[10px] font-black uppercase tracking-wider">
                            {tr("Versão Atual", "Current Version")}
                          </span>
                        )}

                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                            version.type === "MAJOR"
                              ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                              : version.type === "MINOR"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                              : "bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border border-neutral-500/20"
                          }`}
                        >
                          {getVersionTypeLabel(version.type)}
                        </span>
                      </div>

                      <p className="text-xs text-neutral-600 dark:text-neutral-400 max-w-2xl">
                        {version.summary}
                      </p>

                      <div className="flex items-center space-x-3 text-[11px] text-neutral-500 font-bold pt-0.5">
                        <span className="flex items-center space-x-1">
                          <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                          <span>{version.releaseDateTime}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Summary badges and toggle */}
                  <div className="flex items-center space-x-3 self-end md:self-center">
                    <div className="flex items-center space-x-2">
                      {version.additions.length > 0 && (
                        <span className="px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-black flex items-center space-x-1 border border-emerald-500/20">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                          <span>+{version.additions.length} {tr("Adições", "Additions")}</span>
                        </span>
                      )}

                      {version.bugFixes.length > 0 && (
                        <span className="px-2.5 py-1 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-black flex items-center space-x-1 border border-amber-500/20">
                          <Wrench className="w-3.5 h-3.5 text-amber-600" />
                          <span>{version.bugFixes.length} {tr("Correções", "Fixes")}</span>
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyChangelogMarkdown(version);
                      }}
                      title={tr("Copiar notas em Markdown", "Copy release notes as Markdown")}
                      className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 transition-colors cursor-pointer"
                    >
                      {copiedVersion === version.version ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>

                    <button
                      type="button"
                      aria-label={isExpanded ? tr("Recolher versão", "Collapse version") : tr("Expandir versão", "Expand version")}
                      className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Details Body */}
                {isExpanded && (
                  <div className="p-5 sm:p-6 border-t border-neutral-100 dark:border-neutral-800/80 space-y-6 bg-neutral-50/40 dark:bg-neutral-900/20">
                    {/* SECTION 1: NOVA FUNCIONALIDADE / ADIÇÕES */}
                    {additionsToShow.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-black uppercase text-emerald-700 dark:text-emerald-400 flex items-center space-x-2 tracking-wider">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                            <Sparkles className="w-4 h-4" />
                            <span>{tr("Novas Adições e Funcionalidades", "New Additions & Features")} ({additionsToShow.length})</span>
                          </h4>
                          <span className="text-[10px] font-bold text-neutral-400">
                            {tr("Adicionado nesta versão", "Added in this version")}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 gap-2.5">
                          {additionsToShow.map((item) => (
                            <div
                              key={item.id}
                              className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-emerald-500/20 dark:border-emerald-500/20 shadow-2xs space-y-1.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center space-x-2">
                                  <span className="p-1 rounded-lg bg-emerald-500/10 text-emerald-600">
                                    {getModuleIcon(item.module)}
                                  </span>
                                  <h5 className="text-xs font-black text-neutral-900 dark:text-white">
                                    {item.title}
                                  </h5>
                                </div>

                                {item.tag && (
                                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-extrabold flex items-center space-x-1">
                                    <Tag className="w-2.5 h-2.5" />
                                    <span>{item.tag}</span>
                                  </span>
                                )}
                              </div>

                              <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed pl-7">
                                {item.description}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* SECTION 2: CORREÇÃO DE ERROS */}
                    {fixesToShow.length > 0 && (
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-black uppercase text-amber-700 dark:text-amber-400 flex items-center space-x-2 tracking-wider">
                            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                            <Wrench className="w-4 h-4" />
                            <span>{tr("Correções de Erros e Ajustes Técnicos", "Bug Fixes & Technical Adjustments")} ({fixesToShow.length})</span>
                          </h4>
                          <span className="text-[10px] font-bold text-neutral-400">
                            {tr("Resolvido e Otimizado", "Resolved & Optimized")}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 gap-2.5">
                          {fixesToShow.map((item) => (
                            <div
                              key={item.id}
                              className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-amber-500/20 dark:border-amber-500/20 shadow-2xs space-y-1.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center space-x-2">
                                  <span className="p-1 rounded-lg bg-amber-500/10 text-amber-600">
                                    {getModuleIcon(item.module)}
                                  </span>
                                  <h5 className="text-xs font-black text-neutral-900 dark:text-white">
                                    {item.title}
                                  </h5>
                                </div>

                                {item.tag && (
                                  <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] font-extrabold flex items-center space-x-1">
                                    <Tag className="w-2.5 h-2.5" />
                                    <span>{item.tag}</span>
                                  </span>
                                )}
                              </div>

                              <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed pl-7">
                                {item.description}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 4. MODAL DE EXPORTAÇÃO DE RELATÓRIO PDF */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl max-w-lg w-full p-6 sm:p-8 border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-3 rounded-2xl bg-[#00843D] text-white shadow-xs">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-neutral-900 dark:text-white">
                    {tr("Exportar Relatório PDF Oficial", "Export Official PDF Report")}
                  </h3>
                  <p className="text-xs text-neutral-500">
                    {tr(
                      "Consolidado de atividades, versões e correções (IFPR Campus Ivaiporã)",
                      "Consolidated summary of activities, versions, and fixes (IFPR Campus Ivaiporã)"
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label={tr("Fechar", "Close")}
                onClick={() => setIsExportModalOpen(false)}
                className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Options */}
            <div className="space-y-4">
              {/* Category Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-neutral-700 dark:text-neutral-300">
                  {tr("Conteúdo do Relatório", "Report Contents")}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPdfFilterType("ALL")}
                    className={`p-3 rounded-2xl text-xs font-black border transition-all text-center ${
                      pdfFilterType === "ALL"
                        ? "bg-[#00843D]/10 border-[#00843D] text-[#00843D] ring-2 ring-[#00843D]/20"
                        : "bg-neutral-50 dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400"
                    }`}
                  >
                    {tr("Completo", "Complete")}
                    <span className="block text-[10px] font-normal text-neutral-500 mt-0.5">
                      {tr("Adições + Erros", "Additions + Fixes")}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPdfFilterType("ADDITIONS")}
                    className={`p-3 rounded-2xl text-xs font-black border transition-all text-center ${
                      pdfFilterType === "ADDITIONS"
                        ? "bg-emerald-500/10 border-emerald-500 text-emerald-700 dark:text-emerald-400 ring-2 ring-emerald-500/20"
                        : "bg-neutral-50 dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400"
                    }`}
                  >
                    🚀 {tr("Adições", "Additions")}
                    <span className="block text-[10px] font-normal text-neutral-500 mt-0.5">
                      {tr("Novos Recursos", "New Features")}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPdfFilterType("FIXES")}
                    className={`p-3 rounded-2xl text-xs font-black border transition-all text-center ${
                      pdfFilterType === "FIXES"
                        ? "bg-amber-500/10 border-amber-500 text-amber-700 dark:text-amber-400 ring-2 ring-amber-500/20"
                        : "bg-neutral-50 dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400"
                    }`}
                  >
                    🛠️ {tr("Correções", "Fixes")}
                    <span className="block text-[10px] font-normal text-neutral-500 mt-0.5">
                      {tr("Erros e Ajustes", "Fixes & Adjustments")}
                    </span>
                  </button>
                </div>
              </div>

              {/* Version Select */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-neutral-700 dark:text-neutral-300">
                  {tr("Escopo de Versões", "Version Scope")}
                </label>
                <select
                  value={pdfSelectedVersion}
                  onChange={(e) => setPdfSelectedVersion(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs font-bold text-neutral-900 dark:text-white outline-none focus:border-[#00843D]"
                >
                  <option value="ALL">
                    {tr(
                      `Todas as ${TOTAL_VERSIONS_COUNT} Versões (${APP_VERSIONS_DATA[APP_VERSIONS_DATA.length - 1]?.version} a ${CURRENT_VERSION})`,
                      `All ${TOTAL_VERSIONS_COUNT} Versions (${APP_VERSIONS_DATA[APP_VERSIONS_DATA.length - 1]?.version} to ${CURRENT_VERSION})`
                    )}
                  </option>
                  {APP_VERSIONS_DATA.map((v) => (
                    <option key={v.version} value={v.version}>
                      {v.version} — {v.codename} ({v.releaseDate}) {v.isCurrent ? tr("★ Atual", "★ Current") : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Signatures Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700">
                <div className="space-y-0.5">
                  <span className="text-xs font-black text-neutral-800 dark:text-neutral-200">
                    {tr("Bloco de Assinaturas Institucionais", "Institutional Signatures Block")}
                  </span>
                  <p className="text-[11px] text-neutral-500">
                    {tr(
                      "Incluir campos para Coordenação InovaIF e SEBAC / TI",
                      "Include fields for InovaIF Coordination and SEBAC / IT"
                    )}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={pdfIncludeSignatures}
                  onChange={(e) => setPdfIncludeSignatures(e.target.checked)}
                  className="w-4 h-4 accent-[#00843D] rounded cursor-pointer"
                />
              </div>

              {/* Information Notice */}
              <div className="p-3 rounded-xl bg-[#00843D]/10 border border-[#00843D]/20 text-[11px] text-neutral-700 dark:text-neutral-300 space-y-1">
                <p className="font-bold text-[#00843D]">
                  {tr("Documento com Numeração Oficial e Carimbo de Data/Hora", "Document with Official Protocol & Timestamp")}
                </p>
                <p className="text-neutral-500">
                  {tr(
                    "O PDF será gerado com cabeçalho institucional do IFPR Campus Ivaiporã, protocolo único rastreável e sumário de métricas técnicas.",
                    "The PDF will be generated with the official IFPR Campus Ivaiporã header, a unique traceable protocol, and a technical metrics summary."
                  )}
                </p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-xs font-bold text-neutral-700 dark:text-neutral-300 cursor-pointer"
              >
                {tr("Cancelar", "Cancel")}
              </button>

              <button
                type="button"
                disabled={isExportingPdf}
                onClick={() => handleExportPdf()}
                className="px-5 py-2.5 rounded-xl bg-[#00843D] hover:bg-[#007033] text-white font-black text-xs shadow-md transition-all flex items-center space-x-2 cursor-pointer disabled:opacity-50"
              >
                {isExportingPdf ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>{tr("Gerando PDF...", "Generating PDF...")}</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>{tr("Baixar Relatório PDF", "Download PDF Report")}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
