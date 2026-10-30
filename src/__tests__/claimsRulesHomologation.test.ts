/**
 * LOCALIZA+ v1.10.9 — Bateria de Homologação de Regras de Segurança (SEC-07)
 * 
 * Arquivo: src/__tests__/claimsRulesHomologation.test.ts
 * 
 * Objetivo:
 * Validar localmente e de forma determinística todas as regras de segurança do Firestore
 * para a coleção `/claims/{claimId}`, autorizações de acesso, exceções de leitura inicial,
 * ciclo de vida de reivindicações, integridade de campos, precedência de intruso e
 * isolamento estrito de consultas (cenários C-01 a C-18).
 * 
 * REGRAS CRÍTICAS DE SEGURANÇA E EXECUÇÃO:
 * 1. Execução estritamente restrita ao Firestore Emulator local em 127.0.0.1:8080.
 * 2. Bloqueio absoluto e abortamento imediato caso a configuração aponte para host externo.
 * 3. Validação ativa de handshake da assinatura oficial do Cloud Firestore Emulator.
 * 4. Uso estrito do SDK Modular v9+ do Firebase (doc, getDoc, setDoc, updateDoc, deleteField, runTransaction, query, where, getDocs).
 * 5. Nenhum acesso ao Firebase de produção, nenhuma publicação remota de regras e nenhum dado remoto manipulado.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  runTransaction,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import {
  resolveAccountStatus,
  evaluateDeadlineField,
  isUserAccountActive,
  isAccountBlocked,
} from "../lib/accountStatusUtils";

// =============================================================================
// 1. Configuração e Isolamento Rigoroso do Emulador Local
// =============================================================================
const REQUIRED_EMULATOR_HOST = "127.0.0.1";
const REQUIRED_EMULATOR_PORT = 8080;
const PROJECT_ID = "demo-localiza-homologation";

// Verificação de isolamento: aborta imediatamente se FIRESTORE_EMULATOR_HOST for redirecionado
const envEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
if (envEmulatorHost && envEmulatorHost !== `${REQUIRED_EMULATOR_HOST}:${REQUIRED_EMULATOR_PORT}`) {
  throw new Error(
    `[SEC-07] Violação crítica de isolamento: FIRESTORE_EMULATOR_HOST está configurado como '${envEmulatorHost}'. ` +
    `A homologação SEC-07 exige exclusivamente '${REQUIRED_EMULATOR_HOST}:${REQUIRED_EMULATOR_PORT}'. ` +
    `Qualquer tentativa de redirecionamento para host externo ou portas alternativas é expressamente bloqueada.`
  );
}

// Fixa explicitamente a variável de ambiente para impedir que o SDK busque credenciais remotas
process.env.FIRESTORE_EMULATOR_HOST = `${REQUIRED_EMULATOR_HOST}:${REQUIRED_EMULATOR_PORT}`;

// =============================================================================
// 2. Identificadores e Sementes de Teste Determinísticas
// =============================================================================
const ALUNO_UID = "aluno_homologacao_uid_01";
const ALUNO_EMAIL = "aluno1.teste@estudantes.ifpr.edu.br";

const ALUNO_2_UID = "aluno_homologacao_uid_02";
const ALUNO_2_EMAIL = "aluno2.teste@estudantes.ifpr.edu.br";

const SUSPENDED_UID = "aluno_suspenso_uid";
const SUSPENDED_EMAIL = "aluno.suspenso@estudantes.ifpr.edu.br";

const ROOT_ADMIN_UID = "root_admin_uid_cauan";
const ROOT_ADMIN_EMAIL = "paulocauan39@gmail.com";

const SERVIDOR_UID = "servidor_homologacao_uid";
const SERVIDOR_EMAIL = "servidor.secretaria@ifpr.edu.br";

const NO_DOC_UID = "aluno_sem_doc_uid";
const NO_DOC_EMAIL = "sem.doc@estudantes.ifpr.edu.br";

const NO_STATUS_UID = "aluno_sem_status_uid";
const NO_STATUS_EMAIL = "sem.status@estudantes.ifpr.edu.br";

const BANNED_UID = "aluno_banido_uid";
const BANNED_EMAIL = "aluno.banido@estudantes.ifpr.edu.br";

const TEMP_BLOCKED_UID = "aluno_temp_blocked_uid";
const TEMP_BLOCKED_EMAIL = "temp.blocked@estudantes.ifpr.edu.br";

const TEMP_EXPIRED_UID = "aluno_temp_expired_uid";
const TEMP_EXPIRED_EMAIL = "temp.expired@estudantes.ifpr.edu.br";

const INTRUDER_UID = "intruso_jwt_uid";
const INTRUDER_EMAIL = "intruso.jwt@estudantes.ifpr.edu.br";

const ITEM_ENCONTRADO_ID = "item_teste_encontrado_01";
const ITEM_ENCONTRADO_2_ID = "item_teste_encontrado_02";
const ITEM_DEVOLVIDO_ID = "item_teste_devolvido_03";
const ITEM_ENCERRADO_ID = "item_teste_encerrado_04";

let testEnv: RulesTestEnvironment;

/**
 * Handshake ativo de integridade do Cloud Firestore Emulator.
 * Consulta o endpoint e exige cabeçalho ou assinatura específica do emulador,
 * rejeitando respostas HTTP genéricas (como servidores web acidentais).
 */
async function verifyEmulatorAvailability(host: string, port: number): Promise<{ isReady: boolean; reason?: string }> {
  if (host !== REQUIRED_EMULATOR_HOST || port !== REQUIRED_EMULATOR_PORT) {
    return {
      isReady: false,
      reason: `Destino não autorizado: ${host}:${port}. Exigido estritamente: ${REQUIRED_EMULATOR_HOST}:${REQUIRED_EMULATOR_PORT}`,
    };
  }

  const url = `http://${host}:${port}/`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    const bodyText = await res.text();
    const hasEmulatorSignature =
      bodyText.includes("Cloud Firestore emulator") ||
      res.headers.has("firebase-emulator-version") ||
      res.headers.has("x-emulator-version");

    if (hasEmulatorSignature) {
      return { isReady: true };
    }

    return {
      isReady: false,
      reason: `Endpoint ${url} respondeu com HTTP ${res.status}, mas não contém a assinatura do Cloud Firestore Emulator. Resposta: "${bodyText.slice(0, 100)}"`,
    };
  } catch (err: any) {
    return { isReady: false, reason: err?.message || "Conexão recusada ao emulador local (127.0.0.1:8080)" };
  }
}

/**
 * Gera payload válido de solicitação (claim) estritamente aderente ao código de produção em submitClaim().
 */
function getValidClaimPayload(itemId: string, claimantUid = ALUNO_UID, claimantEmail = ALUNO_EMAIL) {
  const claimDocId = `claim_${claimantUid}_${itemId}`;
  return {
    id: claimDocId,
    itemId,
    itemTitle: "Calculadora Científica Casio",
    itemCategory: "Eletrônicos",
    itemLocation: "Laboratório 2",
    itemImageUrl: "",
    claimerId: claimantUid,
    claimerName: "Estudante Teste",
    claimerEmail: claimantEmail,
    claimerRole: "ALUNO",
    claimerRegistration: "2026001234",
    claimerPhone: "41999999999",
    distinctiveFeatures: "Adesivo metálico na tampa traseira e pequeno risco perto do display.",
    additionalInfo: "Possuo a nota fiscal de compra emitida em 2025.",
    verificationAnswer: "Adesivo metálico na tampa traseira e pequeno risco perto do display.\n\n[Informações Adicionais]: Possuo a nota fiscal de compra emitida em 2025.",
    status: "PENDENTE",
    createdAt: "2026-01-10T10:00:00.000Z",
  };
}

describe("LOCALIZA+ v1.10.9 — Bateria SEC-07: Homologação de Regras de Segurança de Claims", () => {
  beforeAll(async () => {
    // 1. Verificação ativa e handshake do emulador local
    const emulatorCheck = await verifyEmulatorAvailability(REQUIRED_EMULATOR_HOST, REQUIRED_EMULATOR_PORT);
    if (!emulatorCheck.isReady) {
      throw new Error(
        `[SEC-07] Firestore Emulator não detectado ou inválido em http://${REQUIRED_EMULATOR_HOST}:${REQUIRED_EMULATOR_PORT} (${emulatorCheck.reason}). ` +
        `A execução foi cancelada preventivamente para evitar chamadas de rede ao Firebase remoto.`
      );
    }

    // 2. Leitura das regras do arquivo firestore.rules do projeto via caminho seguro em ESM
    const rulesPath = resolve(process.cwd(), "firestore.rules");
    const rulesContent = readFileSync(rulesPath, "utf8");

    // 3. Inicialização do ambiente de teste isolado com o projeto demo
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        host: REQUIRED_EMULATOR_HOST,
        port: REQUIRED_EMULATOR_PORT,
        rules: rulesContent,
      },
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    if (!testEnv) return;

    // Limpa o banco de dados do emulador antes de cada teste
    await testEnv.clearFirestore();

    // Popula dados de semente via contexto de infraestrutura (regras desativadas)
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      // Aluno 1: Conta institucional ativa, e-mail verificado
      await setDoc(doc(db, "users", ALUNO_UID), {
        id: ALUNO_UID,
        email: ALUNO_EMAIL,
        name: "Estudante Homologação 1",
        role: "ALUNO",
        status: "active",
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });

      // Aluno 2: Outra conta institucional ativa, e-mail verificado
      await setDoc(doc(db, "users", ALUNO_2_UID), {
        id: ALUNO_2_UID,
        email: ALUNO_2_EMAIL,
        name: "Estudante Homologação 2",
        role: "ALUNO",
        status: "active",
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });

      // Conta de usuário suspenso
      await setDoc(doc(db, "users", SUSPENDED_UID), {
        id: SUSPENDED_UID,
        email: SUSPENDED_EMAIL,
        name: "Estudante Suspenso",
        role: "ALUNO",
        status: "suspended",
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });

      // Root Admin (documento Firestore propositalmente contendo role: 'INTRUSO' para testar precedência)
      await setDoc(doc(db, "users", ROOT_ADMIN_UID), {
        id: ROOT_ADMIN_UID,
        email: ROOT_ADMIN_EMAIL,
        name: "Super Admin Root",
        role: "INTRUSO",
        status: "active",
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });

      // Servidor / TAE do Campus
      await setDoc(doc(db, "users", SERVIDOR_UID), {
        id: SERVIDOR_UID,
        email: SERVIDOR_EMAIL,
        name: "Servidor Secretaria",
        role: "SERVIDOR",
        status: "active",
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });

      // Aluno com documento sem campo status
      await setDoc(doc(db, "users", NO_STATUS_UID), {
        id: NO_STATUS_UID,
        email: NO_STATUS_EMAIL,
        name: "Estudante Sem Status",
        role: "ALUNO",
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });

      // Aluno com conta banida
      await setDoc(doc(db, "users", BANNED_UID), {
        id: BANNED_UID,
        email: BANNED_EMAIL,
        name: "Estudante Banido",
        role: "ALUNO",
        status: "banned",
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });

      // Aluno com bloqueio temporário ativo (blockExpiresAt daqui a 24 horas)
      await setDoc(doc(db, "users", TEMP_BLOCKED_UID), {
        id: TEMP_BLOCKED_UID,
        email: TEMP_BLOCKED_EMAIL,
        name: "Estudante Bloqueio Ativo",
        role: "ALUNO",
        status: "active",
        blockExpiresAt: Timestamp.fromDate(new Date(Date.now() + 86400000)),
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });

      // Aluno com bloqueio temporário expirado (blockExpiresAt há 24 horas atrás)
      await setDoc(doc(db, "users", TEMP_EXPIRED_UID), {
        id: TEMP_EXPIRED_UID,
        email: TEMP_EXPIRED_EMAIL,
        name: "Estudante Bloqueio Expirado",
        role: "ALUNO",
        status: "active",
        blockExpiresAt: Timestamp.fromDate(new Date(Date.now() - 86400000)),
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });

      // Usuário cadastrado antes de marcação JWT como INTRUSO
      await setDoc(doc(db, "users", INTRUDER_UID), {
        id: INTRUDER_UID,
        email: INTRUDER_EMAIL,
        name: "Usuário Intruso JWT",
        role: "ALUNO",
        status: "active",
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });

      // Catálogo de itens no Firestore com estados variados
      await setDoc(doc(db, "items", ITEM_ENCONTRADO_ID), {
        id: ITEM_ENCONTRADO_ID,
        title: "Calculadora Científica Casio",
        category: "Eletrônicos",
        location: "Laboratório 2",
        status: "ENCONTRADO",
        registeredByUserId: SERVIDOR_UID,
        createdAt: "2026-01-02T10:00:00.000Z",
      });

      await setDoc(doc(db, "items", ITEM_ENCONTRADO_2_ID), {
        id: ITEM_ENCONTRADO_2_ID,
        title: "Caderno Universitário Espiral",
        category: "Material Escolar",
        location: "Biblioteca",
        status: "ENCONTRADO",
        registeredByUserId: SERVIDOR_UID,
        createdAt: "2026-01-02T11:00:00.000Z",
      });

      await setDoc(doc(db, "items", ITEM_DEVOLVIDO_ID), {
        id: ITEM_DEVOLVIDO_ID,
        title: "Chaveiro com Crachá",
        category: "Acessórios",
        location: "Pátio Central",
        status: "DEVOLVIDO",
        registeredByUserId: SERVIDOR_UID,
        createdAt: "2026-01-02T12:00:00.000Z",
      });

      await setDoc(doc(db, "items", ITEM_ENCERRADO_ID), {
        id: ITEM_ENCERRADO_ID,
        title: "Garrafa Térmica Azul",
        category: "Utensílios",
        location: "Quadra Poliesportiva",
        status: "ENCERRADO",
        registeredByUserId: SERVIDOR_UID,
        createdAt: "2026-01-02T13:00:00.000Z",
      });
    });
  });

  // =========================================================================
  // CENÁRIOS C-01 A C-03: Leituras de Documento de Claim (getDoc)
  // =========================================================================

  it("C-01: Leitura de claim inexistente com ID determinístico próprio é permitida (docSnap.exists() === false)", async () => {
    const alunoDb = testEnv.authenticatedContext(ALUNO_UID, {
      email: ALUNO_EMAIL,
      email_verified: true,
    }).firestore();

    const claimId = `claim_${ALUNO_UID}_${ITEM_ENCONTRADO_ID}`;
    const claimRef = doc(alunoDb, "claims", claimId);

    const docSnap = await assertSucceeds(getDoc(claimRef));
    expect(docSnap.exists()).toBe(false);
  });

  it("C-02: Leitura de claim inexistente com ID determinístico de outro usuário é barrada com PERMISSION_DENIED (403)", async () => {
    const alunoDb = testEnv.authenticatedContext(ALUNO_UID, {
      email: ALUNO_EMAIL,
      email_verified: true,
    }).firestore();

    // ID determinístico pertencente ao ALUNO_2_UID
    const foreignClaimId = `claim_${ALUNO_2_UID}_${ITEM_ENCONTRADO_ID}`;
    const foreignClaimRef = doc(alunoDb, "claims", foreignClaimId);

    await assertFails(getDoc(foreignClaimRef));
  });

  it("C-03: Leitura de claim existente pertencente a outro solicitante é barrada para usuário comum (403)", async () => {
    const foreignClaimId = `claim_${ALUNO_2_UID}_${ITEM_ENCONTRADO_ID}`;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "claims", foreignClaimId), getValidClaimPayload(ITEM_ENCONTRADO_ID, ALUNO_2_UID, ALUNO_2_EMAIL));
    });

    const alunoDb = testEnv.authenticatedContext(ALUNO_UID, {
      email: ALUNO_EMAIL,
      email_verified: true,
    }).firestore();

    await assertFails(getDoc(doc(alunoDb, "claims", foreignClaimId)));
  });

  // =========================================================================
  // CENÁRIOS C-04 A C-05: Criação Direta e Fluxo Transacional Real
  // =========================================================================

  it("C-04: Criação direta via setDoc com payload de produção e item 'ENCONTRADO' é aprovada (200)", async () => {
    const alunoDb = testEnv.authenticatedContext(ALUNO_UID, {
      email: ALUNO_EMAIL,
      email_verified: true,
    }).firestore();

    const payload = getValidClaimPayload(ITEM_ENCONTRADO_ID);
    await assertSucceeds(setDoc(doc(alunoDb, "claims", payload.id), payload));

    const checkSnap = await assertSucceeds(getDoc(doc(alunoDb, "claims", payload.id)));
    expect(checkSnap.exists()).toBe(true);
    expect(checkSnap.data()?.status).toBe("PENDENTE");
  });

  it("C-05: Fluxo transacional real (runTransaction): leitura inicial de inexistente permitida, criação atômica, verificação com getDoc e rejeição do Firestore na tentativa de sobrescrita", async () => {
    const alunoDb = testEnv.authenticatedContext(ALUNO_UID, {
      email: ALUNO_EMAIL,
      email_verified: true,
    }).firestore();

    const payload = getValidClaimPayload(ITEM_ENCONTRADO_ID);
    const claimRef = doc(alunoDb, "claims", payload.id);

    // 1. Transação inicial: leitura do documento inexistente permitida pela exceção de ID determinístico
    await assertSucceeds(
      runTransaction(alunoDb, async (transaction) => {
        const snap = await transaction.get(claimRef);
        expect(snap.exists()).toBe(false);
        transaction.set(claimRef, payload);
      })
    );

    // 2. Verificação pós-criação usando estritamente a API modular getDoc(doc(...))
    const createdSnap = await assertSucceeds(getDoc(doc(alunoDb, "claims", payload.id)));
    expect(createdSnap.exists()).toBe(true);
    expect(createdSnap.data()?.status).toBe("PENDENTE");

    // 3. Teste das regras de segurança do Firestore na tentativa de sobrescrever documento existente:
    // O documento agora existe com status 'PENDENTE'.
    // Uma nova tentativa de gravação direta (ou transacional) sem passar pelo fluxo de cancelamento
    // é avaliada pelo Firestore como 'allow update', que proíbe qualquer mutação além de status: 'CANCELADO'.
    // Deve falhar no nível do Firestore com PERMISSION_DENIED (assertFails), comprovando defesa em profundidade.
    await assertFails(
      setDoc(doc(alunoDb, "claims", payload.id), {
        ...payload,
        distinctiveFeatures: "Tentativa direta de sobrescrever solicitação ativa sem cancelamento prévio.",
      })
    );

    // Confirma que o documento permaneceu inalterado no banco
    const snapAposTentativa = await assertSucceeds(getDoc(doc(alunoDb, "claims", payload.id)));
    expect(snapAposTentativa.data()?.distinctiveFeatures).toBe(payload.distinctiveFeatures);
  });

  // =========================================================================
  // CENÁRIOS C-06 A C-09: Reenvio de Claim, Imutabilidade e Ciclo de Vida
  // =========================================================================

  it("C-06: Reenvio quando status anterior for 'CANCELADO' é aprovado, preservando createdAt e id original", async () => {
    const originalCreatedAt = "2026-01-05T12:00:00.000Z";
    const payload = {
      ...getValidClaimPayload(ITEM_ENCONTRADO_ID),
      status: "CANCELADO",
      createdAt: originalCreatedAt,
    };

    // Semeia claim cancelada via infraestrutura
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "claims", payload.id), payload);
    });

    const alunoDb = testEnv.authenticatedContext(ALUNO_UID, {
      email: ALUNO_EMAIL,
      email_verified: true,
    }).firestore();

    // Payload de reenvio com status PENDENTE, mantendo id, claimerId, itemId e createdAt
    const resubmitPayload = {
      ...payload,
      status: "PENDENTE",
      distinctiveFeatures: "Características atualizadas após o cancelamento prévio.",
      resubmittedAt: new Date().toISOString(),
    };

    await assertSucceeds(setDoc(doc(alunoDb, "claims", payload.id), resubmitPayload));

    const updatedSnap = await assertSucceeds(getDoc(doc(alunoDb, "claims", payload.id)));
    expect(updatedSnap.data()?.status).toBe("PENDENTE");
    expect(updatedSnap.data()?.createdAt).toBe(originalCreatedAt);
    expect(updatedSnap.data()?.distinctiveFeatures).toBe(resubmitPayload.distinctiveFeatures);
  });

  it("C-07: Reenvio quando status anterior for 'REJEITADO' é aprovado, preservando createdAt e id original", async () => {
    const originalCreatedAt = "2026-01-05T12:00:00.000Z";
    const rejectedPayload = {
      ...getValidClaimPayload(ITEM_ENCONTRADO_ID),
      status: "REJEITADO",
      createdAt: originalCreatedAt,
      rejectionReason: "Informações insuficientes fornecidas na primeira análise.",
      reviewedByUserId: SERVIDOR_UID,
      reviewedByName: "Servidor Secretaria",
      reviewedByRole: "SERVIDOR",
      reviewedAt: "2026-01-06T14:00:00.000Z",
    };

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "claims", rejectedPayload.id), rejectedPayload);
    });

    const alunoDb = testEnv.authenticatedContext(ALUNO_UID, {
      email: ALUNO_EMAIL,
      email_verified: true,
    }).firestore();

    // Reenvio limpo sem campos administrativos e mantendo campos chave
    const resubmitPayload = {
      ...getValidClaimPayload(ITEM_ENCONTRADO_ID),
      id: rejectedPayload.id,
      createdAt: originalCreatedAt,
      status: "PENDENTE",
      distinctiveFeatures: "Novas informações e detalhes comprovando a propriedade do objeto.",
      resubmittedAt: new Date().toISOString(),
    };

    await assertSucceeds(setDoc(doc(alunoDb, "claims", rejectedPayload.id), resubmitPayload));

    const updatedSnap = await assertSucceeds(getDoc(doc(alunoDb, "claims", rejectedPayload.id)));
    expect(updatedSnap.data()?.status).toBe("PENDENTE");
    expect(updatedSnap.data()?.createdAt).toBe(originalCreatedAt);
    expect(updatedSnap.data()?.rejectionReason).toBeUndefined();
  });

  it("C-08: Tentativas de adulteração de campos imutáveis em reenvio são barradas individualmente (403)", async () => {
    const originalCreatedAt = "2026-01-05T12:00:00.000Z";
    const payload = {
      ...getValidClaimPayload(ITEM_ENCONTRADO_ID),
      status: "CANCELADO",
      createdAt: originalCreatedAt,
    };

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "claims", payload.id), payload);
    });

    const alunoDb = testEnv.authenticatedContext(ALUNO_UID, {
      email: ALUNO_EMAIL,
      email_verified: true,
    }).firestore();

    // C-08a: Tentativa de adulterar createdAt durante reenvio deve falhar
    const resubmitTamperedCreatedAt = {
      ...payload,
      status: "PENDENTE",
      createdAt: "2026-02-01T00:00:00.000Z", // Data adulterada
    };
    await assertFails(setDoc(doc(alunoDb, "claims", payload.id), resubmitTamperedCreatedAt));

    // C-08b: Tentativa de adulterar o campo interno 'id' ou 'claimerId' durante reenvio deve falhar
    const resubmitTamperedId = {
      ...payload,
      status: "PENDENTE",
      id: "outro_claim_id_forjado",
    };
    await assertFails(setDoc(doc(alunoDb, "claims", payload.id), resubmitTamperedId));

    const resubmitTamperedClaimerId = {
      ...payload,
      status: "PENDENTE",
      claimerId: ALUNO_2_UID,
    };
    await assertFails(setDoc(doc(alunoDb, "claims", payload.id), resubmitTamperedClaimerId));
  });

  it("C-09: Tentativa de alteração quando o claim já estiver em 'PENDENTE' ou 'APROVADO' é barrada (403)", async () => {
    const payload = getValidClaimPayload(ITEM_ENCONTRADO_ID);
    payload.status = "PENDENTE";

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "claims", payload.id), payload);
    });

    const alunoDb = testEnv.authenticatedContext(ALUNO_UID, {
      email: ALUNO_EMAIL,
      email_verified: true,
    }).firestore();

    // C-09a: Confirma estado prévio 'PENDENTE' e tenta alteração direta de características sem cancelamento
    const priorPendingSnap = await assertSucceeds(getDoc(doc(alunoDb, "claims", payload.id)));
    expect(priorPendingSnap.exists()).toBe(true);
    expect(priorPendingSnap.data()?.status).toBe("PENDENTE");

    await assertFails(
      updateDoc(doc(alunoDb, "claims", payload.id), {
        distinctiveFeatures: "Tentativa de modificar marcas enquanto sob análise.",
      })
    );

    // C-09b: Transiciona para 'APROVADO' e confirma estado prévio antes de testar tentativa de mutação pelo aluno
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "claims", payload.id), {
        status: "APROVADO",
        reviewedByUserId: SERVIDOR_UID,
        reviewedAt: new Date().toISOString(),
      });
    });

    const priorApprovedSnap = await assertSucceeds(getDoc(doc(alunoDb, "claims", payload.id)));
    expect(priorApprovedSnap.data()?.status).toBe("APROVADO");

    await assertFails(
      updateDoc(doc(alunoDb, "claims", payload.id), {
        status: "PENDENTE",
        distinctiveFeatures: "Tentativa de reabrir claim já aprovada.",
      })
    );
  });

  // =========================================================================
  // CENÁRIOS C-10 A C-13: Restrições de Integridade, Conta e Status de Item
  // =========================================================================

  it("C-10: Criação de claim por usuário com e-mail NÃO verificado (email_verified: false) é barrada (403)", async () => {
    const unverifiedDb = testEnv.authenticatedContext(ALUNO_UID, {
      email: ALUNO_EMAIL,
      email_verified: false,
    }).firestore();

    const payload = getValidClaimPayload(ITEM_ENCONTRADO_ID);
    await assertFails(setDoc(doc(unverifiedDb, "claims", payload.id), payload));
  });

  it("C-11: Criação de claim por conta com perfil de usuário suspenso (status: 'suspended') é barrada (403)", async () => {
    const suspendedDb = testEnv.authenticatedContext(SUSPENDED_UID, {
      email: SUSPENDED_EMAIL,
      email_verified: true,
    }).firestore();

    const payload = getValidClaimPayload(ITEM_ENCONTRADO_ID, SUSPENDED_UID, SUSPENDED_EMAIL);
    await assertFails(setDoc(doc(suspendedDb, "claims", payload.id), payload));
  });

  it("C-12: Criação de claim com injeção de campos administrativos proibidos é barrada individualmente (403)", async () => {
    const alunoDb = testEnv.authenticatedContext(ALUNO_UID, {
      email: ALUNO_EMAIL,
      email_verified: true,
    }).firestore();

    const basePayload = getValidClaimPayload(ITEM_ENCONTRADO_ID);

    // Injeção de reviewedByUserId
    await assertFails(
      setDoc(doc(alunoDb, "claims", basePayload.id), {
        ...basePayload,
        reviewedByUserId: "admin_malicioso",
      })
    );

    // Injeção de reviewedByName
    await assertFails(
      setDoc(doc(alunoDb, "claims", basePayload.id), {
        ...basePayload,
        reviewedByName: "Administrador Forjado",
      })
    );

    // Injeção de reviewedByRole
    await assertFails(
      setDoc(doc(alunoDb, "claims", basePayload.id), {
        ...basePayload,
        reviewedByRole: "ADMIN",
      })
    );

    // Injeção de reviewedAt
    await assertFails(
      setDoc(doc(alunoDb, "claims", basePayload.id), {
        ...basePayload,
        reviewedAt: new Date().toISOString(),
      })
    );

    // Injeção de rejectionReason
    await assertFails(
      setDoc(doc(alunoDb, "claims", basePayload.id), {
        ...basePayload,
        rejectionReason: "Rejeitado indevidamente",
      })
    );

    // Injeção de decisionNotes
    await assertFails(
      setDoc(doc(alunoDb, "claims", basePayload.id), {
        ...basePayload,
        decisionNotes: "Notas de decisão forjadas",
      })
    );

    // Injeção de completedAt
    await assertFails(
      setDoc(doc(alunoDb, "claims", basePayload.id), {
        ...basePayload,
        completedAt: new Date().toISOString(),
      })
    );

    // Injeção de cancelledAt
    await assertFails(
      setDoc(doc(alunoDb, "claims", basePayload.id), {
        ...basePayload,
        cancelledAt: new Date().toISOString(),
      })
    );
  });

  it("C-13: Criação de claim para itens com status 'DEVOLVIDO' (C-13a) e 'ENCERRADO' (C-13b) é barrada (403)", async () => {
    const alunoDb = testEnv.authenticatedContext(ALUNO_UID, {
      email: ALUNO_EMAIL,
      email_verified: true,
    }).firestore();

    // C-13a: Item já com status DEVOLVIDO
    const payloadDevolvido = getValidClaimPayload(ITEM_DEVOLVIDO_ID);
    await assertFails(setDoc(doc(alunoDb, "claims", payloadDevolvido.id), payloadDevolvido));

    // C-13b: Item com status ENCERRADO (destinado)
    const payloadEncerrado = getValidClaimPayload(ITEM_ENCERRADO_ID);
    await assertFails(setDoc(doc(alunoDb, "claims", payloadEncerrado.id), payloadEncerrado));
  });

  // =========================================================================
  // CENÁRIOS C-14 A C-15: Precedência de Intruso vs Root Admin
  // =========================================================================

  it("C-14: Root Admin com perfil Firestore contendo role: 'INTRUSO' (sem claim JWT) mantém privilégios administrativos (200)", async () => {
    // Insere claim prévia para avaliação administrativa
    const claimPayload = getValidClaimPayload(ITEM_ENCONTRADO_ID);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "claims", claimPayload.id), claimPayload);
    });

    // Root Admin autenticado com seu e-mail verificado, sem claim customizada 'role' no JWT
    const rootAdminDb = testEnv.authenticatedContext(ROOT_ADMIN_UID, {
      email: ROOT_ADMIN_EMAIL,
      email_verified: true,
    }).firestore();

    // A regra (isDocIntruso() && !isRootAdmin()) resulta em FALSE, não classificando o Root Admin como intruso
    await assertSucceeds(
      updateDoc(doc(rootAdminDb, "claims", claimPayload.id), {
        status: "APROVADO",
        reviewedByUserId: ROOT_ADMIN_UID,
        reviewedByName: "Super Admin Root",
        reviewedByRole: "ADMIN",
        reviewedAt: new Date().toISOString(),
      })
    );

    const checkSnap = await assertSucceeds(getDoc(doc(rootAdminDb, "claims", claimPayload.id)));
    expect(checkSnap.data()?.status).toBe("APROVADO");
  });

  it("C-15: Token JWT contendo explicitamente a claim customizada role: 'INTRUSO' é barrado mesmo com e-mail de Root Admin (403)", async () => {
    const claimPayload = getValidClaimPayload(ITEM_ENCONTRADO_ID);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "claims", claimPayload.id), claimPayload);
    });

    // Token JWT com injeção explícita de role: 'INTRUSO'
    const intrusoAdminDb = testEnv.authenticatedContext(ROOT_ADMIN_UID, {
      email: ROOT_ADMIN_EMAIL,
      email_verified: true,
      role: "INTRUSO",
    }).firestore();

    // A condição request.auth.token.role == 'INTRUSO' possui precedência absoluta e bloqueia
    await assertFails(
      updateDoc(doc(intrusoAdminDb, "claims", claimPayload.id), {
        status: "APROVADO",
        reviewedByUserId: ROOT_ADMIN_UID,
        reviewedAt: new Date().toISOString(),
      })
    );

    // Confere que a tentativa negada não alterou o estado do documento original (integridade)
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const snap = await getDoc(doc(context.firestore(), "claims", claimPayload.id));
      expect(snap.data()?.status).toBe("PENDENTE");
    });
  });

  // =========================================================================
  // CENÁRIOS C-16 A C-18: Princípio do Menor Privilégio e Isolamento de Consultas
  // =========================================================================

  it("C-16: Usuário com papel ALUNO é impedido de criar registros na coleção restrita /items (403)", async () => {
    const alunoDb = testEnv.authenticatedContext(ALUNO_UID, {
      email: ALUNO_EMAIL,
      email_verified: true,
    }).firestore();

    const novoItemNaoAutorizado = {
      id: "item_forjado_por_aluno",
      title: "Item Não Autorizado",
      category: "Outros",
      status: "ENCONTRADO",
      registeredByUserId: ALUNO_UID,
      createdAt: new Date().toISOString(),
    };

    await assertFails(setDoc(doc(alunoDb, "items", novoItemNaoAutorizado.id), novoItemNaoAutorizado));
  });

  it("C-17: Consulta global sem cláusula de filtro em /claims é barrada para usuário comum (403)", async () => {
    const alunoDb = testEnv.authenticatedContext(ALUNO_UID, {
      email: ALUNO_EMAIL,
      email_verified: true,
    }).firestore();

    // Consulta sem cláusula where("claimerId", "==", ALUNO_UID) viola a regra allow list
    await assertFails(getDocs(collection(alunoDb, "claims")));
  });

  it("C-18: Consulta filtrada por claimerId retorna exclusivamente os próprios registros em base populada com múltiplos usuários", async () => {
    // Semeia múltiplos documentos para múltiplos usuários para evitar aprovação por vacuidade
    const claim1Item1 = getValidClaimPayload(ITEM_ENCONTRADO_ID, ALUNO_UID, ALUNO_EMAIL);
    const claim1Item2 = getValidClaimPayload(ITEM_ENCONTRADO_2_ID, ALUNO_UID, ALUNO_EMAIL);
    const claim2Item1 = getValidClaimPayload(ITEM_ENCONTRADO_ID, ALUNO_2_UID, ALUNO_2_EMAIL);
    const claim2Item2 = getValidClaimPayload(ITEM_ENCONTRADO_2_ID, ALUNO_2_UID, ALUNO_2_EMAIL);

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "claims", claim1Item1.id), claim1Item1);
      await setDoc(doc(db, "claims", claim1Item2.id), claim1Item2);
      await setDoc(doc(db, "claims", claim2Item1.id), claim2Item1);
      await setDoc(doc(db, "claims", claim2Item2.id), claim2Item2);
    });

    const alunoDb = testEnv.authenticatedContext(ALUNO_UID, {
      email: ALUNO_EMAIL,
      email_verified: true,
    }).firestore();

    // Consulta filtrada estritamente pelo UID do solicitante autenticado
    const q = query(collection(alunoDb, "claims"), where("claimerId", "==", ALUNO_UID));
    const querySnapshot = await assertSucceeds(getDocs(q));

    // Validações de completude e integridade
    expect(querySnapshot.size).toBe(2);
    const returnedIds = querySnapshot.docs.map((d) => d.id);

    // Isolamento Positivo: ambos os documentos do ALUNO_UID estão presentes
    expect(returnedIds).toContain(claim1Item1.id);
    expect(returnedIds).toContain(claim1Item2.id);
    querySnapshot.docs.forEach((d) => {
      expect(d.data().claimerId).toBe(ALUNO_UID);
    });

    // Isolamento Negativo: nenhum documento de ALUNO_2_UID vazou na consulta
    expect(returnedIds).not.toContain(claim2Item1.id);
    expect(returnedIds).not.toContain(claim2Item2.id);
  });

  // =========================================================================
  // CENÁRIOS C-19 A C-24: Ciclo de Vida de Claims, Atuação de Servidores e Integridade
  // =========================================================================

  it("C-19: Cancelamento positivo de claim PENDENTE pelo próprio aluno solicitante (200)", async () => {
    const claimPayload = getValidClaimPayload(ITEM_ENCONTRADO_ID);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "claims", claimPayload.id), claimPayload);
    });

    const alunoDb = testEnv.authenticatedContext(ALUNO_UID, {
      email: ALUNO_EMAIL,
      email_verified: true,
    }).firestore();

    const cancelIso = new Date().toISOString();
    await assertSucceeds(
      updateDoc(doc(alunoDb, "claims", claimPayload.id), {
        status: "CANCELADO",
        cancelledAt: cancelIso,
      })
    );

    const checkSnap = await assertSucceeds(getDoc(doc(alunoDb, "claims", claimPayload.id)));
    expect(checkSnap.data()?.status).toBe("CANCELADO");
    expect(checkSnap.data()?.cancelledAt).toBe(cancelIso);
  });

  it("C-20: Bloqueio de cancelamento de claim nos estados APROVADO (C-20a) e CONCLUIDO (C-20b) pelo aluno (403) com integridade dos documentos", async () => {
    const claimAprovada = {
      ...getValidClaimPayload(ITEM_ENCONTRADO_ID),
      id: `claim_${ALUNO_UID}_${ITEM_ENCONTRADO_ID}`,
      status: "APROVADO",
      reviewedByUserId: SERVIDOR_UID,
      reviewedAt: new Date().toISOString(),
    };

    const claimConcluida = {
      ...getValidClaimPayload(ITEM_ENCONTRADO_2_ID),
      id: `claim_${ALUNO_UID}_${ITEM_ENCONTRADO_2_ID}`,
      status: "CONCLUIDO",
      completedAt: new Date().toISOString(),
    };

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "claims", claimAprovada.id), claimAprovada);
      await setDoc(doc(db, "claims", claimConcluida.id), claimConcluida);
    });

    const alunoDb = testEnv.authenticatedContext(ALUNO_UID, {
      email: ALUNO_EMAIL,
      email_verified: true,
    }).firestore();

    // C-20a: Tentativa de cancelamento de claim já APROVADA
    await assertFails(
      updateDoc(doc(alunoDb, "claims", claimAprovada.id), {
        status: "CANCELADO",
        cancelledAt: new Date().toISOString(),
      })
    );

    // C-20b: Tentativa de cancelamento de claim já CONCLUÍDA
    await assertFails(
      updateDoc(doc(alunoDb, "claims", claimConcluida.id), {
        status: "CANCELADO",
        cancelledAt: new Date().toISOString(),
      })
    );

    // Integridade: documentos originais permanecem inalterados
    const checkAprovada = await assertSucceeds(getDoc(doc(alunoDb, "claims", claimAprovada.id)));
    expect(checkAprovada.data()?.status).toBe("APROVADO");

    const checkConcluida = await assertSucceeds(getDoc(doc(alunoDb, "claims", claimConcluida.id)));
    expect(checkConcluida.data()?.status).toBe("CONCLUIDO");
  });

  it("C-21: Aprovação de claim por SERVIDOR institucional regular ativo e verificado (200)", async () => {
    const claimPayload = getValidClaimPayload(ITEM_ENCONTRADO_ID);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "claims", claimPayload.id), claimPayload);
    });

    const servidorDb = testEnv.authenticatedContext(SERVIDOR_UID, {
      email: SERVIDOR_EMAIL,
      email_verified: true,
    }).firestore();

    const reviewIso = new Date().toISOString();
    await assertSucceeds(
      updateDoc(doc(servidorDb, "claims", claimPayload.id), {
        status: "APROVADO",
        reviewedByUserId: SERVIDOR_UID,
        reviewedByName: "Servidor Secretaria",
        reviewedByRole: "SERVIDOR",
        reviewedAt: reviewIso,
        decisionNotes: "Pertence verificado e validado fisicamente no balcão da secretaria.",
      })
    );

    const checkSnap = await assertSucceeds(getDoc(doc(servidorDb, "claims", claimPayload.id)));
    expect(checkSnap.data()?.status).toBe("APROVADO");
    expect(checkSnap.data()?.reviewedByUserId).toBe(SERVIDOR_UID);
    expect(checkSnap.data()?.reviewedByRole).toBe("SERVIDOR");
    expect(checkSnap.data()?.reviewedAt).toBe(reviewIso);
  });

  it("C-22: Rejeição de claim por SERVIDOR institucional com justificativa válida (rejectionReason preenchido) (200)", async () => {
    const claimPayload = getValidClaimPayload(ITEM_ENCONTRADO_ID);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "claims", claimPayload.id), claimPayload);
    });

    const servidorDb = testEnv.authenticatedContext(SERVIDOR_UID, {
      email: SERVIDOR_EMAIL,
      email_verified: true,
    }).firestore();

    const reviewIso = new Date().toISOString();
    const reasonText = "As marcas declaradas (adesivo e risco) não foram encontradas no objeto físico arquivado.";

    await assertSucceeds(
      updateDoc(doc(servidorDb, "claims", claimPayload.id), {
        status: "REJEITADO",
        reviewedByUserId: SERVIDOR_UID,
        reviewedByName: "Servidor Secretaria",
        reviewedByRole: "SERVIDOR",
        reviewedAt: reviewIso,
        rejectionReason: reasonText,
      })
    );

    const checkSnap = await assertSucceeds(getDoc(doc(servidorDb, "claims", claimPayload.id)));
    expect(checkSnap.data()?.status).toBe("REJEITADO");
    expect(checkSnap.data()?.rejectionReason).toBe(reasonText);
    expect(checkSnap.data()?.reviewedByUserId).toBe(SERVIDOR_UID);
  });

  it("C-23: Bloqueio de rejeição de claim por SERVIDOR sem justificativa obrigatória (rejectionReason ausente ou vazio) (403) com integridade do documento", async () => {
    const claimPayload = getValidClaimPayload(ITEM_ENCONTRADO_ID);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "claims", claimPayload.id), claimPayload);
    });

    const servidorDb = testEnv.authenticatedContext(SERVIDOR_UID, {
      email: SERVIDOR_EMAIL,
      email_verified: true,
    }).firestore();

    // C-23a: Tentativa de rejeição omitindo o campo rejectionReason
    await assertFails(
      updateDoc(doc(servidorDb, "claims", claimPayload.id), {
        status: "REJEITADO",
        reviewedByUserId: SERVIDOR_UID,
        reviewedByName: "Servidor Secretaria",
        reviewedByRole: "SERVIDOR",
        reviewedAt: new Date().toISOString(),
      })
    );

    // C-23b: Tentativa de rejeição com rejectionReason vazio ("")
    await assertFails(
      updateDoc(doc(servidorDb, "claims", claimPayload.id), {
        status: "REJEITADO",
        reviewedByUserId: SERVIDOR_UID,
        reviewedByName: "Servidor Secretaria",
        reviewedByRole: "SERVIDOR",
        reviewedAt: new Date().toISOString(),
        rejectionReason: "",
      })
    );

    // Integridade: O documento permanece PENDENTE
    const checkSnap = await assertSucceeds(getDoc(doc(servidorDb, "claims", claimPayload.id)));
    expect(checkSnap.data()?.status).toBe("PENDENTE");
  });

  it("C-24: Bloqueio de criação de claim para item inexistente no catálogo (403) com verificação de não-criação", async () => {
    const alunoDb = testEnv.authenticatedContext(ALUNO_UID, {
      email: ALUNO_EMAIL,
      email_verified: true,
    }).firestore();

    const phantomItemId = "item_inexistente_99999";
    const phantomPayload = getValidClaimPayload(phantomItemId);

    // Tentativa de criação é barrada pela regra exists(/databases/$(database)/documents/items/$(incoming().itemId))
    await assertFails(setDoc(doc(alunoDb, "claims", phantomPayload.id), phantomPayload));

    // Verificação de não-criação: o documento não existe no banco
    const checkSnap = await assertSucceeds(getDoc(doc(alunoDb, "claims", phantomPayload.id)));
    expect(checkSnap.exists()).toBe(false);
  });

  it("C-25: Bloqueio de usuário autenticado sem documento em /users/{uid} de criar claim (403) e integridade do catálogo", async () => {
    const noDocDb = testEnv.authenticatedContext(NO_DOC_UID, {
      email: NO_DOC_EMAIL,
      email_verified: true,
    }).firestore();

    const claimPayload = getValidClaimPayload(ITEM_ENCONTRADO_ID, NO_DOC_UID, NO_DOC_EMAIL);

    // Bloqueado pois isAccountActive() exige exists(...) do documento do usuário
    await assertFails(setDoc(doc(noDocDb, "claims", claimPayload.id), claimPayload));

    // Verificação de integridade: a claim não foi criada no banco
    const checkSnap = await assertSucceeds(getDoc(doc(noDocDb, "claims", claimPayload.id)));
    expect(checkSnap.exists()).toBe(false);
  });

  it("C-26: Bloqueio de usuário autenticado cujo documento em /users/{uid} não possui o campo 'status' (403)", async () => {
    const noStatusDb = testEnv.authenticatedContext(NO_STATUS_UID, {
      email: NO_STATUS_EMAIL,
      email_verified: true,
    }).firestore();

    const claimPayload = getValidClaimPayload(ITEM_ENCONTRADO_ID, NO_STATUS_UID, NO_STATUS_EMAIL);

    // Bloqueado pois isAccountActive() exige explicitamente a presença e valor válido do campo 'status'
    await assertFails(setDoc(doc(noStatusDb, "claims", claimPayload.id), claimPayload));

    // Verificação de não-criação
    const checkSnap = await assertSucceeds(getDoc(doc(noStatusDb, "claims", claimPayload.id)));
    expect(checkSnap.exists()).toBe(false);
  });

  it("C-27: Bloqueio de usuário com conta suspensa (status: 'suspended') de criar claim (403) e garantia de não-mutação", async () => {
    const suspendedDb = testEnv.authenticatedContext(SUSPENDED_UID, {
      email: SUSPENDED_EMAIL,
      email_verified: true,
    }).firestore();

    const claimPayload = getValidClaimPayload(ITEM_ENCONTRADO_ID, SUSPENDED_UID, SUSPENDED_EMAIL);

    // Bloqueado por isAccountBlocked() e isAccountActive()
    await assertFails(setDoc(doc(suspendedDb, "claims", claimPayload.id), claimPayload));

    // Verificação de integridade: documento de claim não foi persistido
    const checkSnap = await assertSucceeds(getDoc(doc(suspendedDb, "claims", claimPayload.id)));
    expect(checkSnap.exists()).toBe(false);
  });

  it("C-28: Bloqueio de usuário com conta banida (status: 'banned') de criar claim (403) e garantia de não-mutação", async () => {
    const bannedDb = testEnv.authenticatedContext(BANNED_UID, {
      email: BANNED_EMAIL,
      email_verified: true,
    }).firestore();

    const claimPayload = getValidClaimPayload(ITEM_ENCONTRADO_ID, BANNED_UID, BANNED_EMAIL);

    // Bloqueado permanentemente por status == 'banned'
    await assertFails(setDoc(doc(bannedDb, "claims", claimPayload.id), claimPayload));

    // Verificação de não-criação
    const checkSnap = await assertSucceeds(getDoc(doc(bannedDb, "claims", claimPayload.id)));
    expect(checkSnap.exists()).toBe(false);
  });

  it("C-29: Bloqueio de usuário com bloqueio temporário ativo (blockExpiresAt no futuro) de criar claim (403)", async () => {
    const tempBlockedDb = testEnv.authenticatedContext(TEMP_BLOCKED_UID, {
      email: TEMP_BLOCKED_EMAIL,
      email_verified: true,
    }).firestore();

    const claimPayload = getValidClaimPayload(ITEM_ENCONTRADO_ID, TEMP_BLOCKED_UID, TEMP_BLOCKED_EMAIL);

    // Bloqueado temporariamente por isTemporaryBlockActive()
    await assertFails(setDoc(doc(tempBlockedDb, "claims", claimPayload.id), claimPayload));

    // Verificação de não-criação
    const checkSnap = await assertSucceeds(getDoc(doc(tempBlockedDb, "claims", claimPayload.id)));
    expect(checkSnap.exists()).toBe(false);
  });

  it("C-30: Concessão de permissão para usuário com bloqueio temporário expirado (blockExpiresAt no passado e status active) criar claim", async () => {
    const tempExpiredDb = testEnv.authenticatedContext(TEMP_EXPIRED_UID, {
      email: TEMP_EXPIRED_EMAIL,
      email_verified: true,
    }).firestore();

    const claimPayload = getValidClaimPayload(ITEM_ENCONTRADO_ID, TEMP_EXPIRED_UID, TEMP_EXPIRED_EMAIL);

    // Permitido pois isTemporaryBlockActive() expirou e status é active
    await assertSucceeds(setDoc(doc(tempExpiredDb, "claims", claimPayload.id), claimPayload));

    // Verificação de persistência
    const checkSnap = await assertSucceeds(getDoc(doc(tempExpiredDb, "claims", claimPayload.id)));
    expect(checkSnap.exists()).toBe(true);
    expect(checkSnap.data()?.status).toBe("PENDENTE");
  });

  it("C-31: Bloqueio de cancelamento de claim própria PENDENTE por usuário com JWT contendo role: 'INTRUSO' (403) com preservação de integridade", async () => {
    const claimPayload = getValidClaimPayload(ITEM_ENCONTRADO_ID, INTRUDER_UID, INTRUDER_EMAIL);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "claims", claimPayload.id), claimPayload);
    });

    const intruderDb = testEnv.authenticatedContext(INTRUDER_UID, {
      email: INTRUDER_EMAIL,
      email_verified: true,
      role: "INTRUSO",
    }).firestore();

    // Bloqueado pela salvaguarda !isIntruso() na regra allow update de cancelamento
    await assertFails(
      updateDoc(doc(intruderDb, "claims", claimPayload.id), {
        status: "CANCELADO",
        cancelledAt: new Date().toISOString(),
      })
    );

    // Integridade: A claim permanece PENDENTE e intacta
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const snap = await getDoc(doc(context.firestore(), "claims", claimPayload.id));
      expect(snap.data()?.status).toBe("PENDENTE");
      expect(snap.data()?.cancelledAt).toBeUndefined();
    });
  });

  it("C-32: Bloqueio de exclusão de item próprio por usuário com JWT contendo role: 'INTRUSO' (403) com integridade do item preservada", async () => {
    const intruderItemId = "item_cadastrado_por_intruso_previamente";
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "items", intruderItemId), {
        id: intruderItemId,
        title: "Casaco de Lã Azul",
        category: "Roupas & Calçados",
        location: "Ginásio",
        status: "ENCONTRADO",
        registeredByUserId: INTRUDER_UID,
        registeredByRole: "SERVIDOR",
        createdAt: "2026-01-01T10:00:00.000Z",
      });
    });

    const intruderDb = testEnv.authenticatedContext(INTRUDER_UID, {
      email: INTRUDER_EMAIL,
      email_verified: true,
      role: "INTRUSO",
    }).firestore();

    // Bloqueado pela salvaguarda !isIntruso() na regra allow delete de /items/{itemId}
    await assertFails(deleteDoc(doc(intruderDb, "items", intruderItemId)));

    // Integridade: O item continua existindo no banco
    const checkSnap = await assertSucceeds(getDoc(doc(intruderDb, "items", intruderItemId)));
    expect(checkSnap.exists()).toBe(true);
  });

  it("C-33: Permissão para usuário institucional ativo legítimo (ALUNO) cancelar sua própria claim PENDENTE com sucesso", async () => {
    const claimPayload = getValidClaimPayload(ITEM_ENCONTRADO_ID, ALUNO_UID, ALUNO_EMAIL);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "claims", claimPayload.id), claimPayload);
    });

    const alunoDb = testEnv.authenticatedContext(ALUNO_UID, {
      email: ALUNO_EMAIL,
      email_verified: true,
    }).firestore();

    const cancelIso = new Date().toISOString();
    await assertSucceeds(
      updateDoc(doc(alunoDb, "claims", claimPayload.id), {
        status: "CANCELADO",
        cancelledAt: cancelIso,
      })
    );

    const checkSnap = await assertSucceeds(getDoc(doc(alunoDb, "claims", claimPayload.id)));
    expect(checkSnap.data()?.status).toBe("CANCELADO");
    expect(checkSnap.data()?.cancelledAt).toBe(cancelIso);
  });

  it("C-34: Root Admin legítimo preserva permissões administrativas sem depender de status padrão em /users/{uid}", async () => {
    const testItemId = "item_teste_para_exclusao_root";
    const claimPayload = getValidClaimPayload(ITEM_ENCONTRADO_ID, ALUNO_UID, ALUNO_EMAIL);

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "items", testItemId), {
        id: testItemId,
        title: "Guarda-chuva Preto",
        category: "Guarda-chuvas",
        location: "Hall Entrada",
        status: "ENCONTRADO",
        registeredByUserId: SERVIDOR_UID,
        createdAt: "2026-01-02T10:00:00.000Z",
      });
      await setDoc(doc(context.firestore(), "claims", claimPayload.id), claimPayload);
    });

    const rootAdminDb = testEnv.authenticatedContext(ROOT_ADMIN_UID, {
      email: ROOT_ADMIN_EMAIL,
      email_verified: true,
    }).firestore();

    // 1. Exclusão de item por Root Admin (isAdmin() ativo mesmo com documento contendo role: 'INTRUSO' no Firestore)
    await assertSucceeds(deleteDoc(doc(rootAdminDb, "items", testItemId)));

    // 2. Moderação/Aprovação de claim por Root Admin
    await assertSucceeds(
      updateDoc(doc(rootAdminDb, "claims", claimPayload.id), {
        status: "APROVADO",
        reviewedByUserId: ROOT_ADMIN_UID,
        reviewedByName: "Super Admin Root",
        reviewedByRole: "ADMIN",
        reviewedAt: new Date().toISOString(),
      })
    );

    const checkClaim = await assertSucceeds(getDoc(doc(rootAdminDb, "claims", claimPayload.id)));
    expect(checkClaim.data()?.status).toBe("APROVADO");
  });

  // =============================================================================
  // Bateria Complementar SEC-07: Semântica Rigorosa de Bloqueios Temporários (C-35 a C-42)
  // =============================================================================

  it("C-35: Bloqueio quando 'blockExpiresAt' está expirado mas 'suspendedUntil' está futuro (403)", async () => {
    const uid = "aluno_c35_uid";
    const email = "aluno.c35@estudantes.ifpr.edu.br";

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", uid), {
        id: uid,
        email,
        name: "Estudante C-35",
        role: "ALUNO",
        status: "suspended",
        blockExpiresAt: Timestamp.fromDate(new Date(Date.now() - 86400000)), // expirado (24h atrás)
        suspendedUntil: Timestamp.fromDate(new Date(Date.now() + 86400000)), // ativo no futuro (+24h)
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });

    const userDb = testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();
    const payload = getValidClaimPayload(ITEM_ENCONTRADO_ID, uid, email);

    // Bloqueado porque o bloqueio vigente (suspendedUntil) prevalece sobre o expirado
    await assertFails(setDoc(doc(userDb, "claims", payload.id), payload));

    // Integridade documental: a claim não foi persistida
    const checkSnap = await assertSucceeds(getDoc(doc(userDb, "claims", payload.id)));
    expect(checkSnap.exists()).toBe(false);
  });

  it("C-36: Bloqueio quando 'blockExpiresAt' está futuro mas 'suspendedUntil' está expirado (403)", async () => {
    const uid = "aluno_c36_uid";
    const email = "aluno.c36@estudantes.ifpr.edu.br";

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", uid), {
        id: uid,
        email,
        name: "Estudante C-36",
        role: "ALUNO",
        status: "suspended",
        blockExpiresAt: Timestamp.fromDate(new Date(Date.now() + 86400000)), // ativo no futuro (+24h)
        suspendedUntil: Timestamp.fromDate(new Date(Date.now() - 86400000)), // expirado (24h atrás)
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });

    const userDb = testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();
    const payload = getValidClaimPayload(ITEM_ENCONTRADO_ID, uid, email);

    // Bloqueado porque o bloqueio vigente (blockExpiresAt) prevalece sobre o expirado
    await assertFails(setDoc(doc(userDb, "claims", payload.id), payload));

    // Integridade: não gravado
    const checkSnap = await assertSucceeds(getDoc(doc(userDb, "claims", payload.id)));
    expect(checkSnap.exists()).toBe(false);
  });

  it("C-37: Desbloqueio permitido quando AMBOS 'blockExpiresAt' e 'suspendedUntil' estão expirados com status 'suspended' (200)", async () => {
    const uid = "aluno_c37_uid";
    const email = "aluno.c37@estudantes.ifpr.edu.br";

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", uid), {
        id: uid,
        email,
        name: "Estudante C-37",
        role: "ALUNO",
        status: "suspended",
        blockExpiresAt: Timestamp.fromDate(new Date(Date.now() - 86400000)), // expirado
        suspendedUntil: Timestamp.fromDate(new Date(Date.now() - 3600000)),  // expirado
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });

    const userDb = testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();
    const payload = getValidClaimPayload(ITEM_ENCONTRADO_ID, uid, email);

    // Permitido: ambos os prazos expiraram, sem nenhum bloqueio ativo restante
    await assertSucceeds(setDoc(doc(userDb, "claims", payload.id), payload));

    // Integridade: claim persistida com sucesso em PENDENTE
    const checkSnap = await assertSucceeds(getDoc(doc(userDb, "claims", payload.id)));
    expect(checkSnap.exists()).toBe(true);
    expect(checkSnap.data()?.status).toBe("PENDENTE");
  });

  it("C-38: Bloqueio quando somente 'suspendedUntil' está configurado e está no futuro (403)", async () => {
    const uid = "aluno_c38_uid";
    const email = "aluno.c38@estudantes.ifpr.edu.br";

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", uid), {
        id: uid,
        email,
        name: "Estudante C-38",
        role: "ALUNO",
        status: "suspended",
        suspendedUntil: Timestamp.fromDate(new Date(Date.now() + 86400000)), // futuro (+24h)
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });

    const userDb = testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();
    const payload = getValidClaimPayload(ITEM_ENCONTRADO_ID, uid, email);

    // Bloqueado pelo suspendedUntil ativo
    await assertFails(setDoc(doc(userDb, "claims", payload.id), payload));

    // Integridade: não gravado
    const checkSnap = await assertSucceeds(getDoc(doc(userDb, "claims", payload.id)));
    expect(checkSnap.exists()).toBe(false);
  });

  it("C-39: Desbloqueio permitido quando somente 'suspendedUntil' está configurado e está expirado com status 'suspended' (200)", async () => {
    const uid = "aluno_c39_uid";
    const email = "aluno.c39@estudantes.ifpr.edu.br";

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", uid), {
        id: uid,
        email,
        name: "Estudante C-39",
        role: "ALUNO",
        status: "suspended",
        suspendedUntil: Timestamp.fromDate(new Date(Date.now() - 86400000)), // expirado (-24h)
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });

    const userDb = testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();
    const payload = getValidClaimPayload(ITEM_ENCONTRADO_ID, uid, email);

    // Permitido: único prazo de bloqueio expirou
    await assertSucceeds(setDoc(doc(userDb, "claims", payload.id), payload));

    // Integridade: gravado com status PENDENTE
    const checkSnap = await assertSucceeds(getDoc(doc(userDb, "claims", payload.id)));
    expect(checkSnap.exists()).toBe(true);
    expect(checkSnap.data()?.status).toBe("PENDENTE");
  });

  it("C-40: Bloqueio permanente de usuário 'status: banned' mesmo com ambos prazos expirados (403)", async () => {
    const uid = "aluno_c40_uid";
    const email = "aluno.c40@estudantes.ifpr.edu.br";

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", uid), {
        id: uid,
        email,
        name: "Estudante C-40",
        role: "ALUNO",
        status: "banned",
        blockExpiresAt: Timestamp.fromDate(new Date(Date.now() - 86400000)), // expirado
        suspendedUntil: Timestamp.fromDate(new Date(Date.now() - 3600000)),  // expirado
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });

    const userDb = testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();
    const payload = getValidClaimPayload(ITEM_ENCONTRADO_ID, uid, email);

    // Bloqueado permanentemente por status == 'banned'
    await assertFails(setDoc(doc(userDb, "claims", payload.id), payload));

    // Integridade: não persistido
    const checkSnap = await assertSucceeds(getDoc(doc(userDb, "claims", payload.id)));
    expect(checkSnap.exists()).toBe(false);
  });

  it("C-41: Bloqueio de usuário com 'status: suspended' sem campos de expiração (suspensão indefinida) (403)", async () => {
    const uid = "aluno_c41_uid";
    const email = "aluno.c41@estudantes.ifpr.edu.br";

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", uid), {
        id: uid,
        email,
        name: "Estudante C-41",
        role: "ALUNO",
        status: "suspended",
        // Sem blockExpiresAt e sem suspendedUntil
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });

    const userDb = testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();
    const payload = getValidClaimPayload(ITEM_ENCONTRADO_ID, uid, email);

    // Bloqueado: status suspenso sem prazo de expiração válido não pode auto-liberar
    await assertFails(setDoc(doc(userDb, "claims", payload.id), payload));

    // Integridade: não persistido
    const checkSnap = await assertSucceeds(getDoc(doc(userDb, "claims", payload.id)));
    expect(checkSnap.exists()).toBe(false);
  });

  it("C-42: Permissão para usuário com 'status: active' com campos de bloqueio ausentes (200)", async () => {
    const uid = "aluno_c42_uid";
    const email = "aluno.c42@estudantes.ifpr.edu.br";

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", uid), {
        id: uid,
        email,
        name: "Estudante C-42",
        role: "ALUNO",
        status: "active",
        // Nenhum campo de bloqueio
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });

    const userDb = testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();
    const payload = getValidClaimPayload(ITEM_ENCONTRADO_ID, uid, email);

    // Permitido: usuário regular ativo sem nenhum bloqueio
    await assertSucceeds(setDoc(doc(userDb, "claims", payload.id), payload));

    // Integridade: gravado com status PENDENTE
    const checkSnap = await assertSucceeds(getDoc(doc(userDb, "claims", payload.id)));
    expect(checkSnap.exists()).toBe(true);
    expect(checkSnap.data()?.status).toBe("PENDENTE");
  });

  // =============================================================================
  // Bateria Complementar SEC-07: Consistência entre Regras e TypeScript (C-43 a C-47)
  // =============================================================================

  it("C-43: Bloqueio quando 'blockExpiresAt' está expirado mas 'suspendedUntil' contém valor inválido (403)", async () => {
    const uid = "aluno_c43_uid";
    const email = "aluno.c43@estudantes.ifpr.edu.br";

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", uid), {
        id: uid,
        email,
        name: "Estudante C-43",
        role: "ALUNO",
        status: "suspended",
        blockExpiresAt: Timestamp.fromDate(new Date(Date.now() - 86400000)), // expirado
        suspendedUntil: "invalid-string-corrupt", // presente com valor inválido (não é timestamp)
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });

    const userDb = testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();
    const payload = getValidClaimPayload(ITEM_ENCONTRADO_ID, uid, email);

    // Bloqueado porque campo inválido não pode ser interpretado como expirado
    await assertFails(setDoc(doc(userDb, "claims", payload.id), payload));

    // Integridade documental: a claim não foi persistida
    const checkSnap = await assertSucceeds(getDoc(doc(userDb, "claims", payload.id)));
    expect(checkSnap.exists()).toBe(false);
  });

  it("C-44: Bloqueio quando 'suspendedUntil' está expirado mas 'blockExpiresAt' contém valor inválido (403)", async () => {
    const uid = "aluno_c44_uid";
    const email = "aluno.c44@estudantes.ifpr.edu.br";

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", uid), {
        id: uid,
        email,
        name: "Estudante C-44",
        role: "ALUNO",
        status: "suspended",
        suspendedUntil: Timestamp.fromDate(new Date(Date.now() - 86400000)), // expirado
        blockExpiresAt: 123456789, // presente com valor inválido (não é timestamp)
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });

    const userDb = testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();
    const payload = getValidClaimPayload(ITEM_ENCONTRADO_ID, uid, email);

    // Bloqueado porque o tipo inválido invalida a liberação automática
    await assertFails(setDoc(doc(userDb, "claims", payload.id), payload));

    // Integridade: não gravado
    const checkSnap = await assertSucceeds(getDoc(doc(userDb, "claims", payload.id)));
    expect(checkSnap.exists()).toBe(false);
  });

  it("C-45: Bloqueio de conta suspensa quando ambos os campos possuem valores inválidos (403)", async () => {
    const uid = "aluno_c45_uid";
    const email = "aluno.c45@estudantes.ifpr.edu.br";

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", uid), {
        id: uid,
        email,
        name: "Estudante C-45",
        role: "ALUNO",
        status: "suspended",
        suspendedUntil: "corrupt-val-1",
        blockExpiresAt: "corrupt-val-2",
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });

    const userDb = testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();
    const payload = getValidClaimPayload(ITEM_ENCONTRADO_ID, uid, email);

    // Bloqueado: nenhum prazo válido existe
    await assertFails(setDoc(doc(userDb, "claims", payload.id), payload));

    // Integridade: não gravado
    const checkSnap = await assertSucceeds(getDoc(doc(userDb, "claims", payload.id)));
    expect(checkSnap.exists()).toBe(false);
  });

  it("C-46: Bloqueio de conta ativa quando 'blockExpiresAt' está no futuro (403)", async () => {
    const uid = "aluno_c46_uid";
    const email = "aluno.c46@estudantes.ifpr.edu.br";

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", uid), {
        id: uid,
        email,
        name: "Estudante C-46",
        role: "ALUNO",
        status: "active",
        blockExpiresAt: Timestamp.fromDate(new Date(Date.now() + 86400000)), // futuro (+24h)
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });

    const userDb = testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();
    const payload = getValidClaimPayload(ITEM_ENCONTRADO_ID, uid, email);

    // Bloqueado pelo blockExpiresAt temporário vigente
    await assertFails(setDoc(doc(userDb, "claims", payload.id), payload));

    // Integridade: não gravado
    const checkSnap = await assertSucceeds(getDoc(doc(userDb, "claims", payload.id)));
    expect(checkSnap.exists()).toBe(false);
  });

  it("C-47: Bloqueio de conta ativa quando 'suspendedUntil' está no futuro (403)", async () => {
    const uid = "aluno_c47_uid";
    const email = "aluno.c47@estudantes.ifpr.edu.br";

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", uid), {
        id: uid,
        email,
        name: "Estudante C-47",
        role: "ALUNO",
        status: "active",
        suspendedUntil: Timestamp.fromDate(new Date(Date.now() + 86400000)), // futuro (+24h)
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });

    const userDb = testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();
    const payload = getValidClaimPayload(ITEM_ENCONTRADO_ID, uid, email);

    // Bloqueado pelo suspendedUntil temporário vigente
    await assertFails(setDoc(doc(userDb, "claims", payload.id), payload));

    // Integridade: não gravado
    const checkSnap = await assertSucceeds(getDoc(doc(userDb, "claims", payload.id)));
    expect(checkSnap.exists()).toBe(false);
  });

  it("C-48: Bloqueio quando 'blockExpiresAt' está expirado mas 'suspendedUntil' está presente com valor null (403)", async () => {
    const uid = "aluno_c48_uid";
    const email = "aluno.c48@estudantes.ifpr.edu.br";

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", uid), {
        id: uid,
        email,
        name: "Estudante C-48",
        role: "ALUNO",
        status: "suspended",
        blockExpiresAt: Timestamp.fromDate(new Date(Date.now() - 86400000)), // expirado
        suspendedUntil: null, // presente com valor null (null não é timestamp)
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });

    const userDb = testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();
    const payload = getValidClaimPayload(ITEM_ENCONTRADO_ID, uid, email);

    // Bloqueado: null existente não é timestamp, impedindo liberação automática
    await assertFails(setDoc(doc(userDb, "claims", payload.id), payload));

    // Integridade: claim não foi persistida
    const checkSnap = await assertSucceeds(getDoc(doc(userDb, "claims", payload.id)));
    expect(checkSnap.exists()).toBe(false);
  });

  it("C-49: Bloqueio quando 'blockExpiresAt' está expirado mas 'suspendedUntil' está presente com string vazia (403)", async () => {
    const uid = "aluno_c49_uid";
    const email = "aluno.c49@estudantes.ifpr.edu.br";

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", uid), {
        id: uid,
        email,
        name: "Estudante C-49",
        role: "ALUNO",
        status: "suspended",
        blockExpiresAt: Timestamp.fromDate(new Date(Date.now() - 86400000)), // expirado
        suspendedUntil: "", // presente com string vazia (não é timestamp)
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });

    const userDb = testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();
    const payload = getValidClaimPayload(ITEM_ENCONTRADO_ID, uid, email);

    // Bloqueado: string vazia não é timestamp
    await assertFails(setDoc(doc(userDb, "claims", payload.id), payload));

    // Integridade: não gravado
    const checkSnap = await assertSucceeds(getDoc(doc(userDb, "claims", payload.id)));
    expect(checkSnap.exists()).toBe(false);
  });

  it("C-50: Bloqueio quando 'suspendedUntil' está expirado mas 'blockExpiresAt' está presente com valor null (403)", async () => {
    const uid = "aluno_c50_uid";
    const email = "aluno.c50@estudantes.ifpr.edu.br";

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", uid), {
        id: uid,
        email,
        name: "Estudante C-50",
        role: "ALUNO",
        status: "suspended",
        suspendedUntil: Timestamp.fromDate(new Date(Date.now() - 86400000)), // expirado
        blockExpiresAt: null, // presente com valor null (não é timestamp)
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });

    const userDb = testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();
    const payload = getValidClaimPayload(ITEM_ENCONTRADO_ID, uid, email);

    // Bloqueado: null não é timestamp
    await assertFails(setDoc(doc(userDb, "claims", payload.id), payload));

    // Integridade: não gravado
    const checkSnap = await assertSucceeds(getDoc(doc(userDb, "claims", payload.id)));
    expect(checkSnap.exists()).toBe(false);
  });

  it("C-51: Bloqueio quando 'suspendedUntil' está expirado mas 'blockExpiresAt' está presente com string vazia (403)", async () => {
    const uid = "aluno_c51_uid";
    const email = "aluno.c51@estudantes.ifpr.edu.br";

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", uid), {
        id: uid,
        email,
        name: "Estudante C-51",
        role: "ALUNO",
        status: "suspended",
        suspendedUntil: Timestamp.fromDate(new Date(Date.now() - 86400000)), // expirado
        blockExpiresAt: "   ", // presente com string de espaços em branco (não é timestamp)
        approvalStatus: "APROVADO",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });

    const userDb = testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();
    const payload = getValidClaimPayload(ITEM_ENCONTRADO_ID, uid, email);

    // Bloqueado: string de espaços não é timestamp
    await assertFails(setDoc(doc(userDb, "claims", payload.id), payload));

    // Integridade: não gravado
    const checkSnap = await assertSucceeds(getDoc(doc(userDb, "claims", payload.id)));
    expect(checkSnap.exists()).toBe(false);
  });
});

describe("LOCALIZA+ v1.10.9 — Auditoria Unitária TypeScript: Paridade de resolveAccountStatus com Firestore Rules", () => {
  it("UT-01: Paridade com C-43 (suspended + blockExpiresAt expirado + suspendedUntil inválido -> suspended)", () => {
    const res = resolveAccountStatus({
      status: "suspended",
      blockExpiresAt: new Date(Date.now() - 86400000).toISOString(),
      suspendedUntil: "invalid-string-corrupt",
    });
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
  });

  it("UT-02: Paridade com C-44 (suspended + suspendedUntil expirado + blockExpiresAt inválido -> suspended)", () => {
    const res = resolveAccountStatus({
      status: "suspended",
      suspendedUntil: new Date(Date.now() - 86400000).toISOString(),
      blockExpiresAt: "invalid-corrupt-data",
    });
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
  });

  it("UT-03: Paridade com C-45 (suspended + ambos inválidos -> suspended)", () => {
    const res = resolveAccountStatus({
      status: "suspended",
      suspendedUntil: "invalid-1",
      blockExpiresAt: "invalid-2",
    });
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
  });

  it("UT-04: Paridade com C-46 (active + blockExpiresAt futuro -> suspended/bloqueado)", () => {
    const res = resolveAccountStatus({
      status: "active",
      blockExpiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
  });

  it("UT-05: Paridade com C-47 (active + suspendedUntil futuro -> suspended/bloqueado)", () => {
    const res = resolveAccountStatus({
      status: "active",
      suspendedUntil: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
  });

  it("UT-06: Paridade com C-37 (suspended + ambos expirados -> active/liberado)", () => {
    const res = resolveAccountStatus({
      status: "suspended",
      blockExpiresAt: new Date(Date.now() - 86400000).toISOString(),
      suspendedUntil: new Date(Date.now() - 3600000).toISOString(),
    });
    expect(res.status).toBe("active");
    expect(res.isExpiredSuspension).toBe(true);
    expect(res.suspendedUntil).toBeUndefined();
  });

  it("UT-07: Paridade com C-40 (banned + ambos expirados -> banned)", () => {
    const res = resolveAccountStatus({
      status: "banned",
      blockExpiresAt: new Date(Date.now() - 86400000).toISOString(),
      suspendedUntil: new Date(Date.now() - 3600000).toISOString(),
    });
    expect(res.status).toBe("banned");
    expect(res.isExpiredSuspension).toBe(false);
  });

  it("UT-08: Paridade com C-41 (suspended sem prazos -> suspended)", () => {
    const res = resolveAccountStatus({
      status: "suspended",
    });
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
  });

  it("UT-09: Paridade com C-42 (active sem prazos -> active)", () => {
    const res = resolveAccountStatus({
      status: "active",
    });
    expect(res.status).toBe("active");
    expect(res.isExpiredSuspension).toBe(false);
  });

  it("UT-10: Paridade com C-48 (suspended + blockExpiresAt expirado + suspendedUntil: null -> suspended)", () => {
    const res = resolveAccountStatus({
      status: "suspended",
      blockExpiresAt: new Date(Date.now() - 86400000).toISOString(),
      suspendedUntil: null,
    });
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
  });

  it("UT-11: Paridade com C-49 (suspended + blockExpiresAt expirado + suspendedUntil: '' -> suspended)", () => {
    const res = resolveAccountStatus({
      status: "suspended",
      blockExpiresAt: new Date(Date.now() - 86400000).toISOString(),
      suspendedUntil: "",
    });
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
  });

  it("UT-12: Paridade com C-50 (suspended + suspendedUntil expirado + blockExpiresAt: null -> suspended)", () => {
    const res = resolveAccountStatus({
      status: "suspended",
      suspendedUntil: new Date(Date.now() - 86400000).toISOString(),
      blockExpiresAt: null,
    });
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
  });

  it("UT-13: Paridade com C-51 (suspended + suspendedUntil expirado + blockExpiresAt: '   ' -> suspended)", () => {
    const res = resolveAccountStatus({
      status: "suspended",
      suspendedUntil: new Date(Date.now() - 86400000).toISOString(),
      blockExpiresAt: "   ",
    });
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
  });

  it("UT-14: evaluateDeadlineField para campo efetivamente ausente (propriedade não existe no objeto)", () => {
    const user = { id: "u1", status: "active" as const };
    const evalResult = evaluateDeadlineField(user, "suspendedUntil");
    expect(evalResult.isPresent).toBe(false);
    expect(evalResult.isValid).toBe(false);
    expect(evalResult.isInvalid).toBe(false);
    expect(evalResult.isActive).toBe(false);
    expect(evalResult.isExpired).toBe(false);
  });

  it("UT-15: evaluateDeadlineField para campo presente com undefined explícito (semântica Firestore)", () => {
    const user = { id: "u1", status: "active" as const, suspendedUntil: undefined };
    const evalResult = evaluateDeadlineField(user, "suspendedUntil");
    expect(evalResult.isPresent).toBe(false);
    expect(evalResult.isValid).toBe(false);
    expect(evalResult.isInvalid).toBe(false);
  });

  it("UT-16: evaluateDeadlineField para campo presente com null (null_type no Firestore)", () => {
    const user = { id: "u1", status: "suspended" as const, suspendedUntil: null };
    const evalResult = evaluateDeadlineField(user, "suspendedUntil");
    expect(evalResult.isPresent).toBe(true);
    expect(evalResult.isValid).toBe(false);
    expect(evalResult.isInvalid).toBe(true);
  });

  it("UT-17: evaluateDeadlineField para campo presente com string vazia ou espaços", () => {
    const user = { id: "u1", status: "suspended" as const, suspendedUntil: "   " };
    const evalResult = evaluateDeadlineField(user, "suspendedUntil");
    expect(evalResult.isPresent).toBe(true);
    expect(evalResult.isValid).toBe(false);
    expect(evalResult.isInvalid).toBe(true);
  });

  it("UT-18: evaluateDeadlineField para campo presente com número (int/float não é timestamp)", () => {
    const user = { id: "u1", status: "suspended" as const, suspendedUntil: 1729000000000 as any };
    const evalResult = evaluateDeadlineField(user, "suspendedUntil");
    expect(evalResult.isPresent).toBe(true);
    expect(evalResult.isValid).toBe(false);
    expect(evalResult.isInvalid).toBe(true);
  });

  it("UT-19: evaluateDeadlineField para campo com Timestamp nativo expirado", () => {
    const pastTimestamp = Timestamp.fromDate(new Date(Date.now() - 86400000));
    const user = { id: "u1", status: "suspended" as const, suspendedUntil: pastTimestamp };
    const evalResult = evaluateDeadlineField(user, "suspendedUntil");
    expect(evalResult.isPresent).toBe(true);
    expect(evalResult.isValid).toBe(true);
    expect(evalResult.isInvalid).toBe(false);
    expect(evalResult.isExpired).toBe(true);
    expect(evalResult.isActive).toBe(false);
  });

  it("UT-20: evaluateDeadlineField para campo com Timestamp nativo futuro", () => {
    const futureTimestamp = Timestamp.fromDate(new Date(Date.now() + 86400000));
    const user = { id: "u1", status: "suspended" as const, suspendedUntil: futureTimestamp };
    const evalResult = evaluateDeadlineField(user, "suspendedUntil");
    expect(evalResult.isPresent).toBe(true);
    expect(evalResult.isValid).toBe(true);
    expect(evalResult.isInvalid).toBe(false);
    expect(evalResult.isActive).toBe(true);
    expect(evalResult.isExpired).toBe(false);
  });

  it("UT-21: usuário sem propriedade 'status' (não presume active, retorna suspended e isUserAccountActive === false)", () => {
    const user = { id: "u-no-status", role: "ALUNO" as const };
    const res = resolveAccountStatus(user);
    expect(res.status).not.toBe("active");
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
    expect(isUserAccountActive(user)).toBe(false);
    expect(isAccountBlocked(user)).toBe(true);
  });

  it("UT-21b: usuário nulo ou indefinido (não presume active, retorna suspended e isUserAccountActive === false)", () => {
    const resNull = resolveAccountStatus(null);
    expect(resNull.status).toBe("suspended");
    expect(isUserAccountActive(null)).toBe(false);
    expect(isAccountBlocked(null)).toBe(true);

    const resUndef = resolveAccountStatus(undefined);
    expect(resUndef.status).toBe("suspended");
    expect(isUserAccountActive(undefined)).toBe(false);
    expect(isAccountBlocked(undefined)).toBe(true);
  });

  it("UT-22: usuário com 'status: undefined' (não presume active, retorna suspended e isUserAccountActive === false)", () => {
    const user = { id: "u-undef-status", role: "ALUNO" as const, status: undefined };
    const res = resolveAccountStatus(user);
    expect(res.status).not.toBe("active");
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
    expect(isUserAccountActive(user)).toBe(false);
    expect(isAccountBlocked(user)).toBe(true);
  });

  it("UT-23: usuário com 'status: null' (não presume active, retorna suspended e isUserAccountActive === false)", () => {
    const user = { id: "u-null-status", role: "ALUNO" as const, status: null as any };
    const res = resolveAccountStatus(user);
    expect(res.status).not.toBe("active");
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
    expect(isUserAccountActive(user)).toBe(false);
    expect(isAccountBlocked(user)).toBe(true);
  });

  it("UT-24: usuário com 'status: \"\"' (não presume active, retorna suspended e isUserAccountActive === false)", () => {
    const user = { id: "u-empty-status", role: "ALUNO" as const, status: "" as any };
    const res = resolveAccountStatus(user);
    expect(res.status).not.toBe("active");
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
    expect(isUserAccountActive(user)).toBe(false);
    expect(isAccountBlocked(user)).toBe(true);
  });

  it("UT-25: usuário com 'status' contendo apenas espaços (não presume active, retorna suspended e isUserAccountActive === false)", () => {
    const user = { id: "u-spaces-status", role: "ALUNO" as const, status: "   " as any };
    const res = resolveAccountStatus(user);
    expect(res.status).not.toBe("active");
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
    expect(isUserAccountActive(user)).toBe(false);
    expect(isAccountBlocked(user)).toBe(true);
  });

  it("UT-26: usuário com status desconhecido (não presume active, retorna suspended e isUserAccountActive === false)", () => {
    const user = { id: "u-unknown-status", role: "ALUNO" as const, status: "PENDING_AUDIT" as any };
    const res = resolveAccountStatus(user);
    expect(res.status).not.toBe("active");
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
    expect(isUserAccountActive(user)).toBe(false);
    expect(isAccountBlocked(user)).toBe(true);
  });

  it("UT-27: usuário com 'status: \"active\"' continua ativo (sem bloqueios temporais)", () => {
    const user = { id: "u-active", role: "ALUNO" as const, status: "active" as const };
    const res = resolveAccountStatus(user);
    expect(res.status).toBe("active");
    expect(res.isExpiredSuspension).toBe(false);
    expect(isUserAccountActive(user)).toBe(true);
    expect(isAccountBlocked(user)).toBe(false);
  });

  it("UT-28: usuário com 'status: \"suspended\"' continua sujeito à lógica temporal", () => {
    // 28.1 - Prazo futuro: permanece suspenso
    const userFuturo = {
      id: "u-susp-future",
      role: "ALUNO" as const,
      status: "suspended" as const,
      suspendedUntil: new Date(Date.now() + 86400000).toISOString(),
    };
    const resFuturo = resolveAccountStatus(userFuturo);
    expect(resFuturo.status).toBe("suspended");
    expect(resFuturo.isExpiredSuspension).toBe(false);
    expect(isUserAccountActive(userFuturo)).toBe(false);
    expect(isAccountBlocked(userFuturo)).toBe(true);

    // 28.2 - Prazo expirado válido: auto-liberação para active
    const userExpirado = {
      id: "u-susp-past",
      role: "ALUNO" as const,
      status: "suspended" as const,
      suspendedUntil: new Date(Date.now() - 86400000).toISOString(),
    };
    const resExpirado = resolveAccountStatus(userExpirado);
    expect(resExpirado.status).toBe("active");
    expect(resExpirado.isExpiredSuspension).toBe(true);
    expect(isUserAccountActive(userExpirado)).toBe(true);
    expect(isAccountBlocked(userExpirado)).toBe(false);
  });

  it("UT-29: usuário com 'status: \"banned\"' continua bloqueado permanentemente", () => {
    const user = {
      id: "u-banned",
      role: "ALUNO" as const,
      status: "banned" as const,
      statusReason: "Infração grave às normas institucionais",
      // Mesmo com data expirada, banimento permanente se mantém
      suspendedUntil: new Date(Date.now() - 86400000).toISOString(),
    };
    const res = resolveAccountStatus(user);
    expect(res.status).toBe("banned");
    expect(res.isExpiredSuspension).toBe(false);
    expect(res.statusReason).toBe("Infração grave às normas institucionais");
    expect(isUserAccountActive(user)).toBe(false);
    expect(isAccountBlocked(user)).toBe(true);
  });
});

