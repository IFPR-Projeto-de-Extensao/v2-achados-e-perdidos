#!/usr/bin/env bash
# =============================================================================
# LOCALIZA+ v1.10.13 — Etapa 34: Backup Real, Verificação e Rollback de Rules
# =============================================================================
# Projeto Alvo : gen-lang-client-0490390966
# Banco Alvo   : ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1
# Release Alvo : cloud.firestore/ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1
#
# IMPORTANTE:
#   - NÃO utiliza "git checkout HEAD" para rollback, pois o ruleset efetivamente
#     publicado em produção pode divergir do repositório Git.
#   - Opera EXCLUSIVAMENTE na release do banco nomeado acima (jamais toca "(default)").
#   - Exige token OAuth válido via ACCESS_TOKEN (ou gcloud auth print-access-token)
#     em máquina autenticada do operador. Nunca salve tokens em disco/Git.
#
# Modos de uso:
#   ./backup-and-rollback.sh backup [DIRETORIO_BACKUP]
#   ./backup-and-rollback.sh verify-deploy <SHA256_ESPERADO> [DIRETORIO_BACKUP]
#   ./backup-and-rollback.sh rollback <DIRETORIO_BACKUP>
# =============================================================================
set -euo pipefail

PROJECT_ID="gen-lang-client-0490390966"
DATABASE_ID="ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1"
RELEASE_NAME="cloud.firestore/${DATABASE_ID}"
DEFAULT_RELEASE_NAME="cloud.firestore"
API_BASE="https://firebaserules.googleapis.com/v1"
EXPECTED_ETAPA33_SHA256="45677cbd475e3f7d3cd451640d9aceec26795484c813606fda73ec4d11da330b"

MODE="${1:-}"
if [ -z "${MODE}" ]; then
  echo "Uso: $0 {backup|verify-deploy|rollback} [argumentos]" >&2
  exit 1
fi

get_token() {
  if [ -n "${ACCESS_TOKEN:-}" ]; then
    printf '%s' "${ACCESS_TOKEN}"
    return
  fi
  if command -v gcloud >/dev/null 2>&1; then
    gcloud auth print-access-token
    return
  fi
  echo "ERRO: Defina ACCESS_TOKEN no ambiente ou autentique-se com 'gcloud auth login'." >&2
  exit 1
}

fetch_release_json() {
  local token="$1"
  local rel="$2"
  curl -fsS -H "Authorization: Bearer ${token}" \
    "${API_BASE}/projects/${PROJECT_ID}/releases/${rel}"
}

fetch_ruleset_json() {
  local token="$1"
  local ruleset_name="$2"
  curl -fsS -H "Authorization: Bearer ${token}" \
    "${API_BASE}/${ruleset_name}"
}

case "${MODE}" in
  backup)
    OUT_DIR="${2:-./backups/firestore-rules-pre-etapa34-$(date -u +%Y%m%dT%H%M%SZ)}"
    mkdir -p "${OUT_DIR}"
    TOKEN="$(get_token)"

    echo "[1/5] Consultando release ativa do banco nomeado (${RELEASE_NAME})..."
    fetch_release_json "${TOKEN}" "${RELEASE_NAME}" > "${OUT_DIR}/release-named-original.json"

    echo "[2/5] Consultando release '(default)' apenas para registro de não-interferência..."
    if ! fetch_release_json "${TOKEN}" "${DEFAULT_RELEASE_NAME}" > "${OUT_DIR}/release-default-pre.json" 2>/dev/null; then
      echo '{"note":"release cloud.firestore (default) inexistente ou inacessivel"}' > "${OUT_DIR}/release-default-pre.json"
    fi

    RULESET_NAME="$(node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); if(!r.rulesetName) process.exit(1); console.log(r.rulesetName);' "${OUT_DIR}/release-named-original.json")"
    echo "[3/5] Baixando conteúdo completo do ruleset publicado (${RULESET_NAME})..."
    fetch_ruleset_json "${TOKEN}" "${RULESET_NAME}" > "${OUT_DIR}/ruleset-original.json"

    echo "[4/5] Extraindo texto original das regras e calculando SHA-256..."
    node -e '
      const fs = require("fs");
      const crypto = require("crypto");
      const rs = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const file = rs?.source?.files?.[0];
      if (!file || typeof file.content !== "string" || file.content.length === 0) {
        console.error("ERRO: ruleset retornado sem conteúdo válido.");
        process.exit(1);
      }
      fs.writeFileSync(process.argv[2], file.content, "utf8");
      const sha = crypto.createHash("sha256").update(Buffer.from(file.content, "utf8")).digest("hex");
      const rel = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
      const manifest = {
        capturedAtUtc: new Date().toISOString(),
        projectId: process.argv[4],
        databaseId: process.argv[5],
        releaseName: rel.name,
        originalRulesetName: rel.rulesetName,
        releaseUpdateTime: rel.updateTime || null,
        originalSourceFileName: file.name || null,
        backupFile: "live-rules-backup.rules",
        backupBytes: Buffer.byteLength(file.content, "utf8"),
        backupSha256: sha,
      };
      fs.writeFileSync(process.argv[6], JSON.stringify(manifest, null, 2) + "\n", "utf8");
      console.log(JSON.stringify(manifest, null, 2));
    ' "${OUT_DIR}/ruleset-original.json" "${OUT_DIR}/live-rules-backup.rules" "${OUT_DIR}/release-named-original.json" "${PROJECT_ID}" "${DATABASE_ID}" "${OUT_DIR}/backup-manifest.json"

    echo "[5/5] Backup concluído com sucesso em: ${OUT_DIR}"
    ;;

  verify-deploy)
    EXPECTED_SHA="${2:-${EXPECTED_ETAPA33_SHA256}}"
    PRE_DIR="${3:-}"
    TOKEN="$(get_token)"

    TMP_REL="$(mktemp)"
    TMP_RS="$(mktemp)"
    trap 'rm -f "${TMP_REL}" "${TMP_RS}"' EXIT

    fetch_release_json "${TOKEN}" "${RELEASE_NAME}" > "${TMP_REL}"
    ACTIVE_RULESET="$(node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); console.log(r.rulesetName||"");' "${TMP_REL}")"
    fetch_ruleset_json "${TOKEN}" "${ACTIVE_RULESET}" > "${TMP_RS}"

    ACTIVE_SHA="$(node -e '
      const fs = require("fs");
      const crypto = require("crypto");
      const rs = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const content = rs?.source?.files?.[0]?.content || "";
      console.log(crypto.createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex"));
    ' "${TMP_RS}")"

    echo "Projeto        : ${PROJECT_ID}"
    echo "Banco Nomeado  : ${DATABASE_ID}"
    echo "Release Ativa  : ${RELEASE_NAME}"
    echo "Ruleset Ativo  : ${ACTIVE_RULESET}"
    echo "SHA-256 Ativo  : ${ACTIVE_SHA}"
    echo "SHA-256 Alvo   : ${EXPECTED_SHA}"

    if [ "${ACTIVE_SHA}" != "${EXPECTED_SHA}" ]; then
      echo "FALHA: SHA-256 da release ativa NÃO corresponde ao esperado!" >&2
      exit 2
    fi

    if [ -n "${PRE_DIR}" ] && [ -f "${PRE_DIR}/release-default-pre.json" ]; then
      TMP_DEF="$(mktemp)"
      if fetch_release_json "${TOKEN}" "${DEFAULT_RELEASE_NAME}" > "${TMP_DEF}" 2>/dev/null; then
        PRE_DEF_RS="$(node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); console.log(r.rulesetName||"");' "${PRE_DIR}/release-default-pre.json")"
        NOW_DEF_RS="$(node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); console.log(r.rulesetName||"");' "${TMP_DEF}")"
        rm -f "${TMP_DEF}"
        if [ "${PRE_DEF_RS}" != "${NOW_DEF_RS}" ]; then
          echo "ALERTA: release (default) foi alterada de ${PRE_DEF_RS} para ${NOW_DEF_RS}!" >&2
          exit 3
        fi
        echo "Verificação (default): INALTERADA (${NOW_DEF_RS:-inexistente})."
      else
        rm -f "${TMP_DEF}"
        echo "Verificação (default): inexistente/inalterada."
      fi
    fi

    echo "OK: Release do banco nomeado validada com SHA-256 idêntico ao esperado."
    ;;

  rollback)
    BACKUP_DIR="${2:-}"
    if [ -z "${BACKUP_DIR}" ] || [ ! -f "${BACKUP_DIR}/backup-manifest.json" ]; then
      echo "ERRO: Informe o diretório contendo backup-manifest.json gerado no modo 'backup'." >&2
      exit 1
    fi
    TOKEN="$(get_token)"

    ORIG_RULESET="$(node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); console.log(m.originalRulesetName);' "${BACKUP_DIR}/backup-manifest.json")"
    ORIG_SHA="$(node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); console.log(m.backupSha256);' "${BACKUP_DIR}/backup-manifest.json")"

    echo "[1/3] Restaurando release ${RELEASE_NAME} para o ruleset original ${ORIG_RULESET}..."
    PAYLOAD="{\"release\":{\"name\":\"projects/${PROJECT_ID}/releases/${RELEASE_NAME}\",\"rulesetName\":\"${ORIG_RULESET}\"}}"
    curl -fsS -X PATCH \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d "${PAYLOAD}" \
      "${API_BASE}/projects/${PROJECT_ID}/releases/${RELEASE_NAME}" > "${BACKUP_DIR}/rollback-response.json"

    echo "[2/3] Confirmando que o banco nomeado voltou exatamente ao SHA-256 original (${ORIG_SHA})..."
    "$0" verify-deploy "${ORIG_SHA}" "${BACKUP_DIR}"

    echo "[3/3] Rollback concluído e comprovado na release ${RELEASE_NAME}."
    ;;

  *)
    echo "Modo inválido: ${MODE}. Use: backup | verify-deploy | rollback" >&2
    exit 1
    ;;
esac
