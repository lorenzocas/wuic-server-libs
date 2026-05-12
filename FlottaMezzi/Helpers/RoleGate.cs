using System;
using System.Linq;
using System.Security.Authentication;
using WEB_UI_CRAFTER.Helpers;

namespace FlottaMezzi.Helpers;

/// <summary>
/// Gate di autorizzazione basato su nome ruolo (oltre a super-admin).
/// Pattern raccomandato dalla skill app-creation Liv 5 per endpoint
/// custom che richiedono autorizzazione applicativa specifica.
/// </summary>
public static class RoleGate
{
    /// <summary>
    /// Verifica che l'utente identificato da user_id abbia uno dei ruoli ammessi.
    /// Lancia AuthenticationException se non autorizzato (catturare nel controller -> 403).
    /// </summary>
    public static void Require(string user_id, params string[] allowedRoleDes)
    {
        if (string.IsNullOrWhiteSpace(user_id))
            throw new AuthenticationException("user_id mancante");

        var u = user.getUserByID(user_id);
        if (u == null)
            throw new AuthenticationException($"utente {user_id} non trovato");

        // Super-admin / Admin bypassa sempre
        if (u.hasAdminGrant) return;

        // u.role contiene il display-name del ruolo principale (mappa ruoli.ruolo_des).
        if (!allowedRoleDes.Contains(u.role, StringComparer.OrdinalIgnoreCase))
        {
            throw new AuthenticationException(
                $"Ruolo richiesto: {string.Join("|", allowedRoleDes)} (corrente: {u.role})");
        }
    }

    /// <summary>
    /// Variante che ritorna bool invece di throw (utile per branch UI).
    /// </summary>
    public static bool HasAnyRole(string user_id, params string[] allowedRoleDes)
    {
        try
        {
            Require(user_id, allowedRoleDes);
            return true;
        }
        catch (AuthenticationException)
        {
            return false;
        }
    }
}
