using System;
using System.Collections.Generic;
using WEB_UI_CRAFTER.Services;

namespace WEB_UI_CRAFTER.ProjectData.Crud;

/// <summary>
/// Contratto route-level per handler CRUD host-side.
/// Estende IUtilityHost con metadata/comportamenti utili al dispatch dinamico.
/// </summary>
public interface ICrudRouteHandler : IUtilityHost
{
    /// <summary>
    /// Route principale gestita dall'handler (es. "cities").
    /// </summary>
    string RouteName => string.Empty;

    /// <summary>
    /// Alias opzionali della route (es. "city", "anagrafica_citta").
    /// </summary>
    IReadOnlyCollection<string> RouteAliases => Array.Empty<string>();

    /// <summary>
    /// Priorita in caso di piu handler candidati (valore piu alto = preferito).
    /// </summary>
    int Priority => 0;

    /// <summary>
    /// Toggle runtime per abilitare/disabilitare l'handler.
    /// </summary>
    bool Enabled => true;

    /// <summary>
    /// Hook di inizializzazione opzionale dell'handler.
    /// </summary>
    void Initialize(IServiceProvider? serviceProvider)
    {
    }

    /// <summary>
    /// Hook di errore opzionale invocato dal dispatcher prima del rethrow.
    /// </summary>
    void OnError(string hookName, Exception exception)
    {
    }
}
