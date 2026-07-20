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
- New strongholds use base gathering rates `10|8|6|6|3` and receive a ×4 starter
  multiplier for their first two hours, then ×2 until hour eight. Life Support,
  Scrapyard and Garage levels permanently improve their relevant rates; workers and
  research stack with those bonuses.
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
- `newgame` creates a Headquarters-only compound, a random map location, inventory,
  discovery data, a three-person survivor squad and an active Field Manual. Names are
  2–20 chars and unique.
- `resume` is **dev convenience, not auth** — it trusts the userid so a browser restart
  can re-attach (the client stores the id in `localStorage['zv2.userid']`). Replace with
  a real login before multiplayer/public deployment.

```jsonc
GET  /api/tutorial.php
POST /api/tutorial.php { action:"advance"|"event"|"dismiss"|"restart", event? }
```
The persistent ten-objective Field Manual adapts the original Z tutorial sequence to
Zv2: Storage, resource facilities, power, staffing, world exploration, room combat and
loot return. The server validates objectives before advancing; `event:"world"` records
the otherwise client-only map-opening step.

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
the standalone inventory only when the player uses the squad's deposit command at a
stronghold with a built Storage; until then it remains loaded on the squad. Entry and
combat choices update persistent building noise; high noise makes retaliation more dangerous.

```jsonc
GET  /api/forces.php
POST /api/forces.php { action:"create"|"assign"|"remove"|"train"|"return"|"deposit"|"equip"|"unequip"|"vehicle_restore"|"vehicle_assign"|"vehicle_unassign"|"vehicle_refuel"|"vehicle_upgrade", survivor, squad, focus, item }
```
Forces responses contain named squads, members, positions, readiness, cargo weight,
Storage availability, Troop Quarter limits and recruit progress. Travel completion can
generate route events; `return` starts a timed journey to the stronghold.
Each squad also exposes its persistent weapon and defense loadout, slot capacities and
combined combat stats. Equipping reserves an owned Storage item so it cannot also be
issued to another squad or survivor. Squad attack and defense bonuses are applied to
room combat; defensive gear can also absorb roadside-ambush damage.
Forces responses also expose Garage resources, vehicle blueprints and owned vehicles.
Vehicle actions use `item` as the vehicle/type id and `focus:"seats"|"cargo"` for
upgrades. Assigned vehicles enforce passenger seats, consume stored fuel when travel
begins, increase squad cargo capacity and apply their speed bonus to outbound and return trips.
An outbound route is blocked when fuel is insufficient; Return Home always remains available
and falls back to foot pace so a squad can never become permanently stranded.

`GET /api/map.php?r=25` returns the complete 50×50 city. Every tile includes stable
urban geography (`terrain`, `district`, `density`, `road`, `rail`, `landmark` and
`districtHub`) while fog of war continues to hide building and room content.

Incapacitated survivors (`hp = 0`) are admitted automatically when their squad reaches
the stronghold and Hospital level 1 or higher is available. `hospital_treatments` keeps
the admission and due times plus the soldier and Hospital levels used for the duration.
The Hospital facility response exposes its `patients`; forces and inventory responses
expose each survivor's active `treatment`. Completed patients return fully healed to reserve.

```jsonc
GET  /api/inventory.php
POST /api/inventory-action.php { action:"equip"|"unequip"|"use"|"repair", survivor, item }
POST /api/craft.php { recipe }                 → starts a timed Toolshop production job
POST /api/facility-assignment.php { action:"assign"|"unassign", slot, survivor }
GET  /api/research.php
POST /api/research.php { tech }
GET  /api/objectives.php
POST /api/objectives.php { claim }
GET  /api/tutorial.php
POST /api/tutorial.php { action:"advance"|"dismiss"|"restart"|"event", event }
```
Objectives are the original quest-task chains (rank, toolshop, comms, governance,
armory, facility marks, zombie-killer) with AND-ed requirements (facility level,
tech, kills, survivors), chain prerequisites, and item rewards claimed via POST.
`strongholds.kills` counts infected put down in room combat; stronghold points now
grow the original way (building completion = new level, research = tech tier,
objective claims = 5× tier).

Room combat (`/api/room-action.php` action:"fight") uses the original D20 exchange:
damage = (ATT+d20) − (DEF+d20), per-group lead-zombie HP (`type|count|frontHp`),
indoor melee ×3 / firearm ×⅔, stances aggressive (ATT×4/3 DEF×⅔) / guarded
(ATT×⅔ DEF×4/3) / precise, full zombie counterattack rounds, and kill-time drop
rolls from `zombietypes.drops`. action:"retreat" is a d20 speed contest — failure
costs a free zombie strike. action:"claim_vehicle" { item:worldVehicleId } recovers
an abandoned world vehicle into the player's garage once its room is clear.
Building responses include per-room `infected[]` combat stats (`hp/attack/defense/
frontHp`) and `vehicles[]` (unclaimed wrecks).
Research is an 11-branch × 10-tier tree (materials, salvaging, food, medicine, electricity,
leadership, chemistry, weapons, field, communication, defense) ported from the original
game's costs and timings. Each `branches[*]` node carries `id, tier, name, description,
cost` (research points), `duration` (s), `centerLevel`, `reqFacility`/`reqFacilityName`/`reqLevel`
(the branch's gating facility and level), `prereq`, `complete`, `active`, `canResearch`, `reason`.
A tech is researchable only when its Research center level, gating-facility level, and the
previous tier in its branch are all satisfied. One research job runs at a time.

The inventory response contains the stash, its free and squad-reserved item counts, the
squad, Toolshop level, active production job,
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
