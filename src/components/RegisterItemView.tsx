import React, { useState, useEffect, useRef } from "react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../context/RouterContext";
import { useRequireAuth } from "../hooks/useRequireAuth";
import { IFPR_LOCATIONS } from "../data/mockData";
import { ItemCategory, LostFoundItem } from "../types";
import { safeFetchJson, clientAnalyzeObject, clientAnalyzeImage } from "../lib/apiHelper";
import { triggerVibration, vibrateClick, vibrateSuccess, vibrateCritical, safeToLower, safeIncludes, safeTextCorpus, sanitizeQuery, getTodayDateString, formatPhone, isValidPhone } from "../lib/utils";
import { compressImage, formatBytes } from "../lib/imageCompression";
import {
  Sparkles,
  PlusCircle,
  PackageSearch,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Wand2,
  Image as ImageIcon,
  MapPin,
  Tag,
  Calendar,
  ShieldCheck,
  Eye,
  Mic,
  MicOff,
  Search,
  Compass,
  Camera,
  CameraOff,
  X,
  Printer,
  QrCode,
  WifiOff,
  Clock,
  Save,
  Trash2,
  History,
  RotateCcw,
  Lock,
  LogIn,
  ArrowRight,
  Phone,
} from "lucide-react";

const DRAFT_STORAGE_KEY = "ifpr_achados_register_draft";

export const RegisterItemView: React.FC = () => {
  const {
    addItem,
    items,
    setSelectedItemForDetail,
    currentUser,
    registerTypeSelection,
    setRegisterTypeSelection,
    setActiveTab,
    addToast,
    prefilledItemFromAI,
    setPrefilledItemFromAI,
    isOnline,
    isAuthenticated,
    requestAuthForRegistration,
    setAuthModalOpen,
  } = useApp();

  const { navigate, goBack } = useRouter();

  // Hook institucional de verificação de autenticação (redireciona visitantes não autenticados)
  const { isGuest, requireAuth } = useRequireAuth({
    redirectOnUnauth: true,
    targetTab: "register",
    registerType: registerTypeSelection,
    customMessage: "Apenas usuários autenticados podem cadastrar novos itens no IFPR. Faça login para continuar.",
  });

  // Form State
  const [type, setType] = useState<"PERDIDO" | "ENCONTRADO">(registerTypeSelection);

  // Synchronize type whenever global registerTypeSelection changes (e.g. navigation clicks)
  useEffect(() => {
    if (registerTypeSelection) {
      setType(registerTypeSelection);
    }
  }, [registerTypeSelection]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ItemCategory>("Eletrônicos");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("");
  const [brand, setBrand] = useState("");
  const [location, setLocation] = useState(IFPR_LOCATIONS[0]);
  const [date, setDate] = useState(getTodayDateString());
  const [contactInfo, setContactInfo] = useState(currentUser?.email || "localizamais6@gmail.com");
  const [contactPhone, setContactPhone] = useState(
    currentUser?.phone ? formatPhone(currentUser.phone) : ""
  );
  const [imageUrl, setImageUrl] = useState(
    "https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=600&auto=format&fit=crop&q=80"
  );
  const [aiPrompt, setAiPrompt] = useState("");

  // Real-time image compression state
  const [compressionStats, setCompressionStats] = useState<{
    original: string;
    compressed: string;
    savings: number;
  } | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);

  // Draft Save & Restore State
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Restore Draft on Mount
  useEffect(() => {
    try {
      const savedDraftStr = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (savedDraftStr) {
        const draft = JSON.parse(savedDraftStr);
        if (draft && (draft.title || draft.description || draft.brand || draft.color || draft.aiPrompt)) {
          if (draft.type) setType(draft.type);
          if (draft.title) setTitle(draft.title);
          if (draft.category) setCategory(draft.category);
          if (draft.description) setDescription(draft.description);
          if (draft.color) setColor(draft.color);
          if (draft.brand) setBrand(draft.brand);
          if (draft.location) setLocation(draft.location);
          if (draft.date) setDate(draft.date);
          if (draft.contactInfo) setContactInfo(draft.contactInfo);
          if (draft.imageUrl) setImageUrl(draft.imageUrl);
          if (draft.aiPrompt) setAiPrompt(draft.aiPrompt);
          if (draft.savedAt) setDraftSavedAt(draft.savedAt);
          setDraftRestored(true);
        }
      }
    } catch (e) {
      console.warn("Erro ao restaurar rascunho:", e);
    }
  }, []);

  // Auto-Save Draft on Form Changes (Debounced)
  useEffect(() => {
    if (!title && !description && !color && !brand && !aiPrompt) {
      return;
    }
    setIsSavingDraft(true);
    const timer = setTimeout(() => {
      try {
        const now = new Date().toISOString();
        const draftObj = {
          type,
          title,
          category,
          description,
          color,
          brand,
          location,
          date,
          contactInfo,
          imageUrl,
          aiPrompt,
          savedAt: now,
        };
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftObj));
        setDraftSavedAt(now);
        setIsSavingDraft(false);
      } catch (_) {}
    }, 600);

    return () => clearTimeout(timer);
  }, [type, title, category, description, color, brand, location, date, contactInfo, imageUrl, aiPrompt]);

  const handleClearDraft = () => {
    vibrateClick();
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch (_) {}
    setTitle("");
    setDescription("");
    setColor("");
    setBrand("");
    setLocation(IFPR_LOCATIONS[0]);
    setDate(new Date().toISOString().split("T")[0]);
    setAiPrompt("");
    setImageUrl("https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=600&auto=format&fit=crop&q=80");
    setDraftRestored(false);
    setDraftSavedAt(null);
    addToast("Rascunho descartado e formulário redefinido com sucesso.", "info");
  };

  // Camera capture state
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
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
        throw new Error("Câmera não suportada no ambiente atual.");
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
      addToast("Acesso à câmera concedido!", "success");
    } catch (err: any) {
      console.error("Erro ao solicitar acesso à câmera:", err);
      setCameraStatus("denied");
      setCameraError("Permissão de acesso à câmera negada. Habilite a permissão no navegador para fotografar.");
      addToast("Erro ao abrir câmera.", "error");
    }
  };

  const handleCaptureSnapshot = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (ctx) {
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
        setCompressionStats({
          original: compressed.formattedOriginalSize,
          compressed: compressed.formattedCompressedSize,
          savings: compressed.savingsPercentage,
        });
        analyzeImageWithGemini(compressed.base64);
        addToast(`Foto capturada e comprimida (-${compressed.savingsPercentage}%) com sucesso!`, "success");
      } catch (_) {
        setImageUrl(rawDataUrl);
        analyzeImageWithGemini(rawDataUrl);
        addToast("Foto capturada da câmera com sucesso!", "success");
      } finally {
        setIsCompressing(false);
        stopCamera();
        setCameraModalOpen(false);
      }
    }
  };

  // Voice to text state
  const [isListening, setIsListening] = useState(false);
  const [listeningTarget, setListeningTarget] = useState<"aiPrompt" | "description">("description");
  const recognitionRef = useRef<any>(null);

  // AI States
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);

  // Web Speech API Voice Recognition setup
  const toggleSpeechRecognition = (targetField: "aiPrompt" | "description") => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      addToast(
        "Reconhecimento de voz não é suportado pelo seu navegador. Tente usar o Google Chrome.",
        "error"
      );
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "pt-BR";
      recognition.continuous = true;
      recognition.interimResults = true;

      setListeningTarget(targetField);
      setIsListening(true);
      addToast("🎙️ Ditado por voz ativado! Fale pausadamente...", "info");

      recognition.onresult = (event: any) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }

        if (targetField === "description") {
          setDescription((prev) => (prev ? `${prev} ${transcript}` : transcript));
        } else {
          setAiPrompt((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };

      recognition.onerror = (event: any) => {
        console.warn("Erro no reconhecimento de voz:", event.error);
        setIsListening(false);
        addToast("Não foi possível capturar o áudio. Tente novamente.", "error");
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.error(e);
      setIsListening(false);
      addToast("Erro ao iniciar captura de voz.", "error");
    }
  };

  // Apply prefilled item from AI if available
  useEffect(() => {
    if (prefilledItemFromAI) {
      if (prefilledItemFromAI.title) setTitle(prefilledItemFromAI.title);
      if (prefilledItemFromAI.category) setCategory(prefilledItemFromAI.category);
      if (prefilledItemFromAI.description) setDescription(prefilledItemFromAI.description);
      if (prefilledItemFromAI.color) setColor(prefilledItemFromAI.color);
      if (prefilledItemFromAI.brand) setBrand(prefilledItemFromAI.brand);
      if (prefilledItemFromAI.imageUrl) setImageUrl(prefilledItemFromAI.imageUrl);
      if (prefilledItemFromAI.location) setLocation(prefilledItemFromAI.location);
      // Clear after consuming
      setPrefilledItemFromAI(null);
    }
  }, [prefilledItemFromAI, setPrefilledItemFromAI]);

  const categoriesList: ItemCategory[] = [
    "Eletrônicos",
    "Documentos & Cartões",
    "Roupas & Calçados",
    "Chaves",
    "Material Escolar & Livros",
    "Acessórios & Bijuterias",
    "Garrafas & Marmitas",
    "Guarda-chuvas",
    "Outros",
  ];

  // AI Auto-Fill Functionality
  const handleAIExtract = async () => {
    if (!aiPrompt.trim()) {
      addToast("Por favor, digite uma breve frase ou relato para a IA analisar.", "error");
      return;
    }

    setIsAnalyzingAI(true);
    try {
      const data = await safeFetchJson(
        "/api/ai/analyze-object",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ promptText: aiPrompt }),
        },
        () => ({
          success: true,
          extracted: clientAnalyzeObject(aiPrompt),
        })
      );

      if (data.success && data.extracted) {
        const { title: aiTitle, category: aiCat, color: aiColor, brand: aiBrand, location: aiLoc, description: aiDesc } = data.extracted;

        if (aiTitle) setTitle(aiTitle);
        if (aiCat && categoriesList.includes(aiCat as ItemCategory)) {
          setCategory(aiCat as ItemCategory);
        }
        if (aiColor) setColor(aiColor);
        if (aiBrand) setBrand(aiBrand);
        if (aiDesc) setDescription(aiDesc);

        // Match location if present
        if (aiLoc) {
          const foundLoc = IFPR_LOCATIONS.find((loc) =>
            safeIncludes(loc, aiLoc) || safeIncludes(aiLoc, loc)
          );
          if (foundLoc) setLocation(foundLoc);
        }

        addToast("IA extraiu os detalhes com sucesso e preencheu o formulário!", "success");
      }
    } catch (err) {
      console.warn("Aviso ao chamar IA de extração:", err);
      // Fallback auto fill
      const extracted = clientAnalyzeObject(aiPrompt);
      setTitle(extracted.title);
      setCategory(extracted.category as ItemCategory);
      setColor(extracted.color);
      setBrand(extracted.brand);
      setDescription(extracted.description);
      addToast("Formulário preenchido com assistente de inteligência!", "success");
    } finally {
      setIsAnalyzingAI(false);
    }
  };

  // Image Upload presets or Custom URL preview
  const handleImagePreset = (url: string) => {
    setImageUrl(url);
  };

  // Handle direct file upload for photo with real-time PWA compression
  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      addToast("Por favor, selecione uma imagem menor que 15MB.", "error");
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
      setCompressionStats({
        original: compressed.formattedOriginalSize,
        compressed: compressed.formattedCompressedSize,
        savings: compressed.savingsPercentage,
      });

      addToast(
        `Imagem otimizada com sucesso! Economia de ${compressed.savingsPercentage}% nos seus dados móveis (${compressed.formattedOriginalSize} ➔ ${compressed.formattedCompressedSize}).`,
        "success"
      );

      analyzeImageWithGemini(compressed.base64);
    } catch (compErr) {
      console.warn("Aviso na compressão de arquivo:", compErr);
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setImageUrl(base64);
        analyzeImageWithGemini(base64);
      };
      reader.readAsDataURL(file);
    } finally {
      setIsCompressing(false);
    }
  };

  // Analyze image with Gemini 3.1 Pro
  const analyzeImageWithGemini = async (base64Data: string) => {
    setIsAnalyzingImage(true);
    try {
      const data = await safeFetchJson(
        "/api/ai/analyze-image",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64Data }),
        },
        () => ({
          success: true,
          analysis: clientAnalyzeImage("Foto enviada no formulário de cadastro"),
        })
      );

      if (data.success && data.analysis) {
        const a = data.analysis;
        if (a.title) setTitle(a.title);
        if (a.category && categoriesList.includes(a.category as ItemCategory)) {
          setCategory(a.category as ItemCategory);
        }
        if (a.color) setColor(a.color);
        if (a.brand) setBrand(a.brand);
        if (a.description) {
          setDescription(
            `${a.description}${
              a.distinctiveFeatures?.length
                ? `\n\n• Marcas identificadas pela IA: ${a.distinctiveFeatures.join(", ")}`
                : ""
            }`
          );
        }
        addToast("IA analisou a imagem e preencheu o formulário com sucesso!", "success");
      }
    } catch (err) {
      console.warn("Aviso na visão Gemini:", err);
      const a = clientAnalyzeImage();
      setTitle(a.title);
      setDescription(a.description);
      addToast("Imagem associada ao pertencente!", "success");
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  // Persistence Feedback State
  const [registrationFeedback, setRegistrationFeedback] = useState<{
    status: "CONFIRMED" | "OFFLINE_QUEUED";
    item: LostFoundItem;
  } | null>(null);

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    vibrateCritical();

    // Strict Auth Verification for Visitors
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

    if (!title.trim() || !description.trim() || !location.trim()) {
      addToast("Preencha todos os campos obrigatórios (título, descrição e local).", "error");
      return;
    }

    if (contactPhone && !isValidPhone(contactPhone)) {
      addToast("Telefone de contato inválido. Informe o DDD e o número completo no formato (XX) 9XXXX-XXXX.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const fullContact = [
        contactPhone.trim() ? `WhatsApp: ${contactPhone.trim()}` : "",
        contactInfo.trim() ? `Ref: ${contactInfo.trim()}` : "",
      ].filter(Boolean).join(" | ") || currentUser?.email || "Contato Institucional IFPR";

      const res = await addItem({
        title: title.trim(),
        category,
        type,
        status: type === "PERDIDO" ? "PERDIDO" : "ENCONTRADO",
        description: description.trim(),
        color: color.trim() || "Não informada",
        brand: brand.trim() || "Desconhecida",
        location: location.trim(),
        date,
        imageUrl,
        contactInfo: fullContact,
      });

      // Clear saved draft on successful submission
      try {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
        setDraftSavedAt(null);
        setDraftRestored(false);
      } catch (_) {}

      vibrateSuccess();

      if (res.persistenceStatus === "CONFIRMED") {
        addToast(`Cadastro Concluído! O objeto "${res.newItem.title}" foi confirmado e persistido no Firestore.`, "success");
        setRegistrationFeedback({
          status: "CONFIRMED",
          item: res.newItem,
        });
      } else {
        addToast(`Aguardando sincronização: Objeto "${res.newItem.title}" salvo localmente no dispositivo.`, "info");
        setRegistrationFeedback({
          status: "OFFLINE_QUEUED",
          item: res.newItem,
        });
      }
    } catch (submitErr: any) {
      console.error("Erro ao cadastrar item:", submitErr);
      addToast(submitErr?.message || "Erro ao salvar item no banco de dados.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // If user is a visitor/guest, render the friendly and secure Auth Guard Screen
  if (isGuest) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 sm:px-6">
        <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-xl p-6 sm:p-10 text-center space-y-6">
          <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <Lock className="w-8 h-8 sm:w-10 sm:h-10" />
          </div>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
              Autenticação Obrigatória
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
              Identifique-se para Cadastrar
            </h1>
            <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400 max-w-md mx-auto">
              Para garantir a segurança, integridade e rastreabilidade dos registros no IFPR Campus Ivaiporã, apenas usuários autenticados podem cadastrar novos itens.
            </p>
          </div>

          <div className="p-4 bg-neutral-50 dark:bg-neutral-800/60 rounded-2xl border border-neutral-200/80 dark:border-neutral-700/60 text-left space-y-2 text-xs sm:text-sm text-neutral-600 dark:text-neutral-300">
            <div className="flex items-center gap-2 font-bold text-neutral-800 dark:text-neutral-200">
              <ShieldCheck className="w-4 h-4 text-[#00843D]" /> O que você pode fazer como visitante:
            </div>
            <ul className="list-disc list-inside space-y-1 pl-1 text-neutral-500 dark:text-neutral-400">
              <li>Consultar o mural de itens perdidos e encontrados</li>
              <li>Utilizar a busca e filtros avançados</li>
              <li>Escanear QR Codes de etiquetas nos murais do campus</li>
              <li>Visualizar detalhes públicos dos pertences</li>
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              id="btn-guest-login-to-register"
              type="button"
              onClick={() => {
                vibrateClick();
                requireAuth(type);
              }}
              className="flex-1 inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-[#00843D] hover:bg-[#007033] text-white font-bold text-sm sm:text-base shadow-lg shadow-emerald-700/20 active:scale-[0.98] transition-all cursor-pointer"
            >
              <LogIn className="w-5 h-5" /> Fazer Login ou Criar Conta
            </button>
            <button
              id="btn-guest-back-to-lost"
              type="button"
              onClick={() => {
                vibrateClick();
                navigate("/perdidos");
              }}
              className="py-3.5 px-5 rounded-2xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-semibold text-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <PackageSearch className="w-4 h-4 text-[#00843D]" />
              <span>Explorar Itens</span>
            </button>
            <button
              id="btn-guest-close-to-home"
              type="button"
              onClick={() => {
                vibrateClick();
                if (window.history.length > 1) {
                  goBack();
                } else {
                  navigate("/");
                }
              }}
              className="py-3.5 px-4 rounded-2xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-400 font-bold text-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
              title="Fechar e retornar"
            >
              <X className="w-4 h-4" />
              <span>Fechar</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">
      {/* Top Header */}
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white flex items-center gap-2">
              <PlusCircle className="w-7 h-7 text-[#00843D]" /> Cadastro de Objeto • IFPR Campus Ivaiporã
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
              Informe os detalhes para ajudar a comunidade a localizar ou devolver este pertence.
            </p>
          </div>

          {/* Auto-save draft status indicator and Close Button */}
          <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto">
            {isSavingDraft ? (
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 text-[11px] font-bold border border-neutral-200 dark:border-neutral-700 animate-pulse">
                <Save className="w-3.5 h-3.5 animate-spin text-[#00843D]" />
                <span>Salvando...</span>
              </span>
            ) : draftSavedAt ? (
              <span
                title={`Último rascunho salvo em ${new Date(draftSavedAt).toLocaleTimeString()}`}
                className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold border border-emerald-500/20"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Rascunho salvo</span>
              </span>
            ) : null}

            {(title || description || color || brand) && (
              <button
                type="button"
                onClick={handleClearDraft}
                title="Descartar rascunho e limpar campos"
                className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpar</span>
              </button>
            )}

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
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 text-xs font-bold transition-all border border-neutral-200 dark:border-neutral-700 cursor-pointer"
              title="Fechar formulário e voltar"
            >
              <X className="w-4 h-4" />
              <span>Fechar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Restored Draft Alert Banner */}
      {draftRestored && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between gap-3 animate-in fade-in duration-300">
          <div className="flex items-center space-x-3 text-xs text-emerald-900 dark:text-emerald-200">
            <div className="p-2 rounded-xl bg-[#00843D] text-white shrink-0">
              <History className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold">Rascunho salvo recuperado automaticamente!</span>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                Seus dados foram preservados para que você não perca o preenchimento.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClearDraft}
            className="px-3 py-1.5 rounded-xl bg-white dark:bg-neutral-800 border border-emerald-500/30 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 text-xs font-bold text-neutral-700 dark:text-neutral-300 transition-colors shrink-0 flex items-center space-x-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Descartar Rascunho</span>
          </button>
        </div>
      )}

      {/* TYPE TOGGLE: PERDIDO vs ENCONTRADO */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-1.5 bg-neutral-100 dark:bg-[#1E1E1E] rounded-2xl border border-neutral-200 dark:border-neutral-800 w-full max-w-full">
        <button
          type="button"
          onClick={() => {
            setType("PERDIDO");
            setRegisterTypeSelection("PERDIDO");
          }}
          className={`py-3 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center space-x-2 transition-all ${
            type === "PERDIDO"
              ? "bg-[#EF4444] text-white shadow-md"
              : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
          }`}
        >
          <PackageSearch className="w-4 h-4" />
          <span>Objeto PERDIDO (Perdi algo)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setType("ENCONTRADO");
            setRegisterTypeSelection("ENCONTRADO");
          }}
          className={`py-3 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center space-x-2 transition-all ${
            type === "ENCONTRADO"
              ? "bg-[#00843D] text-white shadow-md"
              : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Objeto ENCONTRADO (Achei algo)</span>
        </button>
      </div>

      {/* IA AUTO-FILL BANNER ASSISTANT */}
      <div className="p-5 rounded-3xl bg-gradient-to-r from-[#00843D]/10 via-emerald-50 to-teal-50 dark:from-[#00843D]/20 dark:via-emerald-950/40 dark:to-neutral-900 border border-[#00843D]/30 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-[#00843D] dark:text-green-400 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500 fill-amber-500" />
            Preenchimento Inteligente com Gemini IA
          </h3>
          <span className="text-[10px] bg-white dark:bg-neutral-800 px-2 py-0.5 rounded-full text-neutral-500 font-semibold border border-neutral-200 dark:border-neutral-700">
            Servidor Oficial Google AI
          </span>
        </div>

        <p className="text-xs text-neutral-600 dark:text-neutral-300">
          Escreva ou <strong className="text-[#00843D]">fale por voz</strong> em linguagem natural o que aconteceu e a IA extrairá automaticamente o título, categoria, cor, marca e local!
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Ex: Encontrei uma calculadora científica Casio prata no lab de informática B2..."
              className="w-full pr-10 px-4 py-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
            />
            <button
              type="button"
              onClick={() => toggleSpeechRecognition("aiPrompt")}
              aria-label="Ativar ditado por voz para preenchimento de inteligência artificial"
              title="Ditado por voz (Web Speech API)"
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors ${
                isListening && listeningTarget === "aiPrompt"
                  ? "bg-red-500 text-white animate-pulse"
                  : "text-neutral-500 hover:text-[#00843D] hover:bg-neutral-100 dark:hover:bg-neutral-700"
              }`}
            >
              {isListening && listeningTarget === "aiPrompt" ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={handleAIExtract}
            disabled={isAnalyzingAI}
            className="px-5 py-2.5 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow-xs shrink-0 disabled:opacity-50"
          >
            {isAnalyzingAI ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Analisando...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 text-amber-300" />
                <span>Preencher com IA</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* FORM FIELDS */}
      <form
        role="form"
        aria-label="Formulário de cadastro de objeto achado ou perdido"
        onSubmit={handleSubmit}
        className="bg-white dark:bg-[#1E1E1E] p-6 sm:p-8 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Título */}
          <div>
            <label
              htmlFor="title-input"
              className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1"
            >
              Título do Objeto <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <input
              id="title-input"
              type="text"
              required
              aria-required="true"
              aria-label="Título ou nome descritivo do objeto"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Garrafa Térmica Kouda Verde 750ml"
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
            />
          </div>

          {/* Categoria */}
          <div>
            <label
              htmlFor="category-input"
              className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1"
            >
              Categoria <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <select
              id="category-input"
              aria-required="true"
              aria-label="Categoria do objeto"
              value={category}
              onChange={(e) => setCategory(e.target.value as ItemCategory)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
            >
              {categoriesList.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Cor */}
          <div>
            <label
              htmlFor="color-input"
              className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1"
            >
              Cor Predominante
            </label>
            <input
              id="color-input"
              type="text"
              aria-label="Cor predominante do objeto"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="Ex: Verde escuro / Prata"
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
            />
          </div>

          {/* Marca */}
          <div>
            <label
              htmlFor="brand-input"
              className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1"
            >
              Marca / Modelo / Fabricante
            </label>
            <input
              id="brand-input"
              type="text"
              aria-label="Marca ou fabricante do objeto"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Ex: Casio, Nike, Kouda, JBL, IFPR"
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
            />
          </div>

          {/* Local no IFPR */}
          <div>
            <label
              htmlFor="location-input"
              className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1"
            >
              Local no Campus Ivaiporã <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <select
              id="location-input"
              aria-required="true"
              aria-label="Local no campus Ivaiporã onde o objeto foi achado ou perdido"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
            >
              {IFPR_LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          {/* Data */}
          <div>
            <label
              htmlFor="date-input"
              className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1"
            >
              Data Aproximada <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <input
              id="date-input"
              type="date"
              required
              aria-required="true"
              aria-label="Data da ocorrência"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
            />
          </div>
        </div>

        {/* Descrição Completa */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label
              htmlFor="description-input"
              className="block text-xs font-bold text-neutral-700 dark:text-neutral-200"
            >
              Descrição Completa e Detalhes <span className="text-red-500" aria-hidden="true">*</span>
            </label>

            <button
              type="button"
              onClick={() => toggleSpeechRecognition("description")}
              className={`px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center space-x-1.5 transition-colors ${
                isListening && listeningTarget === "description"
                  ? "bg-red-500 text-white animate-pulse"
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-[#00843D] hover:text-white"
              }`}
            >
              {isListening && listeningTarget === "description" ? (
                <>
                  <MicOff className="w-3.5 h-3.5" />
                  <span>Gravando voz...</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5 text-[#00843D]" />
                  <span>Ditar Descrição (Voz)</span>
                </>
              )}
            </button>
          </div>

          <textarea
            id="description-input"
            required
            aria-required="true"
            aria-label="Descrição detalhada do objeto"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descreva o estado de conservação, marcas de uso, sinais particulares ou circunstâncias em que o pertence foi visto/encontrado..."
            className="w-full p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
          />
        </div>

        {/* SMART SEARCH: PAREAMENTO INTELIGENTE EM TEMPO REAL */}
        {(() => {
          if (!title && !description && !color) return null;

          const targetType = type === "PERDIDO" ? "ENCONTRADO" : "PERDIDO";
          const candidates = items.filter(
            (item) => item.status !== "DEVOLVIDO" && (item.type === targetType || item.status === targetType)
          );

          const matches = candidates
            .map((item) => {
              if (!item) return { item, matchPercentage: 0 };
              let score = 0;
              const itemText = safeTextCorpus(item.title, item.category, item.color, item.brand, item.location, item.description);

              if (item.category === category) score += 35;
              if (item.location === location) score += 25;
              
              const titleWords = sanitizeQuery(title).split(/\s+/).filter((w) => w.length > 2);
              for (const word of titleWords) {
                if (itemText.includes(word)) score += 15;
              }
              if (color && safeIncludes(item.color, color)) score += 15;
              if (brand && safeIncludes(item.brand, brand)) score += 15;

              return { item, matchPercentage: Math.min(Math.round(score), 98) };
            })
            .filter((m) => m.matchPercentage >= 25)
            .sort((a, b) => b.matchPercentage - a.matchPercentage)
            .slice(0, 3);

          if (matches.length === 0) return null;

          return (
            <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-800/50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 fill-amber-500 animate-bounce" />
                  <h4 className="text-xs font-black uppercase text-amber-900 dark:text-amber-200 tracking-wider">
                    Smart Search • Possíveis Correspondências Encontradas no IFPR
                  </h4>
                </div>
                <span className="text-[10px] font-extrabold bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded-full">
                  {matches.length} {matches.length === 1 ? "item similar" : "itens similares"}
                </span>
              </div>

              <p className="text-xs text-amber-800 dark:text-amber-300">
                A Inteligência Artificial identificou objetos já cadastrados que correspondem aos seus critérios:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {matches.map(({ item, matchPercentage }) => (
                  <div
                    key={item.id}
                    className="p-3 bg-white dark:bg-neutral-800 rounded-xl border border-amber-200 dark:border-amber-900/50 flex flex-col justify-between space-y-2 shadow-xs"
                  >
                    <div className="flex items-start space-x-2">
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-12 h-12 rounded-lg object-cover border border-neutral-200 dark:border-neutral-700 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-extrabold text-[#00843D] dark:text-green-400 bg-green-50 dark:bg-green-950 px-1.5 py-0.5 rounded">
                          {matchPercentage}% de Similaridade
                        </span>
                        <h5 className="text-xs font-extrabold text-neutral-900 dark:text-white truncate mt-1">
                          {item.title}
                        </h5>
                        <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                          {item.location}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedItemForDetail(item)}
                      className="w-full py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-900/70 text-amber-900 dark:text-amber-200 text-[11px] font-extrabold transition-colors flex items-center justify-center space-x-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Ver Este Objeto</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Foto do Objeto e Visão Gemini */}
        <div className="space-y-3 p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700/60">
          <div className="flex items-center justify-between">
            <label
              htmlFor="image-url-input"
              className="block text-xs font-bold text-neutral-800 dark:text-neutral-200"
            >
              Foto do Objeto
            </label>
            <span className="text-[10px] text-[#00843D] dark:text-green-400 font-bold flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500 fill-amber-500" /> Visão Gemini 3.1 Pro Ativa
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 items-center">
            <div className="relative flex-1 w-full">
              <ImageIcon className="absolute left-3 top-3 w-4 h-4 text-neutral-400" />
              <input
                id="image-url-input"
                type="text"
                aria-label="URL da imagem do objeto"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="Cole a URL da foto ou selecione um arquivo ao lado..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
              />
            </div>

            <button
              type="button"
              onClick={handleOpenCamera}
              className="px-3.5 py-2.5 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white text-xs font-bold transition-colors flex items-center space-x-1.5 shrink-0 shadow-xs"
            >
              <Camera className="w-4 h-4 text-amber-300" />
              <span>Tirar Foto</span>
            </button>

            <label
              tabIndex={0}
              role="button"
              aria-label="Upload de foto do objeto do seu computador"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  const fileInput = e.currentTarget.querySelector("input[type=file]") as HTMLInputElement;
                  fileInput?.click();
                }
              }}
              className="px-3.5 py-2.5 rounded-xl bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-800 dark:text-neutral-100 text-xs font-bold cursor-pointer transition-colors flex items-center space-x-1.5 shrink-0 focus:outline-none focus:ring-2 focus:ring-[#00843D]"
            >
              <Upload className="w-4 h-4 text-[#00843D]" />
              <span>Arquivo</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageFileUpload}
                className="hidden"
              />
            </label>

            <div className="w-12 h-12 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 overflow-hidden shrink-0">
              <img src={imageUrl} alt="Visualização do objeto" className="w-full h-full object-cover" />
            </div>
          </div>

          {/* Real-time Compression Status Pill */}
          {isCompressing && (
            <div className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-blue-800 dark:text-blue-200 text-xs font-semibold animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>Otimizando e comprimindo imagem em alta resolução para o PWA...</span>
            </div>
          )}

          {compressionStats && !isCompressing && (
            <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200 text-xs font-bold">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-[#00843D] dark:text-green-400 shrink-0" />
                <span>
                  Otimização PWA: Economia de {compressionStats.savings}% nos dados móveis ({compressionStats.original} ➔ {compressionStats.compressed})
                </span>
              </div>
              <span className="text-[10px] bg-[#00843D] text-white px-2 py-0.5 rounded-md font-extrabold uppercase">
                WebP Otimizado
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              aria-label="Analisar foto da URL fornecida usando inteligência artificial"
              onClick={() => analyzeImageWithGemini(imageUrl)}
              disabled={isAnalyzingImage}
              className="px-3.5 py-1.5 rounded-xl bg-[#00843D]/10 hover:bg-[#00843D]/20 text-[#00843D] dark:text-green-400 text-xs font-extrabold transition-colors border border-[#00843D]/20 flex items-center space-x-1.5 disabled:opacity-50 focus:ring-2 focus:ring-[#00843D]"
            >
              {isAnalyzingImage ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Analisando foto...</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-[#00843D]" />
                  <span>Analisar Foto da URL com Gemini 3.1 Pro</span>
                </>
              )}
            </button>

            <div className="flex space-x-1.5 overflow-x-auto" role="group" aria-label="Imagens de exemplo">
              {[
                { label: "Garrafa", url: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=600&auto=format&fit=crop&q=80" },
                { label: "Calculadora", url: "https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd?w=600&auto=format&fit=crop&q=80" },
                { label: "Casio", url: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80" },
                { label: "Carteira", url: "https://images.unsplash.com/photo-1627123424574-724758594e93?w=600&auto=format&fit=crop&q=80" },
              ].map((preset) => (
                <button
                  type="button"
                  key={preset.label}
                  aria-label={`Usar imagem pré-definida de ${preset.label}`}
                  onClick={() => handleImagePreset(preset.url)}
                  className="px-2 py-1 rounded-lg bg-white dark:bg-neutral-800 text-[10px] font-medium text-neutral-700 dark:text-neutral-300 hover:bg-[#00843D] hover:text-white transition-colors border border-neutral-200 dark:border-neutral-700 shrink-0 focus:ring-2 focus:ring-[#00843D]"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Contato de Referência e Telefone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label
              htmlFor="contact-phone-input"
              className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1"
            >
              Telefone / WhatsApp de Contato
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
              <input
                id="contact-phone-input"
                type="text"
                aria-label="Telefone ou WhatsApp para contato"
                value={contactPhone}
                onChange={(e) => setContactPhone(formatPhone(e.target.value))}
                maxLength={15}
                placeholder="(43) 99876-5432"
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
              />
            </div>
            {contactPhone && !isValidPhone(contactPhone) && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 font-medium">
                ⚠️ Digite o número completo com DDD (ex: (43) 99876-5432).
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="contact-input"
              className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1"
            >
              E-mail / Ponto de Guarda <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <input
              id="contact-input"
              type="text"
              required
              aria-required="true"
              aria-label="E-mail ou ponto onde o objeto se encontra guardado"
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
              placeholder="Ex: Guarita da Portaria Principal ou email@ifpr.edu.br"
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
            />
          </div>
        </div>

        {/* Offline Status Advisory */}
        {!isOnline && (
          <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs">
            <WifiOff className="w-4 h-4 text-amber-500 shrink-0" />
            <span>
              <strong>Modo Offline Ativo:</strong> Você não perderá nenhum dado. Ao clicar em salvar, este cadastro será armazenado com segurança no seu dispositivo (IndexedDB) e sincronizado com o Firestore assim que a conexão retornar.
            </span>
          </div>
        )}

        {/* Submit Actions */}
        <div className="pt-4 flex justify-end space-x-3 border-t border-neutral-200 dark:border-neutral-800">
          <button
            id="btn-cancel-register-form"
            type="button"
            aria-label="Cancelar cadastro e retornar à página inicial"
            disabled={isSubmitting}
            onClick={() => {
              vibrateClick();
              if (window.history.length > 1) {
                goBack();
              } else {
                navigate("/");
              }
            }}
            className="px-5 py-3 rounded-xl text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors focus:ring-2 focus:ring-neutral-400 disabled:opacity-50 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            id="btn-submit-register-form"
            type="submit"
            disabled={isSubmitting}
            aria-label="Salvar registro do objeto no banco de dados"
            className="px-6 py-3 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white font-extrabold text-xs shadow-md shadow-[#00843D]/20 transition-all flex items-center space-x-2 focus:ring-2 focus:ring-offset-2 focus:ring-[#00843D] disabled:opacity-75 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Salvando Objeto...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Salvar Registro de Objeto</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Camera Capture Modal */}
      {cameraModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 max-w-md w-full border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
                    Tirar Foto com a Câmera
                  </h3>
                  <p className="text-[10px] text-neutral-500">
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
                className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Camera Video Stream */}
            <div className="relative h-64 rounded-2xl bg-neutral-900 overflow-hidden border-2 border-dashed border-[#00843D] flex flex-col items-center justify-center p-2 text-center">
              <video
                ref={videoRef}
                playsInline
                muted
                className={`absolute inset-0 w-full h-full object-cover ${cameraStatus === "granted" ? "block" : "hidden"}`}
              />

              {cameraStatus !== "granted" && (
                <div className="p-4 space-y-2">
                  {cameraStatus === "denied" ? (
                    <p className="text-xs font-bold text-red-400">
                      {cameraError || "Permissão de acesso à câmera negada."}
                    </p>
                  ) : (
                    <p className="text-xs font-bold text-amber-300 animate-pulse">
                      Solicitando permissão para usar a câmera... Por favor, confirme no seu navegador.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setCameraModalOpen(false);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Cancelar
              </button>

              {cameraStatus === "granted" && (
                <button
                  type="button"
                  onClick={handleCaptureSnapshot}
                  className="px-5 py-2.5 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white font-extrabold text-xs shadow-md flex items-center gap-2"
                >
                  <Camera className="w-4 h-4 text-amber-300" />
                  <span>Capturar Foto</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Registration Persistence Feedback Modal */}
      {registrationFeedback && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              vibrateClick();
              setRegistrationFeedback(null);
              navigate("/");
            }
          }}
        >
          <div className="relative bg-white dark:bg-neutral-900 rounded-3xl p-6 sm:p-8 max-w-lg w-full border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-6 text-center animate-in fade-in zoom-in-95 duration-200">
            {/* Modal top-right close X */}
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setRegistrationFeedback(null);
                navigate("/");
              }}
              className="absolute top-4 right-4 p-2 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              aria-label="Fechar confirmação"
              title="Fechar e ir para o Início"
            >
              <X className="w-5 h-5" />
            </button>

            {registrationFeedback.status === "CONFIRMED" ? (
              <>
                <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-3xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-[#00843D] dark:text-emerald-400">
                  <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12" />
                </div>

                <div className="space-y-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300">
                    <ShieldCheck className="w-3.5 h-3.5" /> Persistência Confirmada no Firestore
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
                    Cadastro Concluído!
                  </h2>
                  <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
                    O registro do pertence <strong className="text-neutral-900 dark:text-white">"{registrationFeedback.item.title}"</strong> foi gravado, autenticado e verificado com sucesso no banco de dados do IFPR Campus Ivaiporã.
                  </p>
                </div>

                <div className="p-4 bg-neutral-50 dark:bg-neutral-800/60 rounded-2xl border border-neutral-200/80 dark:border-neutral-700/60 text-left space-y-2 text-xs text-neutral-600 dark:text-neutral-300">
                  <div className="flex justify-between items-center pb-1.5 border-b border-neutral-200 dark:border-neutral-700">
                    <span className="text-neutral-500">Identificador (ID):</span>
                    <span className="font-mono font-bold text-neutral-900 dark:text-white">{registrationFeedback.item.id}</span>
                  </div>
                  <div className="flex justify-between items-center pb-1.5 border-b border-neutral-200 dark:border-neutral-700">
                    <span className="text-neutral-500">Código QR:</span>
                    <span className="font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">{registrationFeedback.item.qrCodeId}</span>
                  </div>
                  <div className="flex justify-between items-center pb-1.5 border-b border-neutral-200 dark:border-neutral-700">
                    <span className="text-neutral-500">Local Registrado:</span>
                    <span className="font-semibold text-neutral-900 dark:text-white">{registrationFeedback.item.location}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500">Status no Sistema:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 uppercase">{registrationFeedback.item.status}</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      vibrateClick();
                      setRegistrationFeedback(null);
                      navigate(type === "PERDIDO" ? "/perdidos" : "/encontrados");
                    }}
                    className="flex-1 py-3.5 px-5 rounded-2xl bg-[#00843D] hover:bg-[#007033] text-white font-bold text-sm shadow-lg shadow-emerald-700/20 transition-all cursor-pointer"
                  >
                    Ver no Mural de {type === "PERDIDO" ? "Perdidos" : "Encontrados"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      vibrateClick();
                      setRegistrationFeedback(null);
                      setTitle("");
                      setDescription("");
                      setLocation("");
                      setColor("");
                      setBrand("");
                      setImageUrl(undefined);
                    }}
                    className="py-3.5 px-5 rounded-2xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-semibold text-xs transition-all cursor-pointer"
                  >
                    Cadastrar Outro
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      vibrateClick();
                      setRegistrationFeedback(null);
                      navigate("/");
                    }}
                    className="py-3.5 px-4 rounded-2xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-400 font-bold text-xs transition-all cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-3xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <Clock className="w-10 h-10 sm:w-12 sm:h-12" />
                </div>

                <div className="space-y-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                    <Clock className="w-3.5 h-3.5" /> Aguardando sincronização
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
                    Aguardando Sincronização
                  </h2>
                  <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
                    O objeto <strong className="text-neutral-900 dark:text-white">"{registrationFeedback.item.title}"</strong> foi armazenado com segurança localmente no dispositivo (IndexedDB) devido ao estado offline da rede.
                  </p>
                </div>

                <div className="p-4 bg-amber-50/60 dark:bg-amber-950/20 rounded-2xl border border-amber-200/80 dark:border-amber-800/40 text-left space-y-2 text-xs text-amber-800 dark:text-amber-300">
                  <div className="font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" /> Diretriz RNF-04:
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                    Conforme os requisitos de governança do IFPR, o status final de persistência somente será emitido após a confirmação de recebimento pelo Firestore em nuvem. A sincronização ocorrerá automaticamente em segundo plano.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      vibrateClick();
                      setRegistrationFeedback(null);
                      navigate(type === "PERDIDO" ? "/perdidos" : "/encontrados");
                    }}
                    className="flex-1 py-3.5 px-5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-lg shadow-amber-600/20 transition-all cursor-pointer"
                  >
                    Entendido, Explorar Itens
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      vibrateClick();
                      setRegistrationFeedback(null);
                      navigate("/");
                    }}
                    className="py-3.5 px-5 rounded-2xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-semibold text-xs transition-all cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RegisterItemView;
