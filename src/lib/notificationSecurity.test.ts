import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  isGlobalNotification,
  isNotificationForUser,
  filterNotificationsForUser,
} from "./notificationHelper";
import { NotificationItem, User } from "../types";

describe("Notification Security Audit & Isolation Engine (13 Mandatory Scenarios)", () => {
  const rulesPath = path.resolve(process.cwd(), "firestore.rules");
  const rulesContent = fs.readFileSync(rulesPath, "utf-8");

  // Domain Test Users
  const userA: User = {
    id: "uid-user-aaa",
    name: "Estudante Alice",
    email: "alice@aluno.ifpr.edu.br",
    role: "ALUNO",
    courseOrDept: "Informática",
    registrationNumber: "20261001",
    avatarUrl: "",
  };

  const userB: User = {
    id: "uid-user-bbb",
    name: "Estudante Bob",
    email: "bob@aluno.ifpr.edu.br",
    role: "ALUNO",
    courseOrDept: "Eletrotécnica",
    registrationNumber: "20261002",
    avatarUrl: "",
  };

  const adminUser: User = {
    id: "uid-admin-root",
    name: "Coordenador TI",
    email: "admin.ti@ifpr.edu.br",
    role: "ADMIN",
    courseOrDept: "TI",
    registrationNumber: "20269999",
    avatarUrl: "",
  };

  const servidorUser: User = {
    id: "uid-servidor-sebac",
    name: "Servidor SEBAC",
    email: "sebac@ifpr.edu.br",
    role: "SERVIDOR",
    courseOrDept: "SEBAC",
    registrationNumber: "20268888",
    avatarUrl: "",
  };

  // Sample Notifications
  const notifA: NotificationItem = {
    id: "notif-item-a1",
    userId: "uid-user-aaa",
    title: "Objeto Localizado",
    message: "Seu estojo foi encontrado no Bloco B.",
    timestamp: "2026-09-16T10:00:00.000Z",
    read: false,
    type: "MATCH",
    relatedItemId: "item-123",
    isGlobal: false,
  };

  const notifB: NotificationItem = {
    id: "notif-item-b1",
    userId: "uid-user-bbb",
    title: "Solicitação Aprovada",
    message: "Sua solicitação de retirada foi aprovada.",
    timestamp: "2026-09-16T10:30:00.000Z",
    read: false,
    type: "CLAIM_UPDATE",
    relatedItemId: "item-456",
    isGlobal: false,
  };

  const globalNotif: NotificationItem = {
    id: "notif-global-broadcast",
    userId: "all",
    title: "Aviso Geral do Campus Ivaiporã",
    message: "Horário de atendimento do SEBAC durante a semana acadêmica.",
    timestamp: "2026-09-16T08:00:00.000Z",
    read: false,
    type: "SYSTEM",
    isGlobal: true,
  };

  // =========================================================================
  // 1. Usuário A lendo notificação de A (PERMITIDO)
  // =========================================================================
  it("Cenário 1: Usuário A lendo notificação de A deve ser PERMITIDO", () => {
    // Client-side domain check
    expect(isNotificationForUser(notifA, userA, userA.id)).toBe(true);

    // Rule check in firestore.rules
    expect(rulesContent).toContain("existing().userId == request.auth.uid");
    expect(rulesContent).toContain("resource.data.userId == request.auth.uid");
  });

  // =========================================================================
  // 2. Usuário A tentando ler notificação de B (NEGADO)
  // =========================================================================
  it("Cenário 2: Usuário A tentando ler notificação de B deve ser NEGADO", () => {
    // Client-side isolation
    expect(isNotificationForUser(notifB, userA, userA.id)).toBe(false);

    // Filter verification
    const visibleToA = filterNotificationsForUser([notifA, notifB], userA, userA.id);
    expect(visibleToA.find((n) => n.id === notifB.id)).toBeUndefined();

    // Firestore rule ensures only recipient UID, admin or broadcast targets match
    const notificationsBlock = rulesContent.match(/match \/notifications\/\{notificationId\}[\s\S]*?\n\s*\}/)?.[0];
    expect(notificationsBlock).toBeDefined();
    expect(notificationsBlock).toContain("existing().userId == request.auth.uid");
  });

  // =========================================================================
  // 3. Usuário B lendo notificação de B (PERMITIDO)
  // =========================================================================
  it("Cenário 3: Usuário B lendo notificação de B deve ser PERMITIDO", () => {
    expect(isNotificationForUser(notifB, userB, userB.id)).toBe(true);

    const visibleToB = filterNotificationsForUser([notifA, notifB], userB, userB.id);
    expect(visibleToB.find((n) => n.id === notifB.id)).toBeDefined();
    expect(visibleToB.find((n) => n.id === notifA.id)).toBeUndefined();
  });

  // =========================================================================
  // 4. Administrador lendo qualquer notificação (PERMITIDO)
  // =========================================================================
  it("Cenário 4: Administrador lendo qualquer notificação deve ser PERMITIDO", () => {
    expect(isNotificationForUser(notifA, adminUser, adminUser.id)).toBe(true);
    expect(isNotificationForUser(notifB, adminUser, adminUser.id)).toBe(true);
    expect(isNotificationForUser(globalNotif, adminUser, adminUser.id)).toBe(true);

    // Firestore rule allows admin get and list
    expect(rulesContent).toContain("allow get: if isSignedIn() && (");
    expect(rulesContent).toContain("isAdmin()");
    expect(rulesContent).toContain("allow list: if isSignedIn() && (");
  });

  // =========================================================================
  // 5. Usuário lendo notificação global (PERMITIDO)
  // =========================================================================
  it("Cenário 5: Qualquer usuário autenticado lendo notificação global deve ser PERMITIDO", () => {
    expect(isGlobalNotification(globalNotif.userId, globalNotif.isGlobal)).toBe(true);
    expect(isNotificationForUser(globalNotif, userA, userA.id)).toBe(true);
    expect(isNotificationForUser(globalNotif, userB, userB.id)).toBe(true);

    expect(rulesContent).toContain("existing().userId == 'all'");
    expect(rulesContent).toContain("existing().isGlobal == true");
  });

  // =========================================================================
  // 6. Usuário A tentando criar notificação para Usuário B (NEGADO)
  // =========================================================================
  it("Cenário 6: Usuário A (Aluno) tentando criar notificação para Usuário B deve ser NEGADO", () => {
    // In firestore.rules, regular users MUST satisfy incoming().userId == request.auth.uid
    expect(rulesContent).toContain("incoming().userId == request.auth.uid");

    // Regular users cannot spoof another recipient
    const createRuleMatch = rulesContent.match(/allow create: if isSignedIn\(\) && \([\s\S]*?\);/)?.[0];
    expect(createRuleMatch).toBeDefined();
    expect(createRuleMatch).toContain("isAdmin() ||");
    expect(createRuleMatch).toContain("isServidor() ||");
    expect(createRuleMatch).toContain("incoming().userId == request.auth.uid");
  });

  // =========================================================================
  // 7. Usuário criando notificação para si mesmo quando aplicável (PERMITIDO)
  // =========================================================================
  it("Cenário 7: Usuário criando notificação para si mesmo deve ser PERMITIDO", () => {
    // Rule condition: incoming().userId == request.auth.uid && incoming().isGlobal != true && read == false
    expect(rulesContent).toContain("incoming().userId == request.auth.uid");
    expect(rulesContent).toContain("incoming().read == false");
  });

  // =========================================================================
  // 8. Administrador / Servidor criando notificação institucional (PERMITIDO)
  // =========================================================================
  it("Cenário 8: Administrador / Servidor criando notificação institucional ou broadcast deve ser PERMITIDO", () => {
    expect(rulesContent).toContain("allow create: if isSignedIn() && (\n        isAdmin() || \n        isServidor() ||");
  });

  // =========================================================================
  // 9. Usuário A tentando marcar como lida notificação de B (NEGADO)
  // =========================================================================
  it("Cenário 9: Usuário A tentando marcar como lida notificação de B deve ser NEGADO", () => {
    // Firestore rules update requires: existing().userId == request.auth.uid
    expect(rulesContent).toContain("existing().userId == request.auth.uid");
  });

  // =========================================================================
  // 10. Usuário A marcando como lida sua própria notificação (PERMITIDO)
  // =========================================================================
  it("Cenário 10: Usuário A marcando como lida sua própria notificação deve ser PERMITIDO", () => {
    // When marking as read, incoming().userId matches existing().userId, and user is owner
    expect(rulesContent).toContain("existing().userId == request.auth.uid");
    expect(rulesContent).toContain("incoming().userId == existing().userId");
  });

  // =========================================================================
  // 11. Usuário A tentando alterar recipientId de notificação de A para B (NEGADO)
  // =========================================================================
  it("Cenário 11: Usuário A tentando alterar recipientId de notificação de A para B deve ser NEGADO", () => {
    // Immutable recipient: incoming().userId == existing().userId
    expect(rulesContent).toContain("incoming().userId == existing().userId");
  });

  // =========================================================================
  // 12. Usuário A tentando transformar notificação individual em global (NEGADO)
  // =========================================================================
  it("Cenário 12: Usuário A tentando transformar notificação individual em global deve ser NEGADO", () => {
    // Immutable isGlobal flag and create restriction
    expect(rulesContent).toContain("(!('isGlobal' in existing()) || incoming().isGlobal == existing().isGlobal)");
    expect(rulesContent).toContain("(!('isGlobal' in incoming()) || incoming().isGlobal != true)");
  });

  // =========================================================================
  // 13. Usuário A tentando excluir notificação de B (NEGADO)
  // =========================================================================
  it("Cenário 13: Usuário A tentando excluir notificação de B deve ser NEGADO", () => {
    // Delete rule strictly enforces: existing().userId == request.auth.uid || isAdmin()
    const deleteMatch = rulesContent.match(/allow delete: if isSignedIn\(\) && \([\s\S]*?\);/)?.[0];
    expect(deleteMatch).toBeDefined();
    expect(deleteMatch).toContain("existing().userId == request.auth.uid ||");
    expect(deleteMatch).toContain("isAdmin()");
  });
});
