# Reddit post — r/Angular (origin story, self-deprecating)

**Subreddit**: r/Angular (1.4M members, peak activity 14-18 UTC weekdays)

**Flair**: `Discussion` (most likely to get comments). NOT `Help wanted` (wrong vibe), NOT `News` (looks promotional).

**Posting window**: Tuesday 14-16 UTC (Wed morning for US, afternoon EU) — historically the best slot for r/Angular based on top-of-week posts hitting the front page.

**Tone**: self-deprecating, technical, no marketing copy, no link in the first paragraph. The link goes at the bottom as "if anyone wants the deeper write-up". Reddit hates promotional posts; this format gets past the filter because it reads as genuine experience-sharing.

**Title format that performs**: "I built X over Y years, here's what I'd do differently". The "what I'd do differently" hook is what Redditors will click — it's the inverse of the usual "look at my project" post.

**Do NOT**:
- Link directly in the title or first 2 paragraphs
- Use marketing words ("revolutionary", "game-changer", "best-in-class")
- Mention pricing
- Add screenshots / GIFs (text-only performs better on r/Angular for discussion posts)
- Reply with corporate-sounding messages — keep replies short, conversational, and honest

---

## Title

I spent 5 years building a metadata-driven Angular framework instead of using Retool. Here's what I'd do differently.

## Body

5 years ago we were building enterprise back-office CRUD apps with hand-written Angular and burning 80% of our time on boilerplate — list pages, edit forms, validation, lookups, the same pattern 200 times. We evaluated Retool, Refine, Budibase. Each one solved the boilerplate problem and created two new ones: vendor lock-in (you can't take your config and run elsewhere), and a hard ceiling we'd inevitably hit (custom widget A works, custom widget B requires their commercial plan).

So we built our own thing: SQL schema → metadata tables → runtime that generates Angular components.

What worked, after 5 years and ~140 routes in production:

1. **Picking metadata-driven over codegen.** Other people in this space (JHipster, ABP) generate `.ts` files. We generate metadata rows; the runtime reads them. Means we never have to "regenerate" — change a SQL schema, hit the scaffold endpoint, the running app picks up the new shape on the next metadata-cache invalidation.

2. **Treating Angular as the escape hatch.** The 80% of screens that are obvious from the schema are auto-generated; the 20% that need custom interaction are 100% Angular components you write by hand. No proprietary DSL, no "you can only use our widgets". This was non-obvious at year 1.

3. **One in-memory metadata snapshot.** We tried per-component metadata fetches initially. Killed the perf. The snapshot is ~2MB for our biggest customer, fetched once at boot, invalidated on change. Worth the memory.

What I would do differently:

1. **Start with PostgreSQL, not SQL Server.** MSSQL is the most pleasant DBMS we support but PG is where modern .NET data tooling lives and the cloud cost curve goes.

2. **Pick a JSON schema for dashboard JSON in year 1.** We let it emerge. Now we have 4-year-old dashboards using `chartType` and new ones using `archetype.chart`, and a designer-side migration we maintain forever.

3. **Linux installer in year 1, not year 5.** Half the prospects asking to evaluate didn't have a Windows server, and we gave them a multi-week setup story instead of a `curl install.sh | sudo bash`. Cost us deals we'll never know about.

4. **Write the codebase RAG chatbot earlier.** Saving 2 weeks of orientation per new dev pays back in the first hire.

The biggest pattern I've seen people get wrong in this space: building a framework that's good at the 80% AND tries to handle the 20%. The 20% always wins. Build a framework that handles 80% cleanly and gets out of your way for the rest.

Curious what others here have hit when going the metadata-driven route vs sticking with vanilla Angular. The platform-vs-component tradeoff is the same everywhere — back-office CRUD, eComm checkout, fintech KYC forms — but the cliff drops in different places.

(Edit: a few people DM'd asking for the long version — wrote it up here: https://wuic-framework.com/blog/why-metadata-driven-not-retool. Self-hosted, free demo, no signup wall.)

---

## Reply playbook

Standard reply patterns for the comments that WILL come:

**"Why not just use Retool / Refine / X?"**
> Fair question. The big one for us was: when our schema has 800 columns across 140 routes, a hosted SaaS becomes a bottleneck (their migration tooling vs ours, their permission model vs ours, their pricing for that many users). The math flips around 50+ routes. Below that, Retool wins on time-to-first-screen.

**"How is this different from JHipster / ABP / Yeoman generators?"**
> Codegen vs runtime metadata. Codegen tools generate `.ts` files that you maintain. We generate `.sql` rows that the runtime reads. Changing a column type doesn't require regenerating files; the cache invalidates, the running app picks up the new shape. The trade-off: harder to "eject" from our runtime than to "eject" from generated source you own.

**"Is this open source?"**
> Closed source, but the demo is free and unauthenticated. The three apps we ship on top (CRM, e-invoicing, fleet management) are free to install and self-host. Source-available + non-recompile-required for those three. Framework itself is commercial for prod use, free for dev / eval / personal.

**"What does the metadata schema look like?"**
> 11 tables. The two core ones are `_metadati__tabelle` (one row per route) and `_metadati__colonne` (one row per column, ~30 fields covering type / validation / formatting / lookup / permissions). The other 9 cover styles, conditions, authorizations. Wrote a deep-dive on the scaffolder here: https://wuic-framework.com/blog/sql-table-to-crud-form-in-30-seconds

**Trolls / "this is just X with extra steps":**
> Don't engage. Reddit's downvote system handles them.
