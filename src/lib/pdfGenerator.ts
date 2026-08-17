import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { DocumentTemplate, DocumentField } from "../types";
import { generateDocumentPdf as generateVectorPdf, replaceDynamicTags } from "./documentPdfGenerator";

export interface PdfGenerationOptions {
  filename?: string;
  quality?: number;
  scale?: number;
  marginMm?: number;
}

/**
 * Extrai automaticamente todas as tags dinâmicas no formato {{nome_variavel}}
 * de todas as partes de um modelo de documento (cabeçalho, seções, títulos e assinaturas).
 */
export function extractDynamicTags(template: DocumentTemplate): string[] {
  const foundTags = new Set<string>();
  const tagRegex = /\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g;

  const scanText = (text?: string) => {
    if (!text) return;
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(text)) !== null) {
      if (match[1]) {
        foundTags.add(match[1]);
      }
    }
  };

  // Varrer cabeçalho e título
  scanText(template.title);
  scanText(template.headerText);
  scanText(template.footerText);

  // Varrer todas as seções
  (template.sections || []).forEach((sec) => {
    scanText(sec.title);
    scanText(sec.content);
  });

  // Varrer blocos de assinatura
  (template.signatures || []).forEach((sig) => {
    scanText(sig.title);
    scanText(sig.nameTag);
    scanText(sig.roleTag);
    scanText(sig.cpfOrDocTag);
  });

  // Adicionar campos declarados explicitamente no modelo
  (template.fields || []).forEach((f) => {
    if (f.name) foundTags.add(f.name);
  });

  return Array.from(foundTags);
}

/**
 * Gera a lista consolidada de campos de formulário dinâmico a partir das tags extraídas.
 * Se o campo já estiver configurado no modelo, preserva suas propriedades (label, type, required).
 * Se for uma nova tag encontrada no texto, gera automaticamente um campo amigável.
 */
export function buildDynamicFormFields(template: DocumentTemplate): DocumentField[] {
  const extractedTags = extractDynamicTags(template);
  const existingMap = new Map<string, DocumentField>();

  (template.fields || []).forEach((f) => {
    existingMap.set(f.name, f);
  });

  return extractedTags.map((tagName, index) => {
    if (existingMap.has(tagName)) {
      return existingMap.get(tagName)!;
    }

    // Formatar rótulo amigável a partir do nome_da_tag
    const friendlyLabel = tagName
      .replace(/[_-]/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());

    const isDate = tagName.toLowerCase().includes("data");
    const isLongText =
      tagName.toLowerCase().includes("descricao") ||
      tagName.toLowerCase().includes("motivo") ||
      tagName.toLowerCase().includes("observacao") ||
      tagName.toLowerCase().includes("conteudo");

    return {
      id: `auto_fld_${index}_${tagName}`,
      name: tagName,
      label: friendlyLabel,
      type: isLongText ? "textarea" : isDate ? "date" : "text",
      defaultValue: isDate
        ? new Intl.DateTimeFormat("pt-BR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          }).format(new Date())
        : "",
      placeholder: `Informe ${friendlyLabel.toLowerCase()}`,
      required: true,
      section: "Campos do Documento",
    };
  });
}

/**
 * Renderiza um elemento HTML de prévia de documento (como a folha A4)
 * em um arquivo PDF multipáginas oficial de alta fidelidade usando html2canvas e jsPDF.
 */
export async function renderDocumentToPdf(
  element: HTMLElement,
  options: PdfGenerationOptions = {}
): Promise<{ doc: jsPDF; blob: Blob; blobUrl: string; filename: string }> {
  const {
    filename = `documento_ifpr_${Date.now()}.pdf`,
    quality = 0.98,
    scale = 2,
  } = options;

  // Renderizar o nó DOM com alta resolução
  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    allowTaint: true,
    logging: false,
    backgroundColor: "#ffffff",
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
    imageTimeout: 15000,
  });

  const imgData = canvas.toDataURL("image/jpeg", quality);

  // Dimensões A4 padrão em milímetros
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pdfWidth = 210; // Largura folha A4
  const pdfHeight = 297; // Altura folha A4

  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;

  // Altura proporcional calculada
  const imgHeight = (canvasHeight * pdfWidth) / canvasWidth;

  let heightLeft = imgHeight;
  let position = 0;

  // Primeira página
  pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, imgHeight, undefined, "FAST");
  heightLeft -= pdfHeight;

  // Adicionar páginas subsequentes se a altura ultrapassar 1 folha A4
  while (heightLeft > 2) {
    position = position - pdfHeight;
    pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, imgHeight, undefined, "FAST");
    heightLeft -= pdfHeight;
  }

  const blob = pdf.output("blob");
  const blobUrl = URL.createObjectURL(blob);

  return { doc: pdf, blob, blobUrl, filename };
}

/**
 * Função direta para renderizar o elemento de prévia e disparar o download no navegador.
 */
export async function downloadDocumentFromElement(
  element: HTMLElement,
  filename?: string
): Promise<void> {
  const result = await renderDocumentToPdf(element, { filename });
  result.doc.save(result.filename);
}

// Re-exportações úteis
export { generateVectorPdf, replaceDynamicTags };
