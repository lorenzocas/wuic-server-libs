#!/usr/bin/env bash
# E2E agent-sdk: con anthropic-api-key="agent-sdk" la chat RAG passa dal `claude` CLI
# (subscription) e ritorna proposed_action_json + model reale. Backend prova @ :5000.
BASE=${1:-http://localhost:5000}

echo "=== Health ==="
curl -s --max-time 5 "$BASE/api/Rag/Health" | head -c 400; echo; echo

echo "=== Warm-up engine (retrieval Query) ==="
curl -s --max-time 90 -X POST "$BASE/api/Rag/Query" -H "Content-Type: application/json" \
  -d '{"query":"login cookie","top_k":1}' | head -c 120; echo; echo

echo "=== Chat azione table_style su cities (atteso proposed_action kind=table_style, model claude) ==="
curl -s --max-time 180 -X POST "$BASE/api/Rag/Chat" -H "Content-Type: application/json" \
  -d '{"query":"colora di rosso le righe con popolazione sotto 1000","top_k":5,"routeContext":"route: cities | colonne reali: population (number), name (string), id (number)"}' \
  | node -e "let b='';process.stdin.on('data',c=>b+=c);process.stdin.on('end',()=>{try{const d=JSON.parse(b);console.log('mode:',d.mode);console.log('model:',d.model);console.log('warning:',d.warning||'(none)');console.log('answer:',(d.answer||'').slice(0,220));console.log('proposed_action_json:',d.proposed_action_json)}catch(e){console.log('RAW:',b.slice(0,500))}})"
