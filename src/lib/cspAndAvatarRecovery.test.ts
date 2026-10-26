import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { CSP_DIRECTIVES, buildContentSecurityPolicy } from "./securityHeaders";
import { initGoogleAnalytics } from "./analytics";
import {
  isGenericAvatar,
  isCustomUploadedAvatar,
  getGoogleProviderPhoto,
  handleAvatarError,
  LOCAL_AVATAR_FALLBACK,
  INLINE_AVATAR_SVG_DATA_URI,
} from "./avatarUtils";

describe("LOCALIZA+ — Auditoria e Correção da CSP e Recuperação dos Avatares Google", () => {
  describe("1. Diretivas Content Security Policy (CSP)", () => {
    it("deve permitir https://*.googleusercontent.com em connect-src e img-src para fotos Google", () => {
      expect(CSP_DIRECTIVES["connect-src"]).toContain("https://*.googleusercontent.com");
      expect(CSP_DIRECTIVES["img-src"]).toContain("https://*.googleusercontent.com");
    });

    it("deve permitir DiceBear em connect-src e img-src para requisições fetch do Service Worker e fallback", () => {
      expect(CSP_DIRECTIVES["connect-src"]).toContain("https://api.dicebear.com");
      expect(CSP_DIRECTIVES["connect-src"]).toContain("https://*.dicebear.com");
      expect(CSP_DIRECTIVES["img-src"]).toContain("https://api.dicebear.com");
      expect(CSP_DIRECTIVES["img-src"]).toContain("https://*.dicebear.com");
    });

    it("deve autorizar https://www.googletagmanager.com em script-src mantendo exclusão estrita de unsafe-inline e unsafe-eval", () => {
      expect(CSP_DIRECTIVES["script-src"]).toContain("https://www.googletagmanager.com");
      expect(CSP_DIRECTIVES["script-src"]).not.toContain("'unsafe-inline'");
      expect(CSP_DIRECTIVES["script-src"]).not.toContain("'unsafe-eval'");
      expect(CSP_DIRECTIVES["connect-src"]).toContain("https://*.google-analytics.com");
      expect(CSP_DIRECTIVES["connect-src"]).toContain("https://*.analytics.google.com");
    });

    it("vercel.json e server.ts devem refletir com consistência a nova política CSP", () => {
      const vercelPath = path.resolve(__dirname, "../../vercel.json");
      const vercelContent = JSON.parse(fs.readFileSync(vercelPath, "utf-8"));
      const rootHeaders = vercelContent.headers.find((h: any) => h.source === "/(.*)");
      const vercelCsp = rootHeaders.headers.find((h: any) => h.key === "Content-Security-Policy")?.value;

      const serverPath = path.resolve(__dirname, "../../server.ts");
      const serverCode = fs.readFileSync(serverPath, "utf-8");

      const generatedCsp = buildContentSecurityPolicy();

      // Ambos os arquivos devem conter as origens liberadas
      expect(vercelCsp).toContain("https://*.googleusercontent.com");
      expect(vercelCsp).toContain("https://api.dicebear.com");
      expect(vercelCsp).toContain("https://www.googletagmanager.com");

      expect(serverCode).toContain("https://*.googleusercontent.com");
      expect(serverCode).toContain("https://api.dicebear.com");
      expect(serverCode).toContain("https://www.googletagmanager.com");
      expect(serverCode).toContain(generatedCsp);
    });
  });

  describe("2. Recuperação e Diferenciação de Fotos Google e Avatares", () => {
    it("deve reconhecer fotos do Google OAuth como fotos reais (não genéricas)", () => {
      const googlePhotoUrl = "https://lh3.googleusercontent.com/a/ACg8ocL_REAL_GOOGLE_PHOTO=s96-c";
      expect(isGenericAvatar(googlePhotoUrl)).toBe(false);
      expect(isCustomUploadedAvatar(googlePhotoUrl)).toBe(false);

      const mockFbUser = {
        photoURL: googlePhotoUrl,
        providerData: [{ providerId: "google.com", photoURL: googlePhotoUrl }],
      };
      expect(getGoogleProviderPhoto(mockFbUser)).toBe(googlePhotoUrl);
    });

    it("deve distinguir avatares customizados enviados pelo usuário de fotos Google e genéricos", () => {
      const base64Avatar = "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASo...";
      const storageAvatar = "https://firebasestorage.googleapis.com/v0/b/app/o/avatars%2Fuser.webp";

      expect(isCustomUploadedAvatar(base64Avatar)).toBe(true);
      expect(isCustomUploadedAvatar(storageAvatar)).toBe(true);
      expect(isGenericAvatar(base64Avatar)).toBe(false);
    });

    it("deve aplicar fallback local determinístico (/avatar-placeholder.svg e inline SVG) quando origens externas falham", () => {
      const img = {
        src: "https://lh3.googleusercontent.com/403-blocked.jpg",
        dataset: {} as Record<string, string>,
        onerror: vi.fn() as any,
      } as unknown as HTMLImageElement;

      // 1. Falha na foto Google -> tenta DiceBear
      handleAvatarError({ currentTarget: img }, "Paulo");
      expect(img.dataset.fallbackApplied).toBe("dicebear");
      expect(img.src).toContain("api.dicebear.com");

      // 2. Falha subsequente no DiceBear (ex: offline ou erro de rede) -> aplica SVG local
      handleAvatarError({ currentTarget: img }, "Paulo");
      expect(img.dataset.fallbackApplied).toBe("local");
      expect(img.src).toContain(LOCAL_AVATAR_FALLBACK);

      // 3. Falha no asset local -> aplica inline SVG imutável
      handleAvatarError({ currentTarget: img }, "Paulo");
      expect(img.dataset.fallbackApplied).toBe("final");
      expect(img.src).toContain("data:image/svg+xml");
    });
  });

  describe("3. Controle Condicional de Injeção do Google Analytics", () => {
    let originalWindow: any;
    let originalDocument: any;
    let appendedScripts: any[] = [];
    let elementsMap: Record<string, any> = {};

    beforeEach(() => {
      originalWindow = (global as any).window;
      originalDocument = (global as any).document;
      appendedScripts = [];
      elementsMap = {};

      const mockDoc: any = {
        getElementById: (id: string) => elementsMap[id] || null,
        createElement: (tag: string) => {
          const el: any = { tagName: tag, dataset: {} };
          return el;
        },
        head: {
          appendChild: (el: any) => {
            if (el.id) elementsMap[el.id] = el;
            appendedScripts.push(el);
          },
        },
      };

      const mockWin: any = {
        document: mockDoc,
        dataLayer: [],
      };

      (global as any).window = mockWin;
      (global as any).document = mockDoc;
    });

    afterEach(() => {
      (global as any).window = originalWindow;
      (global as any).document = originalDocument;
    });

    it("não deve injetar script do gtag quando measurementId for vazio ou ausente", () => {
      initGoogleAnalytics("");
      expect(appendedScripts.length).toBe(0);

      initGoogleAnalytics("   ");
      expect(appendedScripts.length).toBe(0);

      initGoogleAnalytics(undefined as any);
      expect(appendedScripts.length).toBe(0);

      initGoogleAnalytics("null");
      expect(appendedScripts.length).toBe(0);
    });

    it("deve injetar script somente quando measurementId for uma string válida", () => {
      initGoogleAnalytics("G-VALIDMEASURE123");
      expect(appendedScripts.length).toBe(1);
      const script = appendedScripts[0];
      expect(script.src).toContain("https://www.googletagmanager.com/gtag/js?id=G-VALIDMEASURE123");
      expect((global as any).window.dataLayer).toBeDefined();
    });
  });
});
