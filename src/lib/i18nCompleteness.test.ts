import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  translations,
  LANGUAGE_STORAGE_KEY,
  getStoredLanguage,
  getLocaleForLanguage,
  localize,
  translateCategory,
  translateColor,
  translateItemStatus,
  translateUserRole,
  translateCampusBlock,
  translateBadgeTier,
  translateClaimStatus,
  translateAccountStatus,
  translateApprovalStatus,
  translateBugSeverity,
  translateActivityAction,
  translateLocationGroup,
  translateCampusLocation,
} from "./i18n";
import { formatDate, formatDateTime, getItemAgeText } from "./utils";
import { computeUploadSubtitle } from "../components/UploadStatusIndicator";
import { calculateUserReputation } from "./reputationSystem";
import { formatAccountStatusDetails, getSuspensionPresetOptions } from "./accountStatusUtils";
import { getUserManualSections } from "./userManualPdfGenerator";
import { parseAuthError } from "./authErrorHandler";

describe("Internationalization (i18n) Completeness & Persistence (Global i18n)", () => {
  const originalWindow = (globalThis as any).window;

  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as any).window = {
      localStorage: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => store.set(k, String(v)),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
      },
    };
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
  });

  it("maintains 100% key parity between pt and en dictionaries with no empty values", () => {
    const ptKeys = Object.keys(translations.pt).sort();
    const enKeys = Object.keys(translations.en).sort();

    expect(enKeys).toEqual(ptKeys);
    expect(ptKeys.length).toBeGreaterThan(200);

    for (const key of ptKeys as Array<keyof typeof translations.pt>) {
      const ptVal = translations.pt[key];
      const enVal = translations.en[key];
      expect(typeof ptVal, `pt.${key} should be string`).toBe("string");
      expect(typeof enVal, `en.${key} should be string`).toBe("string");
      expect(ptVal.trim().length, `pt.${key} should not be empty`).toBeGreaterThan(0);
      expect(enVal.trim().length, `en.${key} should not be empty`).toBeGreaterThan(0);
    }
  });

  it("keeps Portuguese dictionary free of prohibited English anglicisms", () => {
    const forbiddenPtAnglicisms =
      /\b(Badges|Master Wipe|Status Override|Background Sync|Audit Trail|Dashboard|Changelog|Uptime|Error Boundary|Templates|Workflow|Releases|Dump|Timestamp)\b/i;
    for (const [key, value] of Object.entries(translations.pt)) {
      expect(
        forbiddenPtAnglicisms.test(value),
        `translations.pt.${key} contains an English anglicism: "${value}"`
      ).toBe(false);
    }
  });

  it("persists and restores language preference across simulated reloads via ifpr_lang_preference", () => {
    expect(getStoredLanguage()).toBe("pt");
    expect(getLocaleForLanguage()).toBe("pt-BR");

    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
    expect(getStoredLanguage()).toBe("en");
    expect(getLocaleForLanguage()).toBe("en-US");

    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "pt");
    expect(getStoredLanguage()).toBe("pt");
    expect(getLocaleForLanguage()).toBe("pt-BR");

    // Invalid/unknown stored values safely fall back to Portuguese
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "fr");
    expect(getStoredLanguage()).toBe("pt");
  });

  it("translates all domain enums, helpers, and localized utility builders accurately", () => {
    expect(localize("pt", "Olá", "Hello")).toBe("Olá");
    expect(localize("en", "Olá", "Hello")).toBe("Hello");

    expect(translateCategory("Eletrônicos", "pt")).toBe("Eletrônicos");
    expect(translateCategory("Eletrônicos", "en")).toBe("Electronics");
    expect(translateCategory("Documentos & Cartões", "en")).toBe("Documents & Cards");
    expect(translateCategory("Chaves", "en")).toBe("Keys");

    expect(translateColor("Azul", "pt")).toBe("Azul");
    expect(translateColor("Azul", "en")).toBe("Blue");
    expect(translateColor("Preto", "en")).toBe("Black");

    expect(translateItemStatus("PERDIDO", "pt")).toBe("Perdido");
    expect(translateItemStatus("PERDIDO", "en")).toBe("Lost");
    expect(translateItemStatus("ENCONTRADO", "en")).toBe("Found");
    expect(translateItemStatus("EM_ANALISE", "en")).toBe("Under Review");
    expect(translateItemStatus("DEVOLVIDO", "en")).toBe("Returned");

    expect(translateUserRole("ADMIN", "en")).toBe("Administrator");
    expect(translateUserRole("SERVIDOR", "en")).toBe("Staff / TAE");
    expect(translateUserRole("ALUNO", "en")).toBe("Student");
    expect(translateUserRole("ALUNO", "pt")).toBe("Aluno");

    expect(translateCampusBlock("TODOS", "pt")).toBe("Todos os Blocos");
    expect(translateCampusBlock("TODOS", "en")).toBe("All Blocks");
    expect(translateCampusBlock("Bloco Administrativo", "en")).toBe("Block Administrativo");

    expect(translateBadgeTier("OURO", "pt")).toBe("OURO");
    expect(translateBadgeTier("OURO", "en")).toBe("GOLD");
    expect(translateClaimStatus("PENDENTE", "en")).toBe("Under Review");
    expect(translateAccountStatus("suspended", "en")).toBe("Suspended");
    expect(translateAccountStatus("suspended", "pt")).toBe("Suspenso");
    expect(translateApprovalStatus("PENDENTE", "en")).toBe("Pending Approval");
    expect(translateBugSeverity("critica", "en")).toBe("Critical");
    expect(translateActivityAction("ITEM_DEVOLVIDO", "en")).toBe("Object Returned");
    expect(translateLocationGroup("Áreas Comuns & Esportes", "en")).toBe("Common Areas & Sports");
    expect(translateCampusLocation("Biblioteca", "en")).toBe("Library");

    const repEn = calculateUserReputation(
      { id: "u1", name: "Ana", email: "ana@estudantes.ifpr.edu.br", role: "ALUNO" } as any,
      [],
      "en"
    );
    expect(repEn.levelTitle).toBe("Supportive Contributor");

    const presetsEn = getSuspensionPresetOptions("en");
    expect(presetsEn.some((p) => p.label.includes("day"))).toBe(true);
    const statusDetailsEn = formatAccountStatusDetails({ status: "active" } as any, "en");
    expect(statusDetailsEn.label).toBe("Active");

    const manualPt = getUserManualSections("pt");
    const manualEn = getUserManualSections("en");
    expect(manualPt.length).toBeGreaterThan(5);
    expect(manualEn.length).toBe(manualPt.length);

    expect(getItemAgeText(new Date().toISOString(), undefined, "pt")).toBe("Agora mesmo");
    expect(getItemAgeText(new Date().toISOString(), undefined, "en")).toBe("Just now");

    expect(parseAuthError({ code: "auth/invalid-credential" }, "pt").userMessage).toMatch(/incorretos/i);
    expect(parseAuthError({ code: "auth/invalid-credential" }, "en").userMessage).toMatch(/incorrect/i);
  });

  it("formats dates and datetimes according to selected language locale (pt-BR vs en-US)", () => {
    const isoDate = "2026-11-23";
    const ptDate = formatDate(isoDate, undefined, "pt");
    const enDate = formatDate(isoDate, undefined, "en");

    // pt-BR uses DD/MM/YYYY; en-US uses MM/DD/YYYY
    expect(ptDate).toBe("23/11/2026");
    expect(enDate).toBe("11/23/2026");

    // Fallback text for invalid date also respects language
    expect(formatDate(null, undefined, "pt")).toBe("Data não informada");
    expect(formatDate(null, undefined, "en")).toBe("Date not provided");

    const isoDateTime = "2026-11-23T15:30:00.000Z";
    const ptDateTime = formatDateTime(isoDateTime, undefined, "pt");
    const enDateTime = formatDateTime(isoDateTime, undefined, "en");
    expect(ptDateTime).toMatch(/23\/11\/2026/);
    expect(enDateTime).toMatch(/11\/23\/2026/);
  });

  it("formats UploadStatusIndicator subtitle in both pt (default) and en", () => {
    const base = {
      isOnline: false,
      isSyncing: false,
      pendingSyncCount: 2,
      inProgressCount: 0,
      authorizationErrorCount: 0,
      permanentErrorCount: 0,
      temporaryErrorCount: 0,
      completedCount: 0,
    };

    expect(computeUploadSubtitle(base)).toContain("Sem conexão");
    expect(computeUploadSubtitle({ ...base, lang: "en" })).toContain("Offline. 2 items waiting to sync.");
  });

  it("syncs document.documentElement.lang with active language in AppContext", () => {
    const appCtxPath = path.resolve(process.cwd(), "src/context/AppContext.tsx");
    const src = fs.readFileSync(appCtxPath, "utf-8");
    expect(src).toContain('document.documentElement.lang = language === "pt" ? "pt-BR" : "en"');
    expect(src).toContain("ifpr_lang_preference");
  });

  it("binds all active UI views, admin panels, legal pages, documents, and test-battery components to i18n", () => {
    const componentsToVerify = [
      "src/App.tsx",
      "src/components/Navbar.tsx",
      "src/components/MobileBottomNav.tsx",
      "src/components/Footer.tsx",
      "src/components/Breadcrumbs.tsx",
      "src/components/HomeView.tsx",
      "src/components/ObjectsView.tsx",
      "src/components/ItemCard.tsx",
      "src/components/ItemDetailModal.tsx",
      "src/components/AIMatchModal.tsx",
      "src/components/RecentActivityWidget.tsx",
      "src/components/RestrictedQRViewModal.tsx",
      "src/components/AccessibleVoiceReader.tsx",
      "src/components/ErrorBoundary.tsx",
      "src/components/InstallInstructionsModal.tsx",
      "src/components/DigitalSignaturePad.tsx",
      "src/components/RemoteSignatureModal.tsx",
      "src/components/NotificationsView.tsx",
      "src/components/MyItemsView.tsx",
      "src/components/SettingsView.tsx",
      "src/components/ThemeToggle.tsx",
      "src/components/NotFoundView.tsx",
      "src/components/PWAInstallBanner.tsx",
      "src/components/AccountStatusBanner.tsx",
      "src/components/AdminGuard.tsx",
      "src/components/AuthModal.tsx",
      "src/components/EmailVerificationView.tsx",
      "src/components/ResetPasswordView.tsx",
      "src/components/KeyboardShortcutsModal.tsx",
      "src/components/VoiceSearchModal.tsx",
      "src/components/ExportFoundItemsReportModal.tsx",
      "src/components/QRCodeScannerModal.tsx",
      "src/components/UploadStatusIndicator.tsx",
      "src/components/SupportView.tsx",
      "src/components/ContactSupportModal.tsx",
      "src/components/QuickSupportButton.tsx",
      "src/components/UserManualView.tsx",
      "src/components/ProfileView.tsx",
      "src/components/AccountManagementView.tsx",
      "src/components/ManageUserStatusModal.tsx",
      "src/components/RegisterItemView.tsx",
      "src/components/DashboardView.tsx",
      "src/components/MonthlyItemsD3Chart.tsx",
      "src/components/WeeklyFlowD3Chart.tsx",
      "src/components/DigitalReturnsD3Chart.tsx",
      "src/components/AppUptimeMonitor.tsx",
      "src/components/AIEfficiencyReportView.tsx",
      "src/components/CustodyRemindersView.tsx",
      "src/components/ImageAnalyzerView.tsx",
      "src/components/AuditTrailManagerView.tsx",
      "src/components/VersionHistoryView.tsx",
      "src/components/TestBatteryManagerView.tsx",
      "src/components/legal/LegalDocumentLayout.tsx",
      "src/components/legal/LegalDocumentDownloadButton.tsx",
      "src/components/PrivacyPolicyView.tsx",
      "src/components/TermsOfUseView.tsx",
      "src/components/documents/DocumentFillForm.tsx",
      "src/components/documents/DocumentPreviewModal.tsx",
      "src/components/documents/ProjectSettingsAdminView.tsx",
      "src/components/documents/ProjectConfigView.tsx",
      "src/components/documents/DocumentsAdminModule.tsx",
      "src/components/documents/DocumentTemplateEditor.tsx",
      "src/components/test-battery/AddTestCaseModal.tsx",
      "src/components/test-battery/DeleteBatteryModal.tsx",
      "src/components/test-battery/DeleteTestCaseModal.tsx",
      "src/components/test-battery/EditBatteryModal.tsx",
      "src/components/test-battery/EditTestCaseModal.tsx",
      "src/components/test-battery/AutoResizeTextarea.tsx",
      "src/components/test-battery/ParticipantManagerModal.tsx",
      "src/components/test-battery/TestAuditTrailDrawer.tsx",
      "src/components/test-battery/TestCategoryMetricsChart.tsx",
      "src/components/test-battery/TestEvidenceModal.tsx",
      "src/components/test-battery/TestDistributionSection.tsx",
    ];

    for (const relPath of componentsToVerify) {
      const fullPath = path.resolve(process.cwd(), relPath);
      const src = fs.readFileSync(fullPath, "utf-8");
      const usesI18n =
        /\bt\s*\(/.test(src) ||
        /\blocalize\s*\(/.test(src) ||
        /\blanguage\s*===/.test(src) ||
        /getLocaleForLanguage/.test(src) ||
        /getStoredLanguage/.test(src);
      expect(usesI18n, `${relPath} must be bound to i18n`).toBe(true);
    }
  });
});
