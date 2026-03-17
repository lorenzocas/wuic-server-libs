using System.Net.WebSockets;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

namespace CrmApp.Realtime;

public sealed class CrmNotificationStartupFilter : IStartupFilter
{
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
    {
        return app =>
        {
            app.UseWebSockets();

            app.Use(async (context, pipelineNext) =>
            {
                if (!context.Request.Path.Equals("/ws/crm-notifications", StringComparison.OrdinalIgnoreCase))
                {
                    await pipelineNext();
                    return;
                }

                if (!context.WebSockets.IsWebSocketRequest)
                {
                    context.Response.StatusCode = StatusCodes.Status400BadRequest;
                    await context.Response.WriteAsync("WebSocket request expected.");
                    return;
                }

                if (!int.TryParse(context.Request.Query["userId"], out var userId) || userId <= 0)
                {
                    context.Response.StatusCode = StatusCodes.Status400BadRequest;
                    await context.Response.WriteAsync("Missing or invalid userId.");
                    return;
                }

                var push = context.RequestServices.GetRequiredService<ICrmNotificationPushService>();
                using WebSocket socket = await context.WebSockets.AcceptWebSocketAsync();
                await push.RegisterAndRunAsync(userId, socket, context.RequestAborted);
            });

            next(app);
        };
    }
}
