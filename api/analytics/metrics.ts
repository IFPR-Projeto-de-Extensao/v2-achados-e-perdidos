import { getAdminFirestore } from "../../src/lib/firebaseAdmin";

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
    });
  }

  serverlessRequestCount++;

  try {
    const memoryHeap = process.memoryUsage ? Math.round(process.memoryUsage().heapUsed / 1024 / 1024) : 0;
    const uptimeSec = Math.floor((Date.now() - serverlessStartTime) / 1000);

    let totalAnalyticsEvents = 0;
    let totalAIAudits = 0;
    const recentAIAudits: any[] = [];
    const eventCounters: Record<string, number> = {};

    const firestore = getAdminFirestore();
    if (firestore) {
      try {
        // Query recent AI audit logs for dashboard telemetry
        const aiAuditSnap = await firestore
          .collection("ai_audit_logs")
          .orderBy("timestamp", "desc")
          .limit(10)
          .get();

        totalAIAudits = aiAuditSnap.size;
        aiAuditSnap.forEach((doc) => {
          recentAIAudits.push(doc.data());
        });
      } catch {
        // Fallback gracefully if collection is empty or not indexed yet
      }

      try {
        // Count recent events
        const evtSnap = await firestore
          .collection("analytics_events")
          .orderBy("timestamp", "desc")
          .limit(20)
          .get();

        totalAnalyticsEvents = evtSnap.size;
        evtSnap.forEach((d) => {
          const evData = d.data();
          if (evData?.eventName) {
            eventCounters[evData.eventName] = (eventCounters[evData.eventName] || 0) + 1;
          }
        });
      } catch {
        // Fallback gracefully
      }
    }

    const metricsData = {
      success: true,
      totalServerRequests: serverlessRequestCount,
      totalAnalyticsEvents,
      totalAIAuditRecords: totalAIAudits,
      eventCounters,
      recentEvents: [],
      recentAIAudits,
      uptimeSeconds: uptimeSec >= 0 ? uptimeSec : 0,
      systemMemoryMB: memoryHeap,
      serverTimestamp: new Date().toISOString(),
      environment: {
        isVercel: Boolean(process.env.VERCEL),
        nodeVersion: process.version,
      },
    };

    return res.status(200).json(metricsData);
  } catch (err: any) {
    console.error("[Analytics Metrics API Error]:", err?.message || err);
    return res.status(200).json({
      success: true,
      totalServerRequests: serverlessRequestCount,
      totalAnalyticsEvents: 0,
      totalAIAuditRecords: 0,
      eventCounters: {},
      recentEvents: [],
      recentAIAudits: [],
      uptimeSeconds: Math.floor((Date.now() - serverlessStartTime) / 1000),
      systemMemoryMB: 36,
      serverTimestamp: new Date().toISOString(),
      environment: {
        isVercel: Boolean(process.env.VERCEL),
        nodeVersion: process.version,
      },
    });
  }
}
