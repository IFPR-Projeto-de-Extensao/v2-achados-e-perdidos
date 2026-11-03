import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { collection, doc, setDoc } from "firebase/firestore";
import fs from "fs";
import path from "path";

let testEnv: RulesTestEnvironment;

describe("Firestore Rules Emulator Suite — Real Security Rules Validation", () => {
  beforeAll(async () => {
    const rulesPath = path.resolve(process.cwd(), "firestore.rules");
    const rules = fs.readFileSync(rulesPath, "utf-8");

    testEnv = await initializeTestEnvironment({
      projectId: "localiza-plus-emulator-test",
      firestore: {
        rules: rules,
        host: "127.0.0.1",
        port: 8080,
      },
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
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

    it("2. SERVIDOR pendente com e-mail verificado consegue criar item (canRegisterItems)", async () => {
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
      await assertSucceeds(
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
  });
});
