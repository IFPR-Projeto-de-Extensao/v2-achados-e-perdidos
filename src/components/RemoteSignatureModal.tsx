import React, { useState, useEffect, useCallback } from "react";
import { LostFoundItem, UserRole } from "../types";
import { useApp } from "../context/AppContext";
import { useRouter } from "../context/RouterContext";
import { DigitalSignaturePad } from "./DigitalSignaturePad";
import {
  FileCheck2,
  X,
  CheckCircle,
  Clock,
  MapPin,
  Tag,
  Calendar,
  ShieldCheck,
  ShieldAlert,
  Send,
  Download,
  Printer,
  Sparkles,
  AlertTriangle,
  UserCheck,
  Loader2,
  Lock,
  ExternalLink,
  RefreshCw,
  FileText,
  BadgeCheck,
  User,
  PackageSearch,
  ArrowRight,
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  ModalShell,
  UIButton,
  UIBadge,
  SubtlePanel,
  UIFieldGroup,
  UIInput,
} from "./ui";
import {
  localize,
  getLocaleForLanguage,
  translateCategory,
  translateCampusLocation,
  translateColor,
  translateUserRole,
} from "../lib/i18n";

interface RemoteSignatureModalProps {
  itemId?: string;
  token?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

type VerificationStatus =
  | "CHECKING"
  | "VALID"
  | "INVALID_TOKEN"
  | "TOKEN_EXPIRED"
  | "TOKEN_INVALIDATED"
  | "NOT_FOUND"
  | "ALREADY_SIGNED"
  | "ERROR";

function encodeBase64Utf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export const RemoteSignatureModal: React.FC<RemoteSignatureModalProps> = ({
  itemId,
  token,
  onClose,
  onSuccess,
}) => {
  const { items, currentUser, addToast, language } = useApp();
  const { navigate } = useRouter();
  const l = useCallback((pt: string, en: string) => localize(language, pt, en), [language]);
  const locale = getLocaleForLanguage(language);

  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>("CHECKING");
  const [verificationStep, setVerificationStep] = useState<string>(
    localize(language, "Iniciando verificação...", "Starting verification...")
  );
  const [verificationError, setVerificationError] = useState<string>("");
  const [activeItem, setActiveItem] = useState<LostFoundItem | null>(null);

  const [signatureDataUrl, setSignatureDataUrl] = useState<string>("");
  const [signatureMethod, setSignatureMethod] = useState<"DRAWN" | "TYPED_NAME">("DRAWN");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStep, setSubmissionStep] = useState<string>("");
  const [isCompleted, setIsCompleted] = useState(false);
  const [documentNumber, setDocumentNumber] = useState("");
  const [confirmationChecked, setConfirmationChecked] = useState(true);
  const [validationCode, setValidationCode] = useState<string>("");
  const [signedTimestamp, setSignedTimestamp] = useState<string>("");

  // Token Authenticity Verification against Authoritative Backend FIRST
  const verifyAuthenticity = useCallback(async () => {
    setActiveItem(null);
    setSignatureDataUrl("");
    setValidationCode("");
    setSignedTimestamp("");
    setIsCompleted(false);

    if (!itemId) {
      setVerificationStatus("NOT_FOUND");
      setVerificationError(l("Código do objeto ausente na requisição.", "Item ID missing from request."));
      return;
    }

    if (!token || token.trim().length < 16) {
      setVerificationStatus("INVALID_TOKEN");
      setVerificationError(
        l(
          "Token de segurança da assinatura não informado ou inválido no link de acesso.",
          "Signature security token missing or invalid in the access link."
        )
      );
      return;
    }

    setVerificationStatus("CHECKING");
    setVerificationError("");
    setVerificationStep(
      l(
        "Validando token criptográfico de autorização no servidor...",
        "Validating cryptographic authorization token on server..."
      )
    );

    try {
      // Step 1: Authoritative Backend Token Verification MUST succeed before ANY item state or ALREADY_SIGNED evaluation
      let apiVerificationResult: any = null;
      let httpStatus = 0;
      try {
        const res = await fetch("/api/signature/verify-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId, token }),
        });
        httpStatus = res.status;
        const payload = await res.json().catch(() => ({}));
        if (res.ok) {
          apiVerificationResult = payload;
        } else {
          apiVerificationResult = {
            valid: false,
            reason: payload.reason || (res.status === 503 ? "SERVER_UNAVAILABLE" : "INVALID_TOKEN"),
            error: payload.error,
          };
        }
      } catch (apiErr) {
        console.warn("[RemoteSignature] Falha ao consultar endpoint de verificação:", apiErr);
        setVerificationStatus("ERROR");
        setVerificationError(
          l(
            "Não foi possível conectar ao servidor de verificação de assinaturas. Verifique sua conexão e tente novamente.",
            "Could not connect to the signature verification server. Check your connection and try again."
          )
        );
        return;
      }

      // Reject immediately if backend did not validate the cryptographic token
      if (!apiVerificationResult || apiVerificationResult.valid !== true) {
        const reason = String(apiVerificationResult?.reason || "");
        if (reason === "NOT_FOUND" || httpStatus === 404) {
          setVerificationStatus("NOT_FOUND");
          setVerificationError(
            apiVerificationResult?.error ||
              l(
                `Ocorrência com identificador #${itemId} não foi localizada no banco de dados do IFPR.`,
                `Record with ID #${itemId} was not found in the IFPR database.`
              )
          );
          return;
        }
        if (reason === "TOKEN_EXPIRED") {
          setVerificationStatus("TOKEN_EXPIRED");
          setVerificationError(
            apiVerificationResult?.error ||
              l(
                "Este link de assinatura remota expirou. Solicite um novo link na SEBAC / Portaria.",
                "This remote signature link has expired. Request a new link from SEBAC / Gatehouse."
              )
          );
          return;
        }
        if (reason === "TOKEN_INVALIDATED" || reason === "ITEM_REOPENED" || httpStatus === 410) {
          setVerificationStatus("TOKEN_INVALIDATED");
          setVerificationError(
            apiVerificationResult?.error ||
              l(
                "Este link de assinatura foi invalidado por reabertura administrativa ou substituição de ciclo.",
                "This signature link was invalidated due to administrative reopening or cycle replacement."
              )
          );
          return;
        }
        if (reason === "SERVER_UNAVAILABLE" || reason === "ENCRYPTION_KEY_MISSING" || httpStatus === 503 || httpStatus >= 500) {
          setVerificationStatus("ERROR");
          setVerificationError(
            apiVerificationResult?.error ||
              l(
                "Serviço de verificação temporariamente indisponível no servidor.",
                "Verification service temporarily unavailable on the server."
              )
          );
          return;
        }
        setVerificationStatus("INVALID_TOKEN");
        setVerificationError(
          apiVerificationResult?.error ||
            l(
              "O token fornecido na URL é inválido ou não corresponde à solicitação ativa deste objeto no IFPR.",
              "The token provided in the URL is invalid or does not match the active request for this item at IFPR."
            )
        );
        return;
      }

      // Step 2: Token is cryptographically verified by the backend; now we can safely inspect the returned item data
      let directFirestoreDoc: LostFoundItem | null = null;
      try {
        const docRef = doc(db, "items", itemId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          directFirestoreDoc = { id: docSnap.id, ...(docSnap.data() as any) } as LostFoundItem;
        }
      } catch (_) {}

      const foundItem: LostFoundItem | null =
        (apiVerificationResult.item
          ? ({ ...(directFirestoreDoc || {}), ...(apiVerificationResult.item as LostFoundItem) } as LostFoundItem)
          : null) ||
        directFirestoreDoc ||
        items.find((i) => i.id === itemId) ||
        null;

      if (!foundItem) {
        setVerificationStatus("NOT_FOUND");
        setVerificationError(
          l(
            `Ocorrência com identificador #${itemId} não foi localizada no banco de dados do IFPR.`,
            `Record with ID #${itemId} was not found in the IFPR database.`
          )
        );
        return;
      }

      const authoritativeValidationCode = String(
        apiVerificationResult.receiptValidationCode || foundItem.receiptValidationCode || ""
      ).trim();

      setActiveItem(foundItem);
      setDocumentNumber(foundItem.recipientDocument || "");
      setValidationCode(authoritativeValidationCode);

      // Step 3: Check if already signed ONLY after backend confirmed valid === true
      const alreadySigned = Boolean(apiVerificationResult.isAlreadySigned);

      if (alreadySigned) {
        setVerificationStatus("ALREADY_SIGNED");
        setIsCompleted(true);
        const recoveredSigUrl =
          apiVerificationResult.recipientSignatureUrl ||
          apiVerificationResult.item?.recipientSignatureUrl ||
          foundItem.recipientSignatureUrl ||
          "";
        setSignatureDataUrl(recoveredSigUrl);
        setSignedTimestamp(
          apiVerificationResult.signedAt ||
            foundItem.signedAt ||
            ""
        );
        setValidationCode(authoritativeValidationCode);
        return;
      }

      // 1. Terminal State Check
      if (foundItem.status === "ENCERRADO") {
        setVerificationStatus("INVALID_TOKEN");
        setVerificationError(
          l(
            "Esta ocorrência foi encerrada e não pode mais receber assinaturas.",
            "This record has been closed and can no longer receive signatures."
          )
        );
        return;
      }

      // 2. Token Used Check
      if (foundItem.signatureTokenUsed) {
        setVerificationStatus("INVALID_TOKEN");
        setVerificationError(
          l(
            "Este termo de assinatura digital já foi utilizado anteriormente.",
            "This digital signature receipt has already been used."
          )
        );
        return;
      }

      // 3. State Machine Eligibility Check
      const isPendingRemote = foundItem.recipientSignatureStatus === "PENDING_REMOTE";
      const isAvailableForReturn =
        foundItem.status === "DISPONIVEL" ||
        foundItem.status === "ENCONTRADO" ||
        foundItem.status === "PROPRIETARIO_IDENTIFICADO";

      if (!isPendingRemote && !isAvailableForReturn) {
        setVerificationStatus("INVALID_TOKEN");
        setVerificationError(
          l(
            `Operação não permitida: O item #${foundItem.id} possui a situação '${foundItem.status || "INDISPONÍVEL"}' e não está aguardando assinatura remota.`,
            `Operation not allowed: Item #${foundItem.id} has status '${foundItem.status || "UNAVAILABLE"}' and is not awaiting remote signature.`
          )
        );
        return;
      }

      // Valid Authenticity Confirmed!
      setVerificationStep(l("Autenticidade confirmada com sucesso!", "Authenticity successfully confirmed!"));
      setVerificationStatus("VALID");
    } catch (err: any) {
      console.error("[RemoteSignature] Erro durante verificação de autenticidade:", err);
      setVerificationStatus("ERROR");
      setVerificationError(
        l(
          "Falha na comunicação de segurança ao autenticar token no servidor.",
          "Security communication failure while authenticating token on server."
        )
      );
    }
  }, [itemId, token, items, l]);

  useEffect(() => {
    verifyAuthenticity();
  }, [verifyAuthenticity]);

  // Never fall back to unverified items when token verification has not succeeded
  const item =
    verificationStatus === "VALID" || verificationStatus === "ALREADY_SIGNED"
      ? activeItem
      : null;

  const signerName = item?.recipientName || currentUser?.name || l("Proprietário / Receptor", "Owner / Recipient");
  const signerEmail = item?.recipientEmail || currentUser?.email || "estudante@ifpr.edu.br";
  const signerBond = item?.recipientBond || currentUser?.role || l("Aluno(a)", "Student");
  const displaySignerBond =
    signerBond === "Aluno(a)" ? l("Aluno(a)", "Student") : translateUserRole(signerBond, language);

  // Handle Confirm and Finalize Signature (Centralized Server-Authoritative Execution)
  const handleConfirmSignature = async () => {
    if (!item || verificationStatus !== "VALID") return;

    if (!signatureDataUrl) {
      addToast(
        l(
          "Por favor, faça sua assinatura digital no quadro antes de confirmar.",
          "Please draw or type your digital signature in the box before confirming."
        ),
        "error"
      );
      return;
    }
    if (!confirmationChecked) {
      addToast(
        l("Confirme a declaração de recebimento para prosseguir.", "Confirm the receipt declaration to proceed."),
        "error"
      );
      return;
    }

    setIsSubmitting(true);
    setSubmissionStep(
      l(
        "Homologando assinatura e persistindo baixa no servidor...",
        "Approving signature and recording return on server..."
      )
    );
    try {
      // Server-Authoritative Confirmation Endpoint: Performs atomic transaction, token consumption, and audit logging
      const res = await fetch("/api/signature/confirm-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          token,
          signatureDataUrl,
          signatureMethod,
          documentNumber: documentNumber || item.recipientDocument || "",
          signerName,
          signerEmail,
          signerBond,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.error ||
            l(
              `Erro HTTP ${res.status} ao homologar assinatura no servidor.`,
              `HTTP ${res.status} error while approving signature on server.`
            )
        );
      }

      const confirmResult = await res.json();
      if (!confirmResult.success) {
        throw new Error(
          confirmResult.error ||
            l("Servidor não confirmou o registro da assinatura.", "Server did not confirm the signature record.")
        );
      }

      const confirmedValCode = String(confirmResult.validationCode || item.receiptValidationCode || "").trim();
      const confirmedSignedAt = confirmResult.signedAt || new Date().toISOString();
      const confirmedSigUrl = confirmResult.recipientSignatureUrl || signatureDataUrl;
      setSignatureDataUrl(confirmedSigUrl);

      // Authenticated async notify endpoint with verified token
      fetch("/api/signature/notify-signed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          token,
          itemTitle: item.title,
          signerName,
          signerEmail,
          signedAt: confirmedSignedAt,
        }),
      }).catch(() => {});

      setValidationCode(confirmedValCode);
      setSignedTimestamp(confirmedSignedAt);
      setIsCompleted(true);
      setVerificationStatus("ALREADY_SIGNED");
      addToast(
        l(
          "Assinatura digital autenticada e baixa de devolução concluída com sucesso no banco de dados!",
          "Digital signature authenticated and item return successfully completed in the database!"
        ),
        "success"
      );

      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error("Erro ao salvar assinatura digital:", err);
      setIsCompleted(false);
      addToast(
        err?.message ||
          l("Erro ao gravar assinatura digital. Tente novamente.", "Error saving digital signature. Please try again."),
        "error"
      );
    } finally {
      setIsSubmitting(false);
      setSubmissionStep("");
    }
  };

  const handleDownloadSignedPDF = () => {
    if (!item || (verificationStatus !== "ALREADY_SIGNED" && !isCompleted)) {
      addToast(
        l(
          "A emissão do comprovante exige uma assinatura previamente validada pelo servidor.",
          "Issuing the receipt requires a signature previously validated by the server."
        ),
        "error"
      );
      return;
    }

    const currentValidationCode = String(validationCode || item.receiptValidationCode || "").trim();
    if (!currentValidationCode) {
      addToast(
        l(
          "Código oficial de validação ausente. Não é possível emitir comprovante sem validação do servidor.",
          "Official validation code missing. Cannot issue receipt without server validation."
        ),
        "error"
      );
      return;
    }

    try {
      const doc = new jsPDF("p", "mm", "a4");
      const transactionId = (item as any).transactionId || `TX-${currentValidationCode}-${Date.now().toString(36).toUpperCase()}`;
      const effectiveSignedTime = signedTimestamp || item.signedAt || new Date().toISOString();
      const formattedDateTime = new Date(effectiveSignedTime).toLocaleString(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      const signatureMethodLabel =
        item.recipientSignatureType === "IN_PERSON_DEVICE"
          ? l("Presencial no Dispositivo do Campus", "In-Person on Campus Device")
          : l("Remota via Link Seguro e E-mail Institucional", "Remote via Secure Link & Institutional Email");

      const isStaffAttested =
        item.staffSignatureStatus === "SIGNED" && Boolean(item.staffSignatureUrl);
      const authHash = `VAL-${currentValidationCode}`;

      // Banner Header IFPR (Green & Red accent)
      doc.setFillColor(0, 132, 61);
      doc.rect(0, 0, 210, 24, "F");
      doc.setFillColor(200, 30, 30);
      doc.rect(0, 24, 210, 2.5, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12.5);
      doc.text(l("INSTITUTO FEDERAL DO PARANÁ - CAMPUS IVAIPORÃ", "FEDERAL INSTITUTE OF PARANÁ - IVAIPORÃ CAMPUS"), 14, 11);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(
        l(
          "SISTEMA LOCALIZA+ • COMPROVANTE OFICIAL DE RESTITUIÇÃO E DEVOLUÇÃO",
          "LOCALIZA+ SYSTEM • OFFICIAL ITEM RETURN & RESTITUTION RECEIPT"
        ),
        14,
        18
      );

      // Title & Transaction Badge
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11.5);
      doc.text(
        l("COMPROVANTE DE RESTITUIÇÃO COM VALIDAÇÃO DIGITAL", "DIGITALLY VALIDATED ITEM RETURN RECEIPT"),
        14,
        34
      );

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`${l("ID da Transação:", "Transaction ID:")} ${transactionId}`, 14, 40);
      doc.text(`${l("Código de Autenticação:", "Authentication Code:")} ${currentValidationCode}`, 14, 44.5);
      doc.text(
        `${l("Data e Hora da Assinatura:", "Signature Date & Time:")} ${formattedDateTime} (${l("Horário de Brasília", "Brasília Time")})`,
        14,
        49
      );
      doc.text(
        l("Setor de Atendimento: SEBAC / Portaria • IFPR Campus Ivaiporã", "Service Sector: SEBAC / Gatehouse • IFPR Ivaiporã Campus"),
        14,
        53.5
      );

      // Section 1: Dados do Objeto
      autoTable(doc, {
        startY: 58,
        head: [[l("1. DADOS DO OBJETO RESTITUÍDO", "1. RETURNED ITEM DETAILS"), ""]],
        body: [
          [l("Código / ID da Ocorrência:", "Record ID:"), item.id],
          [l("Título do Objeto:", "Item Title:"), item.title],
          [
            l("Categoria / Tipo:", "Category / Type:"),
            `${translateCategory(item.category, language)} • ${item.type === "PERDIDO" ? l("Item Perdido", "Lost Item") : l("Item no Acervo", "Catalog Item")}`,
          ],
          [l("Local Onde Foi Encontrado:", "Location Found:"), translateCampusLocation(item.location, language) || l("Campus IFPR Ivaiporã", "IFPR Ivaiporã Campus")],
          [
            l("Cor / Marca / Fabricante:", "Color / Brand:"),
            `${item.color ? translateColor(item.color, language) : l("Não especificada", "Not specified")} • ${item.brand || l("Não identificada", "Not identified")}`,
          ],
          [l("Descrição Detalhada:", "Detailed Description:"), item.description || l("Sem observações adicionais no registro.", "No additional notes in record.")],
          [
            l("Data do Cadastro Inicial:", "Initial Registration Date:"),
            item.date || item.createdAt ? new Date(item.date || item.createdAt).toLocaleDateString(locale) : "N/A",
          ],
          [l("Servidor Responsável pela Baixa:", "Responsible Staff Member:"), item.returnedByName || l("Equipe SEBAC / Portaria IFPR", "IFPR SEBAC / Gatehouse Team")],
        ],
        theme: "grid",
        headStyles: { fillColor: [0, 132, 61], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
        styles: { fontSize: 7.5, cellPadding: 2.2 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 55, fillColor: [248, 250, 252] } },
      });

      let currentY = (doc as any).lastAutoTable.finalY + 5;

      // Section 2: Dados do Proprietário / Receptor
      autoTable(doc, {
        startY: currentY,
        head: [[l("2. DADOS DO PROPRIETÁRIO / RECEPTOR", "2. OWNER / RECIPIENT DETAILS"), ""]],
        body: [
          [l("Nome Completo:", "Full Name:"), signerName],
          [l("E-mail Institucional:", "Institutional Email:"), signerEmail],
          [l("Vínculo com o Campus:", "Campus Affiliation:"), displaySignerBond],
          [l("Documento / Matrícula:", "ID / Enrollment:"), documentNumber || item.recipientDocument || l("Conferido e validado no sistema", "Verified and validated in the system")],
          [l("Observações de Entrega:", "Delivery Notes:"), item.returnObservations || l("Recebimento confirmado em perfeitas condições via assinatura digital.", "Receipt confirmed in good condition via digital signature.")],
        ],
        theme: "grid",
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
        styles: { fontSize: 7.5, cellPadding: 2.2 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 55, fillColor: [248, 250, 252] } },
      });

      currentY = (doc as any).lastAutoTable.finalY + 5;

      // Section 3: Metadados de Autenticação e Registro Eletrônico
      autoTable(doc, {
        startY: currentY,
        head: [[l("3. METADADOS DE AUTENTICAÇÃO E REGISTRO ELETRÔNICO", "3. AUTHENTICATION & ELECTRONIC RECORD METADATA"), ""]],
        body: [
          [l("Modalidade da Assinatura:", "Signature Mode:"), signatureMethodLabel],
          [l("Classificação Legal:", "Legal Classification:"), l("Assinatura Eletrônica Simples (Art. 5º, I, da Lei nº 14.063/2020)", "Simple Electronic Signature (Art. 5, I, Brazilian Law 14.063/2020)")],
          [l("Evidência de Autenticidade:", "Authenticity Evidence:"), l("Desenho manuscrito em tela + link de uso único associado ao item", "On-screen signature + single-use token linked to item")],
          [l("Assinatura do Receptor:", "Recipient Signature:"), l("CONFIRMADA E PERSISTIDA NO FIRESTORE (DEVOLVIDO)", "CONFIRMED & RECORDED IN FIRESTORE (RETURNED)")],
          [
            l("Atestação Institucional:", "Institutional Attestation:"),
            isStaffAttested
              ? l("DUPLA ASSINATURA CONCLUÍDA (ATENDENTE ASSINOU)", "DUAL SIGNATURE COMPLETED (STAFF SIGNED)")
              : l("Atestação Institucional Pendente", "Institutional Attestation Pending"),
          ],
          [l("Código / Hash Verificador:", "Verification Code / Hash:"), `${currentValidationCode} (${authHash})`],
          [l("Carimbo de Tempo (ISO):", "Timestamp (ISO):"), effectiveSignedTime],
          [l("Origem da Operação:", "Operation Origin:"), (item as any).signatureIpOrDevice || l("Navegador Web / Celular Autenticado IFPR", "IFPR Authenticated Web / Mobile Browser")],
          [l("Regulamentação:", "Regulations:"), l("Portaria Interna IFPR • Lei Federal nº 14.063/2020 (Art. 5º, I)", "IFPR Internal Ordinance • Brazilian Federal Law 14.063/2020 (Art. 5, I)")],
        ],
        theme: "grid",
        headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
        styles: { fontSize: 7, cellPadding: 2 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 55, fillColor: [248, 250, 252] } },
      });

      currentY = (doc as any).lastAutoTable.finalY + 6;

      // Section 4: Termo de Quitação e Assinatura Visual
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(0, 132, 61);
      doc.text(l("4. TERMO DE QUITAÇÃO E ASSINATURA DIGITAL CAPTURADA", "4. RECEIPT RELEASE & CAPTURED DIGITAL SIGNATURE"), 14, currentY);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      doc.text(
        l(
          "Declaro para os devidos fins legais e institucionais ter recebido o objeto acima descrito em perfeitas condições, conferindo plena, rasa e irrevogável quitação ao Instituto Federal do Paraná.",
          "I declare for all legal and institutional purposes that I received the item described above in good condition, granting full and irrevocable release to the Federal Institute of Paraná."
        ),
        14,
        currentY + 4.5,
        { maxWidth: 182 }
      );

      currentY += 10;

      // Render captured PNG signature
      if (signatureDataUrl) {
        try {
          doc.addImage(signatureDataUrl, "PNG", 14, currentY, 65, 24);
        } catch (e) {
          console.warn("Signature image render skipped:", e);
        }
      }

      // Left Signature line: Recipient
      doc.line(14, currentY + 26, 95, currentY + 26);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);
      doc.text(signerName, 54.5, currentY + 29.5, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`${l("Assinado Digitalmente", "Digitally Signed")} (${displaySignerBond})`, 54.5, currentY + 33, { align: "center" });

      // Right Signature line: Server
      if (isStaffAttested && item.staffSignatureUrl) {
        try {
          doc.addImage(item.staffSignatureUrl, "PNG", 123, currentY, 65, 24);
        } catch (e) {
          console.warn("Staff signature image render skipped:", e);
        }
      } else {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7.5);
        doc.setTextColor(180, 83, 9);
        doc.text(l("[Atestação Institucional Pendente]", "[Institutional Attestation Pending]"), 155.5, currentY + 14, { align: "center" });
      }
      doc.line(115, currentY + 26, 196, currentY + 26);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);
      doc.text(item.staffSignerName || item.returnedByName || l("Servidor Responsável", "Responsible Staff"), 155.5, currentY + 29.5, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        isStaffAttested
          ? l("SEBAC / Portaria • Atestação Assinada", "SEBAC / Gatehouse • Attestation Signed")
          : l("SEBAC / Portaria • Atestação Institucional Pendente", "SEBAC / Gatehouse • Institutional Attestation Pending"),
        155.5,
        currentY + 33,
        { align: "center" }
      );

      // Footer
      doc.setFontSize(6.5);
      doc.setTextColor(148, 163, 184);
      doc.line(14, 286, 196, 286);
      doc.text(
        l(
          `IFPR Campus Ivaiporã • Sistema de Gestão de Achados e Perdidos • Comprovante #${currentValidationCode}`,
          `IFPR Ivaiporã Campus • Lost & Found Management System • Receipt #${currentValidationCode}`
        ),
        14,
        290
      );
      doc.text(`${l("Emitido em", "Issued on")} ${formattedDateTime}`, 196, 290, { align: "right" });

      doc.save(`${l("Comprovante_Devolucao_IFPR", "IFPR_Return_Receipt")}_${item.id}_${new Date().toISOString().slice(0, 10)}.pdf`);
      addToast(
        l("Comprovante oficial de devolução baixado com sucesso!", "Official return receipt downloaded successfully!"),
        "success"
      );
    } catch (err) {
      console.error(err);
      addToast(
        l("Erro ao gerar PDF do comprovante de devolução.", "Error generating the return receipt PDF."),
        "error"
      );
    }
  };

  return (
    <ModalShell
      isOpen={true}
      onClose={onClose}
      maxWidthClass="max-w-xl"
      zIndexClass="z-70"
      ariaLabel={l("Assinatura Digital de Recebimento", "Digital Receipt Signature")}
    >
      <div className="p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3.5 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/50 border border-[#16845B]/20 flex items-center justify-center text-[#16845B] dark:text-emerald-400 shrink-0">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-base text-[#172B2A] dark:text-white truncate">
                {l("Assinatura Digital de Recebimento", "Digital Receipt Signature")}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">
                {l("Termo Oficial IFPR Campus Ivaiporã", "Official IFPR Ivaiporã Campus Term")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-[#172B2A] dark:hover:text-white transition-colors cursor-pointer shrink-0"
            aria-label={l("Fechar janela", "Close modal")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. STATE: CHECKING AUTHENTICITY WITH VISUAL LOADING FEEDBACK */}
        {verificationStatus === "CHECKING" && (
          <div className="py-12 text-center space-y-4 animate-in fade-in">
            <div className="relative w-16 h-16 mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-[#EBF5F0] dark:bg-emerald-950/40 text-[#16845B] dark:text-emerald-400 border border-[#16845B]/20 flex items-center justify-center animate-pulse">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#16845B] text-white flex items-center justify-center animate-spin shadow-xs">
                <Loader2 className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="space-y-1.5 max-w-sm mx-auto">
              <h4 className="text-sm font-bold text-[#172B2A] dark:text-white">
                {l("Validando Autenticidade no Firestore...", "Validating Authenticity in Firestore...")}
              </h4>
              <p className="text-xs text-[#16845B] dark:text-emerald-400 font-semibold animate-pulse">
                {verificationStep}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {l(
                  `Consultando o token de segurança e a integridade da custódia institucional do item #${itemId}.`,
                  `Checking the security token and institutional custody integrity of item #${itemId}.`
                )}
              </p>
            </div>

            <div className="w-48 mx-auto h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#16845B] rounded-full animate-[progress_1.5s_ease-in-out_infinite]"
                style={{ width: "70%" }}
              />
            </div>
          </div>
        )}

        {/* 2. STATE: INVALID / EXPIRED / INVALIDATED TOKEN OR ERROR WITH VISUAL FEEDBACK */}
        {(verificationStatus === "INVALID_TOKEN" ||
          verificationStatus === "TOKEN_EXPIRED" ||
          verificationStatus === "TOKEN_INVALIDATED" ||
          verificationStatus === "NOT_FOUND" ||
          verificationStatus === "ERROR") && (
          <div className="py-6 space-y-4 text-center animate-in zoom-in-95">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div className="space-y-1.5 max-w-md mx-auto">
              <h4 className="text-base font-bold text-[#172B2A] dark:text-white">
                {verificationStatus === "NOT_FOUND"
                  ? l("Objeto Não Encontrado", "Item Not Found")
                  : verificationStatus === "TOKEN_EXPIRED"
                  ? l("Link de Assinatura Expirado", "Signature Link Expired")
                  : verificationStatus === "TOKEN_INVALIDATED"
                  ? l("Link de Assinatura Invalidado", "Signature Link Invalidated")
                  : verificationStatus === "ERROR"
                  ? l("Erro de Comunicação com o Servidor", "Server Communication Error")
                  : l("Token de Assinatura Inválido", "Invalid Signature Token")}
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {verificationError ||
                  l(
                    "O link de assinatura utilizado possui um token que não coincide com a solicitação oficial ativa no Firestore.",
                    "The signature link used contains a token that does not match the active official request in Firestore."
                  )}
              </p>
            </div>

            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-900/50 text-left space-y-1 text-xs text-amber-900 dark:text-amber-300">
              <p className="font-bold flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>{l("Diretrizes de Segurança Institucional", "Institutional Security Guidelines")}</span>
              </p>
              <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300/90">
                {l(
                  "Por normas de auditoria e custódia do IFPR Campus Ivaiporã, devoluções e comprovantes só podem ser acessados através do link criptográfico válido enviado ao e-mail institucional cadastrado.",
                  "Under IFPR Ivaiporã Campus audit and custody regulations, returns and receipts can only be accessed via the valid cryptographic link sent to the registered institutional email."
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <UIButton type="button" variant="secondary" size="md" onClick={verifyAuthenticity}>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{l("Revalidar Token", "Revalidate Token")}</span>
              </UIButton>
              <UIButton type="button" variant="dark" size="md" onClick={onClose}>
                {l("Fechar", "Close")}
              </UIButton>
            </div>
          </div>
        )}

        {/* 3. STATE: ALREADY SIGNED / COMPLETED SUCCESS FEEDBACK */}
        {verificationStatus === "ALREADY_SIGNED" && item && (
          <div className="text-center py-4 space-y-4 animate-in zoom-in-95">
            <div className="w-16 h-16 rounded-2xl bg-[#EBF5F0] dark:bg-emerald-950/50 border border-[#16845B]/25 text-[#16845B] dark:text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8" />
            </div>
            <div className="space-y-1.5">
              <UIBadge tone="emerald">
                <BadgeCheck className="w-3.5 h-3.5" />
                <span>{l("Devolução Homologada", "Return Approved")}</span>
              </UIBadge>
              <h4 className="text-lg font-bold text-[#172B2A] dark:text-white">
                {l("Recebimento Confirmado e Assinado!", "Receipt Confirmed & Signed!")}
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                {language === "en" ? (
                  <>The digitally signed return receipt was validated, status <strong>RETURNED</strong> was recorded, and the audit trail was saved to Firestore.</>
                ) : (
                  <>O termo de restituição com assinatura digital foi validado, a baixa para situação <strong>DEVOLVIDO</strong> foi registrada e o registro de auditoria foi gravado com sucesso no Firestore.</>
                )}
              </p>
            </div>

            {/* Verification Metadata Box */}
            <SubtlePanel padding="sm" className="text-left space-y-2 text-xs">
              <div className="flex justify-between items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span>{l("Código de Validação:", "Validation Code:")}</span>
                <span className="font-mono font-bold text-[#172B2A] dark:text-white tabular-nums">
                  {validationCode || item.receiptValidationCode || l("Validado no Servidor", "Server Validated")}
                </span>
              </div>
              <div className="flex justify-between items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span>{l("Receptor:", "Recipient:")}</span>
                <span className="font-semibold text-[#172B2A] dark:text-white text-right">
                  {signerName} ({displaySignerBond})
                </span>
              </div>
              <div className="flex justify-between items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span>{l("Data e Hora:", "Date & Time:")}</span>
                <span className="text-[#172B2A] dark:text-white tabular-nums">
                  {new Date(signedTimestamp || item.signedAt || Date.now()).toLocaleString(locale)}
                </span>
              </div>
              <div className="flex justify-between items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span>{l("Situação no Banco:", "Database Status:")}</span>
                <UIBadge tone="emerald">{l("DEVOLVIDO (Finalizado)", "RETURNED (Completed)")}</UIBadge>
              </div>
            </SubtlePanel>

            {signatureDataUrl && (
              <div className="max-w-xs mx-auto p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1.5">
                  {l("Assinatura Gravada:", "Recorded Signature:")}
                </p>
                <div className="bg-white rounded-lg p-1.5">
                  <img
                    src={signatureDataUrl}
                    alt={l("Assinatura Digital", "Digital Signature")}
                    className="max-h-20 mx-auto object-contain"
                  />
                </div>
              </div>
            )}

            <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
              <UIButton
                type="button"
                id="download-comprovante-btn"
                variant="primary"
                size="md"
                onClick={handleDownloadSignedPDF}
                title={l("Baixar Comprovante Oficial em PDF", "Download Official Receipt PDF")}
              >
                <Download className="w-4 h-4" />
                <span>{l("Baixar Comprovante", "Download Receipt")}</span>
              </UIButton>

              <UIButton
                type="button"
                variant="secondary"
                size="md"
                onClick={() => {
                  navigate("/encontrados");
                  onClose();
                }}
              >
                <PackageSearch className="w-4 h-4 text-[#16845B]" />
                <span>{l("Ver Lista de Itens", "View Item List")}</span>
              </UIButton>

              {currentUser && (
                <UIButton
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    navigate("/perfil");
                    onClose();
                  }}
                >
                  <User className="w-4 h-4 text-sky-600" />
                  <span>{l("Meu Perfil", "My Profile")}</span>
                </UIButton>
              )}

              <UIButton type="button" variant="dark" size="md" onClick={onClose}>
                {l("Concluir", "Done")}
              </UIButton>
            </div>
          </div>
        )}

        {/* 4. STATE: VALID TOKEN & PENDING SIGNATURE */}
        {verificationStatus === "VALID" && item && (
          <div className="space-y-4 animate-in fade-in">
            {/* Authenticity Badge with Visual Success Confirmation */}
            <div className="p-3 bg-[#EBF5F0]/80 dark:bg-emerald-950/35 border border-[#16845B]/25 dark:border-emerald-800/60 rounded-xl flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#064E3B] dark:text-emerald-300">
                <ShieldCheck className="w-4 h-4 text-[#16845B] dark:text-emerald-400 shrink-0" />
                <span>{l("Token Validado com Sucesso no Firestore", "Token Successfully Validated in Firestore")}</span>
              </div>
              <UIBadge tone="emerald" className="font-mono">
                <Lock className="w-2.5 h-2.5" />
                <span>{l("Oficial IFPR", "Official IFPR")}</span>
              </UIBadge>
            </div>

            {/* Item Summary Card */}
            <SubtlePanel padding="sm" className="flex items-center gap-3.5">
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  className="w-16 h-16 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                  <Tag className="w-6 h-6" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <UIBadge tone="emerald">{translateCategory(item.category, language)}</UIBadge>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    #{item.id}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-[#172B2A] dark:text-white truncate mt-1">
                  {item.title}
                </h4>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-[#16845B]" /> {translateCampusLocation(item.location, language)}
                  </span>
                  <span className="flex items-center gap-1">
                    <UserCheck className="w-3 h-3 text-sky-600" /> {l("Entregue por:", "Delivered by:")} {item.returnedByName || "SEBAC"}
                  </span>
                </div>
              </div>
            </SubtlePanel>

            {/* Signer Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <UIFieldGroup label={l("Nome do Receptor", "Recipient Name")}>
                <UIInput type="text" readOnly value={signerName} />
              </UIFieldGroup>

              <UIFieldGroup label={l("Documento / Matrícula (Opcional)", "ID / Enrollment (Optional)")}>
                <UIInput
                  type="text"
                  value={documentNumber}
                  onChange={(e) => setDocumentNumber(e.target.value)}
                  placeholder={l("Ex: RG, CPF ou Matrícula IFPR...", "e.g., ID or IFPR Enrollment...")}
                />
              </UIFieldGroup>
            </div>

            {/* Signature Pad */}
            <DigitalSignaturePad
              signerName={signerName}
              signerBond={signerBond}
              signerEmail={signerEmail}
              onSignatureCapture={(dataUrl, method) => {
                setSignatureDataUrl(dataUrl);
                if (method) setSignatureMethod(method);
              }}
              onClear={() => setSignatureDataUrl("")}
            />

            {/* Confirmation checkbox */}
            <SubtlePanel padding="sm" className="flex items-start gap-2.5">
              <input
                type="checkbox"
                id="signConsent"
                checked={confirmationChecked}
                onChange={(e) => setConfirmationChecked(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-[#16845B] focus:ring-[#16845B] cursor-pointer"
              />
              <label htmlFor="signConsent" className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer leading-relaxed">
                {l(
                  "Confirmo a exatidão das informações, declaro que recebi o pertence acima discriminado e dou plena quitação de entrega perante o IFPR Campus Ivaiporã.",
                  "I confirm the accuracy of the information, declare that I received the item listed above, and grant full delivery release to IFPR Ivaiporã Campus."
                )}
              </label>
            </SubtlePanel>

            {/* Submission Progress Feedback Banner */}
            {isSubmitting && submissionStep && (
              <div className="p-3 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/40 border border-[#16845B]/25 text-xs text-[#064E3B] dark:text-emerald-300 font-semibold flex items-center gap-2 animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin shrink-0 text-[#16845B]" />
                <span>{submissionStep}</span>
              </div>
            )}

            {/* Footer Action Buttons */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <UIButton type="button" variant="ghost" size="md" onClick={onClose} disabled={isSubmitting}>
                {l("Cancelar", "Cancel")}
              </UIButton>
              <UIButton
                type="button"
                variant="primary"
                size="md"
                disabled={!signatureDataUrl || !confirmationChecked || isSubmitting}
                onClick={handleConfirmSignature}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{l("Concluindo Baixa...", "Completing Return...")}</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>{l("Assinar e Confirmar Recebimento", "Sign & Confirm Receipt")}</span>
                  </>
                )}
              </UIButton>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
};
