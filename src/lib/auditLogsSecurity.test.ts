import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Audit Logs & Activity Logs Security Audit Suite", () => {
  const rulesPath = path.resolve(process.cwd(), "firestore.rules");
  const serverPath = path.resolve(process.cwd(), "server.ts");
  const appContextPath = path.resolve(process.cwd(), "src/context/AppContext.tsx");

  const rulesContent = fs.readFileSync(rulesPath, "utf-8");
  const serverContent = fs.readFileSync(serverPath, "utf-8");
  const appContextContent = fs.readFileSync(appContextPath, "utf-8");

  describe("1. Prevenção de Forjamento de Identidade (actorId Spoofing)", () => {
    it("deve obrigar que incoming().actorId seja exatamente igual a request.auth.uid em audit_logs", () => {
      expect(rulesContent).toMatch(/match \/audit_logs\/\{logId\}[\s\S]*?incoming\(\)\.actorId == request\.auth\.uid/);
    });

    it("deve vincular actorId ao UID autenticado real do Firebase em AppContext.tsx", () => {
      expect(appContextContent).toContain("const realAuthUid = auth.currentUser?.uid;");
      expect(appContextContent).toContain("actorId: realAuthUid || currentUser?.id");
    });
  });

  describe("2. Prevenção de Escalação de Papel (actorRole Forgery)", () => {
    it("deve impedir que alunos declarem papéis administrativos como ADMIN ou SERVIDOR", () => {
      // Confirma que para ALUNO, o actorRole deve ser estritamente 'ALUNO'
      expect(rulesContent).toMatch(/match \/audit_logs\/\{logId\}[\s\S]*?incoming\(\)\.actorRole == 'ALUNO'/);
      // E ADMIN requer que o usuário seja autenticado como admin
      expect(rulesContent).toMatch(/isAdmin\(\) && incoming\(\)\.actorRole in \['ADMIN', 'SERVIDOR'\]/);
    });
  });

  describe("3. Imutabilidade Estrita - Bloqueio de Edição (update)", () => {
    it("deve proibir incondicionalmente a atualização (update) de logs em audit_logs", () => {
      expect(rulesContent).toMatch(/match \/audit_logs\/\{logId\}[\s\S]*?allow update: if false;/);
    });

    it("deve proibir incondicionalmente a atualização (update) de logs em activity_logs", () => {
      expect(rulesContent).toMatch(/match \/activity_logs\/\{logId\}[\s\S]*?allow update: if false;/);
    });
  });

  describe("4. Imutabilidade Estrita - Bloqueio de Exclusão (delete)", () => {
    it("deve proibir incondicionalmente a exclusão (delete) de logs em audit_logs", () => {
      expect(rulesContent).toMatch(/match \/audit_logs\/\{logId\}[\s\S]*?allow delete: if false;/);
    });

    it("deve proibir incondicionalmente a exclusão (delete) de logs em activity_logs", () => {
      expect(rulesContent).toMatch(/match \/activity_logs\/\{logId\}[\s\S]*?allow delete: if false;/);
    });
  });

  describe("5. Validação de Email do Ator (actorEmail Integrity)", () => {
    it("deve validar que o actorEmail em audit_logs corresponde ao token do usuário autenticado", () => {
      expect(rulesContent).toContain("incoming().actorEmail == request.auth.token.email");
    });

    it("deve utilizar realAuthEmail do token Firebase em AppContext.tsx", () => {
      expect(appContextContent).toContain("const realAuthEmail = auth.currentUser?.email;");
      expect(appContextContent).toContain("actorEmail: realAuthEmail || currentUser?.email");
    });
  });

  describe("6. Restrição de Ações Permitidas para Alunos (Action Scope Whitelist)", () => {
    it("deve restringir ações de alunos apenas a itens próprios cadastrados/editados", () => {
      expect(rulesContent).toContain("incoming().objectType == 'ITEM'");
      expect(rulesContent).toContain("incoming().action in ['CADASTRO_OCORRENCIA', 'EDIT_OCORRENCIA', 'STATUS_OVERRIDE', 'EXCLUSAO_ITEM']");
    });

    it("não deve permitir que alunos registrem ações como ALTERACAO_PERMISSAO ou REGISTRO_DEVOLUCAO", () => {
      const auditBlock = rulesContent.match(/match \/audit_logs\/\{logId\}[\s\S]*?allow delete: if false;/)?.[0] || "";
      expect(auditBlock).not.toContain("'ALTERACAO_PERMISSAO'");
    });
  });

  describe("7. Proteção de Acesso e Leitura (RBAC de Leitura)", () => {
    it("deve restringir get e list de audit_logs exclusivamente a Administradores e Servidores", () => {
      expect(rulesContent).toMatch(/match \/audit_logs\/\{logId\}[\s\S]*?allow get: if isAdmin\(\) \|\| isServidor\(\);/);
      expect(rulesContent).toMatch(/match \/audit_logs\/\{logId\}[\s\S]*?allow list: if isAdmin\(\) \|\| isServidor\(\);/);
    });

    it("deve restringir get e list de activity_logs exclusivamente a Administradores e Servidores", () => {
      expect(rulesContent).toMatch(/match \/activity_logs\/\{logId\}[\s\S]*?allow get: if isAdmin\(\) \|\| isServidor\(\);/);
      expect(rulesContent).toMatch(/match \/activity_logs\/\{logId\}[\s\S]*?allow list: if isAdmin\(\) \|\| isServidor\(\);/);
    });
  });

  describe("8. Proteção do Endpoint de Exportação de Logs do Backend", () => {
    it("deve proteger a rota /api/monitoring/export-logs com requireAuth e requireAdmin", () => {
      expect(serverContent).toMatch(/app\.get\(\["\/api\/monitoring\/export-logs",[\s\S]*?requireAuth,[\s\S]*?requireAdmin/);
    });
  });

  describe("9. Registro Autorizado e Fidedigno no Backend (Firebase Admin SDK)", () => {
    it("deve registrar auditoria com identidade legítima em operações críticas do servidor (master-wipe)", () => {
      expect(serverContent).toContain("firestore.collection(\"audit_logs\").add");
      expect(serverContent).toContain("action: \"MASTER_WIPE\"");
      expect(serverContent).toContain("actorRole: \"ADMIN\"");
    });

    it("deve registrar auditoria com identidade legítima na homologação de devoluções no servidor", () => {
      expect(serverContent).toContain("adminDb.collection(\"audit_logs\").doc(auditLogId).set");
      expect(serverContent).toContain("action: \"REGISTRO_DEVOLUCAO\"");
    });
  });

  describe("10. Coerência entre Coleção Ativa (audit_logs) e Retrocompatibilidade (activity_logs)", () => {
    it("deve manter sincronizadas as gravações com campos seguros de ator em ambas as coleções", () => {
      expect(appContextContent).toContain("db, \"audit_logs\", auditLogDoc.id");
      expect(appContextContent).toContain("db, \"activity_logs\", actLog.id");
      expect(appContextContent).toContain("adminId: auditLogDoc.actorId");
      expect(appContextContent).toContain("actorId: auditLogDoc.actorId");
    });
  });
});
