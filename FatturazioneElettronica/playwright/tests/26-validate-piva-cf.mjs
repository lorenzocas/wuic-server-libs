/**
 * Test 26: Workflow #18 — Validazione P.IVA + Codice Fiscale.
 *
 * A. P.IVA valida (Apple Italia: 04302440960) → valid=true
 * B. P.IVA con cifra finale errata → valid=false, reason mentions checksum
 * C. P.IVA con < 11 cifre → valid=false reason "11 cifre"
 * D. P.IVA con lettera → valid=false reason "solo cifre"
 * E. CF persona fisica valido (CF noto: RSSMRA80A01H501U → Mario Rossi 1980-01-01 Roma)
 * F. CF con checksum errato → valid=false
 * G. CF persona giuridica (11 cifre digit) ricade su validazione P.IVA
 * H. CF con lunghezza errata → valid=false
 * I. value vuoto → 400
 *
 * UI: non strettamente necessaria — il valore aggiunto e' nell'API. Test
 *     focalizzato su backend.
 */

export const meta = {
  id: '26',
  name: 'Validate P.IVA + CF (formal checksum offline, no external API)',
  area: 'workflow',
  needsUi: false,
  needsApi: true
};

export async function run(ctx) {
  const { backendBaseUrl, assert, log } = ctx;
  const apiBase = backendBaseUrl.replace(/\/$/, '');

  // === A: P.IVA valida ===
  // Ferrari S.p.A. 00159560366 (P.IVA pubblica, checksum verificato a mano:
  // odd[1,3,5,7,9]=0+1+9+6+3=19, even[2,4,6,8,10]=0+5+5+0+6 doubled,sum digits=0+1+1+0+3=5,
  // tot=24, check=(10-4)%10=6 ✓)
  let r = await fetch(`${apiBase}/api/validate/piva?value=00159560366`);
  let j = await r.json();
  assert(j.ok === true && j.valid === true,
    `A: Ferrari P.IVA dovrebbe essere valida: ${JSON.stringify(j)}`);
  log(`Test A: P.IVA Ferrari 00159560366 → valid=true`);

  // === B: P.IVA con checksum errato (cambio ultima cifra) ===
  r = await fetch(`${apiBase}/api/validate/piva?value=00159560367`);
  j = await r.json();
  assert(j.ok === true && j.valid === false,
    `B: P.IVA con checksum errato deve essere invalid: ${JSON.stringify(j)}`);
  assert(/checksum/i.test(j.reason || ''), `B: reason deve menzionare checksum, visto: ${j.reason}`);
  log(`Test B: P.IVA invalid checksum → valid=false reason="${j.reason}"`);

  // === C: P.IVA troppo corta ===
  r = await fetch(`${apiBase}/api/validate/piva?value=12345`);
  j = await r.json();
  assert(j.valid === false && /11 cifre/.test(j.reason || ''),
    `C: P.IVA corta deve riportare "11 cifre", visto ${j.reason}`);
  log(`Test C: P.IVA 5 cifre → valid=false reason="${j.reason}"`);

  // === D: P.IVA con lettera ===
  r = await fetch(`${apiBase}/api/validate/piva?value=0430244096A`);
  j = await r.json();
  assert(j.valid === false && /solo cifre/i.test(j.reason || ''),
    `D: P.IVA con lettera deve essere invalida, visto ${j.reason}`);
  log(`Test D: P.IVA con lettera → valid=false reason="${j.reason}"`);

  // === E: CF persona fisica valido ===
  // Mario Rossi nato 01/01/1980 a Roma → CF: RSSMRA80A01H501U
  r = await fetch(`${apiBase}/api/validate/cf?value=RSSMRA80A01H501U`);
  j = await r.json();
  assert(j.ok === true && j.valid === true,
    `E: CF Rossi standard deve essere valido: ${JSON.stringify(j)}`);
  assert(j.gender === 'M', `E: gender deve essere M, visto ${j.gender}`);
  assert(j.birth_date === '1980-01-01', `E: birth_date deve essere 1980-01-01, visto ${j.birth_date}`);
  assert(j.comune_code === 'H501', `E: comune deve essere H501 (Roma), visto ${j.comune_code}`);
  log(`Test E: CF RSSMRA80A01H501U → valid, gender=M, born=1980-01-01, comune=H501`);

  // === F: CF con ultima lettera sbagliata ===
  r = await fetch(`${apiBase}/api/validate/cf?value=RSSMRA80A01H501Z`);
  j = await r.json();
  assert(j.valid === false, `F: CF con last letter errata deve essere invalido: ${JSON.stringify(j)}`);
  assert(/checksum/i.test(j.reason || ''), `F: reason deve menzionare checksum`);
  log(`Test F: CF wrong checksum → valid=false reason="${j.reason}"`);

  // === G: CF persona giuridica = P.IVA (11 cifre) ===
  r = await fetch(`${apiBase}/api/validate/cf?value=00159560366`);
  j = await r.json();
  assert(j.valid === true, `G: CF persona giuridica (11 cifre P.IVA valida) deve essere valido: ${JSON.stringify(j)}`);
  log(`Test G: CF=11digit P.IVA → fallback validazione P.IVA, valid=true`);

  // === H: CF con lunghezza errata ===
  r = await fetch(`${apiBase}/api/validate/cf?value=RSSMRA`);
  j = await r.json();
  assert(j.valid === false && /16 caratteri/.test(j.reason || ''),
    `H: CF corto deve essere invalido, visto ${j.reason}`);
  log(`Test H: CF troppo corto → valid=false reason="${j.reason}"`);

  // === I: value vuoto → 400 ===
  r = await fetch(`${apiBase}/api/validate/piva`);
  assert(r.status === 400, `I: piva senza value deve essere 400, visto ${r.status}`);
  r = await fetch(`${apiBase}/api/validate/cf`);
  assert(r.status === 400, `I: cf senza value deve essere 400, visto ${r.status}`);
  log(`Test I: validation 400 per value mancante`);

  // === J: case-insensitive (CF in lowercase deve funzionare) ===
  r = await fetch(`${apiBase}/api/validate/cf?value=rssmra80a01h501u`);
  j = await r.json();
  assert(j.valid === true, `J: CF lowercase deve essere normalizzato e valido: ${JSON.stringify(j)}`);
  log(`Test J: CF lowercase → normalizzato e valid=true`);

  // === K: CF persona fisica femmina (giorno > 40) ===
  // CF generato fittizio: BNCMRA80A41H501U (Maria Bianchi 1980-01-01 Roma F)
  // Giorno=41 → female day=01. Verifica solo gender + decoding
  // (checksum potrebbe richiedere generation tool, qui usiamo CF noto pubblico:
  // Esempio: Anna Rossi nata 15/05/1985 Milano → calcolato manualmente: RSSNNA85E55F205A
  // ma per non garantire checksum esatti hardcoded, uso un CF tested noto pubblico)
  // Skip K (richiederebbe generator) — abbiamo gia' decoding gender M in test E.

  return {
    piva_tests: 4,
    cf_tests: 5,
    validation_tests: 2
  };
}
