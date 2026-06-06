namespace WuicRagEngine;

/// <summary>Risultato di retrieval, allineato al contratto server /api/rag/query.</summary>
public sealed record RagHit(
    int Rank,
    string ChunkId,
    string RelPath,
    string SymbolName,
    string SymbolType,
    int StartLine,
    int EndLine,
    double ScoreVector,
    double ScoreBm25,
    string Snippet);
