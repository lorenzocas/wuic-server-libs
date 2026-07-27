#!/usr/bin/env node
/**
 * WUIC agent-sdk bridge — MCP server (stdio, JSON-RPC 2.0). ZERO dipendenze (solo `node:*`).
 *
 * Spawnato da WuicRagEngine (ChatJson, modalita' apiKey=="agent-sdk") e consumato dal `claude`
 * CLI: cosi' la chat RAG usa il credito della subscription MAX invece dell'API key a consumo,
 * dentro lo scope dell'Agent runtime ufficiale.
 *
 * Espone i tool WUIC al modello:
 *   - tutti i `propose_*` + `remember_fact`/`forget_fact`/`suggest_followups` (da rag_tools.json):
 *     CATTURA gli `arguments` su file (una riga JSON per call) e ritorna un risultato TERMINALE
 *     (il loop agentico si chiude: il satellite legge la cattura e la mappa su proposed_action).
 *   - `request_metadata_detail` (NON in rag_tools.json — engine-only/prompt-driven nel path
 *     diretto): qui e' un tool MCP REALE che PROXY-a il backend `/api/Rag/MetadataDetail`
 *     (retrieval agentico). Risultato NON terminale: il modello continua e poi emette il propose_*.
 *
 * Env:
 *   WUIC_RAG_TOOLS_PATH    path a rag_tools.json (schema dei propose_* e utility)
 *   WUIC_RAG_CAPTURE_PATH  file dove appendere le tool-call catturate (one JSON per line)
 *   WUIC_BACKEND           base url backend (default http://localhost:5000)
 *
 * Trappola nota (da spike 2026-06-20): nel `--mcp-config` i path Windows DEVONO usare forward
 * slash, i backslash danno "MCP config is not a valid JSON". Lo gestisce il satellite a monte.
 */
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

const TOOLS_PATH = process.env.WUIC_RAG_TOOLS_PATH || '';
const CAPTURE_PATH = process.env.WUIC_RAG_CAPTURE_PATH || '';
const BACKEND = (process.env.WUIC_BACKEND || 'http://localhost:5000').replace(/\/+$/, '');
const PROTOCOL_VERSION = '2024-11-05';

function log(...a) { process.stderr.write('[wuic-agent-sdk-mcp] ' + a.join(' ') + '\n'); }

// Carica le tool-definition da rag_tools.json e le converte in shape MCP (`inputSchema` camel,
// non `input_schema` snake/Anthropic). Aggiunge `request_metadata_detail` (non presente nel file).
function loadTools() {
  let arr = [];
  try { arr = JSON.parse(fs.readFileSync(TOOLS_PATH, 'utf8')); } catch (e) { log('rag_tools.json non leggibile: ' + (e?.message || e)); arr = []; }
  // Cap per-tool description length. Il vecchio 6000 TRONCAVA a metà la
  // description di propose_designer_inject (13.6K): la guida `archetype_config`
  // dei chart (CONFIG ARCHETIPO INLINE @6392, `- chart:{type…}` @6987,
  // dataProperty:'dato' @7049, esempio pie @8424) cadeva OLTRE il taglio, così
  // il modello vedeva "action:'chart'" (@5302, tenuto) ma NON lo schema del
  // config → emetteva un chart DATAREPEATER con archetype_config vuoto/typeless
  // (rag-chatbot--designer-chart-config 0/3). 16000 tiene l'intera description.
  // Override via WUIC_RAG_TOOL_DESC_CAP.
  const descCap = Number(process.env.WUIC_RAG_TOOL_DESC_CAP) > 0 ? Number(process.env.WUIC_RAG_TOOL_DESC_CAP) : 16000;
  const tools = (Array.isArray(arr) ? arr : []).map((t) => ({
    name: t.name,
    description: String(t.description || '').slice(0, descCap),
    inputSchema: t.input_schema || { type: 'object' },
  }));
  tools.push({
    name: 'request_metadata_detail',
    description:
      "Recupera dettagli REALI dei metadata di una route PRIMA di emettere un propose_*. " +
      "USA QUESTO TOOL quando ti servono nomi colonna reali, identita' SQL (schema/tabella), " +
      "alias di join di un lookup, o per risolvere un valore visualizzato di un lookupByID nel suo ID. " +
      "detail='columns' -> elenco colonne reali + identita' SQL della route; " +
      "detail='lookup_columns' (richiede column) -> entity correlata + alias di join reale; " +
      "detail='lookup_value' (richiede column+value) -> matched_ids dell'ID corrispondente al valore visualizzato; " +
      "detail='route_metadata' -> archetipi/tabella della route; detail='sample_records' -> N righe dati reali.",
    inputSchema: {
      type: 'object',
      properties: {
        detail: { type: 'string', enum: ['columns', 'lookup_columns', 'lookup_value', 'route_metadata', 'sample_records'] },
        route: { type: 'string' },
        column: { type: 'string' },
        value: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['detail', 'route'],
    },
  });
  return tools;
}

const TOOLS = loadTools();
// I tool "terminali" (capture): tutto tranne request_metadata_detail.
const CAPTURE_NAMES = new Set(TOOLS.map((t) => t.name).filter((n) => n !== 'request_metadata_detail'));

function postJson(path, body, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const u = new URL(BACKEND + path);
    const mod = u.protocol === 'https:' ? https : http;
    const data = Buffer.from(JSON.stringify(body), 'utf8');
    const req = mod.request(u, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length },
    }, (res) => {
      let chunks = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`HTTP ${res.statusCode} da ${path}: ${chunks.slice(0, 200)}`));
        try { resolve(JSON.parse(chunks)); } catch { resolve(chunks); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error(`timeout ${path}`)); });
    req.write(data);
    req.end();
  });
}

async function callTool(name, args) {
  if (name === 'request_metadata_detail') {
    const body = { detail: String(args.detail || ''), route: String(args.route || '') };
    if (args.column != null) body.column = String(args.column);
    if (args.value != null) body.value = String(args.value);
    if (args.limit != null) body.limit = Number(args.limit);
    const r = await postJson('/api/Rag/MetadataDetail', body);
    const text = (typeof r === 'string' ? r : JSON.stringify(r, null, 2)).slice(0, 6000);
    return { text, isError: false };
  }
  if (CAPTURE_NAMES.has(name)) {
    // CATTURA: una riga JSON per call. Il satellite legge la PRIMA azione propose_*.
    try {
      fs.appendFileSync(CAPTURE_PATH, JSON.stringify({ name, arguments: args || {} }) + '\n', 'utf8');
    } catch (e) {
      log('append capture FAIL: ' + (e?.message || e));
      return { text: 'Errore interno nel registrare la proposta.', isError: true };
    }
    return {
      text: 'Proposta registrata correttamente. L\'azione e\' stata catturata: NON chiamare altri tool. '
        + 'Concludi con UN breve messaggio in italiano per l\'utente che descrive la proposta appena fatta.',
      isError: false,
    };
  }
  return { text: 'tool sconosciuto: ' + name, isError: true };
}

// ---------------- JSON-RPC 2.0 su stdio (newline-delimited) ----------------
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

async function handle(msg) {
  const { id, method, params } = msg || {};
  if (method === 'initialize') {
    return send({ jsonrpc: '2.0', id, result: { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'wuic-agent-sdk', version: '1.0.0' } } });
  }
  if (method === 'notifications/initialized' || method === 'initialized') return;
  if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments || {};
    try {
      const r = await callTool(name, args);
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: r.text }], isError: !!r.isError } });
    } catch (e) {
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'Errore: ' + (e?.message || e) }], isError: true } });
    }
  }
  if (id !== undefined && id !== null) return send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'method not found: ' + method } });
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let m;
    try { m = JSON.parse(line); } catch { log('riga JSON non valida'); continue; }
    Promise.resolve(handle(m)).catch((e) => log('handle err: ' + (e?.message || e)));
  }
});
process.stdin.on('end', () => process.exit(0));
log('avviato, backend=' + BACKEND + ', tools=' + TOOLS.length + ', capture=' + CAPTURE_PATH);
