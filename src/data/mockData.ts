import { LostFoundItem, User, NotificationItem, ItemClaim } from "../types";

export const MOCK_USERS: User[] = [
  {
    id: "u1",
    name: "Lucas Silva Santos",
    email: "lucas.santos@estudante.ifpr.edu.br",
    role: "ALUNO",
    courseOrDept: "Técnico em Informática (3º Ano - Campus Ivaiporã)",
    registrationNumber: "2024109823",
    avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    phone: "(43) 99876-5432"
  },
  {
    id: "u2",
    name: "Profª Maria Oliveira",
    email: "maria.oliveira@ifpr.edu.br",
    role: "SERVIDOR",
    courseOrDept: "Sistemas de Informação / Docente - Campus Ivaiporã",
    registrationNumber: "1892304",
    avatarUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80",
    phone: "(43) 98765-4321"
  },
  {
    id: "u-paulocauan",
    name: "Paulo Cauan",
    email: "paulocauan39@gmail.com",
    role: "ADMIN",
    courseOrDept: "Administração Geral & TI - Campus Ivaiporã",
    registrationNumber: "2026998811",
    avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80",
    phone: "(43) 99999-8888"
  },
  {
    id: "u3",
    name: "Carlos Eduardo Machado",
    email: "carlos.machado@ifpr.edu.br",
    role: "ADMIN",
    courseOrDept: "Secretaria Acadêmica (SEBAC) - Campus Ivaiporã",
    registrationNumber: "1029384",
    avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
    phone: "(43) 3126-9400"
  }
];

export const IFPR_LOCATIONS = [
  "Bloco Didático - Salas 01 a 12",
  "Laboratórios de Informática (Lab 01 e 02)",
  "Biblioteca Campus Ivaiporã",
  "Refeitório / Cantina Estudantil",
  "Ginásio Poliesportivo & Quadra Externa",
  "Secretaria Acadêmica (SEBAC / Bloco ADM)",
  "Estacionamento Principal & Guarita",
  "Auditório do Campus Ivaiporã",
  "Laboratórios de Física, Química e Biologia",
  "Área Verde & Pátio Central"
];

export const INITIAL_ITEMS: LostFoundItem[] = [
  {
    id: "ifpr-101",
    title: "Garrafa Térmica Kouda Verde 750ml",
    category: "Garrafas & Marmitas",
    type: "ENCONTRADO",
    status: "ENCONTRADO",
    description: "Garrafa de inox verde fosco marca Kouda, com pequenos arranhões na tampa inferior. Encontrada sobre a mesa central do refeitório do Campus Ivaiporã após o almoço.",
    color: "Verde",
    brand: "Kouda",
    location: "Refeitório / Cantina Estudantil",
    date: "2026-08-04",
    imageUrl: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=600&auto=format&fit=crop&q=80",
    additionalImages: [
      "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=600&auto=format&fit=crop&q=80"
    ],
    contactInfo: "Deixado na Guarita da Portaria do Campus Ivaiporã",
    registeredByUserId: "u2",
    registeredByName: "Profª Maria Oliveira",
    registeredByRole: "SERVIDOR",
    qrCodeId: "QR-IFPR-101-GARRAFA",
    createdAt: "2026-08-04T11:30:00Z",
    secretVerificationHint: "Possui um adesivo pequeno do Tux (Linux) no fundo."
  },
  {
    id: "ifpr-102",
    title: "Calculadora Científica Casio fx-991ES Plus",
    category: "Eletrônicos",
    type: "PERDIDO",
    status: "PERDIDO",
    description: "Calculadora cinza/prata com tampa protetora. Esquecida durante a prova de Programação Web no Lab 01 do Campus Ivaiporã.",
    color: "Cinza / Prata",
    brand: "Casio",
    location: "Laboratórios de Informática (Lab 01 e 02)",
    date: "2026-08-03",
    imageUrl: "https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd?w=600&auto=format&fit=crop&q=80",
    contactInfo: "lucas.santos@estudante.ifpr.edu.br",
    registeredByUserId: "u1",
    registeredByName: "Lucas Silva Santos",
    registeredByRole: "ALUNO",
    qrCodeId: "QR-IFPR-102-CASIO",
    createdAt: "2026-08-03T16:45:00Z",
    secretVerificationHint: "Tem uma etiqueta pequena com as iniciais L.S. no compartimento de pilha."
  },
  {
    id: "ifpr-103",
    title: "Carteira de Estudante IFPR Campus Ivaiporã",
    category: "Documentos & Cartões",
    type: "ENCONTRADO",
    status: "EM_ANALISE",
    description: "Porta-cartões preto transparente contendo crachá institucional do IFPR Campus Ivaiporã em nome de Pedro Henrique e cartão de passe municipal.",
    color: "Preto",
    brand: "IFPR Campus Ivaiporã",
    location: "Biblioteca Campus Ivaiporã",
    date: "2026-08-04",
    imageUrl: "https://images.unsplash.com/photo-1627123424574-724758594e93?w=600&auto=format&fit=crop&q=80",
    contactInfo: "Balcão de Atendimento da Biblioteca Campus Ivaiporã",
    registeredByUserId: "u3",
    registeredByName: "Carlos Eduardo Machado",
    registeredByRole: "ADMIN",
    qrCodeId: "QR-IFPR-103-CARTEIRA",
    createdAt: "2026-08-04T09:15:00Z"
  },
  {
    id: "ifpr-104",
    title: "Moletom Cinza IFPR Oficial Campus Ivaiporã",
    category: "Roupas & Calçados",
    type: "ENCONTRADO",
    status: "ENCONTRADO",
    description: "Casaco de moletom cinza com capuz e bordado frontal verde 'IFPR Campus Ivaiporã'. Esquecido na arquibancada do ginásio poliesportivo.",
    color: "Cinza",
    brand: "IFPR Oficial",
    location: "Ginásio Poliesportivo & Quadra Externa",
    date: "2026-08-02",
    imageUrl: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=600&auto=format&fit=crop&q=80",
    contactInfo: "Coordenação de Educação Física do Campus Ivaiporã",
    registeredByUserId: "u2",
    registeredByName: "Profª Maria Oliveira",
    registeredByRole: "SERVIDOR",
    qrCodeId: "QR-IFPR-104-MOLETOM",
    createdAt: "2026-08-02T17:00:00Z"
  },
  {
    id: "ifpr-105",
    title: "Molho de Chaves com Chaveiro IFPR Ivaiporã",
    category: "Chaves",
    type: "PERDIDO",
    status: "PERDIDO",
    description: "Molho com 4 chaves (duas de porta, uma tetra e uma de cadeado Pado) com fita verde do IFPR Ivaiporã e mini bichinho de pelúcia.",
    color: "Prata / Verde",
    brand: "Pado / Yale",
    location: "Área Verde & Pátio Central",
    date: "2026-08-04",
    imageUrl: "https://images.unsplash.com/photo-1582139329536-e7284fece509?w=600&auto=format&fit=crop&q=80",
    contactInfo: "lucas.santos@estudante.ifpr.edu.br",
    registeredByUserId: "u1",
    registeredByName: "Lucas Silva Santos",
    registeredByRole: "ALUNO",
    qrCodeId: "QR-IFPR-105-CHAVES",
    createdAt: "2026-08-04T14:20:00Z"
  },
  {
    id: "ifpr-106",
    title: "Caderno Inteligente Universitário Azul Escuro",
    category: "Material Escolar & Livros",
    type: "ENCONTRADO",
    status: "DEVOLVIDO",
    description: "Caderno com discos azuis, divisórias coloridas e marcações de matéria de Agronomia no Bloco Didático.",
    color: "Azul Escuro",
    brand: "Caderno Inteligente",
    location: "Bloco Didático - Salas 01 a 12",
    date: "2026-07-28",
    imageUrl: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80",
    contactInfo: "Devolvido com sucesso ao proprietário em 30/07/2026",
    registeredByUserId: "u3",
    registeredByName: "Carlos Eduardo Machado",
    registeredByRole: "ADMIN",
    qrCodeId: "QR-IFPR-106-CADERNO",
    createdAt: "2026-07-28T10:00:00Z",
    resolutionDate: "2026-07-30T15:00:00Z"
  },
  {
    id: "ifpr-107",
    title: "Fone de Ouvido Bluetooth JBL Tune 510BT Preto",
    category: "Eletrônicos",
    type: "ENCONTRADO",
    status: "ENCONTRADO",
    description: "Fone supra-auricular dobrável preto JBL, em perfeito estado de funcionamento. Deixado sobre a mesa de estudos perto da janela da biblioteca do Campus Ivaiporã.",
    color: "Preto",
    brand: "JBL",
    location: "Biblioteca Campus Ivaiporã",
    date: "2026-08-01",
    imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80",
    contactInfo: "Guardado no cofre do setor de Achados e Perdidos da Biblioteca do Campus Ivaiporã",
    registeredByUserId: "u3",
    registeredByName: "Carlos Eduardo Machado",
    registeredByRole: "ADMIN",
    qrCodeId: "QR-IFPR-107-JBL",
    createdAt: "2026-08-01T14:10:00Z",
    secretVerificationHint: "Nome do dispositivo Bluetooth é 'Fone da Beatriz'."
  },
  {
    id: "ifpr-108",
    title: "Guarda-chuva Automático Preto Fator de Proteção UV",
    category: "Guarda-chuvas",
    type: "ENCONTRADO",
    status: "ENCONTRADO",
    description: "Guarda-chuva compacto preto com cabo curvo emborrachado. Esquecido no suporte da Guarita Central do Campus Ivaiporã.",
    color: "Preto",
    brand: "Fazzoletti",
    location: "Estacionamento Principal & Guarita",
    date: "2026-08-03",
    imageUrl: "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=600&auto=format&fit=crop&q=80",
    contactInfo: "Guarita Principal de Entrada",
    registeredByUserId: "u2",
    registeredByName: "Profª Maria Oliveira",
    registeredByRole: "SERVIDOR",
    qrCodeId: "QR-IFPR-108-GUARDACHUVA",
    createdAt: "2026-08-03T18:00:00Z"
  }
];

export const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "n1",
    userId: "u1",
    title: "Possível Correspondência Encontrada!",
    message: "A IA identificou 92% de similaridade entre a sua Calculadora Casio perdida e um item recente no Bloco B.",
    timestamp: "2026-08-04T12:00:00Z",
    read: false,
    type: "MATCH",
    relatedItemId: "ifpr-102"
  },
  {
    id: "n2",
    userId: "u1",
    title: "Solicitação Aprovada",
    message: "Sua solicitação de devolução para o Caderno Inteligente foi confirmada pela secretaria.",
    timestamp: "2026-07-30T15:05:00Z",
    read: true,
    type: "CLAIM_UPDATE",
    relatedItemId: "ifpr-106"
  }
];

export const MOCK_CLAIMS: ItemClaim[] = [
  {
    id: "claim-1",
    itemId: "ifpr-101",
    itemTitle: "Garrafa Térmica Kouda Verde 750ml",
    claimerId: "u1",
    claimerName: "Lucas Silva Santos",
    claimerEmail: "lucas.santos@estudante.ifpr.edu.br",
    claimerRole: "ALUNO",
    verificationAnswer: "Tem um adesivo do Tux Linux colado no fundo da garrafa.",
    status: "PENDENTE",
    createdAt: "2026-08-04T13:00:00Z",
    notes: "Aguardando confirmação presencial na portaria."
  }
];
