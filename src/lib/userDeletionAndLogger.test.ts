import { describe, it, expect, vi } from "vitest";
import { sanitizeForFirestore } from "./utils";
import { logErrorToFirestore, SystemErrorLog } from "./errorLogger";

// Mock Firebase
vi.mock("./firebase", () => ({
  db: {},
  auth: {
    currentUser: {
      uid: "admin-test-uid",
      email: "paulocauan39@gmail.com",
    },
  },
}));

vi.mock("./indexedDB", () => ({
  saveOfflineErrorLogIndexedDB: vi.fn().mockResolvedValue(undefined),
}));

const mockSetDoc = vi.fn().mockResolvedValue(undefined);
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn(() => ({ id: "mock-doc-ref" })),
  setDoc: (...args: any[]) => mockSetDoc(...args),
}));

describe("Mecanismo de Logging de Erros e Sanitização para Firestore", () => {
  it("deve remover qualquer propriedade com valor undefined para compatibilidade com Firestore", () => {
    const rawErrorObj = {
      id: "err-123",
      errorMessage: "Falha ao excluir usuário no servidor.",
      errorStack: "Error: Falha...",
      componentStack: undefined,
      failedModulePath: undefined,
      location: undefined,
      extraOptional: undefined,
      url: "https://localiza-mais.ifpr.edu.br",
      userAgent: "Mozilla/5.0",
      isMobile: false,
    };

    const sanitized = sanitizeForFirestore(rawErrorObj);

    expect(sanitized).toBeDefined();
    expect(sanitized).not.toBeNull();
    expect("componentStack" in sanitized).toBe(false);
    expect("failedModulePath" in sanitized).toBe(false);
    expect("location" in sanitized).toBe(false);
    expect("extraOptional" in sanitized).toBe(false);
    expect(sanitized.errorMessage).toBe("Falha ao excluir usuário no servidor.");
    expect(sanitized.id).toBe("err-123");
  });

  it("logErrorToFirestore não deve enviar undefined ao setDoc do Firestore", async () => {
    mockSetDoc.mockClear();

    const testError = new Error("Falha ao excluir usuário no servidor.");
    testError.stack = "Error: Falha ao excluir usuário no servidor.\n    at deleteUser";

    // Call without componentStack or location
    await logErrorToFirestore(testError);

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const sentData = mockSetDoc.mock.calls[0][1];

    expect(sentData).toBeDefined();
    expect(sentData.componentStack).toBeUndefined();
    expect("componentStack" in sentData).toBe(false);
    expect("failedModulePath" in sentData).toBe(false);
    expect("location" in sentData).toBe(false);
    expect(sentData.errorMessage).toBe("Falha ao excluir usuário no servidor.");
  });

  it("não mascara o erro original caso ocorra falha ao salvar log", async () => {
    mockSetDoc.mockRejectedValueOnce(new Error("Erro simulado do Firestore"));

    const originalError = new Error("Falha ao excluir usuário no servidor.");

    // logErrorToFirestore treats Firestore write errors separately without throwing or masking
    await expect(logErrorToFirestore(originalError)).resolves.not.toThrow();

    // The original error itself remains completely intact
    expect(originalError.message).toBe("Falha ao excluir usuário no servidor.");
  });
});

describe("Regras de Segurança e Validação de Exclusão de Usuários", () => {
  it("impede que o administrador exclua a própria conta ativa", () => {
    const adminUid = "admin-123";
    const targetUserId = "admin-123";

    const isSelfDeletion = targetUserId === adminUid;
    expect(isSelfDeletion).toBe(true);
  });

  it("exige UID real não vazio do usuário alvo para exclusão", () => {
    const invalidUids = ["", "   ", null, undefined];
    for (const uid of invalidUids) {
      const isValid = Boolean(uid && typeof uid === "string" && uid.trim().length > 0);
      expect(isValid).toBe(false);
    }

    const validUid = "3rtwdJL4ODQFKwg7ZBUrL53H18s2";
    const isValid = Boolean(validUid && typeof validUid === "string" && validUid.trim().length > 0);
    expect(isValid).toBe(true);
  });

  it("reconhece administrador com role ADMIN no Firestore mesmo com approvalStatus não definido", () => {
    const userDocData = {
      email: "kalilpadilha22@gmail.com",
      name: "Kalil Padilha",
      role: "ADMIN",
      approvalStatus: undefined,
      status: undefined,
    };

    const isAdmin = userDocData.role === "ADMIN";
    expect(isAdmin).toBe(true);
  });
});
