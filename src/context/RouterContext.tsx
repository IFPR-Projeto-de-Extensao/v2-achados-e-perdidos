import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { parseCurrentRoute, ParsedRoute, AppRouteKey, AdminSubTab, ROUTES } from "../lib/routes";

interface RouterContextType extends ParsedRoute {
  navigate: (to: string, options?: { replace?: boolean; state?: any; smoothScroll?: boolean }) => void;
  goBack: () => void;
}

const RouterContext = createContext<RouterContextType | undefined>(undefined);

export const RouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [routeState, setRouteState] = useState<ParsedRoute>(() => {
    if (typeof window === "undefined") {
      return parseCurrentRoute("/");
    }
    return parseCurrentRoute(window.location.pathname, window.location.search);
  });

  // Keep state in sync with browser navigation (Back, Forward, initial load)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleLocationChange = () => {
      const parsed = parseCurrentRoute(window.location.pathname, window.location.search);
      setRouteState(parsed);
    };

    window.addEventListener("popstate", handleLocationChange);
    return () => {
      window.removeEventListener("popstate", handleLocationChange);
    };
  }, []);

  const navigate = useCallback(
    (to: string, options?: { replace?: boolean; state?: any; smoothScroll?: boolean }) => {
      if (typeof window === "undefined") return;

      const targetUrl = new URL(to, window.location.origin);
      const targetPath = targetUrl.pathname + targetUrl.search;

      if (options?.replace) {
        window.history.replaceState(options.state || {}, "", targetPath);
      } else {
        window.history.pushState(options.state || {}, "", targetPath);
      }

      const parsed = parseCurrentRoute(targetUrl.pathname, targetUrl.search);
      setRouteState(parsed);

      if (options?.smoothScroll !== false) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    []
  );

  const goBack = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate("/");
    }
  }, [navigate]);

  return (
    <RouterContext.Provider value={{ ...routeState, navigate, goBack }}>
      {children}
    </RouterContext.Provider>
  );
};

export const useRouter = (): RouterContextType => {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error("useRouter must be used within a RouterProvider");
  }
  return context;
};

/**
 * High-performance Link component with seamless pushState navigation
 */
export const Link: React.FC<{
  to: string;
  className?: string;
  children: React.ReactNode;
  id?: string;
  role?: string;
  replace?: boolean;
  title?: string;
  ariaLabel?: string;
  ariaCurrent?: "page" | "step" | "location" | "date" | "time" | "true" | "false" | boolean;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}> = ({ to, className, children, id, role, replace, title, ariaLabel, ariaCurrent, onClick }) => {
  const { navigate } = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onClick) onClick(e);

    // Allow normal browser tab opening (Cmd/Ctrl + click)
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }

    e.preventDefault();
    navigate(to, { replace });
  };

  return (
    <a
      id={id}
      role={role}
      href={to}
      onClick={handleClick}
      className={className}
      title={title}
      aria-label={ariaLabel || title}
      aria-current={ariaCurrent ? (ariaCurrent === true ? "page" : (ariaCurrent as any)) : undefined}
    >
      {children}
    </a>
  );
};
