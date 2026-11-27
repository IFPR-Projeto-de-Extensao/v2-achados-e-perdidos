import crypto from "crypto";
import nodemailer, { type Transporter } from "nodemailer";
import { applySecurityHeaders } from "../_lib/securityHeaders.js";
import {
  getAdminAuth,
  getAdminFirestore,
  getFirebaseAdminCredentialDiagnostics,
} from "../_lib/firebaseAdmin.js";

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"'`]/g, (c) => HTML_ESCAPE_MAP[c] || c);
}

function stripHeaderControls(value: unknown, maxLen: number = 150): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[\r\n\0]+/g, " ").replace(/["<>]/g, "").trim().slice(0, maxLen);
}

const SIMPLE_EMAIL_REGEX = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
export const OFFICIAL_SUPPORT_EMAIL = "localizamais0@gmail.com";

/**
 * Coherent timeouts sized to stay comfortably within Vercel's default 10s serverless execution limit
 * (Hobby plan) while running SMTP and Discord dispatches concurrently.
 */
export const FEEDBACK_TIMEOUTS = {
  smtpConnectionMs: 4_000,
  smtpGreetingMs: 4_000,
  smtpSocketMs: 6_000,
  smtpHardSendMs: 6_500,
  discordFetchMs: 4_500,
  firestorePersistMs: 3_000,
} as const;

export type SupportSmtpStatus =
  | "SENT"
  | "PENDING_SMTP_CONFIG"
  | "TIMEOUT"
  | "AUTH_FAILED"
  | "NETWORK_ERROR"
  | "ERROR";

export type SupportDiscordStatus =
  | "SENT"
  | "NOT_CONFIGURED"
  | "TIMEOUT"
  | "HTTP_ERROR"
  | "NETWORK_ERROR";

export type SupportDeliveryOutcome = "COMPLETE" | "PARTIAL" | "FAILED";

export interface FeedbackRequestBody {
  name?: string;
  email?: string;
  category?: string;
  subject?: string;
  message?: string;
  priority?: string;
  clientRequestId?: string;
  clientDiagnostics?: {
    screen?: string;
    currentPath?: string;
    online?: boolean;
    userAgent?: string;
    language?: string;
    [key: string]: any;
  };
}

export interface FeedbackExecutionResult {
  statusCode: number;
  payload: {
    success: boolean;
    deliveryOutcome: SupportDeliveryOutcome;
    protocol?: string;
    message?: string;
    error?: string;
    code?: string;
    timestamp?: string;
    destinationEmail?: string;
    emailSubject?: string;
    smtpDispatched: boolean;
    smtpStatus: SupportSmtpStatus;
    smtpMessageId: string | null;
    smtpError?: string | null;
    discordDispatched: boolean;
    discordStatus: SupportDiscordStatus;
    ticketPersisted: boolean;
    duplicatePrevented?: boolean;
    authContext?: "AUTHENTICATED" | "VISITOR";
  };
}

export interface ExecuteSupportFeedbackDeps {
  transporter?: Transporter | null;
  fetchImpl?: typeof fetch;
  adminFirestore?: any | null;
  authenticatedUser?: { uid: string; email?: string | null } | null;
  smtpHardTimeoutMs?: number;
  discordTimeoutMs?: number;
  nowMs?: number;
}

interface DedupeEntry {
  expiresAt: number;
  result: FeedbackExecutionResult;
}

const FEEDBACK_DEDUPE_CACHE = new Map<string, DedupeEntry>();
const DEDUPE_EXPLICIT_TTL_MS = 5 * 60 * 1000;
const DEDUPE_CONTENT_TTL_MS = 60 * 1000;
const MAX_DEDUPE_CACHE_SIZE = 500;

export function resetFeedbackDedupeCacheForTesting(): void {
  FEEDBACK_DEDUPE_CACHE.clear();
}

function pruneDedupeCache(nowMs: number): void {
  for (const [key, entry] of FEEDBACK_DEDUPE_CACHE.entries()) {
    if (entry.expiresAt <= nowMs) {
      FEEDBACK_DEDUPE_CACHE.delete(key);
    }
  }
  while (FEEDBACK_DEDUPE_CACHE.size > MAX_DEDUPE_CACHE_SIZE) {
    const oldestKey = FEEDBACK_DEDUPE_CACHE.keys().next().value;
    if (!oldestKey) break;
    FEEDBACK_DEDUPE_CACHE.delete(oldestKey);
  }
}

function sanitizeClientRequestId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return cleaned.length >= 6 ? cleaned : null;
}

function buildContentDedupeKey(input: {
  email: string;
  category: string;
  subject: string;
  message: string;
}): string {
  const hash = crypto
    .createHash("sha256")
    .update(
      `${input.email.toLowerCase()}|${input.category.toUpperCase()}|${input.subject.trim()}|${input.message.trim()}`
    )
    .digest("hex")
    .slice(0, 24);
  return `content:${hash}`;
}

function buildProtocol(clientRequestId: string | null, nowMs: number): string {
  if (clientRequestId) {
    const deterministicSuffix = crypto
      .createHash("sha256")
      .update(clientRequestId)
      .digest("hex")
      .slice(0, 10)
      .toUpperCase();
    return `IFPR-SUP-${deterministicSuffix}`;
  }
  return `IFPR-SUP-${nowMs.toString(36).toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

function sanitizeErrorForLog(raw: unknown): string {
  return String(raw || "Erro desconhecido")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 300);
}

export function createSmtpTransporter(): Transporter | null {
  const host = (process.env.SMTP_HOST || "").trim();
  const port = parseInt((process.env.SMTP_PORT || "587").trim(), 10) || 587;
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").trim().replace(/\s+/g, "");
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: FEEDBACK_TIMEOUTS.smtpConnectionMs,
    greetingTimeout: FEEDBACK_TIMEOUTS.smtpGreetingMs,
    socketTimeout: FEEDBACK_TIMEOUTS.smtpSocketMs,
    tls: {
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
    },
  });
}

export function buildSupportEmailHtml(
  ticket: {
    protocol: string;
    name: string;
    email: string;
    category: string;
    subject: string;
    message: string;
    priority?: string;
    timestamp: string;
    clientDiagnostics?: any;
  },
  destinationEmail: string = OFFICIAL_SUPPORT_EMAIL
): string {
  const categoryMap: Record<string, string> = {
    BUG_REPORT: "Relato de Bug / Erro no Sistema",
    FEEDBACK: "Sugestão ou Melhoria",
    SUPPORT: "Suporte Técnico & Atendimento",
    BELONGING_QUERY: "Dúvida sobre Pertence / Retirada",
    OTHER: "Elogio ou Outro Assunto",
  };

  const categoryLabel = categoryMap[ticket.category] || ticket.category;
  const priorityLabel = ticket.priority === "ALTA" ? "Alta" : ticket.priority === "BAIXA" ? "Baixa" : "Média";

  const isBugReport =
    ticket.category === "BUG_REPORT" ||
    ticket.category === "Relato de Bug / Erro no Sistema" ||
    (ticket.subject && ticket.subject.toLowerCase().includes("bug"));

  const headerColor = isBugReport ? "#DC2626" : "#00843D";
  const accentColor = isBugReport ? "#DC2626" : "#00843D";

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; color: #1e293b; }
    .container { max-width: 600px; margin: 24px auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
    .header { background: ${headerColor}; padding: 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 20px; font-weight: bold; color: #ffffff; }
    .header p { margin: 4px 0 0; opacity: 0.95; font-size: 13px; color: #ffffff; }
    .content { padding: 24px; }
    .field { margin-bottom: 12px; }
    .label { font-weight: 600; color: #475569; font-size: 13px; }
    .value { font-size: 14px; color: #0f172a; margin-top: 2px; }
    .message-box { background: #f1f5f9; padding: 16px; border-radius: 8px; border-left: 4px solid ${accentColor}; margin-top: 16px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; color: #0f172a; }
    .footer { padding: 16px 24px; background: #f8fafc; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Localiza+ • Novo Feedback / Suporte</h1>
      <p>Protocolo: ${escapeHtml(ticket.protocol)}</p>
    </div>
    <div class="content">
      <div class="field">
        <div class="label">Remetente:</div>
        <div class="value"><strong>${escapeHtml(ticket.name)}</strong> (${escapeHtml(ticket.email)})</div>
      </div>
      <div class="field">
        <div class="label">Categoria:</div>
        <div class="value">${escapeHtml(categoryLabel)}</div>
      </div>
      <div class="field">
        <div class="label">Prioridade:</div>
        <div class="value">${escapeHtml(priorityLabel)}</div>
      </div>
      <div class="field">
        <div class="label">Assunto:</div>
        <div class="value">${escapeHtml(ticket.subject)}</div>
      </div>
      <div class="field">
        <div class="label">Mensagem do Usuário:</div>
        <div class="message-box">${escapeHtml(ticket.message)}</div>
      </div>
    </div>
    <div class="footer">
      Central de Atendimento • IFPR Campus Ivaiporã • <a href="mailto:${escapeHtml(destinationEmail)}" style="color: ${accentColor}; text-decoration: none;">${escapeHtml(destinationEmail)}</a>
    </div>
  </div>
</body>
</html>
`;
}

async function sendWithHardTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const timeoutErr: any = new Error(timeoutMessage);
          timeoutErr.code = "ETIMEDOUT";
          reject(timeoutErr);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function sendFeedbackEmail(
  ticket: {
    protocol: string;
    name: string;
    email: string;
    category: string;
    subject: string;
    message: string;
    priority?: string;
    timestamp: string;
    clientDiagnostics?: any;
  },
  options?: {
    transporter?: Transporter | null;
    hardTimeoutMs?: number;
  }
): Promise<{
  sent: boolean;
  messageId?: string;
  error?: string;
  status: SupportSmtpStatus;
}> {
  const destinationEmail = OFFICIAL_SUPPORT_EMAIL;
  const transporter =
    options && "transporter" in options
      ? options.transporter ?? null
      : createSmtpTransporter();

  if (!transporter) {
    console.info(`[Support Email Notice] SMTP não configurado no ambiente. Protocolo ${ticket.protocol} registrado.`);
    return {
      sent: false,
      status: "PENDING_SMTP_CONFIG",
      error: "Variáveis SMTP (SMTP_HOST, SMTP_USER, SMTP_PASS) não configuradas.",
    };
  }

  const categoryMap: Record<string, string> = {
    BUG_REPORT: "Relato de Bug / Erro no Sistema",
    FEEDBACK: "Sugestão ou Melhoria",
    SUPPORT: "Suporte Técnico & Atendimento",
    BELONGING_QUERY: "Dúvida sobre Pertence / Retirada",
    OTHER: "Elogio ou Outro Assunto",
  };

  const categoryLabel = categoryMap[ticket.category] || ticket.category;
  const priorityLabel = ticket.priority === "ALTA" ? "Alta" : ticket.priority === "BAIXA" ? "Baixa" : "Média";

  const textBody = `[LOCALIZA+ • SUPORTE & FEEDBACK IFPR]
Protocolo: ${ticket.protocol}
Data/Hora: ${ticket.timestamp}

Remetente: ${ticket.name} <${ticket.email}>
Categoria: ${categoryLabel}
Prioridade: ${priorityLabel}
Assunto: ${ticket.subject}

Mensagem:
${ticket.message}

Diagnósticos do Cliente:
${JSON.stringify(ticket.clientDiagnostics || {}, null, 2)}
`;

  const htmlBody = buildSupportEmailHtml(ticket, destinationEmail);
  const safeReplyName = stripHeaderControls(ticket.name, 100);
  const safeReplyEmail = stripHeaderControls(ticket.email, 120);
  const safeSubject = stripHeaderControls(ticket.subject, 150);
  const fromAddress =
    (process.env.SMTP_FROM || "").trim() ||
    `"Localiza+ Suporte IFPR" <${(process.env.SMTP_USER || OFFICIAL_SUPPORT_EMAIL).trim()}>`;

  const hardTimeoutMs = options?.hardTimeoutMs ?? FEEDBACK_TIMEOUTS.smtpHardSendMs;

  try {
    const info = await sendWithHardTimeout(
      transporter.sendMail({
        from: fromAddress,
        to: destinationEmail,
        replyTo: SIMPLE_EMAIL_REGEX.test(safeReplyEmail)
          ? `${safeReplyName} <${safeReplyEmail}>`
          : undefined,
        subject: `[${stripHeaderControls(ticket.protocol, 40)}] ${safeSubject}`,
        text: textBody,
        html: htmlBody,
      }),
      hardTimeoutMs,
      `Tempo limite excedido ao enviar e-mail via SMTP (${hardTimeoutMs}ms).`
    );

    console.log(
      `[Support Email Success] E-mail despachado via SMTP. MessageID: ${info?.messageId || "N/A"}`
    );
    return {
      sent: true,
      messageId: info?.messageId || undefined,
      status: "SENT",
    };
  } catch (err: any) {
    const rawMsg = sanitizeErrorForLog(err?.message || err || "Erro desconhecido no envio SMTP");
    const lower = rawMsg.toLowerCase();
    const errCode = String(err?.code || "").toUpperCase();

    let smtpStatus: SupportSmtpStatus = "ERROR";
    if (errCode === "ETIMEDOUT" || lower.includes("timed out") || lower.includes("timeout") || lower.includes("tempo limite")) {
      smtpStatus = "TIMEOUT";
    } else if (
      err?.responseCode === 535 ||
      lower.includes("invalid login") ||
      lower.includes("authentication failed") ||
      lower.includes("badcredentials")
    ) {
      smtpStatus = "AUTH_FAILED";
    } else if (
      lower.includes("econnrefused") ||
      lower.includes("enotfound") ||
      lower.includes("network") ||
      lower.includes("econnreset")
    ) {
      smtpStatus = "NETWORK_ERROR";
    }
    console.error(`[Support Email Error: ${smtpStatus}] Falha ao enviar via SMTP:`, rawMsg);
    return {
      sent: false,
      status: smtpStatus,
      error: rawMsg,
    };
  }
}

function getDiscordFeedbackWebhookUrl(): string {
  return (
    process.env.DISCORD_FEEDBACK_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK_URL_FEEDBACK ||
    process.env.DISCORD_FEEDBACK_URL ||
    process.env.DISCORD_WEBHOOK_FEEDBACK ||
    process.env.DISCORD_SUPPORT_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK ||
    process.env.DISCORD_FEEDBACK ||
    ""
  ).trim();
}

export async function sendFeedbackToDiscord(
  ticket: {
    protocol: string;
    name: string;
    email: string;
    category: string;
    subject: string;
    message: string;
    priority?: string;
    timestamp: string;
    clientDiagnostics?: any;
  },
  options?: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  }
): Promise<{ sent: boolean; status: SupportDiscordStatus }> {
  const webhookUrl = getDiscordFeedbackWebhookUrl();
  const isConfigured = Boolean(webhookUrl && webhookUrl.length > 10);
  console.log(`[Feedback API Diagnostics] DISCORD_FEEDBACK_WEBHOOK_URL configured: ${isConfigured}`);

  if (!isConfigured) {
    console.info(
      `[Discord Feedback Notice] DISCORD_FEEDBACK_WEBHOOK_URL não configurada nas variáveis de ambiente. Protocolo ${ticket.protocol} registrado sem envio ao Discord.`
    );
    return { sent: false, status: "NOT_CONFIGURED" };
  }

  const fetchFn = options?.fetchImpl ?? fetch;
  const timeoutMs = options?.timeoutMs ?? FEEDBACK_TIMEOUTS.discordFetchMs;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const categoryMap: Record<string, { label: string; color: number; emoji: string }> = {
      BUG_REPORT: { label: "Relato de Bug / Erro no Sistema", color: 0xef4444, emoji: "🐛" },
      FEEDBACK: { label: "Sugestão ou Melhoria", color: 0xf59e0b, emoji: "💡" },
      SUPPORT: { label: "Suporte Técnico & Atendimento", color: 0x3b82f6, emoji: "🛠️" },
      BELONGING_QUERY: { label: "Dúvida sobre Pertence / Retirada", color: 0x3b82f6, emoji: "🔍" },
      OTHER: { label: "Elogio ou Outro Assunto", color: 0x10b981, emoji: "💬" },
    };

    const cat = categoryMap[ticket.category] || {
      label: ticket.category || "Feedback Geral",
      color: 0x6366f1,
      emoji: "📝",
    };

    const priorityLabel =
      ticket.priority === "ALTA"
        ? "🔴 Alta"
        : ticket.priority === "BAIXA"
        ? "🟢 Baixa"
        : "🟡 Média";

    let dateFormatted = ticket.timestamp;
    try {
      dateFormatted = new Date(ticket.timestamp).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {}

    const fields: Array<{ name: string; value: string; inline?: boolean }> = [
      { name: "👤 Usuário", value: ticket.name || "Não informado", inline: true },
      { name: "📧 E-mail", value: ticket.email || "Não informado", inline: true },
      { name: "🏷️ Tipo de Feedback", value: `${cat.emoji} ${cat.label}`, inline: true },
      { name: "⚡ Prioridade", value: priorityLabel, inline: true },
      { name: "📋 Protocolo", value: `\`${ticket.protocol}\``, inline: true },
      { name: "🕒 Data e Hora", value: dateFormatted, inline: true },
    ];

    if (ticket.clientDiagnostics && typeof ticket.clientDiagnostics === "object") {
      const diagParts = [
        ticket.clientDiagnostics.screen ? `🖥️ Tela: ${ticket.clientDiagnostics.screen}` : null,
        ticket.clientDiagnostics.currentPath ? `📍 Rota: \`${ticket.clientDiagnostics.currentPath}\`` : null,
        typeof ticket.clientDiagnostics.online === "boolean"
          ? `📶 Conexão: ${ticket.clientDiagnostics.online ? "Online" : "Offline"}`
          : null,
      ].filter(Boolean);

      if (diagParts.length > 0) {
        fields.push({
          name: "🛠️ Diagnóstico do Cliente",
          value: diagParts.join(" | ").substring(0, 1024),
          inline: false,
        });
      }
    }

    const discordPayload = {
      username: "IFPR Achados e Perdidos - Feedback",
      avatar_url: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/life-buoy.png",
      embeds: [
        {
          title: `${cat.emoji} [${cat.label}] ${ticket.subject}`.substring(0, 256),
          description: ticket.message.substring(0, 4000),
          color: cat.color,
          fields,
          footer: {
            text: "IFPR Campus Ivaiporã • Central de Atendimento & Feedback",
          },
          timestamp: ticket.timestamp,
        },
      ],
    };

    console.log(`[Feedback API Diagnostics] Dispatching fetch to Discord for protocol ${ticket.protocol}...`);
    const response = await fetchFn(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(discordPayload),
      signal: controller.signal,
    });

    console.log(
      `[Feedback API Diagnostics] Discord fetch response status: ${response.status} (${response.statusText || "OK"})`
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => "N/A");
      console.warn(`[Discord Feedback Warning] Resposta HTTP ${response.status} do Webhook:`, errText);
      return { sent: false, status: "HTTP_ERROR" };
    }

    console.log(`[Discord Feedback Success] Webhook despachado com sucesso para o protocolo ${ticket.protocol}.`);
    return { sent: true, status: "SENT" };
  } catch (webhookErr: any) {
    const isAbort = webhookErr?.name === "AbortError" || String(webhookErr?.message || "").toLowerCase().includes("abort");
    console.error(
      `[Discord Feedback Error] ${isAbort ? "Timeout" : "Falha de conexão"} ao enviar para o Discord:`,
      sanitizeErrorForLog(webhookErr?.message || webhookErr)
    );
    return { sent: false, status: isAbort ? "TIMEOUT" : "NETWORK_ERROR" };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function canUseRuntimeAdminFirestore(): boolean {
  const diag = getFirebaseAdminCredentialDiagnostics();
  return Boolean(
    diag.hasExplicitServiceAccount ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.FIRESTORE_EMULATOR_HOST
  );
}

async function resolveOptionalAuthenticatedUser(
  req: any
): Promise<{ uid: string; email?: string | null } | null> {
  const authHeader = req?.headers?.authorization || req?.headers?.Authorization;
  if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.split(" ")[1]?.trim();
  if (!token) return null;

  try {
    const adminAuth = getAdminAuth();
    if (!adminAuth) return null;
    const decoded = await adminAuth.verifyIdToken(token);
    if (decoded?.uid) {
      return { uid: decoded.uid, email: decoded.email || null };
    }
  } catch {
    // Visitors or expired tokens fall back to unauthenticated visitor context without blocking feedback
  }
  return null;
}

export async function executeSupportFeedback(
  body: FeedbackRequestBody,
  deps: ExecuteSupportFeedbackDeps = {}
): Promise<FeedbackExecutionResult> {
  const { name, email, category, subject, message, priority, clientDiagnostics, clientRequestId } = body || {};

  const trimmedName = stripHeaderControls(name, 100);
  const trimmedEmail = stripHeaderControls(email, 120);
  const trimmedSubject = stripHeaderControls(subject, 150);
  const trimmedMessage = String(message || "").trim();

  if (!trimmedName || !trimmedEmail || !trimmedSubject || !trimmedMessage) {
    return {
      statusCode: 400,
      payload: {
        success: false,
        deliveryOutcome: "FAILED",
        error:
          "Por favor, preencha todos os campos obrigatórios: nome, e-mail, assunto e descrição da mensagem.",
        code: "MISSING_REQUIRED_FIELDS",
        smtpDispatched: false,
        smtpStatus: "PENDING_SMTP_CONFIG",
        smtpMessageId: null,
        discordDispatched: false,
        discordStatus: "NOT_CONFIGURED",
        ticketPersisted: false,
      },
    };
  }

  if (!SIMPLE_EMAIL_REGEX.test(trimmedEmail)) {
    return {
      statusCode: 400,
      payload: {
        success: false,
        deliveryOutcome: "FAILED",
        error: "Informe um endereço de e-mail válido.",
        code: "INVALID_EMAIL",
        smtpDispatched: false,
        smtpStatus: "PENDING_SMTP_CONFIG",
        smtpMessageId: null,
        discordDispatched: false,
        discordStatus: "NOT_CONFIGURED",
        ticketPersisted: false,
      },
    };
  }

  const nowMs = deps.nowMs ?? Date.now();
  pruneDedupeCache(nowMs);

  const safeClientRequestId = sanitizeClientRequestId(clientRequestId);
  const explicitDedupeKey = safeClientRequestId ? `req:${safeClientRequestId}` : null;
  const contentDedupeKey = buildContentDedupeKey({
    email: trimmedEmail,
    category: String(category || "FEEDBACK"),
    subject: trimmedSubject,
    message: trimmedMessage,
  });

  // In-memory duplicate check (explicit clientRequestId or short-window identical payload)
  const cachedEntry =
    (explicitDedupeKey && FEEDBACK_DEDUPE_CACHE.get(explicitDedupeKey)) ||
    FEEDBACK_DEDUPE_CACHE.get(contentDedupeKey);
  if (cachedEntry && cachedEntry.expiresAt > nowMs) {
    return {
      statusCode: cachedEntry.result.statusCode,
      payload: {
        ...cachedEntry.result.payload,
        duplicatePrevented: true,
      },
    };
  }

  const ticketProtocol = buildProtocol(safeClientRequestId, nowMs);
  const timestamp = new Date(nowMs).toISOString();
  const destinationEmail = OFFICIAL_SUPPORT_EMAIL;
  const authContext: "AUTHENTICATED" | "VISITOR" = deps.authenticatedUser?.uid ? "AUTHENTICATED" : "VISITOR";

  const adminDb =
    "adminFirestore" in deps
      ? deps.adminFirestore ?? null
      : canUseRuntimeAdminFirestore()
      ? getAdminFirestore()
      : null;

  // Cross-instance idempotency check in Firestore when clientRequestId is provided
  if (adminDb && safeClientRequestId) {
    try {
      const existingSnap = await sendWithHardTimeout<any>(
        adminDb.collection("support_tickets").doc(`ticket_${ticketProtocol}`).get(),
        FEEDBACK_TIMEOUTS.firestorePersistMs,
        "Timeout ao verificar duplicidade do ticket no Firestore."
      );
      if (existingSnap && existingSnap.exists) {
        const existingData = existingSnap.data() || {};
        const prevSmtpSent = Boolean(existingData.smtpDispatched);
        const prevDiscordSent = Boolean(existingData.discordDispatched);
        const prevOutcome: SupportDeliveryOutcome =
          prevSmtpSent && prevDiscordSent
            ? "COMPLETE"
            : prevSmtpSent || prevDiscordSent
            ? "PARTIAL"
            : "FAILED";
        const dedupedResult: FeedbackExecutionResult = {
          statusCode: prevOutcome === "FAILED" ? 503 : 200,
          payload: {
            success: prevOutcome !== "FAILED",
            deliveryOutcome: prevOutcome,
            protocol: ticketProtocol,
            message:
              prevOutcome !== "FAILED"
                ? "Solicitação já registrada anteriormente com este identificador (envio duplicado evitado)."
                : undefined,
            error:
              prevOutcome === "FAILED"
                ? "Solicitação já registrada anteriormente, mas nenhum canal de notificação (SMTP/Discord) concluiu a entrega."
                : undefined,
            timestamp: existingData.createdAt || timestamp,
            destinationEmail,
            emailSubject: `[${ticketProtocol}] ${trimmedSubject}`,
            smtpDispatched: prevSmtpSent,
            smtpStatus: (existingData.smtpStatus as SupportSmtpStatus) || "PENDING_SMTP_CONFIG",
            smtpMessageId: existingData.smtpMessageId || null,
            discordDispatched: prevDiscordSent,
            discordStatus: (existingData.discordStatus as SupportDiscordStatus) || "NOT_CONFIGURED",
            ticketPersisted: true,
            duplicatePrevented: true,
            authContext,
          },
        };
        return dedupedResult;
      }
    } catch (lookupErr: any) {
      console.warn(
        "[Support Ticket Dedupe Warning] Não foi possível consultar duplicidade prévia no Firestore:",
        sanitizeErrorForLog(lookupErr?.message || lookupErr)
      );
    }
  }

  console.log(
    `[Feedback API Diagnostics] Request received - Protocol: ${ticketProtocol}, Category: ${category || "FEEDBACK"}, Context: ${authContext}`
  );

  const ticketPayload = {
    protocol: ticketProtocol,
    name: trimmedName.substring(0, 100),
    email: trimmedEmail.substring(0, 120),
    category: String(category || "FEEDBACK"),
    subject: trimmedSubject.substring(0, 150),
    message: trimmedMessage.substring(0, 4000),
    priority: String(priority || "MEDIA"),
    timestamp,
    clientDiagnostics,
  };

  // Run SMTP and Discord IN PARALLEL so slow/hung SMTP never blocks Discord
  const [emailResult, discordResult] = await Promise.all([
    sendFeedbackEmail(ticketPayload, {
      ...("transporter" in deps ? { transporter: deps.transporter } : {}),
      hardTimeoutMs: deps.smtpHardTimeoutMs ?? FEEDBACK_TIMEOUTS.smtpHardSendMs,
    }),
    sendFeedbackToDiscord(ticketPayload, {
      fetchImpl: deps.fetchImpl,
      timeoutMs: deps.discordTimeoutMs ?? FEEDBACK_TIMEOUTS.discordFetchMs,
    }),
  ]);

  const smtpDispatched = Boolean(emailResult.sent);
  const discordDispatched = Boolean(discordResult.sent);
  const deliveryOutcome: SupportDeliveryOutcome =
    smtpDispatched && discordDispatched
      ? "COMPLETE"
      : smtpDispatched || discordDispatched
      ? "PARTIAL"
      : "FAILED";

  // Persist support_tickets and email_notifications consistently via Admin SDK (for both authenticated users & visitors)
  let ticketPersisted = false;
  if (adminDb) {
    try {
      const ticketDocId = `ticket_${ticketProtocol}`;
      const ticketRecord: Record<string, any> = {
        id: ticketDocId,
        protocol: ticketProtocol,
        name: ticketPayload.name,
        email: ticketPayload.email,
        category: ticketPayload.category,
        subject: ticketPayload.subject,
        message: ticketPayload.message,
        priority: ticketPayload.priority,
        status: "NOVO",
        authContext,
        createdAt: timestamp,
        smtpDispatched,
        smtpStatus: emailResult.status,
        smtpMessageId: emailResult.messageId || null,
        discordDispatched,
        discordStatus: discordResult.status,
        deliveryOutcome,
        ...(safeClientRequestId ? { clientRequestId: safeClientRequestId } : {}),
        ...(ticketPayload.clientDiagnostics ? { clientDiagnostics: ticketPayload.clientDiagnostics } : {}),
      };

      if (deps.authenticatedUser?.uid) {
        ticketRecord.userId = deps.authenticatedUser.uid;
      }

      const notifDocId = `email_ticket_${ticketProtocol}`;
      await sendWithHardTimeout(
        Promise.all([
          adminDb.collection("support_tickets").doc(ticketDocId).set(ticketRecord, { merge: false }),
          adminDb
            .collection("email_notifications")
            .doc(notifDocId)
            .set(
              {
                id: notifDocId,
                ticketProtocol,
                recipientEmail: destinationEmail,
                senderName: ticketPayload.name,
                senderEmail: ticketPayload.email,
                subject: `[${ticketProtocol}] ${ticketPayload.subject}`,
                category: ticketPayload.category,
                type: "SUPPORT_FEEDBACK",
                status: emailResult.status,
                messageId: emailResult.messageId || null,
                error: emailResult.error || null,
                discordDispatched,
                discordStatus: discordResult.status,
                deliveryOutcome,
                timestamp,
                createdAt: timestamp,
              },
              { merge: false }
            ),
        ]),
        FEEDBACK_TIMEOUTS.firestorePersistMs,
        "Tempo limite ao persistir ticket no Firestore."
      );
      ticketPersisted = true;
    } catch (dbErr: any) {
      console.warn(
        "[Support Ticket Firestore Warning] Falha ao persistir ticket no Firestore:",
        sanitizeErrorForLog(dbErr?.message || dbErr)
      );
      ticketPersisted = false;
    }
  }

  let result: FeedbackExecutionResult;

  if (deliveryOutcome === "COMPLETE") {
    result = {
      statusCode: 200,
      payload: {
        success: true,
        deliveryOutcome: "COMPLETE",
        protocol: ticketProtocol,
        message:
          "Seu relato/feedback foi enviado com sucesso por e-mail institucional e notificado no Discord da equipe do Campus Ivaiporã.",
        timestamp,
        destinationEmail,
        emailSubject: `[${ticketProtocol}] ${ticketPayload.subject}`,
        smtpDispatched: true,
        smtpStatus: emailResult.status,
        smtpMessageId: emailResult.messageId || null,
        discordDispatched: true,
        discordStatus: discordResult.status,
        ticketPersisted,
        authContext,
      },
    };
  } else if (deliveryOutcome === "PARTIAL") {
    const partialMsg = smtpDispatched
      ? "Seu relato/feedback foi enviado por e-mail institucional, mas a notificação no Discord não pôde ser concluída no momento."
      : "Seu relato/feedback foi entregue no Discord da equipe, mas o envio por e-mail SMTP não pôde ser concluído no momento.";
    result = {
      statusCode: 200,
      payload: {
        success: true,
        deliveryOutcome: "PARTIAL",
        protocol: ticketProtocol,
        message: partialMsg,
        timestamp,
        destinationEmail,
        emailSubject: `[${ticketProtocol}] ${ticketPayload.subject}`,
        smtpDispatched,
        smtpStatus: emailResult.status,
        smtpMessageId: emailResult.messageId || null,
        smtpError: emailResult.error || null,
        discordDispatched,
        discordStatus: discordResult.status,
        ticketPersisted,
        authContext,
      },
    };
  } else {
    const bothUnconfigured =
      emailResult.status === "PENDING_SMTP_CONFIG" && discordResult.status === "NOT_CONFIGURED";
    const failError = ticketPersisted
      ? "Não foi possível entregar a notificação por e-mail SMTP nem pelo Discord no momento. Seu protocolo foi salvo internamente, mas recomendamos enviar uma cópia para localizamais0@gmail.com."
      : "Falha ao enviar sua solicitação: os canais de notificação (e-mail SMTP e Discord) estão indisponíveis no momento. Tente novamente ou envie diretamente para localizamais0@gmail.com.";

    result = {
      statusCode: bothUnconfigured ? 503 : 502,
      payload: {
        success: false,
        deliveryOutcome: "FAILED",
        code: bothUnconfigured ? "NOTIFICATION_CHANNELS_NOT_CONFIGURED" : "ALL_NOTIFICATION_CHANNELS_FAILED",
        protocol: ticketProtocol,
        error: failError,
        timestamp,
        destinationEmail,
        emailSubject: `[${ticketProtocol}] ${ticketPayload.subject}`,
        smtpDispatched: false,
        smtpStatus: emailResult.status,
        smtpMessageId: null,
        smtpError: emailResult.error || null,
        discordDispatched: false,
        discordStatus: discordResult.status,
        ticketPersisted,
        authContext,
      },
    };
  }

  // Only cache completed or persisted attempts so a failed/unpersisted attempt can be retried
  if (deliveryOutcome !== "FAILED" || ticketPersisted) {
    if (explicitDedupeKey) {
      FEEDBACK_DEDUPE_CACHE.set(explicitDedupeKey, {
        expiresAt: nowMs + DEDUPE_EXPLICIT_TTL_MS,
        result,
      });
    }
    FEEDBACK_DEDUPE_CACHE.set(contentDedupeKey, {
      expiresAt: nowMs + DEDUPE_CONTENT_TTL_MS,
      result,
    });
  }

  return result;
}

async function parseBody(req: any): Promise<FeedbackRequestBody> {
  if (req.body) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
    if (typeof req.body === "object") {
      return req.body;
    }
  }

  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk: any) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

export default async function handler(req: any, res: any) {
  applySecurityHeaders(res, process.env.NODE_ENV === "production");

  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      deliveryOutcome: "FAILED",
      error: "Método não permitido. Utilize POST para envio de feedback.",
      smtpDispatched: false,
      smtpStatus: "PENDING_SMTP_CONFIG",
      smtpMessageId: null,
      discordDispatched: false,
      discordStatus: "NOT_CONFIGURED",
      ticketPersisted: false,
    });
  }

  try {
    const body = await parseBody(req);
    const authenticatedUser = await resolveOptionalAuthenticatedUser(req);
    const result = await executeSupportFeedback(body, {
      authenticatedUser,
    });
    return res.status(result.statusCode).json(result.payload);
  } catch (error: any) {
    console.error("[send-feedback API Error]:", sanitizeErrorForLog(error?.message || error));
    return res.status(500).json({
      success: false,
      deliveryOutcome: "FAILED",
      error: "Erro interno no servidor ao processar envio do formulário de contato.",
      smtpDispatched: false,
      smtpStatus: "ERROR",
      smtpMessageId: null,
      discordDispatched: false,
      discordStatus: "NETWORK_ERROR",
      ticketPersisted: false,
    });
  }
}
