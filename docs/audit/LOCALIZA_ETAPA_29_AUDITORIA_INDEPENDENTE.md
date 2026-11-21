# LOCALIZA+ v1.10.13 — Etapa 29: Auditoria Independente dos Candidatos da Etapa 28 e Verificação das Inconsistências Técnicas

- **Data/Hora UTC da Verificação:** 2026-11-20T14:50:07.014Z
- **Ambiente de Verificação:** Local, estático e sintético (Node.js v22.23.2)
- **Projeto Firebase de Referência (somente documental):** `gen-lang-client-0490390966`
- **Banco Firestore Nomeado de Referência (somente documental):** `ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1`
- **Coleção-Alvo de Referência (somente documental):** `/users`
- **SDKs Inspecionados Localmente (sem rede):** `firebase-admin@14.2.0`, `@google-cloud/firestore@8.7.1`, `google-auth-library@9.15.1`, `gcp-metadata@6.1.1`
- **Status de Autorização Externa:** **NENHUMA AUTORIZAÇÃO CONCEDIDA.** Esta etapa é estritamente estática, local e sintética. Nenhuma conexão ao Firebase/Firestore, autenticação ADC, impersonação, consulta IAM, leitura de `/users`, publicação de Rules, deploy, commit, push ou promoção de candidatos foi executada ou autorizada.

---

## 1. Resumo Executivo da Auditoria Independente

A revisão independente direta dos arquivos em disco e dos módulos instalados em `node_modules/` confirmou que:
1. Todos os **8 artefatos originais preservados** (5 da Etapa 21 + 3 da Etapa 27) e os **4 candidatos da Etapa 28** permanecem íntegros byte a byte, sem qualquer promoção para os caminhos originais.
2. A divergência de contagem de linhas de `firestore.rules` (**1.276** vs **1.275**) é **puramente metodológica** (`text.split("\n").length` contando o segmento vazio após o LF final vs. contagem POSIX `wc -l` de terminadores `0x0A`). O arquivo não foi alterado (57.716 bytes; SHA-256 `2f2a2ffc8c471d7fe97b5d1d2bb3c2a3ca27d39947be64449ad13a532c851f9e`).
3. A inspeção real dos pacotes instalados revelou **quatro lacunas técnicas concretas** na sonda candidata da Etapa 28 (`scripts/audit/candidates/etapa28/probe-readonly-v4.candidate.mjs`):
   - **Achado A29-01 (Médio):** Variável `NO_GCE_CHECK=true` exigida na Etapa 28 **não é lida** por `gcp-metadata@6.1.1` nem por `google-auth-library@9.15.1`. A variável real honrada pelo SDK é `METADATA_SERVER_DETECTION=none`, e ainda persistem os vetores `google_application_credentials` (minúsculo), `getGCPResidency()` (`K_SERVICE`, `CLOUD_RUN_JOB`, `FUNCTION_NAME`), `CLOUDSDK_CONFIG` e arquivo ADC well-known paralelo em `$HOME/.config/gcloud/application_default_credentials.json`.
   - **Achado A29-02 (Médio):** Ausência de validação física e estrutural completa do arquivo ADC antes de entregá-lo ao SDK: faltavam checagens de caminho absoluto, symlink em diretório pai (`realpathSync`), permissões de arquivo (`0600`/`0400`), chaves JSON duplicadas, allowlist estrita de chaves, campo `source_credentials.client_secret` (exigido pelo `firebase-admin@14.2.0`) e separação entre conta de origem e SA impersonada.
   - **Achado A29-03 (Médio/Documental):** A documentação da Etapa 28 afirmava que `select().limit(1)` não trafega dados de usuário, mas omitia que, em `@google-cloud/firestore@8.7.1`, `select()` sem argumentos gera `structuredQuery.select = { fields: [{ fieldPath: "__name__" }] }`, fazendo com que `document.name` (contendo **1 UID bruto real** em `users/<UID>`) e metadados `createTime`/`updateTime` trafeguem na rede e residam na memória do SDK (`snap.docs[0].id`), embora a sonda acesse somente `snap.size` e `snap.empty`.
   - **Achado A29-04 (Baixo/Médio):** Na sonda da Etapa 28, erros de importação dinâmica do `firebase-admin` não possuíam código estruturado dedicado, não havia prova automatizada da ordem cronológica de eventos antes do `import("firebase-admin/*")` e falhas em `deleteApp()` dentro do `finally` eram silenciadas por `catch {}`.
   - **Achado A29-05 (Governança IAM):** As 6 evidências administrativas externas listadas na Etapa 28 não definiam critérios binários objetivos de aceitação/rejeição (PASS/FAIL) nem cobriam explicitamente IAM Deny Policies, condições temporais e correlação OAuth/Cloud Audit entre operador humano e credencial de origem.
4. Todas as correções de código da Etapa 29 foram implementadas exclusivamente em novos candidatos isolados em `scripts/audit/candidates/etapa29/` (sem alterar nenhum dos 12 arquivos anteriores):
   - `scripts/audit/candidates/etapa29/probe-readonly-v4.etapa29.candidate.mjs`
   - `scripts/audit/candidates/etapa29/etapa29-audit.test.mjs`
5. Resultado dos testes locais/sintéticos em ambiente limpo (`env -i PATH="$PATH" METADATA_SERVER_DETECTION=none`):
   - **51/51** testes de regressão aprovados (15 Etapa 21 + 25 Etapa 27 + 11 Etapa 28);
   - **10/10** testes sintéticos executáveis da Etapa 29 aprovados + **1 teste explicitamente marcado `SKIP / NÃO EXECUTADO`** (`E29-11`, dependente de Firebase real, não simulado).

---

## 2. Inventário Completo e Verificação de Hashes (Método Único Padronizado)

### 2.1 Método Padronizado de Contagem de Linhas

A partir desta Etapa 29, adota-se **um único método padronizado** para contagem de linhas em todo o inventário:
- **Contagem POSIX (`wc -l`):** número exato de caracteres de quebra de linha LF (`0x0A`) no arquivo binário.
- Fórmula equivalente em Node.js: `buf.filter(b => b === 0x0a).length`.

### 2.2 Explicação Técnica da Divergência `firestore.rules` (1.276 vs 1.275)

Inspeção direta do arquivo `firestore.rules` em disco:
- **Tamanho exato:** `57.716` bytes
- **SHA-256:** `2f2a2ffc8c471d7fe97b5d1d2bb3c2a3ca27d39947be64449ad13a532c851f9e`
- **Terminadores CRLF (`0x0D 0x0A`):** `0`
- **Termina com LF (`0x0A`):** `true` (últimos 16 bytes em hex: `28 29 3b 0a 20 20 20 20 7d 0a 20 20 7d 0a 7d 0a`)
- **Contagem POSIX (`wc -l`):** **1.275 linhas** (1.275 ocorrências de `0x0A`).
- **Contagem via `text.split("\n").length`:** **1.276 elementos** (1.275 linhas + 1 string vazia `""` após o último `\n`).

**Conclusão:** O arquivo `firestore.rules` **jamais foi modificado**; seu SHA-256 e seu tamanho em bytes permanecem idênticos desde a Etapa 21. O mesmo deslocamento de `+1` entre `split("\n").length` e `wc -l` ocorre em todos os 14 arquivos listados abaixo, pois todos terminam com `0x0A` (LF).

### 2.3 Tabela Integral do Inventário (14 Arquivos)

| # | Grupo | Arquivo | Bytes | Linhas (POSIX `wc -l`) | CRLF | Termina LF | SHA-256 |
|---|---|---|---:|---:|---:|---|---|
| 1 | Original (Etapa 21) | `scripts/audit/audit-users-readonly.mjs` | 53723 | 1126 | 0 | Sim | `6dbe7c68c1fe56e71ca2130f0f4a6165aefad3f34b1e88fb943eb0a37729c00b` |
| 2 | Original (Etapa 21) | `scripts/audit/audit-users-readonly.test.mjs` | 47875 | 953 | 0 | Sim | `a1e3f2b7b28c63e8c4303bbfd903c90a27de4b9acaab6bd2e1d7c17f02c87879` |
| 3 | Original (Etapa 21) | `firestore.rules` | 57716 | 1275 | 0 | Sim | `2f2a2ffc8c471d7fe97b5d1d2bb3c2a3ca27d39947be64449ad13a532c851f9e` |
| 4 | Original (Etapa 21) | `package.json` | 1783 | 64 | 0 | Sim | `50d5c9494e06310b11ca9da58906049e5a0ee3f44e90b70d3ae18225722508a7` |
| 5 | Original (Etapa 21) | `package-lock.json` | 451206 | 15412 | 0 | Sim | `40f70133d9ab8306afde0619bf494cdaf7b6e22188770109b1fdcb84c7186f81` |
| 6 | Original (Etapa 27) | `scripts/audit/verify-approval-record.mjs` | 13129 | 317 | 0 | Sim | `4d36c2c75e5d5c56d7ca1799681e63549d51308ff3229177333f4c4e8b9d629f` |
| 7 | Original (Etapa 27) | `scripts/audit/validate-audit-summary.mjs` | 16943 | 416 | 0 | Sim | `595fce54acb7af0aeb722dcdbb5d98227e18e8df411eaa1ea0aaa6c2eae98a08` |
| 8 | Original (Etapa 27) | `scripts/audit/validate-audit-summary.test.mjs` | 22627 | 534 | 0 | Sim | `64de6fd574ac0a1b166d91ba5d50b1214bd652eba7184193f76db23030b14112` |
| 9 | Candidato Etapa 28 | `scripts/audit/candidates/etapa28/verify-approval-record.candidate.mjs` | 17050 | 426 | 0 | Sim | `1b33c2e41d62d668556ccf4dc9a59d97350eab77ce448b9b7e22b5a45dddc610` |
| 10 | Candidato Etapa 28 | `scripts/audit/candidates/etapa28/validate-audit-summary.candidate.mjs` | 19307 | 484 | 0 | Sim | `3aae9b5a7084b166d40c1c3839399607df23f036690330c1c08a72f6875171c5` |
| 11 | Candidato Etapa 28 | `scripts/audit/candidates/etapa28/probe-readonly-v4.candidate.mjs` | 17053 | 404 | 0 | Sim | `e2e3254c01877b1ef6bf3b21e8ee703ab0139c95859e1dfdd4b4135107eb90c9` |
| 12 | Candidato Etapa 28 | `scripts/audit/candidates/etapa28/etapa28-security.test.mjs` | 30363 | 789 | 0 | Sim | `ae55f54fda2f9347d0ad5a40eac3d2760fe5810ce8a83fdbc85aa83f3d634763` |
| 13 | Candidato Etapa 29 (Novo) | `scripts/audit/candidates/etapa29/probe-readonly-v4.etapa29.candidate.mjs` | 30014 | 688 | 0 | Sim | `4332d2673d65c1978abb064b505e900e96a8a3998b3fc94d94aa8f0ac61f5c9f` |
| 14 | Candidato Etapa 29 (Novo) | `scripts/audit/candidates/etapa29/etapa29-audit.test.mjs` | 22419 | 586 | 0 | Sim | `6bd2bef8f11a45e3d45741d3c94eb02fbffe29bd1ba2fa8d04b89f1aca321e61` |

**Confirmação de integridade:** Todos os 8 artefatos originais e todos os 4 candidatos da Etapa 28 mantêm hashes SHA-256 100% idênticos aos registrados anteriormente. Nenhum candidato foi promovido para os caminhos originais.

---

## 3. Auditoria de Execução de Módulos e Ordem Real de Imports

### 3.1 Análise da Sonda da Etapa 28 (`probe-readonly-v4.candidate.mjs`)

Inspeção direta das declarações estáticas no topo do arquivo da Etapa 28:
- Importa estaticamente apenas `node:fs`, `node:path`, `node:url` e o módulo local `./verify-approval-record.candidate.mjs` (zero imports estáticos de `firebase-admin/*`).
- `firebase-admin/app` e `firebase-admin/firestore` só eram importados via `await import(...)` após as barreiras de aprovação, ambiente, ADC e alvo.
- **Lacunas identificadas na Etapa 28:**
  1. Não havia teste automatizado provando a sequência cronológica completa de eventos antes do carregamento de `firebase-admin/*`.
  2. Uma falha no `await import("firebase-admin/...")` não era convertida em erro estruturado dedicado.
  3. Erros em `await deleteApp(firebaseApp)` dentro do bloco `finally` eram descartados silenciosamente por `catch {}`.

### 3.2 Correções na Sonda da Etapa 29 (`probe-readonly-v4.etapa29.candidate.mjs`)

- **Imports estáticos mínimos:** Apenas `node:fs`, `node:path` e `node:url` (verificado por regex estático em `E29-01`).
- **Sequência fail-closed com eventos verificáveis (`onEvent`):**
  1. **Etapa A:** Import dinâmico de `../etapa28/verify-approval-record.candidate.mjs` e validação Ed25519 + pin SHA-256 confiável + janela temporal + revogação.
  2. **Etapa B:** Validação do ambiente (`assertSafeProbeEnvironment`).
  3. **Etapa C:** Leitura física segura do arquivo ADC (`readControlledAdcFile`).
  4. **Etapa D:** Validação estrutural e semântica do JSON ADC (`validateImpersonatedAdcPayload`).
  5. **Etapa E:** Validação estrita do alvo (`validateProbeTarget`: projeto exato, banco nomeado != `(default)`, coleção `users`, `limit === 1`).
  6. **Etapa F (somente após A–E):** Import dinâmico de `firebase-admin/app` e `firebase-admin/firestore` com tratamento explícito (`FIREBASE_MODULE_LOAD_FAILED`), inicialização isolada, consulta `select().limit(1).get()` e encerramento obrigatório via `deleteApp()` sem mascaramento de erros (`FIREBASE_APP_CLEANUP_FAILED` / `cleanupErrorCode`).

---

## 4. Auditoria do Modelo ADC e Variáveis Reais dos SDKs Instalados

### 4.1 Evidência Direta nos Pacotes Instalados (`node_modules/`)

A leitura direta do código-fonte dos pacotes instalados em `node_modules/` comprovou quatro fatos críticos que não estavam cobertos na Etapa 28:

1. **`NO_GCE_CHECK=true` é ineficaz em `gcp-metadata@6.1.1`:**
   - Em `node_modules/gcp-metadata/build/src/index.js` (linhas 296–305), a função `isAvailable()` consulta exclusivamente `process.env.METADATA_SERVER_DETECTION` (valores reconhecidos: `"none"`, `"bios-only"`, `"ping-only"`). A variável legada `NO_GCE_CHECK` não é referenciada em lugar nenhum de `gcp-metadata@6.1.1` nem de `google-auth-library@9.15.1`.
   - Adicionalmente, em `node_modules/google-auth-library/build/src/auth/googleauth.js` (linha 297), o SDK verifica `gcpMetadata.getGCPResidency() || (await gcpMetadata.isAvailable())`. Em `node_modules/gcp-metadata/build/src/gcp-residency.js`, `getGCPResidency()` inspeciona `K_SERVICE`, `CLOUD_RUN_JOB`, `FUNCTION_NAME` e assinaturas DMI/MAC de hosts GCP.
2. **Variável minúscula `google_application_credentials` e fallback well-known:**
   - Em `googleauth.js` (linha 310), o SDK lê `process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.google_application_credentials`. A Etapa 28 não bloqueava a versão minúscula.
   - Em `googleauth.js` (linhas 331–355), na ausência ou desvio de configuração, há fallback para `$HOME/.config/gcloud/application_default_credentials.json` (ou `%APPDATA%\gcloud\application_default_credentials.json` e `CLOUDSDK_CONFIG`).
3. **Campo `source_credentials.client_secret` exigido por `firebase-admin@14.2.0`:**
   - Em `node_modules/firebase-admin/lib/app/credential-internal.js` (linhas 330–355), o parser de credencial `authorized_user` exige `client_id`, `client_secret` e `refresh_token` como strings não vazias. A Etapa 28 não validava `client_secret`.
4. **Hardening físico e sintático do arquivo ADC:**
   - A Etapa 29 passa a exigir antes de acionar o SDK: caminho absoluto, arquivo regular (rejeitando diretório/FIFO/socket/device), proibição de symlink direto (`lstatSync`) e em diretório pai (`realpathSync`), permissões sem bits de grupo/outros (`(mode & 0o077) === 0`, ex. `0600`/`0400`), detecção de chaves JSON duplicadas na string bruta, allowlist estrita de chaves na raiz e em `source_credentials`, e rejeição de `source_credentials.account` igual à SA impersonada ou pertencente a `*.gserviceaccount.com`.

### 4.2 Modelo ADC Inequívoco Definido na Etapa 29

- **Fonte única controlada:** `GOOGLE_APPLICATION_CREDENTIALS` (maiúsculo, caminho absoluto para arquivo regular `0600`/`0400`, fora de symlinks).
- **Bloqueio de metadata server:** `METADATA_SERVER_DETECTION=none` obrigatório (rejeita ausência mesmo se `NO_GCE_CHECK=true` estiver definida).
- **Variáveis explicitamente bloqueadas (20):** `FIREBASE_CONFIG`, `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `GCLOUD_PROJECT`, `GOOGLE_CLOUD_PROJECT`, `GCP_PROJECT`, `GOOGLE_CLOUD_QUOTA_PROJECT`, `GCE_METADATA_HOST`, `GCE_METADATA_ROOT`, `GCE_METADATA_IP`, `METADATA_SERVER_HOST`, `CLOUDSDK_CORE_PROJECT`, `CLOUDSDK_CONFIG`, `CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT`, `GOOGLE_API_USE_CLIENT_CERTIFICATE`, `NODE_TLS_REJECT_UNAUTHORIZED`, `K_SERVICE`, `CLOUD_RUN_JOB`, `FUNCTION_NAME`, `google_application_credentials`.
- **Bloqueio de paralelismo:** Conflito entre `PROBE_ADC_FILE` e `GOOGLE_APPLICATION_CREDENTIALS` ou presença de arquivo ADC well-known separado sob `$HOME/.config/gcloud` / `%APPDATA%\gcloud` resulta em rejeição imediata.
- **Limitação honesta preservada:** A validação local de `source_credentials` **não prova criptograficamente** a identidade humana real por trás do `refresh_token` OAuth; essa vinculação depende obrigatoriamente de evidência externa (`oauth2/tokeninfo` + Cloud Audit Logs IAM).

---

## 5. Análise em 4 Camadas de `db.collection("users").select().limit(1).get()`

### 5.1 Prova Empírica Offline no `@google-cloud/firestore@8.7.1`

Inspeção de `node_modules/@google-cloud/firestore/build/src/reference/query.js` (linhas 247–265) e execução offline de `.toProto()` (zero conexão de rede, comprovada também em `E29-10`):

```json
{
  "parent": "projects/gen-lang-client-0490390966/databases/ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1/documents",
  "structuredQuery": {
    "from": [
      {
        "collectionId": "users"
      }
    ],
    "limit": {
      "value": 1
    },
    "select": {
      "fields": [
        {
          "fieldPath": "__name__"
        }
      ]
    }
  }
}
```

Fica demonstrado que `select()` sem argumentos é **byte a byte equivalente** a `select(FieldPath.documentId())` e gera `structuredQuery.select = { fields: [{ fieldPath: "__name__" }] }` (ao passo que omitir `select()` deixa `structuredQuery.select === undefined`, solicitando todos os campos do documento).

### 5.2 Distinção Obrigatória em 4 Camadas

| Camada | O que efetivamente ocorre em `select().limit(1).get()` | Exposição de dados pessoais / identificadores |
|---|---|---|
| **1. Solicitado na requisição (wire gRPC)** | `RunQueryRequest` com `parent` do banco nomeado, `from: [{ collectionId: "users" }]`, `limit: { value: 1 }`, `select: { fields: [{ fieldPath: "__name__" }] }`. | **Nenhum campo de negócio** (`email`, `name`, `cpf`, `role`, `phone`, etc.) é solicitado. |
| **2. Recebido pelo SDK na rede/memória** | A resposta `RunQueryResponse` retorna `document.fields` vazio, **MAS inclui** `document.name` no formato `projects/.../databases/.../documents/users/<UID_BRUTO>` além de `createTime` e `updateTime` (disponíveis na memória do SDK em `snap.docs[0].id` e `snap.docs[0].ref.path`). | **Contém 1 UID bruto real na memória transitória do processo Node/SDK** durante a execução da sonda (não persistido em disco). A afirmação da Etapa 28 de que "zero dado de usuário trafega" era imprecisa e foi corrigida. |
| **3. Processado pelo código da sonda** | A sonda lê **exclusivamente** `snap.size` (inteiro) e `snap.empty` (booleano). Nunca acessa `snap.docs`, `doc.id`, `doc.ref` nem `doc.data()`. | **Zero** acesso a UID ou campos pela lógica da sonda. |
| **4. Emitido em `stdout` / `stderr` / relatório** | JSON contendo apenas metadados de controle, `wireProjectionField: "__name__"`, `documentsReturned`, `hasAtLeastOneDocument` e `sdkMemoryExposureNotice`. Em erro, apenas `probeVersion`, `status`, `errorCode` (e `cleanupErrorCode` se aplicável). | **Zero** UIDs, emails, nomes, caminhos locais, tokens ou segredos em `stdout`/`stderr` (comprovado em `E29-09`). |

*Observação transparente:* A verificação de bytes reais de resposta gRPC `RunQuery` no banco nomeado depende de conexão ao Firebase real, proibida nesta etapa; por isso o teste `E29-11` consta explicitamente como `SKIP / NÃO EXECUTADO`.

---

## 6. Revisão de IAM em 8 Camadas e Critérios Binários de Aceitação Externa

A Etapa 28 listou 6 evidências administrativas externas, mas sem critérios binários objetivos de aceitação/rejeição (PASS/FAIL) nem cobertura explícita de Deny Policies, condições temporais e correlação operador ↔ origem OAuth. Abaixo consolidam-se as **8 camadas de IAM** e os **8 critérios objetivos obrigatórios** (todos devem resultar em **PASS**; qualquer **FAIL** ou ausência bloqueia a execução externa):

| Camada IAM | Risco Auditado | Evidência Administrativa Externa Obrigatória | Critério Objetivo de Aceitação (**PASS**) | Critério de Rejeição (**FAIL**) |
|---|---|---|---|---|
| **1. Identidade do operador humano** | Operador não autorizado ou conta genérica/compartilhada | Registro nominal do operador no ticket/ata + saída de `gcloud auth list` na estação | Conta individual corporativa nominal coincidente com o ticket aprovado; nenhuma conta compartilhada ativa | Conta genérica, divergente do ticket ou múltiplas contas sem vínculo claro |
| **2. Credencial de origem (`authorized_user`)** | `refresh_token` OAuth pertencente a outro usuário ou a outra SA | Consulta administrativa de metadados do token de origem (`oauth2/tokeninfo`) + checagem local da sonda | `source_credentials.type === "authorized_user"`, zero chaves privadas estáticas, e-mail resolvido do token coincide 100% com o operador da Camada 1 | Token pertence a outro usuário, `client_secret` ausente, chave privada estática presente ou divergência de e-mail |
| **3. Conta de serviço impersonada (SA alvo)** | SA inexistente, desabilitada, com chaves estáticas ou de outro projeto | `gcloud iam service-accounts describe <SA>` + `gcloud iam service-accounts keys list --iam-account=<SA> --managed-by=user` | SA existe no projeto `gen-lang-client-0490390966`, `disabled: false`, **0 chaves gerenciadas pelo usuário** (`USER_MANAGED === 0`) e e-mail idêntico ao registro Ed25519 | SA em outro projeto, desabilitada, divergente do registro Ed25519 ou com >= 1 chave estática `USER_MANAGED` |
| **4. Permissão de impersonação na SA** | Amplo acesso de impersonação (`allUsers`, grupos largos, `roles/owner`) | `gcloud iam service-accounts get-iam-policy <SA> --format=json` | Somente o principal nominal do operador da Camada 1 possui `roles/iam.serviceAccountTokenCreator` com condição temporal ativa (janela <= janela do registro Ed25519) | Qualquer outro principal, grupo amplo, ausência de condição temporal ou papel mais amplo na policy da SA |
| **5. Permissões diretas da SA no projeto** | SA com escrita/admin no Firestore ou outros serviços | `gcloud projects get-iam-policy gen-lang-client-0490390966` filtrado para `serviceAccount:<SA>` | Apenas papel estritamente read-only de leitura Firestore (ex.: `roles/datastore.viewer` ou papel customizado contendo somente `datastore.entities.get` e `datastore.entities.list`) | Qualquer permissão de escrita (`create`, `update`, `delete`), `roles/editor`, `roles/owner`, `roles/firebase.admin` ou `roles/datastore.user` |
| **6. Permissões herdadas (Organização / Pastas)** | Escalonamento oculto herdado acima do projeto | `gcloud projects get-ancestors-iam-policy gen-lang-client-0490390966` filtrado para `serviceAccount:<SA>` e operador | **Zero** bindings adicionais para `serviceAccount:<SA>` em organização ou pastas ancestrais | Qualquer binding herdado concedendo permissões extras à SA (ou impossibilidade de consultar ancestrais sem justificativa documentada pelo admin GCP) |
| **7. Grupos e memberships indiretos** | SA ou operador recebendo privilégios via Google Groups | Consulta administrativa de membership da SA em grupos (`gcloud identity groups memberships search-transitive-groups` ou console Workspace/Cloud Identity) + policy IAM de grupos | SA pertence a **0 grupos** com bindings no projeto/ancestrais | SA pertence a qualquer grupo com binding IAM ou verificação omitida |
| **8. Papéis customizados, Deny Policies e Audit Logs** | Papel customizado escondendo escrita; política Deny inesperada; ausência de trilha de auditoria | `gcloud iam roles describe` (se houver papel customizado) + `gcloud iam policies list --attachment-point=... --kind=denypolicies` + confirmação de Data Access Audit Logs (`DATA_READ`) habilitados para Firestore e IAM Credentials | Se papel customizado: lista exata de `includedPermissions` contém somente leitura; Deny Policies inspecionadas; Audit Logs `DATA_READ` ativos para correlacionar `generateAccessToken` ao operador | Papel customizado contendo qualquer permissão de mutação/admin, ou Audit Logs desabilitados impedindo correlação |

---

## 7. Matriz Consolidada de Achados da Etapa 29

| ID | Gravidade | Arquivo(s) Auditado(s) | Achado Técnico Verificado | Ação / Status na Etapa 29 |
|---|---|---|---|---|
| **A29-00** | Informativo (Metodológico) | `firestore.rules` e inventário Etapa 28 | Divergência 1.276 vs 1.275 causada exclusivamente por `split("\n").length` vs `wc -l` (LF final). Hash SHA-256 inalterado. | **Resolvido:** Padronização única em POSIX `wc -l` documentada na Seção 2. |
| **A29-01** | **Média** | `etapa28/probe-readonly-v4.candidate.mjs` vs `gcp-metadata@6.1.1` / `google-auth-library@9.15.1` | `NO_GCE_CHECK=true` não é lida pelos SDKs instalados; `google_application_credentials` minúsculo, `K_SERVICE`/`CLOUD_RUN_JOB`/`FUNCTION_NAME`, `CLOUDSDK_CONFIG` e arquivo well-known sob `HOME` não eram bloqueados. | **Corrigido em candidato Etapa 29:** Exige `METADATA_SERVER_DETECTION=none`, bloqueia 20 env vars e bloqueia well-known paralelo (`E29-03`). |
| **A29-02** | **Média** | `etapa28/probe-readonly-v4.candidate.mjs` | Ausência de validação de caminho absoluto, symlink em diretório pai, permissões `0600`/`0400`, chaves JSON duplicadas, allowlist estrita de chaves, `client_secret` e separação conta de origem vs SA. | **Corrigido em candidato Etapa 29:** Implementado em `readControlledAdcFile` e `validateImpersonatedAdcPayload` (`E29-04`, `E29-05`, `E29-06`). |
| **A29-03** | **Média (Privacidade / Documentação)** | `etapa28/probe-readonly-v4.candidate.mjs` e Relatório Etapa 28 | Descrição incompleta de `select().limit(1)`: omitia que `fieldPath: "__name__"` retorna `document.name` com 1 UID bruto na memória do SDK. | **Corrigido:** Análise em 4 camadas com prova offline `.toProto()` (`E29-10`) + campos `wireProjectionField` e `sdkMemoryExposureNotice` na saída da sonda. |
| **A29-04** | **Baixa/Média** | `etapa28/probe-readonly-v4.candidate.mjs` | Falta de prova de ordem de eventos pré-Firebase, falta de código dedicado para falha de importação dinâmica e silenciamento de erros em `deleteApp()`. | **Corrigido em candidato Etapa 29:** Rastreamento `onEvent`, `FIREBASE_MODULE_LOAD_FAILED` e propagação de `FIREBASE_APP_CLEANUP_FAILED` / `cleanupErrorCode` (`E29-01`, `E29-02`, `E29-07`, `E29-08`). |
| **A29-05** | **Média (Governança IAM)** | Relatório Etapa 28 (evidências externas) | Critérios de aceitação PASS/FAIL não estavam formalizados por camada IAM (incluindo Deny Policies, condições temporais e correlação OAuth/Audit Logs). | **Corrigido documentalmente:** Matriz binária de 8 camadas na Seção 6. |

---

## 8. Execução Real das Suítes de Testes (Saídas Integrais Verbatim)

Todas as execuções abaixo ocorreram em ambiente limpo (`env -i PATH="$PATH" METADATA_SERVER_DETECTION=none`), com 100% de dados sintéticos/fictícios e zero acesso ao Firebase/Firestore.

### 8.1 Resumo Consolidado

| Suíte | Arquivo | Executados | Aprovados | Falhas | Skipped / Não Executados | Status |
|---|---|---:|---:|---:|---:|---|
| 1 (Regressão Etapa 21) | `scripts/audit/audit-users-readonly.test.mjs` | 15 | 15 | 0 | 0 | PASS |
| 2 (Regressão Etapa 27) | `scripts/audit/validate-audit-summary.test.mjs` | 25 | 25 | 0 | 0 | PASS |
| 3 (Regressão Etapa 28) | `scripts/audit/candidates/etapa28/etapa28-security.test.mjs` | 11 | 11 | 0 | 0 | PASS |
| 4 (Auditoria Etapa 29) | `scripts/audit/candidates/etapa29/etapa29-audit.test.mjs` | 10 | 10 | 0 | 1 (`E29-11`) | PASS (estático) + 1 SKIP (live) |
| **Total** | **4 suítes** | **61** | **61** | **0** | **1** | **61/61 executáveis PASS; 1 live NÃO EXECUTADO** |

### 8.2 Saída Integral — Suíte 1 (`audit-users-readonly.test.mjs`, 15 testes)

Comando: `env -i PATH="$PATH" METADATA_SERVER_DETECTION=none node --test scripts/audit/audit-users-readonly.test.mjs` (exit code: `0`)

```text
TAP version 13
# Subtest: Metadados identificam implementacao independente da Etapa 19 sem expor UID bruto
ok 1 - Metadados identificam implementacao independente da Etapa 19 sem expor UID bruto
  ---
  duration_ms: 1.053401
  type: 'test'
  ...
# Subtest: Root Admin: documento limpo, bloqueado com token Auth confirmado (divergencia Rules vs Frontend/Serverless) e sem role/aprovacao
ok 2 - Root Admin: documento limpo, bloqueado com token Auth confirmado (divergencia Rules vs Frontend/Serverless) e sem role/aprovacao
  ---
  duration_ms: 2.25189
  type: 'test'
  ...
# Subtest: Papeis nao-root: ADMIN (aprovado/pendente/sem approvalStatus), SERVIDOR (aprovado/pendente), ALUNO e INTRUSO
ok 3 - Papeis nao-root: ADMIN (aprovado/pendente/sem approvalStatus), SERVIDOR (aprovado/pendente), ALUNO e INTRUSO
  ---
  duration_ms: 1.028096
  type: 'test'
  ...
# Subtest: Suspensao indefinida (status suspended sem suspendedUntil) NUNCA e BLOQUEIO_INTENCIONAL_COMPATIVEL
ok 4 - Suspensao indefinida (status suspended sem suspendedUntil) NUNCA e BLOQUEIO_INTENCIONAL_COMPATIVEL
  ---
  duration_ms: 0.6828
  type: 'test'
  ...
# Subtest: Suspensao com prazo (futuro, expirado, null) e blockExpiresAt (ausente, null, futuro, expirado)
ok 5 - Suspensao com prazo (futuro, expirado, null) e blockExpiresAt (ausente, null, futuro, expirado)
  ---
  duration_ms: 0.526793
  type: 'test'
  ...
# Subtest: Precisao de nanossegundos (=, -1ns, +1ns mesmo ms, +1ms) e Epoch 0 / pre-1970
ok 6 - Precisao de nanossegundos (=, -1ns, +1ns mesmo ms, +1ms) e Epoch 0 / pre-1970
  ---
  duration_ms: 0.291874
  type: 'test'
  ...
# Subtest: Tipos temporais invalidos (ISO string, string vazia, numero, boolean, array, mapa plano, Date)
ok 7 - Tipos temporais invalidos (ISO string, string vazia, numero, boolean, array, mapa plano, Date)
  ---
  duration_ms: 0.59251
  type: 'test'
  ...
# Subtest: Campos status (ausente, null, vazio, inactive, desconhecido), active (ausente, null, false) e id !== docId
ok 8 - Campos status (ausente, null, vazio, inactive, desconhecido), active (ausente, null, false) e id !== docId
  ---
  duration_ms: 0.941569
  type: 'test'
  ...
# Subtest: Paginacao por cursor e agregador global A, B, C e D (vazia, erro, incompleta, cursor estagnado, duplicado, inesperada)
ok 9 - Paginacao por cursor e agregador global A, B, C e D (vazia, erro, incompleta, cursor estagnado, duplicado, inesperada)
  ---
  duration_ms: 3.20276
  type: 'test'
  ...
# Subtest: Zero vazamento de PII, UID bruto ou caminhos locais na saida serializada
ok 10 - Zero vazamento de PII, UID bruto ou caminhos locais na saida serializada
  ---
  duration_ms: 1.047818
  type: 'test'
  ...
# Subtest: Verificacao estatica: zero imports estaticos do Firebase e zero metodos de escrita no auditor
ok 11 - Verificacao estatica: zero imports estaticos do Firebase e zero metodos de escrita no auditor
  ---
  duration_ms: 9.645002
  type: 'test'
  ...
# Subtest: Etapa 21 Correcao 1: Identidade Root Admin em Rules vs Frontend (token valido, ausente, e-mail divergente/nao verificado, UID diferente, fallback doc.email)
ok 12 - Etapa 21 Correcao 1: Identidade Root Admin em Rules vs Frontend (token valido, ausente, e-mail divergente/nao verificado, UID diferente, fallback doc.email)
  ---
  duration_ms: 1.739771
  type: 'test'
  ...
# Subtest: Etapa 21 Correcao 2: Separacao estrita entre camada Rules e camada Frontend (mapa plano expirado e divergencia +1ns)
ok 13 - Etapa 21 Correcao 2: Separacao estrita entre camada Rules e camada Frontend (mapa plano expirado e divergencia +1ns)
  ---
  duration_ms: 0.262403
  type: 'test'
  ...
# Subtest: Etapa 21 Correcao 3: Modelagem fiel dos Branches 1, 2 e 3 de update em /users
ok 14 - Etapa 21 Correcao 3: Modelagem fiel dos Branches 1, 2 e 3 de update em /users
  ---
  duration_ms: 1.624849
  type: 'test'
  ...
# Subtest: Etapa 21 Correcao 4: Matriz de classificacao de mapa plano { seconds, nanoseconds }
ok 15 - Etapa 21 Correcao 4: Matriz de classificacao de mapa plano { seconds, nanoseconds }
  ---
  duration_ms: 0.386459
  type: 'test'
  ...
1..15
# tests 15
# suites 0
# pass 15
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 112.642688
```

### 8.3 Saída Integral — Suíte 2 (`validate-audit-summary.test.mjs`, 25 testes)

Comando: `env -i PATH="$PATH" METADATA_SERVER_DETECTION=none node --test scripts/audit/validate-audit-summary.test.mjs` (exit code: `0`)

```text
TAP version 13
# Subtest: 01. Relatorio valido com zero documentos (preserva veredito D EMPTY_COLLECTION e rejeita falso veredito A)
ok 1 - 01. Relatorio valido com zero documentos (preserva veredito D EMPTY_COLLECTION e rejeita falso veredito A)
  ---
  duration_ms: 108.118145
  type: 'test'
  ...
# Subtest: 02. Relatorio valido com documentos de todas as 5 classificacoes
ok 2 - 02. Relatorio valido com documentos de todas as 5 classificacoes
  ---
  duration_ms: 44.930979
  type: 'test'
  ...
# Subtest: 03. Contagem divergente (soma diferente de totalRead e divergencia frente a recontagem de results)
ok 3 - 03. Contagem divergente (soma diferente de totalRead e divergencia frente a recontagem de results)
  ---
  duration_ms: 106.710162
  type: 'test'
  ...
# Subtest: 04. Resultado individual ausente (results.length menor que pagination.totalRead)
ok 4 - 04. Resultado individual ausente (results.length menor que pagination.totalRead)
  ---
  duration_ms: 61.711807
  type: 'test'
  ...
# Subtest: 05. Resultado individual duplicado (maskedUid duplicado em results e duplicateDocIdsCount > 0)
ok 5 - 05. Resultado individual duplicado (maskedUid duplicado em results e duplicateDocIdsCount > 0)
  ---
  duration_ms: 92.478345
  type: 'test'
  ...
# Subtest: 06. Paginacao incompleta (pagination.completed === false)
ok 6 - 06. Paginacao incompleta (pagination.completed === false)
  ---
  duration_ms: 47.313945
  type: 'test'
  ...
# Subtest: 07. Erro de leitura (pagination.readError preenchido)
ok 7 - 07. Erro de leitura (pagination.readError preenchido)
  ---
  duration_ms: 50.999463
  type: 'test'
  ...
# Subtest: 08. Cursor estagnado (pagination.stagnantCursorDetected === true)
ok 8 - 08. Cursor estagnado (pagination.stagnantCursorDetected === true)
  ---
  duration_ms: 49.503238
  type: 'test'
  ...
# Subtest: 09. Classificacao desconhecida em results e em counts
ok 9 - 09. Classificacao desconhecida em results e em counts
  ---
  duration_ms: 84.807967
  type: 'test'
  ...
# Subtest: 10. Campo inesperado na raiz
ok 10 - 10. Campo inesperado na raiz
  ---
  duration_ms: 55.655572
  type: 'test'
  ...
# Subtest: 11. Campo inesperado em objeto aninhado (metadata e pagination)
ok 11 - 11. Campo inesperado em objeto aninhado (metadata e pagination)
  ---
  duration_ms: 96.517073
  type: 'test'
  ...
# Subtest: 12. Campo obrigatorio ausente
ok 12 - 12. Campo obrigatorio ausente
  ---
  duration_ms: 44.443323
  type: 'test'
  ...
# Subtest: 13. Tipo incorreto em campos numericos e booleanos
ok 13 - 13. Tipo incorreto em campos numericos e booleanos
  ---
  duration_ms: 90.294809
  type: 'test'
  ...
# Subtest: 14. SHA-256 invalido ou divergente
ok 14 - 14. SHA-256 invalido ou divergente
  ---
  duration_ms: 51.309956
  type: 'test'
  ...
# Subtest: 15. Commit invalido ou divergente
ok 15 - 15. Commit invalido ou divergente
  ---
  duration_ms: 53.577286
  type: 'test'
  ...
# Subtest: 16. Veredito divergente do codigo e das contagens
ok 16 - 16. Veredito divergente do codigo e das contagens
  ---
  duration_ms: 100.631502
  type: 'test'
  ...
# Subtest: 17. Resultado inconclusivo (verdictCode D com documentos lidos)
ok 17 - 17. Resultado inconclusivo (verdictCode D com documentos lidos)
  ---
  duration_ms: 59.067276
  type: 'test'
  ...
# Subtest: 18. unexpectedClassificationsCount diferente de zero
ok 18 - 18. unexpectedClassificationsCount diferente de zero
  ---
  duration_ms: 43.97504
  type: 'test'
  ...
# Subtest: 19. inconclusiveReasons nao vazio em relatorio nao vazio
ok 19 - 19. inconclusiveReasons nao vazio em relatorio nao vazio
  ---
  duration_ms: 58.858994
  type: 'test'
  ...
# Subtest: 20. Registro de aprovacao adulterado apos assinatura Ed25519
ok 20 - 20. Registro de aprovacao adulterado apos assinatura Ed25519
  ---
  duration_ms: 110.410195
  type: 'test'
  ...
# Subtest: 21. Assinatura digital invalida
ok 21 - 21. Assinatura digital invalida
  ---
  duration_ms: 56.163324
  type: 'test'
  ...
# Subtest: 22. Chave publica nao confiavel (assinatura propria de atacante sem pin confiavel)
ok 22 - 22. Chave publica nao confiavel (assinatura propria de atacante sem pin confiavel)
  ---
  duration_ms: 61.889293
  type: 'test'
  ...
# Subtest: 23. Registro administrativo expirado e registro revogado
ok 23 - 23. Registro administrativo expirado e registro revogado
  ---
  duration_ms: 108.775025
  type: 'test'
  ...
# Subtest: 24. Conta de servico diferente da aprovada no registro assinado
ok 24 - 24. Conta de servico diferente da aprovada no registro assinado
  ---
  duration_ms: 61.823924
  type: 'test'
  ...
# Subtest: 25. Tentativa de inserir dados individuais no resumo final e verificacao de stderr nao vazio
ok 25 - 25. Tentativa de inserir dados individuais no resumo final e verificacao de stderr nao vazio
  ---
  duration_ms: 52.455531
  type: 'test'
  ...
1..25
# tests 25
# suites 0
# pass 25
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1861.281957
```

### 8.4 Saída Integral — Suíte 3 (`etapa28-security.test.mjs`, 11 testes)

Comando: `env -i PATH="$PATH" METADATA_SERVER_DETECTION=none node --test scripts/audit/candidates/etapa28/etapa28-security.test.mjs` (exit code: `0`)

```text
TAP version 13
# Subtest: E28-01. Fingerprint alterado junto com chave publica substituida (rejeicao contra ancora confiavel independente)
ok 1 - E28-01. Fingerprint alterado junto com chave publica substituida (rejeicao contra ancora confiavel independente)
  ---
  duration_ms: 8.119527
  type: 'test'
  ...
# Subtest: E28-02. Registro assinado com finalidade (purpose) ou escopo (scope) incorreto
ok 2 - E28-02. Registro assinado com finalidade (purpose) ou escopo (scope) incorreto
  ---
  duration_ms: 2.433756
  type: 'test'
  ...
# Subtest: E28-03. Registro com datas invalidas (calendario inexistente, formato invalido, janela > 7d, inversao e referenceTime invalido)
ok 3 - E28-03. Registro com datas invalidas (calendario inexistente, formato invalido, janela > 7d, inversao e referenceTime invalido)
  ---
  duration_ms: 3.730939
  type: 'test'
  ...
# Subtest: E28-04. Registro com campos adicionais, ausentes ou chaves JSON duplicadas
ok 4 - E28-04. Registro com campos adicionais, ausentes ou chaves JSON duplicadas
  ---
  duration_ms: 3.32053
  type: 'test'
  ...
# Subtest: E28-05. URL de impersonacao com hostname, porta, protocolo, caminho ou parametros indevidos
ok 5 - E28-05. URL de impersonacao com hostname, porta, protocolo, caminho ou parametros indevidos
  ---
  duration_ms: 1.183217
  type: 'test'
  ...
# Subtest: E28-06. ADC com identidade de origem inesperada, chave privada estatica, delegates ou quota_project divergente
ok 6 - E28-06. ADC com identidade de origem inesperada, chave privada estatica, delegates ou quota_project divergente
  ---
  duration_ms: 0.445611
  type: 'test'
  ...
# Subtest: E28-07. Conta de servico com identificador divergente no registro, na URL ADC e no dominio do projeto
ok 7 - E28-07. Conta de servico com identificador divergente no registro, na URL ADC e no dominio do projeto
  ---
  duration_ms: 1.551694
  type: 'test'
  ...
# Subtest: E28-08. Resumo que omite resultados individuais (results ausente, truncado ou vazio para totalRead > 0)
ok 8 - E28-08. Resumo que omite resultados individuais (results ausente, truncado ou vazio para totalRead > 0)
  ---
  duration_ms: 1.193873
  type: 'test'
  ...
# Subtest: E28-09. Resumo com contagens manipuladas e incoerencia matematica de paginacao
ok 9 - E28-09. Resumo com contagens manipuladas e incoerencia matematica de paginacao
  ---
  duration_ms: 2.07637
  type: 'test'
  ...
# Subtest: E28-10. Falha de escrita e permissoes inadequadas no arquivo final (0644 pre-existente, symlink, diretorio, pos-escrita)
ok 10 - E28-10. Falha de escrita e permissoes inadequadas no arquivo final (0644 pre-existente, symlink, diretorio, pos-escrita)
  ---
  duration_ms: 56.132114
  type: 'test'
  ...
# Subtest: E28-11. Sonda probe-readonly-v4: bloqueio de env vars, (default), limit!=1, ordem fail-closed e verificacao estatica integral
ok 11 - E28-11. Sonda probe-readonly-v4: bloqueio de env vars, (default), limit!=1, ordem fail-closed e verificacao estatica integral
  ---
  duration_ms: 108.297488
  type: 'test'
  ...
1..11
# tests 11
# suites 0
# pass 11
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 284.901833
```

### 8.5 Saída Integral — Suíte 4 (`etapa29-audit.test.mjs`, 10 aprovados + 1 SKIP)

Comando: `env -i PATH="$PATH" METADATA_SERVER_DETECTION=none node --test scripts/audit/candidates/etapa29/etapa29-audit.test.mjs` (exit code: `0`)

```text
TAP version 13
# Subtest: E29-01. Ordem efetiva de execucao dos imports e eventos (zero import estatico Firebase; eventos em sequencia estrita)
ok 1 - E29-01. Ordem efetiva de execucao dos imports e eventos (zero import estatico Firebase; eventos em sequencia estrita)
  ---
  duration_ms: 15.226017
  type: 'test'
  ...
# Subtest: E29-02. Tentativa de inicializacao do Firebase antes da aprovacao (bloqueio total antes de import ou initializeApp)
ok 2 - E29-02. Tentativa de inicializacao do Firebase antes da aprovacao (bloqueio total antes de import ou initializeApp)
  ---
  duration_ms: 4.042571
  type: 'test'
  ...
# Subtest: E29-03. Variaveis ADC conflitantes, METADATA_SERVER_DETECTION ausente/invalido e well-known ADC paralelo
ok 3 - E29-03. Variaveis ADC conflitantes, METADATA_SERVER_DETECTION ausente/invalido e well-known ADC paralelo
  ---
  duration_ms: 1.830072
  type: 'test'
  ...
# Subtest: E29-04. Arquivo ADC com symlink direto, symlink em diretorio pai, diretorio e caminho relativo
ok 4 - E29-04. Arquivo ADC com symlink direto, symlink em diretorio pai, diretorio e caminho relativo
  ---
  duration_ms: 1.763336
  type: 'test'
  ...
# Subtest: E29-05. Arquivo ADC com permissoes inadequadas (0644, 0640, 0604 rejeitados; 0600 aceito)
ok 5 - E29-05. Arquivo ADC com permissoes inadequadas (0644, 0640, 0604 rejeitados; 0600 aceito)
  ---
  duration_ms: 1.229255
  type: 'test'
  ...
# Subtest: E29-06. Divergencia entre identidade de origem e conta impersonada, campos inesperados e chaves duplicadas no ADC
ok 6 - E29-06. Divergencia entre identidade de origem e conta impersonada, campos inesperados e chaves duplicadas no ADC
  ---
  duration_ms: 1.176351
  type: 'test'
  ...
# Subtest: E29-07. Importacao dinamica e falha durante carregamento dos modulos Firebase Admin
ok 7 - E29-07. Importacao dinamica e falha durante carregamento dos modulos Firebase Admin
  ---
  duration_ms: 3.298986
  type: 'test'
  ...
# Subtest: E29-08. Erro de encerramento da instancia Firebase Admin (deleteApp) nao e mascarado
ok 8 - E29-08. Erro de encerramento da instancia Firebase Admin (deleteApp) nao e mascarado
  ---
  duration_ms: 5.538173
  type: 'test'
  ...
# Subtest: E29-09. Ausencia total de dados individuais em stdout e stderr (sucesso e falha)
ok 9 - E29-09. Ausencia total de dados individuais em stdout e stderr (sucesso e falha)
  ---
  duration_ms: 69.443725
  type: 'test'
  ...
# Subtest: E29-10. Comportamento exato de select() sem argumentos no @google-cloud/firestore@8.7.1 (offline, zero rede)
ok 10 - E29-10. Comportamento exato de select() sem argumentos no @google-cloud/firestore@8.7.1 (offline, zero rede)
  ---
  duration_ms: 304.575021
  type: 'test'
  ...
# Subtest: E29-11. [NAO EXECUTADO - DEPENDE DE FIREBASE REAL] Verificacao de bytes gRPC RunQuery reais no banco nomeado
ok 11 - E29-11. [NAO EXECUTADO - DEPENDE DE FIREBASE REAL] Verificacao de bytes gRPC RunQuery reais no banco nomeado # SKIP NAO EXECUTADO: Conexao ao Firebase/Firestore proibida na Etapa 29 (aprovacao exclusivamente estatica)
  ---
  duration_ms: 0.172726
  type: 'test'
  ...
1..11
# tests 11
# suites 0
# pass 10
# fail 0
# cancelled 0
# skipped 1
# todo 0
# duration_ms 509.423617
```

---

## 9. Código-Fonte Integral dos Novos Candidatos da Etapa 29 (Não Truncado)

### 9.1 `scripts/audit/candidates/etapa29/probe-readonly-v4.etapa29.candidate.mjs` (688 linhas POSIX, 30.014 bytes)

SHA-256: `4332d2673d65c1978abb064b505e900e96a8a3998b3fc94d94aa8f0ac61f5c9f`

```javascript
  1 | #!/usr/bin/env node
  2 | /**
  3 |  * LOCALIZA+ v1.10.13 — Etapa 29 (Copia Candidata Independente)
  4 |  * Sonda read-only `probe-readonly-v4` endurecida apos auditoria independente da Etapa 29.
  5 |  *
  6 |  * Correcoes implementadas sobre `scripts/audit/candidates/etapa28/probe-readonly-v4.candidate.mjs`:
  7 |  * - P29-1: Zero imports estaticos de modulos externos ou de terceiros (apenas `node:fs`, `node:path`, `node:url`);
  8 |  *          carregamento dinamico do verificador Ed25519 na Etapa A e de `firebase-admin/*` somente na Etapa F
  9 |  *          apos aprovacao de todas as barreiras fail-closed, com tratamento explicito de falha de importacao
 10 |  *          (`FIREBASE_MODULE_LOAD_FAILED`) e rastreamento opcional de ordem de eventos.
 11 |  * - P29-2: Modelo ADC inequivoco:
 12 |  *          - Exige `METADATA_SERVER_DETECTION=none` (variavel efetivamente lida por `gcp-metadata@6.1.1` / `google-auth-library@9.15.1`),
 13 |  *            em vez de depender da variavel legada `NO_GCE_CHECK`;
 14 |  *          - Bloqueia 20 variaveis de redirecionamento/conflito incluindo `google_application_credentials` (minusculo),
 15 |  *            `CLOUDSDK_CONFIG`, `K_SERVICE`, `CLOUD_RUN_JOB`, `FUNCTION_NAME`;
 16 |  *          - Define `GOOGLE_APPLICATION_CREDENTIALS` (maiusculo, caminho absoluto) como fonte unica controlada;
 17 |  *            rejeita conflito com `PROBE_ADC_FILE` e rejeita existencia de ADC well-known sob `$HOME/.config/gcloud` / `%APPDATA%\gcloud`;
 18 |  *          - Valida em disco antes de entregar ao SDK: caminho absoluto, nao-symlink direto nem em diretorio pai (`realpathSync`),
 19 |  *            arquivo regular (rejeita FIFO/socket/device/diretorio) e permissoes estritas sem bits de grupo/outros (`(mode & 0o077) === 0`);
 20 |  *          - Valida no JSON ADC: deteccao de chaves duplicadas (raiz e `source_credentials`), allowlist estrita em ambos os niveis,
 21 |  *            validacao de `source_credentials.client_secret` (exigido pelo `firebase-admin@14.2.0`), rejeicao de conta de origem
 22 |  *            `.gserviceaccount.com` ou igual a SA impersonada.
 23 |  * - P29-3: Documentacao e saida tecnicamente exatas sobre `db.collection("users").select().limit(1).get()`:
 24 |  *          No `@google-cloud/firestore@8.7.1`, `select()` sem argumentos solicita `projection: { fields: [{ fieldPath: "__name__" }] }`.
 25 |  *          Nenhum campo de negocio do documento e solicitado, MAS o `document.name` (contendo o UID bruto de ate 1 documento)
 26 |  *          trafega pela rede e existe na memoria do SDK (`snap.docs[0].id`), sendo nao acessado e nao impresso pela sonda.
 27 |  * - P29-4: Erro de encerramento (`deleteApp`) no `finally` NAO e mais silenciado: falha apos consulta bem-sucedida gera
 28 |  *          `FIREBASE_APP_CLEANUP_FAILED`; falha apos erro principal anexa `cleanupErrorCode` sem mascarar a causa raiz.
 29 |  *
 30 |  * AVISO: Sem `--execute-probe-readonly`, o script NAO conecta ao Firebase, NAO le ADC e NAO emite tokens.
 31 |  */
 32 | 
 33 | import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
 34 | import { isAbsolute, join, resolve } from "node:path";
 35 | import { pathToFileURL } from "node:url";
 36 | 
 37 | export const PROBE_VERSION = "probe-readonly-v4-etapa29-candidate";
 38 | export const EXPECTED_PROJECT_ID = "gen-lang-client-0490390966";
 39 | export const EXPECTED_DATABASE_ID = "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1";
 40 | export const EXPECTED_COLLECTION_NAME = "users";
 41 | export const PROBE_LIMIT = 1;
 42 | export const FORBIDDEN_DEFAULT_DATABASE_ID = "(default)";
 43 | 
 44 | export const BLOCKED_ENV_VARS = Object.freeze([
 45 |   "FIREBASE_CONFIG",
 46 |   "FIRESTORE_EMULATOR_HOST",
 47 |   "FIREBASE_AUTH_EMULATOR_HOST",
 48 |   "GCLOUD_PROJECT",
 49 |   "GOOGLE_CLOUD_PROJECT",
 50 |   "GCP_PROJECT",
 51 |   "GOOGLE_CLOUD_QUOTA_PROJECT",
 52 |   "GCE_METADATA_HOST",
 53 |   "GCE_METADATA_ROOT",
 54 |   "GCE_METADATA_IP",
 55 |   "METADATA_SERVER_HOST",
 56 |   "CLOUDSDK_CORE_PROJECT",
 57 |   "CLOUDSDK_CONFIG",
 58 |   "CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT",
 59 |   "GOOGLE_API_USE_CLIENT_CERTIFICATE",
 60 |   "NODE_TLS_REJECT_UNAUTHORIZED",
 61 |   "K_SERVICE",
 62 |   "CLOUD_RUN_JOB",
 63 |   "FUNCTION_NAME",
 64 |   "google_application_credentials",
 65 | ]);
 66 | 
 67 | export const ADC_TOP_LEVEL_ALLOWED_KEYS = Object.freeze([
 68 |   "type",
 69 |   "service_account_impersonation_url",
 70 |   "source_credentials",
 71 |   "delegates",
 72 |   "quota_project_id",
 73 |   "universe_domain",
 74 | ]);
 75 | 
 76 | export const ADC_SOURCE_ALLOWED_KEYS = Object.freeze([
 77 |   "type",
 78 |   "client_id",
 79 |   "client_secret",
 80 |   "refresh_token",
 81 |   "quota_project_id",
 82 |   "universe_domain",
 83 |   "account",
 84 | ]);
 85 | 
 86 | const SERVICE_ACCOUNT_RE = /^[a-z][a-z0-9-]{4,28}[a-z0-9]@gen-lang-client-0490390966\.iam\.gserviceaccount\.com$/;
 87 | const IMPERSONATION_PATH_RE =
 88 |   /^\/v1\/projects\/-\/serviceAccounts\/([a-z][a-z0-9-]{4,28}[a-z0-9]@gen-lang-client-0490390966\.iam\.gserviceaccount\.com):generateAccessToken$/;
 89 | const ANY_SERVICE_ACCOUNT_DOMAIN_RE = /\.gserviceaccount\.com$/i;
 90 | 
 91 | function makeError(code, message, extra = {}) {
 92 |   return Object.assign(new Error(message), { code, ...extra });
 93 | }
 94 | 
 95 | /**
 96 |  * Detecta chaves duplicadas em qualquer nivel de objeto JSON na string bruta
 97 |  * antes que `JSON.parse` sobrescreva silenciosamente entradas anteriores.
 98 |  */
 99 | export function assertNoDuplicateJsonKeys(jsonText) {
100 |   if (typeof jsonText !== "string") {
101 |     throw makeError("INVALID_ADC_JSON", "JSON text must be a string");
102 |   }
103 |   const len = jsonText.length;
104 |   let i = 0;
105 | 
106 |   const readString = () => {
107 |     const start = i;
108 |     i += 1;
109 |     while (i < len) {
110 |       const ch = jsonText[i];
111 |       if (ch === "\\") {
112 |         i += 2;
113 |         continue;
114 |       }
115 |       if (ch === '"') {
116 |         i += 1;
117 |         return JSON.parse(jsonText.slice(start, i));
118 |       }
119 |       i += 1;
120 |     }
121 |     throw makeError("INVALID_ADC_JSON", "Unterminated JSON string");
122 |   };
123 | 
124 |   const stack = [];
125 |   while (i < len) {
126 |     const ch = jsonText[i];
127 |     if (ch === '"') {
128 |       const strVal = readString();
129 |       const top = stack[stack.length - 1];
130 |       if (top && top.kind === "object" && top.expectingKey) {
131 |         if (top.keys.has(strVal)) {
132 |           throw makeError("ADC_DUPLICATE_JSON_KEY", `Duplicate JSON key detected in ADC: ${strVal}`);
133 |         }
134 |         top.keys.add(strVal);
135 |         top.expectingKey = false;
136 |       }
137 |       continue;
138 |     }
139 |     if (ch === "{") {
140 |       stack.push({ kind: "object", keys: new Set(), expectingKey: true });
141 |     } else if (ch === "[") {
142 |       stack.push({ kind: "array" });
143 |     } else if (ch === "}" || ch === "]") {
144 |       stack.pop();
145 |     } else if (ch === ",") {
146 |       const top = stack[stack.length - 1];
147 |       if (top && top.kind === "object") {
148 |         top.expectingKey = true;
149 |       }
150 |     }
151 |     i += 1;
152 |   }
153 | }
154 | 
155 | /**
156 |  * 1. Valida o ambiente de execucao da sonda de forma inequivoca:
157 |  *    - Bloqueia variaveis de redirecionamento, emuladores, serverless e `google_application_credentials` minusculo;
158 |  *    - Exige `METADATA_SERVER_DETECTION=none` (efetivamente honrado por `gcp-metadata@6.1.1`);
159 |  *    - Exige `GOOGLE_APPLICATION_CREDENTIALS` (maiusculo) como caminho absoluto unico;
160 |  *    - Rejeita conflito com `PROBE_ADC_FILE` e bloqueia presenca de arquivo ADC well-known em HOME/APPDATA.
161 |  */
162 | export function assertSafeProbeEnvironment(env = process.env) {
163 |   if (!env || typeof env !== "object") {
164 |     throw makeError("INVALID_ENVIRONMENT", "Environment map is invalid");
165 |   }
166 | 
167 |   for (const key of BLOCKED_ENV_VARS) {
168 |     const val = env[key];
169 |     if (typeof val === "string" && val.trim().length > 0) {
170 |       const code = key === "google_application_credentials" ? "CONFLICTING_ADC_ENV_VARS" : "BLOCKED_ENV_VAR_PRESENT";
171 |       throw makeError(code, `Blocked or conflicting environment variable is set: ${key}`);
172 |     }
173 |   }
174 | 
175 |   const msd = String(env.METADATA_SERVER_DETECTION || "").trim().toLowerCase();
176 |   if (msd !== "none") {
177 |     throw makeError(
178 |       "METADATA_SERVER_DETECTION_NOT_NONE",
179 |       "METADATA_SERVER_DETECTION must be explicitly set to 'none' (required by gcp-metadata@6.1.1)"
180 |     );
181 |   }
182 | 
183 |   const gacPath = typeof env.GOOGLE_APPLICATION_CREDENTIALS === "string" ? env.GOOGLE_APPLICATION_CREDENTIALS.trim() : "";
184 |   const probeAdcFile = typeof env.PROBE_ADC_FILE === "string" ? env.PROBE_ADC_FILE.trim() : "";
185 | 
186 |   if (!gacPath) {
187 |     throw makeError("ADC_FILE_ENV_MISSING", "GOOGLE_APPLICATION_CREDENTIALS must specify a controlled absolute ADC file path");
188 |   }
189 |   if (!isAbsolute(gacPath)) {
190 |     throw makeError("ADC_PATH_NOT_ABSOLUTE", "GOOGLE_APPLICATION_CREDENTIALS must be an absolute path");
191 |   }
192 |   if (probeAdcFile && resolve(probeAdcFile) !== resolve(gacPath)) {
193 |     throw makeError("CONFLICTING_ADC_ENV_VARS", "PROBE_ADC_FILE conflicts with GOOGLE_APPLICATION_CREDENTIALS");
194 |   }
195 | 
196 |   // Verifica risco de arquivo ADC well-known paralelo em HOME ou APPDATA
197 |   const wellKnownCandidates = [];
198 |   if (typeof env.HOME === "string" && env.HOME.trim().length > 0) {
199 |     wellKnownCandidates.push(join(env.HOME.trim(), ".config", "gcloud", "application_default_credentials.json"));
200 |   }
201 |   if (typeof env.APPDATA === "string" && env.APPDATA.trim().length > 0) {
202 |     wellKnownCandidates.push(join(env.APPDATA.trim(), "gcloud", "application_default_credentials.json"));
203 |   }
204 |   for (const wk of wellKnownCandidates) {
205 |     if (existsSync(wk) && resolve(wk) !== resolve(gacPath)) {
206 |       throw makeError("WELL_KNOWN_ADC_CONFLICT", "A separate well-known gcloud ADC file exists under HOME/APPDATA");
207 |     }
208 |   }
209 | 
210 |   return { adcPath: resolve(gacPath) };
211 | }
212 | 
213 | /**
214 |  * 2. Le o arquivo ADC controlado aplicando barreiras fisicas em disco:
215 |  *    - Rejeita caminho relativo ou inexistente;
216 |  *    - Rejeita symlink direto (`lstatSync`), symlink em diretorio pai (`realpathSync`) e arquivos especiais/diretorios;
217 |  *    - Rejeita permissoes frouxas com bits de grupo ou outros (`(mode & 0o077) !== 0`).
218 |  */
219 | export function readControlledAdcFile(adcPath, fsOps = { existsSync, lstatSync, realpathSync, readFileSync }) {
220 |   if (typeof adcPath !== "string" || adcPath.trim().length === 0) {
221 |     throw makeError("ADC_FILE_MISSING", "ADC file path is empty");
222 |   }
223 |   if (!isAbsolute(adcPath)) {
224 |     throw makeError("ADC_PATH_NOT_ABSOLUTE", "ADC file path must be absolute");
225 |   }
226 |   if (!fsOps.existsSync(adcPath)) {
227 |     throw makeError("ADC_FILE_MISSING", "Controlled ADC file does not exist");
228 |   }
229 | 
230 |   const st = fsOps.lstatSync(adcPath);
231 |   if (st.isSymbolicLink()) {
232 |     throw makeError("ADC_SYMLINK_FORBIDDEN", "ADC file must not be a symbolic link");
233 |   }
234 |   if (!st.isFile()) {
235 |     throw makeError("ADC_SPECIAL_FILE_FORBIDDEN", "ADC path must be a regular file (not directory, FIFO, socket or device)");
236 |   }
237 | 
238 |   const resolvedExpected = resolve(adcPath);
239 |   const realResolved = fsOps.realpathSync(adcPath);
240 |   if (realResolved !== resolvedExpected) {
241 |     throw makeError("ADC_PARENT_SYMLINK_FORBIDDEN", "ADC path contains a symbolic link in parent directory");
242 |   }
243 | 
244 |   if ((st.mode & 0o077) !== 0) {
245 |     throw makeError("ADC_INSECURE_PERMISSIONS", "ADC file must not grant group or other permissions (use 0600 or 0400)");
246 |   }
247 | 
248 |   return fsOps.readFileSync(adcPath, "utf8");
249 | }
250 | 
251 | function assertAllowedSubsetKeys(obj, allowedKeys, unexpectedCode, context) {
252 |   const allowedSet = new Set(allowedKeys);
253 |   for (const key of Object.keys(obj)) {
254 |     if (!allowedSet.has(key)) {
255 |       throw makeError(unexpectedCode, `Unexpected key in ${context}: ${key}`);
256 |     }
257 |   }
258 | }
259 | 
260 | /**
261 |  * 3. Valida integralmente o payload JSON do ADC antes de entrega-lo ao SDK:
262 |  *    - Rejeita chaves JSON duplicadas (raiz e aninhadas);
263 |  *    - Allowlist estrita de chaves na raiz e em `source_credentials`;
264 |  *    - Identifica `impersonated_service_account` e `source_credentials.type === "authorized_user"`;
265 |  *    - Valida URL canonica `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/<SA>:generateAccessToken`;
266 |  *    - Separa e valida conta de origem vs. conta impersonada aprovada no registro Ed25519.
267 |  */
268 | export function validateImpersonatedAdcPayload(
269 |   adcJsonText,
270 |   {
271 |     expectedServiceAccountEmail,
272 |     expectedSourceClientId = null,
273 |     expectedSourceAccount = null,
274 |     expectedProjectId = EXPECTED_PROJECT_ID,
275 |   }
276 | ) {
277 |   if (typeof expectedServiceAccountEmail !== "string" || !SERVICE_ACCOUNT_RE.test(expectedServiceAccountEmail)) {
278 |     throw makeError("INVALID_EXPECTED_SERVICE_ACCOUNT", "Expected service account email is invalid");
279 |   }
280 |   if (typeof adcJsonText !== "string" || adcJsonText.trim().length === 0) {
281 |     throw makeError("EMPTY_ADC_PAYLOAD", "ADC file content is empty");
282 |   }
283 | 
284 |   assertNoDuplicateJsonKeys(adcJsonText);
285 | 
286 |   let adc;
287 |   try {
288 |     adc = JSON.parse(adcJsonText);
289 |   } catch {
290 |     throw makeError("INVALID_ADC_JSON", "ADC file is not valid JSON");
291 |   }
292 |   if (!adc || typeof adc !== "object" || Array.isArray(adc)) {
293 |     throw makeError("INVALID_ADC_STRUCTURE", "ADC payload must be a JSON object");
294 |   }
295 | 
296 |   assertAllowedSubsetKeys(adc, ADC_TOP_LEVEL_ALLOWED_KEYS, "ADC_UNEXPECTED_KEY", "adc");
297 | 
298 |   if (adc.type !== "impersonated_service_account") {
299 |     throw makeError("UNEXPECTED_ADC_TYPE", `ADC type must be impersonated_service_account, got ${String(adc.type)}`);
300 |   }
301 | 
302 |   const rawUrl = adc.service_account_impersonation_url;
303 |   if (typeof rawUrl !== "string" || rawUrl.trim() !== rawUrl || rawUrl.length === 0) {
304 |     throw makeError("INVALID_IMPERSONATION_URL", "service_account_impersonation_url must be a non-empty trimmed string");
305 |   }
306 |   if (/%2f|%5c|\.\./i.test(rawUrl)) {
307 |     throw makeError("INVALID_IMPERSONATION_URL_PATH", "Impersonation URL contains forbidden traversal or encoded slash");
308 |   }
309 | 
310 |   let parsedUrl;
311 |   try {
312 |     parsedUrl = new URL(rawUrl);
313 |   } catch {
314 |     throw makeError("INVALID_IMPERSONATION_URL", "Unable to parse service_account_impersonation_url");
315 |   }
316 |   if (parsedUrl.protocol !== "https:") {
317 |     throw makeError("INVALID_IMPERSONATION_URL_PROTOCOL", "Impersonation URL must use https:");
318 |   }
319 |   if (parsedUrl.hostname !== "iamcredentials.googleapis.com") {
320 |     throw makeError("INVALID_IMPERSONATION_URL_HOST", "Impersonation URL hostname must be iamcredentials.googleapis.com");
321 |   }
322 |   if (parsedUrl.port !== "" || /^https:\/\/iamcredentials\.googleapis\.com:\d+/i.test(rawUrl)) {
323 |     throw makeError("INVALID_IMPERSONATION_URL_PORT", "Impersonation URL must not specify an explicit port");
324 |   }
325 |   if (parsedUrl.username !== "" || parsedUrl.password !== "") {
326 |     throw makeError("INVALID_IMPERSONATION_URL_AUTH", "Impersonation URL must not contain userinfo");
327 |   }
328 |   if (parsedUrl.search !== "" || parsedUrl.hash !== "" || rawUrl.includes("?") || rawUrl.includes("#")) {
329 |     throw makeError("INVALID_IMPERSONATION_URL_PARAMS", "Impersonation URL must not contain query parameters or fragments");
330 |   }
331 | 
332 |   const pathMatch = IMPERSONATION_PATH_RE.exec(parsedUrl.pathname);
333 |   if (!pathMatch) {
334 |     throw makeError("INVALID_IMPERSONATION_URL_PATH", "Impersonation URL path does not match canonical generateAccessToken endpoint");
335 |   }
336 |   const impersonatedSa = pathMatch[1];
337 |   if (impersonatedSa !== expectedServiceAccountEmail) {
338 |     throw makeError("IMPERSONATED_SA_MISMATCH", "Impersonated service account in ADC does not match approved service account");
339 |   }
340 | 
341 |   if (adc.delegates !== undefined) {
342 |     if (!Array.isArray(adc.delegates) || adc.delegates.length > 0) {
343 |       throw makeError("NON_EMPTY_DELEGATES_FORBIDDEN", "ADC delegates chain must be empty");
344 |     }
345 |   }
346 |   if (adc.quota_project_id !== undefined && adc.quota_project_id !== expectedProjectId) {
347 |     throw makeError("QUOTA_PROJECT_MISMATCH", "ADC quota_project_id does not match target project");
348 |   }
349 |   if (adc.universe_domain !== undefined && adc.universe_domain !== "googleapis.com") {
350 |     throw makeError("UNEXPECTED_UNIVERSE_DOMAIN", "ADC universe_domain must be googleapis.com");
351 |   }
352 | 
353 |   const src = adc.source_credentials;
354 |   if (!src || typeof src !== "object" || Array.isArray(src)) {
355 |     throw makeError("MISSING_SOURCE_CREDENTIALS", "ADC source_credentials must be present");
356 |   }
357 |   if (Object.prototype.hasOwnProperty.call(src, "private_key") || Object.prototype.hasOwnProperty.call(src, "private_key_id")) {
358 |     throw makeError("STATIC_PRIVATE_KEY_SOURCE_FORBIDDEN", "source_credentials must not contain static private key material");
359 |   }
360 |   assertAllowedSubsetKeys(src, ADC_SOURCE_ALLOWED_KEYS, "ADC_SOURCE_UNEXPECTED_KEY", "adc.source_credentials");
361 | 
362 |   if (src.type !== "authorized_user") {
363 |     throw makeError("UNEXPECTED_SOURCE_CREDENTIAL_TYPE", `source_credentials.type must be authorized_user, got ${String(src.type)}`);
364 |   }
365 |   if (typeof src.client_id !== "string" || src.client_id.trim().length === 0) {
366 |     throw makeError("INVALID_SOURCE_CLIENT_ID", "source_credentials.client_id must be a non-empty string");
367 |   }
368 |   if (typeof src.client_secret !== "string" || src.client_secret.trim().length === 0) {
369 |     throw makeError("INVALID_SOURCE_CLIENT_SECRET", "source_credentials.client_secret must be a non-empty string");
370 |   }
371 |   if (typeof src.refresh_token !== "string" || src.refresh_token.trim().length === 0) {
372 |     throw makeError("MISSING_SOURCE_REFRESH_TOKEN", "source_credentials.refresh_token must be present");
373 |   }
374 |   if (src.quota_project_id !== undefined && src.quota_project_id !== expectedProjectId) {
375 |     throw makeError("SOURCE_QUOTA_PROJECT_MISMATCH", "source_credentials.quota_project_id does not match target project");
376 |   }
377 |   if (src.universe_domain !== undefined && src.universe_domain !== "googleapis.com") {
378 |     throw makeError("UNEXPECTED_SOURCE_UNIVERSE_DOMAIN", "source_credentials.universe_domain must be googleapis.com");
379 |   }
380 | 
381 |   if (expectedSourceClientId !== null && expectedSourceClientId !== undefined) {
382 |     const trimmedClientId = String(expectedSourceClientId).trim();
383 |     if (trimmedClientId.length > 0 && src.client_id !== trimmedClientId) {
384 |       throw makeError("SOURCE_CLIENT_ID_MISMATCH", "ADC source_credentials.client_id does not match expected origin client");
385 |     }
386 |   }
387 | 
388 |   // Validacao da conta de origem (quando presente ou esperada) frente a conta impersonada
389 |   if (src.account !== undefined) {
390 |     if (typeof src.account !== "string" || src.account.trim().length === 0) {
391 |       throw makeError("INVALID_SOURCE_ACCOUNT", "source_credentials.account must be a non-empty string when present");
392 |     }
393 |     const normalizedSrcAccount = src.account.trim().toLowerCase();
394 |     if (normalizedSrcAccount === impersonatedSa.toLowerCase()) {
395 |       throw makeError("SOURCE_EQUALS_IMPERSONATED_SA", "Origin account cannot be identical to the impersonated service account");
396 |     }
397 |     if (ANY_SERVICE_ACCOUNT_DOMAIN_RE.test(normalizedSrcAccount)) {
398 |       throw makeError("SOURCE_ACCOUNT_IS_SERVICE_ACCOUNT", "Origin account in authorized_user must not be a service account");
399 |     }
400 |   }
401 |   if (expectedSourceAccount !== null && expectedSourceAccount !== undefined) {
402 |     const trimmedExpectedAcc = String(expectedSourceAccount).trim().toLowerCase();
403 |     if (trimmedExpectedAcc.length > 0) {
404 |       const actualSrcAcc = typeof src.account === "string" ? src.account.trim().toLowerCase() : "";
405 |       if (!actualSrcAcc || actualSrcAcc !== trimmedExpectedAcc) {
406 |         throw makeError("SOURCE_ACCOUNT_MISMATCH", "source_credentials.account is missing or differs from expected origin account");
407 |       }
408 |     }
409 |   }
410 | 
411 |   return {
412 |     adcType: adc.type,
413 |     impersonatedServiceAccount: impersonatedSa,
414 |     sourceCredentialType: src.type,
415 |     quotaProjectId: adc.quota_project_id ?? null,
416 |     originIdentityNotice:
417 |       "SOURCE_CREDENTIALS_LOCAL_CHECK_ONLY_DOES_NOT_CRYPTOGRAPHICALLY_PROVE_HUMAN_OPERATOR_WITHOUT_OAUTH_AND_CLOUD_AUDIT_EVIDENCE",
418 |   };
419 | }
420 | 
421 | /**
422 |  * 4. Valida alvo exato da sonda (rejeita explicitamente `(default)` e qualquer limit != 1).
423 |  */
424 | export function validateProbeTarget({
425 |   projectId = EXPECTED_PROJECT_ID,
426 |   databaseId = EXPECTED_DATABASE_ID,
427 |   collectionName = EXPECTED_COLLECTION_NAME,
428 |   limit = PROBE_LIMIT,
429 | } = {}) {
430 |   if (databaseId === FORBIDDEN_DEFAULT_DATABASE_ID) {
431 |     throw makeError("DEFAULT_DATABASE_FORBIDDEN", "Explicitly forbidden to probe (default) Firestore database");
432 |   }
433 |   if (projectId !== EXPECTED_PROJECT_ID) {
434 |     throw makeError("PROBE_PROJECT_ID_MISMATCH", "Probe projectId does not match target project");
435 |   }
436 |   if (databaseId !== EXPECTED_DATABASE_ID) {
437 |     throw makeError("PROBE_DATABASE_ID_MISMATCH", "Probe databaseId does not match target named database");
438 |   }
439 |   if (collectionName !== EXPECTED_COLLECTION_NAME) {
440 |     throw makeError("PROBE_COLLECTION_MISMATCH", "Probe collectionName must be users");
441 |   }
442 |   if (limit !== PROBE_LIMIT) {
443 |     throw makeError("PROBE_LIMIT_INVALID", "Probe limit must be strictly 1");
444 |   }
445 |   return { projectId, databaseId, collectionName, limit };
446 | }
447 | 
448 | function readRegularInputFile(filePath, missingCode) {
449 |   if (!filePath || !existsSync(filePath)) {
450 |     throw makeError(missingCode, `Required file missing (${missingCode})`);
451 |   }
452 |   const st = lstatSync(filePath);
453 |   if (st.isSymbolicLink() || !st.isFile()) {
454 |     throw makeError("SYMLINK_INPUT_FORBIDDEN", `Input file must be a regular non-symlink file (${missingCode})`);
455 |   }
456 |   return readFileSync(filePath, "utf8");
457 | }
458 | 
459 | async function defaultLoadFirebaseModules() {
460 |   try {
461 |     const appMod = await import("firebase-admin/app");
462 |     const firestoreMod = await import("firebase-admin/firestore");
463 |     return {
464 |       applicationDefault: appMod.applicationDefault,
465 |       initializeApp: appMod.initializeApp,
466 |       deleteApp: appMod.deleteApp,
467 |       getFirestore: firestoreMod.getFirestore,
468 |     };
469 |   } catch (err) {
470 |     const causeCode = err && typeof err.code === "string" ? err.code : "IMPORT_ERROR";
471 |     throw makeError("FIREBASE_MODULE_LOAD_FAILED", `Failed to dynamically load firebase-admin modules (${causeCode})`);
472 |   }
473 | }
474 | 
475 | /**
476 |  * 5. Orquestracao fail-closed da sonda com ordem verificavel de eventos:
477 |  *    Etapa A: Validacao criptografica Ed25519 (import dinamico do verificador, sem Firebase);
478 |  *    Etapa B: Validacao de ambiente (`METADATA_SERVER_DETECTION=none`, fonte ADC unica, zero conflitos);
479 |  *    Etapa C: Leitura fisica segura do ADC (absoluto, regular, nao-symlink, permissoes 0600/0400);
480 |  *    Etapa D: Validacao estrita do JSON ADC (sem duplicidades, allowlist, URL, origem vs. impersonada);
481 |  *    Etapa E: Validacao do alvo (`gen-lang-client-0490390966`, banco nomeado != `(default)`, `users`, `limit=1`);
482 |  *    Etapa F: SOMENTE ENTÃO importacao dinamica de `firebase-admin/app` e `firebase-admin/firestore`,
483 |  *             consulta `db.collection("users").select().limit(1).get()` e encerramento obrigatorio via `deleteApp`.
484 |  */
485 | export async function runProbeReadOnlyV4({
486 |   env = process.env,
487 |   targetOverrides = {},
488 |   loadFirebaseModules = defaultLoadFirebaseModules,
489 |   onEvent = null,
490 | } = {}) {
491 |   const emit = (eventName) => {
492 |     if (typeof onEvent === "function") onEvent(eventName);
493 |   };
494 | 
495 |   // ETAPA A — Carregar dinamicamente verificador Ed25519 e validar registro ANTES de ADC ou Firebase
496 |   emit("STAGE_A_APPROVAL_VERIFY_START");
497 |   const { verifySignedApprovalRecord } = await import("../etapa28/verify-approval-record.candidate.mjs");
498 | 
499 |   const recordPath = String(env.APPROVED_AUDIT_RECORD_FILE || "").trim();
500 |   const sigPath = String(env.APPROVED_AUDIT_SIGNATURE_FILE || "").trim();
501 |   const pubKeyPath = String(env.TRUSTED_ADMIN_PUBKEY_FILE || "").trim();
502 |   const pubKeyPin = String(env.TRUSTED_ADMIN_PUBKEY_SHA256 || "").trim();
503 |   const expectedSa = String(env.EXPECTED_AUDIT_SA || "").trim();
504 |   const revokedFile = String(env.REVOKED_APPROVAL_IDS_FILE || "").trim();
505 | 
506 |   if (!expectedSa) {
507 |     throw makeError("EXPECTED_AUDIT_SA_MISSING", "EXPECTED_AUDIT_SA is required");
508 |   }
509 | 
510 |   const recordJsonText = readRegularInputFile(recordPath, "APPROVAL_RECORD_FILE_MISSING");
511 |   const signatureBase64 = readRegularInputFile(sigPath, "APPROVAL_SIGNATURE_FILE_MISSING");
512 |   const trustedPublicKeyPem = readRegularInputFile(pubKeyPath, "TRUSTED_PUBKEY_FILE_MISSING");
513 | 
514 |   let revokedIds = [];
515 |   if (revokedFile) {
516 |     let parsedRevoked;
517 |     try {
518 |       parsedRevoked = JSON.parse(readRegularInputFile(revokedFile, "REVOKED_LIST_FILE_MISSING"));
519 |     } catch {
520 |       throw makeError("INVALID_REVOKED_LIST", "REVOKED_APPROVAL_IDS_FILE is not valid JSON");
521 |     }
522 |     if (!Array.isArray(parsedRevoked) || !parsedRevoked.every((v) => typeof v === "string")) {
523 |       throw makeError("INVALID_REVOKED_LIST", "REVOKED_APPROVAL_IDS_FILE must be a string array");
524 |     }
525 |     revokedIds = parsedRevoked;
526 |   }
527 | 
528 |   const approval = verifySignedApprovalRecord({
529 |     recordJsonText,
530 |     signatureBase64,
531 |     trustedPublicKeyPem,
532 |     trustedPublicKeySha256: pubKeyPin,
533 |     expectedServiceAccountEmail: expectedSa,
534 |     revokedApprovalIds: revokedIds,
535 |   });
536 |   emit("STAGE_A_APPROVAL_VERIFY_OK");
537 | 
538 |   // ETAPA B — Validar ambiente e bloquear caminhos alternativos de autenticacao
539 |   emit("STAGE_B_ENV_CHECK_START");
540 |   const { adcPath } = assertSafeProbeEnvironment(env);
541 |   emit("STAGE_B_ENV_CHECK_OK");
542 | 
543 |   // ETAPA C — Ler arquivo ADC controlado com verificacoes de caminho, symlink, tipo e permissoes
544 |   emit("STAGE_C_ADC_READ_START");
545 |   const adcJsonText = readControlledAdcFile(adcPath);
546 |   emit("STAGE_C_ADC_READ_OK");
547 | 
548 |   // ETAPA D — Validar payload JSON do ADC (allowlist, duplicidades, URL, origem vs. impersonada)
549 |   emit("STAGE_D_ADC_VALIDATE_START");
550 |   const expectedSourceClientId = String(env.EXPECTED_ADC_SOURCE_CLIENT_ID || "").trim() || null;
551 |   const expectedSourceAccount = String(env.EXPECTED_ADC_SOURCE_ACCOUNT || "").trim() || null;
552 |   const adcCheck = validateImpersonatedAdcPayload(adcJsonText, {
553 |     expectedServiceAccountEmail: approval.serviceAccountEmail,
554 |     expectedSourceClientId,
555 |     expectedSourceAccount,
556 |     expectedProjectId: approval.projectId,
557 |   });
558 |   emit("STAGE_D_ADC_VALIDATE_OK");
559 | 
560 |   // ETAPA E — Validar alvo exato da sonda (rejeita `(default)` e `limit != 1`)
561 |   emit("STAGE_E_TARGET_VALIDATE_START");
562 |   const target = validateProbeTarget({
563 |     projectId: targetOverrides.projectId ?? approval.projectId,
564 |     databaseId: targetOverrides.databaseId ?? approval.databaseId,
565 |     collectionName: targetOverrides.collectionName ?? approval.collectionName,
566 |     limit: targetOverrides.limit ?? PROBE_LIMIT,
567 |   });
568 |   emit("STAGE_E_TARGET_VALIDATE_OK");
569 | 
570 |   // ETAPA F — Somente agora carregar dinamicamente Firebase Admin, consultar e encerrar em `finally`
571 |   emit("STAGE_F_FIREBASE_IMPORT_START");
572 |   const { applicationDefault, initializeApp, deleteApp, getFirestore } = await loadFirebaseModules();
573 |   emit("STAGE_F_FIREBASE_IMPORT_OK");
574 | 
575 |   let firebaseApp = null;
576 |   let primaryError = null;
577 |   let resultPayload = null;
578 | 
579 |   try {
580 |     emit("STAGE_F_FIREBASE_INIT");
581 |     const appName = `probe-readonly-v4-${target.projectId}-${target.databaseId}`;
582 |     firebaseApp = initializeApp(
583 |       {
584 |         credential: applicationDefault(),
585 |         projectId: target.projectId,
586 |       },
587 |       appName
588 |     );
589 | 
590 |     const db = getFirestore(firebaseApp, target.databaseId);
591 |     emit("STAGE_F_FIRESTORE_QUERY_START");
592 |     // No @google-cloud/firestore@8.7.1, select() sem argumentos projeta `{ fieldPath: "__name__" }`.
593 |     // Zero campos do corpo do documento sao solicitados; porem `document.name` (com UID de ate 1 doc)
594 |     // e recebido em memoria pelo SDK. A sonda acessa exclusivamente `snap.size` e `snap.empty`.
595 |     const snap = await db.collection(target.collectionName).select().limit(target.limit).get();
596 |     emit("STAGE_F_FIRESTORE_QUERY_OK");
597 | 
598 |     const documentsReturned = Number.isInteger(snap?.size) ? snap.size : 0;
599 |     const hasAtLeastOneDocument = Boolean(snap && snap.empty === false);
600 | 
601 |     resultPayload = {
602 |       probeVersion: PROBE_VERSION,
603 |       status: "PROBE_READONLY_OK",
604 |       approvalId: approval.approvalId,
605 |       projectId: target.projectId,
606 |       databaseId: target.databaseId,
607 |       collectionName: target.collectionName,
608 |       limit: target.limit,
609 |       adcType: adcCheck.adcType,
610 |       sourceCredentialType: adcCheck.sourceCredentialType,
611 |       wireProjectionField: "__name__",
612 |       documentsReturned,
613 |       hasAtLeastOneDocument,
614 |       sdkMemoryExposureNotice:
615 |         "WIRE_RESPONSE_INCLUDES_DOCUMENT_NAME_WITH_RAW_UID_IN_SDK_MEMORY_NOT_ACCESSED_PROCESSED_OR_LOGGED",
616 |       scopeNotice: "SINGLE_DOCUMENT_CONNECTIVITY_PROBE_ONLY_NOT_FULL_COLLECTION_AUDIT",
617 |     };
618 |   } catch (err) {
619 |     primaryError = err;
620 |   } finally {
621 |     if (firebaseApp) {
622 |       emit("STAGE_F_FIREBASE_CLEANUP_START");
623 |       try {
624 |         await deleteApp(firebaseApp);
625 |         emit("STAGE_F_FIREBASE_CLEANUP_OK");
626 |       } catch {
627 |         emit("STAGE_F_FIREBASE_CLEANUP_FAILED");
628 |         if (primaryError) {
629 |           primaryError.cleanupErrorCode = "FIREBASE_APP_CLEANUP_FAILED";
630 |         } else {
631 |           primaryError = makeError(
632 |             "FIREBASE_APP_CLEANUP_FAILED",
633 |             "Firebase Admin app cleanup via deleteApp() failed after probe query"
634 |           );
635 |         }
636 |       }
637 |     }
638 |   }
639 | 
640 |   if (primaryError) {
641 |     throw primaryError;
642 |   }
643 |   return resultPayload;
644 | }
645 | 
646 | function isDirectExecution() {
647 |   return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
648 | }
649 | 
650 | if (isDirectExecution()) {
651 |   const args = new Set(process.argv.slice(2));
652 |   if (args.has("--help") || !args.has("--execute-probe-readonly")) {
653 |     process.stdout.write(
654 |       JSON.stringify(
655 |         {
656 |           probeVersion: PROBE_VERSION,
657 |           status: "DRY_INFO_NO_FIREBASE_CONNECTION",
658 |           targetProjectId: EXPECTED_PROJECT_ID,
659 |           targetDatabaseId: EXPECTED_DATABASE_ID,
660 |           targetCollection: EXPECTED_COLLECTION_NAME,
661 |           limit: PROBE_LIMIT,
662 |           usage:
663 |             "METADATA_SERVER_DETECTION=none node scripts/audit/candidates/etapa29/probe-readonly-v4.etapa29.candidate.mjs --execute-probe-readonly",
664 |         },
665 |         null,
666 |         2
667 |       ) + "\n"
668 |     );
669 |   } else {
670 |     runProbeReadOnlyV4({ env: process.env })
671 |       .then((result) => {
672 |         process.stdout.write(JSON.stringify(result, null, 2) + "\n");
673 |       })
674 |       .catch((err) => {
675 |         const code = err && typeof err.code === "string" ? err.code : "PROBE_READONLY_FAILED";
676 |         const errPayload = {
677 |           probeVersion: PROBE_VERSION,
678 |           status: "PROBE_READONLY_REJECTED",
679 |           errorCode: code,
680 |         };
681 |         if (err && typeof err.cleanupErrorCode === "string") {
682 |           errPayload.cleanupErrorCode = err.cleanupErrorCode;
683 |         }
684 |         process.stderr.write(JSON.stringify(errPayload) + "\n");
685 |         process.exitCode = 1;
686 |       });
687 |   }
688 | }
```

### 9.2 `scripts/audit/candidates/etapa29/etapa29-audit.test.mjs` (586 linhas POSIX, 22.419 bytes)

SHA-256: `6bd2bef8f11a45e3d45741d3c94eb02fbffe29bd1ba2fa8d04b89f1aca321e61`

```javascript
  1 | /**
  2 |  * LOCALIZA+ v1.10.13 — Etapa 29
  3 |  * Suite de testes sinteticos independentes (100% dados ficticios, zero Firebase real, zero credenciais ADC)
  4 |  * verificando todas as exigencias tecnicas da Secao 7 da Etapa 29.
  5 |  */
  6 | 
  7 | import test from "node:test";
  8 | import assert from "node:assert/strict";
  9 | import { generateKeyPairSync, sign } from "node:crypto";
 10 | import { spawnSync } from "node:child_process";
 11 | import {
 12 |   chmodSync,
 13 |   mkdirSync,
 14 |   mkdtempSync,
 15 |   readFileSync,
 16 |   realpathSync,
 17 |   rmSync,
 18 |   symlinkSync,
 19 |   writeFileSync,
 20 | } from "node:fs";
 21 | import { createRequire } from "node:module";
 22 | import { tmpdir } from "node:os";
 23 | import { join, resolve } from "node:path";
 24 | 
 25 | import {
 26 |   canonicalizeApprovalRecord,
 27 |   computePublicKeyFingerprintSha256,
 28 | } from "../etapa28/verify-approval-record.candidate.mjs";
 29 | import {
 30 |   EXPECTED_COLLECTION_NAME,
 31 |   EXPECTED_DATABASE_ID,
 32 |   EXPECTED_PROJECT_ID,
 33 |   assertSafeProbeEnvironment,
 34 |   readControlledAdcFile,
 35 |   runProbeReadOnlyV4,
 36 |   validateImpersonatedAdcPayload,
 37 | } from "./probe-readonly-v4.etapa29.candidate.mjs";
 38 | 
 39 | const require = createRequire(import.meta.url);
 40 | const FICTITIOUS_SA = "audit-readonly-ficticio@gen-lang-client-0490390966.iam.gserviceaccount.com";
 41 | const OTHER_FICTITIOUS_SA = "outra-conta-ficticia@gen-lang-client-0490390966.iam.gserviceaccount.com";
 42 | const PROBE_E29_PATH = resolve("scripts/audit/candidates/etapa29/probe-readonly-v4.etapa29.candidate.mjs");
 43 | const PROBE_E28_PATH = resolve("scripts/audit/candidates/etapa28/probe-readonly-v4.candidate.mjs");
 44 | 
 45 | function makeApprovalFixture(recordOverrides = {}) {
 46 |   const { publicKey, privateKey } = generateKeyPairSync("ed25519");
 47 |   const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
 48 |   const trustedPin = computePublicKeyFingerprintSha256(publicKeyPem);
 49 |   const now = new Date();
 50 |   const issuedAt = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
 51 |   const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
 52 | 
 53 |   const record = {
 54 |     schemaVersion: "localiza-audit-approval-v1",
 55 |     approvalId: "APPR-2026-FICTICIO-029",
 56 |     projectId: EXPECTED_PROJECT_ID,
 57 |     databaseId: EXPECTED_DATABASE_ID,
 58 |     collectionName: EXPECTED_COLLECTION_NAME,
 59 |     serviceAccountEmail: FICTITIOUS_SA,
 60 |     purpose: "READ_ONLY_USERS_COMPATIBILITY_AUDIT",
 61 |     scope: "READ_ONLY",
 62 |     issuedAt,
 63 |     expiresAt,
 64 |     revoked: false,
 65 |     issuerKeyId: "gcp-admin-ed25519-ficticio-29",
 66 |     ...recordOverrides,
 67 |   };
 68 |   const canonical = canonicalizeApprovalRecord(record);
 69 |   const signatureBase64 = sign(null, canonical, privateKey).toString("base64");
 70 |   return { record, recordJsonText: JSON.stringify(record, null, 2), signatureBase64, publicKeyPem, trustedPin };
 71 | }
 72 | 
 73 | function makeValidAdc(overrides = {}) {
 74 |   return {
 75 |     type: "impersonated_service_account",
 76 |     service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${FICTITIOUS_SA}:generateAccessToken`,
 77 |     quota_project_id: EXPECTED_PROJECT_ID,
 78 |     delegates: [],
 79 |     source_credentials: {
 80 |       type: "authorized_user",
 81 |       client_id: "fictitious-client-id-29.apps.googleusercontent.com",
 82 |       client_secret: "fictitious-client-secret-placeholder",
 83 |       refresh_token: "fictitious-refresh-token-placeholder",
 84 |       account: "operador.ficticio@ifpr.example.invalid",
 85 |     },
 86 |     ...overrides,
 87 |   };
 88 | }
 89 | 
 90 | function createSyntheticEnvDir({ approvalFx = makeApprovalFixture(), adcObj = makeValidAdc(), adcMode = 0o600 } = {}) {
 91 |   const dir = realpathSync(mkdtempSync(join(tmpdir(), "localiza-e29-test-")));
 92 |   const recPath = join(dir, "approval.json");
 93 |   const sigPath = join(dir, "approval.sig");
 94 |   const pubPath = join(dir, "trusted.pub.pem");
 95 |   const adcPath = join(dir, "adc-controlled.json");
 96 |   writeFileSync(recPath, approvalFx.recordJsonText, { mode: 0o600 });
 97 |   writeFileSync(sigPath, approvalFx.signatureBase64, { mode: 0o600 });
 98 |   writeFileSync(pubPath, approvalFx.publicKeyPem, { mode: 0o600 });
 99 |   writeFileSync(adcPath, JSON.stringify(adcObj, null, 2), { mode: adcMode });
100 |   chmodSync(adcPath, adcMode);
101 |   return {
102 |     dir,
103 |     recPath,
104 |     sigPath,
105 |     pubPath,
106 |     adcPath,
107 |     env: {
108 |       METADATA_SERVER_DETECTION: "none",
109 |       GOOGLE_APPLICATION_CREDENTIALS: adcPath,
110 |       APPROVED_AUDIT_RECORD_FILE: recPath,
111 |       APPROVED_AUDIT_SIGNATURE_FILE: sigPath,
112 |       TRUSTED_ADMIN_PUBKEY_FILE: pubPath,
113 |       TRUSTED_ADMIN_PUBKEY_SHA256: approvalFx.trustedPin,
114 |       EXPECTED_AUDIT_SA: FICTITIOUS_SA,
115 |       EXPECTED_ADC_SOURCE_ACCOUNT: "operador.ficticio@ifpr.example.invalid",
116 |     },
117 |   };
118 | }
119 | 
120 | test("E29-01. Ordem efetiva de execucao dos imports e eventos (zero import estatico Firebase; eventos em sequencia estrita)", async () => {
121 |   // 1. Verificacao estatica: sonda Etapa 29 importa estaticamente APENAS built-ins node:fs, node:path, node:url
122 |   const srcE29 = readFileSync(PROBE_E29_PATH, "utf8");
123 |   const staticImports = [...srcE29.matchAll(/^\s*import\s+[\s\S]*?from\s+["']([^"']+)["'];/gm)].map((m) => m[1]);
124 |   assert.deepEqual(staticImports, ["node:fs", "node:path", "node:url"]);
125 | 
126 |   // 2. Verificacao estatica comparativa na sonda Etapa 28 (documenta que importa apenas node:* + verificador local)
127 |   const srcE28 = readFileSync(PROBE_E28_PATH, "utf8");
128 |   const staticImportsE28 = [...srcE28.matchAll(/^\s*import\s+[\s\S]*?from\s+["']([^"']+)["'];/gm)].map((m) => m[1]);
129 |   assert.equal(staticImportsE28.some((spec) => spec.includes("firebase")), false);
130 | 
131 |   // 3. Registro cronologico real de eventos durante runProbeReadOnlyV4 com modulo Firebase injetado (zero rede)
132 |   const fx = createSyntheticEnvDir();
133 |   const events = [];
134 |   try {
135 |     const res = await runProbeReadOnlyV4({
136 |       env: fx.env,
137 |       onEvent: (ev) => events.push(ev),
138 |       loadFirebaseModules: async () => {
139 |         events.push("HOOK_LOAD_FIREBASE_CALLED");
140 |         return {
141 |           applicationDefault: () => ({ kind: "synthetic" }),
142 |           initializeApp: (_opts, name) => {
143 |             events.push("HOOK_INITIALIZE_APP_CALLED");
144 |             return { name };
145 |           },
146 |           getFirestore: () => ({
147 |             collection: (col) => {
148 |               assert.equal(col, "users");
149 |               return {
150 |                 select: (...args) => {
151 |                   assert.equal(args.length, 0);
152 |                   return {
153 |                     limit: (n) => {
154 |                       assert.equal(n, 1);
155 |                       return {
156 |                         get: async () => {
157 |                           events.push("HOOK_FIRESTORE_GET_CALLED");
158 |                           return { size: 1, empty: false };
159 |                         },
160 |                       };
161 |                     },
162 |                   };
163 |                 },
164 |               };
165 |             },
166 |           }),
167 |           deleteApp: async () => {
168 |             events.push("HOOK_DELETE_APP_CALLED");
169 |           },
170 |         };
171 |       },
172 |     });
173 |     assert.equal(res.status, "PROBE_READONLY_OK");
174 |     assert.deepEqual(events, [
175 |       "STAGE_A_APPROVAL_VERIFY_START",
176 |       "STAGE_A_APPROVAL_VERIFY_OK",
177 |       "STAGE_B_ENV_CHECK_START",
178 |       "STAGE_B_ENV_CHECK_OK",
179 |       "STAGE_C_ADC_READ_START",
180 |       "STAGE_C_ADC_READ_OK",
181 |       "STAGE_D_ADC_VALIDATE_START",
182 |       "STAGE_D_ADC_VALIDATE_OK",
183 |       "STAGE_E_TARGET_VALIDATE_START",
184 |       "STAGE_E_TARGET_VALIDATE_OK",
185 |       "STAGE_F_FIREBASE_IMPORT_START",
186 |       "HOOK_LOAD_FIREBASE_CALLED",
187 |       "STAGE_F_FIREBASE_IMPORT_OK",
188 |       "STAGE_F_FIREBASE_INIT",
189 |       "HOOK_INITIALIZE_APP_CALLED",
190 |       "STAGE_F_FIRESTORE_QUERY_START",
191 |       "HOOK_FIRESTORE_GET_CALLED",
192 |       "STAGE_F_FIRESTORE_QUERY_OK",
193 |       "STAGE_F_FIREBASE_CLEANUP_START",
194 |       "HOOK_DELETE_APP_CALLED",
195 |       "STAGE_F_FIREBASE_CLEANUP_OK",
196 |     ]);
197 |   } finally {
198 |     rmSync(fx.dir, { recursive: true, force: true });
199 |   }
200 | });
201 | 
202 | test("E29-02. Tentativa de inicializacao do Firebase antes da aprovacao (bloqueio total antes de import ou initializeApp)", async () => {
203 |   const fx = createSyntheticEnvDir();
204 |   let loadCalled = false;
205 |   let initCalled = false;
206 |   try {
207 |     // Corrompe pin confiavel -> deve falhar na Etapa A sem jamais chamar loadFirebaseModules ou initializeApp
208 |     const badEnv = { ...fx.env, TRUSTED_ADMIN_PUBKEY_SHA256: "0".repeat(64) };
209 |     await assert.rejects(
210 |       () =>
211 |         runProbeReadOnlyV4({
212 |           env: badEnv,
213 |           loadFirebaseModules: async () => {
214 |             loadCalled = true;
215 |             return {
216 |               applicationDefault: () => ({}),
217 |               initializeApp: () => {
218 |                 initCalled = true;
219 |                 return {};
220 |               },
221 |               getFirestore: () => ({}),
222 |               deleteApp: async () => {},
223 |             };
224 |           },
225 |         }),
226 |       { code: "UNTRUSTED_PUBLIC_KEY_FINGERPRINT" }
227 |     );
228 |     assert.equal(loadCalled, false);
229 |     assert.equal(initCalled, false);
230 |   } finally {
231 |     rmSync(fx.dir, { recursive: true, force: true });
232 |   }
233 | });
234 | 
235 | test("E29-03. Variaveis ADC conflitantes, METADATA_SERVER_DETECTION ausente/invalido e well-known ADC paralelo", () => {
236 |   const dir = realpathSync(mkdtempSync(join(tmpdir(), "localiza-e29-env-")));
237 |   try {
238 |     const controlledAdc = join(dir, "controlled.json");
239 |     writeFileSync(controlledAdc, "{}", { mode: 0o600 });
240 | 
241 |     // 1. Sem METADATA_SERVER_DETECTION=none (mesmo com NO_GCE_CHECK=true legado) -> REJEITADO
242 |     assert.throws(
243 |       () =>
244 |         assertSafeProbeEnvironment({
245 |           NO_GCE_CHECK: "true",
246 |           GOOGLE_APPLICATION_CREDENTIALS: controlledAdc,
247 |         }),
248 |       { code: "METADATA_SERVER_DETECTION_NOT_NONE" }
249 |     );
250 | 
251 |     // 2. google_application_credentials minusculo conflitante -> REJEITADO
252 |     assert.throws(
253 |       () =>
254 |         assertSafeProbeEnvironment({
255 |           METADATA_SERVER_DETECTION: "none",
256 |           GOOGLE_APPLICATION_CREDENTIALS: controlledAdc,
257 |           google_application_credentials: "/tmp/outro.json",
258 |         }),
259 |       { code: "CONFLICTING_ADC_ENV_VARS" }
260 |     );
261 | 
262 |     // 3. PROBE_ADC_FILE divergente de GOOGLE_APPLICATION_CREDENTIALS -> REJEITADO
263 |     assert.throws(
264 |       () =>
265 |         assertSafeProbeEnvironment({
266 |           METADATA_SERVER_DETECTION: "none",
267 |           GOOGLE_APPLICATION_CREDENTIALS: controlledAdc,
268 |           PROBE_ADC_FILE: join(dir, "diferente.json"),
269 |         }),
270 |       { code: "CONFLICTING_ADC_ENV_VARS" }
271 |     );
272 | 
273 |     // 4. Variaveis serverless GCP (K_SERVICE) ou CLOUDSDK_CONFIG -> REJEITADO
274 |     for (const v of ["K_SERVICE", "CLOUD_RUN_JOB", "FUNCTION_NAME", "CLOUDSDK_CONFIG"]) {
275 |       assert.throws(
276 |         () =>
277 |           assertSafeProbeEnvironment({
278 |             METADATA_SERVER_DETECTION: "none",
279 |             GOOGLE_APPLICATION_CREDENTIALS: controlledAdc,
280 |             [v]: "valor-indevido",
281 |           }),
282 |         { code: "BLOCKED_ENV_VAR_PRESENT" }
283 |       );
284 |     }
285 | 
286 |     // 5. Existencia de arquivo well-known paralelo sob HOME/.config/gcloud -> REJEITADO
287 |     const fakeHome = join(dir, "fake-home");
288 |     mkdirSync(join(fakeHome, ".config", "gcloud"), { recursive: true });
289 |     writeFileSync(join(fakeHome, ".config", "gcloud", "application_default_credentials.json"), "{}", { mode: 0o600 });
290 |     assert.throws(
291 |       () =>
292 |         assertSafeProbeEnvironment({
293 |           METADATA_SERVER_DETECTION: "none",
294 |           GOOGLE_APPLICATION_CREDENTIALS: controlledAdc,
295 |           HOME: fakeHome,
296 |         }),
297 |       { code: "WELL_KNOWN_ADC_CONFLICT" }
298 |     );
299 |   } finally {
300 |     rmSync(dir, { recursive: true, force: true });
301 |   }
302 | });
303 | 
304 | test("E29-04. Arquivo ADC com symlink direto, symlink em diretorio pai, diretorio e caminho relativo", () => {
305 |   const dir = realpathSync(mkdtempSync(join(tmpdir(), "localiza-e29-sym-")));
306 |   try {
307 |     const realFile = join(dir, "real-adc.json");
308 |     writeFileSync(realFile, JSON.stringify(makeValidAdc()), { mode: 0o600 });
309 |     chmodSync(realFile, 0o600);
310 | 
311 |     // 1. Symlink direto -> REJEITADO
312 |     const directLink = join(dir, "link-adc.json");
313 |     symlinkSync(realFile, directLink);
314 |     assert.throws(() => readControlledAdcFile(directLink), { code: "ADC_SYMLINK_FORBIDDEN" });
315 | 
316 |     // 2. Symlink em diretorio pai -> REJEITADO
317 |     const realSub = join(dir, "real-sub");
318 |     mkdirSync(realSub, { mode: 0o700 });
319 |     const nestedFile = join(realSub, "adc.json");
320 |     writeFileSync(nestedFile, JSON.stringify(makeValidAdc()), { mode: 0o600 });
321 |     chmodSync(nestedFile, 0o600);
322 |     const parentLink = join(dir, "link-sub");
323 |     symlinkSync(realSub, parentLink);
324 |     assert.throws(() => readControlledAdcFile(join(parentLink, "adc.json")), { code: "ADC_PARENT_SYMLINK_FORBIDDEN" });
325 | 
326 |     // 3. Diretorio no lugar de arquivo regular -> REJEITADO
327 |     assert.throws(() => readControlledAdcFile(realSub), { code: "ADC_SPECIAL_FILE_FORBIDDEN" });
328 | 
329 |     // 4. Caminho relativo -> REJEITADO
330 |     assert.throws(() => readControlledAdcFile("relative/adc.json"), { code: "ADC_PATH_NOT_ABSOLUTE" });
331 |   } finally {
332 |     rmSync(dir, { recursive: true, force: true });
333 |   }
334 | });
335 | 
336 | test("E29-05. Arquivo ADC com permissoes inadequadas (0644, 0640, 0604 rejeitados; 0600 aceito)", () => {
337 |   const dir = realpathSync(mkdtempSync(join(tmpdir(), "localiza-e29-perm-")));
338 |   try {
339 |     const adcFile = join(dir, "adc.json");
340 |     writeFileSync(adcFile, JSON.stringify(makeValidAdc()), { mode: 0o600 });
341 | 
342 |     for (const badMode of [0o644, 0o640, 0o604, 0o666]) {
343 |       chmodSync(adcFile, badMode);
344 |       assert.throws(() => readControlledAdcFile(adcFile), { code: "ADC_INSECURE_PERMISSIONS" });
345 |     }
346 | 
347 |     chmodSync(adcFile, 0o600);
348 |     const content = readControlledAdcFile(adcFile);
349 |     assert.equal(JSON.parse(content).type, "impersonated_service_account");
350 |   } finally {
351 |     rmSync(dir, { recursive: true, force: true });
352 |   }
353 | });
354 | 
355 | test("E29-06. Divergencia entre identidade de origem e conta impersonada, campos inesperados e chaves duplicadas no ADC", () => {
356 |   // 1. Conta de origem igual a conta impersonada -> REJEITADO
357 |   const sameAsSa = makeValidAdc();
358 |   sameAsSa.source_credentials.account = FICTITIOUS_SA;
359 |   assert.throws(
360 |     () => validateImpersonatedAdcPayload(JSON.stringify(sameAsSa), { expectedServiceAccountEmail: FICTITIOUS_SA }),
361 |     { code: "SOURCE_EQUALS_IMPERSONATED_SA" }
362 |   );
363 | 
364 |   // 2. Conta de origem e outra conta de servico -> REJEITADO
365 |   const srcIsSa = makeValidAdc();
366 |   srcIsSa.source_credentials.account = OTHER_FICTITIOUS_SA;
367 |   assert.throws(
368 |     () => validateImpersonatedAdcPayload(JSON.stringify(srcIsSa), { expectedServiceAccountEmail: FICTITIOUS_SA }),
369 |     { code: "SOURCE_ACCOUNT_IS_SERVICE_ACCOUNT" }
370 |   );
371 | 
372 |   // 3. Conta de origem diverge do operador esperado -> REJEITADO
373 |   const validAdc = makeValidAdc();
374 |   assert.throws(
375 |     () =>
376 |       validateImpersonatedAdcPayload(JSON.stringify(validAdc), {
377 |         expectedServiceAccountEmail: FICTITIOUS_SA,
378 |         expectedSourceAccount: "outro.operador@ifpr.example.invalid",
379 |       }),
380 |     { code: "SOURCE_ACCOUNT_MISMATCH" }
381 |   );
382 | 
383 |   // 4. Campo inesperado na raiz do ADC -> REJEITADO
384 |   const extraRoot = { ...makeValidAdc(), token_uri: "https://evil.example.invalid/token" };
385 |   assert.throws(
386 |     () => validateImpersonatedAdcPayload(JSON.stringify(extraRoot), { expectedServiceAccountEmail: FICTITIOUS_SA }),
387 |     { code: "ADC_UNEXPECTED_KEY" }
388 |   );
389 | 
390 |   // 5. Campo inesperado em source_credentials -> REJEITADO
391 |   const extraSrc = makeValidAdc();
392 |   extraSrc.source_credentials.extra = "nao-permitido";
393 |   assert.throws(
394 |     () => validateImpersonatedAdcPayload(JSON.stringify(extraSrc), { expectedServiceAccountEmail: FICTITIOUS_SA }),
395 |     { code: "ADC_SOURCE_UNEXPECTED_KEY" }
396 |   );
397 | 
398 |   // 6. Chave JSON duplicada na string bruta do ADC -> REJEITADO
399 |   const dupAdcText = JSON.stringify(makeValidAdc(), null, 2).replace(
400 |     '"type": "authorized_user",',
401 |     '"type": "service_account", "type": "authorized_user",'
402 |   );
403 |   assert.throws(
404 |     () => validateImpersonatedAdcPayload(dupAdcText, { expectedServiceAccountEmail: FICTITIOUS_SA }),
405 |     { code: "ADC_DUPLICATE_JSON_KEY" }
406 |   );
407 | });
408 | 
409 | test("E29-07. Importacao dinamica e falha durante carregamento dos modulos Firebase Admin", async () => {
410 |   const fx = createSyntheticEnvDir();
411 |   try {
412 |     await assert.rejects(
413 |       () =>
414 |         runProbeReadOnlyV4({
415 |           env: fx.env,
416 |           loadFirebaseModules: async () => {
417 |             throw Object.assign(new Error("Simulated module load failure"), { code: "FIREBASE_MODULE_LOAD_FAILED" });
418 |           },
419 |         }),
420 |       { code: "FIREBASE_MODULE_LOAD_FAILED" }
421 |     );
422 |   } finally {
423 |     rmSync(fx.dir, { recursive: true, force: true });
424 |   }
425 | });
426 | 
427 | test("E29-08. Erro de encerramento da instancia Firebase Admin (deleteApp) nao e mascarado", async () => {
428 |   const fx = createSyntheticEnvDir();
429 |   try {
430 |     // Caso A: Query bem-sucedida, mas deleteApp falha -> deve propagar FIREBASE_APP_CLEANUP_FAILED
431 |     await assert.rejects(
432 |       () =>
433 |         runProbeReadOnlyV4({
434 |           env: fx.env,
435 |           loadFirebaseModules: async () => ({
436 |             applicationDefault: () => ({}),
437 |             initializeApp: (_o, name) => ({ name }),
438 |             getFirestore: () => ({
439 |               collection: () => ({
440 |                 select: () => ({
441 |                   limit: () => ({
442 |                     get: async () => ({ size: 1, empty: false }),
443 |                   }),
444 |                 }),
445 |               }),
446 |             }),
447 |             deleteApp: async () => {
448 |               throw new Error("Simulated deleteApp hang/error");
449 |             },
450 |           }),
451 |         }),
452 |       { code: "FIREBASE_APP_CLEANUP_FAILED" }
453 |     );
454 | 
455 |     // Caso B: Query falha E deleteApp tambem falha -> preserva erro principal + anexa cleanupErrorCode
456 |     let caught = null;
457 |     try {
458 |       await runProbeReadOnlyV4({
459 |         env: fx.env,
460 |         loadFirebaseModules: async () => ({
461 |           applicationDefault: () => ({}),
462 |           initializeApp: (_o, name) => ({ name }),
463 |           getFirestore: () => ({
464 |             collection: () => ({
465 |               select: () => ({
466 |                 limit: () => ({
467 |                   get: async () => {
468 |                     throw Object.assign(new Error("Simulated query denial"), { code: "permission-denied" });
469 |                   },
470 |                 }),
471 |               }),
472 |             }),
473 |           }),
474 |           deleteApp: async () => {
475 |             throw new Error("Simulated secondary cleanup failure");
476 |           },
477 |         }),
478 |       });
479 |     } catch (err) {
480 |       caught = err;
481 |     }
482 |     assert.ok(caught);
483 |     assert.equal(caught.code, "permission-denied");
484 |     assert.equal(caught.cleanupErrorCode, "FIREBASE_APP_CLEANUP_FAILED");
485 |   } finally {
486 |     rmSync(fx.dir, { recursive: true, force: true });
487 |   }
488 | });
489 | 
490 | test("E29-09. Ausencia total de dados individuais em stdout e stderr (sucesso e falha)", async () => {
491 |   const fx = createSyntheticEnvDir();
492 |   const SENSITIVE_UID = "RAW_UID_PESSOAL_987654321";
493 |   const SENSITIVE_EMAIL = "aluno.ficticio.pii@ifpr.edu.br";
494 |   const SENSITIVE_NAME = "Fulano Sintetico Confidencial";
495 | 
496 |   try {
497 |     // 1. Caminho de sucesso com resposta contendo documento PII em memoria (simula SDK)
498 |     const outObj = await runProbeReadOnlyV4({
499 |       env: fx.env,
500 |       loadFirebaseModules: async () => ({
501 |         applicationDefault: () => ({}),
502 |         initializeApp: (_o, name) => ({ name }),
503 |         getFirestore: () => ({
504 |           collection: () => ({
505 |             select: () => ({
506 |               limit: () => ({
507 |                 get: async () => ({
508 |                   size: 1,
509 |                   empty: false,
510 |                   docs: [
511 |                     {
512 |                       id: SENSITIVE_UID,
513 |                       ref: { path: `users/${SENSITIVE_UID}` },
514 |                       data: () => ({ email: SENSITIVE_EMAIL, name: SENSITIVE_NAME }),
515 |                     },
516 |                   ],
517 |                 }),
518 |               }),
519 |             }),
520 |           }),
521 |         }),
522 |         deleteApp: async () => {},
523 |       }),
524 |     });
525 | 
526 |     const serializedStdout = JSON.stringify(outObj);
527 |     assert.equal(serializedStdout.includes(SENSITIVE_UID), false);
528 |     assert.equal(serializedStdout.includes(SENSITIVE_EMAIL), false);
529 |     assert.equal(serializedStdout.includes(SENSITIVE_NAME), false);
530 |     assert.equal(serializedStdout.includes(fx.dir), false);
531 |     assert.equal(outObj.wireProjectionField, "__name__");
532 | 
533 |     // 2. Caminho CLI de falha (sem pin valido) -> stderr nao vaza caminhos locais, tokens ou PII
534 |     const cliFail = spawnSync(process.execPath, [PROBE_E29_PATH, "--execute-probe-readonly"], {
535 |       encoding: "utf8",
536 |       env: {
537 |         PATH: process.env.PATH,
538 |         ...fx.env,
539 |         TRUSTED_ADMIN_PUBKEY_SHA256: "0".repeat(64),
540 |       },
541 |     });
542 |     assert.notEqual(cliFail.status, 0);
543 |     assert.equal(cliFail.stdout, "");
544 |     const errJson = JSON.parse(cliFail.stderr);
545 |     assert.deepEqual(Object.keys(errJson).sort(), ["errorCode", "probeVersion", "status"]);
546 |     assert.equal(cliFail.stderr.includes(fx.dir), false);
547 |     assert.equal(cliFail.stderr.includes("fictitious-refresh-token"), false);
548 |   } finally {
549 |     rmSync(fx.dir, { recursive: true, force: true });
550 |   }
551 | });
552 | 
553 | test("E29-10. Comportamento exato de select() sem argumentos no @google-cloud/firestore@8.7.1 (offline, zero rede)", () => {
554 |   const { Firestore, FieldPath } = require("@google-cloud/firestore");
555 |   const db = new Firestore({
556 |     projectId: EXPECTED_PROJECT_ID,
557 |     databaseId: EXPECTED_DATABASE_ID,
558 |     credentials: { client_email: "ficticio@example.invalid", private_key: "ficticio" },
559 |   });
560 | 
561 |   const protoEmptySelect = db.collection("users").select().limit(1).toProto();
562 |   const protoExplicitDocId = db.collection("users").select(FieldPath.documentId()).limit(1).toProto();
563 |   const protoNoSelect = db.collection("users").limit(1).toProto();
564 | 
565 |   // Prova 1: select() sem argumentos solicita exatamente projection: { fields: [{ fieldPath: "__name__" }] }
566 |   assert.deepEqual(protoEmptySelect.structuredQuery.select, {
567 |     fields: [{ fieldPath: "__name__" }],
568 |   });
569 |   assert.deepEqual(protoEmptySelect, protoExplicitDocId);
570 | 
571 |   // Prova 2: Diferenca frente a consulta sem select() (que omitiria `select` e pediria todos os campos do documento)
572 |   assert.equal(protoNoSelect.structuredQuery.select, undefined);
573 | 
574 |   // Prova 3: Alvo exato no proto aponta para o banco nomeado e limite 1
575 |   assert.equal(
576 |     protoEmptySelect.parent,
577 |     `projects/${EXPECTED_PROJECT_ID}/databases/${EXPECTED_DATABASE_ID}/documents`
578 |   );
579 |   assert.deepEqual(protoEmptySelect.structuredQuery.limit, { value: 1 });
580 | });
581 | 
582 | test(
583 |   "E29-11. [NAO EXECUTADO - DEPENDE DE FIREBASE REAL] Verificacao de bytes gRPC RunQuery reais no banco nomeado",
584 |   { skip: "NAO EXECUTADO: Conexao ao Firebase/Firestore proibida na Etapa 29 (aprovacao exclusivamente estatica)" },
585 |   () => {}
586 | );
```

---

## 10. Limitações Não Resolvidas e Aviso Final de Não Autorização

### 10.1 Limitações Técnicas e Operacionais Não Resolvidas Nesta Etapa

1. **Dependência de Firebase Real (`E29-11` não executado):** A inspeção de bytes reais de resposta gRPC `RunQuery`, a conectividade TLS ao endpoint Firestore do banco nomeado `ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1` e o comportamento em runtime contra a coleção real `/users` **não foram testados** devido às restrições desta etapa.
2. **Correlação criptográfica do operador humano:** A inspeção local do JSON ADC (`source_credentials.account` / `client_id`) não comprova sozinha a identidade humana associada ao `refresh_token` OAuth; requer validação externa obrigatória via `oauth2/tokeninfo` e Cloud Audit Logs IAM (Seção 6).
3. **Residency física em VMs GCP:** Em uma estação que rode fisicamente dentro de uma VM Compute Engine (onde DMI/BIOS ou MAC identifica GCP), `gcpMetadata.getGCPResidency()` pode retornar `true` mesmo com `METADATA_SERVER_DETECTION=none`. Portanto, a execução futura deverá ocorrer em estação externa fora de infraestrutura GCP ou com bloqueio explícito de rede ao `169.254.169.254`.
4. **Exposição transitória de 1 UID em memória do SDK durante a sonda:** Mesmo com `select().limit(1)`, a resposta gRPC inclui `document.name` com 1 UID bruto em memória do SDK (não acessado, não gravado e não impresso pela sonda).
5. **Ausência de promoção:** Os candidatos das Etapas 28 e 29 permanecem isolados sob `scripts/audit/candidates/`. Nenhuma promoção para `scripts/audit/` foi realizada; uma eventual futura etapa dedicada de promoção exigirá decisão explícita.
6. **Ausência de evidências IAM reais:** Nenhuma das 8 evidências administrativas da Seção 6 foi coletada nesta etapa.

### 10.2 Aviso Explícito de Não Autorização

> **AVISO FINAL OBRIGATÓRIO:**
> A aprovação registrada nesta Etapa 29 possui caráter **EXCLUSIVAMENTE ESTÁTICO, LOCAL E DOCUMENTAL**.
> **NENHUMA AUTORIZAÇÃO** é concedida para:
> - conectar ao Firebase ou Firestore real;
> - obter ou utilizar credenciais ADC reais;
> - executar impersonação de contas de serviço;
> - consultar ou alterar políticas IAM reais;
> - executar `probe-readonly-v4` ou `--execute-readonly-live` contra produção;
> - ler, alterar ou migrar documentos reais de `/users`;
> - alterar ou publicar `firestore.rules`;
> - promover candidatos ou realizar deploy, commit ou push.

---

**FIM DO DOCUMENTO — SELO DE INTEGRIDADE ETAPA 29**
- Documento: `docs/audit/LOCALIZA_ETAPA_29_AUDITORIA_INDEPENDENTE.md` / `.pdf`
- Projeto de referência: `gen-lang-client-0490390966`
- Banco nomeado de referência: `ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1`
- Regressões: 51/51 PASS | Novos testes sintéticos Etapa 29: 10/10 PASS + 1 SKIP (`E29-11`, Firebase real proibido)
- Integridade dos 8 artefatos originais e 4 candidatos Etapa 28: 100% PRESERVADA
- Autorização de execução externa: **NÃO CONCEDIDA**
