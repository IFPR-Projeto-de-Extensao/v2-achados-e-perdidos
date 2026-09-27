import {
  getAdminFirestore,
  getAdminAuth,
} from "../../src/lib/firebaseAdmin";

const ROOT_ADMIN_EMAIL = "paulocauan39@gmail.com";

export interface SystemConfigState {
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
  // GET: Public Read of System Configuration Status
  // (Used by AppContext and visitors to detect maintenance mode)
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
  // POST: Administrative Update of System Configuration
  // STRICT: Authentication (401) & Authorization (403) Required
  // ----------------------------------------------------
  if (req.method === "POST") {
    try {
      // 1. Mandatory Authorization Header Check
      const authHeader = req.headers?.authorization || req.headers?.Authorization;
      if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
        console.warn("[System Config Security] Tentativa de POST sem cabeçalho Authorization Bearer válido.");
        return res.status(401).json({
          success: false,
          error: "Autenticação obrigatória. Forneça o token Bearer de administrador.",
          code: "AUTH_REQUIRED",
        });
      }

      const token = authHeader.split(" ")[1]?.trim();
      if (!token) {
        console.warn("[System Config Security] Token Bearer vazio na requisição POST.");
        return res.status(401).json({
          success: false,
          error: "Token de autenticação ausente.",
          code: "AUTH_TOKEN_MISSING",
        });
      }

      // 2. Strict Cryptographic Signature Verification via Firebase Admin SDK
      const adminAuth = getAdminAuth();
      if (!adminAuth) {
        console.error("[System Config Security] Firebase Admin Auth não inicializado no servidor.");
        return res.status(500).json({
          success: false,
          error: "Serviço de autenticação administrativo temporariamente indisponível.",
          code: "AUTH_SERVICE_UNAVAILABLE",
        });
      }

      let decoded: any;
      try {
        decoded = await adminAuth.verifyIdToken(token);
      } catch (tokenErr: any) {
        console.warn("[System Config Security] verifyIdToken falhou na validação de assinatura:", tokenErr?.message || tokenErr);
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

      const adminUid = decoded.uid;
      const adminEmail = decoded.email || "";

      // 3. Strict Administrative Authorization Check (Source of Truth)
      const isRoot = adminEmail.toLowerCase() === ROOT_ADMIN_EMAIL.toLowerCase();
      let isAdmin = isRoot || decoded.role === "ADMIN" || decoded.admin === true;

      // Consult Firestore users collection if not already verified via root or custom claims
      if (!isAdmin && adminUid) {
        const adminFirestore = getAdminFirestore();
        if (adminFirestore) {
          try {
            const userDoc = await adminFirestore.collection("users").doc(adminUid).get();
            if (userDoc.exists) {
              const userData = userDoc.data();
              if (userData?.role === "ADMIN") {
                isAdmin = true;
              }
            }
          } catch (fsLookupErr: any) {
            console.warn("[System Config Security] Aviso ao consultar perfil do usuário no Firestore:", fsLookupErr?.message || fsLookupErr);
          }
        }
      }

      if (!isAdmin) {
        console.warn(`[System Config Security] Acesso negado para UID ${adminUid} (${adminEmail}) - Não possui privilégios ADMIN.`);
        return res.status(403).json({
          success: false,
          error: "Acesso negado. Apenas administradores autorizados do IFPR possuem permissão para alterar as configurações do sistema.",
          code: "FORBIDDEN_NOT_ADMIN",
        });
      }

      // 4. Request Body Validation (Zero Trust in Client Privileges)
      const body = await parseBody(req);
      if (!body || typeof body !== "object") {
        return res.status(400).json({
          success: false,
          error: "Corpo da requisição inválido. Envie um objeto JSON válido.",
          code: "INVALID_REQUEST_BODY",
        });
      }

      // Whitelist only legitimate fields: maintenanceMode, maintenanceCustomMessage
      // Completely discard any client-supplied role, admin, permissions, actorRole, updatedBy
      const { maintenanceMode, maintenanceCustomMessage } = body;

      const updated: SystemConfigState = {
        maintenanceMode: typeof maintenanceMode === "boolean" ? maintenanceMode : localConfigState.maintenanceMode,
        maintenanceCustomMessage:
          typeof maintenanceCustomMessage === "string" && maintenanceCustomMessage.trim()
            ? maintenanceCustomMessage.trim().substring(0, 500)
            : localConfigState.maintenanceCustomMessage,
        lastUpdated: new Date().toISOString(),
        updatedBy: adminEmail || adminUid,
      };

      // 5. Persist to Firestore and Update In-Memory Cache
      localConfigState = updated;

      const firestore = getAdminFirestore();
      if (firestore) {
        try {
          await firestore.collection("system").doc("config").set(updated, { merge: true });

          // Record administrative audit trail in activity_logs
          await firestore.collection("activity_logs").add({
            action: "UPDATE_SYSTEM_CONFIG",
            performedBy: adminUid,
            performedByEmail: adminEmail || "admin@ifpr.edu.br",
            role: "ADMIN",
            details: `Configuração do sistema atualizada. Modo Manutenção: ${updated.maintenanceMode}.`,
            status: "SUCCESS",
            timestamp: updated.lastUpdated,
          });
        } catch (fsWriteErr: any) {
          console.warn("[System Config API] Aviso ao persistir no Firestore:", fsWriteErr?.message || fsWriteErr);
        }
      }

      console.info(`[System Config Updated] Modo Manutenção: ${updated.maintenanceMode} por ${updated.updatedBy} (${adminUid})`);

      return res.status(200).json({
        success: true,
        config: updated,
      });
    } catch (postErr: any) {
      console.error("[System Config POST Error]:", postErr?.message || postErr);
      return res.status(500).json({
        success: false,
        error: "Erro interno ao atualizar configuração do sistema.",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  }

  // Reject any other HTTP methods
  return res.status(405).json({
    success: false,
    error: "Método não permitido. Utilize GET para consulta pública ou POST com credenciais administrativas.",
    code: "METHOD_NOT_ALLOWED",
  });
}
