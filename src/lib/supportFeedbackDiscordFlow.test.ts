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

  it("should handle SMTP dispatch correctly and return status indicators", async () => {
    const sendFeedbackModule = await import("../../api/support/send-feedback");

    const req = {
      method: "POST",
      body: {
        name: "Professor Teste",
        email: "professor@ifpr.edu.br",
        category: "SUPPORT",
        subject: "Dúvida sobre sistema de devoluções",
        message: "Como registrar entrega de pertence com procuração?",
        priority: "ALTA",
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

    expect(responseStatus).toBe(200);
    expect(responseJson.success).toBe(true);
    expect(responseJson.destinationEmail).toBe(OFFICIAL_EMAIL);
    expect(responseJson).toHaveProperty("smtpDispatched");
    expect(responseJson).toHaveProperty("smtpStatus");
  });

  describe("Email Visual Presentation by Category", () => {
    it("should render red header (#DC2626) with white text for BUG_REPORT category", async () => {
      const { buildSupportEmailHtml } = await import("../../api/support/send-feedback");

      const bugTicket = {
        protocol: "IFPR-SUP-BUG12345",
        name: "Aluno IFPR",
        email: "aluno@ifpr.edu.br",
        category: "BUG_REPORT",
        subject: "Erro 500 ao tentar abrir câmera de QR",
        message: "A tela congela ao autorizar a câmera no celular.",
        priority: "ALTA",
        timestamp: "27/09/2026 12:45:00",
        clientDiagnostics: { userAgent: "Mozilla/5.0", platform: "Android" },
      };

      const html = buildSupportEmailHtml(bugTicket, OFFICIAL_EMAIL);

      // Red header background with white text
      expect(html).toContain("background: #DC2626;");
      expect(html).toContain("color: #ffffff;");
      expect(html).toContain("border-left: 4px solid #DC2626;");
      expect(html).toContain("Relato de Bug / Erro no Sistema");
      expect(html).toContain(OFFICIAL_EMAIL);
      expect(html).toContain("IFPR-SUP-BUG12345");
    });

    it("should render green header (#00843D) with white text for FEEDBACK and general support categories", async () => {
      const { buildSupportEmailHtml } = await import("../../api/support/send-feedback");

      const feedbackTicket = {
        protocol: "IFPR-SUP-FDBK9876",
        name: "Servidor IFPR",
        email: "servidor@ifpr.edu.br",
        category: "FEEDBACK",
        subject: "Sugestão de filtro por bloco do campus",
        message: "Gostaria de poder filtrar os itens pelo bloco administrativo.",
        priority: "MEDIA",
        timestamp: "27/09/2026 12:50:00",
      };

      const html = buildSupportEmailHtml(feedbackTicket, OFFICIAL_EMAIL);

      // Green header background with white text
      expect(html).toContain("background: #00843D;");
      expect(html).toContain("color: #ffffff;");
      expect(html).toContain("border-left: 4px solid #00843D;");
      expect(html).toContain("Sugestão ou Melhoria");
      expect(html).toContain(OFFICIAL_EMAIL);
      expect(html).toContain("IFPR-SUP-FDBK9876");
    });
  });
});

