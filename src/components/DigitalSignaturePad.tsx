import React, { useRef, useState, useEffect, useCallback } from "react";
import { PenTool, RotateCcw, Check, AlertCircle, FileText, Eraser } from "lucide-react";

interface DigitalSignaturePadProps {
  signerName: string;
  signerBond?: string;
  signerEmail?: string;
  onSignatureCapture: (dataUrl: string, method?: "DRAWN" | "TYPED_NAME") => void;
  onClear?: () => void;
  initialSignature?: string;
  disabled?: boolean;
}

export const DigitalSignaturePad: React.FC<DigitalSignaturePadProps> = ({
  signerName,
  signerBond = "Aluno(a)",
  signerEmail,
  onSignatureCapture,
  onClear,
  initialSignature,
  disabled = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Stable references for parent callbacks to prevent canvas re-initialization on parent re-renders
  const onSignatureCaptureRef = useRef(onSignatureCapture);
  onSignatureCaptureRef.current = onSignatureCapture;

  const onClearRef = useRef(onClear);
  onClearRef.current = onClear;

  // Single-pointer and stroke state tracking refs (pure imperative state, no re-render cycle triggers)
  const activePointerIdRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);
  const pointsInStrokeRef = useRef(0);
  const totalStrokesRef = useRef(0);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const strokeHistoryRef = useRef<ImageData[]>([]);

  // React state for UI presentation
  const [hasSignature, setHasSignature] = useState(false);
  const [strokeHistory, setStrokeHistory] = useState<ImageData[]>([]);
  const [penColor, setPenColor] = useState<string>("#0f172a"); // Default Navy/Black
  const penColorRef = useRef<string>("#0f172a");
  penColorRef.current = penColor;

  const [penWidth] = useState<number>(2.5);
  const [signatureMode, setSignatureMode] = useState<"draw" | "type">("draw");
  const [typedName, setTypedName] = useState(
    signerName && signerName !== "Proprietário / Receptor" && signerName !== "Aluno / Servidor" ? signerName : ""
  );
  const [typedFont, setTypedFont] = useState<"cursive" | "serif" | "sans">("cursive");

  // Synchronize typedName whenever signerName is populated or updated by parent
  useEffect(() => {
    if (signerName && signerName !== "Proprietário / Receptor" && signerName !== "Aluno / Servidor") {
      setTypedName((prev) => (prev ? prev : signerName));
    }
  }, [signerName]);

  // Setup Canvas DPI, solid background, and drawing baseline
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
    const width = rect.width > 0 ? rect.width : 400;
    const height = rect.height > 0 ? rect.height : 176;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = penColorRef.current;
    ctx.lineWidth = penWidth;

    // Draw clean solid background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // Baseline guide line
    ctx.beginPath();
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.moveTo(20, height - 36);
    ctx.lineTo(width - 20, height - 36);
    ctx.stroke();
    ctx.setLineDash([]); // reset

    // Text hint
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("Assine sobre a linha pontilhada (Toque ou Mouse)", 24, height - 20);

    // Save initial blank state
    try {
      const blankData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      strokeHistoryRef.current = [blankData];
      setStrokeHistory([blankData]);
    } catch (_) {
      strokeHistoryRef.current = [];
      setStrokeHistory([]);
    }

    setHasSignature(false);
    totalStrokesRef.current = 0;
  }, [penWidth]);

  // Render typed signature onto canvas (strictly separated from draw mode)
  const renderTypedSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
    const width = rect.width > 0 ? rect.width : 400;
    const height = rect.height > 0 ? rect.height : 176;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.scale(dpr, dpr);

    // Clear background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // Draw baseline
    ctx.beginPath();
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.moveTo(20, height - 36);
    ctx.lineTo(width - 20, height - 36);
    ctx.stroke();
    ctx.setLineDash([]);

    const cleanText = typedName.trim();
    if (cleanText.length >= 2) {
      ctx.fillStyle = penColorRef.current;
      if (typedFont === "cursive") {
        ctx.font = "italic 36px 'Caveat', 'Great Vibes', 'Brush Script MT', cursive, sans-serif";
      } else if (typedFont === "serif") {
        ctx.font = "italic 26px Georgia, 'Times New Roman', serif";
      } else {
        ctx.font = "600 22px 'Poppins', system-ui, -apple-system, sans-serif";
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(cleanText, width / 2, height / 2 - 6);

      ctx.font = "9px monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(`Assinado digitalmente por ${cleanText}`, width / 2, height - 18);

      setHasSignature(true);
      try {
        const dataUrl = canvas.toDataURL("image/png");
        onSignatureCaptureRef.current(dataUrl, "TYPED_NAME");
      } catch (_) {}
    } else {
      setHasSignature(false);
      if (onClearRef.current) onClearRef.current();
    }
  }, [typedName, typedFont]);

  // Effect 1: Initialize canvas on mount and when switching to "draw" mode
  useEffect(() => {
    if (signatureMode === "draw") {
      initCanvas();
    }
  }, [signatureMode, initCanvas]);

  // Effect 2: Render typed signature when in "type" mode
  useEffect(() => {
    if (signatureMode === "type") {
      renderTypedSignature();
    }
  }, [signatureMode, renderTypedSignature]);

  // ResizeObserver: Handles container expansion (e.g. modal transitions) safely without wiping active drawings
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;

    let previousWidth = canvas.getBoundingClientRect().width;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        // If initial mount occurred when modal was hidden (width === 0) and now is revealed
        if (previousWidth === 0 && newWidth > 0 && totalStrokesRef.current === 0) {
          previousWidth = newWidth;
          if (signatureMode === "draw") {
            initCanvas();
          } else {
            renderTypedSignature();
          }
        }
      }
    });

    observer.observe(canvas);
    return () => observer.disconnect();
  }, [signatureMode, initCanvas, renderTypedSignature]);

  // =========================================================================
  // Unified Pointer Events System (Mouse, Touch, Pen / Stylus)
  // =========================================================================

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || signatureMode !== "draw") return;

    // Single active pointer guard: ignore secondary touches/multitouch
    if (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    activePointerIdRef.current = e.pointerId;
    isDrawingRef.current = true;
    pointsInStrokeRef.current = 1;

    // Capture pointer events even if cursor moves temporarily beyond canvas boundary
    if (typeof e.currentTarget.setPointerCapture === "function") {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (_) {}
    }

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    lastPointRef.current = { x, y };

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = penColorRef.current;
    ctx.lineWidth = penWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || e.pointerId !== activePointerIdRef.current || disabled || signatureMode !== "draw") {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    lastPointRef.current = { x, y };

    ctx.lineTo(x, y);
    ctx.stroke();

    pointsInStrokeRef.current += 1;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || e.pointerId !== activePointerIdRef.current) return;

    isDrawingRef.current = false;
    activePointerIdRef.current = null;

    if (typeof e.currentTarget.releasePointerCapture === "function") {
      try {
        if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch (_) {}
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.closePath();

    if (pointsInStrokeRef.current >= 1) {
      // Single tap / dot support for initials and punctuation
      if (pointsInStrokeRef.current === 1 && lastPointRef.current) {
        ctx.beginPath();
        ctx.arc(lastPointRef.current.x, lastPointRef.current.y, penWidth / 1.5, 0, Math.PI * 2);
        ctx.fillStyle = penColorRef.current;
        ctx.fill();
      }

      totalStrokesRef.current += 1;
      setHasSignature(true);

      try {
        const state = ctx.getImageData(0, 0, canvas.width, canvas.height);
        strokeHistoryRef.current.push(state);
        setStrokeHistory([...strokeHistoryRef.current]);
      } catch (_) {}

      try {
        const dataUrl = canvas.toDataURL("image/png");
        onSignatureCaptureRef.current(dataUrl, "DRAWN");
      } catch (_) {}
    }
    pointsInStrokeRef.current = 0;
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerId !== activePointerIdRef.current) return;

    isDrawingRef.current = false;
    activePointerIdRef.current = null;

    if (typeof e.currentTarget.releasePointerCapture === "function") {
      try {
        if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch (_) {}
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.closePath();

    // Revert to last committed stroke in history if available
    if (strokeHistoryRef.current.length > 0) {
      try {
        const lastCommitted = strokeHistoryRef.current[strokeHistoryRef.current.length - 1];
        ctx.putImageData(lastCommitted, 0, 0);
      } catch (_) {}
    }
    pointsInStrokeRef.current = 0;
  };

  const handleClear = () => {
    initCanvas();
    if (onClearRef.current) onClearRef.current();
  };

  const handleUndo = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || strokeHistoryRef.current.length <= 1) return;

    strokeHistoryRef.current.pop(); // Remove last recorded stroke
    const previousState = strokeHistoryRef.current[strokeHistoryRef.current.length - 1];

    try {
      ctx.putImageData(previousState, 0, 0);
    } catch (_) {}
    setStrokeHistory([...strokeHistoryRef.current]);

    if (strokeHistoryRef.current.length <= 1) {
      setHasSignature(false);
      totalStrokesRef.current = 0;
      if (onClearRef.current) onClearRef.current();
    } else {
      totalStrokesRef.current = Math.max(0, strokeHistoryRef.current.length - 1);
      try {
        const dataUrl = canvas.toDataURL("image/png");
        onSignatureCaptureRef.current(dataUrl, "DRAWN");
      } catch (_) {}
    }
  };

  const handlePenColorChange = (newColor: string) => {
    penColorRef.current = newColor;
    setPenColor(newColor);
    if (signatureMode === "type") {
      renderTypedSignature();
    }
    // In draw mode: existing drawn strokes are preserved; subsequent strokes use the new color!
  };

  return (
    <div className="space-y-3">
      {/* Header & Mode Switch */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <PenTool className="w-4 h-4 text-[#00843D]" />
          <span className="text-xs font-black text-neutral-800 dark:text-neutral-200">
            Assinatura Digital de Recebimento
          </span>
        </div>

        <div className="flex items-center space-x-1.5 p-0.5 bg-neutral-100 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700">
          <button
            type="button"
            onClick={() => setSignatureMode("draw")}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
              signatureMode === "draw"
                ? "bg-white dark:bg-neutral-700 text-[#00843D] shadow-xs"
                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
            }`}
          >
            ✍️ Desenhar Traço
          </button>
          <button
            type="button"
            onClick={() => setSignatureMode("type")}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
              signatureMode === "type"
                ? "bg-white dark:bg-neutral-700 text-[#00843D] shadow-xs"
                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
            }`}
          >
            ⌨️ Digitar Nome
          </button>
        </div>
      </div>

      {/* Drawing / Typing Canvas Container */}
      <div className="relative border-2 border-dashed border-neutral-300 dark:border-neutral-700 hover:border-[#00843D] dark:hover:border-[#00843D] rounded-2xl overflow-hidden bg-white shadow-inner transition-colors">
        {signatureMode === "type" && (
          <div className="p-3 bg-neutral-50 dark:bg-neutral-850 border-b border-neutral-200 dark:border-neutral-750 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <input
                type="text"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="Digite o nome completo do receptor..."
                className="w-full p-2 text-xs font-semibold bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl outline-none focus:ring-2 focus:ring-[#00843D] text-neutral-900 dark:text-white"
              />
            </div>
            <select
              value={typedFont}
              onChange={(e) => setTypedFont(e.target.value as any)}
              className="p-2 text-xs font-bold bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl outline-none text-neutral-800 dark:text-neutral-200 cursor-pointer"
            >
              <option value="cursive">Estilo Manuscrito (Caveat)</option>
              <option value="serif">Estilo Clássico (Serif)</option>
              <option value="sans">Estilo Moderno (Sans)</option>
            </select>
          </div>
        )}

        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          className={`w-full h-44 cursor-crosshair touch-none select-none block bg-white ${
            disabled ? "opacity-60 cursor-not-allowed" : ""
          }`}
          style={{ touchAction: "none" }}
        />

        {/* Floating Controls Bar */}
        <div className="absolute top-2 right-2 flex items-center space-x-1.5 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xs p-1 rounded-xl shadow-md border border-neutral-200 dark:border-neutral-700 z-10">
          {/* Color pickers */}
          <button
            type="button"
            title="Caneta Preta"
            onClick={() => handlePenColorChange("#0f172a")}
            className={`w-5 h-5 rounded-full bg-slate-900 border-2 transition-transform cursor-pointer ${
              penColor === "#0f172a" ? "scale-110 border-[#00843D]" : "border-white"
            }`}
          />
          <button
            type="button"
            title="Caneta Azul Institucional"
            onClick={() => handlePenColorChange("#0047AB")}
            className={`w-5 h-5 rounded-full bg-blue-700 border-2 transition-transform cursor-pointer ${
              penColor === "#0047AB" ? "scale-110 border-[#00843D]" : "border-white"
            }`}
          />
          <button
            type="button"
            title="Caneta Verde IFPR"
            onClick={() => handlePenColorChange("#00843D")}
            className={`w-5 h-5 rounded-full bg-[#00843D] border-2 transition-transform cursor-pointer ${
              penColor === "#00843D" ? "scale-110 border-white" : "border-white"
            }`}
          />

          <div className="w-[1px] h-4 bg-neutral-300 dark:bg-neutral-700 mx-0.5" />

          {signatureMode === "draw" && (
            <>
              <button
                type="button"
                onClick={handleUndo}
                disabled={strokeHistory.length <= 1}
                title="Desfazer último traço"
                className="p-1 rounded-lg text-neutral-600 hover:bg-neutral-100 disabled:opacity-30 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={handleClear}
                title="Limpar assinatura"
                className="p-1 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer"
              >
                <Eraser className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>

        {/* Bottom Signer Info Overlay */}
        <div className="p-2 bg-neutral-50/90 dark:bg-neutral-900/90 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-[10px] text-neutral-600 dark:text-neutral-400">
          <div className="flex items-center space-x-1.5">
            <span className="font-bold text-neutral-900 dark:text-white">
              {typedName || signerName || "Proprietário / Receptor"}
            </span>
            <span>•</span>
            <span>{signerBond}</span>
            {signerEmail && (
              <>
                <span>•</span>
                <span className="hidden sm:inline">{signerEmail}</span>
              </>
            )}
          </div>

          <div className="flex items-center space-x-1 font-bold">
            {hasSignature ? (
              <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Assinatura válida
              </span>
            ) : (
              <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {signatureMode === "draw" ? "Aguardando desenho" : "Digite o nome"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Legal Declaration */}
      <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11px] text-emerald-900 dark:text-emerald-200 leading-snug flex items-start gap-2">
        <FileText className="w-4 h-4 text-[#00843D] shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Termo de Devolução & Recebimento Oficial:</span>
          <p className="mt-0.5 text-neutral-600 dark:text-neutral-300">
            Declaro ter recebido o pertence correspondente na Seção de Apoio ao Estudante (SEBAC) / Guarita do IFPR Campus Ivaiporã em perfeitas condições, conferido mediante documento.
          </p>
        </div>
      </div>
    </div>
  );
};
