import fs from 'fs';
const FILES = [
  ['aging_scadenze', 'C:/src/Wuic/FlottaMezzi/dbms/templates/_dash_aging_scadenze.json'],
  ['costi_forecast', 'C:/src/Wuic/FlottaMezzi/dbms/templates/_dash_costi_forecast.json'],
  ['top_mezzi', 'C:/src/Wuic/FlottaMezzi/dbms/templates/_dash_top_mezzi.json'],
];

const FIELDS_OF_INTEREST = [
  'innerText', 'binding', 'bindingFunction',
  'dataField', 'labelField', 'label', 'datasets', 'sortInfo',
  'titleField', 'infoField', 'description'
];

for (const [name, path] of FILES) {
  console.log(`\n========== ${name} ==========`);
  const c = JSON.parse(fs.readFileSync(path, 'utf8'));
  const findings = [];
  function walk(n, parent = '') {
    if (Array.isArray(n)) { n.forEach((x, i) => walk(x, parent + '[' + i + ']')); return; }
    if (n && typeof n === 'object') {
      if (n.inputs && typeof n.inputs === 'object') {
        for (const k of Object.keys(n.inputs)) {
          if (!FIELDS_OF_INTEREST.includes(k)) continue;
          const v = n.inputs[k];
          if (v == null || v === '') continue;
          findings.push({ path: parent + '.inputs.' + k, value: typeof v === 'string' ? v.slice(0, 200) : JSON.stringify(v).slice(0, 300) });
        }
      }
      for (const k of Object.keys(n)) walk(n[k], parent + '.' + k);
    }
  }
  walk(c);
  findings.forEach(f => console.log(`  ${f.path} = ${f.value}`));
}
