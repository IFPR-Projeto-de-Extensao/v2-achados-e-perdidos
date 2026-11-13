/**
 * Tokens oficiais do Design System Global Clean Minimal — Localiza+ IFPR Campus Ivaiporã.
 */
export const DESIGN_TOKENS = {
  colors: {
    primary: "#16845B",
    primaryHover: "#064E3B",
    primaryTint: "#EBF5F0",
    background: "#F8FAFC",
    surface: "#FFFFFF",
    text: "#172B2A",
    textSecondary: "#475569",
    border: "#E2E8F0",
    darkBackground: "#0B0F17",
    darkSurface: "#111827",
    darkBorder: "#1E293B",
  },
  typography: {
    fontFamily:
      "'Inter', 'Poppins', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  radii: {
    control: "rounded-xl",
    card: "rounded-2xl",
    badge: "rounded-full",
  },
  shadows: {
    card: "shadow-[0_1px_3px_rgba(23,43,42,0.04)]",
    cardHover: "shadow-[0_6px_20px_rgba(22,132,91,0.08)]",
    modal: "shadow-[0_20px_60px_rgba(6,78,59,0.16)] dark:shadow-[0_24px_64px_rgba(0,0,0,0.65)]",
  },
} as const;
