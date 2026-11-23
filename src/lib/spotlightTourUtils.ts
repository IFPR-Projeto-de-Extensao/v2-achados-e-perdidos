import type { ApprovalStatus, UserRole } from "../types";
import type { SupportedLanguage } from "./i18n";

export type TourPlacement = "auto" | "top" | "bottom" | "left" | "right";
export type ResolvedTourPlacement = "top" | "bottom" | "left" | "right" | "center";

export interface SpotlightTourStep {
  id: string;
  /** Ordered list of CSS selectors; the first visible element in the DOM is highlighted. */
  selectors: string[];
  title: string;
  description: string;
  preferredPlacement?: TourPlacement;
  /** Allows user interaction with the highlighted element while the spotlight is open. */
  interactive?: boolean;
}

export interface TourUserContext {
  role?: UserRole | null;
  approvalStatus?: ApprovalStatus | null;
  isAuthenticated: boolean;
  isGuest: boolean;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface RectLike {
  top: number;
  left: number;
  width: number;
  height: number;
  right?: number;
  bottom?: number;
}

export interface TourRect {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export interface OverlayPanes {
  top: { top: number; left: number; width: number; height: number };
  bottom: { top: number; left: number; width: number; height: number };
  left: { top: number; left: number; width: number; height: number };
  right: { top: number; left: number; width: number; height: number };
}

export interface TooltipPosition {
  top: number;
  left: number;
  width: number;
  placement: ResolvedTourPlacement;
  /** Horizontal or vertical offset (px) from tooltip's top-left corner for the directional caret. */
  arrowOffset: number;
}

export interface BlockingOverlayState {
  authModalOpen: boolean;
  hasSelectedItemModal: boolean;
  qrScannerOpen: boolean;
  shortcutsModalOpen: boolean;
  hasRemoteSignatureModal: boolean;
  isMaintenanceBlocking: boolean;
  isEmailVerificationRequired: boolean;
}

export const TOUR_STORAGE_KEYS = [
  "ifpr_achados_tour_completed",
  "ifpr_tour_completed",
  "ifpr_dont_show_tour",
] as const;

export const OPEN_TOUR_EVENT = "open-tour-guide";

export function hasCompletedSpotlightTour(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return TOUR_STORAGE_KEYS.some((key) => window.localStorage.getItem(key) === "true");
  } catch {
    return false;
  }
}

export function markSpotlightTourCompleted(): void {
  if (typeof window === "undefined") return;
  try {
    TOUR_STORAGE_KEYS.forEach((key) => window.localStorage.setItem(key, "true"));
  } catch {
    // Ignore storage quota or privacy-mode errors safely
  }
}

export function resetSpotlightTourCompletion(): void {
  if (typeof window === "undefined") return;
  try {
    TOUR_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Ignore storage errors safely
  }
}

export function triggerSpotlightTour(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_TOUR_EVENT));
}

export function hasActiveBlockingOverlay(state: BlockingOverlayState): boolean {
  return Boolean(
    state.authModalOpen ||
      state.hasSelectedItemModal ||
      state.qrScannerOpen ||
      state.shortcutsModalOpen ||
      state.hasRemoteSignatureModal ||
      state.isMaintenanceBlocking ||
      state.isEmailVerificationRequired
  );
}

/**
 * Builds role- and permission-adapted steps for the Spotlight Guided Tour.
 * Never exposes administrative, staff, or authenticated-only features to profiles without access.
 */
export function buildSpotlightTourSteps(
  user: TourUserContext,
  language: SupportedLanguage = "pt"
): SpotlightTourStep[] {
  const isEn = language === "en";
  const isAuthenticatedUser = Boolean(user.isAuthenticated && !user.isGuest);
  const role = user.role;
  const isApprovedStaff = role === "SERVIDOR" && user.approvalStatus === "APROVADO";
  const isPendingStaff = role === "SERVIDOR" && user.approvalStatus !== "APROVADO";
  const isAdmin = role === "ADMIN";

  const catalogStep: SpotlightTourStep = {
    id: "catalog",
    selectors: [
      '[data-tour="nav-catalog"]',
      '[data-tour="mobile-nav-catalog"]',
      '[data-tour="home-catalog-cta"]',
    ],
    title: isEn ? "Object Catalog" : "Catálogo de Objetos",
    description: isEn
      ? "Browse all found and lost items registered at the campus, with category, block, and status filters."
      : "Consulte os objetos perdidos e encontrados registrados no campus, com filtros por categoria, bloco e situação.",
    preferredPlacement: "bottom",
    interactive: true,
  };

  const searchStep: SpotlightTourStep = {
    id: "search",
    selectors: [
      '[data-tour="home-search"]',
      '[data-tour="catalog-search"]',
      "#home-search-input",
    ],
    title: isEn ? "Quick Search" : "Pesquisa Rápida",
    description: isEn
      ? "Search by item name, color, campus location, voice command, or QR code to locate belongings faster."
      : "Busque pelo nome, cor, local do campus, comando de voz ou código QR para localizar pertences rapidamente.",
    preferredPlacement: "bottom",
    interactive: true,
  };

  // Unauthenticated visitor: do not present authenticated-only claims/profile steps
  if (!isAuthenticatedUser) {
    const loginStep: SpotlightTourStep = {
      id: "account-access",
      selectors: ['[data-tour="nav-login"]'],
      title: isEn ? "Institutional Account" : "Acesso à Conta",
      description: isEn
        ? "Sign in with your IFPR account to submit claims, follow your requests, and view your profile."
        : "Entre com sua conta institucional para reivindicar pertences, acompanhar solicitações e acessar seu perfil.",
      preferredPlacement: "bottom",
      interactive: true,
    };
    return [catalogStep, searchStep, loginStep];
  }

  // Step 3: Occurrences — adapted strictly to each authenticated role's real permissions
  let occurrencesStep: SpotlightTourStep;

  if (isAdmin) {
    occurrencesStep = {
      id: "occurrences",
      selectors: [
        '[data-tour="nav-admin-panel"]',
        '[data-tour="mobile-nav-admin"]',
        '[data-tour="nav-notifications"]',
      ],
      title: isEn ? "Occurrences & Management" : "Ocorrências e Gestão",
      description: isEn
        ? "Review claims, confirm custody arrivals, complete formal returns, and manage campus occurrences in the Admin panel."
        : "Analise reivindicações, confirme chegadas, conclua devoluções formais e gerencie ocorrências pelo painel Admin.",
      preferredPlacement: "bottom",
      interactive: true,
    };
  } else if (isApprovedStaff) {
    occurrencesStep = {
      id: "occurrences",
      selectors: [
        '[data-tour="nav-admin-panel"]',
        '[data-tour="mobile-nav-admin"]',
        '[data-tour="nav-notifications"]',
      ],
      title: isEn ? "Occurrences & Custody" : "Ocorrências e Custódia",
      description: isEn
        ? "Track student claims, confirm item arrivals, and manage custody occurrences directly from the Staff Panel."
        : "Acompanhe reivindicações, confirme a chegada de objetos e gerencie ocorrências no Painel do Servidor.",
      preferredPlacement: "bottom",
      interactive: true,
    };
  } else if (isPendingStaff) {
    occurrencesStep = {
      id: "occurrences",
      selectors: ['[data-tour="nav-notifications"]', '[data-tour="home-occurrences"]'],
      title: isEn ? "Requests & Updates" : "Ocorrências e Avisos",
      description: isEn
        ? "Follow alerts about your requests and your staff approval status. Custody tools unlock once approved."
        : "Acompanhe avisos sobre suas solicitações e a aprovação do seu acesso de servidor.",
      preferredPlacement: "bottom",
      interactive: true,
    };
  } else if (role === "INTRUSO") {
    occurrencesStep = {
      id: "occurrences",
      selectors: ['[data-tour="nav-notifications"]', '[data-tour="home-occurrences"]'],
      title: isEn ? "Activity & Alerts" : "Ocorrências e Alertas",
      description: isEn
        ? "Check updates and notifications about requests and interactions available to your account."
        : "Acompanhe atualizações e avisos relacionados às interações disponíveis para a sua conta.",
      preferredPlacement: "bottom",
      interactive: true,
    };
  } else {
    // ALUNO (default authenticated student)
    occurrencesStep = {
      id: "occurrences",
      selectors: ['[data-tour="nav-notifications"]', '[data-tour="home-occurrences"]'],
      title: isEn ? "Occurrences & Claims" : "Ocorrências e Solicitações",
      description: isEn
        ? "Track real-time updates on your claims, item matches, and return notifications here."
        : "Acompanhe por aqui o andamento das suas solicitações, reivindicações e avisos de devolução.",
      preferredPlacement: "bottom",
      interactive: true,
    };
  }

  // Step 4: Profile — available to all authenticated users
  const profileStep: SpotlightTourStep = {
    id: "profile",
    selectors: ['[data-tour="nav-profile"]', '[data-tour="mobile-nav-profile"]'],
    title: isEn ? "Your Profile" : "Seu Perfil",
    description:
      isAdmin || isApprovedStaff
        ? isEn
          ? "Check your institutional details, linked records, and account preferences at any time."
          : "Consulte seus dados institucionais, registros vinculados e preferências da conta quando precisar."
        : isEn
        ? "View your account details, claim history, and preferences in one place."
        : "Consulte as informações da sua conta, histórico de reivindicações e preferências em um só lugar.",
    preferredPlacement: "bottom",
    interactive: true,
  };

  return [catalogStep, searchStep, occurrencesStep, profileStep];
}

export function isElementVisibleInDom(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (!el.isConnected) return false;

  if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
    const style = window.getComputedStyle(el);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number.parseFloat(style.opacity || "1") === 0
    ) {
      return false;
    }
  }

  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function resolveVisibleTargetElement(
  selectors: string[],
  root: Pick<Document, "querySelector"> = document
): HTMLElement | null {
  for (const selector of selectors) {
    try {
      const candidate = root.querySelector(selector);
      if (isElementVisibleInDom(candidate)) {
        return candidate;
      }
    } catch {
      // Ignore malformed selectors defensively
    }
  }
  return null;
}

/**
 * Finds the nearest step index (starting from `startIndex`) whose target element exists,
 * moving in `direction` (+1 or -1). Returns -1 if no step has a visible target.
 */
export function findNextAvailableStepIndex(
  steps: SpotlightTourStep[],
  startIndex: number,
  direction: 1 | -1,
  hasVisibleTarget: (step: SpotlightTourStep) => boolean
): number {
  if (steps.length === 0) return -1;
  let idx = Math.max(0, Math.min(startIndex, steps.length - 1));

  while (idx >= 0 && idx < steps.length) {
    if (hasVisibleTarget(steps[idx])) {
      return idx;
    }
    idx += direction;
  }

  return -1;
}

export function isFixedOrStickyElement(el: HTMLElement | null): boolean {
  if (!el || typeof window === "undefined" || typeof window.getComputedStyle !== "function") {
    return false;
  }
  let node: HTMLElement | null = el;
  while (node && node !== document.body && node !== document.documentElement) {
    const pos = window.getComputedStyle(node).position;
    if (pos === "fixed" || pos === "sticky") {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

/**
 * Determines whether a target element needs automatic scrolling into the comfortable viewport band.
 */
export function shouldScrollElementIntoView(
  rect: RectLike,
  viewport: ViewportSize,
  isFixedOrSticky: boolean
): boolean {
  if (isFixedOrSticky) return false;
  const topSafe = Math.min(84, viewport.height * 0.15);
  const bottomSafe = viewport.height - Math.min(110, viewport.height * 0.2);
  const bottom = rect.bottom ?? rect.top + rect.height;
  return rect.top < topSafe || bottom > bottomSafe;
}

/**
 * Computes a padded spotlight box clamped strictly within viewport bounds.
 */
export function computeSpotlightRect(
  targetRect: RectLike,
  viewport: ViewportSize,
  padding = 6
): TourRect {
  const targetRight = targetRect.right ?? targetRect.left + targetRect.width;
  const targetBottom = targetRect.bottom ?? targetRect.top + targetRect.height;

  const top = Math.max(0, Math.min(viewport.height, Math.round(targetRect.top - padding)));
  const left = Math.max(0, Math.min(viewport.width, Math.round(targetRect.left - padding)));
  const right = Math.max(left, Math.min(viewport.width, Math.round(targetRight + padding)));
  const bottom = Math.max(top, Math.min(viewport.height, Math.round(targetBottom + padding)));

  return {
    top,
    left,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/**
 * Splits the darkened/blurred backdrop into 4 seamless panes surrounding the spotlight cutout.
 * Keeps the highlighted element 100% sharp, unblurred, and interactive.
 */
export function computeOverlayPanes(
  spotlight: TourRect,
  viewport: ViewportSize
): OverlayPanes {
  return {
    top: {
      top: 0,
      left: 0,
      width: viewport.width,
      height: Math.max(0, spotlight.top),
    },
    bottom: {
      top: spotlight.bottom,
      left: 0,
      width: viewport.width,
      height: Math.max(0, viewport.height - spotlight.bottom),
    },
    left: {
      top: spotlight.top,
      left: 0,
      width: Math.max(0, spotlight.left),
      height: spotlight.height,
    },
    right: {
      top: spotlight.top,
      left: spotlight.right,
      width: Math.max(0, viewport.width - spotlight.right),
      height: spotlight.height,
    },
  };
}

/**
 * Computes a compact, viewport-safe tooltip position adjacent to the spotlight target.
 * Guarantees the tooltip never overflows horizontally or vertically across Desktop, Tablet,
 * Smartphone (320px+), and PWA safe areas.
 */
export function computeTooltipPosition(
  spotlight: TourRect | null,
  tooltipHeight: number,
  viewport: ViewportSize,
  preferredPlacement: TourPlacement = "auto",
  options?: {
    maxWidth?: number;
    margin?: number;
    gap?: number;
    bottomSafeInset?: number;
  }
): TooltipPosition {
  const margin = options?.margin ?? 12;
  const gap = options?.gap ?? 12;
  const bottomSafeInset = options?.bottomSafeInset ?? 0;
  const maxWidth = options?.maxWidth ?? 312;

  const width = Math.max(220, Math.min(maxWidth, viewport.width - margin * 2));
  const safeHeight = Math.max(120, Math.min(tooltipHeight, viewport.height - margin * 2 - bottomSafeInset));
  const maxLeft = Math.max(margin, viewport.width - width - margin);
  const maxTop = Math.max(margin, viewport.height - safeHeight - margin - bottomSafeInset);

  if (!spotlight) {
    return {
      top: Math.max(margin, Math.min(maxTop, Math.round((viewport.height - safeHeight) / 2))),
      left: Math.max(margin, Math.min(maxLeft, Math.round((viewport.width - width) / 2))),
      width,
      placement: "center",
      arrowOffset: Math.round(width / 2),
    };
  }

  const targetCenterX = spotlight.left + spotlight.width / 2;
  const targetCenterY = spotlight.top + spotlight.height / 2;

  const spaceTop = spotlight.top - margin;
  const spaceBottom = viewport.height - bottomSafeInset - spotlight.bottom - margin;
  const spaceLeft = spotlight.left - margin;
  const spaceRight = viewport.width - spotlight.right - margin;

  const defaultOrder: Array<"bottom" | "top" | "right" | "left"> = ["bottom", "top", "right", "left"];
  const orderedPlacements: Array<"bottom" | "top" | "right" | "left"> =
    preferredPlacement === "auto"
      ? defaultOrder
      : [preferredPlacement, ...defaultOrder.filter((p) => p !== preferredPlacement)];

  const fitsPlacement = (p: "bottom" | "top" | "right" | "left"): boolean => {
    if (p === "bottom") return spaceBottom >= safeHeight + gap;
    if (p === "top") return spaceTop >= safeHeight + gap;
    if (p === "right") return viewport.width >= 640 && spaceRight >= width + gap;
    if (p === "left") return viewport.width >= 640 && spaceLeft >= width + gap;
    return false;
  };

  let chosen: "bottom" | "top" | "right" | "left" =
    orderedPlacements.find(fitsPlacement) ?? (spaceBottom >= spaceTop ? "bottom" : "top");

  let top = margin;
  let left = margin;
  let arrowOffset = Math.round(width / 2);

  if (chosen === "bottom") {
    top = spotlight.bottom + gap;
    left = targetCenterX - width / 2;
  } else if (chosen === "top") {
    top = spotlight.top - safeHeight - gap;
    left = targetCenterX - width / 2;
  } else if (chosen === "right") {
    top = targetCenterY - safeHeight / 2;
    left = spotlight.right + gap;
  } else {
    top = targetCenterY - safeHeight / 2;
    left = spotlight.left - width - gap;
  }

  left = Math.max(margin, Math.min(maxLeft, Math.round(left)));
  top = Math.max(margin, Math.min(maxTop, Math.round(top)));

  if (chosen === "top" || chosen === "bottom") {
    arrowOffset = Math.max(20, Math.min(width - 20, Math.round(targetCenterX - left)));
  } else {
    arrowOffset = Math.max(20, Math.min(safeHeight - 20, Math.round(targetCenterY - top)));
  }

  return {
    top,
    left,
    width,
    placement: chosen,
    arrowOffset,
  };
}
