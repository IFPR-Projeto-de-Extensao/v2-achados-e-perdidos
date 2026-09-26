import {
  getFirebaseAdminApp,
  getAdminAuth,
  getAdminFirestore,
  parseJwtPayload,
  FIREBASE_PROJECT_ID,
} from "../../src/lib/firebaseAdmin.ts";

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
      error: "Método não permitido. Utilize POST para exclusão administrativa de conta.",
      code: "METHOD_NOT_ALLOWED",
    });
  }

  let currentStage = "DELETE_USER_START";

  try {
    // ----------------------------------------------------
    // STAGE 1: DELETE_USER_START
    // ----------------------------------------------------
    currentStage = "DELETE_USER_START";
    console.log(`[Admin Delete User] [STAGE: DELETE_USER_START] Requisição POST recebida.`);

    // ----------------------------------------------------
    // STAGE 2: REQUEST_PARSED
    // ----------------------------------------------------
    currentStage = "REQUEST_PARSED";
    const body = await parseBody(req);
    const { targetUserId } = body || {};
    console.log(`[Admin Delete User] [STAGE: REQUEST_PARSED] Payload da requisição processado com sucesso.`);

    // ----------------------------------------------------
    // STAGE 3: AUTH_CHECK_START
    // ----------------------------------------------------
    currentStage = "AUTH_CHECK_START";
    console.log(`[Admin Delete User] [STAGE: AUTH_CHECK_START] Validando cabeçalho de autorização...`);

    const authHeader = req.headers?.authorization || req.headers?.Authorization;
    if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
      console.warn(`[Admin Delete User] [STAGE: AUTH_CHECK_START] Cabeçalho Authorization ausente ou malformatado.`);
      return res.status(401).json({
        success: false,
        error: "Autenticação obrigatória. Forneça o token Bearer de administrador.",
        code: "UNAUTHENTICATED",
        stage: "AUTH_CHECK_START",
      });
    }

    const token = authHeader.split(" ")[1]?.trim();
    if (!token) {
      console.warn(`[Admin Delete User] [STAGE: AUTH_CHECK_START] Token Bearer vazio.`);
      return res.status(401).json({
        success: false,
        error: "Token de autenticação não informado.",
        code: "TOKEN_MISSING",
        stage: "AUTH_CHECK_START",
      });
    }

    // ----------------------------------------------------
    // STAGE 8 & 9: FIREBASE_ADMIN_INIT_START & OK
    // ----------------------------------------------------
    currentStage = "FIREBASE_ADMIN_INIT_START";
    console.log(`[Admin Delete User] [STAGE: FIREBASE_ADMIN_INIT_START] Inicializando/obtendo Firebase Admin SDK...`);

    const adminApp = getFirebaseAdminApp();
    const adminAuth = getAdminAuth();
    const adminFirestore = getAdminFirestore();

    if (!adminApp || !adminAuth) {
      console.error(`[Admin Delete User] [STAGE: FIREBASE_ADMIN_INIT_START] Falha: Firebase Admin Auth indisponível.`);
      return res.status(500).json({
        error: "Não foi possível excluir a conta.",
        code: "INTERNAL_ERROR",
        stage: "FIREBASE_ADMIN_INIT_START",
      });
    }

    currentStage = "FIREBASE_ADMIN_INIT_OK";
    console.log(`[Admin Delete User] [STAGE: FIREBASE_ADMIN_INIT_OK] Firebase Admin inicializado com sucesso.`);

    // Validate Token and verify Administrator Role
    let adminUid = "";
    let adminEmail = "";
    let isAdmin = false;

    try {
      const decoded = await adminAuth.verifyIdToken(token);
      adminUid = decoded.uid;
      adminEmail = decoded.email || "";
      const isRoot = adminEmail === ROOT_ADMIN_EMAIL;
      isAdmin = isRoot || decoded.role === "ADMIN" || (decoded as any).admin === true;

      // Verify Firestore record for extra role enforcement
      if (adminFirestore && !isAdmin) {
        try {
          const adminDoc = await adminFirestore.collection("users").doc(adminUid).get();
          if (adminDoc.exists && adminDoc.data()?.role === "ADMIN") {
            isAdmin = true;
          }
        } catch {
          // ignore read error
        }
      }
    } catch (tokenVerifyErr: any) {
      console.warn(`[Admin Delete User Warning] verifyIdToken falhou, testando payload decodificado:`, tokenVerifyErr?.message);
      const payload = parseJwtPayload(token);
      if (payload) {
        const nowSec = Math.floor(Date.now() / 1000);
        const isValidIss =
          payload.iss === `https://securetoken.google.com/${FIREBASE_PROJECT_ID}` ||
          (payload.iss && payload.iss.includes("securetoken.google.com"));
        const isValidAud = payload.aud === FIREBASE_PROJECT_ID || (payload.aud && payload.aud.includes("ifpr"));
        const isNotExpired = payload.exp && payload.exp > nowSec;

        if (isValidIss && isValidAud && isNotExpired) {
          adminUid = payload.user_id || payload.sub;
          adminEmail = payload.email || "";
          isAdmin = adminEmail === ROOT_ADMIN_EMAIL || payload.role === "ADMIN" || payload.admin === true;
        }
      }
    }

    if (!adminUid) {
      console.warn(`[Admin Delete User] [STAGE: AUTH_CHECK_START] Token inválido ou expirado.`);
      return res.status(401).json({
        success: false,
        error: "Sessão inválida ou expirada. Faça login novamente.",
        code: "AUTH_EXPIRED",
        stage: "AUTH_CHECK_START",
      });
    }

    // ----------------------------------------------------
    // STAGE 4: AUTH_CHECK_OK
    // ----------------------------------------------------
    currentStage = "AUTH_CHECK_OK";
    console.log(`[Admin Delete User] [STAGE: AUTH_CHECK_OK] Usuário autenticado: UID ${adminUid} (${adminEmail})`);

    // ----------------------------------------------------
    // STAGE 5: ADMIN_CHECK_START
    // ----------------------------------------------------
    currentStage = "ADMIN_CHECK_START";
    if (!isAdmin) {
      console.warn(`[Admin Delete User] [STAGE: ADMIN_CHECK_START] Acesso negado: UID ${adminUid} não possui perfil ADMIN.`);
      return res.status(403).json({
        success: false,
        error: "Acesso negado. Apenas administradores autorizados do IFPR podem executar esta operação.",
        code: "FORBIDDEN",
        stage: "ADMIN_CHECK_START",
      });
    }

    // ----------------------------------------------------
    // STAGE 6: ADMIN_CHECK_OK
    // ----------------------------------------------------
    currentStage = "ADMIN_CHECK_OK";
    console.log(`[Admin Delete User] [STAGE: ADMIN_CHECK_OK] Permissão de administrador validada.`);

    // ----------------------------------------------------
    // STAGE 7: TARGET_UID_VALIDATED
    // ----------------------------------------------------
    currentStage = "TARGET_UID_VALIDATED";
    if (!targetUserId || typeof targetUserId !== "string" || !targetUserId.trim()) {
      console.warn(`[Admin Delete User] [STAGE: TARGET_UID_VALIDATED] targetUserId ausente ou inválido.`);
      return res.status(400).json({
        success: false,
        error: "ID do usuário a ser excluído não informado ou inválido.",
        code: "INVALID_TARGET_UID",
        stage: "TARGET_UID_VALIDATED",
      });
    }

    const cleanTargetId = targetUserId.trim();

    // Guard: Administrator cannot delete their own account
    if (cleanTargetId === adminUid) {
      console.warn(`[Admin Delete User] [STAGE: TARGET_UID_VALIDATED] Tentativa de autoexclusão bloqueada para: ${cleanTargetId}`);
      return res.status(403).json({
        success: false,
        error: "Operação não permitida: um administrador não pode excluir a própria conta.",
        code: "SELF_DELETE_FORBIDDEN",
        stage: "TARGET_UID_VALIDATED",
      });
    }

    console.log(`[Admin Delete User] [STAGE: TARGET_UID_VALIDATED] targetUserId validado com sucesso: ${cleanTargetId}`);

    // Verify user exists in Firebase Auth before deletion
    let targetEmail = "";
    let targetName = "";
    let targetRole = "ALUNO";
    let targetStatus = "active";

    // Pre-fetch from Firestore for audit logs
    if (adminFirestore) {
      try {
        const uDoc = await adminFirestore.collection("users").doc(cleanTargetId).get();
        if (uDoc.exists) {
          const uData = uDoc.data();
          targetEmail = uData?.email || "";
          targetName = uData?.name || "";
          targetRole = uData?.role || "ALUNO";
          targetStatus = uData?.status || "active";
        }
      } catch (fsReadErr: any) {
        console.warn(`[Admin Delete User Warning] Falha na leitura preliminar do Firestore:`, fsReadErr?.message);
      }
    }

    // Verify user in Firebase Auth
    try {
      const fbUser = await adminAuth.getUser(cleanTargetId);
      if (!targetEmail) targetEmail = fbUser.email || "";
      if (!targetName) targetName = fbUser.displayName || targetEmail.split("@")[0] || cleanTargetId;
      console.log(`[Admin Delete User] Usuário localizado no Firebase Authentication: ${cleanTargetId} (${targetEmail})`);
    } catch (getUserErr: any) {
      if (getUserErr?.code === "auth/user-not-found") {
        console.warn(`[Admin Delete User] [STAGE: TARGET_UID_VALIDATED] Usuário não encontrado no Firebase Auth: ${cleanTargetId}`);
        return res.status(404).json({
          success: false,
          error: "Usuário não encontrado no Firebase Authentication.",
          code: "USER_NOT_FOUND",
          stage: "TARGET_UID_VALIDATED",
          targetUserId: cleanTargetId,
        });
      }
      console.warn(`[Admin Delete User Warning] Erro ao consultar usuário no Auth:`, getUserErr?.message);
    }

    // ----------------------------------------------------
    // STAGE 10: AUTH_DELETE_START
    // ----------------------------------------------------
    currentStage = "AUTH_DELETE_START";
    console.log(`[Admin Delete User] [STAGE: AUTH_DELETE_START] Excluindo UID ${cleanTargetId} do Firebase Auth...`);

    let authDeleted = false;
    let authErrorCode: string | null = null;
    let authErrorDetail: string | null = null;

    try {
      await adminAuth.deleteUser(cleanTargetId);
      authDeleted = true;
    } catch (delErr: any) {
      authErrorCode = delErr?.code || "auth/unknown";
      authErrorDetail = delErr?.message || String(delErr);
      if (delErr?.code === "auth/user-not-found") {
        console.log(`[Admin Delete User] Usuário ${cleanTargetId} já não constava no Firebase Auth.`);
        authDeleted = true;
      } else {
        console.error(`[Admin Delete User Error] [STAGE: AUTH_DELETE_START]`, {
          code: authErrorCode,
          message: authErrorDetail,
          targetUserId: cleanTargetId,
        });
        return res.status(500).json({
          error: "Não foi possível excluir a conta.",
          code: authErrorCode || "AUTH_DELETE_FAILED",
          stage: "AUTH_DELETE_START",
        });
      }
    }

    // ----------------------------------------------------
    // STAGE 11: AUTH_DELETE_OK
    // ----------------------------------------------------
    currentStage = "AUTH_DELETE_OK";
    console.log(`[Admin Delete User] [STAGE: AUTH_DELETE_OK] Usuário ${cleanTargetId} excluído do Firebase Auth.`);

    // ----------------------------------------------------
    // STAGE 12: FIRESTORE_CLEANUP_START
    // ----------------------------------------------------
    currentStage = "FIRESTORE_CLEANUP_START";
    console.log(`[Admin Delete User] [STAGE: FIRESTORE_CLEANUP_START] Removendo documento /users/${cleanTargetId}...`);

    let firestoreDeleted = false;
    if (adminFirestore) {
      try {
        await adminFirestore.collection("users").doc(cleanTargetId).delete();
        firestoreDeleted = true;
        console.log(`[Admin Delete User] Documento /users/${cleanTargetId} removido do Firestore.`);
      } catch (fsErr: any) {
        console.error(`[Admin Delete User Warning] [STAGE: FIRESTORE_CLEANUP_START] Falha ao remover doc do usuário:`, {
          code: fsErr?.code,
          message: fsErr?.message,
        });
      }

      // Cleanup user private notifications
      try {
        const notifs = await adminFirestore
          .collection("notifications")
          .where("userId", "==", cleanTargetId)
          .get();
        if (!notifs.empty) {
          const batch = adminFirestore.batch();
          notifs.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
          console.log(`[Admin Delete User] ${notifs.size} notificações privadas removidas.`);
        }
      } catch (notifErr: any) {
        console.warn(`[Admin Delete User Warning] Falha ao limpar notificações privadas:`, notifErr?.message);
      }
    }

    // ----------------------------------------------------
    // STAGE 13: FIRESTORE_CLEANUP_OK
    // ----------------------------------------------------
    currentStage = "FIRESTORE_CLEANUP_OK";
    console.log(`[Admin Delete User] [STAGE: FIRESTORE_CLEANUP_OK] Limpeza do Firestore concluída.`);

    // ----------------------------------------------------
    // STAGE 14: AUDIT_START
    // ----------------------------------------------------
    currentStage = "AUDIT_START";
    console.log(`[Admin Delete User] [STAGE: AUDIT_START] Gravando registros imutáveis de auditoria...`);

    if (adminFirestore) {
      try {
        const nowIso = new Date().toISOString();
        const auditLogId = `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await adminFirestore.collection("audit_logs").doc(auditLogId).set({
          id: auditLogId,
          transactionId: `TX-USER-DEL-${Date.now().toString(36).toUpperCase()}`,
          objectId: cleanTargetId,
          objectType: "USER",
          objectTitle: targetName || cleanTargetId,
          action: "ACCOUNT_DELETED",
          actorId: adminUid,
          actorName: "Administrador TI",
          actorEmail: adminEmail,
          actorRole: "ADMIN",
          timestamp: nowIso,
          fieldChanged: "account_lifecycle",
          oldValue: targetStatus,
          newValue: "DELETED",
          details: `Conta do usuário '${targetName || cleanTargetId}' (${targetEmail}) excluída permanentemente pelo administrador ${adminEmail}. Removida do Firebase Auth e do Firestore.`,
          immutable: true,
        });

        const actLogId = `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await adminFirestore.collection("activity_logs").doc(actLogId).set({
          id: actLogId,
          adminId: adminUid,
          adminName: "Administrador TI",
          action: "ACCOUNT_DELETED",
          objectId: cleanTargetId,
          objectType: "USER",
          details: `Conta de '${targetName || cleanTargetId}' (${targetEmail}) excluída permanentemente do Firebase Authentication e do Firestore.`,
          timestamp: nowIso,
        });
      } catch (auditErr: any) {
        console.warn(`[Admin Delete User Warning] [STAGE: AUDIT_START] Falha secundária ao persistir auditoria:`, auditErr?.message);
      }
    }

    // ----------------------------------------------------
    // STAGE 15: AUDIT_OK
    // ----------------------------------------------------
    currentStage = "AUDIT_OK";
    console.log(`[Admin Delete User] [STAGE: AUDIT_OK] Auditoria processada com sucesso.`);

    // ----------------------------------------------------
    // STAGE 16: DELETE_USER_SUCCESS
    // ----------------------------------------------------
    currentStage = "DELETE_USER_SUCCESS";
    console.log(`[Admin Delete User] [STAGE: DELETE_USER_SUCCESS] Operação finalizada com sucesso para ${cleanTargetId}.`);

    return res.status(200).json({
      success: true,
      message: `Conta do usuário '${targetName || cleanTargetId}' excluída com sucesso do Firebase Authentication e do Firestore.`,
      targetUserId: cleanTargetId,
      authDeleted,
      firestoreDeleted,
      stage: "DELETE_USER_SUCCESS",
    });
  } catch (fatalErr: any) {
    console.error(`[Admin Delete User Fatal Error] [STAGE: ${currentStage}] Exceção não tratada capturada:`, {
      stage: currentStage,
      errorName: fatalErr?.name || "Error",
      errorMessage: fatalErr?.message || String(fatalErr),
      errorCode: fatalErr?.code || "UNHANDLED_EXCEPTION",
      stack: fatalErr?.stack,
    });

    if (!res.headersSent) {
      return res.status(500).json({
        error: "Não foi possível excluir a conta.",
        code: "INTERNAL_ERROR",
        stage: currentStage,
      });
    }
  }
}
