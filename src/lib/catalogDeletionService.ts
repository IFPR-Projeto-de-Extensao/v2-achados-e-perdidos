import {
  Firestore,
  doc,
  getDocFromServer,
  deleteDoc,
  writeBatch,
  DocumentReference,
  DocumentSnapshot,
} from "firebase/firestore";
import { LostFoundItem, User } from "../types";
import { isVerifiedRootAdminIdentity } from "./devolutionAuth";

export type CatalogSyncState = "loading" | "authoritative" | "offline-fallback";

export type CatalogDisplayMode =
  | "online-items"
  | "online-empty"
  | "online-loading"
  | "offline-fallback"
  | "offline-empty";

export interface CatalogDisplayResolution {
  displayItems: LostFoundItem[];
  mode: CatalogDisplayMode;
  showOfflineBanner: boolean;
  canCacheDisplayedItems: boolean;
}

export interface CatalogSnapshotClassification {
  isAuthoritative: boolean;
  nextSyncState: CatalogSyncState;
  shouldApplyTombstones: boolean;
  canPersistEmptyAuthoritativeSnapshot: boolean;
  canClearOfflineCaches: boolean;
  canReconcileOfflineCaches: boolean;
}

/**
 * ACHADO-01: Classifies a Firestore `onSnapshot` emission strictly by server confirmation
 * (`fromCache === false`), NEVER trusting `navigator.onLine` as proof of Firestore connectivity.
 *
 * Guarantees:
 * - A snapshot with `fromCache === true` is NEVER authoritative.
 * - Tombstones are ALWAYS applied to `fromCache === true` snapshots.
 * - Empty `fromCache === true` snapshots NEVER wipe IndexedDB, localStorage, or SW caches.
 * - Only `fromCache === false` can transition `catalogSyncState` to `"authoritative"`,
 *   confirm an empty catalog, or clear/reconcile offline caches.
 */
export function classifyCatalogSnapshot(params: {
  fromCache: boolean;
  isOnline: boolean;
  hasPreviousAuthoritativeSnapshot: boolean;
}): CatalogSnapshotClassification {
  if (params.fromCache) {
    return {
      isAuthoritative: false,
      nextSyncState: params.hasPreviousAuthoritativeSnapshot
        ? "authoritative"
        : params.isOnline
        ? "loading"
        : "offline-fallback",
      shouldApplyTombstones: true,
      canPersistEmptyAuthoritativeSnapshot: false,
      canClearOfflineCaches: false,
      canReconcileOfflineCaches: false,
    };
  }

  return {
    isAuthoritative: true,
    nextSyncState: "authoritative",
    shouldApplyTombstones: false,
    canPersistEmptyAuthoritativeSnapshot: true,
    canClearOfflineCaches: true,
    canReconcileOfflineCaches: true,
  };
}

/**
 * Pure, single-source-of-truth resolver for ObjectsView catalog display.
 * Guarantees that an authoritative empty Firestore result while online NEVER
 * falls back to cached/offline recent items and NEVER displays the offline banner,
 * while preserving legitimate offline fallback before the server responds.
 */
export function resolveCatalogDisplayState(params: {
  items: LostFoundItem[] | null | undefined;
  isOffline: boolean;
  catalogSyncState: CatalogSyncState;
  offlineRecentItems: LostFoundItem[] | null | undefined;
}): CatalogDisplayResolution {
  const safeItems = Array.isArray(params.items) ? params.items : [];
  const safeOfflineRecent = Array.isArray(params.offlineRecentItems)
    ? params.offlineRecentItems
    : [];

  // 1. ONLINE + AUTHORITATIVE SNAPSHOT (server-confirmed Firestore or authoritative public API)
  if (!params.isOffline && params.catalogSyncState === "authoritative") {
    if (safeItems.length > 0) {
      return {
        displayItems: safeItems,
        mode: "online-items",
        showOfflineBanner: false,
        canCacheDisplayedItems: true,
      };
    }
    return {
      displayItems: [],
      mode: "online-empty",
      showOfflineBanner: false,
      canCacheDisplayedItems: false,
    };
  }

  // 2. ONLINE + INITIAL LOADING (before first server-confirmed snapshot; may display non-tombstoned cache preview)
  if (!params.isOffline && params.catalogSyncState === "loading") {
    if (safeItems.length > 0) {
      return {
        displayItems: safeItems,
        mode: "online-items",
        showOfflineBanner: false,
        canCacheDisplayedItems: false,
      };
    }
    return {
      displayItems: [],
      mode: "online-loading",
      showOfflineBanner: false,
      canCacheDisplayedItems: false,
    };
  }

  // 3. OFFLINE (or explicit offline-fallback after remote read failure)
  if (safeItems.length > 0) {
    return {
      displayItems: safeItems,
      mode: "offline-fallback",
      showOfflineBanner: true,
      canCacheDisplayedItems: false,
    };
  }

  if (safeOfflineRecent.length > 0) {
    return {
      displayItems: safeOfflineRecent,
      mode: "offline-fallback",
      showOfflineBanner: true,
      canCacheDisplayedItems: false,
    };
  }

  return {
    displayItems: [],
    mode: "offline-empty",
    showOfflineBanner: true,
    canCacheDisplayedItems: false,
  };
}

/**
 * Determines whether IndexedDB hydration is still allowed to populate items state.
 * Once a server-confirmed authoritative snapshot (empty or non-empty) has arrived,
 * IndexedDB MUST NEVER overwrite React state with stale cached records.
 */
export function canHydrateCatalogFromIndexedDB(params: {
  hasAuthoritativeSnapshot: boolean;
  catalogSyncState: CatalogSyncState;
}): boolean {
  if (params.hasAuthoritativeSnapshot) return false;
  if (params.catalogSyncState === "authoritative") return false;
  return true;
}

/**
 * Filters out any item IDs currently protected by active deletion tombstones or in-flight deletions.
 */
export function filterExcludedCatalogItems<T extends { id: string }>(
  items: T[],
  excludedIds: ReadonlySet<string>
): T[] {
  if (!items || items.length === 0) return [];
  if (!excludedIds || excludedIds.size === 0) return items;
  return items.filter((item) => Boolean(item?.id) && !excludedIds.has(item.id));
}

export interface ItemDeletionEligibilityResult {
  allowed: boolean;
  code?:
    | "UNAUTHENTICATED"
    | "ITEM_RETURNED"
    | "ITEM_CLOSED_REQUIRES_ADMIN"
    | "FORBIDDEN";
  reason?: string;
}

/**
 * ACHADO-09: Client-side deletion eligibility pre-check aligned with Root Admin identity
 * pinning (`ROOT_ADMIN_UID` + `ROOT_ADMIN_EMAIL` + `emailVerified === true`) and approved ADMIN role.
 * Authoritative enforcement remains strictly in Firestore Security Rules.
 */
export function evaluateItemDeletionEligibility(params: {
  isGuest: boolean;
  authUid?: string | null;
  authEmail?: string | null;
  authEmailVerified?: boolean | null;
  currentUser?: User | null;
  guestUserId?: string;
  item?: Partial<LostFoundItem> | null;
}): ItemDeletionEligibilityResult {
  if (params.isGuest || !params.authUid) {
    return {
      allowed: false,
      code: "UNAUTHENTICATED",
      reason: "É necessário fazer login para excluir um objeto.",
    };
  }

  const isVerifiedRootAdmin = isVerifiedRootAdminIdentity(params.currentUser, {
    uid: params.authUid,
    email: params.authEmail,
    emailVerified: params.authEmailVerified,
  });

  const isApprovedAdmin =
    params.currentUser?.role === "ADMIN" &&
    (!params.currentUser.approvalStatus || params.currentUser.approvalStatus === "APROVADO") &&
    params.authEmailVerified !== false;

  const isAdmin = isVerifiedRootAdmin || isApprovedAdmin;

  if (params.item?.status === "DEVOLVIDO") {
    return {
      allowed: false,
      code: "ITEM_RETURNED",
      reason:
        "Itens já devolvidos não podem ser excluídos diretamente. Reabra a devolução pelo painel administrativo antes de excluir.",
    };
  }

  if (params.item?.status === "ENCERRADO" && !isAdmin) {
    return {
      allowed: false,
      code: "ITEM_CLOSED_REQUIRES_ADMIN",
      reason:
        "Apenas Administradores podem excluir objetos com status ENCERRADO.",
    };
  }

  const isOwner = Boolean(
    params.item?.registeredByUserId &&
      (params.item.registeredByUserId === params.authUid ||
        (params.currentUser &&
          params.currentUser.id !== params.guestUserId &&
          params.item.registeredByUserId === params.currentUser.id))
  );

  if (!isAdmin && !isOwner) {
    return {
      allowed: false,
      code: "FORBIDDEN",
      reason: "Você não possui permissão para excluir este objeto.",
    };
  }

  return { allowed: true };
}

export type DeletionFailureOutcomeType =
  | "OFFLINE_BLOCKED"
  | "AUTHORIZATION_DENIED"
  | "TRANSIENT_NETWORK_ERROR"
  | "REMOTE_UNKNOWN";

export type RemoteDocumentVerificationState =
  | "CONFIRMED_ABSENT_ON_SERVER"
  | "EXISTS_ON_SERVER"
  | "UNKNOWN";

export type FirestoreItemDeletionOutcome =
  | {
      ok: true;
      mode: "ATOMIC_BATCH" | "ALREADY_DELETED_REMOTELY" | "OFFLINE_QUEUE_ONLY";
      privateDocDeleted: boolean;
      remoteDocumentState: "CONFIRMED_ABSENT_ON_SERVER" | "OFFLINE_ONLY";
    }
  | {
      ok: false;
      outcomeType: DeletionFailureOutcomeType;
      definitive: boolean;
      remoteDocumentState: RemoteDocumentVerificationState;
      error: unknown;
      reason: string;
      code?: string;
    };

function isPermissionDeniedError(err: any): boolean {
  const code = String(err?.code || "").toLowerCase();
  const msg = String(err?.message || "").toLowerCase();
  return (
    code === "permission-denied" ||
    code === "firestore/permission-denied" ||
    msg.includes("permission-denied") ||
    msg.includes("missing or insufficient permissions")
  );
}

function isTransientNetworkOrTimeoutError(err: any): boolean {
  const code = String(err?.code || "").toLowerCase();
  const msg = String(err?.message || "").toLowerCase();
  return (
    code === "unavailable" ||
    code === "deadline-exceeded" ||
    code === "aborted" ||
    code === "cancelled" ||
    code === "failed-precondition" ||
    code === "resource-exhausted" ||
    code === "internal" ||
    code === "unknown" ||
    msg.includes("offline") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("unavailable") ||
    msg.includes("failed to get document from server")
  );
}

async function withOptionalTimeout<T>(promise: Promise<T>, timeoutMs?: number): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const timeoutErr = new Error(
        `Tempo limite (${timeoutMs}ms) excedido aguardando confirmação remota do Firestore.`
      ) as Error & { code?: string };
      timeoutErr.code = "deadline-exceeded";
      reject(timeoutErr);
    }, timeoutMs);

    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Executes Firestore deletion of /items/{itemId} and companion /item_private/{itemId}
 * in strict compatibility with firestore.rules (UNMODIFIED):
 *
 * - /items/{itemId} allow delete: requires non-DEVOLVIDO + (isAdmin() || active verified owner && non-ENCERRADO)
 * - /item_private/{itemId} allow delete: requires isAdmin() || (active verified member && exists(/items/{id}) && owner && status != 'DEVOLVIDO')
 *
 * ACHADO-03 & ACHADO-08 HARDENING:
 * - Uses explicit server reads (`getDocFromServer`) whenever verifying remote existence.
 * - NEVER treats a failed network/timeout read as `ALREADY_DELETED_REMOTELY`.
 * - Explicitly distinguishes:
 *   1) Confirmed atomic deletion (`ATOMIC_BATCH`)
 *   2) Server-verified absence (`ALREADY_DELETED_REMOTELY`)
 *   3) Definitive authorization denial (`AUTHORIZATION_DENIED`, `definitive: true`)
 *   4) Server-verified still existing after transient error (`TRANSIENT_NETWORK_ERROR`, `definitive: false`)
 *   5) Unknown remote state after both commit and server probe fail (`REMOTE_UNKNOWN`, `definitive: false`)
 * - Reports `privateDocDeleted: true` ONLY when deletion of `/item_private/{itemId}` actually succeeded.
 */
export async function executeFirestoreItemDeletion(params: {
  db: Firestore;
  itemId: string;
  isAdmin: boolean;
  isOnline: boolean;
  isOfflineQueuedOnly?: boolean;
  operationTimeoutMs?: number;
  /** Optional injection strictly for testing server-probe/commit failure edge cases. */
  _deps?: {
    docFn?: (db: Firestore, path: string, ...pathSegments: string[]) => DocumentReference;
    getDocFromServerFn?: (ref: DocumentReference) => Promise<DocumentSnapshot>;
    commitAtomicDeleteFn?: () => Promise<void>;
    deletePrivateDocFn?: (ref: DocumentReference) => Promise<void>;
  };
}): Promise<FirestoreItemDeletionOutcome> {
  const {
    db,
    itemId,
    isAdmin,
    isOnline,
    isOfflineQueuedOnly,
    operationTimeoutMs = 15000,
    _deps,
  } = params;

  const makeDocRef = _deps?.docFn ?? doc;
  const fetchFromServer = _deps?.getDocFromServerFn ?? getDocFromServer;
  const deletePrivateDoc = _deps?.deletePrivateDocFn ?? deleteDoc;

  // Offline-created item that was never uploaded to Firestore while offline
  if (isOfflineQueuedOnly && !isOnline) {
    return {
      ok: true,
      mode: "OFFLINE_QUEUE_ONLY",
      privateDocDeleted: false,
      remoteDocumentState: "OFFLINE_ONLY",
    };
  }

  if (!isOnline) {
    return {
      ok: false,
      outcomeType: "OFFLINE_BLOCKED",
      definitive: false,
      remoteDocumentState: "UNKNOWN",
      code: "offline-delete-blocked",
      error: new Error(
        "Não é possível excluir remotamente um objeto sincronizado sem conexão com a internet."
      ),
      reason:
        "Sem conexão com a internet. Reconecte-se para confirmar a exclusão permanente no servidor.",
    };
  }

  const itemRef = makeDocRef(db, "items", itemId);
  const privateRef = makeDocRef(db, "item_private", itemId);

  // If the item is marked as queued offline while online, verify directly against the SERVER
  // (never local cache) whether it ever reached Firestore before attempting batch delete.
  if (isOfflineQueuedOnly) {
    try {
      const remoteSnap = await withOptionalTimeout(fetchFromServer(itemRef), operationTimeoutMs);
      if (!remoteSnap.exists()) {
        let privateDeleted = false;
        if (isAdmin) {
          try {
            await withOptionalTimeout(deletePrivateDoc(privateRef), operationTimeoutMs);
            privateDeleted = true;
          } catch (_) {
            privateDeleted = false;
          }
        }
        return {
          ok: true,
          mode: "OFFLINE_QUEUE_ONLY",
          privateDocDeleted: privateDeleted,
          remoteDocumentState: "CONFIRMED_ABSENT_ON_SERVER",
        };
      }
    } catch (probeErr: any) {
      // If we cannot reach the server even to verify a queued-only item, do NOT assume it is absent
      if (isTransientNetworkOrTimeoutError(probeErr)) {
        return {
          ok: false,
          outcomeType: "REMOTE_UNKNOWN",
          definitive: false,
          remoteDocumentState: "UNKNOWN",
          code: probeErr?.code || "firestore/server-probe-failed",
          error: probeErr,
          reason:
            "Não foi possível confirmar o estado remoto do objeto no servidor devido a instabilidade de rede. Tente novamente após estabilizar a conexão.",
        };
      }
      // For other errors, proceed to atomic batch below where Firestore rules enforce authority
    }
  }

  try {
    if (_deps?.commitAtomicDeleteFn) {
      await withOptionalTimeout(_deps.commitAtomicDeleteFn(), operationTimeoutMs);
    } else {
      const batch = writeBatch(db);
      batch.delete(privateRef);
      batch.delete(itemRef);
      await withOptionalTimeout(batch.commit(), operationTimeoutMs);
    }
    return {
      ok: true,
      mode: "ATOMIC_BATCH",
      privateDocDeleted: true,
      remoteDocumentState: "CONFIRMED_ABSENT_ON_SERVER",
    };
  } catch (batchErr: any) {
    const errCode = batchErr?.code || "firestore/delete-failed";
    const errMsg = batchErr?.message || String(batchErr);
    const batchWasPermissionDenied = isPermissionDeniedError(batchErr);
    const batchWasTransient = isTransientNetworkOrTimeoutError(batchErr);

    // Explicitly query the SERVER (never local cache) to distinguish:
    // - Document genuinely absent on server (already deleted remotely or completed before drop)
    // - Document genuinely still exists on server (deletion did NOT apply)
    // - Server unreachable (outcome truly UNKNOWN — must NEVER be treated as deleted!)
    let serverVerification: RemoteDocumentVerificationState = "UNKNOWN";
    try {
      const checkSnap = await withOptionalTimeout(fetchFromServer(itemRef), operationTimeoutMs);
      if (!checkSnap.exists()) {
        let privateDeleted = false;
        if (isAdmin) {
          try {
            await withOptionalTimeout(deletePrivateDoc(privateRef), operationTimeoutMs);
            privateDeleted = true;
          } catch (_) {
            privateDeleted = false;
          }
        }
        return {
          ok: true,
          mode: "ALREADY_DELETED_REMOTELY",
          privateDocDeleted: privateDeleted,
          remoteDocumentState: "CONFIRMED_ABSENT_ON_SERVER",
        };
      }
      serverVerification = "EXISTS_ON_SERVER";
    } catch (probeErr: any) {
      // Server probe also failed:
      // - If BOTH batch and probe failed with permission-denied, it is a definitive authorization failure.
      // - Otherwise, remote state is strictly UNKNOWN (never classify as deleted!).
      if (batchWasPermissionDenied && isPermissionDeniedError(probeErr)) {
        return {
          ok: false,
          outcomeType: "AUTHORIZATION_DENIED",
          definitive: true,
          remoteDocumentState: "UNKNOWN",
          error: batchErr,
          code: "permission-denied",
          reason:
            "Permissão negada pelas regras de segurança do Firestore para excluir este objeto.",
        };
      }

      return {
        ok: false,
        outcomeType: "REMOTE_UNKNOWN",
        definitive: false,
        remoteDocumentState: "UNKNOWN",
        error: batchErr,
        code: errCode,
        reason:
          "Falha de rede/timeout durante a exclusão e não foi possível confirmar o estado no servidor. O objeto foi mantido em reconciliação pendente para evitar inconsistência.",
      };
    }

    // Server explicitly confirmed the document STILL EXISTS on Firestore
    if (batchWasPermissionDenied) {
      return {
        ok: false,
        outcomeType: "AUTHORIZATION_DENIED",
        definitive: true,
        remoteDocumentState: serverVerification,
        error: batchErr,
        code: "permission-denied",
        reason:
          "Permissão negada pelas regras de segurança do Firestore para excluir este objeto.",
      };
    }

    return {
      ok: false,
      outcomeType: batchWasTransient ? "TRANSIENT_NETWORK_ERROR" : "REMOTE_UNKNOWN",
      definitive: false,
      remoteDocumentState: serverVerification,
      error: batchErr,
      code: errCode,
      reason: batchWasTransient
        ? `Instabilidade de rede ou tempo limite ao excluir no servidor (${errCode}). O objeto ainda existe no Firestore; tente novamente.`
        : `Falha ao excluir no Firestore (${errCode}): ${errMsg}`,
    };
  }
}

export interface SyncQueueTombstoneDecision {
  shouldUpload: boolean;
  shouldDiscardQueueEntry: boolean;
  reason: "ACTIVE_TOMBSTONE" | "DELETION_IN_FLIGHT" | "STORAGE_UNVERIFIED" | "ALLOWED";
}

/**
 * Guard invoked inside syncOfflineQueue() before attempting any Firestore write.
 * Prevents delayed or cross-tab offline queue replays from recreating deleted objects
 * or uploading unsafely when tombstone storage could not be verified.
 */
export function evaluateSyncQueueUploadAgainstDeletions(params: {
  itemId: string;
  hasActiveTombstone: boolean;
  isDeletionInFlight: boolean;
  tombstoneCheckFailed?: boolean;
}): SyncQueueTombstoneDecision {
  if (params.tombstoneCheckFailed) {
    return {
      shouldUpload: false,
      shouldDiscardQueueEntry: false,
      reason: "STORAGE_UNVERIFIED",
    };
  }
  if (params.hasActiveTombstone) {
    return {
      shouldUpload: false,
      shouldDiscardQueueEntry: true,
      reason: "ACTIVE_TOMBSTONE",
    };
  }
  if (params.isDeletionInFlight) {
    return {
      shouldUpload: false,
      shouldDiscardQueueEntry: false,
      reason: "DELETION_IN_FLIGHT",
    };
  }
  return {
    shouldUpload: true,
    shouldDiscardQueueEntry: false,
    reason: "ALLOWED",
  };
}
