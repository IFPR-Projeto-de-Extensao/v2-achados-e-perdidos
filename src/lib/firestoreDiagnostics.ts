import { doc, setDoc, deleteDoc, getDoc } from "firebase/firestore";
import { db, auth } from "./firebase";
import { LostFoundItem, UserRole } from "../types";
import { formatSafeDate } from "./utils";

export interface AddItemDiagnosticResult {
  success: boolean;
  httpStatus: number;
  errorCode: string | null;
  errorMessage: string | null;
  rawResponse: any;
  authContext: {
    isAuthenticated: boolean;
    uid: string | null;
    email: string | null;
    emailVerified: boolean | null;
    detectedRole: UserRole | string;
  };
  securityRuleAnalysis: {
    isPermissionDenied403: boolean;
    likelyCause: string;
    proposedFix: string;
    isSafeForProduction: boolean;
  };
  timestamp: string;
}

/**
 * Runs an exhaustive diagnostic check on Firestore `addItem` operations.
 * Displays full console traces, catches 403 Forbidden / permission-denied errors,
 * analyzes Security Rules constraints, and logs proposed corrections for ACADEMIC/ADMIN roles.
 */
export async function runFirestoreAddItemDiagnostic(
  customRoleOverride?: UserRole | "ACADEMIC"
): Promise<AddItemDiagnosticResult> {
  const timestamp = new Date().toISOString();
  console.group("🔍 [LOCALIZA+ DIAGNÓSTICO FIRESTORE] - Teste de Gravação 'addItem'");
  console.log("Iniciando auditoria de permissões e integridade de escrita no Firestore...", {
    timestamp,
    database: "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1",
  });

  const currentUser = auth.currentUser;
  const isAuth = Boolean(currentUser && currentUser.uid);
  const detectedRole =
    customRoleOverride ||
    (currentUser?.email === "paulocauan39@gmail.com" ? "ADMIN" : "ALUNO");

  const authContext = {
    isAuthenticated: isAuth,
    uid: currentUser?.uid || "diagnostic-guest-uid",
    email: currentUser?.email || null,
    emailVerified: currentUser?.emailVerified || false,
    detectedRole,
  };

  console.info("📌 Contexto de Autenticação Atual:", authContext);

  const testItemId = `diag-item-${Date.now()}`;
  const testPayload: LostFoundItem = {
    id: testItemId,
    title: "Objeto de Diagnóstico Automatizado",
    description: "Sonda de teste para verificação de permissões e security rules no Firestore.",
    category: "Eletrônicos",
    type: "ENCONTRADO",
    status: "ENCONTRADO",
    color: "Azul",
    brand: "IFPR Test",
    imageUrl: "https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=500&auto=format&fit=crop&q=60",
    contactInfo: "Guarita Principal - Campus Ivaiporã",
    location: "Laboratório de Informática - Bloco A",
    date: formatSafeDate(new Date()),
    registeredByUserId: authContext.uid,
    registeredByName: currentUser?.displayName || "Agente Diagnóstico IFPR",
    registeredByRole: (detectedRole as UserRole) || "ALUNO",
    qrCodeId: `QR-IFPR-DIAG-${Date.now().toString().slice(-4)}`,
    createdAt: timestamp,
    storageDeadlineDays: 90,
    storageDeadlineDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    history: [
      {
        id: `hist-diag-${Date.now()}`,
        action: "Sonda diagnóstica criada",
        actorId: authContext.uid,
        actorName: "Diagnóstico IFPR",
        actorRole: (detectedRole as UserRole) || "ALUNO",
        timestamp,
        details: "Validação de escrita para usuários autenticados (ACADEMIC/ADMIN/ALUNO).",
      },
    ],
  };

  console.log("📤 Payload de Teste Enviado para doc('items', '" + testItemId + "'):", testPayload);

  let result: AddItemDiagnosticResult;

  try {
    const docRef = doc(db, "items", testItemId);
    await setDoc(docRef, testPayload);

    console.log("📥 Resposta do Firestore: Requisição bem-sucedida (Status 200 OK / Documento Gravado).");

    // Verify written doc
    const snap = await getDoc(docRef);
    const docData = snap.data();

    // Clean up probe document
    try {
      await deleteDoc(docRef);
      console.log("🧹 Documento de sonda de teste removido com sucesso.");
    } catch (cleanupErr) {
      console.warn("⚠️ Aviso na limpeza do documento de teste:", cleanupErr);
    }

    result = {
      success: true,
      httpStatus: 200,
      errorCode: null,
      errorMessage: null,
      rawResponse: { exists: snap.exists(), data: docData },
      authContext,
      securityRuleAnalysis: {
        isPermissionDenied403: false,
        likelyCause: "Nenhuma falha detectada. As Security Rules autorizaram a escrita com sucesso.",
        proposedFix: "Manter regras vigentes com validação estrita de schema e tipos.",
        isSafeForProduction: true,
      },
      timestamp,
    };

    console.table({
      Status: "SUCESSO (200 OK)",
      Permissao: "CONCEDIDA",
      Papel: authContext.detectedRole,
      Usuario: authContext.email || authContext.uid,
    });
  } catch (error: any) {
    const errCode = error?.code || "unknown";
    const errMsg = error?.message || String(error);
    const isPermissionDenied =
      errCode === "permission-denied" ||
      errMsg.includes("permission-denied") ||
      errMsg.includes("Missing or insufficient permissions") ||
      errMsg.includes("403");

    console.error("❌ Resposta de Erro do Firestore:", {
      code: errCode,
      message: errMsg,
      fullError: error,
    });

    let likelyCause = "Erro desconhecido de comunicação com o Firestore.";
    let proposedFix = "Verifique a conectividade de rede e a configuração do Firebase.";

    if (isPermissionDenied) {
      if (!isAuth) {
        likelyCause =
          "Usuário não autenticado tentando gravar com 'registeredByRole' restrito ou regras exigindo isSignedIn().";
        proposedFix =
          "Exigir login prévio ou permitir criação de ocorrências públicas por visitantes com role != 'ADMIN'.";
      } else if (detectedRole === "ADMIN" || (detectedRole as string) === "ACADEMIC") {
        likelyCause =
          "O usuário está autenticado como " +
          detectedRole +
          ", mas as regras em 'match /items/{itemId}' exigem isAdmin() com verificação em doc /users/{uid} ainda não sincronizado ou custom claim ausente.";
        proposedFix =
          "Atualizar 'firestore.rules' para permitir que usuários autenticados (com roles ACADEMIC, ALUNO, SERVIDOR, ADMIN) gravem ocorrências associadas ao seu 'request.auth.uid' sem exigir dependências circulares de documentos.";
      } else {
        likelyCause =
          "Mismatch entre 'registeredByUserId' no payload e 'request.auth.uid' na regra de validação.";
        proposedFix =
          "Garantir que 'registeredByUserId' seja igual a 'request.auth.uid' quando 'isSignedIn()' for verdadeiro.";
      }
    }

    result = {
      success: false,
      httpStatus: isPermissionDenied ? 403 : 500,
      errorCode: errCode,
      errorMessage: errMsg,
      rawResponse: error,
      authContext,
      securityRuleAnalysis: {
        isPermissionDenied403: isPermissionDenied,
        likelyCause,
        proposedFix,
        isSafeForProduction: false,
      },
      timestamp,
    };

    console.warn("🛡️ Análise de Segurança & Diagnóstico 403:", {
      Erro403: isPermissionDenied,
      CausaProvavel: likelyCause,
      CorrecaoProposta: proposedFix,
    });
  }

  console.groupEnd();

  // Expose on global window object for browser devtools testing
  if (typeof window !== "undefined") {
    (window as any).__lastFirestoreDiagnostic = result;
  }

  return result;
}

// Bind to window for manual testing in console: window.runFirestoreDiagnostics()
if (typeof window !== "undefined") {
  (window as any).runFirestoreDiagnostics = runFirestoreAddItemDiagnostic;
}
