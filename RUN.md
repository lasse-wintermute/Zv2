# Running Zv2 locally

**Quickest way: double-click `start-zv2.vbs`** — starts MariaDB, the PHP API and the
Vite client with no visible windows, then open http://127.0.0.1:5273. To stop them,
end `php.exe`, `node.exe` and `mysqld.exe` in Task Manager (stop MariaDB gracefully
via `mysqladmin -u root shutdown` if you care about the data — see below).

> **Shut MariaDB down gracefully** (`mysqladmin -u root shutdown` or the XAMPP
> control panel Stop button) — killing the process can corrupt the InnoDB
> system tablespace and the whole server will refuse to start.

## First-time database setup

Start XAMPP MariaDB, then from the Zv2 directory run:

```powershell
& 'C:\xampp\php\php.exe' database\install.php
```

This creates the standalone `zv2` database, generates its 50×50 wasteland, and
applies every `database/migrations/*.sql` file in name order (so a fresh install
already has the full Zombilization-derived tech/upgrade tree). Connection settings
can be overridden with `ZV2_DB_HOST`, `ZV2_DB_PORT`, `ZV2_DB_USER`, `ZV2_DB_PASS`,
and `ZV2_DB_NAME`.

To upgrade an existing database, apply new migrations manually, e.g.:

```powershell
Get-Content database\migrations\2026-07-17-zombilization-progression.sql | & 'C:\xampp\mysql\bin\mysql.exe' -u root zv2
```

## Start the API

```powershell
& 'C:\xampp\php\php.exe' -d display_errors=0 -S 127.0.0.1:8124 -t .
```

## Start the client

In a second terminal:

```powershell
npm.cmd run dev
```

Open [http://127.0.0.1:5273](http://127.0.0.1:5273).

