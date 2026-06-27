"""Geas-scrolls: serialize, validate, and run shareable servant programs (DESIGN.md §7).

A scroll is {name, author, geas:[...]}. validate() checks every op against the
allowed instruction set and the total instruction count against the player's
geas_length budget (the Wyrd-derived cap from stats.py) — so scripting is gated
by the character, exactly as designed. Run:  python3 -m engine.scroll
"""
import json
from pathlib import Path
from . import data, geas

OPS = {i["op"] for i in data.geas_instructions["instructions"]} | {"IF", "REPEAT"}


def to_scroll(name, author, g):
    return {"name": name, "author": author, "geas": g}


def from_scroll(s):
    return s["geas"]


def _count(g):
    n = 0
    for instr in g:
        n += 1
        if "IF" in instr:
            n += _count(instr["IF"].get("then", [])) + _count(instr["IF"].get("else", []))
        elif "REPEAT" in instr:
            n += _count(instr["REPEAT"].get("body", []))
    return n


def validate(g, geas_length):
    """Returns (ok, errors, instruction_count)."""
    errs = []

    def walk(lst):
        for instr in lst:
            if "IF" in instr:
                walk(instr["IF"].get("then", []))
                walk(instr["IF"].get("else", []))
            elif "REPEAT" in instr:
                walk(instr["REPEAT"].get("body", []))
            elif instr.get("op") not in OPS:
                errs.append("unknown op: %r" % instr.get("op"))

    walk(g)
    used = _count(g)
    if used > geas_length:
        errs.append("geas too long: %d instructions > capacity %d" % (used, geas_length))
    return (not errs, errs, used)


def save(scroll, path):
    Path(path).write_text(json.dumps(scroll, indent=2))


def load(path):
    return json.loads(Path(path).read_text())


def main():
    s = data.scrolls.get("husk_farm") or to_scroll(
        "husk_farm", "system", data.geas_instructions["example_pc_farm_geas"]["geas"])
    print("scroll: '%s' by %s" % (s["name"], s.get("author", "?")))
    g = from_scroll(s)

    # The same scroll is accepted by a high-Wyrd binder and rejected by a low-Wyrd one.
    for cap in (10, 3):
        ok, errs, used = validate(g, cap)
        print("  validate @ geas_length %d -> %s (uses %d instructions)" % (
            cap, "OK" if ok else "REJECTED", used))
        for e in errs:
            print("      - " + e)

    print("\nrunning the scroll for 16 ticks:")
    w = geas.World()
    w.leader = geas.Ent(0, 0, 9999, name="binder")
    srv = geas.Ent(0, 0, 120, 22, "Husk-servant")
    srv.speed = 30
    srv.geas = g
    w.servants.append(srv)
    w.enemies = [geas.Ent(60, 0, 22, name="Drowned"),
                 geas.Ent(-50, 40, 22, name="Cultist"),
                 geas.Ent(20, -60, 22, name="Beast")]
    w.gilt = [geas.Gilt(40, 40, 12), geas.Gilt(-30, -30, 9)]
    geas.run(w, 16)
    print("  -> collected %d gilt, reached depth %d" % (w.collected, w.depth))


if __name__ == "__main__":
    main()
