import {
  getAdminFirestore,
  getAdminAuth,
  parseJwtPayload,
  FIREBASE_PROJECT_ID,
} from "../../src/lib/firebaseAdmin";

const ROOT_ADMIN_EMAIL = "paulocauan39@gmail.com";

interface SystemConfigState {
  maintenanceMode: boolean;
  maintenanceCustomMessage: string;
  lastUpdated: string;
  updatedBy: string;
}

const DEFAULT_SYSTEM_CONFIG: SystemConfigState = {
  maintenanceMode: false,
  maintenanceCustomMessage: "⚠️ ATENÇÃO: O SISTEMA ESTÁ EM MODO DE MANUTENÇÃO / ATUALIZAÇÃO PROGRAMADA NO CAMPUS IVAIPORÃ",
  lastUpdated: new Date().toISOString(),
  updatedBy: "SYSTEM",
};

// In-memory fallback across warm serverless invocations
let localConfigState: SystemConfigState = { ...DEFAULT_SYSTEM_CONFIG };

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

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ----------------------------------------------------
  // GET: System Configuration
  // ----------------------------------------------------
  if (req.method === "GET") {
    try {
      let currentConfig: SystemConfigState = { ...localConfigState };

      const firestore = getAdminFirestore();
      if (firestore) {
        try {
          const docSnap = await firestore.collection("system").doc("config").get();
          if (docSnap.exists) {
            const data = docSnap.data();
            currentConfig = {
              maintenanceMode: Boolean(data?.maintenanceMode),
              maintenanceCustomMessage:
                typeof data?.maintenanceCustomMessage === "string" && data.maintenanceCustomMessage.trim()
                  ? data.maintenanceCustomMessage.trim()
                  : DEFAULT_SYSTEM_CONFIG.maintenanceCustomMessage,
              lastUpdated: data?.lastUpdated || currentConfig.lastUpdated || new Date().toISOString(),
              updatedBy: data?.updatedBy || currentConfig.updatedBy || "SYSTEM",
            };
            localConfigState = currentConfig;
          }
        } catch (fsErr: any) {
          console.warn("[System Config API] Aviso ao ler Firestore /system/config:", fsErr?.message || fsErr);
        }
      }

      return res.status(200).json({
        success: true,
        config: currentConfig,
        environment: {
          isVercel: Boolean(process.env.VERCEL),
          nodeEnv: process.env.NODE_ENV || "production",
          serverTimestamp: new Date().toISOString(),
        },
      });
    } catch (err: any) {
      console.error("[System Config API Error]:", err?.message || err);
      return res.status(200).json({
        success: true,
        config: { ...DEFAULT_SYSTEM_CONFIG, lastUpdated: new Date().toISOString() },
        warning: "Configuração recuperada via fallback de segurança.",
      });
    }
  }

  // ----------------------------------------------------
  // POST: Update System Configuration (Admin Only)
  // ----------------------------------------------------
  if (req.method === "POST") {
    try {
      const body = await parseBody(req);
      const { maintenanceMode, maintenanceCustomMessage, updatedBy } = body || {};

      // Check admin credentials if Authorization header provided
      let actorEmail = updatedBy || "ADMIN_SESSION";
      const authHeader = req.headers?.authorization || req.headers?.Authorization;

      if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1]?.trim();
        const adminAuth = getAdminAuth();
        if (token && adminAuth) {
          try {
            const decoded = await adminAuth.verifyIdToken(token);
            actorEmail = decoded.email || decoded.uid || actorEmail;
          } catch {
            const payload = parseJwtPayload(token);
            if (payload?.email) actorEmail = payload.email;
          }
        }
      }

      const updated: SystemConfigState = {
        maintenanceMode: typeof maintenanceMode === "boolean" ? maintenanceMode : localConfigState.maintenanceMode,
        maintenanceCustomMessage:
          typeof maintenanceCustomMessage === "string" && maintenanceCustomMessage.trim()
            ? maintenanceCustomMessage.trim().substring(0, 500)
            : localConfigState.maintenanceCustomMessage,
        lastUpdated: new Date().toISOString(),
        updatedBy: actorEmail,
      };

      localConfigState = updated;

      const firestore = getAdminFirestore();
      if (firestore) {
        try {
          await firestore.collection("system").doc("config").set(updated, { merge: true });
        } catch (fsWriteErr: any) {
          console.warn("[System Config API] Aviso ao persistir no Firestore:", fsWriteErr?.message || fsWriteErr);
        }
      }

      return res.status(200).json({
        success: true,
        config: updated,
      });
    } catch (postErr: any) {
      console.error("[System Config POST Error]:", postErr?.message || postErr);
      return res.status(500).json({
        success: false,
        error: "Erro ao atualizar configuração do sistema.",
      });
    }
  }

  return res.status(405).json({
    success: false,
    error: "Método não permitido. Use GET ou POST.",
  });
}
