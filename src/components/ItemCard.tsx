import React, { useState } from "react";
import { LostFoundItem } from "../types";
import { formatDate, vibrateClick } from "../lib/utils";
import { getCategoryDisplay, normalizeCategory } from "../lib/categoryUtils";
import {
  Laptop,
  FileText,
  Shirt,
  Key,
  BookOpen,
  Watch,
  Coffee,
  Umbrella,
  HelpCircle,
  CameraOff,
  ChevronRight,
  Check,
} from "lucide-react";

interface ItemCardProps {
  item: LostFoundItem;
  onSelect: (item: LostFoundItem) => void;
  index?: number;
  selectable?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string, shouldSelect: boolean) => void;
}

const getCategoryIcon = (category: string) => {
  const canonical = normalizeCategory(category);
  switch (canonical) {
    case "Eletrônicos":
      return Laptop;
    case "Documentos & Cartões":
      return FileText;
    case "Roupas & Calçados":
      return Shirt;
    case "Chaves":
      return Key;
    case "Material Escolar & Livros":
      return BookOpen;
    case "Acessórios & Bijuterias":
      return Watch;
    case "Garrafas & Marmitas":
      return Coffee;
    case "Guarda-chuvas":
      return Umbrella;
    default:
      return HelpCircle;
  }
};

export const ItemCard: React.FC<ItemCardProps> = ({
  item,
  onSelect,
  selectable = false,
  isSelected = false,
  onToggleSelect,
}) => {
  const [imgError, setImgError] = useState(false);

  const isFound = item?.type === "ENCONTRADO";
  const isReturned = item?.status === "DEVOLVIDO";
  const isUnderReview = item?.status === "EM_ANALISE";
  const displayCat = getCategoryDisplay(item?.category);
  const CategoryIcon = getCategoryIcon(displayCat);

  const hasValidImage =
    Boolean(item?.imageUrl) &&
    !imgError &&
    !item.imageUrl?.includes("photo-1584438784894-089d6a62b8fa");

  const getStatusLabel = () => {
    if (isReturned) return "Devolvido";
    if (isUnderReview) return "Em análise";
    return isFound ? "Encontrado" : "Perdido";
  };

  const getStatusTextClass = () => {
    if (isReturned) return "text-blue-600 dark:text-blue-400";
    if (isUnderReview) return "text-amber-600 dark:text-amber-400";
    return isFound
      ? "text-[#16845B] dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400";
  };

  return (
    <article
      onClick={() => {
        vibrateClick();
        if (selectable && onToggleSelect) {
          onToggleSelect(item.id, !isSelected);
        } else {
          onSelect(item);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Ver detalhes de ${item?.title || "Objeto"}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          vibrateClick();
          if (selectable && onToggleSelect) {
            onToggleSelect(item.id, !isSelected);
          } else {
            onSelect(item);
          }
        }
      }}
      className={`group flex sm:flex-col items-center sm:items-stretch gap-3.5 sm:gap-0 py-3 sm:py-0 bg-white dark:bg-[#111827] sm:rounded-xl sm:border transition-colors cursor-pointer overflow-hidden focus-visible:outline-2 focus-visible:outline-[#16845B] ${
        isSelected
          ? "sm:border-[#16845B] bg-[#EBF5F0]/40 dark:bg-emerald-950/20"
          : "sm:border-slate-200/80 dark:sm:border-slate-800 hover:border-[#16845B]/50"
      }`}
    >
      {/* Thumbnail no Mobile (80x80px) / Proporção 16:10 no Tablet & Desktop */}
      <div className="relative w-20 h-20 sm:w-full sm:h-auto sm:aspect-[16/10] rounded-xl sm:rounded-none overflow-hidden bg-[#F8FAFC] dark:bg-slate-900 sm:border-b sm:border-slate-100 dark:sm:border-slate-800/80 shrink-0">
        {hasValidImage ? (
          <img
            src={item.imageUrl}
            alt={item?.title || "Imagem do objeto"}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-slate-50 dark:bg-slate-900">
            <CategoryIcon className="w-6 h-6 text-slate-400 dark:text-slate-500" />
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              <CameraOff className="w-3 h-3" />
              <span>Sem foto</span>
            </span>
          </div>
        )}

        {selectable && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect && onToggleSelect(item.id, !isSelected);
            }}
            className={`absolute top-2 left-2 w-6 h-6 rounded-md border flex items-center justify-center transition-colors ${
              isSelected
                ? "bg-[#16845B] border-[#16845B] text-white"
                : "bg-white/90 dark:bg-slate-900/90 border-slate-300 dark:border-slate-600"
            }`}
          >
            {isSelected && <Check className="w-3.5 h-3.5" />}
          </div>
        )}
      </div>

      {/* Conteúdo Objetivo (Sem excesso de badges/pílulas) */}
      <div className="flex-1 min-w-0 sm:p-4 flex flex-col justify-between">
        <div>
          {/* Linha 1: Status + Categoria + Data (Texto limpo separado por ponto) */}
          <div className="flex items-center flex-wrap gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span className={`font-semibold ${getStatusTextClass()}`}>
              {getStatusLabel()}
            </span>
            <span aria-hidden="true">·</span>
            <span>{displayCat}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{formatDate(item?.date)}</span>
          </div>

          {/* Linha 2: Título do Objeto */}
          <h3 className="mt-1 font-semibold text-sm sm:text-base text-[#172B2A] dark:text-white leading-snug line-clamp-2 group-hover:text-[#16845B] dark:group-hover:text-emerald-400 transition-colors">
            {item?.title || "Objeto sem título"}
          </h3>
        </div>

        {/* Linha 3: Localização + Cor (quando informada) */}
        <div className="mt-1.5 sm:mt-3 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <p className="truncate">
            <span>{item?.location || "Local não informado"}</span>
            {item?.color && (
              <>
                <span aria-hidden="true"> · </span>
                <span>{item.color}</span>
              </>
            )}
          </p>
          <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-[#16845B] shrink-0 sm:hidden" />
        </div>
      </div>
    </article>
  );
};
