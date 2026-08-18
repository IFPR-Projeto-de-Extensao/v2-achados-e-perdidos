import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { DocumentTemplate, ProjectSettings } from "../types";
import { getProjectSettingsTags } from "./projectSettingsConstants";

export interface GeneratePdfOptions {
  documentNumber?: string;
  watermarkDraft?: boolean;
  projectSettings?: ProjectSettings | null;
}

/**
 * Substitui todas as tags dinâmicas {{tag_name}} pelos valores informados no formulário e dados do projeto.
 */
export function replaceDynamicTags(
  text: string,
  fieldValues: Record<string, string> = {},
  projectSettings?: ProjectSettings | null
): string {
  if (!text) return "";
  let result = text;

  // Obter tags padrão do projeto InovaIF / Instituição
  const projectTags = getProjectSettingsTags(projectSettings);

  // Fundir variáveis (os valores informados explicitamente no formulário têm precedência)
  const merged: Record<string, string> = { ...projectTags, ...fieldValues };

  Object.keys(merged).forEach((key) => {
    const val = merged[key] !== undefined && merged[key] !== null ? String(merged[key]) : "";
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi");
    result = result.replace(regex, val);
  });
  // Se sobrarem tags não preenchidas, substituir por linha em branco ou sublinhado
  result = result.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, "_________________________");
  return result;
}

/**
 * Motor de geração de PDF Institucional em Folha A4 com paginação automática e alta fidelidade.
 */
export function generateDocumentPdf(
  template: DocumentTemplate,
  fieldValues: Record<string, string>,
  options?: GeneratePdfOptions
): { doc: jsPDF; blob: Blob; blobUrl: string; filename: string } {
  const projectSettings = options?.projectSettings;
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginLeft = 18;
  const marginRight = 18;
  const marginTop = 18;
  const marginBottom = 20;
  const contentWidth = pageWidth - marginLeft - marginRight; // 174mm

  let currentY = marginTop;

  // Geração de código/número de documento se não fornecido
  const docNumber =
    options?.documentNumber ||
    `DOC-${template.code || "IFPR"}-${new Date().getFullYear()}/${String(Math.floor(1000 + Math.random() * 9000))}`;

  // Helper para desenhar o Cabeçalho Institucional
  const drawPageHeader = (isFirstPage: boolean) => {
    // Barra superior institucional IFPR (Verde e Vermelho)
    doc.setFillColor(0, 132, 61); // #00843D
    doc.rect(marginLeft, 10, contentWidth, 2, "F");
    doc.setFillColor(239, 68, 68); // #EF4444
    doc.rect(marginLeft, 12, 14, 1.2, "F");

    if (isFirstPage && template.includeHeader) {
      currentY = 17;
      
      // Cabeçalho institucional texto com tags dinâmicas substituídas
      const resolvedHeaderText = replaceDynamicTags(
        template.headerText || "REPÚBLICA FEDERATIVA DO BRASIL\nMINISTÉRIO DA EDUCAÇÃO\n{{instituicao}} — {{campus}}",
        fieldValues,
        projectSettings
      );
      const headerLines = resolvedHeaderText.split("\n");
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59); // slate-800
      
      headerLines.forEach((line, idx) => {
        if (idx === 0) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(71, 85, 105);
        } else if (idx === 1) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8.5);
          doc.setTextColor(30, 41, 59);
        } else if (idx === 2) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.setTextColor(0, 132, 61);
        } else {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139);
        }
        doc.text(line.trim(), pageWidth / 2, currentY, { align: "center" });
        currentY += 4;
      });

      currentY += 2;

      // Linha divisória sutil
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.4);
      doc.line(marginLeft, currentY, pageWidth - marginRight, currentY);
      currentY += 6;

      // Título Principal do Documento
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(marginLeft, currentY, contentWidth, 14, 1.5, 1.5, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11.5);
      doc.setTextColor(15, 23, 42);
      doc.text(template.title.toUpperCase(), pageWidth / 2, currentY + 6.5, { align: "center" });

      if (template.includeDocNumber) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(`Nº DE CONTROLE: ${docNumber}  •  VERSÃO ${template.version || 1}.0`, pageWidth / 2, currentY + 11, {
          align: "center",
        });
      }

      currentY += 19;
    } else {
      // Cabeçalho simplificado para páginas 2+
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(`${template.title} • ${docNumber}`, marginLeft, 16);
      doc.setDrawColor(226, 232, 240);
      doc.line(marginLeft, 18, pageWidth - marginRight, 18);
      currentY = 24;
    }
  };

  // Helper para verificar quebra de página
  const checkPageBreak = (neededHeightMm: number) => {
    if (currentY + neededHeightMm > pageHeight - marginBottom) {
      doc.addPage();
      drawPageHeader(false);
    }
  };

  // Desenha primeira página
  drawPageHeader(true);

  // Renderizar Seções
  (template.sections || []).forEach((section) => {
    const rawContent = replaceDynamicTags(section.content, fieldValues, projectSettings);
    const fontSize = section.fontSize || 10;
    const fontStyle = section.isBold ? "bold" : section.isItalic ? "italic" : "normal";
    const align = section.align || "left";
    const spacingBottom = section.spacingBottom !== undefined ? section.spacingBottom : 4;

    doc.setFont("helvetica", fontStyle);
    doc.setFontSize(fontSize);
    doc.setTextColor(15, 23, 42);

    if (section.type === "heading") {
      checkPageBreak(12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(fontSize || 12);
      doc.setTextColor(0, 132, 61);
      doc.text(section.title, marginLeft, currentY);
      currentY += 6;
      return;
    }

    if (section.type === "numbered_section" || section.type === "declarations_list") {
      // Cabeçalho da Seção Numerada (Ex: 1. Dados do Parceiro)
      checkPageBreak(16);
      
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(203, 213, 225);
      doc.rect(marginLeft, currentY, contentWidth, 6.5, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(30, 41, 59);
      doc.text(section.title, marginLeft + 3, currentY + 4.5);
      currentY += 9;

      // Conteúdo em bloco ou linhas
      const lines = doc.splitTextToSize(rawContent, contentWidth - 4);
      const blockHeight = lines.length * (fontSize * 0.42);

      checkPageBreak(blockHeight + 4);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(fontSize);
      doc.setTextColor(51, 65, 85);

      lines.forEach((line: string) => {
        checkPageBreak(4.5);
        let xPos = marginLeft + 2;
        if (align === "center") xPos = pageWidth / 2;
        if (align === "right") xPos = pageWidth - marginRight - 2;

        // Se for linha de lista (• ou I. ou II.), destacar ligeiramente
        if (line.trim().startsWith("•") || /^[I|V|X]+\./.test(line.trim())) {
          doc.setFont("helvetica", "normal");
        }
        
        doc.text(line, xPos, currentY, { align });
        currentY += 4.5;
      });

      currentY += spacingBottom;
      return;
    }

    // Parágrafo Padrão ou Local/Data
    const lines = doc.splitTextToSize(rawContent, contentWidth);
    const needed = lines.length * 4.6 + spacingBottom;
    checkPageBreak(needed);

    doc.setFont("helvetica", fontStyle);
    doc.setFontSize(fontSize);
    doc.setTextColor(30, 41, 59);

    lines.forEach((line: string) => {
      checkPageBreak(4.6);
      let xPos = marginLeft;
      if (align === "center") xPos = pageWidth / 2;
      if (align === "right") xPos = pageWidth - marginRight;
      doc.text(line, xPos, currentY, { align });
      currentY += 4.6;
    });

    currentY += spacingBottom;
  });

  // Renderizar Bloco de Assinaturas
  if (template.signatures && template.signatures.length > 0) {
    const sigCount = template.signatures.length;
    // Estimar altura necessária para assinaturas (cerca de 32mm)
    const sigHeightNeeded = sigCount > 2 ? 65 : 36;
    checkPageBreak(sigHeightNeeded);

    currentY += 4;

    // Se temos 2 assinaturas, desenhar lado a lado
    if (sigCount === 2) {
      const colWidth = (contentWidth - 12) / 2;
      const x1 = marginLeft;
      const x2 = marginLeft + colWidth + 12;

      // Linha 1
      doc.setDrawColor(100, 116, 139);
      doc.setLineWidth(0.4);
      doc.line(x1 + 4, currentY + 12, x1 + colWidth - 4, currentY + 12);
      doc.line(x2 + 4, currentY + 12, x2 + colWidth - 4, currentY + 12);

      const sig1 = template.signatures[0];
      const sig2 = template.signatures[1];

      const sig1Name = replaceDynamicTags(sig1.nameTag || "", fieldValues, projectSettings) || "_____________________";
      const sig1Role = replaceDynamicTags(sig1.roleTag || "", fieldValues, projectSettings) || sig1.title;
      const sig1Doc = replaceDynamicTags(sig1.cpfOrDocTag || "", fieldValues, projectSettings);

      const sig2Name = replaceDynamicTags(sig2.nameTag || "", fieldValues, projectSettings) || "_____________________";
      const sig2Role = replaceDynamicTags(sig2.roleTag || "", fieldValues, projectSettings) || sig2.title;
      const sig2Doc = replaceDynamicTags(sig2.cpfOrDocTag || "", fieldValues, projectSettings);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(sig1Name, x1 + colWidth / 2, currentY + 16, { align: "center" });
      doc.text(sig2Name, x2 + colWidth / 2, currentY + 16, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(sig1Role, x1 + colWidth / 2, currentY + 19.5, { align: "center" });
      doc.text(sig2Role, x2 + colWidth / 2, currentY + 19.5, { align: "center" });

      if (sig1Doc) doc.text(sig1Doc, x1 + colWidth / 2, currentY + 23, { align: "center" });
      if (sig2Doc) doc.text(sig2Doc, x2 + colWidth / 2, currentY + 23, { align: "center" });

      currentY += 28;
    } else {
      // 3 ou mais assinaturas: 2 em cima, 1 centralizada embaixo
      const colWidth = (contentWidth - 12) / 2;
      const x1 = marginLeft;
      const x2 = marginLeft + colWidth + 12;

      // Par 1
      doc.setDrawColor(100, 116, 139);
      doc.setLineWidth(0.4);
      doc.line(x1 + 4, currentY + 12, x1 + colWidth - 4, currentY + 12);
      doc.line(x2 + 4, currentY + 12, x2 + colWidth - 4, currentY + 12);

      const sig1 = template.signatures[0];
      const sig2 = template.signatures[1];

      const sig1Name = replaceDynamicTags(sig1.nameTag || "", fieldValues, projectSettings) || "_____________________";
      const sig1Role = replaceDynamicTags(sig1.roleTag || "", fieldValues, projectSettings) || sig1.title;
      const sig1Doc = replaceDynamicTags(sig1.cpfOrDocTag || "", fieldValues, projectSettings);

      const sig2Name = replaceDynamicTags(sig2.nameTag || "", fieldValues, projectSettings) || "_____________________";
      const sig2Role = replaceDynamicTags(sig2.roleTag || "", fieldValues, projectSettings) || sig2.title;
      const sig2Doc = replaceDynamicTags(sig2.cpfOrDocTag || "", fieldValues, projectSettings);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(sig1Name, x1 + colWidth / 2, currentY + 16, { align: "center" });
      doc.text(sig2Name, x2 + colWidth / 2, currentY + 16, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(sig1Role, x1 + colWidth / 2, currentY + 19.5, { align: "center" });
      doc.text(sig2Role, x2 + colWidth / 2, currentY + 19.5, { align: "center" });

      if (sig1Doc) doc.text(sig1Doc, x1 + colWidth / 2, currentY + 23, { align: "center" });
      if (sig2Doc) doc.text(sig2Doc, x2 + colWidth / 2, currentY + 23, { align: "center" });

      currentY += 28;

      // Terceira assinatura centralizada
      if (template.signatures[2]) {
        checkPageBreak(25);
        const sig3 = template.signatures[2];
        const cx = pageWidth / 2;
        const sig3Width = 90;

        doc.setDrawColor(100, 116, 139);
        doc.line(cx - sig3Width / 2, currentY + 10, cx + sig3Width / 2, currentY + 10);

        const sig3Name = replaceDynamicTags(sig3.nameTag || "", fieldValues, projectSettings) || "_____________________";
        const sig3Role = replaceDynamicTags(sig3.roleTag || "", fieldValues, projectSettings) || sig3.title;
        const sig3Doc = replaceDynamicTags(sig3.cpfOrDocTag || "", fieldValues, projectSettings);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text(sig3Name, cx, currentY + 14, { align: "center" });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        doc.text(sig3Role, cx, currentY + 17.5, { align: "center" });
        if (sig3Doc) doc.text(sig3Doc, cx, currentY + 21, { align: "center" });

        currentY += 24;
      }
    }
  }

  // Segunda Passada: Rodapés e Paginação "Página X de Y" em todas as páginas
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Linha divisória do rodapé
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(marginLeft, pageHeight - 14, pageWidth - marginRight, pageHeight - 14);

    // Texto institucional do rodapé
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    
    const footerLeft = replaceDynamicTags(
      template.footerText || "Instituto Federal do Paraná — Campus Ivaiporã",
      fieldValues,
      projectSettings
    );
    doc.text(footerLeft, marginLeft, pageHeight - 9);

    // Paginação à direita
    const footerRight = `Página ${i} de ${totalPages}`;
    doc.text(footerRight, pageWidth - marginRight, pageHeight - 9, { align: "right" });
  }

  const cleanTitle = (template.title || "documento")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_");
  
  const filename = `${cleanTitle}_${new Date().toISOString().slice(0, 10)}.pdf`;
  const blob = doc.output("blob");
  const blobUrl = URL.createObjectURL(blob);

  return { doc, blob, blobUrl, filename };
}

/**
 * Função utilitária para acionar o download do PDF imediatamente no navegador.
 */
export function downloadDocumentPdf(
  template: DocumentTemplate,
  fieldValues: Record<string, string>,
  options?: GeneratePdfOptions
) {
  const { doc, filename } = generateDocumentPdf(template, fieldValues, options);
  doc.save(filename);
}

/**
 * Geração de PDF a partir de um elemento HTML DOM usando html2canvas e jsPDF
 * com suporte completo a múltiplas páginas em formato A4.
 */
export async function generatePdfFromHtmlElement(
  element: HTMLElement,
  options?: { filename?: string; quality?: number }
): Promise<{ doc: jsPDF; blob: Blob; blobUrl: string; filename: string }> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  });

  const imgData = canvas.toDataURL("image/jpeg", options?.quality || 0.95);
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pdfWidth = 210;
  const pdfHeight = 297;
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;

  // Proporção de altura no PDF baseado na largura da folha A4
  const imgHeight = (canvasHeight * pdfWidth) / canvasWidth;

  let heightLeft = imgHeight;
  let position = 0;

  // Primeira página
  doc.addImage(imgData, "JPEG", 0, position, pdfWidth, imgHeight, undefined, "FAST");
  heightLeft -= pdfHeight;

  // Páginas subsequentes caso o conteúdo ultrapasse a primeira folha A4
  while (heightLeft > 0) {
    position = position - pdfHeight;
    doc.addPage();
    doc.addImage(imgData, "JPEG", 0, position, pdfWidth, imgHeight, undefined, "FAST");
    heightLeft -= pdfHeight;
  }

  const filename = options?.filename || `documento_ifpr_${new Date().toISOString().slice(0, 10)}.pdf`;
  const blob = doc.output("blob");
  const blobUrl = URL.createObjectURL(blob);

  return { doc, blob, blobUrl, filename };
}

/**
 * Função utilitária para renderizar e baixar o PDF via captura HTML/Canvas.
 */
export async function downloadPdfFromHtmlElement(
  element: HTMLElement,
  filename?: string
): Promise<void> {
  const { doc, filename: resolvedFilename } = await generatePdfFromHtmlElement(element, { filename });
  doc.save(resolvedFilename);
}

