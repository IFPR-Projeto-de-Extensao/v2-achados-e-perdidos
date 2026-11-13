import React, { useState, useEffect, useRef } from "react";
import { SpeedInsights } from "@vercel/speed-insights/react";
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
import { PrivacyPolicyView } from "./components/PrivacyPolicyView";
import { TermsOfUseView } from "./components/TermsOfUseView";
import { EmailVerificationView } from "./components/EmailVerificationView";
import { VersionHistoryView } from "./components/VersionHistoryView";
import { NotFoundView } from "./components/NotFoundView";
import { ItemDetailModal } from "./components/ItemDetailModal";
import { QRCodeScannerModal } from "./components/QRCodeScannerModal";
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
import { parseQrCodeOrUrl, findItemInList, fetchItemFromFirestore, classifyQrLookupError } from "./lib/qrCodeUtils";
import { DEFAULT_MAINTENANCE_MESSAGE } from "./lib/shared-constants";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { AccountStatusBanner } from "./components/AccountStatusBanner";
import {
  determineTransitionType,
  getRouteAnimationVariants,
  TransitionType,
} from "./lib/routeAnimations";
import { AppRouteKey } from "./lib/routes";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { GitBranch, LogIn, Wrench } from "lucide-react";
import { vibrateClick } from "./lib/utils";
import { SurfaceCard, UIButton, UIBadge, ModalShell } from "./components/ui";

const MainContent: React.FC = () => {
  const {
    qrScannerOpen,
    setQrScannerOpen,
    selectedItemForDetail,
    setSelectedItemForDetail,
    authModalOpen,
    setAuthModalOpen,
    maintenanceMode,
    maintenanceCustomMessage,
    currentUser,
    items,
    requestAuthForRegistration,
    isEmailVerificationRequired,
    isAuthenticated,
    isGuest,
    darkMode,
    addToast,
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

  const lastDeepLinkErrorKeyRef = useRef<string | null>(null);

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

      // 2. If not found in state, fetch directly from Firestore with explicit error propagation
      if (!matchedItem) {
        try {
          matchedItem = await fetchItemFromFirestore(parsed, { throwOnError: true });
        } catch (err) {
          console.warn("[App] Erro ao carregar item via deep-link:", err);
          const classified = classifyQrLookupError(err);
          const errKey = `${targetIdentifier}:${classified.kind}`;
          if (lastDeepLinkErrorKeyRef.current !== errKey) {
            lastDeepLinkErrorKeyRef.current = errKey;
            addToast(classified.userMessage, "error");
          }
          return;
        }
      }

      if (matchedItem) {
        lastDeepLinkErrorKeyRef.current = null;
        lastResolvedItemIdRef.current = matchedItem.id;
        setSelectedItemForDetail(matchedItem);
      }
    };

    resolveItemFromUrl();
  }, [items, setSelectedItemForDetail, addToast]);

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
    if (routeKey === "verify_email") {
      return <EmailVerificationView />;
    }

    if (isEmailVerificationRequired) {
      if (
        routeKey === "privacy_policy" ||
        routeKey === "terms_of_use" ||
        routeKey === "support" ||
        routeKey === "support_feedback" ||
        routeKey === "support_bug"
      ) {
        // Allow public legal and support documentation
      } else {
        return <EmailVerificationView />;
      }
    }

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
        return <ObjectsView initialFilterType="TODOS" />;
      case "privacy_policy":
        return <PrivacyPolicyView />;
      case "terms_of_use":
        return <TermsOfUseView />;
      case "versions": {
        if (!isAuthenticated || isGuest) {
          return (
            <div className="max-w-2xl mx-auto py-12 px-4 animate-in fade-in duration-300">
              <SurfaceCard padding="lg" className="text-center space-y-6">
                <div className="w-16 h-16 rounded-2xl bg-[#EBF5F0] dark:bg-[#16845B]/20 text-[#16845B] dark:text-emerald-400 border border-[#16845B]/20 flex items-center justify-center mx-auto">
                  <GitBranch className="w-8 h-8" />
                </div>

                <div className="space-y-2">
                  <h1 className="text-2xl sm:text-3xl font-bold text-[#172B2A] dark:text-white tracking-tight">
                    Histórico Oficial de Versões
                  </h1>
                  <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
                    O acesso ao changelog institucional e histórico de releases é restrito a membros autenticados da comunidade acadêmica do IFPR. Entre com sua conta institucional (@ifpr.edu.br ou @estudantes.ifpr.edu.br).
                  </p>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
                  <UIButton
                    variant="primary"
                    size="lg"
                    onClick={() => {
                      vibrateClick();
                      setAuthModalOpen(true);
                    }}
                  >
                    <LogIn className="w-4 h-4" />
                    <span>Entrar com Conta Institucional</span>
                  </UIButton>
                  <UIButton
                    variant="secondary"
                    size="lg"
                    onClick={() => {
                      vibrateClick();
                      navigate("/");
                    }}
                  >
                    <span>Voltar ao Início</span>
                  </UIButton>
                </div>
              </SurfaceCard>
            </div>
          );
        }
        return <VersionHistoryView darkMode={darkMode} />;
      }
      case "not_found":
      default:
        return <NotFoundView />;
    }
  };

  return (
    <div className="min-h-dvh bg-white sm:bg-[#F8FAFC] dark:bg-[#0B0F17] text-[#172B2A] dark:text-slate-100 flex flex-col font-sans selection:bg-[#16845B] selection:text-white relative">
      {/* Toast Notifications */}
      <ToastContainer />

      {/* PWA Install Banner */}
      <PWAInstallBanner />

      {/* Mandatory Email Verification Alert Banner */}
      {isEmailVerificationRequired && (
        <div className="bg-amber-600 dark:bg-amber-700 text-white px-4 py-2 text-xs font-medium text-center flex flex-wrap items-center justify-center gap-2 border-b border-amber-500">
          <span>Confirme seu endereço de e-mail para liberar o acesso completo.</span>
          <button
            onClick={() => navigate("/verificar-email")}
            className="underline hover:text-amber-100 font-semibold ml-1 text-xs cursor-pointer"
          >
            Verificar agora
          </button>
        </div>
      )}

      {/* Pending User Approval Banner for Academic Users */}
      {currentUser.approvalStatus === "PENDENTE" && (
        <div className="bg-sky-600 dark:bg-sky-700 text-white px-4 py-2 text-xs font-medium text-center flex items-center justify-center border-b border-sky-500">
          <span>Conta institucional aguardando homologação pela Secretaria do IFPR Campus Ivaiporã.</span>
        </div>
      )}

      {/* Global Maintenance Mode Overlay for Standard Users */}
      {maintenanceMode && currentUser.role !== "ADMIN" && (
        <ModalShell isOpen={true} maxWidthClass="max-w-md" ariaLabel="Sistema em Manutenção Programada">
          <div className="p-6 sm:p-8 space-y-5 text-center">
            <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 flex items-center justify-center mx-auto">
              <Wrench className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <UIBadge tone="amber">Manutenção Programada • IFPR</UIBadge>
              <h2 className="text-lg font-bold text-[#172B2A] dark:text-white pt-1">
                Sistema em Atualização Técnica
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-[#F8FAFC] dark:bg-slate-800/70 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
                {maintenanceCustomMessage || DEFAULT_MAINTENANCE_MESSAGE}
              </p>
            </div>

            <div className="pt-1">
              <UIButton
                variant="primary"
                size="lg"
                fullWidth
                onClick={() => setAuthModalOpen(true)}
              >
                <span>Acesso Administrador TI</span>
              </UIButton>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Top Navbar */}
      <Navbar />

      {/* Account Status Alert Banner (Suspended / Banned Accounts) */}
      <AccountStatusBanner user={currentUser} />

      {/* Main View Container (Mobile-First PWA layout) */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-3 sm:pt-5 pb-24 lg:pb-12">
        <Breadcrumbs />

        <div key={pathname} className="w-full">
          {renderCurrentView()}
        </div>
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
        onClose={() => {
          setTourGuideOpen(false);
          try {
            ["ifpr_achados_tour_completed", "ifpr_tour_completed", "ifpr_dont_show_tour"].forEach((k) =>
              localStorage.setItem(k, "true")
            );
          } catch (_) {}
        }}
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
        <SpeedInsights />
      </RouterProvider>
    </AppProvider>
  );
}
