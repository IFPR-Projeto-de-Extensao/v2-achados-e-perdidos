import {
  FIRESTORE_DATABASE_ID,
  getAdminAuth,
  getAdminFirestore,
  getFirebaseAdminCredentialDiagnostics,
  resolveFirebaseServiceAccountFromEnv,
  verifyServerlessCallerAccess,
} from "../_lib/firebaseAdmin.js";

function maskEmail(email: string | undefined): string | null {
  const clean = (email || "").trim();
  if (!clean || !clean.includes("@")) return null;
  const [name, domain] = clean.split("@");
  return `${name.substring(0, 3)}***@${domain}`;
}

export function buildFirebaseAdminEnvDiagnostic(): {
  configured: boolean;
  credentialSource: "CLIENT_EMAIL_AND_PRIVATE_KEY" | "SERVICE_ACCOUNT_JSON" | "DEFAULT_OR_MISSING";
  hasClientEmailAndPrivateKey: boolean;
  hasServiceAccountJson: boolean;
  hasCredentialError: boolean;
  isVercelWithoutCreds: boolean;
  projectIdPresent: boolean;
  databaseIdConfigured: boolean;
} {
  const adminCredDiag = getFirebaseAdminCredentialDiagnostics();
  const resolvedSa = resolveFirebaseServiceAccountFromEnv();
  const hasClientEmailAndPrivateKey = Boolean(
    process.env.FIREBASE_CLIENT_EMAIL?.trim() && process.env.FIREBASE_PRIVATE_KEY?.trim()
  );
  const hasServiceAccountJson = Boolean(
    (process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "").trim()
  );

  const credentialSource: "CLIENT_EMAIL_AND_PRIVATE_KEY" | "SERVICE_ACCOUNT_JSON" | "DEFAULT_OR_MISSING" =
    hasClientEmailAndPrivateKey && adminCredDiag.hasExplicitServiceAccount
      ? "CLIENT_EMAIL_AND_PRIVATE_KEY"
      : hasServiceAccountJson && adminCredDiag.hasExplicitServiceAccount
      ? "SERVICE_ACCOUNT_JSON"
      : "DEFAULT_OR_MISSING";

  return {
    configured: adminCredDiag.hasExplicitServiceAccount,
    credentialSource,
    hasClientEmailAndPrivateKey,
    hasServiceAccountJson,
    hasCredentialError: Boolean(adminCredDiag.certInitError),
    isVercelWithoutCreds: adminCredDiag.isVercelWithoutCreds,
    projectIdPresent: Boolean(
      process.env.FIREBASE_PROJECT_ID ||
        process.env.VITE_FIREBASE_PROJECT_ID ||
        resolvedSa.projectId
    ),
    databaseIdConfigured: Boolean(
      (process.env.FIRESTORE_DATABASE_ID && process.env.FIRESTORE_DATABASE_ID.trim()) ||
        FIRESTORE_DATABASE_ID
    ),
  };
}

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

  const callerAccess = await verifyServerlessCallerAccess(adminDb, decodedToken);
  const isAdmin = callerAccess.isAdmin;

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
  const smtpPortNum = parseInt((process.env.SMTP_PORT || "587").trim(), 10) || 587;
  const smtpUser = (process.env.SMTP_USER || "").trim();
  const smtpPass = (process.env.SMTP_PASS || "").trim().replace(/\s+/g, "");
  const smtpFrom = (process.env.SMTP_FROM || "").trim();
  const smtpSecure = process.env.SMTP_SECURE === "true" || smtpPortNum === 465;
  const isSmtpConfigured = Boolean(smtpHost && smtpUser && smtpPass);

  const isGeminiConfigured = Boolean(
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    process.env.API_KEY
  );

  const firebaseAdminDiagnostic = buildFirebaseAdminEnvDiagnostic();

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
      fromPresent: Boolean(smtpFrom),
      port: smtpPortNum,
      secure: smtpSecure,
      userMasked: maskEmail(smtpUser),
    },
    GEMINI_AI: {
      configured: isGeminiConfigured,
    },
    FIREBASE_ADMIN: firebaseAdminDiagnostic,
    runtime: typeof process !== "undefined" && process.release ? "node" : "serverless",
    timestamp: new Date().toISOString(),
  });
}
