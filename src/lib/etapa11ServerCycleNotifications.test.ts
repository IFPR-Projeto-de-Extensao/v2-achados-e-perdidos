import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import http from "http";

const VALID_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const STAFF_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mP8z8BQzwAEjDAGACfUAwH8+y4PAAAAAElFTkSuQmCC";

const hoisted = vi.hoisted(() => {
  const store: Record<string, Map<string, any>> = {
    users: new Map(),
    items: new Map(),
    item_return_records: new Map(),
    claims: new Map(),
    signature_requests: new Map(),
    audit_logs: new Map(),
    activity_logs: new Map(),
    email_notifications: new Map(),
    role_assignments: new Map(),
  };

  const tokenUsers = new Map<string, any>();
  let smtpMode: "OK" | "FAIL" = "OK";
  const sentEmails: Array<any> = [];

  const resetAll = () => {
    for (const col of Object.values(store)) {
      col.clear();
    }
    tokenUsers.clear();
    smtpMode = "OK";
    sentEmails.length = 0;
  };

  let txLock: Promise<void> = Promise.resolve();
  const withTxLock = async <T>(fn: () => Promise<T>): Promise<T> => {
    const prev = txLock;
    let release!: () => void;
    txLock = new Promise<void>((res) => {
      release = res;
    });
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  };

  const applyPayload = (prev: Record<string, any>, payload: Record<string, any>, merge: boolean) => {
    const base = merge ? { ...prev } : {};
    for (const [k, v] of Object.entries(payload)) {
      if (v && typeof v === "object" && (v as any).__isDeleteTransform) {
        delete base[k];
      } else {
        base[k] = structuredClone(v);
      }
    }
    return base;
  };

  const makeDocRef = (colName: string, docId: string) => ({
    id: docId,
    _col: colName,
    async get() {
      const data = store[colName]?.get(docId);
      return {
        id: docId,
        exists: Boolean(data),
        data: () => (data ? structuredClone(data) : undefined),
      };
    },
    async set(payload: Record<string, any>, opts?: { merge?: boolean }) {
      if (!store[colName]) store[colName] = new Map();
      const prev = store[colName].get(docId) || {};
      store[colName].set(docId, applyPayload(prev, payload, Boolean(opts?.merge)));
    },
    async update(payload: Record<string, any>) {
      if (!store[colName]?.has(docId)) {
        throw new Error(`Document ${colName}/${docId} does not exist`);
      }
      const prev = store[colName].get(docId) || {};
      store[colName].set(docId, applyPayload(prev, payload, true));
    },
  });

  const makeQuery = (colName: string, filters: Array<{ field: string; value: any }> = []) => ({
    where(field: string, _op: string, value: any) {
      return makeQuery(colName, [...filters, { field, value }]);
    },
    limit(_n: number) {
      return this;
    },
    async get() {
      const col = store[colName] || new Map();
      const matchedDocs: any[] = [];
      for (const [docId, docData] of col.entries()) {
        const matches = filters.every((f) => docData?.[f.field] === f.value);
        if (matches) {
          matchedDocs.push({
            id: docId,
            ref: makeDocRef(colName, docId),
            data: () => structuredClone(docData),
          });
        }
      }
      return { docs: matchedDocs, size: matchedDocs.length, empty: matchedDocs.length === 0 };
    },
  });

  const mockDb = {
    collection(colName: string) {
      return {
        doc: (docId: string) => makeDocRef(colName, docId),
        where: (field: string, _op: string, value: any) =>
          makeQuery(colName, [{ field, value }]),
        limit: (n: number) => makeQuery(colName, []).limit(n),
        get: () => makeQuery(colName, []).get(),
      };
    },
    async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      return withTxLock(async () => {
        let wrote = false;
        const pendingOps: Array<() => Promise<void>> = [];
        const tx = {
          async get(target: any) {
            if (wrote) {
              throw new Error("Firestore transactions require all reads before all writes.");
            }
            return target.get();
          },
          update(ref: any, data: Record<string, any>) {
            wrote = true;
            pendingOps.push(() => ref.update(data));
          },
          set(ref: any, data: Record<string, any>, opts?: { merge?: boolean }) {
            wrote = true;
            pendingOps.push(() => ref.set(data, opts));
          },
        };
        const res = await fn(tx);
        for (const op of pendingOps) {
          await op();
        }
        return res;
      });
    },
  };

  return {
    store,
    tokenUsers,
    resetAll,
    mockDb,
    sentEmails,
    setSmtpMode: (m: "OK" | "FAIL") => {
      smtpMode = m;
    },
    getSmtpMode: () => smtpMode,
  };
});

vi.mock("firebase-admin/app", () => ({
  getApps: () => [{ name: "mock-admin-app" }],
  initializeApp: () => ({ name: "mock-admin-app" }),
  cert: (c: any) => c,
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({
    async verifyIdToken(token: string) {
      const user = hoisted.tokenUsers.get(token);
      if (!user) throw new Error("Invalid mocked ID token");
      return user;
    },
  }),
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => hoisted.mockDb,
  FieldValue: {
    delete: () => ({ __isDeleteTransform: true }),
    serverTimestamp: () => new Date().toISOString(),
  },
  Timestamp: {
    now: () => ({ toDate: () => new Date(), toMillis: () => Date.now() }),
    fromDate: (d: Date) => ({ toDate: () => d, toMillis: () => d.getTime() }),
  },
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      async sendMail(mail: any) {
        if (hoisted.getSmtpMode() === "FAIL") {
          throw new Error("SMTP connection refused by test server");
        }
        hoisted.sentEmails.push(mail);
        return { messageId: `msg-${hoisted.sentEmails.length}` };
      },
    }),
  },
}));

import app from "../../server";

describe("ETAPA 11 — Ciclo de Devolução, Reabertura, Notificação Pós-Reabertura e Preservação dos Fluxos Formais", () => {
  let server: http.Server;
  let baseUrl = "";
  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    originalEnv.SIGNATURE_TOKEN_SECRET = process.env.SIGNATURE_TOKEN_SECRET;
    originalEnv.SMTP_HOST = process.env.SMTP_HOST;
    originalEnv.SMTP_USER = process.env.SMTP_USER;
    originalEnv.SMTP_PASS = process.env.SMTP_PASS;
    process.env.SIGNATURE_TOKEN_SECRET = "test-secret-etapa11-minimum-32-chars-ok";
    process.env.SMTP_HOST = "smtp.ifpr-test.local";
    process.env.SMTP_USER = "achados@ifpr.edu.br";
    process.env.SMTP_PASS = "smtp-app-pass";

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    process.env.SIGNATURE_TOKEN_SECRET = originalEnv.SIGNATURE_TOKEN_SECRET;
    process.env.SMTP_HOST = originalEnv.SMTP_HOST;
    process.env.SMTP_USER = originalEnv.SMTP_USER;
    process.env.SMTP_PASS = originalEnv.SMTP_PASS;
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  beforeEach(() => {
    hoisted.resetAll();

    hoisted.tokenUsers.set("tok-serv-1", {
      uid: "serv-1",
      email: "servidor1@ifpr.edu.br",
      email_verified: true,
    });
    hoisted.tokenUsers.set("tok-admin-1", {
      uid: "admin-1",
      email: "admin1@ifpr.edu.br",
      email_verified: true,
      role: "ADMIN",
      admin: true,
    });

    hoisted.store.users.set("serv-1", {
      id: "serv-1",
      name: "Carlos Servidor",
      email: "servidor1@ifpr.edu.br",
      role: "SERVIDOR",
      approvalStatus: "APROVADO",
      status: "active",
    });
    hoisted.store.users.set("admin-1", {
      id: "admin-1",
      name: "Admin Oficial",
      email: "admin1@ifpr.edu.br",
      role: "ADMIN",
      approvalStatus: "APROVADO",
      status: "active",
    });

    hoisted.store.items.set("item-cycle-1", {
      id: "item-cycle-1",
      title: "Notebook Dell Prata",
      type: "ENCONTRADO",
      status: "ENCONTRADO",
      category: "Eletrônicos",
      location: "Biblioteca IFPR",
      registeredByUserId: "serv-1",
      registeredByRole: "SERVIDOR",
      history: [],
    });

    hoisted.store.claims.set("claim-cycle-1", {
      id: "claim-cycle-1",
      itemId: "item-cycle-1",
      claimerId: "aluno-1",
      status: "APROVADO",
      distinctiveFeatures: "Adesivo verde na tampa",
    });
  });

  async function postJson(route: string, body: any, bearer?: string) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const res = await fetch(`${baseUrl}${route}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  }

  it("permite notificar assinatura concluída no Ciclo 1, invalida token antigo após reabertura e permite nova notificação no Ciclo 2 sem duplicação", async () => {
    // 1. Ciclo 1: devolução formal remota
    const ret1 = await postJson(
      "/api/items/register-return",
      {
        itemId: "item-cycle-1",
        recipientName: "Ana Paula",
        recipientEmail: "ana@estudantes.ifpr.edu.br",
        recipientBond: "Aluno",
        recipientDocument: "2026101",
        identityVerified: true,
        signatureType: "REMOTE_EMAIL",
        originUrl: "https://localiza.ifpr.edu.br",
      },
      "tok-serv-1"
    );
    expect(ret1.status).toBe(200);
    expect(ret1.json.returnCycle).toBe(1);
    const tokenCycle1 = new URL(ret1.json.signatureLink).searchParams.get("token")!;
    expect(tokenCycle1).toBeTruthy();

    // Claim deve ter sido concluída atomicamente
    expect(hoisted.store.claims.get("claim-cycle-1")?.status).toBe("CONCLUIDO");

    // 2. Receptor assina no Ciclo 1
    const confirm1 = await postJson("/api/signature/confirm-signature", {
      itemId: "item-cycle-1",
      token: tokenCycle1,
      signatureDataUrl: VALID_PNG,
    });
    expect(confirm1.status).toBe(200);

    // 3. Notificação de assinatura concluída no Ciclo 1 -> 200 (sig_done_item-cycle-1)
    const notify1 = await postJson("/api/signature/notify-signed", {
      itemId: "item-cycle-1",
      token: tokenCycle1,
      signerName: "Ana Paula",
      signerEmail: "ana@estudantes.ifpr.edu.br",
      signedAt: confirm1.json.signedAt,
    });
    expect(notify1.status).toBe(200);
    expect(notify1.json.notificationId).toBe("sig_done_item-cycle-1");
    expect(notify1.json.returnCycle).toBe(1);

    // Duplicação no Ciclo 1 -> 409
    const dup1 = await postJson("/api/signature/notify-signed", {
      itemId: "item-cycle-1",
      token: tokenCycle1,
    });
    expect(dup1.status).toBe(409);
    expect(dup1.json.code).toBe("NOTIFICATION_ALREADY_LOGGED");

    // 4. Reabertura administrativa pelo ADMIN
    const reopen = await postJson(
      "/api/items/reopen-return",
      {
        itemId: "item-cycle-1",
        reason: "Entrega registrada para aluno homônimo por equívoco.",
      },
      "tok-admin-1"
    );
    expect(reopen.status).toBe(200);
    expect(reopen.json.previousStatus).toBe("ENCONTRADO");
    expect(reopen.json.signatureRequestInvalidated).toBe(true);
    expect(hoisted.store.claims.get("claim-cycle-1")?.status).toBe("APROVADO");
    // Registro histórico de notificação do Ciclo 1 permanece preservado para auditoria
    expect(hoisted.store.email_notifications.has("sig_done_item-cycle-1")).toBe(true);

    // Token do Ciclo 1 deve retornar 410 TOKEN_INVALIDATED em todas as rotas
    const verifyOld = await postJson("/api/signature/verify-token", {
      itemId: "item-cycle-1",
      token: tokenCycle1,
    });
    expect(verifyOld.status).toBe(410);
    expect(verifyOld.json.reason).toBe("TOKEN_INVALIDATED");

    const confirmOld = await postJson("/api/signature/confirm-signature", {
      itemId: "item-cycle-1",
      token: tokenCycle1,
      signatureDataUrl: VALID_PNG,
    });
    expect(confirmOld.status).toBe(410);

    const notifyOld = await postJson("/api/signature/notify-signed", {
      itemId: "item-cycle-1",
      token: tokenCycle1,
    });
    expect(notifyOld.status).toBe(410);
    expect(notifyOld.json.code).toBe("TOKEN_INVALIDATED");

    // 5. Ciclo 2: nova devolução formal remota após reabertura
    const ret2 = await postJson(
      "/api/items/register-return",
      {
        itemId: "item-cycle-1",
        recipientName: "Ana Paula Verdadeira",
        recipientEmail: "ana.verdadeira@estudantes.ifpr.edu.br",
        recipientBond: "Aluno",
        recipientDocument: "2026999",
        identityVerified: true,
        signatureType: "REMOTE_EMAIL",
        originUrl: "https://localiza.ifpr.edu.br",
      },
      "tok-serv-1"
    );
    expect(ret2.status).toBe(200);
    expect(ret2.json.returnCycle).toBe(2);
    const tokenCycle2 = new URL(ret2.json.signatureLink).searchParams.get("token")!;
    expect(tokenCycle2).not.toBe(tokenCycle1);

    // Token antigo do Ciclo 1 continua rejeitado mesmo no Ciclo 2 (tokenHash diferente -> 403)
    const oldTokenInCycle2 = await postJson("/api/signature/verify-token", {
      itemId: "item-cycle-1",
      token: tokenCycle1,
    });
    expect(oldTokenInCycle2.status).toBe(403);

    // 6. Assinatura remota do Ciclo 2
    const confirm2 = await postJson("/api/signature/confirm-signature", {
      itemId: "item-cycle-1",
      token: tokenCycle2,
      signatureDataUrl: VALID_PNG,
    });
    expect(confirm2.status).toBe(200);

    // 7. Notificação de conclusão no Ciclo 2 (concorrência: apenas 1 sucesso 200 e 1 rejeição 409)
    const [raceA, raceB] = await Promise.all([
      postJson("/api/signature/notify-signed", {
        itemId: "item-cycle-1",
        token: tokenCycle2,
        signerName: "Ana Paula Verdadeira",
        signerEmail: "ana.verdadeira@estudantes.ifpr.edu.br",
        signedAt: confirm2.json.signedAt,
      }),
      postJson("/api/signature/notify-signed", {
        itemId: "item-cycle-1",
        token: tokenCycle2,
        signerName: "Ana Paula Verdadeira",
        signerEmail: "ana.verdadeira@estudantes.ifpr.edu.br",
        signedAt: confirm2.json.signedAt,
      }),
    ]);

    const statuses = [raceA.status, raceB.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);

    const winner = raceA.status === 200 ? raceA : raceB;
    expect(winner.json.notificationId).toBe("sig_done_item-cycle-1_c2");
    expect(winner.json.returnCycle).toBe(2);

    // Ambos registros históricos de notificação existem independentemente
    expect(hoisted.store.email_notifications.has("sig_done_item-cycle-1")).toBe(true);
    expect(hoisted.store.email_notifications.has("sig_done_item-cycle-1_c2")).toBe(true);

    // 8. Atestação institucional do servidor emissor no Ciclo 2 continua funcional
    const staffSign = await postJson(
      "/api/signature/confirm-staff-signature",
      {
        itemId: "item-cycle-1",
        signatureDataUrl: STAFF_PNG,
        signatureMethod: "DRAWN",
      },
      "tok-serv-1"
    );
    expect(staffSign.status).toBe(200);
    expect(staffSign.json.success).toBe(true);
  });

  it("mantém devolução presencial com versionamento de notificação pós-reabertura e não reverte persistência se SMTP falhar", async () => {
    // Ciclo 1 presencial
    const inPerson1 = await postJson(
      "/api/items/register-return",
      {
        itemId: "item-cycle-1",
        recipientName: "João Aluno",
        recipientEmail: "joao@estudantes.ifpr.edu.br",
        recipientBond: "Aluno",
        recipientDocument: "2026001",
        identityVerified: true,
        signatureType: "IN_PERSON_DEVICE",
        signatureDataUrl: VALID_PNG,
      },
      "tok-serv-1"
    );
    expect(inPerson1.status).toBe(200);
    expect(inPerson1.json.returnCycle).toBe(1);
    expect(inPerson1.json.emailDispatched).toBe(true);
    expect(hoisted.store.email_notifications.has("email_auto_item-cycle-1_ITEM_RETURNED")).toBe(true);

    // Reabertura administrativa
    const reopen = await postJson(
      "/api/items/reopen-return",
      {
        itemId: "item-cycle-1",
        reason: "Necessário novo termo presencial com documento atualizado.",
      },
      "tok-admin-1"
    );
    expect(reopen.status).toBe(200);

    // Simular falha SMTP no Ciclo 2 — devolução formal deve persistir normalmente com notificationWarning
    hoisted.setSmtpMode("FAIL");

    const inPerson2 = await postJson(
      "/api/items/register-return",
      {
        itemId: "item-cycle-1",
        recipientName: "João Aluno",
        recipientEmail: "joao@estudantes.ifpr.edu.br",
        recipientBond: "Aluno",
        recipientDocument: "2026002",
        identityVerified: true,
        signatureType: "IN_PERSON_DEVICE",
        signatureDataUrl: VALID_PNG,
      },
      "tok-serv-1"
    );
    expect(inPerson2.status).toBe(200);
    expect(inPerson2.json.returnCycle).toBe(2);
    expect(inPerson2.json.emailDispatched).toBe(false);
    expect(inPerson2.json.emailStatus).toBe("FAILED");
    expect(inPerson2.json.notificationWarning).toBeTruthy();

    // Persistência oficial garantida em /items e /item_return_records
    expect(hoisted.store.items.get("item-cycle-1")?.status).toBe("DEVOLVIDO");
    expect(hoisted.store.item_return_records.get("item-cycle-1")?.returnCycle).toBe(2);
    expect(hoisted.store.email_notifications.has("email_auto_item-cycle-1_ITEM_RETURNED_c2")).toBe(true);
  });
});
