import argparse
import hashlib
import json
import os
import re
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable, List, Optional


FILE_EXTENSIONS = {".cs", ".ts", ".sql", ".ps1", ".json"}
EXCLUDE_DIRS = {"bin", "obj", "node_modules", "wwwroot_js", ".angular", ".git"}
INCLUDE_DIRS = [
    "KonvergenceCore/Controllers",
    "KonvergenceCore/MetaModel",
    "KonvergenceCore/Services",
    "KonvergenceCore/Helpers",
    "KonvergenceCore/Models",
    "KonvergenceCore/Interfaces",
    "KonvergenceCore/dbms/scripts",
    "KonvergenceCore/scripts",
    "KonvergenceCore/wwwroot/my-workspace/projects/wuic-framework-lib",
    "CrmApp",
]
DB_FOCUS_TABLES = {
    "_metadati__tabelle",
    "_metadati__colonne",
    "_metadati__menu",
    "_mtdt__cstom__actions__tabelle",
    "_mtdt__tnt__trzzzioni__tabelle",
    "_mtdt__tnt__trzzzioni__colonne",
    "_mtdt__tnt__trizzazioni__menus",
    "_metadati__u_i__stili__tabelle",
    "_metadati__u_i__stili__colonne",
    "_metadati_condition_group",
    "_metadati_condition_item",
    "_metadati_condition_action_group",
    "_metadati_condition_action_item",
    "_wuic_workflow_graph",
    "_wuic_workflow_graph_route_metadata",
    "dom_board",
    "dom_board_element",
    "dom_board_sheet",
}

DEFAULT_WINDOW_LINES = 60
DEFAULT_OVERLAP_LINES = 12


@dataclass
class Chunk:
    chunk_id: str
    source: str
    source_type: str
    language: str
    rel_path: str
    symbol_type: str
    symbol_name: str
    start_line: int
    end_line: int
    text: str


def normalize_path(path: Path) -> str:
    return str(path).replace("\\", "/")


def should_exclude(path: Path) -> bool:
    return any(part in EXCLUDE_DIRS for part in path.parts)


def detect_language(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == ".cs":
        return "csharp"
    if ext == ".ts":
        return "typescript"
    if ext == ".sql":
        return "sql"
    if ext == ".ps1":
        return "powershell"
    return "text"


def safe_read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def hash_chunk(rel_path: str, start_line: int, end_line: int, symbol_name: str, text: str) -> str:
    payload = f"{rel_path}|{start_line}|{end_line}|{symbol_name}|{text}"
    return hashlib.sha1(payload.encode("utf-8", errors="ignore")).hexdigest()


def find_csharp_symbols(lines: List[str]) -> List[tuple]:
    symbols = []
    class_regex = re.compile(r"^\s*(public|internal|private|protected)?\s*(partial\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)")
    method_regex = re.compile(
        r"^\s*(public|internal|private|protected)\s+(static\s+)?([A-Za-z0-9_<>,\[\]\.?]+\s+)+([A-Za-z_][A-Za-z0-9_]*)\s*\(")
    for idx, line in enumerate(lines, start=1):
        c = class_regex.search(line)
        if c:
            symbols.append(("class", c.group(3), idx))
            continue
        m = method_regex.search(line)
        if m:
            symbols.append(("method", m.group(4), idx))
    return symbols


def find_typescript_symbols(lines: List[str]) -> List[tuple]:
    symbols = []
    class_regex = re.compile(r"^\s*export\s+class\s+([A-Za-z_][A-Za-z0-9_]*)")
    method_regex = re.compile(r"^\s*(public|private|protected)?\s*(async\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(")
    for idx, line in enumerate(lines, start=1):
        c = class_regex.search(line)
        if c:
            symbols.append(("class", c.group(1), idx))
            continue
        m = method_regex.search(line)
        if m:
            name = m.group(3)
            if name not in {"if", "for", "switch", "while", "catch"}:
                symbols.append(("method", name, idx))
    return symbols


def symbol_ranges(lines: List[str], language: str) -> List[tuple]:
    if language == "csharp":
        symbols = find_csharp_symbols(lines)
    elif language == "typescript":
        symbols = find_typescript_symbols(lines)
    else:
        symbols = []

    if not symbols:
        return []

    ranges = []
    for i, (sym_type, sym_name, start_line) in enumerate(symbols):
        end_line = symbols[i + 1][2] - 1 if i + 1 < len(symbols) else len(lines)
        if end_line < start_line:
            end_line = start_line
        ranges.append((sym_type, sym_name, start_line, end_line))
    return ranges


def sliding_windows(lines: List[str], window_lines: int, overlap_lines: int) -> List[tuple]:
    chunks = []
    step = max(1, window_lines - overlap_lines)
    start = 1
    n = len(lines)
    while start <= n:
        end = min(n, start + window_lines - 1)
        chunks.append(("window", f"window_{start}_{end}", start, end))
        if end == n:
            break
        start += step
    return chunks


def chunk_file(path: Path, root_dir: Path, window_lines: int, overlap_lines: int) -> List[Chunk]:
    content = safe_read_text(path)
    lines = content.splitlines()
    if not lines:
        return []

    rel_path = normalize_path(path.relative_to(root_dir))
    language = detect_language(path)
    ranges = symbol_ranges(lines, language)
    if not ranges:
        ranges = sliding_windows(lines, window_lines, overlap_lines)

    chunks = []
    for sym_type, sym_name, start_line, end_line in ranges:
        snippet = "\n".join(lines[start_line - 1:end_line]).strip()
        if not snippet:
            continue
        chunk_id = hash_chunk(rel_path, start_line, end_line, sym_name, snippet)
        chunks.append(
            Chunk(
                chunk_id=chunk_id,
                source="codebase",
                source_type="file",
                language=language,
                rel_path=rel_path,
                symbol_type=sym_type,
                symbol_name=sym_name,
                start_line=start_line,
                end_line=end_line,
                text=snippet,
            )
        )
    return chunks


def iter_included_files(root_dir: Path) -> Iterable[Path]:
    for include_dir in INCLUDE_DIRS:
        full_dir = root_dir / include_dir
        if not full_dir.exists():
            continue
        for path in full_dir.rglob("*"):
            if not path.is_file():
                continue
            if path.suffix.lower() not in FILE_EXTENSIONS:
                continue
            if should_exclude(path):
                continue
            if "mysql" in path.name.lower():
                continue
            yield path


def extract_code_chunks(root_dir: Path, output_jsonl: Path, window_lines: int, overlap_lines: int) -> int:
    all_chunks: List[Chunk] = []
    for path in iter_included_files(root_dir):
        all_chunks.extend(chunk_file(path, root_dir, window_lines, overlap_lines))

    output_jsonl.parent.mkdir(parents=True, exist_ok=True)
    with output_jsonl.open("w", encoding="utf-8") as f:
        for chunk in all_chunks:
            f.write(json.dumps(asdict(chunk), ensure_ascii=False) + "\n")
    return len(all_chunks)


def db_connection_from_env(env_key: str) -> Optional[str]:
    val = os.getenv(env_key, "").strip()
    return val if val else None


def parse_connection_kv(conn_str: str) -> dict:
    out = {}
    for part in (conn_str or "").split(";"):
        segment = part.strip()
        if not segment or "=" not in segment:
            continue
        k, v = segment.split("=", 1)
        out[k.strip().lower()] = v.strip()
    return out


def to_bool_str(value: str, default: str = "no") -> str:
    if value is None:
        return default
    v = str(value).strip().lower()
    if v in {"true", "1", "yes", "y", "sspi"}:
        return "yes"
    if v in {"false", "0", "no", "n"}:
        return "no"
    return default


def normalize_to_pyodbc_conn_str(conn_str: str) -> str:
    raw = (conn_str or "").strip()
    if not raw:
        return raw

    kv = parse_connection_kv(raw)
    # Already an ODBC string
    if "driver" in kv:
        return raw

    # ADO.NET style -> ODBC style
    driver = os.getenv("RAG_ODBC_DRIVER", "ODBC Driver 17 for SQL Server").strip()
    server = kv.get("data source") or kv.get("server") or ""
    database = kv.get("initial catalog") or kv.get("database") or ""
    uid = kv.get("user id") or kv.get("uid") or ""
    pwd = kv.get("password") or kv.get("pwd") or ""
    integrated = to_bool_str(kv.get("integrated security"), default="no")
    encrypt = to_bool_str(kv.get("encrypt"), default="no")
    trust = to_bool_str(kv.get("trustservercertificate"), default="yes")

    parts = [
        f"Driver={{{driver}}}",
        f"Server={server}",
    ]
    if database:
        parts.append(f"Database={database}")

    if integrated == "yes":
        parts.append("Trusted_Connection=yes")
    else:
        if uid:
            parts.append(f"UID={uid}")
        if pwd:
            parts.append(f"PWD={pwd}")

    parts.append(f"Encrypt={encrypt}")
    parts.append(f"TrustServerCertificate={trust}")
    return ";".join(parts) + ";"


def stringify_cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.hex()
    return str(value)


def extract_db_chunks(conn_str: str, output_jsonl: Path, db_label: str, max_rows: int = 80) -> int:
    import pyodbc

    normalized_conn = normalize_to_pyodbc_conn_str(conn_str)
    conn = pyodbc.connect(normalized_conn)
    cursor = conn.cursor()
    cursor.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'")
    tables = [row[0] for row in cursor.fetchall()]
    chunks = []

    for table in tables:
        cursor.execute(
            """
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = ?
            ORDER BY ORDINAL_POSITION
            """,
            (table,),
        )
        cols = cursor.fetchall()
        schema_lines = [f"{c[0]}:{c[1]} nullable={c[2]}" for c in cols]
        schema_text = f"TABLE {table}\n" + "\n".join(schema_lines)
        schema_chunk_id = hash_chunk(f"{db_label}.{table}", 1, 1, "table_schema", schema_text)
        chunks.append(
            Chunk(
                chunk_id=schema_chunk_id,
                source=db_label,
                source_type="db_schema",
                language="sql",
                rel_path=f"{db_label}/{table}",
                symbol_type="table",
                symbol_name=table,
                start_line=1,
                end_line=1,
                text=schema_text,
            )
        )

        table_l = table.lower()
        if table_l not in DB_FOCUS_TABLES:
            continue

        cursor.execute(f"SELECT TOP {max_rows} * FROM [{table}]")
        rows = cursor.fetchall()
        col_names = [c[0] for c in cursor.description]
        row_lines = []
        for row in rows:
            cells = [f"{k}={stringify_cell(v)}" for k, v in zip(col_names, row)]
            row_lines.append("; ".join(cells))

        if not row_lines:
            continue

        data_text = f"TABLE {table} SAMPLE_ROWS={len(row_lines)}\n" + "\n".join(row_lines)
        data_chunk_id = hash_chunk(f"{db_label}.{table}", 1, 1, "table_rows", data_text)
        chunks.append(
            Chunk(
                chunk_id=data_chunk_id,
                source=db_label,
                source_type="db_rows",
                language="sql",
                rel_path=f"{db_label}/{table}",
                symbol_type="table_data",
                symbol_name=table,
                start_line=1,
                end_line=1,
                text=data_text,
            )
        )

    conn.close()

    with output_jsonl.open("a", encoding="utf-8") as f:
        for chunk in chunks:
            f.write(json.dumps(asdict(chunk), ensure_ascii=False) + "\n")
    return len(chunks)


def main():
    parser = argparse.ArgumentParser(description="Extract codebase + DB into chunked JSONL for RAG ingestion.")
    parser.add_argument("--root-dir", default=r"c:/src/Wuic", help="Repository root.")
    parser.add_argument("--output-jsonl", default=r"c:/src/Wuic/codebase_docs/code_chunks.jsonl", help="Output JSONL.")
    parser.add_argument("--window-lines", type=int, default=DEFAULT_WINDOW_LINES, help="Fallback window size in lines.")
    parser.add_argument("--overlap-lines", type=int, default=DEFAULT_OVERLAP_LINES, help="Window overlap in lines.")
    parser.add_argument("--skip-db", action="store_true", help="Skip DB extraction.")
    parser.add_argument("--db-max-rows", type=int, default=80, help="Max sampled rows for focus tables.")
    args = parser.parse_args()

    root_dir = Path(args.root_dir)
    output_jsonl = Path(args.output_jsonl)

    output_jsonl.parent.mkdir(parents=True, exist_ok=True)
    if output_jsonl.exists():
        output_jsonl.unlink()

    code_count = extract_code_chunks(root_dir, output_jsonl, args.window_lines, args.overlap_lines)
    print(f"[extract] code chunks: {code_count}")

    if args.skip_db:
        print("[extract] DB extraction skipped.")
        return

    db_count = 0
    metadata_conn = db_connection_from_env("RAG_METADATACRM_CONN")
    kiara_conn = db_connection_from_env("RAG_KIARA_CONN")

    if metadata_conn:
        db_count += extract_db_chunks(metadata_conn, output_jsonl, "MetadataCRM", max_rows=args.db_max_rows)
        print("[extract] MetadataCRM loaded.")
    else:
        print("[extract] RAG_METADATACRM_CONN not set; skipping MetadataCRM.")

    if kiara_conn:
        db_count += extract_db_chunks(kiara_conn, output_jsonl, "Kiara_wuic_new", max_rows=args.db_max_rows)
        print("[extract] Kiara_wuic_new loaded.")
    else:
        print("[extract] RAG_KIARA_CONN not set; skipping Kiara_wuic_new.")

    print(f"[extract] db chunks: {db_count}")
    print(f"[extract] output: {output_jsonl}")


if __name__ == "__main__":
    main()
