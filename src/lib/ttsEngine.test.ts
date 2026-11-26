import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  SpeechSynthesisVoiceLike,
  normalizeBcp47,
  rankVoicesForLanguage,
  selectBestVoice,
  selectFallbackVoice,
  getProsodyConfig,
  formatDateForSpeech,
  formatTimeForSpeech,
  formatQrCodeForSpeech,
  normalizeTextForSpeech,
  splitTextIntoNaturalChunks,
  buildItemSpeechChunks,
  claimGlobalSpeechSession,
  getGlobalSpeechSession,
  invalidateGlobalSpeechSession,
  isBenignSpeechError,
  SUPPORTED_SPEECH_RATES,
} from "./ttsEngine";
import type { LostFoundItem } from "../types";

const SAMPLE_ITEM: LostFoundItem = {
  id: "item-tts-1",
  title: "Garrafa Térmica Stanley 750ml",
  category: "Garrafas & Marmitas",
  type: "ENCONTRADO",
  status: "ENCONTRADO",
  description:
    "Encontrada em 26/11/2026 às 14h30 no Laboratório de Informática 01, Bloco Didático II do IFPR. Possui adesivo azul c/ iniciais M.A. e pequena marca na tampa. Obs.: entregue na SEPAE às 15:05.",
  color: "Azul",
  brand: "Stanley",
  location: "Laboratório de Informática 01",
  date: "2026-11-26",
  imageUrl: "https://example.com/garrafa.jpg",
  contactInfo: "SEBAC / Portaria Principal (08:00 às 17:30)",
  registeredByUserId: "u-serv-1",
  registeredByName: "Servidor Teste",
  registeredByRole: "SERVIDOR",
  qrCodeId: "IFPR-IVA-2026-0042",
  createdAt: "2026-11-26T14:40:00.000Z",
};

describe("TTS Engine — Neural Voice Selection, Pronunciation & Resilience", () => {
  describe("1. Normalização BCP-47 e seleção de vozes pt-BR (Android Chrome, Edge, Apple)", () => {
    it("normaliza tags com underscore do Android (pt_BR -> pt-br)", () => {
      expect(normalizeBcp47("pt_BR")).toBe("pt-br");
      expect(normalizeBcp47("pt-BR")).toBe("pt-br");
      expect(normalizeBcp47("EN_us")).toBe("en-us");
      expect(normalizeBcp47("")).toBe("");
    });

    it("prioriza voz neural Google pt_BR no Android Chrome sobre eSpeak, Pico, Samsung e pt-PT", () => {
      const androidChromeVoices: SpeechSynthesisVoiceLike[] = [
        { name: "eSpeak Portuguese (Brazil)", lang: "pt_BR", voiceURI: "espeak-pt-br", localService: true, default: true },
        { name: "Pico TTS", lang: "pt_BR", voiceURI: "pico-pt-br", localService: true },
        { name: "Portuguese (Portugal)", lang: "pt_PT", voiceURI: "pt-pt-x-jfb-network", localService: false },
        { name: "Samsung Brazilian Portuguese", lang: "pt_BR", voiceURI: "smt-pt-br", localService: true },
        { name: "Google português do Brasil", lang: "pt_BR", voiceURI: "pt-br-x-ptd-local", localService: true },
        { name: "Google português do Brasil", lang: "pt_BR", voiceURI: "pt-br-x-ptd-network", localService: false },
      ];

      const selectedOnline = selectBestVoice(androidChromeVoices, "pt", { isOnline: true });
      expect(selectedOnline.voice?.voiceURI).toBe("pt-br-x-ptd-network");
      expect(selectedOnline.tier).toBe("neural");
      expect(selectedOnline.hasTargetLanguageVoice).toBe(true);
      // Fallback automático deve ser a voz local Google (e nunca eSpeak)
      expect(selectedOnline.fallbackVoice?.voiceURI).toBe("pt-br-x-ptd-local");
      expect(selectedOnline.fallbackVoice?.localService).toBe(true);
    });

    it("em modo offline prioriza a melhor voz local pt-BR (Google on-device) em vez da voz somente em rede", () => {
      const androidVoices: SpeechSynthesisVoiceLike[] = [
        { name: "Google português do Brasil", lang: "pt_BR", voiceURI: "pt-br-x-ptd-network", localService: false },
        { name: "Google português do Brasil", lang: "pt_BR", voiceURI: "pt-br-x-ptd-local", localService: true },
        { name: "eSpeak pt-BR", lang: "pt-BR", voiceURI: "espeak-pt", localService: true },
      ];

      const selectedOffline = selectBestVoice(androidVoices, "pt", { isOnline: false });
      expect(selectedOffline.voice?.voiceURI).toBe("pt-br-x-ptd-local");
      expect(selectedOffline.isLocal).toBe(true);
    });

    it("prioriza vozes Microsoft Azure Natural (Francisca/Antonio) no Edge sobre SAPI5 Maria", () => {
      const edgeVoices: SpeechSynthesisVoiceLike[] = [
        { name: "Microsoft Maria - Portuguese (Brazil)", lang: "pt-BR", voiceURI: "ms-maria", localService: true, default: true },
        { name: "Microsoft Daniel - Portuguese (Brazil)", lang: "pt-BR", voiceURI: "ms-daniel", localService: true },
        { name: "Microsoft Francisca Online (Natural) - Portuguese (Brazil)", lang: "pt-BR", voiceURI: "ms-francisca-natural", localService: false },
      ];

      const selected = selectBestVoice(edgeVoices, "pt", { isOnline: true });
      expect(selected.voice?.voiceURI).toBe("ms-francisca-natural");
      expect(selected.tier).toBe("neural");
      expect(selected.fallbackVoice?.localService).toBe(true);
    });

    it("prioriza Luciana Enhanced no iOS/macOS e rejeita vozes novelty/robóticas", () => {
      const appleVoices: SpeechSynthesisVoiceLike[] = [
        { name: "Zarvox", lang: "pt-BR", voiceURI: "zarvox", localService: true },
        { name: "Luciana (Compact)", lang: "pt-BR", voiceURI: "luciana-compact", localService: true },
        { name: "Luciana (Enhanced)", lang: "pt-BR", voiceURI: "luciana-enhanced", localService: true },
      ];

      const ranked = rankVoicesForLanguage(appleVoices, "pt", { isOnline: true });
      expect(ranked[0].voice.voiceURI).toBe("luciana-enhanced");
      expect(ranked[ranked.length - 1].voice.voiceURI).toBe("zarvox");
    });

    it("degrada com segurança quando nenhuma voz preferencial ou pt-BR está disponível", () => {
      const englishOnly: SpeechSynthesisVoiceLike[] = [
        { name: "Google US English", lang: "en-US", voiceURI: "en-us", localService: false },
      ];

      const selectedNone = selectBestVoice(englishOnly, "pt");
      expect(selectedNone.voice).toBeNull();
      expect(selectedNone.tier).toBe("default");
      expect(selectedNone.hasTargetLanguageVoice).toBe(false);
      expect(selectedNone.normalizedLang).toBe("pt-br");

      const selectedEmpty = selectBestVoice([], "pt");
      expect(selectedEmpty.voice).toBeNull();
      expect(selectedEmpty.availableTargetVoices).toBe(0);
    });

    it("seleciona voz alternativa local quando a voz preferencial falha em tempo de execução", () => {
      const voices: SpeechSynthesisVoiceLike[] = [
        { name: "Google português do Brasil", lang: "pt-BR", voiceURI: "net-1", localService: false },
        { name: "Google português do Brasil", lang: "pt-BR", voiceURI: "local-1", localService: true },
        { name: "Samsung Brazilian Portuguese", lang: "pt-BR", voiceURI: "samsung-1", localService: true },
      ];

      const fallback1 = selectFallbackVoice(voices, "pt", ["net-1"], true);
      expect(fallback1?.voiceURI).toBe("local-1");

      const fallback2 = selectFallbackVoice(voices, "pt", ["net-1", "local-1"], true);
      expect(fallback2?.voiceURI).toBe("samsung-1");

      const fallbackNone = selectFallbackVoice(voices, "pt", ["net-1", "local-1", "samsung-1"], true);
      expect(fallbackNone).toBeNull();
    });
  });

  describe("2. Calibração de velocidades (0.8x, 1x, 1.25x), entonação e volume", () => {
    it("mantém as três velocidades suportadas estritamente crescentes, sem aceleração robótica", () => {
      expect(SUPPORTED_SPEECH_RATES).toEqual([0.8, 1.0, 1.25]);

      const slow = getProsodyConfig(0.8, "neural");
      const normal = getProsodyConfig(1.0, "neural");
      const fast = getProsodyConfig(1.25, "neural");

      expect(slow.rate).toBeLessThan(normal.rate);
      expect(normal.rate).toBeLessThan(fast.rate);
      expect(slow.pitch).toBe(1.0);
      expect(normal.pitch).toBe(1.0);
      expect(fast.pitch).toBe(1.0);
      expect(normal.volume).toBe(1.0);
      // 1x calibrado levemente abaixo de 1.0 para evitar fala apressada no Android Chrome
      expect(normal.rate).toBeGreaterThanOrEqual(0.92);
      expect(normal.rate).toBeLessThanOrEqual(1.0);
    });
  });

  describe("3. Normalização de pronúncia para português brasileiro e inglês", () => {
    it("formata datas ISO e BR naturalmente em português (incluindo dia primeiro) e inglês", () => {
      expect(formatDateForSpeech("2026-11-26", "pt")).toBe("26 de novembro de 2026");
      expect(formatDateForSpeech("2026-05-01", "pt")).toBe("primeiro de maio de 2026");
      expect(formatDateForSpeech("01/01/2026", "pt")).toBe("primeiro de janeiro de 2026");
      expect(formatDateForSpeech("2026-11-26", "en")).toBe("November 26, 2026");
    });

    it("formata horários naturalmente (singular/plural) sem falsos positivos", () => {
      expect(formatTimeForSpeech(14, 30, "pt")).toBe("14 horas e 30 minutos");
      expect(formatTimeForSpeech(8, 0, "pt")).toBe("8 horas");
      expect(formatTimeForSpeech(1, 0, "pt")).toBe("1 hora");
      expect(formatTimeForSpeech(12, 1, "pt")).toBe("12 horas e 1 minuto");
      expect(formatTimeForSpeech(14, 30, "en")).toBe("2:30 PM");

      // Não deve capturar "15" como minutos em "às 14h 15 pessoas"
      const normalized = normalizeTextForSpeech("Visto às 14h 15 pessoas no pátio", "pt");
      expect(normalized).toBe("Visto às 14 horas 15 pessoas no pátio");
    });

    it("normaliza siglas do IFPR, blocos romanos, salas, símbolos, acentuação e emojis", () => {
      const raw =
        "📌 Achado em 26/11/2026 às 14h30 no Laboratório de Informática 01, Bloco Didático II do IFPR. Documentos & Cartões c/ capa azul na Cantina / Refeitório. Obs.: sala nº 05, SEPAE, ação rápida!";
      const normalized = normalizeTextForSpeech(raw, "pt");

      expect(normalized).toContain("26 de novembro de 2026");
      expect(normalized).toContain("14 horas e 30 minutos");
      expect(normalized).toContain("Laboratório de Informática 1");
      expect(normalized).toContain("Bloco Didático 2");
      expect(normalized).toContain("I F P R");
      expect(normalized).toContain("Documentos e Cartões");
      expect(normalized).toContain("com capa azul");
      expect(normalized).toContain("Cantina ou Refeitório");
      expect(normalized).toContain("Observação:");
      expect(normalized).toContain("número 05");
      expect(normalized).toContain("S E P A E");
      expect(normalized).toContain("ação rápida!");
      expect(normalized).not.toContain("📌");
    });

    it("preserva URLs sem substituir barras por 'ou'", () => {
      const normalized = normalizeTextForSpeech("Veja https://ifpr.edu.br/ivaipora para detalhes.", "pt");
      expect(normalized).toContain("https://ifpr.edu.br/ivaipora");
    });

    it("soletra códigos QR por blocos claros para compreensão auditiva", () => {
      expect(formatQrCodeForSpeech("IFPR-IVA-2026-0042", "pt")).toBe(
        "I F P R, I V A, 2026, 0 0 4 2"
      );
      expect(formatQrCodeForSpeech("LOC-A3F9", "pt")).toBe("L O C, A 3 F 9");
    });

    it("fragmenta descrições longas em blocos naturais <= 175 caracteres evitando cortes no Android Chrome", () => {
      const longDesc =
        "Mochila impermeável preta encontrada próxima à entrada da biblioteca central durante o intervalo da tarde. Contém dois cadernos universitários de capa dura, um estojo cinza com canetas esferográficas azuis, uma calculadora científica Casio e um carregador portátil com cabo tipo C. O zíper frontal possui um chaveiro verde do curso de Engenharia de Software.";
      const chunks = splitTextIntoNaturalChunks(longDesc, 175);

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(175);
      }
      expect(chunks.join(" ")).toContain("Engenharia de Software.");
    });

    it("monta roteiro completo de fala com data, local, categoria, descrição, contato e código QR em PT-BR e EN-US", () => {
      const chunksPt = buildItemSpeechChunks(SAMPLE_ITEM, "pt");
      const fullPt = chunksPt.map((c) => c.text).join(" ");

      expect(chunksPt.length).toBeGreaterThanOrEqual(6);
      expect(fullPt).toContain("Objeto encontrado: Garrafa Térmica Stanley 750ml.");
      expect(fullPt).toContain("Categoria: Garrafas e Marmitas.");
      expect(fullPt).toContain("Local no campus: Laboratório de Informática 1.");
      expect(fullPt).toContain("Data da ocorrência: 26 de novembro de 2026.");
      expect(fullPt).toContain("14 horas e 30 minutos");
      expect(fullPt).toContain("I F P R, I V A, 2026, 0 0 4 2");

      const chunksEn = buildItemSpeechChunks(SAMPLE_ITEM, "en");
      const fullEn = chunksEn.map((c) => c.text).join(" ");
      expect(fullEn).toContain("Found item: Garrafa Térmica Stanley 750ml.");
      expect(fullEn).toContain("Occurrence date: November 26, 2026.");
      expect(fullEn).toContain("End of item description.");
    });
  });

  describe("4. Controle de concorrência, classificação de erros e integridade de UI/ItemDetailModal", () => {
    it("garante sessão global monotônica para impedir leituras simultâneas", () => {
      const s1 = claimGlobalSpeechSession();
      expect(getGlobalSpeechSession()).toBe(s1);
      const s2 = claimGlobalSpeechSession();
      expect(s2).toBeGreaterThan(s1);
      const s3 = invalidateGlobalSpeechSession();
      expect(s3).toBeGreaterThan(s2);
    });

    it("distingue erros benignos de interrupção/cancelamento de falhas reais de síntese", () => {
      expect(isBenignSpeechError("canceled")).toBe(true);
      expect(isBenignSpeechError("cancelled")).toBe(true);
      expect(isBenignSpeechError("interrupted")).toBe(true);
      expect(isBenignSpeechError("synthesis-failed")).toBe(false);
      expect(isBenignSpeechError("network")).toBe(false);
      expect(isBenignSpeechError("voice-unavailable")).toBe(false);
    });

    it("preserva integralmente layout, acessibilidade, cleanup ao fechar e integração em ItemDetailModal", () => {
      const readerSrc = fs.readFileSync(
        path.resolve(process.cwd(), "src/components/AccessibleVoiceReader.tsx"),
        "utf-8"
      );
      const modalSrc = fs.readFileSync(
        path.resolve(process.cwd(), "src/components/ItemDetailModal.tsx"),
        "utf-8"
      );

      // Layout e controles preservados
      expect(readerSrc).toContain("Ouvir Descrição");
      expect(readerSrc).toContain("SUPPORTED_SPEECH_RATES");
      expect(readerSrc).toContain("aria-pressed={speechRate === rate}");
      expect(readerSrc).toContain("motion-reduce:animate-none");
      expect(readerSrc).toContain('role="alert"');

      // Correção do closure stale de velocidade e interrupção imediata ao desmontar/fechar
      expect(readerSrc).toContain("rateRef.current = newRate");
      expect(readerSrc).toContain("startPlaybackFrom(chunkIndexRef.current, newRate)");
      expect(readerSrc).toContain('window.addEventListener("pagehide", handlePageHide)');
      expect(readerSrc).toContain("cancelSynthesisNow(false)");
      expect(readerSrc).toContain("selectFallbackVoice");

      // Zero regressão na tela de detalhes
      expect(modalSrc).toContain("<AccessibleVoiceReader item={currentItem} />");
    });
  });
});
