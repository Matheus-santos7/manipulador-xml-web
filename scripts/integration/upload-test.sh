#!/usr/bin/env bash
# Pequeno teste de integração para /api/process
# Requisitos: servidor Next rodando em http://localhost:3000 e um profileId válido no DB.
# Uso:
# PROFILE_ID=<id_do_perfil> npm run test:upload
# ou direto:
# PROFILE_ID=<id_do_perfil> ./scripts/integration/upload-test.sh

set -euo pipefail

SERVER_URL=${SERVER_URL:-http://localhost:3000}
PROFILE_ID=${PROFILE_ID:-}
FIXTURE=src/test/fixtures/sample.xml
OUT=/tmp/xml_processados_test.zip
HDRS=/tmp/xml_processados_test.headers

if [ -z "$PROFILE_ID" ]; then
  echo "Por favor exporte PROFILE_ID com o id do perfil a usar."
  echo "Ex: PROFILE_ID=some-id $0"
  exit 1
fi

if [ ! -f "$FIXTURE" ]; then
  echo "Fixture não encontrada: $FIXTURE"
  exit 1
fi

echo "Enviando $FIXTURE para $SERVER_URL/api/process com profileId=$PROFILE_ID"

HTTP_CODE=$(curl -s -w "%{http_code}" -o "$OUT" -D "$HDRS" -X POST "$SERVER_URL/api/process" \
  -F "profileId=$PROFILE_ID" \
  -F "files=@$FIXTURE;type=text/xml")

if [ "$HTTP_CODE" != "200" ]; then
  echo "Request falhou com código $HTTP_CODE"
  echo "--- Headers ---"
  cat "$HDRS"
  echo "--- Body (salvo em $OUT) ---"
  hexdump -C "$OUT" | sed -n '1,40p'
  exit 1
fi

# Verifica se o ficheiro é um zip (by magic bytes) e testa unzip
if file --mime-type "$OUT" | grep -q "application/zip"; then
  echo "Resposta é application/zip"
else
  echo "Resposta não parece ser um zip:" $(file --mime-type "$OUT")
  exit 1
fi

if unzip -t "$OUT" >/dev/null 2>&1; then
  echo "Zip verificado com sucesso. Teste de integração PASS"
  exit 0
else
  echo "Zip inválido"
  exit 1
fi
