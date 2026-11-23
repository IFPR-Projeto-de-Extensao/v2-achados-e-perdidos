import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  translations,
  LANGUAGE_STORAGE_KEY,
  getStoredLanguage,
  getLocaleForLanguage,
  translateCategory,
  translateColor,
  translateItemStatus,
  translateUserRole,
  translateCampusBlock,
} from "./i18n";
import { formatDate, formatDateTime } from "./utils";
import { computeUploadSubtitle } from "../components/UploadStatusIndicator";

describe("Internationalization (i18n) Completeness & Persistence (QA Fix #2)", () => {
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

  it("translates domain enums (categories, colors, statuses, roles, blocks) accurately", () => {
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

  it("binds core UI views, navigation, and modals to useApp() i18n", () => {
    const componentsToVerify = [
      "src/App.tsx",
      "src/components/Navbar.tsx",
      "src/components/MobileBottomNav.tsx",
      "src/components/Footer.tsx",
      "src/components/Breadcrumbs.tsx",
      "src/components/HomeView.tsx",
      "src/components/ObjectsView.tsx",
      "src/components/ItemCard.tsx",
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
      "src/components/KeyboardShortcutsModal.tsx",
      "src/components/VoiceSearchModal.tsx",
      "src/components/ExportFoundItemsReportModal.tsx",
      "src/components/QRCodeScannerModal.tsx",
      "src/components/UploadStatusIndicator.tsx",
      "src/components/SupportView.tsx",
      "src/components/ProfileView.tsx",
      "src/components/RegisterItemView.tsx",
      "src/components/DashboardView.tsx",
    ];

    for (const relPath of componentsToVerify) {
      const fullPath = path.resolve(process.cwd(), relPath);
      const src = fs.readFileSync(fullPath, "utf-8");
      const usesI18n =
        /\bt\s*\(/.test(src) ||
        /\blanguage\s*===/.test(src) ||
        /getLocaleForLanguage/.test(src);
      expect(usesI18n, `${relPath} must be bound to i18n`).toBe(true);
    }
  });
});
