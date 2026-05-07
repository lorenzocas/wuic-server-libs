/**
 * Scaffolding workflow #24: anagrafica unificata (view).
 *
 * 1) login
 * 2) scaffolding.scaffoldView(connection='DataSQLConnection', db='FatturazioneElettronica_Data',
 *    view='vw_anagrafica_unificata', createMenu=false)
 * 3) update _metadati__tabelle.md_display_string + md_long_description
 * 4) update _metadati__colonne.mc_display_string_in_view per ogni colonna (etichette friendly)
 * 5) MetaService.invalidateMetadataRuntime
 *
 * No-Angular-custom: la route renderizza tramite list-grid archetype standard.
 */
import { createBackendApiClient } from '../../KonvergenceCore/wwwroot/my-workspace/playwright/docs/_shared/backend-api-client.mjs';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
const execFile = promisify(execFileCb);

const BACKEND = 'http://localhost:5100';

// Etichette friendly per le colonne della view (ID-COLONNA → DISPLAY)
const COLUMN_LABELS = {
  'id':                'ID',
  'tipo':              'Tipo',
  'cliente_id':        'ID cliente',
  'fornitore_id':      'ID fornitore',
  'codice_cliente':    'Codice cliente',
  'codice_fornitore':  'Codice fornitore',
  'ragione_sociale':   'Ragione sociale',
  'partita_iva':       'Partita IVA',
  'codice_fiscale':    'Codice fiscale',
  'tipo_soggetto':     'Tipo soggetto',
  'indirizzo':         'Indirizzo',
  'cap':               'CAP',
  'citta':             'Citta',
  'provincia':         'Provincia',
  'nazione':           'Nazione',
  'email':             'Email',
  'pec':               'PEC',
  'telefono':          'Telefono'
};

async function sqlMeta(query) {
  const args = [
    '-S', 'localhost\\sqlexpress',
    '-d', 'FatturazioneElettronica_Metadata',
    '-U', 'sa', '-P', 'superlamelauser',
    '-C', '-I', '-W', '-s', '|',
    '-Q', `SET QUOTED_IDENTIFIER ON; SET NOCOUNT ON; ${query}`
  ];
  const { stdout } = await execFile('sqlcmd', args, { maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

async function execMeta(query) {
  const args = [
    '-S', 'localhost\\sqlexpress',
    '-d', 'FatturazioneElettronica_Metadata',
    '-U', 'sa', '-P', 'superlamelauser',
    '-C', '-I',
    '-Q', `SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON; ${query}`
  ];
  await execFile('sqlcmd', args, { maxBuffer: 10 * 1024 * 1024 });
}

async function main() {
  // FE app usa admin_test/Test123! (vedi dispatcher.mjs default user)
  const api = await createBackendApiClient({
    backendBaseUrl: BACKEND,
    user: 'admin_test',
    password: 'Test123!'
  });
  console.log(`✓ login ok (server-managed cookie: ${api.serverManagedCookieMode})`);

  // 1) scaffold view
  // NB: il param 'connection' e' la connection string completa (NON il nome logico).
  // Il nome logico va in 'connName'.
  const dataConn = 'Data Source=localhost\\sqlexpress;Initial Catalog=FatturazioneElettronica_Data;Integrated Security=False;Persist Security Info=True;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True';
  console.log('Scaffolding view vw_anagrafica_unificata...');
  let res;
  try {
    res = await api.call('scaffolding.scaffoldView', {
      connection: dataConn,
      connName: 'DataSQLConnection',
      db: 'FatturazioneElettronica_Data',
      view: 'vw_anagrafica_unificata',
      createMenu: false,
      parentMenuId: 0
    });
    console.log('  scaffoldView ok:', JSON.stringify(res)?.slice(0, 200));
  } catch (e) {
    console.error('scaffoldView error:', e?.message || e);
    process.exit(1);
  }

  // 2) Recupera md_id della tabella metadata appena creata
  const sqlMdId = await sqlMeta(`
    SELECT TOP 1 md_id, mdroutename FROM dbo._metadati__tabelle
    WHERE md_nome_tabella = 'vw_anagrafica_unificata' OR mdroutename = 'vw_anagrafica_unificata'
    ORDER BY md_id DESC;
  `);
  const lines = sqlMdId.split(/\r?\n/).filter(l => l.includes('|') && !l.startsWith('md_id') && !l.startsWith('---'));
  if (lines.length === 0) {
    console.error('Metadati tabella non trovati post-scaffold!');
    process.exit(1);
  }
  const cols = lines[0].split('|').map(c => c.trim());
  const md_id = Number(cols[0]);
  const route = cols[1];
  console.log(`  metadati creati: md_id=${md_id} route="${route}"`);

  // 3) Update display string tabella
  // NB: nomi SQL reali (legacy DB): mm_display_string + mm_long_description
  // (cs prop md_display_string mappa a mm_display_string — regola 25 AGENTS).
  console.log('Update _metadati__tabelle.mm_display_string + mm_long_description...');
  await execMeta(`
    UPDATE dbo._metadati__tabelle
    SET mm_display_string = N'Anagrafica unificata',
        mm_long_description = N'Vista UNION clienti + fornitori. Discriminator tipo: CLIENTE / FORNITORE / ENTRAMBI (matching su P.IVA).'
    WHERE md_id = ${md_id};
  `);
  console.log('  display string aggiornata');

  // 4) Update display labels colonne
  console.log('Update _metadati__colonne.mc_display_string_in_view + ..._in_edit per le colonne...');
  for (const [colName, label] of Object.entries(COLUMN_LABELS)) {
    await execMeta(`
      UPDATE dbo._metadati__colonne
      SET mc_display_string_in_view = N'${label.replace(/'/g, "''")}',
          mc_display_string_in_edit = N'${label.replace(/'/g, "''")}'
      WHERE md_id = ${md_id} AND mc_nome_colonna = '${colName}';
    `);
  }
  console.log(`  ${Object.keys(COLUMN_LABELS).length} colonne aggiornate`);

  // 5) Hide ID columns nella vista list (sono tecnici, l'utente non li vede mai)
  // NB: SQL column reale e' `mchideinlist` (vocali rimosse). cs prop = `mc_hide_in_list`.
  await execMeta(`
    UPDATE dbo._metadati__colonne
    SET mchideinlist = 1
    WHERE md_id = ${md_id}
      AND mc_nome_colonna IN ('id', 'cliente_id', 'fornitore_id');
  `);
  console.log('  hidden cols (id/cliente_id/fornitore_id) in list view');

  // 6) Tipo column: badge style
  // (richiederebbe stili ma li lascio default - basta che si veda)

  // 7) Invalidate metadata runtime
  console.log('Invalidate metadata runtime...');
  const inv = await api.invalidateMetadataRuntime();
  console.log(`  invalidate ok, projectMetadataVersion=${inv?.projectMetadataVersion}`);

  await api.dispose();
  console.log(`\n✓ DONE — anagrafica unificata scaffolded. Route: /#/${route}/list`);
}

main().catch(e => { console.error('FAILED:', e); process.exit(1); });
