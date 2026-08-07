# Facility art — Firefly prompt pack (wave 1)

14 isometric facility sprites, generated in the Adobe Firefly web app with FLUX.2 [pro].

## Your part / my part

1. **You**: paste a prompt, press Generate, download the result **raw — no editing, no
   background removal**.
2. **You**: drop the downloaded files into `Desktop\Zv2 sprites\` and tell me.
3. **Me**: `scripts/prep-sprites.py` keys out the background, trims, scales and writes
   `src/assets/facilities/<key>.png`, then wires the renderer.

Filenames don't have to be exact — the script matches on any recognisable fragment
(`Firefly life support 3.png`, `hq_v2.png`, `radio.png` all land correctly). Anything it
can't place gets listed and I'll sort it out.

## Firefly settings

The FLUX.2 [pro] panel exposes exactly three things, so there is nothing else to set:

- **Model**: FLUX.2 [pro]
- **Aspect ratio**: Square (1:1)
- **Reference images**: empty for the first generation — see below

There is no variation count and no content-type toggle on this model; each press of
Generate costs **20 credits** and returns one image. Budget roughly 14 × 20 = 280 credits
for a clean first pass, more realistically 500–600 with retries.

### Reference images: leave them EMPTY

Early advice here was to generate `headquarters` first and feed it in as a style
reference. **Don't.** It is not needed and it has already cost us one sprite.

Reference images in FLUX.2 carry *content* as well as style. Life support was
generated two minutes after headquarters with the reference attached and inherited
its whole composition — same three-storey block, same lit windows, same fenced
yard — so the two facilities were indistinguishable on the map.

Nothing is lost by dropping it. Every prompt repeats the full style block verbatim:
projection, light direction, palette hexes, framing, background. That is what has
been holding the set together, and the thirteen anchored rebuilds coming back
consistent with each other is the proof.

It matters most for what is left. Three of the outstanding prompts are
emplacements, and they spend their wording insisting they are *not* buildings —
handing the model a building is precisely the wrong nudge.

If real style drift ever does appear, reach for `garage` or `storage` — a plain,
typical, anchored building. Never `headquarters`: it is the outlier of the set.

## Scale anchor (required on every regeneration)

Wave one was generated without any shared sense of size, so the model picked its
own camera distance per image. Drawing them all at one tile width then made a
shack and a warehouse the same size, and the giveaway was window and door
dimensions. `prep-sprites.py` carries per-sprite scale values to paper over it,
but a multiplier can only fix how big a building is drawn — it cannot fix a
building drawn with a giant louvre relative to its own walls. The power generator
is exactly that, and no scale value rescues it.

So every regenerated prompt states the building's real size **and** includes a
fixed reference object:

> **a standard rusted 200-litre oil drum stands alone in the bottom-left corner of
> the frame, clearly separated from the building and touching nothing**

The *position* matters as much as the drum. Stated only as "beside the entrance",
the drum tells the model what size things are but leaves the script nothing it can
find. Isolated in a known corner it becomes measurable: `measure_drum()` takes the
separable object there, and since the drum is the same 0.88 m in every image,
scaling each sprite until its drum is the same pixel height makes the buildings
agree **by construction** rather than by anyone's judgement. A measured drum
overrides the hand-set scale for that sprite.

A drum is 0.88 m tall and appears in this world without looking staged. Two
things follow. The model has something concrete to size the architecture
against, which is what stops the proportions drifting. And it gives the prep
script a ruler: measuring the drum in each output yields the true scale
directly, instead of the window-size guessing and the failed corrugation-pitch
attempt.

State dimensions in metres in the SUBJECT line — "a hall 14 metres wide and 7
metres to the eaves" — not in vague terms like "large".

### Rebuild list

| facility | why |
|---|---|
| `power_generator` | louvre and pipework enormous against its own walls; worst offender |
| `chem_lab` | needed a 0.78 correction — drawn much closer than the set |
| `radio_tower` | 0.82; shack reads oversized against its mast |
| `comm_center` | 0.85 |
| `storage` | 1.15; warehouse reads small for what it is |

Do `power_generator` first as the pilot. If the drum reference holds its scale,
the rest are worth the credits; if it doesn't, we stop and rethink rather than
burning 400 credits proving the same point five times.

## Why the prompts are worded the way they are

- **Magenta background.** Nothing in a weathered post-apocalyptic palette is magenta, so
  the cut-out can't chew into a wall that happens to resemble the backdrop. The script
  fills inward from the frame edge and is connectivity-based, so an enclosed magenta
  detail *inside* the silhouette survives — verified against a test image.
- **No ground, no cast shadow.** [view.js:196](../src/view.js:196) already draws the
  contact shadow ellipse under each building. A shadow baked into the sprite would
  double up, and a soft shadow bleeding into the backdrop is exactly what makes an
  automatic cut-out leave a grey smear.
- **Centred with margin.** Anything touching the frame edge gets clipped when trimmed
  to the tile.
- **Headquarters is deliberately wider** — it's a campus, drawn across more than one
  tile in the current renderer.

## Filenames

| # | Facility | key |
|---|---|---|
| 17 | Headquarters | `headquarters` |
| 1 | Life support | `life_support` |
| 2 | Scrapyard | `scrapyard` |
| 3 | Garage | `garage` |
| 4 | Storage | `storage` |
| 6 | Communication center | `comm_center` |
| 8 | Fortifications | `fortifications` |
| 9 | Power generator | `power_generator` |
| 10 | Troop quarters | `troop_quarters` |
| 11 | Toolshop | `toolshop` |
| 12 | Research center | `research_center` |
| 13 | Staff area | `staff_area` |
| 15 | Chemical laboratory | `chem_lab` |
| 16 | Hospital | `medical_center` |
| 18 | Radio tower | `radio_tower` |

Keys match the `key` field in [`src/config.js`](../src/config.js). The German language
toggle rewrites facility *names* but never keys, so sprite lookup is unaffected by it.

This list is the `facilities` table, which is what drives the build menu — **not**
`FACILITY_KEYS` in config.js, which only covers facilities with a keyboard shortcut and
silently omits the communication center.

## Two states, one generation

Don't generate powered and unpowered versions. The renderer swaps `#aaa68f` → `#626762`
for unpowered buildings; that stays a code-side desaturate+darken over the same sprite.
Level is shown by the existing label badge. **14 images, not 28.**

---

## The prompts

### 17 — Headquarters (REBUILD — lowest priority, reads well as-is)

The first attempt reads as another farmyard shed and gets lost among its neighbours.
This one is drawn at 1.7× tile scale in the renderer, so it needs the mass to earn
that room: a heavy institutional block, not a house. Keep the two-storey neighbours
in mind — this should look like the building they were all built around.

Generate with Reference images EMPTY — see the note above; a reference would push
this back toward the cottage roofline the rest of the set shares.

```
2:1 isometric game sprite, orthographic dimetric projection viewed from the upper front left at 30 degrees above the horizon, no perspective convergence. Key light from the upper left, soft ambient occlusion on the structure itself. The object floats in empty space: no ground, no floor, no terrain, no cast shadow. Weathered post-apocalyptic survivor architecture: stained bone-khaki concrete, corrugated metal, scavenged timber bracing, patched sandbags, olive-grey shadows (#626762). Muted desaturated palette, clean hand-painted stylised game art, crisp readable silhouette, moderate detail. Centred and complete within frame with clear margin on all sides. No text, no letters, no signage, no people, no UI elements. Plain flat solid magenta background (#FF00FF), completely uniform and empty — the magenta appears only behind the object, never on it.

SUBJECT: an imposing five-storey institutional command block, heavy and monolithic like a converted prison or civic administration building, dominating everything around it. Long regular grids of small barred windows run across every floor, most dark and a few lit amber. A flat roof carries an aerial mast, satellite dishes, water tanks, air handling units and a sandbagged rooftop guard post behind a parapet. The ground floor is fortified: a reinforced double door behind a concrete blast wall, steel shutters, and sandbag emplacements at the corners. Squat projecting wings step down at either side to a lower entrance hall, and the whole structure sits on a raised concrete plinth. Brutalist, weather-stained, institutional — not a house, no pitched roof, no cottage. The block is five storeys, 20 metres by 16 metres and 18 metres tall. A standard rusted 200-litre oil drum stands upright against the wall beside the entrance, 0.88 metres tall — size everything else in the image against it.
```

### 17 — Headquarters (original prompt, superseded)

```
2:1 isometric game sprite, orthographic dimetric projection viewed from the upper front left at 30 degrees above the horizon, no perspective convergence. Key light from the upper left, soft ambient occlusion on the structure itself. The object floats in empty space: no ground, no floor, no terrain, no cast shadow. Weathered post-apocalyptic survivor compound architecture: bone-khaki concrete and corrugated metal walls (#aaa68f), rust-red sheet-metal roofs (#8c4b3b), scavenged timber bracing, patched sandbags, olive-grey shadows (#626762). Muted desaturated palette, clean hand-painted stylised game art, crisp readable silhouette, moderate detail. Centred and complete within frame with clear margin on all sides. No text, no letters, no signage, no people, no UI elements. Plain flat solid magenta background (#FF00FF), completely uniform and empty — the magenta appears only behind the object, never on it.

SUBJECT: a fortified headquarters campus — a tall central administration house with a hipped rust-red roof and three rows of small lit windows, flanked by two lower service buildings and a gatehouse arranged around an open courtyard, a garage wing with a roller shutter door, two small water tanks, brick chimneys, and a thin radio aerial rising from the central roof.
```

### 1 — Life support (done — rebuilt with the anchor)

It originally read too close to `headquarters`, having been generated straight after
it with the HQ image still attached as a reference. Resolved from the other end
instead: the headquarters becomes an institutional block, so the two no longer
collide. The current life support sprite stays. The prompt below is kept only in case
it is ever rebuilt.

```
2:1 isometric game sprite, orthographic dimetric projection viewed from the upper front left at 30 degrees above the horizon, no perspective convergence. Key light from the upper left, soft ambient occlusion on the structure itself. The object floats in empty space: no ground, no floor, no terrain, no cast shadow. Weathered post-apocalyptic survivor compound architecture: bone-khaki concrete and corrugated metal walls (#aaa68f), rust-red sheet-metal roofs (#8c4b3b), scavenged timber bracing, patched sandbags, olive-grey shadows (#626762). Muted desaturated palette, clean hand-painted stylised game art, crisp readable silhouette, moderate detail. Centred and complete within frame with clear margin on all sides. No text, no letters, no signage, no people, no UI elements. Plain flat solid magenta background (#FF00FF), completely uniform and empty — the magenta appears only behind the object, never on it.

SUBJECT: a squat industrial water treatment plant, entirely functional with no living quarters — three enormous riveted teal-grey cylindrical tanks of differing heights dominate the composition and are the tallest thing present, standing on short steel legs above a low flat-roofed concrete pump house barely half their height. A tangle of thick pipes, valve wheels, pressure gauges and a settling basin wraps around the base. Strictly single storey, flat roof, no pitched or hipped roof, no upper floors, no rows of lit windows, no house, no fence, no yard. The pump house is 10 metres by 8 metres and 4 metres tall; the tanks stand 9 metres. A standard rusted 200-litre oil drum stands upright against the wall beside the entrance, 0.88 metres tall — size everything else in the image against it.
```

### 2 — Scrapyard (done — rebuilt with the anchor)

```
2:1 isometric game sprite, orthographic dimetric projection viewed from the upper front left at 30 degrees above the horizon, no perspective convergence. Key light from the upper left, soft ambient occlusion on the structure itself. The object floats in empty space: no ground, no floor, no terrain, no cast shadow. Weathered post-apocalyptic survivor compound architecture: bone-khaki concrete and corrugated metal walls (#aaa68f), rust-red sheet-metal roofs (#8c4b3b), scavenged timber bracing, patched sandbags, olive-grey shadows (#626762). Muted desaturated palette, clean hand-painted stylised game art, crisp readable silhouette, moderate detail. Centred and complete within frame with clear margin on all sides. No text, no letters, no signage, no people, no UI elements. Plain flat solid magenta background (#FF00FF), completely uniform and empty — the magenta appears only behind the object, never on it.

SUBJECT: a salvage workshop shed with an open front bay, a gantry crane arm angling up and over the roof from a lattice mast on the left, and piles of rusted scrap metal, stacked bald tyres and crushed car body panels heaped against the front and side of the shed. The crane mast and jib are dark rusted steel with flaking faded yellow paint — solid, heavy, and never pink or magenta. The workshop is 14 metres by 10 metres and 6 metres to the eaves; the crane mast is 11 metres. A standard rusted 200-litre oil drum stands upright against the wall beside the entrance, 0.88 metres tall — size everything else in the image against it.
```

### 3 — Garage (done — rebuilt with the anchor)

```
2:1 isometric game sprite, orthographic dimetric projection viewed from the upper front left at 30 degrees above the horizon, no perspective convergence. Key light from the upper left, soft ambient occlusion on the structure itself. The object floats in empty space: no ground, no floor, no terrain, no cast shadow. Weathered post-apocalyptic survivor compound architecture: bone-khaki concrete and corrugated metal walls (#aaa68f), rust-red sheet-metal roofs (#8c4b3b), scavenged timber bracing, patched sandbags, olive-grey shadows (#626762). Muted desaturated palette, clean hand-painted stylised game art, crisp readable silhouette, moderate detail. Centred and complete within frame with clear margin on all sides. No text, no letters, no signage, no people, no UI elements. Plain flat solid magenta background (#FF00FF), completely uniform and empty — the magenta appears only behind the object, never on it.

SUBJECT: a broad low vehicle garage, wider than it is tall, with two large ribbed corrugated roller shutter doors set into the front wall, a stack of fuel drums against one side, and a stripped car wreck up on blocks tucked against the building. The garage is 18 metres by 10 metres and 5.5 metres to the eaves. A standard rusted 200-litre oil drum stands upright against the wall beside the entrance, 0.88 metres tall — size everything else in the image against it.
```

### 4 — Storage (done — rebuilt with the anchor)

```
2:1 isometric game sprite, orthographic dimetric projection viewed from the upper front left at 30 degrees above the horizon, no perspective convergence. Key light from the upper left, soft ambient occlusion on the structure itself. The object floats in empty space: no ground, no floor, no terrain, no cast shadow. Weathered post-apocalyptic survivor compound architecture: bone-khaki concrete and corrugated metal walls (#aaa68f), rust-red sheet-metal roofs (#8c4b3b), scavenged timber bracing, patched sandbags, olive-grey shadows (#626762). Muted desaturated palette, clean hand-painted stylised game art, crisp readable silhouette, moderate detail. Centred and complete within frame with clear margin on all sides. No text, no letters, no signage, no people, no UI elements. Plain flat solid magenta background (#FF00FF), completely uniform and empty — the magenta appears only behind the object, never on it.

SUBJECT: a hardened central storage hall with a reinforced double door and two rows of small barred windows, flanked on both sides by weathered shipping containers stacked two high, with wooden crates and supply pallets under a canvas tarp against the front wall.
```

### 6 — Communication center (done — rebuilt with the anchor)

Wave 1 was scoped off `FACILITY_KEYS` in config.js, which lists only facilities with a
keyboard shortcut. The build menu is driven by the `facilities` table instead, and the
communication center is in the database but has no shortcut, so it fell through the gap
and still renders as the old procedural silhouette.

Keep it clearly distinct from the radio tower: this is a manned signals room with dish
antennas, not a tall mast.

```
2:1 isometric game sprite, orthographic dimetric projection viewed from the upper front left at 30 degrees above the horizon, no perspective convergence. Key light from the upper left, soft ambient occlusion on the structure itself. The object floats in empty space: no ground, no floor, no terrain, no cast shadow. Weathered post-apocalyptic survivor compound architecture: bone-khaki concrete and corrugated metal walls (#aaa68f), rust-red sheet-metal roofs (#8c4b3b), scavenged timber bracing, patched sandbags, olive-grey shadows (#626762). Muted desaturated palette, clean hand-painted stylised game art, crisp readable silhouette, moderate detail. Centred and complete within frame with clear margin on all sides. No text, no letters, no signage, no people, no UI elements. Plain flat solid magenta background (#FF00FF), completely uniform and empty — the magenta appears only behind the object, never on it.

SUBJECT: a single-storey signals and communication hut with a flat roof, a wide window of glowing green monitor screens along the front wall and a heavy cable trunk running into the side. Three squat dish antennas of different sizes are bolted directly to the roof at different angles, alongside a bank of grey equipment cabinets and a small whip aerial. Low and wide, no tall mast, no lattice tower — the dishes sit low on the roof. The dish frames and cabinets are dark rusted steel and grey enamel, never pink or magenta.
```

### 8 — Fortifications (done — rebuilt with the anchor)

```
2:1 isometric game sprite, orthographic dimetric projection viewed from the upper front left at 30 degrees above the horizon, no perspective convergence. Key light from the upper left, soft ambient occlusion on the structure itself. The object floats in empty space: no ground, no floor, no terrain, no cast shadow. Weathered post-apocalyptic survivor compound architecture: bone-khaki concrete and corrugated metal walls (#aaa68f), rust-red sheet-metal roofs (#8c4b3b), scavenged timber bracing, patched sandbags, olive-grey shadows (#626762). Muted desaturated palette, clean hand-painted stylised game art, crisp readable silhouette, moderate detail. Centred and complete within frame with clear margin on all sides. No text, no letters, no signage, no people, no UI elements. Plain flat solid magenta background (#FF00FF), completely uniform and empty — the magenta appears only behind the object, never on it.

SUBJECT: a squat fortified concrete bunker with a narrow armoured firing slit, flanked by two tall slim watchtowers with open railed platforms and corrugated roofs, ringed at the base by a row of stacked sandbags and coils of razor wire on timber stakes. The watchtower legs, railings and roofs are dark rusted steel and weathered grey timber — solid, heavy, and never pink or magenta. The bunker is 10 metres by 8 metres and 3.5 metres tall; the watchtowers stand 9 metres. A standard rusted 200-litre oil drum stands upright against the wall beside the entrance, 0.88 metres tall — size everything else in the image against it.
```

### 9 — Power generator (done — the anchor pilot, it worked)

Worst of the set: the louvre and pipework are enormous against its own walls, so no
scale multiplier can rescue it. This prompt carries the drum reference and stated
dimensions. If it comes back in proportion, the other four rebuilds are worth the
credits; if not, stop and tell me rather than spending 400 credits proving it twice.

```
2:1 isometric game sprite, orthographic dimetric projection viewed from the upper front left at 30 degrees above the horizon, no perspective convergence. Key light from the upper left, soft ambient occlusion on the structure itself. The object floats in empty space: no ground, no floor, no terrain, no cast shadow. Weathered post-apocalyptic survivor compound architecture: bone-khaki concrete and corrugated metal walls (#aaa68f), rust-red sheet-metal roofs (#8c4b3b), scavenged timber bracing, patched sandbags, olive-grey shadows (#626762). Muted desaturated palette, clean hand-painted stylised game art, crisp readable silhouette, moderate detail. Centred and complete within frame with clear margin on all sides. No text, no letters, no signage, no people, no UI elements. Plain flat solid magenta background (#FF00FF), completely uniform and empty — the magenta appears only behind the object, never on it.

SUBJECT: a generator hall with a hipped roof and a louvred ventilation grille, a tall narrow smokestack rising from the right side of the roof, a large dark fuel tank standing against the left wall, and heavy insulated power cables sagging in a curve from the roof across the front of the building.
```

### 10 — Troop quarters (REBUILD — scale anchor)

```
2:1 isometric game sprite, orthographic dimetric projection viewed from the upper front left at 30 degrees above the horizon, no perspective convergence. Key light from the upper left, soft ambient occlusion on the structure itself. The object floats in empty space: no ground, no floor, no terrain, no cast shadow. Weathered post-apocalyptic survivor compound architecture: bone-khaki concrete and corrugated metal walls (#aaa68f), rust-red sheet-metal roofs (#8c4b3b), scavenged timber bracing, patched sandbags, olive-grey shadows (#626762). Muted desaturated palette, clean hand-painted stylised game art, crisp readable silhouette, moderate detail. Centred and complete within frame with clear margin on all sides. No text, no letters, no signage, no people, no UI elements. Plain flat solid magenta background (#FF00FF), completely uniform and empty — the magenta appears only behind the object, never on it.

SUBJECT: a long low barracks block with a rust-red pitched roof and an evenly spaced row of shuttered windows, a covered timber porch running along the front with a bench and a rack of kit bags, a dark red pennant on a short pole at one end, and a low sandbag wall at the front corner. The barracks is 22 metres long, 7 metres deep and 4 metres to the eaves, strictly single storey. A standard rusted 200-litre oil drum stands upright against the wall beside the entrance, 0.88 metres tall — size everything else in the image against it.
```

### 11 — Toolshop (done — rebuilt with the anchor)

```
2:1 isometric game sprite, orthographic dimetric projection viewed from the upper front left at 30 degrees above the horizon, no perspective convergence. Key light from the upper left, soft ambient occlusion on the structure itself. The object floats in empty space: no ground, no floor, no terrain, no cast shadow. Weathered post-apocalyptic survivor compound architecture: bone-khaki concrete and corrugated metal walls (#aaa68f), rust-red sheet-metal roofs (#8c4b3b), scavenged timber bracing, patched sandbags, olive-grey shadows (#626762). Muted desaturated palette, clean hand-painted stylised game art, crisp readable silhouette, moderate detail. Centred and complete within frame with clear margin on all sides. No text, no letters, no signage, no people, no UI elements. Plain flat solid magenta background (#FF00FF), completely uniform and empty — the magenta appears only behind the object, never on it.

SUBJECT: a smithy and workshop hall with a wide open front bay showing a glowing orange forge inside, a tall brick forge chimney rising from the right of the roof, an anvil and a work bench with crossed hammer and tongs just outside the bay, and bars of raw metal and timber stacked against the front left wall. The hall is 16 metres by 11 metres and 6 metres to the eaves. A standard rusted 200-litre oil drum stands upright against the wall beside the entrance, 0.88 metres tall — size everything else in the image against it.
```

### 12 — Research center (done — rebuilt with the anchor)

```
2:1 isometric game sprite, orthographic dimetric projection viewed from the upper front left at 30 degrees above the horizon, no perspective convergence. Key light from the upper left, soft ambient occlusion on the structure itself. The object floats in empty space: no ground, no floor, no terrain, no cast shadow. Weathered post-apocalyptic survivor compound architecture: bone-khaki concrete and corrugated metal walls (#aaa68f), rust-red sheet-metal roofs (#8c4b3b), scavenged timber bracing, patched sandbags, olive-grey shadows (#626762). Muted desaturated palette, clean hand-painted stylised game art, crisp readable silhouette, moderate detail. Centred and complete within frame with clear margin on all sides. No text, no letters, no signage, no people, no UI elements. Plain flat solid magenta background (#FF00FF), completely uniform and empty — the magenta appears only behind the object, never on it.

SUBJECT: a modular research building made of two joined prefabricated pods, the taller left pod with a row of cool blue-lit windows and the lower right pod with a sealed airlock hatch, a large parabolic dish antenna angled up from the roof on a lattice mount, and cable conduits running down the outside wall. Two stacked container storeys, 14 metres by 10 metres and 7 metres tall. A standard rusted 200-litre oil drum stands upright against the wall beside the entrance, 0.88 metres tall — size everything else in the image against it.
```

### 13 — Staff area (done — rebuilt with the anchor)

```
2:1 isometric game sprite, orthographic dimetric projection viewed from the upper front left at 30 degrees above the horizon, no perspective convergence. Key light from the upper left, soft ambient occlusion on the structure itself. The object floats in empty space: no ground, no floor, no terrain, no cast shadow. Weathered post-apocalyptic survivor compound architecture: bone-khaki concrete and corrugated metal walls (#aaa68f), rust-red sheet-metal roofs (#8c4b3b), scavenged timber bracing, patched sandbags, olive-grey shadows (#626762). Muted desaturated palette, clean hand-painted stylised game art, crisp readable silhouette, moderate detail. Centred and complete within frame with clear margin on all sides. No text, no letters, no signage, no people, no UI elements. Plain flat solid magenta background (#FF00FF), completely uniform and empty — the magenta appears only behind the object, never on it.

SUBJECT: a communal mess and rest house with warm yellow light spilling from its windows, a patched canvas awning over an outdoor seating area with mismatched scavenged chairs and a table, a rain barrel at the corner, a washing line strung along one side, and a small vegetable planter box beside the door. The house is 12 metres by 9 metres and 4.5 metres to the eaves, single storey. A standard rusted 200-litre oil drum stands upright against the wall beside the entrance, 0.88 metres tall — size everything else in the image against it.
```

### 15 — Chemical laboratory (done — rebuilt with the anchor)

```
2:1 isometric game sprite, orthographic dimetric projection viewed from the upper front left at 30 degrees above the horizon, no perspective convergence. Key light from the upper left, soft ambient occlusion on the structure itself. The object floats in empty space: no ground, no floor, no terrain, no cast shadow. Weathered post-apocalyptic survivor compound architecture: bone-khaki concrete and corrugated metal walls (#aaa68f), rust-red sheet-metal roofs (#8c4b3b), scavenged timber bracing, patched sandbags, olive-grey shadows (#626762). Muted desaturated palette, clean hand-painted stylised game art, crisp readable silhouette, moderate detail. Centred and complete within frame with clear margin on all sides. No text, no letters, no signage, no people, no UI elements. Plain flat solid magenta background (#FF00FF), completely uniform and empty — the magenta appears only behind the object, never on it.

SUBJECT: a sealed chemical laboratory with a heavy airtight door and small thick green-tinted windows, a cluster of pipes and pressure valves along the outside wall, three squat chemical storage drums with hazard stripes stacked against the side, and a tall vent stack on the roof. The laboratory is 12 metres by 9 metres and 4.5 metres to the eaves, single storey. A standard rusted 200-litre oil drum stands upright against the wall beside the entrance, 0.88 metres tall — size everything else in the image against it.
```

### 16 — Hospital (done — rebuilt with the anchor)

```
2:1 isometric game sprite, orthographic dimetric projection viewed from the upper front left at 30 degrees above the horizon, no perspective convergence. Key light from the upper left, soft ambient occlusion on the structure itself. The object floats in empty space: no ground, no floor, no terrain, no cast shadow. Weathered post-apocalyptic survivor compound architecture: bone-khaki concrete and corrugated metal walls (#aaa68f), rust-red sheet-metal roofs (#8c4b3b), scavenged timber bracing, patched sandbags, olive-grey shadows (#626762). Muted desaturated palette, clean hand-painted stylised game art, crisp readable silhouette, moderate detail. Centred and complete within frame with clear margin on all sides. No text, no letters, no signage, no people, no UI elements. Plain flat solid magenta background (#FF00FF), completely uniform and empty — the magenta appears only behind the object, never on it.

SUBJECT: a clinic building with two rows of clean lit windows, a large off-white medical cross panel mounted high on the front wall, a canvas triage canopy on poles extending over the entrance with a folding stretcher trolley beneath it, and a white medical supply tank standing against the right wall. The clinic is two storeys, 16 metres by 11 metres and 8 metres tall. A standard rusted 200-litre oil drum stands upright against the wall beside the entrance, 0.88 metres tall — size everything else in the image against it.
```

### 18 — Radio tower (done — rebuilt with the anchor)

```
2:1 isometric game sprite, orthographic dimetric projection viewed from the upper front left at 30 degrees above the horizon, no perspective convergence. Key light from the upper left, soft ambient occlusion on the structure itself. The object floats in empty space: no ground, no floor, no terrain, no cast shadow. Weathered post-apocalyptic survivor compound architecture: bone-khaki concrete and corrugated metal walls (#aaa68f), rust-red sheet-metal roofs (#8c4b3b), scavenged timber bracing, patched sandbags, olive-grey shadows (#626762). Muted desaturated palette, clean hand-painted stylised game art, crisp readable silhouette, moderate detail. Centred and complete within frame with clear margin on all sides. No text, no letters, no signage, no people, no UI elements. Plain flat solid magenta background (#FF00FF), completely uniform and empty — the magenta appears only behind the object, never on it.

SUBJECT: a small radio operator shack with a single lit window and a door, and a tall guyed lattice antenna mast rising from directly beside it, braced by three thin guy wires, with a small dish and a red warning lamp near the top and cabling running down into the shack. The mast is dark galvanised steel with rust streaks — solid, heavy, and never pink or magenta.
```

---

## Emplacements and terrain

These are the tower-defence pieces, still drawn procedurally in `view.js`. They are
*smaller than a building*, which is the whole difficulty: at one tile wide a sniper
nest must not read like a house. State the height in metres and keep the drum in
frame — on these it matters more than on anything else, because there is no
familiar building mass to judge against.

Files land as `41.jpg`, `42.jpg`, `43.jpg`, `45.jpg`.

### 41 — Sniper nest (REBUILD — scale anchor)

```
2:1 isometric game sprite, orthographic dimetric projection viewed from the upper front left at 30 degrees above the horizon, no perspective convergence. Key light from the upper left, soft ambient occlusion on the structure itself. The object floats in empty space: no ground, no floor, no terrain, no cast shadow. Weathered post-apocalyptic survivor construction: scavenged timber, rusted steel scaffold, corrugated sheet, sandbags, olive-grey shadows (#626762). Muted desaturated palette, clean hand-painted stylised game art, crisp readable silhouette, moderate detail. Centred and complete within frame with clear margin on all sides. No text, no letters, no signage, no people, no UI elements. Plain flat solid magenta background (#FF00FF), completely uniform and empty — the magenta appears only behind the object, never on it.

SUBJECT: a tall narrow sniper platform, 7 metres to the deck on four braced timber legs with a ladder up one side, topped by a small railed firing deck walled with stacked sandbags and a scrap-metal awning against the rain. A long rifle rests on a bipod across the sandbags, spent casings and a spotting scope beside it. Slender and skeletal — this is a lookout post, not a building. A standard rusted 200-litre oil drum stands upright at the foot of the legs, 0.88 metres tall — size everything else in the image against it. The legs, ladder and railing are dark rusted steel and weathered grey timber, never pink or magenta.
```

### 42 — Machine gun tower (REBUILD — scale anchor)

```
2:1 isometric game sprite, orthographic dimetric projection viewed from the upper front left at 30 degrees above the horizon, no perspective convergence. Key light from the upper left, soft ambient occlusion on the structure itself. The object floats in empty space: no ground, no floor, no terrain, no cast shadow. Weathered post-apocalyptic survivor construction: scavenged timber, rusted steel scaffold, corrugated sheet, sandbags, olive-grey shadows (#626762). Muted desaturated palette, clean hand-painted stylised game art, crisp readable silhouette, moderate detail. Centred and complete within frame with clear margin on all sides. No text, no letters, no signage, no people, no UI elements. Plain flat solid magenta background (#FF00FF), completely uniform and empty — the magenta appears only behind the object, never on it.

SUBJECT: a squat armoured gun position, 4 metres tall and broad at the base, built from concrete blocks and welded steel plate with a wide horizontal firing slit. A belt-fed heavy machine gun protrudes through the slit on a pintle mount, linked ammunition hanging in a loop, stacked ammunition boxes and a spent-brass drift at one corner. Heavy and planted, low and wide, the opposite of a tall watchtower. A standard rusted 200-litre oil drum stands upright against the side, 0.88 metres tall — size everything else in the image against it. The plate, mount and gun are dark rusted steel and gunmetal, never pink or magenta.
```

### 43 — Barricade (REBUILD — scale anchor)

```
2:1 isometric game sprite, orthographic dimetric projection viewed from the upper front left at 30 degrees above the horizon, no perspective convergence. Key light from the upper left, soft ambient occlusion on the structure itself. The object floats in empty space: no ground, no floor, no terrain, no cast shadow. Weathered post-apocalyptic survivor construction: scavenged timber, rusted steel scaffold, corrugated sheet, sandbags, olive-grey shadows (#626762). Muted desaturated palette, clean hand-painted stylised game art, crisp readable silhouette, moderate detail. Centred and complete within frame with clear margin on all sides. No text, no letters, no signage, no people, no UI elements. Plain flat solid magenta background (#FF00FF), completely uniform and empty — the magenta appears only behind the object, never on it.

SUBJECT: a low street barricade only 1.6 metres tall, running left to right across the frame: welded scrap plate and rebar spikes lashed to a core of stacked sandbags and a tipped-over car door, coils of razor wire along the top, concrete blocks wedged at either end. Improvised and hastily assembled, wide and low, nothing tower-like about it. A standard rusted 200-litre oil drum stands upright at one end, 0.88 metres tall — size everything else in the image against it. The plate, rebar and wire are dark rusted steel, never pink or magenta.
```

### 45 — Settler house (REBUILD — scale anchor)

Matches the pre-built town: this is what a player adds to it, so it must sit beside
the existing terraces without looking newer or smarter than they do.

```
2:1 isometric game sprite, orthographic dimetric projection viewed from the upper front left at 30 degrees above the horizon, no perspective convergence. Key light from the upper left, soft ambient occlusion on the structure itself. The object floats in empty space: no ground, no floor, no terrain, no cast shadow. Weathered small-town American architecture after years without upkeep: pale clapboard siding, a pitched shingle roof, boarded and patched windows, olive-grey shadows (#626762). Muted desaturated palette, clean hand-painted stylised game art, crisp readable silhouette, moderate detail. Centred and complete within frame with clear margin on all sides. No text, no letters, no signage, no people, no UI elements. Plain flat solid magenta background (#FF00FF), completely uniform and empty — the magenta appears only behind the object, never on it.

SUBJECT: a two-storey clapboard family house, 9 metres by 7 metres and 8 metres to the ridge, with a pitched shingle roof, a covered front porch on square posts with a couple of chairs, two rows of sash windows with a lamp burning behind one of them, a brick chimney and a rain barrel at the corner. Ordinary suburbia gone to seed — lived in, not fortified. A standard rusted 200-litre oil drum stands upright beside the porch, 0.88 metres tall — size everything else in the image against it.
```

## Wave 2 (not generated yet)

The remaining 26 catalogue entries in `_FAC` (prison, trade post, heritage room, lookout,
distillery, recycling centre, wind generator …) are defined but not keyed to a screen, so
they render through the generic category fallbacks in `facilityModel()`. Worth doing only
once wave 1 is confirmed in-engine.
