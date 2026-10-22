import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../context/RouterContext";
import { ItemCard } from "./ItemCard";
import { RecentActivityWidget } from "./RecentActivityWidget";
import { LostFoundItem } from "../types";
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

  // Calculate statistics
  const totalRegistered = items.length;
  const totalFound = items.filter((i) => i.type === "ENCONTRADO" || i.status === "ENCONTRADO").length;
  const totalReturned = items.filter((i) => i.status === "DEVOLVIDO").length;
  const successRate = totalRegistered > 0 ? Math.round((totalReturned / totalRegistered) * 100) : 0;

  // Filter items using standard deterministic keyword search
  const displayedItems = filterHomeItems({
    items,
    searchTerm: homeSearch,
    selectedCategory,
    semanticMode: false,
    limit: 6,
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

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [statusFilter, setStatusFilter] = useState<"TODOS" | "PERDIDO" | "ENCONTRADO" | "DEVOLVIDO">("TODOS");

  const totalLost = items.filter((i) => i.type === "PERDIDO" || i.status === "PERDIDO").length;

  const finalHomeItems = statusFilter === "TODOS"
    ? displayedItems
    : displayedItems.filter((i) =>
        statusFilter === "DEVOLVIDO"
          ? i.status === "DEVOLVIDO"
          : i.type === statusFilter || i.status === statusFilter
      );

  return (
    <div className="space-y-8 sm:space-y-10 pb-16">
      {/* 1. ARCHITECTURAL HERO & LIVE CAMPUS MONITOR */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Wing (7 Cols): Institutional Statement & Action Tiles */}
        <div className="lg:col-span-7 rounded-3xl p-6 sm:p-8 lg:p-10 bg-gradient-to-br from-[#006e33] via-[#00843D] to-[#004822] text-white shadow-[0_12px_36px_rgba(0,132,61,0.22)] border border-[#00843D]/40 flex flex-col justify-between relative overflow-hidden">
          {/* Subtle Ambient Radial Lighting */}
          <div className="absolute top-0 right-0 -mt-16 -mr-16 w-80 h-80 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -mb-16 -ml-16 w-64 h-64 bg-black/20 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 space-y-4">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-xs font-black uppercase tracking-wider text-emerald-100">
              <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
              <span>IFPR • Campus Ivaiporã</span>
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl sm:text-4xl lg:text-[2.6rem] font-black tracking-tight leading-[1.15]">
                Central Institucional de Achados &amp; Pertences
              </h1>
              <p className="text-xs sm:text-sm text-emerald-50/90 font-medium leading-relaxed max-w-xl">
                Sistema oficial para registro, controle de custódia na Guarita/SEBAC, catalogação institucional de pertences e devolução formal aos proprietários.
              </p>
            </div>
          </div>

          {/* 3 Dedicated Action Tiles */}
          <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6 sm:pt-8">
            {/* Tile 1: Cadastrar */}
            <div
              onClick={() => handleRegister("ENCONTRADO")}
              className="p-4 rounded-2xl bg-white text-slate-900 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer flex flex-col justify-between group active:scale-98"
            >
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#00843D]/10 text-[#00843D] flex items-center justify-center font-bold mb-3 group-hover:scale-110 transition-transform">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <h4 className="font-extrabold text-xs sm:text-sm text-slate-900 leading-tight">
                  Cadastrar Pertence
                </h4>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  Abra uma ocorrência oficial com protocolo e foto.
                </p>
              </div>
              <div className="pt-3 flex items-center text-[11px] font-bold text-[#00843D] group-hover:translate-x-1 transition-transform">
                <span>Registrar agora</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </div>
            </div>

            {/* Tile 2: Perdi um Item */}
            <div
              onClick={() => handleRegister("PERDIDO")}
              className="p-4 rounded-2xl bg-white/12 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white shadow-xs hover:-translate-y-1 transition-all duration-200 cursor-pointer flex flex-col justify-between group active:scale-98"
            >
              <div>
                <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-200 flex items-center justify-center font-bold mb-3 group-hover:scale-110 transition-transform border border-red-400/30">
                  <PackageSearch className="w-5 h-5" />
                </div>
                <h4 className="font-extrabold text-xs sm:text-sm text-white leading-tight">
                  Perdi um Objeto
                </h4>
                <p className="text-[11px] text-emerald-100/80 mt-1 leading-snug">
                  Notifique o campus para busca e cruzamento automático.
                </p>
              </div>
              <div className="pt-3 flex items-center text-[11px] font-bold text-white group-hover:translate-x-1 transition-transform">
                <span>Relatar perda</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </div>
            </div>

            {/* Tile 3: Scanner QR */}
            <div
              onClick={() => {
                vibrateClick();
                setQrScannerOpen(true);
              }}
              className="p-4 rounded-2xl bg-white/12 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white shadow-xs hover:-translate-y-1 transition-all duration-200 cursor-pointer flex flex-col justify-between group active:scale-98"
            >
              <div>
                <div className="w-10 h-10 rounded-xl bg-emerald-400/20 text-emerald-200 flex items-center justify-center font-bold mb-3 group-hover:scale-110 transition-transform border border-emerald-400/30">
                  <QrCode className="w-5 h-5" />
                </div>
                <h4 className="font-extrabold text-xs sm:text-sm text-white leading-tight">
                  Escanear Etiqueta
                </h4>
                <p className="text-[11px] text-emerald-100/80 mt-1 leading-snug">
                  Leitura de código QR para identificação na portaria.
                </p>
              </div>
              <div className="pt-3 flex items-center text-[11px] font-bold text-emerald-200 group-hover:translate-x-1 transition-transform">
                <span>Abrir câmera</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </div>
            </div>
          </div>
        </div>

        {/* Right Wing (5 Cols): Live Campus Operational Monitor */}
        <div className="lg:col-span-5 rounded-3xl p-6 sm:p-7 bg-white dark:bg-[#151c28] border border-slate-200/90 dark:border-slate-800 shadow-[0_4px_20px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)] flex flex-col justify-between">
          <div className="space-y-5">
            {/* Monitor Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <div>
                  <h3 className="font-black text-xs uppercase tracking-wider text-slate-900 dark:text-white">
                    Monitor Operacional
                  </h3>
                  <span className="text-[10px] font-bold text-slate-400 block">
                    Campus Ivaiporã • Atualizado em tempo real
                  </span>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-black bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                PRODUÇÃO
              </span>
            </div>

            {/* Success Rate Gauge */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-[#00843D] dark:text-emerald-400" />
                  Taxa de Efetividade de Devolução
                </span>
                <span className="text-lg font-black text-[#00843D] dark:text-emerald-400">
                  {successRate}%
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-[#00843D] rounded-full transition-all duration-700"
                  style={{ width: `${Math.max(successRate, 6)}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400">
                Proporção de pertences formalmente devolvidos sobre o total catalogado.
              </p>
            </div>

            {/* 3 Metric Counts in Grid */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Registrados
                </span>
                <span className="text-xl font-black text-slate-900 dark:text-white mt-0.5 block">
                  {totalRegistered}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                  Achados
                </span>
                <span className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-0.5 block">
                  {totalFound}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-blue-500/5 dark:bg-blue-950/20 border border-blue-500/20 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
                  Devolvidos
                </span>
                <span className="text-xl font-black text-blue-700 dark:text-blue-300 mt-0.5 block">
                  {totalReturned}
                </span>
              </div>
            </div>
          </div>

          {/* Custody Physical Location Notice */}
          <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-start space-x-2.5 text-xs text-slate-500 dark:text-slate-400">
            <MapPin className="w-4 h-4 text-[#00843D] dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              <strong className="text-slate-800 dark:text-slate-200">Setor de Custódia Física:</strong> Guarita de Entrada Principal / SEBAC (Bloco Administrativo). Atendimento presencial das 07h às 22h.
            </p>
          </div>
        </div>
      </section>

      {/* 2. UNIFIED INVENTORY SEARCH & COMMAND BAR */}
      <section className="bg-white dark:bg-[#151c28] rounded-3xl p-5 sm:p-7 border border-slate-200/90 dark:border-slate-800 shadow-[0_4px_24px_rgba(0,0,0,0.03)] space-y-5">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sm:gap-4">
          {/* Main Search Input */}
          <div className="relative flex-1">
            <div className="absolute left-4 top-3.5 flex items-center space-x-1 text-slate-400">
              <Search className="w-5 h-5" />
            </div>
            <input
              id="home-search-input"
              type="text"
              value={homeSearch}
              onChange={(e) => setHomeSearch(e?.target?.value ?? "")}
              placeholder="Pesquisar por título, marca, cor, local no campus..."
              className="w-full pl-12 pr-10 py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-[#00843D] focus:border-[#00843D] transition-all"
            />
            {homeSearch && (
              <button
                type="button"
                onClick={() => setHomeSearch("")}
                className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-lg cursor-pointer transition-colors"
                title="Limpar busca"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Quick Status Filter Tabs */}
          <div className="flex items-center p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 shrink-0 space-x-1 overflow-x-auto">
            <button
              onClick={() => {
                vibrateClick();
                setStatusFilter("TODOS");
              }}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                statusFilter === "TODOS"
                  ? "bg-white dark:bg-slate-900 text-[#00843D] dark:text-emerald-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900"
              }`}
            >
              Todos ({items.length})
            </button>
            <button
              onClick={() => {
                vibrateClick();
                setStatusFilter("PERDIDO");
              }}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                statusFilter === "PERDIDO"
                  ? "bg-red-500 text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-300 hover:text-red-500"
              }`}
            >
              Perdidos ({totalLost})
            </button>
            <button
              onClick={() => {
                vibrateClick();
                setStatusFilter("ENCONTRADO");
              }}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                statusFilter === "ENCONTRADO"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-300 hover:text-emerald-600"
              }`}
            >
              Achados ({totalFound})
            </button>
          </div>
        </div>

        {/* Categories Bar & View Mode Toggle */}
        <div className="flex items-center justify-between gap-4 pt-1">
          {/* Category Chips Slider */}
          <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none flex-1">
            {categoriesList.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  vibrateClick();
                  setSelectedCategory(cat);
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer active:scale-95 ${
                  selectedCategory === cat
                    ? "bg-[#00843D] text-white shadow-xs"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* View Mode Toggle: Grid vs List */}
          <div className="hidden sm:flex items-center space-x-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0">
            <button
              onClick={() => {
                vibrateClick();
                setViewMode("grid");
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                viewMode === "grid"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-900"
              }`}
              title="Visualização em Grade"
            >
              Grade
            </button>
            <button
              onClick={() => {
                vibrateClick();
                setViewMode("list");
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                viewMode === "list"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-900"
              }`}
              title="Visualização em Lista"
            >
              Lista
            </button>
          </div>
        </div>
      </section>

      {/* 3. INVENTORY ITEMS SHOWCASE */}
      <section className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-[#00843D]" />
              <span>Inventário de Pertences no Campus</span>
            </h2>
            <p className="text-xs text-slate-500">
              Mostrando {finalHomeItems.length} ocorrência(s) encontrada(s) no campus
            </p>
          </div>

          <button
            onClick={() => {
              vibrateClick();
              navigate("/buscar");
            }}
            className="text-xs font-bold text-[#00843D] dark:text-emerald-400 hover:underline flex items-center space-x-1 cursor-pointer"
          >
            <span>Ver acervo completo</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Grid or List View Mode */}
        {finalHomeItems.length === 0 ? (
          <div className="text-center py-14 bg-white dark:bg-[#151c28] rounded-3xl border border-slate-200/90 dark:border-slate-800 p-8 space-y-3 shadow-xs">
            <PackageSearch className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto" />
            <h4 className="font-extrabold text-base text-slate-700 dark:text-slate-300">
              Nenhum pertence encontrado com estes filtros.
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Tente redefinir a categoria, pesquisar por termos mais amplos ou faça um novo registro caso tenha encontrado ou perdido algo.
            </p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
            {finalHomeItems.map((item) => (
              <ItemCard key={item.id} item={item} onSelect={setSelectedItemForDetail} />
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-[#151c28] rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 shadow-xs">
            {finalHomeItems.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedItemForDetail(item)}
                className="p-4 sm:p-5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
              >
                <div className="flex items-center space-x-4 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700">
                    {item.imageUrl && !item.imageUrl.includes("photo-1584438784894-089d6a62b8fa") ? (
                      <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <PackageSearch className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-bold text-[#00843D] dark:text-emerald-400">
                        {item.id}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="text-xs font-bold text-slate-500">{item.category}</span>
                    </div>
                    <h4 className="font-extrabold text-sm text-slate-900 dark:text-white truncate group-hover:text-[#00843D] transition-colors">
                      {item.title}
                    </h4>
                    <p className="text-xs text-slate-500 truncate flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 text-[#00843D]" /> {item.location}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 shrink-0">
                  <span
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${
                      item.type === "ENCONTRADO"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-red-500/10 text-red-600 dark:text-red-400"
                    }`}
                  >
                    {item.type}
                  </span>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 4. RECENT ACTIVITY STREAM */}
      <section>
        <RecentActivityWidget
          items={items}
          notifications={notifications}
          onSelectItem={setSelectedItemForDetail}
        />
      </section>

      {/* 5. PROTOCOLO INSTITUCIONAL IFPR (COMO FUNCIONA) */}
      <section className="rounded-3xl p-6 sm:p-8 bg-slate-900 text-white space-y-6 border border-slate-800 shadow-[0_12px_36px_rgba(0,0,0,0.3)]">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="space-y-1">
            <span className="text-[10px] font-mono font-black uppercase tracking-widest text-emerald-400">
              Protocolo Oficial IFPR
            </span>
            <h3 className="text-xl sm:text-2xl font-black">
              Como funciona o ciclo de custódia e restituição
            </h3>
          </div>
          <button
            onClick={() => handleRegister("ENCONTRADO")}
            className="px-4 py-2 rounded-xl bg-[#00843D] hover:bg-emerald-600 text-white font-bold text-xs transition-all cursor-pointer shadow-xs active:scale-95"
          >
            Iniciar Ocorrência
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs leading-relaxed text-slate-300">
          <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-2">
            <span className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 font-black flex items-center justify-center text-xs">
              01
            </span>
            <h4 className="font-extrabold text-sm text-white">Triagem Inicial</h4>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              O item é cadastrado no sistema com descrição minuciosa, fotos e indicação precisa do local no campus.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-2">
            <span className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 font-black flex items-center justify-center text-xs">
              02
            </span>
            <h4 className="font-extrabold text-sm text-white">Etiqueta Física QR</h4>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              O setor de Achados gera e fixa a etiqueta física padronizada com identificador QR Code único na peça.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-2">
            <span className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 font-black flex items-center justify-center text-xs">
              03
            </span>
            <h4 className="font-extrabold text-sm text-white">Triagem e Localização</h4>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              A equipe de atendimento e os proprietários localizam pertences pelo catálogo e pontos de guarda oficiais.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-2">
            <span className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 font-black flex items-center justify-center text-xs">
              04
            </span>
            <h4 className="font-extrabold text-sm text-white">Termo de Devolução</h4>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              A restituição ao dono é validada na portaria com recibo oficial assinado e baixa imediata no acervo.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
