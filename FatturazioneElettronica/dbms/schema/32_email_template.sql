-- ====================================================================
-- 32_email_template.sql  (DB Dati: FatturazioneElettronica_Data)
-- ====================================================================
-- Workflow #23 (Block 5): Tabella email_template per template auto.
--
-- Pattern body: {{placeholder}} per substitution server-side.
-- Placeholders standard:
--   {{numero}}            numero fattura
--   {{anno}}              anno fattura
--   {{data}}              data documento (formato dd/MM/yyyy)
--   {{totale}}            totale documento (formato 1.234,56)
--   {{cliente.ragione_sociale}}  ragione sociale cliente
--   {{cliente.email}}     email cliente
--   {{scadenza.data}}     data scadenza (dd/MM/yyyy)
--   {{scadenza.importo}}  importo scadenza
--   {{giorni_scaduto}}    giorni di ritardo (per solleciti)
--   {{azienda.nome}}      ragione sociale azienda mittente
--
-- Categoria template:
--   FATTURA_EMESSA     invio fattura PDF/XML cliente
--   SOLLECITO_LIEVE    sollecito 0-30gg di ritardo
--   SOLLECITO_GRAVE    sollecito 31-90gg
--   SOLLECITO_LEGALE   sollecito > 90gg (testo formale)
--   GENERIC            template manuale ad hoc
--
-- Pattern framework: scaffold metadata standard + voce menu "Email
-- automatiche" sotto Documenti. La rendering del template (body
-- substitution) e' fatta server-side da `EmailTemplateRenderer`
-- (FatturazioneElettronica/Services/EmailTemplateRenderer.cs).
-- ====================================================================
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

USE FatturazioneElettronica_Data;
GO

IF OBJECT_ID('dbo.email_template', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.email_template (
        id              INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        codice          NVARCHAR(50)  NOT NULL UNIQUE,
        descrizione     NVARCHAR(200) NULL,
        categoria       NVARCHAR(50)  NOT NULL,  -- FATTURA_EMESSA / SOLLECITO_LIEVE / ...
        oggetto         NVARCHAR(300) NOT NULL,
        body_html       NVARCHAR(MAX) NOT NULL,
        attivo          BIT           NOT NULL DEFAULT 1,
        cancellato      BIT           NOT NULL DEFAULT 0,
        data_creazione  DATETIME      NOT NULL DEFAULT GETDATE(),
        data_modifica   DATETIME      NULL,
        CONSTRAINT CK_email_tpl_categoria CHECK (categoria IN (
            'FATTURA_EMESSA','SOLLECITO_LIEVE','SOLLECITO_GRAVE','SOLLECITO_LEGALE','GENERIC'
        ))
    );
    PRINT 'Tabella email_template creata.';
END
ELSE
BEGIN
    PRINT 'Tabella email_template gia esistente, skip CREATE.';
END
GO

-- Seed 4 template di base (idempotente)
IF NOT EXISTS (SELECT 1 FROM dbo.email_template WHERE codice = 'FATTURA_EMESSA_DEFAULT')
INSERT INTO dbo.email_template (codice, descrizione, categoria, oggetto, body_html)
VALUES ('FATTURA_EMESSA_DEFAULT', 'Invio fattura standard', 'FATTURA_EMESSA',
N'Fattura n. {{numero}} del {{data}}',
N'<p>Gentile {{cliente.ragione_sociale}},</p>
<p>in allegato la fattura n. <strong>{{numero}}</strong> del {{data}} per un importo di <strong>{{totale}} €</strong>.</p>
<p>La preghiamo di provvedere al pagamento entro la scadenza indicata.</p>
<p>Cordiali saluti,<br>{{azienda.nome}}</p>');

IF NOT EXISTS (SELECT 1 FROM dbo.email_template WHERE codice = 'SOLLECITO_LIEVE_DEFAULT')
INSERT INTO dbo.email_template (codice, descrizione, categoria, oggetto, body_html)
VALUES ('SOLLECITO_LIEVE_DEFAULT', 'Sollecito cortese (0-30gg ritardo)', 'SOLLECITO_LIEVE',
N'Promemoria pagamento fattura n. {{numero}}',
N'<p>Gentile {{cliente.ragione_sociale}},</p>
<p>verifichiamo che la fattura <strong>n. {{numero}} del {{data}}</strong> di importo <strong>{{scadenza.importo}} €</strong> con scadenza <strong>{{scadenza.data}}</strong> risulta non ancora saldata ({{giorni_scaduto}} giorni di ritardo).</p>
<p>Si tratta probabilmente di una svista. La invitiamo cortesemente a regolarizzare il pagamento o segnalarci eventuali anomalie.</p>
<p>Cordiali saluti,<br>{{azienda.nome}}</p>');

IF NOT EXISTS (SELECT 1 FROM dbo.email_template WHERE codice = 'SOLLECITO_GRAVE_DEFAULT')
INSERT INTO dbo.email_template (codice, descrizione, categoria, oggetto, body_html)
VALUES ('SOLLECITO_GRAVE_DEFAULT', 'Sollecito di pagamento (31-90gg ritardo)', 'SOLLECITO_GRAVE',
N'SOLLECITO — Fattura n. {{numero}} scaduta da {{giorni_scaduto}} giorni',
N'<p>Spettabile {{cliente.ragione_sociale}},</p>
<p>la fattura <strong>n. {{numero}} del {{data}}</strong> di importo <strong>{{scadenza.importo}} €</strong> risulta scaduta dal {{scadenza.data}} ({{giorni_scaduto}} giorni di ritardo) e non ancora saldata.</p>
<p>La invitiamo a provvedere con urgenza al pagamento entro 7 giorni dal ricevimento di questa comunicazione.</p>
<p>In caso di mancato riscontro, ci vedremo costretti ad attivare le procedure di recupero credito.</p>
<p>Distinti saluti,<br>{{azienda.nome}}</p>');

IF NOT EXISTS (SELECT 1 FROM dbo.email_template WHERE codice = 'SOLLECITO_LEGALE_DEFAULT')
INSERT INTO dbo.email_template (codice, descrizione, categoria, oggetto, body_html)
VALUES ('SOLLECITO_LEGALE_DEFAULT', 'Sollecito legale (>90gg ritardo)', 'SOLLECITO_LEGALE',
N'DIFFIDA AL PAGAMENTO — Fattura n. {{numero}}',
N'<p>Spettabile {{cliente.ragione_sociale}},</p>
<p>nonostante i precedenti solleciti, ad oggi non risulta pervenuto il pagamento della fattura <strong>n. {{numero}} del {{data}}</strong> di importo <strong>{{scadenza.importo}} €</strong>, scaduta da <strong>{{giorni_scaduto}} giorni</strong>.</p>
<p>Con la presente intimiamo il pagamento entro 15 giorni dalla ricezione, decorsi i quali — senza ulteriore avviso — affideremo la pratica al nostro legale per il recupero coattivo del credito, con aggravio di spese ed interessi di mora ex D.Lgs. 231/2002.</p>
<p>Distinti saluti,<br>{{azienda.nome}}</p>');

GO

PRINT 'Seed 4 email_template applicato (idempotente).';

SELECT codice, categoria, oggetto FROM dbo.email_template ORDER BY id;
GO
