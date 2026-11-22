import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, collection } from "firebase/firestore";
import fs from "fs";
import path from "path";
import { executeFirestoreItemDeletion } from "./catalogDeletionService";

const isEmulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
let testEnv: RulesTestEnvironment | null = null;

describe.skipIf(!isEmulatorAvailable)(
  "Firestore Emulator — Unified Atomic Deletion (/items + /item_private) & History Preservation (Cenários A, B, C, F, H, I, M)",
  () => {
    beforeAll(async () => {
      const rulesPath = path.resolve(process.cwd(), process.env.FIRESTORE_RULES_PATH || "firestore.rules");
      const rules = fs.readFileSync(rulesPath, "utf8");
      const [host, portStr] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
      testEnv = await initializeTestEnvironment({
        projectId: "localiza-deletion-emulator-test",
        firestore: {
          host,
          port: Number(portStr),
          rules,
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

    async function seedUsersAndItem(params: {
      itemId: string;
      ownerUid: string;
      status?: string;
      withPrivateDoc?: boolean;
      withHistoryDoc?: boolean;
    }) {
      await testEnv!.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "users", "uid-admin"), {
          id: "uid-admin",
          name: "Admin Emulator",
          email: "admin@ifpr.edu.br",
          role: "ADMIN",
          approvalStatus: "APROVADO",
          status: "active",
          active: true,
        });
        await setDoc(doc(db, "users", "uid-servidor-owner"), {
          id: "uid-servidor-owner",
          name: "Servidor Autor",
          email: "autor@ifpr.edu.br",
          role: "SERVIDOR",
          approvalStatus: "APROVADO",
          status: "active",
          active: true,
        });
        await setDoc(doc(db, "users", "uid-servidor-other"), {
          id: "uid-servidor-other",
          name: "Outro Servidor",
          email: "outro@ifpr.edu.br",
          role: "SERVIDOR",
          approvalStatus: "APROVADO",
          status: "active",
          active: true,
        });

        await setDoc(doc(db, "items", params.itemId), {
          id: params.itemId,
          title: `Item ${params.itemId}`,
          description: "Objeto fictício no emulator",
          category: "Eletrônicos",
          type: "ENCONTRADO",
          status: params.status || "ENCONTRADO",
          location: "Bloco 1",
          date: "2026-11-10",
          createdAt: "2026-11-10T10:00:00.000Z",
          registeredByUserId: params.ownerUid,
          registeredByName: "Autor",
          registeredByRole: "SERVIDOR",
        });

        if (params.withPrivateDoc !== false) {
          await setDoc(doc(db, "item_private", params.itemId), {
            itemId: params.itemId,
            registeredByUserId: params.ownerUid,
            secretVerificationHint: "Marca escondida na tampa",
            secretVerificationKey: "CHAVE-123",
          });
        }

        if (params.withHistoryDoc !== false) {
          await setDoc(doc(db, "item_history", `hist-${params.itemId}`), {
            id: `hist-${params.itemId}`,
            objectId: params.itemId,
            action: "CADASTRO",
            actorId: params.ownerUid,
            actorRole: "SERVIDOR",
            timestamp: "2026-11-10T10:00:00.000Z",
            details: "Cadastro inicial no emulator",
          });
        }
      });
    }

    it("Cenário M (ADMIN): exclui atomicamente /items/{id} e /item_private/{id} preservando /item_history intacto", async () => {
      await seedUsersAndItem({
        itemId: "EMU-M-ADMIN",
        ownerUid: "uid-servidor-owner",
        withPrivateDoc: true,
        withHistoryDoc: true,
      });

      const adminDb = testEnv!
        .authenticatedContext("uid-admin", { email: "admin@ifpr.edu.br", email_verified: true })
        .firestore();

      const result = await executeFirestoreItemDeletion({
        db: adminDb as any,
        itemId: "EMU-M-ADMIN",
        isAdmin: true,
        isOnline: true,
      });

      expect(result).toEqual({
        ok: true,
        mode: "ATOMIC_BATCH",
        privateDocDeleted: true,
        remoteDocumentState: "CONFIRMED_ABSENT_ON_SERVER",
      });

      await testEnv!.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        expect((await getDoc(doc(db, "items", "EMU-M-ADMIN"))).exists()).toBe(false);
        expect((await getDoc(doc(db, "item_private", "EMU-M-ADMIN"))).exists()).toBe(false);
        expect((await getDoc(doc(db, "item_history", "hist-EMU-M-ADMIN"))).exists()).toBe(true);
      });
    });

    it("Cenário M (Autor SERVIDOR): batch atômico satisfaz exists(/items/{id}) nas regras de /item_private e preserva /item_history", async () => {
      await seedUsersAndItem({
        itemId: "EMU-M-OWNER",
        ownerUid: "uid-servidor-owner",
        withPrivateDoc: true,
        withHistoryDoc: true,
      });

      const ownerDb = testEnv!
        .authenticatedContext("uid-servidor-owner", { email: "autor@ifpr.edu.br", email_verified: true })
        .firestore();

      const result = await executeFirestoreItemDeletion({
        db: ownerDb as any,
        itemId: "EMU-M-OWNER",
        isAdmin: false,
        isOnline: true,
      });

      expect(result).toEqual({
        ok: true,
        mode: "ATOMIC_BATCH",
        privateDocDeleted: true,
        remoteDocumentState: "CONFIRMED_ABSENT_ON_SERVER",
      });

      await testEnv!.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        expect((await getDoc(doc(db, "items", "EMU-M-OWNER"))).exists()).toBe(false);
        expect((await getDoc(doc(db, "item_private", "EMU-M-OWNER"))).exists()).toBe(false);
        expect((await getDoc(doc(db, "item_history", "hist-EMU-M-OWNER"))).exists()).toBe(true);
      });
    });

    it("Cenário M (Autor SERVIDOR sem /item_private pré-existente): batch atômico ainda exclui /items/{id} sem erro", async () => {
      await seedUsersAndItem({
        itemId: "EMU-M-NOPRIV",
        ownerUid: "uid-servidor-owner",
        withPrivateDoc: false,
        withHistoryDoc: true,
      });

      const ownerDb = testEnv!
        .authenticatedContext("uid-servidor-owner", { email: "autor@ifpr.edu.br", email_verified: true })
        .firestore();

      const result = await executeFirestoreItemDeletion({
        db: ownerDb as any,
        itemId: "EMU-M-NOPRIV",
        isAdmin: false,
        isOnline: true,
      });

      expect(result.ok).toBe(true);
      await testEnv!.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        expect((await getDoc(doc(db, "items", "EMU-M-NOPRIV"))).exists()).toBe(false);
        expect((await getDoc(doc(db, "item_history", "hist-EMU-M-NOPRIV"))).exists()).toBe(true);
      });
    });

    it("Cenário H: não-autor, item DEVOLVIDO e ENCERRADO por não-admin são negados atomicamente sem apagar /item_private", async () => {
      await seedUsersAndItem({ itemId: "EMU-H-OTHER", ownerUid: "uid-servidor-owner", status: "ENCONTRADO" });
      await seedUsersAndItem({ itemId: "EMU-H-RETURNED", ownerUid: "uid-servidor-owner", status: "DEVOLVIDO" });
      await seedUsersAndItem({ itemId: "EMU-H-CLOSED", ownerUid: "uid-servidor-owner", status: "ENCERRADO" });

      const otherDb = testEnv!
        .authenticatedContext("uid-servidor-other", { email: "outro@ifpr.edu.br", email_verified: true })
        .firestore();
      const adminDb = testEnv!
        .authenticatedContext("uid-admin", { email: "admin@ifpr.edu.br", email_verified: true })
        .firestore();
      const ownerDb = testEnv!
        .authenticatedContext("uid-servidor-owner", { email: "autor@ifpr.edu.br", email_verified: true })
        .firestore();

      // 1. Não-autor tenta excluir
      const resOther = await executeFirestoreItemDeletion({
        db: otherDb as any,
        itemId: "EMU-H-OTHER",
        isAdmin: false,
        isOnline: true,
      });
      expect(resOther.ok).toBe(false);

      // 2. Admin tenta excluir DEVOLVIDO -> negado pelas rules
      const resReturned = await executeFirestoreItemDeletion({
        db: adminDb as any,
        itemId: "EMU-H-RETURNED",
        isAdmin: true,
        isOnline: true,
      });
      expect(resReturned.ok).toBe(false);

      // 3. Autor tenta excluir ENCERRADO -> negado atomicamente (nem /item_private nem /items é apagado!)
      const resClosed = await executeFirestoreItemDeletion({
        db: ownerDb as any,
        itemId: "EMU-H-CLOSED",
        isAdmin: false,
        isOnline: true,
      });
      expect(resClosed.ok).toBe(false);

      await testEnv!.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        for (const id of ["EMU-H-OTHER", "EMU-H-RETURNED", "EMU-H-CLOSED"]) {
          expect((await getDoc(doc(db, "items", id))).exists()).toBe(true);
          expect((await getDoc(doc(db, "item_private", id))).exists()).toBe(true);
        }
      });
    });

    it("Cenários A, B, C, F & I: exclusão sequencial até o último objeto + falha parcial em lote + leitura vazia em segundo dispositivo", async () => {
      await seedUsersAndItem({ itemId: "EMU-1", ownerUid: "uid-servidor-owner", status: "ENCONTRADO" });
      await seedUsersAndItem({ itemId: "EMU-2", ownerUid: "uid-servidor-owner", status: "ENCONTRADO" });
      await seedUsersAndItem({ itemId: "EMU-3", ownerUid: "uid-servidor-owner", status: "DEVOLVIDO" });

      const adminDb = testEnv!
        .authenticatedContext("uid-admin", { email: "admin@ifpr.edu.br", email_verified: true })
        .firestore();
      const device2Db = testEnv!
        .authenticatedContext("uid-servidor-other", { email: "outro@ifpr.edu.br", email_verified: true })
        .firestore();

      // Exclusão em lote com falha parcial (EMU-1 ok, EMU-3 DEVOLVIDO bloqueado)
      const r1 = await executeFirestoreItemDeletion({ db: adminDb as any, itemId: "EMU-1", isAdmin: true, isOnline: true });
      const r3 = await executeFirestoreItemDeletion({ db: adminDb as any, itemId: "EMU-3", isAdmin: true, isOnline: true });
      expect(r1.ok).toBe(true);
      expect(r3.ok).toBe(false);

      // Exclui EMU-2
      const r2 = await executeFirestoreItemDeletion({ db: adminDb as any, itemId: "EMU-2", isAdmin: true, isOnline: true });
      expect(r2.ok).toBe(true);

      // Reabre EMU-3 (emulador admin-disabled) e exclui o último objeto restante
      await testEnv!.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "items", "EMU-3"), { status: "ENCONTRADO" }, { merge: true });
      });
      const r3AfterReopen = await executeFirestoreItemDeletion({ db: adminDb as any, itemId: "EMU-3", isAdmin: true, isOnline: true });
      expect(r3AfterReopen.ok).toBe(true);

      // Dispositivo 2 lê coleção /items -> 0 documentos; /item_private -> 0 documentos; /item_history -> 3 preservados!
      const dev2Snap = await getDocs(collection(device2Db as any, "items"));
      expect(dev2Snap.empty).toBe(true);

      await testEnv!.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        expect((await getDocs(collection(db, "item_private"))).empty).toBe(true);
        expect((await getDocs(collection(db, "item_history"))).size).toBe(3);
      });

      // Exclusão repetida de item já removido remotamente (Dispositivo 2 atrasado) reconcilia sem erro
      const alreadyGone = await executeFirestoreItemDeletion({
        db: adminDb as any,
        itemId: "EMU-1",
        isAdmin: true,
        isOnline: true,
      });
      expect(alreadyGone).toEqual({
        ok: true,
        mode: "ALREADY_DELETED_REMOTELY",
        privateDocDeleted: true,
        remoteDocumentState: "CONFIRMED_ABSENT_ON_SERVER",
      });
    });

    it("Cenário K (Firestore Emulator real): gravação de audit_logs e activity_logs após exclusão por ADMIN e SERVIDOR (autor) com ID determinístico", async () => {
      await seedUsersAndItem({
        itemId: "EMU-AUDIT-ADMIN",
        ownerUid: "uid-servidor-owner",
        status: "ENCONTRADO",
      });
      await seedUsersAndItem({
        itemId: "EMU-AUDIT-OWNER",
        ownerUid: "uid-servidor-owner",
        status: "ENCONTRADO",
      });

      const adminDb = testEnv!
        .authenticatedContext("uid-admin", { email: "admin@ifpr.edu.br", email_verified: true })
        .firestore();
      const ownerDb = testEnv!
        .authenticatedContext("uid-servidor-owner", { email: "autor@ifpr.edu.br", email_verified: true })
        .firestore();

      // 1. ADMIN exclui EMU-AUDIT-ADMIN e grava audit_logs + activity_logs com ID determinístico
      const delAdmin = await executeFirestoreItemDeletion({
        db: adminDb as any,
        itemId: "EMU-AUDIT-ADMIN",
        isAdmin: true,
        isOnline: true,
      });
      expect(delAdmin.ok).toBe(true);

      const adminAuditId = "audit-del-BULK-EMU1-EMU-AUDIT-ADMIN";
      await setDoc(doc(adminDb as any, "audit_logs", adminAuditId), {
        id: adminAuditId,
        transactionId: "BULK-EMU1",
        objectId: "EMU-AUDIT-ADMIN",
        objectType: "ITEM",
        objectTitle: "Item EMU-AUDIT-ADMIN",
        action: "EXCLUSAO_ITEM",
        actorId: "uid-admin",
        actorName: "Admin Emulator",
        actorEmail: "admin@ifpr.edu.br",
        actorRole: "ADMIN",
        timestamp: "2026-11-22T10:00:00.000Z",
        details: "Exclusão confirmada por ADMIN no emulator",
        immutable: true,
      });
      await setDoc(doc(adminDb as any, "activity_logs", `act-${adminAuditId}`), {
        id: `act-${adminAuditId}`,
        adminId: "uid-admin",
        actorId: "uid-admin",
        actorEmail: "admin@ifpr.edu.br",
        actorRole: "ADMIN",
        adminName: "Admin Emulator",
        action: "EXCLUSAO_ITEM",
        objectId: "EMU-AUDIT-ADMIN",
        objectType: "ITEM",
        details: "Exclusão confirmada por ADMIN no emulator",
        timestamp: "2026-11-22T10:00:00.000Z",
      });

      // 2. SERVIDOR (autor) exclui EMU-AUDIT-OWNER e grava audit_logs + activity_logs com ID determinístico
      const delOwner = await executeFirestoreItemDeletion({
        db: ownerDb as any,
        itemId: "EMU-AUDIT-OWNER",
        isAdmin: false,
        isOnline: true,
      });
      expect(delOwner.ok).toBe(true);

      const ownerAuditId = "audit-del-EMU-AUDIT-OWNER-op1";
      await setDoc(doc(ownerDb as any, "audit_logs", ownerAuditId), {
        id: ownerAuditId,
        transactionId: "TX-DEL-EMU-AUDIT-OWNER",
        objectId: "EMU-AUDIT-OWNER",
        objectType: "ITEM",
        objectTitle: "Item EMU-AUDIT-OWNER",
        action: "EXCLUSAO_ITEM",
        actorId: "uid-servidor-owner",
        actorName: "Servidor Autor",
        actorEmail: "autor@ifpr.edu.br",
        actorRole: "SERVIDOR",
        timestamp: "2026-11-22T10:01:00.000Z",
        details: "Exclusão confirmada pelo autor SERVIDOR no emulator",
        immutable: true,
      });
      await setDoc(doc(ownerDb as any, "activity_logs", `act-${ownerAuditId}`), {
        id: `act-${ownerAuditId}`,
        adminId: "uid-servidor-owner",
        actorId: "uid-servidor-owner",
        actorEmail: "autor@ifpr.edu.br",
        actorRole: "SERVIDOR",
        adminName: "Servidor Autor",
        action: "EXCLUSAO_ITEM",
        objectId: "EMU-AUDIT-OWNER",
        objectType: "ITEM",
        details: "Exclusão confirmada pelo autor SERVIDOR no emulator",
        timestamp: "2026-11-22T10:01:00.000Z",
      });

      // Verifica persistência real no Emulator e preservação de /item_history
      await testEnv!.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        expect((await getDoc(doc(db, "audit_logs", adminAuditId))).exists()).toBe(true);
        expect((await getDoc(doc(db, "activity_logs", `act-${adminAuditId}`))).exists()).toBe(true);
        expect((await getDoc(doc(db, "audit_logs", ownerAuditId))).exists()).toBe(true);
        expect((await getDoc(doc(db, "activity_logs", `act-${ownerAuditId}`))).exists()).toBe(true);
        expect((await getDoc(doc(db, "item_history", "hist-EMU-AUDIT-ADMIN"))).exists()).toBe(true);
        expect((await getDoc(doc(db, "item_history", "hist-EMU-AUDIT-OWNER"))).exists()).toBe(true);
      });
    });

    it("Cenário T (Firestore Emulator real): spoofing de e-mail do Root Admin com UID diferente é negado nas Firestore Rules", async () => {
      await seedUsersAndItem({
        itemId: "EMU-ROOT-SPOOF",
        ownerUid: "uid-servidor-owner",
        status: "ENCONTRADO",
      });

      const spoofedDb = testEnv!
        .authenticatedContext("uid-spoofed-not-root", {
          email: "paulocauan39@gmail.com",
          email_verified: true,
        })
        .firestore();

      const res = await executeFirestoreItemDeletion({
        db: spoofedDb as any,
        itemId: "EMU-ROOT-SPOOF",
        isAdmin: false,
        isOnline: true,
      });

      expect(res.ok).toBe(false);
      if (res.ok === false) {
        expect(res.outcomeType).toBe("AUTHORIZATION_DENIED");
        expect(res.definitive).toBe(true);
      }

      await testEnv!.withSecurityRulesDisabled(async (ctx) => {
        expect((await getDoc(doc(ctx.firestore(), "items", "EMU-ROOT-SPOOF"))).exists()).toBe(true);
      });
    });
  }
);
