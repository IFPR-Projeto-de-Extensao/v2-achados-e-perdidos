import React from "react";
import { LostFoundItem } from "../types";
import { formatDate } from "../lib/utils";
import { getItemQrValue } from "../lib/qrCodeUtils";
import { QRCodeSVG } from "qrcode.react";
import {
  X,
  Shield,
  QrCode,
  MapPin,
  Calendar,
  Tag,
  Building,
  CheckCircle2,
  Copy,
  Info,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl max-w-lg w-full border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden space-y-0">
        {/* Header Bar */}
        <div className="p-5 bg-neutral-900 text-white flex items-center justify-between border-b border-neutral-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-[#00843D] text-white">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm tracking-tight text-white flex items-center gap-1.5">
                Visualização Pública Restrita QR
              </h3>
              <p className="text-[10px] text-neutral-400 font-medium">
                IFPR Campus Ivaiporã • Achados & Perdidos
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security / Privacy Protection Notice */}
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-5 py-2.5 flex items-center space-x-2.5 text-xs text-amber-800 dark:text-amber-300">
          <Lock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-[11px] font-bold leading-tight">
            Modo Restrito de Privacidade: Dados confidenciais, e-mails e chave de segurança do proprietário omitidos.
          </p>
        </div>

        {/* Main Content */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Object Main Overview */}
          <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start bg-neutral-50 dark:bg-neutral-800/60 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-700/80">
            <img
              src={item.imageUrl}
              alt={item.title}
              className="w-24 h-24 rounded-2xl object-cover border border-neutral-200 dark:border-neutral-700 shadow-xs shrink-0"
            />

            <div className="space-y-1.5 text-center sm:text-left flex-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    item.type === "PERDIDO"
                      ? "bg-red-500/10 text-red-600 border border-red-500/20"
                      : "bg-green-500/10 text-green-600 border border-green-500/20"
                  }`}
                >
                  {item.type}
                </span>

                <span className="px-2.5 py-0.5 rounded-full bg-[#00843D]/10 text-[#00843D] dark:text-green-400 text-[10px] font-bold uppercase border border-[#00843D]/20">
                  {item.status}
                </span>
              </div>

              <h2 className="text-base font-extrabold text-neutral-900 dark:text-white leading-tight">
                {item.title}
              </h2>

              <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium flex items-center justify-center sm:justify-start gap-1">
                <Tag className="w-3.5 h-3.5 text-[#00843D]" /> {item.category}
              </p>
            </div>
          </div>

          {/* Essential Public Details */}
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-700/60">
              <span className="text-[10px] font-bold text-neutral-400 uppercase block mb-0.5">
                Local no Campus
              </span>
              <span className="font-bold text-neutral-900 dark:text-white flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-[#00843D]" /> {item.location}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-700/60">
              <span className="text-[10px] font-bold text-neutral-400 uppercase block mb-0.5">
                Data da Ocorrência
              </span>
              <span className="font-bold text-neutral-900 dark:text-white flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-[#00843D]" /> {formatDate(item.date)}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-700/60">
              <span className="text-[10px] font-bold text-neutral-400 uppercase block mb-0.5">
                Cor Predominante
              </span>
              <span className="font-bold text-neutral-900 dark:text-white">
                {item.color || "Não informada"}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-700/60">
              <span className="text-[10px] font-bold text-neutral-400 uppercase block mb-0.5">
                Marca / Modelo
              </span>
              <span className="font-bold text-neutral-900 dark:text-white">
                {item.brand || "Não informada"}
              </span>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 block">
              Descrição Pública
            </span>
            <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed bg-neutral-50 dark:bg-neutral-800/80 p-3 rounded-xl border border-neutral-200 dark:border-neutral-700">
              {item.description}
            </p>
          </div>

          {/* QR Code Tag Box */}
          <div className="p-4 rounded-2xl bg-[#00843D]/5 dark:bg-[#00843D]/10 border border-[#00843D]/30 flex items-center space-x-4">
            <div className="p-2 bg-white rounded-xl shadow-xs shrink-0 border border-neutral-200">
              <QRCodeSVG value={getItemQrValue(item)} size={76} level="H" />
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#00843D] dark:text-green-400">
                Código do QR Tag Institucional
              </span>
              <p className="text-xs font-mono font-black text-neutral-900 dark:text-white">
                {item.qrCodeId}
              </p>
              <p className="text-[10px] text-neutral-500 leading-tight">
                Código gravado e verificado no acervo de Achados e Perdidos do IFPR Campus Ivaiporã.
              </p>
            </div>
          </div>

          {/* Institutional Instructions */}
          <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-xs space-y-2 text-blue-950 dark:text-blue-200">
            <div className="flex items-center space-x-2 font-black text-blue-800 dark:text-blue-300">
              <Building className="w-4 h-4" />
              <span>Instruções para Resgate no Campus Ivaiporã</span>
            </div>
            <ul className="space-y-1 text-[11px] leading-relaxed list-disc list-inside text-neutral-700 dark:text-neutral-300 font-medium">
              <li>Dirija-se à <strong>Portaria/Guarita Principal</strong> ou à <strong>Seção de Apoio ao Estudante (SEBAC)</strong> no Bloco Administrativo.</li>
              <li>Apresente um <strong>documento oficial com foto</strong> (RG, CNH ou Carteira do Estudante IFPR).</li>
              <li>Informe o código da etiqueta QR (<strong>{item.qrCodeId}</strong>) ao servidor responsável para conferência e devolução.</li>
            </ul>
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="p-4 bg-neutral-50 dark:bg-neutral-800/80 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2">
          <button
            onClick={handleCopyPublicInfo}
            className="px-4 py-2 rounded-xl bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-bold hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors flex items-center space-x-1.5"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copiar Dados Públicos</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white text-xs font-extrabold shadow-md transition-all"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
