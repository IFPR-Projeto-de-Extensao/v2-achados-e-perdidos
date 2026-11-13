import React from "react";

export type ButtonVariant = "primary" | "outline" | "secondary" | "ghost" | "danger" | "dark";
export type ButtonSize = "sm" | "md" | "lg";

export interface UIButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[#16845B] hover:bg-[#064E3B] text-white border border-transparent shadow-xs",
  outline:
    "bg-white dark:bg-[#111827] hover:bg-[#EBF5F0] dark:hover:bg-[#16845B]/20 text-[#16845B] dark:text-emerald-400 border border-[#16845B] dark:border-emerald-500/60 shadow-2xs",
  dark:
    "bg-[#064E3B] hover:bg-[#053e2f] text-white border border-transparent shadow-xs",
  secondary:
    "bg-white dark:bg-slate-800 hover:bg-[#F8FAFC] dark:hover:bg-slate-700 text-[#172B2A] dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-2xs",
  ghost:
    "bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-transparent",
  danger:
    "bg-red-600 hover:bg-red-700 text-white border border-transparent shadow-xs",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs rounded-lg gap-1.5",
  md: "px-4 py-2.5 text-xs sm:text-sm rounded-xl gap-2",
  lg: "px-5 py-3 text-sm rounded-xl gap-2",
};

export const UIButton: React.FC<UIButtonProps> = ({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
  type = "button",
  children,
  ...props
}) => {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center font-semibold whitespace-nowrap shrink-0 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#16845B]/50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98] ${
        fullWidth ? "w-full" : ""
      } ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
