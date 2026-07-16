# Z v2 — API contract (v1)

The client↔server seam. **Clean JSON only** — storage details remain server-side and
never cross this line. The
client resolves facility `type` → name/icon/footprint from its own catalog
(`src/config.js`), so payloads stay lean and the
backend can be swapped without touching the client.

Base URL: `VITE_API_BASE` (e.g. `http://127.0.0.1:8124`). All responses:
`{ "ok": true, ... }` or `{ "ok": false, "error": "<code>", "message": "<human>" }`.

Resource order is fixed everywhere: **0 water, 1 food, 2 wood, 3 metal, 4 petrol**.

---

## GET /api/stronghold
Returns the current player's stronghold (single-player: the dev user).

```jsonc
{
  "ok": true,
  "apiVersion": 1,
  "serverTime": 1752480000,          // unix seconds, authoritative clock
  "player": { "id": 131, "name": "test" },
  "stronghold": {
    "id": 58,
    "name": "Outpost Zero",
    "level": 3,
    "points": 40,
    "location": { "x": 33, "y": 33 },

    // amount/cap are absolute; perHour is the net rate the client interpolates
    // between polls. Client shows amount + perHour*elapsed, clamped to cap.
    "resources": {
      "water":  { "amount": 320, "cap": 5000, "perHour": 100 },
      "food":   { "amount": 170, "cap": 5000, "perHour": 30 },
      "wood":   { "amount": 40,  "cap": 2000, "perHour": 10 },
      "metal":  { "amount": 55,  "cap": 2000, "perHour": 10 },
      "petrol": { "amount": 8,   "cap": 1000, "perHour": 3 }
    },

    "power":      { "generated": 33, "used": 20 },        // used>generated ⇒ brownout
    "population": {
      "scientists": 3, "technicians": 1, "troops": 0, "scavengers": 2,
      "free": 1, "total": 7, "cap": 12
    },

    // one entry per built facility slot (level > 0).
    // active: 0..1 operational factor. powered: derived from
    // the power grid. The client maps `type` → catalog entry for name/icon/art.
    "facilities": [
      { "slot": 16, "type": 17, "level": 3, "active": 1.0, "powered": true, "staff": 1 },
      { "slot": 0,  "type": 1,  "level": 2, "active": 1.0, "powered": true },
      { "slot": 8,  "type": 9,  "level": 3, "active": 1.0, "powered": true },
      { "slot": 17, "type": 18, "level": 1, "active": 0.0, "powered": false }
    ],
    "world": {
      "phase":"night", "day":3, "nextPhaseAt":1752480400,
      "threat":16, "defense":12,
      "lastRaid":{"day":3,"threat":16,"defense":12,"success":false,"resourceLoss":16,"wounded":"Mara","damage":2}
    },
    "staffing":{"medical":1,"craftDiscount":1,"defense":12}
  }
}
```

### Field notes
- `type` is the Zv2 facility id; presentation names also live in the client catalog
  `language` rows `facility1..46` (EN/DE).
- `perHour` is **net** (production minus upkeep), already power/staff-adjusted by
  the server. Client-side interpolation is cosmetic only; the next poll is truth.
- `powered:false` ⇒ render the building **dark**; `active:0` ⇒ idle/disabled.
- Unknown fields must be ignored by the client (forward-compat).

---

## Session / new game
The **active player lives in a PHP session** (cookie `zv2sid`; all requests send
`credentials: 'include'`). Protected endpoints (`stronghold`, `facility`, `map`,
`build`) answer **401 `{ok:false, error:"no_player"}`** when no game is in progress —
the client turns that into the start screen.

```jsonc
GET  /api/session                 → { ok, player: {id, name, stronghold} | null }
POST /api/newgame  { name }       → { ok, player } | 400 bad_name | 400 name_taken
POST /api/resume   { userid }     → { ok, player } | 404 no_such_player
```
- `newgame` runs Zv2 onboarding: a default level-1 stronghold
  (Life support / Scrapyard / Garage / HQ), a random map location, inventory,
  discovery data, and a three-person survivor squad. Names are 2–20 chars and unique.
- `resume` is **dev convenience, not auth** — it trusts the userid so a browser restart
  can re-attach (the client stores the id in `localStorage['zv2.userid']`). Replace with
  a real login before multiplayer/public deployment.

## The wasteland (discovery)
The world is a **50×50 ruined city** — one location per cell. Each player has a
fog bitmap (`discovered.data`); a fresh survivor
knows only their own camp.

```jsonc
GET /api/map?r=12            // r = radius around the camp (1..25, default 12)
{
  "ok": true,
  "world":  { "w": 50, "h": 50 },
  "player": { "x": 22, "y": 27, "name": "Kira's Stronghold" },
  "tiles": [
    { "x": 22, "y": 27, "seen": true, "home": true, "name": "Kira's Stronghold" },
    { "x": 22, "y": 26, "seen": true, "type": 61, "name": "Gun shop", "rooms": 9 },
    { "x": 21, "y": 26, "seen": false, "scoutable": true },   // frontier — explorable
    { "x": 19, "y": 24, "seen": false, "scoutable": false }   // fog: coords only
  ]
}

POST /api/scout { x, y }     // reveal one frontier tile
  → { ok, travel: { from, to, arrivesAt, seconds, discovering, crew } }
  → 400 too_far      (not adjacent to ground you know — exploration spreads outward)
  → 400 already_seen
```
Travel snapshots only healthy, rested, unassigned survivors into the raiding crew.
The destination remains hidden until `arrivesAt`; subsequent map refresh finalizes
arrival, reveals new territory, and persists `squad.x|y`. Assigned facility workers are
never returned by a remote building's crew list. Undiscovered tiles never carry
`type`/`name`/`rooms`, so fog cannot be inspected client-side.

```jsonc
GET /api/building.php?x=22&y=26
  → { "ok":true, "building": {
      "x":22, "y":26, "type":61, "name":"Gun shop",
      "rooms":[{"id":112300,"name":"Sales area","loot":4,"zombies":2}]
    }}
  → 403 not_discovered
```
The endpoint checks the player's fog bitmap before returning building or room data.
Each player has independent room discovery progress. Unknown rooms expose no loot or
infected data and only the next reachable door is marked `accessible`. The response
also includes the building run's `momentum`, `rewardTier`, and `nextReward`.

```jsonc
POST /api/room-action.php { action:"fight", x, y, room, survivor }
  → { ok:true, killed, remaining, secured, survivor:{hp,maxHp,damage}, weapon:{used,durability,maxDurability,ammo}, message }
POST /api/room-action.php { action:"retreat", x, y, room }
  → { ok:true, remaining, retreated:true, message }
POST /api/room-action.php { action:"loot", x, y, room, item, squad }
  → { ok:true, item:{ id, name, amount, remaining }, cargo, message:"Packed …" }
```
Room discovery uses `action:"discover"` with `approach:"quiet"|"careful"|"breach"`.
Combat accepts `tactic:"precise"|"aggressive"|"guarded"`. Entry approaches create
intel, loot opportunities, or ambush risk; combat stances trade attack, defence, and
fatigue. Securing rooms builds persistent momentum, and each five-point tier grants a
server-authoritative supply cache directly to the stash.
Each combat request resolves one round: the selected survivor attacks, one round of
ammunition and weapon condition is consumed when a usable weapon is fired/swung,
remaining infected retaliate, and persistent health is returned. Broken or empty
weapons contribute no attack bonus. Retreat leaves the
room infected. Looting is blocked while zombies remain and transfers the authoritative
room stack into the selected squad's capacity-limited cargo. Cargo is transferred into
the standalone inventory after the squad returns to a stronghold with a built Storage;
without Storage it remains loaded on the squad. Entry and
combat choices update persistent building noise; high noise makes retaliation more dangerous.

```jsonc
GET  /api/forces.php
POST /api/forces.php { action:"create"|"assign"|"remove"|"train"|"return", survivor, squad, focus }
```
Forces responses contain named squads, members, positions, readiness, cargo weight,
Storage availability, Troop Quarter limits and recruit progress. Travel completion can
generate route events; `return` starts a timed journey to the stronghold.

```jsonc
GET  /api/inventory.php
POST /api/inventory-action.php { action:"equip"|"unequip"|"use"|"repair", survivor, item }
POST /api/craft.php { recipe }                 → starts a timed Toolshop production job
POST /api/facility-assignment.php { action:"assign"|"unassign", slot, survivor }
GET  /api/research.php
POST /api/research.php { tech }
```
The inventory response contains the stash, squad, Toolshop level, active production job,
and all production plans with live material, research, and facility-level requirements.
Health, equipment, ammunition, and weapon condition are persistent. Healing and repair
items are consumed server-side. Production atomically deducts ingredients, runs on a
server-owned timer, and transfers the finished item to the stash.
Assigned survivors provide facility-specific bonuses but are unavailable for expeditions.
Work and combat add fatigue; unassigned survivors rest. The server resolves the
accelerated 10-minute day / 10-minute night clock and one zombie raid at each nightfall.

## Planned (later phases — listed so the contract can grow coherently)
- `GET  /api/facility/{slot}`               → detail (outputs, reqs, queue)
- Research responses include points, hourly gain, center requirements, prerequisites,
  completed nodes, and the current timed job. Recovered technologies affect production,
  travel, combat, healing, defense, power, construction, salvage, and crafting.
- realtime channel (WS/SSE) for live combat & unit movement (MMO phase)
