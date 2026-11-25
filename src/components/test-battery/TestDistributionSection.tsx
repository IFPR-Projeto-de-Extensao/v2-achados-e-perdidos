import React, { useState, useMemo } from "react";
import {
  Users,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Shield,
  ArrowRight,
  Filter,
  Search,
  CheckSquare,
  Square,
  UserCheck,
  RotateCcw,
  SlidersHorizontal,
  ChevronRight,
  UserMinus,
  Briefcase,
  Activity,
  Award,
} from "lucide-react";
import {
  TestBatteryExecution,
  TestParticipant,
  TestCaseItem,
  TestCategory,
  TestExecutionAuditEntry,
} from "../../types";
import { vibrateClick, vibrateSuccess, vibrateWarning } from "../../lib/utils";
import { useApp } from "../../context/AppContext";
import { localize, translateUserRole } from "../../lib/i18n";

interface TestDistributionSectionProps {
  battery: TestBatteryExecution;
  onUpdateBattery: (updated: TestBatteryExecution) => Promise<void>;
  onOpenAddParticipantModal?: () => void;
  currentUserEmail?: string;
  currentUserName?: string;
  darkMode?: boolean;
  isAdmin?: boolean;
}

const getCategoryNames = (language: "pt" | "en"): Record<TestCategory, string> => ({
  AUTENTICACAO: localize(language, "Autenticação e Sessão", "Authentication & Session"),
  CADASTRO: localize(language, "Cadastro e Persistência", "Registration & Persistence"),
  ACHADOS_PERDIDOS: localize(language, "Achados e Perdidos", "Lost & Found"),
  REIVINDICACOES: localize(language, "Reivindicações", "Claims"),
  QR_CODE: localize(language, "QR Code e Etiquetas", "QR Code & Tags"),
  IA_GEMINI: localize(language, "Inteligência Artificial", "Artificial Intelligence"),
  PWA_MOBILE: localize(language, "PWA e Móveis", "PWA & Mobile"),
  DOCUMENTOS: localize(language, "Documentos Oficiais", "Official Documents"),
  NOTIFICACOES: localize(language, "Notificações e Alertas", "Notifications & Alerts"),
  SEGURANCA: localize(language, "Segurança e Auditoria", "Security & Audit"),
  APIS_PRODUCAO: localize(language, "APIs e Webhooks", "APIs & Webhooks"),
  MONITORAMENTO: localize(language, "Monitoramento e Disponibilidade", "Monitoring & Uptime"),
});

export const TestDistributionSection: React.FC<TestDistributionSectionProps> = ({
  battery,
  onUpdateBattery,
  onOpenAddParticipantModal,
  currentUserEmail = "paulocauan39@gmail.com",
  currentUserName = "Administrador Geral",
  darkMode,
  isAdmin = true,
}) => {
  const { language } = useApp();
  const l = (pt: string, en: string) => localize(language, pt, en);
  const categoryNames = useMemo(() => getCategoryNames(language), [language]);

  const translateTestStatus = (status?: string) => {
    switch (status) {
      case "APROVADO":
        return l("APROVADO", "PASSED");
      case "REPROVADO":
        return l("REPROVADO", "FAILED");
      case "PENDENTE":
        return l("PENDENTE", "PENDING");
      case "NAO_EXECUTADO":
        return l("NÃO EXECUTADO", "NOT EXECUTED");
      case "EM_EXECUCAO":
        return l("EM EXECUÇÃO", "IN PROGRESS");
      case "CONCLUIDO":
        return l("CONCLUÍDO", "COMPLETED");
      case "PROBLEMA":
        return l("PROBLEMA", "ISSUE");
      case "BLOQUEADO":
        return l("BLOQUEADO", "BLOCKED");
      default:
        return status || l("PENDENTE", "PENDING");
    }
  };

  const [selectedParticipantId, setSelectedParticipantId] = useState<string>("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("ALL");
  const [assignmentFilter, setAssignmentFilter] = useState<"ALL" | "UNASSIGNED" | "ASSIGNED">("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [autoStrategy, setAutoStrategy] = useState<"EQUAL_SPLIT" | "CATEGORY_BLOCKS" | "UNASSIGNED_ONLY">("EQUAL_SPLIT");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<"MANUAL" | "AUTO" | "OVERVIEW">("MANUAL");

  const participants = useMemo(() => battery.participants || [], [battery.participants]);
  const tests = useMemo(() => battery.tests || [], [battery.tests]);

  // Selected participant object
  const activeParticipant = useMemo(
    () => participants.find((p) => p.id === selectedParticipantId) || participants[0] || null,
    [participants, selectedParticipantId]
  );

  // Sync selected participant if empty
  React.useEffect(() => {
    if (!selectedParticipantId && participants.length > 0) {
      setSelectedParticipantId(participants[0].id);
    }
  }, [participants, selectedParticipantId]);

  // Statistics & Progress
  const totalTests = tests.length;
  const totalParticipants = participants.length;
  const assignedTests = tests.filter((t) => t.assignedToUserId || t.assignedToEmail);
  const unassignedTests = tests.filter((t) => !t.assignedToUserId && !t.assignedToEmail);
  const assignedCount = assignedTests.length;
  const unassignedCount = unassignedTests.length;

  // Status-based battery metrics
  const completedTests = tests.filter((t) => t.status === "CONCLUIDO" || t.status === "APROVADO");
  const failedTests = tests.filter((t) => t.status === "PROBLEMA" || t.status === "REPROVADO");
  const inProgressTests = tests.filter((t) => t.status === "EM_EXECUCAO");
  const pendingTests = tests.filter((t) => t.status === "PENDENTE" || t.status === "NAO_EXECUTADO" || !t.status);
  const progressPct = totalTests > 0 ? ((completedTests.length / totalTests) * 100).toFixed(1) : "0.0";

  // Filter tests for selection
  const filteredAvailableTests = useMemo(() => {
    return tests.filter((t) => {
      if (selectedCategoryFilter !== "ALL" && t.category !== selectedCategoryFilter) {
        return false;
      }
      if (assignmentFilter === "UNASSIGNED" && (t.assignedToUserId || t.assignedToEmail)) {
        return false;
      }
      if (assignmentFilter === "ASSIGNED" && !t.assignedToUserId && !t.assignedToEmail) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesId = t.id.toLowerCase().includes(q);
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesCat = (t.categoryName || t.category).toLowerCase().includes(q);
        const matchesAssignee = (t.assignedToName || "").toLowerCase().includes(q);
        if (!matchesId && !matchesTitle && !matchesCat && !matchesAssignee) return false;
      }
      return true;
    });
  }, [tests, selectedCategoryFilter, assignmentFilter, searchQuery]);

  // Tests currently assigned to active participant
  const testsOfActiveParticipant = useMemo(() => {
    if (!activeParticipant) return [];
    return tests.filter(
      (t) =>
        t.assignedToUserId === activeParticipant.id ||
        (t.assignedToEmail && t.assignedToEmail.toLowerCase() === activeParticipant.email.toLowerCase())
    );
  }, [tests, activeParticipant]);

  // Toggle single test selection
  const toggleSelectTest = (testId: string) => {
    vibrateClick();
    setSelectedTestIds((prev) =>
      prev.includes(testId) ? prev.filter((id) => id !== testId) : [...prev, testId]
    );
  };

  // Select all filtered tests
  const handleSelectAllFiltered = () => {
    vibrateClick();
    const allFilteredIds = filteredAvailableTests.map((t) => t.id);
    const areAllSelected = allFilteredIds.every((id) => selectedTestIds.includes(id));
    if (areAllSelected) {
      setSelectedTestIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
    } else {
      setSelectedTestIds((prev) => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  // Manual Assign: Assign selected tests to active participant
  const handleAssignSelectedToParticipant = async () => {
    if (!activeParticipant || selectedTestIds.length === 0) {
      vibrateWarning();
      return;
    }

    setIsProcessing(true);
    vibrateClick();

    const nowIso = new Date().toISOString();
    const updatedTests: TestCaseItem[] = tests.map((t) => {
      if (selectedTestIds.includes(t.id)) {
        return {
          ...t,
          assignedToUserId: activeParticipant.id,
          assignedToName: activeParticipant.name,
          assignedToEmail: activeParticipant.email,
        };
      }
      return t;
    });

    const newAuditEntry: TestExecutionAuditEntry = {
      id: `audit-assign-${Date.now()}`,
      changedAt: nowIso,
      changedBy: currentUserName,
      changedByEmail: currentUserEmail,
      changeType: "TEST_ASSIGNED",
      description: `Atribuição manual de ${selectedTestIds.length} caso(s) de teste ao participante ${activeParticipant.name} (${activeParticipant.email}).`,
    };

    const updatedBattery: TestBatteryExecution = {
      ...battery,
      tests: updatedTests,
      auditTrail: [newAuditEntry, ...(battery.auditTrail || [])],
      updatedAt: nowIso,
    };

    await onUpdateBattery(updatedBattery);
    setSelectedTestIds([]);
    setIsProcessing(false);
    vibrateSuccess();
  };

  // Manual Assign: Assign Entire Filtered Category to active participant
  const handleAssignEntireCategory = async () => {
    if (!activeParticipant || selectedCategoryFilter === "ALL") {
      vibrateWarning();
      return;
    }

    setIsProcessing(true);
    vibrateClick();

    const nowIso = new Date().toISOString();
    let countAssigned = 0;

    const updatedTests: TestCaseItem[] = tests.map((t) => {
      if (t.category === selectedCategoryFilter) {
        countAssigned++;
        return {
          ...t,
          assignedToUserId: activeParticipant.id,
          assignedToName: activeParticipant.name,
          assignedToEmail: activeParticipant.email,
        };
      }
      return t;
    });

    const catName = categoryNames[selectedCategoryFilter as TestCategory] || selectedCategoryFilter;

    const newAuditEntry: TestExecutionAuditEntry = {
      id: `audit-assign-cat-${Date.now()}`,
      changedAt: nowIso,
      changedBy: currentUserName,
      changedByEmail: currentUserEmail,
      changeType: "TEST_ASSIGNED",
      description: `Atribuição da categoria completa "${catName}" (${countAssigned} testes) ao participante ${activeParticipant.name}.`,
    };

    const updatedBattery: TestBatteryExecution = {
      ...battery,
      tests: updatedTests,
      auditTrail: [newAuditEntry, ...(battery.auditTrail || [])],
      updatedAt: nowIso,
    };

    await onUpdateBattery(updatedBattery);
    setIsProcessing(false);
    vibrateSuccess();
  };

  // Unassign Single Test
  const handleUnassignSingleTest = async (testId: string) => {
    setIsProcessing(true);
    vibrateClick();

    const nowIso = new Date().toISOString();
    const targetTest = tests.find((t) => t.id === testId);

    const updatedTests: TestCaseItem[] = tests.map((t) => {
      if (t.id === testId) {
        const { assignedToUserId, assignedToName, assignedToEmail, ...rest } = t;
        return rest as TestCaseItem;
      }
      return t;
    });

    const newAuditEntry: TestExecutionAuditEntry = {
      id: `audit-unassign-${Date.now()}`,
      changedAt: nowIso,
      changedBy: currentUserName,
      changedByEmail: currentUserEmail,
      changeType: "TEST_ASSIGNED",
      description: `Teste ${testId} desatribuído (Responsável anterior: ${targetTest?.assignedToName || "N/A"}).`,
    };

    const updatedBattery: TestBatteryExecution = {
      ...battery,
      tests: updatedTests,
      auditTrail: [newAuditEntry, ...(battery.auditTrail || [])],
      updatedAt: nowIso,
    };

    await onUpdateBattery(updatedBattery);
    setIsProcessing(false);
    vibrateSuccess();
  };

  // Direct Individual Test Assignment / Change
  const handleAssignSingleTestToParticipant = async (testId: string, targetParticipant: TestParticipant | null) => {
    setIsProcessing(true);
    vibrateClick();

    const nowIso = new Date().toISOString();
    const targetTest = tests.find((t) => t.id === testId);

    const updatedTests: TestCaseItem[] = tests.map((t) => {
      if (t.id === testId) {
        if (!targetParticipant) {
          const { assignedToUserId, assignedToName, assignedToEmail, ...rest } = t;
          return rest as TestCaseItem;
        }
        return {
          ...t,
          assignedToUserId: targetParticipant.id,
          assignedToName: targetParticipant.name,
          assignedToEmail: targetParticipant.email,
        };
      }
      return t;
    });

    const newAuditEntry: TestExecutionAuditEntry = {
      id: `audit-assign-single-${Date.now()}`,
      changedAt: nowIso,
      changedBy: currentUserName,
      changedByEmail: currentUserEmail,
      changeType: "TEST_ASSIGNED",
      description: targetParticipant
        ? `Teste ${testId} ("${targetTest?.title || ""}") associado individualmente ao participante ${targetParticipant.name} (${targetParticipant.email}).`
        : `Teste ${testId} marcado individualmente como NÃO ATRIBUÍDO.`,
    };

    const updatedBattery: TestBatteryExecution = {
      ...battery,
      tests: updatedTests,
      auditTrail: [newAuditEntry, ...(battery.auditTrail || [])],
      updatedAt: nowIso,
    };

    await onUpdateBattery(updatedBattery);
    setIsProcessing(false);
    vibrateSuccess();
  };

  // Unassign All Tests of active participant
  const handleUnassignAllFromActiveParticipant = async () => {
    if (!activeParticipant || testsOfActiveParticipant.length === 0) return;

    setIsProcessing(true);
    vibrateClick();

    const nowIso = new Date().toISOString();
    const count = testsOfActiveParticipant.length;

    const updatedTests: TestCaseItem[] = tests.map((t) => {
      if (
        t.assignedToUserId === activeParticipant.id ||
        (t.assignedToEmail && t.assignedToEmail.toLowerCase() === activeParticipant.email.toLowerCase())
      ) {
        const { assignedToUserId, assignedToName, assignedToEmail, ...rest } = t;
        return rest as TestCaseItem;
      }
      return t;
    });

    const newAuditEntry: TestExecutionAuditEntry = {
      id: `audit-unassign-all-${Date.now()}`,
      changedAt: nowIso,
      changedBy: currentUserName,
      changedByEmail: currentUserEmail,
      changeType: "TEST_ASSIGNED",
      description: `Removida a atribuição de todos os ${count} teste(s) do participante ${activeParticipant.name}.`,
    };

    const updatedBattery: TestBatteryExecution = {
      ...battery,
      tests: updatedTests,
      auditTrail: [newAuditEntry, ...(battery.auditTrail || [])],
      updatedAt: nowIso,
    };

    await onUpdateBattery(updatedBattery);
    setIsProcessing(false);
    vibrateSuccess();
  };

  // Automatic Distribution Engine
  const handleExecuteAutoDistribution = async () => {
    if (participants.length === 0 || tests.length === 0) {
      vibrateWarning();
      return;
    }

    setIsProcessing(true);
    vibrateClick();

    const nowIso = new Date().toISOString();
    let updatedTests: TestCaseItem[] = [...tests];

    if (autoStrategy === "EQUAL_SPLIT") {
      // 1. Equal Split Round-Robin across all tests
      updatedTests = tests.map((t, idx) => {
        const p = participants[idx % participants.length];
        return {
          ...t,
          assignedToUserId: p.id,
          assignedToName: p.name,
          assignedToEmail: p.email,
        };
      });
    } else if (autoStrategy === "CATEGORY_BLOCKS") {
      // 2. Block of categories round-robin
      const uniqueCategories = Array.from(new Set(tests.map((t) => t.category)));
      const categoryToParticipantMap: Record<string, TestParticipant> = {};
      uniqueCategories.forEach((cat, idx) => {
        categoryToParticipantMap[cat] = participants[idx % participants.length];
      });

      updatedTests = tests.map((t) => {
        const p = categoryToParticipantMap[t.category] || participants[0];
        return {
          ...t,
          assignedToUserId: p.id,
          assignedToName: p.name,
          assignedToEmail: p.email,
        };
      });
    } else if (autoStrategy === "UNASSIGNED_ONLY") {
      // 3. Distribute only currently unassigned tests to participants with least load
      const participantCounts: Record<string, number> = {};
      participants.forEach((p) => {
        participantCounts[p.id] = tests.filter(
          (t) => t.assignedToUserId === p.id || (t.assignedToEmail && t.assignedToEmail.toLowerCase() === p.email.toLowerCase())
        ).length;
      });

      updatedTests = tests.map((t) => {
        if (!t.assignedToUserId && !t.assignedToEmail) {
          // Find participant with minimum count
          const sorted = [...participants].sort((a, b) => (participantCounts[a.id] || 0) - (participantCounts[b.id] || 0));
          const target = sorted[0];
          participantCounts[target.id] = (participantCounts[target.id] || 0) + 1;
          return {
            ...t,
            assignedToUserId: target.id,
            assignedToName: target.name,
            assignedToEmail: target.email,
          };
        }
        return t;
      });
    }

    const auditDesc =
      autoStrategy === "EQUAL_SPLIT"
        ? `Distribuição automática equitativa (Round-Robin) de ${tests.length} testes entre ${participants.length} participante(s).`
        : autoStrategy === "CATEGORY_BLOCKS"
        ? `Distribuição automática por blocos temáticos de categorias entre ${participants.length} participante(s).`
        : `Distribuição balanceada dos testes pendentes/não atribuídos entre os participantes.`;

    const newAuditEntry: TestExecutionAuditEntry = {
      id: `audit-auto-dist-${Date.now()}`,
      changedAt: nowIso,
      changedBy: currentUserName,
      changedByEmail: currentUserEmail,
      changeType: "AUTO_DISTRIBUTE",
      description: auditDesc,
    };

    const updatedBattery: TestBatteryExecution = {
      ...battery,
      tests: updatedTests,
      auditTrail: [newAuditEntry, ...(battery.auditTrail || [])],
      updatedAt: nowIso,
    };

    await onUpdateBattery(updatedBattery);
    setIsProcessing(false);
    vibrateSuccess();
  };

  // Reset all assignments
  const handleResetAllAssignments = async () => {
    if (
      !window.confirm(
        l(
          "Deseja realmente desatribuir TODOS os testes da bateria? Todos os testes retornarão à situação NÃO ATRIBUÍDO.",
          "Are you sure you want to unassign ALL tests in this battery? Every test will return to UNASSIGNED status."
        )
      )
    ) {
      return;
    }

    setIsProcessing(true);
    vibrateClick();

    const nowIso = new Date().toISOString();
    const updatedTests: TestCaseItem[] = tests.map((t) => {
      const { assignedToUserId, assignedToName, assignedToEmail, ...rest } = t;
      return rest as TestCaseItem;
    });

    const newAuditEntry: TestExecutionAuditEntry = {
      id: `audit-clear-dist-${Date.now()}`,
      changedAt: nowIso,
      changedBy: currentUserName,
      changedByEmail: currentUserEmail,
      changeType: "TEST_ASSIGNED",
      description: "Todas as atribuições de testes foram limpas. Testes retornados a NÃO ATRIBUÍDO.",
    };

    const updatedBattery: TestBatteryExecution = {
      ...battery,
      tests: updatedTests,
      auditTrail: [newAuditEntry, ...(battery.auditTrail || [])],
      updatedAt: nowIso,
    };

    await onUpdateBattery(updatedBattery);
    setIsProcessing(false);
    vibrateSuccess();
  };

  return (
    <div id="test-distribution-section" className="space-y-6">
      {/* RBAC Notice for Non-Admins */}
      {!isAdmin && (
        <div className="p-3.5 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-800 dark:text-blue-300 flex items-center gap-2.5 text-xs font-semibold">
          <Shield className="w-4 h-4 shrink-0 text-blue-500" />
          <span>
            {language === "en" ? (
              <>
                <strong>Read-Only Mode:</strong> Only IFPR administrators and staff can distribute tests or manage the team. You can view tests assigned to you in the <em>My Assigned Tests</em> tab.
              </>
            ) : (
              <>
                <strong>Modo Somente Leitura:</strong> Apenas administradores e servidores do IFPR podem distribuir testes ou alterar a equipe. Você pode consultar os testes atribuídos a você na aba <em>Meus Testes Atribuídos</em>.
              </>
            )}
          </span>
        </div>
      )}

      {/* 1. RESUMO GERAL DA BATERIA (6 INDICADORES OBRIGATÓRIOS) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <div
          className={`p-3.5 rounded-xl border ${
            darkMode ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"
          }`}
        >
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-500 mb-1">
            {l("Total de Testes", "Total Tests")}
          </div>
          <div className="text-xl font-black text-neutral-900 dark:text-white">
            {totalTests}
          </div>
          <p className="text-[10px] text-neutral-400 mt-0.5">{l("Definidos na bateria", "Defined in battery")}</p>
        </div>

        <div
          className={`p-3.5 rounded-xl border ${
            darkMode ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"
          }`}
        >
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">
            {l("Distribuídos", "Assigned")}
          </div>
          <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">
            {assignedCount}
          </div>
          <p className="text-[10px] text-neutral-400 mt-0.5">
            {totalTests > 0 ? ((assignedCount / totalTests) * 100).toFixed(0) : 0}% {l("atribuídos", "assigned")}
          </p>
        </div>

        <div
          className={`p-3.5 rounded-xl border ${
            darkMode ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"
          }`}
        >
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1">
            {l("Não Distribuídos", "Unassigned")}
          </div>
          <div className="text-xl font-black text-amber-600 dark:text-amber-400">
            {unassignedCount}
          </div>
          <p className="text-[10px] text-neutral-400 mt-0.5">{l("Aguardando testador", "Awaiting tester")}</p>
        </div>

        <div
          className={`p-3.5 rounded-xl border ${
            darkMode ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"
          }`}
        >
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-teal-600 dark:text-teal-400 mb-1">
            {l("Concluídos", "Completed")}
          </div>
          <div className="text-xl font-black text-teal-600 dark:text-teal-400">
            {completedTests.length}
          </div>
          <p className="text-[10px] text-neutral-400 mt-0.5">{l("Finalizados", "Finished")}</p>
        </div>

        <div
          className={`p-3.5 rounded-xl border ${
            darkMode ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"
          }`}
        >
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-rose-600 dark:text-rose-400 mb-1">
            {l("Com Problemas", "With Issues")}
          </div>
          <div className="text-xl font-black text-rose-600 dark:text-rose-400">
            {failedTests.length}
          </div>
          <p className="text-[10px] text-neutral-400 mt-0.5">{l("Falhas apontadas", "Reported failures")}</p>
        </div>

        <div
          className={`p-3.5 rounded-xl border ${
            darkMode ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"
          }`}
        >
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-1">
            {l("Progresso Geral", "Overall Progress")}
          </div>
          <div className="text-xl font-black text-indigo-600 dark:text-indigo-400">
            {progressPct}%
          </div>
          <p className="text-[10px] text-neutral-400 mt-0.5">
            {completedTests.length}/{totalTests} {l("casos", "cases")}
          </p>
        </div>
      </div>

      {/* 1.1 RESUMO DA DISTRIBUIÇÃO POR PARTICIPANTE */}
      <div
        className={`p-4 rounded-xl border space-y-3 ${
          darkMode ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-600" />
            <h4 className="text-xs font-black uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
              {l("Resumo da Distribuição por Participante", "Distribution Summary by Participant")}
            </h4>
          </div>
          <span className="text-[11px] text-neutral-500 font-semibold">
            {l(
              `${totalParticipants} participante(s) • ${assignedCount}/${totalTests} testes distribuídos`,
              `${totalParticipants} participant(s) • ${assignedCount}/${totalTests} tests assigned`
            )}
          </span>
        </div>

        {/* Proportional Stacked Workload Bar */}
        {totalTests > 0 && (
          <div className="space-y-1.5">
            <div className="w-full bg-neutral-200 dark:bg-neutral-800 h-2.5 rounded-full overflow-hidden flex">
              {participants.map((p, idx) => {
                const count = tests.filter(
                  (t) =>
                    t.assignedToUserId === p.id ||
                    (t.assignedToEmail && t.assignedToEmail.toLowerCase() === p.email.toLowerCase())
                ).length;
                const widthPct = (count / totalTests) * 100;
                if (widthPct === 0) return null;

                const colorPalettes = [
                  "bg-emerald-500",
                  "bg-blue-500",
                  "bg-purple-500",
                  "bg-indigo-500",
                  "bg-teal-500",
                  "bg-cyan-500",
                  "bg-sky-500",
                ];
                const colorClass = colorPalettes[idx % colorPalettes.length];

                return (
                  <div
                    key={p.id}
                    className={`${colorClass} h-full transition-all duration-300 relative group cursor-pointer`}
                    style={{ width: `${widthPct}%` }}
                    title={l(
                      `${p.name}: ${count} testes (${widthPct.toFixed(1)}%)`,
                      `${p.name}: ${count} tests (${widthPct.toFixed(1)}%)`
                    )}
                    onClick={() => setSelectedParticipantId(p.id)}
                  />
                );
              })}
              {unassignedCount > 0 && (
                <div
                  className="bg-amber-400 dark:bg-amber-500 h-full transition-all duration-300"
                  style={{ width: `${(unassignedCount / totalTests) * 100}%` }}
                  title={l(
                    `Não Atribuídos: ${unassignedCount} testes (${((unassignedCount / totalTests) * 100).toFixed(1)}%)`,
                    `Unassigned: ${unassignedCount} tests (${((unassignedCount / totalTests) * 100).toFixed(1)}%)`
                  )}
                />
              )}
            </div>

            <div className="flex items-center justify-between text-[10px] text-neutral-400 font-semibold px-0.5">
              <span>{l(`Distribuição Total (${totalTests} casos)`, `Total Distribution (${totalTests} cases)`)}</span>
              {unassignedCount > 0 ? (
                <span className="text-amber-600 dark:text-amber-400 font-bold">
                  {l(
                    `${unassignedCount} pendentes (${((unassignedCount / totalTests) * 100).toFixed(0)}%)`,
                    `${unassignedCount} unassigned (${((unassignedCount / totalTests) * 100).toFixed(0)}%)`
                  )}
                </span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                  {l("100% dos testes distribuídos", "100% of tests assigned")}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Participant Cards Grid */}
        {participants.length === 0 ? (
          <p className="text-xs text-neutral-400 italic py-2">
            {l("Nenhum participante cadastrado para distribuição.", "No participants registered for distribution.")}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
            {participants.map((p, idx) => {
              const myAssigned = tests.filter(
                (t) =>
                  t.assignedToUserId === p.id ||
                  (t.assignedToEmail && t.assignedToEmail.toLowerCase() === p.email.toLowerCase())
              );
              const totalAssigned = myAssigned.length;
              const completedCount = myAssigned.filter(
                (t) => t.status === "CONCLUIDO" || t.status === "APROVADO"
              ).length;
              const problemCount = myAssigned.filter(
                (t) => t.status === "PROBLEMA" || t.status === "REPROVADO"
              ).length;
              const inProgressCount = myAssigned.filter(
                (t) => t.status === "EM_EXECUCAO"
              ).length;
              const pendingCount = myAssigned.filter(
                (t) => t.status === "PENDENTE" || t.status === "NAO_EXECUTADO" || !t.status
              ).length;

              const isCurrent = selectedParticipantId === p.id;
              const pctOfTotal = totalTests > 0 ? ((totalAssigned / totalTests) * 100).toFixed(0) : "0";

              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedParticipantId(p.id)}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition flex flex-col justify-between gap-2.5 ${
                    isCurrent
                      ? "border-emerald-600 bg-emerald-500/10 shadow-sm ring-1 ring-emerald-500/30"
                      : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-[11px] flex-shrink-0 ${
                          isCurrent
                            ? "bg-emerald-600 text-white"
                            : "bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300"
                        }`}
                      >
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="overflow-hidden">
                        <div className="font-bold text-neutral-900 dark:text-white truncate">
                          {p.name}
                        </div>
                        <div className="text-[10px] text-neutral-500 flex items-center gap-1.5">
                          <span
                            className={`font-extrabold uppercase text-[9px] px-1 py-0.2 rounded ${
                              p.globalRole === "ADMIN"
                                ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                                : p.globalRole === "SERVIDOR"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            }`}
                          >
                            {translateUserRole(p.globalRole, language)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <div className="font-black text-neutral-900 dark:text-white text-xs">
                        {totalAssigned} {totalAssigned === 1 ? l("teste", "test") : l("testes", "tests")}
                      </div>
                      <div className="text-[10px] text-neutral-400">
                        {pctOfTotal}% {l("do total", "of total")}
                      </div>
                    </div>
                  </div>

                  {/* Resumo com os 5 indicadores obrigatórios por testador */}
                  <div className="grid grid-cols-4 gap-1 text-[10px] pt-1.5 border-t dark:border-neutral-800/60 border-neutral-200 text-center">
                    <div className="bg-neutral-100 dark:bg-neutral-800/80 rounded py-1 px-0.5">
                      <div className="text-neutral-400 text-[9px] font-bold">{l("Pend.", "Pend.")}</div>
                      <div className="font-extrabold text-neutral-700 dark:text-neutral-300">{pendingCount}</div>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-950/40 rounded py-1 px-0.5">
                      <div className="text-blue-500 text-[9px] font-bold">{l("Andam.", "Active")}</div>
                      <div className="font-extrabold text-blue-600 dark:text-blue-400">{inProgressCount}</div>
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded py-1 px-0.5">
                      <div className="text-emerald-500 text-[9px] font-bold">{l("Concl.", "Done")}</div>
                      <div className="font-extrabold text-emerald-600 dark:text-emerald-400">{completedCount}</div>
                    </div>
                    <div className="bg-rose-50 dark:bg-rose-950/40 rounded py-1 px-0.5">
                      <div className="text-rose-500 text-[9px] font-bold">{l("Prob.", "Issues")}</div>
                      <div className="font-extrabold text-rose-600 dark:text-rose-400">{problemCount}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Warning if no participants exist */}
      {totalParticipants === 0 && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                {l("Nenhum participante cadastrado na bateria.", "No participants registered in this battery.")}
              </p>
              <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                {l(
                  "Adicione alunos, servidores ou administradores à equipe para iniciar a distribuição manual ou automática de testes.",
                  "Add students, staff, or administrators to the team to start manual or automatic test distribution."
                )}
              </p>
            </div>
          </div>
          {onOpenAddParticipantModal && (
            <button
              onClick={onOpenAddParticipantModal}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition flex-shrink-0 flex items-center gap-1.5 shadow-sm"
            >
              <Users className="w-4 h-4" />
              {l("Adicionar Participantes", "Add Participants")}
            </button>
          )}
        </div>
      )}

      {/* 2. NAVIGATION BAR (MANUAL / AUTOMATICA / QUADRO GERAL) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b dark:border-neutral-800 border-neutral-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("MANUAL")}
            className={`px-3 py-2 text-xs font-bold rounded-xl transition flex items-center gap-1.5 ${
              activeTab === "MANUAL"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {l("Distribuição Manual", "Manual Distribution")}
          </button>

          {totalParticipants > 0 && totalTests > 0 && (
            <button
              onClick={() => setActiveTab("AUTO")}
              className={`px-3 py-2 text-xs font-bold rounded-xl transition flex items-center gap-1.5 ${
                activeTab === "AUTO"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              {l("Distribuição Automática", "Automatic Distribution")}
            </button>
          )}

          <button
            onClick={() => setActiveTab("OVERVIEW")}
            className={`px-3 py-2 text-xs font-bold rounded-xl transition flex items-center gap-1.5 ${
              activeTab === "OVERVIEW"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            {l(`Quadro por Participante (${participants.length})`, `Board by Participant (${participants.length})`)}
          </button>
        </div>

        {assignedCount > 0 && (
          <button
            onClick={handleResetAllAssignments}
            disabled={isProcessing}
            className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-rose-500/10 transition"
          >
            <RotateCcw className="w-3 h-3" />
            {l("Limpar Todas as Atribuições", "Clear All Assignments")}
          </button>
        )}
      </div>

      {/* 3. TAB CONTENT: MANUAL DISTRIBUTION */}
      {activeTab === "MANUAL" && (
        <div className="space-y-6">
          {totalParticipants === 0 ? (
            <div className="text-center py-12 px-4 rounded-2xl border border-dashed dark:border-neutral-800 border-neutral-300">
              <Users className="w-10 h-10 mx-auto text-neutral-400 mb-2" />
              <h3 className="text-sm font-bold">{l("Cadastre participantes primeiro", "Register participants first")}</h3>
              <p className="text-xs text-neutral-500 mt-1 max-w-md mx-auto">
                {l(
                  "Para distribuir testes manualmente, adicione ao menos um participante à equipe da bateria.",
                  "To manually assign tests, add at least one participant to the battery team."
                )}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Participant Selection & Quick Actions (4 cols) */}
              <div className="lg:col-span-4 space-y-4">
                {/* 1. Select Active Participant */}
                <div
                  className={`p-4 rounded-xl border space-y-3 ${
                    darkMode ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"
                  }`}
                >
                  <label className="text-xs font-bold text-neutral-500 uppercase flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-emerald-600" />
                    {l("1. Selecionar Participante Destino", "1. Select Target Participant")}
                  </label>

                  <select
                    value={selectedParticipantId}
                    onChange={(e) => setSelectedParticipantId(e.target.value)}
                    className={`w-full text-xs font-bold px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                      darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                    }`}
                  >
                    {participants.map((p) => {
                      const count = tests.filter(
                        (t) => t.assignedToUserId === p.id || (t.assignedToEmail && t.assignedToEmail.toLowerCase() === p.email.toLowerCase())
                      ).length;
                      return (
                        <option key={p.id} value={p.id}>
                          {p.name} ({translateUserRole(p.globalRole, language)}) - {count} {l("teste(s)", "test(s)")}
                        </option>
                      );
                    })}
                  </select>

                  {activeParticipant && (
                    <div className="p-3 rounded-lg bg-neutral-100 dark:bg-neutral-800/60 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold">{activeParticipant.name}</span>
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          {translateUserRole(activeParticipant.globalRole, language)}
                        </span>
                      </div>
                      <div className="text-[11px] text-neutral-500">{activeParticipant.email}</div>
                      <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 pt-1">
                        {l(
                          `${testsOfActiveParticipant.length} teste(s) atribuído(s) atualmente`,
                          `${testsOfActiveParticipant.length} test(s) currently assigned`
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Actions on Selected Tests */}
                <div
                  className={`p-4 rounded-xl border space-y-3 ${
                    darkMode ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"
                  }`}
                >
                  <label className="text-xs font-bold text-neutral-500 uppercase flex items-center gap-1.5">
                    <Briefcase className="w-4 h-4 text-emerald-600" />
                    {l("2. Ações de Atribuição", "2. Assignment Actions")}
                  </label>

                  <button
                    onClick={handleAssignSelectedToParticipant}
                    disabled={isProcessing || selectedTestIds.length === 0 || !activeParticipant}
                    className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
                  >
                    <UserCheck className="w-4 h-4" />
                    {l(
                      `Atribuir Selecionados (${selectedTestIds.length}) ao Participante`,
                      `Assign Selected (${selectedTestIds.length}) to Participant`
                    )}
                  </button>

                  {selectedCategoryFilter !== "ALL" && (
                    <button
                      onClick={handleAssignEntireCategory}
                      disabled={isProcessing || !activeParticipant}
                      className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
                    >
                      <Layers className="w-4 h-4" />
                      {l(
                        `Atribuir Categoria Inteira (${categoryNames[selectedCategoryFilter as TestCategory] || selectedCategoryFilter})`,
                        `Assign Entire Category (${categoryNames[selectedCategoryFilter as TestCategory] || selectedCategoryFilter})`
                      )}
                    </button>
                  )}
                </div>

                {/* 3. Tests currently with active participant */}
                <div
                  className={`p-4 rounded-xl border space-y-3 ${
                    darkMode ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-neutral-500 uppercase">
                      {l(
                        `Testes de ${activeParticipant?.name?.split(" ")[0]} (${testsOfActiveParticipant.length})`,
                        `${activeParticipant?.name?.split(" ")[0]}'s Tests (${testsOfActiveParticipant.length})`
                      )}
                    </label>
                    {testsOfActiveParticipant.length > 0 && (
                      <button
                        onClick={handleUnassignAllFromActiveParticipant}
                        disabled={isProcessing}
                        className="text-[10px] font-bold text-rose-600 hover:underline"
                      >
                        {l("Desatribuir Todos", "Unassign All")}
                      </button>
                    )}
                  </div>

                  {testsOfActiveParticipant.length === 0 ? (
                    <p className="text-xs text-neutral-400 italic py-2">
                      {l(
                        "Nenhum teste atribuído a este participante até o momento.",
                        "No tests assigned to this participant yet."
                      )}
                    </p>
                  ) : (
                    <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                      {testsOfActiveParticipant.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800 text-xs"
                        >
                          <div className="overflow-hidden">
                            <span className="font-mono font-bold text-emerald-600 text-[10px] mr-1.5">{t.id}</span>
                            <span className="truncate">{t.title}</span>
                          </div>
                          <button
                            onClick={() => handleUnassignSingleTest(t.id)}
                            className="text-neutral-400 hover:text-rose-500 p-1 ml-2 transition flex-shrink-0"
                            title={l("Remover atribuição deste teste", "Remove assignment from this test")}
                            aria-label={l("Remover atribuição deste teste", "Remove assignment from this test")}
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Test Case Selector Table (8 cols) */}
              <div className="lg:col-span-8 space-y-3">
                {/* Filter Toolbar */}
                <div
                  className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                    darkMode ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"
                  }`}
                >
                  {/* Category Filter */}
                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                    <Filter className="w-3.5 h-3.5 text-neutral-400" />
                    <select
                      value={selectedCategoryFilter}
                      onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                      className={`w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border outline-none ${
                        darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                      }`}
                    >
                      <option value="ALL">
                        {l(`Todas as Categorias (${totalTests})`, `All Categories (${totalTests})`)}
                      </option>
                      {Object.entries(categoryNames).map(([catId, catName]) => {
                        const count = tests.filter((t) => t.category === catId).length;
                        return (
                          <option key={catId} value={catId}>
                            {catName} ({count})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Assignment Status Filter */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setAssignmentFilter("ALL")}
                      className={`px-2 py-1 text-[11px] font-bold rounded-md transition ${
                        assignmentFilter === "ALL"
                          ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
                          : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                      }`}
                    >
                      {l("Todos", "All")}
                    </button>
                    <button
                      onClick={() => setAssignmentFilter("UNASSIGNED")}
                      className={`px-2 py-1 text-[11px] font-bold rounded-md transition ${
                        assignmentFilter === "UNASSIGNED"
                          ? "bg-amber-600 text-white"
                          : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                      }`}
                    >
                      {l(`Não Atribuídos (${unassignedCount})`, `Unassigned (${unassignedCount})`)}
                    </button>
                    <button
                      onClick={() => setAssignmentFilter("ASSIGNED")}
                      className={`px-2 py-1 text-[11px] font-bold rounded-md transition ${
                        assignmentFilter === "ASSIGNED"
                          ? "bg-emerald-600 text-white"
                          : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                      }`}
                    >
                      {l(`Atribuídos (${assignedCount})`, `Assigned (${assignedCount})`)}
                    </button>
                  </div>

                  {/* Search input */}
                  <div className="relative min-w-[160px]">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={l("Buscar teste...", "Search test...")}
                      className={`w-full text-xs pl-8 pr-2.5 py-1.5 rounded-lg border outline-none ${
                        darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                      }`}
                    />
                  </div>
                </div>

                {/* Bulk Selector Action Bar */}
                <div className="flex items-center justify-between px-2 text-xs">
                  <button
                    onClick={handleSelectAllFiltered}
                    className="flex items-center gap-1.5 font-bold text-neutral-600 dark:text-neutral-400 hover:text-emerald-600 transition"
                  >
                    {filteredAvailableTests.length > 0 &&
                    filteredAvailableTests.every((t) => selectedTestIds.includes(t.id)) ? (
                      <CheckSquare className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Square className="w-4 h-4 text-neutral-400" />
                    )}
                    {l(
                      `Selecionar Todos os ${filteredAvailableTests.length} Filtrados`,
                      `Select All ${filteredAvailableTests.length} Filtered`
                    )}
                  </button>

                  <span className="text-[11px] text-neutral-400">
                    {l(
                      `${selectedTestIds.length} teste(s) selecionado(s)`,
                      `${selectedTestIds.length} test(s) selected`
                    )}
                  </span>
                </div>

                {/* Test Cases Table */}
                <div className="overflow-x-auto rounded-xl border dark:border-neutral-800 border-neutral-200 max-h-[500px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-neutral-100 dark:bg-neutral-800 font-bold uppercase text-[10px] text-neutral-600 dark:text-neutral-400 border-b dark:border-neutral-800 border-neutral-200 z-10">
                      <tr>
                        <th className="py-2.5 px-3 w-8 text-center">{l("Sel.", "Sel.")}</th>
                        <th className="py-2.5 px-3 w-28">{l("ID e Categoria", "ID & Category")}</th>
                        <th className="py-2.5 px-4">{l("Caso de Teste e Procedimento", "Test Case & Procedure")}</th>
                        <th className="py-2.5 px-3 w-40">{l("Responsável Atual", "Current Assignee")}</th>
                        <th className="py-2.5 px-3 w-24 text-center">{l("Situação", "Status")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                      {filteredAvailableTests.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-neutral-400 italic">
                            {l(
                              "Nenhum caso de teste encontrado com os filtros selecionados.",
                              "No test cases found with the selected filters."
                            )}
                          </td>
                        </tr>
                      ) : (
                        filteredAvailableTests.map((t) => {
                          const isSelected = selectedTestIds.includes(t.id);
                          const isAssigned = !!t.assignedToUserId || !!t.assignedToEmail;
                          const isMine =
                            activeParticipant &&
                            (t.assignedToUserId === activeParticipant.id ||
                              (t.assignedToEmail && t.assignedToEmail.toLowerCase() === activeParticipant.email.toLowerCase()));

                          return (
                            <tr
                              key={t.id}
                              onClick={() => toggleSelectTest(t.id)}
                              className={`cursor-pointer transition-colors ${
                                isSelected
                                  ? "bg-emerald-500/15 dark:bg-emerald-500/20"
                                  : "hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                              }`}
                            >
                              <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelectTest(t.id)}
                                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                />
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="font-mono font-bold text-neutral-900 dark:text-white text-[11px]">
                                  {t.id}
                                </div>
                                <div className="text-[10px] text-neutral-500 truncate max-w-[110px]">
                                  {categoryNames[t.category] || t.categoryName || t.category}
                                </div>
                              </td>
                              <td className="py-2.5 px-4">
                                <div className="font-semibold text-neutral-900 dark:text-white line-clamp-1">
                                  {t.title}
                                </div>
                                <div className="text-[11px] text-neutral-500 line-clamp-1">
                                  {t.expectedResult}
                                </div>
                              </td>
                              <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                                <select
                                  id={`select-assignee-${t.id}`}
                                  value={t.assignedToUserId || ""}
                                  disabled={isProcessing}
                                  onChange={(e) => {
                                    const selectedId = e.target.value;
                                    const targetP = participants.find((p) => p.id === selectedId) || null;
                                    handleAssignSingleTestToParticipant(t.id, targetP);
                                  }}
                                  className={`w-full text-xs font-semibold py-1 px-2 rounded-lg border outline-none cursor-pointer transition ${
                                    isAssigned
                                      ? isMine
                                        ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 font-bold"
                                        : "bg-neutral-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border-neutral-300 dark:border-neutral-700"
                                      : "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 font-bold"
                                  }`}
                                  title={l("Alterar atribuição individual deste teste", "Change individual assignment of this test")}
                                >
                                  <option value="" className="text-amber-600 font-bold">
                                    ⚪ {l("NÃO ATRIBUÍDO", "UNASSIGNED")}
                                  </option>
                                  {participants.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      👤 {p.name} ({translateUserRole(p.globalRole, language)})
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span
                                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                    t.status === "APROVADO"
                                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                      : t.status === "REPROVADO"
                                      ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                                      : t.status === "EM_EXECUCAO"
                                      ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                                      : "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400"
                                  }`}
                                >
                                  {translateTestStatus(t.status)}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. TAB CONTENT: AUTOMATIC DISTRIBUTION */}
      {activeTab === "AUTO" && (
        <div className="space-y-6 max-w-3xl mx-auto">
          <div
            className={`p-6 rounded-2xl border space-y-5 ${
              darkMode ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-emerald-600 text-white shadow-sm">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-neutral-900 dark:text-white">
                  {l("Distribuição Automática de Testes", "Automatic Test Distribution")}
                </h3>
                <p className="text-xs text-neutral-500">
                  {l(
                    `Distribui os ${totalTests} casos de teste entre os ${totalParticipants} participantes cadastrados com base em regras determinísticas e balanceadas.`,
                    `Distributes all ${totalTests} test cases across the ${totalParticipants} registered participants using deterministic, balanced rules.`
                  )}
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <label className="text-xs font-bold text-neutral-500 uppercase">
                {l("Escolha a Estratégia de Distribuição:", "Choose Distribution Strategy:")}
              </label>

              <div className="grid grid-cols-1 gap-3">
                {/* Strategy 1: Equal Split */}
                <div
                  onClick={() => setAutoStrategy("EQUAL_SPLIT")}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition flex items-start gap-3 ${
                    autoStrategy === "EQUAL_SPLIT"
                      ? "border-emerald-600 bg-emerald-500/10"
                      : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700"
                  }`}
                >
                  <input
                    type="radio"
                    checked={autoStrategy === "EQUAL_SPLIT"}
                    onChange={() => setAutoStrategy("EQUAL_SPLIT")}
                    className="mt-1 text-emerald-600 cursor-pointer"
                  />
                  <div>
                    <h4 className="text-xs font-black text-neutral-900 dark:text-white">
                      {l(
                        "1. Distribuição Equitativa por Quantidade (Rodízio)",
                        "1. Equal Split by Count (Round-Robin)"
                      )}
                    </h4>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {l(
                        `Divide todos os ${totalTests} testes em partes iguais entre os ${totalParticipants} participantes (~${totalParticipants > 0 ? (totalTests / totalParticipants).toFixed(1) : 0} testes por pessoa).`,
                        `Divides all ${totalTests} tests equally among the ${totalParticipants} participants (~${totalParticipants > 0 ? (totalTests / totalParticipants).toFixed(1) : 0} tests per person).`
                      )}
                    </p>
                  </div>
                </div>

                {/* Strategy 2: Category Blocks */}
                <div
                  onClick={() => setAutoStrategy("CATEGORY_BLOCKS")}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition flex items-start gap-3 ${
                    autoStrategy === "CATEGORY_BLOCKS"
                      ? "border-emerald-600 bg-emerald-500/10"
                      : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700"
                  }`}
                >
                  <input
                    type="radio"
                    checked={autoStrategy === "CATEGORY_BLOCKS"}
                    onChange={() => setAutoStrategy("CATEGORY_BLOCKS")}
                    className="mt-1 text-emerald-600 cursor-pointer"
                  />
                  <div>
                    <h4 className="text-xs font-black text-neutral-900 dark:text-white">
                      {l(
                        "2. Distribuição por Blocos de Categorias Temáticas",
                        "2. Distribution by Functional Category Blocks"
                      )}
                    </h4>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {l(
                        "Atribui módulos e categorias completas a cada participante (ex: Autenticação para Paulo, QR Code para Gabriel).",
                        "Assigns complete functional modules and categories to each participant (e.g., Authentication to Paulo, QR Code to Gabriel)."
                      )}
                    </p>
                  </div>
                </div>

                {/* Strategy 3: Unassigned Only */}
                <div
                  onClick={() => setAutoStrategy("UNASSIGNED_ONLY")}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition flex items-start gap-3 ${
                    autoStrategy === "UNASSIGNED_ONLY"
                      ? "border-emerald-600 bg-emerald-500/10"
                      : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700"
                  }`}
                >
                  <input
                    type="radio"
                    checked={autoStrategy === "UNASSIGNED_ONLY"}
                    onChange={() => setAutoStrategy("UNASSIGNED_ONLY")}
                    className="mt-1 text-emerald-600 cursor-pointer"
                  />
                  <div>
                    <h4 className="text-xs font-black text-neutral-900 dark:text-white">
                      {l(
                        `3. Balancear Carga (Apenas Testes Não Atribuídos: ${unassignedCount})`,
                        `3. Balance Workload (Unassigned Tests Only: ${unassignedCount})`
                      )}
                    </h4>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {l(
                        "Mantém as atribuições manuais existentes intactas e distribui apenas os testes pendentes para os participantes com menor carga de trabalho.",
                        "Keeps existing manual assignments intact and distributes only unassigned tests to participants with the lightest workload."
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t dark:border-neutral-800 border-neutral-200 flex items-center justify-between">
              <span className="text-xs text-neutral-500">
                {l(
                  "Ação auditada e registrada na trilha imutável da bateria.",
                  "Audited action recorded in the battery's immutable trail."
                )}
              </span>

              <button
                onClick={handleExecuteAutoDistribution}
                disabled={isProcessing || totalParticipants === 0}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-sm flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                {l("Executar Distribuição Automática", "Run Automatic Distribution")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. TAB CONTENT: PARTICIPANTS OVERVIEW */}
      {activeTab === "OVERVIEW" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {participants.map((p) => {
              const myAssigned = tests.filter(
                (t) =>
                  t.assignedToUserId === p.id ||
                  (t.assignedToEmail && t.assignedToEmail.toLowerCase() === p.email.toLowerCase())
              );
              const count = myAssigned.length;
              const passed = myAssigned.filter((t) => t.status === "APROVADO").length;
              const failed = myAssigned.filter((t) => t.status === "REPROVADO").length;
              const completed = passed + failed;
              const pct = count > 0 ? ((completed / count) * 100).toFixed(0) : "0";

              return (
                <div
                  key={p.id}
                  className={`p-4 rounded-xl border space-y-3 ${
                    darkMode ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-neutral-900 dark:text-white text-sm">{p.name}</h4>
                      <p className="text-xs text-neutral-500">{p.email}</p>
                    </div>
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                        p.globalRole === "ADMIN"
                          ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                          : p.globalRole === "SERVIDOR"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      }`}
                    >
                      {translateUserRole(p.globalRole, language)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-semibold pt-1">
                    <span className="text-neutral-500">{l("Carga de Testes:", "Test Workload:")}</span>
                    <span className="font-bold text-neutral-900 dark:text-white">
                      {count} {count === 1 ? l("caso", "case") : l("casos", "cases")} ({pct}% {l("concluído", "completed")})
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-neutral-200 dark:bg-neutral-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {/* Badges of assigned test IDs */}
                  <div className="pt-2">
                    <div className="text-[10px] font-bold uppercase text-neutral-400 mb-1.5">
                      {l("Casos de Teste Atribuídos:", "Assigned Test Cases:")}
                    </div>
                    {count === 0 ? (
                      <span className="text-xs text-neutral-400 italic">{l("0 testes atribuídos", "0 assigned tests")}</span>
                    ) : (
                      <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
                        {myAssigned.map((t) => (
                          <span
                            key={t.id}
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${
                              t.status === "APROVADO"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : t.status === "REPROVADO"
                                ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                                : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                            }`}
                            title={`${t.title} (${translateTestStatus(t.status)})`}
                          >
                            {t.id}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
