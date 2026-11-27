import type { IncomingMessage, ServerResponse } from "http";
import { applySecurityHeaders } from "../_lib/securityHeaders.js";
import {
  sendTransactionalEmail,
  sanitizeEmailSensitiveText,
  type EmailProviderName,
  type StandardizedEmailStatus,
} from "../_lib/emailService.js";

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

interface FeedbackRequestBody {
  name?: string;
  email?: string;
  category?: string;
  subject?: string;
  message?: string;
  priority?: string;
  clientDiagnostics?: {
    screen?: string;
    currentPath?: string;
    online?: boolean;
    userAgent?: string;
    language?: string;
    [key: string]: any;
  };
}

// Centralized email dispatch (Resend priority with temporary SMTP fallback) is provided by ../_lib/emailService.js

export function buildSupportEmailHtml(ticket: {
  protocol: string;
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  priority?: string;
  timestamp: string;
  clientDiagnostics?: any;
}, destinationEmail: string = "localizamais0@gmail.com"): string {
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

async function sendFeedbackEmail(ticket: {
  protocol: string;
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  priority?: string;
  timestamp: string;
  clientDiagnostics?: any;
}): Promise<{
  sent: boolean;
  messageId?: string;
  provider: EmailProviderName;
  normalizedStatus: StandardizedEmailStatus;
  error?: string;
  status: "SENT" | "PENDING" | "PENDING_SMTP_CONFIG" | "AUTH_FAILED" | "NETWORK_ERROR" | "ERROR";
}> {
  const destinationEmail = "localizamais0@gmail.com";

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

  const result = await sendTransactionalEmail({
    to: destinationEmail,
    fromName: "Localiza+ Suporte IFPR",
    replyTo: SIMPLE_EMAIL_REGEX.test(safeReplyEmail)
      ? `${safeReplyName} <${safeReplyEmail}>`
      : undefined,
    subject: `[${stripHeaderControls(ticket.protocol, 40)}] ${safeSubject}`,
    text: textBody,
    html: htmlBody,
    category: "SUPPORT_FEEDBACK",
    dedupeKey: `support:${ticket.protocol}`,
  });

  if (result.sent) {
    console.log(
      `[Support Email Success] E-mail despachado via ${result.provider}. MessageID: ${result.messageId || "N/A"}`
    );
    return {
      sent: true,
      messageId: result.messageId || undefined,
      provider: result.provider,
      normalizedStatus: "SENT",
      status: "SENT",
    };
  }

  const sanitizedError = sanitizeEmailSensitiveText(result.error || "");
  if (result.status === "PENDING") {
    console.info(`[Support Email Notice] Nenhum provedor configurado (Resend/SMTP). Protocolo ${ticket.protocol} registrado.`);
    return {
      sent: false,
      provider: result.provider,
      normalizedStatus: "PENDING",
      status: "PENDING_SMTP_CONFIG",
      error: sanitizedError,
    };
  }

  let legacyStatus: "AUTH_FAILED" | "NETWORK_ERROR" | "ERROR" = "ERROR";
  if (result.errorCode === "AUTH_ERROR") {
    legacyStatus = "AUTH_FAILED";
  } else if (result.errorCode === "SERVICE_UNAVAILABLE" || result.errorCode === "TIMEOUT") {
    legacyStatus = "NETWORK_ERROR";
  }

  console.error(`[Support Email Error: ${legacyStatus}] Falha ao enviar via ${result.provider}:`, sanitizedError);
  return {
    sent: false,
    provider: result.provider,
    normalizedStatus: "ERROR",
    status: legacyStatus,
    error: sanitizedError,
  };
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

async function sendFeedbackToDiscord(ticket: {
  protocol: string;
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  priority?: string;
  timestamp: string;
  clientDiagnostics?: any;
}): Promise<boolean> {
  const webhookUrl = getDiscordFeedbackWebhookUrl();
  const isConfigured = Boolean(webhookUrl && webhookUrl.length > 10);
  console.log(`[Feedback API Diagnostics] DISCORD_FEEDBACK_WEBHOOK_URL configured: ${isConfigured}`);

  if (!isConfigured) {
    console.info(
      `[Discord Feedback Notice] DISCORD_FEEDBACK_WEBHOOK_URL não configurada nas variáveis de ambiente. Protocolo ${ticket.protocol} registrado sem envio ao Discord.`
    );
    return false;
  }

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
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(discordPayload),
    });

    console.log(`[Feedback API Diagnostics] Discord fetch response status: ${response.status} (${response.statusText || 'OK'})`);

    if (!response.ok) {
      const errText = await response.text().catch(() => "N/A");
      console.warn(`[Discord Feedback Warning] Resposta HTTP ${response.status} do Webhook:`, errText);
      return false;
    }

    console.log(`[Discord Feedback Success] Webhook despachado com sucesso para o protocolo ${ticket.protocol}.`);
    return true;
  } catch (webhookErr: any) {
    console.error("[Discord Feedback Error] Falha de conexão ao enviar para o Discord:", webhookErr?.message || webhookErr);
    return false;
  }
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
      error: "Método não permitido. Utilize POST para envio de feedback.",
    });
  }

  try {
    const body = await parseBody(req);
    const { name, email, category, subject, message, priority, clientDiagnostics } = body;

    const trimmedName = stripHeaderControls(name, 100);
    const trimmedEmail = stripHeaderControls(email, 120);
    const trimmedSubject = stripHeaderControls(subject, 150);
    const trimmedMessage = String(message || "").trim();

    if (!trimmedName || !trimmedEmail || !trimmedSubject || !trimmedMessage) {
      return res.status(400).json({
        success: false,
        error: "Por favor, preencha todos os campos obrigatórios: nome, e-mail, assunto e descrição da mensagem.",
      });
    }

    if (!SIMPLE_EMAIL_REGEX.test(trimmedEmail)) {
      return res.status(400).json({
        success: false,
        error: "Informe um endereço de e-mail válido.",
      });
    }

    const ticketProtocol = `IFPR-SUP-${Date.now().toString(36).toUpperCase()}`;
    const timestamp = new Date().toISOString();
    const destinationEmail = "localizamais0@gmail.com";

    console.log(`[Feedback API Diagnostics] Request received (${req.method}) - Protocol: ${ticketProtocol}, Category: ${category || 'FEEDBACK'}, Subject: ${trimmedSubject.substring(0, 40)}...`);

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

    // 1. Dispatch real email via centralized email service (Resend priority, SMTP fallback)
    const emailResult = await sendFeedbackEmail(ticketPayload);

    // 2. Dispatch to Discord Webhook with error resilience
    const discordSent = await sendFeedbackToDiscord(ticketPayload);

    return res.status(200).json({
      success: true,
      protocol: ticketProtocol,
      message: "Seu relato/feedback foi registrado e encaminhado diretamente para a equipe de suporte do Campus Ivaiporã.",
      timestamp,
      destinationEmail,
      emailSubject: `[${ticketProtocol}] ${trimmedSubject}`,
      emailDispatched: emailResult.sent,
      emailProvider: emailResult.provider,
      emailStatus: emailResult.normalizedStatus,
      messageId: emailResult.messageId || null,
      smtpDispatched: emailResult.sent,
      smtpStatus: emailResult.status,
      smtpMessageId: emailResult.messageId || null,
      discordDispatched: discordSent,
    });
  } catch (error: any) {
    console.error("[send-feedback API Error]:", error?.message || error);
    return res.status(500).json({
      success: false,
      error: "Erro interno no servidor ao processar envio do formulário de contato.",
    });
  }
}
