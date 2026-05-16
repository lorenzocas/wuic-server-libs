USE [CostCnh_Data];
SELECT
    COUNT(*) AS total,
    SUM(CAST(is_current_version AS INT)) AS curN,
    COUNT(*) - SUM(CAST(is_current_version AS INT)) AS histN
FROM [xbs].[vw_node_history];

SELECT TOP 3 id, code, is_current_version, sys_end FROM [xbs].[vw_node_history] WHERE code IN ('MATERIAL','LABOR') ORDER BY code;
