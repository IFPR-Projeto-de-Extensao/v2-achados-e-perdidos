import React, { useState, useEffect, useRef } from "react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../context/RouterContext";
import { useRequireAuth } from "../hooks/useRequireAuth";
import { IFPR_LOCATIONS, IFPR_LOCATION_GROUPS, LEGACY_IFPR_LOCATIONS } from "../data/mockData";
import { ItemCategory, LostFoundItem, RegistrationStatus } from "../types";
import { normalizeCategory, CANONICAL_ITEM_CATEGORIES } from "../lib/categoryUtils";
import { getUploadTaskId } from "../lib/indexedDB";
import { auth } from "../lib/firebase";
import { isAccountBlocked, resolveAccountStatus } from "../lib/accountStatusUtils";
import {
  triggerVibration,
  vibrateClick,
  vibrateSuccess,
  vibrateCritical,
  getTodayDateString,
  formatPhone,
  isValidPhone,
  validateItemOccurrenceDate,
  validateItemTextFields,
  ITEM_FIELD_LIMITS,
} from "../lib/utils";
import { compressImage } from "../lib/imageCompression";
import {
  PlusCircle,
  CheckCircle2,
  PackageSearch,
  PackagePlus,
  Upload,
  Camera,
  Trash2,
  ArrowRight,
  ArrowLeft,
  X,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  Clock,
  Save,
  Lock,
  LogIn,
  MapPin,
  Calendar,
  Tag,
  Phone,
  Mail,
  FileText,
  Check,
  Sparkles,
  Loader2,
  Edit3,
  RotateCcw,
  Eye,
  Info,
  CameraOff,
  ChevronLeft,
} from "lucide-react";
import {
  BrandLogo,
  SurfaceCard,
  SubtlePanel,
  UIBadge,
  UIButton,
  UIFieldGroup,
  UIInput,
  UISelect,
  UITextarea,
} from "./ui";

export const getRegisterDraftKey = (uid?: string | null): string | null => {
  if (!uid || uid === "guest" || uid === "guest_visitor" || uid.trim() === "") return null;
  return `ifpr_achados_register_draft_${uid.trim()}`;
};

export const LEGACY_DRAFT_STORAGE_KEY = "ifpr_achados_register_draft";

export interface SanitizedRegisterDraft {
  currentStep: 1 | 2 | 3 | 4;
  type: "PERDIDO" | "ENCONTRADO";
  title: string;
  category: ItemCategory;
  description: string;
  color: string;
  brand: string;
  location: string;
  locationComplement: string;
  date: string;
  contactInfo: string;
  contactPhone: string;
  imageUrl?: string;
  savedAt?: string;
}

export const CATEGORIES_LIST: ItemCategory[] = [...CANONICAL_ITEM_CATEGORIES];

export function validateAndSanitizeDraft(
  draft: any,
  expectedUid: string
): { isValid: boolean; sanitized?: SanitizedRegisterDraft } {
  if (!draft || typeof draft !== "object") return { isValid: false };
  if (!expectedUid || typeof expectedUid !== "string" || expectedUid.trim() === "") return { isValid: false };
  if (!draft.savedByUid || typeof draft.savedByUid !== "string" || draft.savedByUid.trim() !== expectedUid.trim()) {
    return { isValid: false };
  }

  const hasContent = Boolean(
    (draft.title && typeof draft.title === "string" && draft.title.trim().length > 0) ||
    (draft.description && typeof draft.description === "string" && draft.description.trim().length > 0) ||
    (draft.color && typeof draft.color === "string" && draft.color.trim().length > 0) ||
    (draft.brand && typeof draft.brand === "string" && draft.brand.trim().length > 0) ||
    (draft.locationComplement && typeof draft.locationComplement === "string" && draft.locationComplement.trim().length > 0)
  );
  if (!hasContent) return { isValid: false };

  const validStep =
    typeof draft.currentStep === "number" && draft.currentStep >= 1 && draft.currentStep <= 4
      ? (draft.currentStep as 1 | 2 | 3 | 4)
      : 1;

  const validType: "PERDIDO" | "ENCONTRADO" =
    draft.type === "PERDIDO" || draft.type === "ENCONTRADO" ? draft.type : "ENCONTRADO";

  const normalizedDraftCat = normalizeCategory(draft.category);
  const validCategory: ItemCategory = CATEGORIES_LIST.includes(normalizedDraftCat)
    ? normalizedDraftCat
    : CATEGORIES_LIST[0];

  const validTitle = typeof draft.title === "string" ? draft.title.slice(0, ITEM_FIELD_LIMITS.TITLE) : "";
  const validDesc =
    typeof draft.description === "string" ? draft.description.slice(0, ITEM_FIELD_LIMITS.DESCRIPTION) : "";
  const validColor = typeof draft.color === "string" ? draft.color.slice(0, ITEM_FIELD_LIMITS.COLOR) : "";
  const validBrand = typeof draft.brand === "string" ? draft.brand.slice(0, ITEM_FIELD_LIMITS.BRAND) : "";

  const validLoc =
    typeof draft.location === "string" && (IFPR_LOCATIONS.includes(draft.location) || LEGACY_IFPR_LOCATIONS.includes(draft.location))
      ? draft.location
      : IFPR_LOCATIONS[0];

  const validLocComp =
    typeof draft.locationComplement === "string" ? draft.locationComplement.slice(0, 120) : "";

  let validDate = getTodayDateString();
  if (typeof draft.date === "string" && draft.date) {
    const dateCheck = validateItemOccurrenceDate(draft.date, "A data");
    if (dateCheck.isValid) {
      validDate = draft.date;
    }
  }

  const validContact =
    typeof draft.contactInfo === "string" ? draft.contactInfo.slice(0, ITEM_FIELD_LIMITS.CONTACT_INFO) : "";
  let validPhone = "";
  if (typeof draft.contactPhone === "string" && draft.contactPhone) {
    validPhone = formatPhone(draft.contactPhone);
  }

  let validImgUrl: string | undefined = undefined;
  if (typeof draft.imageUrl === "string" && draft.imageUrl.trim().length > 0) {
    const trimmed = draft.imageUrl.trim();
    if (
      !trimmed.includes("photo-1584438784894-089d6a62b8fa") &&
      !trimmed.includes("images.unsplash.com") &&
      (trimmed.startsWith("data:image/") || trimmed.startsWith("https://") || trimmed.startsWith("http://"))
    ) {
      validImgUrl = trimmed;
    }
  }

  return {
    isValid: true,
    sanitized: {
      currentStep: validStep,
      type: validType,
      title: validTitle,
      category: validCategory,
      description: validDesc,
      color: validColor,
      brand: validBrand,
      location: validLoc,
      locationComplement: validLocComp,
      date: validDate,
      contactInfo: validContact,
      contactPhone: validPhone,
      imageUrl: validImgUrl,
      savedAt: typeof draft.savedAt === "string" ? draft.savedAt : new Date().toISOString(),
    },
  };
}

export const RegisterItemView: React.FC = () => {
  const {
    addItem,
    currentUser,
    registerTypeSelection,
    setRegisterTypeSelection,
    addToast,
    isOnline,
    activeUploadTasks,
    retryUploadTask,
    cancelUploadTask,
  } = useApp();

  const { navigate, goBack } = useRouter();

  // Institutional Auth Guard
  const { isGuest, requireAuth } = useRequireAuth({
    redirectOnUnauth: true,
    targetTab: "register",
    registerType: registerTypeSelection,
    customMessage:
      "Apenas usuários autenticados podem cadastrar novos itens no IFPR. Faça login para continuar.",
  });

  // Strict Access Guard: ALUNO, INTRUSO, or unapproved SERVIDOR cannot access registration flow directly or via route
  const isUnauthorized =
    currentUser?.role === "ALUNO" ||
    currentUser?.role === "INTRUSO" ||
    (currentUser?.role === "SERVIDOR" && currentUser?.approvalStatus !== "APROVADO");

  useEffect(() => {
    if (isUnauthorized) {
      addToast("Apenas Servidores/TAE aprovados e Administradores podem cadastrar objetos no Localiza+.", "error");
      navigate("/");
    }
  }, [isUnauthorized, navigate, addToast]);

  if (isUnauthorized) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <SurfaceCard className="max-w-md w-full p-8 text-center space-y-5">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <UIBadge tone="rose">Acesso Restrito</UIBadge>
            <h2 className="text-xl font-bold text-[#172B2A] dark:text-white tracking-tight">
              Acesso Restrito ao Cadastro
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {currentUser?.role === "SERVIDOR"
                ? "Sua conta de Servidor/TAE aguarda aprovação institucional pela Secretaria/Diretoria do Campus. O cadastro de objetos será liberado assim que o perfil for aprovado."
                : "O cadastro de objetos perdidos e encontrados é restrito a Servidores/TAE aprovados e Administradores do IFPR."}
            </p>
          </div>
          <UIButton
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => navigate("/")}
          >
            Voltar à Página Inicial
          </UIButton>
        </SurfaceCard>
      </div>
    );
  }

  // Step Management (1: Tipo, 2: Informações, 3: Local e Data, 4: Revisão, 5: Conclusão)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Form Fields State
  const [type, setType] = useState<"PERDIDO" | "ENCONTRADO">(
    registerTypeSelection || "ENCONTRADO"
  );
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ItemCategory>("Eletrônicos");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("");
  const [brand, setBrand] = useState("");
  const [location, setLocation] = useState(IFPR_LOCATIONS[0]);
  const [locationComplement, setLocationComplement] = useState("");
  const [date, setDate] = useState(getTodayDateString());
  const [contactInfo, setContactInfo] = useState(
    currentUser?.email || "localizamais0@gmail.com"
  );
  const [contactPhone, setContactPhone] = useState(
    currentUser?.phone ? formatPhone(currentUser.phone) : ""
  );
  const [imageUrl, setImageUrl] = useState<string>("");
  const [hasCustomImage, setHasCustomImage] = useState(false);

  // Reliable Authenticated UID derivation (prevents cross-account pollution)
  const effectiveUid =
    auth.currentUser?.uid ||
    (currentUser && currentUser.id !== "guest" && currentUser.id !== "guest_visitor" && currentUser.id !== "guest_user"
      ? currentUser.id
      : null);

  // Image Processing & Compression State
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionStats, setCompressionStats] = useState<{
    original: string;
    compressed: string;
    savings: number;
  } | null>(null);

  // Camera Modal State
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Draft Management State
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  // Review confirmation checkbox state
  const [hasConfirmedReview, setHasConfirmedReview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step Validation Error Indicators
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});

  // Real Persistence Feedback State (Reativo à máquina canônica)
  const [registrationFeedback, setRegistrationFeedback] = useState<{
    status: RegistrationStatus;
    item: LostFoundItem;
    error?: string;
    taskId?: string;
  } | null>(null);

  // Synchronize initial type from global registerTypeSelection if passed
  useEffect(() => {
    if (registerTypeSelection) {
      setType(registerTypeSelection);
    }
  }, [registerTypeSelection]);

  // Restore Scoped Draft on Mount or UID change (Strict account isolation)
  useEffect(() => {
    // 1. Conservative migration: safely expunge legacy un-scoped draft without attributing it to anyone
    try {
      localStorage.removeItem(LEGACY_DRAFT_STORAGE_KEY);
    } catch (_) {}

    // Helper to reset form fields to clean defaults
    const resetFormFields = () => {
      setTitle("");
      setDescription("");
      setColor("");
      setBrand("");
      setLocation(IFPR_LOCATIONS[0]);
      setLocationComplement("");
      setDate(getTodayDateString());
      setContactInfo(currentUser?.email || "localizamais0@gmail.com");
      setContactPhone(currentUser?.phone ? formatPhone(currentUser.phone) : "");
      setImageUrl("");
      setHasCustomImage(false);
      setCompressionStats(null);
      setCurrentStep(1);
      setDraftRestored(false);
      setDraftSavedAt(null);
      setHasConfirmedReview(false);
      setStepErrors({});
    };

    // 2. Unauthenticated sessions MUST NEVER restore drafts and must show a clean form
    if (!effectiveUid) {
      resetFormFields();
      return;
    }

    // Reset before checking if this specific user has a saved draft
    resetFormFields();

    const storageKey = getRegisterDraftKey(effectiveUid);
    if (!storageKey) return;

    try {
      const savedDraftStr = localStorage.getItem(storageKey);
      if (savedDraftStr) {
        const rawDraft = JSON.parse(savedDraftStr);
        const { isValid, sanitized } = validateAndSanitizeDraft(rawDraft, effectiveUid);
        if (isValid && sanitized) {
          if (sanitized.type) setType(sanitized.type);
          if (sanitized.title) setTitle(sanitized.title);
          if (sanitized.category) setCategory(sanitized.category);
          if (sanitized.description) setDescription(sanitized.description);
          if (sanitized.color) setColor(sanitized.color);
          if (sanitized.brand) setBrand(sanitized.brand);
          if (sanitized.location) setLocation(sanitized.location);
          if (sanitized.locationComplement) setLocationComplement(sanitized.locationComplement);
          if (sanitized.date) setDate(sanitized.date);
          if (sanitized.contactInfo) setContactInfo(sanitized.contactInfo);
          if (sanitized.contactPhone) setContactPhone(sanitized.contactPhone);
          if (sanitized.imageUrl) {
            setImageUrl(sanitized.imageUrl);
            setHasCustomImage(true);
          } else {
            setImageUrl("");
            setHasCustomImage(false);
          }
          if (sanitized.currentStep) {
            setCurrentStep(sanitized.currentStep);
          }
          if (sanitized.savedAt) setDraftSavedAt(sanitized.savedAt);
          setDraftRestored(true);
        }
      }
    } catch (e) {
      console.warn("Aviso ao carregar rascunho de cadastro:", e);
    }
  }, [effectiveUid]);

  // Debounced Auto-Save Draft (Strictly scoped by authentic UID)
  useEffect(() => {
    if (!effectiveUid) return;
    if (!title && !description && !color && !brand && !locationComplement) {
      return;
    }

    const storageKey = getRegisterDraftKey(effectiveUid);
    if (!storageKey) return;

    setIsSavingDraft(true);
    const timer = setTimeout(() => {
      try {
        const now = new Date().toISOString();
        const draftObj = {
          savedByUid: effectiveUid,
          currentStep,
          type,
          title,
          category,
          description,
          color,
          brand,
          location,
          locationComplement,
          date,
          contactInfo,
          contactPhone,
          imageUrl: hasCustomImage && imageUrl ? imageUrl.trim() : undefined,
          savedAt: now,
        };
        localStorage.setItem(storageKey, JSON.stringify(draftObj));
        setDraftSavedAt(now);
        setIsSavingDraft(false);
      } catch (_) {
        setIsSavingDraft(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [
    effectiveUid,
    currentStep,
    type,
    title,
    category,
    description,
    color,
    brand,
    location,
    locationComplement,
    date,
    contactInfo,
    contactPhone,
    imageUrl,
    hasCustomImage,
  ]);

  // Reactive Sync Monitoring for Offline Queue
  useEffect(() => {
    if (!registrationFeedback) return;
    if (registrationFeedback.status === "CONFIRMED") return;

    const currentItemId = registrationFeedback.item.id;
    const canonicalTaskId = getUploadTaskId(currentItemId);

    const matchingTask = activeUploadTasks.find(
      (t) => t.id === canonicalTaskId || t.itemId === currentItemId
    );

    if (matchingTask) {
      if (matchingTask.status === "COMPLETED") {
        setRegistrationFeedback({
          status: "CONFIRMED",
          item: registrationFeedback.item,
        });
      } else if (
        matchingTask.status === "ERROR" &&
        registrationFeedback.status === "PENDING_SYNC"
      ) {
        setRegistrationFeedback({
          status: "ERROR",
          item: registrationFeedback.item,
          error:
            matchingTask.error ||
            "Falha temporária ao sincronizar o cadastro com o servidor em nuvem.",
          taskId: canonicalTaskId,
        });
      } else if (
        (matchingTask.status === "UPLOADING" ||
          matchingTask.status === "QUEUED_SYNC" ||
          matchingTask.status === "SAVING_LOCAL") &&
        registrationFeedback.status === "ERROR"
      ) {
        setRegistrationFeedback({
          status: "PENDING_SYNC",
          item: registrationFeedback.item,
          taskId: canonicalTaskId,
        });
      }
    }
  }, [registrationFeedback, activeUploadTasks]);

  // Clean Draft Handler
  const handleClearDraft = () => {
    vibrateClick();
    if (effectiveUid) {
      const storageKey = getRegisterDraftKey(effectiveUid);
      if (storageKey) {
        try {
          localStorage.removeItem(storageKey);
        } catch (_) {}
      }
    }
    try {
      localStorage.removeItem(LEGACY_DRAFT_STORAGE_KEY);
    } catch (_) {}
    setTitle("");
    setDescription("");
    setColor("");
    setBrand("");
    setLocation(IFPR_LOCATIONS[0]);
    setLocationComplement("");
    setDate(getTodayDateString());
    setContactPhone(currentUser?.phone ? formatPhone(currentUser.phone) : "");
    setContactInfo(currentUser?.email || "localizamais0@gmail.com");
    setImageUrl("");
    setHasCustomImage(false);
    setCompressionStats(null);
    setDraftRestored(false);
    setDraftSavedAt(null);
    setCurrentStep(1);
    setHasConfirmedReview(false);
    setStepErrors({});
    addToast("Rascunho descartado com sucesso. Formulário pronto.", "info");
  };

  // Image File Upload with WebP Compression
  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      addToast("Por favor, selecione um arquivo de imagem válido (JPG, PNG, WebP).", "error");
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      addToast("A imagem selecionada é muito pesada (máximo 15MB).", "error");
      return;
    }

    try {
      setIsCompressing(true);
      const compressed = await compressImage(file, {
        maxWidth: 1280,
        maxHeight: 1280,
        quality: 0.82,
        outputFormat: "image/webp",
      });

      setImageUrl(compressed.base64);
      setHasCustomImage(true);
      setCompressionStats({
        original: compressed.formattedOriginalSize,
        compressed: compressed.formattedCompressedSize,
        savings: compressed.savingsPercentage,
      });

      addToast(
        `Foto anexada e otimizada com sucesso! Redução de ${compressed.savingsPercentage}%.`,
        "success"
      );
    } catch (compErr) {
      console.warn("Aviso ao comprimir arquivo:", compErr);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageUrl(reader.result as string);
        setHasCustomImage(true);
        addToast("Foto anexada com sucesso!", "success");
      };
      reader.readAsDataURL(file);
    } finally {
      setIsCompressing(false);
    }
  };

  // Camera Management
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraStatus("idle");
  };

  const handleOpenCamera = async () => {
    setCameraModalOpen(true);
    setCameraStatus("requesting");
    setCameraError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Câmera não suportada neste dispositivo ou navegador.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraStatus("granted");
      addToast("Câmera conectada com sucesso!", "success");
    } catch (err: any) {
      console.error("Erro ao acessar câmera:", err);
      setCameraStatus("denied");
      setCameraError(
        "Permissão de câmera negada. Habilite a permissão no navegador ou escolha uma foto do seu dispositivo."
      );
      addToast("Não foi possível acessar a câmera.", "error");
    }
  };

  const handleCaptureCamera = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const rawDataUrl = canvas.toDataURL("image/jpeg", 0.9);

    try {
      setIsCompressing(true);
      const compressed = await compressImage(rawDataUrl, {
        maxWidth: 1280,
        maxHeight: 1280,
        quality: 0.82,
        outputFormat: "image/webp",
      });
      setImageUrl(compressed.base64);
      setHasCustomImage(true);
      setCompressionStats({
        original: compressed.formattedOriginalSize,
        compressed: compressed.formattedCompressedSize,
        savings: compressed.savingsPercentage,
      });
      addToast("Foto capturada e otimizada com sucesso!", "success");
    } catch (_) {
      setImageUrl(rawDataUrl);
      setHasCustomImage(true);
      addToast("Foto capturada com sucesso!", "success");
    } finally {
      setIsCompressing(false);
      stopCamera();
      setCameraModalOpen(false);
    }
  };

  const handleRemoveImage = () => {
    vibrateClick();
    setImageUrl("");
    setHasCustomImage(false);
    setCompressionStats(null);
    addToast("Foto removida.", "info");
  };

  // Step Validation Functions
  const validateStep1 = () => {
    if (type !== "PERDIDO" && type !== "ENCONTRADO") {
      addToast("Selecione se o objeto foi perdido ou encontrado.", "error");
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    const errors: Record<string, string> = {};
    if (!title.trim()) {
      errors.title = "Informe o nome ou título do objeto.";
    }
    if (!description.trim()) {
      errors.description = "Escreva uma descrição detalhada para ajudar na identificação.";
    }
    const textCheck = validateItemTextFields(
      {
        title,
        description,
        color,
        brand,
      },
      true
    );
    if (!textCheck.isValid) {
      errors.general = textCheck.error || "Limite de caracteres excedido.";
    }

    setStepErrors(errors);
    if (Object.keys(errors).length > 0) {
      vibrateCritical();
      addToast(
        errors.title || errors.description || errors.general || "Preencha os campos obrigatórios.",
        "error"
      );
      return false;
    }
    return true;
  };

  const validateStep3 = () => {
    const errors: Record<string, string> = {};
    if (!location.trim()) {
      errors.location = "Selecione o local no campus.";
    }
    if (!date) {
      errors.date = "Informe a data da ocorrência.";
    } else {
      const dateCheck = validateItemOccurrenceDate(date, "A data da ocorrência");
      if (!dateCheck.isValid) {
        errors.date = dateCheck.error || "A data não pode ser futura.";
      }
    }

    if (!contactInfo.trim()) {
      errors.contactInfo = "Informe o e-mail ou ponto de contato para devolução.";
    }

    const textCheck = validateItemTextFields(
      {
        location,
        contactInfo,
      },
      true
    );
    if (!textCheck.isValid) {
      errors.general = textCheck.error || "Limite de caracteres excedido.";
    }

    if (contactPhone.trim() && !isValidPhone(contactPhone)) {
      errors.contactPhone = "Telefone inválido. Utilize o formato (XX) 9XXXX-XXXX.";
    }

    setStepErrors(errors);
    if (Object.keys(errors).length > 0) {
      vibrateCritical();
      addToast(
        errors.location ||
          errors.date ||
          errors.contactInfo ||
          errors.contactPhone ||
          "Corrija os campos indicados.",
        "error"
      );
      return false;
    }
    return true;
  };

  // Step Navigation Handlers
  const handleNextStep = () => {
    vibrateClick();
    if (currentStep === 1) {
      if (validateStep1()) setCurrentStep(2);
    } else if (currentStep === 2) {
      if (validateStep2()) setCurrentStep(3);
    } else if (currentStep === 3) {
      if (validateStep3()) setCurrentStep(4);
    }
  };

  const handlePrevStep = () => {
    vibrateClick();
    setStepErrors({});
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as 1 | 2 | 3 | 4);
    }
  };

  // Final Form Submission
  const handleFinalSubmit = async () => {
    vibrateClick();

    if (!hasConfirmedReview) {
      addToast("Marque a confirmação de que revisou os dados antes de prosseguir.", "warning");
      return;
    }

    // Account block safety check
    if (isAccountBlocked(currentUser)) {
      const resolved = resolveAccountStatus(currentUser);
      if (resolved.status === "banned") {
        addToast(
          `Ação Bloqueada: Sua conta institucional está banida. Motivo: ${
            currentUser?.statusReason || "Violação das diretrizes"
          }.`,
          "error"
        );
      } else {
        addToast(
          `Ação Bloqueada: Sua conta institucional está temporariamente suspensa. Motivo: ${
            currentUser?.statusReason || "Suspensão administrativa"
          }.`,
          "warning"
        );
      }
      return;
    }

    // Auth verification
    if (isGuest) {
      requireAuth(
        type,
        {
          title,
          category,
          type,
          description,
          color,
          brand,
          location,
          date,
          imageUrl,
          contactInfo,
        },
        "Apenas usuários autenticados podem cadastrar novos itens. Faça login para continuar."
      );
      return;
    }

    // Re-verify core validations
    if (!validateStep2() || !validateStep3()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const fullLocation = locationComplement.trim()
        ? `${location.trim()} — ${locationComplement.trim()}`
        : location.trim();

      const fullContact =
        [
          contactPhone.trim() ? `WhatsApp: ${contactPhone.trim()}` : "",
          contactInfo.trim() ? `Contato/Ponto: ${contactInfo.trim()}` : "",
        ]
          .filter(Boolean)
          .join(" | ") ||
        currentUser?.email ||
        "Contato Institucional IFPR";

      const res = await addItem({
        title: title.trim(),
        category: normalizeCategory(category),
        type,
        status: type === "PERDIDO" ? "PERDIDO" : "ENCONTRADO",
        description: description.trim(),
        color: color.trim() || "Não informada",
        brand: brand.trim() || "Desconhecida",
        location: fullLocation,
        date,
        imageUrl: hasCustomImage && imageUrl ? imageUrl.trim() : "",
        contactInfo: fullContact,
      });

      // Clear draft on successful persistence
      if (effectiveUid) {
        const storageKey = getRegisterDraftKey(effectiveUid);
        if (storageKey) {
          try {
            localStorage.removeItem(storageKey);
          } catch (_) {}
        }
      }
      try {
        localStorage.removeItem(LEGACY_DRAFT_STORAGE_KEY);
      } catch (_) {}
      setDraftSavedAt(null);
      setDraftRestored(false);

      vibrateSuccess();

      if (res.persistenceStatus === "CONFIRMED") {
        addToast(
          `Cadastro Concluído! O objeto "${res.newItem.title}" foi gravado com sucesso no Firestore.`,
          "success"
        );
        setRegistrationFeedback({
          status: "CONFIRMED",
          item: res.newItem,
        });
      } else if (res.persistenceStatus === "ERROR") {
        const classifiedMsg =
          typeof (res as any)?.classifiedMessage === "string" && (res as any).classifiedMessage.trim().length > 0
            ? (res as any).classifiedMessage
            : typeof (res as any)?.error === "string" && (res as any).error.trim().length > 0
            ? (res as any).error
            : `Sincronização recusada por falta de autorização/permissão no Firestore. O objeto "${res.newItem.title}" permanece preservado no dispositivo.`;

        addToast(classifiedMsg, "warning");
        setRegistrationFeedback({
          status: "ERROR",
          item: res.newItem,
        });
      } else {
        const pendingMsg =
          typeof (res as any)?.classifiedMessage === "string" && (res as any).classifiedMessage.trim().length > 0
            ? (res as any).classifiedMessage
            : `Salvo no dispositivo: O objeto "${res.newItem.title}" será sincronizado assim que a rede voltar.`;

        addToast(pendingMsg, "info");
        setRegistrationFeedback({
          status: "PENDING_SYNC",
          item: res.newItem,
        });
      }

      setCurrentStep(5);
    } catch (submitErr: any) {
      console.error("Erro ao salvar objeto no banco de dados:", submitErr);
      addToast(submitErr?.message || "Erro ao salvar item no banco de dados.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset form to register another item
  const handleRegisterAnother = () => {
    vibrateClick();
    setTitle("");
    setDescription("");
    setColor("");
    setBrand("");
    setLocation(IFPR_LOCATIONS[0]);
    setLocationComplement("");
    setDate(getTodayDateString());
    setContactPhone(currentUser?.phone ? formatPhone(currentUser.phone) : "");
    setContactInfo(currentUser?.email || "localizamais0@gmail.com");
    setImageUrl("");
    setHasCustomImage(false);
    setCompressionStats(null);
    setHasConfirmedReview(false);
    setRegistrationFeedback(null);
    setCurrentStep(1);
  };

  // If visitor / guest, render friendly security guard screen
  if (isGuest) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 sm:px-6">
        <SurfaceCard className="p-6 sm:p-10 text-center space-y-6">
          <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <Lock className="w-8 h-8 sm:w-10 sm:h-10" />
          </div>

          <div className="space-y-2">
            <UIBadge tone="amber">Autenticação Obrigatória</UIBadge>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#172B2A] dark:text-white tracking-tight">
              Identifique-se para Cadastrar
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              Para garantir a integridade, segurança e rastreabilidade dos registros no IFPR Campus
              Ivaiporã, apenas usuários autenticados podem cadastrar novos pertences.
            </p>
          </div>

          <SubtlePanel className="p-4 text-left space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            <div className="flex items-center gap-2 font-bold text-[#172B2A] dark:text-white">
              <ShieldCheck className="w-4 h-4 text-[#16845B]" /> O que você pode fazer sem login:
            </div>
            <ul className="list-disc list-inside space-y-1 pl-1 text-slate-500 dark:text-slate-400">
              <li>Consultar todos os itens perdidos e encontrados</li>
              <li>Fazer buscas por local, cor e categoria</li>
              <li>Escanear QR Codes de etiquetas físicas no campus</li>
              <li>Ver detalhes públicos dos pertences</li>
            </ul>
          </SubtlePanel>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <UIButton
              id="btn-guest-login-to-register"
              type="button"
              variant="primary"
              size="lg"
              onClick={() => {
                vibrateClick();
                requireAuth(type);
              }}
              className="flex-1"
            >
              <LogIn className="w-5 h-5" /> Fazer Login ou Criar Conta
            </UIButton>
            <UIButton
              id="btn-guest-back-to-lost"
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => {
                vibrateClick();
                navigate("/perdidos");
              }}
            >
              <PackageSearch className="w-4 h-4 text-[#16845B]" />
              <span>Explorar Itens</span>
            </UIButton>
            <UIButton
              id="btn-guest-close-to-home"
              type="button"
              variant="outline"
              size="lg"
              onClick={() => {
                vibrateClick();
                if (window.history.length > 1) {
                  goBack();
                } else {
                  navigate("/");
                }
              }}
              title="Fechar e retornar"
            >
              <X className="w-4 h-4" />
              <span>Fechar</span>
            </UIButton>
          </div>
        </SurfaceCard>
      </div>
    );
  }

  // Step definitions for visual progress bar
  const STEPS_NAV = [
    { number: 1, label: "Ocorrência", desc: "Tipo" },
    { number: 2, label: "Objeto", desc: "Informações" },
    { number: 3, label: "Local & Data", desc: "Onde ocorreu" },
    { number: 4, label: "Revisão", desc: "Confirmação" },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20">
      {/* Top Header Card */}
      <SurfaceCard className="p-5 sm:p-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <button
            id="btn-header-close-register"
            type="button"
            onClick={() => {
              vibrateClick();
              if (window.history.length > 1) {
                goBack();
              } else {
                navigate("/");
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Fechar e voltar à tela inicial"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Voltar</span>
          </button>

          <BrandLogo size="sm" />

          <div className="flex items-center gap-2">
            {(title || description || color || brand || locationComplement) && currentStep < 5 ? (
              <button
                type="button"
                onClick={handleClearDraft}
                title="Limpar formulário e apagar rascunho"
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpar</span>
              </button>
            ) : (
              <div className="w-16" aria-hidden="true" />
            )}
          </div>
        </div>

        <div className="text-center space-y-1.5 pt-1">
          <div className="flex items-center justify-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#16845B] dark:text-emerald-400">
              IFPR Campus Ivaiporã
            </span>
            {draftSavedAt && currentStep < 5 && (
              <span className="inline-flex items-center gap-1 text-[10px] text-[#064E3B] dark:text-emerald-300 bg-[#EBF5F0] dark:bg-emerald-950/40 px-2 py-0.5 rounded-md font-semibold">
                <Save className="w-3 h-3 text-[#16845B]" />
                <span>Rascunho salvo</span>
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#172B2A] dark:text-white tracking-tight">
            Registrar Item — Cadastro de Objeto
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
            Preencha as informações abaixo para cadastrar um novo objeto no sistema institucional.
          </p>
        </div>

        {/* Step Indicator / Stepper (Only visible during steps 1 to 4) */}
        {currentStep <= 4 && (
          <div className="pt-2">
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              {STEPS_NAV.map((step) => {
                const isActive = currentStep === step.number;
                const isCompleted = currentStep > step.number;

                return (
                  <button
                    key={step.number}
                    type="button"
                    onClick={() => {
                      if (step.number < currentStep) {
                        vibrateClick();
                        setCurrentStep(step.number as 1 | 2 | 3 | 4);
                      }
                    }}
                    disabled={step.number > currentStep}
                    className={`relative p-2.5 sm:p-3 rounded-xl border text-left transition-all ${
                      isActive
                        ? "bg-[#EBF5F0] dark:bg-emerald-950/30 border-[#16845B] text-[#064E3B] dark:text-emerald-300 shadow-xs"
                        : isCompleted
                        ? "bg-[#F8FAFC] dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-[#16845B]/50 text-[#172B2A] dark:text-slate-200 cursor-pointer"
                        : "bg-slate-50/60 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800 text-slate-400 dark:text-slate-600 opacity-60 cursor-not-allowed"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          isActive
                            ? "bg-[#16845B] text-white"
                            : isCompleted
                            ? "bg-[#16845B] text-white"
                            : "bg-slate-200 dark:bg-slate-800 text-slate-500"
                        }`}
                      >
                        {isCompleted ? <Check className="w-3.5 h-3.5" /> : step.number}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{step.label}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 hidden sm:block truncate">
                          {step.desc}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Linear Progress Bar */}
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
              <div
                className="bg-[#16845B] h-full transition-all duration-300 rounded-full"
                style={{ width: `${(currentStep / 4) * 100}%` }}
              />
            </div>
          </div>
        )}
      </SurfaceCard>

      {/* Restored Draft Alert Banner */}
      {draftRestored && currentStep < 5 && (
        <div className="p-4 rounded-2xl bg-[#EBF5F0] dark:bg-emerald-950/30 border border-[#16845B]/25 flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center space-x-3 text-xs text-[#172B2A] dark:text-emerald-200">
            <div className="p-2 rounded-xl bg-[#16845B] text-white shrink-0">
              <Save className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold">Rascunho recuperado!</p>
              <p className="text-[11px] text-[#064E3B] dark:text-emerald-400">
                Seus dados salvos anteriormente foram restaurados para você continuar.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClearDraft}
            className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-[#16845B]/25 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors shrink-0 flex items-center space-x-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Descartar</span>
          </button>
        </div>
      )}

      {/* =========================================================================
          ETAPA 1: TIPO DE OCORRÊNCIA
          ========================================================================= */}
      {currentStep === 1 && (
        <SurfaceCard className="p-6 sm:p-8 space-y-6 animate-in fade-in duration-200">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase text-[#16845B] dark:text-emerald-400 tracking-wider">
              Etapa 1 de 4 • Tipo de Ocorrência
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-[#172B2A] dark:text-white tracking-tight">
              O que aconteceu com o objeto?
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Selecione se você achou um pertence de outra pessoa ou se você perdeu algo seu no
              campus.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {/* Opção ENCONTRADO */}
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setType("ENCONTRADO");
                setRegisterTypeSelection("ENCONTRADO");
              }}
              className={`p-6 rounded-2xl border-2 text-left transition-all flex flex-col justify-between space-y-4 cursor-pointer ${
                type === "ENCONTRADO"
                  ? "border-[#16845B] bg-[#EBF5F0]/60 dark:bg-emerald-950/20 shadow-sm ring-2 ring-[#16845B]/15"
                  : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/40"
              }`}
            >
              <div className="flex items-start justify-between">
                <div
                  className={`w-13 h-13 rounded-2xl flex items-center justify-center ${
                    type === "ENCONTRADO"
                      ? "bg-[#16845B] text-white"
                      : "bg-[#EBF5F0] dark:bg-emerald-950/50 text-[#16845B] dark:text-emerald-400"
                  }`}
                >
                  <PackagePlus className="w-6 h-6" />
                </div>
                <UIBadge tone={type === "ENCONTRADO" ? "emerald" : "slate"}>Achado</UIBadge>
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[#172B2A] dark:text-white">
                  Encontrei um objeto
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Achei um pertence esquecido por alguém no IFPR e quero registrá-lo para localizar o
                  dono e providenciar a devolução.
                </p>
              </div>

              <div className="pt-2 flex items-center gap-1.5 text-xs font-bold text-[#16845B] dark:text-emerald-400">
                <span>Selecionar esta opção</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </button>

            {/* Opção PERDIDO */}
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setType("PERDIDO");
                setRegisterTypeSelection("PERDIDO");
              }}
              className={`p-6 rounded-2xl border-2 text-left transition-all flex flex-col justify-between space-y-4 cursor-pointer ${
                type === "PERDIDO"
                  ? "border-rose-500 bg-rose-50/50 dark:bg-rose-950/20 shadow-sm ring-2 ring-rose-500/15"
                  : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/40"
              }`}
            >
              <div className="flex items-start justify-between">
                <div
                  className={`w-13 h-13 rounded-2xl flex items-center justify-center ${
                    type === "PERDIDO"
                      ? "bg-rose-600 text-white"
                      : "bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400"
                  }`}
                >
                  <PackageSearch className="w-6 h-6" />
                </div>
                <UIBadge tone={type === "PERDIDO" ? "rose" : "slate"}>Perdido</UIBadge>
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[#172B2A] dark:text-white">
                  Perdi um objeto
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Esqueci ou perdi um pertence meu no campus e quero registrar a ocorrência para que
                  quem encontrá-lo possa me avisar.
                </p>
              </div>

              <div className="pt-2 flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400">
                <span>Selecionar esta opção</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </button>
          </div>

          <div className="pt-6 border-t border-slate-200/80 dark:border-slate-800 flex justify-end">
            <UIButton
              id="btn-step1-continue"
              type="button"
              variant="primary"
              size="lg"
              onClick={handleNextStep}
              className="w-full sm:w-auto px-8"
            >
              <span>Continuar</span>
              <ArrowRight className="w-4 h-4" />
            </UIButton>
          </div>
        </SurfaceCard>
      )}

      {/* =========================================================================
          ETAPA 2: INFORMAÇÕES DO OBJETO
          ========================================================================= */}
      {currentStep === 2 && (
        <SurfaceCard className="p-6 sm:p-8 space-y-6 animate-in fade-in duration-200">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase text-[#16845B] dark:text-emerald-400 tracking-wider">
                Etapa 2 de 4 • Informações do Objeto
              </span>
              <UIBadge tone={type === "ENCONTRADO" ? "emerald" : "rose"}>
                {type === "ENCONTRADO" ? "Objeto Encontrado" : "Objeto Perdido"}
              </UIBadge>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#172B2A] dark:text-white tracking-tight">
              {type === "ENCONTRADO"
                ? "Quais são as características do objeto encontrado?"
                : "Como é o objeto que você perdeu?"}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Preencha os detalhes para facilitar a identificação visual por qualquer pessoa.
            </p>
          </div>

          <div className="space-y-5">
            {/* Nome do Objeto */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="title-input"
                  className="block text-xs font-bold text-[#172B2A] dark:text-slate-200"
                >
                  Nome do Objeto <span className="text-rose-500">*</span>
                </label>
                <span
                  id="title-char-counter"
                  className={`text-[10px] font-mono ${
                    title.length >= ITEM_FIELD_LIMITS.TITLE
                      ? "text-amber-600 font-bold"
                      : "text-slate-400"
                  }`}
                >
                  {title.length} / {ITEM_FIELD_LIMITS.TITLE} caracteres
                </span>
              </div>
              <UIInput
                id="title-input"
                type="text"
                required
                maxLength={ITEM_FIELD_LIMITS.TITLE}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Garrafa térmica Kouda azul marinho 750ml"
                hasError={Boolean(stepErrors.title)}
              />
              {stepErrors.title && (
                <p className="text-xs text-rose-500 mt-1 font-medium">{stepErrors.title}</p>
              )}
            </div>

            {/* Categoria */}
            <UIFieldGroup label="Categoria do Objeto" htmlFor="category-input" required>
              <UISelect
                id="category-input"
                value={category}
                onChange={(e) => setCategory(normalizeCategory(e.target.value))}
              >
                {CATEGORIES_LIST.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </UISelect>
            </UIFieldGroup>

            {/* Descrição Detalhada */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="description-input"
                  className="block text-xs font-bold text-[#172B2A] dark:text-slate-200"
                >
                  Descrição Detalhada <span className="text-rose-500">*</span>
                </label>
                <span
                  id="description-char-counter"
                  className={`text-[10px] font-mono ${
                    description.length >= ITEM_FIELD_LIMITS.DESCRIPTION
                      ? "text-amber-600 font-bold"
                      : "text-slate-400"
                  }`}
                >
                  {description.length} / {ITEM_FIELD_LIMITS.DESCRIPTION} caracteres
                </span>
              </div>
              <UITextarea
                id="description-input"
                required
                rows={4}
                maxLength={ITEM_FIELD_LIMITS.DESCRIPTION}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva características que ajudem a reconhecer o objeto (marcas de uso, arranhões, chaveiros, adesivos, conteúdo interno, etc.)..."
                hasError={Boolean(stepErrors.description)}
              />
              {stepErrors.description && (
                <p className="text-xs text-rose-500 mt-1 font-medium">{stepErrors.description}</p>
              )}
            </div>

            {/* Cor Predominante e Marca/Modelo (Linha Dupla) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="color-input"
                    className="block text-xs font-bold text-[#172B2A] dark:text-slate-200"
                  >
                    Cor Principal <span className="text-slate-400 font-normal">(Opcional)</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Máx. {ITEM_FIELD_LIMITS.COLOR}
                  </span>
                </div>
                <UIInput
                  id="color-input"
                  type="text"
                  maxLength={ITEM_FIELD_LIMITS.COLOR}
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="Ex: Azul marinho, Preto, Prata"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="brand-input"
                    className="block text-xs font-bold text-[#172B2A] dark:text-slate-200"
                  >
                    Marca ou Modelo <span className="text-slate-400 font-normal">(Opcional)</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Máx. {ITEM_FIELD_LIMITS.BRAND}
                  </span>
                </div>
                <UIInput
                  id="brand-input"
                  type="text"
                  maxLength={ITEM_FIELD_LIMITS.BRAND}
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="Ex: Dell, Nike, Casio, Faber-Castell"
                />
              </div>
            </div>

            {/* Foto do Objeto (Upload Limpo, Otimização e Prévia) */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold text-[#172B2A] dark:text-slate-200">
                    Adicionar foto (opcional)
                  </label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    PNG, JPG ou WEBP — Uma foto nítida aumenta em até 80% as chances de devolução.
                  </p>
                </div>
                {hasCustomImage && (
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remover foto</span>
                  </button>
                )}
              </div>

              {hasCustomImage ? (
                /* Card com Prévia da Imagem Selecionada */
                <SubtlePanel className="p-4 flex flex-col sm:flex-row items-center gap-4">
                  <div className="w-28 h-28 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shrink-0 shadow-xs">
                    <img
                      src={imageUrl}
                      alt="Prévia do objeto"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="space-y-2 flex-1 text-center sm:text-left">
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#EBF5F0] text-[#064E3B] dark:bg-emerald-950/60 dark:text-emerald-300 text-xs font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#16845B]" />
                        <span>Foto pronta para envio</span>
                      </span>
                      {compressionStats && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                          Otimizada: {compressionStats.compressed} (-{compressionStats.savings}%)
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 justify-center sm:justify-start pt-1">
                      <label className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-[#172B2A] dark:text-slate-200 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5">
                        <Upload className="w-3.5 h-3.5 text-[#16845B]" />
                        <span>Substituir Foto</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageFileUpload}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={handleOpenCamera}
                        className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-[#172B2A] dark:text-slate-200 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Camera className="w-3.5 h-3.5 text-[#16845B]" />
                        <span>Tirar Nova Foto</span>
                      </button>
                    </div>
                  </div>
                </SubtlePanel>
              ) : (
                /* Card para Escolher Foto quando ainda não houver */
                <div className="p-6 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[#16845B] dark:hover:border-[#16845B] bg-[#F8FAFC] dark:bg-slate-800/30 text-center space-y-3 transition-colors">
                  <div className="w-12 h-12 rounded-2xl bg-[#EBF5F0] dark:bg-emerald-950/40 text-[#16845B] dark:text-emerald-400 mx-auto flex items-center justify-center">
                    <Upload className="w-6 h-6" />
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs sm:text-sm font-bold text-[#172B2A] dark:text-slate-200">
                      Adicionar foto (opcional)
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      PNG, JPG ou WEBP (máx. 15MB). A foto é comprimida automaticamente.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    <label className="px-5 py-2.5 rounded-xl bg-[#16845B] hover:bg-[#064E3B] text-white text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center gap-2">
                      <Upload className="w-4 h-4" />
                      <span>Escolher do dispositivo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileUpload}
                        className="hidden"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={handleOpenCamera}
                      className="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-[#172B2A] dark:text-slate-200 text-xs font-bold transition-all cursor-pointer flex items-center gap-2"
                    >
                      <Camera className="w-4 h-4 text-[#16845B]" />
                      <span>Tirar com a câmera</span>
                    </button>
                  </div>
                </div>
              )}

              {isCompressing && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/40 text-[#064E3B] dark:text-emerald-300 text-xs font-semibold animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin text-[#16845B]" />
                  <span>Otimizando e comprimindo imagem para o PWA...</span>
                </div>
              )}
            </div>
          </div>

          <div className="pt-6 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3">
            <UIButton
              type="button"
              variant="secondary"
              size="lg"
              onClick={handlePrevStep}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar</span>
            </UIButton>

            <UIButton
              id="btn-step2-continue"
              type="button"
              variant="primary"
              size="lg"
              onClick={handleNextStep}
              className="px-8"
            >
              <span>Continuar</span>
              <ArrowRight className="w-4 h-4" />
            </UIButton>
          </div>
        </SurfaceCard>
      )}

      {/* =========================================================================
          ETAPA 3: LOCAL E DATA
          ========================================================================= */}
      {currentStep === 3 && (
        <SurfaceCard className="p-6 sm:p-8 space-y-6 animate-in fade-in duration-200">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase text-[#16845B] dark:text-emerald-400 tracking-wider">
              Etapa 3 de 4 • Local e Data
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-[#172B2A] dark:text-white tracking-tight">
              {type === "ENCONTRADO"
                ? "Onde e quando você encontrou o objeto?"
                : "Onde e quando você viu o objeto pela última vez?"}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Essas informações são essenciais para que o dono e a equipe do campus localizem o
              pertence.
            </p>
          </div>

          <div className="space-y-5">
            {/* Local no Campus */}
            <UIFieldGroup label="Local no Campus Ivaiporã" htmlFor="location-input" required>
              <UISelect
                id="location-input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                leftIcon={<MapPin className="w-4 h-4" />}
              >
                {IFPR_LOCATION_GROUPS.map((group) => (
                  <optgroup key={group.group} label={group.group}>
                    {group.locations.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </optgroup>
                ))}
                {location && !IFPR_LOCATIONS.includes(location) && (
                  <option value={location}>{location} (Legado)</option>
                )}
              </UISelect>
            </UIFieldGroup>

            {/* Ponto de Referência / Complemento */}
            <UIFieldGroup
              label="Ponto de Referência / Detalhes do Local (Opcional)"
              htmlFor="location-complement-input"
            >
              <UIInput
                id="location-complement-input"
                type="text"
                maxLength={120}
                value={locationComplement}
                onChange={(e) => setLocationComplement(e.target.value)}
                placeholder="Ex: Em cima da mesa 04 da biblioteca, ou próximo aos bebedouros do bloco"
              />
            </UIFieldGroup>

            {/* Data da Ocorrência */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="date-input"
                  className="block text-xs font-bold text-[#172B2A] dark:text-slate-200"
                >
                  Data da Ocorrência <span className="text-rose-500">*</span>
                </label>
                <span className="text-[10px] text-slate-400">Não pode ser data futura</span>
              </div>
              <UIInput
                id="date-input"
                type="date"
                required
                max={getTodayDateString()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                leftIcon={<Calendar className="w-4 h-4" />}
                hasError={Boolean(stepErrors.date)}
              />
              {stepErrors.date && (
                <p className="text-xs text-rose-500 mt-1 font-medium">{stepErrors.date}</p>
              )}
            </div>

            {/* Informações de Contato / Ponto de Guarda */}
            <SubtlePanel className="p-4 sm:p-5 space-y-4">
              <div>
                <h4 className="text-xs font-bold text-[#172B2A] dark:text-slate-200 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-[#16845B]" />
                  {type === "ENCONTRADO"
                    ? "Onde o pertence está guardado atualmente?"
                    : "Como podemos falar com você quando o objeto for encontrado?"}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {type === "ENCONTRADO"
                    ? "Informe o ponto institucional onde o objeto foi entregue (ex: Guarita, Secretaria) ou seu e-mail institucional."
                    : "Informe seu e-mail institucional ou número de WhatsApp para receber avisos sobre seu pertence."}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* E-mail ou Ponto de Guarda */}
                <UIFieldGroup
                  label={type === "ENCONTRADO" ? "Ponto de Guarda / E-mail" : "E-mail de Contato"}
                  htmlFor="contact-input"
                  required
                >
                  <UIInput
                    id="contact-input"
                    type="text"
                    required
                    maxLength={ITEM_FIELD_LIMITS.CONTACT_INFO}
                    value={contactInfo}
                    onChange={(e) => setContactInfo(e.target.value)}
                    leftIcon={<Mail className="w-4 h-4" />}
                    placeholder={
                      type === "ENCONTRADO"
                        ? "Ex: Guarita Principal ou meu.email@ifpr.edu.br"
                        : "seu.email@escola.ifpr.edu.br"
                    }
                  />
                </UIFieldGroup>

                {/* Telefone / WhatsApp */}
                <UIFieldGroup
                  label="Telefone / WhatsApp (Opcional)"
                  htmlFor="contact-phone-input"
                  error={stepErrors.contactPhone}
                >
                  <UIInput
                    id="contact-phone-input"
                    type="text"
                    maxLength={15}
                    value={contactPhone}
                    onChange={(e) => setContactPhone(formatPhone(e.target.value))}
                    leftIcon={<Phone className="w-4 h-4" />}
                    placeholder="(43) 99876-5432"
                    hasError={Boolean(stepErrors.contactPhone)}
                  />
                </UIFieldGroup>
              </div>
            </SubtlePanel>
          </div>

          <div className="pt-6 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3">
            <UIButton
              type="button"
              variant="secondary"
              size="lg"
              onClick={handlePrevStep}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar</span>
            </UIButton>

            <UIButton
              id="btn-step3-continue"
              type="button"
              variant="primary"
              size="lg"
              onClick={handleNextStep}
              className="px-8"
            >
              <span>Revisar Cadastro</span>
              <ArrowRight className="w-4 h-4" />
            </UIButton>
          </div>
        </SurfaceCard>
      )}

      {/* =========================================================================
          ETAPA 4: REVISÃO DO CADASTRO
          ========================================================================= */}
      {currentStep === 4 && (
        <SurfaceCard className="p-6 sm:p-8 space-y-6 animate-in fade-in duration-200">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase text-[#16845B] dark:text-emerald-400 tracking-wider">
              Etapa 4 de 4 • Revisão Final
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-[#172B2A] dark:text-white tracking-tight">
              Revise as informações antes de cadastrar
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Verifique com atenção se todos os dados estão corretos. Você pode clicar em "Editar"
              em qualquer seção para fazer alterações sem reiniciar o formulário.
            </p>
          </div>

          <div className="space-y-4">
            {/* Bloco 1: Ocorrência */}
            <SubtlePanel className="p-4 sm:p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Tipo de Ocorrência
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="text-xs text-[#16845B] dark:text-emerald-400 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Editar</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <UIBadge tone={type === "ENCONTRADO" ? "emerald" : "rose"}>
                  {type === "ENCONTRADO"
                    ? "✓ Objeto Encontrado (Achado)"
                    : "⚠️ Objeto Perdido"}
                </UIBadge>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {type === "ENCONTRADO"
                    ? "Aguardando devolução ao legítimo dono"
                    : "Aguardando localização por alguém do campus"}
                </span>
              </div>
            </SubtlePanel>

            {/* Bloco 2: Informações do Objeto */}
            <SubtlePanel className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-700 pb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Dados do Objeto
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="text-xs text-[#16845B] dark:text-emerald-400 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Editar</span>
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 items-start">
                {hasCustomImage && imageUrl ? (
                  <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shrink-0">
                    <img
                      src={imageUrl}
                      alt={title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div
                    className="w-20 h-20 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 p-2 text-center shrink-0"
                    aria-label="Sem foto anexada"
                  >
                    <CameraOff className="w-5 h-5 mb-1 text-[#16845B]" />
                    <span className="text-[10px] font-semibold text-slate-500 leading-tight">
                      Sem foto
                    </span>
                  </div>
                )}

                <div className="space-y-1.5 flex-1 min-w-0">
                  <h4 className="text-base font-bold text-[#172B2A] dark:text-white truncate">
                    {title || "Nome não informado"}
                  </h4>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2.5 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-[#172B2A] dark:text-slate-200 font-medium">
                      Categoria: <strong>{category}</strong>
                    </span>
                    {color && (
                      <span className="px-2.5 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-[#172B2A] dark:text-slate-200 font-medium">
                        Cor: <strong>{color}</strong>
                      </span>
                    )}
                    {brand && (
                      <span className="px-2.5 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-[#172B2A] dark:text-slate-200 font-medium">
                        Marca: <strong>{brand}</strong>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pt-1">
                    {description || "Sem descrição"}
                  </p>
                </div>
              </div>
            </SubtlePanel>

            {/* Bloco 3: Local, Data e Contato */}
            <SubtlePanel className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-700 pb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Local, Data & Contato
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="text-xs text-[#16845B] dark:text-emerald-400 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Editar</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 font-semibold block">Local:</span>
                  <span className="font-bold text-[#172B2A] dark:text-white">
                    {location}
                    {locationComplement && ` — ${locationComplement}`}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 font-semibold block">Data da Ocorrência:</span>
                  <span className="font-bold text-[#172B2A] dark:text-white">
                    {date.split("-").reverse().join("/")}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 font-semibold block">
                    {type === "ENCONTRADO" ? "Ponto de Guarda / E-mail:" : "E-mail de Contato:"}
                  </span>
                  <span className="font-bold text-[#172B2A] dark:text-white">{contactInfo}</span>
                </div>

                {contactPhone && (
                  <div>
                    <span className="text-slate-500 font-semibold block">
                      Telefone / WhatsApp:
                    </span>
                    <span className="font-bold text-[#172B2A] dark:text-white">
                      {contactPhone}
                    </span>
                  </div>
                )}
              </div>
            </SubtlePanel>

            {/* Offline Alert Advisory if Network is Offline */}
            {!isOnline && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 text-xs text-amber-800 dark:text-amber-300">
                <Clock className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <p className="font-bold">Modo Offline Detectado</p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    Ao confirmar, o cadastro será armazenado com segurança no seu dispositivo
                    (IndexedDB) e sincronizado com o Firestore assim que a conexão retornar.
                  </p>
                </div>
              </div>
            )}

            {/* Checkbox de Confirmação do Usuário */}
            <div className="p-4 rounded-2xl bg-[#EBF5F0]/70 dark:bg-emerald-950/20 border border-[#16845B]/25">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  id="confirm-review-checkbox"
                  type="checkbox"
                  checked={hasConfirmedReview}
                  onChange={(e) => setHasConfirmedReview(e.target.checked)}
                  className="w-5 h-5 mt-0.5 rounded-lg text-[#16845B] focus:ring-[#16845B] border-slate-300 cursor-pointer accent-[#16845B]"
                />
                <span className="text-xs sm:text-sm font-semibold text-[#172B2A] dark:text-slate-200 leading-snug">
                  Revisei todas as informações e confirmo que os dados prestados são verdadeiros e
                  condizem com a ocorrência no IFPR Campus Ivaiporã.
                </span>
              </label>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3">
            <UIButton
              type="button"
              variant="secondary"
              size="lg"
              disabled={isSubmitting}
              onClick={handlePrevStep}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar</span>
            </UIButton>

            <UIButton
              id="btn-submit-register-form"
              type="button"
              variant="primary"
              size="lg"
              disabled={!hasConfirmedReview || isSubmitting}
              onClick={handleFinalSubmit}
              className="px-8"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Cadastrando Objeto...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                  <span>Cadastrar Item</span>
                </>
              )}
            </UIButton>
          </div>
        </SurfaceCard>
      )}

      {/* =========================================================================
          ETAPA 5: CONFIRMAÇÃO DE SUCESSO (OU STATUS OFFLINE / ERRO)
          ========================================================================= */}
      {currentStep === 5 && registrationFeedback && (
        <SurfaceCard className="p-6 sm:p-10 space-y-6 text-center animate-in fade-in zoom-in-95 duration-200">
          {registrationFeedback.status === "CONFIRMED" ? (
            <>
              <div className="w-20 h-20 mx-auto rounded-3xl bg-[#EBF5F0] dark:bg-emerald-950/40 border border-[#16845B]/25 flex items-center justify-center text-[#16845B] dark:text-emerald-400">
                <CheckCircle2 className="w-12 h-12" />
              </div>

              <div className="space-y-2">
                <UIBadge tone="emerald">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Persistência Confirmada no Firestore
                </UIBadge>
                <h2 className="text-2xl sm:text-3xl font-bold text-[#172B2A] dark:text-white tracking-tight">
                  Objeto Cadastrado com Sucesso!
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
                  O pertence{" "}
                  <strong className="text-[#172B2A] dark:text-white">
                    "{registrationFeedback.item.title}"
                  </strong>{" "}
                  foi registrado e autenticado com sucesso no sistema do IFPR Campus Ivaiporã.
                </p>
              </div>

              <SubtlePanel className="p-4 sm:p-5 text-left space-y-2.5 text-xs text-slate-600 dark:text-slate-300 max-w-md mx-auto">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500 font-semibold">Identificador (ID):</span>
                  <span className="font-mono font-bold text-[#172B2A] dark:text-white">
                    {registrationFeedback.item.id}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500 font-semibold">Código QR da Etiqueta:</span>
                  <span className="font-mono text-[11px] font-semibold text-[#16845B] dark:text-emerald-400">
                    {registrationFeedback.item.qrCodeId}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500 font-semibold">Local Registrado:</span>
                  <span className="font-semibold text-[#172B2A] dark:text-white">
                    {registrationFeedback.item.location}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-semibold">Status do Objeto:</span>
                  <span className="font-bold text-[#16845B] dark:text-emerald-400 uppercase">
                    {registrationFeedback.item.status}
                  </span>
                </div>
              </SubtlePanel>

              <div className="flex flex-col sm:flex-row gap-3 pt-4 max-w-md mx-auto">
                <UIButton
                  type="button"
                  variant="primary"
                  size="lg"
                  onClick={() => {
                    vibrateClick();
                    navigate(type === "PERDIDO" ? "/perdidos" : "/encontrados");
                  }}
                  className="flex-1"
                >
                  <Eye className="w-4 h-4" />
                  <span>Ver no Mural de {type === "PERDIDO" ? "Perdidos" : "Encontrados"}</span>
                </UIButton>

                <UIButton
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={handleRegisterAnother}
                >
                  <PlusCircle className="w-4 h-4 text-[#16845B]" />
                  <span>Cadastrar Outro</span>
                </UIButton>
              </div>
            </>
          ) : registrationFeedback.status === "ERROR" ? (
            <>
              <div className="w-20 h-20 mx-auto rounded-3xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-rose-600 dark:text-rose-400">
                <AlertCircle className="w-12 h-12" />
              </div>

              <div className="space-y-2">
                <UIBadge tone="rose">
                  <AlertCircle className="w-3.5 h-3.5 mr-1" /> Falha no Envio ao Servidor
                </UIBadge>
                <h2 className="text-2xl sm:text-3xl font-bold text-[#172B2A] dark:text-white tracking-tight">
                  Salvo Localmente no Dispositivo
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
                  Não foi possível completar o envio para o Firestore em nuvem neste momento. Seu
                  item{" "}
                  <strong className="text-[#172B2A] dark:text-white">
                    "{registrationFeedback.item.title}"
                  </strong>{" "}
                  foi protegido com segurança no banco local (IndexedDB) para não se perder.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-4 max-w-md mx-auto">
                <UIButton
                  type="button"
                  variant="danger"
                  size="lg"
                  onClick={async () => {
                    vibrateClick();
                    const taskIdToRetry =
                      registrationFeedback.taskId ||
                      getUploadTaskId(registrationFeedback.item.id);
                    await retryUploadTask(taskIdToRetry);
                  }}
                  className="flex-1"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Tentar Novamente</span>
                </UIButton>

                <UIButton
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={() => {
                    vibrateClick();
                    navigate("/");
                  }}
                >
                  Voltar ao Início
                </UIButton>
              </div>
            </>
          ) : (
            <>
              <div className="w-20 h-20 mx-auto rounded-3xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <Clock className="w-12 h-12" />
              </div>

              <div className="space-y-2">
                <UIBadge tone="amber">
                  <Clock className="w-3.5 h-3.5 mr-1" /> Aguardando Sincronização
                </UIBadge>
                <h2 className="text-2xl sm:text-3xl font-bold text-[#172B2A] dark:text-white tracking-tight">
                  Objeto Salvo no Dispositivo
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
                  O objeto{" "}
                  <strong className="text-[#172B2A] dark:text-white">
                    "{registrationFeedback.item.title}"
                  </strong>{" "}
                  foi armazenado localmente com segurança no dispositivo. A sincronização com a nuvem
                  ocorrerá assim que você se conectar à internet.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-4 max-w-md mx-auto">
                <UIButton
                  type="button"
                  variant="primary"
                  size="lg"
                  onClick={() => {
                    vibrateClick();
                    navigate(type === "PERDIDO" ? "/perdidos" : "/encontrados");
                  }}
                  className="flex-1"
                >
                  Ver no Mural
                </UIButton>
                <UIButton
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={() => {
                    vibrateClick();
                    navigate("/");
                  }}
                >
                  Início
                </UIButton>
              </div>
            </>
          )}
        </SurfaceCard>
      )}

      {/* =========================================================================
          MODAL DA CÂMERA (LIMPO E DIRECIONADO)
          ========================================================================= */}
      {cameraModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#111827] rounded-2xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/40 text-[#16845B] dark:text-emerald-400">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#172B2A] dark:text-white">
                    Tirar Foto com a Câmera
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Capture uma foto nítida do pertence cadastrado
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setCameraModalOpen(false);
                }}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Camera Video Stream */}
            <div className="relative h-64 rounded-2xl bg-slate-900 overflow-hidden border-2 border-dashed border-[#16845B] flex flex-col items-center justify-center p-2 text-center">
              <video
                ref={videoRef}
                playsInline
                muted
                className={`absolute inset-0 w-full h-full object-cover ${
                  cameraStatus === "granted" ? "block" : "hidden"
                }`}
              />

              {cameraStatus !== "granted" && (
                <div className="p-4 space-y-2">
                  {cameraStatus === "denied" ? (
                    <p className="text-xs font-bold text-rose-400">
                      {cameraError || "Permissão de acesso à câmera negada."}
                    </p>
                  ) : (
                    <p className="text-xs font-bold text-amber-300 animate-pulse">
                      Solicitando permissão para usar a câmera... Por favor, confirme no seu
                      navegador.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <UIButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  stopCamera();
                  setCameraModalOpen(false);
                }}
              >
                Cancelar
              </UIButton>

              {cameraStatus === "granted" && (
                <UIButton
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleCaptureCamera}
                >
                  <Camera className="w-4 h-4" />
                  <span>Capturar Foto</span>
                </UIButton>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegisterItemView;
