import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useApp } from "../context/AppContext";
import { ItemCard } from "./ItemCard";
import { ExportFoundItemsReportModal } from "./ExportFoundItemsReportModal";
import { VoiceSearchModal } from "./VoiceSearchModal";
import { IFPR_LOCATIONS, IFPR_LOCATION_GROUPS } from "../data/mockData";
import { ItemCategory, LostFoundItem } from "../types";
import { isCategoryMatch, getCategoryDisplay } from "../lib/categoryUtils";
import {
  formatDate,
  vibrateClick,
  safeToLower,
  safeIncludes,
  sanitizeQuery,
  isItemNew,
  safeParseDate,
} from "../lib/utils";
import {
  Search,
  Filter,
  SlidersHorizontal,
  RefreshCw,
  PackageSearch,
  Tag,
  MapPin,
  Calendar,
  Clock,
  X,
  Sparkles,
  CheckSquare,
  Trash2,
  CheckCircle2,
  Building2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  RotateCcw,
  Laptop,
  FileText,
  Shirt,
  Key,
  BookOpen,
  Watch,
  Coffee,
  Umbrella,
  HelpCircle,
  Mic,
  WifiOff,
  CameraOff,
  LayoutGrid,
  List,
} from "lucide-react";
import {
  cacheSearchedItems,
  getOfflineRecentItems,
  cacheSingleItemPreview,
} from "../lib/recentItemsOfflineService";
import {
  SurfaceCard,
  SubtlePanel,
  UIBadge,
  UIButton,
  UIInput,
  UISelect,
  EmptyState,
} from "./ui";

interface ObjectsViewProps {
  initialFilterType?: "TODOS" | "PERDIDO" | "ENCONTRADO" | "DEVOLVIDO";
}

const CAMPUS_BLOCKS = [
  { id: "TODOS", label: "Todos os Blocos", shortLabel: "Todos os Blocos", icon: Building2 },
  { id: "Bloco 1", label: "Bloco 1", shortLabel: "Bloco 1", icon: Building2 },
  { id: "Bloco 2", label: "Bloco 2", shortLabel: "Bloco 2", icon: Building2 },
  { id: "Bloco 3", label: "Bloco 3", shortLabel: "Bloco 3", icon: Building2 },
  { id: "Bloco 4", label: "Bloco 4", shortLabel: "Bloco 4", icon: Building2 },
  { id: "Bloco 5", label: "Bloco 5", shortLabel: "Bloco 5", icon: Building2 },
];

const TIME_PRESETS = [
  { id: "TODOS", label: "Qualquer período" },
  { id: "24H", label: "Últimas 24 horas (Novos)" },
  { id: "HOJE", label: "Hoje" },
  { id: "7_DIAS", label: "Últimos 7 dias" },
  { id: "30_DIAS", label: "Últimos 30 dias" },
  { id: "SEMESTRE_ATUAL", label: "Semestre Letivo Atual" },
  { id: "CUSTOM", label: "Personalizado (De / Até)" },
];

const PAGE_STEP = 18;

export const ObjectsView: React.FC<ObjectsViewProps> = ({
  initialFilterType = "TODOS",
}) => {
  const {
    items,
    setSelectedItemForDetail,
    currentUser,
    bulkUpdateItemStatus,
    bulkDeleteItems,
  } = useApp();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterType, setFilterType] = useState<
    "TODOS" | "PERDIDO" | "ENCONTRADO" | "EM_ANALISE" | "DEVOLVIDO"
  >(initialFilterType);

  useEffect(() => {
    setFilterType(initialFilterType);
  }, [initialFilterType]);

  const [selectedCategory, setSelectedCategory] = useState<string>("TODAS");
  const [selectedLocation, setSelectedLocation] = useState<string>("TODOS");
  const [selectedCampusBlock, setSelectedCampusBlock] = useState<string>("TODOS");
  const [selectedTimePreset, setSelectedTimePreset] = useState<string>("TODOS");
  const [selectedColor, setSelectedColor] = useState<string>("TODAS");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");
  const [sortBy, setSortBy] = useState<"recentes" | "antigos">("recentes");
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [layoutViewMode, setLayoutViewMode] = useState<
    "ADAPTATIVO" | "CARDS" | "LISTA"
  >("CARDS");
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] =
    useState<boolean>(false);
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_STEP);

  // Offline search preview support via Service Worker (sw-custom.js) & local cache
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );
  const [offlineRecentItems, setOfflineRecentItems] = useState<LostFoundItem[]>(
    []
  );
  const [offlineCachedCount, setOfflineCachedCount] = useState<number>(0);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => {
      setIsOffline(true);
      getOfflineRecentItems().then((res) => {
        setOfflineRecentItems(res.items);
        setOfflineCachedCount(res.count);
      });
    };

    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    getOfflineRecentItems().then((res) => {
      setOfflineRecentItems(res.items);
      setOfflineCachedCount(res.count);
    });

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      }
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 250);

    return () => {
      clearTimeout(timer);
    };
  }, [search]);

  // Reset pagination whenever filters change
  useEffect(() => {
    setVisibleCount(PAGE_STEP);
  }, [
    filterType,
    selectedCategory,
    selectedCampusBlock,
    selectedLocation,
    selectedColor,
    selectedTimePreset,
    filterStartDate,
    filterEndDate,
    debouncedSearch,
    sortBy,
  ]);

  // Bulk operations selection state
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [isSelectableMode, setIsSelectableMode] = useState<boolean>(false);
  const [isExportReportModalOpen, setIsExportReportModalOpen] =
    useState<boolean>(false);
  const [isVoiceSearchOpen, setIsVoiceSearchOpen] = useState<boolean>(false);

  const isAdminOrServer =
    currentUser.role === "ADMIN" || currentUser.role === "SERVIDOR";

  const handleToggleSelectItem = (id: string, shouldSelect: boolean) => {
    if (shouldSelect) {
      setSelectedItemIds((prev) => [...prev, id]);
    } else {
      setSelectedItemIds((prev) => prev.filter((i) => i !== id));
    }
  };

  const handleSelectAllFiltered = () => {
    const allFilteredIds = filteredItems.map((i) => i.id);
    if (selectedItemIds.length === allFilteredIds.length) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(allFilteredIds);
    }
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ifpr_achados_search_history");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setSearchHistory(parsed);
      }
    } catch (_) {}
  }, []);

  const saveSearchTerm = (term: string) => {
    const trimmed = sanitizeQuery(term);
    if (!trimmed || trimmed.length < 2) return;
    setSearchHistory((prev) => {
      const filtered = (prev || []).filter(
        (t) =>
          safeToLower(t, "ObjectsView.tsx -> saveSearchTerm -> t") !==
          safeToLower(trimmed, "ObjectsView.tsx -> saveSearchTerm -> trimmed")
      );
      const updated = [trimmed, ...filtered].slice(0, 6);
      try {
        localStorage.setItem(
          "ifpr_achados_search_history",
          JSON.stringify(updated)
        );
      } catch (_) {}
      return updated;
    });
  };

  const removeSearchHistoryItem = (
    termToRemove: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    setSearchHistory((prev) => {
      const updated = (prev || []).filter(
        (t) =>
          safeToLower(t, "ObjectsView.tsx -> removeSearchHistoryItem -> t") !==
          safeToLower(
            termToRemove,
            "ObjectsView.tsx -> removeSearchHistoryItem -> termToRemove"
          )
      );
      try {
        localStorage.setItem(
          "ifpr_achados_search_history",
          JSON.stringify(updated)
        );
      } catch (_) {}
      return updated;
    });
  };

  const clearAllSearchHistory = () => {
    vibrateClick();
    setSearchHistory([]);
    try {
      localStorage.removeItem("ifpr_achados_search_history");
    } catch (_) {}
  };

  const categoriesList: {
    name: ItemCategory;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { name: "Eletrônicos", icon: Laptop },
    { name: "Documentos & Cartões", icon: FileText },
    { name: "Roupas & Calçados", icon: Shirt },
    { name: "Chaves", icon: Key },
    { name: "Material Escolar & Livros", icon: BookOpen },
    { name: "Acessórios & Bijuterias", icon: Watch },
    { name: "Garrafas & Marmitas", icon: Coffee },
    { name: "Guarda-chuvas", icon: Umbrella },
    { name: "Outros", icon: HelpCircle },
  ];

  const colorsList = [
    "TODAS",
    "Verde",
    "Preto",
    "Cinza / Prata",
    "Azul",
    "Vermelho",
    "Branco",
  ];

  const activeItemsPool = useMemo(() => {
    if (items && items.length > 0) {
      return items;
    }
    if ((isOffline || items.length === 0) && offlineRecentItems.length > 0) {
      return offlineRecentItems;
    }
    return items || [];
  }, [items, isOffline, offlineRecentItems]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { TODAS: activeItemsPool.length };
    categoriesList.forEach((c) => {
      counts[c.name] = activeItemsPool.filter((i) =>
        isCategoryMatch(i.category, c.name)
      ).length;
    });
    return counts;
  }, [activeItemsPool]);

  const statusCounts = useMemo(() => {
    return {
      TODOS: activeItemsPool.length,
      ENCONTRADO: activeItemsPool.filter(
        (i) => i.type === "ENCONTRADO" && i.status !== "DEVOLVIDO"
      ).length,
      PERDIDO: activeItemsPool.filter(
        (i) => i.type === "PERDIDO" && i.status !== "DEVOLVIDO"
      ).length,
      EM_ANALISE: activeItemsPool.filter((i) => i.status === "EM_ANALISE")
        .length,
      DEVOLVIDO: activeItemsPool.filter((i) => i.status === "DEVOLVIDO")
        .length,
    };
  }, [activeItemsPool]);

  const filteredItems = useMemo(() => {
    const cleanSearch = sanitizeQuery(debouncedSearch);
    const cleanBlock = sanitizeQuery(selectedCampusBlock);
    const cleanCategory = sanitizeQuery(selectedCategory);
    const cleanColor = sanitizeQuery(selectedColor);
    const cleanLocation = sanitizeQuery(selectedLocation);

    return (activeItemsPool || [])
      .filter((item) => {
        if (!item) return false;

        // Situation / Status filter
        if (filterType === "PERDIDO" && item.type !== "PERDIDO") return false;
        if (filterType === "ENCONTRADO" && item.type !== "ENCONTRADO")
          return false;
        if (filterType === "EM_ANALISE" && item.status !== "EM_ANALISE")
          return false;
        if (filterType === "DEVOLVIDO" && item.status !== "DEVOLVIDO")
          return false;

        // Category filter
        if (cleanCategory && !isCategoryMatch(item.category, cleanCategory))
          return false;

        // Campus Block filter
        if (cleanBlock && cleanBlock !== "TODOS") {
          if (!safeIncludes(item.location, cleanBlock)) return false;
        }

        // Specific location filter
        if (
          cleanLocation &&
          cleanLocation !== "TODOS" &&
          item.location !== cleanLocation
        )
          return false;

        // Color filter
        if (cleanColor && cleanColor !== "TODAS") {
          if (!safeIncludes(item.color, cleanColor)) return false;
        }

        // Time Period Preset filter
        if (selectedTimePreset !== "TODOS") {
          const itemTime =
            safeParseDate(item.date || item.createdAt)?.getTime() || 0;
          const now = new Date();

          if (selectedTimePreset === "24H") {
            const twentyFourHoursAgo = now.getTime() - 24 * 60 * 60 * 1000;
            if (itemTime < twentyFourHoursAgo) return false;
          } else if (selectedTimePreset === "HOJE") {
            const startOfToday = new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate()
            ).getTime();
            if (itemTime < startOfToday) return false;
          } else if (selectedTimePreset === "7_DIAS") {
            const sevenDaysAgo = new Date(
              now.getTime() - 7 * 24 * 60 * 60 * 1000
            ).getTime();
            if (itemTime < sevenDaysAgo) return false;
          } else if (selectedTimePreset === "30_DIAS") {
            const thirtyDaysAgo = new Date(
              now.getTime() - 30 * 24 * 60 * 60 * 1000
            ).getTime();
            if (itemTime < thirtyDaysAgo) return false;
          } else if (selectedTimePreset === "SEMESTRE_ATUAL") {
            const sixMonthsAgo = new Date(
              now.getTime() - 180 * 24 * 60 * 60 * 1000
            ).getTime();
            if (itemTime < sixMonthsAgo) return false;
          }
        }

        // Custom Date Range Filter
        if (filterStartDate) {
          const itemDate = safeParseDate(item.date || item.createdAt);
          const start = safeParseDate(filterStartDate);
          if (start && itemDate) {
            start.setHours(0, 0, 0, 0);
            if (itemDate < start) return false;
          }
        }
        if (filterEndDate) {
          const itemDate = safeParseDate(item.date || item.createdAt);
          const end = safeParseDate(filterEndDate);
          if (end && itemDate) {
            end.setHours(23, 59, 59, 999);
            if (itemDate > end) return false;
          }
        }

        // Text Search Query
        if (cleanSearch) {
          const matchesTitle = safeIncludes(item.title, cleanSearch);
          const matchesDesc = safeIncludes(item.description, cleanSearch);
          const matchesBrand = safeIncludes(item.brand, cleanSearch);
          const matchesLoc = safeIncludes(item.location, cleanSearch);
          const matchesId = safeIncludes(item.id, cleanSearch);
          const matchesQr = safeIncludes(item.qrCodeId, cleanSearch);

          if (
            !matchesTitle &&
            !matchesDesc &&
            !matchesBrand &&
            !matchesLoc &&
            !matchesId &&
            !matchesQr
          ) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        const dateA = safeParseDate(a.createdAt || a.date)?.getTime() || 0;
        const dateB = safeParseDate(b.createdAt || b.date)?.getTime() || 0;
        return sortBy === "recentes" ? dateB - dateA : dateA - dateB;
      });
  }, [
    activeItemsPool,
    filterType,
    selectedCategory,
    selectedCampusBlock,
    selectedLocation,
    selectedColor,
    selectedTimePreset,
    filterStartDate,
    filterEndDate,
    debouncedSearch,
    sortBy,
  ]);

  useEffect(() => {
    if (filteredItems && filteredItems.length > 0) {
      cacheSearchedItems(filteredItems, debouncedSearch);
      setOfflineCachedCount((prev) => Math.max(prev, filteredItems.length));
    }
  }, [filteredItems, debouncedSearch]);

  const handleItemClick = (item: LostFoundItem) => {
    cacheSingleItemPreview(item);
    setSelectedItemForDetail(item);
  };

  const activeFiltersCount =
    (search.trim() ? 1 : 0) +
    (filterType !== "TODOS" ? 1 : 0) +
    (selectedCategory !== "TODAS" ? 1 : 0) +
    (selectedCampusBlock !== "TODOS" ? 1 : 0) +
    (selectedLocation !== "TODOS" ? 1 : 0) +
    (selectedColor !== "TODAS" ? 1 : 0) +
    (selectedTimePreset !== "TODOS" ? 1 : 0) +
    (filterStartDate ? 1 : 0) +
    (filterEndDate ? 1 : 0);

  const clearFilters = () => {
    vibrateClick();
    setSearch("");
    setDebouncedSearch("");
    setFilterType("TODOS");
    setSelectedCategory("TODAS");
    setSelectedCampusBlock("TODOS");
    setSelectedLocation("TODOS");
    setSelectedTimePreset("TODOS");
    setSelectedColor("TODAS");
    setFilterStartDate("");
    setFilterEndDate("");
  };

  const paginatedItems = useMemo(
    () => filteredItems.slice(0, visibleCount),
    [filteredItems, visibleCount]
  );

  const getStatusBadgeInfo = (item: LostFoundItem) => {
    switch (item.status) {
      case "PERDIDO":
        return { label: "Perdido", tone: "rose" as const };
      case "ENCONTRADO":
        return { label: "Encontrado", tone: "emerald" as const };
      case "EM_ANALISE":
        return { label: "Em Análise", tone: "amber" as const };
      case "DEVOLVIDO":
        return { label: "Devolvido", tone: "blue" as const };
      default:
        return {
          label: item.type === "PERDIDO" ? "Perdido" : "Encontrado",
          tone:
            item.type === "PERDIDO" ? ("rose" as const) : ("emerald" as const),
        };
    }
  };

  return (
    <div className="space-y-4 pb-12 pt-1 sm:pt-2">
      {/* 1. CABEÇALHO COMPACTO + PESQUISA EM DESTAQUE */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#172B2A] dark:text-white tracking-tight">
              {filterType === "ENCONTRADO"
                ? "Objetos Encontrados"
                : filterType === "PERDIDO"
                ? "Objetos Perdidos"
                : filterType === "EM_ANALISE"
                ? "Objetos em Análise"
                : filterType === "DEVOLVIDO"
                ? "Objetos Devolvidos"
                : "Catálogo de Objetos"}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {filteredItems.length} {filteredItems.length === 1 ? "item listado" : "itens listados"} no acervo
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setIsExportReportModalOpen(true);
              }}
              aria-label="Exportar Relatório Oficial de Itens Encontrados em PDF para Prestação de Contas"
              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 hover:border-[#16845B] text-xs font-medium text-[#172B2A] dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-[#16845B] dark:text-emerald-400" />
              <span className="hidden sm:inline">Relatório PDF</span>
              <span className="sm:hidden">PDF</span>
            </button>

            {isAdminOrServer && (
              <button
                type="button"
                onClick={() => {
                  setIsSelectableMode(!isSelectableMode);
                  if (isSelectableMode) setSelectedItemIds([]);
                }}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 border transition-colors cursor-pointer ${
                  isSelectableMode
                    ? "bg-[#16845B] text-white border-[#16845B]"
                    : "bg-white dark:bg-[#111827] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800"
                }`}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {isSelectableMode ? "Concluir Seleção" : "Seleção"}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Linha de Pesquisa em Destaque + Botão de Filtros Compacto */}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center min-h-[46px] px-3.5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 focus-within:border-[#16845B] transition-colors">
            <Search className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e?.target?.value ?? "")}
              onBlur={() => saveSearchTerm(search)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveSearchTerm(search);
              }}
              placeholder="Buscar por nome, cor, marca, local ou QR..."
              className="w-full bg-transparent text-sm text-[#172B2A] dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setDebouncedSearch("");
                }}
                className="min-w-[34px] min-h-[34px] flex items-center justify-center text-slate-400 hover:text-[#172B2A] dark:hover:text-white cursor-pointer"
                title="Limpar busca"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              id="btn-voice-search-trigger"
              type="button"
              onClick={() => {
                vibrateClick();
                setIsVoiceSearchOpen(true);
              }}
              className="min-w-[34px] min-h-[34px] flex items-center justify-center rounded-lg text-slate-400 hover:text-[#16845B] dark:hover:text-emerald-400 transition-colors cursor-pointer"
              title="Busca por comando de voz"
              aria-label="Iniciar busca por comando de voz"
            >
              <Mic className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              vibrateClick();
              setIsAdvancedFiltersOpen(!isAdvancedFiltersOpen);
            }}
            className={`min-h-[46px] px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${
              isAdvancedFiltersOpen || activeFiltersCount > 0
                ? "bg-[#EBF5F0] dark:bg-emerald-950/50 text-[#064E3B] dark:text-emerald-300 border-[#16845B]/40"
                : "bg-white dark:bg-[#111827] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Filtros</span>
            {activeFiltersCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-[#16845B] text-white text-[10px] font-bold tabular-nums">
                {activeFiltersCount}
              </span>
            )}
          </button>

          <div
            className="hidden sm:inline-flex items-center bg-white dark:bg-[#111827] p-1 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0"
            role="group"
            aria-label="Modo de visualização do catálogo"
          >
            <button
              type="button"
              onClick={() => setLayoutViewMode("CARDS")}
              title="Visualização em Grade"
              aria-label="Visualização em Grade"
              className={`min-h-[36px] px-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                layoutViewMode !== "LISTA"
                  ? "bg-[#16845B] text-white"
                  : "text-slate-500 hover:text-[#172B2A] dark:hover:text-white"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setLayoutViewMode("LISTA")}
              title="Visualização em Lista"
              aria-label="Visualização em Lista"
              className={`min-h-[36px] px-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                layoutViewMode === "LISTA"
                  ? "bg-[#16845B] text-white"
                  : "text-slate-500 hover:text-[#172B2A] dark:hover:text-white"
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Abas Horizontais Compactas de Situação (Rolagem horizontal limpa no celular) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 tabular-nums">
          {(
            [
              { id: "TODOS", label: "Todos", count: statusCounts.TODOS },
              { id: "ENCONTRADO", label: "Encontrados", count: statusCounts.ENCONTRADO },
              { id: "PERDIDO", label: "Perdidos", count: statusCounts.PERDIDO },
              { id: "EM_ANALISE", label: "Em análise", count: statusCounts.EM_ANALISE },
              { id: "DEVOLVIDO", label: "Devolvidos", count: statusCounts.DEVOLVIDO },
            ] as const
          ).map((tab) => {
            const active = filterType === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  vibrateClick();
                  setFilterType(tab.id);
                }}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors flex items-center gap-1.5 border cursor-pointer ${
                  active
                    ? "bg-[#16845B] text-white border-[#16845B] font-semibold"
                    : "bg-white dark:bg-[#111827] text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-800 hover:border-slate-300"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[11px] ${
                    active ? "text-white/90" : "text-slate-400"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Faixa Compacta de Categorias (1 linha com rolagem horizontal, sem ocupar a tela inteira) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          <button
            type="button"
            onClick={() => {
              vibrateClick();
              setSelectedCategory("TODAS");
            }}
            className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              selectedCategory === "TODAS"
                ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold"
                : "bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:text-[#172B2A] dark:hover:text-white"
            }`}
          >
            Todas categorias
          </button>
          {categoriesList.map((cat) => {
            const isSelected = selectedCategory === cat.name;
            return (
              <button
                key={cat.name}
                type="button"
                onClick={() => {
                  vibrateClick();
                  setSelectedCategory(isSelected ? "TODAS" : cat.name);
                }}
                className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold"
                    : "bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:text-[#172B2A] dark:hover:text-white"
                }`}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Painel Compacto de Filtros (Expansível apenas sob demanda) */}
      {isAdvancedFiltersOpen && (
        <div className="p-4 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Bloco do Campus
              </label>
              <UISelect
                aria-label="Filtrar por bloco ou localização"
                value={selectedCampusBlock}
                onChange={(e) => setSelectedCampusBlock(e.target.value)}
                className="text-xs"
              >
                {CAMPUS_BLOCKS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </UISelect>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Sala ou Local Específico
              </label>
              <UISelect
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="text-xs"
              >
                <option value="TODOS">Todos os locais</option>
                {IFPR_LOCATION_GROUPS.map((group) => (
                  <optgroup key={group.group} label={group.group}>
                    {group.locations.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </UISelect>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Período
              </label>
              <UISelect
                aria-label="Filtrar por período"
                value={selectedTimePreset}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedTimePreset(val);
                  if (val !== "CUSTOM") {
                    setFilterStartDate("");
                    setFilterEndDate("");
                  }
                }}
                className="text-xs"
              >
                {TIME_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </UISelect>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Ordenação
              </label>
              <UISelect
                aria-label="Ordenar objetos"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="text-xs"
              >
                <option value="recentes">Mais recentes primeiro</option>
                <option value="antigos">Mais antigos primeiro</option>
              </UISelect>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Cor predominante
              </label>
              <div className="flex flex-wrap gap-1.5">
                {colorsList.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => {
                      vibrateClick();
                      setSelectedColor(col);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs transition-colors cursor-pointer border ${
                      selectedColor === col
                        ? "bg-[#16845B] text-white border-[#16845B] font-semibold"
                        : "bg-[#F8FAFC] dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {col}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Intervalo de datas (De / Até)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <UIInput
                  type="date"
                  aria-label="Data inicial"
                  value={filterStartDate}
                  onChange={(e) => {
                    setFilterStartDate(e.target.value);
                    setSelectedTimePreset("CUSTOM");
                  }}
                  className="py-1.5 text-xs"
                />
                <UIInput
                  type="date"
                  aria-label="Data final"
                  value={filterEndDate}
                  onChange={(e) => {
                    setFilterEndDate(e.target.value);
                    setSelectedTimePreset("CUSTOM");
                  }}
                  className="py-1.5 text-xs"
                />
              </div>
            </div>
          </div>

          {activeFiltersCount > 0 && (
            <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Redefinir filtros</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Aviso discreto quando em modo Offline */}
      {(isOffline || items.length === 0) && offlineRecentItems.length > 0 && (
        <div className="px-3.5 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>Modo offline: exibindo {filteredItems.length} itens salvos no dispositivo.</span>
          </div>
          <span className="font-mono text-[11px] shrink-0">{offlineCachedCount} em cache</span>
        </div>
      )}

      {/* 2. LISTAGEM DE OBJETOS (Mobile-First, rápida de percorrer) */}
      <div className="space-y-4">
        {isSelectableMode && (
          <div className="flex items-center justify-between text-xs bg-[#F8FAFC] dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800">
            <span className="text-slate-600 dark:text-slate-300">
              Selecione itens para ação em lote
            </span>
            <button
              type="button"
              onClick={handleSelectAllFiltered}
              className="font-semibold text-[#16845B] dark:text-emerald-400 hover:underline cursor-pointer"
            >
              {selectedItemIds.length === filteredItems.length &&
              filteredItems.length > 0
                ? "Desmarcar todos"
                : `Selecionar todos (${filteredItems.length})`}
            </button>
          </div>
        )}

        {filteredItems.length === 0 ? (
          <EmptyState
            icon={<PackageSearch className="w-6 h-6" />}
            title="Nenhum objeto encontrado"
            description={
              search
                ? `Não há resultados para "${search}".`
                : "Nenhum objeto corresponde aos filtros aplicados."
            }
            action={
              <button
                type="button"
                onClick={clearFilters}
                className="min-h-[40px] px-4 rounded-lg bg-[#16845B] text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Limpar filtros</span>
              </button>
            }
          />
        ) : layoutViewMode === "LISTA" ? (
          <div className="bg-white dark:bg-[#111827] rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8FAFC] dark:bg-slate-900 text-slate-500 dark:text-slate-400 font-medium border-b border-slate-200/80 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Objeto</th>
                    <th className="py-3 px-4">Situação</th>
                    <th className="py-3 px-4">Categoria</th>
                    <th className="py-3 px-4">Local</th>
                    <th className="py-3 px-4">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paginatedItems.map((item) => {
                    const badge = getStatusBadgeInfo(item);
                    return (
                      <tr
                        key={item.id}
                        onClick={() => handleItemClick(item)}
                        className="hover:bg-[#F8FAFC] dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 font-semibold text-[#172B2A] dark:text-white">
                          {item.title}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`font-semibold ${
                              badge.tone === "emerald"
                                ? "text-[#16845B] dark:text-emerald-400"
                                : badge.tone === "rose"
                                ? "text-rose-600 dark:text-rose-400"
                                : badge.tone === "amber"
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-blue-600 dark:text-blue-400"
                            }`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {getCategoryDisplay(item.category)}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300 max-w-[200px] truncate">
                          {item.location}
                        </td>
                        <td className="py-3 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                          {formatDate(item.date)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-200/80 dark:divide-slate-800 sm:divide-y-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-4">
            {paginatedItems.map((item, idx) => (
              <ItemCard
                key={item.id}
                item={item}
                index={idx}
                onSelect={handleItemClick}
                selectable={isSelectableMode}
                isSelected={selectedItemIds.includes(item.id)}
                onToggleSelect={handleToggleSelectItem}
              />
            ))}
          </div>
        )}

        {/* Paginação Progressiva */}
        {filteredItems.length > visibleCount && (
          <div className="pt-2 flex justify-center">
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setVisibleCount((prev) => prev + PAGE_STEP);
              }}
              className="min-h-[44px] px-5 rounded-xl bg-white dark:bg-[#111827] hover:bg-[#F8FAFC] dark:hover:bg-slate-800 text-[#172B2A] dark:text-slate-200 border border-slate-200 dark:border-slate-800 text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              <span>
                Carregar mais ({filteredItems.length - visibleCount} restantes)
              </span>
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* BARRA FLUTUANTE DE AÇÕES EM MASSA */}
      {selectedItemIds.length > 0 && (
        <div className="fixed bottom-16 lg:bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#111827] text-white px-4 py-3 rounded-xl border border-slate-700 flex flex-wrap items-center justify-between gap-3 max-w-lg w-[92%]">
          <span className="text-xs font-semibold tabular-nums">
            {selectedItemIds.length} selecionado(s)
          </span>

          <div className="flex items-center gap-2">
            <UIButton
              type="button"
              variant="primary"
              size="sm"
              onClick={async () => {
                try {
                  const res = await bulkUpdateItemStatus(
                    selectedItemIds,
                    "EM_ANALISE"
                  );
                  if (res && res.succeededIds) {
                    setSelectedItemIds((prev) =>
                      prev.filter((id) => !res.succeededIds.includes(id))
                    );
                  } else {
                    setSelectedItemIds([]);
                  }
                } catch (_) {}
              }}
            >
              <span>Mover p/ Análise</span>
            </UIButton>

            {isAdminOrServer && (
              <UIButton
                type="button"
                variant="danger"
                size="sm"
                onClick={async () => {
                  if (
                    window.confirm(
                      `Tem certeza que deseja excluir permanentemente ${selectedItemIds.length} objeto(s)?`
                    )
                  ) {
                    try {
                      const res = await bulkDeleteItems(selectedItemIds);
                      if (res && res.succeededIds) {
                        setSelectedItemIds((prev) =>
                          prev.filter((id) => !res.succeededIds.includes(id))
                        );
                      } else {
                        setSelectedItemIds([]);
                      }
                    } catch (_) {}
                  }
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir</span>
              </UIButton>
            )}

            <button
              type="button"
              onClick={() => setSelectedItemIds([])}
              className="p-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Cancelar seleção"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modal de Exportação de Relatório Oficial em PDF */}
      <ExportFoundItemsReportModal
        isOpen={isExportReportModalOpen}
        onClose={() => setIsExportReportModalOpen(false)}
      />

      {/* Modal de Busca por Comando de Voz */}
      <VoiceSearchModal
        isOpen={isVoiceSearchOpen}
        onClose={() => setIsVoiceSearchOpen(false)}
        onSearchQuery={(voiceQuery) => {
          setSearch(voiceQuery);
          setDebouncedSearch(voiceQuery);
          saveSearchTerm(voiceQuery);
        }}
      />
    </div>
  );
};

export default ObjectsView;
