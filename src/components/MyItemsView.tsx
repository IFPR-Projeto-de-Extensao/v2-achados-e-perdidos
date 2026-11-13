import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../context/RouterContext";
import { ItemCard } from "./ItemCard";
import {
  PackageSearch,
  CheckCircle2,
  PlusCircle,
  Clock,
  Search,
  LogIn,
  Layers,
  CheckCircle,
  User as UserIcon,
  ShieldCheck,
  Info,
  ChevronRight,
  Plus,
} from "lucide-react";
import { vibrateClick } from "../lib/utils";
import {
  SurfaceCard,
  StatCard,
  UIButton,
  UIBadge,
  EmptyState,
} from "./ui";

export const MyItemsView: React.FC = () => {
  const {
    items,
    claims,
    currentUser,
    isAuthenticated,
    isGuest,
    setAuthModalOpen,
    setSelectedItemForDetail,
    requestAuthForRegistration,
  } = useApp();
  const { navigate } = useRouter();

  const [activeSubTab, setActiveSubTab] = useState<"ALL" | "PERDIDO" | "ENCONTRADO" | "DEVOLVIDO">("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  // Strict RBAC check: Only approved SERVIDOR or ADMIN can register objects
  const canRegisterObjects = Boolean(
    currentUser &&
      !isGuest &&
      isAuthenticated &&
      ((currentUser.role === "SERVIDOR" && currentUser.approvalStatus === "APROVADO") ||
        currentUser.role === "ADMIN")
  );

  // Filter items created by current user strictly by real UID
  const myItems = items.filter((it) => {
    if (isGuest || !isAuthenticated || !currentUser || currentUser.id === "guest") return false;
    return it.registeredByUserId && it.registeredByUserId === currentUser.id;
  });

  // Real claims created by current user
  const myClaims = (claims || []).filter((c) => {
    if (isGuest || !isAuthenticated || !currentUser || currentUser.id === "guest") return false;
    return c.claimerId === currentUser.id;
  });

  const totalRegistered = myItems.length;
  const lostCount = myItems.filter((i) => i.type === "PERDIDO").length;
  const foundCount = myItems.filter((i) => i.type === "ENCONTRADO").length;
  const returnedCount = myItems.filter((i) => i.status === "DEVOLVIDO").length;
  const pendingDeliveriesCount =
    myItems.filter((i) => i.status === "EM_ANALISE" || i.status === "PROPRIETARIO_IDENTIFICADO").length +
    myClaims.filter((c) => c.status === "PENDENTE" || c.status === "APROVADO").length;

  const firstName = currentUser?.name ? currentUser.name.trim().split(/\s+/)[0] : "Estudante";

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
        <SurfaceCard className="p-8 sm:p-10 text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-[#EBF5F0] dark:bg-[#16845B]/20 text-[#16845B] dark:text-emerald-400 border border-[#16845B]/15 flex items-center justify-center mx-auto">
            <Layers className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#172B2A] dark:text-white">
              Meus Registros e Solicitações
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              Faça login no Localiza+ para acompanhar suas solicitações de devolução, consultar objetos encontrados e gerenciar seus registros no IFPR Campus Ivaiporã.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            <UIButton
              variant="primary"
              size="lg"
              onClick={() => {
                vibrateClick();
                setAuthModalOpen(true);
              }}
            >
              <LogIn className="w-4 h-4" />
              <span>Entrar na Minha Conta</span>
            </UIButton>
            <UIButton
              variant="secondary"
              size="lg"
              onClick={() => {
                vibrateClick();
                navigate("/buscar");
              }}
            >
              <Search className="w-4 h-4" />
              <span>Consultar Objetos</span>
            </UIButton>
          </div>
        </SurfaceCard>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300 pb-12">
      {/* Greeting & Personal Area Header (Moodboard Clean Minimal Top-Right Reference) */}
      <SurfaceCard className="p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <UIBadge tone="emerald">
                <Layers className="w-3.5 h-3.5" />
                <span>Área Pessoal</span>
              </UIBadge>
              <UIBadge tone="slate">{currentUser.role}</UIBadge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#172B2A] dark:text-white tracking-tight">
              Olá, {firstName}!
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Bem-vindo ao Localiza+ • Acompanhe seus registros, solicitações e devoluções no campus.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <UIButton
              variant="outline"
              size="md"
              onClick={() => {
                vibrateClick();
                navigate("/buscar");
              }}
            >
              <Search className="w-4 h-4" />
              <span>Consultar Objetos</span>
            </UIButton>

            {canRegisterObjects && (
              <>
                <UIButton
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    vibrateClick();
                    requestAuthForRegistration("PERDIDO");
                    navigate("/cadastrar?tipo=perdido");
                  }}
                >
                  <PlusCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <span>Cadastrar Perdido</span>
                </UIButton>

                <UIButton
                  variant="primary"
                  size="md"
                  onClick={() => {
                    vibrateClick();
                    requestAuthForRegistration("ENCONTRADO");
                    navigate("/cadastrar?tipo=encontrado");
                  }}
                >
                  <Plus className="w-4 h-4" />
                  <span>Registrar Item</span>
                </UIButton>
              </>
            )}
          </div>
        </div>
      </SurfaceCard>

      {/* Summary Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Meus Registros"
          value={totalRegistered}
          icon={<Layers className="w-5 h-5" />}
          iconTone="emerald"
        />
        <StatCard
          label="Devolução Pendente"
          value={pendingDeliveriesCount}
          icon={<Clock className="w-5 h-5" />}
          iconTone="amber"
        />
        <StatCard
          label="Solicitações Realizadas"
          value={myClaims.length}
          icon={<ShieldCheck className="w-5 h-5" />}
          iconTone="blue"
          onClick={() => {
            vibrateClick();
            navigate("/perfil");
          }}
        />
        <StatCard
          label="Devolvidos com Sucesso"
          value={returnedCount}
          icon={<CheckCircle className="w-5 h-5" />}
          iconTone="emerald"
        />
      </div>

      {/* Quick Actions Section (Aligned with Moodboard "Ações Rápidas") */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-[#172B2A] dark:text-white tracking-tight">
          Ações Rápidas
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => {
              vibrateClick();
              navigate("/buscar");
            }}
            className="bg-white dark:bg-[#111827] hover:border-[#16845B]/50 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 flex items-center gap-4 text-left shadow-[0_1px_3px_rgba(23,43,42,0.04)] hover:shadow-[0_4px_14px_rgba(22,132,91,0.08)] transition-all cursor-pointer group"
          >
            <div className="w-11 h-11 rounded-xl bg-[#EBF5F0] dark:bg-[#16845B]/20 text-[#16845B] dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Search className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-[#172B2A] dark:text-white">
                Consultar Objetos
              </span>
              <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
                Buscar itens perdidos e encontrados
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#16845B] transition-colors shrink-0" />
          </button>

          {canRegisterObjects ? (
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                requestAuthForRegistration("ENCONTRADO");
                navigate("/cadastrar?tipo=encontrado");
              }}
              className="bg-white dark:bg-[#111827] hover:border-[#16845B]/50 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 flex items-center gap-4 text-left shadow-[0_1px_3px_rgba(23,43,42,0.04)] hover:shadow-[0_4px_14px_rgba(22,132,91,0.08)] transition-all cursor-pointer group"
            >
              <div className="w-11 h-11 rounded-xl bg-[#EBF5F0] dark:bg-[#16845B]/20 text-[#16845B] dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Plus className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-[#172B2A] dark:text-white">
                  Registrar Item
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
                  Cadastrar novo objeto na custódia
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#16845B] transition-colors shrink-0" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                navigate("/perfil");
              }}
              className="bg-white dark:bg-[#111827] hover:border-[#16845B]/50 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 flex items-center gap-4 text-left shadow-[0_1px_3px_rgba(23,43,42,0.04)] hover:shadow-[0_4px_14px_rgba(22,132,91,0.08)] transition-all cursor-pointer group"
            >
              <div className="w-11 h-11 rounded-xl bg-[#EBF5F0] dark:bg-[#16845B]/20 text-[#16845B] dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-[#172B2A] dark:text-white">
                  Acompanhar Solicitações
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
                  Ver status de reivindicações de posse
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#16845B] transition-colors shrink-0" />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              vibrateClick();
              navigate("/perfil");
            }}
            className="bg-white dark:bg-[#111827] hover:border-[#16845B]/50 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 flex items-center gap-4 text-left shadow-[0_1px_3px_rgba(23,43,42,0.04)] hover:shadow-[0_4px_14px_rgba(22,132,91,0.08)] transition-all cursor-pointer group"
          >
            <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <UserIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-[#172B2A] dark:text-white">
                Visualizar Perfil
              </span>
              <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
                Dados institucionais e notificações
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#16845B] transition-colors shrink-0" />
          </button>
        </div>

        {/* Institutional guidance banner from moodboard */}
        <div className="rounded-2xl bg-[#EBF5F0] dark:bg-[#16845B]/15 border border-[#16845B]/20 px-4 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-[#16845B] text-white flex items-center justify-center shrink-0">
              <Info className="w-4 h-4" />
            </div>
            <p className="text-xs sm:text-sm font-medium text-[#172B2A] dark:text-emerald-100">
              Em caso de dúvidas ou retirada de pertences, compareça à SEBAC / Administração do campus com documento com foto.
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <SurfaceCard className="p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Sub-Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => {
              vibrateClick();
              setActiveSubTab("ALL");
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              activeSubTab === "ALL"
                ? "bg-[#16845B] text-white shadow-xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            Todos ({totalRegistered})
          </button>

          <button
            type="button"
            onClick={() => {
              vibrateClick();
              setActiveSubTab("PERDIDO");
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              activeSubTab === "PERDIDO"
                ? "bg-rose-600 text-white shadow-xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            Perdidos ({lostCount})
          </button>

          <button
            type="button"
            onClick={() => {
              vibrateClick();
              setActiveSubTab("ENCONTRADO");
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              activeSubTab === "ENCONTRADO"
                ? "bg-[#16845B] text-white shadow-xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            Encontrados ({foundCount})
          </button>

          <button
            type="button"
            onClick={() => {
              vibrateClick();
              setActiveSubTab("DEVOLVIDO");
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              activeSubTab === "DEVOLVIDO"
                ? "bg-sky-600 text-white shadow-xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            Devolvidos ({returnedCount})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar meus registros..."
            className="w-full pl-9 pr-3.5 py-2 rounded-xl text-xs bg-[#F8FAFC] dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 focus:border-[#16845B] dark:focus:border-emerald-500 focus:outline-none text-[#172B2A] dark:text-white"
          />
        </div>
      </SurfaceCard>

      {/* Items Grid */}
      {filteredItems.length === 0 ? (
        <EmptyState
          icon={<PackageSearch className="w-7 h-7" />}
          title="Nenhum item encontrado nesta categoria"
          description={
            searchTerm
              ? "Tente buscar com outro termo ou limpar o filtro."
              : "Você ainda não possui registros publicados nesta seção."
          }
          action={
            canRegisterObjects ? (
              <UIButton
                variant="primary"
                size="md"
                onClick={() => {
                  vibrateClick();
                  navigate("/cadastrar");
                }}
              >
                <PlusCircle className="w-4 h-4" />
                <span>Cadastrar Novo Objeto</span>
              </UIButton>
            ) : (
              <UIButton
                variant="primary"
                size="md"
                onClick={() => {
                  vibrateClick();
                  navigate("/buscar");
                }}
              >
                <Search className="w-4 h-4" />
                <span>Consultar Catálogo de Objetos</span>
              </UIButton>
            )
          }
        />
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
export default MyItemsView;
