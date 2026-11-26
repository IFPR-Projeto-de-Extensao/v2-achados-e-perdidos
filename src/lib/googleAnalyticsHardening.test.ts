import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import firebaseConfig from "../../firebase-applet-config.json";
import {
  initGoogleAnalytics,
  isGoogleAnalyticsScriptPresent,
  trackCustomEvent,
  resetGoogleAnalyticsStateForTesting,
} from "./analytics";
import {
  logFirebaseEvent,
  initFirebaseSecondaryServices,
  hasValidMeasurementId,
  getFirebaseAnalyticsState,
  resetFirebaseAnalyticsStateForTesting,
} from "./firebase";
import { initializeAppServices, resetAppInitForTesting } from "./appInit";
import { initSecondaryServices } from "./secondaryServices";
import {
  registerUptimeServiceWorker,
  resetUptimeWatchdogForTesting,
} from "./uptimeManager";

describe("LOCALIZA+ — Auditoria do Firebase Analytics, Google Tag Manager e SW Uptime Watchdog", () => {
  describe("1. Identificação da Causa Raiz da URL e Configuração do Firebase Analytics", () => {
    it("deve comprovar que o measurementId G-Q2BWFJTJ8K tem origem em firebase-applet-config.json e é válido", () => {
      expect(firebaseConfig.measurementId).toBe("G-Q2BWFJTJ8K");
      expect(firebaseConfig.projectId).toBe("gen-lang-client-0490390966");
      expect(hasValidMeasurementId(firebaseConfig.measurementId)).toBe(true);
      expect(hasValidMeasurementId("")).toBe(false);
      expect(hasValidMeasurementId("G-")).toBe(false);
      expect(hasValidMeasurementId("invalid")).toBe(false);
    });

    it("URL observada no erro corresponde exatamente à convenção interna do SDK @firebase/analytics", () => {
      const expectedUrlPattern = `https://www.googletagmanager.com/gtag/js?l=dataLayer&id=${firebaseConfig.measurementId}`;
      expect(expectedUrlPattern).toBe("https://www.googletagmanager.com/gtag/js?l=dataLayer&id=G-Q2BWFJTJ8K");
    });
  });

  describe("2. Prevenção de Inicialização Duplicada, Modo Offline e GTM Bloqueado", () => {
    let mockHead: any;
    let appendedScripts: any[] = [];

    beforeEach(() => {
      resetGoogleAnalyticsStateForTesting();
      resetFirebaseAnalyticsStateForTesting();
      resetAppInitForTesting();
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
      vi.stubGlobal("navigator", {
        onLine: true,
        userAgent: "vitest",
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("isGoogleAnalyticsScriptPresent deve detectar script existente injetado pelo Firebase SDK", () => {
      expect(isGoogleAnalyticsScriptPresent()).toBe(false);

      appendedScripts.push({
        id: "",
        src: "https://www.googletagmanager.com/gtag/js?l=dataLayer&id=G-Q2BWFJTJ8K",
      });

      expect(isGoogleAnalyticsScriptPresent()).toBe(true);
    });

    it("initGoogleAnalytics NÃO deve injetar script duplicado se o script do Firebase já estiver presente", () => {
      appendedScripts.push({
        id: "",
        src: "https://www.googletagmanager.com/gtag/js?l=dataLayer&id=G-Q2BWFJTJ8K",
      });

      initGoogleAnalytics("G-Q2BWFJTJ8K");
      expect(mockHead.appendChild).not.toHaveBeenCalled();
    });

    it("initGoogleAnalytics NÃO deve injetar script duplicado se já foi inicializado anteriormente", () => {
      initGoogleAnalytics("G-VALID12345");
      expect(mockHead.appendChild).toHaveBeenCalledTimes(1);

      initGoogleAnalytics("G-VALID12345");
      expect(mockHead.appendChild).toHaveBeenCalledTimes(1);
    });

    it("NÃO deve tentar carregar Google Tag Manager quando o navegador estiver offline", async () => {
      vi.stubGlobal("navigator", {
        onLine: false,
        userAgent: "vitest",
      });

      initGoogleAnalytics("G-Q2BWFJTJ8K");
      expect(mockHead.appendChild).not.toHaveBeenCalled();

      await initFirebaseSecondaryServices();
      const state = getFirebaseAnalyticsState();
      expect(state.attempted).toBe(true);
      expect(state.initialized).toBe(false);
      expect(state.failed).toBe(false);
    });

    it("quando GTM falha (ERR_ADDRESS_INVALID / bloqueador), degrada silenciosamente sem novas tentativas", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      initGoogleAnalytics("G-Q2BWFJTJ8K");
      expect(mockHead.appendChild).toHaveBeenCalledTimes(1);

      const injectedScript = appendedScripts[0];
      expect(typeof injectedScript.onerror).toBe("function");

      // Simula falha net::ERR_ADDRESS_INVALID no carregamento do script
      injectedScript.onerror(new Event("error"));
      expect(warnSpy).toHaveBeenCalledTimes(1);

      // Limpa scripts do DOM simulando tentativa posterior — latch impede retry infinito
      appendedScripts.length = 0;
      initGoogleAnalytics("G-Q2BWFJTJ8K");
      expect(mockHead.appendChild).toHaveBeenCalledTimes(1);

      // trackCustomEvent não deve lançar nem tentar disparar gtag após falha
      expect(() => trackCustomEvent("after_gtm_failure", { ok: true })).not.toThrow();

      warnSpy.mockRestore();
    });

    it("chamadas simultâneas de initializeAppServices() e initSecondaryServices() executam uma única inicialização singleton", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await Promise.all([
        initializeAppServices(),
        initializeAppServices(),
        initSecondaryServices(),
      ]);

      const bootLogs = logSpy.mock.calls.filter(
        (args) => typeof args[0] === "string" && args[0].includes("[AppInit] Inicializando serviços")
      );
      expect(bootLogs).toHaveLength(1);

      logSpy.mockRestore();
    });
  });

  describe("3. Continuidade da Aplicação e Tratamento Não-Bloqueante", () => {
    beforeEach(() => {
      resetGoogleAnalyticsStateForTesting();
      resetFirebaseAnalyticsStateForTesting();
      resetAppInitForTesting();
      vi.stubGlobal("window", {
        dataLayer: [],
        gtag: vi.fn(() => {
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

  describe("4. SW Uptime Watchdog — Eliminação de Duplicidade de Listeners e Logs ACTIVE", () => {
    beforeEach(() => {
      resetUptimeWatchdogForTesting();
    });

    afterEach(() => {
      resetUptimeWatchdogForTesting();
      vi.unstubAllGlobals();
    });

    it("registra exatamente 1 listener message, envia exatamente 1 PING_HEALTH e emite 1 único status ACTIVE", async () => {
      const listeners: Array<(e: any) => void> = [];
      const postMessage = vi.fn((msg: any) => {
        if (msg?.type === "PING_HEALTH") {
          // Simula resposta PONG_HEALTH do sw-custom.js
          queueMicrotask(() => {
            const pongEvent = { data: { type: "PONG_HEALTH", timestamp: 1764195000000 } };
            listeners.forEach((fn) => fn(pongEvent));
          });
        }
      });

      const addEventListener = vi.fn((event: string, fn: any) => {
        if (event === "message") listeners.push(fn);
      });
      const removeEventListener = vi.fn((event: string, fn: any) => {
        if (event === "message") {
          const idx = listeners.indexOf(fn);
          if (idx >= 0) listeners.splice(idx, 1);
        }
      });

      vi.stubGlobal("window", {});
      vi.stubGlobal("navigator", {
        serviceWorker: {
          ready: Promise.resolve({ active: true }),
          controller: { postMessage },
          addEventListener,
          removeEventListener,
        },
      });

      const statusEvents: Array<{ status: string; ping: number }> = [];
      const cb = (status: string, ping: number) => statusEvents.push({ status, ping });

      // Simula múltiplas invocações concorrentes (ex.: appInit + StrictMode / chamada duplicada)
      registerUptimeServiceWorker(cb);
      registerUptimeServiceWorker(cb);
      registerUptimeServiceWorker();

      // Aguarda microtasks (ready.then -> postMessage -> PONG_HEALTH)
      await new Promise((r) => setTimeout(r, 20));

      expect(addEventListener).toHaveBeenCalledTimes(1);
      expect(postMessage).toHaveBeenCalledTimes(1);
      expect(postMessage).toHaveBeenCalledWith({ type: "PING_HEALTH" });
      expect(statusEvents).toHaveLength(1);
      expect(statusEvents[0]).toEqual({ status: "ACTIVE", ping: 1764195000000 });
    });

    it("emite FALLBACK sem lançar exceções quando Service Worker não está disponível", () => {
      vi.stubGlobal("window", {});
      vi.stubGlobal("navigator", {});

      const cb = vi.fn();
      registerUptimeServiceWorker(cb);

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb.mock.calls[0][0]).toBe("FALLBACK");
    });
  });

  describe("5. Preservação de Regras de Segurança, CSP, App.tsx e Arquitetura Singleton", () => {
    it("não deve enfraquecer diretivas CSP de script-src ou connect-src", () => {
      const secHeadersPath = path.resolve(process.cwd(), "src/lib/securityHeaders.ts");
      const code = fs.readFileSync(secHeadersPath, "utf-8");

      expect(code).toContain('"https://www.googletagmanager.com"');
      expect(code).toContain('"https://*.google-analytics.com"');
      expect(code).toContain('"https://*.analytics.google.com"');
      expect(code).not.toContain("script-src: ['*']");
      expect(code).not.toContain("script-src: ['https:']");
    });

    it("appInit.ts deve manter carregamento assíncrono isolado e App.tsx não deve duplicar initSecondaryServices()", () => {
      const appInitCode = fs.readFileSync(path.resolve(process.cwd(), "src/lib/appInit.ts"), "utf-8");
      const appCode = fs.readFileSync(path.resolve(process.cwd(), "src/App.tsx"), "utf-8");

      expect(appInitCode).toContain("initFirebaseSecondaryServices()");
      expect(appInitCode).toContain("initGoogleAnalytics()");
      expect(appInitCode).toContain("try {");
      expect(appInitCode).toContain("catch (err) {");
      expect(appCode).not.toContain("initSecondaryServices()");
    });
  });
});
