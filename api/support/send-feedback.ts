import type { IncomingMessage, ServerResponse } from "http";
import nodemailer, { type Transporter } from "nodemailer";

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

function getEmailTransporter(): { transporter: Transporter | null; diagnostics: { configured: boolean; reason?: string } } {
  const host = (process.env.SMTP_HOST || "").trim();
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").trim().replace(/\s+/g, "");
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  if (!host || !user || !pass) {
    const missing: string[] = [];
    if (!host) missing.push("SMTP_HOST");
    if (!user) missing.push("SMTP_USER");
    if (!pass) missing.push("SMTP_PASS");
    return {
      transporter: null,
      diagnostics: { configured: false, reason: `Variáveis SMTP ausentes: ${missing.join(", ")}` },
    };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: {
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
    },
  });

  return { transporter, diagnostics: { configured: true } };
}

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
      <p>Protocolo: ${ticket.protocol}</p>
    </div>
    <div class="content">
      <div class="field">
        <div class="label">Remetente:</div>
        <div class="value"><strong>${ticket.name}</strong> (${ticket.email})</div>
      </div>
      <div class="field">
        <div class="label">Categoria:</div>
        <div class="value">${categoryLabel}</div>
      </div>
      <div class="field">
        <div class="label">Prioridade:</div>
        <div class="value">${priorityLabel}</div>
      </div>
      <div class="field">
        <div class="label">Assunto:</div>
        <div class="value">${ticket.subject}</div>
      </div>
      <div class="field">
        <div class="label">Mensagem do Usuário:</div>
        <div class="message-box">${ticket.message}</div>
      </div>
    </div>
    <div class="footer">
      Central de Atendimento • IFPR Campus Ivaiporã • <a href="mailto:${destinationEmail}" style="color: ${accentColor}; text-decoration: none;">${destinationEmail}</a>
    </div>
  </div>
</body>
</html>
`;
}

async function sendFeedbackViaSmtp(ticket: {
  protocol: string;
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  priority?: string;
  timestamp: string;
  clientDiagnostics?: any;
}): Promise<{ sent: boolean; messageId?: string; error?: string; status: "SENT" | "PENDING_SMTP_CONFIG" | "AUTH_FAILED" | "NETWORK_ERROR" | "ERROR" }> {
  const { transporter, diagnostics } = getEmailTransporter();
  const destinationEmail = "localizamais0@gmail.com";

  if (!transporter) {
    console.info(`[SMTP Feedback Notice] ${diagnostics.reason}. Mensagem registrada sem despacho SMTP.`);
    return { sent: false, status: "PENDING_SMTP_CONFIG", error: diagnostics.reason };
  }

  try {
    const fromAddress = process.env.SMTP_FROM || `"Localiza+ Suporte IFPR" <${process.env.SMTP_USER || destinationEmail}>`;
    
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

    console.log(`[SMTP Feedback Diagnostics] Enviando mensagem via SMTP para ${destinationEmail} (Protocolo: ${ticket.protocol})...`);
    const info = await transporter.sendMail({
      from: fromAddress,
      to: destinationEmail,
      replyTo: ticket.email ? `"${ticket.name}" <${ticket.email}>` : undefined,
      subject: `[${ticket.protocol}] ${ticket.subject}`,
      text: textBody,
      html: htmlBody,
    });

    console.log(`[SMTP Feedback Success] E-mail despachado com sucesso. MessageID: ${info.messageId}, Resposta: ${info.response}`);
    return { sent: true, messageId: info.messageId, status: "SENT" };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    let status: "AUTH_FAILED" | "NETWORK_ERROR" | "ERROR" = "ERROR";

    if (errMsg.includes("535") || errMsg.toLowerCase().includes("badcredentials") || errMsg.toLowerCase().includes("invalid login")) {
      status = "AUTH_FAILED";
      console.error("[SMTP Error: AUTH_FAILED] Credenciais SMTP recusadas pelo servidor (Verifique se é uma Senha de Aplicativo de 16 dígitos válida do Google):", errMsg);
    } else if (errMsg.includes("ETIMEDOUT") || errMsg.includes("ECONNREFUSED") || errMsg.includes("ENOTFOUND")) {
      status = "NETWORK_ERROR";
      console.error("[SMTP Error: NETWORK_CONNECTION] Falha de rede/DNS na conexão SMTP:", errMsg);
    } else {
      console.error("[SMTP Error: GENERAL] Falha ao enviar e-mail via SMTP:", errMsg);
    }

    return { sent: false, status, error: errMsg };
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

    const trimmedName = String(name || "").trim();
    const trimmedEmail = String(email || "").trim();
    const trimmedSubject = String(subject || "").trim();
    const trimmedMessage = String(message || "").trim();

    if (!trimmedName || !trimmedEmail || !trimmedSubject || !trimmedMessage) {
      return res.status(400).json({
        success: false,
        error: "Por favor, preencha todos os campos obrigatórios: nome, e-mail, assunto e descrição da mensagem.",
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

    // 1. Dispatch real email via SMTP Transporter if configured
    const smtpResult = await sendFeedbackViaSmtp(ticketPayload);

    // 2. Dispatch to Discord Webhook with error resilience
    const discordSent = await sendFeedbackToDiscord(ticketPayload);

    return res.status(200).json({
      success: true,
      protocol: ticketProtocol,
      message: "Seu relato/feedback foi registrado e encaminhado diretamente para a equipe de suporte do Campus Ivaiporã.",
      timestamp,
      destinationEmail,
      emailSubject: `[${ticketProtocol}] ${trimmedSubject}`,
      smtpDispatched: smtpResult.sent,
      smtpStatus: smtpResult.status,
      smtpMessageId: smtpResult.messageId || null,
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
