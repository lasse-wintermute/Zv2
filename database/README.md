# Zv2 database

Zv2 uses its own MariaDB/MySQL database named `zv2`. It does not read from or reference the original Z database.

## Fresh installation

Run `php database/install.php` to create a clean database with the world, facilities, items, recipes and all required tables.

## Restore the exported snapshot

`zv2_dump.sql` is a complete snapshot of the current standalone database, including the current local test saves. Import it with:

```powershell
C:\xampp\mysql\bin\mysql.exe -u root < database\zv2_dump.sql
```

The application defaults to database `zv2` on `127.0.0.1:3306`. Deployment credentials can be supplied through `ZV2_DB_HOST`, `ZV2_DB_PORT`, `ZV2_DB_USER`, `ZV2_DB_PASS`, and `ZV2_DB_NAME`.
