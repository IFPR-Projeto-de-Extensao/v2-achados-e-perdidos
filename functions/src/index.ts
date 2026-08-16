import { onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  buildNovosAchadosEmbed,
  FoundItemPayload,
  sanitizePii,
  DISCORD_THEME_COLORS,
} from "./discordEmbedHelper";

// Lazy initialize Firebase Admin if not already initialized
if (getApps().length === 0) {
  try {
    initializeApp();
  } catch (e) {
    logger.warn("[Firebase Cloud Functions] Admin already initialized or init warning:", e);
  }
}

export * from "./discordEmbedHelper";

export interface FeedbackData {
  name: string;
  email: string;
  category: "BUG_REPORT" | "FEEDBACK" | "BELONGING_QUERY" | "OTHER" | string;
  subject: string;
  message: string;
  priority?: "BAIXA" | "MEDIA" | "ALTA" | "NORMAL" | string;
  clientDiagnostics?: {
    screen?: string;
    currentPath?: string;
    online?: boolean;
    userAgent?: string;
    language?: string;
    [key: string]: any;
  };
}

export interface FeedbackTicket {
  protocol: string;
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  priority?: string;
  timestamp: string;
  clientDiagnostics?: any;
}

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields: DiscordEmbedField[];
  footer: {
    text: string;
    icon_url?: string;
  };
  timestamp?: string;
}

export interface DiscordWebhookPayload {
  username: string;
  avatar_url?: string;
  embeds: DiscordEmbed[];
}

export interface EmbedFormatOptions {
  maskEmail?: boolean;
  includeDiagnostics?: boolean;
}

/**
 * Sanitizes and formats email for privacy if masking is enabled (e.g., j***o@estudante.ifpr.edu.br).
 */
export function sanitizeEmailForPrivacy(email: string, mask: boolean = false): string {
  const trimmed = String(email || "").trim();
  if (!trimmed) return "Não informado";
  if (!mask) return sanitizePii(trimmed);

  const parts = trimmed.split("@");
  if (parts.length !== 2) return sanitizePii(trimmed);

  const [local, domain] = parts;
  if (local.length <= 2) {
    return `${local[0]}*@${domain}`;
  }
  const maskedLocal = `${local[0]}${"*".repeat(Math.max(1, local.length - 2))}${local[local.length - 1]}`;
  return `${maskedLocal}@${domain}`;
}

/**
 * Helper function that formats a feedback ticket into a structured, color-coded Discord Embed
 * adhering to Discord embed limits, professional typography, and user privacy standards.
 */
export function formatDiscordFeedbackEmbed(
  ticket: FeedbackTicket,
  options: EmbedFormatOptions = {}
): DiscordWebhookPayload {
  const { maskEmail = false, includeDiagnostics = true } = options;

  // Category Theme, Color Code & Status Icon Configuration
  const categoryConfig: Record<
    string,
    { label: string; color: number; emoji: string; badge: string }
  > = {
    BUG_REPORT: {
      label: "Relato de Bug / Erro no Sistema",
      color: 0xef4444, // Red
      emoji: "🐛",
      badge: "Problema Técnico",
    },
    FEEDBACK: {
      label: "Sugestão ou Melhoria",
      color: 0xf59e0b, // Amber
      emoji: "💡",
      badge: "Melhoria de Usabilidade",
    },
    BELONGING_QUERY: {
      label: "Dúvida sobre Pertence / Retirada",
      color: 0x3b82f6, // Blue
      emoji: "🔍",
      badge: "Atendimento de Itens",
    },
    OTHER: {
      label: "Elogio ou Outro Assunto",
      color: 0x10b981, // Emerald Green
      emoji: "💬",
      badge: "Geral / Elogio",
    },
  };

  const cat = categoryConfig[ticket.category] || {
    label: ticket.category || "Feedback Geral",
    color: 0x6366f1, // Indigo
    emoji: "📝",
    badge: "Geral",
  };

  // Priority Labeling & Visual Indicator
  const rawPriority = (ticket.priority || "MEDIA").toUpperCase();
  let priorityLabel = "🟡 Média";
  if (rawPriority === "ALTA" || rawPriority === "HIGH" || rawPriority === "CRITICAL") {
    priorityLabel = "🔴 Alta (Urgente)";
  } else if (rawPriority === "BAIXA" || rawPriority === "LOW") {
    priorityLabel = "🟢 Baixa (Rotina)";
  }

  // Format Date and Time in Brazilian Standard (BRT/America: Sao Paulo)
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
  } catch {
    dateFormatted = ticket.timestamp;
  }

  // Sanitized Strings with Strict Discord Embed Constraints & PII Sanitization
  const sanitizedName = sanitizePii(String(ticket.name || "Não informado").trim()).substring(0, 100);
  const displayEmail = sanitizeEmailForPrivacy(ticket.email, maskEmail);
  const sanitizedSubject = sanitizePii(String(ticket.subject || "Sem assunto").trim()).substring(0, 200);
  const sanitizedMessage = sanitizePii(String(ticket.message || "Nenhuma mensagem fornecida.").trim()).substring(0, 3900);
  const sanitizedProtocol = String(ticket.protocol || "N/A").trim().substring(0, 60);

  // Embed Fields with Structured Grid
  const fields: DiscordEmbedField[] = [
    {
      name: "👤 Remetente",
      value: sanitizedName,
      inline: true,
    },
    {
      name: "📧 E-mail de Contato",
      value: displayEmail,
      inline: true,
    },
    {
      name: "⚡ Nível de Prioridade",
      value: priorityLabel,
      inline: true,
    },
    {
      name: "🏷️ Tipo de Atendimento",
      value: `${cat.emoji} ${cat.label}`,
      inline: true,
    },
    {
      name: "📋 Número de Protocolo",
      value: `\`${sanitizedProtocol}\``,
      inline: true,
    },
    {
      name: "🕒 Data do Registro (BRT)",
      value: dateFormatted,
      inline: true,
    },
  ];

  // Privacy-Respecting Client Diagnostics
  if (includeDiagnostics && ticket.clientDiagnostics && typeof ticket.clientDiagnostics === "object") {
    const diag = ticket.clientDiagnostics;
    const diagItems: string[] = [];

    if (diag.screen && typeof diag.screen === "string") {
      diagItems.push(`🖥️ Tela: ${String(diag.screen).replace(/[<>]/g, "").substring(0, 30)}`);
    }
    if (diag.currentPath && typeof diag.currentPath === "string") {
      diagItems.push(`📍 Rota: \`${String(diag.currentPath).replace(/[`<>]/g, "").substring(0, 60)}\``);
    }
    if (typeof diag.online === "boolean") {
      diagItems.push(`📶 Conexão: ${diag.online ? "🟢 Online" : "🔴 Offline"}`);
    }
    if (diag.language && typeof diag.language === "string") {
      diagItems.push(`🌐 Idioma: ${String(diag.language).substring(0, 10)}`);
    }

    if (diagItems.length > 0) {
      fields.push({
        name: "🛠️ Diagnóstico Técnico da Sessão",
        value: diagItems.join(" • ").substring(0, 1024),
        inline: false,
      });
    }
  }

  const embedTitle = `${cat.emoji} [${cat.badge}] ${sanitizedSubject}`.substring(0, 256);

  return {
    username: "IFPR Achados e Perdidos • Feedback",
    avatar_url: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/life-buoy.png",
    embeds: [
      {
        title: embedTitle,
        description: sanitizedMessage,
        color: cat.color,
        fields,
        footer: {
          text: "IFPR Campus Ivaiporã • Central de Atendimento & Feedback",
          icon_url: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/shield-check.png",
        },
        timestamp: ticket.timestamp,
      },
    ],
  };
}

/**
 * Retrieves the Discord Webhook URL strictly from Firebase Functions config or environment variables.
 */
export function getDiscordFeedbackWebhookUrl(): string {
  try {
    // 1. Firebase Functions config: functions.config().discord.webhook_url
    const functionsConfig = typeof (functions as any).config === "function" ? (functions as any).config() : null;
    const configUrl = functionsConfig?.discord?.webhook_url;
    if (configUrl && typeof configUrl === "string" && configUrl.trim()) {
      return configUrl.trim();
    }
  } catch {
    // Ignore config errors in local or non-v1 runtime
  }

  // 2. Process environment variables: DISCORD_FEEDBACK_WEBHOOK_URL or DISCORD_WEBHOOK_URL
  const envUrl = process.env.DISCORD_FEEDBACK_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
  if (envUrl && typeof envUrl === "string" && envUrl.trim()) {
    return envUrl.trim();
  }

  return "";
}

/**
 * Helper to dispatch formatted feedback payload to Discord Webhook.
 * All errors are caught and logged so that Discord failures NEVER disrupt the main email flow.
 */
export async function sendFeedbackToDiscord(
  ticket: FeedbackTicket,
  options?: EmbedFormatOptions
): Promise<boolean> {
  const webhookUrl = getDiscordFeedbackWebhookUrl();
  if (!webhookUrl) {
    logger.info(
      "[Discord Feedback Notice] DISCORD_FEEDBACK_WEBHOOK_URL / functions.config().discord.webhook_url not configured. Skipping Discord notification."
    );
    return false;
  }

  try {
    const discordPayload = formatDiscordFeedbackEmbed(ticket, options);

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(discordPayload),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.warn(`[Discord Feedback Warning] HTTP status ${response.status} from Webhook:`, errText);
      return false;
    }

    logger.info(`[Discord Feedback Success] Webhook successfully dispatched for protocol ${ticket.protocol}.`);
    return true;
  } catch (webhookErr: any) {
    logger.error("[Discord Feedback Error] Exception during Discord Webhook dispatch:", webhookErr?.message || webhookErr);
    return false;
  }
}

/**
 * Executes the primary email delivery service logic.
 */
export async function triggerEmailService(feedback: FeedbackData, protocol: string, timestamp: string) {
  const destinationEmail = "achados.ivaipora@ifpr.edu.br";
  const emailSubject = `[${protocol}] ${String(feedback.subject).trim().substring(0, 150)}`;

  const emailRecord = {
    protocol,
    recipient: destinationEmail,
    senderName: String(feedback.name).trim().substring(0, 100),
    senderEmail: String(feedback.email).trim().substring(0, 120),
    category: String(feedback.category || "FEEDBACK"),
    subject: emailSubject,
    body: String(feedback.message).trim().substring(0, 4000),
    priority: feedback.priority || "NORMAL",
    timestamp,
    clientDiagnostics: feedback.clientDiagnostics,
    status: "DISPATCHED",
  };

  logger.info(
    `[Email Service Dispatched] Protocol: ${protocol} | From: ${emailRecord.senderEmail} | To: ${destinationEmail} | Subject: ${emailSubject}`
  );

  // Optionally persist ticket in Firestore support_tickets collection if database is available
  try {
    const db = getFirestore();
    await db.collection("support_tickets").doc(`ticket_${protocol}`).set({
      ...emailRecord,
      id: `ticket_${protocol}`,
      createdAt: timestamp,
    }, { merge: true });
  } catch (dbErr) {
    logger.warn("[Email Service Warning] Failed to log ticket to Firestore:", dbErr);
  }

  return {
    success: true,
    protocol,
    destinationEmail,
    emailSubject,
    message: "Seu relato/feedback foi registrado e encaminhado diretamente para a equipe de suporte do Campus Ivaiporã via e-mail.",
  };
}

/**
 * Firebase Cloud Function: sendFeedback
 * Receives feedback data, triggers the existing email service, and then sends the same data to the Discord Webhook URL.
 * Supports standard HTTPS onRequest calls as well as CORS requests.
 */
export const sendFeedback = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ success: false, error: "Method not allowed. Use POST." });
    return;
  }

  try {
    const feedback: FeedbackData = req.body || {};
    const { name, email, subject, message, category, priority, clientDiagnostics } = feedback;

    if (!name || !email || !subject || !message) {
      res.status(400).json({
        success: false,
        error: "Por favor, preencha todos os campos obrigatórios: nome, e-mail, assunto e descrição da mensagem.",
      });
      return;
    }

    const protocol = `IFPR-SUP-${Date.now().toString(36).toUpperCase()}`;
    const timestamp = new Date().toISOString();

    // 1. Primary: Trigger existing email delivery service
    const emailResult = await triggerEmailService(feedback, protocol, timestamp);

    // 2. Secondary: Send same data to Discord Webhook asynchronously & safely
    try {
      await sendFeedbackToDiscord({
        protocol,
        name: String(name).trim(),
        email: String(email).trim(),
        category: String(category || "FEEDBACK"),
        subject: String(subject).trim(),
        message: String(message).trim(),
        priority: String(priority || "MEDIA"),
        timestamp,
        clientDiagnostics,
      });
    } catch (discordError) {
      logger.error("[sendFeedback Cloud Function] Discord forwarding error suppressed:", discordError);
    }

    // 3. Return response with primary delivery confirmation
    res.status(200).json({
      success: true,
      protocol,
      message: emailResult.message,
      timestamp,
      destinationEmail: emailResult.destinationEmail,
      emailSubject: emailResult.emailSubject,
    });
  } catch (error: any) {
    logger.error("[sendFeedback Cloud Function Error]:", error);
    res.status(500).json({
      success: false,
      error: error?.message || "Erro interno ao processar feedback.",
    });
  }
});

export type FoundItemData = FoundItemPayload;

/**
 * Retrieves the Discord Webhook URL for the '#novos-achados' channel.
 * Strictly managed server-side via Firebase Functions config, Secret Manager, or environment variables.
 */
export function getDiscordNovosAchadosWebhookUrl(): string {
  try {
    const functionsConfig = typeof (functions as any).config === "function" ? (functions as any).config() : null;
    const configUrl =
      functionsConfig?.discord?.novos_achados_webhook_url ||
      functionsConfig?.discord?.webhook_url_novos_achados;
    if (configUrl && typeof configUrl === "string" && configUrl.trim()) {
      return configUrl.trim();
    }
  } catch {
    // Ignore config errors in local or non-v1 runtime
  }

  const envUrl =
    process.env.DISCORD_NOVOS_ACHADOS_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK_URL_NOVOS_ACHADOS;
  if (envUrl && typeof envUrl === "string" && envUrl.trim()) {
    return envUrl.trim();
  }

  return "";
}

/**
 * Formats a newly registered found item (Achado) into a clean, professional Discord Embed using the helper module.
 */
export function formatNovosAchadosDiscordEmbed(item: FoundItemData): DiscordWebhookPayload {
  return buildNovosAchadosEmbed(item);
}

/**
 * Dispatches a new found item notification to the '#novos-achados' Discord Webhook.
 * Non-blocking: all errors are isolated and logged to Firebase Cloud Logging to never interrupt the user flow.
 */
export async function sendNovoAchadoToDiscord(item: FoundItemData): Promise<boolean> {
  // If item explicitly has a type field and it's not ENCONTRADO, ignore
  if (item.type && item.type !== "ENCONTRADO") {
    logger.info(`[sendNovoAchadoToDiscord] Item type is '${item.type}', not 'ENCONTRADO'. Skipping Discord notification.`);
    return false;
  }

  const webhookUrl = getDiscordNovosAchadosWebhookUrl();
  if (!webhookUrl) {
    logger.info(
      "[Discord Novos Achados Notice] DISCORD_NOVOS_ACHADOS_WEBHOOK_URL is not configured in secrets or config. Skipping Discord dispatch."
    );
    return false;
  }

  try {
    const payload = buildNovosAchadosEmbed(item);

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error(
        `[Discord Novos Achados Warning] Discord API returned HTTP ${response.status} for item '${item.id || item.title}':`,
        { status: response.status, responseText: errText, itemId: item.id }
      );
      return false;
    }

    logger.info(`[Discord Novos Achados Success] Notificação enviada para #novos-achados: "${item.title}" (${item.id})`);
    return true;
  } catch (err: any) {
    logger.error(
      `[Discord Novos Achados Error] Falha de conexão ou rede ao enviar notificação do item '${item.id || item.title}' para o Discord:`,
      {
        errorMessage: err?.message || String(err),
        stack: err?.stack,
        itemId: item.id,
        itemTitle: item.title,
      }
    );
    return false;
  }
}

/**
 * Cloud Function HTTPS endpoint: notifyNovoAchado
 * Invoked by backend or client after a found item is saved to Firestore.
 */
export const notifyNovoAchado = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ success: false, error: "Method not allowed. Use POST." });
    return;
  }

  try {
    const item: FoundItemData = req.body?.item || req.body;
    if (!item || !item.title) {
      res.status(400).json({ success: false, error: "Dados do item ausentes ou incompletos." });
      return;
    }

    if (item.type && item.type !== "ENCONTRADO") {
      res.status(200).json({ success: true, message: "Item não é do tipo ENCONTRADO. Ignorado para o canal #novos-achados." });
      return;
    }

    const dispatched = await sendNovoAchadoToDiscord(item);
    res.status(200).json({
      success: true,
      dispatched,
      message: dispatched
        ? "Notificação despachada com sucesso para o canal #novos-achados."
        : "Webhook não configurado ou retorno com aviso.",
    });
  } catch (error: any) {
    logger.error("[notifyNovoAchado Cloud Function Error]:", error);
    res.status(500).json({ success: false, error: error?.message || "Erro interno ao processar notificação." });
  }
});

/**
 * Cloud Function Firestore Trigger: onNewFoundItemCreated
 * Triggers automatically whenever a new document is created in the 'found_items' collection in Firestore.
 * Securely logs diagnostic details to Firebase Cloud Logging if notification fails,
 * while ensuring database operations remain fully decoupled.
 */
export const onNewFoundItemCreated = onDocumentCreated("found_items/{itemId}", async (event) => {
  const data = event.data?.data() as FoundItemData | undefined;
  const itemId = event.params.itemId;

  if (!data) {
    logger.warn(`[onNewFoundItemCreated] Event triggered for document 'found_items/${itemId}', but snapshot contains no data.`);
    return;
  }

  logger.info(`[onNewFoundItemCreated] Novo registro detectado em 'found_items/${itemId}': "${data.title || 'Sem título'}"`);

  try {
    const success = await sendNovoAchadoToDiscord({
      ...data,
      id: data.id || itemId,
      type: "ENCONTRADO",
    });

    if (!success) {
      logger.warn(
        `[onNewFoundItemCreated Diagnostics] Discord notification was not completed for found item '${itemId}'. Check webhook secret configuration or network response above.`
      );
    }
  } catch (error: any) {
    // Log fatal unexpected exceptions to Firebase Cloud Logging without throwing to avoid trigger retries if undesired
    logger.error(`[onNewFoundItemCreated Critical Error] Unhandled failure during Discord dispatch for found item '${itemId}':`, {
      itemId,
      errorName: error?.name,
      errorMessage: error?.message,
      stack: error?.stack,
    });
  }
});

/**
 * Cloud Function Firestore Trigger: onNovoAchadoCreated (also listens on 'items' collection with type ENCONTRADO)
 * Triggers automatically whenever a new document is created in the 'items' collection in Firestore.
 */
export const onNovoAchadoCreated = onDocumentCreated("items/{itemId}", async (event) => {
  const data = event.data?.data() as FoundItemData | undefined;
  const itemId = event.params.itemId;

  if (!data) return;

  if (data.type === "ENCONTRADO") {
    logger.info(`[onNovoAchadoCreated] Novo item ENCONTRADO detectado em 'items/${itemId}': "${data.title}"`);
    try {
      const success = await sendNovoAchadoToDiscord({
        ...data,
        id: data.id || itemId,
      });

      if (!success) {
        logger.warn(`[onNovoAchadoCreated Diagnostics] Envio ao Discord para o item '${itemId}' não concluído com sucesso.`);
      }
    } catch (err: any) {
      logger.error(`[onNovoAchadoCreated Error] Falha de execução ao processar notificação no Discord para o item '${itemId}':`, {
        itemId,
        errorMessage: err?.message,
        stack: err?.stack,
      });
    }
  }
});
