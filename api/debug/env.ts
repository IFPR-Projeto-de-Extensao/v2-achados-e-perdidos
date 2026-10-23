import { getAdminAuth, getAdminFirestore } from "../_lib/firebaseAdmin.js";

const ROOT_ADMIN_EMAIL = "paulocauan39@gmail.com";

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Mandatory Admin RBAC Authentication
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: "Autenticação obrigatória. Acesso exclusivo a administradores autorizados.",
      code: "UNAUTHENTICATED",
    });
  }

  const token = authHeader.split(" ")[1]?.trim();
  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Token de autenticação não informado.",
      code: "TOKEN_MISSING",
    });
  }

  const adminAuth = getAdminAuth();
  const adminDb = getAdminFirestore();
  if (!adminAuth) {
    return res.status(503).json({ success: false, error: "Serviço de autenticação administrativa indisponível." });
  }

  let decodedToken: any;
  try {
    decodedToken = await adminAuth.verifyIdToken(token);
  } catch (err: any) {
    return res.status(401).json({
      success: false,
      error: "Token de autenticação inválido ou expirado.",
      code: "INVALID_TOKEN",
    });
  }

  const isRootAdmin = decodedToken.email === ROOT_ADMIN_EMAIL;
  let isAdmin = isRootAdmin || decodedToken.role === "ADMIN" || decodedToken.admin === true;

  if (adminDb && !isAdmin) {
    try {
      const uDoc = await adminDb.collection("users").doc(decodedToken.uid).get();
      if (uDoc.exists && uDoc.data()?.role === "ADMIN") {
        isAdmin = true;
      }
    } catch (_) {}
  }

  if (!isAdmin) {
    return res.status(403).json({
      success: false,
      error: "Acesso negado. Apenas administradores do IFPR podem visualizar diagnósticos de ambiente.",
      code: "FORBIDDEN_NOT_ADMIN",
    });
  }

  const isDiscordConfigured = Boolean(
    process.env.DISCORD_FEEDBACK_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK_URL_FEEDBACK ||
    process.env.DISCORD_FEEDBACK_URL ||
    process.env.DISCORD_WEBHOOK_FEEDBACK ||
    process.env.DISCORD_SUPPORT_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK ||
    process.env.DISCORD_FEEDBACK
  );

  const smtpHost = (process.env.SMTP_HOST || "").trim();
  const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const smtpUser = (process.env.SMTP_USER || "").trim();
  const smtpPass = (process.env.SMTP_PASS || "").trim();
  const isSmtpConfigured = Boolean(smtpHost && smtpUser && smtpPass);

  const maskEmail = (email: string) => {
    if (!email || !email.includes("@")) return null;
    const [name, domain] = email.split("@");
    return `${name.substring(0, 3)}***@${domain}`;
  };

  const isGeminiConfigured = Boolean(
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    process.env.API_KEY
  );

  const isFirebaseAdminConfigured = Boolean(
    process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY
  );

  // Safe boolean flags & non-sensitive parameters only - NEVER expose secrets or URLs
  return res.status(200).json({
    status: isDiscordConfigured || isSmtpConfigured || isGeminiConfigured,
    DISCORD_FEEDBACK_WEBHOOK_URL: isDiscordConfigured,
    DISCORD_WEBHOOK_READY: isDiscordConfigured,
    SMTP: {
      configured: isSmtpConfigured,
      hostPresent: Boolean(smtpHost),
      portPresent: Boolean(process.env.SMTP_PORT),
      userPresent: Boolean(smtpUser),
      passPresent: Boolean(smtpPass),
      fromPresent: Boolean(process.env.SMTP_FROM),
      port: smtpPort,
      secure: process.env.SMTP_SECURE === "true" || smtpPort === 465,
      userMasked: maskEmail(smtpUser),
    },
    GEMINI_AI: {
      configured: isGeminiConfigured,
    },
    FIREBASE_ADMIN: {
      configured: isFirebaseAdminConfigured,
      projectIdPresent: Boolean(process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID),
    },
    runtime: typeof process !== "undefined" && process.release ? "node" : "serverless",
    timestamp: new Date().toISOString(),
  });
}
