using System;
using System.Linq;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using FatturazioneElettronica.Helpers;

namespace FatturazioneElettronica.Controllers;

/// <summary>
/// Workflow #18: Validazione P.IVA + Codice Fiscale italiani.
///
/// Endpoints:
///   GET /api/validate/piva?value=01234567890   → { ok, valid, reason }
///   GET /api/validate/cf?value=RSSMRA80A01H501U → { ok, valid, reason, gender, birth_date, comune_code }
///
/// Algoritmi:
///   - P.IVA: 11 cifre + checksum Luhn modificato (algoritmo italiano)
///   - CF: 16 caratteri (alfanumerici per persone fisiche) con regole Agenzia Entrate
///         + checksum lettera finale
///         + estrazione metadati (sesso, anno/mese/giorno nascita, codice catastale)
///
/// Nessuna chiamata esterna (no VIES, no Agenzia Entrate API): validazione formale
/// offline. Valida la sintassi/checksum, NON che il soggetto esista realmente.
/// </summary>
[ApiController]
[Route("api/validate")]
public class ValidateController : ControllerBase
{
    [HttpGet("piva")]
    public IActionResult ValidatePIva([FromQuery] string? value)
    {
        var gate = AuthGate.RequireAuth();
        if (gate != null) return gate;

        if (string.IsNullOrWhiteSpace(value))
            return BadRequest(new { ok = false, error = "value obbligatorio" });

        var v = value.Trim();
        // 1) lunghezza + soli digit
        if (v.Length != 11)
            return Ok(new { ok = true, valid = false, reason = $"P.IVA deve avere 11 cifre, ne ha {v.Length}", value = v });
        if (!v.All(char.IsDigit))
            return Ok(new { ok = true, valid = false, reason = "P.IVA deve contenere solo cifre", value = v });

        // 2) algoritmo di controllo (Luhn-like): somma cifre dispari + (cifre pari raddoppiate, sottratto 9 se >9)
        int sum = 0;
        for (int i = 0; i < 10; i++)
        {
            int d = v[i] - '0';
            if (i % 2 == 1) // posizioni pari (0-indexed: 1,3,5,7,9)
            {
                d *= 2;
                if (d > 9) d -= 9;
            }
            sum += d;
        }
        int control = (10 - (sum % 10)) % 10;
        int actual = v[10] - '0';
        bool ok = control == actual;

        return Ok(new
        {
            ok = true,
            valid = ok,
            reason = ok ? "P.IVA formalmente valida" : $"checksum non valido (atteso {control}, presente {actual})",
            value = v
        });
    }

    [HttpGet("cf")]
    public IActionResult ValidateCf([FromQuery] string? value)
    {
        var gate = AuthGate.RequireAuth();
        if (gate != null) return gate;

        if (string.IsNullOrWhiteSpace(value))
            return BadRequest(new { ok = false, error = "value obbligatorio" });

        var v = value.Trim().ToUpperInvariant();

        // CF persona fisica = 16 alfanumerici. Per persone giuridiche il CF coincide con la P.IVA (11 cifre).
        if (v.Length == 11 && v.All(char.IsDigit))
        {
            // Persona giuridica: stessa validazione P.IVA
            return ValidatePIva(v);
        }

        if (v.Length != 16)
            return Ok(new { ok = true, valid = false, reason = $"CF persona fisica = 16 caratteri, visto {v.Length}", value = v });

        if (!Regex.IsMatch(v, @"^[A-Z0-9]{16}$"))
            return Ok(new { ok = true, valid = false, reason = "CF deve contenere solo lettere maiuscole e cifre", value = v });

        // Validazione checksum lettera finale (algoritmo standard)
        if (!ValidateCfChecksum(v, out var calculatedLast))
            return Ok(new { ok = true, valid = false, reason = $"checksum non valido (atteso {calculatedLast}, presente {v[15]})", value = v });

        // Estrazione metadati
        // Posizioni 6,7 = anno (2 cifre)
        // Posizione 8 = mese (lettera A-E,H,L,M,P,R-T)
        // Posizioni 9,10 = giorno (femmine: +40)
        // Posizioni 11-14 = codice catastale (Lxxx o Zxxx per Comuni esteri)
        int? gg = TryDecodeCfDigits(v.Substring(9, 2));
        string? sesso = null;
        int? giorno = null;
        if (gg.HasValue)
        {
            if (gg.Value > 40) { sesso = "F"; giorno = gg.Value - 40; }
            else { sesso = "M"; giorno = gg.Value; }
        }
        var meseChar = v[8];
        int? meseNum = MeseFromChar(meseChar);
        int? anno = TryDecodeCfDigits(v.Substring(6, 2));

        string? birthDate = null;
        if (anno.HasValue && meseNum.HasValue && giorno.HasValue && giorno.Value >= 1 && giorno.Value <= 31)
        {
            // 2-digit year disambiguation: se >= year-corrente-2digit → 1900s, altrimenti 2000s.
            int y2 = anno.Value;
            int currentYY = DateTime.Today.Year % 100;
            int fullYear = (y2 > currentYY) ? 1900 + y2 : 2000 + y2;
            try
            {
                var d = new DateTime(fullYear, meseNum.Value, giorno.Value);
                birthDate = d.ToString("yyyy-MM-dd");
            }
            catch { /* data invalida */ }
        }

        var codCatastale = v.Substring(11, 4);

        return Ok(new
        {
            ok = true,
            valid = true,
            reason = "CF formalmente valido",
            value = v,
            gender = sesso,
            birth_date = birthDate,
            comune_code = codCatastale,
            is_foreign_born = codCatastale.StartsWith("Z")
        });
    }

    // ── helpers CF checksum ──────────────────────────────────────

    private static bool ValidateCfChecksum(string cf, out char calculatedLast)
    {
        // Mappa caratteri pari/dispari per CF (algoritmo Agenzia Entrate)
        // Indici dispari (1,3,...,15 in 1-based; 0,2,...,14 in 0-based)
        var oddMap = new System.Collections.Generic.Dictionary<char, int>
        {
            {'0',1},{'1',0},{'2',5},{'3',7},{'4',9},{'5',13},{'6',15},{'7',17},{'8',19},{'9',21},
            {'A',1},{'B',0},{'C',5},{'D',7},{'E',9},{'F',13},{'G',15},{'H',17},{'I',19},{'J',21},
            {'K',2},{'L',4},{'M',18},{'N',20},{'O',11},{'P',3},{'Q',6},{'R',8},{'S',12},{'T',14},
            {'U',16},{'V',10},{'W',22},{'X',25},{'Y',24},{'Z',23}
        };
        // Indici pari (2,4,...,14 in 1-based; 1,3,...,13 in 0-based) = posizione alfabeto (A=0..Z=25)
        var evenMap = new System.Collections.Generic.Dictionary<char, int>
        {
            {'0',0},{'1',1},{'2',2},{'3',3},{'4',4},{'5',5},{'6',6},{'7',7},{'8',8},{'9',9},
            {'A',0},{'B',1},{'C',2},{'D',3},{'E',4},{'F',5},{'G',6},{'H',7},{'I',8},{'J',9},
            {'K',10},{'L',11},{'M',12},{'N',13},{'O',14},{'P',15},{'Q',16},{'R',17},{'S',18},{'T',19},
            {'U',20},{'V',21},{'W',22},{'X',23},{'Y',24},{'Z',25}
        };
        int total = 0;
        for (int i = 0; i < 15; i++)
        {
            char c = cf[i];
            // posizione 1-based: i=0 → pos1 (DISPARI), i=1 → pos2 (PARI), ...
            bool oddPos = (i % 2 == 0);
            if (oddPos)
            {
                if (!oddMap.TryGetValue(c, out int v)) { calculatedLast = '?'; return false; }
                total += v;
            }
            else
            {
                if (!evenMap.TryGetValue(c, out int v)) { calculatedLast = '?'; return false; }
                total += v;
            }
        }
        int rem = total % 26;
        calculatedLast = (char)('A' + rem);
        return calculatedLast == cf[15];
    }

    private static int? TryDecodeCfDigits(string s)
    {
        // Nel CF i caratteri "anno" e "giorno" sono digit, ma possono essere
        // sostituiti da lettere quando ci sono omocodie (Agenzia Entrate). Per
        // semplicita' qui accettiamo solo cifre — l'omocodia richiederebbe
        // tabella di sostituzione lettera→cifra (L→0, M→1, ecc.).
        if (s.Length == 2 && s.All(char.IsDigit) && int.TryParse(s, out int n)) return n;
        return null;
    }

    private static int? MeseFromChar(char c) => c switch
    {
        'A' => 1, 'B' => 2, 'C' => 3, 'D' => 4, 'E' => 5,
        'H' => 6, 'L' => 7, 'M' => 8, 'P' => 9,
        'R' => 10, 'S' => 11, 'T' => 12,
        _ => null
    };
}
