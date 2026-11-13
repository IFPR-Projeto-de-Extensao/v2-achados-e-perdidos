import React from "react";
import { LostFoundItem } from "../types";
import { formatDate, isItemNew } from "../lib/utils";
import { getItemPublicUrl } from "../lib/qrCodeUtils";
import { getCategoryDisplay } from "../lib/categoryUtils";
import {
  MapPin,
  Calendar,
  Tag,
  ArrowRight,
  QrCode,
  CheckSquare,
  Square,
  Printer,
  Sparkles,
  CameraOff,
} from "lucide-react";
import { motion } from "motion/react";
import { UIBadge, UIButton } from "./ui";

interface ItemCardProps {
  item: LostFoundItem;
  onSelect: (item: LostFoundItem) => void;
  selectable?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (itemId: string, selected: boolean) => void;
  index?: number;
}

export const ItemCard: React.FC<ItemCardProps> = ({
  item,
  onSelect,
  selectable = false,
  isSelected = false,
  onToggleSelect,
  index,
}) => {
  const [imgFailed, setImgFailed] = React.useState(false);

  const getStatusBadgeConfig = (
    status: LostFoundItem["status"],
    type: LostFoundItem["type"]
  ): {
    label: string;
    tone: "emerald" | "rose" | "amber" | "blue" | "slate";
  } => {
    switch (status) {
      case "PERDIDO":
        return { label: "Perdido", tone: "rose" };
      case "ENCONTRADO":
        return { label: "Encontrado", tone: "emerald" };
      case "EM_ANALISE":
        return { label: "Em Análise", tone: "amber" };
      case "DEVOLVIDO":
        return { label: "Devolvido", tone: "blue" };
      default:
        return {
          label: type === "PERDIDO" ? "Perdido" : "Encontrado",
          tone: type === "PERDIDO" ? "rose" : "emerald",
        };
    }
  };

  const badge = getStatusBadgeConfig(item.status, item.type);
  const isNew = isItemNew(item);

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
            body { font-family: 'Inter', system-ui, -apple-system, sans-serif; padding: 24px; background: #f8fafc; color: #172B2A; }
            .tag-card { max-width: 440px; margin: 0 auto; background: white; border: 2px dashed #16845B; border-radius: 16px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
            .header { text-align: center; border-bottom: 2px solid #16845B; padding-bottom: 12px; margin-bottom: 16px; }
            .header h1 { font-size: 16px; color: #16845B; margin: 0; font-weight: 800; text-transform: uppercase; }
            .header p { font-size: 12px; color: #64748b; margin: 4px 0 0 0; }
            .qr-box { text-align: center; margin: 16px 0; padding: 16px; background: #f1f5f9; border-radius: 12px; }
            .qr-code-img { width: 140px; height: 140px; margin: 0 auto; }
            .qr-id { font-family: monospace; font-size: 13px; font-weight: bold; margin-top: 8px; color: #16845B; }
            .info-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; }
            .info-table td { padding: 6px 4px; border-bottom: 1px solid #e2e8f0; }
            .info-table td.label { font-weight: bold; color: #475569; width: 38%; }
            .footer { text-align: center; font-size: 10px; color: #94a3b8; margin-top: 16px; padding-top: 8px; border-top: 1px solid #e2e8f0; }
            .btn-print { display: block; width: 100%; max-width: 440px; margin: 16px auto 0 auto; padding: 12px; background: #16845B; color: white; border: none; border-radius: 12px; font-weight: bold; cursor: pointer; text-align: center; }
          </style>
        </head>
        <body>
          <div class="tag-card">
            <div class="header">
              <h1>IFPR Campus Ivaiporã</h1>
              <p>Achados e Perdidos • Etiqueta de Identificação Física</p>
            </div>
            <div class="qr-box">
              <img class="qr-code-img" src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(getItemPublicUrl(item))}" alt="QR Code" />
              <div class="qr-id">${item.qrCodeId}</div>
            </div>
            <table class="info-table">
              <tr><td class="label">ID da Ocorrência:</td><td><strong>${item.id}</strong></td></tr>
              <tr><td class="label">Título do Item:</td><td><strong>${item.title}</strong></td></tr>
              <tr><td class="label">Categoria / Tipo:</td><td>${getCategoryDisplay(item.category)} (${item.type})</td></tr>
              <tr><td class="label">Local Encontrado:</td><td>${item.location}</td></tr>
              <tr><td class="label">Data de Entrada:</td><td>${formatDate(item.date)}</td></tr>
              <tr><td class="label">Cor / Marca:</td><td>${item.color || "N/I"} • ${item.brand || "N/I"}</td></tr>
              <tr><td class="label">Atendimento:</td><td>Guarita Principal / SEBAC Campus Ivaiporã</td></tr>
            </table>
            <div class="footer">
              Sistema Oficial de Gestão de Achados e Perdidos • IFPR Campus Ivaiporã
            </div>
          </div>
          <button id="btnPrintCardTag" class="btn-print no-print">🖨️ Imprimir / Salvar como PDF</button>
        </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    const btn = printWindow.document.getElementById("btnPrintCardTag");
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

  const hasValidImage =
    Boolean(item.imageUrl) &&
    item.imageUrl.trim() !== "" &&
    !item.imageUrl.includes("photo-1584438784894-089d6a62b8fa") &&
    !imgFailed;

  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: -6 }}
      whileHover={{ y: -3, transition: { duration: 0.18 } }}
      transition={{
        duration: 0.25,
        ease: [0.16, 1, 0.3, 1],
        delay: index !== undefined ? Math.min(index * 0.025, 0.18) : 0,
      }}
      onClick={() => onSelect(item)}
      className={`group relative bg-white dark:bg-[#111827] rounded-2xl border transition-all duration-200 flex flex-col justify-between overflow-hidden cursor-pointer ${
        isSelected
          ? "border-[#16845B] ring-2 ring-[#16845B]/25 shadow-md"
          : "border-slate-200/80 dark:border-slate-800/90 shadow-[0_2px_10px_rgba(6,78,59,0.04)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.3)] hover:shadow-[0_12px_28px_rgba(6,78,59,0.10)] dark:hover:shadow-[0_12px_28px_rgba(0,0,0,0.5)] hover:border-[#16845B]/50 dark:hover:border-emerald-500/50"
      }`}
    >
      <div>
        {/* Top Image Container with Consistent 16:10 Aspect Ratio */}
        <div className="relative aspect-[16/10] w-full bg-[#F8FAFC] dark:bg-slate-900 overflow-hidden border-b border-slate-100 dark:border-slate-800/80">
          {hasValidImage ? (
            <img
              src={item.imageUrl}
              alt={item.title}
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div
              className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#F8FAFC] to-[#EBF5F0]/50 dark:from-slate-900 dark:to-slate-950 text-slate-400 dark:text-slate-500 p-4 text-center"
              aria-label="Sem foto anexada"
            >
              <div className="w-11 h-11 rounded-2xl bg-white dark:bg-slate-800 shadow-2xs border border-slate-200/70 dark:border-slate-700/70 flex items-center justify-center text-[#16845B] dark:text-emerald-400 mb-2 group-hover:scale-105 transition-transform duration-200">
                <CameraOff className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold text-[#172B2A] dark:text-slate-300">
                Sem foto anexada
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {getCategoryDisplay(item.category)}
              </span>
            </div>
          )}

          {/* Top Floating Badges */}
          <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between gap-1.5 pointer-events-none">
            <div className="flex items-center gap-1.5 pointer-events-auto">
              {selectable && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelect?.(item.id, !isSelected);
                  }}
                  className={`p-1.5 rounded-xl backdrop-blur-md border shadow-xs transition-all flex items-center justify-center cursor-pointer ${
                    isSelected
                      ? "bg-[#16845B] text-white border-[#16845B]"
                      : "bg-white/90 dark:bg-slate-900/90 text-[#172B2A] dark:text-white border-slate-200 dark:border-slate-700 hover:bg-white"
                  }`}
                  aria-label={`Selecionar objeto ${item.title}`}
                >
                  {isSelected ? (
                    <CheckSquare className="w-4 h-4 text-white" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
              )}

              <UIBadge
                tone={badge.tone}
                className="shadow-2xs backdrop-blur-md bg-opacity-95"
              >
                {badge.label}
              </UIBadge>

              {isNew && (
                <span
                  id={`item-card-new-badge-${item.id}`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#16845B] text-white border border-white/20 shadow-2xs"
                  title="Item registrado no campus nas últimas 24 horas"
                >
                  <Sparkles className="w-2.5 h-2.5 text-amber-200 fill-amber-200" />
                  <span>Novo</span>
                </span>
              )}
            </div>

            {/* Right QR Tag Identifier */}
            <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md text-[#172B2A] dark:text-slate-200 px-2 py-0.5 rounded-lg text-[10px] font-mono font-semibold flex items-center gap-1 border border-slate-200/80 dark:border-slate-700 shadow-2xs pointer-events-auto">
              <QrCode className="w-3 h-3 text-[#16845B] dark:text-emerald-400" />
              <span>{String(item.id ?? "").toUpperCase()}</span>
            </div>
          </div>
        </div>

        {/* Card Body */}
        <div className="p-4 sm:p-5 space-y-2.5">
          {/* Category & Color Row */}
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5 font-semibold text-[#16845B] dark:text-emerald-400">
              <Tag className="w-3.5 h-3.5 shrink-0" />
              <span>{getCategoryDisplay(item.category)}</span>
            </span>
            {item.color && (
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-[#F8FAFC] dark:bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-200/70 dark:border-slate-700/70">
                {item.color}
              </span>
            )}
          </div>

          {/* Readable Item Title */}
          <h3 className="font-bold text-base text-[#172B2A] dark:text-white line-clamp-2 group-hover:text-[#16845B] dark:group-hover:text-emerald-400 transition-colors tracking-tight leading-snug">
            {item.title}
          </h3>

          {/* Concise Description */}
          <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed min-h-[2rem]">
            {item.description}
          </p>

          {/* Discreet Location & Date Metadata */}
          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-start gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#16845B] dark:text-emerald-400 shrink-0 mt-0.5" />
              <span className="font-medium text-[#172B2A]/90 dark:text-slate-300 leading-snug line-clamp-1">
                {item.location}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>{formatDate(item.date)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Card Footer Actions */}
      <div className="px-4 pb-4 sm:px-5 sm:pb-5 pt-1 flex items-center gap-2">
        <UIButton
          type="button"
          variant="secondary"
          size="md"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(item);
          }}
          className="flex-1 min-h-[40px] group-hover:bg-[#16845B] group-hover:text-white group-hover:border-[#16845B] dark:group-hover:bg-[#16845B] dark:group-hover:text-white dark:group-hover:border-[#16845B]"
        >
          <span>Ver Detalhes</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </UIButton>

        <button
          type="button"
          onClick={handleQuickPrintTag}
          className="min-h-[40px] min-w-[40px] p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-[#16845B] hover:border-[#16845B]/50 hover:bg-[#EBF5F0]/50 dark:hover:text-emerald-400 font-semibold text-xs transition-all cursor-pointer shadow-2xs flex items-center justify-center"
          title="Imprimir Etiqueta Física QR"
          aria-label="Imprimir Etiqueta Física QR"
        >
          <Printer className="w-4 h-4" />
        </button>
      </div>
    </motion.article>
  );
};

export default ItemCard;
