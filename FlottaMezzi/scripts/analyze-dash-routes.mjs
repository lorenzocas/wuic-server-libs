import fs from 'fs';
const FILES = [
  ['aging_scadenze', 'C:/src/Wuic/FlottaMezzi/dbms/templates/_dash_aging_scadenze.json'],
  ['costi_forecast', 'C:/src/Wuic/FlottaMezzi/dbms/templates/_dash_costi_forecast.json'],
  ['top_mezzi', 'C:/src/Wuic/FlottaMezzi/dbms/templates/_dash_top_mezzi.json'],
];

for (const [name, path] of FILES) {
  console.log(`\n========== ${name} ==========`);
  const c = JSON.parse(fs.readFileSync(path, 'utf8'));
  function walk(n, parent = '') {
    if (Array.isArray(n)) { n.forEach((x, i) => walk(x, parent + '[' + i + ']')); return; }
    if (n && typeof n === 'object') {
      if (typeof n.tag === 'string' && n.tag.includes('wuic-data-source') && n.inputs?.route) {
        console.log(`  DATASOURCE @ ${parent}: route="${n.inputs.route}"`);
      }
      if (typeof n.tag === 'string' && n.tag.includes('wuic-data-repeater')) {
        console.log(`  DATAREPEATER @ ${parent}: action="${n.inputs?.action}" datasource=${JSON.stringify(n.inputs?.datasource)?.slice(0,80)} dataField="${n.inputs?.dataField||''}" labelField="${n.inputs?.labelField||''}"`);
      }
      for (const k of Object.keys(n)) walk(n[k], parent + '.' + k);
    }
  }
  walk(c);
}
