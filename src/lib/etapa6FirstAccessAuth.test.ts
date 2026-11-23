import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  buildPasswordResetActionCodeSettings,
  dispatchPasswordResetWithFallback,
  isContinueUriUnauthorizedError,
  isValidAuthEmail,
  normalizeAuthEmail,
  shouldTriggerClientFirebaseResetFallback,
  validateAdminCreateUserInput,
  validateNewPasswordInput,
} from "./adminUserProvisioning";
import { parseAuthError } from "./authErrorHandler";
import { parseCurrentRoute, ROUTES } from "./routes";
import { translations } from "./i18n";
import {
  executeAdminCreateUser,
  executeAdminSendFirstAccessLink,
} from "../../server";

function createMockAdminAuth(options?: {
  initialUsers?: Array<{
    uid: string;
    email: string;
    displayName?: string;
    emailVerified?: boolean;
    disabled?: boolean;
    password?: string;
  }>;
  rejectContinueUri?: boolean;
  failLinkGeneration?: boolean;
}) {
  const usersByUid = new Map<string, any>();
  const uidByEmail = new Map<string, string>();
  const customClaims = new Map<string, Record<string, any>>();
  const createdPayloads: any[] = [];
  const deletedUids: string[] = [];
  const activeResetCodes = new Map<string, string>();
  let seq = 1;

  for (const u of options?.initialUsers || []) {
    const emailLower = u.email.toLowerCase();
    usersByUid.set(u.uid, { ...u, email: emailLower });
    uidByEmail.set(emailLower, u.uid);
  }

  return {
    usersByUid,
    uidByEmail,
    customClaims,
    createdPayloads,
    deletedUids,
    activeResetCodes,
    async getUser(uid: string) {
      const found = usersByUid.get(uid);
      if (!found) {
        const err: any = new Error("There is no user record corresponding to the provided identifier.");
        err.code = "auth/user-not-found";
        throw err;
      }
      return structuredClone(found);
    },
    async getUserByEmail(email: string) {
      const uid = uidByEmail.get(email.toLowerCase());
      if (!uid) {
        const err: any = new Error("There is no user record corresponding to the provided email.");
        err.code = "auth/user-not-found";
        throw err;
      }
      return structuredClone(usersByUid.get(uid));
    },
    async createUser(payload: any) {
      createdPayloads.push(structuredClone(payload));
      const emailLower = String(payload.email || "").toLowerCase();
      if (uidByEmail.has(emailLower)) {
        const err: any = new Error("The email address is already in use by another account.");
        err.code = "auth/email-already-exists";
        throw err;
      }
      const uid = payload.uid || `fb_uid_${seq++}`;
      const record = {
        uid,
        email: emailLower,
        displayName: payload.displayName || "",
        emailVerified: Boolean(payload.emailVerified),
        disabled: Boolean(payload.disabled),
        password: payload.password, // Should remain undefined for Etapa 6
      };
      usersByUid.set(uid, record);
      uidByEmail.set(emailLower, uid);
      return structuredClone(record);
    },
    async deleteUser(uid: string) {
      deletedUids.push(uid);
      const existing = usersByUid.get(uid);
      if (existing) {
        uidByEmail.delete(existing.email);
        usersByUid.delete(uid);
      }
    },
    async setCustomUserClaims(uid: string, claims: Record<string, any>) {
      customClaims.set(uid, structuredClone(claims));
    },
    async generatePasswordResetLink(email: string, actionCodeSettings?: any) {
      if (options?.failLinkGeneration) {
        throw new Error("INTERNAL_LINK_ERROR");
      }
      if (options?.rejectContinueUri && actionCodeSettings?.url) {
        const err: any = new Error("Domain not allowlisted by project");
        err.code = "auth/unauthorized-continue-uri";
        throw err;
      }
      const code = `oob_${seq++}`;
      activeResetCodes.set(code, email.toLowerCase());
      const continueParam = actionCodeSettings?.url
        ? `&continueUrl=${encodeURIComponent(actionCodeSettings.url)}`
        : "";
      return `https://gen-lang-client-0490390966.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=${code}${continueParam}`;
    },
    // Helper simulating Firebase Client verifyPasswordResetCode + confirmPasswordReset + signIn
    verifyResetCode(oobCode: string) {
      const email = activeResetCodes.get(oobCode);
      if (!email) {
        const err: any = new Error("The action code is invalid.");
        err.code = "auth/invalid-action-code";
        throw err;
      }
      return email;
    },
    confirmResetCode(oobCode: string, newPassword: string) {
      const email = this.verifyResetCode(oobCode);
      const uid = uidByEmail.get(email);
      if (!uid) throw new Error("User missing");
      const user = usersByUid.get(uid);
      user.password = newPassword;
      activeResetCodes.delete(oobCode);
      return email;
    },
    signInWithEmailAndPassword(email: string, password: string) {
      const uid = uidByEmail.get(email.toLowerCase());
      const user = uid ? usersByUid.get(uid) : null;
      if (!user || !user.password || user.password !== password) {
        const err: any = new Error("INVALID_LOGIN_CREDENTIALS");
        err.code = "auth/invalid-credential";
        throw err;
      }
      return { uid: user.uid, email: user.email };
    },
  };
}

function createMockAdminFirestore(options?: {
  users?: Record<string, any>;
  failTransaction?: boolean;
}) {
  const store: Record<string, Map<string, any>> = {
    users: new Map(Object.entries(options?.users || {})),
    role_assignments: new Map(),
    audit_logs: new Map(),
    activity_logs: new Map(),
    email_notifications: new Map(),
  };

  const makeDocRef = (col: string, id: string) => ({
    id,
    _col: col,
    async get() {
      const data = store[col]?.get(id);
      return {
        id,
        exists: Boolean(data),
        data: () => (data ? structuredClone(data) : undefined),
      };
    },
    async set(payload: any) {
      if (!store[col]) store[col] = new Map();
      store[col].set(id, structuredClone(payload));
    },
  });

  const makeQuery = (col: string, filters: Array<{ field: string; value: any }> = []) => ({
    where(field: string, _op: string, value: any) {
      return makeQuery(col, [...filters, { field, value }]);
    },
    limit(_n: number) {
      return this;
    },
    async get() {
      const docs: any[] = [];
      for (const [id, data] of (store[col] || new Map()).entries()) {
        if (filters.every((f) => data[f.field] === f.value)) {
          docs.push({
            id,
            exists: true,
            data: () => structuredClone(data),
          });
        }
      }
      return { empty: docs.length === 0, size: docs.length, docs };
    },
  });

  return {
    store,
    collection(name: string) {
      return {
        doc: (id: string) => makeDocRef(name, id),
        where: (field: string, op: string, value: any) =>
          makeQuery(name, [{ field, value }]),
      };
    },
    async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      if (options?.failTransaction) {
        throw new Error("Simulated Firestore write failure");
      }
      const writes: Array<{ col: string; id: string; payload: any }> = [];
      const tx = {
        async get(ref: any) {
          return ref.get();
        },
        set(ref: any, payload: any) {
          writes.push({ col: ref._col, id: ref.id, payload: structuredClone(payload) });
        },
      };
      const result = await fn(tx);
      for (const w of writes) {
        if (!store[w.col]) store[w.col] = new Map();
        store[w.col].set(w.id, w.payload);
      }
      return result;
    },
  };
}

describe("Etapa 6 — Autenticação, Criação Administrativa e Primeiro Acesso", () => {
  it("normalizes and validates emails, inputs, and password rules accurately", () => {
    expect(normalizeAuthEmail("  Aluno.Teste@IFPR.EDU.BR  ")).toBe("aluno.teste@ifpr.edu.br");
    expect(isValidAuthEmail("aluno@ifpr.edu.br")).toBe(true);
    expect(isValidAuthEmail("invalid-email")).toBe(false);

    const validInput = validateAdminCreateUserInput({
      name: "  Maria Souza  ",
      email: "MARIA.SOUZA@ifpr.edu.br",
      role: "SERVIDOR",
    });
    expect(validInput.ok).toBe(true);
    if (validInput.ok) {
      expect(validInput.data.name).toBe("Maria Souza");
      expect(validInput.data.email).toBe("maria.souza@ifpr.edu.br");
      expect(validInput.data.role).toBe("SERVIDOR");
      expect(validInput.data.approvalStatus).toBe("APROVADO");
    }

    expect(validateAdminCreateUserInput({ name: "AB", email: "a@b.com" }).ok).toBe(false);
    expect(validateAdminCreateUserInput({ name: "João Silva", email: "bad" }).ok).toBe(false);
    expect(
      validateAdminCreateUserInput({ name: "João Silva", email: "a@b.com", role: "SUPERUSER" }).ok
    ).toBe(false);

    expect(validateNewPasswordInput("12345", "12345").ok).toBe(false);
    expect(validateNewPasswordInput("SenhaForte123", "OutraSenha123").ok).toBe(false);
    expect(validateNewPasswordInput("SenhaForte123", "SenhaForte123").ok).toBe(true);
  });

  it("builds safe ActionCodeSettings and detects unauthorized continueUrl errors", () => {
    expect(buildPasswordResetActionCodeSettings("https://localiza.ifpr.edu.br/login")).toEqual({
      url: "https://localiza.ifpr.edu.br/redefinir-senha",
      handleCodeInApp: true,
    });
    expect(buildPasswordResetActionCodeSettings("http://localhost:3000")).toEqual({
      url: "http://localhost:3000/redefinir-senha",
      handleCodeInApp: true,
    });
    expect(buildPasswordResetActionCodeSettings("http://insecure.example.com")).toBeUndefined();

    expect(isContinueUriUnauthorizedError({ code: "auth/unauthorized-continue-uri" })).toBe(true);
    expect(isContinueUriUnauthorizedError({ code: "auth/too-many-requests" })).toBe(false);

    expect(shouldTriggerClientFirebaseResetFallback("PENDING_SMTP_CONFIG")).toBe(true);
    expect(shouldTriggerClientFirebaseResetFallback("ERROR")).toBe(true);
    expect(shouldTriggerClientFirebaseResetFallback("SENT")).toBe(false);
  });

  it("parses new auth action-code & continue-uri errors into helpful PT-BR guidance and registers routes/i18n", () => {
    expect(parseAuthError({ code: "auth/unauthorized-continue-uri" }).userMessage).toMatch(
      /domínio/i
    );
    expect(parseAuthError({ code: "auth/expired-action-code" }).userMessage).toMatch(/expirou/i);
    expect(parseAuthError({ code: "auth/invalid-action-code" }).userMessage).toMatch(/inválido/i);

    expect(parseCurrentRoute("/redefinir-senha").routeKey).toBe("reset_password");
    expect(parseCurrentRoute("/primeiro-acesso").routeKey).toBe("reset_password");
    expect(parseCurrentRoute("/definir-senha").routeKey).toBe("reset_password");
    expect(parseCurrentRoute("/auth/action").routeKey).toBe("reset_password");
    expect(ROUTES.RESET_PASSWORD).toBe("/redefinir-senha");
    expect(ROUTES.FIRST_ACCESS).toBe("/primeiro-acesso");

    expect(translations.pt.firstAccessOrForgot).toBeTruthy();
    expect(translations.en.firstAccessOrForgot).toBeTruthy();
  });

  it("creates real Firebase Auth + Firestore user with identical UID, NO default password, and sends SMTP setup link", async () => {
    const adminAuth = createMockAdminAuth();
    const adminFirestore = createMockAdminFirestore({
      users: {
        admin_root: {
          id: "admin_root",
          name: "Administrador Raiz",
          email: "paulocauan39@gmail.com",
          role: "ADMIN",
          status: "active",
          active: true,
        },
      },
    });
    const sentEmails: any[] = [];
    const mockTransporter = {
      async sendMail(mail: any) {
        sentEmails.push(mail);
        return { messageId: "msg-smtp-001" };
      },
    };

    const res = await executeAdminCreateUser(
      { uid: "admin_root", email: "paulocauan39@gmail.com", isAdmin: true, isRoot: true },
      {
        name: "Kalil Avaliador",
        email: "Kalil.Teste@IFPR.edu.br",
        role: "SERVIDOR",
        courseOrDept: "SEBAC - Ivaiporã",
      },
      "https://localiza-ifpr.vercel.app",
      {
        adminAuth: adminAuth as any,
        adminFirestore: adminFirestore as any,
        transporter: mockTransporter as any,
        skipCredentialDiagnostics: true,
      }
    );

    expect(res.statusCode).toBe(201);
    expect(res.payload.success).toBe(true);
    expect(res.payload.authCreated).toBe(true);
    expect(res.payload.emailSent).toBe(true);
    expect(res.payload.deliveryMethod).toBe("SMTP");
    expect(res.payload.deliveryStatus).toBe("SENT");
    // Must never leak setup link back when SMTP delivered it
    expect(res.payload.manualSetupLink).toBeUndefined();

    // Verify no default password was passed to Auth or saved in Firestore
    expect(adminAuth.createdPayloads).toHaveLength(1);
    expect(adminAuth.createdPayloads[0].password).toBeUndefined();
    expect(adminAuth.createdPayloads[0].emailVerified).toBe(false);

    const uid = res.payload.user.id;
    expect(adminAuth.usersByUid.has(uid)).toBe(true);

    const fsUser = adminFirestore.store.users.get(uid);
    expect(fsUser).toBeDefined();
    expect(fsUser.email).toBe("kalil.teste@ifpr.edu.br");
    expect(fsUser.password).toBeUndefined();
    expect(fsUser.role).toBe("SERVIDOR");

    const roleAssign = adminFirestore.store.role_assignments.get(uid);
    expect(roleAssign).toBeDefined();
    expect(roleAssign.assignedRole).toBe("SERVIDOR");

    expect(adminAuth.customClaims.get(uid)).toEqual({
      role: "SERVIDOR",
      approvalStatus: "APROVADO",
      admin: false,
    });

    // Email dispatched with real oobCode link, and audit log redacts oobCode
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe("kalil.teste@ifpr.edu.br");
    expect(sentEmails[0].html).toContain("oobCode=oob_");

    const emailLogs = Array.from(adminFirestore.store.email_notifications.values());
    expect(emailLogs).toHaveLength(1);
    expect(emailLogs[0].setupLinkRedacted).toContain("[REDACTED]");
    expect(emailLogs[0].setupLinkRedacted).not.toContain("oob_");

    // End-to-end First Access simulation: initial login without password fails; after defining password via link, login succeeds!
    expect(() =>
      adminAuth.signInWithEmailAndPassword("kalil.teste@ifpr.edu.br", "123456")
    ).toThrow();

    const oobMatch = sentEmails[0].text.match(/oobCode=([^&\s]+)/);
    expect(oobMatch).toBeTruthy();
    const oobCode = oobMatch![1];

    expect(adminAuth.verifyResetCode(oobCode)).toBe("kalil.teste@ifpr.edu.br");
    adminAuth.confirmResetCode(oobCode, "MinhaSenhaUnica@2026");

    const signedIn = adminAuth.signInWithEmailAndPassword(
      "kalil.teste@ifpr.edu.br",
      "MinhaSenhaUnica@2026"
    );
    expect(signedIn.uid).toBe(uid);
  });

  it("enforces RBAC, Root Admin protection, and duplicate rejection without overwriting accounts", async () => {
    const adminAuth = createMockAdminAuth({
      initialUsers: [{ uid: "existing_auth_uid", email: "duplicado@ifpr.edu.br" }],
    });
    const adminFirestore = createMockAdminFirestore({
      users: {
        fs_only_uid: {
          id: "fs_only_uid",
          name: "Legado Sem Auth",
          email: "legado@ifpr.edu.br",
          role: "ALUNO",
          status: "active",
          active: true,
        },
      },
    });

    // Non-admin blocked
    const forbidden = await executeAdminCreateUser(
      { uid: "u1", email: "aluno@ifpr.edu.br", isAdmin: false },
      { name: "Test", email: "x@ifpr.edu.br", role: "ALUNO" },
      undefined,
      { adminAuth: adminAuth as any, adminFirestore: adminFirestore as any, skipCredentialDiagnostics: true }
    );
    expect(forbidden.statusCode).toBe(403);

    // Non-root ADMIN cannot create ADMIN
    const nonRootAdmin = await executeAdminCreateUser(
      { uid: "admin_2", email: "admin2@ifpr.edu.br", isAdmin: true, isRoot: false },
      { name: "Outro Admin", email: "novo.admin@ifpr.edu.br", role: "ADMIN" },
      undefined,
      { adminAuth: adminAuth as any, adminFirestore: adminFirestore as any, skipCredentialDiagnostics: true }
    );
    expect(nonRootAdmin.statusCode).toBe(403);
    expect(nonRootAdmin.payload.code).toBe("ROOT_ADMIN_ONLY_FOR_ADMIN_ROLE");

    // Duplicate in Firebase Auth -> 409 EMAIL_ALREADY_EXISTS
    const dupAuth = await executeAdminCreateUser(
      { uid: "admin_root", email: "paulocauan39@gmail.com", isAdmin: true, isRoot: true },
      { name: "Pessoa Repetida", email: "duplicado@ifpr.edu.br", role: "ALUNO" },
      undefined,
      { adminAuth: adminAuth as any, adminFirestore: adminFirestore as any, skipCredentialDiagnostics: true }
    );
    expect(dupAuth.statusCode).toBe(409);
    expect(dupAuth.payload.code).toBe("EMAIL_ALREADY_EXISTS");

    // Duplicate in Firestore -> 409 FIRESTORE_USER_ALREADY_EXISTS (does NOT overwrite or delete)
    const dupFs = await executeAdminCreateUser(
      { uid: "admin_root", email: "paulocauan39@gmail.com", isAdmin: true, isRoot: true },
      { name: "Outro Nome", email: "legado@ifpr.edu.br", role: "ALUNO" },
      undefined,
      { adminAuth: adminAuth as any, adminFirestore: adminFirestore as any, skipCredentialDiagnostics: true }
    );
    expect(dupFs.statusCode).toBe(409);
    expect(dupFs.payload.code).toBe("FIRESTORE_USER_ALREADY_EXISTS");
    expect(adminFirestore.store.users.get("fs_only_uid").name).toBe("Legado Sem Auth");
  });

  it("rolls back Firebase Auth user cleanly if Firestore persistence fails", async () => {
    const adminAuth = createMockAdminAuth();
    const adminFirestore = createMockAdminFirestore({ failTransaction: true });

    const res = await executeAdminCreateUser(
      { uid: "admin_root", email: "paulocauan39@gmail.com", isAdmin: true, isRoot: true },
      { name: "Rollback Teste", email: "rollback@ifpr.edu.br", role: "ALUNO" },
      "https://localiza-ifpr.vercel.app",
      {
        adminAuth: adminAuth as any,
        adminFirestore: adminFirestore as any,
        transporter: null,
        skipCredentialDiagnostics: true,
      }
    );

    expect(res.statusCode).toBe(500);
    expect(res.payload.code).toBe("FIRESTORE_CREATE_FAILED");
    expect(adminAuth.deletedUids).toHaveLength(1);
    expect(adminAuth.usersByUid.size).toBe(0);
    expect(adminAuth.uidByEmail.size).toBe(0);
  });

  it("handles missing SMTP / SMTP error honestly and supports manualSetupLink + continueUrl fallback", async () => {
    const adminAuth = createMockAdminAuth({ rejectContinueUri: true });
    const adminFirestore = createMockAdminFirestore();

    // Case 1: SMTP not configured
    const resNoSmtp = await executeAdminCreateUser(
      { uid: "admin_root", email: "paulocauan39@gmail.com", isAdmin: true, isRoot: true },
      { name: "Sem SMTP", email: "semsmtp@ifpr.edu.br", role: "ALUNO" },
      "https://unregistered-preview.run.app",
      {
        adminAuth: adminAuth as any,
        adminFirestore: adminFirestore as any,
        transporter: null,
        skipCredentialDiagnostics: true,
      }
    );

    expect(resNoSmtp.statusCode).toBe(201);
    expect(resNoSmtp.payload.emailSent).toBe(false);
    expect(resNoSmtp.payload.deliveryStatus).toBe("PENDING_SMTP_CONFIG");
    expect(resNoSmtp.payload.continueUriFallbackUsed).toBe(true);
    expect(resNoSmtp.payload.manualSetupLink).toContain("oobCode=");
    expect(shouldTriggerClientFirebaseResetFallback(resNoSmtp.payload.deliveryStatus)).toBe(true);

    // Case 2: SMTP throws error
    const failingTransporter = {
      async sendMail() {
        throw new Error("SMTP connection refused ECONNREFUSED");
      },
    };
    const resSmtpErr = await executeAdminCreateUser(
      { uid: "admin_root", email: "paulocauan39@gmail.com", isAdmin: true, isRoot: true },
      { name: "Erro SMTP", email: "errosmtp@ifpr.edu.br", role: "ALUNO" },
      undefined,
      {
        adminAuth: adminAuth as any,
        adminFirestore: adminFirestore as any,
        transporter: failingTransporter as any,
        skipCredentialDiagnostics: true,
      }
    );

    expect(resSmtpErr.statusCode).toBe(201);
    expect(resSmtpErr.payload.emailSent).toBe(false);
    expect(resSmtpErr.payload.deliveryStatus).toBe("ERROR");
    expect(resSmtpErr.payload.deliveryError).toContain("ECONNREFUSED");
    expect(resSmtpErr.payload.manualSetupLink).toContain("oobCode=");
  });

  it("provisions missing Firebase Auth identity for legacy Firestore-only users preserving exact UID without deleting DB records", async () => {
    const adminAuth = createMockAdminAuth();
    const adminFirestore = createMockAdminFirestore({
      users: {
        usr_legacy_999: {
          id: "usr_legacy_999",
          name: "Docente Legado",
          email: "docente.legado@ifpr.edu.br",
          role: "SERVIDOR",
          approvalStatus: "APROVADO",
          status: "active",
          active: true,
          emailVerified: false,
        },
      },
    });

    // Without provisionMissingAuth -> 409 AUTH_USER_MISSING
    const refused = await executeAdminSendFirstAccessLink(
      { uid: "admin_root", email: "paulocauan39@gmail.com", isAdmin: true, isRoot: true },
      { targetUserId: "usr_legacy_999", provisionMissingAuth: false },
      undefined,
      {
        adminAuth: adminAuth as any,
        adminFirestore: adminFirestore as any,
        transporter: null,
        skipCredentialDiagnostics: true,
      }
    );
    expect(refused.statusCode).toBe(409);
    expect(refused.payload.code).toBe("AUTH_USER_MISSING");

    // With provisionMissingAuth: true -> creates Auth with exact UID usr_legacy_999 and sends link
    const provisioned = await executeAdminSendFirstAccessLink(
      { uid: "admin_root", email: "paulocauan39@gmail.com", isAdmin: true, isRoot: true },
      { targetUserId: "usr_legacy_999", provisionMissingAuth: true },
      "https://localiza-ifpr.vercel.app",
      {
        adminAuth: adminAuth as any,
        adminFirestore: adminFirestore as any,
        transporter: { async sendMail() { return { messageId: "ok-1" }; } } as any,
        skipCredentialDiagnostics: true,
      }
    );

    expect(provisioned.statusCode).toBe(200);
    expect(provisioned.payload.success).toBe(true);
    expect(provisioned.payload.uid).toBe("usr_legacy_999");
    expect(provisioned.payload.authProvisioned).toBe(true);
    expect(provisioned.payload.emailSent).toBe(true);
    expect(adminAuth.usersByUid.has("usr_legacy_999")).toBe(true);
    expect(adminFirestore.store.users.get("usr_legacy_999").name).toBe("Docente Legado");
    expect(adminAuth.deletedUids).toHaveLength(0);

    const audits = Array.from(adminFirestore.store.audit_logs.values());
    expect(audits.some((a) => a.action === "FIRST_ACCESS_AUTH_PROVISIONED" && a.objectId === "usr_legacy_999")).toBe(true);
  });

  it("handles client password recovery fallback cleanly on unauthorized continueUrl and propagates real failures", async () => {
    const calls: Array<{ email: string; hasActionSettings: boolean }> = [];
    const fallbackResult = await dispatchPasswordResetWithFallback({
      auth: {},
      email: "  Professor@IFPR.EDU.BR ",
      originUrl: "https://preview-domain.run.app",
      sendFn: async (_auth, email, settings) => {
        calls.push({ email, hasActionSettings: Boolean(settings) });
        if (settings) {
          const err: any = new Error("Domain not allowlisted");
          err.code = "auth/unauthorized-continue-uri";
          throw err;
        }
      },
    });

    expect(fallbackResult.sent).toBe(true);
    expect(fallbackResult.usedFallbackWithoutContinueUri).toBe(true);
    expect(calls).toEqual([
      { email: "professor@ifpr.edu.br", hasActionSettings: true },
      { email: "professor@ifpr.edu.br", hasActionSettings: false },
    ]);

    await expect(
      dispatchPasswordResetWithFallback({
        auth: {},
        email: "professor@ifpr.edu.br",
        originUrl: "https://localiza-ifpr.vercel.app",
        sendFn: async () => {
          const err: any = new Error("Too many attempts");
          err.code = "auth/too-many-requests";
          throw err;
        },
      })
    ).rejects.toMatchObject({ code: "auth/too-many-requests" });
  });

  it("keeps client integration clean and preserves firestore.rules SHA-256 unchanged", () => {
    const root = process.cwd();
    const appContextSrc = fs.readFileSync(path.join(root, "src/context/AppContext.tsx"), "utf8");
    const authModalSrc = fs.readFileSync(path.join(root, "src/components/AuthModal.tsx"), "utf8");
    const dashboardSrc = fs.readFileSync(path.join(root, "src/components/DashboardView.tsx"), "utf8");
    const rulesBytes = fs.readFileSync(path.join(root, "firestore.rules"));
    const rulesSha256 = crypto.createHash("sha256").update(rulesBytes).digest("hex");

    // Must never synthesize usr_ IDs inside addUserByAdmin anymore
    expect(appContextSrc).not.toContain("`usr_${Date.now()}");
    expect(appContextSrc).toContain("/api/admin/create-user");
    expect(appContextSrc).toContain("/api/admin/send-first-access-link");
    expect(appContextSrc).toContain("dispatchPasswordResetWithFallback");

    expect(authModalSrc).toContain("dispatchPasswordResetWithFallback");
    expect(authModalSrc).toContain("setMode(\"reset\")");

    expect(dashboardSrc).toContain("sendUserFirstAccessLink");
    expect(dashboardSrc).toContain("firstAccessFeedback");

    // Protected firestore.rules SHA-256 must match Etapa 4 homologated hash
    expect(rulesSha256).toBe("7fa455e632a9d1831517fe7269e52d922b8614f903f0a28f025f6418812d95a5");
  });
});
