"""Attributes and derived stats (DESIGN.md §2)."""

ATTRS = ["might", "finesse", "vigor", "wit", "wyrd"]
DMG_TYPES = ["steel", "ember", "rime", "galv", "rot", "wither"]

CLASS_BASE = {
    "reaver":     {"life": 70, "charge": 20},
    "pyre":       {"life": 40, "charge": 60},
    "bonewright": {"life": 45, "charge": 55},
    "warden":     {"life": 60, "charge": 35},
    "stalker":    {"life": 50, "charge": 35},
    "feral":      {"life": 60, "charge": 35},
}


def derived(attrs, level, class_id="bonewright", gear=None):
    """attrs: dict of the five attributes. gear: aggregated gear-mod dict."""
    gear = gear or {}
    cb = CLASS_BASE.get(class_id, {"life": 50, "charge": 40})
    life = (cb["life"] + attrs.get("vigor", 0) * 4 + level * 2 + gear.get("life", 0))
    life *= 1 + gear.get("life_pct", 0) / 100.0
    charge = cb["charge"] + attrs.get("wit", 0) * 2 + level + gear.get("charge", 0)
    return {
        "life": round(life),
        "charge": round(charge),
        "accuracy": round(attrs.get("finesse", 0) * 1.5 + level + gear.get("accuracy", 0), 1),
        "evasion": round(attrs.get("finesse", 0) + level * 0.5 + gear.get("evasion", 0), 1),
        "crit": round(5 + attrs.get("finesse", 0) * 0.1 + gear.get("crit", 0), 1),
        "armor": gear.get("armor", 0),
        "bind_capacity": 1 + attrs.get("wyrd", 0) // 12 + gear.get("bind_capacity", 0),
        "geas_length": 3 + attrs.get("wyrd", 0) // 8 + gear.get("geas_length", 0),
        "gilt_sight": round(attrs.get("wyrd", 0) * 0.5 + gear.get("gilt_sight", 0), 1),
        "resist": {t: min(75, gear.get("res_" + t, 0)) for t in DMG_TYPES},
    }
