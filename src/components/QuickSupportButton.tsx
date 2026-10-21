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
      {/* Floating Action Button (FAB) positioned safely above mobile nav */}
      <aside
        aria-label="Atendimento e Suporte Rápido"
        className="fixed bottom-16 sm:bottom-6 right-3 sm:right-6 z-30 flex flex-col items-end group"
      >
        {/* Tooltip on desktop hover */}
        {isHovered && (
          <div className="hidden sm:flex items-center space-x-2 mb-2 px-3 py-1.5 rounded-xl bg-neutral-900/95 dark:bg-neutral-800 text-white text-xs font-semibold shadow-xl border border-neutral-700/60 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>{t("contactSupport", "Dúvidas? Envie direto ao Discord do IFPR")}</span>
          </div>
        )}

        <button
          id="btn-quick-support-fab"
          type="button"
          onClick={() => {
            vibrateClick();
            setIsOpen(true);
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className="flex items-center justify-center w-11 h-11 sm:w-auto sm:h-auto sm:px-4 sm:py-2.5 rounded-full bg-[#00843D] hover:bg-[#006830] text-white shadow-[0_4px_16px_rgba(0,132,61,0.3)] hover:scale-105 active:scale-95 transition-all duration-200 border border-white/20 focus:outline-none focus:ring-2 focus:ring-[#00843D]/40 cursor-pointer"
          aria-label="Abrir Suporte Rápido e Canal de Dúvidas via Discord"
        >
          <div className="relative">
            <LifeBuoy className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
            </span>
          </div>
          <span className="hidden sm:inline text-xs font-bold tracking-wide whitespace-nowrap ml-2">
            {language === "pt" ? "Suporte Rápido" : "Quick Support"}
          </span>
        </button>
      </aside>

      {/* Modal Integration */}
      <ContactSupportModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};
