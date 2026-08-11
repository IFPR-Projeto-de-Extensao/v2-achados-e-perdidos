import React, { useState } from "react";
import { X, Mail, Lock, User as UserIcon, Shield, GraduationCap, Building2, Phone, FileText, Sparkles, LogIn, UserPlus, LogOut } from "lucide-react";
import { useApp } from "../context/AppContext";
import { UserRole } from "../types";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { loginWithGoogle, loginWithEmailPassword, registerWithEmailPassword, logout, currentUser, firebaseUser } = useApp();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register form state
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regRole, setRegRole] = useState<UserRole>("ALUNO");
  const [regCourseOrDept, setRegCourseOrDept] = useState("Técnico em Informática - Campus Ivaiporã");
  const [regMatricula, setRegMatricula] = useState("");
  const [regPhone, setRegPhone] = useState("");

  if (!isOpen) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    if (!loginEmail || !loginPassword) {
      setErrorMsg("Preencha e-mail e senha para entrar.");
      return;
    }
    setLoading(true);
    try {
      await loginWithEmailPassword(loginEmail, loginPassword);
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Erro ao entrar: " + (err.message || "Verifique suas credenciais."));
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    if (!regName || !regEmail || !regPassword) {
      setErrorMsg("Nome, e-mail e senha são obrigatórios.");
      return;
    }
    setLoading(true);
    try {
      await registerWithEmailPassword(regEmail, regPassword, {
        name: regName,
        email: regEmail,
        role: regRole,
        courseOrDept: regCourseOrDept,
        registrationNumber: regMatricula || `2026${Math.floor(10000 + Math.random() * 90000)}`,
        phone: regPhone || "(43) 99999-0000",
      });
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Erro no cadastro: " + (err.message || "Tente novamente."));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleClick = async () => {
    setErrorMsg("");
    setLoading(true);
    try {
      await loginWithGoogle();
      onClose();
    } catch (err: any) {
      console.error(err);
      if (err?.code === "auth/unauthorized-domain") {
        setErrorMsg(`Domínio '${window.location.hostname}' não está autorizado no Firebase Console. Você pode utilizar o Acesso de Demonstração ou entrar com seu e-mail do Google abaixo.`);
      } else {
        setErrorMsg("Erro ao entrar com Google: " + (err.message || "Tente novamente."));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-lg bg-white dark:bg-[#1E1E1E] rounded-3xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* Top Header */}
        <div className="p-6 bg-gradient-to-r from-[#00843D] to-[#006830] text-white flex items-center justify-between shrink-0">
          <div>
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[11px] font-bold">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Autenticação Unificada • IFPR Campus Ivaiporã</span>
            </div>
            <h2 className="text-xl font-black mt-1">
              {mode === "login" ? "Acessar sua Conta" : "Cadastrar Novo Usuário"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/20 transition-colors text-white/90 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 p-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setErrorMsg("");
            }}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center space-x-2 ${
              mode === "login"
                ? "bg-white dark:bg-[#1E1E1E] text-[#00843D] dark:text-green-400 shadow-xs"
                : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
            }`}
          >
            <LogIn className="w-4 h-4" />
            <span>Entrar (Login)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setErrorMsg("");
            }}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center space-x-2 ${
              mode === "register"
                ? "bg-white dark:bg-[#1E1E1E] text-[#00843D] dark:text-green-400 shadow-xs"
                : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Cadastrar-se</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {(currentUser.id !== "guest_visitor" || firebaseUser) && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                  Sessão Ativa ({currentUser.role})
                </p>
                <p className="text-xs font-bold text-neutral-900 dark:text-white">
                  {currentUser.name}
                </p>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  {currentUser.email}
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  onClose();
                }}
                className="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500 text-red-600 dark:text-red-400 hover:text-white text-xs font-bold transition-all border border-red-500/20 flex items-center gap-1"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sair</span>
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          {/* Quick Google Sign In */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleGoogleClick}
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 text-xs font-bold hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors flex items-center justify-center space-x-3 shadow-xs"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
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
              <span>Continuar com Google (Gmail Integrado)</span>
            </button>
            <p className="text-[10px] text-center text-neutral-500 dark:text-neutral-400">
              Permite autenticar e enviar notificações oficiais diretamente pelo seu Gmail.
            </p>
          </div>

          {/* Quick Demo Access Options */}
          <div className="p-3 bg-neutral-100 dark:bg-neutral-800/80 rounded-2xl border border-neutral-200 dark:border-neutral-700/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-300">
                ⚡ Acesso Rápido de Demonstração
              </span>
              <span className="text-[10px] text-[#00843D] dark:text-green-400 font-semibold">
                Sem necessidade de senha
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setLoginEmail("maria.oliveira@ifpr.edu.br");
                  setLoginPassword("servidor123");
                  useApp().switchUserRole("SERVIDOR");
                  onClose();
                }}
                className="p-2.5 rounded-xl bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 text-[11px] font-bold text-neutral-800 dark:text-neutral-100 hover:border-[#00843D] hover:text-[#00843D] transition-all text-left"
              >
                <div className="text-xs truncate font-bold">Maria Oliveira</div>
                <div className="text-[9px] text-neutral-500 dark:text-neutral-400 font-normal">Servidor SEBAC</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginEmail("lucas.santos@estudante.ifpr.edu.br");
                  setLoginPassword("aluno123");
                  useApp().switchUserRole("ALUNO");
                  onClose();
                }}
                className="p-2.5 rounded-xl bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 text-[11px] font-bold text-neutral-800 dark:text-neutral-100 hover:border-[#00843D] hover:text-[#00843D] transition-all text-left"
              >
                <div className="text-xs truncate font-bold">Lucas Santos</div>
                <div className="text-[9px] text-neutral-500 dark:text-neutral-400 font-normal">Aluno IFPR</div>
              </button>
            </div>
          </div>

          <div className="relative flex items-center justify-center my-2">
            <div className="border-t border-neutral-200 dark:border-neutral-800 w-full" />
            <span className="bg-white dark:bg-[#1E1E1E] px-3 text-[11px] font-bold text-neutral-400 uppercase tracking-wider absolute">
              ou login por e-mail e senha
            </span>
          </div>

          {mode === "login" ? (
            /* LOGIN FORM */
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  E-mail do IFPR / Estudante
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="exemplo@estudante.ifpr.edu.br"
                    required
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-[#00843D]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-[#00843D]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-[#00843D] hover:bg-[#006830] text-white font-bold text-xs shadow-md transition-all flex items-center justify-center space-x-2"
              >
                {loading ? "Entrando..." : "Entrar no Sistema"}
              </button>
            </form>
          ) : (
            /* REGISTER FORM */
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Nome Completo *
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
                  <input
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Ex: Lucas Silva Santos"
                    required
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-[#00843D]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    E-mail *
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
                    <input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="seu.nome@ifpr.edu.br"
                      required
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-[#00843D]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Senha *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
                    <input
                      type="password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      required
                      minLength={6}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-[#00843D]"
                    />
                  </div>
                </div>
              </div>

              {/* Vínculo Institucional / Role */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Vínculo no IFPR Campus Ivaiporã *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["ALUNO", "SERVIDOR", "ADMIN"] as UserRole[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRegRole(r)}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                        regRole === r
                          ? "bg-[#00843D] text-white border-[#00843D]"
                          : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700"
                      }`}
                    >
                      {r === "ALUNO" ? "Aluno" : r === "SERVIDOR" ? "Servidor" : "Secretaria/Admin"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Curso / Departamento
                </label>
                <div className="relative">
                  <GraduationCap className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
                  <input
                    type="text"
                    value={regCourseOrDept}
                    onChange={(e) => setRegCourseOrDept(e.target.value)}
                    placeholder="Ex: Técnico em Informática (3º Ano)"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-[#00843D]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Matrícula / Registro
                  </label>
                  <div className="relative">
                    <FileText className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
                    <input
                      type="text"
                      value={regMatricula}
                      onChange={(e) => setRegMatricula(e.target.value)}
                      placeholder="Ex: 2024109823"
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-[#00843D]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Telefone / WhatsApp
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
                    <input
                      type="text"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="(43) 99876-5432"
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-[#00843D]"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-[#00843D] hover:bg-[#006830] text-white font-bold text-xs shadow-md transition-all flex items-center justify-center space-x-2 mt-2"
              >
                {loading ? "Cadastrando..." : "Concluir Cadastro no Banco de Dados"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
