import crypto from "crypto";
import fs from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import {
  canClientSelfCreateUserProfile,
  resolveEffectiveUserIdentity,
  runWithUidProvisioningLock,
} from "../context/AppContext";
import { ROOT_ADMIN_EMAIL, ROOT_ADMIN_UID } from "./devolutionAuth";
import {
  evaluateListenerSession,
  getClaimsListenerScope,
  getNotificationsListenerScope,
} from "./listenerGuards";
import { reconcileSingleUserProfile } from "../../api/_lib/firebaseAdmin";

const DIVERGENT_UID_1 = "X2omCpteyoYBvuioTqptdL0CWUw1";
const DIVERGENT_UID_2 = "h6lLceL8wjTpHezj21ko8WBbSVg1";
const EXPECTED_FIRESTORE_RULES_SHA256 =
  "7fa455e632a9d1831517fe7269e52d922b8614f903f0a28f025f6418812d95a5";

function createInMemoryAdminHarness(seed?: {
  users?: Record<string, Record<string, any>>;
  role_assignments?: Record<string, Record<string, any>>;
  customClaims?: Record<string, Record<string, any>>;
}) {
  const store: Record<string, Record<string, Record<string, any>>> = {
    users: { ...(seed?.users || {}) },
    role_assignments: { ...(seed?.role_assignments || {}) },
    audit_logs: {},
  };
  const customClaimsStore: Record<string, Record<string, any>> = {
    ...(seed?.customClaims || {}),
  };

  const makeDocRef = (col: string, id: string) => ({ __col: col, __id: id, id });

  const adminFirestore: any = {
    collection: (col: string) => ({
      doc: (id: string) => makeDocRef(col, id),
    }),
    runTransaction: async (fn: (tx: any) => Promise<any>) => {
      const stagedWrites: Array<{ col: string; id: string; data: any; merge?: boolean }> = [];
      const tx = {
        get: async (ref: { __col: string; __id: string }) => {
          const existing = store[ref.__col]?.[ref.__id];
          return {
            exists: Boolean(existing),
            id: ref.__id,
            data: () => (existing ? { ...existing } : undefined),
          };
        },
        set: (ref: { __col: string; __id: string }, data: any, opts?: { merge?: boolean }) => {
          stagedWrites.push({ col: ref.__col, id: ref.__id, data, merge: opts?.merge });
        },
      };
      const result = await fn(tx);
      for (const write of stagedWrites) {
        if (!store[write.col]) store[write.col] = {};
        if (write.merge && store[write.col][write.id]) {
          store[write.col][write.id] = {
            ...store[write.col][write.id],
            ...write.data,
          };
        } else {
          store[write.col][write.id] = { ...write.data };
        }
      }
      return result;
    },
  };

  const setCustomUserClaims = vi.fn(async (uid: string, claims: Record<string, any>) => {
    customClaimsStore[uid] = { ...claims };
  });

  const adminAuth: any = {
    getUser: vi.fn(async (uid: string) => ({
      uid,
      customClaims: customClaimsStore[uid] ? { ...customClaimsStore[uid] } : {},
    })),
    setCustomUserClaims,
  };

  return { store, customClaimsStore, adminFirestore, adminAuth, setCustomUserClaims };
}

describe("Localiza+ — Recuperação de Autenticação Google, Pinagem Root UID, Guards de Listeners e Reconciliação ALUNO", () => {
  describe("1. Concorrência de Autenticação e Liberação de Trava por UID (runWithUidProvisioningLock)", () => {
    it("deduplica chamadas concorrentes para o mesmo UID e executa a tarefa uma única vez", async () => {
      const inFlight = new Map<string, Promise<{ uid: string; run: number }>>();
      let executions = 0;
      let releaseTask!: () => void;

      const task = () =>
        new Promise<{ uid: string; run: number }>((resolve) => {
          executions += 1;
          const run = executions;
          releaseTask = () => resolve({ uid: "uid-concurrent-1", run });
        });

      const p1 = runWithUidProvisioningLock(inFlight, "uid-concurrent-1", task);
      const p2 = runWithUidProvisioningLock(inFlight, "uid-concurrent-1", task);

      expect(p1).toBe(p2);
      expect(executions).toBe(1);
      expect(inFlight.has("uid-concurrent-1")).toBe(true);

      releaseTask();
      const [r1, r2] = await Promise.all([p1, p2]);

      expect(r1).toEqual({ uid: "uid-concurrent-1", run: 1 });
      expect(r2).toEqual({ uid: "uid-concurrent-1", run: 1 });
      expect(inFlight.has("uid-concurrent-1")).toBe(false);
    });

    it("libera a trava após sucesso permitindo nova tentativa posterior", async () => {
      const inFlight = new Map<string, Promise<number>>();
      let count = 0;

      const first = await runWithUidProvisioningLock(inFlight, "uid-success", async () => {
        count += 1;
        return count;
      });
      expect(first).toBe(1);
      expect(inFlight.size).toBe(0);

      const second = await runWithUidProvisioningLock(inFlight, "uid-success", async () => {
        count += 1;
        return count;
      });
      expect(second).toBe(2);
      expect(inFlight.size).toBe(0);
    });

    it("libera a trava após falha/rejeição permitindo retry limpo sem deadlock", async () => {
      const inFlight = new Map<string, Promise<string>>();
      let attempts = 0;

      const failCall1 = runWithUidProvisioningLock(inFlight, "uid-retry", async () => {
        attempts += 1;
        await Promise.resolve();
        throw new Error("firestore-transient-failure");
      });
      const failCall2 = runWithUidProvisioningLock(inFlight, "uid-retry", async () => {
        attempts += 1;
        return "should-not-run-while-inflight";
      });

      await expect(failCall1).rejects.toThrow("firestore-transient-failure");
      await expect(failCall2).rejects.toThrow("firestore-transient-failure");
      expect(attempts).toBe(1);
      expect(inFlight.has("uid-retry")).toBe(false);

      const retryResult = await runWithUidProvisioningLock(inFlight, "uid-retry", async () => {
        attempts += 1;
        return "recovered-profile";
      });

      expect(retryResult).toBe("recovered-profile");
      expect(attempts).toBe(2);
      expect(inFlight.has("uid-retry")).toBe(false);
    });

    it("permite execução concorrente independente para UIDs distintos", async () => {
      const inFlight = new Map<string, Promise<string>>();
      const order: string[] = [];

      const [resA, resB] = await Promise.all([
        runWithUidProvisioningLock(inFlight, "uid-a", async () => {
          order.push("start-a");
          await new Promise((r) => setTimeout(r, 10));
          order.push("end-a");
          return "A";
        }),
        runWithUidProvisioningLock(inFlight, "uid-b", async () => {
          order.push("start-b");
          order.push("end-b");
          return "B";
        }),
      ]);

      expect(resA).toBe("A");
      expect(resB).toBe("B");
      expect(order[0]).toBe("start-a");
      expect(order[1]).toBe("start-b");
      expect(inFlight.size).toBe(0);
    });
  });

  describe("2. Root Admin Legítimo vs UIDs Divergentes com Mesmo E-mail", () => {
    it("autoriza exclusivamente o Root Admin pinado (UID oficial + e-mail verificado)", () => {
      const identity = resolveEffectiveUserIdentity({
        uid: ROOT_ADMIN_UID,
        email: ROOT_ADMIN_EMAIL,
        emailVerified: true,
        userDocData: null,
      });

      expect(identity.role).toBe("ADMIN");
      expect(identity.approvalStatus).toBe("APROVADO");
      expect(identity.isInstitutional).toBe(true);
      expect(
        canClientSelfCreateUserProfile({
          uid: ROOT_ADMIN_UID,
          email: ROOT_ADMIN_EMAIL,
          emailVerified: true,
          role: "ADMIN",
          approvalStatus: "APROVADO",
        })
      ).toBe(true);

      const rootAuth = { uid: ROOT_ADMIN_UID, email: ROOT_ADMIN_EMAIL, emailVerified: true };
      const rootUser = {
        id: ROOT_ADMIN_UID,
        email: ROOT_ADMIN_EMAIL,
        role: "ADMIN" as const,
        approvalStatus: "APROVADO" as const,
        status: "active" as const,
      };
      expect(
        getClaimsListenerScope({
          authLoading: false,
          firebaseUser: rootAuth,
          currentUser: rootUser,
          hasPersistedUserDoc: true,
        })
      ).toBe("ALL");
      expect(
        getNotificationsListenerScope({
          authLoading: false,
          firebaseUser: rootAuth,
          currentUser: rootUser,
          hasPersistedUserDoc: true,
        })
      ).toBe("ALL");
    });

    it.each([DIVERGENT_UID_1, DIVERGENT_UID_2])(
      "rejeita privilégio ADMIN para UID divergente (%s) mesmo usando o e-mail do Root Admin verificado",
      (divergentUid) => {
        const identityWithoutDoc = resolveEffectiveUserIdentity({
          uid: divergentUid,
          email: ROOT_ADMIN_EMAIL,
          emailVerified: true,
          userDocData: null,
        });
        expect(identityWithoutDoc.role).toBe("INTRUSO");
        expect(identityWithoutDoc.isInstitutional).toBe(false);

        const identityWithStaleAdminDoc = resolveEffectiveUserIdentity({
          uid: divergentUid,
          email: ROOT_ADMIN_EMAIL,
          emailVerified: true,
          userDocData: {
            id: divergentUid,
            email: ROOT_ADMIN_EMAIL,
            role: "ADMIN",
            approvalStatus: "APROVADO",
            roleAssignedBy: ROOT_ADMIN_EMAIL,
            roleAssignmentActive: true,
          },
          roleAssignment: {
            id: divergentUid,
            targetUserId: divergentUid,
            targetEmail: ROOT_ADMIN_EMAIL,
            assignedRole: "ADMIN",
            approvalStatus: "APROVADO",
            assignedByUid: ROOT_ADMIN_UID,
            assignedByEmail: ROOT_ADMIN_EMAIL,
            assignedAt: "2026-11-26T00:00:00.000Z",
            active: true,
            updatedAt: "2026-11-26T00:00:00.000Z",
          },
        });
        expect(identityWithStaleAdminDoc.role).toBe("INTRUSO");

        expect(
          canClientSelfCreateUserProfile({
            uid: divergentUid,
            email: ROOT_ADMIN_EMAIL,
            emailVerified: true,
            role: "ADMIN",
            approvalStatus: "APROVADO",
          })
        ).toBe(false);

        const divergentAuth = {
          uid: divergentUid,
          email: ROOT_ADMIN_EMAIL,
          emailVerified: true,
        };
        const divergentUserAsIntruso = {
          id: divergentUid,
          email: ROOT_ADMIN_EMAIL,
          role: "INTRUSO" as const,
          approvalStatus: "APROVADO" as const,
          status: "active" as const,
        };

        expect(
          getClaimsListenerScope({
            authLoading: false,
            firebaseUser: divergentAuth,
            currentUser: divergentUserAsIntruso,
            hasPersistedUserDoc: false,
          })
        ).toBe("NONE");
        expect(
          getClaimsListenerScope({
            authLoading: false,
            firebaseUser: divergentAuth,
            currentUser: divergentUserAsIntruso,
            hasPersistedUserDoc: true,
          })
        ).toBe("SELF");
        expect(
          getNotificationsListenerScope({
            authLoading: false,
            firebaseUser: divergentAuth,
            currentUser: divergentUserAsIntruso,
            hasPersistedUserDoc: true,
          })
        ).toBe("SELF");
      }
    );

    it("nega privilégio ADMIN ao UID oficial do Root Admin se emailVerified === false (fail-closed)", () => {
      const identity = resolveEffectiveUserIdentity({
        uid: ROOT_ADMIN_UID,
        email: ROOT_ADMIN_EMAIL,
        emailVerified: false,
      });
      expect(identity.role).toBe("INTRUSO");
      expect(
        canClientSelfCreateUserProfile({
          uid: ROOT_ADMIN_UID,
          email: ROOT_ADMIN_EMAIL,
          emailVerified: false,
          role: "ADMIN",
          approvalStatus: "APROVADO",
        })
      ).toBe(false);
    });

    it("nega privilégio ADMIN quando uid explícito é null ou vazio mesmo com e-mail do Root Admin verificado", () => {
      expect(
        resolveEffectiveUserIdentity({
          uid: null,
          email: ROOT_ADMIN_EMAIL,
          emailVerified: true,
        }).role
      ).toBe("INTRUSO");

      expect(
        resolveEffectiveUserIdentity({
          uid: "",
          email: ROOT_ADMIN_EMAIL,
          emailVerified: true,
        }).role
      ).toBe("INTRUSO");
    });
  });

  describe("3. Provisionamento de INTRUSO, ALUNO e SERVIDOR e Conformidade Estrutural do AppContext", () => {
    it("classifica e valida autocriação inicial compatível com firestore.rules para INTRUSO, ALUNO e SERVIDOR", () => {
      const intruso = resolveEffectiveUserIdentity({
        uid: "uid-intruso-1",
        email: "visitante@gmail.com",
        emailVerified: true,
      });
      expect(intruso.role).toBe("INTRUSO");
      expect(intruso.approvalStatus).toBe("APROVADO");
      expect(
        canClientSelfCreateUserProfile({
          uid: "uid-intruso-1",
          email: "visitante@gmail.com",
          emailVerified: true,
          role: intruso.role,
          approvalStatus: intruso.approvalStatus,
        })
      ).toBe(true);

      const aluno = resolveEffectiveUserIdentity({
        uid: "uid-aluno-1",
        email: "maria.silva@estudantes.ifpr.edu.br",
        emailVerified: true,
      });
      expect(aluno.role).toBe("ALUNO");
      expect(aluno.approvalStatus).toBe("APROVADO");
      expect(
        canClientSelfCreateUserProfile({
          uid: "uid-aluno-1",
          email: "maria.silva@estudantes.ifpr.edu.br",
          emailVerified: true,
          role: aluno.role,
          approvalStatus: aluno.approvalStatus,
        })
      ).toBe(true);

      const servidor = resolveEffectiveUserIdentity({
        uid: "uid-servidor-1",
        email: "docente@ifpr.edu.br",
        emailVerified: true,
      });
      expect(servidor.role).toBe("SERVIDOR");
      expect(servidor.approvalStatus).toBe("PENDENTE");
      expect(
        canClientSelfCreateUserProfile({
          uid: "uid-servidor-1",
          email: "docente@ifpr.edu.br",
          emailVerified: true,
          role: "SERVIDOR",
          approvalStatus: "PENDENTE",
        })
      ).toBe(true);
      // Nunca permite autocriação cliente já aprovada para SERVIDOR
      expect(
        canClientSelfCreateUserProfile({
          uid: "uid-servidor-1",
          email: "docente@ifpr.edu.br",
          emailVerified: true,
          role: "SERVIDOR",
          approvalStatus: "APROVADO",
        })
      ).toBe(false);

      // E-mail institucional não verificado cai em zero-trust INTRUSO e não pode autocriar ALUNO/SERVIDOR
      const unverifiedAluno = resolveEffectiveUserIdentity({
        uid: "uid-unverified-aluno",
        email: "maria.silva@estudantes.ifpr.edu.br",
        emailVerified: false,
      });
      expect(unverifiedAluno.role).toBe("INTRUSO");
      expect(
        canClientSelfCreateUserProfile({
          uid: "uid-unverified-aluno",
          email: "maria.silva@estudantes.ifpr.edu.br",
          emailVerified: false,
          role: "ALUNO",
          approvalStatus: "APROVADO",
        })
      ).toBe(false);
    });

    it("removeu consulta por e-mail único, deleteDoc cross-UID e email-only Root em AppContext.tsx", () => {
      const appContextSource = fs.readFileSync(
        path.resolve(__dirname, "../context/AppContext.tsx"),
        "utf-8"
      );

      expect(appContextSource).not.toContain('where("email", "==", userEmail)');
      expect(appContextSource).not.toContain("Aviso ao verificar e-mail único no Firestore");
      expect(appContextSource).not.toContain('deleteDoc(doc(db, "users", legacyDoc.id))');
      expect(appContextSource).toContain(
        "runWithUidProvisioningLock(verifyUserInFlightRef.current, fbUser.uid"
      );
      expect(appContextSource).toContain('handleFirestoreError(error, OperationType.LIST, "claims")');
      expect(appContextSource).toContain(
        'handleFirestoreError(error, OperationType.LIST, "notifications")'
      );
    });
  });

  describe("4. Contas Externas Autorizadas por role_assignments e Reconciliação Server-Side de ALUNO", () => {
    it("identifica conta externa designada como ALUNO/SERVIDOR/ADMIN e exige reconciliação server-side no provisionamento inicial", () => {
      for (const assignedRole of ["ALUNO", "SERVIDOR", "ADMIN"] as const) {
        const identity = resolveEffectiveUserIdentity({
          uid: `uid-ext-${assignedRole}`,
          email: "externo.autorizado@gmail.com",
          emailVerified: true,
          userDocData: null,
          roleAssignment: {
            id: `uid-ext-${assignedRole}`,
            targetUserId: `uid-ext-${assignedRole}`,
            targetEmail: "externo.autorizado@gmail.com",
            assignedRole,
            approvalStatus: "APROVADO",
            assignedByUid: ROOT_ADMIN_UID,
            assignedByEmail: ROOT_ADMIN_EMAIL,
            assignedAt: "2026-11-26T00:00:00.000Z",
            active: true,
            updatedAt: "2026-11-26T00:00:00.000Z",
          },
        });

        expect(identity.role).toBe(assignedRole);
        expect(identity.approvalStatus).toBe("APROVADO");
        expect(identity.isDesignated).toBe(true);
        // Contas externas designadas não podem se autocriar via setDoc cliente em firestore.rules
        expect(
          canClientSelfCreateUserProfile({
            uid: `uid-ext-${assignedRole}`,
            email: "externo.autorizado@gmail.com",
            emailVerified: true,
            role: assignedRole,
            approvalStatus: "APROVADO",
          })
        ).toBe(false);
      }
    });

    it("reconcilia ALUNO no servidor com admin: false, registra auditoria, sincroniza claims e mantém idempotência", async () => {
      const uid = "uid-ext-aluno-reconcile";
      const harness = createInMemoryAdminHarness({
        users: {
          [uid]: {
            id: uid,
            email: "externo.aluno@gmail.com",
            role: "INTRUSO",
            approvalStatus: "APROVADO",
            status: "active",
            active: true,
            admin: true, // flag indevida residual deve ser neutralizada para false
          },
        },
        role_assignments: {
          [uid]: {
            targetUserId: uid,
            targetEmail: "externo.aluno@gmail.com",
            assignedRole: "ALUNO",
            approvalStatus: "APROVADO",
            active: true,
            assignedByUid: ROOT_ADMIN_UID,
            assignedByEmail: ROOT_ADMIN_EMAIL,
            assignedAt: "2026-11-26T10:00:00.000Z",
          },
        },
      });

      const firstRun = await reconcileSingleUserProfile({
        adminFirestore: harness.adminFirestore,
        adminAuth: harness.adminAuth,
        uid,
        email: "externo.aluno@gmail.com",
        displayName: "Estudante Externo",
        emailVerified: true,
      });

      expect(firstRun.reconciled).toBe(true);
      expect(firstRun.assignedRole).toBe("ALUNO");
      expect(firstRun.claimsSynced).toBe(true);
      expect(harness.store.users[uid]).toMatchObject({
        id: uid,
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
        admin: false,
        roleAssignmentActive: true,
      });
      expect(harness.customClaimsStore[uid]).toEqual({
        role: "ALUNO",
        approvalStatus: "APROVADO",
        admin: false,
      });
      expect(Object.keys(harness.store.audit_logs).length).toBe(1);

      // Segunda execução deve ser idempotente (ALREADY_CONSISTENT)
      const secondRun = await reconcileSingleUserProfile({
        adminFirestore: harness.adminFirestore,
        adminAuth: harness.adminAuth,
        uid,
        email: "externo.aluno@gmail.com",
        displayName: "Estudante Externo",
        emailVerified: true,
      });

      expect(secondRun.reconciled).toBe(false);
      expect(secondRun.alreadyConsistent).toBe(true);
      expect(secondRun.reason).toBe("ALREADY_CONSISTENT");
      expect(Object.keys(harness.store.audit_logs).length).toBe(1);
    });

    it("cria /users/{uid} ausente na reconciliação server-side de ALUNO sem elevar para ADMIN ou SERVIDOR", async () => {
      const uid = "uid-ext-aluno-newdoc";
      const harness = createInMemoryAdminHarness({
        role_assignments: {
          [uid]: {
            targetUserId: uid,
            targetEmail: "novo.aluno.externo@gmail.com",
            assignedRole: "ALUNO",
            approvalStatus: "APROVADO",
            active: true,
            assignedByUid: ROOT_ADMIN_UID,
            assignedByEmail: ROOT_ADMIN_EMAIL,
          },
        },
      });

      const res = await reconcileSingleUserProfile({
        adminFirestore: harness.adminFirestore,
        adminAuth: harness.adminAuth,
        uid,
        email: "novo.aluno.externo@gmail.com",
        displayName: "Novo Aluno Externo",
        emailVerified: true,
      });

      expect(res.reconciled).toBe(true);
      expect(res.assignedRole).toBe("ALUNO");
      expect(harness.store.users[uid]).toMatchObject({
        id: uid,
        email: "novo.aluno.externo@gmail.com",
        role: "ALUNO",
        approvalStatus: "APROVADO",
        status: "active",
        active: true,
        admin: false,
        emailVerified: true,
      });
    });

    it("bloqueia reconciliação para emailVerified: false, atribuição revogada/pendente/divergente ou e-mail do Root Admin", async () => {
      const uid = "uid-guard-tests";
      const harness = createInMemoryAdminHarness({
        role_assignments: {
          [uid]: {
            targetUserId: uid,
            targetEmail: "teste.externo@gmail.com",
            assignedRole: "ALUNO",
            approvalStatus: "APROVADO",
            active: true,
          },
          "uid-revoked": {
            targetUserId: "uid-revoked",
            targetEmail: "revoked@gmail.com",
            assignedRole: "ALUNO",
            approvalStatus: "APROVADO",
            active: false,
          },
          "uid-pending": {
            targetUserId: "uid-pending",
            targetEmail: "pending@gmail.com",
            assignedRole: "ALUNO",
            approvalStatus: "PENDENTE",
            active: true,
          },
          "uid-mismatch": {
            targetUserId: "other-uid",
            targetEmail: "mismatch@gmail.com",
            assignedRole: "ALUNO",
            approvalStatus: "APROVADO",
            active: true,
          },
          [DIVERGENT_UID_1]: {
            targetUserId: DIVERGENT_UID_1,
            targetEmail: ROOT_ADMIN_EMAIL,
            assignedRole: "ADMIN",
            approvalStatus: "APROVADO",
            active: true,
          },
        },
      });

      const unverifiedRes = await reconcileSingleUserProfile({
        adminFirestore: harness.adminFirestore,
        adminAuth: harness.adminAuth,
        uid,
        email: "teste.externo@gmail.com",
        emailVerified: false,
      });
      expect(unverifiedRes.reconciled).toBe(false);
      expect(unverifiedRes.reason).toBe("EMAIL_NOT_VERIFIED");
      expect(harness.store.users[uid]).toBeUndefined();

      const revokedRes = await reconcileSingleUserProfile({
        adminFirestore: harness.adminFirestore,
        adminAuth: harness.adminAuth,
        uid: "uid-revoked",
        email: "revoked@gmail.com",
        emailVerified: true,
      });
      expect(revokedRes.reconciled).toBe(false);
      expect(revokedRes.reason).toBe("NO_ACTIVE_APPROVED_ASSIGNMENT");

      const pendingRes = await reconcileSingleUserProfile({
        adminFirestore: harness.adminFirestore,
        adminAuth: harness.adminAuth,
        uid: "uid-pending",
        email: "pending@gmail.com",
        emailVerified: true,
      });
      expect(pendingRes.reconciled).toBe(false);
      expect(pendingRes.reason).toBe("NO_ACTIVE_APPROVED_ASSIGNMENT");

      const mismatchRes = await reconcileSingleUserProfile({
        adminFirestore: harness.adminFirestore,
        adminAuth: harness.adminAuth,
        uid: "uid-mismatch",
        email: "mismatch@gmail.com",
        emailVerified: true,
      });
      expect(mismatchRes.reconciled).toBe(false);
      expect(mismatchRes.reason).toBe("NO_ACTIVE_APPROVED_ASSIGNMENT");

      const divergentRootRes = await reconcileSingleUserProfile({
        adminFirestore: harness.adminFirestore,
        adminAuth: harness.adminAuth,
        uid: DIVERGENT_UID_1,
        email: ROOT_ADMIN_EMAIL,
        emailVerified: true,
      });
      expect(divergentRootRes.reconciled).toBe(false);
      expect(divergentRootRes.reason).toBe("ROOT_ADMIN_SKIPPED");
      expect(harness.store.users[DIVERGENT_UID_1]).toBeUndefined();
    });
  });

  describe("5. Contas Suspensas, Banidas e Inativas (Fail-Closed em Listeners e Reconciliação)", () => {
    it.each([
      { label: "suspensa", patch: { status: "suspended" as const, active: true } },
      { label: "banida", patch: { status: "banned" as const, active: true } },
      { label: "inativa (active: false)", patch: { status: "active" as const, active: false } },
    ])(
      "bloqueia listeners de claims/notifications e impede reconciliação para conta $label",
      async ({ patch }) => {
        const uid = `uid-blocked-${patch.status}-${String(patch.active)}`;
        const authUser = { uid, email: "usuario@estudantes.ifpr.edu.br", emailVerified: true };
        const blockedUser = {
          id: uid,
          email: "usuario@estudantes.ifpr.edu.br",
          role: "ALUNO" as const,
          approvalStatus: "APROVADO" as const,
          ...patch,
        };

        const session = evaluateListenerSession({
          authLoading: false,
          firebaseUser: authUser,
          currentUser: blockedUser,
          hasPersistedUserDoc: true,
        });
        expect(session.isAccountActive).toBe(false);
        expect(session.isApprovedStaffOrAdmin).toBe(false);
        expect(
          getClaimsListenerScope({
            authLoading: false,
            firebaseUser: authUser,
            currentUser: blockedUser,
            hasPersistedUserDoc: true,
          })
        ).toBe("NONE");
        expect(
          getNotificationsListenerScope({
            authLoading: false,
            firebaseUser: authUser,
            currentUser: blockedUser,
            hasPersistedUserDoc: true,
          })
        ).toBe("NONE");

        const harness = createInMemoryAdminHarness({
          users: { [uid]: blockedUser },
          role_assignments: {
            [uid]: {
              targetUserId: uid,
              targetEmail: "usuario@estudantes.ifpr.edu.br",
              assignedRole: "ALUNO",
              approvalStatus: "APROVADO",
              active: true,
            },
          },
        });

        const reconcileRes = await reconcileSingleUserProfile({
          adminFirestore: harness.adminFirestore,
          adminAuth: harness.adminAuth,
          uid,
          email: "usuario@estudantes.ifpr.edu.br",
          emailVerified: true,
        });
        expect(reconcileRes.reconciled).toBe(false);
        expect(reconcileRes.reason).toBe("ACCOUNT_BLOCKED_OR_INACTIVE");
        expect(harness.setCustomUserClaims).not.toHaveBeenCalled();
      }
    );
  });

  describe("6. Bloqueio de Listeners de claims e notifications Antes da Persistência de /users/{uid}", () => {
    it.each([
      {
        label: "INTRUSO verificado",
        role: "INTRUSO" as const,
        approvalStatus: "APROVADO" as const,
        expectedClaimsAfter: "SELF" as const,
        expectedNotifsAfter: "SELF" as const,
      },
      {
        label: "ALUNO aprovado",
        role: "ALUNO" as const,
        approvalStatus: "APROVADO" as const,
        expectedClaimsAfter: "SELF" as const,
        expectedNotifsAfter: "SELF" as const,
      },
      {
        label: "SERVIDOR aprovado",
        role: "SERVIDOR" as const,
        approvalStatus: "APROVADO" as const,
        expectedClaimsAfter: "ALL" as const,
        expectedNotifsAfter: "SELF" as const,
      },
      {
        label: "ADMIN designado aprovado",
        role: "ADMIN" as const,
        approvalStatus: "APROVADO" as const,
        expectedClaimsAfter: "ALL" as const,
        expectedNotifsAfter: "ALL" as const,
      },
    ])(
      "mantém claims e notifications bloqueados (NONE) para $label enquanto hasPersistedUserDoc === false e libera após persistência",
      ({ role, approvalStatus, expectedClaimsAfter, expectedNotifsAfter }) => {
        const uid = `uid-persist-${role.toLowerCase()}`;
        const authUser = { uid, email: `${role.toLowerCase()}@ifpr.edu.br`, emailVerified: true };
        const user = {
          id: uid,
          email: authUser.email,
          role,
          approvalStatus,
          status: "active" as const,
          active: true,
        };

        // Antes da confirmação da persistência de /users/{uid}
        const preSession = evaluateListenerSession({
          authLoading: false,
          firebaseUser: authUser,
          currentUser: user,
          hasPersistedUserDoc: false,
        });
        expect(preSession.isSessionReady).toBe(false);
        expect(
          getClaimsListenerScope({
            authLoading: false,
            firebaseUser: authUser,
            currentUser: user,
            hasPersistedUserDoc: false,
          })
        ).toBe("NONE");
        expect(
          getNotificationsListenerScope({
            authLoading: false,
            firebaseUser: authUser,
            currentUser: user,
            hasPersistedUserDoc: false,
          })
        ).toBe("NONE");

        // Após confirmação da persistência de /users/{uid}
        expect(
          getClaimsListenerScope({
            authLoading: false,
            firebaseUser: authUser,
            currentUser: user,
            hasPersistedUserDoc: true,
          })
        ).toBe(expectedClaimsAfter);
        expect(
          getNotificationsListenerScope({
            authLoading: false,
            firebaseUser: authUser,
            currentUser: user,
            hasPersistedUserDoc: true,
          })
        ).toBe(expectedNotifsAfter);
      }
    );
  });

  describe("7. Preservação Integral de firestore.rules (SHA-256 Inalterado)", () => {
    it("confirma que firestore.rules local permanece bit-a-bit idêntico ao SHA-256 exigido", () => {
      const rulesPath = path.resolve(__dirname, "../../firestore.rules");
      const content = fs.readFileSync(rulesPath);
      const hash = crypto.createHash("sha256").update(content).digest("hex");
      expect(hash).toBe(EXPECTED_FIRESTORE_RULES_SHA256);
    });
  });
});
