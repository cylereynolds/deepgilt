"""Bestiary helpers: look up monsters, scale them by depth, promote to rare/champion,
and convert to a combat defender (DESIGN.md §10)."""
from . import data, stats


def find(mid):
    for m in data.monsters["monsters"]:
        if m["id"] == mid:
            return dict(m)
    for b in data.monsters["bosses"]:
        if b["id"] == mid:
            return dict(b)
    return None


def scale(mon, depth):
    """Scale a base monster to a depth band (our Normal/Nightmare/Hell pressure)."""
    f = 1 + 0.35 * (depth - 1)
    m = dict(mon)
    m["hp"] = round(m["hp"] * f)
    m["dmg"] = round(m["dmg"] * f)
    m["level"] = m.get("level", 1) + (depth - 1) * 4
    m["depth"] = depth
    return m


def champion(mon, affix_ids):
    """Promote to a rare pack: tougher, hits harder, carries monster affixes."""
    m = dict(mon)
    m["hp"] = round(m["hp"] * 2.5)
    m["dmg"] = round(m["dmg"] * 1.4)
    m["affixes"] = list(affix_ids)
    m["name"] = "Rare " + m["name"]
    if "giltskin" in affix_ids:
        m["armor"] = m.get("armor", 0) + 80
    return m


def to_defender(mon):
    return {
        "evasion": mon.get("evasion", round(mon.get("level", 1) * 1.2 + 8)),
        "armor": mon.get("armor", 0),
        "resist": dict(mon.get("resist", {t: 0 for t in stats.DMG_TYPES})),
    }
