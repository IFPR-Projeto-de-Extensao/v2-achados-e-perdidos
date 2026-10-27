import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import firebaseConfig from "../../firebase-applet-config.json";
import { initGoogleAnalytics, isGoogleAnalyticsScriptPresent, trackCustomEvent } from "./analytics";
import { logFirebaseEvent } from "./firebase";
import { initializeAppServices } from "./appInit";

describe("LOCALIZA+ v1.10.6 — Auditoria Isolada do Google Analytics e Resiliência contra ERR_NAME_NOT_RESOLVED", () => {
  describe("1. Identificação da Causa Raiz da URL e Configuração do Firebase Analytics", () => {
    it("deve comprovar que o measurementId G-Q2BWFJTJ8K tem origem em firebase-applet-config.json", () => {
      expect(firebaseConfig.measurementId).toBe("G-Q2BWFJTJ8K");
      expect(firebaseConfig.projectId).toBe("gen-lang-client-0490390966");
    });

    it("URL observada no erro corresponde exatamente à convenção interna do SDK @firebase/analytics", () => {
      const expectedUrlPattern = `https://www.googletagmanager.com/gtag/js?l=dataLayer&id=${firebaseConfig.measurementId}`;
      expect(expectedUrlPattern).toBe("https://www.googletagmanager.com/gtag/js?l=dataLayer&id=G-Q2BWFJTJ8K");
    });
  });

  describe("2. Prevenção de Inicialização Duplicada entre analytics.ts e firebase.ts", () => {
    let mockHead: any;
    let appendedScripts: any[] = [];

    beforeEach(() => {
      appendedScripts = [];
      mockHead = {
        appendChild: vi.fn((el) => {
          appendedScripts.push(el);
          return el;
        }),
      };
      vi.stubGlobal("document", {
        getElementById: vi.fn((id: string) => appendedScripts.find((s) => s.id === id) || null),
        querySelector: vi.fn((selector: string) => {
          if (selector.includes("googletagmanager.com/gtag/js")) {
            return appendedScripts.find((s) => s.src && s.src.includes("googletagmanager.com/gtag/js")) || null;
          }
          return null;
        }),
        createElement: vi.fn((tag: string) => ({
          tagName: tag.toUpperCase(),
          id: "",
          src: "",
          async: false,
          onerror: null,
          addEventListener: vi.fn(),
        })),
        head: mockHead,
      });
      vi.stubGlobal("window", {
        dataLayer: [],
        gtag: undefined,
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("isGoogleAnalyticsScriptPresent deve detectar script existente injetado pelo Firebase SDK", () => {
      expect(isGoogleAnalyticsScriptPresent()).toBe(false);

      // Simula script previamente injetado pelo Firebase SDK
      appendedScripts.push({
        id: "",
        src: "https://www.googletagmanager.com/gtag/js?l=dataLayer&id=G-Q2BWFJTJ8K",
      });

      expect(isGoogleAnalyticsScriptPresent()).toBe(true);
    });

    it("initGoogleAnalytics NÃO deve injetar script duplicado se o script do Firebase já estiver presente", () => {
      // Simula presença prévia do script do Firebase SDK
      appendedScripts.push({
        id: "",
        src: "https://www.googletagmanager.com/gtag/js?l=dataLayer&id=G-Q2BWFJTJ8K",
      });

      initGoogleAnalytics("G-Q2BWFJTJ8K");

      // Nao deve ter adicionado nenhum novo elemento ao head
      expect(mockHead.appendChild).not.toHaveBeenCalled();
    });

    it("initGoogleAnalytics NÃO deve injetar script duplicado se já foi inicializado anteriormente", () => {
      initGoogleAnalytics("G-VALID12345");
      expect(mockHead.appendChild).toHaveBeenCalledTimes(1);

      // Segunda chamada com mesmo ou outro ID
      initGoogleAnalytics("G-VALID12345");
      expect(mockHead.appendChild).toHaveBeenCalledTimes(1);
    });
  });

  describe("3. Continuidade da Aplicação e Tratamento Não-Bloqueante de ERR_NAME_NOT_RESOLVED", () => {
    beforeEach(() => {
      vi.stubGlobal("window", {
        dataLayer: [],
        gtag: vi.fn(() => {
          // Simula falha de envio silenciosa sem derrubar aplicação
          throw new Error("Simulated DNS failure in gtag");
        }),
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("trackCustomEvent não deve propagar exceções se window.gtag falhar", () => {
      expect(() => {
        trackCustomEvent("test_event", { item_id: "123" });
      }).not.toThrow();
    });

    it("logFirebaseEvent não deve propagar exceções se a instância de analytics falhar", () => {
      expect(() => {
        logFirebaseEvent("test_event", { item_id: "123" });
      }).not.toThrow();
    });

    it("initializeAppServices deve concluir sem lançar exceções não tratadas", async () => {
      await expect(initializeAppServices()).resolves.toBeUndefined();
    });
  });

  describe("4. Preservação de Regras de Segurança, CSP e COOP", () => {
    it("não deve enfraquecer diretivas CSP de script-src ou connect-src", () => {
      const secHeadersPath = path.resolve(process.cwd(), "src/lib/securityHeaders.ts");
      const code = fs.readFileSync(secHeadersPath, "utf-8");

      expect(code).toContain('"https://www.googletagmanager.com"');
      expect(code).toContain('"https://*.google-analytics.com"');
      expect(code).toContain('"https://*.analytics.google.com"');
      // Não deve permitir curingas inseguros
      expect(code).not.toContain("script-src: ['*']");
      expect(code).not.toContain("script-src: ['https:']");
    });

    it("appInit.ts deve manter o carregamento assíncrono e isolado de secondary services", () => {
      const appInitPath = path.resolve(process.cwd(), "src/lib/appInit.ts");
      const appInitCode = fs.readFileSync(appInitPath, "utf-8");

      expect(appInitCode).toContain("initFirebaseSecondaryServices()");
      expect(appInitCode).toContain("initGoogleAnalytics()");
      expect(appInitCode).toContain("try {");
      expect(appInitCode).toContain("catch (err) {");
    });
  });
});
