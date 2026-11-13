import React, { useState } from "react";
import { MessageSquarePlus, LifeBuoy, Sparkles, HelpCircle, X } from "lucide-react";
import { useApp } from "../context/AppContext";
import { vibrateClick } from "../lib/utils";
import { ContactSupportModal } from "./ContactSupportModal";

export const QuickSupportButton: React.FC = () => {
  const { t, language } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <>
      {/* Discrete Support Trigger — hidden on mobile to avoid floating button clutter over PWA bottom nav */}
      <aside
        aria-label="Atendimento e Suporte Rápido"
        className="hidden lg:flex fixed bottom-5 right-5 z-30 flex-col items-end"
      >
        <button
          id="btn-quick-support-fab"
          type="button"
          onClick={() => {
            vibrateClick();
            setIsOpen(true);
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className="flex items-center justify-center px-3.5 py-2 rounded-xl bg-white dark:bg-[#111827] hover:bg-[#F8FAFC] dark:hover:bg-slate-800 text-[#172B2A] dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-medium transition-colors cursor-pointer"
          aria-label="Abrir Suporte Rápido e Canal de Dúvidas via Discord"
        >
          <LifeBuoy className="w-4 h-4 text-[#16845B] dark:text-emerald-400" />
          <span className="text-xs font-medium whitespace-nowrap ml-2">
            {language === "pt" ? "Suporte" : "Support"}
          </span>
        </button>
      </aside>

      {/* Modal Integration */}
      <ContactSupportModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};
