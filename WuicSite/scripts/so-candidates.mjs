#!/usr/bin/env node
/**
 * so-candidates.mjs
 *
 * Polls the Stack Exchange API for recent questions on broad primary tags
 * (angular, primeng, .net, asp.net-core, sql-server, stimulsoft, retool,
 * workflow, entity-framework-core), then filters CLIENT-SIDE by a keyword
 * regex applied to the title. This is the right shape because:
 *
 *   - 2-tag combinations like `angular;dynamic-forms` are too narrow on SO:
 *     the last question with both tags was August 2024, nothing fresh.
 *   - Single broad tag like `angular` returns 50-100 questions/day, the
 *     vast majority irrelevant ("why is my ngFor not updating?").
 *   - Title-keyword filter catches the relevant subset ("metadata-driven
 *     dynamic forms", "drag-and-drop designer for Angular", "WYSIWYG
 *     workflow editor in .NET", "framework comparison Angular vs React")
 *     without missing the questions that don't carry the narrow tag.
 *
 * Each group declares: primary tag, keyword regex (joined by `|`), answer
 * template hint, and a `why_match` line shown to the operator during
 * triage. No API key needed (300 req/day anonymous quota; we do ~10
 * requests per run).
 *
 * Usage:
 *   node scripts/so-candidates.mjs                   # all groups
 *   node scripts/so-candidates.mjs --group=KEY       # specific group
 *   node scripts/so-candidates.mjs --max-age=7       # tighter window
 *   node scripts/so-candidates.mjs --include-answered # also surface answered (debug)
 */

const FETCH_BASE = 'https://api.stackexchange.com/2.3/questions';
const SITE = 'stackoverflow';

// Groups: each = { key, tag, keywords (regex source), template, why }.
// Templates map to community/stackoverflow/targets.md:
//   A = CRUD scaffolding / metadata-driven
//   B = Mobile auto-layout / PrimeNG responsive
//   C = Linux deploy / .NET + systemd + nginx
//   D = Designer-flavoured (dashboard / report / workflow / WYSIWYG)
const TAG_GROUPS = [
  // ── Angular family ────────────────────────────────────────────────────
  // Keywords kept BROAD: SO volume on angular tag is ~20 questions/month
  // (down from hundreds 3 years ago, big drop in 2025-2026). Strict regex
  // would zero out the candidate pool. Broader alternation catches more
  // dynamic-* / signal-form / schema variants — operator triages anyway.
  { key: 'angular-crud',     tag: 'angular',
    keywords: 'metadata|scaffold|low[ -]?code|crud[ -]?generat|dynamic[ -]?(?:form|schema|column|field|control|table|grid)|signal[ -]?form|reactive[ -]?form.*?dynamic|generat.*?form|form.*?generat',
    template: 'A', why: 'Angular + metadata / dynamic-* / signal-forms / scaffolding → CRUD-from-SQL story' },
  { key: 'angular-designer', tag: 'angular',
    keywords: 'wysiwyg|designer|drag[ -]?(?:and[ -]?)?drop|workflow|page[ -]?builder|low[ -]?code',
    template: 'D', why: 'Angular + designer/WYSIWYG/workflow → dashboard-designer story' },
  { key: 'angular-mobile',   tag: 'angular',
    keywords: 'mobile|responsive|breakpoint|card[ -]?stack|768|viewport',
    template: 'B', why: 'Angular + responsive → mobile auto-layout story' },

  // ── PrimeNG ───────────────────────────────────────────────────────────
  { key: 'primeng-mobile',   tag: 'primeng',
    keywords: 'mobile|responsive|card|breakpoint|p[ -]?table',
    template: 'B', why: 'PrimeNG + mobile/responsive → table-to-card swap story' },
  { key: 'primeng-designer', tag: 'primeng',
    keywords: 'designer|drag[ -]?(?:and[ -]?)?drop|wysiwyg|dashboard',
    template: 'D', why: 'PrimeNG + designer → dashboard story' },

  // ── .NET family (Linux deploy + framework positioning) ────────────────
  { key: 'dotnet-linux',     tag: '.net',
    keywords: 'linux|ubuntu|kestrel|systemd|nginx|cross[ -]?platform|docker',
    template: 'C', why: '.NET + linux/kestrel → install.sh / deploy story' },
  { key: 'dotnet-framework', tag: '.net',
    keywords: 'framework|metadata|crud|scaffold|low[ -]?code|wysiwyg|designer|workflow',
    template: 'A', why: '.NET + framework/metadata → WUIC positioning story' },
  { key: 'aspnet-deploy',    tag: 'asp.net-core',
    keywords: 'linux|kestrel|systemd|ubuntu|nginx|docker',
    template: 'C', why: 'ASP.NET Core + linux deploy → install.sh story' },

  // ── Workflow (tag is its own primary) ─────────────────────────────────
  { key: 'workflow-designer', tag: 'workflow',
    keywords: 'angular|web|designer|builder|wysiwyg|drag[ -]?(?:and[ -]?)?drop|bpmn|low[ -]?code',
    template: 'D', why: 'Workflow tag + web/designer/WYSIWYG → workflow-designer story' },

  // ── Narrow tags (no keyword filter needed; tag alone is signal) ──────
  { key: 'stimulsoft-all',   tag: 'stimulsoft',
    keywords: '.*',
    template: 'D', why: 'Stimulsoft tag alone → embedded report viewer story' },
  { key: 'retool-alt',       tag: 'retool',
    keywords: 'alternative|open[ -]?source|self[ -]?hosted|angular|framework',
    template: 'A', why: 'Retool + alternative/OSS → WUIC competitive positioning' },

  // ── SQL Server on Linux (cross-pollination with deploy story) ─────────
  { key: 'mssql-linux',      tag: 'sql-server',
    keywords: 'linux|ubuntu|systemd|docker|kestrel|nginx',
    template: 'C', why: 'SQL Server + linux → install.sh / mssql-server.service story' },

  // ── EF Core + metadata (adjacent, low competition) ───────────────────
  { key: 'ef-dynamic',       tag: 'entity-framework-core',
    keywords: 'metadata|reflection|dynamic|scaffold|framework',
    template: 'A', why: 'EF Core + reflection/dynamic → adjacent to metadata-driven runtime' },
];

const argv = process.argv.slice(2);
const opts = Object.fromEntries(argv.map((a) => {
  const m = a.match(/^--([\w-]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const maxAgeDays = Number(opts['max-age']) || 14;
const groupFilter = opts.group || null;
const includeAnswered = !!opts['include-answered'];

const cutoffUnix = Math.floor((Date.now() - maxAgeDays * 86400_000) / 1000);

async function fetchGroup(group) {
  const url = new URL(FETCH_BASE);
  url.searchParams.set('order', 'desc');
  url.searchParams.set('sort', 'creation');
  url.searchParams.set('tagged', group.tag);
  url.searchParams.set('site', SITE);
  url.searchParams.set('pagesize', '50');           // grab plenty since most will fail keyword filter
  url.searchParams.set('fromdate', String(cutoffUnix));

  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) {
    console.error(`[${group.key}] HTTP ${res.status}: ${await res.text().catch(() => '')}`);
    return [];
  }
  const data = await res.json();
  if (data.error_id) {
    console.error(`[${group.key}] API error: ${data.error_message}`);
    return [];
  }

  // HTML-entity decode for title comparison (SE returns &#39; etc).
  const decode = (s) => String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");

  const kwRe = new RegExp(`(?:${group.keywords})`, 'i');
  const items = data.items || [];
  return items
    .filter((q) => kwRe.test(decode(q.title)))
    .map((q) => ({
      group: group.key,
      template_hint: group.template,
      why_match: group.why,
      title: decode(q.title),
      link: q.link,
      tags: q.tags,
      score: q.score,
      views: q.view_count,
      answers: q.answer_count,
      is_answered: q.is_answered,
      age_days: Math.round((Date.now() / 1000 - q.creation_date) / 86400),
    }));
}

(async () => {
  const groups = groupFilter ? TAG_GROUPS.filter((g) => g.key === groupFilter) : TAG_GROUPS;
  if (groups.length === 0) {
    console.error(`No group matches '${groupFilter}'. Available: ${TAG_GROUPS.map((g) => g.key).join(', ')}`);
    process.exit(1);
  }

  const all = [];
  for (const group of groups) {
    const candidates = await fetchGroup(group);
    all.push(...candidates);
    // tiny pause: SE allows 30 req/sec sustained, we're nowhere near, but be polite.
    await new Promise((r) => setTimeout(r, 200));
  }

  // De-duplicate by question link (same q may appear via 2 groups, e.g. angular-crud + angular-designer).
  // Keep the first occurrence; record additional template hints in a `also_in_groups` field.
  const seen = new Map();
  for (const c of all) {
    if (seen.has(c.link)) {
      const existing = seen.get(c.link);
      existing.also_in_groups = existing.also_in_groups || [];
      if (!existing.also_in_groups.includes(c.group)) existing.also_in_groups.push(c.group);
    } else {
      seen.set(c.link, c);
    }
  }

  const ranked = [...seen.values()]
    .filter((c) => (includeAnswered || c.answers <= 2) && c.score >= -1)
    .sort((a, b) => {
      // Unanswered first, then by lowest answer count, then by recency.
      if (a.is_answered !== b.is_answered) return a.is_answered ? 1 : -1;
      if (a.answers !== b.answers) return a.answers - b.answers;
      return a.age_days - b.age_days;
    });

  if (ranked.length === 0) {
    console.log(JSON.stringify({
      candidates: [],
      note: `No fresh candidates in the last ${maxAgeDays} days across ${groups.length} group(s).`,
    }, null, 2));
    return;
  }

  console.log(JSON.stringify({
    fetched_at: new Date().toISOString(),
    window_days: maxAgeDays,
    groups_queried: groups.map((g) => g.key),
    total_candidates: ranked.length,
    candidates: ranked.slice(0, 15),
  }, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
