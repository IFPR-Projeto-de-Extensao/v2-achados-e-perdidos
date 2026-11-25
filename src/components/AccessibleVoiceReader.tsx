import React, { useState, useEffect, useRef } from "react";
import { Volume2, VolumeX, Pause, Play, Square, Gauge } from "lucide-react";
import { LostFoundItem } from "../types";
import { useApp } from "../context/AppContext";
import {
  getLocaleForLanguage,
  localize,
  translateCampusLocation,
  translateCategory,
  translateColor,
} from "../lib/i18n";
import { vibrateClick } from "../lib/utils";

interface AccessibleVoiceReaderProps {
  item: LostFoundItem;
  className?: string;
}

export const AccessibleVoiceReader: React.FC<AccessibleVoiceReaderProps> = ({ item, className = "" }) => {
  const { language } = useApp();
  const L = (pt: string, en: string) => localize(language, pt, en);

  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Check Web Speech API support and load matching language voices
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      setIsSupported(true);

      const updateVoices = () => {
        const availableVoices = window.speechSynthesis.getVoices();
        const targetPrefix = language === "en" ? "en" : "pt";
        const targetFull = language === "en" ? "en-us" : "pt-br";
        const matchedVoice =
          availableVoices.find((v) => v.lang.toLowerCase() === targetFull) ||
          availableVoices.find((v) => v.lang.toLowerCase().startsWith(targetPrefix)) ||
          null;
        setSelectedVoice(matchedVoice);
      };

      updateVoices();
      window.speechSynthesis.onvoiceschanged = updateVoices;

      return () => {
        if ("speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
      };
    }
  }, [language]);

  // Construct structured, accessible speech script
  const getSpeechScript = (): string => {
    const itemType =
      item.type === "PERDIDO" ? L("perdido", "lost") : L("encontrado", "found");
    const statusText =
      item.status === "DEVOLVIDO"
        ? L("já devolvido ao proprietário", "already returned to the owner")
        : item.status === "EM_ANALISE"
        ? L("em análise na coordenação ou portaria", "under review at the campus office or gatehouse")
        : L("disponível para localização", "available for recovery");

    const parts: string[] = [
      L(
        `Atenção. Leitura acessível do objeto ${itemType}.`,
        `Attention. Accessible audio reading of the ${itemType} item.`
      ),
      `${L("Título", "Title")}: ${item.title}.`,
      `${L("Situação atual", "Current status")}: ${statusText}.`,
      `${L("Categoria", "Category")}: ${translateCategory(item.category, language)}.`,
      `${L("Local registrado", "Registered location")}: ${translateCampusLocation(item.location, language)}.`,
      item.color && item.color !== "Não informada"
        ? `${L("Cor predominante", "Primary color")}: ${translateColor(item.color, language)}.`
        : "",
      item.brand && item.brand !== "Não identificada"
        ? `${L("Marca ou fabricante", "Brand or manufacturer")}: ${item.brand}.`
        : "",
      `${L("Descrição detalhada", "Detailed description")}: ${item.description}.`,
      item.contactInfo
        ? `${L("Instruções de retirada e contato", "Pickup instructions and contact")}: ${item.contactInfo}.`
        : L(
            "Instruções de retirada: Dirija-se à Guarita Principal ou Secretaria Acadêmica do Instituto Federal do Paraná, Campus Ivaiporã.",
            "Pickup instructions: Visit the Main Gatehouse or Academic Office at IFPR Campus Ivaiporã."
          ),
      `${L("Código de identificação da etiqueta", "Tag identification code")}: ${item.qrCodeId}.`,
      L("Fim da descrição do objeto.", "End of item description."),
    ];

    return parts.filter(Boolean).join(" ");
  };

  const handleStartSpeech = () => {
    vibrateClick();
    if (!isSupported) return;

    window.speechSynthesis.cancel();

    const script = getSpeechScript();
    const utterance = new SpeechSynthesisUtterance(script);
    utterance.lang = getLocaleForLanguage(language);
    utterance.rate = speechRate;
    utterance.pitch = 1.0;

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onstart = () => {
      setIsPlaying(true);
      setIsPaused(false);
    };

    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };

    utterance.onerror = (e) => {
      console.warn("[TTS Warning]:", e);
      setIsPlaying(false);
      setIsPaused(false);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const handlePauseResume = () => {
    vibrateClick();
    if (!isSupported) return;

    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      setIsPlaying(true);
    } else if (isPlaying) {
      window.speechSynthesis.pause();
      setIsPaused(true);
      setIsPlaying(false);
    }
  };

  const handleStopSpeech = () => {
    vibrateClick();
    if (!isSupported) return;

    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
  };

  const handleRateChange = (newRate: number) => {
    vibrateClick();
    setSpeechRate(newRate);
    if (isPlaying || isPaused) {
      handleStartSpeech();
    }
  };

  if (!isSupported) {
    return (
      <div className={`p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500 text-xs flex items-center gap-2 ${className}`}>
        <VolumeX className="w-4 h-4 text-neutral-400 shrink-0" />
        <span>
          {L(
            "Leitura em voz alta não suportada neste navegador.",
            "Read aloud is not supported in this browser."
          )}
        </span>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label={L("Leitor de Acessibilidade em Voz Alta", "Accessible Read-Aloud Reader")}
      className={`p-3.5 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20 border border-emerald-200 dark:border-emerald-800/40 space-y-2.5 transition-all shadow-xs ${className}`}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center space-x-2">
          <div className={`p-2 rounded-xl text-white transition-all shadow-xs ${isPlaying ? "bg-emerald-600 animate-pulse" : "bg-emerald-700"}`}>
            <Volume2 className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black text-neutral-900 dark:text-white">
                {L("Leitura em Voz Alta", "Read Aloud (Text-to-Speech)")}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300">
                {L("Acessibilidade", "Accessibility")}
              </span>
            </div>
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
              {L(
                "Ouça a descrição completa e instruções deste pertence",
                "Listen to the full description and instructions for this item"
              )}
            </p>
          </div>
        </div>

        {/* Speed Controls */}
        <div className="flex items-center space-x-1 bg-white dark:bg-neutral-800 p-1 rounded-xl border border-emerald-200/80 dark:border-neutral-700">
          <Gauge className="w-3.5 h-3.5 text-neutral-400 ml-1" />
          {[0.8, 1.0, 1.25].map((rate) => (
            <button
              key={rate}
              type="button"
              onClick={() => handleRateChange(rate)}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold transition-all ${
                speechRate === rate
                  ? "bg-[#00843D] text-white shadow-xs"
                  : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              }`}
            >
              {rate === 1.0 ? "1x" : `${rate}x`}
            </button>
          ))}
        </div>
      </div>

      {/* Playback Controls & Status */}
      <div className="flex items-center justify-between pt-1 gap-2">
        <div className="flex items-center space-x-2">
          {!isPlaying && !isPaused && (
            <button
              type="button"
              onClick={handleStartSpeech}
              className="px-3.5 py-1.5 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{L("Ouvir Descrição", "Listen to Description")}</span>
            </button>
          )}

          {isPlaying && (
            <button
              type="button"
              onClick={handlePauseResume}
              className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5 fill-current" />
              <span>{L("Pausar", "Pause")}</span>
            </button>
          )}

          {isPaused && (
            <button
              type="button"
              onClick={handlePauseResume}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{L("Continuar", "Resume")}</span>
            </button>
          )}

          {(isPlaying || isPaused) && (
            <button
              type="button"
              onClick={handleStopSpeech}
              className="px-3 py-1.5 rounded-xl bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
              title={L("Parar Leitura", "Stop Reading")}
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>{L("Parar", "Stop")}</span>
            </button>
          )}
        </div>

        {/* Audio Wave / Pulse Indicator */}
        {isPlaying && (
          <div className="flex items-center space-x-1 text-emerald-600 dark:text-emerald-400" aria-live="polite">
            <span className="w-1.5 h-4 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-6 bg-emerald-600 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-3 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            <span className="w-1.5 h-5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: "450ms" }} />
            <span className="text-[10px] font-bold ml-1.5 text-neutral-600 dark:text-neutral-300">
              {L("Reproduzindo...", "Playing...")}
            </span>
          </div>
        )}

        {isPaused && (
          <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
            ⏸️ {L("Leitura pausada", "Reading paused")}
          </span>
        )}
      </div>
    </div>
  );
};
