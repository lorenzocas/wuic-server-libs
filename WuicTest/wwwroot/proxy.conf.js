/**
 * Angular CLI dev-server proxy config (JS form — supports custom bypass
 * middleware via Node.js callbacks).
 *
 * Standard `/api` and `/upload` rules proxy to the backend at :5000 (same as
 * the legacy `proxy.conf.json`).
 *
 * Plus: a dev-only endpoint `/api/__dev__/bump-watch-trigger` intercepted by
 * the `bypass` callback, which writes `KonvergenceCore/HotReloadTrigger.cs`
 * with a fresh method-name suffix. This is a "rude edit" for dotnet Hot
 * Reload — `dotnet watch` cannot apply it as a metadata patch and falls back
 * to a full rebuild + restart of the worker. Used by
 * `app-settings-editor.component.ts:waitForRestart` (Phase C) to wake up
 * dotnet watch from its "Waiting for changes" idle state AFTER the worker
 * has fully shut down.
 *
 * The bypass runs in the Angular dev-server's Node.js process — that process
 * stays alive across backend restarts, so it can always write the file.
 *
 * Production / IIS / NSSM: there's no Angular dev-server, so this endpoint
 * does not exist. The frontend silently swallows the failure and keeps
 * polling Health; the supervisor (ANCM/NSSM) recycles the worker on its own.
 */

const fs = require('fs');
const path = require('path');

// Resolve the trigger file path. Two layouts supported:
//   1) WuicTest src zip (standalone): `WuicTest/HotReloadTrigger.cs`
//      (alongside WuicTest.csproj). proxy.conf.js sits in
//      `WuicTest/wwwroot/`, so trigger is at `../HotReloadTrigger.cs`.
//   2) Monorepo dev: `KonvergenceCore/HotReloadTrigger.cs` (the watched
//      project is KonvergenceCore in the user's launch config). From
//      `WuicTest/wwwroot/` that's `../../KonvergenceCore/HotReloadTrigger.cs`.
// First match wins. If neither found, the bypass returns 500 with an
// explanatory error so the user can debug.
function resolveTriggerPath() {
  const candidates = [
    path.resolve(__dirname, '..', 'HotReloadTrigger.cs'),                       // WuicTest src zip
    path.resolve(__dirname, '..', '..', 'KonvergenceCore', 'HotReloadTrigger.cs'), // monorepo dev
    'C:\\src\\Wuic\\KonvergenceCore\\HotReloadTrigger.cs',                       // absolute fallback
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {}
  }
  return null;
}

function bumpHotReloadTrigger() {
  const triggerPath = resolveTriggerPath();
  if (!triggerPath) {
    return { ok: false, error: 'HotReloadTrigger.cs not found in any candidate location' };
  }
  try {
    const content = fs.readFileSync(triggerPath, 'utf8');
    // Build a unique method-name suffix from current UTC. ISO-8601 stripped
    // of separators (yyyymmddThhmmssfff) so it's a valid C# identifier suffix.
    const now = new Date();
    const pad = (n, w) => String(n).padStart(w, '0');
    const token = `${now.getUTCFullYear()}${pad(now.getUTCMonth()+1,2)}${pad(now.getUTCDate(),2)}T${pad(now.getUTCHours(),2)}${pad(now.getUTCMinutes(),2)}${pad(now.getUTCSeconds(),2)}${pad(now.getUTCMilliseconds(),3)}`;
    const newContent = content.replace(
      /Bump_[A-Za-z0-9_]+\(\) => 0;/,
      `Bump_${token}() => 0;`
    );
    if (newContent === content) {
      return { ok: false, error: 'pattern Bump_*() not found in trigger file' };
    }
    fs.writeFileSync(triggerPath, newContent, 'utf8');
    return { ok: true, ts: token, path: triggerPath };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

const apiBypass = function(req, res /*, proxyOptions*/) {
  if (req.url === '/api/__dev__/bump-watch-trigger') {
    const result = bumpHotReloadTrigger();
    res.statusCode = result.ok ? 200 : 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result));
    return false; // do NOT forward to backend proxy
  }
  // Returning undefined lets the proxy continue forwarding the request normally.
  return undefined;
};

module.exports = {
  '/api': {
    target: 'http://localhost:5000',
    secure: false,
    changeOrigin: true,
    logLevel: 'warn',
    bypass: apiBypass,
  },
  '/upload': {
    target: 'http://localhost:5000',
    secure: false,
    changeOrigin: true,
    logLevel: 'warn',
  },
};
