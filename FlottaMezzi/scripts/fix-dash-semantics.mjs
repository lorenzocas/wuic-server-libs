import fs from 'fs';
import { execSync } from 'child_process';

// ----- Patch helpers -----
function setInput(node, key, value) { node.inputs ??= {}; node.inputs[key] = value; }
function setRouteOnDS(boardArr, dsPath, route) {
  // dsPath is like "[0].nestedComponents[1]...nestedComponents[1]"
  const node = resolvePath(boardArr, dsPath);
  if (!node) throw new Error(`No node @ ${dsPath}`);
  setInput(node, 'route', route);
}
function resolvePath(root, p) {
  // path like "[0].nestedComponents[1]..."
  const parts = [];
  let s = p; let i = 0;
  while (i < s.length) {
    if (s[i] === '[') { const j = s.indexOf(']', i); parts.push({ idx: parseInt(s.slice(i + 1, j)) }); i = j + 1; }
    else if (s[i] === '.') i++;
    else { const j = (() => { let k = i; while (k < s.length && s[k] !== '.' && s[k] !== '[') k++; return k; })(); parts.push({ key: s.slice(i, j) }); i = j; }
  }
  let cur = root;
  for (const part of parts) {
    if (cur == null) return null;
    if ('idx' in part) cur = cur[part.idx];
    else cur = cur[part.key];
  }
  return cur;
}

// ----- KPI binding-function helpers -----
// All KPI tiles share the structure: nestedComponents[0]=label_span, nestedComponents[2]=value_span (databound)
// label_span.inputs.innerText = "label" (static)
// value_span.inputs.bindingFunction = JS code that uses resultInfo.dato + sets inputs.innerText/color/backgroundColor

function patchKpiTile(boardArr, kpiTilePath, label, bindingFn) {
  // kpiTilePath is the path of the KPI sub-table (e.g. "[0].nestedComponents[1].nestedComponents[0].nestedComponents[0]")
  // Inside it: nestedComponents[0] = label SPAN, nestedComponents[2] = value SPAN
  const parent = resolvePath(boardArr, kpiTilePath);
  if (!parent || !parent.nestedComponents) throw new Error(`No KPI parent @ ${kpiTilePath}`);
  const labelSpan = parent.nestedComponents[0];
  const valueSpan = parent.nestedComponents[2];
  if (labelSpan?.inputs) labelSpan.inputs.innerText = label;
  if (valueSpan?.inputs) valueSpan.inputs.bindingFunction = bindingFn;
}

function setTitle(boardArr, titleTilePath, text) {
  const node = resolvePath(boardArr, titleTilePath);
  if (node?.inputs) node.inputs.innerText = text;
}

// ====== DASHBOARD-SPECIFIC PATCHES ======

// ---- aging_scadenze ----
function patchAgingScadenze(arr) {
  setTitle(arr, '[0].nestedComponents[0].nestedComponents[0].nestedComponents[0]', 'Aging scadenze flotta');

  // KPI 1 — "Documenti monitorati"
  patchKpiTile(arr, '[0].nestedComponents[1].nestedComponents[0].nestedComponents[0]',
    'Documenti monitorati',
    `var d=resultInfo&&resultInfo.dato||[]; var tot=d.reduce(function(s,r){return s+Number(r.num_scadenze||0);},0); inputs.innerText=String(tot); inputs.color='#0f172a'; inputs.fontSize='28px';`
  );

  // KPI 2 — "Scaduti"
  patchKpiTile(arr, '[0].nestedComponents[1].nestedComponents[1].nestedComponents[0]',
    'Documenti scaduti',
    `var d=resultInfo&&resultInfo.dato||[]; var s=d.filter(function(r){return String(r.fascia||'').toUpperCase()==='SCADUTO';}).reduce(function(a,r){return a+Number(r.num_scadenze||0);},0); inputs.innerText=String(s); inputs.color=s>0?'#b91c1c':'#16a34a'; inputs.fontSize='28px';`
  );

  // KPI 3 — "% scaduti"
  patchKpiTile(arr, '[0].nestedComponents[1].nestedComponents[2].nestedComponents[0]',
    '% scaduti su totale',
    `var d=resultInfo&&resultInfo.dato||[]; var tot=d.reduce(function(s,r){return s+Number(r.num_scadenze||0);},0); var sc=d.filter(function(r){return String(r.fascia||'').toUpperCase()==='SCADUTO';}).reduce(function(a,r){return a+Number(r.num_scadenze||0);},0); var p=tot>0?(sc*100/tot):0; inputs.innerText=p.toFixed(1)+' %'; inputs.color=p<=10?'#16a34a':(p<=25?'#ea580c':'#b91c1c'); inputs.fontSize='28px';`
  );

  // KPI 4 — "Stato"
  patchKpiTile(arr, '[0].nestedComponents[1].nestedComponents[3].nestedComponents[0]',
    'Stato',
    `var d=resultInfo&&resultInfo.dato||[]; var tot=d.reduce(function(s,r){return s+Number(r.num_scadenze||0);},0); var sc=d.filter(function(r){return String(r.fascia||'').toUpperCase()==='SCADUTO';}).reduce(function(a,r){return a+Number(r.num_scadenze||0);},0); var p=tot>0?(sc*100/tot):0; var st=p<=10?'OK':(p<=25?'ATTENZIONE':'CRITICO'); inputs.innerText=st; inputs.backgroundColor=st==='OK'?'#dcfce7':(st==='ATTENZIONE'?'#fef3c7':'#fee2e2'); inputs.color=st==='OK'?'#15803d':(st==='ATTENZIONE'?'#a16207':'#991b1b'); inputs.fontSize='22px';`
  );

  // Chart: change route from vw_aging_scadenze to vw_aging_scadenze_per_fascia (which has mdpropsbag.archetypes.chart)
  setRouteOnDS(arr, '[0].nestedComponents[2].nestedComponents[0].nestedComponents[0].nestedComponents[1]', 'vw_aging_scadenze_per_fascia');
  setTitle(arr, '[0].nestedComponents[2].nestedComponents[0].nestedComponents[0].nestedComponents[0]', 'Scadenze per fascia');

  // List: title only
  setTitle(arr, '[0].nestedComponents[3].nestedComponents[0].nestedComponents[0].nestedComponents[0]', 'Dettaglio scadenze');
}

// ---- costi_forecast ----
function patchCostiForecast(arr) {
  setTitle(arr, '[0].nestedComponents[0].nestedComponents[0].nestedComponents[0]', 'Costi flotta — storico e forecast');

  // KPI tiles — change route from vw_costi_forecast to vw_costi_storici_mensili (richer dataset)
  for (let i = 0; i < 4; i++) {
    setRouteOnDS(arr, `[0].nestedComponents[1].nestedComponents[${i}].nestedComponents[0].nestedComponents[1]`, 'vw_costi_storici_mensili');
  }

  // KPI 1 — Costo medio mensile
  patchKpiTile(arr, '[0].nestedComponents[1].nestedComponents[0].nestedComponents[0]',
    'Costo medio mensile',
    `var fmt=function(n){return Number(n||0).toLocaleString('it-IT',{minimumFractionDigits:0,maximumFractionDigits:0})+' €';}; var d=resultInfo&&resultInfo.dato||[]; if(!d.length){inputs.innerText='—';return;} var sums={}; d.forEach(function(r){var k=String(r.anno)+'-'+String(r.mese); sums[k]=(sums[k]||0)+Number(r.totale||0);}); var keys=Object.keys(sums); var avg=keys.length>0?keys.reduce(function(a,k){return a+sums[k];},0)/keys.length:0; inputs.innerText=fmt(avg); inputs.color='#0f172a'; inputs.fontSize='24px';`
  );

  // KPI 2 — Costo totale storico
  patchKpiTile(arr, '[0].nestedComponents[1].nestedComponents[1].nestedComponents[0]',
    'Costo totale storico',
    `var fmt=function(n){return Number(n||0).toLocaleString('it-IT',{minimumFractionDigits:0,maximumFractionDigits:0})+' €';}; var d=resultInfo&&resultInfo.dato||[]; var s=d.reduce(function(a,r){return a+Number(r.totale||0);},0); inputs.innerText=fmt(s); inputs.color='#0f172a'; inputs.fontSize='24px';`
  );

  // KPI 3 — Mese piu' costoso
  patchKpiTile(arr, '[0].nestedComponents[1].nestedComponents[2].nestedComponents[0]',
    "Mese piu' costoso",
    `var fmt=function(n){return Number(n||0).toLocaleString('it-IT',{minimumFractionDigits:0,maximumFractionDigits:0})+' €';}; var d=resultInfo&&resultInfo.dato||[]; if(!d.length){inputs.innerText='—';return;} var sums={}; d.forEach(function(r){var k=String(r.anno)+'-'+String(r.mese).padStart(2,'0'); sums[k]=(sums[k]||0)+Number(r.totale||0);}); var keys=Object.keys(sums); var top=keys.reduce(function(b,k){return sums[k]>sums[b]?k:b;},keys[0]); inputs.innerText=top+' ('+fmt(sums[top])+')'; inputs.color='#b91c1c'; inputs.fontSize='18px';`
  );

  // KPI 4 — Categoria principale
  patchKpiTile(arr, '[0].nestedComponents[1].nestedComponents[3].nestedComponents[0]',
    'Categoria principale',
    `var d=resultInfo&&resultInfo.dato||[]; if(!d.length){inputs.innerText='—';return;} var sums={}; d.forEach(function(r){var c=String(r.categoria||'?'); sums[c]=(sums[c]||0)+Number(r.totale||0);}); var cats=Object.keys(sums); var top=cats.reduce(function(b,c){return sums[c]>sums[b]?c:b;},cats[0]); inputs.innerText=top; inputs.color='#0f172a'; inputs.fontSize='22px'; inputs.backgroundColor='#f1f5f9';`
  );

  // Chart title
  setTitle(arr, '[0].nestedComponents[2].nestedComponents[0].nestedComponents[0].nestedComponents[0]', 'Andamento costi mensili');
  // List title
  setTitle(arr, '[0].nestedComponents[3].nestedComponents[0].nestedComponents[0].nestedComponents[0]', 'Movimenti mensili per categoria');
}

// ---- top_mezzi ----
function patchTopMezzi(arr) {
  setTitle(arr, '[0].nestedComponents[0].nestedComponents[0].nestedComponents[0]', 'Top mezzi per costo');

  // KPI tiles — change route from vw_top_mezzi_per_km to vw_top_mezzi_per_costo
  for (let i = 0; i < 4; i++) {
    setRouteOnDS(arr, `[0].nestedComponents[1].nestedComponents[${i}].nestedComponents[0].nestedComponents[1]`, 'vw_top_mezzi_per_costo');
  }

  // KPI 1 — Mezzo piu' costoso (targa)
  patchKpiTile(arr, '[0].nestedComponents[1].nestedComponents[0].nestedComponents[0]',
    "Mezzo piu' costoso",
    `var d=resultInfo&&resultInfo.dato||[]; if(!d.length){inputs.innerText='—';return;} var top=d.slice().sort(function(a,b){return Number(b.totale_costi||0)-Number(a.totale_costi||0);})[0]; inputs.innerText=String(top.targa||'—'); inputs.color='#0f172a'; inputs.fontSize='24px';`
  );

  // KPI 2 — Costo top 1
  patchKpiTile(arr, '[0].nestedComponents[1].nestedComponents[1].nestedComponents[0]',
    'Costo top 1',
    `var fmt=function(n){return Number(n||0).toLocaleString('it-IT',{minimumFractionDigits:0,maximumFractionDigits:0})+' €';}; var d=resultInfo&&resultInfo.dato||[]; if(!d.length){inputs.innerText='—';return;} var top=d.slice().sort(function(a,b){return Number(b.totale_costi||0)-Number(a.totale_costi||0);})[0]; inputs.innerText=fmt(top.totale_costi); inputs.color='#b91c1c'; inputs.fontSize='24px';`
  );

  // KPI 3 — Costo totale top mezzi
  patchKpiTile(arr, '[0].nestedComponents[1].nestedComponents[2].nestedComponents[0]',
    'Costo totale flotta',
    `var fmt=function(n){return Number(n||0).toLocaleString('it-IT',{minimumFractionDigits:0,maximumFractionDigits:0})+' €';}; var d=resultInfo&&resultInfo.dato||[]; var s=d.reduce(function(a,r){return a+Number(r.totale_costi||0);},0); inputs.innerText=fmt(s); inputs.color='#0f172a'; inputs.fontSize='24px';`
  );

  // KPI 4 — N. mezzi monitorati
  patchKpiTile(arr, '[0].nestedComponents[1].nestedComponents[3].nestedComponents[0]',
    'N. mezzi monitorati',
    `var d=resultInfo&&resultInfo.dato||[]; inputs.innerText=String(d.length); inputs.color='#0f172a'; inputs.fontSize='28px';`
  );

  // Chart title
  setTitle(arr, '[0].nestedComponents[2].nestedComponents[0].nestedComponents[0].nestedComponents[0]', 'Top mezzi per costo');
  // List title
  setTitle(arr, '[0].nestedComponents[3].nestedComponents[0].nestedComponents[0].nestedComponents[0]', 'Dettaglio top mezzi');
}

// ----- Apply -----
const PATCHES = {
  aging_scadenze: patchAgingScadenze,
  costi_forecast: patchCostiForecast,
  top_mezzi: patchTopMezzi,
};

for (const [route, patcher] of Object.entries(PATCHES)) {
  const file = `C:/src/Wuic/FlottaMezzi/dbms/templates/_dash_${route}.json`;
  const arr = JSON.parse(fs.readFileSync(file, 'utf8'));
  patcher(arr);
  const json = JSON.stringify(arr);
  const patchedFile = `C:/src/Wuic/FlottaMezzi/dbms/templates/_dash_${route}_patched.json`;
  fs.writeFileSync(patchedFile, json);
  // Build a SQL script that loads the JSON via :r style is awkward; instead use a parametrised update via a temp .sql with the JSON inlined (needs escaping).
  // We use a different approach: write a .sql with PowerShell here-string + UPDATE, run via sqlcmd.
  const updateScript = `C:/src/Wuic/FlottaMezzi/scripts/_apply_${route}.ps1`;
  const ps1 = `
$ErrorActionPreference='Stop'
$json = [System.IO.File]::ReadAllText('${patchedFile}')
Add-Type -AssemblyName System.Data
$conn = New-Object System.Data.SqlClient.SqlConnection 'Data Source=localhost\\sqlexpress;Initial Catalog=FlottaMezzi_Metadata;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True'
$conn.Open()
$cmd = $conn.CreateCommand()
$cmd.CommandText = 'UPDATE dom_board SET boardcontent = @j WHERE boardroute = @r'
[void]$cmd.Parameters.AddWithValue('@j', $json)
[void]$cmd.Parameters.AddWithValue('@r', '${route}')
$rows = $cmd.ExecuteNonQuery()
$conn.Close()
Write-Host "rows: $rows"
`;
  fs.writeFileSync(updateScript, ps1);
  const out = execSync(`pwsh -ExecutionPolicy Bypass -File "${updateScript}"`, { encoding: 'utf8' });
  console.log(`patched ${route}: ${json.length} bytes -> ${out.trim()}`);
}
console.log('done');
