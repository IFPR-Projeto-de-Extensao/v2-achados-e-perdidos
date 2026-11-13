import React from "react";
import { useApp } from "../context/AppContext";
import { CheckCircle2, AlertCircle, Info, AlertTriangle } from "lucide-react";

export const ToastContainer: React.FC = () => {
  const { toasts } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-5 right-5 z-70 flex flex-col gap-2 pointer-events-none max-w-sm w-[calc(100%-2.5rem)] sm:w-full"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`pointer-events-auto p-3.5 sm:p-4 rounded-xl shadow-[0_12px_32px_rgba(23,43,42,0.18)] border flex items-center gap-3 text-xs font-semibold transition-all animate-in fade-in slide-in-from-top duration-200 ${
            toast.type === "success"
              ? "bg-[#16845B] text-white border-[#064E3B]"
              : toast.type === "error"
              ? "bg-rose-600 text-white border-rose-700"
              : toast.type === "warning"
              ? "bg-amber-600 text-white border-amber-700"
              : "bg-[#172B2A] text-white dark:bg-[#111827] border-slate-700"
          }`}
        >
          {toast.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-100 shrink-0" />}
          {toast.type === "error" && <AlertCircle className="w-4 h-4 text-rose-100 shrink-0" />}
          {toast.type === "warning" && <AlertTriangle className="w-4 h-4 text-amber-100 shrink-0" />}
          {toast.type === "info" && <Info className="w-4 h-4 text-sky-300 shrink-0" />}
          <span className="leading-snug">{toast.text}</span>
        </div>
      ))}
    </div>
  );
};
