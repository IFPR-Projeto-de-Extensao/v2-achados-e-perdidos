import { TargetAndTransition, Transition } from "motion/react";
import { AppRouteKey } from "./routes";

export type TransitionType =
  | "slide-forward"
  | "slide-backward"
  | "slide-up"
  | "scale-fade"
  | "cross-fade"
  | "none";

/**
 * Calculates the numeric hierarchical depth of a given route.
 * Root (Home) = 0, Top-level pages = 1, Sub-pages/Admin root = 2, Deep admin sub-views = 3.
 */
export function getRouteDepth(pathname: string, routeKey: AppRouteKey): number {
  if (pathname === "/" || routeKey === "home") {
    return 0;
  }

  // Deep admin sub-routes (e.g. /admin/usuarios, /admin/documentos)
  if (
    pathname.startsWith("/admin/") &&
    pathname !== "/admin/dashboard" &&
    pathname !== "/admin"
  ) {
    return 3;
  }

  // Admin root & sub-pages
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/suporte/") ||
    pathname.includes("/feedback") ||
    pathname.includes("/relatar-bug")
  ) {
    return 2;
  }

  // Primary top-level views
  return 1;
}

/**
 * Determines the ideal animation transition type when moving from a previous route to the target route.
 * - Form routes (e.g., 'cadastrar') -> 'slide-up'
 * - Admin Panel & Dashboard transitions -> horizontal 'slide-forward' / 'slide-backward'
 * - AI Tools -> 'scale-fade'
 * - Sibling routes -> 'cross-fade'
 */
export function determineTransitionType(
  prevPath: string,
  prevRouteKey: AppRouteKey | null,
  currentPath: string,
  currentRouteKey: AppRouteKey
): TransitionType {
  // Navigation to form routes (e.g. 'cadastrar') uses distinct 'slide-up' transition
  const isFormRoute =
    currentRouteKey === "register" ||
    currentPath === "/cadastrar" ||
    currentPath.startsWith("/cadastrar");

  const wasFormRoute =
    prevRouteKey === "register" ||
    prevPath === "/cadastrar" ||
    prevPath.startsWith("/cadastrar");

  if (isFormRoute && !wasFormRoute) {
    return "slide-up";
  }

  // AI Visual Analyzer special scale-in effect
  if (currentRouteKey === "image_analyzer" && prevRouteKey !== "image_analyzer") {
    return "scale-fade";
  }

  // Transition between Administrative Panel level and Dashboard or Admin subtabs:
  // Use horizontal slide-in animations
  const isCurrentAdmin = currentPath.startsWith("/admin") || currentRouteKey === "admin";
  const wasPrevAdmin = prevPath.startsWith("/admin") || prevRouteKey === "admin";

  if (isCurrentAdmin || wasPrevAdmin) {
    const prevDepth = prevRouteKey ? getRouteDepth(prevPath, prevRouteKey) : 0;
    const currentDepth = getRouteDepth(currentPath, currentRouteKey);

    if (currentDepth >= prevDepth) {
      return "slide-forward";
    } else {
      return "slide-backward";
    }
  }

  const prevDepth = prevRouteKey ? getRouteDepth(prevPath, prevRouteKey) : 0;
  const currentDepth = getRouteDepth(currentPath, currentRouteKey);

  // Moving deeper in the hierarchy -> horizontal slide-forward
  if (currentDepth > prevDepth) {
    return "slide-forward";
  }

  // Moving back up in the hierarchy -> horizontal slide-backward
  if (currentDepth < prevDepth) {
    return "slide-backward";
  }

  // Sibling routes at the same hierarchical depth
  return "cross-fade";
}

export interface RouteAnimationVariants {
  initial: TargetAndTransition;
  animate: TargetAndTransition;
  exit: TargetAndTransition;
  transition: Transition;
}

/**
 * Returns customized Motion variants based on the computed transition type.
 */
export function getRouteAnimationVariants(
  transitionType: TransitionType,
  shouldReduceMotion: boolean = false
): RouteAnimationVariants {
  if (shouldReduceMotion) {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 1 },
      transition: { duration: 0 },
    };
  }

  switch (transitionType) {
    case "slide-forward":
      return {
        initial: { opacity: 0, x: 28, scale: 0.995 },
        animate: { opacity: 1, x: 0, scale: 1 },
        exit: { opacity: 0, x: -24, scale: 0.995 },
        transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
      };

    case "slide-backward":
      return {
        initial: { opacity: 0, x: -28, scale: 0.995 },
        animate: { opacity: 1, x: 0, scale: 1 },
        exit: { opacity: 0, x: 24, scale: 0.995 },
        transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
      };

    case "slide-up":
      return {
        initial: { opacity: 0, y: 32, scale: 0.99 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: -16, scale: 0.99 },
        transition: { duration: 0.24, ease: [0.16, 1, 0.3, 1] },
      };

    case "scale-fade":
      return {
        initial: { opacity: 0, scale: 0.95, y: 6 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 1.02, y: -6 },
        transition: { duration: 0.2, ease: "easeOut" },
      };

    case "cross-fade":
    default:
      return {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
        transition: { duration: 0.18, ease: "easeOut" },
      };
  }
}
