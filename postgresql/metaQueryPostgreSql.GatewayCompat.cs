using System.Collections.Generic;
using System.Data.Common;

namespace metaModelRaw
{
    /// <summary>
    /// Overloads di parity con MSSQL/MySQL gateway. Vedi commento gemello in
    /// <c>metaQueryOracleSql.GatewayCompat.cs</c> per il rationale completo
    /// (FindCompatibleMethod arity match, conn/trn ignorati per single-record CUD).
    /// </summary>
    public partial class metaQueryPostgreSql
    {
        public static string InsertflatData(Dictionary<string, object> entity, string route, string userId, DbConnection conn, DbTransaction trn)
            => InsertflatData(entity, route, userId);

        public static string UpdateflatData(Dictionary<string, object> entity, string route, string userId, DbConnection conn, DbTransaction trn)
            => UpdateflatData(entity, route, userId);

        public static string DeleteflatData(Dictionary<string, object> entity, string route, string userId, DbConnection conn, DbTransaction trn)
            => DeleteflatData(entity, route, userId);
    }
}
