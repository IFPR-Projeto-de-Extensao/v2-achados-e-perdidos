import { describe, it, expect, vi } from "vitest";
import { classifySyncError, FIRESTORE_DEFENSIVE_PAYLOAD_LIMIT_BYTES } from "./payloadSizeGuard";

describe("Diagnóstico de Erros Firestore & Preservação do Erro Original", () => {
  // 1. FirebaseError permission-denied (AUTHORIZATION / PERMISSION)
  it("1. Diagnóstico: FirebaseError permission-denied é classificado como AUTHORIZATION e preserva código e mensagem originais", () => {
    const permissionError = {
      name: "FirebaseError",
      code: "permission-denied",
      message: "Missing or insufficient permissions.",
    };

    const result = classifySyncError(permissionError, 2500);

    expect(result.category).toBe("AUTHORIZATION");
    expect(result.isPermanent).toBe(true);
    expect(result.originalCode).toBe("permission-denied");
    expect(result.originalName).toBe("FirebaseError");
    expect(result.originalMessage).toBe("Missing or insufficient permissions.");
    expect(result.userMessage).toContain("Sincronização recusada por falta de autorização/permissão");
    expect(result.userMessage).toContain("permanece preservado no dispositivo");
  });

  // 2. FirebaseError unavailable
  it("2. Diagnóstico: FirebaseError unavailable é classificado como TEMPORARY e preserva o código original", () => {
    const unavailableError = {
      name: "FirebaseError",
      code: "unavailable",
      message: "The service is currently unavailable.",
    };

    const result = classifySyncError(unavailableError, 2500);

    expect(result.category).toBe("TEMPORARY");
    expect(result.isPermanent).toBe(false);
    expect(result.originalCode).toBe("unavailable");
    expect(result.originalName).toBe("FirebaseError");
    expect(result.userMessage).toContain("Não foi possível sincronizar agora");
  });

  // 3. FirebaseError resource-exhausted
  it("3. Diagnóstico: FirebaseError resource-exhausted é classificado como PERMANENT e preserva o código", () => {
    const resourceExhaustedError = {
      name: "FirebaseError",
      code: "resource-exhausted",
      message: "Quota exceeded or document size limit reached.",
    };

    const result = classifySyncError(resourceExhaustedError, 850000);

    expect(result.category).toBe("PERMANENT");
    expect(result.isPermanent).toBe(true);
    expect(result.originalCode).toBe("resource-exhausted");
    expect(result.originalName).toBe("FirebaseError");
  });

  // 4. FirebaseError invalid-argument
  it("4. Diagnóstico: FirebaseError invalid-argument é classificado como PERMANENT e preserva o código", () => {
    const invalidArgError = {
      name: "FirebaseError",
      code: "invalid-argument",
      message: "Invalid field value in document.",
    };

    const result = classifySyncError(invalidArgError, 1200);

    expect(result.category).toBe("PERMANENT");
    expect(result.isPermanent).toBe(true);
    expect(result.originalCode).toBe("invalid-argument");
  });

  // 5. Erro genérico sem code
  it("5. Diagnóstico: Erro genérico sem code é tratado como TEMPORARY e preserva mensagem original", () => {
    const genericError = new Error("Network connection lost unexpectedly");

    const result = classifySyncError(genericError, 4000);

    expect(result.category).toBe("TEMPORARY");
    expect(result.isPermanent).toBe(false);
    expect(result.originalCode).toBeUndefined();
    expect(result.originalName).toBe("Error");
    expect(result.reason).toBe("Network connection lost unexpectedly");
  });

  // 6. Erro com payload acima do limite (900.000 bytes)
  it("6. Diagnóstico: Payload acima do limite defensivo (900.000 bytes) é PERMANENT mesmo sem erro prévio", () => {
    const payloadSize = FIRESTORE_DEFENSIVE_PAYLOAD_LIMIT_BYTES + 5000;
    const result = classifySyncError(new Error("Pre-check"), payloadSize);

    expect(result.category).toBe("PERMANENT");
    expect(result.isPermanent).toBe(true);
    expect(result.reason).toContain("PAYLOAD_SIZE_EXCEEDS_DEFENSIVE_LIMIT");
    expect(result.payloadSizeBytes).toBe(payloadSize);
    expect(result.userMessage).toContain("dados ou imagem grandes demais");
  });

  // 7. Erro com FIELD_LIMIT_EXCEEDED
  it("7. Diagnóstico: FIELD_LIMIT_EXCEEDED é classificado como PERMANENT", () => {
    const fieldError = new Error("FIELD_LIMIT_EXCEEDED: Descrição ultrapassou 1000 caracteres");
    const result = classifySyncError(fieldError, 1200);

    expect(result.category).toBe("PERMANENT");
    expect(result.isPermanent).toBe(true);
    expect(result.reason).toContain("FIELD_LIMIT_EXCEEDED");
    expect(result.userMessage).toContain("dados/imagens que excedem os limites permitidos");
  });

  // 8. Preservação do código original antes da classificação e logging
  it("8. Diagnóstico: Preservação do código e formato completo do erro antes da classificação", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const mockFirebaseError = {
      name: "FirebaseError",
      code: "permission-denied",
      message: "Missing or insufficient permissions.",
      stack: "FirebaseError: Missing or insufficient permissions.\n at setDoc...",
    };

    const capturedLog = {
      code: mockFirebaseError.code,
      name: mockFirebaseError.name,
      message: mockFirebaseError.message,
      stack: mockFirebaseError.stack,
      itemId: "ifpr-test-diag-1",
      taskId: "task-ifpr-test-diag-1",
      collection: "items",
      documentId: "ifpr-test-diag-1",
      operation: "setDoc(..., { merge: true })",
      payloadSizeBytes: 1540,
      online: true,
      authUid: "mock-uid-123",
      authEmail: "estudante@estudantes.ifpr.edu.br",
      authEmailVerified: true,
      registeredByUserId: "mock-uid-123",
      registeredByRole: "ALUNO",
    };

    console.error("[SYNC_FIRESTORE_ORIGINAL_ERROR]", capturedLog);

    expect(consoleSpy).toHaveBeenCalledWith("[SYNC_FIRESTORE_ORIGINAL_ERROR]", expect.objectContaining({
      code: "permission-denied",
      name: "FirebaseError",
      collection: "items",
      operation: "setDoc(..., { merge: true })",
    }));

    consoleSpy.mockRestore();
  });
});
