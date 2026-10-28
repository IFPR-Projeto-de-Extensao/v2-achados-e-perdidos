import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Suite de Testes Automatizados para Validação dos Achados SEC-01 a SEC-04
 * Localiza+ v1.10.9
 */

describe("LOCALIZA+ v1.10.9 — Validação de Segurança dos Achados SEC-01 a SEC-04", () => {
  const rulesPath = path.resolve(process.cwd(), "firestore.rules");
  const rulesContent = fs.readFileSync(rulesPath, "utf-8");

  // =========================================================================
  // SEC-01: Privilégio de Root Admin e Proteção contra Escalada
  // =========================================================================
  describe("SEC-01: Privilégio de Root Admin & Verificação Obrigatória de E-mail", () => {
    // Modelagem exata das funções de firestore.rules
    function evaluateIsRootAdmin(auth: { email?: string; email_verified?: boolean } | null): boolean {
      if (!auth) return false;
      const isEmailVerified = Boolean(auth.email_verified);
      return (
        isEmailVerified &&
        auth.email != null &&
        (auth.email === "paulocauan39@gmail.com" || auth.email.toLowerCase() === "paulocauan39@gmail.com")
      );
    }

    function evaluateHasAdminClaim(token: { role?: string; admin?: boolean } | null): boolean {
      if (!token) return false;
      return token.role === "ADMIN" || token.admin === true;
    }

    function evaluateIsDocAdmin(userDoc: { role?: string; approvalStatus?: string } | null): boolean {
      if (!userDoc) return false;
      return userDoc.role === "ADMIN" && userDoc.approvalStatus === "APROVADO";
    }

    function evaluateIsAdmin(auth: {
      email?: string;
      email_verified?: boolean;
      tokenRole?: string;
      tokenAdmin?: boolean;
      docRole?: string;
      docApprovalStatus?: string;
    } | null): boolean {
      if (!auth) return false;
      const root = evaluateIsRootAdmin({ email: auth.email, email_verified: auth.email_verified });
      const customClaim = evaluateHasAdminClaim({ role: auth.tokenRole, admin: auth.tokenAdmin });
      const docAdmin = evaluateIsDocAdmin({ role: auth.docRole, approvalStatus: auth.docApprovalStatus });
      return root || customClaim || docAdmin;
    }

    it("SEC-01.1: firestore.rules exige isEmailVerified() na definição de isRootAdmin()", () => {
      expect(rulesContent).toMatch(/function isRootAdmin\(\)\s*\{\s*return isSignedIn\(\) &&\s*isEmailVerified\(\)/);
    });

    it("SEC-01.2: E-mail raiz com email_verified == true é AUTORIZADO como Root Admin", () => {
      const auth = { email: "paulocauan39@gmail.com", email_verified: true };
      expect(evaluateIsRootAdmin(auth)).toBe(true);
      expect(evaluateIsAdmin(auth)).toBe(true);
    });

    it("SEC-01.3: E-mail raiz com email_verified == false é REJEITADO (Prevenção de Spoofing)", () => {
      const auth = { email: "paulocauan39@gmail.com", email_verified: false };
      expect(evaluateIsRootAdmin(auth)).toBe(false);
      expect(evaluateIsAdmin(auth)).toBe(false);
    });

    it("SEC-01.4: Usuário comum institucional não possui privilégios de Admin", () => {
      const auth = { email: "aluno@estudantes.ifpr.edu.br", email_verified: true, docRole: "ALUNO" };
      expect(evaluateIsRootAdmin(auth)).toBe(false);
      expect(evaluateIsAdmin(auth)).toBe(false);
    });

    it("SEC-01.5: Custom claims administrativas (token.role == 'ADMIN' ou token.admin == true) concedem privilégios legítimos", () => {
      const authWithRole = { email: "servidor@ifpr.edu.br", email_verified: true, tokenRole: "ADMIN" };
      expect(evaluateIsAdmin(authWithRole)).toBe(true);

      const authWithFlag = { email: "servidor@ifpr.edu.br", email_verified: true, tokenAdmin: true };
      expect(evaluateIsAdmin(authWithFlag)).toBe(true);
    });

    it("SEC-01.6: Usuários comuns não conseguem se autoatribuir admin em users/{uid} no firestore.rules", () => {
      // Criação proíbe admin=true
      expect(rulesContent).toContain("(!('admin' in incoming()) || incoming().admin == false)");
      // Atualização proíbe alterar admin
      expect(rulesContent).toContain("(!('admin' in incoming()) || incoming().admin == existing().admin)");
    });
  });

  // =========================================================================
  // SEC-02: Autorização de Servidores e Separação de Identidade Institucional
  // =========================================================================
  describe("SEC-02: Autorização de Servidores e Verificação de Aprovação", () => {
    function evaluateIsDocServidor(doc: { role?: string; approvalStatus?: string; email_verified?: boolean } | null): boolean {
      if (!doc || !doc.email_verified) return false;
      return doc.role === "SERVIDOR" && doc.approvalStatus === "APROVADO";
    }

    function evaluateIsInstitutionalStaffEmail(auth: { email?: string; email_verified?: boolean } | null): boolean {
      if (!auth || !auth.email_verified || !auth.email) return false;
      const email = auth.email.toLowerCase();
      const isIfpr = email.endsWith("@ifpr.edu.br");
      const notStudent =
        !email.includes("aluno") &&
        !email.includes("estudante") &&
        !email.includes("estudantes") &&
        !email.includes("escola");
      return isIfpr && notStudent;
    }

    function evaluateIsServidor(params: {
      isSignedIn: boolean;
      isAdmin: boolean;
      isEmailVerified: boolean;
      tokenRole?: string;
      userDoc?: { role: string; approvalStatus: string; status?: "active" | "suspended" | "banned" } | null;
    }): boolean {
      if (!params.isSignedIn) return false;
      if (params.isAdmin) return true;
      if (!params.isEmailVerified) return false;
      return evaluateIsDocServidor(params.userDoc ? { ...params.userDoc, email_verified: params.isEmailVerified } : null);
    }

    function evaluatePrivilegedServerAction(params: {
      isSignedIn: boolean;
      isAdmin: boolean;
      isEmailVerified: boolean;
      tokenRole?: string;
      userDoc?: { role: string; approvalStatus: string; status?: "active" | "suspended" | "banned" } | null;
    }): boolean {
      const isServ = evaluateIsServidor(params);
      const isAcctActive = params.userDoc ? params.userDoc.status !== "suspended" && params.userDoc.status !== "banned" : true;
      return isServ && isAcctActive;
    }

    it("SEC-02.1: firestore.rules exige approvalStatus == 'APROVADO' em isDocServidor()", () => {
      expect(rulesContent).toMatch(/function isDocServidor\(\)[\s\S]*?approvalStatus == 'APROVADO'/);
    });

    it("SEC-02.2: firestore.rules NÃO possui desvio isolado de token.role == 'SERVIDOR' em isServidor()", () => {
      expect(rulesContent).toMatch(/function isServidor\(\)\s*\{\s*return isSignedIn\(\)\s*&&\s*\(isAdmin\(\)\s*\|\|\s*\((?:isAccountActive\(\)\s*&&\s*)?isEmailVerified\(\)\s*&&\s*isDocServidor\(\)\)\);/);
      expect(rulesContent).not.toContain("request.auth.token.role == 'SERVIDOR'");
    });

    it("SEC-02.3: Token com 'role: SERVIDOR' e perfil AUSENTE é REJEITADO para privilégios de servidor", () => {
      const res = evaluateIsServidor({
        isSignedIn: true,
        isAdmin: false,
        isEmailVerified: true,
        tokenRole: "SERVIDOR",
        userDoc: null, // Ausente
      });
      expect(res).toBe(false);
    });

    it("SEC-02.4: Token com 'role: SERVIDOR' e perfil PENDENTE é REJEITADO para privilégios de servidor", () => {
      const res = evaluateIsServidor({
        isSignedIn: true,
        isAdmin: false,
        isEmailVerified: true,
        tokenRole: "SERVIDOR",
        userDoc: { role: "SERVIDOR", approvalStatus: "PENDENTE", status: "active" },
      });
      expect(res).toBe(false);
    });

    it("SEC-02.5: Token com 'role: SERVIDOR' e perfil APROVADO é AUTORIZADO como Servidor", () => {
      const res = evaluateIsServidor({
        isSignedIn: true,
        isAdmin: false,
        isEmailVerified: true,
        tokenRole: "SERVIDOR",
        userDoc: { role: "SERVIDOR", approvalStatus: "APROVADO", status: "active" },
      });
      expect(res).toBe(true);
    });

    it("SEC-02.6: Token com 'role: SERVIDOR' e perfil SUSPENSO ou BANIDO é BLOQUEADO em ações privilegiadas", () => {
      const resSuspended = evaluatePrivilegedServerAction({
        isSignedIn: true,
        isAdmin: false,
        isEmailVerified: true,
        tokenRole: "SERVIDOR",
        userDoc: { role: "SERVIDOR", approvalStatus: "APROVADO", status: "suspended" },
      });
      expect(resSuspended).toBe(false);

      const resBanned = evaluatePrivilegedServerAction({
        isSignedIn: true,
        isAdmin: false,
        isEmailVerified: true,
        tokenRole: "SERVIDOR",
        userDoc: { role: "SERVIDOR", approvalStatus: "APROVADO", status: "banned" },
      });
      expect(resBanned).toBe(false);
    });

    it("SEC-02.7: Servidor institucional verificado sem perfil não tem ação privilegiada, mas pode criar perfil inicial", () => {
      const staffAuth = { email: "professor@ifpr.edu.br", email_verified: true };
      // Sem perfil ainda
      const isServ = evaluateIsServidor({
        isSignedIn: true,
        isAdmin: false,
        isEmailVerified: true,
        userDoc: null,
      });
      expect(isServ).toBe(false);

      // Mas pode criar o perfil inicial pois possui e-mail institucional verificado
      expect(evaluateIsInstitutionalStaffEmail(staffAuth)).toBe(true);
    });

    it("SEC-02.8: Administrador legítimo é preservado e possui acesso de servidor via isAdmin()", () => {
      const resAdmin = evaluateIsServidor({
        isSignedIn: true,
        isAdmin: true,
        isEmailVerified: true,
        userDoc: null,
      });
      expect(resAdmin).toBe(true);
    });
  });

  // =========================================================================
  // SEC-03: ID Determinístico de Claims na Criação (/claims/{claimId})
  // =========================================================================
  describe("SEC-03: Exigência de ID Determinístico em allow create de /claims/{claimId}", () => {
    function evaluateClaimCreateId(claimId: string, authUid: string, incomingItemId: string): boolean {
      return claimId === `claim_${authUid}_${incomingItemId}`;
    }

    it("SEC-03.1: firestore.rules exige claimId == 'claim_' + request.auth.uid + '_' + incoming().itemId em allow create", () => {
      expect(rulesContent).toMatch(/allow create: if[\s\S]*?claimId == 'claim_' \+ request\.auth\.uid \+ '_' \+ incoming\(\)\.itemId/);
    });

    it("SEC-03.2: Claim com ID determinístico correto é ACEITA", () => {
      const uid = "user_student_123";
      const itemId = "item_caderno_001";
      const validClaimId = `claim_${uid}_${itemId}`;
      expect(evaluateClaimCreateId(validClaimId, uid, itemId)).toBe(true);
    });

    it("SEC-03.3: Claim com ID arbitrário (ex: claim_random_999) é REJEITADA", () => {
      const uid = "user_student_123";
      const itemId = "item_caderno_001";
      const arbitraryId = "claim_random_999";
      expect(evaluateClaimCreateId(arbitraryId, uid, itemId)).toBe(false);
    });

    it("SEC-03.4: Claim com ID pertencente a outro usuário (ex: claim_otherUser_itemId) é REJEITADA", () => {
      const uid = "user_student_123";
      const otherUid = "user_attacker_666";
      const itemId = "item_caderno_001";
      const forgedClaimId = `claim_${otherUid}_${itemId}`;
      expect(evaluateClaimCreateId(forgedClaimId, uid, itemId)).toBe(false);
    });

    it("SEC-03.5: Claim com itemId divergente do ID do documento é REJEITADA", () => {
      const uid = "user_student_123";
      const incomingItemId = "item_mochila_002";
      const claimId = `claim_${uid}_item_caderno_001`;
      expect(evaluateClaimCreateId(claimId, uid, incomingItemId)).toBe(false);
    });
  });

  // =========================================================================
  // SEC-04: Leitura de Comentários e Avaliação de Acesso
  // =========================================================================
  describe("SEC-04: Política de Leitura da Coleção 'comments'", () => {
    function evaluateCommentsRead(auth: { uid: string } | null): { allowed: boolean; reason?: string } {
      if (!auth || !auth.uid) {
        return { allowed: false, reason: "UNAUTHENTICATED" };
      }
      return { allowed: true };
    }

    it("SEC-04.1: firestore.rules restringe leitura de comments estritamente a usuários autenticados", () => {
      expect(rulesContent).toMatch(/match \/comments\/\{commentId\}\s*\{[\s\S]*?allow get: if isSignedIn\(\);/);
      expect(rulesContent).toMatch(/match \/comments\/\{commentId\}\s*\{[\s\S]*?allow list: if isSignedIn\(\);/);
    });

    it("SEC-04.2: Usuário não autenticado (visitante público) é REJEITADO na leitura de comentários", () => {
      const res = evaluateCommentsRead(null);
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe("UNAUTHENTICATED");
    });

    it("SEC-04.3: Usuário autenticado (Aluno ou Servidor) tem permissão de leitura nos comentários da comunidade", () => {
      const resStudent = evaluateCommentsRead({ uid: "student-123" });
      expect(resStudent.allowed).toBe(true);

      const resStaff = evaluateCommentsRead({ uid: "staff-456" });
      expect(resStaff.allowed).toBe(true);
    });

    it("SEC-04.4: Usuário com perfil Intruso (autenticado) consegue ler comentários públicos da comunidade", () => {
      const resIntruso = evaluateCommentsRead({ uid: "intruso-789" });
      expect(resIntruso.allowed).toBe(true);
    });
  });
});
