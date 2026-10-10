#!/usr/bin/env bash
# Roda os 7 casos de teste do README contra o serviço já no ar (just serve) e diz OK/FALHOU.
# O caso 6 tem duas verificações (401 e 403), como no README.
# Uso: bash testes/casos.sh [url-base]   (padrão http://127.0.0.1:3001)

BASE="${1:-http://127.0.0.1:3001}/api"
falhas=0

# caso <nome> <status esperado> <checagem python sobre o JSON `d`> <args do curl...>
# Com TEMPO_MAX=<segundos> antes da chamada, também falha se a resposta demorar mais que isso.
caso() {
  local nome="$1" esperado="$2" checagem="$3"
  shift 3
  local corpo status tempo
  corpo="$(curl -sS -w '\n%{http_code} %{time_total}' "$@")"
  status="${corpo##*$'\n'}"
  corpo="${corpo%$'\n'*}"
  tempo="${status#* }"
  status="${status%% *}"
  if [[ "$status" == "$esperado" ]] \
    && python3 -c "import json,sys; d=json.loads(sys.argv[1]); assert $checagem" "$corpo" 2>/dev/null \
    && { [[ -z "$TEMPO_MAX" ]] || python3 -c "import sys; assert float(sys.argv[1]) <= float(sys.argv[2])" "$tempo" "$TEMPO_MAX" 2>/dev/null; }; then
    echo "OK      $nome"
  else
    echo "FALHOU  $nome  (HTTP $status em ${tempo}s) $corpo"
    falhas=$((falhas + 1))
  fi
}

ids='[r["id"] for r in d["recomendacoes"]]'
criterios='[r["criterio"] for r in d["recomendacoes"]]'

caso "1. similaridade + popularidade (RF-01/04/07)" 200 \
  "$ids == [5, 9, 3, 4] and $criterios == ['mesmo-artesao', 'mesmo-artesao', 'popularidade', 'popularidade']" \
  "$BASE/produtos/1/recomendados?limite=4"

caso "2. produto inexistente (RF-02)" 404 \
  "d == {'erro': 'Produto 999 não encontrado'}" \
  "$BASE/produtos/999/recomendados"

caso "3. limite inválido (RF-05)" 400 \
  "'erro' in d" \
  "$BASE/produtos/1/recomendados?limite=50"

TEMPO_MAX=3 caso "4. lentidão vira 503 em ~2 s (RF-08)" 503 \
  "d == {'erro': 'Recomendações indisponíveis no momento'}" \
  -H 'X-Simular-Falha: lentidao' "$BASE/produtos/1/recomendados"

caso "5. histórico de compra (RF-06)" 200 \
  "$ids == [5, 7, 9, 2, 6]" \
  -H 'X-Usuario-Id: 1' "$BASE/usuarios/1/recomendados?limite=5"

caso "6. sem autenticação → 401 (RF-06)" 401 \
  "d == {'erro': 'Autenticação necessária'}" \
  "$BASE/usuarios/1/recomendados"

caso "6. outro usuário → 403 (RF-06)" 403 \
  "d == {'erro': 'Só é possível consultar as próprias recomendações'}" \
  -H 'X-Usuario-Id: 2' "$BASE/usuarios/1/recomendados"

caso "7. métricas do log por critério (RF-03/RNF-07)" 200 \
  "d['total'] > 0 and 'popularidade' in d['porCriterio']" \
  "$BASE/recomendacoes/metricas"

echo
if [[ $falhas -eq 0 ]]; then echo "Todos os casos passaram."; else echo "$falhas caso(s) falharam."; exit 1; fi
