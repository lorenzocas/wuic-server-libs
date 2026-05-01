---
title: "Why we built a metadata-driven Angular framework instead of using Retool"
slug: why-metadata-driven-not-retool
date: 2026-05-01
author: Lorenzo Castrico
description: "Honest origin story behind WUIC: the moment Retool stopped scaling for our team, the tradeoffs we weighed, and what we did instead."
tags: angular, metadata-driven, retool, low-code, framework
---

When you start a B2B project and someone says *"we'll use Retool, it's faster"*, they're usually right. For the first three internal tools, they always are. Drag-and-drop panels over a Postgres database, an SSO connector, a couple of approval flows — done in two afternoons. We were that team. For a year and a half, we shipped real value through Retool dashboards.

This is the story of why we eventually stopped, and why we ended up building [WUIC](/) — a closed-source, metadata-driven Angular framework — instead of switching to one of the obvious open-source alternatives.

## The wall

Three things happened in the same quarter that made Retool stop feeling like a good fit:

**1. The dashboards became the product.** What started as internal admin panels grew into client-facing CRM screens. Customers saw them, customers complained about them. Suddenly we needed pixel-level control over forms, custom validation messages our designer cared about, dark mode that actually matched the rest of our brand, mobile views that didn't look like a Retool dashboard squashed into a phone.

**2. The bill scaled with users, not with value.** Retool's per-end-user pricing is generous when 8 people log in. It's painful when 800 do. Our usage curve was about to flip from "internal tools" to "operations platform served to the customer", and the math stopped working.

**3. We hit the customisation cliff.** Once you have JS code in Retool that talks to JS code in Retool that talks to JS code in Retool, the cliff is real. You're writing a frontend inside a frontend, with no IDE that understands the bindings, no version control that diffs cleanly, no CI that runs. Code review becomes "look at this screenshot of the canvas". We've been there. It's not where you want to live.

So we evaluated alternatives.

## What we considered

The shortlist was the usual: **[Refine](https://refine.dev)** (React framework), **[Budibase](https://budibase.com)** (open-source low-code platform), **[AppSmith](https://www.appsmith.com)** (open-source Retool clone). Each had something we liked.

Refine in particular is technically excellent — if your team is React-fluent and wants a hand-written admin UI with full code review, it's a great pick. The reason we passed wasn't the framework, it was the math: we'd estimated 18 months of full-time work to reach the feature surface our existing Retool screens already covered (workflow engine, report builder, dynamic permissions, multi-tenant audit log, mobile auto-layout). Eighteen months of building those wheels instead of the actual product.

Budibase and AppSmith were closer to what we wanted in spirit — drag-and-drop, but self-hosted and open-source — but each had its own ecosystem to learn, and migrating data + auth + workflows from Retool to either of them was a non-trivial port. The cliff would just move; we'd hit it again at a different angle.

We also considered **[just keep paying Retool more](https://retool.com/pricing)**. We'd be lying if we said we didn't crunch those numbers. The blocker there was less the price and more the customisation cliff: even with the Enterprise tier, we couldn't ship the UI quality our customers were starting to expect.

## The insight

Around that time we noticed something about our Retool screens. Almost every form, list and dashboard was *implicit metadata*. The columns came from the database. The validation rules came from the column types and the business constraints. The buttons came from the route's permitted actions. The lookup widgets came from foreign keys.

We were typing all this into Retool's UI by hand. Then typing similar things into our backend's input validation. Then typing similar things into our API documentation. Three places, slightly inconsistent, drifting over time.

The thought was: **what if the metadata was the source of truth, and the UI was a pure function of it?**

Not "low-code" — there's still real code to write, and we wanted that. *Less* code. Specifically: zero hand-written boilerplate for the 80% of screens that are obvious from the schema, and full Angular freedom for the 20% that aren't.

## What WUIC actually is

WUIC is two databases worth of metadata + a runtime that turns it into a working Angular app:

- A **routes table** describing every entity in your domain — name, table, default permissions, default form layout, anything that's true of the entity as a whole.
- A **columns table** describing every field — type, label, validation rules, lookup target, visibility per role, default styling, callbacks.

Given those, the runtime renders:

- Auto-CRUD list pages with sort/filter/group/inline-edit out of the box.
- Edit forms with the right widget per type (text, lookup, file upload, rich text, date with locale formatting, …).
- A dashboard designer where you drag widgets onto a canvas, bind them to a route, save — the dashboard goes live.
- A report designer that produces PDF + Excel from the same metadata.
- A workflow engine where each step is a route, and the graph between them is more metadata.
- A mobile responsive layout that derives card stacks from the same column metadata that drives desktop tables.
- An in-product RAG chatbot that answers questions about the data + the framework itself ([more on that in the next post](/blog/rag-chatbot-with-claude-and-bge-m3)).

You can drop down to plain Angular components anywhere — `<wuic-list-grid>` is a regular standalone component, you can wrap it, replace it, override its template. We deliberately kept the framework at "code-saver" level rather than "low-code platform". Less typing, full developer control.

## What's not in the box

It's important to be honest about what *isn't* a good fit for this approach.

**One-off internal panels with weird datasources.** If you need to wire a button on a dashboard to a Slack webhook, that's a Retool thing. WUIC assumes your data lives in SQL. We have integrations, but the framework's heart is database-driven.

**Teams without a SQL expert.** Metadata is conceptually simple but it lives next to your schema. If nobody on the team is comfortable opening SQL Server Management Studio, the value proposition collapses.

**Greenfield mobile-first products.** We do mobile, and it works, but a product where mobile is the primary surface should probably start mobile-first. WUIC starts desktop-first and reflows down.

## The 18 months in retrospect

It's been roughly 18 months since we cut the first Retool screen. The trade-off, blunt:

- **Throughput on new screens** went up. The 80% of screens that are obvious from the schema take minutes, not days.
- **Throughput on the *first* screen** went down. There's now a framework to learn, conventions to follow, metadata to populate. A non-developer can't ship in a single afternoon any more.
- **Customisation cliff** shifted from "Retool's JS sandbox" to "Angular and TypeScript". Higher floor, much higher ceiling. Code review works. Git diff works. CI works.
- **Per-user cost** dropped to zero. Per-developer license, fixed annual. The math now scales.

If you're early-stage and doing 5 internal panels with 10 internal users, **we'd still tell you to use Retool**. It really is faster. The break-even point in our case was around screen #15 + first customer-facing dashboard.

If you're past that, and you want to learn about the alternatives we considered side-by-side — including how WUIC compares against Refine, Budibase, and AppSmith feature-by-feature — there's a [comparison page](/comparison) for that, and the [feature gallery](/gallery) shows the framework actually doing things. Or [skip the talking and try it](/sandbox).

The next post in this series digs into one specific feature — the [in-product RAG chatbot](/blog/rag-chatbot-with-claude-and-bge-m3) — and why we ended up building one from scratch when "just integrate ChatGPT" would have shipped in a week. Spoiler: it's about citations.
