import React from "react";
import { LostFoundItem } from "../types";
import { formatDate } from "../lib/utils";
import { MapPin, Calendar, Tag, ArrowRight, ShieldCheck, QrCode } from "lucide-react";
import { motion } from "motion/react";

interface ItemCardProps {
  item: LostFoundItem;
  onSelect: (item: LostFoundItem) => void;
}

export const ItemCard: React.FC<ItemCardProps> = ({ item, onSelect }) => {
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
          />

          {/* Type/Status Badge */}
          <div className="absolute top-3 left-3 flex items-center space-x-1.5">
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold tracking-wide uppercase border backdrop-blur-md ${badge.bgColor} ${badge.textColor} ${badge.borderColor}`}
            >
              {badge.label}
            </span>
          </div>

          {/* QR Code Tag Badge */}
          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-white px-2 py-1 rounded-lg text-[10px] font-mono flex items-center space-x-1 border border-white/20">
            <QrCode className="w-3 h-3 text-green-400" />
            <span>{item.id.toUpperCase()}</span>
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
      <div className="px-4 pb-4 pt-1">
        <button
          onClick={() => onSelect(item)}
          className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-bold text-xs hover:bg-[#00843D] hover:text-white dark:hover:bg-[#00843D] dark:hover:text-white transition-all group-hover:shadow-md"
        >
          <span>Ver Detalhes</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
};
