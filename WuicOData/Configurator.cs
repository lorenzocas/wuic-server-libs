using WuicCore.Server.Api.Infrastructure.Errors;
using WuicCore.Server.Api.Infrastructure.Spatial;
using WuicCore.Server.Api.Models;
using WuicCore.Server.Database;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.OData;
using Microsoft.AspNetCore.OData.Batch;
using Microsoft.AspNetCore.OData.Query.Expressions;
using Microsoft.EntityFrameworkCore;
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
        public static void ConfigureService(IServiceCollection services)
        {
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
                var connectionString = LoadKonvergenceConnectionString("DataSQLConnection");

                if (connectionString == null)
                {
                    throw new InvalidOperationException("No ConnectionString named 'DataSQLConnection' was found in KonvergenceCore/app.config");
                }

                options.UseSqlServer(connectionString, o => o.UseNetTopologySuite()).EnableSensitiveDataLogging();
            });

            services.Configure<ApplicationErrorHandlerOptions>(o =>
            {
                o.IncludeExceptionDetails = true;
            });

            services.AddSingleton<ApplicationErrorHandler>();

            // ── OData ────────────────────────────────────────────────────
            // The EDM model is built with the persisted dynamic assembly (if any).
            // After a Rebuild() + app restart the new types are present from boot.
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

            //services.AddSwaggerGen();
        }

        public static void Configure(IApplicationBuilder app)
        {
            app.UseODataBatching();

            app.UseODataRouteDebug();
        }

        public static string LoadKonvergenceConnectionString(string connectionName)
        {
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
                Path.Combine(Directory.GetCurrentDirectory(), "..", "KonvergenceCore", "app.config"),
                Path.Combine(Directory.GetCurrentDirectory(), "KonvergenceCore", "app.config"),
                Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "KonvergenceCore", "app.config"),
                Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "KonvergenceCore", "app.config")
            };

            return probes
                .Select(Path.GetFullPath)
                .FirstOrDefault(File.Exists);
        }
    }
}
