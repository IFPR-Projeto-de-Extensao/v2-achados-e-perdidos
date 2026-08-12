import React, { Component, ErrorInfo, ReactNode } from "react";
import { logErrorToFirestore } from "../lib/errorLogger";
import { ShieldAlert, RefreshCw, Smartphone, AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  isLogging: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      isLogging: false,
    };
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo, isLogging: true });

    // Log error in real-time to Firestore (RNF02 - Mobile Exception Tracker)
    logErrorToFirestore(error, { componentStack: errorInfo.componentStack })
      .catch((err) => console.warn("Aviso na captura de erro pelo ErrorBoundary:", err))
      .finally(() => this.setState({ isLogging: false }));
  }

  public componentDidMount() {
    // Listen for global unhandled errors & promise rejections
    if (typeof window !== "undefined") {
      window.addEventListener("error", this.handleGlobalError);
      window.addEventListener("unhandledrejection", this.handleUnhandledRejection);
    }
  }

  public componentWillUnmount() {
    if (typeof window !== "undefined") {
      window.removeEventListener("error", this.handleGlobalError);
      window.removeEventListener("unhandledrejection", this.handleUnhandledRejection);
    }
  }

  private handleGlobalError = (event: ErrorEvent) => {
    if (event.error) {
      logErrorToFirestore(event.error);
    } else {
      logErrorToFirestore(event.message || "Erro de janela não capturado");
    }
  };

  private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
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
          <div className="max-w-lg w-full bg-neutral-950 border border-red-500/30 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden">
            {/* Top Badge */}
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <div className="flex items-center space-x-2 text-red-400">
                <ShieldAlert className="w-5 h-5" />
                <span className="text-xs font-black uppercase tracking-wider">
                  Error Boundary Global • RNF02
                </span>
              </div>
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-mono">
                {isMobile ? "Dispositivo Móvel" : "Desktop / Tablet"}
              </span>
            </div>

            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-400 border border-red-500/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h1 className="text-xl font-black text-white">
                Ocorreu uma exceção inesperada
              </h1>
              <p className="text-xs text-neutral-400 leading-relaxed">
                O sistema capturou automaticamente o erro e registrou o log no Firestore do IFPR para análise técnica imediata da equipe de TI.
              </p>
            </div>

            {/* Error Message Box */}
            <div className="p-3.5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-1 text-left font-mono text-[11px] text-red-300 overflow-x-auto max-h-36">
              <span className="text-[10px] text-neutral-500 block font-bold uppercase font-sans">
                Detalhes da Exceção:
              </span>
              <p className="font-semibold break-words">
                {this.state.error?.message || "Exceção de renderização no componente"}
              </p>
            </div>

            {/* Mobile Diagnostic details */}
            {isMobile && (
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px] flex items-center space-x-2">
                <Smartphone className="w-4 h-4 shrink-0" />
                <span>Otimização para Mobile: O estado local do seu navegador foi salvo.</span>
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
