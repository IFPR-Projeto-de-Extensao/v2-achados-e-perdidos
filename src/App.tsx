import React, { useState, useEffect, Suspense, lazy } from "react";
import { AppProvider, useApp } from "./context/AppContext";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { HomeView } from "./components/HomeView";
import { ToastContainer } from "./components/ToastContainer";
import { PWAInstallBanner } from "./components/PWAInstallBanner";
import { MobileBottomNav } from "./components/MobileBottomNav";
import { UploadStatusIndicator } from "./components/UploadStatusIndicator";
import { QuickSupportButton } from "./components/QuickSupportButton";
import { trackPageView } from "./lib/analytics";
import { traceFirebasePerformance } from "./lib/firebase";
import { savePerformanceMetricLog } from "./lib/offlineDb";
import { APP_VALID_TABS, DEFAULT_MAINTENANCE_MESSAGE, type AppTabType } from "./lib/shared-constants";
import { Loader2 } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";

// Lazy-loaded heavy views and modals for optimal bundle splitting and fast initial paint
const ObjectsView = lazy(() => import("./components/ObjectsView").then((m) => ({ default: m.ObjectsView })));
const RegisterItemView = lazy(() => import("./components/RegisterItemView").then((m) => ({ default: m.RegisterItemView })));
const DashboardView = lazy(() => import("./components/DashboardView").then((m) => ({ default: m.DashboardView })));
const ProfileView = lazy(() => import("./components/ProfileView").then((m) => ({ default: m.ProfileView })));
const ImageAnalyzerView = lazy(() => import("./components/ImageAnalyzerView").then((m) => ({ default: m.ImageAnalyzerView })));
const PrivacyPolicyView = lazy(() => import("./components/PrivacyPolicyView").then((m) => ({ default: m.PrivacyPolicyView })));
const ItemDetailModal = lazy(() => import("./components/ItemDetailModal").then((m) => ({ default: m.ItemDetailModal })));
const QRCodeScannerModal = lazy(() => import("./components/QRCodeScannerModal").then((m) => ({ default: m.QRCodeScannerModal })));
const AIMatchModal = lazy(() => import("./components/AIMatchModal").then((m) => ({ default: m.AIMatchModal })));
const AuthModal = lazy(() => import("./components/AuthModal").then((m) => ({ default: m.AuthModal })));
const KeyboardShortcutsModal = lazy(() => import("./components/KeyboardShortcutsModal").then((m) => ({ default: m.KeyboardShortcutsModal })));

const ViewLoadingFallback: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-24 space-y-3 min-h-[300px]">
    <Loader2 className="w-8 h-8 text-[#00843D] animate-spin" />
    <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
      Carregando módulo do IFPR...
    </span>
  </div>
);

const MainContent: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    setQrScannerOpen,
    selectedItemForDetail,
    setSelectedItemForDetail,
    authModalOpen,
    setAuthModalOpen,
    maintenanceMode,
    maintenanceCustomMessage,
    currentUser,
  } = useApp();

  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion();

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
          setActiveTab("home");
          break;
        case "S":
          e.preventDefault();
          setActiveTab("lost");
          break;
        case "R":
          e.preventDefault();
          setActiveTab("register");
          break;
        case "D":
          e.preventDefault();
          setActiveTab("dashboard");
          break;
        case "P":
          e.preventDefault();
          setActiveTab("profile");
          break;
        case "A":
          e.preventDefault();
          setActiveTab("image_analyzer");
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
  }, [setActiveTab, setQrScannerOpen]);

  // Secondary non-blocking services (Analytics, Performance, PWA Uptime) initialized after DOM mount & render
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const { initSecondaryServices } = await import("./lib/secondaryServices");
        initSecondaryServices();
      } catch (err) {
        console.warn("[App] Falha ao inicializar serviços secundários:", err);
      }
    }, 60);

    // Check PWA launch shortcuts from URL query params (?tab=... or ?action=scan) or pathname
    if (typeof window !== "undefined") {
      const pathname = window.location.pathname.toLowerCase();
      if (pathname === "/politica-de-privacidade" || pathname === "/politica-de-privacidade/") {
        setActiveTab("privacy_policy");
      } else {
        const params = new URLSearchParams(window.location.search);
        const tabParam = params.get("tab");
        const actionParam = params.get("action");

        if (tabParam && (APP_VALID_TABS as readonly string[]).includes(tabParam)) {
          setActiveTab(tabParam as AppTabType);
        }
        if (actionParam === "scan") {
          setQrScannerOpen(true);
        }
      }

      const handlePopState = () => {
        const currentPath = window.location.pathname.toLowerCase();
        if (currentPath === "/politica-de-privacidade" || currentPath === "/politica-de-privacidade/") {
          setActiveTab("privacy_policy");
        } else {
          const p = new URLSearchParams(window.location.search);
          const t = p.get("tab");
          if (t && (APP_VALID_TABS as readonly string[]).includes(t)) {
            setActiveTab(t as AppTabType);
          } else {
            setActiveTab("home");
          }
        }
      };

      window.addEventListener("popstate", handlePopState);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("popstate", handlePopState);
      };
    }

    return () => clearTimeout(timer);
  }, [setActiveTab, setQrScannerOpen]);

  // Sync window path history when navigating tabs
  useEffect(() => {
    if (typeof window === "undefined") return;
    const currentPath = window.location.pathname.toLowerCase();
    if (activeTab === "privacy_policy") {
      if (currentPath !== "/politica-de-privacidade") {
        window.history.pushState({ tab: "privacy_policy" }, "", "/politica-de-privacidade");
      }
    } else if (currentPath === "/politica-de-privacidade") {
      window.history.pushState({ tab: activeTab }, "", "/");
    }
  }, [activeTab]);

  // RNF01 & RNF02: Firebase Performance Monitoring tracking component render time & tab latency
  useEffect(() => {
    const startTime = performance.now();
    const perfTrace = traceFirebasePerformance(`view_render_${activeTab}`);

    trackPageView(`aba_${activeTab}`);

    return () => {
      const renderDurationMs = Math.round(performance.now() - startTime);
      if (perfTrace) {
        try {
          perfTrace.putMetric("render_duration_ms", renderDurationMs);
          perfTrace.stop();
        } catch (_) {}
      }
      savePerformanceMetricLog(`render_duration_${activeTab}`, renderDurationMs);
    };
  }, [activeTab]);

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

      {/* Main View Container (responsive spacing for mobile bottom navigation) */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-20 lg:pb-12">
        <Suspense fallback={<ViewLoadingFallback />}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.16, ease: "easeOut" }}
              className="w-full"
            >
              {activeTab === "home" && <HomeView />}
              {activeTab === "lost" && <ObjectsView initialFilterType="PERDIDO" />}
              {activeTab === "found" && <ObjectsView initialFilterType="ENCONTRADO" />}
              {activeTab === "register" && <RegisterItemView />}
              {activeTab === "dashboard" && <DashboardView />}
              {activeTab === "profile" && <ProfileView />}
              {activeTab === "image_analyzer" && <ImageAnalyzerView />}
              {activeTab === "privacy_policy" && <PrivacyPolicyView />}
            </motion.div>
          </AnimatePresence>
        </Suspense>
      </main>

      {/* Suspense Modals */}
      <Suspense fallback={null}>
        {/* Item Details Modal */}
        {selectedItemForDetail && (
          <ItemDetailModal
            item={selectedItemForDetail}
            onClose={() => setSelectedItemForDetail(null)}
          />
        )}

        {/* QR Code Scanner Modal */}
        <QRCodeScannerModal />

        {/* AI Match Alert Modal */}
        <AIMatchModal />

        {/* Auth Modal */}
        <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />

        {/* Keyboard Shortcuts Accessibility Guide Modal */}
        <KeyboardShortcutsModal
          isOpen={shortcutsModalOpen}
          onClose={() => setShortcutsModalOpen(false)}
        />
      </Suspense>

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
      <MainContent />
    </AppProvider>
  );
}
