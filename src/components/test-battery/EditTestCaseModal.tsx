import React, { useState, useEffect } from "react";
import { X, Edit3, Save, ShieldAlert, CheckCircle2, AlertCircle } from "lucide-react";
import { TestCaseItem, TestCategory, TestPriority, TestStatus } from "../../types";
import { vibrateClick, vibrateSuccess, vibrateWarning } from "../../lib/utils";

interface EditTestCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  test: TestCaseItem | null;
  onSaveTest: (updatedTest: TestCaseItem) => Promise<void>;
  darkMode?: boolean;
}

const AVAILABLE_CATEGORIES: { id: TestCategory; name: string }[] = [
  { id: "AUTENTICACAO", name: "Autenticação & Controle de Sessão" },
  { id: "CADASTRO", name: "Cadastro & Persistência de Dados" },
  { id: "ACHADOS_PERDIDOS", name: "Achados & Perdidos" },
  { id: "REIVINDICACOES", name: "Reivindicações & Verificação" },
  { id: "QR_CODE", name: "QR Code & Etiquetas Físicas" },
  { id: "IA_GEMINI", name: "Inteligência Artificial (Gemini)" },
  { id: "PWA_MOBILE", name: "PWA & Recursos Mobile" },
  { id: "DOCUMENTOS", name: "Documentos Oficiais & Assinatura" },
  { id: "NOTIFICACOES", name: "Notificações & Alertas" },
  { id: "SEGURANCA", name: "Segurança & Trilha de Auditoria" },
  { id: "APIS_PRODUCAO", name: "APIs & Webhooks em Produção" },
  { id: "MONITORAMENTO", name: "Monitoramento & Uptime" },
];

export const EditTestCaseModal: React.FC<EditTestCaseModalProps> = ({
  isOpen,
  onClose,
  test,
  onSaveTest,
  darkMode,
}) => {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TestCategory>("CADASTRO");
  const [priority, setPriority] = useState<TestPriority>("MEDIA");
  const [status, setStatus] = useState<TestStatus>("PENDENTE");
  const [description, setDescription] = useState("");
  const [expectedResult, setExpectedResult] = useState("");
  const [stepsText, setStepsText] = useState("");
  const [observations, setObservations] = useState("");
  const [isCritical, setIsCritical] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (test) {
      setTitle(test.title || "");
      setCategory(test.category || "CADASTRO");
      setPriority(test.priority || "MEDIA");
      setStatus(test.status || "PENDENTE");
      setDescription(test.description || "");
      setExpectedResult(test.expectedResult || "");
      const steps = test.procedureSteps || test.procedure || [];
      setStepsText(steps.join("\n"));
      setObservations(test.observations || "");
      setIsCritical(!!test.isCriticalPersistence);
    }
  }, [test]);

  if (!isOpen || !test) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !expectedResult.trim()) {
      vibrateWarning();
      return;
    }

    setIsSubmitting(true);
    vibrateClick();

    const selectedCategoryObj = AVAILABLE_CATEGORIES.find((c) => c.id === category);
    const steps = stepsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const updated: TestCaseItem = {
      ...test,
      title: title.trim(),
      category,
      categoryName: selectedCategoryObj?.name || category,
      priority,
      status,
      description: description.trim() || undefined,
      expectedResult: expectedResult.trim(),
      procedureSteps: steps.length > 0 ? steps : undefined,
      procedure: steps.length > 0 ? steps : undefined,
      observations: observations.trim() || undefined,
      isCriticalPersistence: isCritical,
    };

    await onSaveTest(updated);
    setIsSubmitting(false);
    vibrateSuccess();
    onClose();
  };

  return (
    <div
      id="modal-edit-test-case"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
    >
      <div
        className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
          darkMode ? "bg-neutral-900 border-neutral-800 text-white" : "bg-white border-neutral-200 text-neutral-900"
        }`}
      >
        <div className="p-5 border-b flex items-center justify-between dark:border-neutral-800 border-neutral-200 bg-emerald-600/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-sm">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">Editar Caso de Teste</h2>
              <p className="text-xs text-neutral-500 font-mono">ID: {test.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1 sm:col-span-1">
              <label className="text-xs font-bold text-neutral-500 uppercase">Categoria *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TestCategory)}
                className={`w-full text-xs font-semibold px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                  darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                }`}
              >
                {AVAILABLE_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1 sm:col-span-1">
              <label className="text-xs font-bold text-neutral-500 uppercase">Prioridade *</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TestPriority)}
                className={`w-full text-xs font-bold px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                  darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                }`}
              >
                <option value="BAIXA">Baixa</option>
                <option value="MEDIA">Média</option>
                <option value="ALTA">Alta</option>
                <option value="CRITICA">Crítica</option>
              </select>
            </div>

            <div className="space-y-1 sm:col-span-1">
              <label className="text-xs font-bold text-neutral-500 uppercase">Status *</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TestStatus)}
                className={`w-full text-xs font-bold px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                  darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                }`}
              >
                <option value="PENDENTE">Pendente</option>
                <option value="EM_EXECUCAO">Em execução</option>
                <option value="CONCLUIDO">Concluído</option>
                <option value="PROBLEMA">Problema encontrado</option>
                <option value="NAO_SE_APLICA">Não se aplica</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-neutral-500 uppercase">Título do Caso de Teste *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`w-full text-xs font-semibold px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
              }`}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-neutral-500 uppercase">Descrição & Objetivo do Teste</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explique o que este teste visa validar..."
              className={`w-full text-xs font-medium px-3 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
              }`}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-neutral-500 uppercase">Resultado Esperado *</label>
            <textarea
              required
              rows={2}
              value={expectedResult}
              onChange={(e) => setExpectedResult(e.target.value)}
              className={`w-full text-xs font-medium px-3 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
              }`}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-neutral-500 uppercase">Passos do Procedimento (1 por linha)</label>
            <textarea
              rows={3}
              value={stepsText}
              onChange={(e) => setStepsText(e.target.value)}
              placeholder="1. Passo um&#10;2. Passo dois&#10;3. Validar resultado"
              className={`w-full text-xs font-mono px-3 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
              }`}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-neutral-500 uppercase">Observações Técnicas</label>
            <textarea
              rows={2}
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Instruções particulares para o testador..."
              className={`w-full text-xs font-medium px-3 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
              }`}
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="edit-critical-toggle"
              checked={isCritical}
              onChange={(e) => setIsCritical(e.target.checked)}
              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
            <label htmlFor="edit-critical-toggle" className="text-xs font-bold flex items-center gap-1.5 cursor-pointer">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              Marcar como teste crítico de persistência de dados (RNF-04)
            </label>
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t dark:border-neutral-800 border-neutral-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold rounded-xl border dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              Salvar Alterações
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
