import { SupportCategory, SupportFeedbackTicket, UserRole } from "../types";
import { db } from "./firebase";
import { sanitizeFirestoreData } from "./shared-constants";
import { doc, setDoc } from "firebase/firestore";

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
}

export interface SupportFeedbackResponse {
  success: boolean;
  protocol?: string;
  timestamp?: string;
  message?: string;
  error?: string;
  discordDispatched?: boolean;
}

/**
 * Centralized service to validate and submit user feedback / support / bug reports.
 * Used by all feedback triggers (Header Support, Footer Feedback, Footer Bug Report, FAB Quick Support).
 * Flow: Client Validation -> Backend API (/api/support/send-feedback) -> Discord Webhook -> UI Confirmation.
 */
export async function submitSupportFeedback(
  payload: SupportFeedbackPayload
): Promise<SupportFeedbackResponse> {
  const trimmedName = (payload.name || "").trim();
  const trimmedEmail = (payload.email || "").trim();
  const trimmedSubject = (payload.subject || "").trim();
  const trimmedMessage = (payload.message || "").trim();

  // 1. Client-side input validation
  if (!trimmedName) {
    return { success: false, error: "Por favor, informe seu nome completo." };
  }
  if (!trimmedEmail || !trimmedEmail.includes("@")) {
    return { success: false, error: "Por favor, informe um endereço de e-mail válido." };
  }
  if (!trimmedSubject) {
    return { success: false, error: "Por favor, informe o assunto da mensagem." };
  }
  if (!trimmedMessage) {
    return { success: false, error: "Por favor, descreva detalhadamente sua mensagem/relato." };
  }

  const protocol = `IFPR-SUP-${Date.now().toString(36).toUpperCase()}`;
  const timestamp = new Date().toISOString();

  // 2. Collect client diagnostic data if requested
  const clientDiagnostics = payload.includeDiagnostics !== false
    ? {
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
        screen: typeof window !== "undefined" ? `${window.screen.width}x${window.screen.height}` : "unknown",
        online: typeof navigator !== "undefined" ? navigator.onLine : true,
        language: typeof navigator !== "undefined" ? navigator.language : "pt-BR",
        currentPath: typeof window !== "undefined" ? (window.location.pathname + window.location.search) : "/",
      }
    : undefined;

  // 3. Dispatch to backend API
  try {
    const response = await fetch("/api/support/send-feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: trimmedName,
        email: trimmedEmail,
        category: payload.category || "FEEDBACK",
        subject: trimmedSubject,
        message: trimmedMessage,
        priority: payload.priority || "MEDIA",
        clientDiagnostics,
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data || data.success === false) {
      const errorMsg = data?.error || `Erro de comunicação com o servidor (HTTP ${response.status}).`;
      return { success: false, error: errorMsg };
    }

    const confirmedProtocol = data.protocol || protocol;

    // 4. Resilient secondary save to Firestore support_tickets (non-blocking)
    if (db) {
      try {
        const ticketData: SupportFeedbackTicket = {
          id: `ticket_${confirmedProtocol}`,
          name: trimmedName,
          email: trimmedEmail,
          category: payload.category || "FEEDBACK",
          subject: trimmedSubject,
          message: trimmedMessage,
          priority: payload.priority || "MEDIA",
          userId: payload.userId,
          userRole: payload.userRole,
          createdAt: timestamp,
          status: "NOVO",
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
          protocol: confirmedProtocol,
        };
        const ticketRef = doc(db, "support_tickets", ticketData.id);
        await setDoc(ticketRef, sanitizeFirestoreData(ticketData));
      } catch (dbErr) {
        console.warn("[Support Tickets Firestore Notice] Gravação secundária no Firestore:", dbErr);
      }
    }

    return {
      success: true,
      protocol: confirmedProtocol,
      timestamp: data.timestamp || timestamp,
      message: data.message || "Feedback registrado e encaminhado com sucesso!",
      discordDispatched: data.discordDispatched ?? true,
    };
  } catch (err: any) {
    console.error("[submitSupportFeedback Error]:", err);
    return {
      success: false,
      error: err?.message || "Falha de conexão com o servidor ao enviar feedback.",
    };
  }
}
