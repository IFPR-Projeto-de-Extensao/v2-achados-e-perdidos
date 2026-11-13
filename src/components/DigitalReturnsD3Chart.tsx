import React, { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  FileCheck2,
  Calendar,
  TrendingUp,
  Download,
  Mail,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  Search,
  Filter,
  Eye,
  Info,
} from "lucide-react";
import type { LostFoundItem, ActivityLog } from "../types";
import { safeParseDate, formatDateTime } from "../lib/utils";
import { SurfaceCard, SubtlePanel, UIBadge, UIButton, UIInput, EmptyState } from "./ui";

export interface DigitalReturnsD3ChartProps {
  items: LostFoundItem[];
  activityLogs?: ActivityLog[];
  darkMode?: boolean;
  onSelectItem?: (item: LostFoundItem) => void;
}

interface DayMetric {
  date: Date;
  dateStr: string;
  formattedDate: string;
  count: number;
  remoteCount: number;
  inPersonCount: number;
  items: LostFoundItem[];
}

export function DigitalReturnsD3Chart({
  items,
  activityLogs = [],
  darkMode = false,
  onSelectItem,
}: DigitalReturnsD3ChartProps) {
  const [selectedRange, setSelectedRange] = useState<"7" | "14" | "30" | "60">("30");
  const [selectedModality, setSelectedModality] = useState<"ALL" | "REMOTE" | "IN_PERSON">("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [hoveredPoint, setHoveredPoint] = useState<DayMetric | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(800);

  // ResizeObserver for responsive SVG
  useEffect(() => {
    if (!containerRef.current) return;
    const updateWidth = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        if (w > 0) setContainerWidth(w);
      }
    };
    updateWidth();
    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Filter ONLY completed digitally signed returns (exclude PENDING_REMOTE and unsigned returns)
  const returnedItems = useMemo(() => {
    return items.filter((item) => {
      if (!item || item.status !== "DEVOLVIDO") return false;
      if (item.recipientSignatureStatus === "PENDING_REMOTE") return false;

      const isDigitallySigned =
        item.recipientSignatureStatus === "SIGNED" ||
        Boolean(item.recipientSignatureUrl) ||
        Boolean(item.signedAt) ||
        Boolean(item.signatureTokenUsed);

      if (!isDigitallySigned) return false;

      // Filter by modality
      if (selectedModality === "REMOTE") {
        return (
          item.recipientSignatureType === "REMOTE_EMAIL" ||
          item.recipientSignatureType === "PRE_VERIFIED" ||
          (Boolean(item.signatureTokenUsed) && !item.recipientSignatureType)
        );
      }
      if (selectedModality === "IN_PERSON") {
        return (
          item.recipientSignatureType === "IN_PERSON_DEVICE" ||
          (!item.recipientSignatureType && !item.signatureTokenUsed)
        );
      }

      return true;
    });
  }, [items, selectedModality]);

  const pendingCounts = useMemo(() => {
    let pendingRemote = 0;
    let pendingStaffAttestation = 0;
    for (const item of items) {
      if (!item || item.status !== "DEVOLVIDO") continue;
      if (item.recipientSignatureStatus === "PENDING_REMOTE" && !item.recipientSignatureUrl) {
        pendingRemote += 1;
      } else if (
        (item.recipientSignatureStatus === "SIGNED" || Boolean(item.recipientSignatureUrl)) &&
        item.staffSignatureStatus !== "SIGNED"
      ) {
        pendingStaffAttestation += 1;
      }
    }
    return { pendingRemote, pendingStaffAttestation };
  }, [items]);

  // Aggregate daily metrics for the selected time range
  const dailyMetrics = useMemo<DayMetric[]>(() => {
    const daysCount = parseInt(selectedRange, 10);
    const now = new Date();
    const metrics: DayMetric[] = [];

    // Build day buckets from (now - N + 1 days) up to today
    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;
      const formattedDate = `${day}/${month}`;

      metrics.push({
        date: d,
        dateStr,
        formattedDate,
        count: 0,
        remoteCount: 0,
        inPersonCount: 0,
        items: [],
      });
    }

    const metricMap = new Map<string, DayMetric>();
    metrics.forEach((m) => metricMap.set(m.dateStr, m));

    returnedItems.forEach((item) => {
      const rawDate =
        item.returnDate ||
        item.recipientSignatureDate ||
        item.signedAt ||
        item.resolutionDate ||
        item.createdAt;

      const parsed = safeParseDate(rawDate);
      if (!parsed) return;

      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, "0");
      const day = String(parsed.getDate()).padStart(2, "0");
      const itemDateStr = `${year}-${month}-${day}`;

      const bucket = metricMap.get(itemDateStr);
      if (bucket) {
        bucket.count += 1;
        bucket.items.push(item);
        const isRemote =
          item.recipientSignatureType === "REMOTE_EMAIL" ||
          item.recipientSignatureType === "PRE_VERIFIED" ||
          (item.signatureTokenUsed && !item.recipientSignatureType);

        if (isRemote) {
          bucket.remoteCount += 1;
        } else {
          bucket.inPersonCount += 1;
        }
      }
    });

    return metrics;
  }, [returnedItems, selectedRange]);

  // KPIs
  const kpis = useMemo(() => {
    const total = dailyMetrics.reduce((acc, m) => acc + m.count, 0);
    const totalRemote = dailyMetrics.reduce((acc, m) => acc + m.remoteCount, 0);
    const totalInPerson = dailyMetrics.reduce((acc, m) => acc + m.inPersonCount, 0);
    const days = dailyMetrics.length || 1;
    const avgDaily = (total / days).toFixed(1);

    let peak = { val: 0, date: "--" };
    dailyMetrics.forEach((m) => {
      if (m.count > peak.val) {
        peak = { val: m.count, date: m.formattedDate };
      }
    });

    const remotePercentage = total > 0 ? Math.round((totalRemote / total) * 100) : 0;

    return {
      total,
      totalRemote,
      totalInPerson,
      avgDaily,
      peak,
      remotePercentage,
      pendingRemote: pendingCounts.pendingRemote,
      pendingStaffAttestation: pendingCounts.pendingStaffAttestation,
    };
  }, [dailyMetrics, pendingCounts]);

  // D3 Chart Rendering
  useEffect(() => {
    if (!svgRef.current || containerWidth <= 0 || dailyMetrics.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const height = 280;
    const margin = { top: 20, right: 24, bottom: 35, left: 40 };
    const innerWidth = Math.max(100, containerWidth - margin.left - margin.right);
    const innerHeight = Math.max(80, height - margin.top - margin.bottom);

    svg.attr("width", containerWidth).attr("height", height);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // X Scale
    const xScale = d3
      .scaleTime()
      .domain(d3.extent(dailyMetrics, (d) => d.date) as [Date, Date])
      .range([0, innerWidth]);

    // Y Scale
    const maxVal = d3.max(dailyMetrics, (d) => d.count) || 0;
    const yMax = Math.max(4, Math.ceil(maxVal * 1.2));
    const yScale = d3.scaleLinear().domain([0, yMax]).range([innerHeight, 0]).nice();

    // Defs & Gradients
    const defs = svg.append("defs");

    const areaGradient = defs
      .append("linearGradient")
      .attr("id", "emerald-area-gradient")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "0%")
      .attr("y2", "100%");

    areaGradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#16845B")
      .attr("stop-opacity", darkMode ? 0.45 : 0.28);

    areaGradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#16845B")
      .attr("stop-opacity", 0.0);

    // Grid lines (Horizontal)
    const yTicks = yScale.ticks(4);
    g.append("g")
      .attr("class", "grid")
      .selectAll("line")
      .data(yTicks)
      .enter()
      .append("line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", (d) => yScale(d))
      .attr("y2", (d) => yScale(d))
      .attr("stroke", darkMode ? "#1E293B" : "#E2E8F0")
      .attr("stroke-dasharray", "3,3")
      .attr("stroke-width", 1);

    // Area Generator
    const area = d3
      .area<DayMetric>()
      .x((d) => xScale(d.date))
      .y0(innerHeight)
      .y1((d) => yScale(d.count))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(dailyMetrics)
      .attr("fill", "url(#emerald-area-gradient)")
      .attr("d", area);

    // Line Generator
    const line = d3
      .line<DayMetric>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.count))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(dailyMetrics)
      .attr("fill", "none")
      .attr("stroke", "#16845B")
      .attr("stroke-width", 2.5)
      .attr("d", line);

    // X Axis
    const maxTicks = Math.min(dailyMetrics.length, containerWidth > 600 ? 10 : 5);
    const xAxis = d3
      .axisBottom(xScale)
      .ticks(maxTicks)
      .tickFormat((d) => {
        const dt = d as Date;
        const day = String(dt.getDate()).padStart(2, "0");
        const month = String(dt.getMonth() + 1).padStart(2, "0");
        return `${day}/${month}`;
      })
      .tickSize(0)
      .tickPadding(10);

    const xAxisG = g
      .append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(xAxis);

    xAxisG.select(".domain").attr("stroke", darkMode ? "#334155" : "#CBD5E1");
    xAxisG
      .selectAll("text")
      .attr("fill", darkMode ? "#94A3B8" : "#64748B")
      .attr("font-size", "10px")
      .attr("font-weight", "500");

    // Y Axis
    const yAxis = d3
      .axisLeft(yScale)
      .ticks(4)
      .tickFormat(d3.format("d"))
      .tickSize(0)
      .tickPadding(8);

    const yAxisG = g.append("g").call(yAxis);
    yAxisG.select(".domain").remove();
    yAxisG
      .selectAll("text")
      .attr("fill", darkMode ? "#94A3B8" : "#64748B")
      .attr("font-size", "10px")
      .attr("font-weight", "500");

    // Interactive Points & Overlay
    const pointsGroup = g.append("g").attr("class", "points");

    pointsGroup
      .selectAll("circle")
      .data(dailyMetrics)
      .enter()
      .append("circle")
      .attr("cx", (d) => xScale(d.date))
      .attr("cy", (d) => yScale(d.count))
      .attr("r", (d) => (d.count > 0 ? 4 : 2))
      .attr("fill", (d) => (d.count > 0 ? "#16845B" : darkMode ? "#334155" : "#CBD5E1"))
      .attr("stroke", darkMode ? "#0F172A" : "#FFFFFF")
      .attr("stroke-width", 2)
      .attr("class", "transition-all duration-150 cursor-pointer");

    // Transparent overlay for mouse tracking
    const bisectDate = d3.bisector((d: DayMetric) => d.date).center;

    svg
      .append("rect")
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .attr("transform", `translate(${margin.left},${margin.top})`)
      .attr("fill", "transparent")
      .attr("cursor", "crosshair")
      .on("mousemove", (event) => {
        const [mx] = d3.pointer(event);
        const xDate = xScale.invert(mx);
        const index = bisectDate(dailyMetrics, xDate);
        const d = dailyMetrics[index];
        if (d) {
          setHoveredPoint(d);
          const px = xScale(d.date) + margin.left;
          const py = yScale(d.count) + margin.top;
          setTooltipPos({ x: px, y: py });
        }
      })
      .on("mouseleave", () => {
        setHoveredPoint(null);
        setTooltipPos(null);
      });
  }, [dailyMetrics, containerWidth, darkMode]);

  // Filter items in audit list
  const filteredAuditItems = useMemo(() => {
    let list = returnedItems;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (it) =>
          it.title.toLowerCase().includes(q) ||
          it.recipientName?.toLowerCase().includes(q) ||
          it.recipientEmail?.toLowerCase().includes(q) ||
          it.receiptValidationCode?.toLowerCase().includes(q) ||
          it.category.toLowerCase().includes(q)
      );
    }
    return list.slice(0, 50); // limit for performance
  }, [returnedItems, searchTerm]);

  // Export PDF with institutional Localiza+ styling
  const handleExportPDF = () => {
    const doc = new jsPDF();
    const primaryColor = [22, 132, 91] as [number, number, number]; // #16845B
    const darkColor = [23, 43, 42] as [number, number, number]; // #172B2A

    // Institutional Header
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, 210, 24, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("LOCALIZA+ | IFPR CAMPUS IVAIPORÃ", 14, 11);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Relatório de Devoluções Validadas Digitalmente (D3 Engine)", 14, 18);

    // Report Metadata
    doc.setTextColor(...darkColor);
    doc.setFontSize(9);
    doc.text(`Emissão: ${new Date().toLocaleString("pt-BR")}`, 14, 32);
    doc.text(`Período analisado: Últimos ${selectedRange} dias | Modalidade: ${selectedModality}`, 14, 37);

    // KPIs summary box
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 42, 182, 18, 2, 2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(
      `TOTAL VALIDADAS: ${kpis.total} | PENDENTES REMOTA: ${kpis.pendingRemote} | ATESTAÇÃO PENDENTE: ${kpis.pendingStaffAttestation}`,
      20,
      50
    );
    doc.text(
      `MÉDIA DIÁRIA: ${kpis.avgDaily} | PICO DIÁRIO: ${kpis.peak.val} (${kpis.peak.date}) | TAXA REMOTA: ${kpis.remotePercentage}%`,
      20,
      56
    );

    // Audit Table of items
    const tableRows = filteredAuditItems.map((it) => {
      const isRemote =
        it.recipientSignatureType === "REMOTE_EMAIL" ||
        it.recipientSignatureType === "PRE_VERIFIED" ||
        (Boolean(it.signatureTokenUsed) && !it.recipientSignatureType);
      const staffAttested = it.staffSignatureStatus === "SIGNED";

      return [
        it.title,
        it.category,
        it.recipientName || "Não informado",
        isRemote ? "Remota (E-mail)" : "Presencial",
        staffAttested ? "Dupla Assinatura" : "Atestação Pendente",
        it.receiptValidationCode || "Validado",
        it.signedAt || it.returnDate || it.createdAt || "--",
      ];
    });

    autoTable(doc, {
      startY: 66,
      head: [["Objeto", "Categoria", "Recebedor", "Modalidade", "Atestação", "Cód. Validação", "Data/Hora"]],
      body: tableRows,
      headStyles: {
        fillColor: primaryColor,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
      },
      styles: {
        fontSize: 8,
        cellPadding: 2.5,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
    });

    doc.save(`localiza-devolucoes-digitais-${selectedRange}d.pdf`);
  };

  return (
    <SurfaceCard
      id="digital-returns-dashboard"
      padding="lg"
      className="space-y-6"
    >
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-[#EBF5F0] dark:bg-[#16845B]/20 text-[#16845B] dark:text-emerald-400 border border-[#16845B]/15 shrink-0">
            <FileCheck2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-bold text-[#172B2A] dark:text-white tracking-tight">
                Métricas de Devoluções Validadas Digitalmente
              </h2>
              <UIBadge tone="emerald">D3 Engine</UIBadge>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Volume diário de termos de restituição e quitação validados via token criptográfico no Firestore
            </p>
          </div>
        </div>

        {/* Action Buttons & Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Modality Filter */}
          <div className="flex items-center bg-[#F8FAFC] dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
            <button
              type="button"
              onClick={() => setSelectedModality("ALL")}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                selectedModality === "ALL"
                  ? "bg-white dark:bg-[#111827] text-[#16845B] dark:text-emerald-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-[#172B2A] dark:hover:text-white"
              }`}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => setSelectedModality("REMOTE")}
              className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                selectedModality === "REMOTE"
                  ? "bg-white dark:bg-[#111827] text-[#16845B] dark:text-emerald-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-[#172B2A] dark:hover:text-white"
              }`}
            >
              <Mail className="w-3 h-3" /> Remotas
            </button>
            <button
              type="button"
              onClick={() => setSelectedModality("IN_PERSON")}
              className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                selectedModality === "IN_PERSON"
                  ? "bg-white dark:bg-[#111827] text-[#16845B] dark:text-emerald-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-[#172B2A] dark:hover:text-white"
              }`}
            >
              <Smartphone className="w-3 h-3" /> Presenciais
            </button>
          </div>

          {/* Time range selector */}
          <div className="flex items-center bg-[#F8FAFC] dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
            {(["7", "14", "30", "60"] as const).map((range) => (
              <button
                type="button"
                key={range}
                onClick={() => setSelectedRange(range)}
                className={`px-2.5 py-1 rounded-lg font-semibold tabular-nums transition-all cursor-pointer ${
                  selectedRange === range
                    ? "bg-white dark:bg-[#111827] text-[#16845B] dark:text-emerald-400 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-[#172B2A] dark:hover:text-white"
                }`}
              >
                {range}d
              </button>
            ))}
          </div>

          {/* Export PDF */}
          <UIButton
            variant="primary"
            size="sm"
            onClick={handleExportPDF}
            title="Exportar Relatório em PDF"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar PDF</span>
          </UIButton>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <SubtlePanel padding="sm" className="space-y-1">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#16845B]" /> Total Validadas
          </span>
          <div className="text-2xl font-bold text-[#172B2A] dark:text-white flex items-baseline gap-2 tabular-nums">
            <span>{kpis.total}</span>
            <span className="text-[10px] text-slate-400 font-medium">assinadas no período</span>
          </div>
        </SubtlePanel>

        <SubtlePanel padding="sm" className="space-y-1">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-[#16845B]" /> Pico Diário
          </span>
          <div className="text-2xl font-bold text-[#172B2A] dark:text-white flex items-baseline gap-2 tabular-nums">
            <span>{kpis.peak.val}</span>
            <span className="text-[10px] text-slate-400 font-medium">({kpis.peak.date})</span>
          </div>
        </SubtlePanel>

        <SubtlePanel padding="sm" className="space-y-1">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" /> Média Diária
          </span>
          <div className="text-2xl font-bold text-[#172B2A] dark:text-white flex items-baseline gap-2 tabular-nums">
            <span>{kpis.avgDaily}</span>
            <span className="text-[10px] text-slate-400 font-medium">por dia</span>
          </div>
        </SubtlePanel>

        <SubtlePanel padding="sm" className="space-y-1">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[#064E3B] dark:text-emerald-400" /> Taxa Remota
          </span>
          <div className="text-2xl font-bold text-[#172B2A] dark:text-white flex items-baseline gap-2 tabular-nums">
            <span>{kpis.remotePercentage}%</span>
            <span className="text-[10px] text-slate-400 font-medium">via link/e-mail</span>
          </div>
        </SubtlePanel>
      </div>

      {(kpis.pendingRemote > 0 || kpis.pendingStaffAttestation > 0) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {kpis.pendingRemote > 0 && (
            <UIBadge tone="amber">
              <Mail className="w-3 h-3" />
              <span>{kpis.pendingRemote} aguardando assinatura remota (fora da contagem assinada)</span>
            </UIBadge>
          )}
          {kpis.pendingStaffAttestation > 0 && (
            <UIBadge tone="blue">
              <ShieldCheck className="w-3 h-3" />
              <span>{kpis.pendingStaffAttestation} com assinatura do receptor e atestação do atendente pendente</span>
            </UIBadge>
          )}
        </div>
      )}

      {/* D3 Graph Area */}
      <SubtlePanel padding="md" className="relative">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Tendência Temporal de Devoluções Concluídas
          </span>
          <div className="flex items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#16845B] rounded-full inline-block" />
              <span>Devoluções</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#16845B]/20 border border-[#16845B] inline-block" />
              <span>Volume</span>
            </div>
          </div>
        </div>

        <div ref={containerRef} className="w-full relative">
          <svg ref={svgRef} className="overflow-visible block w-full" />

          {/* Interactive D3 Tooltip */}
          {hoveredPoint && tooltipPos && (
            <div
              className="absolute z-20 pointer-events-none -translate-x-1/2 -translate-y-full mb-3 bg-[#172B2A] text-white text-xs rounded-xl px-3 py-2 shadow-xl border border-slate-700/60 space-y-1 min-w-[130px] backdrop-blur-sm"
              style={{
                left: `${tooltipPos.x}px`,
                top: `${tooltipPos.y}px`,
              }}
            >
              <div className="font-semibold text-emerald-300 flex items-center justify-between border-b border-white/10 pb-1">
                <span>{hoveredPoint.formattedDate}</span>
                <span className="text-[10px] text-slate-300 font-normal">{hoveredPoint.date.getFullYear()}</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-300">Total:</span>
                <span className="font-bold text-white tabular-nums">{hoveredPoint.count}</span>
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-300">
                <span>Remotas:</span>
                <span className="tabular-nums text-emerald-400 font-semibold">{hoveredPoint.remoteCount}</span>
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-300">
                <span>Presenciais:</span>
                <span className="tabular-nums text-blue-300 font-semibold">{hoveredPoint.inPersonCount}</span>
              </div>
            </div>
          )}
        </div>
      </SubtlePanel>

      {/* Audit Trail List of Digitally Validated Returns */}
      <div className="space-y-3 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#172B2A] dark:text-white flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#16845B]" />
              Registros com Validação Criptográfica e Assinatura
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Objetos cuja quitação foi formalizada via termo digital nos registros do sistema
            </p>
          </div>

          {/* Search bar inside chart */}
          <div className="w-full sm:w-64">
            <UIInput
              type="text"
              leftIcon={<Search className="w-4 h-4" />}
              placeholder="Buscar por objeto ou recebedor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Table / List */}
        {filteredAuditItems.length === 0 ? (
          <EmptyState
            icon={<Info className="w-6 h-6" />}
            title="Nenhuma devolução encontrada"
            description="Nenhuma devolução validada digitalmente encontrada com os filtros selecionados."
          />
        ) : (
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-[#111827]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8FAFC] dark:bg-slate-900 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">Objeto</th>
                    <th className="py-2.5 px-4">Categoria</th>
                    <th className="py-2.5 px-4">Recebedor</th>
                    <th className="py-2.5 px-4">Modalidade</th>
                    <th className="py-2.5 px-4">Atestação</th>
                    <th className="py-2.5 px-4">Cód. Validação</th>
                    <th className="py-2.5 px-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredAuditItems.map((item) => {
                    const isRemote =
                      item.recipientSignatureType === "REMOTE_EMAIL" ||
                      item.recipientSignatureType === "PRE_VERIFIED" ||
                      (Boolean(item.signatureTokenUsed) && !item.recipientSignatureType);
                    const isStaffSigned = item.staffSignatureStatus === "SIGNED";

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3 px-4 font-semibold text-[#172B2A] dark:text-white">
                          <div className="flex items-center gap-2">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.title}
                                className="w-7 h-7 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-lg bg-[#EBF5F0] dark:bg-emerald-950/40 text-[#16845B] dark:text-emerald-400 flex items-center justify-center font-bold text-[10px]">
                                {item.title.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span className="truncate max-w-[160px] sm:max-w-[220px]" title={item.title}>
                              {item.title}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                            {item.category}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                          <div className="font-medium text-[#172B2A] dark:text-white">
                            {item.recipientName || "Não registrado"}
                          </div>
                          {item.recipientBond && (
                            <div className="text-[10px] text-slate-400">{item.recipientBond}</div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {isRemote ? (
                            <UIBadge tone="emerald">
                              <Mail className="w-3 h-3" /> Remota
                            </UIBadge>
                          ) : (
                            <UIBadge tone="blue">
                              <Smartphone className="w-3 h-3" /> Presencial
                            </UIBadge>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {isStaffSigned ? (
                            <UIBadge tone="emerald">Dupla Assinatura</UIBadge>
                          ) : (
                            <UIBadge tone="amber">Atestação Pendente</UIBadge>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {item.receiptValidationCode || "Validado"}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {onSelectItem && (
                            <UIButton
                              variant="ghost"
                              size="sm"
                              onClick={() => onSelectItem(item)}
                              className="text-[#16845B] dark:text-emerald-400 hover:bg-[#EBF5F0] dark:hover:bg-[#16845B]/20"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Ver</span>
                            </UIButton>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </SurfaceCard>
  );
}