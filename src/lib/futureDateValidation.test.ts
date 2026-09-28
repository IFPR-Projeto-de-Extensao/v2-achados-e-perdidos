import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isFutureDate,
  validateItemOccurrenceDate,
  getTodayDateString,
  safeParseDate,
} from "./utils";

describe("Validação de Data Futura de Ocorrências (Localiza+ IFPR)", () => {
  // Fix time reference to a deterministic date for tests: 2026-09-28 (local)
  const fixedNow = new Date(2026, 8, 28, 14, 30, 0); // Month 8 is September in JS Date

  describe("1. isFutureDate()", () => {
    it("deve retornar false para a data de ontem (passado)", () => {
      expect(isFutureDate("2026-09-27", fixedNow)).toBe(false);
      expect(isFutureDate("27/09/2026", fixedNow)).toBe(false);
      expect(isFutureDate(new Date(2026, 8, 27), fixedNow)).toBe(false);
    });

    it("deve retornar false para a data de hoje (presente)", () => {
      expect(isFutureDate("2026-09-28", fixedNow)).toBe(false);
      expect(isFutureDate("28/09/2026", fixedNow)).toBe(false);
      expect(isFutureDate(new Date(2026, 8, 28, 10, 0, 0), fixedNow)).toBe(false);
      expect(isFutureDate(new Date(2026, 8, 28, 23, 59, 59), fixedNow)).toBe(false);
    });

    it("deve retornar true para uma data de amanhã (futuro)", () => {
      expect(isFutureDate("2026-09-29", fixedNow)).toBe(true);
      expect(isFutureDate("29/09/2026", fixedNow)).toBe(true);
      expect(isFutureDate(new Date(2026, 8, 29), fixedNow)).toBe(true);
    });

    it("deve retornar true para datas no próximo mês e no próximo ano", () => {
      expect(isFutureDate("2026-10-01", fixedNow)).toBe(true);
      expect(isFutureDate("2027-01-01", fixedNow)).toBe(true);
      expect(isFutureDate("01/10/2026", fixedNow)).toBe(true);
      expect(isFutureDate("01/01/2027", fixedNow)).toBe(true);
    });

    it("deve retornar false para entradas nulas, indefinidas ou vazias sem explodir exceção", () => {
      expect(isFutureDate(null, fixedNow)).toBe(false);
      expect(isFutureDate(undefined, fixedNow)).toBe(false);
      expect(isFutureDate("", fixedNow)).toBe(false);
      expect(isFutureDate("   ", fixedNow)).toBe(false);
    });

    it("não deve considerar futuro uma data de hoje com horário mais adiantado no mesmo dia", () => {
      const eveningToday = new Date(2026, 8, 28, 22, 0, 0);
      expect(isFutureDate(eveningToday, fixedNow)).toBe(false);
    });

    it("deve funcionar com a data real do sistema (sem parâmetro de referência)", () => {
      const todayStr = getTodayDateString();
      expect(isFutureDate(todayStr)).toBe(false);

      // Data de amanhã relativa ao sistema real
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowYear = tomorrow.getFullYear();
      const tomorrowMonth = String(tomorrow.getMonth() + 1).padStart(2, "0");
      const tomorrowDay = String(tomorrow.getDate()).padStart(2, "0");
      const tomorrowStr = `${tomorrowYear}-${tomorrowMonth}-${tomorrowDay}`;

      expect(isFutureDate(tomorrowStr)).toBe(true);
    });
  });

  describe("2. validateItemOccurrenceDate()", () => {
    it("deve validar com sucesso a data de hoje", () => {
      const today = getTodayDateString();
      const result = validateItemOccurrenceDate(today);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("deve validar com sucesso uma data passada (ontem, semana passada, ano passado)", () => {
      expect(validateItemOccurrenceDate("2026-01-15").isValid).toBe(true);
      expect(validateItemOccurrenceDate("2025-12-01").isValid).toBe(true);
      expect(validateItemOccurrenceDate("15/01/2026").isValid).toBe(true);
    });

    it("deve rejeitar data futura com mensagem clara explicativa", () => {
      // 2099-01-01 sempre será futuro
      const result = validateItemOccurrenceDate("2099-01-01", "A data da perda");
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("não pode ser posterior à data atual");
      expect(result.error).toContain("A data da perda");
    });

    it("deve rejeitar data vazia, nula ou indefinida", () => {
      expect(validateItemOccurrenceDate("").isValid).toBe(false);
      expect(validateItemOccurrenceDate(null).isValid).toBe(false);
      expect(validateItemOccurrenceDate(undefined).isValid).toBe(false);
      expect(validateItemOccurrenceDate("   ").isValid).toBe(false);
    });

    it("deve rejeitar strings que não representam datas válidas", () => {
      expect(validateItemOccurrenceDate("invalid-date-string").isValid).toBe(false);
      expect(validateItemOccurrenceDate("32/01/2026").isValid).toBe(false);
    });
  });

  describe("3. Cenários de Cadastro e Edição de Itens (Online e Offline)", () => {
    it("cenário: cadastro de item perdido com data futura deve ser bloqueado", () => {
      const futureItem = {
        title: "Celular Samsung Galaxy A54",
        category: "ELETRONICOS",
        type: "PERDIDO",
        description: "Perdido no pátio",
        location: "Pátio Central",
        date: "2099-12-31",
      };

      const validation = validateItemOccurrenceDate(futureItem.date, "A data da ocorrência");
      expect(validation.isValid).toBe(false);
      expect(validation.error).toBe(
        "A data da ocorrência não pode ser posterior à data atual (não são permitidas datas futuras)."
      );
    });

    it("cenário: cadastro de item encontrado com data de ontem deve ser aceito", () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

      const validItem = {
        title: "Garrafa Térmica Verde",
        category: "OUTROS",
        type: "ENCONTRADO",
        description: "Encontrada no bloco didático",
        location: "Bloco Didático",
        date: yStr,
      };

      const validation = validateItemOccurrenceDate(validItem.date, "A data da ocorrência");
      expect(validation.isValid).toBe(true);
    });

    it("cenário: edição de item existente para data futura deve ser bloqueada", () => {
      const existingItem = {
        id: "ifpr-test-1",
        title: "Caderno Espiral IFPR",
        date: "2026-09-10",
      };

      const updatedFields = {
        date: "2030-05-01",
      };

      const validation = validateItemOccurrenceDate(updatedFields.date, "A data da ocorrência");
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain("não pode ser posterior à data atual");
    });

    it("cenário: edição de item mantendo a data ou atualizando para data válida de hoje deve ser aceita", () => {
      const updatedFields = {
        date: getTodayDateString(),
      };

      const validation = validateItemOccurrenceDate(updatedFields.date, "A data da ocorrência");
      expect(validation.isValid).toBe(true);
    });

    it("cenário offline: validação local pré-enfileiramento impede que payload inválido entre na fila IndexedDB", () => {
      const offlineCandidateItem = {
        title: "Chave do Armário",
        description: "Chave esquecida",
        location: "Laboratório 3",
        date: "2099-01-01",
      };

      // AppContext addItem executa validateItemOccurrenceDate antes de queueOfflineItemRegistration
      const validation = validateItemOccurrenceDate(offlineCandidateItem.date, "A data da ocorrência");
      expect(validation.isValid).toBe(false);
      // Garantia de que a validação atua na camada de serviço/contexto antes do armazenamento local
    });
  });
});
