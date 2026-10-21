import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../context/RouterContext";
import { ItemCard } from "./ItemCard";
import { RecentActivityWidget } from "./RecentActivityWidget";
import { LostFoundItem } from "../types";
import { clientSemanticSearch, SemanticSearchResult } from "../lib/apiHelper";
import { vibrateClick, vibrateWarning, sanitizeQuery } from "../lib/utils";
import { filterHomeItems } from "../lib/searchUtils";
import {
  Search,
  PlusCircle,
  PackageSearch,
  CheckCircle2,
  Sparkles,
  TrendingUp,
  MapPin,
  ArrowRight,
  ShieldCheck,
  Zap,
  Filter,
  CheckCircle,
  BarChart2,
  QrCode,
  Layers,
  Bot,
  RefreshCw,
  HelpCircle,
  Compass,
  AlertTriangle,
  RotateCcw,
  X,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export const HomeView: React.FC = () => {
  const {
    items,
    notifications,
    setSelectedItemForDetail,
    setRegisterTypeSelection,
    setQrScannerOpen,
    t,
    language,
    requestAuthForRegistration,
  } = useApp();

  const { navigate } = useRouter();

  const [homeSearch, setHomeSearch] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("TODAS");
  const [semanticMode, setSemanticMode] = useState<boolean>(true);
  const [isSearchingSemantic, setIsSearchingSemantic] = useState<boolean>(false);
  const [semanticResults, setSemanticResults] = useState<SemanticSearchResult[] | null>(null);
  const [semanticModelUsed, setSemanticModelUsed] = useState<string | null>(null);
  const [semanticError, setSemanticError] = useState<{
    hasError: boolean;
    message: string;
  } | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);

  // Quick Semantic Search Prompts for discovery
  const semanticExampleQueries = [
    "chave azul esquecida perto da biblioteca",
    "garrafa térmica preta deixada na quadra",
    "calculadora científica no laboratório",
    "crachá e carteira no bloco administrativo",
  ];

  // Calculate statistics
  const totalRegistered = items.length;
  const totalFound = items.filter((i) => i.type === "ENCONTRADO" || i.status === "ENCONTRADO").length;
  const totalReturned = items.filter((i) => i.status === "DEVOLVIDO").length;
  const successRate = totalRegistered > 0 ? Math.round((totalReturned / totalRegistered) * 100) : 0;

  // Semantic Search Effect with Debounce
  useEffect(() => {
    // Sanitize search query input safely against null/undefined
    const sanitizedQuery = sanitizeQuery(homeSearch);

    if (!sanitizedQuery || sanitizedQuery.length < 3 || !semanticMode) {
      setSemanticResults(null);
      setIsSearchingSemantic(false);
      setSemanticError(null);
      return;
    }

    let isMounted = true;
    setIsSearchingSemantic(true);
    setSemanticError(null);

    const timer = setTimeout(async () => {
      try {
        const response = await clientSemanticSearch(sanitizedQuery, items || []);

        if (isMounted) {
          if (response?.success) {
            setSemanticResults(Array.isArray(response.results) ? response.results : []);
            setSemanticModelUsed(response.modelUsed || "gemini-3.7-flash");
            setSemanticError(null);
          } else {
            setSemanticResults(null);
            setSemanticError({
              hasError: true,
              message:
                response?.message ||
                (language === "pt"
                  ? "Não foi possível conectar ao assistente Gemini no momento. Exibindo correspondências diretas por texto."
                  : "Could not connect to Gemini AI assistant. Displaying standard text matches."),
            });
          }
          setIsSearchingSemantic(false);
        }
      } catch (err: any) {
        console.error("[HomeView Search Debug] Erro de rede/execução na busca semântica:", err);
        if (isMounted) {
          setSemanticResults(null);
          setSemanticError({
            hasError: true,
            message:
              err?.message ||
              (language === "pt"
                ? "Falha de conexão com a API do Gemini. Usando busca local de segurança."
                : "Connection failure with Gemini API. Switched to safe local search."),
          });
          setIsSearchingSemantic(false);
        }
      }
    }, 380);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [homeSearch, semanticMode, items, retryCount, language]);

  // Combine semantic relevance with category filter using unit-tested filterHomeItems logic
  const displayedItems = filterHomeItems({
    items,
    searchTerm: homeSearch,
    selectedCategory,
    semanticMode,
    semanticResults,
    limit: semanticMode && semanticResults && semanticResults.length > 0 ? undefined : 6,
  });

  const categoriesList = [
    "TODAS",
    "Eletrônicos",
    "Documentos & Cartões",
    "Roupas & Calçados",
    "Chaves",
    "Material Escolar & Livros",
    "Garrafas & Marmitas",
  ];

  const handleRegister = (type: "PERDIDO" | "ENCONTRADO") => {
    vibrateClick();
    requestAuthForRegistration(type);
    navigate(`/cadastrar?tipo=${type.toLowerCase()}`);
  };

  const handleSelectExampleQuery = (queryText: string) => {
    vibrateClick();
    const safeQ = sanitizeQuery(queryText);
    setHomeSearch(safeQ);
    setSemanticMode(true);
  };

  return (
    <div className="space-y-6 sm:space-y-8 lg:space-y-12 pb-10 sm:pb-16">
      {/* HERO BANNER SECTION */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#006e33] via-[#00843D] to-[#004822] text-white p-6 sm:p-10 lg:p-12 shadow-[0_12px_36px_rgba(0,132,61,0.22)] border border-[#00843D]/40">
        {/* Modern Depth Accents & Radial Highlights */}
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-96 h-96 bg-white/12 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-16 -ml-16 w-80 h-80 bg-black/25 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.12),transparent_60%)] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:24px_24px] opacity-10 pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 gap-6 sm:gap-8 lg:gap-12 items-center">
          <div className="md:col-span-8 space-y-4 sm:space-y-6">
            <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-xs font-bold text-white shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
              <span>IFPR Campus Ivaiporã • Sistema Oficial</span>
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-[1.12]">
                Achados &amp; Perdidos <br className="hidden sm:inline" />
                <span className="text-emerald-200 drop-shadow-xs">Campus Ivaiporã</span>
              </h1>
              <p className="text-xs sm:text-base text-emerald-50/95 font-medium leading-relaxed max-w-2xl pt-1">
                A plataforma institucional inteligente para localização, registro, cruzamento automatizado e devolução segura de pertences no campus.
              </p>
            </div>

            {/* Clear Action Hierarchy */}
            <div className="pt-2 space-y-3.5">
              {/* Primary Action Group */}
              <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                <button
                  onClick={() => handleRegister("ENCONTRADO")}
                  className="px-5 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-white text-[#00843D] hover:bg-emerald-50 font-extrabold text-xs sm:text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center space-x-2 cursor-pointer active:scale-98"
                >
                  <PlusCircle className="w-4.5 h-4.5 text-[#00843D]" />
                  <span>Cadastrar Objeto</span>
                </button>

                <button
                  onClick={() => navigate("/buscar")}
                  className="px-5 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-white/15 hover:bg-white/25 text-white font-extrabold text-xs sm:text-sm backdrop-blur-md border border-white/30 transition-all flex items-center justify-center space-x-2 cursor-pointer active:scale-98"
                >
                  <Search className="w-4.5 h-4.5 text-white" />
                  <span>Explorar Acervo</span>
                </button>

                <button
                  onClick={() => handleRegister("PERDIDO")}
                  className="px-4.5 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-red-600/95 hover:bg-red-600 text-white font-extrabold text-xs sm:text-sm transition-all flex items-center justify-center space-x-1.5 cursor-pointer shadow-sm active:scale-98 border border-red-400/40"
                >
                  <PackageSearch className="w-4.5 h-4.5" />
                  <span>Perdi um Pertence</span>
                </button>
              </div>

              {/* Utility Quick Links */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-white/90 pt-1">
                <button
                  onClick={() => navigate("/analisador-ia")}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-white/12 hover:bg-white/22 backdrop-blur-xs transition-colors text-white font-semibold cursor-pointer border border-white/15 shadow-2xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                  <span>Analisar Foto com IA</span>
                </button>

                <button
                  onClick={() => {
                    vibrateClick();
                    window.dispatchEvent(new CustomEvent("open-tour-guide"));
                  }}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-white/12 hover:bg-white/22 backdrop-blur-xs transition-colors text-white font-semibold cursor-pointer border border-white/15 shadow-2xs"
                  title="Tutorial do Sistema"
                >
                  <Compass className="w-3.5 h-3.5 text-emerald-200" />
                  <span>Tutorial Rápido</span>
                </button>
              </div>
            </div>
          </div>

          {/* Hero Brand Emblem IFPR */}
          <div className="hidden md:flex md:col-span-4 items-center justify-center p-2 sm:p-4">
            <div className="relative flex items-center justify-center w-full max-w-[150px] sm:max-w-[180px] lg:max-w-[210px] aspect-[216/292] group">
              <div className="absolute inset-0 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all" />
              <img
                src="/ifpr-logo.svg"
                alt="Instituto Federal do Paraná - IFPR"
                className="relative w-full h-full object-contain select-none drop-shadow-2xl transition-transform hover:scale-105 duration-300"
              />
            </div>
          </div>
        </div>
      </section>

      {/* HIGHLIGHTED STATISTICS CARDS */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        <motion.div
          whileHover={{ y: -3 }}
          className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#181818] border border-neutral-200/80 dark:border-neutral-800 shadow-[0_2px_8px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.2)] hover:border-[#00843D]/40 dark:hover:border-[#00843D]/50 transition-all flex items-center space-x-3 sm:space-x-4 min-w-0"
        >
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-[#00843D]/15 to-[#00843D]/5 dark:from-[#00843D]/25 dark:to-[#00843D]/10 text-[#00843D] dark:text-green-400 flex items-center justify-center shrink-0 border border-[#00843D]/20">
            <Layers className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] sm:text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block truncate">
              Cadastrados
            </span>
            <span className="text-xl sm:text-2xl lg:text-3xl font-black text-neutral-900 dark:text-white truncate block tracking-tight">
              {totalRegistered}
            </span>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -3 }}
          className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#181818] border border-neutral-200/80 dark:border-neutral-800 shadow-[0_2px_8px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.2)] hover:border-[#22C55E]/40 dark:hover:border-[#22C55E]/50 transition-all flex items-center space-x-3 sm:space-x-4 min-w-0"
        >
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-[#22C55E]/15 to-[#22C55E]/5 dark:from-[#22C55E]/25 dark:to-[#22C55E]/10 text-[#22C55E] dark:text-green-400 flex items-center justify-center shrink-0 border border-[#22C55E]/20">
            <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] sm:text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block truncate">
              Encontrados
            </span>
            <span className="text-xl sm:text-2xl lg:text-3xl font-black text-neutral-900 dark:text-white truncate block tracking-tight">
              {totalFound}
            </span>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -3 }}
          className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#181818] border border-neutral-200/80 dark:border-neutral-800 shadow-[0_2px_8px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.2)] hover:border-[#3B82F6]/40 dark:hover:border-[#3B82F6]/50 transition-all flex items-center space-x-3 sm:space-x-4 min-w-0"
        >
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-[#3B82F6]/15 to-[#3B82F6]/5 dark:from-[#3B82F6]/25 dark:to-[#3B82F6]/10 text-[#3B82F6] dark:text-blue-400 flex items-center justify-center shrink-0 border border-[#3B82F6]/20">
            <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] sm:text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block truncate">
              Devolvidos
            </span>
            <span className="text-xl sm:text-2xl lg:text-3xl font-black text-neutral-900 dark:text-white truncate block tracking-tight">
              {totalReturned}
            </span>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -3 }}
          className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#181818] border border-neutral-200/80 dark:border-neutral-800 shadow-[0_2px_8px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.2)] hover:border-amber-500/40 dark:hover:border-amber-500/50 transition-all flex items-center space-x-3 sm:space-x-4 min-w-0"
        >
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-amber-500/15 to-amber-500/5 dark:from-amber-500/25 dark:to-amber-500/10 text-amber-500 flex items-center justify-center shrink-0 border border-amber-500/20">
            <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] sm:text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block truncate">
              Taxa de Sucesso
            </span>
            <span className="text-xl sm:text-2xl lg:text-3xl font-black text-[#00843D] dark:text-green-400 truncate block tracking-tight">
              {successRate}%
            </span>
          </div>
        </motion.div>
      </section>

      {/* QUICK SEARCH & GEMINI SEMANTIC SEARCH BAR */}
      <section id="home-semantic-search-section" className="space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sm:gap-4">
          <div className="relative flex-1">
            <div className="absolute left-4 top-3.5 flex items-center space-x-1 text-neutral-400">
              {isSearchingSemantic ? (
                <Loader2 className="w-5 h-5 text-[#00843D] animate-spin" />
              ) : semanticMode ? (
                <Sparkles className="w-5 h-5 text-amber-500 fill-amber-500" />
              ) : (
                <Search className="w-5 h-5" />
              )}
            </div>
            <input
              id="home-semantic-search-input"
              type="text"
              value={homeSearch}
              onChange={(e) => setHomeSearch(e?.target?.value ?? "")}
              placeholder={
                language === "pt"
                  ? "Busca Semântica IA: ex: 'chave azul perto da biblioteca' ou 'garrafa térmica preta'..."
                  : "Gemini AI Semantic Search: e.g. 'blue key near library' or 'black bottle'..."
              }
              className={`w-full pl-12 pr-32 py-3.5 rounded-2xl bg-white dark:bg-[#181818] border text-neutral-900 dark:text-white text-sm shadow-[0_2px_8px_rgba(0,0,0,0.03)] outline-none transition-all ${
                isSearchingSemantic
                  ? "border-[#00843D] ring-2 ring-[#00843D]/20"
                  : "border-neutral-200/90 dark:border-neutral-800 focus:ring-2 focus:ring-[#00843D] focus:border-[#00843D]"
              }`}
            />
            {/* Semantic Mode & Status Badge inside input */}
            <div className="absolute right-3 top-2.5 flex items-center space-x-1.5">
              {isSearchingSemantic && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-[#00843D] dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-lg animate-pulse border border-emerald-200 dark:border-emerald-800">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>{language === "pt" ? "Processando..." : "Processing..."}</span>
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  vibrateClick();
                  setSemanticMode(!semanticMode);
                }}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center space-x-1.5 transition-all border cursor-pointer ${
                  semanticMode
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 shadow-2xs"
                    : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 border-neutral-200 dark:border-neutral-700"
                }`}
                title="Alternar Busca Semântica por IA"
              >
                <Sparkles className={`w-3.5 h-3.5 ${semanticMode ? "text-amber-500 fill-amber-500" : "text-neutral-400"}`} />
                <span className="hidden sm:inline">IA Gemini</span>
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={() => {
                vibrateClick();
                setQrScannerOpen(true);
              }}
              className="w-full md:w-auto px-5 py-3.5 rounded-2xl bg-neutral-900 text-white dark:bg-neutral-800 hover:bg-[#00843D] dark:hover:bg-[#00843D] font-extrabold text-xs flex items-center justify-center space-x-2 shrink-0 shadow-xs transition-all cursor-pointer group"
            >
              <QrCode className="w-4 h-4 text-emerald-400 group-hover:text-white transition-colors" />
              <span>{language === "pt" ? "Escanear Etiqueta QR" : "Scan QR Label"}</span>
            </button>
          </div>
        </div>

        {/* Global Error Banner for API/Network Connection Issues */}
        <AnimatePresence>
          {semanticError?.hasError && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="p-3.5 sm:p-4 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-start sm:items-center space-x-2.5">
                <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-bold text-amber-800 dark:text-amber-300">
                    {language === "pt" ? "Aviso de Conexão Gemini AI" : "Gemini AI Connection Notice"}
                  </p>
                  <p className="text-neutral-600 dark:text-neutral-300">
                    {semanticError.message}{" "}
                    <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                      {language === "pt"
                        ? "(Modo de busca local por palavras-chave ativo)"
                        : "(Fallback local keyword search active)"}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    vibrateClick();
                    setRetryCount((c) => c + 1);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center space-x-1.5 transition-all shadow-xs text-xs cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{language === "pt" ? "Tentar Novamente" : "Retry"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    vibrateClick();
                    setSemanticError(null);
                  }}
                  className="p-1.5 rounded-lg hover:bg-amber-500/20 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-white transition-all cursor-pointer"
                  title="Fechar aviso"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick Semantic Examples Suggestions */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs text-neutral-500 scrollbar-none">
          <span className="font-bold text-neutral-600 dark:text-neutral-400 whitespace-nowrap flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-[#00843D]" /> {t("semanticSearchPrompt", "Busca rápida:")}
          </span>
          {semanticExampleQueries.map((exQuery) => (
            <button
              key={exQuery}
              onClick={() => handleSelectExampleQuery(exQuery)}
              className="px-3 py-1 rounded-xl bg-[#00843D]/5 dark:bg-[#00843D]/10 hover:bg-[#00843D]/15 text-[#00843D] dark:text-green-400 border border-[#00843D]/20 font-semibold whitespace-nowrap transition-all flex items-center space-x-1 cursor-pointer active:scale-95"
            >
              <span>{exQuery}</span>
            </button>
          ))}
        </div>

        {/* Category Pills Slider */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-2 scrollbar-none">
          {categoriesList.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                vibrateClick();
                setSelectedCategory(cat);
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer active:scale-95 ${
                selectedCategory === cat
                  ? "bg-[#00843D] text-white shadow-xs"
                  : "bg-white dark:bg-[#181818] text-neutral-600 dark:text-neutral-300 border border-neutral-200/90 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:border-[#00843D]/30"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      {/* RECENT ACTIVITY FEED WIDGET */}
      <section>
        <RecentActivityWidget
          items={items}
          notifications={notifications}
          onSelectItem={setSelectedItemForDetail}
        />
      </section>

      {/* RECENT / SEMANTIC ITEMS GRID */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
              {isSearchingSemantic ? (
                <>
                  <Loader2 className="w-5 h-5 text-[#00843D] animate-spin" />
                  <span>{language === "pt" ? "Consultando IA Gemini..." : "Searching with Gemini AI..."}</span>
                </>
              ) : semanticResults && semanticResults.length > 0 && homeSearch.trim().length >= 3 ? (
                <>
                  <Sparkles className="w-5 h-5 text-amber-500 fill-amber-500" />
                  <span>
                    {language === "pt" ? "Correspondências Semânticas IA" : "AI Semantic Matches"} ({displayedItems.length})
                  </span>
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5 text-[#00843D]" />
                  <span>{t("recentItems", "Objetos Recentes no Campus")}</span>
                </>
              )}
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {isSearchingSemantic
                ? language === "pt"
                  ? "Analisando descrições, cores, marcas e locais em linguagem natural..."
                  : "Analyzing descriptions, colors, brands, and campus locations in natural language..."
                : semanticResults && semanticResults.length > 0 && homeSearch.trim().length >= 3
                ? language === "pt"
                  ? `Resultados classificados por relevância semântica no campus com o modelo ${semanticModelUsed || "Gemini"}`
                  : `Results ranked by semantic relevance at campus with ${semanticModelUsed || "Gemini"}`
                : language === "pt"
                ? "Últimos itens registrados no sistema de achados e perdidos"
                : "Latest items registered in the campus lost and found system"}
            </p>
          </div>

          <button
            onClick={() => {
              vibrateClick();
              navigate("/buscar");
            }}
            className="text-xs font-bold text-[#00843D] dark:text-green-400 hover:underline flex items-center space-x-1"
          >
            <span>{language === "pt" ? `Ver todos (${items.length})` : `View all (${items.length})`}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Visual Loading State Skeletons while Gemini is processing */}
        {isSearchingSemantic ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-full min-w-0">
            {[1, 2, 3].map((skeletonId) => (
              <div
                key={skeletonId}
                className="p-5 rounded-3xl bg-white dark:bg-[#1E1E1E] border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4 animate-pulse min-w-0"
              >
                <div className="h-44 rounded-2xl bg-neutral-200 dark:bg-neutral-800 w-full relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 dark:via-neutral-700/30 to-transparent animate-shimmer" />
                </div>
                <div className="space-y-2">
                  <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded-md w-3/4" />
                  <div className="h-3 bg-neutral-200 dark:bg-neutral-800 rounded-md w-1/2" />
                </div>
                <div className="pt-2 flex items-center justify-between">
                  <div className="h-3 bg-neutral-200 dark:bg-neutral-800 rounded-md w-1/3" />
                  <div className="h-6 bg-neutral-200 dark:bg-neutral-800 rounded-full w-20" />
                </div>
                <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center space-x-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                  <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                    {language === "pt" ? "Calculando relevância IA..." : "Calculating AI relevance..."}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : displayedItems.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-8 space-y-3">
            <PackageSearch className="w-12 h-12 text-neutral-300 dark:text-neutral-600 mx-auto" />
            <h4 className="font-bold text-base text-neutral-700 dark:text-neutral-300">
              {language === "pt" ? "Nenhum objeto encontrado com estes termos." : "No items found matching these terms."}
            </h4>
            <p className="text-xs text-neutral-500">
              {language === "pt"
                ? "Tente pesquisar em linguagem natural (ex: 'chave azul perto da biblioteca') ou selecione outra categoria."
                : "Try a natural language description (e.g. 'blue key near the library') or choose another category."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-full min-w-0">
            {displayedItems.map((item) => {
              const semMatch = semanticResults?.find((r) => r.itemId === item.id);
              return (
                <div key={item.id} className="flex flex-col space-y-2 min-w-0 w-full">
                  <ItemCard item={item} onSelect={setSelectedItemForDetail} />
                  {semMatch && (
                    <div className="px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-neutral-800 dark:text-neutral-200 text-xs flex items-start space-x-2">
                      <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-2 font-bold text-[11px] text-amber-700 dark:text-amber-400">
                          <span>Relevância IA: {semMatch.relevanceScore}%</span>
                        </div>
                        <p className="text-[11px] text-neutral-600 dark:text-neutral-300 leading-tight">
                          {semMatch.explanation}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* HOW IT WORKS / AI BENEFIT SECTION */}
      <section className="relative overflow-hidden p-6 sm:p-10 rounded-3xl bg-neutral-900 text-white space-y-6 border border-neutral-800 shadow-[0_12px_36px_rgba(0,0,0,0.3)]">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 border-b border-neutral-800/80 pb-6">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold border border-emerald-500/30">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Diferencial Inteligente</span>
            </span>
            <h3 className="text-xl sm:text-2xl font-black tracking-tight">Tecnologia com IA para Cruzamento Automático</h3>
          </div>
          <button
            onClick={() => handleRegister("PERDIDO")}
            className="px-5 py-2.5 rounded-xl bg-[#00843D] hover:bg-emerald-600 text-white font-bold text-xs transition-all shadow-xs cursor-pointer active:scale-95"
          >
            Experimentar Cadastro IA
          </button>
        </div>

        <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 text-xs leading-relaxed text-neutral-300">
          <div className="p-5 rounded-2xl bg-neutral-800/50 hover:bg-neutral-800/80 border border-neutral-700/60 transition-all space-y-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00843D]/30 to-[#00843D]/10 text-emerald-400 border border-[#00843D]/30 flex items-center justify-center font-black text-sm">
              1
            </div>
            <h4 className="font-extrabold text-sm text-white">Extrator Inteligente</h4>
            <p className="text-neutral-400 leading-relaxed">
              Ao descrever o objeto em texto livre, o modelo Gemini extrai automaticamente a categoria, cor, marca e local citado no campus.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-neutral-800/50 hover:bg-neutral-800/80 border border-neutral-700/60 transition-all space-y-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00843D]/30 to-[#00843D]/10 text-emerald-400 border border-[#00843D]/30 flex items-center justify-center font-black text-sm">
              2
            </div>
            <h4 className="font-extrabold text-sm text-white">Similaridade Textual</h4>
            <p className="text-neutral-400 leading-relaxed">
              O sistema compara instantaneamente a descrição com os objetos cadastrados no banco de dados e notifica caso haja correspondência.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-neutral-800/50 hover:bg-neutral-800/80 border border-neutral-700/60 transition-all space-y-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00843D]/30 to-[#00843D]/10 text-emerald-400 border border-[#00843D]/30 flex items-center justify-center font-black text-sm">
              3
            </div>
            <h4 className="font-extrabold text-sm text-white">Devolução por QR Code</h4>
            <p className="text-neutral-400 leading-relaxed">
              Cada item recebe uma etiqueta digital com QR Code para retirada ágil e segura no setor de Achados & Perdidos do IFPR.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
