/**
 * Centralized Firebase Authentication Error Handler
 * Localiza+ IFPR (Campus Ivaiporã)
 * 
 * Safely parses and translates Firebase Auth exceptions into user-friendly
 * messages, preventing uncaught errors, silent failures, and React rendering issues.
 */

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
export function parseAuthError(error: any): ParsedAuthError {
  const code: string = error?.code || (typeof error === "string" ? error : "");
  const rawMessage: string = error?.message || (typeof error === "string" ? error : "Erro de autenticação");
  
  const currentHost = typeof window !== "undefined" && window.location.hostname
    ? window.location.hostname
    : "localizamais.vercel.app";

  const isUnauthorizedDomain = code === "auth/unauthorized-domain" || rawMessage.includes("auth/unauthorized-domain");
  const isPopupClosed = code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request";
  const isPopupBlocked = code === "auth/popup-blocked";

  let userMessage = "Ocorreu um erro ao processar o login. Tente novamente.";
  let actionHint: string | undefined;

  switch (code) {
    case "auth/unauthorized-domain":
      userMessage = `O domínio '${currentHost}' não está autorizado para autenticação OAuth no Firebase.`;
      actionHint = `Adicione '${currentHost}' na aba Firebase Console > Authentication > Settings > Authorized domains.`;
      break;

    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      userMessage = "O login com Google foi cancelado (janela de autenticação fechada antes de concluir).";
      break;

    case "auth/popup-blocked":
      userMessage = "A janela de login do Google foi bloqueada pelo seu navegador.";
      actionHint = "Permita pop-ups para este site nas configurações do navegador e tente novamente.";
      break;

    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      userMessage = "E-mail ou senha incorretos. Verifique suas credenciais e tente novamente.";
      break;

    case "auth/email-already-in-use":
      userMessage = "Este e-mail já está cadastrado no sistema. Faça login ou use outro e-mail.";
      break;

    case "auth/weak-password":
      userMessage = "A senha informada é fraca. Utilize no mínimo 6 caracteres.";
      break;

    case "auth/invalid-email":
      userMessage = "O formato do e-mail informado é inválido.";
      break;

    case "auth/user-disabled":
      userMessage = "Esta conta de usuário foi desativada pela administração.";
      actionHint = "Entre em contato com o suporte ou SEBAC do IFPR Campus Ivaiporã.";
      break;

    case "auth/too-many-requests":
      userMessage = "Muitas tentativas consecutivas. O acesso foi bloqueado temporariamente por segurança.";
      actionHint = "Aguarde alguns instantes antes de tentar novamente.";
      break;

    case "auth/network-request-failed":
      userMessage = "Falha de conexão com os servidores de autenticação.";
      actionHint = "Verifique sua conexão com a internet e tente novamente.";
      break;

    case "auth/operation-not-allowed":
      userMessage = "O método de login selecionado não está habilitado no Firebase Console.";
      break;

    default:
      if (isUnauthorizedDomain) {
        userMessage = `O domínio '${currentHost}' não está autorizado para autenticação OAuth no Firebase.`;
        actionHint = `Adicione '${currentHost}' em Firebase Console > Authentication > Settings > Authorized domains.`;
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
  }
): ParsedAuthError {
  const parsed = parseAuthError(error);

  if (options?.addToast) {
    if (parsed.isUnauthorizedDomain) {
      options.addToast(
        `Domínio '${parsed.currentHost}' não autorizado no Firebase. Adicione-o em Authentication > Domínios Autorizados.`,
        "error"
      );
    } else if (parsed.isPopupClosed) {
      if (options.showToastForUserCancellation) {
        options.addToast(parsed.userMessage, "info");
      }
    } else if (parsed.isPopupBlocked) {
      options.addToast("Pop-up de login bloqueado pelo navegador. Habilite pop-ups para continuar.", "warning");
    } else {
      options.addToast(parsed.userMessage, "error");
    }
  }

  return parsed;
}
