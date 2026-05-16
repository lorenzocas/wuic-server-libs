USE [CostCnh_Data];
SELECT definition FROM sys.sql_modules WHERE object_id = OBJECT_ID(N'xbs.vw_node_history');
