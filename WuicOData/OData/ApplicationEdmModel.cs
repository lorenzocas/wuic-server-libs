// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Microsoft.OData.Edm;
using Microsoft.OData.ModelBuilder;
using Microsoft.Spatial;

using System.Reflection;
using System.Linq;
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.CompilerServices;
using WuicOData.Services;

namespace WuicCore.Server.Api.Models
{
    public static class ApplicationEdmModel
    {
        /// <summary>
        /// Target namespace scanned in all assemblies to auto-register EntitySets.
        /// </summary>
        private const string ModelsNamespace = MetadataModelGenerator.TargetNamespace;

        /// <summary>
        /// Property names that must NEVER be exposed via the OData feed,
        /// regardless of caller authentication. Auto-registration via
        /// reflection (the loop below) would otherwise propagate every
        /// public property of every entity to the EDM, including credential
        /// material like the `hashedPassword` column on the WWI Person
        /// entity (157 PBKDF2 hashes were live-leaked publicly via
        /// `/odata/Person?$select=hashedPassword&amp;$filter=hashedPassword ne null`
        /// before this filter existed). Defense-in-depth: even when the
        /// /odata/* route is correctly auth-gated upstream, stripping these
        /// at the EDM level guarantees no future model/route change can
        /// re-leak them.
        /// </summary>
        private static readonly HashSet<string> SensitivePropertyDenylist =
            new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "hashedPassword", "pwd_hash", "password", "passwd", "pwd",
                "secret", "apiKey", "api_key", "accessToken", "refreshToken"
            };

        public static IEdmModel GetEdmModel(DynamicModelService dynamicModelService = null)
        {
            var modelBuilder = new ODataConventionModelBuilder();

            modelBuilder.Namespace = "WideWorldImportersService";

            // any runtime-generated assembly from DynamicModelService
            var assemblies = new List<Assembly> { Assembly.GetExecutingAssembly() };

            // fall back to the persisted DLL loaded at boot time
            var generatedAssembly = dynamicModelService?.CurrentAssembly;
            if (generatedAssembly != null)
                assemblies.Add(generatedAssembly);

            var entitySetMethod = modelBuilder.GetType()
                .GetMethod("EntitySet", new[] { typeof(string) });

            foreach (var asm in assemblies)
            {
                var q = from t in GetLoadableTypes(asm)
                        where t.IsClass
                           && t.Namespace == ModelsNamespace
                           && Attribute.GetCustomAttribute(t, typeof(CompilerGeneratedAttribute)) == null
                        select t;

                q.ToList().ForEach(t =>
                {
                    try
                    {
                        var genMethod = entitySetMethod!.MakeGenericMethod(t);
                        genMethod.Invoke(modelBuilder, new object[] { t.Name });

                        // Strip credential-shaped properties from the just-registered
                        // entity type. AddEntityType(Type) is idempotent — it returns
                        // the existing EntityTypeConfiguration the EntitySet<T> call
                        // above just created, on which RemoveProperty drops the
                        // property from the EDM so it is neither selectable nor
                        // filterable nor returned by default. Any future entity that
                        // happens to have a `hashedPassword` / `pwd_hash` / etc.
                        // column gets the same treatment for free.
                        var entityConfig = modelBuilder.AddEntityType(t);
                        foreach (var prop in t.GetProperties(BindingFlags.Public | BindingFlags.Instance))
                        {
                            if (SensitivePropertyDenylist.Contains(prop.Name))
                            {
                                entityConfig.RemoveProperty(prop);
                            }
                        }
                    }
                    catch (TargetInvocationException ex) when (
                        ex.InnerException is FileNotFoundException ||
                        ex.InnerException is TypeLoadException)
                    {
                        // Skip entity types that reference legacy runtime-only dependencies
                        // still be built for the remaining entities.
                    }
                    catch (FileNotFoundException)
                    {
                        // Same rationale as above, but without TargetInvocationException wrapping.
                    }
                    catch (TypeLoadException)
                    {
                        // Same rationale as above, but without TargetInvocationException wrapping.
                    }
                });
            }


            // Configure EntityTypes, that could not be mapped using Conventions. We
            // could also add Attributes to the Model, but I want to avoid mixing the
            // EF Core Fluent API and Attributes.

            // Build the Spatial Types:
            BuildGeometryTypes(modelBuilder);

            // Send as Lower Camel Case Properties, so the JSON looks better:
            modelBuilder.EnableLowerCamelCase();

            return modelBuilder.GetEdmModel();
        }

        private static IEnumerable<Type> GetLoadableTypes(Assembly asm)
        {
            try
            {
                return asm.GetTypes();
            }
            catch (ReflectionTypeLoadException ex)
            {
                return ex.Types.Where(t => t != null);
            }
        }

        /// <summary>
        /// EF Core Scaffolding generates NetTopologySuite types for SQL Server 
        /// Spatial types. There are incompatible with OData, which only supports 
        /// Microsoft.Spatial types. 
        /// 
        /// So we rewrite the convention-based EDM model here to ignore the NetTopology 
        /// Suite properties and use our custom properties instead.
        /// </summary>
        /// <param name="modelBuilder">ModelBuilder to configure the EDM model</param>
        private static void BuildGeometryTypes(ODataConventionModelBuilder modelBuilder)
        {
            modelBuilder.ComplexType<Geography>();


            //// We will rewrite the Property Name from EdmLocation -> Location, so
            //// it matches fine with the EF Core Model for filtering.
            modelBuilder.OnModelCreating += (builder) =>
            {
                foreach (StructuralTypeConfiguration typeConfiguration in builder.StructuralTypes)
                {
                    foreach (PropertyConfiguration property in typeConfiguration.Properties)
                    {
                        //// Let's not introduce magic strings and make it more safe for refactorings:

                    }
                }
            };
        }
    }
}
