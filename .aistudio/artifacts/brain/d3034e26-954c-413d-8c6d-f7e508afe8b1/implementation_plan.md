# LOCALIZA+ v1.9.44 — Plano de Implementação Revisado: Diagnóstico do Firestore, Resiliência de Sincronização e Feedback de Autorização

## Resumo Executivo
Este plano estabelece a estratégia detalhada de implementação para corrigir a mensagem de feedback no cadastro de objetos em `RegisterItemView.tsx`, aprimorar o método `retryUploadTask` em `AppContext.tsx`, garantir a preservação do item original e de seu ID no IndexedDB sem duplicações, e refinar a suíte de testes unitários. A implementação respeita integralmente todas as restrições: **zero alteração de regras no Firestore**, **zero remoção de dados reais**, **zero alteração de configurações de produção** e **zero deploy**.

---

## Decisões Críticas e Diretrizes de Auditoria

> [!IMPORTANT]
> **Investigação Forense e Segurança em Produção:**
> 1. A hipótese de recusa por `request.auth.token.email_verified == true` nas regras do Firestore é tratada como uma **possibilidade de investigação**, e NÃO como causa confirmada sem logs e evidências reais dos claims JWT e do perfil do usuário.
> 2. O botão **"Tentar Novamente"** (`retryUploadTask`) diferencia expressamente **autenticação válida** (sessão ativa e token renovado) de **autorização para gravar** (atendimento às regras do Firestore).
> 3. Em caso de falha por autorização (`permission-denied`), o item original permanece no IndexedDB com seu ID original intacto, sem remoção prematura e sem criação de itens duplicados.
> 4. Tentativas automáticas em segundo plano são desativadas para erros permanentes (`isBackgroundSyncRegistered: false`). O reenvio só é executado via acionamento manual do usuário após revalidação.
> 5. Todas as leituras de propriedades de feedback (como `res.error` e `res.classifiedMessage`) possuem verificações defensivas de tipo (`typeof string` e encadeamento opcional `?.`).

---

## 1. Visão Geral e Conceito Central

- **Problema a Resolver**: Quando ocorre o erro `permission-denied` durante o cadastro de um objeto no Firestore, a interface exibe a mensagem genérica e incorreta "Falha de conexão". Além disso, o fluxo de reentrativa ("Tentar Novamente") precisa revalidar explicitamente a sessão de autenticação do Firebase Auth e tratar a resposta sem duplicar registros ou perder o item salvo localmente.
- **Solução Entregue**:
  - Classificação precisa do erro de autorização no frontend com mensagem informativa e neutra.
  - Revalidação e renovação forçada do token de autenticação (`getIdTokenResult(true)`) no acionamento de `retryUploadTask`.
  - Tratamento diferenciado quando a sessão é autêntica mas o servidor recusa a permissão.
  - Preservação idempotente do item e da fila no IndexedDB sem duplicações ou deleções indesejadas.
  - Bateria de testes automatizados com simulação precisa dos erros do Firebase.

---

## 2. Experiência do Usuário e Design Visual

- **Feedback no Cadastro (`RegisterItemView.step === 5`)**:
  - **Sucesso Confirmado (`CONFIRMED`)**: Toast verde de confirmação e tela de sucesso com QR Code.
  - **Erro de Autorização / Permissão (`AUTHORIZATION` / `ERROR`)**: Toast de aviso amarelo ou erro com texto classificado ("Sincronização recusada por falta de autorização/permissão no Firestore. O item permanece preservado no dispositivo.") e tela de resultado estruturada, mantendo os botões "Tentar Novamente" e "Voltar ao Início".
  - **Pendente de Conexão (`PENDING_SYNC`)**: Toast informativo informando que o objeto foi salvo no dispositivo para envio ao reconectar.
- **Fluxo do Botão "Tentar Novamente"**:
  - Ao clicar em "Tentar Novamente", exibe indicador de progresso ("Revalidando credenciais e tentando sincronizar...").
  - Caso a sessão esteja expirada ou nula, solicita login institucional.
  - Caso a sessão seja válida mas o Firestore recuse novamente por permissão, mantém o item preservado com mensagem clara, sem gerar duplicata.

---

## 3. Decisões do Produto e Trade-Offs Técnicos

- **Decisão 1: Preservação Idempotente no IndexedDB**:
  - *Abordagem*: O item é salvo sob a chave e ID únicos originados na criação (`item.id`). O `retryUploadTask` atualiza o estado do registro existente na fila (`updateSyncQueueEntry`) para status `"PENDENTE"` sem deletar ou re-criar a entrada na fila.
  - *Motivo*: Evita lixo eletrônico, registros duplicados no banco local ou perda do histórico do usuário em falhas repetidas.
- **Decisão 2: Bloqueio de Background Sync em Erros Permanentes**:
  - *Abordagem*: Quando a classificação do erro é `PERMANENT` ou `AUTHORIZATION`, o sinalizador `isBackgroundSyncRegistered` é configurado como `false`.
  - *Motivo*: Evita consumo desnecessário de bateria e sobrecarga de chamadas rejeitadas à API do Firebase enquanto o usuário não resolver as permissões de sua conta.

---

## 4. Arquitetura Técnica e Mapeamento de Arquivos/Trechos Exatos

### Diagrama de Fluxo e Componentes

```
┌────────────────────────────────────────────────────────────────────────┐
│                        RegisterItemView (Passo 5)                      │
│  - Recebe o resultado do addItem() ou retryUploadTask()                 │
│  - Checa res?.error e res?.classifiedMessage de forma defensiva         │
│  - Exibe Toast e Alerta categorizados sem mascarar como "Rede"         │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          AppContext (addItem)                          │
│  - Tenta setDoc(doc(db, "items", item.id), payload)                    │
│  - Captura erro do Firebase e aciona classifySyncError(error)          │
│  - Grava no IndexedDB via queueOfflineItemRegistration()               │
│  - Retorna { newItem, persistenceStatus: "ERROR", error, ... }          │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       retryUploadTask(taskId)                          │
│  1. Revalida auth.currentUser?.getIdTokenResult(true)                  │
│  2. Se sem sessão -> Avisa "Faça login com sua conta"                  │
│  3. Se autenticado -> Atualiza entrada existente na fila (mesmo ID)    │
│  4. Aciona syncOfflineQueue() de forma idempotente                     │
└────────────────────────────────────────────────────────────────────────┘
```

### Arquivos e Trechos Exatos a Serem Modificados

#### 1. `src/components/RegisterItemView.tsx`
- **Linhas 848-876 (`handleSubmit`)**:
  - *Trecho Atual*:
    ```tsx
    } else if (res.persistenceStatus === "ERROR") {
      addToast(
        `Atenção: Falha de conexão. O objeto "${res.newItem.title}" foi guardado no dispositivo.`,
        "warning"
      );
      setRegistrationFeedback({
        status: "ERROR",
        item: res.newItem,
      });
    }
    ```
  - *Alteração Planejada*:
    Inscrever verificação defensiva de propriedades `res?.error` e `res?.classifiedMessage` (verificando se são do tipo `string`). Se houver mensagem classificada de autorização ou tamanho, exibi-la. Se for erro de rede ou transitório, exibir mensagem de conexão. Nunca utilizar a mensagem de conexão para falhas de autorização (`permission-denied`).

#### 2. `src/context/AppContext.tsx`
- **Linhas 468-512 (`retryUploadTask`)**:
  - *Trecho Atual*: Atualiza a fila e aciona `syncOfflineQueue()` diretamente sem revalidar autenticação nem diferenciar autorização.
  - *Alteração Planejada*:
    ```typescript
    const retryUploadTask = async (taskId: string) => {
      // 1. Revalidação da sessão do Firebase Auth
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        addToast("Sessão não autenticada. Por favor, faça login com sua conta institucional para tentar novamente.", "warning");
        return;
      }
      try {
        await firebaseUser.getIdTokenResult(true);
      } catch (authErr) {
        console.warn("[Retry Upload Auth Revalidation Warning]", authErr);
      }

      // 2. Localização da entrada existente na fila sem remoção nem duplicação
      const task = activeUploadTasks.find((t) => t.id === taskId);
      const resolvedItemId = task?.itemId || taskId.replace(/^(task|sync-task|upload-task)-/, "");
      const canonicalTaskId = getUploadTaskId(resolvedItemId);

      const queue = await getPendingSyncQueue();
      const entry = queue.find(
        (e) => (e.itemId && e.itemId === resolvedItemId) || (e.payload && e.payload.id === resolvedItemId) || e.id === taskId
      );

      if (entry) {
        // Bloqueia se for erro permanente de tamanho/estrutura
        const isSizeOrFieldLimitExceeded =
          typeof entry.error === "string" &&
          (entry.error.includes("PAYLOAD_SIZE") || entry.error.includes("FIELD_LIMIT"));

        if (isSizeOrFieldLimitExceeded) {
          addToast("Este item possui dados/imagens que excedem os limites permitidos. O cadastro precisa ser cancelado ou ajustado.", "warning");
          return;
        }

        // Reseta status para PENDENTE preservando o ID do item e da fila
        await updateSyncQueueEntry(entry.id, {
          status: "PENDENTE",
          error: undefined,
          errorType: undefined,
        });
      }

      updateUploadTask(canonicalTaskId, {
        status: "UPLOADING",
        progress: 30,
        statusMessage: "Revalidando credenciais e tentando enviar ao Firestore...",
        error: undefined,
      });

      await syncOfflineQueue();
    };
    ```

#### 3. `src/lib/registerObjectFlow.test.ts`
- **Adição de Suíte de Testes para Erros do Firebase e Preservação**:
  - Adicionar testes em Vitest que simulam rejeições do `setDoc` com `permission-denied`, `unauthenticated`, `unavailable` e `payload-too-large`.
  - Assertar que:
    1. O item mantido no IndexedDB possui o exato mesmo `id` gerado originalmente.
    2. Nenhuma duplicata foi criada no estado de `items` ou na fila.
    3. `classifySyncError` retorna a categoria esperada (`AUTHORIZATION`, `TEMPORARY`, `PERMANENT`).
    4. O feedback de `permission-denied` não menciona "Falha de conexão".

---

## 5. Plano de Execução e Garantias de Segurança

1. **Compilação e Tipagem (`npm run lint`)**: Garantir que o comando `tsc --noEmit` finalize com zero erros após as alterações.
2. **Execução de Testes Automatizados (`npm test`)**: Executar `vitest run` e assegurar que todas as suítes (incluindo as novas validações) passem com 100% de aprovação.
3. **Respeito Absoluto às Restrições**:
   - Zero modificação no arquivo `firestore.rules`.
   - Zero exclusão ou modificação de dados no banco do Firestore ou na fila do IndexedDB.
   - Zero alteração em variáveis de ambiente de produção.
   - Zero deploy executado.
