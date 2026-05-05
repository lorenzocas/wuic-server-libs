/* ============================================================
   FatturazioneElettronica — Scadenzario come archetype scheduler
   ============================================================
   1) Configura mdpropsbag.archetypes.scheduler su route v_scadenzario
   2) Sposta voce menu da #/v_scadenzario/list a #/v_scadenzario/scheduler

   Pattern verificato 2026-05-05 (riferimento canonico:
   wuic-framework-lib/src/lib/class/schedulerOptions.ts):
     archetypes.scheduler = {
       fromField:           <colonna SQL data inizio evento>,
       toField:             <colonna SQL data fine evento>,
       titleField:          <colonna SQL titolo evento>,
       itemTemplateString:  <html template opzionale>,
       titleFunction:       <funzione JS opzionale>
     }

   Per v_scadenzario:
     - fromField = toField = "data_scadenza" (evento giornaliero)
     - titleField = "soggetto" (cliente per INCASSO / fornitore per PAGAMENTO)
     - itemTemplateString = template ricco con doc_numero + importo
   ============================================================ */

SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON; SET NUMERIC_ROUNDABORT OFF;

/* ---- 1) propsbag scheduler su v_scadenzario ---- */
DECLARE @propsbag VARCHAR(MAX) = N'{
  "archetypes": {
    "scheduler": {
      "fromField": "data_scadenza",
      "toField": "data_scadenza",
      "titleField": "soggetto",
      "itemTemplateString": "<div style=\"padding:4px 6px;font-size:11px;line-height:1.3\"><strong>{{soggetto}}</strong><br/><span style=\"opacity:.8\">{{tipo}} — {{doc_numero}}</span><br/><span style=\"font-weight:bold\">€ {{importo_residuo}}</span></div>"
    }
  }
}';

UPDATE dbo._metadati__tabelle
SET mdpropsbag = @propsbag
WHERE mdroutename = 'v_scadenzario';

PRINT 'mdpropsbag configurato su v_scadenzario.';

/* ---- 2) sposta voce menu Scadenzario da /list a /scheduler ---- */
IF EXISTS (SELECT 1 FROM dbo._metadati__menu WHERE mm_nome_menu = 'scadenzario')
BEGIN
    UPDATE dbo._metadati__menu
    SET mm_uri_menu = N'#/v_scadenzario/scheduler',
        mm_icon     = N'pi pi-calendar'
    WHERE mm_nome_menu = 'scadenzario';
    PRINT 'Voce menu scadenzario aggiornata a #/v_scadenzario/scheduler.';
END

/* ---- 3) verifica ---- */
SELECT
    'route_propsbag' AS item,
    mdroutename AS k,
    mdpropsbag AS v
FROM dbo._metadati__tabelle
WHERE mdroutename = 'v_scadenzario'
UNION ALL
SELECT
    'menu_uri',
    mm_nome_menu,
    mm_uri_menu
FROM dbo._metadati__menu
WHERE mm_nome_menu = 'scadenzario';
GO
