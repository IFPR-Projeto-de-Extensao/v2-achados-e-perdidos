import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, Volume2, Sparkles, X, Search, Check, AlertCircle, ArrowRight, Radio } from "lucide-react";
import { vibrateClick, vibrateSuccess, vibrateCritical } from "../lib/utils";

interface VoiceSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSearchQuery: (query: string) => void;
}

export const VoiceSearchModal: React.FC<VoiceSearchModalProps> = ({
  isOpen,
  onClose,
  onSearchQuery,
}) => {
  const [isListening, setIsListening] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>("");
  const [detectedObject, setDetectedObject] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [voiceVolume, setVoiceVolume] = useState<number>(0);
  const recognitionRef = useRef<any>(null);
  const animFrameRef = useRef<number | null>(null);

  // Check speech recognition capability on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setIsSupported(false);
      }
    }
  }, []);

  // Parse voice text to extract the object query
  const parseVoiceCommand = (text: string): { raw: string; objectQuery: string } => {
    const clean = text.trim();
    const lower = clean.toLowerCase();

    // Regex to match "Localiza [objeto]", "Localizar [objeto]", "Busca/Buscar [objeto]", "Encontra/Encontrar [objeto]"
    const prefixRegex = /^(?:localiza|localizar|procure|procura|procurar|busca|buscar|encontre|encontrar|onde está|onde esta|acha|achar)\s+(?:um|uma|o|a|os|as|meu|minha|meus|minhas)?\s*/i;

    let objectQuery = clean;
    if (prefixRegex.test(lower)) {
      objectQuery = clean.replace(prefixRegex, "").trim();
    }

    // If empty after stripping, fallback to original
    if (!objectQuery) {
      objectQuery = clean;
    }

    return { raw: clean, objectQuery };
  };

  const speakFeedback = (text: string) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "pt-BR";
        utterance.rate = 1.05;
        window.speechSynthesis.speak(utterance);
      } catch (_) {}
    }
  };

  const startListening = () => {
    vibrateClick();
    setErrorMessage(null);
    setTranscript("");
    setDetectedObject("");

    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      setErrorMessage("O reconhecimento de voz não é suportado pelo seu navegador atual.");
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }

      const recognition = new SpeechRecognition();
      recognition.lang = "pt-BR";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;

      recognition.onstart = () => {
        setIsListening(true);
        // Simulate audio wave level animation
        const animateLevels = () => {
          setVoiceVolume(Math.random() * 0.8 + 0.2);
          animFrameRef.current = requestAnimationFrame(animateLevels);
        };
        animateLevels();
      };

      recognition.onresult = (event: any) => {
        let currentTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }

        setTranscript(currentTranscript);
        const { objectQuery } = parseVoiceCommand(currentTranscript);
        setDetectedObject(objectQuery);

        // If final result
        if (event.results[0].isFinal) {
          vibrateSuccess();
          const finalResult = currentTranscript;
          const parsed = parseVoiceCommand(finalResult);
          setDetectedObject(parsed.objectQuery);

          speakFeedback(`Buscando por ${parsed.objectQuery}`);

          // Give a brief visual feedback then trigger search
          setTimeout(() => {
            onSearchQuery(parsed.objectQuery);
            onClose();
          }, 900);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn("Speech recognition error:", event.error);
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        setIsListening(false);
        setVoiceVolume(0);

        if (event.error === "not-allowed" || event.error === "permission-denied") {
          vibrateCritical();
          setErrorMessage("Permissão para usar o microfone foi negada. Permita o acesso nas configurações do seu navegador.");
        } else if (event.error === "no-speech") {
          setErrorMessage("Nenhuma fala detectada. Toque no microfone e diga por exemplo: 'Localiza chaves'.");
        } else {
          setErrorMessage(`Falha no reconhecimento de voz (${event.error}). Tente novamente.`);
        }
      };

      recognition.onend = () => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        setIsListening(false);
        setVoiceVolume(0);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.error("Erro ao iniciar reconhecimento de voz:", err);
      setIsListening(false);
      setErrorMessage("Não foi possível acessar o microfone. Verifique as permissões.");
    }
  };

  const stopListening = () => {
    vibrateClick();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {}
    }
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setIsListening(false);
    setVoiceVolume(0);
  };

  // Auto-start listening when modal opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        startListening();
      }, 300);
      return () => {
        clearTimeout(timer);
        if (recognitionRef.current) {
          try {
            recognitionRef.current.abort();
          } catch (_) {}
        }
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        setIsListening(false);
      };
    }
  }, [isOpen]);

  const handleApplyDetected = (query: string) => {
    vibrateSuccess();
    onSearchQuery(query);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          id="voice-search-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            id="voice-search-modal-content"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-md bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 sm:p-8 border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-6 text-center relative overflow-hidden"
          >
            {/* Background Ambient Glow */}
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-[#00843D]/15 dark:bg-[#00843D]/25 blur-3xl rounded-full pointer-events-none" />

            {/* Close Button */}
            <button
              id="voice-search-close-btn"
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full text-neutral-400 hover:text-neutral-600 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              aria-label="Fechar busca por voz"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header Badge */}
            <div className="flex flex-col items-center space-y-2">
              <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#00843D]/10 text-[#00843D] dark:text-green-400 text-xs font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Comando de Voz IFPR</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-neutral-900 dark:text-white">
                Busca Rápida por Voz
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-xs">
                Diga <span className="font-bold text-[#00843D] dark:text-green-400">"Localiza"</span> seguido do nome do objeto que procura.
              </p>
            </div>

            {/* Central Microphone Animation Circle */}
            <div className="flex flex-col items-center justify-center py-4 relative">
              {/* Pulsing Ripple Rings */}
              {isListening && (
                <>
                  <motion.div
                    animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
                    transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                    className="absolute w-28 h-28 rounded-full bg-[#00843D]/20 pointer-events-none"
                  />
                  <motion.div
                    animate={{ scale: [1, 1.7, 1], opacity: [0.4, 0, 0.4] }}
                    transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut", delay: 0.3 }}
                    className="absolute w-28 h-28 rounded-full bg-[#00843D]/15 pointer-events-none"
                  />
                </>
              )}

              {/* Main Button */}
              <button
                id="voice-search-mic-trigger"
                onClick={isListening ? stopListening : startListening}
                className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl cursor-pointer ${
                  isListening
                    ? "bg-[#00843D] text-white ring-8 ring-[#00843D]/20 scale-105 shadow-[#00843D]/30"
                    : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                }`}
                title={isListening ? "Parar escuta" : "Iniciar escuta por voz"}
              >
                {isListening ? (
                  <Mic className="w-10 h-10 animate-pulse" />
                ) : (
                  <MicOff className="w-9 h-9" />
                )}
              </button>

              {/* Status Indicator text */}
              <div className="mt-4 flex items-center space-x-2 text-xs font-bold">
                {isListening ? (
                  <span className="flex items-center space-x-1.5 text-[#00843D] dark:text-green-400">
                    <span className="w-2 h-2 rounded-full bg-[#00843D] animate-ping" />
                    <span>Ouvindo... Fale agora</span>
                  </span>
                ) : (
                  <span className="text-neutral-500 dark:text-neutral-400">
                    Toque no microfone para falar
                  </span>
                )}
              </div>
            </div>

            {/* Transcript & Detection Card */}
            <div className="bg-neutral-50 dark:bg-neutral-900/90 rounded-2xl p-4 border border-neutral-200 dark:border-neutral-800 min-h-[90px] flex flex-col items-center justify-center space-y-2">
              {transcript ? (
                <>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 italic">
                    "{transcript}"
                  </p>
                  {detectedObject && (
                    <div className="flex items-center space-x-2 pt-1">
                      <span className="text-xs font-extrabold text-neutral-700 dark:text-neutral-200">
                        Item Detectado:
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-[#00843D]/10 text-[#00843D] dark:text-green-400 text-xs font-black">
                        {detectedObject}
                      </span>
                    </div>
                  )}
                </>
              ) : errorMessage ? (
                <div className="flex items-center space-x-2 text-xs text-red-500 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              ) : (
                <p className="text-xs text-neutral-400 dark:text-neutral-500">
                  Exemplos: "Localiza garrafa", "Localiza mochila azul", "Localiza chaves"
                </p>
              )}
            </div>

            {/* Manual Action Buttons / Shortcuts */}
            {detectedObject && !isListening && (
              <motion.button
                id="voice-search-confirm-btn"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => handleApplyDetected(detectedObject)}
                className="w-full py-3 rounded-2xl bg-[#00843D] hover:bg-[#006e33] text-white font-extrabold text-xs transition-all shadow-md flex items-center justify-center space-x-2 cursor-pointer"
              >
                <Search className="w-4 h-4" />
                <span>Buscar "{detectedObject}" no Catálogo</span>
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            )}

            {/* Quick Keyword Suggestions */}
            <div className="space-y-2 pt-1 border-t border-neutral-100 dark:border-neutral-800/80">
              <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block">
                Sugestões Rápidas:
              </span>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {["Garrafa Térmica", "Mochila", "Chaves", "Calculadora", "Estojo", "Casaco"].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => handleApplyDetected(suggestion)}
                    className="px-2.5 py-1 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-[#00843D]/10 hover:text-[#00843D] dark:hover:text-green-400 text-neutral-600 dark:text-neutral-300 text-[11px] font-semibold transition-all cursor-pointer border border-neutral-200/60 dark:border-neutral-700"
                  >
                    "{suggestion}"
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
