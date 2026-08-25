import { ProjectSettings } from "../types";

/**
 * Dados padrão e iniciais do Projeto InovaIF, Equipe, Professor Orientador e Campus IFPR Ivaiporã.
 * Estes dados são utilizados como valor inicial e sincronizados via Firestore (/project_settings/inovaif).
 */
export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  teamName: "InovaIF",
  members: [
    {
      id: "mem_1",
      name: "Gabriel Oliveira da Silva",
      registrationNumber: "20251IVA10030010",
      role: "Estudante Pesquisador / Desenvolvedor",
      order: 1,
    },
    {
      id: "mem_2",
      name: "Hélio Augusto de Souza Barros",
      registrationNumber: "20251IVA10030022",
      role: "Estudante Pesquisador / Desenvolvedor",
      order: 2,
    },
    {
      id: "mem_3",
      name: "Kalil Padilha",
      registrationNumber: "20251IVA10030019",
      role: "Estudante Pesquisador / Desenvolvedor",
      order: 3,
    },
    {
      id: "mem_4",
      name: "Luiz Gustavo Bernaki",
      registrationNumber: "20251IVA10030020",
      role: "Estudante Pesquisador / Desenvolvedor",
      order: 4,
    },
    {
      id: "mem_5",
      name: "Paulo Cauan Lima Pereira",
      registrationNumber: "20251IVA10030008",
      role: "Estudante Pesquisador / Desenvolvedor",
      order: 5,
    },
    {
      id: "mem_6",
      name: "Vitor Gonçalves Guerino Moraes",
      registrationNumber: "20251IVA10030012",
      role: "Estudante Pesquisador / Desenvolvedor",
      order: 6,
    },
  ],
  professor: {
    name: "Ronan Anacleto Lopes",
    title: "Mestre",
    role: "Coordenador do Curso de Sistemas de Informação",
  },
  institution: {
    name: "Instituto Federal do Paraná",
    campus: "Campus Ivaiporã",
    address: "Rua Max Arthur Greipel, nº 505 - Parque Industrial",
    city: "Ivaiporã",
    state: "PR",
    zipCode: "86873-400",
  },
  updatedAt: new Date().toISOString(),
  updatedBy: "Sistema IFPR",
};

/**
 * Converte a estrutura de configurações do projeto em um mapa de tags dinâmicas {{tag_name}}.
 */
export function getProjectSettingsTags(settings?: ProjectSettings | null): Record<string, string> {
  const current = settings || DEFAULT_PROJECT_SETTINGS;

  const memberNamesOnly = (current.members || [])
    .map((m) => m.name.trim())
    .filter(Boolean)
    .join(", ");

  const membersWithRegistration = (current.members || [])
    .map((m) => {
      const reg = m.registrationNumber ? ` (Matrícula: ${m.registrationNumber.trim()})` : "";
      return `${m.name.trim()}${reg}`;
    })
    .filter(Boolean)
    .join(", ");

  const membersFormattedLines = (current.members || [])
    .map((m) => {
      const reg = m.registrationNumber ? ` — Matrícula: ${m.registrationNumber.trim()}` : "";
      return `• ${m.name.trim()}${reg}`;
    })
    .join("\n");

  const fullAddress = [
    current.institution?.address,
    current.institution?.city && current.institution?.state
      ? `${current.institution.city} - ${current.institution.state}`
      : current.institution?.city || current.institution?.state,
    current.institution?.zipCode ? `CEP: ${current.institution.zipCode}` : "",
  ]
    .filter(Boolean)
    .join(", ");

  const profCompleteTitle = current.professor?.title
    ? `Prof. ${current.professor.title} ${current.professor.name}`
    : `Prof. ${current.professor?.name || ""}`;

  const firstMember = current.members?.[0];
  const leaderName = firstMember?.name?.trim() || "";

  const currentDateExtenso = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const currentYear = String(new Date().getFullYear());
  const currentSemester = new Date().getMonth() >= 6 ? "2" : "1";

  return {
    // Projeto
    nome_projeto: "Localiza+",
    projeto: "Localiza+",
    nome_projeto_extensao: "Localiza+ : Sistema Institucional de Achados, Perdidos e Atendimento Comunitário",

    // Equipe & Integrantes
    nome_equipe: current.teamName || "InovaIF",
    equipe: current.teamName || "InovaIF",
    integrantes: memberNamesOnly,
    integrantes_com_matricula: membersWithRegistration,
    integrantes_lista: membersFormattedLines,
    representante_equipe: leaderName,
    lider_equipe: leaderName,

    // Professor Orientador / Coordenador
    professor_responsavel: current.professor?.name || "Ronan Anacleto Lopes",
    formacao_professor: current.professor?.title || "Mestre",
    cargo_professor: current.professor?.role || "Coordenador do Curso de Sistemas de Informação",
    docente_completo: `${profCompleteTitle} (${current.professor?.role || ""})`.trim(),
    coordenador: current.professor?.name || "Ronan Anacleto Lopes",

    // Instituição e Campus
    instituicao: current.institution?.name || "Instituto Federal do Paraná",
    campus: current.institution?.campus || "Campus Ivaiporã",
    endereco_instituicao: current.institution?.address || "Rua Max Arthur Greipel, nº 505 - Parque Industrial",
    cidade: current.institution?.city || "Ivaiporã",
    estado: current.institution?.state || "PR",
    cep: current.institution?.zipCode || "86873-400",
    endereco_completo: fullAddress,

    // Curso & Período
    curso: "Bacharelado em Sistemas de Informação",
    periodo_letivo: `${currentSemester}º Semestre / ${currentYear}`,

    // Datas formatadas
    data: currentDateExtenso,
    data_extenso: currentDateExtenso,
    ano: currentYear,
    cidade_data: `${current.institution?.city || "Ivaiporã"} - ${current.institution?.state || "PR"}, ${currentDateExtenso}`,
  };
}

export interface ProjectTagInfo {
  tag: string;
  label: string;
  category: "Equipe" | "Integrantes" | "Professor" | "Instituição" | "Geral";
  description: string;
  example: (settings: ProjectSettings) => string;
}

export const PROJECT_AVAILABLE_TAGS: ProjectTagInfo[] = [
  {
    tag: "nome_equipe",
    label: "Nome da Equipe / Projeto",
    category: "Equipe",
    description: "Nome oficial da equipe desenvolvedora",
    example: (s) => s.teamName || "InovaIF",
  },
  {
    tag: "representante_equipe",
    label: "Representante da Equipe (Líder)",
    category: "Equipe",
    description: "Nome do estudante representante da equipe",
    example: (s) => s.members?.[0]?.name || "",
  },
  {
    tag: "integrantes",
    label: "Integrantes (Apenas Nomes)",
    category: "Integrantes",
    description: "Lista de nomes dos estudantes separados por vírgula",
    example: (s) => (s.members || []).map((m) => m.name).join(", "),
  },
  {
    tag: "integrantes_com_matricula",
    label: "Integrantes com Matrícula",
    category: "Integrantes",
    description: "Nomes dos estudantes acompanhados do número de matrícula",
    example: (s) =>
      (s.members || []).map((m) => `${m.name} (Matrícula: ${m.registrationNumber})`).join(", "),
  },
  {
    tag: "integrantes_lista",
    label: "Integrantes em Linhas (Tópicos)",
    category: "Integrantes",
    description: "Lista em tópicos com marcadores (• Nome — Matrícula)",
    example: (s) =>
      (s.members || []).map((m) => `• ${m.name} — Matrícula: ${m.registrationNumber}`).join("\n"),
  },
  {
    tag: "professor_responsavel",
    label: "Professor(a) Responsável",
    category: "Professor",
    description: "Nome completo do docente orientador",
    example: (s) => s.professor?.name || "Ronan Anacleto Lopes",
  },
  {
    tag: "formacao_professor",
    label: "Titulação do Professor",
    category: "Professor",
    description: "Titulação acadêmica (Mestre, Doutor, Especialista)",
    example: (s) => s.professor?.title || "Mestre",
  },
  {
    tag: "cargo_professor",
    label: "Função / Cargo do Professor",
    category: "Professor",
    description: "Cargo ocupado pelo docente no IFPR",
    example: (s) => s.professor?.role || "Coordenador do Curso de Sistemas de Informação",
  },
  {
    tag: "instituicao",
    label: "Instituição",
    category: "Instituição",
    description: "Nome oficial da instituição de ensino",
    example: (s) => s.institution?.name || "Instituto Federal do Paraná",
  },
  {
    tag: "campus",
    label: "Campus",
    category: "Instituição",
    description: "Nome do campus de lotação",
    example: (s) => s.institution?.campus || "Campus Ivaiporã",
  },
  {
    tag: "endereco_instituicao",
    label: "Endereço do Campus",
    category: "Instituição",
    description: "Logradouro, número e bairro do campus",
    example: (s) => s.institution?.address || "",
  },
  {
    tag: "cidade",
    label: "Cidade",
    category: "Instituição",
    description: "Município do campus",
    example: (s) => s.institution?.city || "Ivaiporã",
  },
  {
    tag: "estado",
    label: "Estado (UF)",
    category: "Instituição",
    description: "Sigla do estado",
    example: (s) => s.institution?.state || "PR",
  },
  {
    tag: "cep",
    label: "CEP",
    category: "Instituição",
    description: "Código de Endereçamento Postal",
    example: (s) => s.institution?.zipCode || "86873-400",
  },
  {
    tag: "endereco_completo",
    label: "Endereço Completo Formatado",
    category: "Instituição",
    description: "Endereço unificado com rua, bairro, cidade, UF e CEP",
    example: (s) =>
      `${s.institution?.address}, ${s.institution?.city} - ${s.institution?.state}, CEP: ${s.institution?.zipCode}`,
  },
  {
    tag: "periodo_letivo",
    label: "Período Letivo",
    category: "Geral",
    description: "Semestre e ano corrente do calendário acadêmico",
    example: () => `2º Semestre / ${new Date().getFullYear()}`,
  },
  {
    tag: "data",
    label: "Data por Extenso",
    category: "Geral",
    description: "Data atual formatada em português",
    example: () =>
      new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(
        new Date()
      ),
  },
];
