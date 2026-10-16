/**
 * Serverless Security Headers Helper for Localiza+ IFPR
 * Ensures consistent defense-in-depth across direct Vercel serverless function invocations.
 */

export const PERMISSIONS_POLICY_HEADER =
  "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()";

export const BASE_SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-XSS-Protection": "1; mode=block",
  "Permissions-Policy": PERMISSIONS_POLICY_HEADER,
} as const;

export function applySecurityHeaders(res: any, isSecure: boolean = false): void {
  if (!res) return;
  const setHeader =
    typeof res.setHeader === "function"
      ? res.setHeader.bind(res)
      : typeof res.header === "function"
      ? res.header.bind(res)
      : null;

  if (!setHeader) return;

  setHeader("X-Content-Type-Options", BASE_SECURITY_HEADERS["X-Content-Type-Options"]);
  setHeader("Referrer-Policy", BASE_SECURITY_HEADERS["Referrer-Policy"]);
  setHeader("X-XSS-Protection", BASE_SECURITY_HEADERS["X-XSS-Protection"]);
  setHeader("Permissions-Policy", BASE_SECURITY_HEADERS["Permissions-Policy"]);

  if (isSecure) {
    setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}
