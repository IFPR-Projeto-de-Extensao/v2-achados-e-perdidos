import React, { useState, useRef } from "react";
import { useApp } from "../context/AppContext";
import { ItemCategory, LostFoundItem } from "../types";
import { auth } from "../lib/firebase";
import { localize, translateCategory, translateColor } from "../lib/i18n";
import {
  Sparkles,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  Loader2,
  Search,
  PlusCircle,
  ShieldCheck,
  Tag,
  Eye,
  ArrowRight,
  Camera,
  X,
} from "lucide-react";

interface AIAnalysisResult {
  title: string;
  category: ItemCategory | string;
  color: string;
  brand: string;
  condition: string;
  distinctiveFeatures: string[];
  suggestedSecretHint: string;
  description: string;
}

export const ImageAnalyzerView: React.FC = () => {
  const {
    items,
    setPrefilledItemFromAI,
    setSelectedItemForDetail,
    addToast,
    requestAuthForRegistration,
    language,
  } = useApp();
  const l = (pt: string, en: string) => localize(language, pt, en);

  const [selectedImage, setSelectedImage] = useState<string>(
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80"
  );
  const [customContext, setCustomContext] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null);
  const [databaseMatches, setDatabaseMatches] = useState<
    { item: LostFoundItem; score: number; reason: string }[]
  >([]);
  const [isSearchingDb, setIsSearchingDb] = useState(false);

  // Camera Capture & Permission States
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
        throw new Error(l("Seu navegador não possui suporte a acesso de mídia.", "Your browser does not support media access."));
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
      addToast(
        l("Acesso à câmera liberado! Fotografe o pertence.", "Camera access granted! Take a photo of the item."),
        "success"
      );
    } catch (err: any) {
      console.error("Erro ao solicitar acesso à câmera:", err);
      setCameraStatus("denied");
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setCameraError(
          l(
            "Permissão de acesso à câmera negada. Habilite a permissão no navegador para fotografar o objeto.",
            "Camera permission denied. Enable camera access in your browser to photograph the item."
          )
        );
      } else {
        setCameraError(l("Erro ao iniciar dispositivo de câmera.", "Error starting camera device."));
      }
      addToast(l("Erro ao solicitar acesso à câmera.", "Error requesting camera access."), "error");
    }
  };

  const handleCaptureSnapshot = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      setSelectedImage(dataUrl);
      setAnalysis(null);
      setDatabaseMatches([]);
      addToast(
        l("Foto capturada da câmera com sucesso!", "Photo captured from camera successfully!"),
        "success"
      );
      stopCamera();
      setCameraModalOpen(false);
    }
  };

  // File drag & drop or upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 8 * 1024 * 1024) {
        addToast(
          l("Por favor, selecione uma imagem menor que 8MB.", "Please select an image smaller than 8MB."),
          "error"
        );
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
        setAnalysis(null);
        setDatabaseMatches([]);
      };
      reader.readAsDataURL(file);
    }
  };

  // Preset sample images
  const sampleImages = [
    {
      label: l("Relógio Casio", "Casio Watch"),
      url: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80",
    },
    {
      label: l("Garrafa Térmica", "Insulated Bottle"),
      url: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800&auto=format&fit=crop&q=80",
    },
    {
      label: l("Calculadora", "Calculator"),
      url: "https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd?w=800&auto=format&fit=crop&q=80",
    },
    {
      label: l("Carteira de Couro", "Leather Wallet"),
      url: "https://images.unsplash.com/photo-1627123424574-724758594e93?w=800&auto=format&fit=crop&q=80",
    },
    {
      label: l("Casaco / Moletom", "Jacket / Hoodie"),
      url: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&auto=format&fit=crop&q=80",
    },
    {
      label: l("Chaves com Chaveiro", "Keys with Keychain"),
      url: "https://images.unsplash.com/photo-1582139329536-e7284fece509?w=800&auto=format&fit=crop&q=80",
    },
  ];

  // Call Gemini 3.1 Pro Preview Image Analysis Endpoint
  const handleAnalyzeImage = async () => {
    if (!selectedImage) {
      addToast(l("Selecione ou envie uma foto para analisar.", "Select or upload a photo to analyze."), "error");
      return;
    }

    if (!auth.currentUser) {
      addToast(
        l(
          "Faça login com sua conta institucional para analisar fotos com o Gemini.",
          "Sign in with your institutional account to analyze photos with Gemini."
        ),
        "error"
      );
      return;
    }

    setIsAnalyzing(true);
    setAnalysis(null);
    setDatabaseMatches([]);

    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/api/ai/analyze-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          imageBase64: selectedImage,
          customContext,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.error ||
            l(
              `Erro ${res.status}: Falha ao analisar foto com Gemini.`,
              `Error ${res.status}: Failed to analyze photo with Gemini.`
            )
        );
      }

      if (data.success && data.analysis) {
        setAnalysis(data.analysis);
        addToast(
          l(
            "Foto analisada com sucesso pela Inteligência Artificial Gemini!",
            "Photo analyzed successfully by Gemini Artificial Intelligence!"
          ),
          "success"
        );

        // Automatically trigger a database check in background
        performDbMatching(data.analysis);
      } else {
        throw new Error(
          l(
            "Não foi possível extrair dados da imagem via Gemini.",
            "Could not extract image details via Gemini."
          )
        );
      }
    } catch (err: any) {
      console.error("Erro ao analisar foto:", err);
      addToast(
        err.message || l("Falha na análise da imagem pelo Gemini.", "Image analysis failed via Gemini."),
        "error"
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Perform database match using AI analysis result
  const performDbMatching = async (analyzedData: AIAnalysisResult) => {
    if (!items || items.length === 0) return;
    if (!auth.currentUser) return;
    setIsSearchingDb(true);

    try {
      const candidateList = items.map((it) => ({
        id: it.id,
        title: it.title,
        category: it.category,
        color: it.color,
        brand: it.brand,
        location: it.location,
        description: it.description,
        type: it.type,
      }));

      const newItemObj = {
        title: analyzedData.title,
        category: analyzedData.category as ItemCategory,
        color: analyzedData.color,
        brand: analyzedData.brand,
        location: "Campus IFPR",
        description: analyzedData.description,
        type: "ENCONTRADO" as const,
      };

      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/api/ai/match-similarity", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          newItem: newItemObj,
          candidateItems: candidateList,
        }),
      });

      const matchRes = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn("Aviso na busca por similaridade Gemini:", matchRes.error);
        return;
      }

      if (matchRes.matches && matchRes.matches.length > 0) {
        const enriched = matchRes.matches
          .map((m: any) => {
            const foundItem = items.find((it) => it.id === (m.itemId || m.matchedItem?.id));
            if (!foundItem) return null;
            return {
              item: foundItem,
              score: m.matchScore,
              reason: m.reason,
            };
          })
          .filter(Boolean);

        setDatabaseMatches(enriched);
      }
    } catch (e) {
      console.error("Erro no cruzamento de banco:", e);
    } finally {
      setIsSearchingDb(false);
    }
  };

  // Proceed to registration with prefilled data
  const handleProceedToRegistration = () => {
    if (!analysis) return;

    const prefilledData = {
      title: analysis.title,
      category: (analysis.category as ItemCategory) || "Outros",
      color: analysis.color,
      brand: analysis.brand,
      description: `${analysis.description}\n\n🔍 [${l("Análise de Visão Gemini 3.1 Pro", "Gemini 3.1 Pro Vision Analysis")}]\n• ${l("Estado", "Condition")}: ${analysis.condition}\n• ${l("Marcas identificadas", "Identified marks")}: ${analysis.distinctiveFeatures.join(", ")}`,
      imageUrl: selectedImage,
    };

    setPrefilledItemFromAI(prefilledData);
    requestAuthForRegistration(
      "ENCONTRADO",
      prefilledData,
      l(
        "Faça login para cadastrar o objeto analisado pela IA.",
        "Sign in to register the AI-analyzed item."
      )
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16">
      {/* Top Banner Header */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-neutral-900 via-[#181818] to-emerald-950 text-white relative overflow-hidden shadow-lg border border-emerald-900/30">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#00843D]/20 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

        <div className="relative z-10 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-[#00843D] text-white text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
              Gemini 3.1 Pro Preview
            </span>
            <span className="px-3 py-1 rounded-full bg-white/10 text-emerald-300 text-[11px] font-bold border border-white/10">
              {l("Visão Computacional e Multimodal", "Computer Vision & Multimodal")}
            </span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-black tracking-tight">
            {l("Analisador Inteligente de Fotos de Objetos", "Smart Item Photo Analyzer")}
          </h1>
          <p className="text-xs sm:text-sm text-neutral-300 max-w-2xl leading-relaxed">
            {l(
              "Envie uma fotografia de qualquer pertence encontrado ou perdido no IFPR Campus Ivaiporã. A Inteligência Artificial do Google analisa cores, marcas, arranhões, adesivos e sugere a descrição completa e a pista secreta de verificação.",
              "Upload a photo of any lost or found item at IFPR Campus Ivaiporã. Google AI analyzes colors, brands, scratches, stickers, and suggests a complete description and secret verification hint."
            )}
          </p>
        </div>
      </div>

      {/* Main Grid: Upload & Preview Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Image Selection & Controls (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white dark:bg-[#1E1E1E] p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-5">
            <h2 className="text-sm font-black uppercase tracking-wider text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-[#00843D]" />
              {l("1. Selecionar Fotografia", "1. Select Photo")}
            </h2>

            {/* Image Preview Box */}
            <div className="relative aspect-4/3 rounded-2xl overflow-hidden bg-neutral-100 dark:bg-neutral-900 border-2 border-dashed border-neutral-300 dark:border-neutral-700 group">
              <img
                src={selectedImage}
                alt={l("Objeto para análise", "Item for analysis")}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />

              {/* Scanning Overlay Effect when analyzing */}
              {isAnalyzing && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center space-y-3 p-4 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-[#00843D] text-white flex items-center justify-center animate-bounce shadow-lg">
                    <Sparkles className="w-6 h-6 text-amber-300 fill-amber-300" />
                  </div>
                  <p className="text-xs font-bold text-white">
                    {l("Gemini 3.1 Pro analisando detalhes visuais...", "Gemini 3.1 Pro analyzing visual details...")}
                  </p>
                  <div className="w-32 h-1.5 bg-neutral-700 rounded-full overflow-hidden">
                    <div className="h-full bg-[#00843D] animate-pulse w-full" />
                  </div>
                </div>
              )}
            </div>

            {/* Upload File or Capture Camera Input */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300">
                {l("Enviar Arquivo ou Tirar Foto com a Câmera:", "Upload File or Take a Photo with Camera:")}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleOpenCamera}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl bg-[#00843D] hover:bg-[#006e33] text-white text-xs font-bold cursor-pointer transition-colors shadow-xs"
                >
                  <Camera className="w-4 h-4 text-amber-300" />
                  <span>{l("Tirar Foto (Câmera)", "Take Photo (Camera)")}</span>
                </button>

                <label className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 text-xs font-bold cursor-pointer transition-colors border border-neutral-200 dark:border-neutral-700">
                  <Upload className="w-4 h-4 text-[#00843D]" />
                  <span>{l("Escolher Arquivo", "Choose File")}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Sample Images Shortcuts */}
            <div>
              <label className="block text-[11px] font-bold text-neutral-500 mb-2">
                {l("Ou escolha um exemplo pronto:", "Or choose a ready-made sample:")}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {sampleImages.map((s) => (
                  <button
                    key={s.url}
                    onClick={() => {
                      setSelectedImage(s.url);
                      setAnalysis(null);
                      setDatabaseMatches([]);
                    }}
                    className={`p-2 rounded-xl border text-[10px] font-bold truncate transition-all text-center ${
                      selectedImage === s.url
                        ? "border-[#00843D] bg-[#00843D]/10 text-[#00843D] dark:text-green-400"
                        : "border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 text-neutral-600 dark:text-neutral-400 hover:border-neutral-400"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Context Field */}
            <div>
              <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                {l("Contexto Adicional (Opcional):", "Additional Context (Optional):")}
              </label>
              <input
                type="text"
                value={customContext}
                onChange={(e) => setCustomContext(e.target.value)}
                placeholder={l(
                  "Ex: Encontrado perto dos armários do Bloco B...",
                  "e.g. Found near the Block B lockers..."
                )}
                className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
              />
            </div>

            {/* Analyze Action Button */}
            <button
              onClick={handleAnalyzeImage}
              disabled={isAnalyzing}
              className="w-full py-3.5 rounded-2xl bg-[#00843D] hover:bg-[#006e33] text-white font-extrabold text-xs shadow-md shadow-[#00843D]/20 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{l("Processando Visão de IA...", "Processing AI Vision...")}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300 fill-amber-300" />
                  <span>{l("Analisar Foto com Gemini 3.1 Pro", "Analyze Photo with Gemini 3.1 Pro")}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Analysis Results Display (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {!analysis && !isAnalyzing && (
            <div className="bg-white dark:bg-[#1E1E1E] p-10 rounded-3xl border border-neutral-200 dark:border-neutral-800 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-[#00843D] dark:text-green-400 flex items-center justify-center mx-auto">
                <Eye className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto space-y-2">
                <h3 className="text-base font-extrabold text-neutral-800 dark:text-neutral-100">
                  {l("Nenhuma análise iniciada", "No analysis started yet")}
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                  {l("Escolha uma foto ao lado e clique em ", "Choose a photo on the left and click ")}
                  <strong className="text-[#00843D]">
                    {l('"Analisar Foto com Gemini 3.1 Pro"', '"Analyze Photo with Gemini 3.1 Pro"')}
                  </strong>{" "}
                  {l(
                    "para extrair características visuais, marcas de uso e gerar a descrição automática do pertence.",
                    "to extract visual features, wear marks, and generate an automatic item description."
                  )}
                </p>
              </div>
            </div>
          )}

          {isAnalyzing && (
            <div className="bg-white dark:bg-[#1E1E1E] p-10 rounded-3xl border border-neutral-200 dark:border-neutral-800 text-center space-y-4">
              <Loader2 className="w-10 h-10 text-[#00843D] animate-spin mx-auto" />
              <h3 className="text-sm font-extrabold text-neutral-800 dark:text-neutral-100">
                {l("Aguarde... Processando foto com Gemini 3.1 Pro", "Please wait... Processing photo with Gemini 3.1 Pro")}
              </h3>
              <p className="text-xs text-neutral-500">
                {l(
                  "Identificando objetos, esquema de cores, marcas e características únicas de segurança...",
                  "Identifying objects, color scheme, brands, and unique security features..."
                )}
              </p>
            </div>
          )}

          {analysis && (
            <div className="space-y-6">
              {/* Main Analysis Output Card */}
              <div className="bg-white dark:bg-[#1E1E1E] p-6 sm:p-8 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100 dark:border-neutral-800 pb-4">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-[#00843D]/10 text-[#00843D] dark:text-green-400 text-[10px] font-black uppercase tracking-wider border border-[#00843D]/20">
                        {translateCategory(analysis.category, language)}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-[10px] font-bold">
                        {analysis.condition}
                      </span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-neutral-900 dark:text-white mt-1">
                      {analysis.title}
                    </h2>
                  </div>

                  <button
                    onClick={handleProceedToRegistration}
                    className="px-4 py-2 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white text-xs font-bold shadow-sm transition-all flex items-center space-x-1.5"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>{l("Usar no Cadastro", "Use in Registration")}</span>
                  </button>
                </div>

                {/* Key Attributes Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/60 dark:border-neutral-800">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase block mb-0.5">
                      {l("Cor Predominante", "Predominant Color")}
                    </span>
                    <span className="text-xs font-black text-neutral-800 dark:text-neutral-100">
                      {translateColor(analysis.color, language)}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/60 dark:border-neutral-800">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase block mb-0.5">
                      {l("Marca / Fabricante", "Brand / Manufacturer")}
                    </span>
                    <span className="text-xs font-black text-neutral-800 dark:text-neutral-100">
                      {analysis.brand}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/60 dark:border-neutral-800 col-span-2 sm:col-span-1">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase block mb-0.5">
                      {l("Estado de Conservação", "Condition")}
                    </span>
                    <span className="text-xs font-black text-neutral-800 dark:text-neutral-100 truncate block">
                      {analysis.condition}
                    </span>
                  </div>
                </div>

                {/* Distinctive Features */}
                {analysis.distinctiveFeatures && analysis.distinctiveFeatures.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-[#00843D]" />
                      {l("Detecções Únicas e Marcas Identificadas:", "Unique Detections & Identified Marks:")}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {analysis.distinctiveFeatures.map((feat, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs font-semibold border border-emerald-200 dark:border-emerald-800/50 flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3 h-3 text-[#00843D]" />
                          {feat}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suggested Secret Hint for Claim Verification */}
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-1">
                  <span className="text-[11px] font-black uppercase text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    {l("Sugestão de Pista Secreta para Comprovação:", "Suggested Secret Hint for Ownership Verification:")}
                  </span>
                  <p className="text-xs text-amber-900 dark:text-amber-200 font-medium">
                    "{analysis.suggestedSecretHint}"
                  </p>
                </div>

                {/* Full Description */}
                <div className="space-y-1">
                  <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    {l("Descrição Detalhada Gerada:", "Generated Detailed Description:")}
                  </span>
                  <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed bg-neutral-50 dark:bg-neutral-800/40 p-3.5 rounded-2xl border border-neutral-200 dark:border-neutral-800">
                    {analysis.description}
                  </p>
                </div>
              </div>

              {/* Database Similarity Search Results */}
              <div className="bg-white dark:bg-[#1E1E1E] p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                    <Search className="w-4 h-4 text-[#00843D]" />
                    {l("Cruzamento de Dados com Banco de Registros IFPR", "Cross-Check with IFPR Records Database")}
                  </h3>
                  {isSearchingDb && (
                    <span className="text-xs text-neutral-400 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> {l("Buscando...", "Searching...")}
                    </span>
                  )}
                </div>

                {databaseMatches.length === 0 ? (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 py-2">
                    {l(
                      "Nenhum objeto idêntico com pontuação alta encontrado no banco até o momento. Você pode prosseguir com o novo cadastro.",
                      "No identical item with a high score was found in the database so far. You may proceed with registering a new item."
                    )}
                  </p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                      {l(
                        `A IA encontrou ${databaseMatches.length} possível(is) correspondência(s) no sistema:`,
                        `AI found ${databaseMatches.length} possible match(es) in the system:`
                      )}
                    </p>
                    <div className="space-y-2">
                      {databaseMatches.map(({ item, score, reason }) => (
                        <div
                          key={item.id}
                          onClick={() => setSelectedItemForDetail(item)}
                          className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:border-[#00843D] cursor-pointer transition-all flex items-center justify-between gap-3 group"
                        >
                          <div className="flex items-center space-x-3 min-w-0">
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              className="w-12 h-12 rounded-xl object-cover shrink-0"
                            />
                            <div className="min-w-0">
                              <span
                                className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                                  item.type === "PERDIDO"
                                    ? "bg-red-500/10 text-red-500"
                                    : "bg-emerald-500/10 text-emerald-500"
                                }`}
                              >
                                {item.type === "PERDIDO" ? l("PERDIDO", "LOST") : l("ENCONTRADO", "FOUND")}
                              </span>
                              <h4 className="text-xs font-bold text-neutral-900 dark:text-white truncate mt-0.5">
                                {item.title}
                              </h4>
                              <p className="text-[11px] text-neutral-500 truncate">{reason}</p>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-xs font-black text-[#00843D] dark:text-green-400 block">
                              {l(`${score}% Similar`, `${score}% Match`)}
                            </span>
                            <span className="text-[10px] text-neutral-400 flex items-center justify-end gap-0.5 group-hover:text-[#00843D]">
                              {l("Ver Detalhes", "View Details")} <ArrowRight className="w-3 h-3" />
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

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
                    {l("Fotografar Objeto via Câmera", "Photograph Item via Camera")}
                  </h3>
                  <p className="text-[10px] text-neutral-500">
                    {l("Posicione o pertence e capture para análise Gemini IA", "Position the item and capture for Gemini AI analysis")}
                  </p>
                </div>
              </div>

              <button
                type="button"
                aria-label={l("Fechar câmera", "Close camera")}
                onClick={() => {
                  stopCamera();
                  setCameraModalOpen(false);
                }}
                className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Camera Frame */}
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
                      {cameraError || l("Permissão de acesso à câmera negada.", "Camera access permission denied.")}
                    </p>
                  ) : (
                    <p className="text-xs font-bold text-amber-300 animate-pulse">
                      {l(
                        "Solicitando permissão para usar a câmera... Aceite a solicitação no topo da tela.",
                        "Requesting camera permission... Accept the prompt at the top of the screen."
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setCameraModalOpen(false);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                {l("Cancelar", "Cancel")}
              </button>

              {cameraStatus === "granted" && (
                <button
                  type="button"
                  onClick={handleCaptureSnapshot}
                  className="px-5 py-2.5 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white font-extrabold text-xs shadow-md flex items-center gap-2"
                >
                  <Camera className="w-4 h-4 text-amber-300" />
                  <span>{l("Capturar e Analisar Foto", "Capture & Analyze Photo")}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageAnalyzerView;
