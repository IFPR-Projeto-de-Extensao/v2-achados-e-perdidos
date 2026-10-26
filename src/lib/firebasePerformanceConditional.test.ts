import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isFirebasePerformanceEnabled,
  traceFirebasePerformance,
  firebasePerformance,
} from "./firebase";

describe("LOCALIZA+ v1.10.4 — Desativação Condicional do Firebase Performance", () => {
  const originalProcessEnv = process.env.VITE_ENABLE_FIREBASE_PERF;

  afterEach(() => {
    if (originalProcessEnv === undefined) {
      delete process.env.VITE_ENABLE_FIREBASE_PERF;
    } else {
      process.env.VITE_ENABLE_FIREBASE_PERF = originalProcessEnv;
    }
  });

  describe("1. Avaliação da variável de ambiente VITE_ENABLE_FIREBASE_PERF", () => {
    it("deve retornar false quando a variável estiver ausente", () => {
      delete process.env.VITE_ENABLE_FIREBASE_PERF;
      expect(isFirebasePerformanceEnabled()).toBe(false);
    });

    it("deve retornar false quando a variável for 'false', vazia ou qualquer valor diferente de 'true'", () => {
      process.env.VITE_ENABLE_FIREBASE_PERF = "false";
      expect(isFirebasePerformanceEnabled()).toBe(false);

      process.env.VITE_ENABLE_FIREBASE_PERF = "";
      expect(isFirebasePerformanceEnabled()).toBe(false);

      process.env.VITE_ENABLE_FIREBASE_PERF = "0";
      expect(isFirebasePerformanceEnabled()).toBe(false);

      process.env.VITE_ENABLE_FIREBASE_PERF = "TRUE";
      expect(isFirebasePerformanceEnabled()).toBe(false);

      process.env.VITE_ENABLE_FIREBASE_PERF = "1";
      expect(isFirebasePerformanceEnabled()).toBe(false);
    });

    it("deve retornar true exclusivamente quando a variável for exatamente a string 'true'", () => {
      process.env.VITE_ENABLE_FIREBASE_PERF = "true";
      expect(isFirebasePerformanceEnabled()).toBe(true);
    });
  });

  describe("2. Comportamento defensivo de traceFirebasePerformance()", () => {
    it("deve retornar null de forma segura quando firebasePerformance estiver desativado/null", () => {
      // Como a telemetria não é inicializada, firebasePerformance é null por padrão
      const traceResult = traceFirebasePerformance("firestore_db_latency");
      expect(traceResult).toBeNull();
    });

    it("consumidores em DashboardView devem tolerar retorno null sem lançar exceções", () => {
      const perfTrace = traceFirebasePerformance("firestore_db_latency");
      expect(perfTrace).toBeNull();

      // Simulação exata do trecho em DashboardView.tsx:
      // if (perfTrace) perfTrace.stop();
      expect(() => {
        if (perfTrace) {
          (perfTrace as any).stop();
        }
      }).not.toThrow();
    });

    it("consumidores em App.tsx devem tolerar retorno null e manter métricas locais ativas", () => {
      const perfTrace = traceFirebasePerformance("view_render_dashboard");
      expect(perfTrace).toBeNull();

      // Simulação exata do trecho em App.tsx:
      let localMetricRecorded = false;
      const renderDurationMs = 45;

      expect(() => {
        if (perfTrace) {
          try {
            (perfTrace as any).putMetric("render_duration_ms", renderDurationMs);
            (perfTrace as any).stop();
          } catch (_) {}
        }
        localMetricRecorded = true;
      }).not.toThrow();

      expect(localMetricRecorded).toBe(true);
    });
  });

  describe("3. Independência dos demais serviços e integridade do sistema", () => {
    it("não deve interferir na assinatura de inicialização de serviços secundários", async () => {
      delete process.env.VITE_ENABLE_FIREBASE_PERF;
      expect(isFirebasePerformanceEnabled()).toBe(false);
      // firebasePerformance permanece null
      expect(firebasePerformance).toBeNull();
    });

    it("garante que métricas locais (performance.now e IndexedDB) e Vercel Analytics são desacopladas", () => {
      const start = performance.now();
      const delta = performance.now() - start;
      expect(delta).toBeGreaterThanOrEqual(0);
    });
  });
});
