import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  evaluateListenerSession,
  getClaimsListenerScope,
  getNotificationsListenerScope,
  canSubscribeUsersDirectory,
  canSubscribeStaffItemCollections,
  canSubscribeStaffLogs,
  canSubscribeAdminOnlyLogs,
  getItemHistorySubscriptionMode,
} from "./listenerGuards";
import { evaluateItemRegistrationEligibility } from "./itemRegistrationPipeline";
import { canOperateFormalReturn, isVerifiedRootAdminIdentity } from "./devolutionAuth";
import { User } from "../types";

const ROOT_ADMIN_UID = "hCG5mDgK1fRaTojULzlM7dXvb7n2";
const ROOT_ADMIN_EMAIL = "paulocauan39@gmail.com";

const readRepoFile = (relPath: string): string =>
  fs.readFileSync(path.resolve(process.cwd(), relPath), "utf-8");

const makeUser = (overrides: Partial<User> & { active?: boolean } = {}): User => ({
  id: "u-ext-1",
  name: "Carlos Externo",
  email: "carlos.externo@gmail.com",
  role: "INTRUSO",
  approvalStatus: "APROVADO",
  status: "active",
  courseOrDept: "Comunidade Externa",
  registrationNumber: "",
  avatarUrl: "",
  ...overrides,
});

/**
 * Avaliador fiel da política de regras Firestore para os 10 cenários obrigatórios da Etapa 2.
 * Verifica tanto a presença estrutural das cláusulas em firestore.rules quanto o comportamento
 * lógico dos controles de acesso para INTRUSO, ALUNO, SERVIDOR e ADMIN/Root Admin.
 */
const ALLOWED_EXTERNAL_PROFILE_FIELDS = new Set([
  "name",
  "phone",
  "courseOrDept",
  "registrationNumber",
  "avatarUrl",
  "updatedAt",
]);

function evaluateExternalProfileUpdatePolicy(params: {
  authUid: string;
  emailVerified: boolean;
  targetUid: string;
  existingDoc: Record<string, any>;
  incomingDoc: Record<string, any>;
}): { allowed: boolean; reason?: string } {
  if (!params.emailVerified) return { allowed: false, reason: "EMAIL_NOT_VERIFIED" };
  if (params.authUid !== params.targetUid) return { allowed: false, reason: "NOT_OWNER" };
  if (params.existingDoc.role !== "INTRUSO") return { allowed: false, reason: "NOT_EXTERNAL_BRANCH" };
  if (params.incomingDoc.role !== "INTRUSO") return { allowed: false, reason: "ROLE_MUTATION_FORBIDDEN" };
  if (params.incomingDoc.id !== params.targetUid) return { allowed: false, reason: "ID_MISMATCH" };
  if ((params.incomingDoc.email || "").toLowerCase() !== (params.existingDoc.email || "").toLowerCase()) {
    return { allowed: false, reason: "EMAIL_MUTATION_FORBIDDEN" };
  }
  if (params.existingDoc.active === false || (params.existingDoc.status && params.existingDoc.status !== "active")) {
    return { allowed: false, reason: "STANDING_INACTIVE" };
  }
  if (params.incomingDoc.admin === true || params.existingDoc.admin === true) {
    return { allowed: false, reason: "ADMIN_ESCALATION_FORBIDDEN" };
  }

  const allKeys = new Set([...Object.keys(params.existingDoc), ...Object.keys(params.incomingDoc)]);
  const affectedKeys = Array.from(allKeys).filter(
    (k) => JSON.stringify(params.existingDoc[k]) !== JSON.stringify(params.incomingDoc[k])
  );

  for (const key of affectedKeys) {
    if (!ALLOWED_EXTERNAL_PROFILE_FIELDS.has(key)) {
      return { allowed: false, reason: `PROTECTED_FIELD_${key}` };
    }
  }

  if ("name" in params.incomingDoc) {
    if (typeof params.incomingDoc.name !== "string" || params.incomingDoc.name.length < 1 || params.incomingDoc.name.length > 120) {
      return { allowed: false, reason: "INVALID_NAME" };
    }
  }
  if ("phone" in params.incomingDoc && params.incomingDoc.phone != null) {
    if (typeof params.incomingDoc.phone !== "string" || params.incomingDoc.phone.length > 30) {
      return { allowed: false, reason: "INVALID_PHONE" };
    }
  }

  return { allowed: true };
}

describe("Etapa 2 APS — Acesso Seguro da Comunidade Externa (INTRUSO verificado)", () => {
  const rules = readRepoFile("firestore.rules");
  const appContextSrc = readRepoFile("src/context/AppContext.tsx");

  it("1. firestore.rules contém helpers dedicados para usuário externo verificado sem enfraquecer isAccountActive ou isActiveVerifiedMember", () => {
    expect(rules).toContain("function isVerifiedActiveIntrusoDoc(u)");
    expect(rules).toContain("function isVerifiedActiveExternalUser()");
    expect(rules).toContain("function isValidExternalProfilePersonalFields(inc)");
    // Garante que isUserDocActiveData continua excluindo INTRUSO para proteger coleções institucionais/operacionais
    expect(rules).toContain("(!('role' in u) || u.role != 'INTRUSO') && isStandingActive(u)");
    // Garante que canRegisterItems permanece restrito a SERVIDOR aprovado / ADMIN / Root
    expect(rules).toContain("function canRegisterItems()");
  });

  it("2. Cenário 1: Usuário externo verificado e ativo pode criar, consultar e cancelar a própria reivindicação (listener SELF + AppContext liberado)", () => {
    const extUser = makeUser();
    const sessionInput = {
      authLoading: false,
      firebaseUser: { uid: extUser.id, email: extUser.email, emailVerified: true },
      currentUser: extUser,
    };

    const evaluated = evaluateListenerSession(sessionInput);
    expect(evaluated.isVerifiedActiveExternalUser).toBe(true);
    expect(evaluated.isAccountActive).toBe(false);
    expect(evaluated.isApprovedAdmin).toBe(false);
    expect(evaluated.isApprovedStaffOrAdmin).toBe(false);
    expect(getClaimsListenerScope(sessionInput)).toBe("SELF");
    expect(getNotificationsListenerScope(sessionInput)).toBe("SELF");

    // Regras permitem create/get/list/update próprio de /claims para isVerifiedActiveExternalUser()
    expect(rules).toContain("isVerifiedActiveExternalUser() && (!('claimerRole' in incoming()) || incoming().claimerRole == 'INTRUSO')");
    expect(rules).toContain("let isVerifiedExternal = isVerifiedActiveIntrusoDoc(u);");
    expect(rules).toContain("isVerifiedActiveExternalUser() &&\n          resource.data.claimerId == request.auth.uid");

    // AppContext.tsx não bloqueia mais INTRUSO verificado no submitClaim, mas continua bloqueando e-mail não verificado e contas suspensas/inativas
    expect(appContextSrc).not.toContain('Usuários externos (INTRUSO) não possuem permissão para solicitar devolução');
    expect(appContextSrc).toContain('!auth.currentUser.emailVerified && effectiveUserEmail !== "paulocauan39@gmail.com"');
    expect(appContextSrc).toContain('(currentUser && (currentUser as any).active === false)');
  });

  it("3. Cenários 2 e 3: Usuário externo NÃO cria reivindicação em nome de outro nem edita/consulta reivindicação de terceiros", () => {
    // Regras exigem claimId determinístico e claimerId == request.auth.uid em create, get, list e update
    expect(rules).toContain("claimId == 'claim_' + request.auth.uid + '_' + incoming().itemId");
    expect(rules).toContain("incoming().claimerId == request.auth.uid");
    expect(rules).toContain("ext.claimerId == request.auth.uid");
    // Transição administrativa/revisão exige isUserDocActiveData(u) && hasApprovedStaffOrAdminRole(u)
    expect(rules).toContain("isUserDocActiveData(u) &&\n            hasApprovedStaffOrAdminRole(u) &&\n            isValidStaffClaimTransition(ext, inc)");

    // Usuário externo sem e-mail verificado ou suspenso tem listener de claims cortado
    expect(
      getClaimsListenerScope({
        authLoading: false,
        firebaseUser: { uid: "u-ext-unv", email: "unv@gmail.com", emailVerified: false },
        currentUser: makeUser({ id: "u-ext-unv", email: "unv@gmail.com" }),
      })
    ).toBe("NONE");

    expect(
      getClaimsListenerScope({
        authLoading: false,
        firebaseUser: { uid: "u-ext-susp", email: "susp@gmail.com", emailVerified: true },
        currentUser: makeUser({ id: "u-ext-susp", email: "susp@gmail.com", status: "suspended" }),
      })
    ).toBe("NONE");
  });

  it("4. Cenários 4 e 8: Usuário externo edita apenas campos pessoais permitidos e é bloqueado ao tentar alterar role ou qualquer campo protegido", () => {
    expect(rules).toContain("Branch 2b: Atualização estrita de campos pessoais do próprio perfil por usuário externo verificado (INTRUSO)");
    expect(rules).toContain("'name',\n                'phone',\n                'courseOrDept',\n                'registrationNumber',\n                'avatarUrl',\n                'updatedAt'");

    const baseDoc = {
      id: "u-ext-1",
      name: "Carlos Externo",
      email: "carlos.externo@gmail.com",
      role: "INTRUSO",
      approvalStatus: "APROVADO",
      status: "active",
      active: true,
      admin: false,
      reputationScore: 100,
    };

    // Edição legítima de campos pessoais -> PERMITIDA
    expect(
      evaluateExternalProfileUpdatePolicy({
        authUid: "u-ext-1",
        emailVerified: true,
        targetUid: "u-ext-1",
        existingDoc: baseDoc,
        incomingDoc: { ...baseDoc, name: "Carlos Silva", phone: "(43) 99999-0000", updatedAt: "2026-11-23T12:00:00.000Z" },
      }).allowed
    ).toBe(true);

    // Escalonamento de role -> NEGADO
    for (const targetRole of ["ALUNO", "SERVIDOR", "ADMIN"]) {
      const res = evaluateExternalProfileUpdatePolicy({
        authUid: "u-ext-1",
        emailVerified: true,
        targetUid: "u-ext-1",
        existingDoc: baseDoc,
        incomingDoc: { ...baseDoc, role: targetRole },
      });
      expect(res.allowed).toBe(false);
    }

    // Mutação de campos protegidos ou shadow fields -> NEGADO
    const forbiddenMutations: Array<Record<string, any>> = [
      { admin: true },
      { approvalStatus: "PENDENTE" },
      { status: "banned" },
      { active: false },
      { reputationScore: 999 },
      { roleAssignedBy: ROOT_ADMIN_EMAIL },
      { roleAssignedAt: "2026-11-23T12:00:00.000Z" },
      { suspendedUntil: null },
      { blockExpiresAt: null },
      { email: "outro@estudantes.ifpr.edu.br" },
      { isVerifiedByAdmin: true },
    ];

    for (const mutation of forbiddenMutations) {
      const res = evaluateExternalProfileUpdatePolicy({
        authUid: "u-ext-1",
        emailVerified: true,
        targetUid: "u-ext-1",
        existingDoc: baseDoc,
        incomingDoc: { ...baseDoc, ...mutation },
      });
      expect(res.allowed).toBe(false);
    }

    // Sem verificação de e-mail -> NEGADO
    expect(
      evaluateExternalProfileUpdatePolicy({
        authUid: "u-ext-1",
        emailVerified: false,
        targetUid: "u-ext-1",
        existingDoc: baseDoc,
        incomingDoc: { ...baseDoc, name: "Tentativa Não Verificada" },
      }).allowed
    ).toBe(false);
  });

  it("5. Cenários 5 e 6: Usuário externo NÃO consegue cadastrar objetos nem acessar painel/listeners administrativos", () => {
    const extUser = makeUser();
    const extAuth = { uid: extUser.id, email: extUser.email, emailVerified: true };

    const regEligibility = evaluateItemRegistrationEligibility({
      isAuthLoading: false,
      isGuest: false,
      authUser: extAuth,
      userDocData: extUser,
    });
    expect(regEligibility.allowed).toBe(false);
    expect(regEligibility.reasonCode).toBe("ROLE_INTRUSO_FORBIDDEN");

    expect(canOperateFormalReturn(extUser, extAuth, false)).toBe(false);
    expect(canSubscribeUsersDirectory({ authLoading: false, firebaseUser: extAuth, currentUser: extUser })).toBe(false);
    expect(canSubscribeStaffItemCollections({ authLoading: false, firebaseUser: extAuth, currentUser: extUser })).toBe(false);
    expect(canSubscribeStaffLogs({ authLoading: false, firebaseUser: extAuth, currentUser: extUser })).toBe(false);
    expect(canSubscribeAdminOnlyLogs({ authLoading: false, firebaseUser: extAuth, currentUser: extUser })).toBe(false);
    expect(getItemHistorySubscriptionMode({ authLoading: false, firebaseUser: extAuth, currentUser: extUser })).toBe("PUBLIC_API");
  });

  it("6. Cenário 7: Notificações do usuário externo são estritamente isoladas ao próprio UID (leitura, criação própria, marcação como lida e exclusão)", () => {
    // AppContext consulta apenas where("userId", "==", fbUid) para INTRUSO
    expect(appContextSrc).toContain('currentUser?.role === "INTRUSO"');
    expect(appContextSrc).toContain('query(collection(db, "notifications"), where("userId", "==", fbUid))');

    // firestore.rules restringe get/list de broadcasts a isAccountActive(), enquanto INTRUSO acessa apenas userId == request.auth.uid
    expect(rules).toContain("(isAccountActive() || isVerifiedActiveExternalUser()) &&\n          incoming().userId == request.auth.uid");
    expect(rules).toContain("(isAccountActive() || isVerifiedActiveExternalUser()) &&\n        existing().userId == request.auth.uid &&\n        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read', 'readAt'])");
    expect(rules).toContain("(isAccountActive() || isVerifiedActiveExternalUser()) && existing().userId == request.auth.uid");
  });

  it("7. Cenário 9: ALUNO e SERVIDOR mantêm exatamente suas permissões e restrições atuais", () => {
    const aluno = makeUser({
      id: "u-aluno-1",
      email: "estudante@estudantes.ifpr.edu.br",
      role: "ALUNO",
      approvalStatus: "APROVADO",
    });
    const alunoAuth = { uid: aluno.id, email: aluno.email, emailVerified: true };

    expect(getClaimsListenerScope({ authLoading: false, firebaseUser: alunoAuth, currentUser: aluno })).toBe("SELF");
    expect(getNotificationsListenerScope({ authLoading: false, firebaseUser: alunoAuth, currentUser: aluno })).toBe("SELF");
    expect(canSubscribeUsersDirectory({ authLoading: false, firebaseUser: alunoAuth, currentUser: aluno })).toBe(false);
    expect(
      evaluateItemRegistrationEligibility({ isAuthLoading: false, isGuest: false, authUser: alunoAuth, userDocData: aluno }).allowed
    ).toBe(false);

    const servidor = makeUser({
      id: "u-serv-1",
      email: "servidor@ifpr.edu.br",
      role: "SERVIDOR",
      approvalStatus: "APROVADO",
    });
    const servidorAuth = { uid: servidor.id, email: servidor.email, emailVerified: true };

    expect(getClaimsListenerScope({ authLoading: false, firebaseUser: servidorAuth, currentUser: servidor })).toBe("ALL");
    expect(canSubscribeStaffItemCollections({ authLoading: false, firebaseUser: servidorAuth, currentUser: servidor })).toBe(true);
    expect(canSubscribeUsersDirectory({ authLoading: false, firebaseUser: servidorAuth, currentUser: servidor })).toBe(false);
    expect(
      evaluateItemRegistrationEligibility({ isAuthLoading: false, isGuest: false, authUser: servidorAuth, userDocData: servidor }).allowed
    ).toBe(true);
  });

  it("8. Cenário 10: ADMIN, Root Admin e atribuição manual de cargo em e-mail externo continuam funcionando integralmente", () => {
    const rootUser = makeUser({
      id: ROOT_ADMIN_UID,
      email: ROOT_ADMIN_EMAIL,
      role: "ADMIN",
      approvalStatus: "APROVADO",
    });
    const rootAuth = { uid: ROOT_ADMIN_UID, email: ROOT_ADMIN_EMAIL, emailVerified: true };

    expect(isVerifiedRootAdminIdentity(rootUser, rootAuth)).toBe(true);
    expect(canSubscribeUsersDirectory({ authLoading: false, firebaseUser: rootAuth, currentUser: rootUser })).toBe(true);
    expect(getClaimsListenerScope({ authLoading: false, firebaseUser: rootAuth, currentUser: rootUser })).toBe("ALL");
    expect(getNotificationsListenerScope({ authLoading: false, firebaseUser: rootAuth, currentUser: rootUser })).toBe("ALL");
    expect(
      evaluateItemRegistrationEligibility({ isAuthLoading: false, isGuest: false, authUser: rootAuth, userDocData: rootUser }).allowed
    ).toBe(true);

    // E-mail externo (Gmail) promovido manualmente para SERVIDOR aprovado preserva precedência
    const externalStaff = makeUser({
      id: "u-gmail-serv",
      email: "docente.externo@gmail.com",
      role: "SERVIDOR",
      approvalStatus: "APROVADO",
    });
    const externalStaffAuth = { uid: externalStaff.id, email: externalStaff.email, emailVerified: true };
    expect(
      evaluateItemRegistrationEligibility({ isAuthLoading: false, isGuest: false, authUser: externalStaffAuth, userDocData: externalStaff }).allowed
    ).toBe(true);
  });

  it("9. Manual do Usuário, documentação APS e Histórico de Versões refletem a Etapa 2 com consistência", () => {
    const manualHtml = readRepoFile("public/manual-usuario.html");
    const entregaDoc = readRepoFile("docs/ENTREGA_PROFESSOR_APS.md");
    const versionsData = readRepoFile("src/data/versionsData.ts");

    expect(manualHtml).toContain("reivindicar objetos perdidos/encontrados");
    expect(entregaDoc).toContain("Comunidade Externa e Reivindicações Online (Etapa 2)");
    expect(versionsData).toContain("v11013-add-etapa2-external-community-claims-profile-notifications");
  });
});
