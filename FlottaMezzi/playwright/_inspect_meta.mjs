import { chromium } from 'playwright';
import { loginAndNavigate } from './_shared/ui-helpers.mjs';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await loginAndNavigate(page, 'http://localhost:4200', { user: 'admin_test', password: 'Test123!' });

const r = await page.request.post('http://localhost:5100/api/Meta/AsmxProxy/MetaService.getTableMetadata', {
  data: { route: 'vw_mezzi_posizioni_giorno', lookup_table_id: 0, user_id: '', dm: 1 },
  headers: { 'Content-Type': 'application/json' }
});
const body = await r.json();
const mezzo = (body.columnMetadata || []).find(c => c.mc_nome_colonna === 'mezzo_id');
console.log('ALL keys of mezzo_id:', Object.keys(mezzo).join(', '));
console.log('\nlookup-related:');
Object.entries(mezzo).filter(([k]) => k.toLowerCase().includes('lookup') || k.includes('column_type')).forEach(([k,v]) => console.log(`  ${k} = ${JSON.stringify(v)}`));
await browser.close();
