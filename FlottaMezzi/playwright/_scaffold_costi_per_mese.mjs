import { request } from 'playwright';

const ctx = await request.newContext({ baseURL: 'http://localhost:5100' });
// Login direct backend (no FE proxy)
const login = await ctx.post('/api/Meta/AsmxProxy/MetaService.login', {
  data: { user_name: 'admin_test', password: 'Test123!' },
  headers: { 'Content-Type': 'application/json' }
});
console.log('login:', login.status());

async function call(method, body) {
  const r = await ctx.post(`/api/Meta/AsmxProxy/${method}`, {
    data: body, headers: { 'Content-Type': 'application/json' }
  });
  return { status: r.status(), body: await r.text() };
}

const SHARED = {
  connection: 'Data Source=localhost\\sqlexpress;Initial Catalog=FlottaMezzi_Data;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True',
  connName: 'DataSQLConnection', db: 'FlottaMezzi_Data', provider: 'mssql'
};
const v = await call('scaffolding.scaffoldView', { ...SHARED, view: 'vw_costi_per_mese', createMenu: false, parentMenuId: 0 });
console.log('scaffold view:', v.status, v.body.slice(0, 200));
const inv = await call('MetaService.invalidateMetadataRuntime', {});
console.log('invalidate:', inv.status, inv.body.slice(0, 100));
await ctx.dispose();
