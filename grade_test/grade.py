#!/usr/bin/env python3
"""
THROWAWAY color-grade gut-check for DeepGilt's "Mario-bright" ground.
NOT wired into the engine. Operates on a static source image only.

Goal: see whether desaturate + darken + earth-tint + posterize + pixelate
turns the bright/smooth AI ground into a dark, grimy, old-school pixelated D2 look.

Each transform is a tiny pure function; each output variant prints its exact params.
"""
import os
from PIL import Image, ImageEnhance, ImageChops, ImageOps, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "00_original.png")

# ---- transforms -------------------------------------------------------------
def desaturate(im, reduce):           # reduce=0.40 -> keep 60% of saturation
    return ImageEnhance.Color(im).enhance(1.0 - reduce)

def darken(im, amount):               # amount=0.15 -> 15% darker (brightness x0.85)
    return ImageEnhance.Brightness(im).enhance(1.0 - amount)

def tint_multiply(im, color, strength):   # multiply by a muted color, blended at `strength`
    solid = Image.new("RGB", im.size, color)
    mult = ImageChops.multiply(im, solid)
    return Image.blend(im, mult, strength)   # 0=no tint, 1=full multiply

def posterize(im, bits):              # bits=4 -> 16 levels/channel (limited-palette feel)
    return ImageOps.posterize(im.convert("RGB"), bits)

def pixelate(im, div):                # downscale 1/div (avg) then NEAREST upscale -> chunky pixels
    w, h = im.size
    small = im.resize((max(1, w // div), max(1, h // div)), Image.LANCZOS)
    return small.resize((w, h), Image.NEAREST)

# muted tint colors (as requested)
BROWN = (120, 100, 80)     # desaturated earth-brown
COLD  = (90, 95, 110)      # cold gray-blue

orig = Image.open(SRC).convert("RGB")
out = {}   # label -> (image, param-string)

def save(name, im, params):
    p = os.path.join(HERE, name)
    im.save(p)
    out[name] = (im, params)
    print(f"{name:34s} {params}")

print(f"source: {SRC}  size={orig.size}\n--- variants ---")

# 01 desaturate + darken only
v = darken(desaturate(orig, 0.55), 0.22)
save("01_desat_dark.png", v, "desat 55% + darken 22%")

# 02 + earth-tone multiply tint
v2 = tint_multiply(v, BROWN, 0.50)
save("02_desat_dark_tint.png", v2, "01 + multiply brown(120,100,80) @50%")

# 03 full grade: desat + darken + tint + posterize  (no pixelate)
v3 = posterize(v2, 4)
save("03_full_grade.png", v3, "02 + posterize 4-bit (16 levels/ch)")

# 04 full grade + pixelate (the intended 'full D2 look')
save("04_full_grade_pixelated.png", pixelate(v3, 6), "03 + pixelate /6 (NEAREST upscale)")

# 05 pixelate ONLY (no grade) — isolates pixelation's contribution
save("05_pixelate_only.png", pixelate(orig, 6), "original + pixelate /6 only")

# --- a few extra strength points so the ladder shows where to push ----------
# 06 stronger grade: 65% desat + 30% darker + colder tint + posterize
s = posterize(tint_multiply(darken(desaturate(orig, 0.65), 0.30), BROWN, 0.55), 4)
save("06_grade_strong.png", s, "desat 65% + darken 30% + brown@55% + post4")

# 07 strong grade + chunkier pixelate, cold tint variant
sc = posterize(tint_multiply(darken(desaturate(orig, 0.60), 0.28), COLD, 0.50), 4)
save("07_grade_cold_pix.png", pixelate(sc, 9), "desat 60% + dark 28% + cold@50% + post4 + pixelate /9")

# ---- contact sheet ----------------------------------------------------------
order = ["00_original.png", "01_desat_dark.png", "02_desat_dark_tint.png",
         "03_full_grade.png", "04_full_grade_pixelated.png", "05_pixelate_only.png",
         "06_grade_strong.png", "07_grade_cold_pix.png"]
labels = {
    "00_original.png": "00 ORIGINAL (town ground)",
    "01_desat_dark.png": "01 desat55 + dark22",
    "02_desat_dark_tint.png": "02 + brown tint @50",
    "03_full_grade.png": "03 + posterize (full grade)",
    "04_full_grade_pixelated.png": "04 full grade + pixelate /6",
    "05_pixelate_only.png": "05 pixelate ONLY (no grade)",
    "06_grade_strong.png": "06 STRONG grade (65/30)",
    "07_grade_cold_pix.png": "07 cold tint + pixelate /9",
}

TW, cols, pad, lab = 420, 3, 14, 30
aspect = orig.size[1] / orig.size[0]
TH = int(TW * aspect)
rows = (len(order) + cols - 1) // cols
sheetW = cols * TW + (cols + 1) * pad
sheetH = rows * (TH + lab) + (rows + 1) * pad
sheet = Image.new("RGB", (sheetW, sheetH), (18, 16, 22))
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 20)
except Exception:
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 20)
    except Exception:
        font = ImageFont.load_default()

for i, name in enumerate(order):
    im = (out[name][0] if name in out else Image.open(os.path.join(HERE, name))).convert("RGB")
    thumb = im.resize((TW, TH), Image.LANCZOS)
    c, r = i % cols, i // cols
    x = pad + c * (TW + pad)
    y = pad + r * (TH + lab)
    draw.rectangle([x - 1, y - 1, x + TW, y + TH], outline=(60, 54, 70))
    sheet.paste(thumb, (x, y))
    draw.text((x + 4, y + TH + 5), labels[name], fill=(225, 215, 195), font=font)

cs = os.path.join(HERE, "_compare.png")
sheet.save(cs)
print(f"\ncontact sheet -> {cs}  ({sheetW}x{sheetH})")
