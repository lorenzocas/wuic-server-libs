using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;

namespace WuicRagEngine;

/// <summary>Builder di InferenceSession con selezione device (GPU CUDA / CPU).
/// device: "auto" (prova CUDA, fallback CPU), "cuda" (forza CUDA, fallback CPU con warn),
/// "cpu" (solo CPU). Espone il provider effettivamente attivo per diagnostica.</summary>
public static class OnnxSession
{
    /// <summary>Ultimo provider effettivamente attivato ("CUDA" | "CPU"). Per /health.</summary>
    public static string LastProvider { get; private set; } = "CPU";

    private static bool s_cudaPathApplied;
    /// <summary>Se l'env WUIC_RAG_CUDA_PATH e' impostata (dir delle CUDA/cuDNN runtime DLL,
    /// es. cublasLt64_12.dll, cudnn64_9.dll), la antepone al PATH del processo prima di
    /// tentare il provider CUDA. Permette di usare la GPU senza installare CUDA system-wide
    /// (in dev: torch/lib; in deploy: bin della CUDA del cliente). Idempotente.</summary>
    private static void EnsureCudaPath()
    {
        if (s_cudaPathApplied) return;
        s_cudaPathApplied = true;
        var p = Environment.GetEnvironmentVariable("WUIC_RAG_CUDA_PATH");
        if (string.IsNullOrWhiteSpace(p)) return;
        var cur = Environment.GetEnvironmentVariable("PATH") ?? "";
        Environment.SetEnvironmentVariable("PATH", p.Trim() + ";" + cur);
        Console.WriteLine($"[OnnxSession] WUIC_RAG_CUDA_PATH -> PATH: {p.Trim()}");
    }

    public static InferenceSession Build(string onnxPath, string device)
    {
        string dev = (device ?? "auto").Trim().ToLowerInvariant();
        if (dev == "cpu")
        {
            LastProvider = "CPU";
            return new InferenceSession(onnxPath);
        }
        EnsureCudaPath();
        // auto | cuda: prova CUDA, fallback CPU.
        try
        {
            var opts = new SessionOptions();
            // VRAM-friendly: arena alloca solo quanto richiesto (evita over-grab del
            // default kNextPowerOfTwo) + limite opzionale via WUIC_RAG_GPU_MEM_LIMIT (bytes).
            var cudaProps = new Dictionary<string, string> { ["arena_extend_strategy"] = "kSameAsRequested" };
            var memLimit = Environment.GetEnvironmentVariable("WUIC_RAG_GPU_MEM_LIMIT");
            if (!string.IsNullOrWhiteSpace(memLimit)) cudaProps["gpu_mem_limit"] = memLimit.Trim();
            using var cudaOpts = new OrtCUDAProviderOptions();
            cudaOpts.UpdateOptions(cudaProps);
            opts.AppendExecutionProvider_CUDA(cudaOpts);
            var s = new InferenceSession(onnxPath, opts);
            LastProvider = "CUDA";
            return s;
        }
        catch (Exception ex)
        {
            // CUDA non disponibile (driver/cuDNN assenti, no GPU): fallback CPU.
            Console.WriteLine($"[OnnxSession] CUDA non disponibile ({ex.GetType().Name}: {ex.Message}) -> fallback CPU"
                + (dev == "cuda" ? " (device='cuda' richiesto ma non attivabile)" : ""));
            LastProvider = "CPU";
            return new InferenceSession(onnxPath);
        }
    }
}

/// <summary>Embedder bge-m3 (CLS pooling bakeato nel grafo ONNX). Ritorna l'embedding
/// 1024-dim NORMALIZZATO L2 (come normalize_vectors lato Python).</summary>
public sealed class OnnxEmbedder : IDisposable
{
    private readonly InferenceSession _s;
    public OnnxEmbedder(string onnxPath, string device = "auto") => _s = OnnxSession.Build(onnxPath, device);

    public float[] Encode(int[] ids)
    {
        int n = ids.Length;
        var idsT = new DenseTensor<long>(new[] { 1, n });
        var maskT = new DenseTensor<long>(new[] { 1, n });
        for (int i = 0; i < n; i++) { idsT[0, i] = ids[i]; maskT[0, i] = 1; }
        var inputs = new List<NamedOnnxValue>
        {
            NamedOnnxValue.CreateFromTensor("input_ids", idsT),
            NamedOnnxValue.CreateFromTensor("attention_mask", maskT),
        };
        using var res = _s.Run(inputs);
        var outT = res[0].AsTensor<float>();
        var v = new float[1024];
        double norm = 0;
        for (int i = 0; i < 1024; i++) { v[i] = outT[0, i]; norm += (double)v[i] * v[i]; }
        norm = Math.Sqrt(norm);
        if (norm < 1e-12) norm = 1.0;
        for (int i = 0; i < 1024; i++) v[i] = (float)(v[i] / norm);
        return v;
    }

    public void Dispose() => _s.Dispose();
}

/// <summary>Cross-encoder bge-reranker-v2-m3 + LoRA v4 merged. Ritorna 1 logit per coppia.</summary>
public sealed class OnnxReranker : IDisposable
{
    private readonly InferenceSession _s;
    public OnnxReranker(string onnxPath, string device = "auto") => _s = OnnxSession.Build(onnxPath, device);

    public float Score(int[] ids)
    {
        int n = ids.Length;
        var idsT = new DenseTensor<long>(new[] { 1, n });
        var maskT = new DenseTensor<long>(new[] { 1, n });
        for (int i = 0; i < n; i++) { idsT[0, i] = ids[i]; maskT[0, i] = 1; }
        var inputs = new List<NamedOnnxValue>
        {
            NamedOnnxValue.CreateFromTensor("input_ids", idsT),
            NamedOnnxValue.CreateFromTensor("attention_mask", maskT),
        };
        using var res = _s.Run(inputs);
        var outT = res[0].AsTensor<float>();
        return outT.GetValue(0);
    }

    public void Dispose() => _s.Dispose();
}
