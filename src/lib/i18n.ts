// Internationalization (i18n) Dictionary & Types for IFPR Achados & Perdidos

export type SupportedLanguage = "pt" | "en";

export interface TranslationDictionary {
  appName: string;
  campusName: string;
  home: string;
  lostItems: string;
  foundItems: string;
  registerItem: string;
  dashboard: string;
  profile: string;
  imageAnalyzer: string;
  login: string;
  logout: string;
  searchPlaceholder: string;
  semanticSearchPlaceholder: string;
  semanticSearchActive: string;
  semanticSearchBtn: string;
  semanticSearchDesc: string;
  scanQr: string;
  registerLost: string;
  registerFound: string;
  analyzePhotoAI: string;
  totalRegistered: string;
  totalFound: string;
  totalReturned: string;
  successRate: string;
  recentItems: string;
  recentItemsSubtitle: string;
  viewAll: string;
  noItemsFound: string;
  noItemsDesc: string;
  allCategories: string;
  categoryElectronics: string;
  categoryDocuments: string;
  categoryClothes: string;
  categoryKeys: string;
  categoryBooks: string;
  categoryBottles: string;
  categoryAccessories: string;
  categoryUmbrellas: string;
  categoryOthers: string;
  statusLost: string;
  statusFound: string;
  statusReturned: string;
  statusDonated: string;
  statusDisposed: string;
  statusRecycled: string;
  subscribeFcmTitle: string;
  subscribeFcmSubtitle: string;
  subscribeFcmBtn: string;
  subscribedFcmBtn: string;
  testFcmNotification: string;
  fcmActiveNotice: string;
  fcmItemMatchNotice: string;
  semanticSearchPrompt: string;
  fcmTitle: string;
  fcmSubscribed: string;
  fcmUnsubscribed: string;
  fcmDescription: string;
  fcmProcessing: string;
  subscribeNotifications: string;
  fcmTestBtn: string;
  fcmConfigured: string;
  exportLogsJsonBtn: string;
  exportLogsJsonSubtitle: string;
  footerCampusTitle: string;
  footerCampusDesc: string;
  footerDropPoints: string;
  footerQuickLinks: string;
  footerContact: string;
  footerRights: string;
  exchangeStudentNotice: string;
  languageSelect: string;
  maintenanceAlert: string;
  filterBy: string;
  sortBy: string;
  details: string;
  claimItem: string;
  share: string;
  close: string;
}

export const translations: Record<SupportedLanguage, TranslationDictionary> = {
  pt: {
    appName: "IFPR Achados & Perdidos",
    campusName: "Campus Ivaiporã",
    home: "Início",
    lostItems: "Perdidos",
    foundItems: "Encontrados",
    registerItem: "Registrar Item",
    dashboard: "Painel Admin",
    profile: "Meu Perfil",
    imageAnalyzer: "Analisador IA",
    login: "Entrar / Cadastro",
    logout: "Sair da Conta",
    searchPlaceholder: "Pesquise por nome, cor, marca ou local (ex: Chave, Biblioteca)...",
    semanticSearchPlaceholder: "Digite em linguagem natural: 'chave azul esquecida perto da biblioteca'...",
    semanticSearchActive: "Busca Semântica Gemini IA",
    semanticSearchBtn: "Busca Inteligente (IA)",
    semanticSearchDesc: "A IA do Gemini compreende sinônimos, descrições contextuais e locais próximos no campus.",
    scanQr: "Escanear Etiqueta QR",
    registerLost: "Cadastrar Objeto Perdido",
    registerFound: "Cadastrar Objeto Encontrado",
    analyzePhotoAI: "Analisar Foto com IA Gemini",
    totalRegistered: "Cadastrados",
    totalFound: "Encontrados",
    totalReturned: "Devolvidos",
    successRate: "Taxa de Sucesso",
    recentItems: "Objetos Recentes no Campus",
    recentItemsSubtitle: "Últimos pertences registrados no sistema de achados e perdidos",
    viewAll: "Ver todos",
    noItemsFound: "Nenhum objeto encontrado com estes termos.",
    noItemsDesc: "Tente alterar os termos da busca ou limpe os filtros selecionados.",
    allCategories: "TODAS",
    categoryElectronics: "Eletrônicos",
    categoryDocuments: "Documentos & Cartões",
    categoryClothes: "Roupas & Calçados",
    categoryKeys: "Chaves",
    categoryBooks: "Material Escolar & Livros",
    categoryBottles: "Garrafas & Marmitas",
    categoryAccessories: "Acessórios & Bijuterias",
    categoryUmbrellas: "Guarda-chuvas",
    categoryOthers: "Outros",
    statusLost: "PERDIDO",
    statusFound: "ENCONTRADO",
    statusReturned: "DEVOLVIDO",
    statusDonated: "DOADO",
    statusDisposed: "DESCARTADO",
    statusRecycled: "RECICLADO",
    subscribeFcmTitle: "Assinar Notificações Push (FCM)",
    subscribeFcmSubtitle: "Receba alertas automáticos em tempo real quando um objeto que você registrou como perdido for encontrado no campus.",
    subscribeFcmBtn: "Ativar Notificações de Itens Perdidos",
    subscribedFcmBtn: "Notificações Ativas (FCM Conectado)",
    testFcmNotification: "Testar Alerta Push FCM",
    fcmActiveNotice: "Seu dispositivo está cadastrado no Firebase Cloud Messaging para alertas instantâneos.",
    fcmItemMatchNotice: "Alerta FCM: Um objeto correspondente ao seu cadastro de perdido foi encontrado!",
    semanticSearchPrompt: "Exemplos de busca semântica:",
    fcmTitle: "Notificações Push do Sistema (FCM)",
    fcmSubscribed: "Ativo no Dispositivo",
    fcmUnsubscribed: "Não Inscrito",
    fcmDescription: "Receba alertas automáticos via Firebase Cloud Messaging no navegador ou celular quando um objeto que você registrou como perdido for encontrado ou devolvido no campus.",
    fcmProcessing: "Solicitando Permissão...",
    subscribeNotifications: "Assinar Notificações",
    fcmTestBtn: "Testar Alerta Push",
    fcmConfigured: "Configurado",
    exportLogsJsonBtn: "Baixar Relatório de Logs (JSON)",
    exportLogsJsonSubtitle: "Exportar métricas de desempenho, histórico de latência e erros do monitoramento para depuração remota.",
    footerCampusTitle: "IFPR Achados & Perdidos",
    footerCampusDesc: "Plataforma institucional do Instituto Federal do Paraná (IFPR) - Campus Ivaiporã para localização, cadastro e devolução transparente de bens e objetos.",
    footerDropPoints: "Pontos de Entrega IFPR",
    footerQuickLinks: "Links Rápidos",
    footerContact: "Contato do Campus",
    footerRights: "Instituto Federal do Paraná (IFPR) - Campus Ivaiporã. Todos os direitos reservados.",
    exchangeStudentNotice: "Estudante intercambista? Alterne o idioma para Inglês abaixo.",
    languageSelect: "Idioma / Language",
    maintenanceAlert: "Sistema em Modo de Manutenção Programada no Campus Ivaiporã",
    filterBy: "Filtrar por",
    sortBy: "Ordenar por",
    details: "Ver Detalhes",
    claimItem: "Solicitar Posse",
    share: "Compartilhar",
    close: "Fechar",
  },
  en: {
    appName: "IFPR Lost & Found",
    campusName: "Ivaiporã Campus",
    home: "Home",
    lostItems: "Lost Items",
    foundItems: "Found Items",
    registerItem: "Register Item",
    dashboard: "Admin Dashboard",
    profile: "My Profile",
    imageAnalyzer: "AI Analyzer",
    login: "Sign In / Register",
    logout: "Log Out",
    searchPlaceholder: "Search by item name, color, brand or campus location...",
    semanticSearchPlaceholder: "Type naturally: 'blue keys left near the library'...",
    semanticSearchActive: "Gemini AI Semantic Search",
    semanticSearchBtn: "Smart Search (AI)",
    semanticSearchDesc: "Gemini AI understands synonyms, descriptions, and nearby campus spots.",
    scanQr: "Scan QR Tag",
    registerLost: "Report Lost Item",
    registerFound: "Report Found Item",
    analyzePhotoAI: "Analyze Photo with Gemini AI",
    totalRegistered: "Registered",
    totalFound: "Found",
    totalReturned: "Returned",
    successRate: "Recovery Rate",
    recentItems: "Recent Campus Items",
    recentItemsSubtitle: "Latest belongings registered in the IFPR lost and found system",
    viewAll: "View all",
    noItemsFound: "No items match your search criteria.",
    noItemsDesc: "Try adjusting your search terms or clearing the selected filters.",
    allCategories: "ALL",
    categoryElectronics: "Electronics",
    categoryDocuments: "Documents & Cards",
    categoryClothes: "Clothing & Shoes",
    categoryKeys: "Keys",
    categoryBooks: "School Supplies & Books",
    categoryBottles: "Bottles & Lunchboxes",
    categoryAccessories: "Accessories & Jewelry",
    categoryUmbrellas: "Umbrellas",
    categoryOthers: "Other Items",
    statusLost: "LOST",
    statusFound: "FOUND",
    statusReturned: "RETURNED",
    statusDonated: "DONATED",
    statusDisposed: "DISPOSED",
    statusRecycled: "RECYCLED",
    subscribeFcmTitle: "Subscribe to Push Notifications (FCM)",
    subscribeFcmSubtitle: "Get instant real-time alerts whenever an item you reported lost is registered as found on campus.",
    subscribeFcmBtn: "Enable Lost Item Alerts",
    subscribedFcmBtn: "Notifications Active (FCM Connected)",
    testFcmNotification: "Test FCM Push Alert",
    fcmActiveNotice: "Your device is registered with Firebase Cloud Messaging for instant alerts.",
    fcmItemMatchNotice: "FCM Alert: An item matching your lost report has just been found on campus!",
    semanticSearchPrompt: "Semantic search examples:",
    fcmTitle: "Push Notifications (FCM)",
    fcmSubscribed: "Active on Device",
    fcmUnsubscribed: "Not Subscribed",
    fcmDescription: "Receive instant notifications via Firebase Cloud Messaging whenever an item you reported lost is registered as found or returned on campus.",
    fcmProcessing: "Requesting Permission...",
    subscribeNotifications: "Subscribe to Notifications",
    fcmTestBtn: "Test Push Alert",
    fcmConfigured: "Configured",
    exportLogsJsonBtn: "Download Logs Report (JSON)",
    exportLogsJsonSubtitle: "Export performance metrics, latency history, and error logs for remote debugging.",
    footerCampusTitle: "IFPR Lost & Found",
    footerCampusDesc: "Official platform of Federal Institute of Paraná (IFPR) - Ivaiporã Campus for locating, logging and returning lost belongings.",
    footerDropPoints: "IFPR Drop-off Points",
    footerQuickLinks: "Quick Links",
    footerContact: "Campus Contact",
    footerRights: "Federal Institute of Paraná (IFPR) - Ivaiporã Campus. All rights reserved.",
    exchangeStudentNotice: "Exchange student? Toggle your language preference below.",
    languageSelect: "Language / Idioma",
    maintenanceAlert: "Scheduled Maintenance Mode Active on Ivaiporã Campus",
    filterBy: "Filter by",
    sortBy: "Sort by",
    details: "View Details",
    claimItem: "Claim Item",
    share: "Share",
    close: "Close",
  },
};
