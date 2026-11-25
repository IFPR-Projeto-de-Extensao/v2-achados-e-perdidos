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
import { SystemAuditLog, AuditObjectType, UserRole, ActivityLog } from "../types";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { vibrateClick, vibrateSuccess } from "../lib/utils";
import { localize, getLocaleForLanguage, translateUserRole } from "../lib/i18n";

interface AuditTrailManagerViewProps {
  darkMode?: boolean;
}

/**
 * Constrói a lista unificada de logs de auditoria combinando systemAuditLogs (primário)
 * e activityLogs (legado). Aplica deduplicação estrita apenas quando houver identificador
 * real comprovando que ambos representam o mesmo evento (via ID ou transactionId idêntico).
 * Para registros legados sem ID confiável, gera uma chave sintética determinística em memória
 * e assegura que nenhum evento distinto seja omitido ou descartado.
 */
export function buildUnifiedAuditLogs(
  systemAuditLogs: SystemAuditLog[] = [],
  activityLogs: ActivityLog[] = []
): SystemAuditLog[] {
  const resultList: SystemAuditLog[] = [];
  const knownAuditIds = new Set<string>();
  const knownTransactionIds = new Set<string>();

  // 1. Adicionar logs primários de auditoria (audit_logs)
  (systemAuditLogs || []).forEach((log) => {
    if (log && log.id && !knownAuditIds.has(log.id)) {
      knownAuditIds.add(log.id);
      if (log.transactionId) {
        knownTransactionIds.add(log.transactionId);
      }
      resultList.push(log);
    }
  });

  // 2. Mapear logs legados de atividades (activity_logs) preservando eventos distintos
  const seenActivityIds = new Set<string>();
  const baseKeyCounts = new Map<string, number>();

  (activityLogs || []).forEach((act, idx) => {
    if (!act) return;

    // Deduplicação estrita: apenas descarta quando houver identificador real comprovando mesmo evento
    if (act.id && (knownAuditIds.has(act.id) || seenActivityIds.has(act.id))) {
      return;
    }
    if (act.transactionId && knownTransactionIds.has(act.transactionId)) {
      return;
    }

    if (act.id) {
      seenActivityIds.add(act.id);
    }
    if (act.transactionId) {
      knownTransactionIds.add(act.transactionId);
    }

    // Para registros legados sem ID confiável, gera uma chave sintética determinística em memória
    // garantindo que registros distintos (mesmo com mesmo timestamp e adminId) NUNCA sejam descartados
    const baseKey = act.id
      ? String(act.id)
      : `act-legacy-${act.timestamp ? act.timestamp.replace(/[:.]/g, "-") : "sem-data"}-${act.adminId || "anon"}`;

    const seq = (baseKeyCounts.get(baseKey) || 0) + 1;
    baseKeyCounts.set(baseKey, seq);

    const safeActId = act.id ? String(act.id) : `${baseKey}-${seq}`;

    const actionStr = String(act.action || "LOG");
    const detailsStr = String(act.details || "");
    const objType: AuditObjectType = act.objectType || (
      actionStr.includes("ITEM") || actionStr.includes("OCORRENCIA") ? "ITEM" :
      actionStr.includes("TEST") ? "TEST_CASE" :
      actionStr.includes("USER") || actionStr.includes("PERMISSAO") ? "USER" :
      actionStr.includes("DEVOLUCAO") ? "RETURN" :
      actionStr.includes("REIVINDICACAO") ? "CLAIM" :
      actionStr.includes("DOCUMENTO") ? "DOCUMENT" :
      "PROJECT_SETTINGS"
    );

    resultList.push({
      id: safeActId,
      transactionId: act.transactionId || `TX-${objType}-${safeActId.replace(/^(log-|act-)/, "").substring(0, 8).toUpperCase()}`,
      objectId: act.objectId || safeActId,
      objectType: objType,
      objectTitle: detailsStr.split(" ")[0] || actionStr,
      action: actionStr,
      actorId: act.adminId || "sistema",
      actorName: act.adminName || "Administrador",
      actorEmail: "localizamais0@gmail.com",
      actorRole: "ADMIN",
      timestamp: act.timestamp || new Date().toISOString(),
      fieldChanged: act.fieldChanged || "dados_gerais",
      oldValue: act.oldValue || undefined,
      newValue: act.newValue || undefined,
      details: detailsStr,
      immutable: true,
    });
  });

  resultList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return resultList;
}

export const AuditTrailManagerView: React.FC<AuditTrailManagerViewProps> = ({ darkMode }) => {
  const { systemAuditLogs, activityLogs, currentUser, addToast, language } = useApp();
  const locale = getLocaleForLanguage(language);
  const tr = (pt: string, en: string) => localize(language, pt, en);

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
    return buildUnifiedAuditLogs(systemAuditLogs, activityLogs);
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
      addToast(
        tr(`ID de Transação ${txId} copiado com sucesso!`, `Transaction ID ${txId} copied successfully!`),
        "info"
      );
      setTimeout(() => setCopiedTxId(null), 2500);
    }
  };

  // Export Institutional Audit PDF Report
  const handleExportPdf = () => {
    try {
      vibrateClick();
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const now = new Date();
      const reportDate = now.toLocaleDateString(locale);
      const reportTime = now.toLocaleTimeString(locale);
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
      doc.text(
        tr(
          "SISTEMA LOCALIZA+ • RELATÓRIO OFICIAL DE AUDITORIA E RASTREABILIDADE FORENSE",
          "LOCALIZA+ SYSTEM • OFFICIAL AUDIT & FORENSIC TRACEABILITY REPORT"
        ),
        14,
        17
      );

      doc.setFontSize(9);
      doc.text(`${tr("Protocolo", "Protocol")}: ${reportProtocol}`, 215, 10);
      doc.text(`${tr("Emissão", "Issued")}: ${reportDate} ${tr("às", "at")} ${reportTime}`, 215, 17);

      // Institutional Meta Block
      doc.setTextColor(33, 33, 33);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(tr("SUMÁRIO EXECUTIVO DA AUDITORIA DO SISTEMA", "SYSTEM AUDIT EXECUTIVE SUMMARY"), 14, 32);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(
        `${tr("Responsável pela Emissão", "Issued By")}: ${currentUser?.name || tr("Administrador do Sistema", "System Administrator")} (${translateUserRole(currentUser?.role || "ADMIN", language)}) - ${currentUser?.email || "localizamais0@gmail.com"}`,
        14,
        38
      );
      doc.text(
        tr(
          `Escopo do Relatório: Total de ${filteredLogs.length} eventos auditados com garantia de imutabilidade no banco de dados Firestore.`,
          `Report Scope: Total of ${filteredLogs.length} audited events with immutability guarantee in Firestore.`
        ),
        14,
        43
      );

      // Metrics Cards in PDF
      doc.setFillColor(245, 247, 250);
      doc.roundedRect(14, 47, 62, 14, 2, 2, "F");
      doc.roundedRect(82, 47, 62, 14, 2, 2, "F");
      doc.roundedRect(150, 47, 62, 14, 2, 2, "F");
      doc.roundedRect(218, 47, 65, 14, 2, 2, "F");

      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(tr("TOTAL DE EVENTOS", "TOTAL EVENTS"), 18, 52);
      doc.text(tr("TRANSAÇÕES ÚNICAS", "UNIQUE TRANSACTIONS"), 86, 52);
      doc.text(tr("MODIFICAÇÕES CRÍTICAS", "CRITICAL MODIFICATIONS"), 154, 52);
      doc.text(tr("INTEGRIDADE DOS DADOS", "DATA INTEGRITY"), 222, 52);

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(`${filteredLogs.length} ${tr("Registros", "Records")}`, 18, 58);
      doc.text(`${stats.uniqueTransactions} ${tr("Transações", "Transactions")}`, 86, 58);
      doc.text(`${stats.criticalModifications} ${tr("Alterações", "Changes")}`, 154, 58);
      doc.setTextColor(27, 94, 32);
      doc.text(tr("100% Imutável (Ativo)", "100% Immutable (Active)"), 222, 58);

      // AutoTable Data Generation
      const tableData = filteredLogs.map((log, idx) => {
        const dateStr = new Date(log.timestamp).toLocaleString(locale, {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });

        const emptyLbl = tr("Nenhum", "None");
        const diffStr = log.fieldChanged && (log.oldValue || log.newValue)
          ? `[${log.fieldChanged}]: "${log.oldValue || emptyLbl}" -> "${log.newValue || emptyLbl}"`
          : log.details;

        return [
          String(idx + 1),
          log.transactionId,
          dateStr,
          `${log.actorName} (${translateUserRole(log.actorRole, language)})`,
          getObjectTypeBadge(log.objectType).label,
          log.objectId,
          log.action,
          diffStr,
        ];
      });

      autoTable(doc, {
        startY: 66,
        head: [[
          "#",
          tr("ID Transação", "Transaction ID"),
          tr("Data / Hora", "Date / Time"),
          tr("Responsável (Função)", "Actor (Role)"),
          tr("Módulo", "Module"),
          tr("ID Objeto", "Object ID"),
          tr("Ação", "Action"),
          tr("Diferencial Auditado", "Audited Change"),
        ]],
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
            `Localiza+ • Instituto Federal do Paraná (IFPR Campus Ivaiporã) — ${tr("Página", "Page")} ${pageCurrent} ${tr("de", "of")} ${pageCount} — ${tr("Protocolo", "Protocol")}: ${reportProtocol}`,
            14,
            205
          );
        },
      });

      doc.save(`Relatorio_Auditoria_IFPR_${now.toISOString().split("T")[0]}_${reportProtocol}.pdf`);
      vibrateSuccess();
      addToast(
        tr(
          `Laudo Oficial de Auditoria baixado com sucesso! Protocolo: ${reportProtocol}`,
          `Official Audit Report downloaded successfully! Protocol: ${reportProtocol}`
        ),
        "success"
      );
    } catch (err) {
      console.error("Erro ao gerar PDF de auditoria:", err);
      addToast(
        tr("Erro ao processar relatório PDF. Tente novamente.", "Error generating PDF report. Please try again."),
        "error"
      );
    }
  };

  // Export JSON
  const handleExportJson = () => {
    try {
      vibrateClick();
      const exportData = {
        system: "Localiza+ IFPR Campus Ivaiporã",
        module: tr("Sistema Oficial de Auditoria e Rastreabilidade", "Official Audit & Traceability System"),
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
      addToast(
        tr("Exportação completa em JSON baixada com sucesso!", "Complete JSON export downloaded successfully!"),
        "success"
      );
    } catch (err) {
      console.error("Erro ao exportar JSON:", err);
      addToast(tr("Erro ao exportar arquivo JSON.", "Error exporting JSON file."), "error");
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    try {
      vibrateClick();
      const headers = language === "en"
        ? [
            "TRANSACTION_ID",
            "DATE_TIME",
            "ACTOR_NAME",
            "ACTOR_EMAIL",
            "ACTOR_ROLE",
            "OBJECT_MODULE",
            "OBJECT_ID",
            "OBJECT_TITLE",
            "EXECUTED_ACTION",
            "FIELD_CHANGED",
            "OLD_VALUE",
            "NEW_VALUE",
            "FULL_DESCRIPTION",
          ]
        : [
            "ID_TRANSACAO",
            "DATA_HORA",
            "RESPONSAVEL_NOME",
            "RESPONSAVEL_EMAIL",
            "RESPONSAVEL_FUNCAO",
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
            sanitize(new Date(log.timestamp).toLocaleString(locale)),
            sanitize(log.actorName),
            sanitize(log.actorEmail),
            sanitize(translateUserRole(log.actorRole, language)),
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

      // Add UTF-8 BOM so Excel opens accented characters properly
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
      addToast(
        tr("Planilha CSV de auditoria exportada com sucesso!", "Audit CSV spreadsheet exported successfully!"),
        "success"
      );
    } catch (err) {
      console.error("Erro ao exportar CSV:", err);
      addToast(tr("Erro ao exportar planilha CSV.", "Error exporting CSV spreadsheet."), "error");
    }
  };

  const getObjectTypeBadge = (type: AuditObjectType) => {
    switch (type) {
      case "ITEM":
        return { label: tr("Achados e Perdidos", "Lost & Found"), bg: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800" };
      case "RETURN":
        return { label: tr("Devolução", "Return"), bg: "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800" };
      case "TEST_CASE":
        return { label: tr("Caso de Teste", "Test Case"), bg: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800" };
      case "TEST_BATTERY":
        return { label: tr("Bateria de Testes", "Test Battery"), bg: "bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800" };
      case "USER":
        return { label: tr("Usuário / Permissão", "User / Permission"), bg: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800" };
      case "CLAIM":
        return { label: tr("Reivindicação", "Claim"), bg: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800" };
      case "DOCUMENT":
        return { label: tr("Documento Oficial", "Official Document"), bg: "bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800" };
      case "PROJECT_SETTINGS":
        return { label: tr("Configuração InovaIF", "InovaIF Settings"), bg: "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700" };
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
                    {tr("Governança Institucional IFPR", "IFPR Institutional Governance")}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-100 bg-black/20 px-2 py-0.5 rounded-full">
                    <Lock className="w-3 h-3 text-emerald-300" /> {tr("Imutabilidade Ativa", "Active Immutability")}
                  </span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
                  {tr("Auditoria e Rastreabilidade de Transações", "Transaction Audit & Traceability")}
                </h1>
              </div>
            </div>
            <p className="text-sm text-emerald-100/90 max-w-3xl">
              {tr(
                "Registro forense e histórico imutável de todas as modificações críticas, alterações de cadastros, devoluções de pertences, execução de baterias de testes e controle de acessos no Localiza+.",
                "Forensic record and immutable history of all critical modifications, registration updates, item returns, test battery executions, and access controls in Localiza+."
              )}
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
              {tr("Laudo Oficial PDF", "Official Audit PDF")}
            </button>
            <button
              id="btn-export-audit-csv"
              onClick={handleExportCsv}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-emerald-900/70 hover:bg-emerald-900 text-white rounded-xl text-sm font-medium border border-emerald-500/30 transition-colors cursor-pointer"
              title={tr("Exportar CSV para Excel", "Export CSV for Excel")}
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
              CSV
            </button>
            <button
              id="btn-export-audit-json"
              onClick={handleExportJson}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-emerald-900/70 hover:bg-emerald-900 text-white rounded-xl text-sm font-medium border border-emerald-500/30 transition-colors cursor-pointer"
              title={tr("Exportar Dados em JSON Estruturado", "Export Structured JSON Data")}
            >
              <FileCode className="w-4 h-4 text-emerald-300" />
              JSON
            </button>
          </div>
        </div>

        {/* Real-time KPI Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-emerald-600/40">
          <div className="bg-black/20 backdrop-blur-sm rounded-xl p-3 border border-white/10">
            <div className="text-xs text-emerald-200/80 font-medium">{tr("Eventos Auditados", "Audited Events")}</div>
            <div className="text-xl font-bold text-white mt-1">{stats.total}</div>
          </div>
          <div className="bg-black/20 backdrop-blur-sm rounded-xl p-3 border border-white/10">
            <div className="text-xs text-emerald-200/80 font-medium">{tr("Transações Únicas", "Unique Transactions")}</div>
            <div className="text-xl font-bold text-white mt-1">{stats.uniqueTransactions}</div>
          </div>
          <div className="bg-black/20 backdrop-blur-sm rounded-xl p-3 border border-white/10">
            <div className="text-xs text-emerald-200/80 font-medium">{tr("Achados / Devoluções", "Lost / Returns")}</div>
            <div className="text-xl font-bold text-white mt-1">{stats.itemsCount}</div>
          </div>
          <div className="bg-black/20 backdrop-blur-sm rounded-xl p-3 border border-white/10">
            <div className="text-xs text-emerald-200/80 font-medium">{tr("Baterias de Testes", "Test Batteries")}</div>
            <div className="text-xl font-bold text-white mt-1">{stats.testsCount}</div>
          </div>
          <div className="bg-black/20 backdrop-blur-sm rounded-xl p-3 border border-white/10">
            <div className="text-xs text-emerald-200/80 font-medium">{tr("Usuários e Funções", "Users & Roles")}</div>
            <div className="text-xl font-bold text-white mt-1">{stats.usersCount}</div>
          </div>
          <div className="bg-black/20 backdrop-blur-sm rounded-xl p-3 border border-white/10">
            <div className="text-xs text-emerald-200/80 font-medium">{tr("Histórico Imutável", "Immutable History")}</div>
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
              placeholder={tr(
                "Buscar por ID de transação, objeto, responsável, e-mail ou campo modificado...",
                "Search by transaction ID, item, actor, email, or modified field..."
              )}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                aria-label={tr("Limpar busca", "Clear search")}
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
              <option value="TODOS">{tr("Todos os Módulos", "All Modules")}</option>
              <option value="ITEM">{tr("Achados e Perdidos", "Lost & Found")}</option>
              <option value="RETURN">{tr("Devoluções de Pertences", "Item Returns")}</option>
              <option value="TEST_CASE">{tr("Casos de Testes", "Test Cases")}</option>
              <option value="TEST_BATTERY">{tr("Baterias de Testes", "Test Batteries")}</option>
              <option value="USER">{tr("Usuários e Permissões", "Users & Permissions")}</option>
              <option value="CLAIM">{tr("Reivindicações", "Claims")}</option>
              <option value="DOCUMENT">{tr("Documentos Oficiais", "Official Documents")}</option>
              <option value="PROJECT_SETTINGS">{tr("Configurações InovaIF", "InovaIF Settings")}</option>
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
              <option value="ALL">{tr("Todo o Período", "All Time")}</option>
              <option value="24H">{tr("Últimas 24 Horas", "Last 24 Hours")}</option>
              <option value="7D">{tr("Últimos 7 Dias", "Last 7 Days")}</option>
              <option value="30D">{tr("Últimos 30 Dias", "Last 30 Days")}</option>
              <option value="CUSTOM">{tr("Data Personalizada", "Custom Date Range")}</option>
            </select>
          </div>
        </div>

        {/* Custom Date Range Picker when CUSTOM selected */}
        {selectedTimeRange === "CUSTOM" && (
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{tr("De:", "From:")}</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{tr("Até:", "To:")}</span>
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
                {tr("Limpar datas", "Clear dates")}
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
              {tr("Trilha de Auditoria Transacional", "Transactional Audit Trail")}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {tr("Exibindo", "Showing")}{" "}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{filteredLogs.length}</span>{" "}
              {tr(`registros de ${unifiedLogs.length} eventos totais.`, `records out of ${unifiedLogs.length} total events.`)}
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
            <Lock className="w-3.5 h-3.5 text-emerald-500" />
            {tr("Garantia de Não Repúdio e Imutabilidade", "Non-Repudiation & Immutability Guarantee")}
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">
              {tr("Nenhum registro de auditoria encontrado", "No audit records found")}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {tr(
                "Nenhum evento corresponde aos filtros selecionados. Tente ajustar o termo de busca ou selecionar \"Todos os Módulos\".",
                "No events match the selected filters. Try adjusting the search term or selecting \"All Modules\"."
              )}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs" id="table-audit-logs">
              <thead>
                <tr className="bg-slate-100/75 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                  <th className="py-3 px-4 w-44">{tr("Transação", "Transaction")}</th>
                  <th className="py-3 px-4 w-36">{tr("Módulo / Objeto", "Module / Object")}</th>
                  <th className="py-3 px-4 w-44">{tr("Responsável", "Actor")}</th>
                  <th className="py-3 px-4 w-36">{tr("Data / Hora", "Date / Time")}</th>
                  <th className="py-3 px-4">{tr("Modificação Auditada (Anterior ➔ Posterior)", "Audited Change (Before ➔ After)")}</th>
                  <th className="py-3 px-4 text-center w-24">{tr("Ações", "Actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredLogs.map((log) => {
                  const badge = getObjectTypeBadge(log.objectType);
                  const isCopied = copiedTxId === log.transactionId;
                  const dateObj = new Date(log.timestamp);
                  const formattedDate = dateObj.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
                  const formattedTime = dateObj.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

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
                            title={tr("Copiar ID da Transação", "Copy Transaction ID")}
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
                              {translateUserRole(log.actorRole, language)}
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
                                {log.oldValue || tr("Vazio", "Empty")}
                              </span>
                              <ArrowRight className="w-3 h-3 text-slate-400" />
                              <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded dark:bg-emerald-950/50 dark:text-emerald-300 font-semibold">
                                {log.newValue || tr("Vazio", "Empty")}
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
                          title={tr("Inspecionar Detalhes Forenses", "Inspect Forensic Details")}
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
                  <h3 className="text-base font-bold text-white">
                    {tr("Inspeção de Auditoria Forense", "Forensic Audit Inspection")}
                  </h3>
                  <p className="text-xs text-emerald-100 font-mono mt-0.5">
                    {tr("Transação:", "Transaction:")} {selectedAuditLog.transactionId}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedAuditLog(null)}
                aria-label={tr("Fechar modal", "Close modal")}
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
                    {tr("Registro Certificado e Imutável", "Certified & Immutable Record")}
                  </div>
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                    {tr(
                      "Este registro possui integridade garantida por regras estritas do Firestore e não pode ser editado ou excluído.",
                      "This record has integrity guaranteed by strict Firestore rules and cannot be edited or deleted."
                    )}
                  </div>
                </div>
              </div>

              {/* Transaction Metadata Grid */}
              <div className="grid grid-cols-2 gap-3.5 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/80">
                <div>
                  <span className="text-slate-400 font-semibold text-[10px] uppercase">{tr("ID do Registro:", "Record ID:")}</span>
                  <div className="font-mono text-slate-800 dark:text-slate-200 mt-0.5">{selectedAuditLog.id}</div>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold text-[10px] uppercase">{tr("Data/Hora ISO:", "ISO Timestamp:")}</span>
                  <div className="font-mono text-slate-800 dark:text-slate-200 mt-0.5">{selectedAuditLog.timestamp}</div>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold text-[10px] uppercase">{tr("Módulo / Objeto:", "Module / Object:")}</span>
                  <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                    {getObjectTypeBadge(selectedAuditLog.objectType).label} (#{selectedAuditLog.objectId})
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold text-[10px] uppercase">{tr("Ação do Sistema:", "System Action:")}</span>
                  <div className="font-medium text-emerald-600 dark:text-emerald-400 mt-0.5">{selectedAuditLog.action}</div>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold text-[10px] uppercase">{tr("Responsável (Ator):", "Actor:")}</span>
                  <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                    {selectedAuditLog.actorName} ({translateUserRole(selectedAuditLog.actorRole, language)})
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold text-[10px] uppercase">{tr("E-mail do Ator:", "Actor Email:")}</span>
                  <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">{selectedAuditLog.actorEmail}</div>
                </div>
              </div>

              {/* Differential Comparison */}
              {selectedAuditLog.fieldChanged && (
                <div className="space-y-2">
                  <span className="text-slate-600 dark:text-slate-300 font-bold text-xs">
                    {tr("Comparação Diferencial de Valores:", "Value Diff Comparison:")}
                  </span>
                  <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-rose-600 uppercase">{tr("Valor Anterior", "Previous Value")}</span>
                      <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg text-rose-900 dark:text-rose-200 font-mono text-[11px] break-all">
                        {selectedAuditLog.oldValue || tr("Nenhum valor anterior", "No previous value")}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-emerald-600 uppercase">{tr("Valor Posterior (Gravado)", "New Value (Saved)")}</span>
                      <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-lg text-emerald-900 dark:text-emerald-200 font-mono text-[11px] break-all">
                        {selectedAuditLog.newValue || tr("Nenhum valor novo", "No new value")}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Full Description */}
              <div className="space-y-1">
                <span className="text-slate-600 dark:text-slate-300 font-bold text-xs">
                  {tr("Descrição Completa da Operação:", "Full Operation Description:")}
                </span>
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
                {tr("Copiar ID da Transação", "Copy Transaction ID")}
              </button>

              <button
                onClick={() => setSelectedAuditLog(null)}
                className="px-4 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                {tr("Fechar", "Close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
