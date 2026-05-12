SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- 1) Chart config sulla nuova route vw_costi_per_mese
DECLARE @md_v INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename='vw_costi_per_mese');
UPDATE _metadati__tabelle
SET mdpropsbag = N'{"archetypes":{"chart":{"type":"line","dataOptions":{"dataProperty":"dato","datasets":[{"labelField":"etichetta_mese","label":"Costi per mese","dataField":"totale_mese"}]}}}}'
WHERE md_id = @md_v;

-- Default sort cronologico (periodo ASC) — ordering deterministico nel chart
UPDATE _metadati__colonne SET mcdefaultsort='ASC' WHERE md_id=@md_v AND mc_nome_colonna='periodo';

SELECT 'OK config view chart';
