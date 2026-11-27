import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  clearEmailServiceRuntimeState,
  getEmailProviderConfig,
  getEmailServiceDiagnostics,
  getLastEmailDispatchSnapshot,
  maskEmailAddress,
  sanitizeEmailSensitiveText,
  sendTransactionalEmail,
  validateRecipientAddresses,
  validateSenderAddress,
  type ResendClientLike,
} from "../../api/_lib/emailService";
import {
  executeAdminCreateUser,
  executeAdminSendFirstAccessLink,
  executeFormalItemReturn,
  executePublicPasswordResetRequest,
  sendMatchNotificationEmail,
} from "../../server";

function createMockAdminAuth(options?: {
  initialUsers?: Array<{
    uid: string;
    email: string;
    displayName?: string;
    emailVerified?: boolean;
    disabled?: boolean;
    customClaims?: Record<string, any>;
  }>;
}) {
  const usersByUid = new Map<string, any>();
  const uidByEmail = new Map<string, string>();
  const customClaims = new Map<string, Record<string, any>>();
  let seq = 1;

  for (const u of options?.initialUsers || []) {
    const emailLower = u.email.toLowerCase();
    usersByUid.set(u.uid, { ...u, email: emailLower });
    uidByEmail.set(emailLower, u.uid);
  }

  return {
    usersByUid,
    uidByEmail,
    customClaims,
    async getUser(uid: string) {
      const found = usersByUid.get(uid);
      if (!found) {
        const err: any = new Error("User not found");
        err.code = "auth/user-not-found";
        throw err;
      }
      return structuredClone(found);
    },
    async getUserByEmail(email: string) {
      const uid = uidByEmail.get(email.toLowerCase());
      if (!uid) {
        const err: any = new Error("User not found");
        err.code = "auth/user-not-found";
        throw err;
      }
      return structuredClone(usersByUid.get(uid));
    },
    async createUser(payload: any) {
      const emailLower = String(payload.email || "").toLowerCase();
      if (uidByEmail.has(emailLower)) {
        const err: any = new Error("Email already exists");
        err.code = "auth/email-already-exists";
        throw err;
      }
      const uid = payload.uid || `resend_uid_${seq++}`;
      const record = {
        uid,
        email: emailLower,
        displayName: payload.displayName || "",
        emailVerified: Boolean(payload.emailVerified),
        disabled: Boolean(payload.disabled),
      };
      usersByUid.set(uid, record);
      uidByEmail.set(emailLower, uid);
      return structuredClone(record);
    },
    async deleteUser(uid: string) {
      const existing = usersByUid.get(uid);
      if (existing) {
        uidByEmail.delete(existing.email);
        usersByUid.delete(uid);
      }
    },
    async setCustomUserClaims(uid: string, claims: Record<string, any>) {
      customClaims.set(uid, structuredClone(claims));
    },
    async generatePasswordResetLink(email: string, actionSettings?: any) {
      const uid = uidByEmail.get(email.toLowerCase());
      if (!uid) {
        const err: any = new Error("User not found");
        err.code = "auth/user-not-found";
        throw err;
      }
      const code = `OOB_SECRET_${uid}_${Date.now()}`;
      const continueUrl = actionSettings?.url
        ? `&continueUrl=${encodeURIComponent(actionSettings.url)}`
        : "";
      return `https://achados-e-perdidos-ifpr.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=${code}${continueUrl}`;
    },
  };
}

function createInMemoryFirestore(seed?: Record<string, Record<string, any>>) {
  const store = new Map<string, Map<string, any>>();

  const ensureCol = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };

  if (seed) {
    for (const [col, docs] of Object.entries(seed)) {
      const map = ensureCol(col);
      for (const [docId, docData] of Object.entries(docs)) {
        map.set(docId, structuredClone(docData));
      }
    }
  }

  const makeDocRef = (colName: string, docId: string) => ({
    id: docId,
    __colName: colName,
    async get() {
      const data = ensureCol(colName).get(docId);
      return {
        id: docId,
        exists: data !== undefined,
        data: () => (data !== undefined ? structuredClone(data) : undefined),
      };
    },
    async set(payload: Record<string, any>, opts?: { merge?: boolean }) {
      const col = ensureCol(colName);
      if (opts?.merge && col.has(docId)) {
        col.set(docId, { ...col.get(docId), ...structuredClone(payload) });
      } else {
        col.set(docId, structuredClone(payload));
      }
    },
    async update(payload: Record<string, any>) {
      const col = ensureCol(colName);
      const existing = col.get(docId) || {};
      col.set(docId, { ...existing, ...structuredClone(payload) });
    },
  });

  const db: any = {
    store,
    collection(colName: string) {
      const makeQuery = (filters: Array<{ field: string; op: string; value: any }> = []) => ({
        where(field: string, op: string, value: any) {
          return makeQuery([...filters, { field, op, value }]);
        },
        orderBy(_field: string, _dir?: string) {
          return makeQuery(filters);
        },
        limit(n: number) {
          return {
            async get() {
              const all = Array.from(ensureCol(colName).entries())
                .filter(([, data]) =>
                  filters.every((f) => {
                    if (f.op === "==") return data?.[f.field] === f.value;
                    if (f.op === "in" && Array.isArray(f.value)) return f.value.includes(data?.[f.field]);
                    return true;
                  })
                )
                .slice(0, n)
                .map(([id, data]) => ({
                  id,
                  exists: true,
                  ref: makeDocRef(colName, id),
                  data: () => structuredClone(data),
                }));
              return { empty: all.length === 0, docs: all };
            },
          };
        },
        async get() {
          const all = Array.from(ensureCol(colName).entries())
            .filter(([, data]) =>
              filters.every((f) => {
                if (f.op === "==") return data?.[f.field] === f.value;
                if (f.op === "in" && Array.isArray(f.value)) return f.value.includes(data?.[f.field]);
                return true;
              })
            )
            .map(([id, data]) => ({
              id,
              exists: true,
              ref: makeDocRef(colName, id),
              data: () => structuredClone(data),
            }));
          return { empty: all.length === 0, docs: all };
        },
      });

      return {
        doc(docId: string) {
          return makeDocRef(colName, docId);
        },
        where(field: string, op: string, value: any) {
          return makeQuery([{ field, op, value }]);
        },
        orderBy(field: string, dir?: string) {
          return makeQuery([]).orderBy(field, dir);
        },
      };
    },
    async runTransaction(fn: (tx: any) => Promise<any>) {
      const tx = {
        async get(refOrQuery: any) {
          return await refOrQuery.get();
        },
        set(ref: any, payload: Record<string, any>, opts?: { merge?: boolean }) {
          const col = ensureCol(ref.__colName);
          if (opts?.merge && col.has(ref.id)) {
            col.set(ref.id, { ...col.get(ref.id), ...structuredClone(payload) });
          } else {
            col.set(ref.id, structuredClone(payload));
          }
        },
        update(ref: any, payload: Record<string, any>) {
          const col = ensureCol(ref.__colName);
          const existing = col.get(ref.id) || {};
          col.set(ref.id, { ...existing, ...structuredClone(payload) });
        },
      };
      return await fn(tx);
    },
  };

  return db;
}

describe("Resend Transactional Email Service — Core, Fallback, Flows & Security", () => {
  beforeEach(() => {
    clearEmailServiceRuntimeState();
    vi.restoreAllMocks();
  });

  // 1. Envio bem-sucedido via Resend
  it("1. sends transactional email via Resend with messageId, SENT status, and idempotencyKey", async () => {
    const sentCalls: any[] = [];
    const mockResend: ResendClientLike = {
      emails: {
        send: vi.fn(async (payload, options) => {
          sentCalls.push({ payload, options });
          return { data: { id: "re_msg_001_ok" }, error: null };
        }),
      },
    };

    const result = await sendTransactionalEmail(
      {
        to: "aluno.teste@estudantes.ifpr.edu.br",
        subject: "Bem-vindo ao Localiza+",
        text: "Seu acesso foi configurado.",
        html: "<p>Seu acesso foi configurado.</p>",
        category: "FIRST_ACCESS_SETUP",
        dedupeKey: "welcome:aluno:1",
        tags: [{ name: "flow", value: "first_access" }],
      },
      {
        resendClient: mockResend,
        env: {
          RESEND_API_KEY: "re_test_secret_key_1234567890",
          RESEND_FROM_EMAIL: "Localiza+ IFPR <noreply@ifpr.edu.br>",
        },
      }
    );

    expect(result.sent).toBe(true);
    expect(result.status).toBe("SENT");
    expect(result.provider).toBe("RESEND");
    expect(result.messageId).toBe("re_msg_001_ok");
    expect(result.fallbackUsed).toBe(false);
    expect(sentCalls).toHaveLength(1);
    expect(sentCalls[0].payload.from).toBe("Localiza+ IFPR <noreply@ifpr.edu.br>");
    expect(sentCalls[0].options?.idempotencyKey).toBeTruthy();

    const snapshot = getLastEmailDispatchSnapshot();
    expect(snapshot?.provider).toBe("RESEND");
    expect(snapshot?.status).toBe("SENT");
    expect(snapshot?.messageId).toBe("re_msg_001_ok");
  });

  // 2. Falha de autenticação na API do Resend
  it("2. classifies Resend 401/invalid_api_key as AUTH_ERROR and redacts API key from error output", async () => {
    const mockResend: ResendClientLike = {
      emails: {
        send: vi.fn(async () => ({
          data: null,
          error: {
            statusCode: 401,
            name: "validation_error",
            message: "API key re_live_SUPERSECRETKEY999 is invalid (Unauthorized)",
          },
        })),
      },
    };

    const result = await sendTransactionalEmail(
      {
        to: "usuario@ifpr.edu.br",
        subject: "Teste Auth Resend",
        text: "Corpo de teste",
      },
      {
        resendClient: mockResend,
        allowSmtpFallback: false,
        env: {
          RESEND_API_KEY: "re_live_SUPERSECRETKEY999",
          RESEND_FROM_EMAIL: "Localiza+ <noreply@ifpr.edu.br>",
        },
      }
    );

    expect(result.sent).toBe(false);
    expect(result.status).toBe("ERROR");
    expect(result.provider).toBe("RESEND");
    expect(result.errorCode).toBe("AUTH_ERROR");
    expect(result.messageId).toBeNull();
    expect(result.error).toBeTruthy();
    expect(result.error).not.toContain("re_live_SUPERSECRETKEY999");
    expect(result.error).toContain("[REDACTED_RESEND_KEY]");
  });

  // 3. Indisponibilidade, timeout e rate limit do Resend
  it("3. handles Resend 503 unavailability, 429 rate limit, and timeouts without simulating success", async () => {
    const unavailableResend: ResendClientLike = {
      emails: {
        send: vi.fn(async () => ({
          data: null,
          error: { statusCode: 503, message: "Service Unavailable: upstream maintenance" },
        })),
      },
    };

    const res503 = await sendTransactionalEmail(
      { to: "dest@ifpr.edu.br", subject: "503", text: "Teste" },
      {
        resendClient: unavailableResend,
        allowSmtpFallback: false,
        env: {
          RESEND_API_KEY: "re_test_1234567890",
          RESEND_FROM_EMAIL: "noreply@ifpr.edu.br",
        },
      }
    );
    expect(res503.sent).toBe(false);
    expect(res503.status).toBe("ERROR");
    expect(res503.errorCode).toBe("SERVICE_UNAVAILABLE");

    const rateLimitedResend: ResendClientLike = {
      emails: {
        send: vi.fn(async () => ({
          data: null,
          error: { statusCode: 429, name: "rate_limit_exceeded", message: "Too many requests" },
        })),
      },
    };

    const res429 = await sendTransactionalEmail(
      { to: "dest@ifpr.edu.br", subject: "429", text: "Teste" },
      {
        resendClient: rateLimitedResend,
        allowSmtpFallback: false,
        env: {
          RESEND_API_KEY: "re_test_1234567890",
          RESEND_FROM_EMAIL: "noreply@ifpr.edu.br",
        },
      }
    );
    expect(res429.sent).toBe(false);
    expect(res429.status).toBe("ERROR");
    expect(res429.errorCode).toBe("RATE_LIMITED");

    const slowResend: ResendClientLike = {
      emails: {
        send: vi.fn(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve({ data: { id: "late" }, error: null }), 1500);
            })
        ),
      },
    };

    const resTimeout = await sendTransactionalEmail(
      { to: "dest@ifpr.edu.br", subject: "Timeout", text: "Teste", timeoutMs: 250 },
      {
        resendClient: slowResend,
        allowSmtpFallback: false,
        env: {
          RESEND_API_KEY: "re_test_1234567890",
          RESEND_FROM_EMAIL: "noreply@ifpr.edu.br",
        },
      }
    );
    expect(resTimeout.sent).toBe(false);
    expect(resTimeout.status).toBe("ERROR");
    expect(resTimeout.errorCode).toBe("TIMEOUT");
  });

  // 4. Ausência de variáveis de ambiente
  it("4. returns PENDING and never simulates success when neither Resend nor SMTP is configured", async () => {
    const result = await sendTransactionalEmail(
      {
        to: "aluno@estudantes.ifpr.edu.br",
        subject: "Sem provedor",
        text: "Teste sem variáveis",
      },
      {
        env: {},
      }
    );

    expect(result.sent).toBe(false);
    expect(result.status).toBe("PENDING");
    expect(result.provider).toBe("NONE");
    expect(result.errorCode).toBe("MISSING_CONFIG");
    expect(result.messageId).toBeNull();

    const cfg = getEmailProviderConfig({});
    expect(cfg.activeProvider).toBe("NONE");
    expect(cfg.configurationState).toBe("UNCONFIGURED");
    expect(cfg.emailConfigured).toBe(false);
  });

  // 5. Fallback temporário para SMTP
  it("5. falls back cleanly to temporary SMTP when Resend fails or is unconfigured", async () => {
    const smtpSendMail = vi.fn(async () => ({ messageId: "<smtp-fallback-42@ifpr.edu.br>" }));
    const mockTransporter: any = { sendMail: smtpSendMail };

    const failingResend: ResendClientLike = {
      emails: {
        send: vi.fn(async () => ({
          data: null,
          error: { statusCode: 503, message: "Resend temporary outage" },
        })),
      },
    };

    const resFallbackAfterResendFailure = await sendTransactionalEmail(
      {
        to: "servidor@ifpr.edu.br",
        subject: "Fallback após erro no Resend",
        text: "Corpo do e-mail",
      },
      {
        resendClient: failingResend,
        smtpTransporter: mockTransporter,
        env: {
          RESEND_API_KEY: "re_test_1234567890",
          RESEND_FROM_EMAIL: "Localiza+ <noreply@ifpr.edu.br>",
          SMTP_HOST: "smtp.ifpr.edu.br",
          SMTP_PORT: "587",
          SMTP_USER: "achados@ifpr.edu.br",
          SMTP_PASS: "smtp-secret-pass",
          SMTP_FROM: "Localiza+ <achados@ifpr.edu.br>",
        },
      }
    );

    expect(resFallbackAfterResendFailure.sent).toBe(true);
    expect(resFallbackAfterResendFailure.status).toBe("SENT");
    expect(resFallbackAfterResendFailure.provider).toBe("SMTP");
    expect(resFallbackAfterResendFailure.fallbackUsed).toBe(true);
    expect(resFallbackAfterResendFailure.fallbackReason).toContain("Resend");
    expect(resFallbackAfterResendFailure.messageId).toBe("<smtp-fallback-42@ifpr.edu.br>");
    expect(smtpSendMail).toHaveBeenCalledTimes(1);

    // Direct SMTP mode when Resend is not configured
    const resSmtpOnly = await sendTransactionalEmail(
      {
        to: "servidor@ifpr.edu.br",
        subject: "Apenas SMTP configurado",
        text: "Corpo SMTP",
      },
      {
        smtpTransporter: mockTransporter,
        env: {
          SMTP_HOST: "smtp.ifpr.edu.br",
          SMTP_USER: "achados@ifpr.edu.br",
          SMTP_PASS: "smtp-secret-pass",
        },
      }
    );
    expect(resSmtpOnly.sent).toBe(true);
    expect(resSmtpOnly.provider).toBe("SMTP");
    expect(resSmtpOnly.status).toBe("SENT");
  });

  // 6. Remetente inválido
  it("6. rejects invalid or CRLF-injected sender addresses (RESEND_FROM_EMAIL)", async () => {
    expect(validateSenderAddress("Localiza+ <noreply@ifpr.edu.br>").valid).toBe(true);
    expect(validateSenderAddress("not-an-email").valid).toBe(false);
    expect(validateSenderAddress("noreply@ifpr.edu.br\r\nBcc: evil@attacker.com").valid).toBe(false);

    const cfgInvalid = getEmailProviderConfig({
      RESEND_API_KEY: "re_test_1234567890",
      RESEND_FROM_EMAIL: "remetente-invalido-sem-arroba",
    });
    expect(cfgInvalid.configurationState).toBe("INVALID_CONFIG");
    expect(cfgInvalid.resend.configured).toBe(false);
    expect(cfgInvalid.resend.fromValid).toBe(false);

    const mockResend: ResendClientLike = {
      emails: { send: vi.fn(async () => ({ data: { id: "should_not_run" }, error: null })) },
    };

    const result = await sendTransactionalEmail(
      {
        to: "usuario@ifpr.edu.br",
        subject: "Remetente inválido",
        text: "Corpo",
      },
      {
        resendClient: mockResend,
        allowSmtpFallback: false,
        env: {
          RESEND_API_KEY: "re_test_1234567890",
          RESEND_FROM_EMAIL: "remetente-invalido",
        },
      }
    );

    expect(result.sent).toBe(false);
    expect(result.status).toBe("ERROR");
    expect(result.errorCode).toBe("INVALID_FROM_ADDRESS");
    expect(mockResend.emails.send).not.toHaveBeenCalled();
  });

  // 7. Erros de entrega e validação de destinatários
  it("7. handles delivery errors (422 / missing messageId) and invalid recipients honestly", async () => {
    expect(validateRecipientAddresses("bad-email").valid).toBe(false);
    expect(validateRecipientAddresses(["ok@ifpr.edu.br", "bad@"]).valid).toBe(false);

    const invalidRecipientRes = await sendTransactionalEmail(
      { to: "nao-e-email", subject: "Teste", text: "Corpo" },
      {
        env: {
          RESEND_API_KEY: "re_test_1234567890",
          RESEND_FROM_EMAIL: "noreply@ifpr.edu.br",
        },
      }
    );
    expect(invalidRecipientRes.sent).toBe(false);
    expect(invalidRecipientRes.errorCode).toBe("INVALID_RECIPIENT");

    const missingIdResend: ResendClientLike = {
      emails: {
        send: vi.fn(async () => ({ data: {}, error: null })),
      },
    };
    const resNoId = await sendTransactionalEmail(
      { to: "dest@ifpr.edu.br", subject: "Sem ID", text: "Corpo" },
      {
        resendClient: missingIdResend,
        allowSmtpFallback: false,
        env: {
          RESEND_API_KEY: "re_test_1234567890",
          RESEND_FROM_EMAIL: "noreply@ifpr.edu.br",
        },
      }
    );
    expect(resNoId.sent).toBe(false);
    expect(resNoId.status).toBe("ERROR");
    expect(resNoId.errorCode).toBe("DELIVERY_ERROR");
  });

  // 8. Prevenção de notificações duplicadas
  it("8. deduplicates repeated sends with same dedupeKey and allows retry after failure", async () => {
    let callCount = 0;
    const mockResend: ResendClientLike = {
      emails: {
        send: vi.fn(async () => {
          callCount += 1;
          return { data: { id: `re_dedupe_${callCount}` }, error: null };
        }),
      },
    };

    const env = {
      RESEND_API_KEY: "re_test_1234567890",
      RESEND_FROM_EMAIL: "Localiza+ <noreply@ifpr.edu.br>",
    };

    const first = await sendTransactionalEmail(
      {
        to: "aluno@estudantes.ifpr.edu.br",
        subject: "Aviso único",
        text: "Conteúdo único",
        dedupeKey: "notif:item-99:c1",
      },
      { resendClient: mockResend, env }
    );
    const second = await sendTransactionalEmail(
      {
        to: "aluno@estudantes.ifpr.edu.br",
        subject: "Aviso único",
        text: "Conteúdo único",
        dedupeKey: "notif:item-99:c1",
      },
      { resendClient: mockResend, env }
    );

    expect(first.sent).toBe(true);
    expect(first.deduplicated).toBeFalsy();
    expect(second.sent).toBe(true);
    expect(second.deduplicated).toBe(true);
    expect(second.messageId).toBe("re_dedupe_1");
    expect(callCount).toBe(1);

    // Failed send must NOT poison dedupe cache
    let flakyAttempt = 0;
    const flakyResend: ResendClientLike = {
      emails: {
        send: vi.fn(async () => {
          flakyAttempt += 1;
          if (flakyAttempt === 1) {
            return { data: null, error: { statusCode: 503, message: "Temporary failure" } };
          }
          return { data: { id: "re_retry_ok" }, error: null };
        }),
      },
    };

    const failAttempt = await sendTransactionalEmail(
      { to: "aluno@estudantes.ifpr.edu.br", subject: "Retry", text: "Body", dedupeKey: "retry:key:1" },
      { resendClient: flakyResend, allowSmtpFallback: false, env }
    );
    const okAttempt = await sendTransactionalEmail(
      { to: "aluno@estudantes.ifpr.edu.br", subject: "Retry", text: "Body", dedupeKey: "retry:key:1" },
      { resendClient: flakyResend, allowSmtpFallback: false, env }
    );

    expect(failAttempt.sent).toBe(false);
    expect(okAttempt.sent).toBe(true);
    expect(okAttempt.messageId).toBe("re_retry_ok");
  });

  // 9. Fluxo de primeiro acesso administrativo + reenvio de link (preservando Firebase Admin Auth + redação de oobCode)
  it("9. dispatches admin create-user and send-first-access-link via Resend with redacted oobCode in Firestore", async () => {
    const adminAuth = createMockAdminAuth({
      initialUsers: [
        { uid: "admin_uid_1", email: "admin@ifpr.edu.br", emailVerified: true, customClaims: { admin: true } },
      ],
    });
    const adminDb = createInMemoryFirestore({
      users: {
        admin_uid_1: {
          id: "admin_uid_1",
          name: "Admin IFPR",
          email: "admin@ifpr.edu.br",
          role: "ADMIN",
          status: "active",
          active: true,
          approvalStatus: "APROVADO",
        },
        legacy_uid_77: {
          id: "legacy_uid_77",
          name: "Servidor Legado",
          email: "legado@ifpr.edu.br",
          role: "SERVIDOR",
          status: "active",
          active: true,
          approvalStatus: "APROVADO",
        },
      },
    });

    const sentPayloads: any[] = [];
    const mockResend: ResendClientLike = {
      emails: {
        send: vi.fn(async (payload) => {
          sentPayloads.push(payload);
          return { data: { id: `re_first_access_${sentPayloads.length}` }, error: null };
        }),
      },
    };

    const env = {
      RESEND_API_KEY: "re_test_admin_key_123456",
      RESEND_FROM_EMAIL: "Localiza+ IFPR <noreply@ifpr.edu.br>",
    };

    const createRes = await executeAdminCreateUser(
      { uid: "admin_uid_1", email: "admin@ifpr.edu.br", isAdmin: true },
      {
        name: "Maria Estudante",
        email: "maria.estudante@estudantes.ifpr.edu.br",
        role: "ALUNO",
      },
      "https://localiza.ifpr.edu.br",
      {
        adminAuth: adminAuth as any,
        adminFirestore: adminDb,
        skipCredentialDiagnostics: true,
        emailDeps: { resendClient: mockResend, env },
      }
    );

    expect(createRes.statusCode).toBe(201);
    expect(createRes.payload.success).toBe(true);
    expect(createRes.payload.emailSent).toBe(true);
    expect(createRes.payload.deliveryMethod).toBe("RESEND");
    expect(createRes.payload.provider).toBe("RESEND");
    expect(createRes.payload.normalizedStatus).toBe("SENT");
    expect(createRes.payload.messageId).toBe("re_first_access_1");
    expect(sentPayloads[0].html).toContain("mode=resetPassword&amp;oobCode=");
    expect(sentPayloads[0].html).toContain("localiza.ifpr.edu.br%2Fredefinir-senha");

    // Verify oobCode was redacted in email_notifications audit collection
    const notifDocs: any[] = Array.from(adminDb.store.get("email_notifications")?.values() || []);
    expect(notifDocs.length).toBe(1);
    expect(notifDocs[0].provider).toBe("RESEND");
    expect(notifDocs[0].normalizedStatus).toBe("SENT");
    expect(notifDocs[0].messageId).toBe("re_first_access_1");
    expect(notifDocs[0].setupLinkRedacted).toContain("oobCode=[REDACTED]");
    expect(JSON.stringify(notifDocs[0])).not.toContain("OOB_SECRET_");

    // Legacy UID preservation on send-first-access-link
    const legacyRes = await executeAdminSendFirstAccessLink(
      { uid: "admin_uid_1", email: "admin@ifpr.edu.br", isAdmin: true },
      {
        targetUserId: "legacy_uid_77",
        email: "legado@ifpr.edu.br",
        provisionMissingAuth: true,
      },
      "https://localiza.ifpr.edu.br",
      {
        adminAuth: adminAuth as any,
        adminFirestore: adminDb,
        skipCredentialDiagnostics: true,
        emailDeps: { resendClient: mockResend, env },
      }
    );

    expect(legacyRes.statusCode).toBe(200);
    expect(legacyRes.payload.uid).toBe("legacy_uid_77");
    expect(legacyRes.payload.authProvisioned).toBe(true);
    expect(legacyRes.payload.deliveryMethod).toBe("RESEND");
    expect(legacyRes.payload.messageId).toBe("re_first_access_2");
  });

  // 10. Fluxo de recuperação de senha (anti-enumeração estrita + Firebase Admin link via Resend)
  it("10. handles public password reset via Resend with strict anti-enumeration and zero link leakage", async () => {
    const adminAuth = createMockAdminAuth({
      initialUsers: [
        { uid: "user_reset_1", email: "joao@estudantes.ifpr.edu.br", displayName: "João", emailVerified: true },
      ],
    });
    const adminDb = createInMemoryFirestore();
    const mockResend: ResendClientLike = {
      emails: {
        send: vi.fn(async () => ({ data: { id: "re_reset_msg_9" }, error: null })),
      },
    };
    const env = {
      RESEND_API_KEY: "re_test_reset_key_123456",
      RESEND_FROM_EMAIL: "Localiza+ IFPR <noreply@ifpr.edu.br>",
    };

    const existingRes = await executePublicPasswordResetRequest(
      { email: "joao@estudantes.ifpr.edu.br" },
      "https://localiza.ifpr.edu.br",
      {
        adminAuth: adminAuth as any,
        adminFirestore: adminDb,
        emailDeps: { resendClient: mockResend, env },
      }
    );

    expect(existingRes.statusCode).toBe(200);
    expect(existingRes.payload.success).toBe(true);
    expect(existingRes.payload.fallbackToFirebaseClient).toBe(false);
    expect(JSON.stringify(existingRes.payload)).not.toContain("OOB_SECRET_");
    expect(JSON.stringify(existingRes.payload)).not.toContain("oobCode");
    expect(mockResend.emails.send).toHaveBeenCalledTimes(1);

    // Non-existent account returns identical public anti-enumeration response without calling Resend
    const ghostRes = await executePublicPasswordResetRequest(
      { email: "naoexiste@estudantes.ifpr.edu.br" },
      "https://localiza.ifpr.edu.br",
      {
        adminAuth: adminAuth as any,
        adminFirestore: adminDb,
        emailDeps: { resendClient: mockResend, env },
      }
    );
    expect(ghostRes.statusCode).toBe(200);
    expect(ghostRes.payload.success).toBe(true);
    expect(ghostRes.payload.fallbackToFirebaseClient).toBe(false);
    expect(ghostRes.payload.message).toBe(existingRes.payload.message);
    expect(mockResend.emails.send).toHaveBeenCalledTimes(1);

    // When neither Resend nor SMTP is configured, signals client Firebase Auth fallback honestly
    const unconfiguredRes = await executePublicPasswordResetRequest(
      { email: "joao@estudantes.ifpr.edu.br" },
      "https://localiza.ifpr.edu.br",
      {
        adminAuth: adminAuth as any,
        adminFirestore: adminDb,
        emailDeps: { env: {} },
      }
    );
    expect(unconfiguredRes.statusCode).toBe(200);
    expect(unconfiguredRes.payload.fallbackToFirebaseClient).toBe(true);
  });

  // 11. Correspondência (Match) + Devolução Presencial + Assinatura Digital Remota via Resend
  it("11. dispatches match, formal in-person devolution, and remote signature request via Resend with token redaction", async () => {
    const mockResend: ResendClientLike = {
      emails: {
        send: vi.fn(async (payload) => ({
          data: { id: `re_flow_${payload.subject.slice(0, 8).replace(/\W+/g, "")}_${Math.random().toString(36).slice(2, 6)}` },
          error: null,
        })),
      },
    };
    const env = {
      RESEND_API_KEY: "re_test_flow_key_123456",
      RESEND_FROM_EMAIL: "Localiza+ IFPR <noreply@ifpr.edu.br>",
    };

    const adminDb = createInMemoryFirestore({
      users: {
        staff_uid_1: {
          id: "staff_uid_1",
          name: "Servidora SEBAC",
          email: "sebac@ifpr.edu.br",
          role: "SERVIDOR",
          status: "active",
          active: true,
          approvalStatus: "APROVADO",
        },
      },
      items: {
        "item-inperson-1": {
          id: "item-inperson-1",
          title: "Garrafa Térmica Verde",
          category: "Objetos Pessoais",
          location: "Bloco 1",
          status: "ENCONTRADO",
          qrCode: "QR-ITEM-01",
        },
        "item-remote-2": {
          id: "item-remote-2",
          title: "Calculadora Científica",
          category: "Eletrônicos",
          location: "Biblioteca",
          status: "ENCONTRADO",
          qrCode: "QR-ITEM-02",
        },
      },
    });

    // 11a. Match notification via Resend
    const matchRes = await sendMatchNotificationEmail(
      {
        recipientEmail: "dono@estudantes.ifpr.edu.br",
        recipientName: "Carlos",
        matchScore: 92,
        newRegisteredItem: {
          id: "found-1",
          title: "Caderno Azul",
          type: "ENCONTRADO",
          category: "Material Escolar",
          location: "Bloco 2",
          description: "Caderno espiral azul",
        },
        counterpartItem: {
          id: "lost-1",
          title: "Caderno Azul",
          type: "PERDIDO",
          category: "Material Escolar",
          location: "Bloco 2",
          description: "Caderno espiral",
        },
      },
      { adminDb, emailDeps: { resendClient: mockResend, env } }
    );
    expect(matchRes.success).toBe(true);
    expect(matchRes.provider).toBe("RESEND");
    expect(matchRes.normalizedStatus).toBe("SENT");
    expect(matchRes.messageId).toBeTruthy();

    // 11b. Unconfigured match must NOT simulate success
    const matchUnconfigured = await sendMatchNotificationEmail(
      {
        recipientEmail: "dono2@estudantes.ifpr.edu.br",
        recipientName: "Ana",
        matchScore: 88,
        newRegisteredItem: {
          id: "found-2",
          title: "Chaveiro",
          type: "ENCONTRADO",
          category: "Chaves",
          location: "Cantina",
          description: "Chaveiro prata",
        },
        counterpartItem: {
          id: "lost-2",
          title: "Chaveiro",
          type: "PERDIDO",
          category: "Chaves",
          location: "Cantina",
          description: "Chaveiro prata",
        },
      },
      { adminDb, emailDeps: { env: {} } }
    );
    expect(matchUnconfigured.success).toBe(false);
    expect(matchUnconfigured.normalizedStatus).toBe("PENDING");
    expect(matchUnconfigured.provider).toBe("NONE");

    // 11c. Formal In-Person Devolution via Resend
    const prevSecret = process.env.SIGNATURE_TOKEN_SECRET;
    process.env.SIGNATURE_TOKEN_SECRET = "test-signature-secret-32-chars-minimum-ok!!";
    try {
      const inPersonRes = await executeFormalItemReturn(
        adminDb,
        { uid: "staff_uid_1", email: "sebac@ifpr.edu.br", email_verified: true },
        {
          itemId: "item-inperson-1",
          recipientName: "Pedro Aluno",
          recipientEmail: "pedro@estudantes.ifpr.edu.br",
          recipientBond: "Estudante",
          identityVerified: true,
          signatureType: "IN_PERSON_DEVICE",
          signatureMethod: "TYPED_NAME",
          signatureDataUrl: "data:image/png;base64,iVBORw0KGgo=",
          originUrl: "https://localiza.ifpr.edu.br",
        },
        { emailDeps: { resendClient: mockResend, env } }
      );

      expect(inPersonRes.success).toBe(true);
      expect(inPersonRes.emailDispatched).toBe(true);
      expect(inPersonRes.emailStatus).toBe("SENT");
      expect(inPersonRes.emailProvider).toBe("RESEND");
      expect(inPersonRes.normalizedEmailStatus).toBe("SENT");
      expect(inPersonRes.messageId).toBeTruthy();

      // 11d. Formal Remote Signature Request via Resend (token MUST be redacted in Firestore)
      const remoteRes = await executeFormalItemReturn(
        adminDb,
        { uid: "staff_uid_1", email: "sebac@ifpr.edu.br", email_verified: true },
        {
          itemId: "item-remote-2",
          recipientName: "Lucia Estudante",
          recipientEmail: "lucia@estudantes.ifpr.edu.br",
          recipientBond: "Estudante",
          identityVerified: true,
          signatureType: "REMOTE_EMAIL",
          originUrl: "https://localiza.ifpr.edu.br",
        },
        { emailDeps: { resendClient: mockResend, env } }
      );

      expect(remoteRes.success).toBe(true);
      expect(remoteRes.emailDispatched).toBe(true);
      expect(remoteRes.emailProvider).toBe("RESEND");
      expect(remoteRes.normalizedEmailStatus).toBe("SENT");
      expect(remoteRes.signatureLink).toContain("token=");

      const remoteNotifs: any[] = Array.from(adminDb.store.get("email_notifications")?.values() || []).filter(
        (d: any) => d.type === "REMOTE_SIGNATURE_REQUEST"
      );
      expect(remoteNotifs.length).toBe(1);
      expect(remoteNotifs[0].provider).toBe("RESEND");
      expect(remoteNotifs[0].signatureLinkRedacted).toContain("token=[REDACTED]");
      const rawToken = new URL(remoteRes.signatureLink!).searchParams.get("token")!;
      expect(JSON.stringify(remoteNotifs[0])).not.toContain(rawToken);
    } finally {
      if (prevSecret === undefined) delete process.env.SIGNATURE_TOKEN_SECRET;
      else process.env.SIGNATURE_TOKEN_SECRET = prevSecret;
    }
  });

  // 12. Diagnóstico administrativo + sanitização de logs e credenciais
  it("12. reports sanitized diagnostics without leaking secrets and redacts sensitive tokens", async () => {
    const rawLog =
      "Failed auth Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig with key re_live_1234567890abcdef and link https://app.local/?oobCode=SECRET_OOB&token=SECRET_SIG";
    const cleaned = sanitizeEmailSensitiveText(rawLog);
    expect(cleaned).not.toContain("re_live_1234567890abcdef");
    expect(cleaned).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(cleaned).not.toContain("SECRET_OOB");
    expect(cleaned).not.toContain("SECRET_SIG");
    expect(cleaned).toContain("[REDACTED_RESEND_KEY]");
    expect(cleaned).toContain("[REDACTED_ACTION_LINK]");

    expect(maskEmailAddress("admin.secret@ifpr.edu.br")).toBe("adm***@ifpr.edu.br");

    const diag = await getEmailServiceDiagnostics(null, {
      RESEND_API_KEY: "re_live_NEVER_EXPOSE_ME_999999",
      RESEND_FROM_EMAIL: "Localiza+ IFPR <noreply@ifpr.edu.br>",
      SMTP_HOST: "smtp.ifpr.edu.br",
      SMTP_USER: "achados@ifpr.edu.br",
      SMTP_PASS: "SMTP_SUPER_SECRET_PASSWORD",
    });

    const serialized = JSON.stringify(diag);
    expect(diag.config.activeProvider).toBe("RESEND");
    expect(diag.config.configurationState).toBe("CONFIGURED");
    expect(diag.config.fallbackAvailable).toBe(true);
    expect(serialized).not.toContain("re_live_NEVER_EXPOSE_ME_999999");
    expect(serialized).not.toContain("SMTP_SUPER_SECRET_PASSWORD");
  });

  // 13. Integridade de arquitetura, .env.example e preservação de firestore.rules
  it("13. preserves firestore.rules SHA-256, documents Resend env vars in .env.example, and removes direct sendMail from server.ts", () => {
    const rootDir = path.resolve(process.cwd());

    // firestore.rules MUST remain completely untouched
    const rulesContent = fs.readFileSync(path.join(rootDir, "firestore.rules"));
    const rulesSha256 = crypto.createHash("sha256").update(rulesContent).digest("hex");
    expect(rulesSha256).toBe("7fa455e632a9d1831517fe7269e52d922b8614f903f0a28f025f6418812d95a5");

    // .env.example documents RESEND_API_KEY and RESEND_FROM_EMAIL without real secrets
    const envExample = fs.readFileSync(path.join(rootDir, ".env.example"), "utf8");
    expect(envExample).toContain("RESEND_API_KEY=");
    expect(envExample).toContain("RESEND_FROM_EMAIL=");

    // Zero direct .sendMail( calls in server.ts or api/support/send-feedback.ts (all routed through emailService.ts)
    const serverSrc = fs.readFileSync(path.join(rootDir, "server.ts"), "utf8");
    expect(serverSrc).not.toMatch(/\.sendMail\s*\(/);
    expect(serverSrc).toContain('"/api/auth/request-password-reset"');

    const supportHandlerSrc = fs.readFileSync(path.join(rootDir, "api/support/send-feedback.ts"), "utf8");
    expect(supportHandlerSrc).not.toMatch(/\.sendMail\s*\(/);
    expect(supportHandlerSrc).toContain("sendTransactionalEmail");
  });
});
