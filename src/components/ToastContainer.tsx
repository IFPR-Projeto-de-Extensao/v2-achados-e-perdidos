import React from "react";
import { useApp } from "../context/AppContext";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";

export const ToastContainer: React.FC = () => {
  const { toasts } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-5 right-5 z-70 flex flex-col space-y-2 pointer-events-none max-w-sm w-full">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto p-4 rounded-2xl shadow-xl border flex items-center space-x-3 text-xs font-bold transition-all animate-in fade-in slide-in-from-top duration-200 ${
            toast.type === "success"
              ? "bg-[#00843D] text-white border-green-600"
              : toast.type === "error"
              ? "bg-[#C8102E] text-white border-red-700"
              : "bg-neutral-900 text-white dark:bg-neutral-800 border-neutral-700"
          }`}
        >
          {toast.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />}
          {toast.type === "error" && <AlertCircle className="w-5 h-5 text-red-200 shrink-0" />}
          {toast.type === "info" && <Info className="w-5 h-5 text-blue-300 shrink-0" />}
          <span className="leading-snug">{toast.text}</span>
        </div>
      ))}
    </div>
  );
};
