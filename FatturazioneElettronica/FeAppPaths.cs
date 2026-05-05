namespace FatturazioneElettronica;

/// <summary>
/// Helper unico per risolvere i path della FE app.
///
/// **Perche' esiste**: la FE app condivide `IWebHostEnvironment.ContentRootPath`
/// con KonvergenceCore (vedi `Program.CreateHostBuilder` -> `UseContentRoot(legacyRoot)`)
/// per riusare la `wwwroot/` del framework (lib Angular, designer, asset
/// condivisi). Quindi `_env.ContentRootPath` NON e' utile per file
/// FE-specific: punta a KC.
///
/// Per output FE-specific (XML SDI, dump per debug, log applicativi
/// app-specific, ecc.) usare `FeAppPaths.HostProjectRoot` che ritorna
/// il path del `.csproj` della FE app risalendo da `AppContext.BaseDirectory`
/// (= `bin/Debug|Release/net10.0/`).
///
/// Sito di chiamata canonico:
///   - `Program.Main` (bootstrap)
///   - `Controllers/SdiController.GenerateXml` (output XML)
/// </summary>
public static class FeAppPaths
{
    /// <summary>
    /// Path radice del csproj della FE app (NON KonvergenceCore).
    /// Robusto sia in dev (bin/Debug/net10.0/) sia in published (output dir).
    /// </summary>
    public static string HostProjectRoot
    {
        get
        {
            string baseDir = AppContext.BaseDirectory;

            // Dev layout: bin/Debug|Release/net10.0/.. .. .. = csproj folder
            string devCandidate = Path.GetFullPath(Path.Combine(baseDir, "..", "..", ".."));
            if (File.Exists(Path.Combine(devCandidate, "FatturazioneElettronica.csproj")))
                return devCandidate;

            // Published layout: AppContext.BaseDirectory IS the publish output root
            return Path.GetFullPath(baseDir);
        }
    }
}
