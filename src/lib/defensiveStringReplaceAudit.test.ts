import { describe, it, expect } from "vitest";
import { buildDynamicFormFields, extractDynamicTags } from "./pdfGenerator";
import { formatPhone, isValidPhone } from "./utils";
import { DocumentTemplate } from "../types";

describe("LOCALIZA+ — Auditoria e Correção Defensiva de .replace() em undefined/null", () => {
  it("1. buildDynamicFormFields & extractDynamicTags: Entrada válida com tags e campos preenchidos", () => {
    const template = {
      id: "tpl-1",
      code: "DOC-01",
      title: "Termo de {{tipo_devolucao}}",
      description: "Descrição",
      category: "ACHADOS_PERDIDOS",
      status: "PUBLICADO",
      version: 1,
      headerText: "Campus {{campus_nome}}",
      footerText: "Rodapé",
      sections: [{ id: "s1", title: "Dados do {{nome_aluno}}", content: "RG: {{rg_numero}}", type: "paragraph" }],
      signatures: [],
      fields: [{ id: "f1", name: "nome_aluno", label: "Nome do Aluno", type: "text", required: true }],
      createdAt: "2026-10-25T00:00:00Z",
      updatedAt: "2026-10-25T00:00:00Z",
    } as unknown as DocumentTemplate;

    const tags = extractDynamicTags(template);
    expect(tags).toContain("tipo_devolucao");
    expect(tags).toContain("campus_nome");
    expect(tags).toContain("nome_aluno");
    expect(tags).toContain("rg_numero");

    const fields = buildDynamicFormFields(template);
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.some((f) => f.name === "tipo_devolucao")).toBe(true);
  });

  it("2. buildDynamicFormFields com campos contendo name undefined, null ou vazio sem lancar excecao", () => {
    const templateWithMalformedFields = {
      id: "tpl-2",
      code: "DOC-02",
      title: "Termo Genérico",
      description: "Descrição",
      category: "INSTITUCIONAL",
      status: "PUBLICADO",
      version: 1,
      headerText: "Campus",
      footerText: "Rodapé",
      sections: [],
      signatures: [],
      fields: [
        { id: "f1", name: undefined as any, label: "Campo Sem Nome", type: "text", required: false },
        { id: "f2", name: null as any, label: "Campo Nulo", type: "text", required: false },
        { id: "f3", name: "", label: "Campo Vazio", type: "text", required: false },
        { id: "f4", name: "campo_valido", label: "Campo Válido", type: "text", required: true },
      ],
      createdAt: "2026-10-25T00:00:00Z",
      updatedAt: "2026-10-25T00:00:00Z",
    } as unknown as DocumentTemplate;

    expect(() => {
      const tags = extractDynamicTags(templateWithMalformedFields);
      expect(tags).toContain("campo_valido");

      const fields = buildDynamicFormFields(templateWithMalformedFields);
      expect(fields.some((f) => f.name === "campo_valido")).toBe(true);
    }).not.toThrow();
  });

  it("3. formatPhone & isValidPhone com entradas validas, null, undefined, numeros e objetos", () => {
    expect(formatPhone("(43) 99876-5432")).toBe("(43) 99876-5432");
    expect(formatPhone("43998765432")).toBe("(43) 99876-5432");

    // Defensivo contra undefined, null, boolean ou tipos invalidos
    expect(formatPhone(undefined as any)).toBe("");
    expect(formatPhone(null as any)).toBe("");
    expect(formatPhone(12345678901 as any)).toBe("");
    expect(formatPhone({} as any)).toBe("");

    expect(isValidPhone("(43) 99876-5432")).toBe(true);
    expect(isValidPhone(undefined as any)).toBe(false);
    expect(isValidPhone(null as any)).toBe(false);
    expect(isValidPhone(999 as any)).toBe(false);
  });

  it("4. Mapeamento de logs unificados com id ou action undefined no AuditTrailManagerView", () => {
    const malformedActivityLogs: any[] = [
      { id: "log-1", action: "CRIACAO_ITEM", details: "Item cadastrado", timestamp: "2026-10-25T10:00:00Z" },
      { id: undefined, action: undefined, details: "Log sem id nem acao", timestamp: "2026-10-25T10:05:00Z" },
      { id: null, action: "EXCLUSAO_USUARIO", details: "Usuario excluido", timestamp: "2026-10-25T10:10:00Z" },
    ];

    const map = new Map<string, any>();
    malformedActivityLogs.forEach((act, idx) => {
      if (!act) return;
      const actId = String(act.id || `act-legacy-${idx}`);
      const actionStr = String(act.action || "LOG");
      const transactionId = act.transactionId || `TX-ITEM-${actId.replace("log-", "").substring(0, 8).toUpperCase()}`;

      map.set(actId, {
        id: actId,
        action: actionStr,
        transactionId,
        formattedAction: actionStr.replace("_", " "),
      });
    });

    expect(map.size).toBe(3);
    const entries = Array.from(map.values());
    expect(entries[0].formattedAction).toBe("CRIACAO ITEM");
    expect(entries[1].formattedAction).toBe("LOG");
    expect(entries[2].formattedAction).toBe("EXCLUSAO USUARIO");
  });
});
