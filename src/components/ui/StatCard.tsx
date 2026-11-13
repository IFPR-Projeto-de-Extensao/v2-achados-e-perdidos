import React from "react";

export type StatIconTone = "emerald" | "amber" | "blue" | "rose" | "slate";

export interface StatCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  iconTone?: StatIconTone;
  onClick?: () => void;
  className?: string;
}

const iconToneClasses: Record<StatIconTone, string> = {
  emerald:
    "bg-[#EBF5F0] dark:bg-emerald-950/50 text-[#16845B] dark:text-emerald-400 border-[#16845B]/20",
  amber:
    "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200/70 dark:border-amber-800/50",
  blue:
    "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 border-sky-200/70 dark:border-sky-800/50",
  rose:
    "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200/70 dark:border-rose-800/50",
  slate:
    "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700",
};

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtitle,
  icon,
  iconTone = "emerald",
  onClick,
  className = "",
}) => {
  const interactiveClasses = onClick
    ? "cursor-pointer hover:border-[#16845B]/40 hover:shadow-[0_6px_20px_rgba(22,132,91,0.08)] active:scale-[0.99]"
    : "";

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-[0_1px_3px_rgba(23,43,42,0.04)] transition-all duration-150 ${interactiveClasses} ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">
          {label}
        </span>
        {icon && (
          <div
            className={`p-2 rounded-xl border shrink-0 ${
              iconToneClasses[iconTone] || iconToneClasses.emerald
            }`}
          >
            {icon}
          </div>
        )}
      </div>
      <div className="mt-2 text-2xl sm:text-3xl font-bold text-[#172B2A] dark:text-white tabular-nums tracking-tight">
        {value}
      </div>
      {subtitle && (
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
          {subtitle}
        </p>
      )}
    </div>
  );
};
