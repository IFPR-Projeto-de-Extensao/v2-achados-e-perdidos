/**
 * Pure Constants Module - Localiza+ IFPR Campus Ivaiporã
 * Isolated from any React component or Context to prevent circular dependency cycles.
 */

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
