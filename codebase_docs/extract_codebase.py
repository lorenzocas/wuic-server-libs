import argparse
import hashlib
import json
import os
import re
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable, List, Optional


FILE_EXTENSIONS = {".cs", ".ts", ".md"}
EXCLUDE_DIRS = {"bin", "obj", "node_modules", "wwwroot_js", ".angular", ".git"}
# Files we never want in the index: pure noise that produces only sliding-window
# chunks (no real symbols), or generated artifacts that flood BM25 with repeated
# tokens. Match against the file name (case-insensitive).
EXCLUDE_FILE_NAME_PATTERNS = (
    "package-lock.json",
    "screenshots.manifest.json",
    # External deps type declarations (NON API WUIC): monaco-editor e' il typing
    # di Monaco, vitest-compat e' shim di test runner, monaco-shim e' wrapper
    # interno per Monaco. Nessuno di questi e' superficie pubblica del framework.
    "monaco-editor.d.ts",
    "monaco-shim.d.ts",
    "vitest-compat.d.ts",
)
EXCLUDE_FILE_NAME_SUFFIXES = (
    ".generated.cs",
    ".generated.ts",
    ".spec.ts",
    ".spec.cs",
    ".e2e.spec.ts",
    # NB: i `.d.ts` NON sono esclusi - sono l'API pubblica consumabile da
    # end-dev che usano wuic-framework-lib via npm. Contengono @Input/@Output,
    # signature metodi, interfaces esposte - ground truth per query tipo
    # "che input accetta <wuic-list-grid>". Le copie dump in /assets/declarations/
    # sono ridondanti ma non rumore: forniscono pattern "tutti i tipi in un file".
    # Barrel re-export: solo "export * from './foo'", niente semantica.
    "public-api.ts",
    "public_api.ts",
    # Environment config Angular (api_url + version hardcoded), non pattern framework.
    "environment.ts",
    "environment.prod.ts",
    "environment.test.ts",
)
# Path fragments (case-insensitive substring match on rel_path)
EXCLUDE_PATH_FRAGMENTS = (
    "/playwright/",
    "/test-results/",
    "/dist/",
    "/.angular/",
    "/artifacts/",   # build output (release zip staging, lib-dist, ecc.) - rumore puro
    "/_deprecated/", # archivio dismesso (es. scripts/docs/_deprecated/) - difensivo per futuri rebuild
    # NB: /assets/ NON e' escluso. /assets/declarations/*.d.ts contiene l'API
    # pubblica del framework bundled in single-file per IDE autocompletion,
    # utile per query di end-dev consumatori. I file non-.d.ts sotto /assets/
    # (immagini, i18n json, screenshots) vengono filtrati via FILE_EXTENSIONS
    # (solo .cs/.ts/.md sono indicizzati).
    # Altri path specifici da evitare sono presi via EXCLUDE_FILE_NAME_PATTERNS.
    "/assets/wuic-framework-docs/",  # screenshots gallery JSON - non codice
    "/assets/i18n/",                 # translation JSON - non codice
)
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
    # skills/ contiene le SKILL.md (guide operative canoniche: "come fare X").
    # Sono ground truth per pattern API/architetturali. Es. skills/wuic-crud-api/SKILL.md
    # dice esplicitamente "NON usare AsmxCrudUpdate, usare AsmxProxy". Assenza
    # nell'index RAG -> il chatbot suggerisce endpoint deprecati.
    "KonvergenceCore/skills",
    # WuicTest = progetto showcase con esempi curati dei pattern architetturali
    # (5 pattern in examples/pattern-{1..5}/ + cities-*-page che usano widget WUIC).
    # Tier-2 di priorita' nel re-ranking: esempi pratici copy-paste-friendly per
    # dev consumatori del framework.
    "WuicTest",
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
    "dom_board_sheet",
    "_notifications",
    "scheduler",
    "scheduler_execution"
}

DEFAULT_WINDOW_LINES = 60
DEFAULT_OVERLAP_LINES = 12

# Symbol-level sub-chunking: when a symbol (method/class) is larger than this
# many lines, split it into overlapping sub-windows. This keeps the rerank's
# substring match on `symbol_name` working (each sub-chunk's name still
# contains the original symbol name as a prefix) while preventing one giant
# 600+ line method from drowning the relevant 30-line section in noise.
DEFAULT_MAX_SYMBOL_LINES = 120
DEFAULT_SYMBOL_OVERLAP_LINES = 20


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


def split_large_symbol_range(
    sym_type: str,
    sym_name: str,
    start_line: int,
    end_line: int,
    max_lines: int,
    overlap_lines: int,
) -> List[tuple]:
    """Split an oversized symbol range into overlapping sub-windows.

    Each sub-window keeps the original symbol_type and prefixes its name with
    the original symbol_name so that the rerank's substring match on
    `symbol_name` (`if t in sname`) still fires for sub-chunks. The first
    sub-chunk reuses the bare original name; subsequent ones append `__partN`.
    """
    n = end_line - start_line + 1
    if n <= max_lines or max_lines <= 0:
        return [(sym_type, sym_name, start_line, end_line)]
    step = max(1, max_lines - max(0, overlap_lines))
    out = []
    cursor = start_line
    part = 1
    while cursor <= end_line:
        sub_end = min(end_line, cursor + max_lines - 1)
        if part == 1:
            sub_name = sym_name
        else:
            sub_name = f"{sym_name}__part{part}"
        out.append((sym_type, sub_name, cursor, sub_end))
        if sub_end == end_line:
            break
        cursor += step
        part += 1
    return out


def chunk_file(
    path: Path,
    root_dir: Path,
    window_lines: int,
    overlap_lines: int,
    max_symbol_lines: int = DEFAULT_MAX_SYMBOL_LINES,
    symbol_overlap_lines: int = DEFAULT_SYMBOL_OVERLAP_LINES,
) -> List[Chunk]:
    content = safe_read_text(path)
    lines = content.splitlines()
    if not lines:
        return []

    rel_path = normalize_path(path.relative_to(root_dir))
    language = detect_language(path)
    ranges = symbol_ranges(lines, language)
    if not ranges:
        ranges = sliding_windows(lines, window_lines, overlap_lines)
    else:
        # Sub-split oversized symbol ranges (huge methods, no-method classes).
        expanded = []
        for sym_type, sym_name, sl, el in ranges:
            expanded.extend(
                split_large_symbol_range(
                    sym_type,
                    sym_name,
                    sl,
                    el,
                    max_lines=max_symbol_lines,
                    overlap_lines=symbol_overlap_lines,
                )
            )
        ranges = expanded

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


def is_noise_file(path: Path) -> bool:
    name_lower = path.name.lower()
    if name_lower in EXCLUDE_FILE_NAME_PATTERNS:
        return True
    for suffix in EXCLUDE_FILE_NAME_SUFFIXES:
        if name_lower.endswith(suffix):
            return True
    rel_lower = normalize_path(path).lower()
    for frag in EXCLUDE_PATH_FRAGMENTS:
        if frag in rel_lower:
            return True
    return False


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
            if is_noise_file(path):
                continue
            yield path


def extract_code_chunks(
    root_dir: Path,
    output_jsonl: Path,
    window_lines: int,
    overlap_lines: int,
    max_symbol_lines: int = DEFAULT_MAX_SYMBOL_LINES,
    symbol_overlap_lines: int = DEFAULT_SYMBOL_OVERLAP_LINES,
) -> int:
    all_chunks: List[Chunk] = []
    for path in iter_included_files(root_dir):
        all_chunks.extend(
            chunk_file(
                path,
                root_dir,
                window_lines,
                overlap_lines,
                max_symbol_lines=max_symbol_lines,
                symbol_overlap_lines=symbol_overlap_lines,
            )
        )

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


def sanitize_filename(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", (value or "").strip())[:140] or "chunk"


def write_markdown_chunks_from_jsonl(output_jsonl: Path, output_md_dir: Path) -> int:
    if not output_jsonl.exists():
        return 0

    output_md_dir.mkdir(parents=True, exist_ok=True)
    count = 0

    with output_jsonl.open("r", encoding="utf-8") as f:
        for idx, line in enumerate(f, start=1):
            raw = line.strip()
            if not raw:
                continue
            payload = json.loads(raw)
            chunk = Chunk(**payload)

            fname = f"{idx:06d}_{sanitize_filename(chunk.rel_path)}_{sanitize_filename(chunk.symbol_name)}_{chunk.chunk_id[:10]}.md"
            md_path = output_md_dir / fname
            md_content = (
                f"# {chunk.symbol_name}\n\n"
                f"- chunk_id: `{chunk.chunk_id}`\n"
                f"- source: `{chunk.source}`\n"
                f"- source_type: `{chunk.source_type}`\n"
                f"- language: `{chunk.language}`\n"
                f"- rel_path: `{chunk.rel_path}`\n"
                f"- symbol_type: `{chunk.symbol_type}`\n"
                f"- lines: `{chunk.start_line}-{chunk.end_line}`\n\n"
                f"```{chunk.language if chunk.language else 'text'}\n{chunk.text}\n```\n"
            )
            md_path.write_text(md_content, encoding="utf-8")
            count += 1

    return count


def main():
    parser = argparse.ArgumentParser(description="Extract codebase + DB into chunked JSONL for RAG ingestion.")
    parser.add_argument("--root-dir", default=r"c:/src/Wuic", help="Repository root.")
    parser.add_argument("--output-jsonl", default=r"c:/src/Wuic/codebase_docs/code_chunks.jsonl", help="Output JSONL.")
    parser.add_argument("--window-lines", type=int, default=DEFAULT_WINDOW_LINES, help="Fallback window size in lines.")
    parser.add_argument("--overlap-lines", type=int, default=DEFAULT_OVERLAP_LINES, help="Window overlap in lines.")
    parser.add_argument(
        "--max-symbol-lines",
        type=int,
        default=DEFAULT_MAX_SYMBOL_LINES,
        help="Maximum lines per symbol chunk before sub-splitting (0 disables).",
    )
    parser.add_argument(
        "--symbol-overlap-lines",
        type=int,
        default=DEFAULT_SYMBOL_OVERLAP_LINES,
        help="Overlap lines between sub-windows of an oversized symbol.",
    )
    parser.add_argument("--skip-db", action="store_true", help="Skip DB extraction.")
    parser.add_argument("--skip-md", action="store_true", help="Skip writing markdown chunk files.")
    parser.add_argument("--db-max-rows", type=int, default=80, help="Max sampled rows for focus tables.")
    parser.add_argument(
        "--output-md-dir",
        default=r"c:/src/Wuic/codebase_docs/md_chunks",
        help="Output directory for markdown chunk files.",
    )
    args = parser.parse_args()

    root_dir = Path(args.root_dir)
    output_jsonl = Path(args.output_jsonl)

    output_jsonl.parent.mkdir(parents=True, exist_ok=True)
    if output_jsonl.exists():
        output_jsonl.unlink()

    code_count = extract_code_chunks(
        root_dir,
        output_jsonl,
        args.window_lines,
        args.overlap_lines,
        max_symbol_lines=args.max_symbol_lines,
        symbol_overlap_lines=args.symbol_overlap_lines,
    )
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

    if args.skip_md:
        print("[extract] markdown chunk generation skipped (--skip-md).")
        return

    md_dir = Path(args.output_md_dir)
    md_count = write_markdown_chunks_from_jsonl(output_jsonl, md_dir)
    print(f"[extract] markdown chunks: {md_count}")
    print(f"[extract] markdown output dir: {md_dir}")


if __name__ == "__main__":
    main()
