import React, { useState, useRef, useEffect, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { localize, translateItemStatus } from "../lib/i18n";
import { LostFoundItem } from "../types";
import { vibrateClick, vibrateSuccess, vibrateWarning, sanitizeQuery } from "../lib/utils";
import { parseQrCodeOrUrl, findItemInList, fetchItemFromFirestore, classifyQrLookupError } from "../lib/qrCodeUtils";
import { canStartFormalReturnForItem } from "../lib/devolutionAuth";
import { auth } from "../lib/firebase";
import { ModalShell, SubtlePanel, UIBadge, UIButton, UIFieldGroup, UIInput } from "./ui";
import { QrCode, X, Search, FileSignature, ShieldCheck, AlertCircle, Camera, CameraOff, RefreshCw, Eye, ExternalLink } from "lucide-react";
import { RestrictedQRViewModal } from "./RestrictedQRViewModal";

export const QRCodeScannerModal: React.FC = () => {
  const {
    qrScannerOpen,
    setQrScannerOpen,
    items,
    currentUser,
    isGuest,
    addToast,
    setSelectedItemForDetail,
    setReturnModalAutoOpen,
    language,
    t,
  } = useApp();
  const [scannedCode, setScannedCode] = useState("");
  const [foundItem, setFoundItem] = useState<LostFoundItem | null>(null);
  const [showRestrictedModal, setShowRestrictedModal] = useState<LostFoundItem | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Camera Permission & Streaming State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isModalOpenRef = useRef<boolean>(qrScannerOpen);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraPermissionStatus, setCameraPermissionStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannerInitError, setScannerInitError] = useState<string | null>(null);

  useEffect(() => {
    isModalOpenRef.current = qrScannerOpen;
  }, [qrScannerOpen]);

  const stopCamera = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  // Cleanup camera stream when modal unmounts
  useEffect(() => {
    return () => {
      isModalOpenRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    if (!qrScannerOpen) {
      stopCamera();
      setFoundItem(null);
      setScannedCode("");
      setScannerInitError(null);
      setCameraError(null);
    }
  }, [qrScannerOpen, stopCamera]);

  const handleScanOrSearch = useCallback(
    async (codeToSearch: string) => {
      vibrateClick();
      const query = sanitizeQuery(codeToSearch);
      if (!query) {
        vibrateWarning();
        addToast(
          localize(
            language,
            "Digite ou leia um código ou link válido.",
            "Enter or scan a valid code or link."
          ),
          "info"
        );
        return;
      }

      setIsSearching(true);
      const parsed = parseQrCodeOrUrl(query);

      try {
        // 1. Try finding in memory list first
        let item = findItemInList(parsed, items);

        // 2. If not found in memory, query Firestore with explicit error propagation
        if (!item) {
          item = await fetchItemFromFirestore(parsed, { throwOnError: true });
        }

        if (item) {
          vibrateSuccess();
          setFoundItem(item);
          addToast(
            localize(
              language,
              `QR Code identificado: "${item.title}"`,
              `QR Code identified: "${item.title}"`
            ),
            "success"
          );
        } else {
          vibrateWarning();
          setFoundItem(null);
          addToast(
            localize(
              language,
              "Nenhum objeto correspondente encontrado no acervo do campus.",
              "No matching item found in the campus catalog."
            ),
            "error"
          );
        }
      } catch (err) {
        console.warn("[QRCodeScannerModal] Erro na busca remota do QR:", err);
        vibrateWarning();
        setFoundItem(null);
        const classified = classifyQrLookupError(err);
        addToast(classified.userMessage, "error");
      } finally {
        setIsSearching(false);
      }
    },
    [items, addToast, language]
  );

  // Live Barcode/QR scanning loop from video stream
  useEffect(() => {
    if (!cameraActive || !videoRef.current) return;

    let isScanning = true;
    let consecutiveDetectErrors = 0;
    let hasReportedFrameError = false;
    const barcodeDetectorSupported = typeof window !== "undefined" && "BarcodeDetector" in window;

    if (!barcodeDetectorSupported) {
      setScannerInitError(
        localize(
          language,
          "Leitura automática indisponível neste navegador. Digite o código do objeto ou cole o link manualmente abaixo.",
          "Automatic scanning is unavailable in this browser. Type the item code or paste the link manually below."
        )
      );
      return () => {
        isScanning = false;
      };
    }

    try {
      // @ts-ignore
      const barcodeDetector = new window.BarcodeDetector({ formats: ["qr_code", "code_128", "code_39", "ean_13"] });
      setScannerInitError(null);

      const scanFrame = async () => {
        if (!isScanning || !videoRef.current) return;

        if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
          try {
            const barcodes = await barcodeDetector.detect(videoRef.current);
            consecutiveDetectErrors = 0;
            if (barcodes && barcodes.length > 0) {
              const rawVal = barcodes[0].rawValue;
              if (rawVal) {
                setScannedCode(rawVal);
                await handleScanOrSearch(rawVal);
                stopCamera();
                return;
              }
            }
          } catch (detectErr) {
            consecutiveDetectErrors += 1;
            if (consecutiveDetectErrors >= 15 && !hasReportedFrameError) {
              hasReportedFrameError = true;
              console.warn("[QRCodeScannerModal] Falha recorrente na leitura de quadros do BarcodeDetector:", detectErr);
              setScannerInitError(
                localize(
                  language,
                  "O leitor automático encontrou instabilidade com a câmera deste dispositivo. Você pode usar a busca manual pelo código ou link.",
                  "The automatic reader experienced instability with this device's camera. You can use manual search by code or link."
                )
              );
            }
          }
        }

        if (isScanning) {
          animationFrameRef.current = requestAnimationFrame(scanFrame);
        }
      };

      animationFrameRef.current = requestAnimationFrame(scanFrame);
    } catch (initErr) {
      console.warn("[QRCodeScannerModal] Falha ao inicializar BarcodeDetector:", initErr);
      setScannerInitError(
        localize(
          language,
          "Não foi possível inicializar o leitor automático de QR Code neste navegador. Utilize a busca manual abaixo.",
          "Could not initialize the automatic QR Code reader in this browser. Please use manual search below."
        )
      );
    }

    return () => {
      isScanning = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [cameraActive, handleScanOrSearch, stopCamera, language]);

  const startCamera = async () => {
    vibrateClick();
    setCameraPermissionStatus("requesting");
    setCameraError(null);
    setScannerInitError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          localize(
            language,
            "Seu navegador ou ambiente não suporta acesso direto à câmera.",
            "Your browser or environment does not support direct camera access."
          )
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });

      // Guard against modal closing/unmounting while getUserMedia was pending
      if (!isModalOpenRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        setCameraPermissionStatus("idle");
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraActive(true);
      setCameraPermissionStatus("granted");
      vibrateSuccess();
      addToast(
        localize(
          language,
          "Câmera ativada! Aponte para o QR Code da etiqueta.",
          "Camera activated! Point it at the label QR Code."
        ),
        "success"
      );
    } catch (err: any) {
      console.error("Erro ao solicitar acesso à câmera:", err);
      setCameraActive(false);
      setCameraPermissionStatus("denied");
      vibrateWarning();

      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setCameraError(
          localize(
            language,
            "Permissão de câmera negada pelo usuário ou pelo navegador. Permita o acesso nas configurações do site para usar o leitor.",
            "Camera permission was denied by the user or browser. Allow access in site settings to use the scanner."
          )
        );
        addToast(
          localize(
            language,
            "Permissão de câmera negada. Habilite a câmera para utilizar o leitor óptico.",
            "Camera permission denied. Enable the camera to use the optical reader."
          ),
          "error"
        );
      } else {
        setCameraError(
          localize(
            language,
            "Não foi possível acessar a câmera. Verifique se o dispositivo possui câmera disponível.",
            "Could not access the camera. Check whether your device has an available camera."
          )
        );
        addToast(
          localize(language, "Não foi possível iniciar a câmera.", "Could not start the camera."),
          "error"
        );
      }
    }
  };

  if (!qrScannerOpen) return null;

  const handleCloseScanner = () => {
    vibrateClick();
    stopCamera();
    setQrScannerOpen(false);
  };

  const handleQuickSelectPreset = (item: LostFoundItem) => {
    vibrateClick();
    setScannedCode(item.qrCodeId);
    setFoundItem(item);
  };

  const handleOpenFullDetails = (item: LostFoundItem) => {
    vibrateSuccess();
    setReturnModalAutoOpen(false);
    setSelectedItemForDetail(item);
    stopCamera();
    setQrScannerOpen(false);
  };

  const canShowFormalReturn = foundItem
    ? canStartFormalReturnForItem(currentUser, auth.currentUser, foundItem, isGuest)
    : false;

  const handleStartFormalReturn = (item: LostFoundItem) => {
    if (!canStartFormalReturnForItem(currentUser, auth.currentUser, item, isGuest)) {
      addToast(
        localize(
          language,
          "Apenas servidores ou administradores ativos e aprovados podem iniciar a devolução formal.",
          "Only active, approved staff or administrators can initiate a formal return."
        ),
        "error"
      );
      return;
    }
    vibrateClick();
    setSelectedItemForDetail(item);
    setReturnModalAutoOpen(true);
    stopCamera();
    setQrScannerOpen(false);
  };

  return (
    <>
      <ModalShell
        isOpen={qrScannerOpen}
        onClose={handleCloseScanner}
        maxWidthClass="max-w-lg"
        zIndexClass="z-50"
        ariaLabelledBy="qr-scanner-title"
      >
        <div className="p-5 sm:p-6 space-y-5 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/60 border border-[#16845B]/15 text-[#16845B] dark:text-emerald-400 flex items-center justify-center shrink-0">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <h3
                  id="qr-scanner-title"
                  className="font-bold text-base text-[#172B2A] dark:text-white tracking-tight"
                >
                  {t("qrModalTitle")}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t("qrModalSubtitle")}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCloseScanner}
              aria-label={t("close")}
              className="p-2 rounded-xl text-slate-400 hover:text-[#172B2A] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Camera Feed / Permission Request Section */}
          <div className="space-y-2.5">
            <div className="relative h-56 rounded-2xl bg-[#0B0F17] overflow-hidden border border-[#16845B]/45 flex flex-col items-center justify-center p-4 text-center">
              {/* Live Camera Video Feed */}
              <video
                ref={videoRef}
                playsInline
                muted
                className={`absolute inset-0 w-full h-full object-cover ${cameraActive ? "block" : "hidden"}`}
              />

              {/* Scanning Line Overlay when active */}
              {cameraActive && (
                <div className="absolute inset-x-6 top-1/2 h-0.5 bg-emerald-400 animate-pulse shadow-[0_0_12px_#10b981] z-10" />
              )}

              {/* Inactive or Permission Request View */}
              {!cameraActive && (
                <div className="relative z-10 flex flex-col items-center space-y-3 max-w-xs">
                  <div className="w-12 h-12 rounded-xl bg-[#16845B]/20 border border-[#16845B]/35 text-emerald-400 flex items-center justify-center">
                    <Camera className="w-6 h-6" />
                  </div>

                  {cameraPermissionStatus === "denied" ? (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-rose-400 flex items-center justify-center gap-1.5">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{language === "en" ? "Camera access blocked" : "Acesso à câmera bloqueado"}</span>
                      </p>
                      <p className="text-[11px] text-slate-300 leading-snug">
                        {cameraError}
                      </p>
                    </div>
                  ) : cameraPermissionStatus === "requesting" ? (
                    <p className="text-xs font-semibold text-amber-300">
                      {language === "en"
                        ? "Requesting camera permission... Please accept the browser prompt."
                        : "Solicitando permissão de acesso à câmera... Por favor, aceite o prompt do seu navegador."}
                    </p>
                  ) : (
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-white block">
                        {language === "en" ? "Camera Access Required" : "Acesso à Câmera Requerido"}
                      </span>
                      <span className="text-[11px] text-slate-400 block leading-snug">
                        {language === "en"
                          ? "Point your phone camera at the physical QR Code label to open the item page directly."
                          : "Aponte a câmera do celular para o QR Code da etiqueta física para abrir diretamente a página do item."}
                      </span>
                    </div>
                  )}

                  <UIButton
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={startCamera}
                    disabled={cameraPermissionStatus === "requesting"}
                  >
                    <Camera className="w-4 h-4" />
                    <span>
                      {cameraPermissionStatus === "requesting"
                        ? language === "en" ? "Waiting for Permission..." : "Aguardando Permissão..."
                        : language === "en" ? "Request Permission & Start Camera" : "Solicitar Permissão e Iniciar Câmera"}
                    </span>
                  </UIButton>
                </div>
              )}
            </div>

            {/* Camera Controls Bar */}
            {cameraActive && (
              <div className="flex items-center justify-between text-xs px-1">
                <UIBadge tone="emerald">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#16845B]" />
                  <span>{language === "en" ? "Camera Active • Live Scanning" : "Câmera Ativa • Leitura em Tempo Real"}</span>
                </UIBadge>

                <UIButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={stopCamera}
                  className="text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                >
                  <CameraOff className="w-3.5 h-3.5" />
                  <span>{language === "en" ? "Turn Off Camera" : "Desligar Câmera"}</span>
                </UIButton>
              </div>
            )}

            {scannerInitError && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{scannerInitError}</span>
              </div>
            )}
          </div>

          {/* Manual Code Input fallback */}
          <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800">
            <UIFieldGroup
              label={
                language === "en"
                  ? "Type or paste the item URL or QR label code"
                  : "Digite, cole a URL ou código da etiqueta QR"
              }
              htmlFor="qr-manual-code-input"
            >
              <div className="flex gap-2">
                <div className="flex-1">
                  <UIInput
                    id="qr-manual-code-input"
                    type="text"
                    value={scannedCode}
                    onChange={(e) => setScannedCode(e?.target?.value ?? "")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleScanOrSearch(scannedCode);
                      }
                    }}
                    placeholder={
                      language === "en"
                        ? "e.g. https://...?itemId=ifpr-101 / QR-IFPR-101-BOTTLE"
                        : "Ex.: https://...?itemId=ifpr-101 / QR-IFPR-101-GARRAFA"
                    }
                  />
                </div>
                <UIButton
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={() => handleScanOrSearch(scannedCode)}
                  disabled={isSearching}
                >
                  {isSearching ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5" />
                  )}
                  <span>{language === "en" ? "Search" : "Buscar"}</span>
                </UIButton>
              </div>
            </UIFieldGroup>
          </div>

          {/* Preset quick test buttons */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
              {language === "en"
                ? "Quick lookup from active campus archive labels:"
                : "Testar etiquetas ativas no acervo do campus:"}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {items.slice(0, 4).map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => handleQuickSelectPreset(it)}
                  className="px-2.5 py-1 rounded-lg bg-[#F8FAFC] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-mono text-slate-700 dark:text-slate-300 hover:bg-[#EBF5F0] hover:border-[#16845B]/40 hover:text-[#064E3B] dark:hover:bg-emerald-950/50 dark:hover:text-emerald-300 transition-colors cursor-pointer"
                >
                  {it.qrCodeId}
                </button>
              ))}
            </div>
          </div>

          {/* Scanned Result Preview */}
          {foundItem && (
            <SubtlePanel
              padding="sm"
              className="bg-[#EBF5F0]/55 dark:bg-emerald-950/25 border-[#16845B]/30 dark:border-emerald-800/60 space-y-3"
            >
              <div className="flex items-center gap-3">
                <img
                  src={foundItem.imageUrl}
                  alt={foundItem.title}
                  className="w-14 h-14 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <UIBadge tone="emerald">
                      {translateItemStatus(foundItem.status, language)} • {translateItemStatus(foundItem.type, language)}
                    </UIBadge>
                    <UIBadge tone="amber">
                      <ShieldCheck className="w-3 h-3" />
                      <span>{language === "en" ? "Verified Item" : "Item Autenticado"}</span>
                    </UIBadge>
                  </div>
                  <h4 className="font-bold text-sm text-[#172B2A] dark:text-white truncate">
                    {foundItem.title}
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {t("tableColLocation")}: {foundItem.location} • QR: <span className="font-mono">{foundItem.qrCodeId}</span>
                  </p>
                </div>
              </div>

              <div className={`grid grid-cols-1 ${canShowFormalReturn ? "sm:grid-cols-3" : "sm:grid-cols-2"} gap-2`}>
                <UIButton
                  type="button"
                  variant="primary"
                  size="sm"
                  fullWidth
                  onClick={() => handleOpenFullDetails(foundItem)}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{language === "en" ? "Open Details" : "Abrir Detalhes"}</span>
                </UIButton>

                <UIButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  fullWidth
                  onClick={() => setShowRestrictedModal(foundItem)}
                >
                  <Eye className="w-3.5 h-3.5 text-[#16845B] dark:text-emerald-400" />
                  <span>{language === "en" ? "View Public Card" : "Ver Ficha Pública"}</span>
                </UIButton>

                {canShowFormalReturn && (
                  <UIButton
                    type="button"
                    variant="dark"
                    size="sm"
                    fullWidth
                    onClick={() => handleStartFormalReturn(foundItem)}
                  >
                    <FileSignature className="w-3.5 h-3.5" />
                    <span>{language === "en" ? "Start Formal Return" : "Iniciar Devolução Formal"}</span>
                  </UIButton>
                )}
              </div>

              {(foundItem.status === "DEVOLVIDO" || foundItem.status === "ENCERRADO") && (
                <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-white/80 dark:bg-slate-900/60 px-3 py-2 rounded-xl border border-slate-200/80 dark:border-slate-700">
                  {language === "en" ? (
                    <>
                      This object already has status <strong>{translateItemStatus(foundItem.status, language)}</strong> and cannot start a new return record.
                    </>
                  ) : (
                    <>
                      Este objeto já possui a situação <strong>{translateItemStatus(foundItem.status, language)}</strong> e não permite novo registro de entrega.
                    </>
                  )}
                </p>
              )}
            </SubtlePanel>
          )}
        </div>
      </ModalShell>

      {showRestrictedModal && (
        <RestrictedQRViewModal
          item={showRestrictedModal}
          onClose={() => setShowRestrictedModal(null)}
        />
      )}
    </>
  );
};

export default QRCodeScannerModal;
