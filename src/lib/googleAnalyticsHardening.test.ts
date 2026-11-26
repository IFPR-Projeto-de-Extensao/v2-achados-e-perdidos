import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import firebaseConfig from "../../firebase-applet-config.json";

const { mockGetAnalytics, mockIsAnalyticsSupported, mockLogFbEvent } = vi.hoisted(() => ({
  mockGetAnalytics: vi.fn((appInstance: unknown) => ({ app: appInstance, _mocked: true })),
  mockIsAnalyticsSupported: vi.fn(async () => true),
  mockLogFbEvent: vi.fn(),
}));

vi.mock("firebase/analytics", () => ({
  getAnalytics: mockGetAnalytics,
  isSupported: mockIsAnalyticsSupported,
  logEvent: mockLogFbEvent,
}));

import {
  initGoogleAnalytics,
  isGoogleAnalyticsScriptPresent,
  trackCustomEvent,
  resetGoogleAnalyticsStateForTesting,
} from "./analytics";
import {
  app,
  auth,
  db,
  logFirebaseEvent,
  initFirebaseSecondaryServices,
  isFirebaseAnalyticsEnabled,
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

describe("LOCALIZA+ — Auditoria do Firebase Analytics (Opt-In), GTM e SW Uptime Watchdog", () => {
  const originalAnalyticsEnv = process.env.VITE_ENABLE_FIREBASE_ANALYTICS;

  afterEach(() => {
    if (originalAnalyticsEnv === undefined) {
      delete process.env.VITE_ENABLE_FIREBASE_ANALYTICS;
    } else {
      process.env.VITE_ENABLE_FIREBASE_ANALYTICS = originalAnalyticsEnv;
    }
    mockGetAnalytics.mockReset();
    mockGetAnalytics.mockImplementation((appInstance: unknown) => ({ app: appInstance, _mocked: true }));
    mockIsAnalyticsSupported.mockReset();
    mockIsAnalyticsSupported.mockImplementation(async () => true);
    mockLogFbEvent.mockReset();
  });

  describe("1. Configuração do Measurement ID e Controle Opt-In VITE_ENABLE_FIREBASE_ANALYTICS", () => {
    it("preserva measurementId G-Q2BWFJTJ8K em firebase-applet-config.json e valida formato G-*", () => {
      expect(firebaseConfig.measurementId).toBe("G-Q2BWFJTJ8K");
      expect(firebaseConfig.projectId).toBe("gen-lang-client-0490390966");
      expect(hasValidMeasurementId(firebaseConfig.measurementId)).toBe(true);
      expect(hasValidMeasurementId("")).toBe(false);
      expect(hasValidMeasurementId("G-")).toBe(false);
      expect(hasValidMeasurementId("invalid")).toBe(false);
    });

    it("mantém Firebase Analytics desabilitado por padrão (opt-in estrito via VITE_ENABLE_FIREBASE_ANALYTICS === 'true')", () => {
      delete process.env.VITE_ENABLE_FIREBASE_ANALYTICS;
      expect(isFirebaseAnalyticsEnabled()).toBe(false);

      process.env.VITE_ENABLE_FIREBASE_ANALYTICS = "false";
      expect(isFirebaseAnalyticsEnabled()).toBe(false);

      process.env.VITE_ENABLE_FIREBASE_ANALYTICS = "1";
      expect(isFirebaseAnalyticsEnabled()).toBe(false);

      process.env.VITE_ENABLE_FIREBASE_ANALYTICS = "TRUE";
      expect(isFirebaseAnalyticsEnabled()).toBe(false);

      process.env.VITE_ENABLE_FIREBASE_ANALYTICS = "true";
      expect(isFirebaseAnalyticsEnabled()).toBe(true);
    });

    it("URL observada no erro corresponde exatamente à convenção interna do SDK @firebase/analytics", () => {
      const expectedUrlPattern = `https://www.googletagmanager.com/gtag/js?l=dataLayer&id=${firebaseConfig.measurementId}`;
      expect(expectedUrlPattern).toBe("https://www.googletagmanager.com/gtag/js?l=dataLayer&id=G-Q2BWFJTJ8K");
    });
  });

  describe("2. Analytics Desabilitado vs Habilitado (Singleton, Offline, GTM Bloqueado e Zero Requisições)", () => {
    let mockHead: any;
    let appendedScripts: any[] = [];

    beforeEach(() => {
      delete process.env.VITE_ENABLE_FIREBASE_ANALYTICS;
      resetGoogleAnalyticsStateForTesting();
      resetFirebaseAnalyticsStateForTesting();
      resetAppInitForTesting();
      resetUptimeWatchdogForTesting();
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

    it("Teste 1 e 2 (Analytics DESABILITADO): ZERO chamadas a getAnalytics(app) e ZERO injeções para googletagmanager.com", async () => {
      delete process.env.VITE_ENABLE_FIREBASE_ANALYTICS;

      await initializeAppServices();
      await initFirebaseSecondaryServices();

      expect(mockIsAnalyticsSupported).not.toHaveBeenCalled();
      expect(mockGetAnalytics).not.toHaveBeenCalled();
      expect(mockHead.appendChild).not.toHaveBeenCalled();
      expect(appendedScripts).toHaveLength(0);

      const state = getFirebaseAnalyticsState();
      expect(state.enabled).toBe(false);
      expect(state.initialized).toBe(false);
      expect(state.failed).toBe(false);

      // Serviços principais do Firebase permanecem intactos
      expect(app).toBeDefined();
      expect(auth).toBeDefined();
      expect(db).toBeDefined();

      // logFirebaseEvent funciona como no-op silencioso
      expect(() => logFirebaseEvent("page_view", { page: "home" })).not.toThrow();
      expect(mockLogFbEvent).not.toHaveBeenCalled();
    });

    it("Teste 6 (Analytics HABILITADO): executa getAnalytics(app) estritamente uma única vez (singleton) mesmo em chamadas concorrentes", async () => {
      process.env.VITE_ENABLE_FIREBASE_ANALYTICS = "true";

      await Promise.all([
        initFirebaseSecondaryServices(),
        initFirebaseSecondaryServices(),
        initializeAppServices(),
        initSecondaryServices(),
      ]);

      expect(mockIsAnalyticsSupported).toHaveBeenCalledTimes(1);
      expect(mockGetAnalytics).toHaveBeenCalledTimes(1);
      expect(mockGetAnalytics).toHaveBeenCalledWith(app);

      const state = getFirebaseAnalyticsState();
      expect(state.enabled).toBe(true);
      expect(state.initialized).toBe(true);
      expect(state.failed).toBe(false);

      logFirebaseEvent("item_viewed", { item_id: "obj-1" });
      expect(mockLogFbEvent).toHaveBeenCalledTimes(1);
    });

    it("Teste 7 (Analytics HABILITADO com GTM bloqueado/falha): aplicação permanece operacional sem retentativas infinitas", async () => {
      process.env.VITE_ENABLE_FIREBASE_ANALYTICS = "true";
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockGetAnalytics.mockImplementationOnce(() => {
        throw new Error("Simulated ERR_ADDRESS_INVALID / blocked GTM");
      });

      await expect(initFirebaseSecondaryServices()).resolves.toBeUndefined();
      // Chamada posterior não deve tentar novamente
      await expect(initFirebaseSecondaryServices()).resolves.toBeUndefined();

      expect(mockGetAnalytics).toHaveBeenCalledTimes(1);
      const state = getFirebaseAnalyticsState();
      expect(state.initialized).toBe(false);
      expect(state.failed).toBe(true);

      // App continua operando normalmente sem exceções
      expect(() => logFirebaseEvent("after_failure", { ok: true })).not.toThrow();
      expect(auth).toBeDefined();
      expect(db).toBeDefined();

      warnSpy.mockRestore();
    });

    it("Analytics HABILITADO mas offline (navigator.onLine === false): não chama getAnalytics(app) nem injeta GTM", async () => {
      process.env.VITE_ENABLE_FIREBASE_ANALYTICS = "true";
      vi.stubGlobal("navigator", {
        onLine: false,
        userAgent: "vitest",
      });

      initGoogleAnalytics("G-Q2BWFJTJ8K");
      await initFirebaseSecondaryServices();

      expect(mockHead.appendChild).not.toHaveBeenCalled();
      expect(mockGetAnalytics).not.toHaveBeenCalled();

      const state = getFirebaseAnalyticsState();
      expect(state.attempted).toBe(true);
      expect(state.initialized).toBe(false);
      expect(state.failed).toBe(false);
    });

    it("isGoogleAnalyticsScriptPresent e initGoogleAnalytics previnem injeção duplicada e degradam silenciosamente em onerror", () => {
      expect(isGoogleAnalyticsScriptPresent()).toBe(false);

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      initGoogleAnalytics("G-Q2BWFJTJ8K");
      expect(mockHead.appendChild).toHaveBeenCalledTimes(1);
      expect(isGoogleAnalyticsScriptPresent()).toBe(true);

      // Segunda chamada não duplica script
      initGoogleAnalytics("G-Q2BWFJTJ8K");
      expect(mockHead.appendChild).toHaveBeenCalledTimes(1);

      // Simula falha net::ERR_ADDRESS_INVALID no carregamento do script
      const injectedScript = appendedScripts[0];
      injectedScript.onerror(new Event("error"));
      expect(warnSpy).toHaveBeenCalledTimes(1);

      // Mesmo removendo o script do DOM, latch impede nova tentativa
      appendedScripts.length = 0;
      initGoogleAnalytics("G-Q2BWFJTJ8K");
      expect(mockHead.appendChild).toHaveBeenCalledTimes(1);
      expect(() => trackCustomEvent("after_gtm_failure", { ok: true })).not.toThrow();

      warnSpy.mockRestore();
    });

    it("Teste 8: chamadas simultâneas de initializeAppServices() e initSecondaryServices() executam uma única inicialização singleton", async () => {
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

    it("trackCustomEvent e logFirebaseEvent nunca propagam exceções", () => {
      expect(() => trackCustomEvent("test_event", { item_id: "123" })).not.toThrow();
      expect(() => logFirebaseEvent("test_event", { item_id: "123" })).not.toThrow();
    });

    it("initializeAppServices conclui sem lançar exceções não tratadas", async () => {
      await expect(initializeAppServices()).resolves.toBeUndefined();
    });
  });

  describe("4. SW Uptime Watchdog — Deduplicação de Listeners e Status ACTIVE Único", () => {
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

      registerUptimeServiceWorker(cb);
      registerUptimeServiceWorker(cb);
      registerUptimeServiceWorker();

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

  describe("5. Preservação de Segurança, CSP e Ausência de MutationObserver como Bloqueio Pós-Disparo", () => {
    it("não deve enfraquecer diretivas CSP de script-src ou connect-src", () => {
      const secHeadersPath = path.resolve(process.cwd(), "src/lib/securityHeaders.ts");
      const code = fs.readFileSync(secHeadersPath, "utf-8");

      expect(code).toContain('"https://www.googletagmanager.com"');
      expect(code).toContain('"https://*.google-analytics.com"');
      expect(code).toContain('"https://*.analytics.google.com"');
      expect(code).not.toContain("script-src: ['*']");
      expect(code).not.toContain("script-src: ['https:']");
    });

    it("firebase.ts não utiliza MutationObserver e carrega firebase/analytics apenas sob demanda via opt-in", () => {
      const firebaseCode = fs.readFileSync(path.resolve(process.cwd(), "src/lib/firebase.ts"), "utf-8");
      const appInitCode = fs.readFileSync(path.resolve(process.cwd(), "src/lib/appInit.ts"), "utf-8");
      const appCode = fs.readFileSync(path.resolve(process.cwd(), "src/App.tsx"), "utf-8");

      expect(firebaseCode).not.toContain("MutationObserver");
      expect(firebaseCode).toContain("VITE_ENABLE_FIREBASE_ANALYTICS");
      expect(firebaseCode).toContain("await import('firebase/analytics')");
      expect(appInitCode).toContain("initFirebaseSecondaryServices()");
      expect(appInitCode).toContain("initGoogleAnalytics()");
      expect(appInitCode).toContain("isFirebaseAnalyticsEnabled()");
      expect(appCode).not.toContain("initSecondaryServices()");
    });
  });
});
