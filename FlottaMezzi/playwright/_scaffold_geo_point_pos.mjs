import { chromium } from 'playwright';
import { loginAndNavigate } from './_shared/ui-helpers.mjs';

const BACKEND = 'http://localhost:5100';
const FRONTEND = 'http://localhost:4200';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await loginAndNavigate(page, FRONTEND, { user: 'admin_test', password: 'Test123!' });

async function call(method, body) {
  const r = await page.request.post(`${BACKEND}/api/Meta/AsmxProxy/${method}`, {
    data: body, headers: { 'Content-Type': 'application/json' }
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 400) }; }
  return { status: r.status(), json };
}

const DATA_CONN = 'Data Source=localhost\\sqlexpress;Initial Catalog=FlottaMezzi_Data;Integrated Security=False;Persist Security Info=True;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True';
const SHARED = { connection: DATA_CONN, connName: 'DataSQLConnection', db: 'FlottaMezzi_Data', provider: 'mssql' };

const c1 = await call('scaffolding.scaffoldColumn', { ...SHARED, table: 'mezzi_posizioni', column: 'geo_point' });
console.log('scaffold col mezzi_posizioni.geo_point:', c1.status, JSON.stringify(c1.json).slice(0, 250));

// Re-scaffold view to refresh column list (geo_point + dropped lat/lng if needed)
const v1 = await call('scaffolding.scaffoldView', { ...SHARED, view: 'vw_mezzi_posizioni_giorno', createMenu: false, parentMenuId: 0 });
console.log('scaffold view:', v1.status, JSON.stringify(v1.json).slice(0, 250));

const inv = await call('MetaService.invalidateMetadataRuntime', {});
console.log('invalidate:', inv.status, JSON.stringify(inv.json).slice(0, 200));

await browser.close();
