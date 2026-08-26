import React, { useEffect, useRef } from "react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../context/RouterContext";
import { vibrateWarning } from "../lib/utils";
import { User } from "../types";

export interface UseAdminGuardOptions {
  /**
   * Path to redirect unauthorized users to. Default: "/"
   */
  redirectTo?: string;
  /**
   * Whether to display an informative toast warning on unauthorized access attempt. Default: true
   */
  showToast?: boolean;
  /**
   * Custom message for the unauthorized access toast.
   */
  customToastMessage?: string;
  /**
   * Whether to perform automatic redirection or only report authorization status. Default: true
   */
  autoRedirect?: boolean;
}

export interface AdminGuardState {
  isAdmin: boolean;
  isAuthLoading: boolean;
  authorized: boolean;
  currentUser: User;
}

/**
 * Centralized React Hook for route protection: verifies admin permissions before rendering administrative views.
 * Automatically redirects unauthorized users to the home page (or configured route) with an informative toast message.
 */
export function useAdminGuard(options: UseAdminGuardOptions = {}): AdminGuardState {
  const {
    currentUser,
    isAuthLoading,
    authLoading,
    addToast,
  } = useApp();

  const { navigate } = useRouter();
  const hasRedirectedRef = useRef(false);

  const {
    redirectTo = "/",
    showToast = true,
    customToastMessage = "Acesso restrito: O Painel Administrativo é de uso exclusivo para servidores e administradores do IFPR Campus Ivaiporã.",
    autoRedirect = true,
  } = options;

  const effectiveLoading = isAuthLoading || authLoading;
  const isAdmin = currentUser && currentUser.role === "ADMIN";
  const authorized = !effectiveLoading && Boolean(isAdmin);

  useEffect(() => {
    if (effectiveLoading) return;

    if (!isAdmin && autoRedirect && !hasRedirectedRef.current) {
      hasRedirectedRef.current = true;
      vibrateWarning();

      if (showToast) {
        addToast(customToastMessage, "error");
      }

      navigate(redirectTo, { replace: true });
    }
  }, [effectiveLoading, isAdmin, autoRedirect, redirectTo, showToast, customToastMessage, addToast, navigate]);

  return {
    isAdmin: Boolean(isAdmin),
    isAuthLoading: effectiveLoading,
    authorized,
    currentUser,
  };
}

/**
 * Higher-Order Component 'withAdminProtection' that wraps administrative components.
 * It verifies in AppContext if the current user has the 'ADMIN' permission role.
 * If unauthorized, it redirects the user to the home page ('/') via navigate from RouterContext.
 */
export function withAdminProtection<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options?: UseAdminGuardOptions
): React.FC<P> {
  const ProtectedComponent: React.FC<P> = (props) => {
    const { authorized, isAuthLoading } = useAdminGuard({
      redirectTo: "/",
      showToast: true,
      autoRedirect: true,
      ...options,
    });

    if (isAuthLoading) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4 py-12">
          <div className="w-12 h-12 border-4 border-[#00843D] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-bold text-neutral-600 dark:text-neutral-400">
            Verificando credenciais institucionais do IFPR...
          </p>
        </div>
      );
    }

    if (!authorized) {
      return null;
    }

    return <WrappedComponent {...props} />;
  };

  ProtectedComponent.displayName = `withAdminProtection(${
    WrappedComponent.displayName || WrappedComponent.name || "Component"
  })`;

  return ProtectedComponent;
}

/**
 * Alias for withAdminProtection for backward compatibility
 */
export const withAdminGuard = withAdminProtection;
