import { describe, it, expect } from "vitest";
import { safeToLower, sanitizeQuery, safeIncludes, safeTextCorpus } from "./utils";

describe("String Sanitization & Safe Transformation Utilities", () => {
  describe("safeToLower", () => {
    it("should safely convert normal strings to lower case and trim them", () => {
      expect(safeToLower("  HELLO World  ")).toBe("hello world");
      expect(safeToLower("Garrafa Térmica")).toBe("garrafa térmica");
      expect(safeToLower("BLOCO-A")).toBe("bloco-a");
    });

    it("should handle null and undefined safely without throwing", () => {
      expect(safeToLower(null)).toBe("");
      expect(safeToLower(undefined)).toBe("");
    });

    it("should handle numbers, booleans, and other non-string primitives safely", () => {
      expect(safeToLower(12345)).toBe("12345");
      expect(safeToLower(true)).toBe("true");
      expect(safeToLower(false)).toBe("false");
      expect(safeToLower(0)).toBe("0");
    });

    it("should handle objects, symbols, or functions by returning an empty string", () => {
      expect(safeToLower({})).toBe("");
      expect(safeToLower([])).toBe("");
      expect(safeToLower(() => {})).toBe("");
    });
  });

  describe("sanitizeQuery", () => {
    it("should trim string inputs safely", () => {
      expect(sanitizeQuery("   chaves do laboratório   ")).toBe("chaves do laboratório");
      expect(sanitizeQuery("")).toBe("");
    });

    it("should return empty string on null or undefined", () => {
      expect(sanitizeQuery(null)).toBe("");
      expect(sanitizeQuery(undefined)).toBe("");
    });

    it("should convert numeric or boolean queries to string safely", () => {
      expect(sanitizeQuery(101)).toBe("101");
      expect(sanitizeQuery(true)).toBe("true");
    });
  });

  describe("safeIncludes", () => {
    it("should return true when target contains query (case-insensitive and trimmed)", () => {
      expect(safeIncludes("Biblioteca Central", "biblioteca")).toBe(true);
      expect(safeIncludes("Garrafa Azul Metal", "  AZUL ")).toBe(true);
      expect(safeIncludes("QR-IFPR-2024", "ifpr-2024")).toBe(true);
    });

    it("should return false when target does not contain query", () => {
      expect(safeIncludes("Bloco Administrativo", "Quadra")).toBe(false);
    });

    it("should handle null or undefined target safely", () => {
      expect(safeIncludes(null, "termo")).toBe(false);
      expect(safeIncludes(undefined, "termo")).toBe(false);
    });

    it("should return true if query is empty, null, or undefined (matches all)", () => {
      expect(safeIncludes("Qualquer Texto", "")).toBe(true);
      expect(safeIncludes("Qualquer Texto", null)).toBe(true);
      expect(safeIncludes("Qualquer Texto", undefined)).toBe(true);
      expect(safeIncludes("Qualquer Texto", "   ")).toBe(true);
    });
  });

  describe("safeTextCorpus", () => {
    it("should concatenate parts safely ignoring nulls and undefineds", () => {
      const corpus = safeTextCorpus("Garrafa", null, "Azul", undefined, "Bloco A", 123);
      expect(corpus).toBe("garrafa azul bloco a 123");
    });

    it("should return empty string if all inputs are null or undefined", () => {
      expect(safeTextCorpus(null, undefined, "")).toBe("");
    });
  });
});
