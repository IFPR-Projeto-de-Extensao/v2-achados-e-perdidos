import type { IncomingMessage, ServerResponse } from "http";

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
  if (!webhookUrl) {
    console.info(
      "[Discord Feedback Notice] DISCORD_FEEDBACK_WEBHOOK_URL não configurada nas variáveis de ambiente. O feedback foi registrado normalmente."
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

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(discordPayload),
    });

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
    const destinationEmail = "localizamais6@gmail.com";

    const discordSent = await sendFeedbackToDiscord({
      protocol: ticketProtocol,
      name: trimmedName.substring(0, 100),
      email: trimmedEmail.substring(0, 120),
      category: String(category || "FEEDBACK"),
      subject: trimmedSubject.substring(0, 150),
      message: trimmedMessage.substring(0, 4000),
      priority: String(priority || "MEDIA"),
      timestamp,
      clientDiagnostics,
    });

    return res.status(200).json({
      success: true,
      protocol: ticketProtocol,
      message: "Seu relato/feedback foi registrado e encaminhado diretamente para a equipe de suporte do Campus Ivaiporã.",
      timestamp,
      destinationEmail,
      emailSubject: `[${ticketProtocol}] ${trimmedSubject}`,
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
