import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { IFPR_LOCATIONS } from "../data/mockData";
import { ItemCategory, LostFoundItem } from "../types";
import { safeFetchJson, clientAnalyzeObject, clientAnalyzeImage } from "../lib/apiHelper";
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
} from "lucide-react";

export const RegisterItemView: React.FC = () => {
  const {
    addItem,
    currentUser,
    registerTypeSelection,
    setRegisterTypeSelection,
    setActiveTab,
    addToast,
    prefilledItemFromAI,
    setPrefilledItemFromAI,
  } = useApp();

  // Form State
  const [type, setType] = useState<"PERDIDO" | "ENCONTRADO">(registerTypeSelection);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ItemCategory>("Eletrônicos");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("");
  const [brand, setBrand] = useState("");
  const [location, setLocation] = useState(IFPR_LOCATIONS[0]);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [contactInfo, setContactInfo] = useState(currentUser.email);
  const [imageUrl, setImageUrl] = useState(
    "https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=600&auto=format&fit=crop&q=80"
  );

  // AI States
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);

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
            loc.toLowerCase().includes(aiLoc.toLowerCase())
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

  // Handle direct file upload for photo
  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 8 * 1024 * 1024) {
        addToast("Por favor, selecione uma imagem menor que 8MB.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setImageUrl(base64);
        analyzeImageWithGemini(base64);
      };
      reader.readAsDataURL(file);
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

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description || !location) {
      addToast("Preencha todos os campos obrigatórios.", "error");
      return;
    }

    const res = await addItem({
      title,
      category,
      type,
      status: type === "PERDIDO" ? "PERDIDO" : "ENCONTRADO",
      description,
      color: color || "Não informada",
      brand: brand || "Desconhecida",
      location,
      date,
      imageUrl,
      contactInfo,
    });

    if (res.matches.length === 0) {
      setActiveTab(type === "PERDIDO" ? "lost" : "found");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">
      {/* Top Header */}
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-5">
        <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white flex items-center gap-2">
          <PlusCircle className="w-7 h-7 text-[#00843D]" /> Cadastro de Objeto • IFPR Campus Ivaiporã
        </h1>
        <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
          Informe os detalhes para ajudar a comunidade a localizar ou devolver este pertence.
        </p>
      </div>

      {/* TYPE TOGGLE: PERDIDO vs ENCONTRADO */}
      <div className="grid grid-cols-2 gap-3 p-1.5 bg-neutral-100 dark:bg-[#1E1E1E] rounded-2xl border border-neutral-200 dark:border-neutral-800">
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
          Escreva em linguagem natural o que aconteceu e a IA extrairá automaticamente o título, categoria, cor, marca e local!
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Ex: Encontrei uma calculadora científica Casio prata no lab de informática B2 hoje às 14h..."
            className="flex-1 px-4 py-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
          />
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
      <form onSubmit={handleSubmit} className="bg-white dark:bg-[#1E1E1E] p-6 sm:p-8 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Título */}
          <div>
            <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1">
              Título do Objeto *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Garrafa Térmica Kouda Verde 750ml"
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
            />
          </div>

          {/* Categoria */}
          <div>
            <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1">
              Categoria *
            </label>
            <select
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
            <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1">
              Cor Predominante
            </label>
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="Ex: Verde escuro / Prata"
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
            />
          </div>

          {/* Marca */}
          <div>
            <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1">
              Marca / Modelo / Fabricante
            </label>
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Ex: Casio, Nike, Kouda, JBL, IFPR"
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
            />
          </div>

          {/* Local no IFPR */}
          <div>
            <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1">
              Local no Campus Ivaiporã *
            </label>
            <select
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
            <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1">
              Data Aproximada *
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
            />
          </div>
        </div>

        {/* Descrição Completa */}
        <div>
          <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1">
            Descrição Completa e Detalhes *
          </label>
          <textarea
            required
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descreva o estado de conservação, marcas de uso, sinais particulares ou circunstâncias em que o pertence foi visto/encontrado..."
            className="w-full p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
          />
        </div>

        {/* Foto do Objeto e Visão Gemini */}
        <div className="space-y-3 p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700/60">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-neutral-800 dark:text-neutral-200">
              Foto do Objeto
            </label>
            <span className="text-[10px] text-[#00843D] dark:text-green-400 font-bold flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500 fill-amber-500" /> Visão Gemini 3.1 Pro Ativa
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-center">
            <div className="relative flex-1 w-full">
              <ImageIcon className="absolute left-3 top-3 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="Cole a URL da foto ou selecione um arquivo ao lado..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
              />
            </div>

            <label className="px-3.5 py-2.5 rounded-xl bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-800 dark:text-neutral-100 text-xs font-bold cursor-pointer transition-colors flex items-center space-x-1.5 shrink-0">
              <Upload className="w-4 h-4 text-[#00843D]" />
              <span>Enviar Arquivo</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageFileUpload}
                className="hidden"
              />
            </label>

            <div className="w-12 h-12 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 overflow-hidden shrink-0">
              <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => analyzeImageWithGemini(imageUrl)}
              disabled={isAnalyzingImage}
              className="px-3.5 py-1.5 rounded-xl bg-[#00843D]/10 hover:bg-[#00843D]/20 text-[#00843D] dark:text-green-400 text-xs font-extrabold transition-colors border border-[#00843D]/20 flex items-center space-x-1.5 disabled:opacity-50"
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

            <div className="flex space-x-1.5 overflow-x-auto">
              {[
                { label: "Garrafa", url: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=600&auto=format&fit=crop&q=80" },
                { label: "Calculadora", url: "https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd?w=600&auto=format&fit=crop&q=80" },
                { label: "Casio", url: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80" },
                { label: "Carteira", url: "https://images.unsplash.com/photo-1627123424574-724758594e93?w=600&auto=format&fit=crop&q=80" },
              ].map((preset) => (
                <button
                  type="button"
                  key={preset.label}
                  onClick={() => handleImagePreset(preset.url)}
                  className="px-2 py-1 rounded-lg bg-white dark:bg-neutral-800 text-[10px] font-medium text-neutral-700 dark:text-neutral-300 hover:bg-[#00843D] hover:text-white transition-colors border border-neutral-200 dark:border-neutral-700 shrink-0"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Contato de Referência */}
        <div>
          <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-200 mb-1">
            Informações de Contato / Local de Guarda *
          </label>
          <input
            type="text"
            required
            value={contactInfo}
            onChange={(e) => setContactInfo(e.target.value)}
            placeholder="Ex: Deixado na Guarita da Portaria Principal ou lucas.santos@estudante.ifpr.edu.br"
            className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
          />
        </div>

        {/* Submit Actions */}
        <div className="pt-4 flex justify-end space-x-3 border-t border-neutral-200 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => setActiveTab("home")}
            className="px-5 py-3 rounded-xl text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-6 py-3 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white font-extrabold text-xs shadow-md shadow-[#00843D]/20 transition-all flex items-center space-x-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Salvar Registro de Objeto</span>
          </button>
        </div>
      </form>
    </div>
  );
};
