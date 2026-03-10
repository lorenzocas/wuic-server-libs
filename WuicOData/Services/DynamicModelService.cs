using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.Loader;
using System.Threading;
using WuicCore.Server.Database;
using WuicOData.DTOs;

namespace WuicOData.Services
{
    /// <summary>
    /// Singleton service that owns the Roslyn-compiled assembly produced from
    /// the metadata tables.  It provides:
    ///   • CurrentAssembly  — used at runtime by DynamicContext (EF Core)
    ///                        and ApplicationEdmModel (OData) without restart.
    ///   • Rebuild()        — compiles a fresh assembly from metadata DTOs,
    ///                        saves the DLL to disk so the next startup picks
    ///                        it up for OData route registration, and
    ///                        invalidates the EF Core model cache.
    /// </summary>
    public class DynamicModelService
    {
        private Assembly _currentAssembly;
        private AssemblyLoadContext _assemblyLoadContext;

        /// <summary>File name of the persisted DLL (placed beside the app exe).</summary>
        private static readonly string DllPath =
            Path.Combine(AppContext.BaseDirectory, "WuicDynamicModels.dll");

        public Assembly CurrentAssembly => _currentAssembly;


        public void LoadPersistedAssembly()
        {
            if (!File.Exists(DllPath)) return;

            try
            {
                var bytes = File.ReadAllBytes(DllPath);
                var alc = new AssemblyLoadContext($"WuicDynamicModels_{DateTime.UtcNow.Ticks}", isCollectible: true);
                var assembly = alc.LoadFromStream(new MemoryStream(bytes));
                SwapAssembly(assembly, alc);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[DynamicModelService] Could not load {DllPath}: {ex.Message}");
            }
        }

        // ── Runtime rebuild ──────────────────────────────────────────────

        /// <summary>
        /// Compiles new entity classes from <paramref name="entities"/>, replaces
        /// the in-memory assembly, persists the DLL to disk, and invalidates the
        /// EF Core model cache so the next request rebuilds it.
        /// </summary>
        public (int Count, IReadOnlyList<string> Errors) Rebuild(IEnumerable<ODataEntityInfo> entities)
        {
            var entityList = entities.ToList();
            var errors = new List<string>();

            if (entityList.Count == 0)
                return (0, errors);

            try
            {
                var (bytes, assembly) = MetadataModelGenerator.CompileModels(entityList);

                PersistAssemblyBytes(bytes);

                // Swap in-memory assembly
                _currentAssembly = assembly;

                // Invalidate EF Core model cache — DynamicContext will rebuild
                // OnModelCreating on the next request
                DynamicContext.SetContextVersion(Guid.NewGuid().ToString());
            }
            catch (InvalidOperationException ex)
            {
                errors.Add(ex.Message);
            }
            catch (IOException ex)
            {
                errors.Add($"Unable to persist dynamic model DLL '{DllPath}': {ex.Message}");
            }
            catch (UnauthorizedAccessException ex)
            {
                errors.Add($"Access denied while persisting dynamic model DLL '{DllPath}': {ex.Message}");
            }
            catch (Exception ex)
            {
                errors.Add($"Unexpected error rebuilding dynamic model: {ex.Message}");
            }

            return (entityList.Count, errors);
        }

        private void SwapAssembly(Assembly assembly, AssemblyLoadContext newContext)
        {
            var oldContext = _assemblyLoadContext;
            _currentAssembly = assembly;
            _assemblyLoadContext = newContext;

            if (oldContext != null)
            {
                try
                {
                    oldContext.Unload();
                }
                catch
                {
                    // Best effort: failing to unload old collectible contexts is non-fatal.
                }
            }
        }

        private static void PersistAssemblyBytes(byte[] bytes)
        {
            var directory = Path.GetDirectoryName(DllPath);
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }

            var tempPath = DllPath + ".tmp";
            const int maxAttempts = 5;
            var written = false;

            for (var attempt = 1; attempt <= maxAttempts; attempt++)
            {
                try
                {
                    File.WriteAllBytes(tempPath, bytes);
                    File.Copy(tempPath, DllPath, overwrite: true);
                    written = true;
                    break;
                }
                catch (IOException) when (attempt < maxAttempts)
                {
                    Thread.Sleep(120 * attempt);
                }
                finally
                {
                    try
                    {
                        if (File.Exists(tempPath))
                            File.Delete(tempPath);
                    }
                    catch
                    {
                        // Best effort cleanup of temporary file between retries.
                    }
                }
            }

            if (written)
                return;

            throw new IOException($"Could not write '{DllPath}' because it is locked by another process.");
        }
    }
}
