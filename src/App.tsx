import React, { useEffect } from "react";
import { AppProvider, useApp } from "./context/AppContext";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { HomeView } from "./components/HomeView";
import { ObjectsView } from "./components/ObjectsView";
import { RegisterItemView } from "./components/RegisterItemView";
import { DashboardView } from "./components/DashboardView";
import { ProfileView } from "./components/ProfileView";
import { ImageAnalyzerView } from "./components/ImageAnalyzerView";
import { ItemDetailModal } from "./components/ItemDetailModal";
import { QRCodeScannerModal } from "./components/QRCodeScannerModal";
import { AIMatchModal } from "./components/AIMatchModal";
import { AuthModal } from "./components/AuthModal";
import { ToastContainer } from "./components/ToastContainer";
import { PWAInstallBanner } from "./components/PWAInstallBanner";
import { MobileBottomNav } from "./components/MobileBottomNav";
import { initGoogleAnalytics, trackPageView } from "./lib/analytics";
import { registerUptimeServiceWorker } from "./lib/uptimeManager";
import { traceFirebasePerformance } from "./lib/firebase";
import { savePerformanceMetricLog } from "./lib/offlineDb";

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

  useEffect(() => {
    initGoogleAnalytics();
    registerUptimeServiceWorker();

    // Check PWA launch shortcuts from URL query params (?tab=... or ?action=scan)
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      const actionParam = params.get("action");

      if (tabParam && ["home", "lost", "found", "register", "dashboard", "profile", "image_analyzer"].includes(tabParam)) {
        setActiveTab(tabParam as any);
      }
      if (actionParam === "scan") {
        setQrScannerOpen(true);
      }
    }
  }, [setActiveTab, setQrScannerOpen]);

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

      {/* PWA Install Banner and Update Manager */}
      <PWAInstallBanner />

      {/* Maintenance Mode Banner for Admin */}
      {maintenanceMode && currentUser.role === "ADMIN" && (
        <div className="bg-amber-500 text-black px-4 py-2 text-xs font-black text-center flex items-center justify-center space-x-2 shadow-md animate-pulse">
          <span>⚠️ MODO DE MANUTENÇÃO ATIVO NO CAMPUS. Mensagem aos usuários: "{maintenanceCustomMessage}"</span>
        </div>
      )}

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
                {maintenanceCustomMessage || "Estamos efetuando uma manutenção preventiva no banco de dados do Achados & Perdidos do IFPR. As consultas e registros estão temporariamente pausados. Por favor, volte em instantes!"}
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
        {activeTab === "home" && <HomeView />}
        {activeTab === "lost" && <ObjectsView initialFilterType="PERDIDO" />}
        {activeTab === "found" && <ObjectsView initialFilterType="ENCONTRADO" />}
        {activeTab === "register" && <RegisterItemView />}
        {activeTab === "dashboard" && <DashboardView />}
        {activeTab === "profile" && <ProfileView />}
        {activeTab === "image_analyzer" && <ImageAnalyzerView />}
      </main>

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
