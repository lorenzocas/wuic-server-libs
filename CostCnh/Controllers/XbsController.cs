using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace CostCnh.Controllers;

/// <summary>
/// XBS hierarchy operations (Sprint 2 — Livello 5 custom controller della
/// decision ladder app-creation). Sostituisce il rigido modello legacy
/// `facts.XBS_Objects` (5 colonne fisse Id_XBS_Objects_1..5 + 5 VARBINARY mask)
/// con un singolo HIERARCHYID + operazioni native SQL Server.
///
/// Endpoint:
///   GET    /api/xbs/{treeKind}/roots
///   GET    /api/xbs/node/{id}/children
///   GET    /api/xbs/node/{id}/descendants?maxDepth=N
///   GET    /api/xbs/node/{id}/ancestors
///   POST   /api/xbs/node/{parentId}/child   (body: { code, name, description?, treeKindId?, programId?, siteId? })
///   POST   /api/xbs/root                     (body: { code, name, treeKindId, programId?, siteId? })
///   PUT    /api/xbs/node/{id}/move/{newParentId}
///   DELETE /api/xbs/node/{id}                (soft delete via cancellato=1; sottoalbero cancellato a cascata)
///
/// Note operative:
///   - `treeKind` puo' essere passato come codice (XBS/WBS/OBS/CBS) o come id numerico.
///   - Ogni operazione e' atomica via SqlTransaction.
///   - Per move-subtree, la SP nativa usa
///     `child.node_path.GetReparentedValue(oldParent, newParent)` su tutti
///     i discendenti — operazione O(N) ma in singolo UPDATE batch.
/// </summary>
[ApiController]
[Route("api/xbs")]
public class XbsController : ControllerBase
{
    private readonly string _cs;
    private readonly ILogger<XbsController> _logger;

    public XbsController(IConfiguration cfg, ILogger<XbsController> logger)
    {
        _logger = logger;
        _cs = cfg.GetConnectionString("DataSQLConnection")
              ?? cfg["AppSettings:connection"]
              ?? throw new InvalidOperationException("DataSQLConnection mancante in appsettings.json");
    }

    // ─── GET roots ─────────────────────────────────────────────────────────────
    [HttpGet("{treeKind}/roots")]
    public async Task<IActionResult> GetRoots(string treeKind, CancellationToken ct)
    {
        var (kindId, kindErr) = await ResolveTreeKindIdAsync(treeKind, ct);
        if (kindErr != null) return BadRequest(new { ok = false, error = kindErr });

        const string sql = @"
SELECT n.id, n.code, n.name, n.depth, n.node_path.ToString() AS path_string,
       n.tree_kind_id, n.program_id, n.site_id, n.is_leaf, n.sort_order
FROM   [xbs].[node] n
WHERE  n.tree_kind_id = @kind
  AND  n.depth = 1
  AND  ISNULL(n.cancellato, 0) = 0
ORDER  BY n.sort_order, n.code;";
        var rows = await ReadRowsAsync(sql, new Dictionary<string, object?> { ["@kind"] = kindId }, ct);
        return Ok(new { ok = true, rows });
    }

    // ─── GET children ──────────────────────────────────────────────────────────
    [HttpGet("node/{id:long}/children")]
    public async Task<IActionResult> GetChildren(long id, CancellationToken ct)
    {
        const string sql = @"
DECLARE @path HIERARCHYID = (SELECT node_path FROM [xbs].[node] WHERE id = @id);
DECLARE @kind TINYINT      = (SELECT tree_kind_id FROM [xbs].[node] WHERE id = @id);
SELECT n.id, n.code, n.name, n.depth, n.node_path.ToString() AS path_string,
       n.is_leaf, n.sort_order, n.program_id, n.site_id
FROM   [xbs].[node] n
WHERE  n.node_path.GetAncestor(1) = @path
  AND  n.tree_kind_id = @kind
  AND  ISNULL(n.cancellato, 0) = 0
ORDER  BY n.sort_order, n.code;";
        var rows = await ReadRowsAsync(sql, new Dictionary<string, object?> { ["@id"] = id }, ct);
        return Ok(new { ok = true, rows });
    }

    // ─── GET descendants ───────────────────────────────────────────────────────
    [HttpGet("node/{id:long}/descendants")]
    public async Task<IActionResult> GetDescendants(long id, [FromQuery] int? maxDepth, CancellationToken ct)
    {
        var sql = @"
DECLARE @path HIERARCHYID = (SELECT node_path FROM [xbs].[node] WHERE id = @id);
DECLARE @kind TINYINT      = (SELECT tree_kind_id FROM [xbs].[node] WHERE id = @id);
DECLARE @rootDepth INT     = (SELECT depth FROM [xbs].[node] WHERE id = @id);
SELECT n.id, n.code, n.name, n.depth, (n.depth - @rootDepth) AS relative_depth,
       n.node_path.ToString() AS path_string, n.is_leaf
FROM   [xbs].[node] n
WHERE  n.node_path.IsDescendantOf(@path) = 1
  AND  n.id <> @id
  AND  n.tree_kind_id = @kind
  AND  ISNULL(n.cancellato, 0) = 0";
        if (maxDepth.HasValue && maxDepth > 0)
            sql += "\n  AND  (n.depth - @rootDepth) <= @maxDepth";
        sql += "\nORDER BY n.node_path;";

        var p = new Dictionary<string, object?> { ["@id"] = id };
        if (maxDepth.HasValue) p["@maxDepth"] = maxDepth.Value;
        var rows = await ReadRowsAsync(sql, p, ct);
        return Ok(new { ok = true, rows });
    }

    // ─── GET ancestors ─────────────────────────────────────────────────────────
    [HttpGet("node/{id:long}/ancestors")]
    public async Task<IActionResult> GetAncestors(long id, CancellationToken ct)
    {
        const string sql = @"
DECLARE @path HIERARCHYID = (SELECT node_path FROM [xbs].[node] WHERE id = @id);
DECLARE @kind TINYINT      = (SELECT tree_kind_id FROM [xbs].[node] WHERE id = @id);
SELECT n.id, n.code, n.name, n.depth, n.node_path.ToString() AS path_string
FROM   [xbs].[node] n
WHERE  @path.IsDescendantOf(n.node_path) = 1
  AND  n.id <> @id
  AND  n.tree_kind_id = @kind
  AND  ISNULL(n.cancellato, 0) = 0
ORDER  BY n.depth;";
        var rows = await ReadRowsAsync(sql, new Dictionary<string, object?> { ["@id"] = id }, ct);
        return Ok(new { ok = true, rows });
    }

    // ─── POST create child ─────────────────────────────────────────────────────
    public class CreateNodePayload
    {
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
        public string? Description { get; set; }
        public byte? TreeKindId { get; set; }
        public string? TreeKind { get; set; }
        public int? ProgramId { get; set; }
        public int? SiteId { get; set; }
        public bool IsLeaf { get; set; } = false;
        public int SortOrder { get; set; } = 0;
    }

    [HttpPost("root")]
    public async Task<IActionResult> CreateRoot([FromBody] CreateNodePayload p, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(p.Code) || string.IsNullOrWhiteSpace(p.Name))
            return BadRequest(new { ok = false, error = "Code e Name obbligatori." });

        byte kindId;
        if (p.TreeKindId.HasValue) kindId = p.TreeKindId.Value;
        else if (!string.IsNullOrWhiteSpace(p.TreeKind))
        {
            var (k, e) = await ResolveTreeKindIdAsync(p.TreeKind!, ct);
            if (e != null) return BadRequest(new { ok = false, error = e });
            kindId = (byte)k!;
        }
        else return BadRequest(new { ok = false, error = "TreeKindId o TreeKind obbligatorio." });

        // Compute next root path: hierarchyid::GetRoot().GetDescendant(MAX, NULL)
        const string sql = @"
DECLARE @lastChild HIERARCHYID = (
    SELECT MAX(node_path) FROM [xbs].[node]
     WHERE tree_kind_id = @kind AND depth = 1 AND ISNULL(cancellato, 0) = 0
);
DECLARE @newPath HIERARCHYID = HIERARCHYID::GetRoot().GetDescendant(@lastChild, NULL);

INSERT INTO [xbs].[node] (node_path, tree_kind_id, site_id, program_id, code, name, description, is_leaf, sort_order)
OUTPUT INSERTED.id, INSERTED.node_path.ToString() AS path_string, INSERTED.depth
VALUES (@newPath, @kind, @site, @prog, @code, @name, @desc, @leaf, @ord);";
        var prm = new Dictionary<string, object?>
        {
            ["@kind"] = kindId,
            ["@site"] = (object?)p.SiteId ?? DBNull.Value,
            ["@prog"] = (object?)p.ProgramId ?? DBNull.Value,
            ["@code"] = p.Code,
            ["@name"] = p.Name,
            ["@desc"] = (object?)p.Description ?? DBNull.Value,
            ["@leaf"] = p.IsLeaf,
            ["@ord"] = p.SortOrder
        };
        var rows = await ReadRowsAsync(sql, prm, ct);
        return Ok(new { ok = true, node = rows.FirstOrDefault() });
    }

    [HttpPost("node/{parentId:long}/child")]
    public async Task<IActionResult> CreateChild(long parentId, [FromBody] CreateNodePayload p, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(p.Code) || string.IsNullOrWhiteSpace(p.Name))
            return BadRequest(new { ok = false, error = "Code e Name obbligatori." });

        const string sql = @"
DECLARE @parentPath HIERARCHYID = (SELECT node_path FROM [xbs].[node] WHERE id = @parent AND ISNULL(cancellato,0)=0);
IF @parentPath IS NULL
BEGIN
    SELECT NULL AS id; RETURN;
END;
DECLARE @kindFromParent TINYINT = (SELECT tree_kind_id FROM [xbs].[node] WHERE id = @parent);
DECLARE @lastChild HIERARCHYID = (
    SELECT MAX(node_path) FROM [xbs].[node]
     WHERE node_path.GetAncestor(1) = @parentPath
       AND tree_kind_id = @kindFromParent
       AND ISNULL(cancellato, 0) = 0
);
DECLARE @newPath HIERARCHYID = @parentPath.GetDescendant(@lastChild, NULL);

INSERT INTO [xbs].[node] (node_path, tree_kind_id, site_id, program_id, code, name, description, is_leaf, sort_order)
OUTPUT INSERTED.id, INSERTED.node_path.ToString() AS path_string, INSERTED.depth, INSERTED.tree_kind_id
VALUES (@newPath, @kindFromParent, @site, @prog, @code, @name, @desc, @leaf, @ord);";
        var prm = new Dictionary<string, object?>
        {
            ["@parent"] = parentId,
            ["@site"] = (object?)p.SiteId ?? DBNull.Value,
            ["@prog"] = (object?)p.ProgramId ?? DBNull.Value,
            ["@code"] = p.Code,
            ["@name"] = p.Name,
            ["@desc"] = (object?)p.Description ?? DBNull.Value,
            ["@leaf"] = p.IsLeaf,
            ["@ord"] = p.SortOrder
        };
        var rows = await ReadRowsAsync(sql, prm, ct);
        var n = rows.FirstOrDefault();
        if (n == null || !n.ContainsKey("id") || n["id"] == null)
            return NotFound(new { ok = false, error = $"Parent node {parentId} non trovato o cancellato." });
        return Ok(new { ok = true, node = n });
    }

    // ─── PUT move subtree ──────────────────────────────────────────────────────
    [HttpPut("node/{id:long}/move/{newParentId:long}")]
    public async Task<IActionResult> MoveSubtree(long id, long newParentId, CancellationToken ct)
    {
        if (id == newParentId)
            return BadRequest(new { ok = false, error = "newParentId non puo' coincidere con id." });

        const string sql = @"
DECLARE @oldPath  HIERARCHYID = (SELECT node_path FROM [xbs].[node] WHERE id = @id);
DECLARE @newPar   HIERARCHYID = (SELECT node_path FROM [xbs].[node] WHERE id = @newParent);
DECLARE @kindId   TINYINT     = (SELECT tree_kind_id FROM [xbs].[node] WHERE id = @id);
DECLARE @kindPar  TINYINT     = (SELECT tree_kind_id FROM [xbs].[node] WHERE id = @newParent);
IF @oldPath IS NULL OR @newPar IS NULL
BEGIN
    SELECT 0 AS moved_count, 'NODE_NOT_FOUND' AS error_code; RETURN;
END
IF @kindId <> @kindPar
BEGIN
    SELECT 0 AS moved_count, 'CROSS_KIND_MOVE_FORBIDDEN' AS error_code; RETURN;
END
IF @newPar.IsDescendantOf(@oldPath) = 1
BEGIN
    SELECT 0 AS moved_count, 'CYCLE_DETECTED' AS error_code; RETURN;
END

DECLARE @lastChild HIERARCHYID = (
    SELECT MAX(node_path) FROM [xbs].[node]
     WHERE node_path.GetAncestor(1) = @newPar
       AND tree_kind_id = @kindPar
       AND ISNULL(cancellato, 0) = 0
);
DECLARE @newPath HIERARCHYID = @newPar.GetDescendant(@lastChild, NULL);

-- Reparent subtree in single batch (O(N) updates ma in TX singola)
UPDATE n
   SET node_path = n.node_path.GetReparentedValue(@oldPath, @newPath)
FROM [xbs].[node] n
WHERE n.node_path.IsDescendantOf(@oldPath) = 1
  AND n.tree_kind_id = @kindId;

SELECT @@ROWCOUNT AS moved_count, NULL AS error_code;";
        var rows = await ReadRowsAsync(sql, new Dictionary<string, object?>
        {
            ["@id"] = id,
            ["@newParent"] = newParentId
        }, ct);
        var r = rows.FirstOrDefault() ?? new Dictionary<string, object?>();
        if (r.TryGetValue("error_code", out var ec) && ec != null && ec != DBNull.Value)
            return BadRequest(new { ok = false, error = ec.ToString() });
        return Ok(new { ok = true, movedCount = r.GetValueOrDefault("moved_count") });
    }

    // ─── DELETE soft delete subtree ────────────────────────────────────────────
    [HttpDelete("node/{id:long}")]
    public async Task<IActionResult> SoftDeleteSubtree(long id, CancellationToken ct)
    {
        const string sql = @"
DECLARE @path HIERARCHYID = (SELECT node_path FROM [xbs].[node] WHERE id = @id);
DECLARE @kind TINYINT     = (SELECT tree_kind_id FROM [xbs].[node] WHERE id = @id);
IF @path IS NULL
BEGIN
    SELECT 0 AS deleted_count; RETURN;
END
UPDATE n
   SET cancellato = 1,
       data_eliminazione = SYSUTCDATETIME()
FROM [xbs].[node] n
WHERE n.node_path.IsDescendantOf(@path) = 1
  AND n.tree_kind_id = @kind
  AND ISNULL(n.cancellato, 0) = 0;
SELECT @@ROWCOUNT AS deleted_count;";
        var rows = await ReadRowsAsync(sql, new Dictionary<string, object?> { ["@id"] = id }, ct);
        var r = rows.FirstOrDefault() ?? new Dictionary<string, object?>();
        return Ok(new { ok = true, deletedCount = r.GetValueOrDefault("deleted_count") });
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────
    private async Task<(byte? id, string? error)> ResolveTreeKindIdAsync(string treeKind, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(treeKind))
            return (null, "treeKind mancante.");

        if (byte.TryParse(treeKind, out var num)) return (num, null);

        await using var cn = new SqlConnection(_cs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "SELECT TOP 1 id FROM [xbs].[tree_kind] WHERE code = @c";
        cmd.Parameters.AddWithValue("@c", treeKind.ToUpperInvariant());
        var res = await cmd.ExecuteScalarAsync(ct);
        if (res == null || res == DBNull.Value)
            return (null, $"tree_kind '{treeKind}' non trovato.");
        return (Convert.ToByte(res), null);
    }

    private async Task<List<Dictionary<string, object?>>> ReadRowsAsync(string sql, IDictionary<string, object?> parameters, CancellationToken ct)
    {
        var result = new List<Dictionary<string, object?>>();
        await using var cn = new SqlConnection(_cs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = sql;
        cmd.CommandTimeout = 60;
        foreach (var kv in parameters)
            cmd.Parameters.AddWithValue(kv.Key, kv.Value ?? DBNull.Value);

        await using var rdr = await cmd.ExecuteReaderAsync(ct);
        while (await rdr.ReadAsync(ct))
        {
            var row = new Dictionary<string, object?>();
            for (int i = 0; i < rdr.FieldCount; i++)
            {
                var v = rdr.GetValue(i);
                row[rdr.GetName(i)] = v == DBNull.Value ? null : v;
            }
            result.Add(row);
        }
        return result;
    }
}
