import { TestCaseItem, TestBatteryExecution, TestParticipant } from "../types";

/**
 * Standard test templates across all 12 operational categories of Localiza+
 * IFPR Campus Ivaiporã.
 */
export const STANDARD_TEST_DEFINITIONS: Omit<TestCaseItem, "obtainedResult" | "status" | "observations" | "executedAt" | "executedBy" | "evidence">[] = [
  // 1. AUTENTICAÇÃO
  {
    id: "TEST-AUTH-01",
    category: "AUTENTICACAO",
    categoryName: "Autenticação & Controle de Sessão",
    title: "Login Válido de Usuário (Aluno / Servidor / Admin)",
    expectedResult: "Usuário autentica com sucesso no Firebase Auth, claims e perfil institucional carregados corretamente.",
    procedureSteps: [
      "1. Acessar modal de autenticação.",
      "2. Inserir e-mail institucional e senha válidos.",
      "3. Confirmar login e validar perfil, nome e permissões carregadas.",
    ],
  },
  {
    id: "TEST-AUTH-02",
    category: "AUTENTICACAO",
    categoryName: "Autenticação & Controle de Sessão",
    title: "Login Inválido e Tratamento de Credenciais Incorretas",
    expectedResult: "Sistema impede acesso, não vaza credenciais e exibe mensagem de erro clara sem travar.",
    procedureSteps: [
      "1. Inserir e-mail não cadastrado ou senha incorreta.",
      "2. Tentar autenticar.",
      "3. Verificar mensagem de erro defensiva e bloqueio de acesso.",
    ],
  },
  {
    id: "TEST-AUTH-03",
    category: "AUTENTICACAO",
    categoryName: "Autenticação & Controle de Sessão",
    title: "Logout e Encerramento Completo de Sessão",
    expectedResult: "Tokens locais são purgados, sessão do Firebase encerrada e redirecionamento seguro aplicado.",
    procedureSteps: [
      "1. Clicar em encerrar sessão no menu de perfil.",
      "2. Confirmar logout.",
      "3. Tentar acessar telas restritas e validar redirecionamento para login.",
    ],
  },
  {
    id: "TEST-AUTH-04",
    category: "AUTENTICACAO",
    categoryName: "Autenticação & Controle de Sessão",
    title: "Recuperação de Acesso e Redefinição de Senha",
    expectedResult: "Fluxo de envio de e-mail de redefinição acionado com validação de formato e feedback visual.",
    procedureSteps: [
      "1. Clicar em 'Esqueci minha senha'.",
      "2. Inserir e-mail cadastrado.",
      "3. Verificar confirmação de despacho do e-mail de redefinição.",
    ],
  },
  {
    id: "TEST-AUTH-05",
    category: "AUTENTICACAO",
    categoryName: "Autenticação & Controle de Sessão",
    title: "Controle de Permissões e Acesso RBAC (Aluno vs Servidor vs Admin)",
    expectedResult: "Alunos são impedidos de visualizar abas administrativas e servidores/admins possuem acesso auditado.",
    procedureSteps: [
      "1. Autenticar como aluno.",
      "2. Tentar acessar rotas de auditoria e configurações.",
      "3. Verificar bloqueio por AdminGuard e regras do Firestore.",
    ],
  },

  // 2. CADASTRO (CRÍTICO)
  {
    id: "TEST-CAD-PERSIST-01",
    category: "CADASTRO",
    categoryName: "Cadastro & Persistência de Dados",
    title: "Persistência de Cadastro após Atualização da Página (F5)",
    expectedResult: "Item cadastrado recebe ID real do Firestore, sobrevive ao recarregamento completo da página (F5) e permanece disponível na listagem institucional.",
    isCriticalPersistence: true,
    procedureSteps: [
      "1. Criar um registro de teste com dados claramente identificados como ambiente de teste.",
      "2. Enviar o formulário de cadastro.",
      "3. Aguardar a confirmação real de sucesso fornecida pelo backend/Firestore.",
      "4. Confirmar que o registro recebeu seu identificador persistido (ID único).",
      "5. Sair da tela ou atualizar a página com F5.",
      "6. Reabrir a listagem de achados e perdidos.",
      "7. Localizar o registro pelo identificador.",
      "8. Confirmar que todos os dados permanecem disponíveis.",
      "9. Confirmar diretamente a persistência no backend/Firestore.",
      "10. Registrar o resultado e evidência no relatório.",
    ],
  },
  {
    id: "TEST-CAD-DUP-01",
    category: "CADASTRO",
    categoryName: "Cadastro & Persistência de Dados",
    title: "Proteção contra Duplo Clique e Submissão Repetida",
    expectedResult: "Sistema desabilita o botão após primeiro clique, bloqueia envios múltiplos e impede criação de registros duplicados no banco.",
    procedureSteps: [
      "1. Preencher formulário de cadastro.",
      "2. Realizar cliques repetidos e rápidos no botão de submissão.",
      "3. Verificar bloqueio por estado de loading e conferir apenas 1 registro gerado no Firestore.",
    ],
  },
  {
    id: "TEST-CAD-DUP-02",
    category: "CADASTRO",
    categoryName: "Cadastro & Persistência de Dados",
    title: "Submissão Simultânea e Abertura em Duas Abas",
    expectedResult: "Ao abrir formulário em duas abas com os mesmos dados, sistema trata conflitos e não corrompe a coleção.",
    procedureSteps: [
      "1. Abrir duas abas do navegador na mesma conta.",
      "2. Submeter registros quase em paralelo.",
      "3. Validar integridade dos IDs únicos atribuídos.",
    ],
  },
  {
    id: "TEST-CAD-02",
    category: "CADASTRO",
    categoryName: "Cadastro & Persistência de Dados",
    title: "Cadastro de Item Perdido com Localização e Contato",
    expectedResult: "Registro persistido no Firestore com status 'PERDIDO' e vinculado ao usuário autenticado.",
    procedureSteps: [
      "1. Acessar aba de cadastro de item perdido.",
      "2. Preencher título, categoria, local no campus e descrição.",
      "3. Submeter e verificar gravação no Firestore.",
    ],
  },
  {
    id: "TEST-CAD-03",
    category: "CADASTRO",
    categoryName: "Cadastro & Persistência de Dados",
    title: "Cadastro de Item Encontrado com QR Code Gerado",
    expectedResult: "Registro gravado com status 'ENCONTRADO' ou 'DISPONIVEL' e identificador QR code atribuído.",
    procedureSteps: [
      "1. Acessar formulário de item encontrado.",
      "2. Preencher informações do pertence e local da entrega na portaria/SEBAC.",
      "3. Confirmar persistência e conferir QR code do objeto.",
    ],
  },
  {
    id: "TEST-CAD-04",
    category: "CADASTRO",
    categoryName: "Cadastro & Persistência de Dados",
    title: "Validação dos Campos Obrigatórios e Bloqueio de Submissão Vazia",
    expectedResult: "Botão desabilitado ou validação em tempo real impedindo envio com dados incompletos.",
    procedureSteps: [
      "1. Deixar campos obrigatórios em branco.",
      "2. Tentar submeter o formulário.",
      "3. Verificar mensagens de validação e bloqueio de envio indevido.",
    ],
  },
  {
    id: "TEST-CAD-05",
    category: "CADASTRO",
    categoryName: "Cadastro & Persistência de Dados",
    title: "Upload e Compressão Local de Imagens",
    expectedResult: "Imagem é comprimida no cliente antes do upload, preservando legibilidade e reduzindo consumo de banda.",
    procedureSteps: [
      "1. Selecionar foto em alta resolução (>3MB).",
      "2. Verificar indicador de compressão e preview da imagem.",
      "3. Confirmar persistência da imagem no registro.",
    ],
  },
  {
    id: "TEST-CAD-06",
    category: "CADASTRO",
    categoryName: "Cadastro & Persistência de Dados",
    title: "Prevenção de Duplicidade por Duplo Clique ou Reenvio Rápido",
    expectedResult: "Botão de envio é desabilitado imediatamente no primeiro clique e spinner de progresso é exibido, impedindo criação de registros duplicados.",
    procedureSteps: [
      "1. Preencher formulário de cadastro.",
      "2. Executar duplo clique rápido no botão 'Salvar Pertence'.",
      "3. Verificar que apenas 1 registro foi criado no Firestore.",
    ],
  },
  {
    id: "TEST-CAD-07",
    category: "CADASTRO",
    categoryName: "Cadastro & Persistência de Dados",
    title: "Tratamento de Erro de Conexão durante o Cadastro",
    expectedResult: "Em caso de falha de rede, os dados preenchidos não são perdidos e mensagem de erro transparente é exibida.",
    procedureSteps: [
      "1. Simular falha de rede/timeout.",
      "2. Tentar submeter formulário.",
      "3. Verificar que formulário retém dados digitados e oferece opção de tentar novamente.",
    ],
  },

  // 3. ACHADOS E PERDIDOS
  {
    id: "TEST-ACH-01",
    category: "ACHADOS_PERDIDOS",
    categoryName: "Catálogo & Ciclo de Vida do Objeto",
    title: "Transição e Alteração de Status do Item (PERDIDO → ENCONTRADO → DEVOLVIDO)",
    expectedResult: "Status atualizado com integridade no Firestore e histórico de auditoria gravado.",
    procedureSteps: [
      "1. Selecionar item sob custódia.",
      "2. Alterar status para 'EM_ANALISE' ou 'DEVOLVIDO'.",
      "3. Validar atualização no banco de dados e refletida na listagem.",
    ],
  },
  {
    id: "TEST-ACH-02",
    category: "ACHADOS_PERDIDOS",
    categoryName: "Catálogo & Ciclo de Vida do Objeto",
    title: "Consulta, Busca Textual e Filtros por Local e Categoria",
    expectedResult: "Busca indexada filtra itens em tempo real sem erros visuais ou lentidão.",
    procedureSteps: [
      "1. Digitar termo de busca no campo de pesquisa.",
      "2. Aplicar filtro de categoria (ex: Eletrônicos) e local (ex: Bloco A).",
      "3. Conferir se resultados correspondem com precisão aos filtros.",
    ],
  },
  {
    id: "TEST-ACH-03",
    category: "ACHADOS_PERDIDOS",
    categoryName: "Catálogo & Ciclo de Vida do Objeto",
    title: "Sincronização em Tempo Real (Firestore onSnapshot)",
    expectedResult: "Alterações feitas por outros usuários ou administradores aparecem automaticamente na tela.",
    procedureSteps: [
      "1. Abrir listagem em duas abas/dispositivos.",
      "2. Alterar status em uma das abas.",
      "3. Verificar atualização imediata na outra aba sem necessidade de recarregar a página.",
    ],
  },
  {
    id: "TEST-ACH-04",
    category: "ACHADOS_PERDIDOS",
    categoryName: "Catálogo & Ciclo de Vida do Objeto",
    title: "Registro de Devolução e Baixa Institucional",
    expectedResult: "Dados do recebedor (nome, matrícula/vínculo, documento) gravados e item marcado como DEVOLVIDO.",
    procedureSteps: [
      "1. Abrir modal de devolução de objeto sob custódia.",
      "2. Inserir dados do proprietário identificado.",
      "3. Confirmar devolução e validar gravação permanente.",
    ],
  },

  // 4. REIVINDICAÇÕES
  {
    id: "TEST-REIV-01",
    category: "REIVINDICACOES",
    categoryName: "Reivindicações & Validação de Propriedade",
    title: "Abertura de Solicitação de Reivindicação de Pertence",
    expectedResult: "Reivindicação registrada na coleção 'item_claims' com status 'PENDENTE' associada ao solicitante.",
    procedureSteps: [
      "1. Localizar item encontrado pertencente ao usuário.",
      "2. Clicar em 'Reivindicar Pertence' e preencher detalhes comprobatórios.",
      "3. Enviar e validar criação da reivindicação.",
    ],
  },
  {
    id: "TEST-REIV-02",
    category: "REIVINDICACOES",
    categoryName: "Reivindicações & Validação de Propriedade",
    title: "Upload de Evidências e Comprovantes de Posse",
    expectedResult: "Fotos e notas fiscais anexadas com segurança ao pedido de reivindicação.",
    procedureSteps: [
      "1. Anexar imagem comprobatória no formulário de reivindicação.",
      "2. Submeter formulário.",
      "3. Confirmar que a equipe gestora consegue visualizar a evidência.",
    ],
  },
  {
    id: "TEST-REIV-03",
    category: "REIVINDICACOES",
    categoryName: "Reivindicações & Validação de Propriedade",
    title: "Aprovação de Reivindicação por Servidor Autorizado",
    expectedResult: "Reivindicação aprovada, item marcado como proprietário identificado e notificação disparada.",
    procedureSteps: [
      "1. Acessar painel de reivindicações como Servidor/Admin.",
      "2. Avaliar evidências e clicar em 'Aprovar'.",
      "3. Conferir atualização no Firestore e notificação ao requerente.",
    ],
  },
  {
    id: "TEST-REIV-04",
    category: "REIVINDICACOES",
    categoryName: "Reivindicações & Validação de Propriedade",
    title: "Rejeição Fundamentada com Justificativa Institucional",
    expectedResult: "Rejeição registrada com motivo explícito, notificando o requerente com transparência.",
    procedureSteps: [
      "1. Rejeitar reivindicação com justificativa obrigatória.",
      "2. Submeter decisão.",
      "3. Conferir status 'REJEITADO' e histórico arquivado.",
    ],
  },
  {
    id: "TEST-REIV-05",
    category: "REIVINDICACOES",
    categoryName: "Reivindicações & Validação de Propriedade",
    title: "Prevenção de Solicitações Duplicadas para o Mesmo Item",
    expectedResult: "Sistema impede que o mesmo usuário abra múltiplas reivindicações pendentes para o mesmo objeto.",
    procedureSteps: [
      "1. Tentar abrir uma segunda reivindicação para um item com processo em andamento.",
      "2. Verificar aviso de bloqueio e link para o processo existente.",
    ],
  },

  // 5. QR CODE
  {
    id: "TEST-QR-01",
    category: "QR_CODE",
    categoryName: "Sistema de QR Code & Rastreabilidade",
    title: "Geração de QR Code Criptográfico e Rastreável",
    expectedResult: "QR Code gerado com payload seguro contendo identificador único do objeto no Campus Ivaiporã.",
    procedureSteps: [
      "1. Cadastrar ou consultar item encontrado.",
      "2. Abrir visualização de QR Code do pertence.",
      "3. Validar se o código gerado contém a URL e hash corretos.",
    ],
  },
  {
    id: "TEST-QR-02",
    category: "QR_CODE",
    categoryName: "Sistema de QR Code & Rastreabilidade",
    title: "Impressão e Download de Etiquetas com QR Code",
    expectedResult: "Etiqueta formatada para impressão direta com título, código, data e instruções de devolução.",
    procedureSteps: [
      "1. Clicar em 'Imprimir Etiqueta / QR Code'.",
      "2. Validar layout na janela de impressão/PDF.",
    ],
  },
  {
    id: "TEST-QR-03",
    category: "QR_CODE",
    categoryName: "Sistema de QR Code & Rastreabilidade",
    title: "Leitura de QR Code via Câmera Traseira do Dispositivo",
    expectedResult: "Scanner acessa câmera traseira com controle de permissão e decodifica o código instantaneamente.",
    procedureSteps: [
      "1. Abrir leitor de QR Code no app.",
      "2. Apontar para etiqueta de teste.",
      "3. Validar abertura imediata da página detalhada do objeto.",
    ],
  },
  {
    id: "TEST-QR-04",
    category: "QR_CODE",
    categoryName: "Sistema de QR Code & Rastreabilidade",
    title: "Tratamento de Token / QR Code Inválido ou Inexistente",
    expectedResult: "Sistema exibe tela de 'Pertence não localizado' com opções de busca sem travar o scanner.",
    procedureSteps: [
      "1. Escanear QR Code com código inexistente.",
      "2. Conferir mensagem amigável e botão de retorno seguro.",
    ],
  },
  {
    id: "TEST-QR-05",
    category: "QR_CODE",
    categoryName: "Sistema de QR Code & Rastreabilidade",
    title: "Consulta de Item após Leitura de QR Code e Atualização (F5)",
    expectedResult: "Página do item aberto via QR Code mantém todos os dados após recarregamento do navegador.",
    procedureSteps: [
      "1. Acessar item via scanner.",
      "2. Pressionar F5.",
      "3. Verificar persistência da visualização.",
    ],
  },

  // 6. INTELIGÊNCIA ARTIFICIAL
  {
    id: "TEST-IA-01",
    category: "IA_GEMINI",
    categoryName: "Inteligência Artificial & Visão Computacional",
    title: "Análise Visual de Imagem de Pertence via API Gemini",
    expectedResult: "Backend processa a imagem de forma segura e retorna descrição detalhada, cores e provável objeto.",
    procedureSteps: [
      "1. Carregar imagem de um objeto na tela de análise.",
      "2. Clicar em 'Analisar com IA'.",
      "3. Conferir metadados extraídos pelo modelo multimodal.",
    ],
  },
  {
    id: "TEST-IA-02",
    category: "IA_GEMINI",
    categoryName: "Inteligência Artificial & Visão Computacional",
    title: "Categorização Automática e Preenchimento Inteligente",
    expectedResult: "Formulário de cadastro é pré-populado com categoria, cor e marca sugeridas pela IA.",
    procedureSteps: [
      "1. Usar a sugestão gerada pela análise.",
      "2. Clicar em 'Preencher Cadastro'.",
      "3. Validar campos preenchidos no formulário.",
    ],
  },
  {
    id: "TEST-IA-03",
    category: "IA_GEMINI",
    categoryName: "Inteligência Artificial & Visão Computacional",
    title: "Smart Match entre Itens Perdidos e Encontrados",
    expectedResult: "Algoritmo de correspondência calcula similaridade semântica e sugere possíveis proprietários.",
    procedureSteps: [
      "1. Executar Smart Match em item perdido com características similares a achados.",
      "2. Verificar lista de itens compatíveis com percentual de relevância.",
    ],
  },
  {
    id: "TEST-IA-04",
    category: "IA_GEMINI",
    categoryName: "Inteligência Artificial & Visão Computacional",
    title: "Tratamento de Quota / Erro de API de IA",
    expectedResult: "Caso a API retorne erro ou limite excedido, sistema informa fallback gracioso sem interromper o fluxo manual.",
    procedureSteps: [
      "1. Simular indisponibilidade temporária do serviço de IA.",
      "2. Verificar mensagem informativa e continuidade do cadastro manual.",
    ],
  },

  // 7. PWA / MOBILE
  {
    id: "TEST-PWA-01",
    category: "PWA_MOBILE",
    categoryName: "PWA, Responsividade & Operação Offline",
    title: "Instalação do Aplicativo via Web App Manifest (PWA)",
    expectedResult: "Banner de instalação do PWA exibido em navegadores compatíveis com ícones institucionais do IFPR.",
    procedureSteps: [
      "1. Acessar app no smartphone ou navegador desktop.",
      "2. Acionar banner 'Instalar Localiza+'.",
      "3. Conferir abertura em janela autônoma (standalone).",
    ],
  },
  {
    id: "TEST-PWA-02",
    category: "PWA_MOBILE",
    categoryName: "PWA, Responsividade & Operação Offline",
    title: "Responsividade e Touch Targets em Dispositivos Móveis",
    expectedResult: "Todos os botões e áreas de toque possuem no mínimo 44px e layout se adapta a telas pequenas sem rolagem horizontal.",
    procedureSteps: [
      "1. Testar interface em viewport de 360px a 420px de largura.",
      "2. Verificar navbar inferior, cards e formulários.",
    ],
  },
  {
    id: "TEST-PWA-03",
    category: "PWA_MOBILE",
    categoryName: "PWA, Responsividade & Operação Offline",
    title: "Diferenciação entre Dados em Cache/IndexedDB vs Persistência Definitiva",
    expectedResult: "App sinaliza visualmente quando dados estão em fila de sincronização offline e confirma quando persistidos no backend.",
    procedureSteps: [
      "1. Desconectar temporariamente a rede.",
      "2. Realizar ação suportada em cache.",
      "3. Verificar badge 'Aguardando sincronização' em vez de falso sucesso definitivo.",
    ],
  },
  {
    id: "TEST-PWA-04",
    category: "PWA_MOBILE",
    categoryName: "PWA, Responsividade & Operação Offline",
    title: "Recuperação e Sincronização após Reconexão de Rede",
    expectedResult: "Ao restabelecer internet, dados pendentes são sincronizados e validados com o Firestore.",
    procedureSteps: [
      "1. Reconectar rede.",
      "2. Validar envio da fila pendente.",
      "3. Confirmar gravação real no Firestore.",
    ],
  },
  {
    id: "TEST-PWA-05",
    category: "PWA_MOBILE",
    categoryName: "PWA, Responsividade & Operação Offline",
    title: "Feedback Háptico nas Ações Críticas (Vibration API)",
    expectedResult: "Dispositivos móveis com suporte vibram sutilmente em cliques, confirmações e avisos de erro.",
    procedureSteps: [
      "1. Executar ações em dispositivo móvel físico.",
      "2. Confirmar disparo de vibração háptica nos eventos configurados.",
    ],
  },

  // 8. DOCUMENTOS
  {
    id: "TEST-DOC-01",
    category: "DOCUMENTOS",
    categoryName: "Geração de Documentos Oficiais & Assinatura",
    title: "Geração de PDF do Termo Oficial de Devolução (jsPDF)",
    expectedResult: "PDF gerado com cabeçalho institucional do IFPR Campus Ivaiporã, protocolo e campos preenchidos.",
    procedureSteps: [
      "1. Emitir termo de devolução a partir do modal de entrega.",
      "2. Baixar documento e inspecionar layout e quebra de páginas.",
    ],
  },
  {
    id: "TEST-DOC-02",
    category: "DOCUMENTOS",
    categoryName: "Geração de Documentos Oficiais & Assinatura",
    title: "Declaração de Perda de Pertence com Protocolo",
    expectedResult: "Documento oficial emitido com declaração de extravio e dados do discente/servidor para fins de comprovação.",
    procedureSteps: [
      "1. Emitir declaração de perda na tela do item.",
      "2. Verificar numeração e protocolo gerados.",
    ],
  },
  {
    id: "TEST-DOC-03",
    category: "DOCUMENTOS",
    categoryName: "Geração de Documentos Oficiais & Assinatura",
    title: "Termo de Destinação / Descarte após 90 Dias de Custódia",
    expectedResult: "Emissão de termo legal de doação ou descarte para itens não reclamados conforme regimento.",
    procedureSteps: [
      "1. Localizar item com mais de 90 dias em custódia.",
      "2. Emitir termo de destinação.",
      "3. Validar assinatura e fundamentação normativa no PDF.",
    ],
  },
  {
    id: "TEST-DOC-04",
    category: "DOCUMENTOS",
    categoryName: "Geração de Documentos Oficiais & Assinatura",
    title: "Comprovante com Hash SHA-256 e Metadados Criptográficos",
    expectedResult: "Comprovante de entrega contém ID de transação, carimbo temporal e hash de validação conforme MP 2.200-2/2001.",
    procedureSteps: [
      "1. Concluir devolução com assinatura digital.",
      "2. Clicar em 'Download Comprovante'.",
      "3. Inspecionar hash SHA-256 e metadados de auditoria no PDF.",
    ],
  },
  {
    id: "TEST-DOC-05",
    category: "DOCUMENTOS",
    categoryName: "Geração de Documentos Oficiais & Assinatura",
    title: "Assinatura Digital (Canvas Presencial e Remota por E-mail)",
    expectedResult: "Assinatura coletada na tela sensível ao toque ou validada via token seguro enviado ao e-mail institucional.",
    procedureSteps: [
      "1. Testar assinatura no canvas de desenho.",
      "2. Confirmar aposição da assinatura no termo e gravação da evidência.",
    ],
  },

  // 9. NOTIFICAÇÕES
  {
    id: "TEST-NOTIF-01",
    category: "NOTIFICACOES",
    categoryName: "Notificações & Integrações Externas",
    title: "Notificação em Tempo Real no App para o Usuário",
    expectedResult: "Notificação gravada na coleção 'notifications' e exibida no sino de alertas com contador não lido.",
    procedureSteps: [
      "1. Disparar alteração de status em item do usuário.",
      "2. Conferir exibição do sino de alertas com badge.",
    ],
  },
  {
    id: "TEST-NOTIF-02",
    category: "NOTIFICACOES",
    categoryName: "Notificações & Integrações Externas",
    title: "Alerta Administrativo de Novos Cadastros e Reivindicações",
    expectedResult: "Administradores recebem alerta sobre novos pertences entregues na portaria.",
    procedureSteps: [
      "1. Cadastrar novo item encontrado.",
      "2. Validar notificação na conta de administrador.",
    ],
  },
  {
    id: "TEST-NOTIF-03",
    category: "NOTIFICACOES",
    categoryName: "Notificações & Integrações Externas",
    title: "Integração e Envio de Mensagem ao Canal do Discord do IFPR",
    expectedResult: "Webhook oficial do Discord recebe payload formatado com foto, título, local e link seguro do Localiza+.",
    procedureSteps: [
      "1. Cadastrar novo achado.",
      "2. Verificar mensagem postada no canal de achados e perdidos do Discord.",
    ],
  },
  {
    id: "TEST-NOTIF-04",
    category: "NOTIFICACOES",
    categoryName: "Notificações & Integrações Externas",
    title: "Tratamento de Falha ou Timeout no Webhook do Discord",
    expectedResult: "Falha externa do Discord é capturada em logs sem interromper o salvamento do item no Firestore.",
    procedureSteps: [
      "1. Simular falha de envio ao webhook.",
      "2. Confirmar que o cadastro do item é concluído com sucesso e o erro é registrado no log.",
    ],
  },
  {
    id: "TEST-NOTIF-05",
    category: "NOTIFICACOES",
    categoryName: "Notificações & Integrações Externas",
    title: "Prevenção de Envio de Notificações para Usuários Incorretos",
    expectedResult: "Filtro rigoroso por userId garante que somente o proprietário ou claimer receba alertas privados.",
    procedureSteps: [
      "1. Verificar isolamento de notificações entre contas de discentes distintos.",
    ],
  },

  // 10. SEGURANÇA
  {
    id: "TEST-SEG-01",
    category: "SEGURANCA",
    categoryName: "Segurança, Auditoria & Controle de Acesso",
    title: "Controle de Acesso às Rotas e Operações Administrativas",
    expectedResult: "Firestore Security Rules bloqueiam escrita direta de alunos em coleções de auditoria, backups e sistema.",
    procedureSteps: [
      "1. Tentar executar escrita não autorizada via SDK como discente.",
      "2. Validar rejeição por 'permission-denied' nas regras de segurança.",
    ],
  },
  {
    id: "TEST-SEG-02",
    category: "SEGURANCA",
    categoryName: "Segurança, Auditoria & Controle de Acesso",
    title: "Bloqueio de Reutilização de Token de Assinatura (One-Time Token)",
    expectedResult: "Após primeira utilização, token é invalidado e novas tentativas de assinatura são rejeitadas.",
    procedureSteps: [
      "1. Concluir assinatura remota com token.",
      "2. Tentar acessar link de assinatura novamente.",
      "3. Conferir tela de 'Link já utilizado / expirado'.",
    ],
  },
  {
    id: "TEST-SEG-03",
    category: "SEGURANCA",
    categoryName: "Segurança, Auditoria & Controle de Acesso",
    title: "Imutabilidade da Trilha de Auditoria (Activity Logs)",
    expectedResult: "Logs em 'activity_logs' possuem regras de segurança que proíbem update e delete por qualquer usuário.",
    procedureSteps: [
      "1. Verificar regras do Firestore.",
      "2. Confirmar que logs nunca podem ser apagados ou modificados retroativamente.",
    ],
  },
  {
    id: "TEST-SEG-04",
    category: "SEGURANCA",
    categoryName: "Segurança, Auditoria & Controle de Acesso",
    title: "Proteção de Credenciais e Ausência de Secrets no Código Cliente",
    expectedResult: "Chaves de API sensíveis são mantidas em ambiente seguro e não expostas no bundle do navegador.",
    procedureSteps: [
      "1. Inspecionar variáveis de ambiente e código compilado.",
      "2. Confirmar conformidade com as diretrizes de segurança.",
    ],
  },

  // 11. APIS / PRODUÇÃO
  {
    id: "TEST-API-01",
    category: "APIS_PRODUCAO",
    categoryName: "Endpoints de API, Respostas HTTP & Resiliência",
    title: "Respostas HTTP 200 em Endpoints Operacionais e Health Check",
    expectedResult: "Endpoint /api/health e rotas ativas retornam status 200 com payload estruturado em JSON.",
    procedureSteps: [
      "1. Realizar requisição GET para /api/health.",
      "2. Validar status 200 e resposta { status: 'ok' }.",
    ],
  },
  {
    id: "TEST-API-02",
    category: "APIS_PRODUCAO",
    categoryName: "Endpoints de API, Respostas HTTP & Resiliência",
    title: "Tratamento Robusto de Erros HTTP (400, 401, 403, 404 e 500)",
    expectedResult: "Respostas de erro retornam mensagens explicativas sem derrubar o servidor Express.",
    procedureSteps: [
      "1. Enviar payload inválido para endpoints de API.",
      "2. Verificar status HTTP correspondente e mensagem de erro estruturada.",
    ],
  },
  {
    id: "TEST-API-03",
    category: "APIS_PRODUCAO",
    categoryName: "Endpoints de API, Respostas HTTP & Resiliência",
    title: "Timeout e Resiliência em Conexões Instáveis",
    expectedResult: "Requisições que ultrapassam tempo limite são abortadas com segurança (AbortController) e usuário informado.",
    procedureSteps: [
      "1. Simular latência excessiva.",
      "2. Conferir cancelamento gracioso após timeout pré-configurado.",
    ],
  },

  // 12. MONITORAMENTO
  {
    id: "TEST-MON-01",
    category: "MONITORAMENTO",
    categoryName: "Monitoramento de Uptime, Latência & Logs de Erro",
    title: "Monitoramento em Tempo Real de Uptime e Latência do Sistema",
    expectedResult: "Painel administrativo exibe status real de conectividade, ping do Firestore e tempo de resposta.",
    procedureSteps: [
      "1. Acessar monitor de integridade na aba de administração.",
      "2. Conferir métricas de latência em milissegundos e disponibilidade calculada.",
    ],
  },
  {
    id: "TEST-MON-02",
    category: "MONITORAMENTO",
    categoryName: "Monitoramento de Uptime, Latência & Logs de Erro",
    title: "Captura Centralizada de Erros Frontend (Error Boundary)",
    expectedResult: "Falhas inesperadas em componentes são contidas pelo Error Boundary, permitindo recuperação com botão de recarregar.",
    procedureSteps: [
      "1. Simular exceção controlada.",
      "2. Validar tela de contenção sem travamento geral da aplicação.",
    ],
  },
  {
    id: "TEST-MON-03",
    category: "MONITORAMENTO",
    categoryName: "Monitoramento de Uptime, Latência & Logs de Erro",
    title: "Registro de Exceções Críticas na Coleção /error_logs",
    expectedResult: "Erros não tratados são persistidos no Firestore com stack trace sanitizado e timestamp para auditoria.",
    procedureSteps: [
      "1. Verificar gravação de logs de erro na coleção.",
      "2. Validar isolamento de dados confidenciais.",
    ],
  },
];

/**
 * Creates a fresh, standardized test battery execution populated with the official test cases.
 */
export function createNewTestBatteryExecution(
  id: string,
  responsibleName: string,
  responsibleEmail: string,
  environment: "Desenvolvimento" | "Homologação" | "Produção" = "Homologação",
  systemVersion: string = "v1.8.4",
  title?: string,
  description?: string,
  participants?: TestParticipant[]
): TestBatteryExecution {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const tests: TestCaseItem[] = STANDARD_TEST_DEFINITIONS.map((t) => ({
    ...t,
    obtainedResult: "Pendente de validação no ciclo ativo.",
    status: "NAO_EXECUTADO",
    observations: "",
  }));

  return {
    id,
    title: title || `Bateria de Testes Institucional ${id}`,
    name: title || `Bateria de Testes ${id}`,
    description: description || "Bateria de testes colaborativa e validação de conformidade técnica do Localiza+ IFPR Campus Ivaiporã.",
    testDate: dateStr,
    startTime: timeStr,
    endTime: "",
    responsible: responsibleName || "Administrador Autorizado",
    responsibleEmail: responsibleEmail || "localizamais6@gmail.com",
    environment,
    systemVersion,
    commitOrBuild: `build-${Date.now().toString(36).slice(-6)}`,
    browser: "Google Chrome 128 / Edge (V8)",
    device: "Desktop & Mobile IFPR",
    os: "Windows 11 / Android 14 / Linux",
    overallStatus: "EM_EXECUCAO",
    status: "EM_EXECUCAO",
    observations: "Bateria de testes e homologação oficial em tempo real com controle de participantes e auditoria.",
    participants: participants || [],
    tests,
    auditTrail: [
      {
        id: `audit-${Date.now()}`,
        changedAt: now.toISOString(),
        changedBy: responsibleName || "Administrador",
        changedByEmail: responsibleEmail || "",
        changeType: "CREATE",
        description: `Bateria de testes ${id} criada com ${tests.length} casos de teste e ${participants?.length || 0} participantes atribuídos.`,
      },
    ],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    createdBy: responsibleName || "Administrador",
    createdByEmail: responsibleEmail || "",
  };
}

/**
 * Calculates accurate duration between startTime (HH:MM) and endTime (HH:MM)
 */
export function calculateTestDuration(startTime?: string, endTime?: string): string {
  const start = (startTime || "").trim();
  const end = (endTime || "").trim();

  if (!start && !end) {
    return "Não calculado";
  }

  if (start && !end) {
    return "Em andamento";
  }

  if (!start && end) {
    return "Não calculado";
  }

  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);

  if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) {
    return "Não calculado";
  }

  let totalStartMinutes = startH * 60 + startM;
  let totalEndMinutes = endH * 60 + endM;

  if (totalEndMinutes < totalStartMinutes) {
    // Crosses midnight
    totalEndMinutes += 24 * 60;
  }

  const diffMinutes = totalEndMinutes - totalStartMinutes;
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;

  if (hours === 0 && minutes === 0) {
    return "0min";
  }
  if (hours === 0) {
    return `${minutes}min`;
  }
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h${String(minutes).padStart(2, "0")}min`;
}

/**
 * Calculates battery metrics derived strictly from actual recorded test results.
 */
export function calculateBatterySummary(battery: TestBatteryExecution) {
  const tests = battery?.tests || [];
  const total = tests.length;
  const passed = tests.filter((t) => t.status === "APROVADO").length;
  const failed = tests.filter((t) => t.status === "REPROVADO").length;
  const inProgress = tests.filter((t) => t.status === "EM_EXECUCAO").length;
  const notExecuted = tests.filter((t) => t.status === "NAO_EXECUTADO").length;
  const pending = tests.filter((t) => t.status === "PENDENTE").length;
  const blocked = tests.filter((t) => t.status === "BLOQUEADO").length;

  const completed = passed + failed;
  const executed = completed + pending + blocked + inProgress;
  const passRate = completed > 0 ? ((passed / completed) * 100).toFixed(1) : "0.0";
  const completionRate = total > 0 ? ((completed / total) * 100).toFixed(1) : "0.0";
  const duration = calculateTestDuration(battery?.startTime, battery?.endTime);

  return {
    total,
    passed,
    failed,
    inProgress,
    notExecuted,
    pending,
    blocked,
    completed,
    executed,
    evaluated: completed,
    passRate,
    completionRate,
    duration,
  };
}

/**
 * Calculates metrics grouped by participant for a test battery.
 */
export function calculateParticipantMetrics(battery: TestBatteryExecution) {
  const tests = battery?.tests || [];
  const participants = battery?.participants || [];

  return participants.map((p) => {
    const assignedTests = tests.filter(
      (t) =>
        t.assignedToUserId === p.id ||
        (t.assignedToEmail && t.assignedToEmail.toLowerCase() === p.email.toLowerCase())
    );

    const totalAssigned = assignedTests.length;
    const passed = assignedTests.filter((t) => t.status === "APROVADO").length;
    const failed = assignedTests.filter((t) => t.status === "REPROVADO").length;
    const inProgress = assignedTests.filter((t) => t.status === "EM_EXECUCAO").length;
    const pending = assignedTests.filter((t) => t.status === "PENDENTE").length;
    const blocked = assignedTests.filter((t) => t.status === "BLOQUEADO").length;
    const notExecuted = assignedTests.filter((t) => t.status === "NAO_EXECUTADO").length;
    const completed = passed + failed;

    const completionRate = totalAssigned > 0 ? ((completed / totalAssigned) * 100).toFixed(1) : "0.0";
    const passRate = completed > 0 ? ((passed / completed) * 100).toFixed(1) : "0.0";

    return {
      participantId: p.id,
      name: p.name,
      email: p.email,
      globalRole: p.globalRole,
      contextualRole: p.contextualRole || "TESTADOR",
      status: p.status || "ATIVO",
      assignedCount: totalAssigned,
      completedCount: completed,
      passedCount: passed,
      failedCount: failed,
      inProgressCount: inProgress,
      pendingCount: pending,
      blockedCount: blocked,
      notExecutedCount: notExecuted,
      completionRate,
      passRate,
    };
  });
}

/**
 * Calculates test statistics grouped by category.
 */
export function calculateCategoryMetrics(battery: TestBatteryExecution) {
  const tests = battery?.tests || [];
  const categoryMap: Record<
    string,
    {
      category: string;
      categoryName: string;
      total: number;
      passed: number;
      failed: number;
      inProgress: number;
      pending: number;
      blocked: number;
      notExecuted: number;
    }
  > = {};

  tests.forEach((t) => {
    if (!categoryMap[t.category]) {
      categoryMap[t.category] = {
        category: t.category,
        categoryName: t.categoryName || t.category,
        total: 0,
        passed: 0,
        failed: 0,
        inProgress: 0,
        pending: 0,
        blocked: 0,
        notExecuted: 0,
      };
    }
    const cat = categoryMap[t.category];
    cat.total += 1;
    if (t.status === "APROVADO") cat.passed += 1;
    else if (t.status === "REPROVADO") cat.failed += 1;
    else if (t.status === "EM_EXECUCAO") cat.inProgress += 1;
    else if (t.status === "PENDENTE") cat.pending += 1;
    else if (t.status === "BLOQUEADO") cat.blocked += 1;
    else cat.notExecuted += 1;
  });

  return Object.values(categoryMap).map((cat) => {
    const completed = cat.passed + cat.failed;
    const completionRate = cat.total > 0 ? ((completed / cat.total) * 100).toFixed(1) : "0.0";
    const passRate = completed > 0 ? ((cat.passed / completed) * 100).toFixed(1) : "0.0";
    return {
      ...cat,
      completed,
      completionRate,
      passRate,
    };
  });
}

/**
 * Initial historical executions to seed when no prior executions exist in Firestore.
 */
export const INITIAL_TEST_BATTERIES: TestBatteryExecution[] = [
  {
    id: "BT-2026-001",
    title: "Bateria de Testes Oficial & Homologação v1.8.3",
    name: "Bateria de Homologação Institucional BT-2026-001",
    description: "Bateria inicial de validação dos módulos de autenticação, persistência após F5, emissão de comprovantes de devolução com hash SHA-256 e métricas em D3.js.",
    testDate: "2026-08-31",
    startTime: "14:00",
    endTime: "15:25",
    responsible: "Equipe de TI & SEBAC Campus Ivaiporã",
    responsibleEmail: "localizamais6@gmail.com",
    environment: "Produção",
    systemVersion: "v1.8.3",
    commitOrBuild: "build-20260831-v183",
    browser: "Google Chrome 128 / Edge",
    device: "Desktop / Smartphone Android 14",
    os: "Windows 11 / Android 14",
    overallStatus: "CONCLUIDO",
    status: "CONCLUIDO",
    observations: "Bateria inicial de validação dos módulos de autenticação, persistência após F5, emissão de comprovantes de devolução com hash SHA-256 e métricas em D3.js.",
    participants: [
      {
        id: "usr-admin-paulo",
        name: "Paulo Cauan",
        email: "paulocauan39@gmail.com",
        globalRole: "ADMIN",
        contextualRole: "TESTADOR",
        status: "ATIVO",
        assignedCategories: ["AUTENTICACAO", "CADASTRO", "SEGURANCA"],
        assignedTestCount: 15,
        completedTestCount: 15,
        passedTestCount: 15,
        failedTestCount: 0,
        addedAt: "2026-08-31T13:30:00.000Z",
        addedBy: "Administrador Geral IFPR",
      },
      {
        id: "usr-aluno-gabriel",
        name: "Gabriel Santos",
        email: "gabriel.testador@ifpr.edu.br",
        globalRole: "ALUNO",
        contextualRole: "TESTADOR",
        status: "ATIVO",
        assignedCategories: ["ACHADOS_PERDIDOS", "QR_CODE", "PWA_MOBILE"],
        assignedTestCount: 12,
        completedTestCount: 10,
        passedTestCount: 10,
        failedTestCount: 0,
        addedAt: "2026-08-31T13:30:00.000Z",
        addedBy: "Paulo Cauan",
      },
      {
        id: "usr-servidor-helio",
        name: "Hélio Oliveira",
        email: "helio.servidor@ifpr.edu.br",
        globalRole: "SERVIDOR",
        contextualRole: "TESTADOR",
        status: "ATIVO",
        assignedCategories: ["DOCUMENTOS", "NOTIFICACOES", "APIS_PRODUCAO", "MONITORAMENTO"],
        assignedTestCount: 13,
        completedTestCount: 10,
        passedTestCount: 10,
        failedTestCount: 0,
        addedAt: "2026-08-31T13:30:00.000Z",
        addedBy: "Paulo Cauan",
      },
    ],
    createdAt: "2026-08-31T14:00:00.000Z",
    updatedAt: "2026-08-31T15:25:00.000Z",
    createdBy: "Paulo Cauan / Administrador",
    createdByEmail: "paulocauan39@gmail.com",
    tests: STANDARD_TEST_DEFINITIONS.map((t, idx) => {
      // First batch of core tests marked as approved with real validation steps
      const isCore = [
        "TEST-AUTH-01",
        "TEST-AUTH-02",
        "TEST-AUTH-03",
        "TEST-AUTH-05",
        "TEST-CAD-PERSIST-01",
        "TEST-CAD-DUP-01",
        "TEST-CAD-02",
        "TEST-CAD-03",
        "TEST-CAD-04",
        "TEST-CAD-05",
        "TEST-CAD-06",
        "TEST-ACH-01",
        "TEST-ACH-02",
        "TEST-ACH-04",
        "TEST-QR-01",
        "TEST-QR-03",
        "TEST-DOC-01",
        "TEST-DOC-04",
        "TEST-DOC-05",
        "TEST-NOTIF-01",
        "TEST-NOTIF-03",
        "TEST-SEG-01",
        "TEST-SEG-02",
        "TEST-SEG-03",
        "TEST-API-01",
        "TEST-MON-01",
      ].includes(t.id);

      if (isCore) {
        return {
          ...t,
          assignedToUserId: "usr-admin-paulo",
          assignedToName: "Paulo Cauan",
          assignedToEmail: "paulocauan39@gmail.com",
          obtainedResult: "Comportamento confirmado de ponta a ponta com persistência no Firestore e resposta verificada.",
          status: "APROVADO",
          executedAt: "2026-08-31T14:45:00.000Z",
          executedBy: "Equipe Técnica IFPR",
          executedByEmail: "paulocauan39@gmail.com",
          observations: "Validado com sucesso em ambiente de produção sem regressões.",
        };
      }

      return {
        ...t,
        assignedToUserId: idx % 2 === 0 ? "usr-aluno-gabriel" : "usr-servidor-helio",
        assignedToName: idx % 2 === 0 ? "Gabriel Santos" : "Hélio Oliveira",
        assignedToEmail: idx % 2 === 0 ? "gabriel.testador@ifpr.edu.br" : "helio.servidor@ifpr.edu.br",
        obtainedResult: "Pendente de validação em ciclo de homologação específico",
        status: "NAO_EXECUTADO",
        observations: "Previsto para próxima rodada de testes.",
      };
    }),
    auditTrail: [
      {
        id: "audit-bt001-init",
        changedAt: "2026-08-31T14:00:00.000Z",
        changedBy: "Paulo Cauan",
        changedByEmail: "paulocauan39@gmail.com",
        changeType: "CREATE",
        description: "Bateria de testes BT-2026-001 criada com 40 casos de teste oficiais.",
      },
      {
        id: "audit-bt001-exec",
        changedAt: "2026-08-31T15:25:00.000Z",
        changedBy: "Paulo Cauan",
        changedByEmail: "paulocauan39@gmail.com",
        changeType: "UPDATE_STATUS",
        description: "Finalização da execução com 25 testes APROVADOS e 15 previstos para ciclos futuros.",
      },
    ],
  },
];
