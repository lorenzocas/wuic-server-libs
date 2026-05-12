/**
 * SQL helper via sqlcmd per verifiche data-oriented (trigger DB, view aggregate).
 * Per CRUD applicativo usare api-client.mjs (regola 26 AGENTS).
 */
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

const DEFAULT_INSTANCE = 'localhost\\sqlexpress';
const DEFAULT_DATA_DB = 'FlottaMezzi_Data';
const DEFAULT_META_DB = 'FlottaMezzi_Metadata';
const SQL_USER = 'sa';
const SQL_PWD  = 'superlamelauser';

export async function queryOne(sql, db = DEFAULT_DATA_DB) {
  const rows = await query(sql, db);
  return rows[0] || null;
}

export async function query(sql, db = DEFAULT_DATA_DB) {
  const args = [
    '-S', DEFAULT_INSTANCE,
    '-U', SQL_USER, '-P', SQL_PWD,
    '-d', db,
    '-C',
    '-s', '|',
    '-W',
    '-Q', `SET NOCOUNT ON; ${sql}`
  ];
  const { stdout, stderr } = await execFile('sqlcmd', args, { maxBuffer: 10 * 1024 * 1024 });
  if (stderr && stderr.trim()) throw new Error(`sqlcmd stderr: ${stderr}`);
  const lines = stdout.split(/\r?\n/).filter(l =>
    l.trim() &&
    !/^-+\|/.test(l) &&
    !/^-+$/.test(l.trim()) &&
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

export async function exec(sql, db = DEFAULT_DATA_DB) {
  const wrapped =
    'SET ANSI_NULLS ON;\nSET ANSI_PADDING ON;\nSET ANSI_WARNINGS ON;\n' +
    'SET ARITHABORT ON;\nSET CONCAT_NULL_YIELDS_NULL ON;\nSET QUOTED_IDENTIFIER ON;\n' +
    'SET NUMERIC_ROUNDABORT OFF;\nSET NOCOUNT ON;\n' + sql;
  const args = [
    '-S', DEFAULT_INSTANCE,
    '-U', SQL_USER, '-P', SQL_PWD,
    '-d', db, '-C', '-b',
    '-Q', wrapped
  ];
  const { stdout } = await execFile('sqlcmd', args, { maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

export const dbConfig = { DEFAULT_INSTANCE, DEFAULT_DATA_DB, DEFAULT_META_DB };
