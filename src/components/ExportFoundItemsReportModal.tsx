import React, { useState, useMemo } from "react";
import {
  FileSpreadsheet,
  Download,
  Printer,
  X,
  CheckCircle2,
  Calendar,
  Filter,
  Building2,
  Tag,
  ShieldCheck,
  FileText,
  Clock,
  Sparkles,
  Layers,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { ItemCategory, LostFoundItem } from "../types";
import { downloadFoundItemsReportPdf, generateFoundItemsReportPdf } from "../lib/foundItemsReportPdfGenerator";
import { vibrateClick, vibrateSuccess } from "../lib/utils";
import { IFPR_LOCATIONS } from "../data/mockData";

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

  if (!isOpen) return null;

  // Compute matched items for real-time preview count
  const filteredFoundItems = useMemo(() => {
    const now = new Date();
    return items.filter((i) => {
      const isFound = i.type === "ENCONTRADO" || (i.status === "DEVOLVIDO" && i.type !== "PERDIDO");
      if (!isFound) return false;

      if (categoryFilter !== "TODAS" && i.category !== categoryFilter) return false;
      if (locationFilter !== "TODOS" && i.location !== locationFilter) return false;
      if (statusFilter !== "TODOS" && i.status !== statusFilter) return false;

      const itemDate = new Date(i.date || i.createdAt);

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
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          if (itemDate < start) return false;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (itemDate > end) return false;
        }
      }

      return true;
    });
  }, [items, periodPreset, startDate, endDate, categoryFilter, locationFilter, statusFilter]);

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
        issuedByRole: currentUser.role === "ADMIN" ? "Administrador do Sistema" : currentUser.role === "SERVIDOR" ? "Secretaria Acadêmica / SEBAC" : "Usuário Responsável",
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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-report-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="bg-white dark:bg-[#1E1E1E] w-full max-w-2xl rounded-3xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#00843D] to-[#006830] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-white/15 backdrop-blur-xs">
              <FileSpreadsheet className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 id="export-report-title" className="text-base font-extrabold tracking-tight">
                  Exportar Relatório de Achados (PDF)
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-white/20 text-[10px] font-bold uppercase tracking-wider">
                  jsPDF
                </span>
              </div>
              <p className="text-xs text-white/80">
                Prestação de contas institucional da Secretaria do IFPR Campus Ivaiporã
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              vibrateClick();
              onClose();
            }}
            className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-neutral-800 dark:text-neutral-200 text-xs sm:text-sm">
          {/* Quick Info Box */}
          <div className="p-3.5 rounded-2xl bg-[#00843D]/5 border border-[#00843D]/20 flex items-start space-x-3">
            <ShieldCheck className="w-5 h-5 text-[#00843D] dark:text-green-400 shrink-0 mt-0.5" />
            <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">
              Gere um documento PDF oficial em alta fidelidade contendo o inventário dos bens encontrados,
              status de custódia na secretaria, locais do campus, depositários e campos de visto e assinatura regulamentares.
            </p>
          </div>

          {/* Period Presets */}
          <div className="space-y-2">
            <label className="font-bold text-neutral-900 dark:text-white flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-[#00843D]" />
              <span>Período do Relatório:</span>
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
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border text-center ${
                    periodPreset === p.id
                      ? "bg-[#00843D] text-white border-[#00843D] shadow-xs"
                      : "bg-neutral-50 dark:bg-neutral-800/60 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800 hover:border-neutral-300"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom Date Inputs */}
            {periodPreset === "CUSTOM" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 animate-in fade-in">
                <div>
                  <span className="text-[11px] font-semibold text-neutral-500">Data Inicial:</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs"
                  />
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-neutral-500">Data Final:</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Filters Grid: Status, Category, Location */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Status Filter */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-[#00843D]" /> Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs"
              >
                <option value="TODOS">Todos os Status</option>
                <option value="DISPONIVEL">Sob Custódia (Pendente)</option>
                <option value="DEVOLVIDO">Devolvidos / Entregues</option>
              </select>
            </div>

            {/* Category Filter */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-[#00843D]" /> Categoria
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs"
              >
                <option value="TODAS">Todas as Categorias</option>
                <option value="Eletrônicos">Eletrônicos</option>
                <option value="Documentos">Documentos / Carteirinhas</option>
                <option value="Vestuário">Vestuário / Casacos</option>
                <option value="Material Escolar">Material Escolar</option>
                <option value="Chaves">Chaves</option>
                <option value="Garrafas e Copos">Garrafas / Copos</option>
                <option value="Acessórios">Acessórios</option>
                <option value="Outros">Outros</option>
              </select>
            </div>

            {/* Location Filter */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-[#00843D]" /> Local do Campus
              </label>
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs"
              >
                <option value="TODOS">Todos os Locais</option>
                {IFPR_LOCATIONS.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Options: Include Signatures */}
          <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <FileText className="w-4 h-4 text-[#00843D]" />
              <div>
                <p className="text-xs font-bold text-neutral-900 dark:text-white">
                  Incluir Bloco de Assinaturas e Termo de Conformidade
                </p>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Adiciona campos formais para visto do servidor SEBAC e Chefia de Gabinete.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={includeSignatures}
              onChange={(e) => setIncludeSignatures(e.target.checked)}
              className="w-4 h-4 text-[#00843D] rounded border-neutral-300 focus:ring-[#00843D]"
            />
          </div>

          {/* Real-time Summary Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-200 dark:border-emerald-800/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                Resumo da Exportação:
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white font-extrabold text-xs">
                {filteredFoundItems.length} objeto(s) selecionado(s)
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
              <div className="p-2 rounded-xl bg-white dark:bg-neutral-900 border border-emerald-100 dark:border-emerald-900">
                <span className="block text-[10px] text-neutral-500 font-semibold">Total Achados</span>
                <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-400">
                  {filteredFoundItems.length}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-white dark:bg-neutral-900 border border-emerald-100 dark:border-emerald-900">
                <span className="block text-[10px] text-neutral-500 font-semibold">Sob Custódia</span>
                <span className="text-base font-extrabold text-amber-600 dark:text-amber-400">
                  {custodyCount}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-white dark:bg-neutral-900 border border-emerald-100 dark:border-emerald-900">
                <span className="block text-[10px] text-neutral-500 font-semibold">Restituídos</span>
                <span className="text-base font-extrabold text-blue-600 dark:text-blue-400">
                  {returnedCount}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-neutral-50 dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-end space-x-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-bold text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handlePrintPdf}
            className="px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-bold text-xs hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors flex items-center space-x-1.5"
          >
            <Printer className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
            <span>Imprimir</span>
          </button>

          <button
            type="button"
            disabled={isGenerating || filteredFoundItems.length === 0}
            onClick={handleExportPdf}
            className="px-5 py-2.5 rounded-xl bg-[#00843D] hover:bg-[#006830] text-white font-extrabold text-xs transition-all shadow-md flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span>{isGenerating ? "Gerando PDF..." : "Baixar Relatório em PDF"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
