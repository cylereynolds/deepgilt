"""Deepgilt authoritative game server (stdlib only).

The server owns the world and runs all the math through the Python engine:
clients send *intents* (where to move), never damage. Combat, hp, gilt, death,
and respawns are resolved server-side on a 10 Hz tick. Every client — human or
bot — talks the same tiny HTTP protocol, which is the whole thesis: a bot is
just another client.

  POST /join   {cls}          -> {id}
  POST /input  {id, tx, ty}   -> {ok}
  GET  /state                 -> world snapshot

Run:  python3 server/server.py 8090
"""
import json, os, sys, time, random, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from engine import stats, combat, data
from engine import monsters as mon

CW, CH, TICK = 640, 360, 0.1
RNG = random.Random(20)
LOCK = threading.Lock()
CLASS_ATTRS = {
    "reaver": {"might": 50, "finesse": 18, "vigor": 40, "wit": 12, "wyrd": 14},
    "pyre": {"might": 14, "finesse": 20, "vigor": 28, "wit": 55, "wyrd": 18},
    "bonewright": {"might": 14, "finesse": 20, "vigor": 30, "wit": 30, "wyrd": 55},
    "warden": {"might": 42, "finesse": 16, "vigor": 42, "wit": 18, "wyrd": 26},
    "stalker": {"might": 20, "finesse": 52, "vigor": 30, "wit": 16, "wyrd": 16},
    "feral": {"might": 26, "finesse": 24, "vigor": 50, "wit": 14, "wyrd": 30},
}
HUSK = [m for m in data.monsters["monsters"] if m["id"] == "husk"][0]
W = {"tick": 0, "wave": 1, "players": {}, "monsters": [], "nid": 1, "nmid": 1}


def weapon_packet():
    w = data.affixes  # roll a real wrought weapon for the damage packet
    from engine import items
    it = items.roll_item("weapon", 40, "wrought", RNG, "Reaping Scythe", {"dmg_min": 18, "dmg_max": 41})
    ed = sum(a["value"] for a in it.affixes if a["stat"] == "ed_pct")
    flat = sum(a["value"] for a in it.affixes if a["stat"] == "flat_steel")
    return {"steel": ((18 + flat) * (1 + ed / 100.0), (41 + flat) * (1 + ed / 100.0))}


def spawn_wave(n, depth):
    out = []
    for _ in range(n):
        sc = mon.scale(HUSK, depth)
        out.append({"mid": new_mid(), "x": RNG.uniform(60, CW - 60), "y": RNG.uniform(40, CH - 40),
                    "hp": sc["hp"], "mhp": sc["hp"], "dmg": sc["dmg"], "level": sc["level"],
                    "def": mon.to_defender(sc), "acd": 0})
    return out


def new_id():
    W["nid"] += 1; return W["nid"] - 1


def new_mid():
    W["nmid"] += 1; return W["nmid"] - 1


def dist(a, b):
    return ((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2) ** 0.5


def step():
    W["tick"] += 1
    alive = [m for m in W["monsters"] if m["hp"] > 0]
    if not alive:
        W["wave"] += 1
        W["monsters"] = spawn_wave(4 + W["wave"], W["wave"])
        alive = W["monsters"]
    now = time.time()
    for p in W["players"].values():
        if p["dead"]:
            if now >= p["respawn"]:
                p["dead"] = False; p["hp"] = p["mhp"]; p["x"], p["y"] = CW / 2, CH / 2
            continue
        dx, dy = p["tx"] - p["x"], p["ty"] - p["y"]
        d = (dx * dx + dy * dy) ** 0.5
        if d > 4:
            p["x"] += dx / d * 10; p["y"] += dy / d * 10
        t = min(alive, key=lambda m: dist(p, m)) if alive else None
        if t and dist(p, t) < 42 and p["acd"] <= 0:
            r = combat.resolve(p["der"], t["def"], p["packet"], 24, t["level"], RNG)  # server-authoritative
            p["acd"] = 8
            if r["hit"]:
                t["hp"] -= r["damage"]
                if t["hp"] <= 0:
                    p["gilt"] += 4 + W["wave"]; p["kills"] += 1
        else:
            p["acd"] -= 1
    alive = [m for m in W["monsters"] if m["hp"] > 0]
    players = [p for p in W["players"].values() if not p["dead"]]
    for m in alive:
        if not players:
            break
        tp = min(players, key=lambda p: dist(m, p))
        if dist(m, tp) > 22:
            ddx, ddy = tp["x"] - m["x"], tp["y"] - m["y"]; dd = (ddx * ddx + ddy * ddy) ** 0.5 or 1
            m["x"] += ddx / dd * 6; m["y"] += ddy / dd * 6
        elif m["acd"] <= 0:
            tp["hp"] -= m["dmg"]; m["acd"] = 5
            if tp["hp"] <= 0:
                tp["dead"] = True; tp["respawn"] = now + 3.0
                players = [p for p in players if not p["dead"]]
        else:
            m["acd"] -= 1


def tick_loop():
    W["monsters"] = spawn_wave(5, 1)
    while True:
        with LOCK:
            step()
        time.sleep(TICK)


def snapshot():
    return {"tick": W["tick"], "wave": W["wave"],
            "players": [{"id": p["id"], "cls": p["cls"], "x": round(p["x"]), "y": round(p["y"]),
                         "hp": round(p["hp"]), "mhp": p["mhp"], "gilt": p["gilt"], "kills": p["kills"], "dead": p["dead"]}
                        for p in W["players"].values()],
            "monsters": [{"x": round(m["x"]), "y": round(m["y"]), "hp": round(m["hp"]), "mhp": m["mhp"]}
                         for m in W["monsters"] if m["hp"] > 0]}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send({})

    def _body(self):
        n = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        if self.path.startswith("/state"):
            with LOCK:
                self._send(snapshot())
        else:
            self._send({"ok": True, "msg": "deepgilt server"})

    def do_POST(self):
        b = self._body()
        if self.path == "/join":
            cls = b.get("cls", "bonewright")
            attrs = CLASS_ATTRS.get(cls, CLASS_ATTRS["bonewright"])
            with LOCK:
                pid = new_id()
                W["players"][pid] = {"id": pid, "cls": cls, "x": CW / 2, "y": CH / 2,
                                     "tx": CW / 2, "ty": CH / 2, "hp": stats.derived(attrs, 24, cls, {})["life"],
                                     "mhp": stats.derived(attrs, 24, cls, {})["life"],
                                     "der": stats.derived(attrs, 24, cls, {}), "packet": weapon_packet(),
                                     "acd": 0, "gilt": 0, "kills": 0, "dead": False, "respawn": 0}
            self._send({"id": pid})
        elif self.path == "/input":
            with LOCK:
                p = W["players"].get(b.get("id"))
                if p:
                    p["tx"] = max(12, min(CW - 12, float(b.get("tx", p["tx"]))))
                    p["ty"] = max(12, min(CH - 12, float(b.get("ty", p["ty"]))))
            self._send({"ok": True})
        else:
            self._send({"ok": False}, 404)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
    threading.Thread(target=tick_loop, daemon=True).start()
    print("deepgilt server on :%d (authoritative, 10 Hz)" % port)
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
