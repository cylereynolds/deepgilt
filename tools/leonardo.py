#!/usr/bin/env python3
"""Leonardo image generator for Deepgilt — drives the Leonardo API (stdlib only).

Usage:
  python3 tools/leonardo.py "<prompt>" <name> [width height]

Saves client/art/<name>.png. Uses Lucid Origin by default (the look you liked).
Reads the key from .leonardo_key (gitignored).
"""
import json, sys, time, os, pathlib, urllib.request, urllib.error

ROOT = pathlib.Path(__file__).resolve().parent.parent
KEY = (ROOT / ".leonardo_key").read_text().strip()
OUT = ROOT / "client" / "art"
BASE = "https://cloud.leonardo.ai/api/rest/v1"
MODEL = "7b592283-e8a7-4c5a-9ba6-d18c31f258b9"  # Lucid Origin
HEAD = {"authorization": "Bearer " + KEY, "accept": "application/json", "content-type": "application/json"}
NEG = os.environ.get("LEO_NEG") or ("pixel art, 8-bit, bright saturated colors, cartoon, anime, cel-shaded, photoreal, "
       "modern clothing, close-up, cropped, multiple characters, extra limbs, deformed hands, "
       "text, watermark, busy background")


def _req(url, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=HEAD, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read().decode()[:500])
        raise


def _dl(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        path.write_bytes(r.read())


def main():
    if sys.argv[1] == "get":
        gid, name = sys.argv[2], sys.argv[3]
        gen = _req(BASE + "/generations/" + gid).get("generations_by_pk") or {}
        imgs = gen.get("generated_images") or []
        OUT.mkdir(parents=True, exist_ok=True)
        if imgs:
            p = OUT / (name + ".png"); _dl(imgs[0]["url"], p)
            print("saved", p, "(%d KB)" % (p.stat().st_size // 1024))
        else:
            print("no images for", gid)
        return
    prompt, name = sys.argv[1], sys.argv[2]
    w = int(sys.argv[3]) if len(sys.argv) > 3 else 832
    h = int(sys.argv[4]) if len(sys.argv) > 4 else 1248
    body = {"prompt": prompt, "modelId": MODEL, "width": w, "height": h,
            "num_images": 1, "negative_prompt": NEG}
    job = _req(BASE + "/generations", "POST", body)["sdGenerationJob"]
    gid = job["generationId"]
    print("generation:", gid, "| cost:", job.get("apiCreditCost"))
    for _ in range(75):
        gen = _req(BASE + "/generations/" + gid).get("generations_by_pk") or {}
        st = gen.get("status")
        if st == "COMPLETE":
            imgs = gen.get("generated_images") or []
            if imgs:
                OUT.mkdir(parents=True, exist_ok=True)
                p = OUT / (name + ".png")
                _dl(imgs[0]["url"], p)
                print("saved", p, "(%d KB)" % (p.stat().st_size // 1024))
            else:
                print("complete but no images")
            return
        if st == "FAILED":
            print("generation FAILED"); sys.exit(1)
        time.sleep(4)
    print("timeout waiting for generation")


if __name__ == "__main__":
    main()
