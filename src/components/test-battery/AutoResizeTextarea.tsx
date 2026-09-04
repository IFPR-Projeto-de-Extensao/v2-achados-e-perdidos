import React, { useRef, useEffect, useId } from "react";

export interface AutoResizeTextareaProps {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number; // Default: 6
  maxLength?: number;
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
  darkMode?: boolean;
  className?: string;
}

/**
 * Auto-resizing textarea component with a real-time character counter
 * positioned below the bottom border of the field.
 *
 * Implements:
 * - Dynamic height auto-calculation via `useRef`
 * - Fallback to Tailwind `resize-y` for manual tester adjustment
 * - Default `minRows = 6`
 * - Live character counter placed below the bottom border
 */
export const AutoResizeTextarea: React.FC<AutoResizeTextareaProps> = ({
  id,
  label,
  value,
  onChange,
  placeholder,
  minRows = 6,
  maxLength,
  required = false,
  disabled = false,
  helperText,
  darkMode = false,
  className = "",
}) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize calculation based on scrollHeight
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to compute true scrollHeight
    textarea.style.height = "auto";
    
    // Calculate approximate min height for specified rows (approx 24px per line + padding)
    const minHeightPx = Math.max(minRows * 24 + 20, 140);
    const newHeight = Math.max(textarea.scrollHeight, minHeightPx);
    textarea.style.height = `${newHeight}px`;
  }, [value, minRows]);

  const charCount = value ? value.length : 0;
  const isNearLimit = maxLength ? charCount > maxLength * 0.9 : false;
  const isAtLimit = maxLength ? charCount >= maxLength : false;

  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* Field Label Header */}
      <div className="flex items-center justify-between">
        <label
          htmlFor={inputId}
          className="font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5"
        >
          <span>{label}</span>
          {required && <span className="text-red-500">*</span>}
        </label>
      </div>

      {/* Auto-Resizing Textarea */}
      <textarea
        ref={textareaRef}
        id={inputId}
        rows={minRows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        maxLength={maxLength}
        className={`w-full font-medium px-3.5 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 min-h-[140px] leading-relaxed transition resize-y ${
          darkMode
            ? "bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500"
            : "bg-neutral-50 border-neutral-300 text-neutral-900 placeholder:text-neutral-400"
        } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
      />

      {/* Row Below Bottom Border: Helper Text & Real-Time Character Counter */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-neutral-500">
        <div className="text-neutral-500 dark:text-neutral-400">
          {helperText || "Área ampla com suporte a quebra de linha e expansão automática."}
        </div>

        {/* Real-time character counter positioned below bottom border */}
        <div
          id={`${inputId}-char-count`}
          className={`font-mono font-semibold transition-colors ${
            isAtLimit
              ? "text-red-600 dark:text-red-400 font-bold"
              : isNearLimit
              ? "text-amber-600 dark:text-amber-400 font-bold"
              : "text-neutral-500 dark:text-neutral-400"
          }`}
        >
          {maxLength ? (
            <span>
              {charCount} / {maxLength} caracteres
            </span>
          ) : (
            <span>{charCount} caracteres</span>
          )}
        </div>
      </div>
    </div>
  );
};
