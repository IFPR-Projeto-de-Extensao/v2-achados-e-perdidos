export type ItemStatus = "PERDIDO" | "ENCONTRADO" | "EM_ANALISE" | "DEVOLVIDO";

export type ItemCategory =
  | "Eletrônicos"
  | "Documentos & Cartões"
  | "Roupas & Calçados"
  | "Chaves"
  | "Material Escolar & Livros"
  | "Acessórios & Bijuterias"
  | "Garrafas & Marmitas"
  | "Guarda-chuvas"
  | "Outros";

export type UserRole = "ALUNO" | "SERVIDOR" | "ADMIN";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  courseOrDept: string;
  registrationNumber: string; // Matrícula
  avatarUrl: string;
  phone?: string;
  approvalStatus?: "APROVADO" | "PENDENTE" | "REJEITADO";
  reputationScore?: number;
}

export interface LostFoundItem {
  id: string;
  title: string;
  category: ItemCategory;
  type: "PERDIDO" | "ENCONTRADO";
  status: ItemStatus;
  description: string;
  color: string;
  brand: string;
  location: string;
  date: string;
  imageUrl: string;
  additionalImages?: string[];
  contactInfo: string;
  registeredByUserId: string;
  registeredByName: string;
  registeredByRole: UserRole;
  qrCodeId: string;
  createdAt: string;
  matchedWithItemId?: string;
  resolutionDate?: string;
  secretVerificationHint?: string; // Dica/pergunta sobre recurso oculta
  secretVerificationKey?: string; // Senha, PIN, código de barras/série ou padrão cadastrado (RNF04)
}

export interface ItemClaim {
  id: string;
  itemId: string;
  itemTitle: string;
  claimerId: string;
  claimerName: string;
  claimerEmail: string;
  claimerRole: UserRole;
  verificationAnswer: string;
  status: "PENDENTE" | "APROVADO" | "REJEITADO" | "CONCLUIDO";
  createdAt: string;
  notes?: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  type: "MATCH" | "CLAIM_UPDATE" | "SYSTEM" | "STATUS_CHANGE";
  relatedItemId?: string;
}

export interface ItemFilterState {
  searchQuery: string;
  category: string;
  type: "TODOS" | "PERDIDO" | "ENCONTRADO";
  status: string;
  location: string;
  dateRange: string;
}

export interface AIMatchResult {
  matchScore: number; // 0 to 100
  matchedItem: LostFoundItem;
  reason: string;
  matchedFeatures: string[];
}

export interface DashboardStats {
  totalRegistered: number;
  totalFound: number;
  totalReturned: number;
  successRate: number;
  pendingClaims: number;
}

export interface ItemComment {
  id: string;
  itemId: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  userAvatar?: string;
  text: string;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  adminId: string;
  adminName: string;
  action:
    | "EXCLUSAO_USUARIO"
    | "MODO_MANUTENCAO"
    | "ALTERACAO_PERMISSAO"
    | "STATUS_OVERRIDE"
    | "RESET_SISTEMA"
    | "NOVO_USUARIO"
    | "EXCLUSAO_EM_MASSA"
    | "APROVACAO_USUARIO"
    | "REJEICAO_USUARIO"
    | "BACKUP_SISTEMA"
    | "CONFIG_BACKUP"
    | "MENSAGEM_MANUTENCAO"
    | "LIMPEZA_LOGS"
    | "MASTER_WIPE";
  details: string;
  timestamp: string;
}

export interface BackupLog {
  id: string;
  adminId: string;
  adminName: string;
  filename: string;
  fileSizeBytes: number;
  itemCount: number;
  userCount: number;
  triggerType: "MANUAL" | "PROGRAMADO";
  status: "SUCESSO" | "ERRO";
  timestamp: string;
}

export interface BackupScheduleConfig {
  enabled: boolean;
  frequency: "A_CADA_12H" | "DIARIO_0200" | "SEMANAL_DOMINGO";
  autoDownload: boolean;
  lastBackupTimestamp?: string;
  nextBackupTimestamp?: string;
}
