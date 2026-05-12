#!/usr/bin/env node
/**
 * Dispatcher e2e data-oriented per FlottaMezzi.
 *
 * Caratteristiche (snello — no UI launch):
 *   - Login una volta sola via API client (admin_test_2/Test123!)
 *   - Esecuzione sequenziale dei test/* secondo numero
 *   - Per ogni test: durata, stato (pass/fail), errore
 *   - Tabella riepilogo finale + JSON in screenshots/last-run.json
 *   - Filtri: --filter <regex>, --bail
 *
 * Esempio:
 *   node dispatcher.mjs                    # tutti i test
 *   node dispatcher.mjs --filter '^(06|07)' # solo trigger DB
 *   node dispatcher.mjs --bail             # stop al primo fail
 *
 * Prerequisiti:
 *   - backend FlottaMezzi attivo su :5100
 *   - utenti admin_test_2 / autista_test seedati (Phase 4 della skill)
 *   - dati di prova seedati (Phase 5)
 */
import { readdir } from 'node:fs/promises';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';
import { createBackendApiClient } from './_shared/api-client.mjs';
import { loginAndNavigate, isIgnorableConsoleError } from './_shared/ui-helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = parseArgs(process.argv.slice(2));
const config = {
  baseUrl:        args['base-url']     ?? 'http://localhost:4200',
  backendBaseUrl: args['backend-url']  ?? 'http://localhost:5100',
  user:           args['user']         ?? 'admin_test',
  password:       args['password']     ?? 'Test123!',
  apiUser:        args['api-user']     ?? 'admin_test_2',
  apiPassword:    args['api-password'] ?? 'Test123!',
  filter:         args['filter']       ?? null,
  bail:           args['bail']         === true,
  headed:         args['headed']       === true,
  outDir:         args['out']          ?? join(__dirname, 'screenshots')
};

if (!existsSync(config.outDir)) mkdirSync(config.outDir, { recursive: true });

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', gray: '\x1b[90m'
};

console.log(`${c.bold}${c.cyan}━━ FlottaMezzi E2E Dispatcher ━━${c.reset}`);
console.log(`  base-url:    ${config.baseUrl}`);
console.log(`  backend:     ${config.backendBaseUrl}`);
console.log(`  user:        ${config.user} (UI) / ${config.apiUser} (API)`);
console.log(`  filter:      ${config.filter ?? '(none)'}`);
console.log(`  bail:        ${config.bail}`);
console.log(`  headed:      ${config.headed}\n`);

// ── prerequisiti ──────────────────────────────────────────────────
const backendUp = await probe(`${config.backendBaseUrl}/api/Meta/AsmxProxy/MetaService.getProjectMetadataVersion`, 'POST');
if (!backendUp) {
  console.error(`${c.red}✗ Backend ${config.backendBaseUrl} non raggiungibile.${c.reset}`);
  console.error(`  Avvia: cd C:/src/Wuic/FlottaMezzi && dotnet run --launch-profile WuicTest`);
  process.exit(2);
}
console.log(`${c.green}✓ Backend reachable${c.reset}`);

// ── api client ─────────────────────────────────────────────────────
const api = await createBackendApiClient({
  backendBaseUrl: config.backendBaseUrl,
  user: config.apiUser,
  password: config.apiPassword
});
console.log(`${c.green}✓ API client logged in (cookie mode: ${api.serverManagedCookieMode ? 'server-managed' : 'legacy'})${c.reset}`);

// ── invalidate metadata cache (forza re-read di any post-scaffold patch) ───
try {
  await api.invalidateMetadataRuntime();
  console.log(`${c.green}✓ Metadata cache invalidated${c.reset}`);
} catch (e) {
  console.warn(`${c.yellow}⚠ invalidateMetadataRuntime fallito: ${e.message?.slice(0, 100)}${c.reset}`);
}

// ── frontend probe + browser launch ────────────────────────────────
const frontendUp = await probe(config.baseUrl, 'GET');
let browser, browserContext, page;
if (frontendUp) {
  console.log(`${c.green}✓ Frontend reachable${c.reset}`);
  browser = await chromium.launch({ headless: !config.headed });
  browserContext = await browser.newContext({ ignoreHTTPSErrors: true });
  page = await browserContext.newPage();
  page.on('pageerror', err => console.error(`${c.red}[pageerror]${c.reset} ${err.message}`));
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (isIgnorableConsoleError(text)) return;
    console.error(`${c.red}[console.error]${c.reset} ${text.slice(0, 200)}`);
  });
  page.on('response', r => {
    if (r.status() === 401) console.error(`${c.red}[401]${c.reset} ${r.url()}`);
  });
  try {
    await loginAndNavigate(page, config.baseUrl, { user: config.user, password: config.password });
    console.log(`${c.green}✓ UI login ok (${config.user})${c.reset}`);

    // Pulizia caches client-side: localStorage + sessionStorage + IndexedDB Dexie 'MetaDB'.
    // Senza questo, dopo invalidate server-side il browser legge cache stale e fa scattare
    // errors.client.metadata.lookup_orphan su edit-form (verificato 2026-05-09 FlottaMezzi).
    await page.evaluate(async () => {
      try { localStorage.clear(); } catch {}
      try { sessionStorage.clear(); } catch {}
      try {
        await new Promise(resolve => {
          const req = indexedDB.deleteDatabase('MetaDB');
          req.onsuccess = req.onerror = req.onblocked = () => resolve();
        });
      } catch {}
    });
    console.log(`${c.green}✓ Client caches cleared (localStorage + sessionStorage + Dexie MetaDB)${c.reset}`);

    // Re-invalidate server-side dopo client clear (so backend ri-fetcha metadata fresca al prossimo getProjectMetadata)
    try { await api.invalidateMetadataRuntime(); } catch {}

    // Force reload per ri-fetchare metadata pulita
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1500);
  } catch (e) {
    console.warn(`${c.yellow}⚠ UI login fallito: ${e.message?.slice(0, 200)}${c.reset}`);
  }
} else {
  console.warn(`${c.yellow}⚠ Frontend ${config.baseUrl} non raggiungibile - test UI verranno SKIPPATI${c.reset}`);
}
console.log('');

// ── load tests ─────────────────────────────────────────────────────
const testsDir = join(__dirname, 'tests');
const files = (await readdir(testsDir)).filter(f => f.endsWith('.mjs')).sort();
const filtered = config.filter
  ? files.filter(f => new RegExp(config.filter).test(f))
  : files;

console.log(`${c.bold}Tests: ${filtered.length}/${files.length} matched${c.reset}\n`);

const results = [];
let pass = 0, fail = 0;

for (const f of filtered) {
  const start = Date.now();
  const url = pathToFileURL(join(testsDir, f)).href;
  let mod;
  try { mod = await import(url); } catch (e) {
    console.error(`${c.red}✗ ${f}: import error: ${e.message}${c.reset}`);
    results.push({ file: f, status: 'fail', error: e.message, durationMs: 0 });
    fail++;
    if (config.bail) break;
    continue;
  }
  const meta = mod.meta ?? {};
  const id = meta.id ?? f.split('-')[0];
  const name = meta.name ?? f;
  const needsUi = meta.needsUi === true;

  if (needsUi && !frontendUp) {
    console.log(`${c.yellow}⊘ [${id}] ${name}: SKIP (frontend down)${c.reset}`);
    results.push({ file: f, id, name, status: 'skip', reason: 'frontend not reachable', durationMs: 0 });
    continue;
  }

  const ctx = {
    api,
    browser, page, baseUrl: config.baseUrl,
    backendBaseUrl: config.backendBaseUrl,
    config,
    log: (msg) => process.stdout.write(`  ${c.dim}${msg}${c.reset}\n`),
    assert: (cond, message = 'assertion failed') => {
      if (!cond) throw new Error(`ASSERT: ${message}`);
    }
  };

  process.stdout.write(`${c.bold}[${id}] ${name}${c.reset} ... `);
  let outcome;
  try {
    if (typeof mod.cleanup === 'function') {
      try { await mod.cleanup(ctx); } catch { /* best effort */ }
    }
    const out = await mod.run(ctx);
    outcome = { status: 'pass', out };
    pass++;
  } catch (e) {
    outcome = { status: 'fail', error: e.message, stack: e.stack?.split('\n').slice(0, 5).join('\n') };
    fail++;
    if (page && needsUi) {
      try {
        const failPath = join(config.outDir, `FAIL_${id}_${Date.now()}.png`);
        await page.screenshot({ path: failPath, fullPage: true });
        outcome.screenshot = failPath;
      } catch {}
    }
  }
  const ms = Date.now() - start;
  outcome.durationMs = ms;

  if (outcome.status === 'pass') {
    console.log(`${c.green}✓ PASS${c.reset} ${c.gray}(${ms}ms)${c.reset}`);
  } else {
    console.log(`${c.red}✗ FAIL${c.reset} ${c.gray}(${ms}ms)${c.reset}`);
    console.log(`  ${c.red}${outcome.error}${c.reset}`);
    if (outcome.stack) console.log(`  ${c.gray}${outcome.stack}${c.reset}`);
  }
  results.push({ file: f, id, name, ...outcome });
  if (outcome.status === 'fail' && config.bail) {
    console.log(`${c.yellow}⏹  --bail${c.reset}`);
    break;
  }
}

try { await api.dispose(); } catch {}
if (browser) try { await browser.close(); } catch {}

console.log('');
console.log(`${c.bold}━━ Riepilogo ━━${c.reset}`);
const total = pass + fail;
results.forEach(r => {
  const status = r.status === 'pass' ? `${c.green}PASS${c.reset}` : r.status === 'skip' ? `${c.yellow}SKIP${c.reset}` : `${c.red}FAIL${c.reset}`;
  console.log(`  ${status}  [${r.id ?? '??'}] ${(r.name ?? r.file).padEnd(50)} ${c.gray}${r.durationMs ?? 0}ms${c.reset}`);
});
console.log(`${c.bold}  Totale: ${total} | ${c.green}pass=${pass}${c.reset} | ${c.red}fail=${fail}${c.reset}`);

const out = join(config.outDir, 'last-run.json');
writeFileSync(out, JSON.stringify({ config, results, pass, fail, total, runAt: new Date().toISOString() }, null, 2), 'utf8');
console.log(`${c.gray}  Report: ${out}${c.reset}`);

process.exit(fail > 0 ? 1 : 0);

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const v = argv[i + 1];
    if (v && !v.startsWith('--')) { o[k] = v; i++; }
    else o[k] = true;
  }
  return o;
}

async function probe(url, method = 'GET') {
  try {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? '{}' : undefined });
    return r.status >= 200 && r.status < 500;
  } catch { return false; }
}
