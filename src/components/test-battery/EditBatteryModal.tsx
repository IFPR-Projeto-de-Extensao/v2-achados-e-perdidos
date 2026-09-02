import React, { useState, useEffect } from "react";
import { X, Edit3, Save, Calendar, Clock, AlertTriangle, ShieldCheck } from "lucide-react";
import { TestBatteryExecution, TestBatteryStatus } from "../../types";
import { vibrateClick, vibrateSuccess, vibrateWarning } from "../../lib/utils";
import { calculateTestDuration } from "../../data/defaultTestBatteryData";

interface EditBatteryModalProps {
  isOpen: boolean;
  onClose: () => void;
  battery: TestBatteryExecution;
  onSaveBattery: (updatedBattery: TestBatteryExecution) => Promise<void>;
  darkMode?: boolean;
}

export const EditBatteryModal: React.FC<EditBatteryModalProps> = ({
  isOpen,
  onClose,
  battery,
  onSaveBattery,
  darkMode,
}) => {
  const [title, setTitle] = useState(battery.title || battery.name || "");
  const [systemVersion, setSystemVersion] = useState(battery.systemVersion || "");
  const [description, setDescription] = useState(battery.description || "");
  const [environment, setEnvironment] = useState<"Desenvolvimento" | "Homologação" | "Produção">(
    battery.environment || "Homologação"
  );
  const [responsible, setResponsible] = useState(battery.responsible || "");
  const [responsibleEmail, setResponsibleEmail] = useState(battery.responsibleEmail || "");
  const [status, setStatus] = useState<TestBatteryStatus>((battery.status as TestBatteryStatus) || (battery.overallStatus as TestBatteryStatus) || "RASCUNHO");
  const [testDate, setTestDate] = useState(battery.testDate || "");
  const [startTime, setStartTime] = useState(battery.startTime || "");
  const [endTime, setEndTime] = useState(battery.endTime || "");
  const [observations, setObservations] = useState(battery.observations || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (battery) {
      setTitle(battery.title || battery.name || "");
      setSystemVersion(battery.systemVersion || "");
      setDescription(battery.description || "");
      setEnvironment(battery.environment || "Homologação");
      setResponsible(battery.responsible || "");
      setResponsibleEmail(battery.responsibleEmail || "");
      setStatus((battery.status as TestBatteryStatus) || (battery.overallStatus as TestBatteryStatus) || "RASCUNHO");
      setTestDate(battery.testDate || "");
      setStartTime(battery.startTime || "");
      setEndTime(battery.endTime || "");
      setObservations(battery.observations || "");
    }
  }, [battery]);

  if (!isOpen) return null;

  const durationStr = calculateTestDuration(startTime, endTime);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !systemVersion.trim() || !responsible.trim()) {
      vibrateWarning();
      return;
    }

    setIsSubmitting(true);
    vibrateClick();

    const nowIso = new Date().toISOString();
    const updated: TestBatteryExecution = {
      ...battery,
      title: title.trim(),
      name: title.trim(),
      systemVersion: systemVersion.trim(),
      description: description.trim(),
      environment,
      responsible: responsible.trim(),
      responsibleEmail: responsibleEmail.trim(),
      status,
      overallStatus: status,
      testDate: testDate.trim(),
      startTime: startTime.trim(),
      endTime: endTime.trim(),
      observations: observations.trim(),
      updatedAt: nowIso,
      auditTrail: [
        {
          id: `audit-edit-battery-${Date.now()}`,
          changedAt: nowIso,
          changedBy: responsible.trim(),
          changedByEmail: responsibleEmail.trim(),
          changeType: "BATTERY_EDITED",
          description: `Parâmetros e metadados da bateria ${battery.id} atualizados (Status: ${status}, Versão: ${systemVersion}).`,
        },
        ...(battery.auditTrail || []),
      ],
    };

    await onSaveBattery(updated);
    setIsSubmitting(false);
    vibrateSuccess();
    onClose();
  };

  return (
    <div
      id="modal-edit-battery"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
    >
      <div
        className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
          darkMode ? "bg-neutral-900 border-neutral-800 text-white" : "bg-white border-neutral-200 text-neutral-900"
        }`}
      >
        <div className="p-5 border-b flex items-center justify-between dark:border-neutral-800 border-neutral-200 bg-emerald-600/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-sm">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">Editar Bateria de Testes</h2>
              <p className="text-xs text-neutral-500 font-mono">Identificador: {battery.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Nome da Bateria */}
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-bold text-neutral-500 uppercase">Nome da Bateria *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Bateria de Testes de Homologação v1.8.4"
                className={`w-full text-xs font-bold px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                  darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                }`}
              />
            </div>

            {/* Versão do Sistema */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-neutral-500 uppercase">Versão do Sistema *</label>
              <input
                type="text"
                required
                value={systemVersion}
                onChange={(e) => setSystemVersion(e.target.value)}
                placeholder="Ex: v1.8.4"
                className={`w-full text-xs font-semibold px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                  darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                }`}
              />
            </div>

            {/* Status da Bateria */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-neutral-500 uppercase">Status da Bateria *</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TestBatteryStatus)}
                className={`w-full text-xs font-bold px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                  darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                }`}
              >
                <option value="RASCUNHO">Rascunho</option>
                <option value="EM_ANDAMENTO">Em andamento</option>
                <option value="CONCLUIDA">Concluída</option>
                <option value="ARQUIVADA">Arquivada</option>
              </select>
            </div>

            {/* Ambiente */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-neutral-500 uppercase">Ambiente *</label>
              <select
                value={environment}
                onChange={(e: any) => setEnvironment(e.target.value)}
                className={`w-full text-xs font-semibold px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                  darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                }`}
              >
                <option value="Desenvolvimento">Desenvolvimento</option>
                <option value="Homologação">Homologação</option>
                <option value="Produção">Produção</option>
              </select>
            </div>

            {/* Data do Teste */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-neutral-500 uppercase">Data de Execução</label>
              <input
                type="date"
                value={testDate}
                onChange={(e) => setTestDate(e.target.value)}
                className={`w-full text-xs font-semibold px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                  darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                }`}
              />
            </div>

            {/* Horários */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-neutral-500 uppercase">Horário de Início</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={`w-full text-xs font-semibold px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                  darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                }`}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-neutral-500 uppercase">Horário de Término</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={`w-full text-xs font-semibold px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                  darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                }`}
              />
            </div>

            {/* Duração calculada */}
            <div className="sm:col-span-2 p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/60 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-500" />
                <span className="font-bold text-neutral-700 dark:text-neutral-300">Duração Calculada:</span>
              </div>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{durationStr}</span>
            </div>

            {/* Responsável */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-neutral-500 uppercase">Responsável *</label>
              <input
                type="text"
                required
                value={responsible}
                onChange={(e) => setResponsible(e.target.value)}
                className={`w-full text-xs font-semibold px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                  darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                }`}
              />
            </div>

            {/* E-mail Responsável */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-neutral-500 uppercase">E-mail do Responsável</label>
              <input
                type="email"
                value={responsibleEmail}
                onChange={(e) => setResponsibleEmail(e.target.value)}
                className={`w-full text-xs font-semibold px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                  darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
                }`}
              />
            </div>
          </div>

          {/* Descrição / Objetivo */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-neutral-500 uppercase">Descrição & Objetivos da Bateria</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o escopo, módulos avaliados e metas desta rodada..."
              className={`w-full text-xs font-medium px-3 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
              }`}
            />
          </div>

          {/* Observações */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-neutral-500 uppercase">Observações Gerais</label>
            <textarea
              rows={2}
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Anotações adicionais, particularidades de infraestrutura ou homologação..."
              className={`w-full text-xs font-medium px-3 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${
                darkMode ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-300 text-neutral-900"
              }`}
            />
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t dark:border-neutral-800 border-neutral-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold rounded-xl border dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              Salvar Alterações
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
