import { getAdminFirestore } from "../_lib/firebaseAdmin.js";
import { applySecurityHeaders } from "../_lib/securityHeaders.js";

function sanitizeBoundedParams(raw: unknown): Record<string, string | number | boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: Record<string, string | number | boolean> = {};
  let count = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= 20) break;
    const cleanKey = k.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 64);
    if (!cleanKey || cleanKey === "__proto__" || cleanKey === "constructor" || cleanKey === "prototype") continue;
    if (typeof v === "string") {
      result[cleanKey] = v.slice(0, 200);
      count++;
    } else if (typeof v === "number" && Number.isFinite(v)) {
      result[cleanKey] = v;
      count++;
    } else if (typeof v === "boolean") {
      result[cleanKey] = v;
      count++;
    }
  }
  if (JSON.stringify(result).length > 2048) {
    const compact: Record<string, string | number | boolean> = {};
    let total = 2;
    for (const [k, v] of Object.entries(result)) {
      const len = JSON.stringify(k).length + JSON.stringify(v).length + 3;
      if (total + len > 2048) break;
      compact[k] = v;
      total += len;
    }
    return compact;
  }
  return result;
}

// In-memory telemetry buffer for warm container invocations
const serverlessAnalyticsEvents: Array<{
  eventName: string;
  params?: any;
  timestamp: string;
  url?: string;
  ip?: string;
  userAgent?: string;
}> = [];

async function parseBody(req: any): Promise<any> {
  if (req.body) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
    if (typeof req.body === "object") return req.body;
  }
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk: any) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function getClientIp(req: any): string {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (forwarded) {
    const ips = typeof forwarded === "string" ? forwarded.split(",") : forwarded;
    return ips[0]?.trim() || "127.0.0.1";
  }
  return req.headers?.["x-real-ip"] || req.socket?.remoteAddress || "127.0.0.1";
}

export default async function handler(req: any, res: any) {
  applySecurityHeaders(res, process.env.NODE_ENV === "production");

  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Método não permitido. Utilize POST para registrar eventos analíticos.",
    });
  }

  try {
    const body = await parseBody(req);
    const { eventName, params, timestamp, url, userAgent } = body || {};

    if (!eventName || typeof eventName !== "string" || eventName.trim().length === 0 || eventName.length > 100) {
      return res.status(400).json({
        success: false,
        error: "Nome do evento ('eventName') inválido ou ausente.",
      });
    }

    const sanitizedEventName = eventName.trim().replace(/[^a-zA-Z0-9_-]/g, "");
    if (!sanitizedEventName) {
      return res.status(400).json({
        success: false,
        error: "Nome do evento contém apenas caracteres inválidos.",
      });
    }

    const safeParams = sanitizeBoundedParams(params);
    const safeTimestamp =
      timestamp && typeof timestamp === "string" && !isNaN(Date.parse(timestamp))
        ? timestamp
        : new Date().toISOString();
    const safeUrl = typeof url === "string" ? url.substring(0, 300) : "";
    const clientIp = getClientIp(req);
    const safeUserAgent = typeof userAgent === "string" ? userAgent.substring(0, 200) : (req.headers?.["user-agent"] || "").substring(0, 200);

    const eventRecord = {
      eventName: sanitizedEventName,
      params: safeParams,
      timestamp: safeTimestamp,
      url: safeUrl,
      ip: clientIp,
      userAgent: safeUserAgent,
    };

    serverlessAnalyticsEvents.unshift(eventRecord);
    if (serverlessAnalyticsEvents.length > 200) {
      serverlessAnalyticsEvents.pop();
    }

    // Persist real analytics record to Firestore if available
    const firestore = getAdminFirestore();
    if (firestore) {
      try {
        const eventDocId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await firestore.collection("analytics_events").doc(eventDocId).set(eventRecord);
      } catch (fsErr: any) {
        // Non-blocking firestore write
        console.warn("[Analytics Track API] Aviso ao persistir no Firestore:", fsErr?.message || fsErr);
      }
    }

    return res.status(200).json({
      success: true,
      logged: eventRecord,
    });
  } catch (err: any) {
    console.error("[Analytics Track API Fatal Error]:", err?.message || err);
    return res.status(200).json({
      success: true,
      warning: "Telemetria processada em modo de segurança.",
    });
  }
}
