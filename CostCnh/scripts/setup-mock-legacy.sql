-- =============================================================================
-- Mock legacy DB per smoke testing del ETL framework
-- =============================================================================
-- Crea un DB Cost_Offhighway_Test_Mock con la shape minima del legacy schema
-- (Sites, Currencies, ProgramStatuses, ProjectClasses, ProjectScenarios,
--  UnitMeasures, Dim_Time, XBS_Objtype, XBS_Objects, Programs, Projects,
--  Initiatives, CostPlanning_Facts) + 5-10 row fixture per testare il flow.
-- =============================================================================

IF DB_ID('Cost_Offhighway_Test_Mock') IS NOT NULL
BEGIN
    ALTER DATABASE [Cost_Offhighway_Test_Mock] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [Cost_Offhighway_Test_Mock];
END
GO
CREATE DATABASE [Cost_Offhighway_Test_Mock];
GO
USE [Cost_Offhighway_Test_Mock];
GO

EXEC('CREATE SCHEMA [core] AUTHORIZATION dbo');
EXEC('CREATE SCHEMA [facts] AUTHORIZATION dbo');
GO

-- Sites
CREATE TABLE [core].[Sites] (Id INT IDENTITY PRIMARY KEY, Code VARCHAR(30) UNIQUE, Name NVARCHAR(200), BusinessUnit_Id INT, CountryISO CHAR(2), CurrencyCode CHAR(3), IsActive BIT DEFAULT 1, IsDeleted BIT DEFAULT 0, ModuleId UNIQUEIDENTIFIER);
INSERT INTO [core].[Sites] (Code, Name, BusinessUnit_Id, CountryISO, CurrencyCode) VALUES
('SMV_LEG', N'San Mauro (legacy)', 1, 'IT', 'EUR'),
('TUR_LEG', N'Torino (legacy)',    2, 'IT', 'EUR');

-- Currencies
CREATE TABLE [core].[Currencies] (Id INT IDENTITY PRIMARY KEY, Code CHAR(3) UNIQUE, Name NVARCHAR(60), Symbol NVARCHAR(5), IsActive BIT DEFAULT 1, IsDeleted BIT DEFAULT 0);
INSERT INTO [core].[Currencies] (Code, Name, Symbol) VALUES ('EUR', N'Euro', N'EUR'), ('USD', N'US Dollar', N'USD');

-- ProgramStatuses
CREATE TABLE [core].[ProgramStatuses] (Id INT IDENTITY PRIMARY KEY, Code VARCHAR(30) UNIQUE, Name NVARCHAR(100), IsTerminal BIT DEFAULT 0, SortOrder INT DEFAULT 0);
INSERT INTO [core].[ProgramStatuses] (Code, Name, IsTerminal, SortOrder) VALUES ('DRAFT', N'Draft', 0, 10), ('ACTIVE', N'Active', 0, 20), ('CLOSED', N'Closed', 1, 30);

-- ProjectClasses
CREATE TABLE [core].[ProjectClasses] (Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(), Code VARCHAR(30) UNIQUE, Name NVARCHAR(200), Description NVARCHAR(MAX), IsDeleted BIT DEFAULT 0);
INSERT INTO [core].[ProjectClasses] (Code, Name) VALUES ('RND_LEG', N'R&D legacy'), ('ENG_LEG', N'Engineering legacy');

-- ProjectScenarios
CREATE TABLE [core].[ProjectScenarios] (Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(), Code VARCHAR(50) UNIQUE, Name NVARCHAR(200), Kind VARCHAR(20), IsActive BIT DEFAULT 1, IsDeleted BIT DEFAULT 0);
INSERT INTO [core].[ProjectScenarios] (Code, Name, Kind) VALUES ('LEG_BL', N'Legacy Baseline', 'Baseline'), ('LEG_F1', N'Legacy Forecast 1', 'Working');

-- UnitMeasures
CREATE TABLE [core].[UnitMeasures] (Id INT IDENTITY PRIMARY KEY, Code VARCHAR(20) UNIQUE, Name NVARCHAR(60), Symbol NVARCHAR(10), Kind VARCHAR(20));
INSERT INTO [core].[UnitMeasures] (Code, Name, Symbol, Kind) VALUES ('EUR_AMT_LEG', N'EUR amount', N'EUR', 'Monetary'), ('HOURS', N'Hours', N'h', 'Hours');

-- Dim_Time
CREATE TABLE [facts].[Dim_Time] (MonthId BIGINT PRIMARY KEY, FirstDay DATE, LastDay DATE, IsFiscalYearStart BIT);
INSERT INTO [facts].[Dim_Time] (MonthId, FirstDay, LastDay, IsFiscalYearStart) VALUES
(202501, '2025-01-01', '2025-01-31', 1),
(202502, '2025-02-01', '2025-02-28', 0),
(202503, '2025-03-01', '2025-03-31', 0);

-- XBS_Objtype
CREATE TABLE [facts].[XBS_Objtype] (Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(), Code NVARCHAR(50) UNIQUE, Description NVARCHAR(500));
INSERT INTO [facts].[XBS_Objtype] (Code, Description) VALUES ('XBS_LEG', N'XBS legacy test'), ('WBS_LEG', N'WBS legacy test');

-- XBS_Objects
CREATE TABLE [facts].[XBS_Objects] (Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(), Id_XBS_Objtype UNIQUEIDENTIFIER NOT NULL, Code NVARCHAR(100) NOT NULL, Description NVARCHAR(MAX), ValidFrom SMALLDATETIME DEFAULT GETDATE(), ValidTo SMALLDATETIME NULL, Id_Site INT, NodePathCode VARBINARY(2));
INSERT INTO [facts].[XBS_Objects] (Id_XBS_Objtype, Code, Description, Id_Site, NodePathCode)
SELECT TOP 5 (SELECT TOP 1 Id FROM [facts].[XBS_Objtype]),
       'XBS_LEG_NODE_' + CAST(ROW_NUMBER() OVER(ORDER BY name) AS NVARCHAR(5)),
       'XBS legacy node ' + CAST(ROW_NUMBER() OVER(ORDER BY name) AS NVARCHAR(5)),
       1,
       0x0100
FROM sys.tables;

-- Programs
CREATE TABLE [core].[Programs] (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Code VARCHAR(30), Name VARCHAR(500), RevisionType VARCHAR(50) DEFAULT 'Original',
    ShortDescription VARCHAR(50), LongDescription VARCHAR(250), Comment VARCHAR(MAX),
    Id_ProgramStatus INT, IsWorking BIT DEFAULT 1, IsDeleted BIT DEFAULT 0,
    RevisionCounter VARCHAR(100), RevisionReference UNIQUEIDENTIFIER,
    CreationDate DATETIME DEFAULT GETDATE(), CreationUser VARCHAR(100) DEFAULT 'etl',
    LastUpdateDate DATETIME, LastUpdateUser VARCHAR(100),
    LaunchDate DATE, StartDate DATE, EndDate DATE, PlanningEndDate DATE,
    Id_Site INT NOT NULL, InheritConversions BIT DEFAULT 1, CheckedOut BIT DEFAULT 0,
    LastCheckedOutDate DATETIME, LastCheckedOutUser UNIQUEIDENTIFIER,
    Private BIT DEFAULT 0, Id_ProgramParent UNIQUEIDENTIFIER, Id_WorkflowInstance UNIQUEIDENTIFIER,
    Id_CreationUser UNIQUEIDENTIFIER,
    Id_ProjectClass UNIQUEIDENTIFIER, Id_ProjectScenario UNIQUEIDENTIFIER,
    Id_Month_TimeNow BIGINT, LastContribute DATETIME
);
INSERT INTO [core].[Programs] (Code, Name, Id_ProgramStatus, Id_Site, Id_ProjectClass,
                                Id_ProjectScenario, LaunchDate, StartDate, EndDate, Id_Month_TimeNow)
SELECT 'LEGACY-PROG-001', N'Legacy program 001 (engine test)',
       (SELECT TOP 1 Id FROM [core].[ProgramStatuses] WHERE Code = 'ACTIVE'),
       (SELECT TOP 1 Id FROM [core].[Sites] WHERE Code = 'SMV_LEG'),
       (SELECT TOP 1 Id FROM [core].[ProjectClasses] WHERE Code = 'RND_LEG'),
       (SELECT TOP 1 Id FROM [core].[ProjectScenarios] WHERE Code = 'LEG_BL'),
       '2025-01-15', '2024-06-01', '2027-12-31', 202503;

INSERT INTO [core].[Programs] (Code, Name, Id_ProgramStatus, Id_Site, Id_ProjectClass,
                                Id_ProjectScenario, LaunchDate, StartDate, EndDate, Id_Month_TimeNow)
SELECT 'LEGACY-PROG-002', N'Legacy program 002 (cabin redesign)',
       (SELECT TOP 1 Id FROM [core].[ProgramStatuses] WHERE Code = 'DRAFT'),
       (SELECT TOP 1 Id FROM [core].[Sites] WHERE Code = 'TUR_LEG'),
       (SELECT TOP 1 Id FROM [core].[ProjectClasses] WHERE Code = 'ENG_LEG'),
       (SELECT TOP 1 Id FROM [core].[ProjectScenarios] WHERE Code = 'LEG_F1'),
       '2025-06-01', '2025-03-01', '2027-06-30', 202503;

-- Projects
CREATE TABLE [core].[Projects] (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Code VARCHAR(50), Name VARCHAR(500), Description NVARCHAR(MAX),
    Id_Program UNIQUEIDENTIFIER NOT NULL,
    IsActive BIT DEFAULT 1, SortOrder INT DEFAULT 0, IsDeleted BIT DEFAULT 0,
    CreationDate DATETIME DEFAULT GETDATE()
);
INSERT INTO [core].[Projects] (Code, Name, Id_Program)
SELECT 'LEG-PRJ-A', N'Legacy project A', (SELECT TOP 1 Id FROM [core].[Programs] WHERE Code = 'LEGACY-PROG-001')
UNION ALL
SELECT 'LEG-PRJ-B', N'Legacy project B', (SELECT TOP 1 Id FROM [core].[Programs] WHERE Code = 'LEGACY-PROG-001');

-- Initiatives
CREATE TABLE [core].[Initiatives] (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Code VARCHAR(50) UNIQUE, Name VARCHAR(500), Description NVARCHAR(MAX),
    Id_OwnerUser UNIQUEIDENTIFIER, StartDate DATE, EndDate DATE,
    IsActive BIT DEFAULT 1, IsDeleted BIT DEFAULT 0
);
INSERT INTO [core].[Initiatives] (Code, Name) VALUES ('LEG-INIT-1', N'Legacy initiative one');

-- CostPlanning_Facts (small fixture: 3 months × 2 programs × 5 XBS = 30 rows)
CREATE TABLE [facts].[CostPlanning_Facts] (
    Id UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    Id_XBS_Objects_1 UNIQUEIDENTIFIER NULL, Id_XBS_Objects_2 UNIQUEIDENTIFIER NULL,
    Id_XBS_Objects_3 UNIQUEIDENTIFIER NULL, Id_XBS_Objects_4 UNIQUEIDENTIFIER NULL,
    Id_XBS_Objects_5 UNIQUEIDENTIFIER NULL,
    XBS_Mask_1 VARBINARY(16), XBS_Mask_2 VARBINARY(16),
    XBS_Mask_3 VARBINARY(16), XBS_Mask_4 VARBINARY(16), XBS_Mask_5 VARBINARY(16),
    Id_Time_Month BIGINT, Id_Program UNIQUEIDENTIFIER, Id_UnitMeasure INT,
    planned FLOAT, actual FLOAT, balance FLOAT,
    reserved FLOAT, reserved_2 FLOAT, reserved_3 FLOAT, reserved_4 FLOAT,
    forecast_1 FLOAT, forecast_2 FLOAT, forecast_3 FLOAT
);
INSERT INTO [facts].[CostPlanning_Facts] (Id_XBS_Objects_1, Id_Time_Month, Id_Program, Id_UnitMeasure, planned, actual, balance)
SELECT TOP 30
    (SELECT TOP 1 Id FROM [facts].[XBS_Objects] ORDER BY NEWID()),
    202501 + (ABS(CHECKSUM(NEWID())) % 3),
    (SELECT TOP 1 Id FROM [core].[Programs] ORDER BY NEWID()),
    1,
    1000 + (ABS(CHECKSUM(NEWID())) % 5000),
    500 + (ABS(CHECKSUM(NEWID())) % 4000),
    200 + (ABS(CHECKSUM(NEWID())) % 1000)
FROM sys.tables CROSS JOIN sys.columns;

PRINT 'Mock legacy DB Cost_Offhighway_Test_Mock created with:';
SELECT 'Sites' AS tbl, COUNT(*) AS n FROM [core].[Sites] UNION ALL
SELECT 'Currencies', COUNT(*) FROM [core].[Currencies] UNION ALL
SELECT 'ProgramStatuses', COUNT(*) FROM [core].[ProgramStatuses] UNION ALL
SELECT 'ProjectClasses', COUNT(*) FROM [core].[ProjectClasses] UNION ALL
SELECT 'ProjectScenarios', COUNT(*) FROM [core].[ProjectScenarios] UNION ALL
SELECT 'UnitMeasures', COUNT(*) FROM [core].[UnitMeasures] UNION ALL
SELECT 'Dim_Time', COUNT(*) FROM [facts].[Dim_Time] UNION ALL
SELECT 'XBS_Objtype', COUNT(*) FROM [facts].[XBS_Objtype] UNION ALL
SELECT 'XBS_Objects', COUNT(*) FROM [facts].[XBS_Objects] UNION ALL
SELECT 'Programs', COUNT(*) FROM [core].[Programs] UNION ALL
SELECT 'Projects', COUNT(*) FROM [core].[Projects] UNION ALL
SELECT 'Initiatives', COUNT(*) FROM [core].[Initiatives] UNION ALL
SELECT 'CostPlanning_Facts', COUNT(*) FROM [facts].[CostPlanning_Facts];
GO
