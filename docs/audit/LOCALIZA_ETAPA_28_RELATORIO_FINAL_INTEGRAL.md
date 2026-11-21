# LOCALIZA+ v1.10.13 — Etapa 28: Revisão Final de Integridade, Completude e Segurança do Procedimento de Auditoria Externa

- **Data/Hora UTC da Revisão Estática:** `2026-11-20T14:31:53.868Z`
- **Projeto Firebase Alvo (Referência Documental):** `gen-lang-client-0490390966`
- **Banco Firestore Nomeado (Referência Documental):** `ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1`
- **Coleção-Alvo:** `/users`
- **Modo de Execução da Etapa 28:** EXCLUSIVAMENTE ESTÁTICO, DOCUMENTAL E SINTÉTICO (zero conexão Firebase/Firestore, zero ADC, zero IAM, zero sonda real, zero deploy/commit/push).
- **Classificação da Etapa 28:** **APROVADA PARA HOMOLOGAÇÃO DOCUMENTAL E ESTATICA (SEM AUTORIZAÇÃO DE EXECUÇÃO REAL)**.

> **AVISO FINAL OBRIGATÓRIO:** Esta aprovação representa exclusivamente homologação documental e estática. Ela **NÃO** autoriza execução da auditoria real, acesso ao banco nomeado, obtenção de credenciais ADC, impersonação de conta de serviço, alteração de políticas IAM ou leitura de documentos reais de `/users`. Qualquer autorização de execução externa dependerá de etapa posterior, independente e explicitamente aprovada com evidências administrativas externas.

## 1. Verificação de Preservação e Integridade dos 8 Artefatos Originais + 4 Artefatos Candidatos

Os cinco artefatos homologados da Etapa 21 e os três artefatos produzidos na Etapa 27 permaneceram **100% íntegros e sem modificações**. Todas as correções de lacunas identificadas nesta auditoria foram produzidas em cópias candidatas separadas sob `scripts/audit/candidates/etapa28/`, com diferenças documentadas e justificadas.

### 1.1 Inventário e Hashes SHA-256 dos 8 Artefatos Preservados

| # | Grupo | Caminho | Bytes | Linhas | SHA-256 |
|---|---|---|---:|---:|---|
| 1 | Etapa 21 (Homologado) | `scripts/audit/audit-users-readonly.mjs` | 53723 | 1126 | `6dbe7c68c1fe56e71ca2130f0f4a6165aefad3f34b1e88fb943eb0a37729c00b` |
| 2 | Etapa 21 (Homologado) | `scripts/audit/audit-users-readonly.test.mjs` | 47875 | 953 | `a1e3f2b7b28c63e8c4303bbfd903c90a27de4b9acaab6bd2e1d7c17f02c87879` |
| 3 | Etapa 21 (Homologado) | `firestore.rules` | 57716 | 1275 | `2f2a2ffc8c471d7fe97b5d1d2bb3c2a3ca27d39947be64449ad13a532c851f9e` |
| 4 | Etapa 21 (Homologado) | `package.json` | 1783 | 64 | `50d5c9494e06310b11ca9da58906049e5a0ee3f44e90b70d3ae18225722508a7` |
| 5 | Etapa 21 (Homologado) | `package-lock.json` | 451206 | 15412 | `40f70133d9ab8306afde0619bf494cdaf7b6e22188770109b1fdcb84c7186f81` |
| 6 | Etapa 27 (Preservado) | `scripts/audit/verify-approval-record.mjs` | 13129 | 317 | `4d36c2c75e5d5c56d7ca1799681e63549d51308ff3229177333f4c4e8b9d629f` |
| 7 | Etapa 27 (Preservado) | `scripts/audit/validate-audit-summary.mjs` | 16943 | 416 | `595fce54acb7af0aeb722dcdbb5d98227e18e8df411eaa1ea0aaa6c2eae98a08` |
| 8 | Etapa 27 (Preservado) | `scripts/audit/validate-audit-summary.test.mjs` | 22627 | 534 | `64de6fd574ac0a1b166d91ba5d50b1214bd652eba7184193f76db23030b14112` |

### 1.2 Inventário e Hashes SHA-256 dos 4 Artefatos Candidatos (Etapa 28)

| # | Grupo | Caminho | Bytes | Linhas | SHA-256 |
|---|---|---|---:|---:|---|
| 1 | Etapa 28 (Candidato) | `scripts/audit/candidates/etapa28/verify-approval-record.candidate.mjs` | 17050 | 426 | `1b33c2e41d62d668556ccf4dc9a59d97350eab77ce448b9b7e22b5a45dddc610` |
| 2 | Etapa 28 (Candidato) | `scripts/audit/candidates/etapa28/validate-audit-summary.candidate.mjs` | 19307 | 484 | `3aae9b5a7084b166d40c1c3839399607df23f036690330c1c08a72f6875171c5` |
| 3 | Etapa 28 (Candidato) | `scripts/audit/candidates/etapa28/probe-readonly-v4.candidate.mjs` | 17053 | 404 | `e2e3254c01877b1ef6bf3b21e8ee703ab0139c95859e1dfdd4b4135107eb90c9` |
| 4 | Etapa 28 (Candidato) | `scripts/audit/candidates/etapa28/etapa28-security.test.mjs` | 30363 | 789 | `ae55f54fda2f9347d0ad5a40eac3d2760fe5810ce8a83fdbc85aa83f3d634763` |

### 1.3 Verificações Estáticas (`node --check`, Importação Sem Credenciais e Confirmação de Não-Truncamento)

| Arquivo | `node --check` | Importação em `env -i` (sem credenciais) | Confirmação de Integridade |
|---|---|---|---|
| `scripts/audit/verify-approval-record.mjs` | OK (exit 0) | OK (10 exports) | Integral em disco, sem truncamento |
| `scripts/audit/validate-audit-summary.mjs` | OK (exit 0) | OK (18 exports) | Integral em disco, sem truncamento |
| `scripts/audit/validate-audit-summary.test.mjs` | OK (exit 0) | N/A (arquivo de teste node:test) | Integral em disco, sem truncamento |
| `scripts/audit/candidates/etapa28/verify-approval-record.candidate.mjs` | OK (exit 0) | OK (14 exports) | Integral em disco, sem truncamento |
| `scripts/audit/candidates/etapa28/validate-audit-summary.candidate.mjs` | OK (exit 0) | OK (19 exports) | Integral em disco, sem truncamento |
| `scripts/audit/candidates/etapa28/probe-readonly-v4.candidate.mjs` | OK (exit 0) | OK (8 exports) | Integral em disco, sem truncamento |
| `scripts/audit/candidates/etapa28/etapa28-security.test.mjs` | OK (exit 0) | N/A (arquivo de teste node:test) | Integral em disco, sem truncamento |

## 2. Revisão da Assinatura Digital Ed25519 (`verify-approval-record.mjs` e Candidato C1–C4)

### 2.1 Auditoria dos 10 Pontos Obrigatórios

1. **Allowlist exata das 12 chaves do registro:** `schemaVersion`, `approvalId`, `projectId`, `databaseId`, `collectionName`, `serviceAccountEmail`, `purpose`, `scope`, `issuedAt`, `expiresAt`, `revoked`, `issuerKeyId` — validada via `assertExactKeys` (Etapa 27 e Candidato Etapa 28).
2. **Rejeição de propriedades adicionais e campos ausentes:** Rejeita `UNEXPECTED_RECORD_KEY` (inclusive `__proto__` via `Object.keys`) e `MISSING_RECORD_KEY` para qualquer uma das 12 chaves.
3. **Canonicalização determinística e separação de domínio:** `canonicalizeApprovalRecord` ordena chaves lexicograficamente e concatena o prefixo fixo `LOCALIZA_AUDIT_APPROVAL_V1\n` antes de assinar/verificar.
4. **Verificação Ed25519 sobre bytes canônicos:** Executa `crypto.verify(null, canonicalBytes, publicKeyObj, sigBytes)` antes de confiar em qualquer campo semântico.
5. **Verificação do fingerprint SHA-256 da chave pública SPKI DER:** `computePublicKeyFingerprintSha256` exige chave `asymmetricKeyType === 'ed25519'`, exporta `spki`/`der` e calcula SHA-256 hex lowercase.
6. **Comparação em tempo constante:** `timingSafeEqual(Buffer.from(actualPin, 'hex'), Buffer.from(expectedPin, 'hex'))` — sem vazamento por timing.
7. **Rejeição de assinatura inválida, adulteração, expiração e revogação:** Cobre `INVALID_DIGITAL_SIGNATURE`, `APPROVAL_RECORD_EXPIRED`, `APPROVAL_RECORD_NOT_YET_VALID`, `VALIDITY_WINDOW_TOO_LONG` (>7 dias), `INVALID_VALIDITY_WINDOW`, `APPROVAL_RECORD_REVOKED` (flag `revoked: true` ou presença em `revokedApprovalIds`).
8. **Validação de projeto, banco, coleção, finalidade, escopo e conta de serviço:** Confere valores exatos `gen-lang-client-0490390966`, `ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1`, `users`, `READ_ONLY_USERS_COMPATIBILITY_AUDIT`, `READ_ONLY` e regex estrita de conta de serviço do projeto.
9. **Tratamento de formatos inválidos, tipos incorretos e lacunas corrigidas na cópia candidata:**
   - **Lacuna C1 (Corrigida no candidato):** No arquivo da Etapa 27, `Date.parse('2026-02-30T10:00:00.000Z')` no motor V8 faz rollover silencioso para `2026-03-02`. O candidato implementa verificação de round-trip de calendário (`INVALID_TIMESTAMP_CALENDAR`).
   - **Lacuna C2 (Corrigida no candidato):** `JSON.parse` aceita silenciosamente chaves duplicadas no JSON bruto. O candidato inclui `assertNoDuplicateTopLevelJsonKeys` (`DUPLICATE_RECORD_KEY`).
   - **Lacuna C3 (Corrigida no candidato):** O candidato exige Base64 estritamente canônico de 88 caracteres (`^[A-Za-z0-9+/]{86}==$`) com round-trip exato para 64 bytes.
   - **Lacuna C4 (Corrigida no candidato):** O candidato rejeita coerções de `referenceTime` (`null`, `''`, booleano), rejeita `revokedApprovalIds` não-array (em vez de tratar silenciosamente como `[]`), exige `EXPECTED_AUDIT_SA` obrigatório na CLI (`EXPECTED_AUDIT_SA_MISSING`) e bloqueia arquivos de entrada symlink (`SYMLINK_INPUT_FORBIDDEN`).
10. **Códigos de saída não zero em qualquer falha:** Tanto a versão Etapa 27 quanto o candidato encerram com `process.exitCode = 1` e JSON sanitizado em `stderr` contendo apenas `verified: false` e `errorCode`.

### 2.2 Cadeia de Confiança Independente da Chave Pública e por que Hash do Registro ≠ Autoria

- **O hash SHA-256 do registro (`canonicalRecordSha256`) NÃO prova autoria:** qualquer pessoa capaz de criar ou editar um arquivo JSON consegue calcular o SHA-256 desse mesmo arquivo. O SHA-256 serve exclusivamente como identificador determinístico de integridade para correlação em logs.
- **Prova de autoria depende de âncora de confiança obtida por canal independente (Out-of-Band):** se o mesmo operador que apresenta `approval.json` e `approval.sig` também fornecer `trusted.pub.pem` e `TRUSTED_ADMIN_PUBKEY_SHA256`, o operador poderia gerar seu próprio par Ed25519 e satisfazer toda a verificação matemática local.
- **Procedimento obrigatório de confirmação independente pelo operador/auditor:**
  1. O aprovador institucional (identidade administrativa distinta do operador executor) gera ou mantém a chave privada Ed25519 sob custódia exclusiva (HSM, Cloud KMS assimétrico ou cofre administrativo com MFA/auditoria).
  2. O aprovador publica a chave pública (`SPKI PEM`) e seu fingerprint `SHA-256 (SPKI DER)` em canal oficial imutável e autenticado separado da entrega do registro (ex.: registro institucional assinado em sistema de controle de mudanças/ITSM com SSO+MFA, ou tag assinada/objeto versionado em repositório governado sob aprovação de dois fatores, com conferência visual/oral por segundo canal).
  3. Na estação executora, o valor de `TRUSTED_ADMIN_PUBKEY_SHA256` é fixado diretamente a partir desse canal institucional independente — nunca copiado de um arquivo empacotado pelo próprio operador.
  4. O verificador compara em tempo constante o SHA-256 SPKI DER da chave em disco com a âncora independente antes de validar a assinatura Ed25519.

## 3. Revisão da Identidade e do IAM (Estática — Sem Consultas IAM Reais)

### 3.1 Separação Conceitual Obrigatória das 8 Camadas de Identidade e Permissão

| Camada | Definição Técnica | O que Comprova | Limitação / O que NÃO Comprova |
|---|---|---|---|
| 1. Identidade do Operador | Pessoa física/servidor institucional responsável pela execução na estação externa. | Responsabilidade administrativa nominal quando vinculada a controle de acesso corporativo/SSO/MFA. | Não é provada por arquivos locais no disco nem por `service_account_impersonation_url`. |
| 2. Identidade das Credenciais de Origem | Credencial OAuth (`authorized_user` em `source_credentials`) cujo `refresh_token` solicita o token de curta duração à API `iamcredentials.googleapis.com`. | Qual credencial OAuth local está configurada como origem para pedir impersonação. | O arquivo JSON ADC (`authorized_user`) contém `client_id`/`refresh_token`, mas **não contém prova criptográfica do e-mail humano autenticado**; somente `oauth2/tokeninfo` ou logs Cloud Audit (IAM) vinculam a sessão real ao principal. |
| 3. Conta de Serviço Impersonada | Identidade dedicada `SA@gen-lang-client-0490390966.iam.gserviceaccount.com` que efetivamente assina a chamada ao Firestore. | Qual principal de destino é alvo da URL `generateAccessToken`. | Ver a URL no ADC **não prova** quem é o operador de origem nem quais papéis a SA efetivamente possui no GCP. |
| 4. Permissão de Impersonação | Papel `roles/iam.serviceAccountTokenCreator` (ou permissão `iam.serviceAccounts.getAccessToken`) concedido ao principal de origem sobre a SA dedicada. | Autorização para emitir tokens de curta duração da SA sem usar chave privada JSON estática. | Deve ser estritamente vinculada ao principal autorizado e com condição temporal (IAM Condition) quando aplicável; revogável imediatamente após a janela. |
| 5. Permissões Efetivas da Conta de Serviço | União de todas as permissões realmente avaliadas pelo IAM do GCP sobre o recurso Firestore alvo para a SA. | O conjunto real de ações (`datastore.entities.get`, `list`, eventual escrita indesejada etc.). | A presença isolada de `roles/datastore.viewer` **NÃO prova ausência de permissões adicionais** (ex.: `roles/datastore.user`, `roles/editor`, `roles/owner`, `roles/firebase.admin`). |
| 6. Permissões Herdadas (Projeto, Pasta, Organização) | Políticas IAM herdadas de níveis superiores da hierarquia GCP (Org → Folder → Project → Resource). | Concessões aditivas que elevam silenciosamente privilégios da SA mesmo que a política local do projeto pareça mínima. | Consultar apenas o nível do projeto sem inspecionar ancestrais (ancestors/Policy Analyzer) pode ocultar permissões de escrita herdadas. |
| 7. Concessões por Grupos | Papéis concedidos a Google Groups dos quais a SA ou o operador sejam membros diretos ou transitivos. | Elevação indireta de privilégios via associação de grupo. | Não aparece ao filtrar bindings apenas pelo e-mail direto da SA; exige inspeção administrativa de membresia ou IAM Policy Analyzer. |
| 8. Papéis Adicionais e Permissões Personalizadas | Papéis básicos (`Owner`/`Editor`), predefinidos extras ou `Custom Roles` contendo ações `datastore.*` / `firestore.*` / `iam.*`. | Possível capacidade de escrita, exclusão ou alteração de Rules fora do escopo read-only. | Exige inspeção explícita de todos os papéis (incluindo definição de Custom Roles) anexados à SA antes de qualquer aprovação. |

### 3.2 Declarações Explícitas de Não-Prova

- **A verificação de `service_account_impersonation_url` NÃO prova a identidade de origem do operador:** ela valida apenas o destino da chamada `generateAccessToken` declarado no arquivo ADC local.
- **A presença de `roles/datastore.viewer` NÃO prova ausência de permissões adicionais:** no GCP IAM, permissões são estritamente aditivas (exceto sob Deny Policies explícitas); a SA pode possuir simultaneamente `roles/datastore.viewer` e papéis com escrita/administração por concessão direta, grupo, papel customizado ou herança de pasta/organização.

### 3.3 Evidências Administrativas Externas Obrigatórias Antes de Qualquer Autorização Futura

Nenhuma execução externa futura poderá ser autorizada sem que a administração do projeto GCP entregue formalmente (por canal administrativo auditável) as seguintes evidências (nenhuma delas consultada ou executada nesta Etapa 28):

1. **Inventário completo de políticas ancestrais (`get-ancestors-iam-policy`)** da SA dedicada em Organização, Pastas e Projeto `gen-lang-client-0490390966`, comprovando ausência total de permissões de escrita/exclusão/administração no Firestore (`datastore.entities.create/update/delete`, `datastore.indexes.*`, `firebaserules.*`, `roles/editor`, `roles/owner`).
2. **Relatório do Cloud Asset Inventory / IAM Policy Analyzer** listando todas as permissões efetivas da SA (incluindo expansão de grupos e Custom Roles) no projeto alvo.
3. **Política IAM da própria SA** comprovando que `roles/iam.serviceAccountTokenCreator` está restrito exclusivamente ao operador nomeado (sem `allUsers`, `allAuthenticatedUsers` ou grupos amplos) e com janela de expiração definida.
4. **Confirmação de ausência de chaves privadas estáticas ativas** na SA dedicada (`iam service-accounts keys list` com zero chaves `USER_MANAGED`).
5. **Registro de aprovação assinado em Ed25519** emitido pela autoridade administrativa com chave pública e fingerprint SPKI SHA-256 ancorados em canal independente.
6. **Confirmação de Cloud Audit Logs (Data Access — DATA_READ / ADMIN_READ)** habilitados para `firestore.googleapis.com` e `iamcredentials.googleapis.com` no projeto alvo para rastreabilidade completa.

## 4. Revisão Integral da Sonda Read-Only (`probe-readonly-v4`)

Na Etapa 27, o trecho da sonda no PDF foi cortado na página 9 no meio de `process.stdout.write(...)`. Na Etapa 28, a sonda completa foi formalizada em código verificável (`scripts/audit/candidates/etapa28/probe-readonly-v4.candidate.mjs`), integralmente auditada e testada sem conexão ao Firebase.

### 4.1 Verificação dos 11 Controles Obrigatórios

1. **Validação do registro assinado ANTES de token/Firebase Admin:** Executada na Etapa A de `runProbeReadOnlyV4`, antes mesmo de ler o arquivo ADC ou executar `import('firebase-admin/app')` (comprovado no teste `E28-11`).
2. **Bloqueio de variáveis de ambiente de redirecionamento:** `assertSafeProbeEnvironment` bloqueia 15 variáveis (`FIREBASE_CONFIG`, `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `GCLOUD_PROJECT`, `GOOGLE_CLOUD_PROJECT`, `GCP_PROJECT`, `GOOGLE_CLOUD_QUOTA_PROJECT`, `GCE_METADATA_HOST`, `GCE_METADATA_ROOT`, `GCE_METADATA_IP`, `METADATA_SERVER_HOST`, `CLOUDSDK_CORE_PROJECT`, `CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT`, `GOOGLE_API_USE_CLIENT_CERTIFICATE`, `NODE_TLS_REJECT_UNAUTHORIZED`).
3. **Bloqueio de fallback para Metadata Server:** Exige explicitamente `NO_GCE_CHECK=true` (`METADATA_FALLBACK_NOT_DISABLED`) e caminho explícito `GOOGLE_APPLICATION_CREDENTIALS` para arquivo regular não-symlink.
4. **Verificação da identidade e tipo das credenciais ADC:** `validateImpersonatedAdcPayload` exige `type === 'impersonated_service_account'`, `source_credentials.type === 'authorized_user'`, ausência de `private_key`/`private_key_id`, `delegates` vazio/ausente, `quota_project_id` coerente e `universe_domain === 'googleapis.com'`.
5. **Conferência exata da conta de serviço aprovada:** Extrai a SA do caminho canônico da URL HTTPS `iamcredentials.googleapis.com` (sem porta explícita, sem userinfo, sem traversal, sem query/hash, método exato `:generateAccessToken`) e compara exatamente com `approval.serviceAccountEmail`.
6. **Conferência do projeto e do banco nomeado:** `validateProbeTarget` exige correspondência exata com `gen-lang-client-0490390966` e `ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1`.
7. **Rejeição explícita do banco `(default)`:** Checagem dedicada `if (databaseId === '(default)') throw DEFAULT_DATABASE_FORBIDDEN`.
8. **Consulta limitada a `users` com `limit(1)`:** Executa exclusivamente `db.collection('users').select().limit(1).get()` — sem campos de documento trafegados e sem qualquer método de escrita.
9. **Ausência total de PII na saída:** Lê apenas `snap.size` e `snap.empty`; nunca acessa nem imprime `doc.id`, `doc.data()`, UID, e-mail, nome ou tokens.
10. **Tratamento de falhas com código de saída não zero:** Em `catch`, imprime JSON mínimo `{ probeVersion, status: 'PROBE_READONLY_REJECTED', errorCode }` em `stderr` e define `process.exitCode = 1`.
11. **Encerramento garantido do Firebase Admin:** Bloco `finally` invoca `await deleteAppFn(firebaseApp)` incondicionalmente sempre que a instância tiver sido inicializada.

### 4.2 O que a Sonda Comprova vs. O que a Sonda NÃO Comprova

- **O que comprova (quando executada em etapa futura autorizada):**
  - Que o registro Ed25519, o ambiente local e o arquivo ADC de impersonação passaram nas validações fail-closed;
  - Que a SA impersonada consegue estabelecer conectividade read-only ao banco nomeado alvo e consultar até 1 documento na coleção `users`.
- **O que NÃO comprova:**
  - **NÃO é auditoria integral da coleção `/users`:** ler 0 ou 1 documento nada informa sobre compatibilidade, regras, status, bloqueios ou inconsistências dos demais documentos;
  - **NÃO comprova ausência de permissões de escrita ou papéis excessivos na SA** (apenas evidências IAM externas comprovam mínimo privilégio);
  - **NÃO comprova a identidade humana do operador de origem** apenas pela inspeção local do JSON ADC;
  - **NÃO substitui a execução do auditor homologado (`audit-users-readonly.mjs`) nem a validação do resumo (`validate-audit-summary`).**

## 5. Revisão do Validador de Resumo (`validate-audit-summary.mjs` e Candidato V1–V2)

Todos os 13 requisitos obrigatórios foram verificados diretamente no código da Etapa 27 e reforçados na cópia candidata da Etapa 28:

1. **Allowlist exata em todos os níveis:** `TOP_LEVEL_KEYS` (8), `SUMMARY_TOP_LEVEL_KEYS` (7, sem `results`), `METADATA_KEYS` (11), `REFERENCE_TIME_NS_KEYS` (2), `PAGINATION_KEYS` (7), `CLASSIFICATION_KEYS` (5).
2. **Recontagem independente das classificações:** Itera todos os elementos de `results`, valida `maskedUid` (`^uid_[a-f0-9]{12}$`) e `classification`, e exige igualdade exata com `counts.*`.
3. **Coerência entre `totalRead`, paginação, resultados e contagens:** Valida `sum(counts) === totalRead === results.length`. **Reforço V1 no candidato:** adiciona `totalRead <= pagesFetched * pageSize` (`PAGINATION_COUNT_EXCEEDS_CAPACITY`) e `pagesFetched === 1` quando `totalRead === 0` (`INVALID_EMPTY_COLLECTION_PAGES`).
4. **Detecção de duplicidades:** Rejeita `pagination.duplicateDocIdsCount !== 0` e qualquer `maskedUid` repetido em `results` (`DUPLICATE_RESULT_ENTRY`).
5. **Detecção de paginação incompleta e cursor estagnado:** Rejeita `completed !== true` e `stagnantCursorDetected !== false`.
6. **Detecção de erros de leitura:** Rejeita `readError !== null` e `stderrText.trim().length > 0`.
7. **Coerência entre `verdictCode`, texto `verdict` e contagens:** Confere `VERDICT_MAP` exato e deriva `expectedCode` (`C` > `B` > `A`) das contagens validadas, rejeitando qualquer divergência.
8. **Tratamento correto de coleção vazia:** Aceita `totalRead === 0` somente com `verdictCode === 'D'`, `verdict === VERDICT_MAP.D`, `inconclusiveReasons: ['EMPTY_COLLECTION']` e (no candidato) `pagesFetched === 1`. Rejeita falso veredito `A`.
9. **Tratamento de `unexpectedClassificationsCount`:** Exige inteiro estritamente igual a `0`.
10. **Tratamento de `inconclusiveReasons`:** Exige array de strings vazio em relatórios não vazios e `['EMPTY_COLLECTION']` exato em coleção vazia.
11. **Ausência de dados individuais no resumo compartilhável:** Reconstrói objeto novo somente com chaves agregadas e aplica `assertShareableSummarySafe` antes de retornar ou gravar.
12. **Nenhum resumo gravado quando a validação falhar:** `validateAndExtractAuditSummary` executa integralmente antes de qualquer operação de escrita.
13. **Arquivo de saída com permissões restritas (`0600`) — Lacuna V2 corrigida no candidato:** No arquivo da Etapa 27, `writeFileSync(outPath, ..., { mode: 0o600 })` preserva permissões frouxas se `outPath` já existir com `0644` e segue symlinks. O candidato introduz `writeRestrictedSummaryFile`, que rejeita symlinks, diretórios e arquivos pré-existentes com bits de grupo/outros (`INSECURE_EXISTING_OUTPUT_PERMISSIONS`), executa `chmodSync(outPath, 0o600)`, valida pós-escrita `(mode & 0o777) === 0o600` e apaga o arquivo recém-criado caso a verificação falhe.

## 6. Resultado Real dos Testes Sintéticos (Sem Credenciais e Sem Firebase)

- **Ambiente de execução:** `env -i PATH="$PATH" node --test --test-reporter=spec ...`
- **Resumo Efetivo Total:** **51 testes executados | 51 aprovados | 0 falhos | 0 ignorados | 0 cancelados**.
  - Suíte 1 (`scripts/audit/audit-users-readonly.test.mjs`): **15 testes | 15 aprovados | 0 falhos | 0 ignorados**.
  - Suíte 2 (`scripts/audit/validate-audit-summary.test.mjs`): **25 testes | 25 aprovados | 0 falhos | 0 ignorados**.
  - Suíte 3 (`scripts/audit/candidates/etapa28/etapa28-security.test.mjs`): **11 testes | 11 aprovados | 0 falhos | 0 ignorados**.

### 6.1 Saída Real da Suíte 1 — Auditor Homologado (15 testes)
```text
✔ Metadados identificam implementacao independente da Etapa 19 sem expor UID bruto (9.618447ms)
✔ Root Admin: documento limpo, bloqueado com token Auth confirmado (divergencia Rules vs Frontend/Serverless) e sem role/aprovacao (1.657758ms)
✔ Papeis nao-root: ADMIN (aprovado/pendente/sem approvalStatus), SERVIDOR (aprovado/pendente), ALUNO e INTRUSO (0.834456ms)
✔ Suspensao indefinida (status suspended sem suspendedUntil) NUNCA e BLOQUEIO_INTENCIONAL_COMPATIVEL (0.463734ms)
✔ Suspensao com prazo (futuro, expirado, null) e blockExpiresAt (ausente, null, futuro, expirado) (0.44004ms)
✔ Precisao de nanossegundos (=, -1ns, +1ns mesmo ms, +1ms) e Epoch 0 / pre-1970 (0.283558ms)
✔ Tipos temporais invalidos (ISO string, string vazia, numero, boolean, array, mapa plano, Date) (0.572069ms)
✔ Campos status (ausente, null, vazio, inactive, desconhecido), active (ausente, null, false) e id !== docId (0.279423ms)
✔ Paginacao por cursor e agregador global A, B, C e D (vazia, erro, incompleta, cursor estagnado, duplicado, inesperada) (1.945021ms)
✔ Zero vazamento de PII, UID bruto ou caminhos locais na saida serializada (0.522996ms)
✔ Verificacao estatica: zero imports estaticos do Firebase e zero metodos de escrita no auditor (9.171901ms)
✔ Etapa 21 Correcao 1: Identidade Root Admin em Rules vs Frontend (token valido, ausente, e-mail divergente/nao verificado, UID diferente, fallback doc.email) (0.621827ms)
✔ Etapa 21 Correcao 2: Separacao estrita entre camada Rules e camada Frontend (mapa plano expirado e divergencia +1ns) (0.255638ms)
✔ Etapa 21 Correcao 3: Modelagem fiel dos Branches 1, 2 e 3 de update em /users (3.310548ms)
✔ Etapa 21 Correcao 4: Matriz de classificacao de mapa plano { seconds, nanoseconds } (0.447623ms)
ℹ tests 15
ℹ suites 0
ℹ pass 15
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 120.917841
```

### 6.2 Saída Real da Suíte 2 — Validador e Assinatura Etapa 27 (25 testes)
```text
✔ 01. Relatorio valido com zero documentos (preserva veredito D EMPTY_COLLECTION e rejeita falso veredito A) (124.478046ms)
✔ 02. Relatorio valido com documentos de todas as 5 classificacoes (46.757506ms)
✔ 03. Contagem divergente (soma diferente de totalRead e divergencia frente a recontagem de results) (87.999272ms)
✔ 04. Resultado individual ausente (results.length menor que pagination.totalRead) (49.212301ms)
✔ 05. Resultado individual duplicado (maskedUid duplicado em results e duplicateDocIdsCount > 0) (107.985874ms)
✔ 06. Paginacao incompleta (pagination.completed === false) (57.205925ms)
✔ 07. Erro de leitura (pagination.readError preenchido) (57.176307ms)
✔ 08. Cursor estagnado (pagination.stagnantCursorDetected === true) (48.151673ms)
✔ 09. Classificacao desconhecida em results e em counts (100.636731ms)
✔ 10. Campo inesperado na raiz (52.658773ms)
✔ 11. Campo inesperado em objeto aninhado (metadata e pagination) (116.750572ms)
✔ 12. Campo obrigatorio ausente (47.267326ms)
✔ 13. Tipo incorreto em campos numericos e booleanos (100.823116ms)
✔ 14. SHA-256 invalido ou divergente (49.921114ms)
✔ 15. Commit invalido ou divergente (47.763148ms)
✔ 16. Veredito divergente do codigo e das contagens (104.795274ms)
✔ 17. Resultado inconclusivo (verdictCode D com documentos lidos) (46.258355ms)
✔ 18. unexpectedClassificationsCount diferente de zero (56.599202ms)
✔ 19. inconclusiveReasons nao vazio em relatorio nao vazio (49.108633ms)
✔ 20. Registro de aprovacao adulterado apos assinatura Ed25519 (121.171996ms)
✔ 21. Assinatura digital invalida (56.41944ms)
✔ 22. Chave publica nao confiavel (assinatura propria de atacante sem pin confiavel) (57.678603ms)
✔ 23. Registro administrativo expirado e registro revogado (110.27698ms)
✔ 24. Conta de servico diferente da aprovada no registro assinado (50.516242ms)
✔ 25. Tentativa de inserir dados individuais no resumo final e verificacao de stderr nao vazio (47.830198ms)
ℹ tests 25
ℹ suites 0
ℹ pass 25
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1893.524072
```

### 6.3 Saída Real da Suíte 3 — Lacunas de Segurança e Sonda Etapa 28 (11 testes)
```text
✔ E28-01. Fingerprint alterado junto com chave publica substituida (rejeicao contra ancora confiavel independente) (9.644992ms)
✔ E28-02. Registro assinado com finalidade (purpose) ou escopo (scope) incorreto (2.225615ms)
✔ E28-03. Registro com datas invalidas (calendario inexistente, formato invalido, janela > 7d, inversao e referenceTime invalido) (3.79515ms)
✔ E28-04. Registro com campos adicionais, ausentes ou chaves JSON duplicadas (3.599354ms)
✔ E28-05. URL de impersonacao com hostname, porta, protocolo, caminho ou parametros indevidos (1.827976ms)
✔ E28-06. ADC com identidade de origem inesperada, chave privada estatica, delegates ou quota_project divergente (0.6077ms)
✔ E28-07. Conta de servico com identificador divergente no registro, na URL ADC e no dominio do projeto (2.155241ms)
✔ E28-08. Resumo que omite resultados individuais (results ausente, truncado ou vazio para totalRead > 0) (2.406311ms)
✔ E28-09. Resumo com contagens manipuladas e incoerencia matematica de paginacao (1.878323ms)
✔ E28-10. Falha de escrita e permissoes inadequadas no arquivo final (0644 pre-existente, symlink, diretorio, pos-escrita) (51.061873ms)
✔ E28-11. Sonda probe-readonly-v4: bloqueio de env vars, (default), limit!=1, ordem fail-closed e verificacao estatica integral (104.275271ms)
ℹ tests 11
ℹ suites 0
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 273.142252
```

## 7. Matriz de Pendências Resolvidas e Não Resolvidas (Pré-requisitos Externos)

| ID | Pendência | Origem | Status na Etapa 28 | Evidência / Condição |
|---|---|---|---|---|
| P1 | Truncamento do PDF da Etapa 27 na página 9 (`process.stdout.write`) | Etapa 27 | **RESOLVIDA** | Código completo da sonda + MD integral + PDF completo com conferência visual da última página. |
| P2 | Ausência de arquivo executável/testável para `probe-readonly-v4` | Etapa 27 | **RESOLVIDA (Candidato)** | `scripts/audit/candidates/etapa28/probe-readonly-v4.candidate.mjs` + teste `E28-11`. |
| P3 | Rollover silencioso de datas inválidas no V8 (`2026-02-30`) | Auditoria E28 | **RESOLVIDA (Candidato C1)** | Round-trip de calendário em `verify-approval-record.candidate.mjs` + teste `E28-03`. |
| P4 | Chaves JSON duplicadas / Base64 não canônico / `EXPECTED_AUDIT_SA` opcional na CLI | Auditoria E28 | **RESOLVIDA (Candidato C2–C4)** | `assertNoDuplicateTopLevelJsonKeys`, regex 88 chars `==`, `EXPECTED_AUDIT_SA` obrigatório + testes `E28-04`, `E28-11`. |
| P5 | Permissão `0600` ignorada se arquivo de saída pré-existir com `0644` ou symlink | Auditoria E28 | **RESOLVIDA (Candidato V2)** | `writeRestrictedSummaryFile` com rejeição de `0644`/symlink/diretório + verificação pós-escrita (`E28-10`). |
| P6 | Coerência `totalRead <= pagesFetched * pageSize` e `pagesFetched === 1` em coleção vazia | Auditoria E28 | **RESOLVIDA (Candidato V1)** | `validate-audit-summary.candidate.mjs` + teste `E28-09`. |
| P7 | Cobertura de testes para URL de impersonação, ADC de origem e permissões de saída | Etapa 28 | **RESOLVIDA** | 11 novos testes em `etapa28-security.test.mjs` (total 51/51 aprovados). |
| P8 | Promoção das cópias candidatas para substituir os arquivos da Etapa 27 | Governança | **PENDENTE DE DECISÃO EXPLÍCITA** | Etapa 28 preservou integralmente os 8 arquivos originais conforme restrição da Seção 2. |
| P9 | Entrega da chave pública Ed25519 e fingerprint SPKI SHA-256 por canal administrativo independente | Externo / Admin | **NÃO RESOLVIDA (PRÉ-REQUISITO EXTERNO)** | Exige ação da autoridade administrativa fora do AI Studio antes de qualquer execução real. |
| P10 | Evidências IAM completas (políticas ancestrais, Policy Analyzer, zero chaves estáticas, Cloud Audit Logs) | Externo / GCP IAM | **NÃO RESOLVIDA (PRÉ-REQUISITO EXTERNO)** | Proibido consultar IAM nesta etapa; obrigatório antes da etapa futura de autorização. |
| P11 | Autorização explícita para execução real da sonda e da auditoria read-only de `/users` | Governança | **NÃO AUTORIZADA** | Deverá ser objeto de etapa posterior, dedicada e explicitamente aprovada. |

## 8. Procedimento Externo Revisado (Referência Documental — SEM AUTORIZAÇÃO DE EXECUÇÃO)

Este procedimento revisado **NÃO está autorizado para execução nesta etapa**. Serve exclusivamente como roteiro homologado estaticamente para futura etapa autorizada:

1. **Pré-requisitos Administrativos (Fora da Estação Executora):**
   - Receber e arquivar as 6 evidências IAM descritas na Seção 3.3 (políticas ancestrais, Policy Analyzer, `serviceAccountTokenCreator` restrito, zero chaves estáticas, Cloud Audit Logs habilitados, e chave pública Ed25519 + fingerprint SPKI SHA-256 publicados em canal institucional independente).
   - Promover explicitamente (em etapa de governança) os artefatos candidatos aprovados da Etapa 28 ou confirmar a versão exata cujos hashes SHA-256 serão verificados na estação.
2. **Preparação Limpa da Estação Externa:**
   - Clonar o commit homologado, conferir SHA-256 dos artefatos de auditoria e `firestore.rules`, instalar dependências de forma reproduzível (`npm ci --ignore-scripts` quando não houver compilação nativa requerida pelo ambiente, validando previamente integridade do `package-lock.json`).
   - Garantir `umask 077`, diretório de quarentena `0700` e ausência de variáveis bloqueadas (`BLOCKED_ENV_VARS`).
3. **Verificação Criptográfica Prévia (Sem Conexão):**
   - Fixar `TRUSTED_ADMIN_PUBKEY_SHA256` diretamente do canal independente e executar `verify-approval-record.candidate.mjs` exigindo exit code `0`. Qualquer erro aborta imediatamente.
4. **Sonda Mínima de Conectividade (`probe-readonly-v4.candidate.mjs`):**
   - Executar em ambiente controlado com `NO_GCE_CHECK=true` e `GOOGLE_APPLICATION_CREDENTIALS` apontando para ADC `impersonated_service_account` com `source_credentials.type === 'authorized_user'`, verificando `PROBE_READONLY_OK` sem PII e ciente de que a sonda comprova apenas conectividade de 1 documento.
5. **Execução da Auditoria Read-Only e Validação por Allowlist:**
   - Executar `scripts/audit/audit-users-readonly.mjs --execute-readonly-live` direcionando `stdout` e `stderr` exclusivamente para arquivos em quarentena `0600`.
   - Executar `validate-audit-summary.candidate.mjs` para produzir o resumo agregado `0600` (sem `results`, sem PII). Em qualquer rejeição ou `stderr` não vazio, interromper e não compartilhar saída.
6. **Encerramento e Revogação Pós-Janela:**
   - Revogar `roles/iam.serviceAccountTokenCreator` da janela temporária, destruir arquivos ADC e quarentena bruta com exclusão segura após validação e preservar apenas o resumo agregado validado + evidências de auditoria.

## 9. Conteúdo Integral dos 3 Artefatos Preservados da Etapa 27 (Sem Omissões)

### 9.1 `scripts/audit/verify-approval-record.mjs` (13129 bytes | 317 linhas | SHA-256: `4d36c2c75e5d5c56d7ca1799681e63549d51308ff3229177333f4c4e8b9d629f`)

```javascript
#!/usr/bin/env node
/**
 * LOCALIZA+ v1.10.13 — Etapa 27
 * Verificador criptografico de registro de aprovacao administrativa (Ed25519).
 *
 * Garantias:
 * - Autenticidade verificada via assinatura digital Ed25519 sobre representacao canonica deterministica.
 * - Chave publica obrigatoriamente pinada por fingerprint SHA-256 (SPKI DER) obtido por canal independente.
 * - SHA-256 do registro e calculado apenas como identificador de integridade, nunca como prova de autoria.
 * - Zero conexao Firebase, zero escrita no Firestore, zero exposicao de chaves privadas ou tokens.
 */

import { createHash, createPublicKey, timingSafeEqual, verify } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const EXPECTED_PROJECT_ID = "gen-lang-client-0490390966";
export const EXPECTED_DATABASE_ID = "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1";
export const EXPECTED_COLLECTION_NAME = "users";
export const EXPECTED_SCHEMA_VERSION = "localiza-audit-approval-v1";
export const EXPECTED_SCOPE = "READ_ONLY";
export const EXPECTED_PURPOSE = "READ_ONLY_USERS_COMPATIBILITY_AUDIT";
export const SIGNATURE_DOMAIN_PREFIX = "LOCALIZA_AUDIT_APPROVAL_V1\n";

const APPROVAL_RECORD_KEYS = Object.freeze([
  "schemaVersion",
  "approvalId",
  "projectId",
  "databaseId",
  "collectionName",
  "serviceAccountEmail",
  "purpose",
  "scope",
  "issuedAt",
  "expiresAt",
  "revoked",
  "issuerKeyId",
]);

const APPROVAL_ID_RE = /^[A-Z0-9][A-Z0-9._-]{3,63}$/;
const ISSUER_KEY_ID_RE = /^[a-zA-Z0-9._-]{3,64}$/;
const SERVICE_ACCOUNT_RE = /^[a-z][a-z0-9-]{4,28}[a-z0-9]@gen-lang-client-0490390966\.iam\.gserviceaccount\.com$/;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
const SHA256_HEX_RE = /^[a-f0-9]{64}$/;
const MAX_VALIDITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_TOLERANCE_MS = 60 * 1000;

function makeError(code, message) {
  return Object.assign(new Error(message), { code });
}

function assertExactKeys(obj, allowedKeys, context) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw makeError("INVALID_RECORD_STRUCTURE", `Expected object at ${context}`);
  }
  const allowedSet = new Set(allowedKeys);
  for (const key of Object.keys(obj)) {
    if (!allowedSet.has(key)) {
      throw makeError("UNEXPECTED_RECORD_KEY", `Unexpected key ${context}.${key}`);
    }
  }
  for (const key of allowedKeys) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      throw makeError("MISSING_RECORD_KEY", `Missing required key ${context}.${key}`);
    }
  }
}

function canonicalSort(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalSort(item));
  }
  if (value && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = canonicalSort(value[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Serializacao canonica deterministica (chaves ordenadas lexicograficamente + prefixo de dominio).
 */
export function canonicalizeApprovalRecord(record) {
  assertExactKeys(record, APPROVAL_RECORD_KEYS, "approvalRecord");
  const json = JSON.stringify(canonicalSort(record));
  return Buffer.from(`${SIGNATURE_DOMAIN_PREFIX}${json}`, "utf8");
}

/**
 * Calcula o fingerprint SHA-256 (hex lowercase) dos bytes SPKI DER de uma chave publica Ed25519.
 */
export function computePublicKeyFingerprintSha256(publicKeyPem) {
  if (typeof publicKeyPem !== "string" || publicKeyPem.trim().length === 0) {
    throw makeError("INVALID_PUBLIC_KEY", "Public key PEM must be a non-empty string");
  }
  let keyObj;
  try {
    keyObj = createPublicKey(publicKeyPem);
  } catch {
    throw makeError("INVALID_PUBLIC_KEY", "Unable to parse public key PEM");
  }
  if (keyObj.asymmetricKeyType !== "ed25519") {
    throw makeError("UNSUPPORTED_KEY_ALGORITHM", `Expected ed25519 public key, received ${String(keyObj.asymmetricKeyType)}`);
  }
  const spkiDer = keyObj.export({ type: "spki", format: "der" });
  return createHash("sha256").update(spkiDer).digest("hex");
}

function parseStrictIsoUtc(value, fieldName) {
  if (typeof value !== "string" || !ISO_UTC_RE.test(value)) {
    throw makeError("INVALID_TIMESTAMP_FORMAT", `Field ${fieldName} must be strict ISO-8601 UTC`);
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw makeError("INVALID_TIMESTAMP_FORMAT", `Field ${fieldName} is not a valid date`);
  }
  return ms;
}

/**
 * Valida assinatura digital Ed25519, pin de chave publica confiavel, escopo, expiracao,
 * revogacao e correspondencia exata de projeto, banco e conta de servico.
 */
export function verifySignedApprovalRecord({
  recordJsonText,
  signatureBase64,
  trustedPublicKeyPem,
  trustedPublicKeySha256,
  expectedServiceAccountEmail = null,
  revokedApprovalIds = [],
  referenceTime = new Date(),
}) {
  if (typeof recordJsonText !== "string" || recordJsonText.trim().length === 0) {
    throw makeError("MISSING_APPROVAL_RECORD", "Approval record content is empty");
  }
  if (typeof signatureBase64 !== "string" || signatureBase64.trim().length === 0) {
    throw makeError("MISSING_SIGNATURE", "Signature base64 is required");
  }
  const expectedPin = typeof trustedPublicKeySha256 === "string" ? trustedPublicKeySha256.trim().toLowerCase() : "";
  if (!SHA256_HEX_RE.test(expectedPin)) {
    throw makeError("INVALID_TRUSTED_KEY_PIN", "trustedPublicKeySha256 must be a valid 64-char hex SHA-256");
  }

  // 1. Verificar pin criptografico da chave publica confiavel (obtida por canal independente)
  const actualPin = computePublicKeyFingerprintSha256(trustedPublicKeyPem);
  const pinMatches = timingSafeEqual(Buffer.from(actualPin, "hex"), Buffer.from(expectedPin, "hex"));
  if (!pinMatches) {
    throw makeError("UNTRUSTED_PUBLIC_KEY_FINGERPRINT", "Public key SPKI SHA-256 does not match trusted pin");
  }

  // 2. Parsear e validar allowlist estrutural do registro
  let record;
  try {
    record = JSON.parse(recordJsonText);
  } catch {
    throw makeError("INVALID_RECORD_JSON", "Approval record is not valid JSON");
  }
  assertExactKeys(record, APPROVAL_RECORD_KEYS, "approvalRecord");

  // 3. Verificar assinatura digital Ed25519 sobre o conteudo canonico antes de confiar nos campos
  const canonicalBytes = canonicalizeApprovalRecord(record);
  const sigTrimmed = signatureBase64.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(sigTrimmed)) {
    throw makeError("INVALID_SIGNATURE_FORMAT", "Signature is not valid base64");
  }
  const sigBytes = Buffer.from(sigTrimmed, "base64");
  if (sigBytes.length !== 64) {
    throw makeError("INVALID_SIGNATURE_LENGTH", `Ed25519 signature must be 64 bytes, got ${sigBytes.length}`);
  }
  const publicKeyObj = createPublicKey(trustedPublicKeyPem);
  const signatureValid = verify(null, canonicalBytes, publicKeyObj, sigBytes);
  if (!signatureValid) {
    throw makeError("INVALID_DIGITAL_SIGNATURE", "Ed25519 digital signature verification failed");
  }

  // 4. Validar campos semanticos, alvo, escopo, janela temporal e revogacao
  if (record.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    throw makeError("INVALID_SCHEMA_VERSION", `Unsupported schemaVersion: ${String(record.schemaVersion)}`);
  }
  if (typeof record.approvalId !== "string" || !APPROVAL_ID_RE.test(record.approvalId)) {
    throw makeError("INVALID_APPROVAL_ID", "Invalid approvalId format");
  }
  if (record.projectId !== EXPECTED_PROJECT_ID) {
    throw makeError("PROJECT_ID_MISMATCH", "Approval record projectId does not match target project");
  }
  if (record.databaseId !== EXPECTED_DATABASE_ID) {
    throw makeError("DATABASE_ID_MISMATCH", "Approval record databaseId does not match target named database");
  }
  if (record.collectionName !== EXPECTED_COLLECTION_NAME) {
    throw makeError("COLLECTION_NAME_MISMATCH", "Approval record collectionName must be users");
  }
  if (typeof record.serviceAccountEmail !== "string" || !SERVICE_ACCOUNT_RE.test(record.serviceAccountEmail)) {
    throw makeError("INVALID_SERVICE_ACCOUNT_FORMAT", "Invalid dedicated service account email format");
  }
  if (record.purpose !== EXPECTED_PURPOSE) {
    throw makeError("INVALID_PURPOSE", "Approval record purpose mismatch");
  }
  if (record.scope !== EXPECTED_SCOPE) {
    throw makeError("INVALID_SCOPE", "Approval record scope must be READ_ONLY");
  }
  if (typeof record.issuerKeyId !== "string" || !ISSUER_KEY_ID_RE.test(record.issuerKeyId)) {
    throw makeError("INVALID_ISSUER_KEY_ID", "Invalid issuerKeyId format");
  }
  if (typeof record.revoked !== "boolean") {
    throw makeError("INVALID_REVOKED_TYPE", "revoked must be boolean");
  }
  const revokedSet = new Set(Array.isArray(revokedApprovalIds) ? revokedApprovalIds : []);
  if (record.revoked === true || revokedSet.has(record.approvalId)) {
    throw makeError("APPROVAL_RECORD_REVOKED", "Approval record has been revoked");
  }

  const issuedMs = parseStrictIsoUtc(record.issuedAt, "issuedAt");
  const expiresMs = parseStrictIsoUtc(record.expiresAt, "expiresAt");
  if (expiresMs <= issuedMs) {
    throw makeError("INVALID_VALIDITY_WINDOW", "expiresAt must be strictly after issuedAt");
  }
  if (expiresMs - issuedMs > MAX_VALIDITY_WINDOW_MS) {
    throw makeError("VALIDITY_WINDOW_TOO_LONG", "Approval record validity window exceeds 7 days");
  }
  const refMs = referenceTime instanceof Date ? referenceTime.getTime() : Number(referenceTime);
  if (!Number.isFinite(refMs)) {
    throw makeError("INVALID_REFERENCE_TIME", "referenceTime is invalid");
  }
  if (refMs < issuedMs - CLOCK_SKEW_TOLERANCE_MS) {
    throw makeError("APPROVAL_RECORD_NOT_YET_VALID", "Approval record issuedAt is in the future");
  }
  if (refMs >= expiresMs) {
    throw makeError("APPROVAL_RECORD_EXPIRED", "Approval record has expired");
  }

  if (expectedServiceAccountEmail !== null && expectedServiceAccountEmail !== undefined) {
    const trimmedExpected = String(expectedServiceAccountEmail).trim();
    if (trimmedExpected !== record.serviceAccountEmail) {
      throw makeError("SERVICE_ACCOUNT_MISMATCH", "Service account does not match signed approval record");
    }
  }

  // SHA-256 calculado apenas como identificador de integridade (autoria ja comprovada via Ed25519)
  const recordSha256 = createHash("sha256").update(canonicalBytes).digest("hex");

  return {
    verified: true,
    algorithm: "ed25519",
    approvalId: record.approvalId,
    projectId: record.projectId,
    databaseId: record.databaseId,
    collectionName: record.collectionName,
    serviceAccountEmail: record.serviceAccountEmail,
    scope: record.scope,
    purpose: record.purpose,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
    issuerKeyId: record.issuerKeyId,
    trustedPublicKeySha256: actualPin,
    canonicalRecordSha256: recordSha256,
  };
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

function runCli() {
  const recordPath = (process.env.APPROVED_AUDIT_RECORD_FILE || "").trim();
  const sigPath = (process.env.APPROVED_AUDIT_SIGNATURE_FILE || "").trim();
  const pubKeyPath = (process.env.TRUSTED_ADMIN_PUBKEY_FILE || "").trim();
  const pubKeyPin = (process.env.TRUSTED_ADMIN_PUBKEY_SHA256 || "").trim();
  const expectedSa = (process.env.EXPECTED_AUDIT_SA || "").trim() || null;
  const revokedFile = (process.env.REVOKED_APPROVAL_IDS_FILE || "").trim();

  if (!recordPath || !existsSync(recordPath)) {
    throw makeError("APPROVAL_RECORD_FILE_MISSING", "APPROVED_AUDIT_RECORD_FILE missing");
  }
  if (!sigPath || !existsSync(sigPath)) {
    throw makeError("APPROVAL_SIGNATURE_FILE_MISSING", "APPROVED_AUDIT_SIGNATURE_FILE missing");
  }
  if (!pubKeyPath || !existsSync(pubKeyPath)) {
    throw makeError("TRUSTED_PUBKEY_FILE_MISSING", "TRUSTED_ADMIN_PUBKEY_FILE missing");
  }

  let revokedIds = [];
  if (revokedFile) {
    if (!existsSync(revokedFile)) {
      throw makeError("REVOKED_LIST_FILE_MISSING", "REVOKED_APPROVAL_IDS_FILE specified but not found");
    }
    const parsedRevoked = JSON.parse(readFileSync(revokedFile, "utf8"));
    if (!Array.isArray(parsedRevoked) || !parsedRevoked.every((v) => typeof v === "string")) {
      throw makeError("INVALID_REVOKED_LIST", "REVOKED_APPROVAL_IDS_FILE must be a JSON string array");
    }
    revokedIds = parsedRevoked;
  }

  const verification = verifySignedApprovalRecord({
    recordJsonText: readFileSync(recordPath, "utf8"),
    signatureBase64: readFileSync(sigPath, "utf8"),
    trustedPublicKeyPem: readFileSync(pubKeyPath, "utf8"),
    trustedPublicKeySha256: pubKeyPin,
    expectedServiceAccountEmail: expectedSa,
    revokedApprovalIds: revokedIds,
  });

  process.stdout.write(JSON.stringify(verification, null, 2) + "\n");
}

if (isDirectExecution()) {
  try {
    runCli();
  } catch (err) {
    const code = err && typeof err.code === "string" ? err.code : "APPROVAL_VERIFICATION_ERROR";
    process.stderr.write(JSON.stringify({ verified: false, errorCode: code }) + "\n");
    process.exitCode = 1;
  }
}
```

### 9.2 `scripts/audit/validate-audit-summary.mjs` (16943 bytes | 416 linhas | SHA-256: `595fce54acb7af0aeb722dcdbb5d98227e18e8df411eaa1ea0aaa6c2eae98a08`)

```javascript
#!/usr/bin/env node
/**
 * LOCALIZA+ v1.10.13 — Etapa 27
 * Validador independente por allowlist estrita para o resumo agregado da auditoria read-only de `/users`.
 *
 * Garantias:
 * - Allowlist exata em todos os niveis (raiz, metadata, metadata.referenceTimeNs, pagination, counts).
 * - Recontagem independente de `results` sem copiar nenhum dado individual para o resumo compartilhavel.
 * - Detecta `verdictCode: "D"` mesmo quando o auditor homologado encerra com exit code 0.
 * - Rejeita qualquer inconsistencia antes de gravar o arquivo de resumo.
 * - Zero conexao Firebase, zero dependencias externas.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const EXPECTED_IMPLEMENTATION_ORIGIN = "ETAPA_19_INDEPENDENT_IMPLEMENTATION";
export const EXPECTED_AUDITOR_VERSION = "etapa21-v1.1.0";
export const EXPECTED_PROJECT_ID = "gen-lang-client-0490390966";
export const EXPECTED_DATABASE_ID = "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1";
export const EXPECTED_COLLECTION_NAME = "users";
export const EXPECTED_RULES_COMMIT = "dab549f777c00981028eb5515f65d3a1d7058538";
export const EXPECTED_RULES_SHA256 = "2f2a2ffc8c471d7fe97b5d1d2bb3c2a3ca27d39947be64449ad13a532c851f9e";
export const EXPECTED_ROOT_MASKED_UID = "uid_d8665880b647";
export const EXPECTED_MODE = "READ_ONLY";

export const TOP_LEVEL_KEYS = Object.freeze([
  "metadata",
  "pagination",
  "verdict",
  "verdictCode",
  "counts",
  "unexpectedClassificationsCount",
  "inconclusiveReasons",
  "results",
]);

export const SUMMARY_TOP_LEVEL_KEYS = Object.freeze([
  "metadata",
  "pagination",
  "verdictCode",
  "verdict",
  "counts",
  "unexpectedClassificationsCount",
  "inconclusiveReasons",
]);

export const METADATA_KEYS = Object.freeze([
  "implementationOrigin",
  "auditorVersion",
  "projectId",
  "databaseId",
  "collectionName",
  "rulesCommit",
  "rulesSha256Expected",
  "rootAdminMaskedUid",
  "mode",
  "referenceTimeIso",
  "referenceTimeNs",
]);

export const REFERENCE_TIME_NS_KEYS = Object.freeze(["seconds", "nanoseconds"]);

export const PAGINATION_KEYS = Object.freeze([
  "pageSize",
  "pagesFetched",
  "totalRead",
  "completed",
  "duplicateDocIdsCount",
  "stagnantCursorDetected",
  "readError",
]);

export const CLASSIFICATION_KEYS = Object.freeze([
  "DOCUMENTO_COMPATIVEL",
  "BLOQUEIO_INTENCIONAL_COMPATIVEL",
  "INCONSISTENCIA_DE_DADOS",
  "PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE",
  "DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO",
]);

export const VERDICT_MAP = Object.freeze({
  A: "A_APTO_SEM_INCOMPATIBILIDADE_DETECTADA",
  B: "B_REQUER_REVISAO_OU_NORMALIZACAO_PREVIA",
  C: "C_NAO_APTO_HA_PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE",
  D: "D_AUDITORIA_INCONCLUSIVA_OU_INCOMPLETA",
});

const CLASSIFICATION_SET = new Set(CLASSIFICATION_KEYS);
const ISO_MS_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const COMMIT_RE = /^[a-f0-9]{40}$/;
const MASKED_UID_RE = /^uid_[a-f0-9]{12}$/;

function makeError(code, message) {
  return Object.assign(new Error(message), { code });
}

function assertExactKeys(obj, allowedKeys, context) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw makeError("INVALID_OBJECT_TYPE", `Expected plain object at ${context}`);
  }
  const allowedSet = new Set(allowedKeys);
  for (const key of Object.keys(obj)) {
    if (!allowedSet.has(key)) {
      throw makeError("UNEXPECTED_KEY", `Unexpected key ${context}.${key}`);
    }
  }
  for (const key of allowedKeys) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      throw makeError("MISSING_REQUIRED_KEY", `Missing required key ${context}.${key}`);
    }
  }
}

/**
 * Barreira final de saida: garante que o objeto de resumo compartilhavel contem
 * exclusivamente as chaves agregadas permitidas e nenhum campo individual (`results`, etc.).
 */
export function assertShareableSummarySafe(summaryObj) {
  assertExactKeys(summaryObj, SUMMARY_TOP_LEVEL_KEYS, "summary");
  assertExactKeys(summaryObj.metadata, METADATA_KEYS, "summary.metadata");
  assertExactKeys(summaryObj.metadata.referenceTimeNs, REFERENCE_TIME_NS_KEYS, "summary.metadata.referenceTimeNs");
  assertExactKeys(summaryObj.pagination, PAGINATION_KEYS, "summary.pagination");
  assertExactKeys(summaryObj.counts, CLASSIFICATION_KEYS, "summary.counts");
  if (Object.prototype.hasOwnProperty.call(summaryObj, "results")) {
    throw makeError("INDIVIDUAL_RESULTS_FORBIDDEN_IN_SUMMARY", "Summary must never contain results");
  }
  return true;
}

/**
 * Valida o JSON bruto produzido pelo auditor homologado e retorna exclusivamente
 * um novo objeto de resumo agregado validado por allowlist.
 *
 * Nota sobre colecao vazia (0 documentos):
 * Conforme `scripts/audit/audit-users-readonly.mjs:946`, uma colecao vazia com paginacao
 * concluida sem erros produz exatamente `totalRead: 0`, `results: []`, `verdictCode: "D"`,
 * `verdict: "D_AUDITORIA_INCONCLUSIVA_OU_INCOMPLETA"` e `inconclusiveReasons: ["EMPTY_COLLECTION"]`.
 * Esse caso e aceito preservando integralmente seu veredito `"D"` e `["EMPTY_COLLECTION"]`,
 * enquanto qualquer outro veredito `"D"` ou motivo inconclusivo e rejeitado.
 */
export function validateAndExtractAuditSummary(rawReport, { stderrText = "" } = {}) {
  if (typeof stderrText !== "string") {
    throw makeError("INVALID_STDERR_INPUT", "stderrText must be a string");
  }
  if (stderrText.trim().length > 0) {
    throw makeError("NON_EMPTY_STDERR", "Non-empty stderr requires manual quarantine inspection");
  }

  let data = rawReport;
  if (typeof rawReport === "string") {
    try {
      data = JSON.parse(rawReport);
    } catch {
      throw makeError("INVALID_JSON", "Raw audit report is not valid JSON");
    }
  }

  // 1. Allowlist exata de todas as chaves em todos os niveis
  assertExactKeys(data, TOP_LEVEL_KEYS, "root");
  assertExactKeys(data.metadata, METADATA_KEYS, "metadata");
  assertExactKeys(data.metadata.referenceTimeNs, REFERENCE_TIME_NS_KEYS, "metadata.referenceTimeNs");
  assertExactKeys(data.pagination, PAGINATION_KEYS, "pagination");
  assertExactKeys(data.counts, CLASSIFICATION_KEYS, "counts");

  // 2. Validacao de metadados, versao, origem, projeto, banco, colecao, SHA-256, commit e tempo
  const m = data.metadata;
  if (m.implementationOrigin !== EXPECTED_IMPLEMENTATION_ORIGIN) {
    throw makeError("INVALID_IMPLEMENTATION_ORIGIN", "Unexpected auditor implementationOrigin");
  }
  if (m.auditorVersion !== EXPECTED_AUDITOR_VERSION) {
    throw makeError("INVALID_AUDITOR_VERSION", "Unexpected auditorVersion");
  }
  if (m.projectId !== EXPECTED_PROJECT_ID) {
    throw makeError("INVALID_PROJECT_ID", "Unexpected projectId");
  }
  if (m.databaseId !== EXPECTED_DATABASE_ID) {
    throw makeError("INVALID_DATABASE_ID", "Unexpected databaseId");
  }
  if (m.collectionName !== EXPECTED_COLLECTION_NAME) {
    throw makeError("INVALID_COLLECTION_NAME", "Unexpected collectionName");
  }
  if (typeof m.rulesCommit !== "string" || !COMMIT_RE.test(m.rulesCommit) || m.rulesCommit !== EXPECTED_RULES_COMMIT) {
    throw makeError("INVALID_RULES_COMMIT", "rulesCommit is invalid or does not match homologated commit");
  }
  if (typeof m.rulesSha256Expected !== "string" || !SHA256_RE.test(m.rulesSha256Expected) || m.rulesSha256Expected !== EXPECTED_RULES_SHA256) {
    throw makeError("INVALID_RULES_SHA256", "rulesSha256Expected is invalid or does not match homologated hash");
  }
  if (typeof m.rootAdminMaskedUid !== "string" || !MASKED_UID_RE.test(m.rootAdminMaskedUid) || m.rootAdminMaskedUid !== EXPECTED_ROOT_MASKED_UID) {
    throw makeError("INVALID_ROOT_MASKED_UID", "rootAdminMaskedUid mismatch");
  }
  if (m.mode !== EXPECTED_MODE) {
    throw makeError("INVALID_MODE", "Auditor mode must be READ_ONLY");
  }
  if (typeof m.referenceTimeIso !== "string" || !ISO_MS_UTC_RE.test(m.referenceTimeIso) || Number.isNaN(Date.parse(m.referenceTimeIso))) {
    throw makeError("INVALID_REFERENCE_TIME_ISO", "referenceTimeIso is invalid");
  }
  const ns = m.referenceTimeNs;
  if (
    !Number.isInteger(ns.seconds) ||
    ns.seconds <= 0 ||
    !Number.isInteger(ns.nanoseconds) ||
    ns.nanoseconds < 0 ||
    ns.nanoseconds >= 1_000_000_000
  ) {
    throw makeError("INVALID_REFERENCE_TIME_NS", "referenceTimeNs out of valid bounds");
  }
  const expectedIso = new Date(ns.seconds * 1000 + Math.floor(ns.nanoseconds / 1_000_000)).toISOString();
  if (m.referenceTimeIso !== expectedIso) {
    throw makeError("REFERENCE_TIME_MISMATCH", "referenceTimeIso does not match referenceTimeNs");
  }

  // 3. Validacao integral da paginacao
  const p = data.pagination;
  if (!Number.isInteger(p.pageSize) || p.pageSize < 1 || p.pageSize > 1000) {
    throw makeError("INVALID_PAGE_SIZE", "pagination.pageSize must be integer 1..1000");
  }
  if (!Number.isInteger(p.pagesFetched) || p.pagesFetched < 1) {
    throw makeError("INVALID_PAGES_FETCHED", "pagination.pagesFetched must be integer >= 1");
  }
  if (!Number.isInteger(p.totalRead) || p.totalRead < 0) {
    throw makeError("INVALID_TOTAL_READ", "pagination.totalRead must be integer >= 0");
  }
  if (p.completed !== true) {
    throw makeError("INCOMPLETE_PAGINATION", "pagination.completed must be true");
  }
  if (!Number.isInteger(p.duplicateDocIdsCount) || p.duplicateDocIdsCount !== 0) {
    throw makeError("DUPLICATE_DOC_IDS_DETECTED", "pagination.duplicateDocIdsCount must be 0");
  }
  if (p.stagnantCursorDetected !== false) {
    throw makeError("STAGNANT_CURSOR_DETECTED", "pagination.stagnantCursorDetected must be false");
  }
  if (p.readError !== null) {
    throw makeError("READ_ERROR_PRESENT", "pagination.readError must be null");
  }

  // 4. Validacao real de unexpectedClassificationsCount e inconclusiveReasons (sem constantes artificiais)
  if (!Number.isInteger(data.unexpectedClassificationsCount) || data.unexpectedClassificationsCount !== 0) {
    throw makeError("UNEXPECTED_CLASSIFICATIONS_NON_ZERO", "unexpectedClassificationsCount must be 0");
  }
  if (!Array.isArray(data.inconclusiveReasons) || !data.inconclusiveReasons.every((r) => typeof r === "string")) {
    throw makeError("INVALID_INCONCLUSIVE_REASONS_TYPE", "inconclusiveReasons must be a string array");
  }

  // 5. Validacao das contagens e recontagem independente sobre `results`
  const validatedCounts = {};
  let countsSum = 0;
  for (const key of CLASSIFICATION_KEYS) {
    const val = data.counts[key];
    if (!Number.isInteger(val) || val < 0) {
      throw makeError("INVALID_COUNT_VALUE", `counts.${key} must be a non-negative integer`);
    }
    validatedCounts[key] = val;
    countsSum += val;
  }
  if (countsSum !== p.totalRead) {
    throw makeError("COUNTS_SUM_MISMATCH", `Sum of counts (${countsSum}) does not match pagination.totalRead (${p.totalRead})`);
  }

  if (!Array.isArray(data.results)) {
    throw makeError("INVALID_RESULTS_TYPE", "results must be an array");
  }
  if (data.results.length !== p.totalRead) {
    throw makeError("RESULTS_LENGTH_MISMATCH", `results.length (${data.results.length}) does not match pagination.totalRead (${p.totalRead})`);
  }

  const recounted = Object.fromEntries(CLASSIFICATION_KEYS.map((k) => [k, 0]));
  const seenMaskedUids = new Set();
  for (let i = 0; i < data.results.length; i += 1) {
    const item = data.results[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw makeError("INVALID_RESULT_ITEM", `results[${i}] must be an object`);
    }
    if (typeof item.maskedUid !== "string" || !MASKED_UID_RE.test(item.maskedUid)) {
      throw makeError("INVALID_RESULT_MASKED_UID", `results[${i}].maskedUid has invalid format`);
    }
    if (seenMaskedUids.has(item.maskedUid)) {
      throw makeError("DUPLICATE_RESULT_ENTRY", `Duplicate maskedUid detected at results[${i}]`);
    }
    seenMaskedUids.add(item.maskedUid);

    if (typeof item.classification !== "string" || !CLASSIFICATION_SET.has(item.classification)) {
      throw makeError("UNKNOWN_CLASSIFICATION", `Unknown classification at results[${i}]`);
    }
    recounted[item.classification] += 1;
  }

  for (const key of CLASSIFICATION_KEYS) {
    if (recounted[key] !== validatedCounts[key]) {
      throw makeError("RECOUNT_MISMATCH", `Recounted ${key} (${recounted[key]}) differs from counts.${key} (${validatedCounts[key]})`);
    }
  }

  // 6. Validacao da coerencia entre veredito, codigo, contagens e inconclusiveReasons
  if (typeof data.verdictCode !== "string" || !Object.prototype.hasOwnProperty.call(VERDICT_MAP, data.verdictCode)) {
    throw makeError("INVALID_VERDICT_CODE", `Unknown verdictCode: ${String(data.verdictCode)}`);
  }
  if (data.verdict !== VERDICT_MAP[data.verdictCode]) {
    throw makeError("VERDICT_TEXT_MISMATCH", "verdict text does not match verdictCode");
  }

  if (p.totalRead === 0) {
    // Caso canonico de colecao vazia conforme audit-users-readonly.mjs:946
    const isExactEmptyCollection =
      data.verdictCode === "D" &&
      data.inconclusiveReasons.length === 1 &&
      data.inconclusiveReasons[0] === "EMPTY_COLLECTION";
    if (!isExactEmptyCollection) {
      throw makeError(
        "INVALID_EMPTY_COLLECTION_VERDICT",
        "Zero-document report must carry verdictCode D and inconclusiveReasons ['EMPTY_COLLECTION']"
      );
    }
  } else {
    if (data.inconclusiveReasons.length !== 0) {
      throw makeError("INCONCLUSIVE_REASONS_NON_EMPTY", "Non-empty report cannot have inconclusiveReasons");
    }
    if (data.verdictCode === "D") {
      throw makeError("INCONCLUSIVE_VERDICT_REJECTED", "Inconclusive verdict D is rejected for non-empty report");
    }
    let expectedCode = "A";
    if (validatedCounts.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE > 0) {
      expectedCode = "C";
    } else if (
      validatedCounts.INCONSISTENCIA_DE_DADOS > 0 ||
      validatedCounts.DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO > 0
    ) {
      expectedCode = "B";
    }
    if (data.verdictCode !== expectedCode) {
      throw makeError("VERDICT_COUNTS_INCONSISTENCY", `Expected verdictCode ${expectedCode} for counts, received ${data.verdictCode}`);
    }
  }

  // 7. Construcao de novo objeto exclusivamente agregado (sem `results`) derivado dos dados validados
  const validatedSummary = {
    metadata: {
      implementationOrigin: m.implementationOrigin,
      auditorVersion: m.auditorVersion,
      projectId: m.projectId,
      databaseId: m.databaseId,
      collectionName: m.collectionName,
      rulesCommit: m.rulesCommit,
      rulesSha256Expected: m.rulesSha256Expected,
      rootAdminMaskedUid: m.rootAdminMaskedUid,
      mode: m.mode,
      referenceTimeIso: m.referenceTimeIso,
      referenceTimeNs: {
        seconds: ns.seconds,
        nanoseconds: ns.nanoseconds,
      },
    },
    pagination: {
      pageSize: p.pageSize,
      pagesFetched: p.pagesFetched,
      totalRead: p.totalRead,
      completed: p.completed,
      duplicateDocIdsCount: p.duplicateDocIdsCount,
      stagnantCursorDetected: p.stagnantCursorDetected,
      readError: p.readError,
    },
    verdictCode: data.verdictCode,
    verdict: data.verdict,
    counts: { ...validatedCounts },
    unexpectedClassificationsCount: data.unexpectedClassificationsCount,
    inconclusiveReasons: [...data.inconclusiveReasons],
  };

  assertShareableSummarySafe(validatedSummary);
  return validatedSummary;
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

function runCli() {
  const rawPath = (process.env.AUDIT_RAW_QUARANTINE_FILE || "").trim();
  const stderrPath = (process.env.AUDIT_STDERR_QUARANTINE_FILE || "").trim();
  const outPath = (process.env.AUDIT_SUMMARY_OUT_FILE || "").trim();

  if (!rawPath || !existsSync(rawPath)) {
    throw makeError("RAW_QUARANTINE_FILE_MISSING", "AUDIT_RAW_QUARANTINE_FILE missing");
  }
  if (!stderrPath || !existsSync(stderrPath)) {
    throw makeError("STDERR_QUARANTINE_FILE_MISSING", "AUDIT_STDERR_QUARANTINE_FILE missing");
  }
  if (!outPath) {
    throw makeError("SUMMARY_OUT_PATH_MISSING", "AUDIT_SUMMARY_OUT_FILE missing");
  }

  const rawText = readFileSync(rawPath, "utf8");
  const stderrText = readFileSync(stderrPath, "utf8");
  const summary = validateAndExtractAuditSummary(rawText, { stderrText });

  writeFileSync(outPath, JSON.stringify(summary, null, 2) + "\n", { mode: 0o600 });
  process.stdout.write(
    JSON.stringify({
      status: "SUMMARY_VALIDATED_BY_ALLOWLIST",
      verdictCode: summary.verdictCode,
      totalRead: summary.pagination.totalRead,
    }) + "\n"
  );
}

if (isDirectExecution()) {
  try {
    runCli();
  } catch (err) {
    const code = err && typeof err.code === "string" ? err.code : "SUMMARY_VALIDATION_ERROR";
    process.stderr.write(JSON.stringify({ status: "REJECTED", errorCode: code }) + "\n");
    process.exitCode = 1;
  }
}
```

### 9.3 `scripts/audit/validate-audit-summary.test.mjs` (22627 bytes | 534 linhas | SHA-256: `64de6fd574ac0a1b166d91ba5d50b1214bd652eba7184193f76db23030b14112`)

```javascript
/**
 * LOCALIZA+ v1.10.13 — Etapa 27
 * Suite independente de testes sinteticos (100% dados ficticios, zero Firebase)
 * para `verify-approval-record.mjs` e `validate-audit-summary.mjs`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  EXPECTED_DATABASE_ID,
  EXPECTED_PROJECT_ID,
  canonicalizeApprovalRecord,
  computePublicKeyFingerprintSha256,
  verifySignedApprovalRecord,
} from "./verify-approval-record.mjs";
import {
  CLASSIFICATION_KEYS,
  EXPECTED_AUDITOR_VERSION,
  EXPECTED_COLLECTION_NAME,
  EXPECTED_IMPLEMENTATION_ORIGIN,
  EXPECTED_MODE,
  EXPECTED_ROOT_MASKED_UID,
  EXPECTED_RULES_COMMIT,
  EXPECTED_RULES_SHA256,
  VERDICT_MAP,
  assertShareableSummarySafe,
  validateAndExtractAuditSummary,
} from "./validate-audit-summary.mjs";

const VALIDATOR_CLI = resolve("scripts/audit/validate-audit-summary.mjs");
const VERIFIER_CLI = resolve("scripts/audit/verify-approval-record.mjs");

const REF_NS = Object.freeze({ seconds: 1_750_000_000, nanoseconds: 0 });
const REF_ISO = new Date(REF_NS.seconds * 1000).toISOString();
const FICTITIOUS_SA = "audit-readonly-ficticio@gen-lang-client-0490390966.iam.gserviceaccount.com";

function makeSyntheticResult(index, classification) {
  const hex = index.toString(16).padStart(12, "0");
  return {
    maskedUid: `uid_${hex}`,
    classification,
  };
}

function makeValidReport(resultsList, overrides = {}) {
  const counts = Object.fromEntries(CLASSIFICATION_KEYS.map((k) => [k, 0]));
  for (const r of resultsList) {
    if (Object.prototype.hasOwnProperty.call(counts, r.classification)) {
      counts[r.classification] += 1;
    }
  }
  const totalRead = resultsList.length;
  let verdictCode;
  let inconclusiveReasons = [];
  if (totalRead === 0) {
    verdictCode = "D";
    inconclusiveReasons = ["EMPTY_COLLECTION"];
  } else if (counts.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE > 0) {
    verdictCode = "C";
  } else if (counts.INCONSISTENCIA_DE_DADOS > 0 || counts.DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO > 0) {
    verdictCode = "B";
  } else {
    verdictCode = "A";
  }

  return {
    metadata: {
      implementationOrigin: EXPECTED_IMPLEMENTATION_ORIGIN,
      auditorVersion: EXPECTED_AUDITOR_VERSION,
      projectId: EXPECTED_PROJECT_ID,
      databaseId: EXPECTED_DATABASE_ID,
      collectionName: EXPECTED_COLLECTION_NAME,
      rulesCommit: EXPECTED_RULES_COMMIT,
      rulesSha256Expected: EXPECTED_RULES_SHA256,
      rootAdminMaskedUid: EXPECTED_ROOT_MASKED_UID,
      mode: EXPECTED_MODE,
      referenceTimeIso: REF_ISO,
      referenceTimeNs: { ...REF_NS },
    },
    pagination: {
      pageSize: 500,
      pagesFetched: 1,
      totalRead,
      completed: true,
      duplicateDocIdsCount: 0,
      stagnantCursorDetected: false,
      readError: null,
    },
    verdict: VERDICT_MAP[verdictCode],
    verdictCode,
    counts,
    unexpectedClassificationsCount: 0,
    inconclusiveReasons,
    results: resultsList,
    ...overrides,
  };
}

function runValidatorCli(reportObj, stderrText = "") {
  const dir = mkdtempSync(join(tmpdir(), "localiza-val-test-"));
  const rawPath = join(dir, "raw.json");
  const errPath = join(dir, "stderr.log");
  const outPath = join(dir, "summary.json");
  try {
    writeFileSync(rawPath, JSON.stringify(reportObj, null, 2), { mode: 0o600 });
    writeFileSync(errPath, stderrText, { mode: 0o600 });
    const proc = spawnSync(process.execPath, [VALIDATOR_CLI], {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        AUDIT_RAW_QUARANTINE_FILE: rawPath,
        AUDIT_STDERR_QUARANTINE_FILE: errPath,
        AUDIT_SUMMARY_OUT_FILE: outPath,
      },
    });
    const outExists = existsSync(outPath);
    const outJson = outExists ? JSON.parse(readFileSync(outPath, "utf8")) : null;
    return { status: proc.status, stdout: proc.stdout, stderr: proc.stderr, outExists, outJson };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function makeSignedApprovalFixture(recordOverrides = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const trustedPin = computePublicKeyFingerprintSha256(publicKeyPem);
  const now = new Date();
  const issuedAt = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();

  const record = {
    schemaVersion: "localiza-audit-approval-v1",
    approvalId: "APPR-2026-FICTICIO-001",
    projectId: EXPECTED_PROJECT_ID,
    databaseId: EXPECTED_DATABASE_ID,
    collectionName: EXPECTED_COLLECTION_NAME,
    serviceAccountEmail: FICTITIOUS_SA,
    purpose: "READ_ONLY_USERS_COMPATIBILITY_AUDIT",
    scope: "READ_ONLY",
    issuedAt,
    expiresAt,
    revoked: false,
    issuerKeyId: "gcp-admin-ed25519-test-key-01",
    ...recordOverrides,
  };
  const canonical = canonicalizeApprovalRecord(record);
  const signatureBase64 = sign(null, canonical, privateKey).toString("base64");
  return { record, recordJsonText: JSON.stringify(record, null, 2), signatureBase64, publicKeyPem, trustedPin };
}

function runVerifierCli({ recordJsonText, signatureBase64, publicKeyPem, trustedPin, expectedSa = FICTITIOUS_SA }) {
  const dir = mkdtempSync(join(tmpdir(), "localiza-ver-test-"));
  const recPath = join(dir, "approval.json");
  const sigPath = join(dir, "approval.sig");
  const pubPath = join(dir, "trusted.pub.pem");
  try {
    writeFileSync(recPath, recordJsonText, { mode: 0o600 });
    writeFileSync(sigPath, signatureBase64, { mode: 0o600 });
    writeFileSync(pubPath, publicKeyPem, { mode: 0o600 });
    const proc = spawnSync(process.execPath, [VERIFIER_CLI], {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        APPROVED_AUDIT_RECORD_FILE: recPath,
        APPROVED_AUDIT_SIGNATURE_FILE: sigPath,
        TRUSTED_ADMIN_PUBKEY_FILE: pubPath,
        TRUSTED_ADMIN_PUBKEY_SHA256: trustedPin,
        EXPECTED_AUDIT_SA: expectedSa,
      },
    });
    return { status: proc.status, stdout: proc.stdout, stderr: proc.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("01. Relatorio valido com zero documentos (preserva veredito D EMPTY_COLLECTION e rejeita falso veredito A)", () => {
  const emptyReport = makeValidReport([]);
  const cliRes = runValidatorCli(emptyReport);
  assert.equal(cliRes.status, 0);
  assert.equal(cliRes.outExists, true);
  assert.equal(cliRes.outJson.pagination.totalRead, 0);
  assert.equal(cliRes.outJson.verdictCode, "D");
  assert.deepEqual(cliRes.outJson.inconclusiveReasons, ["EMPTY_COLLECTION"]);
  assert.equal(Object.prototype.hasOwnProperty.call(cliRes.outJson, "results"), false);

  // Falso relatorio com zero documentos tentando se passar por veredito A deve ser rejeitado
  const fakeA = makeValidReport([], { verdictCode: "A", verdict: VERDICT_MAP.A, inconclusiveReasons: [] });
  assert.throws(() => validateAndExtractAuditSummary(fakeA), { code: "INVALID_EMPTY_COLLECTION_VERDICT" });
  const cliFake = runValidatorCli(fakeA);
  assert.notEqual(cliFake.status, 0);
  assert.equal(cliFake.outExists, false);
});

test("02. Relatorio valido com documentos de todas as 5 classificacoes", () => {
  const allFive = CLASSIFICATION_KEYS.map((cls, idx) => makeSyntheticResult(idx + 1, cls));
  const report = makeValidReport(allFive);
  const cliRes = runValidatorCli(report);
  assert.equal(cliRes.status, 0);
  assert.equal(cliRes.outExists, true);
  assert.equal(cliRes.outJson.verdictCode, "C");
  assert.equal(cliRes.outJson.pagination.totalRead, 5);
  for (const key of CLASSIFICATION_KEYS) {
    assert.equal(cliRes.outJson.counts[key], 1);
  }
  assert.equal(Object.prototype.hasOwnProperty.call(cliRes.outJson, "results"), false);
});

test("03. Contagem divergente (soma diferente de totalRead e divergencia frente a recontagem de results)", () => {
  const reportSumMismatch = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  reportSumMismatch.counts.DOCUMENTO_COMPATIVEL = 2;
  assert.throws(() => validateAndExtractAuditSummary(reportSumMismatch), { code: "COUNTS_SUM_MISMATCH" });
  const cli1 = runValidatorCli(reportSumMismatch);
  assert.notEqual(cli1.status, 0);
  assert.equal(cli1.outExists, false);

  const reportRecountMismatch = makeValidReport([
    makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL"),
    makeSyntheticResult(2, "BLOQUEIO_INTENCIONAL_COMPATIVEL"),
  ]);
  reportRecountMismatch.counts.DOCUMENTO_COMPATIVEL = 2;
  reportRecountMismatch.counts.BLOQUEIO_INTENCIONAL_COMPATIVEL = 0;
  assert.throws(() => validateAndExtractAuditSummary(reportRecountMismatch), { code: "RECOUNT_MISMATCH" });
  const cli2 = runValidatorCli(reportRecountMismatch);
  assert.notEqual(cli2.status, 0);
  assert.equal(cli2.outExists, false);
});

test("04. Resultado individual ausente (results.length menor que pagination.totalRead)", () => {
  const report = makeValidReport([
    makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL"),
    makeSyntheticResult(2, "DOCUMENTO_COMPATIVEL"),
  ]);
  report.results = [report.results[0]];
  assert.throws(() => validateAndExtractAuditSummary(report), { code: "RESULTS_LENGTH_MISMATCH" });
  const cli = runValidatorCli(report);
  assert.notEqual(cli.status, 0);
  assert.equal(cli.outExists, false);
});

test("05. Resultado individual duplicado (maskedUid duplicado em results e duplicateDocIdsCount > 0)", () => {
  const dupItem = makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL");
  const reportDupArray = makeValidReport([dupItem, { ...dupItem }]);
  assert.throws(() => validateAndExtractAuditSummary(reportDupArray), { code: "DUPLICATE_RESULT_ENTRY" });
  const cli1 = runValidatorCli(reportDupArray);
  assert.notEqual(cli1.status, 0);
  assert.equal(cli1.outExists, false);

  const reportDupCounter = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  reportDupCounter.pagination.duplicateDocIdsCount = 1;
  assert.throws(() => validateAndExtractAuditSummary(reportDupCounter), { code: "DUPLICATE_DOC_IDS_DETECTED" });
  const cli2 = runValidatorCli(reportDupCounter);
  assert.notEqual(cli2.status, 0);
});

test("06. Paginacao incompleta (pagination.completed === false)", () => {
  const report = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  report.pagination.completed = false;
  assert.throws(() => validateAndExtractAuditSummary(report), { code: "INCOMPLETE_PAGINATION" });
  const cli = runValidatorCli(report);
  assert.notEqual(cli.status, 0);
  assert.equal(cli.outExists, false);
});

test("07. Erro de leitura (pagination.readError preenchido)", () => {
  const report = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  report.pagination.readError = "READ_ERROR:permission-denied";
  assert.throws(() => validateAndExtractAuditSummary(report), { code: "READ_ERROR_PRESENT" });
  const cli = runValidatorCli(report);
  assert.notEqual(cli.status, 0);
  assert.equal(cli.outExists, false);
});

test("08. Cursor estagnado (pagination.stagnantCursorDetected === true)", () => {
  const report = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  report.pagination.stagnantCursorDetected = true;
  assert.throws(() => validateAndExtractAuditSummary(report), { code: "STAGNANT_CURSOR_DETECTED" });
  const cli = runValidatorCli(report);
  assert.notEqual(cli.status, 0);
  assert.equal(cli.outExists, false);
});

test("09. Classificacao desconhecida em results e em counts", () => {
  const reportUnknownResult = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  reportUnknownResult.results[0].classification = "CLASSIFICACAO_DESCONHECIDA";
  assert.throws(() => validateAndExtractAuditSummary(reportUnknownResult), { code: "UNKNOWN_CLASSIFICATION" });
  const cli1 = runValidatorCli(reportUnknownResult);
  assert.notEqual(cli1.status, 0);

  const reportUnknownCountKey = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  reportUnknownCountKey.counts.CLASSIFICACAO_EXTRA = 0;
  assert.throws(() => validateAndExtractAuditSummary(reportUnknownCountKey), { code: "UNEXPECTED_KEY" });
  const cli2 = runValidatorCli(reportUnknownCountKey);
  assert.notEqual(cli2.status, 0);
});

test("10. Campo inesperado na raiz", () => {
  const report = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  report.campoInesperado = "nao-permitido";
  assert.throws(() => validateAndExtractAuditSummary(report), { code: "UNEXPECTED_KEY" });
  const cli = runValidatorCli(report);
  assert.notEqual(cli.status, 0);
  assert.equal(cli.outExists, false);
});

test("11. Campo inesperado em objeto aninhado (metadata e pagination)", () => {
  const rMeta = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  rMeta.metadata.extraNested = true;
  assert.throws(() => validateAndExtractAuditSummary(rMeta), { code: "UNEXPECTED_KEY" });
  assert.notEqual(runValidatorCli(rMeta).status, 0);

  const rPag = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  rPag.pagination.extraPag = 123;
  assert.throws(() => validateAndExtractAuditSummary(rPag), { code: "UNEXPECTED_KEY" });
  assert.notEqual(runValidatorCli(rPag).status, 0);
});

test("12. Campo obrigatorio ausente", () => {
  const report = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  delete report.metadata.rulesSha256Expected;
  assert.throws(() => validateAndExtractAuditSummary(report), { code: "MISSING_REQUIRED_KEY" });
  const cli = runValidatorCli(report);
  assert.notEqual(cli.status, 0);
  assert.equal(cli.outExists, false);
});

test("13. Tipo incorreto em campos numericos e booleanos", () => {
  const rTotal = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  rTotal.pagination.totalRead = "1";
  assert.throws(() => validateAndExtractAuditSummary(rTotal), { code: "INVALID_TOTAL_READ" });
  assert.notEqual(runValidatorCli(rTotal).status, 0);

  const rFloat = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  rFloat.counts.DOCUMENTO_COMPATIVEL = 1.5;
  assert.throws(() => validateAndExtractAuditSummary(rFloat), { code: "INVALID_COUNT_VALUE" });
  assert.notEqual(runValidatorCli(rFloat).status, 0);
});

test("14. SHA-256 invalido ou divergente", () => {
  const report = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  report.metadata.rulesSha256Expected = "0".repeat(64);
  assert.throws(() => validateAndExtractAuditSummary(report), { code: "INVALID_RULES_SHA256" });
  const cli = runValidatorCli(report);
  assert.notEqual(cli.status, 0);
  assert.equal(cli.outExists, false);
});

test("15. Commit invalido ou divergente", () => {
  const report = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  report.metadata.rulesCommit = "1".repeat(40);
  assert.throws(() => validateAndExtractAuditSummary(report), { code: "INVALID_RULES_COMMIT" });
  const cli = runValidatorCli(report);
  assert.notEqual(cli.status, 0);
  assert.equal(cli.outExists, false);
});

test("16. Veredito divergente do codigo e das contagens", () => {
  const rTextMismatch = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  rTextMismatch.verdict = VERDICT_MAP.C;
  assert.throws(() => validateAndExtractAuditSummary(rTextMismatch), { code: "VERDICT_TEXT_MISMATCH" });
  assert.notEqual(runValidatorCli(rTextMismatch).status, 0);

  const rCountsMismatch = makeValidReport([makeSyntheticResult(1, "PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE")]);
  rCountsMismatch.verdictCode = "A";
  rCountsMismatch.verdict = VERDICT_MAP.A;
  assert.throws(() => validateAndExtractAuditSummary(rCountsMismatch), { code: "VERDICT_COUNTS_INCONSISTENCY" });
  assert.notEqual(runValidatorCli(rCountsMismatch).status, 0);
});

test("17. Resultado inconclusivo (verdictCode D com documentos lidos)", () => {
  const report = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  report.verdictCode = "D";
  report.verdict = VERDICT_MAP.D;
  assert.throws(() => validateAndExtractAuditSummary(report), { code: "INCONCLUSIVE_VERDICT_REJECTED" });
  const cli = runValidatorCli(report);
  assert.notEqual(cli.status, 0);
  assert.equal(cli.outExists, false);
});

test("18. unexpectedClassificationsCount diferente de zero", () => {
  const report = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  report.unexpectedClassificationsCount = 1;
  assert.throws(() => validateAndExtractAuditSummary(report), { code: "UNEXPECTED_CLASSIFICATIONS_NON_ZERO" });
  const cli = runValidatorCli(report);
  assert.notEqual(cli.status, 0);
  assert.equal(cli.outExists, false);
});

test("19. inconclusiveReasons nao vazio em relatorio nao vazio", () => {
  const report = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  report.inconclusiveReasons = ["PAGE_READ_ERROR"];
  assert.throws(() => validateAndExtractAuditSummary(report), { code: "INCONCLUSIVE_REASONS_NON_EMPTY" });
  const cli = runValidatorCli(report);
  assert.notEqual(cli.status, 0);
  assert.equal(cli.outExists, false);
});

test("20. Registro de aprovacao adulterado apos assinatura Ed25519", () => {
  const fx = makeSignedApprovalFixture();
  // Fluxo positivo base primeiro
  const okCli = runVerifierCli(fx);
  assert.equal(okCli.status, 0);

  const tampered = { ...fx.record, approvalId: "APPR-2026-ADULTERADO-999" };
  const tamperedJson = JSON.stringify(tampered, null, 2);
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: tamperedJson,
        signatureBase64: fx.signatureBase64,
        trustedPublicKeyPem: fx.publicKeyPem,
        trustedPublicKeySha256: fx.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "INVALID_DIGITAL_SIGNATURE" }
  );
  const badCli = runVerifierCli({ ...fx, recordJsonText: tamperedJson });
  assert.notEqual(badCli.status, 0);
});

test("21. Assinatura digital invalida", () => {
  const fx = makeSignedApprovalFixture();
  const badSig = Buffer.alloc(64, 0xaa).toString("base64");
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: fx.recordJsonText,
        signatureBase64: badSig,
        trustedPublicKeyPem: fx.publicKeyPem,
        trustedPublicKeySha256: fx.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "INVALID_DIGITAL_SIGNATURE" }
  );
  const badCli = runVerifierCli({ ...fx, signatureBase64: badSig });
  assert.notEqual(badCli.status, 0);
});

test("22. Chave publica nao confiavel (assinatura propria de atacante sem pin confiavel)", () => {
  const trustedAdminFx = makeSignedApprovalFixture();
  const attackerFx = makeSignedApprovalFixture();
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: attackerFx.recordJsonText,
        signatureBase64: attackerFx.signatureBase64,
        trustedPublicKeyPem: attackerFx.publicKeyPem,
        trustedPublicKeySha256: trustedAdminFx.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "UNTRUSTED_PUBLIC_KEY_FINGERPRINT" }
  );
  const badCli = runVerifierCli({
    recordJsonText: attackerFx.recordJsonText,
    signatureBase64: attackerFx.signatureBase64,
    publicKeyPem: attackerFx.publicKeyPem,
    trustedPin: trustedAdminFx.trustedPin,
  });
  assert.notEqual(badCli.status, 0);
});

test("23. Registro administrativo expirado e registro revogado", () => {
  const pastIssued = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const pastExpired = new Date(Date.now() - 60 * 1000).toISOString();
  const expiredFx = makeSignedApprovalFixture({ issuedAt: pastIssued, expiresAt: pastExpired });
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: expiredFx.recordJsonText,
        signatureBase64: expiredFx.signatureBase64,
        trustedPublicKeyPem: expiredFx.publicKeyPem,
        trustedPublicKeySha256: expiredFx.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "APPROVAL_RECORD_EXPIRED" }
  );
  assert.notEqual(runVerifierCli(expiredFx).status, 0);

  const revokedFx = makeSignedApprovalFixture({ revoked: true });
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: revokedFx.recordJsonText,
        signatureBase64: revokedFx.signatureBase64,
        trustedPublicKeyPem: revokedFx.publicKeyPem,
        trustedPublicKeySha256: revokedFx.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "APPROVAL_RECORD_REVOKED" }
  );
  assert.notEqual(runVerifierCli(revokedFx).status, 0);
});

test("24. Conta de servico diferente da aprovada no registro assinado", () => {
  const fx = makeSignedApprovalFixture();
  const wrongSa = "outra-conta-nao-aprovada@gen-lang-client-0490390966.iam.gserviceaccount.com";
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: fx.recordJsonText,
        signatureBase64: fx.signatureBase64,
        trustedPublicKeyPem: fx.publicKeyPem,
        trustedPublicKeySha256: fx.trustedPin,
        expectedServiceAccountEmail: wrongSa,
      }),
    { code: "SERVICE_ACCOUNT_MISMATCH" }
  );
  const badCli = runVerifierCli({ ...fx, expectedSa: wrongSa });
  assert.notEqual(badCli.status, 0);
});

test("25. Tentativa de inserir dados individuais no resumo final e verificacao de stderr nao vazio", () => {
  const validSummary = validateAndExtractAuditSummary(makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]));
  assert.equal(assertShareableSummarySafe(validSummary), true);

  // Tentativa de injetar `results` ou campo PII no objeto de resumo
  const withResults = { ...validSummary, results: [makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")] };
  assert.throws(() => assertShareableSummarySafe(withResults), { code: "UNEXPECTED_KEY" });

  const withEmail = { ...validSummary, email: "ficticio@example.invalid" };
  assert.throws(() => assertShareableSummarySafe(withEmail), { code: "UNEXPECTED_KEY" });

  // Relatorio bruto com stderr nao vazio tambem deve falhar com exit code != 0 e nao gerar resumo
  const cliNonEmptyStderr = runValidatorCli(makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]), "WARN: detalhe em stderr");
  assert.notEqual(cliNonEmptyStderr.status, 0);
  assert.equal(cliNonEmptyStderr.outExists, false);
});
```

## 10. Conteúdo Integral dos 4 Artefatos Candidatos da Etapa 28 (Sem Omissões — Incluindo Encerramento Integral da Sonda)

### 10.1 `scripts/audit/candidates/etapa28/verify-approval-record.candidate.mjs` (17050 bytes | 426 linhas | SHA-256: `1b33c2e41d62d668556ccf4dc9a59d97350eab77ce448b9b7e22b5a45dddc610`)

```javascript
#!/usr/bin/env node
/**
 * LOCALIZA+ v1.10.13 — Etapa 28 (Copia Candidata)
 * Verificador criptografico de registro de aprovacao administrativa (Ed25519).
 *
 * Correcoes candidatas sobre `scripts/audit/verify-approval-record.mjs` (Etapa 27):
 * - C1: Validacao estrita de calendario ISO-8601 UTC com round-trip (rejeita 2026-02-30, 2026-04-31 etc.).
 * - C2: Deteccao de chaves JSON duplicadas na entrada bruta antes de JSON.parse.
 * - C3: Validacao canonica estrita de assinatura Base64 Ed25519 (88 chars, padding ==, round-trip exato).
 * - C4: Validacao estrita de tipos para referenceTime, revokedApprovalIds e expectedServiceAccountEmail,
 *       obrigatoriedade de EXPECTED_AUDIT_SA no CLI e rejeicao de symlinks nos arquivos de entrada.
 *
 * Restricoes preservadas:
 * - Zero conexao Firebase, zero escrita no Firestore, zero exposicao de chaves privadas ou tokens.
 * - SHA-256 do registro e calculado exclusivamente como identificador de integridade, nunca prova de autoria.
 */

import { createHash, createPublicKey, timingSafeEqual, verify } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const EXPECTED_PROJECT_ID = "gen-lang-client-0490390966";
export const EXPECTED_DATABASE_ID = "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1";
export const EXPECTED_COLLECTION_NAME = "users";
export const EXPECTED_SCHEMA_VERSION = "localiza-audit-approval-v1";
export const EXPECTED_SCOPE = "READ_ONLY";
export const EXPECTED_PURPOSE = "READ_ONLY_USERS_COMPATIBILITY_AUDIT";
export const SIGNATURE_DOMAIN_PREFIX = "LOCALIZA_AUDIT_APPROVAL_V1\n";

export const APPROVAL_RECORD_KEYS = Object.freeze([
  "schemaVersion",
  "approvalId",
  "projectId",
  "databaseId",
  "collectionName",
  "serviceAccountEmail",
  "purpose",
  "scope",
  "issuedAt",
  "expiresAt",
  "revoked",
  "issuerKeyId",
]);

const APPROVAL_ID_RE = /^[A-Z0-9][A-Z0-9._-]{3,63}$/;
const ISSUER_KEY_ID_RE = /^[a-zA-Z0-9._-]{3,64}$/;
export const SERVICE_ACCOUNT_RE = /^[a-z][a-z0-9-]{4,28}[a-z0-9]@gen-lang-client-0490390966\.iam\.gserviceaccount\.com$/;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
const SHA256_HEX_RE = /^[a-f0-9]{64}$/;
const CANONICAL_ED25519_B64_RE = /^[A-Za-z0-9+/]{86}==$/;
const MAX_VALIDITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_TOLERANCE_MS = 60 * 1000;

function makeError(code, message) {
  return Object.assign(new Error(message), { code });
}

function assertExactKeys(obj, allowedKeys, context) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw makeError("INVALID_RECORD_STRUCTURE", `Expected object at ${context}`);
  }
  const allowedSet = new Set(allowedKeys);
  for (const key of Object.keys(obj)) {
    if (!allowedSet.has(key)) {
      throw makeError("UNEXPECTED_RECORD_KEY", `Unexpected key ${context}.${key}`);
    }
  }
  for (const key of allowedKeys) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      throw makeError("MISSING_RECORD_KEY", `Missing required key ${context}.${key}`);
    }
  }
}

/**
 * Detecta chaves duplicadas em objeto JSON de nivel superior antes do JSON.parse
 * (que silenciosamente sobrescreveria ocorrencias anteriores).
 */
export function assertNoDuplicateTopLevelJsonKeys(jsonText) {
  if (typeof jsonText !== "string") {
    throw makeError("INVALID_RECORD_JSON", "JSON input must be a string");
  }
  const seen = new Set();
  let i = 0;
  const len = jsonText.length;
  const skipWs = () => {
    while (i < len && /\s/.test(jsonText[i])) i += 1;
  };
  const readString = () => {
    const start = i;
    i += 1; // opening quote
    while (i < len) {
      const ch = jsonText[i];
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === '"') {
        i += 1;
        return JSON.parse(jsonText.slice(start, i));
      }
      i += 1;
    }
    throw makeError("INVALID_RECORD_JSON", "Unterminated JSON string");
  };

  skipWs();
  if (jsonText[i] !== "{") {
    return; // JSON.parse / assertExactKeys tratara estrutura invalida
  }

  let depth = 0;
  let expectingKey = false;
  while (i < len) {
    const ch = jsonText[i];
    if (ch === '"') {
      const parsedStr = readString();
      if (depth === 1 && expectingKey) {
        if (seen.has(parsedStr)) {
          throw makeError("DUPLICATE_RECORD_KEY", `Duplicate JSON key detected: ${parsedStr}`);
        }
        seen.add(parsedStr);
        expectingKey = false;
      }
      continue;
    }
    if (ch === "{") {
      depth += 1;
      if (depth === 1) expectingKey = true;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) break;
    } else if (ch === "," && depth === 1) {
      expectingKey = true;
    }
    i += 1;
  }
}

function canonicalSort(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalSort(item));
  }
  if (value && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = canonicalSort(value[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Serializacao canonica deterministica (chaves ordenadas lexicograficamente + prefixo de dominio).
 */
export function canonicalizeApprovalRecord(record) {
  assertExactKeys(record, APPROVAL_RECORD_KEYS, "approvalRecord");
  const json = JSON.stringify(canonicalSort(record));
  return Buffer.from(`${SIGNATURE_DOMAIN_PREFIX}${json}`, "utf8");
}

/**
 * Calcula o fingerprint SHA-256 (hex lowercase) dos bytes SPKI DER de uma chave publica Ed25519.
 */
export function computePublicKeyFingerprintSha256(publicKeyPem) {
  if (typeof publicKeyPem !== "string" || publicKeyPem.trim().length === 0) {
    throw makeError("INVALID_PUBLIC_KEY", "Public key PEM must be a non-empty string");
  }
  let keyObj;
  try {
    keyObj = createPublicKey(publicKeyPem);
  } catch {
    throw makeError("INVALID_PUBLIC_KEY", "Unable to parse public key PEM");
  }
  if (keyObj.asymmetricKeyType !== "ed25519") {
    throw makeError("UNSUPPORTED_KEY_ALGORITHM", `Expected ed25519 public key, received ${String(keyObj.asymmetricKeyType)}`);
  }
  const spkiDer = keyObj.export({ type: "spki", format: "der" });
  return createHash("sha256").update(spkiDer).digest("hex");
}

/**
 * Faz parsing estrito de ISO-8601 UTC com verificacao de round-trip de calendario,
 * bloqueando datas inexistentes que o V8/Date.parse normalmente rolaria (ex.: 2026-02-30).
 */
export function parseStrictIsoUtc(value, fieldName) {
  if (typeof value !== "string" || !ISO_UTC_RE.test(value)) {
    throw makeError("INVALID_TIMESTAMP_FORMAT", `Field ${fieldName} must be strict ISO-8601 UTC`);
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw makeError("INVALID_TIMESTAMP_FORMAT", `Field ${fieldName} is not a valid date`);
  }
  const normalizedExpected = value.includes(".") ? value : value.replace(/Z$/, ".000Z");
  const roundTripIso = new Date(ms).toISOString();
  if (roundTripIso !== normalizedExpected) {
    throw makeError("INVALID_TIMESTAMP_CALENDAR", `Field ${fieldName} contains a non-existent calendar date`);
  }
  return ms;
}

/**
 * Valida assinatura digital Ed25519, pin de chave publica confiavel, escopo, finalidade,
 * expiracao, revogacao e correspondencia exata de projeto, banco, colecao e conta de servico.
 */
export function verifySignedApprovalRecord({
  recordJsonText,
  signatureBase64,
  trustedPublicKeyPem,
  trustedPublicKeySha256,
  expectedServiceAccountEmail = null,
  revokedApprovalIds = [],
  referenceTime = new Date(),
}) {
  if (typeof recordJsonText !== "string" || recordJsonText.trim().length === 0) {
    throw makeError("MISSING_APPROVAL_RECORD", "Approval record content is empty");
  }
  if (typeof signatureBase64 !== "string" || signatureBase64.trim().length === 0) {
    throw makeError("MISSING_SIGNATURE", "Signature base64 is required");
  }
  const expectedPin = typeof trustedPublicKeySha256 === "string" ? trustedPublicKeySha256.trim().toLowerCase() : "";
  if (!SHA256_HEX_RE.test(expectedPin)) {
    throw makeError("INVALID_TRUSTED_KEY_PIN", "trustedPublicKeySha256 must be a valid 64-char hex SHA-256");
  }
  if (!Array.isArray(revokedApprovalIds) || !revokedApprovalIds.every((id) => typeof id === "string")) {
    throw makeError("INVALID_REVOKED_LIST", "revokedApprovalIds must be an array of strings");
  }
  let refMs;
  if (referenceTime instanceof Date) {
    refMs = referenceTime.getTime();
  } else if (typeof referenceTime === "number") {
    refMs = referenceTime;
  } else {
    throw makeError("INVALID_REFERENCE_TIME", "referenceTime must be a valid Date or finite epoch number");
  }
  if (!Number.isFinite(refMs)) {
    throw makeError("INVALID_REFERENCE_TIME", "referenceTime is invalid");
  }

  // 1. Verificar pin criptografico da chave publica confiavel (obtida por canal independente)
  const actualPin = computePublicKeyFingerprintSha256(trustedPublicKeyPem);
  const pinMatches = timingSafeEqual(Buffer.from(actualPin, "hex"), Buffer.from(expectedPin, "hex"));
  if (!pinMatches) {
    throw makeError("UNTRUSTED_PUBLIC_KEY_FINGERPRINT", "Public key SPKI SHA-256 does not match trusted pin");
  }

  // 2. Detectar chaves duplicadas, parsear e validar allowlist estrutural das 12 chaves
  assertNoDuplicateTopLevelJsonKeys(recordJsonText);
  let record;
  try {
    record = JSON.parse(recordJsonText);
  } catch {
    throw makeError("INVALID_RECORD_JSON", "Approval record is not valid JSON");
  }
  assertExactKeys(record, APPROVAL_RECORD_KEYS, "approvalRecord");

  // 3. Verificar assinatura digital Ed25519 canonica sobre o conteudo canonico antes de confiar nos campos
  const canonicalBytes = canonicalizeApprovalRecord(record);
  const sigTrimmed = signatureBase64.trim();
  if (!CANONICAL_ED25519_B64_RE.test(sigTrimmed)) {
    throw makeError("INVALID_SIGNATURE_FORMAT", "Signature must be canonical 88-char base64 for 64-byte Ed25519");
  }
  const sigBytes = Buffer.from(sigTrimmed, "base64");
  if (sigBytes.length !== 64 || sigBytes.toString("base64") !== sigTrimmed) {
    throw makeError("INVALID_SIGNATURE_LENGTH", `Ed25519 signature must be canonical 64 bytes, got ${sigBytes.length}`);
  }
  const publicKeyObj = createPublicKey(trustedPublicKeyPem);
  const signatureValid = verify(null, canonicalBytes, publicKeyObj, sigBytes);
  if (!signatureValid) {
    throw makeError("INVALID_DIGITAL_SIGNATURE", "Ed25519 digital signature verification failed");
  }

  // 4. Validar campos semanticos, alvo, escopo, janela temporal e revogacao
  if (record.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    throw makeError("INVALID_SCHEMA_VERSION", `Unsupported schemaVersion: ${String(record.schemaVersion)}`);
  }
  if (typeof record.approvalId !== "string" || !APPROVAL_ID_RE.test(record.approvalId)) {
    throw makeError("INVALID_APPROVAL_ID", "Invalid approvalId format");
  }
  if (record.projectId !== EXPECTED_PROJECT_ID) {
    throw makeError("PROJECT_ID_MISMATCH", "Approval record projectId does not match target project");
  }
  if (record.databaseId !== EXPECTED_DATABASE_ID) {
    throw makeError("DATABASE_ID_MISMATCH", "Approval record databaseId does not match target named database");
  }
  if (record.collectionName !== EXPECTED_COLLECTION_NAME) {
    throw makeError("COLLECTION_NAME_MISMATCH", "Approval record collectionName must be users");
  }
  if (typeof record.serviceAccountEmail !== "string" || !SERVICE_ACCOUNT_RE.test(record.serviceAccountEmail)) {
    throw makeError("INVALID_SERVICE_ACCOUNT_FORMAT", "Invalid dedicated service account email format");
  }
  if (record.purpose !== EXPECTED_PURPOSE) {
    throw makeError("INVALID_PURPOSE", "Approval record purpose mismatch");
  }
  if (record.scope !== EXPECTED_SCOPE) {
    throw makeError("INVALID_SCOPE", "Approval record scope must be READ_ONLY");
  }
  if (typeof record.issuerKeyId !== "string" || !ISSUER_KEY_ID_RE.test(record.issuerKeyId)) {
    throw makeError("INVALID_ISSUER_KEY_ID", "Invalid issuerKeyId format");
  }
  if (typeof record.revoked !== "boolean") {
    throw makeError("INVALID_REVOKED_TYPE", "revoked must be boolean");
  }
  const revokedSet = new Set(revokedApprovalIds);
  if (record.revoked === true || revokedSet.has(record.approvalId)) {
    throw makeError("APPROVAL_RECORD_REVOKED", "Approval record has been revoked");
  }

  const issuedMs = parseStrictIsoUtc(record.issuedAt, "issuedAt");
  const expiresMs = parseStrictIsoUtc(record.expiresAt, "expiresAt");
  if (expiresMs <= issuedMs) {
    throw makeError("INVALID_VALIDITY_WINDOW", "expiresAt must be strictly after issuedAt");
  }
  if (expiresMs - issuedMs > MAX_VALIDITY_WINDOW_MS) {
    throw makeError("VALIDITY_WINDOW_TOO_LONG", "Approval record validity window exceeds 7 days");
  }
  if (refMs < issuedMs - CLOCK_SKEW_TOLERANCE_MS) {
    throw makeError("APPROVAL_RECORD_NOT_YET_VALID", "Approval record issuedAt is in the future");
  }
  if (refMs >= expiresMs) {
    throw makeError("APPROVAL_RECORD_EXPIRED", "Approval record has expired");
  }

  if (expectedServiceAccountEmail !== null && expectedServiceAccountEmail !== undefined) {
    if (typeof expectedServiceAccountEmail !== "string") {
      throw makeError("INVALID_EXPECTED_SERVICE_ACCOUNT", "expectedServiceAccountEmail must be a string");
    }
    const trimmedExpected = expectedServiceAccountEmail.trim();
    if (!SERVICE_ACCOUNT_RE.test(trimmedExpected)) {
      throw makeError("INVALID_EXPECTED_SERVICE_ACCOUNT", "expectedServiceAccountEmail has invalid format");
    }
    if (trimmedExpected !== record.serviceAccountEmail) {
      throw makeError("SERVICE_ACCOUNT_MISMATCH", "Service account does not match signed approval record");
    }
  }

  // SHA-256 calculado apenas como identificador de integridade (autoria ja comprovada via Ed25519)
  const recordSha256 = createHash("sha256").update(canonicalBytes).digest("hex");

  return {
    verified: true,
    algorithm: "ed25519",
    approvalId: record.approvalId,
    projectId: record.projectId,
    databaseId: record.databaseId,
    collectionName: record.collectionName,
    serviceAccountEmail: record.serviceAccountEmail,
    scope: record.scope,
    purpose: record.purpose,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
    issuerKeyId: record.issuerKeyId,
    trustedPublicKeySha256: actualPin,
    canonicalRecordSha256: recordSha256,
  };
}

function readRegularFileOrThrow(filePath, missingCode) {
  if (!filePath || !existsSync(filePath)) {
    throw makeError(missingCode, `Required file missing: ${missingCode}`);
  }
  const st = lstatSync(filePath);
  if (st.isSymbolicLink() || !st.isFile()) {
    throw makeError("SYMLINK_INPUT_FORBIDDEN", `Input path must be a regular non-symlink file (${missingCode})`);
  }
  return readFileSync(filePath, "utf8");
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

function runCli() {
  const recordPath = (process.env.APPROVED_AUDIT_RECORD_FILE || "").trim();
  const sigPath = (process.env.APPROVED_AUDIT_SIGNATURE_FILE || "").trim();
  const pubKeyPath = (process.env.TRUSTED_ADMIN_PUBKEY_FILE || "").trim();
  const pubKeyPin = (process.env.TRUSTED_ADMIN_PUBKEY_SHA256 || "").trim();
  const expectedSa = (process.env.EXPECTED_AUDIT_SA || "").trim();
  const revokedFile = (process.env.REVOKED_APPROVAL_IDS_FILE || "").trim();

  if (!expectedSa) {
    throw makeError("EXPECTED_AUDIT_SA_MISSING", "EXPECTED_AUDIT_SA environment variable is required");
  }

  const recordJsonText = readRegularFileOrThrow(recordPath, "APPROVAL_RECORD_FILE_MISSING");
  const signatureBase64 = readRegularFileOrThrow(sigPath, "APPROVAL_SIGNATURE_FILE_MISSING");
  const trustedPublicKeyPem = readRegularFileOrThrow(pubKeyPath, "TRUSTED_PUBKEY_FILE_MISSING");

  let revokedIds = [];
  if (revokedFile) {
    const revokedText = readRegularFileOrThrow(revokedFile, "REVOKED_LIST_FILE_MISSING");
    let parsedRevoked;
    try {
      parsedRevoked = JSON.parse(revokedText);
    } catch {
      throw makeError("INVALID_REVOKED_LIST", "REVOKED_APPROVAL_IDS_FILE is not valid JSON");
    }
    if (!Array.isArray(parsedRevoked) || !parsedRevoked.every((v) => typeof v === "string")) {
      throw makeError("INVALID_REVOKED_LIST", "REVOKED_APPROVAL_IDS_FILE must be a JSON string array");
    }
    revokedIds = parsedRevoked;
  }

  const verification = verifySignedApprovalRecord({
    recordJsonText,
    signatureBase64,
    trustedPublicKeyPem,
    trustedPublicKeySha256: pubKeyPin,
    expectedServiceAccountEmail: expectedSa,
    revokedApprovalIds: revokedIds,
  });

  process.stdout.write(JSON.stringify(verification, null, 2) + "\n");
}

if (isDirectExecution()) {
  try {
    runCli();
  } catch (err) {
    const code = err && typeof err.code === "string" ? err.code : "APPROVAL_VERIFICATION_ERROR";
    process.stderr.write(JSON.stringify({ verified: false, errorCode: code }) + "\n");
    process.exitCode = 1;
  }
}
```

### 10.2 `scripts/audit/candidates/etapa28/validate-audit-summary.candidate.mjs` (19307 bytes | 484 linhas | SHA-256: `3aae9b5a7084b166d40c1c3839399607df23f036690330c1c08a72f6875171c5`)

```javascript
#!/usr/bin/env node
/**
 * LOCALIZA+ v1.10.13 — Etapa 28 (Copia Candidata)
 * Validador independente por allowlist estrita para o resumo agregado da auditoria read-only de `/users`.
 *
 * Correcoes candidatas sobre `scripts/audit/validate-audit-summary.mjs` (Etapa 27):
 * - V1: Coerencia matematica de paginacao (`totalRead <= pagesFetched * pageSize` e `pagesFetched === 1` se `totalRead === 0`).
 * - V2: Gravacao protegida do arquivo de saida (`writeRestrictedSummaryFile`):
 *       - Rejeita destino symlink ou diretorio;
 *       - Rejeita arquivo pre-existente com permissoes inadequadas (bits de grupo/outros != 0);
 *       - Aplica `chmodSync(0o600)` explicito apos gravacao e valida `(mode & 0o777) === 0o600`;
 *       - Remove arquivo recem-criado e falha fechado caso a verificacao de permissoes pos-escrita falhe;
 *       - Rejeita arquivos de entrada symlink na CLI.
 *
 * Restricoes preservadas:
 * - Zero conexao Firebase, zero dependencias externas, nenhum dado individual no resumo compartilhavel.
 */

import { chmodSync, existsSync, lstatSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const EXPECTED_IMPLEMENTATION_ORIGIN = "ETAPA_19_INDEPENDENT_IMPLEMENTATION";
export const EXPECTED_AUDITOR_VERSION = "etapa21-v1.1.0";
export const EXPECTED_PROJECT_ID = "gen-lang-client-0490390966";
export const EXPECTED_DATABASE_ID = "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1";
export const EXPECTED_COLLECTION_NAME = "users";
export const EXPECTED_RULES_COMMIT = "dab549f777c00981028eb5515f65d3a1d7058538";
export const EXPECTED_RULES_SHA256 = "2f2a2ffc8c471d7fe97b5d1d2bb3c2a3ca27d39947be64449ad13a532c851f9e";
export const EXPECTED_ROOT_MASKED_UID = "uid_d8665880b647";
export const EXPECTED_MODE = "READ_ONLY";

export const TOP_LEVEL_KEYS = Object.freeze([
  "metadata",
  "pagination",
  "verdict",
  "verdictCode",
  "counts",
  "unexpectedClassificationsCount",
  "inconclusiveReasons",
  "results",
]);

export const SUMMARY_TOP_LEVEL_KEYS = Object.freeze([
  "metadata",
  "pagination",
  "verdictCode",
  "verdict",
  "counts",
  "unexpectedClassificationsCount",
  "inconclusiveReasons",
]);

export const METADATA_KEYS = Object.freeze([
  "implementationOrigin",
  "auditorVersion",
  "projectId",
  "databaseId",
  "collectionName",
  "rulesCommit",
  "rulesSha256Expected",
  "rootAdminMaskedUid",
  "mode",
  "referenceTimeIso",
  "referenceTimeNs",
]);

export const REFERENCE_TIME_NS_KEYS = Object.freeze(["seconds", "nanoseconds"]);

export const PAGINATION_KEYS = Object.freeze([
  "pageSize",
  "pagesFetched",
  "totalRead",
  "completed",
  "duplicateDocIdsCount",
  "stagnantCursorDetected",
  "readError",
]);

export const CLASSIFICATION_KEYS = Object.freeze([
  "DOCUMENTO_COMPATIVEL",
  "BLOQUEIO_INTENCIONAL_COMPATIVEL",
  "INCONSISTENCIA_DE_DADOS",
  "PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE",
  "DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO",
]);

export const VERDICT_MAP = Object.freeze({
  A: "A_APTO_SEM_INCOMPATIBILIDADE_DETECTADA",
  B: "B_REQUER_REVISAO_OU_NORMALIZACAO_PREVIA",
  C: "C_NAO_APTO_HA_PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE",
  D: "D_AUDITORIA_INCONCLUSIVA_OU_INCOMPLETA",
});

const CLASSIFICATION_SET = new Set(CLASSIFICATION_KEYS);
const ISO_MS_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const COMMIT_RE = /^[a-f0-9]{40}$/;
const MASKED_UID_RE = /^uid_[a-f0-9]{12}$/;

function makeError(code, message) {
  return Object.assign(new Error(message), { code });
}

function assertExactKeys(obj, allowedKeys, context) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw makeError("INVALID_OBJECT_TYPE", `Expected plain object at ${context}`);
  }
  const allowedSet = new Set(allowedKeys);
  for (const key of Object.keys(obj)) {
    if (!allowedSet.has(key)) {
      throw makeError("UNEXPECTED_KEY", `Unexpected key ${context}.${key}`);
    }
  }
  for (const key of allowedKeys) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      throw makeError("MISSING_REQUIRED_KEY", `Missing required key ${context}.${key}`);
    }
  }
}

/**
 * Barreira final de saida: garante que o objeto de resumo compartilhavel contem
 * exclusivamente as chaves agregadas permitidas e nenhum campo individual (`results`, etc.).
 */
export function assertShareableSummarySafe(summaryObj) {
  assertExactKeys(summaryObj, SUMMARY_TOP_LEVEL_KEYS, "summary");
  assertExactKeys(summaryObj.metadata, METADATA_KEYS, "summary.metadata");
  assertExactKeys(summaryObj.metadata.referenceTimeNs, REFERENCE_TIME_NS_KEYS, "summary.metadata.referenceTimeNs");
  assertExactKeys(summaryObj.pagination, PAGINATION_KEYS, "summary.pagination");
  assertExactKeys(summaryObj.counts, CLASSIFICATION_KEYS, "summary.counts");
  if (Object.prototype.hasOwnProperty.call(summaryObj, "results")) {
    throw makeError("INDIVIDUAL_RESULTS_FORBIDDEN_IN_SUMMARY", "Summary must never contain results");
  }
  return true;
}

/**
 * Valida o JSON bruto produzido pelo auditor homologado e retorna exclusivamente
 * um novo objeto de resumo agregado validado por allowlist.
 */
export function validateAndExtractAuditSummary(rawReport, { stderrText = "" } = {}) {
  if (typeof stderrText !== "string") {
    throw makeError("INVALID_STDERR_INPUT", "stderrText must be a string");
  }
  if (stderrText.trim().length > 0) {
    throw makeError("NON_EMPTY_STDERR", "Non-empty stderr requires manual quarantine inspection");
  }

  let data = rawReport;
  if (typeof rawReport === "string") {
    try {
      data = JSON.parse(rawReport);
    } catch {
      throw makeError("INVALID_JSON", "Raw audit report is not valid JSON");
    }
  }

  // 1. Allowlist exata de todas as chaves em todos os niveis
  assertExactKeys(data, TOP_LEVEL_KEYS, "root");
  assertExactKeys(data.metadata, METADATA_KEYS, "metadata");
  assertExactKeys(data.metadata.referenceTimeNs, REFERENCE_TIME_NS_KEYS, "metadata.referenceTimeNs");
  assertExactKeys(data.pagination, PAGINATION_KEYS, "pagination");
  assertExactKeys(data.counts, CLASSIFICATION_KEYS, "counts");

  // 2. Validacao de metadados, versao, origem, projeto, banco, colecao, SHA-256, commit e tempo
  const m = data.metadata;
  if (m.implementationOrigin !== EXPECTED_IMPLEMENTATION_ORIGIN) {
    throw makeError("INVALID_IMPLEMENTATION_ORIGIN", "Unexpected auditor implementationOrigin");
  }
  if (m.auditorVersion !== EXPECTED_AUDITOR_VERSION) {
    throw makeError("INVALID_AUDITOR_VERSION", "Unexpected auditorVersion");
  }
  if (m.projectId !== EXPECTED_PROJECT_ID) {
    throw makeError("INVALID_PROJECT_ID", "Unexpected projectId");
  }
  if (m.databaseId !== EXPECTED_DATABASE_ID) {
    throw makeError("INVALID_DATABASE_ID", "Unexpected databaseId");
  }
  if (m.collectionName !== EXPECTED_COLLECTION_NAME) {
    throw makeError("INVALID_COLLECTION_NAME", "Unexpected collectionName");
  }
  if (typeof m.rulesCommit !== "string" || !COMMIT_RE.test(m.rulesCommit) || m.rulesCommit !== EXPECTED_RULES_COMMIT) {
    throw makeError("INVALID_RULES_COMMIT", "rulesCommit is invalid or does not match homologated commit");
  }
  if (typeof m.rulesSha256Expected !== "string" || !SHA256_RE.test(m.rulesSha256Expected) || m.rulesSha256Expected !== EXPECTED_RULES_SHA256) {
    throw makeError("INVALID_RULES_SHA256", "rulesSha256Expected is invalid or does not match homologated hash");
  }
  if (typeof m.rootAdminMaskedUid !== "string" || !MASKED_UID_RE.test(m.rootAdminMaskedUid) || m.rootAdminMaskedUid !== EXPECTED_ROOT_MASKED_UID) {
    throw makeError("INVALID_ROOT_MASKED_UID", "rootAdminMaskedUid mismatch");
  }
  if (m.mode !== EXPECTED_MODE) {
    throw makeError("INVALID_MODE", "Auditor mode must be READ_ONLY");
  }
  if (typeof m.referenceTimeIso !== "string" || !ISO_MS_UTC_RE.test(m.referenceTimeIso) || Number.isNaN(Date.parse(m.referenceTimeIso))) {
    throw makeError("INVALID_REFERENCE_TIME_ISO", "referenceTimeIso is invalid");
  }
  const ns = m.referenceTimeNs;
  if (
    !Number.isInteger(ns.seconds) ||
    ns.seconds <= 0 ||
    !Number.isInteger(ns.nanoseconds) ||
    ns.nanoseconds < 0 ||
    ns.nanoseconds >= 1_000_000_000
  ) {
    throw makeError("INVALID_REFERENCE_TIME_NS", "referenceTimeNs out of valid bounds");
  }
  const expectedIso = new Date(ns.seconds * 1000 + Math.floor(ns.nanoseconds / 1_000_000)).toISOString();
  if (m.referenceTimeIso !== expectedIso) {
    throw makeError("REFERENCE_TIME_MISMATCH", "referenceTimeIso does not match referenceTimeNs");
  }

  // 3. Validacao integral da paginacao (incluindo limites matematicos)
  const p = data.pagination;
  if (!Number.isInteger(p.pageSize) || p.pageSize < 1 || p.pageSize > 1000) {
    throw makeError("INVALID_PAGE_SIZE", "pagination.pageSize must be integer 1..1000");
  }
  if (!Number.isInteger(p.pagesFetched) || p.pagesFetched < 1) {
    throw makeError("INVALID_PAGES_FETCHED", "pagination.pagesFetched must be integer >= 1");
  }
  if (!Number.isInteger(p.totalRead) || p.totalRead < 0) {
    throw makeError("INVALID_TOTAL_READ", "pagination.totalRead must be integer >= 0");
  }
  if (p.totalRead > p.pagesFetched * p.pageSize) {
    throw makeError("PAGINATION_COUNT_EXCEEDS_CAPACITY", "pagination.totalRead exceeds pagesFetched * pageSize");
  }
  if (p.totalRead === 0 && p.pagesFetched !== 1) {
    throw makeError("INVALID_EMPTY_COLLECTION_PAGES", "Empty collection must have exactly pagesFetched === 1");
  }
  if (p.completed !== true) {
    throw makeError("INCOMPLETE_PAGINATION", "pagination.completed must be true");
  }
  if (!Number.isInteger(p.duplicateDocIdsCount) || p.duplicateDocIdsCount !== 0) {
    throw makeError("DUPLICATE_DOC_IDS_DETECTED", "pagination.duplicateDocIdsCount must be 0");
  }
  if (p.stagnantCursorDetected !== false) {
    throw makeError("STAGNANT_CURSOR_DETECTED", "pagination.stagnantCursorDetected must be false");
  }
  if (p.readError !== null) {
    throw makeError("READ_ERROR_PRESENT", "pagination.readError must be null");
  }

  // 4. Validacao real de unexpectedClassificationsCount e inconclusiveReasons
  if (!Number.isInteger(data.unexpectedClassificationsCount) || data.unexpectedClassificationsCount !== 0) {
    throw makeError("UNEXPECTED_CLASSIFICATIONS_NON_ZERO", "unexpectedClassificationsCount must be 0");
  }
  if (!Array.isArray(data.inconclusiveReasons) || !data.inconclusiveReasons.every((r) => typeof r === "string")) {
    throw makeError("INVALID_INCONCLUSIVE_REASONS_TYPE", "inconclusiveReasons must be a string array");
  }

  // 5. Validacao das contagens e recontagem independente sobre `results`
  const validatedCounts = {};
  let countsSum = 0;
  for (const key of CLASSIFICATION_KEYS) {
    const val = data.counts[key];
    if (!Number.isInteger(val) || val < 0) {
      throw makeError("INVALID_COUNT_VALUE", `counts.${key} must be a non-negative integer`);
    }
    validatedCounts[key] = val;
    countsSum += val;
  }
  if (countsSum !== p.totalRead) {
    throw makeError("COUNTS_SUM_MISMATCH", `Sum of counts (${countsSum}) does not match pagination.totalRead (${p.totalRead})`);
  }

  if (!Array.isArray(data.results)) {
    throw makeError("INVALID_RESULTS_TYPE", "results must be an array");
  }
  if (data.results.length !== p.totalRead) {
    throw makeError("RESULTS_LENGTH_MISMATCH", `results.length (${data.results.length}) does not match pagination.totalRead (${p.totalRead})`);
  }

  const recounted = Object.fromEntries(CLASSIFICATION_KEYS.map((k) => [k, 0]));
  const seenMaskedUids = new Set();
  for (let i = 0; i < data.results.length; i += 1) {
    const item = data.results[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw makeError("INVALID_RESULT_ITEM", `results[${i}] must be an object`);
    }
    if (typeof item.maskedUid !== "string" || !MASKED_UID_RE.test(item.maskedUid)) {
      throw makeError("INVALID_RESULT_MASKED_UID", `results[${i}].maskedUid has invalid format`);
    }
    if (seenMaskedUids.has(item.maskedUid)) {
      throw makeError("DUPLICATE_RESULT_ENTRY", `Duplicate maskedUid detected at results[${i}]`);
    }
    seenMaskedUids.add(item.maskedUid);

    if (typeof item.classification !== "string" || !CLASSIFICATION_SET.has(item.classification)) {
      throw makeError("UNKNOWN_CLASSIFICATION", `Unknown classification at results[${i}]`);
    }
    recounted[item.classification] += 1;
  }

  for (const key of CLASSIFICATION_KEYS) {
    if (recounted[key] !== validatedCounts[key]) {
      throw makeError("RECOUNT_MISMATCH", `Recounted ${key} (${recounted[key]}) differs from counts.${key} (${validatedCounts[key]})`);
    }
  }

  // 6. Validacao da coerencia entre veredito, codigo, contagens e inconclusiveReasons
  if (typeof data.verdictCode !== "string" || !Object.prototype.hasOwnProperty.call(VERDICT_MAP, data.verdictCode)) {
    throw makeError("INVALID_VERDICT_CODE", `Unknown verdictCode: ${String(data.verdictCode)}`);
  }
  if (data.verdict !== VERDICT_MAP[data.verdictCode]) {
    throw makeError("VERDICT_TEXT_MISMATCH", "verdict text does not match verdictCode");
  }

  if (p.totalRead === 0) {
    const isExactEmptyCollection =
      data.verdictCode === "D" &&
      data.inconclusiveReasons.length === 1 &&
      data.inconclusiveReasons[0] === "EMPTY_COLLECTION";
    if (!isExactEmptyCollection) {
      throw makeError(
        "INVALID_EMPTY_COLLECTION_VERDICT",
        "Zero-document report must carry verdictCode D and inconclusiveReasons ['EMPTY_COLLECTION']"
      );
    }
  } else {
    if (data.inconclusiveReasons.length !== 0) {
      throw makeError("INCONCLUSIVE_REASONS_NON_EMPTY", "Non-empty report cannot have inconclusiveReasons");
    }
    if (data.verdictCode === "D") {
      throw makeError("INCONCLUSIVE_VERDICT_REJECTED", "Inconclusive verdict D is rejected for non-empty report");
    }
    let expectedCode = "A";
    if (validatedCounts.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE > 0) {
      expectedCode = "C";
    } else if (
      validatedCounts.INCONSISTENCIA_DE_DADOS > 0 ||
      validatedCounts.DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO > 0
    ) {
      expectedCode = "B";
    }
    if (data.verdictCode !== expectedCode) {
      throw makeError("VERDICT_COUNTS_INCONSISTENCY", `Expected verdictCode ${expectedCode} for counts, received ${data.verdictCode}`);
    }
  }

  // 7. Construcao de novo objeto exclusivamente agregado (sem `results`) derivado dos dados validados
  const validatedSummary = {
    metadata: {
      implementationOrigin: m.implementationOrigin,
      auditorVersion: m.auditorVersion,
      projectId: m.projectId,
      databaseId: m.databaseId,
      collectionName: m.collectionName,
      rulesCommit: m.rulesCommit,
      rulesSha256Expected: m.rulesSha256Expected,
      rootAdminMaskedUid: m.rootAdminMaskedUid,
      mode: m.mode,
      referenceTimeIso: m.referenceTimeIso,
      referenceTimeNs: {
        seconds: ns.seconds,
        nanoseconds: ns.nanoseconds,
      },
    },
    pagination: {
      pageSize: p.pageSize,
      pagesFetched: p.pagesFetched,
      totalRead: p.totalRead,
      completed: p.completed,
      duplicateDocIdsCount: p.duplicateDocIdsCount,
      stagnantCursorDetected: p.stagnantCursorDetected,
      readError: p.readError,
    },
    verdictCode: data.verdictCode,
    verdict: data.verdict,
    counts: { ...validatedCounts },
    unexpectedClassificationsCount: data.unexpectedClassificationsCount,
    inconclusiveReasons: [...data.inconclusiveReasons],
  };

  assertShareableSummarySafe(validatedSummary);
  return validatedSummary;
}

/**
 * Grava o resumo compartilhavel garantindo permissoes estritas 0600,
 * rejeitando symlinks, diretorios ou arquivos pre-existentes com permissoes frouxas.
 */
export function writeRestrictedSummaryFile(
  outPath,
  summary,
  fsOps = { existsSync, lstatSync, writeFileSync, chmodSync, unlinkSync }
) {
  if (typeof outPath !== "string" || outPath.trim().length === 0) {
    throw makeError("SUMMARY_OUT_PATH_MISSING", "Output path is required");
  }
  assertShareableSummarySafe(summary);

  let existedBefore = false;
  if (fsOps.existsSync(outPath)) {
    existedBefore = true;
    const preStat = fsOps.lstatSync(outPath);
    if (preStat.isSymbolicLink()) {
      throw makeError("OUTPUT_PATH_IS_SYMLINK", "Output path must not be a symbolic link");
    }
    if (preStat.isDirectory()) {
      throw makeError("OUTPUT_PATH_IS_DIRECTORY", "Output path must not be a directory");
    }
    if ((preStat.mode & 0o077) !== 0) {
      throw makeError(
        "INSECURE_EXISTING_OUTPUT_PERMISSIONS",
        "Existing output file has overly permissive group/other permissions"
      );
    }
  }

  const serialized = JSON.stringify(summary, null, 2) + "\n";
  try {
    fsOps.writeFileSync(outPath, serialized, { mode: 0o600 });
    fsOps.chmodSync(outPath, 0o600);
  } catch (err) {
    const causeCode = err && typeof err.code === "string" ? err.code : "WRITE_FAILED";
    throw makeError("SUMMARY_WRITE_FAILED", `Failed to write restricted summary file (${causeCode})`);
  }

  const postStat = fsOps.lstatSync(outPath);
  const actualMode = postStat.mode & 0o777;
  if (postStat.isSymbolicLink() || !postStat.isFile() || actualMode !== 0o600) {
    if (!existedBefore) {
      try {
        fsOps.unlinkSync(outPath);
      } catch {
        // Ignora erro secundario de limpeza
      }
    }
    throw makeError(
      "INSECURE_OUTPUT_FILE_PERMISSIONS",
      `Output file mode must be 0600, observed 0${actualMode.toString(8)}`
    );
  }

  return { mode: actualMode };
}

function readRegularInputFile(filePath, missingCode) {
  if (!filePath || !existsSync(filePath)) {
    throw makeError(missingCode, `Required input file missing (${missingCode})`);
  }
  const st = lstatSync(filePath);
  if (st.isSymbolicLink() || !st.isFile()) {
    throw makeError("SYMLINK_INPUT_FORBIDDEN", `Input file must be a regular non-symlink file (${missingCode})`);
  }
  return readFileSync(filePath, "utf8");
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

function runCli() {
  const rawPath = (process.env.AUDIT_RAW_QUARANTINE_FILE || "").trim();
  const stderrPath = (process.env.AUDIT_STDERR_QUARANTINE_FILE || "").trim();
  const outPath = (process.env.AUDIT_SUMMARY_OUT_FILE || "").trim();

  const rawText = readRegularInputFile(rawPath, "RAW_QUARANTINE_FILE_MISSING");
  const stderrText = readRegularInputFile(stderrPath, "STDERR_QUARANTINE_FILE_MISSING");
  if (!outPath) {
    throw makeError("SUMMARY_OUT_PATH_MISSING", "AUDIT_SUMMARY_OUT_FILE missing");
  }

  const summary = validateAndExtractAuditSummary(rawText, { stderrText });
  writeRestrictedSummaryFile(outPath, summary);

  process.stdout.write(
    JSON.stringify({
      status: "SUMMARY_VALIDATED_BY_ALLOWLIST",
      verdictCode: summary.verdictCode,
      totalRead: summary.pagination.totalRead,
    }) + "\n"
  );
}

if (isDirectExecution()) {
  try {
    runCli();
  } catch (err) {
    const code = err && typeof err.code === "string" ? err.code : "SUMMARY_VALIDATION_ERROR";
    process.stderr.write(JSON.stringify({ status: "REJECTED", errorCode: code }) + "\n");
    process.exitCode = 1;
  }
}
```

### 10.3 `scripts/audit/candidates/etapa28/probe-readonly-v4.candidate.mjs` (17053 bytes | 404 linhas | SHA-256: `e2e3254c01877b1ef6bf3b21e8ee703ab0139c95859e1dfdd4b4135107eb90c9`)

```javascript
#!/usr/bin/env node
/**
 * LOCALIZA+ v1.10.13 — Etapa 28 (Copia Candidata Integral)
 * Sonda read-only `probe-readonly-v4` para verificacao minima de conectividade ao banco nomeado.
 *
 * ATENCAO — LIMITACAO DE ESCOPO:
 * - Esta sonda executa no maximo `db.collection("users").select().limit(1).get()` quando
 *   explicitamente invocada em estacao externa autorizada com `--execute-probe-readonly`.
 * - A sonda de 1 documento NAO comprova integridade, compatibilidade ou cobertura da colecao `/users`,
 *   NAO substitui a auditoria integral e NAO comprova ausencia de permissoes IAM excessivas.
 * - Sem `--execute-probe-readonly`, o script NAO conecta ao Firebase, NAO le ADC e NAO emite tokens.
 * - Zero imports estaticos de `firebase-admin` e zero metodos de escrita no codigo.
 */

import { existsSync, lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  EXPECTED_COLLECTION_NAME,
  EXPECTED_DATABASE_ID,
  EXPECTED_PROJECT_ID,
  SERVICE_ACCOUNT_RE,
  verifySignedApprovalRecord,
} from "./verify-approval-record.candidate.mjs";

export const PROBE_VERSION = "probe-readonly-v4";
export const PROBE_LIMIT = 1;
export const FORBIDDEN_DEFAULT_DATABASE_ID = "(default)";

export const BLOCKED_ENV_VARS = Object.freeze([
  "FIREBASE_CONFIG",
  "FIRESTORE_EMULATOR_HOST",
  "FIREBASE_AUTH_EMULATOR_HOST",
  "GCLOUD_PROJECT",
  "GOOGLE_CLOUD_PROJECT",
  "GCP_PROJECT",
  "GOOGLE_CLOUD_QUOTA_PROJECT",
  "GCE_METADATA_HOST",
  "GCE_METADATA_ROOT",
  "GCE_METADATA_IP",
  "METADATA_SERVER_HOST",
  "CLOUDSDK_CORE_PROJECT",
  "CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT",
  "GOOGLE_API_USE_CLIENT_CERTIFICATE",
  "NODE_TLS_REJECT_UNAUTHORIZED",
]);

const IMPERSONATION_PATH_RE =
  /^\/v1\/projects\/-\/serviceAccounts\/([a-z][a-z0-9-]{4,28}[a-z0-9]@gen-lang-client-0490390966\.iam\.gserviceaccount\.com):generateAccessToken$/;

function makeError(code, message) {
  return Object.assign(new Error(message), { code });
}

/**
 * 1. Bloqueia variaveis de ambiente capazes de redirecionar projeto, emuladores,
 *    credenciais ou Metadata Server, e exige NO_GCE_CHECK=true.
 */
export function assertSafeProbeEnvironment(env = process.env) {
  if (!env || typeof env !== "object") {
    throw makeError("INVALID_ENVIRONMENT", "Environment map is invalid");
  }
  for (const key of BLOCKED_ENV_VARS) {
    const val = env[key];
    if (typeof val === "string" && val.trim().length > 0) {
      throw makeError("BLOCKED_ENV_VAR_PRESENT", `Blocked environment variable is set: ${key}`);
    }
  }
  if (String(env.NO_GCE_CHECK || "").trim().toLowerCase() !== "true") {
    throw makeError("METADATA_FALLBACK_NOT_DISABLED", "NO_GCE_CHECK must be explicitly set to 'true'");
  }
  const adcPath = typeof env.GOOGLE_APPLICATION_CREDENTIALS === "string" ? env.GOOGLE_APPLICATION_CREDENTIALS.trim() : "";
  if (!adcPath) {
    throw makeError("ADC_FILE_ENV_MISSING", "GOOGLE_APPLICATION_CREDENTIALS must point to an explicit ADC file");
  }
  return { adcPath };
}

/**
 * 2. Valida estritamente o JSON de credenciais ADC de impersonacao:
 *    - type === "impersonated_service_account"
 *    - URL de impersonacao sem redirecionamento de host, porta, usuario/senha, caminho ou query/hash
 *    - Correspondencia exata da conta de servico com o registro assinado Ed25519
 *    - source_credentials obrigatoriamente `authorized_user` (bloqueia chave privada estatica)
 *    - delegates vazio/ausente, quota_project_id coerente, universe_domain padrao
 */
export function validateImpersonatedAdcPayload(
  adcJsonText,
  {
    expectedServiceAccountEmail,
    expectedSourceClientId = null,
    expectedProjectId = EXPECTED_PROJECT_ID,
  }
) {
  if (typeof expectedServiceAccountEmail !== "string" || !SERVICE_ACCOUNT_RE.test(expectedServiceAccountEmail)) {
    throw makeError("INVALID_EXPECTED_SERVICE_ACCOUNT", "Expected service account email is invalid");
  }
  if (typeof adcJsonText !== "string" || adcJsonText.trim().length === 0) {
    throw makeError("EMPTY_ADC_PAYLOAD", "ADC file content is empty");
  }

  let adc;
  try {
    adc = JSON.parse(adcJsonText);
  } catch {
    throw makeError("INVALID_ADC_JSON", "ADC file is not valid JSON");
  }
  if (!adc || typeof adc !== "object" || Array.isArray(adc)) {
    throw makeError("INVALID_ADC_STRUCTURE", "ADC payload must be a JSON object");
  }
  if (adc.type !== "impersonated_service_account") {
    throw makeError("UNEXPECTED_ADC_TYPE", `ADC type must be impersonated_service_account, got ${String(adc.type)}`);
  }

  // Validacao estrita da URL de impersonacao
  const rawUrl = adc.service_account_impersonation_url;
  if (typeof rawUrl !== "string" || rawUrl.trim() !== rawUrl || rawUrl.length === 0) {
    throw makeError("INVALID_IMPERSONATION_URL", "service_account_impersonation_url must be a non-empty trimmed string");
  }
  if (/%2f|%5c|\.\./i.test(rawUrl)) {
    throw makeError("INVALID_IMPERSONATION_URL_PATH", "Impersonation URL contains forbidden traversal or encoded slash");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw makeError("INVALID_IMPERSONATION_URL", "Unable to parse service_account_impersonation_url");
  }
  if (parsedUrl.protocol !== "https:") {
    throw makeError("INVALID_IMPERSONATION_URL_PROTOCOL", "Impersonation URL must use https:");
  }
  if (parsedUrl.hostname !== "iamcredentials.googleapis.com") {
    throw makeError("INVALID_IMPERSONATION_URL_HOST", "Impersonation URL hostname must be iamcredentials.googleapis.com");
  }
  // Nota: URL API normaliza :443 para "", portanto verificamos tambem a string bruta contra porta explicita
  if (parsedUrl.port !== "" || /^https:\/\/iamcredentials\.googleapis\.com:\d+/i.test(rawUrl)) {
    throw makeError("INVALID_IMPERSONATION_URL_PORT", "Impersonation URL must not specify an explicit port");
  }
  if (parsedUrl.username !== "" || parsedUrl.password !== "") {
    throw makeError("INVALID_IMPERSONATION_URL_AUTH", "Impersonation URL must not contain userinfo");
  }
  if (parsedUrl.search !== "" || parsedUrl.hash !== "" || rawUrl.includes("?") || rawUrl.includes("#")) {
    throw makeError("INVALID_IMPERSONATION_URL_PARAMS", "Impersonation URL must not contain query parameters or fragments");
  }
  const pathMatch = IMPERSONATION_PATH_RE.exec(parsedUrl.pathname);
  if (!pathMatch) {
    throw makeError("INVALID_IMPERSONATION_URL_PATH", "Impersonation URL path does not match canonical generateAccessToken endpoint");
  }
  const impersonatedSa = pathMatch[1];
  if (impersonatedSa !== expectedServiceAccountEmail) {
    throw makeError("IMPERSONATED_SA_MISMATCH", "Impersonated service account in ADC does not match approved service account");
  }

  // Validacao de delegates (sem cadeia oculta de delegacao)
  if (adc.delegates !== undefined) {
    if (!Array.isArray(adc.delegates) || adc.delegates.length > 0) {
      throw makeError("NON_EMPTY_DELEGATES_FORBIDDEN", "ADC delegates chain must be empty");
    }
  }

  // Validacao de quota_project_id e universe_domain
  if (adc.quota_project_id !== undefined && adc.quota_project_id !== expectedProjectId) {
    throw makeError("QUOTA_PROJECT_MISMATCH", "ADC quota_project_id does not match target project");
  }
  if (adc.universe_domain !== undefined && adc.universe_domain !== "googleapis.com") {
    throw makeError("UNEXPECTED_UNIVERSE_DOMAIN", "ADC universe_domain must be googleapis.com");
  }

  // Validacao das credenciais de origem (source_credentials)
  const src = adc.source_credentials;
  if (!src || typeof src !== "object" || Array.isArray(src)) {
    throw makeError("MISSING_SOURCE_CREDENTIALS", "ADC source_credentials must be present");
  }
  if (Object.prototype.hasOwnProperty.call(src, "private_key") || Object.prototype.hasOwnProperty.call(src, "private_key_id")) {
    throw makeError("STATIC_PRIVATE_KEY_SOURCE_FORBIDDEN", "source_credentials must not contain static private key material");
  }
  if (src.type !== "authorized_user") {
    throw makeError("UNEXPECTED_SOURCE_CREDENTIAL_TYPE", `source_credentials.type must be authorized_user, got ${String(src.type)}`);
  }
  if (typeof src.client_id !== "string" || src.client_id.trim().length === 0) {
    throw makeError("INVALID_SOURCE_CLIENT_ID", "source_credentials.client_id must be a non-empty string");
  }
  if (typeof src.refresh_token !== "string" || src.refresh_token.trim().length === 0) {
    throw makeError("MISSING_SOURCE_REFRESH_TOKEN", "source_credentials.refresh_token must be present");
  }
  if (src.universe_domain !== undefined && src.universe_domain !== "googleapis.com") {
    throw makeError("UNEXPECTED_SOURCE_UNIVERSE_DOMAIN", "source_credentials.universe_domain must be googleapis.com");
  }
  if (expectedSourceClientId !== null && expectedSourceClientId !== undefined) {
    const trimmedClientId = String(expectedSourceClientId).trim();
    if (trimmedClientId.length > 0 && src.client_id !== trimmedClientId) {
      throw makeError("SOURCE_CLIENT_ID_MISMATCH", "ADC source_credentials.client_id does not match expected origin client");
    }
  }

  return {
    adcType: adc.type,
    impersonatedServiceAccount: impersonatedSa,
    sourceCredentialType: src.type,
    quotaProjectId: adc.quota_project_id ?? null,
    originIdentityNotice:
      "SOURCE_CREDENTIALS_TYPE_CHECKED_ONLY_DOES_NOT_PROVE_HUMAN_OPERATOR_EMAIL_WITHOUT_OAUTH_TOKENINFO_AND_IAM_EVIDENCE",
  };
}

/**
 * 3. Valida alvo exato da sonda (rejeita explicitamente `(default)` e qualquer limit != 1).
 */
export function validateProbeTarget({
  projectId = EXPECTED_PROJECT_ID,
  databaseId = EXPECTED_DATABASE_ID,
  collectionName = EXPECTED_COLLECTION_NAME,
  limit = PROBE_LIMIT,
} = {}) {
  if (databaseId === FORBIDDEN_DEFAULT_DATABASE_ID) {
    throw makeError("DEFAULT_DATABASE_FORBIDDEN", "Explicitly forbidden to probe (default) Firestore database");
  }
  if (projectId !== EXPECTED_PROJECT_ID) {
    throw makeError("PROBE_PROJECT_ID_MISMATCH", "Probe projectId does not match target project");
  }
  if (databaseId !== EXPECTED_DATABASE_ID) {
    throw makeError("PROBE_DATABASE_ID_MISMATCH", "Probe databaseId does not match target named database");
  }
  if (collectionName !== EXPECTED_COLLECTION_NAME) {
    throw makeError("PROBE_COLLECTION_MISMATCH", "Probe collectionName must be users");
  }
  if (limit !== PROBE_LIMIT) {
    throw makeError("PROBE_LIMIT_INVALID", "Probe limit must be strictly 1");
  }
  return { projectId, databaseId, collectionName, limit };
}

function readRegularFile(filePath, missingCode) {
  if (!filePath || !existsSync(filePath)) {
    throw makeError(missingCode, `Required file missing (${missingCode})`);
  }
  const st = lstatSync(filePath);
  if (st.isSymbolicLink() || !st.isFile()) {
    throw makeError("SYMLINK_INPUT_FORBIDDEN", `File must be a regular non-symlink file (${missingCode})`);
  }
  return readFileSync(filePath, "utf8");
}

/**
 * 4. Orquestracao completa da sonda com validacao fail-closed ANTES de qualquer import
 *    ou inicializacao do Firebase Admin, tratamento de erros, `finally` e `deleteApp(app)`.
 */
export async function runProbeReadOnlyV4({
  env = process.env,
  targetOverrides = {},
  executeLiveQuery = null,
} = {}) {
  // ETAPA A — Validar registro assinado Ed25519 ANTES de ler ADC ou inicializar Firebase Admin
  const recordPath = String(env.APPROVED_AUDIT_RECORD_FILE || "").trim();
  const sigPath = String(env.APPROVED_AUDIT_SIGNATURE_FILE || "").trim();
  const pubKeyPath = String(env.TRUSTED_ADMIN_PUBKEY_FILE || "").trim();
  const pubKeyPin = String(env.TRUSTED_ADMIN_PUBKEY_SHA256 || "").trim();
  const expectedSa = String(env.EXPECTED_AUDIT_SA || "").trim();
  const revokedFile = String(env.REVOKED_APPROVAL_IDS_FILE || "").trim();

  if (!expectedSa) {
    throw makeError("EXPECTED_AUDIT_SA_MISSING", "EXPECTED_AUDIT_SA is required");
  }

  const recordJsonText = readRegularFile(recordPath, "APPROVAL_RECORD_FILE_MISSING");
  const signatureBase64 = readRegularFile(sigPath, "APPROVAL_SIGNATURE_FILE_MISSING");
  const trustedPublicKeyPem = readRegularFile(pubKeyPath, "TRUSTED_PUBKEY_FILE_MISSING");

  let revokedIds = [];
  if (revokedFile) {
    const parsedRevoked = JSON.parse(readRegularFile(revokedFile, "REVOKED_LIST_FILE_MISSING"));
    if (!Array.isArray(parsedRevoked) || !parsedRevoked.every((v) => typeof v === "string")) {
      throw makeError("INVALID_REVOKED_LIST", "REVOKED_APPROVAL_IDS_FILE must be a string array");
    }
    revokedIds = parsedRevoked;
  }

  const approval = verifySignedApprovalRecord({
    recordJsonText,
    signatureBase64,
    trustedPublicKeyPem,
    trustedPublicKeySha256: pubKeyPin,
    expectedServiceAccountEmail: expectedSa,
    revokedApprovalIds: revokedIds,
  });

  // ETAPA B — Validar variaveis de ambiente bloqueadas e desativacao de Metadata Server
  const { adcPath } = assertSafeProbeEnvironment(env);

  // ETAPA C — Ler e validar o arquivo ADC de impersonacao contra a SA aprovada
  const adcJsonText = readRegularFile(adcPath, "ADC_FILE_MISSING");
  const expectedSourceClientId = String(env.EXPECTED_ADC_SOURCE_CLIENT_ID || "").trim() || null;
  const adcCheck = validateImpersonatedAdcPayload(adcJsonText, {
    expectedServiceAccountEmail: approval.serviceAccountEmail,
    expectedSourceClientId,
    expectedProjectId: approval.projectId,
  });

  // ETAPA D — Validar alvo exato (rejeita `(default)` e qualquer limit != 1)
  const target = validateProbeTarget({
    projectId: targetOverrides.projectId ?? approval.projectId,
    databaseId: targetOverrides.databaseId ?? approval.databaseId,
    collectionName: targetOverrides.collectionName ?? approval.collectionName,
    limit: targetOverrides.limit ?? PROBE_LIMIT,
  });

  // ETAPA E — Consulta read-only minima (`users`, `limit(1)`) com encerramento garantido em `finally`
  let firebaseApp = null;
  let deleteAppFn = null;
  try {
    let documentsReturned;
    let hasAtLeastOneDocument;

    if (typeof executeLiveQuery === "function") {
      const injected = await executeLiveQuery({ target, approval, adcCheck });
      documentsReturned = injected.size;
      hasAtLeastOneDocument = !injected.empty;
    } else {
      const { applicationDefault, deleteApp, initializeApp } = await import("firebase-admin/app");
      const { getFirestore } = await import("firebase-admin/firestore");
      deleteAppFn = deleteApp;

      const appName = `probe-readonly-v4-${target.projectId}-${target.databaseId}`;
      firebaseApp = initializeApp(
        {
          credential: applicationDefault(),
          projectId: target.projectId,
        },
        appName
      );

      const db = getFirestore(firebaseApp, target.databaseId);
      // `.select()` sem campos evita trafegar campos do documento; apenas `snap.size` e `snap.empty` sao lidos.
      const snap = await db.collection(target.collectionName).select().limit(target.limit).get();
      documentsReturned = snap.size;
      hasAtLeastOneDocument = !snap.empty;
    }

    return {
      probeVersion: PROBE_VERSION,
      status: "PROBE_READONLY_OK",
      approvalId: approval.approvalId,
      projectId: target.projectId,
      databaseId: target.databaseId,
      collectionName: target.collectionName,
      limit: target.limit,
      adcType: adcCheck.adcType,
      sourceCredentialType: adcCheck.sourceCredentialType,
      documentsReturned,
      hasAtLeastOneDocument,
      scopeNotice: "SINGLE_DOCUMENT_CONNECTIVITY_PROBE_ONLY_NOT_FULL_COLLECTION_AUDIT",
    };
  } finally {
    if (firebaseApp && typeof deleteAppFn === "function") {
      try {
        await deleteAppFn(firebaseApp);
      } catch {
        // Evita mascarar erro principal de execucao
      }
    }
  }
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isDirectExecution()) {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || !args.has("--execute-probe-readonly")) {
    process.stdout.write(
      JSON.stringify(
        {
          probeVersion: PROBE_VERSION,
          status: "DRY_INFO_NO_FIREBASE_CONNECTION",
          targetProjectId: EXPECTED_PROJECT_ID,
          targetDatabaseId: EXPECTED_DATABASE_ID,
          targetCollection: EXPECTED_COLLECTION_NAME,
          limit: PROBE_LIMIT,
          usage: "NO_GCE_CHECK=true node scripts/audit/candidates/etapa28/probe-readonly-v4.candidate.mjs --execute-probe-readonly",
        },
        null,
        2
      ) + "\n"
    );
  } else {
    runProbeReadOnlyV4({ env: process.env })
      .then((result) => {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      })
      .catch((err) => {
        const code = err && typeof err.code === "string" ? err.code : "PROBE_READONLY_FAILED";
        process.stderr.write(
          JSON.stringify({
            probeVersion: PROBE_VERSION,
            status: "PROBE_READONLY_REJECTED",
            errorCode: code,
          }) + "\n"
        );
        process.exitCode = 1;
      });
  }
}
```

### 10.4 `scripts/audit/candidates/etapa28/etapa28-security.test.mjs` (30363 bytes | 789 linhas | SHA-256: `ae55f54fda2f9347d0ad5a40eac3d2760fe5810ce8a83fdbc85aa83f3d634763`)

```javascript
/**
 * LOCALIZA+ v1.10.13 — Etapa 28
 * Suite complementar de testes sinteticos (100% dados ficticios, zero Firebase, zero credenciais ADC)
 * cobrindo as lacunas especificas exigidas na Etapa 28 para:
 * - `verify-approval-record.candidate.mjs`
 * - `validate-audit-summary.candidate.mjs`
 * - `probe-readonly-v4.candidate.mjs`
 */

import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  APPROVAL_RECORD_KEYS,
  EXPECTED_COLLECTION_NAME,
  EXPECTED_DATABASE_ID,
  EXPECTED_PROJECT_ID,
  canonicalizeApprovalRecord,
  computePublicKeyFingerprintSha256,
  verifySignedApprovalRecord,
} from "./verify-approval-record.candidate.mjs";
import {
  CLASSIFICATION_KEYS,
  EXPECTED_AUDITOR_VERSION,
  EXPECTED_IMPLEMENTATION_ORIGIN,
  EXPECTED_MODE,
  EXPECTED_ROOT_MASKED_UID,
  EXPECTED_RULES_COMMIT,
  EXPECTED_RULES_SHA256,
  VERDICT_MAP,
  validateAndExtractAuditSummary,
  writeRestrictedSummaryFile,
} from "./validate-audit-summary.candidate.mjs";
import {
  BLOCKED_ENV_VARS,
  FORBIDDEN_DEFAULT_DATABASE_ID,
  assertSafeProbeEnvironment,
  runProbeReadOnlyV4,
  validateImpersonatedAdcPayload,
  validateProbeTarget,
} from "./probe-readonly-v4.candidate.mjs";

const FICTITIOUS_SA = "audit-readonly-ficticio@gen-lang-client-0490390966.iam.gserviceaccount.com";
const OTHER_FICTITIOUS_SA = "outra-conta-ficticia@gen-lang-client-0490390966.iam.gserviceaccount.com";
const REF_NS = Object.freeze({ seconds: 1_750_000_000, nanoseconds: 0 });
const REF_ISO = new Date(REF_NS.seconds * 1000).toISOString();

const CANDIDATE_VALIDATOR_CLI = resolve("scripts/audit/candidates/etapa28/validate-audit-summary.candidate.mjs");
const CANDIDATE_VERIFIER_CLI = resolve("scripts/audit/candidates/etapa28/verify-approval-record.candidate.mjs");
const CANDIDATE_PROBE_PATH = resolve("scripts/audit/candidates/etapa28/probe-readonly-v4.candidate.mjs");

function makeApprovalFixture(recordOverrides = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const trustedPin = computePublicKeyFingerprintSha256(publicKeyPem);
  const now = new Date();
  const issuedAt = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();

  const record = {
    schemaVersion: "localiza-audit-approval-v1",
    approvalId: "APPR-2026-FICTICIO-028",
    projectId: EXPECTED_PROJECT_ID,
    databaseId: EXPECTED_DATABASE_ID,
    collectionName: EXPECTED_COLLECTION_NAME,
    serviceAccountEmail: FICTITIOUS_SA,
    purpose: "READ_ONLY_USERS_COMPATIBILITY_AUDIT",
    scope: "READ_ONLY",
    issuedAt,
    expiresAt,
    revoked: false,
    issuerKeyId: "gcp-admin-ed25519-ficticio-28",
    ...recordOverrides,
  };
  const canonical = canonicalizeApprovalRecord(record);
  const signatureBase64 = sign(null, canonical, privateKey).toString("base64");
  return { record, recordJsonText: JSON.stringify(record, null, 2), signatureBase64, publicKeyPem, trustedPin, privateKey };
}

function makeSyntheticResult(index, classification) {
  return {
    maskedUid: `uid_${index.toString(16).padStart(12, "0")}`,
    classification,
  };
}

function makeValidReport(resultsList, overrides = {}) {
  const counts = Object.fromEntries(CLASSIFICATION_KEYS.map((k) => [k, 0]));
  for (const r of resultsList) {
    if (Object.prototype.hasOwnProperty.call(counts, r.classification)) {
      counts[r.classification] += 1;
    }
  }
  const totalRead = resultsList.length;
  let verdictCode = "A";
  let inconclusiveReasons = [];
  if (totalRead === 0) {
    verdictCode = "D";
    inconclusiveReasons = ["EMPTY_COLLECTION"];
  } else if (counts.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE > 0) {
    verdictCode = "C";
  } else if (counts.INCONSISTENCIA_DE_DADOS > 0 || counts.DEPENDE_DE_OUTRA_CONDICAO_DE_AUTORIZACAO > 0) {
    verdictCode = "B";
  }
  return {
    metadata: {
      implementationOrigin: EXPECTED_IMPLEMENTATION_ORIGIN,
      auditorVersion: EXPECTED_AUDITOR_VERSION,
      projectId: EXPECTED_PROJECT_ID,
      databaseId: EXPECTED_DATABASE_ID,
      collectionName: EXPECTED_COLLECTION_NAME,
      rulesCommit: EXPECTED_RULES_COMMIT,
      rulesSha256Expected: EXPECTED_RULES_SHA256,
      rootAdminMaskedUid: EXPECTED_ROOT_MASKED_UID,
      mode: EXPECTED_MODE,
      referenceTimeIso: REF_ISO,
      referenceTimeNs: { ...REF_NS },
    },
    pagination: {
      pageSize: 500,
      pagesFetched: 1,
      totalRead,
      completed: true,
      duplicateDocIdsCount: 0,
      stagnantCursorDetected: false,
      readError: null,
    },
    verdict: VERDICT_MAP[verdictCode],
    verdictCode,
    counts,
    unexpectedClassificationsCount: 0,
    inconclusiveReasons,
    results: resultsList,
    ...overrides,
  };
}

function makeValidImpersonatedAdc(overrides = {}) {
  return {
    type: "impersonated_service_account",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${FICTITIOUS_SA}:generateAccessToken`,
    quota_project_id: EXPECTED_PROJECT_ID,
    delegates: [],
    source_credentials: {
      type: "authorized_user",
      client_id: "fictitious-client-id.apps.googleusercontent.com",
      client_secret: "fictitious-non-secret-placeholder",
      refresh_token: "fictitious-refresh-token-placeholder",
    },
    ...overrides,
  };
}

test("E28-01. Fingerprint alterado junto com chave publica substituida (rejeicao contra ancora confiavel independente)", () => {
  const trustedAdmin = makeApprovalFixture();
  const attacker = makeApprovalFixture();

  // 1) Atacante envia sua propria chave publica contra o pin oficial do administrador -> REJEITADO
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: attacker.recordJsonText,
        signatureBase64: attacker.signatureBase64,
        trustedPublicKeyPem: attacker.publicKeyPem,
        trustedPublicKeySha256: trustedAdmin.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "UNTRUSTED_PUBLIC_KEY_FINGERPRINT" }
  );

  // 2) Atacante altera tambem o fingerprint para um hash divergente da chave -> REJEITADO
  const alteredPin = attacker.trustedPin.startsWith("0")
    ? "f" + attacker.trustedPin.slice(1)
    : "0" + attacker.trustedPin.slice(1);
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: attacker.recordJsonText,
        signatureBase64: attacker.signatureBase64,
        trustedPublicKeyPem: attacker.publicKeyPem,
        trustedPublicKeySha256: alteredPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "UNTRUSTED_PUBLIC_KEY_FINGERPRINT" }
  );

  // 3) Evidencia de modelo de ameaca: se o operador controlasse tanto a chave quanto o pin (sem canal independente),
  //    a matematica local aprovaria, o que comprova por que o pin DEVE vir de canal administrativo independente.
  assert.notEqual(attacker.trustedPin, trustedAdmin.trustedPin);
});

test("E28-02. Registro assinado com finalidade (purpose) ou escopo (scope) incorreto", () => {
  const badPurpose = makeApprovalFixture({ purpose: "MIGRATE_USERS_COLLECTION" });
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: badPurpose.recordJsonText,
        signatureBase64: badPurpose.signatureBase64,
        trustedPublicKeyPem: badPurpose.publicKeyPem,
        trustedPublicKeySha256: badPurpose.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "INVALID_PURPOSE" }
  );

  const badScope = makeApprovalFixture({ scope: "READ_WRITE" });
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: badScope.recordJsonText,
        signatureBase64: badScope.signatureBase64,
        trustedPublicKeyPem: badScope.publicKeyPem,
        trustedPublicKeySha256: badScope.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "INVALID_SCOPE" }
  );
});

test("E28-03. Registro com datas invalidas (calendario inexistente, formato invalido, janela > 7d, inversao e referenceTime invalido)", () => {
  // Data inexistente de calendario (V8 Date.parse rolaria 2026-02-30 para 2026-03-02 sem round-trip)
  const rolloverDate = makeApprovalFixture({
    issuedAt: "2026-02-30T10:00:00.000Z",
    expiresAt: "2026-03-01T10:00:00.000Z",
  });
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: rolloverDate.recordJsonText,
        signatureBase64: rolloverDate.signatureBase64,
        trustedPublicKeyPem: rolloverDate.publicKeyPem,
        trustedPublicKeySha256: rolloverDate.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "INVALID_TIMESTAMP_CALENDAR" }
  );

  // Formato nao-UTC (offset -03:00)
  const badFmt = makeApprovalFixture({ issuedAt: "2026-06-01T10:00:00-03:00" });
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: badFmt.recordJsonText,
        signatureBase64: badFmt.signatureBase64,
        trustedPublicKeyPem: badFmt.publicKeyPem,
        trustedPublicKeySha256: badFmt.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "INVALID_TIMESTAMP_FORMAT" }
  );

  // expiresAt <= issuedAt
  const inverted = makeApprovalFixture({
    issuedAt: "2026-06-01T12:00:00.000Z",
    expiresAt: "2026-06-01T11:00:00.000Z",
  });
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: inverted.recordJsonText,
        signatureBase64: inverted.signatureBase64,
        trustedPublicKeyPem: inverted.publicKeyPem,
        trustedPublicKeySha256: inverted.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
        referenceTime: new Date("2026-06-01T12:00:00.000Z"),
      }),
    { code: "INVALID_VALIDITY_WINDOW" }
  );

  // Janela maior que 7 dias
  const tooLong = makeApprovalFixture({
    issuedAt: "2026-06-01T12:00:00.000Z",
    expiresAt: "2026-06-15T12:00:00.000Z",
  });
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: tooLong.recordJsonText,
        signatureBase64: tooLong.signatureBase64,
        trustedPublicKeyPem: tooLong.publicKeyPem,
        trustedPublicKeySha256: tooLong.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
        referenceTime: new Date("2026-06-02T12:00:00.000Z"),
      }),
    { code: "VALIDITY_WINDOW_TOO_LONG" }
  );

  // referenceTime invalido (null nao deve ser convertido em epoch 0)
  const validFx = makeApprovalFixture();
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: validFx.recordJsonText,
        signatureBase64: validFx.signatureBase64,
        trustedPublicKeyPem: validFx.publicKeyPem,
        trustedPublicKeySha256: validFx.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
        referenceTime: null,
      }),
    { code: "INVALID_REFERENCE_TIME" }
  );
});

test("E28-04. Registro com campos adicionais, ausentes ou chaves JSON duplicadas", () => {
  const validFx = makeApprovalFixture();

  // Campo adicional
  const extraJson = JSON.stringify({ ...validFx.record, extraField: "injetado" });
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: extraJson,
        signatureBase64: validFx.signatureBase64,
        trustedPublicKeyPem: validFx.publicKeyPem,
        trustedPublicKeySha256: validFx.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "UNEXPECTED_RECORD_KEY" }
  );

  // Cada uma das 12 chaves ausente individualmente
  for (const key of APPROVAL_RECORD_KEYS) {
    const missing = { ...validFx.record };
    delete missing[key];
    assert.throws(
      () =>
        verifySignedApprovalRecord({
          recordJsonText: JSON.stringify(missing),
          signatureBase64: validFx.signatureBase64,
          trustedPublicKeyPem: validFx.publicKeyPem,
          trustedPublicKeySha256: validFx.trustedPin,
          expectedServiceAccountEmail: FICTITIOUS_SA,
        }),
      { code: "MISSING_RECORD_KEY" }
    );
  }

  // Chave JSON duplicada na string bruta
  const dupRaw = validFx.recordJsonText.replace('"scope": "READ_ONLY",', '"scope": "ADMIN", "scope": "READ_ONLY",');
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: dupRaw,
        signatureBase64: validFx.signatureBase64,
        trustedPublicKeyPem: validFx.publicKeyPem,
        trustedPublicKeySha256: validFx.trustedPin,
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "DUPLICATE_RECORD_KEY" }
  );
});

test("E28-05. URL de impersonacao com hostname, porta, protocolo, caminho ou parametros indevidos", () => {
  const cases = [
    [
      "https://evil.example.invalid/v1/projects/-/serviceAccounts/" + FICTITIOUS_SA + ":generateAccessToken",
      "INVALID_IMPERSONATION_URL_HOST",
    ],
    [
      "https://iamcredentials.googleapis.com.evil.invalid/v1/projects/-/serviceAccounts/" + FICTITIOUS_SA + ":generateAccessToken",
      "INVALID_IMPERSONATION_URL_HOST",
    ],
    [
      "https://iamcredentials.googleapis.com:8443/v1/projects/-/serviceAccounts/" + FICTITIOUS_SA + ":generateAccessToken",
      "INVALID_IMPERSONATION_URL_PORT",
    ],
    [
      "https://iamcredentials.googleapis.com:443/v1/projects/-/serviceAccounts/" + FICTITIOUS_SA + ":generateAccessToken",
      "INVALID_IMPERSONATION_URL_PORT",
    ],
    [
      "http://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" + FICTITIOUS_SA + ":generateAccessToken",
      "INVALID_IMPERSONATION_URL_PROTOCOL",
    ],
    [
      "https://user:pass@iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" + FICTITIOUS_SA + ":generateAccessToken",
      "INVALID_IMPERSONATION_URL_AUTH",
    ],
    [
      "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" + FICTITIOUS_SA + ":signBlob",
      "INVALID_IMPERSONATION_URL_PATH",
    ],
    [
      "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/../serviceAccounts/" + FICTITIOUS_SA + ":generateAccessToken",
      "INVALID_IMPERSONATION_URL_PATH",
    ],
    [
      "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" + FICTITIOUS_SA + ":generateAccessToken?alt=json",
      "INVALID_IMPERSONATION_URL_PARAMS",
    ],
    [
      "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" + FICTITIOUS_SA + ":generateAccessToken#frag",
      "INVALID_IMPERSONATION_URL_PARAMS",
    ],
  ];

  for (const [badUrl, expectedCode] of cases) {
    const adc = makeValidImpersonatedAdc({ service_account_impersonation_url: badUrl });
    assert.throws(
      () =>
        validateImpersonatedAdcPayload(JSON.stringify(adc), {
          expectedServiceAccountEmail: FICTITIOUS_SA,
        }),
      { code: expectedCode },
      `Failed to reject URL: ${badUrl}`
    );
  }
});

test("E28-06. ADC com identidade de origem inesperada, chave privada estatica, delegates ou quota_project divergente", () => {
  // 1. Tipo raiz nao e impersonated_service_account
  assert.throws(
    () =>
      validateImpersonatedAdcPayload(JSON.stringify({ type: "authorized_user", client_id: "x", refresh_token: "y" }), {
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "UNEXPECTED_ADC_TYPE" }
  );

  // 2. source_credentials com chave privada estatica
  const withPrivateKey = makeValidImpersonatedAdc({
    source_credentials: {
      type: "service_account",
      private_key: "-----BEGIN PRIVATE KEY-----\nFICTITIOUS\n-----END PRIVATE KEY-----",
      private_key_id: "fictitious",
    },
  });
  assert.throws(
    () =>
      validateImpersonatedAdcPayload(JSON.stringify(withPrivateKey), {
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "STATIC_PRIVATE_KEY_SOURCE_FORBIDDEN" }
  );

  // 3. source_credentials de tipo inesperado (ex.: external_account)
  const externalSource = makeValidImpersonatedAdc({
    source_credentials: { type: "external_account", client_id: "x", refresh_token: "y" },
  });
  assert.throws(
    () =>
      validateImpersonatedAdcPayload(JSON.stringify(externalSource), {
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "UNEXPECTED_SOURCE_CREDENTIAL_TYPE" }
  );

  // 4. client_id de origem divergente do esperado
  const validAdc = makeValidImpersonatedAdc();
  assert.throws(
    () =>
      validateImpersonatedAdcPayload(JSON.stringify(validAdc), {
        expectedServiceAccountEmail: FICTITIOUS_SA,
        expectedSourceClientId: "outro-client-id-esperado.apps.googleusercontent.com",
      }),
    { code: "SOURCE_CLIENT_ID_MISMATCH" }
  );

  // 5. delegates nao vazio
  const withDelegates = makeValidImpersonatedAdc({
    delegates: ["projects/-/serviceAccounts/" + OTHER_FICTITIOUS_SA],
  });
  assert.throws(
    () =>
      validateImpersonatedAdcPayload(JSON.stringify(withDelegates), {
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "NON_EMPTY_DELEGATES_FORBIDDEN" }
  );

  // 6. quota_project_id divergente
  const wrongQuota = makeValidImpersonatedAdc({ quota_project_id: "outro-projeto-999" });
  assert.throws(
    () =>
      validateImpersonatedAdcPayload(JSON.stringify(wrongQuota), {
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "QUOTA_PROJECT_MISMATCH" }
  );
});

test("E28-07. Conta de servico com identificador divergente no registro, na URL ADC e no dominio do projeto", () => {
  const fx = makeApprovalFixture();

  // Divergente no verificador de aprovacao
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: fx.recordJsonText,
        signatureBase64: fx.signatureBase64,
        trustedPublicKeyPem: fx.publicKeyPem,
        trustedPublicKeySha256: fx.trustedPin,
        expectedServiceAccountEmail: OTHER_FICTITIOUS_SA,
      }),
    { code: "SERVICE_ACCOUNT_MISMATCH" }
  );

  // Divergente na URL de impersonacao do ADC
  const adcOtherSa = makeValidImpersonatedAdc({
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${OTHER_FICTITIOUS_SA}:generateAccessToken`,
  });
  assert.throws(
    () =>
      validateImpersonatedAdcPayload(JSON.stringify(adcOtherSa), {
        expectedServiceAccountEmail: FICTITIOUS_SA,
      }),
    { code: "IMPERSONATED_SA_MISMATCH" }
  );

  // SA de outro projeto GCP no registro assinado
  const wrongDomainFx = makeApprovalFixture({
    serviceAccountEmail: "audit-readonly@outro-projeto.iam.gserviceaccount.com",
  });
  assert.throws(
    () =>
      verifySignedApprovalRecord({
        recordJsonText: wrongDomainFx.recordJsonText,
        signatureBase64: wrongDomainFx.signatureBase64,
        trustedPublicKeyPem: wrongDomainFx.publicKeyPem,
        trustedPublicKeySha256: wrongDomainFx.trustedPin,
      }),
    { code: "INVALID_SERVICE_ACCOUNT_FORMAT" }
  );
});

test("E28-08. Resumo que omite resultados individuais (results ausente, truncado ou vazio para totalRead > 0)", () => {
  const reportMissingKey = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  delete reportMissingKey.results;
  assert.throws(() => validateAndExtractAuditSummary(reportMissingKey), { code: "MISSING_REQUIRED_KEY" });

  const reportTruncated = makeValidReport([
    makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL"),
    makeSyntheticResult(2, "INCONSISTENCIA_DE_DADOS"),
  ]);
  reportTruncated.results = [reportTruncated.results[0]];
  assert.throws(() => validateAndExtractAuditSummary(reportTruncated), { code: "RESULTS_LENGTH_MISMATCH" });

  const reportEmptyResults = makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]);
  reportEmptyResults.results = [];
  assert.throws(() => validateAndExtractAuditSummary(reportEmptyResults), { code: "RESULTS_LENGTH_MISMATCH" });
});

test("E28-09. Resumo com contagens manipuladas e incoerencia matematica de paginacao", () => {
  // Contagem manipulada mantendo soma igual a totalRead
  const manipulated = makeValidReport([
    makeSyntheticResult(1, "PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE"),
    makeSyntheticResult(2, "DOCUMENTO_COMPATIVEL"),
  ]);
  manipulated.counts.PERDA_DE_ACESSO_POR_INCOMPATIBILIDADE = 0;
  manipulated.counts.DOCUMENTO_COMPATIVEL = 2;
  manipulated.verdictCode = "A";
  manipulated.verdict = VERDICT_MAP.A;
  assert.throws(() => validateAndExtractAuditSummary(manipulated), { code: "RECOUNT_MISMATCH" });

  // totalRead maior que pagesFetched * pageSize
  const impossiblePagination = makeValidReport([
    makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL"),
    makeSyntheticResult(2, "DOCUMENTO_COMPATIVEL"),
  ]);
  impossiblePagination.pagination.pageSize = 1;
  impossiblePagination.pagination.pagesFetched = 1;
  assert.throws(() => validateAndExtractAuditSummary(impossiblePagination), { code: "PAGINATION_COUNT_EXCEEDS_CAPACITY" });

  // Colecao vazia com pagesFetched != 1
  const weirdEmpty = makeValidReport([]);
  weirdEmpty.pagination.pagesFetched = 3;
  assert.throws(() => validateAndExtractAuditSummary(weirdEmpty), { code: "INVALID_EMPTY_COLLECTION_PAGES" });
});

test("E28-10. Falha de escrita e permissoes inadequadas no arquivo final (0644 pre-existente, symlink, diretorio, pos-escrita)", () => {
  const validSummary = validateAndExtractAuditSummary(makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")]));
  const dir = mkdtempSync(join(tmpdir(), "localiza-e28-perms-"));

  try {
    // 1. Gravacao valida gera arquivo com permissao exatamente 0600
    const goodPath = join(dir, "summary-ok.json");
    const written = writeRestrictedSummaryFile(goodPath, validSummary);
    assert.equal(written.mode, 0o600);
    assert.equal(lstatSync(goodPath).mode & 0o777, 0o600);

    // 2. Arquivo pre-existente com permissao 0644 e rejeitado sem sobrescrever
    const loosePath = join(dir, "summary-loose.json");
    writeFileSync(loosePath, '{"sentinel":true}\n', { mode: 0o644 });
    chmodSync(loosePath, 0o644);
    assert.throws(() => writeRestrictedSummaryFile(loosePath, validSummary), {
      code: "INSECURE_EXISTING_OUTPUT_PERMISSIONS",
    });
    assert.equal(readFileSync(loosePath, "utf8"), '{"sentinel":true}\n');

    // 3. Destino symlink e rejeitado
    const linkPath = join(dir, "summary-link.json");
    symlinkSync(goodPath, linkPath);
    assert.throws(() => writeRestrictedSummaryFile(linkPath, validSummary), {
      code: "OUTPUT_PATH_IS_SYMLINK",
    });

    // 4. Destino diretorio e rejeitado
    const subDir = join(dir, "subdir");
    mkdirSync(subDir, { mode: 0o700 });
    assert.throws(() => writeRestrictedSummaryFile(subDir, validSummary), {
      code: "OUTPUT_PATH_IS_DIRECTORY",
    });

    // 5. Diretorio pai inexistente -> falha de escrita controlada (SUMMARY_WRITE_FAILED)
    const missingParentOut = join(dir, "nao-existe", "summary.json");
    assert.throws(() => writeRestrictedSummaryFile(missingParentOut, validSummary), {
      code: "SUMMARY_WRITE_FAILED",
    });

    // 6. Simula falha de permissao pos-escrita (ex.: filesystem ignorando chmod) -> remove arquivo e falha fechado
    const driftPath = join(dir, "summary-drift.json");
    assert.throws(
      () =>
        writeRestrictedSummaryFile(driftPath, validSummary, {
          existsSync,
          writeFileSync,
          chmodSync: () => {},
          unlinkSync,
          lstatSync: () => ({
            isSymbolicLink: () => false,
            isFile: () => true,
            isDirectory: () => false,
            mode: 0o100644,
          }),
        }),
      { code: "INSECURE_OUTPUT_FILE_PERMISSIONS" }
    );
    assert.equal(existsSync(driftPath), false);

    // 7. CLI falha com exit code != 0 quando destino tem permissao inadequada (0644)
    const rawPath = join(dir, "raw.json");
    const errPath = join(dir, "stderr.log");
    writeFileSync(rawPath, JSON.stringify(makeValidReport([makeSyntheticResult(1, "DOCUMENTO_COMPATIVEL")])), { mode: 0o600 });
    writeFileSync(errPath, "", { mode: 0o600 });
    const cliProc = spawnSync(process.execPath, [CANDIDATE_VALIDATOR_CLI], {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        AUDIT_RAW_QUARANTINE_FILE: rawPath,
        AUDIT_STDERR_QUARANTINE_FILE: errPath,
        AUDIT_SUMMARY_OUT_FILE: loosePath,
      },
    });
    assert.notEqual(cliProc.status, 0);
    assert.match(cliProc.stderr, /INSECURE_EXISTING_OUTPUT_PERMISSIONS/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("E28-11. Sonda probe-readonly-v4: bloqueio de env vars, (default), limit!=1, ordem fail-closed e verificacao estatica integral", async () => {
  // 1. Rejeicao explicita de (default) e limit != 1
  assert.throws(() => validateProbeTarget({ databaseId: FORBIDDEN_DEFAULT_DATABASE_ID }), {
    code: "DEFAULT_DATABASE_FORBIDDEN",
  });
  assert.throws(() => validateProbeTarget({ limit: 2 }), { code: "PROBE_LIMIT_INVALID" });
  assert.throws(() => validateProbeTarget({ collectionName: "items" }), { code: "PROBE_COLLECTION_MISMATCH" });

  // 2. Bloqueio de variaveis de ambiente perigosas e exigencia de NO_GCE_CHECK=true
  assert.throws(
    () => assertSafeProbeEnvironment({ GOOGLE_APPLICATION_CREDENTIALS: "/tmp/ficticio.json" }),
    { code: "METADATA_FALLBACK_NOT_DISABLED" }
  );
  for (const blockedVar of ["FIRESTORE_EMULATOR_HOST", "GOOGLE_CLOUD_PROJECT", "GCE_METADATA_HOST", "FIREBASE_CONFIG"]) {
    assert.equal(BLOCKED_ENV_VARS.includes(blockedVar), true);
    assert.throws(
      () =>
        assertSafeProbeEnvironment({
          NO_GCE_CHECK: "true",
          GOOGLE_APPLICATION_CREDENTIALS: "/tmp/ficticio.json",
          [blockedVar]: "valor-indevido",
        }),
      { code: "BLOCKED_ENV_VAR_PRESENT" }
    );
  }

  // 3. Fluxo sintetico completo da sonda com query injetada (zero Firebase real) e confirmacao de zero PII na saida
  const fx = makeApprovalFixture();
  const dir = mkdtempSync(join(tmpdir(), "localiza-e28-probe-"));
  try {
    const recPath = join(dir, "approval.json");
    const sigPath = join(dir, "approval.sig");
    const pubPath = join(dir, "trusted.pub.pem");
    const adcPath = join(dir, "adc-impersonated.json");
    writeFileSync(recPath, fx.recordJsonText, { mode: 0o600 });
    writeFileSync(sigPath, fx.signatureBase64, { mode: 0o600 });
    writeFileSync(pubPath, fx.publicKeyPem, { mode: 0o600 });
    writeFileSync(adcPath, JSON.stringify(makeValidImpersonatedAdc()), { mode: 0o600 });

    let queryInvoked = false;
    const probeResult = await runProbeReadOnlyV4({
      env: {
        NO_GCE_CHECK: "true",
        GOOGLE_APPLICATION_CREDENTIALS: adcPath,
        APPROVED_AUDIT_RECORD_FILE: recPath,
        APPROVED_AUDIT_SIGNATURE_FILE: sigPath,
        TRUSTED_ADMIN_PUBKEY_FILE: pubPath,
        TRUSTED_ADMIN_PUBKEY_SHA256: fx.trustedPin,
        EXPECTED_AUDIT_SA: FICTITIOUS_SA,
      },
      executeLiveQuery: async ({ target }) => {
        queryInvoked = true;
        assert.equal(target.databaseId, EXPECTED_DATABASE_ID);
        assert.equal(target.collectionName, "users");
        assert.equal(target.limit, 1);
        return { size: 1, empty: false };
      },
    });
    assert.equal(queryInvoked, true);
    assert.equal(probeResult.status, "PROBE_READONLY_OK");
    assert.equal(probeResult.documentsReturned, 1);
    assert.equal(probeResult.hasAtLeastOneDocument, true);
    assert.equal(probeResult.scopeNotice, "SINGLE_DOCUMENT_CONNECTIVITY_PROBE_ONLY_NOT_FULL_COLLECTION_AUDIT");

    // 4. Ordem fail-closed: se a assinatura falhar, executeLiveQuery NUNCA e chamado
    let calledOnBadSig = false;
    await assert.rejects(
      () =>
        runProbeReadOnlyV4({
          env: {
            NO_GCE_CHECK: "true",
            GOOGLE_APPLICATION_CREDENTIALS: adcPath,
            APPROVED_AUDIT_RECORD_FILE: recPath,
            APPROVED_AUDIT_SIGNATURE_FILE: sigPath,
            TRUSTED_ADMIN_PUBKEY_FILE: pubPath,
            TRUSTED_ADMIN_PUBKEY_SHA256: "0".repeat(64),
            EXPECTED_AUDIT_SA: FICTITIOUS_SA,
          },
          executeLiveQuery: async () => {
            calledOnBadSig = true;
            return { size: 0, empty: true };
          },
        }),
      { code: "UNTRUSTED_PUBLIC_KEY_FINGERPRINT" }
    );
    assert.equal(calledOnBadSig, false);

    // 5. CLI do verificador candidato exige EXPECTED_AUDIT_SA (fail-closed)
    const missingSaCli = spawnSync(process.execPath, [CANDIDATE_VERIFIER_CLI], {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        APPROVED_AUDIT_RECORD_FILE: recPath,
        APPROVED_AUDIT_SIGNATURE_FILE: sigPath,
        TRUSTED_ADMIN_PUBKEY_FILE: pubPath,
        TRUSTED_ADMIN_PUBKEY_SHA256: fx.trustedPin,
      },
    });
    assert.notEqual(missingSaCli.status, 0);
    assert.match(missingSaCli.stderr, /EXPECTED_AUDIT_SA_MISSING/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // 6. Auditoria estatica do arquivo da sonda: zero imports estaticos Firebase, zero escrita, presenca de finally + deleteApp
  const probeSource = readFileSync(CANDIDATE_PROBE_PATH, "utf8");
  assert.equal(/^\s*import\s+.*firebase-admin/m.test(probeSource), false);
  for (const forbidden of [".set(", ".add(", ".update(", ".delete(", ".create(", ".batch(", ".runTransaction(", "bulkWriter"]) {
    assert.equal(probeSource.includes(forbidden), false, `Forbidden write method found: ${forbidden}`);
  }
  assert.equal(probeSource.includes("finally {"), true);
  assert.equal(probeSource.includes("deleteAppFn(firebaseApp)"), true);
  assert.equal(probeSource.includes(".limit(target.limit).get()"), true);

  // 7. Execucao direta da sonda SEM --execute-probe-readonly retorna DRY_INFO sem conectar ao Firebase
  const dryCli = spawnSync(process.execPath, [CANDIDATE_PROBE_PATH], {
    encoding: "utf8",
    env: { PATH: process.env.PATH },
  });
  assert.equal(dryCli.status, 0);
  const dryJson = JSON.parse(dryCli.stdout);
  assert.equal(dryJson.status, "DRY_INFO_NO_FIREBASE_CONNECTION");
});
```

## 11. Verificação Final dos Critérios de Aprovação da Etapa 28

1. **Oito arquivos identificados e hashes registrados:** ATENDIDO (Seção 1.1).
2. **Artefatos protegidos da Etapa 21 idênticos:** ATENDIDO (hashes verificados diretamente em disco, zero alterações).
3. **Três arquivos da Etapa 27 entregues integralmente:** ATENDIDO (Seção 9, sem truncamento).
4. **Sonda completa e aprovada na revisão estática:** ATENDIDO (Seções 4 e 10.3, incluindo `try/catch/finally`, `deleteApp` e `process.stdout.write(...)` completos).
5. **Validador completo e aprovado nos testes:** ATENDIDO (Seções 5, 6, 9.2 e 10.2).
6. **Testes sintéticos efetivamente executados:** ATENDIDO (51/51 aprovados em `env -i`, saída real registrada na Seção 6).
7. **Pendências de identidade, confiança da chave e IAM documentadas sem alegações não comprovadas:** ATENDIDO (Seções 2.2, 3 e 7).
8. **Relatório final completo, sem truncamento (Markdown + PDF com conferência visual da última página):** ATENDIDO.

---

=== FIM INTEGRAL DO RELATORIO TECNICO — LOCALIZA+ v1.10.13 — ETAPA 28 (SEM TRUNCAMENTO) ===
STATUS: HOMOLOGACAO DOCUMENTAL E ESTATICA CONCLUIDA | EXECUCAO REAL NO FIREBASE/IAM: NAO AUTORIZADA
