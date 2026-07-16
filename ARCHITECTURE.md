# Zv2 architecture

Zv2 is a standalone, server-authoritative zombie-survival strategy game. It owns
its frontend, PHP API, game rules, content definitions and MariaDB database.

## Boundaries

1. The server is authoritative for resources, construction, exploration, combat and loot.
2. Runtime code may only load files inside `Zv2/`.
3. The database is `zv2`; no other game database is queried.
4. The browser receives clean JSON and never edits authoritative state locally.

## Data flow

`Vite client → Zv2/api/*.php → Zv2/api/mechanics.php → MariaDB database zv2`

## Main folders

- `src/`: dynamic isometric client and UI
- `api/`: session, JSON endpoints and standalone game mechanics
- `database/`: owned schema and installer/world generator
- `docs/`: API contract

The mechanics intentionally retain familiar civilization concepts—resource growth,
facility levels, construction queues, fog of war, rooms, infected and salvage—but
their implementation and data are native to this project.

