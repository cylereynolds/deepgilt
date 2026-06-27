#!/usr/bin/env python3
"""Drive the local ComfyUI server (text-to-image) for environment art (stdlib only).

Usage:
  python3 tools/comfy.py "<prompt>" <name> [width height]

Saves client/art/env/<name>.png. Requires ComfyUI running on :8188 with
dreamshaper_8.safetensors in models/checkpoints/. Free + local, no tokens.
"""
import json, sys, time, uuid, random, os, pathlib, urllib.request
from urllib.parse import urlencode

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "client" / "art" / "env"
COMFY = "http://127.0.0.1:8188"
CKPT = "dreamshaper_8.safetensors"
# Default negative is tuned for flat top-down FLOOR tiles. Override via COMFY_NEG env
# (e.g. for a wall texture, which actively wants walls/verticality).
NEG = os.environ.get("COMFY_NEG", (
       "character, person, creature, monster, hands, text, watermark, signature, "
       "bright saturated colors, blurry, low quality, jpeg artifacts, perspective, walls, "
       "vignette, radial, spotlight, central focal point, circular pattern, mandala, "
       "dark corners, uneven lighting, symmetry"))


def _post(path, obj):
    req = urllib.request.Request(COMFY + path, data=json.dumps(obj).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def _get(path):
    return json.loads(urllib.request.urlopen(COMFY + path, timeout=30).read())


def workflow(prompt, w, h, seed):
    return {
        "4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}},
        "5": {"class_type": "EmptyLatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["4", 1]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": ["4", 1]}},
        "3": {"class_type": "KSampler", "inputs": {"seed": seed, "steps": 28, "cfg": 7.0,
              "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0,
              "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0]}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "deepgilt", "images": ["8", 0]}},
    }


def main():
    prompt, name = sys.argv[1], sys.argv[2]
    w = int(sys.argv[3]) if len(sys.argv) > 3 else 512
    h = int(sys.argv[4]) if len(sys.argv) > 4 else 512
    cid = uuid.uuid4().hex
    r = _post("/prompt", {"prompt": workflow(prompt, w, h, random.randint(1, 2**31)), "client_id": cid})
    if r.get("node_errors"):
        print("node_errors:", r["node_errors"]); sys.exit(1)
    pid = r["prompt_id"]
    print("queued:", pid)
    for _ in range(150):
        hist = _get("/history/" + pid)
        if pid in hist:
            imgs = []
            for node in hist[pid].get("outputs", {}).values():
                imgs += node.get("images", [])
            if imgs:
                img = imgs[0]
                q = urlencode({"filename": img["filename"], "subfolder": img.get("subfolder", ""),
                               "type": img.get("type", "output")})
                OUT.mkdir(parents=True, exist_ok=True)
                p = OUT / (name + ".png")
                with urllib.request.urlopen(COMFY + "/view?" + q, timeout=60) as resp:
                    p.write_bytes(resp.read())
                print("saved", p, "(%d KB)" % (p.stat().st_size // 1024))
                return
            print("done but no images:", hist[pid].get("status")); return
        time.sleep(2)
    print("timeout (model still loading? try again)")


if __name__ == "__main__":
    main()
