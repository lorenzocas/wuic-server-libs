using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace WEB_UI_CRAFTER.Helpers
{
    public class CustomModelCacheKeyFactory : IModelCacheKeyFactory
    {
        public object Create(DbContext context) => new CustomModelCacheKey(context);

        public object Create(DbContext context, bool designTime)
        {
            return new CustomModelCacheKey(context);
        }
    }

}
