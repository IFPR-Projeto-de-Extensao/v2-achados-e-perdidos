import React, { useState } from "react";
import { LostFoundItem } from "../types";
import { useApp } from "../context/AppContext";
import { usePossessionVerification } from "../hooks/usePossessionVerification";
import { formatDate, formatDateTime } from "../lib/utils";
import { QRCodeSVG } from "qrcode.react";
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
} from "lucide-react";

interface ItemDetailModalProps {
  item: LostFoundItem;
  onClose: () => void;
}

export const ItemDetailModal: React.FC<ItemDetailModalProps> = ({ item, onClose }) => {
  const { currentUser, submitClaim, updateItemStatus, sendEmailViaGmail, addToast, comments, addCommentToItem, claims } = useApp();
  const ownership = usePossessionVerification(item);

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [claimSecretPasswordInput, setClaimSecretPasswordInput] = useState("");
  const [claimBrandInput, setClaimBrandInput] = useState("");
  const [claimHiddenFeaturesInput, setClaimHiddenFeaturesInput] = useState("");
  const [isSubmittingClaim, setIsSubmittingClaim] = useState(false);

  // Comments state
  const [newCommentText, setNewCommentText] = useState("");
  const [isPostingComment, setIsPostingComment] = useState(false);

  // Gmail send state
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState(item.contactInfo || "achados.ivaipora@ifpr.edu.br");
  const [emailSubject, setEmailSubject] = useState(`[IFPR Achados & Perdidos] Consulta: ${item.title}`);
  const [emailBody, setEmailBody] = useState(`Olá,\n\nEstou entrando em contato a respeito do item "${item.title}" (ID: ${item.id}) cadastrado no Achados e Perdidos do IFPR Campus Ivaiporã.\n\nAtenciosamente,\n${currentUser.name}`);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Find associated approved claim for PDF receipt details
  const approvedClaim = claims.find((c) => c.itemId === item.id && (c.status === "APROVADO" || c.status === "CONCLUIDO"));

  // Web Share API Handler
  const handleShareItem = async () => {
    const shareUrl = window.location.href;
    const shareText = `[IFPR Achados & Perdidos] Confira o item "${item.title}" (${item.type}) registrado no Campus Ivaiporã:`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `IFPR Achados & Perdidos - ${item.title}`,
          text: shareText,
          url: shareUrl,
        });
        addToast("Link compartilhado com sucesso!", "success");
      } catch (err) {
        console.log("Compartilhamento cancelado:", err);
      }
    } else {
      // Fallback: Copy link and offer WhatsApp
      try {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        const encodedText = encodeURIComponent(`${shareText}\n${shareUrl}`);
        window.open(`https://api.whatsapp.com/send?text=${encodedText}`, "_blank");
        addToast("Link copiado para a área de transferência e redirecionado ao WhatsApp!", "success");
      } catch (e) {
        addToast("Link copiado para a área de transferência!", "info");
      }
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
    const receiptCode = `REC-IFPR-${item.id.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()}-${Date.now().toString().slice(-4)}`;

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

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    setIsPostingComment(true);
    await addCommentToItem(item.id, newCommentText.trim());
    setNewCommentText("");
    setIsPostingComment(false);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div
        className="relative w-full max-w-4xl bg-white dark:bg-[#1E1E1E] rounded-3xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#181818]">
          <div className="flex items-center space-x-3">
            <span
              className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${getStatusBadgeClass(
                item.status
              )}`}
            >
              {item.status.replace("_", " ")}
            </span>
            <span className="text-xs text-neutral-500 font-mono">ID: {item.id}</span>
          </div>

          <div className="flex items-center space-x-2">
            {/* Share Button (Web Share API) */}
            <button
              onClick={handleShareItem}
              className="px-3 py-1.5 rounded-xl bg-neutral-200 dark:bg-neutral-800 hover:bg-[#00843D] hover:text-white text-neutral-700 dark:text-neutral-200 font-bold text-xs transition-all flex items-center gap-1.5"
              title="Compartilhar Link do Item"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Compartilhar</span>
            </button>

            <button
              onClick={onClose}
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
                  <QRCodeSVG value={item.qrCodeId} size={72} level="H" />
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handlePrintQRTag}
                  className="w-full py-2 px-3 rounded-xl bg-white dark:bg-neutral-800 border border-[#00843D]/30 text-[#00843D] dark:text-green-400 font-bold text-xs hover:bg-[#00843D] hover:text-white transition-all flex items-center justify-center space-x-1.5 shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Etiqueta QR PDF</span>
                </button>

                {/* Generate PDF Receipt Button */}
                <button
                  type="button"
                  onClick={handlePrintReceiptPDF}
                  className="w-full py-2 px-3 rounded-xl bg-[#00843D] text-white font-bold text-xs hover:bg-[#006e33] transition-all flex items-center justify-center space-x-1.5 shadow-xs"
                >
                  <FileCheck className="w-3.5 h-3.5" />
                  <span>Gerar Recibo PDF</span>
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
                <span className="font-bold text-neutral-900 dark:text-white">{formatDate(item.date)}</span>
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

            {/* Action Buttons */}
            <div className="pt-2 space-y-2">
              {item.status !== "DEVOLVIDO" && (
                <button
                  onClick={() => setClaimModalOpen(true)}
                  className="w-full py-3 px-4 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white font-bold text-sm shadow-md shadow-[#00843D]/20 transition-all flex items-center justify-center space-x-2"
                >
                  <ShieldCheck className="w-5 h-5" />
                  <span>Solicitar Este Objeto (Reclamar Posse)</span>
                </button>
              )}

              {/* Gmail Notification / Contact Button */}
              <button
                onClick={() => setEmailModalOpen(true)}
                className="w-full py-2.5 px-4 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 font-bold text-xs transition-colors flex items-center justify-center space-x-2"
              >
                <Send className="w-4 h-4 text-red-500" />
                <span>Enviar Notificação / Dúvida via Gmail</span>
              </button>

              {/* Admin or Server privileges: Quick resolve button */}
              {(currentUser.role === "ADMIN" || currentUser.role === "SERVIDOR") && item.status !== "DEVOLVIDO" && (
                <button
                  onClick={handleMarkAsReturned}
                  className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors flex items-center justify-center space-x-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>[Painel Admin] Marcar Automaticamente como Devolvido</span>
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
    </div>
  );
};
