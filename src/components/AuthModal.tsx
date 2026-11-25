import React, { useState, useEffect } from "react";
import {
  X,
  Mail,
  Lock,
  User as UserIcon,
  Shield,
  ShieldCheck,
  Phone,
  LogIn,
  UserPlus,
  LogOut,
  AlertTriangle,
  Check,
  Copy,
  Eye,
  EyeOff,
  Hash,
  KeyRound,
  ArrowLeft,
} from "lucide-react";
import { useApp, previewInstitutionalRole } from "../context/AppContext";
import { useRouter } from "../context/RouterContext";
import { translateUserRole } from "../lib/i18n";
import {
  vibrateClick,
  vibrateSuccess,
  vibrateWarning,
  formatPhone,
  isValidPhone,
} from "../lib/utils";
import { parseAuthError, handleAuthError } from "../lib/authErrorHandler";
import {
  dispatchPasswordResetWithFallback,
  isValidAuthEmail,
  normalizeAuthEmail,
} from "../lib/adminUserProvisioning";
import { auth } from "../lib/firebase";
import { sendPasswordResetEmail } from "firebase/auth";
import {
  BrandLogo,
  UIButton,
  UIBadge,
  UIFieldGroup,
  UIInput,
} from "./ui";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const {
    loginWithGoogle,
    loginWithEmailPassword,
    registerWithEmailPassword,
    logout,
    currentUser,
    firebaseUser,
    addToast,
    pendingPostLoginAction,
    language,
    t,
  } = useApp();
  const { navigate } = useRouter();

  const [mode, setMode] = useState<"login" | "register" | "reset">("login");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Login & Password Reset form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");

  // Register form state
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regCourseOrDept] = useState("Técnico em Informática - Campus Ivaiporã");
  const [regMatricula, setRegMatricula] = useState("");
  const [regPhone, setRegPhone] = useState("");

  const regRoleDetermination = previewInstitutionalRole(regEmail);

  // Close modal on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        vibrateClick();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    vibrateClick();
    setErrorMsg("");
    setSuccessMsg("");
    const cleanEmail = loginEmail.trim().toLowerCase();
    const cleanPass = loginPassword.trim();
    if (!cleanEmail || !cleanPass) {
      const msg = t("fillEmailPasswordError");
      setErrorMsg(msg);
      addToast(msg, "warning");
      return;
    }
    setLoading(true);
    try {
      await loginWithEmailPassword(cleanEmail, cleanPass);
      vibrateSuccess();
      onClose();
      if (auth.currentUser && !auth.currentUser.emailVerified) {
        navigate("/verificar-email");
      }
    } catch (err: any) {
      console.error("[Email Auth Error]", err);
      vibrateWarning();
      const parsed = parseAuthError(err);
      setErrorMsg(parsed.userMessage);
      addToast(parsed.userMessage, "error");
    } finally {
      setLoading(false);
    }
  };

  const openPasswordResetMode = () => {
    vibrateClick();
    setErrorMsg("");
    setSuccessMsg("");
    if (loginEmail.trim()) {
      setResetEmail(loginEmail.trim());
    }
    setMode("reset");
  };

  const handlePasswordReset = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    vibrateClick();
    setErrorMsg("");
    setSuccessMsg("");

    const candidateEmail = mode === "reset" ? resetEmail : (resetEmail || loginEmail);
    const cleanEmail = normalizeAuthEmail(candidateEmail);
    if (!isValidAuthEmail(cleanEmail)) {
      const msg = t("enterInstitutionalEmailReset");
      setErrorMsg(msg);
      addToast(msg, "warning");
      return;
    }

    setLoading(true);
    try {
      const originUrl = typeof window !== "undefined" ? window.location.origin : undefined;
      await dispatchPasswordResetWithFallback({
        auth,
        email: cleanEmail,
        originUrl,
        sendFn: (authInstance, email, actionSettings) =>
          actionSettings
            ? sendPasswordResetEmail(authInstance, email, actionSettings)
            : sendPasswordResetEmail(authInstance, email),
      });
      vibrateSuccess();
      setSuccessMsg(
        language === "en"
          ? `Request processed for ${cleanEmail}. If this email has an active Firebase Authentication account, you will receive the link to set or reset your password shortly (also check Spam/Junk).`
          : `${t("recoveryEmailRequestSubmitted")} ${cleanEmail}. Se este e-mail possuir conta vinculada no Firebase Authentication, você receberá em instantes o link para definir ou redefinir sua senha (verifique também Spam/Lixo Eletrônico).`
      );
      addToast(t("recoveryEmailSent"), "success");
    } catch (err: any) {
      console.error("[Password Reset Error]", err);
      vibrateWarning();
      const parsed = parseAuthError(err);
      const fullErr = parsed.actionHint
        ? `${parsed.userMessage} (${parsed.actionHint})`
        : parsed.userMessage;
      setErrorMsg(fullErr);
      addToast(parsed.userMessage, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    vibrateClick();
    setErrorMsg("");
    setSuccessMsg("");

    const trimmedName = regName.trim();
    if (!trimmedName || trimmedName.length < 3) {
      const msg = t("enterFullNameError");
      setErrorMsg(msg);
      addToast(msg, "warning");
      return;
    }

    const cleanEmail = regEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      const msg = t("enterValidEmailError");
      setErrorMsg(msg);
      addToast(msg, "warning");
      return;
    }

    const cleanPass = regPassword.trim();
    if (!cleanPass || cleanPass.length < 6) {
      const msg = t("passwordMinLengthError");
      setErrorMsg(msg);
      addToast(msg, "warning");
      return;
    }

    const cleanPhone = regPhone.trim();
    if (cleanPhone && !isValidPhone(cleanPhone)) {
      const msg = t("invalidPhoneError");
      setErrorMsg(msg);
      addToast(msg, "warning");
      return;
    }

    const roleDetermination = previewInstitutionalRole(cleanEmail);
    const assignedRole = roleDetermination.role;

    setLoading(true);
    try {
      await registerWithEmailPassword(cleanEmail, cleanPass, {
        name: trimmedName,
        email: cleanEmail,
        role: assignedRole,
        courseOrDept:
          regCourseOrDept.trim() ||
          (assignedRole === "SERVIDOR"
            ? "Servidor IFPR Campus Ivaiporã"
            : assignedRole === "ALUNO"
            ? "Estudante IFPR Campus Ivaiporã"
            : "Usuário Externo / Visitante"),
        registrationNumber:
          regMatricula.trim() ||
          `2026${Math.floor(10000 + Math.random() * 90000)}`,
        phone: cleanPhone ? formatPhone(cleanPhone) : "",
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
          trimmedName
        )}`,
      });
      vibrateSuccess();
      onClose();
      navigate("/verificar-email");
    } catch (err: any) {
      console.error("[Register Error]", err);
      vibrateWarning();
      const parsed = parseAuthError(err);
      setErrorMsg(parsed.userMessage);
      addToast(parsed.userMessage, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleClick = async () => {
    vibrateClick();
    setErrorMsg("");
    setSuccessMsg("");
    setLoading(true);
    try {
      await loginWithGoogle();
      vibrateSuccess();
      addToast(t("googleLoginSuccess"), "success");
      onClose();
    } catch (err: any) {
      console.error("[Google Auth Error]", err);
      vibrateWarning();
      const parsed = handleAuthError(err, {
        addToast,
        showToastForUserCancellation: false,
      });
      setErrorMsg(parsed.userMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyDomain = () => {
    const domainToCopy =
      typeof window !== "undefined" && window.location.hostname
        ? window.location.hostname
        : "localizamais.vercel.app";

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(domainToCopy)
        .then(() => {
          setCopiedDomain(true);
          setTimeout(() => setCopiedDomain(false), 3000);
        })
        .catch(() => {});
    }
    addToast(
      language === "en"
        ? `Domain '${domainToCopy}' copied successfully!`
        : `Domínio '${domainToCopy}' copiado com sucesso!`,
      "success"
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          vibrateClick();
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm overflow-y-auto overscroll-contain transition-all duration-200 animate-fade-in"
    >
      <div className="relative w-full max-w-md bg-white dark:bg-[#111827] text-[#172B2A] dark:text-slate-100 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-[0_20px_60px_rgba(6,78,59,0.16)] dark:shadow-[0_24px_64px_rgba(0,0,0,0.65)] overflow-hidden my-auto max-h-[92dvh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Top Header / Brand Identity */}
        <div className="px-6 pt-6 pb-4 bg-gradient-to-b from-[#EBF5F0]/70 to-transparent dark:from-emerald-950/30 dark:to-transparent border-b border-slate-100 dark:border-slate-800/80 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col items-start">
              <BrandLogo size="md" showSubtitle={false} />
              <div className="mt-2.5 flex items-center gap-2">
                <UIBadge tone="emerald">
                  {t("campusName")}
                </UIBadge>
              </div>
              <h2
                id="auth-modal-title"
                className="text-xl font-bold tracking-tight text-[#172B2A] dark:text-white mt-2"
              >
                {mode === "login"
                  ? t("accessYourAccount")
                  : mode === "reset"
                  ? t("firstAccessOrForgot")
                  : t("createYourAccount")}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                {mode === "login"
                  ? t("authLoginDesc")
                  : mode === "reset"
                  ? language === "en"
                    ? "Enter your email to receive a secure link to set or reset your password."
                    : "Informe seu e-mail para receber o link seguro de definição ou redefinição de senha."
                  : t("authRegisterDesc")}
              </p>
            </div>

            <button
              onClick={() => {
                vibrateClick();
                onClose();
              }}
              type="button"
              aria-label={t("close")}
              className="p-2 rounded-xl text-slate-400 hover:text-[#172B2A] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Clean Tab Switcher */}
          <div className="mt-4 grid grid-cols-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200/70 dark:border-slate-700/70">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setErrorMsg("");
                setSuccessMsg("");
              }}
              className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                mode === "login"
                  ? "bg-[#16845B] text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-300 hover:text-[#172B2A] dark:hover:text-white"
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{t("login")}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setErrorMsg("");
                setSuccessMsg("");
              }}
              className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                mode === "register"
                  ? "bg-[#16845B] text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-300 hover:text-[#172B2A] dark:hover:text-white"
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{t("createAccount")}</span>
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-6 overflow-y-auto min-h-0 flex-1 overscroll-contain space-y-4">
          {pendingPostLoginAction?.action === "REGISTER_ITEM" && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-3">
              <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-xs text-amber-900 dark:text-amber-100">
                  {pendingPostLoginAction.customMessage || t("authRequiredTitle")}
                </p>
                <p className="text-[11px] text-amber-800 dark:text-amber-200/90 leading-relaxed">
                  {t("authRequiredDesc")}
                </p>
              </div>
            </div>
          )}

          {(currentUser.id !== "guest_visitor" || firebaseUser) && (
            <div className="p-3.5 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/40 border border-[#16845B]/25 dark:border-emerald-800/60 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-[#16845B] dark:text-emerald-400">
                  {t("activeSession")} ({translateUserRole(currentUser.role, language)})
                </p>
                <p className="text-xs font-bold text-[#172B2A] dark:text-white truncate">
                  {currentUser.name}
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                  {currentUser.email}
                </p>
              </div>
              <UIButton
                type="button"
                variant="danger"
                size="sm"
                onClick={async () => {
                  await logout();
                  onClose();
                }}
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{t("logout")}</span>
              </UIButton>
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-800 dark:text-red-200 text-xs space-y-2"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                <span className="leading-relaxed font-medium">{errorMsg}</span>
              </div>
              {errorMsg.includes("não está autorizado") && (
                <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-red-200 dark:border-red-800/60 text-[11px] text-slate-700 dark:text-slate-200 space-y-1.5">
                  <p className="font-bold text-red-700 dark:text-red-300">
                    {language === "en"
                      ? "Add this domain in Firebase Console:"
                      : "Adicione este domínio no Firebase Console:"}
                  </p>
                  <UIButton
                    type="button"
                    variant="primary"
                    size="sm"
                    fullWidth
                    onClick={handleCopyDomain}
                  >
                    {copiedDomain ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {copiedDomain
                        ? language === "en" ? "Copied!" : "Copiado!"
                        : language === "en" ? "Copy Current Domain" : "Copiar Domínio Atual"}
                    </span>
                  </UIButton>
                </div>
              )}
            </div>
          )}

          {successMsg && (
            <div
              role="status"
              className="p-3.5 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/40 border border-[#16845B]/30 dark:border-emerald-800/60 text-[#064E3B] dark:text-emerald-200 text-xs flex items-start gap-2"
            >
              <Check className="w-4 h-4 shrink-0 text-[#16845B] dark:text-emerald-400 mt-0.5" />
              <span className="leading-relaxed font-medium">{successMsg}</span>
            </div>
          )}

          {mode === "login" ? (
            /* LOGIN FORM */
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <UIFieldGroup
                label={language === "en" ? "Institutional or personal email" : "E-mail institucional ou pessoal"}
                htmlFor="auth-login-email"
                required
              >
                <UIInput
                  id="auth-login-email"
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder={language === "en" ? "your.name@ifpr.edu.br" : "seu.nome@ifpr.edu.br"}
                  required
                  leftIcon={<Mail className="w-4 h-4" />}
                />
              </UIFieldGroup>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="auth-login-password"
                    className="block text-xs font-semibold text-[#172B2A] dark:text-slate-200 tracking-tight"
                  >
                    {t("passwordLabel")} <span className="text-red-600 dark:text-red-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={openPasswordResetMode}
                    disabled={loading}
                    className="text-xs text-[#16845B] hover:text-[#064E3B] dark:text-emerald-400 dark:hover:text-emerald-300 font-semibold hover:underline cursor-pointer"
                  >
                    {t("forgotPassword")}
                  </button>
                </div>
                <UIInput
                  id="auth-login-password"
                  type={showPassword ? "text" : "password"}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  leftIcon={<Lock className="w-4 h-4" />}
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={
                        showPassword
                          ? language === "en" ? "Hide password" : "Ocultar senha"
                          : language === "en" ? "Show password" : "Mostrar senha"
                      }
                      className="text-slate-400 hover:text-[#172B2A] dark:hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  }
                />
              </div>

              <div className="pt-1 space-y-2">
                <UIButton
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  disabled={loading}
                >
                  {loading
                    ? language === "en" ? "Signing in..." : "Entrando..."
                    : t("login")}
                </UIButton>

                <button
                  type="button"
                  onClick={openPasswordResetMode}
                  disabled={loading}
                  className="w-full py-1.5 text-[11px] font-semibold text-slate-500 hover:text-[#16845B] dark:text-slate-400 dark:hover:text-emerald-400 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{t("firstAccessOrForgot")}</span>
                </button>
              </div>
            </form>
          ) : mode === "reset" ? (
            /* FIRST ACCESS / PASSWORD RESET FORM */
            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <p className="font-semibold text-[#172B2A] dark:text-white">
                  {language === "en"
                    ? "Account created by administration?"
                    : "Conta criada pela administração ou esqueceu sua senha?"}
                </p>
                <p className="text-[11px] leading-relaxed">
                  {language === "en"
                    ? "Use the email registered by the campus administrator to receive a personal link to set your password."
                    : "Informe o e-mail cadastrado no sistema para receber o link seguro e definir sua senha pessoal. Caso não receba em instantes, verifique o Spam ou solicite ao administrador o reenvio do primeiro acesso."}
                </p>
              </div>

              <UIFieldGroup
                label={language === "en" ? "Registered email" : "E-mail cadastrado"}
                htmlFor="auth-reset-email"
                required
              >
                <UIInput
                  id="auth-reset-email"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder={language === "en" ? "your.name@ifpr.edu.br" : "seu.nome@ifpr.edu.br"}
                  required
                  leftIcon={<Mail className="w-4 h-4" />}
                />
              </UIFieldGroup>

              <div className="space-y-2">
                <UIButton
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  disabled={loading}
                >
                  <KeyRound className="w-4 h-4" />
                  <span>
                    {loading
                      ? language === "en" ? "Sending link..." : "Enviando link..."
                      : t("sendPasswordResetLink")}
                  </span>
                </UIButton>

                <button
                  type="button"
                  onClick={() => {
                    vibrateClick();
                    setErrorMsg("");
                    setSuccessMsg("");
                    if (resetEmail.trim()) {
                      setLoginEmail(resetEmail.trim());
                    }
                    setMode("login");
                  }}
                  className="w-full py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-[#16845B] dark:hover:text-emerald-400 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{t("backToLogin")}</span>
                </button>
              </div>
            </form>
          ) : (
            /* REGISTER FORM */
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <UIFieldGroup
                label={t("fullNameLabel")}
                htmlFor="auth-reg-name"
                required
              >
                <UIInput
                  id="auth-reg-name"
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder={language === "en" ? "e.g., Lucas Silva Santos" : "Ex: Lucas Silva Santos"}
                  required
                  leftIcon={<UserIcon className="w-4 h-4" />}
                />
              </UIFieldGroup>

              <UIFieldGroup
                label={language === "en" ? "Institutional or Personal Email" : "E-mail Institucional ou Pessoal"}
                htmlFor="auth-reg-email"
                required
              >
                <UIInput
                  id="auth-reg-email"
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder={language === "en" ? "your.name@estudantes.ifpr.edu.br" : "seu.nome@estudantes.ifpr.edu.br"}
                  required
                  leftIcon={<Mail className="w-4 h-4" />}
                />
              </UIFieldGroup>

              <UIFieldGroup
                label={language === "en" ? "Password (minimum 6 characters)" : "Senha (mínimo 6 caracteres)"}
                htmlFor="auth-reg-password"
                required
              >
                <UIInput
                  id="auth-reg-password"
                  type={showRegPassword ? "text" : "password"}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder={language === "en" ? "Minimum 6 characters" : "Mínimo 6 caracteres"}
                  required
                  minLength={6}
                  leftIcon={<Lock className="w-4 h-4" />}
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      aria-label={
                        showRegPassword
                          ? language === "en" ? "Hide password" : "Ocultar senha"
                          : language === "en" ? "Show password" : "Mostrar senha"
                      }
                      className="text-slate-400 hover:text-[#172B2A] dark:hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
                    >
                      {showRegPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  }
                />
              </UIFieldGroup>

              {/* Vínculo Institucional Identificado */}
              <div className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck
                    className={`w-4 h-4 ${
                      regRoleDetermination.isInstitutional
                        ? "text-[#16845B] dark:text-emerald-400"
                        : "text-slate-400"
                    }`}
                  />
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {language === "en" ? "Detected affiliation:" : "Vínculo identificado:"}
                  </span>
                </div>
                <UIBadge
                  tone={
                    regRoleDetermination.isInstitutional
                      ? "emerald"
                      : regEmail.trim().includes("@") && regEmail.trim().includes(".")
                      ? "blue"
                      : "slate"
                  }
                >
                  {regRoleDetermination.isInstitutional
                    ? translateUserRole(regRoleDetermination.role, language)
                    : regEmail.trim().includes("@") && regEmail.trim().includes(".")
                    ? language === "en"
                      ? "External Community"
                      : "Comunidade Externa"
                    : language === "en"
                    ? "Waiting for Email"
                    : "Aguardando E-mail"}
                </UIBadge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <UIFieldGroup
                  label={t("matriculaLabel")}
                  htmlFor="auth-reg-matricula"
                >
                  <UIInput
                    id="auth-reg-matricula"
                    type="text"
                    value={regMatricula}
                    onChange={(e) => setRegMatricula(e.target.value)}
                    placeholder={language === "en" ? "e.g., 2026109823" : "Ex: 2026109823"}
                    leftIcon={<Hash className="w-4 h-4" />}
                  />
                </UIFieldGroup>

                <UIFieldGroup
                  label={t("phoneOptionalLabel")}
                  htmlFor="auth-reg-phone"
                >
                  <UIInput
                    id="auth-reg-phone"
                    type="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(formatPhone(e.target.value))}
                    placeholder="(43) 99876-5432"
                    maxLength={15}
                    leftIcon={<Phone className="w-4 h-4" />}
                  />
                </UIFieldGroup>
              </div>

              <div className="pt-1">
                <UIButton
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  disabled={loading}
                >
                  {loading
                    ? language === "en" ? "Registering..." : "Cadastrando..."
                    : t("submitItem")}
                </UIButton>
              </div>
            </form>
          )}

          {/* Divider "ou" */}
          <div className="relative flex items-center justify-center py-1">
            <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
            <span className="bg-white dark:bg-[#111827] px-3 text-xs font-medium text-slate-400 dark:text-slate-500">
              {language === "en" ? "or" : "ou"}
            </span>
          </div>

          {/* Google Sign-In Button */}
          <div>
            <button
              type="button"
              onClick={handleGoogleClick}
              disabled={loading}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-slate-800/80 dark:hover:bg-slate-800 text-[#172B2A] dark:text-slate-100 text-sm font-semibold transition-all flex items-center justify-center gap-3 shadow-xs cursor-pointer disabled:opacity-60"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{t("continueWithGoogle")}</span>
            </button>
          </div>

          {/* Quick Footer Links matching reference design */}
          <div className="pt-1 flex items-center justify-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setMode(mode === "login" ? "register" : "login");
                setErrorMsg("");
                setSuccessMsg("");
              }}
              className="font-semibold text-[#172B2A] dark:text-slate-200 hover:text-[#16845B] dark:hover:text-emerald-400 transition-colors cursor-pointer"
            >
              {mode === "login"
                ? t("createAccount")
                : language === "en" ? "I already have an account" : "Já tenho uma conta"}
            </button>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            {mode === "login" ? (
              <button
                type="button"
                onClick={openPasswordResetMode}
                disabled={loading}
                className="font-medium text-slate-500 dark:text-slate-400 hover:text-[#16845B] dark:hover:text-emerald-400 transition-colors cursor-pointer"
              >
                {t("forgotPassword")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  vibrateClick();
                  onClose();
                }}
                className="font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                {t("cancel")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
