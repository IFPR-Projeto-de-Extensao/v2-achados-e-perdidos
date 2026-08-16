/**
 * Discord Embed Formatter & Sanitizer Helper Module
 * Standardizes Discord Embed creation for IFPR Achados e Perdidos system.
 * Includes category color mapping, timestamp localization (BRT), status labels,
 * and PII sanitization for user privacy.
 */

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

export interface FoundItemPayload {
  id: string;
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
 * Palette mapping for categories, status, and urgency
 */
export const DISCORD_THEME_COLORS = {
  NEW_FOUND_ITEM: 0x10b981, // Emerald Green (default for newly registered found items)
  LOST_ITEM: 0xf59e0b,       // Amber / Warning
  RETURNED_ITEM: 0x3b82f6,   // Blue / Success resolved
  UNDER_ANALYSIS: 0x8b5cf6,  // Purple
  TECH_BUG: 0xef4444,        // Red
  FEEDBACK: 0xf59e0b,        // Amber
  DEFAULT_ACCENT: 0x059669,  // Darker Emerald (IFPR institutional green)
};

/**
 * Category metadata mapping with visual icons and labels
 */
export const ITEM_CATEGORY_MAP: Record<string, { label: string; icon: string; badge: string }> = {
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
 * Sanitizes and masks personal identifiable information (PII) like emails or sensitive phone numbers
 */
export function sanitizePii(text?: string | null): string {
  if (!text) return "";
  let clean = String(text).trim();

  // Mask email addresses (e.g. j***o@estudante.ifpr.edu.br)
  clean = clean.replace(/([a-zA-Z0-9_\-.+]+)@([a-zA-Z0-9_\-.]+)/g, (_match, user, domain) => {
    if (user.length <= 2) return `${user[0]}*@${domain}`;
    const masked = `${user[0]}${"*".repeat(Math.max(1, user.length - 2))}${user[user.length - 1]}`;
    return `${masked}@${domain}`;
  });

  // Mask CPF or Brazilian national IDs if accidentally included
  clean = clean.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "***.***.***-**");

  return clean;
}

/**
 * Formats ISO or date strings into Brazilian Standard Time (BRT - America/Sao_Paulo)
 */
export function formatToBrtDate(dateStr?: string | null): string {
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
 * Formats full timestamp into Brazilian Standard Time with hours and minutes
 */
export function formatToBrtDateTime(dateStr?: string | null): string {
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
 * Formats a newly created found item into a sanitized, professional Discord Webhook Payload
 */
export function buildNovosAchadosEmbed(item: FoundItemPayload): DiscordWebhookPayload {
  const sanitizedTitle = sanitizePii(item.title || "Objeto Encontrado").substring(0, 200);
  const rawDesc = item.description || "Nenhuma descrição fornecida.";
  const sanitizedDesc = sanitizePii(rawDesc).substring(0, 3800);
  const sanitizedLocation = sanitizePii(item.location || "Campus Ivaiporã").substring(0, 100);
  const categoryKey = (item.category || "outros").toLowerCase().trim();
  const categoryInfo = ITEM_CATEGORY_MAP[categoryKey] || {
    label: item.category || "Outros",
    icon: "📦",
    badge: item.category || "Achado",
  };

  const protocol = (item.qrCodeId || item.id || "N/A").toString().trim().substring(0, 80);
  const registrarName = sanitizePii(item.registeredByName || "Servidor/Aluno do IFPR").substring(0, 100);
  const roleLabel = item.registeredByRole ? ` (${item.registeredByRole})` : "";
  const registrarDisplay = `${registrarName}${roleLabel}`;

  const eventDateFormatted = formatToBrtDate(item.date);
  const createdAtFormatted = formatToBrtDateTime(item.createdAt || new Date().toISOString());

  const fields: DiscordEmbedField[] = [
    {
      name: "🏷️ Categoria",
      value: `${categoryInfo.icon} ${categoryInfo.label}`,
      inline: true,
    },
    {
      name: "📍 Local onde foi Encontrado",
      value: sanitizedLocation,
      inline: true,
    },
    {
      name: "📅 Data do Achado",
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
      name: "🟢 Status do Pertence",
      value: "🟢 **Sob Custódia** *(Aguardando Retirada)*",
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
    title: `📦 Novo Achado Registrado: ${sanitizedTitle}`.substring(0, 256),
    description: sanitizedDesc,
    color: DISCORD_THEME_COLORS.NEW_FOUND_ITEM,
    fields,
    footer: {
      text: "IFPR Campus Ivaiporã • Central de Achados e Perdidos",
      icon_url: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/shield-check.png",
    },
    timestamp: item.createdAt || new Date().toISOString(),
  };

  // Safe HTTP/HTTPS image URL inclusion
  if (item.imageUrl && (item.imageUrl.startsWith("http://") || item.imageUrl.startsWith("https://"))) {
    embed.image = { url: item.imageUrl };
  }

  return {
    username: "IFPR Achados e Perdidos • #novos-achados",
    avatar_url: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/package-search.png",
    embeds: [embed],
  };
}
