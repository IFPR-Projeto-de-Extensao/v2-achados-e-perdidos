import React, { useState, useEffect } from "react";
import {
  Mail,
  CheckCircle2,
  RefreshCw,
  LogOut,
  ShieldCheck,
  Clock,
  HelpCircle,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../context/RouterContext";
import { vibrateClick, vibrateSuccess } from "../lib/utils";
import {
  BrandLogo,
  SurfaceCard,
  SubtlePanel,
  UIBadge,
  UIButton,
} from "./ui";

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
      const lastSent = sessionStorage.getItem(
        "ifpr_last_email_verification_sent"
      );
      if (lastSent) {
        const elapsed = Math.floor(
          (Date.now() - parseInt(lastSent, 10)) / 1000
        );
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
          navigate(
            pendingPostLoginAction.tab === "register" ? "/cadastrar" : "/"
          );
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
      addToast(
        `Aguarde ${cooldown} segundos antes de solicitar um novo e-mail.`,
        "warning"
      );
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
      <SurfaceCard padding="none" className="overflow-hidden">
        {/* Institutional Clean Header Banner */}
        <div className="px-6 py-4 bg-[#EBF5F0]/80 dark:bg-emerald-950/30 border-b border-[#16845B]/15 dark:border-emerald-900/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandLogo size="sm" showSubtitle={false} />
            <span className="hidden sm:inline-block text-slate-300 dark:text-slate-700">
              •
            </span>
            <span className="text-xs font-semibold text-[#064E3B] dark:text-emerald-300">
              Segurança Institucional IFPR
            </span>
          </div>
          <UIBadge tone="amber">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Validação Obrigatória</span>
          </UIBadge>
        </div>

        <div className="p-6 sm:p-10 space-y-6">
          {/* Status Header */}
          <div className="text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-[#EBF5F0] dark:bg-emerald-950/50 text-[#16845B] dark:text-emerald-400 border border-[#16845B]/20 dark:border-emerald-800/50 flex items-center justify-center mx-auto shadow-xs">
              <Mail className="w-7 h-7" />
            </div>

            <div className="space-y-1.5">
              <h1 className="text-2xl sm:text-3xl font-bold text-[#172B2A] dark:text-white tracking-tight">
                Confirme seu endereço de e-mail
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
                Para garantir a autenticidade das comunicações e proteger a
                comunidade do IFPR Campus Ivaiporã, confirme o acesso à sua
                caixa postal antes de continuar.
              </p>
            </div>
          </div>

          {/* Email Highlight Box */}
          <SubtlePanel className="text-center space-y-1 bg-[#EBF5F0]/60 dark:bg-emerald-950/20 border-[#16845B]/20 dark:border-emerald-900/40">
            <span className="text-[11px] font-semibold text-[#064E3B] dark:text-emerald-300 uppercase tracking-wider">
              Endereço informado no cadastro
            </span>
            <p className="text-base sm:text-lg font-mono font-bold text-[#172B2A] dark:text-emerald-100 break-all select-all">
              {userEmail}
            </p>
          </SubtlePanel>

          {/* Step-by-Step Instructions */}
          <SubtlePanel className="space-y-3.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-[#16845B] dark:text-emerald-400 shrink-0" />
              <span>Como concluir a ativação da sua conta:</span>
            </h2>

            <ol className="space-y-2.5 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
              <li className="flex items-start gap-3">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#16845B] text-white text-[11px] font-bold shrink-0 mt-0.5">
                  1
                </span>
                <span>
                  Abra a caixa de entrada do seu provedor de e-mail (Gmail,
                  Outlook, IFPR Webmail, etc.).
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#16845B] text-white text-[11px] font-bold shrink-0 mt-0.5">
                  2
                </span>
                <span>
                  Localize a mensagem enviada pelo{" "}
                  <strong className="font-semibold text-[#172B2A] dark:text-white">
                    Localiza+ / Firebase
                  </strong>{" "}
                  com o link de confirmação.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#16845B] text-white text-[11px] font-bold shrink-0 mt-0.5">
                  3
                </span>
                <span>
                  Clique no link para validar seu endereço. Em seguida, retorne
                  aqui e clique no botão principal abaixo.
                </span>
              </li>
            </ol>

            <div className="pt-2.5 border-t border-slate-200/80 dark:border-slate-800 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Clock className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                <strong className="font-semibold text-slate-700 dark:text-slate-300">
                  Atenção:
                </strong>{" "}
                Se a mensagem não aparecer em instantes, verifique também sua
                pasta de <strong>Spam</strong> ou{" "}
                <strong>Lixo Eletrônico</strong>.
              </span>
            </div>
          </SubtlePanel>

          {/* Action Buttons */}
          <div className="space-y-3 pt-1">
            <UIButton
              type="button"
              variant="primary"
              size="lg"
              fullWidth
              disabled={checking}
              onClick={handleCheckStatus}
            >
              {checking ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verificando com o Firebase Auth...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Já verifiquei meu e-mail</span>
                </>
              )}
            </UIButton>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <UIButton
                type="button"
                variant="secondary"
                size="md"
                onClick={handleResend}
                disabled={resending || cooldown > 0}
                className="w-full sm:flex-1"
              >
                {resending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Enviando novo e-mail...</span>
                  </>
                ) : cooldown > 0 ? (
                  <>
                    <Clock className="w-4 h-4 text-amber-500" />
                    <span>Reenviar em {cooldown}s</span>
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4 text-[#16845B] dark:text-emerald-400" />
                    <span>Reenviar e-mail de verificação</span>
                  </>
                )}
              </UIButton>

              <UIButton
                type="button"
                variant="ghost"
                size="md"
                onClick={async () => {
                  vibrateClick();
                  await logout();
                  navigate("/");
                }}
                className="w-full sm:w-auto text-slate-600 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
              >
                <LogOut className="w-4 h-4" />
                <span>Sair da conta</span>
              </UIButton>
            </div>
          </div>
        </div>
      </SurfaceCard>
    </div>
  );
};

export default EmailVerificationView;
