# LOCALIZA+ v1.10.13 — ETAPA 34: Auditoria Final de Publicação, Validação do Banco Nomeado e Preparação do Deploy

- **Classificação Final:** **`PRONTO, MAS AGUARDANDO AUTENTICAÇÃO`** *(após correção de caminho no artefato validado da Etapa 34 `scripts/audit/candidates/firebase.publish.etapa34.json` e atualização da matriz IAM real exigida pelo `firebase-tools@15.34.1`; nenhuma regra foi publicada em produção e nenhum arquivo da Etapa 33 ou `firestore.rules` raiz foi alterado).*
- **Projeto Firebase Alvo:** `gen-lang-client-0490390966`
- **Banco Firestore Alvo (Nomeado):** `ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1` (**NÃO `(default)`**)

---

## A. Integridade dos Arquivos (Recálculo Real de SHA-256)

| Arquivo | Status | Bytes | JSON Válido | SHA-256 Verificado |
|---|---|---|---|---|
| `scripts/audit/candidates/etapa33-reconstrucao/firestore.rules` | Íntegro (match exato Etapa 33) | `55.592` | N/A | `45677cbd475e3f7d3cd451640d9aceec26795484c813606fda73ec4d11da330b` |
| `firestore.rules` (raiz preservada) | Íntegro (match exato original) | `57.716` | N/A | `2f2a2ffc8c471d7fe97b5d1d2bb3c2a3ca27d39947be64449ad13a532c851f9e` |
| `firebase.json` (raiz) | Íntegro e funcional | `274` | `true` | `8a34cd0636fc97eb37dd3fdcab1fc3907b2bc5258fe6a989c77fd10f47dda5bf` |
| `.firebaserc` (raiz) | **Ausente** (esperado; usar `--project` ou promover candidato) | — | — | — |
| `firebase-applet-config.json` | Íntegro | `576` | `true` | `9fa51bd7c4547da5148c3ef1e106b38f21a02a09cb140226a8ecf3d7175805d7` |
| `scripts/audit/candidates/etapa33-reconstrucao/firebase.publish.json` | Preservado, porém **INCOMPATÍVEL com `--config`** (ver Seção C) | `320` | `true` | `7d075e02787877503c5fcd6b6d877743fe929d5abce444aad60d73caf7038931` |
| `scripts/audit/candidates/etapa33-reconstrucao/firebaserc.candidate.json` | Íntegro | `68` | `true` | `99474f380b2db3a4f14b80db7f6b66e7996308c6a6002f358d69ea8a118d9ad8` |
| `scripts/audit/candidates/etapa33-reconstrucao/PERMISSIONS_MATRIX.md` | Preservado (3 erratas documentais registradas abaixo) | `20.519` | N/A | `496ed0e38b02d408ea66ff16f67e313ef2a68fe602fe443031f3582df0ee06c0` |
| `scripts/audit/candidates/etapa33-reconstrucao/PUBLICATION_RUNBOOK.md` | Preservado (superado por esta auditoria Etapa 34) | `9.888` | N/A | `0413c735163ffcad839e90ebfe0a8bfd2e3d98645f075f3e3bfcf33630efe2c2` |
| `scripts/audit/candidates/firebase.publish.etapa34.json` | **Novo artefato corrigido e validado via `RulesDeploy.addFile`** | `303` | `true` | validado via `Config.load` + `RulesDeploy.addFile` |

---

## B. Identificação Inequívoca do Destino (Prova via Código do `firebase-tools@15.34.1`)

- **Project ID:** `gen-lang-client-0490390966`
- **Database ID:** `ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1` (**NÃO `(default)`**)
- **Como o `firebase-tools@15.34.1` associa o arquivo ao banco nomeado (verificado diretamente em `lib/firestore/fsConfig.js` e `lib/rulesDeploy.js`):**
  1. Tanto o objeto único (`#/definitions/FirestoreSingle` com `"database": "<id>"`) quanto o array (`"firestore": [{ "database": "<id>", "rules": "..." }]`) são oficialmente aceitos pelo schema do `firebase-tools@15.34.1`.
  2. `getFirestoreConfig()` lê `fsConfig.database` (`ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1`); somente recorre a `(default)` se a chave `"database"` estiver ausente.
  3. `RulesDeploy.createRulesets()` calcula `attachmentPoint = "firestore.googleapis.com/projects/${projectNumber}/databases/ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1"`.
  4. `RulesDeploy.release()` atualiza exclusivamente a release `projects/gen-lang-client-0490390966/releases/cloud.firestore/ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1`.
  5. **Risco de publicar em `(default)`:** **ZERO** quando utilizado `scripts/audit/candidates/firebase.publish.etapa34.json` (ou `firebase.json` da raiz), pois o campo `"database"` está explicitamente fixado para o banco nomeado e não existe entrada para `(default)`.
  6. **Atenção crítica ao log do CLI:** `lib/rulesDeploy.js:153` imprime `released rules <arquivo> to cloud.firestore` (exibindo `resourceName` e não `releaseName`), mesmo tendo publicado na release do banco nomeado. Logo, a confirmação pós-deploy **deve** ser feita consultando a API `firebaserules.googleapis.com/v1` (via `backup-and-rollback.sh verify-deploy`) ou o Firebase Console no banco nomeado.

---

## C. Achados Críticos na Configuração de Publicação da Etapa 33 e Correção Validada

### Achado 1 — Bug de Resolução Relativa em `scripts/audit/candidates/etapa33-reconstrucao/firebase.publish.json` e Restrição de `Config.path()`
Ao testar `Config.load({ configPath: "scripts/audit/candidates/etapa33-reconstrucao/firebase.publish.json" })` diretamente no motor do `firebase-tools@15.34.1`:
- `detectProjectRoot()` define `projectDir` como o **diretório do arquivo passado em `--config`** (`/app/applet/scripts/audit/candidates/etapa33-reconstrucao`).
- `Config.path()` (`lib/config.js:141`) **proíbe explicitamente caminhos com `..` fora de `projectDir`** (`is outside of project directory`).
- Como `firebase.publish.json` declarava `"rules": "scripts/audit/candidates/etapa33-reconstrucao/firestore.rules"`, o CLI resolveu o caminho duplicado:
  `/app/applet/scripts/audit/candidates/etapa33-reconstrucao/scripts/audit/candidates/etapa33-reconstrucao/firestore.rules` (**`resolvedExists: false`** — falharia em deploy real com `Error reading rules file`).
- **Correção entregue sem alterar a Etapa 33 e sem duplicar `firestore.rules`:** criado `scripts/audit/candidates/firebase.publish.etapa34.json` (no diretório pai `scripts/audit/candidates/`) com `"rules": "etapa33-reconstrucao/firestore.rules"`, validado empiricamente via `Config.load` + `getFirestoreConfig` + `RulesDeploy.addFile` -> carrega exatamente `/app/applet/scripts/audit/candidates/etapa33-reconstrucao/firestore.rules` com SHA-256 `45677cbd475e3f7d3cd451640d9aceec26795484c813606fda73ec4d11da330b` (`schemaValid: true`).

### Achado 2 — Sintaxe `--only firestore:rules` vs `--only firestore:rules:<databaseId>`
Verificado em `lib/deploy/firestore/prepare.js` e `lib/firestore/fsConfig.js` (`firebase-tools@15.34.1`):
- `--only firestore:rules` é a sintaxe exata para publicar **apenas regras** (define `context.firestoreRules = true` e `context.firestoreIndexes = false`).
- Passar `--only firestore:rules:<databaseId>` **não** é tratado corretamente pela versão `15.34.1` (`targets.includes("firestore:rules")` retorna `false` e `split(":")[1]` captura `"rules"`). Como o arquivo de configuração contém exclusivamente o banco nomeado (e não possui `"indexes"`), **`--only firestore:rules` publica exclusivamente as regras do banco nomeado**.

### Achado 3 — `firestore.indexes.json` Inexistente e Erratas Documentais da Etapa 33
- `firestore.indexes.json` não existe no repositório (e corretamente **não** está declarado em `firebase.json` nem em `scripts/audit/candidates/firebase.publish.etapa34.json`, evitando erro de leitura e garantindo que índices de produção não sejam alterados). O snippet de exemplo da Seção 4 de `PUBLICATION_RUNBOOK.md` citava `"indexes"` indevidamente.
- Erratas registradas em `PERMISSIONS_MATRIX.md` (sem alterar `firestore.rules`, que está 100% correto):
  1. `ALUNO` **não** pode criar documentos em `/items`, `/found_items`, `/lost_items` ou `/item_private` (`canCreateCatalogItem()` exige `SERVIDOR APROVADO` ou `ADMIN`, comprovado no Teste 03 da Etapa 33).
  2. `SERVIDOR Aprovado` **não** pode listar todos os documentos de `/users` (`allow list` em `/users` libera listagem ampla apenas para `ADMIN`; demais usuários ativos consultam apenas seu próprio e-mail).
  3. Os nomes reais dos campos de motivo protegidos em `/users` são `suspensionReason`, `blockReason` e `banReason` (16 campos de controle protegidos, coerentes com `accountStatusUtils.ts`).

---

## D. Autenticação e Permissões IAM Reais (Descoberta Crítica no `firebase-tools@15.34.1`)

### Estado Atual neste Ambiente (Sandbox Google AI Studio)
- **Firebase CLI:** `/usr/local/bin/firebase` — versão `15.34.1`
- **Conta autenticada (`firebase login:list`):** **Nenhuma** (`No authorized accounts`)
- **gcloud CLI:** Não instalado
- **Identidade de metadados do sandbox:** `ais-sandbox@ais-us-west2-911149a297404bbcb.iam.gserviceaccount.com` (projeto isolado `ais-us-west2-911149a297404bbcb` — **não** deve ser usada como credencial de proprietário; recebe `HTTP 403` no projeto `gen-lang-client-0490390966`).

### Permissões IAM Reais Exigidas pelo `firebase deploy --only firestore:rules`
Inspeção direta de `lib/commands/deploy.js`, `lib/deploy/index.js`, `lib/requirePermissions.js`, `lib/deploy/firestore/prepare.js` e `lib/rulesDeploy.js`:

1. **Pré-voo obrigatório (`requirePermissions` — executado mesmo com `--only firestore:rules`):**
   - `firebase.projects.get`
   - `datastore.indexes.list`, `datastore.indexes.create`, `datastore.indexes.update`, `datastore.indexes.delete`
2. **Execução das chamadas API (`prepare`, `createRulesets`, `release`):**
   - `serviceusage.services.get`
   - `datastore.databases.get`
   - `resourcemanager.projects.get`
   - `firebaserules.rulesets.test`, `firebaserules.rulesets.get`, `firebaserules.rulesets.create`
   - `firebaserules.releases.list`, `firebaserules.releases.get`, `firebaserules.releases.create`, `firebaserules.releases.update`

**Veredito sobre a lista da Etapa 33 (`roles/firebaserules.admin`, `roles/serviceusage.serviceUsageConsumer`, `roles/datastore.viewer`):**
**INSUFICIENTE para o Firebase CLI `15.34.1`**, pois faltam:
- `datastore.indexes.{create,update,delete}` -> exige adicionar **`roles/datastore.indexAdmin`**
- `firebase.projects.get` e `resourcemanager.projects.get` -> exige adicionar **`roles/firebase.viewer`**

**Conjunto mínimo suficiente (menor privilégio) para `firebase deploy --only firestore:rules`:**
- `roles/firebaserules.admin`
- `roles/datastore.indexAdmin`
- `roles/datastore.viewer`
- `roles/firebase.viewer`
- `roles/serviceusage.serviceUsageConsumer`

*(Alternativa única recomendada para o operador/proprietário no console Firebase/GCP: **`roles/firebase.developAdmin`** ou **`roles/firebase.admin`**.)*

---

## E. Backup Real e Rollback Seguro (Sem Depender de `git checkout HEAD`)

Implementado em `scripts/audit/candidates/etapa34-publicacao/backup-and-rollback.sh`:
1. **Backup pré-publicação (`./backup-and-rollback.sh backup`):**
   - Consulta `GET /v1/projects/gen-lang-client-0490390966/releases/cloud.firestore/ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1` e registra `originalRulesetName` e `updateTime`;
   - Captura também o estado prévio da release `(default)` (`cloud.firestore`) para comprovar não-interferência;
   - Baixa o conteúdo integral do ruleset publicado (`GET /v1/<originalRulesetName>`), salva `live-rules-backup.rules`, calcula SHA-256 e gera `backup-manifest.json`.
2. **Verificação pós-publicação (`./backup-and-rollback.sh verify-deploy 45677cbd475e3f7d3cd451640d9aceec26795484c813606fda73ec4d11da330b <BACKUP_DIR>`):**
   - Confirma via API que a release `cloud.firestore/ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1` possui exatamente o SHA-256 do candidato da Etapa 33;
   - Confirma que a release `(default)` permaneceu intacta.
3. **Rollback imediato (`./backup-and-rollback.sh rollback <BACKUP_DIR>`):**
   - Reaponta via `PATCH /v1/projects/gen-lang-client-0490390966/releases/cloud.firestore/ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1` exatamente para o `originalRulesetName` salvo no manifesto (independente do Git);
   - Reexecuta `verify-deploy` contra `backupSha256` para comprovar matematicamente a restauração no banco nomeado.

---

## F. Compatibilidade das Cloud Functions, `server.ts` e `api/_lib/firebaseAdmin.ts` com o Banco Nomeado

1. **Publicar as Security Rules resolve o bloqueio de autorização do Client SDK (como o cadastro de objetos via `writeBatch.commit()`), mas NÃO corrige as Cloud Functions!**
2. **Divergências confirmadas no código-fonte (`functions/src/index.ts`):**
   - Triggers sem parâmetro `database` (escutam `(default)`, **não** o banco nomeado):
     - `onItemCreated` (`items/{itemId}` — linha 525) e aliases `onNovoAchadoCreated`/`onNovaPerdaCreated`
     - `onNewFoundItemCreated` (`found_items/{itemId}` — linha 577)
     - `onNewLostItemCreated` (`lost_items/{itemId}` — linha 604)
     - `notifyNewLoss` (`perdas/{lossId}` — linha 631)
     - `onItemReturned` (`items/{itemId}` — linha 657)
   - Leituras/escritas com `getFirestore()` sem `databaseId` (gravam em `(default)`):
     - Linha 301 (`support_tickets`), linha 696 (`email_notifications` e `notifications` em `onItemReturned`), linha 764 (`email_notifications` em `sendItemReturnedEmail`).
   - **Impacto real:** Eventos gravados pelo frontend no banco nomeado **não disparam** os triggers de `functions/src/index.ts`, e o endpoint `sendItemReturnedEmail` grava logs de e-mail em `(default)` em vez do banco nomeado.
3. **Divergências confirmadas em `server.ts` vs `api/_lib/firebaseAdmin.ts`:**
   - Precedência invertida de `FIREBASE_PROJECT_ID` (`server.ts:165-168` prioriza env sobre `firebase-applet-config.json`; `api/_lib/firebaseAdmin.ts:38-41` prioriza `firebase-applet-config.json`).
   - `server.ts:249-250` não descarta `FIRESTORE_DATABASE_ID === "default"`, diferente de `api/_lib/firebaseAdmin.ts:46`.
   - Ambos possuem `catch` que faz fallback silencioso para `getFirestore(adminApp)` (`(default)`), o que mascara falhas de inicialização do banco nomeado.
4. **Recomendações separadas (NÃO executadas nesta etapa):**
   - Em `functions/src/index.ts`: migrar triggers para `onDocumentCreated({ document: "items/{itemId}", database: DATABASE_ID }, ...)` e `onDocumentUpdated({ document: "items/{itemId}", database: DATABASE_ID }, ...)` e substituir `getFirestore()` por `getFirestore(DATABASE_ID)`.
   - Unificar inicialização Admin SDK entre `server.ts` e `api/_lib/firebaseAdmin.ts` (remover fallback silencioso para `(default)` e padronizar precedência).

---

## G. Comandos Exatos Comprovados para Publicação (Apenas Após Autorização Expressa em Ambiente Autenticado)

```bash
# 0. Autenticar operador autorizado no projeto gen-lang-client-0490390966
firebase login
gcloud auth login

# 1. Backup real obrigatório da release atualmente em produção (banco nomeado)
BACKUP_DIR="./backups/firestore-rules-pre-etapa34-$(date -u +%Y%m%dT%H%M%SZ)"
bash scripts/audit/candidates/etapa34-publicacao/backup-and-rollback.sh backup "${BACKUP_DIR}"

# 2. Confirmar integridade SHA-256 do candidato Etapa 33 antes do deploy
sha256sum scripts/audit/candidates/etapa33-reconstrucao/firestore.rules
# Esperado: 45677cbd475e3f7d3cd451640d9aceec26795484c813606fda73ec4d11da330b

# 3. Publicar EXCLUSIVAMENTE as regras no banco nomeado usando configuração validada
#    (Opção A — sem alterar firestore.rules raiz previamente)
firebase deploy \
  --only firestore:rules \
  --config scripts/audit/candidates/firebase.publish.etapa34.json \
  --project gen-lang-client-0490390966

# 3 (Opção B — após promover oficialmente o candidato para a raiz firestore.rules)
# cp scripts/audit/candidates/etapa33-reconstrucao/firestore.rules firestore.rules
# cp scripts/audit/candidates/etapa33-reconstrucao/firebaserc.candidate.json .firebaserc
# firebase deploy --only firestore:rules --project gen-lang-client-0490390966

# 4. Confirmar release pós-publicação (SHA-256 no banco nomeado + não-interferência em default)
bash scripts/audit/candidates/etapa34-publicacao/backup-and-rollback.sh \
  verify-deploy 45677cbd475e3f7d3cd451640d9aceec26795484c813606fda73ec4d11da330b "${BACKUP_DIR}"

# 5. Em caso de anomalia — rollback imediato para a release original capturada
# bash scripts/audit/candidates/etapa34-publicacao/backup-and-rollback.sh rollback "${BACKUP_DIR}"
```
