import React, { useState, useMemo, useRef } from "react";
import { useApp } from "../context/AppContext";
import { ItemCard } from "./ItemCard";
import { formatDateTime, vibrateClick, vibrateSuccess, formatPhone, isValidPhone } from "../lib/utils";
import { UserRole, BadgeTier } from "../types";
import { calculateUserReputation } from "../lib/reputationSystem";
import { formatAccountStatusDetails } from "../lib/accountStatusUtils";
import { compressImage } from "../lib/imageCompression";
import { getSafeAvatarUrl, handleAvatarError } from "../lib/avatarUtils";
import {
  Mail,
  ShieldCheck,
  PackageSearch,
  CheckCircle2,
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
  Search,
  Sun,
  Moon,
  ChevronDown,
  ChevronUp,
  AlertOctagon,
  Camera,
  Loader2,
} from "lucide-react";
import {
  SurfaceCard,
  SubtlePanel,
  UIButton,
  UIBadge,
  EmptyState,
  UIFieldGroup,
  UIInput,
} from "./ui";

export const ProfileView: React.FC = () => {
  const {
    currentUser,
    updateUserRole,
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
    darkMode,
    toggleDarkMode,
    t,
    cancelClaim,
  } = useApp();

  const [activeTab, setActiveTab] = useState<"my_items" | "claims">("my_items");
  const [isEditing, setIsEditing] = useState(false);
  const [isSubscribingFCM, setIsSubscribingFCM] = useState(false);
  const [cancellingClaimId, setCancellingClaimId] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit form state
  const [editName, setEditName] = useState(currentUser?.name || "");
  const [editCourse, setEditCourse] = useState(currentUser?.courseOrDept || "");
  const [editMatricula, setEditMatricula] = useState(currentUser?.registrationNumber || "");
  const [editPhone, setEditPhone] = useState(currentUser?.phone || "");

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (!validTypes.includes(file.type)) {
      addToast("Formato de imagem não suportado. Por favor, utilize JPG, PNG ou WebP.", "warning");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      addToast("A fotografia selecionada é muito grande. O tamanho máximo permitido é de 5 MB.", "warning");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      setIsUploadingPhoto(true);
      vibrateClick();

      // Compress photo for profile avatar (320x320, 85% quality, WebP)
      const compressed = await compressImage(file, {
        maxWidth: 320,
        maxHeight: 320,
        quality: 0.85,
        outputFormat: "image/webp",
      });

      const newAvatarUrl = compressed.base64;

      // Persist to Firestore and Firebase Auth
      await updateUserProfileData({
        ...currentUser,
        avatarUrl: newAvatarUrl,
      });

      vibrateSuccess();
      addToast("Foto de perfil atualizada e salva com sucesso!", "success");
    } catch (err: any) {
      console.error("Erro ao processar e salvar foto de perfil:", err);
      addToast("Não foi possível salvar a nova foto de perfil. Tente novamente.", "error");
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

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
    if (editPhone && !isValidPhone(editPhone)) {
      addToast("Telefone inválido. Informe o DDD e o número completo (ex: (43) 99876-5432).", "warning");
      return;
    }
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
  const [showBadges, setShowBadges] = useState(false);
  const reputation = useMemo(() => {
    return calculateUserReputation(currentUser, items);
  }, [currentUser, items]);

  // Helper for Tier Badge colors & icons
  const getTierDetails = (tier: BadgeTier) => {
    switch (tier) {
      case "DIAMANTE":
        return {
          bg: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
          cardBg: "from-cyan-500/10 via-sky-500/5 to-blue-500/10",
          iconColor: "text-cyan-500",
          accentColor: "#06B6D4",
        };
      case "OURO":
        return {
          bg: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
          cardBg: "from-amber-500/10 via-yellow-500/5 to-amber-600/10",
          iconColor: "text-amber-500",
          accentColor: "#F59E0B",
        };
      case "PRATA":
        return {
          bg: "bg-slate-400/20 text-slate-700 dark:text-slate-300 border-slate-400/40",
          cardBg: "from-slate-400/10 to-slate-600/10",
          iconColor: "text-slate-400",
          accentColor: "#94A3B8",
        };
      case "BRONZE":
      default:
        return {
          bg: "bg-amber-700/15 text-amber-800 dark:text-amber-400 border-amber-700/30",
          cardBg: "from-amber-700/10 to-amber-900/5",
          iconColor: "text-amber-700",
          accentColor: "#B45309",
        };
    }
  };

  const currentTierDetails = getTierDetails(reputation.levelTier);

  return (
    <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8 pb-16 animate-in fade-in duration-300">
      {/* Profile Header Card */}
      <SurfaceCard className="p-6 sm:p-8 flex flex-col md:flex-row items-center md:items-start gap-5 md:gap-6">
        {/* Avatar with Camera Trigger & Fallback */}
        <div className="relative group shrink-0">
          <img
            src={getSafeAvatarUrl(currentUser.avatarUrl, currentUser.name)}
            alt={currentUser.name}
            referrerPolicy="no-referrer"
            onError={(e) => handleAvatarError(e, currentUser.name)}
            className="w-24 h-24 rounded-2xl object-cover border-3 border-[#16845B] shadow-sm transition-transform group-hover:scale-105"
          />
          <span className="absolute -bottom-2 -right-2 px-2.5 py-0.5 rounded-lg bg-[#16845B] text-white text-[10px] font-bold uppercase tracking-wide border-2 border-white dark:border-[#111827] z-10">
            {currentUser.role}
          </span>

          {/* Hidden File Input for Avatar */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/jpg"
            onChange={handlePhotoUpload}
            className="hidden"
            id="profile-avatar-file-input"
            disabled={isUploadingPhoto}
          />

          {/* Camera Button Overlay */}
          <label
            htmlFor="profile-avatar-file-input"
            className={`absolute inset-0 rounded-2xl bg-slate-950/60 text-white flex flex-col items-center justify-center cursor-pointer transition-all duration-200 ${
              isUploadingPhoto ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
            title="Clique para alterar sua foto de perfil"
          >
            {isUploadingPhoto ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin text-white mb-1" />
                <span className="text-[9px] font-bold text-center uppercase tracking-tight">Salvando...</span>
              </>
            ) : (
              <>
                <Camera className="w-6 h-6 text-white mb-1 drop-shadow-sm" />
                <span className="text-[10px] font-bold text-center uppercase tracking-tight">Alterar</span>
              </>
            )}
          </label>
        </div>

        {/* User Details */}
        <div className="flex-1 w-full text-center md:text-left space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-[#172B2A] dark:text-white tracking-tight">
                {currentUser.name}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {currentUser.courseOrDept}
              </p>
            </div>

            {/* Role switch prompt, Google Login & Edit */}
            <div className="flex flex-wrap items-center gap-2 justify-center md:justify-end">
              <UIButton
                variant="secondary"
                size="sm"
                onClick={() => setIsEditing(!isEditing)}
              >
                <Edit className="w-3.5 h-3.5" />
                <span>{isEditing ? "Cancelar" : "Editar Perfil"}</span>
              </UIButton>

              {(currentUser.id !== "guest_visitor" || firebaseUser) ? (
                <UIButton
                  variant="danger"
                  size="sm"
                  onClick={logout}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sair da Conta</span>
                </UIButton>
              ) : (
                <UIButton
                  variant="primary"
                  size="sm"
                  onClick={() => setAuthModalOpen(true)}
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Login / Cadastro</span>
                </UIButton>
              )}

              {currentUser.role === "ADMIN" ? (
                <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#EBF5F0] dark:bg-[#16845B]/15 border border-[#16845B]/25 text-xs font-semibold text-[#16845B] dark:text-emerald-400">
                  <Shield className="w-3.5 h-3.5 text-[#16845B] dark:text-emerald-400" />
                  <span>Função:</span>
                  <select
                    value={currentUser.role}
                    onChange={(e) => updateUserRole(currentUser.id, e.target.value as UserRole)}
                    className="bg-transparent text-xs font-bold text-[#172B2A] dark:text-white outline-none cursor-pointer"
                  >
                    <option value="ALUNO" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">ALUNO</option>
                    <option value="SERVIDOR" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">SERVIDOR</option>
                    <option value="ADMIN" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">ADMIN</option>
                    <option value="INTRUSO" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Usuário externo</option>
                  </select>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => addToast("Sua função é definida e alterada apenas pelo Administrador do IFPR.", "info")}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  title="Somente Administradores do IFPR podem alterar perfis e permissões"
                >
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Função: {currentUser.role === "INTRUSO" ? "Usuário externo" : currentUser.role}</span>
                </button>
              )}

              {/* Account Status Badge */}
              {(() => {
                const statusInfo = formatAccountStatusDetails(currentUser);
                return (
                  <div
                    className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${statusInfo.badgeClass}`}
                    title={statusInfo.description}
                  >
                    <span className={`w-2 h-2 rounded-full ${statusInfo.dotClass}`} />
                    <span>Conta: {statusInfo.label}</span>
                  </div>
                );
              })()}
            </div>
          </div>

          {!isEditing ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 text-xs text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-center md:justify-start space-x-2">
                <Mail className="w-4 h-4 text-[#16845B] shrink-0" />
                <span className="truncate">{currentUser.email}</span>
              </div>
              <div className="flex items-center justify-center md:justify-start space-x-2">
                <IdCard className="w-4 h-4 text-[#16845B] shrink-0" />
                <span>Matrícula: {currentUser.registrationNumber}</span>
              </div>
              <div className="flex items-center justify-center md:justify-start space-x-2">
                <Phone className="w-4 h-4 text-[#16845B] shrink-0" />
                <span>{currentUser.phone ? formatPhone(currentUser.phone) : "Telefone não informado"}</span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveProfile} className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3 text-left">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <UIFieldGroup label="Nome Completo" required>
                  <UIInput
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                </UIFieldGroup>
                <UIFieldGroup label="Curso / Departamento">
                  <UIInput
                    type="text"
                    value={editCourse}
                    onChange={(e) => setEditCourse(e.target.value)}
                  />
                </UIFieldGroup>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <UIFieldGroup label="Matrícula / Registro">
                  <UIInput
                    type="text"
                    value={editMatricula}
                    onChange={(e) => setEditMatricula(e.target.value)}
                  />
                </UIFieldGroup>
                <UIFieldGroup label="Telefone / WhatsApp">
                  <UIInput
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(formatPhone(e.target.value))}
                    placeholder="(43) 99876-5432"
                    maxLength={15}
                  />
                </UIFieldGroup>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <UIButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={isUploadingPhoto}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploadingPhoto ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Camera className="w-3.5 h-3.5 text-[#16845B]" />
                  )}
                  <span>{isUploadingPhoto ? "Salvando foto..." : "Alterar Foto de Perfil"}</span>
                </UIButton>

                <div className="flex justify-end space-x-2">
                  <UIButton type="submit" variant="primary" size="sm">
                    Salvar Alterações no Banco de Dados
                  </UIButton>
                </div>
              </div>
            </form>
          )}
        </div>
      </SurfaceCard>

      {/* REPUTATION & BADGES SYSTEM (GAMIFICAÇÃO DE CIDADANIA) */}
      <SurfaceCard className={`p-6 sm:p-8 bg-gradient-to-br ${currentTierDetails.cardBg} space-y-6`}>
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
                <h2 className="text-xl sm:text-2xl font-bold text-[#172B2A] dark:text-white tracking-tight">
                  {reputation.levelTitle}
                </h2>
                <span className={`px-3 py-0.5 rounded-lg text-xs font-bold uppercase tracking-wider border ${currentTierDetails.bg}`}>
                  Nível {reputation.level} • {reputation.levelTier}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 max-w-xl">
                Reconhecimento comunitário por devolver pertences encontrados e fortalecer a honestidade no IFPR Campus Ivaiporã.
              </p>
            </div>
          </div>

          {/* Quick Metrics Pillar */}
          <div className="grid grid-cols-3 gap-2.5 w-full lg:w-auto shrink-0">
            <div className="p-3.5 rounded-xl bg-white/90 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 text-center">
              <span className="text-xl sm:text-2xl font-bold text-[#16845B] dark:text-emerald-400 block tabular-nums">
                {reputation.totalPoints}
              </span>
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-tight">
                Pontos
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-white/90 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 text-center">
              <span className="text-xl sm:text-2xl font-bold text-sky-600 dark:text-sky-400 block tabular-nums">
                {reputation.itemsReturnedCount}
              </span>
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-tight">
                Devoluções
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-white/90 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 text-center">
              <span className="text-xl sm:text-2xl font-bold text-[#064E3B] dark:text-emerald-300 block tabular-nums">
                {reputation.badges.filter((b) => b.unlocked).length}/{reputation.badges.length}
              </span>
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-tight">
                Medalhas
              </span>
            </div>
          </div>
        </div>

        {/* Level Progression Bar */}
        <div className="space-y-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Progresso para a Próxima Categoria ({reputation.progressToNextLevel}%)</span>
            </span>
            <span className="text-[#16845B] dark:text-emerald-400 font-bold">
              {reputation.totalPoints} / {reputation.nextLevelPoints} pts
            </span>
          </div>

          <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#16845B] via-emerald-500 to-[#064E3B] transition-all duration-700"
              style={{ width: `${reputation.progressToNextLevel}%` }}
            />
          </div>
        </div>

        {/* BADGES GALLERY GRID (COLLAPSIBLE / DEFAULT HIDDEN TO KEEP INTERFACE CLEAN) */}
        <div className="space-y-3 pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setShowBadges((prev) => !prev);
              }}
              className="flex items-center gap-2 font-bold text-xs sm:text-sm text-[#172B2A] dark:text-white uppercase tracking-wider hover:text-[#16845B] transition-colors cursor-pointer"
            >
              <Award className="w-4 h-4 text-[#16845B]" />
              <span>Galeria de Medalhas e Conquistas ({reputation.badges.filter((b) => b.unlocked).length}/{reputation.badges.length})</span>
              {showBadges ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
            </button>

            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setShowBadges((prev) => !prev);
              }}
              className="text-[11px] font-semibold text-[#16845B] dark:text-emerald-400 hover:underline cursor-pointer"
            >
              {showBadges ? "Ocultar Galeria" : "Exibir Galeria"}
            </button>
          </div>

          {showBadges && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-in fade-in duration-200">
              {reputation.badges.map((badge) => {
                const tierInfo = getTierDetails(badge.tier);
                const isUnlocked = badge.unlocked;

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
                        ? "bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 shadow-xs hover:border-[#16845B]/50"
                        : "bg-slate-50/70 dark:bg-slate-900/50 border-dashed border-slate-200 dark:border-slate-800 opacity-75"
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className={`p-2.5 rounded-xl border ${
                            isUnlocked
                              ? tierInfo.bg
                              : "bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          {renderBadgeIcon()}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${tierInfo.bg}`}>
                            {badge.tier}
                          </span>
                          {isUnlocked && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#EBF5F0] text-[#16845B] dark:bg-emerald-950/60 dark:text-emerald-400 border border-[#16845B]/20">
                              +{badge.pointsReward} pts
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <h4 className="font-bold text-sm text-[#172B2A] dark:text-white flex items-center gap-1.5">
                          <span>{badge.name}</span>
                          {isUnlocked && <CheckCircle2 className="w-3.5 h-3.5 text-[#16845B] shrink-0" />}
                        </h4>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-snug">
                          {badge.description}
                        </p>
                      </div>
                    </div>

                    {/* Badge Progress Tracker */}
                    <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-semibold">
                        <span className="text-slate-500">{badge.requirementText}</span>
                        <span className={isUnlocked ? "text-[#16845B] dark:text-emerald-400" : "text-slate-400"}>
                          {badge.currentCount}/{badge.targetCount}
                        </span>
                      </div>

                      <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isUnlocked
                              ? "bg-[#16845B]"
                              : "bg-slate-400 dark:bg-slate-600"
                          }`}
                          style={{ width: `${badge.progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SurfaceCard>

      {/* FCM Cloud Messaging Push Notifications Card */}
      <SurfaceCard id="fcm-notification-subscription-card" className="p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div
              className={`p-3 rounded-xl border shrink-0 ${
                fcmSubscribed
                  ? "bg-[#EBF5F0] text-[#16845B] dark:bg-emerald-950/60 dark:text-emerald-400 border-[#16845B]/20"
                  : "bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400 border-sky-200 dark:border-sky-800"
              }`}
            >
              {fcmSubscribed ? (
                <BellRing className="w-6 h-6 animate-pulse" />
              ) : (
                <Bell className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-base text-[#172B2A] dark:text-white">
                  {t("fcmTitle", "Notificações Push do Sistema (FCM)")}
                </h3>
                <UIBadge tone={fcmSubscribed ? "emerald" : "amber"}>
                  {fcmSubscribed
                    ? t("fcmSubscribed", "Ativo no Dispositivo")
                    : t("fcmUnsubscribed", "Não Inscrito")}
                </UIBadge>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 max-w-xl leading-relaxed">
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
                type="button"
                onClick={handleSubscribeFCM}
                disabled={isSubscribingFCM}
                className="px-4 py-2.5 rounded-xl bg-[#16845B] hover:bg-[#064E3B] text-white font-semibold text-xs flex items-center justify-center space-x-2 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
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
                  type="button"
                  onClick={handleTestFCM}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[#172B2A] dark:text-slate-200 font-semibold text-xs flex items-center space-x-1.5 transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 text-[#16845B]" />
                  <span>{t("fcmTestBtn", "Testar Alerta Push")}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSubscribeFCM}
                  disabled={isSubscribingFCM}
                  className="px-3 py-2 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/40 text-[#16845B] dark:text-emerald-400 font-semibold text-xs flex items-center space-x-1 border border-[#16845B]/20 hover:bg-emerald-100/70 cursor-pointer"
                  title="Atualizar Token FCM"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{t("fcmConfigured", "Configurado")}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </SurfaceCard>

      {/* TEMA DA INTERFACE (SELETOR CLARO / ESCURO) */}
      <SurfaceCard className="p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div
              className={`p-3 rounded-xl border ${
                darkMode
                  ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                  : "bg-amber-500/10 text-amber-600 border-amber-500/20"
              }`}
            >
              {darkMode ? <Moon className="w-6 h-6" /> : <Sun className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="font-bold text-base text-[#172B2A] dark:text-white">
                Aparência &amp; Tema Visual
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 max-w-xl">
                Escolha entre o modo claro institucional ou o modo escuro de alto contraste para maior conforto visual.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                if (darkMode) {
                  vibrateClick();
                  toggleDarkMode();
                }
              }}
              className={`flex-1 sm:flex-initial flex items-center justify-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                !darkMode
                  ? "bg-white text-[#172B2A] shadow-xs border border-slate-200/80"
                  : "text-slate-500 hover:text-[#172B2A] dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <Sun className="w-4 h-4 text-amber-500" />
              <span>Modo Claro</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!darkMode) {
                  vibrateClick();
                  toggleDarkMode();
                }
              }}
              className={`flex-1 sm:flex-initial flex items-center justify-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                darkMode
                  ? "bg-[#111827] text-white shadow-xs border border-slate-700"
                  : "text-slate-500 hover:text-[#172B2A] dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <Moon className="w-4 h-4 text-indigo-400" />
              <span>Modo Escuro</span>
            </button>
          </div>
        </div>
      </SurfaceCard>

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("my_items")}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-2 transition-all cursor-pointer ${
            activeTab === "my_items"
              ? "bg-[#16845B] text-white shadow-xs"
              : "bg-white dark:bg-[#111827] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-[#16845B]/40"
          }`}
        >
          <PackageSearch className="w-4 h-4" />
          <span>Meus Cadastros ({userItems.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("claims")}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-2 transition-all cursor-pointer ${
            activeTab === "claims"
              ? "bg-[#16845B] text-white shadow-xs"
              : "bg-white dark:bg-[#111827] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-[#16845B]/40"
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
            <EmptyState
              icon={<PackageSearch className="w-7 h-7" />}
              title="Nenhum objeto cadastrado por você ainda."
              description="Caso tenha encontrado ou registrado um pertence na custódia do campus, ele aparecerá listado aqui."
            />
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
            <EmptyState
              icon={<ShieldCheck className="w-7 h-7" />}
              title="Nenhuma solicitação de devolução efetuada."
              description="Ao solicitar a posse de um objeto encontrado no catálogo, o histórico ficará listado aqui."
            />
          ) : (
            <div className="space-y-4">
              {userClaims.map((claim) => {
                const relatedItem = items.find((it) => it.id === claim.itemId);
                const isPending = claim.status === "PENDENTE";
                const isApproved = claim.status === "APROVADO";
                const isRejected = claim.status === "REJEITADO";

                return (
                  <SurfaceCard
                    key={claim.id}
                    className="p-5 space-y-3 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div>
                        <div className="flex items-center space-x-2 flex-wrap">
                          <span className="font-bold text-base text-[#172B2A] dark:text-white">
                            {claim.itemTitle || relatedItem?.title || "Objeto"}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            #{claim.itemId}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          Solicitado em: {formatDateTime(claim.createdAt)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <UIBadge
                          tone={
                            claim.status === "PENDENTE"
                              ? "amber"
                              : claim.status === "APROVADO"
                              ? "emerald"
                              : claim.status === "REJEITADO"
                              ? "rose"
                              : claim.status === "CONCLUIDO"
                              ? "blue"
                              : "slate"
                          }
                        >
                          {claim.status === "PENDENTE"
                            ? "Em Análise"
                            : claim.status === "APROVADO"
                            ? "Aprovado"
                            : claim.status === "REJEITADO"
                            ? "Rejeitado"
                            : claim.status === "CONCLUIDO"
                            ? "Concluído"
                            : "Cancelado"}
                        </UIBadge>
                      </div>
                    </div>

                    {/* Declared Features */}
                    <div className="space-y-1 text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-300 block">
                        Características particulares informadas (RNF04):
                      </span>
                      <SubtlePanel className="p-3">
                        <p className="text-[#172B2A] dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                          {claim.distinctiveFeatures || claim.verificationAnswer || "Sem características descritas."}
                        </p>
                      </SubtlePanel>
                      {claim.additionalInfo && (
                        <p className="text-[11px] text-slate-500 italic mt-1">
                          Informações adicionais: {claim.additionalInfo}
                        </p>
                      )}
                    </div>

                    {/* Approved Notice */}
                    {isApproved && (
                      <div className="p-3.5 bg-[#EBF5F0] dark:bg-emerald-950/40 border border-[#16845B]/25 rounded-xl text-xs text-[#064E3B] dark:text-emerald-200 space-y-1">
                        <div className="flex items-center gap-2 font-bold text-[#16845B] dark:text-emerald-300">
                          <ShieldCheck className="w-4 h-4 shrink-0" />
                          <span>Pedido Aprovado pela Secretaria!</span>
                        </div>
                        <p className="text-[11px] leading-relaxed">
                          Sua solicitação de posse foi aceita. Compareça à Secretaria / SEBAC portando um documento oficial com foto para realizar a retirada física do pertence.
                        </p>
                      </div>
                    )}

                    {/* Rejected Notice */}
                    {isRejected && claim.rejectionReason && (
                      <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-xl text-xs text-rose-900 dark:text-rose-200 space-y-1">
                        <div className="flex items-center gap-2 font-bold text-rose-700 dark:text-rose-400">
                          <AlertOctagon className="w-4 h-4 shrink-0" />
                          <span>Solicitação Não Aprovada</span>
                        </div>
                        <p className="text-[11px] leading-relaxed">
                          Motivo informado: <strong>{claim.rejectionReason}</strong>
                        </p>
                      </div>
                    )}

                    {/* Bottom Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 flex-wrap gap-2">
                      {relatedItem ? (
                        <button
                          type="button"
                          onClick={() => {
                            vibrateClick();
                            setSelectedItemForDetail(relatedItem);
                          }}
                          className="text-xs font-semibold text-[#16845B] hover:text-[#064E3B] dark:text-emerald-400 hover:underline cursor-pointer"
                        >
                          Ver Detalhes do Objeto
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400">ID #{claim.itemId}</span>
                      )}

                      {isPending && (
                        <button
                          type="button"
                          disabled={cancellingClaimId === claim.id}
                          onClick={async () => {
                            if (!window.confirm("Deseja realmente cancelar esta solicitação de devolução?")) {
                              return;
                            }
                            vibrateClick();
                            try {
                              setCancellingClaimId(claim.id);
                              await cancelClaim(claim.id);
                              vibrateSuccess();
                              addToast("Solicitação de devolução cancelada com sucesso.", "info");
                            } catch (e: any) {
                              addToast(e?.message || "Erro ao cancelar solicitação.", "error");
                            } finally {
                              setCancellingClaimId(null);
                            }
                          }}
                          className="px-3.5 py-1.5 rounded-xl border border-rose-200 dark:border-rose-800/70 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {cancellingClaimId === claim.id ? "Cancelando..." : "Cancelar Solicitação"}
                        </button>
                      )}
                    </div>
                  </SurfaceCard>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProfileView;
