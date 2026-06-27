#!/usr/bin/env python3
"""Snap images to the DeepGilt palette so vendor/source art coheres with the game.

Modes:
  build a palette from sample images (median-cut, combined):
    python3 tools/quantize_to_palette.py build dg_palette.json <img...> [ncolors]
  recolor one file:
    python3 tools/quantize_to_palette.py <src.png> <dst.png>
  recolor a whole folder (png):
    python3 tools/quantize_to_palette.py --batch <srcdir> <dstdir>

Palette source of truth: dg_palette.json at repo root (a JSON list of "#rrggbb").
Falls back to the embedded PALETTE_HEX if that file is absent. Recolor maps every
pixel to its nearest palette colour (no dither) and preserves alpha.
"""
import sys, json, pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAL_JSON = ROOT / "dg_palette.json"

# Fallback only — the real palette is dg_palette.json (built from the project's own tiles).
PALETTE_HEX = ["#0d120c", "#172013", "#1f2c18", "#2b3a20", "#3a4d29", "#4a5f33",
               "#2a2118", "#3a2e1f", "#4d3d28", "#5f4d34", "#6f5a3d",
               "#26262a", "#3a3a40", "#4f4f57", "#6a6a72"]


def load_palette():
    hexes = json.loads(PAL_JSON.read_text()) if PAL_JSON.exists() else PALETTE_HEX
    return [tuple(int(h.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)) for h in hexes]


def palette_image(rgbs):
    pal = Image.new("P", (1, 1))
    flat = []
    for c in rgbs:
        flat += list(c)
    flat += flat[:3] * (256 - len(rgbs))          # pad to 256 entries
    pal.putpalette(flat[:768])
    return pal


def recolor(src, dst, pal_img):
    im = Image.open(src).convert("RGBA")
    rgb, a = im.convert("RGB"), im.getchannel("A")
    q = rgb.quantize(palette=pal_img, dither=Image.Dither.NONE).convert("RGB")
    q.putalpha(a)
    pathlib.Path(dst).parent.mkdir(parents=True, exist_ok=True)
    q.save(dst)
    print("recolored", pathlib.Path(dst).name)


def build(out_json, imgs, ncolors):
    # combine samples, median-cut to ncolors, dump hex
    base = Image.open(imgs[0]).convert("RGB")
    W = base.width
    canvas = Image.new("RGB", (W, base.height * len(imgs)))
    for i, p in enumerate(imgs):
        im = Image.open(p).convert("RGB").resize((W, base.height))
        canvas.paste(im, (0, base.height * i))
    pal = canvas.quantize(colors=ncolors, method=Image.Quantize.MEDIANCUT)
    raw = pal.getpalette()[:ncolors * 3]
    hexes = ["#%02x%02x%02x" % (raw[i], raw[i + 1], raw[i + 2]) for i in range(0, len(raw), 3)]
    pathlib.Path(out_json).write_text(json.dumps(hexes, indent=2))
    print("built", out_json, "with", len(hexes), "colors")


def main():
    a = sys.argv
    if a[1] == "build":
        out, rest = a[2], a[3:]
        nc = int(rest[-1]) if rest[-1].isdigit() else 28
        imgs = [x for x in rest if not x.isdigit()]
        build(out, imgs, nc); return
    pal_img = palette_image(load_palette())
    if a[1] == "--batch":
        srcdir, dstdir = pathlib.Path(a[2]), pathlib.Path(a[3])
        for p in sorted(srcdir.glob("*.png")):
            recolor(p, dstdir / p.name, pal_img)
    else:
        recolor(a[1], a[2], pal_img)


if __name__ == "__main__":
    main()
