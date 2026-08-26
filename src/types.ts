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

  // Offline Sync metadata
  isOfflineQueued?: boolean;
  syncedAt?: string;
}

export interface SyncQueueEntry {
  id: string;
  type: "REGISTER_ITEM";
  payload: LostFoundItem;
  createdAt: string;
  status: "PENDENTE" | "SINCRONIZANDO" | "ERRO";
  attempts: number;
  lastAttempt?: string;
  error?: string;
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
  isGlobal?: boolean;
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

export type UploadStatusType =
  | "IDLE"
  | "COMPRESSING"
  | "SAVING_LOCAL"
  | "QUEUED_SYNC"
  | "UPLOADING"
  | "COMPLETED"
  | "ERROR";

export interface UploadTaskStatus {
  id: string;
  itemId: string;
  itemTitle: string;
  itemType: "PERDIDO" | "ENCONTRADO";
  thumbnailUrl?: string;
  progress: number; // 0 to 100
  status: UploadStatusType;
  statusMessage: string;
  originalSizeBytes?: number;
  compressedSizeBytes?: number;
  savingsPercentage?: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
  isBackgroundSyncRegistered?: boolean;
}

export type SupportCategory = "BUG_REPORT" | "FEEDBACK" | "BELONGING_QUERY" | "OTHER";

export interface SupportFeedbackTicket {
  id: string;
  name: string;
  email: string;
  category: SupportCategory;
  subject: string;
  message: string;
  priority?: "BAIXA" | "MEDIA" | "ALTA";
  userId?: string;
  userRole?: UserRole;
  createdAt: string;
  status: "NOVO" | "EM_ATENDIMENTO" | "RESOLVIDO";
  userAgent?: string;
  protocol: string;
}

// =========================================================================
// MÓDULO DE DOCUMENTOS & MODELOS PDF EDITÁVEIS (PAINEL ADMINISTRATIVO)
// =========================================================================

export type DocumentFieldType = "text" | "textarea" | "date" | "number" | "select";

export interface DocumentField {
  id: string;
  name: string; // e.g. "nome_organizacao", "responsavel", "contato", etc.
  label: string; // Label no formulário
  type: DocumentFieldType;
  defaultValue?: string;
  placeholder?: string;
  required: boolean;
  section?: string; // Agrupamento visual (ex: "1. Dados do Parceiro", "2. Dados da Equipe")
  options?: string[]; // Opções para campo do tipo select
}

export type DocumentSectionType =
  | "heading"
  | "subheading"
  | "paragraph"
  | "numbered_section"
  | "declarations_list"
  | "signatures"
  | "custom";

export interface DocumentSection {
  id: string;
  title: string;
  content: string; // Suporta marcações dinâmicas como {{nome_organizacao}}
  type: DocumentSectionType;
  fontSize?: number; // em pontos (pt)
  isBold?: boolean;
  isItalic?: boolean;
  align?: "left" | "center" | "right" | "justify";
  spacingBottom?: number; // em mm
}

export interface DocumentSignature {
  id: string;
  title: string; // ex: "Representante do Parceiro", "Representante da Equipe", "Professor Orientador"
  nameTag?: string; // ex: "{{responsavel}}", "{{representante_equipe}}"
  roleTag?: string; // ex: "{{cargo_responsavel}}", "Líder do Projeto de Extensão"
  cpfOrDocTag?: string; // ex: "CPF: {{cpf_responsavel}}"
}

export interface DocumentTemplate {
  id: string;
  title: string; // ex: "Termo de Aceite do Parceiro de Extensão"
  code: string; // ex: "EXT-ACEITE-01"
  category: "EXTENSAO" | "ACHADOS_PERDIDOS" | "ESTAGIO" | "INSTITUCIONAL" | "RESPONSABILIDADE" | "DECLARACOES" | "RELATORIOS" | "OUTRO";
  description: string;
  status: "ATIVO" | "INATIVO";
  version: number;
  headerText: string;
  institutionLogoUrl?: string;
  includeLogo: boolean;
  includeDocNumber: boolean;
  includeHeader: boolean;
  includeFooter: boolean;
  footerText: string;
  sections: DocumentSection[];
  fields: DocumentField[];
  signatures: DocumentSignature[];
  createdAt: string;
  updatedAt: string;
  createdByName?: string;
  createdByEmail?: string;
}

export type AppTab = "home" | "lost" | "found" | "register" | "dashboard" | "profile" | "image_analyzer";

export interface PendingPostLoginAction {
  action?: "REGISTER_ITEM" | "VIEW_ITEM" | "NAVIGATE";
  tab: AppTab;
  registerType?: "PERDIDO" | "ENCONTRADO";
  prefilledItem?: Partial<LostFoundItem> | null;
  message?: string;
  customMessage?: string;
}

export interface GeneratedDocumentRecord {
  id: string;
  templateId: string;
  templateTitle: string;
  documentNumber: string;
  recipientOrOrg: string;
  fieldsData: Record<string, string>;
  generatedByUserId: string;
  generatedByName: string;
  generatedByEmail?: string;
  generatedAt: string;
  fileSizeBytes?: number;
  status?: "EMITIDO" | "RASCUNHO" | "ARQUIVADO";
}

// =========================================================================
// DADOS DO PROJETO & INFORMAÇÕES PERMANENTES (CONFIGURAÇÕES DO SISTEMA)
// =========================================================================

export interface ProjectTeamMember {
  id: string;
  name: string;
  registrationNumber: string; // Matrícula
  role?: string; // Função no projeto
  order?: number;
}

export interface ProjectProfessorInfo {
  name: string; // Nome do professor responsável
  title: string; // Titulação acadêmica (ex: Mestre, Doutor, Especialista)
  role: string; // Cargo / Função (ex: Coordenador do Curso de Sistemas de Informação)
}

export interface ProjectInstitutionInfo {
  name: string; // Nome da instituição (ex: Instituto Federal do Paraná)
  campus: string; // Campus (ex: Campus Ivaiporã)
  address: string; // Endereço (ex: Rua Max Arthur Greipel, nº 505 - Parque Industrial)
  city: string; // Cidade (ex: Ivaiporã)
  state: string; // UF (ex: PR)
  zipCode: string; // CEP (ex: 86873-400)
}

export interface ProjectSettings {
  teamName: string; // Nome da equipe (ex: InovaIF)
  members: ProjectTeamMember[];
  professor: ProjectProfessorInfo;
  institution: ProjectInstitutionInfo;
  updatedAt?: string;
  updatedBy?: string;
  updatedByEmail?: string;
}


