using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using System.Threading.RateLimiting;
using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;

// =============================================================================
//  WUIC Site — Tiny PayPal capture API
//  Single-file minimal API that creates and captures PayPal orders
//  server-side, hiding the Client SECRET from the browser bundle and avoiding
//  the unreliable client-side SDK capture flow (which fails in sandbox with
//  "Buyer access token not present" cookie issues).
//
//  Endpoints:
//   POST /api/paypal/create-order   { sku, amountEur, label, ...buyerInfo }
//                                     -> { orderId }
//   POST /api/paypal/capture-order  { orderId }
//                                     -> { orderId, payerEmail, amount,
//                                          currency, productLabel,
//                                          captureId, status }
//
//  Config (appsettings.json — single file, server-managed in production):
//   "Paypal": {
//     "Mode": "sandbox" | "live",
//     "Sandbox": { "ClientId": "...", "ClientSecret": "..." },
//     "Live":    { "ClientId": "...", "ClientSecret": "..." }
//   }
//   "AllowedOrigins": [ "https://wuic-framework.com" ]
//
//  Production CORS allows ONLY the public site (audit 2026-05-02 · L-01).
//  For local Angular dev (`ng serve` on :4200), appsettings.Development.json
//  adds `http://localhost:4200` to AllowedOrigins; that file is gitignored
//  and never deployed.
//
//  The repo ships a placeholder appsettings.json. The deploy script
//  EXCLUDES it from upload, so the server-managed file with real secrets
//  is never overwritten. For local dev with real sandbox secrets, override
//  via appsettings.Development.json (gitignored) — DO NOT put real secrets
//  in the committed appsettings.json.
// =============================================================================

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHttpClient();
builder.Services.AddSingleton<PaypalClient>();
builder.Services.AddSingleton<EmailSender>();
builder.Services.Configure<JsonSerializerOptions>(o =>
{
    o.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    o.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});

// CORS: production whitelists only the public site origin. Local dev adds
// http://localhost:4200 via appsettings.Development.json (gitignored on
// purpose — security audit 2026-05-02 · L-01). The fallback below is
// production-safe so a misdeploy without an AllowedOrigins section can't
// silently re-enable the dev origin.
builder.Services.AddCors(o =>
{
    var origins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>()
                  ?? new[] { "https://wuic-framework.com" };
    o.AddDefaultPolicy(p => p
        .WithOrigins(origins)
        .AllowAnyHeader()
        .AllowAnyMethod());
});

// Rate limit on /paypal/create-order and /paypal/capture-order so a hostile
// caller can't burn through PayPal API quota or generate spurious traffic
// against the merchant account (audit 2026-05-02 · M-02). 10 req/min/IP is
// well above legitimate buyer traffic (a normal checkout is 1 create + 1
// capture) but tight enough to make abuse expensive.
builder.Services.AddRateLimiter(opt =>
{
    opt.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    opt.AddPolicy("paypal-fixed", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true,
            }));
});

var app = builder.Build();
app.UseCors();
app.UseRateLimiter();

// Security response headers are emitted by IIS at the parent scope via
// WuicSite/web.config <httpProtocol><customHeaders>. Live verification on
// 2026-05-02 confirmed those headers (HSTS, X-Content-Type-Options,
// X-Frame-Options, Referrer-Policy, COOP, CORP, CSP, Permissions-Policy)
// reach /api/* responses too — IIS applies <httpProtocol> outbound at the
// site level, regardless of `inheritInChildApplications="false"` on the
// sub-app's <location>. Adding the same headers from C# middleware here
// just produced duplicate headers in the wire response, so we leave it to
// the parent IIS layer.

// Public PayPal config — propagates ClientId + Mode + Currency to the
// browser SDK at runtime so that switching sandbox <-> live is a
// single appsettings.json edit on the server (no Angular rebuild).
//
// Returns ONLY non-secret values: ClientId is a PUBLIC identifier, safe
// to expose. The Client SECRET stays server-only and is never serialized.
//
// `configured` is false if the relevant ClientId is empty or still a
// REPLACE_* placeholder, so the frontend can show a friendly "PayPal not
// configured" message instead of trying to load a broken SDK URL.
app.MapGet("/paypal/config", (IConfiguration cfg) =>
{
    var mode = (cfg["Paypal:Mode"] ?? "sandbox").Trim().ToLowerInvariant();
    if (mode != "live") mode = "sandbox";
    var section = mode == "live" ? "Paypal:Live" : "Paypal:Sandbox";
    var clientId = (cfg[$"{section}:ClientId"] ?? "").Trim();
    var currency = (cfg["Paypal:Currency"] ?? "EUR").Trim().ToUpperInvariant();
    var configured = !string.IsNullOrWhiteSpace(clientId)
                     && !clientId.StartsWith("REPLACE_", StringComparison.OrdinalIgnoreCase);
    return Results.Ok(new
    {
        mode,
        clientId = configured ? clientId : "",
        currency,
        configured,
    });
});

// Health check — useful for the deploy script and for monitoring.
//
// NOTE on routing prefix: when this app runs as an IIS sub-application
// mounted at `/api`, IIS strips the `/api` prefix from the incoming URL
// before handing the request to the .NET worker. So the endpoint paths
// below DO NOT include `/api/` — the frontend still calls them as
// `/api/health`, `/api/paypal/...` (because IIS adds the prefix back from
// the sub-app mount), but inside the app we see them without it.
// During local `dotnet run` (no IIS) the apiBaseUrl in environment.ts
// already includes `/api` if you want to mirror the sub-app behavior, or
// just hit `http://localhost:5080/health` directly.
app.MapGet("/health", () => Results.Ok(new { ok = true, ts = DateTimeOffset.UtcNow }));

// ─── Create order ──────────────────────────────────────────────────────────
// Called from the frontend `createOrder` callback BEFORE the buyer sees the
// PayPal popup. We talk to PayPal v2 Orders API server-side so the amount/SKU
// can't be tampered with by a hostile browser.
app.MapPost("/paypal/create-order",
    async (CreateOrderRequest req, PaypalClient paypal, ILogger<Program> log) =>
{
    if (req is null || req.AmountEur <= 0 || string.IsNullOrWhiteSpace(req.Sku))
        return Results.BadRequest(new { error = "missing sku/amount" });

    // Hard cap to avoid accidental misconfiguration sending big numbers.
    if (req.AmountEur > 100_000m)
        return Results.BadRequest(new { error = "amount too high" });

    var product = ProductCatalog.Resolve(req.Sku);
    if (product is null)
        return Results.BadRequest(new { error = "unknown sku" });

    // Server is the source of truth for price — frontend amount is informational
    // only. Mismatch logs a warning so we can spot tampering attempts.
    if (Math.Abs(product.PriceEur - req.AmountEur) > 0.01m)
        log.LogWarning("Amount mismatch on sku {Sku}: client={Client} server={Server}",
                       req.Sku, req.AmountEur, product.PriceEur);

    log.LogInformation(
        "PayPal create-order sku={Sku} amount={Amount} email={Email} hasInvoicing={HasInv}",
        product.Sku, product.PriceEur, req.Email,
        !string.IsNullOrWhiteSpace(req.InvoicingVatNumber)
        || !string.IsNullOrWhiteSpace(req.InvoicingCompanyName));

    try
    {
        var orderId = await paypal.CreateOrderAsync(product, req);
        return Results.Ok(new { orderId });
    }
    catch (Exception ex)
    {
        // Don't leak PayPal API internals (debug_id, raw error JSON) to the
        // client — security audit 2026-05-02 · M-01. Full body is in the
        // server log for troubleshooting.
        log.LogError(ex, "PayPal create-order failed sku={Sku}", req.Sku);
        return Results.Problem(
            statusCode: 502,
            title: "payment provider unavailable",
            detail: "Unable to create the order. Please retry or contact support.");
    }
}).RequireRateLimiting("paypal-fixed");

// ─── Capture order ─────────────────────────────────────────────────────────
// Called from the frontend `onApprove` callback. Captures the funds, then
// returns the canonical receipt + echoes back the buyer info we need to
// build the success email.
app.MapPost("/paypal/capture-order",
    async (CaptureOrderRequest req, PaypalClient paypal, EmailSender mailer, ILogger<Program> log) =>
{
    if (req is null || string.IsNullOrWhiteSpace(req.OrderId))
        return Results.BadRequest(new { error = "missing orderId" });

    try
    {
        var capture = await paypal.CaptureOrderAsync(req.OrderId);
        log.LogInformation("PayPal capture-order ok orderId={OrderId} payer={Payer} amount={Amount}",
                           capture.OrderId, capture.PayerEmail, capture.Amount);

        // Best-effort: invia notifica email all'indirizzo di licensing.
        // NON dipende dal click del bottone "Invia fingerprint via email" del
        // frontend (mailto-based, opzionale). Se SMTP non e' configurato o
        // l'invio fallisce, logga ma NON fa fallire la capture: il pagamento
        // e' gia' stato preso, l'utente vede comunque la schermata success.
        try
        {
            await mailer.SendCaptureNotificationAsync(capture, req);
        }
        catch (Exception mailEx)
        {
            log.LogError(mailEx, "Email notification failed for orderId={OrderId} (capture succeeded, license issuer must be notified manually)", capture.OrderId);
        }

        return Results.Ok(capture);
    }
    catch (Exception ex)
    {
        // Don't leak PayPal API internals (debug_id, raw error JSON) to the
        // client — security audit 2026-05-02 · M-01. Full body is in the
        // server log for troubleshooting.
        log.LogError(ex, "PayPal capture-order failed orderId={OrderId}", req.OrderId);
        return Results.Problem(
            statusCode: 502,
            title: "payment provider unavailable",
            detail: "Unable to capture this payment. Please retry or contact support.");
    }
}).RequireRateLimiting("paypal-fixed");

app.Run();

// ─── DTOs ──────────────────────────────────────────────────────────────────

public record CreateOrderRequest(
    string Sku,
    decimal AmountEur,
    string? Currency,
    string? Label,
    string? Email,
    string? MachineFingerprint,
    string? InvoicingCompanyName,
    string? InvoicingVatNumber,
    string? InvoicingSdiCode,
    string? InvoicingAddress
);

public record CaptureOrderRequest(
    string OrderId,
    string? Email,
    string? MachineFingerprint,
    string? InvoicingCompanyName,
    string? InvoicingVatNumber,
    string? InvoicingSdiCode,
    string? InvoicingAddress
);

public record CaptureResult(
    string OrderId,
    string PayerEmail,
    string Amount,
    string Currency,
    string ProductLabel,
    string CaptureId,
    string Status
);

public record CatalogItem(string Sku, string Label, decimal PriceEur);

// ─── Catalog (server-authoritative pricing) ────────────────────────────────
//
//  Mirrors WuicSite/src/app/pages/pricing/paypal.config.ts PRODUCTS, but with
//  the server as source of truth so a hostile client can't pay €1 for a €1200
//  license. Keep these in sync when prices change.

public static class ProductCatalog
{
    private static readonly Dictionary<string, CatalogItem> Items =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["wuic-dev-12m"]       = new("wuic-dev-12m",       "WUIC Developer — Licenza annuale",                   600m),
            ["wuic-pro-12m"]       = new("wuic-pro-12m",       "WUIC Professional — Licenza annuale",              1200m),
            ["wuic-dev-ext-12m"]   = new("wuic-dev-ext-12m",   "WUIC Developer — Estensione manutenzione 12 mesi",   300m),
            ["wuic-pro-ext-12m"]   = new("wuic-pro-ext-12m",   "WUIC Professional — Estensione manutenzione 12 mesi",600m),
            ["wuic-fp-extra-12m"]  = new("wuic-fp-extra-12m",  "Fingerprint aggiuntivo — 1 server extra",            200m),
        };

    public static CatalogItem? Resolve(string sku) =>
        Items.TryGetValue(sku, out var item) ? item : null;
}

// ─── PayPal HTTP client ────────────────────────────────────────────────────
//
//  Talks to PayPal's v2 REST API. Caches the OAuth bearer token in memory
//  (PayPal returns expires_in seconds, default ~32400s = 9h; we refresh 5min
//  early to avoid edge races).

public sealed class PaypalClient
{
    private readonly IHttpClientFactory _httpFactory;
    private readonly IConfiguration _cfg;
    private readonly ILogger<PaypalClient> _log;

    private string? _cachedToken;
    private DateTimeOffset _tokenExpiresAt = DateTimeOffset.MinValue;
    // Mode (sandbox/live) under which `_cachedToken` was issued — used to
    // invalidate the cache when the operator flips Mode in appsettings.json
    // at runtime. Without this, switching sandbox <-> live would keep using
    // the old-environment token until it naturally expires (~9h), and every
    // call to the new endpoint would 401 with invalid_token in the meantime.
    // ASP.NET Core auto-reloads IConfiguration on file change, so the new
    // Mode is picked up by the next request — but our cached token isn't.
    private string _cachedTokenMode = "";
    private readonly SemaphoreSlim _tokenLock = new(1, 1);

    public PaypalClient(IHttpClientFactory httpFactory, IConfiguration cfg, ILogger<PaypalClient> log)
    {
        _httpFactory = httpFactory;
        _cfg = cfg;
        _log = log;
    }

    private string ApiBase
    {
        get
        {
            var mode = _cfg["Paypal:Mode"]?.ToLowerInvariant() ?? "sandbox";
            return mode == "live"
                ? "https://api-m.paypal.com"
                : "https://api-m.sandbox.paypal.com";
        }
    }

    private (string ClientId, string ClientSecret) Credentials
    {
        get
        {
            var mode = _cfg["Paypal:Mode"]?.ToLowerInvariant() ?? "sandbox";
            var section = mode == "live" ? "Paypal:Live" : "Paypal:Sandbox";
            var id = _cfg[$"{section}:ClientId"];
            var secret = _cfg[$"{section}:ClientSecret"];
            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(secret))
                throw new InvalidOperationException(
                    $"PayPal credentials missing in appsettings ({section}:ClientId/ClientSecret)");
            return (id, secret);
        }
    }

    private async Task<string> GetAccessTokenAsync()
    {
        var currentMode = (_cfg["Paypal:Mode"] ?? "sandbox").ToLowerInvariant();
        if (_cachedToken is not null
            && _cachedTokenMode == currentMode
            && DateTimeOffset.UtcNow < _tokenExpiresAt)
            return _cachedToken;

        await _tokenLock.WaitAsync();
        try
        {
            if (_cachedToken is not null
                && _cachedTokenMode == currentMode
                && DateTimeOffset.UtcNow < _tokenExpiresAt)
                return _cachedToken;

            var (clientId, clientSecret) = Credentials;
            var basic = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{clientId}:{clientSecret}"));

            using var http = _httpFactory.CreateClient();
            using var req = new HttpRequestMessage(HttpMethod.Post, $"{ApiBase}/v1/oauth2/token");
            req.Headers.Authorization = new AuthenticationHeaderValue("Basic", basic);
            req.Content = new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string,string>("grant_type", "client_credentials"),
            });

            using var res = await http.SendAsync(req);
            var body = await res.Content.ReadAsStringAsync();
            if (!res.IsSuccessStatusCode)
                throw new InvalidOperationException(
                    $"PayPal OAuth failed ({(int)res.StatusCode}): {body}");

            using var doc = JsonDocument.Parse(body);
            var token = doc.RootElement.GetProperty("access_token").GetString()!;
            var expiresIn = doc.RootElement.GetProperty("expires_in").GetInt32();

            _cachedToken = token;
            _cachedTokenMode = currentMode;
            _tokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(Math.Max(60, expiresIn - 300));
            _log.LogInformation("PayPal OAuth token refreshed for mode={Mode}, expires in {Expires}s", currentMode, expiresIn);
            return token;
        }
        finally
        {
            _tokenLock.Release();
        }
    }

    private async Task<HttpClient> AuthedClient()
    {
        var http = _httpFactory.CreateClient();
        http.BaseAddress = new Uri(ApiBase);
        var token = await GetAccessTokenAsync();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return http;
    }

    public async Task<string> CreateOrderAsync(CatalogItem product, CreateOrderRequest req)
    {
        var http = await AuthedClient();
        var currency = string.IsNullOrWhiteSpace(req.Currency) ? "EUR" : req.Currency!.ToUpperInvariant();

        // Pack buyer info into a custom_id (max 127 chars per PayPal v2 spec).
        // We just store the buyer email — the rest stays on the client and
        // gets pre-filled into the success mailto. PayPal's order metadata is
        // not the right place for VAT numbers anyway (no encryption).
        var customId = (req.Email ?? "").Length > 120 ? (req.Email ?? "")[..120] : req.Email ?? "";

        var payload = new
        {
            intent = "CAPTURE",
            purchase_units = new[]
            {
                new
                {
                    description = product.Label.Length > 127 ? product.Label[..127] : product.Label,
                    custom_id = customId,
                    amount = new
                    {
                        value = product.PriceEur.ToString("F2", System.Globalization.CultureInfo.InvariantCulture),
                        currency_code = currency,
                    },
                }
            },
            application_context = new
            {
                brand_name = "WUIC Framework",
                shipping_preference = "NO_SHIPPING",
                user_action = "PAY_NOW",
            },
        };

        using var res = await http.PostAsJsonAsync("/v2/checkout/orders", payload);
        var body = await res.Content.ReadAsStringAsync();
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException(
                $"PayPal create-order failed ({(int)res.StatusCode}): {body}");

        using var doc = JsonDocument.Parse(body);
        return doc.RootElement.GetProperty("id").GetString()!;
    }

    public async Task<CaptureResult> CaptureOrderAsync(string orderId)
    {
        var http = await AuthedClient();

        // PayPal requires Content-Length: 0 header on capture, not a JSON body.
        using var req = new HttpRequestMessage(HttpMethod.Post,
            $"/v2/checkout/orders/{Uri.EscapeDataString(orderId)}/capture");
        req.Content = new StringContent("", Encoding.UTF8, "application/json");

        using var res = await http.SendAsync(req);
        var body = await res.Content.ReadAsStringAsync();
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException(
                $"PayPal capture failed ({(int)res.StatusCode}): {body}");

        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;

        var status = root.TryGetProperty("status", out var sEl) ? sEl.GetString() ?? "" : "";
        var payerEmail = root.TryGetProperty("payer", out var payerEl)
                         && payerEl.TryGetProperty("email_address", out var emEl)
                            ? emEl.GetString() ?? "" : "";

        var unit = root.GetProperty("purchase_units")[0];
        var description = unit.TryGetProperty("description", out var dEl) ? dEl.GetString() ?? "" : "";
        var capture = unit.GetProperty("payments").GetProperty("captures")[0];
        var captureId = capture.GetProperty("id").GetString() ?? "";
        var amountEl = capture.GetProperty("amount");
        var amount = amountEl.GetProperty("value").GetString() ?? "";
        var currency = amountEl.GetProperty("currency_code").GetString() ?? "EUR";

        return new CaptureResult(
            OrderId: orderId,
            PayerEmail: payerEmail,
            Amount: amount,
            Currency: currency,
            ProductLabel: description,
            CaptureId: captureId,
            Status: status
        );
    }
}

// ─── Email sender ──────────────────────────────────────────────────────────
//
//  Best-effort SMTP notification, called after a successful PayPal capture.
//  Sends a structured plain-text email with all the data the license issuer
//  needs to mint the WUIC license file:
//   - PayPal Order ID + capture ID + amount + currency
//   - Payer email (from PayPal) + license email (from form, where to send the .lic)
//   - Machine fingerprint (if buyer already installed WUIC)
//   - Optional electronic-invoice fields (P.IVA / SdI code / company name / address)
//
//  Throws on send failure; the caller wraps in try/catch so the capture still
//  succeeds even if SMTP is misconfigured. If Smtp:Host is missing or still a
//  placeholder, we no-op with a warning instead of throwing — useful during
//  initial deploy when SMTP credentials haven't been provisioned yet.

public sealed class EmailSender
{
    private readonly IConfiguration _cfg;
    private readonly ILogger<EmailSender> _log;

    // Strict RFC-5321ish guard: the framework's MailboxAddress.Parse already
    // rejects most CRLF tricks, but a defense-in-depth regex keeps oddities
    // (parsed-but-weird display names with embedded LF) out of headers.
    // Audit 2026-05-02 · M-04.
    private static readonly Regex StrictEmailRegex =
        new(@"^[^@\s\r\n]+@[^@\s\r\n]+\.[^@\s\r\n]+$",
            RegexOptions.Compiled | RegexOptions.CultureInvariant);

    /// <summary>
    /// Strip CR/LF/NUL from values that flow into the email body or headers
    /// to neutralize header-injection attempts via invoicing form fields
    /// (audit 2026-05-02 · M-04 / CWE-93). Buyer-controlled fields like
    /// `InvoicingCompanyName` go straight into the StringBuilder body — without
    /// stripping CRLF an attacker could inject `Bcc:` headers or extra
    /// pseudo-records into the receipt.
    /// </summary>
    private static string SanitizeForEmailBody(string? input, int maxLen = 200)
    {
        if (string.IsNullOrEmpty(input)) return string.Empty;
        var clean = input
            .Replace("\r", " ")
            .Replace("\n", " ")
            .Replace("\0", " ");
        return clean.Length > maxLen ? clean.Substring(0, maxLen) : clean;
    }

    public EmailSender(IConfiguration cfg, ILogger<EmailSender> log)
    {
        _cfg = cfg;
        _log = log;
    }

    public async Task SendCaptureNotificationAsync(CaptureResult capture, CaptureOrderRequest buyer)
    {
        var host = _cfg["Smtp:Host"];
        if (string.IsNullOrWhiteSpace(host) || host.StartsWith("REPLACE_"))
        {
            _log.LogWarning("SMTP not configured (Smtp:Host placeholder) — skipping email for orderId={OrderId}", capture.OrderId);
            return;
        }

        var port = int.TryParse(_cfg["Smtp:Port"], out var p) ? p : 587;
        var useStartTls = bool.TryParse(_cfg["Smtp:UseStartTls"], out var s) ? s : true;
        var username = _cfg["Smtp:Username"] ?? "";
        var password = _cfg["Smtp:Password"] ?? "";
        var fromEmail = _cfg["Smtp:FromEmail"] ?? "noreply@wuic-framework.com";
        var fromName = _cfg["Smtp:FromName"] ?? "WUIC Framework";
        var toEmail = _cfg["Smtp:ToEmail"] ?? "lorenzo.castrico@ditta.cloud";

        // Sanitize buyer-controlled fields before they hit headers / body
        // (audit 2026-05-02 · M-04 / CWE-93).
        var safeBuyerEmail   = SanitizeForEmailBody(buyer.Email, 254);
        var safeFingerprint  = SanitizeForEmailBody(buyer.MachineFingerprint, 256);
        var safeCompany      = SanitizeForEmailBody(buyer.InvoicingCompanyName, 200);
        var safeVat          = SanitizeForEmailBody(buyer.InvoicingVatNumber, 50);
        var safeSdi          = SanitizeForEmailBody(buyer.InvoicingSdiCode, 50);
        var safeAddress      = SanitizeForEmailBody(buyer.InvoicingAddress, 400);
        // PayerEmail comes from PayPal's response (not buyer-controlled in
        // theory, but defense in depth — Subject header sees this value).
        var safePayerEmail   = SanitizeForEmailBody(capture.PayerEmail, 254);

        var subject = $"[WUIC] Pagamento ricevuto: {SanitizeForEmailBody(capture.ProductLabel, 200)} — Order {capture.OrderId}";

        var sb = new StringBuilder();
        sb.AppendLine("Nuovo pagamento ricevuto su wuic-framework.com.");
        sb.AppendLine();
        sb.AppendLine("=== Pagamento ===");
        sb.AppendLine($"Prodotto:        {SanitizeForEmailBody(capture.ProductLabel, 200)}");
        sb.AppendLine($"Importo:         {capture.Amount} {capture.Currency}");
        sb.AppendLine($"PayPal Order ID: {capture.OrderId}");
        sb.AppendLine($"Capture ID:      {capture.CaptureId}");
        sb.AppendLine($"Status:          {capture.Status}");
        sb.AppendLine();
        sb.AppendLine("=== Cliente ===");
        sb.AppendLine($"Email PayPal:    {safePayerEmail}");
        sb.AppendLine($"Email licenza:   {(string.IsNullOrEmpty(safeBuyerEmail) ? "(non fornita — usa email PayPal)" : safeBuyerEmail)}");
        sb.AppendLine($"Fingerprint:     {(string.IsNullOrEmpty(safeFingerprint) ? "(da inviare dopo installazione WUIC)" : safeFingerprint)}");
        sb.AppendLine();

        var hasInvoicing =
            !string.IsNullOrEmpty(safeCompany)
            || !string.IsNullOrEmpty(safeVat)
            || !string.IsNullOrEmpty(safeSdi)
            || !string.IsNullOrEmpty(safeAddress);

        if (hasInvoicing)
        {
            sb.AppendLine("=== Dati per fattura elettronica ===");
            if (!string.IsNullOrEmpty(safeCompany)) sb.AppendLine($"Ragione sociale: {safeCompany}");
            if (!string.IsNullOrEmpty(safeVat))     sb.AppendLine($"P.IVA / CF:      {safeVat}");
            if (!string.IsNullOrEmpty(safeSdi))     sb.AppendLine($"Cod. SdI / PEC:  {safeSdi}");
            if (!string.IsNullOrEmpty(safeAddress)) sb.AppendLine($"Indirizzo:       {safeAddress}");
            sb.AppendLine();
        }
        else
        {
            sb.AppendLine("=== Fattura elettronica ===");
            sb.AppendLine("Cliente non ha compilato i dati di fatturazione (probabile B2C — usare codice fiscale).");
            sb.AppendLine();
        }

        sb.AppendLine("--");
        sb.AppendLine("Notifica automatica generata da WuicSiteApi.");

        var msg = new MimeMessage();
        msg.From.Add(new MailboxAddress(fromName, fromEmail));
        msg.To.Add(MailboxAddress.Parse(toEmail));
        // Reply-To = email PayPal del payer cosi' rispondendo si scrive direttamente
        // al cliente. Strict regex check before adding to the header — if PayPal
        // ever returns a malformed value, we drop the Reply-To rather than risk
        // header injection (audit 2026-05-02 · M-04).
        if (!string.IsNullOrWhiteSpace(capture.PayerEmail)
            && StrictEmailRegex.IsMatch(capture.PayerEmail)
            && MailboxAddress.TryParse(capture.PayerEmail, out var replyAddr))
        {
            msg.ReplyTo.Add(replyAddr);
        }
        msg.Subject = subject;
        msg.Body = new TextPart("plain") { Text = sb.ToString() };

        using var smtp = new SmtpClient();
        smtp.Timeout = 15_000;
        var secureOption = useStartTls ? SecureSocketOptions.StartTls : SecureSocketOptions.SslOnConnect;
        await smtp.ConnectAsync(host, port, secureOption);
        if (!string.IsNullOrWhiteSpace(username))
        {
            await smtp.AuthenticateAsync(username, password);
        }
        await smtp.SendAsync(msg);
        await smtp.DisconnectAsync(true);

        _log.LogInformation("Email notification sent to {To} for orderId={OrderId}", toEmail, capture.OrderId);
    }
}
