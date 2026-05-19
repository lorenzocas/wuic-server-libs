---
title: "CrmApp: a free CRM you can install in 10 minutes (and own forever)"
slug: crmapp-free-crm-on-wuic
date: 2026-05-15
author: Lorenzo Castrico
description: "CrmApp is the first of three free apps we ship on top of WUIC. Customer pipeline, opportunities, activities, role-based dashboards — no subscription, no per-seat fee, no data going to a third-party cloud. The download is a single ZIP. This post covers what's inside, who it's for, and the licensing rule (spoiler: free unless you recompile)."
tags: crm, free-apps, wuic, self-hosted, sales-pipeline
---

CrmApp is the first of the three **free distributions** we ship on top of WUIC. It runs on your own Windows server, talks to your own SQL Server, and uses the WUIC framework runtime under a bundled host-binding license — which means you don't need to buy anything to run it. The download is a single `<App>-iis-v1.0.0-with-dbs.zip` archive on the [Downloads page](/downloads): unzip, point IIS at the folder, restore the tutorial DB, you're live.

This post covers three things:

1. What's actually inside (features list, real ones — not the marketing version)
2. Who it's for (use cases where it pays off, and use cases where it doesn't)
3. The licensing rule, which is simple but worth stating once clearly

## What's inside

CrmApp is a B2B CRM. Not a marketing automation suite, not a help-desk ticket system — a sales pipeline tool. The shipped database (`CrmApp_Data`) has the entities you'd expect:

- **Customers** (anagrafica clienti) — names, PIVA, addresses, contacts, multi-address support, soft-delete
- **Opportunities** — value, probability, stage, expected close date, owner, history
- **Activities** — calls, meetings, emails attached to a customer or opportunity, with assigned-to and due-date
- **Pipeline view** — kanban board grouping opportunities by stage, drag-and-drop to move them
- **Dashboard** — per-role widgets (sales rep sees their pipeline, sales manager sees the team rollup)
- **User & role management** — `admin_test`, `sales_test`, `readonly_test` seeded out of the box

The UI is metadata-driven (the part of WUIC that scaffolded the CRUD forms from `_metadati__tabelle` / `_metadati__colonne` rows — same engine described in [our earlier post](/blog/sql-table-to-crud-form-in-30-seconds)). Practical consequence: every list page has search, sort, column visibility, filter chips, export to Excel, edit dialog. You don't lose any of that when you add a new field.

What's NOT inside (on purpose):

- No outbound email automation (drips, sequences). If you want SendGrid integration you wire it in via `customCrudHookClass`
- No native phone integration. The `Activities` table has a `phone_number` field, but no Twilio/dialer plugin ships in the free distribution
- No mobile app. The UI is responsive (the framework's `MobileTemplateRenderingService` kicks in on viewport <= 720 px) but there's no Android/iOS native shell

## Who it's for

CrmApp pays off when you check **at least two** of these boxes:

- **You're a small B2B team** (5–50 sales people) and the €15/user/month CRM SaaS bill bothers you more than the once-off setup time
- **Your data must stay on-prem** — regulated industry, PII concerns, customer contract that forbids US-based cloud processors
- **You have an in-house dev who can run a PowerShell script** — not "knows .NET inside out", just "can read INSTALL.md and run `iisreset`"
- **You want to extend the CRM** — add an Italian-specific table (e.g. `commesse`, `intermediari`), add a custom button on the customer list that hits an internal API. This is much easier when the source is `C:\inetpub\wwwroot\CrmApp` than when it's a closed SaaS

It does NOT pay off if you're a 200-person sales org that needs Salesforce-tier integrations (DocuSign, Marketo, native LinkedIn enrichment) or if your IT policy mandates that all line-of-business apps live in a SOC 2-audited cloud you don't operate. Use the right tool.

## How to install (10 minutes, honestly)

1. Download `CrmApp-iis-v1.0.0-with-dbs.zip` from the [Downloads page](/downloads)
2. Unzip into `C:\inetpub\wwwroot\CrmApp`
3. Restore the two `.bak` files in the `db\` folder to your local SQL Server (`CrmApp_Data` + `CrmApp_Metadata`) — `RESTORE DATABASE` from SSMS, takes ~5 seconds each (SQL Server 2022+ for the BAK format)
4. Edit `appsettings.json` and set the two connection strings to your SQL Server instance
5. In IIS Manager: add new site, point to the unzipped folder, set the app pool to **No Managed Code** (this is .NET 10 in-process, the pool isn't loading any CLR)
6. Browse to the URL, log in as `admin_test / Test123!`

That's it. The bundled host-binding license makes the framework runtime authorize itself automatically — no key to copy, no email to send. If you want to switch the SQL provider to MySQL, `appsettings.mysql.json` ships in the same ZIP; just rename it over `appsettings.json` and adjust the connection string.

## The licensing rule — one sentence

> **CrmApp is free as-shipped. If you rebuild the app from source you need a WUIC license** (Developer or Professional tier, see [Pricing](/pricing)).

The reason is mechanical, not commercial: the free distribution is authorized by an embedded `host-binding-license.lic` resource signed against the specific assembly identity of `CrmApp.dll` (strong-name PKT `803e91d55e6d2981`). The moment you recompile `CrmApp.dll` from the source ZIP — even just to bump the version, change a controller, or add a `[Authorize]` attribute — the resulting binary loses the embedded `WUIC.HostBindingLicense` resource (we don't ship the .snk strong-name key or the RSA private key that signs the .lic), so it can't carry the original PKT or the original signature. The runtime falls back to the standard machine-fingerprint license check.

You can still extend CrmApp **without** recompiling the app binary: add new metadata via SQL (rows in `_metadati__tabelle` / `_metadati__colonne`), add Angular components in the wwwroot frontend tree, add scheduled jobs (rows in the `scheduler` table), configure custom action hooks via `appsettings.json:customCrudHookClass`. All of that ships as-is in the free distribution and is applied at runtime by the binary you already have. The line is: **you `dotnet publish` the source ZIP → you need a license**. You change metadata / Angular / SQL only → you don't.

If you're in the second bucket, the download is in `Downloads → Free apps → CrmApp`. If you're in the first, see [Pricing](/pricing) — Developer tier is €600/year and unlocks both the framework source and the right to ship recompiled CrmApp binaries inside your products.
