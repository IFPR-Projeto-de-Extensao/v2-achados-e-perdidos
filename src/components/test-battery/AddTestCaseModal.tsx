import React, { useState } from "react";
import { X, Plus, PlusCircle, CheckCircle2, ShieldAlert } from "lucide-react";
import { TestCaseItem, TestCategory, TestPriority } from "../../types";
import { vibrateClick, vibrateSuccess, vibrateWarning } from "../../lib/utils";
import { useApp } from "../../context/AppContext";
import { localize, SupportedLanguage } from "../../lib/i18n";

interface AddTestCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTest: (test: TestCaseItem) => Promise<void>;
  existingTestCount: number;
  darkMode?: boolean;
}

const getAvailableCategories = (language: SupportedLanguage): { id: TestCategory; name: string }[] => [
  { id: "AUTENTICACAO", name: localize(language, "Autenticação e Controle de Sessão", "Authentication & Session Control") },
  { id: "CADASTRO", name: localize(language, "Cadastro e Persistência de Dados", "Registration & Data Persistence") },
  { id: "ACHADOS_PERDIDOS", name: localize(language, "Achados e Perdidos", "Lost & Found") },
  { id: "REIVINDICACOES", name: localize(language, "Reivindicações e Verificação", "Claims & Verification") },
  { id: "QR_CODE", name: localize(language, "Código QR e Etiquetas Físicas", "QR Code & Physical Labels") },
  { id: "IA_GEMINI", name: localize(language, "Inteligência Artificial (Gemini)", "Artificial Intelligence (Gemini)") },
  { id: "PWA_MOBILE", name: localize(language, "PWA e Recursos Móveis", "PWA & Mobile Features") },
  { id: "DOCUMENTOS", name: localize(language, "Documentos Oficiais e Assinatura", "Official Documents & Signature") },
  { id: "NOTIFICACOES", name: localize(language, "Notificações e Alertas", "Notifications & Alerts") },
  { id: "SEGURANCA", name: localize(language, "Segurança e Trilha de Auditoria", "Security & Audit Trail") },
  { id: "APIS_PRODUCAO", name: localize(language, "APIs e Webhooks em Produção", "Production APIs & Webhooks") },
  { id: "MONITORAMENTO", name: localize(language, "Monitoramento e Disponibilidade", "Monitoring & Uptime") },
];

export const AddTestCaseModal: React.FC<AddTestCaseModalProps> = ({
  isOpen,
  onClose,
  onAddTest,
  existingTestCount,
  darkMode,
}) => {
  const { language } = useApp();
  const L = (pt: string, en: string) => localize(language, pt, en);
  const availableCategories = getAvailableCategories(language);

  const [category, setCategory] = useState<TestCategory>("CADASTRO");
  const [testId, setTestId] = useState<string>(`TEST-CUSTOM-${existingTestCount + 1}`);
  const [title, setTitle] = useState<string>("");
  const [priority, setPriority] = useState<TestPriority>("MEDIA");
  const [description, setDescription] = useState<string>("");
  const [expectedResult, setExpectedResult] = useState<string>("");
  const [preconditions, setPreconditions] = useState<string>("");
  const [stepsText, setStepsText] = useState<string>(() =>
    localize(
      language,
      "1. Acessar tela\n2. Executar ação\n3. Validar persistência",
      "1. Open screen\n2. Perform action\n3. Validate persistence"
    )
  );
  const [observations, setObservations] = useState<string>("");
  const [isCritical, setIsCritical] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testId.trim() || !title.trim() || !expectedResult.trim()) {
      vibrateWarning();
      return;
    }

    setIsSubmitting(true);
    vibrateClick();

    const selectedCategoryObj = availableCategories.find((c) => c.id === category);
    const steps = stepsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const newTestCase: TestCaseItem = {
      id: testId.trim(),
      category,
      categoryName: selectedCategoryObj?.name || category,
      title: title.trim(),
      priority,
      description: description.trim() || undefined,
      expectedResult: expectedResult.trim(),
      obtainedResult: L("Pendente de validação no ciclo ativo.", "Pending validation in the active cycle."),
      status: "PENDENTE",
      preconditions: preconditions.trim() || undefined,
      procedureSteps: steps.length > 0 ? steps : undefined,
      procedure: steps.length > 0 ? steps : undefined,
      isCriticalPersistence: isCritical,
      observations: observations.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    await onAddTest(newTestCase);
    setIsSubmitting(false);
    vibrateSuccess();
    onClose();
  };

  return (
    <div
      id="modal-add-test-case"
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
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">{L("Cadastrar Novo Caso de Teste", "Register New Test Case")}</h2>
              <p className="text-xs text-neutral-500">
                {L("Defina o roteiro de homologação manual ou assistida", "Define the manual or assisted approval script")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={L("Fechar", "Close")}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-neutral-500 uppercase">{L("Categoria *", "Category *")}</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TestCategory)}
                className={`w-full text-xs font-semibold px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                  darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                }`}
              >
                {availableCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-neutral-500 uppercase">{L("Identificador / Código *", "Identifier / Code *")}</label>
              <input
                type="text"
                required
                value={testId}
                onChange={(e) => setTestId(e.target.value)}
                placeholder={L("Ex.: CT-01 ou TEST-12", "e.g., TC-01 or TEST-12")}
                className={`w-full text-xs font-mono font-bold px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                  darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                }`}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-neutral-500 uppercase">{L("Prioridade *", "Priority *")}</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TestPriority)}
                className={`w-full text-xs font-bold px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                  darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                }`}
              >
                <option value="BAIXA">{L("Baixa", "Low")}</option>
                <option value="MEDIA">{L("Média", "Medium")}</option>
                <option value="ALTA">{L("Alta", "High")}</option>
                <option value="CRITICA">{L("Crítica", "Critical")}</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-neutral-500 uppercase">{L("Título do Caso de Teste *", "Test Case Title *")}</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={L("Ex.: Validação do fluxo de devolução com assinatura digital", "e.g., Validation of return workflow with digital signature")}
              className={`w-full text-xs font-semibold px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
              }`}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-neutral-500 uppercase">{L("Descrição e Objetivo do Teste", "Test Description & Objective")}</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={L("Descreva o propósito deste teste e o que se pretende aferir...", "Describe the purpose of this test and what it aims to verify...")}
              className={`w-full text-xs font-medium px-3 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
              }`}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-neutral-500 uppercase">{L("Pré-requisitos / Cenário Inicial", "Prerequisites / Initial Scenario")}</label>
            <input
              type="text"
              value={preconditions}
              onChange={(e) => setPreconditions(e.target.value)}
              placeholder={L("Ex.: Usuário Aluno autenticado com item aguardando reivindicação", "e.g., Authenticated student user with item awaiting claim")}
              className={`w-full text-xs font-medium px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
              }`}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-neutral-500 uppercase">{L("Resultado Esperado *", "Expected Result *")}</label>
            <textarea
              required
              rows={2}
              value={expectedResult}
              onChange={(e) => setExpectedResult(e.target.value)}
              placeholder={L("Descreva o critério de aceitação e persistência esperado...", "Describe the expected acceptance and persistence criteria...")}
              className={`w-full text-xs font-medium px-3 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
              }`}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-neutral-500 uppercase">{L("Passos do Procedimento (1 por linha)", "Procedure Steps (1 per line)")}</label>
            <textarea
              rows={3}
              value={stepsText}
              onChange={(e) => setStepsText(e.target.value)}
              placeholder={L("1. Passo um\n2. Passo dois\n3. Validar resultado", "1. Step one\n2. Step two\n3. Validate result")}
              className={`w-full text-xs font-mono px-3 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
              }`}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-neutral-500 uppercase">{L("Observações Técnicas", "Technical Notes")}</label>
            <textarea
              rows={2}
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder={L("Instruções particulares para o testador...", "Specific instructions for the tester...")}
              className={`w-full text-xs font-medium px-3 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
              }`}
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="critical-toggle"
              checked={isCritical}
              onChange={(e) => setIsCritical(e.target.checked)}
              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
            <label htmlFor="critical-toggle" className="text-xs font-bold flex items-center gap-1.5 cursor-pointer">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              {L("Marcar como teste crítico de persistência de dados (RNF-04)", "Mark as critical data persistence test (NFR-04)")}
            </label>
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t dark:border-neutral-800 border-neutral-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold rounded-xl border dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
            >
              {L("Cancelar", "Cancel")}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              {L("Salvar Caso de Teste", "Save Test Case")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
