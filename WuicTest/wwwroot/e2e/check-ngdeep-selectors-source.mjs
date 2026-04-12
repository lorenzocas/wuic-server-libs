/**
 * check-ngdeep-selectors-source.mjs
 *
 * Validates ::ng-deep selectors against the ACTUAL SOURCE of third-party
 * libraries (PrimeNG, jSpreadsheet, FullCalendar, Monaco Editor).
 *
 * Unlike the DOM-based test, this has NO false positives from missing
 * test pages — a class is dead only if the library no longer ships it.
 *
 * Usage:
 *   node e2e/check-ngdeep-selectors-source.mjs [--verbose]
 *
 * Exit codes:
 *   0 = all third-party classes found in library source
 *   1 = some third-party classes NOT found (genuinely dead/renamed)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const verbose = process.argv.includes('--verbose');
const styleRoot = process.env.STYLE_ROOT || path.resolve(__dirname, '../lib-src');
const nodeModulesRoot = process.env.NODE_MODULES_ROOT || 'C:/src/Wuic/node_modules';
const outputDir = path.resolve(__dirname, '../e2e-artifacts/ngdeep-selector-source');

// ─── Library config ──────────────────────────────────────────────────
const LIBRARIES = [
  {
    name: 'primeng',
    prefix: /^p-/,
    scanPaths: ['primeng'],
    extensions: ['.ts', '.js', '.mjs', '.css', '.scss'],
    // PrimeNG emits classes both as string literals and in template/style files
    extraClassPatterns: [
      // TypeScript/JS: 'p-datatable-wrapper', "p-datatable-wrapper"
      /['"`]([a-zA-Z][\w-]*)['"` ]/g,
      // CSS/SCSS: .p-datatable-wrapper { ... }
      /\.([a-zA-Z][\w-]*)/g,
    ]
  },
  {
    name: 'jspreadsheet',
    prefix: /^(?:jss[_-]|jexcel|jspreadsheet|jpagination|jdropdown|jtoolbar|jpicker|jtabs)/,
    scanPaths: ['jspreadsheet'],
    extensions: ['.js', '.css'],
    extraClassPatterns: [
      /['"`]([a-zA-Z][\w-]*)['"` ]/g,
      /\.([a-zA-Z][\w-]*)/g,
    ]
  },
  {
    name: 'fullcalendar',
    prefix: /^fc[-_]|^fc$/,
    scanPaths: ['@fullcalendar'],
    extensions: ['.js', '.css'],
    extraClassPatterns: [
      /['"`]([a-zA-Z][\w-]*)['"` ]/g,
      /\.([a-zA-Z][\w-]*)/g,
    ]
  },
  {
    name: 'monaco-editor',
    prefix: /^monaco[-_]/,
    scanPaths: ['monaco-editor'],
    extensions: ['.js', '.css'],
    extraClassPatterns: [
      /['"`]([a-zA-Z][\w-]*)['"` ]/g,
      /\.([a-zA-Z][\w-]*)/g,
    ]
  },
];

// Classes that are set at runtime by our code or by the browser — not in library source
const KNOWN_OWN_PREFIXES = [
  'wuic-', 'list-grid-', 'grid-caption-', 'grid-changes-',
  'data-repeater-', 'carousel-content', 'carousel-item-',
  'map-list-', 'map-info', 'tree-list-',
  'filter-bar-', 'advanced-rule-',
  'pivot-', 'designer-', 'hierarchy-',
  'dashboard-', 'datasource-',
  'workflow-', 'code-editor-',
  'section-html', 'code-block',
  'screenshots', 'notification-item-',
  'meta-menu-',
  'disabled-textfield',
  'data-field-', 'editor-wapper', 'caption-wrapper',
  'tok-', // syntax highlight tokens
];

// HTML element selectors to ignore (not class-based)
const HTML_ELEMENTS = new Set([
  'a', 'b', 'br', 'button', 'code', 'col', 'dd', 'details', 'div',
  'dl', 'dt', 'em', 'fieldset', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'i', 'iframe', 'img', 'input', 'label', 'legend', 'li',
  'link', 'nav', 'ol', 'option', 'p', 'pre', 'script', 'select',
  'small', 'span', 'strong', 'style', 'sub', 'summary', 'sup',
  'table', 'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead', 'tr',
  'ul', 'video', 'svg', 'path', 'rect', 'circle', 'g',
  'google-map',  // Angular Google Maps component
  'ng-component', // Angular internal
]);

// Pseudo-selectors to strip when extracting class tokens
const PSEUDO_RE = /::?[\w-]+(?:\([^)]*\))?/g;
const ATTR_RE = /\[[^\]]*\]/g;

// ─── Helpers ─────────────────────────────────────────────────────────

async function walkDir(dir, extensions) {
  const files = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip very deep paths or known non-source dirs
      if (entry.name === '.git' || entry.name === 'test' || entry.name === 'tests'
        || entry.name === '__tests__' || entry.name === 'docs') continue;
      files.push(...await walkDir(full, extensions));
    } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
      files.push(full);
    }
  }
  return files;
}

function extractNgDeepSelectors(cssContent) {
  const selectors = [];
  const regex = /::ng-deep\s+([^{}]+)\{/g;
  let match;
  while ((match = regex.exec(cssContent)) !== null) {
    const raw = String(match[1] || '').trim();
    if (raw) selectors.push(raw);
  }
  return selectors;
}

/**
 * From a compound selector like ".list-grid-container .p-datatable .p-datatable-scrollable-view",
 * extract individual class tokens: ['list-grid-container', 'p-datatable', 'p-datatable-scrollable-view']
 */
function extractClassTokens(selector) {
  // Strip pseudo-selectors and attribute selectors
  let cleaned = selector
    .replace(PSEUDO_RE, '')
    .replace(ATTR_RE, '')
    .replace(/::ng-deep/g, '')
    .replace(/:host/g, '');

  const classes = new Set();
  const classRe = /\.([a-zA-Z_][\w-]*)/g;
  let m;
  while ((m = classRe.exec(cleaned)) !== null) {
    classes.add(m[1]);
  }
  return [...classes];
}

function isOwnClass(className) {
  const lower = className.toLowerCase();
  return KNOWN_OWN_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function isHtmlElement(token) {
  return HTML_ELEMENTS.has(token.toLowerCase());
}

function classifyClass(className) {
  for (const lib of LIBRARIES) {
    if (lib.prefix.test(className)) return lib.name;
  }
  if (isOwnClass(className)) return 'own';
  return 'unknown';
}

async function buildClassRegistry(lib) {
  const registry = new Set();
  for (const scanPath of lib.scanPaths) {
    const fullPath = path.join(nodeModulesRoot, scanPath);
    const files = await walkDir(fullPath, lib.extensions);
    for (const file of files) {
      let content;
      try {
        content = await fs.readFile(file, 'utf8');
      } catch {
        continue;
      }
      for (const pattern of lib.extraClassPatterns) {
        // Reset lastIndex for global regex
        const re = new RegExp(pattern.source, pattern.flags);
        let m;
        while ((m = re.exec(content)) !== null) {
          const token = m[1];
          if (token && token.length > 1 && lib.prefix.test(token)) {
            registry.add(token);
          }
        }
      }
    }
  }
  return registry;
}

// ─── Main ────────────────────────────────────────────────────────────

await fs.mkdir(outputDir, { recursive: true });

// Step 1: Extract all ::ng-deep selectors from our CSS/SCSS
console.log('Scanning style files in', styleRoot);
const styleFiles = await walkDir(styleRoot, ['.css', '.scss']);
const selectorEntries = [];

for (const file of styleFiles) {
  const raw = await fs.readFile(file, 'utf8');
  const selectors = extractNgDeepSelectors(raw);
  const relPath = path.relative(process.cwd(), file).replace(/\\/g, '/');
  for (const selector of selectors) {
    selectorEntries.push({ selector, sourceFile: relPath });
  }
}

console.log(`Found ${selectorEntries.length} ::ng-deep selectors in ${styleFiles.length} files`);

// Step 2: Extract unique class tokens and classify them
const allClassTokens = new Map(); // className -> Set<sourceFile>
for (const entry of selectorEntries) {
  const tokens = extractClassTokens(entry.selector);
  for (const token of tokens) {
    if (isHtmlElement(token)) continue;
    if (!allClassTokens.has(token)) allClassTokens.set(token, new Set());
    allClassTokens.get(token).add(entry.sourceFile);
  }
}

const classified = { own: [], unknown: [] };
const thirdPartyByLib = {};
for (const lib of LIBRARIES) {
  thirdPartyByLib[lib.name] = [];
}

for (const [className, sources] of allClassTokens) {
  const category = classifyClass(className);
  if (category === 'own' || category === 'unknown') {
    classified[category].push({ className, sources: [...sources] });
  } else {
    thirdPartyByLib[category].push({ className, sources: [...sources] });
  }
}

console.log('\nClass token breakdown:');
console.log(`  Own code: ${classified.own.length}`);
console.log(`  Unknown/generic: ${classified.unknown.length}`);
for (const lib of LIBRARIES) {
  console.log(`  ${lib.name}: ${thirdPartyByLib[lib.name].length}`);
}

// Step 3: Build class registries from library sources
console.log('\nBuilding class registries from node_modules...');
const registries = {};
for (const lib of LIBRARIES) {
  const t0 = Date.now();
  registries[lib.name] = await buildClassRegistry(lib);
  console.log(`  ${lib.name}: ${registries[lib.name].size} classes found (${Date.now() - t0}ms)`);
}

// Step 4: Compare — find dead third-party classes
const dead = [];
const alive = [];
const skipped = [...classified.own, ...classified.unknown];

for (const lib of LIBRARIES) {
  const registry = registries[lib.name];
  for (const entry of thirdPartyByLib[lib.name]) {
    if (registry.has(entry.className)) {
      alive.push({ ...entry, library: lib.name });
    } else {
      dead.push({ ...entry, library: lib.name });
    }
  }
}

// Step 5: Report
console.log('\n══════════════════════════════════════════════');
console.log('  RESULTS');
console.log('══════════════════════════════════════════════');
console.log(`  Third-party classes checked: ${alive.length + dead.length}`);
console.log(`  ✅ Found in library source:  ${alive.length}`);
console.log(`  ❌ NOT found (dead/renamed): ${dead.length}`);
console.log(`  ⏭️  Skipped (own/generic):    ${skipped.length}`);
console.log('══════════════════════════════════════════════\n');

if (dead.length > 0) {
  console.log('❌ Dead/renamed third-party classes:\n');
  // Group by library
  const deadByLib = {};
  for (const d of dead) {
    if (!deadByLib[d.library]) deadByLib[d.library] = [];
    deadByLib[d.library].push(d);
  }
  for (const [lib, entries] of Object.entries(deadByLib).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  [${lib}] (${entries.length} dead)`);
    for (const e of entries) {
      console.log(`    .${e.className}`);
      if (verbose) {
        for (const src of e.sources) console.log(`      ← ${src}`);
      }
    }
    console.log('');
  }
}

if (verbose && alive.length > 0) {
  console.log('✅ Alive third-party classes:\n');
  for (const lib of LIBRARIES) {
    const aliveInLib = alive.filter((a) => a.library === lib.name);
    if (aliveInLib.length === 0) continue;
    console.log(`  [${lib.name}] (${aliveInLib.length} alive)`);
    for (const a of aliveInLib) {
      console.log(`    .${a.className}`);
    }
    console.log('');
  }
}

// Write JSON report
const report = {
  timestamp: new Date().toISOString(),
  styleRoot,
  nodeModulesRoot,
  totals: {
    styleFiles: styleFiles.length,
    selectorsExtracted: selectorEntries.length,
    uniqueClassTokens: allClassTokens.size,
    ownClasses: classified.own.length,
    unknownClasses: classified.unknown.length,
    thirdPartyChecked: alive.length + dead.length,
    thirdPartyAlive: alive.length,
    thirdPartyDead: dead.length,
  },
  libraryVersions: {},
  registrySizes: {},
  dead,
  alive: alive.map((a) => ({ className: a.className, library: a.library })),
  skipped: skipped.map((s) => ({ className: s.className })),
};

for (const lib of LIBRARIES) {
  report.registrySizes[lib.name] = registries[lib.name].size;
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(nodeModulesRoot, lib.scanPaths[0], 'package.json'), 'utf8'));
    report.libraryVersions[lib.name] = pkg.version;
  } catch {
    report.libraryVersions[lib.name] = 'unknown';
  }
}

await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(`Report written to ${outputDir}/report.json`);

process.exit(dead.length > 0 ? 1 : 0);
