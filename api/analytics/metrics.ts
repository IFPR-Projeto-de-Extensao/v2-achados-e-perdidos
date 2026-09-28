import { getAdminFirestore, getAdminAuth } from "../_lib/firebaseAdmin";

const ROOT_ADMIN_EMAIL = "paulocauan39@gmail.com";
const serverlessStartTime = Date.now();
let serverlessRequestCount = 0;

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Método não permitido. Utilize GET para consultar métricas do sistema.",
      code: "METHOD_NOT_ALLOWED",
    });
  }

  serverlessRequestCount++;

  const memoryHeap = process.memoryUsage ? Math.round(process.memoryUsage().heapUsed / 1024 / 1024) : 0;
  const uptimeSec = Math.floor((Date.now() - serverlessStartTime) / 1000);

  const basePublicMetrics = {
    success: true,
    scope: "PUBLIC",
    totalServerRequests: serverlessRequestCount,
    uptimeSeconds: uptimeSec >= 0 ? uptimeSec : 0,
    systemMemoryMB: memoryHeap,
    serverTimestamp: new Date().toISOString(),
    environment: {
      isVercel: Boolean(process.env.VERCEL),
      nodeVersion: process.version,
    },
  };

  const authHeader = req.headers?.authorization || req.headers?.Authorization;

  // 1. Unauthenticated Request: Return strictly safe public operational telemetry
  // Excludes all sensitive AI audits, events, counters, user identifiers, and database queries
  if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return res.status(200).json(basePublicMetrics);
  }

  const token = authHeader.split(" ")[1]?.trim();
  if (!token) {
    return res.status(200).json(basePublicMetrics);
  }

  // 2. Authenticated Request: Validate cryptographic signature via Firebase Admin SDK
  const adminAuth = getAdminAuth();
  if (!adminAuth) {
    console.error("[Analytics Metrics Security] Firebase Admin Auth não inicializado no servidor.");
    return res.status(503).json({
      success: false,
      error: "Serviço de autenticação administrativo temporariamente indisponível.",
      code: "AUTH_SERVICE_UNAVAILABLE",
    });
  }

  let decoded: any;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch (tokenErr: any) {
    console.warn("[Analytics Metrics Security] verifyIdToken falhou na validação de assinatura:", tokenErr?.message || tokenErr);
    return res.status(401).json({
      success: false,
      error: "Token de autenticação inválido ou expirado. Assinatura não verificada.",
      code: "AUTH_INVALID_TOKEN",
    });
  }

  if (!decoded || !decoded.uid) {
    return res.status(401).json({
      success: false,
      error: "Identidade do usuário não validada.",
      code: "AUTH_INVALID_IDENTITY",
    });
  }

  const userUid = decoded.uid;
  const userEmail = decoded.email || "";

  // 3. Strict Administrative Authorization Check (Source of Truth)
  const isRoot = userEmail.toLowerCase() === ROOT_ADMIN_EMAIL.toLowerCase();
  let isAdmin = isRoot || decoded.role === "ADMIN" || decoded.admin === true;

  if (!isAdmin && userUid) {
    const firestore = getAdminFirestore();
    if (firestore) {
      try {
        const userDoc = await firestore.collection("users").doc(userUid).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          if (userData?.role === "ADMIN") {
            isAdmin = true;
          }
        }
      } catch (fsErr: any) {
        console.warn("[Analytics Metrics Security] Aviso ao consultar Firestore users:", fsErr?.message || fsErr);
      }
    }
  }

  // 4. If authenticated but NOT an Administrator -> Block access to administrative & audit data (HTTP 403)
  if (!isAdmin) {
    console.warn(`[Analytics Metrics Security] Acesso negado a métricas administrativas para UID ${userUid} (${userEmail}) - Role: ${decoded.role || "ALUNO"}`);
    return res.status(403).json({
      success: false,
      error: "Acesso negado. Métricas administrativas, contadores operacionais e logs de auditoria de IA são restritos a administradores autorizados.",
      code: "FORBIDDEN_NOT_ADMIN",
    });
  }

  // 5. Authorized Admin: Query and compile administrative metrics & AI audit telemetry
  try {
    let totalAnalyticsEvents = 0;
    let totalAIAudits = 0;
    const recentAIAudits: any[] = [];
    const eventCounters: Record<string, number> = {};

    const firestore = getAdminFirestore();
    if (firestore) {
      try {
        const aiAuditSnap = await firestore
          .collection("ai_audit_logs")
          .orderBy("timestamp", "desc")
          .limit(20)
          .get();

        totalAIAudits = aiAuditSnap.size;
        aiAuditSnap.forEach((doc) => {
          recentAIAudits.push(doc.data());
        });
      } catch (aiErr: any) {
        console.warn("[Analytics Metrics API] Aviso ao ler ai_audit_logs:", aiErr?.message || aiErr);
      }

      try {
        const evtSnap = await firestore
          .collection("analytics_events")
          .orderBy("timestamp", "desc")
          .limit(50)
          .get();

        totalAnalyticsEvents = evtSnap.size;
        evtSnap.forEach((d) => {
          const evData = d.data();
          if (evData?.eventName) {
            eventCounters[evData.eventName] = (eventCounters[evData.eventName] || 0) + 1;
          }
        });
      } catch (evtErr: any) {
        console.warn("[Analytics Metrics API] Aviso ao ler analytics_events:", evtErr?.message || evtErr);
      }
    }

    const adminMetricsData = {
      ...basePublicMetrics,
      scope: "ADMIN",
      totalAnalyticsEvents,
      totalAIAuditRecords: totalAIAudits,
      eventCounters,
      recentEvents: [],
      recentAIAudits,
    };

    return res.status(200).json(adminMetricsData);
  } catch (err: any) {
    console.error("[Analytics Metrics API Error]:", err?.message || err);
    return res.status(500).json({
      success: false,
      error: "Erro interno ao compilar métricas administrativas.",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
}
