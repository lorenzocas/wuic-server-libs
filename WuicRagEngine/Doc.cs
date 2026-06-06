using System.Text.Json;

namespace WuicRagEngine;

/// <summary>Chunk del corpus (riga di metadata.jsonl). L'ordine nel file == ordine di vectors.npy.</summary>
public sealed class Doc
{
    public string Text = "";
    public string RelPath = "";
    public string SymbolName = "";
    public string SymbolType = "";
    public string ChunkId = "";
    public string Source = "";
    public string SourceType = "";
    public int StartLine, EndLine;

    public static List<Doc> LoadAll(string metadataJsonl)
    {
        var docs = new List<Doc>(9000);
        foreach (var line in File.ReadLines(metadataJsonl))
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            using var d = JsonDocument.Parse(line);
            var r = d.RootElement;
            docs.Add(new Doc
            {
                Text = Str(r, "text"),
                RelPath = Str(r, "rel_path"),
                SymbolName = Str(r, "symbol_name"),
                SymbolType = Str(r, "symbol_type"),
                ChunkId = Str(r, "chunk_id"),
                Source = Str(r, "source"),
                SourceType = Str(r, "source_type"),
                StartLine = Int(r, "start_line"),
                EndLine = Int(r, "end_line"),
            });
        }
        return docs;
    }

    private static string Str(JsonElement e, string k) =>
        e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString()! : "";
    private static int Int(JsonElement e, string k) =>
        e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetInt32() : 0;
}
