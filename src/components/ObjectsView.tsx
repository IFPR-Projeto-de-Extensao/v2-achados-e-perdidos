import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useApp } from "../context/AppContext";
import { ItemCard } from "./ItemCard";
import { ExportFoundItemsReportModal } from "./ExportFoundItemsReportModal";
import { VoiceSearchModal } from "./VoiceSearchModal";
import { IFPR_LOCATIONS } from "../data/mockData";
import { ItemCategory, LostFoundItem } from "../types";
import { formatDate, vibrateClick, vibrateSuccess, safeToLower, safeIncludes, sanitizeQuery, isItemNew, safeParseDate } from "../lib/utils";
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
  PlusCircle,
  Sparkles,
  CheckSquare,
  Square,
  Trash2,
  CheckCircle2,
  Shield,
  Layers,
  Building2,
  ChevronDown,
  ChevronUp,
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
} from "lucide-react";

interface ObjectsViewProps {
  initialFilterType?: "TODOS" | "PERDIDO" | "ENCONTRADO";
}

const CAMPUS_BLOCKS = [
  { id: "TODOS", label: "Todos os Blocos", shortLabel: "Todos", icon: Building2 },
  { id: "Bloco Didático", label: "Bloco Didático (Salas 01 a 12)", shortLabel: "Bloco Didático", icon: Building2 },
  { id: "Laboratórios de Informática", label: "Laboratórios de Informática (Lab 01 e 02)", shortLabel: "Labs Informática", icon: Laptop },
  { id: "Biblioteca", label: "Biblioteca Campus Ivaiporã", shortLabel: "Biblioteca", icon: BookOpen },
  { id: "Refeitório", label: "Refeitório / Cantina Estudantil", shortLabel: "Refeitório", icon: Coffee },
  { id: "Ginásio", label: "Ginásio Poliesportivo & Quadra", shortLabel: "Ginásio / Quadra", icon: Layers },
  { id: "Secretaria", label: "Secretaria Acadêmica (SEBAC / Bloco ADM)", shortLabel: "Secretaria / ADM", icon: FileText },
  { id: "Estacionamento", label: "Estacionamento Principal & Guarita", shortLabel: "Guarita / Estac.", icon: MapPin },
  { id: "Auditório", label: "Auditório do Campus Ivaiporã", shortLabel: "Auditório", icon: Building2 },
  { id: "Laboratórios de Física", label: "Laboratórios de Ciências (Fís/Quím/Bio)", shortLabel: "Labs Ciências", icon: Sparkles },
  { id: "Área Verde", label: "Área Verde & Pátio Central", shortLabel: "Pátio Central", icon: MapPin },
];

const TIME_PRESETS = [
  { id: "TODOS", label: "Qualquer período" },
  { id: "24H", label: "✨ Últimas 24 horas (Novos)" },
  { id: "HOJE", label: "Hoje" },
  { id: "7_DIAS", label: "Últimos 7 dias" },
  { id: "30_DIAS", label: "Últimos 30 dias" },
  { id: "SEMESTRE_ATUAL", label: "Semestre Letivo Atual" },
  { id: "CUSTOM", label: "Personalizado (De / Até)" },
];

export const ObjectsView: React.FC<ObjectsViewProps> = ({ initialFilterType = "TODOS" }) => {
  const { items, setSelectedItemForDetail, currentUser, bulkUpdateItemStatus, bulkDeleteItems, setActiveTab } = useApp();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterType, setFilterType] = useState<"TODOS" | "PERDIDO" | "ENCONTRADO" | "DEVOLVIDO">(
    initialFilterType
  );

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
  const [layoutViewMode, setLayoutViewMode] = useState<"ADAPTATIVO" | "CARDS" | "LISTA">("ADAPTATIVO");
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState<boolean>(true);

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
  const [isExportReportModalOpen, setIsExportReportModalOpen] = useState<boolean>(false);
  const [isVoiceSearchOpen, setIsVoiceSearchOpen] = useState<boolean>(false);

  const isAdminOrServer = currentUser.role === "ADMIN" || currentUser.role === "SERVIDOR";

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
      const filtered = (prev || []).filter((t) => safeToLower(t, "ObjectsView.tsx -> saveSearchTerm -> t") !== safeToLower(trimmed, "ObjectsView.tsx -> saveSearchTerm -> trimmed"));
      const updated = [trimmed, ...filtered].slice(0, 6);
      try {
        localStorage.setItem("ifpr_achados_search_history", JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });
  };

  const removeSearchHistoryItem = (termToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSearchHistory((prev) => {
      const updated = (prev || []).filter((t) => safeToLower(t, "ObjectsView.tsx -> removeSearchHistoryItem -> t") !== safeToLower(termToRemove, "ObjectsView.tsx -> removeSearchHistoryItem -> termToRemove"));
      try {
        localStorage.setItem("ifpr_achados_search_history", JSON.stringify(updated));
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

  const categoriesList: { name: ItemCategory; icon: React.ComponentType<{ className?: string }> }[] = [
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

  const colorsList = ["TODAS", "Verde", "Preto", "Cinza / Prata", "Azul", "Vermelho", "Branco"];

  // Helper counts for badges (dynamic from Firestore synchronized items)
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { TODAS: items.length };
    categoriesList.forEach((c) => {
      counts[c.name] = items.filter((i) => i.category === c.name).length;
    });
    return counts;
  }, [items]);

  const blockCounts = useMemo(() => {
    const counts: Record<string, number> = { TODOS: (items || []).length };
    CAMPUS_BLOCKS.forEach((b) => {
      if (b && b.id !== "TODOS") {
        counts[b.id] = (items || []).filter((i) => i && safeIncludes(i.location, b.id)).length;
      }
    });
    return counts;
  }, [items]);

  // Filter & Sort Logic (Simultaneous Multi-field Filtering with Firestore data)
  const filteredItems = useMemo(() => {
    const cleanSearch = sanitizeQuery(debouncedSearch);
    const cleanBlock = sanitizeQuery(selectedCampusBlock);
    const cleanCategory = sanitizeQuery(selectedCategory);
    const cleanColor = sanitizeQuery(selectedColor);
    const cleanLocation = sanitizeQuery(selectedLocation);

    return (items || [])
      .filter((item) => {
        if (!item) return false;

        // Type / Status filter tab
        if (filterType === "PERDIDO" && item.type !== "PERDIDO") return false;
        if (filterType === "ENCONTRADO" && item.type !== "ENCONTRADO") return false;
        if (filterType === "DEVOLVIDO" && item.status !== "DEVOLVIDO") return false;

        // Category filter
        if (cleanCategory && cleanCategory !== "TODAS" && item.category !== cleanCategory) return false;

        // Campus Block filter
        if (cleanBlock && cleanBlock !== "TODOS") {
          if (!safeIncludes(item.location, cleanBlock)) return false;
        }

        // Location Dropdown filter (specific location)
        if (cleanLocation && cleanLocation !== "TODOS" && item.location !== cleanLocation) return false;

        // Color filter
        if (cleanColor && cleanColor !== "TODAS") {
          if (!safeIncludes(item.color, cleanColor)) return false;
        }

        // Time Period Preset filter
        if (selectedTimePreset !== "TODOS") {
          const itemTime = safeParseDate(item.date || item.createdAt)?.getTime() || 0;
          const now = new Date();

          if (selectedTimePreset === "24H") {
            const twentyFourHoursAgo = now.getTime() - 24 * 60 * 60 * 1000;
            if (itemTime < twentyFourHoursAgo) return false;
          } else if (selectedTimePreset === "HOJE") {
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            if (itemTime < startOfToday) return false;
          } else if (selectedTimePreset === "7_DIAS") {
            const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).getTime();
            if (itemTime < sevenDaysAgo) return false;
          } else if (selectedTimePreset === "30_DIAS") {
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).getTime();
            if (itemTime < thirtyDaysAgo) return false;
          } else if (selectedTimePreset === "SEMESTRE_ATUAL") {
            const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).getTime();
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

          if (!matchesTitle && !matchesDesc && !matchesBrand && !matchesLoc && !matchesId && !matchesQr) {
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
    items,
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
    <div className="space-y-8 pb-16">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white">
            Catálogo de Objetos IFPR Campus Ivaiporã
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
            Pesquise, filtre e encontre itens perdidos ou encontrados no Campus Ivaiporã.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center space-x-1 p-1 bg-neutral-100 dark:bg-[#1E1E1E] rounded-2xl border border-neutral-200 dark:border-neutral-800">
          <button
            onClick={() => setFilterType("TODOS")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              filterType === "TODOS"
                ? "bg-white dark:bg-neutral-800 text-[#00843D] dark:text-green-400 shadow-xs"
                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
            }`}
          >
            Todos ({items.length})
          </button>

          <button
            onClick={() => setFilterType("PERDIDO")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              filterType === "PERDIDO"
                ? "bg-[#EF4444] text-white shadow-xs"
                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
            }`}
          >
            Perdidos ({items.filter((i) => i.type === "PERDIDO").length})
          </button>

          <button
            onClick={() => setFilterType("ENCONTRADO")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              filterType === "ENCONTRADO"
                ? "bg-[#22C55E] text-white shadow-xs"
                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
            }`}
          >
            Encontrados ({items.filter((i) => i.type === "ENCONTRADO").length})
          </button>

          <button
            onClick={() => setFilterType("DEVOLVIDO")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              filterType === "DEVOLVIDO"
                ? "bg-[#3B82F6] text-white shadow-xs"
                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
            }`}
          >
            Devolvidos ({items.filter((i) => i.status === "DEVOLVIDO").length})
          </button>
        </div>
      </div>

      {/* ADVANCED FILTER CONTROLS PANEL */}
      <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-5 sm:p-6 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-5">
        {/* Main Search Row */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Text Search Input */}
          <div className="md:col-span-8 relative">
            <div className="relative">
              <Search className="absolute left-3.5 top-3 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e?.target?.value ?? "")}
                onBlur={() => saveSearchTerm(search)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveSearchTerm(search);
                }}
                placeholder="Buscar por título, marca, cor, QR Code ou fale 'Localiza [objeto]'..."
                className="w-full pl-10 pr-20 py-2.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/90 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-xs focus:ring-2 focus:ring-[#00843D] outline-none transition-all"
              />
              <div className="absolute right-2.5 top-2 flex items-center space-x-1">
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setDebouncedSearch("");
                    }}
                    className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-white cursor-pointer rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
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
                  className="p-1.5 rounded-xl bg-[#00843D]/10 hover:bg-[#00843D] text-[#00843D] hover:text-white dark:text-green-400 dark:hover:text-white transition-all cursor-pointer shadow-2xs flex items-center justify-center"
                  title="Busca por Comando de Voz ('Localiza [objeto]')"
                  aria-label="Iniciar busca por comando de voz"
                >
                  <Mic className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Search History Chips (Recent Searches) */}
            {searchHistory.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-2 text-[11px]">
                <span className="text-neutral-500 dark:text-neutral-400 flex items-center gap-1 font-bold">
                  <Clock className="w-3 h-3 text-[#00843D]" /> Buscas Recentes:
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
                    className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 hover:bg-[#00843D]/10 hover:text-[#00843D] dark:hover:text-green-400 text-neutral-700 dark:text-neutral-300 transition-all border border-neutral-200/80 dark:border-neutral-700 font-medium cursor-pointer group"
                  >
                    <span>{historyTerm}</span>
                    <span
                      onClick={(e) => removeSearchHistoryItem(historyTerm, e)}
                      title="Remover termo"
                      className="hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-full w-3.5 h-3.5 flex items-center justify-center ml-0.5 text-xs text-neutral-400"
                    >
                      ×
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={clearAllSearchHistory}
                  title="Limpar histórico de pesquisas recentes"
                  className="text-[10px] text-neutral-400 hover:text-red-500 underline ml-1 cursor-pointer font-semibold"
                >
                  Limpar
                </button>
              </div>
            )}
          </div>

          {/* Advanced Filter Toggle & Clear Buttons */}
          <div className="md:col-span-4 flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setIsAdvancedFiltersOpen(!isAdvancedFiltersOpen);
              }}
              className={`flex-1 md:flex-none px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center justify-center space-x-2 cursor-pointer border ${
                isAdvancedFiltersOpen
                  ? "bg-[#00843D] text-white border-[#00843D] shadow-xs"
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-700 hover:bg-neutral-200"
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Painel de Filtros Avançados</span>
              {activeFiltersCount > 0 && (
                <span className="ml-1 px-2 py-0.5 text-[10px] rounded-full bg-white/20 text-white font-extrabold">
                  {activeFiltersCount}
                </span>
              )}
              {isAdvancedFiltersOpen ? (
                <ChevronUp className="w-3.5 h-3.5 ml-0.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
              )}
            </button>

            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="px-3 py-2.5 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer border border-red-500/20"
                title="Limpar todos os filtros ativos"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Limpar</span>
              </button>
            )}
          </div>
        </div>

        {/* EXPANDABLE ADVANCED FILTER PANEL */}
        <AnimatePresence>
          {isAdvancedFiltersOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-5 pt-3 border-t border-neutral-100 dark:border-neutral-800 overflow-hidden"
            >
              {/* 1. Categorias do Objeto */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-[#00843D]" />
                    <span>1. Filtrar por Categoria ({categoriesList.length + 1})</span>
                  </span>
                  {selectedCategory !== "TODAS" && (
                    <button
                      onClick={() => setSelectedCategory("TODAS")}
                      className="text-[11px] text-[#00843D] dark:text-green-400 font-bold hover:underline cursor-pointer"
                    >
                      Ver todas
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      vibrateClick();
                      setSelectedCategory("TODAS");
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer border ${
                      selectedCategory === "TODAS"
                        ? "bg-[#00843D] text-white border-[#00843D] shadow-xs"
                        : "bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:border-[#00843D]/50"
                    }`}
                  >
                    <span>Todas as Categorias</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-black/10 dark:bg-white/10 font-bold">
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
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer border ${
                          isSelected
                            ? "bg-[#00843D] text-white border-[#00843D] shadow-xs"
                            : "bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:border-[#00843D]/50"
                        }`}
                      >
                        <IconComp className={`w-3.5 h-3.5 ${isSelected ? "text-white" : "text-[#00843D]"}`} />
                        <span>{cat.name}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-md font-bold ${
                            isSelected
                              ? "bg-white/20 text-white"
                              : "bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400"
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Bloco do Campus Ivaiporã */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-[#00843D]" />
                    <span>2. Filtrar por Bloco do Campus Ivaiporã</span>
                  </span>
                  {selectedCampusBlock !== "TODOS" && (
                    <button
                      onClick={() => setSelectedCampusBlock("TODOS")}
                      className="text-[11px] text-[#00843D] dark:text-green-400 font-bold hover:underline cursor-pointer"
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
                          setSelectedCampusBlock(isSelected ? "TODOS" : block.id);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer border ${
                          isSelected
                            ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                            : "bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:border-blue-500/50"
                        }`}
                      >
                        <IconComp className={`w-3.5 h-3.5 ${isSelected ? "text-white" : "text-blue-500"}`} />
                        <span>{block.shortLabel}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-md font-bold ${
                            isSelected
                              ? "bg-white/20 text-white"
                              : "bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400"
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Período de Tempo e Data */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start bg-neutral-50 dark:bg-neutral-900/60 p-4 rounded-2xl border border-neutral-200/80 dark:border-neutral-800">
                <div className="lg:col-span-7 space-y-2">
                  <span className="text-xs font-black uppercase tracking-wider text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#00843D]" />
                    <span>3. Período de Tempo</span>
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
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                            isSelected
                              ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                              : "bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:border-purple-500/50"
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
                  <span className="text-xs font-black uppercase tracking-wider text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#00843D]" />
                    <span>Intervalo de Datas Específico</span>
                  </span>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-neutral-500 uppercase block mb-1">De (Início)</label>
                      <input
                        type="date"
                        value={filterStartDate}
                        onChange={(e) => {
                          setFilterStartDate(e.target.value);
                          setSelectedTimePreset("CUSTOM");
                        }}
                        className="w-full py-1.5 px-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-[#00843D]"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-neutral-500 uppercase block mb-1">Até (Fim)</label>
                      <input
                        type="date"
                        value={filterEndDate}
                        onChange={(e) => {
                          setFilterEndDate(e.target.value);
                          setSelectedTimePreset("CUSTOM");
                        }}
                        className="w-full py-1.5 px-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-[#00843D]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Local Específico e Cor */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {/* Specific Location Dropdown */}
                <div className="space-y-1">
                  <label className="text-[11px] font-black uppercase tracking-wider text-neutral-700 dark:text-neutral-300 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-[#00843D]" /> Sala ou Local Específico:
                  </label>
                  <select
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-xs focus:ring-2 focus:ring-[#00843D] outline-none"
                  >
                    <option value="TODOS">Todos os Locais Detalhados</option>
                    {IFPR_LOCATIONS.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Color Selector */}
                <div className="space-y-1">
                  <label className="text-[11px] font-black uppercase tracking-wider text-neutral-700 dark:text-neutral-300 flex items-center gap-1">
                    <SlidersHorizontal className="w-3 h-3 text-[#00843D]" /> Cor Predominante:
                  </label>
                  <div className="flex items-center space-x-1.5 overflow-x-auto py-1">
                    {colorsList.map((col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => {
                          vibrateClick();
                          setSelectedColor(col);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                          selectedColor === col
                            ? "bg-[#00843D] text-white font-bold shadow-xs"
                            : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200"
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
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <span className="text-[11px] font-bold text-neutral-500 uppercase flex items-center gap-1">
              <Filter className="w-3 h-3 text-[#00843D]" /> Filtros Aplicados:
            </span>

            {search.trim() && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs font-semibold border border-neutral-200 dark:border-neutral-700">
                Busca: "{search}"
                <button onClick={() => setSearch("")} className="hover:text-red-500 cursor-pointer">×</button>
              </span>
            )}

            {filterType !== "TODOS" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 text-xs font-bold border border-[#00843D]/20">
                Tipo: {filterType}
                <button onClick={() => setFilterType("TODOS")} className="hover:text-red-500 cursor-pointer">×</button>
              </span>
            )}

            {selectedCategory !== "TODAS" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-bold border border-emerald-500/20">
                Categoria: {selectedCategory}
                <button onClick={() => setSelectedCategory("TODAS")} className="hover:text-red-500 cursor-pointer">×</button>
              </span>
            )}

            {selectedCampusBlock !== "TODOS" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-blue-500/10 text-blue-700 dark:text-blue-300 text-xs font-bold border border-blue-500/20">
                Bloco: {selectedCampusBlock}
                <button onClick={() => setSelectedCampusBlock("TODOS")} className="hover:text-red-500 cursor-pointer">×</button>
              </span>
            )}

            {selectedTimePreset !== "TODOS" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-purple-500/10 text-purple-700 dark:text-purple-300 text-xs font-bold border border-purple-500/20">
                Período: {TIME_PRESETS.find((p) => p.id === selectedTimePreset)?.label || selectedTimePreset}
                <button onClick={() => setSelectedTimePreset("TODOS")} className="hover:text-red-500 cursor-pointer">×</button>
              </span>
            )}

            {selectedColor !== "TODAS" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs font-bold border border-amber-500/20">
                Cor: {selectedColor}
                <button onClick={() => setSelectedColor("TODAS")} className="hover:text-red-500 cursor-pointer">×</button>
              </span>
            )}

            <button
              onClick={clearFilters}
              className="text-[11px] font-black text-red-600 dark:text-red-400 hover:underline cursor-pointer ml-auto"
            >
              Limpar Todos
            </button>
          </div>
        )}

        {/* Layout Mode & Sort Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-neutral-100 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-400">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-neutral-900 dark:text-white">Visualização:</span>
            <div className="flex items-center space-x-1 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setLayoutViewMode("ADAPTATIVO")}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                  layoutViewMode === "ADAPTATIVO"
                    ? "bg-[#00843D] text-white shadow-xs"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
                }`}
                title="Grid Adaptativo RNF03 (Alterna Cards em Mobile e Lista em Tablets)"
              >
                ⚡ Adaptativo
              </button>
              <button
                type="button"
                onClick={() => setLayoutViewMode("CARDS")}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                  layoutViewMode === "CARDS"
                    ? "bg-[#00843D] text-white shadow-xs"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
                }`}
              >
                Cards
              </button>
              <button
                type="button"
                onClick={() => setLayoutViewMode("LISTA")}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                  layoutViewMode === "LISTA"
                    ? "bg-[#00843D] text-white shadow-xs"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
                }`}
              >
                Lista
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="font-bold text-neutral-900 dark:text-white">Ordenar por:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="py-1 px-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-[#00843D]"
            >
              <option value="recentes">Mais Recentes</option>
              <option value="antigos">Mais Antigos</option>
            </select>
          </div>
        </div>
      </div>

      {/* ITEMS CATALOG GRID */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-500">
          <span>
            Exibindo <strong>{filteredItems.length}</strong> de {items.length} objetos no catálogo
          </span>

          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setIsExportReportModalOpen(true);
              }}
              aria-label="Exportar Relatório Oficial de Itens Encontrados em PDF para Prestação de Contas"
              className="px-3.5 py-1.5 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Exportar Relatório PDF</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsSelectableMode(!isSelectableMode);
                if (isSelectableMode) setSelectedItemIds([]);
              }}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center space-x-1.5 transition-all border cursor-pointer ${
                isSelectableMode
                  ? "bg-[#00843D] text-white border-[#00843D] shadow-sm"
                  : "bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100"
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>{isSelectableMode ? "Sair do Modo Seleção" : "Seleção em Massa"}</span>
            </button>

            {isSelectableMode && (
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="px-3 py-1.5 rounded-xl font-bold text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 border border-neutral-200 dark:border-neutral-700 transition-colors cursor-pointer"
              >
                {selectedItemIds.length === filteredItems.length && filteredItems.length > 0
                  ? "Desmarcar Todos"
                  : `Selecionar Todos (${filteredItems.length})`}
              </button>
            )}
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-8 space-y-6 shadow-xs animate-fade-in">
            {/* Animated SVG Radar / Box Visual */}
            <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-[#00843D]/10 dark:bg-[#00843D]/20 animate-ping opacity-75" />
              <div className="absolute inset-2 rounded-full bg-[#00843D]/20 dark:bg-[#00843D]/30 animate-pulse" />
              <div className="relative z-10 p-5 bg-white dark:bg-neutral-800 rounded-full shadow-lg border border-[#00843D]/30">
                <PackageSearch className="w-12 h-12 text-[#00843D] dark:text-green-400 animate-bounce" />
              </div>
            </div>

            <div className="space-y-2 max-w-md mx-auto">
              <h3 className="font-extrabold text-xl text-neutral-900 dark:text-white">
                Nenhum objeto localizado no acervo
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                {search ? (
                  <>Não encontramos ocorrências correspondentes a <strong className="text-neutral-900 dark:text-white">"{search}"</strong>. Tente buscar por termos mais simples ou selecione outra categoria.</>
                ) : (
                  <>Não encontramos itens com os filtros selecionados no momento. Experimente redefinir os filtros do IFPR Campus Ivaiporã.</>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={clearFilters}
                className="px-5 py-2.5 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white font-bold text-xs transition-all shadow-md flex items-center space-x-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Limpar Todos os Filtros</span>
              </button>
            </div>
          </div>
        ) : layoutViewMode === "LISTA" ? (
          /* TABLET & DESKTOP LIST VIEW MODE */
          <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 dark:bg-neutral-800/80 text-neutral-500 uppercase font-black text-[10px] tracking-wider border-b border-neutral-200 dark:border-neutral-800">
                  <tr>
                    <th className="p-4">Objeto</th>
                    <th className="p-4">Categoria</th>
                    <th className="p-4">Tipo & Status</th>
                    <th className="p-4">Local no Campus</th>
                    <th className="p-4">Data</th>
                    <th className="p-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedItemForDetail(item)}
                      className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 cursor-pointer transition-colors"
                    >
                      <td className="p-4">
                        <div className="flex items-center space-x-3">
                          <img
                            src={item.imageUrl}
                            alt={item.title}
                            loading="lazy"
                            decoding="async"
                            className="w-10 h-10 rounded-xl object-cover border border-neutral-200 dark:border-neutral-700"
                          />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-bold text-neutral-900 dark:text-white text-xs">{item.title}</p>
                              {isItemNew(item) && (
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-600 text-white border border-emerald-400 shadow-2xs"
                                  title="Cadastrado nas últimas 24 horas"
                                >
                                  <Sparkles className="w-2.5 h-2.5 text-amber-300 fill-amber-300" />
                                  Novo
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-neutral-400 font-mono">ID: {item.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 font-semibold text-neutral-700 dark:text-neutral-300">
                        {item.category}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              item.type === "PERDIDO"
                                ? "bg-red-500/10 text-red-600 border border-red-500/20"
                                : "bg-green-500/10 text-green-600 border border-green-500/20"
                            }`}
                          >
                            {item.type}
                          </span>
                          <span className="text-[11px] font-bold text-neutral-500">{item.status}</span>
                        </div>
                      </td>
                      <td className="p-4 text-neutral-600 dark:text-neutral-300 font-medium">
                        {item.location}
                      </td>
                      <td className="p-4 text-neutral-500 font-mono text-[11px]">
                        {formatDate(item.date)}
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedItemForDetail(item);
                          }}
                          className="px-3.5 py-1.5 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white text-[11px] font-bold shadow-xs transition-all"
                        >
                          Ver Detalhes
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* RESPONSIVE GRID MODE (grid-cols-1 md:grid-cols-2 lg:grid-cols-3 for 320px mobile to desktop) */
          <div
            className={
              layoutViewMode === "CARDS"
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-full min-w-0"
                : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 md:hidden lg:grid gap-6 w-full max-w-full min-w-0"
            }
          >
            {filteredItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onSelect={setSelectedItemForDetail}
                selectable={isSelectableMode}
                isSelected={selectedItemIds.includes(item.id)}
                onToggleSelect={handleToggleSelectItem}
              />
            ))}
          </div>
        )}

        {/* TABLET ONLY LIST ROW (RNF03 Adaptive layout for md: to lg: breakpoint) */}
        {layoutViewMode === "ADAPTATIVO" && filteredItems.length > 0 && (
          <div className="hidden md:block lg:hidden bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-xs">
            <div className="p-3 bg-blue-500/10 border-b border-blue-500/20 text-blue-800 dark:text-blue-300 text-[11px] font-bold flex items-center justify-between">
              <span>Layout Otimizado para Tablet (RNF03 - Visualização em Lista Resumida)</span>
              <span className="text-[10px] font-mono">{filteredItems.length} objetos</span>
            </div>
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedItemForDetail(item)}
                  className="p-4 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-neutral-800/50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      loading="lazy"
                      decoding="async"
                      className="w-12 h-12 rounded-2xl object-cover border border-neutral-200 dark:border-neutral-700"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-extrabold text-xs text-neutral-900 dark:text-white">
                          {item.title}
                        </h4>
                        {isItemNew(item) && (
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-600 text-white border border-emerald-400 shadow-2xs"
                            title="Cadastrado nas últimas 24 horas"
                          >
                            <Sparkles className="w-2.5 h-2.5 text-amber-300 fill-amber-300" />
                            Novo 24h
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-500">
                        {item.category} • {item.location}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                        item.type === "PERDIDO"
                          ? "bg-red-500/10 text-red-600 border border-red-500/20"
                          : "bg-green-500/10 text-green-600 border border-green-500/20"
                      }`}
                    >
                      {item.type}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedItemForDetail(item);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-[#00843D] text-white font-bold text-xs"
                    >
                      Detalhes
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* FLOATING BULK ACTIONS BAR */}
      {selectedItemIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-neutral-900/95 dark:bg-black/95 text-white px-6 py-4 rounded-2xl shadow-2xl border border-neutral-700/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-4 max-w-xl w-[92%] animate-slide-up">
          <div className="flex items-center space-x-2">
            <span className="w-7 h-7 rounded-full bg-[#00843D] text-white flex items-center justify-center font-black text-xs">
              {selectedItemIds.length}
            </span>
            <span className="text-xs font-bold">
              {selectedItemIds.length === 1 ? "1 objeto selecionado" : `${selectedItemIds.length} objetos selecionados`}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={async () => {
                await bulkUpdateItemStatus(selectedItemIds, "DEVOLVIDO");
                setSelectedItemIds([]);
              }}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center space-x-1.5 transition-colors shadow-xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Marcar Devolvidos</span>
            </button>

            {isAdminOrServer && (
              <button
                type="button"
                onClick={async () => {
                  if (
                    window.confirm(
                      `Tem certeza que deseja excluir permanentemente ${selectedItemIds.length} objeto(s)?`
                    )
                  ) {
                    await bulkDeleteItems(selectedItemIds);
                    setSelectedItemIds([]);
                  }
                }}
                className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center space-x-1.5 transition-colors shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setSelectedItemIds([])}
              className="p-2 text-neutral-400 hover:text-white transition-colors"
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
