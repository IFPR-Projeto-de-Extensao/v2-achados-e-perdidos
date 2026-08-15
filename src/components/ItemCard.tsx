import React from "react";
import { LostFoundItem } from "../types";
import { formatDate } from "../lib/utils";
import { MapPin, Calendar, Tag, ArrowRight, ShieldCheck, QrCode, CheckSquare, Square, Printer } from "lucide-react";
import { motion } from "motion/react";

interface ItemCardProps {
  item: LostFoundItem;
  onSelect: (item: LostFoundItem) => void;
  selectable?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (itemId: string, selected: boolean) => void;
}

export const ItemCard: React.FC<ItemCardProps> = ({
  item,
  onSelect,
  selectable = false,
  isSelected = false,
  onToggleSelect,
}) => {
  const getStatusBadge = (status: LostFoundItem["status"], type: LostFoundItem["type"]) => {
    switch (status) {
      case "PERDIDO":
        return {
          label: "PERDIDO",
          bgColor: "bg-[#EF4444]/10 dark:bg-[#EF4444]/20",
          textColor: "text-[#EF4444] dark:text-red-400",
          borderColor: "border-[#EF4444]/30",
        };
      case "ENCONTRADO":
        return {
          label: "ENCONTRADO",
          bgColor: "bg-[#22C55E]/10 dark:bg-[#22C55E]/20",
          textColor: "text-[#22C55E] dark:text-green-400",
          borderColor: "border-[#22C55E]/30",
        };
      case "EM_ANALISE":
        return {
          label: "EM ANÁLISE",
          bgColor: "bg-[#F59E0B]/10 dark:bg-[#F59E0B]/20",
          textColor: "text-[#F59E0B] dark:text-amber-400",
          borderColor: "border-[#F59E0B]/30",
        };
      case "DEVOLVIDO":
        return {
          label: "DEVOLVIDO",
          bgColor: "bg-[#3B82F6]/10 dark:bg-[#3B82F6]/20",
          textColor: "text-[#3B82F6] dark:text-blue-400",
          borderColor: "border-[#3B82F6]/30",
        };
      default:
        return {
          label: type,
          bgColor: "bg-neutral-100 dark:bg-neutral-800",
          textColor: "text-neutral-700 dark:text-neutral-300",
          borderColor: "border-neutral-200 dark:border-neutral-700",
        };
    }
  };

  const badge = getStatusBadge(item.status, item.type);

  const handleQuickPrintTag = (e: React.MouseEvent) => {
    e.stopPropagation();
    const printWindow = window.open("", "_blank", "width=700,height=800");
    if (!printWindow) return;
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Etiqueta IFPR - ${item.id}</title>
          <style>
            @media print { body { margin: 0; padding: 10px; background: white; } .no-print { display: none; } }
            body { font-family: system-ui, -apple-system, sans-serif; padding: 24px; background: #f8fafc; color: #0f172a; }
            .tag-card { max-width: 440px; margin: 0 auto; bg: white; border: 2px dashed #00843D; border-radius: 16px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
            .header { text-align: center; border-bottom: 2px solid #00843D; padding-bottom: 12px; margin-bottom: 16px; }
            .header h1 { font-size: 16px; color: #00843D; margin: 0; font-weight: 800; text-transform: uppercase; }
            .header p { font-size: 12px; color: #64748b; margin: 4px 0 0 0; }
            .qr-box { text-align: center; margin: 16px 0; padding: 16px; background: #f1f5f9; border-radius: 12px; }
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
              <p>Achados e Perdidos • Etiqueta de Identificação Física</p>
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
          <script>window.onload = function() { setTimeout(function() { window.print(); }, 500); };</script>
        </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="group bg-white dark:bg-[#1E1E1E] rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80 overflow-hidden shadow-xs hover:shadow-xl hover:border-[#00843D]/30 dark:hover:border-[#00843D]/50 transition-all flex flex-col justify-between"
    >
      <div>
        {/* Image Container with Top Badges */}
        <div className="relative h-48 w-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
          <img
            src={item.imageUrl}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            decoding="async"
          />

          {/* Select Checkbox for Bulk Ops */}
          {selectable && (
            <div className="absolute top-3 left-3 z-10 flex items-center space-x-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect?.(item.id, !isSelected);
                }}
                className={`p-1.5 rounded-lg backdrop-blur-md border shadow-md transition-all flex items-center justify-center ${
                  isSelected
                    ? "bg-[#00843D] text-white border-[#00843D]"
                    : "bg-black/60 text-white border-white/30 hover:bg-black/80"
                }`}
                aria-label={`Selecionar objeto ${item.title}`}
              >
                {isSelected ? (
                  <CheckSquare className="w-4 h-4 text-white fill-white" />
                ) : (
                  <Square className="w-4 h-4 text-white" />
                )}
              </button>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border backdrop-blur-md ${badge.bgColor} ${badge.textColor} ${badge.borderColor}`}
              >
                {badge.label}
              </span>
            </div>
          )}

          {/* Type/Status Badge (when not selectable) */}
          {!selectable && (
            <div className="absolute top-3 left-3 flex items-center space-x-1.5">
              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold tracking-wide uppercase border backdrop-blur-md ${badge.bgColor} ${badge.textColor} ${badge.borderColor}`}
              >
                {badge.label}
              </span>
            </div>
          )}

          {/* QR Code Tag Badge */}
          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-white px-2 py-1 rounded-lg text-[10px] font-mono flex items-center space-x-1 border border-white/20">
            <QrCode className="w-3 h-3 text-green-400" />
            <span>{String(item.id ?? "").toUpperCase()}</span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
            <span className="flex items-center gap-1 font-semibold text-[#00843D] dark:text-green-400 bg-[#00843D]/10 dark:bg-[#00843D]/20 px-2 py-0.5 rounded-md">
              <Tag className="w-3 h-3" />
              {item.category}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3 text-neutral-400" />
              {formatDate(item.date)}
            </span>
          </div>

          <h3 className="font-bold text-base text-neutral-900 dark:text-white line-clamp-1 group-hover:text-[#00843D] dark:group-hover:text-green-400 transition-colors">
            {item.title}
          </h3>

          <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2 leading-relaxed">
            {item.description}
          </p>

          <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center text-xs text-neutral-500 dark:text-neutral-400">
            <MapPin className="w-3.5 h-3.5 text-[#00843D] dark:text-green-400 shrink-0 mr-1.5" />
            <span className="truncate">{item.location}</span>
          </div>
        </div>
      </div>

      {/* Footer Action */}
      <div className="px-4 pb-4 pt-1 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleQuickPrintTag}
          className="flex items-center justify-center space-x-1 py-2 px-2.5 rounded-xl border border-[#00843D]/30 bg-[#00843D]/5 text-[#00843D] dark:text-green-400 font-bold text-xs hover:bg-[#00843D] hover:text-white transition-all shadow-2xs"
          title="Imprimir Etiqueta Física QR"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Etiqueta QR</span>
        </button>

        <button
          type="button"
          onClick={() => onSelect(item)}
          className="flex items-center justify-center space-x-1 py-2 px-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-bold text-xs hover:bg-[#00843D] hover:text-white dark:hover:bg-[#00843D] dark:hover:text-white transition-all shadow-2xs"
        >
          <span>Detalhes</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
};
