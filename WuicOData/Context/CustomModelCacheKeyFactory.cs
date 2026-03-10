using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace WEB_UI_CRAFTER.Helpers
{
    public class CustomModelCacheKeyFactory : IModelCacheKeyFactory
    {
        private readonly int _instanceMarker = 1;

        public object Create(DbContext context)
        {
            _ = _instanceMarker;
            return new CustomModelCacheKey(context);
        }

        public object Create(DbContext context, bool designTime)
        {
            _ = _instanceMarker;
            return new CustomModelCacheKey(context);
        }
    }

}
