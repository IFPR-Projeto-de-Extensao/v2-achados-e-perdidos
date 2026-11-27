import React, { useState, useEffect } from "react";
import {
  KeyRound,
  Lock,
  Mail,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  ArrowLeft,
  RefreshCw,
  LogIn,
  ShieldCheck,
} from "lucide-react";
import {
  verifyPasswordResetCode,
  confirmPasswordReset,
  applyActionCode,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import { useApp } from "../context/AppContext";
import { useRouter } from "../context/RouterContext";
import { parseAuthError } from "../lib/authErrorHandler";
import {
  dispatchPasswordResetWithFallback,
  isValidAuthEmail,
  normalizeAuthEmail,
  validateNewPasswordInput,
} from "../lib/adminUserProvisioning";
import { vibrateClick, vibrateSuccess, vibrateWarning } from "../lib/utils";
import {
  BrandLogo,
  SurfaceCard,
  SubtlePanel,
  UIBadge,
  UIButton,
  UIFieldGroup,
  UIInput,
} from "./ui";

type ActionStage =
  | "verifying"
  | "reset_form"
  | "reset_done"
  | "verify_email_done"
  | "request_link"
  | "invalid_code";

export const ResetPasswordView: React.FC = () => {
  const {
    loginWithEmailPassword,
    checkVerificationStatus,
    setAuthModalOpen,
    addToast,
    language,
  } = useApp();
  const { navigate, searchParams } = useRouter();

  const urlParams =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const mode = (searchParams.mode || urlParams?.get("mode") || "").trim();
  const oobCode = (searchParams.oobCode || urlParams?.get("oobCode") || "").trim();

  const [stage, setStage] = useState<ActionStage>(() => {
    if (oobCode) return "verifying";
    return "request_link";
  });
  const [targetEmail, setTargetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [requestEmail, setRequestEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  useEffect(() => {
    let cancelled = false;

    const processCode = async () => {
      if (!oobCode) {
        setStage("request_link");
        return;
      }

      setStage("verifying");
      setErrorMsg("");

      if (mode === "verifyEmail") {
        try {
          await applyActionCode(auth, oobCode);
          if (cancelled) return;
          if (auth.currentUser) {
            await checkVerificationStatus().catch(() => false);
          }
          vibrateSuccess();
          setStage("verify_email_done");
        } catch (err: any) {
          if (cancelled) return;
          const parsed = parseAuthError(err);
          setErrorMsg(parsed.userMessage);
          setStage("invalid_code");
        }
        return;
      }

      // Default or mode === "resetPassword"
      try {
        const emailFromCode = await verifyPasswordResetCode(auth, oobCode);
        if (cancelled) return;
        setTargetEmail(emailFromCode);
        setStage("reset_form");
      } catch (err: any) {
        if (cancelled) return;
        const parsed = parseAuthError(err);
        setErrorMsg(parsed.userMessage);
        setStage("invalid_code");
      }
    };

    processCode();
    return () => {
      cancelled = true;
    };
  }, [oobCode, mode]);

  const handleConfirmPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    vibrateClick();
    setErrorMsg("");

    const check = validateNewPasswordInput(newPassword, confirmPassword);
    if ("error" in check) {
      vibrateWarning();
      setErrorMsg(check.error);
      addToast(check.error, "warning");
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, check.password);
      vibrateSuccess();
      setStage("reset_done");
      addToast(
        language === "en"
          ? "Password defined successfully!"
          : "Senha definida com sucesso! Você já pode acessar o sistema.",
        "success"
      );
      // Clean URL query params without full reload
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", "/redefinir-senha");
      }
    } catch (err: any) {
      vibrateWarning();
      const parsed = parseAuthError(err);
      setErrorMsg(parsed.userMessage);
      addToast(parsed.userMessage, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDirectLoginAfterReset = async () => {
    if (!targetEmail || !newPassword) {
      navigate("/");
      setAuthModalOpen(true);
      return;
    }
    vibrateClick();
    setSigningIn(true);
    setErrorMsg("");
    try {
      await loginWithEmailPassword(targetEmail, newPassword);
      vibrateSuccess();
      navigate("/");
    } catch (err: any) {
      vibrateWarning();
      const parsed = parseAuthError(err);
      setErrorMsg(parsed.userMessage);
    } finally {
      setSigningIn(false);
    }
  };

  const handleRequestLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    vibrateClick();
    setErrorMsg("");
    setInfoMsg("");

    const cleanEmail = normalizeAuthEmail(requestEmail);
    if (!isValidAuthEmail(cleanEmail)) {
      const msg =
        language === "en"
          ? "Please enter a valid email address."
          : "Informe um endereço de e-mail válido.";
      setErrorMsg(msg);
      addToast(msg, "warning");
      return;
    }

    setSubmitting(true);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : undefined;
      let handledByServer = false;
      try {
        const serverRes = await fetch("/api/auth/request-password-reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: cleanEmail, originUrl: origin }),
        });
        const serverData = await serverRes.json().catch(() => null);
        if (serverRes.ok && serverData?.success && serverData?.fallbackToFirebaseClient !== true) {
          handledByServer = true;
        }
      } catch {
        // Fallback silencioso para Firebase Auth client quando a rota /api não estiver alcançável
      }

      if (!handledByServer) {
        await dispatchPasswordResetWithFallback({
          auth,
          email: cleanEmail,
          originUrl: origin,
          sendFn: (authInstance, email, actionSettings) =>
            actionSettings
              ? sendPasswordResetEmail(authInstance, email, actionSettings)
              : sendPasswordResetEmail(authInstance, email),
        });
      }
      vibrateSuccess();
      setInfoMsg(
        language === "en"
          ? `If '${cleanEmail}' is registered in Firebase Authentication, a link to set or reset your password has been sent. Check your inbox and Spam folder.`
          : `Solicitação processada para '${cleanEmail}'. Se a conta estiver vinculada ao Firebase Authentication, você receberá o link para definir ou redefinir sua senha em instantes (verifique também Spam/Lixo Eletrônico).`
      );
      addToast(
        language === "en" ? "Request processed!" : "Solicitação de link processada!",
        "success"
      );
    } catch (err: any) {
      vibrateWarning();
      const parsed = parseAuthError(err);
      setErrorMsg(parsed.userMessage);
      addToast(parsed.userMessage, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-8 sm:py-12 animate-in fade-in duration-300">
      <SurfaceCard padding="none" className="overflow-hidden">
        <div className="px-6 py-4 bg-[#EBF5F0]/80 dark:bg-emerald-950/30 border-b border-[#16845B]/15 dark:border-emerald-900/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandLogo size="sm" showSubtitle={false} />
            <span className="hidden sm:inline-block text-slate-300 dark:text-slate-700">•</span>
            <span className="text-xs font-semibold text-[#064E3B] dark:text-emerald-300">
              {language === "en" ? "Account Access Security" : "Primeiro Acesso & Senha"}
            </span>
          </div>
          <UIBadge tone="emerald">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Firebase Auth</span>
          </UIBadge>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {stage === "verifying" && (
            <div className="py-10 text-center space-y-4">
              <RefreshCw className="w-8 h-8 text-[#16845B] animate-spin mx-auto" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                {language === "en"
                  ? "Validating secure link with Firebase Authentication..."
                  : "Validando link seguro com o Firebase Authentication..."}
              </p>
            </div>
          )}

          {stage === "reset_form" && (
            <form onSubmit={handleConfirmPassword} className="space-y-5">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-[#EBF5F0] dark:bg-emerald-950/50 text-[#16845B] dark:text-emerald-400 border border-[#16845B]/20 flex items-center justify-center mx-auto">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-[#172B2A] dark:text-white tracking-tight">
                  {language === "en" ? "Set your personal password" : "Defina sua senha pessoal"}
                </h1>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                  {language === "en"
                    ? "Create a strong password for your account:"
                    : "Crie uma senha pessoal e intransferível para a conta:"}
                </p>
                <p className="text-sm font-mono font-bold text-[#064E3B] dark:text-emerald-300 break-all">
                  {targetEmail}
                </p>
              </div>

              {errorMsg && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-800 dark:text-red-200 text-xs flex items-start gap-2"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <UIFieldGroup
                label={language === "en" ? "New password (min. 6 characters)" : "Nova senha (mínimo 6 caracteres)"}
                htmlFor="reset-new-password"
                required
              >
                <UIInput
                  id="reset-new-password"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  required
                  leftIcon={<Lock className="w-4 h-4" />}
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="text-slate-400 hover:text-[#172B2A] dark:hover:text-white p-1 cursor-pointer"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                />
              </UIFieldGroup>

              <UIFieldGroup
                label={language === "en" ? "Confirm new password" : "Confirmar nova senha"}
                htmlFor="reset-confirm-password"
                required
              >
                <UIInput
                  id="reset-confirm-password"
                  type={showNewPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  required
                  leftIcon={<Lock className="w-4 h-4" />}
                />
              </UIFieldGroup>

              <UIButton type="submit" variant="primary" size="lg" fullWidth disabled={submitting}>
                {submitting
                  ? language === "en" ? "Saving password..." : "Salvando senha..."
                  : language === "en" ? "Save Password & Activate Access" : "Salvar Senha e Ativar Acesso"}
              </UIButton>
            </form>
          )}

          {stage === "reset_done" && (
            <div className="space-y-5 text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#EBF5F0] dark:bg-emerald-950/50 text-[#16845B] dark:text-emerald-400 border border-[#16845B]/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h1 className="text-xl sm:text-2xl font-bold text-[#172B2A] dark:text-white">
                  {language === "en" ? "Password ready!" : "Senha definida com sucesso!"}
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {language === "en"
                    ? `Your password for ${targetEmail} has been updated.`
                    : `Sua senha pessoal para ${targetEmail} foi configurada no Firebase Authentication.`}
                </p>
              </div>

              {errorMsg && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-800 dark:text-red-200 text-xs text-left"
                >
                  {errorMsg}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <UIButton
                  type="button"
                  variant="primary"
                  size="lg"
                  fullWidth
                  disabled={signingIn}
                  onClick={handleDirectLoginAfterReset}
                >
                  <LogIn className="w-4 h-4" />
                  <span>
                    {signingIn
                      ? language === "en" ? "Signing in..." : "Entrando..."
                      : language === "en" ? "Sign in now" : "Entrar Agora no Localiza+"}
                  </span>
                </UIButton>
                <UIButton
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={() => navigate("/")}
                >
                  <span>{language === "en" ? "Home" : "Início"}</span>
                </UIButton>
              </div>
            </div>
          )}

          {stage === "verify_email_done" && (
            <div className="space-y-5 text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#EBF5F0] dark:bg-emerald-950/50 text-[#16845B] dark:text-emerald-400 border border-[#16845B]/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h1 className="text-xl font-bold text-[#172B2A] dark:text-white">
                {language === "en" ? "Email verified!" : "E-mail verificado com sucesso!"}
              </h1>
              <UIButton type="button" variant="primary" size="lg" fullWidth onClick={() => navigate("/")}>
                <span>{language === "en" ? "Continue to Localiza+" : "Continuar para o Localiza+"}</span>
              </UIButton>
            </div>
          )}

          {stage === "invalid_code" && (
            <div className="space-y-5 text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h1 className="text-xl font-bold text-[#172B2A] dark:text-white">
                  {language === "en" ? "Link invalid or expired" : "Link inválido ou expirado"}
                </h1>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                  {errorMsg ||
                    (language === "en"
                      ? "This password setup or reset link has expired or has already been used."
                      : "Este link de definição ou redefinição de senha expirou ou já foi utilizado.")}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <UIButton
                  type="button"
                  variant="primary"
                  size="md"
                  fullWidth
                  onClick={() => {
                    setErrorMsg("");
                    setStage("request_link");
                  }}
                >
                  <Mail className="w-4 h-4" />
                  <span>{language === "en" ? "Request a new link" : "Solicitar novo link"}</span>
                </UIButton>
                <UIButton type="button" variant="secondary" size="md" onClick={() => navigate("/")}>
                  <ArrowLeft className="w-4 h-4" />
                  <span>{language === "en" ? "Back" : "Voltar"}</span>
                </UIButton>
              </div>
            </div>
          )}

          {stage === "request_link" && (
            <form onSubmit={handleRequestLinkSubmit} className="space-y-5">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-[#EBF5F0] dark:bg-emerald-950/50 text-[#16845B] dark:text-emerald-400 border border-[#16845B]/20 flex items-center justify-center mx-auto">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-[#172B2A] dark:text-white tracking-tight">
                  {language === "en"
                    ? "First Access or Password Recovery"
                    : "Primeiro Acesso ou Recuperação de Senha"}
                </h1>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {language === "en"
                    ? "Enter your registered email to receive a secure link to create or reset your personal password."
                    : "Informe seu e-mail cadastrado para receber um link seguro de definição ou redefinição de senha."}
                </p>
              </div>

              {errorMsg && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-800 dark:text-red-200 text-xs flex items-start gap-2"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {infoMsg && (
                <div
                  role="status"
                  className="p-3.5 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/40 border border-[#16845B]/30 dark:border-emerald-800/60 text-[#064E3B] dark:text-emerald-200 text-xs flex items-start gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#16845B]" />
                  <span>{infoMsg}</span>
                </div>
              )}

              <UIFieldGroup
                label={language === "en" ? "Registered Email" : "E-mail cadastrado"}
                htmlFor="request-reset-email"
                required
              >
                <UIInput
                  id="request-reset-email"
                  type="email"
                  value={requestEmail}
                  onChange={(e) => setRequestEmail(e.target.value)}
                  placeholder="seu.nome@ifpr.edu.br"
                  required
                  leftIcon={<Mail className="w-4 h-4" />}
                />
              </UIFieldGroup>

              <SubtlePanel className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
                <p className="font-semibold text-[#172B2A] dark:text-slate-200">
                  {language === "en" ? "Important notes:" : "Orientações importantes:"}
                </p>
                <p>
                  •{" "}
                  {language === "en"
                    ? "Check your Spam/Junk folder if the message does not appear within 2 minutes."
                    : "Verifique a pasta de Spam ou Lixo Eletrônico caso a mensagem não chegue em até 2 minutos."}
                </p>
                <p>
                  •{" "}
                  {language === "en"
                    ? "If your institutional account uses Google Sign-In, you can also click 'Continue with Google' on the login screen."
                    : "Se sua conta institucional utiliza login Google, você também pode entrar diretamente usando 'Continuar com Google'."}
                </p>
              </SubtlePanel>

              <div className="flex flex-col sm:flex-row gap-3">
                <UIButton type="submit" variant="primary" size="lg" fullWidth disabled={submitting}>
                  {submitting
                    ? language === "en" ? "Sending..." : "Enviando..."
                    : language === "en" ? "Send Password Link" : "Enviar Link por E-mail"}
                </UIButton>
                <UIButton
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={() => {
                    navigate("/");
                    setAuthModalOpen(true);
                  }}
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>{language === "en" ? "Login" : "Entrar"}</span>
                </UIButton>
              </div>
            </form>
          )}
        </div>
      </SurfaceCard>
    </div>
  );
};

export default ResetPasswordView;
