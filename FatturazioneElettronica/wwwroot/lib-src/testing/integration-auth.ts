type IntegrationAuthConfig = {
  username?: string;
  password?: string;
  loginUrl?: string;
};

let sessionPromise: Promise<void> | null = null;

function parseMaybeJson(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function isLegacyLoginSuccess(payload: any): boolean {
  if (payload == null) {
    return false;
  }

  if (typeof payload === 'string') {
    return payload.toLowerCase().includes('"islogged":true');
  }

  if (typeof payload === 'object') {
    if (payload.isLogged === true || payload.isLogged === 'true') {
      return true;
    }

    if (typeof payload.value === 'string') {
      const parsedValue = parseMaybeJson(payload.value);
      return isLegacyLoginSuccess(parsedValue);
    }
  }

  return false;
}

function extractLegacyLoginPayload(payload: any): any {
  if (payload == null) {
    return null;
  }

  if (typeof payload === 'string') {
    return parseMaybeJson(payload);
  }

  if (typeof payload === 'object' && typeof payload.value === 'string') {
    return parseMaybeJson(payload.value);
  }

  return payload;
}

function setKUserCookieFromLoginPayload(payload: any): void {
  const user = extractLegacyLoginPayload(payload);
  if (!user || (user.isLogged !== true && user.isLogged !== 'true')) {
    return;
  }

  const languageId = user?.lingua?.id || user?.language || 'it-IT';
  const languageLabel = user?.lingua?.lingua || (typeof languageId === 'string' ? languageId.split('-')[0].toUpperCase() : 'IT');
  const normalized = {
    user_id: Number(user.user_id ?? 0),
    user_name: user.user_name || user.username || '',
    display_name: user.display_name || user.username || '',
    role: user.role || '',
    role_id: Number(user.role_id ?? 0),
    isAdmin: user.isAdmin === true || user.isAdmin === 'true' || Number(user.role_id ?? 0) === 1 || String(user.role || '').toLowerCase() === 'admin',
    lingua: {
      id: languageId,
      lingua: languageLabel
    }
  };

  document.cookie = `k-user=${encodeURIComponent(JSON.stringify(normalized))}; path=/`;
}

function resolveAsmxBase(requestUrl: string): string {
  const token = 'MetaService.';
  const idx = requestUrl.indexOf(token);
  if (idx >= 0) {
    return requestUrl.substring(0, idx);
  }

  return requestUrl.endsWith('/') ? requestUrl : `${requestUrl}/`;
}

function readAuthConfig(): IntegrationAuthConfig | null {
  const cfg = (window as any).__WUIC_INTEGRATION__?.auth as IntegrationAuthConfig | undefined;
  if (!cfg?.username || !cfg?.password) {
    return null;
  }

  return cfg;
}

export async function ensureIntegrationSession(requestUrl: string): Promise<void> {
  if (sessionPromise) {
    return sessionPromise;
  }

  const cfg = readAuthConfig();
  if (!cfg) {
    return;
  }

  sessionPromise = (async () => {
    const asmxBase = resolveAsmxBase(requestUrl);
    const loginUrl = cfg.loginUrl || `${asmxBase}MetaService.login`;

    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      credentials: 'include',
      body: JSON.stringify({
        user_name: cfg.username,
        password: cfg.password
      })
    });

    if (!response.ok) {
      throw new Error(`Integration auth failed: HTTP ${response.status} ${response.statusText} for ${loginUrl}`);
    }

    const raw = await response.text();
    const parsed = parseMaybeJson(raw);
    if (!isLegacyLoginSuccess(parsed)) {
      throw new Error('Integration auth failed: MetaService.login did not return isLogged=true. Set window.__WUIC_INTEGRATION__.auth credentials.');
    }

    setKUserCookieFromLoginPayload(parsed);
  })();

  return sessionPromise;
}
