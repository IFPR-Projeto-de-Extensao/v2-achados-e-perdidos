import React from "react";
import { ShieldCheck, MapPin, Phone, Mail, Globe, Heart } from "lucide-react";

export const Footer: React.FC = () => {
  return (
    <footer className="bg-white dark:bg-[#121212] border-t border-neutral-200 dark:border-neutral-800 pt-12 pb-8 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 border-b border-neutral-200 dark:border-neutral-800">
          {/* Col 1: Brand & Info */}
          <div className="space-y-4 md:col-span-1">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-[#00843D] text-white font-bold flex items-center justify-center text-sm shadow-xs">
                IF
              </div>
              <span className="font-bold text-lg text-neutral-900 dark:text-white">
                IFPR Achados & Perdidos
              </span>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              Plataforma institucional do Instituto Federal do Paraná (IFPR) - Campus Ivaiporã para localização, cadastro e devolução transparente de bens e objetos.
            </p>
            <div className="flex items-center space-x-2 text-xs text-[#00843D] dark:text-green-400 font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>Ambiente Autêntico & Seguro</span>
            </div>
          </div>

          {/* Col 2: Locais do Campus */}
          <div className="space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-neutral-900 dark:text-white">
              Pontos de Entrega IFPR
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
              Links Rápidos
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
                  Regulamento de Bens Esquecidos
                </a>
              </li>
              <li>
                <a href="#duvidas" className="hover:text-[#00843D] transition-colors">
                  Perguntas Frequentes (FAQ)
                </a>
              </li>
              <li>
                <a href="#qrcode" className="hover:text-[#00843D] transition-colors">
                  Como funciona a entrega por QR Code
                </a>
              </li>
            </ul>
          </div>

          {/* Col 4: Contato & Suporte */}
          <div className="space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-neutral-900 dark:text-white">
              Contato do Campus
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
                  Horário de Atendimento: 07h30 às 21h30
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-neutral-500 dark:text-neutral-500 gap-4">
          <p>
            © {new Date().getFullYear()} Instituto Federal do Paraná (IFPR) - Campus Ivaiporã. Todos os direitos reservados.
          </p>
          <div className="flex items-center space-x-1">
            <span>Desenvolvido com</span>
            <Heart className="w-3.5 h-3.5 text-[#C8102E] fill-current" />
            <span>para a comunidade acadêmica do IFPR Campus Ivaiporã</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
