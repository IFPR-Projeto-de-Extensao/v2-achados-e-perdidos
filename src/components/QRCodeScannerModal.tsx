import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { LostFoundItem } from "../types";
import { QrCode, X, Search, CheckCircle2, ShieldCheck, AlertCircle } from "lucide-react";

export const QRCodeScannerModal: React.FC = () => {
  const { qrScannerOpen, setQrScannerOpen, items, updateItemStatus, addToast } = useApp();
  const [scannedCode, setScannedCode] = useState("");
  const [foundItem, setFoundItem] = useState<LostFoundItem | null>(null);

  if (!qrScannerOpen) return null;

  const handleScanOrSearch = (codeToSearch: string) => {
    const query = codeToSearch.trim().toLowerCase();
    const item = items.find(
      (it) =>
        it.qrCodeId.toLowerCase().includes(query) ||
        it.id.toLowerCase() === query ||
        it.title.toLowerCase().includes(query)
    );

    if (item) {
      setFoundItem(item);
      addToast(`QR Code identificado: Objeto "${item.title}"`, "success");
    } else {
      setFoundItem(null);
      addToast("Nenhum objeto encontrado com este código QR.", "error");
    }
  };

  const handleQuickSelectPreset = (item: LostFoundItem) => {
    setScannedCode(item.qrCodeId);
    setFoundItem(item);
  };

  const handleConfirmReturn = () => {
    if (!foundItem) return;
    updateItemStatus(foundItem.id, "DEVOLVIDO");
    addToast(`Objeto "${foundItem.title}" baixado como Devolvido!`, "success");
    setFoundItem(null);
    setQrScannerOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 max-w-lg w-full border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-neutral-900 dark:text-white">
                Scanner de QR Code IFPR Campus Ivaiporã
              </h3>
              <p className="text-[11px] text-neutral-500">
                Leitor de etiquetas digitais para devolução ágil
              </p>
            </div>
          </div>

          <button
            onClick={() => setQrScannerOpen(false)}
            className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera Scanner Simulation Frame */}
        <div className="relative h-44 rounded-2xl bg-neutral-900 overflow-hidden border-2 border-dashed border-[#00843D] flex flex-col items-center justify-center p-4 text-center">
          <div className="absolute inset-x-8 top-1/2 h-0.5 bg-[#00843D] animate-pulse shadow-[0_0_8px_#00843D]" />
          <QrCode className="w-12 h-12 text-[#00843D] mb-2 animate-bounce opacity-80" />
          <span className="text-xs font-bold text-white">Posicione o QR Code no centro</span>
          <span className="text-[10px] text-neutral-400">Simulação de Leitor Óptico do Campus Ivaiporã</span>
        </div>

        {/* Input fallback / simulator */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-200">
            Ou digite o Código / ID da Etiqueta:
          </label>
          <div className="flex space-x-2">
            <input
              type="text"
              value={scannedCode}
              onChange={(e) => setScannedCode(e.target.value)}
              placeholder="Ex: QR-IFPR-101-GARRAFA ou ifpr-101"
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none"
            />
            <button
              onClick={() => handleScanOrSearch(scannedCode)}
              className="px-4 py-2.5 rounded-xl bg-[#00843D] text-white font-bold text-xs"
            >
              Validar
            </button>
          </div>
        </div>

        {/* Preset quick test buttons */}
        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-neutral-500 block">
            Testar etiquetas ativas no acervo:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {items.slice(0, 4).map((it) => (
              <button
                key={it.id}
                onClick={() => handleQuickSelectPreset(it)}
                className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-[10px] font-mono text-neutral-700 dark:text-neutral-300 hover:bg-[#00843D] hover:text-white transition-colors"
              >
                {it.qrCodeId}
              </button>
            ))}
          </div>
        </div>

        {/* Scanned Result Preview */}
        {foundItem && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
            <div className="flex items-center space-x-3">
              <img
                src={foundItem.imageUrl}
                alt=""
                className="w-12 h-12 rounded-xl object-cover"
              />
              <div>
                <span className="text-[10px] font-bold text-[#00843D] dark:text-green-400 uppercase">
                  {foundItem.status}
                </span>
                <h4 className="font-bold text-xs text-neutral-900 dark:text-white">
                  {foundItem.title}
                </h4>
                <p className="text-[11px] text-neutral-500 truncate max-w-[240px]">
                  Local: {foundItem.location}
                </p>
              </div>
            </div>

            <button
              onClick={handleConfirmReturn}
              className="w-full py-2.5 rounded-xl bg-[#00843D] text-white font-extrabold text-xs shadow-md flex items-center justify-center space-x-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirmar Entrega e Baixar como Devolvido</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
