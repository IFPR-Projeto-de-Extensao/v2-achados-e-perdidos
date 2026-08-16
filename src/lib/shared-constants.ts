/**
 * Pure Flat Shared Constants and State Primitives
 * Localiza+ IFPR Campus Ivaiporã
 * ZERO React or Firebase dependencies to guarantee 100% deterministic module evaluation order.
 */

import type { User } from "../types";

export const APP_NAME = "Localiza+ IFPR";
export const CAMPUS_NAME = "IFPR Campus Ivaiporã";
export const CAMPUS_COORDINATES = {
  lat: -24.2389,
  lng: -51.6881,
};

export const APP_VALID_TABS = [
  "home",
  "lost",
  "found",
  "register",
  "dashboard",
  "profile",
  "image_analyzer",
] as const;

export type AppTabType = typeof APP_VALID_TABS[number];

export const LOCAL_STORAGE_THEME_KEY = "ifpr_achados_perdidos_theme";
export const LOCAL_STORAGE_CURRENT_USER_KEY = "ifpr_achados_current_user";
export const LOCAL_STORAGE_ALL_USERS_KEY = "ifpr_achados_all_users";

export const STORAGE_KEYS = {
  THEME: "localiza_ifpr_theme",
  USER: "localiza_ifpr_user_session",
  LANG: "localiza_ifpr_language",
  BACKUP_LOGS: "localiza_ifpr_backup_logs",
  BACKUP_CONFIG: "localiza_ifpr_backup_config",
  ACTIVITY_LOGS: "localiza_ifpr_activity_logs",
  OFFLINE_QUEUE: "localiza_ifpr_sync_queue",
  SAVED_ITEMS: "localiza_ifpr_saved_items",
} as const;

export const CATEGORIES_LIST = [
  "Documentos",
  "Eletrônicos",
  "Vestuário",
  "Chaves",
  "Material Escolar",
  "Acessórios",
  "Cartões",
  "Outros",
] as const;

export const CAMPUS_LOCATIONS = [
  "Bloco Didático - Sala 01",
  "Bloco Didático - Sala 02",
  "Bloco Didático - Sala 03",
  "Bloco Didático - Sala 04",
  "Bloco Didático - Sala 05",
  "Bloco Didático - Sala 06",
  "Laboratório de Informática 1",
  "Laboratório de Informática 2",
  "Laboratório de Informática 3",
  "Laboratório de Química",
  "Laboratório de Física / Biologia",
  "Laboratório de Eletrotécnica / Automação",
  "Biblioteca Paulo Freire",
  "Refeitório / Cantina",
  "Ginásio Poliesportivo",
  "Secretaria Acadêmica",
  "Diretoria Geral / Recepção",
  "Pátio Central",
  "Estacionamento",
  "Outro Local",
] as const;

export const DEFAULT_MAINTENANCE_MESSAGE =
  "Estamos efetuando uma manutenção preventiva no banco de dados do Achados & Perdidos do IFPR. As consultas e registros estão temporariamente pausados. Por favor, volte em instantes!";

export const DEFAULT_GUEST_USER: User = {
  id: "guest_visitor",
  name: "Visitante",
  email: "visitante@ifpr.edu.br",
  role: "ALUNO",
  courseOrDept: "Comunidade IFPR Campus Ivaiporã",
  registrationNumber: "00000000",
  avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80",
};

/**
 * Pure sanitizer for user arrays avoiding duplicate IDs or emails
 */
export function sanitizeUserList(users: User[]): User[] {
  const seenIds = new Set<string>();
  const seenEmails = new Set<string>();
  const result: User[] = [];

  for (const u of users || []) {
    if (!u) continue;
    const emailKey = String(u.email ?? "").trim().toLowerCase();
    const idKey = String(u.id ?? "").trim();

    if (idKey && seenIds.has(idKey)) continue;
    if (emailKey && seenEmails.has(emailKey)) continue;

    if (idKey) seenIds.add(idKey);
    if (emailKey) seenEmails.add(emailKey);
    result.push(u);
  }
  return result;
}

/**
 * Pure sanitizer for Firestore documents avoiding undefined values
 */
export function sanitizeFirestoreData<T extends Record<string, any>>(data: T): Record<string, any> {
  if (!data || typeof data !== "object") return data;
  const clean: Record<string, any> = {};
  for (const key of Object.keys(data)) {
    const val = data[key];
    if (val !== undefined) {
      if (val !== null && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date) && typeof val.toMillis === "function") {
        clean[key] = val;
      } else if (val !== null && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date) && (val as any)._methodName === "FieldValue.delete") {
        clean[key] = val;
      } else if (val !== null && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date)) {
        clean[key] = sanitizeFirestoreData(val);
      } else {
        clean[key] = val;
      }
    }
  }
  return clean;
}
