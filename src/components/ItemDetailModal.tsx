import React, { useState, useEffect } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { LostFoundItem } from "../types";
import { useApp } from "../context/AppContext";
import { formatDateTime, formatSafeDateTime, safeParseDate, triggerVibration, vibrateClick, vibrateSuccess, vibrateCritical, isItemNew, getItemAgeText, getTodayDateString, isFutureDate, validateItemOccurrenceDate, validateItemTextFields, ITEM_FIELD_LIMITS } from "../lib/utils";
import { auth } from "../lib/firebase";
import { getItemPublicUrl, getItemQrValue } from "../lib/qrCodeUtils";
import { QRCodeSVG } from "qrcode.react";
import { RestrictedQRViewModal } from "./RestrictedQRViewModal";
import { AccessibleVoiceReader } from "./AccessibleVoiceReader";
import { normalizeCategory, getCategoryDisplay, CANONICAL_ITEM_CATEGORIES } from "../lib/categoryUtils";
import { canOperateFormalReturn, canReopenFormalReturn, canStartFormalReturnForItem } from "../lib/devolutionAuth";
import { IFPR_LOCATIONS, IFPR_LOCATION_GROUPS } from "../data/mockData";
import { escapeHtml, isSafeDataImageUrl } from "../lib/htmlSanitizer";
import {
  SupportedLanguage,
  getLocaleForLanguage,
  getStoredLanguage,
  localize,
  translateActivityAction,
  translateCampusLocation,
  translateCategory,
  translateColor,
  translateItemStatus,
  translateLocationGroup,
  translateUserRole,
} from "../lib/i18n";

/**
 * Utilitário 'formatSafeDate' para validação e formatação segura de datas (Timestamp, string, number ou Date).
 * Valida todas as propriedades de data antes de renderizar e retorna fallback localizado
 * em caso de dados nulos, indefinidos ou malformatados, eliminando completamente falhas com 'RangeError'.
 */
export function formatSafeDate(
  input: unknown,
  fallback?: string,
  lang?: SupportedLanguage
): string {
  const effectiveLang = lang ?? getStoredLanguage();
  const locale = getLocaleForLanguage(effectiveLang);
  const resolvedFallback =
    fallback !== undefined
      ? fallback
      : effectiveLang === "en"
      ? "Date not provided"
      : "Data não informada";

  if (input === null || input === undefined || input === "" || input === "null" || input === "undefined") {
    return resolvedFallback;
  }

  // 1. Suporte a Firestore Timestamp com método .toDate()
  if (typeof input === "object" && input !== null && typeof (input as any).toDate === "function") {
    try {
      const d = (input as any).toDate();
      if (d instanceof Date && !isNaN(d.getTime())) {
        return new Intl.DateTimeFormat(locale, {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(d);
      }
    } catch {
      return resolvedFallback;
    }
  }

  // 2. Parser seguro resiliente contra strings e números
  const date = safeParseDate(input);
  if (!date || isNaN(date.getTime())) {
    return resolvedFallback;
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  } catch {
    try {
      const d = String(date.getDate()).padStart(2, "0");
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const y = date.getFullYear();
      return effectiveLang === "en" ? `${m}/${d}/${y}` : `${d}/${m}/${y}`;
    } catch {
      return resolvedFallback;
    }
  }
}

// Alias local para compatibilidade
const formatDate = formatSafeDate;
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
  Edit,
  Save,
  Sparkles,
  PenTool,
  CheckCheck,
  MailCheck,
  RefreshCw,
  FileSignature,
  CameraOff,
  ChevronLeft,
} from "lucide-react";
import { DigitalSignaturePad } from "./DigitalSignaturePad";
import { RemoteSignatureModal } from "./RemoteSignatureModal";
import {
  UIBadge,
  UIButton,
  UIFieldGroup,
  UIInput,
  UISelect,
  UITextarea,
  SubtlePanel,
} from "./ui";

interface ItemDetailModalProps {
  item: LostFoundItem;
  onClose: () => void;
}

export const ItemDetailModal: React.FC<ItemDetailModalProps> = ({ item, onClose }) => {
  const {
    items,
    currentUser,
    isGuest,
    allUsers,
    submitClaim,
    updateItemStatus,
    sendNotificationToUser,
    addToast,
    comments,
    addCommentToItem,
    claims,
    registerItemReturn,
    reopenItemReturn,
    registerItemDestination,
    logItemLabelGenerated,
    updateItemData,
    setSelectedItemForDetail,
    returnModalAutoOpen,
    setReturnModalAutoOpen,
    language,
    t,
  } = useApp();
  const L = (pt: string, en: string) => localize(language, pt, en);
  const fmtDate = (value: unknown) => formatSafeDate(value, undefined, language);
  const fmtDateTime = (value: unknown) => formatDateTime(value, undefined, language);
  const getBondLabel = (bond?: string) => {
    switch (bond) {
      case "Aluno":
      case "Aluno(a)":
        return L("Aluno(a)", "Student");
      case "Servidor":
        return L("Servidor", "Staff");
      case "Terceirizado":
        return L("Terceirizado", "Contractor");
      case "Visitante":
        return L("Visitante", "Visitor");
      default:
        return bond || L("Comunidade IFPR", "IFPR Community");
    }
  };
  const currentItem = items.find((i) => i.id === item.id) || item;
  const canPerformFormalReturn = canStartFormalReturnForItem(currentUser, auth.currentUser, currentItem, isGuest);
  const canSignAsStaff = canOperateFormalReturn(currentUser, auth.currentUser, isGuest);
  const canReopenReturn = canReopenFormalReturn(currentUser, auth.currentUser, isGuest);

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [mainImageError, setMainImageError] = useState(false);

  // Edit Item Modal State (Authorized users: Owner, Staff, Admin)
  const [editItemModalOpen, setEditItemModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(currentItem?.title || "");
  const [editDescription, setEditDescription] = useState(currentItem?.description || "");
  const [editCategory, setEditCategory] = useState<string>(normalizeCategory(currentItem?.category));
  const [editLocation, setEditLocation] = useState(currentItem?.location || "");
  const [editDate, setEditDate] = useState(currentItem?.date || getTodayDateString());
  const [editColor, setEditColor] = useState(currentItem?.color || "");
  const [editBrand, setEditBrand] = useState(currentItem?.brand || "");
  const [editContactInfo, setEditContactInfo] = useState(currentItem?.contactInfo || "");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    setEditTitle(currentItem?.title || "");
    setEditDescription(currentItem?.description || "");
    setEditCategory(normalizeCategory(currentItem?.category));
    setEditLocation(currentItem?.location || "");
    setEditDate(currentItem?.date || getTodayDateString());
    setEditColor(currentItem?.color || "");
    setEditBrand(currentItem?.brand || "");
    setEditContactInfo(currentItem?.contactInfo || "");
  }, [
    currentItem?.id,
    currentItem?.title,
    currentItem?.description,
    currentItem?.category,
    currentItem?.location,
    currentItem?.date,
    currentItem?.color,
    currentItem?.brand,
    currentItem?.contactInfo,
  ]);
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [claimDistinctiveFeatures, setClaimDistinctiveFeatures] = useState("");
  const [claimAdditionalInfo, setClaimAdditionalInfo] = useState("");
  const [isSubmittingClaim, setIsSubmittingClaim] = useState(false);

  // Devolution Registration Flow State
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnRecipientName, setReturnRecipientName] = useState("");
  const [returnRecipientEmail, setReturnRecipientEmail] = useState("");
  const [returnRecipientBond, setReturnRecipientBond] = useState<"Aluno" | "Servidor" | "Visitante" | "Terceirizado">("Aluno");
  const [returnRecipientDocument, setReturnRecipientDocument] = useState("");
  const [returnIdentityConfirmed, setReturnIdentityConfirmed] = useState(false);
  const [returnObservations, setReturnObservations] = useState("");
  const [returnSignatureMode, setReturnSignatureMode] = useState<"IN_PERSON_DEVICE" | "REMOTE_EMAIL">("IN_PERSON_DEVICE");
  const [returnSignatureDataUrl, setReturnSignatureDataUrl] = useState<string>("");
  const [isRegisteringReturn, setIsRegisteringReturn] = useState(false);
  const [isConfirmingArrival, setIsConfirmingArrival] = useState(false);

  useEffect(() => {
    if (returnModalAutoOpen) {
      if (canPerformFormalReturn) {
        setReturnModalOpen(true);
      }
      setReturnModalAutoOpen(false);
    }
  }, [returnModalAutoOpen, canPerformFormalReturn, setReturnModalAutoOpen]);

  // Digital Signature Remote Modal State
  const [remoteSignatureModalOpen, setRemoteSignatureModalOpen] = useState(false);
  const [resolvedRemoteToken, setResolvedRemoteToken] = useState<string>("");
  const [isResolvingRemoteLink, setIsResolvingRemoteLink] = useState(false);
  const [showSignaturePreviewModal, setShowSignaturePreviewModal] = useState(false);
  const [isResendingSignatureEmail, setIsResendingSignatureEmail] = useState(false);

  // Reopen Return Flow State
  const [reopenModalOpen, setReopenModalOpen] = useState(false);

  // Staff Attendant Signature Modal State (Dual Signature Attestation)
  const [staffSignatureModalOpen, setStaffSignatureModalOpen] = useState(false);
  const [staffSignatureDataUrl, setStaffSignatureDataUrl] = useState<string>("");
  const [staffSignatureMethod, setStaffSignatureMethod] = useState<"DRAWN" | "TYPED_NAME">("DRAWN");
  const [isSubmittingStaffSignature, setIsSubmittingStaffSignature] = useState(false);

  const handleConfirmStaffSignatureSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffSignatureDataUrl) {
      addToast(L("Por favor, forneça sua assinatura no campo indicado.", "Please provide your signature in the field below."), "error");
      return;
    }

    try {
      setIsSubmittingStaffSignature(true);
      vibrateClick();

      const userToken = await auth.currentUser?.getIdToken();
      if (!userToken) {
        addToast(L("Sessão expirada. Faça login novamente com sua conta institucional.", "Session expired. Please sign in again with your institutional account."), "error");
        return;
      }

      const res = await fetch("/api/signature/confirm-staff-signature", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          itemId: currentItem.id,
          signatureDataUrl: staffSignatureDataUrl,
          signatureMethod: staffSignatureMethod,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || L("Falha ao registrar assinatura do atendente.", "Failed to record attendant signature."));
      }

      vibrateSuccess();
      addToast(L("Atestação e assinatura do atendente registradas com sucesso!", "Attendant attestation and signature recorded successfully!"), "success");

      // Sync open detail view immediately in-memory (backend transaction already persisted in Firestore)
      setSelectedItemForDetail({
        ...currentItem,
        staffSignatureStatus: "SIGNED",
        staffSignatureUrl: staffSignatureDataUrl,
        staffSignatureMethod: staffSignatureMethod,
        staffSignedAt: data.staffSignedAt || new Date().toISOString(),
        staffSignerUid: currentUser.id,
        staffSignerName: data.staffSignerName || currentUser.name,
        staffSignerEmail: currentUser.email,
      });

      setStaffSignatureModalOpen(false);
      setStaffSignatureDataUrl("");
    } catch (err: any) {
      console.error("Erro ao registrar assinatura do atendente:", err);
      addToast(err?.message || L("Erro ao registrar assinatura institucional.", "Error recording institutional signature."), "error");
    } finally {
      setIsSubmittingStaffSignature(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editItemModalOpen) {
          setEditItemModalOpen(false);
        } else if (claimModalOpen) {
          setClaimModalOpen(false);
        } else if (returnModalOpen) {
          setReturnModalOpen(false);
        } else if (remoteSignatureModalOpen) {
          setRemoteSignatureModalOpen(false);
        } else if (reopenModalOpen) {
          setReopenModalOpen(false);
        } else {
          vibrateClick();
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editItemModalOpen, claimModalOpen, returnModalOpen, remoteSignatureModalOpen, reopenModalOpen, onClose]);
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

  // Institutional notification modal state
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState(currentItem?.contactInfo || "localizamais0@gmail.com");
  const [emailSubject, setEmailSubject] = useState(
    L(
      `[IFPR Achados & Perdidos] Consulta: ${currentItem?.title || "Item"}`,
      `[IFPR Lost & Found] Inquiry: ${currentItem?.title || "Item"}`
    )
  );
  const [emailBody, setEmailBody] = useState(
    L(
      `Olá,\n\nEstou entrando em contato a respeito do item "${currentItem?.title || "Item"}" (ID: ${currentItem?.id || ""}) cadastrado no Achados e Perdidos do IFPR Campus Ivaiporã.\n\nAtenciosamente,\n${currentUser?.name || "Usuário IFPR"}`,
      `Hello,\n\nI am reaching out regarding the item "${currentItem?.title || "Item"}" (ID: ${currentItem?.id || ""}) registered in the IFPR Campus Ivaiporã Lost & Found system.\n\nBest regards,\n${currentUser?.name || "IFPR User"}`
    )
  );
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  useEffect(() => {
    if (!emailModalOpen) {
      setRecipientEmail(currentItem?.contactInfo || "localizamais0@gmail.com");
      setEmailSubject(
        L(
          `[IFPR Achados & Perdidos] Consulta: ${currentItem?.title || "Item"}`,
          `[IFPR Lost & Found] Inquiry: ${currentItem?.title || "Item"}`
        )
      );
      setEmailBody(
        L(
          `Olá,\n\nEstou entrando em contato a respeito do item "${currentItem?.title || "Item"}" (ID: ${currentItem?.id || ""}) cadastrado no Achados e Perdidos do IFPR Campus Ivaiporã.\n\nAtenciosamente,\n${currentUser?.name || "Usuário IFPR"}`,
          `Hello,\n\nI am reaching out regarding the item "${currentItem?.title || "Item"}" (ID: ${currentItem?.id || ""}) registered in the IFPR Campus Ivaiporã Lost & Found system.\n\nBest regards,\n${currentUser?.name || "IFPR User"}`
        )
      );
    }
  }, [emailModalOpen, currentItem?.id, currentItem?.title, currentItem?.contactInfo, currentUser?.name, language]);

  // Restricted Public View QR Modal State
  const [showRestrictedQRView, setShowRestrictedQRView] = useState(false);

  // Consolidate Timeline History Logs
  const combinedHistoryLogs = [
    ...(currentItem?.historyLogs || []),
    ...(currentItem?.history || []).map((h: any) => ({
      id: h?.id || `h-${Math.random()}`,
      action: h?.action,
      actorId: h?.actorId || h?.userId || "system",
      actorName: h?.actorName || h?.userName || L("Usuário IFPR", "IFPR User"),
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
    (a: any, b: any) => (safeParseDate(b?.timestamp)?.getTime() || 0) - (safeParseDate(a?.timestamp)?.getTime() || 0)
  );

  // Find associated approved claim for PDF receipt details
  const approvedClaim = claims.find((c) => c.itemId === currentItem.id && (c.status === "APROVADO" || c.status === "CONCLUIDO"));
  // Find current user's active claim (PENDENTE or APROVADO)
  const userActiveClaim = currentUser && currentUser.id !== "guest"
    ? claims.find((c) => c.itemId === currentItem.id && c.claimerId === currentUser.id && (c.status === "PENDENTE" || c.status === "APROVADO"))
    : undefined;

  // Auto-fill recipient information in return modal if there is an approved claim
  useEffect(() => {
    if (returnModalOpen && approvedClaim) {
      if (!returnRecipientName && approvedClaim.claimerName) {
        setReturnRecipientName(approvedClaim.claimerName);
      }
      if (!returnRecipientEmail && approvedClaim.claimerEmail) {
        setReturnRecipientEmail(approvedClaim.claimerEmail);
      }
      if (!returnRecipientDocument && approvedClaim.claimerRegistration) {
        setReturnRecipientDocument(approvedClaim.claimerRegistration);
      }
      if (approvedClaim.claimerRole === "SERVIDOR") {
        setReturnRecipientBond("Servidor");
      }
    }
  }, [returnModalOpen, approvedClaim]);

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
      const safeId = String(currentItem?.id ?? "ITEM").replace(/[^a-zA-Z0-9_-]/g, "").toUpperCase();
      const docReportCode = `LAUDO-IFPR-${safeId}-${Date.now().toString().slice(-4)}`;
      const emissionDate = new Date().toLocaleString(getLocaleForLanguage(language));
      const safeTitle = currentItem?.title || L("Item sem Título", "Untitled Item");

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
      doc.text(
        L(
          "SISTEMA OFICIAL DE ACHADOS E PERDIDOS • LAUDO INDIVIDUAL DE PERTENCE",
          "OFFICIAL LOST AND FOUND SYSTEM • INDIVIDUAL ITEM REPORT"
        ),
        14,
        18
      );

      // 2. Report Overview & Identification Metadata
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(
        L(
          "FICHA CADASTRAL E LAUDO DE GESTÃO PATRIMONIAL",
          "REGISTRATION RECORD AND CUSTODY MANAGEMENT REPORT"
        ),
        14,
        34
      );

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(`${L("Código do Laudo", "Report Code")}: ${docReportCode}`, 14, 40);
      doc.text(`${L("Data de Emissão", "Issue Date")}: ${emissionDate}`, 14, 45);
      doc.text(
        `${L("Emitido por", "Issued by")}: ${currentUser?.name || L("Usuário IFPR", "IFPR User")} (${translateUserRole(currentUser?.role, language)} • ${currentUser?.email || "campus.ivaipora@ifpr.edu.br"})`,
        14,
        50
      );
      doc.text(`${L("Código de Rastreamento QR", "QR Tracking Code")}: ${currentItem?.qrCodeId || currentItem?.id}`, 14, 55);

      // Status Badge inside document
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      let statusColor: [number, number, number] = [0, 132, 61];
      if (currentItem.status === "PERDIDO") statusColor = [220, 38, 38];
      else if (currentItem.status === "EM_ANALISE") statusColor = [217, 119, 6];
      else if (currentItem.status === "DEVOLVIDO") statusColor = [37, 99, 235];

      doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
      doc.roundedRect(14, 58, 54, 6.5, 1.5, 1.5, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(
        `${L("SITUAÇÃO", "STATUS")}: ${translateItemStatus(currentItem?.status, language).toUpperCase()}`,
        16,
        62.5
      );

      // Render QR Code onto the top-right corner if available
      try {
        const qrDataUrl = await getQRCodeDataUrl(currentItem.id);
        if (qrDataUrl) {
          doc.setDrawColor(0, 132, 61);
          doc.setLineWidth(0.4);
          doc.roundedRect(165, 30, 31, 31, 1, 1, "D");
          doc.addImage(qrDataUrl, "PNG", 166, 31, 29, 29);
          doc.setFontSize(6.5);
          doc.setTextColor(0, 132, 61);
          doc.setFont("helvetica", "bold");
          doc.text(L("QR OFICIAL", "OFFICIAL QR"), 180.5, 64, { align: "center" });
        }
      } catch (e) {
        console.warn("QR code render in PDF skipped:", e);
      }

      // 3. Section 1 Table: Dados Cadastrais do Objeto
      const generalDataRows = [
        [
          L("ID da Ocorrência:", "Record ID:"),
          currentItem.id,
          L("Tipo do Registro:", "Record Type:"),
          currentItem.type === "PERDIDO"
            ? L("Perdido (Procura-se)", "Lost (Missing)")
            : L("Encontrado (No Acervo)", "Found (In Custody)"),
        ],
        [
          L("Título / Denominação:", "Title / Name:"),
          safeTitle,
          L("Categoria:", "Category:"),
          translateCategory(getCategoryDisplay(currentItem.category), language),
        ],
        [
          L("Local da Ocorrência:", "Occurrence Location:"),
          translateCampusLocation(currentItem.location, language) || "Campus IFPR",
          L("Data do Registro / Entrada:", "Registration Date:"),
          fmtDate(currentItem.date),
        ],
        [
          L("Cor Predominante:", "Primary Color:"),
          currentItem.color ? translateColor(currentItem.color, language) : L("Não especificada", "Not specified"),
          L("Marca / Fabricante:", "Brand / Manufacturer:"),
          currentItem.brand || L("Não identificada", "Not identified"),
        ],
        [
          L("Cadastrado por:", "Registered by:"),
          `${currentItem.registeredByName || L("Usuário IFPR", "IFPR User")} (${translateUserRole(currentItem.registeredByRole, language)})`,
          L("Validação de Posse (RNF04):", "Ownership Validation (RNF04):"),
          currentItem.secretVerificationKey || currentItem.secretVerificationHint
            ? L("Chave Secreta Configurada (Ativa)", "Secret Key Configured (Active)")
            : L("Verificação Convencional", "Standard Verification"),
        ],
        [
          L("Setor de Custódia / Contato:", "Custody Desk / Contact:"),
          currentItem.contactInfo || L("Guarita Principal / SEBAC Campus Ivaiporã", "Main Gatehouse / SEBAC Campus Ivaiporã"),
          L("Código de Etiqueta QR:", "QR Tag Code:"),
          currentItem.qrCodeId || currentItem.id,
        ],
      ];

      autoTable(doc, {
        startY: 68,
        head: [[L("1. DADOS DE IDENTIFICAÇÃO E CARACTERÍSTICAS", "1. IDENTIFICATION DETAILS AND CHARACTERISTICS"), "", "", ""]],
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
        head: [[L("2. DESCRIÇÃO DETALHADA E CARACTERÍSTICAS VISUAIS", "2. DETAILED DESCRIPTION AND VISUAL DETAILS")]],
        body: [[currentItem.description || L("Nenhuma observação descritiva complementar informada no momento do registro.", "No additional descriptive notes provided at registration.")]],
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
          timestamp: currentItem.date,
          action: L("Registro do Objeto no Sistema", "Item Registered in System"),
          actorName: currentItem.registeredByName || L("Sistema", "System"),
          actorRole: L("AUTOR", "AUTHOR"),
          details: L("Objeto inserido no banco de dados oficial de Achados & Perdidos.", "Item inserted into the official Lost & Found database."),
        },
      ]).slice(0, 10).map((log: any) => [
        fmtDateTime(log.timestamp),
        translateActivityAction(log.action, language) || L("Registro", "Record"),
        `${log.actorName || log.userName || L("Usuário", "User")} (${translateUserRole(log.actorRole || log.userRole, language)})`,
        log.details || "-",
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [[L("Data / Hora", "Date / Time"), L("Ação Registrada", "Recorded Action"), L("Responsável", "Responsible"), L("Detalhes da Tramitação", "Handling Details")]],
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
      if (approvedClaim || currentItem.status === "DEVOLVIDO") {
        const claimerName = approvedClaim ? approvedClaim.claimerName : (currentItem.registeredByName || L("Proprietário Identificado", "Identified Owner"));
        const claimerEmail = approvedClaim ? approvedClaim.claimerEmail : (currentUser?.email || L("E-mail Registrado", "Registered Email"));

        autoTable(doc, {
          startY: currentY,
          head: [[L("4. DADOS DA RESTITUIÇÃO E ENCERRAMENTO", "4. RETURN AND CLOSURE DETAILS")]],
          body: [
            [
              `${L("Proprietário / Recebedor", "Owner / Recipient")}: ${claimerName} (${claimerEmail})\n${L("Data de Encerramento", "Closure Date")}: ${currentItem.resolutionDate ? fmtDateTime(currentItem.resolutionDate) : emissionDate}\n${L("Comprovação Registrada", "Recorded Proof")}: ${approvedClaim?.verificationAnswer || L("Conferência presencial realizada na guarita / SEBAC com documento oficial.", "In-person verification performed at the gatehouse / SEBAC with official ID.")}`,
            ],
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
        L(
          "Declaro para os devidos fins institucionais e regulamentares que as informações acima transcritas correspondem fielmente aos registros oficiais do Sistema de Achados e Perdidos do IFPR Campus Ivaiporã.",
          "I hereby declare for institutional and regulatory purposes that the information above accurately reflects the official records of the IFPR Campus Ivaiporã Lost and Found System."
        ),
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
      doc.text(L("Servidor Responsável (SEBAC / Portaria)", "Responsible Staff (SEBAC / Gatehouse)"), 55, currentY + 4, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text("IFPR Campus Ivaiporã", 55, currentY + 7.5, { align: "center" });

      // Right Signature: Proprietário / Requerente
      doc.line(118, currentY, 192, currentY);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);
      doc.text(L("Proprietário / Requerente do Pertence", "Item Owner / Claimant"), 155, currentY + 4, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(L("Assinatura e Documento", "Signature and ID"), 155, currentY + 7.5, { align: "center" });

      // 8. Footer on All Pages with Page Numbers & Institutional Watermark
      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(6.5);
        doc.setTextColor(148, 163, 184);
        doc.setDrawColor(226, 232, 240);
        doc.line(14, 286, 196, 286);
        doc.text(
          L(
            `IFPR Campus Ivaiporã • Sistema de Gestão de Achados e Perdidos • Laudo ${docReportCode} • Página ${i} de ${totalPages}`,
            `IFPR Campus Ivaiporã • Lost and Found Management System • Report ${docReportCode} • Page ${i} of ${totalPages}`
          ),
          14,
          290
        );
        doc.text(
          `${L("Emitido em", "Issued on")} ${emissionDate}`,
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
      addToast(L("Relatório oficial PDF gerado e baixado com sucesso!", "Official PDF report generated and downloaded successfully!"), "success");
    } catch (error: any) {
      console.error("Erro ao gerar relatório oficial PDF:", error);
      addToast(L("Erro ao gerar relatório em PDF. Tente novamente.", "Error generating PDF report. Please try again."), "error");
    }
  };

  // Generate and Print PDF Receipt
  const handlePrintReceiptPDF = (overrideRecipientOrEvent?: {
    name?: string;
    email?: string;
    bond?: string;
    doc?: string;
    signatureDataUrl?: string;
  } | React.MouseEvent<HTMLElement>) => {
    const isEvent = Boolean(overrideRecipientOrEvent && ("nativeEvent" in overrideRecipientOrEvent || "preventDefault" in overrideRecipientOrEvent));
    const overrideRecipient = isEvent ? undefined : (overrideRecipientOrEvent as {
      name?: string;
      email?: string;
      bond?: string;
      doc?: string;
      signatureDataUrl?: string;
    } | undefined);

    const printWindow = window.open("", "_blank", "width=750,height=900");
    if (!printWindow) {
      addToast(L("Permita pop-ups no seu navegador para gerar o recibo PDF em tela cheia.", "Allow pop-ups in your browser to generate the full-screen PDF receipt."), "error");
      return;
    }

    const recipientName =
      overrideRecipient?.name ||
      returnRecipientName.trim() ||
      currentItem.recipientName ||
      currentItem.recipientSignatureName ||
      (approvedClaim ? approvedClaim.claimerName : "") ||
      L("Proprietário / Receptor", "Owner / Recipient");

    const recipientEmail =
      overrideRecipient?.email ||
      returnRecipientEmail.trim() ||
      currentItem.recipientEmail ||
      currentItem.recipientSignatureEmail ||
      (approvedClaim ? approvedClaim.claimerEmail : "") ||
      L("Não informado", "Not provided");

    const recipientBond = getBondLabel(
      overrideRecipient?.bond ||
        returnRecipientBond ||
        currentItem.recipientBond ||
        currentItem.recipientSignatureBond ||
        "Aluno"
    );

    const recipientDoc =
      overrideRecipient?.doc ||
      returnRecipientDocument.trim() ||
      currentItem.recipientDocument ||
      L("Documento oficial com foto conferido no balcão", "Official photo ID verified at the desk");

    const attendantName =
      currentItem.returnedByName ||
      currentUser?.name ||
      L("Servidor Responsável SEBAC / Portaria", "Responsible Staff SEBAC / Gatehouse");

    const attendantRole = translateUserRole(
      currentItem.returnedByRole || currentUser?.role || "SERVIDOR",
      language
    );

    const signatureDataUrl =
      overrideRecipient?.signatureDataUrl ||
      returnSignatureDataUrl ||
      currentItem.recipientSignatureUrl ||
      "";

    const isPendingRemote =
      currentItem.recipientSignatureStatus === "PENDING_REMOTE" && !signatureDataUrl;

    const safeId = String(currentItem?.id ?? "ITEM").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    const receiptCode = currentItem.receiptValidationCode || `REC-IFPR-${safeId}-${Date.now().toString().slice(-4)}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(L("Comprovante de Devolução IFPR", "IFPR Return Receipt"))} - ${escapeHtml(currentItem.id)}</title>
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
            .signatures { margin-top: 36px; display: flex; justify-content: space-between; gap: 32px; }
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
              <p>${escapeHtml(L("Campus Ivaiporã • Seção de Apoio ao Estudante (SEBAC)", "Campus Ivaiporã • Student Support Section (SEBAC)"))}</p>
              <div class="title-badge">${escapeHtml(L("Recibo Oficial de Devolução de Pertence", "Official Item Return Receipt"))}</div>
            </div>

            <div class="receipt-id">
              ${escapeHtml(L("Código de Validação", "Validation Code"))}: <strong>${escapeHtml(receiptCode)}</strong><br/>
              ${escapeHtml(L("Data de Emissão", "Issue Date"))}: <strong>${escapeHtml(fmtDateTime(new Date().toISOString()))}</strong>
            </div>

            <div class="section-title">${escapeHtml(L("1. Dados do Objeto Entregue", "1. Returned Item Details"))}</div>
            <table class="data-grid">
              <tr><td class="label">${escapeHtml(L("ID da Ocorrência:", "Record ID:"))}</td><td class="value">#${escapeHtml(currentItem.id)}</td></tr>
              <tr><td class="label">${escapeHtml(L("Título / Descrição:", "Title / Description:"))}</td><td class="value">${escapeHtml(currentItem.title)}</td></tr>
              <tr><td class="label">${escapeHtml(L("Categoria / Tipo:", "Category / Type:"))}</td><td class="value">${escapeHtml(translateCategory(getCategoryDisplay(currentItem.category), language))} (${escapeHtml(translateItemStatus(currentItem.type, language))})</td></tr>
              <tr><td class="label">${escapeHtml(L("Local onde foi Encontrado:", "Location Found:"))}</td><td class="value">${escapeHtml(translateCampusLocation(currentItem.location, language))}</td></tr>
              <tr><td class="label">${escapeHtml(L("Cor / Marca:", "Color / Brand:"))}</td><td class="value">${escapeHtml(currentItem.color ? translateColor(currentItem.color, language) : "N/A")} • ${escapeHtml(currentItem.brand || "N/A")}</td></tr>
              <tr><td class="label">${escapeHtml(L("Código de Rastreamento QR:", "QR Tracking Code:"))}</td><td class="value" style="font-family: monospace; color: #00843D;">${escapeHtml(currentItem.qrCodeId || currentItem.id)}</td></tr>
            </table>

            <div class="section-title">${escapeHtml(L("2. Dados do Proprietário / Recebedor", "2. Owner / Recipient Details"))}</div>
            <table class="data-grid">
              <tr><td class="label">${escapeHtml(L("Nome Completo:", "Full Name:"))}</td><td class="value"><strong>${escapeHtml(recipientName)}</strong></td></tr>
              <tr><td class="label">${escapeHtml(L("E-mail do Receptor:", "Recipient Email:"))}</td><td class="value">${escapeHtml(recipientEmail)}</td></tr>
              <tr><td class="label">${escapeHtml(L("Vínculo com o Campus:", "Campus Affiliation:"))}</td><td class="value">${escapeHtml(recipientBond)} • IFPR Ivaiporã</td></tr>
              <tr><td class="label">${escapeHtml(L("Documento / Matrícula:", "ID / Enrollment:"))}</td><td class="value">${escapeHtml(recipientDoc)}</td></tr>
              <tr><td class="label">${escapeHtml(L("Atendente Responsável:", "Responsible Attendant:"))}</td><td class="value">${escapeHtml(attendantName)} (${escapeHtml(attendantRole)})</td></tr>
            </table>

            <div class="signatures">
              <div class="sig-line">
                ${
                  isSafeDataImageUrl(signatureDataUrl)
                    ? `<img src="${signatureDataUrl}" style="max-height: 52px; max-width: 220px; margin: 0 auto 6px auto; display: block;" alt="${escapeHtml(L("Assinatura Digital", "Digital Signature"))}" />`
                    : isPendingRemote
                    ? `<div style="height: 40px; display: flex; align-items: center; justify-content: center; color: #d97706; font-size: 11px; font-weight: bold; font-style: italic;">${escapeHtml(L("[Assinatura Remota Pendente - Link Enviado]", "[Remote Signature Pending - Link Sent]"))}</div>`
                    : `<div style="height: 52px;"></div>`
                }
                <strong>${escapeHtml(recipientName)}</strong><br/>
                <span style="font-weight: normal; font-size: 10px; color: #64748b;">${escapeHtml(L("Assinatura do Recebedor", "Recipient Signature"))} (${escapeHtml(recipientBond)})</span>
              </div>
              <div class="sig-line">
                ${
                  isSafeDataImageUrl(currentItem.staffSignatureUrl)
                    ? `<img src="${currentItem.staffSignatureUrl}" style="max-height: 52px; max-width: 220px; margin: 0 auto 6px auto; display: block;" alt="${escapeHtml(L("Assinatura do Atendente", "Attendant Signature"))}" />`
                    : currentItem.staffSignatureStatus === "PENDING_STAFF"
                    ? `<div style="height: 40px; display: flex; align-items: center; justify-content: center; color: #d97706; font-size: 11px; font-weight: bold; font-style: italic;">${escapeHtml(L("[Atestação Institucional Pendente]", "[Institutional Attestation Pending]"))}</div>`
                    : `<div style="height: 52px;"></div>`
                }
                <strong>${escapeHtml(currentItem.staffSignerName || attendantName)}</strong><br/>
                <span style="font-weight: normal; font-size: 10px; color: #64748b;">${escapeHtml(attendantRole)} • ${escapeHtml(L("SEBAC / Portaria IFPR", "SEBAC / IFPR Gatehouse"))}</span>
              </div>
            </div>

            <div class="footer">
              ${escapeHtml(L("Este recibo comprova a restituição legal do pertence registrado no Sistema de Achados & Perdidos do IFPR Campus Ivaiporã.", "This receipt certifies the lawful return of the item registered in the IFPR Campus Ivaiporã Lost & Found System."))}<br/>
              ${escapeHtml(L("Em conformidade com a Lei Federal nº 14.063/2020 (Art. 5º, I - Assinatura Eletrônica Simples).", "In accordance with Brazilian Federal Law No. 14.063/2020 (Art. 5, I - Simple Electronic Signature)."))}
            </div>
          </div>

          <button id="btnPrintReceipt" class="btn-print no-print">🖨️ ${escapeHtml(L("Imprimir / Salvar Recibo PDF", "Print / Save PDF Receipt"))}</button>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();

    const btn = printWindow.document.getElementById("btnPrintReceipt");
    if (btn) {
      btn.addEventListener("click", () => {
        printWindow.print();
      });
    }

    printWindow.addEventListener("load", () => {
      setTimeout(() => {
        try {
          printWindow.focus();
          printWindow.print();
        } catch (_) {}
      }, 300);
    });

    setTimeout(() => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch (_) {}
    }, 500);
  };

  // Download high-resolution QR Code PNG for tracking and identification
  const handleDownloadQRCodePNG = () => {
    vibrateClick();
    try {
      const qrSvg = document.getElementById(`qr-code-svg-${currentItem.id}`) as unknown as SVGElement | null;
      if (!qrSvg) {
        addToast(L("Código QR não encontrado no documento.", "QR Code not found in the document."), "error");
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
          ctx.fillText(L("SISTEMA DE ACHADOS E PERDIDOS", "LOST AND FOUND SYSTEM"), canvas.width / 2, 90);

          // Draw QR Code Image
          const qrSize = 340;
          ctx.drawImage(img, (canvas.width - qrSize) / 2, 115, qrSize, qrSize);

          // Item Title
          ctx.font = "bold 22px sans-serif";
          ctx.fillStyle = "#1E293B";
          const cleanTitle = currentItem.title.length > 32 ? currentItem.title.substring(0, 29) + "..." : currentItem.title;
          ctx.fillText(cleanTitle, canvas.width / 2, 500);

          // QR Code ID Tag
          ctx.font = "bold 18px monospace";
          ctx.fillStyle = "#00843D";
          ctx.fillText(`${L("CÓDIGO", "CODE")}: ${currentItem.qrCodeId}`, canvas.width / 2, 535);

          // Location & Date Info
          ctx.font = "16px sans-serif";
          ctx.fillStyle = "#475569";
          ctx.fillText(
            `${L("Local", "Location")}: ${translateCampusLocation(currentItem.location, language)} • ${L("Data", "Date")}: ${fmtDate(currentItem.date)}`,
            canvas.width / 2,
            570
          );

          // Category & Type Badge Info
          ctx.font = "14px sans-serif";
          ctx.fillStyle = "#64748B";
          ctx.fillText(
            `${L("Categoria", "Category")}: ${translateCategory(getCategoryDisplay(currentItem.category), language)} (${translateItemStatus(currentItem.type, language)})`,
            canvas.width / 2,
            600
          );

          // Footer Guidance
          ctx.fillStyle = "#F8FAFC";
          ctx.fillRect(20, 630, canvas.width - 40, 50);
          ctx.font = "13px sans-serif";
          ctx.fillStyle = "#334155";
          ctx.fillText(
            L(
              "Apresente na guarita / SEBAC para identificação e devolução.",
              "Present at the gatehouse / SEBAC for identification and return."
            ),
            canvas.width / 2,
            660
          );

          const pngUrl = canvas.toDataURL("image/png");
          const downloadLink = document.createElement("a");
          downloadLink.href = pngUrl;
          downloadLink.download = `qrcode_${currentItem.qrCodeId || currentItem.id}.png`;
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
          URL.revokeObjectURL(url);

          vibrateSuccess();
          addToast(L("Código QR baixado em formato PNG de alta resolução!", "QR Code downloaded as a high-resolution PNG!"), "success");
        }
      };
      img.src = url;
    } catch (err) {
      console.error("Erro ao fazer download do QR Code:", err);
      addToast(L("Erro ao exportar imagem do Código QR.", "Error exporting QR Code image."), "error");
    }
  };

  // Web Share API Implementation for native sharing (WhatsApp, Email, Telegram, System Share Sheet)
  const handleShareItem = async () => {
    vibrateClick();
    const typeLabel =
      currentItem.type === "PERDIDO"
        ? L("Objeto Perdido", "Lost Item")
        : L("Objeto Encontrado", "Found Item");
    const shareTitle = `[${L("IFPR Achados e Perdidos", "IFPR Lost & Found")}] ${typeLabel}: ${currentItem.title}`;
    const shareText = `${L("Campus Ivaiporã", "Campus Ivaiporã")} • ${typeLabel}: "${currentItem.title}" (${translateCategory(getCategoryDisplay(currentItem.category), language)})\n${L("Local", "Location")}: ${translateCampusLocation(currentItem.location, language)}\n${L("Data", "Date")}: ${fmtDate(currentItem.date)}\n${L("Situação", "Status")}: ${translateItemStatus(currentItem.status, language)}\n\n${L("Consulte o item no Localiza+ IFPR:", "View this item on Localiza+ IFPR:")}`;
    const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/?tab=${currentItem.type === "PERDIDO" ? "lost" : "found"}&itemId=${encodeURIComponent(currentItem.id)}` : "";

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        vibrateSuccess();
        addToast(L("Detalhes do item compartilhados com sucesso!", "Item details shared successfully!"), "success");
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
          addToast(
            L(
              "Link e informações do objeto copiados! Você já pode colar no WhatsApp ou E-mail.",
              "Item link and details copied! You can now paste them in WhatsApp or email."
            ),
            "info"
          );
        })
        .catch(() => {
          addToast(`${L("Link do item", "Item link")}: ${url}`, "info");
        });
    } else {
      addToast(`${L("Link do item", "Item link")}: ${url}`, "info");
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    setIsPostingComment(true);
    try {
      await addCommentToItem(currentItem.id, newCommentText.trim());
      setNewCommentText("");
    } catch {
      // Erro real e toast já tratados em addCommentToItem; manter texto para o usuário tentar novamente
    } finally {
      setIsPostingComment(false);
    }
  };

  // Resolve authoritative signature token/link strictly via backend /api/signature/send-request
  const resolveRemoteSignatureLink = async (mode: "LINK_ONLY" | "EMAIL"): Promise<{ token: string; signatureLink: string; message?: string }> => {
    if (!currentItem?.id) {
      throw new Error(L("Identificador da ocorrência ausente.", "Missing record identifier."));
    }
    if (!canSignAsStaff || !auth.currentUser) {
      throw new Error(L("Apenas servidores emissores ou administradores ativos podem gerenciar links de assinatura.", "Only issuing staff or active administrators can manage signature links."));
    }

    const idToken = await auth.currentUser.getIdToken();
    const res = await fetch("/api/signature/send-request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        itemId: currentItem.id,
        mode,
        originUrl: window.location.origin,
      }),
    });

    const resJson = await res.json().catch(() => ({}));
    if (!res.ok || !resJson?.success) {
      throw new Error(resJson?.error || L(`Erro HTTP ${res.status} ao obter link de assinatura.`, `HTTP ${res.status} error while retrieving signature link.`));
    }

    if (!resJson.token || !resJson.signatureLink) {
      throw new Error(L("Servidor não retornou token ou link válido de assinatura.", "Server did not return a valid signature token or link."));
    }

    return {
      token: String(resJson.token),
      signatureLink: String(resJson.signatureLink),
      message: resJson.message,
    };
  };

  const handleOpenInPersonRemoteSignature = async () => {
    if (!canSignAsStaff) return;
    setIsResolvingRemoteLink(true);
    try {
      const { token } = await resolveRemoteSignatureLink("LINK_ONLY");
      setResolvedRemoteToken(token);
      setRemoteSignatureModalOpen(true);
    } catch (e: any) {
      console.error("[handleOpenInPersonRemoteSignature] Falha:", e?.message || e);
      addToast(e?.message || L("Erro ao preparar assinatura presencial do termo pendente.", "Error preparing in-person signature for the pending form."), "error");
    } finally {
      setIsResolvingRemoteLink(false);
    }
  };

  const handleCopyRemoteSignatureLink = async () => {
    if (!canSignAsStaff) return;
    setIsResolvingRemoteLink(true);
    try {
      const { signatureLink } = await resolveRemoteSignatureLink("LINK_ONLY");
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(signatureLink);
      }
      vibrateSuccess();
      addToast(L("Link de assinatura digital copiado para a área de transferência!", "Digital signature link copied to clipboard!"), "success");
    } catch (e: any) {
      console.error("[handleCopyRemoteSignatureLink] Falha:", e?.message || e);
      addToast(e?.message || L("Erro ao obter link seguro de assinatura.", "Error retrieving secure signature link."), "error");
    } finally {
      setIsResolvingRemoteLink(false);
    }
  };

  // Handle Resend Signature Email
  const handleResendSignatureEmail = async () => {
    if (!currentItem?.id || !canSignAsStaff) return;
    setIsResendingSignatureEmail(true);
    try {
      const resJson = await resolveRemoteSignatureLink("EMAIL");
      vibrateSuccess();
      addToast(resJson.message || L("Link de assinatura digital reenviado com sucesso por e-mail!", "Digital signature link resent via email!"), "success");
    } catch (e: any) {
      console.error("[handleResendSignatureEmail] Falha:", e?.message || e);
      addToast(e?.message || L("Erro ao reenviar e-mail de assinatura.", "Error resending signature email."), "error");
    } finally {
      setIsResendingSignatureEmail(false);
    }
  };

  // Handle Submit Devolution Registration
  const handleRegisterReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnRecipientName.trim() || !returnRecipientEmail.trim() || !returnIdentityConfirmed) {
      addToast(L("Preencha os dados do receptor e confirme a verificação do documento com foto.", "Fill in the recipient details and confirm photo ID verification."), "error");
      return;
    }

    if (returnSignatureMode === "IN_PERSON_DEVICE" && !returnSignatureDataUrl) {
      addToast(L("Por favor, colha a assinatura digital do recebedor no quadro abaixo antes de confirmar.", "Please collect the recipient's digital signature in the box below before confirming."), "error");
      return;
    }

    setIsRegisteringReturn(true);
    try {
      await registerItemReturn(currentItem.id, {
        recipientName: returnRecipientName.trim(),
        recipientEmail: returnRecipientEmail.trim(),
        recipientBond: returnRecipientBond,
        recipientDocument: returnRecipientDocument.trim(),
        identityVerified: returnIdentityConfirmed,
        observations: returnObservations.trim(),
        signatureType: returnSignatureMode,
        signatureStatus: returnSignatureMode === "IN_PERSON_DEVICE" ? "SIGNED" : "PENDING_REMOTE",
        signatureDataUrl: returnSignatureMode === "IN_PERSON_DEVICE" ? returnSignatureDataUrl : undefined,
      });

      vibrateSuccess();
      addToast(
        returnSignatureMode === "IN_PERSON_DEVICE"
          ? L(
              `Devolução e Assinatura Digital do objeto "${currentItem.title}" registradas com sucesso!`,
              `Return and digital signature for "${currentItem.title}" recorded successfully!`
            )
          : L(
              `Devolução registrada! Link de assinatura digital enviado para ${returnRecipientEmail}.`,
              `Return recorded! Digital signature link dispatched to ${returnRecipientEmail}.`
            ),
        "success"
      );
      setReturnModalOpen(false);
      handlePrintReceiptPDF({
        name: returnRecipientName.trim(),
        email: returnRecipientEmail.trim(),
        bond: returnRecipientBond,
        doc: returnRecipientDocument.trim(),
        signatureDataUrl: returnSignatureMode === "IN_PERSON_DEVICE" ? returnSignatureDataUrl : undefined,
      });
      onClose();
    } catch (err: any) {
      console.error(err);
      addToast(err?.message || L("Erro ao registrar devolução do objeto.", "Error registering item return."), "error");
    } finally {
      setIsRegisteringReturn(false);
    }
  };

  // Handle Submit Reopen Return (Admin Only)
  const handleReopenReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenReason.trim()) {
      addToast(L("Por favor, preencha a justificativa para a reabertura.", "Please provide a reason for reopening."), "error");
      return;
    }

    setIsReopeningReturn(true);
    try {
      await reopenItemReturn(currentItem.id, reopenReason.trim());
      setReopenModalOpen(false);
      onClose();
    } catch (err) {
      console.error("[handleReopenReturnSubmit] Erro:", err);
    } finally {
      setIsReopeningReturn(false);
    }
  };

  // Handle Submit Destination (Unclaimed Items)
  const handleDestinationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destinationNotes.trim()) {
      addToast(L("Informe a justificativa/destinatário da destinação.", "Enter the beneficiary or reason for disposal/donation."), "error");
      return;
    }

    setIsRegisteringDestination(true);
    try {
      await registerItemDestination(currentItem.id, destinationType, destinationNotes.trim());
      setDestinationModalOpen(false);
      onClose();
    } catch (err) {
      console.error("[handleDestinationSubmit] Erro:", err);
    } finally {
      setIsRegisteringDestination(false);
    }
  };

  const itemComments = comments.filter((c) => c.itemId === currentItem.id);

  const handlePrintQRTag = () => {
    const printWindow = window.open("", "_blank", "width=700,height=800");
    if (!printWindow) {
      addToast(L("Permita pop-ups no navegador para visualizar e imprimir a etiqueta em PDF.", "Allow browser pop-ups to preview and print the PDF tag."), "error");
      return;
    }
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(L("Etiqueta IFPR", "IFPR Tag"))} - ${escapeHtml(currentItem.id)}</title>
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
              <p>${escapeHtml(L("Achados e Perdidos • Etiqueta de Identificação", "Lost & Found • Identification Tag"))}</p>
            </div>
            <div class="qr-box">
              <img class="qr-code-img" src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(getItemPublicUrl(currentItem))}" alt="${escapeHtml(L("Código QR", "QR Code"))}" />
              <div class="qr-id">${escapeHtml(currentItem.qrCodeId || currentItem.id)}</div>
            </div>
            <table class="info-table">
              <tr><td class="label">${escapeHtml(L("ID da Ocorrência:", "Record ID:"))}</td><td><strong>${escapeHtml(currentItem.id)}</strong></td></tr>
              <tr><td class="label">${escapeHtml(L("Título do Item:", "Item Title:"))}</td><td><strong>${escapeHtml(currentItem.title)}</strong></td></tr>
              <tr><td class="label">${escapeHtml(L("Categoria / Tipo:", "Category / Type:"))}</td><td>${escapeHtml(translateCategory(getCategoryDisplay(currentItem.category), language))} (${escapeHtml(translateItemStatus(currentItem.type, language))})</td></tr>
              <tr><td class="label">${escapeHtml(L("Local Encontrado:", "Location Found:"))}</td><td>${escapeHtml(translateCampusLocation(currentItem.location, language))}</td></tr>
              <tr><td class="label">${escapeHtml(L("Data de Entrada:", "Entry Date:"))}</td><td>${escapeHtml(fmtDate(currentItem.date))}</td></tr>
              <tr><td class="label">${escapeHtml(L("Cor / Marca:", "Color / Brand:"))}</td><td>${escapeHtml(currentItem.color ? translateColor(currentItem.color, language) : "N/A")} • ${escapeHtml(currentItem.brand || "N/A")}</td></tr>
              <tr><td class="label">${escapeHtml(L("Atendimento:", "Service Desk:"))}</td><td>${escapeHtml(L("Guarita Principal / SEBAC Campus Ivaiporã", "Main Gatehouse / SEBAC Campus Ivaiporã"))}</td></tr>
            </table>
            <div class="footer">
              ${escapeHtml(L("Sistema Oficial de Gestão de Achados e Perdidos • IFPR Campus Ivaiporã", "Official Lost and Found Management System • IFPR Campus Ivaiporã"))}
            </div>
          </div>
          <button id="btnPrintTag" class="btn-print no-print">🖨️ ${escapeHtml(L("Imprimir / Salvar como PDF", "Print / Save as PDF"))}</button>
        </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    const btn = printWindow.document.getElementById("btnPrintTag");
    if (btn) {
      btn.addEventListener("click", () => {
        printWindow.print();
      });
    }

    printWindow.addEventListener("load", () => {
      setTimeout(() => {
        try {
          printWindow.focus();
          printWindow.print();
        } catch (_) {}
      }, 300);
    });

    setTimeout(() => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch (_) {}
    }, 500);
  };

  const handleSendEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailSubject || !emailBody) {
      addToast(L("Preencha o assunto e a mensagem.", "Please enter a subject and message."), "error");
      return;
    }
    setIsSendingEmail(true);
    try {
      const targetUser = allUsers.find((u) => u.email === recipientEmail);
      const targetUserId = targetUser?.id || (currentItem.registeredByUserId && currentItem.registeredByUserId !== "guest_visitor" ? currentItem.registeredByUserId : null);
      if (!targetUserId || targetUserId === "all") {
        addToast(L("Não foi possível identificar o destinatário específico associado a este item.", "Could not identify the specific recipient associated with this item."), "error");
        setIsSendingEmail(false);
        return;
      }
      await sendNotificationToUser(
        targetUserId,
        emailSubject,
        L(
          `Mensagem referente ao item "${currentItem.title}": ${emailBody}`,
          `Message regarding item "${currentItem.title}": ${emailBody}`
        ),
        currentItem.id
      );
      setEmailModalOpen(false);
      setEmailBody("");
    } catch (err: any) {
      console.error("Erro ao registrar notificação:", err);
      addToast(L("Erro ao processar notificação institucional.", "Error processing institutional notification."), "error");
    } finally {
      setIsSendingEmail(false);
    }
  };

  const allImages = [currentItem.imageUrl, ...(currentItem.additionalImages || [])].filter(
    (img): img is string => Boolean(img && img.trim().length > 0)
  );

  const isOwner = Boolean(
    !isGuest &&
      currentUser &&
      currentUser.id !== "guest" &&
      currentItem.registeredByUserId &&
      currentItem.registeredByUserId === currentUser.id
  );
  const isAuthorizedToEdit = isOwner || currentUser.role === "ADMIN" || currentUser.role === "SERVIDOR";

  const handleSaveEditedItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthorizedToEdit) {
      addToast(L("Você não possui autorização para editar as informações deste objeto.", "You are not authorized to edit this item's details."), "error");
      return;
    }
    if (!editTitle.trim()) {
      addToast(L("O título do objeto não pode ficar em branco.", "The item title cannot be empty."), "error");
      return;
    }
    const textValidation = validateItemTextFields({
      title: editTitle,
      description: editDescription,
      location: editLocation,
      color: editColor,
      brand: editBrand,
      contactInfo: editContactInfo,
    }, false);
    if (!textValidation.isValid) {
      addToast(textValidation.error || L("Limite de caracteres excedido.", "Character limit exceeded."), "error");
      return;
    }
    const dateValidation = validateItemOccurrenceDate(editDate, L("A data da ocorrência", "The occurrence date"));
    if (!dateValidation.isValid) {
      addToast(dateValidation.error || L("Data inválida ou futura não permitida.", "Invalid or future date is not allowed."), "error");
      return;
    }
    setIsSavingEdit(true);
    try {
      await updateItemData(currentItem.id, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        category: normalizeCategory(editCategory),
        location: editLocation.trim(),
        date: editDate.trim(),
        color: editColor.trim(),
        brand: editBrand.trim(),
        contactInfo: editContactInfo.trim(),
      });
      setIsSavingEdit(false);
      setEditItemModalOpen(false);
      addToast(L("Informações do objeto atualizadas com sucesso!", "Item details updated successfully!"), "success");
    } catch (err) {
      setIsSavingEdit(false);
      console.error("Erro ao atualizar objeto:", err);
      addToast(L("Erro ao gravar alterações do objeto.", "Error saving item changes."), "error");
    }
  };

  const handleClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuest || !currentUser || currentUser.id === "guest") {
      addToast(L("Faça login com sua conta para solicitar a devolução deste objeto.", "Sign in to your account to claim this item."), "warning");
      return;
    }
    if (!claimDistinctiveFeatures.trim()) {
      addToast(L("Informe as características particulares para comprovar a posse do objeto.", "Provide distinctive features to prove ownership of the item."), "error");
      return;
    }

    try {
      setIsSubmittingClaim(true);
      const result = await submitClaim(currentItem.id, {
        distinctiveFeatures: claimDistinctiveFeatures.trim(),
        additionalInfo: claimAdditionalInfo.trim() || undefined,
      });

      if (result && !result.success) {
        // Mensagem específica já foi emitida pelo submitClaim
        setClaimModalOpen(false);
        return;
      }

      vibrateSuccess();
      addToast(
        result?.message ||
          L(
            "Solicitação de devolução registrada com sucesso! A Secretaria avaliará suas informações.",
            "Return claim submitted successfully! The campus office will review your information."
          ),
        "success"
      );
      setClaimModalOpen(false);
      setClaimDistinctiveFeatures("");
      setClaimAdditionalInfo("");
    } catch (err: any) {
      console.error("[handleClaimSubmit] Erro:", err);
      if (
        !err?.message?.includes("já possui uma solicitação") &&
        !err?.message?.includes("Solicitação já existente") &&
        !err?.message?.includes("indisponível") &&
        !err?.message?.includes("não recebe novas")
      ) {
        addToast(err?.message || L("Erro ao registrar solicitação de devolução.", "Error submitting return claim."), "error");
      }
    } finally {
      setIsSubmittingClaim(false);
    }
  };

  const getStatusBadgeTone = (
    status: LostFoundItem["status"]
  ): "emerald" | "rose" | "amber" | "blue" | "slate" => {
    switch (status) {
      case "PERDIDO":
        return "rose";
      case "ENCONTRADO":
        return "emerald";
      case "EM_ANALISE":
        return "amber";
      case "DEVOLVIDO":
        return "blue";
      default:
        return "slate";
    }
  };

  const getStatusLabel = (status: LostFoundItem["status"]) =>
    translateItemStatus(status || "REGISTRADO", language);

  // Progress Tracker Step States
  const step1Done = true; // Reported/Registered
  const step2Done =
    currentItem.status === "EM_ANALISE" ||
    currentItem.status === "DEVOLVIDO" ||
    claims.some((c) => c.itemId === currentItem.id);
  const step3Done = currentItem.status === "DEVOLVIDO";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 dark:bg-black/75 overscroll-contain transition-opacity duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          vibrateClick();
          onClose();
        }
      }}
    >
      <div
        className="relative w-full max-w-4xl bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-slate-100 rounded-t-2xl sm:rounded-2xl border-t sm:border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[92dvh] sm:max-h-[88dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra Superior Minimalista Mobile-First */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                onClose();
              }}
              className="min-h-[40px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4 text-[#16845B]" />
              <span>{t("back")}</span>
            </button>

            <UIBadge tone={getStatusBadgeTone(currentItem?.status || "PERDIDO")}>
              {getStatusLabel(currentItem?.status || "PERDIDO")}
            </UIBadge>

            {isItemNew(currentItem) && (
              <span
                id={`detail-new-badge-${currentItem.id}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#16845B] text-white"
                title={L("Cadastrado nas últimas 24 horas no campus", "Registered on campus in the last 24 hours")}
              >
                <span>{L("Recente", "Recent")}</span>
              </span>
            )}

            <button
              type="button"
              onClick={() => {
                vibrateClick();
                if (typeof navigator !== "undefined" && navigator.clipboard) {
                  navigator.clipboard.writeText(currentItem.id);
                  addToast(
                    L(
                      "ID do objeto copiado para a área de transferência!",
                      "Item ID copied to clipboard!"
                    ),
                    "info"
                  );
                }
              }}
              title={L("Clique para copiar o ID do registro", "Click to copy record ID")}
              className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-mono transition-colors cursor-pointer"
            >
              <Copy className="w-3 h-3 text-slate-400" />
              <span>
                #{currentItem.id.length > 12 ? `${currentItem.id.slice(0, 8)}...` : currentItem.id}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <UIButton
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                vibrateClick();
                handleGenerateItemSummaryPDF();
              }}
              aria-label={L("Gerar Laudo e Relatório Oficial em PDF deste Item", "Generate official PDF report for this item")}
              title={L("Gerar Laudo / Relatório Oficial em PDF", "Generate Official PDF Report")}
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">PDF</span>
            </UIButton>

            <UIButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                vibrateClick();
                handleShareItem();
              }}
              aria-label={L("Compartilhar link deste item", "Share link to this item")}
              title={L("Compartilhar Link do Item", "Share Item Link")}
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{L("Compartilhar", "Share")}</span>
            </UIButton>

            <button
              type="button"
              onClick={() => {
                vibrateClick();
                onClose();
              }}
              aria-label={L("Fechar detalhes do item", "Close item details")}
              className="w-10 h-10 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Main Body */}
        <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-8 overflow-y-auto min-h-0 flex-1 overscroll-contain pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          {/* Left Column: Image Gallery, Tramitation Journey & QR Code */}
          <div className="space-y-4">
            {/* Object Image Presentation */}
            <div className="relative h-56 sm:h-72 w-full rounded-xl bg-[#F8FAFC] dark:bg-slate-900 overflow-hidden border border-slate-200/80 dark:border-slate-800 flex items-center justify-center">
              {allImages.length > 0 &&
              allImages[activeImageIndex] &&
              !mainImageError ? (
                <img
                  src={allImages[activeImageIndex]}
                  alt={currentItem.title}
                  onError={() => setMainImageError(true)}
                  className="w-full h-full object-contain p-2"
                />
              ) : (
                <div
                  className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-slate-500 dark:text-slate-400 bg-[#F8FAFC] dark:bg-slate-900"
                  aria-label={L("Sem foto anexada", "No photo attached")}
                >
                  <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 mb-2">
                    <CameraOff className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-semibold text-[#172B2A] dark:text-slate-200">
                    {L("Sem foto anexada", "No photo attached")}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 max-w-xs leading-relaxed">
                    {L(
                      "Este objeto foi registrado no IFPR Campus Ivaiporã sem fotografia.",
                      "This item was registered at IFPR Campus Ivaiporã without a photo."
                    )}
                  </span>
                </div>
              )}
            </div>

            {/* Thumbnails if multiple */}
            {allImages.length > 1 && !mainImageError && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {allImages.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setMainImageError(false);
                      setActiveImageIndex(idx);
                    }}
                    className={`w-14 h-14 rounded-xl overflow-hidden border transition-all cursor-pointer shrink-0 ${
                      activeImageIndex === idx
                        ? "border-[#16845B] ring-2 ring-[#16845B]/30 scale-105"
                        : "border-slate-200 dark:border-slate-700 opacity-60 hover:opacity-100"
                    }`}
                  >
                    <img
                      src={img}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Visual Journey Progress Tracker (Minimalist Stepper) */}
            <SubtlePanel className="space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-[#172B2A] dark:text-slate-200">
                <div className="flex items-center gap-1.5 text-[#16845B] dark:text-emerald-400">
                  <Clock className="w-4 h-4" />
                  <span>{L("Jornada de Tramitação", "Handling Progress")}</span>
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  {currentItem.status === "DEVOLVIDO"
                    ? L("Concluído", "Completed")
                    : L("Em andamento", "In progress")}
                </span>
              </div>

              <div className="relative flex items-center justify-between pt-2 px-3">
                {/* Connecting Line */}
                <div className="absolute top-5 left-8 right-8 h-0.5 bg-slate-200 dark:bg-slate-700 -z-0">
                  <div
                    className="h-full bg-[#16845B] transition-all duration-500"
                    style={{
                      width: step3Done ? "100%" : step2Done ? "50%" : "0%",
                    }}
                  />
                </div>

                {/* Step 1: Reported */}
                <div className="relative z-10 flex flex-col items-center text-center space-y-1">
                  <div className="w-8 h-8 rounded-full bg-[#16845B] text-white flex items-center justify-center font-bold text-xs shadow-xs">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <span className="font-semibold text-[11px] text-[#172B2A] dark:text-slate-200">
                    {L("Registrado", "Registered")}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                    {fmtDate(currentItem.date)}
                  </span>
                </div>

                {/* Step 2: Under Review */}
                <div className="relative z-10 flex flex-col items-center text-center space-y-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shadow-xs transition-colors ${
                      step2Done
                        ? "bg-[#16845B] text-white"
                        : "bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-400"
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <span
                    className={`font-semibold text-[11px] ${
                      step2Done
                        ? "text-[#172B2A] dark:text-slate-200"
                        : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {L("Em Análise", "Under Review")}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    {L("Validação SEBAC", "SEBAC Verification")}
                  </span>
                </div>

                {/* Step 3: Returned */}
                <div className="relative z-10 flex flex-col items-center text-center space-y-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shadow-xs transition-colors ${
                      step3Done
                        ? "bg-sky-600 text-white"
                        : "bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-400"
                    }`}
                  >
                    <FileCheck className="w-4 h-4" />
                  </div>
                  <span
                    className={`font-semibold text-[11px] ${
                      step3Done
                        ? "text-sky-600 dark:text-sky-400"
                        : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {L("Devolvido", "Returned")}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                    {currentItem.resolutionDate
                      ? fmtDate(currentItem.resolutionDate)
                      : L("Pendente", "Pending")}
                  </span>
                </div>
              </div>
            </SubtlePanel>

            {/* QR Code & Label Container */}
            <SubtlePanel className="border-[#16845B]/20 dark:border-emerald-800/50 space-y-3.5">
              <div className="flex items-center gap-3.5">
                <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-2xs shrink-0">
                  <QRCodeSVG
                    id={`qr-code-svg-${currentItem.id}`}
                    value={getItemQrValue(currentItem)}
                    size={68}
                    level="H"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h5 className="font-bold text-xs text-[#172B2A] dark:text-white flex items-center gap-1.5">
                    <QrCode className="w-3.5 h-3.5 text-[#16845B] dark:text-emerald-400" />{" "}
                    {L("Código Etiqueta QR", "QR Tag Code")}
                  </h5>
                  <p className="text-[11px] text-[#16845B] dark:text-emerald-400 font-mono font-semibold mt-0.5 truncate">
                    {currentItem.qrCodeId}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                    {L(
                      "Apresente este código no setor responsável do IFPR para identificação e baixa oficial.",
                      "Present this code at the IFPR service desk for identification and official check-out."
                    )}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                <UIButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowRestrictedQRView(true)}
                >
                  <Eye className="w-3.5 h-3.5 text-[#16845B] dark:text-emerald-400" />
                  <span>{L("Modo QR", "QR Mode")}</span>
                </UIButton>

                <UIButton
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleDownloadQRCodePNG}
                  title={L("Baixar imagem PNG do Código QR em alta resolução", "Download high-resolution QR Code PNG image")}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{L("Baixar PNG", "Download PNG")}</span>
                </UIButton>

                <UIButton
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePrintQRTag}
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{L("Etiqueta", "Tag")}</span>
                </UIButton>

                <UIButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleGenerateItemSummaryPDF}
                  title={L("Gerar Ficha / Relatório Oficial do Campus em PDF", "Generate Official Campus PDF Report")}
                >
                  <FileText className="w-3.5 h-3.5 text-[#16845B] dark:text-emerald-400" />
                  <span>{L("Laudo PDF", "PDF Report")}</span>
                </UIButton>

                <UIButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handlePrintReceiptPDF}
                  className="col-span-2 sm:col-span-1"
                  title={L("Recibo de Devolução Individual", "Individual Return Receipt")}
                >
                  <FileCheck className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  <span>{L("Recibo PDF", "PDF Receipt")}</span>
                </UIButton>
              </div>
            </SubtlePanel>
          </div>

          {/* Right Column: Core Information, Recovery Guidance & Actions (Matching Moodboard "Mochila") */}
          <div className="space-y-5">
            {/* Title, Status Pill, Date & Location Hierarchy */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#16845B] dark:text-emerald-400">
                  <Tag className="w-3.5 h-3.5" />
                  <span>{translateCategory(getCategoryDisplay(currentItem.category), language)}</span>
                </span>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <UIBadge tone={getStatusBadgeTone(currentItem?.status || "PERDIDO")}>
                  {getStatusLabel(currentItem?.status || "PERDIDO")}
                </UIBadge>
              </div>

              <h2
                id="item-modal-title"
                className="text-2xl sm:text-3xl font-bold text-[#172B2A] dark:text-white tracking-tight break-words"
              >
                {currentItem.title}
              </h2>

              {/* Date & Location Key Indicators (Matching Reference Screen) */}
              <div className="space-y-1.5 pt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#16845B] dark:text-emerald-400 shrink-0" />
                  <span className="font-medium">{fmtDate(currentItem.date)}</span>
                  {currentItem.createdAt && (
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      • {getItemAgeText(currentItem.createdAt, undefined, language)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#16845B] dark:text-emerald-400 shrink-0" />
                  <span className="font-medium text-[#172B2A] dark:text-white">
                    {translateCampusLocation(currentItem.location, language)}
                  </span>
                </div>
              </div>
            </div>

            {/* Description Section */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {L("Descrição do Objeto", "Item Description")}
              </h4>
              <p className="text-sm text-[#172B2A] dark:text-slate-200 leading-relaxed break-words">
                {currentItem.description}
              </p>
            </div>

            {/* Additional Characteristics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70">
                <span className="text-slate-500 dark:text-slate-400 block mb-0.5 text-[11px]">
                  {L("Cor Predominante", "Primary Color")}
                </span>
                <span className="font-semibold text-[#172B2A] dark:text-slate-100">
                  {currentItem.color ? translateColor(currentItem.color, language) : L("Não informada", "Not provided")}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70">
                <span className="text-slate-500 dark:text-slate-400 block mb-0.5 text-[11px]">
                  {L("Marca / Fabricante", "Brand / Manufacturer")}
                </span>
                <span className="font-semibold text-[#172B2A] dark:text-slate-100">
                  {currentItem.brand || L("Não informada", "Not provided")}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 col-span-2 sm:col-span-1">
                <span className="text-slate-500 dark:text-slate-400 block mb-0.5 text-[11px]">
                  {L("Cadastrado por", "Registered by")}
                </span>
                <span className="font-semibold text-[#172B2A] dark:text-slate-100 truncate block">
                  {currentItem.registeredByName}
                </span>
              </div>
            </div>

            {/* Accessible Voice Reader (Text-to-Speech) */}
            <AccessibleVoiceReader item={currentItem} />

            {/* "Como recuperar?" Recovery Instructions Box (Matching Reference Moodboard) */}
            <div className="p-4 rounded-2xl bg-[#EBF5F0]/70 dark:bg-emerald-950/30 border border-[#16845B]/20 dark:border-emerald-800/50 space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-bold text-[#064E3B] dark:text-emerald-300">
                <Building className="w-4 h-4 text-[#16845B] dark:text-emerald-400 shrink-0" />
                <span>{L("Como recuperar?", "How to recover?")}</span>
              </div>
              <p className="text-xs sm:text-sm text-[#172B2A] dark:text-slate-200 leading-relaxed">
                {L(
                  "Compareça na administração / ponto de guarda do campus com um documento oficial de identificação ou envie uma solicitação abaixo.",
                  "Visit the campus office / custody desk with an official photo ID, or submit a claim below."
                )}
              </p>
              {currentItem.contactInfo && (
                <p className="text-xs font-semibold text-[#064E3B] dark:text-emerald-300 pt-1">
                  {L("Ponto de atendimento / Contato:", "Service desk / Contact:")} {currentItem.contactInfo}
                </p>
              )}
            </div>

            {/* Digital Signature Card (If Item is Returned or Signature in Progress) */}
            {(currentItem.status === "DEVOLVIDO" ||
              currentItem.recipientSignatureStatus ||
              currentItem.recipientSignatureUrl) && (
              <div
                className={`p-4 rounded-2xl border transition-all ${
                  currentItem.recipientSignatureStatus === "SIGNED" ||
                  currentItem.recipientSignatureUrl
                    ? "bg-[#EBF5F0]/60 dark:bg-emerald-950/30 border-[#16845B]/30 dark:border-emerald-800/60"
                    : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`p-2 rounded-xl shrink-0 ${
                        currentItem.recipientSignatureStatus === "SIGNED" ||
                        currentItem.recipientSignatureUrl
                          ? "bg-[#16845B] text-white"
                          : "bg-amber-500 text-white"
                      }`}
                    >
                      <FileSignature className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-xs text-[#172B2A] dark:text-white uppercase tracking-wider">
                          {L("Termo de Devolução & Assinatura Digital", "Return Form & Digital Signature")}
                        </h4>
                        <UIBadge
                          tone={
                            currentItem.recipientSignatureStatus === "SIGNED" ||
                            currentItem.recipientSignatureUrl
                              ? "emerald"
                              : "amber"
                          }
                        >
                          {currentItem.recipientSignatureStatus === "SIGNED" ||
                          currentItem.recipientSignatureUrl
                            ? L("Assinado Digitalmente", "Digitally Signed")
                            : L("Aguardando Assinatura Remota", "Awaiting Remote Signature")}
                        </UIBadge>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                        {currentItem.recipientSignatureStatus === "SIGNED" ||
                        currentItem.recipientSignatureUrl
                          ? L(
                              `Recebido por: ${
                                currentItem.recipientName ||
                                currentItem.recipientSignatureName ||
                                "Proprietário"
                              } (${getBondLabel(
                                currentItem.recipientBond ||
                                  currentItem.recipientSignatureBond
                              )}) em ${fmtDateTime(
                                currentItem.signedAt ||
                                  currentItem.recipientSignatureDate ||
                                  currentItem.resolutionDate
                              )}.`,
                              `Received by: ${
                                currentItem.recipientName ||
                                currentItem.recipientSignatureName ||
                                "Owner"
                              } (${getBondLabel(
                                currentItem.recipientBond ||
                                  currentItem.recipientSignatureBond
                              )}) on ${fmtDateTime(
                                currentItem.signedAt ||
                                  currentItem.recipientSignatureDate ||
                                  currentItem.resolutionDate
                              )}.`
                            )
                          : L(
                              `Link de assinatura enviado para ${
                                currentItem.recipientEmail ||
                                currentItem.recipientSignatureEmail ||
                                "o e-mail cadastrado do proprietário"
                              }.`,
                              `Signature link dispatched to ${
                                currentItem.recipientEmail ||
                                currentItem.recipientSignatureEmail ||
                                "the owner's registered email"
                              }.`
                            )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Signature Preview Thumbnail if signed */}
                {(currentItem.recipientSignatureUrl || returnSignatureDataUrl) && (
                  <div className="mt-3 pt-3 border-t border-[#16845B]/20 dark:border-emerald-800/50 flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="bg-white p-1.5 rounded-xl border border-slate-200 shadow-2xs">
                        <img
                          src={
                            currentItem.recipientSignatureUrl || returnSignatureDataUrl
                          }
                          alt={L("Assinatura Digital", "Digital Signature")}
                          className="h-10 max-w-[140px] object-contain"
                        />
                      </div>
                      <div className="text-[11px]">
                        <span className="font-semibold text-[#172B2A] dark:text-slate-200 block">
                          {L("Assinatura Registrada", "Recorded Signature")}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 text-[10px] font-mono">
                          {L("Código:", "Code:")} {currentItem.receiptValidationCode || currentItem.id}
                        </span>
                      </div>
                    </div>

                    <UIButton
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={handlePrintReceiptPDF}
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>{L("Imprimir Recibo Assinado", "Print Signed Receipt")}</span>
                    </UIButton>
                  </div>
                )}

                {/* Remote Pending Signature Actions (Staff / Admin Only) */}
                {canSignAsStaff &&
                  currentItem.status === "DEVOLVIDO" &&
                  currentItem.recipientSignatureStatus === "PENDING_REMOTE" &&
                  !currentItem.recipientSignatureUrl && (
                    <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-800/50 flex items-center justify-between gap-2 flex-wrap">
                      <UIButton
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={handleOpenInPersonRemoteSignature}
                        disabled={isResolvingRemoteLink || isResendingSignatureEmail}
                      >
                        <PenTool className="w-3.5 h-3.5" />
                        <span>
                          {isResolvingRemoteLink
                            ? L("Preparando...", "Preparing...")
                            : L("Assinar no Dispositivo Agora", "Sign on Device Now")}
                        </span>
                      </UIButton>

                      <div className="flex items-center gap-2">
                        <UIButton
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={handleCopyRemoteSignatureLink}
                          disabled={isResolvingRemoteLink || isResendingSignatureEmail}
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>{L("Copiar Link", "Copy Link")}</span>
                        </UIButton>

                        <UIButton
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={handleResendSignatureEmail}
                          disabled={isResendingSignatureEmail || isResolvingRemoteLink}
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 ${
                              isResendingSignatureEmail ? "animate-spin" : ""
                            }`}
                          />
                          <span>
                            {isResendingSignatureEmail
                              ? L("Reenviando...", "Resending...")
                              : L("Reenviar E-mail", "Resend Email")}
                          </span>
                        </UIButton>
                      </div>
                    </div>
                  )}
              </div>
            )}

            {/* Staff Signature Attestation Banner — Blocked when Issuer Unidentified */}
            {currentItem.status === "DEVOLVIDO" &&
              currentItem.recipientSignatureStatus === "SIGNED" &&
              currentItem.staffSignatureStatus !== "SIGNED" &&
              !currentItem.returnedByUserId && (
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-2">
                  <div className="flex items-start gap-2.5 text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-wider">
                        {L("Atestação Bloqueada — Emissor Não Identificado", "Attestation Blocked — Unidentified Issuer")}
                      </h4>
                      <p className="text-[11px] text-amber-800 dark:text-amber-300/90 leading-relaxed mt-0.5">
                        {L(
                          "Esta devolução não possui o servidor emissor registrado no sistema. Por segurança e auditoria, a atestação está bloqueada para impedir a atribuição retroativa não comprovada.",
                          "This return does not have an issuing staff member recorded. For security and audit integrity, attestation is blocked to prevent unverified retroactive attribution."
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

            {/* Staff Signature Attestation Button (When Recipient Signed and Staff Pending & Issuer Matches) */}
            {currentItem.status === "DEVOLVIDO" &&
              currentItem.recipientSignatureStatus === "SIGNED" &&
              currentItem.staffSignatureStatus !== "SIGNED" &&
              canSignAsStaff &&
              Boolean(currentItem.returnedByUserId) &&
              currentItem.returnedByUserId === currentUser.id && (
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-3">
                  <div className="flex items-start gap-2.5 text-amber-900 dark:text-amber-200">
                    <FileSignature className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-wider">
                        {L("Atestação Institucional do Atendente Pendente", "Pending Staff Institutional Attestation")}
                      </h4>
                      <p className="text-[11px] text-amber-800 dark:text-amber-300/90 leading-relaxed mt-0.5">
                        {L(
                          `O receptor (${
                            currentItem.recipientName ||
                            currentItem.recipientSignatureName ||
                            "Aluno"
                          }) assinou a devolução. Registre sua atestação e assinatura como servidor emissor responsável.`,
                          `The recipient (${
                            currentItem.recipientName ||
                            currentItem.recipientSignatureName ||
                            "Student"
                          }) signed the return. Record your attestation and signature as the responsible issuing staff member.`
                        )}
                      </p>
                    </div>
                  </div>
                  <UIButton
                    type="button"
                    variant="primary"
                    size="md"
                    fullWidth
                    onClick={() => setStaffSignatureModalOpen(true)}
                  >
                    <PenTool className="w-4 h-4" />
                    <span>{L("Atestar e Assinar Devolução (Atendente)", "Attest & Sign Return (Attendant)")}</span>
                  </UIButton>
                </div>
              )}

            {/* Action Area: Primary Action & Operational Controls */}
            <div className="pt-3 space-y-2.5 border-t border-slate-200/80 dark:border-slate-800">
              {/* Primary User Action: Claim Ownership */}
              {currentItem.status !== "DEVOLVIDO" &&
                currentItem.status !== "ENCERRADO" &&
                (userActiveClaim ? (
                  <div
                    className={`p-4 rounded-2xl border text-xs space-y-1.5 ${
                      userActiveClaim.status === "APROVADO"
                        ? "bg-[#EBF5F0] dark:bg-emerald-950/30 border-[#16845B]/30 text-[#064E3B] dark:text-emerald-200"
                        : "bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800/60 text-sky-900 dark:text-sky-200"
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold">
                      <ShieldCheck className="w-4 h-4 text-[#16845B] dark:text-emerald-400" />
                      <span>
                        {userActiveClaim.status === "APROVADO"
                          ? L("Sua solicitação foi APROVADA pela Secretaria!", "Your claim has been APPROVED by the Campus Office!")
                          : L("Solicitação de Devolução em Análise", "Return Claim Under Review")}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                      {userActiveClaim.status === "APROVADO"
                        ? L(
                            "Compareça à Secretaria / SEBAC portando documento oficial com foto para concluir a retirada do pertence.",
                            "Visit the Campus Office / SEBAC with an official photo ID to complete item pickup."
                          )
                        : L(
                            "Você já enviou uma solicitação para este objeto. A equipe da Secretaria está analisando as informações fornecidas. Você pode acompanhar ou cancelar seu pedido na aba 'Meu Perfil'.",
                            "You have already submitted a claim for this item. The Campus Office team is reviewing your details. You can track or cancel your request in the 'My Profile' tab."
                          )}
                    </p>
                  </div>
                ) : (
                  <UIButton
                    type="button"
                    variant="primary"
                    size="lg"
                    fullWidth
                    onClick={() => setClaimModalOpen(true)}
                  >
                    <ShieldCheck className="w-5 h-5" />
                    <span>{L("Solicitar Este Objeto (Reclamar Posse)", "Claim This Item")}</span>
                  </UIButton>
                ))}

              {/* Operational Actions for Approved & Active Servidores and Admins */}
              {canPerformFormalReturn && (
                  <div className="space-y-2">
                    {currentItem.status !== "EM_ANALISE" &&
                      currentItem.status !== "DEVOLVIDO" &&
                      currentItem.status !== "ENCERRADO" && (
                        <UIButton
                          type="button"
                          variant="outline"
                          size="md"
                          fullWidth
                          disabled={isConfirmingArrival}
                          onClick={async () => {
                            if (isConfirmingArrival) return;
                            vibrateClick();
                            setIsConfirmingArrival(true);
                            try {
                              await updateItemStatus(currentItem.id, "EM_ANALISE");
                              vibrateSuccess();
                            } catch (err) {
                              console.error("[ItemDetailModal] Falha ao confirmar chegada:", err);
                            } finally {
                              setIsConfirmingArrival(false);
                            }
                          }}
                          className="border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                        >
                          <Clock className="w-4 h-4" />
                          <span>
                            {isConfirmingArrival
                              ? L("Confirmando Chegada...", "Confirming Arrival...")
                              : L("Confirmar Chegada na Guarita (Em Análise)", "Confirm Arrival at Gatehouse (Under Review)")}
                          </span>
                        </UIButton>
                      )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <UIButton
                        type="button"
                        variant="dark"
                        size="md"
                        fullWidth
                        onClick={() => setReturnModalOpen(true)}
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>{L("Registrar Devolução Formal", "Register Formal Return")}</span>
                      </UIButton>

                      <UIButton
                        type="button"
                        variant="secondary"
                        size="md"
                        fullWidth
                        onClick={() => setDestinationModalOpen(true)}
                      >
                        <PackageCheck className="w-4 h-4" />
                        <span>{L("Registrar Destinação", "Register Disposal")}</span>
                      </UIButton>
                    </div>
                  </div>
                )}

              {/* Admin Only: Reopen Return Button if item was already returned */}
              {canReopenReturn && currentItem.status === "DEVOLVIDO" && (
                <UIButton
                  type="button"
                  variant="secondary"
                  size="md"
                  fullWidth
                  onClick={() => setReopenModalOpen(true)}
                  className="border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{L("[Admin] Reabrir Devolução (Corrigir Erro)", "[Admin] Reopen Return (Fix Mistake)")}</span>
                </UIButton>
              )}

              {/* Grouped Secondary Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <UIButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  fullWidth
                  onClick={() => setEmailModalOpen(true)}
                >
                  <Send className="w-3.5 h-3.5 text-[#16845B]" />
                  <span>{L("Enviar Mensagem", "Send Message")}</span>
                </UIButton>

                {isAuthorizedToEdit && (
                  <UIButton
                    type="button"
                    variant="outline"
                    size="sm"
                    fullWidth
                    onClick={() => {
                      setEditTitle(currentItem.title);
                      setEditDescription(currentItem.description);
                      setEditCategory(normalizeCategory(currentItem.category));
                      setEditLocation(currentItem.location);
                      setEditDate(currentItem.date || getTodayDateString());
                      setEditColor(currentItem.color || "");
                      setEditBrand(currentItem.brand || "");
                      setEditContactInfo(currentItem.contactInfo || "");
                      setEditItemModalOpen(true);
                    }}
                    title={L("Editar dados e informações do objeto", "Edit item details")}
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>{L("Editar Informações", "Edit Details")}</span>
                  </UIButton>
                )}
              </div>
            </div>

            {/* Comments Section */}
            <div className="space-y-3 pt-3 border-t border-slate-200/80 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-[#172B2A] dark:text-white flex items-center gap-1.5 uppercase tracking-wider">
                  <MessageSquare className="w-4 h-4 text-[#16845B]" /> {L("Perguntas & Comentários", "Questions & Comments")} ({itemComments.length})
                </h4>
              </div>

              <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                {itemComments.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-2">
                    {L("Nenhum comentário cadastrado para este pertence.", "No comments registered for this item.")}
                  </p>
                ) : (
                  itemComments.map((com) => (
                    <div
                      key={com.id}
                      className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#172B2A] dark:text-slate-200">
                            {com.userName}
                          </span>
                          <UIBadge tone="emerald">{translateUserRole(com.userRole, language)}</UIBadge>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {fmtDateTime(com.createdAt)}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300 leading-snug">
                        {com.text}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* Add Comment Form */}
              <form onSubmit={handlePostComment} className="flex gap-2">
                <div className="flex-1">
                  <UIInput
                    type="text"
                    required
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    placeholder={L("Escreva uma pergunta ou esclarecimento...", "Write a question or clarification...")}
                  />
                </div>
                <UIButton
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isPostingComment}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{L("Enviar", "Send")}</span>
                </UIButton>
              </form>
            </div>

            {/* Vertical Timeline History Section */}
            <div className="space-y-3 pt-3 border-t border-slate-200/80 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#172B2A] dark:text-white flex items-center gap-1.5">
                  <History className="w-4 h-4 text-[#16845B]" /> {L("Trilha de Auditoria", "Audit Trail")} ({sortedTimeline.length})
                </h4>
                <span className="text-[10px] text-slate-400 font-mono">
                  {L("Registro Histórico", "Historical Record")}
                </span>
              </div>

              <div className="max-h-56 overflow-y-auto pr-2">
                {sortedTimeline.length === 0 ? (
                  <div className="p-3 bg-[#F8FAFC] dark:bg-slate-800/70 rounded-xl text-xs text-slate-500 italic">
                    {L("Nenhum evento registrado ainda nesta ocorrência.", "No events recorded for this item yet.")}
                  </div>
                ) : (
                  <div className="relative border-l border-slate-200 dark:border-slate-700 ml-3 pl-4 space-y-3.5 py-1">
                    {sortedTimeline.map((log: any, index: number) => (
                      <div key={log.id || index} className="relative group">
                        {/* Timeline Circle Bullet Node */}
                        <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-[#16845B] ring-4 ring-white dark:ring-[#111827] shadow-2xs" />

                        <div className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 text-xs space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-[#172B2A] dark:text-slate-200 text-xs">
                              {translateActivityAction(log.action, language)}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400 shrink-0">
                              {fmtDateTime(log.timestamp)}
                            </span>
                          </div>

                          {log.details && (
                            <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                              {log.details}
                            </p>
                          )}

                          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1 pt-0.5">
                            <User className="w-3 h-3 text-[#16845B] shrink-0" />
                            <span>
                              {L("Responsável:", "Responsible:")}{" "}
                              <strong className="text-[#172B2A] dark:text-slate-200">
                                {log.actorName || log.userName || L("Usuário", "User")}
                              </strong>
                              {log.actorRole || log.userRole
                                ? ` (${translateUserRole(log.actorRole || log.userRole, language)})`
                                : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          CLAIM MODAL (SOLICITAR DEVOLUÇÃO / REIVINDICAÇÃO — RNF04)
          ========================================================================= */}
      {claimModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="claim-modal-title"
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm transition-all duration-200"
        >
          <div className="bg-white dark:bg-[#111827] text-[#172B2A] dark:text-slate-100 rounded-2xl sm:rounded-3xl p-6 max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-[0_24px_64px_rgba(6,78,59,0.18)] space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between border-b border-slate-200/80 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/60 text-[#16845B] dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    id="claim-modal-title"
                    className="font-bold text-base sm:text-lg text-[#172B2A] dark:text-white"
                  >
                    {L("Solicitar Devolução de Objeto", "Request Item Return")}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {L("Verificação de Posse • IFPR Campus Ivaiporã", "Ownership Verification • IFPR Campus Ivaiporã")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setClaimModalOpen(false)}
                aria-label={L("Fechar janela de reivindicação", "Close claim dialog")}
                className="p-2 rounded-xl text-slate-400 hover:text-[#172B2A] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <SubtlePanel className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-xs text-[#172B2A] dark:text-white">
                  {L("Objeto selecionado:", "Selected item:")} {currentItem.title}
                </span>
                <UIBadge tone="emerald">
                  {translateCategory(getCategoryDisplay(currentItem.category), language)}
                </UIBadge>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {L(
                  "Para comprovar a titularidade do pertence junto à Secretaria (SEBAC), descreva características particulares (marcas de uso, adesivos, chaveiros, itens internos ou detalhes específicos).",
                  "To prove ownership to the Campus Office (SEBAC), describe distinctive details (wear marks, stickers, keychains, contents inside, or specific traits)."
                )}
              </p>
            </SubtlePanel>

            <form onSubmit={handleClaimSubmit} className="space-y-4">
              <UIFieldGroup
                label={L("Características Particulares / Marcas de Identificação", "Distinctive Features / Identifying Marks")}
                htmlFor="claim-distinctive-features"
                required
                hint={L("Informe detalhes que apenas o proprietário do objeto saberia descrever.", "Provide details only the rightful owner would know.")}
              >
                <UITextarea
                  id="claim-distinctive-features"
                  required
                  rows={4}
                  value={claimDistinctiveFeatures}
                  onChange={(e) => setClaimDistinctiveFeatures(e.target.value)}
                  placeholder={L(
                    "Ex: No bolso interno há um adesivo azul, pequena marca de arranhão na lateral, capa protetora preta...",
                    "E.g. Blue sticker inside the inner pocket, small scratch on the side, black protective case..."
                  )}
                />
              </UIFieldGroup>

              <UIFieldGroup
                label={L("Informações Adicionais (Opcional)", "Additional Information (Optional)")}
                htmlFor="claim-additional-info"
              >
                <UITextarea
                  id="claim-additional-info"
                  rows={2}
                  value={claimAdditionalInfo}
                  onChange={(e) => setClaimAdditionalInfo(e.target.value)}
                  placeholder={L(
                    "Ex: Horário aproximado em que perdeu, turma/curso ou telefone adicional...",
                    "E.g. Approximate time it was lost, class/program, or additional phone number..."
                  )}
                />
              </UIFieldGroup>

              <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <span className="leading-relaxed">
                  {L(
                    "Sua solicitação será analisada pela equipe administrativa (SEBAC). Após aprovação, compareça ao setor munido de documento oficial com foto para retirar o pertence.",
                    "Your claim will be reviewed by the administrative team (SEBAC). Once approved, visit the desk with an official photo ID to retrieve your item."
                  )}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200/80 dark:border-slate-800">
                <UIButton
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => setClaimModalOpen(false)}
                >
                  {t("cancel")}
                </UIButton>
                <UIButton
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={
                    isSubmittingClaim || !claimDistinctiveFeatures.trim()
                  }
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {isSubmittingClaim
                      ? L("Enviando...", "Submitting...")
                      : L("Enviar Solicitação", "Submit Claim")}
                  </span>
                </UIButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Notification / Message Modal */}
      {emailModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm transition-all duration-200">
          <div className="bg-white dark:bg-[#111827] text-[#172B2A] dark:text-slate-100 rounded-2xl sm:rounded-3xl p-6 max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-base text-[#172B2A] dark:text-white flex items-center gap-2">
                <Send className="w-5 h-5 text-[#16845B]" /> {L("Enviar Notificação Institucional", "Send Institutional Notification")}
              </h3>
              <button
                type="button"
                onClick={() => setEmailModalOpen(false)}
                aria-label={t("close")}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-[#172B2A] dark:hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {L("Envie uma notificação institucional sobre o objeto", "Send an institutional notification regarding the item")}{" "}
              <strong>"{currentItem.title}"</strong>.{" "}
              {L(
                "A mensagem será registrada no sistema e entregue ao destinatário no Localiza+.",
                "The message will be logged in the system and delivered to the recipient inside Localiza+."
              )}
            </p>

            <form onSubmit={handleSendEmailSubmit} className="space-y-3.5">
              <UIFieldGroup
                label={L("Destinatário (E-mail / Contato)", "Recipient (Email / Contact)")}
                required
              >
                <UIInput
                  type="email"
                  required
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="exemplo@ifpr.edu.br"
                />
              </UIFieldGroup>

              <UIFieldGroup label={L("Assunto", "Subject")} required>
                <UIInput
                  type="text"
                  required
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder={L("Ex: Informação sobre objeto encontrado", "E.g. Information about found item")}
                />
              </UIFieldGroup>

              <UIFieldGroup label={L("Conteúdo da Mensagem", "Message Body")} required>
                <UITextarea
                  required
                  rows={4}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  placeholder={L("Escreva os detalhes ou esclarecimentos necessários...", "Write any necessary details or clarifications...")}
                />
              </UIFieldGroup>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                <UIButton
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => setEmailModalOpen(false)}
                >
                  {t("cancel")}
                </UIButton>
                <UIButton
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isSendingEmail}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {isSendingEmail
                      ? L("Enviando...", "Sending...")
                      : L("Enviar Notificação", "Send Notification")}
                  </span>
                </UIButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Devolution Registration Modal */}
      {returnModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 transition-all">
          <div className="bg-white dark:bg-[#111827] text-[#172B2A] dark:text-slate-100 rounded-2xl sm:rounded-3xl p-6 max-w-xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <FileSignature className="w-5 h-5 text-[#16845B]" />
                <div>
                  <h3 className="font-bold text-base text-[#172B2A] dark:text-white">
                    {L("Registrar Devolução & Assinatura Digital", "Register Return & Digital Signature")}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {L("Protocolo Oficial SEBAC • IFPR Campus Ivaiporã", "Official SEBAC Protocol • IFPR Campus Ivaiporã")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReturnModalOpen(false)}
                aria-label={t("close")}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-[#172B2A] dark:hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRegisterReturnSubmit} className="space-y-3.5">
              <UIFieldGroup
                label={L("Nome Completo do Receptor / Proprietário", "Recipient / Owner Full Name")}
                required
              >
                <UIInput
                  type="text"
                  required
                  value={returnRecipientName}
                  onChange={(e) => setReturnRecipientName(e.target.value)}
                  placeholder={L("Nome de quem está recebendo o pertence...", "Name of the person receiving the item...")}
                />
              </UIFieldGroup>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <UIFieldGroup label={L("E-mail do Receptor", "Recipient Email")} required>
                  <UIInput
                    type="email"
                    required
                    value={returnRecipientEmail}
                    onChange={(e) => setReturnRecipientEmail(e.target.value)}
                    placeholder="email@estudantes.ifpr.edu.br"
                  />
                </UIFieldGroup>

                <UIFieldGroup label={L("Vínculo no Campus", "Campus Affiliation")} required>
                  <UISelect
                    value={returnRecipientBond}
                    onChange={(e) =>
                      setReturnRecipientBond(e.target.value as any)
                    }
                  >
                    <option value="Aluno">{L("Aluno(a)", "Student")}</option>
                    <option value="Servidor">{L("Servidor / TAE / Professor", "Staff / Faculty")}</option>
                    <option value="Terceirizado">
                      {L("Funcionário Terceirizado", "Contractor")}
                    </option>
                    <option value="Visitante">{L("Visitante Externo", "External Visitor")}</option>
                  </UISelect>
                </UIFieldGroup>

                <UIFieldGroup label={L("Matrícula / Doc. ID", "Enrollment / ID")}>
                  <UIInput
                    type="text"
                    value={returnRecipientDocument}
                    onChange={(e) =>
                      setReturnRecipientDocument(e.target.value)
                    }
                    placeholder={L("RG, CPF ou Matrícula...", "ID or Enrollment number...")}
                  />
                </UIFieldGroup>
              </div>

              {/* Signature Method Selector */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-xs font-semibold text-[#172B2A] dark:text-slate-200">
                  {L("Etapa de Assinatura Digital de Recebimento", "Digital Receipt Signature Step")}
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReturnSignatureMode("IN_PERSON_DEVICE")}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      returnSignatureMode === "IN_PERSON_DEVICE"
                        ? "bg-[#EBF5F0] dark:bg-emerald-950/50 border-[#16845B] text-[#064E3B] dark:text-emerald-300 font-bold shadow-2xs"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <PenTool className="w-4 h-4 text-[#16845B]" />
                      <span>{L("Presencial no Dispositivo", "In-Person on Device")}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                      {L("O aluno/servidor assina agora na tela do atendente.", "The recipient signs right now on the attendant's screen.")}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReturnSignatureMode("REMOTE_EMAIL")}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      returnSignatureMode === "REMOTE_EMAIL"
                        ? "bg-[#EBF5F0] dark:bg-emerald-950/50 border-[#16845B] text-[#064E3B] dark:text-emerald-300 font-bold shadow-2xs"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <Send className="w-4 h-4 text-[#16845B]" />
                      <span>{L("Link por E-mail (Remoto)", "Email Link (Remote)")}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                      {L("Envia link seguro para assinatura posterior no celular.", "Sends a secure link to sign later on a mobile device.")}
                    </p>
                  </button>
                </div>
              </div>

              {/* Conditional Signature Area */}
              {returnSignatureMode === "IN_PERSON_DEVICE" ? (
                <div className="pt-1">
                  <DigitalSignaturePad
                    signerName={returnRecipientName || L("Aluno / Servidor", "Student / Staff")}
                    signerBond={returnRecipientBond}
                    signerEmail={returnRecipientEmail}
                    onSignatureCapture={(url) => setReturnSignatureDataUrl(url)}
                    onClear={() => setReturnSignatureDataUrl("")}
                  />
                </div>
              ) : (
                <div className="p-3.5 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 rounded-xl text-xs text-sky-900 dark:text-sky-200 space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-sky-800 dark:text-sky-300">
                    <MailCheck className="w-4 h-4" />
                    <span>{L("Envio Automático do Termo de Recebimento", "Automatic Dispatch of Receipt Form")}</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                    {L(
                      "Ao registrar, um e-mail com link exclusivo e token de segurança será enviado para",
                      "Upon submission, an email with a unique link and security token will be sent to"
                    )}{" "}
                    <strong>
                      {returnRecipientEmail || L("o e-mail do receptor", "the recipient's email")}
                    </strong>
                    {L(
                      ". Ele poderá assinar pelo próprio celular a qualquer momento.",
                      ". They will be able to sign from their own phone at any time."
                    )}
                  </p>
                </div>
              )}

              <UIFieldGroup label={L("Observações de Entrega", "Handover Observations")}>
                <UITextarea
                  rows={2}
                  value={returnObservations}
                  onChange={(e) => setReturnObservations(e.target.value)}
                  placeholder={L(
                    "Ex: Objeto conferido com êxito pelo proprietário na SEBAC...",
                    "E.g. Item verified successfully by the owner at SEBAC..."
                  )}
                />
              </UIFieldGroup>

              <div className="p-3.5 bg-[#EBF5F0]/70 dark:bg-emerald-950/30 border border-[#16845B]/25 dark:border-emerald-800/60 rounded-xl flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="confirmIdentityCheck"
                  required
                  checked={returnIdentityConfirmed}
                  onChange={(e) => setReturnIdentityConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-[#16845B] focus:ring-[#16845B] cursor-pointer"
                />
                <label
                  htmlFor="confirmIdentityCheck"
                  className="text-xs text-[#064E3B] dark:text-emerald-200 cursor-pointer font-semibold"
                >
                  {L(
                    "Confirmo que conferi presencialmente o documento oficial com foto do receptor antes da liberação do objeto.",
                    "I confirm that I personally verified the recipient's official photo ID before releasing the item."
                  )}
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                <UIButton
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => setReturnModalOpen(false)}
                >
                  {t("cancel")}
                </UIButton>
                <UIButton
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isRegisteringReturn}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>
                    {isRegisteringReturn
                      ? L("Registrando...", "Registering...")
                      : returnSignatureMode === "IN_PERSON_DEVICE"
                      ? L("Concluir Devolução com Assinatura", "Complete Return with Signature")
                      : L("Concluir & Enviar Link de Assinatura", "Complete & Send Signature Link")}
                  </span>
                </UIButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remote Signature Modal Trigger */}
      {remoteSignatureModalOpen && resolvedRemoteToken && (
        <RemoteSignatureModal
          itemId={currentItem.id}
          token={resolvedRemoteToken}
          onClose={() => {
            setRemoteSignatureModalOpen(false);
            setResolvedRemoteToken("");
          }}
          onSuccess={() => {
            setRemoteSignatureModalOpen(false);
            setResolvedRemoteToken("");
            addToast(L("Assinatura digital registrada com sucesso!", "Digital signature recorded successfully!"), "success");
          }}
        />
      )}

      {/* Reopen Return Modal (Admin Only) */}
      {reopenModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 transition-all">
          <div className="bg-white dark:bg-[#111827] text-[#172B2A] dark:text-slate-100 rounded-2xl sm:rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="font-bold text-base text-[#172B2A] dark:text-white">
                    {L("Reabrir Devolução de Objeto", "Reopen Item Return")}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {L("Ação Administrativa de Ajuste", "Administrative Adjustment Action")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReopenModalOpen(false)}
                aria-label={t("close")}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-[#172B2A] dark:hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              {L(
                "A reabertura do item alterará a situação de volta para ativa, removerá o carimbo de devolução e gravará um registro de auditoria associado ao seu usuário.",
                "Reopening this item will restore its active status, remove the return stamp, and write an audit log entry linked to your account."
              )}
            </div>

            <form onSubmit={handleReopenReturnSubmit} className="space-y-3.5">
              <UIFieldGroup label={L("Justificativa da Reabertura", "Reason for Reopening")} required>
                <UITextarea
                  required
                  rows={3}
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder={L(
                    "Ex: Devolução cadastrada por engano no item incorreto durante conferência de estoque...",
                    "E.g. Return mistakenly recorded on the wrong item during inventory verification..."
                  )}
                />
              </UIFieldGroup>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                <UIButton
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => setReopenModalOpen(false)}
                >
                  {t("cancel")}
                </UIButton>
                <UIButton
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isReopeningReturn}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>
                    {isReopeningReturn
                      ? L("Reabrindo...", "Reopening...")
                      : L("Confirmar Reabertura", "Confirm Reopening")}
                  </span>
                </UIButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Destination Modal (Unclaimed Items) */}
      {destinationModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 transition-all">
          <div className="bg-white dark:bg-[#111827] text-[#172B2A] dark:text-slate-100 rounded-2xl sm:rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <PackageCheck className="w-5 h-5 text-[#16845B]" />
                <div>
                  <h3 className="font-bold text-base text-[#172B2A] dark:text-white">
                    {L("Destinação de Pertence Não Reclamado", "Unclaimed Item Disposal")}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {L("Destinação Institucional (Até 60 dias)", "Institutional Disposal (Up to 60 days)")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDestinationModalOpen(false)}
                aria-label={t("close")}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-[#172B2A] dark:hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleDestinationSubmit} className="space-y-3.5">
              <UIFieldGroup label={L("Tipo de Destinação", "Disposal Type")} required>
                <UISelect
                  value={destinationType}
                  onChange={(e) => setDestinationType(e.target.value as any)}
                >
                  <option value="DOACAO">
                    {L("Doação para Entidade / Projeto Social", "Donation to Charity / Social Project")}
                  </option>
                  <option value="DESCARTE">
                    {L("Descarte Ecológico / Lixo Eletrônico", "Eco-friendly Disposal / E-Waste")}
                  </option>
                  <option value="LEILAO_PROJETO">
                    {L("Uso em Projetos de Ensino / Pesquisa", "Use in Teaching / Research Projects")}
                  </option>
                  <option value="OUTRO">{L("Outra Destinação Autorizada", "Other Authorized Disposal")}</option>
                </UISelect>
              </UIFieldGroup>

              <UIFieldGroup
                label={L("Entidade Beneficiária / Justificativa", "Beneficiary / Justification")}
                required
              >
                <UITextarea
                  required
                  rows={3}
                  value={destinationNotes}
                  onChange={(e) => setDestinationNotes(e.target.value)}
                  placeholder={L(
                    "Ex: Entregue à Instituição Social de Ivaiporã conforme autorização da Direção Geral...",
                    "E.g. Donated to a local social institution as authorized by the Campus Director..."
                  )}
                />
              </UIFieldGroup>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                <UIButton
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => setDestinationModalOpen(false)}
                >
                  {t("cancel")}
                </UIButton>
                <UIButton
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isRegisteringDestination}
                >
                  <PackageCheck className="w-3.5 h-3.5" />
                  <span>
                    {isRegisteringDestination
                      ? L("Registrando...", "Registering...")
                      : L("Confirmar & Encerrar", "Confirm & Close")}
                  </span>
                </UIButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Item Modal (Authorized Users) */}
      {editItemModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm transition-all duration-200">
          <div className="bg-white dark:bg-[#111827] text-[#172B2A] dark:text-slate-100 rounded-2xl sm:rounded-3xl p-6 max-w-xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Edit className="w-5 h-5 text-[#16845B]" />
                <div>
                  <h3 className="font-bold text-base text-[#172B2A] dark:text-white">
                    {L("Editar Informações do Objeto", "Edit Item Details")}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {L(
                      "Apenas o Cadastrador do Item ou Servidores/Administradores podem alterar",
                      "Only the item submitter or Staff/Administrators can edit"
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditItemModalOpen(false)}
                aria-label={t("close")}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-[#172B2A] dark:hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedItem} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-[#172B2A] dark:text-slate-200">
                    {L("Título / Nome do Objeto *", "Item Title / Name *")}
                  </label>
                  <span
                    id="edit-title-char-counter"
                    className={`text-[10px] font-mono font-medium ${
                      editTitle.length >= ITEM_FIELD_LIMITS.TITLE
                        ? "text-amber-600 font-bold"
                        : "text-slate-500"
                    }`}
                    title={L(`Limite máximo: ${ITEM_FIELD_LIMITS.TITLE} caracteres`, `Maximum limit: ${ITEM_FIELD_LIMITS.TITLE} characters`)}
                  >
                    {editTitle.length} / {ITEM_FIELD_LIMITS.TITLE} {L("caracteres", "characters")}
                  </span>
                </div>
                <UIInput
                  type="text"
                  required
                  maxLength={ITEM_FIELD_LIMITS.TITLE}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-[#172B2A] dark:text-slate-200">
                    {L("Descrição Detalhada", "Detailed Description")}
                  </label>
                  <span
                    id="edit-description-char-counter"
                    className={`text-[10px] font-mono font-medium ${
                      editDescription.length >= ITEM_FIELD_LIMITS.DESCRIPTION
                        ? "text-amber-600 font-bold"
                        : "text-slate-500"
                    }`}
                    title={L(`Limite máximo: ${ITEM_FIELD_LIMITS.DESCRIPTION} caracteres`, `Maximum limit: ${ITEM_FIELD_LIMITS.DESCRIPTION} characters`)}
                  >
                    {editDescription.length} / {ITEM_FIELD_LIMITS.DESCRIPTION} {L("caracteres", "characters")}
                  </span>
                </div>
                <UITextarea
                  rows={3}
                  maxLength={ITEM_FIELD_LIMITS.DESCRIPTION}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <UIFieldGroup label={L("Categoria", "Category")}>
                  <UISelect
                    value={editCategory}
                    onChange={(e) =>
                      setEditCategory(normalizeCategory(e.target.value))
                    }
                  >
                    {CANONICAL_ITEM_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {translateCategory(cat, language)}
                      </option>
                    ))}
                  </UISelect>
                </UIFieldGroup>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-[#172B2A] dark:text-slate-200">
                      {L("Localização no Campus", "Campus Location")}
                    </label>
                    <span className="text-[10px] font-mono text-slate-500">
                      {L(`Máx. ${ITEM_FIELD_LIMITS.LOCATION} carac.`, `Max ${ITEM_FIELD_LIMITS.LOCATION} chars`)}
                    </span>
                  </div>
                  <UISelect
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                  >
                    {IFPR_LOCATION_GROUPS.map((group) => (
                      <optgroup key={group.group} label={translateLocationGroup(group.group, language)}>
                        {group.locations.map((loc) => (
                          <option key={loc} value={loc}>
                            {translateCampusLocation(loc, language)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    {editLocation && !IFPR_LOCATIONS.includes(editLocation) && (
                      <option value={editLocation}>
                        {editLocation} ({L("Legado", "Legacy")})
                      </option>
                    )}
                  </UISelect>
                </div>
              </div>

              <UIFieldGroup label={L("Data da Ocorrência", "Occurrence Date")} required>
                <UIInput
                  type="date"
                  required
                  max={getTodayDateString()}
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </UIFieldGroup>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-[#172B2A] dark:text-slate-200">
                      {L("Cor Predominante", "Primary Color")}
                    </label>
                    <span className="text-[10px] font-mono text-slate-500">
                      {L(`Máx. ${ITEM_FIELD_LIMITS.COLOR} carac.`, `Max ${ITEM_FIELD_LIMITS.COLOR} chars`)}
                    </span>
                  </div>
                  <UIInput
                    type="text"
                    maxLength={ITEM_FIELD_LIMITS.COLOR}
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-[#172B2A] dark:text-slate-200">
                      {L("Marca / Fabricante", "Brand / Manufacturer")}
                    </label>
                    <span className="text-[10px] font-mono text-slate-500">
                      {L(`Máx. ${ITEM_FIELD_LIMITS.BRAND} carac.`, `Max ${ITEM_FIELD_LIMITS.BRAND} chars`)}
                    </span>
                  </div>
                  <UIInput
                    type="text"
                    maxLength={ITEM_FIELD_LIMITS.BRAND}
                    value={editBrand}
                    onChange={(e) => setEditBrand(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-[#172B2A] dark:text-slate-200">
                    {L("Contato / Instruções de Devolução", "Contact / Return Instructions")}
                  </label>
                  <span className="text-[10px] font-mono text-slate-500">
                    {L(`Máx. ${ITEM_FIELD_LIMITS.CONTACT_INFO} carac.`, `Max ${ITEM_FIELD_LIMITS.CONTACT_INFO} chars`)}
                  </span>
                </div>
                <UIInput
                  type="text"
                  maxLength={ITEM_FIELD_LIMITS.CONTACT_INFO}
                  value={editContactInfo}
                  onChange={(e) => setEditContactInfo(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                <UIButton
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => setEditItemModalOpen(false)}
                >
                  {t("cancel")}
                </UIButton>
                <UIButton
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isSavingEdit}
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>
                    {isSavingEdit
                      ? L("Salvando...", "Saving...")
                      : L("Salvar Alterações", "Save Changes")}
                  </span>
                </UIButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Staff Attendant Signature Modal */}
      {staffSignatureModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm transition-all duration-200">
          <div className="bg-white dark:bg-[#111827] text-[#172B2A] dark:text-slate-100 rounded-2xl sm:rounded-3xl p-6 max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileSignature className="w-5 h-5 text-[#16845B]" />
                <div>
                  <h3 className="font-bold text-base text-[#172B2A] dark:text-white">
                    {L("Atestação Institucional do Atendente", "Staff Institutional Attestation")}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {L("IFPR Campus Ivaiporã • Servidor Responsável", "IFPR Campus Ivaiporã • Responsible Staff")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStaffSignatureModalOpen(false)}
                aria-label={t("close")}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-[#172B2A] dark:hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <SubtlePanel className="text-xs space-y-1">
              <p className="font-bold text-[#172B2A] dark:text-white">
                {L("Objeto:", "Item:")} {currentItem.title} (#{currentItem.id})
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                {L("Receptor:", "Recipient:")}{" "}
                <strong>
                  {currentItem.recipientName ||
                    currentItem.recipientSignatureName ||
                    L("Receptor", "Recipient")}
                </strong>{" "}
                ({getBondLabel(currentItem.recipientBond || "Aluno")})
              </p>
              <p className="text-slate-400 text-[10px] font-mono">
                {L("Assinado pelo receptor em:", "Signed by recipient on:")}{" "}
                {fmtDateTime(
                  currentItem.signedAt || currentItem.resolutionDate
                )}
              </p>
            </SubtlePanel>

            <form
              onSubmit={handleConfirmStaffSignatureSubmit}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-[#172B2A] dark:text-slate-200 mb-2">
                  {L("Assinatura Digital do Servidor Atendente", "Attendant Staff Digital Signature")} (
                  {currentUser?.name || L("Servidor IFPR", "IFPR Staff")}) *
                </label>
                <DigitalSignaturePad
                  signerName={currentUser?.name || L("Servidor Atendente", "Attendant Staff")}
                  signerBond="Servidor"
                  signerEmail={currentUser?.email}
                  onSignatureCapture={(dataUrl, method) => {
                    setStaffSignatureDataUrl(dataUrl);
                    setStaffSignatureMethod(
                      method === "TYPED_NAME" ? "TYPED_NAME" : "DRAWN"
                    );
                  }}
                  onClear={() => setStaffSignatureDataUrl("")}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                <UIButton
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => setStaffSignatureModalOpen(false)}
                >
                  {t("cancel")}
                </UIButton>
                <UIButton
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={
                    isSubmittingStaffSignature || !staffSignatureDataUrl
                  }
                >
                  <PenTool className="w-3.5 h-3.5" />
                  <span>
                    {isSubmittingStaffSignature
                      ? L("Registrando...", "Registering...")
                      : L("Confirmar Atestação e Assinatura", "Confirm Attestation & Signature")}
                  </span>
                </UIButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Restricted QR View Modal */}
      {showRestrictedQRView && (
        <RestrictedQRViewModal
          item={currentItem}
          onClose={() => setShowRestrictedQRView(false)}
        />
      )}
    </div>
  );
};

export default ItemDetailModal;
