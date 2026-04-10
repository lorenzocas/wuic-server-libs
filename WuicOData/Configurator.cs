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

                options.UseSqlServer(connectionString, o => o.UseNetTopologySuite()).EnableSensitiveDataLogging();
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
