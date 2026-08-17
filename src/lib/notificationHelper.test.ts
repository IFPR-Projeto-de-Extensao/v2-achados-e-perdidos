import { describe, it, expect } from "vitest";
import {
  isGlobalNotification,
  isNotificationForUser,
  filterNotificationsForUser,
} from "./notificationHelper";
import { NotificationItem, User } from "../types";

describe("Notification Recipient & Visibility Filtering", () => {
  const studentA: User = {
    id: "student-uid-aaa",
    name: "Aluno A",
    email: "alunoa@ifpr.edu.br",
    role: "ALUNO",
    courseOrDept: "Informática",
    registrationNumber: "202600001",
    avatarUrl: "https://example.com/avatar1.jpg",
  };

  const studentB: User = {
    id: "student-uid-bbb",
    name: "Aluno B",
    email: "alunob@ifpr.edu.br",
    role: "ALUNO",
    courseOrDept: "Agronomia",
    registrationNumber: "202600002",
    avatarUrl: "https://example.com/avatar2.jpg",
  };

  const adminUser: User = {
    id: "admin-uid-root",
    name: "Administrador",
    email: "admin@ifpr.edu.br",
    role: "ADMIN",
    courseOrDept: "TI",
    registrationNumber: "202699999",
    avatarUrl: "https://example.com/avatar3.jpg",
  };

  const notifForA: NotificationItem = {
    id: "notif-1",
    userId: "student-uid-aaa",
    title: "Objeto Similar Encontrado",
    message: "Mensagem exclusiva para o Aluno A",
    timestamp: "2026-08-17T12:00:00.000Z",
    read: false,
    type: "SYSTEM",
  };

  const notifForB: NotificationItem = {
    id: "notif-2",
    userId: "student-uid-bbb",
    title: "Devolução Aprovada",
    message: "Mensagem exclusiva para o Aluno B",
    timestamp: "2026-08-17T12:05:00.000Z",
    read: false,
    type: "SYSTEM",
  };

  const globalNotifAll: NotificationItem = {
    id: "notif-global-1",
    userId: "all",
    title: "Aviso Geral do Campus",
    message: "Aviso para todos os estudantes do campus",
    timestamp: "2026-08-17T12:10:00.000Z",
    read: false,
    type: "SYSTEM",
  };

  const globalNotifTodosAlunos: NotificationItem = {
    id: "notif-global-2",
    userId: "todos_alunos",
    title: "Manutenção Preventiva",
    message: "Aviso para todos os alunos",
    timestamp: "2026-08-17T12:15:00.000Z",
    read: false,
    type: "SYSTEM",
  };

  it("identifies global notification identifiers correctly", () => {
    expect(isGlobalNotification("all")).toBe(true);
    expect(isGlobalNotification("todos")).toBe(true);
    expect(isGlobalNotification("todos_alunos")).toBe(true);
    expect(isGlobalNotification("global")).toBe(true);
    expect(isGlobalNotification(undefined, true)).toBe(true);
    expect(isGlobalNotification("student-uid-aaa")).toBe(false);
    expect(isGlobalNotification("")).toBe(false);
    expect(isGlobalNotification(null)).toBe(false);
  });

  it("ensures notification intended for Student A is visible to Student A", () => {
    expect(isNotificationForUser(notifForA, studentA)).toBe(true);
  });

  it("ensures notification intended for Student A is NEVER visible to Student B", () => {
    expect(isNotificationForUser(notifForA, studentB)).toBe(false);
  });

  it("ensures notification intended for Student B is NEVER visible to Student A", () => {
    expect(isNotificationForUser(notifForB, studentA)).toBe(false);
  });

  it("ensures global notifications are visible to both Student A and Student B", () => {
    expect(isNotificationForUser(globalNotifAll, studentA)).toBe(true);
    expect(isNotificationForUser(globalNotifAll, studentB)).toBe(true);
    expect(isNotificationForUser(globalNotifTodosAlunos, studentA)).toBe(true);
    expect(isNotificationForUser(globalNotifTodosAlunos, studentB)).toBe(true);
  });

  it("ensures administrator can view all notifications for monitoring and oversight", () => {
    expect(isNotificationForUser(notifForA, adminUser)).toBe(true);
    expect(isNotificationForUser(notifForB, adminUser)).toBe(true);
    expect(isNotificationForUser(globalNotifAll, adminUser)).toBe(true);
  });

  it("filters a notification list strictly per user", () => {
    const allNotifs = [notifForA, notifForB, globalNotifAll, globalNotifTodosAlunos];

    const notifsForStudentA = filterNotificationsForUser(allNotifs, studentA);
    expect(notifsForStudentA.map((n) => n.id)).toEqual([
      "notif-1",
      "notif-global-1",
      "notif-global-2",
    ]);

    const notifsForStudentB = filterNotificationsForUser(allNotifs, studentB);
    expect(notifsForStudentB.map((n) => n.id)).toEqual([
      "notif-2",
      "notif-global-1",
      "notif-global-2",
    ]);

    const notifsForAdmin = filterNotificationsForUser(allNotifs, adminUser);
    expect(notifsForAdmin.length).toBe(4);
  });
});
