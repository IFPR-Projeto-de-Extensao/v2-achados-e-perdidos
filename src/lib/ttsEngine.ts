import { LostFoundItem } from "../types";
import {
  SupportedLanguage,
  getLocaleForLanguage,
  localize,
  translateCampusLocation,
  translateCategory,
  translateColor,
} from "./i18n";

export interface SpeechSynthesisVoiceLike {
  name: string;
  lang: string;
  voiceURI: string;
  localService: boolean;
  default?: boolean;
}

export type VoiceQualityTier =
  | "neural"
  | "enhanced"
  | "standard"
  | "fallback"
  | "default";

export interface RankedVoice {
  voice: SpeechSynthesisVoiceLike;
  score: number;
  tier: VoiceQualityTier;
  normalizedLang: string;
  isExactRegionMatch: boolean;
}

export interface SelectedVoiceInfo {
  voice: SpeechSynthesisVoiceLike | null;
  fallbackVoice: SpeechSynthesisVoiceLike | null;
  tier: VoiceQualityTier;
  normalizedLang: string;
  isLocal: boolean;
  hasTargetLanguageVoice: boolean;
  availableTargetVoices: number;
}

export interface SpeechChunk {
  id: string;
  text: string;
  pauseAfterMs: number;
}

export interface ProsodyConfig {
  rate: number;
  pitch: number;
  volume: number;
}

export const SUPPORTED_SPEECH_RATES = [0.8, 1.0, 1.25] as const;

// Global monotonic session token to prevent overlapping/simultaneous speech across components.
let globalSpeechSessionId = 0;

export function claimGlobalSpeechSession(): number {
  globalSpeechSessionId += 1;
  return globalSpeechSessionId;
}

export function getGlobalSpeechSession(): number {
  return globalSpeechSessionId;
}

export function invalidateGlobalSpeechSession(): number {
  globalSpeechSessionId += 1;
  return globalSpeechSessionId;
}

/**
 * Normalizes BCP-47 locale tags returned across platforms.
 * Critical on Android Chrome/WebView where voices often report "pt_BR" (underscore)
 * instead of "pt-BR" (hyphen).
 */
export function normalizeBcp47(lang: string | undefined | null): string {
  if (!lang || typeof lang !== "string") return "";
  return lang.trim().replace(/_/g, "-").toLowerCase();
}

const ROBOTIC_OR_NOVELTY_PATTERNS = [
  /\bespeak\b/i,
  /\bespeak-ng\b/i,
  /\bpico\b/i,
  /\bflite\b/i,
  /\bfestival\b/i,
  /\brhvoice\b/i,
  /\beloquence\b/i,
  /\bmbrola\b/i,
  /\bnovelty\b/i,
  /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|pipe organ|superstar|trinoids|whisper|wobble|zarvox)\b/i,
];

const PT_NEURAL_PATTERNS = [
  /online\s*\(natural\)/i,
  /\bnatural\b/i,
  /\bneural\b/i,
  /\bwavenet\b/i,
  /\bstudio\b/i,
  /\bchirp\b/i,
  /google\s+portugu[eê]s\s+do\s+brasil/i,
  /pt-br-x-[a-z0-9]+-network/i,
  /microsoft\s+(francisca|antonio|thalita|brenda|donato|elza|fabio|giovanna|humberto|julio|leila|leticia|manuela|nicolau|valerio|yara)\b/i,
];

const EN_NEURAL_PATTERNS = [
  /online\s*\(natural\)/i,
  /\bnatural\b/i,
  /\bneural\b/i,
  /\bwavenet\b/i,
  /\bstudio\b/i,
  /\bchirp\b/i,
  /google\s+us\s+english/i,
  /en-us-x-[a-z0-9]+-network/i,
  /microsoft\s+(aria|jenny|guy|ava|andrew|emma|brian|ana|michelle|steffan)\b/i,
];

const ENHANCED_LOCAL_PATTERNS_PT = [
  /\b(premium|enhanced|aprimorada|siri)\b/i,
  /pt-br-x-[a-z0-9]+-local/i,
  /\bgoogle\b/i,
  /\b(luciana|fernanda|felipe)\b/i,
  /microsoft\s+(maria|daniel)\b/i,
];

const ENHANCED_LOCAL_PATTERNS_EN = [
  /\b(premium|enhanced|siri)\b/i,
  /en-us-x-[a-z0-9]+-local/i,
  /\bgoogle\b/i,
  /\b(samantha|allison|ava|nicky|alex)\b/i,
  /microsoft\s+(zira|david|mark)\b/i,
];

const SAMSUNG_LOCAL_PATTERN = /\b(samsung|smt)\b/i;
const COMPACT_PATTERN = /\bcompact\b/i;

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function isRoboticVoice(voice: SpeechSynthesisVoiceLike): boolean {
  const signature = `${voice.name} ${voice.voiceURI}`;
  return matchesAny(signature, ROBOTIC_OR_NOVELTY_PATTERNS);
}

/**
 * Scores and ranks available SpeechSynthesis voices for naturalness,
 * prioritizing pt-BR neural/natural voices on Android Chrome, Edge, Chrome,
 * and Apple devices while remaining fully offline-resilient.
 */
export function rankVoicesForLanguage(
  voices: readonly SpeechSynthesisVoiceLike[],
  language: SupportedLanguage,
  options: {
    isOnline?: boolean;
    excludeVoiceURIs?: readonly string[];
  } = {}
): RankedVoice[] {
  const isOnline = options.isOnline ?? true;
  const excluded = new Set(options.excludeVoiceURIs ?? []);
  const primaryPrefix = language === "en" ? "en" : "pt";
  const preferredRegion = language === "en" ? "en-us" : "pt-br";
  const neuralPatterns = language === "en" ? EN_NEURAL_PATTERNS : PT_NEURAL_PATTERNS;
  const enhancedPatterns =
    language === "en" ? ENHANCED_LOCAL_PATTERNS_EN : ENHANCED_LOCAL_PATTERNS_PT;

  const ranked: RankedVoice[] = [];

  for (const voice of voices) {
    if (!voice || !voice.lang) continue;
    if (excluded.has(voice.voiceURI)) continue;

    const normalizedLang = normalizeBcp47(voice.lang);
    if (
      normalizedLang !== primaryPrefix &&
      !normalizedLang.startsWith(`${primaryPrefix}-`)
    ) {
      continue;
    }

    const isExactRegionMatch = normalizedLang === preferredRegion;
    const signature = `${voice.name || ""} ${voice.voiceURI || ""}`;
    const robotic = isRoboticVoice(voice);
    const isCompact = COMPACT_PATTERN.test(signature);
    const isNeuralCandidate = !robotic && matchesAny(signature, neuralPatterns);
    const isEnhancedCandidate = !robotic && matchesAny(signature, enhancedPatterns);
    const isSamsungLocal = !robotic && SAMSUNG_LOCAL_PATTERN.test(signature);

    let score = 0;
    let tier: VoiceQualityTier = "standard";

    // 1. Regional accuracy (pt-BR strongly preferred over pt-PT; en-US over en-GB)
    if (isExactRegionMatch) {
      score += 1000;
    } else if (normalizedLang === primaryPrefix) {
      score += 480;
    } else {
      // Secondary dialect (e.g., pt-PT when pt-BR is requested)
      score += 200;
    }

    // 2. Voice synthesis quality & naturalness
    if (robotic) {
      score -= 700;
      tier = "fallback";
    } else if (isNeuralCandidate) {
      if (isOnline || voice.localService) {
        score += 520;
        tier = "neural";
        // Explicit Azure Natural / Google pt-BR / Android network voices get extra priority
        if (/online\s*\(natural\)|google\s+portugu[eê]s\s+do\s+brasil|pt-br-x-.*-network|google\s+us\s+english/i.test(signature)) {
          score += 75;
        }
        // Prefer balanced Brazilian female/male natural voices on Android Speech Services
        if (/pt-br-x-(ptd|pte|afs)-network/i.test(signature)) {
          score += 30;
        }
      } else {
        // Cloud-only neural voice when offline cannot synthesize reliably
        score -= 320;
        tier = "fallback";
      }
    } else if (isEnhancedCandidate) {
      score += 410;
      tier = "enhanced";
      if (/\b(premium|enhanced|aprimorada|siri)\b/i.test(signature)) {
        score += 65;
      } else if (/pt-br-x-(ptd|pte|afs)-local/i.test(signature)) {
        score += 50;
      }
    } else if (isSamsungLocal) {
      score += 220;
      tier = "standard";
    } else {
      score += 140;
      tier = "standard";
    }

    // 3. Offline / local service weighting
    if (voice.localService) {
      score += isOnline ? 25 : 420;
    } else if (!isOnline) {
      score -= 350;
    }

    // 4. Compact voices penalized slightly so full/enhanced voices win
    if (isCompact) {
      score -= 80;
    }

    // 5. Mild tie-breaker for OS default voice (never overrides neural vs robotic)
    if (voice.default && !robotic) {
      score += 15;
    }

    ranked.push({
      voice,
      score,
      tier,
      normalizedLang,
      isExactRegionMatch,
    });
  }

  return ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.voice.name || "").localeCompare(b.voice.name || "");
  });
}

/**
 * Selects the best voice and its safest automatic fallback (preferring a local offline voice
 * as backup whenever the primary voice is network-dependent).
 */
export function selectBestVoice(
  voices: readonly SpeechSynthesisVoiceLike[],
  language: SupportedLanguage,
  options: {
    isOnline?: boolean;
    excludeVoiceURIs?: readonly string[];
  } = {}
): SelectedVoiceInfo {
  const ranked = rankVoicesForLanguage(voices, language, options);

  if (ranked.length === 0) {
    return {
      voice: null,
      fallbackVoice: null,
      tier: "default",
      normalizedLang: getLocaleForLanguage(language).toLowerCase(),
      isLocal: true,
      hasTargetLanguageVoice: false,
      availableTargetVoices: 0,
    };
  }

  const primary = ranked[0];
  const remaining = ranked.slice(1);

  // Prefer a reliable local voice as fallback if the primary voice is cloud/network-backed
  const fallbackEntry =
    (!primary.voice.localService
      ? remaining.find((entry) => entry.voice.localService && !isRoboticVoice(entry.voice)) ||
        remaining.find((entry) => entry.voice.localService)
      : null) ||
    remaining.find((entry) => !isRoboticVoice(entry.voice)) ||
    remaining[0] ||
    null;

  return {
    voice: primary.voice,
    fallbackVoice: fallbackEntry ? fallbackEntry.voice : null,
    tier: primary.tier,
    normalizedLang: primary.normalizedLang,
    isLocal: Boolean(primary.voice.localService),
    hasTargetLanguageVoice: true,
    availableTargetVoices: ranked.length,
  };
}

/**
 * Picks the next compatible fallback voice after a runtime synthesis failure,
 * prioritizing local/offline voices if a network voice failed.
 */
export function selectFallbackVoice(
  voices: readonly SpeechSynthesisVoiceLike[],
  language: SupportedLanguage,
  failedVoiceURIs: readonly string[],
  preferLocal = true
): SpeechSynthesisVoiceLike | null {
  const ranked = rankVoicesForLanguage(voices, language, {
    isOnline: !preferLocal,
    excludeVoiceURIs: failedVoiceURIs,
  });

  if (ranked.length === 0) return null;

  if (preferLocal) {
    const localCandidate = ranked.find((r) => r.voice.localService);
    if (localCandidate) return localCandidate.voice;
  }

  return ranked[0].voice;
}

/**
 * Calibrates speech rate, pitch, and volume for natural delivery.
 * Slightly moderates 1x and 1.25x on neural/Android voices to avoid rushed prosody
 * while keeping the 3 speeds clearly distinct and monotonic (0.8 < 1.0 < 1.25).
 */
export function getProsodyConfig(
  userRate: number,
  tier: VoiceQualityTier = "neural"
): ProsodyConfig {
  const safeRate = Number.isFinite(userRate) ? userRate : 1.0;

  let calibratedRate: number;
  if (safeRate <= 0.85) {
    calibratedRate = 0.8;
  } else if (safeRate <= 1.05) {
    calibratedRate = tier === "fallback" ? 0.92 : 0.96;
  } else {
    calibratedRate = tier === "fallback" ? 1.15 : 1.22;
  }

  return {
    rate: Math.min(2.0, Math.max(0.5, calibratedRate)),
    pitch: 1.0,
    volume: 1.0,
  };
}

const PT_MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const EN_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatCalendarDateParts(
  day: number,
  month: number,
  year: number,
  language: SupportedLanguage
): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) {
    return null;
  }
  if (language === "en") {
    return `${EN_MONTHS[month - 1]} ${day}, ${year}`;
  }
  const spokenDay = day === 1 ? "primeiro" : String(day);
  return `${spokenDay} de ${PT_MONTHS[month - 1]} de ${year}`;
}

/**
 * Converts ISO (YYYY-MM-DD), BR (DD/MM/YYYY), or Date inputs into natural spoken dates.
 */
export function formatDateForSpeech(
  dateInput: string | Date | undefined | null,
  language: SupportedLanguage
): string {
  if (!dateInput) return "";

  if (dateInput instanceof Date && !Number.isNaN(dateInput.getTime())) {
    return (
      formatCalendarDateParts(
        dateInput.getDate(),
        dateInput.getMonth() + 1,
        dateInput.getFullYear(),
        language
      ) || ""
    );
  }

  const raw = String(dateInput).trim();
  if (!raw) return "";

  // Match YYYY-MM-DD (optionally followed by T...)
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const formatted = formatCalendarDateParts(
      Number(isoMatch[3]),
      Number(isoMatch[2]),
      Number(isoMatch[1]),
      language
    );
    if (formatted) return formatted;
  }

  // Match DD/MM/YYYY or DD-MM-YYYY
  const brMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (brMatch) {
    const formatted = formatCalendarDateParts(
      Number(brMatch[1]),
      Number(brMatch[2]),
      Number(brMatch[3]),
      language
    );
    if (formatted) return formatted;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return (
      formatCalendarDateParts(
        parsed.getDate(),
        parsed.getMonth() + 1,
        parsed.getFullYear(),
        language
      ) || ""
    );
  }

  return "";
}

/**
 * Formats 24h time expressions (e.g., 14:30, 08h00, 9h15) into natural spoken phrases.
 */
export function formatTimeForSpeech(
  hours: number,
  minutes: number,
  language: SupportedLanguage
): string {
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return `${hours}:${String(minutes).padStart(2, "0")}`;
  }

  if (language === "en") {
    const period = hours >= 12 ? "PM" : "AM";
    const h12 = hours % 12 === 0 ? 12 : hours % 12;
    return minutes === 0
      ? `${h12} ${period}`
      : `${h12}:${String(minutes).padStart(2, "0")} ${period}`;
  }

  const hourWord = hours === 1 ? "hora" : "horas";
  if (minutes === 0) {
    return `${hours} ${hourWord}`;
  }
  const minuteWord = minutes === 1 ? "minuto" : "minutos";
  return `${hours} ${hourWord} e ${minutes} ${minuteWord}`;
}

/**
 * Formats alphanumeric QR tag IDs (e.g. "LOC-2026-A3F9") so synthesizers pronounce
 * each segment clearly instead of mangling codes into garbled words.
 */
export function formatQrCodeForSpeech(
  qrCodeId: string | undefined | null,
  language: SupportedLanguage
): string {
  const raw = (qrCodeId || "").trim();
  if (!raw) return "";

  const segments = raw
    .split(/[\-_\/\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const spokenSegments = segments.map((seg) => {
    // Keep natural 4-digit years (e.g., 2026) intact
    if (/^(19|20)\d{2}$/.test(seg)) {
      return seg;
    }
    // Pure short digits (e.g., 0042) -> spell digit-by-digit for clarity
    if (/^\d+$/.test(seg)) {
      return seg.split("").join(" ");
    }
    // Acronyms or mixed alphanumeric codes (e.g., LOC, IFPR, A3F9) -> space characters
    if (seg.length <= 6 || (/[A-Za-z]/.test(seg) && /\d/.test(seg))) {
      return seg.toUpperCase().split("").join(" ");
    }
    return seg;
  });

  const joiner = language === "en" ? ", " : ", ";
  return spokenSegments.join(joiner);
}

/**
 * Normalizes Brazilian Portuguese and English text for fluid, natural speech synthesis:
 * - Expands inline dates (DD/MM/YYYY and YYYY-MM-DD) and times (HH:MM, HHhMM)
 * - Normalizes IFPR campus acronyms, Roman block numerals, leading zeros in room numbers
 * - Replaces awkward symbols (&, /, nº, Obs., bullets, decorative emojis) with spoken equivalents
 * - Preserves all Brazilian Portuguese accents and punctuation pauses
 */
export function normalizeTextForSpeech(
  text: string | undefined | null,
  language: SupportedLanguage
): string {
  if (!text || typeof text !== "string") return "";

  let out = text
    // Remove decorative emojis/pictographs that synthesizers either read verbosely or choke on
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ")
    // Replace bullet/pipe/dash separators with natural pauses
    .replace(/\s*[•·|]\s*/g, ", ")
    .replace(/\s+[—–]\s+/g, ", ");

  // 1. Expand inline ISO dates (YYYY-MM-DD)
  out = out.replace(/\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b/g, (match, y, m, d) => {
    return formatCalendarDateParts(Number(d), Number(m), Number(y), language) || match;
  });

  // 2. Expand inline BR dates (DD/MM/YYYY)
  out = out.replace(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2}|19\d{2})\b/g, (match, d, m, y) => {
    return formatCalendarDateParts(Number(d), Number(m), Number(y), language) || match;
  });

  // 3. Expand inline times: HH:MM (avoiding H:M:S timestamps) and HHhMM / HHh
  out = out.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b(?!:\d)/g, (_, h, m) => {
    return formatTimeForSpeech(Number(h), Number(m), language);
  });

  if (language === "pt") {
    out = out.replace(
      /\b([01]?\d|2[0-3])h(?:rs?)?(?:([0-5]\d)(?:\s*min)?|\s+([0-5]\d)\s*min)?\b/gi,
      (_, h, m1, m2) => {
        const mins = m1 ?? m2;
        return formatTimeForSpeech(Number(h), mins ? Number(mins) : 0, "pt");
      }
    );

    // Campus acronyms and institutional terms
    out = out
      .replace(/\bIFPR\b/g, "I F P R")
      .replace(/\bSEPAE\b/g, "S E P A E")
      .replace(/\bSEBAC\b/g, "S E B A C")
      .replace(/\bTAE\b/g, "T A E")
      .replace(/\bQR\s*Code\b/gi, "código Q R")
      .replace(/\bCPF\b/g, "C P F")
      .replace(/\bRG\b/g, "R G")
      .replace(/\bCNH\b/g, "C N H")
      .replace(/\bUSB\b/g, "U S B")
      .replace(/\bHDMI\b/g, "H D M I")
      .replace(/\bPDF\b/g, "P D F")
      // Roman numerals on Campus blocks so TTS says "Bloco 2" instead of "Bloco i i"
      .replace(/\b(Bloco(?:\s+Didático)?)\s+IV\b/gi, "$1 4")
      .replace(/\b(Bloco(?:\s+Didático)?)\s+III\b/gi, "$1 3")
      .replace(/\b(Bloco(?:\s+Didático)?)\s+II\b/gi, "$1 2")
      .replace(/\b(Bloco(?:\s+Didático)?)\s+I\b/gi, "$1 1")
      // Remove leading zero in room/lab numbers ("Sala 01" -> "Sala 1", "Informática 02" -> "Informática 2")
      .replace(
        /\b(Sala|Bloco|Laboratório(?:\s+de\s+[A-Za-zÀ-ÿ]+)?)\s+0([1-9])\b/gi,
        "$1 $2"
      )
      // Common PT-BR abbreviations
      .replace(/\b(?:nº|n°|no\.)\s*/gi, "número ")
      .replace(/\bObs\.?\s*:/gi, "Observação:")
      .replace(/\b(?:Tel|Fone)\.?\s*:/gi, "Telefone:")
      .replace(/\bc\/\s*/gi, "com ")
      .replace(/\bs\/\s*/gi, "sem ")
      .replace(/\s*&\s*/g, " e ")
      // Slash between words ("Cantina / Refeitório", "Portaria/Guarita") -> natural "ou", skipping URLs
      .replace(/(?<![:/.\w])([A-Za-zÀ-ÿ]{2,})\s*\/\s*([A-Za-zÀ-ÿ]{2,})(?![:/.\w])/g, "$1 ou $2");
  } else {
    out = out
      .replace(/\bIFPR\b/g, "I F P R")
      .replace(/\bSEPAE\b/g, "S E P A E")
      .replace(/\bSEBAC\b/g, "S E B A C")
      .replace(/\s*&\s*/g, " and ")
      .replace(/(?<![:/.\w])([A-Za-z]{2,})\s*\/\s*([A-Za-z]{2,})(?![:/.\w])/g, "$1 or $2");
  }

  // Clean up duplicate punctuation and collapse whitespace
  return out
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/([.,;:!?]){2,}/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Splits a long normalized text into natural sentence/clause chunks below maxLength
 * so Chrome/Android SpeechSynthesis never hits the ~15s/long-utterance cutoff bug
 * and maintains natural breathing pauses.
 */
export function splitTextIntoNaturalChunks(
  text: string,
  maxLength = 175
): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxLength) return [cleaned];

  // Split primarily at sentence boundaries
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];

  for (const sentence of sentences) {
    if (sentence.length <= maxLength) {
      const last = chunks[chunks.length - 1];
      if (last && last.length + 1 + sentence.length <= maxLength) {
        chunks[chunks.length - 1] = `${last} ${sentence}`;
      } else {
        chunks.push(sentence);
      }
      continue;
    }

    // Long single sentence: split along clause delimiters (, ; :)
    const clauses = sentence
      .split(/(?<=[,;:])\s+/)
      .map((c) => c.trim())
      .filter(Boolean);

    let buffer = "";
    for (const clause of clauses) {
      if (clause.length > maxLength) {
        if (buffer) {
          chunks.push(buffer);
          buffer = "";
        }
        // Final fallback: split by words
        const words = clause.split(/\s+/);
        let wordBuf = "";
        for (const word of words) {
          if (wordBuf && wordBuf.length + 1 + word.length > maxLength) {
            chunks.push(wordBuf);
            wordBuf = word;
          } else {
            wordBuf = wordBuf ? `${wordBuf} ${word}` : word;
          }
        }
        if (wordBuf) chunks.push(wordBuf);
      } else if (buffer && buffer.length + 1 + clause.length > maxLength) {
        chunks.push(buffer);
        buffer = clause;
      } else {
        buffer = buffer ? `${buffer} ${clause}` : clause;
      }
    }
    if (buffer) chunks.push(buffer);
  }

  return chunks;
}

function ensureTerminalPunctuation(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Builds structured, naturally paced speech chunks for a LostFoundItem.
 * Includes normalized title, status, category, campus location, occurrence date,
 * color, brand, description (sentence-chunked), pickup/contact instructions, and QR tag code.
 */
export function buildItemSpeechChunks(
  item: LostFoundItem,
  language: SupportedLanguage
): SpeechChunk[] {
  const L = (pt: string, en: string) => localize(language, pt, en);

  const itemType =
    item.type === "PERDIDO" ? L("perdido", "lost") : L("encontrado", "found");

  const statusText =
    item.status === "DEVOLVIDO"
      ? L("já devolvido ao proprietário", "already returned to the owner")
      : item.status === "ENCERRADO"
      ? L("registro encerrado", "closed record")
      : item.status === "PROPRIETARIO_IDENTIFICADO"
      ? L("proprietário identificado, aguardando retirada", "owner identified, awaiting pickup")
      : item.status === "EM_ANALISE"
      ? L("em análise na coordenação ou portaria", "under review at the campus office or gatehouse")
      : L("disponível para localização", "available for recovery");

  const normalizedTitle = normalizeTextForSpeech(item.title, language);
  const normalizedCategory = normalizeTextForSpeech(
    translateCategory(item.category, language),
    language
  );
  const normalizedLocation = normalizeTextForSpeech(
    translateCampusLocation(item.location, language),
    language
  );
  const spokenDate = formatDateForSpeech(item.date, language);

  const chunks: SpeechChunk[] = [];

  // 1. Opening + Title
  chunks.push({
    id: "intro-title",
    text: ensureTerminalPunctuation(
      L(
        `Objeto ${itemType}: ${normalizedTitle}`,
        `${itemType === "lost" ? "Lost" : "Found"} item: ${normalizedTitle}`
      )
    ),
    pauseAfterMs: 320,
  });

  // 2. Status + Category
  chunks.push({
    id: "status-category",
    text: `${ensureTerminalPunctuation(
      `${L("Situação atual", "Current status")}: ${statusText}`
    )} ${ensureTerminalPunctuation(
      `${L("Categoria", "Category")}: ${normalizedCategory}`
    )}`,
    pauseAfterMs: 280,
  });

  // 3. Location + Occurrence Date
  const locationParts = [
    ensureTerminalPunctuation(
      `${L("Local no campus", "Campus location")}: ${normalizedLocation}`
    ),
  ];
  if (spokenDate) {
    locationParts.push(
      ensureTerminalPunctuation(
        `${L("Data da ocorrência", "Occurrence date")}: ${spokenDate}`
      )
    );
  }
  chunks.push({
    id: "location-date",
    text: locationParts.join(" "),
    pauseAfterMs: 280,
  });

  // 4. Physical characteristics (Color & Brand)
  const detailParts: string[] = [];
  if (item.color && item.color !== "Não informada" && item.color !== "Not provided") {
    detailParts.push(
      ensureTerminalPunctuation(
        `${L("Cor predominante", "Primary color")}: ${normalizeTextForSpeech(
          translateColor(item.color, language),
          language
        )}`
      )
    );
  }
  if (
    item.brand &&
    item.brand !== "Não identificada" &&
    item.brand !== "Não informada" &&
    item.brand !== "Not provided"
  ) {
    detailParts.push(
      ensureTerminalPunctuation(
        `${L("Marca ou modelo", "Brand or model")}: ${normalizeTextForSpeech(
          item.brand,
          language
        )}`
      )
    );
  }
  if (detailParts.length > 0) {
    chunks.push({
      id: "details",
      text: detailParts.join(" "),
      pauseAfterMs: 260,
    });
  }

  // 5. Description (split cleanly into natural chunks to prevent Android/Chrome cutoffs)
  const normalizedDescription = normalizeTextForSpeech(item.description, language);
  if (normalizedDescription) {
    const descFull = ensureTerminalPunctuation(
      `${L("Descrição", "Description")}: ${normalizedDescription}`
    );
    const descSegments = splitTextIntoNaturalChunks(descFull, 175);
    descSegments.forEach((segment, idx) => {
      chunks.push({
        id: `description-${idx}`,
        text: ensureTerminalPunctuation(segment),
        pauseAfterMs: idx === descSegments.length - 1 ? 320 : 180,
      });
    });
  }

  // 6. Pickup / Contact Instructions
  const normalizedContact = item.contactInfo
    ? normalizeTextForSpeech(item.contactInfo, language)
    : "";
  const contactText = normalizedContact
    ? ensureTerminalPunctuation(
        `${L("Instruções de retirada e contato", "Pickup instructions and contact")}: ${normalizedContact}`
      )
    : L(
        "Para retirada, dirija-se à Portaria Principal ou à Secretaria Acadêmica do I F P R, Campus Ivaiporã.",
        "For pickup, visit the Main Gatehouse or Academic Office at I F P R Campus Ivaiporã."
      );

  const contactSegments = splitTextIntoNaturalChunks(contactText, 175);
  contactSegments.forEach((segment, idx) => {
    chunks.push({
      id: `contact-${idx}`,
      text: ensureTerminalPunctuation(segment),
      pauseAfterMs: idx === contactSegments.length - 1 ? 280 : 160,
    });
  });

  // 7. QR Code Tag ID (paced segment-by-segment)
  const spokenQr = formatQrCodeForSpeech(item.qrCodeId, language);
  if (spokenQr) {
    chunks.push({
      id: "qrcode",
      text: ensureTerminalPunctuation(
        `${L("Código da etiqueta Q R", "Q R tag code")}: ${spokenQr}`
      ),
      pauseAfterMs: 280,
    });
  }

  // 8. Natural closing
  chunks.push({
    id: "closing",
    text: L("Fim da leitura do objeto.", "End of item description."),
    pauseAfterMs: 0,
  });

  return chunks;
}

/**
 * Classifies SpeechSynthesisErrorEvent error codes into benign cancellation vs recoverable/fatal error.
 */
export function isBenignSpeechError(errorCode: string | undefined | null): boolean {
  const code = (errorCode || "").toLowerCase();
  return code === "canceled" || code === "cancelled" || code === "interrupted";
}
