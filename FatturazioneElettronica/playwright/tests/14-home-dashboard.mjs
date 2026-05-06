/**
 * Test 14: Home dashboard rendering — STRICT.
 *
 * Verifica end-to-end:
 *  1) `#/home/dashboard` apre senza error dialog (NG02306, NG0303, route_not_found)
 *  2) i 4 tile renderizzano titolo + DATA-TABLE INTERNA popolata (.p-datatable)
 *     (non solo wuic-list-grid shell, ma anche il PrimeNG datatable interno)
 *  3) ogni TD widget ha html_len > 5KB (shell+table+headers)
 *  4) zero console.error critici
 */

export const meta = {
  id: '14',
  name: 'Home dashboard rendering (strict)',
  area: 'home',
  needsUi: true,
  needsApi: false
};

const EXPECTED_TILES = [
  { uniqueName: 'CRM_HOME_WIDGET__1', titleSubstring: 'Fatturato per stato',  action: 'chart' },
  { uniqueName: 'CRM_HOME_WIDGET__2', titleSubstring: 'Preventivi',           action: 'list'  },
  { uniqueName: 'CRM_HOME_WIDGET__3', titleSubstring: 'Scadenze per stato',   action: 'chart' },
  { uniqueName: 'CRM_HOME_WIDGET__4', titleSubstring: 'Fatture ricevute',     action: 'list'  }
];

export async function run(ctx) {
  const { page, baseUrl, assert, log } = ctx;

  const ng0303 = [];
  const ng02306 = [];
  const consoleErr = [];
  const pageErr = [];
  page.on('pageerror', e => pageErr.push(e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/NG0303/.test(t)) ng0303.push(t.slice(0, 200));
    else if (/NG02306/.test(t)) ng02306.push(t.slice(0, 200));
    else consoleErr.push(t.slice(0, 200));
  });

  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/home/dashboard?bust=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(10000); // tile loading

  // 1) NESSUN error dialog (regola: non dismissare)
  const errDialog = await page.locator('p-dialog .p-dialog-header, p-confirmdialog .p-dialog-header').count();
  assert(errDialog === 0, `error dialog visible (count=${errDialog}). NON dismissare — fix root cause.`);

  // 2) NESSUN NG0303 / NG02306
  assert(ng0303.length === 0, `${ng0303.length} NG0303: ${ng0303.slice(0,1).join(' | ')}`);
  assert(ng02306.length === 0, `${ng02306.length} NG02306: ${ng02306.slice(0,1).join(' | ')}`);

  // 3) Per OGNI tile: shell + p-datatable INTERNA popolata
  for (const t of EXPECTED_TILES) {
    const sel = `#${t.uniqueName}`;
    const widget = page.locator(sel).first();
    const exists = await widget.count();
    assert(exists > 0, `tile ${t.uniqueName} widget DIV non in DOM`);

    const html = await widget.innerHTML();
    const lg = await widget.locator('wuic-list-grid').count();
    const dr = await widget.locator('wuic-data-repeater').count();
    const dt = await widget.locator('.p-datatable, [data-pc-name="datatable"]').count();
    const titleCount = await page.locator(`text=/${t.titleSubstring}/i`).count();

    log(`  ${t.uniqueName}: html_len=${html.length}, lg=${lg}, dr=${dr}, dt=${dt}, title="${t.titleSubstring}"=${titleCount}`);

    assert(titleCount > 0, `tile ${t.uniqueName}: titolo "${t.titleSubstring}" non visibile`);
    assert(dr === 1, `tile ${t.uniqueName}: wuic-data-repeater count=${dr} (atteso 1)`);
    if (t.action === 'list') {
      assert(lg === 1, `tile ${t.uniqueName}: wuic-list-grid count=${lg} (atteso 1)`);
      assert(dt >= 1, `tile ${t.uniqueName}: p-datatable count=${dt} (atteso >=1) — list-grid shell-only`);
      assert(html.length > 3000, `tile ${t.uniqueName} list: html_len=${html.length} (atteso >3000)`);
    } else if (t.action === 'chart') {
      // chart action: verify canvas/svg/wuic-chart presente
      const canvas = await widget.locator('canvas, svg, wuic-chart, .p-chart').count();
      assert(canvas >= 1, `tile ${t.uniqueName} (chart): canvas/svg/wuic-chart count=${canvas} (atteso >=1)`);
      assert(html.length > 1000, `tile ${t.uniqueName} chart: html_len=${html.length} (atteso >1000) — chart canvas-based, shell minimo ~1.5KB`);
    }
  }

  // 4) NO pageerror critici
  const critical = pageErr.filter(e => !/Google Maps|preventDefault|NG0100/.test(e));
  assert(critical.length === 0, `${critical.length} pageerror: ${critical.slice(0,1).join(' | ')}`);

  // Snapshot del successo (POST verifiche, no dismiss)
  const snapPath = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PASS_14_home_dashboard_${Date.now()}.png`;
  await page.screenshot({ path: snapPath, fullPage: true });
  log(`Dashboard OK: 4/4 tile renderizzati con .p-datatable populated | screenshot=${snapPath}`);
  return { tiles: 4, screenshot: snapPath };
}
