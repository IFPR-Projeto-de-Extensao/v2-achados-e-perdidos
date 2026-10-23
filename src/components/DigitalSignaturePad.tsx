import React, { useRef, useState, useEffect, useCallback } from "react";
import { PenTool, RotateCcw, Check, AlertCircle, FileText, Eraser, Type } from "lucide-react";

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
  const isDrawingRef = useRef(false);
  const pointsInStrokeRef = useRef(0);
  const totalStrokesRef = useRef(0);

  const [hasSignature, setHasSignature] = useState(false);
  const [strokeHistory, setStrokeHistory] = useState<ImageData[]>([]);
  const [penColor, setPenColor] = useState<string>("#0f172a"); // Default Navy/Black
  const [penWidth] = useState<number>(2.5);
  const [signatureMode, setSignatureMode] = useState<"draw" | "type">("draw");
  const [typedName, setTypedName] = useState(signerName && signerName !== "Proprietário / Receptor" ? signerName : "");
  const [typedFont, setTypedFont] = useState<"cursive" | "serif" | "sans">("cursive");

  // Synchronize typedName whenever signerName is populated or updated by parent
  useEffect(() => {
    if (signerName && signerName !== "Proprietário / Receptor" && signerName !== "Aluno / Servidor") {
      setTypedName((prev) => (prev ? prev : signerName));
    }
  }, [signerName]);

  // Setup Canvas DPI and drawing context
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);

    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penWidth;

    // Draw clean solid background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Baseline guide line
    ctx.beginPath();
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.moveTo(20, rect.height - 36);
    ctx.lineTo(rect.width - 20, rect.height - 36);
    ctx.stroke();
    ctx.setLineDash([]); // reset

    // Text hint
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("Assine sobre a linha pontilhada (Toque ou Mouse)", 24, rect.height - 20);

    // Save blank state
    const blankData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setStrokeHistory([blankData]);
    setHasSignature(false);
    totalStrokesRef.current = 0;
  }, [penColor, penWidth]);

  // Render typed signature onto canvas
  const renderTypedSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.scale(dpr, dpr);

    // Clear background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Draw baseline
    ctx.beginPath();
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.moveTo(20, rect.height - 36);
    ctx.lineTo(rect.width - 20, rect.height - 36);
    ctx.stroke();
    ctx.setLineDash([]);

    const cleanText = typedName.trim();
    if (cleanText.length >= 2) {
      ctx.fillStyle = penColor;
      if (typedFont === "cursive") {
        ctx.font = "italic 36px 'Caveat', 'Great Vibes', 'Brush Script MT', cursive, sans-serif";
      } else if (typedFont === "serif") {
        ctx.font = "italic 26px Georgia, 'Times New Roman', serif";
      } else {
        ctx.font = "600 22px 'Poppins', system-ui, -apple-system, sans-serif";
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(cleanText, rect.width / 2, rect.height / 2 - 6);

      ctx.font = "9px monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(`Assinado digitalmente por ${cleanText}`, rect.width / 2, rect.height - 18);

      setHasSignature(true);
      const dataUrl = canvas.toDataURL("image/png");
      onSignatureCapture(dataUrl, "TYPED_NAME");
    } else {
      setHasSignature(false);
      if (onClear) onClear();
    }
  }, [typedName, typedFont, penColor, onSignatureCapture, onClear]);

  // Initialize canvas on mount and mode changes
  useEffect(() => {
    if (signatureMode === "draw") {
      initCanvas();
    } else {
      renderTypedSignature();
    }
  }, [signatureMode, initCanvas, renderTypedSignature]);

  // Native non-passive touch listeners for 100% reliable Android / Mobile drawing without scroll interference
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || signatureMode !== "draw") return;

    const getTouchCoords = (touch: Touch) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (disabled) return;
      if (e.touches.length > 0) {
        e.preventDefault(); // Stop Android scroll / pull-to-refresh
        e.stopPropagation();

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const { x, y } = getTouchCoords(e.touches[0]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.strokeStyle = penColor;
        ctx.lineWidth = penWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        isDrawingRef.current = true;
        pointsInStrokeRef.current = 1;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDrawingRef.current || disabled) return;
      if (e.touches.length > 0) {
        e.preventDefault(); // Inhibit page panning while drawing
        e.stopPropagation();

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const { x, y } = getTouchCoords(e.touches[0]);
        ctx.lineTo(x, y);
        ctx.stroke();

        pointsInStrokeRef.current += 1;
        if (pointsInStrokeRef.current > 3 && !hasSignature) {
          setHasSignature(true);
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isDrawingRef.current) return;
      e.preventDefault();
      isDrawingRef.current = false;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.closePath();

      if (pointsInStrokeRef.current > 2) {
        totalStrokesRef.current += 1;
        setHasSignature(true);

        const state = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setStrokeHistory((prev) => [...prev, state]);

        const dataUrl = canvas.toDataURL("image/png");
        onSignatureCapture(dataUrl, "DRAWN");
      }
      pointsInStrokeRef.current = 0;
    };

    const handleTouchCancel = (e: TouchEvent) => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.closePath();
      pointsInStrokeRef.current = 0;
    };

    // Attach with passive: false to allow preventDefault() on Android
    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", handleTouchCancel, { passive: false });

    return () => {
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
      canvas.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [signatureMode, disabled, penColor, penWidth, hasSignature, onSignatureCapture]);

  // Mouse event handlers for desktop
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (disabled || signatureMode !== "draw") return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    isDrawingRef.current = true;
    pointsInStrokeRef.current = 1;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || disabled || signatureMode !== "draw") return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();

    pointsInStrokeRef.current += 1;
    if (pointsInStrokeRef.current > 3 && !hasSignature) {
      setHasSignature(true);
    }
  };

  const handleMouseUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.closePath();

    if (pointsInStrokeRef.current > 2) {
      totalStrokesRef.current += 1;
      setHasSignature(true);

      const state = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setStrokeHistory((prev) => [...prev, state]);

      const dataUrl = canvas.toDataURL("image/png");
      onSignatureCapture(dataUrl, "DRAWN");
    }
    pointsInStrokeRef.current = 0;
  };

  const handleClear = () => {
    initCanvas();
    if (onClear) onClear();
  };

  const handleUndo = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || strokeHistory.length <= 1) return;

    const newHistory = [...strokeHistory];
    newHistory.pop(); // remove last state
    const previousState = newHistory[newHistory.length - 1];

    ctx.putImageData(previousState, 0, 0);
    setStrokeHistory(newHistory);

    if (newHistory.length <= 1) {
      setHasSignature(false);
      totalStrokesRef.current = 0;
      if (onClear) onClear();
    } else {
      const dataUrl = canvas.toDataURL("image/png");
      onSignatureCapture(dataUrl, "DRAWN");
    }
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
            onClick={() => {
              setSignatureMode("draw");
              setTimeout(initCanvas, 50);
            }}
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
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
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
            onClick={() => setPenColor("#0f172a")}
            className={`w-5 h-5 rounded-full bg-slate-900 border-2 transition-transform cursor-pointer ${
              penColor === "#0f172a" ? "scale-110 border-[#00843D]" : "border-white"
            }`}
          />
          <button
            type="button"
            title="Caneta Azul Institucional"
            onClick={() => setPenColor("#0047AB")}
            className={`w-5 h-5 rounded-full bg-blue-700 border-2 transition-transform cursor-pointer ${
              penColor === "#0047AB" ? "scale-110 border-[#00843D]" : "border-white"
            }`}
          />
          <button
            type="button"
            title="Caneta Verde IFPR"
            onClick={() => setPenColor("#00843D")}
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
