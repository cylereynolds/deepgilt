"""Drives several clients into one authoritative server to prove the netcode:
two humans + one bot share a world, and all combat/gilt is resolved server-side.
Each 'agent' is identical code talking the same HTTP protocol — a bot is just a
client. Run the server first, then:  python3 server/play.py 8090
"""
import urllib.request, json, threading, time, sys

BASE = "http://127.0.0.1:%s" % (sys.argv[1] if len(sys.argv) > 1 else "8090")
RESULTS = {}


def post(path, obj):
    req = urllib.request.Request(BASE + path, data=json.dumps(obj).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=3))


def get(path):
    return json.load(urllib.request.urlopen(BASE + path, timeout=3))


def wait_for_server():
    for _ in range(60):
        try:
            get("/state"); return True
        except Exception:
            time.sleep(0.1)
    return False


def agent(cls, label, secs):
    pid = post("/join", {"cls": cls})["id"]
    end = time.time() + secs
    while time.time() < end:
        st = get("/state")
        me = next((p for p in st["players"] if p["id"] == pid), None)
        if me and not me["dead"] and st["monsters"]:
            nm = min(st["monsters"], key=lambda m: (m["x"] - me["x"]) ** 2 + (m["y"] - me["y"]) ** 2)
            post("/input", {"id": pid, "tx": nm["x"], "ty": nm["y"]})
        time.sleep(0.1)
    RESULTS[pid] = (label, cls)


def main():
    if not wait_for_server():
        print("server not reachable on", BASE); return
    secs = 6
    roster = [("human", "reaver"), ("human", "pyre"), ("BOT  ", "bonewright")]
    print("3 clients joining one authoritative world (2 humans + 1 bot), %ds..." % secs)
    threads = [threading.Thread(target=agent, args=(c, l, secs)) for (l, c) in roster]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    st = get("/state")
    print("\n-- authoritative final state @ tick %d, wave %d --" % (st["tick"], st["wave"]))
    for p in sorted(st["players"], key=lambda x: x["id"]):
        lbl, cls = RESULTS.get(p["id"], ("?", "?"))
        print("  #%d %s %-11s hp %4d/%-4d  gilt %3d  kills %d%s" %
              (p["id"], lbl, cls, p["hp"], p["mhp"], p["gilt"], p["kills"], "  (dead)" if p["dead"] else ""))
    print("  monsters still standing: %d" % len(st["monsters"]))
    print("\nclients only ever POSTed move-intents; the server rolled every hit, hp, and gilt.")


if __name__ == "__main__":
    main()
