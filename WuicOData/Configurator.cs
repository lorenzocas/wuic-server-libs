using WuicCore.Server.Api.Infrastructure.Errors;
using WuicCore.Server.Api.Infrastructure.Spatial;
using WuicCore.Server.Api.Models;
using WuicCore.Server.Database;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.OData;
using Microsoft.AspNetCore.OData.Batch;
using Microsoft.AspNetCore.OData.Query.Expressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Xml.Linq;
using WuicOData.Services;

namespace WuicOData
{
    public static class Configurator
    {
        private const string KonvergenceCoreFolderName = "KonvergenceCore";
        private const string KonvergenceAppConfigFileName = "app.config";

        // Static cache of the host project's IConfiguration. Set once when
        // ConfigureService is invoked at startup. Used by the legacy
        // `LoadKonvergenceConnectionString` static helper so that the
        // EntitiesController's static helpers (TryGetWriteFlagsFromMetadata,
        // TryGetForcedTopFromMetadata, etc.) can resolve connection strings
        // from `appsettings.json:ConnectionStrings.*` without needing
        // dependency injection. Without this, those helpers fall back to
        // the file-system probe for `KonvergenceCore/app.config` which
        // does not exist on a .NET 10 project, returning null and breaking
        // every CUD operation (the controllers see write flags = null and
        // call `Forbid()`).
        private static IConfiguration _cachedConfiguration;

        public static void ConfigureService(IServiceCollection services, IConfiguration configuration = null)
        {
            // Save the host configuration for later static lookups. Tolerant
            // to a null parameter so existing callers (or unit tests) that
            // do not pass IConfiguration still work — they just lose the
            // ConnectionStrings fallback path.
            if (configuration != null)
            {
                _cachedConfiguration = configuration;
            }

            // ── DynamicModelService ──────────────────────────────────────
            // Singleton that holds the Roslyn-compiled entity assembly.
            // It loads any previously persisted DLL immediately so that the
            // OData EDM model built below already includes the dynamic types.
            var dynamicModelService = new DynamicModelService();
            dynamicModelService.LoadPersistedAssembly();
            services.AddSingleton(dynamicModelService);

            // ── EF Core DbContext ────────────────────────────────────────
            // DynamicModelService is injected into DynamicContext so that
            // OnModelCreating can apply configurations from the generated assembly.
            services.AddDbContext<DynamicContext>((sp, options) =>
            {
                // Resolve the data connection string in priority order. The
                // host project (KonvergenceCore on .NET 10) populates
                // IConfiguration via Host.CreateDefaultBuilder which loads
                // appsettings.json + appsettings.<env>.json with the standard
                // ConnectionStrings: section. The legacy app.config probe is
                // kept ONLY as a last-resort fallback for NugetHost / standalone
                // OData scenarios that may run without a full ASP.NET host.
                //
                // History: this lambda used to call LoadKonvergenceConnectionString
                // exclusively, which probed for `KonvergenceCore/app.config` —
                // a .NET Framework legacy file that does NOT exist in a .NET 10
                // project. The result was that every `/odata/<EntitySet>` query
                // failed with "No ConnectionString named 'DataSQLConnection'
                // was found in KonvergenceCore/app.config" even though the
                // string was perfectly readable from `appsettings.json`. The
                // odata--default.mjs docs-driven test surfaced the bug; only
                // `/odata/$metadata` worked because it doesn't open a DbContext.
                var configuration = sp.GetService<IConfiguration>();

                string connectionString = null;

                if (configuration != null)
                {
                    // Standard .NET Core / ASP.NET Core path: ConnectionStrings: section.
                    connectionString = configuration.GetConnectionString("DataSQLConnection");

                    // Legacy WUIC path: some host projects historically stored
                    // the data connection under AppSettings:connection (see
                    // KonvergenceCore/appsettings.json).
                    if (string.IsNullOrWhiteSpace(connectionString))
                    {
                        connectionString = configuration["AppSettings:connection"];
                    }
                }

                // Last resort: legacy KonvergenceCore/app.config probe. Kept
                // for NugetHost scenarios where the OData service is loaded
                // without a normal ASP.NET host providing IConfiguration.
                if (string.IsNullOrWhiteSpace(connectionString))
                {
                    connectionString = LoadKonvergenceConnectionString("DataSQLConnection");
                }

                if (string.IsNullOrWhiteSpace(connectionString))
                {
                    throw new InvalidOperationException(
                        "WuicOData: 'DataSQLConnection' not found. Looked in IConfiguration " +
                        "ConnectionStrings:DataSQLConnection, AppSettings:connection, and the " +
                        "legacy KonvergenceCore/app.config probe paths. Configure one of these " +
                        "in the host project's appsettings.json.");
                }

                // Per-DBMS dispatch (BUG FIX 2026-04-30): WuicOData was hardcoded
                // to UseSqlServer, so on a MySQL host the OData /entity-set queries
                // crashed at request time with "TCP Provider, error: 26 — Error
                // Locating Server/Instance Specified" (the SqlServer provider was
                // resolving the connection string against `localhost\sqlexpress`,
                // its default fallback). The fix keeps WuicOData MSSQL-only at
                // compile time and dispatches MySQL configuration via reflection
                // to `metaModelRaw.MySqlOdataConfigurator` (in the Wuic.MySqlProvider
                // NuGet, loaded at runtime alongside the rest of `mysql.dll`).
                string odataDbms = (configuration?["AppSettings:dbms"] ?? "mssql").Trim().ToLowerInvariant();
                if (odataDbms == "mysql")
                {
                    if (!TryConfigureMySql(options, connectionString))
                    {
                        throw new InvalidOperationException(
                            "WuicOData: AppSettings:dbms='mysql' but `Wuic.MySqlProvider/MySqlOdataConfigurator` is not loadable at runtime. " +
                            "Ensure mysql.dll is deployed alongside the host (the package ships it) and that " +
                            "Pomelo.EntityFrameworkCore.MySql resolves on the runtime path.");
                    }
                }
                else if (odataDbms == "oracle")
                {
                    // Sibling di TryConfigureMySql: instrada il context EF Core
                    // verso `Wuic.OracleProvider/OracleOdataConfigurator` via reflection.
                    if (!TryConfigureOracle(options, connectionString))
                    {
                        throw new InvalidOperationException(
                            "WuicOData: AppSettings:dbms='oracle' but `Wuic.OracleProvider/OracleOdataConfigurator` is not loadable at runtime. " +
                            "Ensure oracle.dll is deployed alongside the host and that " +
                            "Oracle.EntityFrameworkCore + Oracle.ManagedDataAccess.Core resolvono sul runtime path.");
                    }
                }
                else if (odataDbms == "postgresql" || odataDbms == "postgres")
                {
                    if (!TryConfigurePostgres(options, connectionString))
                    {
                        throw new InvalidOperationException(
                            "WuicOData: AppSettings:dbms='postgresql' but `Wuic.PostgresProvider/PostgresOdataConfigurator` is not loadable at runtime. " +
                            "Ensure postgresql.dll is deployed alongside the host and that " +
                            "Npgsql.EntityFrameworkCore.PostgreSQL + Npgsql resolvono sul runtime path.");
                    }
                }
                else
                {
                    options.UseSqlServer(connectionString, o => o.UseNetTopologySuite()).EnableSensitiveDataLogging();
                }
            });

            services.Configure<ApplicationErrorHandlerOptions>(o =>
            {
                o.IncludeExceptionDetails = true;
            });

            services.AddSingleton<ApplicationErrorHandler>();

            // ── OData ────────────────────────────────────────────────────
            services
              .AddControllers()
              .AddOData((opt) =>
              {
                  opt.AddRouteComponents(
                      routePrefix: "odata",
                      model: ApplicationEdmModel.GetEdmModel(dynamicModelService),
                      configureServices: svcs =>
                      {
                          svcs.AddSingleton<ODataBatchHandler>(new DefaultODataBatchHandler());
                          svcs.AddSingleton<IFilterBinder, GeoDistanceFilterBinder>();
                      })
                  .EnableQueryFeatures().Select().Expand().OrderBy().Filter().Count();
              });

        }

        public static void Configure(IApplicationBuilder app)
        {
            app.UseODataBatching();

            app.UseODataRouteDebug();
        }

        public static string LoadKonvergenceConnectionString(string connectionName)
        {
            // 1) Preferred path: read from the host's IConfiguration (cached
            //    at startup by ConfigureService). This is the standard
            //    `appsettings.json:ConnectionStrings.<name>` location used
            //    by every other component in WUIC.
            if (_cachedConfiguration != null)
            {
                var fromConfig = _cachedConfiguration.GetConnectionString(connectionName);
                if (!string.IsNullOrWhiteSpace(fromConfig))
                {
                    return fromConfig;
                }

                // Legacy WUIC location: some host projects historically stored
                // the data connection under AppSettings:connection rather than
                // ConnectionStrings:DataSQLConnection.
                if (string.Equals(connectionName, "DataSQLConnection", StringComparison.OrdinalIgnoreCase))
                {
                    var fromAppSettings = _cachedConfiguration["AppSettings:connection"];
                    if (!string.IsNullOrWhiteSpace(fromAppSettings))
                    {
                        return fromAppSettings;
                    }
                }
            }

            // 2) Fallback: the legacy app.config probe for NugetHost / standalone
            //    OData scenarios where no host has set IConfiguration.
            var configPath = FindKonvergenceAppConfigPath();
            if (string.IsNullOrEmpty(configPath) || !File.Exists(configPath))
                return null;

            var doc = XDocument.Load(configPath);
            var value = doc.Descendants("connectionStrings")
                .Descendants("add")
                .FirstOrDefault(x => string.Equals((string)x.Attribute("name"), connectionName, StringComparison.OrdinalIgnoreCase))
                ?.Attribute("connectionString")?.Value;

            return string.IsNullOrWhiteSpace(value) ? null : value;
        }

        // Reflection-based hook into Wuic.MySqlProvider/MySqlOdataConfigurator.
        // WuicOData itself does NOT reference Pomelo.EntityFrameworkCore.MySql:
        // that dependency lives in `mysql.dll` (Wuic.MySqlProvider NuGet) and is
        // resolved at runtime when the host's dbms is MySQL. This keeps the
        // OData package MSSQL-only at compile time and avoids forcing every
        // consumer (including pure MSSQL hosts) to ship the MySQL provider.
        private const string MySqlConfiguratorTypeName = "metaModelRaw.MySqlOdataConfigurator";
        private const string MySqlConfiguratorMethod = "ConfigureDynamicContextOptions";

        // Sibling per Oracle + Postgres (cross-DBMS parity). Stessa contract:
        // - tipo statico `metaModelRaw.<Provider>OdataConfigurator`
        // - metodo `ConfigureDynamicContextOptions(DbContextOptionsBuilder, string)`
        // - companion DLL specifiche da pre-caricare (transitive deps EF Core).
        private const string OracleConfiguratorTypeName = "metaModelRaw.OracleOdataConfigurator";
        private const string PostgresConfiguratorTypeName = "metaModelRaw.PostgresOdataConfigurator";

        /// <summary>
        /// Expose the cached IConfiguration so EntitiesController can read
        /// AppSettings:dbms without re-bootstrapping configuration.
        /// </summary>
        public static IConfiguration GetCachedConfiguration() => _cachedConfiguration;

        /// <summary>
        /// Reflection-based bridge from EntitiesController (write-flags /
        /// forced-top metadata reads) into the MySQL helper methods that
        /// live in `Wuic.MySqlProvider/MySqlOdataConfigurator`. Mirrors the
        /// pattern of TryConfigureMySql but for arbitrary helpers — pass the
        /// method name and args, get the typed return back. Returns the
        /// default of T if the type/method/invocation fails (mirrors the
        /// fail-safe semantic of the original MSSQL helpers).
        /// </summary>
        public static T InvokeMySqlOdataMethod<T>(string methodName, params object[] args)
        {
            return InvokeProviderOdataMethod<T>(MySqlConfiguratorTypeName, "mysql.dll", methodName, args);
        }

        /// <summary>
        /// Sibling di InvokeMySqlOdataMethod per il provider Oracle. Vedi
        /// commento esteso sopra (TryConfigureOracle/TryConfigureMySql) per
        /// architettura plugin runtime-only.
        /// </summary>
        public static T InvokeOracleOdataMethod<T>(string methodName, params object[] args)
        {
            return InvokeProviderOdataMethod<T>(OracleConfiguratorTypeName, "oracle.dll", methodName, args);
        }

        /// <summary>
        /// Sibling di InvokeMySqlOdataMethod per il provider PostgreSQL.
        /// </summary>
        public static T InvokePostgresOdataMethod<T>(string methodName, params object[] args)
        {
            return InvokeProviderOdataMethod<T>(PostgresConfiguratorTypeName, "postgresql.dll", methodName, args);
        }

        /// <summary>
        /// Generic helper: trova un tipo statico in qualsiasi assembly caricato
        /// o nel filesystem (probe in <c>AppContext.BaseDirectory</c> + <c>bin/</c>),
        /// invoca un metodo statico, ritorna il risultato cast a T (default in
        /// caso di qualsiasi fallimento — semantica fail-safe identica al pattern
        /// MSSQL originale).
        /// </summary>
        private static T InvokeProviderOdataMethod<T>(string typeName, string dllName, string methodName, object[] args)
        {
            try
            {
                Type t = null;
                foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
                {
                    t = asm.GetType(typeName, throwOnError: false, ignoreCase: false);
                    if (t != null) break;
                }
                if (t == null)
                {
                    string[] probes = {
                        Path.Combine(AppContext.BaseDirectory, dllName),
                        Path.Combine(AppContext.BaseDirectory, "bin", dllName)
                    };
                    foreach (var probe in probes)
                    {
                        if (!File.Exists(probe)) continue;
                        var loaded = Assembly.LoadFrom(probe);
                        t = loaded.GetType(typeName, throwOnError: false, ignoreCase: false);
                        if (t != null) break;
                    }
                }
                if (t == null) return default;
                var method = t.GetMethod(methodName, BindingFlags.Public | BindingFlags.Static);
                if (method == null) return default;
                var result = method.Invoke(null, args);
                return result == null ? default : (T)result;
            }
            catch
            {
                return default;
            }
        }

        private static bool TryConfigureMySql(DbContextOptionsBuilder options, string connectionString)
        {
            try
            {
                // Pre-load delle dipendenze TRANSITIVE del provider mysql
                // (2026-05-12). Senza questo, quando `MySqlOdataConfigurator.ConfigureDynamicContextOptions`
                // viene invocato via reflection e internamente chiama `UseMySql(...)`
                // (extension method di Pomelo.EntityFrameworkCore.MySql), il .NET
                // runtime tenta di risolvere `Pomelo.EntityFrameworkCore.MySql.dll`
                // dal directory probe path del CALLER (WuicOData), ma `Assembly.LoadFrom`
                // su mysql.dll NON propaga la probing path per le dipendenze
                // transitive — classico problema di plugin loading. Risultato:
                // `FileNotFoundException: Pomelo.EntityFrameworkCore.MySql, Version=8.0.2.0`
                // anche se la DLL Pomelo e' fisicamente accanto a WuicCore.dll.
                //
                // Fix: pre-caricare ESPLICITAMENTE le DLL EFCore-Pomelo dal bin
                // di WuicCore prima di tentare l'invoke del configurator. Una
                // volta caricate via Assembly.LoadFrom, sono visibili al loader
                // e la risoluzione tipi/extension methods funziona.
                //
                // Gated SOLO al provider mysql (questo metodo gira solo quando
                // AppSettings:dbms=mysql, vedi line 127 di questo file). Niente
                // overhead per mssql.
                string[] companionDlls = new[]
                {
                    "Pomelo.EntityFrameworkCore.MySql.dll",
                    "MySqlConnector.dll",
                    "MySql.Data.dll"
                };
                string[] companionProbeDirs = new[]
                {
                    AppContext.BaseDirectory,
                    Path.Combine(AppContext.BaseDirectory, "bin")
                };
                foreach (var dll in companionDlls)
                {
                    foreach (var dir in companionProbeDirs)
                    {
                        string p = Path.Combine(dir, dll);
                        if (!File.Exists(p)) continue;
                        try { System.Reflection.Assembly.LoadFrom(p); } catch { /* non bloccante */ }
                        break; // companion trovato, salta agli altri probe dir
                    }
                }

                Type t = null;
                foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
                {
                    t = asm.GetType(MySqlConfiguratorTypeName, throwOnError: false, ignoreCase: false);
                    if (t != null) break;
                }
                if (t == null)
                {
                    // Force-load mysql.dll if it is on disk but hasn't been
                    // triggered yet. Probe both the host root (where the .NET
                    // SDK puts package DLLs by default) and the `bin/` subdir
                    // (where the WUIC linux installer drops obfuscated runtime
                    // assemblies — see scripts/linux/50-publish-app.sh).
                    string[] probes = {
                        Path.Combine(AppContext.BaseDirectory, "mysql.dll"),
                        Path.Combine(AppContext.BaseDirectory, "bin", "mysql.dll")
                    };
                    foreach (var probe in probes)
                    {
                        if (!File.Exists(probe)) continue;
                        var loaded = System.Reflection.Assembly.LoadFrom(probe);
                        t = loaded.GetType(MySqlConfiguratorTypeName, throwOnError: false, ignoreCase: false);
                        if (t != null) break;
                    }
                }
                if (t == null) return false;
                var method = t.GetMethod(MySqlConfiguratorMethod, BindingFlags.Public | BindingFlags.Static);
                if (method == null) return false;
                method.Invoke(null, new object[] { options, connectionString });
                return true;
            }
            catch (Exception ex)
            {
                // Surface the real reason (Pomelo missing, version mismatch,
                // bad connection string, etc.) instead of silently falling back
                // to MSSQL — the fallback would crash later with the same
                // "TCP Provider, error: 26" that prompted this whole branch.
                string csKeys = "";
                try
                {
                    csKeys = string.Join(",", (connectionString ?? "").Split(';').Where(p => p.Contains("=")).Select(p => p.Split('=')[0].Trim()));
                }
                catch
                {
                    // csKeys è solo diagnostica best-effort: un errore nel parsing
                    // della connection string non deve mascherare l'eccezione originale.
                }
                throw new InvalidOperationException("TryConfigureMySql failed: " + ex.GetType().FullName + ": " + ex.Message + (ex.InnerException != null ? " | inner: " + ex.InnerException.GetType().FullName + ": " + ex.InnerException.Message : "") + " | csKeys=[" + csKeys + "]", ex);
            }
        }

        /// <summary>
        /// Sibling di TryConfigureMySql per il provider Oracle.
        /// Pre-carica le dipendenze EF Core transitive (Oracle.EntityFrameworkCore,
        /// Oracle.ManagedDataAccess) dal bin di WuicCore prima dell'invoke
        /// (stesso problema di plugin loading documentato in TryConfigureMySql).
        /// </summary>
        private static bool TryConfigureOracle(DbContextOptionsBuilder options, string connectionString)
        {
            try
            {
                string[] companionDlls = new[]
                {
                    "Oracle.EntityFrameworkCore.dll",
                    "Oracle.ManagedDataAccess.dll"
                };
                PreloadCompanionDlls(companionDlls);

                Type t = ResolveProviderType(OracleConfiguratorTypeName, "oracle.dll");
                if (t == null) return false;
                var method = t.GetMethod(MySqlConfiguratorMethod /* ConfigureDynamicContextOptions */, BindingFlags.Public | BindingFlags.Static);
                if (method == null) return false;
                method.Invoke(null, new object[] { options, connectionString });
                return true;
            }
            catch (Exception ex)
            {
                string csKeys = SafeConnectionStringKeys(connectionString);
                throw new InvalidOperationException("TryConfigureOracle failed: " + ex.GetType().FullName + ": " + ex.Message + (ex.InnerException != null ? " | inner: " + ex.InnerException.GetType().FullName + ": " + ex.InnerException.Message : "") + " | csKeys=[" + csKeys + "]", ex);
            }
        }

        /// <summary>
        /// Sibling di TryConfigureMySql per il provider PostgreSQL.
        /// </summary>
        private static bool TryConfigurePostgres(DbContextOptionsBuilder options, string connectionString)
        {
            try
            {
                string[] companionDlls = new[]
                {
                    "Npgsql.EntityFrameworkCore.PostgreSQL.dll",
                    "Npgsql.dll"
                };
                PreloadCompanionDlls(companionDlls);

                Type t = ResolveProviderType(PostgresConfiguratorTypeName, "postgresql.dll");
                if (t == null) return false;
                var method = t.GetMethod(MySqlConfiguratorMethod /* ConfigureDynamicContextOptions */, BindingFlags.Public | BindingFlags.Static);
                if (method == null) return false;
                method.Invoke(null, new object[] { options, connectionString });
                return true;
            }
            catch (Exception ex)
            {
                string csKeys = SafeConnectionStringKeys(connectionString);
                throw new InvalidOperationException("TryConfigurePostgres failed: " + ex.GetType().FullName + ": " + ex.Message + (ex.InnerException != null ? " | inner: " + ex.InnerException.GetType().FullName + ": " + ex.InnerException.Message : "") + " | csKeys=[" + csKeys + "]", ex);
            }
        }

        private static void PreloadCompanionDlls(string[] companionDlls)
        {
            string[] companionProbeDirs = new[]
            {
                AppContext.BaseDirectory,
                Path.Combine(AppContext.BaseDirectory, "bin")
            };
            foreach (var dll in companionDlls)
            {
                foreach (var dir in companionProbeDirs)
                {
                    string p = Path.Combine(dir, dll);
                    if (!File.Exists(p)) continue;
                    try { System.Reflection.Assembly.LoadFrom(p); } catch { /* non bloccante */ }
                    break;
                }
            }
        }

        private static Type ResolveProviderType(string typeName, string dllName)
        {
            Type t = null;
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                t = asm.GetType(typeName, throwOnError: false, ignoreCase: false);
                if (t != null) break;
            }
            if (t == null)
            {
                string[] probes = {
                    Path.Combine(AppContext.BaseDirectory, dllName),
                    Path.Combine(AppContext.BaseDirectory, "bin", dllName)
                };
                foreach (var probe in probes)
                {
                    if (!File.Exists(probe)) continue;
                    var loaded = System.Reflection.Assembly.LoadFrom(probe);
                    t = loaded.GetType(typeName, throwOnError: false, ignoreCase: false);
                    if (t != null) break;
                }
            }
            return t;
        }

        private static string SafeConnectionStringKeys(string connectionString)
        {
            try
            {
                return string.Join(",", (connectionString ?? "").Split(';').Where(p => p.Contains("=")).Select(p => p.Split('=')[0].Trim()));
            }
            catch { return ""; }
        }

        private static string FindKonvergenceAppConfigPath()
        {
            var probes = new[]
            {
                Path.Combine(Directory.GetCurrentDirectory(), "..", KonvergenceCoreFolderName, KonvergenceAppConfigFileName),
                Path.Combine(Directory.GetCurrentDirectory(), KonvergenceCoreFolderName, KonvergenceAppConfigFileName),
                Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", KonvergenceCoreFolderName, KonvergenceAppConfigFileName),
                Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", KonvergenceCoreFolderName, KonvergenceAppConfigFileName)
            };

            return probes
                .Select(Path.GetFullPath)
                .FirstOrDefault(File.Exists);
        }
    }
}
