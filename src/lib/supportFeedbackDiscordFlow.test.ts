import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  executeSupportFeedback,
  resetFeedbackDedupeCacheForTesting,
  buildSupportEmailHtml,
  FEEDBACK_TIMEOUTS,
  OFFICIAL_SUPPORT_EMAIL,
} from "../../api/support/send-feedback";
import {
  submitSupportFeedback,
  buildClientSupportTicketDocument,
} from "./supportFeedbackService";
import { buildFirebaseAdminEnvDiagnostic } from "../../api/debug/env";

const SMTP_ENV_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "SMTP_SECURE",
  "DISCORD_FEEDBACK_WEBHOOK_URL",
  "DISCORD_WEBHOOK_URL_FEEDBACK",
  "DISCORD_FEEDBACK_URL",
  "DISCORD_WEBHOOK_FEEDBACK",
  "DISCORD_SUPPORT_WEBHOOK_URL",
  "DISCORD_WEBHOOK_URL",
  "DISCORD_WEBHOOK",
  "DISCORD_FEEDBACK",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "FIREBASE_SERVICE_ACCOUNT",
  "FIREBASE_SERVICE_ACCOUNT_KEY",
  "FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_PROJECT_ID",
  "FIRESTORE_DATABASE_ID",
  "VERCEL",
] as const;

function createMockAdminFirestore() {
  const store = new Map<string, Record<string, any>>();
  const collection = vi.fn((colName: string) => ({
    doc: vi.fn((docId: string) => {
      const key = `${colName}/${docId}`;
      return {
        get: vi.fn(async () => ({
          exists: store.has(key),
          data: () => store.get(key),
        })),
        set: vi.fn(async (data: Record<string, any>, opts?: { merge?: boolean }) => {
          if (opts?.merge && store.has(key)) {
            store.set(key, { ...store.get(key), ...data });
          } else {
            store.set(key, { ...data });
          }
        }),
      };
    }),
  }));
  return { store, db: { collection } };
}

describe("Support Feedback, SMTP Audit, Timeouts, Persistence, Diagnostics & Legacy Cloud Functions", () => {
  const OFFICIAL_EMAIL = "localizamais0@gmail.com";
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.restoreAllMocks();
    resetFeedbackDedupeCacheForTesting();
    for (const key of SMTP_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of SMTP_ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  describe("1-6. Channel Matrix: SMTP, Discord, Partial Success & Total Failure", () => {
    it("1. SMTP working + Discord working -> HTTP 200, COMPLETE, real messageId & localizamais0@gmail.com", async () => {
      process.env.DISCORD_FEEDBACK_WEBHOOK_URL = "https://discord.com/api/webhooks/test/valid";
      const sendMail = vi.fn(async () => ({ messageId: "<smtp-ok-001@ifpr.edu.br>" }));
      const fetchMock = vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
      const { db, store } = createMockAdminFirestore();

      const res = await executeSupportFeedback(
        {
          name: "Estudante Teste",
          email: "estudante@estudantes.ifpr.edu.br",
          category: "BUG_REPORT",
          subject: "Erro ao visualizar card",
          message: "Passos para reproduzir:\n1. Acessar tela\n2. Clicar no botão",
          priority: "ALTA",
          clientRequestId: "req-complete-001",
          clientDiagnostics: {
            screen: "1920x1080",
            currentPath: "/suporte/relatar-bug",
            online: true,
          },
        },
        {
          transporter: { sendMail } as any,
          fetchImpl: fetchMock,
          adminFirestore: db,
          authenticatedUser: null,
        }
      );

      expect(res.statusCode).toBe(200);
      expect(res.payload.success).toBe(true);
      expect(res.payload.deliveryOutcome).toBe("COMPLETE");
      expect(res.payload.destinationEmail).toBe(OFFICIAL_EMAIL);
      expect(res.payload.protocol).toMatch(/^IFPR-SUP-/);
      expect(res.payload.smtpDispatched).toBe(true);
      expect(res.payload.smtpStatus).toBe("SENT");
      expect(res.payload.smtpMessageId).toBe("<smtp-ok-001@ifpr.edu.br>");
      expect(res.payload.discordDispatched).toBe(true);
      expect(res.payload.discordStatus).toBe("SENT");
      expect(res.payload.ticketPersisted).toBe(true);
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect((sendMail.mock.calls[0] as any[])[0].to).toBe(OFFICIAL_EMAIL);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(store.has(`support_tickets/ticket_${res.payload.protocol}`)).toBe(true);
      expect(store.has(`email_notifications/email_ticket_${res.payload.protocol}`)).toBe(true);
    });

    it("2 & 6a. SMTP unavailable + Discord working -> HTTP 200, PARTIAL, honest smtpStatus PENDING_SMTP_CONFIG", async () => {
      process.env.DISCORD_FEEDBACK_WEBHOOK_URL = "https://discord.com/api/webhooks/test/valid";
      const fetchMock = vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
      const { db } = createMockAdminFirestore();

      const res = await executeSupportFeedback(
        {
          name: "Servidor Teste",
          email: "servidor@ifpr.edu.br",
          category: "FEEDBACK",
          subject: "Sugestão de melhoria no leitor de QR",
          message: "Adicionar vibração ao confirmar leitura.",
          priority: "MEDIA",
          clientRequestId: "req-partial-discord-only",
        },
        {
          transporter: null,
          fetchImpl: fetchMock,
          adminFirestore: db,
        }
      );

      expect(res.statusCode).toBe(200);
      expect(res.payload.success).toBe(true);
      expect(res.payload.deliveryOutcome).toBe("PARTIAL");
      expect(res.payload.smtpDispatched).toBe(false);
      expect(res.payload.smtpStatus).toBe("PENDING_SMTP_CONFIG");
      expect(res.payload.discordDispatched).toBe(true);
      expect(res.payload.discordStatus).toBe("SENT");
      expect(res.payload.destinationEmail).toBe(OFFICIAL_EMAIL);
    });

    it("4 & 6b. SMTP working + Discord unavailable (not configured or HTTP 500) -> HTTP 200, PARTIAL", async () => {
      process.env.DISCORD_FEEDBACK_WEBHOOK_URL = "https://discord.com/api/webhooks/test/failing";
      const sendMail = vi.fn(async () => ({ messageId: "<smtp-only-002@ifpr.edu.br>" }));
      const fetchMock = vi.fn(async () => new Response("Internal Error", { status: 500 })) as unknown as typeof fetch;
      const { db } = createMockAdminFirestore();

      const res = await executeSupportFeedback(
        {
          name: "Professor Teste",
          email: "professor@ifpr.edu.br",
          category: "BELONGING_QUERY",
          subject: "Dúvida sobre sistema de devoluções",
          message: "Como registrar entrega de pertence com procuração?",
          priority: "ALTA",
          clientRequestId: "req-partial-smtp-only",
        },
        {
          transporter: { sendMail } as any,
          fetchImpl: fetchMock,
          adminFirestore: db,
        }
      );

      expect(res.statusCode).toBe(200);
      expect(res.payload.success).toBe(true);
      expect(res.payload.deliveryOutcome).toBe("PARTIAL");
      expect(res.payload.smtpDispatched).toBe(true);
      expect(res.payload.smtpStatus).toBe("SENT");
      expect(res.payload.discordDispatched).toBe(false);
      expect(res.payload.discordStatus).toBe("HTTP_ERROR");
    });

    it("5a. Simultaneous SMTP unconfigured + Discord unconfigured -> HTTP 503, success: false, FAILED (NEVER false success)", async () => {
      const { db } = createMockAdminFirestore();

      const res = await executeSupportFeedback(
        {
          name: "Visitante Sem Canal",
          email: "visitante@example.com",
          category: "FEEDBACK",
          subject: "Teste sem canais configurados",
          message: "Nenhum canal externo configurado neste ambiente.",
          clientRequestId: "req-both-unconfigured",
        },
        {
          transporter: null,
          adminFirestore: db,
        }
      );

      expect(res.statusCode).toBe(503);
      expect(res.payload.success).toBe(false);
      expect(res.payload.deliveryOutcome).toBe("FAILED");
      expect(res.payload.code).toBe("NOTIFICATION_CHANNELS_NOT_CONFIGURED");
      expect(res.payload.smtpDispatched).toBe(false);
      expect(res.payload.smtpStatus).toBe("PENDING_SMTP_CONFIG");
      expect(res.payload.discordDispatched).toBe(false);
      expect(res.payload.discordStatus).toBe("NOT_CONFIGURED");
      expect(res.payload.ticketPersisted).toBe(true);
    });

    it("5b. Simultaneous SMTP AUTH_FAILED + Discord NETWORK_ERROR -> HTTP 502, success: false, FAILED", async () => {
      process.env.DISCORD_FEEDBACK_WEBHOOK_URL = "https://discord.com/api/webhooks/test/down";
      const sendMail = vi.fn(async () => {
        const err: any = new Error("Invalid login: 535 Authentication failed");
        err.code = "EAUTH";
        throw err;
      });
      const fetchMock = vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch;
      const { db } = createMockAdminFirestore();

      const res = await executeSupportFeedback(
        {
          name: "Usuário Falha Total",
          email: "usuario@ifpr.edu.br",
          category: "BUG_REPORT",
          subject: "Falha simultânea",
          message: "SMTP e Discord falhando ao mesmo tempo.",
          clientRequestId: "req-both-failing",
        },
        {
          transporter: { sendMail } as any,
          fetchImpl: fetchMock,
          adminFirestore: db,
        }
      );

      expect(res.statusCode).toBe(502);
      expect(res.payload.success).toBe(false);
      expect(res.payload.deliveryOutcome).toBe("FAILED");
      expect(res.payload.code).toBe("ALL_NOTIFICATION_CHANNELS_FAILED");
      expect(res.payload.smtpDispatched).toBe(false);
      expect(res.payload.smtpStatus).toBe("AUTH_FAILED");
      expect(res.payload.discordDispatched).toBe(false);
      expect(res.payload.discordStatus).toBe("NETWORK_ERROR");
    });

    it("5c. Rejects requests missing mandatory fields with HTTP 400 without crashing", async () => {
      const res = await executeSupportFeedback({
        name: "",
        email: "",
        subject: "",
        message: "",
      });

      expect(res.statusCode).toBe(400);
      expect(res.payload.success).toBe(false);
      expect(res.payload.deliveryOutcome).toBe("FAILED");
    });

    it("5d. Client submitSupportFeedback NEVER turns network exceptions or total channel failures into success", async () => {
      // Network exception case
      const failingFetch = vi.fn(async () => {
        throw new Error("Failed to fetch");
      }) as unknown as typeof fetch;

      const networkErrResult = await submitSupportFeedback(
        {
          name: "Visitante Offline",
          email: "visitante@example.com",
          category: "FEEDBACK",
          subject: "Teste erro de rede",
          message: "O servidor não respondeu.",
          clientRequestId: "client-net-err-1",
        },
        {
          fetchImpl: failingFetch,
          authInstance: null,
        }
      );

      expect(networkErrResult.success).toBe(false);
      expect(networkErrResult.deliveryOutcome).toBe("FAILED");
      expect(networkErrResult.smtpDispatched).toBe(false);
      expect(networkErrResult.discordDispatched).toBe(false);

      // Even if a misbehaving server returned HTTP 200 with both channels false, client enforces FAILED
      const fake200Fetch = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: true,
              protocol: "IFPR-SUP-FAKE200",
              smtpDispatched: false,
              smtpStatus: "ERROR",
              discordDispatched: false,
              discordStatus: "HTTP_ERROR",
              ticketPersisted: true,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
      ) as unknown as typeof fetch;

      const strictCheckResult = await submitSupportFeedback(
        {
          name: "Visitante Auditoria",
          email: "auditoria@example.com",
          category: "FEEDBACK",
          subject: "Verificação de contrato",
          message: "Ambos os canais retornaram falso.",
          clientRequestId: "client-strict-check-1",
        },
        {
          fetchImpl: fake200Fetch,
          authInstance: null,
        }
      );

      expect(strictCheckResult.success).toBe(false);
      expect(strictCheckResult.deliveryOutcome).toBe("FAILED");
      expect(strictCheckResult.smtpDispatched).toBe(false);
      expect(strictCheckResult.discordDispatched).toBe(false);
    });
  });

  describe("7-9. Visitor vs Authenticated User & Firestore Ticket Persistence", () => {
    it("7. Visitor feedback omits userId and userRole (firestore.rules compliant) and persists cleanly", async () => {
      process.env.DISCORD_FEEDBACK_WEBHOOK_URL = "https://discord.com/api/webhooks/test/visitor";
      const fetchMock = vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
      const { db, store } = createMockAdminFirestore();

      const serverRes = await executeSupportFeedback(
        {
          name: "Visitante Externo",
          email: "externo@gmail.com",
          category: "BELONGING_QUERY",
          subject: "Perdi meu guarda-chuva",
          message: "Esqueci próximo ao Bloco 2.",
          clientRequestId: "req-visitor-001",
        },
        {
          transporter: null,
          fetchImpl: fetchMock,
          adminFirestore: db,
          authenticatedUser: null,
        }
      );

      expect(serverRes.statusCode).toBe(200);
      expect(serverRes.payload.authContext).toBe("VISITOR");
      expect(serverRes.payload.ticketPersisted).toBe(true);

      const persistedTicket = store.get(`support_tickets/ticket_${serverRes.payload.protocol}`);
      expect(persistedTicket).toBeDefined();
      expect(persistedTicket?.status).toBe("NOVO");
      expect("userId" in (persistedTicket || {})).toBe(false);

      // Verify client-side fallback builder strictly omits userId and userRole for visitors
      const clientVisitorDoc = buildClientSupportTicketDocument({
        protocol: "IFPR-SUP-VISITOR1",
        name: "Visitante Externo",
        email: "externo@gmail.com",
        category: "FEEDBACK",
        subject: "Sugestão visitante",
        message: "Ótimo sistema.",
        priority: "MEDIA",
        timestamp: "2026-11-27T12:00:00.000Z",
        authenticatedUser: null,
        userRole: "ALUNO", // Must still be ignored when authenticatedUser is null
      });

      expect(clientVisitorDoc.status).toBe("NOVO");
      expect("userId" in clientVisitorDoc).toBe(false);
      expect("userRole" in clientVisitorDoc).toBe(false);
    });

    it("8. Authenticated user feedback attaches Bearer token and binds userId + email", async () => {
      const capturedRequests: Array<{ headers: any; body: any }> = [];
      const fetchMock = vi.fn(async (_url: any, init: any) => {
        capturedRequests.push({
          headers: init?.headers,
          body: JSON.parse(init?.body || "{}"),
        });
        return new Response(
          JSON.stringify({
            success: true,
            deliveryOutcome: "COMPLETE",
            protocol: "IFPR-SUP-AUTH001",
            timestamp: "2026-11-27T12:00:00.000Z",
            destinationEmail: OFFICIAL_EMAIL,
            smtpDispatched: true,
            smtpStatus: "SENT",
            smtpMessageId: "<auth-001@ifpr>",
            discordDispatched: true,
            discordStatus: "SENT",
            ticketPersisted: true,
            authContext: "AUTHENTICATED",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }) as unknown as typeof fetch;

      const persistClientTicket = vi.fn(async () => {});

      const res = await submitSupportFeedback(
        {
          name: "Maria Estudante",
          email: "maria@estudantes.ifpr.edu.br",
          category: "FEEDBACK",
          subject: "Feedback autenticada",
          message: "Sugestão enviada logada.",
          userId: "uid-maria-123",
          userRole: "ALUNO",
          clientRequestId: "req-auth-001",
        },
        {
          fetchImpl: fetchMock,
          authInstance: {
            currentUser: {
              uid: "uid-maria-123",
              email: "maria@estudantes.ifpr.edu.br",
              getIdToken: vi.fn(async () => "fake-firebase-id-token"),
            },
          },
          persistClientTicket,
        }
      );

      expect(res.success).toBe(true);
      expect(res.deliveryOutcome).toBe("COMPLETE");
      expect(res.ticketPersisted).toBe(true);
      expect(capturedRequests[0].headers.Authorization).toBe("Bearer fake-firebase-id-token");
      // Backend already persisted -> client fallback MUST NOT write a duplicate document
      expect(persistClientTicket).not.toHaveBeenCalled();

      // Verify server handler binds userId when authenticatedUser is verified
      const { db, store } = createMockAdminFirestore();
      const sendMail = vi.fn(async () => ({ messageId: "<auth-srv-1@ifpr>" }));
      const serverAuthRes = await executeSupportFeedback(
        {
          name: "Maria Estudante",
          email: "maria@estudantes.ifpr.edu.br",
          category: "FEEDBACK",
          subject: "Feedback autenticada servidor",
          message: "Verificando persistência autenticada.",
          clientRequestId: "req-auth-srv-001",
        },
        {
          transporter: { sendMail } as any,
          adminFirestore: db,
          authenticatedUser: { uid: "uid-maria-123", email: "maria@estudantes.ifpr.edu.br" },
        }
      );

      expect(serverAuthRes.payload.authContext).toBe("AUTHENTICATED");
      const savedDoc = store.get(`support_tickets/ticket_${serverAuthRes.payload.protocol}`);
      expect(savedDoc?.userId).toBe("uid-maria-123");
      expect(savedDoc?.status).toBe("NOVO");
    });

    it("9. Client Firestore fallback runs ONLY when server did not persist ticket (ticketPersisted: false)", async () => {
      const fetchMock = vi.fn(async () =>
        new Response(
          JSON.stringify({
            success: true,
            deliveryOutcome: "PARTIAL",
            protocol: "IFPR-SUP-FALLBACK1",
            timestamp: "2026-11-27T12:10:00.000Z",
            destinationEmail: OFFICIAL_EMAIL,
            smtpDispatched: true,
            smtpStatus: "SENT",
            discordDispatched: false,
            discordStatus: "NOT_CONFIGURED",
            ticketPersisted: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      ) as unknown as typeof fetch;

      const persistClientTicket = vi.fn(async () => {});

      const res = await submitSupportFeedback(
        {
          name: "Visitante Fallback",
          email: "fallback@example.com",
          category: "FEEDBACK",
          subject: "Teste fallback Firestore",
          message: "Servidor sem credencial Admin SDK.",
          clientRequestId: "req-fallback-fs-1",
        },
        {
          fetchImpl: fetchMock,
          authInstance: null,
          persistClientTicket,
        }
      );

      expect(res.success).toBe(true);
      expect(res.deliveryOutcome).toBe("PARTIAL");
      expect(res.ticketPersisted).toBe(true);
      expect(persistClientTicket).toHaveBeenCalledTimes(1);
      const [ticketId, ticketDoc] = (persistClientTicket.mock.calls[0] as any[]);
      expect(ticketId).toBe("ticket_IFPR-SUP-FALLBACK1");
      expect(ticketDoc.status).toBe("NOVO");
      expect("userId" in ticketDoc).toBe(false);
    });
  });

  describe("10. Duplicate Prevention (In-Memory, Cross-Instance Firestore & Client Coalescing)", () => {
    it("10a. Prevents duplicate SMTP + Discord dispatch when same clientRequestId is retried", async () => {
      process.env.DISCORD_FEEDBACK_WEBHOOK_URL = "https://discord.com/api/webhooks/test/dedupe";
      const sendMail = vi.fn(async () => ({ messageId: "<dedupe-1@ifpr>" }));
      const fetchMock = vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
      const { db } = createMockAdminFirestore();

      const payload = {
        name: "Aluno Duplicado",
        email: "duplicado@estudantes.ifpr.edu.br",
        category: "BUG_REPORT",
        subject: "Clique duplo no botão",
        message: "Usuário clicou duas vezes seguidas.",
        clientRequestId: "req-idempotent-777",
      };

      const first = await executeSupportFeedback(payload, {
        transporter: { sendMail } as any,
        fetchImpl: fetchMock,
        adminFirestore: db,
        nowMs: 1_700_000_000_000,
      });

      const second = await executeSupportFeedback(payload, {
        transporter: { sendMail } as any,
        fetchImpl: fetchMock,
        adminFirestore: db,
        nowMs: 1_700_000_005_000,
      });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(second.payload.protocol).toBe(first.payload.protocol);
      expect(second.payload.duplicatePrevented).toBe(true);
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("10b. Prevents cross-instance duplicate dispatch when ticket already exists in Firestore", async () => {
      process.env.DISCORD_FEEDBACK_WEBHOOK_URL = "https://discord.com/api/webhooks/test/dedupe-fs";
      const sendMail = vi.fn(async () => ({ messageId: "<dedupe-fs-1@ifpr>" }));
      const fetchMock = vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
      const { db } = createMockAdminFirestore();

      const payload = {
        name: "Aluno Serverless",
        email: "serverless@estudantes.ifpr.edu.br",
        category: "FEEDBACK",
        subject: "Retry em outra instância serverless",
        message: "Simulando cold-start de outra instância com mesmo clientRequestId.",
        clientRequestId: "req-cross-instance-999",
      };

      const first = await executeSupportFeedback(payload, {
        transporter: { sendMail } as any,
        fetchImpl: fetchMock,
        adminFirestore: db,
      });

      // Clear local memory cache to simulate a brand new serverless container instance
      resetFeedbackDedupeCacheForTesting();

      const second = await executeSupportFeedback(payload, {
        transporter: { sendMail } as any,
        fetchImpl: fetchMock,
        adminFirestore: db,
      });

      expect(second.statusCode).toBe(200);
      expect(second.payload.protocol).toBe(first.payload.protocol);
      expect(second.payload.duplicatePrevented).toBe(true);
      expect(second.payload.ticketPersisted).toBe(true);
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("11. SMTP Timeout Handling & Parallel Non-Blocking Execution (Vercel 10s Safe)", () => {
    it("11a. SMTP timeout returns smtpStatus TIMEOUT, smtpDispatched false, and NEVER blocks Discord dispatch", async () => {
      process.env.DISCORD_FEEDBACK_WEBHOOK_URL = "https://discord.com/api/webhooks/test/parallel";

      // Simulate hanging SMTP socket that never resolves within hard cap
      const hangingSendMail = vi.fn(
        () => new Promise<never>(() => {
          // intentionally unresolved to trigger hard timeout
        })
      );
      const fastDiscordFetch = vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
      const { db } = createMockAdminFirestore();

      const start = Date.now();
      const res = await executeSupportFeedback(
        {
          name: "Usuário Timeout",
          email: "timeout@ifpr.edu.br",
          category: "BUG_REPORT",
          subject: "SMTP lento não pode travar Discord",
          message: "Verificando execução concorrente.",
          clientRequestId: "req-smtp-timeout-partial",
        },
        {
          transporter: { sendMail: hangingSendMail } as any,
          fetchImpl: fastDiscordFetch,
          adminFirestore: db,
          smtpHardTimeoutMs: 60,
          discordTimeoutMs: 500,
        }
      );
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000);
      expect(res.statusCode).toBe(200);
      expect(res.payload.success).toBe(true);
      expect(res.payload.deliveryOutcome).toBe("PARTIAL");
      expect(res.payload.smtpDispatched).toBe(false);
      expect(res.payload.smtpStatus).toBe("TIMEOUT");
      expect(res.payload.discordDispatched).toBe(true);
      expect(res.payload.discordStatus).toBe("SENT");
    });

    it("11b. SMTP timeout with Discord unavailable returns HTTP 502 FAILED (never fake success) and timeouts fit Vercel 10s limit", async () => {
      const hangingSendMail = vi.fn(() => new Promise<never>(() => {}));
      const { db } = createMockAdminFirestore();

      const res = await executeSupportFeedback(
        {
          name: "Usuário Timeout Total",
          email: "timeout2@ifpr.edu.br",
          category: "FEEDBACK",
          subject: "Timeout sem Discord",
          message: "Ambos indisponíveis.",
          clientRequestId: "req-smtp-timeout-failed",
        },
        {
          transporter: { sendMail: hangingSendMail } as any,
          adminFirestore: db,
          smtpHardTimeoutMs: 50,
        }
      );

      expect(res.statusCode).toBe(502);
      expect(res.payload.success).toBe(false);
      expect(res.payload.deliveryOutcome).toBe("FAILED");
      expect(res.payload.smtpDispatched).toBe(false);
      expect(res.payload.smtpStatus).toBe("TIMEOUT");

      // Confirm production timeout constants stay safely within Vercel Hobby 10s execution budget
      expect(FEEDBACK_TIMEOUTS.smtpConnectionMs).toBeLessThanOrEqual(4500);
      expect(FEEDBACK_TIMEOUTS.smtpSocketMs).toBeLessThanOrEqual(6500);
      expect(FEEDBACK_TIMEOUTS.smtpHardSendMs).toBeLessThanOrEqual(7000);
      expect(FEEDBACK_TIMEOUTS.discordFetchMs).toBeLessThanOrEqual(5000);
      expect(FEEDBACK_TIMEOUTS.smtpHardSendMs + FEEDBACK_TIMEOUTS.firestorePersistMs).toBeLessThanOrEqual(10_000);
    });
  });

  describe("12. Firebase Admin Environment Diagnostics (/api/debug/env & .env.example)", () => {
    it("12a. Recognizes FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY safely without exposing secrets", () => {
      process.env.FIREBASE_PROJECT_ID = "ifpr-test-project";
      process.env.FIREBASE_CLIENT_EMAIL = "firebase-adminsdk@ifpr-test-project.iam.gserviceaccount.com";
      process.env.FIREBASE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nFAKE_KEY_BODY\\n-----END PRIVATE KEY-----";

      const diag = buildFirebaseAdminEnvDiagnostic();

      expect(diag.configured).toBe(true);
      expect(diag.credentialSource).toBe("CLIENT_EMAIL_AND_PRIVATE_KEY");
      expect(diag.hasClientEmailAndPrivateKey).toBe(true);
      expect(diag.hasServiceAccountJson).toBe(false);
      expect(diag.projectIdPresent).toBe(true);
      expect(diag.databaseIdConfigured).toBe(true);
      expect(JSON.stringify(diag)).not.toContain("FAKE_KEY_BODY");
      expect(JSON.stringify(diag)).not.toContain("firebase-adminsdk@");
    });

    it("12b. Recognizes FIREBASE_SERVICE_ACCOUNT and FIREBASE_SERVICE_ACCOUNT_KEY JSON formats", () => {
      const saJson = JSON.stringify({
        project_id: "ifpr-sa-project",
        client_email: "sa-json@ifpr-sa-project.iam.gserviceaccount.com",
        private_key: "-----BEGIN PRIVATE KEY-----\nFAKE_JSON_KEY\n-----END PRIVATE KEY-----",
      });

      process.env.FIREBASE_SERVICE_ACCOUNT = saJson;
      const diag1 = buildFirebaseAdminEnvDiagnostic();
      expect(diag1.configured).toBe(true);
      expect(diag1.credentialSource).toBe("SERVICE_ACCOUNT_JSON");
      expect(diag1.hasServiceAccountJson).toBe(true);
      expect(diag1.hasClientEmailAndPrivateKey).toBe(false);
      expect(diag1.projectIdPresent).toBe(true);
      expect(JSON.stringify(diag1)).not.toContain("FAKE_JSON_KEY");

      delete process.env.FIREBASE_SERVICE_ACCOUNT;
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY = saJson;
      const diag2 = buildFirebaseAdminEnvDiagnostic();
      expect(diag2.configured).toBe(true);
      expect(diag2.credentialSource).toBe("SERVICE_ACCOUNT_JSON");
      expect(diag2.hasServiceAccountJson).toBe(true);
    });

    it("12c. Flags DEFAULT_OR_MISSING and isVercelWithoutCreds when no explicit credentials exist on Vercel", () => {
      process.env.VERCEL = "1";
      const diag = buildFirebaseAdminEnvDiagnostic();

      expect(diag.configured).toBe(false);
      expect(diag.credentialSource).toBe("DEFAULT_OR_MISSING");
      expect(diag.isVercelWithoutCreds).toBe(true);
    });
  });

  describe("13. Legacy Cloud Functions Status Honesty, Named DB & Anti-Duplication", () => {
    it("13a. triggerEmailService and notifyFeedback never report DISPATCHED and reflect honest SMTP absence", async () => {
      const functionsMod = await import("../../functions/src/index");
      const { db, store } = createMockAdminFirestore();

      expect(functionsMod.NAMED_FIRESTORE_DATABASE_ID).toBe(
        "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1"
      );

      const triggerResult = await functionsMod.triggerEmailService(
        {
          name: "Aluno Legado",
          email: "legado@estudantes.ifpr.edu.br",
          category: "FEEDBACK",
          subject: "Teste função legada",
          message: "Verificando honestidade do status.",
        },
        "IFPR-SUP-LEGACY01",
        "2026-11-27T12:30:00.000Z",
        db
      );

      expect(triggerResult.success).toBe(false);
      expect(triggerResult.emailSent).toBe(false);
      expect(triggerResult.smtpDispatched).toBe(false);
      expect(triggerResult.smtpStatus).toBe("PENDING_SMTP_CONFIG");
      expect(triggerResult.destinationEmail).toBe(OFFICIAL_EMAIL);

      const savedTicket = store.get("support_tickets/ticket_IFPR-SUP-LEGACY01");
      expect(savedTicket?.status).toBe("NOVO");
      expect(savedTicket?.status).not.toBe("DISPATCHED");
      expect(savedTicket?.smtpDispatched).toBe(false);
      expect(savedTicket?.emailDeliveryStatus).toBe("PENDING_SMTP_CONFIG");

      // notifyFeedback with Discord working -> PARTIAL
      const partialRes = await functionsMod.notifyFeedback(
        {
          name: "Aluno Legado",
          email: "legado@estudantes.ifpr.edu.br",
          category: "FEEDBACK",
          subject: "Discord ativo",
          message: "Teste parcial",
        },
        { db, sendDiscordFn: vi.fn(async () => true) }
      );
      expect(partialRes.success).toBe(true);
      expect(partialRes.deliveryOutcome).toBe("PARTIAL");
      expect(partialRes.smtpDispatched).toBe(false);
      expect(partialRes.discordDispatched).toBe(true);

      // notifyFeedback with Discord failing -> FAILED
      const failedRes = await functionsMod.notifyFeedback(
        {
          name: "Aluno Legado",
          email: "legado@estudantes.ifpr.edu.br",
          category: "FEEDBACK",
          subject: "Discord falhando",
          message: "Teste falha total",
        },
        { db, sendDiscordFn: vi.fn(async () => false) }
      );
      expect(failedRes.success).toBe(false);
      expect(failedRes.deliveryOutcome).toBe("FAILED");
      expect(failedRes.smtpDispatched).toBe(false);
      expect(failedRes.discordDispatched).toBe(false);
    });

    it("13b. handleLegacyItemReturnedRecord never writes DELIVERED and avoids duplicating backend return notifications", async () => {
      const functionsMod = await import("../../functions/src/index");
      const { db, store } = createMockAdminFirestore();

      // Case 1: Backend already flagged returnEmailNotified -> skip completely
      const skippedByFlag = await functionsMod.handleLegacyItemReturnedRecord({
        itemId: "item-001",
        beforeData: { status: "ENCONTRADO" },
        afterData: { status: "DEVOLVIDO", returnEmailNotified: true, title: "Carteira" },
        db,
      });
      expect(skippedByFlag.skipped).toBe(true);
      expect(skippedByFlag.reason).toBe("ALREADY_HANDLED_BY_BACKEND");

      // Case 2: Authoritative backend email_notifications record exists -> skip completely
      store.set("email_notifications/email_auto_item-002_ITEM_RETURNED", {
        id: "email_auto_item-002_ITEM_RETURNED",
        status: "SENT",
      });
      const skippedByDoc = await functionsMod.handleLegacyItemReturnedRecord({
        itemId: "item-002",
        beforeData: { status: "ENCONTRADO" },
        afterData: { status: "DEVOLVIDO", title: "Chaveiro" },
        db,
      });
      expect(skippedByDoc.skipped).toBe(true);
      expect(skippedByDoc.reason).toBe("AUTHORITATIVE_NOTIFICATION_EXISTS");

      // Case 3: Legacy fallback when no backend record exists -> records honest PENDING_SMTP_CONFIG (never DELIVERED)
      const recorded = await functionsMod.handleLegacyItemReturnedRecord({
        itemId: "item-003",
        beforeData: { status: "ENCONTRADO" },
        afterData: {
          status: "DEVOLVIDO",
          title: "Garrafa Térmica",
          registeredByUserEmail: "aluno@estudantes.ifpr.edu.br",
        },
        db,
      });
      expect(recorded.skipped).toBe(false);
      expect(recorded.status).toBe("PENDING_SMTP_CONFIG");
      const legacyDoc = store.get("email_notifications/legacy_fn_return_item-003");
      expect(legacyDoc).toBeDefined();
      expect(legacyDoc?.status).toBe("PENDING_SMTP_CONFIG");
      expect(legacyDoc?.status).not.toBe("DELIVERED");
      expect(legacyDoc?.emailSent).toBe(false);
      expect(legacyDoc?.sentAt).toBeNull();
    });
  });

  describe("Email Visual Presentation by Category", () => {
    it("should render red header (#DC2626) with white text for BUG_REPORT category", () => {
      const bugTicket = {
        protocol: "IFPR-SUP-BUG12345",
        name: "Aluno IFPR",
        email: "aluno@ifpr.edu.br",
        category: "BUG_REPORT",
        subject: "Erro 500 ao tentar abrir câmera de QR",
        message: "A tela congela ao autorizar a câmera no celular.",
        priority: "ALTA",
        timestamp: "27/09/2026 12:45:00",
        clientDiagnostics: { userAgent: "Mozilla/5.0", platform: "Android" },
      };

      const html = buildSupportEmailHtml(bugTicket, OFFICIAL_SUPPORT_EMAIL);

      expect(html).toContain("background: #DC2626;");
      expect(html).toContain("color: #ffffff;");
      expect(html).toContain("border-left: 4px solid #DC2626;");
      expect(html).toContain("Relato de Bug / Erro no Sistema");
      expect(html).toContain(OFFICIAL_EMAIL);
      expect(html).toContain("IFPR-SUP-BUG12345");
    });

    it("should render green header (#00843D) with white text for FEEDBACK and general support categories", () => {
      const feedbackTicket = {
        protocol: "IFPR-SUP-FDBK9876",
        name: "Servidor IFPR",
        email: "servidor@ifpr.edu.br",
        category: "FEEDBACK",
        subject: "Sugestão de filtro por bloco do campus",
        message: "Gostaria de poder filtrar os itens pelo bloco administrativo.",
        priority: "MEDIA",
        timestamp: "27/09/2026 12:50:00",
      };

      const html = buildSupportEmailHtml(feedbackTicket, OFFICIAL_SUPPORT_EMAIL);

      expect(html).toContain("background: #00843D;");
      expect(html).toContain("color: #ffffff;");
      expect(html).toContain("border-left: 4px solid #00843D;");
      expect(html).toContain("Sugestão ou Melhoria");
      expect(html).toContain(OFFICIAL_EMAIL);
      expect(html).toContain("IFPR-SUP-FDBK9876");
    });
  });

  describe("Institutional Email & Config Consistency Audit (localizamais0@gmail.com, Zero Resend, Compiled Functions Sync)", () => {
    it("should have zero occurrences of legacy localizamais6@gmail.com or achados.ivaipora@ifpr.edu.br in active code and manuals", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const root = process.cwd();

      const legacyDeprecatedEmail = ["localizamais6", "gmail.com"].join("@");
      const legacyPlaceholderEmail = ["achados.ivaipora", "ifpr.edu.br"].join("@");

      const activeFilesToAudit = [
        "server.ts",
        "api/support/send-feedback.ts",
        "functions/src/index.ts",
        "functions/lib/index.js",
        "src/components/SupportView.tsx",
        "src/components/ContactSupportModal.tsx",
        "src/components/AccountStatusBanner.tsx",
        "src/data/legalDocumentsData.ts",
        "src/lib/userManualPdfGenerator.ts",
        "public/manual-usuario.html",
        "README.md",
      ];

      for (const relPath of activeFilesToAudit) {
        const content = fs.readFileSync(path.resolve(root, relPath), "utf8");
        expect(content, `${relPath} must not contain legacy ${legacyDeprecatedEmail}`).not.toContain(
          legacyDeprecatedEmail
        );
        expect(content, `${relPath} must not contain legacy ${legacyPlaceholderEmail}`).not.toContain(
          legacyPlaceholderEmail
        );
      }
    });

    it("should align institutional recipient to localizamais0@gmail.com, keep functions/lib synced without fake statuses, and document active env vars without secrets or Resend", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const root = process.cwd();

      const filesRequiringOfficialEmail = [
        "server.ts",
        "api/support/send-feedback.ts",
        "functions/src/index.ts",
        "functions/lib/index.js",
        "src/components/SupportView.tsx",
        "src/components/ContactSupportModal.tsx",
        "src/components/AccountStatusBanner.tsx",
        "src/data/legalDocumentsData.ts",
        "src/lib/userManualPdfGenerator.ts",
        "public/manual-usuario.html",
      ];

      for (const relPath of filesRequiringOfficialEmail) {
        const content = fs.readFileSync(path.resolve(root, relPath), "utf8");
        expect(content, `${relPath} must reference official ${OFFICIAL_EMAIL}`).toContain(OFFICIAL_EMAIL);
      }

      // Verify compiled functions/lib/index.js has zero fake DELIVERED / DISPATCHED statuses and masks PII
      const functionsSrc = fs.readFileSync(path.resolve(root, "functions/src/index.ts"), "utf8");
      const functionsLib = fs.readFileSync(path.resolve(root, "functions/lib/index.js"), "utf8");
      expect(functionsSrc).toContain("sanitizeEmailForPrivacy(emailRecord.senderEmail, true)");
      expect(functionsSrc).toContain("sanitizeEmailForPrivacy(recipientEmail, true)");
      expect(functionsSrc).not.toContain('status: "DISPATCHED"');
      expect(functionsSrc).not.toContain('status: "DELIVERED"');
      expect(functionsLib).not.toContain('status: "DISPATCHED"');
      expect(functionsLib).not.toContain('status: "DELIVERED"');
      expect(functionsLib).toContain("ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1");

      // Verify .env.example keeps canonical env vars without secrets, Resend, or optional/alternative keys that trigger unnecessary AI Studio prompts
      const envExample = fs.readFileSync(path.resolve(root, ".env.example"), "utf8");
      for (const expectedVar of [
        "SMTP_HOST=",
        "SMTP_PORT=",
        "SMTP_USER=",
        "SMTP_PASS=",
        "SMTP_FROM=",
        "SMTP_SECURE=",
        "FIREBASE_CLIENT_EMAIL=",
        "FIREBASE_PRIVATE_KEY=",
        "FIREBASE_PROJECT_ID=",
        "FIRESTORE_DATABASE_ID=",
        "DISCORD_FEEDBACK_WEBHOOK_URL=",
      ]) {
        expect(envExample).toContain(expectedVar);
      }
      for (const optionalPromptTrigger of [
        "ALLOWED_ORIGINS=",
        "TRUSTED_ORIGINS=",
        "FIREBASE_SERVICE_ACCOUNT=",
        "FIREBASE_SERVICE_ACCOUNT_KEY=",
      ]) {
        expect(envExample).not.toContain(optionalPromptTrigger);
      }
      expect(envExample).not.toContain("RESEND_API_KEY");
      expect(envExample).not.toContain("RESEND_FROM_EMAIL");
      expect(envExample).not.toContain(OFFICIAL_EMAIL);
    });
  });

  describe("14. Institutional Sender Fallback & Google Gmail SMTP App Password Compatibility", () => {
    it("14a. getSmtpFromAddress preserves SMTP_FROM > SMTP_USER > localizamais0@gmail.com priority with zero campus.ivaipora fallback", async () => {
      const { getSmtpFromAddress } = await import("../../server");

      // 1. Default fallback when neither SMTP_FROM nor SMTP_USER is set
      delete process.env.SMTP_FROM;
      delete process.env.SMTP_USER;
      const fallbackFrom = getSmtpFromAddress("IFPR Achados & Perdidos");
      expect(fallbackFrom).toBe(`"IFPR Achados & Perdidos" <${OFFICIAL_EMAIL}>`);
      expect(fallbackFrom).not.toContain("campus.ivaipora@ifpr.edu.br");

      // 2. SMTP_USER takes precedence over default fallback
      process.env.SMTP_USER = OFFICIAL_EMAIL;
      expect(getSmtpFromAddress("Localiza+ IFPR")).toBe(`"Localiza+ IFPR" <${OFFICIAL_EMAIL}>`);

      // 3. SMTP_FROM takes highest precedence when explicitly configured
      process.env.SMTP_FROM = `"Localiza+ IFPR" <${OFFICIAL_EMAIL}>`;
      expect(getSmtpFromAddress("IFPR Achados & Perdidos")).toBe(`"Localiza+ IFPR" <${OFFICIAL_EMAIL}>`);
    });

    it("14b. createSmtpTransporter and createEmailTransporter accept Google Gmail SMTP + existing 16-char App Password with spaces (STARTTLS 587)", async () => {
      const nodemailerMod = await import("nodemailer");
      const createTransportSpy = vi.spyOn(nodemailerMod.default, "createTransport");
      const { createSmtpTransporter } = await import("../../api/support/send-feedback");
      const { createEmailTransporter } = await import("../../server");

      process.env.SMTP_HOST = "smtp.gmail.com";
      process.env.SMTP_PORT = "587";
      process.env.SMTP_USER = OFFICIAL_EMAIL;
      process.env.SMTP_PASS = "abcd efgh ijkl mnop";
      process.env.SMTP_SECURE = "false";

      const feedbackTransport = createSmtpTransporter();
      const serverTransport = createEmailTransporter();

      expect(feedbackTransport).not.toBeNull();
      expect(serverTransport).not.toBeNull();
      expect(createTransportSpy).toHaveBeenCalledTimes(2);

      for (const call of createTransportSpy.mock.calls) {
        const opts = call[0] as any;
        expect(opts.host).toBe("smtp.gmail.com");
        expect(opts.port).toBe(587);
        expect(opts.secure).toBe(false);
        expect(opts.auth).toEqual({
          user: OFFICIAL_EMAIL,
          pass: "abcdefghijklmnop",
        });
        expect(opts.tls).toEqual({
          rejectUnauthorized: true,
          minVersion: "TLSv1.2",
        });
      }
    });
  });
});

