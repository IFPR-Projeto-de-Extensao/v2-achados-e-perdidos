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
  const { darkMode, toggleDarkMode, t } = useApp();

  return (
    <div className={`flex items-center shrink-0 ${className}`}>
      <button
        type="button"
        onClick={toggleDarkMode}
        role="switch"
        aria-checked={darkMode}
        aria-label={darkMode ? t("themeSwitchToLight", "Alternar para Modo Claro") : t("themeSwitchToDark", "Alternar para Modo Escuro")}
        title={darkMode ? t("themeSwitchToLight", "Alternar para Modo Claro") : t("themeSwitchToDark", "Alternar para Modo Escuro")}
        className="relative inline-flex items-center h-6 w-11 rounded-full p-0.5 bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#00843D] shrink-0 shadow-inner"
      >
        <span className="sr-only">{darkMode ? t("themeSwitchToLight", "Alternar para Modo Claro") : t("themeSwitchToDark", "Alternar para Modo Escuro")}</span>
        <span
          className={`flex items-center justify-center w-5 h-5 rounded-full bg-white dark:bg-neutral-900 shadow-xs transform transition-transform duration-200 ${
            darkMode ? "translate-x-5" : "translate-x-0"
          }`}
        >
          {darkMode ? (
            <Moon className="w-3 h-3 fill-amber-300 text-amber-300 transition-transform duration-200" />
          ) : (
            <Sun className="w-3 h-3 text-amber-500 fill-amber-500 transition-transform duration-200" />
          )}
        </span>
      </button>

      {showLabel && (
        <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 ml-1.5 whitespace-nowrap">
          {darkMode ? t("themeDarkMode", "Modo Escuro") : t("themeLightMode", "Modo Claro")}
        </span>
      )}
    </div>
  );
};
