import React from "react";
import { useApp } from "../context/AppContext";
import { Sparkles, X, ArrowRight, CheckCircle2, ShieldCheck, Flame } from "lucide-react";

export const AIMatchModal: React.FC = () => {
  const { aiMatchAlert, setAiMatchAlert, setSelectedItemForDetail } = useApp();

  if (!aiMatchAlert) return null;

  const { newItem, matches } = aiMatchAlert;
  const topMatch = matches[0];

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 sm:p-8 max-w-xl w-full border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-6 animate-in fade-in zoom-in duration-200">
        {/* Top Header */}
        <div className="flex items-start justify-between border-b border-neutral-200 dark:border-neutral-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-2xl bg-gradient-to-tr from-[#00843D] to-emerald-400 text-white shadow-md">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-[#00843D] dark:text-green-400 uppercase tracking-wider">
                  Inteligência Artificial IFPR Campus Ivaiporã
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                  Correspondência {topMatch.matchScore}%
                </span>
              </div>
              <h3 className="text-xl font-black text-neutral-900 dark:text-white">
                Encontramos objetos semelhantes!
              </h3>
            </div>
          </div>

          <button
            onClick={() => setAiMatchAlert(null)}
            className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
          Ao registrar <strong>&quot;{newItem.title}&quot;</strong>, nossa IA analisou o acervo e detectou que este pertence pode ser a contraparte de um objeto cadastrado anteriormente!
        </p>

        {/* Matches list */}
        <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
          {matches.map((match, idx) => (
            <div
              key={match.matchedItem.id}
              className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700/80 space-y-3"
            >
              <div className="flex items-start space-x-3">
                <img
                  src={match.matchedItem.imageUrl}
                  alt=""
                  className="w-16 h-16 rounded-xl object-cover shrink-0 border border-neutral-200 dark:border-neutral-700"
                />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-900 dark:text-white">
                      {match.matchedItem.title}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-[#00843D]/20 text-[#00843D] dark:text-green-400 text-[10px] font-extrabold">
                      {match.matchScore}% de Match
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 line-clamp-1">
                    Local: {match.matchedItem.location} • Categoria: {match.matchedItem.category}
                  </p>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 p-2 rounded-lg font-medium">
                    &quot;{match.reason}&quot;
                  </p>
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => {
                    setAiMatchAlert(null);
                    setSelectedItemForDetail(match.matchedItem);
                  }}
                  className="px-4 py-2 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white font-bold text-xs flex items-center space-x-1.5 shadow-xs"
                >
                  <span>Ver Objeto Correspondente</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer close button */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={() => setAiMatchAlert(null)}
            className="px-5 py-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-bold text-xs hover:bg-neutral-200"
          >
            Entendido, Continuar
          </button>
        </div>
      </div>
    </div>
  );
};
