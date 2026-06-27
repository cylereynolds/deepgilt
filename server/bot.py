"""A persistent bot client — joins the server and farms forever via the same
HTTP protocol a human uses. Proof that 'a bot is just another client.'
Run:  python3 server/bot.py 8090 feral
"""
import urllib.request, json, time, sys

BASE = "http://127.0.0.1:%s" % (sys.argv[1] if len(sys.argv) > 1 else "8090")
CLS = sys.argv[2] if len(sys.argv) > 2 else "feral"


def post(p, o):
    r = urllib.request.Request(BASE + p, data=json.dumps(o).encode(), headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(r, timeout=3))


def get(p):
    return json.load(urllib.request.urlopen(BASE + p, timeout=3))


def main():
    pid = post("/join", {"cls": CLS})["id"]
    print("bot joined as %s (id %d)" % (CLS, pid))
    end = time.time() + 300
    while time.time() < end:
        try:
            st = get("/state")
            me = next((p for p in st["players"] if p["id"] == pid), None)
            if me and not me["dead"] and st["monsters"]:
                nm = min(st["monsters"], key=lambda m: (m["x"] - me["x"]) ** 2 + (m["y"] - me["y"]) ** 2)
                post("/input", {"id": pid, "tx": nm["x"], "ty": nm["y"]})
        except Exception:
            pass
        time.sleep(0.12)


if __name__ == "__main__":
    main()
