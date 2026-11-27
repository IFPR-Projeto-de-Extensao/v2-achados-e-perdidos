import { SupportCategory, SupportFeedbackTicket, UserRole } from "../types";
import { auth, db } from "./firebase";
import { sanitizeFirestoreData } from "./shared-constants";
import { doc, setDoc } from "firebase/firestore";

export type FeedbackDeliveryOutcome = "COMPLETE" | "PARTIAL" | "FAILED";

export interface SupportFeedbackPayload {
  name: string;
  email: string;
  category: SupportCategory;
  subject: string;
  message: string;
  priority?: "BAIXA" | "MEDIA" | "ALTA";
  includeDiagnostics?: boolean;
  userId?: string;
  userRole?: UserRole;
  clientRequestId?: string;
}

export interface SupportFeedbackResponse {
  success: boolean;
  deliveryOutcome: FeedbackDeliveryOutcome;
  protocol?: string;
  timestamp?: string;
  message?: string;
  error?: string;
  code?: string;
  destinationEmail?: string;
  smtpDispatched: boolean;
  smtpStatus: string;
  smtpMessageId?: string | null;
  smtpError?: string | null;
  discordDispatched: boolean;
  discordStatus?: string;
  ticketPersisted: boolean;
  duplicatePrevented?: boolean;
}

export interface SubmitSupportFeedbackDeps {
  fetchImpl?: typeof fetch;
  authInstance?: {
    currentUser?: {
      uid: string;
      email?: string | null;
      getIdToken?: () => Promise<string>;
    } | null;
  } | null;
  persistClientTicket?: (ticketId: string, ticketData: Record<string, any>) => Promise<void>;
}

const inFlightRequestPromises = new Map<string, Promise<SupportFeedbackResponse>>();

function generateClientRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Builds a Firestore ticket payload strictly compliant with firestore.rules:
 * - Authenticated user: binds userId == auth.uid, email == auth.email (if available), status == 'NOVO'.
 * - Visitor: omits userId and userRole completely, sets status == 'NOVO'.
 */
export function buildClientSupportTicketDocument(params: {
  protocol: string;
  name: string;
  email: string;
  category: SupportCategory;
  subject: string;
  message: string;
  priority: "BAIXA" | "MEDIA" | "ALTA";
  timestamp: string;
  authenticatedUser?: { uid: string; email?: string | null } | null;
  userRole?: UserRole;
  userAgent?: string;
}): Record<string, any> {
  const baseTicket: Record<string, any> = {
    id: `ticket_${params.protocol}`,
    name: params.name,
    email: params.authenticatedUser?.email || params.email,
    category: params.category,
    subject: params.subject,
    message: params.message,
    priority: params.priority,
    createdAt: params.timestamp,
    status: "NOVO",
    protocol: params.protocol,
    ...(params.userAgent ? { userAgent: params.userAgent } : {}),
  };

  if (params.authenticatedUser?.uid) {
    baseTicket.userId = params.authenticatedUser.uid;
    if (params.userRole) {
      baseTicket.userRole = params.userRole;
    }
  }
  // Visitors MUST NOT set userId or userRole so firestore.rules allow create for !isSignedIn()

  return sanitizeFirestoreData(baseTicket);
}

/**
 * Centralized service to validate and submit user feedback / support / bug reports.
 * Used by all feedback triggers (SupportView, ContactSupportModal).
 * Guarantees:
 * - Never reports success when both SMTP and Discord fail.
 * - Propagates smtpDispatched, smtpStatus, discordDispatched, discordStatus, ticketPersisted and deliveryOutcome.
 * - Avoids duplicate Firestore writes when backend Admin SDK already persisted the ticket.
 * - Works consistently for both authenticated users and visitors.
 */
export async function submitSupportFeedback(
  payload: SupportFeedbackPayload,
  deps: SubmitSupportFeedbackDeps = {}
): Promise<SupportFeedbackResponse> {
  const trimmedName = (payload.name || "").trim();
  const trimmedEmail = (payload.email || "").trim();
  const trimmedSubject = (payload.subject || "").trim();
  const trimmedMessage = (payload.message || "").trim();

  // 1. Client-side input validation
  if (!trimmedName) {
    return {
      success: false,
      deliveryOutcome: "FAILED",
      error: "Por favor, informe seu nome completo.",
      smtpDispatched: false,
      smtpStatus: "PENDING_SMTP_CONFIG",
      discordDispatched: false,
      ticketPersisted: false,
    };
  }
  if (!trimmedEmail || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(trimmedEmail)) {
    return {
      success: false,
      deliveryOutcome: "FAILED",
      error: "Por favor, informe um endereço de e-mail válido.",
      smtpDispatched: false,
      smtpStatus: "PENDING_SMTP_CONFIG",
      discordDispatched: false,
      ticketPersisted: false,
    };
  }
  if (!trimmedSubject) {
    return {
      success: false,
      deliveryOutcome: "FAILED",
      error: "Por favor, informe o assunto da mensagem.",
      smtpDispatched: false,
      smtpStatus: "PENDING_SMTP_CONFIG",
      discordDispatched: false,
      ticketPersisted: false,
    };
  }
  if (!trimmedMessage) {
    return {
      success: false,
      deliveryOutcome: "FAILED",
      error: "Por favor, descreva detalhadamente sua mensagem/relato.",
      smtpDispatched: false,
      smtpStatus: "PENDING_SMTP_CONFIG",
      discordDispatched: false,
      ticketPersisted: false,
    };
  }

  const clientRequestId = (payload.clientRequestId || "").trim() || generateClientRequestId();
  const dedupeKey = `${clientRequestId}:${trimmedEmail.toLowerCase()}:${trimmedSubject}`;

  // Coalesce accidental double-clicks with the same clientRequestId while in flight
  const existingInFlight = inFlightRequestPromises.get(dedupeKey);
  if (existingInFlight) {
    return existingInFlight;
  }

  const runSubmission = async (): Promise<SupportFeedbackResponse> => {
    const fallbackProtocol = `IFPR-SUP-${Date.now().toString(36).toUpperCase()}`;
    const timestamp = new Date().toISOString();

    const clientDiagnostics =
      payload.includeDiagnostics !== false
        ? {
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
            screen: typeof window !== "undefined" ? `${window.screen.width}x${window.screen.height}` : "unknown",
            online: typeof navigator !== "undefined" ? navigator.onLine : true,
            language: typeof navigator !== "undefined" ? navigator.language : "pt-BR",
            currentPath:
              typeof window !== "undefined" ? window.location.pathname + window.location.search : "/",
          }
        : undefined;

    const effectiveAuth = "authInstance" in deps ? deps.authInstance : auth;
    const authUser = effectiveAuth?.currentUser || null;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (authUser && typeof authUser.getIdToken === "function") {
      try {
        const idToken = await authUser.getIdToken();
        if (idToken) {
          headers.Authorization = `Bearer ${idToken}`;
        }
      } catch {
        // Proceed without Bearer header if token refresh fails; visitor persistence remains safe
      }
    }

    const fetchFn = deps.fetchImpl ?? fetch;

    try {
      const response = await fetchFn("/api/support/send-feedback", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          category: payload.category || "FEEDBACK",
          subject: trimmedSubject,
          message: trimmedMessage,
          priority: payload.priority || "MEDIA",
          clientRequestId,
          clientDiagnostics,
        }),
      });

      const data = await response.json().catch(() => null);

      const smtpDispatched = Boolean(data?.smtpDispatched === true);
      const discordDispatched = Boolean(data?.discordDispatched === true);
      const smtpStatus = String(data?.smtpStatus || (smtpDispatched ? "SENT" : "ERROR"));
      const discordStatus = String(data?.discordStatus || (discordDispatched ? "SENT" : "NOT_CONFIGURED"));
      const confirmedProtocol = data?.protocol || fallbackProtocol;
      let ticketPersisted = Boolean(data?.ticketPersisted === true);

      // Client-side Firestore fallback ONLY when backend Admin SDK did not persist the ticket
      // and request itself was not rejected as 4xx validation error
      const shouldAttemptClientFallback = !ticketPersisted && response.status !== 400 && response.status !== 405;
      if (shouldAttemptClientFallback) {
        const ticketDoc = buildClientSupportTicketDocument({
          protocol: confirmedProtocol,
          name: trimmedName,
          email: trimmedEmail,
          category: payload.category || "FEEDBACK",
          subject: trimmedSubject,
          message: trimmedMessage,
          priority: payload.priority || "MEDIA",
          timestamp: data?.timestamp || timestamp,
          authenticatedUser: authUser ? { uid: authUser.uid, email: authUser.email } : null,
          userRole: authUser ? payload.userRole : undefined,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        });

        try {
          if (deps.persistClientTicket) {
            await deps.persistClientTicket(ticketDoc.id, ticketDoc);
            ticketPersisted = true;
          } else if (db) {
            const ticketRef = doc(db, "support_tickets", ticketDoc.id);
            await setDoc(ticketRef, ticketDoc as SupportFeedbackTicket);
            ticketPersisted = true;
          }
        } catch (dbErr) {
          console.warn("[Support Tickets Firestore Notice] Falha no fallback de persistência cliente:", dbErr);
        }
      }

      // Compute honest deliveryOutcome strictly from real channel results
      const deliveryOutcome: FeedbackDeliveryOutcome =
        smtpDispatched && discordDispatched
          ? "COMPLETE"
          : smtpDispatched || discordDispatched
          ? "PARTIAL"
          : "FAILED";

      if (!response.ok || !data || deliveryOutcome === "FAILED" || data.success === false) {
        const errorMsg =
          data?.error ||
          (deliveryOutcome === "FAILED"
            ? ticketPersisted
              ? "Não foi possível entregar a notificação por e-mail SMTP nem pelo Discord no momento. Seu protocolo foi salvo internamente; se urgente, escreva para localizamais0@gmail.com."
              : "Falha ao enviar sua solicitação: os canais de notificação (e-mail SMTP e Discord) falharam ou não estão configurados."
            : `Erro de comunicação com o servidor (HTTP ${response.status}).`);

        return {
          success: false,
          deliveryOutcome: "FAILED",
          protocol: confirmedProtocol,
          timestamp: data?.timestamp || timestamp,
          error: errorMsg,
          code: data?.code,
          destinationEmail: data?.destinationEmail,
          smtpDispatched,
          smtpStatus,
          smtpMessageId: data?.smtpMessageId ?? null,
          smtpError: data?.smtpError ?? null,
          discordDispatched,
          discordStatus,
          ticketPersisted,
          duplicatePrevented: Boolean(data?.duplicatePrevented),
        };
      }

      const defaultMessage =
        deliveryOutcome === "COMPLETE"
          ? "Feedback enviado com sucesso por e-mail institucional e notificado no Discord!"
          : smtpDispatched
          ? "Feedback enviado por e-mail institucional, porém a notificação no Discord não pôde ser concluída."
          : "Feedback entregue no Discord da equipe, porém o envio por e-mail SMTP não pôde ser concluído.";

      return {
        success: true,
        deliveryOutcome,
        protocol: confirmedProtocol,
        timestamp: data.timestamp || timestamp,
        message: data.message || defaultMessage,
        destinationEmail: data.destinationEmail,
        smtpDispatched,
        smtpStatus,
        smtpMessageId: data.smtpMessageId ?? null,
        smtpError: data.smtpError ?? null,
        discordDispatched,
        discordStatus,
        ticketPersisted,
        duplicatePrevented: Boolean(data.duplicatePrevented),
      };
    } catch (err: any) {
      console.error("[submitSupportFeedback Error]:", err);
      return {
        success: false,
        deliveryOutcome: "FAILED",
        error: err?.message || "Falha de conexão com o servidor ao enviar feedback.",
        smtpDispatched: false,
        smtpStatus: "NETWORK_ERROR",
        smtpMessageId: null,
        discordDispatched: false,
        discordStatus: "NETWORK_ERROR",
        ticketPersisted: false,
      };
    }
  };

  const promise = runSubmission().finally(() => {
    inFlightRequestPromises.delete(dedupeKey);
  });
  inFlightRequestPromises.set(dedupeKey, promise);
  return promise;
}
