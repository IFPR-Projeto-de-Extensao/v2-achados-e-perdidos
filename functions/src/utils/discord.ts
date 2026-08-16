import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions";
import {
  DiscordWebhookPayload,
  FoundItemPayload,
  buildNovosAchadosEmbed,
  buildNovasPerdasEmbed,
} from "../discordEmbedHelper";

export interface DiscordDispatchResult {
  success: boolean;
  status?: number;
  statusText?: string;
  error?: string;
  entityId?: string;
}

export type DiscordChannelType = "novos_achados" | "novas_perdas" | "feedback";

export interface WebhookContextInfo {
  source: string;
  entityId?: string;
  entityTitle?: string;
}

/**
 * Resolves the Discord Webhook URL strictly on the server side using
 * Firebase configuration or environment variables.
 * Webhook URLs are never exposed in frontend bundles or client responses.
 */
export function getDiscordWebhookUrl(channel: DiscordChannelType): string {
  try {
    const functionsConfig =
      typeof (functions as any).config === "function" ? (functions as any).config() : null;

    if (channel === "novos_achados") {
      const configUrl =
        functionsConfig?.discord?.novos_achados_webhook_url ||
        functionsConfig?.discord?.webhook_url_novos_achados ||
        functionsConfig?.discord?.achados_webhook_url;
      if (configUrl && typeof configUrl === "string" && configUrl.trim()) {
        return configUrl.trim();
      }
      const envUrl =
        process.env.DISCORD_NOVOS_ACHADOS_WEBHOOK_URL ||
        process.env.DISCORD_WEBHOOK_URL_NOVOS_ACHADOS ||
        process.env.DISCORD_ACHADOS_WEBHOOK_URL;
      if (envUrl && typeof envUrl === "string" && envUrl.trim()) {
        return envUrl.trim();
      }
    }

    if (channel === "novas_perdas") {
      const configUrl =
        functionsConfig?.discord?.novas_perdas_webhook_url ||
        functionsConfig?.discord?.webhook_url_novas_perdas ||
        functionsConfig?.discord?.perdas_webhook_url;
      if (configUrl && typeof configUrl === "string" && configUrl.trim()) {
        return configUrl.trim();
      }
      const envUrl =
        process.env.DISCORD_NOVAS_PERDAS_WEBHOOK_URL ||
        process.env.DISCORD_WEBHOOK_URL_NOVAS_PERDAS ||
        process.env.DISCORD_PERDAS_WEBHOOK_URL;
      if (envUrl && typeof envUrl === "string" && envUrl.trim()) {
        return envUrl.trim();
      }
    }

    if (channel === "feedback") {
      const configUrl =
        functionsConfig?.discord?.feedback_webhook_url ||
        functionsConfig?.discord?.webhook_url_feedback ||
        functionsConfig?.discord?.webhook_url;
      if (configUrl && typeof configUrl === "string" && configUrl.trim()) {
        return configUrl.trim();
      }
      const envUrl =
        process.env.DISCORD_FEEDBACK_WEBHOOK_URL ||
        process.env.DISCORD_WEBHOOK_URL_FEEDBACK ||
        process.env.DISCORD_WEBHOOK_URL;
      if (envUrl && typeof envUrl === "string" && envUrl.trim()) {
        return envUrl.trim();
      }
    }
  } catch {
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
export async function sendDiscordWebhook(
  target: DiscordChannelType | string,
  payload: DiscordWebhookPayload | any,
  context: WebhookContextInfo = { source: "discord-service" }
): Promise<DiscordDispatchResult> {
  const isDirectUrl =
    typeof target === "string" && (target.startsWith("http://") || target.startsWith("https://"));

  const targetUrl = isDirectUrl ? target : getDiscordWebhookUrl(target as DiscordChannelType);
  const { source, entityId, entityTitle } = context;

  if (!targetUrl) {
    logger.info(
      `[DiscordWebhook Notice] [${source}] Webhook URL não configurada para '${target}'. Notificação ignorada silenciosamente.`,
      { entityId, entityTitle }
    );
    return {
      success: false,
      error: "WEBHOOK_URL_NOT_CONFIGURED",
      entityId,
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => "Sem corpo de resposta");
      logger.error(
        `[DiscordWebhook Error] [${source}] Discord API retornou HTTP ${response.status} (${response.statusText}):`,
        {
          source,
          status: response.status,
          statusText: response.statusText,
          responseBody: errText,
          entityId,
          entityTitle,
          timestamp: new Date().toISOString(),
        }
      );
      return {
        success: false,
        status: response.status,
        statusText: response.statusText,
        error: errText,
        entityId,
      };
    }

    logger.info(
      `[DiscordWebhook Success] [${source}] Notificação despachada com sucesso ao Discord.`,
      { entityId, entityTitle, status: response.status }
    );

    return {
      success: true,
      status: response.status,
      entityId,
    };
  } catch (error: any) {
    const isAbort = error?.name === "AbortError";
    const errorMessage = isAbort
      ? "Timeout de 10s excedido ao conectar com o Discord"
      : error?.message || String(error);

    logger.error(
      `[DiscordWebhook Error] [${source}] Falha de rede/execução ao despachar Webhook para o Discord:`,
      {
        source,
        errorMessage,
        errorName: error?.name,
        stack: error?.stack,
        entityId,
        entityTitle,
        timestamp: new Date().toISOString(),
      }
    );

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
export async function dispatchFoundItemWebhook(item: FoundItemPayload): Promise<DiscordDispatchResult> {
  if (item.type && item.type !== "ENCONTRADO") {
    logger.info(`[dispatchFoundItemWebhook] Item do tipo '${item.type}' ignorado para #novos-achados.`);
    return { success: false, error: "TYPE_NOT_ENCONTRADO" };
  }

  const payload = buildNovosAchadosEmbed(item);
  return sendDiscordWebhook("novos_achados", payload, {
    source: "novos-achados",
    entityId: item.id,
    entityTitle: item.title,
  });
}

/**
 * Dispatches a new lost item notification to '#novas-perdas'
 */
export async function dispatchLostItemWebhook(item: FoundItemPayload): Promise<DiscordDispatchResult> {
  if (item.type && item.type !== "PERDIDO") {
    logger.info(`[dispatchLostItemWebhook] Item do tipo '${item.type}' ignorado para #novas-perdas.`);
    return { success: false, error: "TYPE_NOT_PERDIDO" };
  }

  const payload = buildNovasPerdasEmbed(item);
  return sendDiscordWebhook("novas_perdas", payload, {
    source: "novas-perdas",
    entityId: item.id,
    entityTitle: item.title,
  });
}

/**
 * Helper to safely execute a Firestore trigger block with unified silent error logging.
 */
export async function executeFirestoreTriggerSafely(
  triggerName: string,
  docPath: string,
  handler: () => Promise<any>
): Promise<void> {
  try {
    await handler();
  } catch (error: any) {
    logger.error(`[${triggerName}] Exceção não tratada capturada durante o processamento do gatilho para '${docPath}':`, {
      triggerName,
      docPath,
      errorMessage: error?.message,
      stack: error?.stack,
      timestamp: new Date().toISOString(),
    });
  }
}
