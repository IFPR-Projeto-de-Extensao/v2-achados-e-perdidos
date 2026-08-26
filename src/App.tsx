import React, { useState, useEffect, useRef } from "react";
import { AppProvider, useApp } from "./context/AppContext";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { HomeView } from "./components/HomeView";
import { ObjectsView } from "./components/ObjectsView";
import { RegisterItemView } from "./components/RegisterItemView";
import { DashboardView } from "./components/DashboardView";
import { ProfileView } from "./components/ProfileView";
import { ImageAnalyzerView } from "./components/ImageAnalyzerView";
import { PrivacyPolicyView } from "./components/PrivacyPolicyView";
import { TermsOfUseView } from "./components/TermsOfUseView";
import { ItemDetailModal } from "./components/ItemDetailModal";
import { QRCodeScannerModal } from "./components/QRCodeScannerModal";
import { AIMatchModal } from "./components/AIMatchModal";
import { AuthModal } from "./components/AuthModal";
import { KeyboardShortcutsModal } from "./components/KeyboardShortcutsModal";
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
import { APP_VALID_TABS, DEFAULT_MAINTENANCE_MESSAGE, type AppTabType } from "./lib/shared-constants";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

const MainContent: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
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
    addToast,
  } = useApp();

  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const lastResolvedItemIdRef = useRef<string | null>(null);

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
        
        // Switch tab to lost/found if specified
        if (parsed.tab && (APP_VALID_TABS as readonly string[]).includes(parsed.tab)) {
          setActiveTab(parsed.tab as AppTabType);
        } else if (matchedItem.type === "PERDIDO") {
          setActiveTab("lost");
        } else if (matchedItem.type === "ENCONTRADO") {
          setActiveTab("found");
        }
      }
    };

    resolveItemFromUrl();
  }, [items, setSelectedItemForDetail, setActiveTab]);

  // Secondary non-blocking services (Analytics, Performance, PWA Uptime) initialized after DOM mount & render
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
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
      } else if (pathname === "/termos-de-uso" || pathname === "/termos-de-uso/") {
        setActiveTab("terms_of_use");
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
        } else if (currentPath === "/termos-de-uso" || currentPath === "/termos-de-uso/") {
          setActiveTab("terms_of_use");
        } else {
          const p = new URLSearchParams(window.location.search);
          const t = p.get("tab");
          const itemParam = p.get("itemId") || p.get("item");

          if (t && (APP_VALID_TABS as readonly string[]).includes(t)) {
            setActiveTab(t as AppTabType);
          } else {
            setActiveTab("home");
          }

          // If back navigation occurred and no itemId is in URL, close modal
          if (!itemParam) {
            setSelectedItemForDetail(null);
            lastResolvedItemIdRef.current = null;
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
  }, [setActiveTab, setQrScannerOpen, setSelectedItemForDetail]);

  // Sync window path history when navigating tabs and opening/closing item modal
  useEffect(() => {
    if (typeof window === "undefined") return;
    const currentPath = window.location.pathname.toLowerCase();
    
    if (activeTab === "privacy_policy") {
      if (currentPath !== "/politica-de-privacidade") {
        window.history.pushState({ tab: "privacy_policy" }, "", "/politica-de-privacidade");
      }
    } else if (activeTab === "terms_of_use") {
      if (currentPath !== "/termos-de-uso") {
        window.history.pushState({ tab: "terms_of_use" }, "", "/termos-de-uso");
      }
    } else {
      const url = new URL(window.location.href);
      if (selectedItemForDetail) {
        url.searchParams.set("itemId", selectedItemForDetail.id);
        if (selectedItemForDetail.qrCodeId) {
          url.searchParams.set("qr", selectedItemForDetail.qrCodeId);
        }
        url.searchParams.set("tab", selectedItemForDetail.type === "PERDIDO" ? "lost" : "found");
        window.history.replaceState({ itemId: selectedItemForDetail.id }, "", url.toString());
      } else {
        if (url.searchParams.has("itemId") || url.searchParams.has("qr")) {
          url.searchParams.delete("itemId");
          url.searchParams.delete("qr");
          url.searchParams.delete("item");
          window.history.replaceState({ tab: activeTab }, "", url.toString());
        }
      }
    }
  }, [activeTab, selectedItemForDetail]);

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
            {activeTab === "terms_of_use" && <TermsOfUseView />}
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

      {/* PWA Background Sync & Real-time Upload Status Indicator */}
      <UploadStatusIndicator />

      {/* Quick Support / Feedback Button with Discord Webhook Integration */}
      <QuickSupportButton />

      {/* Mobile Bottom Navigation for PWA & Smartphones */}
      <MobileBottomNav />

      {/* Footer */}
      <Footer />

      {/* Vercel Speed Insights */}
      <SpeedInsights />
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
