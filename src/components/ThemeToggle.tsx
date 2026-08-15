import React from "react";
import { Sun, Moon } from "lucide-react";
import { useApp } from "../context/AppContext";

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  className = "",
  showLabel = false,
}) => {
  const { darkMode, toggleDarkMode } = useApp();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={toggleDarkMode}
        role="switch"
        aria-checked={darkMode}
        aria-label={darkMode ? "Alternar para Modo Claro" : "Alternar para Modo Escuro"}
        title={darkMode ? "Tema Escuro Ativo (Clique para Modo Claro)" : "Tema Claro Ativo (Clique para Modo Escuro)"}
        className="relative inline-flex items-center h-8 w-14 rounded-full p-1 bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 transition-colors duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#00843D] shrink-0 shadow-inner"
      >
        <span className="sr-only">Alternar tema da interface</span>
        <span
          className={`flex items-center justify-center w-6 h-6 rounded-full bg-white dark:bg-neutral-900 shadow-md transform transition-transform duration-300 ${
            darkMode ? "translate-x-6" : "translate-x-0"
          }`}
        >
          {darkMode ? (
            <Moon className="w-3.5 h-3.5 fill-amber-300 text-amber-300 transition-transform duration-200" />
          ) : (
            <Sun className="w-3.5 h-3.5 text-amber-500 fill-amber-500 transition-transform duration-200" />
          )}
        </span>
      </button>

      {showLabel && (
        <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
          {darkMode ? "Modo Escuro" : "Modo Claro"}
        </span>
      )}
    </div>
  );
};
