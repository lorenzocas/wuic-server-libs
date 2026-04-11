import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createE2ESession } from '../../../KonvergenceCore/wwwroot/my-workspace/playwright/docs/_shared/backend-api-client.mjs';

const args = new Set(process.argv.slice(2));
const strictMode = args.has('--strict');
const includeDocsRoutes = !args.has('--no-doc-routes');
const e2eUser = process.env.WUIC_E2E_USER || 'wuic_e2e_admin';
const e2ePassword = process.env.WUIC_E2E_PASSWORD || 'E2E_Admin123!';
const baseUrl = process.env.BASE_URL || 'http://localhost:4200';
const backendBaseUrl = process.env.BACKEND_BASE_URL || 'http://localhost:5000';
const styleRoot = process.env.STYLE_ROOT || path.resolve('lib-src');
const outputDir = path.resolve('e2e-artifacts', 'ngdeep-selector-compat');
const profileConfigPath = process.env.NGDEEP_PROFILE_CONFIG || path.resolve('e2e', 'ngdeep-selector-profiles.json');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsPlaywrightRoot =
  process.env.DOCS_PLAYWRIGHT_ROOT
  || path.resolve(__dirname, '../../../KonvergenceCore/wwwroot/my-workspace/playwright/docs');
const strictPolicies = String(process.env.STRICT_POLICIES || 'required')
  .split(',')
  .map((x) => x.trim().toLowerCase())
  .filter(Boolean);

const POLICY_RANK = {
  optional: 1,
  stateful: 2,
  required: 3
};

const defaultProfileConfig = {
  includeFrameworkDocsRoutes: true,
  profiles: [
    { route: '#/cities-list-grid', tags: ['list-grid', 'filter-bar'], waitForAny: ['wuic-list-grid'] },
    { route: '#/cities-chart', tags: ['chart-list'] },
    { route: '#/schedules-scheduler', tags: ['scheduler-list'] },
    { route: '#/cities-map', tags: ['map-list'] },
    { route: '#/uploadsample-carousel', tags: ['carousel-list'] },
    { route: '#/cities-spreadsheet', tags: ['spreadsheet-list'] },
    { route: '#/kanban-task', tags: ['kanban-list'] },
    { route: '#/tree-sample', tags: ['tree-list'] },
    { route: '#/cities-edit', tags: ['bounded-repeater', 'field-widget'] },
    { route: '#/cities-wizard', tags: ['wizard'] },
    { route: '#/cities-data-repeater-events', tags: ['datarepeater'] },
    { route: '#/custom-cities-list', tags: ['list-grid'] },
    { route: '#/rag-chatbot-demo', tags: ['rag-chatbot'] },
    { route: '#/framework-docs/getting-started', tags: ['framework-docs'] },
    { route: '#/framework-docs/list-grid', tags: ['list-grid', 'filter-bar'] },
    { route: '#/framework-docs/spreadsheet-list', tags: ['spreadsheet-list'] },
    { route: '#/framework-docs/carousel-list', tags: ['carousel-list'] },
    { route: '#/framework-docs/scheduler-list', tags: ['scheduler-list'] },
    { route: '#/framework-docs/tree-list', tags: ['tree-list'] },
    { route: '#/framework-docs/map-list', tags: ['map-list'] },
    { route: '#/framework-docs/datarepeater', tags: ['datarepeater'] },
    { route: '#/framework-docs/filter-bar', tags: ['filter-bar'] },
    { route: '#/framework-docs/pivot-builder', tags: ['pivot-builder'] },
    { route: '#/framework-docs/workflow-designer', tags: ['workflow-designer'] },
    { route: '#/framework-docs/designer', tags: ['designer'] },
    { route: '#/framework-docs/field-widget-code-editor', tags: ['code-editor'] },
    { route: '#/framework-docs/field-widget-dictionary', tags: ['dictionary-editor'] },
    { route: '#/framework-docs/field-widget-others', tags: ['field-widget'] },
    { route: '#/framework-docs/themes', tags: ['themes'] }
  ],
  sourcePolicies: [
    { match: '/component/list-grid/', policy: 'required', tags: ['list-grid'] },
    { match: '/component/filter-bar/', policy: 'required', tags: ['filter-bar'] },
    { match: '/component/chart-list/', policy: 'required', tags: ['chart-list'] },
    { match: '/component/scheduler-list/', policy: 'required', tags: ['scheduler-list'] },
    { match: '/component/map-list/', policy: 'required', tags: ['map-list'] },
    { match: '/component/carousel-list/', policy: 'required', tags: ['carousel-list'] },
    { match: '/component/spreadsheet-list/', policy: 'required', tags: ['spreadsheet-list'] },
    { match: '/component/kanban-list/', policy: 'required', tags: ['kanban-list'] },
    { match: '/component/tree-list/', policy: 'required', tags: ['tree-list'] },
    { match: '/component/data-repeater/', policy: 'required', tags: ['datarepeater'] },
    { match: '/component/pivot-builder/', policy: 'required', tags: ['pivot-builder'] },
    { match: '/component/workflow-designer/', policy: 'required', tags: ['workflow-designer'] },
    { match: '/component/designer/', policy: 'required', tags: ['designer'] },
    { match: '/component/framework-docs/', policy: 'required', tags: ['framework-docs'] },
    { match: '/component/field/', policy: 'stateful', tags: ['field-widget'] },
    { match: '/component/code-editor/', policy: 'stateful', tags: ['code-editor'] },
    { match: '/component/metadata-editor/', policy: 'stateful', tags: ['metadata-editor'] },
    { match: '/component/report-designer/', policy: 'stateful', tags: ['report-designer'] },
    { match: '/component/lookup-table/', policy: 'stateful', tags: ['lookup-table'] },
    { match: '/component/import-dialog/', policy: 'optional', tags: ['import'] }
  ]
};

function normalizeHashRoute(linkRoute) {
  const raw = String(linkRoute || '').trim();
  if (!raw) return '#/';
  if (raw.startsWith('#/')) return raw;
  if (raw.startsWith('/#/')) return raw.slice(1);
  if (raw.startsWith('/')) return `#${raw}`;
  return `#/${raw}`;
}

async function loadProfileConfig(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      includeFrameworkDocsRoutes:
        parsed?.includeFrameworkDocsRoutes ?? defaultProfileConfig.includeFrameworkDocsRoutes,
      profiles: Array.isArray(parsed?.profiles) ? parsed.profiles : defaultProfileConfig.profiles,
      sourcePolicies: Array.isArray(parsed?.sourcePolicies) ? parsed.sourcePolicies : defaultProfileConfig.sourcePolicies
    };
  } catch {
    return defaultProfileConfig;
  }
}

async function listFrameworkDocRoutes(rootDir) {
  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
      .filter((entry) => entry.name !== 'import')
      .map((entry) => ({
        route: `#/framework-docs/${entry.name}`,
        tags: [entry.name]
      }));
  } catch {
    return [];
  }
}

function mergeProfiles(baseProfiles, extraProfiles) {
  const seen = new Set();
  const out = [];
  for (const raw of [...baseProfiles, ...extraProfiles]) {
    if (!raw || !raw.route) continue;
    const route = normalizeHashRoute(raw.route);
    if (seen.has(route)) continue;
    seen.add(route);
    out.push({
      route,
      tags: Array.isArray(raw.tags) ? raw.tags.map((x) => String(x).toLowerCase()) : [],
      waitForAny: Array.isArray(raw.waitForAny) ? raw.waitForAny : [],
      waitAfterMs: Number(raw.waitAfterMs) > 0 ? Number(raw.waitAfterMs) : 900,
      actions: Array.isArray(raw.actions) ? raw.actions : []
    });
  }
  return out;
}

async function listStyleFiles(rootDir) {
  const files = [];

  async function walk(curr) {
    const entries = await fs.readdir(curr, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(curr, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name.endsWith('.css') || entry.name.endsWith('.scss')) {
        files.push(full);
      }
    }
  }

  await walk(rootDir);
  return files;
}

function cleanSelector(selector) {
  return selector
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\*\/\s*/g, ' ')
    // Remove Angular scoping pseudo-selectors; they are not valid for document.querySelectorAll.
    .replace(/:host-context\(([^)]+)\)/g, '$1')
    .replace(/:host\(([^)]+)\)/g, '$1')
    .replace(/:host\b/g, '')
    .replace(/::ng-deep\b/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([>+~])\s*/g, ' $1 ')
    .trim();
}

function splitSelectors(selectorListRaw) {
  const out = [];
  let buf = '';
  let paren = 0;
  let bracket = 0;
  let quote = '';

  for (let i = 0; i < selectorListRaw.length; i += 1) {
    const ch = selectorListRaw[i];
    const prev = i > 0 ? selectorListRaw[i - 1] : '';

    if (quote) {
      buf += ch;
      if (ch === quote && prev !== '\\') {
        quote = '';
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }

    if (ch === '(') paren += 1;
    if (ch === ')') paren = Math.max(0, paren - 1);
    if (ch === '[') bracket += 1;
    if (ch === ']') bracket = Math.max(0, bracket - 1);

    if (ch === ',' && paren === 0 && bracket === 0) {
      const cleaned = cleanSelector(buf);
      if (cleaned) out.push(cleaned);
      buf = '';
      continue;
    }

    buf += ch;
  }

  const cleaned = cleanSelector(buf);
  if (cleaned) out.push(cleaned);
  return out;
}

function extractNgDeepSelectors(content) {
  const selectors = [];
  const regex = /::ng-deep\s+([^{}]+)\{/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const list = String(match[1] || '').trim();
    if (!list) continue;
    for (const selector of splitSelectors(list)) {
      selectors.push(selector);
    }
  }

  return selectors;
}

function makeAbsoluteUrl(hashRoute) {
  if (hashRoute.startsWith('#/')) return `${baseUrl}/${hashRoute}`;
  if (hashRoute.startsWith('/#/')) return `${baseUrl}${hashRoute}`;
  return `${baseUrl}/#/${hashRoute.replace(/^\/+/, '')}`;
}

function isFrameworkDocsRoute(route) {
  return String(route || '').startsWith('#/framework-docs/');
}

async function loginIfNeeded(page) {
  await page.waitForTimeout(1200);
  const user = page.locator('#wuicAuthUser, input[placeholder=\"Username\"], input[name=\"username\"]');
  const pass = page.locator('#wuicAuthPwd, input[placeholder=\"Password\"], input[name=\"password\"]');
  if ((await user.count()) === 0 || (await pass.count()) === 0) {
    return false;
  }
  const userVisible = await user.first().isVisible().catch(() => false);
  if (!userVisible) return false;

  await user.first().fill(e2eUser);
  await pass.first().fill(e2ePassword);
  const loginButton = page.locator('button:has-text(\"Login\"), .wuic-auth-form-login .wuic-auth-btn-primary').first();
  if (await loginButton.count()) {
    await loginButton.click({ force: true, timeout: 15_000 });
  } else {
    await pass.first().press('Enter');
  }
  await page.waitForTimeout(2200);
  return true;
}

function normalizePolicy(policy) {
  const p = String(policy || '').toLowerCase();
  if (p === 'required' || p === 'stateful' || p === 'optional') {
    return p;
  }
  return 'required';
}

function weakerPolicy(a, b) {
  const pa = normalizePolicy(a);
  const pb = normalizePolicy(b);
  return POLICY_RANK[pa] <= POLICY_RANK[pb] ? pa : pb;
}

function inferPolicyFromSelector(selector) {
  const s = String(selector || '').toLowerCase();
  if (
    s.includes(':has(')
    || s.includes(':where(')
    || s.includes(':is(')
    || s.includes('[data-theme')
    || s.includes('.theme-dark')
    || s.includes('::before')
    || s.includes('::after')
    || s.includes(':hover')
    || s.includes(':focus')
    || s.includes(':active')
    || s.includes(':disabled')
    || s.includes(':checked')
    || s.includes('.p-dialog')
    || s.includes('.p-menu')
    || s.includes('.p-contextmenu')
    || s.includes('.p-overlay')
    || s.includes('.monaco-editor')
    || s.includes('.jss_')
  ) {
    return 'stateful';
  }
  return null;
}

function classifySourceFile(sourceFile, sourcePolicies) {
  const normalized = String(sourceFile || '').replace(/\\/g, '/').toLowerCase();
  for (const rule of sourcePolicies) {
    const match = String(rule?.match || '').replace(/\\/g, '/').toLowerCase();
    if (!match) continue;
    if (normalized.includes(match)) {
      return {
        policy: normalizePolicy(rule.policy || 'required'),
        tags: Array.isArray(rule.tags) ? rule.tags.map((x) => String(x).toLowerCase()) : []
      };
    }
  }
  return { policy: 'required', tags: [] };
}

async function applyThemeState(page, mode) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (mode === 'dark') {
        await page.evaluate(() => {
          document.documentElement.classList.add('theme-dark');
          document.body?.classList?.add('theme-dark');
          document.documentElement.setAttribute('data-theme', 'dark');
          document.body?.setAttribute?.('data-theme', 'dark');
        });
      } else {
        await page.evaluate(() => {
          document.documentElement.classList.remove('theme-dark');
          document.body?.classList?.remove('theme-dark');
          document.documentElement.removeAttribute('data-theme');
          document.body?.removeAttribute?.('data-theme');
        });
      }
      return;
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (!msg.includes('Execution context was destroyed') || attempt >= 2) {
        throw err;
      }
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForTimeout(200);
    }
  }
}

async function runProfileActions(page, profile, actionLog) {
  for (const action of profile.actions) {
    const type = String(action?.type || '').trim();
    try {
      if (type === 'wait') {
        await page.waitForTimeout(Math.max(0, Number(action?.ms) || 0));
        actionLog.push({ type, ok: true });
        continue;
      }

      if (type === 'clickIfExists') {
        const selector = String(action?.selector || '');
        const index = Number(action?.index) >= 0 ? Number(action.index) : 0;
        const timeoutMs = Number(action?.timeoutMs) > 0 ? Number(action.timeoutMs) : 1500;
        const loc = page.locator(selector);
        if ((await loc.count()) > index) {
          await loc.nth(index).click({ timeout: timeoutMs, force: true });
          actionLog.push({ type, selector, ok: true });
        } else {
          actionLog.push({ type, selector, ok: false, skipped: true });
        }
        continue;
      }

      if (type === 'clickAllIfExists') {
        const selector = String(action?.selector || '');
        const max = Number(action?.max) > 0 ? Number(action.max) : 1;
        const timeoutMs = Number(action?.timeoutMs) > 0 ? Number(action.timeoutMs) : 1500;
        const loc = page.locator(selector);
        const count = Math.min(await loc.count(), max);
        for (let i = 0; i < count; i += 1) {
          await loc.nth(i).click({ timeout: timeoutMs, force: true }).catch(() => {});
        }
        actionLog.push({ type, selector, ok: count > 0, count });
        continue;
      }

      if (type === 'hoverIfExists') {
        const selector = String(action?.selector || '');
        const loc = page.locator(selector);
        if ((await loc.count()) > 0) {
          await loc.first().hover({ timeout: Number(action?.timeoutMs) || 1500 });
          actionLog.push({ type, selector, ok: true });
        } else {
          actionLog.push({ type, selector, ok: false, skipped: true });
        }
        continue;
      }

      if (type === 'rightClickIfExists') {
        const selector = String(action?.selector || '');
        const index = Number(action?.index) >= 0 ? Number(action.index) : 0;
        const loc = page.locator(selector);
        if ((await loc.count()) > index) {
          await loc.nth(index).click({
            button: 'right',
            force: true,
            timeout: Number(action?.timeoutMs) || 1500
          });
          actionLog.push({ type, selector, ok: true });
        } else {
          actionLog.push({ type, selector, ok: false, skipped: true });
        }
        continue;
      }

      if (type === 'pressIfExists') {
        const selector = String(action?.selector || '');
        const key = String(action?.key || 'Enter');
        const loc = page.locator(selector);
        if ((await loc.count()) > 0) {
          await loc.first().press(key, { timeout: Number(action?.timeoutMs) || 1500 });
          actionLog.push({ type, selector, key, ok: true });
        } else {
          actionLog.push({ type, selector, key, ok: false, skipped: true });
        }
      }
    } catch (err) {
      actionLog.push({
        type,
        ok: false,
        error: String(err?.message || err || 'action failed')
      });
    }
  }
}

async function scanSelectorsOnPage(page, selectors) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.evaluate((innerSelectors) => {
        const out = {};
        for (const sel of innerSelectors) {
          try {
            out[sel] = { count: document.querySelectorAll(sel).length };
          } catch (err) {
            out[sel] = { error: String(err?.message || err || 'Invalid selector') };
          }
        }
        return out;
      }, selectors);
    } catch (err) {
      const msg = String(err?.message || err || '');
      const isDestroyed = msg.includes('Execution context was destroyed');
      if (!isDestroyed || attempt >= 2) {
        throw err;
      }
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForTimeout(300);
    }
  }
  return {};
}

async function safeGoto(page, url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      return true;
    } catch (err) {
      const msg = String(err?.message || err || '');
      const interrupted = msg.includes('interrupted by another navigation');
      if (!interrupted || attempt >= 2) {
        return false;
      }
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForTimeout(250);
    }
  }
  return false;
}

async function getRouteHealth(page) {
  try {
    return await page.evaluate(() => {
      const body = document.body;
      const text = (body?.innerText || '').trim();
      const appRoot = document.querySelector('app-root');
      const wuicRoots = document.querySelectorAll(
        'wuic-list-grid, wuic-filter-bar, wuic-spreadsheet-list, wuic-pivot-builder, wuic-framework-docs, wuic-designer, wuic-data-repeater, wuic-map-list, wuic-carousel-list, wuic-tree-list, wuic-workflow-designer'
      );
      const hasVisibleApp = !!(
        appRoot
        && ((appRoot.children?.length || 0) > 0 || appRoot.textContent?.trim()?.length > 0)
      );
      const runtimeErrorLikely = /NG\d{4}|Circular dependency detected|RuntimeError\(|Error:\s*NG\d{4}/i.test(text);
      return {
        textLength: text.length,
        appRootChildren: appRoot?.children?.length || 0,
        wuicRootCount: wuicRoots.length,
        runtimeErrorLikely,
        isLikelyBlank: !hasVisibleApp && wuicRoots.length === 0 && text.length < 20
      };
    });
  } catch {
    return {
      textLength: 0,
      appRootChildren: 0,
      wuicRootCount: 0,
      runtimeErrorLikely: false,
      isLikelyBlank: true
    };
  }
}

await fs.mkdir(outputDir, { recursive: true });

const profileConfig = await loadProfileConfig(profileConfigPath);
const docRoutes =
  includeDocsRoutes && profileConfig.includeFrameworkDocsRoutes
    ? await listFrameworkDocRoutes(docsPlaywrightRoot)
    : [];
const showcaseProfiles = mergeProfiles(profileConfig.profiles, docRoutes);
const showcaseRoutes = showcaseProfiles.map((x) => x.route);

const styleFiles = await listStyleFiles(styleRoot);
const selectorEntries = [];

for (const file of styleFiles) {
  const raw = await fs.readFile(file, 'utf8');
  const selectors = extractNgDeepSelectors(raw);
  const relPath = path.relative(process.cwd(), file).replace(/\\/g, '/');
  for (const selector of selectors) {
    selectorEntries.push({ selector, sourceFile: relPath });
  }
}

const uniqueSelectors = Array.from(new Set(selectorEntries.map((x) => x.selector)));
const selectorSources = new Map();
for (const item of selectorEntries) {
  if (!selectorSources.has(item.selector)) selectorSources.set(item.selector, new Set());
  selectorSources.get(item.selector).add(item.sourceFile);
}

const routeResults = [];
const session = await createE2ESession({
  baseUrl,
  backendBaseUrl,
  skipApiLogin: true,
  user: e2eUser,
  password: e2ePassword,
  headless: process.env.HEADLESS !== 'false',
  viewportWidth: 1600,
  viewportHeight: 900
});

try {
  const page = session.page;
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (err) => {
    pageErrors.push(String(err?.message || err || 'pageerror'));
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  let didLogin = false;

  for (const profile of showcaseProfiles) {
    const hashRoute = profile.route;
    const scope = isFrameworkDocsRoute(hashRoute) ? 'docs' : 'live';
    const url = makeAbsoluteUrl(hashRoute);
    const opened = await safeGoto(page, url);
    if (!opened) {
      const safeName = hashRoute.replace(/[^a-zA-Z0-9_-]/g, '_');
      const screenshotPath = path.join(outputDir, `route-${safeName}.png`);
      await page.screenshot({
        path: screenshotPath,
        fullPage: true
      }).catch(() => {});
      routeResults.push({
        route: hashRoute,
        scope,
        url,
        tags: profile.tags,
        actionLog: [{ type: 'goto', ok: false, error: 'navigation_failed_or_interrupted' }],
        scan: {},
        skipped: true,
        health: { isLikelyBlank: true, textLength: 0, appRootChildren: 0, wuicRootCount: 0 },
        screenshotPath
      });
      continue;
    }
    if (!didLogin) {
      didLogin = await loginIfNeeded(page);
      if (didLogin) {
        await safeGoto(page, url);
      }
    }

    for (const selector of profile.waitForAny) {
      await page.waitForSelector(selector, { timeout: 5_000 }).catch(() => {});
    }

    const actionLog = [];
    await runProfileActions(page, profile, actionLog);
    await page.waitForTimeout(profile.waitAfterMs);
    const health = await getRouteHealth(page);
    const routePageErrors = pageErrors.splice(0, pageErrors.length);
    const routeConsoleErrors = consoleErrors.splice(0, consoleErrors.length);
    if (routePageErrors.length > 0) {
      actionLog.push({ type: 'pageerror', ok: false, errors: routePageErrors.slice(0, 20) });
    }
    if (routeConsoleErrors.length > 0) {
      actionLog.push({ type: 'console.error', ok: false, errors: routeConsoleErrors.slice(0, 30) });
    }
    if (health.isLikelyBlank || health.runtimeErrorLikely) {
      actionLog.push({
        type: 'health',
        ok: false,
        skipped: true,
        reason: health.runtimeErrorLikely ? 'runtime_error' : 'blank_page',
        health
      });
      const safeName = hashRoute.replace(/[^a-zA-Z0-9_-]/g, '_');
      const screenshotPath = path.join(outputDir, `route-${safeName}.png`);
      await page.screenshot({
        path: screenshotPath,
        fullPage: true
      });
      routeResults.push({
        route: hashRoute,
        scope,
        url,
        scan: {},
        tags: profile.tags,
        actionLog,
        skipped: true,
        health,
        screenshotPath
      });
      continue;
    }

    const scanStates = ['default', 'dark'];
    const scan = {};
    for (const state of scanStates) {
      await applyThemeState(page, state);
      await page.waitForTimeout(250);
      const stateScan = await scanSelectorsOnPage(page, uniqueSelectors);

      for (const selector of uniqueSelectors) {
        if (!scan[selector]) {
          scan[selector] = { count: 0, errors: [] };
        }
        const curr = stateScan[selector];
        if (!curr) continue;
        if (curr.error) {
          scan[selector].errors.push({ state, error: curr.error });
          continue;
        }
        scan[selector].count = Math.max(scan[selector].count, Number(curr.count) || 0);
      }
    }
    await applyThemeState(page, 'default');

    const safeName = hashRoute.replace(/[^a-zA-Z0-9_-]/g, '_');
    const screenshotPath = path.join(outputDir, `route-${safeName}.png`);
    await page.screenshot({
      path: screenshotPath,
      fullPage: true
    });

    routeResults.push({
      route: hashRoute,
      scope,
      url,
      scan,
      tags: profile.tags,
      actionLog,
      skipped: false,
      health,
      screenshotPath
    });
  }
} finally {
  await session.dispose();
}

await fs.writeFile(
  path.join(outputDir, 'route-results.json'),
  JSON.stringify(routeResults, null, 2),
  'utf8'
);

const invalidSelectors = [];
const missingSelectors = [];
const requiredMissingSelectors = [];
const statefulMissingSelectors = [];
const optionalMissingSelectors = [];
const missingInLiveRoutes = [];
const requiredMissingInLiveRoutes = [];
const statefulMissingInLiveRoutes = [];
const optionalMissingInLiveRoutes = [];

const effectiveRouteResults = routeResults.filter((x) => !x.skipped);
const effectiveLiveRouteResults = effectiveRouteResults.filter((x) => x.scope === 'live');
const effectiveDocsRouteResults = effectiveRouteResults.filter((x) => x.scope === 'docs');

for (const selector of uniqueSelectors) {
  const errors = [];
  let maxCount = 0;
  const matchedRoutes = [];
  const sources = Array.from(selectorSources.get(selector) || []);
  let sourcePolicy = 'required';
  const sourceTags = new Set();
  for (const sourceFile of sources) {
    const classified = classifySourceFile(sourceFile, profileConfig.sourcePolicies);
    sourcePolicy = weakerPolicy(sourcePolicy, classified.policy);
    for (const tag of classified.tags) sourceTags.add(tag);
  }
  const inferredPolicy = inferPolicyFromSelector(selector);
  const finalPolicy = inferredPolicy ? weakerPolicy(sourcePolicy, inferredPolicy) : sourcePolicy;

  for (const rr of effectiveRouteResults) {
    const result = rr.scan[selector];
    if (!result) continue;
    if (Array.isArray(result.errors) && result.errors.length > 0) {
      for (const err of result.errors) {
        errors.push({ route: rr.route, state: err.state, error: err.error });
      }
      continue;
    }
    if (Number(result.count) > 0) {
      matchedRoutes.push({ route: rr.route, scope: rr.scope, count: result.count, tags: rr.tags });
      if (Number(result.count) > maxCount) maxCount = Number(result.count);
    }
  }

  if (errors.length && matchedRoutes.length === 0) {
    invalidSelectors.push({
      selector,
      policy: finalPolicy,
      sources,
      tags: Array.from(sourceTags),
      errors: errors.slice(0, 20)
    });
    continue;
  }

  if (matchedRoutes.length === 0) {
    const row = {
      selector,
      policy: finalPolicy,
      inferredPolicy: inferredPolicy || null,
      sources,
      tags: Array.from(sourceTags),
      matchedRoutes: []
    };
    missingSelectors.push(row);
    if (finalPolicy === 'required') requiredMissingSelectors.push(row);
    if (finalPolicy === 'stateful') statefulMissingSelectors.push(row);
    if (finalPolicy === 'optional') optionalMissingSelectors.push(row);
  }

  const matchedLiveRoutes = matchedRoutes.filter((x) => x.scope === 'live');
  if (matchedLiveRoutes.length === 0) {
    const rowLive = {
      selector,
      policy: finalPolicy,
      inferredPolicy: inferredPolicy || null,
      sources,
      tags: Array.from(sourceTags),
      matchedDocsRoutes: matchedRoutes.filter((x) => x.scope === 'docs').map((x) => x.route)
    };
    missingInLiveRoutes.push(rowLive);
    if (finalPolicy === 'required') requiredMissingInLiveRoutes.push(rowLive);
    if (finalPolicy === 'stateful') statefulMissingInLiveRoutes.push(rowLive);
    if (finalPolicy === 'optional') optionalMissingInLiveRoutes.push(rowLive);
  }
}

function buildMissingBySource(items) {
  const stats = new Map();
  for (const item of items) {
    for (const source of item.sources) {
      stats.set(source, (stats.get(source) || 0) + 1);
    }
  }
  return Array.from(stats.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);
}

const report = {
  strictMode,
  strictPolicies,
  baseUrl,
  backendBaseUrl,
  styleRoot,
  profileConfigPath,
  docsPlaywrightRoot,
  showcaseRoutes,
  showcaseProfiles: showcaseProfiles.map((x) => ({ route: x.route, tags: x.tags })),
  totals: {
    styleFiles: styleFiles.length,
    routesTotal: routeResults.length,
    routesLive: routeResults.filter((x) => x.scope === 'live').length,
    routesDocs: routeResults.filter((x) => x.scope === 'docs').length,
    routesEffective: effectiveRouteResults.length,
    routesEffectiveLive: effectiveLiveRouteResults.length,
    routesEffectiveDocs: effectiveDocsRouteResults.length,
    routesSkipped: routeResults.length - effectiveRouteResults.length,
    selectorsExtracted: selectorEntries.length,
    uniqueSelectors: uniqueSelectors.length,
    invalidSelectors: invalidSelectors.length,
    missingSelectors: missingSelectors.length,
    requiredMissingSelectors: requiredMissingSelectors.length,
    statefulMissingSelectors: statefulMissingSelectors.length,
    optionalMissingSelectors: optionalMissingSelectors.length,
    missingInLiveRoutes: missingInLiveRoutes.length,
    requiredMissingInLiveRoutes: requiredMissingInLiveRoutes.length,
    statefulMissingInLiveRoutes: statefulMissingInLiveRoutes.length,
    optionalMissingInLiveRoutes: optionalMissingInLiveRoutes.length
  },
  missingBySource: {
    required: buildMissingBySource(requiredMissingSelectors),
    stateful: buildMissingBySource(statefulMissingSelectors),
    optional: buildMissingBySource(optionalMissingSelectors)
  },
  invalidSelectors,
  requiredMissingSelectors,
  statefulMissingSelectors,
  optionalMissingSelectors,
  missingSelectors,
  requiredMissingInLiveRoutes,
  statefulMissingInLiveRoutes,
  optionalMissingInLiveRoutes,
  missingInLiveRoutes
};

const routeSummary = routeResults.map((rr) => {
  const matchedSelectors = Object.values(rr.scan || {}).filter((v) => Number(v?.count) > 0).length;
  const status = rr.skipped
    ? 'FAIL'
    : (matchedSelectors > 0 ? 'PASS' : 'FAIL');
  const failureReason = rr.skipped
    ? (rr.health?.runtimeErrorLikely ? 'runtime_error' : 'blank_or_navigation')
    : null;
  return {
    route: rr.route,
    scope: rr.scope,
    url: rr.url,
    status,
    failureReason,
    matchedSelectors,
    skipped: !!rr.skipped,
    health: rr.health || null,
    screenshotPath: rr.screenshotPath || null
  };
});

await fs.writeFile(
  path.join(outputDir, 'report.json'),
  JSON.stringify(report, null, 2),
  'utf8'
);

await fs.writeFile(
  path.join(outputDir, 'route-summary.json'),
  JSON.stringify(routeSummary, null, 2),
  'utf8'
);

const md = [
  '# ng-deep Selector Compatibility Report',
  '',
  `- strictMode: ${strictMode}`,
  `- strictPolicies: ${strictPolicies.join(', ') || 'required'}`,
  `- baseUrl: ${baseUrl}`,
  `- styleRoot: ${styleRoot}`,
  `- profileConfigPath: ${profileConfigPath}`,
  `- docsPlaywrightRoot: ${docsPlaywrightRoot}`,
  `- showcaseRoutes: ${showcaseRoutes.length}`,
  `- uniqueSelectors: ${uniqueSelectors.length}`,
  `- invalidSelectors: ${invalidSelectors.length}`,
  `- missingSelectors: ${missingSelectors.length}`,
  `- requiredMissingSelectors: ${requiredMissingSelectors.length}`,
  `- statefulMissingSelectors: ${statefulMissingSelectors.length}`,
  `- optionalMissingSelectors: ${optionalMissingSelectors.length}`,
  `- missingInLiveRoutes: ${missingInLiveRoutes.length}`,
  `- requiredMissingInLiveRoutes: ${requiredMissingInLiveRoutes.length}`,
  `- statefulMissingInLiveRoutes: ${statefulMissingInLiveRoutes.length}`,
  `- optionalMissingInLiveRoutes: ${optionalMissingInLiveRoutes.length}`,
  ''
];

if (invalidSelectors.length) {
  md.push('## Invalid Selectors');
  for (const it of invalidSelectors) {
    md.push(`- \`${it.selector}\``);
    md.push(`  sources: ${it.sources.join(', ')}`);
  }
  md.push('');
}

if (missingSelectors.length) {
  md.push('## Required Missing');
  for (const it of requiredMissingSelectors.slice(0, 200)) {
    md.push(`- \`${it.selector}\``);
    md.push(`  sources: ${it.sources.join(', ')}`);
  }
  md.push('');

  md.push('## Stateful Missing');
  for (const it of statefulMissingSelectors.slice(0, 200)) {
    md.push(`- \`${it.selector}\``);
    md.push(`  sources: ${it.sources.join(', ')}`);
  }
  md.push('');

  md.push('## Optional Missing');
  for (const it of optionalMissingSelectors.slice(0, 100)) {
    md.push(`- \`${it.selector}\``);
    md.push(`  sources: ${it.sources.join(', ')}`);
  }
  md.push('');

  md.push('## Required Missing In Live Routes');
  for (const it of requiredMissingInLiveRoutes.slice(0, 200)) {
    const docsHits = (it.matchedDocsRoutes || []).length;
    md.push(`- \`${it.selector}\` (docsHits=${docsHits})`);
    md.push(`  sources: ${it.sources.join(', ')}`);
  }
  md.push('');
}

await fs.writeFile(path.join(outputDir, 'report.md'), md.join('\n'), 'utf8');

const routeMd = ['# Route Test Screenshots', ''];
for (const row of routeSummary) {
  const reasonText = row.failureReason ? ` | reason=${row.failureReason}` : '';
  routeMd.push(`- [${row.status}] (${row.scope}) ${row.route} | matchedSelectors=${row.matchedSelectors}${reasonText}`);
  routeMd.push(`  screenshot: ${row.screenshotPath || 'n/a'}`);
}
await fs.writeFile(path.join(outputDir, 'route-summary.md'), routeMd.join('\n'), 'utf8');

console.log(JSON.stringify(report.totals, null, 2));
console.log(`Artifacts: ${outputDir}`);

if (invalidSelectors.length > 0) {
  process.exit(1);
}

if (
  strictMode
  && (
    (strictPolicies.includes('required') && requiredMissingSelectors.length > 0)
    || (strictPolicies.includes('stateful') && statefulMissingSelectors.length > 0)
    || (strictPolicies.includes('optional') && optionalMissingSelectors.length > 0)
  )
) {
  process.exit(2);
}
