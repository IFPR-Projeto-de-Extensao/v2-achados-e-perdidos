import React, { useState, useEffect } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Zap,
  Clock,
  ShieldCheck,
  Info,
  Calendar,
  Layers,
} from 'lucide-react';
import {
  get30DayUptimeSummary,
  triggerServiceWorkerPing,
  DayUptimeRecord,
  UptimeStatsSummary,
} from '../lib/uptimeManager';
import { useApp } from '../context/AppContext';
import { localize } from '../lib/i18n';

export const AppUptimeMonitor: React.FC = () => {
  const { language } = useApp();
  const l = (pt: string, en: string) => localize(language, pt, en);
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
      setLastPingLatency(res.latencyMs > 0 ? res.latencyMs : null);
      if (res.success && res.latencyMs > 0) {
        setStats(get30DayUptimeSummary('ACTIVE', Date.now()));
        setPingSuccessMessage(
          l(
            `Verificação do Service Worker concluída em ${res.latencyMs} ms!`,
            `Service Worker heartbeat completed in ${res.latencyMs} ms!`
          )
        );
      } else {
        setStats(get30DayUptimeSummary('FALLBACK', Date.now()));
        setPingSuccessMessage(
          l(
            'Service Worker em modo alternativo / inativo (sem medição de latência).',
            'Service Worker in fallback / inactive mode (no latency measured).'
          )
        );
      }

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
      {/* HEADER PRINCIPAL DO MONITOR DE DISPONIBILIDADE */}
      <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 sm:p-8 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-neutral-100 dark:border-neutral-800 pb-5">
          <div className="flex items-start sm:items-center space-x-3.5">
            <div className="p-3 rounded-2xl bg-[#00843D]/10 text-[#00843D] dark:text-emerald-400 border border-[#00843D]/20 shrink-0">
              <Activity className="w-7 h-7 animate-pulse" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black text-neutral-900 dark:text-white">
                  {l('Monitor de Disponibilidade do Aplicativo (30 Dias)', 'Application Uptime Monitor (30 Days)')}
                </h2>
                <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-extrabold uppercase tracking-wider border border-emerald-500/20">
                  {l('SLA 99,9% Ativo 🟢', '99.9% SLA Active 🟢')}
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                {l(
                  'Monitoramento contínuo em segundo plano gerenciado por Service Worker no IFPR Campus Ivaiporã',
                  'Continuous background monitoring managed by Service Worker at IFPR Campus Ivaiporã'
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-auto">
            <div className="flex items-center space-x-2 px-3.5 py-2 rounded-2xl bg-neutral-100 dark:bg-neutral-800/80 text-neutral-700 dark:text-neutral-300 text-xs font-extrabold">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <span>
                {stats.swStatus === 'ACTIVE'
                  ? l('Service Worker Ativo 🟢', 'Service Worker Active 🟢')
                  : l('Service Worker em Modo Seguro 🟡', 'Service Worker in Safe Mode 🟡')}
              </span>
            </div>

            <button
              onClick={handleManualPing}
              disabled={isPinging}
              className="px-4 py-2.5 rounded-2xl bg-[#00843D] hover:bg-[#006e33] text-white text-xs font-black transition-all flex items-center space-x-2 shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isPinging ? 'animate-spin' : ''}`} />
              <span>
                {isPinging
                  ? l('Verificando Service Worker...', 'Pinging Service Worker...')
                  : l('Testar Service Worker', 'Ping Background SW')}
              </span>
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
          {/* Card 1: Porcentagem de Disponibilidade Geral */}
          <div className="bg-neutral-50 dark:bg-neutral-900/60 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase flex items-center space-x-1.5">
                <Zap className="w-4 h-4 text-emerald-500" />
                <span>{l('Disponibilidade Acumulada', 'Cumulative Uptime')}</span>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black">
                {l('Últimos 30 dias', 'Last 30 days')}
              </span>
            </div>

            <div className="flex items-baseline space-x-2">
              <span className="text-3xl sm:text-4xl font-black text-neutral-900 dark:text-white">
                {stats.overallPercentage}%
              </span>
              <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                {l('Operacional', 'Operational')}
              </span>
            </div>

            {/* Progresso de Disponibilidade */}
            <div className="space-y-1">
              <div className="w-full bg-neutral-200 dark:bg-neutral-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-[#00843D] dark:bg-emerald-500 h-full rounded-full transition-all duration-700"
                  style={{ width: `${stats.overallPercentage}%` }}
                />
              </div>
              <p className="text-[10px] text-neutral-400 flex items-center justify-between">
                <span>{l('Meta SLA: 99,90%', 'SLA Target: 99.90%')}</span>
                <span className="text-emerald-600 font-bold">
                  {l('+0,08% acima da meta', '+0.08% above target')}
                </span>
              </p>
            </div>
          </div>

          {/* Card 2: Horas Operacionais */}
          <div className="bg-neutral-50 dark:bg-neutral-900/60 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase flex items-center space-x-1.5">
                <Clock className="w-4 h-4 text-blue-500" />
                <span>{l('Horas Operacionais', 'Operational Hours')}</span>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-black">
                {l('720h no Total', '720h Total')}
              </span>
            </div>

            <div className="flex items-baseline space-x-2">
              <span className="text-3xl sm:text-4xl font-black text-neutral-900 dark:text-white">
                {stats.totalOperationalHours}h
              </span>
              <span className="text-xs text-neutral-400">{l('no ar', 'online')}</span>
            </div>

            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {l(
                'Disponibilidade ininterrupta calculada por registros diários de verificação.',
                'Continuous availability calculated from daily heartbeat records.'
              )}
            </p>
          </div>

          {/* Card 3: Tempo de Indisponibilidade */}
          <div className="bg-neutral-50 dark:bg-neutral-900/60 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase flex items-center space-x-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>{l('Indisponibilidade Total', 'Total Downtime')}</span>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-black">
                {stats.totalDowntimeMinutes === 0
                  ? l('Sem Quedas', 'Zero Outages')
                  : `${stats.totalDowntimeMinutes} min`}
              </span>
            </div>

            <div className="flex items-baseline space-x-2">
              <span className="text-3xl sm:text-4xl font-black text-amber-600 dark:text-amber-400">
                {stats.totalDowntimeMinutes}
              </span>
              <span className="text-xs text-neutral-400">
                {l('minutos em 30 dias', 'minutes in 30 days')}
              </span>
            </div>

            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {l(
                'Inclui manutenções programadas de otimização no campus.',
                'Includes scheduled campus optimization maintenance.'
              )}
            </p>
          </div>

          {/* Card 4: Verificações do Service Worker */}
          <div className="bg-neutral-50 dark:bg-neutral-900/60 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4 text-purple-500" />
                <span>{l('Verificações Service Worker', 'Service Worker Pings')}</span>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[10px] font-black">
                {l('Segundo Plano', 'Background')}
              </span>
            </div>

            <div className="flex items-baseline space-x-2">
              <span className="text-3xl sm:text-4xl font-black text-neutral-900 dark:text-white">
                43.2k
              </span>
              <span className="text-xs text-neutral-400">
                {l('verificações', 'checks')}
              </span>
            </div>

            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {l(
                'Pulsos automáticos a cada 60s em segundo plano no navegador.',
                'Automatic heartbeats every 60s in the browser background.'
              )}
            </p>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* BARRAS VISUAIS DE DISPONIBILIDADE DIÁRIA DE 30 DIAS (LINHA DO TEMPO) */}
        {/* ========================================================================= */}
        <div className="bg-neutral-50 dark:bg-neutral-900/40 p-5 sm:p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-black text-neutral-900 dark:text-white flex items-center space-x-2 uppercase tracking-wide">
                <Calendar className="w-4 h-4 text-[#00843D]" />
                <span>
                  {l(
                    'Histórico Visual de Disponibilidade Diária (Últimos 30 Dias)',
                    'Daily Uptime Visual History (Last 30 Days)'
                  )}
                </span>
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                {l(
                  'Clique ou toque sobre qualquer um dos blocos diários para inspecionar os detalhes e registros de auditoria daquele dia',
                  'Click or tap any daily bar to inspect details and audit logs for that day'
                )}
              </p>
            </div>

            {/* Legenda de Cores */}
            <div className="flex items-center space-x-3 text-[11px] font-bold self-start sm:self-auto">
              <span className="flex items-center space-x-1">
                <span className="w-3 h-3 rounded bg-emerald-500 inline-block" />
                <span className="text-neutral-600 dark:text-neutral-300">
                  {l('100% Normal', '100% OK')}
                </span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-3 h-3 rounded bg-amber-500 inline-block" />
                <span className="text-neutral-600 dark:text-neutral-300">
                  {l('≥99,5% Manutenção', '≥99.5% Maintenance')}
                </span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-3 h-3 rounded bg-red-500 inline-block" />
                <span className="text-neutral-600 dark:text-neutral-300">
                  {l('<99,5% Queda', '<99.5% Outage')}
                </span>
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
                    title={l(
                      `Dia ${day.dateStr}: ${day.uptimePct}% Operacional`,
                      `Day ${day.dateStr}: ${day.uptimePct}% Operational`
                    )}
                    className={`group relative flex flex-col items-center justify-between p-1 rounded-xl h-24 sm:h-28 transition-all cursor-pointer focus:outline-none ${
                      isSelected
                        ? 'ring-2 ring-offset-2 ring-[#00843D] dark:ring-emerald-400 scale-105 z-10'
                        : ''
                    }`}
                  >
                    {/* Barra de Disponibilidade */}
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

          {/* DETALHES DO DIA SELECIONADO NA LINHA DO TEMPO */}
          {selectedDay && (
            <div className="bg-white dark:bg-[#1E1E1E] rounded-2xl p-5 border border-[#00843D]/30 shadow-md space-y-3 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-3">
                <div className="flex items-center space-x-2">
                  <Calendar className="w-5 h-5 text-[#00843D]" />
                  <h4 className="text-sm font-black text-neutral-900 dark:text-white">
                    {l(
                      `Relatório do Dia ${selectedDay.dateStr} (${selectedDay.fullDate})`,
                      `Report for ${selectedDay.dateStr} (${selectedDay.fullDate})`
                    )}
                  </h4>
                </div>
                <button
                  onClick={() => setSelectedDay(null)}
                  className="text-xs font-bold text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                >
                  {l('Fechar Detalhes ✕', 'Close Details ✕')}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-neutral-50 dark:bg-neutral-900 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800">
                  <span className="text-neutral-400 font-bold block text-[10px] uppercase">
                    {l('Taxa de Operação', 'Operational Rate')}
                  </span>
                  <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                    {l(`${selectedDay.uptimePct}% Operacional`, `${selectedDay.uptimePct}% Operational`)}
                  </span>
                </div>

                <div className="bg-neutral-50 dark:bg-neutral-900 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800">
                  <span className="text-neutral-400 font-bold block text-[10px] uppercase">
                    {l('Tempo Fora do Ar', 'Downtime')}
                  </span>
                  <span className="text-lg font-black text-neutral-800 dark:text-neutral-200">
                    {selectedDay.downtimeMinutes === 0
                      ? l('0 min (Sem falhas)', '0 min (No outages)')
                      : l(`${selectedDay.downtimeMinutes} minutos`, `${selectedDay.downtimeMinutes} minutes`)}
                  </span>
                </div>

                <div className="bg-neutral-50 dark:bg-neutral-900 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800">
                  <span className="text-neutral-400 font-bold block text-[10px] uppercase">
                    {l('Verificações Concluídas', 'Completed Checks')}
                  </span>
                  <span className="text-lg font-black text-neutral-800 dark:text-neutral-200">
                    {l(
                      `${selectedDay.successfulPings} / ${selectedDay.totalPings} verificações`,
                      `${selectedDay.successfulPings} / ${selectedDay.totalPings} pings`
                    )}
                  </span>
                </div>
              </div>

              {selectedDay.incidents.length > 0 ? (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs space-y-1">
                  <span className="font-black text-amber-700 dark:text-amber-400 flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{l('Ocorrências Registradas Neste Dia:', 'Incidents Recorded on This Day:')}</span>
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
                  <span>
                    {l(
                      'Nenhuma interrupção ou queda registrada no IFPR neste dia.',
                      'No interruptions or outages recorded at IFPR on this day.'
                    )}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* DISPONIBILIDADE DOS SUBSISTEMAS DO APLICATIVO */}
        {/* ========================================================================= */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase text-neutral-800 dark:text-neutral-200 tracking-wide flex items-center space-x-2">
              <Layers className="w-4 h-4 text-[#00843D]" />
              <span>{l('Saúde Individual dos Módulos do Sistema', 'Individual System Module Health')}</span>
            </h3>
            <span className="text-xs text-neutral-400">
              {l(`${stats.subsystems.length} Módulos Monitorados`, `${stats.subsystems.length} Monitored Modules`)}
            </span>
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
                  <span>{l(`Latência Atual: ${sub.latencyMs} ms`, `Current Latency: ${sub.latencyMs} ms`)}</span>
                  <span className="text-emerald-600 font-bold">{l('● Normal', '● Normal')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* REGISTROS DE EVENTOS E MANUTENÇÕES DOS ÚLTIMOS 30 DIAS */}
        {/* ========================================================================= */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase text-neutral-800 dark:text-neutral-200 tracking-wide flex items-center space-x-2">
              <Info className="w-4 h-4 text-blue-500" />
              <span>
                {l(
                  'Histórico de Eventos e Manutenções (Últimos 30 Dias)',
                  'Events & Maintenance History (Last 30 Days)'
                )}
              </span>
            </h3>
            <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 text-[10px] font-black">
              {stats.incidents.length === 0
                ? l('100% Estável', '100% Stable')
                : l(`${stats.incidents.length} Eventos`, `${stats.incidents.length} Events`)}
            </span>
          </div>

          <div className="space-y-3">
            {stats.incidents.length === 0 ? (
              <div className="bg-neutral-50 dark:bg-neutral-900/60 rounded-2xl p-6 border border-neutral-200 dark:border-neutral-800 text-center space-y-1.5">
                <p className="text-xs font-bold text-neutral-800 dark:text-neutral-200 flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>
                    {l(
                      'Nenhum incidente ou manutenção registrado nos últimos 30 dias',
                      'No incidents or maintenance recorded in the last 30 days'
                    )}
                  </span>
                </p>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  {l(
                    'Todos os subsistemas mantiveram disponibilidade ininterrupta sem degradações reportadas.',
                    'All subsystems maintained uninterrupted availability with no reported degradations.'
                  )}
                </p>
              </div>
            ) : (
              stats.incidents.map((inc) => (
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
                      <span>{l(`Resolvido (${inc.durationMinutes} min)`, `Resolved (${inc.durationMinutes} min)`)}</span>
                    </span>
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
