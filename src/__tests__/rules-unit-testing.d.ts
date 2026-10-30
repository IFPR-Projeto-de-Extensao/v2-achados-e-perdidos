/**
 * Definições de tipos locais para @firebase/rules-unit-testing.
 * Permite validação rigorosa de tipagem (tsc --noEmit) sem necessidade de instalação
 * prévia do pacote durante as etapas de auditoria e revisão estática.
 */

declare module "@firebase/rules-unit-testing" {
  import type { Firestore } from "firebase/firestore";

  export interface TestEnvironmentConfig {
    projectId?: string;
    firestore?: {
      host?: string;
      port?: number;
      rules?: string;
    };
  }

  export interface RulesTestContext {
    firestore(): Firestore;
  }

  export interface RulesTestEnvironment {
    authenticatedContext(uid: string, tokenOptions?: Record<string, any>): RulesTestContext;
    unauthenticatedContext(): RulesTestContext;
    withSecurityRulesDisabled(callback: (context: RulesTestContext) => Promise<void>): Promise<void>;
    cleanup(): Promise<void>;
    clearFirestore(): Promise<void>;
  }

  export function initializeTestEnvironment(config: TestEnvironmentConfig): Promise<RulesTestEnvironment>;
  export function assertSucceeds<T>(pr: Promise<T>): Promise<T>;
  export function assertFails<T>(pr: Promise<T>): Promise<any>;
}
