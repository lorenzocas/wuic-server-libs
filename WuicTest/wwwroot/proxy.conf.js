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

// ---------------------------------------------------------------------------
// Silenziamento errori proxy quando il backend non e' (ancora) raggiungibile.
//
// Il dev-server Angular usa il proxy di Vite (prefisso log `[vite] http proxy
// error`). Vite ignora `logLevel` (opzione http-proxy-middleware) e stampa il
// suo stack AggregateError ad ogni chiamata verso un backend down: rumore inutile
// durante la race di avvio (FE parte prima del BE) o un restart del BE. NB: NON
// e' un problema in produzione (IIS/NSSM servono same-origin, senza proxy).
//
// `silentConfigure` rimuove l'handler d'errore rumoroso che Vite aggiunge PRIMA
// di invocare `configure`, e installa il nostro: una riga throttled + risposta
// 503 pulita (o destroy del socket per gli upgrade WS). Funziona anche col
// dev-server webpack legacy (che onora `configure`/`onError`).
let _lastProxyWarn = 0;
function onProxyError(err, req, res) {
  const code = (err && (err.code || (err.errors && err.errors[0] && err.errors[0].code))) || '';
  const msg = (err && err.message) || '';
  const transient =
    code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ETIMEDOUT' || /socket hang up/i.test(msg);
  if (transient) {
    const now = Date.now();
    if (now - _lastProxyWarn > 3000) {
      console.warn('[proxy] backend non ancora raggiungibile (' + (code || 'connessione rifiutata') + ') — avvialo/attendi, riprovo…');
      _lastProxyWarn = now;
    }
  } else {
    console.error('[proxy] error:', msg || err);
  }
  try {
    if (res && typeof res.writeHead === 'function' && !res.headersSent) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end('{"error":"backend-unreachable"}');
    } else if (res && typeof res.destroy === 'function') {
      res.destroy(); // socket upgrade WS: niente writeHead
    }
  } catch { /* ignore */ }
}

function silentConfigure(proxy /*, options */) {
  proxy.removeAllListeners('error'); // droppa l'handler stack-noisy di Vite (aggiunto prima di configure)
  proxy.on('error', onProxyError);
}

// Target backend parametrico: il dispatcher docs-driven puo' spostare il BE su
// un'altra porta (es. :5210 quando :5000 e' occupata da un altro progetto)
// esportando WUIC_E2E_BACKEND_URL via Launch.Frontend.EnvVars. Default: :5000
// (comportamento storico, invariato per il dev manuale).
const BACKEND_TARGET = process.env.WUIC_E2E_BACKEND_URL || 'http://localhost:5000';

module.exports = {
  '/api': {
    target: BACKEND_TARGET,
    secure: false,
    changeOrigin: true,
    logLevel: 'silent',
    configure: silentConfigure,
    onError: onProxyError,
    bypass: apiBypass,
  },
  '/upload': {
    target: BACKEND_TARGET,
    secure: false,
    changeOrigin: true,
    logLevel: 'silent',
    configure: silentConfigure,
    onError: onProxyError,
  },
  // WebSocket notifiche realtime (NotificationRealtimeService -> /ws/notifications).
  // `ws: true` e' OBBLIGATORIO: senza, il dev-server NON inoltra l'upgrade WebSocket
  // al backend -> handshake timeout (close code 1006) -> niente push live, le
  // notifiche (e il refresh del messaggio chatbot) arrivano solo al reload manuale.
  '/ws': {
    target: BACKEND_TARGET,
    secure: false,
    changeOrigin: true,
    ws: true,
    logLevel: 'silent',
    configure: silentConfigure,
    onError: onProxyError,
  },
};
