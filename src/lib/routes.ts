/**
 * Localiza+ IFPR Campus Ivaiporã
 * Route Definitions and URL Path Mapping Constants
 */

export const ROUTES = {
  HOME: "/",
  SEARCH: "/buscar",
  LOST: "/perdidos",
  FOUND: "/encontrados",
  REGISTER: "/cadastrar",
  MY_ITEMS: "/meus-registros",
  NOTIFICATIONS: "/notificacoes",
  PROFILE: "/perfil",
  SETTINGS: "/configuracoes",
  SUPPORT: "/suporte",
  SUPPORT_FEEDBACK: "/suporte/feedback",
  SUPPORT_BUG: "/suporte/relatar-bug",
  AI_ANALYZER: "/analisador-ia",
  ADMIN: "/admin",
  ADMIN_DASHBOARD: "/admin/dashboard",
  ADMIN_USERS: "/admin/usuarios",
  ADMIN_APPROVALS: "/admin/solicitacoes",
  ADMIN_ITEMS: "/admin/itens",
  ADMIN_FEEDBACKS: "/admin/feedbacks",
  ADMIN_BUGS: "/admin/bugs",
  ADMIN_DOCUMENTS: "/admin/documentos",
  ADMIN_MONITORING: "/admin/monitoramento",
  ADMIN_SETTINGS: "/admin/configuracoes",
  PRIVACY: "/politica-de-privacidade",
  TERMS: "/termos-de-uso",
} as const;

export type AppRouteKey =
  | "home"
  | "search"
  | "register"
  | "my_items"
  | "notifications"
  | "profile"
  | "settings"
  | "support"
  | "support_feedback"
  | "support_bug"
  | "image_analyzer"
  | "admin"
  | "privacy_policy"
  | "terms_of_use"
  | "not_found";

export type AdminSubTab =
  | "dashboard"
  | "users"
  | "approvals"
  | "items"
  | "feedbacks"
  | "bugs"
  | "documents"
  | "monitoring"
  | "settings";

export interface ParsedRoute {
  pathname: string;
  routeKey: AppRouteKey;
  adminSubTab?: AdminSubTab;
  searchParams: Record<string, string>;
  itemId?: string;
  qrCodeId?: string;
}

/**
 * Maps a URL pathname and search query string into a structured route representation.
 */
export function parseCurrentRoute(pathname: string, search: string = ""): ParsedRoute {
  const cleanPath = pathname.toLowerCase().replace(/\/+$/, "") || "/";
  const searchParamsObj: Record<string, string> = {};
  
  if (search) {
    const params = new URLSearchParams(search);
    params.forEach((value, key) => {
      searchParamsObj[key] = value;
    });
  }

  const itemId = searchParamsObj.itemId || searchParamsObj.item || undefined;
  const qrCodeId = searchParamsObj.qr || searchParamsObj.qrCodeId || undefined;

  // Direct exact matches
  if (cleanPath === "/" || cleanPath === "/home" || cleanPath === "/inicio") {
    return { pathname: "/", routeKey: "home", searchParams: searchParamsObj, itemId, qrCodeId };
  }

  if (
    cleanPath === "/buscar" ||
    cleanPath === "/busca" ||
    cleanPath === "/objetos" ||
    cleanPath === "/itens"
  ) {
    return { pathname: "/buscar", routeKey: "search", searchParams: searchParamsObj, itemId, qrCodeId };
  }

  if (cleanPath === "/perdidos") {
    return {
      pathname: "/buscar",
      routeKey: "search",
      searchParams: { ...searchParamsObj, tipo: "perdido" },
      itemId,
      qrCodeId,
    };
  }

  if (cleanPath === "/encontrados") {
    return {
      pathname: "/buscar",
      routeKey: "search",
      searchParams: { ...searchParamsObj, tipo: "encontrado" },
      itemId,
      qrCodeId,
    };
  }

  if (
    cleanPath === "/cadastrar" ||
    cleanPath === "/registrar" ||
    cleanPath === "/novo-objeto" ||
    cleanPath === "/cadastrar-item"
  ) {
    return { pathname: "/cadastrar", routeKey: "register", searchParams: searchParamsObj, itemId, qrCodeId };
  }

  if (
    cleanPath === "/meus-registros" ||
    cleanPath === "/meus-itens" ||
    cleanPath === "/minhas-publicacoes"
  ) {
    return { pathname: "/meus-registros", routeKey: "my_items", searchParams: searchParamsObj, itemId, qrCodeId };
  }

  if (cleanPath === "/notificacoes" || cleanPath === "/alertas") {
    return { pathname: "/notificacoes", routeKey: "notifications", searchParams: searchParamsObj, itemId, qrCodeId };
  }

  if (cleanPath === "/perfil" || cleanPath === "/minha-conta" || cleanPath === "/meu-perfil") {
    return { pathname: "/perfil", routeKey: "profile", searchParams: searchParamsObj, itemId, qrCodeId };
  }

  if (
    cleanPath === "/configuracoes" ||
    cleanPath === "/ajustes" ||
    cleanPath === "/preferencias"
  ) {
    return { pathname: "/configuracoes", routeKey: "settings", searchParams: searchParamsObj, itemId, qrCodeId };
  }

  if (cleanPath === "/suporte/feedback" || cleanPath === "/feedback") {
    return { pathname: "/suporte/feedback", routeKey: "support_feedback", searchParams: searchParamsObj, itemId, qrCodeId };
  }

  if (
    cleanPath === "/suporte/relatar-bug" ||
    cleanPath === "/relatar-bug" ||
    cleanPath === "/reportar-bug" ||
    cleanPath === "/bug"
  ) {
    return { pathname: "/suporte/relatar-bug", routeKey: "support_bug", searchParams: searchParamsObj, itemId, qrCodeId };
  }

  if (cleanPath === "/suporte" || cleanPath === "/ajuda" || cleanPath === "/atendimento") {
    return { pathname: "/suporte", routeKey: "support", searchParams: searchParamsObj, itemId, qrCodeId };
  }

  if (
    cleanPath === "/analisador-ia" ||
    cleanPath === "/ia-analisador" ||
    cleanPath === "/analisar-foto" ||
    cleanPath === "/analisar-fotos"
  ) {
    return { pathname: "/analisador-ia", routeKey: "image_analyzer", searchParams: searchParamsObj, itemId, qrCodeId };
  }

  // Admin routes & sub-routes
  if (cleanPath.startsWith("/admin") || cleanPath.startsWith("/dashboard")) {
    let subTab: AdminSubTab = "dashboard";
    if (cleanPath.includes("/usuarios") || cleanPath.includes("/users")) {
      subTab = "users";
    } else if (cleanPath.includes("/solicitacoes") || cleanPath.includes("/aprovacoes") || cleanPath.includes("/approvals")) {
      subTab = "approvals";
    } else if (cleanPath.includes("/itens") || cleanPath.includes("/objetos")) {
      subTab = "items";
    } else if (cleanPath.includes("/feedbacks") || cleanPath.includes("/feedback")) {
      subTab = "feedbacks";
    } else if (cleanPath.includes("/bugs") || cleanPath.includes("/relatos")) {
      subTab = "bugs";
    } else if (cleanPath.includes("/documentos") || cleanPath.includes("/docs") || cleanPath.includes("/pdf")) {
      subTab = "documents";
    } else if (cleanPath.includes("/monitoramento") || cleanPath.includes("/saude") || cleanPath.includes("/uptime") || cleanPath.includes("/logs")) {
      subTab = "monitoring";
    } else if (cleanPath.includes("/configuracoes") || cleanPath.includes("/projeto") || cleanPath.includes("/manutencao") || cleanPath.includes("/backups")) {
      subTab = "settings";
    }

    return {
      pathname: cleanPath.startsWith("/admin") ? cleanPath : `/admin/${subTab}`,
      routeKey: "admin",
      adminSubTab: subTab,
      searchParams: searchParamsObj,
      itemId,
      qrCodeId,
    };
  }

  if (cleanPath === "/politica-de-privacidade" || cleanPath === "/privacidade") {
    return { pathname: "/politica-de-privacidade", routeKey: "privacy_policy", searchParams: searchParamsObj, itemId, qrCodeId };
  }

  if (cleanPath === "/termos-de-uso" || cleanPath === "/termos") {
    return { pathname: "/termos-de-uso", routeKey: "terms_of_use", searchParams: searchParamsObj, itemId, qrCodeId };
  }

  // Direct item deep-link: /item/xyz or /objeto/xyz
  if (cleanPath.startsWith("/item/") || cleanPath.startsWith("/objeto/")) {
    const directItemId = cleanPath.split("/")[2];
    return {
      pathname: "/buscar",
      routeKey: "search",
      searchParams: searchParamsObj,
      itemId: directItemId || itemId,
      qrCodeId,
    };
  }

  return {
    pathname: cleanPath,
    routeKey: "not_found",
    searchParams: searchParamsObj,
    itemId,
    qrCodeId,
  };
}
