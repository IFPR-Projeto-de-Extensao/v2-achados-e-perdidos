import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  deleteField,
  query,
  where,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import fs from "fs";
import path from "path";
import { buildItemRegistrationWritePlan } from "./itemRegistrationPipeline";
import { buildUserStatusTransitionData } from "../context/AppContext";

const isEmulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const ETAPA33_RULES_PATH =
  process.env.ETAPA33_RULES_PATH ||
  "scripts/audit/candidates/etapa33-reconstrucao/firestore.rules";

const ROOT_UID = "hCG5mDgK1fRaTojULzlM7dXvb7n2";
const ROOT_EMAIL = "paulocauan39@gmail.com";
const EXPECTED_PROJECT_ID = "gen-lang-client-0490390966";
const EXPECTED_DATABASE_ID =
  "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1";

let testEnv: RulesTestEnvironment | null = null;

async function seedDoc(collectionName: string, docId: string, data: Record<string, any>) {
  await testEnv!.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), collectionName, docId), data);
  });
}

async function seedUser(uid: string, data: Record<string, any>) {
  await seedDoc("users", uid, { id: uid, ...data });
}

async function assertNoPartialDocs(itemId: string, historyId: string) {
  await testEnv!.withSecurityRulesDisabled(async (ctx) => {
    const adb = ctx.firestore();
    expect((await getDoc(doc(adb, "items", itemId))).exists()).toBe(false);
    expect((await getDoc(doc(adb, "item_history", historyId))).exists()).toBe(false);
    expect((await getDoc(doc(adb, "item_private", itemId))).exists()).toBe(false);
  });
}

describe.skipIf(!isEmulatorAvailable)(
  "LOCALIZA+ v1.10.13 — Etapa 33: Homologação Integral da Nova Arquitetura Firestore Rules (20 Domínios)",
  () => {
    beforeAll(async () => {
      const rulesPath = path.resolve(process.cwd(), ETAPA33_RULES_PATH);
      const rules = fs.readFileSync(rulesPath, "utf-8");
      const [host = "127.0.0.1", rawPort = "8080"] = (
        process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080"
      ).split(":");

      testEnv = await initializeTestEnvironment({
        projectId: "localiza-etapa33-homolog",
        firestore: {
          rules,
          host,
          port: Number(rawPort) || 8080,
        },
      });
    });

    afterAll(async () => {
      if (testEnv) await testEnv.cleanup();
    });

    beforeEach(async () => {
      if (testEnv) await testEnv.clearFirestore();
    });

    // =========================================================================
    // 1. AUTENTICAÇÃO & 2. IDENTIDADE (incl. Root Admin UID Pinning)
    // =========================================================================
    it("01. Autenticação e Identidade: não autenticado lê apenas catálogo limpo e /system; email_verified=false e falso Root Admin (UID incorreto) são bloqueados", async () => {
      await seedDoc("items", "item-pub-1", {
        id: "item-pub-1",
        title: "Caderno IFPR",
        description: "Capa azul",
        location: "Biblioteca",
        status: "ENCONTRADO",
        registeredByUserId: "serv-1",
        registeredByRole: "SERVIDOR",
      });
      await seedDoc("items", "item-pii-1", {
        id: "item-pii-1",
        title: "Celular Devolvido",
        status: "DEVOLVIDO",
        recipientEmail: "sigilo@estudantes.ifpr.edu.br",
      });
      await seedDoc("system", "config", { maintenanceMode: false });

      const unauthDb = testEnv!.unauthenticatedContext().firestore();
      await assertSucceeds(getDoc(doc(unauthDb, "items", "item-pub-1")));
      await assertFails(getDoc(doc(unauthDb, "items", "item-pii-1")));
      await assertSucceeds(getDoc(doc(unauthDb, "system", "config")));
      await assertFails(setDoc(doc(unauthDb, "system", "config"), { maintenanceMode: true }));
      await assertFails(getDoc(doc(unauthDb, "users", "serv-1")));

      // Falso Root Admin: mesmo e-mail, UID diferente -> NEGADO
      const fakeRootDb = testEnv!
        .authenticatedContext("uid-impostor-999", {
          email: ROOT_EMAIL,
          email_verified: true,
        })
        .firestore();
      await assertFails(setDoc(doc(fakeRootDb, "system", "config"), { maintenanceMode: true }));
      await assertFails(getDoc(doc(fakeRootDb, "users", "serv-1")));

      // Root Admin real com email_verified=false -> NEGADO
      const unverifiedRootDb = testEnv!
        .authenticatedContext(ROOT_UID, {
          email: ROOT_EMAIL,
          email_verified: false,
        })
        .firestore();
      await assertFails(setDoc(doc(unverifiedRootDb, "system", "config"), { maintenanceMode: true }));
    });

    // =========================================================================
    // 3. ATRIBUIÇÃO ADMINISTRATIVA & GMAIL (/role_assignments + precedência)
    // =========================================================================
    it("02. Atribuição Administrativa e Gmail: /role_assignments somente leitura para titular/ADMIN (escrita bloqueada) e Gmail SERVIDOR aprovado tem precedência sobre domínio", async () => {
      await seedUser("gmail-serv-1", {
        email: "equipe.teste@gmail.com",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
        roleAssignedBy: ROOT_EMAIL,
        roleAssignedByName: "Paulo Cauan",
        roleAssignedAt: "2026-11-20T10:00:00.000Z",
        roleAssignmentActive: true,
      });
      await seedDoc("role_assignments", "gmail-serv-1", {
        targetUserId: "gmail-serv-1",
        targetEmail: "equipe.teste@gmail.com",
        assignedRole: "SERVIDOR",
        approvalStatus: "APROVADO",
        active: true,
      });
      await seedUser("gmail-intruso-1", {
        email: "visitante.externo@gmail.com",
        role: "INTRUSO",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
      });

      const gmailServDb = testEnv!
        .authenticatedContext("gmail-serv-1", {
          email: "equipe.teste@gmail.com",
          email_verified: true,
          role: "INTRUSO", // claim antiga/obsoleta não pode rebaixar atribuição válida
        })
        .firestore();
      const gmailIntrusoDb = testEnv!
        .authenticatedContext("gmail-intruso-1", {
          email: "visitante.externo@gmail.com",
          email_verified: true,
        })
        .firestore();
      const rootDb = testEnv!
        .authenticatedContext(ROOT_UID, { email: ROOT_EMAIL, email_verified: true })
        .firestore();

      // Leitura de role_assignments: próprio titular e ADMIN leem; terceiro é negado; escrita sempre negada (inclusive Root)
      await assertSucceeds(getDoc(doc(gmailServDb, "role_assignments", "gmail-serv-1")));
      await assertFails(getDocs(collection(gmailServDb, "role_assignments")));
      await assertFails(getDoc(doc(gmailIntrusoDb, "role_assignments", "gmail-serv-1")));
      await assertSucceeds(getDocs(collection(rootDb, "role_assignments")));
      await assertFails(
        setDoc(doc(rootDb, "role_assignments", "gmail-intruso-1"), {
          assignedRole: "ADMIN",
          active: true,
        })
      );
      await assertFails(deleteDoc(doc(rootDb, "role_assignments", "gmail-serv-1")));
    });

    // =========================================================================
    // 4. CARGOS, 5. APROVAÇÃO, 9. CADASTRO DE OBJETOS & 17. LOTE ATÔMICO (8 PERFIS)
    // =========================================================================
    it("03. Cadastro Atômico de Objetos (Lote /items + /item_history + /item_private): valida os 8 perfis, com e sem dados privados, opcionais e zero gravações parciais", async () => {
      await seedUser("admin-inst", {
        email: "gestor@ifpr.edu.br",
        role: "ADMIN",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
      });
      await seedUser("serv-aprovado", {
        email: "tae@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
      });
      await seedUser("serv-pendente", {
        email: "pendente@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "PENDENTE",
        status: "active",
        active: true,
      });
      await seedUser("aluno-inst", {
        email: "estudante@estudantes.ifpr.edu.br",
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
      });
      await seedUser("intruso-1", {
        email: "externo@outlook.com",
        role: "INTRUSO",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
      });
      await seedUser("gmail-serv-aprov", {
        email: "colaborador.ifpr@gmail.com",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
        roleAssignedBy: ROOT_EMAIL,
      });
      await seedUser("gmail-sem-atrib", {
        email: "semcargo@gmail.com",
        role: "INTRUSO",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
      });

      const runAtomicPlan = async (
        db: any,
        uid: string,
        role: "ADMIN" | "SERVIDOR",
        itemId: string,
        opts: { withPrivate: boolean; withOptionals: boolean }
      ) => {
        const plan = buildItemRegistrationWritePlan({
          item: {
            id: itemId,
            title: "Mochila Escolar",
            category: "MOCHILAS",
            type: "ENCONTRADO",
            status: "ENCONTRADO",
            description: "Mochila encontrada no bloco acadêmico.",
            location: "Bloco B - Sala 12",
            date: "2026-11-20",
            ...(opts.withOptionals
              ? { color: "Preta", brand: "Dell", contactInfo: "SEBAC - Ramal 123" }
              : {}),
            ...(opts.withPrivate
              ? {
                  secretVerificationHint: "Possui chaveiro vermelho interno",
                  secretVerificationKey: "CHAVE-7741",
                }
              : {}),
            createdAt: "2026-11-20T12:00:00.000Z",
          },
          authUid: uid,
          actorName: "Operador Teste",
          effectiveRole: role,
        });
        const batch = writeBatch(db);
        batch.set(doc(db, "items", plan.itemId), plan.itemPayload);
        batch.set(doc(db, "item_history", plan.historyEntryId), plan.historyPayload);
        if (plan.privatePayload) {
          batch.set(doc(db, "item_private", plan.itemId), plan.privatePayload);
        }
        return { plan, promise: batch.commit() };
      };

      // 1. ADMIN (com dados privados e opcionais) -> PERMITIDO
      const adminDb = testEnv!
        .authenticatedContext("admin-inst", { email: "gestor@ifpr.edu.br", email_verified: true })
        .firestore();
      const rAdmin = await runAtomicPlan(adminDb, "admin-inst", "ADMIN", "e33-admin-priv", {
        withPrivate: true,
        withOptionals: true,
      });
      await assertSucceeds(rAdmin.promise);
      await testEnv!.withSecurityRulesDisabled(async (ctx) => {
        expect((await getDoc(doc(ctx.firestore(), "items", "e33-admin-priv"))).exists()).toBe(true);
        expect((await getDoc(doc(ctx.firestore(), "item_history", rAdmin.plan.historyEntryId))).exists()).toBe(true);
        expect((await getDoc(doc(ctx.firestore(), "item_private", "e33-admin-priv"))).exists()).toBe(true);
      });

      // 2. Root Admin (sem dados privados e sem opcionais) -> PERMITIDO
      const rootDb = testEnv!
        .authenticatedContext(ROOT_UID, { email: ROOT_EMAIL, email_verified: true })
        .firestore();
      const rRoot = await runAtomicPlan(rootDb, ROOT_UID, "ADMIN", "e33-root-nopriv", {
        withPrivate: false,
        withOptionals: false,
      });
      await assertSucceeds(rRoot.promise);

      // 3. SERVIDOR institucional aprovado -> PERMITIDO (com e sem privados)
      const servDb = testEnv!
        .authenticatedContext("serv-aprovado", { email: "tae@ifpr.edu.br", email_verified: true })
        .firestore();
      const rServ = await runAtomicPlan(servDb, "serv-aprovado", "SERVIDOR", "e33-serv-priv", {
        withPrivate: true,
        withOptionals: true,
      });
      await assertSucceeds(rServ.promise);

      // 4. Gmail com atribuição válida de SERVIDOR aprovado -> PERMITIDO
      const gmailServDb = testEnv!
        .authenticatedContext("gmail-serv-aprov", {
          email: "colaborador.ifpr@gmail.com",
          email_verified: true,
        })
        .firestore();
      const rGmailServ = await runAtomicPlan(
        gmailServDb,
        "gmail-serv-aprov",
        "SERVIDOR",
        "e33-gmail-serv",
        { withPrivate: true, withOptionals: false }
      );
      await assertSucceeds(rGmailServ.promise);

      // 5. SERVIDOR pendente -> NEGADO sem gravação parcial
      const servPendDb = testEnv!
        .authenticatedContext("serv-pendente", {
          email: "pendente@ifpr.edu.br",
          email_verified: true,
        })
        .firestore();
      const rPend = await runAtomicPlan(servPendDb, "serv-pendente", "SERVIDOR", "e33-deny-pend", {
        withPrivate: true,
        withOptionals: true,
      });
      await assertFails(rPend.promise);
      await assertNoPartialDocs("e33-deny-pend", rPend.plan.historyEntryId);

      // 6. ALUNO -> NEGADO sem gravação parcial
      const alunoDb = testEnv!
        .authenticatedContext("aluno-inst", {
          email: "estudante@estudantes.ifpr.edu.br",
          email_verified: true,
        })
        .firestore();
      const rAluno = await runAtomicPlan(alunoDb, "aluno-inst", "SERVIDOR", "e33-deny-aluno", {
        withPrivate: true,
        withOptionals: true,
      });
      await assertFails(rAluno.promise);
      await assertNoPartialDocs("e33-deny-aluno", rAluno.plan.historyEntryId);

      // 7. INTRUSO -> NEGADO sem gravação parcial
      const intrusoDb = testEnv!
        .authenticatedContext("intruso-1", { email: "externo@outlook.com", email_verified: true })
        .firestore();
      const rIntruso = await runAtomicPlan(intrusoDb, "intruso-1", "SERVIDOR", "e33-deny-intruso", {
        withPrivate: false,
        withOptionals: false,
      });
      await assertFails(rIntruso.promise);
      await assertNoPartialDocs("e33-deny-intruso", rIntruso.plan.historyEntryId);

      // 8. Gmail sem atribuição válida -> NEGADO sem gravação parcial
      const gmailNoRoleDb = testEnv!
        .authenticatedContext("gmail-sem-atrib", {
          email: "semcargo@gmail.com",
          email_verified: true,
        })
        .firestore();
      const rGmailDeny = await runAtomicPlan(
        gmailNoRoleDb,
        "gmail-sem-atrib",
        "SERVIDOR",
        "e33-deny-gmail",
        { withPrivate: true, withOptionals: false }
      );
      await assertFails(rGmailDeny.promise);
      await assertNoPartialDocs("e33-deny-gmail", rGmailDeny.plan.historyEntryId);

      // 9. Não autenticado -> NEGADO sem gravação parcial
      const unauthDb = testEnv!.unauthenticatedContext().firestore();
      const rUnauth = await runAtomicPlan(unauthDb, "anon-uid", "SERVIDOR", "e33-deny-unauth", {
        withPrivate: false,
        withOptionals: false,
      });
      await assertFails(rUnauth.promise);
      await assertNoPartialDocs("e33-deny-unauth", rUnauth.plan.historyEntryId);
    });

    // =========================================================================
    // 6. BLOQUEIO, 7. SUSPENSÃO & 8. REATIVAÇÃO (fail-closed)
    // =========================================================================
    it("04. Bloqueio, Suspensão e Reativação: fail-closed para null/inválidos/ativos; reativação real via buildUserStatusTransitionData (deleteField) restaura acesso", async () => {
      const futureTs = Timestamp.fromMillis(Date.now() + 3600_000);
      const pastTs = Timestamp.fromMillis(Date.now() - 3600_000);

      const blockedVariants: Array<{ uid: string; patch: Record<string, any>; shouldAllow: boolean }> = [
        { uid: "st-null-b", patch: { status: "active", active: true, blockExpiresAt: null }, shouldAllow: false },
        { uid: "st-null-s", patch: { status: "active", active: true, suspendedUntil: null }, shouldAllow: false },
        { uid: "st-str-b", patch: { status: "active", active: true, blockExpiresAt: "2020-01-01T00:00:00Z" }, shouldAllow: false },
        { uid: "st-active-false", patch: { status: "active", active: false }, shouldAllow: false },
        { uid: "st-banned", patch: { status: "banned", active: true }, shouldAllow: false },
        { uid: "st-future-b", patch: { status: "active", active: true, blockExpiresAt: futureTs }, shouldAllow: false },
        { uid: "st-susp-future", patch: { status: "suspended", active: true, suspendedUntil: futureTs }, shouldAllow: false },
        { uid: "st-susp-nodate", patch: { status: "suspended", active: true }, shouldAllow: false },
        { uid: "st-susp-exp-nullb", patch: { status: "suspended", active: true, suspendedUntil: pastTs, blockExpiresAt: null }, shouldAllow: false },
        { uid: "st-susp-expired", patch: { status: "suspended", active: true, suspendedUntil: pastTs }, shouldAllow: true },
        { uid: "st-block-expired", patch: { status: "active", active: true, blockExpiresAt: pastTs }, shouldAllow: true },
      ];

      for (const v of blockedVariants) {
        await seedUser(v.uid, {
          email: `${v.uid}@ifpr.edu.br`,
          role: "SERVIDOR",
          approvalStatus: "APROVADO",
          ...v.patch,
        });
        const db = testEnv!
          .authenticatedContext(v.uid, { email: `${v.uid}@ifpr.edu.br`, email_verified: true })
          .firestore();
        const op = setDoc(doc(db, "items", `item-${v.uid}`), {
          id: `item-${v.uid}`,
          title: "Teste Standing",
          description: "Validação fail-closed",
          location: "Bloco A",
          status: "ENCONTRADO",
          registeredByUserId: v.uid,
          registeredByRole: "SERVIDOR",
        });
        if (v.shouldAllow) {
          await assertSucceeds(op);
        } else {
          await assertFails(op);
        }
      }

      // Reativação real usando buildUserStatusTransitionData (deleteField()) pelo Root Admin
      await seedUser("serv-reativado", {
        email: "reativado@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "suspended",
        active: false,
        suspendedUntil: futureTs,
        blockExpiresAt: futureTs,
      });
      const reactDb = testEnv!
        .authenticatedContext("serv-reativado", {
          email: "reativado@ifpr.edu.br",
          email_verified: true,
        })
        .firestore();
      await assertFails(
        setDoc(doc(reactDb, "items", "item-before-react"), {
          id: "item-before-react",
          title: "Bloqueado",
          description: "Deve falhar",
          location: "Bloco A",
          status: "ENCONTRADO",
          registeredByUserId: "serv-reativado",
          registeredByRole: "SERVIDOR",
        })
      );

      const rootDb = testEnv!
        .authenticatedContext(ROOT_UID, { email: ROOT_EMAIL, email_verified: true })
        .firestore();
      const transition = buildUserStatusTransitionData({
        newStatus: "active",
        actorId: ROOT_UID,
        actorName: "Root Admin",
        actorEmail: ROOT_EMAIL,
      });
      await assertSucceeds(updateDoc(doc(rootDb, "users", "serv-reativado"), transition.firestorePayload));

      await assertSucceeds(
        setDoc(doc(reactDb, "items", "item-after-react"), {
          id: "item-after-react",
          title: "Reativado",
          description: "Deve passar após deleteField()",
          location: "Bloco A",
          status: "ENCONTRADO",
          registeredByUserId: "serv-reativado",
          registeredByRole: "SERVIDOR",
        })
      );
    });

    // =========================================================================
    // 10. HISTÓRICO, 11. DADOS PRIVADOS (R-03) & 16. ANTI-SPOOFING
    // =========================================================================
    it("05. Histórico (/item_history), Dados Privados (/item_private R-03) e Anti-Spoofing (autoria, cargo e rollback atômico)", async () => {
      await seedUser("serv-a", {
        email: "serv.a@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
      });
      await seedUser("admin-a", {
        email: "admin.a@ifpr.edu.br",
        role: "ADMIN",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
      });
      await seedUser("aluno-a", {
        email: "aluno.a@estudantes.ifpr.edu.br",
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
      });

      const servDb = testEnv!
        .authenticatedContext("serv-a", { email: "serv.a@ifpr.edu.br", email_verified: true })
        .firestore();
      const adminDb = testEnv!
        .authenticatedContext("admin-a", { email: "admin.a@ifpr.edu.br", email_verified: true })
        .firestore();
      const alunoDb = testEnv!
        .authenticatedContext("aluno-a", {
          email: "aluno.a@estudantes.ifpr.edu.br",
          email_verified: true,
        })
        .firestore();
      const rootDb = testEnv!
        .authenticatedContext(ROOT_UID, { email: ROOT_EMAIL, email_verified: true })
        .firestore();

      // R-03: Spoofing de registeredByUserId em /item_private durante cadastro novo -> NEGADO
      await assertFails(
        setDoc(doc(servDb, "item_private", "item-spoof-priv"), {
          itemId: "item-spoof-priv",
          registeredByUserId: "vitima-uid-999",
          secretVerificationHint: "Dica falsa",
        })
      );

      // Spoofing de cargo (SERVIDOR tentando registeredByRole: ADMIN) no batch -> NEGADO + zero parciais
      const spoofBatch = writeBatch(servDb);
      spoofBatch.set(doc(servDb, "items", "item-role-spoof"), {
        id: "item-role-spoof",
        title: "Cargo Falso",
        description: "Tentativa de spoofing",
        location: "Bloco C",
        status: "ENCONTRADO",
        registeredByUserId: "serv-a",
        registeredByRole: "ADMIN",
      });
      spoofBatch.set(doc(servDb, "item_history", "hist-role-spoof"), {
        id: "hist-role-spoof",
        objectId: "item-role-spoof",
        action: "Ocorrência cadastrada",
        actorId: "serv-a",
        actorRole: "SERVIDOR",
      });
      await assertFails(spoofBatch.commit());
      await assertNoPartialDocs("item-role-spoof", "hist-role-spoof");

      // Cadastro legítimo por serv-a sem /item_private inicial
      const okBatch = writeBatch(servDb);
      okBatch.set(doc(servDb, "items", "item-legit-1"), {
        id: "item-legit-1",
        title: "Chaveiro IFPR",
        description: "Encontrado no pátio",
        location: "Pátio Central",
        status: "ENCONTRADO",
        registeredByUserId: "serv-a",
        registeredByRole: "SERVIDOR",
      });
      okBatch.set(doc(servDb, "item_history", "hist-legit-1"), {
        id: "hist-legit-1",
        objectId: "item-legit-1",
        action: "Ocorrência cadastrada",
        actorId: "serv-a",
        actorRole: "SERVIDOR",
      });
      await assertSucceeds(okBatch.commit());

      // Compatibilidade editItem: ADMIN adiciona /item_private retroativamente preservando o autor real 'serv-a' -> PERMITIDO
      await assertSucceeds(
        setDoc(
          doc(adminDb, "item_private", "item-legit-1"),
          {
            itemId: "item-legit-1",
            registeredByUserId: "serv-a",
            secretVerificationHint: "Marcação gravada no verso",
          },
          { merge: true }
        )
      );

      // ADMIN tentando forjar registeredByUserId de terceiro arbitrário (nem auth.uid nem autor real do item) -> NEGADO
      await assertFails(
        setDoc(doc(adminDb, "item_private", "item-legit-1-other"), {
          itemId: "item-legit-1-other",
          registeredByUserId: "terceiro-inexistente",
          secretVerificationHint: "Spoof",
        })
      );

      // ALUNO não pode ler nem listar /item_private
      await assertFails(getDoc(doc(alunoDb, "item_private", "item-legit-1")));
      await assertFails(getDocs(collection(alunoDb, "item_private")));

      // /item_history imutável (update e delete negados até para Root Admin; list negado para ALUNO)
      await assertFails(getDocs(collection(alunoDb, "item_history")));
      await assertSucceeds(getDocs(collection(servDb, "item_history")));
      await assertFails(updateDoc(doc(rootDb, "item_history", "hist-legit-1"), { action: "Adulterado" }));
      await assertFails(deleteDoc(doc(rootDb, "item_history", "hist-legit-1")));
    });

    // =========================================================================
    // 12. REIVINDICAÇÕES (/claims)
    // =========================================================================
    it("06. Reivindicações (/claims): ALUNO reivindica/cancela; INTRUSO bloqueado; escalação de revisão bloqueada; SERVIDOR/ADMIN revisam; terminal bloqueado", async () => {
      await seedUser("aluno-c", {
        email: "aluno.c@estudantes.ifpr.edu.br",
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
      });
      await seedUser("intruso-c", {
        email: "intruso.c@gmail.com",
        role: "INTRUSO",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
      });
      await seedUser("serv-c", {
        email: "serv.c@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
      });
      await seedDoc("items", "item-claim-1", {
        id: "item-claim-1",
        title: "Garrafa Térmica",
        status: "ENCONTRADO",
        registeredByUserId: "serv-c",
        registeredByRole: "SERVIDOR",
      });

      const alunoDb = testEnv!
        .authenticatedContext("aluno-c", {
          email: "aluno.c@estudantes.ifpr.edu.br",
          email_verified: true,
        })
        .firestore();
      const intrusoDb = testEnv!
        .authenticatedContext("intruso-c", { email: "intruso.c@gmail.com", email_verified: true })
        .firestore();
      const servDb = testEnv!
        .authenticatedContext("serv-c", { email: "serv.c@ifpr.edu.br", email_verified: true })
        .firestore();

      const claimId = "claim_aluno-c_item-claim-1";
      // Leitura transacional tolerante de ID determinístico inexistente
      await assertSucceeds(getDoc(doc(alunoDb, "claims", claimId)));
      // INTRUSO negado na criação
      await assertFails(
        setDoc(doc(intrusoDb, "claims", "claim_intruso-c_item-claim-1"), {
          id: "claim_intruso-c_item-claim-1",
          itemId: "item-claim-1",
          claimerId: "intruso-c",
          status: "PENDENTE",
          distinctiveFeatures: "Adesivo verde",
          createdAt: "2026-11-20T12:00:00Z",
        })
      );
      // ALUNO injetando campo administrativo na criação -> NEGADO
      await assertFails(
        setDoc(doc(alunoDb, "claims", claimId), {
          id: claimId,
          itemId: "item-claim-1",
          claimerId: "aluno-c",
          status: "PENDENTE",
          distinctiveFeatures: "Adesivo verde",
          reviewedByUserId: "serv-c",
          createdAt: "2026-11-20T12:00:00Z",
        })
      );
      // ALUNO criação legítima -> PERMITIDO
      await assertSucceeds(
        setDoc(doc(alunoDb, "claims", claimId), {
          id: claimId,
          itemId: "item-claim-1",
          claimerId: "aluno-c",
          status: "PENDENTE",
          distinctiveFeatures: "Adesivo verde na tampa",
          createdAt: "2026-11-20T12:00:00Z",
        })
      );
      // ALUNO tentando auto-aprovar -> NEGADO
      await assertFails(updateDoc(doc(alunoDb, "claims", claimId), { status: "APROVADO" }));
      // SERVIDOR aprova -> PERMITIDO
      await assertSucceeds(
        updateDoc(doc(servDb, "claims", claimId), {
          status: "APROVADO",
          reviewedByUserId: "serv-c",
          reviewedByRole: "SERVIDOR",
        })
      );
      // SERVIDOR conclui com completedAt -> PERMITIDO
      await assertSucceeds(
        updateDoc(doc(servDb, "claims", claimId), {
          status: "CONCLUIDO",
          completedAt: "2026-11-20T14:00:00Z",
        })
      );
      // Estado terminal CONCLUIDO bloqueado para alterações posteriores (inclusive SERVIDOR)
      await assertFails(
        updateDoc(doc(servDb, "claims", claimId), {
          status: "REJEITADO",
          rejectionReason: "Tentativa pós-conclusão",
        })
      );
      // Delete negado para SERVIDOR e ALUNO
      await assertFails(deleteDoc(doc(servDb, "claims", claimId)));
      await assertFails(deleteDoc(doc(alunoDb, "claims", claimId)));
    });

    // =========================================================================
    // 13. AUDITORIA (/audit_logs & /activity_logs — R-02 case-insensitive)
    // =========================================================================
    it("07. Auditoria (/audit_logs e /activity_logs): normalização case-insensitive de email (R-02), bloqueio de ações server-only e imutabilidade", async () => {
      await seedUser("serv-aud", {
        email: "Servidor.Aud@IFPR.EDU.BR",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
      });
      await seedUser("aluno-aud", {
        email: "aluno.aud@estudantes.ifpr.edu.br",
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
      });

      const servDb = testEnv!
        .authenticatedContext("serv-aud", {
          email: "servidor.aud@ifpr.edu.br",
          email_verified: true,
        })
        .firestore();
      const alunoDb = testEnv!
        .authenticatedContext("aluno-aud", {
          email: "aluno.aud@estudantes.ifpr.edu.br",
          email_verified: true,
        })
        .firestore();
      const rootDb = testEnv!
        .authenticatedContext(ROOT_UID, { email: ROOT_EMAIL, email_verified: true })
        .firestore();

      // R-02: e-mail em maiúsculas/misto coincide case-insensitive com token -> PERMITIDO
      await assertSucceeds(
        setDoc(doc(servDb, "audit_logs", "aud-case-1"), {
          actorId: "serv-aud",
          actorEmail: "SERVIDOR.AUD@IFPR.EDU.BR",
          actorRole: "SERVIDOR",
          objectType: "ITEM",
          action: "CADASTRO_OCORRENCIA",
          timestamp: "2026-11-20T12:00:00Z",
        })
      );
      await assertSucceeds(
        setDoc(doc(servDb, "activity_logs", "act-case-1"), {
          actorId: "serv-aud",
          actorEmail: "Servidor.Aud@ifpr.edu.br",
          actorRole: "SERVIDOR",
          action: "CADASTRO_OCORRENCIA",
          timestamp: "2026-11-20T12:00:00Z",
        })
      );

      // Spoofing de e-mail em audit_logs -> NEGADO
      await assertFails(
        setDoc(doc(servDb, "audit_logs", "aud-spoof-email"), {
          actorId: "serv-aud",
          actorEmail: "outro@ifpr.edu.br",
          actorRole: "SERVIDOR",
          action: "CADASTRO_OCORRENCIA",
        })
      );
      // Ação reservada ao Admin SDK (REGISTRO_DEVOLUCAO / ROLE_ASSIGNED) -> NEGADO até para Root Admin via Client SDK
      await assertFails(
        setDoc(doc(rootDb, "audit_logs", "aud-server-only"), {
          actorId: ROOT_UID,
          actorEmail: ROOT_EMAIL,
          actorRole: "ADMIN",
          action: "ROLE_ASSIGNED",
        })
      );
      // ALUNO não lê audit_logs nem activity_logs
      await assertFails(getDocs(collection(alunoDb, "audit_logs")));
      await assertFails(getDocs(collection(alunoDb, "activity_logs")));
      // Imutabilidade absoluta: update e delete negados até para Root Admin
      await assertFails(updateDoc(doc(rootDb, "audit_logs", "aud-case-1"), { action: "X" }));
      await assertFails(deleteDoc(doc(rootDb, "audit_logs", "aud-case-1")));
      await assertFails(updateDoc(doc(rootDb, "activity_logs", "act-case-1"), { action: "X" }));
      await assertFails(deleteDoc(doc(rootDb, "activity_logs", "act-case-1")));
    });

    // =========================================================================
    // 14. PERFIL E ATUALIZAÇÃO DE USUÁRIOS (/users) & 15. OPERAÇÕES ADMINISTRATIVAS
    // =========================================================================
    it("08. Usuários e Operações Administrativas: protege role, roleAssignedByName, aprovação e bloqueios; ADMIN comum não concede ADMIN nem altera Root Admin", async () => {
      await seedUser(ROOT_UID, {
        email: ROOT_EMAIL,
        name: "Root Admin",
        role: "ADMIN",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
      });
      await seedUser("admin-comum", {
        email: "admin.comum@ifpr.edu.br",
        name: "Admin Comum",
        role: "ADMIN",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
      });
      await seedUser("aluno-u", {
        email: "aluno.u@estudantes.ifpr.edu.br",
        name: "Aluno Original",
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
        roleAssignedBy: ROOT_EMAIL,
        roleAssignedByName: "Paulo Cauan",
        roleAssignedAt: "2026-11-01T00:00:00Z",
      });

      const alunoDb = testEnv!
        .authenticatedContext("aluno-u", {
          email: "aluno.u@estudantes.ifpr.edu.br",
          email_verified: true,
        })
        .firestore();
      const adminComumDb = testEnv!
        .authenticatedContext("admin-comum", {
          email: "admin.comum@ifpr.edu.br",
          email_verified: true,
        })
        .firestore();
      const rootDb = testEnv!
        .authenticatedContext(ROOT_UID, { email: ROOT_EMAIL, email_verified: true })
        .firestore();

      // Atualização legítima de perfil próprio (nome, telefone, FCM) -> PERMITIDO
      await assertSucceeds(
        setDoc(
          doc(alunoDb, "users", "aluno-u"),
          { name: "Aluno Atualizado", phone: "43999990000", fcmSubscribed: true },
          { merge: true }
        )
      );

      // Tentativas de adulteração de campos protegidos pelo próprio usuário -> TODAS NEGADAS
      for (const badPatch of [
        { role: "SERVIDOR" },
        { role: "ADMIN" },
        { admin: true },
        { approvalStatus: "REJEITADO" },
        { roleAssignedBy: "hacker@evil.com" },
        { roleAssignedByName: "Nome Adulterado" },
        { roleAssignedAt: "2026-12-01T00:00:00Z" },
        { roleAssignmentActive: true },
        { active: false },
        { blockReason: "auto-injetado" },
        { suspensionReason: "auto-injetado" },
        { roleAssignedByName: deleteField() },
      ]) {
        await assertFails(updateDoc(doc(alunoDb, "users", "aluno-u"), badPatch));
      }

      // ADMIN comum pode criar e atualizar ALUNO/SERVIDOR/INTRUSO
      await assertSucceeds(
        setDoc(doc(adminComumDb, "users", "usr_managed_1"), {
          id: "usr_managed_1",
          name: "Servidor Gerenciado",
          email: "gerenciado@ifpr.edu.br",
          role: "SERVIDOR",
          approvalStatus: "APROVADO",
          status: "active",
          active: true,
        })
      );
      await assertSucceeds(
        updateDoc(doc(adminComumDb, "users", "aluno-u"), {
          role: "SERVIDOR",
          approvalStatus: "APROVADO",
        })
      );

      // ADMIN comum NÃO pode promover para ADMIN, NÃO pode criar ADMIN e NÃO pode editar/excluir Root Admin
      await assertFails(updateDoc(doc(adminComumDb, "users", "aluno-u"), { role: "ADMIN" }));
      await assertFails(updateDoc(doc(adminComumDb, "users", "aluno-u"), { admin: true }));
      await assertFails(
        setDoc(doc(adminComumDb, "users", "usr_fake_admin"), {
          id: "usr_fake_admin",
          email: "novo.admin@ifpr.edu.br",
          role: "ADMIN",
          approvalStatus: "APROVADO",
        })
      );
      await assertFails(updateDoc(doc(adminComumDb, "users", ROOT_UID), { status: "suspended" }));
      await assertFails(deleteDoc(doc(adminComumDb, "users", ROOT_UID)));
      await assertFails(deleteDoc(doc(adminComumDb, "users", "admin-comum"))); // não deleta a si mesmo

      // Root Admin PODE promover para ADMIN
      await assertSucceeds(updateDoc(doc(rootDb, "users", "aluno-u"), { role: "ADMIN" }));
    });

    // =========================================================================
    // 18. NEGAÇÃO POR PADRÃO, 19. COLEÇÕES NÃO AUTORIZADAS & 20. DEMAIS COLEÇÕES + BANCO NOMEADO
    // =========================================================================
    it("09. Negação por Padrão, Coleções Server-Only/Desconhecidas e Demais Coleções Operacionais (positivas e negativas)", async () => {
      await seedUser("serv-op", {
        email: "serv.op@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
      });
      await seedUser("aluno-op", {
        email: "aluno.op@estudantes.ifpr.edu.br",
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
      });
      await seedDoc("item_return_records", "ret-1", {
        itemId: "ret-1",
        recipientUid: "aluno-op",
        recipientEmail: "aluno.op@estudantes.ifpr.edu.br",
      });
      await seedDoc("email_notifications", "email-1", { recipientEmail: "a@ifpr.edu.br" });
      await seedDoc("system_config", "root_pinning", { rootUid: ROOT_UID });

      const rootDb = testEnv!
        .authenticatedContext(ROOT_UID, { email: ROOT_EMAIL, email_verified: true })
        .firestore();
      const servDb = testEnv!
        .authenticatedContext("serv-op", { email: "serv.op@ifpr.edu.br", email_verified: true })
        .firestore();
      const alunoDb = testEnv!
        .authenticatedContext("aluno-op", {
          email: "aluno.op@estudantes.ifpr.edu.br",
          email_verified: true,
        })
        .firestore();
      const unauthDb = testEnv!.unauthenticatedContext().firestore();

      // Coleções estritamente server-only / legadas / sonda / desconhecidas -> NEGADAS até para Root Admin
      for (const blockedPath of [
        ["signature_requests", "sig-1"],
        ["ai_audit_logs", "ai-1"],
        ["analytics_events", "ev-1"],
        ["perdas", "p-1"],
        ["test", "connection"],
        ["colecao_inexistente", "doc-1"],
      ]) {
        await assertFails(getDoc(doc(rootDb, blockedPath[0], blockedPath[1])));
        await assertFails(setDoc(doc(rootDb, blockedPath[0], blockedPath[1]), { x: 1 }));
      }
      // Subcoleção arbitrária não autorizada -> NEGADA
      await assertFails(
        setDoc(doc(rootDb, "items", "item-1", "subcolecao_nao_autorizada", "sub-1"), { x: 1 })
      );

      // /item_return_records: recebedor lê próprio recibo; outro não; escrita negada até para Root
      await assertSucceeds(getDoc(doc(alunoDb, "item_return_records", "ret-1")));
      await assertFails(getDocs(collection(alunoDb, "item_return_records")));
      await assertSucceeds(getDocs(collection(servDb, "item_return_records")));
      await assertFails(setDoc(doc(rootDb, "item_return_records", "ret-2"), { itemId: "ret-2" }));

      // /email_notifications: staff/admin lê; aluno negado; escrita negada até para Root
      await assertSucceeds(getDoc(doc(servDb, "email_notifications", "email-1")));
      await assertFails(getDoc(doc(alunoDb, "email_notifications", "email-1")));
      await assertFails(setDoc(doc(rootDb, "email_notifications", "email-2"), { ok: true }));

      // /system_config: admin lê; escrita negada; servidor negado
      await assertSucceeds(getDoc(doc(rootDb, "system_config", "root_pinning")));
      await assertFails(getDoc(doc(servDb, "system_config", "root_pinning")));
      await assertFails(setDoc(doc(rootDb, "system_config", "root_pinning"), { hacked: true }));

      // /document_templates, /generated_documents, /project_settings, /backup_logs: somente ADMIN
      for (const adminCol of ["document_templates", "generated_documents", "project_settings"]) {
        await assertSucceeds(setDoc(doc(rootDb, adminCol, "doc-1"), { title: "Oficial" }));
        await assertFails(getDoc(doc(servDb, adminCol, "doc-1")));
        await assertFails(setDoc(doc(servDb, adminCol, "doc-2"), { title: "Negado" }));
      }
      await assertSucceeds(
        setDoc(doc(rootDb, "backup_logs", "bkp-1"), { adminId: ROOT_UID, status: "OK" })
      );
      await assertFails(
        setDoc(doc(servDb, "backup_logs", "bkp-2"), { adminId: "serv-op", status: "OK" })
      );

      // /notifications: ALUNO cria para si (não-SYSTEM, não-global); não envia para terceiro
      await assertSucceeds(
        setDoc(doc(alunoDb, "notifications", "n-self"), {
          id: "n-self",
          userId: "aluno-op",
          title: "Lembrete",
          message: "Verifique o item",
          type: "CLAIM_UPDATE",
          read: false,
        })
      );
      await assertFails(
        setDoc(doc(alunoDb, "notifications", "n-spoof"), {
          id: "n-spoof",
          userId: "serv-op",
          title: "Spam",
          message: "Falso",
          type: "CLAIM_UPDATE",
          read: false,
        })
      );
      await assertFails(
        setDoc(doc(alunoDb, "notifications", "n-broadcast"), {
          id: "n-broadcast",
          userId: "aluno-op",
          isGlobal: true,
          title: "Global falso",
          message: "Falso",
          read: false,
        })
      );

      // /comments, /fcm_subscriptions, /support_tickets, /error_logs, /system_metrics
      await assertSucceeds(
        setDoc(doc(alunoDb, "comments", "c-1"), {
          userId: "aluno-op",
          userRole: "ALUNO",
          itemId: "item-1",
          text: "Vi esse caderno",
          createdAt: "2026-11-20T12:00:00Z",
        })
      );
      await assertFails(
        setDoc(doc(alunoDb, "comments", "c-spoof"), {
          userId: "aluno-op",
          userRole: "ADMIN",
          itemId: "item-1",
          text: "Cargo falso",
        })
      );
      await assertSucceeds(
        setDoc(doc(alunoDb, "fcm_subscriptions", "aluno-op"), { fcmToken: "tok-1" })
      );
      await assertFails(
        setDoc(doc(alunoDb, "fcm_subscriptions", "serv-op"), { fcmToken: "tok-hijack" })
      );
      await assertSucceeds(
        setDoc(doc(unauthDb, "support_tickets", "t-visit"), {
          status: "NOVO",
          subject: "Ajuda",
        })
      );
      await assertFails(
        setDoc(doc(unauthDb, "support_tickets", "t-visit-spoof"), {
          userId: "aluno-op",
          status: "NOVO",
        })
      );
      await assertSucceeds(
        setDoc(doc(alunoDb, "error_logs", "err-1"), {
          userId: "aluno-op",
          userEmail: "ALUNO.OP@ESTUDANTES.IFPR.EDU.BR",
          message: "Erro de rede",
        })
      );
      await assertSucceeds(setDoc(doc(alunoDb, "system_metrics", "heartbeat"), { ping: 12 }));
      await assertFails(setDoc(doc(alunoDb, "system_metrics", "billing"), { cost: 0 }));

      // /test_participants, /test_executions, /test_error_logs
      await assertSucceeds(
        setDoc(doc(servDb, "test_participants", "aluno-op"), {
          id: "aluno-op",
          contextualRole: "TESTADOR",
          status: "ATIVO",
        })
      );
      await assertSucceeds(
        setDoc(doc(servDb, "test_executions", "exec-1"), { title: "Bateria QA" })
      );
      await assertSucceeds(getDoc(doc(alunoDb, "test_executions", "exec-1")));
      await assertFails(deleteDoc(doc(servDb, "test_executions", "exec-1")));
      await assertSucceeds(
        setDoc(doc(alunoDb, "test_error_logs", "terr-1"), {
          batteryId: "B-33",
          testId: "T-01",
          action: "CREATE_ITEM",
          errorMessage: "Timeout de teste",
          timestamp: "2026-11-20T12:00:00Z",
          userId: "aluno-op",
          userEmail: "ALUNO.OP@ESTUDANTES.IFPR.EDU.BR",
        })
      );
      await assertFails(updateDoc(doc(rootDb, "test_error_logs", "terr-1"), { resolved: true }));
    });

    it("10. Compatibilidade de Infraestrutura com o Banco Nomeado (não-default): valida firebase.json, firebase-applet-config.json e artefatos de publicação Etapa 33", () => {
      const appletCfg = JSON.parse(
        fs.readFileSync(path.resolve(process.cwd(), "firebase-applet-config.json"), "utf-8")
      );
      const rootFbJson = JSON.parse(
        fs.readFileSync(path.resolve(process.cwd(), "firebase.json"), "utf-8")
      );
      const pubFbJson = JSON.parse(
        fs.readFileSync(
          path.resolve(
            process.cwd(),
            "scripts/audit/candidates/etapa33-reconstrucao/firebase.publish.json"
          ),
          "utf-8"
        )
      );
      const rcJson = JSON.parse(
        fs.readFileSync(
          path.resolve(
            process.cwd(),
            "scripts/audit/candidates/etapa33-reconstrucao/firebaserc.candidate.json"
          ),
          "utf-8"
        )
      );

      expect(appletCfg.projectId).toBe(EXPECTED_PROJECT_ID);
      expect(appletCfg.firestoreDatabaseId).toBe(EXPECTED_DATABASE_ID);
      expect(rootFbJson.firestore.database).toBe(EXPECTED_DATABASE_ID);
      expect(pubFbJson.firestore.database).toBe(EXPECTED_DATABASE_ID);
      expect(pubFbJson.firestore.database).not.toBe("(default)");
      expect(rcJson.projects.default).toBe(EXPECTED_PROJECT_ID);
    });
  }
);
