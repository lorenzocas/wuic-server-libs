using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.Loader;
using System.Text;
using WuicOData.DTOs;

namespace WuicOData.Services
{
    /// <summary>
    /// Generates EF Core entity classes from ODataEntityInfo metadata and
    /// compiles them in-memory with Roslyn.
    /// </summary>
    public static class MetadataModelGenerator
    {
        /// <summary>
        /// Namespace injected into generated classes — must match what
        /// ApplicationEdmModel.GetEdmModel() scans.
        /// </summary>
        public const string TargetNamespace = "WuicCore.Server.Database.Models";
        private const string CSharpStringType = "string";

        // ── Code generation ──────────────────────────────────────────────

        public static string GenerateEntitySource(ODataEntityInfo entity)
        {
            var sb = new StringBuilder();
            var cls = entity.ClassName;
            var pkCols = entity.Columns.Where(c => c.IsPrimaryKey).ToList();

            sb.AppendLine("#nullable disable");
            sb.AppendLine("using System;");
            sb.AppendLine("using System.Collections.Generic;");
            sb.AppendLine("using System.ComponentModel.DataAnnotations;");
            sb.AppendLine("using WuicCore.Interfaces;");

            sb.AppendLine("using Microsoft.EntityFrameworkCore;");


            sb.AppendLine("using Microsoft.EntityFrameworkCore.Metadata.Builders;");
            sb.AppendLine("using Microsoft.OData.ModelBuilder;");

            sb.AppendLine();
            sb.AppendLine($"namespace {TargetNamespace};");
            sb.AppendLine();
            sb.AppendLine($"public partial class {cls} : GenericConfiguration<{cls}>");
            sb.AppendLine("{");

            // Properties
            foreach (var col in entity.Columns)
            {
                if (col.DbType != "point")
                {
                    var csType = MapDbTypeToCSharp(col.DbType);
                    var nullable = col.IsNullable && IsValueType(csType) && !col.IsPrimaryKey ? "?" : "";
                    if (pkCols.Count == 1 && col.IsPrimaryKey)
                        sb.AppendLine("    [Key]");
                    sb.AppendLine($"    public {csType}{nullable} {ToPascalCase(col.ColumnName)} {{ get; set; }}");
                }
            }

            sb.AppendLine();
            sb.AppendLine($"    public override void SpecialConfigure(EntityTypeBuilder<{cls}> entity)");
            sb.AppendLine("    {");

            // PK
            if (pkCols.Count == 1)
                sb.AppendLine($"        entity.HasKey(e => e.{ToPascalCase(pkCols[0].ColumnName)});");
            else if (pkCols.Count > 1)
                sb.AppendLine($"        entity.HasKey(e => new {{ {string.Join(", ", pkCols.Select(c => $"e.{ToPascalCase(c.ColumnName)}"))} }});");
            else
                sb.AppendLine("        entity.HasNoKey();");

            // Table mapping
            if (!string.IsNullOrWhiteSpace(entity.SchemaName))
                sb.AppendLine($"        entity.ToTable(\"{entity.TableName}\", \"{entity.SchemaName}\");");
            else
                sb.AppendLine($"        entity.ToTable(\"{entity.TableName}\");");

            // Per-column fluent configuration
            foreach (var col in entity.Columns)
            {
                if (col.DbType == "point")
                    continue; // Skip unsupported types like "point" that can't be represented as properties

                var propName = ToPascalCase(col.ColumnName);
                var configs = new List<string>();

                if (col.MaxLength.HasValue && MapDbTypeToCSharp(col.DbType) == CSharpStringType && col.MaxLength.Value > 0)
                    configs.Add($".HasMaxLength({col.MaxLength.Value})");

                if (!col.IsNullable && MapDbTypeToCSharp(col.DbType) == CSharpStringType)
                    configs.Add(".IsRequired()");

                if (col.IsComputed)
                    configs.Add(".ValueGeneratedOnAddOrUpdate()");

                // Emit HasColumnName only when the DB name differs from the property name
                if (col.ColumnName != propName)
                    configs.Add($".HasColumnName(\"{col.ColumnName}\")");

                if (col.IsPrimaryKey)
                {
                    if (entity.PKeytype == "IDENTITY")
                    {
                        configs.Add(".ValueGeneratedOnAdd()");
                    }
                    else if (entity.PKeytype == "GUID")
                    {
                        configs.Add(".HasDefaultValueSql(\"NEWID()\")");
                    }
                }

                sb.AppendLine($"        entity.Property(e => e.{propName}){string.Join("", configs)};");
            }

            sb.AppendLine("    }");
            sb.AppendLine("}");

            string c = sb.ToString();

            return c;
        }

        // ── Roslyn compilation ───────────────────────────────────────────

        /// <summary>
        /// Compiles all entities into a single in-memory assembly.
        /// Returns (raw IL bytes, loaded Assembly).
        /// </summary>
        public static (byte[] Bytes, Assembly Assembly) CompileModels(IEnumerable<ODataEntityInfo> entities)
        {
            var syntaxTrees = entities
                .Select(e => CSharpSyntaxTree.ParseText(GenerateEntitySource(e)))
                .ToList();

            var compilation = CSharpCompilation.Create(
                "WuicDynamicModels_" + DateTime.UtcNow.Ticks,
                syntaxTrees,
                GetCompilationReferences(),
                new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));

            using var ms = new MemoryStream();
            var result = compilation.Emit(ms);

            if (!result.Success)
            {
                var errors = result.Diagnostics
                    .Where(d => d.Severity == DiagnosticSeverity.Error)
                    .Select(d => d.GetMessage());
                throw new InvalidOperationException(
                    $"Dynamic model compilation failed:\n{string.Join("\n", errors)}");
            }

            var bytes = ms.ToArray();
            var assembly = new AssemblyLoadContext(null, isCollectible: true)
                .LoadFromStream(new MemoryStream(bytes));

            return (bytes, assembly);
        }


        /// <summary>
        /// Saves one .cs file per entity to <paramref name="outputDirectory"/>.
        /// Old *.Generated.cs files in that directory are removed first.
        /// </summary>
        public static void SaveSources(IEnumerable<ODataEntityInfo> entities, string outputDirectory)
        {
            Directory.CreateDirectory(outputDirectory);

            foreach (var f in Directory.GetFiles(outputDirectory, "*.Generated.cs"))
                File.Delete(f);

            foreach (var entity in entities)
            {
                var src = GenerateEntitySource(entity);
                File.WriteAllText(
                    Path.Combine(outputDirectory, $"{entity.ClassName}.Generated.cs"),
                    src);
            }
        }

        // ── Type mapping ─────────────────────────────────────────────────

        public static string MapDbTypeToCSharp(string dbType) =>
            dbType?.ToLowerInvariant().Trim() switch
            {
                "int" or "integer" or "int32" => "int",
                "bigint" or "int64" => "long",
                "smallint" or "int16" => "short",
                "tinyint" => "byte",
                "bit" or "bool" or "boolean" => "bool",
                "float" or "double" => "double",
                "real" => "float",
                "decimal" or "numeric"
                    or "money" or "smallmoney" => "decimal",
                "char" or "nchar"
                    or "varchar" or "nvarchar"
                    or "text" or "ntext"
                    or CSharpStringType => CSharpStringType,
                "date" or "datetime"
                    or "datetime2" or "smalldatetime" => "DateTime",
                "datetimeoffset" => "DateTimeOffset",
                "time" => "TimeSpan",
                "uniqueidentifier" or "guid" => "Guid",
                "binary" or "varbinary"
                    or "image" or "rowversion"
                    or "timestamp" or "point" => "byte[]",
                "xml" => CSharpStringType,
                _ => CSharpStringType
            };

        /// <summary>Returns true for value types that need "?" when nullable.</summary>
        public static bool IsValueType(string csType) =>
            csType is "int" or "long" or "short" or "byte" or "bool"
                   or "double" or "float" or "decimal"
                   or "DateTime" or "DateTimeOffset" or "TimeSpan" or "Guid";

        /// <summary>
        /// Converts a DB column name (snake_case, camelCase, or PascalCase)
        /// to a valid PascalCase C# identifier.
        /// </summary>
        public static string ToPascalCase(string name)
        {
            if (string.IsNullOrEmpty(name)) return name;

            // Split on underscores/hyphens, capitalise first char of each segment
            var result = string.Concat(
                name.Split('_', '-', ' ')
                    .Where(w => w.Length > 0)
                    .Select(w => char.ToUpperInvariant(w[0]) + w[1..]));

            // Ensure the identifier doesn't start with a digit
            if (result.Length > 0 && char.IsDigit(result[0]))
                result = "_" + result;

            return result;
        }

        // ── Roslyn metadata references ───────────────────────────────────

        private static List<MetadataReference> GetCompilationReferences()
        {
            var refs = new List<MetadataReference>();

            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies()
                         .Where(a => !a.IsDynamic && !string.IsNullOrEmpty(a.Location)))
            {
                try { refs.Add(MetadataReference.CreateFromFile(asm.Location)); }
                catch { /* skip assemblies that can't be read */ }
            }

            var relationalAsm = typeof(Microsoft.EntityFrameworkCore.RelationalEntityTypeBuilderExtensions).Assembly;
            refs.Add(MetadataReference.CreateFromFile(relationalAsm.Location));

            return refs;
        }
    }
}
