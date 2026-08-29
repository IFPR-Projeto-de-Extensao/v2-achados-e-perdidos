import React, { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import { LostFoundItem } from "../types";
import { safeParseDate } from "../lib/utils";
import {
  BarChart3,
  Calendar,
  Layers,
  Sparkles,
  TrendingUp,
  Filter,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowUpRight,
  PieChart as PieIcon,
  Flame,
} from "lucide-react";

interface WeeklyFlowD3ChartProps {
  items: LostFoundItem[];
  darkMode?: boolean;
}

const DAYS_OF_WEEK = [
  { index: 0, key: "DOMINGO", short: "Dom", name: "Domingo" },
  { index: 1, key: "SEGUNDA", short: "Seg", name: "Segunda-feira" },
  { index: 2, key: "TERCA", short: "Ter", name: "Terça-feira" },
  { index: 3, key: "QUARTA", short: "Qua", name: "Quarta-feira" },
  { index: 4, key: "QUINTA", short: "Qui", name: "Quinta-feira" },
  { index: 5, key: "SEXTA", short: "Sex", name: "Sexta-feira" },
  { index: 6, key: "SABADO", short: "Sáb", name: "Sábado" },
];

const CATEGORY_COLORS: Record<string, string> = {
  Eletrônicos: "#3B82F6", // Blue
  Documentos: "#F59E0B", // Amber
  Roupas: "#EC4899", // Pink
  Chaves: "#8B5CF6", // Purple
  "Material Escolar": "#10B981", // Emerald
  "Mochilas & Bolsas": "#6366F1", // Indigo
  Acessórios: "#14B8A6", // Teal
  Outros: "#64748B", // Slate
};

export const WeeklyFlowD3Chart: React.FC<WeeklyFlowD3ChartProps> = ({
  items,
  darkMode = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 340 });

  const [selectedTypeFilter, setSelectedTypeFilter] = useState<"TODOS" | "PERDIDO" | "ENCONTRADO">("TODOS");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("TODAS");
  const [viewMode, setViewMode] = useState<"FLOW_BARS" | "CATEGORY_MATRIX" | "RADIAL_FLOW">("FLOW_BARS");

  // Get distinct categories from items
  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    (items || []).forEach((it) => {
      if (it?.category) set.add(it.category);
    });
    return Array.from(set);
  }, [items]);

  // Aggregate item stats by day of the week and category
  const aggregatedData = useMemo(() => {
    const daysData = DAYS_OF_WEEK.map((day) => ({
      ...day,
      total: 0,
      perdidos: 0,
      encontrados: 0,
      devolvidos: 0,
      byCategory: {} as Record<string, number>,
    }));

    (items || []).forEach((item) => {
      if (!item) return;

      // Filter by type if active
      if (selectedTypeFilter === "PERDIDO" && item.type !== "PERDIDO") return;
      if (selectedTypeFilter === "ENCONTRADO" && item.type !== "ENCONTRADO") return;

      // Filter by category if active
      if (selectedCategoryFilter !== "TODAS" && item.category !== selectedCategoryFilter) return;

      const itemDate = safeParseDate(item.date || item.createdAt);
      if (!itemDate) return;

      const dayIndex = itemDate.getDay(); // 0 = Sunday, 1 = Monday ...
      const targetDay = daysData[dayIndex];
      if (!targetDay) return;

      targetDay.total += 1;
      if (item.type === "PERDIDO") targetDay.perdidos += 1;
      if (item.type === "ENCONTRADO") targetDay.encontrados += 1;
      if (item.status === "DEVOLVIDO") targetDay.devolvidos += 1;

      const cat = item.category || "Outros";
      targetDay.byCategory[cat] = (targetDay.byCategory[cat] || 0) + 1;
    });

    return daysData;
  }, [items, selectedTypeFilter, selectedCategoryFilter]);

  // Summary Metrics
  const peakDay = useMemo(() => {
    let max = aggregatedData[0];
    for (const d of aggregatedData) {
      if (d.total > max.total) max = d;
    }
    return max;
  }, [aggregatedData]);

  const topCategory = useMemo(() => {
    const catTotals: Record<string, number> = {};
    (items || []).forEach((it) => {
      if (it?.category) {
        catTotals[it.category] = (catTotals[it.category] || 0) + 1;
      }
    });
    let top = "N/A";
    let max = 0;
    Object.entries(catTotals).forEach(([k, v]) => {
      if (v > max) {
        max = v;
        top = k;
      }
    });
    return { name: top, count: max };
  }, [items]);

  // ResizeObserver for responsive D3 canvas
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width } = entries[0].contentRect;
      if (width > 0) {
        setDimensions({ width, height: 340 });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Main D3 Rendering Logic
  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 30, right: 25, bottom: 45, left: 45 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;

    if (width <= 0 || height <= 0) return;

    const g = svg
      .attr("width", dimensions.width)
      .attr("height", dimensions.height)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const tooltip = d3.select(tooltipRef.current);

    if (viewMode === "FLOW_BARS") {
      // -------------------------------------------------------------
      // VIEW MODE: GROUPED / STACKED BARS BY DAY OF WEEK
      // -------------------------------------------------------------
      const x0 = d3
        .scaleBand()
        .domain(DAYS_OF_WEEK.map((d) => d.name))
        .rangeRound([0, width])
        .paddingInner(0.25);

      const subgroups = ["perdidos", "encontrados"];
      const x1 = d3
        .scaleBand()
        .domain(subgroups)
        .rangeRound([0, x0.bandwidth()])
        .padding(0.08);

      const maxVal = d3.max(aggregatedData, (d) => Math.max(d.perdidos, d.encontrados, 1)) || 5;
      const y = d3
        .scaleLinear()
        .domain([0, Math.ceil(maxVal * 1.25)])
        .nice()
        .rangeRound([height, 0]);

      // Grid lines
      g.append("g")
        .attr("class", "grid")
        .call(
          d3
            .axisLeft(y)
            .ticks(5)
            .tickSize(-width)
            .tickFormat(() => "")
        )
        .selectAll("line")
        .attr("stroke", darkMode ? "#2D3748" : "#E2E8F0")
        .attr("stroke-dasharray", "3,3");

      g.select(".grid .domain").remove();

      // X Axis
      const xAxis = g
        .append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x0));

      xAxis
        .selectAll("text")
        .attr("fill", darkMode ? "#A0AEC0" : "#4A5568")
        .attr("font-size", "11px")
        .attr("font-weight", "600")
        .text((d: any) => {
          const found = DAYS_OF_WEEK.find((item) => item.name === d);
          return width < 500 ? (found ? found.short : d) : d;
        });

      xAxis.select(".domain").attr("stroke", darkMode ? "#4A5568" : "#CBD5E0");

      // Y Axis
      const yAxis = g.append("g").call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("d")));

      yAxis
        .selectAll("text")
        .attr("fill", darkMode ? "#A0AEC0" : "#4A5568")
        .attr("font-size", "11px")
        .attr("font-weight", "600");

      yAxis.select(".domain").remove();

      // Color Scale
      const colorScale = d3
        .scaleOrdinal<string>()
        .domain(["perdidos", "encontrados"])
        .range(["#EF4444", "#00843D"]); // Red for Lost, Green for Found

      // Bar Groups
      const dayGroups = g
        .selectAll(".day-group")
        .data(aggregatedData)
        .enter()
        .append("g")
        .attr("class", "day-group")
        .attr("transform", (d) => `translate(${x0(d.name)},0)`);

      // Draw Bars with animated transitions
      dayGroups
        .selectAll("rect")
        .data((d) => [
          { key: "perdidos", value: d.perdidos, dayData: d },
          { key: "encontrados", value: d.encontrados, dayData: d },
        ])
        .enter()
        .append("rect")
        .attr("x", (d) => x1(d.key)!)
        .attr("y", height)
        .attr("width", x1.bandwidth())
        .attr("height", 0)
        .attr("rx", 5)
        .attr("ry", 5)
        .attr("fill", (d) => colorScale(d.key) as string)
        .attr("opacity", 0.9)
        .style("cursor", "pointer")
        .on("pointerover", function (event, d) {
          d3.select(this).attr("opacity", 1).attr("stroke", "#FFFFFF").attr("stroke-width", 1.5);
          const typeLabel = d.key === "perdidos" ? "Perdidos" : "Encontrados";
          tooltip
            .style("opacity", 1)
            .html(`
              <div class="font-sans text-xs">
                <div class="font-extrabold text-neutral-900 dark:text-white border-b border-neutral-200 dark:border-neutral-700 pb-1 mb-1.5 flex items-center justify-between">
                  <span>📅 ${d.dayData.name}</span>
                  <span class="px-1.5 py-0.5 rounded text-[10px] ${d.key === "perdidos" ? "bg-red-500/10 text-red-600" : "bg-green-500/10 text-green-600"} font-bold">
                    ${typeLabel}
                  </span>
                </div>
                <div class="space-y-1">
                  <div class="flex justify-between gap-3 text-neutral-600 dark:text-neutral-300">
                    <span>${typeLabel} no dia:</span>
                    <strong class="text-neutral-900 dark:text-white font-mono">${d.value} itens</strong>
                  </div>
                  <div class="flex justify-between gap-3 text-neutral-500 text-[11px]">
                    <span>Total no dia:</span>
                    <span class="font-mono">${d.dayData.total} itens</span>
                  </div>
                  <div class="flex justify-between gap-3 text-neutral-500 text-[11px]">
                    <span>Devolvidos:</span>
                    <span class="font-mono text-blue-500 font-bold">${d.dayData.devolvidos}</span>
                  </div>
                </div>
              </div>
            `);
        })
        .on("pointermove", function (event) {
          const [mx, my] = d3.pointer(event, containerRef.current);
          tooltip
            .style("left", `${mx + 15}px`)
            .style("top", `${my - 20}px`);
        })
        .on("pointerout", function () {
          d3.select(this).attr("opacity", 0.9).attr("stroke", "none");
          tooltip.style("opacity", 0);
        })
        .transition()
        .duration(650)
        .delay((_, i) => i * 80)
        .attr("y", (d) => y(d.value))
        .attr("height", (d) => Math.max(0, height - y(d.value)));

      // Bar Value Labels on top
      dayGroups
        .selectAll(".bar-label")
        .data((d) => [
          { key: "perdidos", value: d.perdidos },
          { key: "encontrados", value: d.encontrados },
        ])
        .enter()
        .append("text")
        .attr("class", "bar-label")
        .attr("x", (d) => x1(d.key)! + x1.bandwidth() / 2)
        .attr("y", (d) => y(d.value) - 5)
        .attr("text-anchor", "middle")
        .attr("fill", (d) => (d.key === "perdidos" ? "#EF4444" : "#00843D"))
        .attr("font-size", "10px")
        .attr("font-weight", "bold")
        .text((d) => (d.value > 0 ? d.value : ""))
        .attr("opacity", 0)
        .transition()
        .duration(700)
        .delay(400)
        .attr("opacity", 1);
    } else if (viewMode === "CATEGORY_MATRIX") {
      // -------------------------------------------------------------
      // VIEW MODE: HEATMAP MATRIX (DAY OF WEEK x CATEGORY)
      // -------------------------------------------------------------
      const distinctCats = categoriesList.length > 0 ? categoriesList : ["Eletrônicos", "Documentos", "Roupas", "Chaves", "Material Escolar"];

      const xBand = d3
        .scaleBand()
        .domain(DAYS_OF_WEEK.map((d) => d.name))
        .range([0, width])
        .padding(0.12);

      const yBand = d3
        .scaleBand()
        .domain(distinctCats)
        .range([0, height])
        .padding(0.15);

      // Max item count for matrix cell color
      let maxCell = 1;
      aggregatedData.forEach((day) => {
        distinctCats.forEach((cat) => {
          const val = day.byCategory[cat] || 0;
          if (val > maxCell) maxCell = val;
        });
      });

      const colorInterpolator = darkMode
        ? d3.interpolateRgb("#1F2937", "#00843D")
        : d3.interpolateRgb("#F0FDF4", "#00843D");

      const matrixColor = d3.scaleSequential(colorInterpolator).domain([0, maxCell]);

      // X Axis
      const xAxis = g
        .append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xBand));

      xAxis
        .selectAll("text")
        .attr("fill", darkMode ? "#A0AEC0" : "#4A5568")
        .attr("font-size", "11px")
        .attr("font-weight", "bold")
        .text((d: any) => {
          const found = DAYS_OF_WEEK.find((item) => item.name === d);
          return width < 520 ? (found ? found.short : d) : d;
        });

      // Y Axis
      const yAxis = g.append("g").call(d3.axisLeft(yBand));
      yAxis
        .selectAll("text")
        .attr("fill", darkMode ? "#A0AEC0" : "#4A5568")
        .attr("font-size", "10px")
        .attr("font-weight", "600");

      // Draw Matrix Cells
      aggregatedData.forEach((day) => {
        distinctCats.forEach((cat) => {
          const count = day.byCategory[cat] || 0;

          g.append("rect")
            .attr("x", xBand(day.name)!)
            .attr("y", yBand(cat)!)
            .attr("width", xBand.bandwidth())
            .attr("height", yBand.bandwidth())
            .attr("rx", 6)
            .attr("fill", count > 0 ? matrixColor(count) : (darkMode ? "#18181B" : "#F8FAFC"))
            .attr("stroke", darkMode ? "#27272A" : "#E2E8F0")
            .attr("stroke-width", 1)
            .style("cursor", "pointer")
            .on("pointerover", function (event) {
              d3.select(this).attr("stroke", "#00843D").attr("stroke-width", 2);
              tooltip
                .style("opacity", 1)
                .html(`
                  <div class="font-sans text-xs">
                    <div class="font-extrabold text-neutral-900 dark:text-white border-b border-neutral-200 dark:border-neutral-700 pb-1 mb-1">
                      ${day.name} • ${cat}
                    </div>
                    <div class="flex justify-between gap-3 text-neutral-600 dark:text-neutral-300">
                      <span>Ocorrências registradas:</span>
                      <strong class="text-[#00843D] dark:text-green-400 font-mono">${count} itens</strong>
                    </div>
                  </div>
                `);
            })
            .on("pointermove", function (event) {
              const [mx, my] = d3.pointer(event, containerRef.current);
              tooltip.style("left", `${mx + 15}px`).style("top", `${my - 20}px`);
            })
            .on("pointerout", function () {
              d3.select(this).attr("stroke", darkMode ? "#27272A" : "#E2E8F0").attr("stroke-width", 1);
              tooltip.style("opacity", 0);
            });

          // Text count in cell if > 0
          if (count > 0) {
            g.append("text")
              .attr("x", xBand(day.name)! + xBand.bandwidth() / 2)
              .attr("y", yBand(cat)! + yBand.bandwidth() / 2 + 3.5)
              .attr("text-anchor", "middle")
              .attr("fill", count > maxCell * 0.5 ? "#FFFFFF" : (darkMode ? "#E2E8F0" : "#1E293B"))
              .attr("font-size", "10px")
              .attr("font-weight", "bold")
              .text(count);
          }
        });
      });
    } else {
      // -------------------------------------------------------------
      // VIEW MODE: AREA STREAM CURVE FLOW
      // -------------------------------------------------------------
      const x = d3
        .scalePoint()
        .domain(DAYS_OF_WEEK.map((d) => d.name))
        .range([0, width])
        .padding(0.2);

      const maxVal = d3.max(aggregatedData, (d) => d.total) || 5;
      const y = d3
        .scaleLinear()
        .domain([0, Math.ceil(maxVal * 1.25)])
        .nice()
        .range([height, 0]);

      // Grid
      g.append("g")
        .attr("class", "grid")
        .call(d3.axisLeft(y).ticks(5).tickSize(-width).tickFormat(() => ""))
        .selectAll("line")
        .attr("stroke", darkMode ? "#2D3748" : "#E2E8F0")
        .attr("stroke-dasharray", "3,3");

      g.select(".grid .domain").remove();

      // X and Y Axes
      const xAxis = g.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));
      xAxis
        .selectAll("text")
        .attr("fill", darkMode ? "#A0AEC0" : "#4A5568")
        .attr("font-size", "11px")
        .attr("font-weight", "600")
        .text((d: any) => {
          const found = DAYS_OF_WEEK.find((item) => item.name === d);
          return width < 500 ? (found ? found.short : d) : d;
        });

      const yAxis = g.append("g").call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("d")));
      yAxis.selectAll("text").attr("fill", darkMode ? "#A0AEC0" : "#4A5568").attr("font-size", "11px");
      yAxis.select(".domain").remove();

      // Area generators
      const areaPerdidos = d3
        .area<any>()
        .x((d) => x(d.name)!)
        .y0(height)
        .y1((d) => y(d.perdidos))
        .curve(d3.curveMonotoneX);

      const areaEncontrados = d3
        .area<any>()
        .x((d) => x(d.name)!)
        .y0(height)
        .y1((d) => y(d.encontrados))
        .curve(d3.curveMonotoneX);

      // Line generators
      const linePerdidos = d3
        .line<any>()
        .x((d) => x(d.name)!)
        .y((d) => y(d.perdidos))
        .curve(d3.curveMonotoneX);

      const lineEncontrados = d3
        .line<any>()
        .x((d) => x(d.name)!)
        .y((d) => y(d.encontrados))
        .curve(d3.curveMonotoneX);

      // Render Areas
      g.append("path")
        .datum(aggregatedData)
        .attr("fill", "#EF4444")
        .attr("fill-opacity", 0.12)
        .attr("d", areaPerdidos);

      g.append("path")
        .datum(aggregatedData)
        .attr("fill", "#00843D")
        .attr("fill-opacity", 0.15)
        .attr("d", areaEncontrados);

      // Render Lines
      g.append("path")
        .datum(aggregatedData)
        .attr("fill", "none")
        .attr("stroke", "#EF4444")
        .attr("stroke-width", 2.5)
        .attr("d", linePerdidos);

      g.append("path")
        .datum(aggregatedData)
        .attr("fill", "none")
        .attr("stroke", "#00843D")
        .attr("stroke-width", 2.5)
        .attr("d", lineEncontrados);

      // Render Interactive Dots
      aggregatedData.forEach((d) => {
        // Dot Perdido
        g.append("circle")
          .attr("cx", x(d.name)!)
          .attr("cy", y(d.perdidos))
          .attr("r", 4.5)
          .attr("fill", "#EF4444")
          .attr("stroke", "#FFFFFF")
          .attr("stroke-width", 1.5)
          .style("cursor", "pointer")
          .on("pointerover", function (event) {
            d3.select(this).attr("r", 7);
            tooltip.style("opacity", 1).html(`
              <div class="font-sans text-xs">
                <div class="font-bold text-red-500">${d.name} • Perdidos</div>
                <div class="text-neutral-700 dark:text-neutral-200 font-mono font-bold">${d.perdidos} itens perdidos</div>
              </div>
            `);
          })
          .on("pointermove", (event) => {
            const [mx, my] = d3.pointer(event, containerRef.current);
            tooltip.style("left", `${mx + 15}px`).style("top", `${my - 20}px`);
          })
          .on("pointerout", function () {
            d3.select(this).attr("r", 4.5);
            tooltip.style("opacity", 0);
          });

        // Dot Encontrado
        g.append("circle")
          .attr("cx", x(d.name)!)
          .attr("cy", y(d.encontrados))
          .attr("r", 4.5)
          .attr("fill", "#00843D")
          .attr("stroke", "#FFFFFF")
          .attr("stroke-width", 1.5)
          .style("cursor", "pointer")
          .on("pointerover", function (event) {
            d3.select(this).attr("r", 7);
            tooltip.style("opacity", 1).html(`
              <div class="font-sans text-xs">
                <div class="font-bold text-[#00843D] dark:text-green-400">${d.name} • Encontrados</div>
                <div class="text-neutral-700 dark:text-neutral-200 font-mono font-bold">${d.encontrados} itens encontrados</div>
              </div>
            `);
          })
          .on("pointermove", (event) => {
            const [mx, my] = d3.pointer(event, containerRef.current);
            tooltip.style("left", `${mx + 15}px`).style("top", `${my - 20}px`);
          })
          .on("pointerout", function () {
            d3.select(this).attr("r", 4.5);
            tooltip.style("opacity", 0);
          });
      });
    }
  }, [aggregatedData, dimensions, darkMode, viewMode, categoriesList]);

  return (
    <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 sm:p-7 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-neutral-100 dark:border-neutral-800 pb-5">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400">
              <BarChart3 className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-extrabold text-neutral-900 dark:text-white">
              Fluxo de Ocorrências por Dia da Semana & Categoria
            </h2>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Análise comportamental D3.js de achados e perdas ao longo dos dias letivos no Campus Ivaiporã.
          </p>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center space-x-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-2xl border border-neutral-200/80 dark:border-neutral-700 self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setViewMode("FLOW_BARS")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              viewMode === "FLOW_BARS"
                ? "bg-white dark:bg-neutral-700 text-[#00843D] dark:text-green-400 shadow-xs"
                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
            }`}
          >
            Barras Comparativas
          </button>
          <button
            type="button"
            onClick={() => setViewMode("CATEGORY_MATRIX")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              viewMode === "CATEGORY_MATRIX"
                ? "bg-white dark:bg-neutral-700 text-[#00843D] dark:text-green-400 shadow-xs"
                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
            }`}
          >
            Matriz de Categorias
          </button>
          <button
            type="button"
            onClick={() => setViewMode("RADIAL_FLOW")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              viewMode === "RADIAL_FLOW"
                ? "bg-white dark:bg-neutral-700 text-[#00843D] dark:text-green-400 shadow-xs"
                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
            }`}
          >
            Curva de Fluxo
          </button>
        </div>
      </div>

      {/* Filter Chips Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Tipo:
          </span>
          {(["TODOS", "PERDIDO", "ENCONTRADO"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setSelectedTypeFilter(t)}
              className={`px-3 py-1 rounded-xl font-bold transition-all cursor-pointer ${
                selectedTypeFilter === t
                  ? t === "PERDIDO"
                    ? "bg-red-500 text-white"
                    : t === "ENCONTRADO"
                    ? "bg-[#00843D] text-white"
                    : "bg-neutral-900 dark:bg-white text-white dark:text-black"
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200"
              }`}
            >
              {t === "TODOS" ? "Todos os Tipos" : t === "PERDIDO" ? "Apenas Perdidos" : "Apenas Encontrados"}
            </button>
          ))}
        </div>

        {/* Category Dropdown */}
        <div className="flex items-center space-x-2">
          <span className="font-bold text-neutral-500 dark:text-neutral-400">Categoria:</span>
          <select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            className="py-1 px-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 font-bold text-xs outline-none cursor-pointer text-neutral-800 dark:text-neutral-200"
          >
            <option value="TODAS">Todas as Categorias</option>
            {categoriesList.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* D3 Canvas Container */}
      <div ref={containerRef} className="relative w-full overflow-hidden min-h-[340px]">
        <svg ref={svgRef} className="w-full overflow-visible" />

        {/* Dynamic Tooltip */}
        <div
          ref={tooltipRef}
          className="pointer-events-none absolute z-50 rounded-2xl bg-white/95 dark:bg-neutral-900/95 p-3 shadow-xl backdrop-blur-md border border-neutral-200 dark:border-neutral-800 transition-opacity duration-150 opacity-0"
          style={{ transform: "translate(-50%, -100%)" }}
        />
      </div>

      {/* Insights & Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-neutral-100 dark:border-neutral-800">
        <div className="bg-neutral-50 dark:bg-neutral-900/80 p-4 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 flex items-center space-x-3.5">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 shrink-0">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block">
              Dia de Maior Movimento
            </span>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-extrabold text-neutral-900 dark:text-white">
                {peakDay.name}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 text-[10px] font-black">
                {peakDay.total} registros
              </span>
            </div>
          </div>
        </div>

        <div className="bg-neutral-50 dark:bg-neutral-900/80 p-4 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 flex items-center space-x-3.5">
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block">
              Categoria Predominante
            </span>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-extrabold text-neutral-900 dark:text-white">
                {topCategory.name}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 text-[10px] font-black">
                {topCategory.count} ocorrências
              </span>
            </div>
          </div>
        </div>

        <div className="bg-neutral-50 dark:bg-neutral-900/80 p-4 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 flex items-center space-x-3.5">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block">
              Taxa de Resolução Semanal
            </span>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-extrabold text-emerald-600 dark:text-green-400">
                {items.length > 0
                  ? `${Math.round(
                      (items.filter((i) => i.status === "DEVOLVIDO").length / items.length) * 100
                    )}%`
                  : "0%"}
              </span>
              <span className="text-xs text-neutral-500">devoluções concluídas</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
