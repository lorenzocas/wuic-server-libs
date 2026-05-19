using System;
using System.Threading;
using System.Threading.Tasks;
using ConfigurationManager = System.Configuration.ConfigurationManager;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;

namespace FatturazioneElettronica.Services.Sdi.Notifications;

/// <summary>
/// Persistenza cursori paginazione poller SDI commerciali. Una riga per
/// provider in <c>dbo.sdi_provider_cursor</c> (DB Dati). Il valore di
/// <c>LastReceivedId</c> e' opaco e provider-specifico: ogni poller
/// decide come usarlo (es. ID numerico monotonico, ISO timestamp,
/// cursor token base64). Il <c>MetadataJson</c> aggiunge stato libero
/// (es. cursore secondario / pagine partial-pull).
///
/// **Importante**: il cursore e' un'ottimizzazione, non un meccanismo
/// di correttezza. La dedup di sicurezza e' fatta lato applier su
/// <c>sdi_notifications</c> (UNIQUE pec_message_id+type+filename).
/// Cursore corrotto o perso → semplicemente piu' roundtrip al provider,
/// nessuna corruzione dati.
/// </summary>
public sealed class SdiCursorRepository
{
    private readonly ILogger<SdiCursorRepository> _logger;

    public SdiCursorRepository(ILogger<SdiCursorRepository> logger)
    {
        _logger = logger;
    }

    private static string DataConn =>
        WEB_UI_CRAFTER.Helpers.ConfigHelper.ResolveConnectionString("DataSQLConnection")
        ?? throw new InvalidOperationException("DataSQLConnection non configurata");

    public sealed record CursorState(
        string ProviderName,
        string? LastReceivedId,
        DateTime? LastReceivedAt,
        string? MetadataJson);

    /// <summary>Legge lo stato cursore corrente, o stato "vuoto" se la riga non esiste.</summary>
    public async Task<CursorState> ReadAsync(string providerName, CancellationToken ct = default)
    {
        using var cn = new SqlConnection(DataConn);
        await cn.OpenAsync(ct).ConfigureAwait(false);
        using var cmd = new SqlCommand(@"
SELECT TOP 1 last_received_id, last_received_at, metadata_json
FROM dbo.sdi_provider_cursor
WHERE provider_name = @p AND cancellato = 0", cn);
        cmd.Parameters.AddWithValue("@p", providerName);
        using var rdr = await cmd.ExecuteReaderAsync(ct).ConfigureAwait(false);
        if (!await rdr.ReadAsync(ct).ConfigureAwait(false))
            return new CursorState(providerName, null, null, null);

        return new CursorState(
            providerName,
            rdr.IsDBNull(0) ? null : rdr.GetString(0),
            rdr.IsDBNull(1) ? null : rdr.GetDateTime(1),
            rdr.IsDBNull(2) ? null : rdr.GetString(2));
    }

    /// <summary>
    /// Aggiorna (UPSERT) il cursore dopo un poll. Marca anche statistiche
    /// di esecuzione: <paramref name="status"/> ∈ {OK, FAIL, EMPTY},
    /// <paramref name="message"/> diagnostico, <paramref name="itemsPulled"/>.
    /// </summary>
    public async Task UpsertAsync(
        string providerName,
        string? lastReceivedId,
        string? metadataJson,
        string status,
        string? message,
        int itemsPulled,
        CancellationToken ct = default)
    {
        try
        {
            using var cn = new SqlConnection(DataConn);
            await cn.OpenAsync(ct).ConfigureAwait(false);
            using var cmd = new SqlCommand(@"
MERGE dbo.sdi_provider_cursor AS t
USING (SELECT @p AS provider_name) AS s
   ON t.provider_name = s.provider_name
WHEN MATCHED THEN UPDATE SET
    last_received_id  = COALESCE(@last, t.last_received_id),
    last_received_at  = CASE WHEN @last IS NOT NULL THEN SYSUTCDATETIME() ELSE t.last_received_at END,
    last_poll_at      = SYSUTCDATETIME(),
    last_poll_status  = @status,
    last_poll_message = @message,
    items_pulled      = t.items_pulled + @items,
    metadata_json     = COALESCE(@meta, t.metadata_json),
    data_modifica     = GETDATE()
WHEN NOT MATCHED THEN INSERT
    (provider_name, last_received_id, last_received_at, last_poll_at,
     last_poll_status, last_poll_message, items_pulled, metadata_json)
VALUES
    (@p, @last,
     CASE WHEN @last IS NOT NULL THEN SYSUTCDATETIME() ELSE NULL END,
     SYSUTCDATETIME(), @status, @message, @items, @meta);
", cn);
            cmd.Parameters.AddWithValue("@p", providerName);
            cmd.Parameters.AddWithValue("@last", (object?)lastReceivedId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@meta", (object?)metadataJson ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@status", status);
            cmd.Parameters.AddWithValue("@message", (object?)message ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@items", itemsPulled);
            await cmd.ExecuteNonQueryAsync(ct).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            // Best-effort: il cursore e' un'ottimizzazione, non bloccare
            // il poll per un fallimento di scrittura cursore.
            _logger.LogWarning(ex,
                "SdiCursorRepository: upsert fallito per provider={Provider}, status={Status}, items={Items}",
                providerName, status, itemsPulled);
        }
    }
}
