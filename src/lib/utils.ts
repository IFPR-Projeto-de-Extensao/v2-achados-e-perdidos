import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns today's date formatted as YYYY-MM-DD in local timezone (avoiding UTC timezone offset rollback).
 */
export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Safely parses any date representation into a valid JavaScript Date object.
 * Guaranteed to never throw RangeError or TypeError.
 * Handles:
 * - Firestore Timestamp objects (with .toDate() method)
 * - Serialized Firestore Timestamps ({ seconds, nanoseconds } or { _seconds, _nanoseconds })
 * - JavaScript Date instances (validating isNaN)
 * - Unix timestamp numbers (in milliseconds or seconds)
 * - Numeric timestamp strings (e.g. "1724600000000")
 * - Brazilian date strings (e.g. "25/08/2026", "25/08/2026 14:30", "25-08-2026")
 * - ISO strings (e.g. "2026-08-25T14:30:00Z", "2026-08-25")
 * - Null, undefined, empty strings, "Invalid Date", or arbitrary malformed inputs (returns null)
 */
export function safeParseDate(input: unknown): Date | null {
  if (input === null || input === undefined || input === "") {
    return null;
  }

  try {
    // 1. If already a Date object
    if (input instanceof Date) {
      return isNaN(input.getTime()) ? null : input;
    }

    // 2. If Firestore Timestamp instance with .toDate() method
    if (typeof input === "object" && typeof (input as any).toDate === "function") {
      const d = (input as any).toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    }

    // 3. If serialized Firestore Timestamp { seconds, nanoseconds } or { _seconds, _nanoseconds }
    if (typeof input === "object" && input !== null) {
      const raw = input as Record<string, any>;
      const seconds = raw.seconds ?? raw._seconds;
      if (typeof seconds === "number" && !isNaN(seconds)) {
        const nanoseconds = raw.nanoseconds ?? raw._nanoseconds ?? 0;
        const ms = seconds * 1000 + Math.floor(nanoseconds / 1000000);
        const d = new Date(ms);
        return !isNaN(d.getTime()) ? d : null;
      }
    }

    // 4. If number (Unix timestamp in ms or seconds)
    if (typeof input === "number") {
      if (isNaN(input) || !isFinite(input)) return null;
      const ms = input > 1e11 ? input : input * 1000;
      const d = new Date(ms);
      return !isNaN(d.getTime()) ? d : null;
    }

    // 5. If string
    if (typeof input === "string") {
      const str = input.trim();
      if (!str || str.toLowerCase() === "invalid date" || str.toLowerCase() === "null" || str.toLowerCase() === "undefined") {
        return null;
      }

      // Check if numeric string
      if (/^\d{9,16}$/.test(str)) {
        const num = Number(str);
        if (!isNaN(num)) {
          const ms = num > 1e11 ? num : num * 1000;
          const d = new Date(ms);
          if (!isNaN(d.getTime())) return d;
        }
      }

      // Check for Brazilian / European format DD/MM/YYYY or DD-MM-YYYY (with optional HH:mm:ss)
      const brMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
      if (brMatch) {
        const day = parseInt(brMatch[1], 10);
        const monthNum = parseInt(brMatch[2], 10);
        const year = parseInt(brMatch[3], 10);
        if (day < 1 || day > 31 || monthNum < 1 || monthNum > 12 || year < 1900 || year > 2100) {
          return null;
        }
        const month = monthNum - 1;
        const hour = brMatch[4] ? parseInt(brMatch[4], 10) : 0;
        const minute = brMatch[5] ? parseInt(brMatch[5], 10) : 0;
        const second = brMatch[6] ? parseInt(brMatch[6], 10) : 0;
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
          return null;
        }
        const d = new Date(year, month, day, hour, minute, second);
        if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) {
          return null;
        }
        return !isNaN(d.getTime()) ? d : null;
      }

      // Check for YYYY-MM-DD format without time
      const isoDateMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
      if (isoDateMatch) {
        const year = parseInt(isoDateMatch[1], 10);
        const monthNum = parseInt(isoDateMatch[2], 10);
        const day = parseInt(isoDateMatch[3], 10);
        if (day < 1 || day > 31 || monthNum < 1 || monthNum > 12 || year < 1900 || year > 2100) {
          return null;
        }
        const month = monthNum - 1;
        const d = new Date(year, month, day);
        if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) {
          return null;
        }
        return !isNaN(d.getTime()) ? d : null;
      }

      // Fallback standard Date parsing
      const parsed = new Date(str);
      if (isNaN(parsed.getTime())) return null;
      if (parsed.getFullYear() < 1900 || parsed.getFullYear() > 2100) {
        return null;
      }
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Safely formats any date input into a Brazilian formatted date string: DD/MM/YYYY.
 * Validates Firestore Timestamps (calling .toDate()), JS Date instances, unix timestamps,
 * and strings. Returns 'Data não informada' for null, undefined, corrupted or invalid values,
 * strictly preventing any 'RangeError: Invalid time value'.
 */
export function formatSafeDate(input: unknown, fallback = "Data não informada"): string {
  if (input === null || input === undefined || input === "" || input === "null" || input === "undefined") {
    return fallback;
  }

  // 1. Direct Firestore Timestamp object with .toDate() method
  if (typeof input === "object" && typeof (input as any).toDate === "function") {
    try {
      const d = (input as any).toDate();
      if (d instanceof Date && !isNaN(d.getTime())) {
        return new Intl.DateTimeFormat("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(d);
      }
    } catch {
      return fallback;
    }
  }

  // 2. Parse through safe parser
  const date = safeParseDate(input);
  if (!date || isNaN(date.getTime())) return fallback;

  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  } catch {
    try {
      const d = String(date.getDate()).padStart(2, "0");
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const y = date.getFullYear();
      return `${d}/${m}/${y}`;
    } catch {
      return fallback;
    }
  }
}

/**
 * Standard alias for formatSafeDate
 */
export const formatDate = formatSafeDate;

/**
 * Formats any date input into a Brazilian formatted date & time string: DD/MM/YYYY HH:mm
 * Guaranteed to never throw RangeError: Invalid time value.
 */
export function formatSafeDateTime(input: unknown, fallback = "Data não informada"): string {
  if (input === null || input === undefined || input === "" || input === "null" || input === "undefined") {
    return fallback;
  }

  // 1. Direct Firestore Timestamp object with .toDate() method
  if (typeof input === "object" && typeof (input as any).toDate === "function") {
    try {
      const d = (input as any).toDate();
      if (d instanceof Date && !isNaN(d.getTime())) {
        return new Intl.DateTimeFormat("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(d);
      }
    } catch {
      return fallback;
    }
  }

  const date = safeParseDate(input);
  if (!date || isNaN(date.getTime())) return fallback;
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    try {
      const d = String(date.getDate()).padStart(2, "0");
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const y = date.getFullYear();
      const h = String(date.getHours()).padStart(2, "0");
      const min = String(date.getMinutes()).padStart(2, "0");
      return `${d}/${m}/${y} ${h}:${min}`;
    } catch {
      return fallback;
    }
  }
}

export const formatDateTime = formatSafeDateTime;

/**
 * String Sanitization & Safe Case Transformation Utilities
 * Guarantees null/undefined safety across search queries, filters, and comparisons.
 */
export function safeToLower(value: unknown, contextOrigin?: string): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.toLowerCase().trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).toLowerCase().trim();
  }
  return "";
}

export function sanitizeQuery(query: unknown): string {
  if (query === null || query === undefined) {
    return "";
  }
  if (typeof query !== "string") {
    return String(query).trim();
  }
  return query.trim();
}

export function safeIncludes(target: unknown, query: unknown): boolean {
  const cleanTarget = safeToLower(target);
  const cleanQuery = safeToLower(query);
  if (!cleanQuery) return true;
  if (!cleanTarget) return false;
  return cleanTarget.includes(cleanQuery);
}

export function safeTextCorpus(...parts: unknown[]): string {
  return parts
    .map((p) => (p === null || p === undefined ? "" : String(p).toLowerCase().trim()))
    .filter(Boolean)
    .join(" ");
}

/**
 * Mobile Haptic Vibration API Helper
 * Triggers vibration feedback on supported mobile devices for critical interactions
 */
export function triggerVibration(pattern: number | number[] = 35): boolean {
  if (typeof window !== "undefined" && typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      return navigator.vibrate(pattern);
    } catch (_) {
      return false;
    }
  }
  return false;
}

export function vibrateClick(): boolean {
  return triggerVibration(30);
}

export function vibrateSuccess(): boolean {
  return triggerVibration([30, 50, 60]);
}

export function vibrateWarning(): boolean {
  return triggerVibration([50, 40, 50]);
}

export function vibrateCritical(): boolean {
  return triggerVibration([70, 50, 70]);
}

/**
 * Checks if an item was registered / added within the last 24 hours (or custom hour window)
 */
export function isItemNew(
  item: { createdAt?: unknown; date?: unknown; updatedAt?: unknown } | null | undefined,
  maxHours = 24
): boolean {
  if (!item) return false;
  const rawDate = item.createdAt ?? item.updatedAt ?? item.date;
  const date = safeParseDate(rawDate);
  if (!date) return false;
  try {
    const timestamp = date.getTime();
    const now = Date.now();
    const diffMs = now - timestamp;
    // Allow small clock skew (up to 1 minute into future) and within maxHours
    return diffMs >= -60000 && diffMs <= maxHours * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * Returns a human-friendly age string for recent items (e.g., "Há 2 horas", "Há 45 min", "Hoje")
 */
export function getItemAgeText(input?: unknown, fallback = "Data não informada"): string {
  const date = safeParseDate(input);
  if (!date) return fallback;
  try {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (isNaN(diffMs)) return formatDate(date, fallback);

    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffMinutes < 1) return "Agora mesmo";
    if (diffMinutes < 60) return `Há ${diffMinutes} min`;
    if (diffHours < 24) return `Há ${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Ontem";
    if (diffDays < 7) return `Há ${diffDays} dias`;
    return formatDate(date, fallback);
  } catch {
    return formatDate(date, fallback);
  }
}

