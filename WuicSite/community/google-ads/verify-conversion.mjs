// Verifica end-to-end del tracking conversioni Google Ads sul sito live.
// Apre /start, accetta i cookie (consenso marketing -> Consent Mode "granted"),
// clicca il CTA sandbox e intercetta la richiesta di conversione verso Google.
// Uso: node verify-conversion.mjs   (WUIC_SITE per puntare altrove, HEADED=1 per vedere)
import { chromium } from 'playwright';

const SITE = process.env.WUIC_SITE || 'https://wuic-framework.com';
const EXPECT_ID = 'AW-18418312407';
const LABEL_SANDBOX = 'oP6gCMzqzuocENfJxM5E';
const log = (m) => console.log('[ads] ' + m);

const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
const page = await (await browser.newContext()).newPage();
const hits = [];
// Le conversioni partono verso googleadservices.com / google.com/pagead/...
page.on('request', (r) => {
  const u = r.url();
  if (/googleadservices\.com|google\.[a-z.]+\/pagead|googletagmanager\.com\/gtag/i.test(u)) hits.push(u);
});

let failed = null;
try {
  await page.goto(`${SITE}/start?m=competitor`, { waitUntil: 'networkidle', timeout: 60000 });
  log('pagina /start caricata');

  // 1) gtag.js caricato? (deve esserci perché ADS_CONVERSION_ID non è più placeholder)
  const gtagLoaded = hits.some(u => /googletagmanager\.com\/gtag/i.test(u));
  log(`gtag.js caricato: ${gtagLoaded ? 'SI' : 'NO'}`);
  if (!gtagLoaded) throw new Error('gtag.js non caricato: il tag non si attiva sulla pagina');

  // 2) Consent Mode: prima del consenso deve essere denied
  const before = await page.evaluate(() => (window.dataLayer || []).filter(a => a && a[0] === 'consent'));
  log(`eventi consent nel dataLayer prima del click: ${before.length}`);

  // 3) Accetta i cookie (il consenso marketing sblocca ad_storage)
  const accept = page.getByRole('button', { name: /Accetta tutti|Accept all/i });
  await accept.waitFor({ state: 'visible', timeout: 15000 });
  await accept.click();
  log('cookie banner: "Accetta tutti" cliccato');
  await page.waitForTimeout(1500);

  // 4) Click sul CTA che spara sandbox_open (apre demo in nuova scheda)
  const cta = page.getByRole('link', { name: /Try the live sandbox|sandbox/i }).first();
  await cta.waitFor({ state: 'visible', timeout: 15000 });
  await cta.click({ modifiers: [] }).catch(() => {});
  log('CTA sandbox cliccato');
  await page.waitForTimeout(4000);

  // 5) È partita la conversione col nostro label?
  // NB: si verifica sul dataLayer, NON sul traffico di rete: gtag.js accoda
  // l'evento e lo spedisce in modo asincrono (spesso via sendBeacon allo
  // unload), quindi la richiesta può non essere osservabile nella finestra
  // del test — mentre il dataLayer è deterministico (verificato 2026-08-30).
  const dl = await page.evaluate(() => (window.dataLayer || []).map(a => Array.from(a)));
  const conv = dl.filter(e => e[0] === 'event' && e[1] === 'conversion');
  conv.forEach(e => log('  → ' + JSON.stringify(e[2])));
  const withLabel = conv.some(e => String(e[2] && e[2].send_to || '').includes(LABEL_SANDBOX));
  const granted = dl.some(e => e[0] === 'consent' && e[1] === 'update' && e[2] && e[2].ad_storage === 'granted');
  log(`consenso ad_storage granted: ${granted} | eventi conversion nel dataLayer: ${conv.length}`);
  log(`richieste Google osservate (informativo): ${hits.length}`);
  if (!granted) throw new Error('Consent Mode non è passato a granted dopo "Accetta tutti"');
  if (!withLabel) throw new Error(`nessun evento conversion con label ${LABEL_SANDBOX} nel dataLayer`);
  log('RISULTATO: conversione sandbox_open sparata col label corretto ✅');
} catch (e) {
  failed = e;
} finally {
  await browser.close();
}
if (failed) { console.error('[ads] FAIL: ' + failed.message); process.exit(1); }
