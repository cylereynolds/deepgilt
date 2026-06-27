#!/usr/bin/env python3
"""Scenario.gg image generator for Deepgilt — drives the Scenario API (stdlib only).

Usage:
  python3 tools/scenario.py "<prompt>" <name> [model_xxx] [width height]
  python3 tools/scenario.py models [search]      # list public models (id | name | type)

Saves client/art/<name>.png. Reads 'apiKey:apiSecret' from .scenario_key.
Negative prompt via SCENARIO_NEG env. Default model = Super Top-Down 2.0.
"""
import json, sys, time, os, base64, pathlib, urllib.request, urllib.error
from urllib.parse import quote

ROOT = pathlib.Path(__file__).resolve().parent.parent
KEY = (ROOT / ".scenario_key").read_text().strip()
AUTH = "Basic " + base64.b64encode(KEY.encode()).decode()
BASE = "https://api.cloud.scenario.com/v1"
OUT = ROOT / "client" / "art"
DEFAULT_MODEL = "model_Q9E33EUR2BHQY1dqdMpjpsSf"   # Super Top-Down 2.0
NEG = os.environ.get("SCENARIO_NEG", "blurry, low quality, text, watermark, signature, ui, frame, border")
HEAD = {"Authorization": AUTH, "Content-Type": "application/json", "Accept": "application/json"}


def _req(url, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=HEAD, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read().decode()[:700]); raise


def _dl(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        path.write_bytes(r.read())


def list_models(search=None):
    page = 0
    while True:
        d = _req(BASE + "/models?privacy=public&pageSize=30" + ("&paginationToken=" + page if False else ""))
        ms = d.get("models", [])
        for m in ms:
            nm = m.get("name") or ""
            if not search or search.lower() in nm.lower():
                print(m.get("id"), "|", nm, "|", m.get("type", ""))
        nxt = d.get("nextPaginationToken")
        if not nxt or page >= 6:
            break
        page += 1


def main():
    if sys.argv[1] == "models":
        list_models(sys.argv[2] if len(sys.argv) > 2 else None); return
    prompt, name = sys.argv[1], sys.argv[2]
    args = sys.argv[3:]
    model = next((a for a in args if a.startswith("model_")), DEFAULT_MODEL)
    nums = [a for a in args if a.isdigit()]
    w = int(nums[0]) if len(nums) > 0 else 1024
    h = int(nums[1]) if len(nums) > 1 else 1024
    body = {"parameters": {"type": "txt2img", "prompt": prompt, "negativePrompt": NEG,
            "width": w, "height": h, "numSamples": 1, "numInferenceSteps": 30, "guidance": 3.5,
            "negativePromptStrength": 0.7}}
    r = _req(BASE + "/models/" + model + "/inferences", "POST", body)
    inf = r.get("inference") or r
    iid = inf.get("id")
    print("inference:", iid, "| model:", model, "| status:", inf.get("status"))
    for _ in range(90):
        t = _req(BASE + "/models/" + model + "/inferences/" + iid)
        inf = t.get("inference") or t
        st = inf.get("status")
        if st in ("succeeded", "success", "complete", "completed"):
            imgs = inf.get("images") or []
            if imgs:
                p = OUT / (name + ".png"); p.parent.mkdir(parents=True, exist_ok=True)
                url = imgs[0].get("url") if isinstance(imgs[0], dict) else imgs[0]
                _dl(url, p)
                print("saved", p, "(%d KB)" % (p.stat().st_size // 1024))
            else:
                print("succeeded but no images:", json.dumps(inf)[:400])
            return
        if st in ("failed", "error", "canceled", "cancelled"):
            print("FAILED:", json.dumps(inf)[:400]); sys.exit(1)
        time.sleep(4)
    print("timeout waiting for inference")


if __name__ == "__main__":
    main()
