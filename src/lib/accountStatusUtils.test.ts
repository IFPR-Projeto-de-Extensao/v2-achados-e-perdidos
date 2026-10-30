import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  resolveAccountStatus,
  evaluateDeadlineField,
  isUserAccountActive,
  isAccountBlocked,
} from "./accountStatusUtils";

describe("LOCALIZA+ v1.10.9 — Suíte Unitária: Paridade de resolveAccountStatus com Firestore Rules (UT-01 a UT-29)", () => {
  it("UT-01: Paridade com C-43 (suspended + blockExpiresAt expirado + suspendedUntil inválido -> suspended)", () => {
    const res = resolveAccountStatus({
      status: "suspended",
      blockExpiresAt: new Date(Date.now() - 86400000).toISOString(),
      suspendedUntil: "invalid-string-corrupt",
    });
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
  });

  it("UT-02: Paridade com C-44 (suspended + suspendedUntil expirado + blockExpiresAt inválido -> suspended)", () => {
    const res = resolveAccountStatus({
      status: "suspended",
      suspendedUntil: new Date(Date.now() - 86400000).toISOString(),
      blockExpiresAt: "invalid-corrupt-data",
    });
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
  });

  it("UT-03: Paridade com C-45 (suspended + ambos inválidos -> suspended)", () => {
    const res = resolveAccountStatus({
      status: "suspended",
      suspendedUntil: "invalid-1",
      blockExpiresAt: "invalid-2",
    });
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
  });

  it("UT-04: Paridade com C-46 (active + blockExpiresAt futuro -> suspended/bloqueado)", () => {
    const res = resolveAccountStatus({
      status: "active",
      blockExpiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
  });

  it("UT-05: Paridade com C-47 (active + suspendedUntil futuro -> suspended/bloqueado)", () => {
    const res = resolveAccountStatus({
      status: "active",
      suspendedUntil: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
  });

  it("UT-06: Paridade com C-37 (suspended + ambos expirados -> active/liberado)", () => {
    const res = resolveAccountStatus({
      status: "suspended",
      blockExpiresAt: new Date(Date.now() - 86400000).toISOString(),
      suspendedUntil: new Date(Date.now() - 3600000).toISOString(),
    });
    expect(res.status).toBe("active");
    expect(res.isExpiredSuspension).toBe(true);
    expect(res.suspendedUntil).toBeUndefined();
  });

  it("UT-07: Paridade com C-40 (banned + ambos expirados -> banned)", () => {
    const res = resolveAccountStatus({
      status: "banned",
      blockExpiresAt: new Date(Date.now() - 86400000).toISOString(),
      suspendedUntil: new Date(Date.now() - 3600000).toISOString(),
    });
    expect(res.status).toBe("banned");
    expect(res.isExpiredSuspension).toBe(false);
  });

  it("UT-08: Paridade com C-41 (suspended sem prazos -> suspended)", () => {
    const res = resolveAccountStatus({
      status: "suspended",
    });
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
  });

  it("UT-09: Paridade com C-42 (active sem prazos -> active)", () => {
    const res = resolveAccountStatus({
      status: "active",
    });
    expect(res.status).toBe("active");
    expect(res.isExpiredSuspension).toBe(false);
  });

  it("UT-10: Paridade com C-48 (suspended + blockExpiresAt expirado + suspendedUntil: null -> suspended)", () => {
    const res = resolveAccountStatus({
      status: "suspended",
      blockExpiresAt: new Date(Date.now() - 86400000).toISOString(),
      suspendedUntil: null,
    });
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
  });

  it("UT-11: Paridade com C-49 (suspended + blockExpiresAt expirado + suspendedUntil: '' -> suspended)", () => {
    const res = resolveAccountStatus({
      status: "suspended",
      blockExpiresAt: new Date(Date.now() - 86400000).toISOString(),
      suspendedUntil: "",
    });
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
  });

  it("UT-12: Paridade com C-50 (suspended + suspendedUntil expirado + blockExpiresAt: null -> suspended)", () => {
    const res = resolveAccountStatus({
      status: "suspended",
      suspendedUntil: new Date(Date.now() - 86400000).toISOString(),
      blockExpiresAt: null,
    });
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
  });

  it("UT-13: Paridade com C-51 (suspended + suspendedUntil expirado + blockExpiresAt: '   ' -> suspended)", () => {
    const res = resolveAccountStatus({
      status: "suspended",
      suspendedUntil: new Date(Date.now() - 86400000).toISOString(),
      blockExpiresAt: "   ",
    });
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
  });

  it("UT-14: evaluateDeadlineField para campo efetivamente ausente (propriedade não existe no objeto)", () => {
    const user = { id: "u1", status: "active" as const };
    const evalResult = evaluateDeadlineField(user, "suspendedUntil");
    expect(evalResult.isPresent).toBe(false);
    expect(evalResult.isValid).toBe(false);
    expect(evalResult.isInvalid).toBe(false);
    expect(evalResult.isActive).toBe(false);
    expect(evalResult.isExpired).toBe(false);
  });

  it("UT-15: evaluateDeadlineField para campo presente com undefined explícito (semântica Firestore)", () => {
    const user = { id: "u1", status: "active" as const, suspendedUntil: undefined };
    const evalResult = evaluateDeadlineField(user, "suspendedUntil");
    expect(evalResult.isPresent).toBe(false);
    expect(evalResult.isValid).toBe(false);
    expect(evalResult.isInvalid).toBe(false);
  });

  it("UT-16: evaluateDeadlineField para campo presente com null (null_type no Firestore)", () => {
    const user = { id: "u1", status: "suspended" as const, suspendedUntil: null };
    const evalResult = evaluateDeadlineField(user, "suspendedUntil");
    expect(evalResult.isPresent).toBe(true);
    expect(evalResult.isValid).toBe(false);
    expect(evalResult.isInvalid).toBe(true);
  });

  it("UT-17: evaluateDeadlineField para campo presente com string vazia ou espaços", () => {
    const user = { id: "u1", status: "suspended" as const, suspendedUntil: "   " };
    const evalResult = evaluateDeadlineField(user, "suspendedUntil");
    expect(evalResult.isPresent).toBe(true);
    expect(evalResult.isValid).toBe(false);
    expect(evalResult.isInvalid).toBe(true);
  });

  it("UT-18: evaluateDeadlineField para campo presente com número (int/float não é timestamp)", () => {
    const user = { id: "u1", status: "suspended" as const, suspendedUntil: 1729000000000 as any };
    const evalResult = evaluateDeadlineField(user, "suspendedUntil");
    expect(evalResult.isPresent).toBe(true);
    expect(evalResult.isValid).toBe(false);
    expect(evalResult.isInvalid).toBe(true);
  });

  it("UT-19: evaluateDeadlineField para campo com Timestamp nativo expirado", () => {
    const pastTimestamp = Timestamp.fromDate(new Date(Date.now() - 86400000));
    const user = { id: "u1", status: "suspended" as const, suspendedUntil: pastTimestamp };
    const evalResult = evaluateDeadlineField(user, "suspendedUntil");
    expect(evalResult.isPresent).toBe(true);
    expect(evalResult.isValid).toBe(true);
    expect(evalResult.isInvalid).toBe(false);
    expect(evalResult.isExpired).toBe(true);
    expect(evalResult.isActive).toBe(false);
  });

  it("UT-20: evaluateDeadlineField para campo com Timestamp nativo futuro", () => {
    const futureTimestamp = Timestamp.fromDate(new Date(Date.now() + 86400000));
    const user = { id: "u1", status: "suspended" as const, suspendedUntil: futureTimestamp };
    const evalResult = evaluateDeadlineField(user, "suspendedUntil");
    expect(evalResult.isPresent).toBe(true);
    expect(evalResult.isValid).toBe(true);
    expect(evalResult.isInvalid).toBe(false);
    expect(evalResult.isActive).toBe(true);
    expect(evalResult.isExpired).toBe(false);
  });

  it("UT-21: usuário sem propriedade 'status' (não presume active, retorna suspended e isUserAccountActive === false)", () => {
    const user = { id: "u-no-status", role: "ALUNO" as const };
    const res = resolveAccountStatus(user);
    expect(res.status).not.toBe("active");
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
    expect(isUserAccountActive(user)).toBe(false);
    expect(isAccountBlocked(user)).toBe(true);
  });

  it("UT-21b: usuário nulo ou indefinido (não presume active, retorna suspended e isUserAccountActive === false)", () => {
    const resNull = resolveAccountStatus(null);
    expect(resNull.status).toBe("suspended");
    expect(isUserAccountActive(null)).toBe(false);
    expect(isAccountBlocked(null)).toBe(true);

    const resUndef = resolveAccountStatus(undefined);
    expect(resUndef.status).toBe("suspended");
    expect(isUserAccountActive(undefined)).toBe(false);
    expect(isAccountBlocked(undefined)).toBe(true);
  });

  it("UT-22: usuário com 'status: undefined' (não presume active, retorna suspended e isUserAccountActive === false)", () => {
    const user = { id: "u-undef-status", role: "ALUNO" as const, status: undefined };
    const res = resolveAccountStatus(user);
    expect(res.status).not.toBe("active");
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
    expect(isUserAccountActive(user)).toBe(false);
    expect(isAccountBlocked(user)).toBe(true);
  });

  it("UT-23: usuário com 'status: null' (não presume active, retorna suspended e isUserAccountActive === false)", () => {
    const user = { id: "u-null-status", role: "ALUNO" as const, status: null as any };
    const res = resolveAccountStatus(user);
    expect(res.status).not.toBe("active");
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
    expect(isUserAccountActive(user)).toBe(false);
    expect(isAccountBlocked(user)).toBe(true);
  });

  it("UT-24: usuário com 'status: \"\"' (não presume active, retorna suspended e isUserAccountActive === false)", () => {
    const user = { id: "u-empty-status", role: "ALUNO" as const, status: "" as any };
    const res = resolveAccountStatus(user);
    expect(res.status).not.toBe("active");
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
    expect(isUserAccountActive(user)).toBe(false);
    expect(isAccountBlocked(user)).toBe(true);
  });

  it("UT-25: usuário com 'status' contendo apenas espaços (não presume active, retorna suspended e isUserAccountActive === false)", () => {
    const user = { id: "u-spaces-status", role: "ALUNO" as const, status: "   " as any };
    const res = resolveAccountStatus(user);
    expect(res.status).not.toBe("active");
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
    expect(isUserAccountActive(user)).toBe(false);
    expect(isAccountBlocked(user)).toBe(true);
  });

  it("UT-26: usuário com status desconhecido (não presume active, retorna suspended e isUserAccountActive === false)", () => {
    const user = { id: "u-unknown-status", role: "ALUNO" as const, status: "PENDING_AUDIT" as any };
    const res = resolveAccountStatus(user);
    expect(res.status).not.toBe("active");
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
    expect(isUserAccountActive(user)).toBe(false);
    expect(isAccountBlocked(user)).toBe(true);
  });

  it("UT-27: usuário com 'status: \"active\"' continua ativo (sem bloqueios temporais)", () => {
    const user = { id: "u-active", role: "ALUNO" as const, status: "active" as const };
    const res = resolveAccountStatus(user);
    expect(res.status).toBe("active");
    expect(res.isExpiredSuspension).toBe(false);
    expect(isUserAccountActive(user)).toBe(true);
    expect(isAccountBlocked(user)).toBe(false);
  });

  it("UT-28: usuário com 'status: \"suspended\"' continua sujeito à lógica temporal", () => {
    // 28.1 - Prazo futuro: permanece suspenso
    const userFuturo = {
      id: "u-susp-future",
      role: "ALUNO" as const,
      status: "suspended" as const,
      suspendedUntil: new Date(Date.now() + 86400000).toISOString(),
    };
    const resFuturo = resolveAccountStatus(userFuturo);
    expect(resFuturo.status).toBe("suspended");
    expect(resFuturo.isExpiredSuspension).toBe(false);
    expect(isUserAccountActive(userFuturo)).toBe(false);
    expect(isAccountBlocked(userFuturo)).toBe(true);

    // 28.2 - Prazo expirado válido: auto-liberação para active
    const userExpirado = {
      id: "u-susp-past",
      role: "ALUNO" as const,
      status: "suspended" as const,
      suspendedUntil: new Date(Date.now() - 86400000).toISOString(),
    };
    const resExpirado = resolveAccountStatus(userExpirado);
    expect(resExpirado.status).toBe("active");
    expect(resExpirado.isExpiredSuspension).toBe(true);
    expect(isUserAccountActive(userExpirado)).toBe(true);
    expect(isAccountBlocked(userExpirado)).toBe(false);
  });

  it("UT-29: usuário com 'status: \"banned\"' continua bloqueado permanentemente", () => {
    const user = {
      id: "u-banned",
      role: "ALUNO" as const,
      status: "banned" as const,
      statusReason: "Infração grave às normas institucionais",
      // Mesmo com data expirada, banimento permanente se mantém
      suspendedUntil: new Date(Date.now() - 86400000).toISOString(),
    };
    const res = resolveAccountStatus(user);
    expect(res.status).toBe("banned");
    expect(res.isExpiredSuspension).toBe(false);
    expect(res.statusReason).toBe("Infração grave às normas institucionais");
    expect(isUserAccountActive(user)).toBe(false);
    expect(isAccountBlocked(user)).toBe(true);
  });
});
