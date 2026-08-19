/**
 * Gerador de PDF Profissional para Documentos Legais Institucionais (A4)
 * Localiza+ | IFPR Campus Ivaiporã | Projeto InovaIF
 */

import jsPDF from "jspdf";
import { LegalDocumentData, LegalDocumentSection } from "../data/legalDocumentsData";

export interface GenerateLegalPdfResult {
  doc: jsPDF;
  filename: string;
  blob: Blob;
  blobUrl: string;
}

/**
 * Gera e baixa o documento legal em formato PDF A4 de alta fidelidade institucional.
 */
export function generateLegalDocumentPdf(data: LegalDocumentData): GenerateLegalPdfResult {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginLeft = 18;
  const marginRight = 18;
  const marginTop = 20;
  const marginBottom = 20;
  const contentWidth = pageWidth - marginLeft - marginRight; // 174mm
  const maxY = pageHeight - marginBottom; // 277mm

  let currentY = marginTop;

  // Helper para verificar espaço e quebrar página quando necessário
  const checkPageBreak = (neededHeight: number): boolean => {
    if (currentY + neededHeight > maxY) {
      doc.addPage();
      currentY = 24;
      return true;
    }
    return false;
  };

  // =========================================================================
  // 1. PRIMEIRA PÁGINA: CABEÇALHO INSTITUCIONAL & METADADOS
  // =========================================================================

  // Barra de topo institucional (Verde #00843D + Vermelho #EF4444)
  doc.setFillColor(0, 132, 61);
  doc.rect(marginLeft, 10, contentWidth, 2.5, "F");
  doc.setFillColor(239, 68, 68);
  doc.rect(marginLeft, 12.5, 16, 1.5, "F");

  currentY = 19;

  // Cabeçalho Oficial
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text("REPÚBLICA FEDERATIVA DO BRASIL", marginLeft, currentY);
  currentY += 4;
  doc.text("MINISTÉRIO DA EDUCAÇÃO • REDE FEDERAL EPCT", marginLeft, currentY);
  currentY += 4;
  doc.setTextColor(30, 41, 59); // slate-800
  doc.setFontSize(9);
  doc.text("INSTITUTO FEDERAL DO PARANÁ — CAMPUS IVAIPORÃ", marginLeft, currentY);
  currentY += 4;
  doc.setFontSize(8);
  doc.setTextColor(0, 132, 61); // verde IFPR
  doc.text("PROJETO INOVAIF • SISTEMA LOCALIZA+", marginLeft, currentY);
  currentY += 7;

  // Linha divisória fina
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.4);
  doc.line(marginLeft, currentY, marginLeft + contentWidth, currentY);
  currentY += 6;

  // Título Principal do Documento
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(data.title, marginLeft, currentY);
  currentY += 6;

  // Subtítulo e Descrição
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0, 132, 61);
  doc.text(data.subtitle + " • Sistema Inteligente de Achados e Perdidos", marginLeft, currentY);
  currentY += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105); // slate-600
  const summaryLines = doc.splitTextToSize(data.summary, contentWidth);
  doc.text(summaryLines, marginLeft, currentY);
  currentY += summaryLines.length * 4.2 + 4;

  // Caixa de Metadados Institucionais (Informações Oficiais do Documento)
  const metaBoxStartY = currentY;
  const metaBoxHeight = data.dpoName ? 34 : 26;
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.setLineWidth(0.3);
  doc.roundedRect(marginLeft, metaBoxStartY, contentWidth, metaBoxHeight, 2.5, 2.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text("INFORMAÇÕES INSTITUCIONAIS DO DOCUMENTO", marginLeft + 4, metaBoxStartY + 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  doc.setTextColor(51, 65, 85);

  let metaLineY = metaBoxStartY + 9.5;
  doc.text(`• Projeto/Equipe: ${data.project} | Instituição: ${data.institution} – ${data.campus}`, marginLeft + 4, metaLineY);
  metaLineY += 4;
  doc.text(`• Endereço: ${data.address}`, marginLeft + 4, metaLineY);
  metaLineY += 4;
  doc.text(`• Data da versão: Última atualização: ${data.lastUpdated} | Contato: ${data.contactEmail}`, marginLeft + 4, metaLineY);
  
  if (data.dpoName && data.dpoEmail) {
    metaLineY += 4;
    doc.setFont("helvetica", "bold");
    doc.text(`• Contato de Privacidade Provisório: `, marginLeft + 4, metaLineY);
    const labelWidth = doc.getTextWidth(`• Contato de Privacidade Provisório: `);
    doc.setFont("helvetica", "normal");
    doc.text(`${data.dpoName} (${data.dpoEmail})`, marginLeft + 4 + labelWidth, metaLineY);
    metaLineY += 3.8;
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`  (Designação técnica no âmbito do projeto InovaIF / IFPR Campus Ivaiporã)`, marginLeft + 4, metaLineY);
  }

  currentY = metaBoxStartY + metaBoxHeight + 8;

  // =========================================================================
  // 2. RENDERIZAÇÃO DAS SEÇÕES
  // =========================================================================

  data.sections.forEach((section: LegalDocumentSection) => {
    // Espaço mínimo para iniciar a seção (título + ao menos 2 linhas de texto)
    checkPageBreak(22);

    // Título da Seção
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(0, 132, 61); // Verde IFPR
    const numPrefix = `${section.num.toString().padStart(2, "0")}. `;
    doc.text(numPrefix, marginLeft, currentY);
    
    const prefixWidth = doc.getTextWidth(numPrefix);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(section.title, marginLeft + prefixWidth, currentY);
    currentY += 2;

    // Linha sutil abaixo do título
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.2);
    doc.line(marginLeft, currentY, marginLeft + contentWidth, currentY);
    currentY += 4.5;

    // Parágrafos iniciais
    if (section.paragraphs && section.paragraphs.length > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);

      section.paragraphs.forEach((p) => {
        const lines = doc.splitTextToSize(p, contentWidth);
        const pHeight = lines.length * 4.2;
        checkPageBreak(pHeight + 2);
        doc.text(lines, marginLeft, currentY);
        currentY += pHeight + 2.5;
      });
    }

    // Itens com marcadores (Bullet List)
    if (section.bulletItems && section.bulletItems.length > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.2);
      doc.setTextColor(51, 65, 85);

      section.bulletItems.forEach((item) => {
        const bulletIndent = 4.5;
        const itemWidth = contentWidth - bulletIndent;
        const lines = doc.splitTextToSize(item, itemWidth);
        const itemHeight = lines.length * 3.9;

        checkPageBreak(itemHeight + 2);

        // Desenhar marcador circular
        doc.setFillColor(0, 132, 61);
        doc.circle(marginLeft + 1.8, currentY - 1, 0.7, "F");

        doc.text(lines, marginLeft + bulletIndent, currentY);
        currentY += itemHeight + 1.8;
      });
      currentY += 1.5;
    }

    // Itens numerados (Ordered List)
    if (section.orderedItems && section.orderedItems.length > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.2);
      doc.setTextColor(51, 65, 85);

      section.orderedItems.forEach((item, idx) => {
        const numLabel = `${idx + 1}.`;
        const numIndent = 6;
        const itemWidth = contentWidth - numIndent;
        const lines = doc.splitTextToSize(item, itemWidth);
        const itemHeight = lines.length * 3.9;

        checkPageBreak(itemHeight + 2);

        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 132, 61);
        doc.text(numLabel, marginLeft, currentY);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(51, 65, 85);
        doc.text(lines, marginLeft + numIndent, currentY);
        currentY += itemHeight + 1.8;
      });
      currentY += 1.5;
    }

    // Caixas de Destaque / Ressalvas (Callouts)
    if (section.callouts && section.callouts.length > 0) {
      section.callouts.forEach((callout) => {
        const padding = 3.5;
        const boxWidth = contentWidth;
        const innerWidth = boxWidth - padding * 2;

        // Medir altura necessária
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        const titleLines = callout.title ? doc.splitTextToSize(callout.title, innerWidth) : [];

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.8);
        const textLines = doc.splitTextToSize(callout.text, innerWidth);
        const subtextLines = callout.subtext ? doc.splitTextToSize(callout.subtext, innerWidth) : [];

        const totalBoxHeight =
          padding * 2 +
          (titleLines.length > 0 ? titleLines.length * 3.8 + 2 : 0) +
          textLines.length * 3.6 +
          (subtextLines.length > 0 ? subtextLines.length * 3.4 + 3 : 0);

        checkPageBreak(totalBoxHeight + 4);

        const boxStartY = currentY;

        // Cores de acordo com o tipo
        if (callout.type === "warning" || callout.type === "alert") {
          doc.setFillColor(254, 243, 199); // amber-100
          doc.setDrawColor(245, 158, 11); // amber-500
        } else {
          doc.setFillColor(240, 253, 244); // emerald-50
          doc.setDrawColor(34, 197, 94); // emerald-500
        }

        doc.setLineWidth(0.3);
        doc.roundedRect(marginLeft, boxStartY, boxWidth, totalBoxHeight, 2, 2, "FD");

        // Barra lateral esquerda colorida
        if (callout.type === "warning" || callout.type === "alert") {
          doc.setFillColor(217, 119, 6);
        } else {
          doc.setFillColor(0, 132, 61);
        }
        doc.rect(marginLeft, boxStartY, 1.8, totalBoxHeight, "F");

        let innerY = boxStartY + padding + 2.5;

        if (titleLines.length > 0) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          if (callout.type === "warning" || callout.type === "alert") {
            doc.setTextColor(146, 64, 14); // amber-800
          } else {
            doc.setTextColor(20, 83, 45); // emerald-800
          }
          doc.text(titleLines, marginLeft + padding + 1, innerY);
          innerY += titleLines.length * 3.8 + 1.5;
        }

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.8);
        doc.setTextColor(30, 41, 59);
        doc.text(textLines, marginLeft + padding + 1, innerY);
        innerY += textLines.length * 3.6;

        if (subtextLines.length > 0) {
          innerY += 2;
          doc.setFontSize(7.2);
          doc.setTextColor(71, 85, 105);
          doc.text(subtextLines, marginLeft + padding + 1, innerY);
        }

        currentY = boxStartY + totalBoxHeight + 3.5;
      });
    }

    // Cartões de Informações / Contatos da Seção
    if (section.infoCards && section.infoCards.length > 0) {
      const cardHeight = section.infoCards.length * 4.5 + 5;
      checkPageBreak(cardHeight + 4);

      const cardStartY = currentY;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.25);
      doc.roundedRect(marginLeft, cardStartY, contentWidth, cardHeight, 1.5, 1.5, "FD");

      let cardRowY = cardStartY + 4.5;
      section.infoCards.forEach((row) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.8);
        doc.setTextColor(15, 23, 42);
        const labelText = `• ${row.label}: `;
        doc.text(labelText, marginLeft + 3, cardRowY);

        const lWidth = doc.getTextWidth(labelText);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(51, 65, 85);
        doc.text(row.value, marginLeft + 3 + lWidth, cardRowY);

        cardRowY += 4.5;
      });

      currentY = cardStartY + cardHeight + 3.5;
    }

    // Parágrafos posteriores ao card (quando existirem)
    if (section.paragraphsAfter && section.paragraphsAfter.length > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);

      section.paragraphsAfter.forEach((p) => {
        const lines = doc.splitTextToSize(p, contentWidth);
        const pHeight = lines.length * 4.2;
        checkPageBreak(pHeight + 2);
        doc.text(lines, marginLeft, currentY);
        currentY += pHeight + 2.5;
      });
    }

    currentY += 3.5; // Espaçamento entre seções
  });

  // =========================================================================
  // 3. CABEÇALHOS CORRIDOS E RODAPÉS COM PAGINAÇÃO EM TODAS AS PÁGINAS
  // =========================================================================

  const totalPages = doc.getNumberOfPages();

  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);

    // Cabeçalho corrido a partir da página 2
    if (page > 1) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(
        `Localiza+ • IFPR Campus Ivaiporã — ${data.title}`,
        marginLeft,
        12
      );

      doc.text(
        `Projeto InovaIF`,
        pageWidth - marginRight,
        12,
        { align: "right" }
      );

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(marginLeft, 14, marginLeft + contentWidth, 14);
    }

    // Rodapé em todas as páginas
    const footerY = pageHeight - 12;

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(marginLeft, footerY - 3, marginLeft + contentWidth, footerY - 3);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139); // slate-500

    // Esquerda: Identificação institucional
    doc.text(
      `Localiza+ • ${data.institution} (${data.campus})`,
      marginLeft,
      footerY
    );

    // Centro: Data da versão
    doc.text(
      `Atualização: ${data.lastUpdated}`,
      pageWidth / 2,
      footerY,
      { align: "center" }
    );

    // Direita: Numeração de Página
    doc.setFont("helvetica", "bold");
    doc.text(
      `Página ${page} de ${totalPages}`,
      pageWidth - marginRight,
      footerY,
      { align: "right" }
    );
  }

  // Gera o blob e a URL para download
  const blob = doc.output("blob");
  const blobUrl = URL.createObjectURL(blob);

  // Executa o download imediato no navegador
  doc.save(data.filename);

  return {
    doc,
    filename: data.filename,
    blob,
    blobUrl,
  };
}
