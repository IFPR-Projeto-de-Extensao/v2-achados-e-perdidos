import React, { useState, useMemo } from "react";
import {
  FileSpreadsheet,
  Download,
  Printer,
  X,
  Calendar,
  Building2,
  Tag,
  ShieldCheck,
  FileText,
  Sparkles,
  Layers,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { CANONICAL_ITEM_CATEGORIES, isCategoryMatch } from "../lib/categoryUtils";
import { downloadFoundItemsReportPdf, generateFoundItemsReportPdf } from "../lib/foundItemsReportPdfGenerator";
import { safeParseDate, vibrateClick, vibrateSuccess } from "../lib/utils";
import { IFPR_LOCATION_GROUPS } from "../data/mockData";
import {
  ModalShell,
  UIButton,
  UIBadge,
  SubtlePanel,
  UIFieldGroup,
  UIInput,
  UISelect,
} from "./ui";

interface ExportFoundItemsReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExportFoundItemsReportModal: React.FC<ExportFoundItemsReportModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { items, currentUser, addToast } = useApp();

  const [periodPreset, setPeriodPreset] = useState<string>("MES_ATUAL");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("TODAS");
  const [locationFilter, setLocationFilter] = useState<string>("TODOS");
  const [statusFilter, setStatusFilter] = useState<string>("TODOS");
  const [includeSignatures, setIncludeSignatures] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  // Compute matched items for real-time preview count (Hooks must be unconditional)
  const filteredFoundItems = useMemo(() => {
    if (!isOpen) return [];
    const now = new Date();
    return items.filter((i) => {
      const isFound = i.type === "ENCONTRADO" || (i.status === "DEVOLVIDO" && i.type !== "PERDIDO");
      if (!isFound) return false;

      if (categoryFilter !== "TODAS" && !isCategoryMatch(i.category, categoryFilter)) return false;
      if (locationFilter !== "TODOS" && i.location !== locationFilter) return false;
      if (statusFilter !== "TODOS" && i.status !== statusFilter) return false;

      const itemDate = safeParseDate(i.date || i.createdAt);
      if (!itemDate) return false;

      if (periodPreset === "MES_ATUAL") {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        if (itemDate < startOfMonth) return false;
      } else if (periodPreset === "30_DIAS") {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (itemDate < thirtyDaysAgo) return false;
      } else if (periodPreset === "SEMESTRE_ATUAL") {
        const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        if (itemDate < sixMonthsAgo) return false;
      } else if (periodPreset === "ANO_2026") {
        const startOfYear = new Date(2026, 0, 1);
        const endOfYear = new Date(2026, 11, 31, 23, 59, 59);
        if (itemDate < startOfYear || itemDate > endOfYear) return false;
      } else if (periodPreset === "CUSTOM") {
        if (startDate) {
          const start = safeParseDate(startDate);
          if (start) {
            start.setHours(0, 0, 0, 0);
            if (itemDate < start) return false;
          }
        }
        if (endDate) {
          const end = safeParseDate(endDate);
          if (end) {
            end.setHours(23, 59, 59, 999);
            if (itemDate > end) return false;
          }
        }
      }

      return true;
    });
  }, [items, periodPreset, startDate, endDate, categoryFilter, locationFilter, statusFilter, isOpen]);

  if (!isOpen) return null;

  const custodyCount = filteredFoundItems.filter(
    (i) => i.status === "ENCONTRADO" || i.status === "EM_ANALISE" || i.status === "PROPRIETARIO_IDENTIFICADO"
  ).length;
  const returnedCount = filteredFoundItems.filter(
    (i) => i.status === "DEVOLVIDO"
  ).length;

  const handleExportPdf = () => {
    vibrateClick();
    setIsGenerating(true);

    try {
      let periodLabel = "Histórico Geral";
      if (periodPreset === "MES_ATUAL") periodLabel = "Mês Vigente";
      else if (periodPreset === "30_DIAS") periodLabel = "Últimos 30 Dias";
      else if (periodPreset === "SEMESTRE_ATUAL") periodLabel = "Semestre Letivo Atual";
      else if (periodPreset === "ANO_2026") periodLabel = "Ano Letivo 2026";
      else if (periodPreset === "CUSTOM") {
        periodLabel = `Período: ${startDate || "Início"} até ${endDate || "Hoje"}`;
      }

      const protocol = downloadFoundItemsReportPdf(filteredFoundItems, {
        periodLabel,
        categoryFilter,
        locationFilter,
        statusFilter,
        issuedByName: currentUser.name,
        issuedByRole:
          currentUser.role === "ADMIN"
            ? "Administrador do Sistema"
            : currentUser.role === "SERVIDOR"
            ? "Secretaria Acadêmica / SEBAC"
            : "Usuário Responsável",
        includeSignatures,
      });

      vibrateSuccess();
      addToast(`Relatório PDF de prestação de contas gerado com sucesso! Protocolo: ${protocol}`, "success");
      onClose();
    } catch (err: any) {
      console.error("Erro ao gerar relatório PDF:", err);
      addToast("Ocorreu um erro ao gerar o arquivo PDF. Tente novamente.", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrintPdf = () => {
    vibrateClick();
    try {
      const { doc } = generateFoundItemsReportPdf(filteredFoundItems, {
        periodLabel: periodPreset,
        categoryFilter,
        locationFilter,
        statusFilter,
        issuedByName: currentUser.name,
        issuedByRole: currentUser.role,
        includeSignatures,
      });

      const blob = doc.output("blob");
      const blobUrl = URL.createObjectURL(blob);
      const printWindow = window.open(blobUrl, "_blank");
      if (printWindow) {
        printWindow.focus();
      } else {
        doc.save(`Relatorio_Achados_IFPR_${Date.now()}.pdf`);
      }
    } catch (err) {
      console.error(err);
      addToast("Erro ao abrir prévia de impressão.", "error");
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      ariaLabel="Exportar Relatório de Achados (PDF)"
    >
      <div className="flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 bg-white dark:bg-[#111827] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/50 border border-[#16845B]/20 text-[#16845B] dark:text-emerald-400 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  id="export-report-title"
                  className="text-base font-bold text-[#172B2A] dark:text-white tracking-tight truncate"
                >
                  Exportar Relatório de Achados (PDF)
                </h2>
                <UIBadge tone="emerald">jsPDF</UIBadge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                Prestação de contas institucional da Secretaria do IFPR Campus Ivaiporã
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              vibrateClick();
              onClose();
            }}
            className="p-2 rounded-xl text-slate-400 hover:text-[#172B2A] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            aria-label="Fechar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-[#172B2A] dark:text-slate-200 text-xs sm:text-sm">
          {/* Quick Info Box */}
          <div className="p-3.5 rounded-xl bg-[#EBF5F0]/70 dark:bg-emerald-950/25 border border-[#16845B]/20 dark:border-emerald-800/50 flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-[#16845B] dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-xs text-[#064E3B] dark:text-emerald-200 leading-relaxed">
              Gere um documento PDF oficial em alta fidelidade contendo o inventário dos bens encontrados,
              status de custódia na secretaria, locais do campus, depositários e campos de visto e assinatura regulamentares.
            </p>
          </div>

          {/* Period Presets */}
          <div className="space-y-2.5">
            <label className="text-xs font-semibold text-[#172B2A] dark:text-slate-200 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-[#16845B] dark:text-emerald-400" />
              <span>Período do Relatório</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { id: "MES_ATUAL", label: "Mês Atual" },
                { id: "30_DIAS", label: "Últimos 30 dias" },
                { id: "SEMESTRE_ATUAL", label: "Semestre Atual" },
                { id: "ANO_2026", label: "Ano Letivo 2026" },
                { id: "TODOS", label: "Histórico Completo" },
                { id: "CUSTOM", label: "Personalizado" },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    vibrateClick();
                    setPeriodPreset(p.id);
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all border text-center cursor-pointer ${
                    periodPreset === p.id
                      ? "bg-[#16845B] text-white border-[#16845B] shadow-xs"
                      : "bg-[#F8FAFC] dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-[#16845B]/40"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom Date Inputs */}
            {periodPreset === "CUSTOM" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1.5 animate-in fade-in">
                <UIFieldGroup label="Data Inicial">
                  <UIInput
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </UIFieldGroup>
                <UIFieldGroup label="Data Final">
                  <UIInput
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </UIFieldGroup>
              </div>
            )}
          </div>

          {/* Filters Grid: Status, Category, Location */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <UIFieldGroup label="Status">
              <UISelect
                leftIcon={<Layers className="w-3.5 h-3.5 text-[#16845B]" />}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="TODOS">Todos os Status</option>
                <option value="DISPONIVEL">Sob Custódia (Pendente)</option>
                <option value="DEVOLVIDO">Devolvidos / Entregues</option>
              </UISelect>
            </UIFieldGroup>

            <UIFieldGroup label="Categoria">
              <UISelect
                leftIcon={<Tag className="w-3.5 h-3.5 text-[#16845B]" />}
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="TODAS">Todas as Categorias</option>
                {CANONICAL_ITEM_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </UISelect>
            </UIFieldGroup>

            <UIFieldGroup label="Local do Campus">
              <UISelect
                leftIcon={<Building2 className="w-3.5 h-3.5 text-[#16845B]" />}
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
              >
                <option value="TODOS">Todos os Locais</option>
                {IFPR_LOCATION_GROUPS.map((group) => (
                  <optgroup key={group.group} label={group.group}>
                    {group.locations.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </UISelect>
            </UIFieldGroup>
          </div>

          {/* Options: Include Signatures */}
          <SubtlePanel padding="sm" className="flex items-center justify-between gap-3">
            <label
              htmlFor="include-signatures-check"
              className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0"
            >
              <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[#16845B] dark:text-emerald-400 shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#172B2A] dark:text-white">
                  Incluir Bloco de Assinaturas e Termo de Conformidade
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Adiciona campos formais para visto do servidor SEBAC e Chefia de Gabinete.
                </p>
              </div>
            </label>
            <input
              id="include-signatures-check"
              type="checkbox"
              checked={includeSignatures}
              onChange={(e) => setIncludeSignatures(e.target.checked)}
              className="w-4 h-4 text-[#16845B] rounded border-slate-300 dark:border-slate-600 focus:ring-[#16845B] cursor-pointer shrink-0"
            />
          </SubtlePanel>

          {/* Real-time Summary Card */}
          <SubtlePanel padding="md" className="bg-[#EBF5F0]/55 dark:bg-emerald-950/20 border-[#16845B]/20 dark:border-emerald-900/50 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-bold text-[#064E3B] dark:text-emerald-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#16845B] dark:text-emerald-400" />
                Resumo da Exportação
              </span>
              <UIBadge tone="emerald" className="tabular-nums">
                {filteredFoundItems.length} objeto(s) selecionado(s)
              </UIBadge>
            </div>
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="p-2.5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide">
                  Total Achados
                </span>
                <span className="text-lg font-bold text-[#16845B] dark:text-emerald-400 tabular-nums mt-0.5 block">
                  {filteredFoundItems.length}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide">
                  Sob Custódia
                </span>
                <span className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums mt-0.5 block">
                  {custodyCount}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide">
                  Restituídos
                </span>
                <span className="text-lg font-bold text-sky-600 dark:text-sky-400 tabular-nums mt-0.5 block">
                  {returnedCount}
                </span>
              </div>
            </div>
          </SubtlePanel>
        </div>

        {/* Footer Actions */}
        <div className="px-5 sm:px-6 py-4 bg-[#F8FAFC] dark:bg-slate-900/70 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-end gap-2.5 shrink-0">
          <UIButton type="button" variant="ghost" size="md" onClick={onClose}>
            Cancelar
          </UIButton>

          <UIButton type="button" variant="secondary" size="md" onClick={handlePrintPdf}>
            <Printer className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span>Imprimir</span>
          </UIButton>

          <UIButton
            type="button"
            variant="primary"
            size="md"
            disabled={isGenerating || filteredFoundItems.length === 0}
            onClick={handleExportPdf}
          >
            <Download className="w-4 h-4" />
            <span>{isGenerating ? "Gerando PDF..." : "Baixar Relatório em PDF"}</span>
          </UIButton>
        </div>
      </div>
    </ModalShell>
  );
};

