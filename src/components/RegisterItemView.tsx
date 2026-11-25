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
import { evaluateRegisterViewAccess } from "../lib/itemRegistrationPipeline";
import {
  localize,
  translateCategory,
  translateLocationGroup,
  translateCampusLocation,
  translateItemStatus,
} from "../lib/i18n";
import {
  triggerVibration,
  vibrateClick,
  vibrateSuccess,
  vibrateCritical,
  getTodayDateString,
  formatDate,
  formatPhone,
  isValidPhone,
  validateItemOccurrenceDate,
  validateItemTextFields,
  ITEM_FIELD_LIMITS,
} from "../lib/utils";
import {
  compressImage,
  compressItemImageSafely,
  validateItemImageAndPayloadSize,
} from "../lib/imageCompression";
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
    prefilledItemFromAI,
    setPrefilledItemFromAI,
    addToast,
    isOnline,
    activeUploadTasks,
    retryUploadTask,
    cancelUploadTask,
    language,
    t,
  } = useApp();

  const { navigate, goBack, searchParams } = useRouter();
  const L = (pt: string, en: string) => localize(language, pt, en);

  // Institutional Auth Guard
  const { isGuest, isAuthLoading, requireAuth } = useRequireAuth({
    redirectOnUnauth: true,
    targetTab: "register",
    registerType: registerTypeSelection,
    customMessage: L(
      "Apenas usuários autenticados podem cadastrar novos itens no IFPR. Faça login para continuar.",
      "Only authenticated users can register new items at IFPR. Sign in to continue."
    ),
  });

  // Strict Access Guard: aligned with 8-profile permission matrix AFTER auth finishes hydrating and user is not guest
  const registerAccess = evaluateRegisterViewAccess({
    isAuthLoading,
    isGuest,
    currentUser,
    authUser: auth.currentUser,
  });
  const isUnauthorized = registerAccess.isUnauthorized;

  useEffect(() => {
    if (isUnauthorized) {
      addToast(
        L(
          "Apenas Servidores/TAE aprovados e Administradores podem cadastrar objetos no Localiza+.",
          "Only approved Staff/TAE members and Administrators can register objects in Localiza+."
        ),
        "error"
      );
      navigate("/");
    }
  }, [isUnauthorized, navigate, addToast, language]);

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

  // Synchronize initial type from global registerTypeSelection or URL ?tipo= query param
  useEffect(() => {
    if (draftRestored) return;
    if (searchParams.tipo === "perdido") {
      setType("PERDIDO");
    } else if (searchParams.tipo === "encontrado") {
      setType("ENCONTRADO");
    } else if (registerTypeSelection) {
      setType(registerTypeSelection);
    }
  }, [registerTypeSelection, searchParams.tipo, draftRestored]);

  // Hydrate fields if user entered registration flow via AI prefill
  useEffect(() => {
    if (!prefilledItemFromAI || draftRestored) return;
    if (prefilledItemFromAI.type === "PERDIDO" || prefilledItemFromAI.type === "ENCONTRADO") {
      setType(prefilledItemFromAI.type);
    }
    if (prefilledItemFromAI.title) setTitle(prefilledItemFromAI.title.slice(0, ITEM_FIELD_LIMITS.TITLE));
    if (prefilledItemFromAI.category) setCategory(normalizeCategory(prefilledItemFromAI.category));
    if (prefilledItemFromAI.description) setDescription(prefilledItemFromAI.description.slice(0, ITEM_FIELD_LIMITS.DESCRIPTION));
    if (prefilledItemFromAI.color) setColor(prefilledItemFromAI.color.slice(0, ITEM_FIELD_LIMITS.COLOR));
    if (prefilledItemFromAI.brand) setBrand(prefilledItemFromAI.brand.slice(0, ITEM_FIELD_LIMITS.BRAND));
    if (prefilledItemFromAI.location && IFPR_LOCATIONS.includes(prefilledItemFromAI.location)) {
      setLocation(prefilledItemFromAI.location);
    }
    if (prefilledItemFromAI.date) {
      const dateCheck = validateItemOccurrenceDate(prefilledItemFromAI.date, "A data da ocorrência");
      if (dateCheck.isValid) setDate(prefilledItemFromAI.date);
    }
    if (prefilledItemFromAI.contactInfo) {
      setContactInfo(prefilledItemFromAI.contactInfo.slice(0, ITEM_FIELD_LIMITS.CONTACT_INFO));
    }
    if (prefilledItemFromAI.imageUrl) {
      setImageUrl(prefilledItemFromAI.imageUrl);
      setHasCustomImage(true);
    }
    setPrefilledItemFromAI(null);
  }, [prefilledItemFromAI, draftRestored, setPrefilledItemFromAI]);

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
            L(
              "Falha temporária ao sincronizar o cadastro com o servidor em nuvem.",
              "Temporary failure syncing registration with the cloud server."
            ),
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
    addToast(
      L(
        "Rascunho descartado com sucesso. Formulário pronto.",
        "Draft discarded successfully. Form is ready."
      ),
      "info"
    );
  };

  // Image File Upload with Multi-Pass Compression & Defensive Payload Guard
  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      addToast(
        L(
          "Por favor, selecione um arquivo de imagem válido (JPG, PNG, WebP).",
          "Please select a valid image file (JPG, PNG, WebP)."
        ),
        "error"
      );
      e.target.value = "";
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      addToast(
        L(
          "A imagem selecionada é muito pesada (máximo 15MB).",
          "The selected image is too large (maximum 15MB)."
        ),
        "error"
      );
      e.target.value = "";
      return;
    }

    try {
      setIsCompressing(true);
      setStepErrors((prev) => {
        if (!prev.image) return prev;
        const { image: _removed, ...rest } = prev;
        return rest;
      });

      const prepared = await compressItemImageSafely(file, compressImage);
      if ("reason" in prepared) {
        vibrateCritical();
        setStepErrors((prev) => ({ ...prev, image: prepared.message }));
        addToast(prepared.message, "error");
        return;
      }

      setImageUrl(prepared.result.base64);
      setHasCustomImage(true);
      setCompressionStats({
        original: prepared.result.formattedOriginalSize,
        compressed: prepared.result.formattedCompressedSize,
        savings: prepared.result.savingsPercentage,
      });

      addToast(
        prepared.usedFallbackCompression
          ? L(
              `Foto otimizada em formato compatível (${prepared.result.formattedCompressedSize})!`,
              `Photo optimized in a compatible format (${prepared.result.formattedCompressedSize})!`
            )
          : L(
              `Foto anexada e otimizada com sucesso! Redução de ${prepared.result.savingsPercentage}%.`,
              `Photo attached and optimized successfully! Reduced by ${prepared.result.savingsPercentage}%.`
            ),
        "success"
      );
    } catch (compErr) {
      console.error("Erro ao processar imagem selecionada:", compErr);
      vibrateCritical();
      const errMsg = L(
        "Não foi possível processar a imagem selecionada. Tente outro arquivo JPG ou PNG.",
        "Could not process the selected image. Try another JPG or PNG file."
      );
      setStepErrors((prev) => ({ ...prev, image: errMsg }));
      addToast(errMsg, "error");
    } finally {
      setIsCompressing(false);
      e.target.value = "";
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
        throw new Error(
          L(
            "Câmera não suportada neste dispositivo ou navegador.",
            "Camera is not supported on this device or browser."
          )
        );
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
      addToast(L("Câmera conectada com sucesso!", "Camera connected successfully!"), "success");
    } catch (err: any) {
      console.error("Erro ao acessar câmera:", err);
      setCameraStatus("denied");
      setCameraError(
        L(
          "Permissão de câmera negada. Habilite a permissão no navegador ou escolha uma foto do seu dispositivo.",
          "Camera permission denied. Enable permission in your browser or choose a photo from your device."
        )
      );
      addToast(L("Não foi possível acessar a câmera.", "Could not access the camera."), "error");
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
      setStepErrors((prev) => {
        if (!prev.image) return prev;
        const { image: _removed, ...rest } = prev;
        return rest;
      });

      const prepared = await compressItemImageSafely(rawDataUrl, compressImage);
      if ("reason" in prepared) {
        vibrateCritical();
        setStepErrors((prev) => ({ ...prev, image: prepared.message }));
        addToast(prepared.message, "error");
        return;
      }

      setImageUrl(prepared.result.base64);
      setHasCustomImage(true);
      setCompressionStats({
        original: prepared.result.formattedOriginalSize,
        compressed: prepared.result.formattedCompressedSize,
        savings: prepared.result.savingsPercentage,
      });
      addToast(
        L("Foto capturada e otimizada com sucesso!", "Photo captured and optimized successfully!"),
        "success"
      );
    } catch (err) {
      console.error("Erro ao processar foto capturada:", err);
      vibrateCritical();
      const errMsg = L(
        "Falha ao processar a foto capturada pela câmera. Tente novamente.",
        "Failed to process the captured camera photo. Please try again."
      );
      setStepErrors((prev) => ({ ...prev, image: errMsg }));
      addToast(errMsg, "error");
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
    setStepErrors((prev) => {
      if (!prev.image) return prev;
      const { image: _removed, ...rest } = prev;
      return rest;
    });
    addToast(L("Foto removida.", "Photo removed."), "info");
  };

  // Step Validation Functions
  const validateStep1 = () => {
    if (type !== "PERDIDO" && type !== "ENCONTRADO") {
      addToast(
        L(
          "Selecione se o objeto foi perdido ou encontrado.",
          "Select whether the object was lost or found."
        ),
        "error"
      );
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    const errors: Record<string, string> = {};
    if (!title.trim()) {
      errors.title = L("Informe o nome ou título do objeto.", "Enter the object name or title.");
    }
    if (!description.trim()) {
      errors.description = L(
        "Escreva uma descrição detalhada para ajudar na identificação.",
        "Write a detailed description to help with identification."
      );
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
      errors.general = textCheck.error || L("Limite de caracteres excedido.", "Character limit exceeded.");
    }

    if (hasCustomImage && imageUrl.trim()) {
      const imageSizeCheck = validateItemImageAndPayloadSize({
        imageUrl,
        fields: { title, description, category, color, brand, type },
      });
      if (!imageSizeCheck.isValid) {
        errors.image =
          imageSizeCheck.error || L("A imagem excede o limite permitido.", "The image exceeds the allowed limit.");
      }
    }

    setStepErrors(errors);
    if (Object.keys(errors).length > 0) {
      vibrateCritical();
      addToast(
        errors.title ||
          errors.description ||
          errors.image ||
          errors.general ||
          L("Preencha os campos obrigatórios.", "Please fill in the required fields."),
        "error"
      );
      return false;
    }
    return true;
  };

  const validateStep3 = () => {
    const errors: Record<string, string> = {};
    if (!location.trim()) {
      errors.location = L("Selecione o local no campus.", "Select the campus location.");
    }
    if (!date) {
      errors.date = L("Informe a data da ocorrência.", "Enter the occurrence date.");
    } else {
      const dateCheck = validateItemOccurrenceDate(
        date,
        L("A data da ocorrência", "The occurrence date")
      );
      if (!dateCheck.isValid) {
        errors.date =
          dateCheck.error || L("A data não pode ser futura.", "The date cannot be in the future.");
      }
    }

    if (!contactInfo.trim()) {
      errors.contactInfo = L(
        "Informe o e-mail ou ponto de contato para devolução.",
        "Provide the email or drop-off point for return."
      );
    }

    if (contactPhone.trim() && !isValidPhone(contactPhone)) {
      errors.contactPhone = L(
        "Telefone inválido. Utilize o formato (XX) 9XXXX-XXXX.",
        "Invalid phone number. Use the format (XX) 9XXXX-XXXX."
      );
    }

    const fullLocation = locationComplement.trim()
      ? `${location.trim()} — ${locationComplement.trim()}`
      : location.trim();

    if (fullLocation.length > ITEM_FIELD_LIMITS.LOCATION) {
      errors.locationComplement = L(
        `Local + complemento excedem ${ITEM_FIELD_LIMITS.LOCATION} caracteres (${fullLocation.length}/${ITEM_FIELD_LIMITS.LOCATION}). Reduza o complemento.`,
        `Location + details exceed ${ITEM_FIELD_LIMITS.LOCATION} characters (${fullLocation.length}/${ITEM_FIELD_LIMITS.LOCATION}). Shorten the details.`
      );
    }

    const fullContact =
      [
        contactPhone.trim() ? `WhatsApp: ${contactPhone.trim()}` : "",
        contactInfo.trim() ? `Contato/Ponto: ${contactInfo.trim()}` : "",
      ]
        .filter(Boolean)
        .join(" | ") ||
      currentUser?.email ||
      "Contato Institucional IFPR";

    if (fullContact.length > ITEM_FIELD_LIMITS.CONTACT_INFO) {
      errors.contactInfo = L(
        `As informações de contato combinadas excedem ${ITEM_FIELD_LIMITS.CONTACT_INFO} caracteres (${fullContact.length}/${ITEM_FIELD_LIMITS.CONTACT_INFO}). Encurte o campo de contato.`,
        `Combined contact information exceeds ${ITEM_FIELD_LIMITS.CONTACT_INFO} characters (${fullContact.length}/${ITEM_FIELD_LIMITS.CONTACT_INFO}). Shorten the contact field.`
      );
    }

    const textCheck = validateItemTextFields(
      {
        location: fullLocation,
        contactInfo: fullContact,
      },
      true
    );
    if (!textCheck.isValid && !errors.locationComplement && !errors.contactInfo) {
      errors.general = textCheck.error || L("Limite de caracteres excedido.", "Character limit exceeded.");
    }

    if (hasCustomImage && imageUrl.trim()) {
      const payloadCheck = validateItemImageAndPayloadSize({
        imageUrl,
        fields: {
          title,
          description,
          category,
          color,
          brand,
          type,
          location: fullLocation,
          contactInfo: fullContact,
          date,
        },
      });
      if (!payloadCheck.isValid) {
        errors.image =
          payloadCheck.error ||
          L(
            "A imagem + dados excedem o limite do Firestore.",
            "The image and form data exceed the Firestore size limit."
          );
      }
    }

    setStepErrors(errors);
    if (Object.keys(errors).length > 0) {
      vibrateCritical();
      addToast(
        errors.location ||
          errors.locationComplement ||
          errors.date ||
          errors.contactInfo ||
          errors.contactPhone ||
          errors.image ||
          errors.general ||
          L("Corrija os campos indicados.", "Please correct the highlighted fields."),
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
      addToast(
        L(
          "Marque a confirmação de que revisou os dados antes de prosseguir.",
          "Check the confirmation box stating you reviewed the details before proceeding."
        ),
        "warning"
      );
      return;
    }

    // Account block safety check
    if (isAccountBlocked(currentUser)) {
      const resolved = resolveAccountStatus(currentUser);
      if (resolved.status === "banned") {
        addToast(
          L(
            `Ação Bloqueada: Sua conta institucional está banida. Motivo: ${
              currentUser?.statusReason || "Violação das diretrizes"
            }.`,
            `Action Blocked: Your institutional account is banned. Reason: ${
              currentUser?.statusReason || "Policy violation"
            }.`
          ),
          "error"
        );
      } else {
        addToast(
          L(
            `Ação Bloqueada: Sua conta institucional está temporariamente suspensa. Motivo: ${
              currentUser?.statusReason || "Suspensão administrativa"
            }.`,
            `Action Blocked: Your institutional account is temporarily suspended. Reason: ${
              currentUser?.statusReason || "Administrative suspension"
            }.`
          ),
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
        L(
          "Apenas usuários autenticados podem cadastrar novos itens. Faça login para continuar.",
          "Only authenticated users can register new items. Sign in to continue."
        )
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

      if (res.persistenceStatus === "CONFIRMED") {
        vibrateSuccess();
        addToast(
          L(
            `Cadastro Concluído! O objeto "${res.newItem.title}" foi gravado com sucesso no Firestore.`,
            `Registration Complete! The object "${res.newItem.title}" was saved successfully to Firestore.`
          ),
          "success"
        );
        setRegistrationFeedback({
          status: "CONFIRMED",
          item: res.newItem,
        });
      } else if (res.persistenceStatus === "ERROR") {
        const classifiedMsg =
          typeof res.classifiedMessage === "string" && res.classifiedMessage.trim().length > 0
            ? res.classifiedMessage
            : L(
                `Sincronização recusada por falta de autorização/permissão no Firestore. O objeto "${res.newItem.title}" permanece preservado no dispositivo.`,
                `Sync rejected due to missing authorization/permission in Firestore. The object "${res.newItem.title}" remains safely stored on this device.`
              );

        addToast(classifiedMsg, res.errorCategory === "AUTHORIZATION" ? "error" : "warning");
        setRegistrationFeedback({
          status: "ERROR",
          item: res.newItem,
          error: classifiedMsg,
          taskId: getUploadTaskId(res.newItem.id),
        });
      } else {
        vibrateSuccess();
        const pendingMsg =
          typeof res.classifiedMessage === "string" && res.classifiedMessage.trim().length > 0
            ? res.classifiedMessage
            : L(
                `Salvo no dispositivo: O objeto "${res.newItem.title}" será sincronizado assim que a rede voltar.`,
                `Saved on device: The object "${res.newItem.title}" will sync as soon as the network returns.`
              );

        addToast(pendingMsg, "info");
        setRegistrationFeedback({
          status: "PENDING_SYNC",
          item: res.newItem,
          taskId: getUploadTaskId(res.newItem.id),
        });
      }

      setCurrentStep(5);
    } catch (submitErr: any) {
      console.error("Erro ao salvar objeto no banco de dados:", submitErr);
      addToast(
        submitErr?.message ||
          L("Erro ao salvar item no banco de dados.", "Error saving item to the database."),
        "error"
      );
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

  // Show clean hydration loading state before checking guest/role access
  if (isAuthLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center space-y-3">
        <Loader2 className="w-7 h-7 animate-spin text-[#16845B]" />
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
          {L("Verificando sessão institucional...", "Verifying institutional session...")}
        </p>
      </div>
    );
  }

  // If visitor / guest, render friendly security guard screen
  if (isGuest) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 sm:px-6">
        <SurfaceCard className="p-6 sm:p-10 text-center space-y-6">
          <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <Lock className="w-8 h-8 sm:w-10 sm:h-10" />
          </div>

          <div className="space-y-2">
            <UIBadge tone="amber">{L("Autenticação Obrigatória", "Authentication Required")}</UIBadge>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#172B2A] dark:text-white tracking-tight">
              {L("Identifique-se para Cadastrar", "Sign In to Register")}
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              {L(
                "Para garantir a integridade, segurança e rastreabilidade dos registros no IFPR Campus Ivaiporã, apenas usuários autenticados podem cadastrar novos pertences.",
                "To ensure record integrity, security, and traceability at IFPR Campus Ivaiporã, only authenticated users can register new belongings."
              )}
            </p>
          </div>

          <SubtlePanel className="p-4 text-left space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            <div className="flex items-center gap-2 font-bold text-[#172B2A] dark:text-white">
              <ShieldCheck className="w-4 h-4 text-[#16845B]" />{" "}
              {L("O que você pode fazer sem login:", "What you can do without signing in:")}
            </div>
            <ul className="list-disc list-inside space-y-1 pl-1 text-slate-500 dark:text-slate-400">
              <li>{L("Consultar todos os itens perdidos e encontrados", "Browse all lost and found items")}</li>
              <li>{L("Fazer buscas por local, cor e categoria", "Search by location, color, and category")}</li>
              <li>{L("Ler QR Codes de etiquetas físicas no campus", "Scan physical QR code tags on campus")}</li>
              <li>{L("Ver detalhes públicos dos pertences", "View public details of belongings")}</li>
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
              <LogIn className="w-5 h-5" /> {L("Fazer Login ou Criar Conta", "Sign In or Create Account")}
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
              <span>{L("Explorar Itens", "Explore Items")}</span>
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
              title={L("Fechar e retornar", "Close and go back")}
            >
              <X className="w-4 h-4" />
              <span>{t("close")}</span>
            </UIButton>
          </div>
        </SurfaceCard>
      </div>
    );
  }

  // Strict Access Guard rendered AFTER all hooks (prevents React hooks mismatch during auth hydration)
  if (isUnauthorized) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <SurfaceCard className="max-w-md w-full p-8 text-center space-y-5">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <UIBadge tone="rose">{L("Acesso Restrito", "Restricted Access")}</UIBadge>
            <h2 className="text-xl font-bold text-[#172B2A] dark:text-white tracking-tight">
              {L("Acesso Restrito ao Cadastro", "Registration Access Restricted")}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {currentUser?.role === "SERVIDOR"
                ? L(
                    "Sua conta de Servidor/TAE aguarda aprovação institucional pela Secretaria/Diretoria do Campus. O cadastro de objetos será liberado assim que o perfil for aprovado.",
                    "Your Staff/TAE account is awaiting institutional approval from the Campus Office/Board. Object registration will be enabled once your profile is approved."
                  )
                : L(
                    "O cadastro de objetos perdidos e encontrados é restrito a Servidores/TAE aprovados e Administradores do IFPR.",
                    "Registering lost and found objects is restricted to approved IFPR Staff/TAE members and Administrators."
                  )}
            </p>
          </div>
          <UIButton
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => navigate("/")}
          >
            {t("backToHome")}
          </UIButton>
        </SurfaceCard>
      </div>
    );
  }

  // Step definitions for visual progress bar
  const STEPS_NAV = [
    { number: 1, label: language === "en" ? "Report" : "Ocorrência", desc: t("step1") },
    { number: 2, label: language === "en" ? "Object" : "Objeto", desc: t("step2") },
    { number: 3, label: t("step3"), desc: language === "en" ? "Where & when" : "Onde ocorreu" },
    { number: 4, label: t("step4"), desc: language === "en" ? "Confirmation" : "Confirmação" },
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
            title={t("backToHome")}
          >
            <ChevronLeft className="w-4 h-4" />
            <span>{t("back")}</span>
          </button>

          <BrandLogo size="sm" />

          <div className="flex items-center gap-2">
            {(title || description || color || brand || locationComplement) && currentStep < 5 ? (
              <button
                type="button"
                onClick={handleClearDraft}
                title={language === "en" ? "Clear form and discard draft" : "Limpar formulário e apagar rascunho"}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t("clear")}</span>
              </button>
            ) : (
              <div className="w-16" aria-hidden="true" />
            )}
          </div>
        </div>

        <div className="text-center space-y-1.5 pt-1">
          <div className="flex items-center justify-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#16845B] dark:text-emerald-400">
              {t("campusName")}
            </span>
            {draftSavedAt && currentStep < 5 && (
              <span className="inline-flex items-center gap-1 text-[10px] text-[#064E3B] dark:text-emerald-300 bg-[#EBF5F0] dark:bg-emerald-950/40 px-2 py-0.5 rounded-md font-semibold">
                <Save className="w-3 h-3 text-[#16845B]" />
                <span>{language === "en" ? "Draft saved" : "Rascunho salvo"}</span>
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#172B2A] dark:text-white tracking-tight">
            {t("registerTitle")}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
            {t("registerSubtitle")}
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
              <p className="font-bold">{L("Rascunho recuperado!", "Draft restored!")}</p>
              <p className="text-[11px] text-[#064E3B] dark:text-emerald-400">
                {L(
                  "Seus dados salvos anteriormente foram restaurados para você continuar.",
                  "Your previously saved details have been restored so you can continue."
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClearDraft}
            className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-[#16845B]/25 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors shrink-0 flex items-center space-x-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{L("Descartar", "Discard")}</span>
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
              {language === "en" ? "Step 1 of 4 • Report Type" : "Etapa 1 de 4 • Tipo de Ocorrência"}
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-[#172B2A] dark:text-white tracking-tight">
              {language === "en" ? "What happened to the object?" : "O que aconteceu com o objeto?"}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {language === "en"
                ? "Select whether you found someone else's belonging or lost something of your own on campus."
                : "Selecione se você achou um pertence de outra pessoa ou se você perdeu algo seu no campus."}
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
                <UIBadge tone={type === "ENCONTRADO" ? "emerald" : "slate"}>{t("statusFound")}</UIBadge>
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[#172B2A] dark:text-white">
                  {t("ctaFound")}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t("typeFoundDesc")}
                </p>
              </div>

              <div className="pt-2 flex items-center gap-1.5 text-xs font-bold text-[#16845B] dark:text-emerald-400">
                <span>{L("Selecionar esta opção", "Select this option")}</span>
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
                <UIBadge tone={type === "PERDIDO" ? "rose" : "slate"}>{t("statusLost")}</UIBadge>
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[#172B2A] dark:text-white">
                  {t("ctaLost")}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t("typeLostDesc")}
                </p>
              </div>

              <div className="pt-2 flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400">
                <span>{L("Selecionar esta opção", "Select this option")}</span>
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
              <span>{L("Continuar", "Continue")}</span>
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
                {L("Etapa 2 de 4 • Informações do Objeto", "Step 2 of 4 • Object Information")}
              </span>
              <UIBadge tone={type === "ENCONTRADO" ? "emerald" : "rose"}>
                {type === "ENCONTRADO"
                  ? L("Objeto Encontrado", "Found Object")
                  : L("Objeto Perdido", "Lost Object")}
              </UIBadge>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#172B2A] dark:text-white tracking-tight">
              {type === "ENCONTRADO"
                ? L(
                    "Quais são as características do objeto encontrado?",
                    "What are the characteristics of the found object?"
                  )
                : L(
                    "Como é o objeto que você perdeu?",
                    "What does the object you lost look like?"
                  )}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {L(
                "Preencha os detalhes para facilitar a identificação visual por qualquer pessoa.",
                "Fill in the details to make visual identification easy for anyone."
              )}
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
                  {L("Nome do Objeto", "Object Name")} <span className="text-rose-500">*</span>
                </label>
                <span
                  id="title-char-counter"
                  className={`text-[10px] font-mono ${
                    title.length >= ITEM_FIELD_LIMITS.TITLE
                      ? "text-amber-600 font-bold"
                      : "text-slate-400"
                  }`}
                >
                  {title.length} / {ITEM_FIELD_LIMITS.TITLE} {L("caracteres", "characters")}
                </span>
              </div>
              <UIInput
                id="title-input"
                type="text"
                required
                maxLength={ITEM_FIELD_LIMITS.TITLE}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={L(
                  "Ex: Garrafa térmica Kouda azul marinho 750ml",
                  "e.g., Navy blue 750ml Kouda insulated water bottle"
                )}
                hasError={Boolean(stepErrors.title)}
              />
              {stepErrors.title && (
                <p className="text-xs text-rose-500 mt-1 font-medium">{stepErrors.title}</p>
              )}
            </div>

            {/* Categoria */}
            <UIFieldGroup
              label={L("Categoria do Objeto", "Object Category")}
              htmlFor="category-input"
              required
            >
              <UISelect
                id="category-input"
                value={category}
                onChange={(e) => setCategory(normalizeCategory(e.target.value))}
              >
                {CATEGORIES_LIST.map((cat) => (
                  <option key={cat} value={cat}>
                    {translateCategory(cat, language)}
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
                  {L("Descrição Detalhada", "Detailed Description")}{" "}
                  <span className="text-rose-500">*</span>
                </label>
                <span
                  id="description-char-counter"
                  className={`text-[10px] font-mono ${
                    description.length >= ITEM_FIELD_LIMITS.DESCRIPTION
                      ? "text-amber-600 font-bold"
                      : "text-slate-400"
                  }`}
                >
                  {description.length} / {ITEM_FIELD_LIMITS.DESCRIPTION}{" "}
                  {L("caracteres", "characters")}
                </span>
              </div>
              <UITextarea
                id="description-input"
                required
                rows={4}
                maxLength={ITEM_FIELD_LIMITS.DESCRIPTION}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={L(
                  "Descreva características que ajudem a reconhecer o objeto (marcas de uso, arranhões, chaveiros, adesivos, conteúdo interno, etc.)...",
                  "Describe details that help recognize the object (wear marks, scratches, keychains, stickers, contents, etc.)..."
                )}
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
                    {L("Cor Principal", "Primary Color")}{" "}
                    <span className="text-slate-400 font-normal">
                      ({L("Opcional", "Optional")})
                    </span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {L("Máx.", "Max.")} {ITEM_FIELD_LIMITS.COLOR}
                  </span>
                </div>
                <UIInput
                  id="color-input"
                  type="text"
                  maxLength={ITEM_FIELD_LIMITS.COLOR}
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder={L("Ex: Azul marinho, Preto, Prata", "e.g., Navy blue, Black, Silver")}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="brand-input"
                    className="block text-xs font-bold text-[#172B2A] dark:text-slate-200"
                  >
                    {L("Marca ou Modelo", "Brand or Model")}{" "}
                    <span className="text-slate-400 font-normal">
                      ({L("Opcional", "Optional")})
                    </span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {L("Máx.", "Max.")} {ITEM_FIELD_LIMITS.BRAND}
                  </span>
                </div>
                <UIInput
                  id="brand-input"
                  type="text"
                  maxLength={ITEM_FIELD_LIMITS.BRAND}
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder={L(
                    "Ex: Dell, Nike, Casio, Faber-Castell",
                    "e.g., Dell, Nike, Casio, Faber-Castell"
                  )}
                />
              </div>
            </div>

            {/* Foto do Objeto (Upload Limpo, Otimização e Prévia) */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold text-[#172B2A] dark:text-slate-200">
                    {L("Adicionar foto (opcional)", "Add photo (optional)")}
                  </label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {L(
                      "PNG, JPG ou WEBP — Uma foto nítida aumenta em até 80% as chances de devolução.",
                      "PNG, JPG, or WEBP — A clear photo increases return chances by up to 80%."
                    )}
                  </p>
                </div>
                {hasCustomImage && (
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{L("Remover foto", "Remove photo")}</span>
                  </button>
                )}
              </div>

              {hasCustomImage ? (
                /* Card com Prévia da Imagem Selecionada */
                <SubtlePanel className="p-4 flex flex-col sm:flex-row items-center gap-4">
                  <div className="w-28 h-28 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shrink-0 shadow-xs">
                    <img
                      src={imageUrl}
                      alt={L("Prévia do objeto", "Object preview")}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="space-y-2 flex-1 text-center sm:text-left">
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#EBF5F0] text-[#064E3B] dark:bg-emerald-950/60 dark:text-emerald-300 text-xs font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#16845B]" />
                        <span>{L("Foto pronta para envio", "Photo ready to send")}</span>
                      </span>
                      {compressionStats && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                          {L("Otimizada:", "Optimized:")} {compressionStats.compressed} (-
                          {compressionStats.savings}%)
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 justify-center sm:justify-start pt-1">
                      <label className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-[#172B2A] dark:text-slate-200 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5">
                        <Upload className="w-3.5 h-3.5 text-[#16845B]" />
                        <span>{L("Substituir Foto", "Replace Photo")}</span>
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
                        <span>{L("Tirar Nova Foto", "Take New Photo")}</span>
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
                      {L("Adicionar foto (opcional)", "Add photo (optional)")}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {L(
                        "PNG, JPG ou WEBP (máx. 15MB). A foto é comprimida automaticamente.",
                        "PNG, JPG, or WEBP (max 15MB). Photos are compressed automatically."
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    <label className="px-5 py-2.5 rounded-xl bg-[#16845B] hover:bg-[#064E3B] text-white text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center gap-2">
                      <Upload className="w-4 h-4" />
                      <span>{L("Escolher do dispositivo", "Choose from device")}</span>
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
                      <span>{L("Tirar com a câmera", "Take with camera")}</span>
                    </button>
                  </div>
                </div>
              )}

              {isCompressing && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/40 text-[#064E3B] dark:text-emerald-300 text-xs font-semibold animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin text-[#16845B]" />
                  <span>
                    {L(
                      "Otimizando e comprimindo imagem para o aplicativo...",
                      "Optimizing and compressing image for the app..."
                    )}
                  </span>
                </div>
              )}

              {stepErrors.image && (
                <div
                  role="alert"
                  className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs font-semibold"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                  <span>{stepErrors.image}</span>
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
              <span>{t("back")}</span>
            </UIButton>

            <UIButton
              id="btn-step2-continue"
              type="button"
              variant="primary"
              size="lg"
              onClick={handleNextStep}
              className="px-8"
            >
              <span>{L("Continuar", "Continue")}</span>
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
              {L("Etapa 3 de 4 • Local e Data", "Step 3 of 4 • Location and Date")}
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-[#172B2A] dark:text-white tracking-tight">
              {type === "ENCONTRADO"
                ? L(
                    "Onde e quando você encontrou o objeto?",
                    "Where and when did you find the object?"
                  )
                : L(
                    "Onde e quando você viu o objeto pela última vez?",
                    "Where and when did you last see the object?"
                  )}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {L(
                "Essas informações são essenciais para que o dono e a equipe do campus localizem o pertence.",
                "This information is essential for the owner and campus staff to locate the belonging."
              )}
            </p>
          </div>

          <div className="space-y-5">
            {/* Local no Campus */}
            <UIFieldGroup
              label={L("Local no Campus Ivaiporã", "Location at Campus Ivaiporã")}
              htmlFor="location-input"
              required
            >
              <UISelect
                id="location-input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                leftIcon={<MapPin className="w-4 h-4" />}
              >
                {IFPR_LOCATION_GROUPS.map((group) => (
                  <optgroup key={group.group} label={translateLocationGroup(group.group, language)}>
                    {group.locations.map((loc) => (
                      <option key={loc} value={loc}>
                        {translateCampusLocation(loc, language)}
                      </option>
                    ))}
                  </optgroup>
                ))}
                {location && !IFPR_LOCATIONS.includes(location) && (
                  <option value={location}>
                    {translateCampusLocation(location, language)} ({L("Legado", "Legacy")})
                  </option>
                )}
              </UISelect>
            </UIFieldGroup>

            {/* Ponto de Referência / Complemento */}
            {(() => {
              const maxComplementChars = Math.max(0, ITEM_FIELD_LIMITS.LOCATION - location.trim().length - 3);
              return (
                <UIFieldGroup
                  label={L(
                    "Ponto de Referência / Detalhes do Local (Opcional)",
                    "Landmark / Location Details (Optional)"
                  )}
                  htmlFor="location-complement-input"
                  error={stepErrors.locationComplement}
                >
                  <UIInput
                    id="location-complement-input"
                    type="text"
                    maxLength={maxComplementChars}
                    value={locationComplement}
                    onChange={(e) => setLocationComplement(e.target.value)}
                    hasError={Boolean(stepErrors.locationComplement)}
                    placeholder={L(
                      "Ex: Em cima da mesa 04 da biblioteca, ou próximo aos bebedouros",
                      "e.g., On table 04 in the library, or near the drinking fountains"
                    )}
                  />
                  <div className="flex justify-end mt-1">
                    <span className="text-[10px] text-slate-400 tabular-nums">
                      {locationComplement.length}/{maxComplementChars}{" "}
                      {L(
                        "caracteres disponíveis para o complemento",
                        "characters available for details"
                      )}
                    </span>
                  </div>
                </UIFieldGroup>
              );
            })()}

            {/* Data da Ocorrência */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="date-input"
                  className="block text-xs font-bold text-[#172B2A] dark:text-slate-200"
                >
                  {L("Data da Ocorrência", "Occurrence Date")}{" "}
                  <span className="text-rose-500">*</span>
                </label>
                <span className="text-[10px] text-slate-400">
                  {L("Não pode ser data futura", "Cannot be a future date")}
                </span>
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
                    ? L(
                        "Onde o pertence está guardado atualmente?",
                        "Where is the belonging currently being held?"
                      )
                    : L(
                        "Como podemos falar com você quando o objeto for encontrado?",
                        "How can we contact you when the object is found?"
                      )}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {type === "ENCONTRADO"
                    ? L(
                        "Informe o ponto institucional onde o objeto foi entregue (ex: Guarita, Secretaria) ou seu e-mail institucional.",
                        "Enter the campus point where the object was handed in (e.g., Main Gate, Academic Office) or your institutional email."
                      )
                    : L(
                        "Informe seu e-mail institucional ou número de WhatsApp para receber avisos sobre seu pertence.",
                        "Enter your institutional email or WhatsApp number to receive alerts about your belonging."
                      )}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* E-mail ou Ponto de Guarda */}
                <UIFieldGroup
                  label={
                    type === "ENCONTRADO"
                      ? L("Ponto de Guarda / E-mail", "Holding Point / Email")
                      : L("E-mail de Contato", "Contact Email")
                  }
                  htmlFor="contact-input"
                  error={stepErrors.contactInfo}
                  required
                >
                  <UIInput
                    id="contact-input"
                    type="text"
                    required
                    maxLength={ITEM_FIELD_LIMITS.CONTACT_INFO}
                    value={contactInfo}
                    onChange={(e) => setContactInfo(e.target.value)}
                    hasError={Boolean(stepErrors.contactInfo)}
                    leftIcon={<Mail className="w-4 h-4" />}
                    placeholder={
                      type === "ENCONTRADO"
                        ? L(
                            "Ex: Guarita Principal ou meu.email@ifpr.edu.br",
                            "e.g., Main Gate or my.email@ifpr.edu.br"
                          )
                        : L("seu.email@ifpr.edu.br", "your.email@ifpr.edu.br")
                    }
                  />
                </UIFieldGroup>

                {/* Telefone / WhatsApp */}
                <UIFieldGroup
                  label={L("Telefone / WhatsApp (Opcional)", "Phone / WhatsApp (Optional)")}
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
              <span>{t("back")}</span>
            </UIButton>

            <UIButton
              id="btn-step3-continue"
              type="button"
              variant="primary"
              size="lg"
              onClick={handleNextStep}
              className="px-8"
            >
              <span>{L("Revisar Cadastro", "Review Registration")}</span>
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
              {L("Etapa 4 de 4 • Revisão Final", "Step 4 of 4 • Final Review")}
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-[#172B2A] dark:text-white tracking-tight">
              {L(
                "Revise as informações antes de cadastrar",
                "Review the details before submitting"
              )}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {L(
                'Verifique com atenção se todos os dados estão corretos. Você pode clicar em "Editar" em qualquer seção para fazer alterações sem reiniciar o formulário.',
                'Check carefully that all details are accurate. You can click "Edit" in any section to make changes without restarting the form.'
              )}
            </p>
          </div>

          <div className="space-y-4">
            {/* Bloco 1: Ocorrência */}
            <SubtlePanel className="p-4 sm:p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {L("Tipo de Ocorrência", "Report Type")}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="text-xs text-[#16845B] dark:text-emerald-400 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{t("edit")}</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <UIBadge tone={type === "ENCONTRADO" ? "emerald" : "rose"}>
                  {type === "ENCONTRADO"
                    ? L("✓ Objeto Encontrado (Achado)", "✓ Found Object")
                    : L("⚠️ Objeto Perdido", "⚠️ Lost Object")}
                </UIBadge>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {type === "ENCONTRADO"
                    ? L(
                        "Aguardando devolução ao legítimo dono",
                        "Awaiting return to the rightful owner"
                      )
                    : L(
                        "Aguardando localização por alguém do campus",
                        "Awaiting discovery by someone on campus"
                      )}
                </span>
              </div>
            </SubtlePanel>

            {/* Bloco 2: Informações do Objeto */}
            <SubtlePanel className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-700 pb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {L("Dados do Objeto", "Object Details")}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="text-xs text-[#16845B] dark:text-emerald-400 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{t("edit")}</span>
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
                    aria-label={L("Sem foto anexada", "No photo attached")}
                  >
                    <CameraOff className="w-5 h-5 mb-1 text-[#16845B]" />
                    <span className="text-[10px] font-semibold text-slate-500 leading-tight">
                      {t("noPhoto")}
                    </span>
                  </div>
                )}

                <div className="space-y-1.5 flex-1 min-w-0">
                  <h4 className="text-base font-bold text-[#172B2A] dark:text-white truncate">
                    {title || L("Nome não informado", "Name not provided")}
                  </h4>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2.5 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-[#172B2A] dark:text-slate-200 font-medium">
                      {L("Categoria:", "Category:")}{" "}
                      <strong>{translateCategory(category, language)}</strong>
                    </span>
                    {color && (
                      <span className="px-2.5 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-[#172B2A] dark:text-slate-200 font-medium">
                        {L("Cor:", "Color:")} <strong>{color}</strong>
                      </span>
                    )}
                    {brand && (
                      <span className="px-2.5 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-[#172B2A] dark:text-slate-200 font-medium">
                        {L("Marca:", "Brand:")} <strong>{brand}</strong>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pt-1">
                    {description || L("Sem descrição", "No description")}
                  </p>
                </div>
              </div>
            </SubtlePanel>

            {/* Bloco 3: Local, Data e Contato */}
            <SubtlePanel className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-700 pb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {L("Local, Data e Contato", "Location, Date & Contact")}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="text-xs text-[#16845B] dark:text-emerald-400 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{t("edit")}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 font-semibold block">
                    {L("Local:", "Location:")}
                  </span>
                  <span className="font-bold text-[#172B2A] dark:text-white">
                    {translateCampusLocation(location, language)}
                    {locationComplement && ` — ${locationComplement}`}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 font-semibold block">
                    {L("Data da Ocorrência:", "Occurrence Date:")}
                  </span>
                  <span className="font-bold text-[#172B2A] dark:text-white">
                    {formatDate(date, undefined, language)}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 font-semibold block">
                    {type === "ENCONTRADO"
                      ? L("Ponto de Guarda / E-mail:", "Holding Point / Email:")
                      : L("E-mail de Contato:", "Contact Email:")}
                  </span>
                  <span className="font-bold text-[#172B2A] dark:text-white">{contactInfo}</span>
                </div>

                {contactPhone && (
                  <div>
                    <span className="text-slate-500 font-semibold block">
                      {L("Telefone / WhatsApp:", "Phone / WhatsApp:")}
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
                  <p className="font-bold">
                    {L("Modo Offline Detectado", "Offline Mode Detected")}
                  </p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    {L(
                      "Ao confirmar, o cadastro será armazenado com segurança no seu dispositivo (IndexedDB) e sincronizado com o Firestore assim que a conexão retornar.",
                      "Upon confirmation, this record will be stored safely on your device (IndexedDB) and synced with Firestore once connectivity returns."
                    )}
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
                  {L(
                    "Revisei todas as informações e confirmo que os dados prestados são verdadeiros e condizem com a ocorrência no IFPR Campus Ivaiporã.",
                    "I have reviewed all details and confirm that the information provided is accurate and matches the occurrence at IFPR Campus Ivaiporã."
                  )}
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
              <span>{t("back")}</span>
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
                  <span>{L("Cadastrando Objeto...", "Registering Object...")}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                  <span>{t("submitItem")}</span>
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
                  <ShieldCheck className="w-3.5 h-3.5 mr-1" />{" "}
                  {L("Persistência Confirmada no Firestore", "Persistence Confirmed in Firestore")}
                </UIBadge>
                <h2 className="text-2xl sm:text-3xl font-bold text-[#172B2A] dark:text-white tracking-tight">
                  {L("Objeto Cadastrado com Sucesso!", "Object Registered Successfully!")}
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
                  {L("O pertence", "The belonging")}{" "}
                  <strong className="text-[#172B2A] dark:text-white">
                    "{registrationFeedback.item.title}"
                  </strong>{" "}
                  {L(
                    "foi registrado e autenticado com sucesso no sistema do IFPR Campus Ivaiporã.",
                    "has been successfully registered and verified in the IFPR Campus Ivaiporã system."
                  )}
                </p>
              </div>

              <SubtlePanel className="p-4 sm:p-5 text-left space-y-2.5 text-xs text-slate-600 dark:text-slate-300 max-w-md mx-auto">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500 font-semibold">
                    {L("Identificador (ID):", "Identifier (ID):")}
                  </span>
                  <span className="font-mono font-bold text-[#172B2A] dark:text-white">
                    {registrationFeedback.item.id}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500 font-semibold">
                    {L("Código QR da Etiqueta:", "Label QR Code:")}
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-[#16845B] dark:text-emerald-400">
                    {registrationFeedback.item.qrCodeId}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500 font-semibold">
                    {L("Local Registrado:", "Registered Location:")}
                  </span>
                  <span className="font-semibold text-[#172B2A] dark:text-white">
                    {translateCampusLocation(registrationFeedback.item.location, language)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-semibold">
                    {L("Situação do Objeto:", "Object Status:")}
                  </span>
                  <span className="font-bold text-[#16845B] dark:text-emerald-400 uppercase">
                    {translateItemStatus(registrationFeedback.item.status, language)}
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
                  <span>
                    {type === "PERDIDO"
                      ? L("Ver no Mural de Perdidos", "View in Lost Board")
                      : L("Ver no Mural de Encontrados", "View in Found Board")}
                  </span>
                </UIButton>

                <UIButton
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={handleRegisterAnother}
                >
                  <PlusCircle className="w-4 h-4 text-[#16845B]" />
                  <span>{L("Cadastrar Outro", "Register Another")}</span>
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
                  <AlertCircle className="w-3.5 h-3.5 mr-1" />{" "}
                  {L("Falha no Envio ao Servidor", "Server Upload Failed")}
                </UIBadge>
                <h2 className="text-2xl sm:text-3xl font-bold text-[#172B2A] dark:text-white tracking-tight">
                  {L("Salvo Localmente no Dispositivo", "Saved Locally on Device")}
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
                  {L(
                    "Não foi possível completar o envio para o Firestore em nuvem neste momento. Seu item",
                    "Could not complete the upload to cloud Firestore right now. Your item"
                  )}{" "}
                  <strong className="text-[#172B2A] dark:text-white">
                    "{registrationFeedback.item.title}"
                  </strong>{" "}
                  {L(
                    "foi protegido com segurança no banco local (IndexedDB) para não se perder.",
                    "has been safely preserved in the local database (IndexedDB) so it is not lost."
                  )}
                </p>
                {registrationFeedback.error && (
                  <div
                    role="alert"
                    className="mt-3 max-w-lg mx-auto rounded-xl border border-rose-200 dark:border-rose-800/80 bg-rose-50/80 dark:bg-rose-950/30 px-4 py-3 text-left text-xs text-rose-800 dark:text-rose-200"
                  >
                    <p className="font-bold mb-0.5">
                      {L("Detalhe do diagnóstico:", "Diagnostic details:")}
                    </p>
                    <p className="leading-relaxed">{registrationFeedback.error}</p>
                    <p className="mt-1 font-mono text-[11px] opacity-80">
                      {L("ID preservado na fila local:", "ID preserved in local queue:")}{" "}
                      {registrationFeedback.item.id}
                    </p>
                  </div>
                )}
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
                  <span>{L("Tentar Novamente", "Try Again")}</span>
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
                  {t("backToHome")}
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
                  <Clock className="w-3.5 h-3.5 mr-1" />{" "}
                  {L("Aguardando Sincronização", "Waiting to Sync")}
                </UIBadge>
                <h2 className="text-2xl sm:text-3xl font-bold text-[#172B2A] dark:text-white tracking-tight">
                  {L("Objeto Salvo no Dispositivo", "Object Saved on Device")}
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
                  {L("O objeto", "The object")}{" "}
                  <strong className="text-[#172B2A] dark:text-white">
                    "{registrationFeedback.item.title}"
                  </strong>{" "}
                  {L(
                    "foi armazenado localmente com segurança no dispositivo. A sincronização com a nuvem ocorrerá assim que você se conectar à internet.",
                    "has been safely stored locally on your device. Cloud synchronization will occur as soon as you reconnect to the internet."
                  )}
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
                  {L("Ver no Mural", "View on Board")}
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
                  {t("home")}
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
                    {L("Tirar Foto com a Câmera", "Take Photo with Camera")}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {L(
                      "Capture uma foto nítida do pertence cadastrado",
                      "Capture a clear photo of the registered belonging"
                    )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setCameraModalOpen(false);
                }}
                aria-label={t("close")}
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
                      {cameraError ||
                        L(
                          "Permissão de acesso à câmera negada.",
                          "Camera access permission denied."
                        )}
                    </p>
                  ) : (
                    <p className="text-xs font-bold text-amber-300 animate-pulse">
                      {L(
                        "Solicitando permissão para usar a câmera... Por favor, confirme no seu navegador.",
                        "Requesting camera permission... Please confirm in your browser."
                      )}
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
                {t("cancel")}
              </UIButton>

              {cameraStatus === "granted" && (
                <UIButton
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleCaptureCamera}
                >
                  <Camera className="w-4 h-4" />
                  <span>{L("Capturar Foto", "Capture Photo")}</span>
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
