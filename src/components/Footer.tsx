import React from "react";
import { ShieldCheck, MapPin, Phone, Mail, Globe, Heart, Languages, Check } from "lucide-react";
import { useApp } from "../context/AppContext";
import { SupportedLanguage } from "../lib/i18n";
import { vibrateClick } from "../lib/utils";

export const Footer: React.FC = () => {
  const { language, setLanguage, t } = useApp();

  const handleLanguageChange = (lang: SupportedLanguage) => {
    vibrateClick();
    setLanguage(lang);
  };

  return (
    <footer className="bg-white dark:bg-[#121212] border-t border-neutral-200 dark:border-neutral-800 pt-12 pb-8 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Language / i18n Selector for Exchange Students */}
        <div id="footer-i18n-selector" className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 border border-[#00843D]/20">
              <Languages className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                <span>{t("languageSelect", "Idioma / Language")}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-[#00843D]/10 text-[#00843D] dark:text-green-400">
                  i18n
                </span>
              </h4>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                {t("exchangeStudentNotice", "Estudante intercambista? Alterne o idioma para Inglês abaixo.")}
              </p>
            </div>
          </div>

          {/* Toggle Buttons */}
          <div className="flex items-center space-x-2 w-full sm:w-auto" role="group" aria-label="Seletor de Idioma da Interface">
            <button
              id="lang-btn-pt"
              onClick={() => handleLanguageChange("pt")}
              className={`flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 border ${
                language === "pt"
                  ? "bg-[#00843D] text-white border-[#00843D] shadow-xs"
                  : "bg-white dark:bg-[#1E1E1E] text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800 hover:border-neutral-300"
              }`}
              aria-pressed={language === "pt"}
            >
              <span className="text-sm">🇧🇷</span>
              <span>Português (BR)</span>
              {language === "pt" && <Check className="w-3.5 h-3.5" />}
            </button>

            <button
              id="lang-btn-en"
              onClick={() => handleLanguageChange("en")}
              className={`flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 border ${
                language === "en"
                  ? "bg-[#00843D] text-white border-[#00843D] shadow-xs"
                  : "bg-white dark:bg-[#1E1E1E] text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800 hover:border-neutral-300"
              }`}
              aria-pressed={language === "en"}
            >
              <span className="text-sm">🇺🇸</span>
              <span>English (US)</span>
              {language === "en" && <Check className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 border-b border-neutral-200 dark:border-neutral-800">
          {/* Col 1: Brand & Info */}
          <div className="space-y-4 md:col-span-1">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-[#00843D] text-white font-bold flex items-center justify-center text-sm shadow-xs">
                IF
              </div>
              <span className="font-bold text-lg text-neutral-900 dark:text-white">
                {t("appName", "IFPR Achados & Perdidos")}
              </span>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              {t("footerCampusDesc", "Plataforma institucional do Instituto Federal do Paraná (IFPR) - Campus Ivaiporã para localização, cadastro e devolução transparente de bens e objetos.")}
            </p>
            <div className="flex items-center space-x-2 text-xs text-[#00843D] dark:text-green-400 font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>{language === "pt" ? "Ambiente Autêntico & Seguro" : "Authentic & Secure Environment"}</span>
            </div>
          </div>

          {/* Col 2: Locais do Campus */}
          <div className="space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-neutral-900 dark:text-white">
              {t("footerDropPoints", "Pontos de Entrega IFPR")}
            </h4>
            <ul className="space-y-2 text-xs text-neutral-600 dark:text-neutral-400">
              <li className="flex items-start space-x-2">
                <MapPin className="w-3.5 h-3.5 text-[#00843D] shrink-0 mt-0.5" />
                <span>Portaria Principal & Guarita Central</span>
              </li>
              <li className="flex items-start space-x-2">
                <MapPin className="w-3.5 h-3.5 text-[#00843D] shrink-0 mt-0.5" />
                <span>Biblioteca Campus Ivaiporã</span>
              </li>
              <li className="flex items-start space-x-2">
                <MapPin className="w-3.5 h-3.5 text-[#00843D] shrink-0 mt-0.5" />
                <span>Secretaria Acadêmica (SEBAC / Bloco ADM)</span>
              </li>
              <li className="flex items-start space-x-2">
                <MapPin className="w-3.5 h-3.5 text-[#00843D] shrink-0 mt-0.5" />
                <span>Coordenação de Educação Física (Ginásio)</span>
              </li>
            </ul>
          </div>

          {/* Col 3: Links Úteis */}
          <div className="space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-neutral-900 dark:text-white">
              {t("footerQuickLinks", "Links Rápidos")}
            </h4>
            <ul className="space-y-2 text-xs text-neutral-600 dark:text-neutral-400">
              <li>
                <a href="https://ivaipora.ifpr.edu.br" target="_blank" rel="noopener noreferrer" className="hover:text-[#00843D] transition-colors flex items-center space-x-1">
                  <Globe className="w-3.5 h-3.5" />
                  <span>Portal IFPR Campus Ivaiporã</span>
                </a>
              </li>
              <li>
                <a href="#diretrizes" className="hover:text-[#00843D] transition-colors">
                  {language === "pt" ? "Regulamento de Bens Esquecidos" : "Lost Belongings Regulations"}
                </a>
              </li>
              <li>
                <a href="#duvidas" className="hover:text-[#00843D] transition-colors">
                  {language === "pt" ? "Perguntas Frequentes (FAQ)" : "Frequently Asked Questions (FAQ)"}
                </a>
              </li>
              <li>
                <a href="#qrcode" className="hover:text-[#00843D] transition-colors">
                  {language === "pt" ? "Como funciona a entrega por QR Code" : "How QR Code Drop-off Works"}
                </a>
              </li>
            </ul>
          </div>

          {/* Col 4: Contato & Suporte */}
          <div className="space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-neutral-900 dark:text-white">
              {t("footerContact", "Contato do Campus")}
            </h4>
            <ul className="space-y-2 text-xs text-neutral-600 dark:text-neutral-400">
              <li className="flex items-center space-x-2">
                <Phone className="w-3.5 h-3.5 text-[#00843D]" />
                <span>(43) 3126-9400</span>
              </li>
              <li className="flex items-center space-x-2">
                <Mail className="w-3.5 h-3.5 text-[#00843D]" />
                <span>achados.ivaipora@ifpr.edu.br</span>
              </li>
              <li className="pt-2">
                <span className="inline-block px-2.5 py-1 rounded-md bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-bold text-[11px]">
                  {language === "pt" ? "Horário de Atendimento: 07h30 às 21h30" : "Service Hours: 7:30 AM to 9:30 PM"}
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-neutral-500 dark:text-neutral-500 gap-4">
          <p>
            © {new Date().getFullYear()} {t("footerRights", "Instituto Federal do Paraná (IFPR) - Campus Ivaiporã. Todos os direitos reservados.")}
          </p>
          <div className="flex items-center space-x-1">
            <span>{language === "pt" ? "Desenvolvido com" : "Built with"}</span>
            <Heart className="w-3.5 h-3.5 text-[#C8102E] fill-current" />
            <span>{language === "pt" ? "para a comunidade acadêmica do IFPR Campus Ivaiporã" : "for the IFPR Ivaiporã Campus community"}</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

