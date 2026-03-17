using CrmApp.Realtime;
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
        string configuredProjectDataFolder = config["AppSettings:projectDataFolder"];
        if (string.IsNullOrWhiteSpace(configuredProjectDataFolder))
        {
            configuredProjectDataFolder = legacyRoot;
        }
        else if (!Path.IsPathRooted(configuredProjectDataFolder))
        {
            configuredProjectDataFolder = Path.GetFullPath(Path.Combine(hostProjectRoot, configuredProjectDataFolder));
        }

        UpsertAppSetting(exeConfig, "projectDataFolder", configuredProjectDataFolder);
        UpsertAppSetting(exeConfig, "projectAssemblyName", Path.Combine(legacyRoot, "bin", "Debug", "net10.0", "KonvergenceCore.dll"));

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
        Host.CreateDefaultBuilder(args)
            .ConfigureServices((_, services) =>
            {
                services.AddSingleton<ICrmNotificationRepository, CrmNotificationRepository>();
                services.AddSingleton<ICrmNotificationPushService, CrmNotificationPushService>();
                services.AddHostedService<CrmNotificationSqlDependencyWatcher>();
                services.AddSingleton<IStartupFilter, CrmNotificationStartupFilter>();
            })
            .ConfigureAppConfiguration((hostingContext, config) =>
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
                webBuilder.UseIISIntegration();
                webBuilder.UseKestrel();
                webBuilder.UseUrls("http://0.0.0.0:5000");

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

            configured = bootstrapConfig["CrmApp:StaticAngularRoot"] ?? bootstrapConfig["NugetHost:StaticAngularRoot"];
        }

        if (!string.IsNullOrWhiteSpace(configured))
        {
            string basePath = Path.IsPathRooted(configured)
                ? configured
                : Path.Combine(hostProjectRoot, configured);

            return Path.GetFullPath(basePath);
        }

        return Path.GetFullPath(Path.Combine(hostProjectRoot, "..", "KonvergenceCore"));
    }

    private static string ResolveHostProjectRoot()
    {
        return Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", ".."));
    }
}

