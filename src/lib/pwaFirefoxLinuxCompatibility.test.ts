import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  initialize30DayRecords,
  get30DayUptimeSummary,
  triggerServiceWorkerPing,
  clear30DayUptimeRecords,
} from "./uptimeManager";
import { saveItemsToIndexedDB, getItemsFromIndexedDB } from "./indexedDB";
import { saveItemsOffline, getOfflineItems } from "./offlineDb";
import fs from "fs";
import path from "path";

describe("LOCALIZA+ v1.10.7 — Compatibilidade PWA com Firefox e Linux & Eliminação de Métricas Fictícias", () => {
  beforeEach(() => {
    clear30DayUptimeRecords();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clear30DayUptimeRecords();
  });

  describe("1. Eliminação Integral de Métricas Simuladas em uptimeManager.ts (Regra 1)", () => {
    it("initialize30DayRecords deve gerar linha de base 100% limpa, sem downtime fictício nos dias 12 e 24", () => {
      const records = initialize30DayRecords();

      expect(records).toHaveLength(30);
      records.forEach((rec, idx) => {
        expect(rec.status).toBe("OPERATIONAL");
        expect(rec.uptimePct).toBe(100);
        expect(rec.downtimeMinutes).toBe(0);
        expect(rec.incidents).toEqual([]);
        expect(rec.successfulPings).toBe(1440);
      });
    });

    it("get30DayUptimeSummary deve retornar lista de incidentes vazia por padrão em vez de incidentes fabricados", () => {
      const summary = get30DayUptimeSummary("ACTIVE", Date.now());

      expect(summary.incidents).toEqual([]);
      expect(summary.totalDowntimeMinutes).toBe(0);
      expect(summary.overallPercentage).toBe(100);
      expect(summary.subsystems).toHaveLength(4);
    });

    it("triggerServiceWorkerPing sem controller deve retornar latencyMs = 0 e success = false sem usar Math.random", async () => {
      // Simula navegador sem Service Worker ativo
      vi.stubGlobal("navigator", {});

      const result = await triggerServiceWorkerPing();

      expect(result.success).toBe(false);
      expect(result.latencyMs).toBe(0);
    });

    it("código fonte de uptimeManager.ts NÃO deve conter Math.random()", () => {
      const filePath = path.resolve(process.cwd(), "src/lib/uptimeManager.ts");
      const code = fs.readFileSync(filePath, "utf-8");

      expect(code).not.toContain("Math.random");
      expect(code).not.toContain("inc_01");
      expect(code).not.toContain("inc_02");
    });
  });

  describe("2. Robustez de Armazenamento e Modo Privado (IndexedDB)", () => {
    it("openDatabase em indexedDB.ts captura SecurityError síncrono e não quebra a aplicação", async () => {
      // Simula ambiente onde indexedDB.open lança SecurityError síncrono (ex: modo anônimo ultra-restrito)
      vi.stubGlobal("window", {
        indexedDB: {
          open: () => {
            throw new Error("SecurityError: The operation is insecure.");
          },
        },
      });

      // Operações de leitura/escrita devem capturar o erro e retornar fallback seguro
      await expect(saveItemsToIndexedDB([])).resolves.toBeUndefined();
      const items = await getItemsFromIndexedDB();
      expect(items).toEqual([]);
    });

    it("openDB em offlineDb.ts captura SecurityError síncrono sem lançar erro não tratado", async () => {
      vi.stubGlobal("window", {
        indexedDB: {
          open: () => {
            throw new Error("SecurityError: The operation is insecure.");
          },
        },
      });

      await expect(saveItemsOffline([])).resolves.toBeUndefined();
      const offlineItems = await getOfflineItems();
      expect(offlineItems).toEqual([]);
    });
  });

  describe("3. Detecção de Navegador e Adaptação PWA no hook usePWA", () => {
    it("hook usePWA.ts deve incluir detecção para Firefox, Firefox Desktop, Firefox Android e Linux", () => {
      const usePWAPath = path.resolve(process.cwd(), "src/hooks/usePWA.ts");
      const code = fs.readFileSync(usePWAPath, "utf-8");

      expect(code).toContain("isFirefox");
      expect(code).toContain("isFirefoxDesktop");
      expect(code).toContain("isFirefoxAndroid");
      expect(code).toContain("isLinux");
      expect(code).toContain("InstallTrigger");
    });

    it("PWAInstallBanner.tsx deve passar propriedades de Firefox e Linux para o modal de instruções", () => {
      const bannerPath = path.resolve(process.cwd(), "src/components/PWAInstallBanner.tsx");
      const code = fs.readFileSync(bannerPath, "utf-8");

      expect(code).toContain("isFirefox={isFirefox}");
      expect(code).toContain("isFirefoxDesktop={isFirefoxDesktop}");
      expect(code).toContain("isFirefoxAndroid={isFirefoxAndroid}");
      expect(code).toContain("isLinux={isLinux}");
    });

    it("InstallInstructionsModal.tsx deve conter orientações específicas para Linux e Firefox", () => {
      const modalPath = path.resolve(process.cwd(), "src/components/InstallInstructionsModal.tsx");
      const code = fs.readFileSync(modalPath, "utf-8");

      expect(code).toContain("Mozilla Firefox para Android");
      expect(code).toContain("Mozilla Firefox no Computador");
      expect(code).toContain(".desktop");
      expect(code).toContain("Fixar aba");
    });
  });

  describe("4. Versão e Arquivos Estáticos PWA", () => {
    it("public/sw-custom.js deve estar na versão v1.10.7-pwa", () => {
      const swPath = path.resolve(process.cwd(), "public/sw-custom.js");
      const code = fs.readFileSync(swPath, "utf-8");

      expect(code).toContain('const SW_CUSTOM_VERSION = "v1.10.7-pwa";');
    });

    it("package.json deve declarar a versão 1.10.9", () => {
      const pkgPath = path.resolve(process.cwd(), "package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

      expect(pkg.version).toBe("1.10.9");
    });
  });
});
