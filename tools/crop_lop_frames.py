#!/usr/bin/env python3
"""
Offline crop tool for Lords-of-Pain character frames (perf foundation for LopAnim).

The pack frames are 256x256 but the figure is only ~16% of that — the rest is transparent
padding + a baked directional shadow. Drawing the padded frame means a ~900px drawImage for a
~145px figure. This tool crops each character's frames to ONE fixed per-character box (the
union of the figure bboxes across all frames + a margin), so:
  * the crop is IDENTICAL for every frame/direction  -> the figure's relative position is
    preserved -> the walk motion is intact and NO artificial anchor jitter is added.
  * the baked shadow is dropped (it points different ways per direction and would bloat the
    box); LopAnim adds a cheap procedural contact-shadow ellipse instead.

Figure bbox excludes the soft baked shadow via an alpha threshold (same method used to measure
the warrior). Output goes to a NEW location (client/art/lop_cropped/, gitignored — it's derived
from the redistribution-restricted pack). Prints the per-character anchor numbers for LopAnim.

Usage:  python3 tools/crop_lop_frames.py <character> [src_dir]
        e.g.  python3 tools/crop_lop_frames.py warrior
              python3 tools/crop_lop_frames.py gravelight client/art/blender_gen/gravelight
        With no src_dir the char folder is searched under the LoP pack (playable character /
        enemy / boss / none-playable character). Pass src_dir to crop Blender-generated frames.
"""
import os, sys, glob, json
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "client", "art", "lords_of_pain")
OUT_ROOT = os.path.join(os.path.dirname(__file__), "..", "client", "art", "lop_cropped")
THR = 160          # alpha >= THR counts as "figure" (excludes the soft shadow)
MARGIN = 6         # px padding kept around the union figure bbox
FIGSCALE = 0.85    # target on-screen figure height as a fraction of the H passed to draw()

CATEGORIES = ["playable character", "enemy", "boss", "none-playable character"]

def find_char_dir(char):
    for cat in CATEGORIES:
        d = os.path.join(ROOT, cat, char)
        if os.path.isdir(d):
            return d, cat
    return None, None

def fig_bbox(path):
    a = Image.open(path).convert("RGBA").split()[3]
    return a.point(lambda v: 255 if v >= THR else 0).getbbox()

def main():
    if len(sys.argv) < 2:
        print("usage: crop_lop_frames.py <character>"); sys.exit(1)
    char = sys.argv[1]
    if len(sys.argv) >= 3:                                   # explicit source dir (e.g. Blender-generated)
        cdir = os.path.abspath(sys.argv[2]); cat = "generated"
        if not os.path.isdir(cdir): print("src dir not found:", cdir); sys.exit(1)
    else:
        cdir, cat = find_char_dir(char)
        if not cdir: print("character not found:", char); sys.exit(1)
    frames = sorted(glob.glob(os.path.join(cdir, "**", "*.png"), recursive=True))   # recursive: handles char (group/dir/file) AND prop (dir/file) layouts
    if not frames:
        print("no frames under", cdir); sys.exit(1)

    # pass 1: union figure bbox + mean feet / figure height across ALL frames
    ux0=uy0=10**9; ux1=uy1=-1; bottoms=[]; tops=[]; n=0
    for p in frames:
        bb = fig_bbox(p)
        if not bb: continue
        ux0=min(ux0,bb[0]); uy0=min(uy0,bb[1]); ux1=max(ux1,bb[2]); uy1=max(uy1,bb[3])
        tops.append(bb[1]); bottoms.append(bb[3]); n+=1

    W,H = Image.open(frames[0]).size
    cx0=max(0,ux0-MARGIN); cy0=max(0,uy0-MARGIN); cx1=min(W,ux1+MARGIN); cy1=min(H,uy1+MARGIN)
    cropW=cx1-cx0; cropH=cy1-cy0
    mean_feet=sum(bottoms)/len(bottoms); mean_top=sum(tops)/len(tops)
    mean_figH=mean_feet-mean_top
    FEET=(mean_feet-cy0)/cropH                     # feet point as fraction down the cropped frame
    KH=FIGSCALE*cropH/mean_figH                    # drawH = H*KH  ->  figure ends up FIGSCALE*H tall
    # horizontal: figure center vs crop center (for XOFF if not centered)
    figcx=(ux0+ux1)/2; cropcx=(cx0+cx1)/2; XOFF=(figcx-cropcx)/cropW

    # pass 2: crop every frame to the SAME box -> output (mirrors subpath under lop_cropped/<char>/)
    out_base=os.path.join(OUT_ROOT, char); written=0
    for p in frames:
        rel=os.path.relpath(p, cdir)               # e.g. warrior_armed_walk/SE/...png
        op=os.path.join(out_base, rel); os.makedirs(os.path.dirname(op), exist_ok=True)
        Image.open(p).convert("RGBA").crop((cx0,cy0,cx1,cy1)).save(op)
        written+=1

    cfg={"char":char,"category":cat,"cropBox":[cx0,cy0,cx1,cy1],"cropW":cropW,"cropH":cropH,
         "FEET":round(FEET,3),"KH":round(KH,3),"XOFF":round(XOFF,3),
         "figScale":FIGSCALE,"frames":written}
    with open(os.path.join(out_base,"_anchor.json"),"w") as f: json.dump(cfg,f,indent=2)

    print(f"char={char} ({cat})  frames={n}")
    print(f"  union figure bbox = ({ux0},{uy0})-({ux1},{uy1})")
    print(f"  CROP box = ({cx0},{cy0})-({cx1},{cy1})  -> {cropW}x{cropH}  (was {W}x{H})")
    print(f"  mean feet y={mean_feet:.1f}  mean figH={mean_figH:.1f}")
    print(f"  ANCHOR for LopAnim:  FEET={FEET:.3f}  KH={KH:.3f}  XOFF={XOFF:.3f}")
    print(f"  overdraw: padded square ~{(W*FIGSCALE/ (mean_figH/H)):.0f}px (H-relative); cropped frame native {cropW}x{cropH}")
    print(f"  wrote {written} frames -> {out_base}")

if __name__=="__main__":
    main()
