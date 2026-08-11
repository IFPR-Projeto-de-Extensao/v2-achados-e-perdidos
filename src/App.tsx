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
import { initGoogleAnalytics, trackPageView } from "./lib/analytics";

const MainContent: React.FC = () => {
  const { activeTab, selectedItemForDetail, setSelectedItemForDetail, authModalOpen, setAuthModalOpen } = useApp();

  useEffect(() => {
    initGoogleAnalytics();
  }, []);

  useEffect(() => {
    trackPageView(`aba_${activeTab}`);
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-[#F5F5F5] dark:bg-[#121212] text-neutral-900 dark:text-neutral-100 flex flex-col font-sans transition-colors duration-200 selection:bg-[#00843D] selection:text-white">
      {/* Toast Notifications */}
      <ToastContainer />

      {/* Top Navbar */}
      <Navbar />

      {/* Main View Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-8">
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
