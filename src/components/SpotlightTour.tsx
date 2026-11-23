import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, Check, X } from "lucide-react";
import { useApp } from "../context/AppContext";
import { vibrateClick, vibrateSuccess } from "../lib/utils";
import {
  SpotlightTourStep,
  TourRect,
  TooltipPosition,
  computeOverlayPanes,
  computeSpotlightRect,
  computeTooltipPosition,
  findNextAvailableStepIndex,
  isFixedOrStickyElement,
  markSpotlightTourCompleted,
  resolveVisibleTargetElement,
  shouldScrollElementIntoView,
} from "../lib/spotlightTourUtils";

export interface SpotlightTourProps {
  isOpen: boolean;
  steps: SpotlightTourStep[];
  onClose: () => void;
  /** Optional callback invoked when the user clicks "Concluir" on the final step. */
  onComplete?: () => void;
  /** Optional callback invoked when the user clicks "Pular tour", presses Escape, or clicks outside. */
  onSkip?: () => void;
  /** Highlight padding around the target element in pixels (default: 6). */
  spotlightPadding?: number;
}

const DEFAULT_TOOLTIP_HEIGHT = 176;

function readViewport(): { width: number; height: number } {
  if (typeof window === "undefined") {
    return { width: 1280, height: 800 };
  }
  return {
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
  };
}

export const SpotlightTour: React.FC<SpotlightTourProps> = ({
  isOpen,
  steps,
  onClose,
  onComplete,
  onSkip,
  spotlightPadding = 6,
}) => {
  const { t } = useApp();
  const prefersReducedMotion = useReducedMotion();

  const [activeIndex, setActiveIndex] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<TourRect | null>(null);
  const [viewport, setViewport] = useState(readViewport);
  const [tooltipHeight, setTooltipHeight] = useState<number>(DEFAULT_TOOLTIP_HEIGHT);

  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const primaryButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const targetElementRef = useRef<HTMLElement | null>(null);
  const scrolledStepKeyRef = useRef<string | null>(null);

  const safeSteps = useMemo(() => steps.filter(Boolean), [steps]);
  const currentStep = safeSteps[activeIndex] ?? null;
  const totalSteps = safeSteps.length;
  const isFirstStep = activeIndex <= 0;
  const isLastStep = activeIndex >= totalSteps - 1;

  // Save & restore focus cleanly when opening/closing the tour
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      scrolledStepKeyRef.current = null;

      // Start at the first step whose element is visible, or 0 if DOM is still settling
      const firstAvailable = findNextAvailableStepIndex(safeSteps, 0, 1, (step) =>
        Boolean(resolveVisibleTargetElement(step.selectors))
      );
      setActiveIndex(firstAvailable >= 0 ? firstAvailable : 0);
      return;
    }

    targetElementRef.current = null;
    setSpotlightRect(null);
    scrolledStepKeyRef.current = null;

    const prev = previousFocusRef.current;
    previousFocusRef.current = null;
    if (prev && prev.isConnected && typeof prev.focus === "function") {
      requestAnimationFrame(() => {
        try {
          prev.focus({ preventScroll: true });
        } catch {
          // Ignore focus restoration errors
        }
      });
    }
  }, [isOpen, safeSteps]);

  const finishTour = useCallback(
    (mode: "complete" | "skip") => {
      if (mode === "complete") {
        vibrateSuccess();
      } else {
        vibrateClick();
      }
      markSpotlightTourCompleted();
      if (mode === "complete") {
        onComplete?.();
      } else {
        onSkip?.();
      }
      onClose();
    },
    [onClose, onComplete, onSkip]
  );

  const goToStep = useCallback(
    (targetIndex: number, direction: 1 | -1) => {
      if (safeSteps.length === 0) {
        finishTour("skip");
        return;
      }

      if (targetIndex >= safeSteps.length) {
        finishTour("complete");
        return;
      }

      if (targetIndex < 0) return;

      const resolved = findNextAvailableStepIndex(safeSteps, targetIndex, direction, (step) =>
        Boolean(resolveVisibleTargetElement(step.selectors))
      );

      if (resolved >= 0) {
        vibrateClick();
        setActiveIndex(resolved);
      } else if (direction === 1) {
        finishTour("complete");
      }
    },
    [finishTour, safeSteps]
  );

  const handleNext = useCallback(() => {
    if (isLastStep) {
      finishTour("complete");
    } else {
      goToStep(activeIndex + 1, 1);
    }
  }, [activeIndex, finishTour, goToStep, isLastStep]);

  const handlePrev = useCallback(() => {
    if (!isFirstStep) {
      goToStep(activeIndex - 1, -1);
    }
  }, [activeIndex, goToStep, isFirstStep]);

  const measureCurrentTarget = useCallback(() => {
    if (!isOpen || !currentStep) {
      setSpotlightRect(null);
      return;
    }

    const nextViewport = readViewport();
    setViewport(nextViewport);

    const el = resolveVisibleTargetElement(currentStep.selectors);
    targetElementRef.current = el;

    if (!el) {
      setSpotlightRect(null);
      return;
    }

    const rawRect = el.getBoundingClientRect();
    const stepScrollKey = `${currentStep.id}:${activeIndex}`;
    const fixedOrSticky = isFixedOrStickyElement(el);

    if (
      scrolledStepKeyRef.current !== stepScrollKey &&
      shouldScrollElementIntoView(rawRect, nextViewport, fixedOrSticky)
    ) {
      scrolledStepKeyRef.current = stepScrollKey;
      try {
        el.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "center",
          inline: "nearest",
        });
      } catch {
        el.scrollIntoView();
      }
    }

    const updatedRect = el.getBoundingClientRect();
    setSpotlightRect(computeSpotlightRect(updatedRect, nextViewport, spotlightPadding));
  }, [activeIndex, currentStep, isOpen, prefersReducedMotion, spotlightPadding]);

  // Measure target when step changes + retry briefly after route transitions settle
  useLayoutEffect(() => {
    if (!isOpen || !currentStep) return;

    measureCurrentTarget();

    const raf1 = requestAnimationFrame(measureCurrentTarget);
    const settleTimer = window.setTimeout(() => {
      const el = resolveVisibleTargetElement(currentStep.selectors);
      if (!el && safeSteps.length > 1) {
        // Automatically skip a missing step if another valid step exists
        const nextValid = findNextAvailableStepIndex(safeSteps, activeIndex + 1, 1, (step) =>
          Boolean(resolveVisibleTargetElement(step.selectors))
        );
        if (nextValid >= 0) {
          setActiveIndex(nextValid);
          return;
        }
      }
      measureCurrentTarget();
    }, 180);

    return () => {
      cancelAnimationFrame(raf1);
      window.clearTimeout(settleTimer);
    };
  }, [activeIndex, currentStep, isOpen, measureCurrentTarget, safeSteps]);

  // Track scroll, resize, orientationchange, visualViewport, and ResizeObserver continuously
  useEffect(() => {
    if (!isOpen) return;

    let rafId = 0;
    const scheduleMeasure = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        measureCurrentTarget();
      });
    };

    window.addEventListener("scroll", scheduleMeasure, { passive: true, capture: true });
    window.addEventListener("resize", scheduleMeasure, { passive: true });
    window.addEventListener("orientationchange", scheduleMeasure);
    window.visualViewport?.addEventListener("resize", scheduleMeasure);
    window.visualViewport?.addEventListener("scroll", scheduleMeasure);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(scheduleMeasure);
      if (targetElementRef.current) {
        observer.observe(targetElementRef.current);
      }
      if (tooltipRef.current) {
        observer.observe(tooltipRef.current);
      }
      observer.observe(document.body);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", scheduleMeasure, true);
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("orientationchange", scheduleMeasure);
      window.visualViewport?.removeEventListener("resize", scheduleMeasure);
      window.visualViewport?.removeEventListener("scroll", scheduleMeasure);
      observer?.disconnect();
    };
  }, [isOpen, activeIndex, measureCurrentTarget]);

  // Measure actual tooltip height so positioning never overflows the screen
  useLayoutEffect(() => {
    if (!isOpen || !tooltipRef.current) return;
    const measured = tooltipRef.current.getBoundingClientRect().height;
    if (measured > 0 && Math.abs(measured - tooltipHeight) > 1) {
      setTooltipHeight(Math.ceil(measured));
    }
  }, [isOpen, activeIndex, currentStep, tooltipHeight]);

  // Move keyboard focus into the tour tooltip cleanly when opening or changing step
  useEffect(() => {
    if (!isOpen) return;
    const raf = requestAnimationFrame(() => {
      if (primaryButtonRef.current) {
        try {
          primaryButtonRef.current.focus({ preventScroll: true });
        } catch {
          primaryButtonRef.current.focus();
        }
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen, activeIndex]);

  // Keyboard accessibility: Escape to close, ArrowLeft/ArrowRight to step, Tab containment inside dialog
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        finishTour("skip");
        return;
      }

      const activeEl = document.activeElement;
      const isTextInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLSelectElement ||
        (activeEl instanceof HTMLElement && activeEl.isContentEditable);

      if (!isTextInput) {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          handleNext();
          return;
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          handlePrev();
          return;
        }
      }

      if (e.key === "Tab" && tooltipRef.current) {
        const focusables = Array.from(
          tooltipRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!tooltipRef.current.contains(activeEl)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && activeEl === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && activeEl === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [finishTour, handleNext, handlePrev, isOpen]);

  const tooltipPosition: TooltipPosition = useMemo(() => {
    return computeTooltipPosition(
      spotlightRect,
      tooltipHeight,
      viewport,
      currentStep?.preferredPlacement ?? "auto",
      {
        maxWidth: 312,
        margin: 12,
        gap: 12,
        bottomSafeInset: viewport.width < 1024 ? 12 : 0,
      }
    );
  }, [currentStep?.preferredPlacement, spotlightRect, tooltipHeight, viewport]);

  const overlayPanes = useMemo(() => {
    if (!spotlightRect) return null;
    return computeOverlayPanes(spotlightRect, viewport);
  }, [spotlightRect, viewport]);

  if (!isOpen || !currentStep || typeof document === "undefined") {
    return null;
  }

  const transitionDuration = prefersReducedMotion ? 0 : 0.18;
  const paneTransitionClass = prefersReducedMotion
    ? "transition-none"
    : "transition-[top,left,width,height] duration-200 ease-out motion-reduce:transition-none";

  const content = (
    <AnimatePresence>
      <div
        id="spotlight-tour-root"
        data-testid="spotlight-tour"
        className="fixed inset-0 z-[70] pointer-events-none"
      >
        {/* Screen-reader live region announcing current step */}
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {`${currentStep.title}. ${activeIndex + 1} ${t("tourStepOf", "de")} ${totalSteps}. ${currentStep.description}`}
        </div>

        {/* Backdrop: 4 seamless dark blurred panes leaving the spotlight cutout 100% sharp & interactive */}
        {overlayPanes && spotlightRect ? (
          <>
            {(["top", "bottom", "left", "right"] as const).map((side) => {
              const pane = overlayPanes[side];
              if (pane.width <= 0 || pane.height <= 0) return null;
              return (
                <div
                  key={side}
                  data-tour-backdrop={side}
                  onClick={() => finishTour("skip")}
                  aria-hidden="true"
                  className={`fixed pointer-events-auto bg-slate-950/60 backdrop-blur-[2px] ${paneTransitionClass}`}
                  style={{
                    top: pane.top,
                    left: pane.left,
                    width: pane.width,
                    height: pane.height,
                  }}
                />
              );
            })}

            {/* Crisp spotlight focus frame surrounding the highlighted element */}
            <div
              data-testid="spotlight-tour-frame"
              aria-hidden="true"
              className={`fixed pointer-events-none rounded-xl ring-2 ring-[#16845B] dark:ring-emerald-400 shadow-[0_0_0_4px_rgba(22,132,91,0.22)] ${paneTransitionClass}`}
              style={{
                top: spotlightRect.top,
                left: spotlightRect.left,
                width: spotlightRect.width,
                height: spotlightRect.height,
              }}
            />
          </>
        ) : (
          /* Clean fallback backdrop when target element is absent from DOM */
          <div
            data-tour-backdrop="full"
            onClick={() => finishTour("skip")}
            aria-hidden="true"
            className="fixed inset-0 pointer-events-auto bg-slate-950/60 backdrop-blur-[2px]"
          />
        )}

        {/* Compact Contextual Tooltip */}
        <motion.div
          ref={tooltipRef}
          key={currentStep.id}
          role="dialog"
          aria-modal="false"
          aria-label={t("tourDialogLabel", "Tour guiado do Localiza+")}
          aria-labelledby="spotlight-tour-title"
          aria-describedby="spotlight-tour-desc"
          initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 }}
          transition={{ duration: transitionDuration, ease: [0.16, 1, 0.3, 1] }}
          className="fixed pointer-events-auto overscroll-contain max-h-[calc(100dvh-24px)] overflow-y-auto rounded-2xl bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-700/80 shadow-[0_18px_42px_rgba(15,23,42,0.24)] dark:shadow-[0_20px_48px_rgba(0,0,0,0.65)] p-4 text-left"
          style={{
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            width: tooltipPosition.width,
          }}
        >
          {/* Directional Caret Indicator */}
          {spotlightRect && tooltipPosition.placement === "bottom" && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-1.5 w-3 h-3 rotate-45 bg-white dark:bg-[#111827] border-l border-t border-slate-200/90 dark:border-slate-700/80"
              style={{ left: tooltipPosition.arrowOffset - 6 }}
            />
          )}
          {spotlightRect && tooltipPosition.placement === "top" && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-1.5 w-3 h-3 rotate-45 bg-white dark:bg-[#111827] border-r border-b border-slate-200/90 dark:border-slate-700/80"
              style={{ left: tooltipPosition.arrowOffset - 6 }}
            />
          )}
          {spotlightRect && tooltipPosition.placement === "right" && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -left-1.5 w-3 h-3 rotate-45 bg-white dark:bg-[#111827] border-l border-b border-slate-200/90 dark:border-slate-700/80"
              style={{ top: tooltipPosition.arrowOffset - 6 }}
            />
          )}
          {spotlightRect && tooltipPosition.placement === "left" && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -right-1.5 w-3 h-3 rotate-45 bg-white dark:bg-[#111827] border-r border-t border-slate-200/90 dark:border-slate-700/80"
              style={{ top: tooltipPosition.arrowOffset - 6 }}
            />
          )}

          {/* Header: Progress counter + segmented progress bar + Close */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                {activeIndex + 1} / {totalSteps}
              </span>
              <div
                className="flex items-center gap-1 flex-1 max-w-[112px]"
                aria-hidden="true"
              >
                {safeSteps.map((step, idx) => (
                  <span
                    key={step.id}
                    className={`h-1 flex-1 rounded-full ${
                      idx <= activeIndex
                        ? "bg-[#16845B] dark:bg-emerald-400"
                        : "bg-slate-200 dark:bg-slate-700"
                    }`}
                  />
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => finishTour("skip")}
              aria-label={t("tourCloseAria", "Fechar tour guiado")}
              className="min-w-[36px] min-h-[36px] -mr-1.5 -mt-1.5 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Step Title & Concise Contextual Copy */}
          <div className="mt-2 space-y-1">
            <h2
              id="spotlight-tour-title"
              className="text-sm font-bold text-[#172B2A] dark:text-white leading-snug"
            >
              {currentStep.title}
            </h2>
            <p
              id="spotlight-tour-desc"
              className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed"
            >
              {currentStep.description}
            </p>
          </div>

          {/* Controls: Skip + Back / Next (or Finish) */}
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => finishTour("skip")}
              className="min-h-[36px] px-2 -ml-2 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-[#172B2A] dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t("tourSkip", "Pular tour")}
            </button>

            <div className="flex items-center gap-1.5 shrink-0">
              {!isFirstStep && (
                <button
                  type="button"
                  onClick={handlePrev}
                  className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>{t("tourBack", "Voltar")}</span>
                </button>
              )}

              <button
                ref={primaryButtonRef}
                type="button"
                onClick={handleNext}
                className="min-h-[36px] px-3.5 rounded-lg bg-[#16845B] hover:bg-[#064E3B] text-white text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>
                  {isLastStep ? t("tourFinish", "Concluir") : t("tourNext", "Próximo")}
                </span>
                {isLastStep ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  return createPortal(content, document.body);
};
