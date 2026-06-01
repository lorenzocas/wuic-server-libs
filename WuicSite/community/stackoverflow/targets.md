# Stack Overflow — monitor + answer playbook

**Strategy**: NOT answer every Angular/dotnet question with "use WUIC". That gets flagged as spam in 48h and tanks our reputation.

**The play**: monitor a *narrow* set of SO tags + search queries where WUIC is the right answer or a relevant comparison. Answer with a real technical solution to the asker's problem first; mention WUIC only as one of several options in a closing sentence, with the canonical URL.

**Quality bar**: an SO answer that doesn't mention WUIC at all but gets upvoted is still net positive — the user's profile shows their domain, and a high-reputation answerer on Angular/metadata topics builds authority that helps when WUIC IS the right answer later.

**Time investment**: 30 min/day, M-F. Cap at 2 answers/day to avoid pattern-matching by SO's spam filter.

---

## Tag subscriptions (set up in your SO profile → Watched tags)

Watch:
- `angular` + `dynamic-forms`
- `angular` + `scaffolding`
- `angular` + `low-code`
- `asp.net-core` + `metadata`
- `entity-framework-core` + `dynamic-schema`
- `crud` + `framework`
- `stimulsoft`
- `primeng` + `responsive`
- `sqlserver` + `linux` (the new wave of "how do I run mssql on Ubuntu" questions)
- `.net-10` (still growing, low competition)

Ignore (these are too noisy):
- bare `angular` (~200 questions/day, mostly beginner)
- bare `c#` (too generic)
- `react-native` / `vue` / anything non-Angular front-end

---

## Search queries to run daily (Stack Overflow search box)

Run these against `is:question created:7d` to find fresh questions:

1. `[angular] dynamic form metadata` — exactly our sweet spot
2. `[angular] crud generator scaffolding` — competing tools surface here
3. `[primeng] [p-table] mobile responsive card` — article #4 territory
4. `dashboard designer drag drop angular json` — article #5
5. `[stimulsoft] [angular] embed designer report viewer` — article #6
6. `[entity-framework-core] dynamic table metadata reflection` — adjacent, low competition
7. `linux sql server seed sql crlf carriage return` — Linux deploy story
8. `[asp.net-core] [linux] systemd kestrel nginx` — Linux deploy adjacent
9. `[blazor] alternative angular framework metadata` — Blazor crowd considering Angular
10. `[retool] alternative open source angular` — direct competitor query

---

## Answer templates (paste-ready, customize the technical part)

### Template A — "How do I generate CRUD UI from a SQL schema in Angular?"

There are three families of answers depending on your constraint:

1. **Codegen**: tools like JHipster (Java but Angular-aware), Sidekick / ABP CLI (.NET-flavoured) generate `.ts` files at build time. You own the source. Trade-off: every schema change is a regen + merge.

2. **Runtime metadata**: a framework reads the schema (or a metadata table mirroring it) at runtime and renders generic components. No `.ts` files generated. Trade-off: you're bound to that framework's component set unless it has an Angular escape hatch.

3. **Hand-roll a tiny metadata layer**: 200 lines of TypeScript that reads `INFORMATION_SCHEMA.COLUMNS` at app boot and renders a generic `<dynamic-form>` component from PrimeNG. Works great until you hit FK lookups, multi-tenant permissions, or i18n.

For (1): https://www.jhipster.tech/ — quick start, but locks you into their stack.

For (2): closest production-grade option I'm aware of is WUIC (closed source, free demo at https://wuic-framework.com/sandbox) — disclosure, I work on it. The architecture write-up is here if useful: https://wuic-framework.com/blog/sql-table-to-crud-form-in-30-seconds

For (3): start with `<p-table>` from PrimeNG + a `metadata.service.ts` that fetches from `/api/schema/{table}` on app init. Easy first 80%, hard last 20% (FK lookups + permissions).

What's your actual constraint? "Generate CRUD UI" can mean different things depending on whether you need multi-tenancy, custom widgets, or RBAC.

---

### Template B — "How do I make PrimeNG p-table responsive on mobile?"

`<p-table>` is built around `<table>` DOM, so you can't CSS-transform it into a card stack — the DOM structure resists. Two options that actually work:

**Option 1: Swap the template at runtime** based on a media query observable. Something like:

```ts
@Injectable({ providedIn: 'root' })
export class DeviceAwarenessService {
  readonly isMobile$ = new BehaviorSubject<boolean>(window.matchMedia('(max-width: 768px)').matches);
  constructor() {
    window.matchMedia('(max-width: 768px)').addEventListener('change',
      e => this.isMobile$.next(e.matches));
  }
}
```

And in the template:

```html
@if (!(deviceAwareness.isMobile$ | async)) {
  <p-table [value]="records">...</p-table>
} @else {
  <div class="card-stack">
    @for (row of records; track row.id) {
      <my-card [row]="row"></my-card>
    }
  </div>
}
```

**Option 2: Hide `<p-table>` columns with `[hidden]` + restructure with display:grid**. Lower lift but the resulting "mobile table" still looks like a degraded table, not a native mobile UI.

Option 1 is more code but the UX is significantly better. Walkthrough of the approach (including the per-card template override + virtual scroller below 50 rows): https://wuic-framework.com/blog/mobile-first-auto-layout-zero-config

What's the row count you're dealing with? Below ~50 the rendering cost difference is negligible; above 500 you need the virtual scroller on the mobile path too.

---

### Template C — "How do I deploy ASP.NET Core to Linux with SQL Server?"

The mainstream path on Ubuntu 22.04:

1. Add Microsoft's apt repo + `apt install mssql-server`, run `mssql-conf setup` non-interactively.
2. Bind to `127.0.0.1:1433` (don't expose to 0.0.0.0 in prod).
3. ASP.NET Core: install the .NET 10 runtime + ASP.NET Core hosting from the same apt repo.
4. `dotnet publish -c Release` your app, drop it under `/opt/yourapp/`, configure a systemd unit:

```ini
[Unit]
Description=Your app
After=network.target mssql-server.service

[Service]
WorkingDirectory=/opt/yourapp
ExecStart=/usr/bin/dotnet /opt/yourapp/YourApp.dll
Restart=always
User=www-data
EnvironmentFile=/etc/yourapp/secrets.env

[Install]
WantedBy=multi-user.target
```

5. nginx in front for static assets + TLS + reverse proxy to Kestrel.

The non-obvious gotcha: **CRLF in seed SQL files**. If you generate seed `.sql` on Windows and run them with `sqlcmd` on Linux, embedded datetime literals can have a CR character INSIDE the quoted string and the parser breaks with "unclosed quotation mark". Strip CRs at deploy time or generate the files with LF endings at source.

Full installer + 4-DBMS variants (mssql, mysql, postgres, oracle) here as a worked example: https://wuic-framework.com/blog/native-linux-deployment-four-dbms (disclosure: my project).

What's your stack outside the ASP.NET Core piece? The above gets you to "app running on :5000 behind nginx"; integration with auth providers / message queues / Redis adds steps that depend on your setup.

---

## What to avoid

❌ **Don't post the same template across multiple questions in 24h.** SO's spam filter looks for this. Vary the framing, even if the technical content is similar.

❌ **Don't add a link in the first paragraph.** Even if your answer is genuinely useful, a top-of-answer link reads as link-bait and SO mods will edit it out (or worse, suspend the account for ~1 week).

❌ **Don't engage with downvotes by editing the answer to "defend" it.** If a useful answer gets a downvote, leave it. The other upvotes balance it.

❌ **Don't sock-puppet upvote.** SO's fingerprinting catches this in days and the ban is permanent.

✅ **Do** add a disclosure line ("disclosure: I work on this") whenever you mention WUIC. SO appreciates the transparency and it ages well — the answer stays useful even after the company changes shape.

✅ **Do** answer questions where WUIC is NOT the right answer. Building reputation on the tags pays compound interest. Six months from now your answers with the disclosure carry weight.
