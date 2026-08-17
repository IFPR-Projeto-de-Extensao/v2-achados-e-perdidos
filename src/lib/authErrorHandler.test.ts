import { describe, it, expect, vi } from "vitest";
import { parseAuthError, handleAuthError } from "./authErrorHandler";

describe("authErrorHandler", () => {
  it("correctly parses auth/unauthorized-domain with domain guidance", () => {
    const error = { code: "auth/unauthorized-domain", message: "Domain not authorized" };
    const parsed = parseAuthError(error);

    expect(parsed.isUnauthorizedDomain).toBe(true);
    expect(parsed.technicalCode).toBe("auth/unauthorized-domain");
    expect(parsed.userMessage).toContain("não está autorizado");
    expect(parsed.actionHint).toBeDefined();
  });

  it("handles popup closed by user gracefully", () => {
    const error = { code: "auth/popup-closed-by-user", message: "Closed by user" };
    const parsed = parseAuthError(error);

    expect(parsed.isPopupClosed).toBe(true);
    expect(parsed.userMessage).toContain("cancelado");
  });

  it("handles popup blocked by browser", () => {
    const error = { code: "auth/popup-blocked", message: "Popup blocked" };
    const parsed = parseAuthError(error);

    expect(parsed.isPopupBlocked).toBe(true);
    expect(parsed.userMessage).toContain("bloqueada");
  });

  it("handles invalid credentials", () => {
    const error = { code: "auth/invalid-credential", message: "Invalid credentials" };
    const parsed = parseAuthError(error);

    expect(parsed.userMessage).toContain("E-mail ou senha incorretos");
  });

  it("dispatches error toast via handleAuthError", () => {
    const addToastMock = vi.fn();
    const error = { code: "auth/unauthorized-domain", message: "Domain not authorized" };

    const parsed = handleAuthError(error, { addToast: addToastMock });

    expect(addToastMock).toHaveBeenCalledWith(
      expect.stringContaining("não autorizado no Firebase"),
      "error"
    );
    expect(parsed.isUnauthorizedDomain).toBe(true);
  });
});
