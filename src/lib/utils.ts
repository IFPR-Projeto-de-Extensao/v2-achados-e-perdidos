import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString: string): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(dateString: string): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

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

