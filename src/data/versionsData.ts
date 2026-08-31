export interface VersionChangeItem {
  id: string;
  title: string;
  description: string;
  module: "DISCORD" | "VERCEL" | "ADMIN" | "IA_GEMINI" | "PWA" | "FIRESTORE" | "QR_CODE" | "DOCUMENTOS" | "AUTH" | "GERAL";
  tag?: string;
}

export interface AppVersion {
  version: string;
  codename: string;
  releaseDate: string;
  releaseDateTime: string;
  type: "MAJOR" | "MINOR" | "PATCH";
  isCurrent?: boolean;
  summary: string;
  additions: VersionChangeItem[];
  bugFixes: VersionChangeItem[];
  stats?: {
    additionsCount: number;
    fixesCount: number;
  };
}

export const APP_VERSIONS_DATA: AppVersion[] = [
  {
    version: "v1.8.4",
    codename: "System Test Battery, Participants, Governance & QA Audit Trail Engine",
    releaseDate: "31/08/2026",
    releaseDateTime: "31 de Agosto de 2026 • 18:20 BRT",
    type: "MINOR",
    isCurrent: true,
    summary: "Implementação do módulo oficial de Bateria de Testes, Participantes, Governança e Validação do Sistema Localiza+ (IFPR Campus Ivaiporã), integrado ao Painel Administrativo e ao Histórico Oficial de Versões. Inclui gestão de equipe de teste (participantes discentes/servidores sem conceder papel de admin global), atribuição balanceada automática de testes, visão individualizada para testadores, painel analítico com métricas por categoria e por participante, 12 módulos de testes normativos, checagem rigorosa de confirmação de persistência no Firestore com indicador de 'Aguardando sincronização' em modo offline, cálculo em tempo real de duração de testes, trilha de auditoria imutável (Audit Trail com ID de transação e objeto), e exportação de Laudo Técnico de Validação em PDF institucional via jsPDF.",
    additions: [
      {
        id: "v184-add-1",
        title: "Módulo Oficial de Bateria de Testes & Validação do Sistema (BateriaDeTestesView)",
        description: "Painel completo de QA e governança com 12 módulos de validação (Autenticação, Cadastro de Itens, Reivindicações, Devolução Digital, Notificações Discord, IA Gemini, PWA/Offline, Segurança/RBAC, Backups, Relatórios PDF, D3 Analytics e Acessibilidade/Responsividade), disponibilizado no componente BateriaDeTestesView.",
        module: "ADMIN",
        tag: "Bateria de Testes & QA",
      },
      {
        id: "v184-add-2",
        title: "Gestão Desacoplada de Participantes e Testadores",
        description: "Fluxo formal e desacoplado onde o cadastro de participantes solicita estritamente os dados de identificação e papel contextual (Testador Ativo), iniciando sempre com 0 testes e 0 categorias atribuídas, sem seleção automática forçada.",
        module: "ADMIN",
        tag: "Gestão de Participantes",
      },
      {
        id: "v184-add-3",
        title: "Seção Dedicada de Distribuição de Testes & Algoritmos Balanceados",
        description: "Interface dedicada para distribuição manual e automática de casos de teste com suporte a estratégias Round-Robin, Blocos por Categoria, Somente Não Atribuídos e Limpeza de Distribuição, com trilha de auditoria completa.",
        module: "ADMIN",
        tag: "Distribuição de Testes",
      },
      {
        id: "v184-add-4",
        title: "Visão Individual 'Meus Testes' & Painel de Métricas por Categoria e Participante",
        description: "Visualização filtrada dos casos de teste atribuídos ao usuário logado e dashboard analítico com taxas de conclusão, aprovação e gráficos de desempenho por categoria e por membro da equipe de testes.",
        module: "ADMIN",
        tag: "Métricas & Testadores",
      },
      {
        id: "v184-add-5",
        title: "Checagem Rigorosa de Confirmação de Persistência no Backend (RNF-04)",
        description: "Refatoração das rotinas de cadastro com checagem rigorosa de confirmação no Firestore. Exibição da mensagem 'Cadastro Concluído' apenas após confirmação real da transação no backend e indicador visual 'Aguardando sincronização' com armazenamento em IndexedDB durante operações offline.",
        module: "FIRESTORE",
        tag: "Persistência & Offline",
      },
      {
        id: "v184-add-6",
        title: "Cálculo em Tempo Real da Duração da Bateria de Testes",
        description: "Lógica interativa que calcula dinamicamente o intervalo de tempo entre o início e o término da execução de testes, com suporte a estados normativos 'Em andamento' e 'Não calculado' em tempo real.",
        module: "ADMIN",
        tag: "Duração & Métricas",
      },
      {
        id: "v184-add-7",
        title: "Sistema de Auditoria Imutável com ID de Objeto e Transação",
        description: "Rastreabilidade completa de alterações em cadastros críticos e resultados de testes (quem, quando, valor anterior, valor novo, ID do objeto e ID da transação), sem permitir exclusão de histórico.",
        module: "ADMIN",
        tag: "Auditoria & Governança",
      },
      {
        id: "v184-add-8",
        title: "Emissão de Laudo Técnico Oficial de Validação em PDF Institucional (jsPDF)",
        description: "Gerador de Laudo de Validação Técnica e Conformidade do Sistema via jsPDF e jspdf-autotable com cabeçalho institucional do IFPR, resumo executivo, tabela de matriz de testes, tabela da equipe de participantes, trilha de auditoria e blocos de assinatura institucional.",
        module: "DOCUMENTOS",
        tag: "Laudo PDF & jsPDF",
      },
      {
        id: "v184-add-9",
        title: "Navegação Unificada entre Versões, Matriz, Distribuição e Testes",
        description: "Integração multivisão permitindo alternar de forma intuitiva entre o Changelog Histórico, Matriz Completa, Distribuição de Testes, Meus Testes e Painel Analítico.",
        module: "ADMIN",
        tag: "Interface & Navegação",
      },
    ],
    bugFixes: [
      {
        id: "v184-fix-1",
        title: "Remoção de Obrigatoriedade e Atribuição Automática de Categorias ao Cadastrar Testador",
        description: "Correção conceitual definitiva separando o cadastro de participante da distribuição de testes. O participante agora pode fazer parte da bateria antes de receber seus testes, iniciando rigorosamente com 0 testes vinculados.",
        module: "ADMIN",
        tag: "Correção Conceitual",
      },
      {
        id: "v184-fix-2",
        title: "Blindagem contra Confirmação Falsa de Cadastro e Sem Auditoria",
        description: "Garantia de que o feedback de 'Cadastro Concluído' só seja emitido após confirmação efetiva do Firestore, e que qualquer alteração de status gere trilha de auditoria com ID de transação vinculada.",
        module: "ADMIN",
        tag: "Integridade de Dados",
      },
    ],
    stats: {
      additionsCount: 9,
      fixesCount: 2,
    },
  },
  {
    version: "v1.8.3",
    codename: "System Dates & Temporal Consistency Engine",
    releaseDate: "31/08/2026",
    releaseDateTime: "31 de Agosto de 2026 • 15:40 BRT",
    type: "PATCH",
    isCurrent: false,
    summary: "Revisão e padronização integral de parsing e cálculo de datas em todo o sistema, resolução de discrepâncias de fuso horário UTC vs BRT no cadastro de itens e filtros analíticos do Firestore.",
    additions: [
      {
        id: "v183-add-1",
        title: "Utilitário de Data Local (getTodayDateString)",
        description: "Implementação de utilitário em src/lib/utils.ts para resolução da data local no fuso horário do usuário (YYYY-MM-DD), eliminando divergências de rollback de data ao converter meia-noite em UTC.",
        module: "GERAL",
        tag: "Data & Fuso Horário",
      },
      {
        id: "v183-add-2",
        title: "Resiliência no Filtro de Itens com Mais de 90 Dias de Guarda",
        description: "Unificação do cálculo de antiguidade de custódia (CustodyRemindersView e DashboardView) com safeParseDate, suportando formatos brasileiros (DD/MM/YYYY) e Timestamps serializados do Firestore.",
        module: "ADMIN",
        tag: "Custódia 90 Dias",
      },
      {
        id: "v183-add-3",
        title: "Filtros Temporais Robustos no Relatório de Prestação de Contas",
        description: "Adequação dos presets temporais no ExportFoundItemsReportModal (Mês Atual, Últimos 30 Dias, Semestre Atual, Ano 2026 e Personalizado) com validação contra Invalid Date.",
        module: "DOCUMENTOS",
        tag: "Relatório & Filtros",
      },
    ],
    bugFixes: [
      {
        id: "v183-fix-1",
        title: "Correção de NaN em Datas Brasileiras (DD/MM/YYYY) no new Date()",
        description: "Substituição de chamadas diretas a new Date(item.date) por safeParseDate em componentes de listagem e alertas de custódia, prevenindo falhas de ordenação e cálculo.",
        module: "GERAL",
        tag: "Correção de Data",
      },
      {
        id: "v183-fix-2",
        title: "Sincronização de Data Inicial no Formulário de Cadastro de Itens",
        description: "Ajuste no valor padrão do input type='date' no RegisterItemView para refletir com precisão a data local do dispositivo no momento do cadastro.",
        module: "GERAL",
        tag: "Cadastro de Itens",
      },
    ],
    stats: {
      additionsCount: 3,
      fixesCount: 2,
    },
  },
  {
    version: "v1.8.2",
    codename: "Digital Returns Metrics & Certified Receipt Engine",
    releaseDate: "29/08/2026",
    releaseDateTime: "29 de Agosto de 2026 • 12:45 BRT",
    type: "PATCH",
    isCurrent: false,
    summary: "Implementação do Dashboard de Métricas de Uso de Devoluções Digitais em D3.js com análise de tendências diárias em tempo real, KPIs operacionais e botão de Download Comprovante com geração de PDF contendo metadados completos de auditoria e autenticação.",
    additions: [
      {
        id: "v182-add-1",
        title: "Dashboard de Métricas de Devoluções Digitais em D3.js",
        description: "Painel analítico no painel administrativo com cálculo de métricas diárias em tempo real a partir dos dados do Firestore, gráfico de linhas interativo em D3.js com curva de interpolação d3.curveMonotoneX, gradiente de área, marcadores de eventos, tooltip responsivo com rastreamento ao mover o cursor e cards de KPIs (Taxa de Validação Digital, Tempo Médio de Resolução, Eficiência Operacional).",
        module: "ADMIN",
        tag: "Analytics & D3.js",
      },
      {
        id: "v182-add-2",
        title: "Botão 'Download Comprovante' com Metadados de Autenticação em PDF",
        description: "Botão de alta visibilidade na tela de confirmação de devolução que gera via jsPDF e jspdf-autotable o comprovante oficial contendo ID da Transação, Hash SHA-256 de Autenticação, data/hora, dados do objeto, vínculo institucional e termos de conformidade com a MP 2.200-2/2001 e Lei 14.063/2020.",
        module: "DOCUMENTOS",
        tag: "Recibo & jsPDF",
      },
      {
        id: "v182-add-3",
        title: "Filtros de Período e Modalidade no Dashboard de Devoluções",
        description: "Suporte a filtros de períodos de 7, 14, 30, 90 dias ou histórico completo, com segmentação por modalidade de devolução (Remota por E-mail Institucional ou Presencial no Dispositivo da Portaria/SEBAC).",
        module: "ADMIN",
        tag: "Filtros Analíticos",
      },
      {
        id: "v182-add-4",
        title: "Exportação de Relatório Analítico de Métricas em PDF",
        description: "Funcionalidade de geração de relatório PDF com resumo estatístico, tabela analítica por data e histórico de restituições validadas.",
        module: "DOCUMENTOS",
        tag: "Relatório Analítico",
      },
    ],
    bugFixes: [
      {
        id: "v182-fix-1",
        title: "Ajuste na Renderização Responsiva do SVG no D3.js",
        description: "Implementação de ResizeObserver com tratamento de dimensões nulas para evitar distorção ou quebra do gráfico de linhas em diferentes tamanhos de tela.",
        module: "ADMIN",
        tag: "Responsividade",
      },
      {
        id: "v182-fix-2",
        title: "Consistência de Metadados no Comprovante de Devolução",
        description: "Garantia de que transações de devolução sem hash pré-armazenado gerem um identificador de autenticidade criptográfico consistente no comprovante impresso.",
        module: "DOCUMENTOS",
        tag: "Integridade de Dados",
      },
    ],
    stats: {
      additionsCount: 4,
      fixesCount: 2,
    },
  },
  {
    version: "v1.8.1",
    codename: "Digital Signature & Development Governance Guidelines",
    releaseDate: "29/08/2026",
    releaseDateTime: "29 de Agosto de 2026 • 11:50 BRT",
    type: "MINOR",
    isCurrent: false,
    summary: "Implementação da nova funcionalidade de Devolução via Assinatura Digital com Validação rigorosa de status, verificação de segurança contra reutilização de links, utilitário de auditoria no Firestore e feedback visual com ações rápidas.",
    additions: [
      {
        id: "v181-add-1",
        title: "Devolução via Assinatura Digital com Validação",
        description: "Fluxo completo de restituição de pertences com captura de assinatura digital presencial ou remota, validação criptográfica de token e alteração de status para 'DEVOLVIDO' no Firestore.",
        module: "ADMIN",
        tag: "Devolução & Assinatura",
      },
      {
        id: "v181-add-2",
        title: "Verificação de Segurança no Backend para Status DISPONIVEL",
        description: "Validação rigorosa no backend (/api/signature/verify-token e /api/signature/confirm-signature) garantindo que apenas itens no status 'DISPONIVEL' possam ser processados para devolução, impedindo fraudes com links antigos ou reutilizados.",
        module: "FIRESTORE",
        tag: "Segurança & Autenticidade",
      },
      {
        id: "v181-add-3",
        title: "Utilitário Especializado de Auditoria no Firestore (logItemReturnAudit)",
        description: "Criação de utilitário dedicado em src/lib/auditLogger.ts para registro institucional de logs de auditoria na coleção activity_logs, capturando itemId, responsável, código de autenticidade e timestamp.",
        module: "FIRESTORE",
        tag: "Auditoria & Governança",
      },
      {
        id: "v181-add-4",
        title: "Feedback Visual Completo e Navegação Direta Pós-Assinatura",
        description: "Estados dinâmicos de carregamento assíncrono em etapas, mensagens de erro detalhadas com instruções institucionais e tela de sucesso com links diretos para 'Ver Lista de Itens', 'Meu Perfil' e download de PDF oficial.",
        module: "ADMIN",
        tag: "Experiência do Usuário",
      },
      {
        id: "v181-add-5",
        title: "Assinatura Digital Presencial no Dispositivo (SEBAC / Portaria)",
        description: "Captura de assinatura digital via canvas de alta fidelidade com suporte a toque/stylus na tela do atendente no momento da entrega do pertence.",
        module: "ADMIN",
        tag: "Devolução & Assinatura",
      },
      {
        id: "v181-add-6",
        title: "Incorporação da Assinatura Digital no Recibo PDF Oficial",
        description: "Inserção visual da assinatura capturada diretamente no cabeçalho e rodapé do comprovante oficial de entrega gerado pelo sistema.",
        module: "DOCUMENTOS",
        tag: "Recibo Oficial PDF",
      },
      {
        id: "v181-add-7",
        title: "Diretrizes e Regras Obrigatórias de Governança no AGENTS.md e GEMINI.md",
        description: "Inclusão formal das 23 regras mestras de desenvolvimento, proibição de dados fictícios, proibição de remoção de funcionalidades, preservação do banco de produção e obrigatoriedade do resumo técnico.",
        module: "GERAL",
        tag: "Governança & Qualidade",
      },
    ],
    bugFixes: [
      {
        id: "v181-fix-1",
        title: "Validação de Links Corrompidos ou Tokens Divergentes",
        description: "Bloqueio automático de assinaturas em links com tokens ausentes, divergentes do Firestore ou pertencentes a ocorrências já finalizadas.",
        module: "FIRESTORE",
        tag: "Proteção de Dados",
      },
      {
        id: "v181-fix-2",
        title: "Persistência e Sincronização dos Metadados de Assinatura",
        description: "Garantia de gravação no Firestore do status de assinatura, data de assinatura e vínculo institucional do receptor.",
        module: "FIRESTORE",
        tag: "Persistência",
      },
    ],
  },
  {
    version: "v1.8.0",
    codename: "Vercel Diagnostics & Reliability Suite",
    releaseDate: "28/08/2026",
    releaseDateTime: "28 de Agosto de 2026 • 09:00 BRT",
    type: "PATCH",
    isCurrent: false,
    summary: "Refinamento completo de diagnósticos de ambiente Vercel, criação do endpoint /api/debug/env e painel institucional de versões do Localiza+.",
    additions: [
      {
        id: "v180-add-1",
        title: "Aba Administrativa de Histórico de Versões & Changelog",
        description: "Implementação da aba completa no Painel de Admin com separação explícita entre Adições e Correções de Erros, busca por tags e estatísticas.",
        module: "ADMIN",
        tag: "Painel Admin",
      },
      {
        id: "v180-add-2",
        title: "Endpoint de Diagnóstico Seguro de Variáveis de Ambiente (/api/debug/env)",
        description: "Criado endpoint que responde flags booleanas (DISCORD_WEBHOOK_READY, status: true) sem expor tokens ou credenciais confidenciais.",
        module: "VERCEL",
        tag: "API & Telemetria",
      },
      {
        id: "v180-add-3",
        title: "Suíte de Scripts de Teste cURL & Node.js para Produção",
        description: "Adicionados scripts em /scripts para teste automatizado e isolado dos endpoints contra o domínio em produção (https://ifprivp.vercel.app).",
        module: "GERAL",
        tag: "DevOps & Testes",
      },
    ],
    bugFixes: [
      {
        id: "v180-fix-1",
        title: "Sanitização e Blindagem dos Logs do Discord",
        description: "Prevenção de vazamento acidental de URLs de webhook nos logs do console do servidor Express e Vercel Serverless.",
        module: "DISCORD",
        tag: "Segurança",
      },
      {
        id: "v180-fix-2",
        title: "Ajuste na Resposta de Status Booleano no Endpoint de Debug",
        description: "Uniformização da chave booleana {'status': !!process.env.DISCORD_FEEDBACK_WEBHOOK_URL} para validação no painel da Vercel.",
        module: "VERCEL",
        tag: "Correção de API",
      },
    ],
  },
  {
    version: "v1.7.1",
    codename: "Serverless Body Stream & Vercel Resilience",
    releaseDate: "27/08/2026",
    releaseDateTime: "27 de Agosto de 2026 • 21:45 BRT",
    type: "PATCH",
    summary: "Correção definitiva do erro HTTP 500 no deployment da Vercel através de body parsing defensivo e fallback para chamadas de webhook do Discord.",
    additions: [
      {
        id: "v171-add-1",
        title: "Handlers Serverless Nativos na pasta /api",
        description: "Criação de rotas serverless standalone (/api/support/send-feedback.ts, /api/items/notify-novos-achados.ts, /api/items/notify-novas-perdas.ts) para compatibilidade nativa com a infraestrutura Vercel.",
        module: "VERCEL",
        tag: "Serverless",
      },
      {
        id: "v171-add-2",
        title: "Geração de Protocolo Institucional Resiliente",
        description: "Retorno de protocolo único garantido (ex: IFPR-SUP-MTASZ5YH) mesmo se o Discord estiver offline ou sem chave cadastrada.",
        module: "ADMIN",
        tag: "Suporte",
      },
    ],
    bugFixes: [
      {
        id: "v171-fix-1",
        title: "Correção do Erro HTTP 500 (Stream Already Consumed) na Vercel",
        description: "Eliminado o erro causado pela tentativa do express.json() de re-ler streams já consumidos pelo runtime serverless da Vercel, adicionando verificação defensiva de req.body.",
        module: "VERCEL",
        tag: "Bug Crítico",
      },
      {
        id: "v171-fix-2",
        title: "Tratamento de Exceções no Envio de Webhooks",
        description: "Isolamento com bloco try/catch e timeouts para garantir que falhas de rede com a API do Discord não travem o formulário de suporte do usuário.",
        module: "DISCORD",
        tag: "Resiliência",
      },
      {
        id: "v171-fix-3",
        title: "Validação de Payload Vazio Retornando HTTP 400",
        description: "Ajustada a resposta de erro para Bad Request (400) com mensagem amigável em português quando campos obrigatórios não são fornecidos.",
        module: "GERAL",
        tag: "Validação",
      },
    ],
  },
  {
    version: "v1.7.0",
    codename: "Discord Channels & Support Hub Integration",
    releaseDate: "26/08/2026",
    releaseDateTime: "26 de Agosto de 2026 • 16:30 BRT",
    type: "MINOR",
    summary: "Integração oficial com canais do Discord do IFPR Campus Ivaiporã (#novos-achados, #novas-perdas e #suporte-feedbacks) e central de relatórios de bugs.",
    additions: [
      {
        id: "v170-add-1",
        title: "Notificações Automáticas no Canal #novos-achados",
        description: "Envio de embeds estilizados em verde com foto, local do campus, categoria e link direto quando um novo objeto é encontrado.",
        module: "DISCORD",
        tag: "Notificações",
      },
      {
        id: "v170-add-2",
        title: "Alertas Automáticos no Canal #novas-perdas",
        description: "Disparo instantâneo para o canal de perdas com embeds em vermelho ao registrar um pertence perdido por alunos ou servidores.",
        module: "DISCORD",
        tag: "Notificações",
      },
      {
        id: "v170-add-3",
        title: "Central de Feedback, Suporte e Relato de Bugs",
        description: "Formulário inteligente com captura de diagnósticos do navegador (resolução, sistema operacional, rota ativa) e envio direto à equipe de TI.",
        module: "GERAL",
        tag: "Suporte",
      },
    ],
    bugFixes: [
      {
        id: "v170-fix-1",
        title: "Ajuste no Fuso Horário de Envio (Horário de Brasília - BRT)",
        description: "Correção na formatação de datas dos embeds do Discord para exibir a hora correta do Paraná (UTC-3).",
        module: "DISCORD",
        tag: "Ajuste de Data",
      },
      {
        id: "v170-fix-2",
        title: "Correção de URLs Relativas em Imagens de Notificação",
        description: "Garantia de que as URLs de imagens de itens sejam formatadas como absolutas para que o Discord renderize a miniatura do card.",
        module: "DISCORD",
        tag: "Mídia",
      },
    ],
  },
  {
    version: "v1.6.0",
    codename: "Official Document Generator & InovaIF Project Suite",
    releaseDate: "20/08/2026",
    releaseDateTime: "20 de Agosto de 2026 • 14:00 BRT",
    type: "MINOR",
    summary: "Gerador e editor de documentos oficiais em PDF (Termos de Devolução, Declarações de Perda) e painel de dados institucionais para o InovaIF.",
    additions: [
      {
        id: "v160-add-1",
        title: "Módulo de Gestão e Geração de Documentos Oficiais PDF",
        description: "Emissão automatizada de Termos de Devolução de Objetos, Declarações de Perda e Termos de Destinação Final com brasão do IFPR e numeração oficial.",
        module: "DOCUMENTOS",
        tag: "Documentação",
      },
      {
        id: "v160-add-2",
        title: "Editor de Modelos e Variáveis Dinâmicas de Documento",
        description: "Ferramenta visual para personalização de cabeçalhos, rodapés, cláusulas de responsabilidade e dados de testemunhas da SEBAC.",
        module: "DOCUMENTOS",
        tag: "Templates",
      },
      {
        id: "v160-add-3",
        title: "Painel de Configurações Institucionais e Dados do InovaIF",
        description: "Aba dedicada no painel de administração para visualização e edição das credenciais do projeto, coordenadores, orientadores e integrantes discentes.",
        module: "ADMIN",
        tag: "InovaIF",
      },
    ],
    bugFixes: [
      {
        id: "v160-fix-1",
        title: "Quebra de Página e Renderização de Tabelas no jsPDF",
        description: "Correção de sobreposição de rodapés institucionais ao gerar relatórios PDF com múltiplos itens listados.",
        module: "DOCUMENTOS",
        tag: "PDF",
      },
      {
        id: "v160-fix-2",
        title: "Persistência das Configurações de Template no Firestore",
        description: "Ajuste na sincronização do documento 'project_settings' para evitar reescrita inadvertida ao recarregar a página.",
        module: "FIRESTORE",
        tag: "Sincronização",
      },
    ],
  },
  {
    version: "v1.5.0",
    codename: "Governance, Telemetry & Audit Trail",
    releaseDate: "15/08/2026",
    releaseDateTime: "15 de Agosto de 2026 • 18:20 BRT",
    type: "MINOR",
    summary: "Ferramentas completas de governança de TI: trilha de auditoria (Audit Trail), telemetria em tempo real, monitor de uptime e workflow de aprovação de e-mails @ifpr.",
    additions: [
      {
        id: "v150-add-1",
        title: "Trilha de Auditoria Completa (Audit Trail)",
        description: "Registro imutável no Firestore de todas as ações de administradores e servidores (exclusões, alterações de permissão, cadastros manuais, resets).",
        module: "ADMIN",
        tag: "Segurança",
      },
      {
        id: "v150-add-2",
        title: "Workflow de Aprovação de E-mails Institucionais (@ifpr.edu.br)",
        description: "Fila de moderação para validação de novas contas cadastradas com permissão de aprovação individual ou em lote por administradores.",
        module: "AUTH",
        tag: "Governança",
      },
      {
        id: "v150-add-3",
        title: "Monitor de Saúde e Telemetria em Tempo Real",
        description: "Gráficos de latência de rede (ping), latência do Firestore DB, consumo de memória JS Heap e monitor de uptime 24/7.",
        module: "ADMIN",
        tag: "Monitoramento",
      },
      {
        id: "v150-add-4",
        title: "Error Boundary Global com Log de Exceções Mobile (RNF02)",
        description: "Captura de exceções não tratadas no frontend com envio automático de log (dispositivo, resolução de tela, rota) para a coleção de erros.",
        module: "ADMIN",
        tag: "Estabilidade",
      },
    ],
    bugFixes: [
      {
        id: "v150-fix-1",
        title: "Correção de Intervalos de Ping Duplicados",
        description: "Limpeza de timers no useEffect do AppUptimeMonitor para evitar consumo excessivo de conexões.",
        module: "ADMIN",
        tag: "Performance",
      },
      {
        id: "v150-fix-2",
        title: "Filtro de Ações na Tabela de Auditoria",
        description: "Correção no filtro de busca textual de logs para tratar termos acentuados e caixa alta/baixa corretamente.",
        module: "ADMIN",
        tag: "Filtros",
      },
    ],
  },
  {
    version: "v1.4.0",
    codename: "PWA Offline-First & Sensory Experience",
    releaseDate: "10/08/2026",
    releaseDateTime: "10 de Agosto de 2026 • 11:15 BRT",
    type: "MINOR",
    summary: "Transformação em Progressive Web App (PWA) instalável, suporte a cache offline com IndexedDB, feedback háptico (vibração) e modo escuro aprimorado.",
    additions: [
      {
        id: "v140-add-1",
        title: "Instalação PWA Completa e Service Worker",
        description: "Banner nativo e modal de instruções de instalação para Android, iOS e Desktop com suporte a atalhos rápidos de tela inicial.",
        module: "PWA",
        tag: "Mobile",
      },
      {
        id: "v140-add-2",
        title: "Persistência Offline em IndexedDB",
        description: "Armazenamento local em cache de itens cadastrados e logs para consulta rápida mesmo sem conexão com a internet.",
        module: "PWA",
        tag: "Offline",
      },
      {
        id: "v140-add-3",
        title: "Feedback Háptico (Vibração Tátil no Mobile)",
        description: "Integração com a Vibration API do navegador para feedback tátil em cliques, sucesso de devoluções, avisos e confirmações críticas.",
        module: "PWA",
        tag: "UX",
      },
      {
        id: "v140-add-4",
        title: "Tema Escuro Otimizado (Dark Mode Institucional)",
        description: "Paleta escura de alto contraste com preservação dos tons de verde institucional (#00843D) e vermelho IFPR (#C8102E).",
        module: "GERAL",
        tag: "UI/UX",
      },
    ],
    bugFixes: [
      {
        id: "v140-fix-1",
        title: "Ajuste na Detecção de Dispositivos iOS para PWA",
        description: "Instruções específicas para o Safari no iOS com guia ilustrado para 'Adicionar à Tela de Início'.",
        module: "PWA",
        tag: "Compatibilidade",
      },
      {
        id: "v140-fix-2",
        title: "Tratamento de Falha na Vibration API em Navegadores não Suportados",
        description: "Adicionada verificação prévia 'navigator.vibrate' para evitar erros silenciosos em desktops e navegadores legados.",
        module: "PWA",
        tag: "Estabilidade",
      },
    ],
  },
  {
    version: "v1.3.0",
    codename: "Gemini AI Visual Recognition & Smart Assistant",
    releaseDate: "07/08/2026",
    releaseDateTime: "07 de Agosto de 2026 • 15:40 BRT",
    type: "MINOR",
    summary: "Incorporação de Inteligência Artificial Multimodal com Google Gemini para análise de imagens, categorização automática e sugestão de matches entre itens.",
    additions: [
      {
        id: "v130-add-1",
        title: "Analisador Visual de Imagens com Gemini 2.5 Flash",
        description: "Upload de foto do objeto que extrai automaticamente categoria, cor predominante, marca, detalhes específicos e sugere título otimizado.",
        module: "IA_GEMINI",
        tag: "Inteligência Artificial",
      },
      {
        id: "v130-add-2",
        title: "Algoritmo de Correspondência Inteligente (Smart Match AI)",
        description: "Cruzamento automático entre objetos perdidos e encontrados para sugerir possíveis donos com percentual de compatibilidade.",
        module: "IA_GEMINI",
        tag: "Algoritmo",
      },
      {
        id: "v130-add-3",
        title: "Assistente de Dúvidas e Localização do Campus",
        description: "Chatbot de suporte para orientar alunos sobre locais de entrega, procedimentos de devolução e horários da SEBAC.",
        module: "IA_GEMINI",
        tag: "Chatbot",
      },
    ],
    bugFixes: [
      {
        id: "v130-fix-1",
        title: "Compressão de Imagens no Cliente Antes do Envio à IA",
        description: "Redução do tamanho das fotos em canvas HTML5 para acelerar a resposta da API do Gemini e economizar dados móveis.",
        module: "IA_GEMINI",
        tag: "Otimização",
      },
      {
        id: "v130-fix-2",
        title: "Tratamento de Limite de Rate Limit na API Gemini",
        description: "Fallback suave para categorização padrão com mensagem informativa caso a API atinja a cota temporária.",
        module: "IA_GEMINI",
        tag: "Resiliência",
      },
    ],
  },
  {
    version: "v1.2.0",
    codename: "Physical QR Tags & Secure Scanning",
    releaseDate: "05/08/2026",
    releaseDateTime: "05 de Agosto de 2026 • 17:00 BRT",
    type: "MINOR",
    summary: "Geração de QR Codes dinâmicos para identificação física de itens na recepção do campus e scanner de câmera integrado.",
    additions: [
      {
        id: "v120-add-1",
        title: "Gerador de Etiquetas QR Code para Itens Físicos",
        description: "Geração e impressão de etiquetas adesivas padronizadas com QR Code para fixação nos objetos armazenados na recepção.",
        module: "QR_CODE",
        tag: "Identificação",
      },
      {
        id: "v120-add-2",
        title: "Leitor de QR Code com Câmera Integrada",
        description: "Scanner embutido na aplicação para localização instantânea da ficha do objeto ao apontar a câmera do celular.",
        module: "QR_CODE",
        tag: "Scanner",
      },
      {
        id: "v120-add-3",
        title: "Visualização Restrita por QR Code (/qr/:token)",
        description: "Acesso rápido e protegido para verificação dos dados essenciais do objeto ao escanear a etiqueta física.",
        module: "QR_CODE",
        tag: "Segurança",
      },
    ],
    bugFixes: [
      {
        id: "v120-fix-1",
        title: "Ajuste na Seleção de Câmera Traseira (Environment Facing)",
        description: "Configuração do 'facingMode: environment' no MediaStream para priorizar a câmera traseira do smartphone na leitura do QR.",
        module: "QR_CODE",
        tag: "Câmera",
      },
      {
        id: "v120-fix-2",
        title: "Correção de Renderização do Canvas do QRCode",
        description: "Ajuste no contraste e margens (quiet zone) para permitir leitura rápida mesmo em condições de baixa luminosidade.",
        module: "QR_CODE",
        tag: "Renderização",
      },
    ],
  },
  {
    version: "v1.1.0",
    codename: "Claims Workflow & Dispute Resolution",
    releaseDate: "04/08/2026",
    releaseDateTime: "04 de Agosto de 2026 • 20:29 BRT",
    type: "MINOR",
    summary: "Fluxo completo de reivindicação de propriedade (claims), upload de fotos comprobatórias e sistema de mediação de devoluções pela equipe de servidores.",
    additions: [
      {
        id: "v110-add-1",
        title: "Fluxo de Reivindicação de Propriedade (Claims)",
        description: "Formulário para discentes solicitarem devolução de objetos encontrados apresentando provas de propriedade e descrição detalhada.",
        module: "ADMIN",
        tag: "Devoluções",
      },
      {
        id: "v110-add-2",
        title: "Painel de Validação e Aprovação de Reivindicações",
        description: "Interface para servidores da SEBAC aprovarem ou rejeitarem pedidos de devolução com registro de justificativa institucional.",
        module: "ADMIN",
        tag: "Moderação",
      },
      {
        id: "v110-add-3",
        title: "Sistema de Notificações Internas por Usuário",
        description: "Central de avisos no app informando atualizações de status de itens, aprovações de devolução e mensagens administrativas.",
        module: "GERAL",
        tag: "Notificações",
      },
    ],
    bugFixes: [
      {
        id: "v110-fix-1",
        title: "Prevenção de Múltiplas Reivindicações Simultâneas pelo Mesmo Usuário",
        description: "Bloqueio de envio duplicado no frontend e validação no Firestore para evitar requisições concorrentes sobre o mesmo item.",
        module: "FIRESTORE",
        tag: "Regras de Negócio",
      },
      {
        id: "v110-fix-2",
        title: "Ajuste na Atualização de Status em Tempo Real",
        description: "Sincronização imediata do badge do item ao passar para 'EM_ANALISE' ou 'DEVOLVIDO' sem necessidade de refresh manual.",
        module: "FIRESTORE",
        tag: "Tempo Real",
      },
    ],
  },
  {
    version: "v1.0.0",
    codename: "Genesis & Institutional Baseline",
    releaseDate: "04/08/2026",
    releaseDateTime: "04 de Agosto de 2026 • 08:29 BRT",
    type: "MAJOR",
    summary: "Lançamento inicial do Localiza+ para o IFPR Campus Ivaiporã: cadastro de achados e perdidos, autenticação, controle de permissões por perfil e painel institucional.",
    additions: [
      {
        id: "v100-add-1",
        title: "Módulo Principal de Achados e Perdidos",
        description: "Cadastro de itens com fotos, título, descrição, categoria padronizada, localização específica do campus e data da ocorrência.",
        module: "GERAL",
        tag: "Core",
      },
      {
        id: "v100-add-2",
        title: "Autenticação e Perfis Institucionais (RBAC)",
        description: "Suporte a múltiplos níveis de acesso: Aluno (Discente), Servidor (Docente/TAE) e Administrador (TI do Campus).",
        module: "AUTH",
        tag: "Segurança",
      },
      {
        id: "v100-add-3",
        title: "Painel de Métricas e Gráficos de Devolução (D3.js & Recharts)",
        description: "Dashboards analíticos com contagem de itens, taxa de resolução de devoluções e distribuição por categorias.",
        module: "ADMIN",
        tag: "Analytics",
      },
      {
        id: "v100-add-4",
        title: "Exportação de Relatórios em CSV e PDF",
        description: "Geração de relatórios com listagem completa de itens cadastrados para controle patrimonial e secretaria do campus.",
        module: "ADMIN",
        tag: "Relatórios",
      },
    ],
    bugFixes: [
      {
        id: "v100-fix-1",
        title: "Correção de Renderização Responsiva em Telas Pequenas",
        description: "Ajuste na grade de cards de itens para evitar corte de texto em smartphones com telas de 360px de largura.",
        module: "GERAL",
        tag: "Responsividade",
      },
      {
        id: "v100-fix-2",
        title: "Ajuste na Consulta Inicial do Firestore",
        description: "Tratamento de coleções vazias no primeiro acesso para evitar tela de loading infinita.",
        module: "FIRESTORE",
        tag: "Inicialização",
      },
    ],
  },
];

export const TOTAL_VERSIONS_COUNT = APP_VERSIONS_DATA.length;
export const TOTAL_ADDITIONS_COUNT = APP_VERSIONS_DATA.reduce((acc, v) => acc + v.additions.length, 0);
export const TOTAL_FIXES_COUNT = APP_VERSIONS_DATA.reduce((acc, v) => acc + v.bugFixes.length, 0);
export const CURRENT_VERSION = APP_VERSIONS_DATA.find((v) => v.isCurrent)?.version || APP_VERSIONS_DATA[0]?.version || "v1.8.4";
