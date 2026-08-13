import React, { useState, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { ItemCard } from "./ItemCard";
import { formatDate, formatDateTime, vibrateClick } from "../lib/utils";
import { UserRole, BadgeTier } from "../types";
import { calculateUserReputation } from "../lib/reputationSystem";
import {
  User as UserIcon,
  GraduationCap,
  Mail,
  Building2,
  ShieldCheck,
  PackageSearch,
  CheckCircle2,
  Clock,
  IdCard,
  Edit,
  Phone,
  Lock,
  Shield,
  LogOut,
  Award,
  Crown,
  Medal,
  Sparkles,
  Trophy,
  HeartHandshake,
  Bell,
  BellRing,
  Send,
  Radio,
  CheckCircle,
  Search,
  Flame,
  Star,
  Info,
} from "lucide-react";

export const ProfileView: React.FC = () => {
  const {
    currentUser,
    updateUserRole,
    loginWithGoogle,
    logout,
    firebaseUser,
    items,
    claims,
    setSelectedItemForDetail,
    addToast,
    updateUserProfileData,
    setAuthModalOpen,
    fcmSubscribed,
    subscribeToFCM,
    testFCMAlert,
    t,
    language,
  } = useApp();

  const [activeTab, setActiveTab] = useState<"my_items" | "claims">("my_items");
  const [isEditing, setIsEditing] = useState(false);
  const [isSubscribingFCM, setIsSubscribingFCM] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState(currentUser.name);
  const [editCourse, setEditCourse] = useState(currentUser.courseOrDept);
  const [editMatricula, setEditMatricula] = useState(currentUser.registrationNumber);
  const [editPhone, setEditPhone] = useState(currentUser.phone || "");

  const handleSubscribeFCM = async () => {
    vibrateClick();
    setIsSubscribingFCM(true);
    await subscribeToFCM();
    setIsSubscribingFCM(false);
  };

  const handleTestFCM = async () => {
    vibrateClick();
    await testFCMAlert();
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateUserProfileData({
      ...currentUser,
      name: editName,
      courseOrDept: editCourse,
      registrationNumber: editMatricula,
      phone: editPhone,
    });
    setIsEditing(false);
  };

  // User registered items
  const userItems = items.filter((it) => it.registeredByUserId === currentUser.id);

  // User claims
  const userClaims = claims.filter((c) => c.claimerId === currentUser.id);

  // Calculate user reputation and badge system
  const reputation = useMemo(() => {
    return calculateUserReputation(currentUser, items);
  }, [currentUser, items]);

  // Helper for Tier Badge colors & icons
  const getTierDetails = (tier: BadgeTier) => {
    switch (tier) {
      case "DIAMANTE":
        return {
          bg: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
          cardBg: "from-cyan-500/15 via-sky-500/10 to-blue-500/15",
          iconColor: "text-cyan-400",
          accentColor: "#06B6D4",
        };
      case "OURO":
        return {
          bg: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
          cardBg: "from-amber-500/15 via-yellow-500/10 to-amber-600/15",
          iconColor: "text-amber-500",
          accentColor: "#F59E0B",
        };
      case "PRATA":
        return {
          bg: "bg-slate-400/20 text-slate-700 dark:text-slate-300 border-slate-400/40",
          cardBg: "from-slate-400/15 to-slate-600/15",
          iconColor: "text-slate-400",
          accentColor: "#94A3B8",
        };
      case "BRONZE":
      default:
        return {
          bg: "bg-amber-700/15 text-amber-800 dark:text-amber-400 border-amber-700/30",
          cardBg: "from-amber-700/10 to-amber-900/10",
          iconColor: "text-amber-700",
          accentColor: "#B45309",
        };
    }
  };

  const currentTierDetails = getTierDetails(reputation.levelTier);

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16">
      {/* Profile Header Card */}
      <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 sm:p-8 border border-neutral-200 dark:border-neutral-800 shadow-sm flex flex-col md:flex-row items-center md:items-start space-y-4 md:space-y-0 md:space-x-6">
        {/* Avatar */}
        <div className="relative">
          <img
            src={currentUser.avatarUrl}
            alt={currentUser.name}
            className="w-24 h-24 rounded-2xl object-cover border-4 border-[#00843D] shadow-md"
          />
          <span className="absolute -bottom-2 -right-2 px-2.5 py-0.5 rounded-full bg-[#00843D] text-white text-[10px] font-bold uppercase tracking-wide border-2 border-white dark:border-[#1E1E1E]">
            {currentUser.role}
          </span>
        </div>

        {/* User Details */}
        <div className="flex-1 text-center md:text-left space-y-2">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
                {currentUser.name}
              </h1>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {currentUser.courseOrDept}
              </p>
            </div>

            {/* Role switch prompt, Google Login & Edit */}
            <div className="flex flex-wrap items-center gap-2 justify-center md:justify-end">
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="px-3 py-1.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-xs font-bold hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors flex items-center gap-1"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>{isEditing ? "Cancelar" : "Editar Perfil"}</span>
              </button>

              {(currentUser.id !== "guest_visitor" || firebaseUser) ? (
                <button
                  onClick={logout}
                  className="px-3.5 py-1.5 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-500 hover:text-white transition-colors flex items-center gap-1.5 border border-red-500/20"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sair da Conta</span>
                </button>
              ) : (
                <button
                  onClick={() => setAuthModalOpen(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-[#00843D] text-white text-xs font-bold hover:bg-[#006830] transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Login / Cadastro</span>
                </button>
              )}
              {currentUser.role === "ADMIN" ? (
                <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-green-50 dark:bg-green-950/40 border border-[#00843D]/30 text-xs font-bold text-[#00843D] dark:text-green-400">
                  <Shield className="w-3.5 h-3.5 text-[#00843D]" />
                  <span>Função:</span>
                  <select
                    value={currentUser.role}
                    onChange={(e) => updateUserRole(currentUser.id, e.target.value as UserRole)}
                    className="bg-transparent text-xs font-bold text-neutral-900 dark:text-white outline-none cursor-pointer"
                  >
                    <option value="ALUNO" className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white">ALUNO</option>
                    <option value="SERVIDOR" className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white">SERVIDOR</option>
                    <option value="ADMIN" className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white">ADMIN</option>
                  </select>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => addToast("Sua função é definida e alterada apenas pelo Administrador do IFPR.", "info")}
                  className="px-3 py-1.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-xs font-bold text-neutral-600 dark:text-neutral-300 flex items-center gap-1.5 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                  title="Somente Administradores do IFPR podem alterar perfis e permissões"
                >
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Função: {currentUser.role}</span>
                </button>
              )}
            </div>
          </div>

          {!isEditing ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 text-xs text-neutral-600 dark:text-neutral-300 border-t border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center justify-center md:justify-start space-x-2">
                <Mail className="w-4 h-4 text-[#00843D]" />
                <span className="truncate">{currentUser.email}</span>
              </div>
              <div className="flex items-center justify-center md:justify-start space-x-2">
                <IdCard className="w-4 h-4 text-[#00843D]" />
                <span>Matrícula: {currentUser.registrationNumber}</span>
              </div>
              <div className="flex items-center justify-center md:justify-start space-x-2">
                <Phone className="w-4 h-4 text-[#00843D]" />
                <span>{currentUser.phone || "(43) 99999-0000"}</span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveProfile} className="pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 dark:text-neutral-400 mb-1">
                    Nome Completo
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 outline-none focus:ring-2 focus:ring-[#00843D]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 dark:text-neutral-400 mb-1">
                    Curso / Departamento
                  </label>
                  <input
                    type="text"
                    value={editCourse}
                    onChange={(e) => setEditCourse(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 outline-none focus:ring-2 focus:ring-[#00843D]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 dark:text-neutral-400 mb-1">
                    Matrícula / Registro
                  </label>
                  <input
                    type="text"
                    value={editMatricula}
                    onChange={(e) => setEditMatricula(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 outline-none focus:ring-2 focus:ring-[#00843D]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 dark:text-neutral-400 mb-1">
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 outline-none focus:ring-2 focus:ring-[#00843D]"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-1">
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#00843D] text-white font-bold text-xs rounded-xl hover:bg-[#006830] transition-colors"
                >
                  Salvar Alterações no Banco de Dados
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* REPUTATION & BADGES SYSTEM (GAMIFICAÇÃO DE CIDADANIA) */}
      <div className={`p-6 sm:p-8 rounded-3xl bg-gradient-to-br ${currentTierDetails.cardBg} bg-white dark:bg-[#1E1E1E] border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-6`}>
        {/* Main Status & Level Header */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-center space-x-4">
            <div className={`p-4 rounded-2xl border ${currentTierDetails.bg} shrink-0 shadow-xs`}>
              {reputation.levelTier === "DIAMANTE" ? (
                <Crown className="w-8 h-8 text-cyan-500 animate-pulse" />
              ) : reputation.levelTier === "OURO" ? (
                <Trophy className="w-8 h-8 text-amber-500" />
              ) : reputation.levelTier === "PRATA" ? (
                <Award className="w-8 h-8 text-slate-400" />
              ) : (
                <Medal className="w-8 h-8 text-amber-700" />
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black text-neutral-900 dark:text-white">
                  {reputation.levelTitle}
                </h2>
                <span className={`px-3 py-0.5 rounded-full text-xs font-black uppercase tracking-wider border ${currentTierDetails.bg}`}>
                  Nível {reputation.level} • {reputation.levelTier}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 mt-1 max-w-xl">
                Reconhecimento comunitário por devolver pertences encontrados e fortalecer a honestidade no IFPR Campus Ivaiporã.
              </p>
            </div>
          </div>

          {/* Quick Metrics Pillar */}
          <div className="grid grid-cols-3 gap-2 w-full lg:w-auto shrink-0">
            <div className="p-3 rounded-2xl bg-white/80 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-neutral-800 text-center">
              <span className="text-xl sm:text-2xl font-black text-[#00843D] dark:text-green-400 block">
                {reputation.totalPoints}
              </span>
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-tight">
                Pontos
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-white/80 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-neutral-800 text-center">
              <span className="text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400 block">
                {reputation.itemsReturnedCount}
              </span>
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-tight">
                Devoluções
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-white/80 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-neutral-800 text-center">
              <span className="text-xl sm:text-2xl font-black text-purple-600 dark:text-purple-400 block">
                {reputation.badges.filter((b) => b.unlocked).length}/{reputation.badges.length}
              </span>
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-tight">
                Medalhas
              </span>
            </div>
          </div>
        </div>

        {/* Level Progression Bar */}
        <div className="space-y-2 pt-2 border-t border-neutral-200/60 dark:border-neutral-800/60">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Progresso para a Próxima Categoria ({reputation.progressToNextLevel}%)</span>
            </span>
            <span className="text-[#00843D] dark:text-green-400 font-extrabold">
              {reputation.totalPoints} / {reputation.nextLevelPoints} pts
            </span>
          </div>

          <div className="w-full h-3 rounded-full bg-neutral-200 dark:bg-neutral-800/90 overflow-hidden p-0.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#00843D] via-emerald-400 to-amber-400 transition-all duration-700"
              style={{ width: `${reputation.progressToNextLevel}%` }}
            />
          </div>
        </div>

        {/* BADGES GALLERY GRID */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-neutral-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Award className="w-4 h-4 text-[#00843D]" />
              <span>Galeria de Medalhas e Conquistas de Cidadania</span>
            </h3>
            <span className="text-[11px] text-neutral-500 font-bold">
              Desbloqueie realizando ações no sistema
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {reputation.badges.map((badge) => {
              const tierInfo = getTierDetails(badge.tier);
              const isUnlocked = badge.unlocked;

              // Render dynamic icon
              const renderBadgeIcon = () => {
                switch (badge.iconName) {
                  case "HeartHandshake":
                    return <HeartHandshake className="w-5 h-5" />;
                  case "ShieldCheck":
                    return <ShieldCheck className="w-5 h-5" />;
                  case "Award":
                    return <Award className="w-5 h-5" />;
                  case "Crown":
                    return <Crown className="w-5 h-5" />;
                  case "Search":
                    return <Search className="w-5 h-5" />;
                  case "Sparkles":
                  default:
                    return <Sparkles className="w-5 h-5" />;
                }
              };

              return (
                <div
                  key={badge.id}
                  className={`p-4 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between ${
                    isUnlocked
                      ? "bg-white dark:bg-neutral-800/90 border-neutral-300 dark:border-neutral-700 shadow-xs hover:border-[#00843D]/50"
                      : "bg-neutral-50/70 dark:bg-neutral-900/50 border-dashed border-neutral-300 dark:border-neutral-800 opacity-75"
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className={`p-2.5 rounded-xl border ${
                          isUnlocked
                            ? tierInfo.bg
                            : "bg-neutral-200 dark:bg-neutral-800 text-neutral-400 border-neutral-300 dark:border-neutral-700"
                        }`}
                      >
                        {renderBadgeIcon()}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase border ${tierInfo.bg}`}>
                          {badge.tier}
                        </span>
                        {isUnlocked && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-500/10 text-[#00843D] dark:text-green-400 border border-emerald-500/20">
                            +{badge.pointsReward} pts
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-extrabold text-sm text-neutral-900 dark:text-white flex items-center gap-1.5">
                        <span>{badge.name}</span>
                        {isUnlocked && <CheckCircle2 className="w-3.5 h-3.5 text-[#00843D] shrink-0" />}
                      </h4>
                      <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-1 leading-snug">
                        {badge.description}
                      </p>
                    </div>
                  </div>

                  {/* Badge Progress Tracker */}
                  <div className="pt-3 mt-3 border-t border-neutral-100 dark:border-neutral-800/80 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold">
                      <span className="text-neutral-500">{badge.requirementText}</span>
                      <span className={isUnlocked ? "text-[#00843D] dark:text-green-400" : "text-neutral-400"}>
                        {badge.currentCount}/{badge.targetCount}
                      </span>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isUnlocked
                            ? "bg-[#00843D]"
                            : "bg-neutral-400 dark:bg-neutral-600"
                        }`}
                        style={{ width: `${badge.progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* FCM Cloud Messaging Push Notifications Card */}
      <div id="fcm-notification-subscription-card" className="p-6 rounded-3xl bg-white dark:bg-[#1E1E1E] border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className={`p-3 rounded-2xl border shrink-0 ${
              fcmSubscribed
                ? "bg-emerald-500/10 text-[#00843D] dark:text-green-400 border-emerald-500/20"
                : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
            }`}>
              {fcmSubscribed ? (
                <BellRing className="w-6 h-6 animate-pulse" />
              ) : (
                <Bell className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-extrabold text-base text-neutral-900 dark:text-white">
                  {t("fcmTitle", "Notificações Push do Sistema (FCM)")}
                </h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                    fcmSubscribed
                      ? "bg-emerald-500/10 text-[#00843D] dark:text-green-400 border-emerald-500/30"
                      : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
                  }`}
                >
                  {fcmSubscribed
                    ? t("fcmSubscribed", "Ativo no Dispositivo")
                    : t("fcmUnsubscribed", "Não Inscrito")}
                </span>
              </div>
              <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-1 max-w-xl">
                {t(
                  "fcmDescription",
                  "Receba alertas automáticos via Firebase Cloud Messaging no navegador ou celular quando um objeto que você registrou como perdido for encontrado ou devolvido no campus."
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            {!fcmSubscribed ? (
              <button
                id="btn-subscribe-fcm"
                onClick={handleSubscribeFCM}
                disabled={isSubscribingFCM}
                className="px-4 py-2.5 rounded-xl bg-[#00843D] hover:bg-[#006830] text-white font-bold text-xs flex items-center justify-center space-x-2 transition-all shadow-xs disabled:opacity-50"
              >
                <Radio className="w-4 h-4" />
                <span>
                  {isSubscribingFCM
                    ? t("fcmProcessing", "Solicitando Permissão...")
                    : t("subscribeNotifications", "Assinar Notificações")}
                </span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  id="btn-test-fcm"
                  onClick={handleTestFCM}
                  className="px-3.5 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-bold text-xs flex items-center space-x-1.5 transition-colors border border-neutral-200 dark:border-neutral-700"
                >
                  <Send className="w-3.5 h-3.5 text-[#00843D]" />
                  <span>{t("fcmTestBtn", "Testar Alerta Push")}</span>
                </button>

                <button
                  onClick={handleSubscribeFCM}
                  disabled={isSubscribingFCM}
                  className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-[#00843D] dark:text-green-400 font-bold text-xs flex items-center space-x-1 border border-emerald-500/20 hover:bg-emerald-100"
                  title="Atualizar Token FCM"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{t("fcmConfigured", "Configurado")}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-neutral-200 dark:border-neutral-800 pb-3">
        <button
          onClick={() => setActiveTab("my_items")}
          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center space-x-2 transition-all ${
            activeTab === "my_items"
              ? "bg-[#00843D] text-white shadow-xs"
              : "bg-white dark:bg-[#1E1E1E] text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800"
          }`}
        >
          <PackageSearch className="w-4 h-4" />
          <span>Meus Cadastros ({userItems.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("claims")}
          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center space-x-2 transition-all ${
            activeTab === "claims"
              ? "bg-[#00843D] text-white shadow-xs"
              : "bg-white dark:bg-[#1E1E1E] text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800"
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Minhas Solicitações ({userClaims.length})</span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "my_items" ? (
        <div className="space-y-4">
          {userItems.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-8 space-y-3">
              <PackageSearch className="w-12 h-12 text-neutral-300 dark:text-neutral-600 mx-auto" />
              <h3 className="font-bold text-base text-neutral-800 dark:text-white">
                Nenhum objeto cadastrado por você ainda.
              </h3>
              <p className="text-xs text-neutral-500">
                Caso tenha perdido ou encontrado um pertence no campus, faça o registro.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {userItems.map((item) => (
                <ItemCard key={item.id} item={item} onSelect={setSelectedItemForDetail} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {userClaims.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-8 space-y-3">
              <ShieldCheck className="w-12 h-12 text-neutral-300 dark:text-neutral-600 mx-auto" />
              <h3 className="font-bold text-base text-neutral-800 dark:text-white">
                Nenhuma solicitação de devolução efetuada.
              </h3>
              <p className="text-xs text-neutral-500">
                Ao solicitar a posse de um objeto encontrado, o histórico ficará listado aqui.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {userClaims.map((claim) => (
                <div
                  key={claim.id}
                  className="p-5 rounded-2xl bg-white dark:bg-[#1E1E1E] border border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-sm text-neutral-900 dark:text-white">
                        {claim.itemTitle}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                          claim.status === "PENDENTE"
                            ? "bg-amber-500/10 text-amber-600"
                            : "bg-green-500/10 text-green-600"
                        }`}
                      >
                        {claim.status}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500">
                      Sua comprovação: &quot;{claim.verificationAnswer}&quot;
                    </p>
                    <span className="text-[11px] text-neutral-400 block">
                      Solicitado em: {formatDateTime(claim.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
