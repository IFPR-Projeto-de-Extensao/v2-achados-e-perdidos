import React, { Component, ErrorInfo, ReactNode } from "react";
import { logErrorToFirestore } from "../lib/errorLogger";
import { ShieldAlert, RefreshCw, Smartphone, AlertTriangle, Terminal, FileCode2 } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  failedModulePath: string | null;
  isInitializationError: boolean;
  isLogging: boolean;
}

/**
 * Extracts candidate file / module paths from an error stack trace or message.
 */
function extractModulePathFromStack(stack?: string, fallbackSource?: string): string | null {
  if (fallbackSource && fallbackSource !== "") {
    return fallbackSource;
  }
  if (!stack) return null;

  // Search for lines matching Vite chunk paths, src paths, or HTTP URLs
  const lines = stack.split("\n");
  for (const line of lines) {
    const match = line.match(/(https?:\/\/[^\s)]+|\/src\/[^\s)]+|assets\/[^\s)]+)/i);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      failedModulePath: null,
      isInitializationError: false,
      isLogging: false,
    };
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    const isInit =
      error.message.includes("before initialization") ||
      error.message.includes("Cannot access") ||
      error.message.includes("is not defined") ||
      error.message.includes("ve");

    const failedPath = extractModulePathFromStack(error.stack);

    return {
      hasError: true,
      error,
      isInitializationError: isInit,
      failedModulePath: failedPath,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const failedPath =
      this.state.failedModulePath ||
      extractModulePathFromStack(error.stack) ||
      extractModulePathFromStack(errorInfo.componentStack);

    this.setState({ errorInfo, failedModulePath: failedPath, isLogging: true });

    // Detailed diagnostic console output for developer and preview debugging
    console.group("🚨 [Localiza+ IFPR] ErrorBoundary Capturou Exceção");
    console.error("Mensagem de Erro:", error.message);
    console.error("Possível Módulo de Origem:", failedPath || "Desconhecido");
    console.error("Stack do Erro:", error.stack);
    console.error("Component Stack:", errorInfo.componentStack);
    console.groupEnd();

    // Log error in real-time to Firestore (RNF02 - Exception Tracker)
    logErrorToFirestore(error, {
      componentStack: errorInfo.componentStack,
      failedModulePath: failedPath || undefined,
    })
      .catch((err) => console.warn("Aviso na captura de erro pelo ErrorBoundary:", err))
      .finally(() => this.setState({ isLogging: false }));
  }

  public componentDidMount() {
    if (typeof window !== "undefined") {
      window.addEventListener("error", this.handleGlobalError);
      window.addEventListener("unhandledrejection", this.handleUnhandledRejection);

      // Global window.onerror for detailed diagnostic logging of initialization & script errors
      const previousOnError = window.onerror;
      window.onerror = (message, source, lineno, colno, error) => {
        console.group("🚨 [Localiza+ IFPR] Window.onerror Interceptado");
        console.error("Mensagem:", message);
        console.error("Arquivo / Módulo:", source);
        console.error(`Linha: ${lineno}, Coluna: ${colno}`);
        if (error && error.stack) {
          console.error("Stack Trace Completo:", error.stack);
        }
        console.groupEnd();

        if (
          typeof message === "string" &&
          (message.includes("before initialization") ||
            message.includes("Cannot access") ||
            message.includes("'ve'"))
        ) {
          this.setState({
            hasError: true,
            error: error || new Error(message),
            failedModulePath: `${source || ""}:${lineno}:${colno}`,
            isInitializationError: true,
          });
        }

        if (typeof previousOnError === "function") {
          return previousOnError(message, source, lineno, colno, error);
        }
        return false;
      };
    }
  }

  public componentWillUnmount() {
    if (typeof window !== "undefined") {
      window.removeEventListener("error", this.handleGlobalError);
      window.removeEventListener("unhandledrejection", this.handleUnhandledRejection);
    }
  }

  private handleGlobalError = (event: ErrorEvent) => {
    const error = event.error;
    const source = event.filename || "";
    const loc = `${source}:${event.lineno}:${event.colno}`;

    console.group("⚠️ [Localiza+ GlobalError]");
    console.error("Mensagem:", event.message);
    console.error("Origem:", loc);
    if (error?.stack) console.error("Stack:", error.stack);
    console.groupEnd();

    const isInit =
      event.message?.includes("before initialization") ||
      event.message?.includes("Cannot access") ||
      event.message?.includes("ve");

    if (isInit && !this.state.hasError) {
      this.setState({
        hasError: true,
        error: error || new Error(event.message),
        failedModulePath: loc,
        isInitializationError: true,
      });
    }

    if (event.error) {
      logErrorToFirestore(event.error, { location: loc });
    } else {
      logErrorToFirestore(event.message || "Erro de janela não capturado", { location: loc });
    }
  };

  private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    console.warn("⚠️ [Localiza+ UnhandledRejection]", reason);
    if (reason instanceof Error) {
      logErrorToFirestore(reason);
    } else {
      logErrorToFirestore(String(reason || "Promessa rejeitada não tratada"));
    }
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const isMobile =
        typeof navigator !== "undefined" &&
        /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      return (
        <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center p-4 font-sans">
          <div className="max-w-xl w-full bg-neutral-950 border border-red-500/30 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden">
            {/* Top Badge */}
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <div className="flex items-center space-x-2 text-red-400">
                <ShieldAlert className="w-5 h-5" />
                <span className="text-xs font-black uppercase tracking-wider">
                  Error Boundary Global • IFPR Campus Ivaiporã
                </span>
              </div>
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-mono">
                {isMobile ? "Mobile PWA" : "Desktop / Tablet"}
              </span>
            </div>

            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-400 border border-red-500/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h1 className="text-xl font-black text-white">
                {this.state.isInitializationError
                  ? "Exceção no Ciclo de Inicialização de Módulos"
                  : "Ocorreu uma exceção inesperada"}
              </h1>
              <p className="text-xs text-neutral-400 leading-relaxed">
                {this.state.isInitializationError
                  ? "O diagnóstico capturou uma referência a variável/módulo antes de sua declaração (TDZ). O caminho do módulo foi registrado no console e no Firestore."
                  : "O sistema capturou automaticamente o erro e registrou o log no Firestore do IFPR para análise técnica imediata."}
              </p>
            </div>

            {/* Module Path Identification Pill */}
            {this.state.failedModulePath && (
              <div className="p-3 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs space-y-1">
                <div className="flex items-center space-x-1.5 font-bold text-amber-300">
                  <FileCode2 className="w-4 h-4" />
                  <span>Módulo / Arquivo Identificado:</span>
                </div>
                <p className="font-mono text-[11px] break-all bg-black/40 p-2 rounded-lg text-amber-100">
                  {this.state.failedModulePath}
                </p>
              </div>
            )}

            {/* Error Message Box */}
            <div className="p-3.5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-1 text-left font-mono text-[11px] text-red-300 overflow-x-auto max-h-40">
              <div className="flex items-center justify-between text-[10px] text-neutral-500 font-bold uppercase font-sans">
                <span>Mensagem da Exceção:</span>
                <span className="flex items-center space-x-1 text-neutral-400">
                  <Terminal className="w-3 h-3" />
                  <span>Console Aberto</span>
                </span>
              </div>
              <p className="font-semibold break-words">
                {this.state.error?.message || "Exceção de renderização no componente"}
              </p>
              {this.state.error?.stack && (
                <pre className="text-[10px] text-neutral-400 mt-2 font-mono whitespace-pre-wrap max-h-24 overflow-y-auto">
                  {this.state.error.stack}
                </pre>
              )}
            </div>

            {/* Mobile Diagnostic details */}
            {isMobile && (
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px] flex items-center space-x-2">
                <Smartphone className="w-4 h-4 shrink-0" />
                <span>Otimização para Mobile: O estado local do seu navegador foi preservado.</span>
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <button
                onClick={this.handleReset}
                className="w-full py-3 px-4 rounded-2xl bg-[#00843D] hover:bg-[#006b31] text-white font-extrabold text-xs transition-all flex items-center justify-center space-x-2 shadow-lg shadow-green-950/40"
              >
                <RefreshCw className="w-4 h-4 animate-spin-hover" />
                <span>Recarregar Sistema & Sincronizar</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
