-- 2026-05-08 — Rendi editabili `causale` e `riferimento_ordine` su fatture_inviate.
--
-- Motivazione: il template `<app-document-edit-form>` di fatture_inviate include
-- questi due campi in `controparteFields` ma il metadata li aveva
-- `mc_logic_editable=0` e `mchideinedit=1`, quindi erano renderizzati come
-- readonly span pur essendo in posizione editabile. L'utente li vuole
-- compilabili (causale documento, riferimento ordine cliente).

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

UPDATE c
   SET c.mc_logic_editable = 1,
       c.mchideinedit = 0
  FROM _metadati__colonne c
  JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE (t.mdroutename = 'fatture_inviate'    AND c.mc_nome_colonna IN ('causale','riferimento_ordine'))
    OR (t.mdroutename = 'fatture_ricevute'   AND c.mc_nome_colonna = 'data_ricezione')
    OR (t.mdroutename = 'ordini_elettronici' AND c.mc_nome_colonna = 'data_ricezione');
GO

-- Verifica
SELECT t.mdroutename, c.mc_nome_colonna, c.mc_logic_editable, c.mchideinedit
  FROM _metadati__colonne c
  JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE (t.mdroutename = 'fatture_inviate'    AND c.mc_nome_colonna IN ('causale','riferimento_ordine'))
    OR (t.mdroutename = 'fatture_ricevute'   AND c.mc_nome_colonna = 'data_ricezione')
    OR (t.mdroutename = 'ordini_elettronici' AND c.mc_nome_colonna = 'data_ricezione')
 ORDER BY t.mdroutename, c.mc_nome_colonna;
GO

-- DOPO l'esecuzione: invalidare il metadata runtime via AsmxProxy
-- (regola 10 AGENTS.md). Non aggiornare sys_info.projectmetadataversion via SQL.
