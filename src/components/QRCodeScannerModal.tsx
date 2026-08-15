import React, { useState, useRef, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { LostFoundItem } from "../types";
import { triggerVibration, vibrateClick, vibrateSuccess, vibrateWarning, safeToLower, safeIncludes, sanitizeQuery } from "../lib/utils";
import { QrCode, X, Search, CheckCircle2, ShieldCheck, AlertCircle, Camera, CameraOff, RefreshCw, Eye, Lock } from "lucide-react";
import { RestrictedQRViewModal } from "./RestrictedQRViewModal";

export const QRCodeScannerModal: React.FC = () => {
  const { qrScannerOpen, setQrScannerOpen, items, updateItemStatus, addToast } = useApp();
  const [scannedCode, setScannedCode] = useState("");
  const [foundItem, setFoundItem] = useState<LostFoundItem | null>(null);
  const [showRestrictedModal, setShowRestrictedModal] = useState<LostFoundItem | null>(null);

  // Camera Permission & Streaming State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraPermissionStatus, setCameraPermissionStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Cleanup camera stream when modal closes
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (!qrScannerOpen) {
      stopCamera();
    }
  }, [qrScannerOpen]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    vibrateClick();
    setCameraPermissionStatus("requesting");
    setCameraError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Seu navegador ou ambiente não suporta acesso direto à câmera.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraActive(true);
      setCameraPermissionStatus("granted");
      vibrateSuccess();
      addToast("Permissão de câmera concedida! Leitor ativado.", "success");
    } catch (err: any) {
      console.error("Erro ao solicitar acesso à câmera:", err);
      setCameraActive(false);
      setCameraPermissionStatus("denied");
      vibrateWarning();

      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setCameraError("Permissão de câmera negada pelo usuário ou pelo navegador. Permita o acesso nas configurações do site para usar o scanner.");
        addToast("Permissão de câmera negada. Habilite a câmera para utilizar o leitor óptico.", "error");
      } else {
        setCameraError("Não foi possível acessar a câmera. Verifique se o dispositivo possui câmera disponível.");
        addToast("Não foi possível iniciar a câmera.", "error");
      }
    }
  };

  if (!qrScannerOpen) return null;

  const handleScanOrSearch = (codeToSearch: string) => {
    vibrateClick();
    const query = sanitizeQuery(codeToSearch);
    if (!query) {
      vibrateWarning();
      addToast("Digite ou escaneie um código válido.", "info");
      return;
    }

    const item = (items || []).find(
      (it) =>
        it &&
        (safeIncludes(it.qrCodeId, query) ||
          safeToLower(it.id, "QRCodeScannerModal.tsx -> it.id") === safeToLower(query, "QRCodeScannerModal.tsx -> query") ||
          safeIncludes(it.title, query))
    );

    if (item) {
      vibrateSuccess();
      setFoundItem(item);
      addToast(`QR Code identificado: Objeto "${item.title}"`, "success");
    } else {
      vibrateWarning();
      setFoundItem(null);
      addToast("Nenhum objeto encontrado com este código QR.", "error");
    }
  };

  const handleQuickSelectPreset = (item: LostFoundItem) => {
    vibrateClick();
    setScannedCode(item.qrCodeId);
    setFoundItem(item);
  };

  const handleConfirmReturn = () => {
    if (!foundItem) return;
    vibrateSuccess();
    updateItemStatus(foundItem.id, "DEVOLVIDO");
    addToast(`Objeto "${foundItem.title}" baixado como Devolvido!`, "success");
    setFoundItem(null);
    stopCamera();
    setQrScannerOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-scanner-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
    >
      <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 max-w-lg w-full border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 id="qr-scanner-title" className="font-bold text-base text-neutral-900 dark:text-white">
                Scanner de QR Code IFPR Campus Ivaiporã
              </h3>
              <p className="text-[11px] text-neutral-500">
                Leitor óptico de etiquetas digitais para devolução ágil
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              vibrateClick();
              stopCamera();
              setQrScannerOpen(false);
            }}
            role="button"
            aria-label="Fechar scanner de QR Code"
            className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera Feed / Permission Request Section */}
        <div className="space-y-3">
          <div className="relative h-56 rounded-2xl bg-neutral-900 overflow-hidden border-2 border-dashed border-[#00843D] flex flex-col items-center justify-center p-2 text-center">
            {/* Live Camera Video Feed */}
            <video
              ref={videoRef}
              playsInline
              muted
              className={`absolute inset-0 w-full h-full object-cover ${cameraActive ? "block" : "hidden"}`}
            />

            {/* Scanning Line Overlay when active */}
            {cameraActive && (
              <div className="absolute inset-x-6 top-1/2 h-0.5 bg-green-400 animate-pulse shadow-[0_0_12px_#22c55e] z-10" />
            )}

            {/* Inactive or Permission Request View */}
            {!cameraActive && (
              <div className="relative z-10 flex flex-col items-center p-4 space-y-3 max-w-xs">
                <div className="w-12 h-12 rounded-2xl bg-[#00843D]/20 text-[#00843D] dark:text-green-400 flex items-center justify-center">
                  <Camera className="w-6 h-6" />
                </div>

                {cameraPermissionStatus === "denied" ? (
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-red-400 flex items-center justify-center gap-1">
                      <AlertCircle className="w-4 h-4" /> Acesso à câmera bloqueado
                    </p>
                    <p className="text-[10px] text-neutral-400 leading-tight">
                      {cameraError}
                    </p>
                  </div>
                ) : cameraPermissionStatus === "requesting" ? (
                  <p className="text-xs font-bold text-amber-300 animate-pulse">
                    Solicitando permissão de acesso à câmera... Por favor, aceite o prompt do seu navegador.
                  </p>
                ) : (
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-white block">
                      Acesso à Câmera Requerido
                    </span>
                    <span className="text-[10px] text-neutral-400 block">
                      Clique no botão abaixo para autorizar o uso da câmera do dispositivo para escancear a etiqueta QR.
                    </span>
                  </div>
                )}

                <button
                  onClick={startCamera}
                  disabled={cameraPermissionStatus === "requesting"}
                  className="px-4 py-2 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white font-extrabold text-xs shadow-md transition-all flex items-center space-x-1.5"
                >
                  <Camera className="w-4 h-4" />
                  <span>
                    {cameraPermissionStatus === "requesting"
                      ? "Aguardando Permissão..."
                      : "Solicitar Permissão e Iniciar Câmera"}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Camera Controls Bar */}
          {cameraActive && (
            <div className="flex items-center justify-between text-xs px-1">
              <span className="text-emerald-500 font-bold flex items-center gap-1 text-[11px]">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" /> Câmera Ativa • Transmissão em Tempo Real
              </span>

              <button
                onClick={stopCamera}
                className="text-neutral-500 hover:text-red-500 text-[11px] font-bold underline flex items-center gap-1"
              >
                <CameraOff className="w-3.5 h-3.5" /> Desligar Câmera
              </button>
            </div>
          )}
        </div>

        {/* Manual Code Input fallback */}
        <div className="space-y-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-200">
            Digite ou cole o Código da Etiqueta QR:
          </label>
          <div className="flex space-x-2">
            <input
              type="text"
              value={scannedCode}
              onChange={(e) => setScannedCode(e?.target?.value ?? "")}
              placeholder="Ex: QR-IFPR-101-GARRAFA ou ifpr-101"
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white outline-none"
            />
            <button
              onClick={() => handleScanOrSearch(scannedCode)}
              className="px-4 py-2.5 rounded-xl bg-[#00843D] text-white font-bold text-xs"
            >
              Validar Code
            </button>
          </div>
        </div>

        {/* Preset quick test buttons */}
        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-neutral-500 block">
            Testar etiquetas ativas no acervo do campus:
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
                className="w-12 h-12 rounded-xl object-cover border border-neutral-200"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[#00843D] dark:text-green-400 uppercase">
                    {foundItem.status}
                  </span>
                  <span className="text-[10px] text-amber-600 font-bold flex items-center gap-0.5">
                    <Lock className="w-3 h-3" /> Visualização Protegida
                  </span>
                </div>
                <h4 className="font-bold text-xs text-neutral-900 dark:text-white">
                  {foundItem.title}
                </h4>
                <p className="text-[11px] text-neutral-500 truncate max-w-[240px]">
                  Local: {foundItem.location}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={() => setShowRestrictedModal(foundItem)}
                className="w-full py-2.5 rounded-xl bg-neutral-900 text-white font-bold text-xs shadow-xs flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <Eye className="w-4 h-4 text-emerald-400" />
                <span>Ver Dados Públicos (QR)</span>
              </button>

              <button
                onClick={handleConfirmReturn}
                className="w-full py-2.5 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white font-extrabold text-xs shadow-md flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirmar Entrega</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {showRestrictedModal && (
        <RestrictedQRViewModal
          item={showRestrictedModal}
          onClose={() => setShowRestrictedModal(null)}
        />
      )}
    </div>
  );
};
