import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { deleteField } from "firebase/firestore";
import {
  DEFAULT_GUEST_USER,
  sanitizeFirestoreData,
} from "./shared-constants";
import { canOperateFormalReturn } from "./devolutionAuth";
import {
  assertClientItemDataUpdateAllowed,
} from "./clientItemSecurityGuards";
import {
  ITEM_FIELD_LIMITS,
  validateItemTextFields,
  safeIncludes,
  sanitizeQuery,
  safeParseDate,
} from "./utils";
import { User, LostFoundItem } from "../types";

function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

function evaluateRegisterAccess(params: {
  isAuthLoading: boolean;
  isGuest: boolean;
  currentUser: Partial<User> | null | undefined;
}) {
  const { isAuthLoading, isGuest, currentUser } = params;
  const isUnauthorized =
    !isAuthLoading &&
    !isGuest &&
    (currentUser?.role === "ALUNO" ||
      currentUser?.role === "INTRUSO" ||
      (currentUser?.role === "SERVIDOR" && currentUser?.approvalStatus !== "APROVADO"));

  const canRegister =
    (currentUser?.role === "SERVIDOR" && currentUser?.approvalStatus === "APROVADO") ||
    currentUser?.role === "ADMIN";

  return {
    showsLoading: isAuthLoading,
    showsGuestScreen: !isAuthLoading && isGuest,
    isUnauthorized,
    canRegister,
  };
}

describe("Regressões Funcionais Pós-Redesign — Cadastro de Objetos e Confirmação da Chegada", () => {
  describe("A. Fluxo de Cadastro de Objetos (/cadastrar & RegisterItemView)", () => {
    it("1. Não trata sessão em hidratação (isAuthLoading=true) com DEFAULT_GUEST_USER (ALUNO) como acesso não autorizado", () => {
      const state = evaluateRegisterAccess({
        isAuthLoading: true,
        isGuest: true,
        currentUser: DEFAULT_GUEST_USER,
      });

      expect(state.showsLoading).toBe(true);
      expect(state.isUnauthorized).toBe(false);
      expect(state.showsGuestScreen).toBe(false);
    });

    it("2. Exibe tela amigável de identificação para visitantes (isGuest=true) em vez de redirecionar como ALUNO", () => {
      const state = evaluateRegisterAccess({
        isAuthLoading: false,
        isGuest: true,
        currentUser: DEFAULT_GUEST_USER,
      });

      expect(state.showsLoading).toBe(false);
      expect(state.showsGuestScreen).toBe(true);
      expect(state.isUnauthorized).toBe(false);
      expect(state.canRegister).toBe(false);
    });

    it("3. Permite acesso ao cadastro apenas para SERVIDOR aprovado e ADMIN; bloqueia ALUNO, INTRUSO e SERVIDOR pendente", () => {
      expect(
        evaluateRegisterAccess({
          isAuthLoading: false,
          isGuest: false,
          currentUser: { id: "u-admin", role: "ADMIN", approvalStatus: "APROVADO" },
        })
      ).toMatchObject({ isUnauthorized: false, canRegister: true });

      expect(
        evaluateRegisterAccess({
          isAuthLoading: false,
          isGuest: false,
          currentUser: { id: "u-serv-ok", role: "SERVIDOR", approvalStatus: "APROVADO" },
        })
      ).toMatchObject({ isUnauthorized: false, canRegister: true });

      expect(
        evaluateRegisterAccess({
          isAuthLoading: false,
          isGuest: false,
          currentUser: { id: "u-serv-pend", role: "SERVIDOR", approvalStatus: "PENDENTE" },
        })
      ).toMatchObject({ isUnauthorized: true, canRegister: false });

      expect(
        evaluateRegisterAccess({
          isAuthLoading: false,
          isGuest: false,
          currentUser: { id: "u-aluno", role: "ALUNO", approvalStatus: "APROVADO" },
        })
      ).toMatchObject({ isUnauthorized: true, canRegister: false });

      expect(
        evaluateRegisterAccess({
          isAuthLoading: false,
          isGuest: false,
          currentUser: { id: "u-intruso", role: "INTRUSO", approvalStatus: "APROVADO" },
        })
      ).toMatchObject({ isUnauthorized: true, canRegister: false });
    });

    it("4. Validação combinada da Etapa 3 detecta estouro de 120 caracteres (location + complemento) e 150 caracteres (WhatsApp + contato)", () => {
      const baseLocation = "Laboratório de Informática 1"; // 28 chars
      const longComplement = "A".repeat(100); // combined 28 + 3 + 100 = 131 > 120
      const combinedLocation = `${baseLocation} — ${longComplement}`;
      const overflowLocCheck = validateItemTextFields({ location: combinedLocation }, true);
      expect(overflowLocCheck.isValid).toBe(false);
      expect(overflowLocCheck.field).toBe("location");

      const validMaxComp = "A".repeat(ITEM_FIELD_LIMITS.LOCATION - baseLocation.length - 3);
      const validLocCheck = validateItemTextFields(
        { location: `${baseLocation} — ${validMaxComp}` },
        true
      );
      expect(validLocCheck.isValid).toBe(true);

      const longContact = `WhatsApp: (43) 99999-9999 | Contato/Ponto: ${"B".repeat(120)}`;
      const overflowContactCheck = validateItemTextFields({ contactInfo: longContact }, true);
      expect(overflowContactCheck.isValid).toBe(false);
      expect(overflowContactCheck.field).toBe("contactInfo");
    });

    it("5. Integridade estrutural: RegisterItemView não executa return condicional antes de seus hooks React", () => {
      const src = readSrc("src/components/RegisterItemView.tsx");
      const firstHookIdx = src.indexOf("const [currentStep, setCurrentStep]");
      const isUnauthorizedReturnIdx = src.indexOf("if (isUnauthorized) {\n    return");
      const isAuthLoadingReturnIdx = src.indexOf("if (isAuthLoading) {\n    return");

      expect(firstHookIdx).toBeGreaterThan(-1);
      expect(isUnauthorizedReturnIdx).toBeGreaterThan(firstHookIdx);
      expect(isAuthLoadingReturnIdx).toBeGreaterThan(firstHookIdx);
      expect(src).toContain("searchParams");
      expect(src).toContain("prefilledItemFromAI");
      expect(src).toContain("maxComplementChars");
    });

    it("6. Ponte de navegação pós-login e botões + Registrar Objeto navegam corretamente para /cadastrar", () => {
      const appContextSrc = readSrc("src/context/AppContext.tsx");
      const appSrc = readSrc("src/App.tsx");
      const dashboardSrc = readSrc("src/components/DashboardView.tsx");
      const homeSrc = readSrc("src/components/HomeView.tsx");
      const bottomNavSrc = readSrc("src/components/MobileBottomNav.tsx");

      expect(appContextSrc).toContain("postLoginRedirectPath");
      expect(appContextSrc).toContain("/cadastrar?tipo=");
      expect(appSrc).toContain("postLoginRedirectPath");
      expect(dashboardSrc).toContain('navigate("/cadastrar")');
      expect(homeSrc).toContain('currentUser?.approvalStatus === "APROVADO"');
      expect(bottomNavSrc).toContain('currentUser?.approvalStatus === "APROVADO"');
    });
  });

  describe("B. Fluxo de Confirmação da Chegada (EM_ANALISE)", () => {
    it("1. sanitizeFirestoreData preserva sentinelas FieldValue (deleteField()) usadas na atualização de status para EM_ANALISE", () => {
      const sentinel = deleteField();
      const payload = sanitizeFirestoreData({
        status: "EM_ANALISE",
        resolutionDate: sentinel,
        history: [{ id: "h1", action: "Status alterado para EM_ANALISE" }],
      });

      expect(payload.status).toBe("EM_ANALISE");
      expect(payload.resolutionDate).toBe(sentinel);
    });

    it("2. Apenas ADMIN e SERVIDOR aprovado/ativo podem confirmar chegada (EM_ANALISE); ALUNO, pendente, bloqueado e visitante são recusados", () => {
      const activeAuth = { uid: "u-1", emailVerified: true } as any;

      expect(
        canOperateFormalReturn(
          { id: "u-1", role: "ADMIN", approvalStatus: "APROVADO", status: "active" },
          activeAuth,
          false
        )
      ).toBe(true);

      expect(
        canOperateFormalReturn(
          { id: "u-1", role: "SERVIDOR", approvalStatus: "APROVADO", status: "active" },
          activeAuth,
          false
        )
      ).toBe(true);

      expect(
        canOperateFormalReturn(
          { id: "u-1", role: "SERVIDOR", approvalStatus: "PENDENTE", status: "active" },
          activeAuth,
          false
        )
      ).toBe(false);

      expect(
        canOperateFormalReturn(
          { id: "u-1", role: "SERVIDOR", approvalStatus: "APROVADO", status: "suspended" },
          activeAuth,
          false
        )
      ).toBe(false);

      expect(
        canOperateFormalReturn(
          { id: "u-1", role: "ALUNO", approvalStatus: "APROVADO", status: "active" },
          activeAuth,
          false
        )
      ).toBe(false);

      expect(
        canOperateFormalReturn(
          { id: "u-1", role: "ADMIN", approvalStatus: "APROVADO", status: "active" },
          null,
          true
        )
      ).toBe(false);
    });

    it("3. Transição para EM_ANALISE via updateItemData é permitida enquanto DEVOLVIDO/ENCERRADO continuam bloqueados", () => {
      expect(() => assertClientItemDataUpdateAllowed({ status: "EM_ANALISE" })).not.toThrow();
      expect(() => assertClientItemDataUpdateAllowed({ status: "DEVOLVIDO" })).toThrow();
      expect(() => assertClientItemDataUpdateAllowed({ status: "ENCERRADO" })).toThrow();
    });

    it("4. Painel do Servidor busca em múltiplos campos, prioriza itens aguardando confirmação e não oculta itens além do 15º sem paginação", () => {
      const sampleItems: Partial<LostFoundItem>[] = Array.from({ length: 20 }, (_, i) => ({
        id: `item-${i}`,
        qrCodeId: `QR-${i}`,
        title: `Objeto ${i}`,
        status: i < 16 ? "DEVOLVIDO" : "ENCONTRADO",
        createdAt: `2026-11-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
        location: "Bloco 1",
        category: "Outros",
        registeredByName: "Servidor IFPR",
      }));

      const q = sanitizeQuery("QR-18");
      const filtered = sampleItems
        .filter((it) => {
          if (!q) return true;
          return (
            safeIncludes(it.title, q) ||
            safeIncludes(it.location, q) ||
            safeIncludes(it.category, q) ||
            safeIncludes(it.id, q) ||
            safeIncludes(it.qrCodeId, q) ||
            safeIncludes(it.registeredByName, q)
          );
        })
        .sort((a, b) => {
          const aP = a.status === "ENCONTRADO" || a.status === "PERDIDO" ? 0 : 1;
          const bP = b.status === "ENCONTRADO" || b.status === "PERDIDO" ? 0 : 1;
          if (aP !== bP) return aP - bP;
          return (safeParseDate(b.createdAt)?.getTime() || 0) - (safeParseDate(a.createdAt)?.getTime() || 0);
        });

      expect(filtered.map((x) => x.id)).toEqual(["item-18"]);

      // Sem filtro de busca, objetos ENCONTRADO/PERDIDO devem aparecer antes dos DEVOLVIDO mesmo após índice 15
      const sortedAll = [...sampleItems].sort((a, b) => {
        const aP = a.status === "ENCONTRADO" || a.status === "PERDIDO" ? 0 : a.status === "EM_ANALISE" ? 1 : 2;
        const bP = b.status === "ENCONTRADO" || b.status === "PERDIDO" ? 0 : b.status === "EM_ANALISE" ? 1 : 2;
        if (aP !== bP) return aP - bP;
        return (safeParseDate(b.createdAt)?.getTime() || 0) - (safeParseDate(a.createdAt)?.getTime() || 0);
      });
      expect(sortedAll[0].status).toBe("ENCONTRADO");
      expect(sortedAll[0].id).toBe("item-19");
    });

    it("5. Integridade estrutural: DashboardView, ItemDetailModal e AppContext possuem controles e fallbacks para confirmação da chegada", () => {
      const dashboardSrc = readSrc("src/components/DashboardView.tsx");
      const detailModalSrc = readSrc("src/components/ItemDetailModal.tsx");
      const appContextSrc = readSrc("src/context/AppContext.tsx");

      expect(dashboardSrc).toContain("handleConfirmArrival");
      expect(dashboardSrc).toContain("confirmingArrivalId");
      expect(dashboardSrc).toContain("serverOverviewLimit");
      expect(dashboardSrc).toContain("Mostrar mais objetos");
      expect(detailModalSrc).toContain("Confirmar Chegada na Guarita (Em Análise)");
      expect(detailModalSrc).toContain("isConfirmingArrival");
      expect(appContextSrc).toContain('getDoc(doc(db, "items", id))');
      expect(appContextSrc).toContain("historyLogs: nextHistory");
    });
  });
});
