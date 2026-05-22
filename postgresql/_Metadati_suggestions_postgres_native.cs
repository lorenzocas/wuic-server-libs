using System.Data.Common;
using System.Linq;
using Dapper;

namespace metaModelRaw
{
    /// <summary>
    /// Provider-native suggest helpers per PostgreSQL.
    /// Partial della classe satellite <c>metaQueryPostgreSql</c>: ogni metodo qui dentro
    /// genera SQL Postgres-specific (information_schema o sintassi nativa) e viene esposto
    /// al main `KonvergenceCore` via reflection tramite `PostGresProviderGateway`.
    ///
    /// Pattern: stesso del SQL emission (BuildDynamicSelectQuery, ecc.) — il main NON
    /// referenzia direttamente Npgsql né emette SQL Postgres nativo; tutto passa via gateway.
    /// Vedi `PostGresProviderGateway.ResolveFkReferencedTable` per il wrapper consumer e
    /// `_Metadati_suggestions_postgresql.suggestLookup` per l'uso in suggest flow.
    /// </summary>
    public partial class metaQueryPostgreSql
    {
        /// <summary>
        /// Query Postgres information_schema per risolvere la referenced_table di una FK
        /// constraint. Mirror semantico di Oracle ALL_CONS_COLUMNS e MSSQL sys.foreign_key_columns.
        /// Pattern join: KCU (la colonna FK del child) → RC (constraint metadata) →
        /// CCU (la colonna PK del parent / referenced). Filter case-insensitive perche'
        /// Postgres preserva il case originale degli identifier e la tabella metadata
        /// WUIC potrebbe avere variation. <c>LIMIT 1</c> perche' una colonna ha al massimo
        /// una FK target. Restituisce empty se la colonna non e' FK o se la query fallisce.
        /// </summary>
        public static string ResolveFkReferencedTable(string ownerTable, string ownerColumn)
        {
            try
            {
                using (DbConnection con = GetOpenConnection(false))
                {
                    const string sql = @"
SELECT ccu.table_name AS referenced_table
FROM   information_schema.key_column_usage kcu
JOIN   information_schema.referential_constraints rc
        ON kcu.constraint_schema = rc.constraint_schema
       AND kcu.constraint_name   = rc.constraint_name
JOIN   information_schema.constraint_column_usage ccu
        ON rc.unique_constraint_schema = ccu.constraint_schema
       AND rc.unique_constraint_name   = ccu.constraint_name
WHERE  LOWER(kcu.table_name)  = LOWER(@owner_table)
  AND  LOWER(kcu.column_name) = LOWER(@owner_column)
LIMIT 1";
                    var args = new DynamicParameters();
                    args.Add("owner_table", ownerTable);
                    args.Add("owner_column", ownerColumn);
                    return con.QueryColumn<string>(sql, args).FirstOrDefault() ?? "";
                }
            }
            catch
            {
                // Defensive: se la query information_schema fallisce non rompiamo la
                // suggest UI — restituiamo empty come "no FK detected".
                return "";
            }
        }
    }
}
