export type SupportedLanguage = "pt" | "en";

export const LANGUAGE_STORAGE_KEY = "ifpr_lang_preference";

export function getStoredLanguage(): SupportedLanguage {
  if (typeof window === "undefined") return "pt";
  try {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return saved === "en" ? "en" : "pt";
  } catch {
    return "pt";
  }
}

export function getLocaleForLanguage(lang?: SupportedLanguage): "pt-BR" | "en-US" {
  const effective = lang ?? getStoredLanguage();
  return effective === "en" ? "en-US" : "pt-BR";
}

export function translateCategory(category: string | undefined | null, lang: SupportedLanguage): string {
  const raw = (category || "Outros").trim();
  if (lang === "pt") return raw;
  const map: Record<string, string> = {
    "Eletrônicos": "Electronics",
    "Documentos & Cartões": "Documents & Cards",
    "Roupas & Calçados": "Clothing & Footwear",
    "Chaves": "Keys",
    "Material Escolar & Livros": "School Supplies & Books",
    "Acessórios & Bijuterias": "Accessories & Jewelry",
    "Garrafas & Marmitas": "Bottles & Lunchboxes",
    "Guarda-chuvas": "Umbrellas",
    "Outros": "Other",
    "TODAS": "All Categories",
  };
  return map[raw] || raw;
}

export function translateColor(color: string | undefined | null, lang: SupportedLanguage): string {
  const raw = (color || "").trim();
  if (!raw || lang === "pt") return raw;
  const map: Record<string, string> = {
    TODAS: "All",
    Verde: "Green",
    Preto: "Black",
    "Cinza / Prata": "Gray / Silver",
    Azul: "Blue",
    Vermelho: "Red",
    Branco: "White",
    Amarelo: "Yellow",
    Rosa: "Pink",
    Roxo: "Purple",
    Laranja: "Orange",
    Marrom: "Brown",
    "Não informada": "Not specified",
  };
  return map[raw] || raw;
}

export function translateItemStatus(status: string | undefined | null, lang: SupportedLanguage): string {
  const s = (status || "").toUpperCase();
  if (lang === "en") {
    switch (s) {
      case "PERDIDO":
        return "Lost";
      case "ENCONTRADO":
        return "Found";
      case "EM_ANALISE":
        return "Under Review";
      case "PROPRIETARIO_IDENTIFICADO":
        return "Owner Identified";
      case "DEVOLVIDO":
        return "Returned";
      case "ENCERRADO":
        return "Closed";
      case "DOADO":
        return "Donated";
      default:
        return status || "Unknown";
    }
  }
  switch (s) {
    case "PERDIDO":
      return "Perdido";
    case "ENCONTRADO":
      return "Encontrado";
    case "EM_ANALISE":
      return "Em Análise";
    case "PROPRIETARIO_IDENTIFICADO":
      return "Proprietário Identificado";
    case "DEVOLVIDO":
      return "Devolvido";
    case "ENCERRADO":
      return "Encerrado";
    case "DOADO":
      return "Doado";
    default:
      return status || "Desconhecido";
  }
}

export function translateUserRole(role: string | undefined | null, lang: SupportedLanguage): string {
  const r = (role || "").toUpperCase();
  if (lang === "en") {
    switch (r) {
      case "ADMIN":
        return "Administrator";
      case "SERVIDOR":
        return "Staff / TAE";
      case "ALUNO":
        return "Student";
      case "INTRUSO":
        return "External Visitor";
      default:
        return "Visitor";
    }
  }
  switch (r) {
    case "ADMIN":
      return "Administrador";
    case "SERVIDOR":
      return "Servidor / TAE";
    case "ALUNO":
      return "Aluno";
    case "INTRUSO":
      return "Usuário Externo";
    default:
      return "Visitante";
  }
}

export function translateCampusBlock(blockId: string, lang: SupportedLanguage): string {
  if (lang === "pt") {
    return blockId === "TODOS" ? "Todos os Blocos" : blockId;
  }
  if (blockId === "TODOS") return "All Blocks";
  return blockId.replace(/^Bloco\s+/i, "Block ");
}

/**
 * Convenience helper for inline bilingual rendering when a specialized or contextual
 * phrase is rendered dynamically based on the active language.
 */
export function localize(lang: SupportedLanguage, pt: string, en: string): string {
  return lang === "en" ? en : pt;
}

export function translateBadgeTier(tier: string | undefined | null, lang: SupportedLanguage): string {
  const t = (tier || "").toUpperCase();
  if (lang === "en") {
    switch (t) {
      case "DIAMANTE":
        return "DIAMOND";
      case "OURO":
        return "GOLD";
      case "PRATA":
        return "SILVER";
      case "BRONZE":
        return "BRONZE";
      default:
        return t || "BRONZE";
    }
  }
  switch (t) {
    case "DIAMANTE":
      return "DIAMANTE";
    case "OURO":
      return "OURO";
    case "PRATA":
      return "PRATA";
    case "BRONZE":
      return "BRONZE";
    default:
      return t || "BRONZE";
  }
}

export function translateClaimStatus(status: string | undefined | null, lang: SupportedLanguage): string {
  const s = (status || "").toUpperCase();
  if (lang === "en") {
    switch (s) {
      case "PENDENTE":
        return "Under Review";
      case "APROVADO":
      case "APROVADA":
        return "Approved";
      case "REJEITADO":
      case "REJEITADA":
        return "Rejected";
      case "CANCELADO":
      case "CANCELADA":
        return "Cancelled";
      case "CONCLUIDO":
      case "CONCLUIDA":
        return "Completed";
      default:
        return status || "Pending";
    }
  }
  switch (s) {
    case "PENDENTE":
      return "Em Análise";
    case "APROVADO":
    case "APROVADA":
      return "Aprovada";
    case "REJEITADO":
    case "REJEITADA":
      return "Recusada";
    case "CANCELADO":
    case "CANCELADA":
      return "Cancelada";
    case "CONCLUIDO":
    case "CONCLUIDA":
      return "Concluída";
    default:
      return status || "Pendente";
  }
}

export function translateAccountStatus(status: string | undefined | null, lang: SupportedLanguage): string {
  const s = (status || "").toLowerCase();
  if (lang === "en") {
    switch (s) {
      case "active":
        return "Active";
      case "suspended":
        return "Suspended";
      case "banned":
        return "Banned";
      case "inactive":
        return "Inactive";
      default:
        return "Active";
    }
  }
  switch (s) {
    case "active":
      return "Ativo";
    case "suspended":
      return "Suspenso";
    case "banned":
      return "Banido";
    case "inactive":
      return "Inativo";
    default:
      return "Ativo";
  }
}

export function translateApprovalStatus(status: string | undefined | null, lang: SupportedLanguage): string {
  const s = (status || "").toUpperCase();
  if (lang === "en") {
    switch (s) {
      case "APROVADO":
        return "Approved";
      case "PENDENTE":
        return "Pending Approval";
      case "REJEITADO":
        return "Rejected";
      default:
        return "Approved";
    }
  }
  switch (s) {
    case "APROVADO":
      return "Aprovado";
    case "PENDENTE":
      return "Pendente de Aprovação";
    case "REJEITADO":
      return "Rejeitado";
    default:
      return "Aprovado";
  }
}

export function translateBugSeverity(severity: string | undefined | null, lang: SupportedLanguage): string {
  const s = (severity || "").toUpperCase();
  if (lang === "en") {
    switch (s) {
      case "BAIXA":
        return "Low";
      case "MEDIA":
        return "Medium";
      case "ALTA":
        return "High";
      case "CRITICA":
        return "Critical";
      default:
        return severity || "Medium";
    }
  }
  switch (s) {
    case "BAIXA":
      return "Baixa";
    case "MEDIA":
      return "Média";
    case "ALTA":
      return "Alta";
    case "CRITICA":
      return "Crítica";
    default:
      return severity || "Média";
  }
}

export function translateActivityAction(action: string | undefined | null, lang: SupportedLanguage): string {
  const a = (action || "").toUpperCase();
  if (lang === "en") {
    const map: Record<string, string> = {
      ITEM_CADASTRADO: "Object Registered",
      ITEM_DEVOLVIDO: "Object Returned",
      ITEM_ATUALIZADO: "Object Updated",
      ITEM_EXCLUIDO: "Object Deleted",
      REIVINDICACAO_CRIADA: "Claim Submitted",
      REIVINDICACAO_APROVADA: "Claim Approved",
      REIVINDICACAO_REJEITADA: "Claim Rejected",
      REIVINDICACAO_CANCELADA: "Claim Cancelled",
      USUARIO_CADASTRADO: "User Registered",
      USUARIO_ATUALIZADO: "User Updated",
      USUARIO_STATUS_ALTERADO: "Account Status Changed",
      USUARIO_EXCLUIDO: "User Deleted",
      ACESSO_BLOQUEADO: "Access Blocked",
      PRIMEIRO_ACESSO_ENVIADO: "First Access Link Sent",
      TERMO_ASSINADO: "Return Receipt Signed",
      EXPORTACAO_RELATORIO: "Report Exported",
      BACKUP_SISTEMA: "System Backup",
      MANUTENCAO_ALTERADA: "Maintenance Mode Updated",
    };
    return map[a] || action || "System Activity";
  }
  const mapPt: Record<string, string> = {
    ITEM_CADASTRADO: "Objeto Cadastrado",
    ITEM_DEVOLVIDO: "Objeto Devolvido",
    ITEM_ATUALIZADO: "Objeto Atualizado",
    ITEM_EXCLUIDO: "Objeto Excluído",
    REIVINDICACAO_CRIADA: "Reivindicação Enviada",
    REIVINDICACAO_APROVADA: "Reivindicação Aprovada",
    REIVINDICACAO_REJEITADA: "Reivindicação Recusada",
    REIVINDICACAO_CANCELADA: "Reivindicação Cancelada",
    USUARIO_CADASTRADO: "Usuário Cadastrado",
    USUARIO_ATUALIZADO: "Usuário Atualizado",
    USUARIO_STATUS_ALTERADO: "Situação de Conta Alterada",
    USUARIO_EXCLUIDO: "Usuário Excluído",
    ACESSO_BLOQUEADO: "Acesso Bloqueado",
    PRIMEIRO_ACESSO_ENVIADO: "Link de Primeiro Acesso Enviado",
    TERMO_ASSINADO: "Recibo de Devolução Assinado",
    EXPORTACAO_RELATORIO: "Relatório Exportado",
    BACKUP_SISTEMA: "Cópia de Segurança do Sistema",
    MANUTENCAO_ALTERADA: "Modo de Manutenção Alterado",
  };
  return mapPt[a] || action || "Atividade do Sistema";
}

export function translateLocationGroup(group: string | undefined | null, lang: SupportedLanguage): string {
  const raw = (group || "").trim();
  if (!raw || lang === "pt") return raw;
  const map: Record<string, string> = {
    "Bloco Didático I (Salas 1 a 10)": "Teaching Block I (Rooms 1–10)",
    "Bloco Didático II (Salas 11 a 20)": "Teaching Block II (Rooms 11–20)",
    "Laboratórios de Informática e Agroindústria": "IT & Agroindustry Labs",
    "Setor Administrativo & Atendimento": "Administrative & Service Wing",
    "Áreas Comuns & Esportes": "Common Areas & Sports",
    "Outros Locais": "Other Locations",
  };
  return map[raw] || raw.replace(/^Bloco\s+/i, "Block ");
}

export function translateCampusLocation(loc: string | undefined | null, lang: SupportedLanguage): string {
  const raw = (loc || "").trim();
  if (!raw || lang === "pt") return raw;
  const exact: Record<string, string> = {
    "Portaria Principal": "Main Gate",
    "Portaria Principal (Entrada)": "Main Gate (Entrance)",
    "Secretaria Acadêmica": "Academic Secretariat",
    "Secretaria / SEPAE": "Secretariat / SEPAE",
    "SEPAE (Atendimento ao Estudante)": "SEPAE (Student Support)",
    "SEBAC": "SEBAC",
    "Biblioteca": "Library",
    "Biblioteca do Campus": "Campus Library",
    "Cantina / Refeitório": "Cafeteria / Dining Hall",
    "Cantina": "Cafeteria",
    "Refeitório": "Dining Hall",
    "Auditório": "Auditorium",
    "Auditório Principal": "Main Auditorium",
    "Quadra Poliesportiva": "Sports Court",
    "Quadra de Esportes": "Sports Court",
    "Estacionamento": "Parking Lot",
    "Estacionamento Principal": "Main Parking Lot",
    "Pátio Central": "Central Courtyard",
    "Corredor Principal": "Main Hallway",
    "Banheiro Masculino": "Men's Restroom",
    "Banheiro Feminino": "Women's Restroom",
    "Banheiros": "Restrooms",
    "Direção Geral": "General Directorate",
    "Coordenação de Cursos": "Course Coordination",
    "Sala dos Professores": "Faculty Lounge",
    "Laboratório de Informática 01": "Computer Lab 01",
    "Laboratório de Informática 02": "Computer Lab 02",
    "Laboratório de Informática 03": "Computer Lab 03",
    "Laboratório de Informática 1": "Computer Lab 1",
    "Laboratório de Informática 2": "Computer Lab 2",
    "Laboratório de Informática 3": "Computer Lab 3",
    "Laboratório de Química": "Chemistry Lab",
    "Laboratório de Física": "Physics Lab",
    "Laboratório de Biologia": "Biology Lab",
    "Laboratório de Agroindústria": "Agroindustry Lab",
    "Laboratório de Solos": "Soil Lab",
    "Outro Local no Campus": "Other Campus Location",
    "Outro (especificar na descrição)": "Other (specify in description)",
  };
  if (exact[raw]) return exact[raw];
  return raw
    .replace(/^Sala\s+/i, "Room ")
    .replace(/^Bloco\s+/i, "Block ")
    .replace(/^Laboratório\s+de\s+/i, "Lab — ")
    .replace(/^Laboratório\s+/i, "Lab ")
    .replace(/^Banheiro\s+/i, "Restroom ");
}

export interface TranslationDictionary {
  // Brand & Header
  appName: string;
  campusName: string;
  home: string;
  catalog: string;
  objects: string;
  foundItems: string;
  lostItems: string;
  returnedItems: string;
  underReviewItems: string;
  registerItem: string;
  registerShort: string;
  dashboard: string;
  adminPanel: string;
  staffPanel: string;
  profile: string;
  myProfile: string;
  myRecords: string;
  notifications: string;
  settings: string;
  support: string;
  versionHistory: string;
  login: string;
  logout: string;
  scanQr: string;
  searchPlaceholder: string;
  homeSearchPlaceholder: string;
  catalogSearchPlaceholder: string;

  // Common Actions & Labels
  back: string;
  cancel: string;
  confirm: string;
  save: string;
  delete: string;
  edit: string;
  close: string;
  clear: string;
  reset: string;
  loading: string;
  all: string;
  yes: string;
  no: string;
  dateNotProvided: string;
  locationNotProvided: string;
  untitledItem: string;
  noPhoto: string;
  pendingSync: string;
  offline: string;
  online: string;
  syncNow: string;
  syncing: string;
  viewAll: string;
  loadMore: string;
  remaining: string;
  retry: string;

  // Home View
  heroBadge: string;
  heroTitle: string;
  heroSubtitle: string;
  homeOfficeHours: string;
  ctaLost: string;
  ctaFound: string;
  ctaBrowseCatalog: string;
  ctaRegisterObject: string;
  voiceSearch: string;
  voiceSearchNotAvailable: string;
  voiceSearchListening: string;
  clearSearch: string;
  recentSearches: string;
  statsTotal: string;
  statsRegistered: string;
  statsFound: string;
  statsLost: string;
  statsReturned: string;
  statsReturnedSub: string;
  statsRate: string;
  recentObjects: string;
  recentTab: string;
  homeEmptyTitle: string;
  homeEmptySearchTitle: string;
  homeEmptyDesc: string;
  homeEmptySearchDesc: string;
  clearFilter: string;

  // Catalog / ObjectsView
  catalogTitle: string;
  catalogFoundTitle: string;
  catalogLostTitle: string;
  catalogReviewTitle: string;
  catalogReturnedTitle: string;
  itemListedSingular: string;
  itemListedPlural: string;
  inArchive: string;
  pdfReport: string;
  selection: string;
  finishSelection: string;
  filters: string;
  gridView: string;
  listView: string;
  viewModeAria: string;
  allCategories: string;
  campusBlock: string;
  specificLocation: string;
  allLocations: string;
  period: string;
  sorting: string;
  newestFirst: string;
  oldestFirst: string;
  predominantColor: string;
  dateRange: string;
  startDate: string;
  endDate: string;
  resetFilters: string;
  clearFilters: string;
  periodAny: string;
  period24h: string;
  periodToday: string;
  period7Days: string;
  period30Days: string;
  periodSemester: string;
  periodCustom: string;
  selectItemsForBulk: string;
  selectAll: string;
  unselectAll: string;
  selectAllInListAria: string;
  selectItemAria: string;
  unselectItemAria: string;
  selectedCount: string;
  moveToReview: string;
  moving: string;
  cancelSelection: string;
  confirmBulkDeletePrefix: string;
  confirmBulkDeleteSuffix: string;
  tableColObject: string;
  tableColStatus: string;
  tableColCategory: string;
  tableColLocation: string;
  tableColDate: string;
  loadingCatalog: string;
  offlineEmptyTitle: string;
  offlineEmptyDesc: string;
  onlineEmptyTitle: string;
  onlineEmptyDesc: string;
  noSearchResultsTitle: string;
  noResultsForQueryPrefix: string;
  noFilterMatchesDesc: string;
  offlineBannerEmpty: string;
  offlineBannerShowingPrefix: string;
  offlineBannerShowingSuffix: string;
  cachedLabel: string;

  // Item Details & Statuses
  statusLost: string;
  statusFound: string;
  statusReview: string;
  statusReturned: string;
  claimItem: string;
  reportFound: string;
  shareItem: string;
  copyLink: string;
  itemDetails: string;
  category: string;
  location: string;
  date: string;
  color: string;
  brand: string;
  description: string;
  timeline: string;
  comments: string;

  // Register Form
  registerTitle: string;
  registerSubtitle: string;
  step1: string;
  step2: string;
  step3: string;
  step4: string;
  typeLostDesc: string;
  typeFoundDesc: string;
  submitItem: string;
  previousStep: string;
  nextStep: string;
  selectLostOrFoundError: string;
  enterTitleError: string;
  enterDescError: string;
  selectLocationError: string;
  enterDateError: string;
  enterContactError: string;
  invalidPhoneError: string;
  confirmReviewWarning: string;

  // Notifications
  notificationsEyebrow: string;
  notificationsTitle: string;
  notificationsSubtitle: string;
  unreadBadge: string;
  markAllRead: string;
  clearHistory: string;
  enablePushTitle: string;
  enablePushDesc: string;
  enablePushBtn: string;
  enablePushShort: string;
  enablePushNavHint: string;
  filterAll: string;
  filterUnread: string;
  filterRead: string;
  testSound: string;
  noNotificationsTitle: string;
  noUnreadDesc: string;
  noNotificationsDesc: string;
  noRecentNotifications: string;
  openFullNotifications: string;
  newBadge: string;
  relatedItemLabel: string;

  // My Items View
  myRecordsTitle: string;
  myRecordsAuthDesc: string;
  signInToAccount: string;
  personalArea: string;
  helloUser: string;
  myRecordsWelcome: string;
  registerLostShort: string;
  pendingReturn: string;
  claimsMade: string;
  successfullyReturned: string;
  quickActions: string;
  browseLostAndFound: string;
  registerCustodyDesc: string;
  trackClaims: string;
  trackClaimsDesc: string;
  viewProfile: string;
  profileDataAndNotifs: string;
  campusGuidanceBanner: string;
  filterMyRecordsPlaceholder: string;
  noItemsInCategory: string;
  tryOtherTerm: string;
  noPublishedRecordsYet: string;
  registerNewObject: string;
  browseObjectCatalog: string;

  // Settings View
  settingsEyebrow: string;
  settingsTitle: string;
  settingsSubtitle: string;
  visualAppearance: string;
  visualAppearanceDesc: string;
  darkLightMode: string;
  darkModeActive: string;
  lightModeActive: string;
  highContrastTitle: string;
  highContrastDesc: string;
  languageLocalization: string;
  languageLocalizationDesc: string;
  ifprDefault: string;
  international: string;
  pushNotificationsTitle: string;
  pushNotificationsDesc: string;
  browserPushPermission: string;
  allowedAndActive: string;
  notGrantedYet: string;
  grantPermission: string;
  activeLabel: string;
  testDemoNotification: string;
  offlineStorageTitle: string;
  offlineStorageDesc: string;
  connectionStatus: string;
  offlineMode: string;
  cachedItemsLabel: string;
  syncQueueLabel: string;
  pendingLabel: string;
  syncQueueNow: string;
  usefulLinksSupport: string;
  supportCenter: string;
  privacyPolicy: string;
  termsOfUse: string;

  // Auth Modal
  accessYourAccount: string;
  createYourAccount: string;
  authLoginDesc: string;
  authRegisterDesc: string;
  createAccount: string;
  authRequiredTitle: string;
  authRequiredDesc: string;
  activeSession: string;
  fillEmailPasswordError: string;
  enterInstitutionalEmailReset: string;
  recoveryEmailSent: string;
  enterFullNameError: string;
  enterValidEmailError: string;
  passwordMinLengthError: string;
  googleLoginSuccess: string;
  continueWithGoogle: string;
  orUseEmail: string;
  emailLabel: string;
  passwordLabel: string;
  forgotPassword: string;
  firstAccessOrForgot: string;
  sendPasswordResetLink: string;
  recoveryEmailRequestSubmitted: string;
  backToLogin: string;
  fullNameLabel: string;
  matriculaLabel: string;
  phoneOptionalLabel: string;

  // Navbar & Mobile Drawer
  navGroupMain: string;
  navGroupTools: string;
  navGroupAdmin: string;
  navGroupStaff: string;
  navGroupAccount: string;
  catalogFullLabel: string;
  myRecordsFullLabel: string;
  qrReaderLabel: string;
  adminFullLabel: string;
  settingsAccessibilityLabel: string;
  supportHelpLabel: string;
  installPwaApp: string;
  installPwaShort: string;
  iLostAnItem: string;
  iFoundAnItem: string;
  itemsCountSuffix: string;
  signOut: string;

  // Support & Feedback
  contactSupport: string;
  sendFeedback: string;
  reportBug: string;
  supportEyebrow: string;
  supportTitle: string;
  supportSubtitle: string;
  feedbackReportBugLink: string;
  privacyShort: string;
  selectLanguageAria: string;
  footerOfficeHours: string;

  // Global Banners, Guards, 404, Modals
  verifyEmailBanner: string;
  verifyNow: string;
  pendingApprovalBanner: string;
  maintenanceBadge: string;
  maintenanceTitle: string;
  adminItAccess: string;
  versionHistoryRestrictedTitle: string;
  versionHistoryRestrictedDesc: string;
  signInInstitutional: string;
  backToHome: string;
  notFoundTitle: string;
  notFoundDescPrefix: string;
  notFoundDescSuffix: string;
  goToHome: string;
  searchObjects: string;
  adminGuardLoading: string;
  adminGuardBadge: string;
  adminGuardTitle: string;
  adminGuardDesc: string;
  adminGuardCurrentAccount: string;
  adminGuardVisitor: string;
  adminGuardSignIn: string;
  pwaUpdateTitle: string;
  pwaUpdateDesc: string;
  pwaUpdateBtn: string;
  pwaInstallTitle: string;
  pwaNativeTag: string;
  pwaAddToHome: string;
  pwaInstallBtn: string;
  pwaInstructionsBtn: string;
  accountBannedTitle: string;
  accountDeactivatedTitle: string;
  accountInconsistencyTitle: string;
  accountSuspendedTitle: string;
  accountBannedDesc: string;
  accountInconsistencyDesc: string;
  accountSuspendedDesc: string;
  accountSupportBtn: string;
  reasonRecorded: string;
  shortcutsTitle: string;
  shortcutsSubtitle: string;
  shortcutsFooter: string;
  voiceModalBadge: string;
  voiceModalTitle: string;
  voiceModalListening: string;
  voiceModalTapToSpeak: string;
  voiceModalDetected: string;
  voiceModalSuggestions: string;
  exportPdfTitle: string;
  exportPdfSubtitle: string;
  exportPdfPeriod: string;
  exportPdfSuccess: string;
  exportPdfError: string;
  qrModalTitle: string;
  qrModalSubtitle: string;
  emailVerifyTitle: string;
  emailVerifySubtitle: string;
  emailVerifyAlreadyVerified: string;
  emailVerifyResend: string;
  uploadStatusTitle: string;
  uploadNoPending: string;
  themeDarkMode: string;
  themeLightMode: string;
  themeSwitchToLight: string;
  themeSwitchToDark: string;

  // Accessibility & Language
  highContrast: string;
  darkMode: string;
  languageLabel: string;
  portuguese: string;
  english: string;
  accessibility: string;
  readAloud: string;
  stopReading: string;

  // Profile & Gamification
  reputation: string;
  badges: string;
  points: string;
  editProfile: string;
  saveChanges: string;
  myClaims: string;
  myPublishedItems: string;
  photoUpdatedSuccess: string;
  photoUpdatedError: string;
  profileAvatarChange: string;
  saving: string;

  // Contact Support Modal
  contactCopied: string;
  contactModalTitle: string;
  contactSuccessTitle: string;
  contactSuccessDesc: string;
  contactProtocolLabel: string;
  contactCopyProtocol: string;
  contactModalDesc: string;
  contactCategoryLabel: string;
  contactNameLabel: string;
  contactEmailLabel: string;
  contactSubjectLabel: string;
  contactPriorityLabel: string;
  contactMessageLabel: string;
  contactDirectMailBtn: string;
  contactSubmitting: string;
  contactSubmitBtn: string;

  // FCM / Push Notifications (Profile)
  fcmTitle: string;
  fcmSubscribed: string;
  fcmUnsubscribed: string;
  fcmDescription: string;
  fcmProcessing: string;
  subscribeNotifications: string;
  fcmTestBtn: string;
  fcmConfigured: string;

  // Spotlight Guided Tour
  tourDialogLabel: string;
  tourStepOf: string;
  tourBack: string;
  tourNext: string;
  tourFinish: string;
  tourSkip: string;
  tourCloseAria: string;
  tourReplayBtn: string;
  tourReplayShort: string;

  // Help & User Manual
  helpButton: string;
  userManualTitle: string;
  userManualNavLabel: string;

  // Account Management & User Status
  userManagementTitle: string;
  userManagementSubtitle: string;
  roleColumnLabel: string;
  statusColumnLabel: string;
  actionsColumnLabel: string;
  userColumnLabel: string;
  registrationColumnLabel: string;
  manageAccountStatusBtn: string;
  deleteUserPermanentlyBtn: string;
  rootAdminOnlyLabel: string;
  confirmPermanentDeleteTitle: string;

  // Profile Badges & Claims
  badgesGalleryTitle: string;
  badgesProgressLabel: string;
  viewBadgesGallery: string;
  hideBadgesGallery: string;
  levelLabel: string;
  itemsReturnedMetric: string;
  itemsFoundMetric: string;
  badgesUnlockedMetric: string;
  noClaimsYetTitle: string;
  noClaimsYetDesc: string;
  cancelClaimBtn: string;
  claimFeaturesLabel: string;

  // Footer
  footerRights: string;
  footerCampusInfo: string;
}

export const translations: Record<SupportedLanguage, TranslationDictionary> = {
  pt: {
    appName: "Localiza+",
    campusName: "IFPR Campus Ivaiporã",
    home: "Início",
    catalog: "Catálogo",
    objects: "Objetos",
    foundItems: "Encontrados",
    lostItems: "Perdidos",
    returnedItems: "Devolvidos",
    underReviewItems: "Em análise",
    registerItem: "Registrar Objeto",
    registerShort: "Registrar",
    dashboard: "Painel",
    adminPanel: "Admin",
    staffPanel: "Painel do Servidor",
    profile: "Perfil",
    myProfile: "Meu Perfil",
    myRecords: "Meus Registros",
    notifications: "Notificações",
    settings: "Configurações",
    support: "Suporte",
    versionHistory: "Histórico de Versões",
    login: "Entrar",
    logout: "Sair",
    scanQr: "Ler QR Code",
    searchPlaceholder: "Buscar por nome, marca, local ou cor...",
    homeSearchPlaceholder: "Buscar objeto, cor, local ou código QR...",
    catalogSearchPlaceholder: "Buscar por nome, cor, marca, local ou QR...",

    back: "Voltar",
    cancel: "Cancelar",
    confirm: "Confirmar",
    save: "Salvar",
    delete: "Excluir",
    edit: "Editar",
    close: "Fechar",
    clear: "Limpar",
    reset: "Redefinir",
    loading: "Carregando...",
    all: "Todos",
    yes: "Sim",
    no: "Não",
    dateNotProvided: "Data não informada",
    locationNotProvided: "Local não informado",
    untitledItem: "Objeto sem título",
    noPhoto: "Sem foto",
    pendingSync: "Pendente de sincronização",
    offline: "Offline",
    online: "Online",
    syncNow: "Sincronizar Agora",
    syncing: "Sincronizando...",
    viewAll: "Ver todos",
    loadMore: "Carregar mais",
    remaining: "restantes",
    retry: "Tentar novamente",

    heroBadge: "Plataforma Oficial • IFPR Campus Ivaiporã",
    heroTitle: "Central de Achados e Perdidos",
    heroSubtitle: "Plataforma oficial para registrar, consultar e devolver pertences com segurança, busca inteligente e etiquetas QR.",
    homeOfficeHours: "IFPR Campus Ivaiporã · Atendimento presencial na Portaria Principal e SEPAE (Seg a Sex, 07h às 22h)",
    ctaLost: "Perdi um Objeto",
    ctaFound: "Encontrei um Objeto",
    ctaBrowseCatalog: "Consultar Objetos",
    ctaRegisterObject: "Registrar Objeto",
    voiceSearch: "Pesquisar por voz",
    voiceSearchNotAvailable: "Busca por voz não disponível neste navegador.",
    voiceSearchListening: "Ouvindo... Fale o nome ou cor do objeto.",
    clearSearch: "Limpar busca",
    recentSearches: "Buscas recentes",
    statsTotal: "Total",
    statsRegistered: "Registrados",
    statsFound: "Encontrados",
    statsLost: "Perdidos",
    statsReturned: "Devolvidos",
    statsReturnedSub: "entregues aos donos",
    statsRate: "Taxa de Recuperação",
    recentObjects: "Objetos Recentes",
    recentTab: "Recentes",
    homeEmptyTitle: "Nenhum objeto registrado no momento",
    homeEmptySearchTitle: "Nenhum objeto encontrado para esta busca",
    homeEmptyDesc: "Os itens entregues na Portaria ou SEPAE aparecerão aqui.",
    homeEmptySearchDesc: "Tente limpar o filtro ou consultar o catálogo completo.",
    clearFilter: "Limpar filtro",

    catalogTitle: "Catálogo de Objetos",
    catalogFoundTitle: "Objetos Encontrados",
    catalogLostTitle: "Objetos Perdidos",
    catalogReviewTitle: "Objetos em Análise",
    catalogReturnedTitle: "Objetos Devolvidos",
    itemListedSingular: "item listado",
    itemListedPlural: "itens listados",
    inArchive: "no acervo",
    pdfReport: "Relatório PDF",
    selection: "Seleção",
    finishSelection: "Concluir Seleção",
    filters: "Filtros",
    gridView: "Visualização em Grade",
    listView: "Visualização em Lista",
    viewModeAria: "Modo de visualização do catálogo",
    allCategories: "Todas categorias",
    campusBlock: "Bloco do Campus",
    specificLocation: "Sala ou Local Específico",
    allLocations: "Todos os locais",
    period: "Período",
    sorting: "Ordenação",
    newestFirst: "Mais recentes primeiro",
    oldestFirst: "Mais antigos primeiro",
    predominantColor: "Cor predominante",
    dateRange: "Intervalo de datas (De / Até)",
    startDate: "Data inicial",
    endDate: "Data final",
    resetFilters: "Redefinir filtros",
    clearFilters: "Limpar filtros",
    periodAny: "Qualquer período",
    period24h: "Últimas 24 horas (Novos)",
    periodToday: "Hoje",
    period7Days: "Últimos 7 dias",
    period30Days: "Últimos 30 dias",
    periodSemester: "Semestre Letivo Atual",
    periodCustom: "Personalizado (De / Até)",
    selectItemsForBulk: "Selecione itens para ação em lote",
    selectAll: "Selecionar todos",
    unselectAll: "Desmarcar todos",
    selectAllInListAria: "Selecionar ou desmarcar todos os objetos filtrados",
    selectItemAria: "Selecionar objeto",
    unselectItemAria: "Desmarcar objeto",
    selectedCount: "selecionado(s)",
    moveToReview: "Mover p/ Análise",
    moving: "Movendo...",
    cancelSelection: "Cancelar seleção",
    confirmBulkDeletePrefix: "Tem certeza que deseja excluir permanentemente",
    confirmBulkDeleteSuffix: "objeto(s)?",
    tableColObject: "Objeto",
    tableColStatus: "Situação",
    tableColCategory: "Categoria",
    tableColLocation: "Local",
    tableColDate: "Data",
    loadingCatalog: "Carregando catálogo de objetos...",
    offlineEmptyTitle: "Sem conexão e sem objetos salvos",
    offlineEmptyDesc: "Conecte-se à internet para sincronizar o catálogo atualizado do campus.",
    onlineEmptyTitle: "Nenhum objeto cadastrado",
    onlineEmptyDesc: "O catálogo está vazio no momento. Novos registros aparecerão aqui automaticamente.",
    noSearchResultsTitle: "Nenhum objeto encontrado",
    noResultsForQueryPrefix: "Não há resultados para",
    noFilterMatchesDesc: "Nenhum objeto corresponde aos filtros aplicados.",
    offlineBannerEmpty: "Modo offline: sem conexão e nenhum objeto salvo localmente.",
    offlineBannerShowingPrefix: "Modo offline: exibindo",
    offlineBannerShowingSuffix: "itens salvos no dispositivo.",
    cachedLabel: "em cache",

    statusLost: "Perdido",
    statusFound: "Encontrado",
    statusReview: "Em Análise",
    statusReturned: "Devolvido",
    claimItem: "Reivindicar Pertence",
    reportFound: "Eu Encontrei Este Item!",
    shareItem: "Compartilhar",
    copyLink: "Copiar Link",
    itemDetails: "Detalhes do Objeto",
    category: "Categoria",
    location: "Localização",
    date: "Data",
    color: "Cor",
    brand: "Marca",
    description: "Descrição",
    timeline: "Histórico",
    comments: "Comentários",

    registerTitle: "Registrar Nova Ocorrência",
    registerSubtitle: "Cadastre um objeto perdido ou encontrado no IFPR Campus Ivaiporã.",
    step1: "Tipo",
    step2: "Detalhes e Foto",
    step3: "Local e Contato",
    step4: "Revisão",
    typeLostDesc: "Relate um item que você perdeu para que a comunidade ajude a encontrá-lo.",
    typeFoundDesc: "Registre um objeto achado no campus para devolver ao proprietário.",
    submitItem: "Concluir Cadastro",
    previousStep: "Voltar",
    nextStep: "Continuar",
    selectLostOrFoundError: "Selecione se o objeto foi perdido ou encontrado.",
    enterTitleError: "Informe o nome ou título do objeto.",
    enterDescError: "Escreva uma descrição detalhada para ajudar na identificação.",
    selectLocationError: "Selecione o local no campus.",
    enterDateError: "Informe a data da ocorrência.",
    enterContactError: "Informe o e-mail ou ponto de contato para devolução.",
    invalidPhoneError: "Telefone inválido. Utilize o formato (XX) 9XXXX-XXXX.",
    confirmReviewWarning: "Marque a confirmação de que revisou os dados antes de prosseguir.",

    notificationsEyebrow: "Central de Comunicações",
    notificationsTitle: "Notificações & Alertas",
    notificationsSubtitle: "Receba atualizações em tempo real sobre itens encontrados, correspondências inteligentes e devoluções.",
    unreadBadge: "não lidas",
    markAllRead: "Marcar todas lidas",
    clearHistory: "Limpar histórico",
    enablePushTitle: "Ativar Notificações do IFPR",
    enablePushDesc: "Seja avisado instantaneamente no seu navegador ou smartphone quando alguém encontrar um objeto que você perdeu no campus.",
    enablePushBtn: "Ativar Notificações",
    enablePushShort: "Ativar Alertas",
    enablePushNavHint: "Ative alertas em tempo real no navegador.",
    filterAll: "Todas",
    filterUnread: "Não Lidas",
    filterRead: "Lidas",
    testSound: "Testar Som",
    noNotificationsTitle: "Nenhuma notificação encontrada",
    noUnreadDesc: "Você já leu todas as suas notificações!",
    noNotificationsDesc: "Quando houver novas correspondências de objetos ou mensagens, elas aparecerão aqui.",
    noRecentNotifications: "Nenhuma notificação recente.",
    openFullNotifications: "Abrir Central de Notificações Completa",
    newBadge: "Nova",
    relatedItemLabel: "Objeto relacionado",

    myRecordsTitle: "Meus Registros e Solicitações",
    myRecordsAuthDesc: "Faça login no Localiza+ para acompanhar suas solicitações de devolução, consultar objetos encontrados e gerenciar seus registros no IFPR Campus Ivaiporã.",
    signInToAccount: "Entrar na Minha Conta",
    personalArea: "Área Pessoal",
    helloUser: "Olá",
    myRecordsWelcome: "Bem-vindo ao Localiza+ • Acompanhe seus registros, solicitações e devoluções no campus.",
    registerLostShort: "Cadastrar Perdido",
    pendingReturn: "Devolução Pendente",
    claimsMade: "Solicitações Realizadas",
    successfullyReturned: "Devolvidos com Sucesso",
    quickActions: "Ações Rápidas",
    browseLostAndFound: "Buscar itens perdidos e encontrados",
    registerCustodyDesc: "Cadastrar novo objeto na custódia",
    trackClaims: "Acompanhar Solicitações",
    trackClaimsDesc: "Ver status de reivindicações de posse",
    viewProfile: "Visualizar Perfil",
    profileDataAndNotifs: "Dados institucionais e notificações",
    campusGuidanceBanner: "Em caso de dúvidas ou retirada de pertences, compareça à SEBAC / Administração do campus com documento com foto.",
    filterMyRecordsPlaceholder: "Filtrar meus registros...",
    noItemsInCategory: "Nenhum item encontrado nesta categoria",
    tryOtherTerm: "Tente buscar com outro termo ou limpar o filtro.",
    noPublishedRecordsYet: "Você ainda não possui registros publicados nesta seção.",
    registerNewObject: "Cadastrar Novo Objeto",
    browseObjectCatalog: "Consultar Catálogo de Objetos",

    settingsEyebrow: "Preferências & Sistema",
    settingsTitle: "Configurações do Localiza+",
    settingsSubtitle: "Personalize a aparência, notificações, sincronização offline e idioma do aplicativo.",
    visualAppearance: "Aparência Visual",
    visualAppearanceDesc: "Tema de cores e contraste para leitura confortável",
    darkLightMode: "Modo Escuro / Claro",
    darkModeActive: "Modo escuro ativo (ideal para noite)",
    lightModeActive: "Modo claro ativo",
    highContrastTitle: "Alto Contraste (Acessibilidade)",
    highContrastDesc: "Bordas destacadas e texto com contraste WCAG AAA",
    languageLocalization: "Idioma & Localização",
    languageLocalizationDesc: "Selecione o idioma de exibição do sistema",
    ifprDefault: "Padrão IFPR",
    international: "Internacional",
    pushNotificationsTitle: "Notificações em Tempo Real (FCM)",
    pushNotificationsDesc: "Alertas em tempo real sobre correspondências e devoluções",
    browserPushPermission: "Permissão de Notificações no Navegador",
    allowedAndActive: "Permitido e ativo",
    notGrantedYet: "Ainda não concedido",
    grantPermission: "Conceder",
    activeLabel: "Ativo",
    testDemoNotification: "Testar Notificação de Demonstração",
    offlineStorageTitle: "Armazenamento Offline",
    offlineStorageDesc: "Cache local no IndexedDB para uso sem internet",
    connectionStatus: "Status da Conexão:",
    offlineMode: "Modo Offline",
    cachedItemsLabel: "Itens em Cache Local:",
    syncQueueLabel: "Fila de Sincronização:",
    pendingLabel: "pendentes",
    syncQueueNow: "Sincronizar Fila Agora",
    usefulLinksSupport: "Links Úteis & Suporte",
    supportCenter: "Central de Suporte",
    privacyPolicy: "Política de Privacidade",
    termsOfUse: "Termos de Uso",

    accessYourAccount: "Acesse sua conta",
    createYourAccount: "Criar sua conta",
    authLoginDesc: "Entre com seu e-mail institucional ou pessoal no Localiza+.",
    authRegisterDesc: "Cadastre-se com seu e-mail para utilizar o Localiza+.",
    createAccount: "Criar conta",
    authRequiredTitle: "Autenticação Obrigatória",
    authRequiredDesc: "Para registrar pertences com segurança no Campus Ivaiporã, entre ou crie sua conta institucional.",
    activeSession: "Sessão Ativa",
    fillEmailPasswordError: "Preencha e-mail e senha para entrar.",
    enterInstitutionalEmailReset: "Informe seu e-mail institucional no campo de e-mail para recuperar a senha.",
    recoveryEmailSent: "E-mail de recuperação enviado com sucesso!",
    enterFullNameError: "Por favor, informe seu nome completo (mínimo de 3 caracteres).",
    enterValidEmailError: "Por favor, informe um endereço de e-mail válido (ex: seu.nome@estudante.ifpr.edu.br).",
    passwordMinLengthError: "A senha deve ter no mínimo 6 caracteres.",
    googleLoginSuccess: "Autenticação com Google realizada com sucesso!",
    continueWithGoogle: "Continuar com Google",
    orUseEmail: "ou use seu e-mail",
    emailLabel: "E-mail",
    passwordLabel: "Senha",
    forgotPassword: "Esqueceu a senha?",
    firstAccessOrForgot: "Primeiro acesso ou esqueceu a senha?",
    sendPasswordResetLink: "Enviar link para definir/redefinir senha",
    recoveryEmailRequestSubmitted: "Solicitação processada para",
    backToLogin: "Voltar para o login",
    fullNameLabel: "Nome Completo",
    matriculaLabel: "Matrícula / SIAPE",
    phoneOptionalLabel: "Telefone / WhatsApp (opcional)",

    navGroupMain: "Navegação",
    navGroupTools: "Ferramentas do Campus",
    navGroupAdmin: "Administração & TI",
    navGroupStaff: "Gestão do Servidor",
    navGroupAccount: "Conta & Apoio",
    catalogFullLabel: "Catálogo de Achados & Perdidos",
    myRecordsFullLabel: "Meus Registros & Ocorrências",
    qrReaderLabel: "Leitor de QR Code",
    adminFullLabel: "Painel Administrativo Institucional",
    settingsAccessibilityLabel: "Configurações & Acessibilidade",
    supportHelpLabel: "Central de Suporte & Dúvidas",
    installPwaApp: "Instalar Aplicativo (PWA)",
    installPwaShort: "Instalar App (PWA)",
    iLostAnItem: "Perdi um Objeto",
    iFoundAnItem: "Achei um Objeto",
    itemsCountSuffix: "itens",
    signOut: "Sair da conta",

    contactSupport: "Suporte",
    sendFeedback: "Enviar Sugestão",
    reportBug: "Relatar Erro",
    supportEyebrow: "Atendimento e Suporte",
    supportTitle: "Central de Ajuda e Atendimento",
    supportSubtitle: "Tire dúvidas frequentes, envie sugestões de melhoria ou relate problemas técnicos à equipe do IFPR Campus Ivaiporã.",
    feedbackReportBugLink: "Sugestões / Relatar Erro",
    privacyShort: "Privacidade",
    selectLanguageAria: "Seletor de Idioma da Interface",
    footerOfficeHours: "Portaria Principal e SEPAE · Atendimento de segunda a sexta, das 07h às 22h · (43) 3126-9400",

    verifyEmailBanner: "Confirme seu endereço de e-mail para liberar o acesso completo.",
    verifyNow: "Verificar agora",
    pendingApprovalBanner: "Conta institucional aguardando homologação pela Secretaria do IFPR Campus Ivaiporã.",
    maintenanceBadge: "Manutenção Programada • IFPR",
    maintenanceTitle: "Sistema em Atualização Técnica",
    adminItAccess: "Acesso Administrador TI",
    versionHistoryRestrictedTitle: "Histórico Oficial de Versões",
    versionHistoryRestrictedDesc: "O acesso ao histórico institucional de versões e atualizações é restrito a membros autenticados da comunidade acadêmica do IFPR. Entre com sua conta institucional (@ifpr.edu.br ou @estudantes.ifpr.edu.br).",
    signInInstitutional: "Entrar com Conta Institucional",
    backToHome: "Voltar ao Início",
    notFoundTitle: "Página não encontrada",
    notFoundDescPrefix: "O endereço",
    notFoundDescSuffix: "não foi encontrado no sistema Localiza+ IFPR Campus Ivaiporã.",
    goToHome: "Ir para o Início",
    searchObjects: "Buscar Objetos",
    adminGuardLoading: "Verificando credenciais administrativas...",
    adminGuardBadge: "Acesso Restrito • Painel Administrativo",
    adminGuardTitle: "Área Restrita aos Administradores",
    adminGuardDesc: "O acesso à rota /admin e às ferramentas de gestão do Localiza+ é exclusivo para servidores e administradores autorizados do IFPR Campus Ivaiporã.",
    adminGuardCurrentAccount: "Sua conta atual:",
    adminGuardVisitor: "Visitante não autenticado",
    adminGuardSignIn: "Entrar com Conta Administrativa",
    pwaUpdateTitle: "Nova versão do Localiza+",
    pwaUpdateDesc: "Toque para atualizar agora",
    pwaUpdateBtn: "Atualizar",
    pwaInstallTitle: "Instalar Localiza+",
    pwaNativeTag: "Aplicativo Web",
    pwaAddToHome: "Adicionar à Tela Inicial",
    pwaInstallBtn: "Instalar",
    pwaInstructionsBtn: "Instruções",
    accountBannedTitle: "Conta Banida Institucionalmente",
    accountDeactivatedTitle: "Conta Administrativamente Desativada",
    accountInconsistencyTitle: "Conta Temporariamente Bloqueada por Inconsistência",
    accountSuspendedTitle: "Conta Temporariamente Suspensa",
    accountBannedDesc: "As operações de cadastro, reivindicação e comentários estão permanentemente bloqueadas nesta conta.",
    accountInconsistencyDesc: "Há um registro temporal incompatível no seu perfil que exige reativação ou normalização administrativa.",
    accountSuspendedDesc: "Seu acesso a novas ocorrências e reivindicações está pausado durante o bloqueio.",
    accountSupportBtn: "Suporte / Ouvidoria",
    reasonRecorded: "Motivo registrado:",
    shortcutsTitle: "Atalhos de Teclado",
    shortcutsSubtitle: "Navegação rápida e acessibilidade no Localiza+ IFPR",
    shortcutsFooter: "Pressione qualquer atalho fora dos campos de texto para navegar instantaneamente.",
    voiceModalBadge: "Comando de Voz IFPR",
    voiceModalTitle: "Busca Rápida por Voz",
    voiceModalListening: "Ouvindo... Fale agora",
    voiceModalTapToSpeak: "Toque no microfone para falar",
    voiceModalDetected: "Item Detectado:",
    voiceModalSuggestions: "Sugestões Rápidas:",
    exportPdfTitle: "Exportar Relatório de Achados (PDF)",
    exportPdfSubtitle: "Prestação de contas institucional da Secretaria do IFPR Campus Ivaiporã",
    exportPdfPeriod: "Período do Relatório",
    exportPdfSuccess: "Relatório PDF de prestação de contas gerado com sucesso!",
    exportPdfError: "Ocorreu um erro ao gerar o arquivo PDF. Tente novamente.",
    qrModalTitle: "Leitor de QR Code IFPR",
    qrModalSubtitle: "Escaneie a etiqueta ou cole o código/link do objeto",
    emailVerifyTitle: "Confirme seu endereço de e-mail",
    emailVerifySubtitle: "Para garantir a autenticidade das comunicações e proteger a comunidade do IFPR Campus Ivaiporã, confirme o acesso à sua caixa postal antes de continuar.",
    emailVerifyAlreadyVerified: "Já verifiquei meu e-mail",
    emailVerifyResend: "Reenviar e-mail de verificação",
    uploadStatusTitle: "Situação dos Envios",
    uploadNoPending: "Nenhum envio pendente.",
    themeDarkMode: "Modo Escuro",
    themeLightMode: "Modo Claro",
    themeSwitchToLight: "Alternar para Modo Claro",
    themeSwitchToDark: "Alternar para Modo Escuro",

    highContrast: "Alto Contraste",
    darkMode: "Modo Escuro",
    languageLabel: "Idioma",
    portuguese: "Português (BR)",
    english: "English (US)",
    accessibility: "Acessibilidade",
    readAloud: "Ler em Voz Alta",
    stopReading: "Parar Leitura",

    reputation: "Reputação",
    badges: "Conquistas e Medalhas",
    points: "pontos",
    editProfile: "Editar Perfil",
    saveChanges: "Salvar Alterações",
    myClaims: "Minhas Reivindicações",
    myPublishedItems: "Meus Registros",
    photoUpdatedSuccess: "Foto de perfil atualizada e salva com sucesso!",
    photoUpdatedError: "Não foi possível salvar a nova foto de perfil. Tente novamente.",
    profileAvatarChange: "Alterar",
    saving: "Salvando...",

    contactCopied: "Copiado!",
    contactModalTitle: "Suporte e Sugestões Institucionais",
    contactSuccessTitle: "Mensagem e Notificação Encaminhadas com Sucesso!",
    contactSuccessDesc: "Seu relato foi registrado e notificado para a equipe de apoio e canais de atendimento do IFPR Campus Ivaiporã.",
    contactProtocolLabel: "Protocolo de Atendimento",
    contactCopyProtocol: "Copiar",
    contactModalDesc: "Envie relatos de erros, sugestões de melhoria ou dúvidas diretamente para a equipe de apoio do Campus Ivaiporã.",
    contactCategoryLabel: "Tipo de Mensagem / Canal",
    contactNameLabel: "Seu Nome Completo",
    contactEmailLabel: "Seu E-mail",
    contactSubjectLabel: "Assunto",
    contactPriorityLabel: "Prioridade",
    contactMessageLabel: "Mensagem / Descrição Detalhada",
    contactDirectMailBtn: "Abrir no Meu Aplicativo de E-mail",
    contactSubmitting: "Enviando à equipe...",
    contactSubmitBtn: "Enviar Mensagem e Notificar",

    fcmTitle: "Notificações no Dispositivo (FCM)",
    fcmSubscribed: "Ativo no Dispositivo",
    fcmUnsubscribed: "Não Inscrito",
    fcmDescription: "Receba alertas automáticos via Firebase Cloud Messaging no navegador ou celular quando um objeto que você registrou como perdido for encontrado ou devolvido no campus.",
    fcmProcessing: "Solicitando Permissão...",
    subscribeNotifications: "Assinar Notificações",
    fcmTestBtn: "Testar Alerta",
    fcmConfigured: "Configurado",

    tourDialogLabel: "Guia interativo do Localiza+",
    tourStepOf: "de",
    tourBack: "Voltar",
    tourNext: "Próximo",
    tourFinish: "Concluir",
    tourSkip: "Pular guia",
    tourCloseAria: "Fechar guia interativo",
    tourReplayBtn: "Iniciar Guia Interativo",
    tourReplayShort: "Guia Interativo",

    helpButton: "Ajuda",
    userManualTitle: "Manual de Utilização do Localiza+",
    userManualNavLabel: "Ajuda e Manual do Usuário",

    userManagementTitle: "Gestão de Contas e Moderação",
    userManagementSubtitle: "Controle a situação das contas, aplique suspensões temporárias, banimentos e exclusões com registro em auditoria.",
    roleColumnLabel: "Função / Perfil",
    statusColumnLabel: "Situação",
    actionsColumnLabel: "Ações",
    userColumnLabel: "Usuário",
    registrationColumnLabel: "Cadastro / Vínculo",
    manageAccountStatusBtn: "Gerenciar Situação",
    deleteUserPermanentlyBtn: "Excluir Conta",
    rootAdminOnlyLabel: "Exclusivo Admin. Raiz",
    confirmPermanentDeleteTitle: "Confirmar Exclusão Permanente",

    badgesGalleryTitle: "Galeria de Medalhas",
    badgesProgressLabel: "Progresso para o próximo nível",
    viewBadgesGallery: "Ver todas as medalhas",
    hideBadgesGallery: "Ocultar galeria de medalhas",
    levelLabel: "Nível",
    itemsReturnedMetric: "Devoluções",
    itemsFoundMetric: "Achados Registrados",
    badgesUnlockedMetric: "Medalhas",
    noClaimsYetTitle: "Nenhuma reivindicação enviada",
    noClaimsYetDesc: "Quando você solicitar a devolução de um objeto no catálogo, poderá acompanhar a análise por aqui.",
    cancelClaimBtn: "Cancelar solicitação",
    claimFeaturesLabel: "Características informadas",

    footerRights: "IFPR Campus Ivaiporã • Todos os direitos reservados",
    footerCampusInfo: "IFPR Campus Ivaiporã · Central de Achados e Perdidos",
  },
  en: {
    appName: "Localiza+",
    campusName: "IFPR Ivaiporã Campus",
    home: "Home",
    catalog: "Catalog",
    objects: "Objects",
    foundItems: "Found",
    lostItems: "Lost",
    returnedItems: "Returned",
    underReviewItems: "Under Review",
    registerItem: "Register Item",
    registerShort: "Register",
    dashboard: "Dashboard",
    adminPanel: "Admin",
    staffPanel: "Staff Panel",
    profile: "Profile",
    myProfile: "My Profile",
    myRecords: "My Records",
    notifications: "Notifications",
    settings: "Settings",
    support: "Support",
    versionHistory: "Version History",
    login: "Sign In",
    logout: "Sign Out",
    scanQr: "Scan QR Code",
    searchPlaceholder: "Search by name, brand, location or color...",
    homeSearchPlaceholder: "Search item, color, location or QR code...",
    catalogSearchPlaceholder: "Search by name, color, brand, location or QR...",

    back: "Back",
    cancel: "Cancel",
    confirm: "Confirm",
    save: "Save",
    delete: "Delete",
    edit: "Edit",
    close: "Close",
    clear: "Clear",
    reset: "Reset",
    loading: "Loading...",
    all: "All",
    yes: "Yes",
    no: "No",
    dateNotProvided: "Date not provided",
    locationNotProvided: "Location not provided",
    untitledItem: "Untitled item",
    noPhoto: "No photo",
    pendingSync: "Pending sync",
    offline: "Offline",
    online: "Online",
    syncNow: "Sync Now",
    syncing: "Syncing...",
    viewAll: "View all",
    loadMore: "Load more",
    remaining: "remaining",
    retry: "Try again",

    heroBadge: "Official Platform • IFPR Ivaiporã Campus",
    heroTitle: "Lost & Found Center",
    heroSubtitle: "Official platform to report, search, and return campus belongings safely with smart search and QR code labels.",
    homeOfficeHours: "IFPR Ivaiporã Campus · In-person desk at Main Gate & SEPAE (Mon–Fri, 07:00–22:00)",
    ctaLost: "I Lost an Item",
    ctaFound: "I Found an Item",
    ctaBrowseCatalog: "Browse Objects",
    ctaRegisterObject: "Register Object",
    voiceSearch: "Voice search",
    voiceSearchNotAvailable: "Voice search is not supported in this browser.",
    voiceSearchListening: "Listening... Say the item name or color.",
    clearSearch: "Clear search",
    recentSearches: "Recent searches",
    statsTotal: "Total",
    statsRegistered: "Registered",
    statsFound: "Found",
    statsLost: "Lost",
    statsReturned: "Returned",
    statsReturnedSub: "delivered to owners",
    statsRate: "Recovery Rate",
    recentObjects: "Recent Objects",
    recentTab: "Recent",
    homeEmptyTitle: "No objects registered right now",
    homeEmptySearchTitle: "No objects matched your search",
    homeEmptyDesc: "Items handed in at the Main Gate or SEPAE will appear here.",
    homeEmptySearchDesc: "Try clearing the filter or browsing the full catalog.",
    clearFilter: "Clear filter",

    catalogTitle: "Object Catalog",
    catalogFoundTitle: "Found Objects",
    catalogLostTitle: "Lost Objects",
    catalogReviewTitle: "Objects Under Review",
    catalogReturnedTitle: "Returned Objects",
    itemListedSingular: "item listed",
    itemListedPlural: "items listed",
    inArchive: "in archive",
    pdfReport: "PDF Report",
    selection: "Select",
    finishSelection: "Done Selecting",
    filters: "Filters",
    gridView: "Grid View",
    listView: "List View",
    viewModeAria: "Catalog view mode",
    allCategories: "All categories",
    campusBlock: "Campus Block",
    specificLocation: "Specific Room or Location",
    allLocations: "All locations",
    period: "Time Period",
    sorting: "Sort By",
    newestFirst: "Newest first",
    oldestFirst: "Oldest first",
    predominantColor: "Main Color",
    dateRange: "Date Range (From / To)",
    startDate: "Start date",
    endDate: "End date",
    resetFilters: "Reset filters",
    clearFilters: "Clear filters",
    periodAny: "Any period",
    period24h: "Last 24 hours (New)",
    periodToday: "Today",
    period7Days: "Last 7 days",
    period30Days: "Last 30 days",
    periodSemester: "Current Academic Semester",
    periodCustom: "Custom (From / To)",
    selectItemsForBulk: "Select items for bulk action",
    selectAll: "Select all",
    unselectAll: "Unselect all",
    selectAllInListAria: "Select or unselect all filtered objects",
    selectItemAria: "Select object",
    unselectItemAria: "Unselect object",
    selectedCount: "selected",
    moveToReview: "Move to Review",
    moving: "Moving...",
    cancelSelection: "Cancel selection",
    confirmBulkDeletePrefix: "Are you sure you want to permanently delete",
    confirmBulkDeleteSuffix: "object(s)?",
    tableColObject: "Object",
    tableColStatus: "Status",
    tableColCategory: "Category",
    tableColLocation: "Location",
    tableColDate: "Date",
    loadingCatalog: "Loading object catalog...",
    offlineEmptyTitle: "Offline with no saved objects",
    offlineEmptyDesc: "Connect to the internet to sync the updated campus catalog.",
    onlineEmptyTitle: "No objects registered",
    onlineEmptyDesc: "The catalog is currently empty. New entries will appear here automatically.",
    noSearchResultsTitle: "No objects found",
    noResultsForQueryPrefix: "No results for",
    noFilterMatchesDesc: "No objects match the applied filters.",
    offlineBannerEmpty: "Offline mode: no connection and no locally cached objects.",
    offlineBannerShowingPrefix: "Offline mode: showing",
    offlineBannerShowingSuffix: "items saved on this device.",
    cachedLabel: "cached",

    statusLost: "Lost",
    statusFound: "Found",
    statusReview: "Under Review",
    statusReturned: "Returned",
    claimItem: "Claim Belonging",
    reportFound: "I Found This Item!",
    shareItem: "Share",
    copyLink: "Copy Link",
    itemDetails: "Item Details",
    category: "Category",
    location: "Location",
    date: "Date",
    color: "Color",
    brand: "Brand",
    description: "Description",
    timeline: "Timeline",
    comments: "Comments",

    registerTitle: "Register New Report",
    registerSubtitle: "Register a lost or found object at IFPR Ivaiporã Campus.",
    step1: "Type",
    step2: "Details & Photo",
    step3: "Location & Contact",
    step4: "Review",
    typeLostDesc: "Report a missing belonging so the campus community can help find it.",
    typeFoundDesc: "Register an item found on campus so it can be returned to its owner.",
    submitItem: "Complete Registration",
    previousStep: "Back",
    nextStep: "Continue",
    selectLostOrFoundError: "Select whether the object was lost or found.",
    enterTitleError: "Enter the object name or title.",
    enterDescError: "Write a detailed description to help identify the item.",
    selectLocationError: "Select the campus location.",
    enterDateError: "Enter the occurrence date.",
    enterContactError: "Enter the contact email or return desk.",
    invalidPhoneError: "Invalid phone number. Use format (XX) 9XXXX-XXXX.",
    confirmReviewWarning: "Please confirm that you reviewed the details before submitting.",

    notificationsEyebrow: "Communications Center",
    notificationsTitle: "Notifications & Alerts",
    notificationsSubtitle: "Receive real-time updates on found items, smart matches, and returns.",
    unreadBadge: "unread",
    markAllRead: "Mark all as read",
    clearHistory: "Clear history",
    enablePushTitle: "Enable IFPR Push Notifications",
    enablePushDesc: "Get notified instantly on your browser or smartphone when someone finds an object you lost on campus.",
    enablePushBtn: "Enable Push Notifications",
    enablePushShort: "Enable Push",
    enablePushNavHint: "Enable real-time browser alerts.",
    filterAll: "All",
    filterUnread: "Unread",
    filterRead: "Read",
    testSound: "Test Sound",
    noNotificationsTitle: "No notifications found",
    noUnreadDesc: "You have already read all your notifications!",
    noNotificationsDesc: "When new item matches or updates arrive, they will appear here.",
    noRecentNotifications: "No recent notifications.",
    openFullNotifications: "Open Full Notifications Center",
    newBadge: "New",
    relatedItemLabel: "Related object",

    myRecordsTitle: "My Records & Claims",
    myRecordsAuthDesc: "Sign in to Localiza+ to track your return claims, browse found objects, and manage your records at IFPR Ivaiporã Campus.",
    signInToAccount: "Sign In to My Account",
    personalArea: "Personal Area",
    helloUser: "Hello",
    myRecordsWelcome: "Welcome to Localiza+ • Track your records, claims, and returns on campus.",
    registerLostShort: "Report Lost",
    pendingReturn: "Pending Return",
    claimsMade: "Claims Submitted",
    successfullyReturned: "Successfully Returned",
    quickActions: "Quick Actions",
    browseLostAndFound: "Search lost and found items",
    registerCustodyDesc: "Register a new item in custody",
    trackClaims: "Track Claims",
    trackClaimsDesc: "Check ownership claim status",
    viewProfile: "View Profile",
    profileDataAndNotifs: "Institutional profile and notifications",
    campusGuidanceBanner: "For questions or item pickup, visit SEBAC / Campus Administration with a photo ID.",
    filterMyRecordsPlaceholder: "Filter my records...",
    noItemsInCategory: "No items found in this category",
    tryOtherTerm: "Try searching with another term or clearing the filter.",
    noPublishedRecordsYet: "You do not have any published records in this section yet.",
    registerNewObject: "Register New Object",
    browseObjectCatalog: "Browse Object Catalog",

    settingsEyebrow: "Preferences & System",
    settingsTitle: "Localiza+ Settings",
    settingsSubtitle: "Customize appearance, notifications, offline sync, and application language.",
    visualAppearance: "Visual Appearance",
    visualAppearanceDesc: "Color theme and contrast for comfortable reading",
    darkLightMode: "Dark / Light Mode",
    darkModeActive: "Dark mode active (ideal at night)",
    lightModeActive: "Light mode active",
    highContrastTitle: "High Contrast (Accessibility)",
    highContrastDesc: "Enhanced borders and WCAG AAA text contrast",
    languageLocalization: "Language & Localization",
    languageLocalizationDesc: "Select the system display language",
    ifprDefault: "IFPR Default",
    international: "International",
    pushNotificationsTitle: "FCM Push Notifications",
    pushNotificationsDesc: "Real-time alerts for item matches and returns",
    browserPushPermission: "Browser Push Permission",
    allowedAndActive: "Allowed and active",
    notGrantedYet: "Not granted yet",
    grantPermission: "Grant",
    activeLabel: "Active",
    testDemoNotification: "Test Demo Notification",
    offlineStorageTitle: "Offline Storage",
    offlineStorageDesc: "Local IndexedDB cache for offline usage",
    connectionStatus: "Connection Status:",
    offlineMode: "Offline Mode",
    cachedItemsLabel: "Locally Cached Items:",
    syncQueueLabel: "Sync Queue:",
    pendingLabel: "pending",
    syncQueueNow: "Sync Queue Now",
    usefulLinksSupport: "Useful Links & Support",
    supportCenter: "Support Center",
    privacyPolicy: "Privacy Policy",
    termsOfUse: "Terms of Use",

    accessYourAccount: "Sign in to your account",
    createYourAccount: "Create your account",
    authLoginDesc: "Sign in with your institutional or personal email on Localiza+.",
    authRegisterDesc: "Sign up with your email to use Localiza+.",
    createAccount: "Create account",
    authRequiredTitle: "Authentication Required",
    authRequiredDesc: "To safely register belongings at Ivaiporã Campus, sign in or create your institutional account.",
    activeSession: "Active Session",
    fillEmailPasswordError: "Enter both email and password to sign in.",
    enterInstitutionalEmailReset: "Enter your institutional email in the email field to reset your password.",
    recoveryEmailSent: "Password recovery email sent successfully!",
    enterFullNameError: "Please enter your full name (minimum 3 characters).",
    enterValidEmailError: "Please enter a valid email address (e.g., name@estudante.ifpr.edu.br).",
    passwordMinLengthError: "Password must be at least 6 characters long.",
    googleLoginSuccess: "Signed in with Google successfully!",
    continueWithGoogle: "Continue with Google",
    orUseEmail: "or use your email",
    emailLabel: "Email",
    passwordLabel: "Password",
    forgotPassword: "Forgot password?",
    firstAccessOrForgot: "First access or forgot password?",
    sendPasswordResetLink: "Send password setup/reset link",
    recoveryEmailRequestSubmitted: "Request processed for",
    backToLogin: "Back to sign in",
    fullNameLabel: "Full Name",
    matriculaLabel: "Student / Staff ID",
    phoneOptionalLabel: "Phone / WhatsApp (optional)",

    navGroupMain: "Navigation",
    navGroupTools: "Campus Tools",
    navGroupAdmin: "Administration & IT",
    navGroupStaff: "Staff Management",
    navGroupAccount: "Account & Help",
    catalogFullLabel: "Lost & Found Catalog",
    myRecordsFullLabel: "My Records & Reports",
    qrReaderLabel: "QR Code Scanner",
    adminFullLabel: "Institutional Admin Panel",
    settingsAccessibilityLabel: "Settings & Accessibility",
    supportHelpLabel: "Support & Help Center",
    installPwaApp: "Install App (PWA)",
    installPwaShort: "Install App (PWA)",
    iLostAnItem: "I Lost an Item",
    iFoundAnItem: "I Found an Item",
    itemsCountSuffix: "items",
    signOut: "Sign out",

    contactSupport: "Support",
    sendFeedback: "Send Feedback",
    reportBug: "Report Bug",
    supportEyebrow: "Help & Support",
    supportTitle: "Help & Support Center",
    supportSubtitle: "Read FAQs, send improvement suggestions, or report technical issues to the IFPR Ivaiporã Campus team.",
    feedbackReportBugLink: "Feedback / Report Bug",
    privacyShort: "Privacy",
    selectLanguageAria: "Interface Language Selector",
    footerOfficeHours: "Main Gate & SEPAE · Open Monday to Friday, 07:00 to 22:00 · (43) 3126-9400",

    verifyEmailBanner: "Confirm your email address to unlock full access.",
    verifyNow: "Verify now",
    pendingApprovalBanner: "Institutional account awaiting approval by IFPR Ivaiporã Campus Secretariat.",
    maintenanceBadge: "Scheduled Maintenance • IFPR",
    maintenanceTitle: "System Under Technical Maintenance",
    adminItAccess: "IT Administrator Access",
    versionHistoryRestrictedTitle: "Official Version History",
    versionHistoryRestrictedDesc: "Access to the institutional changelog and release history is restricted to authenticated members of the IFPR academic community. Sign in with your institutional account (@ifpr.edu.br or @estudantes.ifpr.edu.br).",
    signInInstitutional: "Sign In with Institutional Account",
    backToHome: "Back to Home",
    notFoundTitle: "Page not found",
    notFoundDescPrefix: "The path",
    notFoundDescSuffix: "was not found in Localiza+ IFPR Ivaiporã Campus.",
    goToHome: "Go to Home",
    searchObjects: "Search Objects",
    adminGuardLoading: "Verifying administrative credentials...",
    adminGuardBadge: "Restricted Area • Admin Panel",
    adminGuardTitle: "Administrators Only Area",
    adminGuardDesc: "Access to /admin and Localiza+ management tools is restricted to authorized staff and administrators at IFPR Ivaiporã Campus.",
    adminGuardCurrentAccount: "Your current account:",
    adminGuardVisitor: "Unauthenticated visitor",
    adminGuardSignIn: "Sign In with Admin Account",
    pwaUpdateTitle: "New version of Localiza+",
    pwaUpdateDesc: "Tap to update now",
    pwaUpdateBtn: "Update",
    pwaInstallTitle: "Install Localiza+",
    pwaNativeTag: "Native PWA",
    pwaAddToHome: "Add to Home Screen",
    pwaInstallBtn: "Install",
    pwaInstructionsBtn: "Instructions",
    accountBannedTitle: "Account Permanently Banned",
    accountDeactivatedTitle: "Account Administratively Deactivated",
    accountInconsistencyTitle: "Account Temporarily Blocked due to Inconsistency",
    accountSuspendedTitle: "Account Temporarily Suspended",
    accountBannedDesc: "Registration, claim, and comment actions are permanently blocked on this account.",
    accountInconsistencyDesc: "There is an inconsistent timestamp in your profile requiring administrative review.",
    accountSuspendedDesc: "Your access to new reports and claims is paused while this restriction is active.",
    accountSupportBtn: "Support / Ombudsman",
    reasonRecorded: "Recorded reason:",
    shortcutsTitle: "Keyboard Shortcuts",
    shortcutsSubtitle: "Fast navigation and accessibility in Localiza+ IFPR",
    shortcutsFooter: "Press any shortcut outside text fields to navigate instantly.",
    voiceModalBadge: "IFPR Voice Command",
    voiceModalTitle: "Quick Voice Search",
    voiceModalListening: "Listening... Speak now",
    voiceModalTapToSpeak: "Tap the microphone to speak",
    voiceModalDetected: "Detected Item:",
    voiceModalSuggestions: "Quick Suggestions:",
    exportPdfTitle: "Export Found Items Report (PDF)",
    exportPdfSubtitle: "Institutional accountability report for IFPR Ivaiporã Campus Secretariat",
    exportPdfPeriod: "Report Period",
    exportPdfSuccess: "Accountability PDF report generated successfully!",
    exportPdfError: "An error occurred while generating the PDF file. Please try again.",
    qrModalTitle: "IFPR QR Code Scanner",
    qrModalSubtitle: "Scan the item label or paste the item code/link",
    emailVerifyTitle: "Confirm your email address",
    emailVerifySubtitle: "To ensure authentic communications and protect the IFPR Ivaiporã Campus community, please confirm access to your inbox before continuing.",
    emailVerifyAlreadyVerified: "I have already verified my email",
    emailVerifyResend: "Resend verification email",
    uploadStatusTitle: "Upload Status",
    uploadNoPending: "No pending uploads.",
    themeDarkMode: "Dark Mode",
    themeLightMode: "Light Mode",
    themeSwitchToLight: "Switch to Light Mode",
    themeSwitchToDark: "Switch to Dark Mode",

    highContrast: "High Contrast",
    darkMode: "Dark Mode",
    languageLabel: "Language",
    portuguese: "Portuguese (BR)",
    english: "English (US)",
    accessibility: "Accessibility",
    readAloud: "Read Aloud",
    stopReading: "Stop Reading",

    reputation: "Reputation",
    badges: "Achievements & Badges",
    points: "points",
    editProfile: "Edit Profile",
    saveChanges: "Save Changes",
    myClaims: "My Claims",
    myPublishedItems: "My Records",
    photoUpdatedSuccess: "Profile photo updated and saved successfully!",
    photoUpdatedError: "Could not save the new profile photo. Please try again.",
    profileAvatarChange: "Change",
    saving: "Saving...",

    contactCopied: "Copied!",
    contactModalTitle: "Institutional Support & Feedback",
    contactSuccessTitle: "Message & Notification Submitted Successfully!",
    contactSuccessDesc: "Your report has been recorded and forwarded to the IFPR Ivaiporã Campus support team.",
    contactProtocolLabel: "Support Protocol",
    contactCopyProtocol: "Copy",
    contactModalDesc: "Send bug reports, feature suggestions, or questions directly to the IFPR Ivaiporã Campus support team.",
    contactCategoryLabel: "Message Type / Channel",
    contactNameLabel: "Your Full Name",
    contactEmailLabel: "Your Email",
    contactSubjectLabel: "Subject",
    contactPriorityLabel: "Priority",
    contactMessageLabel: "Message / Detailed Description",
    contactDirectMailBtn: "Open in My Email App",
    contactSubmitting: "Sending to team...",
    contactSubmitBtn: "Send Message & Notify",

    fcmTitle: "System Push Notifications (FCM)",
    fcmSubscribed: "Active on Device",
    fcmUnsubscribed: "Not Subscribed",
    fcmDescription: "Receive alerts via Firebase Cloud Messaging on your browser or mobile device when a lost item you registered is found or returned on campus.",
    fcmProcessing: "Requesting Permission...",
    subscribeNotifications: "Subscribe to Notifications",
    fcmTestBtn: "Test Push Alert",
    fcmConfigured: "Configured",

    tourDialogLabel: "Localiza+ guided tour",
    tourStepOf: "of",
    tourBack: "Back",
    tourNext: "Next",
    tourFinish: "Done",
    tourSkip: "Skip tour",
    tourCloseAria: "Close guided tour",
    tourReplayBtn: "Start Guided Tour",
    tourReplayShort: "Guided Tour",

    helpButton: "Help",
    userManualTitle: "Localiza+ User Manual",
    userManualNavLabel: "Help & User Manual",

    userManagementTitle: "Account Management & Moderation",
    userManagementSubtitle: "Manage account statuses, apply temporary suspensions, bans, and permanent deletions with audit logging.",
    roleColumnLabel: "Role",
    statusColumnLabel: "Status",
    actionsColumnLabel: "Actions",
    userColumnLabel: "User",
    registrationColumnLabel: "Registration / Affiliation",
    manageAccountStatusBtn: "Manage Status",
    deleteUserPermanentlyBtn: "Delete Account",
    rootAdminOnlyLabel: "Root Admin Only",
    confirmPermanentDeleteTitle: "Confirm Permanent Deletion",

    badgesGalleryTitle: "Badges Gallery",
    badgesProgressLabel: "Progress to next level",
    viewBadgesGallery: "View all badges",
    hideBadgesGallery: "Hide badges gallery",
    levelLabel: "Level",
    itemsReturnedMetric: "Returns",
    itemsFoundMetric: "Found Registered",
    badgesUnlockedMetric: "Badges",
    noClaimsYetTitle: "No claims submitted yet",
    noClaimsYetDesc: "When you request the return of an object from the catalog, you can track its review status here.",
    cancelClaimBtn: "Cancel claim",
    claimFeaturesLabel: "Provided identifying details",

    footerRights: "IFPR Ivaiporã Campus • All rights reserved",
    footerCampusInfo: "IFPR Ivaiporã Campus · Lost & Found Center",
  },
};
