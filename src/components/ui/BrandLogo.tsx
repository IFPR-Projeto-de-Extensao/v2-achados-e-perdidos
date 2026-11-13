import React from "react";
import { MapPin, Plus } from "lucide-react";

export interface BrandLogoProps {
  size?: "sm" | "md" | "lg";
  showSubtitle?: boolean;
  showIfprBadge?: boolean;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = "md",
  showSubtitle = false,
  showIfprBadge = false,
  className = "",
}) => {
  const iconBoxSize =
    size === "sm"
      ? "w-8 h-8 rounded-lg"
      : size === "lg"
      ? "w-11 h-11 rounded-2xl"
      : "w-9 h-9 rounded-xl";

  const pinSize =
    size === "sm" ? "w-4 h-4" : size === "lg" ? "w-6 h-6" : "w-5 h-5";

  const titleSize =
    size === "sm"
      ? "text-base sm:text-lg"
      : size === "lg"
      ? "text-xl sm:text-2xl"
      : "text-lg sm:text-xl";

  return (
    <div className={`inline-flex items-center gap-2 sm:gap-2.5 select-none ${className}`}>
      <div
        className={`relative flex items-center justify-center ${iconBoxSize} bg-[#16845B] text-white shadow-xs shrink-0`}
        aria-hidden="true"
      >
        <MapPin className={`${pinSize} stroke-[2.4]`} />
        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#064E3B] border border-white dark:border-[#111827] flex items-center justify-center">
          <Plus className="w-2.5 h-2.5 text-emerald-300 stroke-[3]" />
        </span>
      </div>

      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1.5 leading-none">
          <span
            className={`${titleSize} font-extrabold tracking-tight text-[#172B2A] dark:text-white`}
          >
            Localiza<span className="text-[#16845B] dark:text-emerald-400">+</span>
          </span>
          {showIfprBadge && (
            <span className="hidden min-[360px]:inline-block px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-[#EBF5F0] dark:bg-emerald-950/60 text-[#064E3B] dark:text-emerald-300 border border-[#16845B]/20">
              IFPR
            </span>
          )}
        </div>
        {showSubtitle && (
          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5">
            Achados e Perdidos • Campus Ivaiporã
          </span>
        )}
      </div>
    </div>
  );
};
