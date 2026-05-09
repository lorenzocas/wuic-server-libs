-- 2026-05-08 — Hide master FK lookup column on the 8 nested rows routes.
-- La FK al master (es. fatture_inviate_righe.fattura_id) viene
-- valorizzata automaticamente dal framework via parentMetaInfo.nestedRoutes
-- al batch save. Esporla in UI causa due problemi:
--   1) UX rumorosa: ogni riga mostra ridondantemente il master id.
--   2) Crash 500 su backend (NRE in _Metadati_methods.AppendFilter linea 6187
--      su f.value.Split) se l'utente apre la dropdown del lookup quando il
--      master e' __new=true (FK value=null).
-- Fix metadata: nascondere la colonna FK in list e in edit. Il framework la
-- valorizza comunque tramite FK propagation.

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

UPDATE c
   SET c.mchideinlist = 1,
       c.mchideinedit = 1
  FROM _metadati__colonne c
  JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE (t.mdroutename = 'fatture_inviate_righe'    AND c.mc_nome_colonna = 'fattura_id')
    OR (t.mdroutename = 'fatture_ricevute_righe'   AND c.mc_nome_colonna = 'fattura_id')
    OR (t.mdroutename = 'preventivi_righe'         AND c.mc_nome_colonna = 'preventivo_id')
    OR (t.mdroutename = 'ordini_righe'             AND c.mc_nome_colonna = 'ordine_id')
    OR (t.mdroutename = 'ddt_righe'                AND c.mc_nome_colonna = 'ddt_id')
    OR (t.mdroutename = 'ordini_acquisto_righe'    AND c.mc_nome_colonna = 'ordine_id')
    OR (t.mdroutename = 'ordini_elettronici_righe' AND c.mc_nome_colonna = 'ordine_id')
    OR (t.mdroutename = 'proforma_righe'           AND c.mc_nome_colonna = 'proforma_id');
GO

-- Verifica idempotente: deve mostrare 8 righe con mchideinlist=1, mchideinedit=1.
SELECT t.mdroutename, c.mc_nome_colonna, c.mchideinlist, c.mchideinedit
  FROM _metadati__colonne c
  JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE (t.mdroutename = 'fatture_inviate_righe'    AND c.mc_nome_colonna = 'fattura_id')
    OR (t.mdroutename = 'fatture_ricevute_righe'   AND c.mc_nome_colonna = 'fattura_id')
    OR (t.mdroutename = 'preventivi_righe'         AND c.mc_nome_colonna = 'preventivo_id')
    OR (t.mdroutename = 'ordini_righe'             AND c.mc_nome_colonna = 'ordine_id')
    OR (t.mdroutename = 'ddt_righe'                AND c.mc_nome_colonna = 'ddt_id')
    OR (t.mdroutename = 'ordini_acquisto_righe'    AND c.mc_nome_colonna = 'ordine_id')
    OR (t.mdroutename = 'ordini_elettronici_righe' AND c.mc_nome_colonna = 'ordine_id')
    OR (t.mdroutename = 'proforma_righe'           AND c.mc_nome_colonna = 'proforma_id')
 ORDER BY t.mdroutename;
GO
