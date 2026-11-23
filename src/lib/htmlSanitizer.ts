/**
 * HTML, Email Header, and Telemetry Payload Sanitization Helpers
 * Prevents stored/reflected HTML injection in printable views and emails,
 * header injection in SMTP fields, and unbounded payload writes.
 */

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

/**
 * Escapes HTML special characters so untrusted strings are rendered strictly as text.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"'`]/g, (char) => HTML_ESCAPE_MAP[char] || char);
}

/**
 * Validates that a data URL is strictly a raster PNG/JPEG/WEBP image (never SVG/HTML/JS).
 */
export function isSafeDataImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(trimmed);
}

/**
 * Strips CR/LF and control characters to prevent email header injection.
 */
export function stripHeaderInjection(value: unknown, maxLength: number = 200): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/[\r\n\0]+/g, " ")
    .replace(/["<>]/g, "")
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitizes and bounds an analytics params object (max 20 keys, primitive values <= 200 chars, <= 2KB serialized).
 */
export function sanitizeAnalyticsParams(
  raw: unknown
): Record<string, string | number | boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const sanitized: Record<string, string | number | boolean> = {};
  const entries = Object.entries(raw as Record<string, unknown>);
  let keyCount = 0;

  for (const [key, val] of entries) {
    if (keyCount >= 20) break;
    const cleanKey = key.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 64);
    if (!cleanKey || cleanKey === "__proto__" || cleanKey === "constructor" || cleanKey === "prototype") {
      continue;
    }

    if (typeof val === "string") {
      sanitized[cleanKey] = val.slice(0, 200);
      keyCount++;
    } else if (typeof val === "number" && Number.isFinite(val)) {
      sanitized[cleanKey] = val;
      keyCount++;
    } else if (typeof val === "boolean") {
      sanitized[cleanKey] = val;
      keyCount++;
    }
  }

  // Hard cap total serialized size to 2KB
  if (JSON.stringify(sanitized).length > 2048) {
    const compact: Record<string, string | number | boolean> = {};
    let totalLen = 2;
    for (const [k, v] of Object.entries(sanitized)) {
      const entryLen = JSON.stringify(k).length + JSON.stringify(v).length + 3;
      if (totalLen + entryLen > 2048) break;
      compact[k] = v;
      totalLen += entryLen;
    }
    return compact;
  }

  return sanitized;
}
