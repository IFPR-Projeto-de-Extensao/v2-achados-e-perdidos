import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  resolveAccountStatus,
  evaluateDeadlineField,
  isUserAccountActive,
  isAccountBlocked,
  calculateSuspensionDeadline,
  formatAccountStatusDetails,
  formatLocalDateTimeInput,
  parseLocalDateTimeInput,
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

  it("UT-06: Paridade com C-37 (suspended + ambos Timestamps expirados -> active/liberado)", () => {
    const res = resolveAccountStatus({
      status: "suspended",
      blockExpiresAt: Timestamp.fromDate(new Date(Date.now() - 86400000)),
      suspendedUntil: Timestamp.fromDate(new Date(Date.now() - 3600000)),
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

  it("UT-21: Paridade com C-26 — usuário sem propriedade 'status' mantém compatibilidade legada como active e sinaliza inconsistência", () => {
    const user = { id: "u-no-status", role: "ALUNO" as const };
    const res = resolveAccountStatus(user);
    expect(res.status).toBe("active");
    expect(res.hasMissingStatusField).toBe(true);
    expect(res.hasLegacyInconsistency).toBe(true);
    expect(isUserAccountActive(user)).toBe(true);
    expect(isAccountBlocked(user)).toBe(false);
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

  it("UT-22: Paridade com C-26 — usuário com 'status: undefined' (chave ausente no Firestore) mantém compatibilidade legada", () => {
    const user = { id: "u-undef-status", role: "ALUNO" as const, status: undefined };
    const res = resolveAccountStatus(user);
    expect(res.status).toBe("active");
    expect(res.hasMissingStatusField).toBe(true);
    expect(res.hasLegacyInconsistency).toBe(true);
    expect(isUserAccountActive(user)).toBe(true);
    expect(isAccountBlocked(user)).toBe(false);
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

  it("UT-28: usuário com 'status: \"suspended\"' continua sujeito à lógica temporal (Timestamp nativo)", () => {
    // 28.1 - Prazo futuro: permanece suspenso
    const userFuturo = {
      id: "u-susp-future",
      role: "ALUNO" as const,
      status: "suspended" as const,
      suspendedUntil: Timestamp.fromDate(new Date(Date.now() + 86400000)),
    };
    const resFuturo = resolveAccountStatus(userFuturo);
    expect(resFuturo.status).toBe("suspended");
    expect(resFuturo.isExpiredSuspension).toBe(false);
    expect(isUserAccountActive(userFuturo)).toBe(false);
    expect(isAccountBlocked(userFuturo)).toBe(true);

    // 28.2 - Prazo expirado válido (Timestamp): auto-liberação para active
    const userExpirado = {
      id: "u-susp-past",
      role: "ALUNO" as const,
      status: "suspended" as const,
      suspendedUntil: Timestamp.fromDate(new Date(Date.now() - 86400000)),
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

describe("LOCALIZA+ v1.10.13 — Etapa 10: Compatibilidade Estreita Timestamp/Rules/Frontend", () => {
  it("bloqueia status='active' com qualquer tipo incompatível em blockExpiresAt ou suspendedUntil (ISO expirada, ISO futura, null, '', number, boolean, array, object)", () => {
    const pastIso = new Date(Date.now() - 86400000).toISOString();
    const futureIso = new Date(Date.now() + 86400000).toISOString();

    const incompatibleProfiles: Array<{ label: string; user: any; expectedKind: string }> = [
      { label: "blockExpiresAt ISO expirada", user: { status: "active", blockExpiresAt: pastIso }, expectedKind: "iso_string" },
      { label: "blockExpiresAt ISO futura", user: { status: "active", blockExpiresAt: futureIso }, expectedKind: "iso_string" },
      { label: "suspendedUntil ISO expirada", user: { status: "active", suspendedUntil: pastIso }, expectedKind: "iso_string" },
      { label: "suspendedUntil null", user: { status: "active", suspendedUntil: null }, expectedKind: "null" },
      { label: "suspendedUntil string vazia", user: { status: "active", suspendedUntil: "" }, expectedKind: "empty_string" },
      { label: "blockExpiresAt number", user: { status: "active", blockExpiresAt: Date.now() - 1000 }, expectedKind: "number" },
      { label: "blockExpiresAt boolean", user: { status: "active", blockExpiresAt: true }, expectedKind: "boolean" },
      { label: "blockExpiresAt array", user: { status: "active", blockExpiresAt: ["2026-01-01"] }, expectedKind: "array" },
      { label: "blockExpiresAt object/map não Timestamp", user: { status: "active", blockExpiresAt: { foo: "bar" } }, expectedKind: "object" },
    ];

    for (const c of incompatibleProfiles) {
      const res = resolveAccountStatus(c.user);
      expect(res.status, c.label).toBe("suspended");
      expect(res.hasLegacyInconsistency, c.label).toBe(true);
      expect(isUserAccountActive(c.user), c.label).toBe(false);
      expect(isAccountBlocked(c.user), c.label).toBe(true);
      const relevantEval = "blockExpiresAt" in c.user ? res.blockExpiresAtEval : res.suspendedUntilEval;
      expect(relevantEval.isInvalid, c.label).toBe(true);
      expect(relevantEval.valueKind, c.label).toBe(c.expectedKind);
      expect(formatAccountStatusDetails(c.user).label, c.label).toBe("Bloqueado (Inconsistência)");
    }
  });

  it("bloqueia status='active' quando active=false e sinaliza isDeactivated", () => {
    const user = { id: "u-deact", status: "active" as const, active: false };
    const res = resolveAccountStatus(user);
    expect(res.status).toBe("suspended");
    expect(res.isDeactivated).toBe(true);
    expect(res.hasLegacyInconsistency).toBe(true);
    expect(isUserAccountActive(user)).toBe(false);
    expect(formatAccountStatusDetails(user).label).toBe("Inativo / Desativado");
  });

  it("avalia corretamente active=true + status='active' com blockExpiresAt Timestamp futuro vs expirado", () => {
    const blocked = {
      status: "active" as const,
      active: true,
      blockExpiresAt: Timestamp.fromDate(new Date(Date.now() + 3600_000)),
    };
    expect(resolveAccountStatus(blocked).status).toBe("suspended");
    expect(isUserAccountActive(blocked)).toBe(false);

    const released = {
      status: "active" as const,
      active: true,
      blockExpiresAt: Timestamp.fromDate(new Date(Date.now() - 3600_000)),
    };
    expect(resolveAccountStatus(released).status).toBe("active");
    expect(isUserAccountActive(released)).toBe(true);
  });

  it("NÃO libera suspensão indefinida (sem suspendedUntil) quando há blockExpiresAt Timestamp expirado residual", () => {
    const indefiniteWithResidual = {
      status: "suspended" as const,
      active: true,
      blockExpiresAt: Timestamp.fromDate(new Date(Date.now() - 86400_000)),
    };
    const res = resolveAccountStatus(indefiniteWithResidual);
    expect(res.status).toBe("suspended");
    expect(res.isExpiredSuspension).toBe(false);
    expect(res.hasLegacyInconsistency).toBe(true);
    expect(isAccountBlocked(indefiniteWithResidual)).toBe(true);
  });

  it("libera suspensão temporária apenas com suspendedUntil Timestamp expirado quando blockExpiresAt está ausente ou Timestamp expirado", () => {
    const pastTs = Timestamp.fromDate(new Date(Date.now() - 3600_000));
    const futureTs = Timestamp.fromDate(new Date(Date.now() + 3600_000));

    // Sem blockExpiresAt
    expect(resolveAccountStatus({ status: "suspended", suspendedUntil: pastTs }).status).toBe("active");
    // Com blockExpiresAt Timestamp expirado
    expect(resolveAccountStatus({ status: "suspended", suspendedUntil: pastTs, blockExpiresAt: pastTs }).status).toBe("active");
    // Com blockExpiresAt Timestamp futuro -> continua suspenso
    expect(resolveAccountStatus({ status: "suspended", suspendedUntil: pastTs, blockExpiresAt: futureTs }).status).toBe("suspended");
    // Com blockExpiresAt ISO string -> bloqueado por inconsistência
    expect(resolveAccountStatus({ status: "suspended", suspendedUntil: pastTs, blockExpiresAt: new Date(Date.now() - 1000).toISOString() }).status).toBe("suspended");
  });

  it("calculateSuspensionDeadline falha explicitamente em entradas inválidas e calcula prazos válidos", () => {
    expect(calculateSuspensionDeadline("indefinite")).toBeUndefined();
    expect(() => calculateSuspensionDeadline("preset_inexistente")).toThrow();
    expect(() => calculateSuspensionDeadline("custom", "")).toThrow();
    expect(() => calculateSuspensionDeadline("custom", "data-invalida")).toThrow();
    expect(() => calculateSuspensionDeadline("custom", "2020-01-01T10:00")).toThrow();

    const presetIso = calculateSuspensionDeadline("7_days");
    expect(typeof presetIso).toBe("string");
    expect(Date.parse(presetIso!)).toBeGreaterThan(Date.now());

    const futureLocal = formatLocalDateTimeInput(new Date(Date.now() + 48 * 3600_000));
    const customIso = calculateSuspensionDeadline("custom", futureLocal);
    expect(typeof customIso).toBe("string");
    expect(Date.parse(customIso!)).toBeGreaterThan(Date.now());
  });

  it("formatLocalDateTimeInput e parseLocalDateTimeInput preservam data/hora local sem deslocamento UTC", () => {
    const localSample = new Date(2028, 4, 15, 22, 30, 0, 0);
    const formatted = formatLocalDateTimeInput(localSample);
    expect(formatted).toBe("2028-05-15T22:30");

    const reparsed = parseLocalDateTimeInput(formatted);
    expect(reparsed).not.toBeNull();
    expect(reparsed!.getFullYear()).toBe(2028);
    expect(reparsed!.getMonth()).toBe(4);
    expect(reparsed!.getDate()).toBe(15);
    expect(reparsed!.getHours()).toBe(22);
    expect(reparsed!.getMinutes()).toBe(30);

    // Rejeita calendário impossível (30 de fevereiro)
    expect(parseLocalDateTimeInput("2028-02-30T10:00")).toBeNull();
  });
});

