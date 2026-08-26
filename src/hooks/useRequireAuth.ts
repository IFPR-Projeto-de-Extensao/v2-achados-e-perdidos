import { useEffect } from "react";
import { useApp } from "../context/AppContext";
import { LostFoundItem, AppTab } from "../types";

export interface UseRequireAuthOptions {
  redirectOnUnauth?: boolean;
  targetTab?: AppTab;
  customMessage?: string;
  registerType?: "PERDIDO" | "ENCONTRADO";
  prefilledItem?: Partial<LostFoundItem> | null;
}

/**
 * Hook de verificação de autenticação para proteção de telas e ações restritas.
 * Redireciona usuários não autenticados (visitantes) para o modal de login institucional,
 * preservando a intenção de navegação e preenchimento de formulário após o login bem-sucedido.
 * A segurança real de gravação permanece protegida no backend via Firestore Security Rules.
 */
export function useRequireAuth(options: UseRequireAuthOptions = {}) {
  const {
    currentUser,
    firebaseUser,
    isGuest,
    isAuthenticated,
    isAuthLoading,
    setAuthModalOpen,
    setPendingPostLoginAction,
    requestAuthForRegistration,
    addToast,
  } = useApp();

  const {
    redirectOnUnauth = true,
    targetTab = "register",
    customMessage = "Apenas usuários autenticados podem cadastrar novos itens. Faça login ou crie sua conta.",
    registerType,
    prefilledItem,
  } = options;

  useEffect(() => {
    if (!isAuthLoading && isGuest && redirectOnUnauth) {
      setPendingPostLoginAction({
        action: "REGISTER_ITEM",
        tab: targetTab,
        registerType,
        prefilledItem,
        customMessage,
        message: customMessage,
      });
      setAuthModalOpen(true);
    }
  }, [
    isAuthLoading,
    isGuest,
    redirectOnUnauth,
    targetTab,
    registerType,
    prefilledItem,
    customMessage,
    setPendingPostLoginAction,
    setAuthModalOpen,
  ]);

  const requireAuth = (
    type?: "PERDIDO" | "ENCONTRADO",
    itemToPrefill?: Partial<LostFoundItem> | null,
    customMsg?: string
  ): boolean => {
    return requestAuthForRegistration(
      type || registerType,
      itemToPrefill || prefilledItem,
      customMsg || customMessage
    );
  };

  return {
    isAuthenticated,
    isGuest,
    isAuthLoading,
    currentUser,
    firebaseUser,
    requireAuth,
  };
}
