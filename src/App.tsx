import React, { useState, useEffect, useRef } from "react";
import { AppProvider, useApp } from "./context/AppContext";
import { RouterProvider, useRouter } from "./context/RouterContext";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { HomeView } from "./components/HomeView";
import { ObjectsView } from "./components/ObjectsView";
import { RegisterItemView } from "./components/RegisterItemView";
import { AdminView } from "./components/AdminView";
import { ProfileView } from "./components/ProfileView";
import { MyItemsView } from "./components/MyItemsView";
import { NotificationsView } from "./components/NotificationsView";
import { SettingsView } from "./components/SettingsView";
import { SupportView } from "./components/SupportView";
import { ImageAnalyzerView } from "./components/ImageAnalyzerView";
import { PrivacyPolicyView } from "./components/PrivacyPolicyView";
import { TermsOfUseView } from "./components/TermsOfUseView";
import { NotFoundView } from "./components/NotFoundView";
import { ItemDetailModal } from "./components/ItemDetailModal";
import { QRCodeScannerModal } from "./components/QRCodeScannerModal";
import { AIMatchModal } from "./components/AIMatchModal";
import { AuthModal } from "./components/AuthModal";
import { KeyboardShortcutsModal } from "./components/KeyboardShortcutsModal";
import { TourGuide } from "./components/TourGuide";
import { RemoteSignatureModal } from "./components/RemoteSignatureModal";
import { ToastContainer } from "./components/ToastContainer";
import { PWAInstallBanner } from "./components/PWAInstallBanner";
import { MobileBottomNav } from "./components/MobileBottomNav";
import { UploadStatusIndicator } from "./components/UploadStatusIndicator";
import { QuickSupportButton } from "./components/QuickSupportButton";
import { initSecondaryServices } from "./lib/secondaryServices";
import { trackPageView } from "./lib/analytics";
import { traceFirebasePerformance } from "./lib/firebase";
import { savePerformanceMetricLog } from "./lib/offlineDb";
import { parseQrCodeOrUrl, findItemInList, fetchItemFromFirestore } from "./lib/qrCodeUtils";
import { DEFAULT_MAINTENANCE_MESSAGE } from "./lib/shared-constants";
import { Breadcrumbs } from "./components/Breadcrumbs";
import {
  determineTransitionType,
  getRouteAnimationVariants,
  TransitionType,
} from "./lib/routeAnimations";
import { AppRouteKey } from "./lib/routes";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";

const MainContent: React.FC = () => {
  const {
    qrScannerOpen,
    setQrScannerOpen,
    selectedItemForDetail,
    setSelectedItemForDetail,
    aiMatchAlert,
    authModalOpen,
    setAuthModalOpen,
    maintenanceMode,
    maintenanceCustomMessage,
    currentUser,
    items,
    requestAuthForRegistration,
  } = useApp();

  const { routeKey, pathname, searchParams, navigate } = useRouter();
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [tourGuideOpen, setTourGuideOpen] = useState<boolean>(() => {
    try {
      const isDismissed = ["ifpr_achados_tour_completed", "ifpr_tour_completed", "ifpr_dont_show_tour"].some(
        (k) => localStorage.getItem(k) === "true"
      );
      return !isDismissed;
    } catch (_) {
      return false;
    }
  });

  const [remoteSignatureParams, setRemoteSignatureParams] = useState<{ itemId?: string; token?: string } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    const token = params.get("token") || params.get("sigToken");
    const itemId = params.get("itemId");
    if (tab === "sign-receipt" || (token && itemId)) {
      setRemoteSignatureParams({ itemId: itemId || undefined, token: token || undefined });
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    const handleOpenTour = () => setTourGuideOpen(true);
    window.addEventListener("open-tour-guide", handleOpenTour);
    return () => window.removeEventListener("open-tour-guide", handleOpenTour);
  }, []);

  const shouldReduceMotion = useReducedMotion();
  const lastResolvedItemIdRef = useRef<string | null>(null);

  // Track previous route to determine hierarchy direction for transitions
  const prevPathRef = useRef<string>(pathname);
  const prevRouteKeyRef = useRef<AppRouteKey>(routeKey);
  const [transitionType, setTransitionType] = useState<TransitionType>("cross-fade");

  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      const nextType = determineTransitionType(
        prevPathRef.current,
        prevRouteKeyRef.current,
        pathname,
        routeKey
      );
      setTransitionType(nextType);
      prevPathRef.current = pathname;
      prevRouteKeyRef.current = routeKey;
    }
  }, [pathname, routeKey]);

  const animationVariants = getRouteAnimationVariants(transitionType, !!shouldReduceMotion);

  // Global Keyboard Shortcuts for rapid navigation and power-user accessibility
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isInput =
        activeTag === "input" ||
        activeTag === "textarea" ||
        activeTag === "select" ||
        (document.activeElement as HTMLElement)?.isContentEditable;

      if (isInput) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toUpperCase();

      switch (key) {
        case "H":
          e.preventDefault();
          navigate("/");
          break;
        case "S":
          e.preventDefault();
          navigate("/buscar");
          break;
        case "R":
          e.preventDefault();
          requestAuthForRegistration();
          navigate("/cadastrar");
          break;
        case "D":
          e.preventDefault();
          navigate("/admin");
          break;
        case "P":
          e.preventDefault();
          navigate("/perfil");
          break;
        case "A":
          e.preventDefault();
          navigate("/analisador-ia");
          break;
        case "Q":
          e.preventDefault();
          setQrScannerOpen(true);
          break;
        case "?":
          e.preventDefault();
          setShortcutsModalOpen((prev) => !prev);
          break;
        case "ESCAPE":
          setShortcutsModalOpen(false);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, requestAuthForRegistration, setQrScannerOpen]);

  // Handle URL deep-linking for QR codes and direct item links (e.g. ?itemId=..., ?qr=..., /item/:id)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const resolveItemFromUrl = async () => {
      const currentHref = window.location.href;
      const parsed = parseQrCodeOrUrl(currentHref);

      // Check if there is an item requested in URL
      if (!parsed.itemId && !parsed.qrCodeId) return;

      const targetIdentifier = parsed.itemId || parsed.qrCodeId;
      if (!targetIdentifier || targetIdentifier === lastResolvedItemIdRef.current) return;

      // 1. Try finding in loaded items state first
      let matchedItem = findItemInList(parsed, items);

      // 2. If not found in state, fetch directly from Firestore
      if (!matchedItem) {
        try {
          matchedItem = await fetchItemFromFirestore(parsed);
        } catch (err) {
          console.warn("[App] Erro ao carregar item via deep-link:", err);
        }
      }

      if (matchedItem) {
        lastResolvedItemIdRef.current = matchedItem.id;
        setSelectedItemForDetail(matchedItem);
      }
    };

    resolveItemFromUrl();
  }, [items, setSelectedItemForDetail]);

  // Secondary non-blocking services (Analytics, Performance, PWA Uptime)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        initSecondaryServices();
      } catch (err) {
        console.warn("[App] Falha ao inicializar serviços secundários:", err);
      }
    }, 60);

    return () => clearTimeout(timer);
  }, []);

  // Performance tracking per route
  useEffect(() => {
    const startTime = performance.now();
    const perfTrace = traceFirebasePerformance(`view_render_${routeKey}`);

    trackPageView(`rota_${pathname}`);

    return () => {
      const renderDurationMs = Math.round(performance.now() - startTime);
      if (perfTrace) {
        try {
          perfTrace.putMetric("render_duration_ms", renderDurationMs);
          perfTrace.stop();
        } catch (_) {}
      }
      savePerformanceMetricLog(`render_duration_${routeKey}`, renderDurationMs);
    };
  }, [routeKey, pathname]);

  // Render view based on routeKey
  const renderCurrentView = () => {
    switch (routeKey) {
      case "home":
        return <HomeView />;
      case "search": {
        const filterType =
          searchParams.tipo === "perdido"
            ? "PERDIDO"
            : searchParams.tipo === "encontrado"
            ? "ENCONTRADO"
            : "TODOS";
        return <ObjectsView initialFilterType={filterType} />;
      }
      case "register":
        return <RegisterItemView />;
      case "admin":
        return <AdminView />;
      case "profile":
        return <ProfileView />;
      case "my_items":
        return <MyItemsView />;
      case "notifications":
        return <NotificationsView />;
      case "settings":
        return <SettingsView />;
      case "support":
      case "support_feedback":
      case "support_bug":
        return <SupportView />;
      case "image_analyzer":
        return <ImageAnalyzerView />;
      case "privacy_policy":
        return <PrivacyPolicyView />;
      case "terms_of_use":
        return <TermsOfUseView />;
      case "not_found":
      default:
        return <NotFoundView />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] dark:bg-[#121212] text-neutral-900 dark:text-neutral-100 flex flex-col font-sans transition-colors duration-200 selection:bg-[#00843D] selection:text-white">
      {/* Toast Notifications */}
      <ToastContainer />

      {/* PWA Install Banner */}
      <PWAInstallBanner />

      {/* Pending User Approval Banner for Academic Users */}
      {currentUser.approvalStatus === "PENDENTE" && (
        <div className="bg-blue-600 dark:bg-blue-700 text-white px-4 py-2 text-xs font-bold text-center flex items-center justify-center space-x-2 shadow-sm border-b border-blue-500">
          <span>ℹ️ SUA CONTA ACADÊMICA ESTÁ AGUARDANDO APROVAÇÃO PELA SECRETARIA DO IFPR CAMPUS IVAIPORÃ (Algumas ações de criação podem ser restritas).</span>
        </div>
      )}

      {/* Global Maintenance Mode Overlay for Standard Users */}
      {maintenanceMode && currentUser.role !== "ADMIN" && (
        <div className="fixed inset-0 z-50 bg-neutral-950/95 backdrop-blur-md flex items-center justify-center p-4 text-center">
          <div className="max-w-md w-full bg-neutral-900 border border-amber-500/40 rounded-3xl p-8 space-y-6 shadow-2xl text-white">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto animate-bounce">
              <span className="text-3xl">🛠️</span>
            </div>
            <div className="space-y-2">
              <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-black uppercase tracking-wider">
                Manutenção Programada • IFPR Campus Ivaiporã
              </span>
              <h2 className="text-xl font-black text-white">
                Sistema em Atualização Técnica
              </h2>
              <p className="text-xs text-neutral-300 leading-relaxed bg-neutral-950/60 p-4 rounded-xl border border-neutral-800 text-amber-200/90 font-medium">
                {maintenanceCustomMessage || DEFAULT_MAINTENANCE_MESSAGE}
              </p>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={() => setAuthModalOpen(true)}
                className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-black font-extrabold text-xs transition-all shadow-md"
              >
                Sou Administrador TI (Entrar no Painel)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Navbar */}
      <Navbar />

      {/* Main View Container with dynamic Breadcrumbs and route hierarchy transitions */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 xs:px-4 sm:px-6 lg:px-8 pt-3 xs:pt-4 sm:pt-6 pb-24 sm:pb-20 lg:pb-12">
        {/* Dynamic Structural Breadcrumbs Navigation */}
        <Breadcrumbs />

        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={animationVariants.initial}
            animate={animationVariants.animate}
            exit={animationVariants.exit}
            transition={animationVariants.transition}
            className="w-full"
          >
            {renderCurrentView()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Item Details Modal */}
      {selectedItemForDetail && (
        <ItemDetailModal
          item={selectedItemForDetail}
          onClose={() => setSelectedItemForDetail(null)}
        />
      )}

      {/* QR Code Scanner Modal */}
      {qrScannerOpen && <QRCodeScannerModal />}

      {/* AI Match Alert Modal */}
      {aiMatchAlert && <AIMatchModal />}

      {/* Auth Modal */}
      {authModalOpen && <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />}

      {/* Keyboard Shortcuts Accessibility Guide Modal */}
      {shortcutsModalOpen && (
        <KeyboardShortcutsModal
          isOpen={shortcutsModalOpen}
          onClose={() => setShortcutsModalOpen(false)}
        />
      )}

      {/* Interactive Guided Onboarding Tour */}
      <TourGuide
        isOpen={tourGuideOpen}
        onClose={() => setTourGuideOpen(false)}
      />

      {/* Remote Digital Signature Modal triggered by deep link / query param */}
      {remoteSignatureParams && (
        <RemoteSignatureModal
          itemId={remoteSignatureParams.itemId}
          token={remoteSignatureParams.token}
          onClose={() => {
            setRemoteSignatureParams(null);
            try {
              const url = new URL(window.location.href);
              url.searchParams.delete("tab");
              url.searchParams.delete("token");
              url.searchParams.delete("sigToken");
              window.history.replaceState({}, "", url.toString());
            } catch (_) {}
          }}
          onSuccess={() => {
            setRemoteSignatureParams(null);
            try {
              const url = new URL(window.location.href);
              url.searchParams.delete("tab");
              url.searchParams.delete("token");
              url.searchParams.delete("sigToken");
              window.history.replaceState({}, "", url.toString());
            } catch (_) {}
          }}
        />
      )}

      {/* PWA Background Sync & Real-time Upload Status Indicator */}
      <UploadStatusIndicator />

      {/* Quick Support / Feedback Button with Discord Webhook Integration */}
      <QuickSupportButton />

      {/* Mobile Bottom Navigation for PWA & Smartphones */}
      <MobileBottomNav />

      {/* Footer */}
      <Footer />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <RouterProvider>
        <MainContent />
      </RouterProvider>
    </AppProvider>
  );
}
