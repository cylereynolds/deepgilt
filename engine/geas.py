"""The bind/geas interpreter: runs a servant's geas against a tiny world (DESIGN.md §7).

Consumes the same instruction shape stored in data/geas_instructions.json, so the
design data literally drives behavior. This is the seed of the PC botting layer.
"""
import math


class Ent:
    def __init__(self, x, y, hp, dmg=0, name="?"):
        self.x, self.y = x, y
        self.hp = self.maxhp = hp
        self.dmg = dmg
        self.name = name
        self.speed = 22
        self.geas = []


class Gilt:
    def __init__(self, x, y, amt):
        self.x, self.y, self.amt = x, y, amt


class World:
    def __init__(self):
        self.servants, self.enemies, self.gilt = [], [], []
        self.collected = 0
        self.depth = 1
        self.log = []
        self.leader = None


def _dist(a, b):
    return math.hypot(a.x - b.x, a.y - b.y)


def _toward(a, b):
    dx, dy = b.x - a.x, b.y - a.y
    d = math.hypot(dx, dy) or 1.0
    a.x += dx / d * a.speed
    a.y += dy / d * a.speed


def _live(lst):
    return [e for e in lst if getattr(e, "hp", 1) > 0]


def _nearest(src, lst):
    live = _live(lst)
    return min(live, key=lambda e: _dist(src, e)) if live else None


def _cond(c, srv, w):
    if not c:
        return True
    if c.startswith("hp<"):
        return srv.hp < srv.maxhp * float(c[3:].rstrip("%")) / 100.0
    if c == "floorClear":
        return not _live(w.enemies)
    if c.startswith("enemies>"):
        return len(_live(w.enemies)) > int(c.split(">")[1])
    return True


def _spawn_floor(w):
    """A fresh floor of the Hollow — enemies + gilt, scaled by depth."""
    hp = 18 + w.depth * 4
    w.enemies = [Ent(70, 0, hp, name="Husk"),
                 Ent(-50, 50, hp, name="Drowned"),
                 Ent(20, -70, hp, name="Cultist")]
    w.gilt = [Gilt(40, 40, 8 + w.depth), Gilt(-40, -20, 6 + w.depth)]


def _exec(instr, srv, w):
    if "IF" in instr:
        b = instr["IF"]
        branch = b.get("then", []) if _cond(b.get("condition"), srv, w) else b.get("else", [])
        for sub in branch:
            _exec(sub, srv, w)
        return
    op = instr.get("op")
    args = instr.get("args", {})
    if op in ("HUNT", "ATTACK"):
        t = _nearest(srv, w.enemies)
        if not t:
            return
        if _dist(srv, t) > 16:
            _toward(srv, t)
        else:
            t.hp -= srv.dmg
            w.log.append("  %s strikes %s for %d (hp %d)" % (srv.name, t.name, srv.dmg, max(0, int(t.hp))))
            if t.hp <= 0:
                w.log.append("  %s falls" % t.name)
    elif op == "GRAB":
        g = min([x for x in w.gilt if x.amt > 0], key=lambda x: _dist(srv, x), default=None)
        if not g:
            return
        if _dist(srv, g) > 24:
            _toward(srv, g)
        else:
            w.collected += g.amt
            w.log.append("  %s grabs %d gilt" % (srv.name, g.amt))
            g.amt = 0
    elif op == "RETREAT":
        w.log.append("  %s retreats (hp %d)" % (srv.name, int(srv.hp)))
    elif op == "USE":
        if _cond(args.get("condition"), srv, w):
            w.log.append("  %s channels skill slot %s" % (srv.name, args.get("skillSlot")))
    elif op == "DESCEND":
        if not _live(w.enemies) and not any(g.amt > 0 for g in w.gilt):
            w.depth += 1
            srv.x, srv.y = 0.0, 0.0
            _spawn_floor(w)
            w.log.append("  %s descends to depth %d — %d foes await" % (srv.name, w.depth, len(w.enemies)))
    elif op == "FOLLOW":
        if w.leader and _dist(srv, w.leader) > (args.get("range") or 40):
            _toward(srv, w.leader)
    elif op == "GUARD":
        t = _nearest(srv, w.enemies)
        if t and _dist(srv, t) <= (args.get("radius") or 140):
            if _dist(srv, t) > 16:
                _toward(srv, t)
            else:
                t.hp -= srv.dmg
                w.log.append("  %s guards, strikes %s for %d" % (srv.name, t.name, srv.dmg))
    elif op == "MOVE_TO":
        if w.leader and _dist(srv, w.leader) > 10:
            _toward(srv, w.leader)
    elif op == "WAIT":
        pass


def step(w):
    for srv in w.servants:
        if srv.hp > 0:
            for instr in srv.geas:
                _exec(instr, srv, w)


def run(w, ticks):
    for i in range(ticks):
        w.log.append("tick %d:" % (i + 1))
        step(w)
    return w
