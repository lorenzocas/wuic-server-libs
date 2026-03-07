using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.Loader;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Scaffolding;
using Microsoft.EntityFrameworkCore.Scaffolding.Internal;
using Microsoft.EntityFrameworkCore.SqlServer.Diagnostics.Internal;
using Microsoft.EntityFrameworkCore.SqlServer.Scaffolding.Internal;
using Microsoft.EntityFrameworkCore.SqlServer.Storage.Internal;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using System.Diagnostics.CodeAnalysis;

namespace RuntimeEfCore
{
    class Program
    {
        static void Main(string[] args)
        {
            //    var connectionString = "data source=localhost\\sqlexpress;integrated security=False;User ID=sa;Password=superlamelauser;Persist Security Info=true;initial catalog=Kiara_Gabel;Encrypt=False";

            //    var scaffolder = CreateMssqlScaffolder();

            //    var dbOpts = new DatabaseModelFactoryOptions();
            //    var modelOpts = new ModelReverseEngineerOptions();
            //    var codeGenOpts = new ModelCodeGenerationOptions()
            //    {
            //        RootNamespace = "TypedDataContext",
            //        ContextName = "DataContext",
            //        ContextNamespace = "TypedDataContext.Context",
            //        ModelNamespace = "TypedDataContext.Models",
            //        SuppressConnectionStringWarning = true
            //    };

            //    var scaffoldedModelSources = scaffolder.ScaffoldModel(connectionString, dbOpts, modelOpts, codeGenOpts);
            //    var sourceFiles = new List<string> { scaffoldedModelSources.ContextFile.Code };
            //    sourceFiles.AddRange(scaffoldedModelSources.AdditionalFiles.Select(f => f.Code));

            //    using var peStream = new MemoryStream();

            //    var enableLazyLoading = false;
            //    var result = GenerateCode(sourceFiles, enableLazyLoading).Emit(peStream);

            //    if (!result.Success)
            //    {
            //        var failures = result.Diagnostics
            //            .Where(diagnostic => diagnostic.IsWarningAsError ||
            //                                 diagnostic.Severity == DiagnosticSeverity.Error);

            //        var error = failures.FirstOrDefault();
            //        throw new Exception($"{error?.Id}: {error?.GetMessage()}");
            //    }

            //    var assemblyLoadContext = new AssemblyLoadContext("DbContext", isCollectible: !enableLazyLoading);

            //    peStream.Seek(0, SeekOrigin.Begin);
            //    var assembly = assemblyLoadContext.LoadFromStream(peStream);

            //    var type = assembly.GetType("TypedDataContext.Context.DataContext");
            //    _ = type ?? throw new Exception("DataContext type not found");

            //    var constr = type.GetConstructor(Type.EmptyTypes);
            //    _ = constr ?? throw new Exception("DataContext ctor not found");

            //    DbContext dynamicContext = (DbContext)constr.Invoke(null);
            //    var entityTypes = dynamicContext.Model.GetEntityTypes();

            //    Console.WriteLine($"Context contains {entityTypes.Count()} types");

            //    foreach (var entityType in dynamicContext.Model.GetEntityTypes())
            //    {
            //        var items = (IQueryable<object>)dynamicContext.Query(entityType.Name);

            //        Console.WriteLine($"Entity type: {entityType.Name} contains {items.Count()} items");
            //    }

            //    Console.ReadKey();

            //    if (!enableLazyLoading)
            //    {
            //        assemblyLoadContext.Unload();
            //    }
            //}


        }

        //public static class DynamicContextExtensions
        //{
        //    public static IQueryable Query(this DbContext context, string entityName) =>
        //        context.Query(entityName, context.Model.FindEntityType(entityName).ClrType);

        //    static readonly MethodInfo SetMethod =
        //        typeof(DbContext).GetMethod(nameof(DbContext.Set), 1, new[] { typeof(string) }) ??
        //        throw new Exception($"Type not found: DbContext.Set");

        //    public static IQueryable Query(this DbContext context, string entityName, Type entityType) =>
        //        (IQueryable)SetMethod.MakeGenericMethod(entityType)?.Invoke(context, new[] { entityName }) ??
        //        throw new Exception($"Type not found: {entityType.FullName}");
        //}
    }
}
