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
 * Safely parses any date input (string, ISO, YYYY-MM-DD, timestamp, Firestore Timestamp) to a Date object.
 */
export function parseDateSafe(dateInput?: any): Date | null {
  if (!dateInput) return null;
  if (dateInput instanceof Date) {
    return isNaN(dateInput.getTime()) ? null : dateInput;
  }
  // Handle Firestore Timestamp objects ({ seconds, nanoseconds } or { _seconds, _nanoseconds })
  if (typeof dateInput === "object") {
    if (typeof dateInput.toDate === "function") {
      try {
        const d = dateInput.toDate();
        if (d instanceof Date && !isNaN(d.getTime())) return d;
      } catch {
        // Fall through
      }
    }
    const secs = typeof dateInput.seconds === "number" ? dateInput.seconds : dateInput._seconds;
    if (typeof secs === "number") {
      const d = new Date(secs * 1000);
      if (!isNaN(d.getTime())) return d;
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
    if (!trimmed) return null;
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
 * Formats ISO or date strings into Brazilian Standard Time (BRT - America/Sao_Paulo)
 */
export function formatToBrtDate(dateInput?: any): string {
  const parsed = parseDateSafe(dateInput);
  if (!parsed) return typeof dateInput === "string" && dateInput ? dateInput : "Data não informada";
  try {
    return parsed.toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return String(dateInput);
  }
}

/**
 * Formats full timestamp into Brazilian Standard Time with hours and minutes
 */
export function formatToBrtDateTime(dateInput?: any): string {
  const parsed = parseDateSafe(dateInput);
  if (!parsed) return typeof dateInput === "string" && dateInput ? dateInput : "Momento do registro";
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
  } catch {
    return String(dateInput);
  }
}

/**
 * Returns a valid ISO 8601 string for the Discord embed timestamp from database event time
 */
export function getIsoDatabaseTimestamp(createdAt?: any, updatedAt?: any): string {
  const parsed = parseDateSafe(createdAt) || parseDateSafe(updatedAt);
  if (parsed) {
    return parsed.toISOString();
  }
  return new Date().toISOString();
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

  const eventDateFormatted = formatToBrtDate(item.date);
  const createdAtFormatted = formatToBrtDateTime(item.createdAt || item.updatedAt || new Date().toISOString());
  const databaseIsoTimestamp = getIsoDatabaseTimestamp(item.createdAt, item.updatedAt);

  // Mandatory structured fields: Category, Location, Date, Status
  const fields: DiscordEmbedField[] = [
    {
      name: "🏷️ Categoria",
      value: `${categoryInfo.icon} **${categoryInfo.label}**`,
      inline: true,
    },
    {
      name: "📍 Local onde foi Encontrado",
      value: sanitizedLocation,
      inline: true,
    },
    {
      name: "📅 Data do Achado",
      value: `**${eventDateFormatted}**`,
      inline: true,
    },
    {
      name: "📊 Status do Item",
      value: "🟢 **Sob Custódia** *(Aguardando Retirada)*",
      inline: true,
    },
  ];

  // Extrai e formata o nome do usuário SOMENTE se estiver presente no registro
  const rawRegistrar = item.registeredByName || item.userName || item.authorName || item.createdByName;
  if (rawRegistrar && typeof rawRegistrar === "string" && rawRegistrar.trim()) {
    const cleanRegistrar = sanitizePii(rawRegistrar.trim()).substring(0, 100);
    const roleLabel = item.registeredByRole && typeof item.registeredByRole === "string" && item.registeredByRole.trim()
      ? ` (${item.registeredByRole.trim()})`
      : "";
    fields.push({
      name: "👤 Registrado Por",
      value: `${cleanRegistrar}${roleLabel}`,
      inline: true,
    });
  }

  // Extrai e formata o número do protocolo SOMENTE se estiver presente no registro
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
  const visualDetails: string[] = [];
  if (item.color && typeof item.color === "string" && item.color.trim()) {
    visualDetails.push(`Cor: **${sanitizePii(item.color.trim())}**`);
  }
  if (item.brand && typeof item.brand === "string" && item.brand.trim()) {
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

  const embed: DiscordEmbed = {
    title: `📦 Novo Achado Registrado: ${sanitizedTitle}`.substring(0, 256),
    description: sanitizedDesc,
    color: DISCORD_THEME_COLORS.NEW_FOUND_ITEM,
    fields,
    footer: {
      text: "IFPR Campus Ivaiporã • Central de Achados e Perdidos • Evento Registrado",
      icon_url: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/shield-check.png",
    },
    timestamp: databaseIsoTimestamp,
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

/**
 * Formats a newly created lost item report (Perda) into a sanitized, professional Discord Webhook Payload for #novas-perdas
 */
export function buildNovasPerdasEmbed(item: FoundItemPayload): DiscordWebhookPayload {
  const sanitizedTitle = sanitizePii(item.title || "Objeto Perdido").substring(0, 200);
  const rawDesc = item.description || "Nenhuma descrição fornecida.";
  const sanitizedDesc = sanitizePii(rawDesc).substring(0, 3800);
  const sanitizedLocation = sanitizePii(item.location || "Campus Ivaiporã (Local não especificado)").substring(0, 100);
  const categoryKey = (item.category || "outros").toLowerCase().trim();
  const categoryInfo = ITEM_CATEGORY_MAP[categoryKey] || {
    label: item.category || "Outros",
    icon: "📦",
    badge: item.category || "Perda",
  };

  const eventDateFormatted = formatToBrtDate(item.date);
  const createdAtFormatted = formatToBrtDateTime(item.createdAt || item.updatedAt || new Date().toISOString());
  const databaseIsoTimestamp = getIsoDatabaseTimestamp(item.createdAt, item.updatedAt);

  // Mandatory structured fields: Category, Location, Date, Status
  const fields: DiscordEmbedField[] = [
    {
      name: "🏷️ Categoria",
      value: `${categoryInfo.icon} **${categoryInfo.label}**`,
      inline: true,
    },
    {
      name: "📍 Último Local Onde Foi Visto",
      value: sanitizedLocation,
      inline: true,
    },
    {
      name: "📅 Data da Perda",
      value: `**${eventDateFormatted}**`,
      inline: true,
    },
    {
      name: "📊 Status do Item",
      value: "🟡 **Perdido** *(Procura Ativa no Campus)*",
      inline: true,
    },
  ];

  // Extrai e formata o nome do usuário SOMENTE se estiver presente no registro
  const rawRegistrar = item.registeredByName || item.userName || item.authorName || item.createdByName;
  if (rawRegistrar && typeof rawRegistrar === "string" && rawRegistrar.trim()) {
    const cleanRegistrar = sanitizePii(rawRegistrar.trim()).substring(0, 100);
    const roleLabel = item.registeredByRole && typeof item.registeredByRole === "string" && item.registeredByRole.trim()
      ? ` (${item.registeredByRole.trim()})`
      : "";
    fields.push({
      name: "👤 Usuário Responsável pelo Cadastro",
      value: `${cleanRegistrar}${roleLabel}`,
      inline: true,
    });
  }

  // Extrai e formata o número do protocolo SOMENTE se estiver presente no registro
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
  const visualDetails: string[] = [];
  if (item.color && typeof item.color === "string" && item.color.trim()) {
    visualDetails.push(`Cor: **${sanitizePii(item.color.trim())}**`);
  }
  if (item.brand && typeof item.brand === "string" && item.brand.trim()) {
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

  const embed: DiscordEmbed = {
    title: `🔎 Novo Objeto Perdido Registrado: ${sanitizedTitle}`.substring(0, 256),
    description: sanitizedDesc,
    color: DISCORD_THEME_COLORS.LOST_ITEM, // Amber 0xf59e0b
    fields,
    footer: {
      text: "IFPR Campus Ivaiporã • Central de Achados e Perdidos • Evento Registrado",
      icon_url: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/shield-check.png",
    },
    timestamp: databaseIsoTimestamp,
  };

  // Safe HTTP/HTTPS image URL inclusion
  if (item.imageUrl && (item.imageUrl.startsWith("http://") || item.imageUrl.startsWith("https://"))) {
    embed.image = { url: item.imageUrl };
  }

  return {
    username: "IFPR Achados e Perdidos • #novas-perdas",
    avatar_url: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/search.png",
    embeds: [embed],
  };
}

