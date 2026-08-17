"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyNewLoss = exports.onNewLostItemCreated = exports.onNewFoundItemCreated = exports.onNovaPerdaCreated = exports.onNovoAchadoCreated = exports.onItemCreated = exports.notifyNovaPerda = exports.notifyNovoAchado = exports.notifyNewFound = exports.sendFeedback = exports.CATEGORY_MAP = exports.STATUS_LABELS = exports.STATUS_COLORS = exports.getCategoryMeta = exports.getStatusLabel = exports.getStatusColor = exports.formatItemToDiscordEmbed = void 0;
exports.sanitizeEmailForPrivacy = sanitizeEmailForPrivacy;
exports.formatDiscordFeedbackEmbed = formatDiscordFeedbackEmbed;
exports.getDiscordFeedbackWebhookUrl = getDiscordFeedbackWebhookUrl;
exports.sendFeedbackToDiscord = sendFeedbackToDiscord;
exports.triggerEmailService = triggerEmailService;
exports.notifyFeedback = notifyFeedback;
exports.getDiscordNovosAchadosWebhookUrl = getDiscordNovosAchadosWebhookUrl;
exports.formatNovosAchadosDiscordEmbed = formatNovosAchadosDiscordEmbed;
exports.sendNovoAchadoToDiscord = sendNovoAchadoToDiscord;
exports.getDiscordNovasPerdasWebhookUrl = getDiscordNovasPerdasWebhookUrl;
exports.formatNovasPerdasDiscordEmbed = formatNovasPerdasDiscordEmbed;
exports.sendNovaPerdaToDiscord = sendNovaPerdaToDiscord;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const app_1 = require("firebase-admin/app");
const firestore_2 = require("firebase-admin/firestore");
const discordEmbedHelper_1 = require("./discordEmbedHelper");
const discord_1 = require("./utils/discord");
// Lazy initialize Firebase Admin if not already initialized
if ((0, app_1.getApps)().length === 0) {
    try {
        (0, app_1.initializeApp)();
    }
    catch (e) {
        logger.warn("[Firebase Cloud Functions] Admin already initialized or init warning:", e);
    }
}
// Re-export all formatting, embed, and sender utilities
__exportStar(require("./discordEmbedHelper"), exports);
__exportStar(require("./utils/discord"), exports);
var discordHelper_1 = require("./utils/discordHelper");
Object.defineProperty(exports, "formatItemToDiscordEmbed", { enumerable: true, get: function () { return discordHelper_1.formatItemToDiscordEmbed; } });
Object.defineProperty(exports, "getStatusColor", { enumerable: true, get: function () { return discordHelper_1.getStatusColor; } });
Object.defineProperty(exports, "getStatusLabel", { enumerable: true, get: function () { return discordHelper_1.getStatusLabel; } });
Object.defineProperty(exports, "getCategoryMeta", { enumerable: true, get: function () { return discordHelper_1.getCategoryMeta; } });
Object.defineProperty(exports, "STATUS_COLORS", { enumerable: true, get: function () { return discordHelper_1.STATUS_COLORS; } });
Object.defineProperty(exports, "STATUS_LABELS", { enumerable: true, get: function () { return discordHelper_1.STATUS_LABELS; } });
Object.defineProperty(exports, "CATEGORY_MAP", { enumerable: true, get: function () { return discordHelper_1.CATEGORY_MAP; } });
/**
 * Sanitizes and formats email for privacy if masking is enabled (e.g., j***o@estudante.ifpr.edu.br).
 */
function sanitizeEmailForPrivacy(email, mask = false) {
    const trimmed = String(email || "").trim();
    if (!trimmed)
        return "Não informado";
    if (!mask)
        return (0, discordEmbedHelper_1.sanitizePii)(trimmed);
    const parts = trimmed.split("@");
    if (parts.length !== 2)
        return (0, discordEmbedHelper_1.sanitizePii)(trimmed);
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
function formatDiscordFeedbackEmbed(ticket, options = {}) {
    const { maskEmail = false, includeDiagnostics = true } = options;
    const categoryConfig = {
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
    }
    else if (rawPriority === "BAIXA" || rawPriority === "LOW") {
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
    }
    catch {
        dateFormatted = ticket.timestamp;
    }
    const sanitizedName = (0, discordEmbedHelper_1.sanitizePii)(String(ticket.name || "Não informado").trim()).substring(0, 100);
    const displayEmail = sanitizeEmailForPrivacy(ticket.email, maskEmail);
    const sanitizedSubject = (0, discordEmbedHelper_1.sanitizePii)(String(ticket.subject || "Sem assunto").trim()).substring(0, 200);
    const sanitizedMessage = (0, discordEmbedHelper_1.sanitizePii)(String(ticket.message || "Nenhuma mensagem fornecida.").trim()).substring(0, 3900);
    const sanitizedProtocol = String(ticket.protocol || "N/A").trim().substring(0, 60);
    const fields = [
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
        const diagItems = [];
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
function getDiscordFeedbackWebhookUrl() {
    return (0, discord_1.getDiscordWebhookUrl)("feedback");
}
/**
 * Dispatches feedback payload to Discord using the centralized common sender.
 */
async function sendFeedbackToDiscord(ticket, options) {
    const payload = formatDiscordFeedbackEmbed(ticket, options);
    const result = await (0, discord_1.sendDiscordWebhook)("feedback", payload, {
        source: "feedback",
        entityId: ticket.protocol,
        entityTitle: ticket.subject,
    });
    return result.success;
}
/**
 * Executes the primary email delivery service logic.
 */
async function triggerEmailService(feedback, protocol, timestamp) {
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
    logger.info(`[Email Service Dispatched] Protocol: ${protocol} | From: ${emailRecord.senderEmail} | To: ${destinationEmail} | Subject: ${emailSubject}`);
    try {
        const db = (0, firestore_2.getFirestore)();
        await db.collection("support_tickets").doc(`ticket_${protocol}`).set({
            ...emailRecord,
            id: `ticket_${protocol}`,
            createdAt: timestamp,
        }, { merge: true });
    }
    catch (dbErr) {
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
 * Helper function consumed by feedback triggers
 */
async function notifyFeedback(feedback) {
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
    }
    catch (discordError) {
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
exports.sendFeedback = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).json({ success: false, error: "Method not allowed. Use POST." });
        return;
    }
    try {
        const feedback = req.body || {};
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
    }
    catch (error) {
        logger.error("[sendFeedback Cloud Function Error]:", error);
        res.status(500).json({
            success: false,
            error: error?.message || "Erro interno ao processar feedback.",
        });
    }
});
/**
 * Helper wrappers maintaining full backward compatibility
 */
function getDiscordNovosAchadosWebhookUrl() {
    return (0, discord_1.getDiscordWebhookUrl)("novos_achados");
}
function formatNovosAchadosDiscordEmbed(item) {
    return (0, discordEmbedHelper_1.buildNovosAchadosEmbed)(item);
}
async function sendNovoAchadoToDiscord(item) {
    return (0, discord_1.dispatchFoundItemWebhook)(item);
}
function getDiscordNovasPerdasWebhookUrl() {
    return (0, discord_1.getDiscordWebhookUrl)("novas_perdas");
}
function formatNovasPerdasDiscordEmbed(item) {
    return (0, discordEmbedHelper_1.buildNovasPerdasEmbed)(item);
}
async function sendNovaPerdaToDiscord(item) {
    return (0, discord_1.dispatchLostItemWebhook)(item);
}
/**
 * Helper / Cloud Function HTTPS endpoint: notifyNewFound / notifyNovoAchado
 */
exports.notifyNewFound = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).json({ success: false, error: "Method not allowed. Use POST." });
        return;
    }
    try {
        const item = req.body?.item || req.body;
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
        const result = await (0, discord_1.dispatchFoundItemWebhook)(item);
        res.status(200).json({
            success: true,
            dispatched: result.success,
            status: result.status,
            message: result.success
                ? "Notificação despachada com sucesso para o canal #novos-achados."
                : "Webhook não configurado ou retorno com aviso.",
        });
    }
    catch (error) {
        logger.error("[notifyNewFound Cloud Function Error]:", error);
        res.status(500).json({ success: false, error: error?.message || "Erro interno ao processar notificação." });
    }
});
exports.notifyNovoAchado = exports.notifyNewFound;
/**
 * Cloud Function HTTPS endpoint: notifyNovaPerda
 */
exports.notifyNovaPerda = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).json({ success: false, error: "Method not allowed. Use POST." });
        return;
    }
    try {
        const item = req.body?.item || req.body;
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
        const result = await (0, discord_1.dispatchLostItemWebhook)(item);
        res.status(200).json({
            success: true,
            dispatched: result.success,
            status: result.status,
            message: result.success
                ? "Notificação despachada com sucesso para o canal #novas-perdas."
                : "Webhook não configurado ou retorno com aviso.",
        });
    }
    catch (error) {
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
exports.onItemCreated = (0, firestore_1.onDocumentCreated)("items/{itemId}", async (event) => {
    const data = event.data?.data();
    const itemId = event.params.itemId;
    if (!data) {
        logger.warn(`[onItemCreated] Documento vazio em 'items/${itemId}'. Ignorado.`);
        return;
    }
    await (0, discord_1.executeFirestoreTriggerSafely)("onItemCreated", `items/${itemId}`, async () => {
        const rawType = String(data.type || "").toUpperCase().trim();
        if (rawType === "ENCONTRADO" || rawType === "ACHADO") {
            logger.info(`[onItemCreated] Roteando item #${itemId} ("${data.title}") com tipo "${rawType}" para #novos-achados.`);
            await (0, discord_1.dispatchFoundItemWebhook)({
                ...data,
                id: data.id || itemId,
                type: "ENCONTRADO",
            });
            return;
        }
        if (rawType === "PERDIDO" || rawType === "PERDA") {
            logger.info(`[onItemCreated] Roteando item #${itemId} ("${data.title}") com tipo "${rawType}" para #novas-perdas.`);
            await (0, discord_1.dispatchLostItemWebhook)({
                ...data,
                id: data.id || itemId,
                type: "PERDIDO",
            });
            return;
        }
        logger.warn(`[onItemCreated] Item #${itemId} possui tipo não reconhecido ("${data.type}"). Nenhum webhook foi despachado.`);
    });
});
/**
 * Backward compatibility aliases for onItemCreated
 */
exports.onNovoAchadoCreated = exports.onItemCreated;
exports.onNovaPerdaCreated = exports.onItemCreated;
/**
 * Cloud Function Firestore Trigger: onNewFoundItemCreated
 * Triggers automatically whenever a new document is created in the legacy 'found_items' collection
 */
exports.onNewFoundItemCreated = (0, firestore_1.onDocumentCreated)("found_items/{itemId}", async (event) => {
    const data = event.data?.data();
    const itemId = event.params.itemId;
    if (!data) {
        logger.warn(`[onNewFoundItemCreated] Event triggered for document 'found_items/${itemId}', but snapshot contains no data.`);
        return;
    }
    await (0, discord_1.executeFirestoreTriggerSafely)("onNewFoundItemCreated", `found_items/${itemId}`, async () => {
        logger.info(`[onNewFoundItemCreated] Novo registro detectado em 'found_items/${itemId}': "${data.title || "Sem título"}"`);
        await (0, discord_1.dispatchFoundItemWebhook)({
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
exports.onNewLostItemCreated = (0, firestore_1.onDocumentCreated)("lost_items/{itemId}", async (event) => {
    const data = event.data?.data();
    const itemId = event.params.itemId;
    if (!data) {
        logger.warn(`[onNewLostItemCreated] Event triggered for document 'lost_items/${itemId}', but snapshot contains no data.`);
        return;
    }
    await (0, discord_1.executeFirestoreTriggerSafely)("onNewLostItemCreated", `lost_items/${itemId}`, async () => {
        logger.info(`[onNewLostItemCreated] Novo registro detectado em 'lost_items/${itemId}': "${data.title || "Sem título"}"`);
        await (0, discord_1.dispatchLostItemWebhook)({
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
exports.notifyNewLoss = (0, firestore_1.onDocumentCreated)("perdas/{lossId}", async (event) => {
    const data = event.data?.data();
    const lossId = event.params.lossId;
    if (!data) {
        logger.warn(`[notifyNewLoss] Document 'perdas/${lossId}' was created without data.`);
        return;
    }
    await (0, discord_1.executeFirestoreTriggerSafely)("notifyNewLoss", `perdas/${lossId}`, async () => {
        logger.info(`[notifyNewLoss] Novo registro de perda detectado na coleção 'perdas/${lossId}': "${data.title || "Sem título"}"`);
        await (0, discord_1.dispatchLostItemWebhook)({
            ...data,
            id: data.id || data.qrCodeId || data.protocolNumber || lossId,
            type: "PERDIDO",
        });
    });
});
//# sourceMappingURL=index.js.map