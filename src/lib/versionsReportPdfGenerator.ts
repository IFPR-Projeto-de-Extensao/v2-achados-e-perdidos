import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { APP_VERSIONS_DATA, AppVersion, TOTAL_ADDITIONS_COUNT, TOTAL_FIXES_COUNT, TOTAL_VERSIONS_COUNT, CURRENT_VERSION } from "../data/versionsData";
import { formatDateTime } from "./utils";

export interface VersionReportOptions {
  filterType?: "ALL" | "ADDITIONS" | "FIXES";
  selectedModule?: string;
  selectedVersion?: string;
  issuedByName?: string;
  issuedByRole?: string;
  includeSignatures?: boolean;
}

/**
 * Generates an official, publication-ready PDF report of all versions,
 * additions (new features) and bug fixes for Localiza+ IFPR Campus Ivaiporã.
 */
export function generateVersionsReportPdf(options: VersionReportOptions = {}): {
  doc: jsPDF;
  filename: string;
  protocol: string;
} {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginLeft = 14;
  const marginRight = 14;
  const contentWidth = pageWidth - marginLeft - marginRight; // 182mm

  const protocol = `IFPR-VER-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
  const emissionDateStr = formatDateTime(new Date().toISOString());

  // Filter versions if requested
  let versions = [...APP_VERSIONS_DATA];
  if (options.selectedVersion && options.selectedVersion !== "ALL") {
    versions = versions.filter((v) => v.version === options.selectedVersion);
  }

  // Filter items per options
  const filterType = options.filterType || "ALL";
  const selectedModule = options.selectedModule || "ALL";

  let currentY = 12;

  // Header Colors & Decorative Bar
  doc.setFillColor(0, 132, 61); // IFPR Emerald Green #00843D
  doc.rect(marginLeft, currentY, contentWidth, 3, "F");

  doc.setFillColor(200, 16, 46); // IFPR Crimson Red #C8102E
  doc.rect(marginLeft, currentY + 3, 22, 1.5, "F");

  currentY += 8;

  // Institutional Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  doc.text("MINISTÉRIO DA EDUCAÇÃO", marginLeft, currentY);
  currentY += 4;

  doc.setFontSize(9.5);
  doc.setTextColor(0, 132, 61);
  doc.text("INSTITUTO FEDERAL DO PARANÁ — CAMPUS IVAIPORÃ", marginLeft, currentY);
  currentY += 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 100, 100);
  doc.text("Projeto InovaIF • Sistema Institucional Localiza+ (Achados e Perdidos)", marginLeft, currentY);
  doc.text(`Protocolo: ${protocol}`, pageWidth - marginRight, currentY, { align: "right" });
  currentY += 6;

  // Title of the Report
  doc.setFillColor(245, 248, 245);
  doc.setDrawColor(210, 230, 215);
  doc.roundedRect(marginLeft, currentY, contentWidth, 14, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text("RELATÓRIO OFICIAL DE ATIVIDADES, VERSÕES & CHANGELOG", marginLeft + 4, currentY + 5.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(90, 90, 90);
  const filterDesc =
    filterType === "ADDITIONS"
      ? "Filtro Aplicado: Apenas Novas Funcionalidades / Adições"
      : filterType === "FIXES"
      ? "Filtro Aplicado: Apenas Correções de Erros & Ajustes Técnicos"
      : "Histórico Consolidado Completo (Adições + Correções de Erros)";
  doc.text(
    `Documento de Governança Técnica de Software • Emissão: ${emissionDateStr} • ${filterDesc}`,
    marginLeft + 4,
    currentY + 10.5
  );

  currentY += 18;

  // KPI / Summary Box (4 Columns)
  const boxWidth = (contentWidth - 6) / 4;
  const boxHeight = 15;

  // Box 1: Total Versões
  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(marginLeft, currentY, boxWidth, boxHeight, 1.5, 1.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(110, 110, 110);
  doc.text("TOTAL DE VERSÕES", marginLeft + 3, currentY + 4.5);
  doc.setFontSize(12);
  doc.setTextColor(30, 30, 30);
  doc.text(TOTAL_VERSIONS_COUNT.toString(), marginLeft + 3, currentY + 11.5);

  // Box 2: Total Adições
  const b2X = marginLeft + boxWidth + 2;
  doc.setFillColor(242, 253, 245);
  doc.setDrawColor(180, 230, 195);
  doc.roundedRect(b2X, currentY, boxWidth, boxHeight, 1.5, 1.5, "FD");
  doc.setFontSize(6.5);
  doc.setTextColor(0, 132, 61);
  doc.text("NOVAS FUNCIONALIDADES", b2X + 3, currentY + 4.5);
  doc.setFontSize(12);
  doc.text(`+${TOTAL_ADDITIONS_COUNT}`, b2X + 3, currentY + 11.5);

  // Box 3: Total Correções
  const b3X = b2X + boxWidth + 2;
  doc.setFillColor(255, 251, 240);
  doc.setDrawColor(245, 215, 150);
  doc.roundedRect(b3X, currentY, boxWidth, boxHeight, 1.5, 1.5, "FD");
  doc.setFontSize(6.5);
  doc.setTextColor(180, 100, 0);
  doc.text("CORREÇÕES DE ERROS", b3X + 3, currentY + 4.5);
  doc.setFontSize(12);
  doc.text(TOTAL_FIXES_COUNT.toString(), b3X + 3, currentY + 11.5);

  // Box 4: Ambiente Atual
  const b4X = b3X + boxWidth + 2;
  doc.setFillColor(240, 247, 255);
  doc.setDrawColor(190, 220, 250);
  doc.roundedRect(b4X, currentY, boxWidth, boxHeight, 1.5, 1.5, "FD");
  doc.setFontSize(6.5);
  doc.setTextColor(0, 90, 180);
  doc.text("AMBIENTE ATIVO", b4X + 3, currentY + 4.5);
  doc.setFontSize(10);
  doc.text(`${CURRENT_VERSION} Produção`, b4X + 3, currentY + 11.5);

  currentY += boxHeight + 6;

  // Build the detailed table rows for each version
  const tableBody: any[] = [];

  versions.forEach((ver) => {
    let additions = ver.additions;
    let fixes = ver.bugFixes;

    if (selectedModule !== "ALL") {
      additions = additions.filter((a) => a.module === selectedModule);
      fixes = fixes.filter((f) => f.module === selectedModule);
    }

    if (filterType === "ADDITIONS") {
      fixes = [];
    } else if (filterType === "FIXES") {
      additions = [];
    }

    // Version Section Header Row
    const headerTitle = `${ver.version} — ${ver.codename} [${ver.type}] ${ver.isCurrent ? "(VERSÃO ATUAL)" : ""}`;
    const headerMeta = `Lançamento: ${ver.releaseDateTime}\n${ver.summary}`;

    tableBody.push([
      {
        content: headerTitle,
        colSpan: 1,
        styles: {
          fontStyle: "bold",
          fillColor: ver.isCurrent ? [230, 245, 235] : [240, 242, 245],
          textColor: ver.isCurrent ? [0, 120, 50] : [40, 40, 40],
          fontSize: 8.5,
        },
      },
      {
        content: headerMeta,
        colSpan: 2,
        styles: {
          fillColor: ver.isCurrent ? [230, 245, 235] : [240, 242, 245],
          textColor: [60, 60, 60],
          fontSize: 7.5,
        },
      },
    ]);

    // Additions Rows
    if (additions.length > 0) {
      additions.forEach((add, idx) => {
        tableBody.push([
          {
            content: idx === 0 ? `🚀 Adições (${additions.length})` : "",
            styles: {
              fontStyle: "bold",
              textColor: [0, 130, 60],
              fontSize: 7,
              cellWidth: 32,
            },
          },
          {
            content: `[${add.module}] ${add.title}${add.tag ? ` • Tag: ${add.tag}` : ""}`,
            styles: {
              fontStyle: "bold",
              textColor: [30, 30, 30],
              fontSize: 7.5,
              cellWidth: 50,
            },
          },
          {
            content: add.description,
            styles: {
              textColor: [70, 70, 70],
              fontSize: 7,
            },
          },
        ]);
      });
    }

    // Bug Fixes Rows
    if (fixes.length > 0) {
      fixes.forEach((fix, idx) => {
        tableBody.push([
          {
            content: idx === 0 ? `🛠️ Correções (${fixes.length})` : "",
            styles: {
              fontStyle: "bold",
              textColor: [190, 100, 0],
              fontSize: 7,
              cellWidth: 32,
            },
          },
          {
            content: `[${fix.module}] ${fix.title}${fix.tag ? ` • Tag: ${fix.tag}` : ""}`,
            styles: {
              fontStyle: "bold",
              textColor: [40, 40, 40],
              fontSize: 7.5,
              cellWidth: 50,
            },
          },
          {
            content: fix.description,
            styles: {
              textColor: [70, 70, 70],
              fontSize: 7,
            },
          },
        ]);
      });
    }

    // Small divider row
    tableBody.push([
      {
        content: "",
        colSpan: 3,
        styles: {
          minCellHeight: 1.5,
          fillColor: [255, 255, 255],
        },
      },
    ]);
  });

  // Render Table with autoTable
  autoTable(doc, {
    startY: currentY,
    head: [["Categoria / Tipo", "Módulo & Título da Alteração", "Descrição Detalhada da Implementação"]],
    body: tableBody,
    theme: "grid",
    margin: { left: marginLeft, right: marginRight },
    styles: {
      font: "helvetica",
      fontSize: 7,
      cellPadding: 2,
      lineColor: [225, 225, 225],
      lineWidth: 0.2,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [0, 132, 61],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
    },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 50 },
      2: { cellWidth: "auto" },
    },
    didDrawPage: (data) => {
      // Header for secondary pages
      if (data.pageNumber > 1) {
        doc.setFillColor(0, 132, 61);
        doc.rect(marginLeft, 8, contentWidth, 1.5, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        doc.text(
          "IFPR Campus Ivaiporã • Localiza+ • Relatório Consolidado de Versões & Changelog",
          marginLeft,
          13
        );
        doc.text(`Protocolo: ${protocol}`, pageWidth - marginRight, 13, { align: "right" });
      }

      // Footer for all pages
      const footerY = pageHeight - 10;
      doc.setDrawColor(210, 210, 210);
      doc.setLineWidth(0.3);
      doc.line(marginLeft, footerY - 2, pageWidth - marginRight, footerY - 2);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(120, 120, 120);
      doc.text(
        `Localiza+ IFPR • Sistema Integrado de Achados e Perdidos • Gerado em ${emissionDateStr}`,
        marginLeft,
        footerY + 1.5
      );

      const pageStr = `Página ${data.pageNumber}`;
      doc.text(pageStr, pageWidth - marginRight, footerY + 1.5, { align: "right" });
    },
  });

  // Check if we need a final signatures block on the last page
  if (options.includeSignatures !== false) {
    let lastY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 12 : currentY + 20;

    if (lastY > pageHeight - 35) {
      doc.addPage();
      lastY = 25;
    }

    const signWidth = 70;
    const sign1X = marginLeft + 10;
    const sign2X = pageWidth - marginRight - signWidth - 10;

    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.4);
    doc.line(sign1X, lastY + 10, sign1X + signWidth, lastY + 10);
    doc.line(sign2X, lastY + 10, sign2X + signWidth, lastY + 10);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(40, 40, 40);
    doc.text("Coordenação do Projeto InovaIF", sign1X + signWidth / 2, lastY + 14, { align: "center" });
    doc.text(
      options.issuedByName || "Administração de TI / SEBAC",
      sign2X + signWidth / 2,
      lastY + 14,
      { align: "center" }
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(110, 110, 110);
    doc.text("IFPR Campus Ivaiporã", sign1X + signWidth / 2, lastY + 17.5, { align: "center" });
    doc.text(
      options.issuedByRole || "Gestão e Governança do Sistema",
      sign2X + signWidth / 2,
      lastY + 17.5,
      { align: "center" }
    );
  }

  const filename = `relatorio-versoes-changelog-ifpr-${new Date().toISOString().slice(0, 10)}.pdf`;

  return { doc, filename, protocol };
}

/**
 * Direct download helper for PDF
 */
export function downloadVersionsReportPdf(options: VersionReportOptions = {}): string {
  const { doc, filename, protocol } = generateVersionsReportPdf(options);
  doc.save(filename);
  return protocol;
}
