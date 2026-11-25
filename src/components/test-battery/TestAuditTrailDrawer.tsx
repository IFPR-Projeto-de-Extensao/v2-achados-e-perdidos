import React, { useState } from "react";
import { X, History, Search, Shield, ArrowRight, User, Clock } from "lucide-react";
import { TestBatteryExecution, TestExecutionAuditEntry } from "../../types";
import { useApp } from "../../context/AppContext";
import { getLocaleForLanguage, localize } from "../../lib/i18n";

interface TestAuditTrailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  battery: TestBatteryExecution;
  darkMode?: boolean;
}

export const TestAuditTrailDrawer: React.FC<TestAuditTrailDrawerProps> = ({
  isOpen,
  onClose,
  battery,
  darkMode,
}) => {
  const { language } = useApp();
  const l = (pt: string, en: string) => localize(language, pt, en);
  const locale = getLocaleForLanguage(language);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<string>("ALL");

  if (!isOpen) return null;

  const auditTrail: TestExecutionAuditEntry[] = battery.auditTrail || [];

  const translateChangeType = (type: string) => {
    switch (type) {
      case "UPDATE_STATUS":
        return l("Alteração de Situação", "Status Update");
      case "UPDATE_DETAILS":
        return l("Atualização de Evidências", "Evidence Update");
      case "ASSIGN_TESTER":
        return l("Atribuição de Testador", "Tester Assignment");
      case "ADD_PARTICIPANT":
        return l("Inclusão de Participante", "Participant Added");
      case "REMOVE_PARTICIPANT":
        return l("Remoção de Participante", "Participant Removed");
      case "AUTO_DISTRIBUTE":
        return l("Distribuição Automática", "Auto Distribution");
      default:
        return type;
    }
  };

  const filteredLogs = auditTrail.filter((log) => {
    if (selectedFilter !== "ALL" && log.changeType !== selectedFilter) {
      return false;
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchDesc =
        log.description.toLowerCase().includes(q) ||
        log.changedBy.toLowerCase().includes(q) ||
        (log.testId && log.testId.toLowerCase().includes(q)) ||
        (log.transactionId && log.transactionId.toLowerCase().includes(q)) ||
        (log.objectId && log.objectId.toLowerCase().includes(q));
      if (!matchDesc) return false;
    }
    return true;
  });

  return (
    <div
      id="drawer-test-audit-trail"
      className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm animate-in fade-in"
    >
      <div
        className={`w-full max-w-2xl h-full shadow-2xl flex flex-col border-l overflow-hidden ${
          darkMode ? "bg-neutral-900 border-neutral-800 text-white" : "bg-white border-neutral-200 text-neutral-900"
        }`}
      >
        {/* Header */}
        <div className="p-5 border-b flex items-center justify-between dark:border-neutral-800 border-neutral-200 bg-neutral-500/5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-600/20 text-emerald-600 dark:text-emerald-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight">
                {l("Trilha de Auditoria e Rastreabilidade Imutável", "Audit Trail & Immutable Traceability")}
              </h2>
              <p className="text-xs text-neutral-500">
                {l(
                  `Bateria ${battery.id} • ${auditTrail.length} Registros Auditados`,
                  `Battery ${battery.id} • ${auditTrail.length} Audited Records`
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={l("Fechar painel de auditoria", "Close audit drawer")}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters and Search Bar */}
        <div className="p-4 border-b dark:border-neutral-800 border-neutral-200 space-y-3 bg-neutral-500/5">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={l(
                "Buscar por ID do teste, responsável, transação ou descrição...",
                "Search by test ID, assignee, transaction, or description..."
              )}
              className={`w-full text-xs pl-9 pr-3 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-white border-neutral-300 text-neutral-900"
              }`}
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] font-bold">
            {["ALL", "UPDATE_STATUS", "UPDATE_DETAILS", "ASSIGN_TESTER", "ADD_PARTICIPANT", "AUTO_DISTRIBUTE"].map(
              (type) => (
                <button
                  key={type}
                  onClick={() => setSelectedFilter(type)}
                  className={`px-2.5 py-1 rounded-lg border shrink-0 transition ${
                    selectedFilter === type
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "border-neutral-200 dark:border-neutral-800 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
                >
                  {type === "ALL"
                    ? l("Todos", "All")
                    : type === "UPDATE_STATUS"
                    ? l("Situação", "Status")
                    : type === "UPDATE_DETAILS"
                    ? l("Evidências", "Evidence")
                    : type === "ASSIGN_TESTER"
                    ? l("Atribuição", "Assignment")
                    : type === "ADD_PARTICIPANT"
                    ? l("Participantes", "Participants")
                    : l("Distribuição", "Distribution")}
                </button>
              )
            )}
          </div>
        </div>

        {/* Logs List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-neutral-400">
              <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>
                {l(
                  "Nenhum registro de auditoria localizado com os filtros atuais.",
                  "No audit records found matching the current filters."
                )}
              </p>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className={`p-3.5 rounded-xl border space-y-2 ${
                  darkMode ? "bg-neutral-800/60 border-neutral-700" : "bg-neutral-50 border-neutral-200"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[10px] uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {translateChangeType(log.changeType)}
                    </span>
                    {log.testId && (
                      <span className="font-mono font-bold text-neutral-700 dark:text-neutral-300 text-[11px]">
                        #{log.testId}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-neutral-500 font-mono flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(log.changedAt).toLocaleString(locale)}
                  </span>
                </div>

                <p className="font-medium leading-relaxed text-neutral-800 dark:text-neutral-200">{log.description}</p>

                {/* De-Para Diff Badge */}
                {(log.oldValue || log.newValue) && (
                  <div className="p-2 rounded-lg bg-neutral-200/60 dark:bg-neutral-700/60 flex items-center gap-2 text-[11px] font-mono">
                    <span className="text-neutral-500 line-through">{log.oldValue || l("Vazio", "Empty")}</span>
                    <ArrowRight className="w-3 h-3 text-neutral-400 shrink-0" />
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{log.newValue || l("Atual", "Current")}</span>
                  </div>
                )}

                {/* Footer details */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t dark:border-neutral-700/60 border-neutral-200/60 text-[10px] text-neutral-500">
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3 text-neutral-400" />
                    {log.changedBy} {log.changedByEmail ? `(${log.changedByEmail})` : ""}
                  </span>
                  {log.transactionId && (
                    <span className="font-mono text-neutral-400 truncate max-w-[200px]" title={log.transactionId}>
                      Tx: {log.transactionId}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
