/**
 * Helper SQL diretto via sqlcmd: usato SOLO per verifiche data-oriented
 * di coerenza che NON sono raggiungibili via API standard
 * (es. controllo che un trigger DB abbia popolato totali, presenza riga
 * in view scadenzario, ecc.). Per le operazioni CRUD applicative usare
 * sempre `api-client.mjs` (regola 26 AGENTS).
 */
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

const DEFAULT_INSTANCE = 'localhost\\sqlexpress';
const DEFAULT_DATA_DB = 'FatturazioneElettronica_Data';
const DEFAULT_META_DB = 'FatturazioneElettronica_Metadata';

/**
 * Esegue una query SQL e ritorna la prima riga come oggetto.
 * @param {string} sql - query SELECT
 * @param {string} db - database (default Data DB dell'app)
 */
export async function queryOne(sql, db = DEFAULT_DATA_DB) {
  const rows = await query(sql, db);
  return rows[0] || null;
}

/**
 * Esegue una query SQL e ritorna array di oggetti.
 */
export async function query(sql, db = DEFAULT_DATA_DB) {
  // Use -W (stripped trailing spaces) + -s "|" (separator) + -h -1 (no header)
  // Column 1 line e' header, righe successive e' data, ultima riga e' rowcount.
  // -W (strip trailing spaces) e' incompatibile con -y/-Y (variable-length output).
  // Usiamo solo -W + -s "|" che e' sufficiente per il parsing column-based.
  const args = [
    '-S', DEFAULT_INSTANCE,
    '-d', db,
    '-C',
    '-s', '|',
    '-W',
    '-Q', `SET NOCOUNT ON; ${sql}`
  ];
  const { stdout, stderr } = await execFile('sqlcmd', args, { maxBuffer: 10 * 1024 * 1024 });
  if (stderr && stderr.trim()) {
    throw new Error(`sqlcmd stderr: ${stderr}`);
  }
  // Filtra: linee vuote, divider multi-col (^---|), divider single-col (^-+ $),
  // riepilogo (^(N righe...)).
  const lines = stdout.split(/\r?\n/).filter(l =>
    l.trim() &&
    !/^-+\|/.test(l) &&            // divider multi-col
    !/^-+$/.test(l.trim()) &&      // divider single-col (es "----")
    !/^\(\d+ righ/.test(l)
  );
  if (lines.length < 1) return [];
  const headers = lines[0].split('|').map(h => h.trim());
  return lines.slice(1).filter(l => l.includes('|') || headers.length === 1).map(line => {
    const cols = line.split('|');
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      const v = (cols[i] ?? '').trim();
      obj[headers[i]] = (v === 'NULL' || v === '') ? null : v;
    }
    return obj;
  });
}

/**
 * Esegue uno statement SQL non-query (INSERT/UPDATE/DELETE/EXEC).
 * Ritorna il numero di righe affette se disponibile.
 */
export async function exec(sql, db = DEFAULT_DATA_DB) {
  // Wrap con SET safe options (regola SQL AGENTS) — alcuni trigger e DDL
  // richiedono QUOTED_IDENTIFIER ON; sqlcmd default ANSI puo' divergere.
  const wrapped =
    'SET ANSI_NULLS ON;\nSET ANSI_PADDING ON;\nSET ANSI_WARNINGS ON;\n' +
    'SET ARITHABORT ON;\nSET CONCAT_NULL_YIELDS_NULL ON;\nSET QUOTED_IDENTIFIER ON;\n' +
    'SET NUMERIC_ROUNDABORT OFF;\nSET NOCOUNT ON;\n' + sql;
  const args = [
    '-S', DEFAULT_INSTANCE,
    '-d', db,
    '-C',
    '-b',
    '-Q', wrapped
  ];
  const { stdout } = await execFile('sqlcmd', args, { maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

export const dbConfig = { DEFAULT_INSTANCE, DEFAULT_DATA_DB, DEFAULT_META_DB };
