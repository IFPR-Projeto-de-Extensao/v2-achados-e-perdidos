import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  OPEN_TOUR_EVENT,
  TOUR_STORAGE_KEYS,
  buildSpotlightTourSteps,
  computeOverlayPanes,
  computeSpotlightRect,
  computeTooltipPosition,
  findNextAvailableStepIndex,
  hasActiveBlockingOverlay,
  hasCompletedSpotlightTour,
  markSpotlightTourCompleted,
  resetSpotlightTourCompletion,
  shouldScrollElementIntoView,
  triggerSpotlightTour,
} from "./spotlightTourUtils";

const readSrc = (relPath: string): string =>
  fs.readFileSync(path.resolve(process.cwd(), relPath), "utf8");

describe("Spotlight Guided Tour — LOCALIZA+ Onboarding", () => {
  const originalWindow = (globalThis as any).window;
  let storageMap: Map<string, string>;
  let dispatchedEvents: string[];

  beforeEach(() => {
    storageMap = new Map<string, string>();
    dispatchedEvents = [];
    (globalThis as any).window = {
      localStorage: {
        getItem: (key: string) => (storageMap.has(key) ? storageMap.get(key)! : null),
        setItem: (key: string, value: string) => storageMap.set(key, String(value)),
        removeItem: (key: string) => storageMap.delete(key),
        clear: () => storageMap.clear(),
      },
      dispatchEvent: vi.fn((event: { type?: string }) => {
        if (event?.type) dispatchedEvents.push(event.type);
        return true;
      }),
    };
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
  });

  describe("1. Persistence, Opening, Closing & Replay", () => {
    it("starts uncompleted and persists completion across all legacy and canonical keys", () => {
      expect(hasCompletedSpotlightTour()).toBe(false);

      markSpotlightTourCompleted();
      expect(hasCompletedSpotlightTour()).toBe(true);
      for (const key of TOUR_STORAGE_KEYS) {
        expect(storageMap.get(key)).toBe("true");
      }

      resetSpotlightTourCompletion();
      expect(hasCompletedSpotlightTour()).toBe(false);
    });

    it("prevents repeated automatic display when any completion key is already persisted", () => {
      storageMap.set("ifpr_tour_completed", "true");
      expect(hasCompletedSpotlightTour()).toBe(true);
    });

    it("dispatches the unified open-tour-guide event to replay the tour without duplicating onboarding", () => {
      triggerSpotlightTour();
      expect(dispatchedEvents).toEqual([OPEN_TOUR_EVENT]);
    });
  });

  describe("2. Role & Permission Adaptation (RBAC Safety)", () => {
    it("builds 4 student-safe steps for ALUNO without referencing admin/staff custody panels", () => {
      const steps = buildSpotlightTourSteps(
        { role: "ALUNO", approvalStatus: "APROVADO", isAuthenticated: true, isGuest: false },
        "pt"
      );

      expect(steps.map((s) => s.id)).toEqual(["catalog", "search", "occurrences", "profile"]);
      const occurrences = steps[2];
      expect(occurrences.selectors).not.toContain('[data-tour="nav-admin-panel"]');
      expect(occurrences.selectors).not.toContain('[data-tour="mobile-nav-admin"]');
      expect(occurrences.description.toLowerCase()).not.toContain("painel admin");
      expect(occurrences.description.toLowerCase()).not.toContain("painel do servidor");
    });

    it("adapts Occurrences step to Staff Panel for approved SERVIDOR", () => {
      const steps = buildSpotlightTourSteps(
        { role: "SERVIDOR", approvalStatus: "APROVADO", isAuthenticated: true, isGuest: false },
        "pt"
      );

      expect(steps.map((s) => s.id)).toEqual(["catalog", "search", "occurrences", "profile"]);
      expect(steps[2].selectors).toContain('[data-tour="nav-admin-panel"]');
      expect(steps[2].selectors).toContain('[data-tour="mobile-nav-admin"]');
      expect(steps[2].description).toContain("Painel do Servidor");
    });

    it("does NOT expose Staff Panel custody actions to pending SERVIDOR", () => {
      const steps = buildSpotlightTourSteps(
        { role: "SERVIDOR", approvalStatus: "PENDENTE", isAuthenticated: true, isGuest: false },
        "pt"
      );

      expect(steps.map((s) => s.id)).toEqual(["catalog", "search", "occurrences", "profile"]);
      expect(steps[2].selectors).not.toContain('[data-tour="nav-admin-panel"]');
      expect(steps[2].description.toLowerCase()).toContain("aprovação");
    });

    it("adapts Occurrences step to Admin management for ADMIN", () => {
      const steps = buildSpotlightTourSteps(
        { role: "ADMIN", approvalStatus: "APROVADO", isAuthenticated: true, isGuest: false },
        "pt"
      );

      expect(steps.map((s) => s.id)).toEqual(["catalog", "search", "occurrences", "profile"]);
      expect(steps[2].selectors).toContain('[data-tour="nav-admin-panel"]');
      expect(steps[2].description).toContain("Admin");
    });

    it("does NOT expose claims/profile/admin steps to unauthenticated visitors (guest)", () => {
      const steps = buildSpotlightTourSteps(
        { role: "ALUNO", approvalStatus: "APROVADO", isAuthenticated: false, isGuest: true },
        "pt"
      );

      expect(steps.map((s) => s.id)).toEqual(["catalog", "search", "account-access"]);
      expect(steps.some((s) => s.id === "profile")).toBe(false);
      expect(steps.some((s) => s.id === "occurrences")).toBe(false);
      expect(steps[2].selectors).toEqual(['[data-tour="nav-login"]']);
    });

    it("supports full bilingual English (EN-US) copy for every role", () => {
      const enSteps = buildSpotlightTourSteps(
        { role: "ALUNO", approvalStatus: "APROVADO", isAuthenticated: true, isGuest: false },
        "en"
      );

      expect(enSteps[0].title).toBe("Object Catalog");
      expect(enSteps[1].title).toBe("Quick Search");
      expect(enSteps[2].title).toBe("Occurrences & Claims");
      expect(enSteps[3].title).toBe("Your Profile");
    });
  });

  describe("3. Step Navigation & Non-Existent Element Resilience", () => {
    it("skips steps whose target elements do not exist in the DOM when moving forward or backward", () => {
      const steps = buildSpotlightTourSteps(
        { role: "ALUNO", approvalStatus: "APROVADO", isAuthenticated: true, isGuest: false },
        "pt"
      );
      const visibleIds = new Set(["catalog", "profile"]);
      const isVisible = (step: { id: string }) => visibleIds.has(step.id);

      // Moving forward from step 1 (missing) jumps cleanly to step 3 ("profile")
      expect(findNextAvailableStepIndex(steps, 1, 1, isVisible)).toBe(3);

      // Moving backward from step 2 (missing) jumps cleanly back to step 0 ("catalog")
      expect(findNextAvailableStepIndex(steps, 2, -1, isVisible)).toBe(0);
    });

    it("returns -1 gracefully when zero step targets exist in DOM", () => {
      const steps = buildSpotlightTourSteps(
        { role: "ALUNO", approvalStatus: "APROVADO", isAuthenticated: true, isGuest: false },
        "pt"
      );
      expect(findNextAvailableStepIndex(steps, 0, 1, () => false)).toBe(-1);
    });
  });

  describe("4. Spotlight Geometry, Blur Panes & Responsive Tooltip Clamping", () => {
    it("computes clamped spotlight rectangle and 4 seamless surrounding overlay panes", () => {
      const viewport = { width: 1280, height: 800 };
      const spotlight = computeSpotlightRect(
        { top: 120, left: 400, width: 200, height: 48 },
        viewport,
        6
      );

      expect(spotlight).toEqual({
        top: 114,
        left: 394,
        right: 606,
        bottom: 174,
        width: 212,
        height: 60,
      });

      const panes = computeOverlayPanes(spotlight, viewport);
      // Verify full coverage without covering the spotlight center
      expect(panes.top).toEqual({ top: 0, left: 0, width: 1280, height: 114 });
      expect(panes.bottom).toEqual({ top: 174, left: 0, width: 1280, height: 626 });
      expect(panes.left).toEqual({ top: 114, left: 0, width: 394, height: 60 });
      expect(panes.right).toEqual({ top: 114, left: 606, width: 674, height: 60 });
    });

    it("keeps tooltip strictly inside viewport on Desktop (1440x900), Tablet (768x1024), Mobile (360x640), and Compact PWA (320x568)", () => {
      const viewports = [
        { name: "Desktop", width: 1440, height: 900 },
        { name: "Tablet", width: 768, height: 1024 },
        { name: "Smartphone", width: 360, height: 640 },
        { name: "Compact PWA", width: 320, height: 568 },
      ];

      const targets = [
        { name: "top-left", top: 12, left: 8, width: 90, height: 36 },
        { name: "top-right", top: 12, left: -1, width: 40, height: 36 }, // computed per viewport
        { name: "bottom-nav", top: -1, left: 20, width: 70, height: 48 }, // computed per viewport
        { name: "center-search", top: 180, left: 16, width: 280, height: 48 },
      ];

      for (const vp of viewports) {
        for (const t of targets) {
          const rect = {
            top: t.top === -1 ? vp.height - 56 : t.top,
            left: t.left === -1 ? vp.width - 48 : t.left,
            width: Math.min(t.width, vp.width - 16),
            height: t.height,
          };
          const spotlight = computeSpotlightRect(rect, vp, 6);
          const pos = computeTooltipPosition(spotlight, 180, vp, "bottom", {
            maxWidth: 312,
            margin: 12,
            gap: 12,
          });

          expect(pos.left, `${vp.name} ${t.name} left`).toBeGreaterThanOrEqual(12);
          expect(pos.left + pos.width, `${vp.name} ${t.name} right`).toBeLessThanOrEqual(vp.width - 12);
          expect(pos.top, `${vp.name} ${t.name} top`).toBeGreaterThanOrEqual(12);
          expect(pos.top + 180, `${vp.name} ${t.name} bottom`).toBeLessThanOrEqual(vp.height - 12);
        }
      }
    });

    it("flips tooltip above the element when targeting bottom navigation on smartphones", () => {
      const mobileViewport = { width: 375, height: 667 };
      const bottomTabSpotlight = computeSpotlightRect(
        { top: 611, left: 94, width: 93, height: 56 },
        mobileViewport,
        6
      );
      const pos = computeTooltipPosition(bottomTabSpotlight, 176, mobileViewport, "bottom");

      expect(pos.placement).toBe("top");
      expect(pos.top + 176).toBeLessThanOrEqual(bottomTabSpotlight.top);
    });

    it("centers tooltip safely as fallback when spotlight target is null", () => {
      const pos = computeTooltipPosition(null, 170, { width: 1024, height: 768 }, "bottom");
      expect(pos.placement).toBe("center");
      expect(pos.left).toBeGreaterThan(0);
      expect(pos.top).toBeGreaterThan(0);
    });
  });

  describe("5. Automatic Scrolling Rules", () => {
    it("skips auto-scroll for fixed or sticky navigation elements", () => {
      const vp = { width: 390, height: 844 };
      expect(shouldScrollElementIntoView({ top: 8, left: 20, width: 80, height: 40 }, vp, true)).toBe(false);
      expect(shouldScrollElementIntoView({ top: 790, left: 20, width: 80, height: 48 }, vp, true)).toBe(false);
    });

    it("triggers auto-scroll when an in-page element is outside the comfortable viewport band", () => {
      const vp = { width: 390, height: 844 };
      // Element way below the fold
      expect(shouldScrollElementIntoView({ top: 920, left: 16, width: 358, height: 52 }, vp, false)).toBe(true);
      // Element clipped under sticky header
      expect(shouldScrollElementIntoView({ top: 20, left: 16, width: 358, height: 52 }, vp, false)).toBe(true);
      // Element nicely centered in viewport
      expect(shouldScrollElementIntoView({ top: 260, left: 16, width: 358, height: 52 }, vp, false)).toBe(false);
    });
  });

  describe("6. Overlay & Modal Conflict Prevention + Clean Removal of Legacy Tour", () => {
    it("detects every blocking modal/overlay so the tour never collides with active dialogs", () => {
      const clearState = {
        authModalOpen: false,
        hasSelectedItemModal: false,
        qrScannerOpen: false,
        shortcutsModalOpen: false,
        hasRemoteSignatureModal: false,
        isMaintenanceBlocking: false,
        isEmailVerificationRequired: false,
      };
      expect(hasActiveBlockingOverlay(clearState)).toBe(false);

      for (const key of Object.keys(clearState) as Array<keyof typeof clearState>) {
        expect(hasActiveBlockingOverlay({ ...clearState, [key]: true }), `blocking on ${key}`).toBe(true);
      }
    });

    it("confirms legacy TourGuide.tsx is removed and no duplicate onboarding exists in App.tsx", () => {
      const legacyPath = path.resolve(process.cwd(), "src/components/TourGuide.tsx");
      expect(fs.existsSync(legacyPath)).toBe(false);

      const appSrc = readSrc("src/App.tsx");
      expect(appSrc).not.toContain("./components/TourGuide");
      expect(appSrc).not.toContain("<TourGuide");
      expect(appSrc).toContain("SpotlightTour");
      expect(appSrc).toContain("isOpen={tourGuideOpen && !hasBlockingOverlay}");
    });

    it("confirms SpotlightTour respects prefers-reduced-motion, keyboard controls, and never locks global scroll", () => {
      const tourSrc = readSrc("src/components/SpotlightTour.tsx");
      expect(tourSrc).toContain("useReducedMotion");
      expect(tourSrc).toContain("motion-reduce:transition-none");
      expect(tourSrc).toContain('e.key === "Escape"');
      expect(tourSrc).toContain('e.key === "ArrowRight"');
      expect(tourSrc).toContain('e.key === "ArrowLeft"');
      expect(tourSrc).toContain("createPortal");
      expect(tourSrc).not.toMatch(/document\.body\.style\.overflow/);
    });

    it("confirms all data-tour targets and replay entry points are wired across the UI", () => {
      const navbar = readSrc("src/components/Navbar.tsx");
      const mobileNav = readSrc("src/components/MobileBottomNav.tsx");
      const home = readSrc("src/components/HomeView.tsx");
      const objects = readSrc("src/components/ObjectsView.tsx");
      const support = readSrc("src/components/SupportView.tsx");
      const settings = readSrc("src/components/SettingsView.tsx");
      const profile = readSrc("src/components/ProfileView.tsx");

      expect(navbar).toContain('data-tour="nav-catalog"');
      expect(navbar).toContain('data-tour="nav-admin-panel"');
      expect(navbar).toContain('data-tour="nav-notifications"');
      expect(navbar).toContain('data-tour="nav-profile"');
      expect(navbar).toContain('data-tour="nav-login"');

      expect(mobileNav).toContain('data-tour="mobile-nav-catalog"');
      expect(mobileNav).toContain('"mobile-nav-admin"');
      expect(mobileNav).toContain('"mobile-nav-profile"');

      expect(home).toContain('data-tour="home-search"');
      expect(home).toContain('data-tour="home-catalog-cta"');
      expect(home).toContain('data-tour="home-occurrences"');

      expect(objects).toContain('data-tour="catalog-search"');

      expect(support).toContain("triggerSpotlightTour");
      expect(settings).toContain("triggerSpotlightTour");
      expect(profile).toContain("triggerSpotlightTour");
    });
  });
});
