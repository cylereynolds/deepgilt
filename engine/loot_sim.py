"""Loot / economy simulator. Rolls many drops and prints the rarity curve,
the effect of gilt-sight (magic find), and the affix/tier spread on Wrought items.
Run:  python3 -m engine.loot_sim
"""
import random
from . import items

# Base drop weights per item (DESIGN.md §8 rarities). Tunable.
RARITY_WEIGHTS = {"cracked": 1000, "gilded": 300, "wrought": 60, "relic": 4, "godblood": 0.15}


def roll_rarity(mf, rng):
    """mf = gilt-sight %. Rarer tiers scale up with gilt-sight (steeper the rarer)."""
    f = mf / 100.0
    w = dict(RARITY_WEIGHTS)
    w["gilded"] *= 1 + 0.5 * f
    w["wrought"] *= 1 + 1.0 * f
    w["relic"] *= 1 + 2.0 * f
    w["godblood"] *= 1 + 3.0 * f
    total = sum(w.values())
    r = rng.uniform(0, total)
    acc = 0.0
    for k, v in w.items():
        acc += v
        if r <= acc:
            return k
    return "cracked"


def bar(n, total, width=28):
    f = int(round(width * n / total)) if total else 0
    return "#" * f + "." * (width - f)


def main():
    rng = random.Random(42)
    n = 50000
    print("== rarity distribution (%d drops) ==" % n)
    for mf in (0, 300):
        counts = {k: 0 for k in RARITY_WEIGHTS}
        for _ in range(n):
            counts[roll_rarity(mf, rng)] += 1
        print("\n gilt-sight %d%%:" % mf)
        for k in RARITY_WEIGHTS:
            print("   %-9s %6d  %s %6.3f%%" % (k, counts[k], bar(counts[k], n), 100 * counts[k] / n))

    print("\n== affix frequency — 5000 Wrought weapons @ ilvl 50 ==")
    freq, tiers = {}, {}
    for _ in range(5000):
        it = items.roll_item("weapon", 50, "wrought", rng,
                             base_name="Scythe", base={"dmg_min": 18, "dmg_max": 41})
        for a in it.affixes:
            freq[a["name"]] = freq.get(a["name"], 0) + 1
            tiers[a["tier"]] = tiers.get(a["tier"], 0) + 1
    for name, ct in sorted(freq.items(), key=lambda x: -x[1]):
        print("   %-14s %5d  %s" % (name, ct, bar(ct, 5000, 22)))
    print("\n   tier spread:", {"T%d" % t: tiers[t] for t in sorted(tiers)})


if __name__ == "__main__":
    main()
