import React, { useState, useRef, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../context/RouterContext";
import { ItemCard } from "./ItemCard";
import { CANONICAL_ITEM_CATEGORIES } from "../lib/categoryUtils";
import {
  vibrateClick,
  safeIncludes,
  sanitizeQuery,
  safeParseDate,
} from "../lib/utils";
import {
  Search,
  PlusCircle,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  Clock,
  HelpCircle,
  PackageSearch,
  Mic,
  MicOff,
  History,
  X,
  ArrowRight,
  RotateCcw,
  Building2,
} from "lucide-react";
import {
  SurfaceCard,
  UIButton,
  UIBadge,
  StatCard,
  EmptyState,
} from "./ui";

const SEARCH_HISTORY_KEY = "ifpr_search_history";

export const HomeView: React.FC = () => {
  const {
    items,
    setSelectedItemForDetail,
    setQrScannerOpen,
    addToast,
    currentUser,
    requestAuthForRegistration,
  } = useApp();
  const { navigate } = useRouter();

  const [quickSearch, setQuickSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("Todas");
  const [activeTypeFilter, setActiveTypeFilter] = useState<
    "TODOS" | "PERDIDO" | "ENCONTRADO"
  >("TODOS");
  const [isListeningVoice, setIsListeningVoice] = useState(false);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(SEARCH_HISTORY_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.slice(0, 8);
      }
    } catch {}
    return [];
  });
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const addSearchQueryToHistory = (query: string) => {
    const cleaned = query.trim();
    if (!cleaned) return;
    setSearchHistory((prev) => {
      const next = [
        cleaned,
        ...prev.filter((item) => item.toLowerCase() !== cleaned.toLowerCase()),
      ].slice(0, 8);
      try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const clearSearchHistory = () => {
    setSearchHistory([]);
    try {
      localStorage.removeItem(SEARCH_HISTORY_KEY);
    } catch {}
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setShowHistoryDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleVoiceSearch = () => {
    vibrateClick();
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      addToast(
        "Seu navegador não suporta busca por voz nativa. Tente no Chrome ou Edge.",
        "info"
      );
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListeningVoice(true);
      addToast("Ouvindo... Fale o nome ou cor do objeto.", "info");
    };

    recognition.onresult = (event: any) => {
      const transcript = event?.results?.[0]?.[0]?.transcript || "";
      const cleaned = sanitizeQuery(transcript);
      if (cleaned) {
        setQuickSearch(cleaned);
        addSearchQueryToHistory(cleaned);
        addToast(`Busca por voz: "${cleaned}"`, "success");
      }
    };

    recognition.onerror = () => {
      setIsListeningVoice(false);
      addToast(
        "Não foi possível capturar o áudio. Verifique a permissão do microfone.",
        "error"
      );
    };

    recognition.onend = () => {
      setIsListeningVoice(false);
    };

    try {
      recognition.start();
    } catch {
      setIsListeningVoice(false);
    }
  };

  const categories = ["Todas", ...CANONICAL_ITEM_CATEGORIES];

  // Filter recent items for the showcase (up to 6 items)
  const filteredItems = (items || [])
    .filter((item) => {
      if (!item) return false;
      const matchesSearch =
        !quickSearch.trim() ||
        safeIncludes(item.title, quickSearch) ||
        safeIncludes(item.description, quickSearch) ||
        safeIncludes(item.location, quickSearch) ||
        safeIncludes(item.qrCodeId, quickSearch);
      const matchesCat =
        selectedCategory === "Todas" || item.category === selectedCategory;
      const matchesType =
        activeTypeFilter === "TODOS" || item.type === activeTypeFilter;
      return matchesSearch && matchesCat && matchesType;
    })
    .sort(
      (a, b) =>
        (safeParseDate(b.createdAt || b.date)?.getTime() || 0) -
        (safeParseDate(a.createdAt || a.date)?.getTime() || 0)
    )
    .slice(0, 6);

  const stats = {
    totalItems: (items || []).length,
    foundItems: (items || []).filter(
      (i) => i && i.type === "ENCONTRADO" && i.status === "DISPONIVEL"
    ).length,
    lostItems: (items || []).filter(
      (i) => i && i.type === "PERDIDO" && i.status === "DISPONIVEL"
    ).length,
    returnedItems: (items || []).filter((i) => i && i.status === "DEVOLVIDO")
      .length,
  };

  const returnRate =
    stats.totalItems > 0
      ? Math.round((stats.returnedItems / stats.totalItems) * 100)
      : 0;

  return (
    <div className="space-y-8 pb-12">
      {/* 1. APRESENTAÇÃO INSTITUCIONAL, BUSCA RÁPIDA E AÇÕES PRINCIPAIS (Sem duplicar a marca do cabeçalho) */}
      <section className="bg-white dark:bg-[#111827] rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-[0_1px_3px_rgba(23,43,42,0.04)] p-6 sm:p-8 lg:p-10">
        <div className="max-w-4xl space-y-6">
          {/* Eyebrow institucional */}
          <div className="flex flex-wrap items-center gap-2.5">
            <UIBadge tone="emerald">
              <Building2 className="w-3.5 h-3.5 text-[#16845B] dark:text-emerald-400" />
              <span>IFPR Campus Ivaiporã • Central Oficial de Achados e Perdidos</span>
            </UIBadge>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#16845B] dark:text-emerald-400 shrink-0" />
              <span>Atendimento presencial: Portaria Principal e SEPAE (Segunda a Sexta, das 07h às 22h)</span>
            </span>
          </div>

          {/* Título principal e descrição institucional */}
          <div className="space-y-3">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#172B2A] dark:text-white tracking-tight leading-[1.18]">
              Consulte e recupere pertences perdidos ou encontrados no campus com{" "}
              <span className="text-[#16845B] dark:text-emerald-400">
                rastreabilidade e segurança
              </span>
              .
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed max-w-3xl">
              Todos os objetos entregues na Portaria Principal, Biblioteca, Ginásio ou Secretaria Acadêmica (SEPAE/SEBAC) são catalogados com etiqueta QR Code e devolvidos mediante conferência documental e recibo digital.
            </p>
          </div>

          {/* Barra de Busca Direta */}
          <div ref={searchContainerRef} className="relative max-w-3xl">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-1.5 rounded-xl bg-[#F8FAFC] dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 focus-within:border-[#16845B] focus-within:ring-2 focus-within:ring-[#16845B]/15 transition-all">
              <div className="flex items-center flex-1 pl-3 pr-2 py-1.5">
                <Search className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" />
                <input
                  id="home-search-input"
                  type="text"
                  value={quickSearch}
                  onFocus={() => setShowHistoryDropdown(true)}
                  onChange={(e) => setQuickSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && quickSearch.trim()) {
                      addSearchQueryToHistory(quickSearch.trim());
                      setShowHistoryDropdown(false);
                    }
                  }}
                  placeholder="Buscar por nome do objeto, cor, bloco, sala ou código QR..."
                  className="w-full bg-transparent text-[#172B2A] dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none"
                />

                {quickSearch && (
                  <button
                    type="button"
                    onClick={() => setQuickSearch("")}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    title="Limpar busca"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleVoiceSearch}
                  title="Pesquisar por voz"
                  aria-label="Pesquisar por voz"
                  className={`ml-1 p-1.5 rounded-lg transition-all cursor-pointer ${
                    isListeningVoice
                      ? "bg-rose-600 text-white animate-pulse"
                      : "text-slate-400 hover:text-[#16845B] dark:hover:text-emerald-400 hover:bg-white dark:hover:bg-slate-800"
                  }`}
                >
                  {isListeningVoice ? (
                    <MicOff className="w-4 h-4" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </button>
              </div>

              <UIButton
                type="button"
                variant="primary"
                size="md"
                onClick={() => {
                  vibrateClick();
                  if (quickSearch.trim()) {
                    addSearchQueryToHistory(quickSearch.trim());
                  }
                  setShowHistoryDropdown(false);
                  navigate("/objetos");
                }}
                className="sm:w-auto w-full"
              >
                <Search className="w-4 h-4" />
                <span>Consultar Objetos</span>
              </UIButton>
            </div>

            {/* Histórico de buscas recentes */}
            {showHistoryDropdown && searchHistory.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-[#111827] rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 p-3 z-30">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="flex items-center gap-1.5 font-semibold text-[#172B2A] dark:text-slate-200">
                    <History className="w-3.5 h-3.5 text-[#16845B]" />
                    <span>Buscas Recentes</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => clearSearchHistory()}
                    className="text-rose-600 hover:underline font-medium cursor-pointer"
                  >
                    Limpar histórico
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {searchHistory.map((h, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setQuickSearch(h);
                        setShowHistoryDropdown(false);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#F8FAFC] dark:bg-slate-800 hover:bg-[#EBF5F0] dark:hover:bg-emerald-950/50 text-slate-700 dark:text-slate-300 hover:text-[#16845B] dark:hover:text-emerald-400 text-xs font-medium transition-colors border border-slate-200/70 dark:border-slate-700 cursor-pointer"
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Ações Principais */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <UIButton
              type="button"
              variant="primary"
              size="lg"
              onClick={() => {
                vibrateClick();
                navigate("/objetos");
              }}
            >
              <PackageSearch className="w-4 h-4" />
              <span>Ver Catálogo Completo</span>
            </UIButton>

            {currentUser?.role !== "ALUNO" && (
              <UIButton
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => {
                  vibrateClick();
                  requestAuthForRegistration();
                  navigate("/cadastrar");
                }}
              >
                <PlusCircle className="w-4 h-4 text-[#16845B] dark:text-emerald-400" />
                <span>Registrar Item</span>
              </UIButton>
            )}

            <UIButton
              type="button"
              variant="outline"
              size="lg"
              onClick={() => {
                vibrateClick();
                setQrScannerOpen(true);
              }}
            >
              <QrCode className="w-4 h-4 text-[#16845B] dark:text-emerald-400" />
              <span>Ler Etiqueta QR Code</span>
            </UIButton>
          </div>
        </div>
      </section>

      {/* 2. INDICADORES ESTATÍSTICOS (Títulos completos, números legíveis, zero truncamento) */}
      <section aria-label="Indicadores estatísticos do acervo">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Objetos Registrados"
            value={stats.totalItems}
            subtitle="Total de ocorrências catalogadas no campus"
            icon={<PackageSearch className="w-5 h-5" />}
            iconTone="slate"
            onClick={() => {
              vibrateClick();
              navigate("/objetos");
            }}
          />
          <StatCard
            label="Objetos Encontrados"
            value={stats.foundItems}
            subtitle="Disponíveis para conferência e retirada"
            icon={<CheckCircle2 className="w-5 h-5" />}
            iconTone="emerald"
            onClick={() => {
              vibrateClick();
              navigate("/encontrados");
            }}
          />
          <StatCard
            label="Objetos Perdidos"
            value={stats.lostItems}
            subtitle="Relatos ativos aguardando localização"
            icon={<HelpCircle className="w-5 h-5" />}
            iconTone="rose"
            onClick={() => {
              vibrateClick();
              navigate("/perdidos");
            }}
          />
          <StatCard
            label="Objetos Devolvidos"
            value={stats.returnedItems}
            subtitle={`Restituídos aos proprietários (${returnRate}% de restituição)`}
            icon={<ShieldCheck className="w-5 h-5" />}
            iconTone="blue"
            onClick={() => {
              vibrateClick();
              navigate("/devolvidos");
            }}
          />
        </div>
      </section>

      {/* 3. VITRINE DE REGISTROS RECENTES */}
      <section className="space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-[#172B2A] dark:text-white tracking-tight">
              Registros Recentes no Campus
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Últimos objetos cadastrados na central de atendimento do IFPR Campus Ivaiporã
            </p>
          </div>

          {/* Controles enxutos de filtro da vitrine */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center bg-white dark:bg-[#111827] p-1 rounded-xl border border-slate-200/90 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  vibrateClick();
                  setActiveTypeFilter("TODOS");
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTypeFilter === "TODOS"
                    ? "bg-[#16845B] text-white"
                    : "text-slate-600 dark:text-slate-400 hover:text-[#172B2A] dark:hover:text-white"
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => {
                  vibrateClick();
                  setActiveTypeFilter("ENCONTRADO");
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTypeFilter === "ENCONTRADO"
                    ? "bg-[#16845B] text-white"
                    : "text-slate-600 dark:text-slate-400 hover:text-[#16845B]"
                }`}
              >
                Encontrados
              </button>
              <button
                type="button"
                onClick={() => {
                  vibrateClick();
                  setActiveTypeFilter("PERDIDO");
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTypeFilter === "PERDIDO"
                    ? "bg-rose-600 text-white"
                    : "text-slate-600 dark:text-slate-400 hover:text-rose-600"
                }`}
              >
                Perdidos
              </button>
            </div>

            <select
              aria-label="Filtrar por categoria"
              value={selectedCategory}
              onChange={(e) => {
                vibrateClick();
                setSelectedCategory(e.target.value);
              }}
              className="px-3 py-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 text-xs font-semibold text-[#172B2A] dark:text-slate-200 outline-none focus:border-[#16845B] cursor-pointer"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === "Todas" ? "Todas as Categorias" : cat}
                </option>
              ))}
            </select>

            <UIButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                vibrateClick();
                navigate("/objetos");
              }}
              className="text-[#16845B] dark:text-emerald-400 font-semibold"
            >
              <span>Ver todos ({items.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </UIButton>
          </div>
        </div>

        {/* Grade de Cartões */}
        {filteredItems.length === 0 ? (
          <EmptyState
            icon={<PackageSearch className="w-6 h-6" />}
            title={
              items.length === 0
                ? "Nenhum objeto registrado no momento"
                : "Nenhum objeto corresponde aos filtros selecionados"
            }
            description={
              items.length === 0
                ? "Assim que novos itens forem entregues na Portaria ou SEPAE, eles aparecerão aqui."
                : "Limpe os filtros ou consulte o catálogo completo para ampliar sua pesquisa."
            }
            action={
              (quickSearch ||
                selectedCategory !== "Todas" ||
                activeTypeFilter !== "TODOS") && (
                <UIButton
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={() => {
                    setQuickSearch("");
                    setSelectedCategory("Todas");
                    setActiveTypeFilter("TODOS");
                  }}
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Limpar Filtros</span>
                </UIButton>
              )
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredItems.map((item, index) => (
              <ItemCard
                key={item.id}
                item={item}
                index={index}
                onSelect={(it) => setSelectedItemForDetail(it)}
              />
            ))}
          </div>
        )}
      </section>

      {/* 4. ORIENTAÇÕES DE USO E PROCEDIMENTO INSTITUCIONAL */}
      <SurfaceCard padding="lg" className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#16845B] dark:text-emerald-400">
              Fluxo Institucional de Restituição
            </p>
            <h2 className="text-lg sm:text-xl font-bold text-[#172B2A] dark:text-white tracking-tight mt-0.5">
              Como funciona o atendimento de Achados e Perdidos
            </h2>
          </div>

          <UIButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              vibrateClick();
              navigate("/suporte");
            }}
          >
            <span>Central de Dúvidas e Suporte</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </UIButton>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#EBF5F0] dark:bg-emerald-950/60 text-[#16845B] dark:text-emerald-400 flex items-center justify-center font-bold text-xs border border-[#16845B]/15">
                01
              </div>
              <h3 className="font-bold text-sm text-[#172B2A] dark:text-white">
                Consulte o Acervo
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Pesquise por categoria, local ou data no catálogo público para verificar se o seu pertence já foi entregue na recepção.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#EBF5F0] dark:bg-emerald-950/60 text-[#16845B] dark:text-emerald-400 flex items-center justify-center font-bold text-xs border border-[#16845B]/15">
                02
              </div>
              <h3 className="font-bold text-sm text-[#172B2A] dark:text-white">
                Reivindique o Objeto
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Ao localizar seu item, abra a ficha de detalhes e informe sinais distintivos que comprovem a titularidade do pertence.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#EBF5F0] dark:bg-emerald-950/60 text-[#16845B] dark:text-emerald-400 flex items-center justify-center font-bold text-xs border border-[#16845B]/15">
                03
              </div>
              <h3 className="font-bold text-sm text-[#172B2A] dark:text-white">
                Conferência na Recepção
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Compareça à Portaria Principal ou SEPAE com documento oficial com foto ou crachá estudantil para validação presencial.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#EBF5F0] dark:bg-emerald-950/60 text-[#16845B] dark:text-emerald-400 flex items-center justify-center font-bold text-xs border border-[#16845B]/15">
                04
              </div>
              <h3 className="font-bold text-sm text-[#172B2A] dark:text-white">
                Termo Digital de Entrega
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              A restituição é formalizada com assinatura digital do recebedor e do servidor atendente, gerando comprovante oficial em PDF.
            </p>
          </div>
        </div>
      </SurfaceCard>
    </div>
  );
};
