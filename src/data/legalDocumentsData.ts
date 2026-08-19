/**
 * Fonte Única de Conteúdo para Documentos Legais Institucionais - Localiza+
 * Instituto Federal do Paraná (IFPR) - Campus Ivaiporã | Projeto InovaIF
 */

export interface LegalDocumentSection {
  id: string;
  num: number;
  title: string;
  paragraphs?: string[];
  paragraphsAfter?: string[];
  bulletItems?: string[];
  orderedItems?: string[];
  callouts?: Array<{
    type?: "info" | "warning" | "alert" | "note";
    title?: string;
    text: string;
    subtext?: string;
  }>;
  infoCards?: Array<{
    label: string;
    value: string;
  }>;
  subsections?: Array<{
    subtitle: string;
    paragraphs?: string[];
    bulletItems?: string[];
  }>;
}

export interface LegalDocumentData {
  id: "privacy_policy" | "terms_of_use";
  title: string;
  subtitle: string;
  filename: string;
  institution: string;
  campus: string;
  project: string;
  address: string;
  lastUpdated: string;
  contactEmail: string;
  dpoName?: string;
  dpoEmail?: string;
  summary: string;
  sections: LegalDocumentSection[];
}

export const PRIVACY_POLICY_DATA: LegalDocumentData = {
  id: "privacy_policy",
  title: "Política de Privacidade",
  subtitle: "Localiza+",
  filename: "Politica_de_Privacidade_LocalizaMais.pdf",
  institution: "Instituto Federal do Paraná – IFPR",
  campus: "Campus Ivaiporã",
  project: "Projeto InovaIF",
  address: "Rua Max Arthur Greipel, nº 505 – Parque Industrial, Ivaiporã – PR, CEP 86873-400",
  lastUpdated: "18 de agosto de 2026",
  contactEmail: "localizamais6@gmail.com",
  dpoName: "Paulo Cauan Lima Pereira",
  dpoEmail: "paulocauan39@gmail.com",
  summary:
    "Transparência, integridade e regras sobre a coleta, utilização, armazenamento, proteção e compartilhamento de dados no sistema Localiza+ em conformidade com a Lei Geral de Proteção de Dados Pessoais (LGPD - Lei nº 13.709/2018).",
  sections: [
    {
      id: "sec-1",
      num: 1,
      title: "Quem somos",
      paragraphs: [
        "O Localiza+ é um sistema computacional desenvolvido pela equipe do projeto InovaIF, vinculado ao Instituto Federal do Paraná – IFPR – Campus Ivaiporã, instituição federal de ensino pública pertencente à Rede Federal de Educação Profissional, Científica e Tecnológica.",
      ],
      infoCards: [
        { label: "Instituição", value: "Instituto Federal do Paraná – IFPR – Campus Ivaiporã" },
        { label: "Endereço", value: "Rua Max Arthur Greipel, nº 505 – Parque Industrial, Ivaiporã – PR, CEP 86873-400" },
        { label: "E-mail institucional do projeto", value: "localizamais6@gmail.com" },
      ],
    },
    {
      id: "sec-2",
      num: 2,
      title: "O que é o Localiza+",
      paragraphs: [
        "O Localiza+ é uma plataforma de interesse público acadêmico e comunitário projetada para modernizar, agilizar e conferir transparência aos processos de cadastro, catalogação, guarda, busca e devolução de bens e pertences esquecidos ou encontrados nas instalações físicas do IFPR Campus Ivaiporã.",
        "A solução permite que estudantes, servidores docentes, técnico-administrativos e visitantes registrem itens encontrados ou perdidos, consultem a lista oficial de custódia, solicitem resgates de forma documentada e acompanhem o fluxo de atendimento até a efetiva entrega ao legítimo proprietário.",
      ],
    },
    {
      id: "sec-3",
      num: 3,
      title: "Dados pessoais que podem ser tratados",
      paragraphs: [
        "O Localiza+ trata apenas os dados pessoais estritamente necessários para a operacionalização segura de suas finalidades institucionais. Dependendo das ações que o titular realiza no sistema, diferentes categorias de informações podem ser coletadas e processadas, conforme detalhado nas seções seguintes.",
      ],
    },
    {
      id: "sec-4",
      num: 4,
      title: "Dados de cadastro e autenticação",
      paragraphs: [
        "Para criar uma conta de usuário, acessar funcionalidades restritas ou autenticar-se na plataforma, podem ser coletados e armazenados os seguintes dados:",
      ],
      bulletItems: [
        "Nome completo: para identificação nos registros e termos de devolução;",
        "Endereço de e-mail: e-mail institucional do IFPR ou pessoal, utilizado como credencial primária de acesso e comunicação;",
        "Senha de acesso: tratada em formato estritamente criptografado (hash seguro) pelo serviço Firebase Authentication, sem acesso em texto plano pela equipe do projeto;",
        "Vínculo institucional: categoria do usuário (Aluno, Servidor Docente/Técnico ou Secretaria/Administrador);",
        "Curso ou setor de lotação: para fins de direcionamento e verificação institucional;",
        "Número de matrícula ou registro acadêmico: para validação de titularidade em registros e emissão de comprovantes;",
        "Número de telefone ou WhatsApp (opcional): para facilitar contato urgente em caso de localização de pertences críticos;",
        "Foto de perfil / Avatar: imagem de avatar pública ou foto fornecida na autenticação federada com a conta Google;",
        "Identificador Único (UID): código identificador exclusivo gerado pelo Firebase Authentication.",
      ],
    },
    {
      id: "sec-5",
      num: 5,
      title: "Dados relacionados a objetos perdidos e encontrados",
      paragraphs: [
        "Ao cadastrar uma ocorrência de achado ou perda de pertence, o usuário fornece informações descritivas do bem:",
      ],
      bulletItems: [
        "Título, descrição e categoria do item (ex: Eletrônicos, Documentos, Chaves, Material Escolar, Vestuário);",
        "Cor predominante, marca ou características específicas;",
        "Local do campus onde foi encontrado ou visto pela última vez (ex: salas de aula, laboratórios, biblioteca, ginásio, pátio, portaria);",
        "Data e horário aproximados do fato;",
        "Fotografias do objeto (quando anexadas);",
        "Código de rastreabilidade ou protocolo de registro gerado pelo sistema;",
        "Status operacional do item (PERDIDO, ENCONTRADO, EM_ANALISE, PROPRIETARIO_IDENTIFICADO, DEVOLVIDO, ENCERRADO);",
        "Identificador (UID) do usuário que realizou o cadastro e histórico das etapas de custódia e entrega.",
      ],
    },
    {
      id: "sec-6",
      num: 6,
      title: "Dados de solicitações e feedback",
      paragraphs: [
        "Ao utilizar os formulários de suporte rápido, relato de bugs, manifestação de dúvidas ou envio de feedback, são coletados:",
      ],
      bulletItems: [
        "Nome do manifestante;",
        "E-mail para resposta;",
        "Tipo de manifestação (Dúvida, Sugestão, Elogio, Relato de Problema ou Solicitação Geral);",
        "Conteúdo detalhado da mensagem e data de envio.",
      ],
    },
    {
      id: "sec-7",
      num: 7,
      title: "Dados técnicos e de segurança",
      paragraphs: [
        "Para assegurar a integridade, segurança, estabilidade e disponibilidade da plataforma:",
      ],
      bulletItems: [
        "Endereço IP: processado estritamente em memória volátil de servidor para mecanismos de limitação de taxa (rate limiting), mitigação de ataques de negação de serviço e proteção contra fraudes, não sendo utilizado para perfilamento pessoal;",
        "Informações do navegador e dispositivo: dados de User-Agent, tipo de sistema operacional e resolução para fins de renderização responsiva;",
        "Tokens de Notificação Web Push: identificadores temporários do Firebase Cloud Messaging (FCM) para entrega de notificações no dispositivo autorizado pelo usuário;",
        "Métricas de desempenho e telemetria anônima: tempos de carregamento de páginas e latência de rede.",
      ],
    },
    {
      id: "sec-8",
      num: 8,
      title: "Finalidades do tratamento",
      paragraphs: [
        "Os dados pessoais tratados pelo Localiza+ destinam-se exclusivamente às seguintes finalidades:",
      ],
      orderedItems: [
        "Identificar e autenticar usuários com segurança para utilização da plataforma;",
        "Registrar, catalogar e disponibilizar para consulta os bens encontrados ou perdidos nas dependências do IFPR Campus Ivaiporã;",
        "Cruzar informações descritivas para identificar potenciais correspondências entre itens perdidos e achados;",
        "Facilitar a comunicação entre a equipe de custódia e os requerentes para devolução rápida dos pertences;",
        "Emitir termos formais de entrega e devolução com rastreabilidade de custódia e prestação de contas institucional;",
        "Prevenir fraudes, apropriação indevida ou falsas reivindicações de propriedade de bens;",
        "Prestar suporte técnico, responder a chamados e aperfeiçoar a usabilidade do sistema;",
        "Cumprir obrigações legais, regulamentares e administrativas inerentes ao serviço público federal.",
      ],
    },
    {
      id: "sec-9",
      num: 9,
      title: "Bases legais",
      paragraphs: [
        "O tratamento de dados pessoais no Localiza+ está fundamentado nas hipóteses legais previstas no Artigo 7º da Lei Geral de Proteção de Dados Pessoais (LGPD - Lei nº 13.709/2018), com ênfase em:",
      ],
      bulletItems: [
        "Art. 7º, II e Art. 23: Cumprimento de obrigação legal ou regulatória e execução de políticas públicas pelo Poder Público, voltadas à gestão do patrimônio, ordem e assistência à comunidade acadêmica do Instituto Federal do Paraná;",
        "Art. 7º, V: Execução de contrato ou de procedimentos preliminares relacionados a contrato do qual seja parte o titular, a pedido deste, consubstanciado na prestação do serviço público de custódia e recuperação de pertences solicitado pelo usuário;",
        "Art. 7º, I: Consentimento do titular, fornecido de forma livre e inequívoca para finalidades específicas (tais como recebimento de notificações push no navegador e preenchimento voluntário de formulários de contato);",
        "Art. 7º, IX: Legítimo interesse do controlador ou de terceiros, visando à proteção patrimonial, integridade física de bens esquecidos e prevenção a fraudes no âmbito do campus.",
      ],
    },
    {
      id: "sec-10",
      num: 10,
      title: "Uso de inteligência artificial",
      paragraphs: [
        "Determinadas funcionalidades do Localiza+ integram recursos e serviços de inteligência artificial (incluindo modelos Google Gemini via API de processamento seguro) para auxiliar os usuários e a equipe em tarefas computacionais, tais como:",
      ],
      bulletItems: [
        "Análise preliminar de descrições textuais para sugestão de categorias e etiquetas;",
        "Análise de imagens de itens encontrados para identificação de cores, tipos de objetos e marcas aparentes;",
        "Pesquisa semântica para localização de itens a partir de linguagem natural;",
        "Cálculo de índice de similaridade entre registros de objetos perdidos e achados.",
      ],
      callouts: [
        {
          type: "warning",
          title: "Ressalva Obrigatória de Uso",
          text: "“Os resultados produzidos por inteligência artificial possuem caráter auxiliar e não determinam, isoladamente, a propriedade ou a devolução de um objeto.”",
          subtext:
            "A validação final de titularidade e a entrega de qualquer bem custodiado são realizadas exclusivamente por servidores humanos autorizados no balcão de atendimento do IFPR Campus Ivaiporã, mediante comprovação documental ou detalhamento de itens não visíveis.",
        },
      ],
    },
    {
      id: "sec-11",
      num: 11,
      title: "Firebase",
      paragraphs: [
        "O Localiza+ utiliza a infraestrutura do Google Firebase (Firebase Authentication, Cloud Firestore e Firebase Cloud Messaging) para autenticação de usuários, persistência de banco de dados e sinalização em tempo real. Os serviços são operados sob rígidos padrões de segurança, criptografia em trânsito (HTTPS / TLS) e em repouso.",
      ],
    },
    {
      id: "sec-12",
      num: 12,
      title: "Armazenamento no Cloud Firestore",
      paragraphs: [
        "As informações estruturadas (registros de pertences, perfis de usuários, registros de auditoria, modelos de documentos institucionais e notificações) são armazenadas no banco de dados NoSQL Cloud Firestore.",
        "O acesso aos documentos é estritamente protegido por Regras de Segurança do Firestore (Firestore Security Rules) e controle de acesso baseado em papéis (RBAC), impedindo que usuários não autenticados ou sem os devidos privilégios acessem, alterem ou excluam dados protegidos de terceiros.",
      ],
    },
    {
      id: "sec-13",
      num: 13,
      title: "Notificações",
      paragraphs: [
        "O sistema disponibiliza notificações internas na interface (in-app) e notificações push para navegadores (via Firebase Cloud Messaging). As notificações servem para avisar o usuário sobre:",
      ],
      bulletItems: [
        "Identificação de potenciais correspondências com objetos perdidos por ele cadastrados;",
        "Atualizações no status de reivindicação ou entrega de itens;",
        "Avisos institucionais e operacionais do setor de Achados e Perdidos.",
      ],
      callouts: [
        {
          type: "info",
          title: "Consentimento de Notificações",
          text: "O envio de notificações push no dispositivo depende de permissão expressa concedida pelo usuário em seu navegador, a qual pode ser revogada a qualquer tempo nas configurações do próprio navegador.",
        },
      ],
    },
    {
      id: "sec-14",
      num: 14,
      title: "Integração com Discord",
      paragraphs: [
        "Para otimizar o tempo de resposta da equipe e dos servidores responsáveis pelo setor, o Localiza+ pode encaminhar notificações operacionais resumidas para canais internos e privados no Discord por meio de webhooks seguros.",
        "As notificações enviadas via Discord destinam-se exclusivamente a:",
      ],
      bulletItems: [
        "Avisar a equipe sobre novos itens encontrados cadastrados;",
        "Avisar sobre novos registros de pertences perdidos no campus;",
        "Receber solicitações de suporte, manifestações e feedbacks enviados pelos usuários;",
        "Alertas operacionais e administrativos necessários para a continuidade dos serviços.",
      ],
      callouts: [
        {
          type: "note",
          title: "Restrição Operacional",
          text: "O compartilhamento de informações através desses webhooks fica estritamente limitado aos dados necessários para a finalidade operacional correspondente (como categoria do item, local e data), sendo processado em canais restritos da equipe e coordenação.",
        },
      ],
    },
    {
      id: "sec-15",
      num: 15,
      title: "Comunicação por e-mail",
      paragraphs: [
        "O sistema pode enviar e-mails transacionais necessários para o funcionamento da conta do usuário (como confirmação de cadastro, instruções de redefinição de senha e comunicados de entrega de pertences). Essas mensagens são expedidas pelo canal oficial do projeto (localizamais6@gmail.com) ou infraestrutura institucional correspondente, não sendo praticado o envio de mensagens promocionais não solicitadas (spam).",
      ],
    },
    {
      id: "sec-16",
      num: 16,
      title: "Analytics, telemetria e monitoramento",
      paragraphs: [
        "O Localiza+ utiliza ferramentas de telemetria técnica e mensuração de desempenho, tais como Vercel Analytics e Vercel Speed Insights. Essas ferramentas coletam dados técnicos agregados e anônimos sobre tempo de carregamento de páginas, estabilidade e erros de execução, com o objetivo exclusivo de aprimorar a velocidade e a confiabilidade do sistema, sem qualquer rastreamento comportamental invasivo ou cruzamento com bases de dados de publicidade.",
      ],
    },
    {
      id: "sec-17",
      num: 17,
      title: "Cookies, armazenamento local e tecnologias semelhantes",
      paragraphs: [
        "O sistema utiliza recursos de armazenamento local do navegador do usuário para proporcionar uma experiência fluida:",
      ],
      bulletItems: [
        "localStorage e sessionStorage: utilizados para manter a sessão de login ativa entre abas, salvar o tema visual escolhido (claro ou escuro) e o idioma da interface (Português ou Inglês);",
        "IndexedDB: utilizado como cache local do Progressive Web App (PWA) para viabilizar consultas offline parciais e enfileirar cadastros em caso de oscilação de conectividade no campus;",
        "Não são utilizados cookies de rastreamento publicitário comercial de terceiros.",
      ],
    },
    {
      id: "sec-18",
      num: 18,
      title: "Compartilhamento de dados",
      paragraphs: [
        "O Localiza+ não comercializa, não vende e não aluga dados pessoais a terceiros sob nenhuma circunstância.",
        "O compartilhamento ocorre unicamente com:",
      ],
      bulletItems: [
        "Provedores de infraestrutura tecnológica: Google Cloud Platform / Firebase e Vercel, na medida estritamente necessária para hospedar a aplicação, autenticar usuários e manter o banco de dados;",
        "Canais internos de atendimento: Discord (via webhooks privados) para notificação da equipe de atendimento e suporte;",
        "Autoridades competentes e órgãos de controle: exclusivamente mediante requisição formal, dever legal ou ordem judicial, na forma da legislação aplicável.",
      ],
    },
    {
      id: "sec-19",
      num: 19,
      title: "Transferência internacional de dados",
      paragraphs: [
        "Em razão da utilização de servidores de computação em nuvem operados por empresas globais (Google LLC e Vercel Inc.), alguns dados tratados podem ser armazenados ou processados em data centers localizados fora do Brasil (notadamente nos Estados Unidos).",
        "Tais provedores atendem a rígidos padrões internacionais de segurança da informação (como certificações ISO/IEC 27001, SOC 1/2/3) e oferecem salvaguardas contratuais e técnicas compatíveis com o Art. 33 da LGPD.",
      ],
    },
    {
      id: "sec-20",
      num: 20,
      title: "Segurança da informação",
      paragraphs: [
        "O Localiza+ adota medidas técnicas e administrativas aptas a proteger os dados pessoais contra acessos não autorizados e situações acidentais ou ilícitas:",
      ],
      bulletItems: [
        "Criptografia de ponta a ponta na transmissão dos dados via protocolo HTTPS com TLS 1.3;",
        "Criptografia em repouso nos bancos de dados do Cloud Firestore;",
        "Controle de acesso granular baseado em papéis (Role-Based Access Control - RBAC);",
        "Mecanismo de limitação de taxa (Rate Limiting) para prevenção de ataques de força bruta e sobrecarga de requisições;",
        "Sanitização de entradas para mitigação de vulnerabilidades de injeção de código e XSS.",
      ],
    },
    {
      id: "sec-21",
      num: 21,
      title: "Retenção dos dados",
      paragraphs: [
        "Os dados pessoais serão conservados pelo período estritamente necessário para cumprir as finalidades para as quais foram coletados:",
      ],
      bulletItems: [
        "Contas de usuários: mantidas enquanto o cadastro estiver ativo ou pelo período correspondente ao vínculo acadêmico/institucional com o IFPR;",
        "Registros de achados, perdidos e termos de devolução: conservados pelo prazo necessário à prestação de contas, auditoria interna e registro histórico patrimonial do campus, após o qual poderão ser anonimizados ou descartados de forma segura;",
        "Registros de segurança e logs: mantidos pelo tempo necessário para averiguação de incidentes e auditoria técnica.",
      ],
    },
    {
      id: "sec-22",
      num: 22,
      title: "Dados de menores de idade",
      paragraphs: [
        "Por se tratar de um ambiente educacional público que atende turmas de Cursos Técnicos Integrados ao Ensino Médio, o Localiza+ trata dados pessoais de estudantes menores de 18 anos.",
        "O tratamento desses dados é realizado em conformidade com o Artigo 14 da LGPD, no melhor interesse dos estudantes, para a finalidade exclusiva de proteção patrimonial, localização de seus pertences escolares e viabilização da rotina acadêmica no campus.",
      ],
    },
    {
      id: "sec-23",
      num: 23,
      title: "Direitos dos titulares",
      paragraphs: [
        "Em conformidade com o Artigo 18 da LGPD, o titular dos dados pessoais (ou seu representante legal) possui os seguintes direitos perante o controlador:",
      ],
      bulletItems: [
        "Confirmação e Acesso: obter a confirmação da existência de tratamento e acessar os seus dados pessoais armazenados;",
        "Correção: solicitar a correção de dados incompletos, inexatos ou desatualizados;",
        "Anonimização, Bloqueio ou Eliminação: requerer a anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a lei;",
        "Portabilidade: solicitar a portabilidade dos seus dados a outro fornecedor de serviço, observados os segredos comerciais e técnicos;",
        "Eliminação: solicitar a eliminação dos dados tratados com base no consentimento, ressalvadas as hipóteses de guarda obrigatória por dever legal;",
        "Informação sobre compartilhamento: obter informações sobre as entidades públicas e privadas com as quais houve compartilhamento de dados;",
        "Revogação do consentimento: revogar o consentimento previamente manifestado a qualquer momento, mediante manifestação expressa;",
        "Oposição: opor-se a tratamento realizado com fundamento em uma das hipóteses de dispensa de consentimento, em caso de descumprimento ao disposto na LGPD.",
      ],
    },
    {
      id: "sec-24",
      num: 24,
      title: "Como solicitar o exercício dos direitos",
      paragraphs: [
        "Para exercer qualquer um dos seus direitos previstos na LGPD, o titular de dados ou seu responsável legal pode enviar uma solicitação formal pelos canais indicados abaixo, informando seu nome completo, vínculo institucional e a descrição clara da solicitação:",
      ],
      infoCards: [
        { label: "E-mail geral do projeto", value: "localizamais6@gmail.com" },
        { label: "Contato de privacidade do projeto", value: "paulocauan39@gmail.com" },
      ],
      paragraphsAfter: [
        "As solicitações serão apreciadas e respondidas dentro dos prazos legais aplicáveis.",
      ],
    },
    {
      id: "sec-25",
      num: 25,
      title: "Encarregado pelo tratamento de dados pessoais e contato de privacidade",
      paragraphs: [
        "Durante a fase de desenvolvimento, testes e implantação inicial do projeto:",
      ],
      callouts: [
        {
          type: "info",
          title: "Contato de privacidade do projeto: Paulo Cauan Lima Pereira",
          text: "E-mail: paulocauan39@gmail.com",
          subtext:
            "Nota explicativa de distinção institucional: Esta indicação é de caráter técnico e provisório no âmbito do projeto Localiza+ / InovaIF e não substitui a futura designação formal do Encarregado pelo Tratamento de Dados Pessoais (DPO) pela administração central do Instituto Federal do Paraná (IFPR). Após a implantação oficial e definição institucional pela governança do IFPR, as informações de contato do Encarregado oficial do órgão serão devidamente atualizadas nesta seção.",
        },
      ],
    },
    {
      id: "sec-26",
      num: 26,
      title: "Responsabilidade pelas informações fornecidas",
      paragraphs: [
        "O usuário é exclusivamente responsável pela veracidade, exatidão e licitude dos dados que insere no sistema (especialmente descrições de itens, fotografias e dados de contato). É estritamente vedada a inserção de informações falsas, imagens com conteúdo ilícito ou ofensivo, ou tentativas de reivindicação fraudulenta de bens alheios, sujeitando-se o infrator às sanções disciplinares e legais cabíveis.",
      ],
    },
    {
      id: "sec-27",
      num: 27,
      title: "Imagens de objetos",
      paragraphs: [
        "As fotografias cadastradas na plataforma devem retratar exclusivamente os objetos encontrados ou perdidos. Recomenda-se aos usuários que evitem o envio de fotos que exponham rostos de pessoas, documentos pessoais com números abertos (como CPF ou cartões de crédito visíveis sem necessidade) ou dados de natureza íntima. A equipe de administração reserva-se o direito de moderar ou remover imagens em desacordo com esta diretriz.",
      ],
    },
    {
      id: "sec-28",
      num: 28,
      title: "Registro de auditoria",
      paragraphs: [
        "Com a finalidade de garantir transparência, rastreabilidade e prestação de contas (accountability), o sistema registra eventos essenciais de auditoria (como cadastro de bens, alterações de status para “Devolvido”, geração de termos e ações administrativas), gravando data, horário, identificador do operador e tipo de operação realizada.",
      ],
    },
    {
      id: "sec-29",
      num: 29,
      title: "Alterações nesta Política de Privacidade",
      paragraphs: [
        "Esta Política de Privacidade poderá ser atualizada periodicamente para refletir melhorias no sistema, novas funcionalidades, ajustes na infraestrutura técnica ou alterações normativas e legislativas. Qualquer alteração relevante será indicada pela atualização da data no cabeçalho deste documento. Recomenda-se a consulta periódica desta página.",
      ],
    },
    {
      id: "sec-30",
      num: 30,
      title: "Contato",
      paragraphs: [
        "Para dúvidas, sugestões ou solicitações relacionadas a esta Política de Privacidade ou ao tratamento de dados no Localiza+:",
      ],
      infoCards: [
        { label: "E-mail geral do projeto", value: "localizamais6@gmail.com" },
        { label: "Contato de privacidade do projeto", value: "paulocauan39@gmail.com" },
        {
          label: "Endereço institucional",
          value: "Instituto Federal do Paraná – Campus Ivaiporã, Rua Max Arthur Greipel, nº 505 – Parque Industrial, Ivaiporã – PR, CEP 86873-400",
        },
      ],
    },
    {
      id: "sec-31",
      num: 31,
      title: "Disposições finais",
      paragraphs: [
        "Esta Política de Privacidade é regida e interpretada de acordo com as leis da República Federativa do Brasil, em especial a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018), o Marco Civil da Internet (Lei nº 12.965/2014) e as normas regulamentares do Instituto Federal do Paraná.",
      ],
    },
  ],
};

export const TERMS_OF_USE_DATA: LegalDocumentData = {
  id: "terms_of_use",
  title: "Termos de Uso",
  subtitle: "Localiza+",
  filename: "Termos_de_Uso_LocalizaMais.pdf",
  institution: "Instituto Federal do Paraná – IFPR",
  campus: "Campus Ivaiporã",
  project: "Projeto InovaIF",
  address: "Rua Max Arthur Greipel, nº 505 – Parque Industrial, Ivaiporã – PR, CEP 86873-400",
  lastUpdated: "18 de agosto de 2026",
  contactEmail: "localizamais6@gmail.com",
  summary:
    "Regras, diretrizes, direitos, responsabilidades e condições gerais aplicáveis ao uso da plataforma Localiza+ no âmbito do Instituto Federal do Paraná (IFPR) – Campus Ivaiporã.",
  sections: [
    {
      id: "sec-1",
      num: 1,
      title: "Sobre o Localiza+",
      paragraphs: [
        "O Localiza+ é uma plataforma institucional concebida para auxiliar a comunidade acadêmica (estudantes, docentes, servidores técnico-administrativos, terceirizados e visitantes) do IFPR Campus Ivaiporã no registro, catalogação, busca, localização e procedimentos de devolução de pertences perdidos e encontrados nas dependências do campus.",
        "A plataforma atua como ferramenta digital de apoio e mediação colaborativa, integrando recursos de busca, classificação orientada, geração de identificadores de entrega (QR Code), avisos automatizados e ferramentas analíticas auxiliares.",
      ],
    },
    {
      id: "sec-2",
      num: 2,
      title: "Aceitação dos Termos",
      paragraphs: [
        "Ao acessar, navegar, cadastrar-se ou utilizar qualquer funcionalidade do Localiza+, você declara ter lido, compreendido e concordado integralmente com estes Termos de Uso e com a Política de Privacidade da plataforma.",
        "Caso você não concorde com quaisquer das condições, diretrizes ou responsabilidades estipuladas neste documento, solicitamos que não utilize o sistema nem cadastre dados na plataforma.",
      ],
    },
    {
      id: "sec-3",
      num: 3,
      title: "Elegibilidade e cadastro",
      paragraphs: [
        "A navegação pública básica e a consulta de objetos cadastrados podem ser realizadas sem necessidade de autenticação. Contudo, ações ativas, tais como o registro de objetos perdidos ou encontrados, inserção de comentários, abertura de reivindicações de propriedade e gerenciamento de perfil, demandam cadastro de conta de usuário.",
        "O cadastro é facultado a membros da comunidade do IFPR e visitantes legítimos. O usuário compromete-se a fornecer informações verídicas, exatas e atualizadas no momento de sua inscrição, sendo estritamente vedado o uso de dados de terceiros ou identidades falsas.",
      ],
    },
    {
      id: "sec-4",
      num: 4,
      title: "Responsabilidade pelas informações fornecidas",
      paragraphs: [
        "O usuário é o único e exclusivo responsável por toda e qualquer informação, descrição, categoria, marca, cor, data, localização estimada, fotografia ou comentário que inserir no sistema.",
        "O usuário deve zelar pela precisão dos dados, garantindo que as informações fornecidas correspondam estritamente à realidade dos fatos e não induzam a comunidade acadêmica ou os servidores responsáveis a erro ou confusão.",
      ],
    },
    {
      id: "sec-5",
      num: 5,
      title: "Uso adequado da plataforma",
      paragraphs: [
        "O Localiza+ deve ser utilizado exclusivamente para suas finalidades institucionais: auxiliar na recuperação de bens esquecidos e na gestão comunitária de achados e perdidos no IFPR Campus Ivaiporã.",
        "É expressamente vedada a utilização da plataforma para fins comerciais, publicitários, políticos, difamatórios, fraudulentos ou qualquer outra finalidade alheia aos objetivos acadêmicos e extensionistas do projeto.",
      ],
    },
    {
      id: "sec-6",
      num: 6,
      title: "Cadastro de objetos perdidos",
      paragraphs: [
        "O usuário que cadastrar um objeto na condição de PERDIDO deve relatar com fidelidade os dados do pertence, tais como data aproximada da perda, local provável dentro do campus, características visuais e eventuais marcas de identificação.",
      ],
      bulletItems: [
        "O usuário não deve registrar objetos que não lhe pertençam ou cuja perda não tenha ocorrido legitimamente.",
        "O cadastro de um objeto perdido cria um alerta no sistema, mas não garante que o bem seja localizado ou devolvido.",
        "Quando houver uma possível correspondência no sistema, o usuário será notificado, devendo proceder à validação e comprovação de propriedade conforme os trâmites institucionais.",
      ],
    },
    {
      id: "sec-7",
      num: 7,
      title: "Cadastro de objetos encontrados",
      paragraphs: [
        "Qualquer usuário ou servidor que encontrar um objeto nas dependências do campus poderá cadastrá-lo como ENCONTRADO para auxiliar na rápida identificação pelo proprietário legítimo.",
      ],
      bulletItems: [
        "O usuário que cadastrar um objeto encontrado deve entregá-lo no ponto de guarda oficial do campus (ex.: SEBAC / Recepção / Portaria) para custódia física segura.",
        "Recomenda-se não divulgar publicamente detalhes ultrassensíveis ou segredos do objeto (ex.: senhas gravadas, conteúdos íntimos ou quantias exatas em dinheiro) que devam ser utilizados exclusivamente como critério de verificação na devolução física.",
      ],
    },
    {
      id: "sec-8",
      num: 8,
      title: "Imagens e conteúdos enviados pelos usuários",
      paragraphs: [
        "Ao realizar o upload de fotografias de pertences ou inserir textos descritivos, o usuário declara que:",
      ],
      bulletItems: [
        "Possui o direito de registrar e compartilhar a imagem para a finalidade estrita de identificação do objeto;",
        "A imagem retrata o pertence e não viola direitos de imagem, intimidade ou privacidade de terceiros;",
        "Não constam no enquadramento da fotografia rostos de pessoas não autorizadas, documentos pessoais abertos com dados excessivos (CPF, RG, cartões bancários com numeração completa visível) ou conteúdos ofensivos;",
        "Imagens inadequadas, ilegais ou que violem estes termos poderão ser removidas sumariamente pela moderação administrativa.",
      ],
    },
    {
      id: "sec-9",
      num: 9,
      title: "Processo de reivindicação e devolução de objetos",
      paragraphs: [
        "A plataforma estabelece critérios claros para a entrega e conferência de bens esquecidos:",
      ],
      callouts: [
        {
          type: "warning",
          title: "Diretrizes Obrigatórias de Reivindicação",
          text: "O cadastro de uma reivindicação na plataforma não constitui prova definitiva de propriedade. Correspondências automáticas ou apontamentos gerados por inteligência artificial não autorizam a entrega imediata sem prévia validação humana.",
          subtext:
            "A entrega física do objeto requer a apresentação de documento de identificação pessoal, confirmação de características particulares do bem e assinatura/registro no termo de devolução institucional. Informações do processo de devolução (nome do recebedor, data, matrícula/documento e servidor responsável) são registradas para fins de auditoria e segurança patrimonial.",
        },
      ],
    },
    {
      id: "sec-10",
      num: 10,
      title: "Proibição de informações falsas ou fraudulentas",
      paragraphs: [
        "É expressamente proibido prestar declarações inverídicas, forjar registros de itens perdidos para obter vantagens indevidas ou tentar apropriar-se de bens pertencentes a terceiros por meio de reivindicações falsas.",
        "A tentativa de apropriação indevida ou fraude sujeitará o infrator ao bloqueio imediato da conta na plataforma, sem prejuízo das sanções disciplinares acadêmicas cabíveis no IFPR e da comunicação às autoridades competentes nos termos da legislação civil e penal brasileira (Art. 169 do Código Penal – Apropriação de coisa havida por erro, caso fortuito ou força da natureza).",
      ],
    },
    {
      id: "sec-11",
      num: 11,
      title: "Condutas proibidas",
      paragraphs: [
        "Constituem condutas terminantemente proibidas aos usuários do Localiza+:",
      ],
      bulletItems: [
        "Cadastrar objetos inexistentes ou duplicar registros repetidamente de forma abusiva;",
        "Utilizar robôs, scripts automatizados, scrapers ou rotinas de varredura que sobrecarreguem ou interfiram na infraestrutura da plataforma;",
        "Tentar violar a segurança, autenticação, controle de acesso ou regras de banco de dados do sistema;",
        "Inserir códigos maliciosos, vírus, malwares, links suspeitos ou arquivos corrompidos;",
        "Praticar assédio, ofensas, discriminação ou divulgação de conteúdos impróprios nos campos de descrição, comentários ou mensagens de suporte;",
        "Utilizar a plataforma para veiculação de spam, campanhas publicitárias ou promoção de produtos e serviços.",
      ],
    },
    {
      id: "sec-12",
      num: 12,
      title: "Contas de usuários",
      paragraphs: [
        "O usuário é responsável pela guarda, confidencialidade e uso de suas credenciais de autenticação (e-mail institucional, senha e conta Google vinculada).",
        "Qualquer atividade realizada por meio de uma conta autenticada será presumida como praticada pelo titular respectivo até que haja comunicação prévia e inequívoca de perda, furto ou comprometimento das credenciais à equipe de administração.",
      ],
    },
    {
      id: "sec-13",
      num: 13,
      title: "Contas administrativas e privilégios",
      paragraphs: [
        "Determinadas contas possuem perfis de acesso elevado (Administrador TI, Servidor Responsável, Membro da Equipe InovaIF), com permissões para moderação de itens, gerenciamento de status de devolução, geração de termos de custódia e auditoria do sistema.",
        "Os titulares de contas administrativas comprometem-se a atuar com estrita observância ao princípio da finalidade pública, confidencialidade funcional, zelo patrimonial e proteção aos dados pessoais dos usuários.",
      ],
    },
    {
      id: "sec-14",
      num: 14,
      title: "Notificações e comunicações",
      paragraphs: [
        "O Localiza+ pode enviar notificações operacionais por meio de alertas na interface, notificações push (Firebase Cloud Messaging - FCM, mediante consentimento do navegador) e e-mails institucionais sobre o andamento de ocorrências, correspondências identificadas ou respostas a solicitações de suporte.",
        "O usuário pode habilitar ou revogar as permissões de notificação do navegador a qualquer momento diretamente nas configurações de seu dispositivo.",
      ],
    },
    {
      id: "sec-15",
      num: 15,
      title: "Inteligência artificial",
      paragraphs: [
        "O Localiza+ integra recursos de inteligência artificial generativa e multimodal (Google Gemini API) exclusivamente como ferramenta de tecnologia assistiva para apoiar na classificação de categorias, extração de palavras-chave, análise visual de fotografias e cálculo de similaridade semântica entre objetos cadastrados.",
      ],
      callouts: [
        {
          type: "note",
          title: "Aviso Expressamente Declarado",
          text: "“Os resultados produzidos por inteligência artificial são auxiliares e podem conter erros. Uma sugestão ou correspondência gerada automaticamente não constitui prova de propriedade e não determina, isoladamente, a devolução de um objeto.”",
          subtext:
            "A decisão final de entrega de qualquer pertence físico é prerrogativa exclusiva e indelegável de validação humana e administrativa realizada pelos servidores e monitores do campus.",
        },
      ],
    },
    {
      id: "sec-16",
      num: 16,
      title: "Integrações com serviços de terceiros",
      paragraphs: [
        "Para assegurar sua operação técnica, alta escalabilidade e segurança, o Localiza+ utiliza serviços de infraestrutura e provedores tecnológicos terceiros, tais como:",
      ],
      bulletItems: [
        "Google Firebase (Firebase Authentication, Cloud Firestore e Firebase Cloud Messaging);",
        "Google Gemini API (processamento de inteligência artificial assistiva);",
        "Vercel & Google Cloud Run (hospedagem de aplicações, telemetria agregada e execução de rotas de backend);",
        "Discord Webhooks (notificações internas de novos achados e perdas para canais operacionais restritos da equipe).",
      ],
      callouts: [
        {
          type: "info",
          title: "Política de Privacidade",
          text: "Para informações detalhadas sobre como os dados pessoais são protegidos durante essas integrações, consulte a nossa Política de Privacidade.",
        },
      ],
    },
    {
      id: "sec-17",
      num: 17,
      title: "Disponibilidade e funcionamento do sistema",
      paragraphs: [
        "A equipe do projeto InovaIF e o IFPR empregam esforços contínuos para manter o Localiza+ disponível, estável e funcional. Contudo, em razão da natureza dos sistemas computacionais e redes públicas de internet, não é possível garantir disponibilidade ininterrupta de 100%.",
        "A plataforma poderá sofrer suspensões temporárias, instabilidades ou manutenções programadas em razão de atualizações de segurança, melhorias na infraestrutura, falhas em servidores terceiros ou eventos fora do controle razoável da equipe desenvolvedora.",
      ],
    },
    {
      id: "sec-18",
      num: 18,
      title: "Limitação de responsabilidade",
      paragraphs: [
        "O Localiza+ constitui uma ferramenta de apoio e facilitação comunitária. A disponibilização do sistema não enseja, sob qualquer hipótese, obrigação de guarda, depósito ou indenização securitária por objetos extraviados, danificados ou não recuperados no campus.",
        "A plataforma não garante de forma absoluta:",
      ],
      bulletItems: [
        "Que todo objeto perdido será inevitavelmente localizado ou devolvido ao dono;",
        "Que as informações inseridas por outros usuários sejam 100% exatas em todos os momentos;",
        "Que correspondências geradas automaticamente estejam isentas de falsos positivos ou falsos negativos;",
        "A integridade física de itens devolvidos em estado de deterioração anterior ao encontro.",
      ],
    },
    {
      id: "sec-19",
      num: 19,
      title: "Segurança",
      paragraphs: [
        "O Localiza+ adota padrões modernos de segurança da informação, incluindo comunicação criptografada por protocolo HTTPS/TLS, regras granulares de segurança no banco de dados Cloud Firestore, rate limiting em rotas de API, sanitização de entradas de texto e restrição estrita de privilégios de acesso.",
        "O usuário compromete-se a colaborar com a segurança da plataforma, não tentando burlar controles técnicos e notificando prontamente a equipe caso identifique qualquer comportamento atípico ou vulnerabilidade no sistema.",
      ],
    },
    {
      id: "sec-20",
      num: 20,
      title: "Suspensão ou encerramento de contas",
      paragraphs: [
        "A coordenação do projeto e a administração do sistema reservam-se o direito de advertir, limitar funcionalidades, suspender temporariamente ou encerrar definitivamente o acesso de qualquer usuário nas seguintes hipóteses:",
      ],
      bulletItems: [
        "Descumprimento comprovado destes Termos de Uso ou da Política de Privacidade;",
        "Prática de condutas fraudulentas, inserção deliberada de dados falsos ou tentativa de apropriação indevida de bens;",
        "Ataques técnicos ou atos que comprometam a estabilidade e segurança da plataforma;",
        "Determinação legal ou administrativa fundamentada emitida por autoridade competente do IFPR.",
      ],
    },
    {
      id: "sec-21",
      num: 21,
      title: "Propriedade intelectual",
      paragraphs: [
        "Os elementos que compõem o Localiza+, incluindo o nome da plataforma, marcas institucionais, logotipos, interface visual, projeto gráfico, layouts, banco de dados, códigos-fonte e documentações técnicas, são protegidos pelas normas vigentes de direitos autorais e propriedade intelectual brasileiras, integrando o patrimônio extensionista e tecnológico do projeto InovaIF / IFPR Campus Ivaiporã, ressalvados os componentes de código aberto e bibliotecas de terceiros devidamente licenciadas sob seus respectivos termos.",
        "É vedada a reprodução comercial, engenharia reversa desautorizada ou alteração da identidade visual do sistema para fins ilegítimos sem a expressa anuência da equipe gestora institucional.",
      ],
    },
    {
      id: "sec-22",
      num: 22,
      title: "Privacidade e proteção de dados",
      paragraphs: [
        "O tratamento de dados pessoais realizado durante a utilização do Localiza+ está descrito de forma detalhada e transparente na nossa Política de Privacidade, elaborada em rigorosa conformidade com a Lei Geral de Proteção de Dados Pessoais (LGPD – Lei nº 13.709/2018) e o Marco Civil da Internet (Lei nº 12.965/2014).",
        "A Política de Privacidade integra formalmente estes Termos de Uso. Para conhecer as finalidades, bases legais, prazos de retenção e os canais para exercício dos seus direitos como titular de dados pessoais, acesse o documento completo em /politica-de-privacidade.",
      ],
    },
    {
      id: "sec-23",
      num: 23,
      title: "Links e serviços de terceiros",
      paragraphs: [
        "A plataforma pode disponibilizar links que direcionam o usuário para portais externos oficiais (como o portal institucional do IFPR – ivaipora.ifpr.edu.br).",
        "O Localiza+ não possui ingerência nem responsabilidade sobre as políticas de privacidade, termos de uso ou conteúdos de sites de terceiros que não estejam sob sua administração direta.",
      ],
    },
    {
      id: "sec-24",
      num: 24,
      title: "Alterações dos Termos",
      paragraphs: [
        "Estes Termos de Uso poderão ser revisados periodicamente para refletir evoluções tecnológicas, introdução de novos recursos no sistema, melhorias de segurança ou atualizações na legislação brasileira.",
        "Sempre que ocorrerem alterações relevantes, a data de última atualização constante no cabeçalho será revisada, e avisos informativos poderão ser veiculados na página inicial da plataforma. A continuidade no uso dos serviços após a publicação das alterações constitui aceitação dos novos termos.",
      ],
    },
    {
      id: "sec-25",
      num: 25,
      title: "Legislação aplicável",
      paragraphs: [
        "Estes Termos de Uso são regidos, interpretados e executados segundo a legislação da República Federativa do Brasil, em especial o Marco Civil da Internet (Lei nº 12.965/2014) e a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018).",
        "Eventuais controvérsias decorrentes da aplicação deste instrumento que não possam ser dirimidas amigavelmente pela via administrativa serão submetidas ao foro judicial competente da comarca de Ivaiporã, Estado do Paraná.",
      ],
    },
    {
      id: "sec-26",
      num: 26,
      title: "Contato",
      paragraphs: [
        "Para esclarecer dúvidas sobre estes Termos de Uso, enviar sugestões de aprimoramento ou relatar problemas operacionais na plataforma, entre em contato pelos canais oficiais:",
      ],
      infoCards: [
        { label: "Projeto & Equipe", value: "Localiza+ – Projeto InovaIF" },
        { label: "Instituição", value: "Instituto Federal do Paraná – Campus Ivaiporã" },
        { label: "Endereço", value: "Rua Max Arthur Greipel, nº 505 – Parque Industrial, Ivaiporã – PR, CEP 86873-400" },
        { label: "E-mail Oficial do Projeto", value: "localizamais6@gmail.com" },
      ],
    },
    {
      id: "sec-27",
      num: 27,
      title: "Disposições finais",
      paragraphs: [
        "Caso qualquer disposição ou cláusula destes Termos de Uso seja considerada nula, inválida ou inaplicável por autoridade judicial ou administrativa competente, as demais disposições permanecerão plenamente válidas, eficazes e em pleno vigor.",
        "A eventual tolerância da equipe gestora ou do IFPR em relação ao descumprimento de qualquer condição deste instrumento constituirá mera liberalidade, não implicando novação, renúncia ou alteração dos direitos estipulados.",
      ],
    },
  ],
};
