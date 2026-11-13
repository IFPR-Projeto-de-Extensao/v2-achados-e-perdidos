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
  initialFilterType?: "TODOS" | "PERDIDO" | "ENCONTRADO";
}

const CAMPUS_BLOCKS = [
  { id: "TODOS", label: "Todos os Blocos", shortLabel: "Todos", icon: Building2 },
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
    "TODOS" | "PERDIDO" | "ENCONTRADO" | "DEVOLVIDO"
  >(initialFilterType);

  // Synchronize filterType when routing parameters change (e.g., navigating between /perdidos, /encontrados, /buscar)
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
  >("ADAPTATIVO");
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] =
    useState<boolean>(false);

  // Offline search preview support via Service Worker (sw-custom.js) & local cache
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );
  const [offlineRecentItems, setOfflineRecentItems] = useState<LostFoundItem[]>(
    []
  );
  const [offlineCachedCount, setOfflineCachedCount] = useState<number>(0);

  // Monitor online / offline network state and sync with Service Worker
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

    // Initial check for offline cached items from Service Worker / local storage
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

  // Debounced search effect with timer cancellation on keystroke & unmount
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 250);

    return () => {
      clearTimeout(timer);
    };
  }, [search]);

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

  // Load search history from localStorage
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

  // Determine active item pool: if online items exist, use them. If offline or items are empty, use offline recent items.
  const activeItemsPool = useMemo(() => {
    if (items && items.length > 0) {
      return items;
    }
    if ((isOffline || items.length === 0) && offlineRecentItems.length > 0) {
      return offlineRecentItems;
    }
    return items || [];
  }, [items, isOffline, offlineRecentItems]);

  // Helper counts for badges (dynamic from Firestore synchronized items)
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { TODAS: activeItemsPool.length };
    categoriesList.forEach((c) => {
      counts[c.name] = activeItemsPool.filter((i) =>
        isCategoryMatch(i.category, c.name)
      ).length;
    });
    return counts;
  }, [activeItemsPool]);

  const blockCounts = useMemo(() => {
    const counts: Record<string, number> = {
      TODOS: (activeItemsPool || []).length,
    };
    CAMPUS_BLOCKS.forEach((b) => {
      if (b && b.id !== "TODOS") {
        counts[b.id] = (activeItemsPool || []).filter(
          (i) => i && safeIncludes(i.location, b.id)
        ).length;
      }
    });
    return counts;
  }, [activeItemsPool]);

  // Filter & Sort Logic (Simultaneous Multi-field Filtering with Firestore data)
  const filteredItems = useMemo(() => {
    const cleanSearch = sanitizeQuery(debouncedSearch);
    const cleanBlock = sanitizeQuery(selectedCampusBlock);
    const cleanCategory = sanitizeQuery(selectedCategory);
    const cleanColor = sanitizeQuery(selectedColor);
    const cleanLocation = sanitizeQuery(selectedLocation);

    return (activeItemsPool || [])
      .filter((item) => {
        if (!item) return false;

        // Type / Status filter tab
        if (filterType === "PERDIDO" && item.type !== "PERDIDO") return false;
        if (filterType === "ENCONTRADO" && item.type !== "ENCONTRADO")
          return false;
        if (filterType === "DEVOLVIDO" && item.status !== "DEVOLVIDO")
          return false;

        // Category filter (normalized matching supporting Outros / OUTROS seamlessly)
        if (cleanCategory && !isCategoryMatch(item.category, cleanCategory))
          return false;

        // Campus Block filter
        if (cleanBlock && cleanBlock !== "TODOS") {
          if (!safeIncludes(item.location, cleanBlock)) return false;
        }

        // Location Dropdown filter (specific location)
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

  // Cache filtered items for offline Service Worker preview (sw-custom.js)
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

  return (
    <div className="space-y-6 pb-16 pt-2 sm:pt-4">
      {/* Clean Minimal Page Header & Modality Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div className="space-y-1.5">
          <UIBadge tone="emerald">Inventário Geral • Campus Ivaiporã</UIBadge>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#172B2A] dark:text-white tracking-tight">
            {filterType === "ENCONTRADO"
              ? "Objetos Encontrados"
              : filterType === "PERDIDO"
              ? "Objetos Perdidos"
              : filterType === "DEVOLVIDO"
              ? "Objetos Devolvidos"
              : "Catálogo de Objetos"}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            Pesquise por nome ou categoria, filtre por blocos acadêmicos e acompanhe itens em custódia ou restituídos.
          </p>
        </div>

        {/* Modality / Status Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => {
              vibrateClick();
              setFilterType("TODOS");
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              filterType === "TODOS"
                ? "bg-[#16845B] text-white shadow-2xs"
                : "text-slate-600 dark:text-slate-400 hover:text-[#172B2A] dark:hover:text-white"
            }`}
          >
            Todos ({activeItemsPool.length})
          </button>

          <button
            type="button"
            onClick={() => {
              vibrateClick();
              setFilterType("ENCONTRADO");
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              filterType === "ENCONTRADO"
                ? "bg-[#16845B] text-white shadow-2xs"
                : "text-slate-600 dark:text-slate-400 hover:text-[#16845B] dark:hover:text-emerald-400"
            }`}
          >
            Encontrados ({activeItemsPool.filter((i) => i.type === "ENCONTRADO").length})
          </button>

          <button
            type="button"
            onClick={() => {
              vibrateClick();
              setFilterType("PERDIDO");
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              filterType === "PERDIDO"
                ? "bg-rose-600 text-white shadow-2xs"
                : "text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
            }`}
          >
            Perdidos ({activeItemsPool.filter((i) => i.type === "PERDIDO").length})
          </button>

          <button
            type="button"
            onClick={() => {
              vibrateClick();
              setFilterType("DEVOLVIDO");
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              filterType === "DEVOLVIDO"
                ? "bg-sky-600 text-white shadow-2xs"
                : "text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400"
            }`}
          >
            Devolvidos ({activeItemsPool.filter((i) => i.status === "DEVOLVIDO").length})
          </button>
        </div>
      </div>

      {/* Service Worker Offline Search Preview Alert Banner */}
      {(isOffline || items.length === 0) && offlineRecentItems.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs animate-in fade-in duration-200">
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

      {/* SEARCH & FILTER SURFACE CARD */}
      <SurfaceCard padding="md" className="space-y-5">
        {/* Main Search Row */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Text Search Input */}
          <div className="md:col-span-8 space-y-2">
            <UIInput
              type="text"
              value={search}
              onChange={(e) => setSearch(e?.target?.value ?? "")}
              onBlur={() => saveSearchTerm(search)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveSearchTerm(search);
              }}
              placeholder="Buscar por nome, categoria, marca, cor, local ou QR Code..."
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

            {/* Search History Chips (Recent Searches) */}
            {searchHistory.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1 font-semibold">
                  <Clock className="w-3 h-3 text-[#16845B]" /> Buscas Recentes:
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

          {/* Advanced Filter Toggle & Clear Buttons */}
          <div className="md:col-span-4 flex items-start gap-2 justify-end">
            <UIButton
              type="button"
              variant={isAdvancedFiltersOpen ? "primary" : "secondary"}
              size="md"
              onClick={() => {
                vibrateClick();
                setIsAdvancedFiltersOpen(!isAdvancedFiltersOpen);
              }}
              className="flex-1 md:flex-none"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filtros Avançados</span>
              {activeFiltersCount > 0 && (
                <span
                  className={`ml-1 px-1.5 py-0.2 text-[10px] rounded-full font-bold ${
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

            {activeFiltersCount > 0 && (
              <UIButton
                type="button"
                variant="ghost"
                size="md"
                onClick={clearFilters}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 border border-red-200/70 dark:border-red-900/40"
                title="Limpar todos os filtros ativos"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Limpar</span>
              </UIButton>
            )}
          </div>
        </div>

        {/* Category Filter Pills directly visible on main panel (Matching Reference Moodboard) */}
        <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#172B2A] dark:text-slate-300 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-[#16845B]" />
              <span>Categorias</span>
            </span>
            {selectedCategory !== "TODAS" && (
              <button
                type="button"
                onClick={() => setSelectedCategory("TODAS")}
                className="text-xs text-[#16845B] dark:text-emerald-400 font-semibold hover:underline cursor-pointer"
              >
                Ver todas
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setSelectedCategory("TODAS");
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer border ${
                selectedCategory === "TODAS"
                  ? "bg-[#16845B] text-white border-[#16845B] shadow-2xs"
                  : "bg-white dark:bg-slate-800/80 text-[#172B2A] dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-[#16845B]/50 hover:bg-[#F8FAFC]"
              }`}
            >
              <span>Todos</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  selectedCategory === "TODAS"
                    ? "bg-white/20 text-white"
                    : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                }`}
              >
                {categoryCounts.TODAS}
              </span>
            </button>

            {categoriesList.map((cat) => {
              const IconComp = cat.icon;
              const isSelected = selectedCategory === cat.name;
              const count = categoryCounts[cat.name] || 0;
              return (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => {
                    vibrateClick();
                    setSelectedCategory(isSelected ? "TODAS" : cat.name);
                  }}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer border ${
                    isSelected
                      ? "bg-[#16845B] text-white border-[#16845B] shadow-2xs"
                      : "bg-white dark:bg-slate-800/80 text-[#172B2A] dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-[#16845B]/50 hover:bg-[#F8FAFC]"
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
                  {count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isSelected
                          ? "bg-white/20 text-white"
                          : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* EXPANDABLE ADVANCED FILTER PANEL */}
        <AnimatePresence>
          {isAdvancedFiltersOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22 }}
              className="space-y-4 pt-3 border-t border-slate-100 dark:border-slate-800 overflow-hidden"
            >
              {/* 1. Bloco do Campus Ivaiporã */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#172B2A] dark:text-slate-200 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-[#16845B]" />
                    <span>Bloco do Campus Ivaiporã</span>
                  </span>
                  {selectedCampusBlock !== "TODOS" && (
                    <button
                      type="button"
                      onClick={() => setSelectedCampusBlock("TODOS")}
                      className="text-xs text-[#16845B] dark:text-emerald-400 font-semibold hover:underline cursor-pointer"
                    >
                      Limpar bloco
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {CAMPUS_BLOCKS.map((block) => {
                    const IconComp = block.icon;
                    const isSelected = selectedCampusBlock === block.id;
                    const count = blockCounts[block.id] || 0;
                    return (
                      <button
                        key={block.id}
                        type="button"
                        onClick={() => {
                          vibrateClick();
                          setSelectedCampusBlock(
                            isSelected ? "TODOS" : block.id
                          );
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer border ${
                          isSelected
                            ? "bg-[#16845B] text-white border-[#16845B] shadow-2xs"
                            : "bg-[#F8FAFC] dark:bg-slate-800 text-[#172B2A] dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-[#16845B]/50"
                        }`}
                      >
                        <IconComp
                          className={`w-3.5 h-3.5 ${
                            isSelected
                              ? "text-white"
                              : "text-[#16845B] dark:text-emerald-400"
                          }`}
                        />
                        <span>{block.shortLabel}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-md font-bold ${
                            isSelected
                              ? "bg-white/20 text-white"
                              : "bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Período de Tempo e Data */}
              <SubtlePanel className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                <div className="lg:col-span-7 space-y-2">
                  <span className="text-xs font-semibold text-[#172B2A] dark:text-slate-200 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#16845B]" />
                    <span>Período de Tempo</span>
                  </span>

                  <div className="flex flex-wrap gap-1.5">
                    {TIME_PRESETS.map((preset) => {
                      const isSelected = selectedTimePreset === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            vibrateClick();
                            setSelectedTimePreset(preset.id);
                            if (preset.id !== "CUSTOM") {
                              setFilterStartDate("");
                              setFilterEndDate("");
                            }
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                            isSelected
                              ? "bg-[#16845B] text-white border-[#16845B] shadow-2xs"
                              : "bg-white dark:bg-slate-800 text-[#172B2A] dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-[#16845B]/50"
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Date Range */}
                <div className="lg:col-span-5 space-y-2">
                  <span className="text-xs font-semibold text-[#172B2A] dark:text-slate-200 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#16845B]" />
                    <span>Intervalo de Datas Específico</span>
                  </span>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-medium text-slate-500 block mb-1">
                        De (Início)
                      </label>
                      <UIInput
                        type="date"
                        value={filterStartDate}
                        onChange={(e) => {
                          setFilterStartDate(e.target.value);
                          setSelectedTimePreset("CUSTOM");
                        }}
                        className="py-1.5 text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-medium text-slate-500 block mb-1">
                        Até (Fim)
                      </label>
                      <UIInput
                        type="date"
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
              </SubtlePanel>

              {/* 3. Local Específico e Cor */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                {/* Specific Location Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#172B2A] dark:text-slate-200 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#16845B]" />
                    <span>Sala ou Local Específico</span>
                  </label>
                  <UISelect
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
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

                {/* Color Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#172B2A] dark:text-slate-200 flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-[#16845B]" />
                    <span>Cor Predominante</span>
                  </label>
                  <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                    {colorsList.map((col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => {
                          vibrateClick();
                          setSelectedColor(col);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer border whitespace-nowrap ${
                          selectedColor === col
                            ? "bg-[#16845B] text-white border-[#16845B] shadow-2xs"
                            : "bg-[#F8FAFC] dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-[#16845B]/40"
                        }`}
                      >
                        {col}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ACTIVE FILTER BADGES ROW */}
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
                  onClick={() => setSearch("")}
                  className="hover:text-red-500 ml-1 cursor-pointer"
                >
                  ×
                </button>
              </UIBadge>
            )}

            {filterType !== "TODOS" && (
              <UIBadge tone="emerald">
                <span>Tipo: {filterType}</span>
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
              className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline cursor-pointer ml-auto"
            >
              Limpar todos
            </button>
          </div>
        )}

        {/* Layout Mode & Sort Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#172B2A] dark:text-slate-200">
              Visualização:
            </span>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/70 dark:border-slate-700/70">
              <button
                type="button"
                onClick={() => setLayoutViewMode("ADAPTATIVO")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  layoutViewMode === "ADAPTATIVO"
                    ? "bg-[#16845B] text-white shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-[#172B2A] dark:hover:text-white"
                }`}
                title="Grid Adaptativo RNF03 (Alterna Cards em Mobile e Lista em Tablets)"
              >
                Adaptativo
              </button>
              <button
                type="button"
                onClick={() => setLayoutViewMode("CARDS")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                  layoutViewMode === "CARDS"
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

          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#172B2A] dark:text-slate-200">
              Ordenar por:
            </span>
            <UISelect
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-auto py-1.5 text-xs"
            >
              <option value="recentes">Mais Recentes</option>
              <option value="antigos">Mais Antigos</option>
            </UISelect>
          </div>
        </div>
      </SurfaceCard>

      {/* ITEMS CATALOG SECTION */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
          <span>
            Exibindo{" "}
            <strong className="text-[#172B2A] dark:text-white">
              {filteredItems.length}
            </strong>{" "}
            de {items.length} objetos no catálogo
          </span>

          <div className="flex items-center gap-2 flex-wrap">
            <UIButton
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
                vibrateClick();
                setIsExportReportModalOpen(true);
              }}
              aria-label="Exportar Relatório Oficial de Itens Encontrados em PDF para Prestação de Contas"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Exportar Relatório PDF</span>
            </UIButton>

            <UIButton
              type="button"
              variant={isSelectableMode ? "primary" : "secondary"}
              size="sm"
              onClick={() => {
                setIsSelectableMode(!isSelectableMode);
                if (isSelectableMode) setSelectedItemIds([]);
              }}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>
                {isSelectableMode ? "Sair do Modo Seleção" : "Seleção em Massa"}
              </span>
            </UIButton>

            {isSelectableMode && (
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
            )}
          </div>
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
          /* CLEAN MINIMAL LIST VIEW (Matching Bottom-Left Reference Screen) */
          <SurfaceCard padding="none" className="overflow-hidden">
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              <AnimatePresence mode="popLayout">
                {filteredItems.map((item, idx) => {
                  const hasImg =
                    item.imageUrl &&
                    item.imageUrl.trim() !== "" &&
                    !item.imageUrl.includes(
                      "photo-1584438784894-089d6a62b8fa"
                    );
                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{
                        duration: 0.22,
                        ease: [0.16, 1, 0.3, 1],
                        delay: Math.min(idx * 0.02, 0.16),
                      }}
                      onClick={() => handleItemClick(item)}
                      className="p-4 sm:px-6 flex items-center justify-between gap-4 hover:bg-[#F8FAFC] dark:hover:bg-slate-800/60 cursor-pointer transition-colors group"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        {hasImg ? (
                          <img
                            src={item.imageUrl}
                            alt={item.title}
                            loading="lazy"
                            decoding="async"
                            className="w-14 h-14 rounded-xl object-cover border border-slate-200/80 dark:border-slate-700 shrink-0 bg-[#F8FAFC]"
                          />
                        ) : (
                          <div
                            className="w-14 h-14 rounded-xl bg-[#F8FAFC] dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 flex items-center justify-center shrink-0 text-[#16845B] dark:text-emerald-400"
                            aria-label="Sem foto anexada"
                          >
                            <CameraOff className="w-5 h-5" />
                          </div>
                        )}

                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-sm sm:text-base text-[#172B2A] dark:text-white truncate group-hover:text-[#16845B] dark:group-hover:text-emerald-400 transition-colors">
                              {item.title}
                            </h3>
                            <UIBadge
                              tone={
                                item.status === "PERDIDO"
                                  ? "rose"
                                  : item.status === "DEVOLVIDO"
                                  ? "blue"
                                  : item.status === "EM_ANALISE"
                                  ? "amber"
                                  : "emerald"
                              }
                            >
                              {item.status === "PERDIDO"
                                ? "Perdido"
                                : item.status === "DEVOLVIDO"
                                ? "Devolvido"
                                : item.status === "EM_ANALISE"
                                ? "Em Análise"
                                : "Encontrado"}
                            </UIBadge>
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

                          <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                            {item.type === "PERDIDO"
                              ? `Perdido em ${item.location}`
                              : `Encontrado em ${item.location}`}{" "}
                            • {getCategoryDisplay(item.category)}
                          </p>

                          <div className="flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              <span>{formatDate(item.date)}</span>
                            </span>
                            <span className="font-mono">ID: {item.id}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="hidden sm:inline-flex text-xs font-semibold text-[#16845B] dark:text-emerald-400 group-hover:underline">
                          Ver Detalhes
                        </span>
                        <div className="w-8 h-8 rounded-xl bg-[#F8FAFC] dark:bg-slate-800 group-hover:bg-[#EBF5F0] dark:group-hover:bg-emerald-950/60 flex items-center justify-center text-slate-400 group-hover:text-[#16845B] dark:group-hover:text-emerald-400 transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </SurfaceCard>
        ) : (
          /* RESPONSIVE GRID MODE (grid-cols-1 md:grid-cols-2 lg:grid-cols-3) */
          <motion.div
            layout
            className={
              layoutViewMode === "CARDS"
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-full min-w-0"
                : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 md:hidden lg:grid gap-6 w-full max-w-full min-w-0"
            }
          >
            <AnimatePresence mode="popLayout">
              {filteredItems.map((item, idx) => (
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

        {/* TABLET ONLY LIST ROW (RNF03 Adaptive layout for md: to lg: breakpoint) */}
        {layoutViewMode === "ADAPTATIVO" && filteredItems.length > 0 && (
          <SurfaceCard
            padding="none"
            className="hidden md:block lg:hidden overflow-hidden"
          >
            <div className="px-4 py-3 bg-[#EBF5F0] dark:bg-emerald-950/40 border-b border-[#16845B]/15 dark:border-emerald-900/40 text-[#064E3B] dark:text-emerald-300 text-xs font-semibold flex items-center justify-between">
              <span>
                Visualização Otimizada para Tablet (Lista Compacta)
              </span>
              <span className="text-[11px] font-mono">
                {filteredItems.length} objetos
              </span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              <AnimatePresence mode="popLayout">
                {filteredItems.map((item, idx) => {
                  const hasImg =
                    item.imageUrl &&
                    item.imageUrl.trim() !== "" &&
                    !item.imageUrl.includes(
                      "photo-1584438784894-089d6a62b8fa"
                    );
                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{
                        duration: 0.22,
                        ease: [0.16, 1, 0.3, 1],
                        delay: Math.min(idx * 0.02, 0.16),
                      }}
                      onClick={() => handleItemClick(item)}
                      className="p-4 flex items-center justify-between gap-3 hover:bg-[#F8FAFC] dark:hover:bg-slate-800/60 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {hasImg ? (
                          <img
                            src={item.imageUrl}
                            alt={item.title}
                            loading="lazy"
                            decoding="async"
                            className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                          />
                        ) : (
                          <div
                            className="w-12 h-12 rounded-xl bg-[#F8FAFC] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 text-[#16845B] dark:text-emerald-400"
                            aria-label="Sem foto anexada"
                          >
                            <CameraOff className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-bold text-sm text-[#172B2A] dark:text-white truncate">
                              {item.title}
                            </h4>
                            {isItemNew(item) && (
                              <span
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-[#16845B] text-white"
                                title="Cadastrado nas últimas 24 horas"
                              >
                                <Sparkles className="w-2.5 h-2.5 text-amber-200 fill-amber-200" />
                                Novo 24h
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {getCategoryDisplay(item.category)} • {item.location} •{" "}
                            {formatDate(item.date)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <UIBadge
                          tone={item.type === "PERDIDO" ? "rose" : "emerald"}
                        >
                          {item.type === "PERDIDO" ? "Perdido" : "Encontrado"}
                        </UIBadge>
                        <UIButton
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedItemForDetail(item);
                          }}
                        >
                          Detalhes
                        </UIButton>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </SurfaceCard>
        )}
      </div>

      {/* FLOATING BULK ACTIONS BAR */}
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
                  // Em caso de falha total, mantém os itens selecionados para nova tentativa
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
                      // Em caso de falha total, preserva a seleção para nova tentativa
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

      {/* Export Found Items Official Accountability PDF Report Modal */}
      <ExportFoundItemsReportModal
        isOpen={isExportReportModalOpen}
        onClose={() => setIsExportReportModalOpen(false)}
      />

      {/* Voice Search Command Modal */}
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
