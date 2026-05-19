using System.Collections.Generic;
using System.Data.Common;

namespace metaModelRaw
{
    /// <summary>
    /// Overloads di parity con MSSQL/MySQL gateway. Il <c>OracleProviderGateway</c>
    /// invoca <c>InsertflatData/UpdateflatData/DeleteflatData/DeleteflatDataByID</c>
    /// con 5 (rispettivamente 4) parametri inclusi <c>DbConnection conn</c> +
    /// <c>DbTransaction trn</c>; il loader riflessivo
    /// <c>FindCompatibleMethod</c> richiede un match esatto sul numero di args
    /// (mandatoryCount &lt;= rawArgs.Length &lt;= parameters.Length). Senza
    /// questi overload il dispatch fallisce con <c>MissingMethodException</c>.
    ///
    /// Implementazione: questi overload IGNORANO i parametri <paramref name="conn"/>
    /// e <paramref name="trn"/> e delegano ai metodi 3-param storici (che aprono
    /// la propria connessione). E' la stessa contract della precedente
    /// versione MySSQL — i parametri sono storicamente opt-in per la
    /// transactional batch-edit (multi-record save), non mandatory per la
    /// single-record CUD.
    /// </summary>
    public partial class metaQueryOracleSql
    {
        public static string InsertflatData(Dictionary<string, object> entity, string route, string userId, DbConnection conn, DbTransaction trn)
            => InsertflatData(entity, route, userId);

        public static string UpdateflatData(Dictionary<string, object> entity, string route, string userId, DbConnection conn, DbTransaction trn)
            => UpdateflatData(entity, route, userId);

        public static string DeleteflatData(Dictionary<string, object> entity, string route, string userId, DbConnection conn, DbTransaction trn)
            => DeleteflatData(entity, route, userId);
    }
}
