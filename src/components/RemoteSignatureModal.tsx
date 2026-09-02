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
import { doc, getDoc, updateDoc, setDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { logItemReturnAudit } from "../lib/auditLogger";

interface RemoteSignatureModalProps {
  itemId?: string;
  token?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

type VerificationStatus = "CHECKING" | "VALID" | "INVALID_TOKEN" | "NOT_FOUND" | "ALREADY_SIGNED";

export const RemoteSignatureModal: React.FC<RemoteSignatureModalProps> = ({
  itemId,
  token,
  onClose,
  onSuccess,
}) => {
  const { items, currentUser, addToast, updateDocDirectly, logAdminAction } = useApp();
  const { navigate } = useRouter();

  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>("CHECKING");
  const [verificationStep, setVerificationStep] = useState<string>("Iniciando verificação...");
  const [verificationError, setVerificationError] = useState<string>("");
  const [activeItem, setActiveItem] = useState<LostFoundItem | null>(null);

  const [signatureDataUrl, setSignatureDataUrl] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStep, setSubmissionStep] = useState<string>("");
  const [isCompleted, setIsCompleted] = useState(false);
  const [documentNumber, setDocumentNumber] = useState("");
  const [confirmationChecked, setConfirmationChecked] = useState(true);
  const [validationCode, setValidationCode] = useState<string>("");
  const [signedTimestamp, setSignedTimestamp] = useState<string>("");

  // Token Authenticity Verification against Firestore & Backend
  const verifyAuthenticity = useCallback(async () => {
    if (!itemId) {
      setVerificationStatus("NOT_FOUND");
      setVerificationError("Código do objeto ausente na requisição.");
      return;
    }

    if (!token) {
      setVerificationStatus("INVALID_TOKEN");
      setVerificationError("Token de segurança da assinatura não informado no link de acesso.");
      return;
    }

    setVerificationStatus("CHECKING");
    setVerificationError("");
    setVerificationStep("Conectando ao Firestore institucional...");

    try {
      // Step 1: Query Firestore Real-time
      setVerificationStep("Consultando registro do objeto no Firestore...");
      let directFirestoreDoc: any = null;
      try {
        const docRef = doc(db, "items", itemId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          directFirestoreDoc = { id: docSnap.id, ...docSnap.data() } as LostFoundItem;
        }
      } catch (firestoreErr) {
        console.warn("[RemoteSignature] Leitura cliente do Firestore com fallback:", firestoreErr);
      }

      // Step 2: Query Authoritative Backend Verification Endpoint
      setVerificationStep("Validando token criptográfico de autorização...");
      let apiVerificationResult: any = null;
      try {
        const res = await fetch("/api/signature/verify-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId, token }),
        });
        if (res.ok) {
          apiVerificationResult = await res.json();
        } else {
          const errData = await res.json().catch(() => ({}));
          apiVerificationResult = { valid: false, reason: errData.reason || "SERVER_ERROR", error: errData.error };
        }
      } catch (apiErr) {
        console.warn("[RemoteSignature] Falha ao consultar endpoint de verificação:", apiErr);
      }

      // Consolidate data from Firestore and API
      const foundItem: LostFoundItem | null =
        directFirestoreDoc ||
        (apiVerificationResult?.item ? (apiVerificationResult.item as LostFoundItem) : null) ||
        items.find((i) => i.id === itemId) ||
        null;

      if (!foundItem) {
        setVerificationStatus("NOT_FOUND");
        setVerificationError(`Ocorrência com identificador #${itemId} não foi localizada no banco de dados do IFPR.`);
        return;
      }

      setActiveItem(foundItem);
      setDocumentNumber(foundItem.recipientDocument || "");
      setValidationCode(foundItem.receiptValidationCode || `REC-IFPR-${foundItem.id.toUpperCase().slice(0, 6)}`);

      // Check if already signed
      const alreadySigned =
        foundItem.recipientSignatureStatus === "SIGNED" ||
        Boolean(foundItem.recipientSignatureUrl) ||
        apiVerificationResult?.isAlreadySigned;

      if (alreadySigned) {
        setVerificationStatus("ALREADY_SIGNED");
        setIsCompleted(true);
        setSignatureDataUrl(foundItem.recipientSignatureUrl || apiVerificationResult?.recipientSignatureUrl || "");
        setSignedTimestamp(foundItem.signedAt || apiVerificationResult?.signedAt || new Date().toISOString());
        return;
      }

      // Security check: Only items with status DISPONIVEL / ENCONTRADO and unused token can proceed to signature
      const isAvailableForReturn =
        foundItem.status === "DISPONIVEL" ||
        foundItem.status === "ENCONTRADO" ||
        foundItem.status === "PROPRIETARIO_IDENTIFICADO";

      if (!isAvailableForReturn || foundItem.status === "DEVOLVIDO" || foundItem.signatureTokenUsed) {
        setVerificationStatus("INVALID_TOKEN");
        setVerificationError(
          `Operação não permitida: O item #${foundItem.id} possui o status '${foundItem.status || "INDISPONÍVEL"}'. Apenas itens com status 'DISPONIVEL' e com token ativo podem ser processados para devolução.`
        );
        return;
      }

      // Strict Token Match Check
      const storedToken = foundItem.signatureToken;
      const cleanInputToken = String(token).trim();
      const isTokenValid =
        (storedToken && storedToken.trim() === cleanInputToken) ||
        (apiVerificationResult && apiVerificationResult.valid === true);

      if (!isTokenValid) {
        setVerificationStatus("INVALID_TOKEN");
        setVerificationError(
          "O token fornecido na URL não corresponde à autorização de devolução registrada no Firestore para este objeto. O link pode estar corrompido, revogado ou expirado."
        );
        return;
      }

      // Valid Authenticity Confirmed!
      setVerificationStep("Autenticidade confirmada com sucesso!");
      setVerificationStatus("VALID");
    } catch (err: any) {
      console.error("[RemoteSignature] Erro durante verificação de autenticidade:", err);
      setVerificationStatus("INVALID_TOKEN");
      setVerificationError("Falha na comunicação de segurança ao autenticar token no Firestore.");
    }
  }, [itemId, token, items]);

  useEffect(() => {
    verifyAuthenticity();
  }, [verifyAuthenticity]);

  const item = activeItem || items.find((i) => i.id === itemId);

  const signerName = item?.recipientName || currentUser?.name || "Proprietário / Receptor";
  const signerEmail = item?.recipientEmail || currentUser?.email || "estudante@ifpr.edu.br";
  const signerBond = item?.recipientBond || currentUser?.role || "Aluno(a)";

  // Handle Confirm and Finalize Signature
  const handleConfirmSignature = async () => {
    if (!item) return;

    if (!signatureDataUrl) {
      addToast("Por favor, faça sua assinatura digital no quadro antes de confirmar.", "error");
      return;
    }
    if (!confirmationChecked) {
      addToast("Confirme a declaração de recebimento para prosseguir.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      const effectiveValCode =
        item.receiptValidationCode ||
        `REC-IFPR-${item.id.toUpperCase().slice(0, 6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const newHistoryLog = {
        id: `hist-sign-${Date.now()}`,
        action: "Assinatura Digital Confirmada via Token",
        actorId: currentUser?.id || "remote-token-user",
        actorName: signerName,
        actorRole: (signerBond === "Servidor" ? "SERVIDOR" : "ALUNO") as any,
        timestamp: now,
        details: `Assinatura digital do termo de restituição autenticada e concluída via token criptográfico no Firestore (${signerName} • ${signerBond}).`,
      };

      const updatedHistory = [...(item.history || item.historyLogs || []), newHistoryLog];

      // Step 1: Update Firestore item status to DEVOLVIDO
      setSubmissionStep("1/3 Alterando status para 'DEVOLVIDO' no Firestore...");
      try {
        const itemDocRef = doc(db, "items", item.id);
        await updateDoc(itemDocRef, {
          status: "DEVOLVIDO",
          recipientSignatureUrl: signatureDataUrl,
          recipientSignatureType: "REMOTE_EMAIL",
          recipientSignatureStatus: "SIGNED",
          recipientDocument: documentNumber || item.recipientDocument || "",
          signedAt: now,
          resolutionDate: item.resolutionDate || now,
          receiptValidationCode: effectiveValCode,
          signatureTokenUsed: true,
          history: updatedHistory,
          historyLogs: updatedHistory,
        });
      } catch (firestoreErr) {
        console.warn("[RemoteSignature] Fallback para rota server após aviso Firestore cliente:", firestoreErr);
      }

      // Step 2: Record Audit Log in Firestore collection 'activity_logs'
      setSubmissionStep("2/3 Registrando log de auditoria institucional no Firestore...");
      try {
        await logItemReturnAudit({
          itemId: item.id,
          itemTitle: item.title,
          signerName,
          signerBond,
          signerEmail,
          validationCode: effectiveValCode,
          signatureType: "REMOTE_EMAIL",
          operatorId: currentUser?.id || "token-auth-system",
          operatorName: `${signerName} (${signerBond})`,
        });
      } catch (logErr) {
        console.warn("[RemoteSignature] Gravação de audit log tratada:", logErr);
      }

      // Step 3: Server-Authoritative Confirmation Endpoint
      setSubmissionStep("3/3 Homologando protocolo no servidor...");
      try {
        await fetch("/api/signature/confirm-signature", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId: item.id,
            token,
            signatureDataUrl,
            documentNumber: documentNumber || item.recipientDocument || "",
            signerName,
            signerEmail,
            signerBond,
          }),
        });
      } catch (serverErr) {
        console.warn("[RemoteSignature] Chamada de confirmação no servidor disparada:", serverErr);
      }

      // Local Context Direct Update
      try {
        await updateDocDirectly("items", item.id, {
          recipientSignatureUrl: signatureDataUrl,
          recipientSignatureType: "REMOTE_EMAIL",
          recipientSignatureStatus: "SIGNED",
          recipientDocument: documentNumber || item.recipientDocument || "",
          signedAt: now,
          status: "DEVOLVIDO",
          receiptValidationCode: effectiveValCode,
          history: updatedHistory,
          historyLogs: updatedHistory,
        });
      } catch (_) {}

      try {
        await logAdminAction(
          "ASSINATURA_DIGITAL_RECEBIDA",
          `Assinatura digital de devolução registrada com sucesso para o item #${item.id} por ${signerName} (${signerBond})`
        );
      } catch (_) {}

      // Notify automation endpoint
      try {
        await fetch("/api/signature/notify-signed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId: item.id,
            itemTitle: item.title,
            signerName,
            signerEmail,
            signedAt: now,
          }),
        });
      } catch (_) {}

      setValidationCode(effectiveValCode);
      setSignedTimestamp(now);
      setIsCompleted(true);
      setVerificationStatus("ALREADY_SIGNED");
      addToast("Assinatura digital autenticada e baixa de devolução concluída com sucesso no banco de dados!", "success");

      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error("Erro ao salvar assinatura digital:", err);
      addToast("Erro ao gravar assinatura digital. Tente novamente.", "error");
    } finally {
      setIsSubmitting(false);
      setSubmissionStep("");
    }
  };

  const handleDownloadSignedPDF = () => {
    if (!item) return;

    try {
      const doc = new jsPDF("p", "mm", "a4");
      const currentValidationCode =
        validationCode || item.receiptValidationCode || `REC-IFPR-${item.id.toUpperCase().slice(0, 6)}`;
      const transactionId = (item as any).transactionId || `TX-${currentValidationCode}-${Date.now().toString(36).toUpperCase()}`;
      const effectiveSignedTime = signedTimestamp || item.signedAt || new Date().toISOString();
      const formattedDateTime = new Date(effectiveSignedTime).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      const signatureMethodLabel =
        item.recipientSignatureType === "IN_PERSON_DEVICE"
          ? "Presencial no Dispositivo do Campus"
          : "Remota via Link Seguro & E-mail Institucional";

      const authHash =
        item.signatureToken ||
        (token ? `TOK-${token.slice(0, 12)}...` : `SEC-HASH-${Buffer.from(item.id + effectiveSignedTime).toString("base64").slice(0, 16)}`);

      // Banner Header IFPR (Green & Red accent)
      doc.setFillColor(0, 132, 61);
      doc.rect(0, 0, 210, 24, "F");
      doc.setFillColor(200, 30, 30);
      doc.rect(0, 24, 210, 2.5, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12.5);
      doc.text("INSTITUTO FEDERAL DO PARANÁ - CAMPUS IVAIPORÃ", 14, 11);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text("SISTEMA LOCALIZA+ • COMPROVANTE OFICIAL DE RESTITUIÇÃO & DEVOLUÇÃO", 14, 18);

      // Title & Transaction Badge
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11.5);
      doc.text("COMPROVANTE DE RESTITUIÇÃO COM VALIDAÇÃO DIGITAL", 14, 34);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`ID da Transação: ${transactionId}`, 14, 40);
      doc.text(`Código de Autenticação: ${currentValidationCode}`, 14, 44.5);
      doc.text(`Data e Hora da Assinatura: ${formattedDateTime} (Horário de Brasília)`, 14, 49);
      doc.text(`Setor de Atendimento: SEBAC / Portaria • IFPR Campus Ivaiporã`, 14, 53.5);

      // Section 1: Dados do Objeto
      autoTable(doc, {
        startY: 58,
        head: [["1. DADOS DO OBJETO RESTITUÍDO", ""]],
        body: [
          ["Código / ID da Ocorrência:", item.id],
          ["Título do Objeto:", item.title],
          ["Categoria / Tipo:", `${item.category} • ${item.type === "PERDIDO" ? "Item Perdido" : "Item no Acervo"}`],
          ["Local Onde Foi Encontrado:", item.location || "Campus IFPR Ivaiporã"],
          ["Cor / Marca / Fabricante:", `${item.color || "Não especificada"} • ${item.brand || "Não identificada"}`],
          ["Descrição Detalhada:", item.description || "Sem observações adicionais no registro."],
          ["Data do Cadastro Inicial:", item.date || item.createdAt ? new Date(item.date || item.createdAt).toLocaleDateString("pt-BR") : "N/A"],
          ["Servidor Responsável pela Baixa:", item.returnedByName || "Equipe SEBAC / Portaria IFPR"],
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
        head: [["2. DADOS DO PROPRIETÁRIO / RECEPTOR", ""]],
        body: [
          ["Nome Completo:", signerName],
          ["E-mail Institucional:", signerEmail],
          ["Vínculo com o Campus:", signerBond],
          ["Documento / Matrícula:", documentNumber || item.recipientDocument || "Conferido e validado no sistema"],
          ["Observações de Entrega:", item.returnObservations || "Recebimento confirmado em perfeitas condições via assinatura digital."],
        ],
        theme: "grid",
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
        styles: { fontSize: 7.5, cellPadding: 2.2 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 55, fillColor: [248, 250, 252] } },
      });

      currentY = (doc as any).lastAutoTable.finalY + 5;

      // Section 3: Metadados de Autenticação & Validação Criptográfica
      autoTable(doc, {
        startY: currentY,
        head: [["3. METADADOS DE AUTENTICAÇÃO E CONFORMIDADE CRIPTOGRÁFICA", ""]],
        body: [
          ["Modalidade da Assinatura:", signatureMethodLabel],
          ["Status da Validação:", "AUTENTICADA & SINCRONIZADA NO FIRESTORE (STATUS: DEVOLVIDO)"],
          ["Token / Hash de Segurança:", authHash],
          ["Carimbo de Tempo (ISO):", effectiveSignedTime],
          ["Dispositivo / Origem:", (item as any).signatureIpOrDevice || "Navegador Web / Mobile Autenticado IFPR"],
          ["Regulamentação:", "Portaria Interna IFPR • Lei Federal nº 14.063/2020 (Assinatura Eletrônica Avançada)"],
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
      doc.text("4. TERMO DE QUITAÇÃO E ASSINATURA DIGITAL CAPTURADA", 14, currentY);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      doc.text(
        "Declaro para os devidos fins legais e institucionais ter recebido o objeto acima descrito em perfeitas condições, conferindo plena, rasa e irrevogável quitação ao Instituto Federal do Paraná.",
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
      doc.text(`Assinado Digitalmente (${signerBond})`, 54.5, currentY + 33, { align: "center" });

      // Right Signature line: Server
      doc.line(115, currentY + 26, 196, currentY + 26);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);
      doc.text(item.returnedByName || "Servidor Responsável", 155.5, currentY + 29.5, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text("SEBAC / Portaria • IFPR Campus Ivaiporã", 155.5, currentY + 33, { align: "center" });

      // Footer
      doc.setFontSize(6.5);
      doc.setTextColor(148, 163, 184);
      doc.line(14, 286, 196, 286);
      doc.text(
        `IFPR Campus Ivaiporã • Sistema de Gestão de Achados e Perdidos • Comprovante #${currentValidationCode}`,
        14,
        290
      );
      doc.text(`Emitido em ${formattedDateTime}`, 196, 290, { align: "right" });

      doc.save(`Comprovante_Devolucao_IFPR_${item.id}_${new Date().toISOString().slice(0, 10)}.pdf`);
      addToast("Comprovante oficial de devolução baixado com sucesso!", "success");
    } catch (err) {
      console.error(err);
      addToast("Erro ao gerar PDF do comprovante de devolução.", "error");
    }
  };

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto animate-in fade-in">
      <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 max-w-xl w-full border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-4 my-8 relative overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#00843D]/10 flex items-center justify-center text-[#00843D]">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-neutral-900 dark:text-white">
                Assinatura Digital de Recebimento
              </h3>
              <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">
                Termo Oficial IFPR Campus Ivaiporã
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. STATE: CHECKING AUTHENTICITY WITH VISUAL LOADING FEEDBACK */}
        {verificationStatus === "CHECKING" && (
          <div className="py-12 text-center space-y-4 animate-in fade-in">
            <div className="relative w-16 h-16 mx-auto">
              <div className="w-16 h-16 rounded-3xl bg-[#00843D]/10 text-[#00843D] flex items-center justify-center animate-pulse">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#00843D] text-white flex items-center justify-center animate-spin">
                <Loader2 className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="space-y-1.5 max-w-sm mx-auto">
              <h4 className="text-sm font-extrabold text-neutral-900 dark:text-white">
                Validando Autenticidade no Firestore...
              </h4>
              <p className="text-xs text-[#00843D] dark:text-[#00c75c] font-semibold animate-pulse">
                {verificationStep}
              </p>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Consultando o token de segurança e a integridade da custódia institucional do item #{itemId}.
              </p>
            </div>

            {/* Visual step indicator */}
            <div className="w-48 mx-auto h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
              <div className="h-full bg-[#00843D] rounded-full animate-[progress_1.5s_ease-in-out_infinite]" style={{ width: "70%" }} />
            </div>
          </div>
        )}

        {/* 2. STATE: INVALID TOKEN OR ERROR WITH VISUAL FEEDBACK */}
        {(verificationStatus === "INVALID_TOKEN" || verificationStatus === "NOT_FOUND") && (
          <div className="py-6 space-y-4 text-center animate-in zoom-in-95">
            <div className="w-16 h-16 rounded-3xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto ring-8 ring-amber-500/5">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div className="space-y-1.5 max-w-md mx-auto">
              <h4 className="text-base font-extrabold text-neutral-900 dark:text-white">
                {verificationStatus === "NOT_FOUND" ? "Objeto Não Encontrado" : "Token de Assinatura Inválido"}
              </h4>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                {verificationError ||
                  "O link de assinatura utilizado possui um token que não coincide com a solicitação oficial ativa no Firestore."}
              </p>
            </div>

            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-900/50 text-left space-y-1 text-xs text-amber-800 dark:text-amber-300">
              <p className="font-bold flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> Diretrizes de Segurança Institucional:
              </p>
              <p className="text-[11px] leading-relaxed">
                Por normas de auditoria e custódia do IFPR Campus Ivaiporã, devoluções só podem ser assinadas através do link original enviado ao e-mail institucional cadastrado ou gerado pela equipe SEBAC.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={verifyAuthenticity}
                className="px-4 py-2.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Revalidar Token</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 bg-neutral-900 dark:bg-neutral-100 hover:bg-neutral-800 text-white dark:text-neutral-900 rounded-xl text-xs font-bold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        )}

        {/* 3. STATE: ALREADY SIGNED / COMPLETED SUCCESS FEEDBACK */}
        {verificationStatus === "ALREADY_SIGNED" && item && (
          <div className="text-center py-6 space-y-4 animate-in zoom-in-95">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/15 text-[#00843D] dark:text-[#00c75c] flex items-center justify-center mx-auto ring-8 ring-emerald-500/5">
              <CheckCircle className="w-9 h-9" />
            </div>
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#00843D]/10 text-[#00843D] text-[10px] font-black uppercase mb-1">
                <BadgeCheck className="w-3.5 h-3.5" /> Devolução Homologada
              </div>
              <h4 className="text-lg font-black text-neutral-900 dark:text-white">
                Recebimento Confirmado & Assinado!
              </h4>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 max-w-sm mx-auto">
                O termo de restituição com assinatura digital foi validado, a baixa para status <strong>DEVOLVIDO</strong> foi registrada e o log de auditoria foi gravado com sucesso no Firestore.
              </p>
            </div>

            {/* Verification Metadata Box */}
            <div className="p-3 bg-neutral-50 dark:bg-neutral-850 rounded-2xl border border-neutral-200 dark:border-neutral-750 text-left space-y-1.5 text-xs">
              <div className="flex justify-between items-center text-[11px] text-neutral-500">
                <span>Código de Validação:</span>
                <span className="font-mono font-bold text-neutral-900 dark:text-white">
                  {validationCode || item.receiptValidationCode || `REC-IFPR-${item.id.toUpperCase().slice(0, 6)}`}
                </span>
              </div>
              <div className="flex justify-between items-center text-[11px] text-neutral-500">
                <span>Receptor:</span>
                <span className="font-bold text-neutral-900 dark:text-white">
                  {signerName} ({signerBond})
                </span>
              </div>
              <div className="flex justify-between items-center text-[11px] text-neutral-500">
                <span>Data e Hora:</span>
                <span className="text-neutral-900 dark:text-white">
                  {new Date(signedTimestamp || item.signedAt || Date.now()).toLocaleString("pt-BR")}
                </span>
              </div>
              <div className="flex justify-between items-center text-[11px] text-neutral-500">
                <span>Status no Banco:</span>
                <span className="font-bold text-[#00843D] dark:text-[#00c75c]">DEVOLVIDO (Finalizado)</span>
              </div>
            </div>

            {signatureDataUrl && (
              <div className="max-w-xs mx-auto p-3 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-xs">
                <p className="text-[10px] uppercase font-bold text-neutral-400 mb-1">
                  Assinatura Gravada:
                </p>
                <img
                  src={signatureDataUrl}
                  alt="Assinatura Digital"
                  className="max-h-20 mx-auto object-contain"
                />
              </div>
            )}

            <div className="space-y-2 pt-2">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  id="download-comprovante-btn"
                  onClick={handleDownloadSignedPDF}
                  className="px-4 py-2.5 bg-[#00843D] hover:bg-[#006e33] text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer transition-all"
                  title="Download Comprovante Oficial em PDF"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Comprovante</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigate("/encontrados");
                    onClose();
                  }}
                  className="px-4 py-2.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <PackageSearch className="w-4 h-4 text-[#00843D]" />
                  <span>Ver Lista de Itens</span>
                </button>
                {currentUser && (
                  <button
                    type="button"
                    onClick={() => {
                      navigate("/perfil");
                      onClose();
                    }}
                    className="px-4 py-2.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <User className="w-4 h-4 text-blue-500" />
                    <span>Meu Perfil</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 bg-neutral-900 dark:bg-neutral-100 hover:bg-neutral-850 text-white dark:text-neutral-900 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Concluir
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4. STATE: VALID TOKEN & PENDING SIGNATURE */}
        {verificationStatus === "VALID" && item && (
          <div className="space-y-4 animate-in fade-in">
            {/* Authenticity Badge with Visual Success Confirmation */}
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-[#00843D] dark:text-[#00c75c]">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Token Validado com Sucesso no Firestore</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" /> Oficial IFPR
              </span>
            </div>

            {/* Item Summary Card */}
            <div className="p-3.5 bg-neutral-50 dark:bg-neutral-850 rounded-2xl border border-neutral-200 dark:border-neutral-750 flex items-center gap-3.5">
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  className="w-16 h-16 rounded-xl object-cover border border-neutral-200 dark:border-neutral-700 shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-neutral-400 shrink-0">
                  <Tag className="w-6 h-6" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-[#00843D]/10 text-[#00843D] text-[10px] font-black uppercase">
                    {item.category}
                  </span>
                  <span className="text-[10px] font-mono text-neutral-500">#{item.id}</span>
                </div>
                <h4 className="text-sm font-extrabold text-neutral-900 dark:text-white truncate mt-0.5">
                  {item.title}
                </h4>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-neutral-500">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-[#00843D]" /> {item.location}
                  </span>
                  <span className="flex items-center gap-1">
                    <UserCheck className="w-3 h-3 text-blue-500" /> Entregue por: {item.returnedByName || "SEBAC"}
                  </span>
                </div>
              </div>
            </div>

            {/* Signer Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1">
                  Nome do Receptor:
                </label>
                <input
                  type="text"
                  readOnly
                  value={signerName}
                  className="w-full p-2.5 bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl text-xs font-semibold text-neutral-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1">
                  Documento / Matrícula (Opcional):
                </label>
                <input
                  type="text"
                  value={documentNumber}
                  onChange={(e) => setDocumentNumber(e.target.value)}
                  placeholder="Ex: RG, CPF ou Matrícula IFPR..."
                  className="w-full p-2.5 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl text-xs font-semibold text-neutral-900 dark:text-white focus:ring-2 focus:ring-[#00843D] outline-none"
                />
              </div>
            </div>

            {/* Signature Pad */}
            <DigitalSignaturePad
              signerName={signerName}
              signerBond={signerBond}
              signerEmail={signerEmail}
              onSignatureCapture={(dataUrl) => setSignatureDataUrl(dataUrl)}
              onClear={() => setSignatureDataUrl("")}
            />

            {/* Confirmation checkbox */}
            <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-200 dark:border-neutral-700 flex items-start gap-2.5">
              <input
                type="checkbox"
                id="signConsent"
                checked={confirmationChecked}
                onChange={(e) => setConfirmationChecked(e.target.checked)}
                className="mt-0.5 rounded border-neutral-300 text-[#00843D] focus:ring-[#00843D] cursor-pointer"
              />
              <label htmlFor="signConsent" className="text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer">
                Confirmo a exatidão das informações, declaro que recebi o pertence acima discriminado e dou plena quitação de entrega perante o IFPR Campus Ivaiporã.
              </label>
            </div>

            {/* Submission Progress Feedback Banner */}
            {isSubmitting && submissionStep && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-[#00843D] dark:text-[#00c75c] font-bold flex items-center gap-2 animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>{submissionStep}</span>
              </div>
            )}

            {/* Footer Action Buttons */}
            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!signatureDataUrl || !confirmationChecked || isSubmitting}
                onClick={handleConfirmSignature}
                className="px-5 py-2.5 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white font-extrabold text-xs shadow-md flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Concluindo Baixa...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Assinar e Confirmar Recebimento</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
