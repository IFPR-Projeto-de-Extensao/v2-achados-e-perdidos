# LOCALIZA+ v1.10.13 — Etapa 33: Matriz Integral de Permissões, Arquitetura de Segurança e Compatibilidade

- **Artefato de Regras Avaliado:** `scripts/audit/candidates/etapa33-reconstrucao/firestore.rules`
- **SHA-256 (Nova Arquitetura):** `45677cbd475e3f7d3cd451640d9aceec26795484c813606fda73ec4d11da330b` (`55.592` bytes, `1.160` linhas)
- **SHA-256 (Regra Raiz Preservada — NÃO alterada):** `2f2a2ffc8c471d7fe97b5d1d2bb3c2a3ca27d39947be64449ad13a532c851f9e` (`57.716` bytes, `1.276` linhas)
- **Projeto Firebase Alvo:** `gen-lang-client-0490390966`
- **Banco de Dados Alvo (Nomeado):** `ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1` (NÃO `(default)`)
- **Root Admin Fixado (UID Pinning):** `hCG5mDgK1fRaTojULzlM7dXvb7n2` (`paulocauan39@gmail.com`)

---

## 1. Inventário Integral de Coleções e Subcoleções

Varredura estática integral em `src/`, `api/`, `server.ts` e `functions/src/`:
- **Total de coleções de nível superior identificadas:** **32 coleções** (28 operacionais/governança + 4 estritamente server-only/legadas/sonda).
- **Total de subcoleções identificadas:** **0 subcoleções** (estrutura totalmente plana; qualquer subcoleção arbitrária é negada pela regra global `match /{document=**} { allow read, write: if false; }`).

| # | Coleção | Grupo Funcional | Camadas que Acessam | Lote/Transação |
|---|---|---|---|---|
| 1 | `/role_assignments/{targetUserId}` | Identidade & Governança | Frontend (`get`), Backend Admin SDK (`read/write`) | — |
| 2 | `/users/{userId}` | Identidade & Governança | Frontend (`get/list/create/update/delete`), Backend Admin SDK | `reconcile-profile`, `update-role`, `approveAllPendingUsers` |
| 3 | `/items/{itemId}` | Catálogo & Cadastro Atômico | Frontend (`get/list/create/update/delete`), Backend Admin SDK, Cloud Functions | `writeBatch` atômico (`items` + `item_history` + `item_private`), `runTransaction` devolução |
| 4 | `/found_items/{itemId}` | Catálogo Legado (Achados) | Frontend (`get/list/create/update/delete`), Backend Admin SDK | `runTransaction` devolução/reabertura |
| 5 | `/lost_items/{itemId}` | Catálogo Legado (Perdidos) | Frontend (`get/list/create/update/delete`), Backend Admin SDK | `runTransaction` devolução/reabertura |
| 6 | `/item_private/{itemId}` | Segregação LGPD do Cadastro | Frontend (`get/list/create/update/delete`), Backend Admin SDK | `writeBatch` atômico no cadastro/edição |
| 7 | `/item_history/{historyId}` | Trilha Imutável de Objetos | Frontend (`get/list/create`), Backend Admin SDK | `writeBatch` atômico no cadastro |
| 8 | `/signature_requests/{tokenHash}` | Assinatura Remota (Server-Only) | Exclusivo Backend Admin SDK (`api/signature/*`, `api/items/reopen-return`) | `runTransaction` |
| 9 | `/item_return_records/{recordId}` | Recibos de Devolução LGPD | Frontend (`get/list`), Escrita exclusiva Backend Admin SDK | `runTransaction` |
| 10 | `/email_notifications/{notifId}` | Fila de E-mail (Server-Only Write) | Frontend (`get/list` Staff/Admin), Escrita exclusiva Backend Admin SDK | — |
| 11 | `/claims/{claimId}` | Reivindicações de Objetos | Frontend (`get/list/create/update/delete`), Backend Admin SDK | `runTransaction` (conclusão/reabertura) |
| 12 | `/notifications/{notificationId}` | Notificações In-App | Frontend (`get/list/create/update/delete`), Backend Admin SDK, Cloud Functions | — |
| 13 | `/comments/{commentId}` | Comentários em Objetos | Frontend (`get/list/create/update/delete`) | — |
| 14 | `/fcm_subscriptions/{userId}` | Push Notifications (FCM) | Frontend (`get/list/create/update/delete` em `src/lib/fcm.ts`), Cloud Functions | — |
| 15 | `/support_tickets/{ticketId}` | Suporte e Feedback | Frontend (`get/list/create/update/delete`), Visitante (`create`) | — |
| 16 | `/activity_logs/{logId}` | Auditoria Operacional Imutável | Frontend (`get/list/create`), Backend Admin SDK | — |
| 17 | `/audit_logs/{logId}` | Auditoria Forense Imutável | Frontend (`get/list/create`), Backend Admin SDK | — |
| 18 | `/backup_logs/{logId}` | Logs de Backup Administrativo | Frontend (`get/list/create/delete` Admin) | — |
| 19 | `/error_logs/{logId}` | Telemetria de Erros de Cliente | Frontend (`get/list/create/delete`) | — |
| 20 | `/system_metrics/{metricId}` | Métricas e Heartbeat | Frontend (`get/list/create/update/delete`) | — |
| 21 | `/system/{docId}` | Manutenção & Backup Config | Frontend (`get/list` público; escrita Admin), Backend Admin SDK | — |
| 22 | `/system_config/{configId}` | Pinning do Root Admin | Frontend (`get/list` Admin), Escrita exclusiva Backend Admin SDK | — |
| 23 | `/project_settings/{settingsId}` | Metadados Institucionais InovaIF | Frontend (`get/list/create/update/delete` Admin) | — |
| 24 | `/document_templates/{templateId}` | Modelos PDF Oficiais | Frontend (`get/list/create/update/delete` Admin) | — |
| 25 | `/generated_documents/{docId}` | Documentos PDF Emitidos | Frontend (`get/list/create/update/delete` Admin) | — |
| 26 | `/test_executions/{executionId}` | Baterias QA | Frontend (`get/list/create/update/delete`) | — |
| 27 | `/test_participants/{participantId}` | Participantes QA | Frontend (`get/list/create/update/delete`) | — |
| 28 | `/test_error_logs/{logId}` | Erros de Baterias QA | Frontend (`get/list/create/delete` em `src/lib/testErrorLogService.ts`) | — |
| 29 | `/ai_audit_logs/{logId}` | Auditoria IA (Server-Only) | Exclusivo Backend Admin SDK (`api/analytics/metrics.ts`) | — |
| 30 | `/analytics_events/{eventId}` | Eventos Analytics (Server-Only) | Exclusivo Backend Admin SDK (`api/analytics/track.ts`, `metrics.ts`) | — |
| 31 | `/perdas/{lossId}` | Legado Cloud Function | Exclusivo trigger legado `functions/src/index.ts` (`notifyNewLoss`) | — |
| 32 | `/test/{docId}` | Sonda de Conexão (`test/connection`) | Frontend (`src/lib/firebase.ts:22`) espera `permission-denied` | — |

---

## 2. Matriz Completa de Permissões (32 Coleções × 7 Perfis)

**Legenda:** `G` = `get`, `L` = `list`, `C` = `create`, `U` = `update`, `D` = `delete`, `—` = Negado (`permission-denied`).  
**Observação transversal:** Todas as operações de escrita para usuários autenticados (exceto casos estritamente controlados de autogerenciamento/reconciliação previstos no perfil) exigem `email_verified == true` e `isStandingActive(u) == true` (fail-closed contra bloqueio, suspensão, banimento e valores `null`/inválidos em `blockExpiresAt`/`suspendedUntil`).

| Coleção | Não Autenticado | INTRUSO | ALUNO (Ativo) | SERVIDOR Pendente | SERVIDOR Aprovado | ADMIN (Comum / Root) | Backend (Admin SDK) |
|---|---|---|---|---|---|---|---|
| `/role_assignments` | — | `G` próprio | `G` próprio | `G` próprio | `G` próprio | `G,L` (sem `C,U,D`) | Total (bypass) |
| `/users` | — | `G` próprio; `C` próprio seguro (`INTRUSO`/auto); `U` próprio seguro (sem escalada/controle) | `G` próprio; `C` próprio seguro; `U` próprio seguro (sem 16 campos de controle) | `G` próprio; `C` próprio seguro; `U` próprio seguro | `G,L` todos; `U` próprio seguro | `G,L` todos; `C` managed não-ADMIN (Root: todos); `U` managed (Admin comum não concede `ADMIN` nem edita Root); `D` não-self/não-Root (Admin comum não deleta ADMIN) | Total |
| `/items` | `G,L` (somente projeção limpa, sem campos de devolução/assinatura) | `G,L` (projeção limpa) | `G,L` (projeção limpa); `C` válido (`ALUNO`, `ACHADO`/`PERDIDO`, sem campos privados/retorno); `U` metadados próprios seguros; `D` próprio não-`DEVOLVIDO` | `G,L` (projeção limpa); `C` válido (`ALUNO`/`PERDIDO`? Não: `canRegisterItems` exige `ALUNO`, `SERVIDOR APROVADO` ou `ADMIN` -> **NEGADO**) | `G,L` todos; `C` válido (`SERVIDOR`); `U` operacional (sem baixa `DEVOLVIDO`/`ENCERRADO`); `D` não-`DEVOLVIDO` | `G,L` todos; `C` válido (`ADMIN`/`SERVIDOR`); `U` operacional (sem baixa `DEVOLVIDO`/`ENCERRADO`); `D` não-`DEVOLVIDO` | Total (único que registra `DEVOLVIDO`/`ENCERRADO` e reabre) |
| `/found_items` | `G,L` (limpo) | `G,L` (limpo) | `G,L` (limpo); `C`; `U` próprio seguro; `D` próprio não-`DEVOLVIDO` | `G,L` (limpo) | `G,L,C,U` (sem devolução); `D` não-`DEVOLVIDO` | `G,L,C,U` (sem devolução); `D` não-`DEVOLVIDO` | Total |
| `/lost_items` | `G,L` (limpo) | `G,L` (limpo) | `G,L` (limpo); `C`; `U` próprio seguro; `D` próprio não-`DEVOLVIDO` | `G,L` (limpo) | `G,L,C,U` (sem devolução); `D` não-`DEVOLVIDO` | `G,L,C,U` (sem devolução); `D` não-`DEVOLVIDO` | Total |
| `/item_private` | — | — | `G` próprio; `C` (R-03: `registeredByUserId == uid` + anti-spoofing); `U` próprio; `D` próprio | — | `G,L` todos; `C` (próprio ou `editItem` retroativo validado em `/items`); `U,D` todos | `G,L` todos; `C` (próprio ou `editItem` retroativo); `U,D` todos | Total |
| `/item_history` | — | — | `G` próprio item; `C` (com `actorId == uid` e `actorRole == ALUNO`) | — | `G,L` todos; `C` (`actorId == uid`, `actorRole == SERVIDOR`) | `G,L` todos; `C` (`actorId == uid`, `actorRole in [ADMIN, SERVIDOR]`) | Total (imutável: sem `U,D` cliente) |
| `/signature_requests` | — | — | — | — | — | — | Total |
| `/item_return_records` | — | — | `G` próprio recibo (`recipientUid == uid`) | `G` próprio recibo | `G,L` todos | `G,L` todos | Total (único que escreve) |
| `/email_notifications` | — | — | — | — | `G,L` todos | `G,L` todos | Total (único que escreve) |
| `/claims` | — | — | `G,L` próprias; `C` (`claim_{uid}_{itemId}`, `PENDENTE`); `U` cancelar própria pendente (`PENDENTE -> CANCELADO`); `D` própria `PENDENTE` | — (`isActiveVerifiedMember` bloqueia pendente para criar/agir) | `G,L` todas; `U` aprovar/rejeitar (`PENDENTE -> APROVADO/REJEITADO`); `D` (se não `CONCLUIDO`) | `G,L` todas; `U` aprovar/rejeitar; `D` (se não `CONCLUIDO`) | Total (`APROVADO <-> CONCLUIDO`) |
| `/notifications` | — | — | `G,L` próprias/globais; `C` própria não-global/não-SYSTEM (`read: false`); `U` apenas `read`/`readAt` próprias; `D` próprias | `G,L` próprias/globais (se ativo) | `G,L` próprias/globais; `C` qualquer; `U` próprias (`read`/`readAt`); `D` próprias | `G,L,C,U,D` todas | Total |
| `/comments` | — | `G,L` | `G,L`; `C` próprio (`userRole: ALUNO`); `U,D` próprio | `G,L` | `G,L`; `C` próprio (`ALUNO`/`SERVIDOR`); `U,D` próprio | `G,L`; `C` próprio; `U` próprio; `D` qualquer | Total |
| `/fcm_subscriptions` | — | — | `G,C,U,D` própria (`uid == docId`) | `G` própria | `G,C,U,D` própria | `G,L,C,U,D` todas | Total |
| `/support_tickets` | `C` anônimo (`status: NOVO`, sem `userId`/`userRole`) | — | `G,L` próprios; `C` próprio (`status: NOVO`, e-mail case-insensitive) | `G` próprios | `G,L` próprios; `C` próprio | `G,L,C,U,D` todos | Total |
| `/activity_logs` | — | — | `C` restrito a ações de item (`actorId == uid`, e-mail case-insensitive) | — | `G,L`; `C` ações permitidas (`SERVIDOR`) | `G,L`; `C` ações permitidas (`ADMIN`/`SERVIDOR`) | Total (imutável) |
| `/audit_logs` | — | — | `C` restrito a `ITEM` (`actorId == uid`, e-mail case-insensitive) | — | `G,L`; `C` ações permitidas (`SERVIDOR`) | `G,L`; `C` ações permitidas (`ADMIN`/`SERVIDOR`) | Total (imutável) |
| `/backup_logs` | — | — | — | — | — | `G,L,C` (`adminId == uid`), `D` (sem `U`) | Total |
| `/error_logs` | — | — | `C` próprio (`userId == uid`, e-mail case-insensitive) | `C` próprio (se ativo) | `G,L`; `C` próprio | `G,L,C,D` (sem `U`) | Total |
| `/system_metrics` | — | `G` `heartbeat` | `G,C,U` apenas `heartbeat` | `G` `heartbeat` | `G,C,U` apenas `heartbeat` | `G,L,C,U,D` todos | Total |
| `/system` | `G,L` | `G,L` | `G,L` | `G,L` | `G,L` | `G,L,C,U,D` | Total |
| `/system_config` | — | — | — | — | — | `G,L` (sem `C,U,D`) | Total |
| `/project_settings` | — | — | — | — | — | `G,L,C,U,D` | Total |
| `/document_templates` | — | — | — | — | — | `G,L,C,U,D` | Total |
| `/generated_documents` | — | — | — | — | — | `G,L,C,U,D` | Total |
| `/test_executions` | — | — | `G,L,U` somente se inscrito em `/test_participants/{uid}` | — | `G,L,C,U` | `G,L,C,U,D` | Total |
| `/test_participants` | — | — | `G` próprio (`uid == docId`) | — | `G,L,C,U` | `G,L,C,U,D` | Total |
| `/test_error_logs` | — | — | `C` próprio com schema validado (e-mail case-insensitive) | — | `G,L,C` | `G,L,C,D` (sem `U`) | Total |
| `/ai_audit_logs` | — | — | — | — | — | — | Total |
| `/analytics_events` | — | — | — | — | — | — | Total |
| `/perdas` | — | — | — | — | — | — | Total |
| `/test` | — | — | — | — | — | — | Total |
| Qualquer outra coleção/subcoleção | — | — | — | — | — | — | Total |

---

## 3. Arquitetura de Segurança (Resumo Estrutural)

A nova arquitetura (`scripts/audit/candidates/etapa33-reconstrucao/firestore.rules`) foi desenhada em **11 seções modulares**, `55` funções auxiliares, `34` blocos `match` e `147` operações explícitas protegidas:

1. **Default-Deny Global (`match /{document=**} { allow read, write: if false; }`):** Bloqueia qualquer coleção ou subcoleção não declarada explicitamente.
2. **Precedência de Atribuição Administrativa sobre Domínio:** A identidade efetiva deriva do documento `/users/{uid}` (combinado a `request.auth.token.email_verified == true`). Contas Gmail designadas como `SERVIDOR`/`ADMIN` com `approvalStatus == 'APROVADO'` têm acesso pleno compatível com o cargo; contas Gmail sem atribuição jamais recebem privilégios.
3. **Root Admin UID Pinning:** Somente `uid == 'hCG5mDgK1fRaTojULzlM7dXvb7n2'` + `email.lower() == 'paulocauan39@gmail.com'` + `email_verified == true` detém privilégio de Root Admin (gestão de outros `ADMIN`, alteração/proteção do próprio documento Root).
4. **Política Fail-Closed `isStandingActive(u)` (Etapa 10 / SEC-07 / Etapa 31):**
   - `active == false` -> bloqueia.
   - `blockExpiresAt` ou `suspendedUntil` presentes exigem tipo `timestamp` com `request.time >= valor` (valores `null`, string ou int bloqueiam de forma fail-closed).
   - `status` aceita apenas `'active'` (ou ausente legado) ou `'suspended'` com `suspendedUntil` expirado.
   - Reativação legítima remove os marcadores via `deleteField()` (`buildUserStatusTransitionData`).
5. **Blindagem Integral de `/users`:** Um único check `affectedKeys().hasAny([...])` protege todos os **16 campos sensíveis de controle/governança** (`role`, `admin`, `approvalStatus`, `status`, `active`, `roleAssignedBy`, `roleAssignedByName`, `roleAssignedAt`, `roleAssignmentActive`, `suspendedUntil`, `suspendedAt`, `suspendedBy`, `suspendedReason`, `blockExpiresAt`, `blockedAt`, `blockedBy`, `blockedReason`, `bannedAt`, `bannedBy`, `bannedReason`), fechando lacunas das regras antigas sem exceder o orçamento CEL do Firestore.
6. **Lote Atômico de Cadastro (`/items` + `/item_history` + `/item_private`):**
   - `/items`: exige `registeredByUserId == uid`, `registeredByRole` compatível com o cargo efetivo, bloqueio de campos privados/devolução na projeção pública e verificação rigorosa de `canRegisterItems()`.
   - `/item_private` (R-03): exige `registeredByUserId == uid` na criação inédita em lote, mantendo compatibilidade com `editItem` retroativo (criação por ADMIN/SERVIDOR apenas quando `/items/{itemId}` já existe e `incoming().registeredByUserId` coincide exatamente com o `registeredByUserId` real do item).
   - `/item_history`: exige `actorId == uid` e `actorRole` compatível com o cargo real; imutável (`update, delete: if false`).
7. **Consistência Case-Insensitive de E-mail (R-02):** Aplicada em `/activity_logs`, `/audit_logs`, `/error_logs`, `/support_tickets` e `/test_error_logs` via `matchesAuthEmailCaseInsensitive()`.

---

## 4. Relatório de Compatibilidade (Frontend, Backend Admin SDK e Cloud Functions)

| Camada / Componente | Status | Observação Técnica |
|---|---|---|
| **Frontend — Cadastro Atômico (`addItem`, `syncOfflineQueue`, `itemRegistrationPipeline.ts`)** | Compatível (100% validado no Emulator) | Lote `/items` + `/item_history` + `/item_private` validado para todos os 8 perfis institucionais (com/sem dados privados e campos opcionais). |
| **Frontend — Edição Retroativa (`editItem` em `AppContext.tsx:6118-6130`)** | Compatível | Regra de `/item_private` permite criação retroativa por Staff/Admin exclusivamente vinculada ao `registeredByUserId` real de `/items/{itemId}`. |
| **Frontend — Cadastro Administrativo de Usuário (`addUserByAdmin` em `AppContext.tsx:4976`)** | Compatível | ADMIN comum pode criar documentos `/users/{id}` para perfis gerenciáveis (`ALUNO`/`SERVIDOR`/`INTRUSO`), mantendo bloqueio de criação/promoção de `ADMIN`. |
| **Frontend — Reativação de Conta (`buildUserStatusTransitionData` em `accountStatusUtils.ts`)** | Compatível (validado no Emulator) | Remoção de `suspendedUntil`/`blockExpiresAt` via `deleteField()` restaura `isStandingActive(u)` imediatamente. |
| **Frontend — Devolução Formal & Assinatura Remota** | Compatível | Baixa (`DEVOLVIDO`/`ENCERRADO`) e reabertura continuam exclusivas de `/api/items/register-return`, `/api/items/reopen-return` e `/api/signature/*` via Admin SDK. |
| **Backend Admin SDK (`api/_lib/firebaseAdmin.ts` vs `server.ts`)** | Divergência pré-existente documentada (não relacionada às Rules) | Admin SDK ignora Security Rules por design. Entretanto, `server.ts:165-169,250` e `api/_lib/firebaseAdmin.ts:38-49` possuem precedência invertida de variáveis de `projectId` e fallback em `catch` para `(default)`. Recomenda-se alinhamento dedicado em etapa futura de backend. |
| **Cloud Functions (`functions/src/index.ts`)** | Divergência pré-existente documentada (fora do escopo das Rules) | `functions/src/index.ts` invoca `getFirestore()` sem `databaseId` (linhas 301, 696, 764) e registra triggers `onDocumentCreated("items/{itemId}")`/`onDocumentUpdated("items/{itemId}")` sem parâmetro `database`, mirando `(default)` em vez do banco nomeado `ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1`. |

---

## 5. Comparação Detalhada: Regras Antigas vs. Nova Arquitetura (Etapa 33)

| Dimensão | `firestore.rules` (Antiga — Preservada) | `scripts/audit/candidates/etapa33-reconstrucao/firestore.rules` (Nova) |
|---|---|---|
| **SHA-256** | `2f2a2ffc8c471d7fe97b5d1d2bb3c2a3ca27d39947be64449ad13a532c851f9e` | `45677cbd475e3f7d3cd451640d9aceec26795484c813606fda73ec4d11da330b` |
| **Tamanho / Linhas** | `57.716` bytes / `1.276` linhas | `55.592` bytes / `1.160` linhas (-116 linhas, mais limpa e modular) |
| **Funções Auxiliares** | `61` funções | `55` funções (menos duplicação, orçamento CEL otimizado) |
| **Blocos `match` / Coleções** | `30` blocos (`28` coleções) | `34` blocos (`32` coleções — 100% do inventário coberto) |
| **Operações Explícitas** | `137` operações em `115` diretivas | `147` operações em `99` diretivas |
| **Coleções Server-Only Explícitas** | Omitia `ai_audit_logs`, `analytics_events`, `perdas`, `test` (dependia apenas do fallback) | Todas as 4 declaradas explicitamente com `allow read, write: if false;` + documentação |
| **Proteção de Campos `/users` (Self-Update)** | Lacunas: não bloqueava alteração própria de `roleAssignedByName`, `roleAssignmentActive`, `active`, `blockedAt/By/Reason`, `suspendedAt/By/Reason`, `bannedAt/By/Reason` | Todos os 16 campos de governança/standing protegidos em expressão única |
| **Proteção do Root Admin contra ADMIN Comum** | ADMIN comum podia tentar editar/deletar documento do Root Admin (`uid == hCG5m...`) | Bloqueio explícito: somente Root Admin altera o documento Root; ADMIN comum não cria/promove `ADMIN` |
| **Anti-Spoofing `/item_private` (R-03)** | Não validava `registeredByUserId == request.auth.uid` na criação | Valida `registeredByUserId == request.auth.uid` na criação em lote + compatibilidade segura com `editItem` retroativo |
| **E-mail Case-Insensitive (R-02)** | Comparação case-sensitive em trilhas de auditoria/erro/suporte | `matchesAuthEmailCaseInsensitive()` aplicado em 5 coleções de trilha/suporte |
| **Guarda `isSignedIn()` em `/fcm_subscriptions`** | Validado via helper interno | Guarda explícita `isSignedIn() && request.auth.uid == userId` na própria regra |
| **Testes Reais no Cloud Firestore Emulator** | 155 testes (Etapa 31) | **165 testes reais (65 + 90 + 10 suítes Etapa 33): 165 aprovados, 0 falhas, 0 ignorados** |
