export type ItemStatus =
  | "PERDIDO"
  | "ENCONTRADO"
  | "EM_ANALISE"
  | "PROPRIETARIO_IDENTIFICADO"
  | "DEVOLVIDO"
  | "ENCERRADO";

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

export interface ItemHistoryLog {
  id: string;
  action: string;
  actorName: string;
  actorRole: UserRole;
  actorId: string;
  userId?: string;
  userName?: string;
  userRole?: UserRole;
  timestamp: string;
  details?: string;
  fieldChanged?: string;
  oldValue?: string;
  newValue?: string;
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
  
  // Independent operation tracking fields
  lastEditedByUserId?: string;
  lastEditedByName?: string;
  lastEditedByRole?: UserRole;
  lastEditedAt?: string;

  returnedByUserId?: string;
  returnedByName?: string;
  returnedByRole?: UserRole;
  returnDate?: string;
  returnTime?: string;
  recipientName?: string;
  recipientEmail?: string;
  recipientBond?: string;
  returnObservations?: string;
  receiptValidationCode?: string;

  // Deadline & Unclaimed destination tracking
  storageDeadlineDays?: number;
  storageDeadlineDate?: string;
  data_limite?: string;
  destinationReason?: string;
  destinationType?: string;
  destinationDate?: string;
  destinationResponsible?: string;

  // Timeline history log
  history?: ItemHistoryLog[];
  historyLogs?: ItemHistoryLog[];
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

export type BadgeTier = "BRONZE" | "PRATA" | "OURO" | "DIAMANTE";

export interface UserBadge {
  id: string;
  name: string;
  description: string;
  iconName: string;
  tier: BadgeTier;
  unlocked: boolean;
  unlockedAt?: string;
  progress: number;
  currentCount: number;
  targetCount: number;
  requirementText: string;
  pointsReward: number;
}

export interface UserReputationInfo {
  totalPoints: number;
  level: number;
  levelTitle: string;
  levelTier: BadgeTier;
  nextLevelPoints: number;
  progressToNextLevel: number;
  itemsReturnedCount: number;
  itemsRegisteredFoundCount: number;
  itemsRegisteredLostCount: number;
  badges: UserBadge[];
}

export interface ItemFilterState {
  searchQuery: string;
  category: string;
  type: "TODOS" | "PERDIDO" | "ENCONTRADO";
  status: string;
  location: string;
  dateRange: string;
  campusBlock?: string;
  timePeriodPreset?: "TODOS" | "HOJE" | "7_DIAS" | "30_DIAS" | "SEMESTRE_ATUAL" | "CUSTOM";
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
    | "MASTER_WIPE"
    | "CADASTRO_OCORRENCIA"
    | "EDIT_OCORRENCIA"
    | "GERACAO_ETIQUETA"
    | "IDENTIFICACAO_PROPRIETARIO"
    | "REGISTRO_DEVOLUCAO"
    | "REABERTURA_DEVOLUCAO"
    | "DESTINACAO_ITEM"
    | "COMPROVANTE_GERADO"
    | string;
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
