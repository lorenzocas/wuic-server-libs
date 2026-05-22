using System.Data.Common;
using System.Linq;
using Dapper;

namespace metaModelRaw
{
    /// <summary>
    /// Provider-native suggest helpers per Oracle.
    /// Partial della classe satellite <c>metaQueryOracleSql</c>: ogni metodo qui dentro
    /// genera SQL Oracle-specific (data dictionary o sintassi nativa) e viene esposto
    /// al main `KonvergenceCore` via reflection tramite `OracleProviderGateway`.
    ///
    /// Pattern: stesso del SQL emission (BuildDynamicSelectQuery, ecc.) — il main NON
    /// referenzia direttamente Oracle.ManagedDataAccess né emette SQL Oracle nativo;
    /// tutto passa via gateway. Vedi `OracleProviderGateway.ResolveFkReferencedTable`
    /// per il wrapper consumer e `_Metadati_suggestions_oraclesql.suggestLookup` per
    /// l'uso in suggest flow.
    /// </summary>
    public partial class metaQueryOracleSql
    {
        /// <summary>
        /// Query Oracle Data Dictionary per risolvere la referenced_table di una FK constraint.
        /// Mirror semantico di MSSQL <c>sys.foreign_key_columns</c> e MySQL
        /// <c>INFORMATION_SCHEMA.KEY_COLUMN_USAGE</c>. Usa <c>ALL_*</c> (non <c>USER_*</c>)
        /// per supportare scenari multi-schema. Filtro per <c>CONSTRAINT_TYPE = 'R'</c>
        /// (referential = FK). <c>FETCH FIRST 1 ROWS ONLY</c> perche' Oracle ammette piu'
        /// FK per stessa colonna (raro ma possibile) — prendiamo la prima.
        /// Restituisce empty se la colonna non e' FK o se la query fallisce.
        /// </summary>
        public static string ResolveFkReferencedTable(string ownerTable, string ownerColumn)
        {
            try
            {
                using (DbConnection con = GetOpenConnection(false))
                {
                    const string sql = @"
SELECT b.TABLE_NAME AS referenced_table
FROM   ALL_CONSTRAINTS a
JOIN   ALL_CONSTRAINTS b ON a.R_OWNER = b.OWNER AND a.R_CONSTRAINT_NAME = b.CONSTRAINT_NAME
JOIN   ALL_CONS_COLUMNS c ON a.OWNER = c.OWNER AND a.CONSTRAINT_NAME = c.CONSTRAINT_NAME
WHERE  a.CONSTRAINT_TYPE = 'R'
  AND  UPPER(c.TABLE_NAME)  = UPPER(:owner_table)
  AND  UPPER(c.COLUMN_NAME) = UPPER(:owner_column)
FETCH FIRST 1 ROWS ONLY";
                    var args = new DynamicParameters();
                    args.Add("owner_table", ownerTable);
                    args.Add("owner_column", ownerColumn);
                    return con.QueryColumn<string>(sql, args).FirstOrDefault() ?? "";
                }
            }
            catch
            {
                // Defensive: se la query Data Dictionary fallisce (permission, ecc.) non
                // rompiamo la suggest UI — restituiamo empty come "no FK detected".
                return "";
            }
        }
    }
}
