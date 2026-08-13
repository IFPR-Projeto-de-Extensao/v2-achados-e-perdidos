import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { ItemCard } from "./ItemCard";
import { IFPR_LOCATIONS } from "../data/mockData";
import { ItemCategory, LostFoundItem } from "../types";
import { formatDate } from "../lib/utils";
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
} from "lucide-react";

interface ObjectsViewProps {
  initialFilterType?: "TODOS" | "PERDIDO" | "ENCONTRADO";
}

export const ObjectsView: React.FC<ObjectsViewProps> = ({ initialFilterType = "TODOS" }) => {
  const { items, setSelectedItemForDetail, currentUser, bulkUpdateItemStatus, bulkDeleteItems } = useApp();

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"TODOS" | "PERDIDO" | "ENCONTRADO" | "DEVOLVIDO">(
    initialFilterType
  );
  const [selectedCategory, setSelectedCategory] = useState<string>("TODAS");
  const [selectedLocation, setSelectedLocation] = useState<string>("TODOS");
  const [selectedColor, setSelectedColor] = useState<string>("TODAS");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");
  const [sortBy, setSortBy] = useState<"recentes" | "antigos">("recentes");
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [layoutViewMode, setLayoutViewMode] = useState<"ADAPTATIVO" | "CARDS" | "LISTA">("ADAPTATIVO");

  // Bulk operations selection state
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [isSelectableMode, setIsSelectableMode] = useState<boolean>(false);

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
    const trimmed = term.trim();
    if (!trimmed || trimmed.length < 2) return;
    setSearchHistory((prev) => {
      const filtered = prev.filter((t) => t.toLowerCase() !== trimmed.toLowerCase());
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
      const updated = prev.filter((t) => t !== termToRemove);
      try {
        localStorage.setItem("ifpr_achados_search_history", JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });
  };

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

  const colorsList = ["TODAS", "Verde", "Preto", "Cinza / Prata", "Azul", "Vermelho", "Branco"];

  // Filter & Sort Logic (Simultaneous Multi-field Filtering)
  const filteredItems = items
    .filter((item) => {
      // Type / Status filter tab
      if (filterType === "PERDIDO" && item.type !== "PERDIDO") return false;
      if (filterType === "ENCONTRADO" && item.type !== "ENCONTRADO") return false;
      if (filterType === "DEVOLVIDO" && item.status !== "DEVOLVIDO") return false;

      // Category filter
      if (selectedCategory !== "TODAS" && item.category !== selectedCategory) return false;

      // Location filter
      if (selectedLocation !== "TODOS" && item.location !== selectedLocation) return false;

      // Color filter
      if (selectedColor !== "TODAS" && !item.color.toLowerCase().includes(selectedColor.toLowerCase()))
        return false;

      // Date Range Filter
      if (filterStartDate) {
        const itemDate = new Date(item.date || item.createdAt);
        const start = new Date(filterStartDate);
        start.setHours(0, 0, 0, 0);
        if (itemDate < start) return false;
      }
      if (filterEndDate) {
        const itemDate = new Date(item.date || item.createdAt);
        const end = new Date(filterEndDate);
        end.setHours(23, 59, 59, 999);
        if (itemDate > end) return false;
      }

      // Text Search Query
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(query);
        const matchesDesc = item.description.toLowerCase().includes(query);
        const matchesBrand = item.brand.toLowerCase().includes(query);
        const matchesLoc = item.location.toLowerCase().includes(query);
        const matchesId = item.id.toLowerCase().includes(query);

        if (!matchesTitle && !matchesDesc && !matchesBrand && !matchesLoc && !matchesId) {
          return false;
        }
      }

      return true;
    })
    .sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return sortBy === "recentes" ? dateB - dateA : dateA - dateB;
    });

  const activeFiltersCount =
    (search.trim() ? 1 : 0) +
    (filterType !== "TODOS" ? 1 : 0) +
    (selectedCategory !== "TODAS" ? 1 : 0) +
    (selectedLocation !== "TODOS" ? 1 : 0) +
    (selectedColor !== "TODAS" ? 1 : 0) +
    (filterStartDate ? 1 : 0) +
    (filterEndDate ? 1 : 0);

  const clearFilters = () => {
    setSearch("");
    setFilterType("TODOS");
    setSelectedCategory("TODAS");
    setSelectedLocation("TODOS");
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

      {/* FILTER CONTROLS BAR */}
      <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search bar */}
          <div className="relative md:col-span-2 space-y-2">
            <div className="relative">
              <Search className="absolute left-3.5 top-3 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onBlur={() => saveSearchTerm(search)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveSearchTerm(search);
                }}
                placeholder="Buscar por título, marca, cor ou descrição..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-xs focus:ring-2 focus:ring-[#00843D] outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-2.5 p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Search History Chips */}
            {searchHistory.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[11px]">
                <span className="text-neutral-400 flex items-center gap-1 font-semibold">
                  <Clock className="w-3 h-3 text-[#00843D]" /> Recentes:
                </span>
                {searchHistory.map((historyTerm) => (
                  <button
                    key={historyTerm}
                    type="button"
                    onClick={() => {
                      setSearch(historyTerm);
                      saveSearchTerm(historyTerm);
                    }}
                    className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 hover:bg-[#00843D]/10 hover:text-[#00843D] dark:hover:text-green-400 text-neutral-600 dark:text-neutral-300 transition-all border border-neutral-200/80 dark:border-neutral-700 font-medium"
                  >
                    <span>{historyTerm}</span>
                    <span
                      onClick={(e) => removeSearchHistoryItem(historyTerm, e)}
                      className="hover:text-red-500 ml-0.5"
                    >
                      ×
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Category Dropdown */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full py-2.5 px-3 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-xs focus:ring-2 focus:ring-[#00843D] outline-none"
            >
              <option value="TODAS">Todas as Categorias</option>
              {categoriesList.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Location Dropdown */}
          <div>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="w-full py-2.5 px-3 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-xs focus:ring-2 focus:ring-[#00843D] outline-none"
            >
              <option value="TODOS">Todos os Locais no Campus</option>
              {IFPR_LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Date Range Inputs & Active Filters Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-bold text-neutral-500 shrink-0 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-[#00843D]" /> De:
            </span>
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="w-full py-1.5 px-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-[#00843D]"
            />
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-bold text-neutral-500 shrink-0 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-[#00843D]" /> Até:
            </span>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="w-full py-1.5 px-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-[#00843D]"
            />
          </div>

          <div className="sm:col-span-2 flex items-center justify-between sm:justify-end gap-2">
            {activeFiltersCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-extrabold text-[11px] border border-[#00843D]/20">
                  {activeFiltersCount} {activeFiltersCount === 1 ? "Filtro Ativo" : "Filtros Ativos"}
                </span>

                <button
                  type="button"
                  onClick={clearFilters}
                  className="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 font-bold text-xs transition-colors flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Limpar Filtros</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Extra Filters & Sort Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-neutral-100 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-400">
          <div className="flex items-center space-x-3">
            <span className="font-bold flex items-center gap-1 text-neutral-900 dark:text-white">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#00843D]" /> Cor:
            </span>
            <div className="flex items-center space-x-1.5 overflow-x-auto">
              {colorsList.map((col) => (
                <button
                  key={col}
                  onClick={() => setSelectedColor(col)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    selectedColor === col
                      ? "bg-[#00843D]/20 text-[#00843D] dark:text-green-400 font-bold border border-[#00843D]/30"
                      : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200"
                  }`}
                >
                  {col}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <span className="font-bold text-neutral-900 dark:text-white">Layout RNF03:</span>
            <div className="flex items-center space-x-1 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setLayoutViewMode("ADAPTATIVO")}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all ${
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
                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all ${
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
                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all ${
                  layoutViewMode === "LISTA"
                    ? "bg-[#00843D] text-white shadow-xs"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
                }`}
              >
                Lista
              </button>
            </div>

            <span className="font-bold text-neutral-900 dark:text-white">Ordenar:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="py-1 px-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-xs outline-none"
            >
              <option value="recentes">Mais Recentes</option>
              <option value="antigos">Mais Antigos</option>
            </select>

            <button
              onClick={clearFilters}
              className="p-1.5 text-neutral-500 hover:text-[#00843D] transition-colors"
              title="Limpar Filtros"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ITEMS CATALOG GRID */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-500">
          <span>
            Exibindo <strong>{filteredItems.length}</strong> de {items.length} objetos no catálogo
          </span>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => {
                setIsSelectableMode(!isSelectableMode);
                if (isSelectableMode) setSelectedItemIds([]);
              }}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center space-x-1.5 transition-all border ${
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
                className="px-3 py-1.5 rounded-xl font-bold text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 border border-neutral-200 dark:border-neutral-700 transition-colors"
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
                            className="w-10 h-10 rounded-xl object-cover border border-neutral-200 dark:border-neutral-700"
                          />
                          <div>
                            <p className="font-bold text-neutral-900 dark:text-white text-xs">{item.title}</p>
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
          /* ADAPTATIVE GRID MODE (RNF03: CSS Grid with auto-fit and minmax for fluid responsive cards) */
          <div
            className={
              layoutViewMode === "CARDS"
                ? "grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6"
                : "grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] md:hidden lg:grid gap-6"
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
                      className="w-12 h-12 rounded-2xl object-cover border border-neutral-200 dark:border-neutral-700"
                    />
                    <div>
                      <h4 className="font-extrabold text-xs text-neutral-900 dark:text-white">
                        {item.title}
                      </h4>
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
    </div>
  );
};
