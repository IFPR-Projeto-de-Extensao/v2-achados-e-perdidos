# Diff Técnico Isolado — Candidato `firestore.rules.candidate` (Complementação Funcional da Etapa 30)

| Campo | Valor |
| :--- | :--- |
| **Sistema / Versão** | LOCALIZA+ v1.10.13 |
| **Artefato Original (PRESERVADO INTACTO)** | `firestore.rules` |
| **SHA-256 Original (`firestore.rules`)** | `2f2a2ffc8c471d7fe97b5d1d2bb3c2a3ca27d39947be64449ad13a532c851f9e` (57.716 bytes / 1.275 linhas) |
| **Artefato Candidato (ISOLADO)** | `scripts/audit/candidates/etapa30-complementacao/firestore.rules.candidate` |
| **SHA-256 Candidato (Pós-Etapa 31)** | `a9865fd7ea6df59c1bf067914b0c69d01394b7596ce1c034be875585748879e7` (57.994 bytes / 1.276 linhas) |
| **Banco Firestore Alvo (Documental)** | `ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1` (Projeto `gen-lang-client-0490390966`) |
| **Promoção / Publicação** | **NÃO PROMOVIDO / NÃO PUBLICADO NESTA ETAPA** |

> **Preservação Integral:** O arquivo raiz `firestore.rules` permaneceu 100% inalterado byte a byte (`2f2a2ffc8c471d7fe97b5d1d2bb3c2a3ca27d39947be64449ad13a532c851f9e`). Todas as melhorias permanecem isoladas exclusivamente em `scripts/audit/candidates/etapa30-complementacao/firestore.rules.candidate`.

---

## 1. Resumo das Alterações e Resultado da Validação Real no Firestore Emulator (Etapa 31)

| ID | Localização no `firestore.rules` | Status (Etapa 31) | Diagnóstico e Justificativa Empírica | Impacto de Segurança |
| :---: | :--- | :---: | :--- | :--- |
| **R-01** | `isStandingActive(u)` (linhas 52–60) | **REVERTIDA NO CANDIDATO** | A execução real no Cloud Firestore Emulator (Java 21) comprovou que `&& u.blockExpiresAt != null` / `&& u.suspendedUntil != null` **reprovou o cenário SEC-07 `C-50`** (`status: 'suspended'`, `suspendedUntil` expirado, `blockExpiresAt: null` → liberado indevidamente em vez de `403`) e quebrou a paridade fail-closed da Etapa 10 com `accountStatusUtils.ts`, `server.ts`, `api/_lib/firebaseAdmin.ts` e `buildUserStatusTransitionData` (que usa `deleteField()`, nunca `null`). Revertida para a semântica fail-closed original. | **Preserva bloqueio real e paridade full-stack:** zero regressão em SEC-07 (`C-48`, `C-50`) e zero divergência entre Rules, frontend e backend. |
| **R-02** | `match /audit_logs/{logId}` (linhas 1047–1048) e `match /activity_logs/{logId}` (linha 1079) | **MANTIDA** | Comparação case-insensitive segura `(incoming().actorEmail is string && incoming().actorEmail.lower() == request.auth.token.email.lower())` (e equivalente para `adminEmail`) evita `permission-denied` pós-cadastro quando o JWT Google traz maiúsculas e o frontend normaliza em minúsculas. | **Zero relaxamento:** exige o mesmo endereço de e-mail autenticado em `request.auth.token.email` e impede spoofing não-string. |
| **R-03** | `match /item_private/{itemId}` `allow create` (linhas 704–706) | **MANTIDA** | Cláusula `(!('registeredByUserId' in incoming()) || incoming().registeredByUserId == request.auth.uid)` impede que staff autenticado grave `registeredByUserId` de terceiro na criação de `/item_private`. | **Endurecimento de segurança:** alinha `/item_private` ao anti-spoofing de autoria de `/items`. |

---

## 2. Diff Unificado Completo (`diff -u`) — Pós-Etapa 31

```diff
--- firestore.rules
+++ scripts/audit/candidates/etapa30-complementacao/firestore.rules.candidate
@@ -702,7 +702,8 @@
       allow list: if isStaffOrAdminActive();
       // Create / Update: Active verified approved SERVIDOR or ADMIN.
       allow create: if isStaffOrAdminActive() &&
-                       (!('itemId' in incoming()) || incoming().itemId == itemId);
+                       (!('itemId' in incoming()) || incoming().itemId == itemId) &&
+                       (!('registeredByUserId' in incoming()) || incoming().registeredByUserId == request.auth.uid);
       allow update: if isStaffOrAdminActive() &&
                        (!('registeredByUserId' in existing()) || incoming().registeredByUserId == existing().registeredByUserId) &&
                        (!('itemId' in incoming()) || incoming().itemId == itemId);
@@ -1044,8 +1045,8 @@
         (
           (!('actorId' in incoming()) || incoming().actorId == request.auth.uid) &&
           (!('adminId' in incoming()) || incoming().adminId == request.auth.uid) &&
-          (!('actorEmail' in incoming()) || request.auth.token.email == null || incoming().actorEmail == request.auth.token.email) &&
-          (!('adminEmail' in incoming()) || request.auth.token.email == null || incoming().adminEmail == request.auth.token.email) &&
+          (!('actorEmail' in incoming()) || request.auth.token.email == null || (incoming().actorEmail is string && incoming().actorEmail.lower() == request.auth.token.email.lower())) &&
+          (!('adminEmail' in incoming()) || request.auth.token.email == null || (incoming().adminEmail is string && incoming().adminEmail.lower() == request.auth.token.email.lower())) &&
           (
             (isAdmin() && (!('actorRole' in incoming()) || incoming().actorRole in ['ADMIN', 'SERVIDOR'])) ||
             (isServidor() && isAccountActive() && (!('actorRole' in incoming()) || incoming().actorRole == 'SERVIDOR')) ||
@@ -1076,7 +1077,7 @@
       allow create: if isSignedIn() && (isAccountActive() || isAdmin()) &&
         isAllowedClientAuditAction(incoming()) &&
         incoming().actorId == request.auth.uid &&
-        (request.auth.token.email == null || incoming().actorEmail == request.auth.token.email) &&
+        (request.auth.token.email == null || (incoming().actorEmail is string && incoming().actorEmail.lower() == request.auth.token.email.lower())) &&
         (
           (isAdmin() && incoming().actorRole in ['ADMIN', 'SERVIDOR']) ||
           (isServidor() && isAccountActive() && incoming().actorRole == 'SERVIDOR') ||
```

---

## 3. Análise de Impacto CEL e Homologação Real no Emulator (Etapa 31)

1. **Orçamento CEL e leituras `get()`:** inalterados em relação a `firestore.rules` (nenhum `get()`/`exists()` adicional; `R-02` e `R-03` adicionam apenas comparações locais escalares).
2. **Validação real no Cloud Firestore Emulator (Java 21):** tanto `firestore.rules` quanto a candidata corrigida (`a9865fd7...`) passam integralmente nas suítes `src/lib/firestoreRules.emulator.test.ts` (65/65) e `src/__tests__/claimsRulesHomologation.test.ts` (90/90), totalizando **155/155 testes aprovados (0 falhas, 0 ignorados)**.
3. **Pendência Externa Restante:** conferir em leitura direta (com credenciais Firebase/GCP autorizadas) as regras efetivamente publicadas no banco nomeado `ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1` do projeto `gen-lang-client-0490390966` antes de qualquer decisão futura de promoção ou publicação.

