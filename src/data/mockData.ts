import { LostFoundItem, User, NotificationItem, ItemClaim, ItemComment, ActivityLog } from "../types";

export const MOCK_USERS: User[] = [];

export interface LocationGroup {
  group: string;
  locations: string[];
}

export const IFPR_LOCATION_GROUPS: LocationGroup[] = [
  {
    group: "Blocos",
    locations: ["Bloco 1", "Bloco 2", "Bloco 3", "Bloco 4", "Bloco 5"],
  },
  {
    group: "Setores Administrativos",
    locations: ["SEPAE", "Portaria", "Direção e Coordenação", "Secretaria", "Sala dos Professores"],
  },
  {
    group: "Espaços Acadêmicos",
    locations: ["Laboratório", "Laboratório de Informática", "Sala de Aula", "Biblioteca", "Sala de RPG"],
  },
  {
    group: "Áreas Comuns",
    locations: ["Estacionamento", "Cantina", "Cozinha", "Refeitório", "Quadra"],
  },
];

export const IFPR_LOCATIONS: string[] = IFPR_LOCATION_GROUPS.flatMap((g) => g.locations);

export const LEGACY_IFPR_LOCATIONS: string[] = [
  "Bloco Didático - Salas 01 a 12",
  "Laboratórios de Informática (Lab 01 e 02)",
  "Biblioteca Campus Ivaiporã",
  "Refeitório / Cantina Estudantil",
  "Ginásio Poliesportivo & Quadra Externa",
  "Secretaria Acadêmica (SEBAC / Bloco ADM)",
  "Estacionamento Principal & Guarita",
  "Auditório do Campus Ivaiporã",
  "Laboratórios de Física, Química e Biologia",
  "Área Verde & Pátio Central",
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
];

export const INITIAL_ITEMS: LostFoundItem[] = [];

export const MOCK_NOTIFICATIONS: NotificationItem[] = [];

export const MOCK_CLAIMS: ItemClaim[] = [];

export const MOCK_COMMENTS: ItemComment[] = [];

export const MOCK_ACTIVITY_LOGS: ActivityLog[] = [];
