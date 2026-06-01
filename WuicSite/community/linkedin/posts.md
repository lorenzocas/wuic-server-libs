# LinkedIn post drafts — WUIC framework launch

10 post allineati uno-a-uno con il calendario di pubblicazione dev.to (1
articolo al giorno dal 31 maggio al 9 giugno 2026). Ogni post linka
**all'URL canonico su wuic-framework.com**, non a dev.to — vogliamo il
SEO juice sul sito ufficiale, dev.to fa solo da volume amplifier.

**Tono**: tecnico-onesto, niente buzzword, prima persona ("we built…"),
una sola CTA per post. Lunghezza: 800-1200 char (LinkedIn taglia il
preview a ~210 char senza "see more" — i primi 2-3 paragrafi devono
contenere il hook).

**Tag canonico per tutti**: `#angular #dotnet #lowcode` + uno specifico
per il topic dell'articolo.

**Cadenza**: 1 post/giorno alle 09:30 Europe/Rome (mezz'ora dopo il
reminder dev.to). LinkedIn ha il peak engagement EU tra 09:00-11:00.

---

## Day 1 — 2026-05-31 (origin story)

🎯 Why we built a metadata-driven Angular framework instead of using Retool.

5 years ago we hit a wall: building enterprise back-office CRUD apps with hand-written Angular was burning 80% of our time on boilerplate. We tried Retool, Refine, Budibase. Each one solved the boilerplate problem and created two new ones — vendor lock-in, and a ceiling we'd inevitably hit.

So we built WUIC instead. It's not low-code — there's still real code to write. It's *less* code: zero hand-written boilerplate for the 80% of screens that are obvious from the schema, full Angular freedom for the 20% that aren't.

The origin story, what we considered, and what we'd do differently — full post here:
👉 https://wuic-framework.com/blog/why-metadata-driven-not-retool

#angular #dotnet #lowcode #framework #retool

---

## Day 2 — 2026-06-01 (RAG chatbot)

🤖 Building an in-product RAG chatbot with Claude + BAAI/bge-m3.

A confident hallucination in a developer tool is worse than no answer. So when we built the in-product chatbot for our framework's codebase, the constraint was: every claim must cite a real file path the user can click to verify.

This post is the engineering story — hybrid retrieval (BM25 + bge-m3 embeddings), a LoRA-fine-tuned cross-encoder, Italian query translation, and why we picked Claude over OpenAI for synthesis. Including the eval numbers and the bits that didn't work.

👉 https://wuic-framework.com/blog/rag-chatbot-with-claude-and-bge-m3

#angular #ai #rag #llm #claude

---

## Day 3 — 2026-06-02 (SQL to CRUD scaffolding)

⚡ From SQL `CREATE TABLE` to working CRUD UI in 30 seconds.

Write a `CREATE TABLE`. Hit one endpoint. Refresh the browser. There's a working list page, an edit form, validation rules pulled from the schema, FK columns auto-rendered as lookup widgets, sortable columns, mobile responsiveness — and you wrote no Angular.

Sounds like every low-code platform's marketing pitch. The post explains exactly *what* the scaffolder inspects from the schema, what it *doesn't* try to do (we picked our battles), and where the boundary lives between "auto-generated" and "you tweak this by hand".

👉 https://wuic-framework.com/blog/sql-table-to-crud-form-in-30-seconds

#angular #sqlserver #lowcode #scaffolding #database

---

## Day 4 — 2026-06-03 (mobile auto-layout)

📱 Zero-config mobile layout for enterprise back-office apps.

Common complaint about back-office tools: "great on a 27-inch monitor, unreadable on a phone."

We made WUIC's list-grid and edit-form auto-swap to mobile layouts below 768px — no per-screen template, no per-column responsive flag. Desktop table becomes vertical card stack, two-column form becomes single column. Zero metadata change, zero per-screen TypeScript.

The post walks through the split between runtime swap (TS, for the PrimeNG table) and CSS-only fallback (for the edit form), and why we picked different mechanisms for each.

👉 https://wuic-framework.com/blog/mobile-first-auto-layout-zero-config

#angular #primeng #responsive #mobile #lowcode

---

## Day 5 — 2026-06-04 (Linux deploy)

🐧 WUIC now runs natively on Linux. One binary, four DBMS options.

The same `WuicCore.dll` runs on Windows/IIS and on Ubuntu/Kestrel. The only thing that changes for non-MSSQL backends is a satellite provider DLL loaded at startup.

This post walks through the one-liner installer (`curl install.sh | sudo bash`), what each numbered script does on Linux (.NET 10 + systemd + nginx), and the four DBMS variants — SQL Server, MySQL, PostgreSQL 16, Oracle Free 23ai via Docker. Same test suite passes on all four; the metadata layer doesn't care which one is underneath.

👉 https://wuic-framework.com/blog/native-linux-deployment-four-dbms

#dotnet #linux #ubuntu #postgres #mysql

---

## Day 6 — 2026-06-05 (designer drag-and-drop)

🎨 Drag-and-drop dashboard designer that writes JSON, not Angular code.

Most low-code platforms compile dashboards to opaque binaries or per-tenant Angular bundles. WUIC ships a designer that writes plain JSON to a single column (`dom_board.boardcontent`), plus optional CSS in a sibling table. Diff-able, grep-able, editable by hand.

The post explains the JSON shape, the palette extension model (register a custom component, it shows up in the designer automatically), the CSS attachment story via `dom_board_sheet`, and the one trade-off we made — Angular template strings embedded in the JSON.

👉 https://wuic-framework.com/blog/dashboard-designer-drag-and-drop-metadata

#angular #lowcode #dashboard #designer #json

---

## Day 7 — 2026-06-06 (reports)

📊 Reports without per-report TypeScript, per-report backend code, or per-report auth.

Reporting in most enterprise apps is a tiny project per report: stored procedure, custom controller, viewer wiring, manual filter context, manual permission checks.

WUIC's report engine ties a Stimulsoft `.mrt` file to a metadata route. Drop the file in the right folder, add a menu entry pointing at the route's viewer — the framework's auth, filter context, per-column permissions, and i18n all apply automatically because the data source IS the route's CRUD endpoint.

👉 https://wuic-framework.com/blog/building-reports-without-code-sql-view-to-mrt

#reports #sql #lowcode #stimulsoft #dotnet

---

## Day 8 — 2026-06-07 (CrmApp free)

🚀 CrmApp: a free self-hosted CRM you install in 10 minutes.

First of three free apps we ship on top of WUIC. Customer pipeline, opportunities, activities, role-based dashboards — no subscription, no per-seat fee, no data going to a third-party cloud.

The download is a single ZIP. Self-host on your own SQL Server. Free unless you recompile (then you're a customer who needs a commercial license — fair trade).

👉 https://wuic-framework.com/blog/crmapp-free-crm-on-wuic

#crm #opensource #selfhosted #sales #wuic

---

## Day 9 — 2026-06-08 (FatturazioneElettronica free)

🇮🇹 FatturazioneElettronica: a free Italian e-invoicing app with SDI integration.

Second free app on WUIC. Invoice editor + CADES-BES signature + XSD validation + four interchangeable SDI providers (DirectPec free, ArubaPec / FatturePec / PecIt commercial) + conservazione pipeline.

Free distribution. Bundling rule is MIT-friendly. Runs on your own SQL Server. The post covers the SDI provider abstraction, what we do at edge cases (rejected invoices, late acknowledgements), and where the commercial providers add value over the free DirectPec.

👉 https://wuic-framework.com/blog/fatturazione-elettronica-free-italian-einvoicing

#fatturapa #sdi #fintech #compliance #italy

---

## Day 10 — 2026-06-09 (FlottaMezzi free)

🚛 FlottaMezzi: a free fleet management app — geolocation, maintenance deadlines, cost rollups.

Third and last of the free apps shipped on WUIC. Vehicle inventory + drivers + service history + maintenance deadlines + fuel/insurance/tax cost rollups + live geolocation + map view of the active fleet.

The post explains the geolocation pipeline (we don't ship the GPS tracker hardware — there's a small ingestion service that accepts standard NMEA/Traccar formats), and the maintenance-deadline alert that fires before things become urgent.

👉 https://wuic-framework.com/blog/flottamezzi-free-fleet-management

#fleetmanagement #iot #geolocation #opensource #wuic

---

## Background / always-on posts (extra slots, week 2+)

### Demo asset post — designer drag-drop GIF (use mid-week)

🎬 Watch a dashboard get built in 90 seconds.

[Embed: https://wuic-framework.com/assets/wuic-framework-docs/screenshots/designer__designer-advanced__desktop.gif]

This is the WUIC dashboard designer. Drag a chart from the palette, drop on the canvas, pick the route the chart should pull data from, configure axis labels in the property panel, save.

The output isn't a per-tenant Angular bundle. It's plain JSON in a database column. Edit it, diff it, version-control it.

Full write-up + try it on the live demo:
👉 https://wuic-framework.com/blog/dashboard-designer-drag-and-drop-metadata
👉 https://wuic-framework.com/sandbox

#angular #lowcode #dashboard #designer

### Thought leadership — "naming discipline is the hardest part" (week 3)

Hot take: the hardest problem in building a metadata-driven framework isn't the runtime, the cache, or the permission system. It's **naming discipline**.

After 140 scaffolded routes and 1,800 metadata columns, "what does `mc_extra_2` mean?" became an actual support ticket. We ended up writing an internal style guide for column names. Boring. Important.

Three rules we settled on, after the third time we renamed a column and broke a downstream `.mrt` file:

1. Renames are migrations, not edits. Every column rename triggers a sweep of `_metadati__menu`, `.mrt` files, and dashboard JSON.
2. Prefix tells you the lifecycle. `mc_` (metadata column) is permanent contract; `_audit_` is operational. Mix them, regret it.
3. Document the boundary between "auto-generated from schema" and "you tweak this by hand" *in code comments*, not in a separate doc. The doc rots.

#metadata #framework #angular #lowcode #engineering

### Engineering retro — "what we'd do differently" (week 4)

What we'd build differently if we restarted WUIC today, 5 years later:

1. Start with PostgreSQL, not SQL Server. MSSQL is the most pleasant of the four DBMSs we support, but PG is where the modern .NET data tooling lives and where the cloud cost curve goes.

2. Pick a JSON schema for the dashboard JSON earlier. We let the schema emerge organically. Now we have 4-year-old boards that don't match the new property names and a designer-side migration we have to maintain.

3. Ship the Linux installer in year 1, not year 5. Half the customers asking to evaluate WUIC didn't have a Windows server, and we gave them a multi-week setup story instead of a one-liner.

4. Write the codebase chatbot earlier. The framework is 200k LOC; the RAG chatbot we shipped this year saves new devs about 2 weeks of orientation. It would have been worth it at year 2.

What would you build differently in your framework / SaaS / library, in hindsight?

#framework #engineering #dotnet #lowcode
