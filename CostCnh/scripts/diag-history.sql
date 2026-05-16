USE [CostCnh_Data];
SELECT TOP 3
    id, code, sys_end,
    CASE WHEN sys_end >= CAST('9999-12-31' AS DATETIME2(3)) THEN 1 ELSE 0 END AS test1,
    CASE WHEN sys_end = CAST('9999-12-31 23:59:59.999' AS DATETIME2(3)) THEN 1 ELSE 0 END AS test2,
    CASE WHEN YEAR(sys_end) = 9999 THEN 1 ELSE 0 END AS test3
FROM [xbs].[node] FOR SYSTEM_TIME ALL
WHERE code IN ('MATERIAL','LABOR')
ORDER BY code, sys_start DESC;
