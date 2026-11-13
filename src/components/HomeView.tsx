import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../context/RouterContext";
import { ItemCard } from "./ItemCard";
import { RecentActivityWidget } from "./RecentActivityWidget";
import { vibrateClick } from "../lib/utils";
import { filterHomeItems } from "../lib/searchUtils";
import {
  BrandLogo,
  SurfaceCard,
  SubtlePanel,
  UIButton,
  UIBadge,
  StatCard,
  EmptyState,
  UIInput,
} from "./ui";
import {
  Search,
  PlusCircle,
  PackageSearch,
  CheckCircle2,
  TrendingUp,
  MapPin,
  ArrowRight,
  ShieldCheck,
  QrCode,
  Users,
  Building2,
  X,
  LayoutGrid,
  List,
} from "lucide-react";

export const HomeView: React.FC = () => {
  const {
    items,
    notifications,
    setSelectedItemForDetail,
    setQrScannerOpen,
    requestAuthForRegistration,
    currentUser,
  } = useApp();

  const { navigate } = useRouter();

  const [homeSearch, setHomeSearch] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("TODAS");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [statusFilter, setStatusFilter] = useState<
    "TODOS" | "PERDIDO" | "ENCONTRADO" | "DEVOLVIDO"
  >("TODOS");

  // Real statistics from Firestore items
  const totalRegistered = items.length;
  const totalFound = items.filter(
    (i) => i.type === "ENCONTRADO" || i.status === "ENCONTRADO"
  ).length;
  const totalLost = items.filter(
    (i) => i.type === "PERDIDO" || i.status === "PERDIDO"
  ).length;
  const totalReturned = items.filter((i) => i.status === "DEVOLVIDO").length;
  const successRate =
    totalRegistered > 0 ? Math.round((totalReturned / totalRegistered) * 100) : 0;

  // Deterministic keyword & category filter
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

  const finalHomeItems =
    statusFilter === "TODOS"
      ? displayedItems
      : displayedItems.filter((i) =>
          statusFilter === "DEVOLVIDO"
            ? i.status === "DEVOLVIDO"
            : i.type === statusFilter || i.status === statusFilter
        );

  // Strict RBAC rule: only approved SERVIDOR/TAE and ADMIN can register items
  const canRegister =
    (currentUser?.role === "SERVIDOR" && currentUser?.approvalStatus === "APROVADO") ||
    currentUser?.role === "ADMIN";

  return (
    <div className="space-y-6 sm:space-y-8 pb-12">
      {/* 1. CLEAN MINIMAL INSTITUTIONAL HERO (MOODBOARD ALIGNED) */}
      <SurfaceCard padding="lg" className="relative overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
          {/* Left Column (7 cols): Brand Statement & Primary Actions */}
          <div className="lg:col-span-7 space-y-5">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <BrandLogo size="sm" showIfprBadge />
              <UIBadge tone="emerald">Campus Ivaiporã</UIBadge>
            </div>

            <div className="space-y-3">
              <h1 className="text-2xl sm:text-4xl font-bold text-[#172B2A] dark:text-white tracking-tight leading-[1.18]">
                Encontre ou registre objetos com facilidade!
              </h1>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                O Localiza+ ajuda a comunidade do IFPR Campus Ivaiporã a localizar objetos perdidos e encontrados com custódia oficial na Portaria e SEPAE.
              </p>
            </div>

            {/* Primary CTA Buttons (Respecting RBAC Permissions) */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <UIButton
                variant="primary"
                size="lg"
                onClick={() => {
                  vibrateClick();
                  navigate("/buscar");
                }}
              >
                <Search className="w-4 h-4" />
                <span>Consultar Objetos</span>
              </UIButton>

              {canRegister && (
                <UIButton
                  variant="outline"
                  size="lg"
                  onClick={() => handleRegister("ENCONTRADO")}
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Registrar Item</span>
                </UIButton>
              )}

              <UIButton
                variant="secondary"
                size="lg"
                onClick={() => {
                  vibrateClick();
                  setQrScannerOpen(true);
                }}
                title="Ler etiqueta física QR Code"
              >
                <QrCode className="w-4 h-4 text-[#16845B] dark:text-emerald-400" />
                <span>Ler QR Code</span>
              </UIButton>
            </div>
          </div>

          {/* Right Column (5 cols): Clean Institutional Visual & Real-Time Campus Summary */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl bg-[#EBF5F0]/60 dark:bg-slate-800/60 border border-[#16845B]/15 dark:border-slate-700/80 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 border border-[#16845B]/20 flex items-center justify-center text-[#16845B] dark:text-emerald-400 shadow-2xs">
                    <PackageSearch className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-[#064E3B] dark:text-emerald-300">
                      Resumo do Acervo
                    </h2>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      Dados reais sincronizados
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-[#16845B] dark:text-emerald-400 tabular-nums">
                  {successRate}% restituídos
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <StatCard
                  label="Registrados"
                  value={totalRegistered}
                  icon={<PackageSearch className="w-4 h-4" />}
                  iconTone="slate"
                  className="p-3 sm:p-3.5"
                  onClick={() => {
                    vibrateClick();
                    navigate("/buscar");
                  }}
                />
                <StatCard
                  label="Encontrados"
                  value={totalFound}
                  icon={<CheckCircle2 className="w-4 h-4" />}
                  iconTone="emerald"
                  className="p-3 sm:p-3.5"
                  onClick={() => {
                    vibrateClick();
                    navigate("/encontrados");
                  }}
                />
                <StatCard
                  label="Devolvidos"
                  value={totalReturned}
                  icon={<TrendingUp className="w-4 h-4" />}
                  iconTone="blue"
                  className="p-3 sm:p-3.5"
                  onClick={() => {
                    vibrateClick();
                    setStatusFilter("DEVOLVIDO");
                  }}
                />
              </div>

              <div className="pt-2 border-t border-[#16845B]/15 dark:border-slate-700/70 flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                <MapPin className="w-3.5 h-3.5 text-[#16845B] dark:text-emerald-400 shrink-0" />
                <span className="truncate">
                  <strong>Atendimento Presencial:</strong> Portaria / SEPAE (07h às 22h)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Institutional Benefits Strip (3 Pillars from Official Moodboard) */}
        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl bg-[#EBF5F0]/65 dark:bg-emerald-950/25 border border-[#16845B]/15 dark:border-emerald-900/40 p-3.5 sm:p-4">
            <div className="flex items-center gap-3 sm:justify-center sm:border-r border-[#16845B]/15 dark:border-emerald-800/40 pr-2">
              <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 text-[#16845B] dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-2xs">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-[#172B2A] dark:text-white">
                  Seguro e confiável
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Recibo digital e auditoria
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 sm:justify-center sm:border-r border-[#16845B]/15 dark:border-emerald-800/40 pr-2">
              <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 text-[#16845B] dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-2xs">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-[#172B2A] dark:text-white">
                  Para toda a comunidade
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Alunos, servidores e visitantes
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 sm:justify-center">
              <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 text-[#16845B] dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-2xs">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-[#172B2A] dark:text-white">
                  IFPR Campus Ivaiporã
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Custódia oficial integrada
                </p>
              </div>
            </div>
          </div>
        </div>
      </SurfaceCard>

      {/* 2. UNIFIED INVENTORY SEARCH & CATEGORY FILTER BAR */}
      <SurfaceCard padding="md" className="space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Main Search Input */}
          <div className="flex-1">
            <UIInput
              id="home-search-input"
              type="text"
              value={homeSearch}
              onChange={(e) => setHomeSearch(e?.target?.value ?? "")}
              placeholder="Buscar por nome, categoria, marca ou local no campus..."
              leftIcon={<Search className="w-4 h-4" />}
              rightElement={
                homeSearch ? (
                  <button
                    type="button"
                    onClick={() => setHomeSearch("")}
                    className="p-1 rounded-lg hover:text-[#172B2A] dark:hover:text-white cursor-pointer"
                    title="Limpar busca"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : undefined
              }
            />
          </div>

          {/* Quick Status Filter Tabs */}
          <div className="flex items-center p-1 rounded-xl bg-[#F8FAFC] dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 shrink-0 gap-1 overflow-x-auto">
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setStatusFilter("TODOS");
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer tabular-nums ${
                statusFilter === "TODOS"
                  ? "bg-[#16845B] text-white shadow-2xs"
                  : "text-slate-600 dark:text-slate-300 hover:text-[#172B2A] dark:hover:text-white"
              }`}
            >
              Todos ({items.length})
            </button>
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setStatusFilter("ENCONTRADO");
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer tabular-nums ${
                statusFilter === "ENCONTRADO"
                  ? "bg-[#16845B] text-white shadow-2xs"
                  : "text-slate-600 dark:text-slate-300 hover:text-[#16845B]"
              }`}
            >
              Achados ({totalFound})
            </button>
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setStatusFilter("PERDIDO");
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer tabular-nums ${
                statusFilter === "PERDIDO"
                  ? "bg-rose-600 text-white shadow-2xs"
                  : "text-slate-600 dark:text-slate-300 hover:text-rose-600"
              }`}
            >
              Perdidos ({totalLost})
            </button>
          </div>
        </div>

        {/* Categories Bar & View Mode Toggle */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 flex-1">
            {categoriesList.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  vibrateClick();
                  setSelectedCategory(cat);
                }}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border ${
                  selectedCategory === cat
                    ? "bg-[#16845B] text-white border-[#16845B] shadow-2xs"
                    : "bg-white dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-[#16845B]/40 hover:text-[#172B2A]"
                }`}
              >
                {cat === "TODAS" ? "Todos" : cat}
              </button>
            ))}
          </div>

          {/* View Mode Toggle: Grid vs List */}
          <div className="hidden sm:flex items-center gap-1 p-1 rounded-xl bg-[#F8FAFC] dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shrink-0">
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setViewMode("grid");
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-all cursor-pointer ${
                viewMode === "grid"
                  ? "bg-white dark:bg-slate-900 text-[#16845B] dark:text-emerald-400 shadow-2xs"
                  : "text-slate-500 hover:text-[#172B2A] dark:hover:text-white"
              }`}
              title="Visualização em Grade"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Grade</span>
            </button>
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                setViewMode("list");
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-all cursor-pointer ${
                viewMode === "list"
                  ? "bg-white dark:bg-slate-900 text-[#16845B] dark:text-emerald-400 shadow-2xs"
                  : "text-slate-500 hover:text-[#172B2A] dark:hover:text-white"
              }`}
              title="Visualização em Lista"
            >
              <List className="w-3.5 h-3.5" />
              <span>Lista</span>
            </button>
          </div>
        </div>
      </SurfaceCard>

      {/* 3. INVENTORY ITEMS SHOWCASE */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-[#172B2A] dark:text-white tracking-tight">
              Objetos Recentes no Acervo
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Exibindo {finalHomeItems.length} ocorrência(s) sincronizada(s)
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              vibrateClick();
              navigate("/buscar");
            }}
            className="text-xs font-semibold text-[#16845B] dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <span>Ver catálogo completo</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Grid or List View Mode */}
        {finalHomeItems.length === 0 ? (
          <EmptyState
            icon={<PackageSearch className="w-6 h-6" />}
            title="Nenhum objeto encontrado com estes filtros"
            description="Tente selecionar outra categoria, buscar por termos mais amplos ou consultar o catálogo completo do campus."
            action={
              <UIButton
                variant="secondary"
                size="sm"
                onClick={() => {
                  setHomeSearch("");
                  setSelectedCategory("TODAS");
                  setStatusFilter("TODOS");
                }}
              >
                <span>Limpar filtros</span>
              </UIButton>
            }
          />
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 w-full">
            {finalHomeItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onSelect={setSelectedItemForDetail}
              />
            ))}
          </div>
        ) : (
          <SurfaceCard padding="none" className="overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
            {finalHomeItems.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedItemForDetail(item)}
                className="p-4 flex items-center justify-between hover:bg-[#F8FAFC] dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-[#F8FAFC] dark:bg-slate-800 overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700">
                    {item.imageUrl &&
                    !item.imageUrl.includes("photo-1584438784894-089d6a62b8fa") ? (
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <PackageSearch className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono text-[11px] font-semibold text-[#16845B] dark:text-emerald-400">
                        {item.id}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{item.category}</span>
                    </div>
                    <h4 className="font-semibold text-sm text-[#172B2A] dark:text-white truncate group-hover:text-[#16845B] dark:group-hover:text-emerald-400 transition-colors">
                      {item.title}
                    </h4>
                    <p className="text-xs text-slate-500 truncate flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 text-[#16845B] dark:text-emerald-400 shrink-0" />
                      <span>{item.location}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <UIBadge tone={item.type === "ENCONTRADO" ? "emerald" : "rose"}>
                    {item.type}
                  </UIBadge>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#16845B] group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
            ))}
          </SurfaceCard>
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
      <SurfaceCard padding="lg" className="space-y-5">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#16845B] dark:text-emerald-400">
              Protocolo Oficial IFPR
            </span>
            <h3 className="text-lg sm:text-xl font-bold text-[#172B2A] dark:text-white tracking-tight">
              Como funciona o ciclo de custódia e restituição
            </h3>
          </div>
          {canRegister && (
            <UIButton
              variant="primary"
              size="sm"
              onClick={() => handleRegister("ENCONTRADO")}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Registrar Ocorrência</span>
            </UIButton>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs leading-relaxed">
          <SubtlePanel padding="sm" className="space-y-2">
            <span className="w-7 h-7 rounded-lg bg-[#EBF5F0] dark:bg-emerald-950/60 text-[#16845B] dark:text-emerald-400 font-bold flex items-center justify-center text-xs tabular-nums">
              01
            </span>
            <h4 className="font-bold text-sm text-[#172B2A] dark:text-white">
              Triagem Inicial
            </h4>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-xs">
              O item é cadastrado com descrição, fotos e indicação precisa do setor ou bloco no campus.
            </p>
          </SubtlePanel>

          <SubtlePanel padding="sm" className="space-y-2">
            <span className="w-7 h-7 rounded-lg bg-[#EBF5F0] dark:bg-emerald-950/60 text-[#16845B] dark:text-emerald-400 font-bold flex items-center justify-center text-xs tabular-nums">
              02
            </span>
            <h4 className="font-bold text-sm text-[#172B2A] dark:text-white">
              Etiqueta Física QR
            </h4>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-xs">
              A administração gera e fixa a etiqueta física com identificador QR Code único no pertence.
            </p>
          </SubtlePanel>

          <SubtlePanel padding="sm" className="space-y-2">
            <span className="w-7 h-7 rounded-lg bg-[#EBF5F0] dark:bg-emerald-950/60 text-[#16845B] dark:text-emerald-400 font-bold flex items-center justify-center text-xs tabular-nums">
              03
            </span>
            <h4 className="font-bold text-sm text-[#172B2A] dark:text-white">
              Consulta e Reivindicação
            </h4>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-xs">
              Alunos e servidores consultam o catálogo online e solicitam a recuperação com verificação.
            </p>
          </SubtlePanel>

          <SubtlePanel padding="sm" className="space-y-2">
            <span className="w-7 h-7 rounded-lg bg-[#EBF5F0] dark:bg-emerald-950/60 text-[#16845B] dark:text-emerald-400 font-bold flex items-center justify-center text-xs tabular-nums">
              04
            </span>
            <h4 className="font-bold text-sm text-[#172B2A] dark:text-white">
              Termo de Devolução
            </h4>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-xs">
              A entrega ao proprietário é formalizada com assinatura digital e baixa auditável no sistema.
            </p>
          </SubtlePanel>
        </div>
      </SurfaceCard>
    </div>
  );
};
