import React from "react";

export const LOCAL_AVATAR_FALLBACK = "/avatar-placeholder.svg";

export const INLINE_AVATAR_SVG_DATA_URI =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'%3E%3Crect width='128' height='128' rx='24' fill='%2300843D' fill-opacity='0.12'/%3E%3Ccircle cx='64' cy='48' r='22' fill='%2300843D' fill-opacity='0.75'/%3E%3Cpath d='M26 106c0-21 17-38 38-38s38 17 38 38z' fill='%2300843D' fill-opacity='0.75'/%3E%3C/svg%3E";

/**
 * Retorna a URL segura de avatar com fallback determinístico.
 * Lida de forma resiliente com valores nulos, vazios, indefinidos ou URLs inválidas.
 */
export function getSafeAvatarUrl(avatarUrl?: string | null, name?: string | null): string {
  if (avatarUrl && typeof avatarUrl === "string" && avatarUrl.trim().length > 0) {
    return avatarUrl.trim();
  }
  const cleanName = (name && typeof name === "string" && name.trim().length > 0) ? name.trim() : "User";
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(cleanName)}`;
}

/**
 * Manipulador à prova de falhas para o evento onError de avatares.
 * Elimina completamente qualquer possibilidade de loop recursivo infinito:
 * 
 * 1. Falha na foto primária (Google, Custom, etc.) -> Aplica DiceBear SVG
 * 2. Falha subsequente no DiceBear (rede indisponível/offline) -> Aplica asset local /avatar-placeholder.svg
 * 3. Falha no asset local (servidor estático 404/offline) -> Aplica inline SVG data URI
 * 4. Qualquer erro subsequente -> Desliga incondicionalmente (target.onerror = null) e não altera src
 */
export function handleAvatarError(
  e: React.SyntheticEvent<HTMLImageElement, Event> | { currentTarget: HTMLImageElement },
  name?: string | null
): void {
  const target = e.currentTarget;
  if (!target) return;

  const currentSrc = target.src || "";
  const cleanName = (name && typeof name === "string" && name.trim().length > 0) ? name.trim() : "User";
  const dicebearUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(cleanName)}`;

  // Se já está no fallback final ou no SVG inline, encerra incondicionalmente sem loop
  if (
    target.dataset?.fallbackApplied === "final" ||
    currentSrc.startsWith("data:image/svg+xml")
  ) {
    target.onerror = null;
    return;
  }

  // Se a falha ocorreu na URL primária (Google, foto customizada, etc.) e ainda não tentou DiceBear
  if (!target.dataset?.fallbackApplied && !currentSrc.includes("dicebear.com")) {
    if (target.dataset) {
      target.dataset.fallbackApplied = "dicebear";
    }
    // Desativa o onerror nativo antes de trocar a URL para evitar loops síncronos
    target.onerror = null;
    target.src = dicebearUrl;
    return;
  }

  // Se a falha ocorreu no DiceBear (offline / CDN inacessível / bloqueada) e ainda não tentou o SVG local
  if (target.dataset?.fallbackApplied === "dicebear" || currentSrc.includes("dicebear.com")) {
    if (target.dataset) {
      target.dataset.fallbackApplied = "local";
    }
    target.onerror = null;
    target.src = LOCAL_AVATAR_FALLBACK;
    return;
  }

  // Se o asset local também falhou (ex: servidor estático offline ou 404), usa data URI inline imutável
  if (target.dataset?.fallbackApplied === "local" || currentSrc.includes("avatar-placeholder.svg")) {
    if (target.dataset) {
      target.dataset.fallbackApplied = "final";
    }
    target.onerror = null;
    target.src = INLINE_AVATAR_SVG_DATA_URI;
    return;
  }

  // Salvaguarda final: desativa qualquer manipulador e não altera mais o src
  target.onerror = null;
  if (target.dataset) {
    target.dataset.fallbackApplied = "final";
  }
}
