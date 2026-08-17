"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CATEGORY_MAP = exports.STATUS_LABELS = exports.STATUS_COLORS = void 0;
exports.getStatusColor = getStatusColor;
exports.getStatusLabel = getStatusLabel;
exports.getCategoryMeta = getCategoryMeta;
exports.sanitizePii = sanitizePii;
exports.parseDateSafe = parseDateSafe;
exports.formatBrtDate = formatBrtDate;
exports.formatBrtDateTime = formatBrtDateTime;
exports.getIsoDatabaseTimestamp = getIsoDatabaseTimestamp;
exports.formatItemToDiscordEmbed = formatItemToDiscordEmbed;
exports.formatNovasPerdasDiscordEmbed = formatNovasPerdasDiscordEmbed;
const functions = require("firebase-functions");
/**
 * Dynamic color mapping based on item status and type
 */
exports.STATUS_COLORS = {
    // Statuses for Found/Custody items
    SOB_CUSTODIA: 0x10b981, // Emerald Green (Ativo / Sob custódia no campus)
    GUARDADO: 0x10b981, // Emerald Green
    AGUARDANDO_RETIRADA: 0x10b981, // Emerald Green
    // Statuses for Returned/Delivered items
    DEVOLVIDO: 0x3b82f6, // Blue (Entregue com sucesso ao dono)
    RETIRADO: 0x3b82f6, // Blue
    CONCLUIDO: 0x3b82f6, // Blue
    // Statuses for Lost items / Claims
    PERDIDO: 0xf59e0b, // Amber / Orange (Objeto perdido em busca)
    EM_ANALISE: 0x8b5cf6, // Purple (Reivindicação sob análise)
    AGUARDANDO_COMPROVACAO: 0x8b5cf6, // Purple
    // Cancelled or Expired
    CANCELADO: 0xef4444, // Red
    DESCARTADO: 0x6b7280, // Neutral Slate
    DOADO: 0x6366f1, // Indigo
    // Defaults
    DEFAULT_FOUND: 0x10b981, // Emerald Green
    DEFAULT_LOST: 0xf59e0b, // Amber
    DEFAULT_FALLBACK: 0x059669, // Institutional Green
};
/**
 * Human-readable status mapping with visual badge and icon
 */
exports.STATUS_LABELS = {
    SOB_CUSTODIA: { label: "Sob Custódia (Aguardando Retirada)", icon: "🟢" },
    GUARDADO: { label: "Sob Custódia (Aguardando Retirada)", icon: "🟢" },
    AGUARDANDO_RETIRADA: { label: "Aguardando Retirada", icon: "🟢" },
    DEVOLVIDO: { label: "Devolvido ao Proprietário", icon: "🔵" },
    RETIRADO: { label: "Retirado / Devolvido", icon: "🔵" },
    CONCLUIDO: { label: "Processo Concluído", icon: "🔵" },
    PERDIDO: { label: "Perdido (Procura Ativa)", icon: "🟡" },
    EM_ANALISE: { label: "Reivindicação em Análise", icon: "🟣" },
    AGUARDANDO_COMPROVACAO: { label: "Aguardando Comprovação", icon: "🟣" },
    CANCELADO: { label: "Registro Cancelado", icon: "🔴" },
    DOADO: { label: "Destinado a Doação", icon: "📦" },
    DESCARTADO: { label: "Descartado Conforme Edital", icon: "⚪" },
};
/**
 * Standardized category metadata mapping
 */
exports.CATEGORY_MAP = {
    eletronicos: { label: "Eletrônicos & Acessórios", icon: "📱", badge: "Eletrônicos" },
    documentos: { label: "Documentos & Cartões", icon: "💳", badge: "Documentos" },
    vestuario: { label: "Vestuário & Agasalhos", icon: "🧥", badge: "Vestuário" },
    acessorios: { label: "Acessórios Pessoais", icon: "👓", badge: "Acessórios" },
    chaves: { label: "Chaves & Chaveiros", icon: "🔑", badge: "Chaves" },
    material_escolar: { label: "Material Escolar & Livros", icon: "📚", badge: "Material Escolar" },
    garrafas: { label: "Garrafas & Copos Térmicos", icon: "🧴", badge: "Garrafas/Copos" },
    outros: { label: "Outros Objetos", icon: "📦", badge: "Outros" },
};
/**
 * Returns the dynamic Discord color based on item status and type
 */
function getStatusColor(status, type) {
    if (!status && type === "PERDIDO")
        return exports.STATUS_COLORS.PERDIDO;
    if (!status)
        return exports.STATUS_COLORS.DEFAULT_FOUND;
    const normalized = status.toUpperCase().trim().replace(/[\s-]/g, "_");
    if (normalized in exports.STATUS_COLORS) {
        return exports.STATUS_COLORS[normalized];
    }
    if (type === "PERDIDO") {
        return exports.STATUS_COLORS.DEFAULT_LOST;
    }
    return exports.STATUS_COLORS.DEFAULT_FOUND;
}
/**
 * Returns human-readable label with emoji icon for status
 */
function getStatusLabel(status, type) {
    if (!status && type === "PERDIDO")
        return "🟡 Perdido (Procura Ativa)";
    if (!status)
        return "🟢 Sob Custódia (Aguardando Retirada)";
    const normalized = status.toUpperCase().trim().replace(/[\s-]/g, "_");
    const found = exports.STATUS_LABELS[normalized];
    if (found) {
        return `${found.icon} ${found.label}`;
    }
    return `🔹 ${status}`;
}
/**
 * Returns category info with label and icon
 */
function getCategoryMeta(category) {
    if (!category) {
        return { label: "Outros Objetos", icon: "📦", badge: "Outros" };
    }
    const key = category.toLowerCase().trim().replace(/[\s-]/g, "_");
    return exports.CATEGORY_MAP[key] || {
        label: category,
        icon: "📦",
        badge: category,
    };
}
/**
 * Sanitizes and masks personal identifiable information (PII)
 */
function sanitizePii(text) {
    if (!text)
        return "";
    let clean = String(text).trim();
    // Mask emails (e.g. p***o@ifpr.edu.br)
    clean = clean.replace(/([a-zA-Z0-9_\-.+]+)@([a-zA-Z0-9_\-.]+)/g, (_match, user, domain) => {
        if (user.length <= 2)
            return `${user[0]}*@${domain}`;
        const masked = `${user[0]}${"*".repeat(Math.max(1, user.length - 2))}${user[user.length - 1]}`;
        return `${masked}@${domain}`;
    });
    // Mask CPF or Brazilian national ID patterns
    clean = clean.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "***.***.***-**");
    return clean;
}
/**
 * Safely parses any date input (string, ISO, YYYY-MM-DD, timestamp, Firestore Timestamp) to a Date object.
 */
function parseDateSafe(dateInput) {
    if (!dateInput)
        return null;
    if (dateInput instanceof Date) {
        return isNaN(dateInput.getTime()) ? null : dateInput;
    }
    // Handle Firestore Timestamp objects ({ seconds, nanoseconds } or { _seconds, _nanoseconds })
    if (typeof dateInput === "object") {
        if (typeof dateInput.toDate === "function") {
            try {
                const d = dateInput.toDate();
                if (d instanceof Date && !isNaN(d.getTime()))
                    return d;
            }
            catch {
                // Fall through
            }
        }
        const secs = typeof dateInput.seconds === "number" ? dateInput.seconds : dateInput._seconds;
        if (typeof secs === "number") {
            const d = new Date(secs * 1000);
            if (!isNaN(d.getTime()))
                return d;
        }
    }
    // Handle numeric epoch timestamps
    if (typeof dateInput === "number") {
        const d = new Date(dateInput > 1e11 ? dateInput : dateInput * 1000);
        return isNaN(d.getTime()) ? null : d;
    }
    // Handle strings
    if (typeof dateInput === "string") {
        const trimmed = dateInput.trim();
        if (!trimmed)
            return null;
        // YYYY-MM-DD format: treat as noon UTC to avoid local timezone off-by-one shifts
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            const parts = trimmed.split("-");
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
            return isNaN(d.getTime()) ? null : d;
        }
        const d = new Date(trimmed);
        return isNaN(d.getTime()) ? null : d;
    }
    return null;
}
/**
 * Formats date into Brazilian Standard Time (BRT) - e.g. "16/08/2026"
 */
function formatBrtDate(dateInput) {
    const parsed = parseDateSafe(dateInput);
    if (!parsed)
        return typeof dateInput === "string" && dateInput ? dateInput : "Data não informada";
    try {
        return parsed.toLocaleDateString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });
    }
    catch {
        return String(dateInput);
    }
}
/**
 * Formats full timestamp into Brazilian Standard Time with hour and minute - e.g. "16/08/2026 às 14:30"
 */
function formatBrtDateTime(dateInput) {
    const parsed = parseDateSafe(dateInput);
    if (!parsed)
        return typeof dateInput === "string" && dateInput ? dateInput : "Momento do registro";
    try {
        const datePart = parsed.toLocaleDateString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });
        const timePart = parsed.toLocaleTimeString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            hour: "2-digit",
            minute: "2-digit",
        });
        return `${datePart} às ${timePart} (BRT)`;
    }
    catch {
        return String(dateInput);
    }
}
/**
 * Returns a valid ISO 8601 string for the Discord embed timestamp from database event time
 */
function getIsoDatabaseTimestamp(createdAt, updatedAt) {
    const parsed = parseDateSafe(createdAt) || parseDateSafe(updatedAt);
    if (parsed) {
        return parsed.toISOString();
    }
    return new Date().toISOString();
}
/**
 * Formats item data into a professional, color-coded, sanitized Discord Embed.
 * Encapsulated in safe error handling with functions.logger.error.
 */
function formatItemToDiscordEmbed(item) {
    try {
        const isLost = item.type === "PERDIDO";
        const titlePrefix = isLost ? "🔍 Objeto Perdido Cadastrado" : "📦 Novo Achado Registrado";
        const sanitizedTitle = sanitizePii(item.title || (isLost ? "Objeto Perdido" : "Objeto Encontrado")).substring(0, 200);
        const rawDesc = item.description || "Nenhuma descrição detalhada informada.";
        const sanitizedDesc = sanitizePii(rawDesc).substring(0, 3800);
        const sanitizedLocation = sanitizePii(item.location || (isLost ? "Local não especificado (Campus Ivaiporã)" : "Campus Ivaiporã")).substring(0, 100);
        const categoryInfo = getCategoryMeta(item.category);
        const eventDateFormatted = formatBrtDate(item.date);
        const createdAtFormatted = formatBrtDateTime(item.createdAt || item.updatedAt || new Date().toISOString());
        const embedColor = getStatusColor(item.status, item.type);
        const statusDisplay = getStatusLabel(item.status, item.type);
        const databaseIsoTimestamp = getIsoDatabaseTimestamp(item.createdAt, item.updatedAt);
        // Primary structured fields: Category, Last Seen / Found Location, Date Lost / Found, Item Status
        const fields = [
            {
                name: "🏷️ Categoria",
                value: `${categoryInfo.icon} **${categoryInfo.label}**`,
                inline: true,
            },
            {
                name: isLost ? "📍 Último Local Onde Foi Visto" : "📍 Local Encontrado",
                value: sanitizedLocation,
                inline: true,
            },
            {
                name: isLost ? "📅 Data da Perda" : "📅 Data do Achado",
                value: `**${eventDateFormatted}**`,
                inline: true,
            },
            {
                name: "📊 Status do Item",
                value: `**${statusDisplay}**`,
                inline: true,
            },
        ];
        // Safely extract and format User / Registrar name ONLY if present
        const rawRegistrar = item.registeredByName || item.userName || item.authorName || item.createdByName;
        if (rawRegistrar && typeof rawRegistrar === "string" && rawRegistrar.trim()) {
            const cleanRegistrar = sanitizePii(rawRegistrar.trim()).substring(0, 100);
            const roleLabel = item.registeredByRole && typeof item.registeredByRole === "string" && item.registeredByRole.trim()
                ? ` (${item.registeredByRole.trim()})`
                : "";
            fields.push({
                name: isLost ? "👤 Usuário Responsável pelo Cadastro" : "👤 Registrado Por",
                value: `${cleanRegistrar}${roleLabel}`,
                inline: true,
            });
        }
        // Safely extract and format Protocol number ONLY if present in the document
        const rawProtocol = item.qrCodeId || item.protocolNumber || item.protocol || item.id;
        if (rawProtocol && typeof rawProtocol === "string" && rawProtocol.trim() && rawProtocol.trim().toUpperCase() !== "N/A") {
            const cleanProtocol = rawProtocol.trim().substring(0, 80);
            fields.push({
                name: "📋 Número / Protocolo",
                value: `\`${cleanProtocol}\``,
                inline: true,
            });
        }
        // Optional visual characteristics
        const visualDetails = [];
        if (item.color && item.color.trim()) {
            visualDetails.push(`Cor: **${sanitizePii(item.color.trim())}**`);
        }
        if (item.brand && item.brand.trim()) {
            visualDetails.push(`Marca/Modelo: **${sanitizePii(item.brand.trim())}**`);
        }
        if (visualDetails.length > 0) {
            fields.push({
                name: "🎨 Características Visuais",
                value: visualDetails.join(" • ").substring(0, 1024),
                inline: false,
            });
        }
        fields.push({
            name: "🕐 Registro no Banco de Dados",
            value: createdAtFormatted,
            inline: false,
        });
        const embed = {
            title: `${titlePrefix}: ${sanitizedTitle}`.substring(0, 256),
            description: sanitizedDesc,
            color: embedColor,
            fields,
            footer: {
                text: "IFPR Campus Ivaiporã • Central de Achados e Perdidos • Evento Registrado",
                icon_url: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/shield-check.png",
            },
            timestamp: databaseIsoTimestamp,
        };
        // Include image URL only if valid HTTP/HTTPS URL
        if (item.imageUrl && (item.imageUrl.startsWith("http://") || item.imageUrl.startsWith("https://"))) {
            embed.image = { url: item.imageUrl };
        }
        return {
            username: isLost
                ? "IFPR Achados e Perdidos • #novas-perdas"
                : "IFPR Achados e Perdidos • #novos-achados",
            avatar_url: isLost
                ? "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/search.png"
                : "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/package-search.png",
            embeds: [embed],
        };
    }
    catch (error) {
        functions.logger.error("[discordHelper Error] Falha ao formatar Discord Embed para o item:", {
            itemId: item?.id,
            itemTitle: item?.title,
            errorMessage: error?.message,
            stack: error?.stack,
        });
        // Fallback safe embed so notification payload is never totally broken
        const fallbackIso = getIsoDatabaseTimestamp(item?.createdAt, item?.updatedAt);
        return {
            username: item?.type === "PERDIDO" ? "IFPR Achados e Perdidos • #novas-perdas" : "IFPR Achados e Perdidos",
            embeds: [
                {
                    title: `📦 Objeto Registrado: ${String(item?.title || "Item").substring(0, 200)}`,
                    description: String(item?.description || "Registro no sistema IFPR.").substring(0, 1000),
                    color: item?.type === "PERDIDO" ? exports.STATUS_COLORS.PERDIDO : exports.STATUS_COLORS.DEFAULT_FOUND,
                    fields: [
                        {
                            name: "🏷️ Categoria",
                            value: String(item?.category || "Outros"),
                            inline: true,
                        },
                        {
                            name: "📍 Local",
                            value: String(item?.location || "Campus Ivaiporã"),
                            inline: true,
                        },
                        {
                            name: "📅 Data",
                            value: formatBrtDate(item?.date),
                            inline: true,
                        },
                        {
                            name: "📊 Status",
                            value: getStatusLabel(item?.status, item?.type),
                            inline: true,
                        },
                        {
                            name: "📋 Protocolo",
                            value: `\`${item?.qrCodeId || item?.id || "N/A"}\``,
                            inline: true,
                        },
                    ],
                    footer: {
                        text: "IFPR Campus Ivaiporã • Central de Achados e Perdidos • Evento Registrado",
                    },
                    timestamp: fallbackIso,
                },
            ],
        };
    }
}
/**
 * Dedicated function to format new lost items for the #novas-perdas channel
 */
function formatNovasPerdasDiscordEmbed(item) {
    return formatItemToDiscordEmbed({
        ...item,
        type: "PERDIDO",
    });
}
//# sourceMappingURL=discordHelper.js.map