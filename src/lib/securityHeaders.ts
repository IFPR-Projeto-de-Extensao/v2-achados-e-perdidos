/**
 * Security Headers Configuration for Localiza+ IFPR
 * Designed for OWASP compliance, strict origin isolation, and AI Studio container compatibility.
 */

export const CSP_DIRECTIVES = {
  "default-src": ["'self'"],
  "script-src": [
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    "https://apis.google.com",
    "https://*.firebaseapp.com",
    "https://*.googleapis.com",
  ],
  "style-src": [
    "'self'",
    "'unsafe-inline'",
    "https://fonts.googleapis.com",
  ],
  "font-src": [
    "'self'",
    "https://fonts.gstatic.com",
    "data:",
  ],
  "img-src": [
    "'self'",
    "data:",
    "blob:",
    "https://images.unsplash.com",
    "https://*.googleusercontent.com",
    "https://*.gstatic.com",
    "https://*.googleapis.com",
    "https://*.firebasestorage.app",
    "https://firebasestorage.googleapis.com",
    "https://*.githubusercontent.com",
  ],
  "connect-src": [
    "'self'",
    "https://*.googleapis.com",
    "https://*.firebaseio.com",
    "https://firestore.googleapis.com",
    "https://identitytoolkit.googleapis.com",
    "https://securetoken.googleapis.com",
    "https://generativelanguage.googleapis.com",
    "https://images.unsplash.com",
    "https://*.google.com",
    "wss://*.firebaseio.com",
  ],
  "frame-src": [
    "'self'",
    "https://*.firebaseapp.com",
    "https://*.google.com",
  ],
  "frame-ancestors": [
    "'self'",
    "https://*.google.com",
    "https://*.google.dev",
    "https://*.run.app",
    "https://*.web.app",
    "https://*.firebaseapp.com",
  ],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
};

export function buildContentSecurityPolicy(): string {
  return (
    Object.entries(CSP_DIRECTIVES)
      .map(([directive, values]) => `${directive} ${values.join(" ")}`)
      .join("; ") + ";"
  );
}

export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-XSS-Protection": "1; mode=block",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy": buildContentSecurityPolicy(),
} as const;
