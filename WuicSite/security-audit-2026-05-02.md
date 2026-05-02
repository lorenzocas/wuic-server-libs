# Security audit `wuic-framework.com` — 2026-05-02

> Black-box passivo + manuale non-distruttivo · piano approvato `penetration-test-per-https-wuic-framewor-compiled-waffle.md`

---

## Executive summary

Sono stati identificati **15 finding** sull'host `wuic-framework.com` (sito promozionale + sub-app `/api` per pagamenti PayPal):

| Severity | Count | Esempi |
|---|---|---|
| **HIGH** | 3 | nessun redirect HTTP→HTTPS; TLS 1.0/1.1 abilitati con suite POODLE/BEAST-vulnerabili; HSTS assente |
| **MEDIUM** | 4 | reflection raw degli errori PayPal; nessun rate-limit su `/api/paypal/*`; tutti i security header HTTP assenti; SMTP injection statica nei campi invoicing |
| **LOW** | 7 | CORS whitelist con `http://localhost:4200` in prod; banner `Server`/`X-Powered-By` esposti; DMARC assente; CAA assente; cipher suite RSA senza PFS; OCSP stapling off; SPA fallback risponde 200 a path arbitrari |
| **INFO** | 1 | sottodomini `forum`/`demo`/`www` sullo stesso VPS Contabo (single point of failure) |

I finding **HIGH** non implicano RCE/SQLi/secret leak attivi, ma espongono il sito a downgrade attack e MITM ed è probabile che facciano fallire una baseline PCI-DSS o un audit ISO 27001. Sono tutti rimediabili **senza modifiche di codice**, agendo su `web.config` IIS e (per F2) sul registro TLS Windows.

Tutti i probe sono stati eseguiti dall'IP autorizzato il 2026-05-01 fra le 21:57 e le 22:01 UTC. Nessuna richiesta `POST /api/paypal/create-order` con SKU valido è stata inviata → **zero ordini PayPal di test creati**, **zero capture eseguite**.

---

## Findings

### H-01 · Nessun redirect HTTP → HTTPS · `Severity: HIGH`

- **CVSS 3.1** AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:N → **8.1**
- **CWE-319** Cleartext Transmission of Sensitive Information

#### Evidence
```bash
$ curl -sIk http://wuic-framework.com/
HTTP/1.1 200 OK
Content-Length: 109091
Content-Type: text/html
Server: Microsoft-IIS/10.0
```
Il request `http://` ritorna lo stesso HTML servito da `https://` (size identica), **senza redirect 301/302**. Un visitor che digita `wuic-framework.com` in browser entra in cleartext HTTP, e qualsiasi attaccante on-path può iniettare contenuto, rubare cookie e dirottare il flusso PayPal su un endpoint malevolo.

#### Remediation
Patch [`WuicSite/web.config`](web.config) (sezione `<rewrite>`):
```xml
<system.webServer>
  <rewrite>
    <rules>
      <!-- nuova regola, mettere PRIMA di tutte le altre -->
      <rule name="ForceHttps" stopProcessing="true">
        <match url=".*" />
        <conditions>
          <add input="{HTTPS}" pattern="off" ignoreCase="true" />
        </conditions>
        <action type="Redirect" url="https://{HTTP_HOST}/{R:0}"
                redirectType="Permanent" />
      </rule>
      <!-- ... regole esistenti ... -->
    </rules>
  </rewrite>
</system.webServer>
```
Verifica post-fix: `curl -sIk http://wuic-framework.com/` deve ritornare `HTTP/1.1 301` con `Location: https://wuic-framework.com/`.

---

### H-02 · TLS 1.0 / TLS 1.1 abilitati con cipher suite POODLE + BEAST vulnerabili · `Severity: HIGH`

- **CVSS 3.1** AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:H/A:N → **6.4**
- **CWE-326** Inadequate Encryption Strength · **CWE-327** Use of a Broken or Risky Cryptographic Algorithm
- SSL Labs grade: **B**

#### Evidence (SSL Labs `api/v3/analyze`)
```
grade: B
protocols:  TLS 1.0  TLS 1.1  TLS 1.2  TLS 1.3
poodleTls: 1                ← VULNERABLE
vulnBeast:  True            ← VULNERABLE
forwardSecrecy: 2           ← partial only
ocspStapling: False
hstsPolicy: { status: "absent" }
```
Cipher suites accettate (estratto):
```
TLS 1.0 (P769)  TLS_RSA_WITH_AES_256_CBC_SHA       (no PFS, weak)
TLS 1.0 (P769)  TLS_RSA_WITH_AES_128_CBC_SHA       (no PFS, weak)
TLS 1.1 (P770)  TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA (CBC, BEAST)
TLS 1.2 (P771)  TLS_RSA_WITH_AES_128_GCM_SHA256    (no PFS)
TLS 1.3 (P772)  TLS_AES_256_GCM_SHA384             ← OK
```
La presenza di TLS 1.0/1.1 viola la baseline PCI-DSS 3.2.1 (giugno 2018) e impedisce di certificare il sito come "secure" in audit moderni.

#### Remediation
Disabilitare TLS 1.0 / 1.1 a livello SChannel su Windows Server. Eseguire una volta come Administrator (PowerShell elevato sul VPS):

```powershell
$keys = @(
    'HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\TLS 1.0\Server',
    'HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\TLS 1.0\Client',
    'HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\TLS 1.1\Server',
    'HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\TLS 1.1\Client'
)
foreach ($k in $keys) {
    if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
    Set-ItemProperty -Path $k -Name 'Enabled'           -Value 0 -Type DWord -Force
    Set-ItemProperty -Path $k -Name 'DisabledByDefault' -Value 1 -Type DWord -Force
}
# riavvio richiesto per applicare la modifica SChannel
Restart-Computer -Force
```

Disabilitare le suite RSA-only (no PFS) e CBC legacy via [IIS Crypto](https://www.nartac.com/Products/IISCrypto/) (UI ufficiale Microsoft-friendly) selezionando il template **"Best Practices"** + custom: spuntare solo `TLS_ECDHE_*_GCM_*` e `TLS_AES_*_GCM_SHA*` (TLS 1.3).

Verifica post-fix:
```bash
# TLS 1.0 deve fallire
openssl s_client -connect wuic-framework.com:443 -tls1 < /dev/null
# atteso: handshake failure
```

E re-run SSL Labs: target grade **A** o **A+** (richiede anche H-03).

---

### H-03 · HSTS assente, dominio non in preload list · `Severity: HIGH`

- **CVSS 3.1** AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:N/A:N → **4.8**
- **CWE-319** + **CWE-525**

#### Evidence
```bash
$ curl -sIk https://wuic-framework.com/ | grep -i strict
# (empty — header assente)

$ curl -s "https://hstspreload.org/api/v2/status?domain=wuic-framework.com"
{"name":"wuic-framework.com","status":"unknown","preloadedDomain":""}
```
Senza HSTS, anche dopo il fix H-01 il **primo** accesso al dominio resta vulnerabile a downgrade (un attaccante on-path può intercettare la prima richiesta `http://` prima del 301 e servire la propria versione fake del sito).

#### Remediation
Aggiungere il custom header dentro [`web.config`](web.config) (sezione `<system.webServer>`):
```xml
<httpProtocol>
  <customHeaders>
    <add name="Strict-Transport-Security"
         value="max-age=63072000; includeSubDomains; preload" />
    <!-- altri header H-04 sotto -->
  </customHeaders>
</httpProtocol>
```
Una volta che il sito serve l'header in modo stabile per ≥1 mese e tutti i sottodomini (`forum`, `demo`, `www`) sono raggiungibili solo in HTTPS, sottometterlo a [hstspreload.org](https://hstspreload.org/) per inclusione nella lista preload dei browser.

⚠️ Pre-requisito: H-01 deve essere già attivo. Pre-requisito 2: tutti i sottodomini devono supportare HTTPS — `includeSubDomains` rompe `forum`/`demo`/`www` se anche solo uno serve HTTP.

---

### M-01 · `/api/paypal/capture-order` proxa raw l'errore PayPal al client · `Severity: MEDIUM`

- **CVSS 3.1** AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N → **5.3**
- **CWE-209** Generation of Error Message Containing Sensitive Information

#### Evidence
```bash
$ curl -sik -X POST https://wuic-framework.com/api/paypal/capture-order \
       -H "Content-Type: application/json" \
       -d '{"orderId":"AUDIT_PROBE_NONEXISTENT_999"}'

HTTP/1.1 502 Bad Gateway
Content-Type: application/problem+json
{
  "type":"https://tools.ietf.org/html/rfc9110#section-15.6.3",
  "title":"Bad Gateway","status":502,
  "detail":"capture failed: PayPal capture failed (404):
            {\"name\":\"RESOURCE_NOT_FOUND\",
             \"details\":[{...}],
             \"debug_id\":\"e178aed61812f\",   ← debug ID interno PayPal
             \"links\":[{\"href\":\"https://developer.paypal.com/api/rest/...\"}]}"
}
```
Il `debug_id` è correlazionabile lato PayPal Support; l'intera struttura di errore (incl. campo, location, link a doc PayPal interna) viene rivelata. Un attaccante può anche usare l'endpoint come **oracle** per enumerare order ID validi (un orderId esistente ma non ancora catturato darebbe un errore diverso da `RESOURCE_NOT_FOUND`).

#### Remediation
Patch su [`api/Program.cs`](api/Program.cs) — handler `capture-order`. Sostituire la concatenazione raw del body PayPal con:
```csharp
catch (PayPalApiException ex)
{
    _logger.LogWarning(ex, "PayPal capture failed for order {OrderId}", req.OrderId);
    return Results.Problem(
        statusCode: 502,
        title: "payment provider unavailable",
        detail: "Unable to capture this payment. Please retry or contact support.");
}
```
Loggare server-side il body PayPal completo (incl. `debug_id`) per il troubleshooting interno; al client torna solo un messaggio generico.

---

### M-02 · Nessun rate limiting su `/api/paypal/*` (cost amplification) · `Severity: MEDIUM`

- **CVSS 3.1** AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L → **5.3**
- **CWE-770** Allocation of Resources Without Limits or Throttling
- **CWE-799** Improper Control of Interaction Frequency

#### Evidence
5 richieste sequenziali in <1s tutte con HTTP 200, nessun header `Retry-After` / `RateLimit-Remaining`:
```bash
$ for i in 1 2 3 4 5; do curl -sIk https://wuic-framework.com/api/paypal/config | head -1; done
HTTP/1.1 200 OK
HTTP/1.1 200 OK
HTTP/1.1 200 OK
HTTP/1.1 200 OK
HTTP/1.1 200 OK
```
Ogni `POST /api/paypal/capture-order` con orderId arbitrario consuma **una chiamata PayPal API reale** lato server (confermato da F-M-01 che mostra 502 con debug_id PayPal restituito). Un attaccante può inviare 10k richieste/ora con orderId casuali → consuma il rate limit PayPal del merchant account, fa scadere il token OAuth, e potenzialmente attiva fraud detection PayPal sul tenant.

#### Remediation
Patch su [`api/Program.cs`](api/Program.cs) (richiede `.NET 7+`):
```csharp
using System.Threading.RateLimiting;
// ...
builder.Services.AddRateLimiter(opt =>
{
    opt.RejectionStatusCode = 429;
    opt.AddPolicy("paypal-fixed", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));
});

// dopo app.UseCors(...)
app.UseRateLimiter();

// e su ogni endpoint sensibile:
app.MapPost("/paypal/create-order",  ...).RequireRateLimiting("paypal-fixed");
app.MapPost("/paypal/capture-order", ...).RequireRateLimiting("paypal-fixed");
```
Verifica: 11 richieste in 60s → l'11ma deve tornare `HTTP 429`.

In aggiunta, considerare un **CAPTCHA** (reCAPTCHA v3 o Turnstile) sul flusso `/pricing` lato Angular se il volume di abuse continua dopo il rate-limit semplice.

---

### M-03 · Tutti i security header HTTP assenti · `Severity: MEDIUM` (aggregato)

- **CVSS 3.1** (aggregato AV:N/AC:H/PR:N/UI:R) → **5.4**
- **CWE-693** Protection Mechanism Failure · **CWE-1021** Improper Restriction of Rendered UI Layers (clickjacking)

#### Evidence
```bash
$ curl -sIk https://wuic-framework.com/
HTTP/1.1 200 OK
Content-Length: 109091
Content-Type: text/html
Last-Modified: Fri, 01 May 2026 16:56:10 GMT
Server: Microsoft-IIS/10.0
X-Powered-By: ASP.NET
Date: Fri, 01 May 2026 21:57:51 GMT
```
Mancano in toto: `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`. Risk rilevante: clickjacking del flusso `/pricing` (frame del sito in pagina malevola → mouse hijack sul bottone PayPal).

#### Remediation
Patch [`WuicSite/web.config`](web.config), accanto a HSTS:
```xml
<httpProtocol>
  <customHeaders>
    <add name="Strict-Transport-Security"
         value="max-age=63072000; includeSubDomains; preload" />
    <add name="X-Content-Type-Options" value="nosniff" />
    <add name="X-Frame-Options"        value="DENY" />
    <add name="Referrer-Policy"        value="strict-origin-when-cross-origin" />
    <add name="Permissions-Policy"
         value="camera=(), microphone=(), geolocation=(), payment=(self &quot;https://www.paypal.com&quot;)" />
    <add name="Cross-Origin-Opener-Policy"   value="same-origin" />
    <add name="Cross-Origin-Resource-Policy" value="same-site" />
    <!-- CSP tarata sul caricamento dinamico PayPal SDK + asset locali -->
    <add name="Content-Security-Policy"
         value="default-src 'self'; script-src 'self' https://www.paypal.com https://www.sandbox.paypal.com 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://www.paypal.com https://api.paypal.com; frame-src https://www.paypal.com https://www.sandbox.paypal.com; object-src 'none'; base-uri 'self'; form-action 'self' https://www.paypal.com" />
  </customHeaders>
</httpProtocol>
```

⚠️ La policy `script-src` include `'unsafe-inline'` perchè il bundle Angular emette `<script type="module">` inline per il bootstrap. Per stringere ulteriormente: build con `ng build --inline-style false` e rimuovere `'unsafe-inline'`. Test prima in `Content-Security-Policy-Report-Only` per ~1 settimana per non rompere il flusso `/pricing`.

Verifica: [securityheaders.com](https://securityheaders.com/?q=wuic-framework.com&hide=on) target grade **A**.

---

### M-04 · SMTP injection statica in campi invoicing (probabile, NON probata live) · `Severity: MEDIUM` se exploitabile

- **CVSS 3.1** AV:N/AC:H/PR:N/UI:N/S:C/C:L/I:L/A:N → **5.4** (stima)
- **CWE-93** Improper Neutralization of CRLF Sequences · **CWE-77**

#### Evidence
Static review di [`api/Program.cs`](api/Program.cs) (handler `capture-order` → mail). I campi `buyer.Email`, `InvoicingCompanyName`, `InvoicingVatNumber`, `InvoicingSdiCode` vengono concatenati nel body testuale dell'email senza sanitizzazione CRLF, e `buyer.Email` viene passato a `MailboxAddress.Parse()` per il `ReplyTo`.

**Nessun probe live è stato eseguito** perché il vettore si attiva solo durante `capture-order`, che richiede un order PayPal valido + capture reale (operazione destructive con money movement). Marcato come "static finding — live test skipped per non-destructive scope".

#### Remediation
Patch su [`api/Program.cs`](api/Program.cs) — funzione di costruzione mail. Sanitizzare CRLF in input prima di qualsiasi concatenazione:
```csharp
private static string SanitizeForEmailHeader(string? input, int maxLen = 200)
{
    if (string.IsNullOrEmpty(input)) return string.Empty;
    var clean = input.Replace("\r", " ").Replace("\n", " ").Replace("\0", " ");
    return clean.Length > maxLen ? clean.Substring(0, maxLen) : clean;
}

// ... dentro il sender ...
var safeCompany = SanitizeForEmailHeader(req.InvoicingCompanyName);
var safeVat     = SanitizeForEmailHeader(req.InvoicingVatNumber, 50);
var safeSdi     = SanitizeForEmailHeader(req.InvoicingSdiCode, 20);

// ReplyTo: validare email con strict regex; in caso di fallimento, omettere ReplyTo
if (MailboxAddress.TryParse(req.Email, out var replyAddr)
    && Regex.IsMatch(replyAddr.Address, @"^[^@\s]+@[^@\s]+\.[^@\s]+$"))
{
    msg.ReplyTo.Add(replyAddr);
}
```

Verifica: dopo il fix, sottomettere un order test (sandbox PayPal) con `invoicingCompanyName: "ACME\r\nBcc: probe@local.test"` — l'header `Bcc:` non deve apparire nell'email finale.

---

### L-01 · CORS whitelist include `http://localhost:4200` in produzione · `Severity: LOW`

- **CVSS 3.1** AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N → **3.1**
- **CWE-942** Permissive Cross-domain Policy

#### Evidence
```bash
$ curl -sik -X OPTIONS https://wuic-framework.com/api/paypal/config \
       -H "Origin: http://localhost:4200" \
       -H "Access-Control-Request-Method: GET"

HTTP/1.1 204 No Content
Access-Control-Allow-Origin: http://localhost:4200   ← unexpected in prod
Access-Control-Allow-Headers: content-type
Access-Control-Allow-Methods: GET
```
Da `https://attacker.example` invece la response NON contiene `Access-Control-Allow-Origin` → CORS rejecta correttamente. Il leak è limitato al solo origin `localhost:4200`, ma in produzione non dovrebbe esserci.

#### Remediation
[`api/appsettings.json`](api/appsettings.json) — produzione:
```json
{
  "Cors": {
    "AllowedOrigins": [ "https://wuic-framework.com" ]
  }
}
```
Tenere `localhost:4200` solo in [`api/appsettings.Development.json`](api/appsettings.Development.json) (separato dal file di prod, e non deployato — il `[deploy-site.ps1](deploy-site.ps1)` esclude già `appsettings.json`, va escluso anche `appsettings.Development.json`).

Verifica post-fix: il preflight con `Origin: http://localhost:4200` non deve più ritornare `Access-Control-Allow-Origin`.

---

### L-02 · Banner `Server: Microsoft-IIS/10.0` e `X-Powered-By: ASP.NET` esposti · `Severity: LOW`

- **CVSS 3.1** → **3.1** · **CWE-200**

#### Evidence
Vedi response di tutti i probe sopra: ogni risposta IIS include `Server: Microsoft-IIS/10.0` e `X-Powered-By: ASP.NET`. Permette a un attaccante di filtrare il pool di exploit candidati (rivela la fascia di IIS major version).

#### Remediation
[`web.config`](web.config) (sito principale **e** sub-app):
```xml
<system.webServer>
  <security>
    <requestFiltering removeServerHeader="true" />
  </security>
  <httpProtocol>
    <customHeaders>
      <remove name="X-Powered-By" />
      <!-- ... altri header sopra ... -->
    </customHeaders>
  </httpProtocol>
</system.webServer>
```

Su Windows Server 2019+ `removeServerHeader` è supportato nativamente. Su Windows Server 2016 servirebbe il modulo URLRewrite con outboundRule (più complicato).

---

### L-03 · DMARC policy assente · `Severity: LOW`

- **CVSS 3.1** AV:N/AC:H/PR:N/UI:R/S:C/C:L/I:L/A:N → **4.7**
- **CWE-290** Authentication Bypass by Spoofing

#### Evidence
```bash
$ dig +short TXT _dmarc.wuic-framework.com
# (empty)
```
SPF è presente (`v=spf1 include:zohomail.eu ~all`) ma senza DMARC l'aggregate enforcement non avviene: chiunque può inviare email spoofando `*@wuic-framework.com` verso clienti, e i destinatari decidono in autonomia. Rilevante perché l'utente usa `info@wuic-framework.com` (Zoho) per le notifiche post-pagamento — un fraudster può fingersi WUIC con email di "license confirmation" verso liste comprate.

#### Remediation
Aggiungere record TXT su Contabo DNS panel (zone `wuic-framework.com`):
```
Name:  _dmarc
Type:  TXT
TTL:   3600
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc@wuic-framework.com; ruf=mailto:dmarc@wuic-framework.com; fo=1; adkim=s; aspf=s
```
Iniziare con `p=none` per ~1 mese (raccoglie report senza bloccare), poi salire a `p=quarantine` e infine `p=reject`.

Configurare anche **DKIM** lato Zoho Mail (Admin Console → Email Authentication → Generate DKIM key, poi pubblicare il TXT su DNS).

---

### L-04 · CAA record DNS assenti · `Severity: LOW`

- **CVSS 3.1** → **2.6** · **CWE-295**

#### Evidence
```bash
$ curl -s "https://dns.google/resolve?name=wuic-framework.com&type=CAA"
# Authority section only, no Answer
```
Senza CAA, qualsiasi CA pubblica può emettere un certificato per `wuic-framework.com`. In caso di compromissione di una CA terza o di mis-issuance accidentale, l'attaccante può ottenere un certificato valido.

#### Remediation
Aggiungere record CAA su Contabo DNS:
```
wuic-framework.com.  CAA  0 issue "letsencrypt.org"
wuic-framework.com.  CAA  0 issuewild ";"            ← nessun wildcard cert
wuic-framework.com.  CAA  0 iodef "mailto:security@wuic-framework.com"
```

---

### L-05 · Cipher suite RSA-only senza Forward Secrecy · `Severity: LOW`

Già coperto in **H-02** (TLS 1.0/1.1). Dopo il fix H-02, disabilitare anche le suite TLS 1.2 `TLS_RSA_*` lasciando solo `TLS_ECDHE_*`. Stessa procedura IIS Crypto.

---

### L-06 · OCSP stapling disabilitato · `Severity: LOW`

- **CWE-299**

#### Evidence
SSL Labs: `ocspStapling: False`. IIS può fare OCSP stapling automaticamente ma in alcune configurazioni serve abilitazione esplicita.

#### Remediation
Verificare che `HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\OcspStaplingTimeoutInSeconds` esista e sia > 0. Se assente:
```powershell
New-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL' `
    -Name 'OcspStaplingTimeoutInSeconds' -Value 30 -PropertyType DWord -Force
```
E riavviare. Verifica: SSL Labs → `ocspStapling: True`.

---

### L-07 · SPA fallback ritorna `200 OK` per qualsiasi path inesistente · `Severity: LOW`

- **CWE-451** User Interface Misrepresentation
- **CWE-200** (minore)

#### Evidence
```bash
$ curl -sk -o /dev/null -w "%{http_code}\n" https://wuic-framework.com/.git/HEAD
200
$ curl -sk -o /dev/null -w "%{http_code}\n" https://wuic-framework.com/elmah.axd
200
$ curl -sk -o /dev/null -w "%{http_code}\n" https://wuic-framework.com/.well-known/security.txt
200
```
**Tutte queste path ritornano lo stesso HTML della homepage (109091 bytes)** — l'IIS rewrite rule fa SPA fallback a `index.html` per qualunque path non-asset. Il contenuto è innocuo (è solo l'HTML SPA), ma:
- Confonde scanner automatici (false positive su CT-only signature based)
- Maschera potenziali finding reali (se per errore una nuova route Angular si chiamasse `/.git/HEAD`, sarebbe difficile distinguere il vero leak)
- Rompe il convenzionale `/.well-known/security.txt` (che dovrebbe essere 404 o servire un text file vero)

#### Remediation
**(a)** Aggiungere un vero `/.well-known/security.txt` (best practice 2024):
```
Contact: mailto:security@wuic-framework.com
Expires: 2027-12-31T23:59:59Z
Preferred-Languages: it, en
Canonical: https://wuic-framework.com/.well-known/security.txt
```
File da deployare sotto `dist/.well-known/security.txt`.

**(b)** Aggiungere a [`web.config`](web.config) una rewrite rule che ritorna 404 esplicitamente per percorsi sensibili noti (prima della rewrite SPA fallback):
```xml
<rule name="DenyDotPaths" stopProcessing="true">
  <match url="(^|/)\.(git|env|vs|svn)(/|$)" />
  <action type="CustomResponse"
          statusCode="404" statusReason="Not Found"
          statusDescription="Not Found" />
</rule>
```

---

### INFO-01 · Sottodomini convergenti su singolo VPS Contabo · `Severity: INFO`

`wuic-framework.com`, `forum.wuic-framework.com`, `demo.wuic-framework.com`, `www.wuic-framework.com` → tutti su `194.163.167.71` (`vmi3227043.contaboserver.net`). Single point of failure dell'intera presenza online, e una compromissione dell'host impatta tutto.

#### Recommendation
Considerare segregazione del demo (che monta `KonvergenceCore` reale, fuori scope ma più rischioso) su un VPS separato, o almeno isolare l'AppPool IIS con identità distinte e quote risorsa per app.

---

## Quick-win patch consolidata · drop-in `web.config`

Le patch H-01, H-03, M-03, L-02, L-07 sono tutte modifiche statiche a `web.config`. Ecco il diff consolidato per [`web.config`](web.config), pronto da incollare:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <!-- L-02 · nascondere banner -->
    <security>
      <requestFiltering removeServerHeader="true" />
    </security>

    <!-- H-03, M-03, L-02 · security headers + cleanup X-Powered-By -->
    <httpProtocol>
      <customHeaders>
        <remove name="X-Powered-By" />
        <add name="Strict-Transport-Security"
             value="max-age=63072000; includeSubDomains; preload" />
        <add name="X-Content-Type-Options" value="nosniff" />
        <add name="X-Frame-Options"        value="DENY" />
        <add name="Referrer-Policy"        value="strict-origin-when-cross-origin" />
        <add name="Permissions-Policy"
             value="camera=(), microphone=(), geolocation=(), payment=(self &quot;https://www.paypal.com&quot;)" />
        <add name="Cross-Origin-Opener-Policy"   value="same-origin" />
        <add name="Cross-Origin-Resource-Policy" value="same-site" />
        <add name="Content-Security-Policy"
             value="default-src 'self'; script-src 'self' https://www.paypal.com https://www.sandbox.paypal.com 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://www.paypal.com https://api.paypal.com; frame-src https://www.paypal.com https://www.sandbox.paypal.com; object-src 'none'; base-uri 'self'; form-action 'self' https://www.paypal.com" />
      </customHeaders>
    </httpProtocol>

    <rewrite>
      <rules>
        <!-- H-01 · forza HTTPS, deve stare PRIMA delle altre rules -->
        <rule name="ForceHttps" stopProcessing="true">
          <match url=".*" />
          <conditions>
            <add input="{HTTPS}" pattern="off" ignoreCase="true" />
          </conditions>
          <action type="Redirect" url="https://{HTTP_HOST}/{R:0}"
                  redirectType="Permanent" />
        </rule>

        <!-- L-07 · 404 esplicito su path sensibili -->
        <rule name="DenyDotPaths" stopProcessing="true">
          <match url="(^|/)\.(git|env|vs|svn)(/|$)" />
          <action type="CustomResponse"
                  statusCode="404" statusReason="Not Found"
                  statusDescription="Not Found" />
        </rule>

        <!-- ... regole esistenti SPA fallback / API rewrite ... -->
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
```

Lo stesso blocco `<httpProtocol>` va replicato in `dist/api-publish/web.config` (sub-app) per coprire anche le response `/api/*` con security headers e rimozione banner.

---

## Out-of-scope (NON testato in questa sessione)

| Vettore | Perché non testato | Quando rivisitare |
|---|---|---|
| Auth flow / login | Non esiste — il sito promo è statico, niente login utente | n/a |
| File upload abuse | Non esistono upload endpoint pubblici | n/a |
| SQLi / IDOR | Sub-app PayPal non usa DB; PayPal → terze parti | n/a |
| SSRF / RCE | Nessun endpoint accetta URL come input; `dotnet` runner standard | n/a |
| `demo.wuic-framework.com` (KonvergenceCore reale) | Esplicitamente fuori scope (richiesta utente) | Pentest dedicato autenticato — proporre come follow-up |
| `forum.wuic-framework.com` | Stesso VPS, app diversa (forum software 3rd-party) | Audit dedicato (Discourse/phpBB? versione?) |
| Live SMTP injection (M-04) | Richiede capture order = money movement, non-destructive scope | Replay in PayPal sandbox dopo H-02 fix |
| Live amount tampering | Server-side autorithy verificato staticamente, live test creerebbe ordini reali | Replay in PayPal sandbox |
| Browser-side DOM XSS / Trusted Types violations | Richiede dynamic analysis con headed browser + Burp passive | Sessione dedicata se desiderata |

---

## Verification (post-remediation)

Riesecuzione in single-shot dei probe critici dopo il deploy delle patch:

```bash
# H-01 — redirect deve essere 301
curl -sIk http://wuic-framework.com/ | head -3
# atteso: HTTP/1.1 301, Location: https://wuic-framework.com/

# H-02 — TLS 1.0 deve fallire
openssl s_client -connect wuic-framework.com:443 -tls1 < /dev/null 2>&1 | grep -i 'handshake'
# atteso: handshake failure

# H-03, M-03, L-02 — security headers
curl -sIk https://wuic-framework.com/ | grep -iE 'strict-transport|x-frame|x-content|content-security|server|x-powered'
# atteso: tutti gli header desiderati, niente Server / X-Powered-By

# M-01 — capture-order error sanitized
curl -sik -X POST https://wuic-framework.com/api/paypal/capture-order \
     -H "Content-Type: application/json" -d '{"orderId":"PROBE_999"}'
# atteso: status 502, detail generico, nessun debug_id PayPal nel body

# M-02 — rate limit
for i in {1..15}; do curl -sIk https://wuic-framework.com/api/paypal/config | head -1; done
# atteso: dalle ultime 5 in poi → HTTP 429 Too Many Requests

# L-01 — CORS preflight da localhost rifiutato
curl -sik -X OPTIONS https://wuic-framework.com/api/paypal/config \
     -H "Origin: http://localhost:4200" -H "Access-Control-Request-Method: GET"
# atteso: nessun Access-Control-Allow-Origin nella risposta

# L-03 — DMARC presente
dig +short TXT _dmarc.wuic-framework.com
# atteso: "v=DMARC1; p=quarantine; rua=..."

# L-04 — CAA presente
dig +short CAA wuic-framework.com
# atteso: 0 issue "letsencrypt.org" + altri

# Re-run SSL Labs (target grade A o A+)
curl -s "https://api.ssllabs.com/api/v3/analyze?host=wuic-framework.com&publish=off&startNew=on&all=done" \
  > /dev/null && sleep 240 && \
curl -s "https://api.ssllabs.com/api/v3/analyze?host=wuic-framework.com&publish=off&all=done" | jq '.endpoints[0].grade'
# atteso: "A" o "A+"

# securityheaders.com
curl -s "https://securityheaders.com/?q=wuic-framework.com&followRedirects=on&hide=on" | grep -oE 'grade-[A-F][+-]?'
# atteso: grade-A o migliore
```

---

## Riepilogo deliverable

| Output | Path |
|---|---|
| **Questo report** | `C:\src\Wuic\WuicSite\security-audit-2026-05-02.md` |
| Plan approvato | `C:\Users\lollo\.claude\plans\penetration-test-per-https-wuic-framewor-compiled-waffle.md` |
| Bundle e response salvati | `C:\Users\lollo\AppData\Local\Temp\claude\…\tasks\…\` (effimero) |

**Nessun file di codice è stato modificato in questa sessione.** Le patch suggerite sopra sono pronte per essere applicate in una sessione successiva con permesso esplicito dell'utente, seguendo il workflow standard del repo:
1. Modificare [`WuicSite/web.config`](web.config) e [`WuicSite/api/Program.cs`](api/Program.cs) nel repo principale (non in worktree).
2. Build dry-run: `dotnet build C:\src\Wuic\WuicSite\api\WuicSiteApi.csproj`.
3. Deploy via `pwsh -ExecutionPolicy Bypass -File C:\src\Wuic\WuicSite\deploy-site.ps1` (regola public-site-deploy del repo).
4. Re-run la sezione **Verification** sopra.
