"""Items, affix rolling, sockets and geas-word detection (DESIGN.md §8)."""
import random
from . import data

ATTR_KEYS = {"might", "finesse", "vigor", "wit", "wyrd"}
RES_KEYS = ["res_steel", "res_ember", "res_rime", "res_galv", "res_rot", "res_wither"]
# How many affixes a rarity rolls (total), and the D2 prefix/suffix split.
# Caps ported from Harrogath's AffixCalc: Magic = 1 prefix + 1 suffix, Rare = 3 + 3.
RARITY_AFFIXES = {"cracked": (0, 0), "gilded": (1, 2), "wrought": (3, 6)}
RARITY_CAPS = {"cracked": (0, 0), "gilded": (1, 1), "wrought": (3, 3)}  # (max_prefixes, max_suffixes)


class Item:
    def __init__(self, slot, base_name, base=None):
        self.slot = slot
        self.base_name = base_name
        self.base = base or {}
        self.affixes = []      # [{name, stat, value, tier, kind}]
        self.sockets = []      # [sigil_id, ...]
        self.rarity = "cracked"
        self.name = base_name
        self.geasword = None
        self.ilvl = 0          # item level (drop level)
        self.alvl = 0          # affix level — the gate for which affixes/tiers may spawn
        self.ethereal = False  # Spectral (D2 ethereal): +50% base power, can't reforge/socket (DESIGN §8)


def affix_level(ilvl, qlvl=0, magic_lvl=0):
    """Diablo 2 affix level (alvl). Ported verbatim from Harrogath's AffixCalc
    getAffixLevel() (= the 1.x game formula):

        ilvl = max(ilvl, qlvl)
        if   magic_lvl > 0:            alvl = ilvl + magic_lvl
        elif ilvl < 99 - qlvl//2:      alvl = ilvl - qlvl//2
        else:                          alvl = 2*ilvl - 99
        alvl = min(99, alvl)

    qlvl = the base item's quality level; magic_lvl = the base's 'magic lvl'
    (circlets etc. — 0 for all of Deepgilt's clean-room bases). No lower clamp,
    same as the source.
    """
    if ilvl < qlvl:
        ilvl = qlvl
    if magic_lvl > 0:
        alvl = ilvl + magic_lvl
    elif ilvl < 99 - qlvl // 2:
        alvl = ilvl - qlvl // 2
    else:
        alvl = 2 * ilvl - 99
    return min(99, alvl)


def affix_group(a):
    """Exclusion group for an affix. Explicit 'group' wins; otherwise the stat key
    is the group — so two affixes touching the same stat never co-roll, and an
    explicit shared group (e.g. 'weapon_phys' on both enhanced-damage prefixes)
    makes distinct stats mutually exclusive too. (Harrogath: MagicPrefix 'group'.)"""
    return a.get("group") or a["stat"]


def affix_req_alvl(a):
    """Required affix level for an affix to appear = lowest alvl among its tiers
    (mirrors MagicPrefix.txt 'level'). Explicit 'req_alvl' overrides."""
    if "req_alvl" in a:
        return a["req_alvl"]
    return min(t["ilvl"] for t in a["tiers"])


def _pick_tier(tiers, alvl, rng):
    """Weighted-random among tiers whose alvl requirement is met — lower tiers
    common, top tiers rare."""
    elig = [t for t in tiers if t["ilvl"] <= alvl]
    if not elig:
        return None
    weights = [max(1, 9 - 2 * t["tier"]) for t in elig]
    return rng.choices(elig, weights=weights, k=1)[0]


def roll_item(slot, ilvl, rarity, rng=None, base_name=None, base=None,
              qlvl=0, magic_lvl=0):
    rng = rng or random
    it = Item(slot, base_name or slot.title(), base)
    it.rarity = rarity
    it.ilvl = ilvl
    it.alvl = affix_level(ilvl, qlvl, magic_lvl)   # the gate for everything below
    lo, hi = RARITY_AFFIXES.get(rarity, (0, 0))
    n = rng.randint(lo, hi) if hi else 0
    pre_cap, suf_cap = RARITY_CAPS.get(rarity, (0, 0))

    # Candidate pool: slot-eligible AND alvl >= the affix's Required_alvl. Tag each
    # with its kind (prefix/suffix) so the prefix/suffix caps can be enforced.
    pool = []
    for kind, lst in (("prefix", data.affixes["prefixes"]),
                      ("suffix", data.affixes["suffixes"])):
        for a in lst:
            if not (slot in a["slots"] or "any" in a["slots"]):
                continue
            if it.alvl < affix_req_alvl(a):        # item level too low for this affix
                continue
            pool.append((kind, a))
    weights = [a.get("weight", 10) for _, a in pool]

    used_groups = set()                            # exclusion-engine state
    pre_n = suf_n = 0
    guard = 0
    while len(it.affixes) < n and pool and guard < 300:
        guard += 1
        kind, a = rng.choices(pool, weights=weights, k=1)[0]
        grp = affix_group(a)
        if grp in used_groups:                     # already have an affix from this group
            continue
        if kind == "prefix" and pre_n >= pre_cap:  # prefix slots full
            continue
        if kind == "suffix" and suf_n >= suf_cap:  # suffix slots full
            continue
        tier = _pick_tier(a["tiers"], it.alvl, rng)
        if not tier:
            continue
        it.affixes.append({
            "name": a["name"], "stat": a["stat"], "kind": kind,
            "value": rng.randint(tier["min"], tier["max"]), "tier": tier["tier"],
        })
        used_groups.add(grp)
        if kind == "prefix":
            pre_n += 1
        else:
            suf_n += 1
    if it.affixes and rarity != "cracked":
        it.name = it.affixes[0]["name"] + " " + it.base_name
    return it


def detect_geasword(item):
    if not item.sockets:
        return None
    for gw in data.geaswords:
        if item.sockets == gw["sigils"] and (item.slot in gw["bases"] or "any" in gw["bases"]):
            return gw
    return None


def _apply(stat, val, attrs, gear):
    if stat in ATTR_KEYS:
        attrs[stat] += val
    elif stat == "all_attrs":
        for k in ATTR_KEYS:
            attrs[k] += val
    elif stat == "res_all":
        for k in RES_KEYS:
            gear[k] = gear.get(k, 0) + val
    else:
        gear[stat] = gear.get(stat, 0) + val


def gear_from_items(items_list):
    """Aggregate every equipped item into (attr_bonuses, gear_dict)."""
    attrs = {k: 0 for k in ATTR_KEYS}
    gear = {}
    for it in items_list:
        for st, v in (it.base or {}).items():
            if isinstance(v, (int, float)):
                _apply(st, v, attrs, gear)
        for af in it.affixes:
            _apply(af["stat"], af["value"], attrs, gear)
        gw = detect_geasword(it)
        if gw:
            it.geasword = gw["name"]
            for st, v in gw.get("mods", {}).items():
                _apply(st, v, attrs, gear)
    return attrs, gear


# --- Armor defense (D2 LOD 1.14d) -------------------------------------------
# Exact port of DG.armorDefense / DG.itemDefense (client/engine.js) so the Python
# server engine computes per-piece armor identically to the browser client — see
# COMBAT_RESOLUTION.md. %ED applies to the BASE only (native-tier seed = base_max+1),
# Spectral/ethereal ×1.5 the base (floored), flat +Defense added AFTER %ED.

def armor_defense(base_min, base_max, ed_min, ed_max, flat_min, flat_max,
                  ethereal=False, native_tier=True):
    """Returns [def_min, def_max]; for a concrete item ed/flat are fixed so min==max."""
    eth = (lambda x: x * 3 // 2) if ethereal else (lambda x: x)        # floor(x * 1.5)
    if ed_max == 0:                                                    # no %ED → base range + flat
        return [eth(base_min) + flat_min, eth(base_max) + flat_max]
    seed_min = base_max + 1 if native_tier else base_min              # fixed-roll native seed
    seed_max = base_max + 1 if native_tier else base_max
    return [eth(seed_min) * (100 + ed_min) // 100 + flat_min,         # floor(eth·(1+ED/100)) + flat
            eth(seed_max) * (100 + ed_max) // 100 + flat_max]


def item_defense(it):
    """Concrete defense of one worn armor piece: folds its own %ED (armor_pct) +
    flat (armor) affixes onto its base roll. 0 if the piece has no base def range."""
    base = getattr(it, "base", None) or {}
    if base.get("amin") is None:                                      # not armor w/ a def range
        return 0
    ed = sum(a["value"] for a in it.affixes if a["stat"] == "armor_pct")
    flat = sum(a["value"] for a in it.affixes if a["stat"] == "armor")
    eth = bool(getattr(it, "ethereal", False))
    if ed == 0:                                                       # use the rolled base def
        b = base["roll"] if base.get("roll") is not None else base["amax"]
        return armor_defense(b, b, 0, 0, flat, flat, eth, True)[1]
    return armor_defense(base["amin"], base["amax"], ed, ed, flat, flat, eth, True)[1]
