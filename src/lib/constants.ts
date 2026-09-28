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

export const OFFICIAL_DISCORD_INVITE_URL = "https://discord.gg/uV2qUDrHcw";

/**
 * Limites máximos de caracteres para campos de texto de ocorrências
 * Definidos com base em auditoria de layout, cartões, relatórios PDF e persistência:
 * - TITLE: 100 caracteres (identificador primordial, cabeçalho de cards, prevenção de quebra de layout)
 * - DESCRIPTION: 1000 caracteres (detalhes, marcas de uso, circunstâncias, proteção contra buffer overflow)
 * - LOCATION: 120 caracteres (especificação de setor/bloco/sala/laboratório no campus)
 * - COLOR: 50 caracteres (especificação de cores predominantes)
 * - BRAND: 60 caracteres (marca, modelo ou fabricante)
 * - CONTACT_INFO: 150 caracteres (instruções de contato ou local de guarda)
 * - AI_PROMPT: 500 caracteres (texto de comando/ditado para análise Gemini)
 */
export const ITEM_FIELD_LIMITS = {
  TITLE: 100,
  DESCRIPTION: 1000,
  LOCATION: 120,
  COLOR: 50,
  BRAND: 60,
  CONTACT_INFO: 150,
  AI_PROMPT: 500,
} as const;
