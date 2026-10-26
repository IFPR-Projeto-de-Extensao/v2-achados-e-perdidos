import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { ItemComment } from "../types";

describe("LOCALIZA+ v1.10.4 — Auditoria e Testes do Listener da Coleção 'comments'", () => {
  describe("1. Inspeção de Código Estático em AppContext.tsx e firestore.rules", () => {
    const appContextPath = path.resolve(__dirname, "../context/AppContext.tsx");
    const appContextCode = fs.readFileSync(appContextPath, "utf-8");

    const rulesPath = path.resolve(__dirname, "../../firestore.rules");
    const rulesCode = fs.readFileSync(rulesPath, "utf-8");

    it("deve conter a cláusula de guarda `if (!firebaseUser)` antes de registrar o listener de comments", () => {
      // Localiza o bloco de sincronização de comentários
      const commentsEffectMatch = appContextCode.match(
        /\/\/\s*Sync Comments from Firestore[\s\S]*?useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[(.*?)\]\);/
      );
      expect(commentsEffectMatch).not.toBeNull();

      const effectBody = commentsEffectMatch![1];
      const dependencies = commentsEffectMatch![2];

      // Verifica guarda defensiva e limpeza de estado
      expect(effectBody).toContain("if (!firebaseUser)");
      expect(effectBody).toContain("setComments([])");
      expect(effectBody).toContain("return;");

      // Verifica registro do snapshot e desinscrição na limpeza
      expect(effectBody).toContain('collection(db, "comments")');
      expect(effectBody).toContain("return () => unsubscribe();");

      // Verifica array de dependências reativo a firebaseUser (e não vazio [])
      expect(dependencies.trim()).toBe("firebaseUser");
    });

    it("regras de segurança em firestore.rules devem continuar exigindo estritamente isSignedIn()", () => {
      const commentsRuleMatch = rulesCode.match(/match\s*\/comments\/\{commentId\}\s*\{([\s\S]*?)\}/);
      expect(commentsRuleMatch).not.toBeNull();

      const ruleBody = commentsRuleMatch![1];
      expect(ruleBody).toContain("allow get: if isSignedIn();");
      expect(ruleBody).toContain("allow list: if isSignedIn();");
    });
  });

  describe("2. Ciclo de Vida do Listener de Comentários (Simulação Comportamental)", () => {
    // Harness reproduzindo exatamente a lógica implementada no useEffect de AppContext.tsx
    function createCommentsSyncHarness() {
      let currentComments: ItemComment[] = [];
      let activeListener: { unsubscribe: () => void } | null = null;
      let snapshotCallCount = 0;
      let unsubscribeCallCount = 0;
      let errorReported: { error: any; path: string } | null = null;

      // Mock onSnapshot
      const mockOnSnapshot = (
        collectionRef: any,
        onNext: (snapshot: any) => void,
        onError: (err: any) => void
      ) => {
        snapshotCallCount++;
        let isAlive = true;

        const unsubscribe = () => {
          if (isAlive) {
            isAlive = false;
            unsubscribeCallCount++;
            activeListener = null;
          }
        };

        const handle = {
          unsubscribe,
          triggerData: (items: ItemComment[]) => {
            if (isAlive) {
              onNext({
                empty: items.length === 0,
                docs: items.map((c) => ({ data: () => c })),
              });
            }
          },
          triggerError: (err: any) => {
            if (isAlive) {
              onError(err);
            }
          },
        };

        activeListener = handle;
        return unsubscribe;
      };

      // Mock handleFirestoreError
      const mockHandleFirestoreError = (err: any, op: string, path: string) => {
        errorReported = { error: err, path };
      };

      let cleanupPrevEffect: (() => void) | null = null;

      // Executa o efeito passando o firebaseUser atual
      const runEffect = (firebaseUser: { uid: string } | null) => {
        // 1. Executa a limpeza do efeito anterior se existir (comportamento do React)
        if (cleanupPrevEffect) {
          cleanupPrevEffect();
          cleanupPrevEffect = null;
        }

        // 2. Executa a lógica implementada no useEffect
        if (!firebaseUser) {
          currentComments = [];
          return;
        }

        const unsubscribe = mockOnSnapshot(
          { path: "comments" },
          (snapshot) => {
            if (snapshot.empty) {
              currentComments = [];
            } else {
              const loaded: ItemComment[] = snapshot.docs.map((d: any) => d.data());
              loaded.sort(
                (a, b) =>
                  (new Date(a.createdAt).getTime() || 0) -
                  (new Date(b.createdAt).getTime() || 0)
              );
              currentComments = loaded;
            }
          },
          (error) => {
            mockHandleFirestoreError(error, "get", "comments");
          }
        );

        cleanupPrevEffect = () => unsubscribe();
      };

      return {
        runEffect,
        getComments: () => currentComments,
        getActiveListener: () => activeListener,
        getSnapshotCount: () => snapshotCallCount,
        getUnsubscribeCount: () => unsubscribeCallCount,
        getErrorReported: () => errorReported,
      };
    }

    it("A. Usuário não autenticado: nenhum listener é iniciado e o estado permanece vazio", () => {
      const harness = createCommentsSyncHarness();

      // Executa efeito sem usuário
      harness.runEffect(null);

      expect(harness.getActiveListener()).toBeNull();
      expect(harness.getSnapshotCount()).toBe(0);
      expect(harness.getComments()).toEqual([]);
      expect(harness.getErrorReported()).toBeNull();
    });

    it("B. Login válido: listener é iniciado e comentários autorizados são carregados e ordenados", () => {
      const harness = createCommentsSyncHarness();

      // Usuário autentica
      harness.runEffect({ uid: "user-aluno-1" });

      expect(harness.getActiveListener()).not.toBeNull();
      expect(harness.getSnapshotCount()).toBe(1);

      // Simula chegada de comentários do Firestore
      const mockComments: ItemComment[] = [
        {
          id: "com-2",
          itemId: "item-1",
          userId: "user-2",
          userName: "Maria",
          userRole: "ALUNO",
          text: "Segundo comentário",
          createdAt: "2026-10-26T12:00:00Z",
        },
        {
          id: "com-1",
          itemId: "item-1",
          userId: "user-1",
          userName: "Carlos",
          userRole: "SERVIDOR",
          text: "Primeiro comentário",
          createdAt: "2026-10-26T10:00:00Z",
        },
      ];

      (harness.getActiveListener() as any).triggerData(mockComments);

      const loaded = harness.getComments();
      expect(loaded.length).toBe(2);
      // Deve estar ordenado cronologicamente (com-1 antes de com-2)
      expect(loaded[0].id).toBe("com-1");
      expect(loaded[1].id).toBe("com-2");
    });

    it("C. Logout: listener anterior é encerrado e estado de comentários é limpo", () => {
      const harness = createCommentsSyncHarness();

      // 1. Usuário logado
      harness.runEffect({ uid: "user-aluno-1" });
      expect(harness.getActiveListener()).not.toBeNull();

      // 2. Usuário faz logout (firebaseUser = null)
      harness.runEffect(null);

      expect(harness.getUnsubscribeCount()).toBe(1);
      expect(harness.getActiveListener()).toBeNull();
      expect(harness.getComments()).toEqual([]);
    });

    it("D. Troca de usuário: listener anterior é encerrado antes de iniciar novo listener", () => {
      const harness = createCommentsSyncHarness();

      // 1. Usuário A
      harness.runEffect({ uid: "user-A" });
      expect(harness.getSnapshotCount()).toBe(1);

      // 2. Usuário B conecta
      harness.runEffect({ uid: "user-B" });
      expect(harness.getUnsubscribeCount()).toBe(1); // Desinscreveu A
      expect(harness.getSnapshotCount()).toBe(2); // Inscreveu B
      expect(harness.getActiveListener()).not.toBeNull();
    });

    it("E. Erros reais do Firestore continuam sendo encaminhados para handleFirestoreError", () => {
      const harness = createCommentsSyncHarness();

      // Usuário autentica
      harness.runEffect({ uid: "user-aluno-1" });

      const fakeError = new Error("Simulated Firestore quota exceeded");
      (harness.getActiveListener() as any).triggerError(fakeError);

      const reported = harness.getErrorReported();
      expect(reported).not.toBeNull();
      expect(reported?.path).toBe("comments");
      expect(reported?.error.message).toBe("Simulated Firestore quota exceeded");
    });
  });
});
