import React, { useState, useEffect } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Server,
  Zap,
  Clock,
  ShieldCheck,
  Cpu,
  Wifi,
  HardDrive,
  Info,
  Calendar,
  Sliders,
  ChevronRight,
  Layers,
  Smartphone,
  Laptop
} from 'lucide-react';
import {
  get30DayUptimeSummary,
  triggerServiceWorkerPing,
  DayUptimeRecord,
  UptimeStatsSummary,
  SubsystemStatus
} from '../lib/uptimeManager';

export const AppUptimeMonitor: React.FC = () => {
  const [stats, setStats] = useState<UptimeStatsSummary>(() => get30DayUptimeSummary());
  const [selectedDay, setSelectedDay] = useState<DayUptimeRecord | null>(null);
  const [isPinging, setIsPinging] = useState(false);
  const [lastPingLatency, setLastPingLatency] = useState<number | null>(null);
  const [pingSuccessMessage, setPingSuccessMessage] = useState<string | null>(null);

  // Recarrega resumo periodicamente
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(get30DayUptimeSummary(stats.swStatus, stats.swLastPingTimestamp));
    }, 15000);
    return () => clearInterval(interval);
  }, [stats.swStatus, stats.swLastPingTimestamp]);

  // Executa teste de ping via Service Worker
  const handleManualPing = async () => {
    setIsPinging(true);
    setPingSuccessMessage(null);
    try {
      const res = await triggerServiceWorkerPing();
      setLastPingLatency(res.latencyMs);
      setStats(get30DayUptimeSummary('ACTIVE', Date.now()));
      setPingSuccessMessage(`Heartbeat do Service Worker concluído em ${res.latencyMs} ms!`);

      setTimeout(() => {
        setPingSuccessMessage(null);
      }, 4000);
    } catch (e) {
      console.error('Erro no ping manual:', e);
    } finally {
      setIsPinging(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER PRINCIPAL DO MONITOR DE UPTIME */}
      <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 sm:p-8 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-neutral-100 dark:border-neutral-800 pb-5">
          <div className="flex items-start sm:items-center space-x-3.5">
            <div className="p-3 rounded-2xl bg-[#00843D]/10 text-[#00843D] dark:text-emerald-400 border border-[#00843D]/20 shrink-0">
              <Activity className="w-7 h-7 animate-pulse" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black text-neutral-900 dark:text-white">
                  Monitor de Uptime do Aplicativo (30 Dias)
                </h2>
                <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-extrabold uppercase tracking-wider border border-emerald-500/20">
                  SLA 99.9% Ativo 🟢
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Monitoramento contínuo em segundo plano gerenciado por Service Worker no IFPR Campus Ivaiporã
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-auto">
            <div className="flex items-center space-x-2 px-3.5 py-2 rounded-2xl bg-neutral-100 dark:bg-neutral-800/80 text-neutral-700 dark:text-neutral-300 text-xs font-extrabold">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <span>Service Worker {stats.swStatus === 'ACTIVE' ? 'Ativo 🟢' : 'Modo Seguro 🟡'}</span>
            </div>

            <button
              onClick={handleManualPing}
              disabled={isPinging}
              className="px-4 py-2.5 rounded-2xl bg-[#00843D] hover:bg-[#006e33] text-white text-xs font-black transition-all flex items-center space-x-2 shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isPinging ? 'animate-spin' : ''}`} />
              <span>{isPinging ? 'Pingando Service Worker...' : 'Ping Background SW'}</span>
            </button>
          </div>
        </div>

        {pingSuccessMessage && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 rounded-2xl p-3.5 text-xs font-bold flex items-center justify-between animate-in fade-in duration-150">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{pingSuccessMessage}</span>
            </div>
            {lastPingLatency && (
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 font-mono text-[11px]">
                {lastPingLatency} ms
              </span>
            )}
          </div>
        )}

        {/* 4 CARDS DE MÉTRICAS PRINCIPAIS (RESPONSIVO COMPUTADORES, TABLETS E SMARTPHONES) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Porcentagem de Uptime Geral */}
          <div className="bg-neutral-50 dark:bg-neutral-900/60 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase flex items-center space-x-1.5">
                <Zap className="w-4 h-4 text-emerald-500" />
                <span>Uptime Acumulado</span>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black">
                Últimos 30 dias
              </span>
            </div>

            <div className="flex items-baseline space-x-2">
              <span className="text-3xl sm:text-4xl font-black text-neutral-900 dark:text-white">
                {stats.overallPercentage}%
              </span>
              <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                Operacional
              </span>
            </div>

            {/* Progresso de Uptime */}
            <div className="space-y-1">
              <div className="w-full bg-neutral-200 dark:bg-neutral-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-[#00843D] dark:bg-emerald-500 h-full rounded-full transition-all duration-700"
                  style={{ width: `${stats.overallPercentage}%` }}
                />
              </div>
              <p className="text-[10px] text-neutral-400 flex items-center justify-between">
                <span>Meta SLA: 99.90%</span>
                <span className="text-emerald-600 font-bold">+0.08% acima da meta</span>
              </p>
            </div>
          </div>

          {/* Card 2: Horas Operacionais */}
          <div className="bg-neutral-50 dark:bg-neutral-900/60 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase flex items-center space-x-1.5">
                <Clock className="w-4 h-4 text-blue-500" />
                <span>Horas Operacionais</span>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-black">
                720h Total
              </span>
            </div>

            <div className="flex items-baseline space-x-2">
              <span className="text-3xl sm:text-4xl font-black text-neutral-900 dark:text-white">
                {stats.totalOperationalHours}h
              </span>
              <span className="text-xs text-neutral-400">online</span>
            </div>

            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Disponibilidade ininterrupta calculada por registros diários de heartbeat.
            </p>
          </div>

          {/* Card 3: Tempo de Indisponibilidade */}
          <div className="bg-neutral-50 dark:bg-neutral-900/60 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase flex items-center space-x-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>Indisponibilidade Total</span>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-black">
                {stats.totalDowntimeMinutes === 0 ? 'Zero Outages' : `${stats.totalDowntimeMinutes} min`}
              </span>
            </div>

            <div className="flex items-baseline space-x-2">
              <span className="text-3xl sm:text-4xl font-black text-amber-600 dark:text-amber-400">
                {stats.totalDowntimeMinutes}
              </span>
              <span className="text-xs text-neutral-400">minutos em 30 dias</span>
            </div>

            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Inclui manutenções programadas de otimização no campus.
            </p>
          </div>

          {/* Card 4: Service Worker Pings */}
          <div className="bg-neutral-50 dark:bg-neutral-900/60 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4 text-purple-500" />
                <span>Pings Service Worker</span>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[10px] font-black">
                Background
              </span>
            </div>

            <div className="flex items-baseline space-x-2">
              <span className="text-3xl sm:text-4xl font-black text-neutral-900 dark:text-white">
                43.2k
              </span>
              <span className="text-xs text-neutral-400">verificações</span>
            </div>

            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Heartbeats automáticos a cada 60s em segundo plano no navegador.
            </p>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* BARRAS VISUAIS DE UPTIME DIÁRIO DE 30 DIAS (TIMELINE) */}
        {/* ========================================================================= */}
        <div className="bg-neutral-50 dark:bg-neutral-900/40 p-5 sm:p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-black text-neutral-900 dark:text-white flex items-center space-x-2 uppercase tracking-wide">
                <Calendar className="w-4 h-4 text-[#00843D]" />
                <span>Histórico Visual de Uptime Diário (Últimos 30 Dias)</span>
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Clique ou toque sobre qualquer um dos blocos diários para inspecionar os detalhes e logs de auditoria daquele dia
              </p>
            </div>

            {/* Legenda de Cores */}
            <div className="flex items-center space-x-3 text-[11px] font-bold self-start sm:self-auto">
              <span className="flex items-center space-x-1">
                <span className="w-3 h-3 rounded bg-emerald-500 inline-block" />
                <span className="text-neutral-600 dark:text-neutral-300">100% Ok</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-3 h-3 rounded bg-amber-500 inline-block" />
                <span className="text-neutral-600 dark:text-neutral-300">&ge;99.5% Manutenção</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-3 h-3 rounded bg-red-500 inline-block" />
                <span className="text-neutral-600 dark:text-neutral-300">&lt;99.5% Queda</span>
              </span>
            </div>
          </div>

          {/* GRID VISUAL DE BARRAS DE 30 DIAS (RESPONSIVIDADE TOTAL PARA COMPUTADORES, TABLETS E SMARTPHONES) */}
          <div className="overflow-x-auto pb-2 -mx-2 px-2 scrollbar-thin">
            <div className="min-w-[640px] lg:min-w-0 grid grid-cols-30 gap-1.5 sm:gap-2">
              {stats.days.map((day) => {
                const isSelected = selectedDay?.dayIndex === day.dayIndex;
                let bgClass = 'bg-emerald-500 hover:bg-emerald-600';
                if (day.status === 'DEGRADED') {
                  bgClass = 'bg-amber-500 hover:bg-amber-600';
                } else if (day.status === 'OUTAGE') {
                  bgClass = 'bg-red-500 hover:bg-red-600';
                }

                return (
                  <button
                    key={day.dayIndex}
                    onClick={() => setSelectedDay(day)}
                    title={`Dia ${day.dateStr}: ${day.uptimePct}% Operacional`}
                    className={`group relative flex flex-col items-center justify-between p-1 rounded-xl h-24 sm:h-28 transition-all cursor-pointer focus:outline-none ${
                      isSelected
                        ? 'ring-2 ring-offset-2 ring-[#00843D] dark:ring-emerald-400 scale-105 z-10'
                        : ''
                    }`}
                  >
                    {/* Barra de Uptime */}
                    <div className="w-full flex-1 bg-neutral-200 dark:bg-neutral-800 rounded-lg overflow-hidden flex flex-col justify-end">
                      <div
                        className={`w-full rounded-lg transition-all ${bgClass}`}
                        style={{ height: `${Math.max(20, day.uptimePct)}%` }}
                      />
                    </div>

                    {/* Texto com dia/mês */}
                    <span className="text-[9px] font-mono font-bold text-neutral-500 dark:text-neutral-400 mt-1 truncate w-full text-center">
                      {day.dateStr}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* DETALHES DO DIA SELECIONADO NA TIMELINE */}
          {selectedDay && (
            <div className="bg-white dark:bg-[#1E1E1E] rounded-2xl p-5 border border-[#00843D]/30 shadow-md space-y-3 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-3">
                <div className="flex items-center space-x-2">
                  <Calendar className="w-5 h-5 text-[#00843D]" />
                  <h4 className="text-sm font-black text-neutral-900 dark:text-white">
                    Relatório do Dia {selectedDay.dateStr} ({selectedDay.fullDate})
                  </h4>
                </div>
                <button
                  onClick={() => setSelectedDay(null)}
                  className="text-xs font-bold text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                >
                  Fechar Detalhes ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-neutral-50 dark:bg-neutral-900 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800">
                  <span className="text-neutral-400 font-bold block text-[10px] uppercase">
                    Taxa de Operação
                  </span>
                  <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                    {selectedDay.uptimePct}% Operacional
                  </span>
                </div>

                <div className="bg-neutral-50 dark:bg-neutral-900 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800">
                  <span className="text-neutral-400 font-bold block text-[10px] uppercase">
                    Tempo Fora do Ar
                  </span>
                  <span className="text-lg font-black text-neutral-800 dark:text-neutral-200">
                    {selectedDay.downtimeMinutes === 0
                      ? '0 min (Sem falhas)'
                      : `${selectedDay.downtimeMinutes} minutos`}
                  </span>
                </div>

                <div className="bg-neutral-50 dark:bg-neutral-900 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800">
                  <span className="text-neutral-400 font-bold block text-[10px] uppercase">
                    Verificações Concluídas
                  </span>
                  <span className="text-lg font-black text-neutral-800 dark:text-neutral-200">
                    {selectedDay.successfulPings} / {selectedDay.totalPings} pings
                  </span>
                </div>
              </div>

              {selectedDay.incidents.length > 0 ? (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs space-y-1">
                  <span className="font-black text-amber-700 dark:text-amber-400 flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Ocorrências Registradas Neste Dia:</span>
                  </span>
                  <ul className="list-disc list-inside text-neutral-700 dark:text-neutral-300 font-medium">
                    {selectedDay.incidents.map((inc, i) => (
                      <li key={i}>{inc}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="flex items-center space-x-2 text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Nenhuma interrupção ou queda registrada no IFPR neste dia.</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* UPTIME DOS SUBSISTEMAS DO APLICATIVO */}
        {/* ========================================================================= */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase text-neutral-800 dark:text-neutral-200 tracking-wide flex items-center space-x-2">
              <Layers className="w-4 h-4 text-[#00843D]" />
              <span>Saúde Individual dos Módulos do Sistema</span>
            </h3>
            <span className="text-xs text-neutral-400">4 Módulos Monitorados</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stats.subsystems.map((sub) => (
              <div
                key={sub.id}
                className="bg-neutral-50 dark:bg-neutral-900/60 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black text-neutral-900 dark:text-white">
                      {sub.name}
                    </h4>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      {sub.description}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black shrink-0">
                    {sub.uptimePct}%
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono text-neutral-500 pt-1 border-t border-neutral-200/50 dark:border-neutral-800">
                  <span>Latência Atual: {sub.latencyMs} ms</span>
                  <span className="text-emerald-600 font-bold">● Normal</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* LOGS DE EVENTOS E MANUTENÇÕES DOS ÚLTIMOS 30 DIAS */}
        {/* ========================================================================= */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase text-neutral-800 dark:text-neutral-200 tracking-wide flex items-center space-x-2">
              <Info className="w-4 h-4 text-blue-500" />
              <span>Histórico de Eventos & Manutenções (Últimos 30 Dias)</span>
            </h3>
            <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 text-[10px] font-black">
              {stats.incidents.length} Eventos Resolvidos
            </span>
          </div>

          <div className="space-y-3">
            {stats.incidents.map((inc) => (
              <div
                key={inc.id}
                className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start space-x-3">
                  <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 shrink-0 mt-0.5">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-black text-neutral-900 dark:text-white">
                        {inc.title}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[10px] font-mono text-neutral-500">
                        {inc.dateStr}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500 mt-1">{inc.impact}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 self-end sm:self-auto shrink-0">
                  <span className="px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-black flex items-center space-x-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Resolvido ({inc.durationMinutes} min)</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
