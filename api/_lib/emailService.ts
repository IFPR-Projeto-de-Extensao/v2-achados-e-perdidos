import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";

export type EmailProviderName = "RESEND" | "SMTP" | "NONE";
export type StandardizedEmailStatus = "SENT" | "PENDING" | "ERROR";
export type EmailConfigurationState = "CONFIGURED" | "INVALID_CONFIG" | "UNCONFIGURED";

export type EmailErrorCode =
  | "MISSING_CONFIG"
  | "INVALID_FROM_ADDRESS"
  | "INVALID_RECIPIENT"
  | "AUTH_ERROR"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "SERVICE_UNAVAILABLE"
  | "DELIVERY_ERROR";

export interface TransactionalEmailRequest {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  from?: string;
  fromName?: string;
  category?: string;
  dedupeKey?: string;
  dedupeTtlMs?: number;
  timeoutMs?: number;
  tags?: Array<{ name: string; value: string }>;
}

export interface TransactionalEmailResult {
  sent: boolean;
  status: StandardizedEmailStatus;
  provider: EmailProviderName;
  messageId: string | null;
  error?: string;
  errorCode?: EmailErrorCode;
  fallbackUsed: boolean;
  fallbackReason?: string;
  deduplicated?: boolean;
  timestamp: string;
}

export interface ResendClientLike {
  emails: {
    send: (
      payload: {
        from: string;
        to: string | string[];
        subject: string;
        html?: string;
        text?: string;
        replyTo?: string | string[];
        tags?: Array<{ name: string; value: string }>;
      },
      options?: { idempotencyKey?: string }
    ) => Promise<{ data?: { id?: string } | null; error?: any }>;
  };
}

export interface EmailServiceDeps {
  resendClient?: ResendClientLike | null;
  smtpTransporter?: Transporter | null;
  env?: NodeJS.ProcessEnv;
  skipResend?: boolean;
  allowSmtpFallback?: boolean;
  nowMs?: () => number;
}

export interface LastEmailDispatchSnapshot {
  status: StandardizedEmailStatus;
  provider: EmailProviderName;
  messageId: string | null;
  category: string | null;
  errorCode: EmailErrorCode | null;
  error: string | null;
  fallbackUsed: boolean;
  timestamp: string;
}

export interface EmailProviderConfigStatus {
  activeProvider: EmailProviderName;
  configurationState: EmailConfigurationState;
  emailConfigured: boolean;
  fallbackAvailable: boolean;
  resend: {
    configured: boolean;
    apiKeyPresent: boolean;
    fromPresent: boolean;
    fromValid: boolean;
    fromMasked: string | null;
    error: string | null;
  };
  smtp: {
    configured: boolean;
    hostPresent: boolean;
    portPresent: boolean;
    userPresent: boolean;
    passPresent: boolean;
    fromPresent: boolean;
    host: string | null;
    port: string;
    secure: boolean;
    userMasked: string | null;
    fromMasked: string | null;
  };
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_DEDUPE_TTL_MS = 60_000;
const MAX_DEDUPE_ENTRIES = 500;

const EMAIL_ADDRESS_REGEX = /^[^\s@<>"'(),:;\\[\]]+@[^\s@<>"'(),:;\\[\]]+\.[^\s@<>"'(),:;\\[\]]{2,}$/;

interface DedupeEntry {
  expiresAt: number;
  result: TransactionalEmailResult;
}

const recentSentCache = new Map<string, DedupeEntry>();
const inFlightDispatches = new Map<string, Promise<TransactionalEmailResult>>();
let lastDispatchSnapshot: LastEmailDispatchSnapshot | null = null;

export function clearEmailServiceRuntimeState(): void {
  recentSentCache.clear();
  inFlightDispatches.clear();
  lastDispatchSnapshot = null;
}

export function getLastEmailDispatchSnapshot(): LastEmailDispatchSnapshot | null {
  return lastDispatchSnapshot ? { ...lastDispatchSnapshot } : null;
}

export function sanitizeHeaderLine(value: unknown, maxLen = 200): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/[\r\n\0]+/g, " ")
    .trim()
    .slice(0, maxLen);
}

/**
 * Redacts API keys, tokens, reset oobCodes, signature tokens, passwords,
 * and control characters before writing to logs, Firestore, or API responses.
 */
export function sanitizeEmailSensitiveText(raw: unknown, maxLen = 400): string {
  if (raw === null || raw === undefined) return "";
  const str = typeof raw === "string" ? raw : raw instanceof Error ? raw.message : String(raw);
  return str
    .replace(/[\r\n\0]+/g, " ")
    // Resend API keys (re_...)
    .replace(/\bre_[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_RESEND_KEY]")
    // Bearer / Authorization headers
    .replace(/bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    // Sensitive URL query params (Firebase oobCode, apiKey, signature token, etc.)
    .replace(/([?&](?:oobCode|token|apiKey|key|secret|password|pass|code|sig)=)[^&\s"'<>]+/gi, "$1[REDACTED]")
    // Standalone key=value credentials
    .replace(/\b(api[_-]?key|password|pass|secret|token|authorization)\s*[:=]\s*[^\s,;'"<>]+/gi, "$1=[REDACTED]")
    // Full Firebase action / signature links containing sensitive params
    .replace(/https?:\/\/[^\s"'<>]*(?:__\/auth\/action|oobCode=|tab=sign-receipt)[^\s"'<>]*/gi, "[REDACTED_ACTION_LINK]")
    .trim()
    .slice(0, maxLen);
}

export function maskEmailAddress(raw?: string | null): string | null {
  const input = String(raw || "").trim();
  if (!input) return null;

  const angleMatch = input.match(/<([^<>]+)>/);
  const emailOnly = (angleMatch ? angleMatch[1] : input).trim();
  if (!emailOnly.includes("@")) return null;

  const [localPart, domainPart] = emailOnly.split("@");
  if (!localPart || !domainPart) return null;
  const visible = localPart.length <= 2 ? localPart[0] || "*" : localPart.slice(0, 3);
  return `${visible}***@${domainPart}`;
}

/**
 * Validates both bare `user@domain.tld` and RFC display format `"Name" <user@domain.tld>` / `Name <user@domain.tld>`.
 * Strictly rejects CRLF injection and malformed addresses.
 */
export function validateSenderAddress(raw?: string | null): {
  valid: boolean;
  normalized?: string;
  email?: string;
  reason?: string;
} {
  if (typeof raw !== "string" || !raw.trim()) {
    return { valid: false, reason: "Endereço remetente ausente." };
  }
  if (/[\r\n\0]/.test(raw)) {
    return { valid: false, reason: "Endereço remetente contém caracteres de controle inválidos." };
  }
  const trimmed = raw.trim();
  const angleMatch = trimmed.match(/^([^<>]*?)\s*<([^<>]+)>$/);
  if (angleMatch) {
    const displayName = angleMatch[1].trim().replace(/^["']|["']$/g, "").trim();
    const emailPart = angleMatch[2].trim().toLowerCase();
    if (!EMAIL_ADDRESS_REGEX.test(emailPart)) {
      return { valid: false, reason: "Endereço remetente em formato inválido." };
    }
    const normalized = displayName ? `${displayName} <${emailPart}>` : emailPart;
    return { valid: true, normalized, email: emailPart };
  }

  const lowered = trimmed.toLowerCase();
  if (!EMAIL_ADDRESS_REGEX.test(lowered)) {
    return { valid: false, reason: "Endereço remetente em formato inválido." };
  }
  return { valid: true, normalized: lowered, email: lowered };
}

export function validateRecipientAddresses(to: string | string[]): {
  valid: boolean;
  recipients: string[];
  reason?: string;
} {
  const list = Array.isArray(to) ? to : [to];
  const cleaned: string[] = [];

  for (const item of list) {
    if (typeof item !== "string" || /[\r\n\0]/.test(item)) {
      return { valid: false, recipients: [], reason: "Destinatário inválido ou malformado." };
    }
    const trimmed = item.trim().toLowerCase();
    if (!trimmed || !EMAIL_ADDRESS_REGEX.test(trimmed)) {
      return { valid: false, recipients: [], reason: "Endereço de e-mail destinatário inválido." };
    }
    cleaned.push(trimmed);
  }

  if (cleaned.length === 0) {
    return { valid: false, recipients: [], reason: "Nenhum destinatário informado." };
  }

  return { valid: true, recipients: cleaned };
}

export function getEmailProviderConfig(
  env: NodeJS.ProcessEnv = process.env
): EmailProviderConfigStatus {
  const resendApiKey = (env.RESEND_API_KEY || "").trim();
  const resendFromRaw = (env.RESEND_FROM_EMAIL || "").trim();
  const resendApiKeyPresent = Boolean(resendApiKey);
  const resendFromPresent = Boolean(resendFromRaw);
  const resendFromCheck = resendFromPresent
    ? validateSenderAddress(resendFromRaw)
    : { valid: false, reason: "RESEND_FROM_EMAIL não configurado." };

  let resendError: string | null = null;
  if (resendApiKeyPresent && !resendFromPresent) {
    resendError = "RESEND_API_KEY presente, porém RESEND_FROM_EMAIL está ausente.";
  } else if (resendApiKeyPresent && !resendFromCheck.valid) {
    resendError = resendFromCheck.reason || "RESEND_FROM_EMAIL inválido.";
  } else if (!resendApiKeyPresent && resendFromPresent && !resendFromCheck.valid) {
    resendError = resendFromCheck.reason || "RESEND_FROM_EMAIL inválido.";
  }

  const resendConfigured = Boolean(resendApiKeyPresent && resendFromCheck.valid);

  const smtpHost = (env.SMTP_HOST || "").trim();
  const smtpPortRaw = (env.SMTP_PORT || "587").trim();
  const smtpPortNum = parseInt(smtpPortRaw, 10) || 587;
  const smtpUser = (env.SMTP_USER || "").trim();
  const smtpPass = (env.SMTP_PASS || "").trim().replace(/\s+/g, "");
  const smtpFromRaw = (env.SMTP_FROM || "").trim();
  const smtpSecure = env.SMTP_SECURE === "true" || smtpPortNum === 465;
  const smtpConfigured = Boolean(smtpHost && smtpUser && smtpPass);

  let activeProvider: EmailProviderName = "NONE";
  let configurationState: EmailConfigurationState = "UNCONFIGURED";

  if (resendConfigured) {
    activeProvider = "RESEND";
    configurationState = "CONFIGURED";
  } else if (smtpConfigured) {
    activeProvider = "SMTP";
    configurationState = "CONFIGURED";
  } else if (resendApiKeyPresent || resendFromPresent) {
    activeProvider = "NONE";
    configurationState = "INVALID_CONFIG";
  }

  return {
    activeProvider,
    configurationState,
    emailConfigured: resendConfigured || smtpConfigured,
    fallbackAvailable: smtpConfigured,
    resend: {
      configured: resendConfigured,
      apiKeyPresent: resendApiKeyPresent,
      fromPresent: resendFromPresent,
      fromValid: resendFromCheck.valid,
      fromMasked: resendFromCheck.valid ? maskEmailAddress(resendFromCheck.normalized) : null,
      error: resendError,
    },
    smtp: {
      configured: smtpConfigured,
      hostPresent: Boolean(smtpHost),
      portPresent: Boolean(env.SMTP_PORT),
      userPresent: Boolean(smtpUser),
      passPresent: Boolean(smtpPass),
      fromPresent: Boolean(smtpFromRaw),
      host: smtpHost || null,
      port: String(smtpPortNum),
      secure: smtpSecure,
      userMasked: maskEmailAddress(smtpUser),
      fromMasked: maskEmailAddress(smtpFromRaw || smtpUser),
    },
  };
}

export function createSmtpTransporter(env: NodeJS.ProcessEnv = process.env): Transporter | null {
  const host = (env.SMTP_HOST || "").trim();
  const port = parseInt(env.SMTP_PORT || "587", 10);
  const user = (env.SMTP_USER || "").trim();
  const pass = (env.SMTP_PASS || "").trim().replace(/\s+/g, "");
  const secure = env.SMTP_SECURE === "true" || port === 465;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    tls: {
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
    },
  });
}

function classifyProviderError(err: any): { errorCode: EmailErrorCode; sanitizedMessage: string } {
  const statusCode = Number(err?.statusCode || err?.status || err?.responseCode || 0);
  const name = String(err?.name || "").toLowerCase();
  const rawMessage = String(err?.message || err || "Erro desconhecido no envio de e-mail");
  const lower = rawMessage.toLowerCase();
  const sanitizedMessage = sanitizeEmailSensitiveText(rawMessage) || "Falha no provedor de e-mail.";

  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("etimedout") ||
    lower.includes("abort")
  ) {
    return { errorCode: "TIMEOUT", sanitizedMessage };
  }

  if (
    statusCode === 401 ||
    statusCode === 403 ||
    statusCode === 535 ||
    name.includes("invalid_api_key") ||
    name.includes("missing_api_key") ||
    lower.includes("api key is invalid") ||
    lower.includes("invalid api key") ||
    lower.includes("unauthorized") ||
    lower.includes("authentication failed") ||
    lower.includes("invalid login") ||
    lower.includes("badcredentials")
  ) {
    return { errorCode: "AUTH_ERROR", sanitizedMessage };
  }

  if (
    statusCode === 429 ||
    name.includes("rate_limit") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("quota")
  ) {
    return { errorCode: "RATE_LIMITED", sanitizedMessage };
  }

  if (
    (statusCode === 400 || statusCode === 422) &&
    (lower.includes("from") || lower.includes("sender") || lower.includes("domain is not verified"))
  ) {
    return { errorCode: "INVALID_FROM_ADDRESS", sanitizedMessage };
  }

  if (
    statusCode >= 500 ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("econnreset") ||
    lower.includes("service unavailable") ||
    lower.includes("bad gateway") ||
    lower.includes("fetch failed") ||
    lower.includes("network")
  ) {
    return { errorCode: "SERVICE_UNAVAILABLE", sanitizedMessage };
  }

  return { errorCode: "DELIVERY_ERROR", sanitizedMessage };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function pruneDedupeCache(now: number): void {
  for (const [key, entry] of recentSentCache.entries()) {
    if (entry.expiresAt <= now) {
      recentSentCache.delete(key);
    }
  }
  if (recentSentCache.size > MAX_DEDUPE_ENTRIES) {
    const oldestKey = recentSentCache.keys().next().value;
    if (oldestKey) recentSentCache.delete(oldestKey);
  }
}

function recordLastDispatch(result: TransactionalEmailResult, category?: string): void {
  lastDispatchSnapshot = {
    status: result.status,
    provider: result.provider,
    messageId: result.messageId,
    category: category || null,
    errorCode: result.errorCode || null,
    error: result.error ? sanitizeEmailSensitiveText(result.error) : null,
    fallbackUsed: result.fallbackUsed,
    timestamp: result.timestamp,
  };
}

function resolveSenderWithOptionalName(
  baseSender: string,
  fromName?: string
): { valid: boolean; normalized?: string; reason?: string } {
  const check = validateSenderAddress(baseSender);
  if (!check.valid || !check.normalized || !check.email) {
    return { valid: false, reason: check.reason };
  }
  if (!baseSender.includes("<") && fromName && fromName.trim()) {
    const cleanName = sanitizeHeaderLine(fromName, 100).replace(/["<>]/g, "");
    if (cleanName) {
      return { valid: true, normalized: `${cleanName} <${check.email}>` };
    }
  }
  return { valid: true, normalized: check.normalized };
}

/**
 * Centralized transactional email dispatcher for Localiza+:
 * 1. Priority: Resend official SDK (`RESEND_API_KEY` + `RESEND_FROM_EMAIL`)
 * 2. Temporary fallback: SMTP (`nodemailer`) when configured
 * 3. Honest fail-closed reporting (`SENT` | `PENDING` | `ERROR`) — never simulates success.
 */
export async function sendTransactionalEmail(
  request: TransactionalEmailRequest,
  deps?: EmailServiceDeps
): Promise<TransactionalEmailResult> {
  const env = deps?.env || process.env;
  const nowFn = deps?.nowMs || (() => Date.now());
  const now = nowFn();
  const timestamp = new Date(now).toISOString();
  const timeoutMs =
    typeof request.timeoutMs === "number" && request.timeoutMs > 0
      ? request.timeoutMs
      : DEFAULT_TIMEOUT_MS;
  const dedupeKey = request.dedupeKey ? sanitizeHeaderLine(request.dedupeKey, 160) : "";

  // 1. Validate recipients
  const recipientCheck = validateRecipientAddresses(request.to);
  if (!recipientCheck.valid) {
    const res: TransactionalEmailResult = {
      sent: false,
      status: "ERROR",
      provider: "NONE",
      messageId: null,
      errorCode: "INVALID_RECIPIENT",
      error: recipientCheck.reason || "Destinatário inválido.",
      fallbackUsed: false,
      timestamp,
    };
    recordLastDispatch(res, request.category);
    return res;
  }

  // 2. Deduplication guard (prevents duplicate sends in-flight or within TTL window)
  if (dedupeKey) {
    pruneDedupeCache(now);
    const cached = recentSentCache.get(dedupeKey);
    if (cached && cached.expiresAt > now) {
      return {
        ...cached.result,
        deduplicated: true,
      };
    }
    const existingFlight = inFlightDispatches.get(dedupeKey);
    if (existingFlight) {
      const flightRes = await existingFlight;
      return flightRes.sent ? { ...flightRes, deduplicated: true } : flightRes;
    }
  }

  const executeSend = async (): Promise<TransactionalEmailResult> => {
    const cleanSubject = sanitizeHeaderLine(request.subject, 240);
    const cleanReplyTo = request.replyTo
      ? validateSenderAddress(request.replyTo).normalized
      : undefined;

    const resendApiKey = (env.RESEND_API_KEY || "").trim();
    const resendFromEnv = (env.RESEND_FROM_EMAIL || "").trim();
    const hasResendClientInjected = Boolean(deps?.resendClient);
    const shouldAttemptResend =
      !deps?.skipResend && (hasResendClientInjected || Boolean(resendApiKey));

    const allowSmtpFallback = deps?.allowSmtpFallback !== false;
    const smtpTransporter =
      deps && "smtpTransporter" in deps
        ? deps.smtpTransporter ?? null
        : createSmtpTransporter(env);

    let primaryError: string | undefined;
    let primaryErrorCode: EmailErrorCode | undefined;

    // --- Priority Provider: Resend ---
    if (shouldAttemptResend) {
      const rawResendFrom = (request.from || resendFromEnv || "").trim();
      const senderCheck = resolveSenderWithOptionalName(rawResendFrom, request.fromName);

      if (!senderCheck.valid || !senderCheck.normalized) {
        primaryErrorCode = "INVALID_FROM_ADDRESS";
        primaryError = rawResendFrom
          ? `RESEND_FROM_EMAIL inválido: ${senderCheck.reason || "formato incorreto."}`
          : "RESEND_FROM_EMAIL não configurado no servidor.";
      } else {
        try {
          const client: ResendClientLike =
            deps?.resendClient || (new Resend(resendApiKey) as unknown as ResendClientLike);

          const resendPayload: {
            from: string;
            to: string | string[];
            subject: string;
            html?: string;
            text?: string;
            replyTo?: string;
            tags?: Array<{ name: string; value: string }>;
          } = {
            from: senderCheck.normalized,
            to:
              recipientCheck.recipients.length === 1
                ? recipientCheck.recipients[0]
                : recipientCheck.recipients,
            subject: cleanSubject,
          };

          if (request.html) resendPayload.html = request.html;
          if (request.text) resendPayload.text = request.text;
          if (!resendPayload.html && !resendPayload.text) {
            resendPayload.text = cleanSubject;
          }
          if (cleanReplyTo) resendPayload.replyTo = cleanReplyTo;
          if (request.tags && request.tags.length > 0) resendPayload.tags = request.tags;

          const sendPromise = client.emails.send(
            resendPayload,
            dedupeKey ? { idempotencyKey: dedupeKey } : undefined
          );
          const response = await withTimeout(sendPromise, timeoutMs, "Resend API");

          if (response?.error) {
            const classified = classifyProviderError(response.error);
            primaryErrorCode = classified.errorCode;
            primaryError = classified.sanitizedMessage;
          } else if (response?.data?.id) {
            const result: TransactionalEmailResult = {
              sent: true,
              status: "SENT",
              provider: "RESEND",
              messageId: String(response.data.id),
              fallbackUsed: false,
              timestamp: new Date(nowFn()).toISOString(),
            };
            recordLastDispatch(result, request.category);
            return result;
          } else {
            primaryErrorCode = "DELIVERY_ERROR";
            primaryError = "Resend não retornou identificador da mensagem.";
          }
        } catch (resendErr: any) {
          const classified = classifyProviderError(resendErr);
          primaryErrorCode = classified.errorCode;
          primaryError = classified.sanitizedMessage;
        }
      }

      // If Resend failed and SMTP fallback is NOT available/allowed, report honest ERROR
      if (!allowSmtpFallback || !smtpTransporter) {
        const failResult: TransactionalEmailResult = {
          sent: false,
          status: "ERROR",
          provider: "RESEND",
          messageId: null,
          errorCode: primaryErrorCode || "DELIVERY_ERROR",
          error: sanitizeEmailSensitiveText(primaryError || "Falha ao enviar e-mail via Resend."),
          fallbackUsed: false,
          timestamp: new Date(nowFn()).toISOString(),
        };
        recordLastDispatch(failResult, request.category);
        return failResult;
      }
    }

    // --- Fallback / Legacy Provider: SMTP ---
    if (smtpTransporter) {
      const smtpFallbackSender =
        (env.SMTP_FROM || "").trim() ||
        (request.fromName
          ? `"${sanitizeHeaderLine(request.fromName, 100).replace(/["<>]/g, "")}" <${(env.SMTP_USER || "campus.ivaipora@ifpr.edu.br").trim()}>`
          : `"IFPR Achados & Perdidos" <${(env.SMTP_USER || "campus.ivaipora@ifpr.edu.br").trim()}>`);

      const smtpSenderCheck = validateSenderAddress(smtpFallbackSender);
      if (!smtpSenderCheck.valid || !smtpSenderCheck.normalized) {
        const errRes: TransactionalEmailResult = {
          sent: false,
          status: "ERROR",
          provider: "SMTP",
          messageId: null,
          errorCode: "INVALID_FROM_ADDRESS",
          error: sanitizeEmailSensitiveText(
            primaryError
              ? `Resend: ${primaryError} | Fallback SMTP: remetente inválido.`
              : "Endereço remetente SMTP inválido."
          ),
          fallbackUsed: Boolean(shouldAttemptResend),
          fallbackReason: primaryError ? sanitizeEmailSensitiveText(primaryError) : undefined,
          timestamp: new Date(nowFn()).toISOString(),
        };
        recordLastDispatch(errRes, request.category);
        return errRes;
      }

      try {
        const info = await withTimeout(
          smtpTransporter.sendMail({
            from: smtpSenderCheck.normalized,
            to: recipientCheck.recipients.join(", "),
            replyTo: cleanReplyTo,
            subject: cleanSubject,
            text: request.text,
            html: request.html,
          }),
          timeoutMs,
          "SMTP Transport"
        );

        const messageId = info?.messageId ? String(info.messageId) : null;
        const okRes: TransactionalEmailResult = {
          sent: true,
          status: "SENT",
          provider: "SMTP",
          messageId,
          fallbackUsed: Boolean(shouldAttemptResend),
          fallbackReason: primaryError ? sanitizeEmailSensitiveText(primaryError) : undefined,
          timestamp: new Date(nowFn()).toISOString(),
        };
        recordLastDispatch(okRes, request.category);
        return okRes;
      } catch (smtpErr: any) {
        const classified = classifyProviderError(smtpErr);
        const combinedError = primaryError
          ? `Resend (${primaryErrorCode || "ERROR"}): ${primaryError} | Fallback SMTP (${classified.errorCode}): ${classified.sanitizedMessage}`
          : classified.sanitizedMessage;
        const errRes: TransactionalEmailResult = {
          sent: false,
          status: "ERROR",
          provider: "SMTP",
          messageId: null,
          errorCode: classified.errorCode,
          error: sanitizeEmailSensitiveText(combinedError),
          fallbackUsed: Boolean(shouldAttemptResend),
          fallbackReason: primaryError ? sanitizeEmailSensitiveText(primaryError) : undefined,
          timestamp: new Date(nowFn()).toISOString(),
        };
        recordLastDispatch(errRes, request.category);
        return errRes;
      }
    }

    // --- Neither Resend nor SMTP configured ---
    const pendingRes: TransactionalEmailResult = {
      sent: false,
      status: "PENDING",
      provider: "NONE",
      messageId: null,
      errorCode: "MISSING_CONFIG",
      error:
        "Nenhum provedor de e-mail configurado no servidor (configure RESEND_API_KEY e RESEND_FROM_EMAIL, ou SMTP_* como fallback).",
      fallbackUsed: false,
      timestamp: new Date(nowFn()).toISOString(),
    };
    recordLastDispatch(pendingRes, request.category);
    return pendingRes;
  };

  if (!dedupeKey) {
    return executeSend();
  }

  const flightPromise = executeSend()
    .then((result) => {
      if (result.sent) {
        const ttl =
          typeof request.dedupeTtlMs === "number" && request.dedupeTtlMs > 0
            ? request.dedupeTtlMs
            : DEFAULT_DEDUPE_TTL_MS;
        recentSentCache.set(dedupeKey, {
          expiresAt: nowFn() + ttl,
          result,
        });
      }
      return result;
    })
    .finally(() => {
      if (inFlightDispatches.get(dedupeKey) === flightPromise) {
        inFlightDispatches.delete(dedupeKey);
      }
    });

  inFlightDispatches.set(dedupeKey, flightPromise);
  return flightPromise;
}

export function normalizeNotificationStatusForAudit(
  rawStatus?: string | null
): StandardizedEmailStatus {
  const upper = String(rawStatus || "").trim().toUpperCase();
  if (upper === "SENT" || upper === "LOGGED") return "SENT";
  if (
    upper === "PENDING" ||
    upper === "PENDING_SMTP_CONFIG" ||
    upper === "SMTP_NOT_CONFIGURED" ||
    upper === "QUEUED_OR_RECORDED"
  ) {
    return "PENDING";
  }
  return "ERROR";
}

export async function getEmailServiceDiagnostics(
  adminDb?: any,
  env: NodeJS.ProcessEnv = process.env
): Promise<{
  config: EmailProviderConfigStatus;
  lastDispatch: LastEmailDispatchSnapshot | null;
}> {
  const config = getEmailProviderConfig(env);
  let lastDispatch = getLastEmailDispatchSnapshot();

  if (adminDb && typeof adminDb.collection === "function") {
    try {
      const col = adminDb.collection("email_notifications");
      if (typeof col.orderBy === "function") {
        const snap = await col.orderBy("createdAt", "desc").limit(1).get();
        if (snap && !snap.empty && snap.docs?.[0]) {
          const docData = snap.docs[0].data() || {};
          const docTs = String(docData.createdAt || docData.sentAt || docData.timestamp || "");
          if (!lastDispatch || (docTs && docTs >= lastDispatch.timestamp)) {
            const rawProvider = String(docData.provider || docData.deliveryMethod || "")
              .trim()
              .toUpperCase();
            const provider: EmailProviderName =
              rawProvider === "RESEND" || rawProvider === "SMTP" ? rawProvider : "NONE";
            lastDispatch = {
              status: normalizeNotificationStatusForAudit(
                docData.normalizedStatus || docData.status
              ),
              provider,
              messageId: docData.messageId ? String(docData.messageId) : null,
              category: docData.type ? String(docData.type) : null,
              errorCode: docData.errorCode ? (String(docData.errorCode) as EmailErrorCode) : null,
              error: docData.error ? sanitizeEmailSensitiveText(docData.error) : null,
              fallbackUsed: Boolean(docData.fallbackUsed),
              timestamp: docTs || new Date().toISOString(),
            };
          }
        }
      }
    } catch {
      // Fall back cleanly to in-memory snapshot without leaking errors
    }
  }

  return {
    config,
    lastDispatch,
  };
}
