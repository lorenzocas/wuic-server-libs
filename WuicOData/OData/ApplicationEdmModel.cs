// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Microsoft.OData.Edm;
using Microsoft.OData.ModelBuilder;
using Microsoft.Spatial;

//using WideWorldImporters.Server.Database.Models;
using WuicCore.Server.Database.Models;
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

        public static IEdmModel GetEdmModel(DynamicModelService dynamicModelService = null)
        {
            var modelBuilder = new ODataConventionModelBuilder();

            modelBuilder.Namespace = "WideWorldImportersService";

            // Assemblies to scan: the executing assembly (static models) +
            // any runtime-generated assembly from DynamicModelService
            var assemblies = new List<Assembly> { Assembly.GetExecutingAssembly() };

            // Prefer the in-memory assembly (rebuilt without restart);
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
                    }
                    catch (TargetInvocationException ex) when (
                        ex.InnerException is FileNotFoundException ||
                        ex.InnerException is TypeLoadException)
                    {
                        // Skip entity types that reference legacy runtime-only dependencies
                        // (e.g. Microsoft.SqlServer.Types on .NET Framework) so the EDM can
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

            //modelBuilder.EntitySet<Person>("Persons");

            // Configure EntityTypes, that could not be mapped using Conventions. We
            // could also add Attributes to the Model, but I want to avoid mixing the
            // EF Core Fluent API and Attributes.
            //modelBuilder.EntityType<Person>().HasKey(s => new { s.PersonId });

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

            //modelBuilder.EntityType<City>().Ignore(x => x.Location);
            //modelBuilder.EntityType<Country>().Ignore(x => x.Border);
            //modelBuilder.EntityType<Customer>().Ignore(x => x.DeliveryLocation);
            //modelBuilder.EntityType<Supplier>().Ignore(x => x.DeliveryLocation);
            //modelBuilder.EntityType<StateProvince>().Ignore(x => x.Border);
            //modelBuilder.EntityType<SystemParameter>().Ignore(x => x.DeliveryLocation);

            //// We will rewrite the Property Name from EdmLocation -> Location, so
            //// it matches fine with the EF Core Model for filtering.
            modelBuilder.OnModelCreating += (builder) =>
            {
                foreach (StructuralTypeConfiguration typeConfiguration in builder.StructuralTypes)
                {
                    foreach (PropertyConfiguration property in typeConfiguration.Properties)
                    {
                        //// Let's not introduce magic strings and make it more safe for refactorings:
                        //string propertyName = (typeConfiguration.Name, property.Name) switch
                        //{
                        //    (nameof(City), nameof(City.EdmLocation)) => nameof(City.Location),
                        //    (nameof(Country), nameof(Country.EdmBorder)) => nameof(Country.Border),
                        //    (nameof(Customer), nameof(Customer.EdmDeliveryLocation)) => nameof(Customer.DeliveryLocation),
                        //    (nameof(Supplier), nameof(Supplier.EdmDeliveryLocation)) => nameof(Supplier.DeliveryLocation),
                        //    (nameof(StateProvince), nameof(StateProvince.EdmBorder)) => nameof(StateProvince.Border),
                        //    (nameof(SystemParameter), nameof(SystemParameter.EdmDeliveryLocation)) => nameof(SystemParameter.DeliveryLocation),
                        //    _ => property.Name,
                        //};

                        //property.Name = propertyName;
                    }
                }
            };
        }
    }
}
