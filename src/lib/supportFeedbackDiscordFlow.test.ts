import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Support Feedback & Bug Report Discord Integration Flow", () => {
  const OFFICIAL_EMAIL = "localizamais0@gmail.com";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should direct all support and bug notifications to localizamais0@gmail.com", async () => {
    const sendFeedbackModule = await import("../../api/support/send-feedback");
    expect(sendFeedbackModule.default).toBeDefined();

    // Verify handler receives and processes tickets to localizamais0@gmail.com
    const req = {
      method: "POST",
      body: {
        name: "Estudante Teste",
        email: "estudante@estudantes.ifpr.edu.br",
        category: "BUG_REPORT",
        subject: "Erro ao visualizar card",
        message: "Passos para reproduzir:\n1. Acessar tela\n2. Clicar no botão",
        priority: "ALTA",
        clientDiagnostics: {
          screen: "1920x1080",
          currentPath: "/suporte/relatar-bug",
          online: true,
        },
      },
    };

    let responseStatus = 200;
    let responseJson: any = null;

    const res = {
      setHeader: vi.fn(),
      status: (code: number) => {
        responseStatus = code;
        return {
          json: (data: any) => {
            responseJson = data;
            return data;
          },
          end: () => {},
        };
      },
      json: (data: any) => {
        responseJson = data;
        return data;
      },
    };

    await sendFeedbackModule.default(req, res);

    expect(responseStatus).toBe(200);
    expect(responseJson).toBeDefined();
    expect(responseJson.success).toBe(true);
    expect(responseJson.destinationEmail).toBe(OFFICIAL_EMAIL);
    expect(responseJson.protocol).toMatch(/^IFPR-SUP-/);
  });

  it("should process FEEDBACK reports properly with resilient Discord fallback", async () => {
    const sendFeedbackModule = await import("../../api/support/send-feedback");

    const req = {
      method: "POST",
      body: {
        name: "Servidor Teste",
        email: "servidor@ifpr.edu.br",
        category: "FEEDBACK",
        subject: "Sugestão de melhoria no leitor de QR",
        message: "Adicionar vibração ao confirmar leitura.",
        priority: "MEDIA",
      },
    };

    let responseStatus = 200;
    let responseJson: any = null;

    const res = {
      setHeader: vi.fn(),
      status: (code: number) => {
        responseStatus = code;
        return {
          json: (data: any) => {
            responseJson = data;
            return data;
          },
          end: () => {},
        };
      },
    };

    await sendFeedbackModule.default(req, res);

    expect(responseStatus).toBe(200);
    expect(responseJson.success).toBe(true);
    expect(responseJson.destinationEmail).toBe(OFFICIAL_EMAIL);
    expect(responseJson.protocol).toBeDefined();
  });

  it("should reject requests missing mandatory fields without crashing", async () => {
    const sendFeedbackModule = await import("../../api/support/send-feedback");

    const req = {
      method: "POST",
      body: {
        name: "",
        email: "",
        subject: "",
        message: "",
      },
    };

    let responseStatus = 200;
    let responseJson: any = null;

    const res = {
      setHeader: vi.fn(),
      status: (code: number) => {
        responseStatus = code;
        return {
          json: (data: any) => {
            responseJson = data;
            return data;
          },
        };
      },
    };

    await sendFeedbackModule.default(req, res);

    expect(responseStatus).toBe(400);
    expect(responseJson.success).toBe(false);
  });
});
