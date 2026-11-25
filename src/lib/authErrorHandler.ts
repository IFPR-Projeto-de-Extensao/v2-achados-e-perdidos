/**
 * Centralized Firebase Authentication Error Handler
 * Localiza+ IFPR (Campus Ivaiporã)
 * 
 * Safely parses and translates Firebase Auth exceptions into user-friendly
 * messages, preventing uncaught errors, silent failures, and React rendering issues.
 */

import { getStoredLanguage, localize, SupportedLanguage } from "./i18n";

export interface ParsedAuthError {
  userMessage: string;
  technicalCode: string;
  isUnauthorizedDomain: boolean;
  isPopupClosed: boolean;
  isPopupBlocked: boolean;
  actionHint?: string;
  currentHost: string;
}

/**
 * Parses any error originating from Firebase Auth operations
 */
export function parseAuthError(error: any, language?: SupportedLanguage): ParsedAuthError {
  const lang: SupportedLanguage = language || getStoredLanguage();
  const l = (pt: string, en: string) => localize(lang, pt, en);

  const code: string = error?.code || (typeof error === "string" ? error : "");
  const rawMessage: string =
    error?.message || (typeof error === "string" ? error : l("Erro de autenticação", "Authentication error"));

  const currentHost =
    typeof window !== "undefined" && window.location?.hostname
      ? window.location.hostname
      : "localizamais.vercel.app";

  const isUnauthorizedDomain = code === "auth/unauthorized-domain" || rawMessage.includes("auth/unauthorized-domain");
  const isPopupClosed = code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request";
  const isPopupBlocked = code === "auth/popup-blocked";

  let userMessage = l(
    "Ocorreu um erro ao processar o acesso. Tente novamente.",
    "An error occurred while signing in. Please try again."
  );
  let actionHint: string | undefined;

  switch (code) {
    case "auth/unauthorized-domain":
      userMessage = l(
        `O domínio '${currentHost}' não está autorizado para autenticação OAuth no Firebase.`,
        `The domain '${currentHost}' is not authorized for Firebase OAuth authentication.`
      );
      actionHint = l(
        `Adicione '${currentHost}' na aba Firebase Console > Authentication > Settings > Authorized domains.`,
        `Add '${currentHost}' in Firebase Console > Authentication > Settings > Authorized domains.`
      );
      break;

    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      userMessage = l(
        "O acesso com Google foi cancelado (janela de autenticação fechada antes de concluir).",
        "Google sign-in was canceled (authentication window was closed before completing)."
      );
      break;

    case "auth/popup-blocked":
      userMessage = l(
        "A janela de acesso do Google foi bloqueada pelo seu navegador.",
        "The Google sign-in window was blocked by your browser."
      );
      actionHint = l(
        "Permita janelas pop-up para este site nas configurações do navegador e tente novamente.",
        "Allow pop-ups for this site in your browser settings and try again."
      );
      break;

    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      userMessage = l(
        "E-mail ou senha incorretos. Verifique suas credenciais e tente novamente.",
        "Incorrect email or password. Check your credentials and try again."
      );
      break;

    case "auth/email-already-in-use":
      userMessage = l(
        "Este e-mail já está cadastrado no sistema. Faça acesso com ele ou use outro e-mail.",
        "This email is already registered in the system. Sign in or use another email."
      );
      break;

    case "auth/weak-password":
      userMessage = l(
        "A senha informada é fraca. Utilize no mínimo 6 caracteres.",
        "The password entered is too weak. Use at least 6 characters."
      );
      break;

    case "auth/invalid-email":
      userMessage = l(
        "O formato do e-mail informado é inválido.",
        "The email format entered is invalid."
      );
      break;

    case "auth/user-disabled":
      userMessage = l(
        "Esta conta de usuário foi desativada pela administração.",
        "This user account has been disabled by administration."
      );
      actionHint = l(
        "Entre em contato com o suporte ou SEBAC do IFPR Campus Ivaiporã.",
        "Contact support or SEBAC at IFPR Campus Ivaiporã."
      );
      break;

    case "auth/too-many-requests":
      userMessage = l(
        "Muitas tentativas consecutivas. O acesso foi bloqueado temporariamente por segurança.",
        "Too many consecutive attempts. Access has been temporarily locked for security."
      );
      actionHint = l(
        "Aguarde alguns instantes antes de tentar novamente.",
        "Wait a few moments before trying again."
      );
      break;

    case "auth/network-request-failed":
      userMessage = l(
        "Falha de conexão com os servidores de autenticação.",
        "Connection failed while reaching authentication servers."
      );
      actionHint = l(
        "Verifique sua conexão com a internet e tente novamente.",
        "Check your internet connection and try again."
      );
      break;

    case "auth/operation-not-allowed":
      userMessage = l(
        "O método de acesso selecionado não está habilitado no Firebase Console.",
        "The selected sign-in method is not enabled in the Firebase Console."
      );
      break;

    case "auth/unauthorized-continue-uri":
    case "auth/invalid-continue-uri":
    case "auth/missing-continue-uri":
      userMessage = l(
        `O domínio de redirecionamento '${currentHost}' não está autorizado no Firebase Authentication para links de e-mail.`,
        `The redirect domain '${currentHost}' is not authorized in Firebase Authentication for email links.`
      );
      actionHint = l(
        `Adicione '${currentHost}' em Firebase Console > Authentication > Settings > Authorized domains.`,
        `Add '${currentHost}' in Firebase Console > Authentication > Settings > Authorized domains.`
      );
      break;

    case "auth/expired-action-code":
      userMessage = l(
        "Este link de definição/redefinição de senha expirou ou já foi utilizado.",
        "This password setup/reset link has expired or has already been used."
      );
      actionHint = l(
        "Solicite um novo link em 'Esqueceu a senha?' ou peça ao administrador para reenviar o primeiro acesso.",
        "Request a new link via 'Forgot password?' or ask an administrator to resend the first-access link."
      );
      break;

    case "auth/invalid-action-code":
      userMessage = l(
        "O link de acesso é inválido ou já foi utilizado anteriormente.",
        "This access link is invalid or has already been used."
      );
      actionHint = l(
        "Solicite um novo e-mail de definição ou recuperação de senha.",
        "Request a new password setup or recovery email."
      );
      break;

    case "auth/user-token-expired":
    case "auth/requires-recent-login":
      userMessage = l(
        "Sua sessão expirou. Faça login novamente para continuar.",
        "Your session has expired. Please sign in again to continue."
      );
      break;

    default:
      if (isUnauthorizedDomain) {
        userMessage = l(
          `O domínio '${currentHost}' não está autorizado para autenticação OAuth no Firebase.`,
          `The domain '${currentHost}' is not authorized for Firebase OAuth authentication.`
        );
        actionHint = l(
          `Adicione '${currentHost}' em Firebase Console > Authentication > Settings > Authorized domains.`,
          `Add '${currentHost}' in Firebase Console > Authentication > Settings > Authorized domains.`
        );
      } else if (rawMessage && !rawMessage.startsWith("FirebaseError:")) {
        userMessage = rawMessage;
      }
      break;
  }

  return {
    userMessage,
    technicalCode: code || "auth/unknown",
    isUnauthorizedDomain,
    isPopupClosed,
    isPopupBlocked,
    actionHint,
    currentHost,
  };
}

/**
 * Handles authentication errors uniformly, dispatching appropriate toasts and returning the formatted message.
 */
export function handleAuthError(
  error: any,
  options?: {
    addToast?: (message: string, type: "success" | "error" | "info" | "warning") => void;
    showToastForUserCancellation?: boolean;
    language?: SupportedLanguage;
  }
): ParsedAuthError {
  const lang: SupportedLanguage = options?.language || getStoredLanguage();
  const parsed = parseAuthError(error, lang);

  if (options?.addToast) {
    if (parsed.isUnauthorizedDomain) {
      options.addToast(
        localize(
          lang,
          `Domínio '${parsed.currentHost}' não autorizado no Firebase. Adicione-o em Authentication > Domínios Autorizados.`,
          `Domain '${parsed.currentHost}' is not authorized in Firebase. Add it under Authentication > Authorized Domains.`
        ),
        "error"
      );
    } else if (parsed.isPopupClosed) {
      if (options.showToastForUserCancellation) {
        options.addToast(parsed.userMessage, "info");
      }
    } else if (parsed.isPopupBlocked) {
      options.addToast(
        localize(
          lang,
          "Pop-up de acesso bloqueado pelo navegador. Habilite janelas pop-up para continuar.",
          "Sign-in pop-up blocked by your browser. Enable pop-ups to continue."
        ),
        "warning"
      );
    } else {
      options.addToast(parsed.userMessage, "error");
    }
  }

  return parsed;
}
