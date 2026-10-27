import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { CSP_DIRECTIVES, buildContentSecurityPolicy } from "./securityHeaders";

describe("LOCALIZA+ v1.10.6 — Auditoria da CSP de Fontes e Permissões Firestore", () => {
  describe("1. Content Security Policy (CSP) para Fontes e Workbox", () => {
    it("deve conter https://fonts.gstatic.com tanto em font-src quanto em connect-src", () => {
      // font-src autoriza o carregamento nativo via CSS @font-face
      expect(CSP_DIRECTIVES["font-src"]).toContain("https://fonts.gstatic.com");
      // connect-src autoriza o fetch() executado pelo Service Worker / Workbox para caching
      expect(CSP_DIRECTIVES["connect-src"]).toContain("https://fonts.gstatic.com");
    });

    it("vercel.json deve conter https://fonts.gstatic.com em connect-src e font-src", () => {
      const vercelPath = path.resolve(process.cwd(), "vercel.json");
      const vercelContent = JSON.parse(fs.readFileSync(vercelPath, "utf-8"));
      const rootHeaders = vercelContent.headers.find((h: any) => h.source === "/(.*)");
      const vercelCsp = rootHeaders.headers.find((h: any) => h.key === "Content-Security-Policy")?.value;

      expect(vercelCsp).toContain("font-src 'self' https://fonts.gstatic.com");
      expect(vercelCsp).toContain("https://fonts.gstatic.com; frame-src");
    });

    it("server.ts deve ter CSP perfeitamente sincronizada com securityHeaders.ts", () => {
      const serverPath = path.resolve(process.cwd(), "server.ts");
      const serverCode = fs.readFileSync(serverPath, "utf-8");
      const generatedCsp = buildContentSecurityPolicy();

      expect(serverCode).toContain(generatedCsp);
    });

    it("index.css deve possuir fallback tipográfico seguro do sistema", () => {
      const cssPath = path.resolve(process.cwd(), "src/index.css");
      const cssContent = fs.readFileSync(cssPath, "utf-8");

      expect(cssContent).toMatch(/font-family:\s*['"]Poppins['"],\s*system-ui/);
    });

    it("sw-custom.js deve conter guarda para unhandledrejection para capturar falhas de rede de pré-cache", () => {
      const swPath = path.resolve(process.cwd(), "public/sw-custom.js");
      const swContent = fs.readFileSync(swPath, "utf-8");

      expect(swContent).toContain('self.addEventListener("unhandledrejection"');
      expect(swContent).toContain("no-response");
    });
  });

  describe("2. Harmonização e Least Privilege nas Coleções 'claims' e 'notifications' em AppContext.tsx", () => {
    const appContextPath = path.resolve(process.cwd(), "src/context/AppContext.tsx");
    const appContextCode = fs.readFileSync(appContextPath, "utf-8");

    it("listener de claims deve isolar consultas por claimerId para usuários não-privilegiados", () => {
      // Localiza o bloco do useEffect de claims
      const claimsBlockMatch = appContextCode.match(
        /\/\/\s*Sync Claims from Firestore[\s\S]*?useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[(.*?)\]\);/
      );
      expect(claimsBlockMatch).not.toBeNull();

      const blockBody = claimsBlockMatch![1];
      const deps = claimsBlockMatch![2];

      // Deve verificar privilégio de ADMIN ou SERVIDOR
      expect(blockBody).toContain('currentUser?.role === "ADMIN" || currentUser?.role === "SERVIDOR"');

      // Se privilegiado, collection(db, "claims"); se não, filtra estritamente por claimerId == firebaseUser.uid
      expect(blockBody).toContain('where("claimerId", "==", firebaseUser.uid)');

      // Dependências devem ser reativas tanto ao firebaseUser quanto ao papel do usuário
      expect(deps).toContain("firebaseUser");
      expect(deps).toContain("currentUser?.role");
    });

    it("listener de notifications deve consultar estritamente alvos autorizados nas regras do Firestore", () => {
      // Localiza o bloco de notifications
      const notifsBlockMatch = appContextCode.match(
        /\/\/\s*Sync Notifications from Firestore[\s\S]*?useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[(.*?)\]\);/
      );
      expect(notifsBlockMatch).not.toBeNull();

      const blockBody = notifsBlockMatch![1];

      // Alvos permitidos devem ser estritamente os validados pelas regras
      expect(blockBody).toContain('[fbUid, "all", "todos_alunos", "todos"]');

      // Não deve incluir "global" no where("userId", "in", ...) pois 'global' não é um userId válido nas regras
      expect(blockBody).not.toMatch(/where\(\s*["']userId["'],\s*["']in["'],\s*\[[^\]]*["']global["']/);
    });
  });

  describe("3. Resiliência e Isolamento do Google Analytics", () => {
    it("analytics.ts deve conter tratamento assíncrono e não-bloqueante para falhas de carregamento de script", () => {
      const analyticsPath = path.resolve(process.cwd(), "src/lib/analytics.ts");
      const analyticsCode = fs.readFileSync(analyticsPath, "utf-8");

      expect(analyticsCode).toContain("script.async = true");
      expect(analyticsCode).toContain("script.onerror");
      expect(analyticsCode).toContain("Analytics Notice");
    });
  });
});
