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
        className="fixed bottom-[4.5rem] xs:bottom-20 sm:bottom-6 right-3 xs:right-4 sm:right-6 z-30 flex flex-col items-end group"
      >
        {/* Tooltip on desktop hover */}
        {isHovered && (
          <div className="hidden sm:flex items-center space-x-2 mb-2 px-3.5 py-1.5 rounded-2xl bg-neutral-900/95 dark:bg-neutral-800 text-white text-xs font-semibold shadow-xl border border-neutral-700/60 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150">
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
          className="flex items-center space-x-1.5 xs:space-x-2 px-3 py-2 xs:px-3.5 xs:py-2.5 sm:px-4 sm:py-3.5 rounded-full bg-gradient-to-r from-[#00843D] to-[#006830] hover:from-[#006830] hover:to-[#004d24] text-white shadow-lg hover:shadow-2xl hover:scale-105 active:scale-95 transition-all duration-200 border-2 border-white/20 focus:outline-none focus:ring-4 focus:ring-[#00843D]/40 cursor-pointer"
          aria-label="Abrir Suporte Rápido e Canal de Dúvidas via Discord"
        >
          <div className="relative">
            <LifeBuoy className="w-4 h-4 xs:w-5 xs:h-5 animate-spin-slow" />
            <span className="absolute -top-1 -right-1 flex h-2 w-2 xs:h-2.5 xs:w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 xs:h-2.5 xs:w-2.5 bg-emerald-400"></span>
            </span>
          </div>
          <span className="text-[11px] xs:text-xs sm:text-sm font-extrabold tracking-wide whitespace-nowrap">
            {language === "pt" ? (
              <>
                <span className="xs:hidden">Suporte</span>
                <span className="hidden xs:inline">Suporte Rápido</span>
              </>
            ) : (
              <>
                <span className="xs:hidden">Support</span>
                <span className="hidden xs:inline">Quick Support</span>
              </>
            )}
          </span>
        </button>
      </aside>

      {/* Modal Integration */}
      <ContactSupportModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};
