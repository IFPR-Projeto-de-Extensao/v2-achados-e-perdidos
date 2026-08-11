import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { ItemCard } from "./ItemCard";
import { IFPR_LOCATIONS } from "../data/mockData";
import { ItemCategory, LostFoundItem } from "../types";
import { Search, Filter, SlidersHorizontal, RefreshCw, PackageSearch, Tag, MapPin, Calendar } from "lucide-react";

interface ObjectsViewProps {
  initialFilterType?: "TODOS" | "PERDIDO" | "ENCONTRADO";
}

export const ObjectsView: React.FC<ObjectsViewProps> = ({ initialFilterType = "TODOS" }) => {
  const { items, setSelectedItemForDetail } = useApp();

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"TODOS" | "PERDIDO" | "ENCONTRADO" | "DEVOLVIDO">(
    initialFilterType
  );
  const [selectedCategory, setSelectedCategory] = useState<string>("TODAS");
  const [selectedLocation, setSelectedLocation] = useState<string>("TODOS");
  const [selectedColor, setSelectedColor] = useState<string>("TODAS");
  const [sortBy, setSortBy] = useState<"recentes" | "antigos">("recentes");

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

  // Filter & Sort Logic
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

      // Search term query
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

  const clearFilters = () => {
    setSearch("");
    setFilterType("TODOS");
    setSelectedCategory("TODAS");
    setSelectedLocation("TODOS");
    setSelectedColor("TODAS");
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
          <div className="relative md:col-span-2">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título, marca, cor ou descrição..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-xs focus:ring-2 focus:ring-[#00843D] outline-none"
            />
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
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>
            Exibindo <strong>{filteredItems.length}</strong> de {items.length} objetos no catálogo
          </span>
        </div>

        {filteredItems.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-8 space-y-4">
            <PackageSearch className="w-14 h-14 text-neutral-300 dark:text-neutral-600 mx-auto" />
            <h3 className="font-bold text-lg text-neutral-800 dark:text-white">
              Nenhum objeto encontrado
            </h3>
            <p className="text-xs text-neutral-500 max-w-md mx-auto">
              Não encontramos resultados para a sua pesquisa. Tente buscar com termos mais genéricos ou redefinir os filtros.
            </p>
            <button
              onClick={clearFilters}
              className="px-4 py-2 rounded-xl bg-[#00843D] text-white font-bold text-xs"
            >
              Limpar Filtros
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems.map((item) => (
              <ItemCard key={item.id} item={item} onSelect={setSelectedItemForDetail} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
