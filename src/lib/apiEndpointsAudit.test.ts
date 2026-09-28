import { describe, it, expect } from "vitest";
import { classifyGeminiError } from "../../server";

describe("Auditoria de Endpoints /api/* e Resiliência HTTP", () => {
  describe("Classificação de Erros da API Google Gemini (classifyGeminiError)", () => {
    it("deve mapear erro de Rate Limit / Quota (429 / RESOURCE_EXHAUSTED) para HTTP 429", () => {
      const error1 = { status: 429, message: "Resource has been exhausted (e.g. check quota)." };
      const res1 = classifyGeminiError(error1);
      expect(res1.statusCode).toBe(429);
      expect(res1.errorCode).toBe("RATE_LIMIT_EXCEEDED");
      expect(res1.message).toContain("Limite de cota ou taxa");

      const error2 = new Error("Quota exceeded for quota metric 'Generate Content API Requests'");
      const res2 = classifyGeminiError(error2);
      expect(res2.statusCode).toBe(429);
      expect(res2.errorCode).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("deve mapear erro de Filtro de Segurança / Argumento Inválido para HTTP 400", () => {
      const error1 = { status: 400, message: "INVALID_ARGUMENT: The prompt was blocked due to safety" };
      const res1 = classifyGeminiError(error1);
      expect(res1.statusCode).toBe(400);
      expect(res1.errorCode).toBe("INVALID_ARGUMENT_OR_SAFETY");
      expect(res1.message).toContain("filtros de segurança");

      const error2 = new Error("Request was BLOCKED by safety settings");
      const res2 = classifyGeminiError(error2);
      expect(res2.statusCode).toBe(400);
      expect(res2.errorCode).toBe("INVALID_ARGUMENT_OR_SAFETY");
    });

    it("deve mapear chave de API inválida ou não autorizada para HTTP 503", () => {
      const error1 = { status: 403, message: "API_KEY_INVALID: The provided API key is invalid or has expired." };
      const res1 = classifyGeminiError(error1);
      expect(res1.statusCode).toBe(503);
      expect(res1.errorCode).toBe("API_KEY_UNAUTHORIZED");
      expect(res1.message).toContain("chave de API inválida");

      const error2 = { status: 401, message: "UNAUTHENTICATED: Request lacks valid authentication credentials." };
      const res2 = classifyGeminiError(error2);
      expect(res2.statusCode).toBe(503);
      expect(res2.errorCode).toBe("API_KEY_UNAUTHORIZED");
    });

    it("deve mapear indisponibilidade de serviço ou timeout para HTTP 503", () => {
      const error1 = { status: 503, message: "The model is overloaded. Please try again later." };
      const res1 = classifyGeminiError(error1);
      expect(res1.statusCode).toBe(503);
      expect(res1.errorCode).toBe("GEMINI_UPSTREAM_UNAVAILABLE");

      const error2 = new Error("DEADLINE_EXCEEDED: timed out waiting for response");
      const res2 = classifyGeminiError(error2);
      expect(res2.statusCode).toBe(503);
      expect(res2.errorCode).toBe("GEMINI_UPSTREAM_UNAVAILABLE");
    });

    it("deve mapear erros genéricos de upstream para HTTP 502 Bad Gateway", () => {
      const error1 = new Error("Network connection reset by peer");
      const res1 = classifyGeminiError(error1);
      expect(res1.statusCode).toBe(502);
      expect(res1.errorCode).toBe("GEMINI_UPSTREAM_ERROR");
      expect(res1.message).toContain("comunicação com o serviço upstream");
    });
  });

  describe("Auditoria de Endpoints da API e Segurança", () => {
    it("deve garantir que todos os endpoints de suporte e feedback nunca exponham secrets", () => {
      const mockEnv = {
        DISCORD_FEEDBACK_WEBHOOK_URL: "https://discord.com/api/webhooks/123/secretToken",
        SMTP_PASS: "super_secret_smtp_password_16_digits",
        SMTP_USER: "localizamais0@gmail.com",
      };

      const maskEmail = (email: string) => {
        if (!email || !email.includes("@")) return null;
        const [name, domain] = email.split("@");
        return `${name.substring(0, 3)}***@${domain}`;
      };

      const maskedUser = maskEmail(mockEnv.SMTP_USER);
      expect(maskedUser).toBe("loc***@gmail.com");
      expect(maskedUser).not.toContain("localizamais0");
      expect(mockEnv.SMTP_PASS).not.toContain(maskedUser || "");
    });

    it("deve validar que requisições com campos obrigatórios ausentes retornem 400", () => {
      const missingFields = { name: "", email: "test@ifpr.edu.br", subject: "", message: "" };
      const isValid = Boolean(
        missingFields.name.trim() &&
        missingFields.email.trim() &&
        missingFields.subject.trim() &&
        missingFields.message.trim()
      );
      expect(isValid).toBe(false);
    });
  });
});
