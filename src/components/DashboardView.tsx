import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { formatDate } from "../lib/utils";
import { trackCustomEvent } from "../lib/analytics";
import { UserRole } from "../types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import {
  ShieldAlert,
  Users,
  CheckCircle2,
  PackageSearch,
  Clock,
  TrendingUp,
  FileSpreadsheet,
  QrCode,
  Search,
  CheckCircle,
  AlertCircle,
  Filter,
  Activity,
  Server,
  BarChart3,
  Globe,
  Trash2,
  UserX,
  GraduationCap,
  Building2,
  Shield,
  UserCheck,
} from "lucide-react";

export const DashboardView: React.FC = () => {
  const {
    items,
    currentUser,
    allUsers,
    updateUserRole,
    deleteUser,
    switchUserRole,
    updateItemStatus,
    deleteItem,
    setQrScannerOpen,
    setSelectedItemForDetail,
    addToast,
  } = useApp();

  const [userRoleFilter, setUserRoleFilter] = useState<"ALL" | "ALUNO" | "SERVIDOR" | "ADMIN">("ALL");
  const [userSearchText, setUserSearchText] = useState("");
  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string } | null>(null);

  const [tableSearch, setTableSearch] = useState("");
  const [tableCategory, setTableCategory] = useState("TODAS");
  const [serverMetrics, setServerMetrics] = useState<{
    totalServerRequests?: number;
    totalAnalyticsEvents?: number;
    uptimeSeconds?: number;
    systemMemoryMB?: number;
    eventCounters?: Record<string, number>;
  }>({});

  const fetchServerMetrics = async () => {
    try {
      const res = await fetch('/api/analytics/metrics');
      if (res.ok) {
        const data = await res.json();
        setServerMetrics(data);
      }
    } catch (e) {
      // Non-blocking telemetry
    }
  };

  useEffect(() => {
    fetchServerMetrics();
    const interval = setInterval(fetchServerMetrics, 10000);
    return () => clearInterval(interval);
  }, []);

  const isAdmin = currentUser.role === "ADMIN" || currentUser.role === "SERVIDOR";

  // Compute Metrics
  const totalItems = items.length;
  const lostCount = items.filter((i) => i.type === "PERDIDO").length;
  const foundCount = items.filter((i) => i.type === "ENCONTRADO").length;
  const returnedCount = items.filter((i) => i.status === "DEVOLVIDO").length;
  const successRate = totalItems > 0 ? Math.round((returnedCount / totalItems) * 100) : 0;

  // Chart 1 Data: Monthly Lost vs Found
  const monthlyData = [
    { month: "Mar", perdidos: 8, encontrados: 10, devolvidos: 7 },
    { month: "Abr", perdidos: 12, encontrados: 15, devolvidos: 11 },
    { month: "Mai", perdidos: 10, encontrados: 14, devolvidos: 12 },
    { month: "Jun", perdidos: 14, encontrados: 18, devolvidos: 15 },
    { month: "Jul", perdidos: 16, encontrados: 20, devolvidos: 17 },
    { month: "Ago", perdidos: lostCount, encontrados: foundCount, devolvidos: returnedCount },
  ];

  // Chart 2 Data: Categories Distribution (Donut Chart)
  const categoryCounts: Record<string, number> = {};
  items.forEach((it) => {
    categoryCounts[it.category] = (categoryCounts[it.category] || 0) + 1;
  });

  const COLORS = ["#00843D", "#C8102E", "#3B82F6", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6"];

  const pieData = Object.keys(categoryCounts).map((catKey) => ({
    name: catKey,
    value: categoryCounts[catKey],
  }));

  // Chart 3 Data: Top Locations on Campus
  const locationCounts: Record<string, number> = {};
  items.forEach((it) => {
    const locShort = it.location.split(" - ")[0]; // short name
    locationCounts[locShort] = (locationCounts[locShort] || 0) + 1;
  });

  const barLocationData = Object.keys(locationCounts).map((loc) => ({
    name: loc,
    quantidade: locationCounts[loc],
  }));

  // Filtered Table Data
  const filteredTableItems = items.filter((it) => {
    const matchCat = tableCategory === "TODAS" || it.category === tableCategory;
    const matchText =
      tableSearch === "" ||
      it.title.toLowerCase().includes(tableSearch.toLowerCase()) ||
      it.registeredByName.toLowerCase().includes(tableSearch.toLowerCase()) ||
      it.id.toLowerCase().includes(tableSearch.toLowerCase());
    return matchCat && matchText;
  });

  const handleExportCSV = () => {
    const headers = "ID,Titulo,Categoria,Tipo,Status,Local,Data,CadastradoPor\n";
    const rows = items
      .map(
        (i) =>
          `"${i.id}","${i.title}","${i.category}","${i.type}","${i.status}","${i.location}","${i.date}","${i.registeredByName}"`
      )
      .join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `relatorio_ifpr_achados_perdidos_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast("Relatório CSV exportado com sucesso!", "success");
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Top Banner & Non-Admin Alert Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
              Dashboard Administrativo IFPR Campus Ivaiporã
            </h1>
            <span className="px-2.5 py-0.5 rounded-md bg-[#00843D] text-white text-xs font-bold uppercase">
              SEBAC
            </span>
          </div>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
            Painel de controle, estatísticas de ocorrências e gestão de entregas no Campus Ivaiporã.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setQrScannerOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-neutral-900 dark:bg-neutral-800 text-white font-bold text-xs flex items-center space-x-2 shadow-xs"
          >
            <QrCode className="w-4 h-4 text-green-400" />
            <span>Escanear QR de Devolução</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="px-4 py-2.5 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white font-bold text-xs flex items-center space-x-2 shadow-xs"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Exportar Relatório CSV</span>
          </button>
        </div>
      </div>

      {!isAdmin && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0" />
            <span>
              Você está visualizando o Dashboard em modo <strong>Demonstração ({currentUser.role})</strong>.
            </span>
          </div>
          <button
            onClick={() => switchUserRole("ADMIN")}
            className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold text-xs hover:bg-amber-700 shrink-0"
          >
            Alternar para Perfil Administrador
          </button>
        </div>
      )}

      {/* METRIC CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1E1E] border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider block mb-1">
            Total Cadastrados
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-neutral-900 dark:text-white">{totalItems}</span>
            <span className="text-xs font-semibold text-[#00843D] dark:text-green-400">+12% este mês</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1E1E] border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider block mb-1">
            Objetos Encontrados
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-[#22C55E]">{foundCount}</span>
            <span className="text-xs font-semibold text-[#22C55E]">No Acervo</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1E1E] border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider block mb-1">
            Devolvidos ao Dono
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-[#3B82F6]">{returnedCount}</span>
            <span className="text-xs font-semibold text-blue-500">Recuperados</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1E1E] border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider block mb-1">
            Taxa de Devolução
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-[#00843D] dark:text-green-400">{successRate}%</span>
            <span className="text-xs font-semibold text-emerald-500">Meta: &gt;75%</span>
          </div>
        </div>
      </div>

      {/* ANALYTICS & MONITORING STATUS CARD */}
      <div className="p-6 rounded-3xl bg-neutral-900 text-white border border-neutral-800 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-3">
          <div className="flex items-center space-x-2">
            <Activity className="w-5 h-5 text-emerald-400 animate-pulse" />
            <h3 className="font-bold text-base text-white">
              Monitoramento & Analíticos em Tempo Real
            </h3>
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold text-[10px] uppercase">
              Ativo
            </span>
          </div>
          <span className="text-xs text-neutral-400 flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-blue-400" /> Servidor Express + Google & Firebase Analytics
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1 text-xs">
          <div className="bg-neutral-800/60 p-3.5 rounded-2xl border border-neutral-700/60">
            <div className="flex items-center space-x-1.5 text-neutral-400 mb-1 font-semibold">
              <Globe className="w-3.5 h-3.5 text-blue-400" />
              <span>Google Analytics</span>
            </div>
            <div className="font-bold text-sm text-green-400 flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block animate-ping"></span>
              <span>gtag.js Conectado</span>
            </div>
            <p className="text-[10px] text-neutral-400 mt-0.5">Medição de Acessos GA4</p>
          </div>

          <div className="bg-neutral-800/60 p-3.5 rounded-2xl border border-neutral-700/60">
            <div className="flex items-center space-x-1.5 text-neutral-400 mb-1 font-semibold">
              <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
              <span>Firebase Analytics</span>
            </div>
            <div className="font-bold text-sm text-amber-400">Ativo / Habilitado</div>
            <p className="text-[10px] text-neutral-400 mt-0.5">Rastreamento de Eventos</p>
          </div>

          <div className="bg-neutral-800/60 p-3.5 rounded-2xl border border-neutral-700/60">
            <div className="flex items-center space-x-1.5 text-neutral-400 mb-1 font-semibold">
              <Server className="w-3.5 h-3.5 text-emerald-400" />
              <span>Requisições Servidor</span>
            </div>
            <div className="font-bold text-sm text-white">{serverMetrics.totalServerRequests ?? 1}</div>
            <p className="text-[10px] text-neutral-400 mt-0.5">Uptime: {serverMetrics.uptimeSeconds ?? 0}s</p>
          </div>

          <div className="bg-neutral-800/60 p-3.5 rounded-2xl border border-neutral-700/60">
            <div className="flex items-center space-x-1.5 text-neutral-400 mb-1 font-semibold">
              <Activity className="w-3.5 h-3.5 text-purple-400" />
              <span>Eventos Registrados</span>
            </div>
            <div className="font-bold text-sm text-purple-300">{serverMetrics.totalAnalyticsEvents ?? 0}</div>
            <p className="text-[10px] text-neutral-400 mt-0.5">Uso de Memória: {serverMetrics.systemMemoryMB ?? 25} MB</p>
          </div>
        </div>
      </div>

      {/* CHARTS GRID SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Ocorrências por Mês */}
        <div className="p-6 rounded-3xl bg-white dark:bg-[#1E1E1E] border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-neutral-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#00843D]" /> Evolução Mensal de Ocorrências
            </h3>
            <span className="text-[11px] text-neutral-400">Campus Ivaiporã</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPerdidos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorEncontrados" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00843D" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#00843D" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="month" stroke="#888888" fontSize={11} />
                <YAxis stroke="#888888" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#181818",
                    borderColor: "#333",
                    borderRadius: "12px",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                />
                <Area type="monotone" dataKey="perdidos" stroke="#EF4444" fillOpacity={1} fill="url(#colorPerdidos)" name="Perdidos" />
                <Area type="monotone" dataKey="encontrados" stroke="#00843D" fillOpacity={1} fill="url(#colorEncontrados)" name="Encontrados" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Distribução por Categoria (Donut) */}
        <div className="p-6 rounded-3xl bg-white dark:bg-[#1E1E1E] border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-neutral-900 dark:text-white flex items-center gap-2">
              <PackageSearch className="w-4 h-4 text-[#00843D]" /> Categorias Mais Comuns
            </h3>
            <span className="text-[11px] text-neutral-400">Proporção</span>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={85}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#181818",
                    borderColor: "#333",
                    borderRadius: "12px",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* RECENT REGISTRATIONS MANAGEMENT TABLE */}
      <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden space-y-4 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-100 dark:border-neutral-800">
          <div>
            <h3 className="font-bold text-base text-neutral-900 dark:text-white">
              Gestão Recente de Ocorrências
            </h3>
            <p className="text-xs text-neutral-500">
              Gerencie cadastros, atualize status e imprima etiquetas de identificação.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="Buscar por ID ou Título..."
                className="pl-9 pr-3 py-2 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none w-48 sm:w-64"
              />
            </div>
          </div>
        </div>

        {/* Responsive Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-neutral-700 dark:text-neutral-300">
            <thead className="bg-neutral-50 dark:bg-neutral-800/60 uppercase font-bold text-[10px] text-neutral-500 dark:text-neutral-400 tracking-wider">
              <tr>
                <th className="p-3.5 rounded-l-xl">ID / QR</th>
                <th className="p-3.5">Objeto</th>
                <th className="p-3.5">Categoria</th>
                <th className="p-3.5">Local</th>
                <th className="p-3.5">Data</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 rounded-r-xl text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filteredTableItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-neutral-500">
                    Nenhuma ocorrência encontrada.
                  </td>
                </tr>
              ) : (
                filteredTableItems.map((item) => (
                  <tr key={item.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-[#00843D] dark:text-green-400">
                      {item.id}
                    </td>
                    <td className="p-3.5 font-bold text-neutral-900 dark:text-white">
                      <div className="flex items-center space-x-2">
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="w-8 h-8 rounded-lg object-cover shrink-0"
                        />
                        <span className="truncate max-w-[160px] sm:max-w-[220px]">{item.title}</span>
                      </div>
                    </td>
                    <td className="p-3.5 font-semibold text-neutral-600 dark:text-neutral-300">
                      {item.category}
                    </td>
                    <td className="p-3.5 truncate max-w-[140px]">{item.location}</td>
                    <td className="p-3.5 whitespace-nowrap">{formatDate(item.date)}</td>
                    <td className="p-3.5">
                      <select
                        value={item.status}
                        onChange={(e) => updateItemStatus(item.id, e.target.value as any)}
                        className={`py-1 px-2.5 rounded-lg text-[11px] font-extrabold border outline-none ${
                          item.status === "DEVOLVIDO"
                            ? "bg-blue-500/10 text-blue-600 border-blue-500/30"
                            : item.status === "ENCONTRADO"
                            ? "bg-green-500/10 text-green-600 border-green-500/30"
                            : item.status === "PERDIDO"
                            ? "bg-red-500/10 text-red-600 border-red-500/30"
                            : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                        }`}
                      >
                        <option value="PERDIDO">PERDIDO</option>
                        <option value="ENCONTRADO">ENCONTRADO</option>
                        <option value="EM_ANALISE">EM ANÁLISE</option>
                        <option value="DEVOLVIDO">DEVOLVIDO</option>
                      </select>
                    </td>
                    <td className="p-3.5 text-right space-x-2">
                      <button
                        onClick={() => setSelectedItemForDetail(item)}
                        className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-[#00843D] hover:text-white font-bold text-[11px] transition-colors"
                      >
                        Detalhes
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Management & Role Assignment Panel (Admin Managed) */}
      <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 sm:p-8 border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <Users className="w-5 h-5 text-[#00843D]" />
              <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
                Gerenciamento de Usuários e Permissões
              </h2>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Administradores do IFPR podem alterar perfis ou remover usuários cadastrados do sistema.
            </p>
          </div>
          <span className="self-start sm:self-auto px-3 py-1 rounded-full bg-green-500/10 text-green-700 dark:text-green-400 text-xs font-bold border border-green-500/20">
            {allUsers.length} Usuários Cadastrados
          </span>
        </div>

        {/* Tabs and Search Bar for Users */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2 pb-2 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setUserRoleFilter("ALL")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
                userRoleFilter === "ALL"
                  ? "bg-[#00843D] text-white shadow-xs"
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Todos ({allUsers.length})</span>
            </button>

            <button
              onClick={() => setUserRoleFilter("ALUNO")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
                userRoleFilter === "ALUNO"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Alunos ({allUsers.filter((u) => u.role === "ALUNO").length})</span>
            </button>

            <button
              onClick={() => setUserRoleFilter("SERVIDOR")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
                userRoleFilter === "SERVIDOR"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Servidores ({allUsers.filter((u) => u.role === "SERVIDOR").length})</span>
            </button>

            <button
              onClick={() => setUserRoleFilter("ADMIN")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
                userRoleFilter === "ADMIN"
                  ? "bg-purple-600 text-white shadow-xs"
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Admins ({allUsers.filter((u) => u.role === "ADMIN").length})</span>
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              value={userSearchText}
              onChange={(e) => setUserSearchText(e.target.value)}
              placeholder="Buscar aluno, servidor ou e-mail..."
              className="pl-9 pr-3 py-2 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none w-full md:w-64"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-600 dark:text-neutral-400 uppercase font-extrabold tracking-wider text-[10px]">
              <tr>
                <th className="p-3.5 rounded-l-xl">Usuário</th>
                <th className="p-3.5">E-mail</th>
                <th className="p-3.5">Curso / Setor</th>
                <th className="p-3.5">Matrícula</th>
                <th className="p-3.5">Permissão (Função)</th>
                <th className="p-3.5 rounded-r-xl text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {allUsers
                .filter((u) => {
                  const matchRole = userRoleFilter === "ALL" || u.role === userRoleFilter;
                  const matchQuery =
                    !userSearchText ||
                    u.name.toLowerCase().includes(userSearchText.toLowerCase()) ||
                    u.email.toLowerCase().includes(userSearchText.toLowerCase()) ||
                    u.courseOrDept.toLowerCase().includes(userSearchText.toLowerCase()) ||
                    (u.registrationNumber && u.registrationNumber.includes(userSearchText));
                  return matchRole && matchQuery;
                })
                .map((u) => (
                  <tr key={u.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                    <td className="p-3.5 font-bold text-neutral-900 dark:text-white">
                      <div className="flex items-center space-x-2.5">
                        <img
                          src={u.avatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80"}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover shrink-0 border border-neutral-200 dark:border-neutral-700"
                        />
                        <div className="flex flex-col">
                          <span className="font-bold">{u.name}</span>
                          {u.id === currentUser.id && (
                            <span className="text-[9px] text-[#00843D] dark:text-green-400 font-extrabold">(Sua Conta)</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3.5 font-mono text-neutral-600 dark:text-neutral-300">
                      {u.email}
                    </td>
                    <td className="p-3.5 text-neutral-600 dark:text-neutral-300">
                      {u.courseOrDept}
                    </td>
                    <td className="p-3.5 font-mono text-neutral-500">
                      {u.registrationNumber || "N/A"}
                    </td>
                    <td className="p-3.5">
                      {currentUser.role === "ADMIN" ? (
                        <select
                          value={u.role}
                          onChange={(e) => updateUserRole(u.id, e.target.value as UserRole)}
                          className={`py-1.5 px-3 rounded-xl text-xs font-bold border outline-none cursor-pointer transition-colors ${
                            u.role === "ADMIN"
                              ? "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30"
                              : u.role === "SERVIDOR"
                              ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30"
                              : "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30"
                          }`}
                        >
                          <option value="ALUNO" className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-bold">ALUNO (Discente)</option>
                          <option value="SERVIDOR" className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-bold">SERVIDOR (Docente/TAE)</option>
                          <option value="ADMIN" className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-bold">ADMIN (Administrador TI)</option>
                        </select>
                      ) : (
                        <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                          u.role === "ADMIN"
                            ? "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30"
                            : u.role === "SERVIDOR"
                            ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30"
                            : "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30"
                        }`}>
                          {u.role}
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-right">
                      {currentUser.role === "ADMIN" && (
                        <button
                          disabled={u.id === currentUser.id}
                          onClick={() => setUserToDelete({ id: u.id, name: u.name })}
                          title={u.id === currentUser.id ? "Você não pode remover a si próprio" : "Remover usuário"}
                          className={`p-2 rounded-xl border transition-all ${
                            u.id === currentUser.id
                              ? "opacity-30 cursor-not-allowed bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-400"
                              : "bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white border-red-500/20"
                          }`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal for User Deletion */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-5">
            <div className="flex items-center space-x-3 text-red-600 dark:text-red-400">
              <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20">
                <UserX className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-neutral-900 dark:text-white">
                  Confirmar Remoção de Usuário
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Ação exclusiva para Administradores
                </p>
              </div>
            </div>

            <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
              Tem certeza que deseja remover o usuário <strong>{userToDelete.name}</strong>? Esta ação removerá os dados de perfil do banco de dados do IFPR.
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs font-bold transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteUser(userToDelete.id);
                  setUserToDelete(null);
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors shadow-xs"
              >
                Sim, Remover Usuário
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
