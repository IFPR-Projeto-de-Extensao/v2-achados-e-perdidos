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

/**
 * Checks if an item was registered / added within the last 24 hours (or custom hour window)
 */
export function isItemNew(
  item: { createdAt?: string; date?: string; updatedAt?: string } | null | undefined,
  maxHours = 24
): boolean {
  if (!item) return false;
  const dateStr = item.createdAt || item.updatedAt || item.date;
  if (!dateStr) return false;
  try {
    const timestamp = new Date(dateStr).getTime();
    if (isNaN(timestamp)) return false;
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
export function getItemAgeText(dateString?: string): string {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (isNaN(diffMs)) return formatDate(dateString);

    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffMinutes < 1) return "Agora mesmo";
    if (diffMinutes < 60) return `Há ${diffMinutes} min`;
    if (diffHours < 24) return `Há ${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Ontem";
    if (diffDays < 7) return `Há ${diffDays} dias`;
    return formatDate(dateString);
  } catch {
    return dateString || "";
  }
}

