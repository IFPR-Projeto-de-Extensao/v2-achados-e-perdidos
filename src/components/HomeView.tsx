import React, { useState, useRef, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../context/RouterContext";
import { ItemCard } from "./ItemCard";
import {
  vibrateClick,
  safeIncludes,
  sanitizeQuery,
  safeParseDate,
} from "../lib/utils";
import {
  Search,
  QrCode,
  Plus,
  Mic,
  MicOff,
  X,
  ArrowRight,
  RotateCcw,
  PackageSearch,
} from "lucide-react";
import { EmptyState } from "./ui";
import { computeHomeItemStats } from "../lib/homeStatsUtils";

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
        if (Array.isArray(parsed)) return parsed.slice(0, 6);
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
      ].slice(0, 6);
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
        "Busca por voz não disponível neste navegador.",
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
      }
    };

    recognition.onerror = () => {
      setIsListeningVoice(false);
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

  const filteredItems = (items || [])
    .filter((item) => {
      if (!item) return false;
      const matchesSearch =
        !quickSearch.trim() ||
        safeIncludes(item.title, quickSearch) ||
        safeIncludes(item.description, quickSearch) ||
        safeIncludes(item.location, quickSearch) ||
        safeIncludes(item.qrCodeId, quickSearch);
      const matchesType =
        activeTypeFilter === "TODOS" || item.type === activeTypeFilter;
      return matchesSearch && matchesType;
    })
    .sort(
      (a, b) =>
        (safeParseDate(b.createdAt || b.date)?.getTime() || 0) -
        (safeParseDate(a.createdAt || a.date)?.getTime() || 0)
    )
    .slice(0, 6);

  const stats = computeHomeItemStats(items);

  return (
    <div className="space-y-6 pb-6">
      {/* 1. CABEÇALHO DIRETO, BUSCA E AÇÕES PRINCIPAIS (Mobile-First, Sem Cartões Desnecessários) */}
      <section className="pt-1 sm:pt-3 space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold text-[#172B2A] dark:text-white tracking-tight">
            Central de Achados e Perdidos
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            IFPR Campus Ivaiporã · Atendimento presencial na Portaria Principal e SEPAE (Seg a Sex, 07h às 22h)
          </p>
        </div>

        {/* Barra de Pesquisa Rápida + QR Code */}
        <div ref={searchContainerRef} className="relative">
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center min-h-[48px] px-3.5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 focus-within:border-[#16845B] transition-colors">
              <Search className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" />
              <input
                id="home-search-input"
                type="text"
                value={quickSearch}
                onFocus={() => setShowHistoryDropdown(true)}
                onChange={(e) => setQuickSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (quickSearch.trim()) {
                      addSearchQueryToHistory(quickSearch.trim());
                    }
                    setShowHistoryDropdown(false);
                  }
                }}
                placeholder="Buscar objeto, cor, local ou código QR..."
                className="w-full bg-transparent text-[#172B2A] dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none"
              />

              {quickSearch && (
                <button
                  type="button"
                  onClick={() => setQuickSearch("")}
                  className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  title="Limpar busca"
                  aria-label="Limpar busca"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={handleVoiceSearch}
                title="Pesquisar por voz"
                aria-label="Pesquisar por voz"
                className={`min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                  isListeningVoice
                    ? "bg-rose-600 text-white"
                    : "text-slate-400 hover:text-[#16845B] dark:hover:text-emerald-400"
                }`}
              >
                {isListeningVoice ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setQrScannerOpen(true);
              }}
              title="Ler etiqueta QR Code"
              aria-label="Ler etiqueta QR Code"
              className="min-h-[48px] min-w-[48px] px-3.5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 hover:border-[#16845B] text-[#172B2A] dark:text-white flex items-center justify-center gap-2 text-xs font-semibold transition-colors shrink-0 cursor-pointer"
            >
              <QrCode className="w-4.5 h-4.5 text-[#16845B] dark:text-emerald-400" />
              <span className="hidden sm:inline">Ler QR Code</span>
            </button>
          </div>

          {/* Histórico de buscas */}
          {showHistoryDropdown && searchHistory.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-[#111827] rounded-xl border border-slate-200 dark:border-slate-800 p-3 z-30 shadow-sm">
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="font-medium">Buscas recentes</span>
                <button
                  type="button"
                  onClick={() => clearSearchHistory()}
                  className="text-rose-600 hover:underline font-medium cursor-pointer"
                >
                  Limpar
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
                    className="px-2.5 py-1 rounded-lg bg-[#F8FAFC] dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-[#16845B] text-xs transition-colors border border-slate-200/70 dark:border-slate-700 cursor-pointer"
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Botões Principais de Ação (Mobile-First Touch Targets >= 46px) */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              vibrateClick();
              navigate("/objetos");
            }}
            className="flex-1 sm:flex-none min-h-[46px] px-5 rounded-xl bg-[#16845B] hover:bg-[#064E3B] text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>Consultar Objetos</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {currentUser?.role !== "ALUNO" && (
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                requestAuthForRegistration();
                navigate("/cadastrar");
              }}
              className="flex-1 sm:flex-none min-h-[46px] px-4 rounded-xl bg-white dark:bg-[#111827] hover:bg-[#F8FAFC] dark:hover:bg-slate-800 text-[#172B2A] dark:text-slate-200 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#16845B] dark:text-emerald-400" />
              <span>Registrar Objeto</span>
            </button>
          )}
        </div>
      </section>

      {/* 2. RESUMO ESTATÍSTICO COMPACTO (Sem cartões volumosos, não compete com a consulta) */}
      <section
        aria-label="Resumo do acervo"
        className="grid grid-cols-4 divide-x divide-slate-200/80 dark:divide-slate-800 border-y border-slate-200/80 dark:border-slate-800 py-3"
      >
        <button
          type="button"
          onClick={() => {
            vibrateClick();
            navigate("/objetos");
          }}
          className="px-2 sm:px-4 text-left hover:opacity-80 transition-opacity cursor-pointer"
        >
          <p className="text-base sm:text-xl font-bold text-[#172B2A] dark:text-white tabular-nums leading-tight">
            {stats.totalItems}
          </p>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Registrados
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            vibrateClick();
            navigate("/encontrados");
          }}
          className="px-2 sm:px-4 text-left hover:opacity-80 transition-opacity cursor-pointer"
        >
          <p className="text-base sm:text-xl font-bold text-[#16845B] dark:text-emerald-400 tabular-nums leading-tight">
            {stats.foundItems}
          </p>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Encontrados
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            vibrateClick();
            navigate("/perdidos");
          }}
          className="px-2 sm:px-4 text-left hover:opacity-80 transition-opacity cursor-pointer"
        >
          <p className="text-base sm:text-xl font-bold text-rose-600 dark:text-rose-400 tabular-nums leading-tight">
            {stats.lostItems}
          </p>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Perdidos
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            vibrateClick();
            navigate("/devolvidos");
          }}
          className="px-2 sm:px-4 text-left hover:opacity-80 transition-opacity cursor-pointer"
        >
          <p className="text-base sm:text-xl font-bold text-[#172B2A] dark:text-white tabular-nums leading-tight">
            {stats.returnedItems}
          </p>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Devolvidos
          </p>
        </button>
      </section>

      {/* 3. OBJETOS RECENTES */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setActiveTypeFilter("TODOS");
              }}
              className={`min-h-[34px] px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeTypeFilter === "TODOS"
                  ? "bg-white dark:bg-slate-800 text-[#172B2A] dark:text-white font-semibold"
                  : "text-slate-600 dark:text-slate-400 hover:text-[#172B2A] dark:hover:text-white"
              }`}
            >
              Recentes
            </button>
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setActiveTypeFilter("ENCONTRADO");
              }}
              className={`min-h-[34px] px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeTypeFilter === "ENCONTRADO"
                  ? "bg-white dark:bg-slate-800 text-[#16845B] dark:text-emerald-400 font-semibold"
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
              className={`min-h-[34px] px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeTypeFilter === "PERDIDO"
                  ? "bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 font-semibold"
                  : "text-slate-600 dark:text-slate-400 hover:text-rose-600"
              }`}
            >
              Perdidos
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              vibrateClick();
              navigate("/objetos");
            }}
            className="min-h-[36px] px-2 text-xs font-semibold text-[#16845B] dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer shrink-0"
          >
            <span>Ver todos</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {filteredItems.length === 0 ? (
          <EmptyState
            icon={<PackageSearch className="w-5 h-5" />}
            title={
              items.length === 0
                ? "Nenhum objeto registrado no momento"
                : "Nenhum objeto encontrado para esta busca"
            }
            description={
              items.length === 0
                ? "Os itens entregues na Portaria ou SEPAE aparecerão aqui."
                : "Tente limpar o filtro ou consultar o catálogo completo."
            }
            action={
              (quickSearch || activeTypeFilter !== "TODOS") && (
                <button
                  type="button"
                  onClick={() => {
                    setQuickSearch("");
                    setActiveTypeFilter("TODOS");
                  }}
                  className="min-h-[40px] px-4 rounded-lg bg-[#16845B] text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Limpar filtro</span>
                </button>
              )
            }
          />
        ) : (
          <div className="divide-y divide-slate-200/80 dark:divide-slate-800 sm:divide-y-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-4">
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
    </div>
  );
};
