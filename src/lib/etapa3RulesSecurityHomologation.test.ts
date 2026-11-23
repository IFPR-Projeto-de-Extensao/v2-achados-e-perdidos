import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";
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
import { User } from "../types";

const ROOT_ADMIN_UID = "hCG5mDgK1fRaTojULzlM7dXvb7n2";
const ROOT_ADMIN_EMAIL = "paulocauan39@gmail.com";

const readFile = (relPath: string): string =>
  fs.readFileSync(path.resolve(process.cwd(), relPath), "utf8");

const makeUser = (overrides: Partial<User> & { active?: boolean } = {}): User => ({
  id: "u-test-1",
  name: "Usuário Teste",
  email: "usuario@gmail.com",
  role: "INTRUSO",
  approvalStatus: "APROVADO",
  status: "active",
  active: true,
  courseOrDept: "Comunidade Externa",
  registrationNumber: "",
  avatarUrl: "",
  ...overrides,
});

function extractMatchBlock(rules: string, headerPattern: string): string {
  const start = rules.indexOf(headerPattern);
  if (start === -1) return "";
  let depth = 0;
  let entered = false;
  for (let i = start + headerPattern.length; i < rules.length; i++) {
    const ch = rules[i];
    if (ch === "{") {
      depth++;
      entered = true;
    } else if (ch === "}") {
      depth--;
      if (entered && depth === 0) {
        return rules.slice(start, i + 1);
      }
    }
  }
  return "";
}

describe("ETAPA 3 — Homologação Independente de Segurança das Firestore Rules (Matriz A–E)", () => {
  const rules = readFile("firestore.rules");
  const appContext = readFile("src/context/AppContext.tsx");
  const usersBlock = extractMatchBlock(rules, "match /users/{userId}");
  const claimsBlock = extractMatchBlock(rules, "match /claims/{claimId}");
  const notificationsBlock = extractMatchBlock(rules, "match /notifications/{notificationId}");
  const itemPrivateBlock = extractMatchBlock(rules, "match /item_private/{itemId}");

  it("1. Integridade sintática, default-deny e SHA-256 exato da versão endurecida e validada no Emulator (Etapas 3 e 4)", () => {
    let braceBalance = 0;
    let parenBalance = 0;
    for (const ch of rules) {
      if (ch === "{") braceBalance++;
      else if (ch === "}") braceBalance--;
      else if (ch === "(") parenBalance++;
      else if (ch === ")") parenBalance--;
    }
    expect(braceBalance).toBe(0);
    expect(parenBalance).toBe(0);
    expect(rules).toContain("rules_version = '2';");
    expect(rules).toContain("match /{document=**} {\n      allow read, write: if false;\n    }");

    const sha = crypto.createHash("sha256").update(Buffer.from(rules, "utf8")).digest("hex");
    expect(sha).toBe("7fa455e632a9d1831517fe7269e52d922b8614f903f0a28f025f6418812d95a5");
  });

  it("2. Matriz A (INTRUSO) — Reivindicações próprias, ID determinístico, reenvio sem bypass, perfil restrito com sync emailVerified=true e isolamento de notificações", () => {
    // Reivindicações: ID determinístico verificado após checagem de tipo/tamanho de itemId + id == claimId
    expect(claimsBlock).toContain(
      "incoming().itemId is string && incoming().itemId.size() > 0 && incoming().itemId.size() <= 128"
    );
    expect(claimsBlock).toContain("claimId == 'claim_' + request.auth.uid + '_' + incoming().itemId");
    expect(claimsBlock).toContain("(!('id' in incoming()) || incoming().id == claimId)");
    expect(claimsBlock).toContain("isValidClaimKeysAndTypes(inc)");
    expect(claimsBlock).toContain("hasNoAdminReviewFields(inc)");

    // Leitura tolerante de doc inexistente restrita ao próprio prefixo determinístico e usuário ativo/externo verificado
    expect(claimsBlock).toContain(
      "resource == null && (isAccountActive() || isVerifiedActiveExternalUser()) && request.auth.uid != null && claimId.matches('claim_' + request.auth.uid + '_.*')"
    );

    // Reenvio: somente CANCELADO/REJEITADO -> PENDENTE, sem campos de revisão e com allowlist de chaves
    expect(claimsBlock).toContain("ext.status in ['CANCELADO', 'REJEITADO']");
    expect(claimsBlock).toContain("inc.status == 'PENDENTE'");
    expect(claimsBlock).toContain("isValidClaimBody(inc)");

    // Cancelamento valida tipo/tamanho de cancelledAt
    expect(claimsBlock).toContain(
      "(!('cancelledAt' in inc) || (inc.cancelledAt is string && inc.cancelledAt.size() > 0 && inc.cancelledAt.size() <= 64) || inc.cancelledAt is timestamp)"
    );

    // Branch 2b permite sincronizar emailVerified exclusivamente para true (quando JWT já é email_verified == true)
    expect(usersBlock).toContain("'emailVerified'");
    expect(usersBlock).toContain(
      "(!('emailVerified' in incoming()) || ('emailVerified' in existing() && incoming().emailVerified == existing().emailVerified) || incoming().emailVerified == true)"
    );

    // Nenhum outro bloco match amplia permissões para INTRUSO (verificação de escopo de isVerifiedActiveExternalUser)
    const allowedBlocksForExternal = [
      "match /users/{userId}",
      "match /item_return_records/{itemId}",
      "match /claims/{claimId}",
      "match /notifications/{notificationId}",
    ];
    const allMatchHeaders = Array.from(rules.matchAll(/match \/([a-zA-Z0-9_]+)\/\{[^}]+\}/g))
      .map((m) => m[0])
      .filter((h) => h !== "match /databases/{database}");
    expect(allMatchHeaders.length).toBeGreaterThanOrEqual(20);
    for (const header of allMatchHeaders) {
      const block = extractMatchBlock(rules, header);
      if (block.includes("isVerifiedActiveExternalUser") || block.includes("isVerifiedActiveIntrusoDoc")) {
        expect(allowedBlocksForExternal).toContain(header);
      }
    }
  });

  it("3. Matriz B/C/D (ALUNO, SERVIDOR, ADMIN) — Anti-spoofing de claimerRole, proteção do Root Admin e anti-spoofing de /item_private", () => {
    // Anti-spoofing de claimerRole em create e resubmission para todos os papéis
    expect(claimsBlock).toContain("function isValidClaimerRoleForUserDoc(u, inc)");
    expect(claimsBlock).toContain(
      "(isRootIdentity() || (userDocExists() && isValidClaimerRoleForUserDoc(getUserData(), incoming())))"
    );
    expect(claimsBlock).toContain("isValidClaimerRoleForUserDoc(u, inc)");

    // Proteção do Root Admin contra ADMIN não-root em /users update e delete
    expect(usersBlock).toContain("(userId != 'hCG5mDgK1fRaTojULzlM7dXvb7n2' || isRootIdentity())");
    expect(usersBlock).toContain(
      "allow delete: if isAdmin() && request.auth.uid != userId && (userId != 'hCG5mDgK1fRaTojULzlM7dXvb7n2' || isRootIdentity());"
    );

    // /item_private impede spoofing de registeredByUserId no create
    expect(itemPrivateBlock).toContain(
      "(!('registeredByUserId' in incoming()) || incoming().registeredByUserId == request.auth.uid)"
    );

    // /users allow list continua fechado para enumeração (apenas Admin ou próprio e-mail)
    expect(usersBlock).toContain("allow list: if isAdmin() ||");
    expect(usersBlock).toContain("resource.data.email == request.auth.token.email");
  });

  it("4. Matriz E (Segurança) — Campos extras maliciosos, imutabilidade total de controle, envenenamento de tipo e bloqueio de contas suspensas/banidas/não-verificadas", () => {
    // /users create não-admin exige allowlist estrita e bloqueia campos de controle/standing forjados
    expect(usersBlock).toContain("inc.keys().hasOnly([");
    expect(usersBlock).toContain("(!('active' in inc) || inc.active == true)");
    expect(usersBlock).toContain("(!('status' in inc) || inc.status == 'active')");
    expect(usersBlock).toContain("!('roleAssignedByName' in inc)");
    expect(usersBlock).toContain("!('roleAssignmentActive' in inc)");
    expect(usersBlock).toContain("!('suspendedUntil' in inc)");
    expect(usersBlock).toContain("!('blockExpiresAt' in inc)");

    // areUserControlFieldsImmutable impede modificação e remoção de campos de controle
    expect(usersBlock).toContain(
      "(('roleAssignedBy' in ext && 'roleAssignedBy' in inc && inc.roleAssignedBy == ext.roleAssignedBy) || (!('roleAssignedBy' in ext) && !('roleAssignedBy' in inc)))"
    );
    expect(usersBlock).toContain(
      "(('active' in ext && 'active' in inc && inc.active == ext.active) || (!('active' in ext) && !('active' in inc)))"
    );
    expect(usersBlock).toContain(
      "(('roleAssignmentActive' in ext && 'roleAssignmentActive' in inc && inc.roleAssignmentActive == ext.roleAssignmentActive) || (!('roleAssignmentActive' in ext) && !('roleAssignmentActive' in inc)))"
    );

    // /notifications: get e list bloqueiam contas suspensas, banidas ou INTRUSO não verificado
    expect(notificationsBlock).toContain(
      "((isAccountActive() || isVerifiedActiveExternalUser()) && existing().userId == request.auth.uid)"
    );
    expect(notificationsBlock).toContain(
      "((isAccountActive() || isVerifiedActiveExternalUser()) && resource.data.userId == request.auth.uid)"
    );
    // /notifications: create exige allowlist de chaves e tamanhos (isValidSelfNotificationCreate)
    expect(rules).toContain("function isValidSelfNotificationCreate(inc, notificationId)");
    expect(notificationsBlock).toContain("isValidSelfNotificationCreate(incoming(), notificationId)");
    // /notifications: update exige read bool e readAt limitado
    expect(notificationsBlock).toContain("incoming().read is bool");
    expect(notificationsBlock).toContain("incoming().readAt is timestamp");
  });

  it("5. Alinhamento completo entre firestore.rules, listenerGuards.ts e AppContext.tsx para todos os estados de sessão", () => {
    // Unverified INTRUSO -> NONE em claims e notifications
    const unvIntruso = {
      authLoading: false,
      firebaseUser: { uid: "u-unv", email: "unv@gmail.com", emailVerified: false },
      currentUser: makeUser({ id: "u-unv", email: "unv@gmail.com", role: "INTRUSO", status: "active" }),
    };
    expect(getClaimsListenerScope(unvIntruso)).toBe("NONE");
    expect(getNotificationsListenerScope(unvIntruso)).toBe("NONE");

    // Suspended ALUNO -> NONE em claims e notifications (evita PERMISSION_DENIED no listener)
    const suspAluno = {
      authLoading: false,
      firebaseUser: { uid: "u-susp-a", email: "a@estudantes.ifpr.edu.br", emailVerified: true },
      currentUser: makeUser({
        id: "u-susp-a",
        email: "a@estudantes.ifpr.edu.br",
        role: "ALUNO",
        status: "suspended",
      }),
    };
    expect(getClaimsListenerScope(suspAluno)).toBe("NONE");
    expect(getNotificationsListenerScope(suspAluno)).toBe("NONE");

    // Banned INTRUSO -> NONE em claims e notifications
    const bannedIntruso = {
      authLoading: false,
      firebaseUser: { uid: "u-ban-e", email: "ban@gmail.com", emailVerified: true },
      currentUser: makeUser({ id: "u-ban-e", email: "ban@gmail.com", role: "INTRUSO", status: "banned", active: false }),
    };
    expect(getClaimsListenerScope(bannedIntruso)).toBe("NONE");
    expect(getNotificationsListenerScope(bannedIntruso)).toBe("NONE");

    // Verified Active INTRUSO -> SELF em claims e notifications, NONE em diretórios/staff/admin
    const verifiedIntruso = {
      authLoading: false,
      firebaseUser: { uid: "u-ok-e", email: "ok@gmail.com", emailVerified: true },
      currentUser: makeUser({ id: "u-ok-e", email: "ok@gmail.com", role: "INTRUSO", status: "active", active: true }),
    };
    expect(evaluateListenerSession(verifiedIntruso).isVerifiedActiveExternalUser).toBe(true);
    expect(getClaimsListenerScope(verifiedIntruso)).toBe("SELF");
    expect(getNotificationsListenerScope(verifiedIntruso)).toBe("SELF");
    expect(canSubscribeUsersDirectory(verifiedIntruso)).toBe(false);
    expect(canSubscribeStaffItemCollections(verifiedIntruso)).toBe(false);
    expect(canSubscribeStaffLogs(verifiedIntruso)).toBe(false);
    expect(canSubscribeAdminOnlyLogs(verifiedIntruso)).toBe(false);
    expect(getItemHistorySubscriptionMode(verifiedIntruso)).toBe("PUBLIC_API");

    // Root Admin -> ALL em claims e notifications
    const rootAdmin = {
      authLoading: false,
      firebaseUser: { uid: ROOT_ADMIN_UID, email: ROOT_ADMIN_EMAIL, emailVerified: true },
      currentUser: makeUser({
        id: ROOT_ADMIN_UID,
        email: ROOT_ADMIN_EMAIL,
        role: "ADMIN",
        approvalStatus: "APROVADO",
        status: "active",
      }),
    };
    expect(getClaimsListenerScope(rootAdmin)).toBe("ALL");
    expect(getNotificationsListenerScope(rootAdmin)).toBe("ALL");
    expect(canSubscribeUsersDirectory(rootAdmin)).toBe(true);

    // AppContext.tsx usa notifSession.isAccountActive antes de consultar broadcasts em /notifications
    expect(appContext).toContain("const canReadInstitutionalBroadcasts =");
    expect(appContext).toContain('notifSession.isAccountActive && currentUser?.role !== "INTRUSO"');
  });
});
