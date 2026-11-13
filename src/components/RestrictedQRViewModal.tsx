import React from "react";
import { LostFoundItem } from "../types";
import { formatDate } from "../lib/utils";
import { getItemQrValue } from "../lib/qrCodeUtils";
import { QRCodeSVG } from "qrcode.react";
import { ModalShell, SubtlePanel, UIBadge, UIButton } from "./ui";
import {
  X,
  QrCode,
  MapPin,
  Calendar,
  Tag,
  Building,
  Copy,
  Lock,
} from "lucide-react";
import { useApp } from "../context/AppContext";

interface RestrictedQRViewModalProps {
  item: LostFoundItem;
  onClose: () => void;
}

export const RestrictedQRViewModal: React.FC<RestrictedQRViewModalProps> = ({
  item,
  onClose,
}) => {
  const { addToast } = useApp();

  const handleCopyPublicInfo = () => {
    const textToCopy = `[IFPR Achados e Perdidos] Objeto: ${item.title} | Código QR: ${item.qrCodeId} | Local: ${item.location} | Status: ${item.status}`;
    navigator.clipboard.writeText(textToCopy);
    addToast("Informações públicas do QR Code copiadas!", "success");
  };

  return (
    <ModalShell
      isOpen={true}
      onClose={onClose}
      maxWidthClass="max-w-lg"
      zIndexClass="z-60"
      ariaLabelledBy="restricted-qr-title"
    >
      {/* Header Bar */}
      <div className="px-5 sm:px-6 py-4 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/60 border border-[#16845B]/15 text-[#16845B] dark:text-emerald-400 flex items-center justify-center shrink-0">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <h3
              id="restricted-qr-title"
              className="font-bold text-sm sm:text-base tracking-tight text-[#172B2A] dark:text-white"
            >
              Visualização Pública Restrita QR
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              IFPR Campus Ivaiporã • Achados & Perdidos
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar visualização pública do QR Code"
          className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-[#172B2A] dark:hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Security / Privacy Protection Notice */}
      <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200/80 dark:border-amber-800/60 px-5 sm:px-6 py-2.5 flex items-center gap-2.5 text-xs text-amber-900 dark:text-amber-200">
        <Lock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-[11px] font-semibold leading-snug">
          Modo Restrito de Privacidade: Dados confidenciais, e-mails e chave de segurança do proprietário omitidos.
        </p>
      </div>

      {/* Main Content */}
      <div className="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
        {/* Object Main Overview */}
        <SubtlePanel padding="sm" className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
          <img
            src={item.imageUrl}
            alt={item.title}
            className="w-24 h-24 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
          />

          <div className="space-y-1.5 text-center sm:text-left flex-1 min-w-0">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
              <UIBadge tone={item.type === "PERDIDO" ? "rose" : "emerald"}>
                {item.type}
              </UIBadge>
              <UIBadge tone="slate">{item.status}</UIBadge>
            </div>

            <h2 className="text-base font-bold text-[#172B2A] dark:text-white leading-tight break-words">
              {item.title}
            </h2>

            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center justify-center sm:justify-start gap-1.5">
              <Tag className="w-3.5 h-3.5 text-[#16845B] dark:text-emerald-400" />
              <span>{item.category}</span>
            </p>
          </div>
        </SubtlePanel>

        {/* Essential Public Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <SubtlePanel padding="sm">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-0.5">
              Local no Campus
            </span>
            <span className="font-semibold text-[#172B2A] dark:text-white flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#16845B] dark:text-emerald-400 shrink-0" />
              <span>{item.location}</span>
            </span>
          </SubtlePanel>

          <SubtlePanel padding="sm">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-0.5">
              Data da Ocorrência
            </span>
            <span className="font-semibold text-[#172B2A] dark:text-white flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#16845B] dark:text-emerald-400 shrink-0" />
              <span>{formatDate(item.date)}</span>
            </span>
          </SubtlePanel>

          <SubtlePanel padding="sm">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-0.5">
              Cor Predominante
            </span>
            <span className="font-semibold text-[#172B2A] dark:text-white">
              {item.color || "Não informada"}
            </span>
          </SubtlePanel>

          <SubtlePanel padding="sm">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-0.5">
              Marca / Modelo
            </span>
            <span className="font-semibold text-[#172B2A] dark:text-white">
              {item.brand || "Não informada"}
            </span>
          </SubtlePanel>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
            Descrição Pública
          </span>
          <SubtlePanel padding="sm">
            <p className="text-xs text-[#172B2A] dark:text-slate-200 leading-relaxed">
              {item.description}
            </p>
          </SubtlePanel>
        </div>

        {/* QR Code Tag Box */}
        <SubtlePanel
          padding="sm"
          className="border-[#16845B]/25 dark:border-emerald-800/60 bg-[#EBF5F0]/50 dark:bg-emerald-950/20 flex items-center gap-4"
        >
          <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-2xs shrink-0">
            <QRCodeSVG value={getItemQrValue(item)} size={76} level="H" />
          </div>

          <div className="space-y-1 min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#16845B] dark:text-emerald-400 block">
              Código do QR Tag Institucional
            </span>
            <p className="text-xs font-mono font-bold text-[#172B2A] dark:text-white break-all">
              {item.qrCodeId}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
              Código gravado e verificado no acervo de Achados e Perdidos do IFPR Campus Ivaiporã.
            </p>
          </div>
        </SubtlePanel>

        {/* Institutional Instructions */}
        <div className="p-4 rounded-2xl bg-[#EBF5F0]/70 dark:bg-emerald-950/30 border border-[#16845B]/20 dark:border-emerald-800/50 text-xs space-y-2 text-[#172B2A] dark:text-slate-200">
          <div className="flex items-center gap-2 font-bold text-[#064E3B] dark:text-emerald-300">
            <Building className="w-4 h-4 text-[#16845B] dark:text-emerald-400" />
            <span>Instruções para Resgate no Campus Ivaiporã</span>
          </div>
          <ul className="space-y-1 text-[11px] leading-relaxed list-disc list-inside text-slate-600 dark:text-slate-300">
            <li>Dirija-se à <strong>Portaria/Guarita Principal</strong> ou à <strong>Seção de Apoio ao Estudante (SEBAC)</strong> no Bloco Administrativo.</li>
            <li>Apresente um <strong>documento oficial com foto</strong> (RG, CNH ou Carteira do Estudante IFPR).</li>
            <li>Informe o código da etiqueta QR (<strong className="font-mono">{item.qrCodeId}</strong>) ao servidor responsável para conferência e devolução.</li>
          </ul>
        </div>
      </div>

      {/* Modal Actions Footer */}
      <div className="px-5 sm:px-6 py-4 bg-[#F8FAFC] dark:bg-slate-900/60 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2">
        <UIButton
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleCopyPublicInfo}
        >
          <Copy className="w-3.5 h-3.5" />
          <span>Copiar Dados Públicos</span>
        </UIButton>

        <UIButton
          type="button"
          variant="primary"
          size="sm"
          onClick={onClose}
        >
          Fechar
        </UIButton>
      </div>
    </ModalShell>
  );
};
