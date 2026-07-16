# Running Zv2 locally

## First-time database setup

Start XAMPP MariaDB, then from the Zv2 directory run:

```powershell
& 'C:\xampp\php\php.exe' database\install.php
```

This creates the standalone `zv2` database and generates its 50×50 wasteland.
Connection settings can be overridden with `ZV2_DB_HOST`, `ZV2_DB_PORT`,
`ZV2_DB_USER`, `ZV2_DB_PASS`, and `ZV2_DB_NAME`.

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

