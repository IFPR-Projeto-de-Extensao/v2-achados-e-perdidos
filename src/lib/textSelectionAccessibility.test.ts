import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Auditoria de Acessibilidade de Seleção de Texto e select-none (Localiza+ IFPR)", () => {
  const rootDir = process.cwd();

  it("1. index.html: Não deve conter 'select-none' na tag <body> ou tags raiz", () => {
    const indexPath = path.join(rootDir, "index.html");
    const indexContent = fs.readFileSync(indexPath, "utf-8");

    // Valida que o body não possui a classe select-none que bloqueava a seleção global
    expect(indexContent).not.toMatch(/<body[^>]*select-none/);
    expect(indexContent).toMatch(/<body class="antialiased">/);
  });

  it("2. VersionHistoryView: Cabeçalhos de versão não devem conter 'select-none'", () => {
    const versionViewPath = path.join(rootDir, "src/components/VersionHistoryView.tsx");
    const content = fs.readFileSync(versionViewPath, "utf-8");

    // Valida que os cabeçalhos de versão (milestone e cards anteriores) não bloqueiam seleção de versão/codename
    expect(content).not.toContain("Version Milestone Header */\n                  <div\n                    onClick={() => toggleVersion(version.version)}\n                    className=\"p-5 sm:p-6 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-b from-transparent to-neutral-50/50 dark:to-neutral-900/30 select-none\"");
    expect(content).not.toMatch(/Version Milestone Header[\s\S]*?select-none/);
    expect(content).not.toMatch(/Version Card Header[\s\S]*?select-none/);
  });

  it("3. PWAInstallBanner: Container de texto informativo não deve conter 'select-none'", () => {
    const pwaBannerPath = path.join(rootDir, "src/components/PWAInstallBanner.tsx");
    const content = fs.readFileSync(pwaBannerPath, "utf-8");

    expect(content).not.toMatch(/className="flex items-center space-x-3 min-w-0 cursor-pointer select-none"/);
  });

  it("4. UploadStatusIndicator: Cabeçalho de status não deve bloquear seleção com 'select-none'", () => {
    const indicatorPath = path.join(rootDir, "src/components/UploadStatusIndicator.tsx");
    const content = fs.readFileSync(indicatorPath, "utf-8");

    expect(content).not.toMatch(/id="upload-status-header"[\s\S]*?select-none/);
  });

  it("5. Legitimidade: DigitalSignaturePad deve reter 'select-none' no canvas para evitar arraste durante desenho", () => {
    const padPath = path.join(rootDir, "src/components/DigitalSignaturePad.tsx");
    const content = fs.readFileSync(padPath, "utf-8");

    // Bloqueio legítimo indispensável para a funcionalidade de desenho da assinatura digital
    expect(content).toMatch(/<canvas[\s\S]*?select-none/);
  });

  it("6. Legitimidade: LegalDocumentDownloadButton deve reter 'select-none' como controle de botão", () => {
    const buttonPath = path.join(rootDir, "src/components/legal/LegalDocumentDownloadButton.tsx");
    const content = fs.readFileSync(buttonPath, "utf-8");

    // Bloqueio legítimo padrão para controle interativo de botão
    expect(content).toContain("select-none");
  });

  it("7. Legitimidade: Imagens institucionais retêm 'select-none' para prevenir drag ghosting nativo", () => {
    const logoPath = path.join(rootDir, "src/components/IFLogo.tsx");
    const logoContent = fs.readFileSync(logoPath, "utf-8");

    // Bloqueio legítimo em <img> para evitar ghosting de imagem ao clicar
    expect(logoContent).toContain("select-none");
  });

  it("8. Nenhum componente textual crítico (ItemCard, ItemDetailModal, DashboardView, TermsOfUseView) possui 'select-none'", () => {
    const filesToCheck = [
      "src/components/ItemCard.tsx",
      "src/components/ItemDetailModal.tsx",
      "src/components/DashboardView.tsx",
      "src/components/ObjectsView.tsx",
      "src/components/TermsOfUseView.tsx",
      "src/components/PrivacyPolicyView.tsx",
      "src/components/RegisterItemView.tsx",
    ];

    for (const relPath of filesToCheck) {
      const fullPath = path.join(rootDir, relPath);
      const fileContent = fs.readFileSync(fullPath, "utf-8");
      // Não deve ter select-none bloqueando esses componentes de leitura de texto
      expect(fileContent).not.toContain("select-none");
    }
  });
});
