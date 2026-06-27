"""Combat math: D2 % hit/damage/resist + D&D-style saving throws (DESIGN.md §9)."""
import random


def hit_chance(acc, eva, alvl, dlvl):
    raw = 100 * acc / max(1.0, acc + eva) * (2 * alvl / max(1.0, alvl + dlvl))
    return max(5.0, min(95.0, raw))


def phys_dr(armor, atk_level):
    if armor <= 0:
        return 0.0
    return min(0.85, armor / (armor + 40.0 * atk_level))


def resolve(att, dfn, packet, atk_level=1, dfn_level=1, rng=None):
    """att/dfn: derived-stat dicts. packet: {damage_type: (min,max) or scalar}."""
    rng = rng or random.Random()
    if rng.uniform(0, 100) > hit_chance(att["accuracy"], dfn["evasion"], atk_level, dfn_level):
        return {"hit": False, "crit": False, "damage": 0, "breakdown": {}}
    crit = rng.uniform(0, 100) < att.get("crit", 5)
    mult = 2.0 if crit else 1.0
    total, breakdown = 0.0, {}
    for t, val in packet.items():
        lo, hi = val if isinstance(val, (list, tuple)) else (val, val)
        d = rng.uniform(lo, hi)
        if t == "steel":
            d *= 1 - phys_dr(dfn.get("armor", 0), atk_level)
        else:
            d *= 1 - dfn.get("resist", {}).get(t, 0) / 100.0
        d *= mult
        breakdown[t] = round(d, 1)
        total += d
    return {"hit": True, "crit": crit, "damage": round(total, 1), "breakdown": breakdown}


def saving_throw(save, dc, rng=None):
    """D&D flavor on D2 CC: effect is resisted when d100 + save >= dc."""
    rng = rng or random.Random()
    return rng.randint(1, 100) + save >= dc
