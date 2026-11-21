# LOCALIZA+ v1.10.13 — Etapa 33 (Seção 13): Runbook de Prontidão, Permissões IAM e Publicação Segura das Firestore Security Rules

> **AVISO OPERACIONAL:** Durante a Etapa 33 **nenhuma regra foi publicada em produção** e o arquivo raiz `firestore.rules` foi mantido intacto. Este documento consolida a preparação técnica completa para publicação controlada mediante autorização expressa do operador.

---

## 1. Identificação do Alvo de Publicação

| Parâmetro | Valor Oficial Verificado |
|---|---|
| **Projeto Firebase / GCP** | `gen-lang-client-0490390966` |
| **Banco Firestore Alvo (Nomeado)** | `ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1` |
| **Atenção Crítica** | **NÃO publicar no banco `(default)`**; a aplicação opera exclusivamente no banco nomeado acima (`firebase-applet-config.json` e `firebase.json`). |
| **Arquivo Candidato Reconstruído** | `scripts/audit/candidates/etapa33-reconstrucao/firestore.rules` |
| **SHA-256 do Candidato** | `45677cbd475e3f7d3cd451640d9aceec26795484c813606fda73ec4d11da330b` |
| **SHA-256 do `firestore.rules` Raiz Atual** | `2f2a2ffc8c471d7fe97b5d1d2bb3c2a3ca27d39947be64449ad13a532c851f9e` |
| **Configuração de Publicação Isolada** | `scripts/audit/candidates/etapa33-reconstrucao/firebase.publish.json` |
| **Mapeamento de Projeto (Candidato)** | `scripts/audit/candidates/etapa33-reconstrucao/firebaserc.candidate.json` |

---

## 2. Diagnóstico Real da Capacidade de Publicação neste Ambiente (Google AI Studio)

Verificação direta executada sem qualquer tentativa de deploy experimental:

1. **Firebase CLI instalado:** `/usr/local/bin/firebase` — versão **`15.34.1`** (suporta configuração multi-database `"firestore": { "database": "<db-id>", "rules": "..." }`).
2. **Autenticação Firebase CLI (`firebase login:list`):** **Nenhuma conta autenticada** (`No authorized accounts`).
3. **Google Cloud CLI (`gcloud`):** **Não instalado** neste contêiner.
4. **Credencial de Metadados do Contêiner (ADC Sandbox):**
   - Service Account ativa do sandbox: `ais-sandbox@ais-us-west2-911149a297404bbcb.iam.gserviceaccount.com` (projeto isolado do sandbox `ais-us-west2-911149a297404bbcb` / número `531286486641`).
   - Teste read-only anterior contra `gen-lang-client-0490390966` (`firestore.googleapis.com` e `firebaserules.googleapis.com`): **`HTTP 403 PERMISSION_DENIED`**.
5. **Arquivo `.firebaserc` na raiz:** Ausente (fornecido candidato isolado em `scripts/audit/candidates/etapa33-reconstrucao/firebaserc.candidate.json`).
6. **Validação Local Real (Sem Publicação):**
   - `firebase emulators:exec --only firestore --config scripts/audit/candidates/etapa33-reconstrucao/firebase.publish.json --project gen-lang-client-0490390966 ...` compilou a sintaxe da nova regra e executou **165/165 testes reais no Cloud Firestore Emulator** com OpenJDK 21 (`0` falhas, `0` ignorados).

**Conclusão de Capacidade:** Este ambiente consegue **compilar, validar e homologar integralmente as regras no Emulator**, mas **não possui permissão IAM/autenticação no projeto `gen-lang-client-0490390966`** para publicar regras em produção. A publicação exige execução em máquina autenticada do operador ou concessão explícita de permissões IAM (abaixo).

---

## 3. Permissões IAM Necessárias para Publicar Firestore Rules com Segurança

> **REGRA DE SEGURANÇA:** Nunca enviar tokens, senhas ou JSON de Service Account no chat.

### 3.1 Princípio do Menor Privilégio (Recomendado)

Para ler o release atual, criar novo ruleset e atualizar o release do banco nomeado `ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1`, o principal autorizado (conta Google do operador via `firebase login` ou Service Account dedicada de CI/CD) precisa de:

- **Papel recomendado (menor privilégio para Rules):**
  - `roles/firebaserules.admin` (**Firebase Rules Admin**) — concede `firebaserules.rulesets.*` e `firebaserules.releases.*`;
  - `roles/serviceusage.serviceUsageConsumer` (**Service Usage Consumer**) — permite chamadas às APIs no projeto;
  - `roles/datastore.viewer` (**Cloud Datastore Viewer**) — permite inspecionar metadados do banco nomeado no CLI.
- **Alternativa administrativa ampla (para operadores donos do projeto):**
  - `roles/firebase.admin` ou `roles/editor` / `roles/owner`.

### 3.2 Como Conceder no Google Cloud Console (Passo a Passo)

1. Acesse o **Google Cloud Console** -> selecione o projeto **`gen-lang-client-0490390966`**.
2. Navegue até **IAM e administrador -> IAM** (`https://console.cloud.google.com/iam-admin/iam?project=gen-lang-client-0490390966`).
3. Clique em **Conceder acesso** (ou edite o principal do operador/CI).
4. Informe o e-mail do operador ou da conta de serviço dedicada de deploy (NÃO conceder permissões amplas a contas não confiáveis).
5. Atribua os papéis:
   - `Firebase Rules Admin` (`roles/firebaserules.admin`)
   - `Service Usage Consumer` (`roles/serviceusage.serviceUsageConsumer`)
   - `Cloud Datastore Viewer` (`roles/datastore.viewer`)
6. Salve. A propagação IAM ocorre em ~60 segundos.

---

## 4. Configuração de Banco Nomeado (`firebase.json` e `.firebaserc`)

O arquivo `firebase.json` na raiz já referencia o banco nomeado:

```json
{
  "firestore": {
    "database": "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1",
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

O arquivo isolado `scripts/audit/candidates/etapa33-reconstrucao/firebase.publish.json` espelha essa configuração apontando diretamente para o candidato reconstruído (ideal para validação prévia sem sobrescrever a raiz):

```json
{
  "firestore": {
    "database": "ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1",
    "rules": "scripts/audit/candidates/etapa33-reconstrucao/firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

---

## 5. Checklist Obrigatório Pré-Publicação (Executar Antes do Deploy)

Execute em terminal autenticado (`firebase login`):

```bash
# 1. Confirmar projeto e identidade autenticada
firebase login:list
firebase projects:list | grep gen-lang-client-0490390966

# 2. Confirmar SHA-256 do candidato homologado na Etapa 33
sha256sum scripts/audit/candidates/etapa33-reconstrucao/firestore.rules
# Esperado: 45677cbd475e3f7d3cd451640d9aceec26795484c813606fda73ec4d11da330b

# 3. Backup somente leitura do ruleset ATUALMENTE publicado no banco nomeado (para rollback imediato)
ACCESS_TOKEN="$(gcloud auth print-access-token)"
curl -sS -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  "https://firebaserules.googleapis.com/v1/projects/gen-lang-client-0490390966/releases/cloud.firestore%2Fai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1" \
  | tee backup-release-pre-etapa33.json

# 4. Revalidar localmente a compilação e os 165 testes reais no Cloud Firestore Emulator
FIRESTORE_RULES_PATH="scripts/audit/candidates/etapa33-reconstrucao/firestore.rules" \
ETAPA33_RULES_PATH="scripts/audit/candidates/etapa33-reconstrucao/firestore.rules" \
firebase emulators:exec --only firestore \
  --config scripts/audit/candidates/etapa33-reconstrucao/firebase.publish.json \
  --project gen-lang-client-0490390966 \
  "npx vitest run src/lib/etapa33RulesReconstruction.emulator.test.ts src/lib/firestoreRules.emulator.test.ts src/__tests__/claimsRulesHomologation.test.ts"
```

---

## 6. Comando Exato de Promoção e Publicação Controlada (Apenas Após Autorização)

### Opção A — Promoção Canônica para `firestore.rules` na Raiz + Publicação (Recomendada)

```bash
# 1. Promover o arquivo homologado para a raiz e registrar .firebaserc
cp scripts/audit/candidates/etapa33-reconstrucao/firestore.rules firestore.rules
cp scripts/audit/candidates/etapa33-reconstrucao/firebaserc.candidate.json .firebaserc

# 2. Publicar EXCLUSIVAMENTE firestore:rules no banco nomeado do projeto oficial
firebase deploy \
  --only firestore:rules \
  --project gen-lang-client-0490390966
```

### Opção B — Publicação Direta via `firebase.publish.json` (Sem alterar a raiz previamente)

```bash
firebase deploy \
  --only firestore:rules \
  --config scripts/audit/candidates/etapa33-reconstrucao/firebase.publish.json \
  --project gen-lang-client-0490390966
```

---

## 7. Validação Pós-Publicação

1. Confirmar na saída do CLI:
   - `cloud.firestore: rules file ... compiled successfully`
   - `firestore: released rules ... to cloud.firestore/ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1`
2. Validar via Firebase Console -> Firestore Database -> selecionar **`ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1`** -> aba **Regras** (confirmar cabeçalho `ETAPA 33` e hora de publicação).
3. Testar no ambiente publicado (sem apagar dados reais):
   - Cadastro de objeto pelo Root Admin (`paulocauan39@gmail.com`) -> confirmar `writeBatch.commit()` sem `permission-denied` e presença imediata no catálogo;
   - Sincronização de pendência da fila offline;
   - Abertura do catálogo sem login (verificar ausência de campos privados/devolução).

---

## 8. Procedimento de Rollback Seguro (Imediato)

Se qualquer anomalia operacional ocorrer após a publicação:

### Via Firebase Console (Mais Rápido — ~15 segundos)
1. Abrir **Firebase Console -> Firestore Database -> `ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1` -> Regras**.
2. No painel lateral esquerdo (histórico de versões publicadas), selecionar a versão imediatamente anterior registrada em `backup-release-pre-etapa33.json`.
3. Clicar em **Restaurar / Publicar**.

### Via CLI / Repositório
```bash
# Restaurar firestore.rules anterior (SHA-256 2f2a2ffc8c471d7fe97b5d1d2bb3c2a3ca27d39947be64449ad13a532c851f9e)
git checkout HEAD -- firestore.rules
firebase deploy --only firestore:rules --project gen-lang-client-0490390966
```
