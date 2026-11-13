import React, { useState } from "react";
import {
  ShieldCheck,
  MapPin,
  Phone,
  Mail,
  Globe,
  Heart,
  Languages,
  Check,
  Smartphone,
  MessageSquarePlus,
  LifeBuoy,
  FileText,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { Link } from "../context/RouterContext";
import { SupportedLanguage } from "../lib/i18n";
import { vibrateClick } from "../lib/utils";
import { usePWA } from "../hooks/usePWA";
import { SupportCategory } from "../types";
import { ContactSupportModal } from "./ContactSupportModal";
import { OFFICIAL_DISCORD_INVITE_URL } from "../lib/constants";
import { BrandLogo, SubtlePanel, UIBadge } from "./ui";

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
    <footer className="bg-white dark:bg-[#111827] border-t border-slate-200/90 dark:border-slate-800 pt-10 pb-8 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Language / i18n Selector for Exchange Students */}
        <SubtlePanel
          id="footer-i18n-selector"
          padding="sm"
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#EBF5F0] dark:bg-[#16845B]/20 text-[#16845B] dark:text-emerald-400 border border-[#16845B]/15 shrink-0">
              <Languages className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[#172B2A] dark:text-white flex items-center gap-2">
                <span>{t("languageSelect", "Idioma / Language")}</span>
                <UIBadge tone="emerald">i18n</UIBadge>
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {t(
                  "exchangeStudentNotice",
                  "Estudante intercambista? Alterne o idioma para Inglês abaixo."
                )}
              </p>
            </div>
          </div>

          {/* Toggle Buttons */}
          <div
            className="flex items-center gap-2 w-full sm:w-auto"
            role="group"
            aria-label="Seletor de Idioma da Interface"
          >
            <button
              id="lang-btn-pt"
              type="button"
              onClick={() => handleLanguageChange("pt")}
              className={`flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 border cursor-pointer ${
                language === "pt"
                  ? "bg-[#16845B] text-white border-[#16845B] shadow-2xs"
                  : "bg-white dark:bg-[#111827] text-[#172B2A] dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300"
              }`}
              aria-pressed={language === "pt"}
            >
              <span className="text-sm">🇧🇷</span>
              <span>Português (BR)</span>
              {language === "pt" && <Check className="w-3.5 h-3.5" />}
            </button>

            <button
              id="lang-btn-en"
              type="button"
              onClick={() => handleLanguageChange("en")}
              className={`flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 border cursor-pointer ${
                language === "en"
                  ? "bg-[#16845B] text-white border-[#16845B] shadow-2xs"
                  : "bg-white dark:bg-[#111827] text-[#172B2A] dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300"
              }`}
              aria-pressed={language === "en"}
            >
              <span className="text-sm">🇺🇸</span>
              <span>English (US)</span>
              {language === "en" && <Check className="w-3.5 h-3.5" />}
            </button>
          </div>
        </SubtlePanel>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-8 border-b border-slate-200/80 dark:border-slate-800">
          {/* Col 1: Brand & Info */}
          <div className="space-y-3.5 md:col-span-1">
            <Link to="/" className="inline-flex items-center">
              <BrandLogo size="md" showIfprBadge />
            </Link>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {t(
                "footerCampusDesc",
                "Plataforma institucional do Instituto Federal do Paraná (IFPR) - Campus Ivaiporã para localização, cadastro e devolução transparente de bens e objetos."
              )}
            </p>
            <div className="flex items-center gap-2 text-xs text-[#16845B] dark:text-emerald-400 font-semibold">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>
                {language === "pt"
                  ? "Ambiente Autêntico & Seguro"
                  : "Authentic & Secure Environment"}
              </span>
            </div>
          </div>

          {/* Col 2: Locais do Campus */}
          <div className="space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-[#172B2A] dark:text-white">
              {t("footerDropPoints", "Pontos de Entrega IFPR")}
            </h4>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <li className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#16845B] dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>Portaria Principal &amp; Guarita Central</span>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#16845B] dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>Biblioteca Campus Ivaiporã</span>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#16845B] dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>Secretaria Acadêmica (SEBAC / Bloco ADM)</span>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#16845B] dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>Coordenação de Educação Física (Ginásio)</span>
              </li>
            </ul>
          </div>

          {/* Col 3: Links Úteis */}
          <div className="space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-[#172B2A] dark:text-white">
              {t("footerQuickLinks", "Links Rápidos")}
            </h4>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <li>
                <button
                  type="button"
                  onClick={() => promptInstall()}
                  className="hover:text-[#16845B] dark:hover:text-emerald-400 transition-colors flex items-center gap-1.5 text-left font-medium cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5 text-[#16845B] dark:text-emerald-400 shrink-0" />
                  <span>
                    {isInstalled
                      ? "App Localiza+ Instalado (PWA)"
                      : "Instalar App Localiza+ (PWA)"}
                  </span>
                </button>
              </li>
              <li>
                <Link
                  to="/suporte"
                  className="hover:text-[#064E3B] dark:hover:text-emerald-300 transition-colors flex items-center gap-1.5 text-left font-medium text-[#16845B] dark:text-emerald-400"
                >
                  <LifeBuoy className="w-3.5 h-3.5 shrink-0" />
                  <span>{t("contactSupport", "Central de Suporte & Dúvidas")}</span>
                </Link>
              </li>
              <li>
                <a
                  href="https://ivaipora.ifpr.edu.br"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#16845B] dark:hover:text-emerald-400 transition-colors flex items-center gap-1.5"
                >
                  <Globe className="w-3.5 h-3.5 shrink-0" />
                  <span>Portal IFPR Campus Ivaiporã</span>
                </a>
              </li>
              <li>
                <a
                  href={OFFICIAL_DISCORD_INVITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#5865F2] dark:hover:text-[#7983f5] transition-colors flex items-center gap-1.5 text-left font-medium"
                >
                  <MessageSquarePlus className="w-3.5 h-3.5 text-[#5865F2] shrink-0" />
                  <span>
                    {language === "pt"
                      ? "Discord Oficial do IFPR"
                      : "Official IFPR Discord"}
                  </span>
                </a>
              </li>
              <li>
                <Link
                  to="/politica-de-privacidade"
                  className="text-[#16845B] dark:text-emerald-400 font-semibold hover:underline flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {language === "pt"
                      ? "Política de Privacidade"
                      : "Privacy Policy"}
                  </span>
                </Link>
              </li>
              <li>
                <Link
                  to="/termos-de-uso"
                  className="text-slate-600 dark:text-slate-400 hover:text-[#16845B] dark:hover:text-emerald-400 transition-colors flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  <span>{language === "pt" ? "Termos de Uso" : "Terms of Use"}</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 4: Contato & Suporte */}
          <div className="space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-[#172B2A] dark:text-white">
              {t("footerContact", "Contato do Campus")}
            </h4>
            <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-400">
              <li className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-[#16845B] dark:text-emerald-400 shrink-0" />
                <span>(43) 3126-9400</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-[#16845B] dark:text-emerald-400 shrink-0" />
                <a
                  href="mailto:localizamais0@gmail.com"
                  className="hover:underline hover:text-[#16845B] dark:hover:text-emerald-400 text-left transition-colors font-medium"
                >
                  localizamais0@gmail.com
                </a>
              </li>
              <li className="pt-1">
                <Link
                  to="/suporte/feedback"
                  className="w-full py-2.5 px-3.5 rounded-xl bg-[#16845B] hover:bg-[#064E3B] text-white text-xs font-semibold transition-all shadow-2xs flex items-center justify-center gap-2"
                >
                  <MessageSquarePlus className="w-4 h-4 shrink-0" />
                  <span>{t("contactSupportBtn", "Enviar Feedback ou Relatar Bug")}</span>
                </Link>
              </li>
              <li className="pt-0.5">
                <span className="inline-block px-2.5 py-1 rounded-lg bg-[#F8FAFC] dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium text-[11px] border border-slate-200 dark:border-slate-700">
                  {language === "pt"
                    ? "Horário: 07h30 às 21h30"
                    : "Hours: 7:30 AM to 9:30 PM"}
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom copyright and legal */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 dark:text-slate-400 gap-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p>
              © {new Date().getFullYear()}{" "}
              {t(
                "footerRights",
                "Instituto Federal do Paraná (IFPR) - Campus Ivaiporã. Todos os direitos reservados."
              )}
            </p>
            <Link
              to="/termos-de-uso"
              className="text-[#16845B] dark:text-emerald-400 hover:underline font-semibold"
            >
              Termos de Uso
            </Link>
            <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">·</span>
            <Link
              to="/politica-de-privacidade"
              className="text-[#16845B] dark:text-emerald-400 hover:underline font-semibold"
            >
              Política de Privacidade
            </Link>
          </div>
          <div className="flex items-center gap-1">
            <span>{language === "pt" ? "Desenvolvido com" : "Built with"}</span>
            <Heart className="w-3.5 h-3.5 text-rose-600 fill-current" />
            <span>
              {language === "pt"
                ? "para a comunidade acadêmica do IFPR Campus Ivaiporã"
                : "for the IFPR Ivaiporã Campus community"}
            </span>
          </div>
        </div>
      </div>

      {/* Contact Support & Feedback Modal */}
      <ContactSupportModal
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
        initialCategory={modalCategory}
      />
    </footer>
  );
};
