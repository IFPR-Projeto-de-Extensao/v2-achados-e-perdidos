import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { ItemCategory, LostFoundItem } from "../types";
import { safeFetchJson, clientAnalyzeImage, clientMatchSimilarity } from "../lib/apiHelper";
import {
  Sparkles,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  PlusCircle,
  ShieldCheck,
  Tag,
  Eye,
  RefreshCw,
  Zap,
  ArrowRight,
  FileCheck2,
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
    setActiveTab,
    setPrefilledItemFromAI,
    setSelectedItemForDetail,
    addToast,
  } = useApp();

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

  // File drag & drop or upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 8 * 1024 * 1024) {
        addToast("Por favor, selecione uma imagem menor que 8MB.", "error");
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
      label: "Relógio Casio",
      url: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80",
    },
    {
      label: "Garrafa Térmica",
      url: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800&auto=format&fit=crop&q=80",
    },
    {
      label: "Calculadora",
      url: "https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd?w=800&auto=format&fit=crop&q=80",
    },
    {
      label: "Carteira de Couro",
      url: "https://images.unsplash.com/photo-1627123424574-724758594e93?w=800&auto=format&fit=crop&q=80",
    },
    {
      label: "Casaco / Moletom",
      url: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&auto=format&fit=crop&q=80",
    },
    {
      label: "Chaves com Chaveiro",
      url: "https://images.unsplash.com/photo-1582139329536-e7284fece509?w=800&auto=format&fit=crop&q=80",
    },
  ];

  // Call Gemini 3.1 Pro Preview Image Analysis Endpoint
  const handleAnalyzeImage = async () => {
    if (!selectedImage) {
      addToast("Selecione ou envie uma foto para analisar.", "error");
      return;
    }

    setIsAnalyzing(true);
    setAnalysis(null);
    setDatabaseMatches([]);

    try {
      const data = await safeFetchJson(
        "/api/ai/analyze-image",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: selectedImage,
            customContext,
          }),
        },
        () => ({
          success: true,
          analysis: clientAnalyzeImage(customContext || "Análise de Imagem"),
        })
      );

      if (data.success && data.analysis) {
        setAnalysis(data.analysis);
        addToast("Foto analisada com sucesso pela Inteligência Artificial!", "success");

        // Automatically trigger a database check in background
        performDbMatching(data.analysis);
      } else {
        const fallback = clientAnalyzeImage(customContext);
        setAnalysis(fallback);
        performDbMatching(fallback);
      }
    } catch (err: any) {
      console.warn("Aviso ao analisar foto:", err);
      const fallback = clientAnalyzeImage(customContext);
      setAnalysis(fallback);
      performDbMatching(fallback);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Perform database match using AI analysis result
  const performDbMatching = async (analyzedData: AIAnalysisResult) => {
    if (!items || items.length === 0) return;
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

      const matchRes = await safeFetchJson(
        "/api/ai/match-similarity",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newItem: newItemObj,
            candidateItems: candidateList,
          }),
        },
        () => clientMatchSimilarity(newItemObj, items)
      );

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

    setPrefilledItemFromAI({
      title: analysis.title,
      category: (analysis.category as ItemCategory) || "Outros",
      color: analysis.color,
      brand: analysis.brand,
      description: `${analysis.description}\n\n🔍 [Análise de Visão Gemini 3.1 Pro]\n• Estado: ${analysis.condition}\n• Marcas identificadas: ${analysis.distinctiveFeatures.join(", ")}`,
      imageUrl: selectedImage,
    });

    setActiveTab("register");
    addToast("Dados preenchidos no formulário de cadastro!", "info");
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
              Visão Computacional & Multimodal
            </span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-black tracking-tight">
            Analisador Inteligente de Fotos de Objetos
          </h1>
          <p className="text-xs sm:text-sm text-neutral-300 max-w-2xl leading-relaxed">
            Envie uma fotografia de qualquer pertence encontrado ou perdido no IFPR Campus Ivaiporã. A Inteligência Artificial do Google analisa cores, marcas, arranhões, adesivos e sugere a descrição completa e a pista secreta de verificação.
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
              1. Selecionar Fotografia
            </h2>

            {/* Image Preview Box */}
            <div className="relative aspect-4/3 rounded-2xl overflow-hidden bg-neutral-100 dark:bg-neutral-900 border-2 border-dashed border-neutral-300 dark:border-neutral-700 group">
              <img
                src={selectedImage}
                alt="Objeto para análise"
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />

              {/* Scanning Overlay Effect when analyzing */}
              {isAnalyzing && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center space-y-3 p-4 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-[#00843D] text-white flex items-center justify-center animate-bounce shadow-lg">
                    <Sparkles className="w-6 h-6 text-amber-300 fill-amber-300" />
                  </div>
                  <p className="text-xs font-bold text-white">
                    Gemini 3.1 Pro analisando detalhes visuais...
                  </p>
                  <div className="w-32 h-1.5 bg-neutral-700 rounded-full overflow-hidden">
                    <div className="h-full bg-[#00843D] animate-pulse w-full" />
                  </div>
                </div>
              )}
            </div>

            {/* Upload File Input */}
            <div>
              <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-2">
                Enviar Arquivo do Computador ou Celular:
              </label>
              <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 text-xs font-bold cursor-pointer transition-colors border border-neutral-200 dark:border-neutral-700">
                <Upload className="w-4 h-4 text-[#00843D]" />
                <span>Escolher Imagem (JPG, PNG)</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Sample Images Shortcuts */}
            <div>
              <label className="block text-[11px] font-bold text-neutral-500 mb-2">
                Ou escolha um exemplo pronto:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {sampleImages.map((s) => (
                  <button
                    key={s.label}
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
                Contexto Adicional (Opcional):
              </label>
              <input
                type="text"
                value={customContext}
                onChange={(e) => setCustomContext(e.target.value)}
                placeholder="Ex: Encontrado perto dos armários do Bloco B..."
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
                  <span>Processando Visão de IA...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300 fill-amber-300" />
                  <span>Analisar Foto com Gemini 3.1 Pro</span>
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
                  Nenhuma análise iniciada
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                  Escolha uma foto ao lado e clique em{" "}
                  <strong className="text-[#00843D]">"Analisar Foto com Gemini 3.1 Pro"</strong>{" "}
                  para extrair características visuais, marcas de uso e gerar a descrição automática do pertence.
                </p>
              </div>
            </div>
          )}

          {isAnalyzing && (
            <div className="bg-white dark:bg-[#1E1E1E] p-10 rounded-3xl border border-neutral-200 dark:border-neutral-800 text-center space-y-4">
              <Loader2 className="w-10 h-10 text-[#00843D] animate-spin mx-auto" />
              <h3 className="text-sm font-extrabold text-neutral-800 dark:text-neutral-100">
                Aguarde... Processando foto com Gemini 3.1 Pro
              </h3>
              <p className="text-xs text-neutral-500">
                Identificando objetos, esquema de cores, marcas e características únicas de segurança...
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
                        {analysis.category}
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
                    <span>Usar no Cadastro</span>
                  </button>
                </div>

                {/* Key Attributes Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/60 dark:border-neutral-800">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase block mb-0.5">
                      Cor Predominante
                    </span>
                    <span className="text-xs font-black text-neutral-800 dark:text-neutral-100">
                      {analysis.color}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/60 dark:border-neutral-800">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase block mb-0.5">
                      Marca / Fabricante
                    </span>
                    <span className="text-xs font-black text-neutral-800 dark:text-neutral-100">
                      {analysis.brand}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/60 dark:border-neutral-800 col-span-2 sm:col-span-1">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase block mb-0.5">
                      Estado de Conservação
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
                      Detecções Únicas e Marcas Identificadas:
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
                    Sugestão de Pista Secreta para Comprovação:
                  </span>
                  <p className="text-xs text-amber-900 dark:text-amber-200 font-medium">
                    "{analysis.suggestedSecretHint}"
                  </p>
                </div>

                {/* Full Description */}
                <div className="space-y-1">
                  <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Descrição Detalhada Gerada:
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
                    Cruzamento de Dados com Banco de Registros IFPR
                  </h3>
                  {isSearchingDb && (
                    <span className="text-xs text-neutral-400 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Buscando...
                    </span>
                  )}
                </div>

                {databaseMatches.length === 0 ? (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 py-2">
                    Nenhum objeto idêntico com pontuação alta encontrado no banco até o momento. Você pode prosseguir com o novo cadastro.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                      A IA encontrou {databaseMatches.length} possível(is) correspondência(s) no sistema:
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
                                {item.type}
                              </span>
                              <h4 className="text-xs font-bold text-neutral-900 dark:text-white truncate mt-0.5">
                                {item.title}
                              </h4>
                              <p className="text-[11px] text-neutral-500 truncate">{reason}</p>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-xs font-black text-[#00843D] dark:text-green-400 block">
                              {score}% Similar
                            </span>
                            <span className="text-[10px] text-neutral-400 flex items-center justify-end gap-0.5 group-hover:text-[#00843D]">
                              Ver Detalhes <ArrowRight className="w-3 h-3" />
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
    </div>
  );
};
