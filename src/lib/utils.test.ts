import { describe, it, expect } from "vitest";
import {
  safeToLower,
  sanitizeQuery,
  safeIncludes,
  safeTextCorpus,
  safeParseDate,
  formatDate,
  formatSafeDate,
  formatDateTime,
  formatSafeDateTime,
  isItemNew,
  getItemAgeText,
} from "./utils";

describe("Date Utilities & Invalid Time Value Safety", () => {
  describe("safeParseDate", () => {
    it("should return null for null, undefined, and empty string", () => {
      expect(safeParseDate(null)).toBeNull();
      expect(safeParseDate(undefined)).toBeNull();
      expect(safeParseDate("")).toBeNull();
      expect(safeParseDate("   ")).toBeNull();
    });

    it("should return null for malformed and invalid strings without throwing RangeError", () => {
      expect(safeParseDate("invalid date")).toBeNull();
      expect(safeParseDate("not-a-date-xyz")).toBeNull();
      expect(safeParseDate("null")).toBeNull();
      expect(safeParseDate("undefined")).toBeNull();
      expect(safeParseDate("99/99/9999")).toBeNull();
    });

    it("should safely parse valid Date instances and filter invalid Date instances", () => {
      const validDate = new Date("2026-08-25T14:30:00Z");
      expect(safeParseDate(validDate)).toBe(validDate);

      const invalidDate = new Date("invalid date string");
      expect(safeParseDate(invalidDate)).toBeNull();
    });

    it("should safely parse Firestore Timestamp instances with toDate()", () => {
      const mockTimestamp = {
        toDate: () => new Date("2026-08-25T12:00:00Z"),
      };
      const result = safeParseDate(mockTimestamp);
      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString()).toBe("2026-08-25T12:00:00.000Z");
    });

    it("should safely parse serialized Firestore Timestamps { seconds, nanoseconds }", () => {
      const serialized = { seconds: 1724600000, nanoseconds: 500000000 };
      const result = safeParseDate(serialized);
      expect(result).toBeInstanceOf(Date);
      expect(result?.getTime()).toBe(1724600000500);

      const serializedUnderScore = { _seconds: 1724600000, _nanoseconds: 0 };
      const result2 = safeParseDate(serializedUnderScore);
      expect(result2).toBeInstanceOf(Date);
      expect(result2?.getTime()).toBe(1724600000000);
    });

    it("should safely parse numeric epoch timestamps (ms and seconds)", () => {
      const ms = 1724600000000;
      expect(safeParseDate(ms)?.getTime()).toBe(ms);

      const sec = 1724600000;
      expect(safeParseDate(sec)?.getTime()).toBe(1724600000000);

      const numStr = "1724600000000";
      expect(safeParseDate(numStr)?.getTime()).toBe(1724600000000);
    });

    it("should safely parse Brazilian format DD/MM/YYYY and DD-MM-YYYY", () => {
      const parsed = safeParseDate("25/08/2026");
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed?.getDate()).toBe(25);
      expect(parsed?.getMonth()).toBe(7); // 0-indexed (August is 7)
      expect(parsed?.getFullYear()).toBe(2026);

      const parsedWithTime = safeParseDate("25/08/2026 14:30");
      expect(parsedWithTime).toBeInstanceOf(Date);
      expect(parsedWithTime?.getHours()).toBe(14);
      expect(parsedWithTime?.getMinutes()).toBe(30);
    });

    it("should safely parse ISO string formats", () => {
      const iso = "2026-08-25T14:30:00.000Z";
      const parsed = safeParseDate(iso);
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed?.toISOString()).toBe(iso);

      const dateOnly = "2026-08-25";
      const parsedDateOnly = safeParseDate(dateOnly);
      expect(parsedDateOnly).toBeInstanceOf(Date);
      expect(parsedDateOnly?.getFullYear()).toBe(2026);
    });
  });

  describe("formatDate & formatSafeDate", () => {
    it("should format valid dates correctly into DD/MM/YYYY", () => {
      const formatted = formatSafeDate("2026-08-25T12:00:00Z");
      expect(formatted).toMatch(/25\/08\/2026/);
      expect(formatDate("2026-08-25T12:00:00Z")).toMatch(/25\/08\/2026/);
    });

    it("should safely format Firestore Timestamp with toDate method", () => {
      const firestoreTimestamp = {
        toDate: () => new Date(2026, 7, 25, 10, 0, 0),
      };
      expect(formatSafeDate(firestoreTimestamp)).toBe("25/08/2026");
    });

    it("should never throw RangeError on invalid or null dates and return fallback", () => {
      expect(formatSafeDate(null)).toBe("Data não informada");
      expect(formatSafeDate(undefined)).toBe("Data não informada");
      expect(formatSafeDate("")).toBe("Data não informada");
      expect(formatSafeDate("invalid-value-xyz")).toBe("Data não informada");
      expect(formatSafeDate("not a date", "Sem data")).toBe("Sem data");
    });
  });

  describe("formatDateTime & formatSafeDateTime", () => {
    it("should format valid dates with time", () => {
      const formatted = formatSafeDateTime("2026-08-25T14:30:00Z");
      expect(formatted).toMatch(/25\/08\/2026/);
      expect(formatDateTime("2026-08-25T14:30:00Z")).toMatch(/25\/08\/2026/);
    });

    it("should never throw RangeError on invalid dates and return fallback", () => {
      expect(formatSafeDateTime(null)).toBe("Data não informada");
      expect(formatSafeDateTime(undefined)).toBe("Data não informada");
      expect(formatSafeDateTime("invalid-datetime-string")).toBe("Data não informada");
    });
  });

  describe("isItemNew and getItemAgeText", () => {
    it("should safely evaluate recent items without crashing on malformed dates", () => {
      expect(isItemNew(null)).toBe(false);
      expect(isItemNew({ date: "invalid" })).toBe(false);
      expect(isItemNew({ createdAt: new Date().toISOString() })).toBe(true);

      expect(getItemAgeText(null)).toBe("Data não informada");
      expect(getItemAgeText("invalid-date-string")).toBe("Data não informada");
      expect(getItemAgeText(new Date().toISOString())).toBe("Agora mesmo");
    });
  });
});

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
