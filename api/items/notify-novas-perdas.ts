function getDiscordNovasPerdasWebhookUrl(): string {
  return (
    process.env.DISCORD_NOVAS_PERDAS_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK_URL_NOVAS_PERDAS ||
    process.env.DISCORD_PERDAS_WEBHOOK_URL ||
    process.env.DISCORD_PERDAS_URL ||
    process.env.DISCORD_WEBHOOK_PERDAS ||
    ""
  ).trim();
}

function parseDateSafe(dateInput?: any): Date | null {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;
  if (typeof dateInput === "number") {
    const d = new Date(dateInput > 1e11 ? dateInput : dateInput * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof dateInput === "string") {
    const trimmed = dateInput.trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatBrtDate(dateInput?: any): string {
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

function formatBrtDateTime(dateInput?: any): string {
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

async function sendNovaPerdaToDiscord(item: any): Promise<boolean> {
  const webhookUrl = getDiscordNovasPerdasWebhookUrl();
  if (!webhookUrl) {
    console.info("[Discord Novas Perdas] Webhook não configurado nas variáveis de ambiente.");
    return false;
  }

  try {
    const sanitizedTitle = String(item.title || "Objeto Perdido").trim().substring(0, 200);
    const sanitizedDesc = String(item.description || "Nenhuma descrição detalhada fornecida.").trim().substring(0, 3900);
    const sanitizedLocation = String(item.location || "Campus Ivaiporã (Local não especificado)").trim().substring(0, 100);
    const sanitizedCategory = String(item.category || "Outros").trim().substring(0, 80);
    const sanitizedColor = item.color && item.color.trim() ? item.color.trim() : null;
    const sanitizedBrand = item.brand && item.brand.trim() ? item.brand.trim() : null;

    const dateFormatted = formatBrtDate(item.date);
    const createdAtFormatted = formatBrtDateTime(item.createdAt || item.updatedAt || new Date().toISOString());

    const fields: Array<{ name: string; value: string; inline?: boolean }> = [
      { name: "🏷️ Categoria", value: `**${sanitizedCategory}**`, inline: true },
      { name: "📍 Último Local Onde Foi Visto", value: sanitizedLocation, inline: true },
      { name: "📅 Data da Perda", value: `**${dateFormatted}**`, inline: true },
      { name: "📊 Status do Item", value: "🟡 **Perdido** *(Procura Ativa no Campus)*", inline: true },
    ];

    const rawRegistrar = item.registeredByName || item.userName || item.authorName;
    if (rawRegistrar && typeof rawRegistrar === "string" && rawRegistrar.trim()) {
      fields.push({
        name: "👤 Usuário Responsável pelo Cadastro",
        value: rawRegistrar.trim().substring(0, 100),
        inline: true,
      });
    }

    const rawProtocol = item.qrCodeId || item.protocolNumber || item.protocol || item.id;
    if (rawProtocol && typeof rawProtocol === "string" && rawProtocol.trim() && rawProtocol.trim().toUpperCase() !== "N/A") {
      fields.push({
        name: "📋 Número / Protocolo",
        value: `\`${rawProtocol.trim().substring(0, 80)}\``,
        inline: true,
      });
    }

    if (sanitizedColor || sanitizedBrand) {
      const parts = [
        sanitizedColor ? `Cor: **${sanitizedColor}**` : null,
        sanitizedBrand ? `Marca: **${sanitizedBrand}**` : null,
      ].filter(Boolean);
      fields.push({
        name: "🎨 Características Visuais",
        value: parts.join(" • ").substring(0, 1024),
        inline: false,
      });
    }

    fields.push({
      name: "🕐 Registro no Banco de Dados",
      value: createdAtFormatted,
      inline: false,
    });

    const embed: any = {
      title: `🔎 Novo Objeto Perdido Cadastrado: ${sanitizedTitle}`.substring(0, 256),
      description: sanitizedDesc,
      color: 0xf59e0b,
      fields,
      footer: {
        text: "IFPR Campus Ivaiporã • Central de Achados e Perdidos • Evento Registrado",
        icon_url: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/shield-check.png",
      },
      timestamp: new Date().toISOString(),
    };

    if (item.imageUrl && (item.imageUrl.startsWith("http://") || item.imageUrl.startsWith("https://"))) {
      embed.image = { url: item.imageUrl };
    }

    const discordPayload = {
      username: "IFPR Achados e Perdidos • #novas-perdas",
      avatar_url: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/search.png",
      embeds: [embed],
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(discordPayload),
    });

    return response.ok;
  } catch (err: any) {
    console.error("[Discord Novas Perdas Error]:", err?.message || err);
    return false;
  }
}

async function parseBody(req: any): Promise<any> {
  if (req.body) {
    if (typeof req.body === "string") {
      try { return JSON.parse(req.body); } catch { return {}; }
    }
    if (typeof req.body === "object") return req.body;
  }
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk: any) => { raw += chunk; });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
    req.on("error", () => resolve({}));
  });
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed. Use POST." });

  try {
    const body = await parseBody(req);
    const item = body?.item || body;
    if (!item || !item.title) {
      return res.status(400).json({ success: false, error: "Dados do item ausentes ou incompletos." });
    }

    const normalizedType = String(item?.type || "").toUpperCase().trim();
    if (normalizedType !== "PERDIDO" && normalizedType !== "PERDA") {
      return res.status(200).json({
        success: true,
        message: `Item com tipo "${item?.type}" não é PERDIDO/PERDA. Ignorado para o canal #novas-perdas.`,
      });
    }

    const dispatched = await sendNovaPerdaToDiscord(item);
    return res.status(200).json({
      success: true,
      message: "Notificação de nova perda processada.",
      itemId: item.id,
      discordDispatched: dispatched,
    });
  } catch (error: any) {
    console.error("[notify-novas-perdas API Error]:", error);
    return res.status(500).json({ success: false, error: error?.message || "Erro ao processar notificação." });
  }
}
