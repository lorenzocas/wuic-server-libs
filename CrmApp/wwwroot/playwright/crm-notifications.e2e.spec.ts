import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

type ConnInfo = {
  server: string;
  database: string;
  userId: string;
  password: string;
  integratedSecurity: boolean;
};

const USER_ID = 100275;
const MESSAGE_PREFIX = 'E2E_CRM_NOTIFICATION';

function parseConnectionString(connection: string): ConnInfo {
  const map = new Map<string, string>();
  for (const segment of String(connection || '').split(';')) {
    const idx = segment.indexOf('=');
    if (idx <= 0) continue;
    map.set(segment.substring(0, idx).trim().toLowerCase(), segment.substring(idx + 1).trim());
  }

  const server = map.get('data source') || map.get('server') || map.get('address') || '';
  const database = map.get('initial catalog') || map.get('database') || '';
  const userId = map.get('user id') || map.get('uid') || '';
  const password = map.get('password') || map.get('pwd') || '';
  const integratedRaw = (map.get('integrated security') || '').toLowerCase();
  const integratedSecurity = integratedRaw === 'true' || integratedRaw === 'sspi';

  if (!server || !database) {
    throw new Error('DataSQLConnection non valida: server/database mancanti.');
  }

  return { server, database, userId, password, integratedSecurity };
}

function loadConnection(): ConnInfo {
  const appsettingsPath = path.resolve(__dirname, '..', '..', 'appsettings.json');
  const json = JSON.parse(readFileSync(appsettingsPath, 'utf8'));
  const rawConn = String(json?.ConnectionStrings?.DataSQLConnection || '');
  if (!rawConn) {
    throw new Error('ConnectionStrings.DataSQLConnection mancante in appsettings.json');
  }

  return parseConnectionString(rawConn);
}

function runSql(query: string): string {
  const conn = loadConnection();
  const normalizedQuery =
    'SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON; SET NUMERIC_ROUNDABORT OFF; ' + query;

  const args = ['-S', conn.server, '-d', conn.database, '-C', '-I', '-b', '-W', '-h', '-1', '-Q', normalizedQuery];

  if (conn.integratedSecurity) {
    args.splice(2, 0, '-E');
  } else {
    args.splice(2, 0, '-U', conn.userId, '-P', conn.password);
  }

  return execFileSync('sqlcmd', args, { encoding: 'utf8' });
}

function ensureNotificationsSchema(): void {
  const check = runSql("SET NOCOUNT ON; SELECT IIF(OBJECT_ID('dbo.crm_notifications','U') IS NULL, 0, 1);");
  if (!/\b1\b/.test(check)) {
    throw new Error('Tabella dbo.crm_notifications non trovata. Applica prima setup-crm-notifications.sql');
  }
}

function insertNotification(message: string): number {
  const escapedMessage = message.replace(/'/g, "''");
  const sql = `
SET NOCOUNT ON;
INSERT INTO dbo.crm_notifications(user_id, [type], [message], entity_type, entity_id, is_read, created_at)
VALUES (${USER_ID}, 'e2e', N'${escapedMessage}', 'lead', 1, 0, SYSUTCDATETIME());
SELECT CAST(SCOPE_IDENTITY() AS INT) AS inserted_id;`;

  const output = runSql(sql);
  const numbers = output.match(/\d+/g) ?? [];
  const id = Number(numbers.length ? numbers[numbers.length - 1] : 0);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`Impossibile leggere notification_id da output sqlcmd: ${output}`);
  }

  return id;
}

function deleteNotification(id: number): void {
  if (!id || id <= 0) return;
  runSql(`DELETE FROM dbo.crm_notifications WHERE notification_id = ${id};`);
}

function deleteE2eByPrefix(): void {
  runSql(`DELETE FROM dbo.crm_notifications WHERE [message] LIKE '${MESSAGE_PREFIX}%';`);
}

function buildKUserCookieValue(): string {
  const payload = {
    user_id: USER_ID,
    user_name: 'admin',
    display_name: 'admin',
    role: 'Admin',
    role_id: 1,
    isAdmin: true,
    lingua: { id: 'it-IT', lingua: 'IT' }
  };
  return encodeURIComponent(JSON.stringify(payload));
}

test.describe('CRM notifications realtime', () => {
  test('shows seeded notification and receives live websocket push', async ({ page, context }) => {
    ensureNotificationsSchema();
    deleteE2eByPrefix();

    const initialMessage = `${MESSAGE_PREFIX}_INITIAL_${Date.now()}`;
    const realtimeMessage = `${MESSAGE_PREFIX}_REALTIME_${Date.now()}`;

    const initialId = insertNotification(initialMessage);
    let realtimeId = 0;

    try {
      await context.addCookies([
        {
          name: 'k-user',
          value: buildKUserCookieValue(),
          url: 'http://localhost:4200'
        }
      ]);

      await page.goto('/#/crm_opportunities/list');
      await page.waitForSelector('.notification-btn', { timeout: 20_000 });

      await page.click('.notification-btn');
      await expect(page.locator('.notification-item-message', { hasText: initialMessage })).toBeVisible();

      await page.keyboard.press('Escape');

      realtimeId = insertNotification(realtimeMessage);

      await page.click('.notification-btn');
      await expect(page.locator('.notification-item-message', { hasText: realtimeMessage })).toBeVisible({ timeout: 20_000 });
    } finally {
      deleteNotification(initialId);
      deleteNotification(realtimeId);
      deleteE2eByPrefix();
    }
  });
});
