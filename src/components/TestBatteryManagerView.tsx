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
  Trash2,
  Copy,
  Play,
  Archive,
  CheckSquare,
  Edit2,
} from "lucide-react";
import {
  TestBatteryExecution,
  TestCaseItem,
  TestStatus,
  TestCategory,
  TestPriority,
  TestBatteryStatus,
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
import { getTodayDateString, vibrateClick, vibrateSuccess, vibrateWarning, vibrateCritical, sanitizeForFirestore } from "../lib/utils";
import { collection, doc, getDocs, setDoc, deleteDoc, query, orderBy, onSnapshot, runTransaction } from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  saveTestCaseResultAtomic,
  updateTestCaseStatusAtomic,
  updateTestCaseWithUpdateDoc,
} from "../lib/testExecutionPersistence";
import { ParticipantManagerModal } from "./test-battery/ParticipantManagerModal";
import { TestEvidenceModal } from "./test-battery/TestEvidenceModal";
import { TestCategoryMetricsChart } from "./test-battery/TestCategoryMetricsChart";
import { TestAuditTrailDrawer } from "./test-battery/TestAuditTrailDrawer";
import { TestDistributionSection } from "./test-battery/TestDistributionSection";
import { AddTestCaseModal } from "./test-battery/AddTestCaseModal";
import { EditBatteryModal } from "./test-battery/EditBatteryModal";
import { DeleteBatteryModal } from "./test-battery/DeleteBatteryModal";
import { EditTestCaseModal } from "./test-battery/EditTestCaseModal";
import { DeleteTestCaseModal } from "./test-battery/DeleteTestCaseModal";

interface TestBatteryManagerViewProps {
  darkMode?: boolean;
  initialTab?: "MATRIX" | "DISTRIBUTION" | "MY_TESTS" | "ANALYTICS";
}

export const TestBatteryManagerView: React.FC<TestBatteryManagerViewProps> = ({
  darkMode,
  initialTab = "MATRIX",
}) => {
  const { currentUser, allUsers, addToast, recordAuditLog } = useApp();

  // Role-Based Access Control (RBAC)
  const isAdmin = currentUser?.role === "ADMIN" || currentUser?.role === "SERVIDOR";
  const isTesterOnly = !isAdmin;

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
  const [isEditBatteryModalOpen, setIsEditBatteryModalOpen] = useState(false);
  const [isDeleteBatteryModalOpen, setIsDeleteBatteryModalOpen] = useState(false);
  const [isAddTestCaseModalOpen, setIsAddTestCaseModalOpen] = useState(false);
  const [testToEdit, setTestToEdit] = useState<TestCaseItem | null>(null);
  const [testToDelete, setTestToDelete] = useState<TestCaseItem | null>(null);

  // New Battery form states
  const [newBatteryId, setNewBatteryId] = useState("");
  const [newBatteryTitle, setNewBatteryTitle] = useState("");
  const [newBatteryDescription, setNewBatteryDescription] = useState("");
  const [newBatteryDate, setNewBatteryDate] = useState(getTodayDateString());
  const [newBatteryStartTime, setNewBatteryStartTime] = useState("09:00");
  const [newBatteryEndTime, setNewBatteryEndTime] = useState("");
  const [newBatteryResponsible, setNewBatteryResponsible] = useState(currentUser?.name || "Administrador TI");
  const [newBatteryEnvironment, setNewBatteryEnvironment] = useState<"Desenvolvimento" | "Homologação" | "Produção">("Produção");
  const [newBatteryVersion, setNewBatteryVersion] = useState("v1.8.4");
  const [newBatteryStatus, setNewBatteryStatus] = useState<TestBatteryStatus>("RASCUNHO");
  const [newBatteryInitialMode, setNewBatteryInitialMode] = useState<"EMPTY" | "TEMPLATE">("EMPTY");

  // Participant Modal
  const [isParticipantModalOpen, setIsParticipantModalOpen] = useState(false);

  // Evidence / Test Edit Modal
  const [editingTest, setEditingTest] = useState<TestCaseItem | null>(null);

  // Audit view drawer toggle
  const [showAuditDrawer, setShowAuditDrawer] = useState(false);

  // Load executions from Firestore (manual fetch)
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
      }
    } catch (err) {
      console.warn("Utilizando armazenamento local para baterias de teste:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Real-time synchronization: listen for live updates from Firestore across all test sessions
  useEffect(() => {
    setIsLoading(true);
    const testCol = collection(db, "test_executions");
    const q = query(testCol, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        if (!snap.empty) {
          const loaded: TestBatteryExecution[] = [];
          snap.forEach((d) => {
            loaded.push(d.data() as TestBatteryExecution);
          });
          setExecutions(loaded);
          setSelectedExecutionId((prev) => {
            if (prev && loaded.some((e) => e.id === prev)) {
              return prev;
            }
            return loaded[0]?.id || prev;
          });
        }
        setIsLoading(false);
      },
      (err) => {
        console.warn("Aviso no listener em tempo real das baterias:", err);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
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

  // Dedicated metrics for the currently logged-in user (Tester View)
  const myAssignedTests = useMemo(() => {
    if (!activeExecution || !activeExecution.tests) return [];
    return activeExecution.tests.filter((t) => {
      const matchUserId = Boolean(currentUser?.id && t.assignedToUserId === currentUser.id);
      const matchEmail = Boolean(currentUser?.email && t.assignedToEmail?.toLowerCase() === currentUser.email.toLowerCase());
      return matchUserId || matchEmail;
    });
  }, [activeExecution, currentUser]);

  const myAssignedCount = myAssignedTests.length;
  const myApprovedCount = myAssignedTests.filter((t) => t.status === "APROVADO" || t.status === "CONCLUIDO").length;
  const myFailedCount = myAssignedTests.filter((t) => t.status === "REPROVADO" || t.status === "PROBLEMA").length;
  const myInProgressCount = myAssignedTests.filter((t) => t.status === "EM_EXECUCAO").length;
  const myPendingCount = myAssignedTests.filter((t) => t.status === "PENDENTE" || t.status === "NAO_EXECUTADO" || !t.status).length;
  const myProgressPct = myAssignedCount > 0 ? Math.round((myApprovedCount / myAssignedCount) * 100) : 0;

  // Unassigned count across the battery
  const unassignedCount = useMemo(() => {
    if (!activeExecution || !activeExecution.tests) return 0;
    return activeExecution.tests.filter((t) => !t.assignedToUserId && !t.assignedToEmail).length;
  }, [activeExecution]);

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
    const currentTest = activeExecution.tests.find((t) => t.id === testId);
    if (!currentTest) return;

    // RBAC check: only admins or the explicitly assigned tester can change status
    const isAssignedToMe = Boolean(
      (currentUser?.id && currentTest.assignedToUserId === currentUser.id) ||
      (currentUser?.email && currentTest.assignedToEmail?.toLowerCase() === currentUser.email.toLowerCase())
    );

    if (!isAdmin && !isAssignedToMe) {
      addToast("Apenas o testador responsável ou um administrador pode alterar o status deste caso de teste.", "warning");
      return;
    }

    const previousStatus = currentTest.status;

    // Optimistically update in local state for instant tactile response
    setExecutions((prev) =>
      prev.map((exec) => {
        if (exec.id !== activeExecution.id) return exec;
        return {
          ...exec,
          tests: exec.tests.map((t) => (t.id === testId ? { ...t, status: newStatus } : t)),
        };
      })
    );

    // Persist ATOMICALLY in Firestore: prevents overwriting other tests and preserves custom text
    const res = await updateTestCaseStatusAtomic({
      batteryId: activeExecution.id,
      testId,
      newStatus,
      currentUser,
    });

    if (res.success && res.updatedBattery) {
      vibrateSuccess();
      setExecutions((prev) =>
        prev.map((e) => (e.id === res.updatedBattery!.id ? res.updatedBattery! : e))
      );

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
      }).catch(() => {});
    } else {
      vibrateWarning();
      addToast(res.error || "Erro ao salvar status no Firestore. Tente novamente.", "warning");
      // Rollback to previous status if failed
      setExecutions((prev) =>
        prev.map((exec) => {
          if (exec.id !== activeExecution.id) return exec;
          return {
            ...exec,
            tests: exec.tests.map((t) => (t.id === testId ? { ...t, status: previousStatus } : t)),
          };
        })
      );
    }
  };

  // Assign individual test to a participant
  const handleAssignTestToTester = async (testId: string, participantId: string) => {
    vibrateClick();
    if (!isAdmin) {
      addToast("Apenas administradores e servidores podem gerenciar a atribuição de testes.", "warning");
      return;
    }
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
      await setDoc(doc(db, "test_executions", updatedExecution.id), sanitizeForFirestore(updatedExecution));
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
      await setDoc(doc(db, "test_executions", updatedExecution.id), sanitizeForFirestore(updatedExecution));
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
      await setDoc(doc(db, "test_executions", updatedExecution.id), sanitizeForFirestore(updatedExecution));
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
      await setDoc(doc(db, "test_executions", updated.id), sanitizeForFirestore(updated));
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
      await setDoc(doc(db, "test_executions", updatedExecution.id), sanitizeForFirestore(updatedExecution));
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
      await setDoc(doc(db, "test_executions", updatedExecution.id), sanitizeForFirestore(updatedExecution));
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

  // Save Detailed Test Evidence (Atomic Firestore persistence)
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
  ): Promise<{ success: boolean; error?: string }> => {
    vibrateClick();
    const currentTest = activeExecution.tests.find((t) => t.id === testId);
    if (!currentTest) {
      return { success: false, error: "Caso de teste não encontrado na execução ativa." };
    }

    const txId = evidence.transactionId || `tx-evidence-${activeExecution.id}-${testId}-${Date.now()}`;

    // Execute partial updateDoc in Firestore, writing only the altered fields (tests, auditTrail, updatedAt)
    const res = await updateTestCaseWithUpdateDoc({
      batteryId: activeExecution.id,
      testId,
      status,
      obtainedResult,
      observations,
      evidence,
      currentUser,
      isAdmin,
      assignedToUserId,
      assignedToName,
      assignedToEmail,
    });

    if (res.success && res.updatedBattery) {
      vibrateSuccess();
      addToast(`Evidências do teste #${testId} salvas com sucesso no Firestore!`, "success");

      setExecutions((prev) =>
        prev.map((e) => (e.id === res.updatedBattery!.id ? res.updatedBattery! : e))
      );
      setEditingTest(null);

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

      return { success: true };
    } else {
      vibrateWarning();
      const msg = res.error || "Erro ao persistir no Firestore. Seus dados foram preservados no formulário.";
      addToast(msg, "warning");
      return { success: false, error: msg };
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
      await setDoc(doc(db, "test_executions", updatedExecution.id), sanitizeForFirestore(updatedExecution));
    } catch (err) {
      console.warn("Erro ao salvar metadados no Firestore:", err);
    }
  };

  // Start Battery Execution
  const handleStartBattery = async () => {
    vibrateClick();
    const now = new Date();
    const currentTimeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const txId = `tx-start-bat-${activeExecution.id}-${Date.now()}`;

    const auditEntry: TestExecutionAuditEntry = {
      id: `audit-${Date.now()}`,
      changedAt: now.toISOString(),
      changedBy: currentUser?.name || "Administrador",
      changedByEmail: currentUser?.email || "",
      changeType: "UPDATE_STATUS",
      description: `Bateria de testes ${activeExecution.id} iniciada oficialmente por ${currentUser?.name || "Administrador"}.`,
      objectId: activeExecution.id,
      transactionId: txId,
      oldValue: activeExecution.status || activeExecution.overallStatus,
      newValue: "EM_ANDAMENTO",
      fieldChanged: "status",
    };

    const updated: TestBatteryExecution = {
      ...activeExecution,
      status: "EM_ANDAMENTO",
      overallStatus: "EM_ANDAMENTO",
      startTime: activeExecution.startTime || currentTimeStr,
      auditTrail: [auditEntry, ...(activeExecution.auditTrail || [])],
      updatedAt: now.toISOString(),
    };

    setExecutions((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));

    try {
      await setDoc(doc(db, "test_executions", updated.id), sanitizeForFirestore(updated));
      vibrateSuccess();
      addToast(`Bateria ${updated.id} iniciada com sucesso!`, "success");

      recordAuditLog({
        objectId: updated.id,
        objectType: "TEST_BATTERY",
        objectTitle: `Bateria de Testes ${updated.id}`,
        action: "START_TEST_BATTERY",
        fieldChanged: "status",
        oldValue: activeExecution.status || activeExecution.overallStatus,
        newValue: "EM_ANDAMENTO",
        details: `Bateria de testes ${updated.id} foi colocada em execução por ${currentUser?.name}.`,
        transactionId: txId,
      }).catch(() => {});
    } catch (err) {
      console.error("Erro ao iniciar bateria:", err);
    }
  };

  // Finish Battery Execution
  const handleFinishBattery = async () => {
    vibrateClick();
    const now = new Date();
    const currentTimeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const txId = `tx-finish-bat-${activeExecution.id}-${Date.now()}`;

    const auditEntry: TestExecutionAuditEntry = {
      id: `audit-${Date.now()}`,
      changedAt: now.toISOString(),
      changedBy: currentUser?.name || "Administrador",
      changedByEmail: currentUser?.email || "",
      changeType: "UPDATE_STATUS",
      description: `Bateria de testes ${activeExecution.id} concluída e finalizada.`,
      objectId: activeExecution.id,
      transactionId: txId,
      oldValue: activeExecution.status || activeExecution.overallStatus,
      newValue: "CONCLUIDA",
      fieldChanged: "status",
    };

    const updated: TestBatteryExecution = {
      ...activeExecution,
      status: "CONCLUIDA",
      overallStatus: "CONCLUIDO",
      endTime: activeExecution.endTime || currentTimeStr,
      auditTrail: [auditEntry, ...(activeExecution.auditTrail || [])],
      updatedAt: now.toISOString(),
    };

    setExecutions((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));

    try {
      await setDoc(doc(db, "test_executions", updated.id), sanitizeForFirestore(updated));
      vibrateSuccess();
      addToast(`Bateria ${updated.id} finalizada com sucesso!`, "success");

      recordAuditLog({
        objectId: updated.id,
        objectType: "TEST_BATTERY",
        objectTitle: `Bateria de Testes ${updated.id}`,
        action: "FINISH_TEST_BATTERY",
        fieldChanged: "status",
        oldValue: activeExecution.status || activeExecution.overallStatus,
        newValue: "CONCLUIDA",
        details: `Bateria de testes ${updated.id} concluída e arquivada para homologação.`,
        transactionId: txId,
      }).catch(() => {});
    } catch (err) {
      console.error("Erro ao finalizar bateria:", err);
    }
  };

  // Archive Battery Execution
  const handleArchiveBattery = async () => {
    vibrateClick();
    const now = new Date();
    const txId = `tx-archive-bat-${activeExecution.id}-${Date.now()}`;

    const auditEntry: TestExecutionAuditEntry = {
      id: `audit-${Date.now()}`,
      changedAt: now.toISOString(),
      changedBy: currentUser?.name || "Administrador",
      changedByEmail: currentUser?.email || "",
      changeType: "UPDATE_STATUS",
      description: `Bateria de testes ${activeExecution.id} foi arquivada no histórico institucional.`,
      objectId: activeExecution.id,
      transactionId: txId,
      oldValue: activeExecution.status || activeExecution.overallStatus,
      newValue: "ARQUIVADA",
      fieldChanged: "status",
    };

    const updated: TestBatteryExecution = {
      ...activeExecution,
      status: "ARQUIVADA",
      overallStatus: "ARQUIVADA" as any,
      auditTrail: [auditEntry, ...(activeExecution.auditTrail || [])],
      updatedAt: now.toISOString(),
    };

    setExecutions((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));

    try {
      await setDoc(doc(db, "test_executions", updated.id), sanitizeForFirestore(updated));
      vibrateSuccess();
      addToast(`Bateria ${updated.id} arquivada no histórico!`, "info");
    } catch (err) {
      console.error("Erro ao arquivar bateria:", err);
    }
  };

  // Save edited battery metadata from EditBatteryModal
  const handleSaveEditedBattery = async (updatedBattery: TestBatteryExecution) => {
    const now = new Date();
    const txId = `tx-edit-battery-${updatedBattery.id}-${Date.now()}`;
    const auditEntry: TestExecutionAuditEntry = {
      id: `audit-${Date.now()}`,
      changedAt: now.toISOString(),
      changedBy: currentUser?.name || "Administrador",
      changedByEmail: currentUser?.email || "",
      changeType: "UPDATE_DETAILS",
      description: `Parâmetros da bateria ${updatedBattery.id} atualizados (Título: ${updatedBattery.title || updatedBattery.name}, Versão: ${updatedBattery.systemVersion}, Ambiente: ${updatedBattery.environment}).`,
      objectId: updatedBattery.id,
      transactionId: txId,
      oldValue: activeExecution.title || activeExecution.name || "",
      newValue: updatedBattery.title || updatedBattery.name || "",
      fieldChanged: "battery_metadata",
    };

    const finalizedBattery: TestBatteryExecution = {
      ...updatedBattery,
      auditTrail: [auditEntry, ...(updatedBattery.auditTrail || [])],
      updatedAt: now.toISOString(),
    };

    setExecutions((prev) => prev.map((e) => (e.id === finalizedBattery.id ? finalizedBattery : e)));

    try {
      await setDoc(doc(db, "test_executions", finalizedBattery.id), sanitizeForFirestore(finalizedBattery));
      vibrateSuccess();
      addToast(`Bateria ${finalizedBattery.id} atualizada com sucesso!`, "success");

      recordAuditLog({
        objectId: finalizedBattery.id,
        objectType: "TEST_BATTERY",
        objectTitle: `Bateria de Testes ${finalizedBattery.id}`,
        action: "UPDATE_TEST_BATTERY",
        fieldChanged: "metadata",
        details: `Parâmetros da bateria ${finalizedBattery.id} editados.`,
        transactionId: txId,
      }).catch(() => {});
    } catch (err) {
      console.error("Erro ao salvar edição da bateria:", err);
    }
  };

  // Confirm delete battery execution
  const handleConfirmDeleteBattery = async (batteryId: string) => {
    vibrateClick();
    try {
      await deleteDoc(doc(db, "test_executions", batteryId));
      const remaining = executions.filter((e) => e.id !== batteryId);
      setExecutions(remaining);
      if (remaining.length > 0) {
        setSelectedExecutionId(remaining[0].id);
      } else {
        const fresh = createNewTestBatteryExecution(
          "BT-2026-001",
          currentUser?.name || "Administrador TI",
          currentUser?.email || "",
          "Produção",
          "v1.8.4",
          "Bateria de Homologação Institucional",
          "Bateria inicial pronta para cadastro manual de testes."
        );
        await setDoc(doc(db, "test_executions", fresh.id), sanitizeForFirestore(fresh));
        setExecutions([fresh]);
        setSelectedExecutionId(fresh.id);
      }
      vibrateSuccess();
      addToast(`Bateria ${batteryId} excluída com sucesso!`, "success");

      recordAuditLog({
        objectId: batteryId,
        objectType: "TEST_BATTERY",
        objectTitle: `Bateria ${batteryId}`,
        action: "DELETE_TEST_BATTERY",
        fieldChanged: "deleted",
        details: `Bateria de testes ${batteryId} foi excluída por ${currentUser?.name}.`,
        transactionId: `tx-del-bat-${batteryId}-${Date.now()}`,
      }).catch(() => {});
    } catch (err) {
      console.error("Erro ao excluir bateria do Firestore:", err);
      addToast("Erro ao excluir bateria. Verifique a conexão com o banco.", "error");
    }
  };

  // Save edited test case from EditTestCaseModal (Atomic merge via runTransaction)
  const handleSaveEditedTest = async (updatedTest: TestCaseItem) => {
    const nowIso = new Date().toISOString();
    const currentTest = activeExecution.tests.find((t) => t.id === updatedTest.id);
    const txId = `tx-edit-test-${activeExecution.id}-${updatedTest.id}-${Date.now()}`;

    const auditEntry: TestExecutionAuditEntry = {
      id: `audit-${Date.now()}`,
      changedAt: nowIso,
      changedBy: currentUser?.name || "Administrador",
      changedByEmail: currentUser?.email || "",
      changeType: "UPDATE_DETAILS",
      description: `Caso de teste #${updatedTest.id} ("${updatedTest.title}") foi editado. Prioridade: ${updatedTest.priority}, Status: ${updatedTest.status}.`,
      objectId: updatedTest.id,
      testId: updatedTest.id,
      transactionId: txId,
      oldValue: currentTest?.title || "",
      newValue: updatedTest.title,
      fieldChanged: "test_case",
    };

    try {
      const batteryRef = doc(db, "test_executions", activeExecution.id);
      let updatedBatteryState: TestBatteryExecution | null = null;

      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(batteryRef);
        if (!snap.exists()) {
          throw new Error("Bateria não encontrada no Firestore.");
        }
        const fresh = snap.data() as TestBatteryExecution;
        const freshTests = (fresh.tests || []).map((t) =>
          t.id === updatedTest.id ? { ...t, ...updatedTest } : t
        );
        const nextAuditTrail = [auditEntry, ...(fresh.auditTrail || [])];

        updatedBatteryState = {
          ...fresh,
          tests: freshTests,
          auditTrail: nextAuditTrail,
          updatedAt: nowIso,
        };

        transaction.update(batteryRef, sanitizeForFirestore({
          tests: freshTests,
          auditTrail: nextAuditTrail,
          updatedAt: nowIso,
        }));
      });

      if (updatedBatteryState) {
        setExecutions((prev) =>
          prev.map((e) => (e.id === updatedBatteryState!.id ? updatedBatteryState! : e))
        );
      }

      vibrateSuccess();
      addToast(`Caso de teste #${updatedTest.id} atualizado com sucesso!`, "success");

      recordAuditLog({
        objectId: updatedTest.id,
        objectType: "TEST_CASE",
        objectTitle: `Caso de Teste #${updatedTest.id}`,
        action: "UPDATE_TEST_CASE",
        fieldChanged: "test_case",
        details: `Caso de teste #${updatedTest.id} editado na bateria ${activeExecution.id}.`,
        transactionId: txId,
      }).catch(() => {});
    } catch (err: any) {
      console.error("Erro ao salvar caso de teste editado:", err);
      addToast("Erro ao salvar alterações no Firestore: " + (err?.message || "Tente novamente"), "warning");
    }
  };

  // Confirm delete test case from DeleteTestCaseModal
  const handleConfirmDeleteTest = async (testId: string) => {
    const now = new Date();
    const testToDeleteObj = activeExecution.tests.find((t) => t.id === testId);
    const txId = `tx-del-test-${activeExecution.id}-${testId}-${Date.now()}`;

    const auditEntry: TestExecutionAuditEntry = {
      id: `audit-${Date.now()}`,
      changedAt: now.toISOString(),
      changedBy: currentUser?.name || "Administrador",
      changedByEmail: currentUser?.email || "",
      changeType: "DELETE_TEST_CASE",
      description: `Caso de teste #${testId} ("${testToDeleteObj?.title || testId}") foi excluído da bateria.`,
      objectId: testId,
      testId,
      transactionId: txId,
      oldValue: testToDeleteObj?.title || testId,
      newValue: "EXCLUIDO",
      fieldChanged: "tests",
    };

    const updatedTests = activeExecution.tests.filter((t) => t.id !== testId);

    const updatedBattery: TestBatteryExecution = {
      ...activeExecution,
      tests: updatedTests,
      auditTrail: [auditEntry, ...(activeExecution.auditTrail || [])],
      updatedAt: now.toISOString(),
    };

    setExecutions((prev) => prev.map((e) => (e.id === updatedBattery.id ? updatedBattery : e)));

    try {
      await setDoc(doc(db, "test_executions", updatedBattery.id), sanitizeForFirestore(updatedBattery));
      vibrateSuccess();
      addToast(`Caso de teste #${testId} excluído com sucesso!`, "success");

      recordAuditLog({
        objectId: testId,
        objectType: "TEST_CASE",
        objectTitle: `Caso de Teste #${testId}`,
        action: "DELETE_TEST_CASE",
        fieldChanged: "tests",
        details: `Caso de teste #${testId} removido da bateria ${activeExecution.id}.`,
        transactionId: txId,
      }).catch(() => {});
    } catch (err) {
      console.error("Erro ao excluir caso de teste:", err);
    }
  };

  // Duplicate test case
  const handleDuplicateTest = async (test: TestCaseItem) => {
    vibrateClick();
    const now = new Date();
    const cloneSuffix = Date.now().toString(36).slice(-4).toUpperCase();
    const newId = `${test.id}-CLONE-${cloneSuffix}`;
    const txId = `tx-dup-test-${activeExecution.id}-${newId}-${Date.now()}`;

    const duplicatedTest: TestCaseItem = {
      ...test,
      id: newId,
      title: `${test.title} (Cópia)`,
      status: "PENDENTE",
      assignedToUserId: undefined,
      assignedToName: undefined,
      assignedToEmail: undefined,
      executedAt: undefined,
      executedBy: undefined,
      executedByEmail: undefined,
      obtainedResult: "Pendente de validação",
      evidence: undefined,
    };

    const auditEntry: TestExecutionAuditEntry = {
      id: `audit-${Date.now()}`,
      changedAt: now.toISOString(),
      changedBy: currentUser?.name || "Administrador",
      changedByEmail: currentUser?.email || "",
      changeType: "ADD_TEST",
      description: `Caso de teste #${test.id} duplicado gerando novo caso #${newId}.`,
      objectId: newId,
      testId: newId,
      transactionId: txId,
      oldValue: test.id,
      newValue: newId,
      fieldChanged: "tests",
    };

    const updatedBattery: TestBatteryExecution = {
      ...activeExecution,
      tests: [...(activeExecution.tests || []), duplicatedTest],
      auditTrail: [auditEntry, ...(activeExecution.auditTrail || [])],
      updatedAt: now.toISOString(),
    };

    setExecutions((prev) => prev.map((e) => (e.id === updatedBattery.id ? updatedBattery : e)));

    try {
      await setDoc(doc(db, "test_executions", updatedBattery.id), sanitizeForFirestore(updatedBattery));
      vibrateSuccess();
      addToast(`Caso de teste duplicado como #${newId}!`, "success");

      recordAuditLog({
        objectId: newId,
        objectType: "TEST_CASE",
        objectTitle: `Caso #${newId}`,
        action: "DUPLICATE_TEST_CASE",
        fieldChanged: "tests",
        details: `Caso #${test.id} duplicado gerando #${newId} na bateria ${activeExecution.id}.`,
        transactionId: txId,
      }).catch(() => {});
    } catch (err) {
      console.error("Erro ao duplicar teste:", err);
    }
  };

  // Create New Battery Execution
  const handleOpenNewBatteryModal = () => {
    vibrateClick();
    const nextNum = executions.length + 1;
    const autoId = `BT-2026-${String(nextNum).padStart(3, "0")}`;
    setNewBatteryId(autoId);
    setNewBatteryTitle(`Bateria de Testes ${autoId}`);
    setNewBatteryDescription("Bateria de validação técnica, homologação e conformidade funcional do Localiza+.");
    setNewBatteryDate(getTodayDateString());
    setNewBatteryStartTime("09:00");
    setNewBatteryEndTime("");
    setNewBatteryResponsible(currentUser?.name || "Administrador TI");
    setNewBatteryEnvironment("Produção");
    setNewBatteryVersion("v1.8.4");
    setNewBatteryStatus("RASCUNHO");
    setNewBatteryInitialMode("EMPTY");
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

    // Determine initial tests based on chosen mode
    const initialTestsList: TestCaseItem[] =
      newBatteryInitialMode === "TEMPLATE"
        ? STANDARD_TEST_DEFINITIONS.map((std, idx) => ({
            ...std,
            status: "PENDENTE" as TestStatus,
            priority: (std.priority || "MEDIA") as TestPriority,
            obtainedResult: "Aguardando execução da bateria",
            assignedToUserId: undefined,
            assignedToName: undefined,
            assignedToEmail: undefined,
          }))
        : [];

    const newBattery = createNewTestBatteryExecution(
      newBatteryId.trim().toUpperCase(),
      newBatteryResponsible.trim(),
      currentUser?.email || "",
      newBatteryEnvironment,
      newBatteryVersion.trim(),
      newBatteryTitle.trim() || `Bateria de Testes ${newBatteryId.trim().toUpperCase()}`,
      newBatteryDescription.trim(),
      [],
      initialTestsList,
      newBatteryStatus
    );

    newBattery.testDate = newBatteryDate;
    newBattery.startTime = newBatteryStartTime;
    newBattery.endTime = newBatteryEndTime;

    const updatedList = [newBattery, ...executions];
    setExecutions(updatedList);
    setSelectedExecutionId(newBattery.id);
    setIsNewBatteryModalOpen(false);

    try {
      await setDoc(doc(db, "test_executions", newBattery.id), sanitizeForFirestore(newBattery));
      vibrateSuccess();
      addToast(
        `Bateria de testes ${newBattery.id} criada com sucesso (${initialTestsList.length} testes)!`,
        "success"
      );

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
            {isAdmin && (
              <button
                id="btn-new-test-battery"
                onClick={handleOpenNewBatteryModal}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs sm:text-sm font-bold rounded-xl shadow-sm transition"
              >
                <Plus className="w-4 h-4" />
                Nova Execução
              </button>
            )}
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
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b pb-4 dark:border-neutral-800 border-neutral-200">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                {activeExecution.id}
              </span>
              <h2 className="font-bold text-lg text-neutral-900 dark:text-white">
                {activeExecution.title || activeExecution.name || `Bateria de Testes ${activeExecution.id}`}
              </h2>
              {/* Status Badge */}
              {(() => {
                const st = activeExecution.status || "EM_ANDAMENTO";
                let badgeClass = "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 border-neutral-300 dark:border-neutral-700";
                let label: string = String(st);
                if (st === "RASCUNHO") {
                  badgeClass = "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-300 border-slate-300 dark:border-slate-700";
                  label = "Rascunho";
                } else if (st === "PLANEJADA") {
                  badgeClass = "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800";
                  label = "Planejada";
                } else if (st === "EM_ANDAMENTO") {
                  badgeClass = "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300 dark:border-blue-800";
                  label = "Em Andamento";
                } else if (st === "CONCLUIDA" || st === "CONCLUIDO") {
                  badgeClass = "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800";
                  label = "Concluída";
                } else if (st === "ARQUIVADA") {
                  badgeClass = "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-300 dark:border-purple-800";
                  label = "Arquivada";
                }
                return (
                  <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${badgeClass}`}>
                    {label}
                  </span>
                );
              })()}
            </div>
            {activeExecution.description && (
              <p className="text-xs text-neutral-600 dark:text-neutral-400 max-w-3xl">
                {activeExecution.description}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500 pt-0.5">
              <span><strong>Responsável:</strong> {activeExecution.responsible || "Não definido"}</span>
              {activeExecution.responsibleEmail && <span>({activeExecution.responsibleEmail})</span>}
              <span>•</span>
              <span><strong>Casos de Teste:</strong> {activeExecution.tests?.length || 0}</span>
              <span>•</span>
              <span><strong>Participantes:</strong> {activeExecution.participants?.length || 0}</span>
            </div>
          </div>

          {/* Action Toolbar for the Battery */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Start / Finish / Archive Lifecycle Buttons */}
            {isAdmin && activeExecution.status !== "EM_ANDAMENTO" && activeExecution.status !== "CONCLUIDA" && activeExecution.status !== "CONCLUIDO" && (
              <button
                onClick={handleStartBattery}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition"
                title="Iniciar execução desta bateria"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Iniciar Bateria</span>
              </button>
            )}

            {isAdmin && activeExecution.status === "EM_ANDAMENTO" && (
              <button
                onClick={handleFinishBattery}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition"
                title="Finalizar execução desta bateria"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Finalizar Bateria</span>
              </button>
            )}

            {isAdmin && (activeExecution.status === "CONCLUIDA" || activeExecution.status === "CONCLUIDO") && (
              <button
                onClick={handleArchiveBattery}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition"
                title="Arquivar histórico desta bateria"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>Arquivar</span>
              </button>
            )}

            {/* Edit Battery Button */}
            {isAdmin && (
              <button
                onClick={() => {
                  vibrateClick();
                  setIsEditBatteryModalOpen(true);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                  darkMode
                    ? "bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200"
                    : "bg-neutral-50 hover:bg-neutral-100 border-neutral-300 text-neutral-800"
                }`}
                title="Editar dados cadastrais e parâmetros da bateria"
              >
                <Edit2 className="w-3.5 h-3.5 text-blue-500" />
                <span>Editar</span>
              </button>
            )}

            {/* Add Test Case Button */}
            {isAdmin && (
              <button
                onClick={() => {
                  vibrateClick();
                  setIsAddTestCaseModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition"
                title="Cadastrar novo caso de teste nesta bateria"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Novo Teste</span>
              </button>
            )}

            {/* Delete Battery Button */}
            {isAdmin && (
              <button
                onClick={() => {
                  vibrateClick();
                  setIsDeleteBatteryModalOpen(true);
                }}
                className="p-2 rounded-xl text-xs font-bold border bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-600 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 dark:border-rose-900 dark:text-rose-400 transition"
                title="Excluir esta bateria de testes permanentemente"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {/* Data */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-neutral-500 uppercase">Data do Teste</label>
            <input
              type="date"
              id="input-exec-date"
              disabled={!isAdmin}
              value={activeExecution.testDate || ""}
              onChange={(e) => handleUpdateExecutionMetadata("testDate", e.target.value)}
              className={`w-full text-xs font-semibold px-3 py-2 rounded-xl border focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-75 disabled:cursor-not-allowed ${
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
              disabled={!isAdmin}
              value={activeExecution.startTime || ""}
              onChange={(e) => handleUpdateExecutionMetadata("startTime", e.target.value)}
              className={`w-full text-xs font-semibold px-3 py-2 rounded-xl border focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-75 disabled:cursor-not-allowed ${
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
              disabled={!isAdmin}
              value={activeExecution.endTime || ""}
              onChange={(e) => handleUpdateExecutionMetadata("endTime", e.target.value)}
              className={`w-full text-xs font-semibold px-3 py-2 rounded-xl border focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-75 disabled:cursor-not-allowed ${
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
              disabled={!isAdmin}
              value={activeExecution.environment || "Homologação"}
              onChange={(e) => handleUpdateExecutionMetadata("environment", e.target.value)}
              className={`w-full text-xs font-semibold px-3 py-2 rounded-xl border focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-75 disabled:cursor-not-allowed ${
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
          {/* Tester Profile Card when viewing MY_TESTS */}
          {activeMainTab === "MY_TESTS" && (
            <div
              id="tester-profile-hero-card"
              className={`p-4 sm:p-5 rounded-2xl border shadow-sm ${
                darkMode ? "bg-neutral-900/90 border-neutral-800" : "bg-white border-neutral-200"
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b dark:border-neutral-800 border-neutral-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black text-base border border-emerald-600/20">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm sm:text-base font-black text-neutral-900 dark:text-white">
                        {currentUser?.name || "Testador"}
                      </h2>
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        {currentUser?.role === "ADMIN" ? "Administrador" : currentUser?.role === "SERVIDOR" ? "Servidor / TAE" : "Aluno / Testador"}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500">
                      {currentUser?.email} • UID: <span className="font-mono text-[11px]">{currentUser?.id}</span>
                    </p>
                  </div>
                </div>
                <div className="text-left md:text-right">
                  <span className="text-xs text-neutral-400 font-semibold">Progresso dos Meus Testes</span>
                  <div className="flex items-center gap-2 mt-0.5 md:justify-end">
                    <span className="text-sm font-black text-neutral-900 dark:text-white">
                      {myAssignedCount > 0 ? Math.round((myApprovedCount / myAssignedCount) * 100) : 0}%
                    </span>
                    <div className="w-28 h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                        style={{ width: `${myAssignedCount > 0 ? (myApprovedCount / myAssignedCount) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 4 Metrics for Tester */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3.5">
                <div className="p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border dark:border-neutral-700/60 border-neutral-200/80">
                  <span className="text-[10px] font-bold text-neutral-500 uppercase">Atribuídos a Mim</span>
                  <p className="text-lg font-black text-neutral-900 dark:text-white mt-0.5">{myAssignedCount}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border dark:border-emerald-900/40 border-emerald-200/80">
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Aprovados</span>
                  <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{myApprovedCount}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border dark:border-rose-900/40 border-rose-200/80">
                  <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase">Reprovados</span>
                  <p className="text-lg font-black text-rose-600 dark:text-rose-400 mt-0.5">{myFailedCount}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border dark:border-amber-900/40 border-amber-200/80">
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">Pendentes / Em Execução</span>
                  <p className="text-lg font-black text-amber-600 dark:text-amber-400 mt-0.5">{myPendingCount + myInProgressCount}</p>
                </div>
              </div>
            </div>
          )}

          {/* Matrix Summary Strip when viewing MATRIX */}
          {activeMainTab === "MATRIX" && (
            <div
              id="matrix-summary-strip"
              className={`p-3.5 rounded-2xl border shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs ${
                darkMode ? "bg-neutral-900/90 border-neutral-800" : "bg-white border-neutral-200"
              }`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-bold text-neutral-900 dark:text-white">
                  Matriz Completa ({activeExecution.tests?.length || 0} Casos Cadastrados)
                </span>
                <span className="text-neutral-400">•</span>
                <span className="text-neutral-600 dark:text-neutral-300">
                  Exibindo <strong>{filteredTests.length}</strong> {filteredTests.length === 1 ? "teste" : "testes"}
                </span>
                <span className="text-neutral-400">•</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  {summary.completed} Aprovados
                </span>
                <span className="text-rose-600 dark:text-rose-400 font-semibold">
                  {summary.failed} Reprovados
                </span>
                <span className="text-neutral-500 font-semibold">
                  {activeExecution.tests?.filter((t) => !t.assignedToUserId).length || 0} Sem Responsável
                </span>
              </div>
              {isAdmin && (
                <span className="text-[11px] font-medium text-neutral-500">
                  Modo Administrador: Controle Total de Edição e Distribuição
                </span>
              )}
            </div>
          )}

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

                {/* New Test Case Button - Admin Only */}
                {isAdmin && (
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
                )}
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
                const isAssignedToMe = Boolean(
                  (currentUser?.id && test.assignedToUserId === currentUser.id) ||
                  (currentUser?.email && test.assignedToEmail?.toLowerCase() === currentUser.email.toLowerCase())
                );
                const canModifyTestStatus = isAdmin || isAssignedToMe;

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
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                                isAssignedToMe
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                                  : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                              }`}
                            >
                              <User className="w-3 h-3" />
                              Testador: {test.assignedToName} {isAssignedToMe && "(Você)"}
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
                        {/* Inline Tester Assignment Select - Admin Only */}
                        {isAdmin && (
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
                        )}

                        {/* Status Buttons */}
                        <div
                          className={`flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl border dark:border-neutral-700 border-neutral-200 ${
                            !canModifyTestStatus ? "opacity-75" : ""
                          }`}
                          title={
                            canModifyTestStatus
                              ? "Alterar status do caso de teste"
                              : "Apenas o testador responsável ou um administrador pode alterar o status deste caso."
                          }
                        >
                          <button
                            disabled={!canModifyTestStatus}
                            onClick={() => handleQuickStatusChange(test.id, "APROVADO")}
                            className={`px-2 py-1.5 text-xs font-bold rounded-lg transition disabled:cursor-not-allowed ${
                              test.status === "APROVADO"
                                ? "bg-emerald-600 text-white shadow-sm"
                                : "text-neutral-600 hover:text-emerald-600 dark:text-neutral-300"
                            }`}
                            title="Marcar como Aprovado / Concluído"
                          >
                            Aprovado
                          </button>
                          <button
                            disabled={!canModifyTestStatus}
                            onClick={() => handleQuickStatusChange(test.id, "REPROVADO")}
                            className={`px-2 py-1.5 text-xs font-bold rounded-lg transition disabled:cursor-not-allowed ${
                              test.status === "REPROVADO"
                                ? "bg-rose-600 text-white shadow-sm"
                                : "text-neutral-600 hover:text-rose-600 dark:text-neutral-300"
                            }`}
                            title="Marcar como Reprovado / Com Problema"
                          >
                            Reprovado
                          </button>
                          <button
                            disabled={!canModifyTestStatus}
                            onClick={() => handleQuickStatusChange(test.id, "EM_EXECUCAO")}
                            className={`px-2 py-1.5 text-xs font-bold rounded-lg transition disabled:cursor-not-allowed ${
                              test.status === "EM_EXECUCAO"
                                ? "bg-blue-600 text-white shadow-sm"
                                : "text-neutral-600 hover:text-blue-600 dark:text-neutral-300"
                            }`}
                            title="Marcar como Em Andamento"
                          >
                            Em And.
                          </button>
                          <button
                            disabled={!canModifyTestStatus}
                            onClick={() => handleQuickStatusChange(test.id, "PENDENTE")}
                            className={`px-2 py-1.5 text-xs font-bold rounded-lg transition disabled:cursor-not-allowed ${
                              test.status === "PENDENTE"
                                ? "bg-amber-600 text-white shadow-sm"
                                : "text-neutral-600 hover:text-amber-600 dark:text-neutral-300"
                            }`}
                            title="Marcar como Pendente"
                          >
                            Pendente
                          </button>
                          <button
                            disabled={!canModifyTestStatus}
                            onClick={() => handleQuickStatusChange(test.id, "NAO_SE_APLICA")}
                            className={`px-2 py-1.5 text-xs font-bold rounded-lg transition disabled:cursor-not-allowed ${
                              test.status === "NAO_SE_APLICA"
                                ? "bg-purple-600 text-white shadow-sm"
                                : "text-neutral-500 hover:text-purple-600 dark:text-neutral-400"
                            }`}
                            title="Marcar como Não se Aplica"
                          >
                            N/A
                          </button>
                        </div>

                        {/* Details & Evidence Button */}
                        <button
                          onClick={() => {
                            vibrateClick();
                            setEditingTest(test);
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-xl border transition ${
                            darkMode
                              ? "bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200"
                              : "bg-neutral-50 hover:bg-neutral-100 border-neutral-300 text-neutral-800"
                          }`}
                          title="Registrar Evidência ou Observação Técnica"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Evidências</span>
                        </button>

                        {/* Edit Test Button - Admin Only */}
                        {isAdmin && (
                          <button
                            onClick={() => {
                              vibrateClick();
                              setTestToEdit(test);
                            }}
                            className={`p-1.5 text-xs font-bold rounded-xl border transition ${
                              darkMode
                                ? "bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200"
                                : "bg-neutral-50 hover:bg-neutral-100 border-neutral-300 text-neutral-800"
                            }`}
                            title="Editar Caso de Teste"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-blue-500" />
                          </button>
                        )}

                        {/* Duplicate Test Button - Admin Only */}
                        {isAdmin && (
                          <button
                            onClick={() => handleDuplicateTest(test)}
                            className={`p-1.5 text-xs font-bold rounded-xl border transition ${
                              darkMode
                                ? "bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200"
                                : "bg-neutral-50 hover:bg-neutral-100 border-neutral-300 text-neutral-800"
                            }`}
                            title="Duplicar Caso de Teste"
                          >
                            <Copy className="w-3.5 h-3.5 text-indigo-500" />
                          </button>
                        )}

                        {/* Delete Test Button - Admin Only */}
                        {isAdmin && (
                          <button
                            onClick={() => {
                              vibrateClick();
                              setTestToDelete(test);
                            }}
                            className="p-1.5 text-xs font-bold rounded-xl border transition bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-600 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 dark:border-rose-900 dark:text-rose-400"
                            title="Excluir Caso de Teste"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}

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
            className={`w-full max-w-xl p-6 rounded-2xl border shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto ${
              darkMode ? "bg-neutral-900 border-neutral-800 text-white" : "bg-white border-neutral-200 text-neutral-900"
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 dark:border-neutral-800 border-neutral-200">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Nova Execução de Bateria de Testes</h3>
                  <p className="text-[11px] text-neutral-500">Configure os parâmetros e o modo de inicialização da bateria</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewBatteryModalOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
              <div className="space-y-1 sm:col-span-2">
                <label className="font-bold text-neutral-500 uppercase">Identificador Único (ID da Bateria)</label>
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

              <div className="space-y-1 sm:col-span-2">
                <label className="font-bold text-neutral-500 uppercase">Nome / Título da Bateria</label>
                <input
                  type="text"
                  required
                  value={newBatteryTitle}
                  onChange={(e) => setNewBatteryTitle(e.target.value)}
                  placeholder="Ex: Bateria de Homologação Presencial Alunos"
                  className={`w-full p-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                    darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                  }`}
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="font-bold text-neutral-500 uppercase">Descrição / Objetivo</label>
                <textarea
                  rows={2}
                  value={newBatteryDescription}
                  onChange={(e) => setNewBatteryDescription(e.target.value)}
                  placeholder="Descreva o escopo e os objetivos desta execução..."
                  className={`w-full p-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 resize-none ${
                    darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-neutral-500 uppercase">Status Inicial</label>
                <select
                  value={newBatteryStatus}
                  onChange={(e: any) => setNewBatteryStatus(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 font-semibold ${
                    darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                  }`}
                >
                  <option value="RASCUNHO">Rascunho (Não iniciada)</option>
                  <option value="PLANEJADA">Planejada (Agendada)</option>
                  <option value="EM_ANDAMENTO">Em Andamento</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-neutral-500 uppercase">Ambiente</label>
                <select
                  value={newBatteryEnvironment}
                  onChange={(e: any) => setNewBatteryEnvironment(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 font-semibold ${
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
                  className={`w-full p-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 font-semibold ${
                    darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-neutral-500 uppercase">Responsável Técnico</label>
                <input
                  type="text"
                  required
                  value={newBatteryResponsible}
                  onChange={(e) => setNewBatteryResponsible(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 font-semibold ${
                    darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-neutral-500 uppercase">Data Prevista</label>
                <input
                  type="date"
                  required
                  value={newBatteryDate}
                  onChange={(e) => setNewBatteryDate(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 font-semibold ${
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
                  className={`w-full p-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 font-semibold ${
                    darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                  }`}
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="font-bold text-neutral-500 uppercase">Hora de Término (Opcional)</label>
                <input
                  type="time"
                  value={newBatteryEndTime}
                  onChange={(e) => setNewBatteryEndTime(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 font-semibold ${
                    darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                  }`}
                />
              </div>

              {/* Duração Calculada */}
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

              {/* Modo de Inicialização dos Casos de Teste */}
              <div className="sm:col-span-2 space-y-2 p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20">
                <label className="font-bold text-neutral-700 dark:text-neutral-300 uppercase flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-600" />
                  Casos de Teste Iniciais da Bateria
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                      newBatteryInitialMode === "EMPTY"
                        ? "bg-white dark:bg-neutral-800 border-emerald-500 shadow-sm"
                        : "border-neutral-200 dark:border-neutral-700 hover:bg-white/50 dark:hover:bg-neutral-800/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="batteryInitialMode"
                      value="EMPTY"
                      checked={newBatteryInitialMode === "EMPTY"}
                      onChange={() => setNewBatteryInitialMode("EMPTY")}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="font-bold block text-neutral-900 dark:text-white">Bateria Vazia (0 testes)</span>
                      <span className="text-[11px] text-neutral-500 leading-tight block mt-0.5">
                        Inicia limpa para cadastrar e distribuir casos de teste manualmente conforme diretriz de governança.
                      </span>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                      newBatteryInitialMode === "TEMPLATE"
                        ? "bg-white dark:bg-neutral-800 border-emerald-500 shadow-sm"
                        : "border-neutral-200 dark:border-neutral-700 hover:bg-white/50 dark:hover:bg-neutral-800/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="batteryInitialMode"
                      value="TEMPLATE"
                      checked={newBatteryInitialMode === "TEMPLATE"}
                      onChange={() => setNewBatteryInitialMode("TEMPLATE")}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="font-bold block text-neutral-900 dark:text-white">Template Padrão (55 testes)</span>
                      <span className="text-[11px] text-neutral-500 leading-tight block mt-0.5">
                        Carrega os 55 testes padrão com procedimentos e passos oficiais prontos para validação.
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t dark:border-neutral-800 border-neutral-200">
              <button
                type="button"
                onClick={() => setIsNewBatteryModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Criar Execução
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 11. Edit Battery Modal */}
      <EditBatteryModal
        isOpen={isEditBatteryModalOpen}
        onClose={() => setIsEditBatteryModalOpen(false)}
        battery={activeExecution}
        onSaveBattery={handleSaveEditedBattery}
        darkMode={darkMode}
      />

      {/* 12. Delete Battery Modal */}
      <DeleteBatteryModal
        isOpen={isDeleteBatteryModalOpen}
        onClose={() => setIsDeleteBatteryModalOpen(false)}
        battery={activeExecution}
        onConfirmDeleteBattery={handleConfirmDeleteBattery}
        darkMode={darkMode}
      />

      {/* 13. Edit Test Case Modal */}
      <EditTestCaseModal
        isOpen={!!testToEdit}
        onClose={() => setTestToEdit(null)}
        test={testToEdit}
        onSaveTest={handleSaveEditedTest}
        darkMode={darkMode}
      />

      {/* 14. Delete Test Case Modal */}
      <DeleteTestCaseModal
        isOpen={!!testToDelete}
        onClose={() => setTestToDelete(null)}
        test={testToDelete}
        onConfirmDelete={handleConfirmDeleteTest}
        darkMode={darkMode}
      />
    </div>
  );
};
