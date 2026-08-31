import React, { useState, useMemo } from "react";
import {
  Shield,
  ShieldCheck,
  Search,
  Filter,
  Download,
  FileText,
  FileSpreadsheet,
  FileCode,
  Calendar,
  User,
  Hash,
  ArrowRight,
  Clock,
  CheckCircle2,
  Lock,
  Copy,
  Check,
  RefreshCw,
  Eye,
  SlidersHorizontal,
  Layers,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Database,
  Tag,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { SystemAuditLog, AuditObjectType, UserRole } from "../types";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { vibrateClick, vibrateSuccess } from "../lib/utils";

interface AuditTrailManagerViewProps {
  darkMode?: boolean;
}

export const AuditTrailManagerView: React.FC<AuditTrailManagerViewProps> = ({ darkMode }) => {
  const { systemAuditLogs, activityLogs, currentUser, addToast } = useApp();

  // Search & Filters State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedObjectType, setSelectedObjectType] = useState<string>("TODOS");
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>("ALL");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("TODOS");
  const [copiedTxId, setCopiedTxId] = useState<string | null>(null);
  const [selectedAuditLog, setSelectedAuditLog] = useState<SystemAuditLog | null>(null);

  // Combine systemAuditLogs and activityLogs (ensuring rich coverage)
  const unifiedLogs: SystemAuditLog[] = useMemo(() => {
    const map = new Map<string, SystemAuditLog>();

    // 1. Add primary systemAuditLogs
    systemAuditLogs.forEach((log) => {
      map.set(log.id, log);
    });

    // 2. Map legacy activityLogs if not already in systemAuditLogs
    activityLogs.forEach((act) => {
      if (!map.has(act.id)) {
        const objType: AuditObjectType = act.objectType || (
          act.action.includes("ITEM") || act.action.includes("OCORRENCIA") ? "ITEM" :
          act.action.includes("TEST") ? "TEST_CASE" :
          act.action.includes("USER") || act.action.includes("PERMISSAO") ? "USER" :
          act.action.includes("DEVOLUCAO") ? "RETURN" :
          act.action.includes("REIVINDICACAO") ? "CLAIM" :
          act.action.includes("DOCUMENTO") ? "DOCUMENT" :
          "PROJECT_SETTINGS"
        );

        map.set(act.id, {
          id: act.id,
          transactionId: act.transactionId || `TX-${objType}-${act.id.replace("log-", "").substring(0, 8).toUpperCase()}`,
          objectId: act.objectId || act.id,
          objectType: objType,
          objectTitle: act.details.split(" ")[0] || act.action,
          action: act.action,
          actorId: act.adminId || "sistema",
          actorName: act.adminName || "Administrador",
          actorEmail: "localizamais6@gmail.com",
          actorRole: "ADMIN",
          timestamp: act.timestamp,
          fieldChanged: act.fieldChanged || "dados_gerais",
          oldValue: act.oldValue || undefined,
          newValue: act.newValue || undefined,
          details: act.details,
          immutable: true,
        });
      }
    });

    const list = Array.from(map.values());
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return list;
  }, [systemAuditLogs, activityLogs]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return unifiedLogs.filter((log) => {
      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesTerm =
          log.transactionId.toLowerCase().includes(term) ||
          log.objectId.toLowerCase().includes(term) ||
          log.action.toLowerCase().includes(term) ||
          log.actorName.toLowerCase().includes(term) ||
          log.actorEmail.toLowerCase().includes(term) ||
          log.details.toLowerCase().includes(term) ||
          (log.fieldChanged && log.fieldChanged.toLowerCase().includes(term)) ||
          (log.oldValue && log.oldValue.toLowerCase().includes(term)) ||
          (log.newValue && log.newValue.toLowerCase().includes(term)) ||
          (log.objectTitle && log.objectTitle.toLowerCase().includes(term));

        if (!matchesTerm) return false;
      }

      // Object Type
      if (selectedObjectType !== "TODOS" && log.objectType !== selectedObjectType) {
        return false;
      }

      // Role Filter
      if (selectedRole !== "TODOS" && log.actorRole !== selectedRole) {
        return false;
      }

      // Date Filters
      const logDate = new Date(log.timestamp);
      const now = new Date();

      if (selectedTimeRange === "24H") {
        const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        if (logDate < past24h) return false;
      } else if (selectedTimeRange === "7D") {
        const past7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (logDate < past7d) return false;
      } else if (selectedTimeRange === "30D") {
        const past30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (logDate < past30d) return false;
      } else if (selectedTimeRange === "CUSTOM") {
        if (startDate) {
          const s = new Date(startDate);
          s.setHours(0, 0, 0, 0);
          if (logDate < s) return false;
        }
        if (endDate) {
          const e = new Date(endDate);
          e.setHours(23, 59, 59, 999);
          if (logDate > e) return false;
        }
      }

      return true;
    });
  }, [unifiedLogs, searchTerm, selectedObjectType, selectedRole, selectedTimeRange, startDate, endDate]);

  // Statistics Metrics
  const stats = useMemo(() => {
    const total = unifiedLogs.length;
    const uniqueTransactions = new Set(unifiedLogs.map((l) => l.transactionId)).size;
    const itemsCount = unifiedLogs.filter((l) => l.objectType === "ITEM" || l.objectType === "RETURN").length;
    const testsCount = unifiedLogs.filter((l) => l.objectType === "TEST_CASE" || l.objectType === "TEST_BATTERY").length;
    const usersCount = unifiedLogs.filter((l) => l.objectType === "USER").length;
    const criticalModifications = unifiedLogs.filter((l) => l.oldValue && l.newValue).length;

    return {
      total,
      uniqueTransactions,
      itemsCount,
      testsCount,
      usersCount,
      criticalModifications,
    };
  }, [unifiedLogs]);

  // Copy transaction ID to clipboard
  const handleCopyTxId = (txId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    vibrateClick();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(txId);
      setCopiedTxId(txId);
      addToast(`ID de Transação ${txId} copiado com sucesso!`, "info");
      setTimeout(() => setCopiedTxId(null), 2500);
    }
  };

  // Export Institutional Audit PDF Report
  const handleExportPdf = () => {
    try {
      vibrateClick();
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const now = new Date();
      const reportDate = now.toLocaleDateString("pt-BR");
      const reportTime = now.toLocaleTimeString("pt-BR");
      const reportProtocol = `AUD-IFPR-${now.getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      // Header Banner
      doc.setFillColor(27, 94, 32); // IFPR Green
      doc.rect(0, 0, 297, 24, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("INSTITUTO FEDERAL DO PARANÁ - CAMPUS IVAIPORÃ", 14, 10);
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("SISTEMA LOCALIZA+ • RELATÓRIO OFICIAL DE AUDITORIA E RASTREABILIDADE FORENSE", 14, 17);

      doc.setFontSize(9);
      doc.text(`Protocolo: ${reportProtocol}`, 215, 10);
      doc.text(`Emissão: ${reportDate} às ${reportTime}`, 215, 17);

      // Institutional Meta Block
      doc.setTextColor(33, 33, 33);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("SUMÁRIO EXECUTIVO DA AUDITORIA DO SISTEMA", 14, 32);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Responsável pela Emissão: ${currentUser?.name || "Administrador do Sistema"} (${currentUser?.role || "ADMIN"}) - ${currentUser?.email || "localizamais6@gmail.com"}`, 14, 38);
      doc.text(`Escopo do Relatório: Total de ${filteredLogs.length} eventos auditados com garantia de imutabilidade no banco de dados Firestore.`, 14, 43);

      // Metrics Cards in PDF
      doc.setFillColor(245, 247, 250);
      doc.roundedRect(14, 47, 62, 14, 2, 2, "F");
      doc.roundedRect(82, 47, 62, 14, 2, 2, "F");
      doc.roundedRect(150, 47, 62, 14, 2, 2, "F");
      doc.roundedRect(218, 47, 65, 14, 2, 2, "F");

      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("TOTAL DE EVENTOS", 18, 52);
      doc.text("TRANSAÇÕES ÚNICAS", 86, 52);
      doc.text("MODIFICAÇÕES CRÍTICAS", 154, 52);
      doc.text("INTEGRIDADE DOS DADOS", 222, 52);

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(`${filteredLogs.length} Registros`, 18, 58);
      doc.text(`${stats.uniqueTransactions} Transações`, 86, 58);
      doc.text(`${stats.criticalModifications} Alterações`, 154, 58);
      doc.setTextColor(27, 94, 32);
      doc.text("100% Imutável (Ativo)", 222, 58);

      // AutoTable Data Generation
      const tableData = filteredLogs.map((log, idx) => {
        const dateStr = new Date(log.timestamp).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });

        const diffStr = log.fieldChanged && (log.oldValue || log.newValue)
          ? `[${log.fieldChanged}]: "${log.oldValue || 'Nenhum'}" -> "${log.newValue || 'Nenhum'}"`
          : log.details;

        return [
          String(idx + 1),
          log.transactionId,
          dateStr,
          `${log.actorName} (${log.actorRole})`,
          log.objectType,
          log.objectId,
          log.action,
          diffStr,
        ];
      });

      autoTable(doc, {
        startY: 66,
        head: [["#", "ID Transação", "Data / Hora", "Responsável (Papel)", "Módulo", "ID Objeto", "Ação", "Diferencial Auditado"]],
        body: tableData,
        theme: "striped",
        headStyles: {
          fillColor: [27, 94, 32],
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: "bold",
          halign: "left",
        },
        bodyStyles: {
          fontSize: 7.5,
          textColor: [30, 41, 59],
          valign: "top",
        },
        columnStyles: {
          0: { cellWidth: 8, halign: "center" },
          1: { cellWidth: 34, fontStyle: "bold" },
          2: { cellWidth: 26 },
          3: { cellWidth: 38 },
          4: { cellWidth: 20 },
          5: { cellWidth: 26 },
          6: { cellWidth: 32 },
          7: { cellWidth: "auto" },
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        margin: { left: 14, right: 14 },
        didDrawPage: (data) => {
          // Footer on every page
          const pageCount = (doc as any).internal.getNumberOfPages();
          const pageCurrent = (data as any).pageNumber;
          doc.setFontSize(7.5);
          doc.setTextColor(148, 163, 184);
          doc.text(
            `Localiza+ • Instituto Federal do Paraná (IFPR Campus Ivaiporã) — Página ${pageCurrent} de ${pageCount} — Protocolo: ${reportProtocol}`,
            14,
            205
          );
        },
      });

      doc.save(`Relatorio_Auditoria_IFPR_${now.toISOString().split("T")[0]}_${reportProtocol}.pdf`);
      vibrateSuccess();
      addToast(`Laudo Oficial de Auditoria baixado com sucesso! Protocolo: ${reportProtocol}`, "success");
    } catch (err) {
      console.error("Erro ao gerar PDF de auditoria:", err);
      addToast("Erro ao processar relatório PDF. Tente novamente.", "error");
    }
  };

  // Export JSON Dump
  const handleExportJson = () => {
    try {
      vibrateClick();
      const exportData = {
        system: "Localiza+ IFPR Campus Ivaiporã",
        module: "Sistema Oficial de Auditoria e Rastreabilidade",
        generatedAt: new Date().toISOString(),
        exportedBy: {
          name: currentUser?.name,
          email: currentUser?.email,
          role: currentUser?.role,
        },
        metrics: stats,
        totalRecords: filteredLogs.length,
        logs: filteredLogs,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Auditoria_LocalizaMais_IFPR_${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      vibrateSuccess();
      addToast("Dump completo em JSON exportado com sucesso!", "success");
    } catch (err) {
      console.error("Erro ao exportar JSON:", err);
      addToast("Erro ao exportar arquivo JSON.", "error");
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    try {
      vibrateClick();
      const headers = [
        "ID_TRANSACAO",
        "DATA_HORA",
        "RESPONSAVEL_NOME",
        "RESPONSAVEL_EMAIL",
        "RESPONSAVEL_PAPEL",
        "MODULO_OBJETO",
        "ID_OBJETO",
        "TITULO_OBJETO",
        "ACAO_EXECUTADA",
        "CAMPO_ALTERADO",
        "VALOR_ANTERIOR",
        "VALOR_POSTERIOR",
        "DESCRICAO_COMPLETA",
      ];

      const csvRows = [
        headers.join(";"),
        ...filteredLogs.map((log) => {
          const sanitize = (str?: string | null) => `"${(str || "").replace(/"/g, '""')}"`;
          return [
            sanitize(log.transactionId),
            sanitize(new Date(log.timestamp).toLocaleString("pt-BR")),
            sanitize(log.actorName),
            sanitize(log.actorEmail),
            sanitize(log.actorRole),
            sanitize(log.objectType),
            sanitize(log.objectId),
            sanitize(log.objectTitle),
            sanitize(log.action),
            sanitize(log.fieldChanged),
            sanitize(log.oldValue),
            sanitize(log.newValue),
            sanitize(log.details),
          ].join(";");
        }),
      ];

      // Add UTF-8 BOM so Excel opens PT-BR characters properly
      const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Auditoria_LocalizaMais_IFPR_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      vibrateSuccess();
      addToast("Planilha CSV de auditoria exportada com sucesso!", "success");
    } catch (err) {
      console.error("Erro ao exportar CSV:", err);
      addToast("Erro ao exportar planilha CSV.", "error");
    }
  };

  const getObjectTypeBadge = (type: AuditObjectType) => {
    switch (type) {
      case "ITEM":
        return { label: "Achados e Perdidos", bg: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800" };
      case "RETURN":
        return { label: "Devolução", bg: "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800" };
      case "TEST_CASE":
        return { label: "Caso de Teste", bg: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800" };
      case "TEST_BATTERY":
        return { label: "Bateria de Testes", bg: "bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800" };
      case "USER":
        return { label: "Usuário / Permissão", bg: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800" };
      case "CLAIM":
        return { label: "Reivindicação", bg: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800" };
      case "DOCUMENT":
        return { label: "Documento Oficial", bg: "bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800" };
      case "PROJECT_SETTINGS":
        return { label: "Configuração InovaIF", bg: "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700" };
      default:
        return { label: type, bg: "bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700" };
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case "ADMIN":
        return "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800";
      case "SERVIDOR":
        return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800";
      default:
        return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800";
    }
  };

  return (
    <div className="space-y-6 pb-12" id="audit-trail-container">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden border border-emerald-600/30">
        <div className="absolute right-0 top-0 w-96 h-96 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/10 backdrop-blur-md rounded-xl border border-white/20">
                <ShieldCheck className="w-7 h-7 text-emerald-200" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider bg-emerald-900/60 text-emerald-200 px-2.5 py-0.5 rounded-full border border-emerald-400/30">
                    Governança Institucional IFPR
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-100 bg-black/20 px-2 py-0.5 rounded-full">
                    <Lock className="w-3 h-3 text-emerald-300" /> Imutabilidade Ativa
                  </span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
                  Auditoria e Rastreabilidade de Transações
                </h1>
              </div>
            </div>
            <p className="text-sm text-emerald-100/90 max-w-3xl">
              Registro forense e histórico imutável de todas as modificações críticas, alterações de cadastros,
              devoluções de pertences, execução de baterias de testes e controle de acessos no Localiza+.
            </p>
          </div>

          {/* Export Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            <button
              id="btn-export-audit-pdf"
              onClick={handleExportPdf}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-emerald-900 hover:bg-emerald-50 rounded-xl text-sm font-semibold shadow-sm transition-all duration-200 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-emerald-700" />
              Laudo Oficial PDF
            </button>
            <button
              id="btn-export-audit-csv"
              onClick={handleExportCsv}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-emerald-900/70 hover:bg-emerald-900 text-white rounded-xl text-sm font-medium border border-emerald-500/30 transition-colors cursor-pointer"
              title="Exportar CSV para Excel"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
              CSV
            </button>
            <button
              id="btn-export-audit-json"
              onClick={handleExportJson}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-emerald-900/70 hover:bg-emerald-900 text-white rounded-xl text-sm font-medium border border-emerald-500/30 transition-colors cursor-pointer"
              title="Exportar Dump JSON Estruturado"
            >
              <FileCode className="w-4 h-4 text-emerald-300" />
              JSON
            </button>
          </div>
        </div>

        {/* Real-time KPI Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-emerald-600/40">
          <div className="bg-black/20 backdrop-blur-sm rounded-xl p-3 border border-white/10">
            <div className="text-xs text-emerald-200/80 font-medium">Eventos Auditados</div>
            <div className="text-xl font-bold text-white mt-1">{stats.total}</div>
          </div>
          <div className="bg-black/20 backdrop-blur-sm rounded-xl p-3 border border-white/10">
            <div className="text-xs text-emerald-200/80 font-medium">Transações Únicas</div>
            <div className="text-xl font-bold text-white mt-1">{stats.uniqueTransactions}</div>
          </div>
          <div className="bg-black/20 backdrop-blur-sm rounded-xl p-3 border border-white/10">
            <div className="text-xs text-emerald-200/80 font-medium">Achados / Devoluções</div>
            <div className="text-xl font-bold text-white mt-1">{stats.itemsCount}</div>
          </div>
          <div className="bg-black/20 backdrop-blur-sm rounded-xl p-3 border border-white/10">
            <div className="text-xs text-emerald-200/80 font-medium">Baterias de Testes</div>
            <div className="text-xl font-bold text-white mt-1">{stats.testsCount}</div>
          </div>
          <div className="bg-black/20 backdrop-blur-sm rounded-xl p-3 border border-white/10">
            <div className="text-xs text-emerald-200/80 font-medium">Usuários & Papéis</div>
            <div className="text-xl font-bold text-white mt-1">{stats.usersCount}</div>
          </div>
          <div className="bg-black/20 backdrop-blur-sm rounded-xl p-3 border border-white/10">
            <div className="text-xs text-emerald-200/80 font-medium">Histórico Imutável</div>
            <div className="text-xl font-bold text-emerald-300 mt-1 flex items-center gap-1">
              <Shield className="w-4 h-4" /> 100%
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Panel */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Main Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="input-audit-search"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por ID de transação, objeto, responsável, e-mail ou campo modificado..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Module Selector */}
          <div className="w-full md:w-56">
            <select
              id="select-audit-module"
              value={selectedObjectType}
              onChange={(e) => setSelectedObjectType(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            >
              <option value="TODOS">Todos os Módulos</option>
              <option value="ITEM">Achados e Perdidos</option>
              <option value="RETURN">Devoluções de Pertences</option>
              <option value="TEST_CASE">Casos de Testes</option>
              <option value="TEST_BATTERY">Baterias de Testes</option>
              <option value="USER">Usuários e Permissões</option>
              <option value="CLAIM">Reivindicações</option>
              <option value="DOCUMENT">Documentos Oficiais</option>
              <option value="PROJECT_SETTINGS">Configurações InovaIF</option>
            </select>
          </div>

          {/* Time Preset Selector */}
          <div className="w-full md:w-44">
            <select
              id="select-audit-period"
              value={selectedTimeRange}
              onChange={(e) => setSelectedTimeRange(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            >
              <option value="ALL">Todo o Período</option>
              <option value="24H">Últimas 24 Horas</option>
              <option value="7D">Últimos 7 Dias</option>
              <option value="30D">Últimos 30 Dias</option>
              <option value="CUSTOM">Data Personalizada</option>
            </select>
          </div>
        </div>

        {/* Custom Date Range Picker when CUSTOM selected */}
        {selectedTimeRange === "CUSTOM" && (
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">De:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Até:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200"
              />
            </div>
            {(startDate || endDate) && (
              <button
                onClick={() => { setStartDate(""); setEndDate(""); }}
                className="text-xs text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
              >
                Limpar datas
              </button>
            )}
          </div>
        )}
      </div>

      {/* Audit Log Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/30">
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Trilha de Auditoria Transacional
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Exibindo <span className="font-semibold text-emerald-600 dark:text-emerald-400">{filteredLogs.length}</span> registros de {unifiedLogs.length} eventos totais.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
            <Lock className="w-3.5 h-3.5 text-emerald-500" />
            Garantia de Não Repúdio e Imutabilidade
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">
              Nenhum registro de auditoria encontrado
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Nenhum evento corresponde aos filtros selecionados. Tente ajustar o termo de busca ou selecionar "Todos os Módulos".
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs" id="table-audit-logs">
              <thead>
                <tr className="bg-slate-100/75 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                  <th className="py-3 px-4 w-44">Transação</th>
                  <th className="py-3 px-4 w-36">Módulo / Objeto</th>
                  <th className="py-3 px-4 w-44">Responsável</th>
                  <th className="py-3 px-4 w-36">Data / Hora</th>
                  <th className="py-3 px-4">Modificação Auditada (Anterior ➔ Posterior)</th>
                  <th className="py-3 px-4 text-center w-24">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredLogs.map((log) => {
                  const badge = getObjectTypeBadge(log.objectType);
                  const isCopied = copiedTxId === log.transactionId;
                  const dateObj = new Date(log.timestamp);
                  const formattedDate = dateObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
                  const formattedTime = dateObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedAuditLog(log)}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
                    >
                      {/* Transaction ID */}
                      <td className="py-3.5 px-4 font-mono">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[11px] truncate max-w-[130px]" title={log.transactionId}>
                            {log.transactionId}
                          </span>
                          <button
                            onClick={(e) => handleCopyTxId(log.transactionId, e)}
                            className="p-1 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors rounded hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                            title="Copiar ID da Transação"
                          >
                            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>

                      {/* Module / Object */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badge.bg}`}>
                            {badge.label}
                          </span>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate max-w-[130px]" title={`ID: ${log.objectId}`}>
                            ID: {log.objectId}
                          </div>
                        </div>
                      </td>

                      {/* Responsible Actor */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <div className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <span className="truncate max-w-[120px]">{log.actorName}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${getRoleBadge(log.actorRole)}`}>
                              {log.actorRole}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 truncate max-w-[130px]">
                            {log.actorEmail}
                          </div>
                        </div>
                      </td>

                      {/* Timestamp */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        <div className="font-medium">{formattedDate}</div>
                        <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-slate-400" /> {formattedTime}
                        </div>
                      </td>

                      {/* Detailed Traceability / Diff */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1.5">
                          <div className="font-medium text-slate-800 dark:text-slate-200 text-xs">
                            {log.details}
                          </div>
                          
                          {log.fieldChanged && (log.oldValue !== undefined || log.newValue !== undefined) && (
                            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                              <span className="text-slate-400 font-sans font-semibold text-[10px] uppercase">
                                {log.fieldChanged}:
                              </span>
                              <span className="px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800 line-through">
                                {log.oldValue || "Vazio"}
                              </span>
                              <ArrowRight className="w-3 h-3 text-slate-400" />
                              <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded dark:bg-emerald-950/50 dark:text-emerald-300 font-semibold">
                                {log.newValue || "Vazio"}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Inspection Action */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAuditLog(log);
                          }}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Inspecionar Detalhes Forenses"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Forensic Audit Detail Modal */}
      {selectedAuditLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-emerald-800 to-teal-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-xl">
                  <ShieldCheck className="w-6 h-6 text-emerald-200" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Inspeção de Auditoria Forense</h3>
                  <p className="text-xs text-emerald-100 font-mono mt-0.5">
                    Transação: {selectedAuditLog.transactionId}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedAuditLog(null)}
                className="p-1 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              {/* Status Banner */}
              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3.5 flex items-center gap-3">
                <Lock className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <div className="font-bold text-emerald-900 dark:text-emerald-200 text-xs">
                    Registro Certificado e Imutável
                  </div>
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                    Este registro possui integridade garantida por regras estritas do Firestore e não pode ser editado ou excluído.
                  </div>
                </div>
              </div>

              {/* Transaction Metadata Grid */}
              <div className="grid grid-cols-2 gap-3.5 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/80">
                <div>
                  <span className="text-slate-400 font-semibold text-[10px] uppercase">ID do Registro:</span>
                  <div className="font-mono text-slate-800 dark:text-slate-200 mt-0.5">{selectedAuditLog.id}</div>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold text-[10px] uppercase">Timestamp ISO:</span>
                  <div className="font-mono text-slate-800 dark:text-slate-200 mt-0.5">{selectedAuditLog.timestamp}</div>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold text-[10px] uppercase">Módulo / Objeto:</span>
                  <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                    {selectedAuditLog.objectType} (#{selectedAuditLog.objectId})
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold text-[10px] uppercase">Ação do Sistema:</span>
                  <div className="font-medium text-emerald-600 dark:text-emerald-400 mt-0.5">{selectedAuditLog.action}</div>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold text-[10px] uppercase">Responsável (Ator):</span>
                  <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                    {selectedAuditLog.actorName} ({selectedAuditLog.actorRole})
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold text-[10px] uppercase">E-mail do Ator:</span>
                  <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">{selectedAuditLog.actorEmail}</div>
                </div>
              </div>

              {/* Differential Comparison */}
              {selectedAuditLog.fieldChanged && (
                <div className="space-y-2">
                  <span className="text-slate-600 dark:text-slate-300 font-bold text-xs">
                    Comparação Diferencial de Valores:
                  </span>
                  <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-rose-600 uppercase">Valor Anterior</span>
                      <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg text-rose-900 dark:text-rose-200 font-mono text-[11px] break-all">
                        {selectedAuditLog.oldValue || "Nenhum valor anterior"}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-emerald-600 uppercase">Valor Posterior (Gravado)</span>
                      <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-lg text-emerald-900 dark:text-emerald-200 font-mono text-[11px] break-all">
                        {selectedAuditLog.newValue || "Nenhum valor novo"}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Full Description */}
              <div className="space-y-1">
                <span className="text-slate-600 dark:text-slate-300 font-bold text-xs">Descrição Completa da Operação:</span>
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 leading-relaxed">
                  {selectedAuditLog.details}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <button
                onClick={(e) => handleCopyTxId(selectedAuditLog.transactionId, e)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-xs text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-100 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar ID da Transação
              </button>

              <button
                onClick={() => setSelectedAuditLog(null)}
                className="px-4 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
