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
  const [isAndroid, setIsAndroid] = useState<boolean>(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState<boolean>(false);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState<boolean>(false);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  
  // Track if banner was dismissed in this session
  const [isSessionDismissed, setIsSessionDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return (
      sessionStorage.getItem("pwa_session_dismissed") === "true" ||
      sessionStorage.getItem("pwa_install_dismissed") === "true"
    );
  });

  // Check standalone mode and device OS
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

    // Check OS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isApple = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    const isAndroidDevice = /android/.test(userAgent);
    setIsIOS(isApple);
    setIsAndroid(isAndroidDevice);

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
      sessionStorage.setItem("pwa_installed_session", "true");
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

          if (registration.waiting) {
            setIsUpdateAvailable(true);
          }

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

  // Dedicated "Install to Homescreen" action specifically using the deferred beforeinstallprompt event
  const installToHomescreen = useCallback(async () => {
    vibrateClick();

    if (deferredPrompt) {
      try {
        // Record that the prompt was triggered in this session (ensure appears once per session)
        sessionStorage.setItem("pwa_android_prompt_invoked_session", "true");
        sessionStorage.setItem("pwa_session_dismissed", "true");

        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        console.log("[PWA] userChoice outcome:", choice.outcome);

        if (choice.outcome === "accepted") {
          setIsInstalled(true);
          setIsInstallable(false);
        }
        setDeferredPrompt(null);
      } catch (err) {
        console.error("[PWA] Erro ao invocar prompt nativo do Android:", err);
        setShowInstructionsModal(true);
      }
    } else if (isIOS) {
      setShowInstructionsModal(true);
    } else {
      setShowInstructionsModal(true);
    }
  }, [deferredPrompt, isIOS]);

  // General install prompt
  const promptInstall = useCallback(
    async (openInstructionsIfNoPrompt: boolean = true) => {
      if (deferredPrompt) {
        await installToHomescreen();
      } else if (openInstructionsIfNoPrompt) {
        vibrateClick();
        setShowInstructionsModal(true);
      }
    },
    [deferredPrompt, installToHomescreen]
  );

  // Dismiss install banner for current session
  const dismissInstallPrompt = useCallback(() => {
    vibrateClick();
    setIsSessionDismissed(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("pwa_session_dismissed", "true");
      sessionStorage.setItem("pwa_install_dismissed", "true");
    }
  }, []);

  // Apply service worker update (skip waiting)
  const applyUpdate = useCallback(() => {
    vibrateSuccess();
    if (swRegistration && swRegistration.waiting) {
      swRegistration.waiting.postMessage({ type: "SKIP_WAITING" });
    } else {
      window.location.reload();
    }
  }, [swRegistration]);

  return {
    isInstallable: (isInstallable || (isIOS && !isInstalled)) && !isSessionDismissed && !isInstalled,
    isInstalled,
    isIOS,
    isAndroid,
    canPromptNative: !!deferredPrompt,
    showInstructionsModal,
    setShowInstructionsModal,
    showIOSPrompt: showInstructionsModal,
    setShowIOSPrompt: setShowInstructionsModal,
    isUpdateAvailable,
    installToHomescreen,
    promptInstall,
    dismissInstallPrompt,
    applyUpdate,
  };
}
