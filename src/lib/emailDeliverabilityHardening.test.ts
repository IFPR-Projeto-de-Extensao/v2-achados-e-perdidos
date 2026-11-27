import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  CANONICAL_APP_ORIGIN,
  INSTITUTIONAL_REPLY_TO_EMAIL,
  sanitizeTrustedOriginUrl,
  sendMatchNotificationEmail,
  executeFormalItemReturn,
  buildRemoteSignatureRequestEmailContent,
  buildStaffPendingSignatureEmailContent,
} from "../../server";
import {
  sendTransactionalEmail,
  derivePlainTextFromHtml,
  clearEmailServiceRuntimeState,
  type ResendClientLike,
} from "../../api/_lib/emailService";

function createInMemoryAdminDb(initialCollections: Record<string, Record<string, any>> = {}): any {
  const store = new Map<string, Map<string, any>>();
  for (const [col, docs] of Object.entries(initialCollections)) {
    const map = new Map<string, any>();
    for (const [id, data] of Object.entries(docs)) {
      map.set(id, { ...data });
    }
    store.set(col, map);
  }
  const ensureCol = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };
  const makeDocRef = (colName: string, id: string) => ({
    __col: colName,
    __id: id,
    id,
    get: async () => {
      const data = ensureCol(colName).get(id);
      return {
        exists: data !== undefined,
        id,
        data: () => (data ? { ...data } : undefined),
      };
    },
    set: async (data: any, opts?: { merge?: boolean }) => {
      const col = ensureCol(colName);
      if (opts?.merge && col.has(id)) {
        col.set(id, { ...col.get(id), ...data });
      } else {
        col.set(id, { ...data });
      }
    },
    update: async (data: any) => {
      const col = ensureCol(colName);
      const existing = col.get(id) || {};
      col.set(id, { ...existing, ...data });
    },
  });

  return {
    store,
    collection: (colName: string) => {
      const makeQuery = (filters: Array<{ field: string; op: string; value: any }> = []) => ({
        where: (field: string, op: string, value: any) =>
          makeQuery([...filters, { field, op, value }]),
        orderBy: (_field: string, _dir?: string) => makeQuery(filters),
        limit: (n: number) => ({
          get: async () => {
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
                data: () => ({ ...data }),
              }));
            return { empty: all.length === 0, docs: all };
          },
        }),
        get: async () => {
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
              data: () => ({ ...data }),
            }));
          return { empty: all.length === 0, docs: all };
        },
      });
      return {
        doc: (id: string) => makeDocRef(colName, id),
        where: (field: string, op: string, value: any) => makeQuery([{ field, op, value }]),
        orderBy: (field: string, dir?: string) => makeQuery([]).orderBy(field, dir),
      };
    },
    runTransaction: async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        get: async (ref: any) => ref.get(),
        set: (ref: any, data: any, opts?: { merge?: boolean }) => {
          const col = ensureCol(ref.__col);
          if (opts?.merge && col.has(ref.__id)) {
            col.set(ref.__id, { ...col.get(ref.__id), ...data });
          } else {
            col.set(ref.__id, { ...data });
          }
        },
        update: (ref: any, data: any) => {
          const col = ensureCol(ref.__col);
          const existing = col.get(ref.__id) || {};
          col.set(ref.__id, { ...existing, ...data });
        },
      };
      return fn(tx);
    },
  };
}

describe("Resend Email Deliverability Hardening (Localiza+ v1.10.13)", () => {
  beforeEach(() => {
    clearEmailServiceRuntimeState();
  });

  describe("1. Canonical Institutional Domain & External Host Protection", () => {
    it("uses https://localizamais.pclp.com.br as canonical default origin and accepts it on allowlist", () => {
      const prevAppUrl = process.env.APP_URL;
      try {
        delete process.env.APP_URL;
        expect(CANONICAL_APP_ORIGIN).toBe("https://localizamais.pclp.com.br");
        expect(sanitizeTrustedOriginUrl(undefined)).toBe("https://localizamais.pclp.com.br");
        expect(sanitizeTrustedOriginUrl("")).toBe("https://localizamais.pclp.com.br");
        expect(sanitizeTrustedOriginUrl("https://localizamais.pclp.com.br")).toBe(
          "https://localizamais.pclp.com.br"
        );
        expect(sanitizeTrustedOriginUrl("https://localizamais.pclp.com.br/objetos?id=123")).toBe(
          "https://localizamais.pclp.com.br"
        );
      } finally {
        if (prevAppUrl === undefined) delete process.env.APP_URL;
        else process.env.APP_URL = prevAppUrl;
      }
    });

    it("rejects unauthorized external hosts, insecure HTTP, and script schemes by falling back to https://localizamais.pclp.com.br", () => {
      const prevAppUrl = process.env.APP_URL;
      try {
        delete process.env.APP_URL;
        const untrustedInputs = [
          "https://evil.pclp.com.br",
          "https://localizamais.pclp.com.br.attacker.com",
          "https://attacker.com",
          "https://phishing-site.vercel.app",
          "https://rogue.run.app",
          "http://localizamais.pclp.com.br",
          "javascript:alert(1)",
          "data:text/html,<script>alert(1)</script>",
          "ftp://localizamais.pclp.com.br",
        ];

        for (const badOrigin of untrustedInputs) {
          expect(sanitizeTrustedOriginUrl(badOrigin), `Must reject ${badOrigin}`).toBe(
            "https://localizamais.pclp.com.br"
          );
        }
      } finally {
        if (prevAppUrl === undefined) delete process.env.APP_URL;
        else process.env.APP_URL = prevAppUrl;
      }
    });
  });

  describe("2. Multipart HTML + text/plain & Institutional Links", () => {
    it("dispatches sendMatchNotificationEmail with both HTML and equivalent text/plain, canonical domain link, and institutional Reply-To", async () => {
      const prevAppUrl = process.env.APP_URL;
      delete process.env.APP_URL;

      const sentPayloads: any[] = [];
      const mockResend: ResendClientLike = {
        emails: {
          send: vi.fn(async (payload) => {
            sentPayloads.push(payload);
            return { data: { id: "re_match_multipart_001" }, error: null };
          }),
        },
      };

      try {
        const adminDb = createInMemoryAdminDb();
        const res = await sendMatchNotificationEmail(
          {
            recipientEmail: "joao.silva@estudantes.ifpr.edu.br",
            recipientName: "João da Conceição",
            matchScore: 94,
            newRegisteredItem: {
              id: "item-found-99",
              title: "Mochila Térmica Azul & Preta",
              type: "ENCONTRADO",
              category: "Acessórios",
              color: "Azul-marinho",
              brand: "Dell",
              location: "Bloco 2 — Laboratório de Informática",
              description: "Mochila encontrada próxima à saída.",
            },
            counterpartItem: {
              id: "item-lost-99",
              title: "Mochila Azul Dell",
              type: "PERDIDO",
              category: "Acessórios",
              location: "Bloco 2",
              description: "Perdida no intervalo.",
            },
            matchedFeatures: ["Cor azul", "Marca Dell", "Bloco 2"],
            reason: "Alta compatibilidade de cor, marca e localização no campus de Ivaiporã.",
          },
          {
            adminDb,
            emailDeps: {
              resendClient: mockResend,
              env: {
                RESEND_API_KEY: "re_test_key_000000000000",
                RESEND_FROM_EMAIL: "Localiza+ IFPR <contato@localizamais.pclp.com.br>",
              },
            },
          }
        );

        expect(res.success).toBe(true);
        expect(sentPayloads).toHaveLength(1);

        const payload = sentPayloads[0];
        expect(payload.from).toBe("Localiza+ IFPR <contato@localizamais.pclp.com.br>");
        expect(payload.replyTo).toBe(INSTITUTIONAL_REPLY_TO_EMAIL);
        expect(payload.html).toBeTruthy();
        expect(payload.text).toBeTruthy();

        // Canonical institutional link in BOTH HTML and text/plain
        expect(payload.html).toContain('href="https://localizamais.pclp.com.br"');
        expect(payload.text).toContain("https://localizamais.pclp.com.br");
        expect(payload.html).not.toContain("localiza-plus-ifpr.vercel.app");
        expect(payload.text).not.toContain("localiza-plus-ifpr.vercel.app");

        // All essential content preserved in text/plain with accented UTF-8 characters
        expect(payload.text).toContain("João da Conceição");
        expect(payload.text).toContain("94%");
        expect(payload.text).toContain("Mochila Térmica Azul & Preta");
        expect(payload.text).toContain("Bloco 2 — Laboratório de Informática");
        expect(payload.text).toContain("Mochila Azul Dell");
        expect(payload.text).toContain("Cor azul, Marca Dell, Bloco 2");
        expect(payload.text).toContain("localizamais0@gmail.com");
      } finally {
        if (prevAppUrl === undefined) delete process.env.APP_URL;
        else process.env.APP_URL = prevAppUrl;
      }
    });

    it("preserves explicit HTML + text in sendTransactionalEmail and derives readable text/plain fallback when HTML-only is supplied", async () => {
      const sentPayloads: any[] = [];
      const mockResend: ResendClientLike = {
        emails: {
          send: vi.fn(async (payload) => {
            sentPayloads.push(payload);
            return { data: { id: `re_msg_${sentPayloads.length}` }, error: null };
          }),
        },
      };
      const env = {
        RESEND_API_KEY: "re_test_key_1234567890",
        RESEND_FROM_EMAIL: "Localiza+ IFPR <contato@localizamais.pclp.com.br>",
      };

      // Case A: explicit html + text both preserved untouched
      await sendTransactionalEmail(
        {
          to: "dest@ifpr.edu.br",
          subject: "Teste Multipart",
          html: "<p>Olá <strong>Maria</strong></p>",
          text: "Texto explícito preservado integralmente.",
          replyTo: INSTITUTIONAL_REPLY_TO_EMAIL,
        },
        { resendClient: mockResend, env }
      );
      expect(sentPayloads[0].html).toBe("<p>Olá <strong>Maria</strong></p>");
      expect(sentPayloads[0].text).toBe("Texto explícito preservado integralmente.");
      expect(sentPayloads[0].replyTo).toBe("localizamais0@gmail.com");

      // Case B: html-only derives clean text/plain automatically (stripping style/script & preserving link)
      await sendTransactionalEmail(
        {
          to: "dest2@ifpr.edu.br",
          subject: "Teste Fallback Texto",
          html: "<html><head><style>body{color:red}</style></head><body><p>Olá José!</p><a href=\"https://localizamais.pclp.com.br\">Acessar</a></body></html>",
        },
        { resendClient: mockResend, env }
      );
      expect(sentPayloads[1].html).toContain("https://localizamais.pclp.com.br");
      expect(sentPayloads[1].text).toContain("Olá José!");
      expect(sentPayloads[1].text).toContain("Acessar (https://localizamais.pclp.com.br)");
      expect(sentPayloads[1].text).not.toContain("color:red");

      // Direct unit check on derivePlainTextFromHtml
      expect(derivePlainTextFromHtml("<p>Atenção &amp; Segurança</p>")).toBe("Atenção & Segurança");
    });

    it("uses canonical institutional origin and sends HTML + text/plain + Reply-To in executeFormalItemReturn remote flow", async () => {
      const prevSecret = process.env.SIGNATURE_TOKEN_SECRET;
      const prevAppUrl = process.env.APP_URL;
      process.env.SIGNATURE_TOKEN_SECRET = "test-signature-secret-32-chars-minimum-ok!!";
      delete process.env.APP_URL;

      const sentPayloads: any[] = [];
      const mockResend: ResendClientLike = {
        emails: {
          send: vi.fn(async (payload) => {
            sentPayloads.push(payload);
            return { data: { id: "re_remote_sig_001" }, error: null };
          }),
        },
      };

      try {
        const adminDb = createInMemoryAdminDb({
          users: {
            staff_1: {
              id: "staff_1",
              name: "Maria Servidora",
              email: "maria@ifpr.edu.br",
              role: "SERVIDOR",
              approvalStatus: "APROVADO",
              status: "active",
              active: true,
            },
          },
          items: {
            "item-canonical-1": {
              id: "item-canonical-1",
              title: "Óculos de Grau",
              type: "ENCONTRADO",
              category: "Acessórios",
              location: "Biblioteca",
              status: "ENCONTRADO",
              qrCode: "QR-001",
            },
          },
        });

        const res = await executeFormalItemReturn(
          adminDb,
          { uid: "staff_1", email: "maria@ifpr.edu.br", email_verified: true },
          {
            itemId: "item-canonical-1",
            recipientName: "Carlos Discente",
            recipientEmail: "carlos@estudantes.ifpr.edu.br",
            recipientBond: "Estudante",
            identityVerified: true,
            signatureType: "REMOTE_EMAIL",
            originUrl: "https://evil.attacker.com", // Must be rejected -> canonical fallback
          },
          {
            emailDeps: {
              resendClient: mockResend,
              env: {
                RESEND_API_KEY: "re_test_key_1234567890",
                RESEND_FROM_EMAIL: "Localiza+ IFPR <contato@localizamais.pclp.com.br>",
              },
            },
          }
        );

        expect(res.success).toBe(true);
        expect(res.signatureLink).toMatch(/^https:\/\/localizamais\.pclp\.com\.br\/\?tab=sign-receipt&itemId=item-canonical-1&token=/);
        expect(sentPayloads).toHaveLength(1);
        expect(sentPayloads[0].from).toBe("Localiza+ IFPR <contato@localizamais.pclp.com.br>");
        expect(sentPayloads[0].replyTo).toBe("localizamais0@gmail.com");
        expect(sentPayloads[0].html).toContain("https://localizamais.pclp.com.br/?tab=sign-receipt");
        expect(sentPayloads[0].text).toContain("https://localizamais.pclp.com.br/?tab=sign-receipt");
        expect(sentPayloads[0].html).not.toContain("evil.attacker.com");
      } finally {
        if (prevSecret === undefined) delete process.env.SIGNATURE_TOKEN_SECRET;
        else process.env.SIGNATURE_TOKEN_SECRET = prevSecret;
        if (prevAppUrl === undefined) delete process.env.APP_URL;
        else process.env.APP_URL = prevAppUrl;
      }
    });
  });

  describe("3. Sender Configuration (.env.example) & Production Secret Preservation", () => {
    it("recommends contato@localizamais.pclp.com.br in .env.example without noreply or real credentials", () => {
      const envExample = fs.readFileSync(path.resolve(process.cwd(), ".env.example"), "utf8");
      expect(envExample).toContain('RESEND_FROM_EMAIL="Localiza+ IFPR <contato@localizamais.pclp.com.br>"');
      expect(envExample.toLowerCase()).not.toContain("noreply");
      expect(envExample.toLowerCase()).not.toContain("no-reply");
      expect(envExample).toContain('RESEND_API_KEY="re_xxxxxxxxxxxxxxxxxxxxxxxxx"');
    });

    it("never overrides a custom production RESEND_FROM_EMAIL value", async () => {
      const sentPayloads: any[] = [];
      const mockResend: ResendClientLike = {
        emails: {
          send: vi.fn(async (payload) => {
            sentPayloads.push(payload);
            return { data: { id: "re_custom_sender_ok" }, error: null };
          }),
        },
      };

      const res = await sendTransactionalEmail(
        {
          to: "usuario@estudantes.ifpr.edu.br",
          subject: "Verificação de Remetente",
          text: "Corpo de teste",
          replyTo: INSTITUTIONAL_REPLY_TO_EMAIL,
        },
        {
          resendClient: mockResend,
          env: {
            RESEND_API_KEY: "re_test_key_1234567890",
            RESEND_FROM_EMAIL: "Equipe Localiza+ <notificacoes@localizamais.pclp.com.br>",
          },
        }
      );

      expect(res.sent).toBe(true);
      expect(sentPayloads[0].from).toBe("Equipe Localiza+ <notificacoes@localizamais.pclp.com.br>");
      expect(sentPayloads[0].replyTo).toBe("localizamais0@gmail.com");
    });
  });

  describe("4. HTML Template Injection Escaping (Match IA & Signature Emails)", () => {
    it("escapes HTML/script injection payloads in sendMatchNotificationEmail while preserving valid URLs and accents", async () => {
      const prevAppUrl = process.env.APP_URL;
      delete process.env.APP_URL;

      const sentPayloads: any[] = [];
      const mockResend: ResendClientLike = {
        emails: {
          send: vi.fn(async (payload) => {
            sentPayloads.push(payload);
            return { data: { id: "re_xss_match_001" }, error: null };
          }),
        },
      };

      try {
        const adminDb = createInMemoryAdminDb();
        await sendMatchNotificationEmail(
          {
            recipientEmail: "seguranca@estudantes.ifpr.edu.br",
            recipientName: 'João <script>alert("xss")</script> Conceição',
            matchScore: 91,
            newRegisteredItem: {
              id: "item-xss-1",
              title: '<img src=x onerror=alert(1)> Óculos & Estojo',
              type: 'ENCONTRADO" onmouseover="alert(1)' as any,
              category: "<b>Eletrônicos</b>",
              color: "<svg onload=alert(1)>",
              brand: 'Marca "Segura" & Cia',
              location: 'Bloco 3 <a href="javascript:alert(1)">Link</a>',
              description: "Descrição",
            },
            counterpartItem: {
              id: "item-xss-2",
              title: "<iframe src='https://evil.com'></iframe>",
              type: "PERDIDO",
              category: "<script>evil()</script>",
              location: "Refeitório — Ivaiporã",
              description: "Descrição",
            },
            matchedFeatures: ['<script>pwn()</script>', "Óculos & Estojo"],
            reason: 'Motivo com <img src=x onerror=alert(2)> e acentuação: Ivaiporã.',
          },
          {
            adminDb,
            emailDeps: {
              resendClient: mockResend,
              env: {
                RESEND_API_KEY: "re_test_key_1234567890",
                RESEND_FROM_EMAIL: "Localiza+ IFPR <contato@localizamais.pclp.com.br>",
              },
            },
          }
        );

        expect(sentPayloads).toHaveLength(1);
        const html: string = sentPayloads[0].html;

        // Raw dangerous tags MUST NOT appear in HTML
        expect(html).not.toContain("<script>");
        expect(html).not.toContain("<img ");
        expect(html).not.toContain("<svg ");
        expect(html).not.toContain("<iframe ");
        expect(html).not.toContain('href="javascript:alert(1)"');

        // Properly escaped entities and preserved accents/legitimate URL
        expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
        expect(html).toContain("&lt;img src=x onerror=alert(1)&gt; Óculos &amp; Estojo");
        expect(html).toContain("Marca &quot;Segura&quot; &amp; Cia");
        expect(html).toContain("Refeitório — Ivaiporã");
        expect(html).toContain('href="https://localizamais.pclp.com.br"');
      } finally {
        if (prevAppUrl === undefined) delete process.env.APP_URL;
        else process.env.APP_URL = prevAppUrl;
      }
    });

    it("escapes HTML injection payloads in remote signature request and staff alert templates while preserving valid signature URLs", () => {
      const validLink =
        "https://localizamais.pclp.com.br/?tab=sign-receipt&itemId=ITEM-42&token=abc_123-XYZ";

      const remoteEmail = buildRemoteSignatureRequestEmailContent({
        recipientName: 'Ana <script>alert("r")</script> Júlia',
        itemTitle: 'Chaveiro <img src=x onerror=alert(1)> & Tag',
        issuerName: 'Servidor <b>IFPR</b> "SEBAC"',
        itemId: "ITEM-42<script>",
        signatureLink: validLink,
        expiresAt: "2026-12-10T12:00:00.000Z",
      });

      expect(remoteEmail.html).not.toContain("<script>");
      expect(remoteEmail.html).not.toContain("<img ");
      expect(remoteEmail.html).toContain("Ana &lt;script&gt;alert(&quot;r&quot;)&lt;/script&gt; Júlia");
      expect(remoteEmail.html).toContain("Chaveiro &lt;img src=x onerror=alert(1)&gt; &amp; Tag");
      expect(remoteEmail.html).toContain("Servidor &lt;b&gt;IFPR&lt;/b&gt; &quot;SEBAC&quot;");
      expect(remoteEmail.html).toContain(
        'href="https://localizamais.pclp.com.br/?tab=sign-receipt&amp;itemId=ITEM-42&amp;token=abc_123-XYZ"'
      );
      expect(remoteEmail.text).toContain(validLink);

      const staffEmail = buildStaffPendingSignatureEmailContent({
        issuerName: "Coordenação <svg onload=alert(1)>",
        signerName: 'Pedro "Aluno" <script>x()</script>',
        signerBond: "Discente <img src=x onerror=1>",
        itemId: "ITEM-42",
        itemTitle: "Caderno de Cálculo & Física",
        validationCode: "COMP-IFPR-999<script>",
      });

      expect(staffEmail.html).not.toContain("<script>");
      expect(staffEmail.html).not.toContain("<svg ");
      expect(staffEmail.html).not.toContain("<img ");
      expect(staffEmail.html).toContain("Coordenação &lt;svg onload=alert(1)&gt;");
      expect(staffEmail.html).toContain("Pedro &quot;Aluno&quot; &lt;script&gt;x()&lt;/script&gt;");
      expect(staffEmail.html).toContain("Caderno de Cálculo &amp; Física");
      expect(staffEmail.html).toContain("COMP-IFPR-999&lt;script&gt;");
      expect(staffEmail.text).toContain("Caderno de Cálculo & Física");
    });

    it("preserves firestore.rules SHA-256 unchanged", () => {
      const rules = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"));
      const sha = crypto.createHash("sha256").update(rules).digest("hex");
      expect(sha).toBe("7fa455e632a9d1831517fe7269e52d922b8614f903f0a28f025f6418812d95a5");
    });
  });
});
