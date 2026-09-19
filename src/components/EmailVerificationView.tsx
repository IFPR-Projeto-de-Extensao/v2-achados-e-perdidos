import React, { useState, useEffect } from "react";
import { Mail, CheckCircle2, RefreshCw, LogOut, ShieldAlert, ArrowRight, Clock, HelpCircle, ExternalLink } from "lucide-react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../context/RouterContext";
import { vibrateClick, vibrateSuccess, vibrateWarning } from "../lib/utils";

export const EmailVerificationView: React.FC = () => {
  const {
    firebaseUser,
    checkVerificationStatus,
    resendVerificationEmail,
    logout,
    addToast,
    pendingPostLoginAction,
  } = useApp();

  const { navigate } = useRouter();
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState<number>(() => {
    try {
      const lastSent = sessionStorage.getItem("ifpr_last_email_verification_sent");
      if (lastSent) {
        const elapsed = Math.floor((Date.now() - parseInt(lastSent, 10)) / 1000);
        return elapsed < 60 ? 60 - elapsed : 0;
      }
    } catch (_) {}
    return 0;
  });

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  // Handle "Já verifiquei meu e-mail"
  const handleCheckStatus = async () => {
    vibrateClick();
    setChecking(true);
    try {
      const isVerified = await checkVerificationStatus();
      if (isVerified) {
        vibrateSuccess();
        if (pendingPostLoginAction?.tab) {
          navigate(pendingPostLoginAction.tab === "register" ? "/cadastrar" : "/");
        } else {
          navigate("/");
        }
      }
    } finally {
      setChecking(false);
    }
  };

  // Handle "Reenviar e-mail de verificação"
  const handleResend = async () => {
    if (cooldown > 0) {
      addToast(`Aguarde ${cooldown} segundos antes de solicitar um novo e-mail.`, "warning");
      return;
    }
    vibrateClick();
    setResending(true);
    try {
      await resendVerificationEmail();
      setCooldown(60);
    } finally {
      setResending(false);
    }
  };

  // Auto-check status when user focuses window (e.g. returns after clicking link in email)
  useEffect(() => {
    const handleFocus = async () => {
      if (!checking && firebaseUser && !firebaseUser.emailVerified) {
        const verified = await checkVerificationStatus();
        if (verified) {
          navigate("/");
        }
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [checking, firebaseUser, checkVerificationStatus, navigate]);

  const userEmail = firebaseUser?.email || "seu-email@dominio.com";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-xl overflow-hidden">
        {/* Institutional Top Accent Banner */}
        <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <ShieldAlert className="w-5 h-5 text-amber-200 shrink-0" />
            <span className="text-xs font-black uppercase tracking-wider text-amber-100">
              Segurança Institucional • Localiza+ IFPR
            </span>
          </div>
          <span className="text-[11px] font-mono font-bold bg-black/20 px-2.5 py-1 rounded-full text-amber-100">
            Validação Obrigatória
          </span>
        </div>

        <div className="p-6 sm:p-10 space-y-6">
          {/* Status Header */}
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center mx-auto shadow-sm">
              <Mail className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white tracking-tight">
                Seu e-mail ainda não foi verificado
              </h1>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-lg mx-auto">
                Para garantir a autenticidade das comunicações e proteger a comunidade do IFPR Campus Ivaiporã, é necessário confirmar o acesso à sua caixa postal antes de utilizar o sistema.
              </p>
            </div>
          </div>

          {/* Email Highlight Box */}
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-2xl p-4 text-center space-y-1">
            <span className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">
              Endereço informado no cadastro:
            </span>
            <p className="text-base sm:text-lg font-mono font-black text-neutral-900 dark:text-amber-100 break-all select-all">
              {userEmail}
            </p>
          </div>

          {/* Step-by-Step Instructions */}
          <div className="bg-neutral-50 dark:bg-neutral-900/60 rounded-2xl p-5 border border-neutral-200/80 dark:border-neutral-800 space-y-3">
            <h2 className="text-xs font-black uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-[#00843D]" />
              <span>Como concluir a ativação da sua conta:</span>
            </h2>

            <ol className="space-y-2.5 text-xs sm:text-sm text-neutral-700 dark:text-neutral-300">
              <li className="flex items-start gap-2.5">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#00843D] text-white text-[11px] font-black shrink-0 mt-0.5">
                  1
                </span>
                <span>
                  Abra a caixa de entrada do seu provedor de e-mail (Gmail, Outlook, IFPR Webmail, etc.).
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#00843D] text-white text-[11px] font-black shrink-0 mt-0.5">
                  2
                </span>
                <span>
                  Localize a mensagem enviada pelo <strong>Localiza+ / Firebase</strong> com o link de confirmação.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#00843D] text-white text-[11px] font-black shrink-0 mt-0.5">
                  3
                </span>
                <span>
                  Clique no link para validar seu endereço. Em seguida, retorne aqui e clique no botão verde abaixo.
                </span>
              </li>
            </ol>

            <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>
                <strong>Atenção:</strong> Se a mensagem não aparecer em instantes, confira sua pasta de <strong>Spam</strong> ou <strong>Lixo Eletrônico</strong>.
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3 pt-2">
            <button
              onClick={handleCheckStatus}
              disabled={checking}
              className="w-full py-3.5 px-6 rounded-2xl bg-[#00843D] hover:bg-[#006830] active:scale-[0.99] text-white font-black text-sm transition-all shadow-md flex items-center justify-center space-x-2 disabled:opacity-60 disabled:pointer-events-none"
            >
              {checking ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verificando com o Firebase Auth...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-green-300" />
                  <span>Já verifiquei meu e-mail</span>
                </>
              )}
            </button>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <button
                onClick={handleResend}
                disabled={resending || cooldown > 0}
                className="w-full sm:flex-1 py-3 px-4 rounded-2xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-bold transition-all flex items-center justify-center space-x-2 disabled:opacity-50 disabled:pointer-events-none border border-neutral-200 dark:border-neutral-700"
              >
                {resending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Enviando novo e-mail...</span>
                  </>
                ) : cooldown > 0 ? (
                  <>
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    <span>Reenviar em {cooldown}s</span>
                  </>
                ) : (
                  <>
                    <Mail className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    <span>Reenviar e-mail de verificação</span>
                  </>
                )}
              </button>

              <button
                onClick={async () => {
                  vibrateClick();
                  await logout();
                  navigate("/");
                }}
                className="w-full sm:w-auto py-3 px-4 rounded-2xl bg-neutral-100 hover:bg-red-50 hover:text-red-600 dark:bg-neutral-800 dark:hover:bg-red-950/40 dark:hover:text-red-400 text-neutral-600 dark:text-neutral-400 text-xs font-bold transition-all flex items-center justify-center space-x-1.5 border border-neutral-200 dark:border-neutral-700"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sair da conta</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
