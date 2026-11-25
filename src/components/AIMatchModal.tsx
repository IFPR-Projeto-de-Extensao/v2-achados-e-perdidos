import React from "react";
import { useApp } from "../context/AppContext";
import { localize, translateCampusLocation, translateCategory } from "../lib/i18n";
import { ModalShell, SubtlePanel, UIBadge, UIButton } from "./ui";
import { Sparkles, X, ArrowRight, CheckCircle2 } from "lucide-react";

export const AIMatchModal: React.FC = () => {
  const { aiMatchAlert, setAiMatchAlert, setSelectedItemForDetail, language } = useApp();
  const L = (pt: string, en: string) => localize(language, pt, en);

  if (!aiMatchAlert) return null;

  const { newItem, matches } = aiMatchAlert;
  const topMatch = matches[0];

  return (
    <ModalShell
      isOpen={Boolean(aiMatchAlert)}
      onClose={() => setAiMatchAlert(null)}
      maxWidthClass="max-w-xl"
      zIndexClass="z-60"
      ariaLabelledBy="ai-match-modal-title"
    >
      <div className="p-5 sm:p-6 space-y-5">
        {/* Top Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 pb-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/60 border border-[#16845B]/15 text-[#16845B] dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-[#16845B] dark:text-emerald-400 uppercase tracking-wider">
                  {L("Correspondência Inteligente IFPR", "IFPR Smart Matching")}
                </span>
                {topMatch && (
                  <UIBadge tone="emerald">
                    {L(`Correspondência ${topMatch.matchScore}%`, `${topMatch.matchScore}% Match`)}
                  </UIBadge>
                )}
                <UIBadge tone="blue">{L("Notificação Enviada", "Push Sent")}</UIBadge>
              </div>
              <h3
                id="ai-match-modal-title"
                className="text-lg sm:text-xl font-bold text-[#172B2A] dark:text-white tracking-tight"
              >
                {L("Encontramos objetos semelhantes!", "We found similar items!")}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setAiMatchAlert(null)}
            aria-label={L("Fechar alerta de correspondência", "Close match alert")}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-[#172B2A] dark:hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3.5 rounded-xl bg-[#EBF5F0]/70 dark:bg-emerald-950/30 border border-[#16845B]/20 dark:border-emerald-800/50 text-xs text-[#064E3B] dark:text-emerald-200 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-[#16845B] dark:text-emerald-400 shrink-0 mt-0.5" />
          <span className="leading-relaxed">
            <strong>{L("Alerta de Notificação Enviado:", "Push Alert Sent:")}</strong>{" "}
            {L(
              "Os usuários que cadastraram os itens correspondentes foram notificados automaticamente em tempo real via Firebase Cloud Messaging no navegador e celular.",
              "Users who registered the matching items have been automatically notified in real time via Firebase Cloud Messaging on desktop and mobile."
            )}
          </span>
        </div>

        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {L("Ao registrar", "When registering")}{" "}
          <strong className="text-[#172B2A] dark:text-white">&quot;{newItem.title}&quot;</strong>
          {L(
            ", nossa IA analisou o acervo e detectou que este pertence pode ser a contraparte de um objeto cadastrado anteriormente.",
            ", our AI analyzed the catalog and detected that this item may correspond to a previously registered record."
          )}
        </p>

        {/* Matches list */}
        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {matches.map((match) => (
            <SubtlePanel key={match.matchedItem.id} padding="sm" className="space-y-3">
              <div className="flex items-start gap-3">
                <img
                  src={match.matchedItem.imageUrl}
                  alt={match.matchedItem.title}
                  className="w-16 h-16 rounded-xl object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm font-bold text-[#172B2A] dark:text-white truncate">
                      {match.matchedItem.title}
                    </span>
                    <UIBadge tone="emerald">
                      {L(`${match.matchScore}% de Correspondência`, `${match.matchScore}% Match`)}
                    </UIBadge>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                    {L("Local:", "Location:")} {translateCampusLocation(match.matchedItem.location, language)} • {L("Categoria:", "Category:")} {translateCategory(match.matchedItem.category, language)}
                  </p>
                  <p className="text-[11px] text-[#064E3B] dark:text-emerald-300 bg-[#EBF5F0]/80 dark:bg-emerald-950/40 border border-[#16845B]/15 p-2 rounded-lg font-medium leading-relaxed">
                    &quot;{match.reason}&quot;
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <UIButton
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setAiMatchAlert(null);
                    setSelectedItemForDetail(match.matchedItem);
                  }}
                >
                  <span>{L("Ver Objeto Correspondente", "View Matching Item")}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </UIButton>
              </div>
            </SubtlePanel>
          ))}
        </div>

        {/* Footer close button */}
        <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800 flex justify-end">
          <UIButton
            type="button"
            variant="secondary"
            size="md"
            onClick={() => setAiMatchAlert(null)}
          >
            {L("Entendido, Continuar", "Got it, Continue")}
          </UIButton>
        </div>
      </div>
    </ModalShell>
  );
};

export default AIMatchModal;
