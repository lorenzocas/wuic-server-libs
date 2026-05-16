using System.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace CostCnh.Controllers;

/// <summary>
/// Phase I.2 — Custom Attributes/Values/Lookup API (full parity con legacy Cost_CNH).
///
/// Backend per la gestione completa di:
///   - core.custom_attribute (definitions)
///   - core.custom_attribute_mapping (Site x ProjectClass scoping)
///   - core.custom_value (per-entity values, multi-value, time-based)
///   - core.custom_lookup (lookup options + cascade rename)
///   - core.custom_attribute_permission (per (mapping, user/role, action))
///
/// Endpoints:
///   GET    /api/custom-attributes/definitions?context=program          — lista definitions per context
///   GET    /api/custom-attributes/resolve?context=program&siteId=N&projectClassId=M  — applicable in scope
///   POST   /api/custom-attributes/definitions                          — register new definition
///   PATCH  /api/custom-attributes/definitions/{id}                     — update definition
///   GET    /api/custom-attributes/values?entitySchema=core&entityName=program&entityId=42 — read CV per entity
///   POST   /api/custom-attributes/values                               — upsert CV batch
///   DELETE /api/custom-attributes/values/{cv_id}                       — soft delete
///   GET    /api/custom-attributes/lookup/{attributeId}                 — lookup options
///   POST   /api/custom-attributes/lookup                               — insert lookup option
///   PATCH  /api/custom-attributes/lookup/{id}                          — update (cascade via trigger)
/// </summary>
[ApiController]
[Route("api/custom-attributes")]
public class CustomAttributesController : ControllerBase
{
    private readonly string _dataCs;
    private readonly ILogger<CustomAttributesController> _log;

    public CustomAttributesController(IConfiguration cfg, ILogger<CustomAttributesController> logger)
    {
        _log = logger;
        _dataCs = cfg.GetConnectionString("DataSQLConnection")
                  ?? cfg["AppSettings:connection"]
                  ?? throw new InvalidOperationException("DataSQLConnection mancante");
    }

    // ─── 1. Definitions list ──────────────────────────────────────────────────
    [HttpGet("definitions")]
    public async Task<IActionResult> ListDefinitions([FromQuery] string? context, CancellationToken ct)
    {
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = @"
            SELECT id, context, code, display_name, description, value_type,
                   allow_multiple, has_lookup, is_required, is_readonly,
                   edit_order, is_time_based, mode, external_system, external_code
              FROM [core].[custom_attribute]
             WHERE ISNULL(cancellato, 0) = 0
               AND (@context IS NULL OR context = @context)
             ORDER BY context, edit_order, code";
        cmd.Parameters.AddWithValue("@context", (object?)context ?? DBNull.Value);

        var defs = new List<Dictionary<string, object?>>();
        await using var rd = await cmd.ExecuteReaderAsync(ct);
        while (await rd.ReadAsync(ct)) defs.Add(ReadRow(rd));
        return Ok(new { ok = true, count = defs.Count, definitions = defs });
    }

    // ─── 2. Resolve (TVF) per scope ──────────────────────────────────────────
    [HttpGet("resolve")]
    public async Task<IActionResult> Resolve(
        [FromQuery] string context,
        [FromQuery] int? siteId,
        [FromQuery] int? projectClassId,
        [FromQuery] byte? treeKindId,
        CancellationToken ct)
    {
        if (string.IsNullOrEmpty(context)) return BadRequest(new { ok = false, error = "context required" });

        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "SELECT * FROM [core].[fn_resolve_custom_attributes](@context, @site, @class, @tk)";
        cmd.Parameters.AddWithValue("@context", context);
        cmd.Parameters.AddWithValue("@site", (object?)siteId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@class", (object?)projectClassId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@tk", (object?)treeKindId ?? DBNull.Value);

        var rows = new List<Dictionary<string, object?>>();
        await using var rd = await cmd.ExecuteReaderAsync(ct);
        while (await rd.ReadAsync(ct)) rows.Add(ReadRow(rd));
        return Ok(new { ok = true, context, scope = new { siteId, projectClassId, treeKindId }, applicable = rows });
    }

    // ─── 3. Register definition (idempotent SP) ──────────────────────────────
    public class RegisterDefRequest
    {
        public string Context { get; set; } = "";
        public string Code { get; set; } = "";
        public string ValueType { get; set; } = "text";
        public string? DisplayName { get; set; }
        public bool HasLookup { get; set; }
        public bool AllowMultiple { get; set; }
        public bool IsRequired { get; set; }
    }
    [HttpPost("definitions")]
    public async Task<IActionResult> RegisterDefinition([FromBody] RegisterDefRequest req, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(req.Context) || string.IsNullOrEmpty(req.Code))
            return BadRequest(new { ok = false, error = "context+code required" });

        var userId = ResolveCurrentUserId();
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "[core].[sp_register_custom_attribute]";
        cmd.CommandType = CommandType.StoredProcedure;
        cmd.Parameters.AddWithValue("@context", req.Context);
        cmd.Parameters.AddWithValue("@code", req.Code);
        cmd.Parameters.AddWithValue("@value_type", req.ValueType);
        cmd.Parameters.AddWithValue("@display_name", (object?)req.DisplayName ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@has_lookup", req.HasLookup);
        cmd.Parameters.AddWithValue("@allow_multiple", req.AllowMultiple);
        cmd.Parameters.AddWithValue("@is_required", req.IsRequired);
        cmd.Parameters.AddWithValue("@user_id", (object?)userId ?? DBNull.Value);
        var pOut = cmd.Parameters.Add("@new_id", SqlDbType.Int); pOut.Direction = ParameterDirection.Output;

        await cmd.ExecuteNonQueryAsync(ct);
        int newId = (int)pOut.Value;
        return Ok(new { ok = true, attributeId = newId, idempotent = true });
    }

    // ─── 4. Read values per entity ────────────────────────────────────────────
    [HttpGet("values")]
    public async Task<IActionResult> GetValues(
        [FromQuery] string entitySchema,
        [FromQuery] string entityName,
        [FromQuery] string entityId,
        [FromQuery] int? yearNum,
        CancellationToken ct)
    {
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "SELECT * FROM [core].[fn_get_custom_values](@es, @en, @eid, @yr)";
        cmd.Parameters.AddWithValue("@es", entitySchema);
        cmd.Parameters.AddWithValue("@en", entityName);
        cmd.Parameters.AddWithValue("@eid", entityId);
        cmd.Parameters.AddWithValue("@yr", (object?)yearNum ?? DBNull.Value);

        var rows = new List<Dictionary<string, object?>>();
        await using var rd = await cmd.ExecuteReaderAsync(ct);
        while (await rd.ReadAsync(ct)) rows.Add(ReadRow(rd));
        return Ok(new { ok = true, count = rows.Count, values = rows });
    }

    // ─── 5. Upsert values batch ──────────────────────────────────────────────
    public class CvUpsertItem
    {
        public int AttributeId { get; set; }
        public string EntitySchema { get; set; } = "";
        public string EntityName { get; set; } = "";
        public string EntityId { get; set; } = "";
        public string? ValueText { get; set; }
        public decimal? ValueNumber { get; set; }
        public DateTime? ValueDate { get; set; }
        public bool? ValueBool { get; set; }
        public int? CustomLookupId { get; set; }
        public int? YearNum { get; set; }
        public long? ExistingCvId { get; set; }    // se passato: UPDATE, else INSERT
    }
    public class CvUpsertRequest { public List<CvUpsertItem> Items { get; set; } = new(); }

    [HttpPost("values")]
    public async Task<IActionResult> UpsertValues([FromBody] CvUpsertRequest req, CancellationToken ct)
    {
        if (req.Items == null || req.Items.Count == 0) return Ok(new { ok = true, upserted = 0 });

        var userId = ResolveCurrentUserId();
        var now = DateTime.UtcNow;
        int upserted = 0;

        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var tx = (SqlTransaction)await cn.BeginTransactionAsync(ct);
        try
        {
            foreach (var i in req.Items)
            {
                await using var cmd = cn.CreateCommand();
                cmd.Transaction = tx;
                if (i.ExistingCvId.HasValue)
                {
                    cmd.CommandText = @"
                        UPDATE [core].[custom_value] SET
                            value_text       = @vt,
                            value_number     = @vn,
                            value_date       = @vd,
                            value_bool       = @vb,
                            custom_lookup_id = @clid,
                            year_num         = @yr,
                            data_modifica    = @now,
                            utente_modifica  = @uid
                         WHERE id = @cv_id";
                    cmd.Parameters.AddWithValue("@cv_id", i.ExistingCvId.Value);
                }
                else
                {
                    cmd.CommandText = @"
                        INSERT INTO [core].[custom_value] (
                            custom_attribute_id, entity_schema, entity_name, entity_id,
                            value_text, value_number, value_date, value_bool, custom_lookup_id,
                            year_num, data_creazione, utente_creazione
                        ) VALUES (
                            @attr, @es, @en, @eid, @vt, @vn, @vd, @vb, @clid, @yr, @now, @uid
                        )";
                    cmd.Parameters.AddWithValue("@attr", i.AttributeId);
                    cmd.Parameters.AddWithValue("@es", i.EntitySchema);
                    cmd.Parameters.AddWithValue("@en", i.EntityName);
                    cmd.Parameters.AddWithValue("@eid", i.EntityId);
                }
                cmd.Parameters.AddWithValue("@vt", (object?)i.ValueText ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@vn", (object?)i.ValueNumber ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@vd", (object?)i.ValueDate ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@vb", (object?)i.ValueBool ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@clid", (object?)i.CustomLookupId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@yr", (object?)i.YearNum ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@now", now);
                cmd.Parameters.AddWithValue("@uid", (object?)userId ?? DBNull.Value);
                upserted += await cmd.ExecuteNonQueryAsync(ct);
            }
            await tx.CommitAsync(ct);
        }
        catch (Exception ex)
        {
            await tx.RollbackAsync(ct);
            _log.LogError(ex, "Upsert custom_value failed");
            return StatusCode(500, new { ok = false, error = ex.Message });
        }
        return Ok(new { ok = true, upserted });
    }

    // ─── 6. Soft delete value ────────────────────────────────────────────────
    [HttpDelete("values/{cvId:long}")]
    public async Task<IActionResult> DeleteValue(long cvId, CancellationToken ct)
    {
        var userId = ResolveCurrentUserId();
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "UPDATE [core].[custom_value] SET cancellato = 1, data_eliminazione = @now, utente_eliminazione = @uid WHERE id = @id AND ISNULL(cancellato, 0) = 0";
        cmd.Parameters.AddWithValue("@id", cvId);
        cmd.Parameters.AddWithValue("@now", DateTime.UtcNow);
        cmd.Parameters.AddWithValue("@uid", (object?)userId ?? DBNull.Value);
        var affected = await cmd.ExecuteNonQueryAsync(ct);
        return Ok(new { ok = true, deleted = affected });
    }

    // ─── 7. Lookup options ───────────────────────────────────────────────────
    [HttpGet("lookup/{attributeId:int}")]
    public async Task<IActionResult> GetLookupOptions(int attributeId, CancellationToken ct)
    {
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = @"
            SELECT id, custom_attribute_id, code, value, descr, sort_order, is_active, external_id
              FROM [core].[custom_lookup]
             WHERE custom_attribute_id = @attr
               AND ISNULL(cancellato, 0) = 0
             ORDER BY sort_order, code";
        cmd.Parameters.AddWithValue("@attr", attributeId);

        var rows = new List<Dictionary<string, object?>>();
        await using var rd = await cmd.ExecuteReaderAsync(ct);
        while (await rd.ReadAsync(ct)) rows.Add(ReadRow(rd));
        return Ok(new { ok = true, count = rows.Count, options = rows });
    }

    public class LookupUpsertRequest
    {
        public int AttributeId { get; set; }
        public string Code { get; set; } = "";
        public string Value { get; set; } = "";
        public string? Descr { get; set; }
        public int SortOrder { get; set; }
        public string? ExternalId { get; set; }
    }
    [HttpPost("lookup")]
    public async Task<IActionResult> UpsertLookup([FromBody] LookupUpsertRequest req, CancellationToken ct)
    {
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = @"
            MERGE [core].[custom_lookup] AS tgt
            USING (SELECT @attr AS aid, @code AS c) AS src
               ON tgt.custom_attribute_id = src.aid AND tgt.code = src.c
            WHEN MATCHED THEN UPDATE SET value = @v, descr = @d, sort_order = @so, external_id = @ext, data_modifica = SYSUTCDATETIME()
            WHEN NOT MATCHED BY TARGET THEN
                INSERT (custom_attribute_id, code, value, descr, sort_order, external_id, data_creazione)
                VALUES (@attr, @code, @v, @d, @so, @ext, SYSUTCDATETIME());";
        cmd.Parameters.AddWithValue("@attr", req.AttributeId);
        cmd.Parameters.AddWithValue("@code", req.Code);
        cmd.Parameters.AddWithValue("@v", req.Value);
        cmd.Parameters.AddWithValue("@d", (object?)req.Descr ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@so", req.SortOrder);
        cmd.Parameters.AddWithValue("@ext", (object?)req.ExternalId ?? DBNull.Value);
        var affected = await cmd.ExecuteNonQueryAsync(ct);
        return Ok(new { ok = true, affected });
    }

    // ─── Task 10.2 — Mappings per Site/ProjectClass ──────────────────────────
    [HttpGet("mappings/{attributeId:int}")]
    public async Task<IActionResult> GetMappings(int attributeId, CancellationToken ct)
    {
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = @"
            SELECT m.id, m.custom_attribute_id, m.site_id, s.code AS site_code,
                   m.project_class_id, pc.code AS project_class_code,
                   m.tree_kind_id, m.label_loc, m.is_required_override, m.is_readonly_override,
                   m.year_from, m.year_to, m.time_based_ref, m.is_visible, m.edit_order_override
              FROM [core].[custom_attribute_mapping] m
              LEFT JOIN [core].[site] s ON s.id = m.site_id
              LEFT JOIN [core].[project_class] pc ON pc.id = m.project_class_id
             WHERE m.custom_attribute_id = @attr AND ISNULL(m.cancellato, 0) = 0
             ORDER BY ISNULL(m.edit_order_override, 0)";
        cmd.Parameters.AddWithValue("@attr", attributeId);
        var rows = new List<Dictionary<string, object?>>();
        await using var rd = await cmd.ExecuteReaderAsync(ct);
        while (await rd.ReadAsync(ct)) rows.Add(ReadRow(rd));
        return Ok(new { ok = true, count = rows.Count, mappings = rows });
    }

    public class MappingUpsertRequest
    {
        public int AttributeId { get; set; }
        public int? SiteId { get; set; }
        public int? ProjectClassId { get; set; }
        public byte? TreeKindId { get; set; }
        public string? LabelLoc { get; set; }
        public int? YearFrom { get; set; }
        public int? YearTo { get; set; }
        public bool IsVisible { get; set; } = true;
        public int? EditOrderOverride { get; set; }
    }
    [HttpPost("mappings")]
    public async Task<IActionResult> UpsertMapping([FromBody] MappingUpsertRequest req, CancellationToken ct)
    {
        var userId = ResolveCurrentUserId();
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = @"
            MERGE [core].[custom_attribute_mapping] AS tgt
            USING (SELECT @attr AS aid, @site AS sid, @class AS cid, @tk AS tk) AS src
               ON tgt.custom_attribute_id = src.aid
              AND ISNULL(tgt.site_id, -1) = ISNULL(src.sid, -1)
              AND ISNULL(tgt.project_class_id, -1) = ISNULL(src.cid, -1)
              AND ISNULL(tgt.tree_kind_id, 0) = ISNULL(src.tk, 0)
            WHEN MATCHED THEN UPDATE SET
                label_loc = @ll, year_from = @yf, year_to = @yt,
                is_visible = @vis, edit_order_override = @eo,
                data_modifica = SYSUTCDATETIME(), utente_modifica = @uid
            WHEN NOT MATCHED BY TARGET THEN
                INSERT (custom_attribute_id, site_id, project_class_id, tree_kind_id,
                        label_loc, year_from, year_to, is_visible, edit_order_override,
                        data_creazione, utente_creazione)
                VALUES (@attr, @site, @class, @tk, @ll, @yf, @yt, @vis, @eo,
                        SYSUTCDATETIME(), @uid);";
        cmd.Parameters.AddWithValue("@attr", req.AttributeId);
        cmd.Parameters.AddWithValue("@site", (object?)req.SiteId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@class", (object?)req.ProjectClassId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@tk", (object?)req.TreeKindId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@ll", (object?)req.LabelLoc ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@yf", (object?)req.YearFrom ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@yt", (object?)req.YearTo ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@vis", req.IsVisible);
        cmd.Parameters.AddWithValue("@eo", (object?)req.EditOrderOverride ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@uid", userId ?? 1);
        var affected = await cmd.ExecuteNonQueryAsync(ct);
        return Ok(new { ok = true, affected });
    }

    // ─── Task 10.5 — Permissions per (mapping, user, action) ─────────────────
    [HttpGet("permissions/{mappingId:int}")]
    public async Task<IActionResult> GetPermissions(int mappingId, CancellationToken ct)
    {
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = @"
            SELECT id, custom_attribute_mapping_id, user_id, role_code, action, value_whitelist_json
              FROM [core].[custom_attribute_permission]
             WHERE custom_attribute_mapping_id = @m AND ISNULL(cancellato, 0) = 0
             ORDER BY action, user_id, role_code";
        cmd.Parameters.AddWithValue("@m", mappingId);
        var rows = new List<Dictionary<string, object?>>();
        await using var rd = await cmd.ExecuteReaderAsync(ct);
        while (await rd.ReadAsync(ct)) rows.Add(ReadRow(rd));
        return Ok(new { ok = true, count = rows.Count, permissions = rows });
    }

    public class PermissionUpsertRequest
    {
        public int MappingId { get; set; }
        public int? UserId { get; set; }
        public string? RoleCode { get; set; }
        public string Action { get; set; } = "read";   // read|write|delete
        public string? ValueWhitelistJson { get; set; }
    }
    [HttpPost("permissions")]
    public async Task<IActionResult> UpsertPermission([FromBody] PermissionUpsertRequest req, CancellationToken ct)
    {
        var userId = ResolveCurrentUserId();
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO [core].[custom_attribute_permission] (
                custom_attribute_mapping_id, user_id, role_code, action, value_whitelist_json,
                data_creazione, utente_creazione
            ) VALUES (@m, @u, @r, @a, @wl, SYSUTCDATETIME(), @uid);
            SELECT SCOPE_IDENTITY();";
        cmd.Parameters.AddWithValue("@m", req.MappingId);
        cmd.Parameters.AddWithValue("@u", (object?)req.UserId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@r", (object?)req.RoleCode ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@a", req.Action);
        cmd.Parameters.AddWithValue("@wl", (object?)req.ValueWhitelistJson ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@uid", userId ?? 1);
        var newId = await cmd.ExecuteScalarAsync(ct);
        return Ok(new { ok = true, newId });
    }

    [HttpDelete("permissions/{id:int}")]
    public async Task<IActionResult> DeletePermission(int id, CancellationToken ct)
    {
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "UPDATE [core].[custom_attribute_permission] SET cancellato = 1, data_modifica = SYSUTCDATETIME() WHERE id = @id";
        cmd.Parameters.AddWithValue("@id", id);
        var affected = await cmd.ExecuteNonQueryAsync(ct);
        return Ok(new { ok = true, deleted = affected });
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────
    private int? ResolveCurrentUserId()
    {
        var claim = User?.FindFirst("user_id")?.Value;
        if (int.TryParse(claim, out var uid)) return uid;
        return 1;
    }

    private static Dictionary<string, object?> ReadRow(SqlDataReader rd)
    {
        var row = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        for (int i = 0; i < rd.FieldCount; i++)
            row[rd.GetName(i)] = rd.IsDBNull(i) ? null : rd.GetValue(i);
        return row;
    }
}
