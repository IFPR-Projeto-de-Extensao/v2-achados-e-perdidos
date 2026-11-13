import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import {
  upsertItemPreservingFields,
  buildItemStatusTransitionPatch,
} from "./itemStateSync";
import {
  sortAndFilterAdminTableItems,
  buildPieCategoryData,
  readAvailableMemoryUsageMB,
} from "./dashboardMetricsUtils";
import {
  MAX_SAFE_ITEM_IMAGE_BYTES,
  compressItemImageSafely,
  validateItemImageAndPayloadSize,
  CompressedImageResult,
} from "./imageCompression";
import { FIRESTORE_DEFENSIVE_PAYLOAD_LIMIT_BYTES } from "./payloadSizeGuard";
import { canOperateFormalReturn, canReopenFormalReturn } from "./devolutionAuth";
import { LostFoundItem, User } from "../types";

function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

function makeItem(overrides: Partial<LostFoundItem> = {}): LostFoundItem {
  return {
    id: "item-001",
    title: "Carteira Preta IFPR",
    description: "Carteira de couro com zíper",
    category: "Documentos & Cartões",
    type: "ENCONTRADO",
    status: "ENCONTRADO",
    location: "Biblioteca",
    date: "2026-04-10",
    createdAt: "2026-04-10T10:00:00.000Z",
    registeredByUserId: "user-staff-1",
    registeredByName: "Servidor Campus",
    registeredByRole: "SERVIDOR",
    contactInfo: "sebac@ifpr.edu.br",
    qrCodeId: "QR-IFPR-001",
    color: "Preto",
    brand: "Couro",
    imageUrl: "",
    ...overrides,
  };
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "u-1",
    name: "Usuário IFPR",
    email: "usuario@ifpr.edu.br",
    role: "SERVIDOR",
    approvalStatus: "APROVADO",
    status: "active",
    courseOrDept: "SEBAC Campus Ivaiporã",
    registrationNumber: "2026001",
    avatarUrl: "",
    reputationScore: 100,
    ...overrides,
  };
}

function makeCompressed(base64: string): CompressedImageResult {
  const byteLen = Buffer.byteLength(base64, "utf8");
  return {
    base64,
    blob: new Blob(["ok"], { type: "image/webp" }),
    originalSizeBytes: byteLen * 2,
    compressedSizeBytes: byteLen,
    savingsPercentage: 50,
    width: 800,
    height: 600,
    formattedOriginalSize: `${byteLen * 2} B`,
    formattedCompressedSize: `${byteLen} B`,
  };
}

describe("Auditoria Pós-Correção — Correção dos 5 Defeitos Residuais (v1.10.13)", () => {
  describe("Correção 1 — ItemDetailModal & Sincronização de Estado em AppContext", () => {
    it("upsertItemPreservingFields atualiza item existente preservando ordem e todos os campos", () => {
      const i1 = makeItem({ id: "i1", status: "ENCONTRADO", qrCodeId: "QR-1" });
      const i2 = makeItem({ id: "i2", status: "PERDIDO", qrCodeId: "QR-2" });
      const updated1: LostFoundItem = {
        ...i1,
        status: "EM_ANALISE",
        resolutionDate: undefined,
      };

      const next = upsertItemPreservingFields([i1, i2], updated1);
      expect(next).toHaveLength(2);
      expect(next[0].id).toBe("i1");
      expect(next[0].status).toBe("EM_ANALISE");
      expect(next[0].qrCodeId).toBe("QR-1");
      expect(next[1].id).toBe("i2");
    });

    it("upsertItemPreservingFields insere item carregado diretamente via QR Code ou deep-link quando ausente na lista local", () => {
      const existing = makeItem({ id: "i1" });
      const qrLoadedItem = makeItem({
        id: "qr-deep-99",
        status: "EM_ANALISE",
        title: "Chaveiro Laboratório",
      });

      const next = upsertItemPreservingFields([existing], qrLoadedItem);
      expect(next).toHaveLength(2);
      expect(next[0].id).toBe("qr-deep-99");
      expect(next[0].status).toBe("EM_ANALISE");
      expect(next[1].id).toBe("i1");
    });

    it("ItemDetailModal.tsx não lê propriedades obsoletas do prop estático `item` (toda UI, PDF, QR e handlers usam `currentItem`)", () => {
      const modalSrc = readSrc("src/components/ItemDetailModal.tsx");
      expect(modalSrc).toContain("const currentItem = items.find((i) => i.id === item.id) || item;");

      // Garante que nenhuma referência residual de leitura UI/handler permaneceu ligada a `item.` ou `item?.`
      // além da linha de resolução de `currentItem`
      const lines = modalSrc.split("\n");
      const residualItemPropReads = lines.filter((line, idx) => {
        if (idx + 1 === 147 && line.includes("items.find((i) => i.id === item.id)")) {
          return false;
        }
        return /(?<![A-Za-zÀ-ÿ])item(\?\.|\.)[A-Za-z_]/.test(line);
      });

      expect(residualItemPropReads).toEqual([]);
      expect(modalSrc).toContain("<AccessibleVoiceReader item={currentItem} />");
      expect(modalSrc).toContain("id={`qr-code-svg-${currentItem.id}`}");
      expect(modalSrc).toContain("id={`detail-new-badge-${currentItem.id}`}");
    });

    it("AppContext.tsx sincroniza selectedItemForDetail e systemLatencyMs não inicia com valor fictício", () => {
      const ctxSrc = readSrc("src/context/AppContext.tsx");
      expect(ctxSrc).toContain("inFlightItemStatusOpsRef");
      expect(ctxSrc).toContain("upsertItemPreservingFields(prev, syncedUpdatedItem)");
      expect(ctxSrc).toContain("setSelectedItemForDetail((prev) =>");
      expect(ctxSrc).toContain("const [systemLatencyMs, setSystemLatencyMs] = useState<number | null>(null);");
      expect(ctxSrc).not.toContain("useState<number | null>(24)");
    });
  });

  describe("Correção 2 — Integridade de bulkUpdateItemStatus & Permissões em ObjectsView", () => {
    it("buildItemStatusTransitionPatch gera history, historyLogs, audit_logs, activity_logs e remove resolutionDate com deleteField()", () => {
      const existing = makeItem({
        id: "obj-bulk-1",
        status: "ENCONTRADO",
        resolutionDate: "2026-04-01T12:00:00.000Z",
        history: [
          {
            id: "h-init",
            action: "Cadastro Inicial",
            actorId: "u1",
            actorName: "Servidor",
            actorRole: "SERVIDOR",
            timestamp: "2026-04-01T10:00:00.000Z",
          },
        ],
      });

      const patch = buildItemStatusTransitionPatch({
        existing,
        newStatus: "EM_ANALISE",
        actorId: "uid-servidor-aprovado",
        actorName: "Servidora Maria",
        actorEmail: "maria@ifpr.edu.br",
        actorRole: "SERVIDOR",
        isBulk: true,
        nowIso: "2026-04-12T14:30:00.000Z",
        transactionId: "TX-TEST-01",
      });

      expect(patch.updatedItem.status).toBe("EM_ANALISE");
      expect(patch.updatedItem.resolutionDate).toBeUndefined();
      expect(patch.nextHistory).toHaveLength(2);
      expect(patch.updatedItem.history).toEqual(patch.nextHistory);
      expect(patch.updatedItem.historyLogs).toEqual(patch.nextHistory);
      expect(patch.firestoreItemUpdate.status).toBe("EM_ANALISE");
      expect(patch.firestoreItemUpdate.resolutionDate).toBeDefined();
      expect(patch.firestoreItemUpdate.historyLogs).toEqual(patch.nextHistory);

      expect(patch.auditLogDoc).toMatchObject({
        action: "STATUS_OVERRIDE",
        objectId: "obj-bulk-1",
        objectType: "ITEM",
        actorId: "uid-servidor-aprovado",
        actorEmail: "maria@ifpr.edu.br",
        actorRole: "SERVIDOR",
        oldValue: "ENCONTRADO",
        newValue: "EM_ANALISE",
      });

      expect(patch.activityLogDoc).toMatchObject({
        action: "STATUS_OVERRIDE",
        objectId: "obj-bulk-1",
        objectType: "ITEM",
        actorId: "uid-servidor-aprovado",
        adminId: "uid-servidor-aprovado",
        actorEmail: "maria@ifpr.edu.br",
        adminEmail: "maria@ifpr.edu.br",
        actorRole: "SERVIDOR",
        oldValue: "ENCONTRADO",
        newValue: "EM_ANALISE",
      });
    });

    it("canOperateFormalReturn bloqueia SERVIDOR pendente, suspenso, banido, e-mail não verificado, ALUNO, INTRUSO e visitante; libera apenas SERVIDOR ativo/aprovado e ADMIN ativo", () => {
      const authActive = { uid: "u-1", email: "usuario@ifpr.edu.br", emailVerified: true } as any;
      const authUnverified = { uid: "u-1", email: "usuario@ifpr.edu.br", emailVerified: false } as any;

      expect(
        canOperateFormalReturn(
          makeUser({ id: "u-1", role: "SERVIDOR", approvalStatus: "APROVADO", status: "active" }),
          authUnverified,
          false
        )
      ).toBe(false);

      expect(
        canOperateFormalReturn(
          makeUser({ id: "u-1", role: "SERVIDOR", approvalStatus: "APROVADO", status: "active" }),
          authActive,
          false
        )
      ).toBe(true);
      expect(
        canOperateFormalReturn(
          makeUser({ id: "u-1", role: "ADMIN", approvalStatus: "APROVADO", status: "active" }),
          authActive,
          false
        )
      ).toBe(true);
      expect(
        canOperateFormalReturn(
          makeUser({ id: "u-1", role: "SERVIDOR", approvalStatus: "PENDENTE", status: "active" }),
          authActive,
          false
        )
      ).toBe(false);
      expect(
        canOperateFormalReturn(
          makeUser({ id: "u-1", role: "SERVIDOR", approvalStatus: "APROVADO", status: "suspended" }),
          authActive,
          false
        )
      ).toBe(false);
      expect(
        canOperateFormalReturn(
          makeUser({ id: "u-1", role: "ALUNO", approvalStatus: "APROVADO", status: "active" }),
          authActive,
          false
        )
      ).toBe(false);
      expect(
        canOperateFormalReturn(
          makeUser({ id: "u-1", role: "INTRUSO", approvalStatus: "APROVADO", status: "active" }),
          authActive,
          false
        )
      ).toBe(false);
      expect(
        canOperateFormalReturn(
          makeUser({ id: "u-1", role: "SERVIDOR", approvalStatus: "APROVADO", status: "active" }),
          authActive,
          true
        )
      ).toBe(false);

      expect(
        canReopenFormalReturn(
          makeUser({ id: "u-1", role: "ADMIN", approvalStatus: "APROVADO", status: "active" }),
          authActive,
          false
        )
      ).toBe(true);
      expect(
        canReopenFormalReturn(
          makeUser({ id: "u-1", role: "SERVIDOR", approvalStatus: "APROVADO", status: "active" }),
          authActive,
          false
        )
      ).toBe(false);
    });

    it("AppContext bulkUpdateItemStatus usa writeBatch atômico com auditoria por item e bloqueio de DEVOLVIDO/ENCERRADO", () => {
      const ctxSrc = readSrc("src/context/AppContext.tsx");
      const bulkIdx = ctxSrc.indexOf("const bulkUpdateItemStatus = async");
      expect(bulkIdx).toBeGreaterThan(-1);
      const bulkFn = ctxSrc.slice(bulkIdx, bulkIdx + 5500);

      expect(bulkFn).toContain('status === "DEVOLVIDO"');
      expect(bulkFn).toContain('status === "ENCERRADO"');
      expect(bulkFn).toContain("canOperateFormalReturn");
      expect(bulkFn).toContain("writeBatch(db)");
      expect(bulkFn).toContain("buildItemStatusTransitionPatch");
      expect(bulkFn).toContain('doc(db, "audit_logs"');
      expect(bulkFn).toContain('doc(db, "activity_logs"');
      expect(bulkFn).toContain("inFlightItemStatusOpsRef.current");
    });

    it("ObjectsView.tsx exige canOperateFormalReturn e trava botões durante ação em lote", () => {
      const objSrc = readSrc("src/components/ObjectsView.tsx");
      expect(objSrc).toContain("const canManageBulkItems = canOperateFormalReturn(currentUser, auth.currentUser, isGuest);");
      expect(objSrc).toContain("const canBulkDeleteItems = canReopenFormalReturn(currentUser, auth.currentUser, isGuest);");
      expect(objSrc).toContain("isBulkUpdating");
      expect(objSrc).not.toContain('currentUser.role === "ADMIN" || currentUser.role === "SERVIDOR"');
    });
  });

  describe("Correção 3 — Responsividade, Ordenação e Paginação em Controle de Objetos (Admin)", () => {
    it("sortAndFilterAdminTableItems prioriza ENCONTRADO/PERDIDO -> EM_ANALISE -> DEVOLVIDO/ENCERRADO e busca por ID/QR/Título", () => {
      const items: LostFoundItem[] = [
        makeItem({
          id: "i-devolvido",
          title: "Garrafa Azul",
          status: "DEVOLVIDO",
          createdAt: "2026-04-12T12:00:00.000Z",
          qrCodeId: "QR-GARRAFA",
        }),
        makeItem({
          id: "i-analise",
          title: "Caderno IFPR",
          status: "EM_ANALISE",
          createdAt: "2026-04-12T10:00:00.000Z",
          qrCodeId: "QR-CADERNO",
        }),
        makeItem({
          id: "i-encontrado-antigo",
          title: "Chave Moto",
          status: "ENCONTRADO",
          createdAt: "2026-04-10T08:00:00.000Z",
          qrCodeId: "QR-CHAVE-1",
        }),
        makeItem({
          id: "i-perdido-recente",
          title: "Fone Bluetooth",
          status: "PERDIDO",
          createdAt: "2026-04-12T09:00:00.000Z",
          qrCodeId: "QR-FONE-9",
        }),
      ];

      const sorted = sortAndFilterAdminTableItems(items);
      expect(sorted.map((i) => i.id)).toEqual([
        "i-perdido-recente",
        "i-encontrado-antigo",
        "i-analise",
        "i-devolvido",
      ]);

      const byQr = sortAndFilterAdminTableItems(items, { search: "QR-FONE-9" });
      expect(byQr).toHaveLength(1);
      expect(byQr[0].id).toBe("i-perdido-recente");
    });

    it("DashboardView.tsx implementa cartões empilhados mobile (md:hidden), tabela desktop (hidden md:block), paginação progressiva e empty state", () => {
      const dashSrc = readSrc("src/components/DashboardView.tsx");
      const sectionStart = dashSrc.indexOf("Controle de Objetos e Override de Status");
      const sectionEnd = dashSrc.indexOf("{/* TAB: AUDITORIA E LOGS DO SISTEMA */}", sectionStart);
      expect(sectionStart).toBeGreaterThan(-1);
      expect(sectionEnd).toBeGreaterThan(sectionStart);
      const sectionCode = dashSrc.slice(sectionStart, sectionEnd);

      expect(sectionCode).toContain("md:hidden space-y-3");
      expect(sectionCode).toContain("hidden md:block overflow-x-auto");
      expect(sectionCode).toContain("adminTableLimit");
      expect(sectionCode).toContain("Mostrar mais objetos");
      expect(sectionCode).toContain("Nenhum objeto encontrado neste filtro");
      expect(sectionCode).toContain("handleConfirmArrival(item)");
      expect(sectionCode).toContain("handleAdminStatusOverride(");
      expect(sectionCode).toContain("handleOpenNotifyModalForItem(item)");
      expect(sectionCode).not.toContain('<option value="DEVOLVIDO">');
    });
  });

  describe("Correção 4 — Upload / Captura Segura de Imagem em RegisterItemView", () => {
    it("compressItemImageSafely aceita imagem comprimida dentro do limite sem acionar fallback", async () => {
      const mockCompressor = vi.fn(async () => makeCompressed("data:image/webp;base64,QUJDRA=="));
      const outcome = await compressItemImageSafely("data:image/png;base64,RAW", mockCompressor);

      expect(outcome.ok).toBe(true);
      if (!("reason" in outcome)) {
        expect(outcome.usedFallbackCompression).toBe(false);
        expect(outcome.byteSize).toBeLessThanOrEqual(MAX_SAFE_ITEM_IMAGE_BYTES);
      }
      expect(mockCompressor).toHaveBeenCalledTimes(1);
    });

    it("compressItemImageSafely usa fallback JPEG mais agressivo quando WebP inicial falha ou fica acima do limite", async () => {
      const huge = "data:image/webp;base64," + "A".repeat(MAX_SAFE_ITEM_IMAGE_BYTES + 25_000);
      const smallJpeg = "data:image/jpeg;base64,QUJDREVGRw==";
      const mockCompressor = vi
        .fn()
        .mockResolvedValueOnce(makeCompressed(huge))
        .mockResolvedValueOnce(makeCompressed(smallJpeg));

      const outcome = await compressItemImageSafely("data:image/png;base64,RAW", mockCompressor);
      expect(outcome.ok).toBe(true);
      if (!("reason" in outcome)) {
        expect(outcome.usedFallbackCompression).toBe(true);
        expect(outcome.result.base64).toBe(smallJpeg);
      }
      expect(mockCompressor).toHaveBeenCalledTimes(2);
    });

    it("compressItemImageSafely rejeita com COMPRESSION_FAILED quando todas as tentativas falham (nunca retorna base64 bruto)", async () => {
      const mockCompressor = vi.fn().mockRejectedValue(new Error("Canvas errored"));
      const outcome = await compressItemImageSafely("data:image/png;base64,RAW", mockCompressor);

      expect(outcome.ok).toBe(false);
      if ("reason" in outcome) {
        expect(outcome.reason).toBe("COMPRESSION_FAILED");
        expect(outcome.message).toContain("Não foi possível processar");
      }
      expect(mockCompressor).toHaveBeenCalledTimes(3);
    });

    it("validateItemImageAndPayloadSize bloqueia imagem acima de MAX_SAFE_ITEM_IMAGE_BYTES e preserva limite defensivo 900.000", () => {
      expect(FIRESTORE_DEFENSIVE_PAYLOAD_LIMIT_BYTES).toBe(900_000);

      const okRes = validateItemImageAndPayloadSize({
        imageUrl: "data:image/webp;base64,QUJD",
        fields: { title: "Garrafa IFPR", description: "Garrafa térmica verde" },
      });
      expect(okRes.isValid).toBe(true);

      const tooBigImg = "data:image/jpeg;base64," + "X".repeat(MAX_SAFE_ITEM_IMAGE_BYTES + 5000);
      const imgFail = validateItemImageAndPayloadSize({
        imageUrl: tooBigImg,
        fields: { title: "Garrafa" },
      });
      expect(imgFail.isValid).toBe(false);
      expect(imgFail.reason).toBe("IMAGE_TOO_LARGE");

      // Imagem perto do limite de imagem + textos gigantes ultrapassando 900.000 bytes
      const nearSafeImg = "data:image/jpeg;base64," + "X".repeat(MAX_SAFE_ITEM_IMAGE_BYTES - 100);
      const hugeText = "Z".repeat(200_000);
      const totalFail = validateItemImageAndPayloadSize({
        imageUrl: nearSafeImg,
        fields: { description: hugeText },
      });
      expect(totalFail.isValid).toBe(false);
      expect(totalFail.reason).toBe("PAYLOAD_TOO_LARGE");
    });

    it("RegisterItemView.tsx removeu fallback bruto sem compressão, false success toasts e bloqueia avanço nas Etapas 2 e 3", () => {
      const regSrc = readSrc("src/components/RegisterItemView.tsx");
      expect(regSrc).toContain("compressItemImageSafely");
      expect(regSrc).toContain("validateItemImageAndPayloadSize");
      expect(regSrc).toContain("stepErrors.image");
      expect(regSrc).not.toContain("Foto anexada (modo de compatibilidade sem compressão)");
      expect(regSrc).not.toContain("Foto capturada (sem compressão adicional)");
    });
  });

  describe("Correção 5 — Eliminação de Métricas e Gráficos Fictícios em DashboardView", () => {
    it("buildPieCategoryData retorna [] quando não há objetos reais e contabiliza corretamente quando há objetos", () => {
      expect(buildPieCategoryData([])).toEqual([]);
      const result = buildPieCategoryData([
        makeItem({ id: "1", category: "Chaves" }),
        makeItem({ id: "2", category: "Chaves" }),
        makeItem({ id: "3", category: "Eletrônicos" }),
      ]);
      expect(result).toEqual([
        { name: "Chaves", value: 2 },
        { name: "Eletrônicos", value: 1 },
      ]);
    });

    it("readAvailableMemoryUsageMB retorna null quando performance.memory está ausente e MB real quando disponível", () => {
      expect(readAvailableMemoryUsageMB(null)).toBeNull();
      expect(readAvailableMemoryUsageMB({})).toBeNull();
      expect(readAvailableMemoryUsageMB({ memory: {} })).toBeNull();
      expect(
        readAvailableMemoryUsageMB({ memory: { usedJSHeapSize: 64 * 1024 * 1024 } })
      ).toBe(64);
    });

    it("DashboardView.tsx não possui valores seed/fallback fictícios e exibe estados indisponíveis/vazios honestos", () => {
      const dashSrc = readSrc("src/components/DashboardView.tsx");
      expect(dashSrc).not.toContain("42.8");
      expect(dashSrc).not.toContain('"08:10"');
      expect(dashSrc).not.toContain("🟢 Excelente");
      expect(dashSrc).toContain("const [pingLatencyMs, setPingLatencyMs] = useState<number | null>(null);");
      expect(dashSrc).toContain("const [dbLatencyMs, setDbLatencyMs] = useState<number | null>(null);");
      expect(dashSrc).toContain("const [memoryUsageMB, setMemoryUsageMB] = useState<number | null>(null);");
      expect(dashSrc).toContain("Nenhum objeto cadastrado para exibir distribuição por categoria.");
      expect(dashSrc).toContain("Nenhuma amostra real de latência coletada nesta sessão.");
    });
  });
});
