import { useState, useEffect, useCallback } from "react";
import { vibrateSuccess, vibrateClick } from "../lib/utils";

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function usePWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState<boolean>(false);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState<boolean>(false);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState<boolean>(false);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("pwa_install_dismissed") === "true";
  });

  // Check standalone mode (already installed or opened as PWA)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes("android-app://");
      setIsInstalled(isStandaloneMode);
    };

    checkStandalone();

    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const handleMediaChange = (e: MediaQueryListEvent) => {
      setIsInstalled(e.matches);
    };

    try {
      mediaQuery.addEventListener("change", handleMediaChange);
    } catch (_) {
      mediaQuery.addListener(handleMediaChange);
    }

    // Check iOS device
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAppleDevice = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    setIsIOS(isAppleDevice);

    return () => {
      try {
        mediaQuery.removeEventListener("change", handleMediaChange);
      } catch (_) {
        mediaQuery.removeListener(handleMediaChange);
      }
    };
  }, []);

  // Listen to beforeinstallprompt & appinstalled
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const installEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(installEvent);
      setIsInstallable(true);
      console.log("[PWA] beforeinstallprompt capturado com sucesso.");
    };

    const handleAppInstalled = () => {
      console.log("[PWA] Aplicativo instalado com sucesso!");
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      setShowInstructionsModal(false);
      vibrateSuccess();
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  // Service worker registration and update listener
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const handleServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          setSwRegistration(registration);

          // Check if a worker is already waiting
          if (registration.waiting) {
            setIsUpdateAvailable(true);
          }

          // Listen for new workers entering 'waiting' state
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                  console.log("[PWA] Nova versão do Service Worker detectada!");
                  setIsUpdateAvailable(true);
                }
              });
            }
          });
        }
      } catch (err) {
        console.warn("[PWA] Erro ao monitorar Service Worker:", err);
      }
    };

    handleServiceWorker();

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }, []);

  // Action: Trigger browser install prompt or open instructions
  const promptInstall = useCallback(async (openInstructionsIfNoPrompt: boolean = true) => {
    vibrateClick();
    if (isIOS) {
      setShowInstructionsModal(true);
      return;
    }

    if (!deferredPrompt) {
      console.log("[PWA] Prompt nativo indisponível no momento. Abrindo instruções de instalação.");
      if (openInstructionsIfNoPrompt) {
        setShowInstructionsModal(true);
      }
      return;
    }

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      console.log("[PWA] Resposta do usuário à instalação:", choice.outcome);

      if (choice.outcome === "accepted") {
        setIsInstalled(true);
        setIsInstallable(false);
      }
      setDeferredPrompt(null);
    } catch (err) {
      console.error("[PWA] Erro ao invocar prompt nativo:", err);
      setShowInstructionsModal(true);
    }
  }, [deferredPrompt, isIOS]);

  // Action: Dismiss install banner for current session
  const dismissInstallPrompt = useCallback(() => {
    vibrateClick();
    setIsDismissed(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("pwa_install_dismissed", "true");
    }
  }, []);

  // Action: Apply service worker update (skip waiting)
  const applyUpdate = useCallback(() => {
    vibrateSuccess();
    if (swRegistration && swRegistration.waiting) {
      swRegistration.waiting.postMessage({ type: "SKIP_WAITING" });
    } else {
      window.location.reload();
    }
  }, [swRegistration]);

  return {
    isInstallable: (isInstallable || (isIOS && !isInstalled)) && !isDismissed && !isInstalled,
    isInstalled,
    isIOS,
    canPromptNative: !!deferredPrompt,
    showInstructionsModal,
    setShowInstructionsModal,
    showIOSPrompt: showInstructionsModal,
    setShowIOSPrompt: setShowInstructionsModal,
    isUpdateAvailable,
    promptInstall,
    dismissInstallPrompt,
    applyUpdate,
  };
}
