import React from "react";
import { LegalDocumentSection } from "../../data/legalDocumentsData";
import { AlertCircle, Info, Shield, CheckCircle2, ChevronRight } from "lucide-react";

interface LegalSectionRendererProps {
  section: LegalDocumentSection;
  onOpenOtherDocument?: (e: React.MouseEvent, path: string) => void;
}

export const LegalSectionRenderer: React.FC<LegalSectionRendererProps> = ({
  section,
  onOpenOtherDocument,
}) => {
  return (
    <section
      id={section.id}
      className="space-y-3 pt-4 scroll-mt-24 transition-colors"
      aria-labelledby={`heading-${section.id}`}
    >
      {/* Section Header */}
      <h2
        id={`heading-${section.id}`}
        className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2"
      >
        <span className="font-mono text-[#00843D] dark:text-green-400">
          {section.num.toString().padStart(2, "0")}.
        </span>
        <span>{section.title}</span>
      </h2>

      {/* Paragraphs */}
      {section.paragraphs && section.paragraphs.length > 0 && (
        <div className="space-y-2.5 text-xs sm:text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
          {section.paragraphs.map((p, idx) => (
            <p key={idx}>{p}</p>
          ))}
        </div>
      )}

      {/* Bullet Items */}
      {section.bulletItems && section.bulletItems.length > 0 && (
        <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
          {section.bulletItems.map((item, idx) => (
            <li key={idx} className="marker:text-[#00843D] dark:marker:text-green-400">
              {item}
            </li>
          ))}
        </ul>
      )}

      {/* Ordered Items */}
      {section.orderedItems && section.orderedItems.length > 0 && (
        <ol className="list-decimal pl-5 space-y-1.5 text-xs sm:text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
          {section.orderedItems.map((item, idx) => (
            <li key={idx} className="marker:font-bold marker:text-[#00843D] dark:marker:text-green-400">
              {item}
            </li>
          ))}
        </ol>
      )}

      {/* Callouts */}
      {section.callouts && section.callouts.length > 0 && (
        <div className="space-y-3 pt-1">
          {section.callouts.map((callout, idx) => {
            const isWarning = callout.type === "warning" || callout.type === "alert";
            return (
              <div
                key={idx}
                className={`p-4 sm:p-5 rounded-2xl border leading-relaxed text-xs sm:text-sm space-y-2 ${
                  isWarning
                    ? "bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40 text-amber-900 dark:text-amber-200"
                    : "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-200"
                }`}
              >
                {callout.title && (
                  <p className="font-bold flex items-center gap-1.5 uppercase tracking-wide text-xs">
                    {isWarning ? (
                      <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    ) : (
                      <Info className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    )}
                    <span>{callout.title}</span>
                  </p>
                )}
                <p className={isWarning ? "font-medium" : "italic"}>{callout.text}</p>
                {callout.subtext && (
                  <p className="text-xs opacity-90 leading-normal pt-1 border-t border-black/5 dark:border-white/5">
                    {callout.subtext}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Info Cards / Key-Value List */}
      {section.infoCards && section.infoCards.length > 0 && (
        <div className="p-4 sm:p-5 rounded-2xl bg-neutral-50 dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800 space-y-2.5 text-xs sm:text-sm">
          {section.infoCards.map((card, idx) => (
            <div key={idx} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
              <span className="font-bold text-neutral-900 dark:text-white shrink-0">
                • {card.label}:
              </span>
              <span className="text-neutral-700 dark:text-neutral-300 break-all font-mono sm:font-sans">
                {card.value.includes("@") ? (
                  <a
                    href={`mailto:${card.value}`}
                    className="text-[#00843D] dark:text-green-400 font-semibold hover:underline"
                  >
                    {card.value}
                  </a>
                ) : (
                  card.value
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Paragraphs After Card */}
      {section.paragraphsAfter && section.paragraphsAfter.length > 0 && (
        <div className="space-y-2.5 text-xs sm:text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed pt-1">
          {section.paragraphsAfter.map((p, idx) => (
            <p key={idx}>{p}</p>
          ))}
        </div>
      )}
    </section>
  );
};
