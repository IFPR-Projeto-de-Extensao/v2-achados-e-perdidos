import React, { useState, useEffect, useMemo } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  FileText,
  Download,
  Plus,
  Search,
  Filter,
  Save,
  RefreshCw,
  Eye,
  Edit3,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
  History,
  Check,
  Smartphone,
  Server,
  Zap,
  Globe,
  Database,
  QrCode,
  Bot,
  Bell,
  Lock,
  Cpu,
  Activity,
  AlertCircle,
  HelpCircle,
  ExternalLink,
  ClipboardList,
  Sparkles,
  Users,
  UserCheck,
  Shuffle,
  BarChart3,
  User,
} from "lucide-react";
import {
  TestBatteryExecution,
  TestCaseItem,
  TestStatus,
  TestCategory,
  TestExecutionAuditEntry,
  TestEvidence,
  TestParticipant,
} from "../types";
import {
  STANDARD_TEST_DEFINITIONS,
  INITIAL_TEST_BATTERIES,
  createNewTestBatteryExecution,
  calculateBatterySummary,
  calculateTestDuration,
} from "../data/defaultTestBatteryData";
import { downloadTestBatteryPdf } from "../lib/testBatteryPdfGenerator";
import { useApp } from "../context/AppContext";
import { getTodayDateString, vibrateClick, vibrateSuccess, vibrateWarning, vibrateCritical } from "../lib/utils";
import { collection, doc, getDocs, setDoc, query, orderBy } from "firebase/firestore";
import { db } from "../lib/firebase";
import { ParticipantManagerModal } from "./test-battery/ParticipantManagerModal";
import { TestEvidenceModal } from "./test-battery/TestEvidenceModal";
import { TestCategoryMetricsChart } from "./test-battery/TestCategoryMetricsChart";
import { TestAuditTrailDrawer } from "./test-battery/TestAuditTrailDrawer";
import { TestDistributionSection } from "./test-battery/TestDistributionSection";
import { AddTestCaseModal } from "./test-battery/AddTestCaseModal";

interface TestBatteryManagerViewProps {
  darkMode?: boolean;
  initialTab?: "MATRIX" | "DISTRIBUTION" | "MY_TESTS" | "ANALYTICS";
}

export const TestBatteryManagerView: React.FC<TestBatteryManagerViewProps> = ({
  darkMode,
  initialTab = "MATRIX",
}) => {
  const { currentUser, allUsers, addToast, recordAuditLog } = useApp();

  // Executions state
  const [executions, setExecutions] = useState<TestBatteryExecution[]>(INITIAL_TEST_BATTERIES);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string>(INITIAL_TEST_BATTERIES[0].id);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Active View Tabs
  const [activeMainTab, setActiveMainTab] = useState<"MATRIX" | "DISTRIBUTION" | "MY_TESTS" | "ANALYTICS">(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveMainTab(initialTab);
    }
  }, [initialTab]);

  // Filters & Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedTesterFilter, setSelectedTesterFilter] = useState<string>("ALL");
  const [showCriticalOnly, setShowCriticalOnly] = useState<boolean>(false);
  const [expandedProcedureIds, setExpandedProcedureIds] = useState<Record<string, boolean>>({
    "TEST-CAD-PERSIST-01": true,
    "TEST-CAD-DUP-01": true,
  });

  // Modal states
  const [isNewBatteryModalOpen, setIsNewBatteryModalOpen] = useState(false);
  const [isAddTestCaseModalOpen, setIsAddTestCaseModalOpen] = useState(false);
  const [newBatteryId, setNewBatteryId] = useState("");
  const [newBatteryDate, setNewBatteryDate] = useState(getTodayDateString());
  const [newBatteryStartTime, setNewBatteryStartTime] = useState("09:00");
  const [newBatteryEndTime, setNewBatteryEndTime] = useState("");
  const [newBatteryResponsible, setNewBatteryResponsible] = useState(currentUser?.name || "Administrador TI");
  const [newBatteryEnvironment, setNewBatteryEnvironment] = useState<"Desenvolvimento" | "Homologação" | "Produção">("Produção");
  const [newBatteryVersion, setNewBatteryVersion] = useState("v1.8.4");

  // Participant Modal
  const [isParticipantModalOpen, setIsParticipantModalOpen] = useState(false);

  // Evidence / Test Edit Modal
  const [editingTest, setEditingTest] = useState<TestCaseItem | null>(null);

  // Audit view drawer toggle
  const [showAuditDrawer, setShowAuditDrawer] = useState(false);

  // Load executions from Firestore
  const loadExecutionsFromFirestore = async () => {
    try {
      setIsLoading(true);
      const testCol = collection(db, "test_executions");
      const snap = await getDocs(query(testCol, orderBy("createdAt", "desc")));

      if (!snap.empty) {
        const loaded: TestBatteryExecution[] = [];
        snap.forEach((d) => {
          loaded.push(d.data() as TestBatteryExecution);
        });
        setExecutions(loaded);
        if (loaded.length > 0 && !loaded.some((e) => e.id === selectedExecutionId)) {
          setSelectedExecutionId(loaded[0].id);
        }
      } else {
        // Save initial battery to Firestore for persistence
        await setDoc(doc(db, "test_executions", INITIAL_TEST_BATTERIES[0].id), INITIAL_TEST_BATTERIES[0]);
        setExecutions(INITIAL_TEST_BATTERIES);
      }
    } catch (err) {
      console.warn("Utilizando armazenamento local para baterias de teste:", err);
      setExecutions(INITIAL_TEST_BATTERIES);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadExecutionsFromFirestore();
  }, []);

  // Active execution object
  const activeExecution = useMemo(() => {
    return executions.find((e) => e.id === selectedExecutionId) || executions[0] || INITIAL_TEST_BATTERIES[0];
  }, [executions, selectedExecutionId]);

  // Statistical summary of active execution
  const summary = useMemo(() => {
    return calculateBatterySummary(activeExecution);
  }, [activeExecution]);

  // Filtered test items
  const filteredTests = useMemo(() => {
    if (!activeExecution || !activeExecution.tests) return [];
    const queryStr = searchQuery.toLowerCase().trim();

    return activeExecution.tests.filter((test) => {
      // "MY_TESTS" Tab Mode filter
      if (activeMainTab === "MY_TESTS") {
        const isAssignedToMe =
          (currentUser?.id && test.assignedToUserId === currentUser.id) ||
          (currentUser?.email && test.assignedToEmail?.toLowerCase() === currentUser.email.toLowerCase());
        if (!isAssignedToMe) return false;
      }

      // Tester Filter (when on Matrix tab)
      if (selectedTesterFilter !== "ALL") {
        if (selectedTesterFilter === "UNASSIGNED") {
          if (test.assignedToUserId || test.assignedToEmail) return false;
        } else {
          const matchEmail = test.assignedToEmail?.toLowerCase() === selectedTesterFilter.toLowerCase();
          const matchId = test.assignedToUserId === selectedTesterFilter;
          if (!matchEmail && !matchId) return false;
        }
      }

      // Category filter
      if (selectedCategory !== "ALL" && test.category !== selectedCategory) {
        return false;
      }
      // Status filter
      if (selectedStatus !== "ALL" && test.status !== selectedStatus) {
        return false;
      }
      // Critical filter
      if (showCriticalOnly && !test.isCriticalPersistence) {
        return false;
      }
      // Search query
      if (queryStr) {
        const matchTitle = test.title.toLowerCase().includes(queryStr);
        const matchId = test.id.toLowerCase().includes(queryStr);
        const matchCat = (test.categoryName || "").toLowerCase().includes(queryStr);
        const matchExpected = test.expectedResult.toLowerCase().includes(queryStr);
        const matchObtained = (test.obtainedResult || "").toLowerCase().includes(queryStr);
        const matchObs = (test.observations || "").toLowerCase().includes(queryStr);
        const matchTester = (test.assignedToName || "").toLowerCase().includes(queryStr);
        if (!matchTitle && !matchId && !matchCat && !matchExpected && !matchObtained && !matchObs && !matchTester) {
          return false;
        }
      }
      return true;
    });
  }, [activeExecution, searchQuery, selectedCategory, selectedStatus, selectedTesterFilter, showCriticalOnly, activeMainTab, currentUser]);

  // Toggle procedure steps
  const toggleProcedure = (id: string) => {
    vibrateClick();
    setExpandedProcedureIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Quick Status Update
  const handleQuickStatusChange = async (testId: string, newStatus: TestStatus) => {
    vibrateClick();
    const now = new Date();
    const currentTest = activeExecution.tests.find((t) => t.id === testId);
    if (!currentTest) return;

    const previousStatus = currentTest.status;
    const txId = `tx-status-${activeExecution.id}-${testId}-${Date.now()}`;
    const auditEntry: TestExecutionAuditEntry = {
      id: `audit-${Date.now()}`,
      changedAt: now.toISOString(),
      changedBy: currentUser?.name || "Administrador",
      changedByEmail: currentUser?.email || "",
      changeType: "UPDATE_STATUS",
      description: `Status do teste ${testId} alterado de ${previousStatus} para ${newStatus}.`,
      previousStatus,
      newStatus,
      testId,
      objectId: testId,
      transactionId: txId,
      oldValue: previousStatus,
      newValue: newStatus,
      fieldChanged: "status",
    };

    const updatedTests = activeExecution.tests.map((t) => {
      if (t.id === testId) {
        return {
          ...t,
          status: newStatus,
          executedAt: newStatus !== "NAO_EXECUTADO" ? now.toISOString() : undefined,
          executedBy: newStatus !== "NAO_EXECUTADO" ? currentUser?.name || "Administrador" : undefined,
          obtainedResult:
            newStatus === "APROVADO"
              ? "Comportamento esperado confirmado com persistência validada no backend."
              : newStatus === "REPROVADO"
              ? t.obtainedResult && t.obtainedResult !== "Pendente de validação"
                ? t.obtainedResult
                : "Comportamento divergente do esperado. Necessária correção técnica."
              : t.obtainedResult,
        };
      }
      return t;
    });

    const updatedExecution: TestBatteryExecution = {
      ...activeExecution,
      tests: updatedTests,
      auditTrail: [auditEntry, ...(activeExecution.auditTrail || [])],
      updatedAt: now.toISOString(),
    };

    // Update in local state
    setExecutions((prev) => prev.map((e) => (e.id === updatedExecution.id ? updatedExecution : e)));

    // Persist in Firestore
    try {
      await setDoc(doc(db, "test_executions", updatedExecution.id), updatedExecution);
      vibrateSuccess();

      // Record in immutable audit trail
      recordAuditLog({
        objectId: testId,
        objectType: "TEST_CASE",
        objectTitle: `Caso de Teste #${testId}`,
        action: "TEST_STATUS_CHANGE",
        fieldChanged: "status",
        oldValue: previousStatus,
        newValue: newStatus,
        details: `Execução ${activeExecution.id} (${activeExecution.systemVersion}): Status do caso de teste #${testId} alterado de ${previousStatus} para ${newStatus}.`,
        transactionId: txId,
      }).catch(() => {});
    } catch (err) {
      console.error("Erro ao salvar status no Firestore:", err);
    }
  };

  // Assign individual test to a participant
  const handleAssignTestToTester = async (testId: string, participantId: string) => {
    vibrateClick();
    const now = new Date();
    const p = activeExecution.participants?.find((part) => part.id === participantId);
    const assignedName = p ? p.name : undefined;
    const assignedEmail = p ? p.email : undefined;

    const txId = `tx-assign-${activeExecution.id}-${testId}-${Date.now()}`;
    const auditEntry: TestExecutionAuditEntry = {
      id: `audit-${Date.now()}`,
      changedAt: now.toISOString(),
      changedBy: currentUser?.name || "Administrador",
      changedByEmail: currentUser?.email || "",
      changeType: "ASSIGN_TESTER",
      description: participantId
        ? `Teste #${testId} atribuído ao testador ${assignedName} (${assignedEmail}).`
        : `Atribuição do teste #${testId} foi removida.`,
      testId,
      objectId: testId,
      transactionId: txId,
      oldValue: activeExecution.tests.find((t) => t.id === testId)?.assignedToName || "Sem atribuição",
      newValue: assignedName || "Sem atribuição",
      fieldChanged: "assignedToUserId",
    };

    const updatedTests = activeExecution.tests.map((t) => {
      if (t.id === testId) {
        return {
          ...t,
          assignedToUserId: participantId || undefined,
          assignedToName: assignedName,
          assignedToEmail: assignedEmail,
        };
      }
      return t;
    });

    const updatedExecution: TestBatteryExecution = {
      ...activeExecution,
      tests: updatedTests,
      auditTrail: [auditEntry, ...(activeExecution.auditTrail || [])],
      updatedAt: now.toISOString(),
    };

    setExecutions((prev) => prev.map((e) => (e.id === updatedExecution.id ? updatedExecution : e)));

    try {
      await setDoc(doc(db, "test_executions", updatedExecution.id), updatedExecution);
      vibrateSuccess();
      addToast(
        participantId
          ? `Teste #${testId} atribuído a ${assignedName}!`
          : `Atribuição do teste #${testId} removida.`,
        "info"
      );

      recordAuditLog({
        objectId: testId,
        objectType: "TEST_CASE",
        objectTitle: `Caso de Teste #${testId}`,
        action: "TEST_ASSIGNMENT",
        fieldChanged: "assignedToUserId",
        oldValue: activeExecution.tests.find((t) => t.id === testId)?.assignedToName || "Nenhum",
        newValue: assignedName || "Nenhum",
        details: `Execução ${activeExecution.id}: Teste #${testId} atribuído a ${assignedName || "Ninguém"}.`,
        transactionId: txId,
      }).catch(() => {});
    } catch (err) {
      console.error("Erro ao salvar atribuição no Firestore:", err);
    }
  };

  // Add Participant Handler (Decoupled: Only registers participant with 0 tests)
  const handleAddParticipant = async (participant: TestParticipant) => {
    const now = new Date();
    const existing = activeExecution.participants || [];
    if (existing.some((p) => p.email.toLowerCase() === participant.email.toLowerCase())) {
      addToast(`O participante com e-mail ${participant.email} já está cadastrado nesta bateria.`, "warning");
      return;
    }

    const cleanParticipant: TestParticipant = {
      ...participant,
      assignedCategories: [],
      assignedTestCount: 0,
      completedTestCount: 0,
      passedTestCount: 0,
      failedTestCount: 0,
    };

    const txId = `tx-part-add-${activeExecution.id}-${Date.now()}`;
    const auditEntry: TestExecutionAuditEntry = {
      id: `audit-${Date.now()}`,
      changedAt: now.toISOString(),
      changedBy: currentUser?.name || "Administrador",
      changedByEmail: currentUser?.email || "",
      changeType: "ADD_PARTICIPANT",
      description: `Participante ${cleanParticipant.name} (${cleanParticipant.email}) adicionado como Testador (0 testes atribuídos).`,
      objectId: cleanParticipant.id,
      transactionId: txId,
      oldValue: "NAO_VINCULADO",
      newValue: "TESTADOR_ATIVO",
      fieldChanged: "participants",
    };

    const updatedExecution: TestBatteryExecution = {
      ...activeExecution,
      participants: [...existing, cleanParticipant],
      auditTrail: [auditEntry, ...(activeExecution.auditTrail || [])],
      updatedAt: now.toISOString(),
    };

    setExecutions((prev) => prev.map((e) => (e.id === updatedExecution.id ? updatedExecution : e)));

    try {
      await setDoc(doc(db, "test_executions", updatedExecution.id), updatedExecution);
      addToast("Testador adicionado à bateria com sucesso.", "success");
      addToast("Testes atribuídos: 0", "info");

      recordAuditLog({
        objectId: cleanParticipant.id,
        objectType: "TEST_PARTICIPANT",
        objectTitle: `Participante ${cleanParticipant.name}`,
        action: "ADD_TEST_PARTICIPANT",
        fieldChanged: "participants",
        oldValue: "N/A",
        newValue: `TESTADOR (${cleanParticipant.globalRole})`,
        details: `Bateria ${activeExecution.id}: ${cleanParticipant.name} (${cleanParticipant.email}) vinculado à equipe de testes sem atribuição automática de testes.`,
        transactionId: txId,
      }).catch(() => {});
    } catch (err) {
      console.error("Erro ao salvar participante no Firestore:", err);
    }
  };

  // Add Custom Test Case Handler
  const handleAddCustomTest = async (newTest: TestCaseItem) => {
    const now = new Date();
    const txId = `tx-test-add-${activeExecution.id}-${newTest.id}-${Date.now()}`;
    const auditEntry: TestExecutionAuditEntry = {
      id: `audit-${Date.now()}`,
      changedAt: now.toISOString(),
      changedBy: currentUser?.name || "Administrador",
      changedByEmail: currentUser?.email || "",
      changeType: "ADD_TEST",
      description: `Caso de teste #${newTest.id} ("${newTest.title}") adicionado à bateria.`,
      objectId: newTest.id,
      testId: newTest.id,
      transactionId: txId,
      oldValue: "N/A",
      newValue: newTest.title,
      fieldChanged: "tests",
    };

    const updatedExecution: TestBatteryExecution = {
      ...activeExecution,
      tests: [...(activeExecution.tests || []), newTest],
      auditTrail: [auditEntry, ...(activeExecution.auditTrail || [])],
      updatedAt: now.toISOString(),
    };

    setExecutions((prev) => prev.map((e) => (e.id === updatedExecution.id ? updatedExecution : e)));
    setIsAddTestCaseModalOpen(false);

    try {
      await setDoc(doc(db, "test_executions", updatedExecution.id), updatedExecution);
      vibrateSuccess();
      addToast(`Caso de teste #${newTest.id} cadastrado com sucesso!`, "success");

      recordAuditLog({
        objectId: newTest.id,
        objectType: "TEST_CASE",
        objectTitle: `Caso de Teste #${newTest.id}`,
        action: "ADD_TEST_CASE",
        fieldChanged: "tests",
        oldValue: "N/A",
        newValue: newTest.title,
        details: `Bateria ${activeExecution.id}: Caso de teste #${newTest.id} criado na categoria ${newTest.categoryName}.`,
        transactionId: txId,
      }).catch(() => {});
    } catch (err) {
      console.error("Erro ao salvar teste no Firestore:", err);
    }
  };

  // Full Battery Update Handler (e.g. from Distribution or Bulk Updates)
  const handleUpdateCompleteBattery = async (updated: TestBatteryExecution) => {
    setExecutions((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    try {
      await setDoc(doc(db, "test_executions", updated.id), updated);
    } catch (err) {
      console.error("Erro ao sincronizar bateria no Firestore:", err);
    }
  };

  // Remove Participant Handler
  const handleRemoveParticipant = async (participantId: string) => {
    vibrateClick();
    const now = new Date();
    const removedPart = (activeExecution.participants || []).find((p) => p.id === participantId);
    const remaining = (activeExecution.participants || []).filter((p) => p.id !== participantId);

    const txId = `tx-part-rm-${activeExecution.id}-${Date.now()}`;
    const auditEntry: TestExecutionAuditEntry = {
      id: `audit-${Date.now()}`,
      changedAt: now.toISOString(),
      changedBy: currentUser?.name || "Administrador",
      changedByEmail: currentUser?.email || "",
      changeType: "ADD_PARTICIPANT",
      description: `Participante ${removedPart?.name || participantId} desvinculado da bateria.`,
      objectId: participantId,
      transactionId: txId,
      oldValue: "TESTADOR_ATIVO",
      newValue: "DESVINCULADO",
      fieldChanged: "participants",
    };

    // Unassign tests from this participant
    const updatedTests = (activeExecution.tests || []).map((t) => {
      if (t.assignedToUserId === participantId || t.assignedToEmail === removedPart?.email) {
        return {
          ...t,
          assignedToUserId: undefined,
          assignedToName: undefined,
          assignedToEmail: undefined,
        };
      }
      return t;
    });

    const updatedExecution: TestBatteryExecution = {
      ...activeExecution,
      participants: remaining,
      tests: updatedTests,
      auditTrail: [auditEntry, ...(activeExecution.auditTrail || [])],
      updatedAt: now.toISOString(),
    };

    setExecutions((prev) => prev.map((e) => (e.id === updatedExecution.id ? updatedExecution : e)));

    try {
      await setDoc(doc(db, "test_executions", updatedExecution.id), updatedExecution);
      vibrateSuccess();
      addToast(`Participante desvinculado com sucesso.`, "info");
    } catch (err) {
      console.error("Erro ao remover participante no Firestore:", err);
    }
  };

  // Auto Distribute Tests among all participants
  const handleAutoDistributeTests = async () => {
    const participants = activeExecution.participants || [];
    if (participants.length === 0) {
      addToast("Adicione pelo menos um participante antes de distribuir os testes.", "warning");
      return;
    }

    vibrateClick();
    const now = new Date();
    const tests = [...(activeExecution.tests || [])];

    // Round-robin distribution
    const updatedTests = tests.map((t, idx) => {
      const assignedParticipant = participants[idx % participants.length];
      return {
        ...t,
        assignedToUserId: assignedParticipant.id,
        assignedToName: assignedParticipant.name,
        assignedToEmail: assignedParticipant.email,
      };
    });

    const txId = `tx-auto-dist-${activeExecution.id}-${Date.now()}`;
    const auditEntry: TestExecutionAuditEntry = {
      id: `audit-${Date.now()}`,
      changedAt: now.toISOString(),
      changedBy: currentUser?.name || "Administrador",
      changedByEmail: currentUser?.email || "",
      changeType: "AUTO_DISTRIBUTE",
      description: `Distribuição automática balanceada de ${tests.length} casos de teste entre ${participants.length} participantes.`,
      objectId: activeExecution.id,
      transactionId: txId,
      fieldChanged: "tests_distribution",
      oldValue: "DISTRIBUICAO_ANTERIOR",
      newValue: "DISTRIBUICAO_EQUILIBRADA",
    };

    const updatedExecution: TestBatteryExecution = {
      ...activeExecution,
      tests: updatedTests,
      auditTrail: [auditEntry, ...(activeExecution.auditTrail || [])],
      updatedAt: now.toISOString(),
    };

    setExecutions((prev) => prev.map((e) => (e.id === updatedExecution.id ? updatedExecution : e)));
    setIsParticipantModalOpen(false);

    try {
      await setDoc(doc(db, "test_executions", updatedExecution.id), updatedExecution);
      vibrateSuccess();
      addToast(`Distribuição automática concluída! ${tests.length} testes distribuídos com sucesso.`, "success");

      recordAuditLog({
        objectId: activeExecution.id,
        objectType: "TEST_BATTERY",
        objectTitle: `Bateria #${activeExecution.id}`,
        action: "AUTO_DISTRIBUTE_TESTS",
        fieldChanged: "tests_distribution",
        details: `Bateria ${activeExecution.id}: Distribuição automática de ${tests.length} testes entre ${participants.length} testadores.`,
        transactionId: txId,
      }).catch(() => {});
    } catch (err) {
      console.error("Erro ao salvar distribuição no Firestore:", err);
    }
  };

  // Save Detailed Test Evidence
  const handleSaveTestEvidence = async (
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
  ) => {
    vibrateClick();
    const now = new Date();
    const currentTest = activeExecution.tests.find((t) => t.id === testId);
    if (!currentTest) return;

    const txId = evidence.transactionId || `tx-evidence-${activeExecution.id}-${testId}-${Date.now()}`;
    const auditEntry: TestExecutionAuditEntry = {
      id: `audit-${Date.now()}`,
      changedAt: now.toISOString(),
      changedBy: currentUser?.name || "Administrador",
      changedByEmail: currentUser?.email || "",
      changeType: "UPDATE_DETAILS",
      description: `Evidências e resultado obtido do teste #${testId} atualizados. Status: ${status}.`,
      testId,
      objectId: testId,
      transactionId: txId,
      oldValue: currentTest.obtainedResult || "Sem resultado",
      newValue: obtainedResult || "Atualizado",
      fieldChanged: "evidence_and_results",
    };

    const updatedTests = activeExecution.tests.map((t) => {
      if (t.id === testId) {
        return {
          ...t,
          status,
          obtainedResult: obtainedResult || t.obtainedResult,
          observations: observations || t.observations,
          evidence: evidence as TestEvidence,
          executedAt: t.executedAt || now.toISOString(),
          executedBy: t.executedBy || currentUser?.name || "Administrador",
          assignedToUserId: assignedToUserId || t.assignedToUserId,
          assignedToName: assignedToName || t.assignedToName,
          assignedToEmail: assignedToEmail || t.assignedToEmail,
        };
      }
      return t;
    });

    const updatedExecution: TestBatteryExecution = {
      ...activeExecution,
      tests: updatedTests,
      auditTrail: [auditEntry, ...(activeExecution.auditTrail || [])],
      updatedAt: now.toISOString(),
    };

    setExecutions((prev) => prev.map((e) => (e.id === updatedExecution.id ? updatedExecution : e)));
    setEditingTest(null);

    try {
      await setDoc(doc(db, "test_executions", updatedExecution.id), updatedExecution);
      vibrateSuccess();
      addToast(`Evidências do teste #${testId} salvas com sucesso!`, "success");

      recordAuditLog({
        objectId: testId,
        objectType: "TEST_CASE",
        objectTitle: `Caso de Teste #${testId}`,
        action: "TEST_EVIDENCE_UPDATE",
        fieldChanged: "evidencias_e_resultado",
        oldValue: currentTest.obtainedResult || "Sem resultado",
        newValue: obtainedResult || "Evidências anexadas",
        details: `Execução ${activeExecution.id}: Evidências e resultado obtido do teste #${testId} atualizados. Status: ${status}.`,
        transactionId: txId,
      }).catch(() => {});
    } catch (err) {
      console.error("Erro ao salvar evidências no Firestore:", err);
      addToast("Erro ao persistir no Firestore. Dados salvos localmente.", "warning");
    }
  };

  // Update Execution Metadata (Header Fields)
  const handleUpdateExecutionMetadata = async (field: keyof TestBatteryExecution, value: any) => {
    const now = new Date();
    const updatedExecution: TestBatteryExecution = {
      ...activeExecution,
      [field]: value,
      updatedAt: now.toISOString(),
    };

    setExecutions((prev) => prev.map((e) => (e.id === updatedExecution.id ? updatedExecution : e)));

    try {
      await setDoc(doc(db, "test_executions", updatedExecution.id), updatedExecution);
    } catch (err) {
      console.warn("Erro ao salvar metadados no Firestore:", err);
    }
  };

  // Create New Battery Execution
  const handleOpenNewBatteryModal = () => {
    vibrateClick();
    const nextNum = executions.length + 1;
    const autoId = `BT-2026-${String(nextNum).padStart(3, "0")}`;
    setNewBatteryId(autoId);
    setNewBatteryDate(getTodayDateString());
    setNewBatteryStartTime("09:00");
    setNewBatteryEndTime("");
    setNewBatteryResponsible(currentUser?.name || "Administrador TI");
    setNewBatteryEnvironment("Produção");
    setNewBatteryVersion("v1.8.3");
    setIsNewBatteryModalOpen(true);
  };

  const handleConfirmCreateBattery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBatteryId.trim()) {
      addToast("O identificador da execução é obrigatório.", "error");
      return;
    }

    if (executions.some((ex) => ex.id.toUpperCase() === newBatteryId.trim().toUpperCase())) {
      addToast(`Já existe uma execução cadastrada com o identificador ${newBatteryId}. Escolha outro ID.`, "error");
      return;
    }

    vibrateClick();
    const newBattery = createNewTestBatteryExecution(
      newBatteryId.trim().toUpperCase(),
      newBatteryResponsible.trim(),
      currentUser?.email || "",
      newBatteryEnvironment,
      newBatteryVersion.trim()
    );

    newBattery.testDate = newBatteryDate;
    newBattery.startTime = newBatteryStartTime;
    newBattery.endTime = newBatteryEndTime;

    const updatedList = [newBattery, ...executions];
    setExecutions(updatedList);
    setSelectedExecutionId(newBattery.id);
    setIsNewBatteryModalOpen(false);

    try {
      await setDoc(doc(db, "test_executions", newBattery.id), newBattery);
      vibrateSuccess();
      addToast(`Bateria de testes ${newBattery.id} criada com sucesso!`, "success");

      recordAuditLog({
        objectId: newBattery.id,
        objectType: "TEST_BATTERY",
        objectTitle: `Bateria de Testes ${newBattery.id} (${newBattery.systemVersion})`,
        action: "CREATE_TEST_BATTERY",
        fieldChanged: "status_bateria",
        oldValue: "NAO_EXISTENTE",
        newValue: newBattery.overallStatus,
        details: `Nova execução de bateria #${newBattery.id} criada para a versão ${newBattery.systemVersion} no ambiente ${newBattery.environment} com ${newBattery.tests.length} casos de teste (Responsável: ${newBattery.responsible}).`,
        transactionId: `TX-BAT-${newBattery.id}`,
      }).catch(() => {});
    } catch (err) {
      console.error("Erro ao salvar nova bateria no Firestore:", err);
      addToast("Bateria criada em sessão local. Erro de persistência no Firestore.", "warning");
    }
  };

  // Export PDF of the active battery
  const handleExportBatteryPdf = () => {
    try {
      vibrateClick();
      const protocol = downloadTestBatteryPdf(activeExecution);
      vibrateSuccess();
      addToast(`Relatório oficial da bateria ${activeExecution.id} baixado com sucesso! Protocolo: ${protocol}`, "success");
    } catch (err) {
      console.error("Erro ao gerar PDF da bateria:", err);
      addToast("Não foi possível gerar o PDF da bateria. Tente novamente.", "error");
    }
  };

  const getCategoryIcon = (category: TestCategory) => {
    switch (category) {
      case "AUTENTICACAO":
        return <Lock className="w-4 h-4 text-amber-500" />;
      case "CADASTRO":
        return <Database className="w-4 h-4 text-emerald-500" />;
      case "ACHADOS_PERDIDOS":
        return <ClipboardList className="w-4 h-4 text-blue-500" />;
      case "REIVINDICACOES":
        return <ShieldCheck className="w-4 h-4 text-indigo-500" />;
      case "QR_CODE":
        return <QrCode className="w-4 h-4 text-teal-500" />;
      case "IA_GEMINI":
        return <Bot className="w-4 h-4 text-purple-500" />;
      case "PWA_MOBILE":
        return <Smartphone className="w-4 h-4 text-rose-500" />;
      case "DOCUMENTOS":
        return <FileText className="w-4 h-4 text-emerald-600" />;
      case "NOTIFICACOES":
        return <Bell className="w-4 h-4 text-orange-500" />;
      case "SEGURANCA":
        return <ShieldCheck className="w-4 h-4 text-red-500" />;
      case "APIS_PRODUCAO":
        return <Server className="w-4 h-4 text-cyan-500" />;
      case "MONITORAMENTO":
        return <Activity className="w-4 h-4 text-emerald-400" />;
      default:
        return <Cpu className="w-4 h-4 text-neutral-500" />;
    }
  };

  const participants = activeExecution.participants || [];
  const myAssignedCount = useMemo(() => {
    if (!currentUser) return 0;
    return (activeExecution.tests || []).filter(
      (t) =>
        t.assignedToUserId === currentUser.id ||
        (currentUser.email && t.assignedToEmail?.toLowerCase() === currentUser.email.toLowerCase())
    ).length;
  }, [activeExecution, currentUser]);

  return (
    <div id="test-battery-manager-container" className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-4">
      {/* 1. Header & Institutional Banner */}
      <div
        id="test-battery-header-card"
        className={`p-6 rounded-2xl border shadow-sm ${
          darkMode ? "bg-neutral-900/90 border-neutral-800 text-white" : "bg-white border-neutral-200 text-neutral-900"
        }`}
      >
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                Governança & QA Oficial
              </span>
              <span className="text-xs font-semibold text-neutral-500">IFPR Campus Ivaiporã</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-2.5">
              <ShieldCheck className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
              Bateria de Testes, Participantes & Validação
            </h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-3xl">
              Registro formal e independente de baterias de testes periódicas, delegação para testadores (discentes e servidores), auditoria de ciclo de vida e matriz de validação.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            <button
              id="btn-manage-participants"
              onClick={() => {
                vibrateClick();
                setIsParticipantModalOpen(true);
              }}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs sm:text-sm font-bold rounded-xl shadow-sm transition"
            >
              <Users className="w-4 h-4" />
              Equipe ({participants.length})
            </button>
            <button
              id="btn-new-test-battery"
              onClick={handleOpenNewBatteryModal}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs sm:text-sm font-bold rounded-xl shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              Nova Execução
            </button>
            <button
              id="btn-export-battery-pdf"
              onClick={handleExportBatteryPdf}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl border shadow-sm transition active:scale-95 ${
                darkMode
                  ? "bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200"
                  : "bg-neutral-50 hover:bg-neutral-100 border-neutral-300 text-neutral-800"
              }`}
            >
              <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Exportar PDF Oficial
            </button>
            <button
              id="btn-toggle-audit-trail"
              onClick={() => {
                vibrateClick();
                setShowAuditDrawer(true);
              }}
              className={`flex items-center justify-center p-2.5 text-sm font-semibold rounded-xl border transition ${
                darkMode
                  ? "bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300"
                  : "bg-neutral-50 hover:bg-neutral-100 border-neutral-300 text-neutral-700"
              }`}
              title="Ver Trilha de Auditoria"
            >
              <History className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Critical Persistence Warning Banner */}
      <div
        id="critical-persistence-mandate-banner"
        className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 text-amber-950 dark:text-amber-200 space-y-2"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
          <h2 className="text-sm font-extrabold uppercase tracking-wide">
            Diretriz Crítica de Persistência Real de Dados (RNF-04 & Governança)
          </h2>
        </div>
        <p className="text-xs sm:text-sm leading-relaxed font-medium">
          «Uma operação somente poderá ser considerada concluída com sucesso após confirmação de persistência dos dados no backend/banco de dados. A existência temporária de dados no frontend, cache, estado React, IndexedDB ou interface visual não constitui confirmação de cadastro.»
        </p>
        <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-amber-800 dark:text-amber-300">
          <span className="flex items-center gap-1.5 font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Dados no Firestore = Cadastro Confirmado
          </span>
          <span className="flex items-center gap-1.5 font-bold">
            <Clock className="w-4 h-4 text-amber-600" />
            Dados em Cache/PWA = Aguardando Sincronização
          </span>
        </div>
      </div>

      {/* 3. Execution Selector Bar (Tabs) */}
      <div
        id="execution-selector-bar"
        className={`p-4 rounded-2xl border shadow-sm space-y-3 ${
          darkMode ? "bg-neutral-900/90 border-neutral-800" : "bg-white border-neutral-200"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-neutral-500 uppercase tracking-wider">
            <Layers className="w-4 h-4 text-emerald-500" />
            Histórico de Baterias Executadas ({executions.length})
          </div>
          <button
            onClick={loadExecutionsFromFirestore}
            disabled={isLoading}
            className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Sincronizar
          </button>
        </div>

        <div className="flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-thin">
          {executions.map((exec) => {
            const isSelected = exec.id === activeExecution.id;
            const execSummary = calculateBatterySummary(exec);
            return (
              <button
                key={exec.id}
                id={`btn-select-exec-${exec.id}`}
                onClick={() => {
                  vibrateClick();
                  setSelectedExecutionId(exec.id);
                }}
                className={`shrink-0 flex flex-col text-left px-4 py-3 rounded-xl border transition-all ${
                  isSelected
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-md scale-[1.02]"
                    : darkMode
                    ? "bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border-neutral-700"
                    : "bg-neutral-50 hover:bg-neutral-100 text-neutral-800 border-neutral-200"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-extrabold text-sm tracking-tight">{exec.id}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isSelected
                        ? "bg-white/20 text-white"
                        : exec.overallStatus === "CONCLUIDO"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    }`}
                  >
                    {exec.overallStatus}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs mt-1 opacity-90">
                  <span>{exec.testDate || "Data não inf."}</span>
                  <span>•</span>
                  <span>{exec.systemVersion}</span>
                  <span>•</span>
                  <span className="font-bold">{execSummary.passRate}% Aprov.</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Active Execution Parameters & Metadata Card */}
      <div
        id="active-execution-metadata-card"
        className={`p-6 rounded-2xl border shadow-sm space-y-4 ${
          darkMode ? "bg-neutral-900/90 border-neutral-800 text-white" : "bg-white border-neutral-200 text-neutral-900"
        }`}
      >
        <div className="flex items-center justify-between border-b pb-3 dark:border-neutral-800 border-neutral-200">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-500" />
            <h2 className="font-bold text-lg">Parâmetros & Metadados da Execução ({activeExecution.id})</h2>
          </div>
          <span className="text-xs text-neutral-500 font-mono">ID: {activeExecution.id}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {/* Data */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-neutral-500 uppercase">Data do Teste</label>
            <input
              type="date"
              id="input-exec-date"
              value={activeExecution.testDate || ""}
              onChange={(e) => handleUpdateExecutionMetadata("testDate", e.target.value)}
              className={`w-full text-xs font-semibold px-3 py-2 rounded-xl border focus:ring-2 focus:ring-emerald-500 outline-none ${
                darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
              }`}
            />
          </div>

          {/* Hora de Início */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-neutral-500 uppercase">Hora de Início</label>
            <input
              type="time"
              id="input-exec-start-time"
              value={activeExecution.startTime || ""}
              onChange={(e) => handleUpdateExecutionMetadata("startTime", e.target.value)}
              className={`w-full text-xs font-semibold px-3 py-2 rounded-xl border focus:ring-2 focus:ring-emerald-500 outline-none ${
                darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
              }`}
            />
          </div>

          {/* Hora de Término */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-neutral-500 uppercase">Hora de Término</label>
            <input
              type="time"
              id="input-exec-end-time"
              value={activeExecution.endTime || ""}
              onChange={(e) => handleUpdateExecutionMetadata("endTime", e.target.value)}
              className={`w-full text-xs font-semibold px-3 py-2 rounded-xl border focus:ring-2 focus:ring-emerald-500 outline-none ${
                darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
              }`}
            />
          </div>

          {/* Duração Calculada */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-neutral-500 uppercase">Duração Calculada</label>
            <div
              className={`w-full text-xs font-bold px-3 py-2 rounded-xl border flex items-center justify-between ${
                darkMode ? "bg-neutral-800/60 border-neutral-700 text-emerald-400" : "bg-emerald-50/60 border-emerald-200 text-emerald-800"
              }`}
            >
              <span>{summary.duration}</span>
              <Clock className="w-3.5 h-3.5 text-emerald-500" />
            </div>
          </div>

          {/* Ambiente */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-neutral-500 uppercase">Ambiente</label>
            <select
              id="select-exec-environment"
              value={activeExecution.environment || "Homologação"}
              onChange={(e) => handleUpdateExecutionMetadata("environment", e.target.value)}
              className={`w-full text-xs font-semibold px-3 py-2 rounded-xl border focus:ring-2 focus:ring-emerald-500 outline-none ${
                darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
              }`}
            >
              <option value="Desenvolvimento">Desenvolvimento</option>
              <option value="Homologação">Homologação</option>
              <option value="Produção">Produção</option>
            </select>
          </div>

          {/* Versão */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-neutral-500 uppercase">Versão Testada</label>
            <input
              type="text"
              id="input-exec-version"
              value={activeExecution.systemVersion || ""}
              onChange={(e) => handleUpdateExecutionMetadata("systemVersion", e.target.value)}
              className={`w-full text-xs font-semibold px-3 py-2 rounded-xl border focus:ring-2 focus:ring-emerald-500 outline-none ${
                darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
              }`}
            />
          </div>
        </div>
      </div>

      {/* 5. Navigation Tabs for View Modes */}
      <div className="flex items-center gap-2 border-b dark:border-neutral-800 border-neutral-200 pb-2 overflow-x-auto">
        <button
          id="tab-view-matrix"
          onClick={() => {
            vibrateClick();
            setActiveMainTab("MATRIX");
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition ${
            activeMainTab === "MATRIX"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          }`}
        >
          <Layers className="w-4 h-4" />
          Matriz Completa ({activeExecution.tests?.length || 0})
        </button>

        <button
          id="tab-view-distribution"
          onClick={() => {
            vibrateClick();
            setActiveMainTab("DISTRIBUTION");
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition ${
            activeMainTab === "DISTRIBUTION"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          }`}
        >
          <Shuffle className="w-4 h-4" />
          Distribuição de Testes
        </button>

        <button
          id="tab-view-my-tests"
          onClick={() => {
            vibrateClick();
            setActiveMainTab("MY_TESTS");
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition ${
            activeMainTab === "MY_TESTS"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          }`}
        >
          <UserCheck className="w-4 h-4" />
          Meus Testes Atribuídos ({myAssignedCount})
        </button>

        <button
          id="tab-view-analytics"
          onClick={() => {
            vibrateClick();
            setActiveMainTab("ANALYTICS");
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition ${
            activeMainTab === "ANALYTICS"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Painel de Métricas & Desempenho
        </button>
      </div>

      {/* 6. Active Tab Content */}
      {activeMainTab === "DISTRIBUTION" ? (
        <TestDistributionSection
          battery={activeExecution}
          onUpdateBattery={handleUpdateCompleteBattery}
          onOpenAddParticipantModal={() => setIsParticipantModalOpen(true)}
          currentUserEmail={currentUser?.email}
          currentUserName={currentUser?.name}
          darkMode={darkMode}
        />
      ) : activeMainTab === "ANALYTICS" ? (
        <TestCategoryMetricsChart
          battery={activeExecution}
          darkMode={darkMode}
          onFilterByCategory={(cat) => {
            setSelectedCategory(cat);
            setActiveMainTab("MATRIX");
          }}
          onFilterByTester={(email) => {
            setSelectedTesterFilter(email);
            setActiveMainTab("MATRIX");
          }}
        />
      ) : (
        <div className="space-y-4">
          {/* Test Matrix Filters & Search */}
          <div
            id="test-matrix-filters-bar"
            className={`p-4 rounded-2xl border shadow-sm space-y-3 ${
              darkMode ? "bg-neutral-900/90 border-neutral-800" : "bg-white border-neutral-200"
            }`}
          >
            <div className="flex flex-col md:flex-row items-center justify-between gap-3">
              {/* Search Input */}
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  id="input-search-tests"
                  placeholder="Buscar por ID, título, testador ou área..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                    darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                  }`}
                />
              </div>

              {/* Filter Selects & Actions */}
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                {/* Select Category */}
                <select
                  id="select-filter-category"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className={`text-xs font-semibold px-3 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                    darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                  }`}
                >
                  <option value="ALL">Todas as Áreas (12 Categorias)</option>
                  <option value="AUTENTICACAO">Autenticação</option>
                  <option value="CADASTRO">Cadastro & Persistência</option>
                  <option value="ACHADOS_PERDIDOS">Achados e Perdidos</option>
                  <option value="REIVINDICACOES">Reivindicações</option>
                  <option value="QR_CODE">QR Code</option>
                  <option value="IA_GEMINI">Inteligência Artificial</option>
                  <option value="PWA_MOBILE">PWA / Mobile</option>
                  <option value="DOCUMENTOS">Documentos</option>
                  <option value="NOTIFICACOES">Notificações</option>
                  <option value="SEGURANCA">Segurança</option>
                  <option value="APIS_PRODUCAO">APIs / Produção</option>
                  <option value="MONITORAMENTO">Monitoramento</option>
                </select>

                {/* Select Status */}
                <select
                  id="select-filter-status"
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className={`text-xs font-semibold px-3 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                    darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                  }`}
                >
                  <option value="ALL">Todos os Status</option>
                  <option value="APROVADO">Aprovados</option>
                  <option value="REPROVADO">Reprovados</option>
                  <option value="NAO_EXECUTADO">Não Executados</option>
                  <option value="PENDENTE">Pendentes</option>
                  <option value="BLOQUEADO">Bloqueados</option>
                </select>

                {/* Select Tester Filter (if on full matrix) */}
                {activeMainTab === "MATRIX" && (
                  <select
                    id="select-filter-tester"
                    value={selectedTesterFilter}
                    onChange={(e) => setSelectedTesterFilter(e.target.value)}
                    className={`text-xs font-semibold px-3 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                      darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                    }`}
                  >
                    <option value="ALL">Todos os Testadores</option>
                    <option value="UNASSIGNED">Não Atribuídos</option>
                    {participants.map((p) => (
                      <option key={p.id} value={p.email}>
                        {p.name} ({p.globalRole})
                      </option>
                    ))}
                  </select>
                )}

                {/* Critical Only Toggle */}
                <button
                  id="btn-filter-critical-only"
                  onClick={() => {
                    vibrateClick();
                    setShowCriticalOnly(!showCriticalOnly);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border transition ${
                    showCriticalOnly
                      ? "bg-amber-600 text-white border-amber-600"
                      : darkMode
                      ? "bg-neutral-800 border-neutral-700 text-neutral-300"
                      : "bg-neutral-50 border-neutral-300 text-neutral-700"
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Persistência Crítica
                </button>

                {/* New Test Case Button */}
                <button
                  id="btn-open-add-test-modal"
                  onClick={() => {
                    vibrateClick();
                    setIsAddTestCaseModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white shadow-sm transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Novo Caso de Teste
                </button>
              </div>
            </div>
          </div>

          {/* Test Matrix List */}
          <div id="test-matrix-list-container" className="space-y-3">
            {filteredTests.length === 0 ? (
              <div
                className={`p-12 text-center rounded-2xl border ${
                  darkMode ? "bg-neutral-900 border-neutral-800 text-neutral-400" : "bg-white border-neutral-200 text-neutral-500"
                }`}
              >
                <ShieldCheck className="w-12 h-12 mx-auto text-neutral-400 mb-3" />
                <p className="font-bold text-base">
                  {activeMainTab === "MY_TESTS"
                    ? "Você foi adicionado à bateria, mas ainda não possui testes atribuídos."
                    : "Nenhum teste encontrado para os filtros selecionados."}
                </p>
                <p className="text-xs mt-1">
                  {activeMainTab === "MY_TESTS"
                    ? "Aguarde a distribuição de casos de teste pelo administrador ou consulte a Matriz Completa."
                    : "Ajuste o termo de pesquisa ou os filtros de categoria/status."}
                </p>
              </div>
            ) : (
              filteredTests.map((test) => {
                const isExpanded = expandedProcedureIds[test.id];
                return (
                  <div
                    key={test.id}
                    id={`test-card-${test.id}`}
                    className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                      test.isCriticalPersistence
                        ? "border-amber-500/40 bg-amber-500/[0.02]"
                        : darkMode
                        ? "bg-neutral-900/90 border-neutral-800"
                        : "bg-white border-neutral-200"
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                      {/* Test Info */}
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-neutral-700">
                            {test.id}
                          </span>
                          <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                            {getCategoryIcon(test.category)}
                            {test.categoryName || test.category}
                          </span>
                          {test.isCriticalPersistence && (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                              ★ TESTE CRÍTICO DE PERSISTÊNCIA (RNF-04)
                            </span>
                          )}

                          {/* Tester Badge */}
                          {test.assignedToName ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 flex items-center gap-1">
                              <User className="w-3 h-3" />
                              Testador: {test.assignedToName}
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-200/60 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400">
                              Sem atribuição
                            </span>
                          )}
                        </div>

                        <h3 className="font-bold text-base text-neutral-900 dark:text-white">{test.title}</h3>

                        <div className="text-xs space-y-1 text-neutral-600 dark:text-neutral-400">
                          <p>
                            <strong className="text-neutral-700 dark:text-neutral-300">Resultado Esperado:</strong>{" "}
                            {test.expectedResult}
                          </p>
                          {test.obtainedResult && (
                            <p>
                              <strong className="text-neutral-700 dark:text-neutral-300">Resultado Obtido:</strong>{" "}
                              <span
                                className={
                                  test.status === "APROVADO"
                                    ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                                    : test.status === "REPROVADO"
                                    ? "text-rose-600 dark:text-rose-400 font-semibold"
                                    : ""
                                }
                              >
                                {test.obtainedResult}
                              </span>
                            </p>
                          )}
                          {test.evidence?.recordId && (
                            <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                              <strong>ID do Registro Backend:</strong> {test.evidence.recordId}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Actions & Status Selector */}
                      <div className="flex flex-wrap lg:flex-nowrap items-center gap-2 shrink-0">
                        {/* Inline Tester Assignment Select */}
                        <select
                          value={test.assignedToUserId || ""}
                          onChange={(e) => handleAssignTestToTester(test.id, e.target.value)}
                          className={`text-xs font-semibold px-2 py-1.5 rounded-xl border outline-none max-w-[140px] truncate ${
                            darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-white border-neutral-300 text-neutral-900"
                          }`}
                          title="Atribuir caso de teste a um participante"
                        >
                          <option value="">Atribuir a...</option>
                          {participants.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>

                        {/* Status Buttons */}
                        <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl border dark:border-neutral-700 border-neutral-200">
                          <button
                            onClick={() => handleQuickStatusChange(test.id, "APROVADO")}
                            className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition ${
                              test.status === "APROVADO"
                                ? "bg-emerald-600 text-white shadow-sm"
                                : "text-neutral-600 hover:text-emerald-600 dark:text-neutral-300"
                            }`}
                            title="Marcar como Aprovado"
                          >
                            Aprovado
                          </button>
                          <button
                            onClick={() => handleQuickStatusChange(test.id, "REPROVADO")}
                            className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition ${
                              test.status === "REPROVADO"
                                ? "bg-rose-600 text-white shadow-sm"
                                : "text-neutral-600 hover:text-rose-600 dark:text-neutral-300"
                            }`}
                            title="Marcar como Reprovado"
                          >
                            Reprovado
                          </button>
                          <button
                            onClick={() => handleQuickStatusChange(test.id, "PENDENTE")}
                            className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition ${
                              test.status === "PENDENTE"
                                ? "bg-amber-600 text-white shadow-sm"
                                : "text-neutral-600 hover:text-amber-600 dark:text-neutral-300"
                            }`}
                            title="Marcar como Pendente"
                          >
                            Pendente
                          </button>
                          <button
                            onClick={() => handleQuickStatusChange(test.id, "NAO_EXECUTADO")}
                            className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition ${
                              test.status === "NAO_EXECUTADO"
                                ? "bg-neutral-600 text-white shadow-sm"
                                : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400"
                            }`}
                            title="Marcar como Não Executado"
                          >
                            Não Exec.
                          </button>
                        </div>

                        {/* Details & Evidence Button */}
                        <button
                          onClick={() => {
                            vibrateClick();
                            setEditingTest(test);
                          }}
                          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border transition ${
                            darkMode
                              ? "bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200"
                              : "bg-neutral-50 hover:bg-neutral-100 border-neutral-300 text-neutral-800"
                          }`}
                          title="Registrar Evidência ou Observação"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-emerald-500" />
                          Evidências
                        </button>

                        {/* Toggle Procedure */}
                        {(test.procedureSteps || test.procedure) && (test.procedureSteps || test.procedure)!.length > 0 && (
                          <button
                            onClick={() => toggleProcedure(test.id)}
                            className={`p-2 text-xs font-bold rounded-xl border transition ${
                              darkMode
                                ? "bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300"
                                : "bg-neutral-50 hover:bg-neutral-100 border-neutral-300 text-neutral-700"
                            }`}
                            title="Ver passos do procedimento de teste"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded Procedure Checklist */}
                    {isExpanded && (test.procedureSteps || test.procedure) && (test.procedureSteps || test.procedure)!.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 p-3.5 rounded-xl space-y-2">
                        <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide flex items-center gap-1.5">
                          <ClipboardList className="w-3.5 h-3.5 text-emerald-500" />
                          Procedimento Oficial de Execução (Passo a Passo)
                        </span>
                        <ul className="space-y-1.5 text-xs text-neutral-600 dark:text-neutral-400 pl-1">
                          {(test.procedureSteps || test.procedure)!.map((step, sIdx) => (
                            <li key={sIdx} className="flex items-start gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                              <span>{step}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 7. Participants Management Modal */}
      <ParticipantManagerModal
        isOpen={isParticipantModalOpen}
        onClose={() => setIsParticipantModalOpen(false)}
        battery={activeExecution}
        allUsers={allUsers}
        onAddParticipant={handleAddParticipant}
        onRemoveParticipant={handleRemoveParticipant}
        onNavigateToDistribution={() => {
          setIsParticipantModalOpen(false);
          setActiveMainTab("DISTRIBUTION");
        }}
        darkMode={darkMode}
      />

      {/* 7.1 Add Custom Test Case Modal */}
      <AddTestCaseModal
        isOpen={isAddTestCaseModalOpen}
        onClose={() => setIsAddTestCaseModalOpen(false)}
        existingTestCount={activeExecution.tests?.length || 0}
        onAddTest={handleAddCustomTest}
        darkMode={darkMode}
      />

      {/* 8. Detailed Test Evidence & Result Modal */}
      <TestEvidenceModal
        isOpen={!!editingTest}
        onClose={() => setEditingTest(null)}
        test={editingTest}
        battery={activeExecution}
        currentUser={currentUser}
        onSave={handleSaveTestEvidence}
        darkMode={darkMode}
      />

      {/* 9. Audit Trail Drawer */}
      <TestAuditTrailDrawer
        isOpen={showAuditDrawer}
        onClose={() => setShowAuditDrawer(false)}
        battery={activeExecution}
        darkMode={darkMode}
      />

      {/* 10. New Test Battery Modal */}
      {isNewBatteryModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmCreateBattery}
            className={`w-full max-w-lg p-6 rounded-2xl border shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto ${
              darkMode ? "bg-neutral-900 border-neutral-800 text-white" : "bg-white border-neutral-200 text-neutral-900"
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-500" />
                <h3 className="font-bold text-base">Nova Execução de Bateria de Testes</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewBatteryModalOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1 sm:col-span-2">
                <label className="font-bold text-neutral-500 uppercase">Identificador da Bateria (ID Único)</label>
                <input
                  type="text"
                  required
                  value={newBatteryId}
                  onChange={(e) => setNewBatteryId(e.target.value.toUpperCase())}
                  placeholder="Ex: BT-2026-002"
                  className={`w-full p-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 font-bold ${
                    darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-neutral-500 uppercase">Data do Teste</label>
                <input
                  type="date"
                  required
                  value={newBatteryDate}
                  onChange={(e) => setNewBatteryDate(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                    darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-neutral-500 uppercase">Hora de Início</label>
                <input
                  type="time"
                  required
                  value={newBatteryStartTime}
                  onChange={(e) => setNewBatteryStartTime(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                    darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-neutral-500 uppercase">Hora de Término (Opcional)</label>
                <input
                  type="time"
                  value={newBatteryEndTime}
                  onChange={(e) => setNewBatteryEndTime(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                    darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                  }`}
                />
              </div>

              {/* Real-Time Test Duration Calculation Display */}
              <div className="sm:col-span-2 p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-500" />
                  <span className="font-bold text-xs text-neutral-700 dark:text-neutral-300">Duração Calculada em Tempo Real:</span>
                </div>
                {(() => {
                  const durationStr = calculateTestDuration(newBatteryStartTime, newBatteryEndTime);
                  const isPending = durationStr === "Em andamento";
                  const isNotCalc = durationStr === "Não calculado";
                  return (
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                        isPending
                          ? "bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
                          : isNotCalc
                          ? "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300"
                          : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                      }`}
                    >
                      {durationStr}
                    </span>
                  );
                })()}
              </div>

              <div className="space-y-1">
                <label className="font-bold text-neutral-500 uppercase">Ambiente</label>
                <select
                  value={newBatteryEnvironment}
                  onChange={(e: any) => setNewBatteryEnvironment(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                    darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                  }`}
                >
                  <option value="Desenvolvimento">Desenvolvimento</option>
                  <option value="Homologação">Homologação</option>
                  <option value="Produção">Produção</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-neutral-500 uppercase">Versão do Sistema</label>
                <input
                  type="text"
                  required
                  value={newBatteryVersion}
                  onChange={(e) => setNewBatteryVersion(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                    darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                  }`}
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="font-bold text-neutral-500 uppercase">Responsável pelo Teste</label>
                <input
                  type="text"
                  required
                  value={newBatteryResponsible}
                  onChange={(e) => setNewBatteryResponsible(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                    darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                  }`}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setIsNewBatteryModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-neutral-300 dark:border-neutral-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
              >
                Criar Execução
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
