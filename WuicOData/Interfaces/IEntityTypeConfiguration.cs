using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.OData.ModelBuilder;
using Microsoft.EntityFrameworkCore;

namespace WuicCore.Interfaces
{
    public interface IGenericConfiguration<T> : IEntityTypeConfiguration<T> where T : class
    {
        public void SpecialConfigure(EntityTypeBuilder<T> builder);
    }

    public abstract class GenericConfiguration<T> : IGenericConfiguration<T> where T : class
    {
        public void Configure(EntityTypeBuilder<T> builder)
        {

            //builder.Property(x => x.lastModifiedDate).HasColumnType("timestamp");
            //builder.Property(x => x.createDate).HasColumnType("timestamp");

            SpecialConfigure(builder);

        }

        public virtual void SpecialConfigure(EntityTypeBuilder<T> builder) { }
    }
}
