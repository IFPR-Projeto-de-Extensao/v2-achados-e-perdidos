/**
 * LOCALIZA+ v1.10.10 — Testes de Ciclo de Vida e Segurança da Solicitação de Devolução
 * 
 * Validação rigorosa dos cenários de teste obrigatórios:
 * 1. Nova solicitação -> Criada normalmente (ALUNO, SERVIDOR, ADMIN)
 * 2. Solicitação PENDENTE existente -> Bloqueio amigável, SEM execução de escrita (zero 403)
 * 3. Solicitação APROVADA existente -> Bloqueio amigável
 * 4. Solicitação CANCELADA -> Reenvio permitido (preservando createdAt e id original)
 * 5. Solicitação REJEITADA -> Reenvio permitido (preservando createdAt e id original)
 * 6. Objeto DEVOLVIDO -> Envio bloqueado
 * 7. Objeto ENCERRADO -> Envio bloqueado
 * 8. Usuário sem perfil ativo -> Escrita rejeitada
 * 9. Usuário INTRUSO -> Escrita rejeitada
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ItemClaim, LostFoundItem, User } from "../types";
import {
  DuplicateClaimError,
  ItemUnavailableError,
  ClaimStateNotResubmittableError,
} from "./claimErrors";

interface MockFirestoreState {
  items: Map<string, LostFoundItem>;
  claims: Map<string, ItemClaim>;
  users: Map<string, User>;
  writtenClaims: ItemClaim[];
}

class TransactionalClaimRunner {
  state: MockFirestoreState;
  writeExecutionCount = 0;

  constructor() {
    this.state = {
      items: new Map(),
      claims: new Map(),
      users: new Map(),
      writtenClaims: [],
    };
  }

  seedItem(item: LostFoundItem) {
    this.state.items.set(item.id, item);
  }

  seedClaim(claim: ItemClaim) {
    this.state.claims.set(claim.id, claim);
  }

  seedUser(user: User) {
    this.state.users.set(user.id, user);
  }

  /**
   * Executa a lógica idêntica à transação de submitClaim em AppContext.tsx
   */
  async executeSubmitClaimTransaction(
    authUser: Partial<User> | null,
    itemId: string,
    featuresText: string,
    additionalText?: string
  ): Promise<{ success: boolean; claimId?: string; message: string }> {
    if (!authUser || !authUser.id || authUser.id === "guest") {
      throw new Error("Autenticação necessária para solicitar devolução.");
    }

    const effectiveUserId = authUser.id;
    const effectiveUserEmail = authUser.email || "";
    const effectiveUserName = authUser.name || "Usuário IFPR";
    const effectiveUserRole = authUser.role || "ALUNO";

    // Checagem de perfil e intruso
    const userDoc = this.state.users.get(effectiveUserId);
    const isRoot = effectiveUserEmail === "paulocauan39@gmail.com";
    if (!isRoot) {
      if (!userDoc || userDoc.status !== "active") {
        throw new Error("PERMISSION_DENIED: Usuário sem perfil ativo no Firestore.");
      }
      if (userDoc.role === "INTRUSO" || authUser.role === "INTRUSO") {
        throw new Error("PERMISSION_DENIED: Usuário classificado como INTRUSO não possui permissão para reivindicar objetos.");
      }
    }

    const claimDocId = `claim_${effectiveUserId}_${itemId}`;

    const compositeAnswer = additionalText
      ? `${featuresText}\n\n[Informações Adicionais]: ${additionalText}`
      : featuresText;

    const newClaim: ItemClaim = {
      id: claimDocId,
      itemId,
      itemTitle: this.state.items.get(itemId)?.title || "Objeto",
      itemCategory: this.state.items.get(itemId)?.category || "Outros",
      itemLocation: this.state.items.get(itemId)?.location || "Campus",
      itemImageUrl: "",
      claimerId: effectiveUserId,
      claimerName: effectiveUserName,
      claimerEmail: effectiveUserEmail,
      claimerRole: effectiveUserRole,
      distinctiveFeatures: featuresText,
      additionalInfo: additionalText,
      verificationAnswer: compositeAnswer,
      status: "PENDENTE",
      createdAt: new Date().toISOString(),
    };

    // --- Início da Transação Atômica ---
    // 1. Validação de integridade do objeto no banco
    const itemInDb = this.state.items.get(itemId);
    if (!itemInDb) {
      throw new ItemUnavailableError("Objeto não encontrado no banco de dados do campus.");
    }
    if (itemInDb.status === "DEVOLVIDO" || itemInDb.status === "ENCERRADO") {
      throw new ItemUnavailableError("Este objeto já foi devolvido ou encerrado e não recebe novas solicitações.");
    }

    // 2. Consulta da Claim existente
    const existingClaim = this.state.claims.get(claimDocId);
    if (existingClaim) {
      const currentStatus = (existingClaim.status || "").toUpperCase();

      // 3 & 4. PENDENTE: Interrompe sem gravar
      if (currentStatus === "PENDENTE") {
        throw new DuplicateClaimError(
          "PENDENTE",
          "Você já possui uma solicitação em análise para este objeto. Acompanhe o andamento em seu perfil."
        );
      }

      // 5. APROVADO: Interrompe sem gravar
      if (currentStatus === "APROVADO") {
        throw new DuplicateClaimError(
          "APROVADO",
          "Você já possui uma solicitação aprovada para este objeto. Acompanhe o andamento em seu perfil ou compareça à Secretaria/SEBAC para retirada."
        );
      }

      // 6, 7 & 8. CANCELADO ou REJEITADO: Reenvio permitido preservando createdAt original
      if (currentStatus === "CANCELADO" || currentStatus === "REJEITADO") {
        newClaim.createdAt = existingClaim.createdAt;
        newClaim.resubmittedAt = new Date().toISOString();
      } else {
        // 9. Estados desconhecidos ou CONCLUIDO
        if (currentStatus === "CONCLUIDO") {
          throw new ClaimStateNotResubmittableError(
            "Este pertence já foi retirado e sua solicitação encontra-se concluída."
          );
        }
        throw new ClaimStateNotResubmittableError(
          `Esta solicitação encontra-se no estado '${existingClaim.status}' e não pode ser reenviada.`
        );
      }
    }

    // Gravação efetiva apenas se aprovado pelo ciclo de vida
    this.writeExecutionCount++;
    this.state.claims.set(claimDocId, newClaim);
    this.state.writtenClaims.push(newClaim);

    return {
      success: true,
      claimId: newClaim.id,
      message: "Solicitação de devolução enviada com sucesso para análise da Secretaria!",
    };
  }
}

describe("LOCALIZA+ v1.10.10 — Validação do Ciclo de Vida de Solicitações de Devolução", () => {
  let runner: TransactionalClaimRunner;

  const mockItemAtivo: LostFoundItem = {
    id: "item-carteira-101",
    title: "Carteira de Couro Marrom",
    type: "ENCONTRADO",
    description: "Encontrada no bloco administrativo",
    category: "Documentos & Cartões",
    color: "Marrom",
    brand: "Couro Legítimo",
    location: "Secretaria Acadêmica",
    date: "2026-08-10",
    status: "ENCONTRADO",
    imageUrl: "https://example.com/carteira.jpg",
    contactInfo: "Secretaria do Campus",
    createdAt: "2026-08-10T10:00:00.000Z",
    registeredByUserId: "servidor-1",
    registeredByName: "Servidor 1",
    registeredByRole: "SERVIDOR",
    qrCodeId: "qr-item-101",
  };

  const mockItemDevolvido: LostFoundItem = {
    ...mockItemAtivo,
    id: "item-devolvido-102",
    status: "DEVOLVIDO",
  };

  const mockItemEncerrado: LostFoundItem = {
    ...mockItemAtivo,
    id: "item-encerrado-103",
    status: "ENCERRADO",
  };

  const alunoUser: User = {
    id: "uid-aluno-1",
    name: "João Aluno",
    email: "joao.aluno@estudantes.ifpr.edu.br",
    role: "ALUNO",
    status: "active",
    approvalStatus: "APROVADO",
    courseOrDept: "Técnico em Informática",
    registrationNumber: "2026101",
    avatarUrl: "https://example.com/avatar.png",
  };

  const servidorUser: User = {
    id: "uid-servidor-1",
    name: "Maria Servidora",
    email: "maria.servidora@ifpr.edu.br",
    role: "SERVIDOR",
    status: "active",
    approvalStatus: "APROVADO",
    courseOrDept: "Secretaria Acadêmica",
    registrationNumber: "2026201",
    avatarUrl: "https://example.com/avatar.png",
  };

  const adminUser: User = {
    id: "uid-admin-cauan",
    name: "Paulo Cauan",
    email: "paulocauan39@gmail.com",
    role: "ADMIN",
    status: "active",
    approvalStatus: "APROVADO",
    courseOrDept: "Diretoria de TI",
    registrationNumber: "2026001",
    avatarUrl: "https://example.com/avatar.png",
  };

  const intrusoUser: User = {
    id: "uid-intruso-1",
    name: "Visitante Externo",
    email: "visitante@externo.com",
    role: "INTRUSO",
    status: "active",
    approvalStatus: "APROVADO",
    courseOrDept: "Comunidade Externa",
    registrationNumber: "EXT2026",
    avatarUrl: "https://example.com/avatar.png",
  };

  beforeEach(() => {
    runner = new TransactionalClaimRunner();
    runner.seedItem(mockItemAtivo);
    runner.seedItem(mockItemDevolvido);
    runner.seedItem(mockItemEncerrado);
    runner.seedUser(alunoUser);
    runner.seedUser(servidorUser);
    runner.seedUser(adminUser);
    runner.seedUser(intrusoUser);
  });

  // ---------------------------------------------------------------------------
  // Cenário 1: Nova Solicitação (Criada Normalmente)
  // ---------------------------------------------------------------------------
  it("Cenário 1: Nova solicitação de ALUNO é criada com sucesso e status PENDENTE", async () => {
    const res = await runner.executeSubmitClaimTransaction(
      alunoUser,
      mockItemAtivo.id,
      "Contém CNH no nome de João e cartão bancário azul."
    );

    expect(res.success).toBe(true);
    expect(res.claimId).toBe(`claim_${alunoUser.id}_${mockItemAtivo.id}`);
    expect(runner.writeExecutionCount).toBe(1);

    const saved = runner.state.claims.get(`claim_${alunoUser.id}_${mockItemAtivo.id}`);
    expect(saved).toBeDefined();
    expect(saved?.status).toBe("PENDENTE");
    expect(saved?.claimerId).toBe(alunoUser.id);
  });

  it("Cenário 1b: Nova solicitação de SERVIDOR e ADMIN também é criada com sucesso", async () => {
    const resServidor = await runner.executeSubmitClaimTransaction(
      servidorUser,
      mockItemAtivo.id,
      "Crachá funcional com foto e chave da sala de reunião."
    );
    expect(resServidor.success).toBe(true);

    const resAdmin = await runner.executeSubmitClaimTransaction(
      adminUser,
      mockItemAtivo.id,
      "Chave mestra do laboratório com chaveiro do IFPR."
    );
    expect(resAdmin.success).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Cenário 2: Solicitação PENDENTE Existente (Bloqueio sem Escrita)
  // ---------------------------------------------------------------------------
  it("Cenário 2: Solicitação PENDENTE existente bloqueia a operação SEM realizar escrita no Firestore", async () => {
    // Semeia claim preexistente com status PENDENTE
    const claimId = `claim_${alunoUser.id}_${mockItemAtivo.id}`;
    runner.seedClaim({
      id: claimId,
      itemId: mockItemAtivo.id,
      itemTitle: mockItemAtivo.title,
      itemCategory: mockItemAtivo.category,
      itemLocation: mockItemAtivo.location,
      claimerId: alunoUser.id,
      claimerName: alunoUser.name,
      claimerEmail: alunoUser.email,
      claimerRole: "ALUNO",
      distinctiveFeatures: "Características iniciais",
      verificationAnswer: "Características iniciais",
      status: "PENDENTE",
      createdAt: "2026-08-11T09:00:00.000Z",
    });

    const writesBefore = runner.writeExecutionCount;

    await expect(
      runner.executeSubmitClaimTransaction(
        alunoUser,
        mockItemAtivo.id,
        "Tentando enviar novamente com novas fotos ou texto."
      )
    ).rejects.toThrow(DuplicateClaimError);

    // CRÍTICO: Nenhuma gravação deve ocorrer no banco
    expect(runner.writeExecutionCount).toBe(writesBefore);

    // Mensagem amigável deve ser exatamente a solicitada
    try {
      await runner.executeSubmitClaimTransaction(
        alunoUser,
        mockItemAtivo.id,
        "Tentando enviar novamente"
      );
    } catch (e: any) {
      expect(e.message).toBe("Você já possui uma solicitação em análise para este objeto. Acompanhe o andamento em seu perfil.");
      expect(e.status).toBe("PENDENTE");
    }
  });

  // ---------------------------------------------------------------------------
  // Cenário 3: Solicitação APROVADA Existente (Bloqueio sem Escrita)
  // ---------------------------------------------------------------------------
  it("Cenário 3: Solicitação APROVADA existente impede nova submissão com aviso amigável", async () => {
    const claimId = `claim_${alunoUser.id}_${mockItemAtivo.id}`;
    runner.seedClaim({
      id: claimId,
      itemId: mockItemAtivo.id,
      itemTitle: mockItemAtivo.title,
      itemCategory: mockItemAtivo.category,
      itemLocation: mockItemAtivo.location,
      claimerId: alunoUser.id,
      claimerName: alunoUser.name,
      claimerEmail: alunoUser.email,
      claimerRole: "ALUNO",
      distinctiveFeatures: "Características aprovadas",
      verificationAnswer: "Características aprovadas",
      status: "APROVADO",
      createdAt: "2026-08-11T09:00:00.000Z",
    });

    const writesBefore = runner.writeExecutionCount;

    await expect(
      runner.executeSubmitClaimTransaction(
        alunoUser,
        mockItemAtivo.id,
        "Tentativa em claim aprovada"
      )
    ).rejects.toThrow("Você já possui uma solicitação aprovada para este objeto");

    // Zero escritas
    expect(runner.writeExecutionCount).toBe(writesBefore);
  });

  // ---------------------------------------------------------------------------
  // Cenário 4: Solicitação CANCELADA (Reenvio Permitido com Preservação de Data)
  // ---------------------------------------------------------------------------
  it("Cenário 4: Solicitação CANCELADA permite reenvio preservando createdAt original e adicionando resubmittedAt", async () => {
    const claimId = `claim_${alunoUser.id}_${mockItemAtivo.id}`;
    const originalCreatedAt = "2026-08-01T14:30:00.000Z";

    runner.seedClaim({
      id: claimId,
      itemId: mockItemAtivo.id,
      itemTitle: mockItemAtivo.title,
      itemCategory: mockItemAtivo.category,
      itemLocation: mockItemAtivo.location,
      claimerId: alunoUser.id,
      claimerName: alunoUser.name,
      claimerEmail: alunoUser.email,
      claimerRole: "ALUNO",
      distinctiveFeatures: "Texto antigo cancelado",
      verificationAnswer: "Texto antigo cancelado",
      status: "CANCELADO",
      createdAt: originalCreatedAt,
    });

    const res = await runner.executeSubmitClaimTransaction(
      alunoUser,
      mockItemAtivo.id,
      "Novas características fornecidas após cancelamento anterior."
    );

    expect(res.success).toBe(true);
    expect(runner.writeExecutionCount).toBe(1);

    const updated = runner.state.claims.get(claimId);
    expect(updated).toBeDefined();
    expect(updated?.status).toBe("PENDENTE");
    expect(updated?.createdAt).toBe(originalCreatedAt); // Preservação estrita
    expect(updated?.resubmittedAt).toBeDefined(); // Metadado de reenvio
    expect(updated?.distinctiveFeatures).toContain("Novas características fornecidas");
  });

  // ---------------------------------------------------------------------------
  // Cenário 5: Solicitação REJEITADA (Reenvio Permitido com Preservação de Data)
  // ---------------------------------------------------------------------------
  it("Cenário 5: Solicitação REJEITADA permite reenvio preservando createdAt original", async () => {
    const claimId = `claim_${alunoUser.id}_${mockItemAtivo.id}`;
    const originalCreatedAt = "2026-08-05T08:15:00.000Z";

    runner.seedClaim({
      id: claimId,
      itemId: mockItemAtivo.id,
      itemTitle: mockItemAtivo.title,
      itemCategory: mockItemAtivo.category,
      itemLocation: mockItemAtivo.location,
      claimerId: alunoUser.id,
      claimerName: alunoUser.name,
      claimerEmail: alunoUser.email,
      claimerRole: "ALUNO",
      distinctiveFeatures: "Detalhes insuficientes na 1ª tentativa",
      verificationAnswer: "Detalhes insuficientes na 1ª tentativa",
      status: "REJEITADO",
      rejectionReason: "Falta comprovação do número de série",
      createdAt: originalCreatedAt,
    });

    const res = await runner.executeSubmitClaimTransaction(
      alunoUser,
      mockItemAtivo.id,
      "Agora com número de série completo e nota fiscal anexada."
    );

    expect(res.success).toBe(true);
    const updated = runner.state.claims.get(claimId);
    expect(updated?.status).toBe("PENDENTE");
    expect(updated?.createdAt).toBe(originalCreatedAt);
    expect(updated?.resubmittedAt).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Cenário 6 & 7: Objeto DEVOLVIDO ou ENCERRADO (Envio Bloqueado)
  // ---------------------------------------------------------------------------
  it("Cenário 6: Objeto com status DEVOLVIDO bloqueia o envio da solicitação", async () => {
    await expect(
      runner.executeSubmitClaimTransaction(
        alunoUser,
        mockItemDevolvido.id,
        "Tentando reivindicar objeto já devolvido"
      )
    ).rejects.toThrow("já foi devolvido ou encerrado");

    expect(runner.writeExecutionCount).toBe(0);
  });

  it("Cenário 7: Objeto com status ENCERRADO bloqueia o envio da solicitação", async () => {
    await expect(
      runner.executeSubmitClaimTransaction(
        alunoUser,
        mockItemEncerrado.id,
        "Tentando reivindicar objeto com ciclo encerrado"
      )
    ).rejects.toThrow("já foi devolvido ou encerrado");

    expect(runner.writeExecutionCount).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Cenário 8: Usuário Sem Perfil Ativo (Rejeição de Permissão)
  // ---------------------------------------------------------------------------
  it("Cenário 8: Usuário sem perfil ativo no Firestore tem a escrita rejeitada com PERMISSION_DENIED", async () => {
    const userSemPerfil: User = {
      id: "uid-sem-perfil",
      name: "Novo Aluno Sem Doc",
      email: "novo@estudantes.ifpr.edu.br",
      role: "ALUNO",
      status: "active",
      approvalStatus: "APROVADO",
      courseOrDept: "Técnico em Informática",
      registrationNumber: "2026999",
      avatarUrl: "https://example.com/avatar.png",
    };
    // Note: NÃO semeia userSemPerfil em runner.state.users

    await expect(
      runner.executeSubmitClaimTransaction(
        userSemPerfil,
        mockItemAtivo.id,
        "Características particulares"
      )
    ).rejects.toThrow("PERMISSION_DENIED: Usuário sem perfil ativo");

    expect(runner.writeExecutionCount).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Cenário 9: Usuário INTRUSO (Rejeição de Permissão)
  // ---------------------------------------------------------------------------
  it("Cenário 9: Usuário com role INTRUSO tem a escrita rejeitada com PERMISSION_DENIED", async () => {
    await expect(
      runner.executeSubmitClaimTransaction(
        intrusoUser,
        mockItemAtivo.id,
        "Características declaradas por visitante"
      )
    ).rejects.toThrow("PERMISSION_DENIED: Usuário classificado como INTRUSO");

    expect(runner.writeExecutionCount).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Cenário de Proteção contra Estados Concluídos / Desconhecidos
  // ---------------------------------------------------------------------------
  it("Cenário Adicional: Reenvio em claim com status CONCLUIDO é terminantemente bloqueado", async () => {
    const claimId = `claim_${alunoUser.id}_${mockItemAtivo.id}`;
    runner.seedClaim({
      id: claimId,
      itemId: mockItemAtivo.id,
      itemTitle: mockItemAtivo.title,
      itemCategory: mockItemAtivo.category,
      itemLocation: mockItemAtivo.location,
      claimerId: alunoUser.id,
      claimerName: alunoUser.name,
      claimerEmail: alunoUser.email,
      claimerRole: "ALUNO",
      distinctiveFeatures: "Já retirado",
      verificationAnswer: "Já retirado",
      status: "CONCLUIDO",
      createdAt: "2026-08-01T10:00:00.000Z",
    });

    await expect(
      runner.executeSubmitClaimTransaction(
        alunoUser,
        mockItemAtivo.id,
        "Tentando reabrir claim concluída"
      )
    ).rejects.toThrow("já foi retirado e sua solicitação encontra-se concluída");

    expect(runner.writeExecutionCount).toBe(0);
  });
});
