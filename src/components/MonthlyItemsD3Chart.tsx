import React, { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import { LostFoundItem } from "../types";
import { TrendingUp, BarChart3, Info } from "lucide-react";

interface MonthlyItemsD3ChartProps {
  items: LostFoundItem[];
  darkMode?: boolean;
}

interface MonthData {
  monthKey: string;
  label: string;
  perdidos: number;
  encontrados: number;
  devolvidos: number;
  total: number;
}

export const MonthlyItemsD3Chart: React.FC<MonthlyItemsD3ChartProps> = ({ items, darkMode = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 320 });

  // Process data from items
  const chartData = useMemo<MonthData[]>(() => {
    const monthMap = new Map<string, { perdidos: number; encontrados: number; devolvidos: number; date: Date }>();

    // Generate past 6 months slots
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(key, { perdidos: 0, encontrados: 0, devolvidos: 0, date: d });
    }

    // Populate with real items
    (items || []).forEach((item) => {
      const itemDate = new Date(item.date || item.createdAt || new Date());
      if (isNaN(itemDate.getTime())) return;

      const key = `${itemDate.getFullYear()}-${String(itemDate.getMonth() + 1).padStart(2, "0")}`;
      if (monthMap.has(key)) {
        const entry = monthMap.get(key)!;
        if (item.type === "PERDIDO") entry.perdidos += 1;
        if (item.type === "ENCONTRADO") entry.encontrados += 1;
        if (item.status === "DEVOLVIDO") entry.devolvidos += 1;
      }
    });

    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    return Array.from(monthMap.entries()).map(([key, val]) => ({
      monthKey: key,
      label: `${monthNames[val.date.getMonth()]}/${String(val.date.getFullYear()).slice(-2)}`,
      perdidos: val.perdidos,
      encontrados: val.encontrados,
      devolvidos: val.devolvidos,
      total: val.perdidos + val.encontrados,
    }));
  }, [items]);

  // Responsive container observer
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width } = entries[0].contentRect;
      if (width > 0) {
        setDimensions({ width, height: 320 });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Render D3 grouped bar chart
  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clean up previous render

    const margin = { top: 30, right: 20, bottom: 40, left: 40 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;

    if (width <= 0 || height <= 0) return;

    const g = svg
      .attr("width", dimensions.width)
      .attr("height", dimensions.height)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const subgroups = ["perdidos", "encontrados"];
    const x0 = d3
      .scaleBand()
      .domain(chartData.map((d) => d.label))
      .rangeRound([0, width])
      .paddingInner(0.25);

    const x1 = d3
      .scaleBand()
      .domain(subgroups)
      .rangeRound([0, x0.bandwidth()])
      .padding(0.1);

    const maxVal = d3.max(chartData, (d) => Math.max(d.perdidos, d.encontrados)) || 5;
    const y = d3
      .scaleLinear()
      .domain([0, Math.max(maxVal, 4)])
      .nice()
      .rangeRound([height, 0]);

    // Color palette
    const color = d3
      .scaleOrdinal<string>()
      .domain(subgroups)
      .range(["#EF4444", "#00843D"]); // Red for Perdidos, IFPR Green for Encontrados

    // Grid lines (horizontal)
    g.append("g")
      .attr("class", "grid")
      .call(
        d3
          .axisLeft(y)
          .ticks(5)
          .tickSize(-width)
          .tickFormat(() => "")
      )
      .selectAll(".tick line")
      .attr("stroke", darkMode ? "#27272a" : "#f1f5f9")
      .attr("stroke-dasharray", "3,3");

    // X Axis
    g.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x0).tickSize(0))
      .call((axis) => axis.select(".domain").attr("stroke", darkMode ? "#3f3f46" : "#cbd5e1"))
      .selectAll("text")
      .attr("fill", darkMode ? "#a1a1aa" : "#64748b")
      .attr("font-size", "11px")
      .attr("font-weight", "600")
      .attr("dy", "1em");

    // Y Axis
    g.append("g")
      .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("d")))
      .call((axis) => axis.select(".domain").remove())
      .selectAll("text")
      .attr("fill", darkMode ? "#a1a1aa" : "#64748b")
      .attr("font-size", "11px")
      .attr("font-weight", "600");

    // Bars
    const monthGroups = g
      .selectAll("g.month-group")
      .data(chartData)
      .join("g")
      .attr("class", "month-group")
      .attr("transform", (d) => `translate(${x0(d.label)},0)`);

    subgroups.forEach((key) => {
      monthGroups
        .append("rect")
        .attr("x", x1(key) || 0)
        .attr("y", height)
        .attr("width", x1.bandwidth())
        .attr("height", 0)
        .attr("fill", color(key))
        .attr("rx", 4)
        .attr("ry", 4)
        .attr("opacity", 0.9)
        .on("mouseenter", function (event, d: MonthData) {
          d3.select(this).attr("opacity", 1).attr("stroke", darkMode ? "#ffffff" : "#000000").attr("stroke-width", 1.5);
          if (tooltipRef.current) {
            const count = key === "perdidos" ? d.perdidos : d.encontrados;
            const label = key === "perdidos" ? "Itens Perdidos" : "Itens Encontrados";
            tooltipRef.current.style.opacity = "1";
            tooltipRef.current.style.left = `${event.pageX + 10}px`;
            tooltipRef.current.style.top = `${event.pageY - 28}px`;
            tooltipRef.current.innerHTML = `
              <div class="font-bold text-xs">${d.label}</div>
              <div class="text-[11px] flex items-center space-x-1 mt-0.5">
                <span class="w-2 h-2 rounded-full" style="background-color: ${color(key)}"></span>
                <span>${label}: <strong>${count}</strong></span>
              </div>
            `;
          }
        })
        .on("mouseleave", function () {
          d3.select(this).attr("opacity", 0.9).attr("stroke", "none");
          if (tooltipRef.current) {
            tooltipRef.current.style.opacity = "0";
          }
        })
        .transition()
        .duration(600)
        .delay((_, i) => i * 60)
        .attr("y", (d) => y(key === "perdidos" ? d.perdidos : d.encontrados))
        .attr("height", (d) => height - y(key === "perdidos" ? d.perdidos : d.encontrados));
    });

    return () => {
      svg.selectAll("*").remove();
    };
  }, [chartData, dimensions, darkMode]);

  const totalPerdidos = useMemo(() => chartData.reduce((acc, curr) => acc + curr.perdidos, 0), [chartData]);
  const totalEncontrados = useMemo(() => chartData.reduce((acc, curr) => acc + curr.encontrados, 0), [chartData]);

  return (
    <div className="p-6 bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-[#00843D]" />
            <h3 className="font-extrabold text-base text-neutral-900 dark:text-white">
              Evolução Temporal • Perdidos vs Encontrados (D3.js)
            </h3>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Distribuição mensal das ocorrências registradas no campus nos últimos 6 meses.
          </p>
        </div>

        {/* Legend & Summaries */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1.5 text-xs font-bold text-neutral-700 dark:text-neutral-300">
            <span className="w-3 h-3 rounded-md bg-[#EF4444]" />
            <span>Perdidos ({totalPerdidos})</span>
          </div>
          <div className="flex items-center space-x-1.5 text-xs font-bold text-neutral-700 dark:text-neutral-300">
            <span className="w-3 h-3 rounded-md bg-[#00843D]" />
            <span>Encontrados ({totalEncontrados})</span>
          </div>
        </div>
      </div>

      {/* D3 Chart Canvas Container */}
      <div ref={containerRef} className="w-full relative min-h-[320px]">
        {items.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 space-y-2">
            <Info className="w-8 h-8 text-neutral-400" />
            <p className="text-xs font-bold text-neutral-600 dark:text-neutral-400">
              Nenhum dado histórico registrado para exibir no gráfico.
            </p>
          </div>
        ) : (
          <svg ref={svgRef} className="w-full overflow-visible" />
        )}
      </div>

      {/* Floating Tooltip element */}
      <div
        ref={tooltipRef}
        className="fixed pointer-events-none z-50 px-2.5 py-1.5 rounded-xl bg-neutral-900 text-white shadow-xl text-xs transition-opacity duration-150 opacity-0 border border-neutral-700"
      />
    </div>
  );
};
