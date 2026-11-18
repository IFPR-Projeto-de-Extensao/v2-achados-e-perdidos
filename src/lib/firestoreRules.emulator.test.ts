import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, deleteField, query, where, writeBatch, Timestamp } from "firebase/firestore";
import fs from "fs";
import path from "path";

let testEnv: RulesTestEnvironment | null = null;

const isEmulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

async function verifyFirestoreEmulatorSignature(host: string, port: number): Promise<void> {
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(
      `[FirestoreRules] Violação de isolamento: FIRESTORE_EMULATOR_HOST aponta para host não-local ('${host}:${port}').`
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);
  try {
    const hubHost = process.env.FIREBASE_EMULATOR_HUB;
    if (hubHost) {
      const hubRes = await fetch(`http://${hubHost}/emulators`, { signal: controller.signal });
      if (hubRes.ok && (hubRes.headers.get("content-type") || "").includes("application/json")) {
        const emulators = (await hubRes.json()) as Record<string, { host?: string; port?: number }>;
        if (emulators?.firestore?.port === port) {
          return;
        }
      }
    }

    const rootUrl = `http://${host}:${port}/`;
    const rootRes = await fetch(rootUrl, { signal: controller.signal });
    const rootContentType = rootRes.headers.get("content-type") || "";
    const bodyText = await rootRes.text();

    if (rootContentType.includes("text/html") || bodyText.trimStart().startsWith("<")) {
      throw new Error(
        `[FirestoreRules] Endpoint ${rootUrl} respondeu HTML (${rootContentType || rootRes.status}), indicando servidor web e não Cloud Firestore Emulator.`
      );
    }

    const hasKnownSignature =
      bodyText.includes("Cloud Firestore emulator") ||
      rootRes.headers.has("firebase-emulator-version") ||
      rootRes.headers.has("x-emulator-version");

    if (hasKnownSignature) {
      return;
    }

    // Cloud Firestore Emulator atual responde "Ok" em GET / e JSON em /v1/projects/.../documents
    const restProbe = await fetch(
      `http://${host}:${port}/v1/projects/localiza-plus-emulator-test/databases/(default)/documents`,
      { signal: controller.signal }
    );
    const restContentType = restProbe.headers.get("content-type") || "";
    if (rootRes.ok && bodyText.trim() === "Ok" && restContentType.includes("application/json")) {
      return;
    }

    throw new Error(
      `[FirestoreRules] Endpoint ${rootUrl} respondeu HTTP ${rootRes.status} sem assinatura válida do Cloud Firestore Emulator. Resposta: "${bodyText.slice(0, 120)}"`
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

describe.skipIf(!isEmulatorAvailable)("Firestore Rules Emulator Suite — Real Security Rules Validation", () => {
  beforeAll(async () => {
    const rulesPath = path.resolve(process.cwd(), "firestore.rules");
    const rules = fs.readFileSync(rulesPath, "utf-8");

    const hostAndPort = process.env.FIRESTORE_EMULATOR_HOST?.split(":") || ["127.0.0.1", "8080"];
    const host = hostAndPort[0] || "127.0.0.1";
    const port = Number(hostAndPort[1]) || 8080;

    await verifyFirestoreEmulatorSignature(host, port);

    testEnv = await initializeTestEnvironment({
      projectId: "localiza-plus-emulator-test",
      firestore: {
        rules: rules,
        host,
        port,
      },
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    if (testEnv) {
      await testEnv.clearFirestore();
    }
  });

  const setupUserDoc = async (uid: string, data: Record<string, any>) => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "users", uid), data);
    });
  };

  describe("Collection /items — Creation Rules", () => {
    const itemCollectionPath = "items";

    it("1. SERVIDOR aprovado com e-mail verificado consegue criar item", async () => {
      const uid = "serv_apr_1";
      await setupUserDoc(uid, {
        id: uid,
        email: "servidor.aprovado@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "active",
      });

      const db = testEnv.authenticatedContext(uid, {
        email: "servidor.aprovado@ifpr.edu.br",
        email_verified: true,
      }).firestore();

      const docRef = doc(db, itemCollectionPath, "item_1");
      await assertSucceeds(
        setDoc(docRef, {
          id: "item_1",
          title: "Chave Perdida",
          description: "Chave do laboratório 03",
          category: "Outros",
          location: "Bloco A",
          status: "NOVO",
          registeredByUserId: uid,
          registeredByRole: "SERVIDOR",
          createdAt: new Date().toISOString(),
        })
      );
    });

    it("2. SERVIDOR pendente com e-mail verificado NÃO consegue criar item", async () => {
      const uid = "serv_pend_1";
      await setupUserDoc(uid, {
        id: uid,
        email: "servidor.pendente@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "PENDENTE",
        status: "active",
      });

      const db = testEnv.authenticatedContext(uid, {
        email: "servidor.pendente@ifpr.edu.br",
        email_verified: true,
      }).firestore();

      const docRef = doc(db, itemCollectionPath, "item_2");
      await assertFails(
        setDoc(docRef, {
          id: "item_2",
          title: "Calculadora Científica",
          description: "Casio fx-991ES",
          category: "Eletrônicos",
          location: "Biblioteca",
          status: "NOVO",
          registeredByUserId: uid,
          registeredByRole: "SERVIDOR",
          createdAt: new Date().toISOString(),
        })
      );
    });

    it("2b. SERVIDOR rejeitado ou sem approvalStatus NÃO consegue criar item", async () => {
      const uidRej = "serv_rej_1";
      await setupUserDoc(uidRej, {
        id: uidRej,
        email: "servidor.rejeitado@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "REJEITADO",
        status: "active",
      });

      const dbRej = testEnv.authenticatedContext(uidRej, {
        email: "servidor.rejeitado@ifpr.edu.br",
        email_verified: true,
      }).firestore();

      await assertFails(
        setDoc(doc(dbRej, itemCollectionPath, "item_2b_rej"), {
          id: "item_2b_rej",
          title: "Item Rejeitado",
          description: "Teste",
          category: "Outros",
          location: "Bloco B",
          status: "NOVO",
          registeredByUserId: uidRej,
          registeredByRole: "SERVIDOR",
          createdAt: new Date().toISOString(),
        })
      );

      const uidNone = "serv_none_1";
      await setupUserDoc(uidNone, {
        id: uidNone,
        email: "servidor.semstatus@ifpr.edu.br",
        role: "SERVIDOR",
        status: "active",
      });

      const dbNone = testEnv.authenticatedContext(uidNone, {
        email: "servidor.semstatus@ifpr.edu.br",
        email_verified: true,
      }).firestore();

      await assertFails(
        setDoc(doc(dbNone, itemCollectionPath, "item_2b_none"), {
          id: "item_2b_none",
          title: "Item Sem Status",
          description: "Teste",
          category: "Outros",
          location: "Bloco C",
          status: "NOVO",
          registeredByUserId: uidNone,
          registeredByRole: "SERVIDOR",
          createdAt: new Date().toISOString(),
        })
      );
    });

    it("3. ALUNO ativo NÃO consegue criar item com registeredByRole = SERVIDOR", async () => {
      const uid = "aluno_1";
      await setupUserDoc(uid, {
        id: uid,
        email: "aluno.teste@estudantes.ifpr.edu.br",
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "active",
      });

      const db = testEnv.authenticatedContext(uid, {
        email: "aluno.teste@estudantes.ifpr.edu.br",
        email_verified: true,
      }).firestore();

      const docRef = doc(db, itemCollectionPath, "item_3");
      await assertFails(
        setDoc(docRef, {
          id: "item_3",
          title: "Item Falso",
          description: "Tentativa de falsificação",
          category: "Outros",
          location: "Sala",
          status: "NOVO",
          registeredByUserId: uid,
          registeredByRole: "SERVIDOR",
          createdAt: new Date().toISOString(),
        })
      );
    });

    it("4. INTRUSO com e-mail externo NÃO consegue criar item", async () => {
      const uid = "intruso_1";
      await setupUserDoc(uid, {
        id: uid,
        email: "intruso@gmail.com",
        role: "INTRUSO",
        status: "active",
      });

      const db = testEnv.authenticatedContext(uid, {
        email: "intruso@gmail.com",
        email_verified: true,
      }).firestore();

      const docRef = doc(db, itemCollectionPath, "item_4");
      await assertFails(
        setDoc(docRef, {
          id: "item_4",
          title: "Item Externo",
          description: "Tentativa de intruso",
          category: "Outros",
          location: "Rua",
          status: "NOVO",
          registeredByUserId: uid,
          registeredByRole: "SERVIDOR",
          createdAt: new Date().toISOString(),
        })
      );
    });

    it("5. SERVIDOR suspenso NÃO consegue criar item", async () => {
      const uid = "serv_susp";
      await setupUserDoc(uid, {
        id: uid,
        email: "servidor.suspenso@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "suspended",
        suspendedUntil: Date.now() + 1000000,
      });

      const db = testEnv.authenticatedContext(uid, {
        email: "servidor.suspenso@ifpr.edu.br",
        email_verified: true,
      }).firestore();

      const docRef = doc(db, itemCollectionPath, "item_5");
      await assertFails(
        setDoc(docRef, {
          id: "item_5",
          title: "Item Suspenso",
          description: "Tentativa",
          category: "Outros",
          location: "Sala",
          status: "NOVO",
          registeredByUserId: uid,
          registeredByRole: "SERVIDOR",
          createdAt: new Date().toISOString(),
        })
      );
    });

    it("6. Falsificação de registeredByUserId é barrada", async () => {
      const uid = "serv_real";
      await setupUserDoc(uid, {
        id: uid,
        email: "servidor.real@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "active",
      });

      const db = testEnv.authenticatedContext(uid, {
        email: "servidor.real@ifpr.edu.br",
        email_verified: true,
      }).firestore();

      const docRef = doc(db, itemCollectionPath, "item_6");
      await assertFails(
        setDoc(docRef, {
          id: "item_6",
          title: "Spoofing",
          description: "UID diferente",
          category: "Outros",
          location: "Sala",
          status: "NOVO",
          registeredByUserId: "outro_uid_malicioso",
          registeredByRole: "SERVIDOR",
          createdAt: new Date().toISOString(),
        })
      );
    });

    it("6a. Root Admin (UID hCG5mDgK1fRaTojULzlM7dXvb7n2 e paulocauan39@gmail.com verificado) cria em /items, /item_private e /item_history com ou sem users/{uid}", async () => {
      const rootUid = "hCG5mDgK1fRaTojULzlM7dXvb7n2";
      const rootEmail = "paulocauan39@gmail.com";

      const dbRoot = testEnv.authenticatedContext(rootUid, {
        email: rootEmail,
        email_verified: true,
      }).firestore();

      await assertSucceeds(
        setDoc(doc(dbRoot, "items", "item_root_no_doc"), {
          id: "item_root_no_doc",
          title: "Carregador USB-C",
          description: "Encontrado na portaria",
          category: "Eletrônicos",
          location: "Portaria",
          status: "ENCONTRADO",
          type: "ENCONTRADO",
          registeredByUserId: rootUid,
          registeredByRole: "ADMIN",
          createdAt: new Date().toISOString(),
        })
      );

      await assertSucceeds(
        setDoc(doc(dbRoot, "item_private", "item_root_no_doc"), {
          itemId: "item_root_no_doc",
          registeredByUserId: rootUid,
          secretVerificationHint: "Cabo branco de 2m",
          updatedAt: new Date().toISOString(),
        })
      );

      await assertSucceeds(
        setDoc(doc(dbRoot, "item_history", "hist_root_no_doc"), {
          id: "hist_root_no_doc",
          itemId: "item_root_no_doc",
          objectId: "item_root_no_doc",
          action: "Ocorrência cadastrada",
          actorId: rootUid,
          actorRole: "ADMIN",
          timestamp: new Date().toISOString(),
        })
      );
    });

    it("6b. ADMIN não-root (Gmail promovido) com users/{uid} ADMIN/APROVADO/active consegue criar em /items, /item_private e /item_history", async () => {
      const uid = "gmail_admin_aprovado";
      await setupUserDoc(uid, {
        id: uid,
        email: "admin.gmail@gmail.com",
        role: "ADMIN",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
      });

      const db = testEnv.authenticatedContext(uid, {
        email: "admin.gmail@gmail.com",
        email_verified: true,
        role: "ADMIN",
        admin: true,
      }).firestore();

      await assertSucceeds(
        setDoc(doc(db, "items", "item_admin_ok"), {
          id: "item_admin_ok",
          title: "Notebook Dell",
          description: "Encontrado no Bloco 2",
          category: "Eletrônicos",
          location: "Bloco 2",
          status: "ENCONTRADO",
          type: "ENCONTRADO",
          registeredByUserId: uid,
          registeredByRole: "ADMIN",
          createdAt: new Date().toISOString(),
        })
      );

      await assertSucceeds(
        setDoc(doc(db, "item_private", "item_admin_ok"), {
          itemId: "item_admin_ok",
          registeredByUserId: uid,
          secretVerificationHint: "Adesivo azul na tampa",
          updatedAt: new Date().toISOString(),
        })
      );

      await assertSucceeds(
        setDoc(doc(db, "item_history", "hist_admin_ok"), {
          id: "hist_admin_ok",
          itemId: "item_admin_ok",
          objectId: "item_admin_ok",
          action: "Ocorrência cadastrada",
          actorId: uid,
          actorRole: "ADMIN",
          timestamp: new Date().toISOString(),
        })
      );
    });

    it("6c. ADMIN não-root com claim role=ADMIN mas users/{uid} INTRUSO ou PENDENTE é negado ao criar em /items", async () => {
      const uidIntruso = "gmail_claim_admin_intruso";
      await setupUserDoc(uidIntruso, {
        id: uidIntruso,
        email: "intruso.claim@gmail.com",
        role: "INTRUSO",
        approvalStatus: "PENDENTE",
        status: "active",
      });

      const dbIntruso = testEnv.authenticatedContext(uidIntruso, {
        email: "intruso.claim@gmail.com",
        email_verified: true,
        role: "ADMIN",
        admin: true,
      }).firestore();

      await assertFails(
        setDoc(doc(dbIntruso, "items", "item_intruso_claim"), {
          id: "item_intruso_claim",
          title: "Item Bloqueado Intruso",
          description: "Perfil users/{uid} ainda é INTRUSO",
          category: "Outros",
          location: "Bloco 1",
          status: "ENCONTRADO",
          type: "ENCONTRADO",
          registeredByUserId: uidIntruso,
          registeredByRole: "ADMIN",
          createdAt: new Date().toISOString(),
        })
      );

      const uidPendente = "gmail_claim_admin_pendente";
      await setupUserDoc(uidPendente, {
        id: uidPendente,
        email: "pendente.claim@gmail.com",
        role: "ADMIN",
        approvalStatus: "PENDENTE",
        status: "active",
      });

      const dbPendente = testEnv.authenticatedContext(uidPendente, {
        email: "pendente.claim@gmail.com",
        email_verified: true,
        role: "ADMIN",
        admin: true,
      }).firestore();

      await assertFails(
        setDoc(doc(dbPendente, "items", "item_pendente_claim"), {
          id: "item_pendente_claim",
          title: "Item Bloqueado Pendente",
          description: "Perfil users/{uid} está PENDENTE",
          category: "Outros",
          location: "Bloco 1",
          status: "ENCONTRADO",
          type: "ENCONTRADO",
          registeredByUserId: uidPendente,
          registeredByRole: "ADMIN",
          createdAt: new Date().toISOString(),
        })
      );
    });

    it("6d. SERVIDOR externo (Gmail) aprovado cria em /items, /item_private e /item_history; se PENDENTE é negado", async () => {
      const uidServOk = "gmail_serv_ok";
      await setupUserDoc(uidServOk, {
        id: uidServOk,
        email: "servidor.gmail@gmail.com",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
      });

      const dbOk = testEnv.authenticatedContext(uidServOk, {
        email: "servidor.gmail@gmail.com",
        email_verified: true,
        role: "SERVIDOR",
      }).firestore();

      await assertSucceeds(
        setDoc(doc(dbOk, "items", "item_serv_ok"), {
          id: "item_serv_ok",
          title: "Garrafa Térmica",
          description: "Deixada na biblioteca",
          category: "Outros",
          location: "Biblioteca",
          status: "ENCONTRADO",
          type: "ENCONTRADO",
          registeredByUserId: uidServOk,
          registeredByRole: "SERVIDOR",
          createdAt: new Date().toISOString(),
        })
      );
      await assertSucceeds(
        setDoc(doc(dbOk, "item_private", "item_serv_ok"), {
          itemId: "item_serv_ok",
          registeredByUserId: uidServOk,
          secretVerificationHint: "Nome gravado na base",
          updatedAt: new Date().toISOString(),
        })
      );
      await assertSucceeds(
        setDoc(doc(dbOk, "item_history", "hist_serv_ok"), {
          id: "hist_serv_ok",
          itemId: "item_serv_ok",
          objectId: "item_serv_ok",
          action: "Ocorrência cadastrada",
          actorId: uidServOk,
          actorRole: "SERVIDOR",
          timestamp: new Date().toISOString(),
        })
      );

      const uidServPend = "gmail_serv_pend";
      await setupUserDoc(uidServPend, {
        id: uidServPend,
        email: "servidor.pend.gmail@gmail.com",
        role: "SERVIDOR",
        approvalStatus: "PENDENTE",
        status: "active",
      });

      const dbPend = testEnv.authenticatedContext(uidServPend, {
        email: "servidor.pend.gmail@gmail.com",
        email_verified: true,
        role: "SERVIDOR",
      }).firestore();

      await assertFails(
        setDoc(doc(dbPend, "items", "item_serv_pend"), {
          id: "item_serv_pend",
          title: "Estojo Preto",
          description: "Tentativa pendente",
          category: "Materiais",
          location: "Bloco 3",
          status: "ENCONTRADO",
          type: "ENCONTRADO",
          registeredByUserId: uidServPend,
          registeredByRole: "SERVIDOR",
          createdAt: new Date().toISOString(),
        })
      );
    });

    it("6e. ADMIN ou SERVIDOR sem campo approvalStatus em users/{uid} é negado com segurança (sem erro de avaliação)", async () => {
      const uidAdminSemAprov = "gmail_admin_sem_aprov";
      await setupUserDoc(uidAdminSemAprov, {
        id: uidAdminSemAprov,
        email: "admin.semaprov@gmail.com",
        role: "ADMIN",
        status: "active",
      });

      const dbAdminSemAprov = testEnv.authenticatedContext(uidAdminSemAprov, {
        email: "admin.semaprov@gmail.com",
        email_verified: true,
        role: "ADMIN",
        admin: true,
      }).firestore();

      await assertFails(
        setDoc(doc(dbAdminSemAprov, "items", "item_sem_aprov"), {
          id: "item_sem_aprov",
          title: "Item Bloqueado Sem ApprovalStatus",
          description: "Documento users/{uid} sem campo approvalStatus",
          category: "Outros",
          location: "Bloco 1",
          status: "ENCONTRADO",
          type: "ENCONTRADO",
          registeredByUserId: uidAdminSemAprov,
          registeredByRole: "ADMIN",
          createdAt: new Date().toISOString(),
        })
      );
    });

    it("6f. Conta @ifpr.edu.br criada como INTRUSO/APROVADO consegue promover apenas para SERVIDOR/PENDENTE após verificar e-mail, e é negada se tentar SERVIDOR/APROVADO", async () => {
      const uid = "serv_legacy_intruso_aprovado";
      const email = "docente.novo@ifpr.edu.br";
      await setupUserDoc(uid, {
        id: uid,
        email,
        name: "Docente Novo",
        role: "INTRUSO",
        approvalStatus: "APROVADO",
        status: "active",
      });

      const db = testEnv.authenticatedContext(uid, {
        email,
        email_verified: true,
      }).firestore();

      // Auto-promoção direta para APROVADO deve continuar negada
      await assertFails(
        setDoc(
          doc(db, "users", uid),
          {
            id: uid,
            email,
            name: "Docente Novo",
            role: "SERVIDOR",
            approvalStatus: "APROVADO",
            status: "active",
          },
          { merge: true }
        )
      );

      // Transição segura para SERVIDOR PENDENTE deve ser aceita para posterior aprovação administrativa
      await assertSucceeds(
        setDoc(
          doc(db, "users", uid),
          {
            id: uid,
            email,
            name: "Docente Novo",
            role: "SERVIDOR",
            approvalStatus: "PENDENTE",
            status: "active",
          },
          { merge: true }
        )
      );
    });
  });

  describe("Collection /users — Profile Creation and Email Casing Rules", () => {
    it("7. Criação de perfil ALUNO com e-mail institucional em minúsculas (assertSucceeds)", async () => {
      const uid = "aluno_lower_1";
      const email = "20251iva10030008@estudantes.ifpr.edu.br";
      const db = testEnv.authenticatedContext(uid, {
        email,
        email_verified: true,
      }).firestore();

      const userDocRef = doc(db, "users", uid);
      await assertSucceeds(
        setDoc(userDocRef, {
          id: uid,
          email,
          name: "Estudante Minúsculas",
          role: "ALUNO",
          status: "active",
          approvalStatus: "APROVADO",
          createdAt: new Date().toISOString(),
        })
      );
    });

    it("8. Criação de perfil ALUNO com token contendo maiúsculas e payload em minúsculas (assertSucceeds)", async () => {
      const uid = "aluno_upper_token";
      const tokenEmail = "20251IVA10030008@ESTUDANTES.IFPR.EDU.BR";
      const payloadEmail = "20251iva10030008@estudantes.ifpr.edu.br";

      const db = testEnv.authenticatedContext(uid, {
        email: tokenEmail,
        email_verified: true,
      }).firestore();

      const userDocRef = doc(db, "users", uid);
      await assertSucceeds(
        setDoc(userDocRef, {
          id: uid,
          email: payloadEmail,
          name: "Estudante Token Maiúsculas",
          role: "ALUNO",
          status: "active",
          approvalStatus: "APROVADO",
          createdAt: new Date().toISOString(),
        })
      );
    });

    it("9. Login de aluno com perfil já existente: leitura direta de perfil próprio permitida (assertSucceeds)", async () => {
      const uid = "aluno_login_existente";
      const email = "aluno.existente@estudantes.ifpr.edu.br";

      await setupUserDoc(uid, {
        id: uid,
        email,
        name: "Estudante Existente",
        role: "ALUNO",
        status: "active",
        approvalStatus: "APROVADO",
      });

      const db = testEnv.authenticatedContext(uid, {
        email,
        email_verified: true,
      }).firestore();

      const docSnap = await assertSucceeds(getDoc(doc(db, "users", uid)));
      expect(docSnap.exists()).toBe(true);
      expect(docSnap.data()?.status).toBe("active");
    });
  });

  describe("Collection /claims — Lifecycle, Queries and RBAC Verification", () => {
    const validItemId = "item_valido_claims";

    beforeEach(async () => {
      // Semeia item válido no catálogo para permitir reivindicações legítimas
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, "items", validItemId), {
          id: validItemId,
          title: "Estojo com Canetas",
          description: "Estojo azul marinho",
          category: "Outros",
          location: "Secretaria",
          status: "ENCONTRADO",
          registeredByUserId: "serv_seed",
          registeredByRole: "SERVIDOR",
          createdAt: new Date().toISOString(),
        });
      });
    });

    it("10. Consulta das próprias reivindicações filtrada por claimerId por ALUNO ativo (assertSucceeds)", async () => {
      const uid = "aluno_claims_query";
      const email = "aluno.query@estudantes.ifpr.edu.br";

      await setupUserDoc(uid, {
        id: uid,
        email,
        role: "ALUNO",
        status: "active",
        approvalStatus: "APROVADO",
      });

      const db = testEnv.authenticatedContext(uid, {
        email,
        email_verified: true,
      }).firestore();

      const q = query(collection(db, "claims"), where("claimerId", "==", uid));
      const snapshot = await assertSucceeds(getDocs(q));
      expect(snapshot.size).toBe(0);
    });

    it("11. Criação de reivindicação válida por ALUNO com ID determinístico e item existente (assertSucceeds)", async () => {
      const uid = "aluno_claim_create";
      const email = "20251iva10030008@estudantes.ifpr.edu.br";

      await setupUserDoc(uid, {
        id: uid,
        email,
        role: "ALUNO",
        status: "active",
        approvalStatus: "APROVADO",
      });

      const db = testEnv.authenticatedContext(uid, {
        email,
        email_verified: true,
      }).firestore();

      const claimId = `claim_${uid}_${validItemId}`;
      const claimRef = doc(db, "claims", claimId);

      await assertSucceeds(
        setDoc(claimRef, {
          id: claimId,
          itemId: validItemId,
          itemTitle: "Estojo com Canetas",
          itemCategory: "Outros",
          itemLocation: "Secretaria",
          claimerId: uid,
          claimerName: "Aluno Solicitante",
          claimerEmail: email,
          claimerRole: "ALUNO",
          distinctiveFeatures: "Zíper metálico prateado com chaveiro azul",
          additionalInfo: "Perdido na quinta-feira passada",
          status: "PENDENTE",
          createdAt: new Date().toISOString(),
        })
      );
    });

    it("12. Tentativa de consulta global sem cláusula where em /claims por ALUNO é barrada (assertFails)", async () => {
      const uid = "aluno_global_read";
      const email = "aluno.global@estudantes.ifpr.edu.br";

      await setupUserDoc(uid, {
        id: uid,
        email,
        role: "ALUNO",
        status: "active",
        approvalStatus: "APROVADO",
      });

      const db = testEnv.authenticatedContext(uid, {
        email,
        email_verified: true,
      }).firestore();

      // Consulta sem filtro viola 'allow list'
      await assertFails(getDocs(collection(db, "claims")));
    });

    it("13. Tentativa de cadastro de objeto por ALUNO na coleção restrita /items é barrada (assertFails)", async () => {
      const uid = "aluno_unauth_item";
      const email = "aluno.item@estudantes.ifpr.edu.br";

      await setupUserDoc(uid, {
        id: uid,
        email,
        role: "ALUNO",
        status: "active",
        approvalStatus: "APROVADO",
      });

      const db = testEnv.authenticatedContext(uid, {
        email,
        email_verified: true,
      }).firestore();

      await assertFails(
        setDoc(doc(db, "items", "item_aluno_tentativa"), {
          id: "item_aluno_tentativa",
          title: "Objeto Não Autorizado",
          description: "Tentativa de cadastro por aluno",
          category: "Outros",
          location: "Pátio",
          status: "ENCONTRADO",
          registeredByUserId: uid,
          registeredByRole: "ALUNO",
          createdAt: new Date().toISOString(),
        })
      );
    });

    it("14. Criação de reivindicação por INTRUSO (e-mail externo) é barrada (assertFails)", async () => {
      const uid = "intruso_claim_block";
      const email = "visitante@gmail.com";

      await setupUserDoc(uid, {
        id: uid,
        email,
        role: "INTRUSO",
        status: "active",
      });

      const db = testEnv.authenticatedContext(uid, {
        email,
        email_verified: true,
      }).firestore();

      const claimId = `claim_${uid}_${validItemId}`;
      await assertFails(
        setDoc(doc(db, "claims", claimId), {
          id: claimId,
          itemId: validItemId,
          itemTitle: "Estojo com Canetas",
          itemCategory: "Outros",
          itemLocation: "Secretaria",
          claimerId: uid,
          claimerName: "Visitante Externo",
          claimerEmail: email,
          claimerRole: "INTRUSO",
          distinctiveFeatures: "Pertence meu",
          status: "PENDENTE",
          createdAt: new Date().toISOString(),
        })
      );
    });

    it("15. SERVIDOR aprovado ativo consegue realizar consulta irrestrita em /claims (assertSucceeds)", async () => {
      const uid = "servidor_gestor_claims";
      const email = "servidor.gestor@ifpr.edu.br";

      await setupUserDoc(uid, {
        id: uid,
        email,
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "active",
      });

      const db = testEnv.authenticatedContext(uid, {
        email,
        email_verified: true,
      }).firestore();

      const snapshot = await assertSucceeds(getDocs(collection(db, "claims")));
      expect(snapshot).toBeDefined();
    });

    it("16. Administrador com perfil ADMIN aprovado no Firestore mantém acesso de consulta em /claims via isDocAdmin (assertSucceeds)", async () => {
      // NOTA DE AUDITORIA v1.10.11: Este teste exercita o acesso de um ADMIN aprovado via perfil Firestore (isDocAdmin).
      // O UID 'admin_root_claims' é um identificador de fixture que NÃO possui privilégios de Root Admin (isRootAdmin),
      // pois o Root Admin exige estritamente UID Pinning ('hCG5mDgK1fRaTojULzlM7dXvb7n2').
      const uid = "admin_root_claims";
      const email = "paulocauan39@gmail.com";

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, "system_config", "root_admin"), {
          rootAdminUid: uid,
        });
        await setDoc(doc(db, "users", uid), {
          id: uid,
          email,
          role: "ADMIN",
          status: "active",
          approvalStatus: "APROVADO",
        });
      });

      const db = testEnv.authenticatedContext(uid, {
        email,
        email_verified: true,
      }).firestore();

      const snapshot = await assertSucceeds(getDocs(collection(db, "claims")));
      expect(snapshot).toBeDefined();
    });
  });

  describe("Collection /users — Legacy Profile Recovery and Security Hardening", () => {
    it("17. ALUNO legado sem status consegue recuperar somente o próprio status (assertSucceeds)", async () => {
      const uid = "aluno_legado_1";
      const email = "aluno.legado@estudantes.ifpr.edu.br";

      await setupUserDoc(uid, {
        id: uid,
        email,
        name: "Aluno Legado",
        role: "ALUNO",
        approvalStatus: "APROVADO",
        // status omitido propositalmente
      });

      const db = testEnv.authenticatedContext(uid, {
        email,
        email_verified: true,
      }).firestore();

      const userRef = doc(db, "users", uid);
      await assertSucceeds(
        setDoc(
          userRef,
          {
            id: uid,
            email,
            name: "Aluno Legado",
            role: "ALUNO",
            approvalStatus: "APROVADO",
            status: "active",
          },
          { merge: true }
        )
      );
    });

    it("18. SERVIDOR legado sem status consegue recuperar somente o próprio status (assertSucceeds)", async () => {
      const uid = "serv_legado_1";
      const email = "servidor.legado@ifpr.edu.br";

      await setupUserDoc(uid, {
        id: uid,
        email,
        name: "Servidor Legado",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        // status omitido
      });

      const db = testEnv.authenticatedContext(uid, {
        email,
        email_verified: true,
      }).firestore();

      const userRef = doc(db, "users", uid);
      await assertSucceeds(
        setDoc(
          userRef,
          {
            id: uid,
            email,
            name: "Servidor Legado",
            role: "SERVIDOR",
            approvalStatus: "APROVADO",
            status: "active",
          },
          { merge: true }
        )
      );
    });

    it("19. ALUNO legado NÃO consegue alterar role durante a recuperação (assertFails)", async () => {
      const uid = "aluno_legado_spoof_role";
      const email = "aluno.spoof@estudantes.ifpr.edu.br";

      await setupUserDoc(uid, {
        id: uid,
        email,
        name: "Aluno Spoof",
        role: "ALUNO",
        approvalStatus: "APROVADO",
      });

      const db = testEnv.authenticatedContext(uid, {
        email,
        email_verified: true,
      }).firestore();

      const userRef = doc(db, "users", uid);
      await assertFails(
        setDoc(
          userRef,
          {
            id: uid,
            email,
            role: "ADMIN", // Tentativa ilegal de escalonamento
            status: "active",
          },
          { merge: true }
        )
      );
    });

    it("20. ALUNO legado NÃO consegue alterar email durante a recuperação (assertFails)", async () => {
      const uid = "aluno_legado_spoof_email";
      const email = "aluno.email@estudantes.ifpr.edu.br";

      await setupUserDoc(uid, {
        id: uid,
        email,
        name: "Aluno Email",
        role: "ALUNO",
        approvalStatus: "APROVADO",
      });

      const db = testEnv.authenticatedContext(uid, {
        email,
        email_verified: true,
      }).firestore();

      const userRef = doc(db, "users", uid);
      await assertFails(
        setDoc(
          userRef,
          {
            id: uid,
            email: "outro.email@estudantes.ifpr.edu.br",
            role: "ALUNO",
            status: "active",
          },
          { merge: true }
        )
      );
    });

    it("21. ALUNO com status: null NÃO recebe recuperação automática (assertFails)", async () => {
      const uid = "aluno_status_null";
      const email = "aluno.null@estudantes.ifpr.edu.br";

      await setupUserDoc(uid, {
        id: uid,
        email,
        role: "ALUNO",
        status: null,
      });

      const db = testEnv.authenticatedContext(uid, {
        email,
        email_verified: true,
      }).firestore();

      const userRef = doc(db, "users", uid);
      await assertFails(
        setDoc(
          userRef,
          {
            status: "active",
          },
          { merge: true }
        )
      );
    });

    it("22. ALUNO suspenso NÃO consegue recuperar acesso (assertFails)", async () => {
      const uid = "aluno_suspenso";
      const email = "aluno.suspenso@estudantes.ifpr.edu.br";

      await setupUserDoc(uid, {
        id: uid,
        email,
        role: "ALUNO",
        status: "suspended",
        suspendedUntil: Date.now() + 1000000,
      });

      const db = testEnv.authenticatedContext(uid, {
        email,
        email_verified: true,
      }).firestore();

      const userRef = doc(db, "users", uid);
      await assertFails(
        setDoc(
          userRef,
          {
            status: "active",
          },
          { merge: true }
        )
      );
    });

    it("23. INTRUSO NÃO pode utilizar a recuperação de perfil legado (assertFails)", async () => {
      const uid = "intruso_legado";
      const email = "visitante@gmail.com";

      await setupUserDoc(uid, {
        id: uid,
        email,
        role: "INTRUSO",
        // status ausente
      });

      const db = testEnv.authenticatedContext(uid, {
        email,
        email_verified: true,
      }).firestore();

      const userRef = doc(db, "users", uid);
      await assertFails(
        setDoc(
          userRef,
          {
            role: "ALUNO",
            status: "active",
          },
          { merge: true }
        )
      );
    });

    it("24. Usuário NÃO consegue recuperar o documento de outra pessoa (assertFails)", async () => {
      const uidVictim = "victim_user";
      const uidAttacker = "attacker_user";
      const email = "atacante@estudantes.ifpr.edu.br";

      await setupUserDoc(uidVictim, {
        id: uidVictim,
        email: "vitima@estudantes.ifpr.edu.br",
        role: "ALUNO",
      });

      const db = testEnv.authenticatedContext(uidAttacker, {
        email,
        email_verified: true,
      }).firestore();

      const userRef = doc(db, "users", uidVictim);
      await assertFails(
        setDoc(
          userRef,
          {
            status: "active",
          },
          { merge: true }
        )
      );
    });

    it("25. Contas legadas com e-mail incompatível com o token NÃO conseguem recuperar perfil (assertFails)", async () => {
      const uid = "aluno_mismatch_email";
      const storedEmail = "aluno1@estudantes.ifpr.edu.br";
      const tokenEmail = "aluno2@estudantes.ifpr.edu.br";

      await setupUserDoc(uid, {
        id: uid,
        email: storedEmail,
        role: "ALUNO",
      });

      const db = testEnv.authenticatedContext(uid, {
        email: tokenEmail,
        email_verified: true,
      }).firestore();

      const userRef = doc(db, "users", uid);
      await assertFails(
        setDoc(
          userRef,
          {
            status: "active",
          },
          { merge: true }
        )
      );
    });
  });

  describe("Root Admin vs Administrador Comum — Validação Real de Privilégios no Emulator", () => {
    const targetUserId = "servidor_para_promocao";

    beforeEach(async () => {
      // Semeia usuário SERVIDOR ativo e aprovado para testes de promoção
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, "users", targetUserId), {
          id: targetUserId,
          email: "servidor.candidato@ifpr.edu.br",
          name: "Servidor Candidato",
          role: "SERVIDOR",
          approvalStatus: "APROVADO",
          status: "active",
        });
      });
    });

    it("26. Root Admin legítimo (UID hCG5mDgK1fRaTojULzlM7dXvb7n2, e-mail paulocauan39@gmail.com, email_verified) executa operação exclusiva de promover usuário para ADMIN (assertSucceeds)", async () => {
      const rootAdminUid = "hCG5mDgK1fRaTojULzlM7dXvb7n2";
      const rootAdminEmail = "paulocauan39@gmail.com";

      const db = testEnv.authenticatedContext(rootAdminUid, {
        email: rootAdminEmail,
        email_verified: true,
      }).firestore();

      const targetDocRef = doc(db, "users", targetUserId);
      await assertSucceeds(
        updateDoc(targetDocRef, {
          role: "ADMIN",
        })
      );
    });

    it("27. Atacante com mesmo e-mail de Root Admin mas UID divergente NÃO consegue promover usuário para ADMIN (assertFails)", async () => {
      const spoofUid = "outro_uid_atacante_qualquer";
      const rootAdminEmail = "paulocauan39@gmail.com";

      const db = testEnv.authenticatedContext(spoofUid, {
        email: rootAdminEmail,
        email_verified: true,
      }).firestore();

      const targetDocRef = doc(db, "users", targetUserId);
      await assertFails(
        updateDoc(targetDocRef, {
          role: "ADMIN",
        })
      );
    });

    it("28. Usuário com UID oficial de Root Admin mas e-mail diferente NÃO consegue promover usuário para ADMIN (assertFails)", async () => {
      const rootAdminUid = "hCG5mDgK1fRaTojULzlM7dXvb7n2";
      const wrongEmail = "atacante.externo@gmail.com";

      const db = testEnv.authenticatedContext(rootAdminUid, {
        email: wrongEmail,
        email_verified: true,
      }).firestore();

      const targetDocRef = doc(db, "users", targetUserId);
      await assertFails(
        updateDoc(targetDocRef, {
          role: "ADMIN",
        })
      );
    });

    it("29. Root Admin com UID e e-mail corretos mas e-mail NÃO verificado NÃO consegue promover usuário para ADMIN (assertFails)", async () => {
      const rootAdminUid = "hCG5mDgK1fRaTojULzlM7dXvb7n2";
      const rootAdminEmail = "paulocauan39@gmail.com";

      const db = testEnv.authenticatedContext(rootAdminUid, {
        email: rootAdminEmail,
        email_verified: false,
      }).firestore();

      const targetDocRef = doc(db, "users", targetUserId);
      await assertFails(
        updateDoc(targetDocRef, {
          role: "ADMIN",
        })
      );
    });

    it("30. Fixture de teste admin_root_claims com perfil ADMIN aprovado NÃO obtém privilégios exclusivos de Root Admin para promover a ADMIN (assertFails)", async () => {
      const fixtureUid = "admin_root_claims";
      const rootAdminEmail = "paulocauan39@gmail.com";

      // Concede perfil ADMIN aprovado para a fixture
      await setupUserDoc(fixtureUid, {
        id: fixtureUid,
        email: rootAdminEmail,
        role: "ADMIN",
        approvalStatus: "APROVADO",
        status: "active",
      });

      const db = testEnv.authenticatedContext(fixtureUid, {
        email: rootAdminEmail,
        email_verified: true,
      }).firestore();

      const targetDocRef = doc(db, "users", targetUserId);
      // Tentativa de promover usuário SERVIDOR para ADMIN deve falhar por falta de isRootAdmin()
      await assertFails(
        updateDoc(targetDocRef, {
          role: "ADMIN",
        })
      );
    });

    it("31. Administrador comum aprovado executa operações administrativas normais mas é negado em promoção a ADMIN (assertSucceeds em operação comum, assertFails em promoção a ADMIN)", async () => {
      const regularAdminUid = "admin_comum_institucional";
      const regularAdminEmail = "admin.comum@ifpr.edu.br";

      await setupUserDoc(regularAdminUid, {
        id: regularAdminUid,
        email: regularAdminEmail,
        role: "ADMIN",
        approvalStatus: "APROVADO",
        status: "active",
      });

      const db = testEnv.authenticatedContext(regularAdminUid, {
        email: regularAdminEmail,
        email_verified: true,
      }).firestore();

      const targetDocRef = doc(db, "users", targetUserId);

      // Operação administrativa comum permitida (ex: alterar status para suspenso ou atualizar campos não-críticos)
      await assertSucceeds(
        updateDoc(targetDocRef, {
          department: "DIPEX",
        })
      );

      // Operação exclusiva de Root Admin negada: promover para ADMIN
      await assertFails(
        updateDoc(targetDocRef, {
          role: "ADMIN",
        })
      );
    });
  });

  describe("Collection /items — Etapa 11 Devolution Security Rules (Update & Create)", () => {
    const setupItemDoc = async (collectionName: string, itemId: string, data: Record<string, any>) => {
      await testEnv!.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, collectionName, itemId), data);
      });
    };

    const seedActors = async () => {
      await setupUserDoc("aluno_1", {
        id: "aluno_1",
        email: "aluno1@ifpr.edu.br",
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "active",
      });
      await setupUserDoc("aluno_autor", {
        id: "aluno_autor",
        email: "aluno.autor@ifpr.edu.br",
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "active",
      });
      await setupUserDoc("servidor_apr", {
        id: "servidor_apr",
        email: "servidor.apr@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "active",
      });
      await setupUserDoc("servidor_pend", {
        id: "servidor_pend",
        email: "servidor.pend@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "PENDENTE",
        status: "active",
      });
      await setupUserDoc("servidor_susp", {
        id: "servidor_susp",
        email: "servidor.susp@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "suspended",
      });
      await setupUserDoc("admin_apr", {
        id: "admin_apr",
        email: "admin.apr@ifpr.edu.br",
        role: "ADMIN",
        approvalStatus: "APROVADO",
        status: "active",
      });
    };

    beforeEach(async () => {
      await seedActors();
    });

    it("32. ALUNO autor edita metadados seguros de item PERDIDO (assertSucceeds), mas FALHA ao tentar alterar status para DEVOLVIDO ou ENCONTRADO", async () => {
      await setupItemDoc("items", "item_aluno_1", {
        id: "item_aluno_1",
        title: "Caderno Azul",
        description: "Caderno perdido no bloco B",
        category: "Documentos",
        location: "Bloco B",
        status: "PERDIDO",
        registeredByUserId: "aluno_autor",
        registeredByRole: "ALUNO",
        createdAt: new Date().toISOString(),
      });

      const db = testEnv!.authenticatedContext("aluno_autor", {
        email: "aluno.autor@ifpr.edu.br",
        email_verified: true,
      }).firestore();

      const itemRef = doc(db, "items", "item_aluno_1");
      await assertSucceeds(
        updateDoc(itemRef, {
          description: "Caderno azul capa dura com adesivo",
          location: "Bloco B - Sala 102",
        })
      );

      await assertFails(
        updateDoc(itemRef, {
          status: "DEVOLVIDO",
        })
      );

      await assertFails(
        updateDoc(itemRef, {
          status: "ENCONTRADO",
        })
      );
    });

    it("33. ALUNO autor FALHA ao editar até metadados comuns quando o item já está DEVOLVIDO", async () => {
      await setupItemDoc("items", "item_aluno_devolvido", {
        id: "item_aluno_devolvido",
        title: "Guarda-chuva",
        description: "Preto",
        category: "Outros",
        location: "Cantina",
        status: "DEVOLVIDO",
        registeredByUserId: "aluno_autor",
        registeredByRole: "ALUNO",
        returnedByUserId: "servidor_apr",
        receiptValidationCode: "REC-TEST01",
        recipientSignatureStatus: "SIGNED",
        createdAt: new Date().toISOString(),
      });

      const db = testEnv!.authenticatedContext("aluno_autor", {
        email: "aluno.autor@ifpr.edu.br",
        email_verified: true,
      }).firestore();

      await assertFails(
        updateDoc(doc(db, "items", "item_aluno_devolvido"), {
          description: "Tentativa de edição após devolução",
        })
      );
    });

    it("34. SERVIDOR aprovado transita ENCONTRADO -> EM_ANALISE (assertSucceeds), mas FALHA ao tentar marcar DEVOLVIDO diretamente", async () => {
      await setupItemDoc("items", "item_srv_1", {
        id: "item_srv_1",
        title: "Pendrive Kingston",
        description: "32GB preto",
        category: "Eletrônicos",
        location: "Lab 01",
        status: "ENCONTRADO",
        registeredByUserId: "servidor_apr",
        registeredByRole: "SERVIDOR",
        createdAt: new Date().toISOString(),
      });

      const db = testEnv!.authenticatedContext("servidor_apr", {
        email: "servidor.apr@ifpr.edu.br",
        email_verified: true,
      }).firestore();

      const itemRef = doc(db, "items", "item_srv_1");
      await assertSucceeds(
        updateDoc(itemRef, {
          status: "EM_ANALISE",
        })
      );

      await assertFails(
        updateDoc(itemRef, {
          status: "DEVOLVIDO",
        })
      );
    });

    it("35. ADMIN aprovado também FALHA ao tentar gravar DEVOLVIDO ou campos formais de devolução diretamente pelo cliente", async () => {
      await setupItemDoc("items", "item_adm_bypass", {
        id: "item_adm_bypass",
        title: "Fone Bluetooth",
        description: "Case branca",
        category: "Eletrônicos",
        location: "Biblioteca",
        status: "ENCONTRADO",
        registeredByUserId: "servidor_apr",
        registeredByRole: "SERVIDOR",
        createdAt: new Date().toISOString(),
      });

      const db = testEnv!.authenticatedContext("admin_apr", {
        email: "admin.apr@ifpr.edu.br",
        email_verified: true,
      }).firestore();

      const itemRef = doc(db, "items", "item_adm_bypass");
      await assertFails(
        updateDoc(itemRef, {
          status: "DEVOLVIDO",
          returnedByUserId: "admin_apr",
          receiptValidationCode: "REC-FORGED",
          recipientSignatureStatus: "SIGNED",
        })
      );

      await assertFails(
        updateDoc(itemRef, {
          receiptValidationCode: "REC-FORGED",
        })
      );
    });

    it("36. SERVIDOR pendente ou suspenso FALHA ao alterar status de item", async () => {
      await setupItemDoc("items", "item_srv_pend", {
        id: "item_srv_pend",
        title: "Garrafa Térmica",
        description: "Verde",
        category: "Outros",
        location: "Quadra",
        status: "ENCONTRADO",
        registeredByUserId: "servidor_apr",
        registeredByRole: "SERVIDOR",
        createdAt: new Date().toISOString(),
      });

      const dbPend = testEnv!.authenticatedContext("servidor_pend", {
        email: "servidor.pend@ifpr.edu.br",
        email_verified: true,
      }).firestore();

      await assertFails(
        updateDoc(doc(dbPend, "items", "item_srv_pend"), {
          status: "EM_ANALISE",
        })
      );

      const dbSusp = testEnv!.authenticatedContext("servidor_susp", {
        email: "servidor.susp@ifpr.edu.br",
        email_verified: true,
      }).firestore();

      await assertFails(
        updateDoc(doc(dbSusp, "items", "item_srv_pend"), {
          status: "EM_ANALISE",
        })
      );
    });

    it("37. SERVIDOR aprovado FALHA ao tentar editar ou reverter item já DEVOLVIDO ou ENCERRADO via cliente", async () => {
      await setupItemDoc("items", "item_ja_devolvido", {
        id: "item_ja_devolvido",
        title: "Chave de Carro",
        description: "Com chaveiro IFPR",
        category: "Chaves",
        location: "Estacionamento",
        status: "DEVOLVIDO",
        registeredByUserId: "servidor_apr",
        registeredByRole: "SERVIDOR",
        returnedByUserId: "servidor_apr",
        receiptValidationCode: "REC-REAL01",
        recipientSignatureStatus: "SIGNED",
        createdAt: new Date().toISOString(),
      });

      const db = testEnv!.authenticatedContext("servidor_apr", {
        email: "servidor.apr@ifpr.edu.br",
        email_verified: true,
      }).firestore();

      await assertFails(
        updateDoc(doc(db, "items", "item_ja_devolvido"), {
          status: "ENCONTRADO",
        })
      );

      await assertFails(
        updateDoc(doc(db, "items", "item_ja_devolvido"), {
          staffSignatureStatus: "STAFF_SIGNED",
        })
      );
    });

    it("38. Criação direta em /items, /found_items ou /lost_items com status DEVOLVIDO ou campos de devolução é negada (assertFails)", async () => {
      const db = testEnv!.authenticatedContext("servidor_apr", {
        email: "servidor.apr@ifpr.edu.br",
        email_verified: true,
      }).firestore();

      for (const col of ["items", "found_items", "lost_items"]) {
        await assertFails(
          setDoc(doc(db, col, `item_create_dev_${col}`), {
            id: `item_create_dev_${col}`,
            title: "Item Forjado",
            description: "Criado já devolvido",
            category: "Outros",
            location: "Bloco A",
            status: "DEVOLVIDO",
            registeredByUserId: "servidor_apr",
            registeredByRole: "SERVIDOR",
            createdAt: new Date().toISOString(),
          })
        );

        await assertFails(
          setDoc(doc(db, col, `item_create_field_${col}`), {
            id: `item_create_field_${col}`,
            title: "Item Com Campo Protegido",
            description: "Tentativa de injetar código de recibo",
            category: "Outros",
            location: "Bloco A",
            status: "ENCONTRADO",
            receiptValidationCode: "REC-FAKE",
            registeredByUserId: "servidor_apr",
            registeredByRole: "SERVIDOR",
            createdAt: new Date().toISOString(),
          })
        );
      }
    });

    it("39. SERVIDOR aprovado encerra item como ENCERRADO somente quando destinationType e destinationReason estão preenchidos", async () => {
      await setupItemDoc("items", "item_enc_1", {
        id: "item_enc_1",
        title: "Casaco Moletom",
        description: "Cinza sem identificação",
        category: "Vestuário",
        location: "Auditório",
        status: "ENCONTRADO",
        registeredByUserId: "servidor_apr",
        registeredByRole: "SERVIDOR",
        createdAt: new Date().toISOString(),
      });

      const db = testEnv!.authenticatedContext("servidor_apr", {
        email: "servidor.apr@ifpr.edu.br",
        email_verified: true,
      }).firestore();

      const itemRef = doc(db, "items", "item_enc_1");

      await assertFails(
        updateDoc(itemRef, {
          status: "ENCERRADO",
          destinationType: "DOADO",
          destinationReason: "",
        })
      );

      await assertSucceeds(
        updateDoc(itemRef, {
          status: "ENCERRADO",
          destinationType: "DOADO",
          destinationReason: "Prazo institucional de 90 dias expirado conforme edital.",
        })
      );
    });

    it("40. Usuário com active: false no perfil FALHA ao tentar atualizar ou reivindicar itens (isAccountActive)", async () => {
      await setupUserDoc("serv_inactive", {
        id: "serv_inactive",
        email: "inativo@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "active",
        active: false,
      });
      await setupItemDoc("items", "item_active_guard", {
        id: "item_active_guard",
        title: "Caderno Espiral",
        description: "Capa azul",
        category: "Outros",
        location: "Bloco 1",
        status: "ENCONTRADO",
        registeredByUserId: "servidor_apr",
        registeredByRole: "SERVIDOR",
        createdAt: new Date().toISOString(),
      });

      const dbInactive = testEnv!.authenticatedContext("serv_inactive", {
        email: "inativo@ifpr.edu.br",
        email_verified: true,
      }).firestore();

      await assertFails(
        updateDoc(doc(dbInactive, "items", "item_active_guard"), {
          status: "EM_ANALISE",
        })
      );
    });

    it("41. Mesmo ADMIN ou autor FALHA ao tentar excluir item com status DEVOLVIDO pelo cliente; leitura de signature_requests também falha", async () => {
      const { deleteDoc } = await import("firebase/firestore");
      await setupItemDoc("items", "item_del_guard", {
        id: "item_del_guard",
        title: "Mochila Preta",
        description: "Notebook dentro",
        category: "Mochilas",
        location: "Biblioteca",
        status: "DEVOLVIDO",
        registeredByUserId: "servidor_apr",
        registeredByRole: "SERVIDOR",
        createdAt: new Date().toISOString(),
      });

      const dbAdmin = testEnv!.authenticatedContext("admin_apr", {
        email: "admin.apr@ifpr.edu.br",
        email_verified: true,
      }).firestore();

      await assertFails(deleteDoc(doc(dbAdmin, "items", "item_del_guard")));
      await assertFails(getDoc(doc(dbAdmin, "signature_requests", "item_del_guard")));
    });

    it("42. Visitante não autenticado e ALUNO leem catálogo público higienizado (/items sem PII), mas FALHAM se o documento contiver campos privados de devolução", async () => {
      await setupItemDoc("items", "item_public_clean", {
        id: "item_public_clean",
        title: "Garrafa Azul",
        description: "Garrafa térmica sem dados pessoais",
        category: "Outros",
        location: "Biblioteca",
        status: "DEVOLVIDO",
        registeredByUserId: "servidor_apr",
        registeredByRole: "SERVIDOR",
        createdAt: new Date().toISOString(),
      });

      await setupItemDoc("items", "item_unsanitized_pii", {
        id: "item_unsanitized_pii",
        title: "Carteira com PII",
        description: "Item legado com dados pessoais no doc público",
        category: "Documentos",
        location: "Portaria",
        status: "DEVOLVIDO",
        recipientName: "Maria Aluna",
        recipientEmail: "maria@estudantes.ifpr.edu.br",
        recipientDocument: "12345678900",
        recipientSignatureUrl: "data:image/png;base64,AAA",
        receiptValidationCode: "COMP-IFPR-999999",
        registeredByUserId: "servidor_apr",
        registeredByRole: "SERVIDOR",
        createdAt: new Date().toISOString(),
      });

      const unauthDb = testEnv!.unauthenticatedContext().firestore();
      const alunoDb = testEnv!.authenticatedContext("aluno_1", {
        email: "aluno1@estudantes.ifpr.edu.br",
        email_verified: true,
      }).firestore();
      const servDb = testEnv!.authenticatedContext("servidor_apr", {
        email: "servidor.apr@ifpr.edu.br",
        email_verified: true,
      }).firestore();

      // Clean public projection is readable by visitor and student
      await assertSucceeds(getDoc(doc(unauthDb, "items", "item_public_clean")));
      await assertSucceeds(getDoc(doc(alunoDb, "items", "item_public_clean")));

      // Unsanitized doc with PII is blocked for visitor and student, allowed only for active staff/admin
      await assertFails(getDoc(doc(unauthDb, "items", "item_unsanitized_pii")));
      await assertFails(getDoc(doc(alunoDb, "items", "item_unsanitized_pii")));
      await assertSucceeds(getDoc(doc(servDb, "items", "item_unsanitized_pii")));
    });

    it("43. Coleção /item_return_records bloqueia visitante e outros alunos, permite get ao próprio recipientUid e get/list a SERVIDOR/ADMIN ativos, e nega escrita cliente", async () => {
      await testEnv!.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "item_return_records", "item_ret_1"), {
          itemId: "item_ret_1",
          recipientUid: "aluno_1",
          recipientName: "Aluno Um",
          recipientEmail: "aluno1@estudantes.ifpr.edu.br",
          recipientDocument: "2026111",
          recipientSignatureStatus: "SIGNED",
          receiptValidationCode: "COMP-IFPR-111222",
        });
      });

      await setupUserDoc("aluno_outro", {
        id: "aluno_outro",
        email: "outro@estudantes.ifpr.edu.br",
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "active",
      });

      const unauthDb = testEnv!.unauthenticatedContext().firestore();
      const ownerAlunoDb = testEnv!.authenticatedContext("aluno_1", {
        email: "aluno1@estudantes.ifpr.edu.br",
        email_verified: true,
      }).firestore();
      const otherAlunoDb = testEnv!.authenticatedContext("aluno_outro", {
        email: "outro@estudantes.ifpr.edu.br",
        email_verified: true,
      }).firestore();
      const servDb = testEnv!.authenticatedContext("servidor_apr", {
        email: "servidor.apr@ifpr.edu.br",
        email_verified: true,
      }).firestore();
      const adminDb = testEnv!.authenticatedContext("admin_apr", {
        email: "admin.apr@ifpr.edu.br",
        email_verified: true,
      }).firestore();

      await assertFails(getDoc(doc(unauthDb, "item_return_records", "item_ret_1")));
      await assertFails(getDoc(doc(otherAlunoDb, "item_return_records", "item_ret_1")));
      await assertFails(getDocs(collection(ownerAlunoDb, "item_return_records")));

      // Own recipientUid can get their own return record
      await assertSucceeds(getDoc(doc(ownerAlunoDb, "item_return_records", "item_ret_1")));

      // Active SERVIDOR and ADMIN can get and list
      await assertSucceeds(getDoc(doc(servDb, "item_return_records", "item_ret_1")));
      await assertSucceeds(getDocs(collection(servDb, "item_return_records")));
      await assertSucceeds(getDoc(doc(adminDb, "item_return_records", "item_ret_1")));

      // Client write is always denied
      await assertFails(
        setDoc(doc(adminDb, "item_return_records", "item_ret_1"), {
          recipientName: "Adulterado",
        })
      );
    });

    it("44. Coleções /audit_logs e /activity_logs permitem criação legítima por ADMIN/SERVIDOR ativos com identidade real e bloqueiam update/delete", async () => {
      const servDb = testEnv!.authenticatedContext("servidor_apr", {
        email: "servidor.apr@ifpr.edu.br",
        email_verified: true,
      }).firestore();
      const adminDb = testEnv!.authenticatedContext("admin_apr", {
        email: "admin.apr@ifpr.edu.br",
        email_verified: true,
      }).firestore();

      await assertSucceeds(
        setDoc(doc(servDb, "audit_logs", "audit_legit_serv_1"), {
          id: "audit_legit_serv_1",
          objectId: "item_1",
          objectType: "ITEM",
          action: "EDIT_OCORRENCIA",
          actorId: "servidor_apr",
          actorEmail: "servidor.apr@ifpr.edu.br",
          actorRole: "SERVIDOR",
          details: "Edição legítima de ocorrência por servidor.",
          timestamp: new Date().toISOString(),
        })
      );

      await assertSucceeds(
        setDoc(doc(adminDb, "activity_logs", "act_legit_admin_1"), {
          id: "act_legit_admin_1",
          adminId: "admin_apr",
          actorId: "admin_apr",
          actorEmail: "admin.apr@ifpr.edu.br",
          actorRole: "ADMIN",
          action: "CONFIGURACAO_SISTEMA",
          details: "Alteração legítima de texto institucional.",
          timestamp: new Date().toISOString(),
        })
      );

      // Immutability check
      await assertFails(
        updateDoc(doc(adminDb, "audit_logs", "audit_legit_serv_1"), {
          details: "Adulterado",
        })
      );
      await assertFails(deleteDoc(doc(adminDb, "activity_logs", "act_legit_admin_1")));
    });

    it("45. Client SDK (mesmo ADMIN ou SERVIDOR) NÃO pode forjar /audit_logs ou /activity_logs com ações exclusivas de backend", async () => {
      const servDb = testEnv!.authenticatedContext("servidor_apr", {
        email: "servidor.apr@ifpr.edu.br",
        email_verified: true,
      }).firestore();
      const adminDb = testEnv!.authenticatedContext("admin_apr", {
        email: "admin.apr@ifpr.edu.br",
        email_verified: true,
      }).firestore();

      const backendOnlyActions = [
        "REGISTRO_DEVOLUCAO",
        "REABERTURA_DEVOLUCAO",
        "CONFIRMACAO_NOTIFICACAO_ASSINATURA",
        "ROLE_ASSIGNED",
        "ROLE_REVOKED",
        "ACCOUNT_DELETED",
        "UPDATE_SYSTEM_CONFIG",
      ];

      for (const action of backendOnlyActions) {
        await assertFails(
          setDoc(doc(adminDb, "audit_logs", `forged_audit_${action}`), {
            id: `forged_audit_${action}`,
            objectId: "item_1",
            objectType: "RETURN",
            action,
            actorId: "admin_apr",
            actorEmail: "admin.apr@ifpr.edu.br",
            actorRole: "ADMIN",
            details: "Tentativa de forjar log de backend via Client SDK.",
            timestamp: new Date().toISOString(),
          })
        );

        await assertFails(
          setDoc(doc(servDb, "activity_logs", `forged_act_${action}`), {
            id: `forged_act_${action}`,
            adminId: "servidor_apr",
            actorId: "servidor_apr",
            actorEmail: "servidor.apr@ifpr.edu.br",
            actorRole: "SERVIDOR",
            action,
            details: "Tentativa de forjar atividade de backend via Client SDK.",
            timestamp: new Date().toISOString(),
          })
        );
      }

      // Empty/missing action must also fail
      await assertFails(
        setDoc(doc(adminDb, "activity_logs", "forged_act_empty"), {
          id: "forged_act_empty",
          adminId: "admin_apr",
          actorId: "admin_apr",
          actorEmail: "admin.apr@ifpr.edu.br",
          actorRole: "ADMIN",
          action: "",
          details: "Tentativa sem ação válida.",
          timestamp: new Date().toISOString(),
        })
      );
    });
  });

  describe("ETAPA 5 — Batch Completo de Cadastro (/items + /item_history + /item_private), Histórico Legado e Matriz de 7 Perfis", () => {
    const ROOT_UID = "hCG5mDgK1fRaTojULzlM7dXvb7n2";
    const ROOT_EMAIL = "paulocauan39@gmail.com";

    const runRegisterBatch = (db: any, uid: string, role: "ADMIN" | "SERVIDOR" | "ALUNO", suffix: string) => {
      const itemId = `item_batch_${suffix}`;
      const batch = writeBatch(db);
      batch.set(doc(db, "items", itemId), {
        id: itemId,
        title: `Objeto Teste ${suffix}`,
        description: "Descrição completa de teste",
        category: "Eletrônicos",
        location: "Bloco 1",
        status: "ENCONTRADO",
        type: "ENCONTRADO",
        registeredByUserId: uid,
        registeredByRole: role,
        createdAt: new Date().toISOString(),
      });
      batch.set(doc(db, "item_history", `hist-${itemId}-init`), {
        id: `hist-${itemId}-init`,
        itemId,
        objectId: itemId,
        action: "Ocorrência cadastrada",
        actorId: uid,
        actorRole: role,
        timestamp: new Date().toISOString(),
      });
      batch.set(doc(db, "item_private", itemId), {
        itemId,
        registeredByUserId: uid,
        secretVerificationHint: "Marca atrás do aparelho",
        updatedAt: new Date().toISOString(),
      });
      return batch.commit();
    };

    it("46. writeBatch completo (/items + /item_history + /item_private) para os 7 perfis (inclusive sem custom claims)", async () => {
      // 1. Root Admin sem custom claim
      await setupUserDoc(ROOT_UID, {
        id: ROOT_UID,
        email: ROOT_EMAIL,
        role: "ADMIN",
        approvalStatus: "APROVADO",
        status: "active",
      });
      const dbRootNoClaim = testEnv!.authenticatedContext(ROOT_UID, {
        email: ROOT_EMAIL,
        email_verified: true,
      }).firestore();
      await assertSucceeds(runRegisterBatch(dbRootNoClaim, ROOT_UID, "ADMIN", "root_noclaim"));

      // 2. ADMIN não-root aprovado sem custom claim
      const adminNoClaimUid = "admin_nonroot_noclaim";
      await setupUserDoc(adminNoClaimUid, {
        id: adminNoClaimUid,
        email: "admin.noclaim@gmail.com",
        role: "ADMIN",
        approvalStatus: "APROVADO",
        status: "active",
      });
      const dbAdminNoClaim = testEnv!.authenticatedContext(adminNoClaimUid, {
        email: "admin.noclaim@gmail.com",
        email_verified: true,
      }).firestore();
      await assertSucceeds(runRegisterBatch(dbAdminNoClaim, adminNoClaimUid, "ADMIN", "admin_noclaim"));

      // 3. SERVIDOR institucional aprovado (@ifpr.edu.br)
      const servInstUid = "serv_inst_ok";
      await setupUserDoc(servInstUid, {
        id: servInstUid,
        email: "tae.campus@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "active",
      });
      const dbServInst = testEnv!.authenticatedContext(servInstUid, {
        email: "tae.campus@ifpr.edu.br",
        email_verified: true,
      }).firestore();
      await assertSucceeds(runRegisterBatch(dbServInst, servInstUid, "SERVIDOR", "serv_inst"));

      // 4. SERVIDOR Gmail atribuído por admin aprovado
      const servGmailUid = "serv_gmail_ok";
      await setupUserDoc(servGmailUid, {
        id: servGmailUid,
        email: "servidor.atribuido@gmail.com",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "active",
        roleAssignedBy: ROOT_EMAIL,
      });
      const dbServGmail = testEnv!.authenticatedContext(servGmailUid, {
        email: "servidor.atribuido@gmail.com",
        email_verified: true,
      }).firestore();
      await assertSucceeds(runRegisterBatch(dbServGmail, servGmailUid, "SERVIDOR", "serv_gmail"));

      // 5. SERVIDOR PENDENTE -> negado
      const servPendUid = "serv_pend_batch";
      await setupUserDoc(servPendUid, {
        id: servPendUid,
        email: "servidor.pend@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "PENDENTE",
        status: "active",
      });
      const dbServPend = testEnv!.authenticatedContext(servPendUid, {
        email: "servidor.pend@ifpr.edu.br",
        email_verified: true,
      }).firestore();
      await assertFails(runRegisterBatch(dbServPend, servPendUid, "SERVIDOR", "serv_pend"));

      // 6. ALUNO -> negado
      const alunoUid = "aluno_batch";
      await setupUserDoc(alunoUid, {
        id: alunoUid,
        email: "aluno@estudantes.ifpr.edu.br",
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "active",
      });
      const dbAluno = testEnv!.authenticatedContext(alunoUid, {
        email: "aluno@estudantes.ifpr.edu.br",
        email_verified: true,
      }).firestore();
      await assertFails(runRegisterBatch(dbAluno, alunoUid, "ALUNO", "aluno"));

      // 7. INTRUSO -> negado
      const intrusoUid = "intruso_batch";
      await setupUserDoc(intrusoUid, {
        id: intrusoUid,
        email: "externo.intruso@gmail.com",
        role: "INTRUSO",
        approvalStatus: "PENDENTE",
        status: "active",
      });
      const dbIntruso = testEnv!.authenticatedContext(intrusoUid, {
        email: "externo.intruso@gmail.com",
        email_verified: true,
      }).firestore();
      await assertFails(runRegisterBatch(dbIntruso, intrusoUid, "SERVIDOR", "intruso"));
    });

    it("47. Leitura de /item_history com documento legado protegido, /item_private e /item_return_records", async () => {
      await testEnv!.withSecurityRulesDisabled(async (ctx) => {
        const adminSeed = ctx.firestore();
        await setDoc(doc(adminSeed, "users", ROOT_UID), {
          id: ROOT_UID,
          email: ROOT_EMAIL,
          role: "ADMIN",
          approvalStatus: "APROVADO",
          status: "active",
        });
        await setDoc(doc(adminSeed, "users", "admin_ok"), {
          id: "admin_ok",
          email: "admin.ok@gmail.com",
          role: "ADMIN",
          approvalStatus: "APROVADO",
          status: "active",
        });
        await setDoc(doc(adminSeed, "users", "serv_inst"), {
          id: "serv_inst",
          email: "serv@ifpr.edu.br",
          role: "SERVIDOR",
          approvalStatus: "APROVADO",
          status: "active",
        });
        await setDoc(doc(adminSeed, "users", "serv_gmail"), {
          id: "serv_gmail",
          email: "serv.gmail@gmail.com",
          role: "SERVIDOR",
          approvalStatus: "APROVADO",
          status: "active",
        });
        await setDoc(doc(adminSeed, "users", "serv_pend"), {
          id: "serv_pend",
          email: "pend@ifpr.edu.br",
          role: "SERVIDOR",
          approvalStatus: "PENDENTE",
          status: "active",
        });
        await setDoc(doc(adminSeed, "users", "aluno_ok"), {
          id: "aluno_ok",
          email: "aluno@estudantes.ifpr.edu.br",
          role: "ALUNO",
          approvalStatus: "APROVADO",
          status: "active",
        });
        await setDoc(doc(adminSeed, "users", "intruso_ok"), {
          id: "intruso_ok",
          email: "intruso@gmail.com",
          role: "INTRUSO",
          approvalStatus: "PENDENTE",
          status: "active",
        });

        // Documento legado em /item_history contendo campo protegido (recipientName)
        await setDoc(doc(adminSeed, "item_history", "hist_legado_pii"), {
          id: "hist_legado_pii",
          itemId: "item_1",
          objectId: "item_1",
          action: "DEVOLUCAO",
          actorId: "serv_inst",
          recipientName: "Nome Legado Protegido",
          timestamp: new Date().toISOString(),
        });
        // Documento público limpo em /item_history sem campos privados/PII
        await setDoc(doc(adminSeed, "item_history", "hist_publico_limpo"), {
          id: "hist_publico_limpo",
          itemId: "item_1",
          objectId: "item_1",
          action: "CADASTRO",
          actorId: "serv_inst",
          actorRole: "SERVIDOR",
          details: "Objeto catalogado na secretaria",
          timestamp: new Date().toISOString(),
        });
        await setDoc(doc(adminSeed, "item_private", "item_1"), {
          itemId: "item_1",
          registeredByUserId: "serv_inst",
          secretVerificationHint: "Segredo do objeto",
        });
        await setDoc(doc(adminSeed, "item_return_records", "item_1"), {
          itemId: "item_1",
          recipientName: "Recebedor Oficial",
          recipientUid: "aluno_outro",
          receiptValidationCode: "VAL-1234",
        });
      });

      const allowedContexts = [
        testEnv!.authenticatedContext(ROOT_UID, { email: ROOT_EMAIL, email_verified: true }).firestore(),
        testEnv!.authenticatedContext("admin_ok", { email: "admin.ok@gmail.com", email_verified: true }).firestore(),
        testEnv!.authenticatedContext("serv_inst", { email: "serv@ifpr.edu.br", email_verified: true }).firestore(),
        testEnv!.authenticatedContext("serv_gmail", { email: "serv.gmail@gmail.com", email_verified: true }).firestore(),
      ];

      for (const db of allowedContexts) {
        const histSnap = await assertSucceeds(getDocs(collection(db, "item_history")));
        expect(histSnap.size).toBe(2);
        await assertSucceeds(getDoc(doc(db, "item_history", "hist_legado_pii")));
        await assertSucceeds(getDoc(doc(db, "item_history", "hist_publico_limpo")));
        await assertSucceeds(getDocs(collection(db, "item_private")));
        await assertSucceeds(getDocs(collection(db, "item_return_records")));
      }

      const deniedContexts = [
        testEnv!.unauthenticatedContext().firestore(),
        testEnv!.authenticatedContext("serv_pend", { email: "pend@ifpr.edu.br", email_verified: true }).firestore(),
        testEnv!.authenticatedContext("aluno_ok", { email: "aluno@estudantes.ifpr.edu.br", email_verified: true }).firestore(),
        testEnv!.authenticatedContext("intruso_ok", { email: "intruso@gmail.com", email_verified: true }).firestore(),
      ];

      for (const db of deniedContexts) {
        // Entrada limpa continua legível via getDoc, mantendo histórico público acessível
        await assertSucceeds(getDoc(doc(db, "item_history", "hist_publico_limpo")));
        // Entrada privada/legada e listagem completa contendo entrada privada são negadas
        await assertFails(getDoc(doc(db, "item_history", "hist_legado_pii")));
        await assertFails(getDocs(collection(db, "item_history")));
        await assertFails(getDocs(collection(db, "item_private")));
        await assertFails(getDocs(collection(db, "item_return_records")));
      }
    });

    it("48. email_verified false vs true e campo active ausente/null/false", async () => {
      await setupUserDoc(ROOT_UID, {
        id: ROOT_UID,
        email: ROOT_EMAIL,
        role: "ADMIN",
        approvalStatus: "APROVADO",
        status: "active",
      });
      await setupUserDoc("admin_unverified", {
        id: "admin_unverified",
        email: "unverified@gmail.com",
        role: "ADMIN",
        approvalStatus: "APROVADO",
        status: "active",
        active: null,
      });
      await setupUserDoc("serv_active_null", {
        id: "serv_active_null",
        email: "serv.null@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "active",
        active: null,
      });
      await setupUserDoc("serv_active_false", {
        id: "serv_active_false",
        email: "serv.false@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "active",
        active: false,
      });

      const dbRootUnverified = testEnv!.authenticatedContext(ROOT_UID, {
        email: ROOT_EMAIL,
        email_verified: false,
      }).firestore();
      await assertFails(runRegisterBatch(dbRootUnverified, ROOT_UID, "ADMIN", "root_unverified"));

      const dbAdminUnverified = testEnv!.authenticatedContext("admin_unverified", {
        email: "unverified@gmail.com",
        email_verified: false,
      }).firestore();
      await assertFails(runRegisterBatch(dbAdminUnverified, "admin_unverified", "ADMIN", "admin_unverified"));

      const dbServActiveNull = testEnv!.authenticatedContext("serv_active_null", {
        email: "serv.null@ifpr.edu.br",
        email_verified: true,
      }).firestore();
      await assertSucceeds(runRegisterBatch(dbServActiveNull, "serv_active_null", "SERVIDOR", "serv_active_null"));

      const dbServActiveFalse = testEnv!.authenticatedContext("serv_active_false", {
        email: "serv.false@ifpr.edu.br",
        email_verified: true,
      }).firestore();
      await assertFails(runRegisterBatch(dbServActiveFalse, "serv_active_false", "SERVIDOR", "serv_active_false"));
    });

    it("49. Consultas de /notifications para ADMIN, SERVIDOR e ALUNO respeitam isolamento e broadcasts", async () => {
      await setupUserDoc(ROOT_UID, {
        id: ROOT_UID,
        email: ROOT_EMAIL,
        role: "ADMIN",
        approvalStatus: "APROVADO",
        status: "active",
      });
      await setupUserDoc("serv_notif_ok", {
        id: "serv_notif_ok",
        email: "serv.notif@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "active",
      });
      await setupUserDoc("aluno_notif_1", {
        id: "aluno_notif_1",
        email: "aluno1.notif@estudantes.ifpr.edu.br",
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "active",
      });
      await setupUserDoc("aluno_notif_2", {
        id: "aluno_notif_2",
        email: "aluno2.notif@estudantes.ifpr.edu.br",
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "active",
      });

      await testEnv!.withSecurityRulesDisabled(async (ctx) => {
        const seedDb = ctx.firestore();
        await setDoc(doc(seedDb, "notifications", "n_aluno_1"), {
          id: "n_aluno_1",
          userId: "aluno_notif_1",
          title: "Aviso Individual",
          message: "Sua reivindicação foi recebida.",
          read: false,
          timestamp: new Date().toISOString(),
        });
        await setDoc(doc(seedDb, "notifications", "n_aluno_2"), {
          id: "n_aluno_2",
          userId: "aluno_notif_2",
          title: "Aviso Privado Outro Aluno",
          message: "Mensagem exclusiva do aluno 2.",
          read: false,
          timestamp: new Date().toISOString(),
        });
        await setDoc(doc(seedDb, "notifications", "n_broadcast"), {
          id: "n_broadcast",
          userId: "all",
          isGlobal: true,
          title: "Comunicado Institucional",
          message: "Horário da secretaria atualizado.",
          read: false,
          timestamp: new Date().toISOString(),
        });
      });

      const dbRoot = testEnv!.authenticatedContext(ROOT_UID, {
        email: ROOT_EMAIL,
        email_verified: true,
      }).firestore();
      const dbAluno1 = testEnv!.authenticatedContext("aluno_notif_1", {
        email: "aluno1.notif@estudantes.ifpr.edu.br",
        email_verified: true,
      }).firestore();
      const dbServ = testEnv!.authenticatedContext("serv_notif_ok", {
        email: "serv.notif@ifpr.edu.br",
        email_verified: true,
      }).firestore();

      // ADMIN consulta todas as notificações
      const adminSnap = await assertSucceeds(getDocs(collection(dbRoot, "notifications")));
      expect(adminSnap.size).toBe(3);

      // ALUNO e SERVIDOR consultam com filtro explícito idêntico ao AppContext.tsx
      const alunoSnap = await assertSucceeds(
        getDocs(query(collection(dbAluno1, "notifications"), where("userId", "in", ["aluno_notif_1", "all", "todos_alunos", "todos"])))
      );
      expect(alunoSnap.docs.map((d) => d.id).sort()).toEqual(["n_aluno_1", "n_broadcast"]);

      const servSnap = await assertSucceeds(
        getDocs(query(collection(dbServ, "notifications"), where("userId", "in", ["serv_notif_ok", "all", "todos_alunos", "todos"])))
      );
      expect(servSnap.docs.map((d) => d.id)).toEqual(["n_broadcast"]);

      // Consulta global sem filtro ou dirigida a outro UID é negada para não-admin
      await assertFails(getDocs(collection(dbAluno1, "notifications")));
      await assertFails(getDocs(query(collection(dbAluno1, "notifications"), where("userId", "==", "aluno_notif_2"))));
    });

    it("50. Token com custom claim obsoleta role=INTRUSO mas users/{uid} SERVIDOR/APROVADO/active mantém permissão de cadastro, e vice-versa é negado", async () => {
      const servStaleUid = "serv_stale_intruso_claim";
      await setupUserDoc(servStaleUid, {
        id: servStaleUid,
        email: "serv.stale@gmail.com",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "active",
      });

      const dbServStaleClaim = testEnv!.authenticatedContext(servStaleUid, {
        email: "serv.stale@gmail.com",
        email_verified: true,
        role: "INTRUSO",
      }).firestore();

      await assertSucceeds(runRegisterBatch(dbServStaleClaim, servStaleUid, "SERVIDOR", "serv_stale_claim"));

      // Vice-versa: token com role=ADMIN mas users/{uid} SERVIDOR PENDENTE deve ser negado
      const servPendAdminClaimUid = "serv_pend_admin_claim";
      await setupUserDoc(servPendAdminClaimUid, {
        id: servPendAdminClaimUid,
        email: "serv.pend.claim@gmail.com",
        role: "SERVIDOR",
        approvalStatus: "PENDENTE",
        status: "active",
      });

      const dbPendAdminClaim = testEnv!.authenticatedContext(servPendAdminClaimUid, {
        email: "serv.pend.claim@gmail.com",
        email_verified: true,
        role: "ADMIN",
        admin: true,
      }).firestore();

      await assertFails(runRegisterBatch(dbPendAdminClaim, servPendAdminClaimUid, "ADMIN", "pend_admin_claim"));

      // Rebaixamento explícito: usuário rebaixado para ALUNO em users/{uid} com claim antiga de ADMIN não mantém privilégios
      const demotedAlunoUid = "demoted_admin_to_aluno";
      await setupUserDoc(demotedAlunoUid, {
        id: demotedAlunoUid,
        email: "ex.admin@estudantes.ifpr.edu.br",
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "active",
      });

      const dbDemotedAdminClaim = testEnv!.authenticatedContext(demotedAlunoUid, {
        email: "ex.admin@estudantes.ifpr.edu.br",
        email_verified: true,
        role: "ADMIN",
        admin: true,
      }).firestore();

      await assertFails(runRegisterBatch(dbDemotedAdminClaim, demotedAlunoUid, "ADMIN", "demoted_admin_claim"));
    });

    it("51. ADMIN não-root com active: false e SERVIDOR com status: 'banned' são negados no writeBatch de cadastro", async () => {
      const adminInactiveUid = "admin_inactive_false";
      await setupUserDoc(adminInactiveUid, {
        id: adminInactiveUid,
        email: "admin.inactive@gmail.com",
        role: "ADMIN",
        approvalStatus: "APROVADO",
        status: "active",
        active: false,
      });

      const servBannedUid = "serv_banned_uid";
      await setupUserDoc(servBannedUid, {
        id: servBannedUid,
        email: "serv.banned@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "banned",
      });

      const dbAdminInactive = testEnv!.authenticatedContext(adminInactiveUid, {
        email: "admin.inactive@gmail.com",
        email_verified: true,
      }).firestore();
      await assertFails(runRegisterBatch(dbAdminInactive, adminInactiveUid, "ADMIN", "admin_inactive"));

      const dbServBanned = testEnv!.authenticatedContext(servBannedUid, {
        email: "serv.banned@ifpr.edu.br",
        email_verified: true,
      }).firestore();
      await assertFails(runRegisterBatch(dbServBanned, servBannedUid, "SERVIDOR", "serv_banned"));
    });

    it("52. Bloqueios com prazos inconsistentes (null/número/vazio) bloqueiam staff, prazos Timestamp expirados recuperam acesso e Gmail atribuído como ALUNO mantém claims sem privilégios de staff", async () => {
      const pastTs = Timestamp.fromDate(new Date(Date.now() - 86400000));

      // 1. SERVIDOR com blockExpiresAt expirado mas suspendedUntil: null -> bloqueado
      const servInconsistentNullUid = "serv_inconsistent_null";
      await setupUserDoc(servInconsistentNullUid, {
        id: servInconsistentNullUid,
        email: "serv.inc.null@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "suspended",
        blockExpiresAt: pastTs,
        suspendedUntil: null,
      });
      const dbServIncNull = testEnv!.authenticatedContext(servInconsistentNullUid, {
        email: "serv.inc.null@ifpr.edu.br",
        email_verified: true,
      }).firestore();
      await assertFails(runRegisterBatch(dbServIncNull, servInconsistentNullUid, "SERVIDOR", "serv_inc_null"));

      // 2. SERVIDOR com suspendedUntil expirado mas blockExpiresAt numérico -> bloqueado
      const servInconsistentNumUid = "serv_inconsistent_num";
      await setupUserDoc(servInconsistentNumUid, {
        id: servInconsistentNumUid,
        email: "serv.inc.num@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "suspended",
        suspendedUntil: pastTs,
        blockExpiresAt: 123456789,
      });
      const dbServIncNum = testEnv!.authenticatedContext(servInconsistentNumUid, {
        email: "serv.inc.num@ifpr.edu.br",
        email_verified: true,
      }).firestore();
      await assertFails(runRegisterBatch(dbServIncNum, servInconsistentNumUid, "SERVIDOR", "serv_inc_num"));

      // 3. SERVIDOR com ambos prazos Timestamp válidos expirados -> recuperação permitida
      const servRecoveredUid = "serv_recovered_ok";
      await setupUserDoc(servRecoveredUid, {
        id: servRecoveredUid,
        email: "serv.rec@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "suspended",
        blockExpiresAt: pastTs,
        suspendedUntil: pastTs,
      });
      const dbServRecovered = testEnv!.authenticatedContext(servRecoveredUid, {
        email: "serv.rec@ifpr.edu.br",
        email_verified: true,
      }).firestore();
      await assertSucceeds(runRegisterBatch(dbServRecovered, servRecoveredUid, "SERVIDOR", "serv_recovered"));

      // 4. Conta Gmail atribuída administrativamente como ALUNO mantém direito de reivindicação, mas não cadastra itens
      const gmailAlunoUid = "aluno_gmail_assigned";
      await setupUserDoc(gmailAlunoUid, {
        id: gmailAlunoUid,
        email: "aluno.externo@gmail.com",
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "active",
        roleAssignedBy: ROOT_EMAIL,
      });
      const dbGmailAluno = testEnv!.authenticatedContext(gmailAlunoUid, {
        email: "aluno.externo@gmail.com",
        email_verified: true,
      }).firestore();
      await assertFails(runRegisterBatch(dbGmailAluno, gmailAlunoUid, "ALUNO", "gmail_aluno"));
      await assertSucceeds(
        setDoc(doc(dbGmailAluno, "claims", `claim_${gmailAlunoUid}_item_batch_serv_recovered`), {
          id: `claim_${gmailAlunoUid}_item_batch_serv_recovered`,
          itemId: "item_batch_serv_recovered",
          claimerId: gmailAlunoUid,
          status: "PENDENTE",
          distinctiveFeatures: "Adesivo verde na lateral",
          createdAt: new Date().toISOString(),
        })
      );
    });

    it("53. Legitimidade positiva sem estouro CEL nas regras otimizadas (/users, /items, /found_items, /lost_items, /item_private, /item_history, /claims)", async () => {
      // 1. /users create: ALUNO institucional, SERVIDOR institucional PENDENTE e INTRUSO
      const alunoNewUid = "aluno_create_cel";
      const dbAlunoNew = testEnv!.authenticatedContext(alunoNewUid, {
        email: "novo.aluno@estudantes.ifpr.edu.br",
        email_verified: true,
      }).firestore();
      await assertSucceeds(
        setDoc(doc(dbAlunoNew, "users", alunoNewUid), {
          id: alunoNewUid,
          email: "novo.aluno@estudantes.ifpr.edu.br",
          name: "Aluno Novo",
          role: "ALUNO",
          approvalStatus: "APROVADO",
          status: "active",
        })
      );

      const servNewUid = "serv_create_cel";
      const dbServNew = testEnv!.authenticatedContext(servNewUid, {
        email: "novo.serv@ifpr.edu.br",
        email_verified: true,
      }).firestore();
      await assertSucceeds(
        setDoc(doc(dbServNew, "users", servNewUid), {
          id: servNewUid,
          email: "novo.serv@ifpr.edu.br",
          name: "Servidor Novo",
          role: "SERVIDOR",
          approvalStatus: "PENDENTE",
          status: "active",
        })
      );

      // 2. /users update Branch 1 (promoção), Branch 2 (self-update) e Branch 3 (legacy status init)
      const promoUid = "intruso_promo_cel";
      await setupUserDoc(promoUid, {
        id: promoUid,
        email: "promo@estudantes.ifpr.edu.br",
        name: "Promo",
        role: "INTRUSO",
        approvalStatus: "APROVADO",
        status: "active",
      });
      const dbPromo = testEnv!.authenticatedContext(promoUid, {
        email: "promo@estudantes.ifpr.edu.br",
        email_verified: true,
      }).firestore();
      await assertSucceeds(updateDoc(doc(dbPromo, "users", promoUid), { role: "ALUNO" }));

      await assertSucceeds(updateDoc(doc(dbAlunoNew, "users", alunoNewUid), { name: "Aluno Atualizado" }));

      const legacyAlunoUid = "aluno_legacy_status_cel";
      await setupUserDoc(legacyAlunoUid, {
        id: legacyAlunoUid,
        email: "legado@estudantes.ifpr.edu.br",
        name: "Legado",
        role: "ALUNO",
        approvalStatus: "APROVADO",
      });
      const dbLegacyAluno = testEnv!.authenticatedContext(legacyAlunoUid, {
        email: "legado@estudantes.ifpr.edu.br",
        email_verified: true,
      }).firestore();
      await assertSucceeds(updateDoc(doc(dbLegacyAluno, "users", legacyAlunoUid), { status: "active" }));

      // 3. /items, /found_items, /lost_items create + update (staff update e author safe metadata edit) + /item_private create/update
      const servOkUid = "serv_cel_ok";
      await setupUserDoc(servOkUid, {
        id: servOkUid,
        email: "serv.cel@ifpr.edu.br",
        role: "SERVIDOR",
        approvalStatus: "APROVADO",
        status: "active",
      });
      const dbServOk = testEnv!.authenticatedContext(servOkUid, {
        email: "serv.cel@ifpr.edu.br",
        email_verified: true,
      }).firestore();

      for (const col of ["items", "found_items", "lost_items"] as const) {
        const docId = `${col}_cel_1`;
        await assertSucceeds(
          setDoc(doc(dbServOk, col, docId), {
            id: docId,
            title: "Item Teste CEL",
            description: "Descrição válida",
            category: "Outros",
            location: "Bloco B",
            status: "ENCONTRADO",
            type: col === "lost_items" ? "PERDIDO" : "ENCONTRADO",
            registeredByUserId: servOkUid,
            registeredByRole: "SERVIDOR",
            createdAt: new Date().toISOString(),
          })
        );
        await assertSucceeds(
          updateDoc(doc(dbServOk, col, docId), {
            title: "Item Editado Staff",
            status: "EM_ANALISE",
          })
        );
      }

      // Author safe metadata edit (ramo direito de allow update em /items) para item legado de ALUNO
      await testEnv!.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "items", "item_aluno_legacy_cel"), {
          id: "item_aluno_legacy_cel",
          title: "Caderno Aluno",
          description: "Original",
          category: "Materiais",
          location: "Sala 4",
          status: "PERDIDO",
          type: "PERDIDO",
          registeredByUserId: alunoNewUid,
          registeredByRole: "ALUNO",
          createdAt: new Date().toISOString(),
        });
      });
      await assertSucceeds(
        updateDoc(doc(dbAlunoNew, "items", "item_aluno_legacy_cel"), {
          description: "Descrição editada pelo autor",
        })
      );

      // /item_private create & update
      await assertSucceeds(
        setDoc(doc(dbServOk, "item_private", "items_cel_1"), {
          itemId: "items_cel_1",
          registeredByUserId: servOkUid,
          secretVerificationHint: "Marca inicial",
        })
      );
      await assertSucceeds(
        updateDoc(doc(dbServOk, "item_private", "items_cel_1"), {
          secretVerificationHint: "Marca atualizada",
        })
      );

      // 4. /item_history create por SERVIDOR e por ALUNO autor (terceiro ramo de allow create)
      await assertSucceeds(
        setDoc(doc(dbServOk, "item_history", "hist_serv_cel_1"), {
          id: "hist_serv_cel_1",
          objectId: "items_cel_1",
          action: "CADASTRO",
          actorId: servOkUid,
          actorRole: "SERVIDOR",
          timestamp: new Date().toISOString(),
        })
      );
      await assertSucceeds(
        setDoc(doc(dbAlunoNew, "item_history", "hist_aluno_cel_1"), {
          id: "hist_aluno_cel_1",
          objectId: "item_aluno_legacy_cel",
          action: "EDIT_OCORRENCIA",
          actorId: alunoNewUid,
          actorRole: "ALUNO",
          timestamp: new Date().toISOString(),
        })
      );

      // 5. /claims create + update Branch 1 (cancel) + Branch 2 (resubmit) + Branch 3 (staff review CONCLUIDO)
      const claimId = `claim_${alunoNewUid}_items_cel_1`;
      await assertSucceeds(
        setDoc(doc(dbAlunoNew, "claims", claimId), {
          id: claimId,
          itemId: "items_cel_1",
          claimerId: alunoNewUid,
          status: "PENDENTE",
          distinctiveFeatures: "Chaveiro vermelho",
          createdAt: new Date().toISOString(),
        })
      );
      await assertSucceeds(
        updateDoc(doc(dbAlunoNew, "claims", claimId), {
          status: "CANCELADO",
          cancelledAt: new Date().toISOString(),
        })
      );
      await assertSucceeds(
        updateDoc(doc(dbAlunoNew, "claims", claimId), {
          status: "PENDENTE",
          distinctiveFeatures: "Chaveiro vermelho com etiqueta",
          cancelledAt: deleteField(),
        })
      );
      await assertSucceeds(
        updateDoc(doc(dbServOk, "claims", claimId), {
          status: "APROVADO",
          reviewedByUserId: servOkUid,
          reviewedByRole: "SERVIDOR",
          reviewedAt: new Date().toISOString(),
        })
      );
      await assertSucceeds(
        updateDoc(doc(dbServOk, "claims", claimId), {
          status: "CONCLUIDO",
          completedAt: new Date().toISOString(),
        })
      );
    });
  });
});


