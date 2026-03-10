using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using WuicCore.Server.Database;

namespace WEB_UI_CRAFTER.Helpers
{
    public class CustomModelCacheKey : ModelCacheKey
    {
        private readonly string _contextVersion;

        public CustomModelCacheKey(DbContext context)
            : base(context)
        {
            _contextVersion = DynamicContext.GetContextVersion();
        }

        protected override bool Equals(ModelCacheKey other)
         => base.Equals(other)
            && (other as CustomModelCacheKey)?._contextVersion == _contextVersion;

        public override bool Equals(object obj)
            => obj is ModelCacheKey other && Equals(other);

        public override int GetHashCode() => base.GetHashCode();
    }

}
