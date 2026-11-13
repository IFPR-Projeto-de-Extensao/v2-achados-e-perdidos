import React from "react";

export type BadgeTone =
  | "emerald"
  | "darkEmerald"
  | "rose"
  | "amber"
  | "blue"
  | "slate"
  | "purple"
  | "green"
  | "red";

export interface UIBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const toneStyles: Record<BadgeTone, string> = {
  emerald:
    "bg-[#EBF5F0] dark:bg-emerald-950/50 text-[#064E3B] dark:text-emerald-300 border-[#16845B]/25 dark:border-emerald-800/60",
  darkEmerald:
    "bg-[#064E3B] dark:bg-emerald-900 text-white dark:text-emerald-100 border-[#064E3B] dark:border-emerald-700",
  green:
    "bg-[#EBF5F0] dark:bg-emerald-950/50 text-[#064E3B] dark:text-emerald-300 border-[#16845B]/25 dark:border-emerald-800/60",
  rose:
    "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200/80 dark:border-rose-800/60",
  red:
    "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200/80 dark:border-rose-800/60",
  amber:
    "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/60",
  blue:
    "bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 border-sky-200/80 dark:border-sky-800/60",
  purple:
    "bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border-purple-200/80 dark:border-purple-800/60",
  slate:
    "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700",
};

export const UIBadge: React.FC<UIBadgeProps> = ({
  tone = "slate",
  className = "",
  children,
  ...props
}) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${
        toneStyles[tone] || toneStyles.slate
      } ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
