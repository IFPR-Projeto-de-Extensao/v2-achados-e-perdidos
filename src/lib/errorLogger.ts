// Real-time Error Logging utility for Firestore (RNF02 - Mobile Exception & Crash tracking)
import { collection, doc, setDoc } from "firebase/firestore";
import { db, auth } from "./firebase";
import { saveOfflineErrorLogIndexedDB } from "./indexedDB";

export interface SystemErrorLog {
  id: string;
  errorMessage: string;
  errorStack?: string;
  componentStack?: string;
  url: string;
  userAgent: string;
  isMobile: boolean;
  screenWidth: number;
  screenHeight: number;
  userId?: string;
  userEmail?: string;
  timestamp: string;
}

export async function logErrorToFirestore(
  error: Error | string,
  errorInfo?: { componentStack?: string }
): Promise<void> {
  const isMobile =
    typeof navigator !== "undefined" &&
    /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const errorMessage = typeof error === "string" ? error : error.message || "Erro desconhecido";
  const errorStack = typeof error === "object" ? error.stack : undefined;

  const logData: SystemErrorLog = {
    id: `err-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    errorMessage,
    errorStack,
    componentStack: errorInfo?.componentStack,
    url: typeof window !== "undefined" ? window.location.href : "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    isMobile,
    screenWidth: typeof window !== "undefined" ? window.innerWidth : 0,
    screenHeight: typeof window !== "undefined" ? window.innerHeight : 0,
    userId: auth.currentUser?.uid || "anonym",
    userEmail: auth.currentUser?.email || "visitante",
    timestamp: new Date().toISOString(),
  };

  // Always attempt IndexedDB backup first
  await saveOfflineErrorLogIndexedDB(logData);

  // Send to Firestore
  try {
    const errorRef = doc(collection(db, "error_logs"), logData.id);
    await setDoc(errorRef, logData);
  } catch (err) {
    console.warn("Aviso ao registrar log de erro no Firestore:", err);
  }
}
