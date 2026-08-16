import React, { useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { LostFoundItem } from "../types";
import { useApp } from "../context/AppContext";
import { usePossessionVerification } from "../hooks/usePossessionVerification";
import { formatDate, formatDateTime, triggerVibration, vibrateClick, vibrateSuccess, vibrateCritical, isItemNew, getItemAgeText } from "../lib/utils";
import { QRCodeSVG } from "qrcode.react";
import { RestrictedQRViewModal } from "./RestrictedQRViewModal";
import {
  X,
  MapPin,
  Calendar,
  Tag,
  ShieldCheck,
  User,
  QrCode,
  CheckCircle,
  AlertTriangle,
  Send,
  Download,
  Share2,
  Lock,
  MessageSquare,
  Building,
  Printer,
  FileCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  Copy,
  History,
  RotateCcw,
  PackageCheck,
  FileSpreadsheet,
  Eye,
  FileText,
  Sparkles,
} from "lucide-react";

interface ItemDetailModalProps {
  item: LostFoundItem;
  onClose: () => void;
}

export const ItemDetailModal: React.FC<ItemDetailModalProps> = ({ item, onClose }) => {
  const {
    currentUser,
    submitClaim,
    updateItemStatus,
    sendEmailViaGmail,
    addToast,
    comments,
    addCommentToItem,
    claims,
    registerItemReturn,
    reopenItemReturn,
    registerItemDestination,
    logItemLabelGenerated,
  } = useApp();
  const ownership = usePossessionVerification(item);

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [claimSecretPasswordInput, setClaimSecretPasswordInput] = useState("");
  const [claimBrandInput, setClaimBrandInput] = useState("");
  const [claimHiddenFeaturesInput, setClaimHiddenFeaturesInput] = useState("");
  const [isSubmittingClaim, setIsSubmittingClaim] = useState(false);

  // Devolution Registration Flow State
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnRecipientName, setReturnRecipientName] = useState("");
  const [returnRecipientEmail, setReturnRecipientEmail] = useState("");
  const [returnRecipientBond, setReturnRecipientBond] = useState<"Aluno" | "Servidor" | "Visitante" | "Terceirizado">("Aluno");
  const [returnIdentityConfirmed, setReturnIdentityConfirmed] = useState(false);
  const [returnObservations, setReturnObservations] = useState("");
  const [isRegisteringReturn, setIsRegisteringReturn] = useState(false);

  // Reopen Return Flow State
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [isReopeningReturn, setIsReopeningReturn] = useState(false);

  // Destination Flow State
  const [destinationModalOpen, setDestinationModalOpen] = useState(false);
  const [destinationType, setDestinationType] = useState<"DOACAO" | "DESCARTE" | "LEILAO_PROJETO" | "OUTRO">("DOACAO");
  const [destinationNotes, setDestinationNotes] = useState("");
  const [isRegisteringDestination, setIsRegisteringDestination] = useState(false);

  // Comments state
  const [newCommentText, setNewCommentText] = useState("");
  const [isPostingComment, setIsPostingComment] = useState(false);

  // Gmail send state
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState(item?.contactInfo || "localizamais6@gmail.com");
  const [emailSubject, setEmailSubject] = useState(`[IFPR Achados & Perdidos] Consulta: ${item?.title || "Item"}`);
  const [emailBody, setEmailBody] = useState(`Olá,\n\nEstou entrando em contato a respeito do item "${item?.title || "Item"}" (ID: ${item?.id || ""}) cadastrado no Achados e Perdidos do IFPR Campus Ivaiporã.\n\nAtenciosamente,\n${currentUser?.name || "Usuário IFPR"}`);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Restricted Public View QR Modal State
  const [showRestrictedQRView, setShowRestrictedQRView] = useState(false);

  // Consolidate Timeline History Logs
  const combinedHistoryLogs = [
    ...(item?.historyLogs || []),
    ...(item?.history || []).map((h: any) => ({
      id: h?.id || `h-${Math.random()}`,
      action: h?.action,
      actorId: h?.actorId || h?.userId || "system",
      actorName: h?.actorName || h?.userName || "Usuário IFPR",
      actorRole: h?.actorRole || h?.userRole || "SISTEMA",
      timestamp: h?.timestamp || new Date().toISOString(),
      details: h?.details,
    })),
  ];

  const timelineLogsMap = new Map();
  combinedHistoryLogs.forEach((log) => {
    if (log && log.id && !timelineLogsMap.has(log.id)) {
      timelineLogsMap.set(log.id, log);
    }
  });

  const sortedTimeline = Array.from(timelineLogsMap.values()).sort(
    (a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // Find associated approved claim for PDF receipt details
  const approvedClaim = claims.find((c) => c.itemId === item.id && (c.status === "APROVADO" || c.status === "CONCLUIDO"));

  // Helper to convert SVG QR code to image data URL for embedding in jsPDF
  const getQRCodeDataUrl = async (qrId: string): Promise<string | null> => {
    try {
      const qrSvg = document.getElementById(`qr-code-svg-${qrId}`) as unknown as SVGElement | null;
      if (!qrSvg) return null;
      const svgData = new XMLSerializer().serializeToString(qrSvg);
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);

      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = 240;
          canvas.height = 240;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, 240, 240);
            ctx.drawImage(img, 0, 0, 240, 240);
            const dataUrl = canvas.toDataURL("image/png");
            URL.revokeObjectURL(url);
            resolve(dataUrl);
          } else {
            URL.revokeObjectURL(url);
            resolve(null);
          }
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(null);
        };
        img.src = url;
      });
    } catch {
      return null;
    }
  };

  // Generate Official Printable Item Summary / Campus Report PDF using jsPDF
  const handleGenerateItemSummaryPDF = async () => {
    vibrateClick();
    try {
      const doc = new jsPDF("p", "mm", "a4");
      const safeId = String(item?.id ?? "ITEM").replace(/[^a-zA-Z0-9_-]/g, "").toUpperCase();
      const docReportCode = `LAUDO-IFPR-${safeId}-${Date.now().toString().slice(-4)}`;
      const emissionDate = new Date().toLocaleString("pt-BR");
      const safeTitle = item?.title || "Item sem Título";

      // 1. Institutional Top Banner (IFPR Emerald Green #00843D)
      doc.setFillColor(0, 132, 61);
      doc.rect(0, 0, 210, 24, "F");

      // Red Accent Line (IFPR Identity Red #C81E1E)
      doc.setFillColor(200, 30, 30);
      doc.rect(0, 24, 210, 2.5, "F");

      // Header Text
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("INSTITUTO FEDERAL DO PARANÁ - CAMPUS IVAIPORÃ", 14, 11);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text("SISTEMA OFICIAL DE ACHADOS E PERDIDOS • LAUDO INDIVIDUAL DE PERTENCE", 14, 18);

      // 2. Report Overview & Identification Metadata
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("FICHA CADASTRAL E LAUDO DE GESTÃO PATRIMONIAL", 14, 34);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(`Código do Laudo: ${docReportCode}`, 14, 40);
      doc.text(`Data de Emissão: ${emissionDate}`, 14, 45);
      doc.text(`Emitido por: ${currentUser?.name || "Usuário IFPR"} (${currentUser?.role || "USUÁRIO"} • ${currentUser?.email || "campus.ivaipora@ifpr.edu.br"})`, 14, 50);
      doc.text(`Código de Rastreamento QR: ${item?.qrCodeId || item?.id}`, 14, 55);

      // Status Badge inside document
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      let statusColor: [number, number, number] = [0, 132, 61];
      if (item.status === "PERDIDO") statusColor = [220, 38, 38];
      else if (item.status === "EM_ANALISE") statusColor = [217, 119, 6];
      else if (item.status === "DEVOLVIDO") statusColor = [37, 99, 235];

      doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
      doc.roundedRect(14, 58, 48, 6.5, 1.5, 1.5, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(`STATUS: ${String(item?.status || "REGISTRADO").replace("_", " ")}`, 16, 62.5);

      // Render QR Code onto the top-right corner if available
      try {
        const qrDataUrl = await getQRCodeDataUrl(item.id);
        if (qrDataUrl) {
          doc.setDrawColor(0, 132, 61);
          doc.setLineWidth(0.4);
          doc.roundedRect(165, 30, 31, 31, 1, 1, "D");
          doc.addImage(qrDataUrl, "PNG", 166, 31, 29, 29);
          doc.setFontSize(6.5);
          doc.setTextColor(0, 132, 61);
          doc.setFont("helvetica", "bold");
          doc.text("QR OFICIAL", 180.5, 64, { align: "center" });
        }
      } catch (e) {
        console.warn("QR code render in PDF skipped:", e);
      }

      // 3. Section 1 Table: Dados Cadastrais do Objeto
      const generalDataRows = [
        ["ID da Ocorrência:", item.id, "Tipo do Registro:", item.type === "PERDIDO" ? "Perdido (Procura-se)" : "Encontrado (No Acervo)"],
        ["Título / Denominação:", safeTitle, "Categoria:", item.category || "Outros"],
        ["Local da Ocorrência:", item.location || "Campus IFPR", "Data do Registro / Entrada:", formatDate(item.date)],
        ["Cor Predominante:", item.color || "Não especificada", "Marca / Fabricante:", item.brand || "Não identificada"],
        ["Cadastrado por:", `${item.registeredByName || "Usuário IFPR"} (${item.registeredByRole || "IFPR"})`, "Validação de Posse (RNF04):", item.secretVerificationKey || item.secretVerificationHint ? "Chave Secreta Configurada (Ativa)" : "Verificação Convencional"],
        ["Setor de Custódia / Contato:", item.contactInfo || "Guarita Principal / SEBAC Campus Ivaiporã", "Código de Etiqueta QR:", item.qrCodeId || item.id],
      ];

      autoTable(doc, {
        startY: 68,
        head: [["1. DADOS DE IDENTIFICAÇÃO E CARACTERÍSTICAS", "", "", ""]],
        body: generalDataRows,
        theme: "grid",
        headStyles: {
          fillColor: [0, 132, 61],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 8.5,
        },
        styles: {
          fontSize: 7.5,
          cellPadding: 2,
          textColor: [30, 41, 59],
        },
        columnStyles: {
          0: { fontStyle: "bold", cellWidth: 42, fillColor: [248, 250, 252] },
          1: { cellWidth: 60 },
          2: { fontStyle: "bold", cellWidth: 42, fillColor: [248, 250, 252] },
          3: { cellWidth: "auto" },
        },
      });

      let currentY = (doc as any).lastAutoTable.finalY + 5;

      // 4. Section 2: Descrição Detalhada
      autoTable(doc, {
        startY: currentY,
        head: [["2. DESCRIÇÃO DETALHADA E CARACTERÍSTICAS VISUAIS"]],
        body: [[item.description || "Nenhuma observação descritiva complementar informada no momento do registro."]],
        theme: "grid",
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 8.5,
        },
        styles: {
          fontSize: 7.5,
          cellPadding: 3,
          textColor: [51, 65, 85],
        },
      });

      currentY = (doc as any).lastAutoTable.finalY + 5;

      // 5. Section 3: Histórico de Tramitação e Auditoria
      const timelineRows = (sortedTimeline.length > 0 ? sortedTimeline : [
        {
          timestamp: item.date,
          action: "Registro do Objeto no Sistema",
          actorName: item.registeredByName || "Sistema",
          actorRole: "AUTOR",
          details: "Objeto inserido no banco de dados oficial de Achados & Perdidos.",
        },
      ]).slice(0, 10).map((log: any) => [
        formatDateTime(log.timestamp),
        log.action || "Registro",
        `${log.actorName || log.userName || "Usuário"} (${log.actorRole || log.userRole || "IFPR"})`,
        log.details || "-",
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [["Data / Hora", "Ação Registrada", "Responsável", "Detalhes da Tramitação"]],
        body: timelineRows,
        theme: "striped",
        headStyles: {
          fillColor: [79, 70, 229], // Indigo #4F46E5
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 8,
        },
        styles: {
          fontSize: 7,
          cellPadding: 2,
        },
        columnStyles: {
          0: { cellWidth: 32 },
          1: { cellWidth: 42, fontStyle: "bold" },
          2: { cellWidth: 45 },
          3: { cellWidth: "auto" },
        },
      });

      currentY = (doc as any).lastAutoTable.finalY + 5;

      // Check if we need a new page for restitution/closure or signatures
      if (currentY > 230) {
        doc.addPage();
        currentY = 20;
      }

      // 6. Section 4: Informações de Restituição / Reivindicação (se houver)
      if (approvedClaim || item.status === "DEVOLVIDO") {
        const claimerName = approvedClaim ? approvedClaim.claimerName : (item.registeredByName || "Proprietário Identificado");
        const claimerEmail = approvedClaim ? approvedClaim.claimerEmail : (currentUser?.email || "E-mail Registrado");

        autoTable(doc, {
          startY: currentY,
          head: [["4. DADOS DA RESTITUIÇÃO E ENCERRAMENTO"]],
          body: [
            [`Proprietário / Recebedor: ${claimerName} (${claimerEmail})\nData de Encerramento: ${item.resolutionDate ? formatDateTime(item.resolutionDate) : emissionDate}\nComprovação Registrada: ${approvedClaim?.verificationAnswer || "Conferência presencial realizada na guarita / SEBAC com documento oficial."}`],
          ],
          theme: "grid",
          headStyles: {
            fillColor: [37, 99, 235], // Blue #2563EB
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 8.5,
          },
          styles: {
            fontSize: 7.5,
            cellPadding: 2.5,
          },
        });

        currentY = (doc as any).lastAutoTable.finalY + 8;
      }

      // Ensure space for signature lines (~35mm)
      if (currentY > 240) {
        doc.addPage();
        currentY = 20;
      }

      // 7. Termo de Autenticidade & Assinaturas Oficiais
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(100, 116, 139);
      doc.text(
        "Declaro para os devidos fins institucionais e regulamentares que as informações acima transcritas correspondem fielmente aos registros oficiais do Sistema de Achados e Perdidos do IFPR Campus Ivaiporã.",
        14,
        currentY,
        { maxWidth: 182 }
      );

      currentY += 15;

      // Signature lines
      doc.setDrawColor(30, 41, 59);
      doc.setLineWidth(0.5);

      // Left Signature: Responsável SEBAC / Guarita
      doc.line(18, currentY, 92, currentY);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);
      doc.text("Servidor Responsável (SEBAC / Portaria)", 55, currentY + 4, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text("IFPR Campus Ivaiporã", 55, currentY + 7.5, { align: "center" });

      // Right Signature: Proprietário / Requerente
      doc.line(118, currentY, 192, currentY);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);
      doc.text("Proprietário / Requerente do Pertence", 155, currentY + 4, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text("Assinatura e Documento", 155, currentY + 7.5, { align: "center" });

      // 8. Footer on All Pages with Page Numbers & Institutional Watermark
      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(6.5);
        doc.setTextColor(148, 163, 184);
        doc.setDrawColor(226, 232, 240);
        doc.line(14, 286, 196, 286);
        doc.text(
          `IFPR Campus Ivaiporã • Sistema de Gestão de Achados e Perdidos • Laudo ${docReportCode} • Página ${i} de ${totalPages}`,
          14,
          290
        );
        doc.text(
          `Emitido em ${emissionDate}`,
          196,
          290,
          { align: "right" }
        );
      }

      // Save PDF to user device
      const fileName = `Laudo_Oficial_IFPR_${safeId}_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(fileName);

      // Also open printable blob preview in browser
      try {
        const pdfBlob = doc.output("blob");
        const blobUrl = URL.createObjectURL(pdfBlob);
        const printWindow = window.open(blobUrl, "_blank");
        if (printWindow) {
          setTimeout(() => {
            try {
              printWindow.print();
            } catch (_) {}
          }, 800);
        }
      } catch (_) {}

      vibrateSuccess();
      addToast("Relatório oficial PDF gerado e baixado com sucesso!", "success");
    } catch (error: any) {
      console.error("Erro ao gerar relatório oficial PDF:", error);
      addToast("Erro ao gerar relatório em PDF. Tente novamente.", "error");
    }
  };

  // Generate and Print PDF Receipt
  const handlePrintReceiptPDF = () => {
    const printWindow = window.open("", "_blank", "width=750,height=900");
    if (!printWindow) {
      addToast("Permita pop-ups no seu navegador para gerar o recibo PDF em tela cheia.", "error");
      return;
    }

    const claimerName = approvedClaim ? approvedClaim.claimerName : (item.registeredByName || currentUser.name);
    const claimerEmail = approvedClaim ? approvedClaim.claimerEmail : (currentUser.email);
    const safeId = String(item?.id ?? "ITEM").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    const receiptCode = `REC-IFPR-${safeId}-${Date.now().toString().slice(-4)}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Comprovante de Devolução IFPR - ${item.id}</title>
          <style>
            @media print {
              body { margin: 0; padding: 20px; background: white; }
              .no-print { display: none !important; }
            }
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 32px; background: #f8fafc; color: #0f172a; line-height: 1.5; }
            .receipt-box { max-width: 650px; margin: 0 auto; background: white; border: 2px solid #00843D; border-radius: 16px; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.08); position: relative; }
            .watermark { position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 64px; font-weight: 900; color: rgba(0, 132, 61, 0.05); pointer-events: none; text-transform: uppercase; white-space: nowrap; }
            .header { text-align: center; border-bottom: 2px solid #00843D; padding-bottom: 16px; margin-bottom: 24px; }
            .header img { height: 50px; margin-bottom: 8px; }
            .header h1 { font-size: 18px; color: #00843D; margin: 0; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; }
            .header p { font-size: 12px; color: #475569; margin: 4px 0 0 0; font-weight: 600; }
            .title-badge { display: inline-block; background: #00843D; color: white; padding: 6px 16px; border-radius: 20px; font-weight: bold; font-size: 13px; margin-top: 12px; text-transform: uppercase; }
            .receipt-id { text-align: right; font-size: 11px; font-family: monospace; color: #64748b; margin-bottom: 16px; }
            .section-title { font-size: 12px; font-weight: 800; color: #00843D; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin: 20px 0 10px 0; }
            .data-grid { width: 100%; border-collapse: collapse; font-size: 12px; }
            .data-grid td { padding: 8px 6px; border-bottom: 1px solid #f1f5f9; }
            .data-grid td.label { font-weight: bold; color: #475569; width: 35%; }
            .data-grid td.value { color: #0f172a; font-weight: 600; }
            .signatures { margin-top: 48px; display: flex; justify-content: space-between; gap: 32px; }
            .sig-line { flex: 1; text-align: center; border-top: 1px solid #0f172a; padding-top: 8px; font-size: 11px; font-weight: bold; color: #334155; }
            .footer { text-align: center; font-size: 10px; color: #94a3b8; margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
            .btn-print { display: block; width: 100%; max-width: 650px; margin: 20px auto 0 auto; padding: 14px; background: #00843D; color: white; border: none; border-radius: 12px; font-weight: bold; font-size: 14px; cursor: pointer; text-align: center; }
          </style>
        </head>
        <body>
          <div class="receipt-box">
            <div class="watermark">IFPR IVAIPORÃ</div>
            <div class="header">
              <h1>Instituto Federal do Paraná</h1>
              <p>Campus Ivaiporã • Seção de Apoio ao Estudante (SEBAC)</p>
              <div class="title-badge">Recibo Oficial de Devolução de Pertence</div>
            </div>

            <div class="receipt-id">
              Código de Validação: <strong>${receiptCode}</strong><br/>
              Data de Emissão: <strong>${formatDateTime(new Date().toISOString())}</strong>
            </div>

            <div class="section-title">1. Dados do Objeto Entregue</div>
            <table class="data-grid">
              <tr><td class="label">ID da Ocorrência:</td><td class="value">${item.id}</td></tr>
              <tr><td class="label">Título / Descrição:</td><td class="value">${item.title}</td></tr>
              <tr><td class="label">Categoria / Tipo:</td><td class="value">${item.category} (${item.type})</td></tr>
              <tr><td class="label">Local onde foi Encontrado:</td><td class="value">${item.location}</td></tr>
              <tr><td class="label">Cor / Marca:</td><td class="value">${item.color || 'N/I'} • ${item.brand || 'N/I'}</td></tr>
              <tr><td class="label">Código de Rastreamento QR:</td><td class="value" style="font-family: monospace; color: #00843D;">${item.qrCodeId}</td></tr>
            </table>

            <div class="section-title">2. Dados do Proprietário / Recebedor</div>
            <table class="data-grid">
              <tr><td class="label">Nome Completo:</td><td class="value">${claimerName}</td></tr>
              <tr><td class="label">E-mail Institucional:</td><td class="value">${claimerEmail}</td></tr>
              <tr><td class="label">Vínculo com o IFPR:</td><td class="value">${currentUser.role} - Campus Ivaiporã</td></tr>
              <tr><td class="label">Comprovação Apresentada:</td><td class="value">${approvedClaim?.verificationAnswer || 'Conferência presencial efetuada na guarita do campus com documento.'}</td></tr>
            </table>

            <div class="signatures">
              <div class="sig-line">
                ${claimerName}<br/>
                <span style="font-weight: normal; font-size: 10px; color: #64748b;">Assinatura do Recebedor</span>
              </div>
              <div class="sig-line">
                Servidor Responsável SEBAC / Portaria<br/>
                <span style="font-weight: normal; font-size: 10px; color: #64748b;">IFPR Campus Ivaiporã</span>
              </div>
            </div>

            <div class="footer">
              Este recibo comprova a restituição legal do pertence registrado no Sistema de Achados & Perdidos do IFPR Campus Ivaiporã.
            </div>
          </div>

          <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir / Salvar Recibo PDF</button>

          <script>
            window.onload = function() {
              setTimeout(function() { window.print(); }, 500);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // Download high-resolution QR Code PNG for tracking and identification
  const handleDownloadQRCodePNG = () => {
    vibrateClick();
    try {
      const qrSvg = document.getElementById(`qr-code-svg-${item.id}`) as unknown as SVGElement | null;
      if (!qrSvg) {
        addToast("Código QR não encontrado no documento.", "error");
        return;
      }

      const svgData = new XMLSerializer().serializeToString(qrSvg);
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 600;
        canvas.height = 700;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          // White Background
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Top Header Banner
          ctx.fillStyle = "#00843D";
          ctx.fillRect(0, 0, canvas.width, 16);

          ctx.font = "bold 26px sans-serif";
          ctx.fillStyle = "#0F172A";
          ctx.textAlign = "center";
          ctx.fillText("IFPR CAMPUS IVAIPORÃ", canvas.width / 2, 60);

          ctx.font = "bold 18px sans-serif";
          ctx.fillStyle = "#00843D";
          ctx.fillText("SISTEMA DE ACHADOS E PERDIDOS", canvas.width / 2, 90);

          // Draw QR Code Image
          const qrSize = 340;
          ctx.drawImage(img, (canvas.width - qrSize) / 2, 115, qrSize, qrSize);

          // Item Title
          ctx.font = "bold 22px sans-serif";
          ctx.fillStyle = "#1E293B";
          const cleanTitle = item.title.length > 32 ? item.title.substring(0, 29) + "..." : item.title;
          ctx.fillText(cleanTitle, canvas.width / 2, 500);

          // QR Code ID Tag
          ctx.font = "bold 18px monospace";
          ctx.fillStyle = "#00843D";
          ctx.fillText(`CÓDIGO: ${item.qrCodeId}`, canvas.width / 2, 535);

          // Location & Date Info
          ctx.font = "16px sans-serif";
          ctx.fillStyle = "#475569";
          ctx.fillText(`Local: ${item.location} • Data: ${formatDate(item.date)}`, canvas.width / 2, 570);

          // Category & Type Badge Info
          ctx.font = "14px sans-serif";
          ctx.fillStyle = "#64748B";
          ctx.fillText(`Categoria: ${item.category} (${item.type})`, canvas.width / 2, 600);

          // Footer Guidance
          ctx.fillStyle = "#F8FAFC";
          ctx.fillRect(20, 630, canvas.width - 40, 50);
          ctx.font = "13px sans-serif";
          ctx.fillStyle = "#334155";
          ctx.fillText("Apresente na guarita / SEBAC para identificação e devolução.", canvas.width / 2, 660);

          const pngUrl = canvas.toDataURL("image/png");
          const downloadLink = document.createElement("a");
          downloadLink.href = pngUrl;
          downloadLink.download = `qrcode_${item.qrCodeId || item.id}.png`;
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
          URL.revokeObjectURL(url);

          vibrateSuccess();
          addToast("QR Code baixado em formato PNG de alta resolução!", "success");
        }
      };
      img.src = url;
    } catch (err) {
      console.error("Erro ao fazer download do QR Code:", err);
      addToast("Erro ao exportar imagem do QR Code.", "error");
    }
  };

  // Web Share API Implementation for native sharing (WhatsApp, Email, Telegram, System Share Sheet)
  const handleShareItem = async () => {
    vibrateClick();
    const typeLabel = item.type === "PERDIDO" ? "Objeto Perdido" : "Objeto Encontrado";
    const shareTitle = `[IFPR Achados e Perdidos] ${typeLabel}: ${item.title}`;
    const shareText = `Campus Ivaiporã • ${typeLabel}: "${item.title}" (${item.category})\nLocal: ${item.location}\nData: ${formatDate(item.date)}\nStatus: ${String(item.status).replace("_", " ")}\n\nConsulte o item no Localiza+ IFPR:`;
    const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/?tab=${item.type === "PERDIDO" ? "lost" : "found"}&itemId=${encodeURIComponent(item.id)}` : "";

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        vibrateSuccess();
        addToast("Detalhes do item compartilhados com sucesso!", "success");
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.warn("Aviso ao acionar Web Share API:", err);
          copyToClipboardFallback(shareTitle, shareText, shareUrl);
        }
      }
    } else {
      copyToClipboardFallback(shareTitle, shareText, shareUrl);
    }
  };

  const copyToClipboardFallback = (title: string, text: string, url: string) => {
    const fullText = `${title}\n\n${text}\n${url}`;
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(fullText)
        .then(() => {
          vibrateSuccess();
          addToast("Link e informações do objeto copiados! Você já pode colar no WhatsApp ou E-mail.", "info");
        })
        .catch(() => {
          addToast(`Link do item: ${url}`, "info");
        });
    } else {
      addToast(`Link do item: ${url}`, "info");
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    setIsPostingComment(true);
    await addCommentToItem(item.id, newCommentText.trim());
    setNewCommentText("");
    setIsPostingComment(false);
  };

  // Handle Submit Devolution Registration
  const handleRegisterReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnRecipientName || !returnRecipientEmail || !returnIdentityConfirmed) {
      addToast("Preencha os dados do receptor e confirme a verificação do documento com foto.", "error");
      return;
    }

    setIsRegisteringReturn(true);
    try {
      await registerItemReturn(item.id, {
        recipientName: returnRecipientName,
        recipientEmail: returnRecipientEmail,
        recipientBond: returnRecipientBond,
        identityVerified: returnIdentityConfirmed,
        observations: returnObservations,
      });

      addToast(`Devolução do objeto "${item.title}" foi registrada com sucesso!`, "success");
      setReturnModalOpen(false);
      handlePrintReceiptPDF();
      onClose();
    } catch (err) {
      console.error(err);
      addToast("Erro ao registrar devolução do objeto.", "error");
    } finally {
      setIsRegisteringReturn(false);
    }
  };

  // Handle Submit Reopen Return (Admin Only)
  const handleReopenReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenReason.trim()) {
      addToast("Por favor, preencha a justificativa para a reabertura.", "error");
      return;
    }

    setIsReopeningReturn(true);
    try {
      await reopenItemReturn(item.id, reopenReason.trim());
      addToast(`A devolução do item "${item.title}" foi reaberta. Ocorrência ativa novamente.`, "success");
      setReopenModalOpen(false);
      onClose();
    } catch (err) {
      console.error(err);
      addToast("Erro ao reabrir a devolução.", "error");
    } finally {
      setIsReopeningReturn(false);
    }
  };

  // Handle Submit Destination (Unclaimed Items)
  const handleDestinationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destinationNotes.trim()) {
      addToast("Informe a justificativa/destinatário da destinação.", "error");
      return;
    }

    setIsRegisteringDestination(true);
    try {
      await registerItemDestination(item.id, destinationType, destinationNotes.trim());
      addToast(`Destinação do objeto (${destinationType}) registrada com sucesso. Item encerrado.`, "success");
      setDestinationModalOpen(false);
      onClose();
    } catch (err) {
      console.error(err);
      addToast("Erro ao registrar a destinação do item.", "error");
    } finally {
      setIsRegisteringDestination(false);
    }
  };

  const itemComments = comments.filter((c) => c.itemId === item.id);

  const handlePrintQRTag = () => {
    const printWindow = window.open("", "_blank", "width=700,height=800");
    if (!printWindow) {
      addToast("Permita pop-ups no navegador para visualizar e imprimir a etiqueta em PDF.", "error");
      return;
    }
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Etiqueta IFPR - ${item.id}</title>
          <style>
            @media print {
              body { margin: 0; padding: 10px; background: white; }
              .no-print { display: none; }
            }
            body { font-family: system-ui, -apple-system, sans-serif; padding: 24px; background: #f8fafc; color: #0f172a; }
            .tag-card { max-width: 440px; margin: 0 auto; background: white; border: 2px dashed #00843D; border-radius: 16px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
            .header { text-align: center; border-bottom: 2px solid #00843D; padding-bottom: 12px; margin-bottom: 16px; }
            .header h1 { font-size: 16px; color: #00843D; margin: 0; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
            .header p { font-size: 12px; color: #64748b; margin: 4px 0 0 0; font-weight: 600; }
            .qr-box { text-align: center; margin: 16px 0; padding: 16px; background: #f1f5f9; border-radius: 12px; border: 1px solid #e2e8f0; }
            .qr-code-img { width: 140px; height: 140px; margin: 0 auto; }
            .qr-id { font-family: monospace; font-size: 13px; font-weight: bold; margin-top: 8px; color: #00843D; }
            .info-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; }
            .info-table td { padding: 6px 4px; border-bottom: 1px solid #e2e8f0; }
            .info-table td.label { font-weight: bold; color: #475569; width: 38%; }
            .footer { text-align: center; font-size: 10px; color: #94a3b8; margin-top: 16px; padding-top: 8px; border-top: 1px solid #e2e8f0; }
            .btn-print { display: block; width: 100%; max-width: 440px; margin: 16px auto 0 auto; padding: 12px; background: #00843D; color: white; border: none; border-radius: 12px; font-weight: bold; cursor: pointer; text-align: center; }
          </style>
        </head>
        <body>
          <div class="tag-card">
            <div class="header">
              <h1>IFPR Campus Ivaiporã</h1>
              <p>Achados e Perdidos • Etiqueta de Identificação</p>
            </div>
            <div class="qr-box">
              <img class="qr-code-img" src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(item.qrCodeId)}" alt="QR Code" />
              <div class="qr-id">${item.qrCodeId}</div>
            </div>
            <table class="info-table">
              <tr><td class="label">ID da Ocorrência:</td><td><strong>${item.id}</strong></td></tr>
              <tr><td class="label">Título do Item:</td><td><strong>${item.title}</strong></td></tr>
              <tr><td class="label">Categoria / Tipo:</td><td>${item.category} (${item.type})</td></tr>
              <tr><td class="label">Local Encontrado:</td><td>${item.location}</td></tr>
              <tr><td class="label">Data de Entrada:</td><td>${formatDate(item.date)}</td></tr>
              <tr><td class="label">Cor / Marca:</td><td>${item.color || 'N/I'} • ${item.brand || 'N/I'}</td></tr>
              <tr><td class="label">Atendimento:</td><td>Guarita Principal / SEBAC Campus Ivaiporã</td></tr>
            </table>
            <div class="footer">
              Sistema Oficial de Gestão de Achados e Perdidos • IFPR Campus Ivaiporã
            </div>
          </div>
          <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir / Salvar como PDF</button>
          <script>
            window.onload = function() {
              setTimeout(function() { window.print(); }, 500);
            };
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleSendEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientEmail || !emailSubject || !emailBody) {
      addToast("Preencha todos os campos do e-mail.", "error");
      return;
    }
    setIsSendingEmail(true);
    try {
      await sendEmailViaGmail(
        recipientEmail,
        emailSubject,
        `<div style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 12px; padding: 24px;">
          <div style="background-color: #00843D; color: white; padding: 12px 20px; border-radius: 8px; font-weight: bold; font-size: 16px;">
            IFPR Campus Ivaiporã • Achados & Perdidos
          </div>
          <h3 style="color: #00843D; margin-top: 20px;">${emailSubject}</h3>
          <p style="white-space: pre-wrap; color: #444;">${emailBody}</p>
          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #888;">
            Item ID: <strong>${item.id}</strong> | Local: <strong>${item.location}</strong><br/>
            Enviado via Integração Oficial do Gmail do IFPR.
          </div>
        </div>`
      );
      setEmailModalOpen(false);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const allImages = [item.imageUrl, ...(item.additionalImages || [])];

  const handleClaimSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isVerified = ownership.verifyPossession(
      claimSecretPasswordInput,
      claimBrandInput,
      claimHiddenFeaturesInput
    );
    if (!isVerified) {
      if (ownership.errorMessage) {
        addToast(ownership.errorMessage, "error");
      }
      return;
    }

    setIsSubmittingClaim(true);
    const fullProofAnswer = `[RNF04 Validação de Posse] Senha/Série: ${claimSecretPasswordInput.trim() || 'N/A'} | Marca: ${claimBrandInput.trim() || 'N/A'} | Detalhes: ${claimHiddenFeaturesInput.trim() || 'N/A'} | Token: ${ownership.verificationToken} | Precisão: ${ownership.score}%`;

    setTimeout(() => {
      submitClaim(item.id, fullProofAnswer);
      setIsSubmittingClaim(false);
      setClaimModalOpen(false);
      addToast(`Solicitação registrada com sucesso! Validação de Posse RNF04: ${ownership.score}% de precisão.`, "success");
      onClose();
    }, 600);
  };

  const handleMarkAsReturned = () => {
    updateItemStatus(item.id, "DEVOLVIDO");
    addToast(`Objeto "${item.title}" marcado como Devolvido com sucesso!`, "success");
    onClose();
  };

  const getStatusBadgeClass = (status: LostFoundItem["status"]) => {
    switch (status) {
      case "PERDIDO":
        return "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30";
      case "ENCONTRADO":
        return "bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30";
      case "EM_ANALISE":
        return "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30";
      case "DEVOLVIDO":
        return "bg-[#3B82F6]/10 text-[#3B82F6] border-[#3B82F6]/30";
    }
  };

  // Progress Tracker Step States
  const step1Done = true; // Reported/Registered
  const step2Done = item.status === "EM_ANALISE" || item.status === "DEVOLVIDO" || claims.some((c) => c.itemId === item.id);
  const step3Done = item.status === "DEVOLVIDO";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto"
    >
      <div
        className="relative w-full max-w-4xl bg-white dark:bg-[#1E1E1E] rounded-3xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#181818]">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${getStatusBadgeClass(
                item?.status || "PERDIDO"
              )}`}
            >
              {String(item?.status || "REGISTRADO").replace("_", " ")}
            </span>
            {isItemNew(item) && (
              <span
                id={`detail-new-badge-${item.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-gradient-to-r from-emerald-600 to-[#00843D] text-white border border-emerald-400/60 shadow-sm animate-pulse"
                title="Cadastrado nas últimas 24 horas no campus"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                <span>Item Novo • 24h</span>
              </span>
            )}
            <span className="text-xs text-neutral-500 font-mono">ID: {item.id}</span>
          </div>

          <div className="flex items-center space-x-2">
            {/* Printable PDF Campus Summary Report Button */}
            <button
              onClick={() => {
                vibrateClick();
                handleGenerateItemSummaryPDF();
              }}
              role="button"
              aria-label="Gerar Laudo e Relatório Oficial em PDF deste Item"
              className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-[#00843D] hover:text-white border border-[#00843D]/30 text-[#00843D] dark:text-green-400 font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Gerar Laudo / Relatório Oficial em PDF (jsPDF)"
            >
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Relatório PDF</span>
            </button>

            {/* Share Button (Web Share API) */}
            <button
              onClick={() => {
                vibrateClick();
                handleShareItem();
              }}
              role="button"
              aria-label="Compartilhar link deste item"
              className="px-3 py-1.5 rounded-xl bg-neutral-200 dark:bg-neutral-800 hover:bg-[#00843D] hover:text-white text-neutral-700 dark:text-neutral-200 font-bold text-xs transition-all flex items-center gap-1.5"
              title="Compartilhar Link do Item"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Compartilhar</span>
            </button>

            <button
              onClick={() => {
                vibrateClick();
                onClose();
              }}
              role="button"
              aria-label="Fechar detalhes do item"
              className="p-2 rounded-full text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Main Body */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 max-h-[75vh] overflow-y-auto">
          {/* Left Column: Image Gallery & QR Code */}
          <div className="space-y-4">
            <div className="relative h-64 sm:h-80 w-full rounded-2xl bg-neutral-100 dark:bg-neutral-800 overflow-hidden border border-neutral-200 dark:border-neutral-800">
              <img
                src={allImages[activeImageIndex]}
                alt={item.title}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Thumbnails if multiple */}
            {allImages.length > 1 && (
              <div className="flex space-x-2">
                {allImages.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImageIndex(idx)}
                    className={`w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                      activeImageIndex === idx
                        ? "border-[#00843D] scale-105"
                        : "border-transparent opacity-60 hover:opacity-100"
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Visual Journey Progress Tracker */}
            <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700/60 space-y-3">
              <h4 className="text-xs font-bold text-neutral-900 dark:text-white flex items-center gap-1.5 uppercase tracking-wider">
                <Clock className="w-4 h-4 text-[#00843D]" /> Jornada de Tramitação do Objeto
              </h4>

              <div className="relative flex items-center justify-between pt-2 px-2">
                {/* Connecting Line */}
                <div className="absolute top-6 left-8 right-8 h-1 bg-neutral-200 dark:bg-neutral-700 -z-0">
                  <div
                    className="h-full bg-[#00843D] transition-all duration-500"
                    style={{
                      width: step3Done ? "100%" : step2Done ? "50%" : "0%",
                    }}
                  />
                </div>

                {/* Step 1: Reported */}
                <div className="relative z-10 flex flex-col items-center text-center space-y-1">
                  <div className="w-9 h-9 rounded-full bg-[#00843D] text-white flex items-center justify-center font-bold text-xs shadow-md">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <span className="font-extrabold text-[11px] text-neutral-900 dark:text-white">
                    Registrado
                  </span>
                  <span className="text-[9px] text-neutral-500">{formatDate(item.date)}</span>
                </div>

                {/* Step 2: Under Review */}
                <div className="relative z-10 flex flex-col items-center text-center space-y-1">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shadow-md transition-colors ${
                      step2Done
                        ? "bg-[#00843D] text-white"
                        : "bg-neutral-200 dark:bg-neutral-700 text-neutral-500"
                    }`}
                  >
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <span className={`font-extrabold text-[11px] ${step2Done ? "text-neutral-900 dark:text-white" : "text-neutral-400"}`}>
                    Em Análise
                  </span>
                  <span className="text-[9px] text-neutral-500">Validação SEBAC</span>
                </div>

                {/* Step 3: Returned */}
                <div className="relative z-10 flex flex-col items-center text-center space-y-1">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shadow-md transition-colors ${
                      step3Done
                        ? "bg-blue-600 text-white"
                        : "bg-neutral-200 dark:bg-neutral-700 text-neutral-500"
                    }`}
                  >
                    <FileCheck className="w-5 h-5" />
                  </div>
                  <span className={`font-extrabold text-[11px] ${step3Done ? "text-blue-600 dark:text-blue-400" : "text-neutral-400"}`}>
                    Devolvido
                  </span>
                  <span className="text-[9px] text-neutral-500">
                    {item.resolutionDate ? formatDate(item.resolutionDate) : "Finalizado"}
                  </span>
                </div>
              </div>
            </div>

            {/* QR Code Container */}
            <div className="p-4 rounded-2xl bg-[#00843D]/5 dark:bg-[#00843D]/10 border border-[#00843D]/20 space-y-3">
              <div className="flex items-center space-x-4">
                <div className="p-2 bg-white rounded-xl shadow-xs shrink-0">
                  <QRCodeSVG id={`qr-code-svg-${item.id}`} value={item.qrCodeId} size={72} level="H" />
                </div>
                <div>
                  <h5 className="font-bold text-xs text-neutral-900 dark:text-white flex items-center gap-1">
                    <QrCode className="w-3.5 h-3.5 text-[#00843D]" /> Código Etiqueta QR
                  </h5>
                  <p className="text-[11px] text-neutral-600 dark:text-neutral-300 font-mono mt-0.5">
                    {item.qrCodeId}
                  </p>
                  <p className="text-[10px] text-neutral-500 mt-1">
                    Apresente este código no balcão de Achados e Perdidos do IFPR para liberação.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                <button
                  type="button"
                  onClick={handleDownloadQRCodePNG}
                  className="w-full py-2 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all flex items-center justify-center space-x-1 shadow-xs cursor-pointer"
                  title="Baixar imagem PNG do QR Code em alta resolução"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar PNG</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowRestrictedQRView(true)}
                  className="w-full py-2 px-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs transition-all flex items-center justify-center space-x-1 shadow-xs cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Modo QR</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintQRTag}
                  className="w-full py-2 px-2 rounded-xl bg-white dark:bg-neutral-800 border border-[#00843D]/30 text-[#00843D] dark:text-green-400 font-bold text-xs hover:bg-[#00843D] hover:text-white transition-all flex items-center justify-center space-x-1 shadow-xs cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Etiqueta</span>
                </button>

                {/* Generate jsPDF Campus Summary Report Button */}
                <button
                  type="button"
                  onClick={handleGenerateItemSummaryPDF}
                  className="w-full py-2 px-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs transition-all flex items-center justify-center space-x-1 shadow-xs cursor-pointer"
                  title="Gerar Ficha / Relatório Oficial do Campus em PDF (jsPDF)"
                >
                  <FileText className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Laudo PDF</span>
                </button>

                {/* Generate PDF Receipt Button */}
                <button
                  type="button"
                  onClick={handlePrintReceiptPDF}
                  className="w-full py-2 px-2 rounded-xl bg-[#00843D] text-white font-bold text-xs hover:bg-[#006e33] transition-all flex items-center justify-center space-x-1 shadow-xs cursor-pointer"
                  title="Recibo de Devolução Individual"
                >
                  <FileCheck className="w-3.5 h-3.5" />
                  <span>Recibo PDF</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Information & Actions */}
          <div className="space-y-5">
            <div>
              <div className="flex items-center space-x-2 text-xs font-bold text-[#00843D] dark:text-green-400 mb-1">
                <Tag className="w-3.5 h-3.5" />
                <span>{item.category}</span>
                <span>•</span>
                <span>{item.type}</span>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white">
                {item.title}
              </h2>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800">
                <span className="text-neutral-400 block mb-0.5">Cor Predominante</span>
                <span className="font-bold text-neutral-900 dark:text-white">{item.color || "N/I"}</span>
              </div>
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800">
                <span className="text-neutral-400 block mb-0.5">Marca / Fabricante</span>
                <span className="font-bold text-neutral-900 dark:text-white">{item.brand || "N/I"}</span>
              </div>
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800">
                <span className="text-neutral-400 block mb-0.5">Data do Registro</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-neutral-900 dark:text-white">{formatDate(item.date)}</span>
                  {item.createdAt && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                      ({getItemAgeText(item.createdAt)})
                    </span>
                  )}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800">
                <span className="text-neutral-400 block mb-0.5">Cadastrado por</span>
                <span className="font-bold text-neutral-900 dark:text-white truncate block">
                  {item.registeredByName}
                </span>
              </div>
            </div>

            {/* Description Box */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                Descrição Detalhada
              </h4>
              <p className="text-xs sm:text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed bg-neutral-50 dark:bg-neutral-800/80 p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-700">
                {item.description}
              </p>
            </div>

            {/* Contact / Delivery instructions */}
            <div className="p-3.5 rounded-xl bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/20 space-y-1">
              <div className="flex items-center space-x-2 text-xs font-bold text-blue-600 dark:text-blue-400">
                <Building className="w-4 h-4" />
                <span>Instruções de Retirada / Contato</span>
              </div>
              <p className="text-xs text-neutral-600 dark:text-neutral-300">
                {item.contactInfo}
              </p>
            </div>

            {/* Comments Section */}
            <div className="space-y-3 pt-2 border-t border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-neutral-900 dark:text-white flex items-center gap-1.5 uppercase tracking-wider">
                  <MessageSquare className="w-4 h-4 text-[#00843D]" /> Perguntas & Comentários da Comunidade ({itemComments.length})
                </h4>
              </div>

              <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                {itemComments.length === 0 ? (
                  <p className="text-xs text-neutral-400 italic py-2">
                    Nenhum comentário cadastrado para este pertence. Seja o primeiro a perguntar!
                  </p>
                ) : (
                  itemComments.map((com) => (
                    <div
                      key={com.id}
                      className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/80 dark:border-neutral-700/60 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="font-extrabold text-neutral-900 dark:text-white">
                            {com.userName}
                          </span>
                          <span className="px-1.5 py-0.2 text-[9px] font-black rounded-md bg-[#00843D]/10 text-[#00843D] dark:text-green-400">
                            {com.userRole}
                          </span>
                        </div>
                        <span className="text-[10px] text-neutral-400">{formatDateTime(com.createdAt)}</span>
                      </div>
                      <p className="text-neutral-700 dark:text-neutral-300 leading-snug">{com.text}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Add Comment Form */}
              <form onSubmit={handlePostComment} className="flex gap-2">
                <input
                  type="text"
                  required
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder="Escreva uma pergunta ou informação adicional..."
                  className="flex-1 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
                />
                <button
                  type="submit"
                  disabled={isPostingComment}
                  className="px-3.5 py-2 rounded-xl bg-[#00843D] text-white font-bold text-xs hover:bg-[#006e33] transition-colors shrink-0 flex items-center gap-1"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Enviar</span>
                </button>
              </form>
            </div>

            {/* Vertical Timeline History Section */}
            <div className="space-y-3 pt-3 border-t border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-neutral-900 dark:text-white flex items-center gap-1.5">
                  <History className="w-4 h-4 text-indigo-500" /> Histórico da Ocorrência ({sortedTimeline.length})
                </h4>
                <span className="text-[10px] text-neutral-400 font-mono">Trilha Auditável</span>
              </div>

              <div className="max-h-56 overflow-y-auto pr-2">
                {sortedTimeline.length === 0 ? (
                  <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl text-xs text-neutral-400 italic">
                    Nenhum evento registrado ainda nesta ocorrência.
                  </div>
                ) : (
                  <div className="relative border-l-2 border-indigo-500/30 dark:border-indigo-500/40 ml-3 pl-4 space-y-4 py-1">
                    {sortedTimeline.map((log: any, index: number) => (
                      <div key={log.id || index} className="relative group">
                        {/* Timeline Circle Bullet Node */}
                        <div className="absolute -left-[23px] top-1 w-3.5 h-3.5 rounded-full bg-indigo-500 ring-4 ring-white dark:ring-[#1E1E1E] shadow-xs flex items-center justify-center">
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        </div>

                        <div className="p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/90 border border-neutral-200/80 dark:border-neutral-700/60 text-xs space-y-1 shadow-2xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-black text-neutral-900 dark:text-white text-xs">
                              {log.action}
                            </span>
                            <span className="text-[10px] font-mono font-bold text-neutral-500 dark:text-neutral-400 shrink-0">
                              {formatDateTime(log.timestamp)}
                            </span>
                          </div>

                          {log.details && (
                            <p className="text-neutral-700 dark:text-neutral-300 text-[11px] leading-relaxed">
                              {log.details}
                            </p>
                          )}

                          <div className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium flex items-center gap-1 pt-0.5">
                            <User className="w-3 h-3 text-indigo-500 shrink-0" />
                            <span>
                              Responsável: <strong className="text-neutral-800 dark:text-neutral-200">{log.actorName || log.userName || "Usuário"}</strong>
                              {log.actorRole || log.userRole ? ` (${log.actorRole || log.userRole})` : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 space-y-2">
              {item.status !== "DEVOLVIDO" && item.status !== "ENCERRADO" && (
                <button
                  onClick={() => setClaimModalOpen(true)}
                  className="w-full py-3 px-4 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white font-bold text-sm shadow-md shadow-[#00843D]/20 transition-all flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <ShieldCheck className="w-5 h-5" />
                  <span>Solicitar Este Objeto (Reclamar Posse)</span>
                </button>
              )}

              {/* Gmail Notification / Contact Button */}
              <button
                onClick={() => setEmailModalOpen(true)}
                className="w-full py-2.5 px-4 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 font-bold text-xs transition-colors flex items-center justify-center space-x-2 cursor-pointer"
              >
                <Send className="w-4 h-4 text-red-500" />
                <span>Enviar Notificação / Dúvida via Gmail</span>
              </button>

              {/* Generate Official Printable Item Summary / Campus Report PDF Button */}
              <button
                type="button"
                onClick={handleGenerateItemSummaryPDF}
                className="w-full py-2.5 px-4 rounded-xl border border-[#00843D]/30 bg-[#00843D]/10 hover:bg-[#00843D]/20 text-[#00843D] dark:text-green-400 font-bold text-xs transition-colors flex items-center justify-center space-x-2 cursor-pointer"
                title="Gerar Laudo / Relatório Oficial em PDF (jsPDF)"
              >
                <FileText className="w-4 h-4 text-[#00843D]" />
                <span>Gerar Relatório Oficial do Campus (Ficha em PDF)</span>
              </button>

              {/* Servidor / Admin Privileges: Formal Devolution Flow */}
              {(currentUser.role === "ADMIN" || currentUser.role === "SERVIDOR") && item.status !== "DEVOLVIDO" && item.status !== "ENCERRADO" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => setReturnModalOpen(true)}
                    className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Registrar Devolução Formal</span>
                  </button>

                  <button
                    onClick={() => setDestinationModalOpen(true)}
                    className="w-full py-2.5 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-900 text-white font-bold text-xs transition-colors flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs"
                  >
                    <PackageCheck className="w-4 h-4" />
                    <span>Registrar Destinação</span>
                  </button>
                </div>
              )}

              {/* Admin Only: Reopen Return Button if item was already returned */}
              {currentUser.role === "ADMIN" && item.status === "DEVOLVIDO" && (
                <button
                  onClick={() => setReopenModalOpen(true)}
                  className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-colors flex items-center justify-center space-x-2 cursor-pointer shadow-xs"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>[Admin] Reabrir Devolução (Corrigir Erro)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Claim Modal (Reclamar Posse) */}
      {claimModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 max-w-lg w-full border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#00843D]" />
                <div>
                  <h3 className="font-extrabold text-base text-neutral-900 dark:text-white">
                    Verificação de Posse RNF04
                  </h3>
                  <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">
                    Proteção Anti-Furto & Dono Falso • IFPR
                  </p>
                </div>
              </div>
              <button
                onClick={() => setClaimModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-[#00843D]/10 border border-[#00843D]/20 rounded-2xl text-xs text-neutral-800 dark:text-neutral-200 space-y-1">
              <span className="font-extrabold text-[#00843D] block">Desafio de Segurança de Posse:</span>
              <p className="text-[11px] leading-relaxed">{ownership.hiddenChallengePrompt}</p>
            </div>

            <form onSubmit={handleClaimSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1">
                  1. Senha, PIN, Número de Série ou Marca Única de Posse * (RNF04)
                </label>
                <input
                  type="text"
                  required
                  value={claimSecretPasswordInput}
                  onChange={(e) => setClaimSecretPasswordInput(e.target.value)}
                  placeholder="Ex: Senha de bloqueio, número de série S/N, PIN ou palavra-chave..."
                  className="w-full p-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs focus:ring-2 focus:ring-[#00843D] outline-none font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1">
                  2. Marca, Modelo ou Fabricante *
                </label>
                <input
                  type="text"
                  required
                  value={claimBrandInput}
                  onChange={(e) => setClaimBrandInput(e.target.value)}
                  placeholder="Ex: Samsung / Dell / Nike / Chaveiro do Batman..."
                  className="w-full p-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs focus:ring-2 focus:ring-[#00843D] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1">
                  3. Detalhes Ocultos & Marcas não Visíveis na Foto *
                </label>
                <textarea
                  required
                  rows={3}
                  value={claimHiddenFeaturesInput}
                  onChange={(e) => setClaimHiddenFeaturesInput(e.target.value)}
                  placeholder="Ex: No zíper do bolso interno há uma fita verde amarrada, e um adesivo rasgado na contracapa..."
                  className="w-full p-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs focus:ring-2 focus:ring-[#00843D] outline-none"
                />
              </div>

              {ownership.errorMessage && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-[11px] text-red-600 dark:text-red-400 font-bold flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{ownership.errorMessage}</span>
                </div>
              )}

              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  As informações fornecidas serão validadas com os detalhes arquivados pela Secretaria (SEBAC). Apresente documento oficial com foto no ato da retirada.
                </span>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setClaimModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingClaim}
                  className="px-5 py-2 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white font-extrabold text-xs shadow-md flex items-center space-x-1.5"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{isSubmittingClaim ? "Verificando..." : "Confirmar & Solicitar Devolução"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Gmail Modal */}
      {emailModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 max-w-lg w-full border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <h3 className="font-bold text-base text-neutral-900 dark:text-white flex items-center gap-2">
                <Send className="w-5 h-5 text-red-500" /> Enviar Notificação via Gmail
              </h3>
              <button
                onClick={() => setEmailModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
              Utilize a API do Gmail para enviar uma mensagem sobre o objeto <strong>"{item.title}"</strong> diretamente para o destinatário informado.
            </p>

            <form onSubmit={handleSendEmailSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1">
                  Destinatário (E-mail) *
                </label>
                <input
                  type="email"
                  required
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="exemplo@gmail.com"
                  className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-[#00843D]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1">
                  Assunto *
                </label>
                <input
                  type="text"
                  required
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-[#00843D]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1">
                  Conteúdo da Mensagem *
                </label>
                <textarea
                  required
                  rows={4}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-[#00843D]"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEmailModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSendingEmail}
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md flex items-center space-x-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSendingEmail ? "Enviando..." : "Enviar via Gmail"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Devolution Registration Modal */}
      {returnModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 max-w-lg w-full border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="font-extrabold text-base text-neutral-900 dark:text-white">
                    Registrar Devolução de Objeto
                  </h3>
                  <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">
                    Protocolo Oficial SEBAC • IFPR Campus Ivaiporã
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReturnModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRegisterReturnSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1">
                  Nome Completo do Receptor / Proprietário *
                </label>
                <input
                  type="text"
                  required
                  value={returnRecipientName}
                  onChange={(e) => setReturnRecipientName(e.target.value)}
                  placeholder="Nome de quem está recebendo o pertence..."
                  className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1">
                    E-mail do Receptor *
                  </label>
                  <input
                    type="email"
                    required
                    value={returnRecipientEmail}
                    onChange={(e) => setReturnRecipientEmail(e.target.value)}
                    placeholder="email@estudantes.ifpr.edu.br"
                    className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1">
                    Vínculo no Campus *
                  </label>
                  <select
                    value={returnRecipientBond}
                    onChange={(e) => setReturnRecipientBond(e.target.value as any)}
                    className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs font-bold outline-none cursor-pointer focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Aluno">Aluno(a)</option>
                    <option value="Servidor">Servidor / TAE / Professor</option>
                    <option value="Terceirizado">Funcionário Terceirizado</option>
                    <option value="Visitante">Visitante Externo</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1">
                  Observações / Dados do Documento Aresentado
                </label>
                <textarea
                  rows={2}
                  value={returnObservations}
                  onChange={(e) => setReturnObservations(e.target.value)}
                  placeholder="Ex: Apresentou RG 12.345.678-9 e informou que o chaveiro continha o nome gravado na parte posterior..."
                  className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="confirmIdentityCheck"
                  required
                  checked={returnIdentityConfirmed}
                  onChange={(e) => setReturnIdentityConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="confirmIdentityCheck" className="text-xs text-blue-800 dark:text-blue-300 cursor-pointer font-bold">
                  Confirmo que conferi presencialmente o documento oficial com foto do receptor antes da entrega.
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReturnModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isRegisteringReturn}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md flex items-center space-x-1.5 cursor-pointer"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{isRegisteringReturn ? "Registrando..." : "Registrar Devolução & PDF"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reopen Return Modal (Admin Only) */}
      {reopenModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 max-w-md w-full border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="font-extrabold text-base text-neutral-900 dark:text-white">
                    Reabrir Devolução de Objeto
                  </h3>
                  <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">
                    Ação Administrativa de Ajuste
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReopenModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-800 dark:text-amber-300">
              A reabertura do item alterará o status de volta para ativo, removerá o carimbo de devolução e gravará um log de auditoria associado ao seu usuário.
            </div>

            <form onSubmit={handleReopenReturnSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1">
                  Justificativa da Reabertura *
                </label>
                <textarea
                  required
                  rows={3}
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="Ex: Devolução cadastrada por engano no item incorreto durante conferência de estoque..."
                  className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReopenModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isReopeningReturn}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md flex items-center space-x-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isReopeningReturn ? "Reabrindo..." : "Confirmar Reabertura"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Destination Modal (Unclaimed Items) */}
      {destinationModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 max-w-md w-full border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <PackageCheck className="w-5 h-5 text-neutral-800 dark:text-neutral-200" />
                <div>
                  <h3 className="font-extrabold text-base text-neutral-900 dark:text-white">
                    Destinação de Pertence Não Reclamado
                  </h3>
                  <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">
                    Destinação Institucional (Até 60 dias)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDestinationModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleDestinationSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1">
                  Tipo de Destinação *
                </label>
                <select
                  value={destinationType}
                  onChange={(e) => setDestinationType(e.target.value as any)}
                  className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs font-bold outline-none cursor-pointer focus:ring-2 focus:ring-neutral-600"
                >
                  <option value="DOACAO">Doação para Entidade / Projeto Social</option>
                  <option value="DESCARTE">Descarte Ecológico / Lixo Eletrônico</option>
                  <option value="LEILAO_PROJETO">Uso em Projetos de Ensino / Pesquisa</option>
                  <option value="OUTRO">Outra Destinação Autorizada</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1">
                  Entidade Beneficiária / Justificativa *
                </label>
                <textarea
                  required
                  rows={3}
                  value={destinationNotes}
                  onChange={(e) => setDestinationNotes(e.target.value)}
                  placeholder="Ex: Entregue à Instituição Social de Ivaiporã conforme autorização da Direção Geral..."
                  className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-neutral-600"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDestinationModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isRegisteringDestination}
                  className="px-5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs shadow-md flex items-center space-x-1.5 cursor-pointer"
                >
                  <PackageCheck className="w-3.5 h-3.5" />
                  <span>{isRegisteringDestination ? "Registrando..." : "Confirmar & Encerrar"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Restricted QR View Modal */}
      {showRestrictedQRView && (
        <RestrictedQRViewModal
          item={item}
          onClose={() => setShowRestrictedQRView(false)}
        />
      )}
    </div>
  );
};
