import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  Search,
  PlusCircle,
  QrCode,
  MapPin,
  HeartHandshake,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  X,
  Compass,
  CheckCircle2,
  Filter,
  Award,
} from "lucide-react";
import { vibrateClick, vibrateSuccess } from "../lib/utils";

interface TourStep {
  title: string;
  subtitle: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  badgeText: string;
  tips: string[];
}

const TOUR_STEPS: TourStep[] = [
  {
    title: "Bem-vindo ao IFPR Achados e Perdidos",
    subtitle: "Plataforma Oficial do Campus Ivaiporã",
    description:
      "Nosso sistema conecta alunos, professores e servidores para registrar, localizar e devolver pertences com total transparência, segurança e rapidez em todo o campus.",
    icon: Compass,
    accentColor: "from-emerald-500 to-[#00843D]",
    badgeText: "Passo 1 de 5 • Visão Geral",
    tips: [
      "Ambiente seguro integrado com autenticação institucional.",
      "Acompanhamento em tempo real de cada ocorrência.",
      "Acesso completo a histórico e termos de devolução.",
    ],
  },
  {
    title: "Busca Inteligente por IA Gemini",
    subtitle: "Encontre itens usando linguagem natural",
    description:
      "Esqueceu algo mas não lembra o nome exato? Basta descrever como falaria com um amigo (ex: 'chaveiro azul esquecido perto do refeitório' ou 'garrafa térmica preta na quadra'). O modelo Gemini encontra as melhores correspondências!",
    icon: Sparkles,
    accentColor: "from-amber-500 to-orange-500",
    badgeText: "Passo 2 de 5 • IA no Campus",
    tips: [
      "Compare fotos e características automaticamente.",
      "Veja a porcentagem de relevância calculada por IA.",
      "Clique nos exemplos prontos na página inicial para testar.",
    ],
  },
  {
    title: "Como Cadastrar um Item",
    subtitle: "Registro rápido com foto e localização",
    description:
      "Perdeu ou encontrou algo? Clique no botão 'Registrar Objeto', tire uma foto com a câmera ou faça upload, selecione o bloco do campus e informe as características. Uma etiqueta QR única é gerada na hora!",
    icon: PlusCircle,
    accentColor: "from-blue-500 to-indigo-600",
    badgeText: "Passo 3 de 5 • Cadastro Ágil",
    tips: [
      "Gera código QR para anexar fisicamente ao objeto guardado.",
      "Permite adicionar pergunta secreta para verificar o dono legítimo.",
      "Notifica instantaneamente a comunidade via push FCM.",
    ],
  },
  {
    title: "Filtros Avançados por Bloco & Data",
    subtitle: "Navegação precisa pelo Campus Ivaiporã",
    description:
      "Na aba 'Objetos Perdidos', utilize o painel de filtros avançados para selecionar o bloco específico (Didático, Labs, Biblioteca, Ginásio, etc.), o período de tempo (Hoje, 7 dias, Semestre) e categorias com sincronização em tempo real.",
    icon: Filter,
    accentColor: "from-purple-500 to-pink-500",
    badgeText: "Passo 4 de 5 • Filtros Avançados",
    tips: [
      "Filtre simultaneamente por cor, categoria e bloco do IFPR.",
      "Alterne entre visualização em Cards ou Lista adaptativa.",
      "Histórico de buscas recentes salvo para facilitar seu dia.",
    ],
  },
  {
    title: "Pontos de Entrega, Protocolos & Badges",
    subtitle: "Devolução segura e reconhecimento à honestidade",
    description:
      "Ao encontrar um item, entregue-o na SEBAC (Secretaria Acadêmica) ou na Guarita. Quando o dono retirar o pertence, é gerado um termo formal em PDF e você ganha pontos e badges de reputação em seu perfil!",
    icon: Award,
    accentColor: "from-emerald-600 to-teal-700",
    badgeText: "Passo 5 de 5 • Comunidade & Badges",
    tips: [
      "Acumule pontos de reputação e desbloqueie badges de honra.",
      "Comprovante digital com código autenticador para prestação de contas.",
      "Suporte offline com salvamento no navegador para locais sem sinal.",
    ],
  },
];

const TOUR_STORAGE_KEYS = ["ifpr_achados_tour_completed", "ifpr_tour_completed", "ifpr_dont_show_tour"];

interface TourGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TourGuide: React.FC<TourGuideProps> = ({ isOpen, onClose }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState<boolean>(() => {
    try {
      return TOUR_STORAGE_KEYS.some((key) => localStorage.getItem(key) === "true");
    } catch (_) {
      return false;
    }
  });

  useEffect(() => {
    if (isOpen) {
      setCurrentStepIndex(0);
      try {
        const isDismissed = TOUR_STORAGE_KEYS.some((key) => localStorage.getItem(key) === "true");
        setDontShowAgain(isDismissed);
      } catch (_) {}
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentStep = TOUR_STEPS[currentStepIndex];
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === TOUR_STEPS.length - 1;
  const IconComponent = currentStep.icon;

  const handleDontShowAgainChange = (checked: boolean) => {
    setDontShowAgain(checked);
    try {
      if (checked) {
        TOUR_STORAGE_KEYS.forEach((k) => localStorage.setItem(k, "true"));
      } else {
        TOUR_STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));
      }
    } catch (_) {}
  };

  const handleNext = () => {
    vibrateClick();
    if (isLastStep) {
      handleComplete();
    } else {
      setCurrentStepIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    vibrateClick();
    if (!isFirstStep) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleComplete = () => {
    vibrateSuccess();
    try {
      if (dontShowAgain) {
        TOUR_STORAGE_KEYS.forEach((k) => localStorage.setItem(k, "true"));
      }
    } catch (_) {}
    onClose();
  };

  const handleSkip = () => {
    vibrateClick();
    try {
      if (dontShowAgain) {
        TOUR_STORAGE_KEYS.forEach((k) => localStorage.setItem(k, "true"));
      }
    } catch (_) {}
    onClose();
  };

  return (
    <AnimatePresence>
      <div
        id="tour-guide-modal-overlay"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      >
        {/* Modal Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 15 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full max-w-xl bg-white dark:bg-[#1E1E1E] rounded-3xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden"
        >
          {/* Top Banner Accent */}
          <div className={`h-2.5 w-full bg-gradient-to-r ${currentStep.accentColor}`} />

          {/* Header Controls */}
          <div className="flex items-center justify-between px-6 pt-5 pb-2">
            <span className="px-3 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-[11px] font-extrabold uppercase tracking-wider border border-neutral-200 dark:border-neutral-700">
              {currentStep.badgeText}
            </span>

            <button
              onClick={handleSkip}
              className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              title="Fechar Guia"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content Area */}
          <div className="px-6 py-4 space-y-5">
            {/* Step Icon & Titles */}
            <div className="flex items-start space-x-4">
              <div
                className={`p-3.5 rounded-2xl bg-gradient-to-br ${currentStep.accentColor} text-white shadow-md shrink-0`}
              >
                <IconComponent className="w-7 h-7" />
              </div>
              <div className="space-y-0.5">
                <h3 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white leading-tight">
                  {currentStep.title}
                </h3>
                <p className="text-xs sm:text-sm font-semibold text-[#00843D] dark:text-green-400">
                  {currentStep.subtitle}
                </p>
              </div>
            </div>

            {/* Description */}
            <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
              {currentStep.description}
            </p>

            {/* Practical Tips Box */}
            <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/80 dark:border-neutral-700/60 space-y-2">
              <div className="text-[11px] font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                Destaques Práticos:
              </div>
              <div className="space-y-1.5">
                {currentStep.tips.map((tip, idx) => (
                  <div key={idx} className="flex items-start space-x-2 text-xs text-neutral-700 dark:text-neutral-300">
                    <CheckCircle2 className="w-4 h-4 text-[#00843D] dark:text-green-400 shrink-0 mt-0.5" />
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Step Progress Indicators */}
            <div className="flex items-center justify-center space-x-2 pt-1">
              {TOUR_STEPS.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    vibrateClick();
                    setCurrentStepIndex(idx);
                  }}
                  className={`h-2 rounded-full transition-all ${
                    idx === currentStepIndex
                      ? "w-8 bg-[#00843D] dark:bg-green-500"
                      : "w-2 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300"
                  }`}
                  title={`Ir para o passo ${idx + 1}`}
                />
              ))}
            </div>
          </div>

          {/* Footer Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 bg-neutral-50 dark:bg-neutral-900/60 border-t border-neutral-200 dark:border-neutral-800">
            {/* Don't show again checkbox */}
            <label className="flex items-center space-x-2 cursor-pointer text-xs text-neutral-500 dark:text-neutral-400 self-start sm:self-center">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => handleDontShowAgainChange(e.target.checked)}
                className="w-4 h-4 rounded text-[#00843D] focus:ring-[#00843D] border-neutral-300 dark:border-neutral-700 cursor-pointer"
              />
              <span>Não exibir automaticamente</span>
            </label>

            {/* Buttons */}
            <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
              {!isFirstStep && (
                <button
                  type="button"
                  onClick={handlePrev}
                  className="px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-bold transition-all flex items-center space-x-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Anterior</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleNext}
                className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-[#00843D] hover:bg-[#006830] text-white text-xs font-black transition-all flex items-center justify-center space-x-1.5 shadow-md shadow-emerald-700/20"
              >
                <span>{isLastStep ? "Concluir Guia" : "Próximo"}</span>
                {!isLastStep && <ChevronRight className="w-4 h-4" />}
                {isLastStep && <CheckCircle2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
