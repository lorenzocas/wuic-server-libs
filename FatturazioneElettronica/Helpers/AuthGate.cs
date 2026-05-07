using System;
using System.Security.Authentication;
using WEB_UI_CRAFTER.Helpers;
using Microsoft.AspNetCore.Mvc;

namespace FatturazioneElettronica.Helpers;

/// <summary>
/// Auth + role-gate helper per i custom controller di FatturazioneElettronica.
///
/// Pattern (vedi `skills/app-creation/SKILL.md` Livello 5):
///   var gate = AuthGate.RequireAuth();          if (gate != null) return gate;
///   var admin = AuthGate.RequireAdmin();        if (admin != null) return admin;
///
/// I metodi ritornano `null` se la verifica passa, altrimenti un
/// `IActionResult` 401/403 da restituire dal controller. Questo evita la
/// duplicazione di try/catch su `AuthenticationException` in ogni endpoint.
///
/// Per ruoli applicativi diversi da super-admin (es. "commerciale",
/// "readonly") il framework non espone direttamente il `ruolo_des`, quindi
/// per ora ci accontentiamo di auth + admin gate. Il role gate per ruolo
/// custom va aggiunto a Helpers/RoleGate.cs quando servira'.
/// </summary>
public static class AuthGate
{
    /// <summary>
    /// Verifica che il chiamante sia autenticato (cookie k-user valido).
    /// </summary>
    /// <param name="userId">Out: user_id come stringa, "0" se guest.</param>
    /// <returns>null se OK, IActionResult 401 se auth fallisce.</returns>
    public static IActionResult? RequireAuth(out string userId)
    {
        try
        {
            userId = RawHelpers.authenticate();
            if (string.IsNullOrEmpty(userId) || userId == "0")
            {
                return new ObjectResult(new { ok = false, error = "auth required" }) { StatusCode = 401 };
            }
            return null;
        }
        catch (AuthenticationException)
        {
            userId = "";
            return new ObjectResult(new { ok = false, error = "auth required" }) { StatusCode = 401 };
        }
        catch (Exception)
        {
            userId = "";
            return new ObjectResult(new { ok = false, error = "auth required" }) { StatusCode = 401 };
        }
    }

    /// <summary>
    /// Overload senza out-param quando l'endpoint non usa `user_id`.
    /// </summary>
    public static IActionResult? RequireAuth() => RequireAuth(out _);

    /// <summary>
    /// Verifica auth + super-admin (ruoli.superadmin via user.isSuperAdmin).
    /// </summary>
    /// <returns>null se OK, IActionResult 401/403 se fallisce.</returns>
    public static IActionResult? RequireAdmin(out string userId)
    {
        var authFail = RequireAuth(out userId);
        if (authFail != null) return authFail;
        try
        {
            RawHelpers.checkAdmin(userId);
            return null;
        }
        catch (AuthenticationException)
        {
            return new ObjectResult(new { ok = false, error = "admin required" }) { StatusCode = 403 };
        }
    }

    public static IActionResult? RequireAdmin() => RequireAdmin(out _);
}
