-- =============================================================================
-- Patch: override metadata SOLO sui 4 campi lookup-specific di
-- fatture_inviate.riferimento_ordine_id (post-scaffolding via service).
--
-- Lookup verso route `ordini` con `numero` (es. "12/2026") come display.
--
-- Idempotente: WHERE filtra solo type='number' (post-scaffold default).
-- =============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

USE FatturazioneElettronica_Metadata;

DECLARE @md_fi INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = 'fatture_inviate');

UPDATE mc
   SET mc.mc_ui_column_type           = 'lookupByID',
       mc.mcuilookupentityname        = 'ordini',
       mc.mcuilookupdata_value_field  = 'id',
       mc.mcuilookupdata_text_field   = 'numero',
       mc.mc_display_string_in_view   = 'riferimento ordine',
       mc.mc_display_string_in_edit   = 'riferimento ordine',
       mc.mc_validation_required      = 0,
       mc.mc_logic_nullable           = 1
  FROM _metadati__colonne mc
 WHERE mc.md_id = @md_fi
   AND mc.mc_nome_colonna = 'riferimento_ordine_id'
   AND mc.mc_ui_column_type <> 'lookupByID';

-- Nascondi la vecchia colonna text 'riferimento_ordine' (legacy backward-compat).
UPDATE mc
   SET mc.mchideinedit = 1, mc.mchideinlist = 1, mc.mc_logic_editable = 0
  FROM _metadati__colonne mc
 WHERE mc.md_id = @md_fi
   AND mc.mc_nome_colonna = 'riferimento_ordine'
   AND (mc.mchideinedit = 0 OR mc.mchideinlist = 0);

-- Verifica
SELECT mc.mc_nome_colonna, mc.mc_ui_column_type,
       mc.mcuilookupentityname AS entity,
       mc.mcuilookupdata_text_field  AS textF,
       mc.mcuilookupdata_value_field AS valF,
       mc.mchideinedit AS hide_edit, mc.mchideinlist AS hide_list
  FROM _metadati__colonne mc
 WHERE mc.md_id = @md_fi
   AND mc.mc_nome_colonna IN ('riferimento_ordine','riferimento_ordine_id');
