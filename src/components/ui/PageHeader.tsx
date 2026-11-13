import React from "react";

export interface PageHeaderProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  eyebrow,
  title,
  description,
  icon,
  badge,
  actions,
  className = "",
}) => {
  return (
    <div
      className={`bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-[0_1px_3px_rgba(23,43,42,0.04)] flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${className}`}
    >
      <div className="flex items-start gap-3.5 min-w-0">
        {icon && (
          <div className="p-2.5 rounded-xl bg-[#EBF5F0] dark:bg-[#16845B]/20 text-[#16845B] dark:text-emerald-400 border border-[#16845B]/15 shrink-0 mt-0.5">
            {icon}
          </div>
        )}
        <div className="space-y-1 min-w-0">
          {eyebrow && (
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#16845B] dark:text-emerald-400">
              {eyebrow}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold text-[#172B2A] dark:text-white tracking-tight">
              {title}
            </h1>
            {badge}
          </div>
          {description && (
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-3xl">
              {description}
            </p>
          )}
        </div>
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
};
