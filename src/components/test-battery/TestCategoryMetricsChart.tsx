import React, { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Users,
  Layers,
  ShieldCheck,
  Activity,
  BarChart3,
  PieChart as PieChartIcon,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { TestBatteryExecution } from "../../types";
import { calculateCategoryMetrics, calculateParticipantMetrics, calculateBatterySummary } from "../../data/defaultTestBatteryData";
import { useApp } from "../../context/AppContext";
import { localize, translateUserRole } from "../../lib/i18n";

interface TestCategoryMetricsChartProps {
  battery: TestBatteryExecution;
  darkMode?: boolean;
  onFilterByCategory?: (category: string) => void;
  onFilterByTester?: (testerEmail: string) => void;
}

const STATUS_COLORS = {
  APROVADO: "#10b981", // emerald-500
  REPROVADO: "#ef4444", // red-500
  PENDENTE: "#f59e0b", // amber-500
  NAO_EXECUTADO: "#9ca3af", // neutral-400
  BLOQUEADO: "#be123c", // rose-700
};

export const TestCategoryMetricsChart: React.FC<TestCategoryMetricsChartProps> = ({
  battery,
  darkMode,
  onFilterByCategory,
  onFilterByTester,
}) => {
  const { language } = useApp();
  const l = (pt: string, en: string) => localize(language, pt, en);

  const [chartViewMode, setChartViewMode] = useState<"charts" | "cards">("charts");
  const summary = calculateBatterySummary(battery);
  const categoryMetrics = calculateCategoryMetrics(battery);
  const participantMetrics = calculateParticipantMetrics(battery);

  // Pie chart data for status distribution
  const pieData = [
    { name: l("Aprovados", "Passed"), value: summary.passed, color: STATUS_COLORS.APROVADO },
    { name: l("Reprovados", "Failed"), value: summary.failed, color: STATUS_COLORS.REPROVADO },
    { name: l("Pendentes", "Pending"), value: summary.pending, color: STATUS_COLORS.PENDENTE },
    { name: l("Não Executados", "Not Executed"), value: summary.notExecuted, color: STATUS_COLORS.NAO_EXECUTADO },
    ...(summary.blocked > 0 ? [{ name: l("Bloqueados", "Blocked"), value: summary.blocked, color: STATUS_COLORS.BLOQUEADO }] : []),
  ].filter((item) => item.value > 0);

  // Category Bar chart data
  const categoryChartData = categoryMetrics.map((cat) => ({
    name: cat.categoryName.length > 15 ? cat.categoryName.substring(0, 15) + "..." : cat.categoryName,
    fullName: cat.categoryName,
    category: cat.category,
    aprovados: cat.passed,
    reprovados: cat.failed,
    pendentes: cat.pending,
    total: cat.total,
    taxa: parseFloat(cat.passRate),
  }));

  // Participant Bar chart data
  const participantChartData = participantMetrics.map((p) => ({
    name: p.name.split(" ")[0] + (p.name.split(" ")[1] ? " " + p.name.split(" ")[1][0] + "." : ""),
    fullName: p.name,
    email: p.email,
    aprovados: p.passedCount,
    reprovados: p.failedCount,
    pendentes: p.pendingCount,
    concluido: p.completedCount,
    total: p.assignedCount,
    taxa: p.completionRate,
  }));

  return (
    <div id="test-category-metrics-dashboard" className="space-y-6">
      {/* 1. Global KPIs Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div
          className={`p-4 rounded-xl border ${
            darkMode ? "bg-neutral-900/90 border-neutral-800" : "bg-white border-neutral-200"
          }`}
        >
          <div className="flex items-center justify-between text-neutral-500 mb-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider">{l("Total de Testes", "Total Tests")}</span>
            <Layers className="w-4 h-4 text-neutral-400" />
          </div>
          <p className="text-2xl font-black text-neutral-900 dark:text-white">{summary.total}</p>
          <span className="text-[10px] font-semibold text-neutral-500">{l("Casos Definidos", "Defined Cases")}</span>
        </div>

        <div
          className={`p-4 rounded-xl border ${
            darkMode ? "bg-neutral-900/90 border-neutral-800" : "bg-white border-neutral-200"
          }`}
        >
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider">{l("Aprovados", "Passed")}</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{summary.passed}</p>
          <span className="text-[10px] font-semibold text-emerald-700/80 dark:text-emerald-400/80">
            {l(`${summary.passRate}% de sucesso`, `${summary.passRate}% pass rate`)}
          </span>
        </div>

        <div
          className={`p-4 rounded-xl border ${
            darkMode ? "bg-neutral-900/90 border-neutral-800" : "bg-white border-neutral-200"
          }`}
        >
          <div className="flex items-center justify-between text-red-600 dark:text-red-400 mb-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider">{l("Reprovados", "Failed")}</span>
            <XCircle className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-red-600 dark:text-red-400">{summary.failed}</p>
          <span className="text-[10px] font-semibold text-red-700/80 dark:text-red-400/80">
            {l("Necessitam correção", "Need fixing")}
          </span>
        </div>

        <div
          className={`p-4 rounded-xl border ${
            darkMode ? "bg-neutral-900/90 border-neutral-800" : "bg-white border-neutral-200"
          }`}
        >
          <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 mb-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider">{l("Em Análise / Pend.", "In Review / Pend.")}</span>
            <Clock className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400">{summary.pending}</p>
          <span className="text-[10px] font-semibold text-amber-700/80 dark:text-amber-400/80">
            {l("Em andamento", "In progress")}
          </span>
        </div>

        <div
          className={`p-4 rounded-xl border ${
            darkMode ? "bg-neutral-900/90 border-neutral-800" : "bg-white border-neutral-200"
          }`}
        >
          <div className="flex items-center justify-between text-neutral-500 mb-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider">{l("Não Executados", "Not Executed")}</span>
            <AlertTriangle className="w-4 h-4 text-neutral-400" />
          </div>
          <p className="text-2xl font-black text-neutral-700 dark:text-neutral-300">{summary.notExecuted}</p>
          <span className="text-[10px] font-semibold text-neutral-500">{l("Aguardando início", "Awaiting start")}</span>
        </div>

        <div
          className={`p-4 rounded-xl border ${
            darkMode ? "bg-neutral-900/90 border-neutral-800" : "bg-white border-neutral-200"
          }`}
        >
          <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 mb-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider">{l("Conclusão Total", "Total Completion")}</span>
            <Activity className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-blue-600 dark:text-blue-400">{summary.completionRate}%</p>
          <span className="text-[10px] font-semibold text-blue-700/80 dark:text-blue-400/80">
            {l("Progresso Geral", "Overall Progress")}
          </span>
        </div>
      </div>

      {/* 2. Visual View Switcher & Distribution Bar */}
      <div
        className={`p-5 rounded-2xl border ${
          darkMode ? "bg-neutral-900/90 border-neutral-800" : "bg-white border-neutral-200"
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              {l("Distribuição Geral de Resultados da Bateria", "Overall Battery Results Distribution")}
            </h3>
            <span className="text-xs text-neutral-500">
              {l(
                `${summary.passed + summary.failed} de ${summary.total} casos concluídos (${summary.completionRate}%)`,
                `${summary.passed + summary.failed} of ${summary.total} cases completed (${summary.completionRate}%)`
              )}
            </span>
          </div>

          <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl">
            <button
              onClick={() => setChartViewMode("charts")}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                chartViewMode === "charts"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>{l("Gráficos Interativos", "Interactive Charts")}</span>
            </button>
            <button
              onClick={() => setChartViewMode("cards")}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                chartViewMode === "cards"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              <PieChartIcon className="w-3.5 h-3.5" />
              <span>{l("Visão Detalhada", "Detailed View")}</span>
            </button>
          </div>
        </div>

        {/* Global horizontal progress bar */}
        <div className="w-full h-3 rounded-full bg-neutral-200 dark:bg-neutral-800 flex overflow-hidden">
          {summary.passed > 0 && (
            <div
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${(summary.passed / summary.total) * 100}%` }}
              title={l(`Aprovados: ${summary.passed}`, `Passed: ${summary.passed}`)}
            />
          )}
          {summary.failed > 0 && (
            <div
              className="h-full bg-red-500 transition-all duration-500"
              style={{ width: `${(summary.failed / summary.total) * 100}%` }}
              title={l(`Reprovados: ${summary.failed}`, `Failed: ${summary.failed}`)}
            />
          )}
          {summary.pending > 0 && (
            <div
              className="h-full bg-amber-500 transition-all duration-500"
              style={{ width: `${(summary.pending / summary.total) * 100}%` }}
              title={l(`Pendentes: ${summary.pending}`, `Pending: ${summary.pending}`)}
            />
          )}
          {summary.blocked > 0 && (
            <div
              className="h-full bg-rose-700 transition-all duration-500"
              style={{ width: `${(summary.blocked / summary.total) * 100}%` }}
              title={l(`Bloqueados: ${summary.blocked}`, `Blocked: ${summary.blocked}`)}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs mt-3 font-semibold">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>{l(`Aprovados (${summary.passed})`, `Passed (${summary.passed})`)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span>{l(`Reprovados (${summary.failed})`, `Failed (${summary.failed})`)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>{l(`Pendentes (${summary.pending})`, `Pending (${summary.pending})`)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-neutral-400" />
            <span>{l(`Não Executados (${summary.notExecuted})`, `Not Executed (${summary.notExecuted})`)}</span>
          </div>
        </div>
      </div>

      {/* 3. Recharts Section (Req 21 & 22) */}
      {chartViewMode === "charts" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart 1: Status Distribution Pie Chart */}
          <div
            className={`p-5 rounded-2xl border flex flex-col items-center justify-between ${
              darkMode ? "bg-neutral-900/90 border-neutral-800" : "bg-white border-neutral-200"
            }`}
          >
            <div className="w-full flex items-center justify-between border-b pb-3 dark:border-neutral-800 border-neutral-200 mb-2">
              <div className="flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="font-bold text-sm">{l("Situação Geral da Bateria", "Overall Battery Status")}</h3>
              </div>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {l(`${summary.passRate}% Taxa`, `${summary.passRate}% Rate`)}
              </span>
            </div>

            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: darkMode ? "#171717" : "#ffffff",
                      borderColor: darkMode ? "#262626" : "#e5e5e5",
                      borderRadius: "0.75rem",
                      fontSize: "0.75rem",
                    }}
                  />
                  <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: "11px" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full text-center text-[11px] text-neutral-500 font-semibold pt-1 border-t dark:border-neutral-800 border-neutral-200">
              {l("Taxa de Aprovação:", "Pass Rate:")} <span className="text-emerald-600 font-bold">{summary.passRate}%</span> • {l("Conclusão:", "Completion:")}{" "}
              <span className="text-blue-600 font-bold">{summary.completionRate}%</span>
            </div>
          </div>

          {/* Chart 2: Category Breakdown Bar Chart */}
          <div
            className={`p-5 rounded-2xl border lg:col-span-2 flex flex-col justify-between ${
              darkMode ? "bg-neutral-900/90 border-neutral-800" : "bg-white border-neutral-200"
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 dark:border-neutral-800 border-neutral-200 mb-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="font-bold text-sm">{l("Resultados por Módulo Funcional", "Results by Functional Module")}</h3>
              </div>
              <span className="text-xs text-neutral-500 font-semibold">
                {categoryMetrics.length} {l("Categorias", "Categories")}
              </span>
            </div>

            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryChartData} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#262626" : "#e5e5e5"} />
                  <XAxis
                    dataKey="name"
                    stroke={darkMode ? "#a3a3a3" : "#737373"}
                    fontSize={9}
                    angle={-30}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis stroke={darkMode ? "#a3a3a3" : "#737373"} fontSize={10} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: darkMode ? "#171717" : "#ffffff",
                      borderColor: darkMode ? "#262626" : "#e5e5e5",
                      borderRadius: "0.75rem",
                      fontSize: "0.75rem",
                    }}
                  />
                  <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: "11px" }} />
                  <Bar dataKey="aprovados" name={l("Aprovados", "Passed")} fill={STATUS_COLORS.APROVADO} stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="reprovados" name={l("Reprovados", "Failed")} fill={STATUS_COLORS.REPROVADO} stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="pendentes" name={l("Pendentes", "Pending")} fill={STATUS_COLORS.PENDENTE} stackId="a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="text-center text-[11px] text-neutral-500 font-semibold pt-1 border-t dark:border-neutral-800 border-neutral-200">
              {l(
                "Clique nas categorias na visualização detalhada para filtrar a matriz de testes.",
                "Click categories in the detailed view to filter the test matrix."
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. Category Breakdown & Participant Progress Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <div
          className={`p-6 rounded-2xl border space-y-4 ${
            darkMode ? "bg-neutral-900/90 border-neutral-800" : "bg-white border-neutral-200"
          }`}
        >
          <div className="flex items-center justify-between border-b pb-3 dark:border-neutral-800 border-neutral-200">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <h3 className="font-bold text-sm sm:text-base">{l("Métricas por Módulo Funcional", "Metrics by Functional Module")}</h3>
            </div>
            <span className="text-xs text-neutral-500 font-semibold">
              {categoryMetrics.length} {l("Áreas", "Areas")}
            </span>
          </div>

          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {categoryMetrics.map((cat) => (
              <div
                key={cat.category}
                onClick={() => onFilterByCategory && onFilterByCategory(cat.category)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all hover:scale-[1.01] ${
                  darkMode
                    ? "bg-neutral-800/60 hover:bg-neutral-800 border-neutral-700"
                    : "bg-neutral-50 hover:bg-neutral-100 border-neutral-200"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div>
                    <h4 className="text-xs font-black tracking-tight">{cat.categoryName}</h4>
                    <span className="text-[10px] text-neutral-500 font-mono">{cat.category}</span>
                  </div>
                  <span
                    className={`text-xs font-black px-2 py-0.5 rounded-full ${
                      parseFloat(cat.passRate) >= 80
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : parseFloat(cat.passRate) >= 50
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                    }`}
                  >
                    {cat.passRate}% {l("Aprovado", "Passed")}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden flex">
                  {cat.passed > 0 && (
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${(cat.passed / cat.total) * 100}%` }}
                    />
                  )}
                  {cat.failed > 0 && (
                    <div
                      className="h-full bg-red-500"
                      style={{ width: `${(cat.failed / cat.total) * 100}%` }}
                    />
                  )}
                  {cat.pending > 0 && (
                    <div
                      className="h-full bg-amber-500"
                      style={{ width: `${(cat.pending / cat.total) * 100}%` }}
                    />
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-500 mt-2">
                  <span>{l(`Total: ${cat.total} testes`, `Total: ${cat.total} tests`)}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-600 dark:text-emerald-400">✓ {cat.passed}</span>
                    <span className="text-red-600 dark:text-red-400">✕ {cat.failed}</span>
                    <span className="text-amber-600 dark:text-amber-400">⋯ {cat.pending}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Participant Progress Leaderboard with Recharts Bar chart */}
        <div
          className={`p-6 rounded-2xl border space-y-4 ${
            darkMode ? "bg-neutral-900/90 border-neutral-800" : "bg-white border-neutral-200"
          }`}
        >
          <div className="flex items-center justify-between border-b pb-3 dark:border-neutral-800 border-neutral-200">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <h3 className="font-bold text-sm sm:text-base">
                {l("Desempenho da Equipe de Validação (Req 21 e 22)", "Validation Team Performance (Req 21 & 22)")}
              </h3>
            </div>
            <span className="text-xs text-neutral-500 font-semibold">
              {participantMetrics.length} {l("Testadores", "Testers")}
            </span>
          </div>

          {participantChartData.length > 0 && (
            <div className="w-full h-44 border-b dark:border-neutral-800 border-neutral-200 pb-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={participantChartData} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#262626" : "#e5e5e5"} />
                  <XAxis type="number" stroke={darkMode ? "#a3a3a3" : "#737373"} fontSize={10} />
                  <YAxis type="category" dataKey="name" stroke={darkMode ? "#a3a3a3" : "#737373"} fontSize={10} width={70} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: darkMode ? "#171717" : "#ffffff",
                      borderColor: darkMode ? "#262626" : "#e5e5e5",
                      borderRadius: "0.75rem",
                      fontSize: "0.75rem",
                    }}
                  />
                  <Bar dataKey="aprovados" name={l("Aprovados", "Passed")} fill={STATUS_COLORS.APROVADO} stackId="p" />
                  <Bar dataKey="reprovados" name={l("Reprovados", "Failed")} fill={STATUS_COLORS.REPROVADO} stackId="p" />
                  <Bar dataKey="pendentes" name={l("Pendentes", "Pending")} fill={STATUS_COLORS.PENDENTE} stackId="p" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
            {participantMetrics.length === 0 ? (
              <div className="text-center py-10 text-xs text-neutral-500">
                {l(
                  "Nenhum participante com testes atribuídos nesta execução.",
                  "No participant has assigned tests in this execution."
                )}
              </div>
            ) : (
              participantMetrics.map((p) => (
                <div
                  key={p.participantId}
                  onClick={() => onFilterByTester && onFilterByTester(p.email)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all hover:scale-[1.01] ${
                    darkMode
                      ? "bg-neutral-800/60 hover:bg-neutral-800 border-neutral-700"
                      : "bg-neutral-50 hover:bg-neutral-100 border-neutral-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-black tracking-tight">{p.name}</h4>
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200">
                          {translateUserRole(p.globalRole, language)}
                        </span>
                      </div>
                      <span className="text-[10px] text-neutral-500">{p.email}</span>
                    </div>
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                      {p.completionRate}% {l("Concluído", "Completed")}
                    </span>
                  </div>

                  <div className="w-full h-2 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${p.completionRate}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-500 mt-2">
                    <span>
                      {l(
                        `${p.completedCount} de ${p.assignedCount} testes executados`,
                        `${p.completedCount} of ${p.assignedCount} tests executed`
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-600 dark:text-emerald-400">{l("Aprov:", "Pass:")} {p.passedCount}</span>
                      <span className="text-red-600 dark:text-red-400">{l("Reprov:", "Fail:")} {p.failedCount}</span>
                      <span className="text-amber-600 dark:text-amber-400">{l("Pend:", "Pend:")} {p.pendingCount}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
