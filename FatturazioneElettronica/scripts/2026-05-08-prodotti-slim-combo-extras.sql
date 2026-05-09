-- 2026-05-08 — Set mc_props_bag.slimCombo array sulla colonna `prodotto_id`
-- delle 6 row routes che espongono il lookup verso `prodotti`. Cosi' il
-- combo response include i campi extra necessari al pre-fill della
-- riga (descrizione, unita_misura_id, codice_iva_id, prezzo_vendita,
-- prezzo_acquisto, sconto_default) e il custom component puo' leggere
-- l'oggetto da `record['prodotto_id__lookup_obj'].value` senza un
-- ulteriore HTTP fetch.
--
-- Logica framework: data-provider-meta.service.ts:135
-- `buildSlimComboRestriction` -> aggiunge i nomi nell'array `slimCombo`
-- al columnRestrictionList del combo SELECT (PK + valueField + textField + extras).

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

UPDATE c
   SET c.mcpropsbag = N'{"slimCombo":["unita_misura_id","codice_iva_id","prezzo_vendita","prezzo_acquisto","sconto_default"]}'
  FROM _metadati__colonne c
  JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE t.mdroutename IN ('fatture_inviate_righe','ddt_righe','ordini_acquisto_righe','ordini_righe','preventivi_righe','proforma_righe')
   AND c.mc_nome_colonna = 'prodotto_id'
   AND (c.mcpropsbag IS NULL OR c.mcpropsbag = '');
GO

-- Verifica idempotente: deve mostrare 6 righe con il JSON popolato.
SELECT t.mdroutename, c.mc_nome_colonna, CAST(c.mcpropsbag AS NVARCHAR(MAX)) AS propsbag
  FROM _metadati__colonne c
  JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE t.mdroutename IN ('fatture_inviate_righe','ddt_righe','ordini_acquisto_righe','ordini_righe','preventivi_righe','proforma_righe')
   AND c.mc_nome_colonna = 'prodotto_id'
 ORDER BY t.mdroutename;
GO
