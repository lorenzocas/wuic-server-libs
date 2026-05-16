USE [CostCnh_Metadata];

WITH cte AS (
  SELECT mm_id, mm_nome_menu, mm_display_string_menu, mm_parent_id, mm_uri_menu, mm_is_visible_by_default, mdid, 0 AS lvl, CAST(RIGHT('00000' + CAST(mmordine AS VARCHAR(10)), 5) AS VARCHAR(MAX)) AS pth
  FROM _metadati__menu
  WHERE (mm_parent_id IS NULL OR mm_parent_id = 0)
    AND mm_nome_menu IN ('planning','workforce','reporting','masterdata','administration_costcnh')
  UNION ALL
  SELECT m.mm_id, m.mm_nome_menu, m.mm_display_string_menu, m.mm_parent_id, m.mm_uri_menu, m.mm_is_visible_by_default, m.mdid, c.lvl + 1, c.pth + '.' + RIGHT('00000' + CAST(m.mmordine AS VARCHAR(10)), 5)
  FROM _metadati__menu m
  JOIN cte c ON m.mm_parent_id = c.mm_id
)
SELECT
  REPLICATE('  ', lvl) + mm_display_string_menu AS tree,
  mm_uri_menu AS uri,
  mm_is_visible_by_default AS vis,
  mdid
FROM cte
ORDER BY pth;
