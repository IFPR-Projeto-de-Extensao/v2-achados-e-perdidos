import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { LostFoundItem } from "../types";
import { formatDate, formatDateTime, safeParseDate } from "./utils";

export interface FoundReportOptions {
  periodLabel?: string;
  startDate?: string;
  endDate?: string;
  categoryFilter?: string;
  locationFilter?: string;
  statusFilter?: string;
  issuedByName?: string;
  issuedByRole?: string;
  includeSignatures?: boolean;
  notes?: string;
}

/**
 * Generates an official, publication-ready PDF Accountability Report
 * for Found Items at IFPR Campus Ivaiporã ("Prestação de Contas da Secretaria Acadêmica / SEBAC").
 */
export function generateFoundItemsReportPdf(
  items: LostFoundItem[],
  options: FoundReportOptions = {}
): { doc: jsPDF; filename: string; protocol: string } {
  // Filter exclusively found items (or returned found items)
  const foundItems = items.filter((i) => {
    const isFound = i.type === "ENCONTRADO" || (i.status === "DEVOLVIDO" && i.type !== "PERDIDO");
    if (!isFound) return false;

    if (options.categoryFilter && options.categoryFilter !== "TODAS" && i.category !== options.categoryFilter) {
      return false;
    }
    if (options.locationFilter && options.locationFilter !== "TODOS" && i.location !== options.locationFilter) {
      return false;
    }
    if (options.statusFilter && options.statusFilter !== "TODOS" && i.status !== options.statusFilter) {
      return false;
    }
    if (options.startDate) {
      const d = safeParseDate(i.date || i.createdAt);
      const start = safeParseDate(options.startDate);
      if (d && start) {
        start.setHours(0, 0, 0, 0);
        if (d < start) return false;
      }
    }
    if (options.endDate) {
      const d = safeParseDate(i.date || i.createdAt);
      const end = safeParseDate(options.endDate);
      if (d && end) {
        end.setHours(23, 59, 59, 999);
        if (d > end) return false;
      }
    }
    return true;
  });

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

  const protocol = `IFPR-REL-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
  const now = new Date();
  const emissionDateStr = formatDateTime(now.toISOString());

  // Statistics calculation
  const totalFound = foundItems.length;
  const totalReturned = foundItems.filter((i) => i.status === "DEVOLVIDO").length;
  const totalInCustody = foundItems.filter(
    (i) => i.status === "ENCONTRADO" || i.status === "EM_ANALISE" || i.status === "PROPRIETARIO_IDENTIFICADO"
  ).length;
  const returnRatePercent = totalFound > 0 ? Math.round((totalReturned / totalFound) * 100) : 0;

  // Category tally
  const categoryCount: Record<string, number> = {};
  foundItems.forEach((i) => {
    categoryCount[i.category] = (categoryCount[i.category] || 0) + 1;
  });

  let currentY = 12;

  // 1. Header Banner & Institutional Identity
  doc.setFillColor(0, 132, 61); // IFPR Emerald Green #00843D
  doc.rect(marginLeft, currentY, contentWidth, 3, "F");

  doc.setFillColor(200, 16, 46); // IFPR Crimson Red #C8102E
  doc.rect(marginLeft, currentY + 3, 20, 1.5, "F");

  currentY += 8;

  // 2. Institutional Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text("MINISTÉRIO DA EDUCAÇÃO • SECRETARIA DE EDUCAÇÃO PROFISSIONAL E TECNOLÓGICA", pageWidth / 2, currentY, {
    align: "center",
  });

  currentY += 4.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text("INSTITUTO FEDERAL DO PARANÁ — CAMPUS IVAIPORÃ", pageWidth / 2, currentY, {
    align: "center",
  });

  currentY += 4.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 132, 61);
  doc.text("SECRETARIA ACADÊMICA (SEBAC) & CENTRAL DE ACHADOS E PERDIDOS", pageWidth / 2, currentY, {
    align: "center",
  });

  currentY += 4;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(marginLeft, currentY, pageWidth - marginRight, currentY);

  currentY += 6;

  // 3. Document Main Title Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(marginLeft, currentY, contentWidth, 14, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("RELATÓRIO DE PRESTAÇÃO DE CONTAS: BENS E OBJETOS ENCONTRADOS", pageWidth / 2, currentY + 6, {
    align: "center",
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `PROTOCOLO: ${protocol}   •   EMISSÃO: ${emissionDateStr}   •   PERÍODO: ${options.periodLabel || "Histórico Completo"}`,
    pageWidth / 2,
    currentY + 10.5,
    { align: "center" }
  );

  currentY += 18;

  // 4. Metadata Box
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(marginLeft, currentY, contentWidth, 16, 1, 1, "D");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);

  doc.text("Unidade / Campus:", marginLeft + 3, currentY + 4.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(15, 23, 42);
  doc.text("IFPR Campus Ivaiporã - Rod. PR-466, Gleba Pindaúva", marginLeft + 30, currentY + 4.5);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("Emitido Por:", marginLeft + 3, currentY + 9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(15, 23, 42);
  doc.text(
    `${options.issuedByName || "Secretaria Acadêmica"} (${options.issuedByRole || "SEBAC/Servidor"})`,
    marginLeft + 30,
    currentY + 9
  );

  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("Filtros Aplicados:", marginLeft + 3, currentY + 13.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(15, 23, 42);
  const filterDesc = `Categoria: ${options.categoryFilter || "Todas"} | Local: ${options.locationFilter || "Todos"} | Status: ${options.statusFilter || "Todos"}`;
  doc.text(filterDesc, marginLeft + 30, currentY + 13.5);

  currentY += 20;

  // 5. KPI Summary Cards (4 Columns)
  const cardWidth = (contentWidth - 9) / 4; // 4 cards with 3mm gaps
  const cardHeight = 15;

  const kpis = [
    {
      label: "TOTAL ENCONTRADOS",
      value: String(totalFound),
      bgColor: [240, 253, 244], // green-50
      borderColor: [187, 247, 208], // green-200
      textColor: [22, 101, 52], // green-800
    },
    {
      label: "SOB CUSTÓDIA",
      value: String(totalInCustody),
      bgColor: [254, 252, 232], // yellow-50
      borderColor: [254, 240, 138], // yellow-200
      textColor: [133, 77, 14], // yellow-800
    },
    {
      label: "RESTITUÍDOS / DEVOLVIDOS",
      value: String(totalReturned),
      bgColor: [239, 246, 255], // blue-50
      borderColor: [191, 219, 254], // blue-200
      textColor: [30, 64, 175], // blue-800
    },
    {
      label: "TAXA DE EFETIVIDADE",
      value: `${returnRatePercent}%`,
      bgColor: [250, 245, 255], // purple-50
      borderColor: [233, 213, 255], // purple-200
      textColor: [107, 33, 168], // purple-800
    },
  ];

  kpis.forEach((kpi, idx) => {
    const cardX = marginLeft + idx * (cardWidth + 3);
    doc.setFillColor(kpi.bgColor[0], kpi.bgColor[1], kpi.bgColor[2]);
    doc.setDrawColor(kpi.borderColor[0], kpi.borderColor[1], kpi.borderColor[2]);
    doc.roundedRect(cardX, currentY, cardWidth, cardHeight, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(71, 85, 105);
    doc.text(kpi.label, cardX + cardWidth / 2, currentY + 4.5, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(kpi.textColor[0], kpi.textColor[1], kpi.textColor[2]);
    doc.text(kpi.value, cardX + cardWidth / 2, currentY + 11.5, { align: "center" });
  });

  currentY += cardHeight + 6;

  // 6. Detailed Table using autoTable
  const tableData = foundItems.map((item, index) => {
    const protocolCode = item.qrCodeId || item.id.substring(0, 10).toUpperCase();
    const itemDate = formatDate(item.date || item.createdAt);
    const itemStatus =
      item.status === "DEVOLVIDO"
        ? "Devolvido ao Dono"
        : "Sob Custódia (SEBAC)";
    const visualInfo = [item.color ? `Cor: ${item.color}` : null, item.brand ? `Marca: ${item.brand}` : null]
      .filter(Boolean)
      .join(" | ");

    return [
      String(index + 1).padStart(2, "0"),
      protocolCode,
      `${item.title}\n${visualInfo ? `(${visualInfo})` : ""}`,
      item.category || "Outros",
      item.location || "Campus Ivaiporã",
      itemDate,
      itemStatus,
      item.registeredByName || "Servidor Responsável",
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [["#", "Protocolo", "Descrição do Objeto", "Categoria", "Local do Achado", "Data Registro", "Status", "Depositário"]],
    body: tableData.length > 0 ? tableData : [["-", "-", "Nenhum item encontrado no período selecionado.", "-", "-", "-", "-", "-"]],
    margin: { left: marginLeft, right: marginRight, bottom: 25 },
    theme: "grid",
    headStyles: {
      fillColor: [0, 132, 61], // #00843D
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
      halign: "center",
      valign: "middle",
      cellPadding: 2,
    },
    bodyStyles: {
      fontSize: 7,
      textColor: [30, 41, 59],
      cellPadding: 2,
      valign: "middle",
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 20, fontStyle: "bold", halign: "center" },
      2: { cellWidth: 46 },
      3: { cellWidth: 22 },
      4: { cellWidth: 26 },
      5: { cellWidth: 18, halign: "center" },
      6: { cellWidth: 22, halign: "center" },
      7: { cellWidth: 20 },
    },
    didDrawPage: (data) => {
      // Draw Footer on Every Page
      const totalPages = (doc as any).internal.getNumberOfPages();
      const currentPage = data.pageNumber;

      // Subtle bottom line
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(marginLeft, pageHeight - 12, pageWidth - marginRight, pageHeight - 12);

      // Footer Text
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(148, 163, 184);
      doc.text(
        "IFPR Campus Ivaiporã • Sistema Localiza+ • Relatório Oficial de Prestação de Contas e Inventário",
        marginLeft,
        pageHeight - 8
      );

      doc.setFont("helvetica", "bold");
      doc.text(`Página ${currentPage} de ${totalPages}`, pageWidth - marginRight, pageHeight - 8, {
        align: "right",
      });
    },
  });

  // Calculate final position after table for signatures if requested
  const finalY = (doc as any).lastAutoTable.finalY + 8;

  if (options.includeSignatures !== false) {
    // Check if we have enough room on current page or need a new page
    if (finalY + 38 > pageHeight - 20) {
      doc.addPage();
      currentY = 25;
    } else {
      currentY = finalY;
    }

    // Signature Block Section
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text("TERMO DE CONFORMIDADE E PRESTAÇÃO DE CONTAS", marginLeft, currentY);

    currentY += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      "Atesto para os devidos fins institucionais e regulamentares que os bens e objetos supramencionados foram devidamente registrados, armazenados em local apropriado e custodiados em conformidade com as diretrizes do Instituto Federal do Paraná - Campus Ivaiporã.",
      marginLeft,
      currentY,
      { maxWidth: contentWidth }
    );

    currentY += 16;

    const sigWidth = 75;
    const sig1X = marginLeft + 10;
    const sig2X = pageWidth - marginRight - sigWidth - 10;

    // Signature 1: Servidor Responsável
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.4);
    doc.line(sig1X, currentY, sig1X + sigWidth, currentY);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(options.issuedByName || "Servidor(a) Responsável", sig1X + sigWidth / 2, currentY + 4, {
      align: "center",
    });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(options.issuedByRole || "Secretaria Acadêmica / SEBAC", sig1X + sigWidth / 2, currentY + 7.5, {
      align: "center",
    });

    // Signature 2: Direção Geral / Chefia
    doc.line(sig2X, currentY, sig2X + sigWidth, currentY);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text("Visto da Direção / Chefia de Gabinete", sig2X + sigWidth / 2, currentY + 4, {
      align: "center",
    });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text("IFPR Campus Ivaiporã", sig2X + sigWidth / 2, currentY + 7.5, {
      align: "center",
    });
  }

  const filename = `Relatorio_Achados_IFPR_${now.toISOString().slice(0, 10)}_${protocol}.pdf`;

  return { doc, filename, protocol };
}

/**
 * Direct download trigger for the Found Items PDF Report.
 */
export function downloadFoundItemsReportPdf(items: LostFoundItem[], options: FoundReportOptions = {}): string {
  const { doc, filename, protocol } = generateFoundItemsReportPdf(items, options);
  doc.save(filename);
  return protocol;
}
