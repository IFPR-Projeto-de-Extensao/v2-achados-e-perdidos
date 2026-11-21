# LOCALIZA+ v1.10.13 — COMPLEMENTAÇÃO FUNCIONAL DA ETAPA 30
## Diagnóstico de Causa Raiz e Correção Definitiva do Cadastro de Objetos

| Campo | Valor |
| :--- | :--- |
| **Sistema / Versão** | LOCALIZA+ v1.10.13 |
| **Etapa** | Complementação Funcional da Etapa 30 — Cadastro de Objetos e Fila Offline |
| **Data de Consolidação (UTC)** | `2026-11-20T15:57:00Z` |
| **Projeto Firebase Alvo (Documental)** | `gen-lang-client-0490390966` |
| **Banco Firestore Nomeado (Documental)** | `ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1` |
| **Coleções Envolvidas no Cadastro** | `/items`, `/item_history`, `/item_private` (condicional), `/users`, `/audit_logs`, `/activity_logs` |
| **Referência Forense Investigada** | Root Admin UID `hCG5mDgK1fRaTojULzlM7dXvb7n2` (`paulocauan39@gmail.com`) / Objeto `ifpr-MWMUBPTI-536` |
| **Referência `firestore.rules` (Preservada)** | SHA-256 `2f2a2ffc8c471d7fe97b5d1d2bb3c2a3ca27d39947be64449ad13a532c851f9e` (57.716 bytes) |
| **Candidato Isolado de Regras** | `scripts/audit/candidates/etapa30-complementacao/firestore.rules.candidate` (`06ad24a5...`) |
| **Classificação Formal** | **APROVADA LOCALMENTE COM BLOQUEIOS EXTERNOS** |
| **Publicação de Rules / Deploy / Escrita em Produção** | **NÃO EXECUTADOS NESTA ETAPA (PROIBIDO PELO ESCOPO)** |

> **Declaração de Escopo e Limites Reais:** Esta complementação foi executada integralmente em modo local, estático e sintético. Nenhuma conexão ao Firebase/Firestore de produção foi aberta, nenhuma regra foi publicada, nenhum deploy/commit/push foi executado, nenhum dado de produção foi lido ou alterado e a fila offline do navegador (incluindo o objeto de teste `ifpr-MWMUBPTI-536`) permanece 100% preservada. Além disso, o ambiente local não possui `java` instalado para executar o Cloud Firestore Emulator (`src/lib/firestoreRules.emulator.test.ts` permanece com 120 testes marcados como *skipped* por ausência de emulador). Os testes locais com espelho estático de regras (`LOCAL_STATIC_MIRROR_NOT_LIVE_FIREBASE`) são determinísticos e úteis para regressão, mas **NÃO** substituem a verificação real no banco nomeado em produção nem o Firestore Emulator oficial.

---

## 1. Diagnóstico de Causa Raiz (Contexto Forense `ifpr-MWMUBPTI-536`)

### 1.1. Evidência Forense de Entrada

O registro forense do bloqueio no cadastro de objetos apresentava exatamente a seguinte identidade autenticada e estado de perfil:

- **UID Root Admin:** `hCG5mDgK1fRaTojULzlM7dXvb7n2`
- **E-mail:** `paulocauan39@gmail.com`
- **Claims do Token:** `tokenEmailVerified=true`, `tokenRole=null` (ausência de Custom Claim `role` no token)
- **Documento `/users/{uid}`:** `userDocRole=ADMIN`, `userDocApprovalStatus=APROVADO`, `userDocStatus=active`, `userDocActive=null`
- **Payload enviado:** `registeredByRole=ADMIN`
- **Resultado observado em produção:** `permission-denied` tanto no cadastro online quanto na tentativa de sincronização da fila offline (`syncOfflineQueue`), mantendo o objeto de teste `ifpr-MWMUBPTI-536` preservado no IndexedDB.

### 1.2. Separação Estrutural das Causas Raiz (3 Camadas Independentes)

A auditoria ponta a ponta dos 16 passos do fluxo de cadastro separou com precisão **o que explica o `permission-denied` histórico do Root Admin em produção** versus **os defeitos reais descobertos nas regras locais e no código de frontend/sincronização**:

#### Camada A — Bloqueio Externo Primário: Divergência de Regras Publicadas no Banco Nomeado (Production Rules Drift)
1. Nas regras locais atuais (`firestore.rules`, SHA-256 `2f2a2ffc...`), a avaliação estática do Root Admin forense (`uid=hCG5mDgK1fRaTojULzlM7dXvb7n2`, `email=paulocauan39@gmail.com`, `email_verified=true`, `token.role=null`, `userDocActive=null`, `registeredByRole=ADMIN`) **PASSA** em todas as 3 coleções do lote atômico (`/items`, `/item_history` e `/item_private`):
   - `isRootIdentity()` faz curto-circuito direto por `uid` + `email.lower()` sem exigir `token.role` nem `userDoc.active == true`;
   - Mesmo sem o curto-circuito Root, `(!('active' in u) || u.active != false)` avalia `true` para `active: null`.
2. Entretanto, o histórico do repositório comprova que:
   - O cliente (`src/lib/firebaseInit.ts` + `firebase-applet-config.json`) conecta explicitamente ao **banco Firestore nomeado** `ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1`;
   - `firebase.json` só passou a apontar o bloco `"firestore.database"` para esse banco nomeado nas etapas recentes — deploys anteriores atingiam apenas `(default)`, deixando o banco nomeado com regras desatualizadas/divergentes (por exemplo: regras anteriores à refatoração do orçamento CEL de 1.000 expressões, ausência dos blocos `/item_history` ou `/item_private`, ou validação estrita `active == true` que rejeitava `userDocActive=null`);
   - Como nenhuma publicação de regras foi autorizada ou executada até a Etapa 30, **a confirmação e publicação das regras corretas no banco nomeado em produção continua sendo o bloqueio externo primário**.

#### Camada B — 3 Defeitos Locais de Borda em `firestore.rules` (Corrigidos em Candidato Isolado)
Sem modificar `firestore.rules` (preservado byte a byte), a auditoria identificou **3 falhas reais** isoladas em `scripts/audit/candidates/etapa30-complementacao/firestore.rules.candidate`:

| ID | Localização | Falha Encontrada | Correção no Candidato |
| :---: | :--- | :--- | :--- |
| **R-01** | `isStandingActive(u)` (linhas 52–56) | `'blockExpiresAt' in u` e `'suspendedUntil' in u` retornam `true` mesmo quando o campo existe com valor `null` (gravado ao desbloquear/reativar contas). Em CEL, `null is timestamp` é `false`, gerando falso `permission-denied` para `ADMIN` (não-root) e `SERVIDOR` ativos após um ciclo de desbloqueio. | Exigir `&& u.blockExpiresAt != null` e `&& u.suspendedUntil != null` (mantendo bloqueio total para `status == 'suspended'`, `status == 'blocked'`, `active == false` e timestamps futuros). |
| **R-02** | `/audit_logs` e `/activity_logs` (linhas 1047–1048, 1079) | Comparação `incoming().actorEmail == request.auth.token.email` e `adminEmail` era *case-sensitive*; divergências de caixa entre token Google e e-mail normalizado em minúsculas no cliente podiam rejeitar logs de auditoria. | Comparação segura `.lower()` com verificação explícita `is string`. |
| **R-03** | `/item_private/{itemId}` `allow create` (linhas 704–706) | Faltava verificação explícita de anti-spoofing `(!('registeredByUserId' in incoming()) || incoming().registeredByUserId == request.auth.uid)` na criação do documento privado. | Cláusula adicionada alinhando `/item_private` ao anti-spoofing de `/items`. |

#### Camada C — 7 Defeitos Locais de Frontend e Sincronização Offline (CORRIGIDOS NO CÓDIGO)
Mesmo com regras válidas em produção, 7 defeitos concretos no código local comprometiam integridade, segurança, diagnóstico e resiliência da fila offline:

| ID | Arquivo | Severidade | Causa Raiz Detectada | Correção Aplicada |
| :---: | :--- | :---: | :--- | :--- |
| **C-01** | `src/context/AppContext.tsx` (`addItem`) | **CRÍTICA** | `recordAuditLog`, `logAdminAction`, remoção da fila offline e envio ao Discord rodavam **dentro do mesmo `try/catch`** de `await createBatch.commit()`. Qualquer erro pós-commit (ex.: `permission-denied` em `/audit_logs`) revertia um objeto **já gravado no Firestore** para `ERROR` e o re-enfileirava no IndexedDB, criando risco de duplicação e falso diagnóstico de falha de cadastro. | Isolado `await createBatch.commit()` em bloco `try/catch` próprio; operações pós-commit (limpeza da fila, `setItems`, `updateUploadTask('COMPLETED')`, `recordAuditLog`, `logAdminAction`, Discord) movidas para fora do `catch` com tratamento não-fatal. |
| **C-02** | `src/context/AppContext.tsx` (`syncOfflineQueue`) | **CRÍTICA** | A sincronização offline enviava `writeBatch.commit()` diretamente sem validar elegibilidade/standing do chamador (`evaluateItemRegistrationEligibility`), sem reconciliar perfil divergente com o servidor (`reconcileOwnProfileWithServer`) e sem alinhar `registeredByRole` ao papel efetivo verificado (`ADMIN` \| `SERVIDOR`). | Adicionada verificação pré-commit de elegibilidade + standing + e-mail verificado, reconciliação com servidor em caso de divergência e alinhamento estrito de `registeredByRole`, preservando sempre o registro no IndexedDB quando negado. |
| **C-03** | `src/context/AppContext.tsx` (`syncOfflineQueue` & `addItem`) | **CRÍTICA** | `syncOfflineQueue` fazia spread bruto de `entry.payload.history[0]` ao criar `/item_history/{id}`, sem sanitizar campos proibidos (`PRIVATE_ITEM_FIELDS`), sem garantir `action` não vazia e sem travar `actorRole`/`userRole` para `'ADMIN' | 'SERVIDOR'`. Qualquer entrada corrompida derrubava o lote atômico inteiro (`/items` + `/item_history`). | Criado `buildSanitizedInitialHistoryEntry()` e `buildSanitizedItemPrivatePayload()` em `src/lib/itemRegistrationPipeline.ts` e aplicado uniformemente em `addItem` e `syncOfflineQueue`. |
| **C-04** | `src/context/AppContext.tsx` (`syncOfflineQueue`) | **MÉDIA** | Log forense de erro na fila offline declarava erroneamente `operation: "setDoc(..., { merge: true })"` apesar de a operação real ser um `writeBatch.commit()` multi-coleção, confundindo triagens. | Corrigido para `operation: "writeBatch.commit()"` com `targetCollections` reais e `databaseId` explícito (`ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1`). |
| **C-05** | `src/context/AppContext.tsx` (`addItem`) | **ALTA** | Verificação de bloqueio usava `isAccountBlocked(currentUser)` (estado React potencialmente obsoleto) em vez do documento recém-lido do servidor `verifiedUserDocData`. | Verificação unificada sobre `verifiedUserDocData ?? currentUser` via `evaluateItemRegistrationEligibility()`. |
| **C-06** | `src/context/AppContext.tsx` (`recordAuditLog` & `logAdminAction`) | **MÉDIA** | `logAdminAction` vinculava `adminId: currentUser.id` em vez de `auth.currentUser?.uid` e omitia `actorId`/`actorRole`/`actorEmail`; `recordAuditLog` usava fallback Root somente por e-mail sem checar UID + `emailVerified` e ignorava `actorOverride.role`. | Alinhados `adminId`/`actorId`/`actorEmail`/`actorRole` ao `auth.currentUser`, adotado `isVerifiedRootAdminAuthUser`, suportado `actorOverride.role` e preservadas todas as garantias de `auditLogsSecurity.test.ts`. |
| **C-07** | `src/components/RegisterItemView.tsx` | **ALTA** | Guarda de acesso `isUnauthorized` não bloqueava `ADMIN` não-root pendente, contas suspensas/bloqueadas nem e-mail não verificado; além disso, a tela de erro do Passo 5 não recebia nem exibia `error` nem `taskId` do resultado de `addItem`. | Substituída guarda por `evaluateRegisterViewAccess()`, propagados `error` e `taskId` no estado `registrationFeedback` e adicionado alerta acessível (`role="alert"`) exibindo o diagnóstico real e preservando o ID do objeto (ex.: `ifpr-MWMUBPTI-536`). |

---

## 2. Fluxo Completo de Cadastro de Objetos e Sincronização Offline (16 Etapas)

```text
[1. Autenticação Firebase Auth]
      │  auth.currentUser (uid, email, emailVerified; token.role opcional)
      ▼
[2. Resolução de Identidade e Reconciliação de Perfil (/users/{uid})]
      │  verifyUserInFirestore + resolveIdentityRole (preserva Gmail ADMIN/SERVIDOR/ALUNO atribuído por admin)
      ▼
[3. Guarda de UI — RegisterItemView]
      │  evaluateRegisterViewAccess(): bloqueia visitante, e-mail não verificado, suspenso,
      │  bloqueado, ALUNO, INTRUSO e SERVIDOR/ADMIN não-root com approvalStatus != APROVADO
      ▼
[4. Preenchimento e Validação Local (Passos 1 a 4)]
      │  validateItemTextFields() + validação de datas não futuras + compressão de fotos
      ▼
[5. Geração de ID Canônico e Tarefa de Upload]
      │  id = ifpr-<BASE36>-<SEQ> (ex.: ifpr-MWMUBPTI-536) + registerUploadTask('UPLOADING')
      ▼
[6. Pré-checagem de Elegibilidade e Standing no Servidor (addItem)]
      │  getDoc(/users/{uid}) fresco -> evaluateItemRegistrationEligibility()
      │  (reconciliação via reconcileOwnProfileWithServer se perfil local divergir)
      ▼
[7. Persistência Preventiva Local (Offline-First)]
      │  IndexedDB queue (offlineDb) grava payload antes da rede — NUNCA descarta em erro
      ▼
[8. Montagem do Plano Atômico de Escrita — buildItemRegistrationWritePlan()]
      │  ├── /items/{id}          (buildFirestoreItemCreatePayload: sem PRIVATE_ITEM_FIELDS)
      │  ├── /item_history/{hid}  (buildSanitizedInitialHistoryEntry: actorId=uid, actorRole=ADMIN|SERVIDOR, action!=vazia)
      │  └── /item_private/{id}   (condicional: só se houver secretVerificationHint/Key, com registeredByUserId=uid)
      ▼
[9. Validação de Tamanho do Payload]
      │  calculatePayloadSizeBytes(itemPayload) <= limite Firestore
      ▼
[10. Commit Atômico Isolado — writeBatch.commit() no Banco Nomeado]
      │  Banco: ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1
      │  ├── [FALHA DE REDE / UNAVAILABLE] ──► Mantém IndexedDB (PENDING_SYNC) -> retry automático/manual
      │  ├── [FALHA permission-denied] ──────► Mantém IndexedDB (ERROR, NEVER DELETE), registra
      │  │                                     [ADD_ITEM_FIRESTORE_ORIGINAL_ERROR] com databaseId +
      │  │                                     targetCollections e exibe alerta diagnóstico no Passo 5
      │  └── [SUCESSO ATÔMICO] ──────────────► Sai do try/catch de commit (C-01 corrigido!)
      ▼
[11. Limpeza Segura da Fila e Atualização de Estado (Pós-Commit Não-Fatal)]
      │  removeFromOfflineQueue(id) + setItems() + updateUploadTask('COMPLETED')
      ▼
[12. Auditoria Pós-Commit Isolada (Não-Fatal)]
      │  recordAuditLog() (/activity_logs) + logAdminAction() (/audit_logs)
      │  (Falha aqui loga aviso mas JAMAIS reverte item gravado nem re-enfileira no IndexedDB)
      ▼
[13. Notificações Externas Não-Fatais]
      │  Webhook Discord (se configurado) — falha não reverte cadastro
      ▼
[14. Reprocessamento da Fila Offline — syncOfflineQueue() / retryUploadTask()]
      │  ├── Revalida auth.currentUser + evaluateItemRegistrationEligibility() (com reconcile se necessário)
      │  ├── Verifica antiduplicação no servidor (getDoc(/items/{id})):
      │  │     • Já existe no servidor? Reconcilia e limpa fila sem duplicar nem sobrescrever!
      │  │     • Não existe? Reconstrói writePlan sanitizado (mesmo pipeline do Passo 8) e faz writeBatch.commit()
      │  └── Em permission-denied ou erro de rede: PRESERVA registro no IndexedDB com diagnóstico real
      ▼
[15. Feedback ao Usuário (RegisterItemView Passo 5 + UploadStatusIndicator)]
      │  Exibe status real (COMPLETED / PENDING_SYNC / ERROR), ID preservado e botão de retentativa segura
      ▼
[16. Consistência de Catálogo e Histórico de Versões]
         Objeto visível no catálogo com projeção pública limpa (sem PII) e histórico inicial vinculado
```

---

## 3. Lista Completa de Arquivos Analisados

Foram inspecionados diretamente no repositório, antes de qualquer modificação:

1. `firestore.rules` (1.275 linhas — regras vigentes, preservadas intactas)
2. `firebase.json` (configuração do banco nomeado `ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1`)
3. `firebase-applet-config.json` (identificação do projeto `gen-lang-client-0490390966` e `firestoreDatabaseId`)
4. `src/lib/firebaseInit.ts`
5. `src/lib/devolutionAuth.ts`
6. `src/lib/itemPrivacyUtils.ts`
7. `src/lib/clientItemSecurityGuards.ts`
8. `src/lib/offlineSyncRecovery.ts`
9. `src/lib/offlineDb.ts`
10. `src/lib/indexedDB.ts`
11. `src/lib/accountStatusUtils.ts`
12. `src/lib/payloadSizeGuard.ts`
13. `src/lib/utils.ts`
14. `src/context/AppContext.tsx`
15. `src/components/RegisterItemView.tsx`
16. `src/components/UploadStatusIndicator.tsx`
17. `src/data/versionsData.ts`
18. `src/lib/registerObjectFlow.test.ts`
19. `src/lib/offlineUploadSync.test.ts`
20. `src/lib/authProfileReconcileAndSync.test.ts`
21. `src/lib/listenerAndOfflineSyncSecurity.test.ts`
22. `src/lib/postRedesignRegressions.test.ts`
23. `src/lib/auditDefectFixes.test.ts`
24. `src/lib/auditLogsSecurity.test.ts`
25. `src/lib/firestoreRules.emulator.test.ts`
26. `docs/audit/LOCALIZA_ETAPA_30_RELATORIO_FINAL.md` (manifesto dos 25 artefatos protegidos)

---

## 4. Lista Completa de Arquivos Criados, Modificados e Candidatos Isolados

### 4.1. Código da Aplicação e Testes (Criados / Modificados)

| Ação | Caminho | Bytes | Linhas | SHA-256 | Finalidade |
| :---: | :--- | :---: | :---: | :--- | :--- |
| **CRIADO** | `src/lib/itemRegistrationPipeline.ts` | 23.390 | 698 | `e95e3d7440de0e9f534cc41969dac22e293d65d4711cb8407cae8cc299ec0626` | Pipeline canônico de elegibilidade (8 perfis), guarda de UI, sanitização de `/items` + `/item_history` + `/item_private` e espelho estático local de regras |
| **CRIADO** | `src/lib/etapa30ComplementacaoCadastro.test.ts` | 35.913 | 886 | `f16243e166e95da7c6e79a7ef72fe3474c0d098f1d13b2b99909f238235d632d` | Suite dedicada com 21 testes cobrindo integralmente os 19 cenários obrigatórios e proteção SHA-256 |
| **MODIFICADO** | `src/context/AppContext.tsx` | 279.702 | 7.168 | `0b82964f7b1fc131de9e91557bb8735706b91fc35003f17c0b2d5c280c3d1e6a` | Correções `C-01` a `C-06` em `addItem`, `syncOfflineQueue`, `recordAuditLog` e `logAdminAction` |
| **MODIFICADO** | `src/components/RegisterItemView.tsx` | 99.921 | 2.483 | `3e599d746e85cb04cdca6c853c41d53fd8145d26ecd69311098f5da44789e8dc` | Correção `C-07`: guarda unificada dos 8 perfis e feedback diagnóstico real no Passo 5 com ID preservado |
| **MODIFICADO** | `src/data/versionsData.ts` | 296.314 | 4.624 | `535e92ad025841d04fc80dc5e348efa627f632977090ca971d8b9ea87d71d290` | Registro factual `v11013-fix-etapa30-complementacao-cadastro-e-sync-offline` na `v1.10.13` (`fixesCount: 11`) |

### 4.2. Artefatos Candidatos Isolados (Sem Alterar `firestore.rules`)

| Ação | Caminho | Bytes | Linhas | SHA-256 | Finalidade |
| :---: | :--- | :---: | :---: | :--- | :--- |
| **CRIADO** | `scripts/audit/candidates/etapa30-complementacao/firestore.rules.candidate` | 58.050 | 1.276 | `06ad24a5bcc3493e2741022d40f13424681663cadd7a602092417a3814f46178` | Candidato de Rules com as 3 correções cirúrgicas (`R-01`, `R-02`, `R-03`) — **não promovido/não publicado** |
| **CRIADO** | `scripts/audit/candidates/etapa30-complementacao/firestore.rules.diff.md` | 9.104 | 89 | `ca168f22c63fd3efcd8883a99afd4e3c869afc666008970c9b6d57409e7ac837` | Diff unificado (`diff -u`), análise de orçamento CEL e checklist externo antes de promoção |

---

## 5. Matriz Oficial de Permissões de Cadastro de Objetos (8 Perfis)

| # | Perfil Institucional | E-mail / Domínio | `approvalStatus` | Standing (`status`/`active`/expirações) | UI (`RegisterItemView`) | `addItem` / `syncOfflineQueue` | Espelho `firestore.rules` (2f2a2ffc / Candidato) |
| :---: | :--- | :--- | :--- | :--- | :---: | :---: | :---: |
| **1** | **Root Admin Verificado** (`hCG5mDgK1fRaTojULzlM7dXvb7n2`) | `paulocauan39@gmail.com` (`emailVerified=true`, `token.role=null`) | `APROVADO` | `status=active`, `active=null` | **PERMITIDO** | **PERMITIDO** (`ADMIN`) | **ALLOW** / **ALLOW** |
| **2** | **ADMIN Não-Root Ativo e Aprovado** (incl. Gmail promovido por admin) | `@ifpr.edu.br` ou `@gmail.com` (`emailVerified=true`) | `APROVADO` | `active` (incl. `blockExpiresAt: null` no candidato) | **PERMITIDO** | **PERMITIDO** (`ADMIN`) | **ALLOW** (`blockExpiresAt: null` falha na `2f2a` -> **ALLOW** no candidato) |
| **3** | **SERVIDOR / TAE Ativo e Aprovado** (incl. Gmail promovido por admin) | `@ifpr.edu.br` ou `@gmail.com` (`emailVerified=true`) | `APROVADO` | `active` (incl. `suspendedUntil: null` no candidato) | **PERMITIDO** | **PERMITIDO** (`SERVIDOR`) | **ALLOW** (`suspendedUntil: null` falha na `2f2a` -> **ALLOW** no candidato) |
| **4** | **SERVIDOR Pendente** (ou ADMIN não-root pendente) | Qualquer (`emailVerified=true`) | `PENDENTE` | `active` | **BLOQUEADO** | **NEGADO** (`APPROVAL_PENDING`) | **DENY** / **DENY** |
| **5** | **ALUNO** (incl. Gmail autorizado como ALUNO por admin) | `@estudantes.ifpr.edu.br` ou `@gmail.com` | `APROVADO` | `active` | **BLOQUEADO** | **NEGADO** (`ROLE_ALUNO_FORBIDDEN`) | **DENY** / **DENY** |
| **6** | **INTRUSO** (visitante / domínio externo sem promoção) | Externo não promovido | N/A ou `PENDENTE` | Qualquer | **BLOQUEADO** | **NEGADO** (`ROLE_INTRUSO_FORBIDDEN`) | **DENY** / **DENY** |
| **7** | **Usuário Suspenso** (indeterminado ou `suspendedUntil` futuro) | Qualquer | `APROVADO` | `status=suspended` ou `suspendedUntil > now` | **BLOQUEADO** | **NEGADO** (`ACCOUNT_SUSPENDED`) | **DENY** / **DENY** |
| **8** | **Usuário Bloqueado** (`active=false`, `status=blocked` ou `blockExpiresAt` futuro) | Qualquer | `APROVADO` | `active=false` ou `status=blocked` ou `blockExpiresAt > now` | **BLOQUEADO** | **NEGADO** (`ACCOUNT_BLOCKED`) | **DENY** / **DENY** |

> **Regra de Precedência para Contas `@gmail.com` Preservada:** Nenhuma conta `@gmail.com` com papel explicitamente atribuído por administrador no Firestore (`ADMIN`, `SERVIDOR` ou `ALUNO`) é rebaixada para `INTRUSO` por heurística de domínio de e-mail — tanto em `evaluateItemRegistrationEligibility` quanto em `evaluateRegisterViewAccess` e no espelho de `firestore.rules`.

---

## 6. Relatório Completo de Testes, Regressão e Build

### 6.1. Resumo das Execuções Locais

| Verificação | Comando Executado | Resultado | Detalhes Reais Observados |
| :--- | :--- | :---: | :--- |
| **Suite Dedicada (19 Cenários)** | `npx vitest run src/lib/etapa30ComplementacaoCadastro.test.ts` | **PASS** | **21/21 PASS** (0 FAIL, 21 ms) |
| **Suite Completa Vitest (`src/`)** | `npx vitest run src` | **PASS** | **81 arquivos PASS**, **1.270 testes PASS**, **0 FAIL**, **1 arquivo SKIPPED** (`src/lib/firestoreRules.emulator.test.ts`: 120 testes *skipped* — `java` indisponível / `FIRESTORE_EMULATOR_HOST` ausente) |
| **Suites de Auditoria (Etapas 21–30)** | `node --test scripts/audit/...` (5 suites) | **PASS** | **71 PASS, 0 FAIL, 3 SKIPPED** (`E29-11` não executado; `E30-EXT-01/02` bloqueados por dependência externa) |
| **Tipagem TypeScript** | `tsc --noEmit` (`lint_applet`) | **PASS** | **0 erros** |
| **Build de Produção** | `npm run build` (`compile_applet`) | **PASS** | Validado na verificação final conjunta com `lint_applet` |
| **Cloud Firestore Emulator Real** | `src/lib/firestoreRules.emulator.test.ts` | **NÃO EXECUTADO (BLOQUEIO AMBIENTAL)** | Container não possui `java` para subir o emulador oficial |
| **Conexão Firebase / Banco Nomeado Real** | Proibido pelo escopo | **NÃO EXECUTADO (BLOQUEIO EXTERNO)** | Verificação das Rules publicadas e sincronização real de `ifpr-MWMUBPTI-536` dependem de execução externa autorizada |

### 6.2. Cobertura dos 19 Cenários Obrigatórios (`src/lib/etapa30ComplementacaoCadastro.test.ts`)

| # | Cenário Testado | Resultado |
| :---: | :--- | :---: |
| 01 | Root Admin verificado (`hCG5mDgK1fRaTojULzlM7dXvb7n2`, `paulocauan39@gmail.com`, `tokenRole=null`, `userDocActive=null`, `registeredByRole=ADMIN`) — permitido em UI, pipeline e espelho Rules | **PASS** |
| 02 | ADMIN não-root ativo e aprovado (`@ifpr.edu.br`) — permitido | **PASS** |
| 03 | SERVIDOR/TAE ativo e aprovado (`@ifpr.edu.br`) — permitido | **PASS** |
| 04 | SERVIDOR com `approvalStatus=PENDENTE` — negado em UI, pipeline e espelho Rules | **PASS** |
| 05 | ALUNO (incluindo Gmail promovido a ALUNO) — nunca rebaixado a INTRUSO, mas negado para cadastro | **PASS** |
| 06 | INTRUSO (visitante / e-mail externo sem promoção) — negado | **PASS** |
| 07 | Usuário suspenso (`status=suspended` e `suspendedUntil` futuro) — negado | **PASS** |
| 08 | Usuário bloqueado (`active=false`, `status=blocked` e `blockExpiresAt` futuro) — negado | **PASS** |
| 09 | Contas `@gmail.com` promovidas administrativamente a `SERVIDOR`/`ADMIN` mantêm permissão sem degradação para `INTRUSO` | **PASS** |
| 10 | Ausência de Custom Claim `token.role` (`tokenRole=null`) não bloqueia Root Admin nem `ADMIN`/`SERVIDOR` aprovados | **PASS** |
| 11 | Reprodução do bug `R-01` (`blockExpiresAt: null` / `suspendedUntil: null` negando na `2f2a2ffc`) e comprovação da correção no candidato (`CANDIDATE_FIXED`) mantendo suspensão indeterminada bloqueada | **PASS** |
| 12 | Falha em `/items` (campos proibidos de devolução/assinatura ou texto inválido) rejeitada fail-closed | **PASS** |
| 13 | Sanitização de `/item_history` corrige `rawInitHistory` corrompido (`actorRole: 'ALUNO'`, `action: ''`, campos PII proibidos) antes do `writeBatch.commit()` | **PASS** |
| 14 | Escrita condicional em `/item_private`: omitida sem segredo; validada com `itemId` e `registeredByUserId == auth.uid` quando presente | **PASS** |
| 15 | Isolamento pós-commit (`C-01`): falha em `recordAuditLog` / `logAdminAction` após `createBatch.commit()` não reverte o item para `ERROR` nem o re-enfileira | **PASS** |
| 16 | Preservação da fila offline com o objeto de teste `ifpr-MWMUBPTI-536` sob `permission-denied` (jamais descartado do IndexedDB) | **PASS** |
| 17 | Recuperação após `permission-denied` e reprocessamento seguro preservando ID original `ifpr-MWMUBPTI-536` | **PASS** |
| 18 | Antiduplicação no reenvio: item já persistido no servidor reconcilia e limpa fila sem duplicar nem sobrescrever | **PASS** |
| 19 | Recuperação após erro transitório de rede (`unavailable` -> `PENDING_SYNC` -> sucesso) + verificação SHA-256 intacto de `firestore.rules` | **PASS** |

---

## 7. Manifesto de Integridade SHA-256 dos 25 Artefatos Protegidos da Etapa 30

Verificação criptográfica executada diretamente sobre o sistema de arquivos após todas as alterações da complementação: **25/25 PRESERVADOS INTACTOS (0 divergências)**.

| # | Caminho Protegido | Bytes | SHA-256 Verificado | Estado |
| :---: | :--- | :---: | :--- | :---: |
| 1 | `firestore.rules` | 57.716 | `2f2a2ffc8c471d7fe97b5d1d2bb3c2a3ca27d39947be64449ad13a532c851f9e` | **INTACTO** |
| 2 | `package.json` | 1.783 | `50d5c9494e06310b11ca9da58906049e5a0ee3f44e90b70d3ae18225722508a7` | **INTACTO** |
| 3 | `package-lock.json` | 451.206 | `40f70133d9ab8306afde0619bf494cdaf7b6e22188770109b1fdcb84c7186f81` | **INTACTO** |
| 4 | `scripts/audit/audit-users-readonly.mjs` | 53.723 | `6dbe7c68c1fe56e71ca2130f0f4a6165aefad3f34b1e88fb943eb0a37729c00b` | **INTACTO** |
| 5 | `scripts/audit/audit-users-readonly.test.mjs` | 47.875 | `a1e3f2b7b28c63e8c4303bbfd903c90a27de4b9acaab6bd2e1d7c17f02c87879` | **INTACTO** |
| 6 | `scripts/audit/verify-approval-record.mjs` | 13.129 | `4d36c2c75e5d5c56d7ca1799681e63549d51308ff3229177333f4c4e8b9d629f` | **INTACTO** |
| 7 | `scripts/audit/validate-audit-summary.mjs` | 16.943 | `595fce54acb7af0aeb722dcdbb5d98227e18e8df411eaa1ea0aaa6c2eae98a08` | **INTACTO** |
| 8 | `scripts/audit/validate-audit-summary.test.mjs` | 22.627 | `64de6fd574ac0a1b166d91ba5d50b1214bd652eba7184193f76db23030b14112` | **INTACTO** |
| 9 | `scripts/audit/candidates/etapa28/verify-approval-record.candidate.mjs` | 17.050 | `1b33c2e41d62d668556ccf4dc9a59d97350eab77ce448b9b7e22b5a45dddc610` | **INTACTO** |
| 10 | `scripts/audit/candidates/etapa28/validate-audit-summary.candidate.mjs` | 19.307 | `3aae9b5a7084b166d40c1c3839399607df23f036690330c1c08a72f6875171c5` | **INTACTO** |
| 11 | `scripts/audit/candidates/etapa28/probe-readonly-v4.candidate.mjs` | 17.053 | `e2e3254c01877b1ef6bf3b21e8ee703ab0139c95859e1dfdd4b4135107eb90c9` | **INTACTO** |
| 12 | `scripts/audit/candidates/etapa28/etapa28-security.test.mjs` | 30.363 | `ae55f54fda2f9347d0ad5a40eac3d2760fe5810ce8a83fdbc85aa83f3d634763` | **INTACTO** |
| 13 | `scripts/audit/candidates/etapa29/probe-readonly-v4.etapa29.candidate.mjs` | 30.014 | `4332d2673d65c1978abb064b505e900e96a8a3998b3fc94d94aa8f0ac61f5c9f` | **INTACTO** |
| 14 | `scripts/audit/candidates/etapa29/etapa29-audit.test.mjs` | 22.419 | `6bd2bef8f11a45e3d45741d3c94eb02fbffe29bd1ba2fa8d04b89f1aca321e61` | **INTACTO** |
| 15 | `docs/audit/LOCALIZA_ETAPA_28_RELATORIO_FINAL_INTEGRAL.md` | 174.018 | `48ff8e2a6a4e0d0badabce60011c412d645a9b9cdbc6b94f5ab2009b586bb862` | **INTACTO** |
| 16 | `docs/audit/LOCALIZA_ETAPA_28_RELATORIO_FINAL_INTEGRAL.pdf` | 131.722 | `560e9cfabd49763db22690bbe286d984d8cf76992f873c06a49d6b462fdf4b73` | **INTACTO** |
| 17 | `docs/audit/LOCALIZA_ETAPA_29_AUDITORIA_INDEPENDENTE.md` | 106.541 | `178781274adb42a3775eaffc03a1cf06d083c20be05a2a2971ff52bbc95dd3c7` | **INTACTO** |
| 18 | `docs/audit/LOCALIZA_ETAPA_29_AUDITORIA_INDEPENDENTE.pdf` | 517.323 | `cc337a5e8754edfb8951ca65632c5969c2b576837ce86cd9c196b40087239d23` | **INTACTO** |
| 19 | `scripts/audit/candidates/etapa30/verify-approval-record.etapa30.candidate.mjs` | 20.705 | `c873a723961e59bfcfd3fe902661c39e305562456b8ab933c18d5869243c8c4d` | **INTACTO** |
| 20 | `scripts/audit/candidates/etapa30/evaluate-iam-readiness.etapa30.candidate.mjs` | 19.644 | `bdf500824b16134f8312c316ba33b1c30de9877ca4e643ea5ff4c0aca540ba20` | **INTACTO** |
| 21 | `scripts/audit/candidates/etapa30/validate-audit-summary.etapa30.candidate.mjs` | 21.380 | `d97812fc52191ce5829aad8321db47d40f23f04f3a665c40fc4d0371a8e4f37e` | **INTACTO** |
| 22 | `scripts/audit/candidates/etapa30/probe-readonly-v4.etapa30.candidate.mjs` | 35.452 | `c1e18efec2cc7aed397caf022c35362b369eac9588ba8b4ba5d7a50ec1557500` | **INTACTO** |
| 23 | `scripts/audit/candidates/etapa30/etapa30-consolidated.test.mjs` | 35.320 | `4ee62ff37ed43b7e4e3a3bdf22a379e82edb9e49dd1d6dd6df3d5c722f24fbd9` | **INTACTO** |
| 24 | `docs/audit/LOCALIZA_ETAPA_30_RELATORIO_FINAL.md` | 40.994 | `92bdf3c1697915672e82478421612db9c19df82434ff33d2674516ee34a53cb8` | **INTACTO** |
| 25 | `docs/audit/LOCALIZA_ETAPA_30_RELATORIO_FINAL.pdf` | 42.429 | `2654d92b497e52301780b3648947cace6fd19fb8277905f0e26fa06776e9c800` | **INTACTO** |

---

## 8. Procedimento Externo Obrigatório (Desbloqueio em Produção e Recuperação de `ifpr-MWMUBPTI-536`)

Para concluir o desbloqueio **em ambiente real de produção** (fora do escopo estático desta etapa):

1. **Validação no Cloud Firestore Emulator (Estação Externa com Java 17+):**
   - Testar `scripts/audit/candidates/etapa30-complementacao/firestore.rules.candidate` contra `src/lib/firestoreRules.emulator.test.ts` (todos os 60 casos base + matriz dos 8 perfis + `blockExpiresAt: null` / `suspendedUntil: null`).
2. **Inspeção das Regras Atualmente Publicadas no Banco Nomeado:**
   - No Console do Firebase (projeto `gen-lang-client-0490390966`, banco **`ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1`** — não `(default)`), comparar a versão publicada ativa com `firestore.rules` e com o candidato `06ad24a5...`.
3. **Promoção e Publicação Autorizada (Tarefa Dedicada de Deploy):**
   - Após aprovação formal, promover o candidato validado para `firestore.rules`, publicar explicitamente para o banco nomeado via `firebase deploy --only firestore:rules` e publicar o build atualizado do frontend (`AppContext.tsx`, `RegisterItemView.tsx`, `itemRegistrationPipeline.ts`, `versionsData.ts`).
4. **Reprocessamento Seguro do Objeto `ifpr-MWMUBPTI-536` (Sem Limpar IndexedDB):**
   - Abrir a aplicação publicada com a conta Root Admin (`paulocauan39@gmail.com`) no mesmo navegador onde `ifpr-MWMUBPTI-536` está preservado;
   - Acionar a retentativa pelo `UploadStatusIndicator` (`retryUploadTask` / `syncOfflineQueue`);
   - Confirmar a gravação atômica em `/items/ifpr-MWMUBPTI-536` e `/item_history/hist-ifpr-MWMUBPTI-536-init`, a reconciliação antiduplicação e a remoção segura da entrada na fila apenas após `COMPLETED`.

---

## 9. Veredito Formal de Encerramento

- **Status:** **`APROVADA LOCALMENTE COM BLOQUEIOS EXTERNOS`**
- **Resumo Factual:** Todos os 7 defeitos locais de cadastro, sanitização de histórico, isolamento pós-commit, auditoria e fila offline foram corrigidos e validados localmente (81/81 suites Vitest, 1.270 testes PASS; 71/71 testes Node das Etapas 21–30 PASS; `tsc --noEmit` 0 erros; 25/25 artefatos protegidos intactos). As 3 melhorias de Rules (`R-01`, `R-02`, `R-03`) estão isoladas em candidato próprio sem alterar `firestore.rules`. O desbloqueio definitivo em produção depende exclusivamente das etapas externas proibidas neste escopo (validação no Firestore Emulator, conferência/publicação das Rules no banco nomeado `ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1` e deploy do frontend).
