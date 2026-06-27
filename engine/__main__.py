"""End-to-end selftest: build a Bonewright, roll loot, form a geas-word,
fight a husk, and run a PC farm geas. Run with:  python3 -m engine"""
import random
from . import data, stats, items, combat, character, geas, skills, monsters


def hr(t):
    print("\n=== " + t + " ===")


rng = random.Random(7)

hr("Deepgilt engine selftest")
print("loaded: %d classes, %d affixes, %d sigils, %d geas-words, %d monsters" % (
    len(data.classes["classes"]),
    len(data.affixes["prefixes"]) + len(data.affixes["suffixes"]),
    len(data.sigils), len(data.geaswords),
    len(data.monsters["monsters"]) + len(data.monsters["bosses"])))
bw = data.skills["bonewright"]
print("Bonewright trees: %s | sample: %s" % (
    ", ".join(bw["trees"].keys()), bw["trees"]["Sepulture"][0]["name"]))

hr("character — Bonewright, unequipped")
hero = character.Character(
    "Vael the Bonewright", "bonewright", level=24,
    base_attrs={"might": 20, "finesse": 25, "vigor": 45, "wit": 35, "wyrd": 60})
d = hero.derived()
print("attrs:", hero.total_attrs())
print("life %d | charge %d | bind capacity %d | geas length %d | gilt-sight %.0f%%" % (
    d["life"], d["charge"], d["bind_capacity"], d["geas_length"], d["gilt_sight"]))

hr("loot — roll a Wrought weapon @ ilvl 40")
wpn = items.roll_item("weapon", ilvl=40, rarity="wrought", rng=rng,
                      base_name="Reaping Scythe", base={"dmg_min": 18, "dmg_max": 41})
print("%s  [%s]" % (wpn.name, wpn.rarity))
for a in wpn.affixes:
    print("   %-14s %s +%d  (T%d)" % (a["name"], a["stat"], a["value"], a["tier"]))

hr("geas-word — socket Tithe (Au + Mor)")
wpn.sockets = ["Au", "Mor"]
gw = items.detect_geasword(wpn)
print("formed: %s -> %s" % (gw["name"], "; ".join(gw["bonuses"])) if gw else "none")

hr("equip weapon + a Lastlight body, recompute")
hero.equipment.append(wpn)
body = items.Item("body", "Gilded Hauberk", base={"armor": 120})
body.sockets = ["Sol", "Var", "Eth"]
hero.equipment.append(body)
d2 = hero.derived()
print("body geas-word:", body.geasword)
print("attrs:", hero.total_attrs())
print("life %d | armor %d | crit %.1f%% | accuracy %.0f | resist %s" % (
    d2["life"], d2["armor"], d2["crit"], d2["accuracy"], d2["resist"]))
print("weapon packet:", {k: (round(v[0]), round(v[1])) for k, v in hero.weapon_packet().items()})

hr("combat — 4 swings vs a Husk (lvl 22)")
husk = {"evasion": 22, "armor": 35, "resist": {t: 0 for t in stats.DMG_TYPES}}
att = hero.derived()
for i in range(4):
    r = combat.resolve(att, husk, hero.weapon_packet(), atk_level=24, dfn_level=22, rng=rng)
    if not r["hit"]:
        print("  swing %d: MISS" % (i + 1))
    else:
        print("  swing %d: %d dmg%s  %s" % (
            i + 1, r["damage"], "  CRIT" if r["crit"] else "", r["breakdown"]))

hr("save — Husk vs Terror (Wyrd curse)")
dc = 10 + hero.total_attrs()["wyrd"] // 2
print("  husk save 8 vs DC %d -> %s" % (
    dc, "RESISTED" if combat.saving_throw(8, dc, rng) else "cursed (flees)"))

hr("skills — Bonewright casts Bone Spire (rank 5, +synergy) at a Rare husk")
hero.skill_ranks = {"bone_spire": 5, "grave_spike": 3, "reap": 2}
mon = monsters.champion(monsters.scale(monsters.find("husk"), depth=3), ["fleet", "giltskin"])
print("target: %s — lvl %d, hp %d, armor %d, affixes %s" % (
    mon["name"], mon["level"], mon["hp"], mon["armor"], mon["affixes"]))
sr = skills.cast(hero, "bone_spire", monsters.to_defender(mon),
                 atk_level=hero.level, dfn_level=mon["level"], rng=rng)
if sr.get("hit"):
    dtype = list(sr["breakdown"].keys())[0]
    print("  Bone Spire (value %.0f) -> %d %s damage%s" % (
        sr["skill_value"], sr["damage"], dtype, "  CRIT" if sr["crit"] else ""))
else:
    print("  Bone Spire (value %.0f) -> MISS" % sr["skill_value"])

hr("the bind — run a PC farm geas for 18 ticks")
w = geas.World()
srv = geas.Ent(0, 0, hp=120, dmg=22, name="Husk-servant")
srv.geas = data.geas_instructions["example_pc_farm_geas"]["geas"]
srv.speed = 30
w.servants.append(srv)
w.enemies = [geas.Ent(70, 20, 22, name="Drowned"),
             geas.Ent(-60, 40, 22, name="Cultist"),
             geas.Ent(30, -80, 22, name="Beast")]
w.gilt = [geas.Gilt(50, 50, 12), geas.Gilt(-30, -30, 9)]
geas.run(w, 18)
for line in w.log:
    print(line)
print("\ncollected gilt: %d | reached depth: %d" % (w.collected, w.depth))
print("\nselftest ok.")
