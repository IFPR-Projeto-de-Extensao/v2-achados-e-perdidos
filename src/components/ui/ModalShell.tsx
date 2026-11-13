import React from "react";

interface ModalShellProps {
  isOpen: boolean;
  onClose?: () => void;
  maxWidthClass?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  children: React.ReactNode;
  zIndexClass?: string;
}

export const ModalShell: React.FC<ModalShellProps> = ({
  isOpen,
  onClose,
  maxWidthClass = "max-w-lg",
  ariaLabel,
  ariaLabelledBy,
  zIndexClass = "z-50",
  children,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      onClick={(e) => {
        if (onClose && e.target === e.currentTarget) {
          onClose();
        }
      }}
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center p-3 sm:p-4 bg-[#172B2A]/45 dark:bg-black/75 modal-backdrop-smooth animate-in fade-in duration-150 overflow-y-auto`}
    >
      <div
        className={`relative w-full ${maxWidthClass} bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-[0_20px_60px_rgba(6,78,59,0.16)] dark:shadow-[0_24px_64px_rgba(0,0,0,0.65)] overflow-hidden text-[#172B2A] dark:text-slate-100 my-auto`}
      >
        {children}
      </div>
    </div>
  );
};
