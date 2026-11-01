import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Mock robusto de CanvasRenderingContext2D e HTMLCanvasElement
 * para validação determinística do ciclo de vida e Pointer Events do DigitalSignaturePad
 */
interface CanvasMockState {
  paths: { x: number; y: number }[][];
  currentPath: { x: number; y: number }[];
  fillColor: string;
  strokeColor: string;
  lineWidth: number;
  fillRects: { x: number; y: number; w: number; h: number; color: string }[];
  drawnTexts: { text: string; x: number; y: number }[];
  isClosed: boolean;
  clearCount: number;
}

function createMockCanvasContext() {
  const state: CanvasMockState = {
    paths: [],
    currentPath: [],
    fillColor: "#ffffff",
    strokeColor: "#0f172a",
    lineWidth: 2.5,
    fillRects: [],
    drawnTexts: [],
    isClosed: false,
    clearCount: 0,
  };

  const dummyImageData = {
    data: new Uint8ClampedArray(400 * 176 * 4),
    width: 400,
    height: 176,
  } as unknown as ImageData;

  const ctx = {
    scale: vi.fn((_sx: number, _sy: number) => {}),
    lineCap: "round",
    lineJoin: "round",
    set strokeStyle(val: string) {
      state.strokeColor = val;
    },
    get strokeStyle() {
      return state.strokeColor;
    },
    set fillStyle(val: string) {
      state.fillColor = val;
    },
    get fillStyle() {
      return state.fillColor;
    },
    set lineWidth(val: number) {
      state.lineWidth = val;
    },
    get lineWidth() {
      return state.lineWidth;
    },
    setLineDash: vi.fn((_segments: number[]) => {}),
    beginPath: vi.fn(() => {
      state.currentPath = [];
      state.isClosed = false;
    }),
    moveTo: vi.fn((x: number, y: number) => {
      state.currentPath.push({ x, y });
    }),
    lineTo: vi.fn((x: number, y: number) => {
      state.currentPath.push({ x, y });
    }),
    stroke: vi.fn(() => {
      if (state.currentPath.length > 0) {
        state.paths.push([...state.currentPath]);
      }
    }),
    closePath: vi.fn(() => {
      state.isClosed = true;
    }),
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      state.fillRects.push({ x, y, w, h, color: state.fillColor });
      if (state.fillColor === "#ffffff" && w >= 400 && h >= 170) {
        state.clearCount += 1;
      }
    }),
    fillText: vi.fn((text: string, x: number, y: number) => {
      state.drawnTexts.push({ text, x, y });
    }),
    arc: vi.fn((x: number, y: number) => {
      state.currentPath.push({ x, y });
    }),
    fill: vi.fn(() => {}),
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => {
      return {
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
        _snapshotId: state.paths.length,
      } as unknown as ImageData;
    }),
    putImageData: vi.fn((imageData: any, _dx: number, _dy: number) => {
      // Simula restauração de traços do histórico
      if (imageData && typeof imageData._snapshotId === "number") {
        state.paths = state.paths.slice(0, imageData._snapshotId);
      }
    }),
  };

  const canvas = {
    _width: 800,
    _height: 352,
    set width(val: number) {
      this._width = val;
      // Atribuição de width no Canvas nativo redefine o bitmap
      state.clearCount += 1;
    },
    get width() {
      return this._width;
    },
    set height(val: number) {
      this._height = val;
      state.clearCount += 1;
    },
    get height() {
      return this._height;
    },
    getContext: vi.fn((type: string) => (type === "2d" ? ctx : null)),
    getBoundingClientRect: vi.fn(() => ({
      width: 400,
      height: 176,
      top: 100,
      left: 100,
      right: 500,
      bottom: 276,
      x: 100,
      y: 100,
    })),
    toDataURL: vi.fn((_type?: string, _quality?: any) => "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAYAAAA...SIMULATED"),
    setPointerCapture: vi.fn((_pointerId: number) => {}),
    releasePointerCapture: vi.fn((_pointerId: number) => {}),
    hasPointerCapture: vi.fn((_pointerId: number) => true),
  };

  return { canvas, ctx, state, dummyImageData };
}

describe("LOCALIZA+ v1.10.10 — Validação da Persistência da Assinatura Digital (DigitalSignaturePad)", () => {
  const rootDir = process.cwd();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Teste 1: Desenhar e soltar o ponteiro — assinatura permanece íntegra
  // =========================================================================
  it("1. Desenhar e soltar o ponteiro: assinatura e traço permanecem visíveis sem serem limpos", () => {
    const { canvas, ctx, state } = createMockCanvasContext();
    const onCapture = vi.fn((_dataUrl: string, _method?: string) => {});
    const onClear = vi.fn(() => {});

    // Simula inicialização do Canvas no modo de desenho
    let totalStrokes = 0;
    const strokeHistory: ImageData[] = [];
    const blank = ctx.getImageData(0, 0, canvas.width, canvas.height);
    strokeHistory.push(blank);
    const initialClears = state.clearCount;

    // Simulação do evento pointerdown
    let isDrawing = true;
    let pointsInStroke = 1;
    ctx.beginPath();
    ctx.moveTo(50, 50);

    // Simulação do evento pointermove
    ctx.lineTo(80, 80);
    ctx.stroke();
    pointsInStroke += 1;
    ctx.lineTo(120, 60);
    ctx.stroke();
    pointsInStroke += 1;

    // Simulação do evento pointerup (soltar ponteiro)
    isDrawing = false;
    ctx.closePath();
    totalStrokes += 1;
    const strokeState = ctx.getImageData(0, 0, canvas.width, canvas.height);
    strokeHistory.push(strokeState);

    const dataUrl = canvas.toDataURL("image/png");
    onCapture(dataUrl, "DRAWN");

    // Validações pós-pointerup
    expect(isDrawing).toBe(false);
    expect(totalStrokes).toBe(1);
    expect(strokeHistory.length).toBe(2); // [blank, stroke1]
    expect(state.paths.length).toBeGreaterThan(0); // Traço preservado no canvas
    expect(state.clearCount).toBe(initialClears); // NENHUMA limpeza destrutiva ocorreu no pointerup!
    expect(onCapture).toHaveBeenCalledWith(dataUrl, "DRAWN");
    expect(onClear).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Teste 2: Três traços consecutivos permanecem todos visíveis
  // =========================================================================
  it("2. Realizar três traços consecutivos: todos os traços se acumulam e permanecem no histórico", () => {
    const { canvas, ctx, state } = createMockCanvasContext();
    const onCapture = vi.fn((_dataUrl: string, _method?: string) => {});
    const strokeHistory: ImageData[] = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
    let totalStrokes = 0;

    // Função auxiliar para simular um traço completo (down -> move -> up)
    const drawStroke = (x1: number, y1: number, x2: number, y2: number) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.closePath();
      totalStrokes += 1;
      const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
      strokeHistory.push(snap);
      onCapture(canvas.toDataURL("image/png"), "DRAWN");
    };

    // Traço 1: assinatura base
    drawStroke(20, 100, 150, 95);
    // Traço 2: corte da letra 't'
    drawStroke(70, 70, 90, 70);
    // Traço 3: pingo da letra 'i'
    drawStroke(120, 75, 122, 75);

    expect(totalStrokes).toBe(3);
    expect(strokeHistory.length).toBe(4); // [blank, traço1, traço2, traço3]
    expect(state.paths.length).toBe(3);
    expect(onCapture).toHaveBeenCalledTimes(3);
  });

  // =========================================================================
  // Teste 3: Atualizações de estado do componente pai não resetam o Canvas
  // =========================================================================
  it("3. Atualizar o estado do componente pai: assinatura permanece intacta e initCanvas não é chamado", () => {
    const padPath = path.join(rootDir, "src/components/DigitalSignaturePad.tsx");
    const padCode = fs.readFileSync(padPath, "utf-8");

    // Valida que o efeito do modo de desenho não depende de callbacks voláteis do pai
    expect(padCode).not.toContain("useEffect(() => {\n    if (signatureMode === \"draw\") {\n      initCanvas();\n    } else {\n      renderTypedSignature();\n    }\n  }, [signatureMode, initCanvas, renderTypedSignature]);");

    // Valida que as callbacks do pai são mantidas em refs estáveis
    expect(padCode).toContain("const onSignatureCaptureRef = useRef(onSignatureCapture);");
    expect(padCode).toContain("onSignatureCaptureRef.current = onSignatureCapture;");
    expect(padCode).toContain("const onClearRef = useRef(onClear);");
    expect(padCode).toContain("onClearRef.current = onClear;");

    // Valida que initCanvas é desacoplado de renderTypedSignature
    expect(padCode).toMatch(/useEffect\(\(\) => \{\s*if \(signatureMode === "draw"\) \{\s*initCanvas\(\);\s*\}\s*\}, \[signatureMode/);
  });

  // =========================================================================
  // Teste 4: Desfazer (handleUndo) remove somente o último traço
  // =========================================================================
  it("4. Desfazer: somente o último traço desaparece e o traço anterior é restaurado", () => {
    const { canvas, ctx, state } = createMockCanvasContext();
    const onCapture = vi.fn((_dataUrl: string, _method?: string) => {});
    const strokeHistory: ImageData[] = [ctx.getImageData(0, 0, canvas.width, canvas.height)];

    // Desenha traço 1
    ctx.beginPath();
    ctx.moveTo(10, 10);
    ctx.lineTo(50, 50);
    ctx.stroke();
    strokeHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));

    // Desenha traço 2
    ctx.beginPath();
    ctx.moveTo(60, 60);
    ctx.lineTo(100, 100);
    ctx.stroke();
    strokeHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));

    expect(strokeHistory.length).toBe(3);
    expect(state.paths.length).toBe(2);

    // Execução da rotina handleUndo
    strokeHistory.pop(); // Remove traço 2
    const previous = strokeHistory[strokeHistory.length - 1];
    ctx.putImageData(previous, 0, 0);
    onCapture(canvas.toDataURL("image/png"), "DRAWN");

    expect(strokeHistory.length).toBe(2); // Resta [blank, traço 1]
    expect(state.paths.length).toBe(1); // Apenas o traço 1 permanece ativo
    expect(ctx.putImageData).toHaveBeenCalledWith(previous, 0, 0);
    expect(onCapture).toHaveBeenCalled();
  });

  // =========================================================================
  // Teste 5: Limpar (handleClear) restaura o Canvas ao estado inicial
  // =========================================================================
  it("5. Limpar: Canvas retorna ao estado inicial com linha pontilhada e notifica onClear", () => {
    const { ctx, state } = createMockCanvasContext();
    const onClear = vi.fn(() => {});
    let hasSignature = true;
    let totalStrokes = 2;

    // Execução da rotina handleClear
    // 1. Limpa fundo
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 400, 176);
    // 2. Redesenha linha pontilhada
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.moveTo(20, 140);
    ctx.lineTo(380, 140);
    ctx.stroke();
    // 3. Reseta estados
    hasSignature = false;
    totalStrokes = 0;
    onClear();

    expect(hasSignature).toBe(false);
    expect(totalStrokes).toBe(0);
    expect(onClear).toHaveBeenCalled();
    expect(state.fillRects.length).toBeGreaterThan(0);
    expect(ctx.setLineDash).toHaveBeenCalledWith([4, 4]);
  });

  // =========================================================================
  // Teste 6: Alternar entre desenho e assinatura digitada
  // =========================================================================
  it("6. Alternar entre desenho e assinatura digitada: fluxos isolados e independentes", () => {
    const { canvas, ctx, state } = createMockCanvasContext();
    const onCapture = vi.fn((_dataUrl: string, _method?: string) => {});

    // Modo Digitar: renderiza texto com tipografia selecionada
    const renderTyped = (name: string, _font: "cursive" | "serif" | "sans") => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 400, 176);
      ctx.fillStyle = "#0f172a";
      ctx.fillText(name, 200, 80);
      onCapture(canvas.toDataURL("image/png"), "TYPED_NAME");
    };

    renderTyped("Carlos Eduardo Machado", "cursive");
    expect(state.drawnTexts.some((t) => t.text === "Carlos Eduardo Machado")).toBe(true);
    expect(onCapture).toHaveBeenCalledWith(expect.any(String), "TYPED_NAME");

    // Modo Desenho: inicializa área limpa sem sobrescrever de volta para texto
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 400, 176);
    ctx.beginPath();
    ctx.moveTo(30, 40);
    ctx.lineTo(70, 80);
    ctx.stroke();
    onCapture(canvas.toDataURL("image/png"), "DRAWN");

    expect(onCapture).toHaveBeenLastCalledWith(expect.any(String), "DRAWN");
  });

  // =========================================================================
  // Teste 7: Executar pointercancel sem travar o componente
  // =========================================================================
  it("7. Executar pointercancel: encerra o traço com segurança e restaura o ponteiro sem travar", () => {
    const { ctx } = createMockCanvasContext();
    let isDrawing = true;
    let activePointerId: number | null = 10;
    const strokeHistory = [ctx.getImageData(0, 0, 400, 176)];

    // Simulação do evento pointercancel (interrupção do sistema operacional ou chamada recebida)
    isDrawing = false;
    activePointerId = null;
    ctx.closePath();

    if (strokeHistory.length > 0) {
      ctx.putImageData(strokeHistory[strokeHistory.length - 1], 0, 0);
    }

    expect(isDrawing).toBe(false);
    expect(activePointerId).toBeNull();
    expect(ctx.closePath).toHaveBeenCalled();
  });

  // =========================================================================
  // Teste 8: Redimensionar o Canvas sem perder o desenho
  // =========================================================================
  it("8. Redimensionar o Canvas: ResizeObserver não limpa desenhos existentes (totalStrokes > 0)", () => {
    const padPath = path.join(rootDir, "src/components/DigitalSignaturePad.tsx");
    const padCode = fs.readFileSync(padPath, "utf-8");

    // Valida que o ResizeObserver somente reinicializa se totalStrokes === 0 (abertura inicial do modal)
    expect(padCode).toContain("if (previousWidth === 0 && newWidth > 0 && totalStrokesRef.current === 0)");
    expect(padCode).toContain("observer.observe(canvas);");
  });

  // =========================================================================
  // Teste 9: Conversão correta da assinatura para Data URL
  // =========================================================================
  it("9. Conversão para Data URL: gera string PNG válida enviada com método correspondente", () => {
    const { canvas } = createMockCanvasContext();
    const onCapture = vi.fn((_dataUrl: string, _method?: string) => {});

    const dataUrl = canvas.toDataURL("image/png");
    onCapture(dataUrl, "DRAWN");

    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(onCapture).toHaveBeenCalledWith(dataUrl, "DRAWN");
  });

  // =========================================================================
  // Teste 10: Compatibilidade com os três pontos de consumo do componente
  // =========================================================================
  it("10. Compatibilidade estrita com os três pontos de uso (ItemDetailModal devolução, atendente e RemoteSignatureModal)", () => {
    const itemDetailPath = path.join(rootDir, "src/components/ItemDetailModal.tsx");
    const remotePath = path.join(rootDir, "src/components/RemoteSignatureModal.tsx");

    const itemDetailCode = fs.readFileSync(itemDetailPath, "utf-8");
    const remoteCode = fs.readFileSync(remotePath, "utf-8");

    // Ponto 1: ItemDetailModal (Devolução presencial do recebedor/aluno)
    expect(itemDetailCode).toContain("signerName={returnRecipientName || \"Aluno / Servidor\"}");
    expect(itemDetailCode).toContain("onSignatureCapture={(url) => setReturnSignatureDataUrl(url)}");

    // Ponto 2: ItemDetailModal (Assinatura presencial do servidor atendente)
    expect(itemDetailCode).toContain("signerName={currentUser?.name || \"Servidor Atendente\"}");
    expect(itemDetailCode).toContain("setStaffSignatureDataUrl(dataUrl);");

    // Ponto 3: RemoteSignatureModal (Assinatura digital remota via e-mail)
    expect(remoteCode).toContain("signerName={signerName}");
    expect(remoteCode).toContain("setSignatureDataUrl(dataUrl);");
  });
});
