import React from "react";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = "",
}) => {
  return (
    <div
      className={`bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-8 sm:p-10 text-center flex flex-col items-center justify-center shadow-[0_1px_3px_rgba(23,43,42,0.04)] ${className}`}
    >
      {icon && (
        <div className="w-12 h-12 rounded-2xl bg-[#EBF5F0] dark:bg-emerald-950/50 text-[#16845B] dark:text-emerald-400 border border-[#16845B]/15 flex items-center justify-center mb-3.5">
          {icon}
        </div>
      )}
      <h3 className="text-sm sm:text-base font-bold text-[#172B2A] dark:text-white tracking-tight">
        {title}
      </h3>
      {description && (
        <p className="mt-1.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};
