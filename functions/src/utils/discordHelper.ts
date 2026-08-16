import * as functions from "firebase-functions";

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
  image?: {
    url: string;
  };
  thumbnail?: {
    url: string;
  };
}

export interface DiscordWebhookPayload {
  username: string;
  avatar_url?: string;
  embeds: DiscordEmbed[];
}

export interface ItemData {
  id?: string;
  title?: string;
  category?: string;
  type?: "PERDIDO" | "ENCONTRADO" | string;
  status?: string;
  description?: string;
  color?: string;
  brand?: string;
  location?: string;
  date?: string;
  imageUrl?: string;
  qrCodeId?: string;
  registeredByName?: string;
  registeredByRole?: string;
  registeredByUserId?: string;
  createdAt?: string;
  contactInfo?: string;
  [key: string]: any;
}

/**
 * Dynamic color mapping based on item status and type
 */
export const STATUS_COLORS = {
  // Statuses for Found/Custody items
  SOB_CUSTODIA: 0x10b981,     // Emerald Green (Ativo / Sob custódia no campus)
  GUARDADO: 0x10b981,         // Emerald Green
  AGUARDANDO_RETIRADA: 0x10b981, // Emerald Green
  
  // Statuses for Returned/Delivered items
  DEVOLVIDO: 0x3b82f6,        // Blue (Entregue com sucesso ao dono)
  RETIRADO: 0x3b82f6,         // Blue
  CONCLUIDO: 0x3b82f6,        // Blue
  
  // Statuses for Lost items / Claims
  PERDIDO: 0xf59e0b,          // Amber / Orange (Objeto perdido em busca)
  EM_ANALISE: 0x8b5cf6,       // Purple (Reivindicação sob análise)
  AGUARDANDO_COMPROVACAO: 0x8b5cf6, // Purple
  
  // Cancelled or Expired
  CANCELADO: 0xef4444,        // Red
  DESCARTADO: 0x6b7280,       // Neutral Slate
  DOADO: 0x6366f1,            // Indigo
  
  // Defaults
  DEFAULT_FOUND: 0x10b981,    // Emerald Green
  DEFAULT_LOST: 0xf59e0b,     // Amber
  DEFAULT_FALLBACK: 0x059669, // Institutional Green
};

/**
 * Human-readable status mapping with visual badge and icon
 */
export const STATUS_LABELS: Record<string, { label: string; icon: string }> = {
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
export const CATEGORY_MAP: Record<string, { label: string; icon: string; badge: string }> = {
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
export function getStatusColor(status?: string, type?: string): number {
  if (!status && type === "PERDIDO") return STATUS_COLORS.PERDIDO;
  if (!status) return STATUS_COLORS.DEFAULT_FOUND;

  const normalized = status.toUpperCase().trim().replace(/[\s-]/g, "_");
  if (normalized in STATUS_COLORS) {
    return (STATUS_COLORS as Record<string, number>)[normalized];
  }

  if (type === "PERDIDO") {
    return STATUS_COLORS.DEFAULT_LOST;
  }

  return STATUS_COLORS.DEFAULT_FOUND;
}

/**
 * Returns human-readable label with emoji icon for status
 */
export function getStatusLabel(status?: string, type?: string): string {
  if (!status && type === "PERDIDO") return "🟡 Perdido (Procura Ativa)";
  if (!status) return "🟢 Sob Custódia (Aguardando Retirada)";

  const normalized = status.toUpperCase().trim().replace(/[\s-]/g, "_");
  const found = STATUS_LABELS[normalized];
  if (found) {
    return `${found.icon} ${found.label}`;
  }

  return `🔹 ${status}`;
}

/**
 * Returns category info with label and icon
 */
export function getCategoryMeta(category?: string) {
  if (!category) {
    return { label: "Outros Objetos", icon: "📦", badge: "Outros" };
  }
  const key = category.toLowerCase().trim().replace(/[\s-]/g, "_");
  return CATEGORY_MAP[key] || {
    label: category,
    icon: "📦",
    badge: category,
  };
}

/**
 * Sanitizes and masks personal identifiable information (PII)
 */
export function sanitizePii(text?: string | null): string {
  if (!text) return "";
  let clean = String(text).trim();

  // Mask emails (e.g. p***o@ifpr.edu.br)
  clean = clean.replace(/([a-zA-Z0-9_\-.+]+)@([a-zA-Z0-9_\-.]+)/g, (_match, user, domain) => {
    if (user.length <= 2) return `${user[0]}*@${domain}`;
    const masked = `${user[0]}${"*".repeat(Math.max(1, user.length - 2))}${user[user.length - 1]}`;
    return `${masked}@${domain}`;
  });

  // Mask CPF or Brazilian national ID patterns
  clean = clean.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "***.***.***-**");

  return clean;
}

/**
 * Formats date into Brazilian Standard Time (BRT)
 */
export function formatBrtDate(dateStr?: string | null): string {
  if (!dateStr) return "Data não informada";
  try {
    const parsed = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T12:00:00Z`);
    if (isNaN(parsed.getTime())) return String(dateStr);
    return parsed.toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return String(dateStr);
  }
}

/**
 * Formats full timestamp into Brazilian Standard Time with hour and minute
 */
export function formatBrtDateTime(dateStr?: string | null): string {
  if (!dateStr) return "Momento do registro";
  try {
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) return String(dateStr);
    return parsed.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(dateStr);
  }
}

/**
 * Formats item data into a professional, color-coded, sanitized Discord Embed.
 * Encapsulated in safe error handling with functions.logger.error.
 */
export function formatItemToDiscordEmbed(item: ItemData): DiscordWebhookPayload {
  try {
    const isFound = item.type !== "PERDIDO";
    const typeLabel = isFound ? "Achado" : "Objeto Perdido";
    const titlePrefix = isFound ? "📦 Novo Achado Registrado" : "🔍 Alerta de Objeto Perdido";

    const sanitizedTitle = sanitizePii(item.title || "Objeto").substring(0, 200);
    const rawDesc = item.description || "Nenhuma descrição detalhada informada.";
    const sanitizedDesc = sanitizePii(rawDesc).substring(0, 3800);
    const sanitizedLocation = sanitizePii(item.location || "Campus Ivaiporã").substring(0, 100);
    
    const categoryInfo = getCategoryMeta(item.category);
    const protocol = (item.qrCodeId || item.id || "N/A").toString().trim().substring(0, 80);
    
    const registrarName = sanitizePii(item.registeredByName || "Comunidade Acadêmica do IFPR").substring(0, 100);
    const roleLabel = item.registeredByRole ? ` (${item.registeredByRole})` : "";
    const registrarDisplay = `${registrarName}${roleLabel}`;

    const eventDateFormatted = formatBrtDate(item.date);
    const createdAtFormatted = formatBrtDateTime(item.createdAt || new Date().toISOString());
    const embedColor = getStatusColor(item.status, item.type);
    const statusDisplay = getStatusLabel(item.status, item.type);

    const fields: DiscordEmbedField[] = [
      {
        name: "🏷️ Categoria",
        value: `${categoryInfo.icon} ${categoryInfo.label}`,
        inline: true,
      },
      {
        name: isFound ? "📍 Local Encontrado" : "📍 Local Provável da Perda",
        value: sanitizedLocation,
        inline: true,
      },
      {
        name: isFound ? "📅 Data do Achado" : "📅 Data da Perda",
        value: eventDateFormatted,
        inline: true,
      },
      {
        name: "👤 Registrado Por",
        value: registrarDisplay,
        inline: true,
      },
      {
        name: "📋 Protocolo / ID",
        value: `\`${protocol}\``,
        inline: true,
      },
      {
        name: "📊 Status Atual",
        value: statusDisplay,
        inline: true,
      },
    ];

    // Optional visual characteristics
    const visualDetails: string[] = [];
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
      name: "🕐 Data e Hora do Cadastro",
      value: createdAtFormatted,
      inline: false,
    });

    const embed: DiscordEmbed = {
      title: `${titlePrefix}: ${sanitizedTitle}`.substring(0, 256),
      description: sanitizedDesc,
      color: embedColor,
      fields,
      footer: {
        text: "IFPR Campus Ivaiporã • Central de Achados e Perdidos",
        icon_url: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/shield-check.png",
      },
      timestamp: item.createdAt || new Date().toISOString(),
    };

    // Include image URL only if valid HTTP/HTTPS URL
    if (item.imageUrl && (item.imageUrl.startsWith("http://") || item.imageUrl.startsWith("https://"))) {
      embed.image = { url: item.imageUrl };
    }

    return {
      username: isFound
        ? "IFPR Achados e Perdidos • #novos-achados"
        : "IFPR Achados e Perdidos • #novas-perdas",
      avatar_url: isFound
        ? "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/package-search.png"
        : "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/search.png",
      embeds: [embed],
    };
  } catch (error: any) {
    functions.logger.error("[discordHelper Error] Falha ao formatar Discord Embed para o item:", {
      itemId: item?.id,
      itemTitle: item?.title,
      errorMessage: error?.message,
      stack: error?.stack,
    });

    // Fallback safe embed so notification payload is never totally broken
    return {
      username: item?.type === "PERDIDO" ? "IFPR Achados e Perdidos • #novas-perdas" : "IFPR Achados e Perdidos",
      embeds: [
        {
          title: `📦 Objeto Registrado: ${String(item?.title || "Item").substring(0, 200)}`,
          description: String(item?.description || "Registro no sistema IFPR.").substring(0, 1000),
          color: item?.type === "PERDIDO" ? STATUS_COLORS.PERDIDO : STATUS_COLORS.DEFAULT_FOUND,
          fields: [
            {
              name: "📋 Protocolo",
              value: `\`${item?.qrCodeId || item?.id || "N/A"}\``,
              inline: true,
            },
            {
              name: "📍 Local",
              value: String(item?.location || "Campus Ivaiporã"),
              inline: true,
            },
          ],
          footer: {
            text: "IFPR Campus Ivaiporã • Central de Achados e Perdidos",
          },
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }
}

/**
 * Dedicated function to format new lost items for the #novas-perdas channel
 */
export function formatNovasPerdasDiscordEmbed(item: ItemData): DiscordWebhookPayload {
  return formatItemToDiscordEmbed({
    ...item,
    type: "PERDIDO",
  });
}

