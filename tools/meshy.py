#!/usr/bin/env python3
"""Meshy 3D-art generator for Deepgilt — drives Meshy's text-to-3D API (stdlib only).

Usage:
  python3 tools/meshy.py gen "<prompt>" <name> [--refine]   # submit + poll + download
  python3 tools/meshy.py poll <task_id> <name>              # poll an existing task + download

Reads the key from .meshy_key (gitignored). Saves to client/art/models/<name>.glb
(+ <name>_thumb.<ext>). --refine adds the textured pass (slower, more credits).
"""
import json, sys, time, pathlib, urllib.request, urllib.error

ROOT = pathlib.Path(__file__).resolve().parent.parent
KEY = (ROOT / ".meshy_key").read_text().strip()
OUT = ROOT / "client" / "art" / "models"
BASE = "https://api.meshy.ai/openapi/v2/text-to-3d"
HEAD = {"Authorization": "Bearer " + KEY, "Content-Type": "application/json"}


def _req(url, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=HEAD, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read().decode()[:400])
        raise


def submit(prompt, mode="preview", preview_task_id=None):
    body = {"mode": mode, "art_style": "realistic", "should_remesh": True}
    if mode == "preview":
        body["prompt"] = prompt
        body["negative_prompt"] = "low quality, blurry, bright colors, cartoon"
    else:
        body["preview_task_id"] = preview_task_id
    return _req(BASE, "POST", body)["result"]


RIG = "https://api.meshy.ai/openapi/v1/rigging"
ANIM = "https://api.meshy.ai/openapi/v1/animations"


def get(tid, base=BASE):
    return _req(base + "/" + tid)


def poll(tid, label="", base=BASE):
    last = None
    while True:
        t = get(tid, base)
        s, p = t.get("status"), t.get("progress", 0)
        if (s, p) != last:
            print("  [%s] %s %s%%" % (label or tid[:8], s, p), flush=True)
            last = (s, p)
        if s == "SUCCEEDED":
            return t
        if s in ("FAILED", "EXPIRED", "CANCELED"):
            print("  task ended:", s, t.get("task_error"))
            sys.exit(1)
        time.sleep(6)


def fetch(task, name):
    OUT.mkdir(parents=True, exist_ok=True)
    glb = (task.get("model_urls") or {}).get("glb")
    thumb = task.get("thumbnail_url")
    if glb:
        path = OUT / (name + ".glb")
        urllib.request.urlretrieve(glb, path)
        print("  saved", path, "(%d KB)" % (path.stat().st_size // 1024))
    if thumb:
        ext = ".png" if ".png" in thumb.split("?")[0] else ".jpg"
        path = OUT / (name + "_thumb" + ext)
        urllib.request.urlretrieve(thumb, path)
        print("  saved", path)


def main():
    a = sys.argv[1:]
    if not a:
        print(__doc__); sys.exit(1)
    if a[0] == "poll":
        fetch(poll(a[1], a[2]), a[2])
    elif a[0] == "gen":
        prompt, name = a[1], a[2]
        pid = submit(prompt, "preview"); print("preview task:", pid)
        t = poll(pid, name + "-preview")
        if "--refine" in a:
            rid = submit(None, "refine", pid); print("refine task:", rid)
            t = poll(rid, name + "-refine")
        fetch(t, name)
    elif a[0] == "refine":
        # refine an EXISTING preview task id -> textured model. refine <preview_task_id> <name>
        pid, name = a[1], a[2]
        rid = submit(None, "refine", pid); print("refine task:", rid)
        fetch(poll(rid, name + "-refine"), name)
    elif a[0] == "rig":
        src, name = a[1], a[2]
        rid = _req(RIG, "POST", {"input_task_id": src, "height_meters": 1.7})["result"]
        print("rigging task:", rid)
        res = poll(rid, name, base=RIG).get("result") or {}
        OUT.mkdir(parents=True, exist_ok=True)
        ba = res.get("basic_animations") or {}
        grabs = {name + "_rigged.glb": res.get("rigged_character_glb_url"),
                 name + "_walk.glb": ba.get("walking_glb_url"),
                 name + "_run.glb": ba.get("running_glb_url")}
        for fn, url in grabs.items():
            if url:
                p = OUT / fn
                urllib.request.urlretrieve(url, p)
                print("  saved", p, "(%d KB)" % (p.stat().st_size // 1024))
    elif a[0] == "anim":
        # anim <rig_task_id> <action_id> <name>  -> apply a library animation, save <name>.glb
        src, action, name = a[1], int(a[2]), a[3]
        rid = _req(ANIM, "POST", {"rig_task_id": src, "action_id": action})["result"]
        print("animation task:", rid)
        t = poll(rid, name, base=ANIM)
        res = t.get("result") or {}
        url = res.get("animation_glb_url") or t.get("animation_glb_url") or res.get("glb")
        if url:
            OUT.mkdir(parents=True, exist_ok=True)
            p = OUT / (name + ".glb")
            urllib.request.urlretrieve(url, p)
            print("  saved", p, "(%d KB)" % (p.stat().st_size // 1024))
        else:
            print("no animation_glb_url; task keys:", list(t.keys()), "result keys:", list(res.keys()))
    else:
        print(__doc__); sys.exit(1)


if __name__ == "__main__":
    main()
