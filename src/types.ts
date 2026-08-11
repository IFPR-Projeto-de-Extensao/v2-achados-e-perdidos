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
  secretVerificationHint?: string; // Para comprovação pelo dono verdadeiro
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
