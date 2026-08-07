"""Turn raw Firefly downloads into game-ready facility sprites.

Reads whatever came out of Firefly, keys out the flat background, trims to the
building, scales it down and writes src/assets/facilities/<key>.png.

    python scripts/prep-sprites.py

Defaults to the Desktop drop folder as input. Filenames only have to *contain*
something recognisable ("Firefly life support 4.png", "hq_v2.png") -- the alias
table below maps them onto facility keys from src/config.js.
"""

import argparse
import json
import os
import re
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESKTOP_INBOX = os.path.join(os.path.expanduser("~"), "Desktop", "Zv2 sprites")
# Every raw generation is archived in the repo, so the sprites can always be rebuilt
# even if the Desktop drop folder is cleared out.
ARCHIVE = os.path.join(ROOT, "art", "facilities-source")
DEFAULT_INBOX = DESKTOP_INBOX if os.path.isdir(DESKTOP_INBOX) else ARCHIVE
DEFAULT_OUT = os.path.join(ROOT, "src", "assets", "facilities")

# facility key -> substrings that may appear in a downloaded filename.
# Longest alias wins, so "power" cannot steal a file meant for "power_generator".
ALIASES = {
    "headquarters":    ["headquarters", "headquarter", "hq"],
    "life_support":    ["lifesupport", "life"],
    "scrapyard":       ["scrapyard", "scrap"],
    "garage":          ["garage"],
    "storage":         ["storage"],
    "comm_center":     ["commcenter", "communication", "comms", "comm"],
    "fortifications":  ["fortifications", "fortification", "fort"],
    "power_generator": ["powergenerator", "generator", "power"],
    "troop_quarters":  ["troopquarters", "troop", "barracks"],
    "toolshop":        ["toolshop", "workshop", "smithy"],
    "research_center": ["researchcenter", "research"],
    "staff_area":      ["staffarea", "staff", "mess"],
    "chem_lab":        ["chemlab", "chemical", "chem"],
    "medical_center":  ["medicalcenter", "hospital", "medical", "clinic"],
    "radio_tower":     ["radiotower", "radio", "antenna"],
}

# Sentinel colours tried in order; the first one absent from the image is used to
# paint the flood-filled background, so the mask can never eat real pixels.
SENTINELS = [(255, 0, 255), (0, 255, 0), (255, 0, 0), (0, 0, 255), (255, 255, 0)]

# Hand-set ground anchors for artwork the automatic measure cannot read. The staff
# area's patio and awning are *attached* to the house, so they are one component and
# the measure correctly returns 1.0 -- but the patio then takes the ground contact
# and the house hangs above the tile. Seating the house lets the patio spill forward
# over the tile in front, which is what a porch should do anyway.
ANCHOR_OVERRIDES = {"staff_area": 0.82}

# Draw scale relative to one tile, presentation only -- every facility still occupies
# a single grid cell.
#
# Each sprite was generated independently, so the model chose its own camera distance
# for each one. Drawing them all at one tile width then puts a shack and a warehouse
# at the same size, which reads as wildly inconsistent architecture: window and door
# sizes are the giveaway, since those are the human-scale reference in the artwork.
#
# These values normalise on that reference. Most are derived from measuring on-screen
# lit-window size and equalising it; the ones marked "judged" have too few real windows
# to measure (a bunker, a warehouse, a scrap yard) and are set from what the building
# is instead. Re-derive with the measurement in the commit that introduced this table.
SCALE_OVERRIDES = {
    "headquarters":    1.45,   # five storeys; still towers, now at honest window scale
    "storage":         1.15,   # judged -- warehouse, few windows to measure
    "medical_center":  1.15,
    "power_generator": 0.80,   # judged -- measure caught rust and the chimney band, not
                               # glass. Interim only: its louvre and pipework are oversized
                               # against its OWN walls, which no scale value can correct.
                               # It is first on the rebuild list for that reason.
    "staff_area":      1.07,
    "troop_quarters":  1.05,   # judged -- long barracks, no lit glass detected
    "garage":          1.03,
    "life_support":    1.00,
    "fortifications":  1.00,   # judged -- bunker; the measure caught rust, not glass
    "scrapyard":       1.00,   # judged -- forge glow skews the measure
    "research_center": 0.94,
    "toolshop":        0.92,
    "comm_center":     0.85,   # judged -- single-storey hut, one window band
    "radio_tower":     0.82,
    "chem_lab":        0.78,
}


# Facility type id -> key, so files can simply be named after the type ("17.jpg").
TYPE_KEYS = {
    1: "life_support", 2: "scrapyard", 3: "garage", 4: "storage", 6: "comm_center",
    8: "fortifications", 9: "power_generator", 10: "troop_quarters", 11: "toolshop",
    12: "research_center", 13: "staff_area", 15: "chem_lab", 16: "medical_center",
    17: "headquarters", 18: "radio_tower",
}


def match_key(filename):
    """Map a downloaded filename onto (facility key, variant number).

    A reshoot lands beside the original as "18-1.jpg" or "18 (2).jpg"; the
    trailing number is the variant, and the highest one wins.
    """
    raw = os.path.splitext(os.path.basename(filename))[0].strip().lower()
    numbered = re.fullmatch(r"(\d+)(?:[\s._-]*\(?(\d+)\)?)?", raw)
    if numbered:
        return TYPE_KEYS.get(int(numbered.group(1))), int(numbered.group(2) or 0)

    stem = re.sub(r"[^a-z0-9]", "", raw)
    variant = re.search(r"(\d+)$", raw)
    best = None
    for key, aliases in ALIASES.items():
        for alias in aliases:
            if alias in stem and (best is None or len(alias) > best[1]):
                best = (key, len(alias))
    return (best[0] if best else None), int(variant.group(1) if variant else 0)


def pick_sentinel(img):
    used = {c for _, c in img.getcolors(maxcolors=1 << 24) or []}
    for colour in SENTINELS:
        if colour not in used:
            return colour
    raise SystemExit("image uses every sentinel colour; add another to SENTINELS")


def cut_background(img, thresh, key_thresh, min_area_frac, erode, hue_tol, sat_floor):
    """Return an alpha mask isolating the building from its flat backdrop.

    Two passes, unioned:

    1. Flood fill inward from the frame edge. Seed-relative, so it copes with a
       backdrop that isn't perfectly uniform.
    2. Global colour key, then connected-component labelling. A region counts as
       background if it touches the border *or* is big enough to be a real
       enclosed area (a courtyard, the gap inside a ring of walls, the space
       between a mast and its guy wires) -- which pass 1 can never reach. Small
       regions are left opaque, so backdrop-coloured detail painted into the art
       becomes a mark on a wall rather than a hole through it.
    """
    rgb = img.convert("RGB")
    sentinel = pick_sentinel(rgb)
    w, h = rgb.size
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),
             (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]
    for seed in seeds:
        if rgb.getpixel(seed) == sentinel:
            continue  # already cleared by an earlier seed
        ImageDraw.floodfill(rgb, seed, sentinel, thresh=thresh)
    filled = np.asarray(rgb, dtype=np.int16)
    background = np.all(filled == np.array(sentinel, dtype=np.int16), axis=2)

    arr = np.asarray(img.convert("RGB"), dtype=np.int16)
    border = np.concatenate([arr[0, :], arr[-1, :], arr[:, 0], arr[:, -1]])
    backdrop = np.median(border, axis=0)
    similar = np.sqrt(((arr - backdrop) ** 2).sum(axis=2)) < key_thresh

    # Hue is stable under shading where RGB distance is not: where the model has
    # painted a soft shadow onto the backdrop, the pink darkens but keeps its hue.
    # Requiring saturation as well keeps the building's own dark shadows opaque,
    # since those are desaturated and their hue is meaningless.
    hsv = np.asarray(img.convert("HSV"), dtype=np.int16)
    bh = np.median(np.concatenate([hsv[0, :], hsv[-1, :], hsv[:, 0], hsv[:, -1]]), axis=0)
    hue_gap = np.abs(hsv[:, :, 0] - bh[0])
    hue_gap = np.minimum(hue_gap, 256 - hue_gap)          # hue wraps at 256
    similar |= (hue_gap < hue_tol) & (hsv[:, :, 1] > sat_floor)

    labels, count = ndimage.label(similar)
    if count:
        edge_labels = set(np.unique(np.concatenate(
            [labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]])).tolist()) - {0}
        sizes = ndimage.sum(similar, labels, range(1, count + 1))
        min_area = min_area_frac * w * h
        keep = np.zeros(count + 1, dtype=bool)
        for i in range(1, count + 1):
            keep[i] = i in edge_labels or sizes[i - 1] >= min_area
        background |= keep[labels]

    alpha = Image.fromarray(np.where(background, 0, 255).astype(np.uint8), "L")
    # Erode, then soften: kills the ring of backdrop-tinted pixels that JPEG
    # artefacts and anti-aliasing leave along the silhouette, which would
    # otherwise read as a coloured halo against the dark compound floor.
    for _ in range(max(0, erode)):
        alpha = alpha.filter(ImageFilter.MinFilter(3))
    return alpha.filter(ImageFilter.GaussianBlur(0.6))


def neutralise(img, alpha, hue_tol, sat_floor, trigger, darken):
    """Recolour backdrop-hued pixels that are part of the artwork.

    Open lattice -- a watchtower leg, an antenna mast, a crane jib -- averages
    toward whatever is behind it, so the model paints those members in the
    backdrop colour however firmly the prompt says otherwise. They are structure,
    not background, so deleting them would punch the tower out of the image.
    Instead map them to neutral steel at the same brightness, which keeps the
    shading the model painted and just removes the hue.

    Only runs on sprites where enough of the artwork is affected to be a real
    problem, so an intentionally pink deckchair somewhere else stays pink.
    """
    arr = np.asarray(img.convert("RGB"), dtype=np.float32)
    hsv = np.asarray(img.convert("HSV"), dtype=np.int16)
    opaque = np.asarray(alpha, dtype=np.int16) > 128
    gap = np.abs(hsv[:, :, 0] - int(np.median(hsv[:, :, 0][~opaque]))) if (~opaque).any() else None
    if gap is None:
        return img, 0.0
    gap = np.minimum(gap, 256 - gap)
    tainted = opaque & (gap < hue_tol) & (hsv[:, :, 1] > sat_floor)

    share = tainted.sum() / max(opaque.sum(), 1)
    if share < trigger:
        return img, share

    lum = (0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]) * darken
    for channel, tint in enumerate((0.95, 0.99, 1.04)):    # faintly cool, like galvanised steel
        arr[:, :, channel] = np.where(tainted, np.clip(lum * tint, 0, 255), arr[:, :, channel])
    return Image.fromarray(arr.astype(np.uint8), "RGB"), share


def footprint_anchor(alpha, min_share):
    """Height fraction where the building's mass actually meets the ground.

    Some generations park a detached prop below the building -- a free-standing
    row of sandbags under the barracks, an awning and furniture below the staff
    house. Anchoring on the bounding box bottom then lifts the building itself
    off its tile and it reads as floating.

    The distinction is that those props are *detached*, so anchor on the bottom
    of the largest connected component. A width threshold cannot do this job: an
    isometric base pad tapers to a point, so the genuine bottom of a normal
    sprite is a single pixel wide and would be discarded.
    """
    mask = np.asarray(alpha, dtype=np.int16) > 128
    if not mask.any():
        return 1.0
    labels, count = ndimage.label(mask)
    if count <= 1:
        return 1.0
    sizes = ndimage.sum(mask, labels, range(1, count + 1))
    main = int(np.argmax(sizes)) + 1
    if sizes[main - 1] < mask.sum() * min_share:
        return 1.0                      # no dominant mass; trust the bounding box
    rows = np.flatnonzero((labels == main).any(axis=1))
    return float((rows.max() + 1) / mask.shape[0])


def process(path, out_dir, key, size, opts, dry_run):
    img = Image.open(path).convert("RGB")
    alpha = cut_background(img, opts.thresh, opts.key_thresh, opts.min_area, opts.erode,
                           opts.hue_tol, opts.sat_floor)

    img, tainted = neutralise(img, alpha, opts.hue_tol, opts.sat_floor,
                              opts.neutralise_above, opts.darken)
    out = img.convert("RGBA")
    out.putalpha(alpha)

    bbox = alpha.getbbox()
    if not bbox:
        return f"  !! {os.path.basename(path)}: background fill consumed the whole image"
    out = out.crop(bbox)

    w, h = out.size
    if max(w, h) > size:
        scale = size / max(w, h)
        out = out.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)

    hist = alpha.crop(bbox).histogram()
    covered = 100 * sum(hist[9:]) / (bbox[2] - bbox[0]) / (bbox[3] - bbox[1])
    dest = os.path.join(out_dir, f"{key}.{opts.format}")
    if not dry_run:
        os.makedirs(out_dir, exist_ok=True)
        if opts.format == "webp":
            out.save(dest, "WEBP", quality=opts.quality, method=6, exact=False)
        else:
            out.save(dest, "PNG", optimize=True)
    anchor = ANCHOR_OVERRIDES.get(key, footprint_anchor(out.getchannel("A"), opts.footprint))
    size_kb = os.path.getsize(dest) / 1024 if os.path.exists(dest) else 0
    note = f", {tainted*100:.1f}% recoloured to steel" if tainted >= opts.neutralise_above else ""
    lifted = f", anchor {anchor:.2f}" if anchor < 0.97 else ""
    return anchor, (f"  {os.path.basename(path)} -> {key}.{opts.format}  "
                    f"{out.size[0]}x{out.size[1]}px, {covered:.0f}% opaque, {size_kb:.0f} KB{note}{lifted}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--inbox", default=DEFAULT_INBOX, help="folder of raw Firefly downloads")
    ap.add_argument("--out", default=DEFAULT_OUT, help="where the finished sprites go")
    ap.add_argument("--size", type=int, default=384, help="max dimension of the output sprite")
    ap.add_argument("--format", choices=("webp", "png"), default="webp", help="output format")
    ap.add_argument("--quality", type=int, default=88, help="webp quality")
    ap.add_argument("--thresh", type=int, default=60, help="flood-fill tolerance, relative to the seed pixel")
    ap.add_argument("--key-thresh", type=int, default=70,
                    help="global colour-key tolerance; keep well below the distance from the "
                         "backdrop to the nearest palette colour (pink vs rust-red is ~104)")
    ap.add_argument("--min-area", type=float, default=0.0004,
                    help="enclosed regions at least this fraction of the frame count as background")
    ap.add_argument("--erode", type=int, default=1, help="pixels of edge erosion; raise to kill a halo")
    ap.add_argument("--hue-tol", type=int, default=14,
                    help="hue tolerance on a 0-255 wheel (14 is about 20 degrees); pink backdrop "
                         "sits near 235, rust-red roofs near 8, so there is wide separation")
    ap.add_argument("--sat-floor", type=int, default=60,
                    help="minimum saturation for the hue key, so the building's own neutral "
                         "shadows are never treated as backdrop")
    ap.add_argument("--neutralise-above", type=float, default=0.012,
                    help="recolour backdrop-hued artwork to steel once it exceeds this share "
                         "of the sprite; below it, pink detail is assumed intentional")
    ap.add_argument("--darken", type=float, default=0.72, help="brightness of the recoloured steel")
    ap.add_argument("--footprint", type=float, default=0.5,
                    help="share of a sprite the largest connected component must hold before "
                         "its base is trusted as the building's footprint")
    ap.add_argument("--dry-run", action="store_true", help="report what would happen, write nothing")
    args = ap.parse_args()

    if not os.path.isdir(args.inbox):
        sys.exit(f"inbox not found: {args.inbox}")

    files = [os.path.join(args.inbox, f) for f in sorted(os.listdir(args.inbox))
             if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))]
    if not files:
        sys.exit(f"no images in {args.inbox}")

    print(f"inbox  {args.inbox}\noutput {args.out}\n")
    unmatched, chosen, superseded = [], {}, []
    for path in files:
        key, variant = match_key(path)
        if not key:
            unmatched.append(os.path.basename(path))
            continue
        rank = (variant, os.path.getmtime(path))
        if key not in chosen or rank > chosen[key][0]:
            if key in chosen:
                superseded.append(os.path.basename(chosen[key][1]))
            chosen[key] = (rank, path)
        else:
            superseded.append(os.path.basename(path))

    anchors = {}
    for key in sorted(chosen):
        anchors[key], line = process(chosen[key][1], args.out, key, args.size, args, args.dry_run)
        print(line)

    # The renderer needs the anchors, and computing them in the browser would mean
    # decoding every sprite to a scratch canvas on load. Ship them alongside instead.
    if not args.dry_run and anchors:
        with open(os.path.join(args.out, "manifest.json"), "w", encoding="utf-8") as fh:
            json.dump({k: {"anchor": round(v, 4), "scale": SCALE_OVERRIDES.get(k, 1)}
                       for k, v in sorted(anchors.items())}, fh, indent=2)
        print(f"\nwrote manifest.json ({len(anchors)} sprites)")

    if superseded:
        print("\nsuperseded by a newer variant, skipped: " + ", ".join(sorted(superseded)))

    if unmatched:
        print("\nunrecognised filenames (rename to include the facility, or say which is which):")
        for name in unmatched:
            print("  " + name)


if __name__ == "__main__":
    main()
