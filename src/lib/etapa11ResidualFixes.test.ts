import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../context/AppContext", () => ({
  useApp: () => ({
    addToast: vi.fn(),
  }),
}));

import { computeHomeItemStats } from "./homeStatsUtils";
import {
  assertClientItemDataUpdateAllowed,
  assertDirectDocUpdateAllowed,
  classifyFirestoreWriteError,
} from "./clientItemSecurityGuards";
import {
  PRIVATE_ITEM_FIELDS,
  sanitizePublicItemProjection,
  extractPrivateReturnRecord,
  mergeItemWithPrivateRecord,
} from "./itemPrivacyUtils";
import { classifyQrLookupError, fetchItemFromFirestore } from "./qrCodeUtils";
import { APP_VERSIONS_DATA } from "../data/versionsData";
import { RestrictedQRViewModal } from "../components/RestrictedQRViewModal";
import { LostFoundItem } from "../types";

const makeTestItem = (overrides: Partial<LostFoundItem> & Pick<LostFoundItem, "id" | "title" | "type" | "status">): LostFoundItem => ({
  description: "Descrição padrão de teste",
  category: "Outros",
  location: "Portaria",
  date: "2026-10-01",
  color: "Preto",
  brand: "Genérica",
  imageUrl: "https://example.com/item.jpg",
  contactInfo: "portaria@ifpr.edu.br",
  registeredByUserId: "uid-servidor-1",
  registeredByName: "Servidor Teste",
  registeredByRole: "SERVIDOR",
  qrCodeId: "QR-TEST-DEFAULT",
  createdAt: "2026-10-01T12:00:00.000Z",
  ...overrides,
});

describe("ETAPA 11 — Regressão Completa dos Achados Residuais e Fluxos Críticos", () => {
  it("1. Contagem da HomeView calcula corretamente itens ativos (ENCONTRADO, PERDIDO, EM_ANALISE, PROPRIETARIO_IDENTIFICADO, DISPONIVEL), DEVOLVIDO, exclui ENCERRADO dos ativos e deduplica por id", () => {
    const sample: LostFoundItem[] = [
      makeTestItem({
        id: "enc-1",
        title: "Chaveiro",
        description: "Encontrado na entrada",
        category: "Chaves",
        type: "ENCONTRADO",
        status: "ENCONTRADO",
        location: "Portaria",
        date: "2026-10-01",
      }),
      makeTestItem({
        id: "enc-analise",
        title: "Fone Bluetooth",
        description: "Em análise",
        category: "Eletrônicos",
        type: "ENCONTRADO",
        status: "EM_ANALISE",
        location: "Bloco A",
        date: "2026-10-02",
      }),
      makeTestItem({
        id: "enc-identificado",
        title: "Relógio",
        description: "Proprietário identificado",
        category: "Acessórios & Bijuterias",
        type: "ENCONTRADO",
        status: "PROPRIETARIO_IDENTIFICADO",
        location: "Secretaria",
        date: "2026-10-03",
      }),
      makeTestItem({
        id: "enc-disp",
        title: "Garrafa",
        description: "Disponível legado",
        category: "Outros",
        type: "ENCONTRADO",
        status: "DISPONIVEL",
        location: "Biblioteca",
        date: "2026-10-04",
      }),
      makeTestItem({
        id: "perd-1",
        title: "Caderno",
        description: "Perdido no pátio",
        category: "Material Escolar & Livros",
        type: "PERDIDO",
        status: "PERDIDO",
        location: "Pátio",
        date: "2026-10-05",
      }),
      makeTestItem({
        id: "perd-disp",
        title: "Mochila",
        description: "Perdida legado",
        category: "Acessórios & Bijuterias",
        type: "PERDIDO",
        status: "DISPONIVEL",
        location: "Quadra",
        date: "2026-10-06",
      }),
      makeTestItem({
        id: "dev-1",
        title: "Carteira",
        description: "Devolvida",
        category: "Documentos & Cartões",
        type: "ENCONTRADO",
        status: "DEVOLVIDO",
        location: "Portaria",
        date: "2026-10-07",
      }),
      makeTestItem({
        id: "closed-1",
        title: "Agasalho antigo",
        description: "Doado",
        category: "Roupas & Calçados",
        type: "ENCONTRADO",
        status: "ENCERRADO",
        location: "SEPAE",
        date: "2026-09-01",
      }),
      // Duplicata intencional para validar deduplicação sem mutação
      makeTestItem({
        id: "enc-1",
        title: "Chaveiro duplicado",
        description: "Duplicado",
        category: "Chaves",
        type: "ENCONTRADO",
        status: "ENCONTRADO",
        location: "Portaria",
        date: "2026-10-01",
      }),
    ];

    const snapshotCopy = JSON.stringify(sample);
    const stats = computeHomeItemStats(sample);

    expect(stats.totalItems).toBe(8);
    expect(stats.foundItems).toBe(4); // ENCONTRADO + EM_ANALISE + PROPRIETARIO_IDENTIFICADO + DISPONIVEL
    expect(stats.lostItems).toBe(2); // PERDIDO + DISPONIVEL
    expect(stats.returnedItems).toBe(1); // Apenas DEVOLVIDO
    expect(JSON.stringify(sample)).toBe(snapshotCopy);

    const homeSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/HomeView.tsx"),
      "utf-8"
    );
    expect(homeSource).toContain("computeHomeItemStats(items)");
    expect(homeSource).not.toContain('i.status === "DISPONIVEL"');
  });

  it("3. firestore.rules impede criação de audit_logs e activity_logs falsos via Client SDK com ações exclusivas do servidor", () => {
    const rules = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf-8");
    expect(rules).toContain("function isAllowedClientAuditAction(data)");
    for (const action of [
      "REGISTRO_DEVOLUCAO",
      "REABERTURA_DEVOLUCAO",
      "CONFIRMACAO_NOTIFICACAO_ASSINATURA",
      "ROLE_ASSIGNED",
      "ROLE_REVOKED",
      "ACCOUNT_DELETED",
      "UPDATE_SYSTEM_CONFIG",
      "UNAUTHORIZED_AI_ATTEMPT",
    ]) {
      expect(rules).toContain(`'${action}'`);
    }
    expect(rules).toMatch(/match \/activity_logs\/\{logId\}[\s\S]*?isAllowedClientAuditAction\(incoming\(\)\)/);
    expect(rules).toMatch(/match \/audit_logs\/\{logId\}[\s\S]*?isAllowedClientAuditAction\(incoming\(\)\)/);
  });

  it("4. updateItemData bloqueia alteração direta para DEVOLVIDO e ENCERRADO e preserva registerItemDestination", () => {
    expect(() => assertClientItemDataUpdateAllowed({ status: "DEVOLVIDO" })).toThrow(/DEVOLVIDO/);
    expect(() => assertClientItemDataUpdateAllowed({ status: "ENCERRADO" })).toThrow(/ENCERRADO/);
    expect(() => assertClientItemDataUpdateAllowed({ title: "Título atualizado", status: "EM_ANALISE" })).not.toThrow();

    const appCtx = fs.readFileSync(path.resolve(process.cwd(), "src/context/AppContext.tsx"), "utf-8");
    expect(appCtx).toContain("assertClientItemDataUpdateAllowed(updatedFields)");
    expect(appCtx).toContain("const registerItemDestination = async");
    expect(appCtx).toContain('status: "ENCERRADO" as ItemStatus');
  });

  it("5. updateDocDirectly bloqueia status DEVOLVIDO/ENCERRADO, itens já finalizados e campos protegidos de devolução/PII", () => {
    expect(() => assertDirectDocUpdateAllowed("items", { status: "DEVOLVIDO" })).toThrow(/DEVOLVIDO/);
    expect(() => assertDirectDocUpdateAllowed("found_items", { status: "ENCERRADO" })).toThrow(/ENCERRADO/);
    expect(() => assertDirectDocUpdateAllowed("lost_items", { title: "Editado" }, "DEVOLVIDO")).toThrow(/finalizado/);
    expect(() => assertDirectDocUpdateAllowed("items", { destinationType: "DOACAO" })).toThrow(/encerramento/);

    for (const protectedField of PRIVATE_ITEM_FIELDS) {
      expect(() =>
        assertDirectDocUpdateAllowed("items", { [protectedField]: "bypass" }, "ENCONTRADO")
      ).toThrow(new RegExp(protectedField));
    }

    const appCtx = fs.readFileSync(path.resolve(process.cwd(), "src/context/AppContext.tsx"), "utf-8");
    expect(appCtx).toContain("assertDirectDocUpdateAllowed(collectionName, data, existingItem?.status)");
  });

  it("6. addCommentToItem não emite falso sucesso quando setDoc falha e classifica erro real de rede/permissão", () => {
    const appCtx = fs.readFileSync(path.resolve(process.cwd(), "src/context/AppContext.tsx"), "utf-8");
    const addCommentIdx = appCtx.indexOf("const addCommentToItem = async");
    const nextSectionIdx = appCtx.indexOf("// Sync Activity Logs from Firestore", addCommentIdx);
    const fnBody = appCtx.slice(addCommentIdx, nextSectionIdx);

    expect(fnBody).toContain("await setDoc(doc(db, \"comments\", newComment.id), newComment);");
    expect(fnBody).toContain("classifyFirestoreWriteError");
    expect(fnBody).toContain("throw err;");

    // No catch, nunca pode chamar setComments ou addToast(..., "success")
    const catchBody = fnBody.slice(fnBody.indexOf("catch (err)"));
    expect(catchBody).not.toContain("setComments");
    expect(catchBody).not.toContain('"success"');

    expect(classifyFirestoreWriteError({ code: "permission-denied" }).kind).toBe("PERMISSION_DENIED");
    expect(classifyFirestoreWriteError({ code: "unavailable" }).kind).toBe("NETWORK_ERROR");
  });

  it("7. resetSystemData exige ADMIN, não limpa estado local nem emite sucesso falso quando Firestore falha, e DashboardView trata rejeição", () => {
    const appCtx = fs.readFileSync(path.resolve(process.cwd(), "src/context/AppContext.tsx"), "utf-8");
    const resetIdx = appCtx.indexOf("const resetSystemData = async");
    const nextFnIdx = appCtx.indexOf("const clearAllLogsAndMetrics = async", resetIdx);
    const resetBody = appCtx.slice(resetIdx, nextFnIdx);

    expect(resetBody).toContain('currentUser?.role !== "ADMIN"');
    expect(resetBody).toContain("classifyFirestoreWriteError");
    expect(resetBody).toContain("throw e;");

    const resetCatch = resetBody.slice(resetBody.indexOf("catch (e"));
    expect(resetCatch).not.toContain("setItems([])");
    expect(resetCatch).not.toContain('"success"');

    const dashboardSrc = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/DashboardView.tsx"),
      "utf-8"
    );
    expect(dashboardSrc).toMatch(/try\s*\{\s*await resetSystemData\(\);\s*await logAdminAction\("RESET_SISTEMA"/);
  });

  it("8. versionsData.ts possui exatamente uma versão com isCurrent: true (v1.10.13)", () => {
    const currentVersions = APP_VERSIONS_DATA.filter((v) => v.isCurrent === true);
    expect(currentVersions).toHaveLength(1);
    expect(currentVersions[0].version).toBe("v1.10.13");
  });

  it("9. RestrictedQRViewModal recebe currentItem atualizado do ItemDetailModal e renderiza dados vivos", () => {
    const detailModalSrc = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/ItemDetailModal.tsx"),
      "utf-8"
    );
    expect(detailModalSrc).toMatch(/<RestrictedQRViewModal[\s\S]*?item=\{currentItem\}/);

    const updatedItem: LostFoundItem = makeTestItem({
      id: "qr-live-1",
      title: "Garrafa Térmica Atualizada",
      description: "Garrafa inox com tampa verde",
      category: "Garrafas & Marmitas",
      type: "ENCONTRADO",
      status: "EM_ANALISE",
      location: "Secretaria Acadêmica",
      date: "2026-10-15",
      qrCodeId: "QR-IFPR-LIVE-1",
    });

    const html = renderToStaticMarkup(
      React.createElement(RestrictedQRViewModal, {
        item: updatedItem,
        onClose: () => {},
      })
    );
    expect(html).toContain("Garrafa Térmica Atualizada");
    expect(html).toContain("Secretaria Acadêmica");
    expect(html).toContain("QR-IFPR-LIVE-1");
  });

  it("10. Fluxo de QR Code propaga erros reais via throwOnError e QRCodeScannerModal trata inicialização do BarcodeDetector e limpeza de câmera", async () => {
    await expect(
      fetchItemFromFirestore("item-erro-perm", {
        throwOnError: true,
        firestoreMocks: {
          getById: async () => {
            const err: any = new Error("Missing or insufficient permissions.");
            err.code = "permission-denied";
            throw err;
          },
        },
      })
    ).rejects.toThrow(/permissions/);

    expect(classifyQrLookupError({ code: "permission-denied" }).kind).toBe("PERMISSION_DENIED");
    expect(classifyQrLookupError({ code: "unavailable" }).kind).toBe("NETWORK_ERROR");

    const appSrc = fs.readFileSync(path.resolve(process.cwd(), "src/App.tsx"), "utf-8");
    expect(appSrc).toContain("fetchItemFromFirestore(parsed, { throwOnError: true })");
    expect(appSrc).toContain("classifyQrLookupError(err)");

    const scannerSrc = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/QRCodeScannerModal.tsx"),
      "utf-8"
    );
    expect(scannerSrc).toContain("setScannerInitError");
    expect(scannerSrc).toContain("isModalOpenRef.current");
    expect(scannerSrc).not.toMatch(/catch\s*\(_?\)\s*\{\s*\}/);
  });

  it("14 & 15. Bloqueio de baixa direta para DEVOLVIDO e isolamento de PII em /item_return_records permanecem íntegros", () => {
    const rawWithPii = makeTestItem({
      id: "item-pii-1",
      title: "Documento RG",
      description: "Encontrado próximo ao refeitório",
      category: "Documentos & Cartões",
      type: "ENCONTRADO",
      status: "DEVOLVIDO",
      location: "Portaria",
      date: "2026-10-10",
      recipientName: "Maria Silva",
      recipientEmail: "maria@estudantes.ifpr.edu.br",
      recipientDocument: "12345678900",
      recipientSignatureUrl: "data:image/png;base64,ABC",
      receiptValidationCode: "REC-IFPR-999",
      secretVerificationKey: "segredo-interno",
    });

    const publicDoc = sanitizePublicItemProjection(rawWithPii);
    for (const priv of PRIVATE_ITEM_FIELDS) {
      expect(priv in publicDoc).toBe(false);
    }

    const privateRecord = extractPrivateReturnRecord(rawWithPii);
    expect(privateRecord.recipientName).toBe("Maria Silva");
    expect(privateRecord.receiptValidationCode).toBe("REC-IFPR-999");

    const mergedForStaff = mergeItemWithPrivateRecord(publicDoc as LostFoundItem, privateRecord);
    expect(mergedForStaff.recipientName).toBe("Maria Silva");
    expect(mergedForStaff.receiptValidationCode).toBe("REC-IFPR-999");
  });
});
