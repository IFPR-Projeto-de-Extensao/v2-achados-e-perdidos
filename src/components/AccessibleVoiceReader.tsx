import React, { useState, useEffect, useRef, useCallback } from "react";
import { Volume2, VolumeX, Pause, Play, Square, Gauge, AlertCircle } from "lucide-react";
import { LostFoundItem } from "../types";
import { useApp } from "../context/AppContext";
import { getLocaleForLanguage, localize } from "../lib/i18n";
import { vibrateClick } from "../lib/utils";
import {
  SUPPORTED_SPEECH_RATES,
  SelectedVoiceInfo,
  SpeechChunk,
  SpeechSynthesisVoiceLike,
  buildItemSpeechChunks,
  claimGlobalSpeechSession,
  getGlobalSpeechSession,
  getProsodyConfig,
  invalidateGlobalSpeechSession,
  isBenignSpeechError,
  selectBestVoice,
  selectFallbackVoice,
} from "../lib/ttsEngine";

interface AccessibleVoiceReaderProps {
  item: LostFoundItem;
  className?: string;
}

const DEFAULT_VOICE_INFO: SelectedVoiceInfo = {
  voice: null,
  fallbackVoice: null,
  tier: "default",
  normalizedLang: "pt-br",
  isLocal: true,
  hasTargetLanguageVoice: false,
  availableTargetVoices: 0,
};

function getSafeVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return [];
  }
  try {
    return window.speechSynthesis.getVoices() || [];
  } catch {
    return [];
  }
}

function getSafeOnlineState(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

export const AccessibleVoiceReader: React.FC<AccessibleVoiceReaderProps> = ({
  item,
  className = "",
}) => {
  const { language } = useApp();
  const L = useCallback(
    (pt: string, en: string) => localize(language, pt, en),
    [language]
  );

  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const [voiceInfo, setVoiceInfo] = useState<SelectedVoiceInfo>(DEFAULT_VOICE_INFO);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusAnnouncement, setStatusAnnouncement] = useState<string>("");

  const mountedRef = useRef<boolean>(true);
  const rateRef = useRef<number>(1.0);
  const voiceInfoRef = useRef<SelectedVoiceInfo>(DEFAULT_VOICE_INFO);
  const activeVoiceOverrideRef = useRef<SpeechSynthesisVoiceLike | null | undefined>(undefined);
  const failedVoicesRef = useRef<Set<string>>(new Set());
  const chunksRef = useRef<SpeechChunk[]>([]);
  const chunkIndexRef = useRef<number>(0);
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const retryCountForChunkRef = useRef<number>(0);
  const sessionIdRef = useRef<number>(0);

  const clearPendingChunkTimer = useCallback(() => {
    if (chunkTimerRef.current !== null) {
      clearTimeout(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
  }, []);

  const cancelSynthesisNow = useCallback(
    (resetState = true) => {
      clearPendingChunkTimer();
      sessionIdRef.current = invalidateGlobalSpeechSession();
      utteranceRef.current = null;

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Ignore platform cancel exceptions when synthesis queue is already idle
        }
      }

      if (resetState && mountedRef.current) {
        setIsPlaying(false);
        setIsPaused(false);
      }
    },
    [clearPendingChunkTimer]
  );

  const refreshAvailableVoices = useCallback((): SelectedVoiceInfo => {
    const voices = getSafeVoices();
    const info = selectBestVoice(voices, language, {
      isOnline: getSafeOnlineState(),
    });
    voiceInfoRef.current = info;
    if (mountedRef.current) {
      setVoiceInfo(info);
    }
    return info;
  }, [language]);

  // Detect Web Speech API support, hydrate voices asynchronously (Android Chrome safe),
  // react to online/offline transitions, and guarantee immediate cleanup on unmount/pagehide.
  useEffect(() => {
    mountedRef.current = true;
    const supported =
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      typeof SpeechSynthesisUtterance !== "undefined";

    setIsSupported(supported);
    if (!supported) {
      return () => {
        mountedRef.current = false;
      };
    }

    const synth = window.speechSynthesis;
    const handleVoicesChanged = () => {
      refreshAvailableVoices();
    };

    const initialInfo = refreshAvailableVoices();

    if (typeof synth.addEventListener === "function") {
      synth.addEventListener("voiceschanged", handleVoicesChanged);
    } else {
      synth.onvoiceschanged = handleVoicesChanged;
    }

    // Android Chrome often returns [] on initial getVoices() without firing voiceschanged right away.
    const hydrationTimers: Array<ReturnType<typeof setTimeout>> = [];
    if (initialInfo.availableTargetVoices === 0) {
      for (const delayMs of [150, 600, 1500]) {
        hydrationTimers.push(
          setTimeout(() => {
            if (!mountedRef.current) return;
            const info = refreshAvailableVoices();
            if (info.availableTargetVoices > 0) {
              hydrationTimers.forEach((t) => clearTimeout(t));
            }
          }, delayMs)
        );
      }
    }

    const handleConnectivityChange = () => {
      activeVoiceOverrideRef.current = undefined;
      failedVoicesRef.current.clear();
      refreshAvailableVoices();
    };

    const handlePageHide = () => {
      cancelSynthesisNow(false);
    };

    window.addEventListener("online", handleConnectivityChange);
    window.addEventListener("offline", handleConnectivityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      mountedRef.current = false;
      hydrationTimers.forEach((t) => clearTimeout(t));
      if (typeof synth.removeEventListener === "function") {
        synth.removeEventListener("voiceschanged", handleVoicesChanged);
      } else if (synth.onvoiceschanged === handleVoicesChanged) {
        synth.onvoiceschanged = null;
      }
      window.removeEventListener("online", handleConnectivityChange);
      window.removeEventListener("offline", handleConnectivityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      cancelSynthesisNow(false);
    };
  }, [language, refreshAvailableVoices, cancelSynthesisNow]);

  // Immediately stop reading when switching to another item or changing UI language.
  useEffect(() => {
    cancelSynthesisNow(true);
    chunksRef.current = [];
    chunkIndexRef.current = 0;
    activeVoiceOverrideRef.current = undefined;
    failedVoicesRef.current.clear();
    setErrorMessage(null);
    setStatusAnnouncement("");
  }, [item.id, language, cancelSynthesisNow]);

  const speakChunkAtIndex = useCallback(
    (index: number, sessionId: number, activeRate: number) => {
      if (!mountedRef.current || sessionId !== getGlobalSpeechSession()) {
        return;
      }

      const chunks = chunksRef.current;
      if (index >= chunks.length) {
        utteranceRef.current = null;
        chunkIndexRef.current = 0;
        setIsPlaying(false);
        setIsPaused(false);
        setStatusAnnouncement(L("Leitura concluída.", "Reading completed."));
        return;
      }

      const chunk = chunks[index];
      chunkIndexRef.current = index;

      // Refresh voice info if not yet hydrated
      let currentInfo = voiceInfoRef.current;
      if (!currentInfo.voice) {
        currentInfo = refreshAvailableVoices();
      }

      const selectedVoice =
        activeVoiceOverrideRef.current !== undefined
          ? activeVoiceOverrideRef.current
          : currentInfo.voice;

      const effectiveTier =
        activeVoiceOverrideRef.current !== undefined ? "fallback" : currentInfo.tier;

      const prosody = getProsodyConfig(activeRate, effectiveTier);
      const utterance = new SpeechSynthesisUtterance(chunk.text);

      utterance.lang = selectedVoice?.lang
        ? selectedVoice.lang.replace(/_/g, "-")
        : getLocaleForLanguage(language);
      utterance.rate = prosody.rate;
      utterance.pitch = prosody.pitch;
      utterance.volume = prosody.volume;

      if (selectedVoice) {
        try {
          utterance.voice = selectedVoice as SpeechSynthesisVoice;
        } catch {
          // Some browsers throw if voice object is stale; keep lang set for OS fallback
        }
      }

      utterance.onstart = () => {
        if (!mountedRef.current || sessionId !== getGlobalSpeechSession()) return;
        retryCountForChunkRef.current = 0;
        setIsPlaying(true);
        setIsPaused(false);
        setErrorMessage(null);
      };

      utterance.onend = () => {
        if (!mountedRef.current || sessionId !== getGlobalSpeechSession()) return;

        const nextIndex = index + 1;
        if (nextIndex >= chunks.length) {
          utteranceRef.current = null;
          chunkIndexRef.current = 0;
          setIsPlaying(false);
          setIsPaused(false);
          setStatusAnnouncement(L("Leitura concluída.", "Reading completed."));
          return;
        }

        const pauseMs = Math.max(
          60,
          Math.round(chunk.pauseAfterMs / Math.max(0.8, activeRate))
        );
        clearPendingChunkTimer();
        chunkTimerRef.current = setTimeout(() => {
          speakChunkAtIndex(nextIndex, sessionId, rateRef.current);
        }, pauseMs);
      };

      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        if (!mountedRef.current || sessionId !== getGlobalSpeechSession()) return;

        if (isBenignSpeechError(event?.error)) {
          return;
        }

        // Automatic fallback to a local/alternate voice if the primary voice fails
        if (selectedVoice?.voiceURI) {
          failedVoicesRef.current.add(selectedVoice.voiceURI);
        }

        if (retryCountForChunkRef.current < 2) {
          retryCountForChunkRef.current += 1;
          const freshVoices = getSafeVoices();
          const fallback = selectFallbackVoice(
            freshVoices,
            language,
            Array.from(failedVoicesRef.current),
            true
          );

          // Try fallback voice first; on second retry allow OS default (voice = null)
          activeVoiceOverrideRef.current =
            retryCountForChunkRef.current === 1 && fallback ? fallback : null;

          try {
            window.speechSynthesis.cancel();
          } catch {
            // Ignore cancel failure prior to retry
          }

          clearPendingChunkTimer();
          chunkTimerRef.current = setTimeout(() => {
            speakChunkAtIndex(index, sessionId, rateRef.current);
          }, 80);
          return;
        }

        utteranceRef.current = null;
        setIsPlaying(false);
        setIsPaused(false);
        setErrorMessage(
          L(
            "Não foi possível reproduzir a voz neste dispositivo. Verifique o volume de mídia ou tente novamente.",
            "Could not play speech on this device. Check media volume or try again."
          )
        );
      };

      utteranceRef.current = utterance;

      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        setIsPlaying(false);
        setIsPaused(false);
        setErrorMessage(
          L(
            "Erro ao iniciar a síntese de voz. Tente novamente.",
            "Failed to start speech synthesis. Please try again."
          )
        );
      }
    },
    [language, L, refreshAvailableVoices, clearPendingChunkTimer]
  );

  const startPlaybackFrom = useCallback(
    (startIndex: number, rateToUse: number) => {
      if (!isSupported) return;

      clearPendingChunkTimer();
      const newSessionId = claimGlobalSpeechSession();
      sessionIdRef.current = newSessionId;
      retryCountForChunkRef.current = 0;

      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore cancel errors when queue is empty
      }

      if (chunksRef.current.length === 0 || startIndex === 0) {
        chunksRef.current = buildItemSpeechChunks(item, language);
      }

      const safeIndex = Math.min(
        Math.max(0, startIndex),
        Math.max(0, chunksRef.current.length - 1)
      );

      setErrorMessage(null);
      setIsPlaying(true);
      setIsPaused(false);
      setStatusAnnouncement(L("Iniciando leitura em voz alta.", "Starting read aloud."));

      // Micro-delay after cancel() avoids a known Chrome/Android race where speak()
      // immediately following cancel() is silently dropped.
      chunkTimerRef.current = setTimeout(() => {
        speakChunkAtIndex(safeIndex, newSessionId, rateToUse);
      }, 40);
    },
    [isSupported, clearPendingChunkTimer, item, language, L, speakChunkAtIndex]
  );

  const handleStartSpeech = () => {
    vibrateClick();
    if (!isSupported) return;
    activeVoiceOverrideRef.current = undefined;
    failedVoicesRef.current.clear();
    chunkIndexRef.current = 0;
    startPlaybackFrom(0, rateRef.current);
  };

  const handlePauseResume = () => {
    vibrateClick();
    if (!isSupported) return;

    if (isPaused) {
      startPlaybackFrom(chunkIndexRef.current, rateRef.current);
    } else if (isPlaying) {
      // Chunk-level pause is 100% reliable on Android Chrome, where native
      // speechSynthesis.pause()/resume() frequently stalls or no-ops.
      clearPendingChunkTimer();
      sessionIdRef.current = invalidateGlobalSpeechSession();
      utteranceRef.current = null;
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore cancel errors
      }
      setIsPaused(true);
      setIsPlaying(false);
      setStatusAnnouncement(L("Leitura pausada.", "Reading paused."));
    }
  };

  const handleStopSpeech = () => {
    vibrateClick();
    if (!isSupported) return;
    chunkIndexRef.current = 0;
    cancelSynthesisNow(true);
    setErrorMessage(null);
    setStatusAnnouncement(L("Leitura interrompida.", "Reading stopped."));
  };

  const handleRateChange = (newRate: number) => {
    vibrateClick();
    rateRef.current = newRate;
    setSpeechRate(newRate);

    if (isPlaying) {
      // Continue immediately from the current sentence at the new speed
      startPlaybackFrom(chunkIndexRef.current, newRate);
    }
  };

  if (!isSupported) {
    return (
      <div
        className={`p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500 text-xs flex items-center gap-2 ${className}`}
      >
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
      aria-busy={isPlaying}
      className={`p-3.5 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20 border border-emerald-200 dark:border-emerald-800/40 space-y-2.5 transition-all shadow-xs ${className}`}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center space-x-2">
          <div
            className={`p-2 rounded-xl text-white transition-all shadow-xs ${
              isPlaying ? "bg-emerald-600 animate-pulse motion-reduce:animate-none" : "bg-emerald-700"
            }`}
          >
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
        <div
          role="group"
          aria-label={L("Velocidade da leitura", "Reading speed")}
          className="flex items-center space-x-1 bg-white dark:bg-neutral-800 p-1 rounded-xl border border-emerald-200/80 dark:border-neutral-700"
        >
          <Gauge className="w-3.5 h-3.5 text-neutral-400 ml-1" aria-hidden="true" />
          {SUPPORTED_SPEECH_RATES.map((rate) => {
            const label = rate === 1.0 ? "1x" : `${rate}x`;
            return (
              <button
                key={rate}
                type="button"
                onClick={() => handleRateChange(rate)}
                aria-pressed={speechRate === rate}
                aria-label={L(
                  `Velocidade ${label}`,
                  `Playback speed ${label}`
                )}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${
                  speechRate === rate
                    ? "bg-[#00843D] text-white shadow-xs"
                    : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Playback Controls & Status */}
      <div className="flex items-center justify-between pt-1 gap-2 flex-wrap">
        <div className="flex items-center space-x-2">
          {!isPlaying && !isPaused && (
            <button
              type="button"
              onClick={handleStartSpeech}
              className="px-3.5 py-1.5 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              <span>{L("Ouvir Descrição", "Listen to Description")}</span>
            </button>
          )}

          {isPlaying && (
            <button
              type="button"
              onClick={handlePauseResume}
              className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              <span>{L("Pausar", "Pause")}</span>
            </button>
          )}

          {isPaused && (
            <button
              type="button"
              onClick={handlePauseResume}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              <span>{L("Continuar", "Resume")}</span>
            </button>
          )}

          {(isPlaying || isPaused) && (
            <button
              type="button"
              onClick={handleStopSpeech}
              className="px-3 py-1.5 rounded-xl bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
              title={L("Parar Leitura", "Stop Reading")}
              aria-label={L("Parar leitura em voz alta", "Stop reading aloud")}
            >
              <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              <span>{L("Parar", "Stop")}</span>
            </button>
          )}
        </div>

        {/* Audio Wave / Pulse Indicator */}
        {isPlaying && (
          <div
            className="flex items-center space-x-1 text-emerald-600 dark:text-emerald-400"
            aria-live="polite"
            title={voiceInfo.voice?.name || undefined}
          >
            <span
              className="w-1.5 h-4 bg-emerald-500 rounded-full animate-bounce motion-reduce:animate-none"
              style={{ animationDelay: "0ms" }}
            />
            <span
              className="w-1.5 h-6 bg-emerald-600 rounded-full animate-bounce motion-reduce:animate-none"
              style={{ animationDelay: "150ms" }}
            />
            <span
              className="w-1.5 h-3 bg-emerald-400 rounded-full animate-bounce motion-reduce:animate-none"
              style={{ animationDelay: "300ms" }}
            />
            <span
              className="w-1.5 h-5 bg-emerald-500 rounded-full animate-bounce motion-reduce:animate-none"
              style={{ animationDelay: "450ms" }}
            />
            <span className="text-[10px] font-bold ml-1.5 text-neutral-600 dark:text-neutral-300">
              {L("Reproduzindo...", "Playing...")}
            </span>
          </div>
        )}

        {isPaused && (
          <span
            className="text-[10px] font-bold text-amber-600 dark:text-amber-400"
            aria-live="polite"
          >
            {L("Leitura pausada", "Reading paused")}
          </span>
        )}
      </div>

      {/* Screen-reader live region for playback state transitions */}
      {statusAnnouncement && (
        <span className="sr-only" role="status" aria-live="polite">
          {statusAnnouncement}
        </span>
      )}

      {/* Compact accessible error feedback when playback fails */}
      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-1.5 text-[11px] font-medium text-amber-800 dark:text-amber-300 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl px-2.5 py-1.5"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};
