import React from "react";
import { X, Keyboard, ArrowRight } from "lucide-react";
import { vibrateClick } from "../lib/utils";

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { key: "H", description: "Ir para a Página Inicial (Home)" },
  { key: "S", description: "Pesquisar / Catálogo de Objetos" },
  { key: "R", description: "Cadastrar Novo Objeto Perdido / Achado" },
  { key: "D", description: "Acessar Painel / Dashboard" },
  { key: "P", description: "Ver Perfil do Usuário" },
  { key: "A", description: "Analisador Visual de Fotos com IA (Gemini)" },
  { key: "Q", description: "Abrir Scanner de QR Code do Campus" },
  { key: "?", description: "Exibir este Guia de Atalhos de Teclado" },
  { key: "Esc", description: "Fechar Modais e Janelas Abertas" },
];

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-white dark:bg-[#1E1E1E] rounded-3xl shadow-2xl border border-neutral-200 dark:border-neutral-800 p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 rounded-2xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="shortcuts-modal-title"
                className="text-base font-extrabold text-neutral-900 dark:text-white"
              >
                Atalhos de Teclado
              </h2>
              <p className="text-[11px] text-neutral-500">
                Navegação rápida e acessibilidade no Localiza+ IFPR
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              vibrateClick();
              onClose();
            }}
            aria-label="Fechar atalhos de teclado"
            className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Shortcuts List */}
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800/60 max-h-[60vh] overflow-y-auto pr-1">
          {SHORTCUTS.map((item) => (
            <div
              key={item.key}
              className="py-2.5 flex items-center justify-between text-xs"
            >
              <span className="text-neutral-700 dark:text-neutral-300 font-medium">
                {item.description}
              </span>
              <kbd className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 font-mono font-black text-neutral-800 dark:text-neutral-200 text-xs shadow-xs min-w-[28px] text-center">
                {item.key}
              </kbd>
            </div>
          ))}
        </div>

        {/* Footer Note */}
        <div className="pt-2 text-center text-[10px] text-neutral-400 border-t border-neutral-100 dark:border-neutral-800">
          Pressione qualquer atalho fora dos campos de texto para navegar instantaneamente.
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcutsModal;
