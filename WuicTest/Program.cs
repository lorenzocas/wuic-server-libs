using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using System.Configuration;
using System.Xml.Linq;

internal static class Program
{
    private static void Main(string[] args)
    {
        string hostProjectRoot = ResolveHostProjectRoot();
        string legacyRoot = ResolveLegacyRoot(hostProjectRoot);

        SyncLegacyConfiguration(hostProjectRoot, legacyRoot);

        if (Directory.Exists(legacyRoot))
        {
            Directory.SetCurrentDirectory(legacyRoot);
        }

        CreateHostBuilder(args, hostProjectRoot, legacyRoot).Build().Run();
    }

    private static void SyncLegacyConfiguration(string hostProjectRoot, string legacyRoot)
    {
        string environmentName = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? Environments.Production;

        IConfigurationRoot config = new ConfigurationBuilder()
            .SetBasePath(hostProjectRoot)
            .AddJsonFile("appsettings.json", optional: false)
            .AddJsonFile($"appsettings.{environmentName}.json", optional: true)
            .AddEnvironmentVariables()
            .Build();

        var exeConfig = System.Configuration.ConfigurationManager.OpenExeConfiguration(ConfigurationUserLevel.None);

        ImportLegacyAppConfig(exeConfig, legacyRoot);
        ApplyConfiguredAppSettings(exeConfig, config.GetSection("AppSettings"));

        UpsertConnectionString(exeConfig, "MetaDataSQLConnection", config.GetConnectionString("MetaDataSQLConnection"), "Microsoft.Data.SqlClient");
        UpsertConnectionString(exeConfig, "DataSQLConnection", config.GetConnectionString("DataSQLConnection"), "Microsoft.Data.SqlClient");

        // Legacy defaults expected by metaModelRaw startup path.
        UpsertAppSetting(exeConfig, "dbms", System.Configuration.ConfigurationManager.AppSettings["dbms"] ?? "mssql");
        UpsertAppSetting(exeConfig, "DataDBName", System.Configuration.ConfigurationManager.AppSettings["DataDBName"] ?? "WideWorldImporters");
        string? configuredProjectDataFolder = config["AppSettings:projectDataFolder"];
        if (string.IsNullOrWhiteSpace(configuredProjectDataFolder))
        {
            configuredProjectDataFolder = legacyRoot;
        }
        else if (!Path.IsPathRooted(configuredProjectDataFolder))
        {
            configuredProjectDataFolder = Path.GetFullPath(Path.Combine(hostProjectRoot, configuredProjectDataFolder));
        }

        UpsertAppSetting(exeConfig, "projectDataFolder", configuredProjectDataFolder);

        exeConfig.Save(ConfigurationSaveMode.Modified);
        System.Configuration.ConfigurationManager.RefreshSection("connectionStrings");
        System.Configuration.ConfigurationManager.RefreshSection("appSettings");
    }

    private static void ApplyConfiguredAppSettings(Configuration exeConfig, IConfigurationSection appSettingsSection)
    {
        foreach (IConfigurationSection child in appSettingsSection.GetChildren())
        {
            if (string.IsNullOrWhiteSpace(child.Key))
            {
                continue;
            }

            UpsertAppSetting(exeConfig, child.Key, child.Value ?? string.Empty);
        }
    }

    private static void ImportLegacyAppConfig(Configuration exeConfig, string legacyRoot)
    {
        string legacyConfigPath = Path.Combine(legacyRoot, "app.config");
        if (!File.Exists(legacyConfigPath))
        {
            return;
        }

        XDocument doc = XDocument.Load(legacyConfigPath);

        var appSettings = doc.Root?.Element("appSettings")?.Elements("add") ?? Enumerable.Empty<XElement>();
        foreach (XElement add in appSettings)
        {
            string? key = add.Attribute("key")?.Value;
            if (string.IsNullOrWhiteSpace(key))
            {
                continue;
            }

            string value = add.Attribute("value")?.Value ?? string.Empty;
            UpsertAppSetting(exeConfig, key, value);
        }

        var connStrings = doc.Root?.Element("connectionStrings")?.Elements("add") ?? Enumerable.Empty<XElement>();
        foreach (XElement add in connStrings)
        {
            string? name = add.Attribute("name")?.Value;
            if (string.IsNullOrWhiteSpace(name))
            {
                continue;
            }

            string? conn = add.Attribute("connectionString")?.Value;
            string provider = add.Attribute("providerName")?.Value ?? "Microsoft.Data.SqlClient";
            UpsertConnectionString(exeConfig, name, conn, provider);
        }
    }

    private static void UpsertConnectionString(Configuration config, string name, string? value, string providerName)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return;
        }

        // The release pipeline ships an `appsettings.json` in firstRun mode where every
        // secret-like field is set to a `__SET_<NAME>__` placeholder so the operator can
        // find them via search-and-replace. We must NOT propagate those placeholders into
        // the legacy app.config: SqlConnectionStringBuilder treats the leading underscores
        // as illegal characters in a key name and crashes with
        //   System.ArgumentException: Format of the initialization string does not conform
        //   to specification starting at index 0
        // — which is exactly the symptom seen in the very first IIS deploy of v1.0.5. Skip
        // any value matching the placeholder shape so the legacy connection string entry
        // simply doesn't exist; the firstRun wizard will populate it later via the host's
        // primary configuration source (appsettings.json) once the operator has filled it.
        if (value.StartsWith("__SET_", StringComparison.Ordinal) && value.EndsWith("__", StringComparison.Ordinal))
        {
            return;
        }

        var settings = config.ConnectionStrings.ConnectionStrings[name];
        if (settings == null)
        {
            config.ConnectionStrings.ConnectionStrings.Add(new ConnectionStringSettings(name, value, providerName));
            return;
        }

        settings.ConnectionString = value;
        settings.ProviderName = providerName;
    }

    private static void UpsertAppSetting(Configuration config, string key, string value)
    {
        var appSettings = config.AppSettings.Settings;
        if (appSettings[key] == null)
        {
            appSettings.Add(key, value);
        }
        else
        {
            appSettings[key]!.Value = value;
        }
    }

    private static IHostBuilder CreateHostBuilder(string[] args, string hostProjectRoot, string legacyRoot) =>
        Host.CreateDefaultBuilder(args)            .ConfigureAppConfiguration((hostingContext, config) =>
            {
                config.Sources.Clear();
                config.SetBasePath(hostProjectRoot);
                config.AddJsonFile("appsettings.json", optional: false, reloadOnChange: true);
                config.AddJsonFile($"appsettings.{hostingContext.HostingEnvironment.EnvironmentName}.json", optional: true, reloadOnChange: true);
                config.AddEnvironmentVariables();

                if (args is { Length: > 0 })
                {
                    config.AddCommandLine(args);
                }
            })
            .ConfigureWebHostDefaults(webBuilder =>
            {
                webBuilder.UseStartup<WuicCore.Startup>();
                webBuilder.UseSetting(WebHostDefaults.ApplicationKey, typeof(Program).Assembly.GetName().Name!);

                // Do NOT call UseKestrel() / UseIISIntegration() / UseUrls() here.
                //
                // ConfigureWebHostDefaults already wires both servers conditionally:
                //   - When the process is launched by IIS in in-process mode (web.config:
                //     hostingModel="inprocess"), the ASPNETCORE_IIS_HTTPAUTH / ANCM_HTTP_PORT
                //     env vars are set by ANCM, and ConfigureWebHostDefaults registers the
                //     IIS in-process server (Microsoft.AspNetCore.Server.IIS) — Kestrel is
                //     NOT used at all because requests come straight from w3wp.exe via the
                //     in-process module, not over a TCP socket.
                //   - When the same binary is launched standalone (`dotnet WuicTest.dll`),
                //     ConfigureWebHostDefaults falls back to Kestrel automatically.
                //
                // Calling UseKestrel() explicitly here OVERRODE the IIS in-process server
                // and triggered the in-process startup error:
                //   "Application is running inside IIS process but is not configured to
                //    use IIS server" (System.InvalidOperationException from
                //    Microsoft.AspNetCore.Server.IIS.Core.IISServerSetupFilter).
                // UseUrls("http://0.0.0.0:5000") was also a no-op in in-process mode (the
                // bind comes from the IIS site bindings) and is safe to drop.

                if (Directory.Exists(legacyRoot))
                {
                    webBuilder.UseContentRoot(legacyRoot);
                }
            });

    private static string ResolveLegacyRoot(string hostProjectRoot)
    {
        string? configured = Environment.GetEnvironmentVariable("KONVERGENCECORE_ROOT");

        if (string.IsNullOrWhiteSpace(configured))
        {
            string environmentName = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? Environments.Production;
            var bootstrapConfig = new ConfigurationBuilder()
                .SetBasePath(hostProjectRoot)
                .AddJsonFile("appsettings.json", optional: true)
                .AddJsonFile($"appsettings.{environmentName}.json", optional: true)
                .AddEnvironmentVariables()
                .Build();

            configured = bootstrapConfig["WuicTest:StaticAngularRoot"] ?? bootstrapConfig["NugetHost:StaticAngularRoot"];
        }

        if (!string.IsNullOrWhiteSpace(configured))
        {
            string basePath = Path.IsPathRooted(configured)
                ? configured
                : Path.Combine(hostProjectRoot, configured);

            return Path.GetFullPath(basePath);
        }

        // Dev fallback: sibling KonvergenceCore folder (in-repo dev mode)
        string devCandidate = Path.GetFullPath(Path.Combine(hostProjectRoot, "..", "KonvergenceCore"));
        if (Directory.Exists(devCandidate))
            return devCandidate;

        // Published fallback: hostProjectRoot itself (everything bundled in the publish output)
        return hostProjectRoot;
    }

    private static string ResolveHostProjectRoot()
    {
        string baseDir = AppContext.BaseDirectory;

        // Dev layout: bin/Debug|Release/net10.0/.. .. .. = csproj folder
        string devCandidate = Path.GetFullPath(Path.Combine(baseDir, "..", "..", ".."));
        if (File.Exists(Path.Combine(devCandidate, "WuicTest.csproj")))
            return devCandidate;

        // Published layout: AppContext.BaseDirectory IS the publish output root
        return Path.GetFullPath(baseDir);
    }
}
