import React, { useState } from "react";
import {
  X,
  Save,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  FileText,
  ExternalLink,
  Shield,
  Layers,
  Sparkles,
  Link2,
  Terminal,
  UserCheck,
} from "lucide-react";
import { TestCaseItem, TestStatus, TestBatteryExecution, User } from "../../types";
import { vibrateClick, vibrateSuccess } from "../../lib/utils";

interface TestEvidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  test: TestCaseItem | null;
  battery: TestBatteryExecution;
  currentUser: User | null;
  onSave: (
    testId: string,
    obtainedResult: string,
    observations: string,
    evidence: {
      recordId?: string;
      logText?: string;
      url?: string;
      transactionId?: string;
      screenshotUrl?: string;
    },
    status: TestStatus,
    assignedToUserId?: string,
    assignedToName?: string,
    assignedToEmail?: string
  ) => Promise<void>;
  darkMode?: boolean;
}

export const TestEvidenceModal: React.FC<TestEvidenceModalProps> = ({
  isOpen,
  onClose,
  test,
  battery,
  currentUser,
  onSave,
  darkMode,
}) => {
  if (!isOpen || !test) return null;

  const [status, setStatus] = useState<TestStatus>(test.status);
  const [obtainedResult, setObtainedResult] = useState<string>(test.obtainedResult || "");
  const [observations, setObservations] = useState<string>(test.observations || "");
  const [recordId, setRecordId] = useState<string>(test.evidence?.recordId || "");
  const [logText, setLogText] = useState<string>(test.evidence?.logText || "");
  const [url, setUrl] = useState<string>(test.evidence?.url || "");
  const [transactionId, setTransactionId] = useState<string>(test.evidence?.transactionId || "");
  const [screenshotUrl, setScreenshotUrl] = useState<string>(test.evidence?.screenshotUrl || "");
  const [selectedTesterId, setSelectedTesterId] = useState<string>(test.assignedToUserId || "");
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const participants = battery.participants || [];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    vibrateClick();

    let assignedName: string | undefined = test.assignedToName;
    let assignedEmail: string | undefined = test.assignedToEmail;

    if (selectedTesterId) {
      const p = participants.find((part) => part.id === selectedTesterId);
      if (p) {
        assignedName = p.name;
        assignedEmail = p.email;
      }
    }

    await onSave(
      test.id,
      obtainedResult,
      observations,
      {
        recordId: recordId.trim() || undefined,
        logText: logText.trim() || undefined,
        url: url.trim() || undefined,
        transactionId: transactionId.trim() || undefined,
        screenshotUrl: screenshotUrl.trim() || undefined,
      },
      status,
      selectedTesterId || undefined,
      assignedName,
      assignedEmail
    );

    setIsSaving(false);
    vibrateSuccess();
    onClose();
  };

  return (
    <div
      id="modal-test-evidence"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
    >
      <div
        className={`w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] ${
          darkMode ? "bg-neutral-900 border-neutral-800 text-white" : "bg-white border-neutral-200 text-neutral-900"
        }`}
      >
        {/* Header */}
        <div className="p-5 border-b flex items-start justify-between dark:border-neutral-800 border-neutral-200 bg-neutral-500/5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                {test.id}
              </span>
              <span className="text-xs font-semibold text-neutral-500">{test.categoryName || test.category}</span>
              {test.isCriticalPersistence && (
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  ★ Persistência Crítica (RNF-04)
                </span>
              )}
            </div>
            <h2 className="text-lg font-black tracking-tight">{test.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSave} className="p-5 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* Objective and Expected Result */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl border dark:border-neutral-800 border-neutral-200 bg-neutral-500/5 space-y-1">
              <span className="font-bold text-neutral-500 uppercase tracking-wider text-[10px]">Objetivo do Teste</span>
              <p className="font-medium text-neutral-700 dark:text-neutral-300">{test.description}</p>
            </div>
            <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-1 text-emerald-950 dark:text-emerald-200">
              <span className="font-bold uppercase tracking-wider text-[10px] text-emerald-600 dark:text-emerald-400">
                Resultado Esperado
              </span>
              <p className="font-medium">{test.expectedResult}</p>
            </div>
          </div>

          {/* Procedure Steps Guide */}
          {(test.procedureSteps || test.procedure) && (test.procedureSteps || test.procedure)!.length > 0 && (
            <div className="p-4 rounded-xl border dark:border-neutral-800 border-neutral-200 space-y-2">
              <span className="font-bold text-neutral-500 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Roteiro de Procedimentos para Execução
              </span>
              <ol className="list-decimal list-inside space-y-1 text-neutral-600 dark:text-neutral-400">
                {(test.procedureSteps || test.procedure)!.map((step, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Status Selection & Tester Assignment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="font-bold text-neutral-500 uppercase tracking-wider text-[10px]">Status da Validação *</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { key: "APROVADO", label: "Aprovado", color: "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
                  { key: "REPROVADO", label: "Reprovado", color: "border-red-500 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300" },
                  { key: "PENDENTE", label: "Pendente", color: "border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
                  { key: "BLOQUEADO", label: "Bloqueado", color: "border-rose-700 bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-300" },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setStatus(item.key as TestStatus)}
                    className={`py-2 px-2.5 rounded-xl border text-center font-bold text-xs transition ${
                      status === item.key
                        ? `${item.color} ring-2 ring-emerald-500 shadow-sm`
                        : "border-neutral-200 dark:border-neutral-800 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-neutral-500 uppercase tracking-wider text-[10px]">
                Atribuir a Testador Responsável
              </label>
              <select
                value={selectedTesterId}
                onChange={(e) => setSelectedTesterId(e.target.value)}
                className={`w-full font-semibold px-3 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                  darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                }`}
              >
                <option value="">-- Sem atribuição específica --</option>
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.email}) - {p.globalRole}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Obtained Result */}
          <div className="space-y-1.5">
            <label className="font-bold text-neutral-500 uppercase tracking-wider text-[10px]">
              Resultado Obtido na Prática *
            </label>
            <textarea
              rows={2}
              required
              value={obtainedResult}
              onChange={(e) => setObtainedResult(e.target.value)}
              placeholder="Descreva detalhadamente o comportamento observado no sistema durante o teste..."
              className={`w-full font-medium px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
              }`}
            />
          </div>

          {/* Observations & Corrective Action */}
          <div className="space-y-1.5">
            <label className="font-bold text-neutral-500 uppercase tracking-wider text-[10px]">
              Observações Adicionais / Sugestão de Correção Técnica
            </label>
            <textarea
              rows={2}
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Notas sobre comportamento de rede, tratativa de erro, logs observados ou correções necessárias..."
              className={`w-full font-medium px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
              }`}
            />
          </div>

          {/* Evidences Section */}
          <div className="p-4 rounded-xl border dark:border-neutral-800 border-neutral-200 space-y-3 bg-neutral-500/5">
            <div className="flex items-center gap-2 border-b pb-2 dark:border-neutral-800 border-neutral-200">
              <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="font-bold text-xs">Evidências de Auditoria & Persistência Backend</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-bold text-neutral-500 uppercase tracking-wider text-[10px]">
                  ID do Registro no Firestore (ex: item-1740840000000)
                </label>
                <input
                  type="text"
                  value={recordId}
                  onChange={(e) => setRecordId(e.target.value)}
                  placeholder="item-1740840000000"
                  className={`w-full font-mono font-medium px-3 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                    darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-white border-neutral-300 text-neutral-900"
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-neutral-500 uppercase tracking-wider text-[10px]">
                  ID da Transação / Protocolo (Tx ID)
                </label>
                <input
                  type="text"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder="TX-BAT-2026-001-CAD"
                  className={`w-full font-mono font-medium px-3 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                    darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-white border-neutral-300 text-neutral-900"
                  }`}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-neutral-500 uppercase tracking-wider text-[10px] flex items-center gap-1">
                <Terminal className="w-3 h-3" />
                Trecho de Resposta da API / Log de Console / Payload
              </label>
              <textarea
                rows={2}
                value={logText}
                onChange={(e) => setLogText(e.target.value)}
                placeholder='Ex: 200 OK - {"status": "CONFIRMED", "docId": "item-174084..."}'
                className={`w-full font-mono text-[11px] px-3 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                  darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-white border-neutral-300 text-neutral-900"
                }`}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-bold text-neutral-500 uppercase tracking-wider text-[10px] flex items-center gap-1">
                  <Link2 className="w-3 h-3" />
                  URL da Tela / Link de Consulta
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://localizaplus.ifpr.edu.br/#/item/123"
                  className={`w-full font-medium px-3 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                    darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-white border-neutral-300 text-neutral-900"
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-neutral-500 uppercase tracking-wider text-[10px]">
                  URL de Captura de Tela / Imagem de Evidência
                </label>
                <input
                  type="url"
                  value={screenshotUrl}
                  onChange={(e) => setScreenshotUrl(e.target.value)}
                  placeholder="https://..."
                  className={`w-full font-medium px-3 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                    darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-white border-neutral-300 text-neutral-900"
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 font-bold rounded-xl border dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm transition flex items-center gap-2 active:scale-95"
            >
              <Save className="w-4 h-4" />
              Salvar Evidências & Atualizar Teste
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
