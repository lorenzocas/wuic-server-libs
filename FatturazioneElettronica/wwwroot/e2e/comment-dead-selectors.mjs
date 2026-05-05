/**
 * Reads the ngdeep selector compat report and:
 *  1. Comments out ::ng-deep rules whose selectors are ALL dead.
 *  2. For mixed rules (some alive, some dead), marks individual dead selectors.
 *  3. Generates migration.css.txt with full reference.
 *
 * Usage: node e2e/comment-dead-selectors.mjs [--dry-run]
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const dryRun = process.argv.includes('--dry-run');
const reportPath = path.resolve('e2e-artifacts/ngdeep-selector-compat/report.json');
const libRoot = path.resolve('lib-src');
const migrationOutPath = 'C:/src/Wuic/KonvergenceCore/wwwroot/my-workspace/projects/wuic-framework-lib/migration.css.txt';

const MARKER = 'MIGRATION-DEAD';

const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
const deadSelectors = new Set();
const deadBySource = {};

for (const entry of [...report.requiredMissingSelectors, ...report.statefulMissingSelectors]) {
  deadSelectors.add(entry.selector);
  for (const src of entry.sources) {
    if (!deadBySource[src]) deadBySource[src] = [];
    deadBySource[src].push({ selector: entry.selector, policy: entry.policy });
  }
}

console.log(`Dead selectors: ${deadSelectors.size}`);
console.log(`Source files affected: ${Object.keys(deadBySource).length}`);

/**
 * Clean a raw CSS selector the same way check-ngdeep-selectors.mjs does,
 * so we can match report entries back to source rules.
 */
function cleanSelector(sel) {
  return sel
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\*\/\s*/g, ' ')
    .replace(/:host-context\(([^)]+)\)/g, '$1')
    .replace(/:host\(([^)]+)\)/g, '$1')
    .replace(/:host\b/g, '')
    .replace(/::ng-deep\b/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([>+~])\s*/g, ' $1 ')
    .trim();
}

/**
 * Parse a CSS/SCSS file and find ::ng-deep rule blocks.
 * Returns array of { start, end, rawSelectors: string[], body: string }
 */
function findNgDeepBlocks(content) {
  const blocks = [];
  // Match ::ng-deep ... { ... } blocks. Handles nested braces.
  // Match lines containing ::ng-deep followed by selectors and opening brace
  const regex = /([^\n{}]*::ng-deep[^{}]*)\{/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const selectorPart = match[1];
    const blockStart = match.index;
    const bodyStart = match.index + match[0].length;

    // Find matching closing brace
    let depth = 1;
    let pos = bodyStart;
    while (pos < content.length && depth > 0) {
      if (content[pos] === '{') depth++;
      if (content[pos] === '}') depth--;
      pos++;
    }
    const blockEnd = pos;
    const body = content.slice(bodyStart, blockEnd - 1).trim();

    // Split comma-separated selectors
    const rawSelectors = splitSelectors(selectorPart);

    blocks.push({
      start: blockStart,
      end: blockEnd,
      rawSelectors,
      body,
      raw: content.slice(blockStart, blockEnd)
    });
  }

  return blocks;
}

function splitSelectors(raw) {
  const out = [];
  let buf = '';
  let paren = 0;
  let bracket = 0;
  let quote = '';

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const prev = i > 0 ? raw[i - 1] : '';

    if (quote) {
      buf += ch;
      if (ch === quote && prev !== '\\') quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === '(') paren++;
    if (ch === ')') paren = Math.max(0, paren - 1);
    if (ch === '[') bracket++;
    if (ch === ']') bracket = Math.max(0, bracket - 1);
    if (ch === ',' && paren === 0 && bracket === 0) {
      const trimmed = buf.trim();
      if (trimmed) out.push(trimmed);
      buf = '';
      continue;
    }
    buf += ch;
  }
  const trimmed = buf.trim();
  if (trimmed) out.push(trimmed);
  return out;
}

// Also handle standalone ::ng-deep { ... } blocks (no specific selector, block-level)
function findNgDeepWrapperBlocks(content) {
  const blocks = [];
  const regex = /(?::host\s+)?::ng-deep\s*\{/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const blockStart = match.index;
    const bodyStart = match.index + match[0].length;

    let depth = 1;
    let pos = bodyStart;
    while (pos < content.length && depth > 0) {
      if (content[pos] === '{') depth++;
      if (content[pos] === '}') depth--;
      pos++;
    }
    const blockEnd = pos;
    blocks.push({
      start: blockStart,
      end: blockEnd,
      raw: content.slice(blockStart, blockEnd)
    });
  }

  return blocks;
}

const migrationLines = [
  '# migration.css.txt',
  '# Dead ::ng-deep selectors found by check-ngdeep-selectors.mjs',
  '# These selectors target PrimeNG/jSpreadsheet/FullCalendar classes that no longer exist in the DOM',
  '# after the Angular 21 + PrimeNG v4 upgrade.',
  '#',
  '# Each entry shows:',
  '#   - The cleaned selector (as matched by querySelectorAll)',
  '#   - The source file containing the ::ng-deep rule',
  '#   - The policy (required = always expected, stateful = needs interaction/state)',
  '#',
  `# Generated: ${new Date().toISOString()}`,
  `# Total dead: ${deadSelectors.size}`,
  ''
];

let totalCommented = 0;
let totalMarked = 0;

for (const [relSource, entries] of Object.entries(deadBySource).sort((a, b) => b[1].length - a[1].length)) {
  const absSource = path.resolve(relSource);

  migrationLines.push(`## ${relSource} (${entries.length} dead)`);
  for (const e of entries) {
    migrationLines.push(`  [${e.policy}] ${e.selector}`);
  }
  migrationLines.push('');

  // Read the actual source file and process it
  let content;
  try {
    content = await fs.readFile(absSource, 'utf8');
  } catch {
    console.warn(`  SKIP (not found): ${absSource}`);
    continue;
  }

  const deadSet = new Set(entries.map((e) => e.selector));
  const blocks = findNgDeepBlocks(content);

  // Process blocks in reverse order to preserve offsets
  const edits = [];

  for (const block of blocks) {
    // Classify each selector in the block
    const alive = [];
    const dead = [];

    for (const rawSel of block.rawSelectors) {
      const cleaned = cleanSelector(rawSel);
      if (deadSet.has(cleaned)) {
        dead.push({ raw: rawSel, cleaned });
      } else {
        alive.push({ raw: rawSel, cleaned });
      }
    }

    if (dead.length === 0) continue;

    if (alive.length === 0) {
      // ALL selectors are dead → comment out entire block
      edits.push({
        start: block.start,
        end: block.end,
        replacement: `/* [${MARKER}] — selectors not found in DOM after PrimeNG v4 upgrade\n${block.raw}\n[/${MARKER}] */`
      });
      totalCommented += dead.length;
    } else {
      // Mixed block — we can't easily split compound selectors in raw CSS,
      // so just add a marker comment before the block listing the dead selectors.
      const deadList = dead.map((d) => d.cleaned).join(', ');
      const markerComment = `/* [${MARKER}] dead selectors in this rule: ${deadList} */\n`;
      edits.push({
        start: block.start,
        end: block.start,
        replacement: markerComment
      });
      totalMarked += dead.length;
    }
  }

  if (edits.length === 0) continue;

  // Apply edits in reverse order
  edits.sort((a, b) => b.start - a.start);
  let modified = content;
  for (const edit of edits) {
    modified =
      modified.slice(0, edit.start) +
      edit.replacement +
      modified.slice(edit.end);
  }

  if (dryRun) {
    console.log(`  DRY-RUN: ${relSource} — ${edits.length} edits`);
  } else {
    await fs.writeFile(absSource, modified, 'utf8');
    console.log(`  WRITTEN: ${relSource} — ${edits.length} edits`);
  }
}

if (!dryRun) {
  await fs.writeFile(migrationOutPath, migrationLines.join('\n'), 'utf8');
  console.log(`\nMigration reference: ${migrationOutPath}`);
}

console.log(`\nDone. Commented out: ${totalCommented} selectors in full blocks. Marked: ${totalMarked} in mixed blocks.`);
