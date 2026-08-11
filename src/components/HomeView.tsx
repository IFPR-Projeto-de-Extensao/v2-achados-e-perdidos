import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { ItemCard } from "./ItemCard";
import { LostFoundItem } from "../types";
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
} from "lucide-react";
import { motion } from "motion/react";

export const HomeView: React.FC = () => {
  const {
    items,
    setActiveTab,
    setSelectedItemForDetail,
    setRegisterTypeSelection,
    setQrScannerOpen,
  } = useApp();

  const [homeSearch, setHomeSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("TODAS");

  // Calculate statistics
  const totalRegistered = items.length;
  const totalFound = items.filter((i) => i.type === "ENCONTRADO" || i.status === "ENCONTRADO").length;
  const totalReturned = items.filter((i) => i.status === "DEVOLVIDO").length;
  const successRate = totalRegistered > 0 ? Math.round((totalReturned / totalRegistered) * 100) : 0;

  // Filter recent items for home display
  const recentItems = items
    .filter((item) => {
      const matchesSearch =
        homeSearch === "" ||
        item.title.toLowerCase().includes(homeSearch.toLowerCase()) ||
        item.description.toLowerCase().includes(homeSearch.toLowerCase()) ||
        item.location.toLowerCase().includes(homeSearch.toLowerCase()) ||
        item.brand.toLowerCase().includes(homeSearch.toLowerCase());

      const matchesCat = selectedCategory === "TODAS" || item.category === selectedCategory;

      return matchesSearch && matchesCat;
    })
    .slice(0, 6);

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
    setRegisterTypeSelection(type);
    setActiveTab("register");
  };

  return (
    <div className="space-y-12 pb-16">
      {/* HERO BANNER SECTION */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#00843D] via-[#006e33] to-[#004f24] text-white p-8 sm:p-12 lg:p-16 shadow-xl border border-[#00843D]/30">
        {/* Background Decorative Patterns */}
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-80 h-80 bg-[#C8102E]/20 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:24px_24px] opacity-10" />

        <div className="relative z-10 max-w-3xl space-y-6">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-xs font-bold tracking-wide">
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Sistema Oficial de Achados & Perdidos • IFPR Campus Ivaiporã</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-tight">
            Achados & Perdidos <br className="hidden sm:inline" />
            <span className="text-emerald-200">Campus Ivaiporã</span>
          </h1>

          <p className="text-base sm:text-xl text-emerald-50/90 font-medium leading-relaxed max-w-2xl">
            Conectando alunos, professores e servidores do Campus Ivaiporã aos seus objetos de forma rápida, inteligente e segura.
          </p>

          {/* Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              onClick={() => setActiveTab("image_analyzer")}
              className="px-6 py-3.5 rounded-2xl bg-[#00843D] hover:bg-[#006e33] text-white font-extrabold text-sm shadow-lg shadow-[#00843D]/30 transition-all transform hover:-translate-y-0.5 flex items-center justify-center space-x-2 border border-emerald-400/30"
            >
              <Sparkles className="w-5 h-5 text-amber-300 fill-amber-300" />
              <span>Analisar Foto com IA Gemini</span>
            </button>

            <button
              onClick={() => handleRegister("PERDIDO")}
              className="px-6 py-3.5 rounded-2xl bg-[#EF4444] hover:bg-red-600 text-white font-bold text-sm shadow-lg shadow-red-900/30 transition-all transform hover:-translate-y-0.5 flex items-center justify-center space-x-2"
            >
              <PackageSearch className="w-5 h-5" />
              <span>Cadastrar Objeto Perdido</span>
            </button>

            <button
              onClick={() => handleRegister("ENCONTRADO")}
              className="px-6 py-3.5 rounded-2xl bg-white text-[#00843D] hover:bg-emerald-50 font-extrabold text-sm shadow-lg shadow-black/10 transition-all transform hover:-translate-y-0.5 flex items-center justify-center space-x-2"
            >
              <PlusCircle className="w-5 h-5" />
              <span>Cadastrar Objeto Encontrado</span>
            </button>

            <button
              onClick={() => setActiveTab("lost")}
              className="px-5 py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm backdrop-blur-md border border-white/20 transition-all flex items-center justify-center space-x-2"
            >
              <Search className="w-4 h-4" />
              <span>Pesquisar Todos</span>
            </button>
          </div>
        </div>
      </section>

      {/* HIGHLIGHTED STATISTICS CARDS */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <motion.div
          whileHover={{ y: -3 }}
          className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#1E1E1E] border border-neutral-200/80 dark:border-neutral-800 shadow-xs flex items-center space-x-4"
        >
          <div className="w-12 h-12 rounded-xl bg-[#00843D]/10 dark:bg-[#00843D]/20 text-[#00843D] dark:text-green-400 flex items-center justify-center shrink-0">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block">
              Cadastrados
            </span>
            <span className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
              {totalRegistered}
            </span>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -3 }}
          className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#1E1E1E] border border-neutral-200/80 dark:border-neutral-800 shadow-xs flex items-center space-x-4"
        >
          <div className="w-12 h-12 rounded-xl bg-[#22C55E]/10 dark:bg-[#22C55E]/20 text-[#22C55E] dark:text-green-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block">
              Encontrados
            </span>
            <span className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
              {totalFound}
            </span>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -3 }}
          className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#1E1E1E] border border-neutral-200/80 dark:border-neutral-800 shadow-xs flex items-center space-x-4"
        >
          <div className="w-12 h-12 rounded-xl bg-[#3B82F6]/10 dark:bg-[#3B82F6]/20 text-[#3B82F6] dark:text-blue-400 flex items-center justify-center shrink-0">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block">
              Devolvidos
            </span>
            <span className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
              {totalReturned}
            </span>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -3 }}
          className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#1E1E1E] border border-neutral-200/80 dark:border-neutral-800 shadow-xs flex items-center space-x-4"
        >
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block">
              Taxa de Sucesso
            </span>
            <span className="text-2xl sm:text-3xl font-black text-[#00843D] dark:text-green-400">
              {successRate}%
            </span>
          </div>
        </motion.div>
      </section>

      {/* QUICK SEARCH & CATEGORY FILTER BAR */}
      <section className="space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-neutral-400" />
            <input
              type="text"
              value={homeSearch}
              onChange={(e) => setHomeSearch(e.target.value)}
              placeholder="Pesquise por nome do objeto, marca, cor ou local no Campus Ivaiporã (ex: Garrafa, Casio, Biblioteca)..."
              className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-white dark:bg-[#1E1E1E] border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-white text-sm shadow-xs focus:ring-2 focus:ring-[#00843D] outline-none transition-all"
            />
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setQrScannerOpen(true)}
              className="px-4 py-3.5 rounded-2xl bg-neutral-900 text-white dark:bg-neutral-800 hover:bg-neutral-800 font-bold text-xs flex items-center space-x-2 shrink-0 shadow-xs"
            >
              <QrCode className="w-4 h-4 text-green-400" />
              <span>Escanear Etiqueta QR</span>
            </button>
          </div>
        </div>

        {/* Category Pills Slider */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-2 scrollbar-none">
          {categoriesList.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? "bg-[#00843D] text-white shadow-xs"
                  : "bg-white dark:bg-[#1E1E1E] text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      {/* RECENT ITEMS GRID */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-[#00843D]" /> Objetos Recentes no Campus
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Últimos itens registrados no sistema de achados e perdidos
            </p>
          </div>

          <button
            onClick={() => setActiveTab("lost")}
            className="text-xs font-bold text-[#00843D] dark:text-green-400 hover:underline flex items-center space-x-1"
          >
            <span>Ver todos ({items.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentItems.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-8 space-y-3">
            <PackageSearch className="w-12 h-12 text-neutral-300 dark:text-neutral-600 mx-auto" />
            <h4 className="font-bold text-base text-neutral-700 dark:text-neutral-300">
              Nenhum objeto encontrado com estes termos.
            </h4>
            <p className="text-xs text-neutral-500">
              Tente alterar os termos da busca ou limpe os filtros selecionados.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {recentItems.map((item) => (
              <ItemCard key={item.id} item={item} onSelect={setSelectedItemForDetail} />
            ))}
          </div>
        )}
      </section>

      {/* HOW IT WORKS / AI BENEFIT SECTION */}
      <section className="p-8 sm:p-10 rounded-3xl bg-neutral-900 text-white space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border-b border-neutral-800 pb-6">
          <div className="space-y-2">
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30">
              Diferencial Inteligente
            </span>
            <h3 className="text-2xl font-bold">Tecnologia com IA para Cruzamento Automático</h3>
          </div>
          <button
            onClick={() => handleRegister("PERDIDO")}
            className="px-5 py-2.5 rounded-xl bg-[#00843D] hover:bg-emerald-600 text-white font-bold text-xs"
          >
            Experimentar Cadastro IA
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs leading-relaxed text-neutral-300">
          <div className="p-4 rounded-2xl bg-neutral-800/60 border border-neutral-700/60 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-[#00843D]/20 text-emerald-400 flex items-center justify-center font-bold">
              1
            </div>
            <h4 className="font-bold text-sm text-white">Extrator Inteligente</h4>
            <p>
              Ao descrever o objeto em texto livre, o modelo Gemini extrai automaticamente a categoria, cor, marca e local citado no campus.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-neutral-800/60 border border-neutral-700/60 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-[#00843D]/20 text-emerald-400 flex items-center justify-center font-bold">
              2
            </div>
            <h4 className="font-bold text-sm text-white">Similaridade Textual</h4>
            <p>
              O sistema compara instantaneamente a descrição com os objetos cadastrados no banco de dados e notifica caso haja correspondência.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-neutral-800/60 border border-neutral-700/60 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-[#00843D]/20 text-emerald-400 flex items-center justify-center font-bold">
              3
            </div>
            <h4 className="font-bold text-sm text-white">Devolução por QR Code</h4>
            <p>
              Cada item recebe uma etiqueta digital com QR Code para retirada ágil e segura no setor de Achados & Perdidos do IFPR.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
