import React from "react";

export interface UIFieldGroupProps {
  label?: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

export const UIFieldGroup: React.FC<UIFieldGroupProps> = ({
  label,
  htmlFor,
  required,
  hint,
  error,
  className = "",
  children,
}) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="block text-xs font-semibold text-[#172B2A] dark:text-slate-200 tracking-tight"
        >
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p role="alert" className="text-[11px] font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
};

export interface UIInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
  hasError?: boolean;
}

export const UIInput = React.forwardRef<HTMLInputElement, UIInputProps>(
  ({ leftIcon, rightElement, hasError = false, className = "", ...props }, ref) => {
    return (
      <div className="relative flex items-center w-full">
        {leftIcon && (
          <div className="absolute left-3.5 text-slate-400 dark:text-slate-500 pointer-events-none flex items-center">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          className={`w-full rounded-xl bg-[#F8FAFC] dark:bg-slate-800/80 border ${
            hasError
              ? "border-red-400 dark:border-red-500/70 focus:border-red-500 focus:ring-red-500/20"
              : "border-slate-200 dark:border-slate-700 focus:border-[#16845B] dark:focus:border-[#16845B] focus:ring-[#16845B]/20"
          } text-xs sm:text-sm text-[#172B2A] dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 py-2.5 ${
            leftIcon ? "pl-10" : "pl-3.5"
          } ${
            rightElement ? "pr-10" : "pr-3.5"
          } focus:outline-none focus:ring-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
          {...props}
        />
        {rightElement && (
          <div className="absolute right-3 flex items-center text-slate-400 dark:text-slate-500">
            {rightElement}
          </div>
        )}
      </div>
    );
  }
);

UIInput.displayName = "UIInput";

export interface UISelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  leftIcon?: React.ReactNode;
  hasError?: boolean;
}

export const UISelect = React.forwardRef<HTMLSelectElement, UISelectProps>(
  ({ leftIcon, hasError = false, className = "", children, ...props }, ref) => {
    return (
      <div className="relative flex items-center w-full">
        {leftIcon && (
          <div className="absolute left-3.5 text-slate-400 dark:text-slate-500 pointer-events-none flex items-center">
            {leftIcon}
          </div>
        )}
        <select
          ref={ref}
          className={`w-full rounded-xl bg-[#F8FAFC] dark:bg-slate-800/80 border ${
            hasError
              ? "border-red-400 dark:border-red-500/70 focus:border-red-500 focus:ring-red-500/20"
              : "border-slate-200 dark:border-slate-700 focus:border-[#16845B] dark:focus:border-[#16845B] focus:ring-[#16845B]/20"
          } text-xs sm:text-sm text-[#172B2A] dark:text-slate-100 py-2.5 ${
            leftIcon ? "pl-10" : "pl-3.5"
          } pr-8 focus:outline-none focus:ring-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
          {...props}
        >
          {children}
        </select>
      </div>
    );
  }
);

UISelect.displayName = "UISelect";

export interface UITextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export const UITextarea = React.forwardRef<HTMLTextAreaElement, UITextareaProps>(
  ({ hasError = false, className = "", ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`w-full rounded-xl bg-[#F8FAFC] dark:bg-slate-800/80 border ${
          hasError
            ? "border-red-400 dark:border-red-500/70 focus:border-red-500 focus:ring-red-500/20"
            : "border-slate-200 dark:border-slate-700 focus:border-[#16845B] dark:focus:border-[#16845B] focus:ring-[#16845B]/20"
        } text-xs sm:text-sm text-[#172B2A] dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-3.5 focus:outline-none focus:ring-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
        {...props}
      />
    );
  }
);

UITextarea.displayName = "UITextarea";
