import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useApp } from "../context/AppContext";
import { ItemCard } from "./ItemCard";
import { ExportFoundItemsReportModal } from "./ExportFoundItemsReportModal";
import { VoiceSearchModal } from "./VoiceSearchModal";
import { IFPR_LOCATIONS, IFPR_LOCATION_GROUPS } from "../data/mockData";
import { ItemCategory, LostFoundItem } from "../types";
import { isCategoryMatch, getCategoryDisplay } from "../lib/categoryUtils";
import { canOperateFormalReturn, canReopenFormalReturn } from "../lib/devolutionAuth";
import { auth } from "../lib/firebase";
import {
  toggleItemSelection,
  areAllFilteredItemsSelected,
  areSomeFilteredItemsSelected,
  toggleSelectAllFiltered,
  pruneStaleSelectedIds,
  resolveBulkActionTargetIds,
  reconcileSelectionAfterBulkAction,
} from "../lib/catalogSelectionUtils";
import {
  translateCategory,
  translateColor,
  translateCampusBlock,
} from "../lib/i18n";
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
  subscribeOfflineRecentItemsChange,
} from "../lib/recentItemsOfflineService";
import { resolveCatalogDisplayState } from "../lib/catalogDeletionService";
import { getActiveDeletedTombstoneIds } from "../lib/indexedDB";
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
  { id: "TODOS", labelKey: "periodAny" as const },
  { id: "24H", labelKey: "period24h" as const },
  { id: "HOJE", labelKey: "periodToday" as const },
  { id: "7_DIAS", labelKey: "period7Days" as const },
  { id: "30_DIAS", labelKey: "period30Days" as const },
  { id: "SEMESTRE_ATUAL", labelKey: "periodSemester" as const },
  { id: "CUSTOM", labelKey: "periodCustom" as const },
];

const PAGE_STEP = 18;

export const ObjectsView: React.FC<ObjectsViewProps> = ({
  initialFilterType = "TODOS",
}) => {
  const {
    items,
    setSelectedItemForDetail,
    currentUser,
    isGuest,
    bulkUpdateItemStatus,
    bulkDeleteItems,
    isOnline,
    catalogSyncState,
    language,
    t,
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
    let active = true;

    const loadRecentCache = async () => {
      try {
        const tombstoneIds = await getActiveDeletedTombstoneIds();
        const res = await getOfflineRecentItems(tombstoneIds);
        if (!active) return;
        setOfflineRecentItems(res.items);
        setOfflineCachedCount(res.count);
      } catch (_) {}
    };

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => {
      setIsOffline(true);
      loadRecentCache();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    const unsubscribeCache = subscribeOfflineRecentItemsChange((updatedItems) => {
      if (!active) return;
      setOfflineRecentItems(updatedItems);
      setOfflineCachedCount(updatedItems.length);
    });

    loadRecentCache();

    return () => {
      active = false;
      unsubscribeCache();
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
  const [isBulkUpdating, setIsBulkUpdating] = useState<boolean>(false);
  const [isExportReportModalOpen, setIsExportReportModalOpen] =
    useState<boolean>(false);
  const [isVoiceSearchOpen, setIsVoiceSearchOpen] = useState<boolean>(false);

  const canManageBulkItems = canOperateFormalReturn(currentUser, auth.currentUser, isGuest);
  const canBulkDeleteItems = canReopenFormalReturn(currentUser, auth.currentUser, isGuest);

  useEffect(() => {
    if (!canManageBulkItems && (isSelectableMode || selectedItemIds.length > 0)) {
      setIsSelectableMode(false);
      setSelectedItemIds([]);
    }
  }, [canManageBulkItems, isSelectableMode, selectedItemIds.length]);

  const headerCheckboxRef = useRef<HTMLInputElement | null>(null);

  const handleToggleSelectItem = (id: string, shouldSelect: boolean) => {
    setSelectedItemIds((prev) => toggleItemSelection(prev, id, shouldSelect));
  };

  const handleSelectAllFiltered = () => {
    const allFilteredIds = filteredItems.map((i) => i.id);
    setSelectedItemIds((prev) => toggleSelectAllFiltered(prev, allFilteredIds));
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

  const effectivelyOffline = isOffline || !isOnline;

  const catalogDisplay = useMemo(
    () =>
      resolveCatalogDisplayState({
        items,
        isOffline: effectivelyOffline,
        catalogSyncState,
        offlineRecentItems,
      }),
    [items, effectivelyOffline, catalogSyncState, offlineRecentItems]
  );

  const activeItemsPool = catalogDisplay.displayItems;

  // Prune any stale IDs from selection state whenever the displayed catalog changes
  useEffect(() => {
    setSelectedItemIds((prev) => {
      if (prev.length === 0) return prev;
      const validIds = activeItemsPool.map((it) => it.id);
      const next = pruneStaleSelectedIds(prev, validIds);
      return next.length === prev.length && next.every((id, idx) => id === prev[idx])
        ? prev
        : next;
    });
  }, [activeItemsPool]);

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
    if (!catalogDisplay.canCacheDisplayedItems) return;
    const authoritativeItemIds = new Set((items || []).map((it) => it.id));
    if (filteredItems && filteredItems.length > 0) {
      cacheSearchedItems(filteredItems, debouncedSearch, {
        isFromOfflineFallback: false,
        authoritativeItemIds,
      });
    }
  }, [filteredItems, debouncedSearch, catalogDisplay.canCacheDisplayedItems, items]);

  const handleItemClick = (item: LostFoundItem) => {
    if (catalogDisplay.canCacheDisplayedItems) {
      cacheSingleItemPreview(item, {
        isFromOfflineFallback: false,
        authoritativeItemIds: new Set((items || []).map((it) => it.id)),
      });
    }
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

  const filteredItemIds = useMemo(
    () => filteredItems.map((i) => i.id),
    [filteredItems]
  );

  const allFilteredSelected = useMemo(
    () => areAllFilteredItemsSelected(selectedItemIds, filteredItemIds),
    [selectedItemIds, filteredItemIds]
  );

  const someFilteredSelected = useMemo(
    () => areSomeFilteredItemsSelected(selectedItemIds, filteredItemIds),
    [selectedItemIds, filteredItemIds]
  );

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate =
        someFilteredSelected && !allFilteredSelected;
    }
  }, [someFilteredSelected, allFilteredSelected, isSelectableMode, layoutViewMode]);

  const getStatusBadgeInfo = (item: LostFoundItem) => {
    switch (item.status) {
      case "PERDIDO":
        return { label: t("statusLost", "Perdido"), tone: "rose" as const };
      case "ENCONTRADO":
        return { label: t("statusFound", "Encontrado"), tone: "emerald" as const };
      case "EM_ANALISE":
        return { label: t("statusReview", "Em Análise"), tone: "amber" as const };
      case "DEVOLVIDO":
        return { label: t("statusReturned", "Devolvido"), tone: "blue" as const };
      default:
        return {
          label:
            item.type === "PERDIDO"
              ? t("statusLost", "Perdido")
              : t("statusFound", "Encontrado"),
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
                ? t("catalogFoundTitle", "Objetos Encontrados")
                : filterType === "PERDIDO"
                ? t("catalogLostTitle", "Objetos Perdidos")
                : filterType === "EM_ANALISE"
                ? t("catalogReviewTitle", "Objetos em Análise")
                : filterType === "DEVOLVIDO"
                ? t("catalogReturnedTitle", "Objetos Devolvidos")
                : t("catalogTitle", "Catálogo de Objetos")}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {filteredItems.length}{" "}
              {filteredItems.length === 1
                ? t("itemListedSingular", "item listado")
                : t("itemListedPlural", "itens listados")}{" "}
              {t("inArchive", "no acervo")}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setIsExportReportModalOpen(true);
              }}
              aria-label={t("exportPdfTitle", "Exportar Relatório de Achados (PDF)")}
              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 hover:border-[#16845B] text-xs font-medium text-[#172B2A] dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-[#16845B] dark:text-emerald-400" />
              <span className="hidden sm:inline">{t("pdfReport", "Relatório PDF")}</span>
              <span className="sm:hidden">PDF</span>
            </button>

            {canManageBulkItems && (
              <button
                type="button"
                onClick={() => {
                  setIsSelectableMode(!isSelectableMode);
                  if (isSelectableMode) setSelectedItemIds([]);
                }}
                aria-pressed={isSelectableMode}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 border transition-colors cursor-pointer ${
                  isSelectableMode
                    ? "bg-[#16845B] text-white border-[#16845B]"
                    : "bg-white dark:bg-[#111827] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800"
                }`}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {isSelectableMode
                    ? t("finishSelection", "Concluir Seleção")
                    : t("selection", "Seleção")}
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
              placeholder={t(
                "catalogSearchPlaceholder",
                "Buscar por nome, cor, marca, local ou QR..."
              )}
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
                title={t("clearSearch", "Limpar busca")}
                aria-label={t("clearSearch", "Limpar busca")}
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
              title={t("voiceSearch", "Pesquisar por voz")}
              aria-label={t("voiceSearch", "Pesquisar por voz")}
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
            className={`min-h-[46px] px-3 sm:px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${
              isAdvancedFiltersOpen || activeFiltersCount > 0
                ? "bg-[#EBF5F0] dark:bg-emerald-950/50 text-[#064E3B] dark:text-emerald-300 border-[#16845B]/40"
                : "bg-white dark:bg-[#111827] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden xs:inline sm:inline">{t("filters", "Filtros")}</span>
            {activeFiltersCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-[#16845B] text-white text-[10px] font-bold tabular-nums">
                {activeFiltersCount}
              </span>
            )}
          </button>

          <div
            className="inline-flex items-center bg-white dark:bg-[#111827] p-1 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0"
            role="group"
            aria-label={t("viewModeAria", "Modo de visualização do catálogo")}
          >
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setLayoutViewMode("CARDS");
              }}
              title={t("gridView", "Visualização em Grade")}
              aria-label={t("gridView", "Visualização em Grade")}
              aria-pressed={layoutViewMode !== "LISTA"}
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
              onClick={() => {
                vibrateClick();
                setLayoutViewMode("LISTA");
              }}
              title={t("listView", "Visualização em Lista")}
              aria-label={t("listView", "Visualização em Lista")}
              aria-pressed={layoutViewMode === "LISTA"}
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
              { id: "TODOS", label: t("all", "Todos"), count: statusCounts.TODOS },
              { id: "ENCONTRADO", label: t("foundItems", "Encontrados"), count: statusCounts.ENCONTRADO },
              { id: "PERDIDO", label: t("lostItems", "Perdidos"), count: statusCounts.PERDIDO },
              { id: "EM_ANALISE", label: t("underReviewItems", "Em análise"), count: statusCounts.EM_ANALISE },
              { id: "DEVOLVIDO", label: t("returnedItems", "Devolvidos"), count: statusCounts.DEVOLVIDO },
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
            {t("allCategories", "Todas categorias")}
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
                {translateCategory(cat.name, language)}
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
                {t("campusBlock", "Bloco do Campus")}
              </label>
              <UISelect
                aria-label={t("campusBlock", "Bloco do Campus")}
                value={selectedCampusBlock}
                onChange={(e) => setSelectedCampusBlock(e.target.value)}
                className="text-xs"
              >
                {CAMPUS_BLOCKS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {translateCampusBlock(b.id, language)}
                  </option>
                ))}
              </UISelect>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                {t("specificLocation", "Sala ou Local Específico")}
              </label>
              <UISelect
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="text-xs"
              >
                <option value="TODOS">{t("allLocations", "Todos os locais")}</option>
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
                {t("period", "Período")}
              </label>
              <UISelect
                aria-label={t("period", "Período")}
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
                    {t(p.labelKey)}
                  </option>
                ))}
              </UISelect>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                {t("sorting", "Ordenação")}
              </label>
              <UISelect
                aria-label={t("sorting", "Ordenação")}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="text-xs"
              >
                <option value="recentes">{t("newestFirst", "Mais recentes primeiro")}</option>
                <option value="antigos">{t("oldestFirst", "Mais antigos primeiro")}</option>
              </UISelect>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                {t("predominantColor", "Cor predominante")}
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
                    {col === "TODAS" ? t("all", "Todos") : translateColor(col, language)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                {t("dateRange", "Intervalo de datas (De / Até)")}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <UIInput
                  type="date"
                  aria-label={t("startDate", "Data inicial")}
                  value={filterStartDate}
                  onChange={(e) => {
                    setFilterStartDate(e.target.value);
                    setSelectedTimePreset("CUSTOM");
                  }}
                  className="py-1.5 text-xs"
                />
                <UIInput
                  type="date"
                  aria-label={t("endDate", "Data final")}
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
                <span>{t("resetFilters", "Redefinir filtros")}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Aviso discreto apenas quando realmente em modo Offline ou fallback offline */}
      {catalogDisplay.showOfflineBanner && (
        <div className="px-3.5 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>
              {catalogDisplay.mode === "offline-empty"
                ? t("offlineBannerEmpty", "Modo offline: sem conexão e nenhum objeto salvo localmente.")
                : `${t("offlineBannerShowingPrefix", "Modo offline: exibindo")} ${filteredItems.length} ${t("offlineBannerShowingSuffix", "itens salvos no dispositivo.")}`}
            </span>
          </div>
          <span className="font-mono text-[11px] shrink-0">
            {offlineCachedCount} {t("cachedLabel", "em cache")}
          </span>
        </div>
      )}

      {/* 2. LISTAGEM DE OBJETOS (Mobile-First, rápida de percorrer) */}
      <div className="space-y-4">
        {isSelectableMode && filteredItems.length > 0 && (
          <div className="flex items-center justify-between text-xs bg-[#F8FAFC] dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800">
            <span className="text-slate-600 dark:text-slate-300">
              {t("selectItemsForBulk", "Selecione itens para ação em lote")}
              {selectedItemIds.length > 0 && (
                <span className="ml-1.5 font-semibold text-[#16845B] dark:text-emerald-400 tabular-nums">
                  ({selectedItemIds.length} {t("selectedCount", "selecionado(s)")})
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={handleSelectAllFiltered}
              className="font-semibold text-[#16845B] dark:text-emerald-400 hover:underline cursor-pointer"
            >
              {allFilteredSelected
                ? t("unselectAll", "Desmarcar todos")
                : `${t("selectAll", "Selecionar todos")} (${filteredItems.length})`}
            </button>
          </div>
        )}

        {catalogDisplay.mode === "online-loading" ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin text-[#16845B]" />
            <p className="text-sm font-medium">{t("loadingCatalog", "Carregando catálogo de objetos...")}</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <EmptyState
            icon={
              catalogDisplay.mode === "offline-empty" ? (
                <WifiOff className="w-6 h-6" />
              ) : (
                <PackageSearch className="w-6 h-6" />
              )
            }
            title={
              catalogDisplay.mode === "offline-empty"
                ? t("offlineEmptyTitle", "Sem conexão e sem objetos salvos")
                : catalogDisplay.mode === "online-empty" && activeFiltersCount === 0
                ? t("onlineEmptyTitle", "Nenhum objeto cadastrado")
                : t("noSearchResultsTitle", "Nenhum objeto encontrado")
            }
            description={
              catalogDisplay.mode === "offline-empty"
                ? t("offlineEmptyDesc", "Conecte-se à internet para sincronizar o catálogo atualizado do campus.")
                : catalogDisplay.mode === "online-empty" && activeFiltersCount === 0
                ? t("onlineEmptyDesc", "O catálogo está vazio no momento. Novos registros aparecerão aqui automaticamente.")
                : search
                ? `${t("noResultsForQueryPrefix", "Não há resultados para")} "${search}".`
                : t("noFilterMatchesDesc", "Nenhum objeto corresponde aos filtros aplicados.")
            }
            action={
              activeFiltersCount > 0 ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="min-h-[40px] px-4 rounded-lg bg-[#16845B] text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{t("clearFilters", "Limpar filtros")}</span>
                </button>
              ) : undefined
            }
          />
        ) : layoutViewMode === "LISTA" ? (
          <div className="bg-white dark:bg-[#111827] rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8FAFC] dark:bg-slate-900 text-slate-500 dark:text-slate-400 font-medium border-b border-slate-200/80 dark:border-slate-800">
                  <tr>
                    {isSelectableMode && (
                      <th className="py-3 pl-4 pr-2 w-10">
                        <input
                          ref={headerCheckboxRef}
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={() => {
                            vibrateClick();
                            handleSelectAllFiltered();
                          }}
                          aria-label={t(
                            "selectAllInListAria",
                            "Selecionar ou desmarcar todos os objetos filtrados"
                          )}
                          className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 accent-[#16845B] cursor-pointer align-middle"
                        />
                      </th>
                    )}
                    <th className="py-3 px-4">{t("tableColObject", "Objeto")}</th>
                    <th className="py-3 px-4">{t("tableColStatus", "Situação")}</th>
                    <th className="py-3 px-4">{t("tableColCategory", "Categoria")}</th>
                    <th className="py-3 px-4">{t("tableColLocation", "Local")}</th>
                    <th className="py-3 px-4">{t("tableColDate", "Data")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paginatedItems.map((item) => {
                    const badge = getStatusBadgeInfo(item);
                    const isSelected = selectedItemIds.includes(item.id);
                    const itemTitle = item.title || t("untitledItem", "Objeto sem título");
                    return (
                      <tr
                        key={item.id}
                        data-item-id={item.id}
                        data-selected={isSelected ? "true" : "false"}
                        aria-selected={isSelectableMode ? isSelected : undefined}
                        tabIndex={isSelectableMode ? 0 : undefined}
                        onClick={() => {
                          if (isSelectableMode) {
                            vibrateClick();
                            handleToggleSelectItem(item.id, !isSelected);
                          } else {
                            handleItemClick(item);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (
                            isSelectableMode &&
                            (e.key === " " || e.key === "Enter")
                          ) {
                            e.preventDefault();
                            vibrateClick();
                            handleToggleSelectItem(item.id, !isSelected);
                          }
                        }}
                        className={`cursor-pointer transition-colors ${
                          isSelectableMode && isSelected
                            ? "bg-[#EBF5F0]/75 dark:bg-emerald-950/35 hover:bg-[#EBF5F0] dark:hover:bg-emerald-950/50"
                            : "hover:bg-[#F8FAFC] dark:hover:bg-slate-800/50"
                        }`}
                      >
                        {isSelectableMode && (
                          <td
                            className="py-3 pl-4 pr-2 w-10"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                vibrateClick();
                                handleToggleSelectItem(item.id, e.target.checked);
                              }}
                              aria-label={`${
                                isSelected
                                  ? t("unselectItemAria", "Desmarcar objeto")
                                  : t("selectItemAria", "Selecionar objeto")
                              }: ${itemTitle}`}
                              className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 accent-[#16845B] cursor-pointer align-middle"
                            />
                          </td>
                        )}
                        <td className="py-3 px-4 font-semibold text-[#172B2A] dark:text-white">
                          {itemTitle}
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
                          {translateCategory(getCategoryDisplay(item.category), language)}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300 max-w-[200px] truncate">
                          {item.location || t("locationNotProvided", "Local não informado")}
                        </td>
                        <td className="py-3 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                          {formatDate(item.date, undefined, language)}
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
                {t("loadMore", "Carregar mais")} ({filteredItems.length - visibleCount}{" "}
                {t("remaining", "restantes")})
              </span>
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* BARRA FLUTUANTE DE AÇÕES EM MASSA */}
      {canManageBulkItems && selectedItemIds.length > 0 && (
        <div className="fixed bottom-16 lg:bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#111827] text-white px-4 py-3 rounded-xl border border-slate-700 flex flex-wrap items-center justify-between gap-3 max-w-lg w-[92%]">
          <span className="text-xs font-semibold tabular-nums">
            {selectedItemIds.length} {t("selectedCount", "selecionado(s)")}
          </span>

          <div className="flex items-center gap-2">
            <UIButton
              type="button"
              variant="primary"
              size="sm"
              disabled={isBulkUpdating}
              onClick={async () => {
                if (isBulkUpdating) return;
                if (!canOperateFormalReturn(currentUser, auth.currentUser, isGuest)) {
                  setSelectedItemIds([]);
                  setIsSelectableMode(false);
                  return;
                }
                const targetIds = resolveBulkActionTargetIds(
                  selectedItemIds,
                  activeItemsPool.map((it) => it.id)
                );
                if (targetIds.length === 0) {
                  setSelectedItemIds([]);
                  return;
                }
                setIsBulkUpdating(true);
                try {
                  const res = await bulkUpdateItemStatus(
                    targetIds,
                    "EM_ANALISE"
                  );
                  setSelectedItemIds((prev) =>
                    reconcileSelectionAfterBulkAction(prev, res?.succeededIds)
                  );
                } catch (_) {
                } finally {
                  setIsBulkUpdating(false);
                }
              }}
            >
              <span>
                {isBulkUpdating
                  ? t("moving", "Movendo...")
                  : t("moveToReview", "Mover p/ Análise")}
              </span>
            </UIButton>

            {canBulkDeleteItems && (
              <UIButton
                type="button"
                variant="danger"
                size="sm"
                disabled={isBulkUpdating}
                onClick={async () => {
                  if (isBulkUpdating) return;
                  const targetIds = resolveBulkActionTargetIds(
                    selectedItemIds,
                    activeItemsPool.map((it) => it.id)
                  );
                  if (targetIds.length === 0) {
                    setSelectedItemIds([]);
                    return;
                  }
                  if (
                    window.confirm(
                      `${t("confirmBulkDeletePrefix", "Tem certeza que deseja excluir permanentemente")} ${targetIds.length} ${t("confirmBulkDeleteSuffix", "objeto(s)?")}`
                    )
                  ) {
                    setIsBulkUpdating(true);
                    try {
                      const res = await bulkDeleteItems(targetIds);
                      setSelectedItemIds((prev) =>
                        reconcileSelectionAfterBulkAction(prev, res?.succeededIds)
                      );
                    } catch (_) {
                    } finally {
                      setIsBulkUpdating(false);
                    }
                  }
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t("delete", "Excluir")}</span>
              </UIButton>
            )}

            <button
              type="button"
              onClick={() => setSelectedItemIds([])}
              className="p-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title={t("cancelSelection", "Cancelar seleção")}
              aria-label={t("cancelSelection", "Cancelar seleção")}
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
