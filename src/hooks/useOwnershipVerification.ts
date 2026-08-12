import { usePossessionVerification, PossessionVerificationState } from "./usePossessionVerification";
import { LostFoundItem } from "../types";

export type OwnershipVerificationState = PossessionVerificationState;

export function useOwnershipVerification(item: LostFoundItem): OwnershipVerificationState {
  return usePossessionVerification(item);
}
