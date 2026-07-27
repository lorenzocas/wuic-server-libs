/**
 * Proxy dev-server per `serve:6200` (backend KonvergenceCore su :6000, isolato
 * dal :5000 di prova).
 *
 * DRY: riusa integralmente le regole di `proxy.conf.js` (bypass HotReload +
 * `silentConfigure` che silenzia gli errori proxy quando il backend non e'
 * ancora su) e si limita a ri-targetizzare ogni rule su :6000. Cosi' il
 * silenziamento ECONNREFUSED e le altre regole restano un'unica fonte.
 *
 * Sostituisce `proxy.conf.6000.json` (JSON puro, che non poteva avere i callback
 * `bypass`/`configure`). `serve:6200` punta a questo file.
 */
const base = require('./proxy.conf.js');

const TARGET_6000 = 'http://localhost:6000';
const config = {};
for (const [route, rule] of Object.entries(base)) {
  // changeOrigin:false (a differenza del base): il backend deve vedere
  // Host=localhost:6200 perche' Stimulsoft (ReportDesigner/Viewer) genera nel
  // markup URL ASSOLUTE da scheme+host della request. Con changeOrigin:true
  // emetteva http://localhost:6000/... e Chrome BLOCCA la porta 6000
  // (ERR_UNSAFE_PORT, 6000=X11 nella blocklist) → designer report rotto.
  // Su :4200/prova (backend 5000, porta non bloccata) il problema non si vede.
  config[route] = { ...rule, target: TARGET_6000, changeOrigin: false };
}

module.exports = config;
