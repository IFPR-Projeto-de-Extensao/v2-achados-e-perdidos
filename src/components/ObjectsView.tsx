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
    <div className="space-y-6 pb-16 pt-2 sm:pt-4">
      {/* 1. CABEÇALHO DO CATÁLOGO E SEGMENTAÇÃO POR SITUAÇÃO */}
      <SurfaceCard padding="lg" className="space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <UIBadge tone="emerald">
                <PackageSearch className="w-3.5 h-3.5 text-[#16845B] dark:text-emerald-400" />
                <span>Acervo Público • IFPR Campus Ivaiporã</span>
              </UIBadge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#172B2A] dark:text-white tracking-tight">
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
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              Consulte ocorrências registradas na Portaria e SEPAE por situação, categoria, localização ou período.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <UIButton
              type="button"
              variant="secondary"
              size="md"
              onClick={() => {
                vibrateClick();
                setIsExportReportModalOpen(true);
              }}
              aria-label="Exportar Relatório Oficial de Itens Encontrados em PDF para Prestação de Contas"
            >
              <FileText className="w-4 h-4 text-[#16845B] dark:text-emerald-400" />
              <span>Exportar Relatório PDF</span>
            </UIButton>

            {isAdminOrServer && (
              <UIButton
                type="button"
                variant={isSelectableMode ? "primary" : "outline"}
                size="md"
                onClick={() => {
                  setIsSelectableMode(!isSelectableMode);
                  if (isSelectableMode) setSelectedItemIds([]);
                }}
              >
                <CheckSquare className="w-4 h-4" />
                <span>
                  {isSelectableMode ? "Concluir Seleção" : "Seleção em Massa"}
                </span>
              </UIButton>
            )}
          </div>
        </div>

        {/* Abas de Situação (Todos, Encontrados, Perdidos, Em Análise, Devolvidos) */}
        <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-slate-100 dark:border-slate-800 tabular-nums">
          <button
            type="button"
            onClick={() => {
              vibrateClick();
              setFilterType("TODOS");
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 border ${
              filterType === "TODOS"
                ? "bg-[#16845B] text-white border-[#16845B] shadow-2xs"
                : "bg-[#F8FAFC] dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-[#16845B]/50"
            }`}
          >
            <span>Todos</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                filterType === "TODOS"
                  ? "bg-white/20 text-white"
                  : "bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
              }`}
            >
              {statusCounts.TODOS}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              vibrateClick();
              setFilterType("ENCONTRADO");
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 border ${
              filterType === "ENCONTRADO"
                ? "bg-[#16845B] text-white border-[#16845B] shadow-2xs"
                : "bg-[#F8FAFC] dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-[#16845B]/50"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Encontrados</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                filterType === "ENCONTRADO"
                  ? "bg-white/20 text-white"
                  : "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300"
              }`}
            >
              {statusCounts.ENCONTRADO}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              vibrateClick();
              setFilterType("PERDIDO");
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 border ${
              filterType === "PERDIDO"
                ? "bg-rose-600 text-white border-rose-600 shadow-2xs"
                : "bg-[#F8FAFC] dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-rose-400"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>Perdidos</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                filterType === "PERDIDO"
                  ? "bg-white/20 text-white"
                  : "bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300"
              }`}
            >
              {statusCounts.PERDIDO}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              vibrateClick();
              setFilterType("EM_ANALISE");
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 border ${
              filterType === "EM_ANALISE"
                ? "bg-amber-600 text-white border-amber-600 shadow-2xs"
                : "bg-[#F8FAFC] dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-400"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Em Análise</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                filterType === "EM_ANALISE"
                  ? "bg-white/20 text-white"
                  : "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300"
              }`}
            >
              {statusCounts.EM_ANALISE}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              vibrateClick();
              setFilterType("DEVOLVIDO");
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 border ${
              filterType === "DEVOLVIDO"
                ? "bg-sky-600 text-white border-sky-600 shadow-2xs"
                : "bg-[#F8FAFC] dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-sky-400"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-sky-500" />
            <span>Devolvidos</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                filterType === "DEVOLVIDO"
                  ? "bg-white/20 text-white"
                  : "bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300"
              }`}
            >
              {statusCounts.DEVOLVIDO}
            </span>
          </button>
        </div>
      </SurfaceCard>

      {/* Banner de Pré-visualização Offline (Service Worker) */}
      {(isOffline || items.length === 0) && offlineRecentItems.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 shrink-0">
              <WifiOff className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-950 dark:text-amber-100 flex items-center gap-2">
                <span>Pré-visualização Offline do Service Worker Ativa</span>
                <UIBadge tone="amber">sw-custom.js</UIBadge>
              </p>
              <p className="text-[11px] text-amber-800 dark:text-amber-300/90 mt-0.5">
                Você está sem conexão com a internet. Exibindo{" "}
                {filteredItems.length}{" "}
                {filteredItems.length === 1
                  ? "item pesquisado recentemente"
                  : "itens pesquisados recentemente"}{" "}
                em cache do Service Worker para consulta imediata.
              </p>
            </div>
          </div>
          <UIBadge tone="amber" className="font-mono shrink-0">
            {offlineCachedCount} no cache offline
          </UIBadge>
        </div>
      )}

      {/* 2. BARRA DE BUSCA E FILTROS ORGANIZADOS */}
      <SurfaceCard padding="md" className="space-y-4">
        {/* Linha principal: Busca + Filtros diretos (Categoria, Localização/Bloco, Período, Ordenação) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
          {/* Campo de busca textual e por voz */}
          <div className="lg:col-span-5 space-y-2">
            <UIInput
              type="text"
              value={search}
              onChange={(e) => setSearch(e?.target?.value ?? "")}
              onBlur={() => saveSearchTerm(search)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveSearchTerm(search);
              }}
              placeholder="Buscar por nome, marca, cor, local ou QR Code..."
              leftIcon={<Search className="w-4 h-4" />}
              rightElement={
                <div className="flex items-center gap-1">
                  {search && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch("");
                        setDebouncedSearch("");
                      }}
                      className="p-1 text-slate-400 hover:text-[#172B2A] dark:hover:text-white cursor-pointer rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors"
                      title="Limpar busca"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    id="btn-voice-search-trigger"
                    type="button"
                    onClick={() => {
                      vibrateClick();
                      setIsVoiceSearchOpen(true);
                    }}
                    className="p-1.5 rounded-lg bg-[#EBF5F0] hover:bg-[#16845B] text-[#16845B] hover:text-white dark:bg-emerald-950/70 dark:text-emerald-400 dark:hover:bg-[#16845B] dark:hover:text-white transition-all cursor-pointer flex items-center justify-center"
                    title="Busca por Comando de Voz ('Localiza [objeto]')"
                    aria-label="Iniciar busca por comando de voz"
                  >
                    <Mic className="w-3.5 h-3.5" />
                  </button>
                </div>
              }
            />

            {/* Histórico de buscas */}
            {searchHistory.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1 font-semibold">
                  <Clock className="w-3 h-3 text-[#16845B]" /> Recentes:
                </span>
                {searchHistory.map((historyTerm) => (
                  <button
                    key={historyTerm}
                    type="button"
                    onClick={() => {
                      setSearch(historyTerm);
                      saveSearchTerm(historyTerm);
                    }}
                    title={`Buscar novamente "${historyTerm}"`}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#F8FAFC] dark:bg-slate-800 hover:bg-[#EBF5F0] hover:text-[#064E3B] dark:hover:text-emerald-300 text-slate-700 dark:text-slate-300 transition-all border border-slate-200 dark:border-slate-700 font-medium cursor-pointer"
                  >
                    <span>{historyTerm}</span>
                    <span
                      onClick={(e) => removeSearchHistoryItem(historyTerm, e)}
                      title="Remover termo"
                      className="hover:text-red-600 rounded-full w-3.5 h-3.5 flex items-center justify-center ml-0.5 text-xs text-slate-400"
                    >
                      ×
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={clearAllSearchHistory}
                  title="Limpar histórico de pesquisas recentes"
                  className="text-[11px] text-slate-400 hover:text-red-600 underline ml-1 cursor-pointer font-medium"
                >
                  Limpar
                </button>
              </div>
            )}
          </div>

          {/* Seletores diretos: Categoria, Localização/Bloco, Período, Ordenação */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
            <UISelect
              aria-label="Filtrar por categoria"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="text-xs"
            >
              <option value="TODAS">
                Todas as Categorias ({categoryCounts.TODAS})
              </option>
              {categoriesList.map((cat) => (
                <option key={cat.name} value={cat.name}>
                  {cat.name} ({categoryCounts[cat.name] || 0})
                </option>
              ))}
            </UISelect>

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

            <UISelect
              aria-label="Filtrar por período"
              value={selectedTimePreset}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedTimePreset(val);
                if (val === "CUSTOM") {
                  setIsAdvancedFiltersOpen(true);
                } else {
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

            <UISelect
              aria-label="Ordenar objetos"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-xs"
            >
              <option value="recentes">Mais Recentes</option>
              <option value="antigos">Mais Antigos</option>
            </UISelect>
          </div>
        </div>

        {/* Barra secundária: Categorias rápidas, Mais Filtros e Modo de Visualização */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          {/* Categorias em pílulas discretas */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setSelectedCategory("TODAS");
              }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border whitespace-nowrap ${
                selectedCategory === "TODAS"
                  ? "bg-[#EBF5F0] dark:bg-emerald-950/60 text-[#064E3B] dark:text-emerald-300 border-[#16845B]/30"
                  : "bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-[#16845B]/40"
              }`}
            >
              Todas Categorias
            </button>
            {categoriesList.map((cat) => {
              const IconComp = cat.icon;
              const isSelected = selectedCategory === cat.name;
              return (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => {
                    vibrateClick();
                    setSelectedCategory(isSelected ? "TODAS" : cat.name);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer border whitespace-nowrap ${
                    isSelected
                      ? "bg-[#16845B] text-white border-[#16845B]"
                      : "bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-[#16845B]/40"
                  }`}
                >
                  <IconComp
                    className={`w-3.5 h-3.5 ${
                      isSelected
                        ? "text-white"
                        : "text-[#16845B] dark:text-emerald-400"
                    }`}
                  />
                  <span>{cat.name}</span>
                </button>
              );
            })}
          </div>

          {/* Controles de Filtros Avançados e Alternância Grade / Lista */}
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <UIButton
              type="button"
              variant={isAdvancedFiltersOpen ? "primary" : "secondary"}
              size="sm"
              onClick={() => {
                vibrateClick();
                setIsAdvancedFiltersOpen(!isAdvancedFiltersOpen);
              }}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Mais Filtros</span>
              {activeFiltersCount > 0 && (
                <span
                  className={`px-1.5 py-0.2 text-[10px] rounded-full font-bold ${
                    isAdvancedFiltersOpen
                      ? "bg-white/20 text-white"
                      : "bg-[#EBF5F0] text-[#064E3B] dark:bg-emerald-950 dark:text-emerald-300"
                  }`}
                >
                  {activeFiltersCount}
                </span>
              )}
              {isAdvancedFiltersOpen ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </UIButton>

            {/* Alternador Grade / Lista */}
            <div
              className="inline-flex items-center bg-[#F8FAFC] dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700"
              role="group"
              aria-label="Modo de visualização do catálogo"
            >
              <button
                type="button"
                onClick={() => setLayoutViewMode("CARDS")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                  layoutViewMode !== "LISTA"
                    ? "bg-[#16845B] text-white shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-[#172B2A] dark:hover:text-white"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Grade</span>
              </button>
              <button
                type="button"
                onClick={() => setLayoutViewMode("LISTA")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                  layoutViewMode === "LISTA"
                    ? "bg-[#16845B] text-white shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-[#172B2A] dark:hover:text-white"
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Lista</span>
              </button>
            </div>
          </div>
        </div>

        {/* Painel Expansível de Filtros Detalhados (Local Específico, Cor e Intervalo de Datas) */}
        <AnimatePresence>
          {isAdvancedFiltersOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="pt-3 border-t border-slate-100 dark:border-slate-800 overflow-hidden"
            >
              <SubtlePanel
                padding="md"
                className="grid grid-cols-1 md:grid-cols-3 gap-4"
              >
                {/* Sala ou Local Específico */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#172B2A] dark:text-slate-200 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#16845B]" />
                    <span>Sala ou Local Específico</span>
                  </label>
                  <UISelect
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="text-xs"
                  >
                    <option value="TODOS">Todos os Locais Detalhados</option>
                    {IFPR_LOCATION_GROUPS.map((group) => (
                      <optgroup key={group.group} label={group.group}>
                        {group.locations.map((loc) => (
                          <option key={loc} value={loc}>
                            {loc}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    {selectedLocation &&
                      selectedLocation !== "TODOS" &&
                      !IFPR_LOCATIONS.includes(selectedLocation) && (
                        <option value={selectedLocation}>
                          {selectedLocation} (Legado)
                        </option>
                      )}
                  </UISelect>
                </div>

                {/* Cor Predominante */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#172B2A] dark:text-slate-200 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-[#16845B]" />
                    <span>Cor Predominante</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {colorsList.map((col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => {
                          vibrateClick();
                          setSelectedColor(col);
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${
                          selectedColor === col
                            ? "bg-[#16845B] text-white border-[#16845B]"
                            : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-[#16845B]/40"
                        }`}
                      >
                        {col}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Intervalo de Datas Específico */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#172B2A] dark:text-slate-200 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#16845B]" />
                    <span>Intervalo de Datas (De / Até)</span>
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
              </SubtlePanel>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chips de Filtros Ativos */}
        {activeFiltersCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
              <Filter className="w-3 h-3 text-[#16845B]" /> Filtros ativos:
            </span>

            {search.trim() && (
              <UIBadge tone="slate">
                <span>Busca: "{search}"</span>
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setDebouncedSearch("");
                  }}
                  className="hover:text-red-500 ml-1 cursor-pointer"
                >
                  ×
                </button>
              </UIBadge>
            )}

            {filterType !== "TODOS" && (
              <UIBadge tone="emerald">
                <span>Situação: {filterType}</span>
                <button
                  type="button"
                  onClick={() => setFilterType("TODOS")}
                  className="hover:text-red-500 ml-1 cursor-pointer"
                >
                  ×
                </button>
              </UIBadge>
            )}

            {selectedCategory !== "TODAS" && (
              <UIBadge tone="emerald">
                <span>Categoria: {selectedCategory}</span>
                <button
                  type="button"
                  onClick={() => setSelectedCategory("TODAS")}
                  className="hover:text-red-500 ml-1 cursor-pointer"
                >
                  ×
                </button>
              </UIBadge>
            )}

            {selectedCampusBlock !== "TODOS" && (
              <UIBadge tone="blue">
                <span>Bloco: {selectedCampusBlock}</span>
                <button
                  type="button"
                  onClick={() => setSelectedCampusBlock("TODOS")}
                  className="hover:text-red-500 ml-1 cursor-pointer"
                >
                  ×
                </button>
              </UIBadge>
            )}

            {selectedLocation !== "TODOS" && (
              <UIBadge tone="blue">
                <span>Local: {selectedLocation}</span>
                <button
                  type="button"
                  onClick={() => setSelectedLocation("TODOS")}
                  className="hover:text-red-500 ml-1 cursor-pointer"
                >
                  ×
                </button>
              </UIBadge>
            )}

            {selectedTimePreset !== "TODOS" && (
              <UIBadge tone="slate">
                <span>
                  Período:{" "}
                  {TIME_PRESETS.find((p) => p.id === selectedTimePreset)
                    ?.label || selectedTimePreset}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedTimePreset("TODOS")}
                  className="hover:text-red-500 ml-1 cursor-pointer"
                >
                  ×
                </button>
              </UIBadge>
            )}

            {selectedColor !== "TODAS" && (
              <UIBadge tone="amber">
                <span>Cor: {selectedColor}</span>
                <button
                  type="button"
                  onClick={() => setSelectedColor("TODAS")}
                  className="hover:text-red-500 ml-1 cursor-pointer"
                >
                  ×
                </button>
              </UIBadge>
            )}

            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer ml-auto flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Limpar todos os filtros</span>
            </button>
          </div>
        )}
      </SurfaceCard>

      {/* 3. RESULTADOS DO CATÁLOGO (GRADE OU LISTA) */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400 px-1">
          <span>
            Exibindo{" "}
            <strong className="text-[#172B2A] dark:text-white tabular-nums">
              {paginatedItems.length}
            </strong>{" "}
            de{" "}
            <strong className="text-[#172B2A] dark:text-white tabular-nums">
              {filteredItems.length}
            </strong>{" "}
            objetos localizados ({items.length} no acervo total)
          </span>

          {isSelectableMode && (
            <div className="flex items-center gap-2">
              <UIButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleSelectAllFiltered}
              >
                {selectedItemIds.length === filteredItems.length &&
                filteredItems.length > 0
                  ? "Desmarcar Todos"
                  : `Selecionar Todos (${filteredItems.length})`}
              </UIButton>
            </div>
          )}
        </div>

        {filteredItems.length === 0 ? (
          <EmptyState
            icon={<PackageSearch className="w-7 h-7" />}
            title="Nenhum objeto localizado no acervo"
            description={
              search
                ? `Não encontramos ocorrências correspondentes a "${search}". Tente buscar por termos mais simples ou selecione outra categoria.`
                : "Não encontramos itens com os filtros selecionados no momento. Experimente redefinir os filtros do IFPR Campus Ivaiporã."
            }
            action={
              <UIButton
                type="button"
                variant="primary"
                size="md"
                onClick={clearFilters}
              >
                <RefreshCw className="w-4 h-4" />
                <span>Limpar Todos os Filtros</span>
              </UIButton>
            }
          />
        ) : layoutViewMode === "LISTA" ? (
          /* VISUALIZAÇÃO EM LISTA LIMPA E ESTRUTURADA */
          <SurfaceCard padding="none" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8FAFC] dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 uppercase font-bold tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-4">Objeto</th>
                    <th className="p-4">Situação</th>
                    <th className="p-4">Categoria</th>
                    <th className="p-4">Localização</th>
                    <th className="p-4">Data</th>
                    <th className="p-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paginatedItems.map((item) => {
                    const hasImg =
                      item.imageUrl &&
                      item.imageUrl.trim() !== "" &&
                      !item.imageUrl.includes(
                        "photo-1584438784894-089d6a62b8fa"
                      );
                    const badge = getStatusBadgeInfo(item);
                    return (
                      <tr
                        key={item.id}
                        onClick={() => handleItemClick(item)}
                        className="hover:bg-[#F8FAFC] dark:hover:bg-slate-800/50 cursor-pointer transition-colors group"
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-3.5 min-w-[200px]">
                            {hasImg ? (
                              <img
                                src={item.imageUrl}
                                alt={item.title}
                                loading="lazy"
                                decoding="async"
                                className="w-12 h-12 rounded-xl object-cover border border-slate-200/80 dark:border-slate-700 shrink-0 bg-[#F8FAFC]"
                              />
                            ) : (
                              <div
                                className="w-12 h-12 rounded-xl bg-[#F8FAFC] dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 flex items-center justify-center shrink-0 text-[#16845B] dark:text-emerald-400"
                                aria-label="Sem foto anexada"
                              >
                                <CameraOff className="w-4 h-4" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-sm text-[#172B2A] dark:text-white group-hover:text-[#16845B] dark:group-hover:text-emerald-400 transition-colors">
                                  {item.title}
                                </span>
                                {isItemNew(item) && (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#16845B] text-white"
                                    title="Cadastrado nas últimas 24 horas"
                                  >
                                    <Sparkles className="w-2.5 h-2.5 text-amber-200 fill-amber-200" />
                                    Novo
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                                #{item.id} {item.color ? `• ${item.color}` : ""}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 whitespace-nowrap">
                          <UIBadge tone={badge.tone}>{badge.label}</UIBadge>
                        </td>
                        <td className="p-4 text-slate-600 dark:text-slate-300 font-medium whitespace-nowrap">
                          {getCategoryDisplay(item.category)}
                        </td>
                        <td className="p-4 text-slate-600 dark:text-slate-300">
                          <div className="flex items-center gap-1.5 max-w-[220px]">
                            <MapPin className="w-3.5 h-3.5 text-[#16845B] shrink-0" />
                            <span className="truncate">{item.location}</span>
                          </div>
                        </td>
                        <td className="p-4 text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                          {formatDate(item.date)}
                        </td>
                        <td className="p-4 text-right whitespace-nowrap">
                          <UIButton
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleItemClick(item);
                            }}
                          >
                            <span>Ver Detalhes</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </UIButton>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SurfaceCard>
        ) : (
          /* VISUALIZAÇÃO EM GRADE CONSISTENTE (Celular, Tablet e Desktop) */
          <motion.div
            layout
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 w-full max-w-full min-w-0"
          >
            <AnimatePresence mode="popLayout">
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
            </AnimatePresence>
          </motion.div>
        )}

        {/* Paginação / Carregamento Progressivo Limpo */}
        {filteredItems.length > visibleCount && (
          <div className="pt-4 flex flex-col items-center gap-2">
            <UIButton
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => {
                vibrateClick();
                setVisibleCount((prev) => prev + PAGE_STEP);
              }}
            >
              <span>
                Carregar mais objetos ({filteredItems.length - visibleCount}{" "}
                restantes)
              </span>
              <ChevronDown className="w-4 h-4" />
            </UIButton>
          </div>
        )}
      </div>

      {/* BARRA FLUTUANTE DE AÇÕES EM MASSA */}
      {selectedItemIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#111827]/95 text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-slate-700/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-4 max-w-xl w-[92%] animate-slide-up">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-full bg-[#16845B] text-white flex items-center justify-center font-bold text-xs">
              {selectedItemIds.length}
            </span>
            <span className="text-xs font-semibold">
              {selectedItemIds.length === 1
                ? "1 objeto selecionado"
                : `${selectedItemIds.length} objetos selecionados`}
            </span>
          </div>

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
                } catch (_) {
                  // Preserva a seleção em caso de falha
                }
              }}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
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
                    } catch (_) {
                      // Preserva a seleção em caso de falha
                    }
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
              className="p-2 text-slate-400 hover:text-white transition-colors cursor-pointer"
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
