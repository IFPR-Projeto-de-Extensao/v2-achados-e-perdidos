/**
 * LOCALIZA+ v1.10.13 — Pipeline Canônico de Autorização, Sanitização e Persistência de Cadastro de Objetos
 *
 * Centraliza em funções puras e determinísticas:
 * 1. Elegibilidade de cadastro de objetos para todos os 8 perfis institucionais (sem degradar
 *    contas Gmail promovidas administrativamente para SERVIDOR/ADMIN ou ALUNO);
 * 2. Guarda de acesso da tela de cadastro (RegisterItemView);
 * 3. Construção sanitizada do lote atômico (/items, /item_history e condicional /item_private),
 *    garantindo conformidade com firestore.rules tanto em addItem quanto em syncOfflineQueue;
 * 4. Avaliador estático/local espelhando firestore.rules (EXCLUSIVAMENTE para diagnóstico local
 *    e testes unitários — NÃO substitui Firestore Emulator nem comprova regras publicadas em produção).
 */

import { LostFoundItem, User, UserRole } from "../types";
import { isAccountBlocked, isUserAccountActive } from "./accountStatusUtils";
import { isVerifiedRootAdminAuthUser, ROOT_ADMIN_EMAIL, ROOT_ADMIN_UID } from "./devolutionAuth";
import {
  buildFirestoreItemCreatePayload,
  PRIVATE_ITEM_FIELDS,
} from "./itemPrivacyUtils";
import { calculatePayloadSizeBytes } from "./payloadSizeGuard";
import { sanitizeFirestoreData } from "./shared-constants";
import { validateItemTextFields } from "./utils";
import firebaseConfig from "../../firebase-applet-config.json";

export const TARGET_FIRESTORE_DATABASE_ID: string =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1";

export type AuthorizedItemWriterRole = "ADMIN" | "SERVIDOR";

export type RegistrationDenialReasonCode =
  | "AUTH_LOADING"
  | "UNAUTHENTICATED"
  | "EMAIL_NOT_VERIFIED"
  | "TOKEN_EMAIL_NOT_VERIFIED"
  | "ACCOUNT_SUSPENDED"
  | "ACCOUNT_BLOCKED"
  | "ROLE_ALUNO_FORBIDDEN"
  | "ROLE_INTRUSO_FORBIDDEN"
  | "APPROVAL_PENDING"
  | "USER_DOC_MISSING_OR_INELIGIBLE"
  | "UID_MISMATCH";

export interface RegistrationAuthLike {
  uid?: string | null;
  email?: string | null;
  emailVerified?: boolean;
  displayName?: string | null;
}

export interface ItemRegistrationEligibilityResult {
  allowed: boolean;
  effectiveRole?: AuthorizedItemWriterRole;
  isRootAdmin: boolean;
  reasonCode?: RegistrationDenialReasonCode;
  userMessage?: string;
}

function isUserDocStandingBlocked(docData: Partial<User> | Record<string, any> | null | undefined): {
  blocked: boolean;
  reasonCode?: "ACCOUNT_SUSPENDED" | "ACCOUNT_BLOCKED";
} {
  if (!docData || typeof docData !== "object") {
    return { blocked: false };
  }
  const raw = docData as Record<string, any>;
  if (raw.active === false) {
    return { blocked: true, reasonCode: "ACCOUNT_BLOCKED" };
  }
  if (isAccountBlocked(docData as Partial<User>)) {
    const status = String(raw.status || "").toLowerCase();
    return {
      blocked: true,
      reasonCode: status === "suspended" ? "ACCOUNT_SUSPENDED" : "ACCOUNT_BLOCKED",
    };
  }
  if (!isUserAccountActive(docData as Partial<User>)) {
    return { blocked: true, reasonCode: "ACCOUNT_BLOCKED" };
  }
  return { blocked: false };
}

/**
 * Avalia de forma única, estrita e fail-closed se um usuário autenticado pode criar objetos
 * em /items (+ /item_history + /item_private), cobrindo todos os 8 perfis da matriz oficial.
 *
 * Regras preservadas:
 * - Root Admin exige UID + e-mail + emailVerified === true (pinning estrito), e não é bloqueado
 *   quando `userDoc.active` é `null` ou ausente; porém é bloqueado se o documento declarar
 *   explicitamente `status: 'suspended' | 'banned' | 'inactive'` ou `active: false`.
 * - Contas externas (ex: @gmail.com) com papel `SERVIDOR` ou `ADMIN` aprovado no documento
 *   `/users/{uid}` são autorizadas normalmente (precedência da atribuição administrativa sobre domínio).
 * - `ALUNO`, `INTRUSO`, `SERVIDOR` pendente, `ADMIN` não-root pendente, contas suspensas e
 *   contas bloqueadas/inativas são sempre negados.
 */
export function evaluateItemRegistrationEligibility(params: {
  authUser: RegistrationAuthLike | null | undefined;
  isGuest?: boolean;
  isAuthLoading?: boolean;
  tokenEmailVerified?: boolean | null;
  userDocData?: Partial<User> | Record<string, any> | null;
  isOnline?: boolean;
}): ItemRegistrationEligibilityResult {
  const {
    authUser,
    isGuest = false,
    isAuthLoading = false,
    tokenEmailVerified,
    userDocData,
    isOnline = true,
  } = params;

  if (isAuthLoading) {
    return {
      allowed: false,
      isRootAdmin: false,
      reasonCode: "AUTH_LOADING",
      userMessage: "Autenticação em carregamento: Aguarde a inicialização da sessão Firebase.",
    };
  }

  if (!authUser || !authUser.uid || !authUser.email || isGuest) {
    return {
      allowed: false,
      isRootAdmin: false,
      reasonCode: "UNAUTHENTICATED",
      userMessage: "É necessário fazer login com sua conta institucional para cadastrar um item.",
    };
  }

  if (authUser.emailVerified !== true) {
    return {
      allowed: false,
      isRootAdmin: false,
      reasonCode: "EMAIL_NOT_VERIFIED",
      userMessage: "Seu e-mail institucional precisa ser verificado para cadastrar itens no sistema.",
    };
  }

  if (tokenEmailVerified === false) {
    return {
      allowed: false,
      isRootAdmin: false,
      reasonCode: "TOKEN_EMAIL_NOT_VERIFIED",
      userMessage:
        "Token Firebase sem confirmação de e-mail verificado. Faça login novamente após verificar seu e-mail.",
    };
  }

  const isRootAdmin = isVerifiedRootAdminAuthUser(authUser);

  // Standing check: se o documento indicar explicitamente suspensão, banimento ou desativação, negar
  if (userDocData) {
    const standing = isUserDocStandingBlocked(userDocData);
    if (standing.blocked) {
      return {
        allowed: false,
        isRootAdmin,
        reasonCode: standing.reasonCode,
        userMessage:
          standing.reasonCode === "ACCOUNT_SUSPENDED"
            ? "Ação bloqueada: Conta suspensa."
            : "Ação bloqueada: Conta bloqueada ou desativada.",
      };
    }
  }

  if (isRootAdmin) {
    return {
      allowed: true,
      effectiveRole: "ADMIN",
      isRootAdmin: true,
    };
  }

  if (!userDocData || typeof userDocData !== "object") {
    return {
      allowed: false,
      isRootAdmin: false,
      reasonCode: "USER_DOC_MISSING_OR_INELIGIBLE",
      userMessage: isOnline
        ? "Perfil sem autorização persistida no Firestore (/users): apenas Servidores/TAE e Administradores ativos e aprovados podem cadastrar objetos."
        : "Sem conexão e sem perfil institucional ativo/aprovado confirmado para cadastrar itens.",
    };
  }

  const role = userDocData.role as UserRole | undefined;
  const approvalStatus = userDocData.approvalStatus;

  if (role === "ALUNO") {
    return {
      allowed: false,
      isRootAdmin: false,
      reasonCode: "ROLE_ALUNO_FORBIDDEN",
      userMessage:
        "Permissão negada: apenas Servidores/TAE e Administradores aprovados podem cadastrar objetos no Localiza+.",
    };
  }

  if (!role || role === "INTRUSO") {
    return {
      allowed: false,
      isRootAdmin: false,
      reasonCode: "ROLE_INTRUSO_FORBIDDEN",
      userMessage:
        "Permissão negada: contas externas sem atribuição institucional aprovada não podem cadastrar objetos.",
    };
  }

  if (role !== "ADMIN" && role !== "SERVIDOR") {
    return {
      allowed: false,
      isRootAdmin: false,
      reasonCode: "USER_DOC_MISSING_OR_INELIGIBLE",
      userMessage:
        "Perfil sem autorização persistida no Firestore (/users): apenas Servidores/TAE e Administradores ativos e aprovados podem cadastrar objetos.",
    };
  }

  if (approvalStatus !== "APROVADO") {
    return {
      allowed: false,
      isRootAdmin: false,
      reasonCode: "APPROVAL_PENDING",
      userMessage:
        "Seu cadastro institucional ainda aguarda aprovação administrativa para registrar objetos.",
    };
  }

  return {
    allowed: true,
    effectiveRole: role,
    isRootAdmin: false,
  };
}

/**
 * Guarda de interface para RegisterItemView.tsx alinhado à matriz oficial de 8 perfis.
 */
export function evaluateRegisterViewAccess(params: {
  isAuthLoading: boolean;
  isGuest: boolean;
  currentUser: Partial<User> | null | undefined;
  authUser?: RegistrationAuthLike | null;
}): {
  showsLoading: boolean;
  showsGuestScreen: boolean;
  isUnauthorized: boolean;
  canRegister: boolean;
  reasonCode?: RegistrationDenialReasonCode;
} {
  const { isAuthLoading, isGuest, currentUser, authUser } = params;

  if (isAuthLoading) {
    return {
      showsLoading: true,
      showsGuestScreen: false,
      isUnauthorized: false,
      canRegister: false,
      reasonCode: "AUTH_LOADING",
    };
  }

  if (isGuest) {
    return {
      showsLoading: false,
      showsGuestScreen: true,
      isUnauthorized: false,
      canRegister: false,
      reasonCode: "UNAUTHENTICATED",
    };
  }

  const effectiveAuth: RegistrationAuthLike = authUser
    ? authUser
    : {
        uid: currentUser?.id,
        email: currentUser?.email,
        emailVerified: currentUser?.emailVerified ?? true,
      };

  const eligibility = evaluateItemRegistrationEligibility({
    authUser: effectiveAuth,
    isGuest: false,
    isAuthLoading: false,
    userDocData: currentUser,
  });

  return {
    showsLoading: false,
    showsGuestScreen: false,
    isUnauthorized: !eligibility.allowed,
    canRegister: eligibility.allowed,
    reasonCode: eligibility.reasonCode,
  };
}

/**
 * Constrói um registro sanitizado para /item_history/{entryId} garantidamente compatível
 * com firestore.rules:
 * - remove qualquer dos 40 campos protegidos de devolução/assinatura/segredo;
 * - vincula actorId/userId estritamente ao authUid;
 * - alinha actorRole/userRole estritamente ao effectiveRole ('ADMIN' | 'SERVIDOR');
 * - garante objectId, itemId e action não-vazios.
 */
export function buildSanitizedInitialHistoryEntry(params: {
  itemId: string;
  itemType: string;
  itemLocation: string;
  authUid: string;
  actorName: string;
  effectiveRole: AuthorizedItemWriterRole;
  rawHistoryEntry?: Record<string, any> | null;
  createdAt?: string;
}): { entryId: string; payload: Record<string, any> } {
  const {
    itemId,
    itemType,
    itemLocation,
    authUid,
    actorName,
    effectiveRole,
    rawHistoryEntry,
    createdAt,
  } = params;

  const base: Record<string, any> =
    rawHistoryEntry && typeof rawHistoryEntry === "object" ? { ...rawHistoryEntry } : {};

  for (const forbidden of PRIVATE_ITEM_FIELDS) {
    delete base[forbidden];
  }

  const rawId = typeof base.id === "string" && base.id.trim().length > 0 ? base.id.trim() : "";
  const entryId = rawId || `hist-${itemId}-init`;

  const rawAction =
    typeof base.action === "string" && base.action.trim().length > 0
      ? base.action.trim()
      : "Ocorrência cadastrada";

  const timestamp =
    typeof base.timestamp === "string" && base.timestamp.trim().length > 0
      ? base.timestamp
      : createdAt || new Date().toISOString();

  const resolvedActorName =
    (typeof base.actorName === "string" && base.actorName.trim()) ||
    actorName ||
    "Usuário IFPR";

  const payload = sanitizeFirestoreData({
    ...base,
    id: entryId,
    itemId,
    objectId: itemId,
    action: rawAction,
    actorId: authUid,
    actorName: resolvedActorName,
    actorRole: effectiveRole,
    userId: authUid,
    userName: resolvedActorName,
    userRole: effectiveRole,
    timestamp,
    details:
      (typeof base.details === "string" && base.details.trim()) ||
      `Ocorrência registrada no sistema do IFPR Campus Ivaiporã como ${itemType}.`,
    transactionId:
      (typeof base.transactionId === "string" && base.transactionId.trim()) ||
      `tx-init-${itemId}`,
    newValue:
      (typeof base.newValue === "string" && base.newValue.trim()) ||
      `Tipo: ${itemType} | Local: ${itemLocation}`,
  });

  return { entryId, payload };
}

/**
 * Constrói o documento opcional para /item_private/{itemId} quando houver metadados secretos.
 */
export function buildSanitizedItemPrivatePayload(params: {
  itemId: string;
  authUid: string;
  secretVerificationHint?: unknown;
  secretVerificationKey?: unknown;
  updatedAt?: string;
}): Record<string, any> | null {
  const { itemId, authUid, secretVerificationHint, secretVerificationKey, updatedAt } = params;
  const normalizedHint =
    typeof secretVerificationHint === "string"
      ? secretVerificationHint.trim() || undefined
      : secretVerificationHint === null
        ? undefined
        : secretVerificationHint;
  const normalizedKey =
    typeof secretVerificationKey === "string"
      ? secretVerificationKey.trim() || undefined
      : secretVerificationKey === null
        ? undefined
        : secretVerificationKey;

  if (normalizedHint === undefined && normalizedKey === undefined) {
    return null;
  }
  return sanitizeFirestoreData({
    itemId,
    registeredByUserId: authUid,
    ...(normalizedHint !== undefined ? { secretVerificationHint: normalizedHint } : {}),
    ...(normalizedKey !== undefined ? { secretVerificationKey: normalizedKey } : {}),
    updatedAt: updatedAt || new Date().toISOString(),
  });
}

export interface ItemRegistrationWritePlan {
  itemId: string;
  databaseId: string;
  targetCollections: Array<"items" | "item_history" | "item_private">;
  itemPayload: Record<string, any>;
  historyEntryId: string;
  historyPayload: Record<string, any>;
  privatePayload: Record<string, any> | null;
  payloadSizeBytes: number;
}

/**
 * Constrói o plano atômico único de gravação (writeBatch) usado tanto por addItem quanto
 * por syncOfflineQueue, garantindo paridade completa entre envio online e sincronização offline.
 */
export function buildItemRegistrationWritePlan(params: {
  item: LostFoundItem | Record<string, any>;
  authUid: string;
  actorName: string;
  effectiveRole: AuthorizedItemWriterRole;
  rawHistoryEntry?: Record<string, any> | null;
}): ItemRegistrationWritePlan {
  const { item, authUid, actorName, effectiveRole, rawHistoryEntry } = params;
  const itemId = String(item.id);

  const publicBase = buildFirestoreItemCreatePayload({
    ...(item as Record<string, any>),
    id: itemId,
    registeredByUserId: authUid,
    registeredByRole: effectiveRole,
  });
  const itemPayload = sanitizeFirestoreData({
    ...publicBase,
    id: itemId,
    registeredByUserId: authUid,
    registeredByRole: effectiveRole,
  });

  const firstHistory =
    rawHistoryEntry ??
    (Array.isArray((item as any).history) && (item as any).history.length > 0
      ? (item as any).history[0]
      : null);

  const { entryId: historyEntryId, payload: historyPayload } = buildSanitizedInitialHistoryEntry({
    itemId,
    itemType: String(item.type || "ENCONTRADO"),
    itemLocation: String(item.location || ""),
    authUid,
    actorName: actorName || String(item.registeredByName || "Usuário IFPR"),
    effectiveRole,
    rawHistoryEntry: firstHistory,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : undefined,
  });

  const privatePayload = buildSanitizedItemPrivatePayload({
    itemId,
    authUid,
    secretVerificationHint: (item as any).secretVerificationHint,
    secretVerificationKey: (item as any).secretVerificationKey,
  });

  const targetCollections: Array<"items" | "item_history" | "item_private"> = privatePayload
    ? ["items", "item_history", "item_private"]
    : ["items", "item_history"];

  const payloadSizeBytes = calculatePayloadSizeBytes(itemPayload);

  return {
    itemId,
    databaseId: TARGET_FIRESTORE_DATABASE_ID,
    targetCollections,
    itemPayload,
    historyEntryId,
    historyPayload,
    privatePayload,
    payloadSizeBytes,
  };
}

/**
 * Avaliador ESTÁTICO LOCAL espelhando fielmente `firestore.rules` (SHA-256 2f2a2ffc...) para
 * diagnóstico e testes unitários determinísticos quando o Firestore Emulator não está disponível.
 *
 * AVISO TRANSPARENTE: Este avaliador é puramente sintético/local e NÃO substitui a execução real
 * das regras no Firebase/Firestore de produção nem no Cloud Firestore Emulator.
 */
export function evaluateLocalRulesMirrorForRegistrationBatch(params: {
  auth: {
    uid: string;
    email?: string | null;
    email_verified?: boolean;
    role?: string | null;
    admin?: boolean;
  } | null;
  userDoc: Record<string, any> | null;
  writePlan: ItemRegistrationWritePlan;
  nowMs?: number;
  strictNullTimestampBehavior?: "CURRENT_RULES_2F2A" | "CANDIDATE_FIXED";
  rulesProfile?: "LOCAL_FIRESTORE_RULES" | "LEGACY_WITHOUT_HISTORY_OR_PRIVATE";
}): {
  evaluatorMode: "LOCAL_STATIC_MIRROR_NOT_LIVE_FIREBASE";
  batchAllowed: boolean;
  perCollection: {
    items: { allowed: boolean; failedChecks: string[] };
    item_history: { allowed: boolean; failedChecks: string[] };
    item_private: { allowed: boolean; skipped?: boolean; failedChecks: string[] };
  };
} {
  const {
    auth,
    userDoc,
    writePlan,
    nowMs = Date.now(),
    strictNullTimestampBehavior = "CURRENT_RULES_2F2A",
    rulesProfile = "LOCAL_FIRESTORE_RULES",
  } = params;

  const isSignedIn = Boolean(auth && auth.uid);
  const hasVerifiedEmailToken = Boolean(auth && auth.email_verified === true);
  const lowerEmail = typeof auth?.email === "string" ? auth.email.toLowerCase() : "";
  const isRootIdentity = Boolean(
    isSignedIn && auth!.uid === ROOT_ADMIN_UID && lowerEmail === ROOT_ADMIN_EMAIL
  );

  const toTimestampMs = (val: unknown): number | null => {
    if (!val) return null;
    if (typeof val === "number") return val;
    if (val instanceof Date) return val.getTime();
    if (typeof val === "object" && typeof (val as any).toMillis === "function") {
      return (val as any).toMillis();
    }
    if (typeof val === "object" && typeof (val as any).seconds === "number") {
      return (val as any).seconds * 1000;
    }
    return null;
  };

  const isStandingActive = (u: Record<string, any>): boolean => {
    const hasB = "blockExpiresAt" in u;
    const hasS = "suspendedUntil" in u;
    const statusVal = "status" in u ? u.status : "active";
    const activeOk = !("active" in u) || u.active !== false;

    const bMs = toTimestampMs(u.blockExpiresAt);
    const sMs = toTimestampMs(u.suspendedUntil);

    const bOk =
      strictNullTimestampBehavior === "CANDIDATE_FIXED"
        ? !hasB || u.blockExpiresAt === null || (bMs !== null && nowMs >= bMs)
        : !hasB || (bMs !== null && nowMs >= bMs);

    const sOk =
      strictNullTimestampBehavior === "CANDIDATE_FIXED"
        ? !hasS ||
          (u.suspendedUntil === null && statusVal === "active") ||
          (sMs !== null && nowMs >= sMs)
        : !hasS || (sMs !== null && nowMs >= sMs);

    const statusOk =
      statusVal === "active" ||
      (statusVal === "suspended" &&
        hasS &&
        (strictNullTimestampBehavior === "CANDIDATE_FIXED" ? u.suspendedUntil !== null : true));

    return activeOk && bOk && sOk && statusOk;
  };

  const isUserDocActiveData = (u: Record<string, any>): boolean => {
    return (!("role" in u) || u.role !== "INTRUSO") && isStandingActive(u);
  };

  const hasApprovedAdminRole = (u: Record<string, any>): boolean =>
    "role" in u && u.role === "ADMIN" && "approvalStatus" in u && u.approvalStatus === "APROVADO";

  const hasApprovedServidorRole = (u: Record<string, any>): boolean =>
    "role" in u && u.role === "SERVIDOR" && "approvalStatus" in u && u.approvalStatus === "APROVADO";

  const isActiveStaffOrAdminForRole = (u: Record<string, any>, role: string): boolean => {
    return (
      isUserDocActiveData(u) &&
      "approvalStatus" in u &&
      u.approvalStatus === "APROVADO" &&
      "role" in u &&
      ((role === "ADMIN" && u.role === "ADMIN") ||
        (role === "SERVIDOR" && (u.role === "SERVIDOR" || u.role === "ADMIN")))
    );
  };

  const isStaffOrAdminActive =
    isSignedIn &&
    hasVerifiedEmailToken &&
    (isRootIdentity ||
      (Boolean(userDoc) &&
        isUserDocActiveData(userDoc!) &&
        (hasApprovedAdminRole(userDoc!) || hasApprovedServidorRole(userDoc!))));

  const hasForbiddenFields = (data: Record<string, any>): boolean =>
    PRIVATE_ITEM_FIELDS.some((k) => k in data);

  // 1. Evaluate /items/{itemId} create
  const itemFails: string[] = [];
  const incItem = writePlan.itemPayload;
  const textCheck = validateItemTextFields(
    {
      title: incItem.title,
      description: incItem.description,
      location: incItem.location,
      color: incItem.color,
      brand: incItem.brand,
      contactInfo: incItem.contactInfo,
    },
    true
  );
  if (!textCheck.isValid) itemFails.push(`isValidItemTextFields:${textCheck.field}`);
  if (!isSignedIn) itemFails.push("isSignedIn");
  if (!hasVerifiedEmailToken) itemFails.push("hasVerifiedEmailToken");
  if (!auth || incItem.registeredByUserId !== auth.uid) itemFails.push("registeredByUserId!=auth.uid");
  if (incItem.registeredByRole !== "SERVIDOR" && incItem.registeredByRole !== "ADMIN") {
    itemFails.push("registeredByRole_not_staff_or_admin");
  }
  if (incItem.status === "DEVOLVIDO" || incItem.status === "ENCERRADO") {
    itemFails.push("status_forbidden_on_create");
  }
  if (hasForbiddenFields(incItem)) itemFails.push("hasNoReturnOrSignatureFields");
  if (
    !isRootIdentity &&
    (!userDoc || !isActiveStaffOrAdminForRole(userDoc, String(incItem.registeredByRole || "")))
  ) {
    itemFails.push("isActiveStaffOrAdminForRole");
  }

  // 2. Evaluate /item_history/{entryId} create
  const histFails: string[] = [];
  const incHist = writePlan.historyPayload;
  if (rulesProfile === "LEGACY_WITHOUT_HISTORY_OR_PRIVATE") {
    histFails.push("default_deny_catch_all_missing_item_history_match");
  } else {
    if (!isSignedIn) histFails.push("isSignedIn");
    if (!hasVerifiedEmailToken) histFails.push("hasVerifiedEmailToken");
    if (!auth || incHist.actorId !== auth.uid) histFails.push("actorId!=auth.uid");
    if (typeof incHist.objectId !== "string" || incHist.objectId.length === 0) {
      histFails.push("objectId_empty");
    }
    if (typeof incHist.action !== "string" || incHist.action.length === 0) {
      histFails.push("action_empty");
    }
    if (hasForbiddenFields(incHist)) histFails.push("hasNoReturnOrSignatureFields");
    const histRoleOk =
      (isRootIdentity &&
        (!("actorRole" in incHist) ||
          incHist.actorRole === "ADMIN" ||
          incHist.actorRole === "SERVIDOR")) ||
      (Boolean(userDoc) &&
        isUserDocActiveData(userDoc!) &&
        ((hasApprovedAdminRole(userDoc!) &&
          (!("actorRole" in incHist) ||
            incHist.actorRole === "ADMIN" ||
            incHist.actorRole === "SERVIDOR")) ||
          (hasApprovedServidorRole(userDoc!) &&
            (!("actorRole" in incHist) || incHist.actorRole === "SERVIDOR"))));
    if (!histRoleOk) histFails.push("canUserDocCreateItemHistory");
  }

  // 3. Evaluate /item_private/{itemId} create (conditional)
  const privFails: string[] = [];
  let privSkipped = false;
  if (!writePlan.privatePayload) {
    privSkipped = true;
  } else if (rulesProfile === "LEGACY_WITHOUT_HISTORY_OR_PRIVATE") {
    privFails.push("default_deny_catch_all_missing_item_private_match");
  } else {
    const incPriv = writePlan.privatePayload;
    if (!isStaffOrAdminActive) privFails.push("isStaffOrAdminActive");
    if ("itemId" in incPriv && incPriv.itemId !== writePlan.itemId) {
      privFails.push("itemId_mismatch");
    }
    if (
      strictNullTimestampBehavior === "CANDIDATE_FIXED" &&
      "registeredByUserId" in incPriv &&
      (!auth || incPriv.registeredByUserId !== auth.uid)
    ) {
      privFails.push("registeredByUserId_mismatch");
    }
  }

  const itemsAllowed = itemFails.length === 0;
  const histAllowed = histFails.length === 0;
  const privAllowed = privSkipped || privFails.length === 0;

  return {
    evaluatorMode: "LOCAL_STATIC_MIRROR_NOT_LIVE_FIREBASE",
    batchAllowed: itemsAllowed && histAllowed && privAllowed,
    perCollection: {
      items: { allowed: itemsAllowed, failedChecks: itemFails },
      item_history: { allowed: histAllowed, failedChecks: histFails },
      item_private: {
        allowed: privAllowed,
        ...(privSkipped ? { skipped: true } : {}),
        failedChecks: privFails,
      },
    },
  };
}

/**
 * Determines whether an item resulting from a registration attempt should be
 * reflected in the live catalog list (`items` state):
 * - CONFIRMED: yes (persisted in Firestore).
 * - PENDING_SYNC: yes (explicitly marked `isOfflineQueued: true` while awaiting connection).
 * - ERROR: NO (permanent/authorization/size errors stay safely preserved in IndexedDB
 *   sync_queue and activeUploadTasks, never polluting the catalog with false confirmations).
 */
export function shouldIncludeRegistrationItemInCatalog(
  persistenceStatus: "CONFIRMED" | "PENDING_SYNC" | "ERROR"
): boolean {
  return persistenceStatus === "CONFIRMED" || persistenceStatus === "PENDING_SYNC";
}

/**
 * Deterministically merges a newly confirmed item (and its initial history entry)
 * into the in-memory public catalog reference (`rawPublicItemsRef`) and history map
 * (`itemHistoryEntriesRef`) immediately after Firestore commit confirmation.
 *
 * Eliminates the out-of-order snapshot race condition where `/item_history` `onSnapshot`
 * fires before `/items` `onSnapshot` and recomputes `items` from a stale `rawPublicItemsRef`,
 * which previously caused a newly registered object to briefly vanish from the catalog.
 */
export function mergeConfirmedItemIntoCatalogSnapshot<
  TItem extends { id: string; isOfflineQueued?: boolean; syncedAt?: string },
  THistory extends { id: string; timestamp?: string }
>(params: {
  prevRawPublicItems: TItem[];
  prevHistoryMap: Record<string, THistory[]>;
  confirmedPublicItem: TItem;
  initialHistoryEntry?: THistory | null;
}): {
  nextRawPublicItems: TItem[];
  nextHistoryMap: Record<string, THistory[]>;
} {
  const { prevRawPublicItems, prevHistoryMap, confirmedPublicItem, initialHistoryEntry } = params;
  const cleanConfirmed: TItem = {
    ...confirmedPublicItem,
    isOfflineQueued: false,
  };

  const nextRawPublicItems: TItem[] = [
    cleanConfirmed,
    ...(prevRawPublicItems || []).filter((it) => it && it.id !== cleanConfirmed.id),
  ];

  const nextHistoryMap: Record<string, THistory[]> = { ...(prevHistoryMap || {}) };
  if (initialHistoryEntry && initialHistoryEntry.id) {
    const existingList = Array.isArray(nextHistoryMap[cleanConfirmed.id])
      ? nextHistoryMap[cleanConfirmed.id]
      : [];
    const withoutDup = existingList.filter((h) => h && h.id !== initialHistoryEntry.id);
    nextHistoryMap[cleanConfirmed.id] = [...withoutDup, initialHistoryEntry];
  }

  return {
    nextRawPublicItems,
    nextHistoryMap,
  };
}

