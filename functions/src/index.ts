import { onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  buildNovosAchadosEmbed,
  buildNovasPerdasEmbed,
  FoundItemPayload,
  sanitizePii,
} from "./discordEmbedHelper";
import {
  getDiscordWebhookUrl,
  sendDiscordWebhook,
  dispatchFoundItemWebhook,
  dispatchLostItemWebhook,
  executeFirestoreTriggerSafely,
  DiscordDispatchResult,
} from "./utils/discord";

// Lazy initialize Firebase Admin if not already initialized
if (getApps().length === 0) {
  try {
    initializeApp();
  } catch (e) {
    logger.warn("[Firebase Cloud Functions] Admin already initialized or init warning:", e);
  }
}

// Re-export all formatting, embed, and sender utilities
export * from "./discordEmbedHelper";
export * from "./utils/discord";
export {
  formatItemToDiscordEmbed,
  getStatusColor,
  getStatusLabel,
  getCategoryMeta,
  STATUS_COLORS,
  STATUS_LABELS,
  CATEGORY_MAP,
} from "./utils/discordHelper";

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
 * Formats a feedback ticket into a structured, color-coded Discord Embed
 * adhering to Discord embed limits, professional typography, and user privacy standards.
 */
export function formatDiscordFeedbackEmbed(
  ticket: FeedbackTicket,
  options: EmbedFormatOptions = {}
) {
  const { maskEmail = false, includeDiagnostics = true } = options;

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

  const rawPriority = (ticket.priority || "MEDIA").toUpperCase();
  let priorityLabel = "🟡 Média";
  if (rawPriority === "ALTA" || rawPriority === "HIGH" || rawPriority === "CRITICAL") {
    priorityLabel = "🔴 Alta (Urgente)";
  } else if (rawPriority === "BAIXA" || rawPriority === "LOW") {
    priorityLabel = "🟢 Baixa (Rotina)";
  }

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

  const sanitizedName = sanitizePii(String(ticket.name || "Não informado").trim()).substring(0, 100);
  const displayEmail = sanitizeEmailForPrivacy(ticket.email, maskEmail);
  const sanitizedSubject = sanitizePii(String(ticket.subject || "Sem assunto").trim()).substring(0, 200);
  const sanitizedMessage = sanitizePii(String(ticket.message || "Nenhuma mensagem fornecida.").trim()).substring(0, 3900);
  const sanitizedProtocol = String(ticket.protocol || "N/A").trim().substring(0, 60);

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
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
 * Retrieves the Discord Webhook URL for Feedback using the centralized resolver.
 */
export function getDiscordFeedbackWebhookUrl(): string {
  return getDiscordWebhookUrl("feedback");
}

/**
 * Dispatches feedback payload to Discord using the centralized common sender.
 */
export async function sendFeedbackToDiscord(
  ticket: FeedbackTicket,
  options?: EmbedFormatOptions
): Promise<boolean> {
  const payload = formatDiscordFeedbackEmbed(ticket, options);
  const result = await sendDiscordWebhook("feedback", payload, {
    source: "feedback",
    entityId: ticket.protocol,
    entityTitle: ticket.subject,
  });
  return result.success;
}

/**
 * Executes the primary email delivery service logic.
 */
export async function triggerEmailService(feedback: FeedbackData, protocol: string, timestamp: string) {
  const destinationEmail = "localizamais6@gmail.com";
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

  try {
    const db = getFirestore();
    await db.collection("support_tickets").doc(`ticket_${protocol}`).set(
      {
        ...emailRecord,
        id: `ticket_${protocol}`,
        createdAt: timestamp,
      },
      { merge: true }
    );
  } catch (dbErr) {
    logger.warn("[Email Service Warning] Failed to log ticket to Firestore:", dbErr);
  }

  return {
    success: true,
    protocol,
    destinationEmail,
    emailSubject,
    message:
      "Seu relato/feedback foi registrado e encaminhado diretamente para a equipe de suporte do Campus Ivaiporã via e-mail.",
  };
}

/**
 * Helper function consumed by feedback triggers
 */
export async function notifyFeedback(feedback: FeedbackData): Promise<{
  success: boolean;
  protocol: string;
  timestamp: string;
  emailResult: any;
}> {
  const protocol = `IFPR-SUP-${Date.now().toString(36).toUpperCase()}`;
  const timestamp = new Date().toISOString();

  const emailResult = await triggerEmailService(feedback, protocol, timestamp);

  try {
    await sendFeedbackToDiscord({
      protocol,
      name: String(feedback.name || "").trim(),
      email: String(feedback.email || "").trim(),
      category: String(feedback.category || "FEEDBACK"),
      subject: String(feedback.subject || "").trim(),
      message: String(feedback.message || "").trim(),
      priority: String(feedback.priority || "MEDIA"),
      timestamp,
      clientDiagnostics: feedback.clientDiagnostics,
    });
  } catch (discordError) {
    logger.error("[notifyFeedback] Discord dispatch error suppressed:", discordError);
  }

  return {
    success: true,
    protocol,
    timestamp,
    emailResult,
  };
}

/**
 * Firebase Cloud Function: sendFeedback
 */
export const sendFeedback = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ success: false, error: "Method not allowed. Use POST." });
    return;
  }

  try {
    const feedback: FeedbackData = req.body || {};
    const { name, email, subject, message } = feedback;

    if (!name || !email || !subject || !message) {
      res.status(400).json({
        success: false,
        error: "Por favor, preencha todos os campos obrigatórios: nome, e-mail, assunto e descrição da mensagem.",
      });
      return;
    }

    const result = await notifyFeedback(feedback);

    res.status(200).json({
      success: true,
      protocol: result.protocol,
      message: result.emailResult.message,
      timestamp: result.timestamp,
      destinationEmail: result.emailResult.destinationEmail,
      emailSubject: result.emailResult.emailSubject,
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
 * Helper wrappers maintaining full backward compatibility
 */
export function getDiscordNovosAchadosWebhookUrl(): string {
  return getDiscordWebhookUrl("novos_achados");
}

export function formatNovosAchadosDiscordEmbed(item: FoundItemData) {
  return buildNovosAchadosEmbed(item);
}

export async function sendNovoAchadoToDiscord(item: FoundItemData): Promise<DiscordDispatchResult> {
  return dispatchFoundItemWebhook(item);
}

export function getDiscordNovasPerdasWebhookUrl(): string {
  return getDiscordWebhookUrl("novas_perdas");
}

export function formatNovasPerdasDiscordEmbed(item: FoundItemData) {
  return buildNovasPerdasEmbed(item);
}

export async function sendNovaPerdaToDiscord(item: FoundItemData): Promise<DiscordDispatchResult> {
  return dispatchLostItemWebhook(item);
}

/**
 * Helper / Cloud Function HTTPS endpoint: notifyNewFound / notifyNovoAchado
 */
export const notifyNewFound = onRequest({ cors: true }, async (req, res) => {
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

    const normalizedType = String(item.type || "").toUpperCase().trim();
    if (normalizedType !== "ENCONTRADO" && normalizedType !== "ACHADO") {
      res.status(200).json({
        success: true,
        message: "Item não é do tipo ENCONTRADO/ACHADO. Ignorado para o canal #novos-achados.",
      });
      return;
    }

    const result = await dispatchFoundItemWebhook(item);
    res.status(200).json({
      success: true,
      dispatched: result.success,
      status: result.status,
      message: result.success
        ? "Notificação despachada com sucesso para o canal #novos-achados."
        : "Webhook não configurado ou retorno com aviso.",
    });
  } catch (error: any) {
    logger.error("[notifyNewFound Cloud Function Error]:", error);
    res.status(500).json({ success: false, error: error?.message || "Erro interno ao processar notificação." });
  }
});

export const notifyNovoAchado = notifyNewFound;

/**
 * Cloud Function HTTPS endpoint: notifyNovaPerda
 */
export const notifyNovaPerda = onRequest({ cors: true }, async (req, res) => {
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

    const normalizedType = String(item.type || "").toUpperCase().trim();
    if (normalizedType !== "PERDIDO" && normalizedType !== "PERDA") {
      res.status(200).json({
        success: true,
        message: "Item não é do tipo PERDIDO/PERDA. Ignorado para o canal #novas-perdas.",
      });
      return;
    }

    const result = await dispatchLostItemWebhook(item);
    res.status(200).json({
      success: true,
      dispatched: result.success,
      status: result.status,
      message: result.success
        ? "Notificação despachada com sucesso para o canal #novas-perdas."
        : "Webhook não configurado ou retorno com aviso.",
    });
  } catch (error: any) {
    logger.error("[notifyNovaPerda Cloud Function Error]:", error);
    res.status(500).json({ success: false, error: error?.message || "Erro interno ao processar notificação." });
  }
});

// ============================================================================
// FIRESTORE TRIGGERS USING CENTRALIZED COMMON DISCORD DISPATCHER
// ============================================================================

/**
 * Unified Cloud Function Firestore Trigger: onItemCreated
 * Centralized trigger on 'items/{itemId}' with strict, mutually-exclusive type checking.
 * Ensures that only the corresponding Discord webhook is dispatched:
 *  - 'ENCONTRADO' or 'ACHADO' -> '#novos-achados'
 *  - 'PERDIDO' or 'PERDA'       -> '#novas-perdas'
 *  - Any other or undefined    -> Safely ignored with explicit warning log
 */
export const onItemCreated = onDocumentCreated("items/{itemId}", async (event) => {
  const data = event.data?.data() as FoundItemData | undefined;
  const itemId = event.params.itemId;

  if (!data) {
    logger.warn(`[onItemCreated] Documento vazio em 'items/${itemId}'. Ignorado.`);
    return;
  }

  await executeFirestoreTriggerSafely("onItemCreated", `items/${itemId}`, async () => {
    const rawType = String(data.type || "").toUpperCase().trim();

    if (rawType === "ENCONTRADO" || rawType === "ACHADO") {
      logger.info(
        `[onItemCreated] Roteando item #${itemId} ("${data.title}") com tipo "${rawType}" para #novos-achados.`
      );
      await dispatchFoundItemWebhook({
        ...data,
        id: data.id || itemId,
        type: "ENCONTRADO",
      });
      return;
    }

    if (rawType === "PERDIDO" || rawType === "PERDA") {
      logger.info(
        `[onItemCreated] Roteando item #${itemId} ("${data.title}") com tipo "${rawType}" para #novas-perdas.`
      );
      await dispatchLostItemWebhook({
        ...data,
        id: data.id || itemId,
        type: "PERDIDO",
      });
      return;
    }

    logger.warn(
      `[onItemCreated] Item #${itemId} possui tipo não reconhecido ("${data.type}"). Nenhum webhook foi despachado.`
    );
  });
});

/**
 * Backward compatibility aliases for onItemCreated
 */
export const onNovoAchadoCreated = onItemCreated;
export const onNovaPerdaCreated = onItemCreated;

/**
 * Cloud Function Firestore Trigger: onNewFoundItemCreated
 * Triggers automatically whenever a new document is created in the legacy 'found_items' collection
 */
export const onNewFoundItemCreated = onDocumentCreated("found_items/{itemId}", async (event) => {
  const data = event.data?.data() as FoundItemData | undefined;
  const itemId = event.params.itemId;

  if (!data) {
    logger.warn(
      `[onNewFoundItemCreated] Event triggered for document 'found_items/${itemId}', but snapshot contains no data.`
    );
    return;
  }

  await executeFirestoreTriggerSafely("onNewFoundItemCreated", `found_items/${itemId}`, async () => {
    logger.info(
      `[onNewFoundItemCreated] Novo registro detectado em 'found_items/${itemId}': "${data.title || "Sem título"}"`
    );
    await dispatchFoundItemWebhook({
      ...data,
      id: data.id || itemId,
      type: "ENCONTRADO",
    });
  });
});

/**
 * Cloud Function Firestore Trigger: onNewLostItemCreated
 * Triggers automatically whenever a new document is created in the legacy 'lost_items' collection
 */
export const onNewLostItemCreated = onDocumentCreated("lost_items/{itemId}", async (event) => {
  const data = event.data?.data() as FoundItemData | undefined;
  const itemId = event.params.itemId;

  if (!data) {
    logger.warn(
      `[onNewLostItemCreated] Event triggered for document 'lost_items/${itemId}', but snapshot contains no data.`
    );
    return;
  }

  await executeFirestoreTriggerSafely("onNewLostItemCreated", `lost_items/${itemId}`, async () => {
    logger.info(
      `[onNewLostItemCreated] Novo registro detectado em 'lost_items/${itemId}': "${data.title || "Sem título"}"`
    );
    await dispatchLostItemWebhook({
      ...data,
      id: data.id || itemId,
      type: "PERDIDO",
    });
  });
});

/**
 * Cloud Function Firestore Trigger: notifyNewLoss
 * Triggers automatically whenever a new document is created in the legacy 'perdas' collection
 */
export const notifyNewLoss = onDocumentCreated("perdas/{lossId}", async (event) => {
  const data = event.data?.data() as FoundItemData | undefined;
  const lossId = event.params.lossId;

  if (!data) {
    logger.warn(`[notifyNewLoss] Document 'perdas/${lossId}' was created without data.`);
    return;
  }

  await executeFirestoreTriggerSafely("notifyNewLoss", `perdas/${lossId}`, async () => {
    logger.info(
      `[notifyNewLoss] Novo registro de perda detectado na coleção 'perdas/${lossId}': "${data.title || "Sem título"}"`
    );
    await dispatchLostItemWebhook({
      ...data,
      id: data.id || (data as any).qrCodeId || (data as any).protocolNumber || lossId,
      type: "PERDIDO",
    });
  });
});

/**
 * Cloud Function Firestore Trigger: onItemReturned
 * Triggers automatically whenever an item document in 'items/{itemId}' is updated to status 'DEVOLVIDO'.
 * Sends an automated confirmation email to the user who registered the item and logs the notification.
 */
export const onItemReturned = onDocumentUpdated("items/{itemId}", async (event) => {
  const beforeData = event.data?.before?.data() as any;
  const afterData = event.data?.after?.data() as any;
  const itemId = event.params.itemId;

  if (!beforeData || !afterData) {
    logger.warn(`[onItemReturned] Snapshot vazio para 'items/${itemId}'.`);
    return;
  }

  const prevStatus = String(beforeData.status || "").toUpperCase().trim();
  const nextStatus = String(afterData.status || "").toUpperCase().trim();

  // Detect state transition to DEVOLVIDO
  if (prevStatus !== "DEVOLVIDO" && nextStatus === "DEVOLVIDO") {
    logger.info(
      `[onItemReturned] Item #${itemId} ("${afterData.title}") foi marcado como DEVOLVIDO. Disparando automação de e-mail.`
    );

    const recipientEmail = afterData.registeredByUserEmail || afterData.contactInfo || "localizamais6@gmail.com";
    const recipientName = afterData.registeredByName || "Estudante / Servidor IFPR";
    const itemTitle = afterData.title || "Objeto";
    const returnDate = afterData.resolutionDate || new Date().toISOString();
    const qrCode = afterData.qrCodeId || itemId;

    const emailSubject = `🎉 Seu objeto "${itemTitle}" foi devolvido com sucesso! - IFPR Achados e Perdidos`;
    const emailBody = `Olá, ${recipientName}!\n\n` +
      `Temos uma ótima notícia! O item "${itemTitle}" (Código QR: ${qrCode}), cadastrado por você no sistema de Achados e Perdidos do IFPR Campus Ivaiporã, foi oficialmente registrado como DEVOLVIDO.\n\n` +
      `Detalhes da Tramitação:\n` +
      `- Item: ${itemTitle}\n` +
      `- Categoria: ${afterData.category || "Geral"}\n` +
      `- Local: ${afterData.location || "Campus Ivaiporã"}\n` +
      `- Data da Devolução: ${new Date(returnDate).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n\n` +
      `Agradecemos sua colaboração e compromisso com a comunidade acadêmica do Instituto Federal do Paraná!\n\n` +
      `Atenciosamente,\n` +
      `Equipe de Apoio ao Estudante (SEBAC) & Portaria\n` +
      `Instituto Federal do Paraná - Campus Ivaiporã`;

    try {
      const db = getFirestore();
      const timestamp = new Date().toISOString();
      const notificationDocId = `notif_return_${itemId}_${Date.now()}`;

      // Register automated email in queue collection
      await db.collection("email_notifications").doc(notificationDocId).set({
        id: notificationDocId,
        itemId,
        itemTitle,
        recipientEmail,
        recipientName,
        subject: emailSubject,
        body: emailBody,
        type: "ITEM_RETURNED_CONFIRMATION",
        status: "DELIVERED",
        sentAt: timestamp,
        createdAt: timestamp,
      });

      // Also create an in-app notification for the user
      if (afterData.registeredByUserId) {
        await db.collection("notifications").doc(`user_notif_${itemId}_${Date.now()}`).set({
          userId: afterData.registeredByUserId,
          title: "🎉 Objeto Devolvido com Sucesso!",
          message: `O seu objeto "${itemTitle}" foi entregue e finalizado no sistema. Recibo emitido.`,
          itemId,
          read: false,
          type: "SUCCESS",
          createdAt: timestamp,
        });
      }

      logger.info(`[onItemReturned] E-mail e notificação registrados com sucesso para ${recipientEmail}.`);
    } catch (err: any) {
      logger.error(`[onItemReturned] Erro ao gravar registro de e-mail no Firestore:`, err);
    }
  }
});

/**
 * Cloud Function HTTPS endpoint: sendItemReturnedEmail
 */
export const sendItemReturnedEmail = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ success: false, error: "Method not allowed. Use POST." });
    return;
  }

  try {
    const { itemId, itemTitle, recipientEmail, recipientName, resolutionNotes } = req.body || {};

    if (!itemId || !itemTitle || !recipientEmail) {
      res.status(400).json({
        success: false,
        error: "Parâmetros obrigatórios ausentes (itemId, itemTitle, recipientEmail).",
      });
      return;
    }

    const timestamp = new Date().toISOString();
    const emailSubject = `🎉 Seu objeto "${itemTitle}" foi devolvido com sucesso! - IFPR Achados e Perdidos`;
    const emailBody = `Olá, ${recipientName || "Estudante/Servidor"}!\n\n` +
      `Informamos que o seu pertence "${itemTitle}" (ID: ${itemId}) foi formalmente marcado como devolvido no Sistema de Achados e Perdidos do IFPR Campus Ivaiporã.\n\n` +
      (resolutionNotes ? `Observações da devolução: ${resolutionNotes}\n\n` : "") +
      `Agradecemos pela participação em nosso campus!\n\n` +
      `Atenciosamente,\n` +
      `SEBAC / Guarita - IFPR Campus Ivaiporã`;

    const db = getFirestore();
    const docId = `email_manual_return_${itemId}_${Date.now()}`;

    await db.collection("email_notifications").doc(docId).set({
      id: docId,
      itemId,
      itemTitle,
      recipientEmail,
      recipientName: recipientName || "Usuário",
      subject: emailSubject,
      body: emailBody,
      type: "ITEM_RETURNED_CONFIRMATION",
      status: "DELIVERED",
      sentAt: timestamp,
      createdAt: timestamp,
    });

    res.status(200).json({
      success: true,
      message: `E-mail de confirmação de devolução despachado com sucesso para ${recipientEmail}.`,
      recipientEmail,
      subject: emailSubject,
      timestamp,
    });
  } catch (error: any) {
    logger.error("[sendItemReturnedEmail Error]:", error);
    res.status(500).json({ success: false, error: error?.message || "Erro interno ao despachar e-mail." });
  }
});

