"""Skill scaling, synergies, and casting through combat (DESIGN.md §6).

Turns a class's skill data into real damage: rank scaling + D2-style synergies
(+ a primary-attribute multiplier), built into a damage packet and resolved by
engine/combat.py. This is the bridge that was missing between data and combat.
"""
from . import data, combat

DMG_STAT_TO_TYPE = {
    "steel_dmg": "steel", "ember_dmg": "ember", "rime_dmg": "rime",
    "galv_dmg": "galv", "rot_dmg": "rot", "wither_dmg": "wither",
}
# which attribute amplifies a class's skill damage, and by how much per point
PRIMARY_SCALE = {
    "reaver": ("might", 0.010), "pyre": ("wit", 0.012), "bonewright": ("wyrd", 0.010),
    "warden": ("might", 0.008), "stalker": ("finesse", 0.011), "feral": ("vigor", 0.008),
}


def find_skill(class_id, skill_id):
    for tree in data.skills[class_id]["trees"].values():
        for sk in tree:
            if sk["id"] == skill_id:
                return sk
    return None


def synergy_bonus(skill, ranks):
    """Each point in a synergy skill adds 6% (D2's defining depth)."""
    return 0.06 * sum(ranks.get(s, 0) for s in skill.get("synergies", []))


def effective_value(skill, ranks):
    r = ranks.get(skill["id"], 0)
    if r <= 0:
        return 0.0
    sc = skill.get("scaling", {})
    base = sc.get("base", 0) + sc.get("per_rank", 0) * (r - 1)
    return base * (1 + synergy_bonus(skill, ranks))


def damage_packet(class_id, skill, ranks, attrs):
    dtype = DMG_STAT_TO_TYPE.get(skill.get("scaling", {}).get("stat"))
    val = effective_value(skill, ranks)
    if not dtype or val <= 0:
        return None
    attr, per = PRIMARY_SCALE.get(class_id, ("might", 0.01))
    val *= 1 + attrs.get(attr, 0) * per
    return {dtype: (val * 0.85, val * 1.15)}, val


def cast(char, skill_id, defender, atk_level=1, dfn_level=1, rng=None):
    skill = find_skill(char.class_id, skill_id)
    if not skill:
        return {"hit": False, "error": "unknown skill", "skill": skill_id, "skill_value": 0}
    dp = damage_packet(char.class_id, skill, char.skill_ranks, char.total_attrs())
    if not dp:
        return {"hit": False, "error": "not an offensive skill", "skill": skill["name"], "skill_value": 0}
    packet, val = dp
    res = combat.resolve(char.derived(), defender, packet, atk_level, dfn_level, rng)
    res["skill"] = skill["name"]
    res["skill_value"] = round(val, 1)
    return res
