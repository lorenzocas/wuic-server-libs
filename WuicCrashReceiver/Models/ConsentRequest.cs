using System.Text.Json.Serialization;

namespace WuicCrashReceiver.Models;

/// <summary>
///  Body POST `/api/crash/consent` (skill crash-reporting Commit 9).
///
///  Audit trail GDPR: ogni volta che un cliente abilita o disabilita il
///  crash reporting nel proprio appsettings-editor, il flusso UI POSTa qui
///  prima di salvare il toggle. Se il POST fallisce, il toggle non viene
///  persistito (no consent => no telemetry).
///
///  Auth: stessi license headers dell'ingest (X-Wuic-License-Payload/Signature).
///  Il client_id viene risolto server-side dalla license, NON dal body.
///
///  Side-effect: INSERT in `_wuic_crash_consents` (tabella append-only,
///  ogni toggle e' una nuova row con timestamp). Non c'e' UPDATE: lo
///  storico completo dei consensi serve come audit trail.
/// </summary>
public sealed class ConsentRequest
{
    /// <summary>True per opt-in (Enabled false→true), false per opt-out.</summary>
    [JsonPropertyName("consentGranted")]    public bool ConsentGranted { get; set; }

    /// <summary>
    /// Versione del disclaimer mostrato all'utente (es. "1.0"). Bumped quando
    /// il testo cambia → forza re-consenso al prossimo toggle.
    /// </summary>
    [JsonPropertyName("disclaimerVersion")] public string? DisclaimerVersion { get; set; }

    /// <summary>Locale UI al momento del consenso (es. "it-IT").</summary>
    [JsonPropertyName("locale")]            public string? Locale { get; set; }

    [JsonPropertyName("machineFingerprint")] public string? MachineFingerprint { get; set; }
    [JsonPropertyName("userAgent")]          public string? UserAgent { get; set; }
}

public sealed class ConsentResponse
{
    [JsonPropertyName("ok")]       public bool Ok { get; set; }
    [JsonPropertyName("error")]    public string? Error { get; set; }
    [JsonPropertyName("id")]       public long? Id { get; set; }
}
