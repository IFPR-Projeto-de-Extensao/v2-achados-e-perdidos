import React, { useState } from "react";
import { Check, Smartphone } from "lucide-react";
import { useApp } from "../context/AppContext";
import { Link } from "../context/RouterContext";
import { SupportedLanguage } from "../lib/i18n";
import { vibrateClick } from "../lib/utils";
import { usePWA } from "../hooks/usePWA";
import { SupportCategory } from "../types";
import { ContactSupportModal } from "./ContactSupportModal";
import { OFFICIAL_DISCORD_INVITE_URL } from "../lib/constants";

export const Footer: React.FC = () => {
  const { language, setLanguage, t } = useApp();
  const { isInstalled, promptInstall } = usePWA();
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [modalCategory] = useState<SupportCategory>("FEEDBACK");

  const handleLanguageChange = (lang: SupportedLanguage) => {
    vibrateClick();
    setLanguage(lang);
  };

  return (
    <footer className="bg-white dark:bg-[#0B0F17] border-t border-slate-200/80 dark:border-slate-800/80 py-6 transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-5">
        {/* Top Row: Institutional Identity + Compact Language Switcher */}
        <div
          id="footer-i18n-selector"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800/80"
        >
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-[#172B2A] dark:text-white">
              IFPR Campus Ivaiporã · Central de Achados e Perdidos
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Portaria Principal e SEPAE · Atendimento de segunda a sexta, das 07h às 22h · (43) 3126-9400
            </p>
          </div>

          <div
            className="flex items-center gap-1.5 shrink-0"
            role="group"
            aria-label="Seletor de Idioma da Interface"
          >
            <button
              id="lang-btn-pt"
              type="button"
              onClick={() => handleLanguageChange("pt")}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 border cursor-pointer ${
                language === "pt"
                  ? "bg-[#16845B] text-white border-[#16845B]"
                  : "bg-white dark:bg-[#111827] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
              }`}
              aria-pressed={language === "pt"}
            >
              <span>PT-BR</span>
              {language === "pt" && <Check className="w-3.5 h-3.5" />}
            </button>

            <button
              id="lang-btn-en"
              type="button"
              onClick={() => handleLanguageChange("en")}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 border cursor-pointer ${
                language === "en"
                  ? "bg-[#16845B] text-white border-[#16845B]"
                  : "bg-white dark:bg-[#111827] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
              }`}
              aria-pressed={language === "en"}
            >
              <span>EN-US</span>
              {language === "en" && <Check className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Bottom Row: Essential Links & Copyright */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {!isInstalled && (
              <button
                type="button"
                onClick={() => promptInstall()}
                className="text-[#16845B] dark:text-emerald-400 font-medium hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Instalar App (PWA)</span>
              </button>
            )}
            <Link
              to="/suporte"
              className="hover:text-[#172B2A] dark:hover:text-white transition-colors"
            >
              {t("contactSupport", "Suporte")}
            </Link>
            <Link
              to="/suporte/feedback"
              className="hover:text-[#172B2A] dark:hover:text-white transition-colors"
            >
              Feedback / Relatar Bug
            </Link>
            <a
              href={OFFICIAL_DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#172B2A] dark:hover:text-white transition-colors"
            >
              Discord IFPR
            </a>
            <Link
              to="/termos-de-uso"
              className="hover:text-[#172B2A] dark:hover:text-white transition-colors"
            >
              Termos de Uso
            </Link>
            <Link
              to="/politica-de-privacidade"
              className="hover:text-[#172B2A] dark:hover:text-white transition-colors"
            >
              Privacidade
            </Link>
          </div>

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            © {new Date().getFullYear()} IFPR Campus Ivaiporã
          </p>
        </div>
      </div>

      <ContactSupportModal
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
        initialCategory={modalCategory}
      />
    </footer>
  );
};
