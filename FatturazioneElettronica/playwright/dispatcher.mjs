#!/usr/bin/env node
/**
 * Dispatcher e2e ad-hoc per FatturazioneElettronica.
 *
 * Caratteristiche:
 *   - Login una volta sola (admin_test/Test123!) — riusa context per tutti i test
 *   - Esecuzione sequenziale dei test/* secondo numero (01, 02, ..., 08)
 *   - Per ogni test: durata, stato (pass/fail/skip), errore, screenshot
 *   - Tabella riepilogo finale + JSON in screenshots/last-run.json
 *   - Filtri: --filter <regex>, --bail (stop al primo fail)
 *   - --headed / --headless (default headless)
 *   - Auto-skip dei test UI se frontend non raggiungibile
 *
 * Esempio:
 *   node dispatcher.mjs                    # tutti i test, headless
 *   node dispatcher.mjs --headed           # browser visibile
 *   node dispatcher.mjs --filter '^0[1-3]' # solo test 01,02,03
 *   node dispatcher.mjs --bail             # stop al primo fail
 *
 * NB: prerequisiti
 *   - backend FatturazioneElettronica avviato su :5100 (o --backend-url)
 *   - frontend avviato su :4200 (o --base-url) — solo per test UI
 *   - utente admin_test/Test123! seedato nel DB metadati
 */
import { readdir } from 'node:fs/promises';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';
import { createBackendApiClient } from './_shared/api-client.mjs';
import { loginAndNavigate, isIgnorableConsoleError } from './_shared/ui-helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── parse args ─────────────────────────────────────────────────────
const args = parseArgs(process.argv.slice(2));
const config = {
  baseUrl:         args['base-url']        ?? 'http://localhost:4200',
  backendBaseUrl:  args['backend-url']     ?? 'http://localhost:5100',
  user:            args['user']            ?? 'admin_test',         // browser/UI tests
  password:        args['password']        ?? 'Test123!',
  apiUser:         args['api-user']        ?? 'admin_test_2',         // dispatcher api client (separate user per regola "single-session")
  apiPassword:     args['api-password']    ?? 'Test123!',
  filter:          args['filter']          ?? null,
  bail:            args['bail']            === true,
  headed:          args['headed']          === true,
  outDir:          args['out']             ?? join(__dirname, 'screenshots')
};

if (!existsSync(config.outDir)) mkdirSync(config.outDir, { recursive: true });

// ── colors ──────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', gray: '\x1b[90m'
};

console.log(`${c.bold}${c.cyan}━━ FatturazioneElettronica E2E Dispatcher ━━${c.reset}`);
console.log(`  base-url:    ${config.baseUrl}`);
console.log(`  backend:     ${config.backendBaseUrl}`);
console.log(`  user:        ${config.user}`);
console.log(`  filter:      ${config.filter ?? '(none)'}`);
console.log(`  bail:        ${config.bail}`);
console.log(`  headed:      ${config.headed}`);
console.log('');

// ── prerequisites ──────────────────────────────────────────────────
const backendUp = await probe(`${config.backendBaseUrl}/api/Meta/AsmxProxy/MetaService.getProjectMetadataVersion`, 'POST');
if (!backendUp) {
  console.error(`${c.red}✗ Backend ${config.backendBaseUrl} non raggiungibile. Avvialo con:${c.reset}`);
  console.error(`  cd C:/src/Wuic/FatturazioneElettronica && dotnet run --urls=${config.backendBaseUrl}`);
  process.exit(2);
}
console.log(`${c.green}✓ Backend ${config.backendBaseUrl} reachable${c.reset}`);

const frontendUp = await probe(config.baseUrl, 'GET');
if (!frontendUp) {
  console.warn(`${c.yellow}⚠ Frontend ${config.baseUrl} non raggiungibile — test UI verranno SKIPPATI.${c.reset}`);
  console.warn(`  Per abilitarli, avvia: cd C:/src/Wuic/FatturazioneElettronica/wwwroot && npm install && npm run serve:npm`);
}
console.log('');

// ── api client unico ──────────────────────────────────────────────
// Api client usa admin_test_2 cosi' la sua sessione non viene invalidata
// dal login del browser (che usa admin_test). Il framework WUIC enforce
// single-session per username — usare lo stesso user su entrambi i context
// fa fight sulle sessioni e produce 401 sporadici sui test UI.
// Vedi pattern "Two-user pattern" in regola 26 AGENTS / login utils.
const api = await createBackendApiClient({
  backendBaseUrl: config.backendBaseUrl,
  user: config.apiUser,
  password: config.apiPassword
});
console.log(`${c.green}✓ API client logged in (cookie mode: ${api.serverManagedCookieMode ? 'server-managed' : 'legacy'})${c.reset}`);

// ── pre-run cleanup (idempotenza globale) ──────────────────────────
// Purga SOLO i dati di test (codice/causale LIKE '_e2e_%' /
// 'Fattura E2E%'). Se un test fallisce a meta', il cleanup di quel test
// puo' non eseguirsi → la run successiva troverebbe row con codice
// colliding sul UNIQUE constraint. Il cleanup pre-run garantisce
// idempotenza senza dipendere dai cleanup per-test.
//
// IMPORTANTE: NON tocca users/roles seedati dalla skill app-creation
// (admin_test/commercialista_test/imprenditore_test/readonly_test
// e ruoli associati). Quei record sono prerequisiti dell'app stessa
// e devono persistere tra run. Solo se un test crea utenti aggiuntivi
// con prefisso `_e2e_` allora puo' pulirli nel proprio cleanup.
{
  const { exec: sqlExec } = await import('./_shared/sql-helpers.mjs');
  try {
    await sqlExec(`
      SET ANSI_NULLS ON;
      SET ANSI_PADDING ON;
      SET ANSI_WARNINGS ON;
      SET ARITHABORT ON;
      SET CONCAT_NULL_YIELDS_NULL ON;
      SET QUOTED_IDENTIFIER ON;
      SET NUMERIC_ROUNDABORT OFF;
      SET NOCOUNT ON;
      -- temp tables degli upload runs precedenti (md_action_type=10)
      DECLARE @sql NVARCHAR(MAX) = N'';
      SELECT @sql = @sql + N'DROP TABLE [dbo].[' + name + N']; '
        FROM sys.tables WHERE name LIKE 'mov_imp_e2e_%';
      IF LEN(@sql) > 0 EXEC sp_executesql @sql;

      -- ordine FK-aware: figli prima dei padri
      DELETE FROM dbo.fatture_inviate_righe WHERE fattura_id IN (SELECT id FROM dbo.fatture_inviate WHERE causale LIKE 'Fattura E2E%');
      IF OBJECT_ID('dbo.scadenze','U') IS NOT NULL
        DELETE FROM dbo.scadenze WHERE fattura_inviata_id IN (SELECT id FROM dbo.fatture_inviate WHERE causale LIKE 'Fattura E2E%');
      DELETE FROM dbo.fatture_inviate WHERE causale LIKE 'Fattura E2E%';
      DELETE FROM dbo.movimenti_bancari WHERE descrizione LIKE 'E2E%' OR import_batch_id LIKE 'mov_imp_e2e%';
      DELETE FROM dbo.clienti WHERE codice LIKE '_e2e_%';
      DELETE FROM dbo.fornitori WHERE codice LIKE '_e2e_%';
      DELETE FROM dbo.prodotti WHERE codice LIKE '_e2e_%';
      -- banche: no codice col; usa iban (test pulisce IBAN inizianti _e2e_)
      DELETE FROM dbo.banche WHERE iban LIKE '_e2e_%' OR descrizione LIKE 'Banca E2E%';
      -- pagamenti: codice_sdi non e' codice; filter su descrizione
      DELETE FROM dbo.pagamenti WHERE descrizione LIKE 'Bonifico E2E%';
      DELETE FROM dbo.codici_iva WHERE codice LIKE '_e2e_%';
      DELETE FROM dbo.unita_misura WHERE codice LIKE '_e2e_%';
    `);
    console.log(`${c.green}✓ Pre-run cleanup ok (rows _e2e_* purged)${c.reset}`);
  } catch (e) {
    console.warn(`${c.yellow}⚠ Pre-run cleanup partial: ${e.message?.slice(0, 200)}${c.reset}`);
  }
}

// ── browser unico ──────────────────────────────────────────────────
let browser, context, page;
if (frontendUp) {
  browser = await chromium.launch({ headless: !config.headed });
  context = await browser.newContext({ ignoreHTTPSErrors: true });
  page = await context.newPage();
  // Filtra errori console "ignorabili" (idem pattern docs-driven framework)
  page.on('pageerror', err => console.error(`${c.red}[pageerror]${c.reset} ${err.message}`));
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (isIgnorableConsoleError(text)) return;
    console.error(`${c.red}[console.error]${c.reset} ${text}`);
  });
  // Diagnostico 401: log URL del request che torna unauthorized.
  page.on('response', r => {
    if (r.status() === 401) console.error(`${c.red}[401]${c.reset} ${r.url()}`);
  });

  // Login UI tramite framework loginAndNavigate (gestisce cookie k-user
  // pre-set, fallback ensureLoggedIn, retry e isIgnorableConsoleError).
  // Usa user/password del dispatcher (default admin_test/Test123!).
  try {
    await loginAndNavigate(page, config.baseUrl, { user: config.user, password: config.password });
    console.log(`${c.green}✓ UI login ok (admin_test)${c.reset}`);
  } catch (e) {
    console.warn(`${c.yellow}⚠ UI login fallito: ${e.message}${c.reset}`);
    console.warn(`  Test UI verranno eseguiti senza sessione preliminare; ogni test puo' fare login on-demand se serve.`);
  }
}

// ── load tests ──────────────────────────────────────────────────────
const testsDir = join(__dirname, 'tests');
const files = (await readdir(testsDir)).filter(f => f.endsWith('.mjs')).sort();
const filtered = config.filter
  ? files.filter(f => new RegExp(config.filter).test(f))
  : files;

console.log(`${c.bold}Tests: ${filtered.length}/${files.length} matched${c.reset}\n`);

// ── run sequential ──────────────────────────────────────────────────
const results = [];
let pass = 0, fail = 0, skip = 0;

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
  const needsUi = meta.needsUi !== false;

  if (needsUi && !frontendUp) {
    console.log(`${c.yellow}⊘ [${id}] ${name}: SKIP (frontend down, needsUi=true)${c.reset}`);
    results.push({ file: f, id, name, status: 'skip', reason: 'frontend not reachable' });
    skip++;
    continue;
  }

  const ctx = {
    api, browser, context, page,
    baseUrl: config.baseUrl,
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
      try { await mod.cleanup(ctx); } catch (e) { /* best effort pre-cleanup */ }
    }
    const out = await mod.run(ctx);
    outcome = { status: 'pass', out };
    pass++;
  } catch (e) {
    outcome = { status: 'fail', error: e.message, stack: e.stack?.split('\n').slice(0, 5).join('\n') };
    fail++;
    if (page) {
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
    if (outcome.screenshot) console.log(`  ${c.gray}screenshot: ${outcome.screenshot}${c.reset}`);
  }

  results.push({ file: f, id, name, ...outcome });
  if (outcome.status === 'fail' && config.bail) {
    console.log(`${c.yellow}⏹  --bail: stop al primo fail${c.reset}`);
    break;
  }
}

// ── teardown ────────────────────────────────────────────────────────
try { await api.dispose(); } catch {}
if (browser) try { await browser.close(); } catch {}

// ── summary ─────────────────────────────────────────────────────────
console.log('');
console.log(`${c.bold}━━ Riepilogo ━━${c.reset}`);
const total = pass + fail + skip;
const lines = results.map(r => {
  const status = r.status === 'pass' ? `${c.green}PASS${c.reset}`
              : r.status === 'fail' ? `${c.red}FAIL${c.reset}`
              : `${c.yellow}SKIP${c.reset}`;
  return `  ${status}  [${r.id ?? '??'}] ${(r.name ?? r.file).padEnd(50)} ${c.gray}${r.durationMs ?? 0}ms${c.reset}`;
});
lines.forEach(l => console.log(l));
console.log(`${c.bold}  Totale: ${total} | ${c.green}pass=${pass}${c.reset} | ${c.red}fail=${fail}${c.reset} | ${c.yellow}skip=${skip}${c.reset}`);

const out = join(config.outDir, 'last-run.json');
writeFileSync(out, JSON.stringify({ config, results, pass, fail, skip, total, runAt: new Date().toISOString() }, null, 2), 'utf8');
console.log(`${c.gray}  Report JSON: ${out}${c.reset}`);

process.exit(fail > 0 ? 1 : 0);

// ── helpers ────────────────────────────────────────────────────────
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

async function probe(url, method) {
  try {
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'POST' ? '{}' : undefined
    });
    return r.ok || r.status === 200;
  } catch { return false; }
}
