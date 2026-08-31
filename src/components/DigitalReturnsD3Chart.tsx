import React, { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import { LostFoundItem, ActivityLog } from "../types";
import {
  FileCheck2,
  TrendingUp,
  Calendar,
  Filter,
  Download,
  ShieldCheck,
  Smartphone,
  Mail,
  CheckCircle2,
  Layers,
  ArrowUpRight,
  Sparkles,
  Info,
} from "lucide-react";
import { safeParseDate } from "../lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface DigitalReturnsD3ChartProps {
  items: LostFoundItem[];
  activityLogs?: ActivityLog[];
  darkMode?: boolean;
  onSelectItem?: (item: LostFoundItem) => void;
}

interface DayMetric {
  date: Date;
  dateKey: string; // YYYY-MM-DD
  formattedDate: string; // "24/08"
  fullDateLabel: string; // "24 de Agosto de 2026"
  totalReturns: number;
  remoteReturns: number;
  inPersonReturns: number;
  items: LostFoundItem[];
}

export const DigitalReturnsD3Chart: React.FC<DigitalReturnsD3ChartProps> = ({
  items = [],
  activityLogs = [],
  darkMode = false,
  onSelectItem,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 320,
  });

  const [selectedRange, setSelectedRange] = useState<"7" | "14" | "30" | "60" | "90" | "all">("14");
  const [selectedModality, setSelectedModality] = useState<"ALL" | "REMOTE" | "IN_PERSON">("ALL");
  const [hoveredDay, setHoveredDay] = useState<DayMetric | null>(null);

  // Filter and identify all digitally returned items based on real criteria
  const digitalReturnedItems = useMemo(() => {
    return (items || []).filter((it) => {
      if (!it || it.status !== "DEVOLVIDO") return false;

      const hasDigitalSignature =
        it.recipientSignatureStatus === "SIGNED" ||
        Boolean(it.recipientSignatureUrl) ||
        Boolean(it.signedAt) ||
        Boolean(it.receiptValidationCode) ||
        it.recipientSignatureType === "REMOTE_EMAIL" ||
        it.recipientSignatureType === "IN_PERSON_DEVICE" ||
        Boolean(it.signatureTokenUsed);

      const hasSignatureHistory =
        Array.isArray(it.history || (it as any).historyLogs) &&
        (it.history || (it as any).historyLogs).some((h: any) => {
          const act = (h.action || "").toLowerCase();
          const det = (h.details || "").toLowerCase();
          return act.includes("assinatura") || det.includes("assinatura") || act.includes("token") || det.includes("token");
        });

      return hasDigitalSignature || hasSignatureHistory;
    });
  }, [items]);

  // Aggregate daily metrics
  const chartData = useMemo<DayMetric[]>(() => {
    const daysCount = selectedRange === "all" ? 60 : parseInt(selectedRange, 10);
    const dayMap = new Map<string, DayMetric>();

    const now = new Date();
    now.setHours(23, 59, 59, 999);

    // Build chronological slots for the chosen range
    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const key = `${year}-${month}-${day}`;

      dayMap.set(key, {
        date: new Date(year, d.getMonth(), d.getDate()),
        dateKey: key,
        formattedDate: `${day}/${month}`,
        fullDateLabel: d.toLocaleDateString("pt-BR", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric",
        }),
        totalReturns: 0,
        remoteReturns: 0,
        inPersonReturns: 0,
        items: [],
      });
    }

    // Populate with real items
    digitalReturnedItems.forEach((item) => {
      // Modality filter check
      const isRemote =
        item.recipientSignatureType === "REMOTE_EMAIL" ||
        (item.signatureTokenUsed && item.recipientSignatureType !== "IN_PERSON_DEVICE");
      const isPresencial = item.recipientSignatureType === "IN_PERSON_DEVICE" || (!isRemote && Boolean(item.recipientSignatureUrl));

      if (selectedModality === "REMOTE" && !isRemote) return;
      if (selectedModality === "IN_PERSON" && !isPresencial) return;

      // Extract effective date of return/signature
      const effectiveDateStr =
        item.signedAt ||
        item.resolutionDate ||
        item.returnDate ||
        item.date ||
        item.createdAt;

      const parsed = safeParseDate(effectiveDateStr);
      if (!parsed) return;

      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, "0");
      const day = String(parsed.getDate()).padStart(2, "0");
      const key = `${year}-${month}-${day}`;

      if (dayMap.has(key)) {
        const slot = dayMap.get(key)!;
        slot.totalReturns += 1;
        if (isRemote) slot.remoteReturns += 1;
        else slot.inPersonReturns += 1;
        slot.items.push(item);
      } else if (selectedRange === "all") {
        // Dynamic expansion for 'all' range
        dayMap.set(key, {
          date: new Date(year, parsed.getMonth(), parsed.getDate()),
          dateKey: key,
          formattedDate: `${day}/${month}`,
          fullDateLabel: parsed.toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric",
          }),
          totalReturns: 1,
          remoteReturns: isRemote ? 1 : 0,
          inPersonReturns: isPresencial ? 1 : 0,
          items: [item],
        });
      }
    });

    // Sort chronologically
    return Array.from(dayMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [digitalReturnedItems, selectedRange, selectedModality]);

  // Global KPIs computed from the filtered chartData
  const kpis = useMemo(() => {
    const total = chartData.reduce((acc, curr) => acc + curr.totalReturns, 0);
    const remote = chartData.reduce((acc, curr) => acc + curr.remoteReturns, 0);
    const inPerson = chartData.reduce((acc, curr) => acc + curr.inPersonReturns, 0);
    const peak = chartData.reduce((max, curr) => (curr.totalReturns > max.val ? { val: curr.totalReturns, date: curr.formattedDate } : max), { val: 0, date: "-" });
    const avgDaily = chartData.length > 0 ? (total / chartData.length).toFixed(1) : "0.0";
    const remotePercentage = total > 0 ? Math.round((remote / total) * 100) : 0;

    return {
      total,
      remote,
      inPerson,
      peak,
      avgDaily,
      remotePercentage,
    };
  }, [chartData]);

  // ResizeObserver for responsive chart dimensions
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

  // Render D3 Line Chart with area gradient, smooth curve and interactive tracking
  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clean previous render

    const margin = { top: 30, right: 30, bottom: 45, left: 45 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;

    if (width <= 0 || height <= 0) return;

    // Define defs & gradient
    const defs = svg.append("defs");

    // Area fill gradient
    const areaGradient = defs
      .append("linearGradient")
      .attr("id", "digitalReturnsAreaGradient")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "0%")
      .attr("y2", "100%");

    areaGradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#00843D")
      .attr("stop-opacity", 0.35);

    areaGradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#00843D")
      .attr("stop-opacity", 0.0);

    // Line stroke gradient
    const lineGradient = defs
      .append("linearGradient")
      .attr("id", "digitalReturnsLineGradient")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "100%")
      .attr("y2", "0%");

    lineGradient.append("stop").attr("offset", "0%").attr("stop-color", "#00843D");
    lineGradient.append("stop").attr("offset", "100%").attr("stop-color", "#10B981");

    const g = svg
      .attr("width", dimensions.width)
      .attr("height", dimensions.height)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // X Scale
    const x = d3
      .scalePoint()
      .domain(chartData.map((d) => d.formattedDate))
      .range([0, width])
      .padding(0.2);

    // Y Scale
    const maxVal = d3.max(chartData, (d) => d.totalReturns) || 0;
    const y = d3
      .scaleLinear()
      .domain([0, Math.max(maxVal + 1, 4)])
      .nice()
      .range([height, 0]);

    // Horizontal Grid Lines
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
    const tickInterval = Math.ceil(chartData.length / 10);
    g.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(
        d3
          .axisBottom(x)
          .tickValues(
            chartData
              .map((d) => d.formattedDate)
              .filter((_, idx) => idx % tickInterval === 0 || idx === chartData.length - 1)
          )
      )
      .selectAll("text")
      .attr("fill", darkMode ? "#a1a1aa" : "#64748b")
      .attr("font-size", "10px")
      .attr("font-weight", "600");

    g.select(".domain").attr("stroke", darkMode ? "#3f3f46" : "#e2e8f0");

    // Y Axis
    g.append("g")
      .call(
        d3
          .axisLeft(y)
          .ticks(5)
          .tickFormat(d3.format("d"))
      )
      .selectAll("text")
      .attr("fill", darkMode ? "#a1a1aa" : "#64748b")
      .attr("font-size", "10px")
      .attr("font-weight", "600");

    // Y Axis Label
    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -32)
      .attr("x", -height / 2)
      .attr("text-anchor", "middle")
      .attr("fill", darkMode ? "#71717a" : "#94a3b8")
      .attr("font-size", "9px")
      .attr("font-weight", "700")
      .text("DEVOLUÇÕES / DIA");

    // D3 Area generator
    const area = d3
      .area<DayMetric>()
      .x((d) => x(d.formattedDate) || 0)
      .y0(height)
      .y1((d) => y(d.totalReturns))
      .curve(d3.curveMonotoneX);

    // D3 Line generator
    const line = d3
      .line<DayMetric>()
      .x((d) => x(d.formattedDate) || 0)
      .y((d) => y(d.totalReturns))
      .curve(d3.curveMonotoneX);

    // Draw Area under curve
    g.append("path")
      .datum(chartData)
      .attr("fill", "url(#digitalReturnsAreaGradient)")
      .attr("d", area);

    // Draw Line
    const path = g
      .append("path")
      .datum(chartData)
      .attr("fill", "none")
      .attr("stroke", "url(#digitalReturnsLineGradient)")
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("d", line);

    // Animate line entry
    const totalLength = (path.node() as SVGPathElement)?.getTotalLength?.() || 1000;
    path
      .attr("stroke-dasharray", `${totalLength} ${totalLength}`)
      .attr("stroke-dashoffset", totalLength)
      .transition()
      .duration(750)
      .ease(d3.easeCubicOut)
      .attr("stroke-dashoffset", 0);

    // Interactive group: Dots for each data point
    const dotsGroup = g.append("g").attr("class", "dots-group");

    chartData.forEach((d) => {
      const cx = x(d.formattedDate) || 0;
      const cy = y(d.totalReturns);

      if (d.totalReturns > 0) {
        // Outer halo
        dotsGroup
          .append("circle")
          .attr("cx", cx)
          .attr("cy", cy)
          .attr("r", 6)
          .attr("fill", "#00843D")
          .attr("fill-opacity", 0.25);

        // Inner solid dot
        dotsGroup
          .append("circle")
          .attr("cx", cx)
          .attr("cy", cy)
          .attr("r", 3.5)
          .attr("fill", "#00843D")
          .attr("stroke", "#ffffff")
          .attr("stroke-width", 2);
      } else {
        // Subtle dot for zero days
        dotsGroup
          .append("circle")
          .attr("cx", cx)
          .attr("cy", cy)
          .attr("r", 1.8)
          .attr("fill", darkMode ? "#52525b" : "#cbd5e1");
      }
    });

    // Crosshair hover elements
    const focusLine = g
      .append("line")
      .attr("class", "focus-line")
      .attr("y1", 0)
      .attr("y2", height)
      .attr("stroke", darkMode ? "#a1a1aa" : "#475569")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4,4")
      .style("opacity", 0);

    const focusCircle = g
      .append("circle")
      .attr("class", "focus-circle")
      .attr("r", 6.5)
      .attr("fill", "#00843D")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 2.5)
      .style("opacity", 0);

    // Overlay for mouse tracking
    const bisectDate = d3.bisector<DayMetric, string>((d) => d.formattedDate).left;

    svg
      .append("rect")
      .attr("transform", `translate(${margin.left},${margin.top})`)
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "transparent")
      .attr("cursor", "crosshair")
      .on("mousemove", (event) => {
        const [mx] = d3.pointer(event);
        // Find closest point by dividing width evenly
        const pointWidth = width / (chartData.length - 1 || 1);
        const index = Math.min(
          Math.max(0, Math.round(mx / pointWidth)),
          chartData.length - 1
        );
        const selected = chartData[index];

        if (selected) {
          const cx = x(selected.formattedDate) || 0;
          const cy = y(selected.totalReturns);

          focusLine
            .attr("x1", cx)
            .attr("x2", cx)
            .style("opacity", 0.75);

          focusCircle
            .attr("cx", cx)
            .attr("cy", cy)
            .style("opacity", 1);

          setHoveredDay(selected);
        }
      })
      .on("mouseleave", () => {
        focusLine.style("opacity", 0);
        focusCircle.style("opacity", 0);
        setHoveredDay(null);
      });
  }, [chartData, dimensions, darkMode]);

  // Export Daily Returns Summary PDF
  const handleExportPDF = () => {
    try {
      const doc = new jsPDF("p", "mm", "a4");

      // Banner IFPR
      doc.setFillColor(0, 132, 61);
      doc.rect(0, 0, 210, 22, "F");
      doc.setFillColor(200, 30, 30);
      doc.rect(0, 22, 210, 2.5, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("INSTITUTO FEDERAL DO PARANÁ - CAMPUS IVAIPORÃ", 14, 11);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text("SISTEMA LOCALIZA+ • RELATÓRIO DE MÉTRICAS DE DEVOLUÇÕES DIGITAIS", 14, 17);

      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("VOLUME DIÁRIO DE DEVOLUÇÕES VALIDADAS DIGITALMENTE", 14, 32);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(`Período Selecionado: Últimos ${selectedRange === "all" ? "60+" : selectedRange} dias`, 14, 38);
      doc.text(`Total de Devoluções no Período: ${kpis.total}`, 14, 43);
      doc.text(`Assinaturas Remotas: ${kpis.remote} (${kpis.remotePercentage}%) • Presenciais: ${kpis.inPerson}`, 14, 48);
      doc.text(`Data de Emissão: ${new Date().toLocaleString("pt-BR")}`, 14, 53);

      const tableData = chartData
        .filter((d) => d.totalReturns > 0)
        .map((d) => [
          d.formattedDate,
          d.totalReturns.toString(),
          d.remoteReturns.toString(),
          d.inPersonReturns.toString(),
          d.items.map((i) => `${i.title} (${i.receiptValidationCode || i.id})`).join(", "),
        ]);

      autoTable(doc, {
        startY: 58,
        head: [["Data", "Total Devoluções", "Remotas (E-mail)", "Presenciais", "Itens e Protocolos"]],
        body:
          tableData.length > 0
            ? tableData
            : [["-", "0", "0", "0", "Nenhuma devolução com assinatura no período"]],
        theme: "grid",
        headStyles: { fillColor: [0, 132, 61], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
        styles: { fontSize: 7, cellPadding: 2 },
      });

      doc.save(`Metricas_Devolucoes_Digitais_IFPR_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error("Erro ao gerar relatório PDF:", err);
    }
  };

  return (
    <div
      id="digital-returns-dashboard"
      className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 sm:p-8 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-6"
    >
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-neutral-100 dark:border-neutral-800 pb-5">
        <div className="flex items-center space-x-3">
          <div className="p-3 rounded-2xl bg-[#00843D]/10 text-[#00843D] dark:text-[#00c75c] shrink-0">
            <FileCheck2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white">
                Métricas de Devoluções Validadas Digitalmente
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#00843D]/10 text-[#00843D] border border-[#00843D]/20">
                D3 Engine
              </span>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Volume diário de termos de restituição e quitação validados via token criptográfico no Firestore
            </p>
          </div>
        </div>

        {/* Action Buttons & Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Modality Filter */}
          <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs">
            <button
              onClick={() => setSelectedModality("ALL")}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                selectedModality === "ALL"
                  ? "bg-white dark:bg-neutral-900 text-[#00843D] shadow-xs"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
              }`}
            >
              Todas
            </button>
            <button
              onClick={() => setSelectedModality("REMOTE")}
              className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-all ${
                selectedModality === "REMOTE"
                  ? "bg-white dark:bg-neutral-900 text-[#00843D] shadow-xs"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
              }`}
            >
              <Mail className="w-3 h-3" /> Remotas
            </button>
            <button
              onClick={() => setSelectedModality("IN_PERSON")}
              className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-all ${
                selectedModality === "IN_PERSON"
                  ? "bg-white dark:bg-neutral-900 text-[#00843D] shadow-xs"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
              }`}
            >
              <Smartphone className="w-3 h-3" /> Presenciais
            </button>
          </div>

          {/* Time range selector */}
          <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs">
            {(["7", "14", "30", "60"] as const).map((range) => (
              <button
                key={range}
                onClick={() => setSelectedRange(range)}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  selectedRange === range
                    ? "bg-white dark:bg-neutral-900 text-[#00843D] shadow-xs"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
                }`}
              >
                {range}d
              </button>
            ))}
          </div>

          {/* Export PDF */}
          <button
            onClick={handleExportPDF}
            className="p-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-[#00843D] hover:text-white rounded-xl text-neutral-700 dark:text-neutral-300 font-bold transition-all text-xs flex items-center gap-1.5 cursor-pointer"
            title="Exportar Relatório em PDF"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar PDF</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-neutral-50 dark:bg-neutral-900/60 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 space-y-1">
          <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#00843D]" /> Total Validadas
          </span>
          <div className="text-2xl font-black text-neutral-900 dark:text-white flex items-baseline gap-2">
            <span>{kpis.total}</span>
            <span className="text-[10px] text-neutral-400 font-medium">no período</span>
          </div>
        </div>

        <div className="bg-neutral-50 dark:bg-neutral-900/60 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 space-y-1">
          <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> Pico Diário
          </span>
          <div className="text-2xl font-black text-neutral-900 dark:text-white flex items-baseline gap-2">
            <span>{kpis.peak.val}</span>
            <span className="text-[10px] text-neutral-400 font-medium">({kpis.peak.date})</span>
          </div>
        </div>

        <div className="bg-neutral-50 dark:bg-neutral-900/60 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 space-y-1">
          <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-blue-500" /> Média Diária
          </span>
          <div className="text-2xl font-black text-neutral-900 dark:text-white flex items-baseline gap-2">
            <span>{kpis.avgDaily}</span>
            <span className="text-[10px] text-neutral-400 font-medium">por dia</span>
          </div>
        </div>

        <div className="bg-neutral-50 dark:bg-neutral-900/60 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 space-y-1">
          <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-purple-500" /> Taxa Remota
          </span>
          <div className="text-2xl font-black text-neutral-900 dark:text-white flex items-baseline gap-2">
            <span>{kpis.remotePercentage}%</span>
            <span className="text-[10px] text-neutral-400 font-medium">via link/e-mail</span>
          </div>
        </div>
      </div>

      {/* D3 Line Chart Container */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-neutral-500 px-1">
          <span className="font-bold flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-[#00843D]" /> Gráfico Interativo de Linhas (D3.js)
          </span>
          <span>Passe o cursor sobre os pontos para inspecionar</span>
        </div>

        <div
          ref={containerRef}
          className="relative w-full rounded-2xl bg-neutral-50/70 dark:bg-neutral-900/40 border border-neutral-200/80 dark:border-neutral-800 p-2 overflow-hidden"
        >
          <svg ref={svgRef} className="w-full overflow-visible" />

          {/* Interactive Hover Tooltip */}
          {hoveredDay && (
            <div className="absolute top-3 right-3 p-3.5 rounded-2xl bg-white/95 dark:bg-neutral-900/95 border border-neutral-200 dark:border-neutral-800 shadow-xl backdrop-blur-xs text-xs space-y-1.5 max-w-xs animate-in fade-in duration-150 z-20">
              <div className="flex items-center justify-between gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-1">
                <span className="font-extrabold text-neutral-900 dark:text-white capitalize">
                  {hoveredDay.fullDateLabel}
                </span>
                <span className="px-1.5 py-0.5 rounded-md font-black bg-[#00843D]/10 text-[#00843D] text-[10px]">
                  {hoveredDay.totalReturns} devoluç{hoveredDay.totalReturns === 1 ? "ão" : "ões"}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-0.5">
                <span>Assinaturas Remotas:</span>
                <strong className="text-neutral-900 dark:text-white">{hoveredDay.remoteReturns}</strong>
              </div>
              <div className="flex items-center justify-between text-[11px] text-neutral-500">
                <span>Assinaturas Presenciais:</span>
                <strong className="text-neutral-900 dark:text-white">{hoveredDay.inPersonReturns}</strong>
              </div>

              {hoveredDay.items.length > 0 && (
                <div className="pt-1.5 border-t border-neutral-100 dark:border-neutral-800 space-y-1">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase">Pertences Devolvidos:</span>
                  <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                    {hoveredDay.items.map((it) => (
                      <div
                        key={it.id}
                        onClick={() => onSelectItem && onSelectItem(it)}
                        className="p-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800/80 hover:bg-[#00843D]/10 text-[10px] cursor-pointer transition-colors flex items-center justify-between"
                      >
                        <span className="font-bold text-neutral-800 dark:text-neutral-200 truncate max-w-[140px]">
                          {it.title}
                        </span>
                        <span className="font-mono text-neutral-400 text-[9px] shrink-0">
                          {it.receiptValidationCode ? it.receiptValidationCode.slice(0, 12) : it.id.slice(0, 8)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Empty State when zero total returns */}
          {kpis.total === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 dark:bg-black/40 backdrop-blur-2xs p-4 text-center">
              <div className="w-10 h-10 rounded-2xl bg-neutral-100 dark:bg-neutral-800 text-neutral-400 flex items-center justify-center mb-2">
                <Info className="w-5 h-5" />
              </div>
              <p className="text-xs font-bold text-neutral-700 dark:text-neutral-300">
                Nenhuma devolução com validação digital registrada nos últimos {selectedRange} dias
              </p>
              <p className="text-[11px] text-neutral-500 max-w-sm mt-0.5">
                Os dados serão plotados automaticamente conforme novos termos de restituição forem assinados presencialmente ou via e-mail.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Audit List of Digitally Validated Returns */}
      <div className="space-y-3 pt-2 border-t border-neutral-100 dark:border-neutral-800">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase text-neutral-700 dark:text-neutral-300 tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#00843D]" />
            Últimas Devoluções Validadas Digitalmente ({digitalReturnedItems.length})
          </h3>
          <span className="text-[11px] text-neutral-400 font-medium">Trilha Criptográfica Firestore</span>
        </div>

        {digitalReturnedItems.length === 0 ? (
          <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-900/50 text-center text-xs text-neutral-400 italic">
            Nenhum pertence devolvido via assinatura digital localizado no banco de dados.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-neutral-100 dark:bg-neutral-800/80 text-neutral-600 dark:text-neutral-400 font-bold border-b border-neutral-200 dark:border-neutral-800">
                  <th className="p-3">Objeto / Categoria</th>
                  <th className="p-3">Receptor / Vínculo</th>
                  <th className="p-3">Data / Hora</th>
                  <th className="p-3">Modalidade</th>
                  <th className="p-3">Protocolo de Validação</th>
                  <th className="p-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {digitalReturnedItems.slice(0, 6).map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-900/40 transition-colors"
                  >
                    <td className="p-3 font-bold text-neutral-900 dark:text-white whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span>{item.title}</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
                          {item.category}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                      <div>
                        <span className="font-bold">{item.recipientName || "Receptor"}</span>
                        <span className="text-[10px] text-neutral-400 block font-normal">
                          {item.recipientBond || "Aluno/Servidor"}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                      {new Date(item.signedAt || item.resolutionDate || item.date || Date.now()).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black flex items-center gap-1 w-max ${
                          item.recipientSignatureType === "REMOTE_EMAIL"
                            ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                            : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        }`}
                      >
                        {item.recipientSignatureType === "REMOTE_EMAIL" ? (
                          <>
                            <Mail className="w-3 h-3" /> Remota (E-mail)
                          </>
                        ) : (
                          <>
                            <Smartphone className="w-3 h-3" /> Presencial (Dispositivo)
                          </>
                        )}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-[11px] font-bold text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                      {item.receiptValidationCode || `REC-IFPR-${item.id.slice(0, 8)}`}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => onSelectItem && onSelectItem(item)}
                        className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-[#00843D] hover:text-white text-neutral-700 dark:text-neutral-300 font-bold transition-all text-[11px] cursor-pointer"
                      >
                        Ver Detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
