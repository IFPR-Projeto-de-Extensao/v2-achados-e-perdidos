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

