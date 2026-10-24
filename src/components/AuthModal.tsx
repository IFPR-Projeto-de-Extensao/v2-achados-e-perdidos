import React, { useState, useEffect } from "react";
import { 
  X, Mail, Lock, User as UserIcon, Shield, ShieldCheck, 
  GraduationCap, Phone, FileText, Sparkles, LogIn, UserPlus, 
  LogOut, AlertTriangle, Check, Copy, Eye, EyeOff, KeyRound 
} from "lucide-react";
import { useApp, previewInstitutionalRole } from "../context/AppContext";
import { useRouter } from "../context/RouterContext";
import { 
  triggerVibration, vibrateClick, vibrateSuccess, 
  vibrateWarning, formatPhone, isValidPhone 
} from "../lib/utils";
import { parseAuthError, handleAuthError } from "../lib/authErrorHandler";
import { auth } from "../lib/firebase";
import { sendPasswordResetEmail } from "firebase/auth";

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
  } = useApp();
  const { navigate } = useRouter();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register form state
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regCourseOrDept, setRegCourseOrDept] = useState("Técnico em Informática - Campus Ivaiporã");
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
      setErrorMsg("Preencha e-mail e senha para entrar.");
      addToast("Preencha e-mail e senha para entrar.", "warning");
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

  const handlePasswordReset = async () => {
    vibrateClick();
    setErrorMsg("");
    setSuccessMsg("");
    const cleanEmail = loginEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setErrorMsg("Informe seu e-mail institucional no campo de e-mail para recuperar a senha.");
      addToast("Informe seu e-mail no campo de e-mail.", "warning");
      return;
    }

    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      vibrateSuccess();
      setSuccessMsg(`E-mail de recuperação enviado para ${cleanEmail}. Verifique sua caixa de entrada e spam.`);
      addToast("E-mail de recuperação enviado com sucesso!", "success");
    } catch (err: any) {
      console.error("[Password Reset Error]", err);
      vibrateWarning();
      const parsed = parseAuthError(err);
      setErrorMsg(parsed.userMessage);
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
      setErrorMsg("Por favor, informe seu nome completo (mínimo de 3 caracteres).");
      addToast("Por favor, informe seu nome completo.", "warning");
      return;
    }

    const cleanEmail = regEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setErrorMsg("Por favor, informe um endereço de e-mail válido (ex: seu.nome@estudante.ifpr.edu.br).");
      addToast("Por favor, informe um endereço de e-mail válido.", "warning");
      return;
    }

    const cleanPass = regPassword.trim();
    if (!cleanPass || cleanPass.length < 6) {
      setErrorMsg("A senha deve ter no mínimo 6 caracteres.");
      addToast("A senha deve ter no mínimo 6 caracteres.", "warning");
      return;
    }

    const cleanPhone = regPhone.trim();
    if (cleanPhone && !isValidPhone(cleanPhone)) {
      setErrorMsg("Telefone inválido. Informe o DDD e o número completo (ex: (43) 99876-5432).");
      addToast("Número de telefone inválido.", "warning");
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
        courseOrDept: regCourseOrDept.trim() || (
          assignedRole === "SERVIDOR"
            ? "Servidor IFPR Campus Ivaiporã"
            : assignedRole === "ALUNO"
            ? "Estudante IFPR Campus Ivaiporã"
            : "Usuário Externo / Visitante"
        ),
        registrationNumber: regMatricula.trim() || `2026${Math.floor(10000 + Math.random() * 90000)}`,
        phone: cleanPhone ? formatPhone(cleanPhone) : "",
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(trimmedName)}`,
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
      addToast("Autenticação com Google realizada com sucesso!", "success");
      onClose();
    } catch (err: any) {
      console.error("[Google Auth Error]", err);
      vibrateWarning();
      const parsed = handleAuthError(err, { addToast, showToastForUserCancellation: false });
      setErrorMsg(parsed.userMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyDomain = () => {
    const domainToCopy = typeof window !== "undefined" && window.location.hostname
      ? window.location.hostname
      : "localizamais.vercel.app";

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(domainToCopy).then(() => {
        setCopiedDomain(true);
        setTimeout(() => setCopiedDomain(false), 3000);
      }).catch(() => {});
    }
    addToast(`Domínio '${domainToCopy}' copiado com sucesso!`, "success");
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md transition-all duration-300 animate-fade-in"
    >
      <div className="relative w-full max-w-md bg-[#0D1B13] dark:bg-[#0D1B13] text-white rounded-3xl shadow-2xl border border-[#00843D]/40 overflow-hidden my-auto max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Top Header / Brand Badge */}
        <div className="p-6 pb-4 bg-gradient-to-b from-[#00843D]/20 to-transparent flex items-start justify-between shrink-0 border-b border-[#00843D]/20">
          <div className="space-y-1">
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#00843D]/30 border border-[#00843D]/50 text-[11px] font-bold text-emerald-300">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>IFPR Campus Ivaiporã</span>
            </div>
            <h2 id="auth-modal-title" className="text-2xl font-extrabold tracking-tight text-white mt-2">
              {mode === "login" ? "Bem-vindo de volta." : "Criar sua conta."}
            </h2>
            <p className="text-xs text-neutral-300 font-medium">
              {mode === "login" ? "Acesse sua conta para continuar no Localiza+." : "Cadastre-se com seu e-mail institucional."}
            </p>
          </div>
          <button
            onClick={() => {
              vibrateClick();
              onClose();
            }}
            type="button"
            aria-label="Fechar janela"
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white/80 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-6 pt-4 shrink-0">
          <div className="flex bg-[#05110B] p-1 rounded-2xl border border-[#00843D]/30">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setErrorMsg("");
                setSuccessMsg("");
              }}
              className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                mode === "login"
                  ? "bg-[#00843D] text-white shadow-md shadow-green-900/40"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Entrar</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setErrorMsg("");
                setSuccessMsg("");
              }}
              className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                mode === "register"
                  ? "bg-[#00843D] text-white shadow-md shadow-green-900/40"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Cadastrar-se</span>
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          
          {pendingPostLoginAction?.action === "REGISTER_ITEM" && (
            <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-3">
              <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-extrabold text-xs text-amber-100">
                  {pendingPostLoginAction.customMessage || "Autenticação Obrigatória"}
                </p>
                <p className="text-[11px] text-amber-200/90 leading-relaxed">
                  Para registrar pertences com segurança no Campus Ivaiporã, entre ou crie sua conta institucional.
                </p>
              </div>
            </div>
          )}

          {(currentUser.id !== "guest_visitor" || firebaseUser) && (
            <div className="p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-emerald-400">
                  Sessão Ativa ({currentUser.role})
                </p>
                <p className="text-xs font-bold text-white">
                  {currentUser.name}
                </p>
                <p className="text-[11px] text-neutral-300">
                  {currentUser.email}
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  onClose();
                }}
                className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white text-xs font-bold transition-all border border-red-500/30 flex items-center gap-1 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sair</span>
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-red-500/20 border border-red-500/40 text-red-200 text-xs space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                <span className="leading-relaxed">{errorMsg}</span>
              </div>
              {errorMsg.includes("não está autorizado") && (
                <div className="p-2.5 bg-black/40 rounded-xl border border-red-500/30 text-[11px] text-neutral-200 space-y-1">
                  <p className="font-bold text-red-300">Adicione este domínio no Firebase Console:</p>
                  <button
                    type="button"
                    onClick={handleCopyDomain}
                    className="w-full py-1.5 px-3 rounded-lg bg-[#00843D] text-white text-[11px] font-bold flex items-center justify-center gap-1.5 hover:bg-[#006e33] transition-colors cursor-pointer"
                  >
                    {copiedDomain ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedDomain ? "Copiado!" : "Copiar Domínio Atual"}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs flex items-start gap-2">
              <Check className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              <span className="leading-relaxed">{successMsg}</span>
            </div>
          )}

          {/* Google Sign In */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleGoogleClick}
              disabled={loading}
              className="w-full py-3 px-4 rounded-2xl border border-[#00843D]/40 bg-[#05110B] hover:bg-[#0A2616] text-white text-xs font-bold transition-all flex items-center justify-center space-x-3 shadow-md cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Continuar com a Conta Google</span>
            </button>
          </div>

          <div className="relative flex items-center justify-center my-3">
            <div className="border-t border-[#00843D]/30 w-full" />
            <span className="bg-[#0D1B13] px-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest absolute">
              ou com e-mail institucional
            </span>
          </div>

          {mode === "login" ? (
            /* LOGIN FORM */
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1.5">
                  E-mail institucional (@ifpr.edu.br ou @estudantes.ifpr.edu.br)
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-3.5 text-neutral-400" />
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="seu.nome@ifpr.edu.br"
                    required
                    className="w-full pl-10 pr-4 py-3 rounded-2xl border border-[#00843D]/30 bg-[#05110B] text-white text-xs outline-none focus:border-[#00843D] focus:ring-1 focus:ring-[#00843D] transition-all"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-neutral-300">
                    Senha
                  </label>
                  <button
                    type="button"
                    onClick={handlePasswordReset}
                    disabled={loading}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold underline cursor-pointer"
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-neutral-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-10 pr-10 py-3 rounded-2xl border border-[#00843D]/30 bg-[#05110B] text-white text-xs outline-none focus:border-[#00843D] focus:ring-1 focus:ring-[#00843D] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3.5 text-neutral-400 hover:text-white cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    vibrateClick();
                    onClose();
                  }}
                  className="w-1/3 py-3 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-2/3 py-3 rounded-2xl bg-[#00843D] hover:bg-[#006e33] text-white font-bold text-xs shadow-lg shadow-green-900/40 transition-all flex items-center justify-center space-x-2 cursor-pointer"
                >
                  {loading ? "Entrando..." : "Entrar no Localiza+"}
                </button>
              </div>
            </form>
          ) : (
            /* REGISTER FORM */
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">
                  Nome Completo *
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 absolute left-3.5 top-3 text-neutral-400" />
                  <input
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Ex: Lucas Silva Santos"
                    required
                    className="w-full pl-10 pr-3 py-2.5 rounded-2xl border border-[#00843D]/30 bg-[#05110B] text-white text-xs outline-none focus:border-[#00843D] transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">
                  E-mail Institucional *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-3 text-neutral-400" />
                  <input
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="seu.nome@estudantes.ifpr.edu.br"
                    required
                    className="w-full pl-10 pr-3 py-2.5 rounded-2xl border border-[#00843D]/30 bg-[#05110B] text-white text-xs outline-none focus:border-[#00843D] transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">
                  Senha (mínimo 6 caracteres) *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-3 text-neutral-400" />
                  <input
                    type={showRegPassword ? "text" : "password"}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    required
                    minLength={6}
                    className="w-full pl-10 pr-10 py-2.5 rounded-2xl border border-[#00843D]/30 bg-[#05110B] text-white text-xs outline-none focus:border-[#00843D] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    className="absolute right-3.5 top-3 text-neutral-400 hover:text-white cursor-pointer"
                  >
                    {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Vínculo Institucional Identificado */}
              <div className="p-3 rounded-2xl bg-[#05110B] border border-[#00843D]/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className={`w-4 h-4 ${regRoleDetermination.isInstitutional ? "text-emerald-400" : "text-neutral-400"}`} />
                  <span className="text-xs font-bold text-neutral-300">Vínculo:</span>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  regRoleDetermination.isInstitutional
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "bg-neutral-800 text-neutral-400"
                }`}>
                  {regRoleDetermination.isInstitutional ? regRoleDetermination.label : "Aguardando E-mail"}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">
                    Matrícula / SIAPE
                  </label>
                  <input
                    type="text"
                    value={regMatricula}
                    onChange={(e) => setRegMatricula(e.target.value)}
                    placeholder="Ex: 2026109823"
                    className="w-full px-3 py-2.5 rounded-2xl border border-[#00843D]/30 bg-[#05110B] text-white text-xs outline-none focus:border-[#00843D] transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(formatPhone(e.target.value))}
                    placeholder="(43) 99876-5432"
                    maxLength={15}
                    className="w-full px-3 py-2.5 rounded-2xl border border-[#00843D]/30 bg-[#05110B] text-white text-xs outline-none focus:border-[#00843D] transition-all"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    vibrateClick();
                    onClose();
                  }}
                  className="w-1/3 py-3 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-2/3 py-3 rounded-2xl bg-[#00843D] hover:bg-[#006e33] text-white font-bold text-xs shadow-lg shadow-green-900/40 transition-all flex items-center justify-center space-x-2 cursor-pointer"
                >
                  {loading ? "Cadastrando..." : "Concluir Cadastro"}
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
};

export default AuthModal;
