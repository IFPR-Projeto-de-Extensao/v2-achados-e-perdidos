/**
 * Classes de erro tipadas para o ciclo de vida e controle transacional de Claims.
 * Permite diferenciar com precisão condições de duplicidade, indisponibilidade de objetos
 * e estados não passíveis de reenvio, prevenindo tentativas indevidas de sobrescrita no Firestore.
 */

export class DuplicateClaimError extends Error {
  readonly status: string;

  constructor(status: string, message: string) {
    super(message);
    this.name = "DuplicateClaimError";
    this.status = status;
    Object.setPrototypeOf(this, DuplicateClaimError.prototype);
  }
}

export class ItemUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ItemUnavailableError";
    Object.setPrototypeOf(this, ItemUnavailableError.prototype);
  }
}

export class ClaimStateNotResubmittableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaimStateNotResubmittableError";
    Object.setPrototypeOf(this, ClaimStateNotResubmittableError.prototype);
  }
}
