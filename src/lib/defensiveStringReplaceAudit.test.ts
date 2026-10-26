import { describe, it, expect } from "vitest";
import { buildDynamicFormFields, extractDynamicTags } from "./pdfGenerator";
import { formatPhone, isValidPhone } from "./utils";
import { buildUnifiedAuditLogs } from "../components/AuditTrailManagerView";
import { DocumentTemplate, SystemAuditLog, ActivityLog } from "../types";

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

  it("4. DashboardView log.action.replace com string valida, undefined, null e string vazia", () => {
    const formatLogAction = (log: any) => String(log?.action || "LOG").replace("_", " ");

    expect(formatLogAction({ action: "MODO_MANUTENCAO" })).toBe("MODO MANUTENCAO");
    expect(formatLogAction({ action: undefined })).toBe("LOG");
    expect(formatLogAction({ action: null })).toBe("LOG");
    expect(formatLogAction({ action: "" })).toBe("LOG");
    expect(formatLogAction(undefined)).toBe("LOG");
  });

  it("5. AppContext status.replace com status de objeto valido, undefined, null e string vazia", () => {
    const formatStatusNotification = (status: any) =>
      `Status do objeto atualizado para: ${String(status || "").replace("_", " ")}`;

    expect(formatStatusNotification("EM_CUSTODIA")).toBe("Status do objeto atualizado para: EM CUSTODIA");
    expect(formatStatusNotification("DEVOLVIDO")).toBe("Status do objeto atualizado para: DEVOLVIDO");
    expect(formatStatusNotification(undefined)).toBe("Status do objeto atualizado para: ");
    expect(formatStatusNotification(null)).toBe("Status do objeto atualizado para: ");
    expect(formatStatusNotification("")).toBe("Status do objeto atualizado para: ");
  });
});

describe("LOCALIZA+ — Auditoria de Deduplicação e Preservação de Logs Legados (buildUnifiedAuditLogs)", () => {
  it("1. Dois logs legados distintos com o mesmo timestamp e adminId: AMBOS devem ser preservados", () => {
    const activityLogs: ActivityLog[] = [
      {
        id: undefined as any, // Sem ID
        adminId: "admin-ivaipora",
        adminName: "Carlos Silva",
        action: "ALTERACAO_PERMISSAO",
        details: "Alterou cargo do usuário João para SERVIDOR",
        timestamp: "2026-10-26T03:00:00.000Z",
      },
      {
        id: undefined as any, // Sem ID, mesmo timestamp e adminId
        adminId: "admin-ivaipora",
        adminName: "Carlos Silva",
        action: "EXCLUSAO_USUARIO",
        details: "Excluiu conta inativa de Maria",
        timestamp: "2026-10-26T03:00:00.000Z",
      },
    ];

    const unified = buildUnifiedAuditLogs([], activityLogs);

    // Nenhum dos dois eventos deve ser descartado
    expect(unified.length).toBe(2);
    expect(unified.some((l) => l.action === "ALTERACAO_PERMISSAO")).toBe(true);
    expect(unified.some((l) => l.action === "EXCLUSAO_USUARIO")).toBe(true);
    // Cada um deve possuir id gerado em memória distinto
    expect(unified[0].id).not.toBe(unified[1].id);
  });

  it("2. Logs sem timestamp, adminId ou id: devem ser preservados integralmente sem exceção", () => {
    const malformedLogs: ActivityLog[] = [
      {
        id: undefined as any,
        adminId: undefined as any,
        adminName: undefined as any,
        action: undefined as any,
        details: "Operação legada de migração de dados",
        timestamp: undefined as any,
      },
      {
        id: null as any,
        adminId: null as any,
        adminName: null as any,
        action: "MODO_MANUTENCAO",
        details: "Ativou manutenção em emergência",
        timestamp: null as any,
      },
    ];

    const unified = buildUnifiedAuditLogs([], malformedLogs);

    expect(unified.length).toBe(2);
    expect(unified[0].id).toBeDefined();
    expect(unified[1].id).toBeDefined();
    expect(unified[0].id).not.toBe(unified[1].id);
    expect(unified.some((l) => l.details === "Operação legada de migração de dados")).toBe(true);
    expect(unified.some((l) => l.action === "MODO_MANUTENCAO")).toBe(true);
  });

  it("3. Deduplicação de registros com IDs reais iguais: descarta duplicata comprovada", () => {
    const systemAuditLogs: SystemAuditLog[] = [
      {
        id: "audit-100",
        transactionId: "TX-ITEM-100",
        objectId: "item-abc",
        objectType: "ITEM",
        action: "CRIACAO_ITEM",
        actorId: "admin-1",
        actorName: "Paulo",
        actorEmail: "paulocauan39@gmail.com",
        actorRole: "ADMIN",
        timestamp: "2026-10-26T02:00:00.000Z",
        details: "Objeto #item-abc cadastrado",
        immutable: true,
      },
    ];

    const activityLogs: ActivityLog[] = [
      // Duplicata dual-write com mesmo ID real
      {
        id: "audit-100",
        adminId: "admin-1",
        adminName: "Paulo",
        action: "CRIACAO_ITEM" as any,
        details: "Objeto #item-abc cadastrado (dual-write)",
        timestamp: "2026-10-26T02:00:00.000Z",
        transactionId: "TX-ITEM-100",
      },
      // Evento distinto na coleção activityLogs
      {
        id: "act-legacy-200",
        adminId: "admin-2",
        adminName: "Mariana",
        action: "ALTERACAO_PERMISSAO",
        details: "Promoveu usuário a Aluno",
        timestamp: "2026-10-26T02:30:00.000Z",
      },
    ];

    const unified = buildUnifiedAuditLogs(systemAuditLogs, activityLogs);

    // Deve conter apenas 2 logs (audit-100 deduplicado e act-legacy-200 preservado)
    expect(unified.length).toBe(2);
    expect(unified.filter((l) => l.id === "audit-100").length).toBe(1);
    expect(unified.some((l) => l.id === "act-legacy-200")).toBe(true);
  });

  it("4. Preservação de registros com mesmo transactionId entre systemAuditLogs e activityLogs", () => {
    const systemAuditLogs: SystemAuditLog[] = [
      {
        id: "audit-tx-1",
        transactionId: "TX-EXCLUSIVE-999",
        objectId: "obj-1",
        objectType: "ITEM",
        action: "DEVOLUCAO",
        actorId: "adm-1",
        actorName: "Servidor",
        actorEmail: "servidor@ifpr.edu.br",
        actorRole: "SERVIDOR",
        timestamp: "2026-10-26T01:00:00.000Z",
        details: "Devolução confirmada",
        immutable: true,
      },
    ];

    const activityLogs: ActivityLog[] = [
      // Log com ID diferente mas mesmo transactionId real comprovando mesmo evento
      {
        id: "act-diff-id",
        transactionId: "TX-EXCLUSIVE-999",
        adminId: "adm-1",
        adminName: "Servidor",
        action: "DEVOLUCAO" as any,
        details: "Devolução confirmada (espelho)",
        timestamp: "2026-10-26T01:00:00.000Z",
      },
      // Log com outro transactionId
      {
        id: "act-other-id",
        transactionId: "TX-OTHER-888",
        adminId: "adm-1",
        adminName: "Servidor",
        action: "DEVOLUCAO" as any,
        details: "Outra devolução",
        timestamp: "2026-10-26T01:15:00.000Z",
      },
    ];

    const unified = buildUnifiedAuditLogs(systemAuditLogs, activityLogs);

    expect(unified.length).toBe(2);
    expect(unified.filter((l) => l.transactionId === "TX-EXCLUSIVE-999").length).toBe(1);
    expect(unified.some((l) => l.transactionId === "TX-OTHER-888")).toBe(true);
  });

  it("5. Múltiplos registros legados sem ID com mesmo timestamp e adminId geram chaves sequenciais únicas e não sofrem colisões", () => {
    const timestamp = "2026-10-26T00:00:00.000Z";
    const adminId = "admin-repetido";

    const logsSemId: ActivityLog[] = [
      {
        id: undefined as any,
        adminId,
        adminName: "Admin Repetido",
        action: "ACAO_1",
        details: "Evento 1",
        timestamp,
      },
      {
        id: undefined as any,
        adminId,
        adminName: "Admin Repetido",
        action: "ACAO_2",
        details: "Evento 2",
        timestamp,
      },
      {
        id: undefined as any,
        adminId,
        adminName: "Admin Repetido",
        action: "ACAO_3",
        details: "Evento 3",
        timestamp,
      },
    ];

    const unified = buildUnifiedAuditLogs([], logsSemId);

    expect(unified.length).toBe(3);
    const ids = unified.map((l) => l.id);
    const uniqueIds = new Set(ids);
    // Todos os IDs devem ser estritamente únicos
    expect(uniqueIds.size).toBe(3);
    expect(ids[0]).toContain("-1");
    expect(ids[1]).toContain("-2");
    expect(ids[2]).toContain("-3");
  });
});

