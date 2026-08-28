#!/usr/bin/env bash
# ==============================================================================
# Script de Teste e Diagnóstico do Endpoint de Feedback em Produção (Vercel)
# URL: https://ifprivp.vercel.app/api/support/send-feedback
# ==============================================================================

TARGET_URL="${1:-https://ifprivp.vercel.app}"
echo "===================================================================="
echo "🔍 Iniciando Testes de Diagnóstico em: ${TARGET_URL}"
echo "===================================================================="

# 1. Teste de Diagnóstico de Variáveis de Ambiente (/api/debug/env)
echo -e "\n[1/3] 📡 Testando endpoint de diagnóstico de ambiente: ${TARGET_URL}/api/debug/env"
curl -s -i -X GET "${TARGET_URL}/api/debug/env" \
  -H "Accept: application/json"
echo ""

# 2. Teste de Envio de Feedback Válido (/api/support/send-feedback)
echo -e "\n[2/3] 📨 Enviando requisição POST de Feedback com payload válido:"
curl -s -i -X POST "${TARGET_URL}/api/support/send-feedback" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Teste de Diagnóstico Automatizado",
    "email": "diagnostico@ifpr.edu.br",
    "category": "FEEDBACK",
    "subject": "Diagnóstico de Produção",
    "message": "Teste automatizado para verificar recebimento pela API e entrega ao Discord.",
    "priority": "MEDIA",
    "clientDiagnostics": {
      "screen": "1920x1080",
      "currentPath": "/ajuda",
      "online": true
    }
  }'
echo ""

# 3. Teste de Validação com Payload Vazio (Deve retornar HTTP 400)
echo -e "\n[3/3] ⚠️ Testando validação de campos obrigatórios (Payload vazio):"
curl -s -i -X POST "${TARGET_URL}/api/support/send-feedback" \
  -H "Content-Type: application/json" \
  -d '{}'
echo ""

echo "===================================================================="
echo "🏁 Testes concluídos."
echo "===================================================================="
