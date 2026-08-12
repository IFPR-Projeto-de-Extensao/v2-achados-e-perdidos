import { useState, useCallback } from "react";
import { LostFoundItem } from "../types";

export interface PossessionVerificationState {
  hiddenChallengePrompt: string;
  isVerified: boolean;
  score: number;
  verificationToken: string | null;
  errorMessage: string | null;
  failedAttempts: number;
  isLocked: boolean;
  verifyPossession: (
    passwordOrSecret: string,
    brandDetails?: string,
    hiddenFeatures?: string
  ) => boolean;
  verifyProof: (
    brandDetails: string,
    hiddenFeatures: string,
    secretQuestionAnswer?: string
  ) => boolean;
  resetVerification: () => void;
}

export function usePossessionVerification(item: LostFoundItem): PossessionVerificationState {
  const [isVerified, setIsVerified] = useState(false);
  const [score, setScore] = useState(0);
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);

  // Dynamic RNF04 challenge prompt based on item details & category
  const catLower = (item.category || "").toLowerCase();
  const hiddenChallengePrompt = item.secretVerificationHint
    ? `Pergunta Secreta do Cadastrador: "${item.secretVerificationHint}"`
    : catLower.includes("eletrôn")
    ? "Forneça a senha do dispositivo, PIN, número de série (S/N) ou padrão de desbloqueio."
    : catLower.includes("document")
    ? "Informe o número do documento (RG, CPF ou Matrícula IFPR) ou o nome impresso."
    : catLower.includes("chave")
    ? "Descreva a marca da chave, cor do chaveiro ou palavra gravada na argola."
    : catLower.includes("roupa")
    ? "Informe a marca da etiqueta interna, tamanho (P/M/G) ou defeito/marca oculta de uso."
    : "Descreva a senha, número de série ou detalhe único (marca oculta / conteúdo interno).";

  // RNF04: Primary verification forcing password, serial number, or secret unique detail
  const verifyPossession = useCallback(
    (passwordOrSecret: string, brandDetails = "", hiddenFeatures = ""): boolean => {
      setErrorMessage(null);

      if (isLocked) {
        setErrorMessage("⚠️ Acesso bloqueado por excesso de tentativas incorretas. Tente novamente mais tarde.");
        return false;
      }

      const cleanSecret = passwordOrSecret.trim().toLowerCase();
      const cleanBrand = brandDetails.trim().toLowerCase();
      const cleanFeatures = hiddenFeatures.trim().toLowerCase();

      if (!cleanSecret && !cleanBrand && !cleanFeatures) {
        setErrorMessage("Por favor, forneça a senha, número de série ou detalhe único do objeto.");
        return false;
      }

      // Check against registered secret key if defined
      const registeredKey = (item.secretVerificationKey || "").trim().toLowerCase();
      const registeredHint = (item.secretVerificationHint || "").trim().toLowerCase();
      const registeredBrand = (item.brand || "").trim().toLowerCase();
      const itemDesc = (item.description || "").trim().toLowerCase();

      let isMatch = false;
      let calculatedScore = 50;

      // 1. Direct match with registered secret password/serial number
      if (registeredKey && cleanSecret === registeredKey) {
        isMatch = true;
        calculatedScore = 100;
      } else if (cleanSecret.length >= 3 && (registeredKey.includes(cleanSecret) || cleanSecret.includes(registeredKey))) {
        if (registeredKey) {
          isMatch = true;
          calculatedScore = 90;
        }
      }

      // 2. Secret hint / challenge match
      if (!isMatch && registeredHint && cleanSecret.length >= 3 && registeredHint.includes(cleanSecret)) {
        isMatch = true;
        calculatedScore = 85;
      }

      // 3. Brand or unique detail matching
      if (!isMatch) {
        const fullInput = `${cleanSecret} ${cleanBrand} ${cleanFeatures}`;
        const inputWords = fullInput.split(/\s+/).filter((w) => w.length >= 3);

        let matches = 0;
        for (const word of inputWords) {
          if (registeredBrand.includes(word) || itemDesc.includes(word) || item.title.toLowerCase().includes(word)) {
            matches++;
          }
        }

        if (cleanSecret.length >= 4 || cleanFeatures.length >= 10) {
          if (matches > 0 || cleanSecret.length >= 5) {
            isMatch = true;
            calculatedScore = Math.min(95, 60 + matches * 15);
          }
        }
      }

      if (!isMatch) {
        const newFailed = failedAttempts + 1;
        setFailedAttempts(newFailed);
        if (newFailed >= 3) {
          setIsLocked(true);
          setErrorMessage("🚫 FRAUDE PREVENIDA (RNF04): 3 tentativas incorretas. O processo foi bloqueado para segurança.");
        } else {
          setErrorMessage(`A senha ou detalhe único fornecido não confere (${newFailed}/3 tentativas).`);
        }
        setIsVerified(false);
        return false;
      }

      // Successful verification
      const generatedToken = `RNF04-TOKEN-${item.id.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()}-${Date.now().toString(36)}-POSSE_VALIDADA`;

      setScore(calculatedScore);
      setIsVerified(true);
      setVerificationToken(generatedToken);
      setErrorMessage(null);
      return true;
    },
    [item, failedAttempts, isLocked]
  );

  // Backward-compatible verifyProof method
  const verifyProof = useCallback(
    (brandDetails: string, hiddenFeatures: string, secretQuestionAnswer?: string): boolean => {
      const secretInput = secretQuestionAnswer || brandDetails;
      return verifyPossession(secretInput, brandDetails, hiddenFeatures);
    },
    [verifyPossession]
  );

  const resetVerification = useCallback(() => {
    setIsVerified(false);
    setScore(0);
    setVerificationToken(null);
    setErrorMessage(null);
    setFailedAttempts(0);
    setIsLocked(false);
  }, []);

  return {
    hiddenChallengePrompt,
    isVerified,
    score,
    verificationToken,
    errorMessage,
    failedAttempts,
    isLocked,
    verifyPossession,
    verifyProof,
    resetVerification,
  };
}

// Alias for backward compatibility
export const useOwnershipVerification = usePossessionVerification;
