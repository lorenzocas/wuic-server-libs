-- =============================================================================
-- Patch: override metadata SOLO sui 4 campi lookup di
-- fatture_inviate.causale_id (post-scaffolding via service).
--
-- Lo scaffolding service (`scaffolding.scaffoldColumn`) crea la colonna
-- come `mc_ui_column_type='number'` perche' in DB e' INT. Per renderla
-- lookup verso `causali` aggiorniamo solo i 4 campi lookup-specific:
--   mc_ui_column_type      = 'lookupByID'
--   mcuilookupentityname   = 'causali'
--   mcuilookupdata_value_field = 'id'
--   mcuilookupdata_text_field  = 'descrizione'
-- + display strings + nullable/required (causale e' opzionale).
--
-- Idempotente: se gia' lookupByID, la WHERE non matcha (skip).
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
       mc.mcuilookupentityname        = 'causali',
       mc.mcuilookupdata_value_field  = 'id',
       mc.mcuilookupdata_text_field   = 'descrizione',
       mc.mc_display_string_in_view   = 'causale',
       mc.mc_display_string_in_edit   = 'causale',
       mc.mc_validation_required      = 0,
       mc.mc_logic_nullable           = 1
  FROM _metadati__colonne mc
 WHERE mc.md_id = @md_fi
   AND mc.mc_nome_colonna = 'causale_id'
   AND mc.mc_ui_column_type <> 'lookupByID';

-- Nascondi la vecchia colonna text 'causale' (legacy backward-compat).
UPDATE mc
   SET mc.mchideinedit = 1, mc.mc_logic_editable = 0
  FROM _metadati__colonne mc
 WHERE mc.md_id = @md_fi
   AND mc.mc_nome_colonna = 'causale'
   AND (mc.mchideinedit = 0 OR mc.mc_logic_editable = 1);

-- Verifica
SELECT mc.mc_nome_colonna, mc.mc_ui_column_type,
       mc.mcuilookupentityname AS entity,
       mc.mcuilookupdata_text_field  AS textF,
       mc.mcuilookupdata_value_field AS valF,
       mc.mchideinedit AS hide_edit, mc.mc_logic_editable AS logic_ed
  FROM _metadati__colonne mc
 WHERE mc.md_id = @md_fi
   AND mc.mc_nome_colonna IN ('causale','causale_id');
