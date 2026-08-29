import React, { useState, useEffect } from "react";
import { LostFoundItem, User } from "../types";
import { useApp } from "../context/AppContext";
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
  Send,
  Download,
  Printer,
  Sparkles,
  AlertTriangle,
  UserCheck,
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

interface RemoteSignatureModalProps {
  itemId?: string;
  token?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export const RemoteSignatureModal: React.FC<RemoteSignatureModalProps> = ({
  itemId,
  token,
  onClose,
  onSuccess,
}) => {
  const { items, currentUser, addToast, updateDocDirectly, logAdminAction } = useApp();
  const [signatureDataUrl, setSignatureDataUrl] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [documentNumber, setDocumentNumber] = useState("");
  const [confirmationChecked, setConfirmationChecked] = useState(true);

  const item = items.find((i) => i.id === itemId);

  // Check if item is already signed
  useEffect(() => {
    if (item?.recipientSignatureUrl && item?.recipientSignatureStatus === "SIGNED") {
      setIsCompleted(true);
      setSignatureDataUrl(item.recipientSignatureUrl);
    }
  }, [item]);

  if (!item) {
    return (
      <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
        <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 max-w-md w-full border border-neutral-200 dark:border-neutral-800 shadow-2xl text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
          <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
            Objeto Não Encontrado
          </h3>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Não encontramos a ocorrência com código #{itemId}. Ela pode ter sido transferida ou o link expirou.
          </p>
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-xl text-xs font-bold"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  const signerName = item.recipientName || currentUser?.name || "Proprietário / Receptor";
  const signerEmail = item.recipientEmail || currentUser?.email || "estudante@ifpr.edu.br";
  const signerBond = item.recipientBond || currentUser?.role || "Aluno(a)";

  const handleConfirmSignature = async () => {
    if (!signatureDataUrl) {
      addToast("Por favor, faça sua assinatura digital no quadro antes de confirmar.", "error");
      return;
    }
    if (!confirmationChecked) {
      addToast("Confirme o termo de recebimento para prosseguir.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      const updatedHistory = [
        ...(item.history || []),
        {
          id: `hist-sign-${Date.now()}`,
          action: "Assinatura Digital Confirmada",
          actorId: currentUser?.id || "remote-user",
          actorName: signerName,
          actorRole: (signerBond === "Servidor" ? "SERVIDOR" : "ALUNO") as any,
          timestamp: now,
          details: `Assinatura digital do termo de recebimento concluída pelo receptor (${signerName}).`,
        },
      ];

      // Update Firestore document
      await updateDocDirectly("items", item.id, {
        recipientSignatureUrl: signatureDataUrl,
        recipientSignatureType: "REMOTE_EMAIL",
        recipientSignatureStatus: "SIGNED",
        recipientDocument: documentNumber || item.recipientDocument || "",
        signedAt: now,
        status: "DEVOLVIDO",
        history: updatedHistory,
        historyLogs: updatedHistory,
      });

      try {
        await logAdminAction(
          "ASSINATURA_DIGITAL_RECEBIDA",
          `Assinatura digital de devolução registrada para o item #${item.id} por ${signerName}`
        );
      } catch (_) {}

      // Notify automated API endpoint of signed receipt
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

      setIsCompleted(true);
      addToast("Assinatura digital confirmada e registrada com sucesso!", "success");
    } catch (err: any) {
      console.error("Erro ao salvar assinatura:", err);
      addToast("Erro ao gravar assinatura digital. Tente novamente.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadSignedPDF = () => {
    try {
      const doc = new jsPDF("p", "mm", "a4");
      const validationCode = item.receiptValidationCode || `REC-IFPR-${item.id.toUpperCase().slice(0, 6)}`;
      const formattedDate = new Date().toLocaleString("pt-BR");

      // Banner IFPR
      doc.setFillColor(0, 132, 61);
      doc.rect(0, 0, 210, 24, "F");
      doc.setFillColor(200, 30, 30);
      doc.rect(0, 24, 210, 2.5, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("INSTITUTO FEDERAL DO PARANÁ - CAMPUS IVAIPORÃ", 14, 11);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text("TERMO OFICIAL DE RESTITUIÇÃO E ASSINATURA DIGITAL", 14, 18);

      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("RECIBO ELETRÔNICO DE DEVOLUÇÃO DE PERTENCE", 14, 34);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(`Código de Autenticação: ${validationCode}`, 14, 40);
      doc.text(`Data e Hora da Assinatura: ${item.signedAt ? new Date(item.signedAt).toLocaleString("pt-BR") : formattedDate}`, 14, 45);
      doc.text(`Campus: IFPR Ivaiporã • Seção de Apoio ao Estudante (SEBAC)`, 14, 50);

      // Section 1: Item Data
      autoTable(doc, {
        startY: 55,
        head: [["1. DADOS DO OBJETO RESTITUÍDO", ""]],
        body: [
          ["Código / ID da Ocorrência:", item.id],
          ["Título do Objeto:", item.title],
          ["Categoria / Local Encontrado:", `${item.category} • ${item.location}`],
          ["Cor / Marca:", `${item.color || "N/I"} • ${item.brand || "N/I"}`],
          ["Data de Devolução:", item.returnDate || new Date().toLocaleDateString("pt-BR")],
          ["Servidor Responsável:", item.returnedByName || "Equipe SEBAC / Portaria IFPR"],
        ],
        theme: "grid",
        headStyles: { fillColor: [0, 132, 61], textColor: [255, 255, 255], fontStyle: "bold" },
        styles: { fontSize: 8, cellPadding: 2.5 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 55, fillColor: [248, 250, 252] } },
      });

      let currentY = (doc as any).lastAutoTable.finalY + 6;

      // Section 2: Recipient Data
      autoTable(doc, {
        startY: currentY,
        head: [["2. DADOS DO PROPRIETÁRIO / RECEPTOR", ""]],
        body: [
          ["Nome Completo:", signerName],
          ["E-mail:", signerEmail],
          ["Vínculo com o IFPR:", signerBond],
          ["Documento / Matrícula:", documentNumber || item.recipientDocument || "Conferido presencialmente"],
          ["Observações:", item.returnObservations || "Recebimento confirmado sem ressalvas."],
        ],
        theme: "grid",
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
        styles: { fontSize: 8, cellPadding: 2.5 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 55, fillColor: [248, 250, 252] } },
      });

      currentY = (doc as any).lastAutoTable.finalY + 8;

      // Section 3: Digital Signature Rendering
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(0, 132, 61);
      doc.text("3. ASSINATURA DIGITAL E TERMO DE QUITAÇÃO", 14, currentY);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(
        "Declaro para todos os fins ter recebido o objeto acima descrito em perfeitas condições, dando plena e rasa quitação.",
        14,
        currentY + 5
      );

      currentY += 12;

      // Render the captured PNG signature if available
      if (signatureDataUrl) {
        try {
          doc.addImage(signatureDataUrl, "PNG", 14, currentY, 70, 28);
        } catch (e) {
          console.warn("Signature image render skipped:", e);
        }
      }

      // Left Signature line: Recipient
      doc.line(14, currentY + 30, 95, currentY + 30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);
      doc.text(signerName, 54.5, currentY + 34, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`Assinado Digitalmente (${signerBond})`, 54.5, currentY + 37.5, { align: "center" });

      // Right Signature line: Server
      doc.line(115, currentY + 30, 196, currentY + 30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);
      doc.text(item.returnedByName || "Servidor Responsável", 155.5, currentY + 34, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text("SEBAC / Portaria • IFPR Campus Ivaiporã", 155.5, currentY + 37.5, { align: "center" });

      // Footer
      doc.setFontSize(6.5);
      doc.setTextColor(148, 163, 184);
      doc.line(14, 286, 196, 286);
      doc.text(
        `IFPR Campus Ivaiporã • Sistema de Gestão de Achados e Perdidos • Termo #${validationCode}`,
        14,
        290
      );
      doc.text(`Emitido em ${formattedDate}`, 196, 290, { align: "right" });

      doc.save(`Recibo_Assinado_IFPR_${item.id}_${new Date().toISOString().slice(0, 10)}.pdf`);
      addToast("Recibo oficial assinado baixado com sucesso!", "success");
    } catch (err) {
      console.error(err);
      addToast("Erro ao gerar PDF do recibo assinado.", "error");
    }
  };

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto animate-in fade-in">
      <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 max-w-xl w-full border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-4 my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-[#00843D]">
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
            className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
          >
            <X className="w-4 h-4" />
          </button>
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

        {isCompleted ? (
          /* Completed Success Screen */
          <div className="text-center py-6 space-y-4 animate-in zoom-in-95">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-[#00843D] flex items-center justify-center mx-auto">
              <CheckCircle className="w-9 h-9" />
            </div>
            <div className="space-y-1">
              <h4 className="text-lg font-black text-neutral-900 dark:text-white">
                Recebimento Confirmado & Assinado!
              </h4>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 max-w-sm mx-auto">
                O termo de restituição com assinatura digital foi registrado com sucesso no sistema institucional do IFPR.
              </p>
            </div>

            {signatureDataUrl && (
              <div className="max-w-xs mx-auto p-3 bg-white rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-xs">
                <p className="text-[10px] uppercase font-bold text-neutral-400 mb-1">
                  Assinatura Gravada:
                </p>
                <img
                  src={signatureDataUrl}
                  alt="Assinatura"
                  className="max-h-20 mx-auto object-contain"
                />
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleDownloadSignedPDF}
                className="px-5 py-2.5 bg-[#00843D] hover:bg-[#006e33] text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>Baixar Recibo Oficial em PDF</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 text-neutral-800 dark:text-neutral-200 rounded-xl text-xs font-bold"
              >
                Concluir
              </button>
            </div>
          </div>
        ) : (
          /* Signature Interactive Form */
          <div className="space-y-4">
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
                Confirmo a exatidão das informações e concordo com o registro eletrônico da assinatura no sistema de Achados e Perdidos do IFPR Campus Ivaiporã.
              </label>
            </div>

            {/* Footer Action Buttons */}
            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!signatureDataUrl || !confirmationChecked || isSubmitting}
                onClick={handleConfirmSignature}
                className="px-5 py-2.5 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white font-extrabold text-xs shadow-md flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{isSubmitting ? "Gravando Assinatura..." : "Assinar e Confirmar Recebimento"}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
