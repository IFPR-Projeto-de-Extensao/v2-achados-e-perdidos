import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../context/RouterContext";
import { ItemCard } from "./ItemCard";
import { LostFoundItem, ItemStatus } from "../types";
import {
  PackageSearch,
  CheckCircle2,
  PlusCircle,
  Clock,
  Filter,
  Search,
  QrCode,
  Sparkles,
  ArrowRight,
  LogIn,
  Layers,
  CheckCircle,
} from "lucide-react";
import { vibrateClick } from "../lib/utils";

export const MyItemsView: React.FC = () => {
  const {
    items,
    currentUser,
    isAuthenticated,
    isGuest,
    setAuthModalOpen,
    setSelectedItemForDetail,
    requestAuthForRegistration,
    t,
  } = useApp();
  const { navigate } = useRouter();

  const [activeSubTab, setActiveSubTab] = useState<"ALL" | "PERDIDO" | "ENCONTRADO" | "DEVOLVIDO">("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  // Filter items created by current user strictly by real UID
  const myItems = items.filter((it) => {
    if (isGuest || !isAuthenticated || !currentUser || currentUser.id === "guest") return false;
    return it.registeredByUserId && it.registeredByUserId === currentUser.id;
  });

  const totalRegistered = myItems.length;
  const lostCount = myItems.filter((i) => i.type === "PERDIDO").length;
  const foundCount = myItems.filter((i) => i.type === "ENCONTRADO").length;
  const returnedCount = myItems.filter((i) => i.status === "DEVOLVIDO").length;

  const filteredItems = myItems.filter((it) => {
    if (activeSubTab === "PERDIDO" && it.type !== "PERDIDO") return false;
    if (activeSubTab === "ENCONTRADO" && it.type !== "ENCONTRADO") return false;
    if (activeSubTab === "DEVOLVIDO" && it.status !== "DEVOLVIDO") return false;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return (
        it.title.toLowerCase().includes(q) ||
        it.description.toLowerCase().includes(q) ||
        it.location.toLowerCase().includes(q) ||
        it.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (!isAuthenticated || isGuest) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 animate-in fade-in duration-300">
        <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-8 sm:p-10 border border-neutral-200 dark:border-neutral-800 shadow-xl text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-[#00843D] dark:text-green-400 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center mx-auto shadow-inner">
            <Layers className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
              Meus Registros de Objetos
            </h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 max-w-md mx-auto leading-relaxed">
              Faça login no Localiza+ para visualizar o histórico de todos os itens perdidos e encontrados que você cadastrou, acompanhar devoluções e gerar etiquetas QR Code.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => {
                vibrateClick();
                setAuthModalOpen(true);
              }}
              className="py-3.5 px-6 rounded-2xl bg-[#00843D] hover:bg-[#006e33] text-white font-black text-sm shadow-lg shadow-[#00843D]/20 transition-all flex items-center justify-center space-x-2"
            >
              <LogIn className="w-4 h-4" />
              <span>Entrar na Minha Conta</span>
            </button>
            <button
              onClick={() => {
                vibrateClick();
                navigate("/buscar");
              }}
              className="py-3.5 px-6 rounded-2xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-bold text-sm transition-all flex items-center justify-center space-x-2"
            >
              <Search className="w-4 h-4" />
              <span>Buscar Todos os Objetos</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#1E1E1E] p-6 sm:p-8 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-xs">
        <div>
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 text-[#00843D] dark:text-green-400 text-xs font-black uppercase tracking-wider mb-2">
            <Layers className="w-3.5 h-3.5" />
            <span>Gerenciamento de Publicações</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white tracking-tight">
            Meus Registros
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Acompanhe o status, reivindicações e devoluções dos itens que você publicou no IFPR.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => {
              vibrateClick();
              requestAuthForRegistration("PERDIDO");
              navigate("/cadastrar?tipo=perdido");
            }}
            className="px-4 py-2.5 rounded-2xl bg-[#EF4444] hover:bg-red-600 text-white font-bold text-xs shadow-md transition-all flex items-center space-x-1.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Cadastrar Perdido</span>
          </button>

          <button
            onClick={() => {
              vibrateClick();
              requestAuthForRegistration("ENCONTRADO");
              navigate("/cadastrar?tipo=encontrado");
            }}
            className="px-4 py-2.5 rounded-2xl bg-[#00843D] hover:bg-[#006e33] text-white font-bold text-xs shadow-md transition-all flex items-center space-x-1.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Cadastrar Encontrado</span>
          </button>
        </div>
      </div>

      {/* Summary Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#1E1E1E] p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 text-xs font-bold mb-2">
            <span>Total Publicado</span>
            <Layers className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
            {totalRegistered}
          </p>
        </div>

        <div className="bg-white dark:bg-[#1E1E1E] p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="flex items-center justify-between text-red-500 text-xs font-bold mb-2">
            <span>Objetos Perdidos</span>
            <PackageSearch className="w-4 h-4" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-red-600 dark:text-red-400">
            {lostCount}
          </p>
        </div>

        <div className="bg-white dark:bg-[#1E1E1E] p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="flex items-center justify-between text-emerald-500 text-xs font-bold mb-2">
            <span>Objetos Encontrados</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-green-400">
            {foundCount}
          </p>
        </div>

        <div className="bg-white dark:bg-[#1E1E1E] p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="flex items-center justify-between text-blue-500 text-xs font-bold mb-2">
            <span>Devolvidos com Sucesso</span>
            <CheckCircle className="w-4 h-4" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400">
            {returnedCount}
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-[#1E1E1E] p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Sub-Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          <button
            onClick={() => {
              vibrateClick();
              setActiveSubTab("ALL");
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
              activeSubTab === "ALL"
                ? "bg-[#00843D] text-white shadow-xs"
                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            }`}
          >
            Todos ({totalRegistered})
          </button>

          <button
            onClick={() => {
              vibrateClick();
              setActiveSubTab("PERDIDO");
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
              activeSubTab === "PERDIDO"
                ? "bg-red-500 text-white shadow-xs"
                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            }`}
          >
            Perdidos ({lostCount})
          </button>

          <button
            onClick={() => {
              vibrateClick();
              setActiveSubTab("ENCONTRADO");
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
              activeSubTab === "ENCONTRADO"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            }`}
          >
            Encontrados ({foundCount})
          </button>

          <button
            onClick={() => {
              vibrateClick();
              setActiveSubTab("DEVOLVIDO");
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
              activeSubTab === "DEVOLVIDO"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            }`}
          >
            Devolvidos ({returnedCount})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar meus itens..."
            className="w-full pl-9 pr-3.5 py-2 rounded-xl text-xs bg-neutral-100 dark:bg-neutral-800 border border-transparent focus:border-[#00843D] dark:focus:border-green-500 focus:outline-none text-neutral-900 dark:text-white"
          />
        </div>
      </div>

      {/* Items Grid */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800">
          <PackageSearch className="w-12 h-12 text-neutral-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-neutral-900 dark:text-white mb-1">
            Nenhum item encontrado nesta categoria
          </h3>
          <p className="text-xs text-neutral-500 max-w-sm mx-auto mb-6">
            {searchTerm
              ? "Tente buscar com outro termo."
              : "Você ainda não possui publicações nesta seção."}
          </p>
          <button
            onClick={() => {
              vibrateClick();
              navigate("/cadastrar");
            }}
            className="px-5 py-2.5 rounded-xl bg-[#00843D] text-white font-bold text-xs shadow-md hover:bg-[#006e33] transition-colors inline-flex items-center space-x-2"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Cadastrar Novo Objeto</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onSelect={setSelectedItemForDetail}
            />
          ))}
        </div>
      )}
    </div>
  );
};
