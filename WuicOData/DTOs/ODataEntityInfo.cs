using System.Collections.Generic;

namespace WuicOData.DTOs
{
    public class ODataEntityInfo
    {
        /// <summary>DB table name (md_nome_tabella)</summary>
        public string TableName { get; set; }

        public string PKeytype { get; set; }

        /// <summary>DB schema name (md_schema_name)</summary>
        public string SchemaName { get; set; }

        /// <summary>C# class name derived from md_route_name</summary>
        public string ClassName { get; set; }

        /// <summary>
        /// Route metadata name (md_route_name), tipicamente lowercase. Usato
        /// come chiave per risolvere i target delle colonne `lookupByID` verso
        /// i nomi di classe generati (vedi `MetadataModelGenerator` — mappa
        /// `LookupEntityRouteName` -> ClassName del target per emettere le
        /// navigation properties).
        /// </summary>
        public string RouteName { get; set; }

        public List<ODataColumnInfo> Columns { get; set; } = new();
    }

    public class ODataColumnInfo
    {
        /// <summary>Actual DB column name (mc_nome_colonna)</summary>
        public string ColumnName { get; set; }

        /// <summary>DB type string (mc_db_column_type)</summary>
        public string DbType { get; set; }

        /// <summary>mc_is_primary_key</summary>
        public bool IsPrimaryKey { get; set; }

        /// <summary>mc_logic_nullable</summary>
        public bool IsNullable { get; set; }

        /// <summary>mc_is_computed || mc_is_db_computed</summary>
        public bool IsComputed { get; set; }

        /// <summary>mc_max_length</summary>
        public int? MaxLength { get; set; }

        /// <summary>
        /// Route name della tabella lookup quando `mc_ui_column_type='lookupByID'`
        /// (valorizzato da `mc_ui_lookup_entity_name`). Usato dal
        /// `MetadataModelGenerator` per emettere la navigation property
        /// sull'entita' generata (es. Cities.stateProvinceID ha
        /// LookupEntityRouteName='stateprovinces' → viene generato
        /// `public virtual Stateprovinces StateProvince { get; set; }` + il
        /// fluent `HasOne().WithMany().HasForeignKey()` che abilita
        /// `$expand=stateProvince` via OData).
        /// </summary>
        public string LookupEntityRouteName { get; set; }
    }
}
