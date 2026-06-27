"""The Character: base attributes + equipment -> final stats (DESIGN.md §2, §8)."""
from . import stats, items


class Character:
    def __init__(self, name, class_id, level=1, base_attrs=None, equipment=None, skill_ranks=None):
        self.name = name
        self.class_id = class_id
        self.level = level
        self.base_attrs = base_attrs or {k: 10 for k in stats.ATTRS}
        self.equipment = equipment or []
        self.skill_ranks = skill_ranks or {}

    def gear(self):
        return items.gear_from_items(self.equipment)

    def total_attrs(self):
        attr_bonus, _ = self.gear()
        return {k: self.base_attrs.get(k, 0) + attr_bonus.get(k, 0) for k in stats.ATTRS}

    def derived(self):
        _, gear = self.gear()
        d = stats.derived(self.total_attrs(), self.level, self.class_id, gear)
        # D2 per-item armor defense (%ED hits each base, then summed) replaces the
        # naive gear['armor'] — mirrors client hero.js recompute so client/server agree.
        d["armor"] = round(sum(items.item_defense(it) for it in self.equipment))
        return d

    def weapon_packet(self):
        """Build the per-swing damage packet from the equipped weapon + gear mods."""
        _, gear = self.gear()
        mn, mx = 2, 5
        for it in self.equipment:
            if it.slot == "weapon":
                mn = it.base.get("dmg_min", mn)
                mx = it.base.get("dmg_max", mx)
        ed = gear.get("ed_pct", 0)
        flat = gear.get("flat_steel", 0)
        packet = {"steel": ((mn + flat) * (1 + ed / 100.0), (mx + flat) * (1 + ed / 100.0))}
        for t in ["ember", "rime", "galv", "rot", "wither"]:
            f = gear.get(t + "_dmg", 0)
            if f:
                packet[t] = (f * 0.8, f * 1.2)
        return packet
