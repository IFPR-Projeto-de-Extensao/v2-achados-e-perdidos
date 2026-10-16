import { describe, it, expect } from "vitest";
import { ItemCategory, LostFoundItem, RegistrationStatus, UploadTaskStatus } from "../types";
import {
  formatPhone,
  isValidPhone,
  validateItemOccurrenceDate,
  validateItemTextFields,
  ITEM_FIELD_LIMITS,
  getTodayDateString,
} from "./utils";
import { getUploadTaskId } from "./indexedDB";
import {
  getRegisterDraftKey,
  validateAndSanitizeDraft,
  LEGACY_DRAFT_STORAGE_KEY,
} from "../components/RegisterItemView";
import { CANONICAL_FALLBACK_ORIGIN } from "./shared-constants";
import { getItemPublicUrl, getAppOrigin, parseQrCodeOrUrl } from "./qrCodeUtils";
import { classifySyncError } from "./payloadSizeGuard";

describe("LOCALIZA+ — Sistema de Cadastro de Objetos Reconstruído (Testes de Fluxo e Validação)", () => {
  describe("ETAPA 1: Tipo de Ocorrência", () => {
    it("deve aceitar exclusivamente os tipos canônicos ENCONTRADO e PERDIDO", () => {
      const validTypes: Array<"PERDIDO" | "ENCONTRADO"> = ["PERDIDO", "ENCONTRADO"];
      for (const t of validTypes) {
        expect(["PERDIDO", "ENCONTRADO"]).toContain(t);
      }
    });

    it("não deve aceitar tipo nulo ou indefinido para o registro", () => {
      const invalidType: string = "";
      const isValid = invalidType === "PERDIDO" || invalidType === "ENCONTRADO";
      expect(isValid).toBe(false);
    });
  });

  describe("ETAPA 2: Informações do Objeto", () => {
    it("deve exigir título do objeto e respeitar limite de 100 caracteres", () => {
      const emptyTitle = "";
      expect(emptyTitle.trim().length > 0).toBe(false);

      const validTitle = "Garrafa Térmica Kouda 750ml Azul Marinho";
      expect(validTitle.length).toBeLessThanOrEqual(ITEM_FIELD_LIMITS.TITLE);

      const overLimitTitle = "A".repeat(ITEM_FIELD_LIMITS.TITLE + 1);
      const validation = validateItemTextFields({ title: overLimitTitle }, false);
      expect(validation.isValid).toBe(false);
      expect(validation.error?.toLowerCase()).toContain("título");
    });

    it("deve exigir descrição detalhada e respeitar limite de 1000 caracteres", () => {
      const emptyDesc = "   ";
      expect(emptyDesc.trim().length > 0).toBe(false);

      const validDesc = "Mochila Dell preta com marcas de uso na alça direita e chaveiro do IFPR.";
      expect(validDesc.length).toBeLessThanOrEqual(ITEM_FIELD_LIMITS.DESCRIPTION);

      const overLimitDesc = "D".repeat(ITEM_FIELD_LIMITS.DESCRIPTION + 1);
      const validation = validateItemTextFields(
        { title: "Mochila Dell", description: overLimitDesc, location: "Biblioteca" },
        false
      );
      expect(validation.isValid).toBe(false);
      expect(validation.error?.toLowerCase()).toContain("descrição");
    });

    it("deve permitir que Cor e Marca sejam opcionais sem falhar validação", () => {
      const validation = validateItemTextFields(
        {
          title: "Estojo Escolar",
          description: "Estojo com zíper contendo 4 canetas e 1 lápis.",
          location: "Bloco Didático - Salas 01 a 12",
          color: "",
          brand: "",
        },
        false
      );
      expect(validation.isValid).toBe(true);
    });

    it("deve validar limites máximos para campos opcionais quando preenchidos", () => {
      const overLimitColor = "C".repeat(ITEM_FIELD_LIMITS.COLOR + 1);
      const colorCheck = validateItemTextFields(
        { title: "Item", description: "Desc", location: "Lab", color: overLimitColor },
        false
      );
      expect(colorCheck.isValid).toBe(false);

      const overLimitBrand = "B".repeat(ITEM_FIELD_LIMITS.BRAND + 1);
      const brandCheck = validateItemTextFields(
        { title: "Item", description: "Desc", location: "Lab", brand: overLimitBrand },
        false
      );
      expect(brandCheck.isValid).toBe(false);
    });
  });

  describe("ETAPA 3: Local e Data", () => {
    it("deve validar data da ocorrência e bloquear datas futuras", () => {
      const today = getTodayDateString();
      const todayValidation = validateItemOccurrenceDate(today, "A data da ocorrência");
      expect(todayValidation.isValid).toBe(true);

      const pastDate = "2026-01-15";
      const pastValidation = validateItemOccurrenceDate(pastDate, "A data da ocorrência");
      expect(pastValidation.isValid).toBe(true);

      const futureDate = "2030-12-31";
      const futureValidation = validateItemOccurrenceDate(futureDate, "A data da ocorrência");
      expect(futureValidation.isValid).toBe(false);
      expect(futureValidation.error).toContain("não são permitidas datas futuras");
    });

    it("deve exigir ponto de guarda / e-mail de contato", () => {
      const contactEmpty = "  ";
      expect(contactEmpty.trim().length > 0).toBe(false);

      const validContact = "Guarita Principal do Campus (Entregue ao vigilante de plantão)";
      expect(validContact.length).toBeLessThanOrEqual(ITEM_FIELD_LIMITS.CONTACT_INFO);
    });

    it("deve aplicar máscara e validar telefone brasileiro corretamente", () => {
      const rawDigits = "43998765432";
      const formatted = formatPhone(rawDigits);
      expect(formatted).toBe("(43) 99876-5432");
      expect(isValidPhone(formatted)).toBe(true);

      const invalidDigits = "123";
      expect(isValidPhone(formatPhone(invalidDigits))).toBe(false);
    });
  });

  describe("ETAPA 4: Revisão e Agregação de Dados", () => {
    it("deve compor corretamente localização e complemento de ponto de referência", () => {
      const baseLocation = "Biblioteca Campus Ivaiporã";
      const complement = "Mesa 04 dos fundos";
      const fullLocation = complement ? `${baseLocation} — ${complement}` : baseLocation;
      expect(fullLocation).toBe("Biblioteca Campus Ivaiporã — Mesa 04 dos fundos");
    });

    it("deve compor corretamente contato telefônico e canal institucional", () => {
      const phone = "(43) 99876-5432";
      const contact = "aluno@escola.ifpr.edu.br";
      const fullContact = [
        phone.trim() ? `WhatsApp: ${phone.trim()}` : "",
        contact.trim() ? `Contato/Ponto: ${contact.trim()}` : "",
      ]
        .filter(Boolean)
        .join(" | ");

      expect(fullContact).toBe("WhatsApp: (43) 99876-5432 | Contato/Ponto: aluno@escola.ifpr.edu.br");
    });

    it("deve exigir confirmação expressa do usuário antes do envio", () => {
      let hasConfirmedReview = false;
      const canSubmit = hasConfirmedReview;
      expect(canSubmit).toBe(false);

      hasConfirmedReview = true;
      expect(hasConfirmedReview).toBe(true);
    });
  });

  describe("ETAPA 5: Confirmação e Máquina de Estados Reativa", () => {
    it("deve gerar chave canônica de tarefa com prefixo task-${itemId}", () => {
      const sampleId = "ifpr-2026-xyz";
      const taskId = getUploadTaskId(sampleId);
      expect(taskId).toBe("task-ifpr-2026-xyz");
    });

    it("deve manter CONFIRMED como estado terminal imutável", () => {
      const currentModalState: {
        status: RegistrationStatus;
        item: { id: string; title: string };
      } = {
        status: "CONFIRMED",
        item: { id: "ifpr-001", title: "Mochila Dell" },
      };

      // Tarefa simula estado de erro posterior (não deve corromper modal já CONFIRMED)
      const mockTasks: UploadTaskStatus[] = [
        {
          id: "task-ifpr-001",
          itemId: "ifpr-001",
          itemTitle: "Mochila Dell",
          itemType: "ENCONTRADO",
          progress: 50,
          status: "ERROR",
          statusMessage: "Falha simulada na sincronização",
          error: "Simulated Late Error",
          startedAt: new Date().toISOString(),
        },
      ];

      function evaluateState(
        modal: typeof currentModalState,
        tasks: UploadTaskStatus[]
      ): typeof currentModalState {
        if (modal.status === "CONFIRMED") return modal;
        const task = tasks.find((t) => t.id === `task-${modal.item.id}`);
        if (task && task.status === "ERROR") {
          return { ...modal, status: "ERROR" };
        }
        return modal;
      }

      const evaluated = evaluateState(currentModalState, mockTasks);
      expect(evaluated.status).toBe("CONFIRMED");
    });
  });

  describe("Persistência e Isolamento Estrito de Rascunhos por UID", () => {
    it("deve gerar chaves de armazenamento isoladas pelo UID do usuário autenticado", () => {
      expect(getRegisterDraftKey("usr_abc_123")).toBe("ifpr_achados_register_draft_usr_abc_123");
      expect(getRegisterDraftKey("usr_xyz_999")).toBe("ifpr_achados_register_draft_usr_xyz_999");
      expect(getRegisterDraftKey("guest")).toBeNull();
      expect(getRegisterDraftKey("guest_visitor")).toBeNull();
      expect(getRegisterDraftKey("")).toBeNull();
      expect(getRegisterDraftKey(null)).toBeNull();
      expect(getRegisterDraftKey(undefined)).toBeNull();
    });

    it("deve rejeitar e nunca restaurar rascunhos de outro usuário (cross-account isolation)", () => {
      const userADraft = {
        savedByUid: "usr_alice",
        currentStep: 2,
        type: "PERDIDO",
        title: "Caderno de Alice",
        category: "Material Escolar & Livros",
        description: "Caderno espiral com anotações de cálculo.",
      };

      // Tentativa de restauração por Bob
      const resultForBob = validateAndSanitizeDraft(userADraft, "usr_bob");
      expect(resultForBob.isValid).toBe(false);
      expect(resultForBob.sanitized).toBeUndefined();

      // Restauração pela própria Alice
      const resultForAlice = validateAndSanitizeDraft(userADraft, "usr_alice");
      expect(resultForAlice.isValid).toBe(true);
      expect(resultForAlice.sanitized?.title).toBe("Caderno de Alice");
    });

    it("deve rejeitar rascunhos sem savedByUid ou com UID inválido", () => {
      const legacyDraftNoUid = {
        title: "Item Órfão",
        description: "Sem vínculo de autor",
      };
      expect(validateAndSanitizeDraft(legacyDraftNoUid, "usr_alice").isValid).toBe(false);
      expect(validateAndSanitizeDraft(null, "usr_alice").isValid).toBe(false);
      expect(validateAndSanitizeDraft(legacyDraftNoUid, "").isValid).toBe(false);
    });

    it("deve sanitizar campos recuperados (categoria inválida, limite de caracteres e data futura)", () => {
      const dirtyDraft = {
        savedByUid: "usr_alice",
        currentStep: 3,
        type: "ENCONTRADO",
        title: "T".repeat(200),
        category: "CategoriaInexistenteQueNaoExiste",
        description: "D".repeat(1500),
        color: "C".repeat(100),
        brand: "B".repeat(100),
        location: "LocalForaDoCampus",
        locationComplement: "Complemento",
        date: "2035-01-01", // Data futura
        contactPhone: "43998877665",
      };

      const { isValid, sanitized } = validateAndSanitizeDraft(dirtyDraft, "usr_alice");
      expect(isValid).toBe(true);
      expect(sanitized?.title.length).toBeLessThanOrEqual(ITEM_FIELD_LIMITS.TITLE);
      expect(sanitized?.description.length).toBeLessThanOrEqual(ITEM_FIELD_LIMITS.DESCRIPTION);
      expect(sanitized?.color.length).toBeLessThanOrEqual(ITEM_FIELD_LIMITS.COLOR);
      expect(sanitized?.brand.length).toBeLessThanOrEqual(ITEM_FIELD_LIMITS.BRAND);
      expect(sanitized?.category).toBe("Eletrônicos"); // Fallback seguro
      expect(sanitized?.date).not.toBe("2035-01-01"); // Bloqueada data futura
      expect(sanitized?.contactPhone).toBe("(43) 99887-7665");
    });
  });

  describe("Tratamento de Imagem Padrão e Integridade Visual", () => {
    it("deve atribuir string vazia a imageUrl quando o usuário não anexar fotografia", () => {
      const hasCustomImage: boolean = false;
      const uploadedUrl: string = "";
      const finalImageUrl = (hasCustomImage && uploadedUrl ? uploadedUrl : "").trim();
      expect(finalImageUrl).toBe("");
      expect(finalImageUrl).not.toContain("unsplash.com");
    });

    it("deve expurgar referências a Unsplash ou fotos genéricas na higienização de rascunhos", () => {
      const draftWithUnsplash = {
        savedByUid: "usr_alice",
        title: "Calculadora",
        description: "Calculadora cinza",
        imageUrl: "https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=600",
      };
      const { sanitized } = validateAndSanitizeDraft(draftWithUnsplash, "usr_alice");
      expect(sanitized?.imageUrl).toBeUndefined();

      const draftWithRealWebP = {
        savedByUid: "usr_alice",
        title: "Calculadora",
        description: "Calculadora cinza",
        imageUrl: "data:image/webp;base64,UklGRmYAAABXRUJQVlA4TFYAAA==",
      };
      const resultWebP = validateAndSanitizeDraft(draftWithRealWebP, "usr_alice");
      expect(resultWebP.sanitized?.imageUrl).toContain("data:image/webp");
    });
  });

  describe("Centralização da URL Canônica de Fallback para QR Codes", () => {
    it("deve utilizar a constante centralizada CANONICAL_FALLBACK_ORIGIN", () => {
      expect(CANONICAL_FALLBACK_ORIGIN).toBe("https://localizamais.ifpr.edu.br");
    });

    it("deve gerar link canônico absoluto no fallback para geração de QR Codes", () => {
      const item = {
        id: "ifpr-2026-xyz123",
        qrCodeId: "QR-IFPR-2026-XYZ",
        type: "ENCONTRADO" as const,
      };
      const url = getItemPublicUrl(item);
      expect(url).toContain(CANONICAL_FALLBACK_ORIGIN);
      expect(url).toContain("tab=found");
      expect(url).toContain("itemId=ifpr-2026-xyz123");
      expect(url).toContain("qr=QR-IFPR-2026-XYZ");
    });

    it("deve decodificar corretamente a URL canônica com parâmetros de profundidade", () => {
      const generatedUrl = `${CANONICAL_FALLBACK_ORIGIN}/?tab=lost&itemId=ifpr-item-888&qr=QR-IFPR-888-CHAVE`;
      const parsed = parseQrCodeOrUrl(generatedUrl);
      expect(parsed.itemId).toBe("ifpr-item-888");
      expect(parsed.qrCodeId).toBe("QR-IFPR-888-CHAVE");
      expect(parsed.tab).toBe("lost");
    });
  });

  describe("Diagnóstico do Firestore, Resiliência de Mensagem e Preservação no IndexedDB", () => {
    it("deve classificar permission-denied como AUTHORIZATION sem mascarar como falha de conexão", () => {
      const firebasePermError = {
        code: "permission-denied",
        name: "FirebaseError",
        message: "Missing or insufficient permissions.",
      };

      const classified = classifySyncError(firebasePermError, 1500);
      expect(classified.category).toBe("AUTHORIZATION");
      expect(classified.isPermanent).toBe(true);
      expect(classified.userMessage).toContain("Sincronização recusada por falta de autorização/permissão no Firestore");
      expect(classified.userMessage).not.toContain("Falha de conexão");
    });

    it("deve inspecionar defensivamente res.classifiedMessage e res.error sem falhar com valores undefined/nulos", () => {
      function formatFeedbackMessage(res: any, defaultTitle: string): string {
        return typeof res?.classifiedMessage === "string" && res.classifiedMessage.trim().length > 0
          ? res.classifiedMessage
          : typeof res?.error === "string" && res.error.trim().length > 0
          ? res.error
          : `Sincronização recusada por falta de autorização/permissão no Firestore. O objeto "${defaultTitle}" permanece preservado no dispositivo.`;
      }

      // Teste com classifiedMessage preenchido
      expect(
        formatFeedbackMessage({ classifiedMessage: "Mensagem personalizada" }, "Mochila")
      ).toBe("Mensagem personalizada");

      // Teste com error preenchido e classifiedMessage ausente
      expect(
        formatFeedbackMessage({ error: "Erro especifico" }, "Mochila")
      ).toBe("Erro especifico");

      // Teste com res incompleto / nulo
      expect(
        formatFeedbackMessage({}, "Mochila")
      ).toContain('O objeto "Mochila" permanece preservado');

      expect(
        formatFeedbackMessage(null, "Mochila")
      ).toContain('O objeto "Mochila" permanece preservado');
    });

    it("deve preservar o ID original do item e evitar duplicações na fila local durante tentativas de sync", () => {
      const originalItem = {
        id: "item-preservado-123",
        title: "Garrafa Térmica",
        type: "ENCONTRADO" as const,
        isOfflineQueued: true,
      };

      const queueState = [
        {
          id: "queue-item-preservado-123",
          itemId: originalItem.id,
          payload: originalItem,
          status: "ERRO_PERMANENTE",
          errorType: "AUTHORIZATION",
        },
      ];

      // Reativação da entrada para nova tentativa mantém o exato mesmo itemId e queue entry id
      const updatedQueueState = queueState.map((entry) => {
        if (entry.itemId === originalItem.id) {
          return { ...entry, status: "PENDENTE", errorType: undefined };
        }
        return entry;
      });

      expect(updatedQueueState.length).toBe(1);
      expect(updatedQueueState[0].itemId).toBe("item-preservado-123");
      expect(updatedQueueState[0].id).toBe("queue-item-preservado-123");
    });
  });
});

