using System.Net;

namespace WuicCrashReceiver.Services;

/// <summary>
///  Admin authorization gate per gli endpoint riservati (es. /api/crash/deobfuscate).
///
///  ── Decisione di design (skill crash-reporting Decisione 12) ─────────
///  L'auth admin in produzione e' SOLO IP whitelist: il receiver e' deployato
///  dietro IIS che enforza ipSecurity a livello di richiesta. Questa classe
///  duplica il check in-app per defense-in-depth (e per dev/test dove IIS
///  non c'e').
///
///  ── Strategia layered ─────────────────────────────────────────────────
///  Richiesta autorizzata se almeno una delle seguenti e' vera:
///    (a) RemoteIp e' loopback E <c>Admin:AllowLoopback</c> e' true
///        (default true in Development, false in Production).
///    (b) RemoteIp matcha uno degli IP in <c>Admin:AllowedIp</c> (CSV).
///    (c) Bearer fallback: header <c>Authorization: Bearer &lt;token&gt;</c>
///        matcha <c>Admin:BearerToken</c> (richiesta autorizzata SOLO se il
///        token e' configurato; serve come emergency override in dev e come
///        defense-in-depth ridondante in prod).
///
///  In Production deve essere settato almeno (b) altrimenti tutti gli admin
///  endpoint sono fail-closed.
///
///  Confronto bearer in costante-tempo per evitare timing oracle.
/// </summary>
public sealed class AdminAuth
{
    private readonly string[] _allowedIps;
    private readonly bool _allowLoopback;
    private readonly string _bearerToken;
    private readonly ILogger<AdminAuth> _log;

    public AdminAuth(IConfiguration configuration, IHostEnvironment env, ILogger<AdminAuth> log)
    {
        _log = log;
        var raw = configuration["Admin:AllowedIp"] ?? string.Empty;
        _allowedIps = raw.Split(new[] { ',', ';', ' ' },
            StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        // AllowLoopback: explicit setting wins; otherwise true in Development, false elsewhere.
        var allowLoopbackRaw = configuration["Admin:AllowLoopback"];
        _allowLoopback = allowLoopbackRaw is null
            ? env.IsDevelopment()
            : (bool.TryParse(allowLoopbackRaw, out var b) && b);

        _bearerToken = configuration["Admin:BearerToken"] ?? string.Empty;
    }

    public bool IsConfigured => _allowedIps.Length > 0
        || _allowLoopback
        || !string.IsNullOrWhiteSpace(_bearerToken);

    /// <summary>
    ///  Autorizza una richiesta. <paramref name="error"/> contiene un codice
    ///  diagnostico stabile in caso di fallimento (mai il token in plaintext).
    /// </summary>
    public bool Authorize(HttpRequest request, out string error)
    {
        if (!IsConfigured)
        {
            _log.LogWarning("AdminAuth: rejected — no admin gate configured (set Admin:AllowedIp or Admin:BearerToken)");
            error = "admin_auth_not_configured";
            return false;
        }

        var remote = request.HttpContext.Connection.RemoteIpAddress;
        if (remote is not null)
        {
            if (_allowLoopback && IPAddress.IsLoopback(remote))
            {
                error = string.Empty;
                return true;
            }
            foreach (var allowed in _allowedIps)
            {
                if (IPAddress.TryParse(allowed, out var parsed) && parsed.Equals(remote))
                {
                    error = string.Empty;
                    return true;
                }
            }
        }

        // Bearer fallback (defense-in-depth, optional).
        if (!string.IsNullOrWhiteSpace(_bearerToken))
        {
            var header = request.Headers.Authorization.ToString();
            const string prefix = "Bearer ";
            if (!string.IsNullOrEmpty(header) && header.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                var presented = header[prefix.Length..].Trim();
                if (presented.Length > 0)
                {
                    var a = System.Text.Encoding.UTF8.GetBytes(presented);
                    var b = System.Text.Encoding.UTF8.GetBytes(_bearerToken);
                    if (a.Length == b.Length
                        && System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(a, b))
                    {
                        error = string.Empty;
                        return true;
                    }
                }
            }
        }

        error = "admin_unauthorized";
        return false;
    }
}
