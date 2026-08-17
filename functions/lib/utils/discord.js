"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDiscordWebhookUrl = getDiscordWebhookUrl;
exports.sendDiscordWebhook = sendDiscordWebhook;
exports.dispatchFoundItemWebhook = dispatchFoundItemWebhook;
exports.dispatchLostItemWebhook = dispatchLostItemWebhook;
exports.executeFirestoreTriggerSafely = executeFirestoreTriggerSafely;
const logger = require("firebase-functions/logger");
const functions = require("firebase-functions");
const discordEmbedHelper_1 = require("../discordEmbedHelper");
/**
 * Resolves the Discord Webhook URL strictly on the server side using
 * Firebase configuration or environment variables.
 * Webhook URLs are never exposed in frontend bundles or client responses.
 */
function getDiscordWebhookUrl(channel) {
    try {
        const functionsConfig = typeof functions.config === "function" ? functions.config() : null;
        if (channel === "novos_achados") {
            const configUrl = functionsConfig?.discord?.novos_achados_webhook_url ||
                functionsConfig?.discord?.webhook_url_novos_achados ||
                functionsConfig?.discord?.achados_webhook_url ||
                functionsConfig?.discord?.achados_url ||
                functionsConfig?.discord?.webhook_achados;
            if (configUrl && typeof configUrl === "string" && configUrl.trim()) {
                return configUrl.trim();
            }
            const envUrl = process.env.DISCORD_NOVOS_ACHADOS_WEBHOOK_URL ||
                process.env.DISCORD_WEBHOOK_URL_NOVOS_ACHADOS ||
                process.env.DISCORD_ACHADOS_WEBHOOK_URL ||
                process.env.DISCORD_ACHADOS_URL ||
                process.env.DISCORD_WEBHOOK_ACHADOS;
            if (envUrl && typeof envUrl === "string" && envUrl.trim()) {
                return envUrl.trim();
            }
        }
        if (channel === "novas_perdas") {
            const configUrl = functionsConfig?.discord?.novas_perdas_webhook_url ||
                functionsConfig?.discord?.webhook_url_novas_perdas ||
                functionsConfig?.discord?.perdas_webhook_url ||
                functionsConfig?.discord?.perdas_url ||
                functionsConfig?.discord?.webhook_perdas;
            if (configUrl && typeof configUrl === "string" && configUrl.trim()) {
                return configUrl.trim();
            }
            const envUrl = process.env.DISCORD_NOVAS_PERDAS_WEBHOOK_URL ||
                process.env.DISCORD_WEBHOOK_URL_NOVAS_PERDAS ||
                process.env.DISCORD_PERDAS_WEBHOOK_URL ||
                process.env.DISCORD_PERDAS_URL ||
                process.env.DISCORD_WEBHOOK_PERDAS;
            if (envUrl && typeof envUrl === "string" && envUrl.trim()) {
                return envUrl.trim();
            }
        }
        if (channel === "feedback") {
            const configUrl = functionsConfig?.discord?.feedback_webhook_url ||
                functionsConfig?.discord?.webhook_url_feedback ||
                functionsConfig?.discord?.webhook_url;
            if (configUrl && typeof configUrl === "string" && configUrl.trim()) {
                return configUrl.trim();
            }
            const envUrl = process.env.DISCORD_FEEDBACK_WEBHOOK_URL ||
                process.env.DISCORD_WEBHOOK_URL_FEEDBACK ||
                process.env.DISCORD_FEEDBACK_URL ||
                process.env.DISCORD_WEBHOOK_FEEDBACK ||
                process.env.DISCORD_WEBHOOK_URL;
            if (envUrl && typeof envUrl === "string" && envUrl.trim()) {
                return envUrl.trim();
            }
        }
    }
    catch {
        // Silent catch for non-blocking local/test executions
    }
    return "";
}
/**
 * Common Discord Webhook sender utility with:
 * - Content-Type: application/json header
 * - Unified try-catch error handling
 * - Timeout protection (10s AbortController)
 * - Silent structured logging to Firebase Logger
 * - No exposure of webhook URLs to the frontend
 */
async function sendDiscordWebhook(target, payload, context = { source: "discord-service" }) {
    const isDirectUrl = typeof target === "string" && (target.startsWith("http://") || target.startsWith("https://"));
    const targetUrl = isDirectUrl ? target : getDiscordWebhookUrl(target);
    const { source, entityId, entityTitle } = context;
    logger.info(`[DISCORD_DIAGNOSTIC] [${source}] Execução do trigger iniciada para entityId: "${entityId || "N/A"}" (título: "${entityTitle || "N/A"}")`, { source, entityId, entityTitle });
    const embedCount = payload?.embeds?.length || 0;
    logger.info(`[DISCORD_DIAGNOSTIC] [${source}] Payload de dados preparado (embeds: ${embedCount}, webhook configurado: ${targetUrl ? "SIM" : "NÃO"})`, { source, entityId, embedCount, webhookConfigured: Boolean(targetUrl) });
    if (!targetUrl) {
        logger.info(`[DiscordWebhook Notice] [${source}] Webhook URL não configurada para '${target}'. Notificação ignorada silenciosamente.`, { entityId, entityTitle });
        return {
            success: false,
            error: "WEBHOOK_URL_NOT_CONFIGURED",
            entityId,
        };
    }
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        logger.info(`[DISCORD_DIAGNOSTIC] [${source}] Enviando requisição HTTP POST para o Discord...`);
        const response = await fetch(targetUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        logger.info(`[DISCORD_DIAGNOSTIC] [${source}] Discord respondeu com HTTP Status: ${response.status} (${response.statusText})`, { source, entityId, status: response.status, statusText: response.statusText });
        if (!response.ok) {
            const errText = await response.text().catch(() => "Sem corpo de resposta");
            logger.error(`[DiscordWebhook Error] [${source}] Discord API retornou HTTP ${response.status} (${response.statusText}):`, {
                source,
                status: response.status,
                statusText: response.statusText,
                responseBody: errText,
                entityId,
                entityTitle,
                timestamp: new Date().toISOString(),
            });
            return {
                success: false,
                status: response.status,
                statusText: response.statusText,
                error: errText,
                entityId,
            };
        }
        logger.info(`[DiscordWebhook Success] [${source}] Notificação despachada com sucesso ao Discord.`, { entityId, entityTitle, status: response.status });
        return {
            success: true,
            status: response.status,
            entityId,
        };
    }
    catch (error) {
        const isAbort = error?.name === "AbortError";
        const errorMessage = isAbort
            ? "Timeout de 10s excedido ao conectar com o Discord"
            : error?.message || String(error);
        logger.error(`[DiscordWebhook Error] [${source}] Falha de rede/execução ao despachar Webhook para o Discord:`, {
            source,
            errorMessage,
            errorName: error?.name,
            stack: error?.stack,
            entityId,
            entityTitle,
            timestamp: new Date().toISOString(),
        });
        return {
            success: false,
            error: errorMessage,
            entityId,
        };
    }
}
/**
 * Dispatches a new found item notification to '#novos-achados'
 */
async function dispatchFoundItemWebhook(item) {
    const normalizedType = String(item?.type || "").toUpperCase().trim();
    if (normalizedType !== "ENCONTRADO" && normalizedType !== "ACHADO") {
        logger.info(`[dispatchFoundItemWebhook] Item do tipo '${item?.type}' não é ENCONTRADO/ACHADO. Ignorado para #novos-achados.`);
        return { success: false, error: "TYPE_NOT_ENCONTRADO" };
    }
    const payload = (0, discordEmbedHelper_1.buildNovosAchadosEmbed)(item);
    return sendDiscordWebhook("novos_achados", payload, {
        source: "novos-achados",
        entityId: item.id,
        entityTitle: item.title,
    });
}
/**
 * Dispatches a new lost item notification to '#novas-perdas'
 */
async function dispatchLostItemWebhook(item) {
    const normalizedType = String(item?.type || "").toUpperCase().trim();
    if (normalizedType !== "PERDIDO" && normalizedType !== "PERDA") {
        logger.info(`[dispatchLostItemWebhook] Item do tipo '${item?.type}' não é PERDIDO/PERDA. Ignorado para #novas-perdas.`);
        return { success: false, error: "TYPE_NOT_PERDIDO" };
    }
    const payload = (0, discordEmbedHelper_1.buildNovasPerdasEmbed)(item);
    return sendDiscordWebhook("novas_perdas", payload, {
        source: "novas-perdas",
        entityId: item.id,
        entityTitle: item.title,
    });
}
/**
 * Helper to safely execute a Firestore trigger block with unified silent error logging.
 */
async function executeFirestoreTriggerSafely(triggerName, docPath, handler) {
    try {
        await handler();
    }
    catch (error) {
        logger.error(`[${triggerName}] Exceção não tratada capturada durante o processamento do gatilho para '${docPath}':`, {
            triggerName,
            docPath,
            errorMessage: error?.message,
            stack: error?.stack,
            timestamp: new Date().toISOString(),
        });
    }
}
//# sourceMappingURL=discord.js.map