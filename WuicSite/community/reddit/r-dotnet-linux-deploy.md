# Reddit post — r/dotnet (Linux deployment story)

**Subreddit**: r/dotnet (320k members, more receptive to long technical posts than r/Angular)

**Flair**: `Discussion`

**Posting window**: Tuesday or Wednesday 13-15 UTC. r/dotnet is global but the Microsoft-leaning audience is most active during US/EU work hours.

**Why this angle**: r/dotnet has been getting a lot of "we moved off Windows/IIS to Linux/Kestrel" posts in the last 6-9 months — Microsoft's own messaging has been Linux-friendly, and there's appetite for real migration write-ups. This post fits the conversation without being self-promotional.

**Title hook**: focus on the LIVE Linux migration vs IIS, not on the framework. Bury the framework angle in the body.

---

## Title

We made our enterprise CRUD framework run natively on Linux after 5 years of being Windows/IIS-only. Sharing the actual install script.

## Body

We've been shipping a metadata-driven framework (Angular front-end + ASP.NET Core back-end) on Windows / IIS / SQL Server for the last 5 years. Customers like the topology — most existing deployments are stuck-in-IIS-shaped — but the question "do you run on Linux?" has been coming up monthly from new evaluations, and we kept losing those because the answer was "kinda, with effort".

So we sat down and made Linux a first-class deployment target. The end state:

- **One-liner installer**: `curl -fsSL https://wuic-framework.com/install.sh | sudo bash -s -- --dbms mssql --admin-password 'X' --hostname app.example.com`
- **Same .NET binary** as the IIS deploy — the `WuicCore.dll` doesn't know whether it's running under IIS / AspNetCoreModuleV2 or under Kestrel + systemd
- **Same Angular bundle** as the IIS deploy
- **Choice of DBMS**: SQL Server 2022 Express, MySQL 8, PostgreSQL 16, Oracle Free 23ai (last one via Docker container since Oracle doesn't ship native .deb)
- **systemd + nginx + (optional) Python RAG sidecar** for the codebase chatbot

The interesting bits from the actual migration (~3 months engineering, 1 person + reviewers):

1. **The `appsettings.json` stayed untouched.** All Linux-specific config is env vars in `/etc/wuiccore/secrets.env`, loaded by systemd. ASP.NET Core's config layering (`appsettings` overridden by env vars) made this trivial. Two `LicenseValidationService.cs` + `Startup.cs` guards were the only C# changes — both additive, no Windows regressions.

2. **`mssql-server` on Ubuntu 22.04 was the easiest part.** Microsoft's apt repo works exactly the same way `mysql-server` does. The "harder" DBMS was Oracle (alien rpm conversion is a no-go, ended up in Docker via `gvenzl/oracle-free:23-slim`).

3. **The CRLF→LF problem with seed SQL files.** We generate seed SQL files on Windows; they ship with CRLF. On Linux, `sqlcmd` parses them fine UNTIL it hits a 559MB seed file with embedded `'2016-04-05T11:35:26.00000'` datetime literals — and a CR character ends up *inside* the string literal, breaking the parser. Fix: stripped CRs at tarball build time, then realized the upstream generator could just emit LF. Wrote up the latter in case anyone hits the same trap.

4. **systemd vs IIS for `wuic-rag.service`.** The Python RAG sidecar (FastAPI + uvicorn + a bge-m3 LoRA-tuned cross-encoder) was the trickiest unit because it loads ~1.5GB of model weights on cold start. `systemctl restart wuic-rag` had to be slow-and-graceful (3 min timeout) vs `Restart-WebAppPool` semantics. Ended up with `Type=notify` and the Python side calling `sd_notify("READY=1")` once the model is loaded.

5. **What we didn't bring over**: IIS-specific tooling (`appcmd`, IIS Manager UI, WinRM remote mgmt), SSMS integration helpers. On Linux we ship `mssql-tools18` (sqlcmd, bcp) which covers the CLI side, but anyone used to clicking around SSMS will need to retrain.

The install script (700 lines of bash, mostly comments) is at `https://wuic-framework.com/install.sh` if anyone wants to read before they pipe to bash (you should). The numbered scripts under `scripts/linux/` are each runnable individually if you want to install only the DB or only refresh the app.

Genuinely curious what other people running .NET 6/7/8/10 on Linux have hit:
- **systemd-vs-supervisord** for sidecar services?
- **Kestrel-only vs nginx in front** for the static asset story? (We went nginx because we serve the Angular bundle from disk and didn't want Kestrel as a static file server in prod.)
- **DBMS picks** on Linux — anyone moved off MSSQL to PG specifically because of the Linux story?

(If anyone wants the long version of how the framework itself works: https://wuic-framework.com/blog/native-linux-deployment-four-dbms. Self-hosted, free demo, no signup.)

---

## Reply playbook

**"Why not just use Docker for everything?"**
> Considered it. Stayed with apt + systemd for the runtime because (a) some customers have IT policies against running production DBs in containers, (b) cold start of the SQL Server container is 30s vs 4s for the native install. Oracle is the exception because alien-converting the rpm is unsupported.

**"How does this compare to ABP / Orchard Core / X?"**
> Different layer. ABP/Orchard are application frameworks (you write more C#); we're closer to a metadata-driven runtime where most CRUD screens are generated. Comparable to JHipster on the codegen front but runtime-driven instead of codegen-driven.

**"Why .NET 10? Is that stable?"**
> Yeah, .NET 10 LTS shipped November 2025 (we're on the GA release, not preview). The Ubuntu story is mature now — Microsoft's apt packages just work.

**"Will the framework itself be open source?"**
> Closed source today. The 3 apps we ship on top (CRM, e-invoicing, fleet management) are free / source-available. Framework is commercial for prod use, free for dev / eval. Open-sourcing the framework itself has come up internally — no timeline I can commit to.
