import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { collection, doc, setDoc, getDoc, getDocs, updateDoc, query, where } from "firebase/firestore";
import fs from "fs";
import path from "path";

import net from "net";

let testEnv: RulesTestEnvironment | null = null;
let emulatorAvailable = false;

const isEmulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

describe.skipIf(!isEmulatorAvailable)("Firestore Rules Emulator Suite — Real Security Rules Validation", () => {
  beforeAll(async () => {
    const rulesPath = path.resolve(process.cwd(), "firestore.rules");
    const rules = fs.readFileSync(rulesPath, "utf-8");

    const hostAndPort = process.env.FIRESTORE_EMULATOR_HOST?.split(":") || ["127.0.0.1", "8080"];
    testEnv = await initializeTestEnvironment({
      projectId: "localiza-plus-emulator-test",
      firestore: {
        rules: rules,
        host: hostAndPort[0] || "127.0.0.1",
        port: Number(hostAndPort[1]) || 8080,
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
  });
});

