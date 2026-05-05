/**
 * Data model for the multi-table View Builder (Tab 1 of the pivot-builder).
 *
 * The ViewDefinition is the contract between the view-builder canvas and
 * the pivot configuration (Tab 2). It serializes cleanly to JSON for
 * save/load persistence inside `pivot_config_json`.
 */

/** A column from a table in the view builder. */
export interface ViewColumn {
  /** mc_nome_colonna */
  alias: string;
  /** mc_real_column_name */
  realName: string;
  /** mc_display_string_in_view */
  label: string;
  /** mc_db_column_type */
  dbType: string;
  /** mc_ui_column_type */
  uiType: string;
  /** Route of the table this column belongs to */
  tableRoute: string;
  /** SQL alias for the table (e.g., "t0", "t1") */
  tableAlias: string;
  /** "TableCaption.ColumnLabel" — used in Tab 2 to distinguish same-named columns */
  qualifiedLabel: string;
  /** Whether user selected this column for the view */
  selected: boolean;
  /** True when the column exists only in metadata (e.g. button) and has no physical DB column */
  virtual?: boolean;
  /** If this is a lookupByID column, the target entity route */
  lookupEntityName?: string;
  /** If this is a lookupByID column, the FK value field */
  lookupDataValueField?: string;
  /** If this is a lookupByID column, the display text field on the target */
  lookupDataTextField?: string;
  /** Whether this column is filterable in the filter-bar (from mc_show_in_filters) */
  showInFilters?: boolean;
  /** Custom SQL formula to use instead of the column reference (e.g. "YEAR(t0.ValidFrom)") */
  formula?: string;
  /** Custom alias for the formula output */
  formulaAlias?: string;
}

/** A table node placed on the view-builder Rete.js canvas. */
export interface ViewTableNode {
  /** Rete node ID */
  nodeId: string;
  /** Scaffolded route name */
  route: string;
  /** Metadata table ID (_metadati__tabelle.md_id) */
  mdId: number | null;
  /** Physical table name (md_nome_tabella) */
  tableName: string;
  /** Schema (default 'dbo') */
  schemaName: string;
  /** Human-readable caption */
  caption: string;
  /** SQL alias assigned (t0, t1, t2, ...) */
  tableAlias: string;
  /** All columns, each with a `selected` flag */
  columns: ViewColumn[];
  /** Canvas X position */
  x: number;
  /** Canvas Y position */
  y: number;
  /** Whether the node is collapsed in the canvas */
  collapsed?: boolean;
}

/** A JOIN edge between two table nodes. */
export interface ViewJoinEdge {
  /** Rete connection ID */
  edgeId: string;
  /** FK source node ID */
  sourceNodeId: string;
  /** FK source route */
  sourceRoute: string;
  /** FK column alias on the source table */
  sourceColumn: string;
  /** PK target node ID */
  targetNodeId: string;
  /** PK target route */
  targetRoute: string;
  /** PK column on the target table */
  targetColumn: string;
  /** JOIN type */
  joinType: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  /** true if created automatically from lookupByID metadata */
  autoDetected: boolean;
}

/** Complete view definition — the output of Tab 1, input to Tab 2 and backend. */
export interface ViewDefinition {
  tables: ViewTableNode[];
  joins: ViewJoinEdge[];
}

/**
 * Flattened list of selected columns from a ViewDefinition.
 * Convenience for Tab 2 consumption.
 */
export function getSelectedColumns(def: ViewDefinition | null): ViewColumn[] {
  if (!def?.tables?.length) return [];
  return def.tables.flatMap(t => t.columns.filter(c => c.selected));
}

/**
 * Returns true if the view definition represents a multi-table view
 * (i.e., more than one table with at least one join).
 */
export function isMultiTableView(def: ViewDefinition | null): boolean {
  return (def?.tables?.length ?? 0) > 1;
}
