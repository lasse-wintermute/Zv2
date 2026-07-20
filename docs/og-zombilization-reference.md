# OG Zombilization — Master Reference (every game dynamic)

Compiled 2026-07-18 from five deep reads of the original PHP at `C:\Claude Code\z`.
This is the fidelity contract for Zv2: what the original does, with exact formulas,
and how every system feeds every other system. File:line references point into the
original source.

Attribute slot order used everywhere (troops, NPCs, zombies, items, strongholds):
`[0]strength [1]health [2]stealth [3]intelligence/perception [4]charisma [5]speed [6]attack [7]defense`

---

## 1. Core data model

- One `strongholds` row per player; all economy in pipe strings: `buildings` (46 facility
  levels), `ressis` (`money|food|wood|metal|petrol`), `population`
  (`taxpayers|scientists|technicians|soldiers|scavengers|TOTAL`), `power` (`drain|output`),
  `activebuildings` (0..1 activity throttle per facility), `zuwachs` (base growth
  `100|30|10|10|3|0.4|10` = money/food/wood/metal/petrol/pop/AP), `zuwachsfaktor`
  (multipliers, 8 slots incl. RP), `strongholdattribs` (8 defense attribs), `fortifications`
  (installed defense items).
- `spielelemente` = universal resource-pointer codes: every cost/reward/prereq is
  `id|amount&…`. Ids: 1-5 resources, 6 points, 31 RP, 32 AP, 35 power output, 191 duration,
  192 total pop, 193-197 growth+, 198-202 factor+, 203/204 pop growth/factor, 205/206 AP,
  215 RP factor, 207 total kills; 13-30 = facility levels as prereqs; 36-145 = techs.
- Starting state: Life support, Scrapyard, Garage, Storage, HQ all L1; ressis 50 each;
  population 4 taxpayers.

## 2. Time model

- **Lazy tick**: `aktualisieren_neu()` settles population/resources/RP/AP to `now` on every
  page load; `cron.php` is only a backstop that ticks everyone.
- **Queue**: single `queue` table; one entry per timed action; resolved on any page load at
  duetime by `checkqueue_all()`. Types: 1 build, 2 research, 3 troop move, 4 zombie fight,
  5 training, 6 raise/revive, 7 stronghold attack, 8 return, 9 burn corpses, 10 produce item,
  11 spy, 12 spy return, 13 trade delivery. Concurrency is **per type**: one build AND one
  research AND troop actions in parallel.
- **Crons**: seed 10 zombies/run into random rooms (rarity-weighted); attack idle troops
  (>1h in an infected room → stealth contest); account GC. Midnight corpse resurrection is
  scaffolded (`cron_ressurect`) but the attack call is commented out in this build.
- **Action Points**: designed as the universal throttle (1 AP per action, 4 AP to scout a
  block; cap `30+HQ^3.3`; growth 10/day×factor) but **disabled in this build** (`checkreq`
  skips id 32; `takeAP` deducts 0).

## 3. Population (the engine of everything)

- Growth: `0.4/h × popfactor`, added to **taxpayers only**. Cap `HQ^1.6 × 100`.
- **Sustainable population** = food production/3×24 (each person eats **3 food/day**).
  Food at 0 → **10 people/hour emigrate** (specialists drained after taxpayers; soldiers never).
- Five classes, assigned by absolute number on the HQ page; taxpayer = remainder:

| Class | Cap | Feeds |
|---|---|---|
| Taxpayers | remainder | **Money** (1/person/h across total pop) + recruit pool |
| Scientists | Research lvl ×10 ×activity | **RP**: 20/day each × RP factor |
| Technicians | Toolshop lvl ×10 ×activity | **Build & production speed** (production factor) |
| Scavengers | Storage lvl ×10 ×activity | **All raw resources** (food/wood/metal/petrol) |
| Soldiers | via Armory only | Combat (troops) |

- **Production factor** (build/craft speed): `pf = round(tech/10); if >1: 1+pf/10; if 0: 0.05`
  then `+ assemblyline×0.10 + robotfactory×0.15 + npcStrength/100`. Duration = base ÷ pf.
  Zero technicians = 20× slower builds in the original.

## 4. Resource dependency web (both directions)

Per-resource production: `scavengers × base × factor × (powerLevel/100) × activity / 24` per hour
(min 0.5 scavengers). Bases: food 30, wood 10, metal 10, petrol 3, money 100(pop-driven).

| Resource | Produced by | Boosted by | Consumed by |
|---|---|---|---|
| Money | taxpayers/total pop (1/h each) | — (uncapped) | facility upgrades (HQ/Comm/Chem/Medical/Staff lines), trade buys, some crafting |
| Food | Life support + scavengers | Water purifier +10%, Hydroponic +25%, per-LS-level flat +20..+2 | eating 3/pop/day; starvation trigger |
| Wood | Scrapyard + scavengers | Waste proc +10%, Recycling +10%; per-level +10..+1 | most facility upgrades, items, fortifications |
| Metal | Scrapyard + scavengers | Waste proc +5%, Recycling +15% | upgrades (Power gen, Toolshop lines), items |
| Petrol | Garage + scavengers | Fuel tank +10%, Oil refinery +25% | upgrades (Research line, LS high levels), **vehicle fuel**, **burning corpses (1/corpse)** |
| Population | growth 0.4/h × factor | Radio tower +15%, Printing press +10%, Entertainment +25% | starvation, conversion to soldiers |
| RP | scientists 20/day | Server room +10%, Data core +15% | research tree (10→29073 per tech) |
| Power out | Power gen levels (15→1185 cumulative) | Wind +500, Solar +1500 | drained by every facility × its activity |

- Storage caps: food `LS^2.5×100`; wood/metal `Scrapyard^2.5×100`; petrol `Garage^2.5×100`;
  money uncapped. At cap the header shows a blinking red `!` and growth displays 0.

## 5. Power

- Drain = Σ per-facility `power_req[level] × activity`. Output = generator curve + subs.
- `outputlevel = min(100, output/drain×100)` — a **brownout multiplies ALL production and
  pop growth linearly**; it never halts anything.
- Throttle sliders (facilities 1,2,3,4,11,12): activity % scales that facility's power draw,
  production AND its job-class cap simultaneously.

## 6. Facilities — function summary (costs: see `facilities_req`, ported into Zv2 already)

1 **Life support** food/water production hub. 2 **Scrapyard** wood+metal. 3 **Garage**
petrol + vehicle storage (cap = level/2). 4 **Storage** item browser + USE usable items;
drives scavenger cap. 6 **Comm center** gates ally features. 7 **Trade post** marketplace
(slots = level − active trades). 8 **Fortifications** install defense items (max
`level` of each type); shows stronghold defense attribs. 9 **Power generator** output +
throttle page. 10 **Armory/Troop quarters** raise/train/deploy troops; troop cap = level.
11 **Toolshop** produce items (needs ≥1 technician, one job at a time, duration ÷ pf);
technician cap. 12 **Research center** scientist cap; tree. 13 **Staff area** NPC sergeant
management (recruited/quests/discovered tabs). 15 **Chemical lab** gates Chemistry tree
(production commented out). 16 **Medical center** revive destroyed troops (<24h).
17 **HQ** population assignment hub; pop cap, AP cap, pop/AP growth per level.
- Each main facility has 2 single-level **sub-facilities** (tier-1 at parent L3 + tech,
  400s; tier-2 at parent L6 + tech, 1000s) granting the % bonuses listed in §4.
- Upgrade: cost from `facilities_req` (hand-authored, ~×2.4/level, durations 25→10000s),
  duration ÷ production factor, one at a time, **cancel refunds 50%**. Points +newLevel.

## 7. Research

- 11 branches × 10 tiers; tier t needs: branch facility level t, Research center level t
  (medicine lags one), previous tier. RP 10,20,42,92,212,510,1326,3580,10025,29073
  (materials t1 = 30); durations 80→6000s, **not** speed-scaled. One at a time; cancel
  refunds 50% RP. Techs unlock items/subs/attribute training. Points +tier.

## 8. World map & discovery

- 50×50; one building per square (86 building types, rarity-weighted; interior grid + door
  adjacency graph per type). `discovered` fog string per player; a square is explorable only
  if adjacent to known ground (scout = 4 AP).
- Map shows: fog / empty / troop / own stronghold / enemy stronghold (+NPC and +bookmark
  overlays), commentary tooltips per tile, current tile green-bordered. It does **not**
  telegraph loot/zombies/vehicles — those are revealed by entering.
- Coordinates `X:n, Y:n` shown everywhere and always link to the room.

## 9. Rooms, loot, perception

- Room ids: `(y-1)*5000 + x*100 + nr`; nr 0 = street. Per-troop room discovery (fog inside
  buildings). Movement room-to-room follows the door graph, 1 AP, marks discovered, may
  trigger ambush (stealth×d10 vs zombie intelligence×d10).
- **Cannot leave a room with living zombies.** Troop must be idle to move.
- Loot pre-seeded world-wide by item (`anzahlgesamt` count into rooms of its
  `seedinroomtype`), stack sizes by rarity band. **Visibility gate**: item's discoverlevel ≤
  troop perception; hidden rooms (vaults, hideouts) need high perception.
- Take item: 1 AP, carry-limit checked. Graffiti readable/writable per room.

## 10. Zombies & combat

- 26 types with 8-slot stats and `possessions` drop strings (drop roll ≈ rand(0,100)%×qty
  per kill). Seeded by rarity; bosses count 100 world-wide.
- Turn-based rounds; one soldier acts per submit: **damage = (ATT + d20) − (DEF + d20)**,
  miss on ≤0, applied to individual HP pools. All living zombies strike back each round at
  random soldiers, same formula. Stances: defensive ATT×⅔ DEF×4/3, berserk (melee)
  ATT×4/3 DEF×⅔, sniper (ranged) ATT×4/3 DEF×⅔, flank ×6/5 ×4/5.
- Weapon context: **indoors melee ×3, firearms ×⅔**; outdoors base; vehicle att/def adds
  only outdoors. Best-N items count (N = soldiers). No per-shot ammo/durability decay.
- Flee: troop speed+d20 vs zombie speed(1)+d20; failure = zombies get a free round.
- Deaths drop corpse items (2001) in the room; kills feed quest counters + rankings.

## 11. Corpse loop

- Corpses (item 2001) pile up where soldiers die. **Burn** them: 1 petrol per corpse,
  300s job. Design intent (help text): unburned corpses resurrect at midnight and attack
  your stronghold (type-4 zombies) — scaffolded in `cron_ressurect` but disabled in this build.

## 12. Troops

- Raise at Armory: pick type + 1-10 soldiers (from taxpayers), no resource cost, time
  `5000×soldiers ÷ armoryLevel ÷ (1+npcCharisma/100)`. **Troop count cap = armory level.**
- Health/attack/defense scale ×soldiers; strength/stealth/int/charisma/speed are per-unit.
- **Training**: +5 to a chosen attribute; time `attr^1.3 × soldiers ÷ speedfactor`; values
  ≥30 need Training room, ≥60 Shooting range.
- **Carry limit** `soldiers × (15 + 15×strength/100) kg`. Equipment vs backpack split;
  equip/unequip; auto-drop over limit.
- **Movement**: distance = Euclidean; time `distance × (20 − speed/100×10)` s/tile (speed
  capped 100; vehicle speed replaces troop speed if everyone fits). Fuel = distance ×
  vehicle consumption. Cancel = turn back, proportional refund.
- XP/killcount accumulate (rankings only). Idle troops in infected rooms get attacked
  after 1h. Disband returns soldiers to population.

## 13. NPCs / sergeants

- 50 named NPCs seeded per player, nearer ones first; discovered when a troop shares their
  tile. Talk: **talkpoints = troop charisma + NPC goodwill** vs per-option requirements;
  quest = fetch an item (+30 goodwill); join when threshold met (reward item granted).
- Use A — **facility assignment**: research +int/100 speed, resources +speed/100, power
  +int×10, fortifications +attack&defense, armory charisma → raise/train speedfactor.
- Use B — **troop sergeant**: NPC attributes act as **percentage multipliers** on soldier
  stats; NPC items add flat; NPC speed adds.

## 14. Spying

- Spy mission vs stronghold: your soldiers "fight" spy-defenses (stealth items + NPC) with
  stealth as attack, intelligence as defense, same d20 engine.
- **Intel accuracy = share of spy-defense destroyed**; report shows resources/vehicles/
  troops/research/building levels with noise and hide-chance proportional to (1−accuracy).

## 15. PvP stronghold fights

- Attack types: resources / research / vehicle / item / intel. Troop must stand on the
  target's tile.
- Defense = stronghold core (1000 HP) + each installed fortification item as an individual
  defender (NPC-boosted). Attacker wins at >50% total defense HP destroyed.
- **Theft** (attacker win): money up to `50% − saferoom×10% − safe×15%`; resources 1-4 up
  to half, limited by carry capacity; research = +1 level in your weakest-vs-theirs branch;
  vehicle/item = one random. Destroyed fortifications are gone; partial losses drop corpses.
- **This is the ONLY supply theft in the game — zombies never steal.**

## 16. Vehicles

- 48 types (bicycle → tank → unique "Dead Reckoning"); unmanned instances pre-scattered on
  the map — **you just drive off with what you find** (1 AP). Fuel tank + per-tile
  consumption; refuel from stronghold petrol or carried canisters. Carry capacity adds to
  troop; att/def only outdoors. Upgrades installable; no HP/repair. Garage stores them
  (cap level/2).

## 17. Trade

- Player marketplace: sell resources for money. Slots = trade post level; 100kg/slot.
- Buy → goods travel at fixed speed-70 (`distance×13s`); **loss risk = distance×2%, cap
  5%, rolled per side** ("zombies ate the traders").

## 18. Medical / revival

- Soldiers are binary alive/dead; no healing. Destroyed troops revivable **within 24h**:
  attributes recovered at `10 + medical×5 + sickbay×5 + surgery×5` %, time
  `5000×soldiers ÷ medicalLevel`. Not revived in 24h = gone (gear drops in the room).

## 19. Quests / onboarding

- No scripted tutorial beyond the sergeant dialogue boxes; `help.php` static guide.
- **43 achievement tasks** in chains (Greenhorn→Old Hand, Toolshop, Comm, Governance,
  Armory ranks, facility marks, research pairs, kill counts 1000/10000/100000, build/lose
  troops) with requirement strings + trophy-item rewards. This is the soft progression engine.

## 20. Messages / reports

- Inbox types: mail(0), trade-complete(5). Reports: combat(1), spy(3). Notifications:
  ally(4), trade(6). Combat/spy reports auto-generated per fight with troop + fight links;
  everything also writes coded entries to the activity log that drives menu counters.

## 21. Points & ranking

- Points: +1 establish, +newLevel per upgrade, +tier per research. (No other sources.)
- Rankings: users by points, allies by summed points, kills, troop XP.

## 22. UI: layout, tooltips, palette

- **Skeleton**: fixed 996px, table-based; identical two-row header on every page →
  everything reachable in 1 click. Row 1: logo, messages/reports/notifications counters,
  dropdown menus (Map / Stronghold / Troops / Ally / User) opening anchored panels. Row 2:
  icon+number for population, power(net, red if negative), RP, AP, money, food, wood,
  metal, petrol — **live JS tickers** incrementing at the real production rate, blinking
  red `!` at cap, red number at zero; every one links to its facility and has a hover
  tooltip with production/consumption/max breakdown.
- Below header: tutorial sergeant box, **Event Monitor** (red box: active fights/spies) and
  **live queue** (green box: every running job with countdown + cancel).
- **Tooltip system**: cursor-anchored white boxes (`ShowContent`); EVERY game noun has one —
  resources (production/consumption/net/max), population classes, power, AP/RP, facilities
  (icon, level, description, next cost), items (icon, description, **weight, each stat delta
  green/red, indoor/outdoor weapon values**), research (type + cost), NPCs (portrait, level,
  goodwill, quest?, recruited?, all attributes), zombies (stats), map tiles (commentary),
  room exits (destination name), tasks (missing requirements in red), disabled buttons
  (reason why). **This is the "everything explains itself" model.**
- **Screens**: stronghold overview = clickable blueprint image-map (hover = facility
  tooltip, click = facility page). Facility page = standard block (icon, level, power,
  upgrade cost/countdown/Missing-list) + sub-facility rows + control strip (specialty
  output, activity %, job assignment `assigned/max`, sergeant select) + page-specific body.
  Room view = minimap grid (7×7 / 27×27 zoom) + bookmarks + movement compass pad (N/E/S/W/
  U/D with room-name tooltips, disabled = greyed with reason) + salvage grid + zombies
  block + stronghold-attack block. Research = tabbed branches. Armory = raise form + troop
  cards. Quests = task rows with finish buttons.
- **Palette (z.css)**: body `#DDDDDD`, text `#222` (letter-spacing .1em), links bold `#222`;
  `.ok` `#44AA00`, `.error/.ng` `#FF0044`, `.warn` orange, `.deact` `#AAA`; row tints
  `.strong2` `#DDFFDD` (friendly/home) vs `.field2` `#FFDDDD` (hostile/afield); `.digits`
  18pt bold for all big numbers; buttons grey uppercase bold; grunge comes from hand-drawn
  GIF assets (blueprint, Berlin map textures, item icons), not CSS.

## 23. The master dependency chain

```
HQ level ──► pop cap ──► taxpayers ──► money ──► money-line facilities (Comm/Chem/Medical/Staff/HQ)
   │                          │
   │                          └──► soldiers (armory) ──► troops ──► exploration/loot/PvP
   ▼
pop growth ◄── Radio tower/Printing/Entertainment subs ◄── techs ◄── RP ◄── scientists ◄── Research lvl cap
                                                                            ▲
Storage lvl ──► scavenger cap ──► ALL raw resources ──► upgrades/items      │
Toolshop lvl ──► technician cap ──► build & craft SPEED                     │
Power output ──► outputlevel ──► multiplies every production ───────────────┘
Life sup/Scrapyard/Garage lvls ──► storage caps + per-level growth bonuses
Fortifications lvl ──► installable defense items ──► stronghold defense ──► PvP/(corpse) survival
Petrol ──► vehicles ──► speed/carry ──► loot throughput; and corpse burning ──► prevents midnight zombies
Food ──► sustains pop (3/day each) ──► everything above
```

## 24. Zv2 gap analysis (current state vs this reference)

Already faithful: facility costs/times, 11×10 research (+facility gates), 26 zombies +
D20 room combat + drops + flee, world vehicles, storage caps, quest chains (25 ported),
points sources, corpse-free raid model (food-only losses), header menus (structure).

Missing / diverging — the working fix list:
1. **Tooltip everywhere** (OG §22): items (weight/stats/indoor-outdoor), facilities
   (desc + next cost) in build menu, staff rows (WHY unavailable — squad? downed? working?),
   coordinates on everything, room exits, disabled buttons say why.
2. Resource strip: live tickers, red-at-zero, blinking !-at-cap, net food (production −
   consumption) with pop eating — Zv2 has no food consumption at all.
3. Population economy: Zv2 has ~6 survivors vs OG's hundreds; no taxpayers/money loop,
   no job caps by facility level, no power brownout multiplier, no activity sliders.
4. Event monitor + live queue with countdown/cancel in the chrome.
5. Facility pages: no sub-facilities, no per-facility specialty output display, no NPC
   sergeants, no training rooms, no revival, no trade, no PvP/spying (single-player so far).
6. Stronghold overview as clickable blueprint (Zv2's iso compound partially covers this).
7. Clickable staff names → survivor sheet; survivor detail view missing.
8. AP system: intentionally absent (was disabled in OG build anyway) — keep out.
```
