import { getAdminAuth, getAdminFirestore } from "../_lib/firebaseAdmin";

const ROOT_ADMIN_EMAIL = "paulocauan39@gmail.com";

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

function sanitizeLog(message: any): string {
  return String(message)
    .replace(/bearer\s+[a-zA-Z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, "[REDACTED_EMAIL]")
    .replace(/key=[a-zA-Z0-9_-]+/gi, "key=[REDACTED]")
    .replace(/token=[a-zA-Z0-9._-]+/gi, "token=[REDACTED]");
}

export default async function handler(req: any, res: any) {
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
      error: "Método não permitido. Utilize POST.",
      code: "METHOD_NOT_ALLOWED",
    });
  }

  // 1. Mandatory Cryptographic Authentication Verification
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: "Autenticação obrigatória. Forneça o token Bearer válido para compensação.",
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
  const adminFirestore = getAdminFirestore();
  if (!adminAuth || !adminFirestore) {
    return res.status(503).json({
      success: false,
      error: "Serviço de autenticação ou banco indisponível para compensação.",
      code: "SERVICE_UNAVAILABLE",
    });
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

  const callerUid = decodedToken.uid;
  const isRootAdmin = decodedToken.email === ROOT_ADMIN_EMAIL;
  let isAdmin = isRootAdmin || decodedToken.role === "ADMIN" || decodedToken.admin === true;

  if (!isAdmin) {
    try {
      const uDoc = await adminFirestore.collection("users").doc(callerUid).get();
      if (uDoc.exists && uDoc.data()?.role === "ADMIN") {
        isAdmin = true;
      }
    } catch (_) {}
  }

  const body = await parseBody(req);
  const requestedUid = typeof body?.uid === "string" ? body.uid.trim() : "";

  // 2. Validate Identity Binding: non-admins can only compensate their own account
  if (requestedUid && requestedUid !== callerUid && !isAdmin) {
    console.warn(`[Compensation Rejected] Solicitante (${callerUid}) tentou compensar conta alheia (${requestedUid}). Acesso negado.`);
    return res.status(403).json({
      success: false,
      error: "Acesso negado: Você só pode solicitar a compensação de sua própria conta recém-criada.",
      code: "FORBIDDEN_NOT_OWNER",
    });
  }

  const targetUid = isAdmin ? (requestedUid || callerUid) : callerUid;
  if (!targetUid) {
    return res.status(400).json({
      success: false,
      error: "UID obrigatório para compensação.",
      code: "UID_REQUIRED",
    });
  }

  try {
    // 3. Fetch User Record from Admin Auth
    let userRecord: any;
    try {
      userRecord = await adminAuth.getUser(targetUid);
    } catch (notFoundErr: any) {
      return res.status(404).json({
        success: false,
        error: "Usuário não encontrado para compensação.",
        code: "USER_NOT_FOUND",
      });
    }

    // 4. Verify Creation Time Window (must be recently created, <= 3 minutes)
    const creationTime = new Date(userRecord.metadata.creationTime).getTime();
    const now = Date.now();
    const elapsedMs = now - creationTime;

    if (elapsedMs > 3 * 60 * 1000) {
      console.warn(`[Compensation Rejected] Tentativa de compensação em conta antiga (${targetUid}, criada há ${Math.round(elapsedMs / 1000)}s). Abortando.`);
      return res.status(403).json({
        success: false,
        error: "Compensação permitida apenas para cadastros recém-criados.",
        code: "ACCOUNT_EXPIRED",
      });
    }

    // 5. Verify Consolidated Status: cannot delete account if email is verified (unless admin)
    if (userRecord.emailVerified === true && !isAdmin) {
      return res.status(409).json({
        success: false,
        error: "Conta já consolidada (e-mail verificado). Compensação não permitida.",
        code: "ACCOUNT_CONSOLIDATED",
      });
    }

    // 6. Verify absence of document in Firestore /users/{targetUid}
    const docSnap = await adminFirestore.collection("users").doc(targetUid).get();
    if (docSnap.exists) {
      console.warn(`[Compensation Rejected] Documento Firestore /users/${targetUid} já existe. Não compensar.`);
      return res.status(409).json({
        success: false,
        error: "Usuário já possui documento no Firestore.",
        code: "ACCOUNT_CONSOLIDATED",
      });
    }

    // 7. Delete orphaned newly created Auth account
    await adminAuth.deleteUser(targetUid);
    console.log(`[Compensation Success] Conta órfã recém-criada ${targetUid} removida do Firebase Auth com sucesso.`);

    return res.status(200).json({
      success: true,
      message: "Compensação realizada com sucesso.",
    });
  } catch (err: any) {
    console.error(`[Compensation Error] Falha ao processar compensação para ${targetUid}:`, sanitizeLog(err?.message || err));
    return res.status(500).json({
      success: false,
      error: "Erro interno ao processar compensação de cadastro.",
      code: "COMPENSATION_ERROR",
    });
  }
}
