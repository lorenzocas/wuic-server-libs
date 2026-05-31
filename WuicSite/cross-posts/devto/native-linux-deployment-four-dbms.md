---
title: "WUIC on Linux, natively: one binary, four DBMS choices, one shell installer"
published: false
description: "WUIC ships a native Linux deploy on Ubuntu 22.04: .NET 10 + Kestrel + systemd + nginx, with provider drop-in for SQL Server, MySQL, PostgreSQL and Oracle. Same WuicCore.dll on Windows/IIS and Linux — for non-MSSQL DBMSs the runtime loads one satellite provider DLL alongside it. This post walks through the install one-liner, what each DBMS variant actually does on Linux, and what's still Windows-only."
tags: linux, dotnet, database, mysql
canonical_url: https://wuic-framework.com/blog/native-linux-deployment-four-dbms
---

We shipped WUIC originally as a Windows / IIS stack: SQL Server, ASP.NET Core under the AspNetCoreModuleV2 hosting bundle, the whole thing managed by IIS. That's still a supported topology and the one most existing customers run. But .NET 10 is cross-platform, our metadata layer talks to four different DBMS providers, and increasingly the customers asking to evaluate WUIC don't have a Windows server lying around. So we sat down and made Linux a first-class target.

Today there's a single shell one-liner that installs WUIC on a stock Ubuntu 22.04 box, with your choice of database. This post walks through what the installer does, what each DBMS option means in practice on Linux, and what's deliberately still Windows-only.

## The one-liner

```bash
curl -fsSL https://wuic-framework.com/install.sh | sudo bash -s -- \
    --dbms mssql --admin-password 'YourS3cret!' --hostname app.example.com
```

That's the whole install. End-to-end it runs about 15–25 minutes on a 4-vCPU box, most of which is `apt install` for the .NET runtime and (optionally) `pip install` for the Python RAG stack. Everything else is configuration.

When the script exits, you have:

- The .NET app running under **Kestrel** at `127.0.0.1:5000`, managed by `systemd` (`wuic-core.service`).
- Your chosen **DBMS** listening on its loopback port, managed by its own systemd unit.
- A **Python RAG server** (FastAPI + uvicorn + a LoRA-tuned reranker) at `127.0.0.1:8765`, managed by `wuic-rag.service`. Skipped if you pass `--no-rag`.
- **nginx** on `:80` (and `:443` with `--with-tls`), serving the Angular static assets directly and proxying `/api/`, `/hubs/`, `/rag/` to the right backend.
- Configuration in `/etc/wuiccore/secrets.env`, loaded by systemd at unit start. The `appsettings.json` on disk stays untouched — Linux-specific values are injected via env vars.

Idempotent. Re-running the one-liner on a finished box skips the already-done steps and updates only what changed.

## What's in the box

The installer is structured as numbered bash scripts under `scripts/linux/`:

```
00-prereqs.sh                 OS package guardrails (apt update, curl, gnupg…)
10-install-dotnet.sh          .NET 10 runtime + ASP.NET Core
20-install-mssql.sh           SQL Server 2022 Express
21-install-mysql.sh           MySQL 8
22-write-secrets-profiles.sh  Generate /etc/wuiccore/secrets.{env,master}
23-install-postgres.sh        PostgreSQL 16 (PGDG)
24-install-oracle.sh          Oracle Database Free 23ai (Docker container)
30-bootstrap-databases.sh     Restore/create the WUIC databases (MSSQL)
31-bootstrap-mysql-databases.sh
33-bootstrap-postgres-databases.sh
34-bootstrap-oracle-databases.sh
35-provision-auth-users.sh    Seed the admin user with --admin-password
40-install-python-rag.sh      torch CPU + transformers + bge-m3 + LoRA adapter
50-publish-app.sh             dotnet publish + drop the artifact under /opt/wuiccore/
60-systemd-units.sh           wuic-core.service, wuic-rag.service, enable + start
70-nginx.sh                   vhost + reverse proxy + (optional) certbot TLS
80-smoke-test.sh              curl /api/health, dotnet --info, mssql/mysql -Q "SELECT 1"
```

`install.sh` (the one-liner) downloads a precompiled tarball, untars to `/opt/wuiccore/`, and runs the scripts above in order, gated by the flags you passed. The numbered scripts are also runnable individually, which is useful when you want to install only the DB (for a dev workstation) or only refresh the .NET app without touching the database (`50` + `60` re-run).

## The four DBMS options

We do **not** ship a different .NET build per DBMS. The same `WuicCore.dll` runs on every variant. MSSQL is the baseline and is built into the main assembly directly; for MySQL, PostgreSQL or Oracle the runtime additionally loads a satellite provider DLL (`mysql.dll`, `postgresql.dll` or `oracle.dll`) that sits next to `WuicCore.dll` in `bin/` and is picked up at startup based on the `dbms` setting in `appsettings.json` (`mssql` / `mysql` / `postgresql` / `oracle`). On Linux, the installer drops the right satellite DLL into `/opt/wuiccore/app/bin/` based on `--dbms`. All four are exercised by the same test suite (~600 metadata-driven tests running against the live backend), so a passing run on one DBMS exercises the same call paths as a passing run on the others. Here's what each one actually means:

### `--dbms mssql` (SQL Server 2022 Express on Linux)

Microsoft ships SQL Server 2022 native for Ubuntu 22.04. The installer adds the Microsoft apt repo, installs `mssql-server`, runs `mssql-conf setup` non-interactively with the auto-generated SA password (stored in `/etc/wuiccore/secrets.master`, mode 0600), binds the listener to `127.0.0.1:1433`, and loads the seeded databases via either `RESTORE DATABASE` from the `.bak` (~2s) or the streaming `.sql` (~25 min) depending on the tarball variant you downloaded.

### `--dbms mysql` (MySQL 8 on Linux)

The path for cost-sensitive cloud deploys (cheap managed MySQL is everywhere). The installer adds Ubuntu's stock MySQL 8 (`apt install mysql-server`), binds to `127.0.0.1:3306`, runs `mysql_secure_installation` equivalents non-interactively, and loads the schema from `dbms/scripts/first-run/*.mysql.sql`. The provider is `mysql.dll`, loaded by the .NET runtime via the same hot-swap mechanism the Windows host uses. The metadata layer, the auto-generated CRUD endpoints and the scaffolder don't have per-DBMS branches — they emit ANSI SQL where possible and call into the provider for the edge cases (paging keywords, JSON column read/write, MERGE semantics).

### `--dbms postgres` (PostgreSQL 16 via PGDG)

Same provider mechanism (`postgresql.dll`). `23-install-postgres.sh` adds the PGDG repo (we need ≥16 because the seeded `pg_dump` files were generated against 16.x), installs `postgresql-16`, binds to `127.0.0.1:5432`, and loads the seeded schemas from `dbms/scripts/first-run/*.postgres.sql`. End state: systemd-managed Postgres, secrets in `/etc/wuiccore/secrets.env`, the .NET app picks up `dbms=postgresql` from the env var and loads the right provider.

### `--dbms oracle` (Oracle Free 23ai via Docker)

Oracle is the awkward one. Oracle Database Free 23ai ships as an `.rpm` targeting OL/RHEL; running it natively on Ubuntu requires `alien` conversion plus glibc/kernel workarounds that Oracle doesn't officially support. So on Linux we run it in Docker, using the community-maintained `gvenzl/oracle-free:23-slim` image (Apache-2.0 wrapper around the official Oracle Free 23ai binaries, distribution governed by Oracle's Free Use License). `24-install-oracle.sh` installs Docker if not present, pulls the image, runs the container bound to `127.0.0.1:1521`, generates the SYSTEM/PDB passwords, and waits for `SELECT 1 FROM DUAL` to succeed. `34-bootstrap-oracle-databases.sh` then loads the seeded schemas. The Windows dev side standardized on the same image (the regeneration scripts under `scripts/regen-firstrun-oracle.ps1` dump from `localhost:1521/FREEPDB1` against it), so the schema we ship is the schema we develop against.

### Combinations

`install-all.sh` also accepts `--dbms both` (mssql + mysql side-by-side) and `--dbms all` (all four side-by-side). Useful when you want one box that can host every variant and switch the active one by env var, typically a test rig.

## What's actually the same across all four

The whole point of the provider-drop-in story is that the application layer doesn't care which DBMS is underneath:

- **CRUD endpoints** are auto-generated from the metadata route once. The same `GET /api/Meta/AsmxProxy/<route>.crudRead` works on every DBMS; the provider translates to whatever SQL dialect is appropriate.
- **The scaffolder** reads `INFORMATION_SCHEMA` (or the Oracle / Postgres equivalent) and produces the same metadata rows. A table scaffolded on Postgres has the same metadata shape as the same table on MSSQL.
- **The metadata cache, the runtime templates, the designer, the dashboard renderer** — these don't know which DB you picked. They read `_metadati__*` and run.
- **The Angular bundle** is identical. Same `WuicSite/wwwroot/` artifact regardless of backend DBMS.

What does change per-DBMS:

- The **satellite provider DLL** loaded alongside `WuicCore.dll` for non-MSSQL backends (and the connection string format in `appsettings.json`).
- The **seed SQL** loaded at first-run: `tutorial-data.mssql.sql` vs `.mysql.sql` vs `.postgres.sql` vs `.oracle.sql`, generated by an internal `dotnet publish -GenerateSqlScripts` script that dumps a reference instance per DBMS. Same data, four dialects.
- **A small set of SQL-builder code paths** for things the DBMSs handle differently (paging keywords, `MERGE` vs `ON CONFLICT`, JSON column read/write). These live in the main assembly for MSSQL and in the satellite DLL for the other three — you don't see them from the app layer.

## What's deliberately still Windows-only

A couple of things didn't come over and probably never will:

- **IIS hosting.** On Linux we use Kestrel + nginx instead. Same .NET app under the hood, different process manager. IIS-specific tooling (`appcmd`, the IIS Manager UI, WinRM remote management) doesn't apply.
- **SQL Server Management Studio integration helpers.** SSMS is Windows-only. The Linux installer ships `mssql-tools18` (sqlcmd, bcp) for the same CLI workflows.

## Tarball variants

The `install.sh` one-liner downloads one of three Linux tarballs, depending on what you ask for:

- `wuic-framework-v<ver>-linux-x64.tar.gz` (runtime, ~600 MB) — pre-compiled `dotnet publish` artifact + Angular bundle + linux installer scripts + DB seed SQL. Default for the operator-running-a-service path.
- `wuic-framework-v<ver>-linux-x64-src.tar.gz` (source, ~80 MB) — the `.cs` and `.ts` source tree, for developers cloning to build locally. Defaults extract to `/opt/wuic-src/` owned by `${SUDO_USER}` so the dev can `dotnet build` without sudo.
- Both, if you don't pass `--demo-only` or `--src-only`. Useful on a single-box dev environment.

Either variant uses the same numbered install scripts and the same systemd units. The difference is whether `/opt/wuiccore/app/` is a pre-built artifact or a `dotnet run --project /opt/wuic-src/...` invocation.

## When Linux is the wrong call

If your shop already has a Windows AD domain and an IIS production environment with PowerShell DSC / Ansible Windows playbooks already configured, the IIS deploy is still the path of least resistance. Linux is the right answer for fresh deploys, cost-sensitive cloud (no Windows licensing), or environments where ops already lives in Linux land. We don't think there's a wrong choice — the application code is the same.

## Try it

The [public demo](https://wuic-framework.com/sandbox) currently runs the Windows/IIS topology. The Linux deploy is what you'd run on your own server. The one-liner is hosted at [`install.sh`](https://wuic-framework.com/install.sh) — read it before piping to bash if that makes you uncomfortable (it's a 700-line script, mostly comments). The tarballs are listed on the [downloads page](https://wuic-framework.com/downloads).

The Linux installer source tree lives in `scripts/linux/` if you want to read each step. The codebase chatbot ([RAG post](https://wuic-framework.com/blog/rag-chatbot-with-claude-and-bge-m3)) can find any specific step by description if you don't want to navigate manually.

Next in this batch of posts: the **wizard architecture** — multi-step forms with conditional branches, all driven by metadata. Subscribe via the RSS feed.
