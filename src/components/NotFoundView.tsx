import React from "react";
import { useRouter } from "../context/RouterContext";
import { Search, Home, ArrowLeft, Layers, Sparkles, HelpCircle } from "lucide-react";
import { vibrateClick } from "../lib/utils";

export const NotFoundView: React.FC = () => {
  const { navigate, goBack, pathname } = useRouter();

  return (
    <div className="max-w-2xl mx-auto py-16 px-4 text-center space-y-6 animate-in fade-in duration-300">
      <div className="w-24 h-24 rounded-3xl bg-[#00843D]/10 dark:bg-[#00843D]/20 text-[#00843D] dark:text-green-400 border border-[#00843D]/30 flex items-center justify-center mx-auto shadow-inner">
        <span className="text-4xl font-black">404</span>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
          Página não encontrada
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-300 max-w-md mx-auto leading-relaxed">
          O endereço <code className="px-2 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-xs font-mono">{pathname}</code> não foi encontrado no sistema Localiza+ IFPR Campus Ivaiporã.
        </p>
      </div>

      <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={() => {
            vibrateClick();
            navigate("/");
          }}
          className="py-3.5 px-6 rounded-2xl bg-[#00843D] hover:bg-[#006e33] text-white font-black text-sm shadow-lg shadow-[#00843D]/20 transition-all flex items-center justify-center space-x-2"
        >
          <Home className="w-4 h-4" />
          <span>Ir para o Início</span>
        </button>

        <button
          onClick={() => {
            vibrateClick();
            navigate("/buscar");
          }}
          className="py-3.5 px-6 rounded-2xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-bold text-sm transition-all flex items-center justify-center space-x-2 border border-neutral-300 dark:border-neutral-700"
        >
          <Search className="w-4 h-4" />
          <span>Buscar Objetos</span>
        </button>

        <button
          onClick={() => {
            vibrateClick();
            goBack();
          }}
          className="py-3.5 px-5 rounded-2xl bg-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 font-bold text-xs transition-colors flex items-center justify-center space-x-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar</span>
        </button>
      </div>
    </div>
  );
};
