using System.Text.Json;
using WuicCrashReceiver.Models;
using WuicCrashReceiver.Services;

var builder = WebApplication.CreateBuilder(args);

// Logging — minimal Console + Debug only. Production deploy redirects to file
// via stdout-redirect (vedi web.config Commit 11) o Serilog appsink se richiesto.
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddDebug();

// LicenseSignatureVerifier singleton: il public key PEM e' embedded nel
// config (`License:PublicKeyPem`). Se assente, il bind fallisce a startup.
// (Coerente con il pattern KonvergenceCore.LicenseValidationService che
//  legge `license-public-key-pem` da appsettings.)
builder.Services.AddSingleton<LicenseSignatureVerifier>(sp =>
{
    var pem = builder.Configuration["License:PublicKeyPem"];
    if (string.IsNullOrWhiteSpace(pem))
    {
        throw new InvalidOperationException(
            "License:PublicKeyPem missing in configuration. " +
            "Set it in appsettings.{Environment}.json or via env var License__PublicKeyPem.");
    }
    return new LicenseSignatureVerifier(pem);
});

builder.Services.AddRouting();
// Skill crash-reporting Commit 8b (M3 server-side filter): registrato PRIMA
// di CrashIngestService perche' quest'ultimo lo prende come dipendenza.
builder.Services.AddSingleton<AllowlistFilter>();
builder.Services.AddSingleton<CrashIngestService>();
builder.Services.AddSingleton<CrashConsentService>();
builder.Services.AddSingleton<AdminCrashService>();

// Skill license-issuing: registry centralizzato delle licenze emesse dal
// vendor. Doppio uso: admin endpoints (register/revoke/list) + lookup
// dall'ingest path per validare ogni crash submitted.
// Connection string derivata internamente da WuicCrashes (vedi
// LicenseRegistryService ctor) — niente chiave WuicLicensing in appsettings.
builder.Services.AddSingleton<LicenseRegistryService>();

// Crash-reporting Commit 11a: deobfuscation server-side on-demand via
// ConfuserEx 2 symbols.map (sostituisce il vecchio ObfuscarMappingParser
// che soffriva del bug Original==New di Obfuscar 2.x).
builder.Services.AddSingleton<ConfuserSymbolMapParser>();
builder.Services.AddSingleton<ConfuserSymbolMapCache>();
builder.Services.AddSingleton<AdminAuth>();

var app = builder.Build();

// Skill crash-reporting Commit 10: serve la WuicCrashAdmin SPA da `/admin/`.
// I file statici vivono in `wwwroot/admin/` del progetto receiver — la
// `UseStaticFiles` con `FileProvider` puntato a quella sottocartella mappa
// `/admin/index.html` → `wwwroot/admin/index.html`. Tutti gli `/api/admin/*`
// endpoint piu' sotto sono gated da `AdminAuth`.
{
    var adminRoot = System.IO.Path.Combine(builder.Environment.ContentRootPath, "wwwroot", "admin");
    if (System.IO.Directory.Exists(adminRoot))
    {
        var fp = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(adminRoot);
        app.UseDefaultFiles(new DefaultFilesOptions
        {
            FileProvider = fp,
            RequestPath = "/admin",
            DefaultFileNames = new List<string> { "index.html" }
        });
        app.UseStaticFiles(new StaticFileOptions
        {
            FileProvider = fp,
            RequestPath = "/admin",
            OnPrepareResponse = ctx =>
            {
                var path = ctx.File.PhysicalPath ?? "";
                if (path.EndsWith("index.html", StringComparison.OrdinalIgnoreCase))
                    ctx.Context.Response.Headers["Cache-Control"] = "no-store";
                else if (path.EndsWith(".js") || path.EndsWith(".css"))
                    ctx.Context.Response.Headers["Cache-Control"] = "public, max-age=600";
            }
        });
    }
    else
    {
        app.Logger.LogWarning("Admin SPA folder not found at {Path}; /admin/ will 404. " +
            "Create wwwroot/admin/ in the receiver project to enable the triage UI.", adminRoot);
    }
}

// ── Endpoints ──────────────────────────────────────────────────────────

// Health check pubblico (no auth). Usato da load balancer / monitoring.
app.MapGet("/health", () => Results.Ok(new
{
    status = "ok",
    service = "WuicCrashReceiver",
    version = "0.1.0",
    timestampUtc = DateTimeOffset.UtcNow.ToString("O"),
}));

// Crash ingest. Auth via license headers:
//   X-Wuic-License-Payload   : base64(JSON con email/expiry/tier/...)
//   X-Wuic-License-Signature : base64(RSA-SHA256 signature)
// Body: JSON CrashReportPayload (vedi Models/CrashReportPayload.cs).
app.MapPost("/api/crash/ingest", async (HttpRequest req,
                                        LicenseSignatureVerifier verifier,
                                        CrashIngestService ingest,
                                        IConfiguration cfg,
                                        ILogger<Program> log,
                                        CancellationToken ct) =>
{
    string licensePayloadB64 = req.Headers["X-Wuic-License-Payload"].ToString();
    string licenseSignatureB64 = req.Headers["X-Wuic-License-Signature"].ToString();

    var verify = verifier.Verify(licensePayloadB64, licenseSignatureB64);
    if (!verify.Valid || verify.Payload is null)
    {
        log.LogWarning("Crash ingest rejected: license verify failed = {Error}", verify.Error);
        return Results.Json(new CrashIngestResponse { Ok = false, Error = "license_invalid" }, statusCode: 401);
    }

    // Grace period: una license expired puo' ancora ingestare crash (utile per
    // catturare i crash tipici di expiry-related code paths). Marchiamo la
    // riga con license_expired_at_ingest=1 cosi' il triage lo vede.
    int graceDays = int.TryParse(cfg["License:GracePeriodDays"], out var g) ? g : 30;
    DateTimeOffset cutoff = DateTimeOffset.UtcNow.AddDays(-graceDays);
    bool licenseExpiredAtIngest = verify.Payload.ExpiryUtc < DateTimeOffset.UtcNow;
    if (verify.Payload.ExpiryUtc < cutoff)
    {
        log.LogWarning("Crash ingest rejected: license past grace ({Expiry} < {Cutoff}) for {Email}",
            verify.Payload.ExpiryUtc, cutoff, verify.Payload.Email);
        return Results.Json(new CrashIngestResponse { Ok = false, Error = "license_past_grace" }, statusCode: 401);
    }

    // Skill license-issuing — registry enforcement (Commit 13).
    // Lookup la license_history row corrispondente al payload base64.
    //
    // Policy hardcoded ADVISORY:
    //   - se la licenza NON e' nel registry → log info + ACCETTA (consente
    //     transizione di clienti esistenti senza rompere ingest mentre li
    //     re-issuamo+syncamo).
    //   - se la licenza E' nel registry e revoked=1 → REJECT 401 license_revoked.
    //
    // Per passare a strict (rifiuto anche dei not-registered), modificare qui.
    // Decisione cosciente: niente toggle in appsettings, e' code-controlled.
    {
        var licReg = app.Services.GetRequiredService<LicenseRegistryService>();
        var entry = await licReg.FindByPayloadAsync(licensePayloadB64, ct);
        if (entry is null)
        {
            log.LogInformation("Crash ingest accepted but license not in registry (advisory) for {Email}",
                verify.Payload.Email);
        }
        else if (entry.Revoked)
        {
            log.LogWarning("Crash ingest rejected: license id={Id} revoked at {RevokedAt} reason={Reason} for {Email}",
                entry.Id, entry.RevokedAt, entry.RevokedReason, entry.Email);
            return Results.Json(new CrashIngestResponse { Ok = false, Error = "license_revoked" }, statusCode: 401);
        }
    }

    CrashReportPayload? body;
    try
    {
        body = await JsonSerializer.DeserializeAsync<CrashReportPayload>(req.Body, cancellationToken: ct);
    }
    catch
    {
        return Results.Json(new CrashIngestResponse { Ok = false, Error = "body_invalid_json" }, statusCode: 400);
    }
    if (body is null)
        return Results.Json(new CrashIngestResponse { Ok = false, Error = "body_missing" }, statusCode: 400);

    var outcome = await ingest.IngestAsync(body, verify.Payload, licenseExpiredAtIngest, ct);
    return Results.Json(new CrashIngestResponse
    {
        Ok = outcome.Ok,
        Error = outcome.Error,
        Id = outcome.Id,
        Occurrences = outcome.Occurrences,
        StackHash = outcome.StackHash,
    }, statusCode: outcome.Ok ? 200 : 400);
});

// Crash consent endpoint (skill crash-reporting Commit 9). Auth via stessi
// license headers dell'ingest. Persiste un audit trail GDPR ogni volta che
// un cliente flippa il toggle CrashReporting.Enabled — append-only su
// `_wuic_crash_consents`.
//
//   POST /api/crash/consent
//   X-Wuic-License-Payload   : base64(JSON license)
//   X-Wuic-License-Signature : base64(RSA-SHA256)
//   Body: { consentGranted, disclaimerVersion, locale?, machineFingerprint?, userAgent? }
//
//   200 { ok:true, id }                  — registrato
//   400 body_*                            — payload malformato
//   401 license_invalid                   — firma non valida
app.MapPost("/api/crash/consent", async (HttpRequest req,
                                          LicenseSignatureVerifier verifier,
                                          CrashConsentService consents,
                                          ILogger<Program> log,
                                          CancellationToken ct) =>
{
    string licensePayloadB64 = req.Headers["X-Wuic-License-Payload"].ToString();
    string licenseSignatureB64 = req.Headers["X-Wuic-License-Signature"].ToString();

    var verify = verifier.Verify(licensePayloadB64, licenseSignatureB64);
    if (!verify.Valid || verify.Payload is null)
    {
        log.LogWarning("Consent rejected: license verify failed = {Error}", verify.Error);
        return Results.Json(new ConsentResponse { Ok = false, Error = "license_invalid" }, statusCode: 401);
    }

    // NOTA: la consent NON ha grace period. Anche con license expired, vogliamo
    // poter REGISTRARE un opt-out (right to withdraw consent — GDPR art. 7.3).

    ConsentRequest? body;
    try
    {
        body = await JsonSerializer.DeserializeAsync<ConsentRequest>(req.Body, cancellationToken: ct);
    }
    catch
    {
        return Results.Json(new ConsentResponse { Ok = false, Error = "body_invalid_json" }, statusCode: 400);
    }
    if (body is null)
        return Results.Json(new ConsentResponse { Ok = false, Error = "body_missing" }, statusCode: 400);

    var clientIp = req.HttpContext.Connection.RemoteIpAddress?.ToString();
    var outcome = await consents.RecordAsync(body, verify.Payload, clientIp, ct);
    return Results.Json(new ConsentResponse
    {
        Ok = outcome.Ok,
        Error = outcome.Error,
        Id = outcome.Id,
    }, statusCode: outcome.Ok ? 200 : 400);
});

// Deobfuscation admin endpoint (skill crash-reporting Commit 5). Auth via
//   Authorization: Bearer <Admin:BearerToken di appsettings>
// Body JSON DeobfuscateRequest { release, assembly, stack }. Ritorna lo
// stack trace deobfuscato applicando il Mapping.txt corrispondente
// uploadato dal CI deploy-release.ps1 sotto
//   {CrashReceiver:MappingsRoot}/{release}/{assembly}-Mapping.txt
//
// 401 se token mancante/invalid; 400 se body malformato; 404 se mapping
// non trovato per (release, assembly); 200 con `{ ok, deobfuscated }`
// altrimenti.
app.MapPost("/api/crash/deobfuscate", async (HttpRequest req,
                                              AdminAuth auth,
                                              ConfuserSymbolMapCache cache,
                                              ConfuserSymbolMapParser parser,
                                              ILogger<Program> log,
                                              CancellationToken ct) =>
{
    if (!auth.Authorize(req, out var authError))
        return Results.Json(new DeobfuscateResponse { Ok = false, Error = authError }, statusCode: 401);

    DeobfuscateRequest? body;
    try
    {
        body = await JsonSerializer.DeserializeAsync<DeobfuscateRequest>(req.Body, cancellationToken: ct);
    }
    catch
    {
        return Results.Json(new DeobfuscateResponse { Ok = false, Error = "body_invalid_json" }, statusCode: 400);
    }
    if (body is null)
        return Results.Json(new DeobfuscateResponse { Ok = false, Error = "body_missing" }, statusCode: 400);
    if (string.IsNullOrWhiteSpace(body.Release))
        return Results.Json(new DeobfuscateResponse { Ok = false, Error = "release_missing" }, statusCode: 400);
    if (string.IsNullOrWhiteSpace(body.Assembly))
        return Results.Json(new DeobfuscateResponse { Ok = false, Error = "assembly_missing" }, statusCode: 400);
    if (string.IsNullOrWhiteSpace(body.Stack))
        return Results.Json(new DeobfuscateResponse { Ok = false, Error = "stack_missing" }, statusCode: 400);

    var mapping = cache.TryGet(body.Release.Trim(), body.Assembly.Trim());
    if (mapping is null)
    {
        log.LogInformation("Deobfuscate: mapping not found for release={Release} asm={Asm}",
            body.Release, body.Assembly);
        return Results.Json(new DeobfuscateResponse { Ok = false, Error = "mapping_not_found" }, statusCode: 404);
    }

    var deob = parser.Apply(mapping, body.Stack!);
    return Results.Json(new DeobfuscateResponse
    {
        Ok = true,
        Deobfuscated = deob,
        Stats = new DeobfuscateStats
        {
            EntryCount = mapping.EntryCount,
            SkippedLineCount = mapping.SkippedLineCount,
            Collisions = mapping.Collisions.Count,
        }
    });
});

// ── Admin endpoints (skill crash-reporting Commit 10) ─────────────────
// Tutti gated da `AdminAuth.Authorize` (IP whitelist + bearer fallback).
// In Production: Decisione 12 → solo IP whitelist.
// In Development:  loopback + bearer "dev-bearer-token-not-for-production".

app.MapGet("/api/admin/crash/list", async (HttpRequest req,
                                            AdminAuth auth,
                                            AdminCrashService svc,
                                            CancellationToken ct) =>
{
    if (!auth.Authorize(req, out var err))
        return Results.Json(new AdminGenericResponse { Ok = false, Error = err }, statusCode: 401);

    int.TryParse(req.Query["page"], out var page);
    int.TryParse(req.Query["pageSize"], out var pageSize);
    DateTime? since = DateTime.TryParse(req.Query["since"], out var s) ? s.ToUniversalTime() : null;
    int? resolved = int.TryParse(req.Query["resolved"], out var r) ? r : null;

    var filters = new AdminListFilters
    {
        ErrorCode = req.Query["errorCode"].ToString() is { Length: > 0 } ec ? ec : null,
        ClientId = req.Query["clientId"].ToString() is { Length: > 0 } ci ? ci : null,
        Resolved = resolved,
        Since = since,
        Page = page == 0 ? 1 : page,
        PageSize = pageSize == 0 ? 50 : pageSize,
    };
    var resp = await svc.ListAsync(filters, ct);
    return Results.Json(resp);
});

app.MapGet("/api/admin/crash/{id:long}", async (long id,
                                                  HttpRequest req,
                                                  AdminAuth auth,
                                                  AdminCrashService svc,
                                                  CancellationToken ct) =>
{
    if (!auth.Authorize(req, out var err))
        return Results.Json(new AdminGenericResponse { Ok = false, Error = err }, statusCode: 401);
    var detail = await svc.GetDetailAsync(id, ct);
    if (detail is null)
        return Results.Json(new AdminGenericResponse { Ok = false, Error = "not_found" }, statusCode: 404);
    return Results.Json(detail);
});

app.MapPost("/api/admin/crash/{id:long}/resolve", async (long id,
                                                           HttpRequest req,
                                                           AdminAuth auth,
                                                           AdminCrashService svc,
                                                           CancellationToken ct) =>
{
    if (!auth.Authorize(req, out var err))
        return Results.Json(new AdminGenericResponse { Ok = false, Error = err }, statusCode: 401);

    AdminResolveRequest? body;
    try { body = await JsonSerializer.DeserializeAsync<AdminResolveRequest>(req.Body, cancellationToken: ct); }
    catch { return Results.Json(new AdminGenericResponse { Ok = false, Error = "body_invalid_json" }, statusCode: 400); }
    if (body is null)
        return Results.Json(new AdminGenericResponse { Ok = false, Error = "body_missing" }, statusCode: 400);

    var ok = await svc.SetResolvedAsync(id, body, ct);
    if (!ok)
        return Results.Json(new AdminGenericResponse { Ok = false, Error = "not_found_or_db_error" }, statusCode: 404);
    return Results.Json(new AdminGenericResponse { Ok = true });
});

// ── License admin endpoints (skill license-issuing) ──────────────────
// Tutti gated da AdminAuth (IP whitelist + bearer fallback).

// POST /api/admin/licenses — register/upsert dal vendor tool license-issue.ps1 -SyncRemote.
app.MapPost("/api/admin/licenses", async (HttpRequest req,
                                            AdminAuth auth,
                                            LicenseRegistryService licReg,
                                            CancellationToken ct) =>
{
    if (!auth.Authorize(req, out var err))
        return Results.Json(new LicenseRegisterResponse { Ok = false, Error = err }, statusCode: 401);
    LicenseRegisterRequest? body;
    try { body = await JsonSerializer.DeserializeAsync<LicenseRegisterRequest>(req.Body, cancellationToken: ct); }
    catch { return Results.Json(new LicenseRegisterResponse { Ok = false, Error = "body_invalid_json" }, statusCode: 400); }
    if (body is null)
        return Results.Json(new LicenseRegisterResponse { Ok = false, Error = "body_missing" }, statusCode: 400);

    var (ok, errMsg, id, customerId) = await licReg.RegisterAsync(body, ct);
    return Results.Json(new LicenseRegisterResponse
    {
        Ok = ok,
        Error = errMsg,
        Id = id,
        CustomerId = customerId,
    }, statusCode: ok ? 200 : 400);
});

// POST /api/admin/licenses/{id}/revoke — revoca una specifica license_history row.
app.MapPost("/api/admin/licenses/{id:long}/revoke", async (long id,
                                                              HttpRequest req,
                                                              AdminAuth auth,
                                                              LicenseRegistryService licReg,
                                                              CancellationToken ct) =>
{
    if (!auth.Authorize(req, out var err))
        return Results.Json(new AdminGenericResponse { Ok = false, Error = err }, statusCode: 401);
    LicenseRevokeRequest? body;
    try { body = await JsonSerializer.DeserializeAsync<LicenseRevokeRequest>(req.Body, cancellationToken: ct); }
    catch { return Results.Json(new AdminGenericResponse { Ok = false, Error = "body_invalid_json" }, statusCode: 400); }
    body ??= new LicenseRevokeRequest();

    var actor = req.HttpContext.Connection.RemoteIpAddress?.ToString();
    var (ok, errMsg) = await licReg.RevokeAsync(id, body.Reason, actor, ct);
    if (!ok)
        return Results.Json(new AdminGenericResponse { Ok = false, Error = errMsg }, statusCode: errMsg == "not_found" ? 404 : 500);
    return Results.Json(new AdminGenericResponse { Ok = true });
});

// POST /api/admin/versions — registra un push npm/NuGet dalla pipeline
// `deploy-release.ps1 :: Register-WuicVersionHistory`. Skill license-issuing.
// Comportamento best-effort lato pipeline: una fail di questo endpoint NON
// blocca il deploy (la pipeline gia' logga warning in quel caso).
app.MapPost("/api/admin/versions", async (HttpRequest req,
                                            AdminAuth auth,
                                            LicenseRegistryService licReg,
                                            CancellationToken ct) =>
{
    if (!auth.Authorize(req, out var err))
        return Results.Json(new VersionRegisterResponse { Ok = false, Error = err }, statusCode: 401);
    VersionRegisterRequest? body;
    try { body = await JsonSerializer.DeserializeAsync<VersionRegisterRequest>(req.Body, cancellationToken: ct); }
    catch { return Results.Json(new VersionRegisterResponse { Ok = false, Error = "body_invalid_json" }, statusCode: 400); }
    if (body is null)
        return Results.Json(new VersionRegisterResponse { Ok = false, Error = "body_missing" }, statusCode: 400);

    var (ok, errMsg, id) = await licReg.RegisterVersionAsync(body, ct);
    return Results.Json(new VersionRegisterResponse
    {
        Ok = ok,
        Error = errMsg,
        Id = id,
    }, statusCode: ok ? 200 : 400);
});

// GET /api/admin/licenses?email=&includeRevoked=&limit=&offset= — list paginated.
app.MapGet("/api/admin/licenses", async (HttpRequest req,
                                           AdminAuth auth,
                                           LicenseRegistryService licReg,
                                           CancellationToken ct) =>
{
    if (!auth.Authorize(req, out var err))
        return Results.Json(new LicenseListResponse { Ok = false }, statusCode: 401);
    var emailFilter = req.Query["email"].ToString() is { Length: > 0 } e ? e : null;
    var includeRevoked = bool.TryParse(req.Query["includeRevoked"], out var ir) && ir;
    int.TryParse(req.Query["limit"], out var limit);
    int.TryParse(req.Query["offset"], out var offset);
    if (limit == 0) limit = 50;
    var resp = await licReg.ListAsync(emailFilter, includeRevoked, limit, offset, ct);
    return Results.Json(resp);
});

app.Logger.LogInformation("WuicCrashReceiver starting on {Urls}", string.Join(", ", app.Urls));
app.Run();
