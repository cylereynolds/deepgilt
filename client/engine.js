/* Deepgilt engine — JS port of engine/*.py. Same formulas, same data files.
   Exposes window.DG in the browser. The Python package is the source of truth;
   this mirrors it so the client computes characters, combat, loot, and monsters
   from the identical numbers (e.g. Bonewright lvl24 -> life 273, bind 6, geas 10). */
(function (global) {
  "use strict";
  var ATTRS = ["might", "finesse", "vigor", "wit", "wyrd"];
  var DMG_TYPES = ["steel", "ember", "rime", "galv", "rot", "wither"];
  var CLASS_BASE = {
    reaver: { life: 70, charge: 20 }, pyre: { life: 40, charge: 60 },
    bonewright: { life: 45, charge: 55 }, warden: { life: 60, charge: 35 },
    stalker: { life: 50, charge: 35 }, feral: { life: 60, charge: 35 }
  };

  function derived(attrs, level, classId, gear) {
    gear = gear || {};
    var cb = CLASS_BASE[classId] || { life: 50, charge: 40 };
    var life = cb.life + (attrs.vigor || 0) * 4 + level * 2 + (gear.life || 0);
    life *= 1 + (gear.life_pct || 0) / 100;
    var resist = {};
    DMG_TYPES.forEach(function (t) { resist[t] = Math.min(75, gear["res_" + t] || 0); });
    return {
      life: Math.round(life),
      charge: Math.round(cb.charge + (attrs.wit || 0) * 2 + level + (gear.charge || 0)),
      accuracy: +((attrs.finesse || 0) * 1.5 + level + (gear.accuracy || 0)).toFixed(1),
      evasion: +((attrs.finesse || 0) + level * 0.5 + (gear.evasion || 0)).toFixed(1),
      crit: +(5 + (attrs.finesse || 0) * 0.1 + (gear.crit || 0)).toFixed(1),
      armor: Math.round((gear.armor || 0) * (1 + (gear.armor_pct || 0) / 100)),     // flat armor scaled by armor% affixes
      dmg_pct: (attrs.might || 0) + (gear.dmg_pct || 0),                            // physical damage % (might-driven) — applied to the weapon packet in hero.js
      bind_capacity: 1 + Math.floor((attrs.wyrd || 0) / 12) + (gear.bind_capacity || 0),
      geas_length: 3 + Math.floor((attrs.wyrd || 0) / 8) + (gear.geas_length || 0),
      gilt_sight: +((attrs.wyrd || 0) * 0.5 + (gear.gilt_sight || 0)).toFixed(1),
      attack_speed: gear.attack_speed || 0,
      cast_speed: gear.cast_speed || 0,
      move_speed: gear.move_speed || 0,
      leech: gear.leech || 0,
      dr: gear.dr || 0,
      crush: gear.crush || 0,      // Crushing Blow % (D2: removes % of target CURRENT hp)
      deadly: gear.deadly || 0,    // Deadly Strike % (folds into the double-damage roll)
      wounds: gear.wounds || 0,    // Open Wounds % (unmitigable bleed)
      plus_skills: gear.plus_skills || 0,
      resist: resist
    };
  }

  function hitChance(acc, eva, al, dl) {
    var raw = 100 * acc / Math.max(1, acc + eva) * (2 * al / Math.max(1, al + dl));
    return Math.max(5, Math.min(95, raw));
  }
  function physDR(armor, al) { return armor <= 0 ? 0 : Math.min(0.85, armor / (armor + 40 * al)); }

  function resolveAttack(att, dfn, packet, al, dl, rng) {
    rng = rng || Math.random;
    if (rng() * 100 > hitChance(att.accuracy, dfn.evasion, al, dl))
      return { hit: false, crit: false, damage: 0, breakdown: {} };
    // Deadly Strike folds into Critical Strike: one double-damage roll, mutually exclusive (D2: CS + DS/100*(100-CS))
    var dchance = (att.crit || 5) + ((att.deadly || 0) / 100) * (100 - (att.crit || 5));
    var crit = rng() * 100 < dchance, mult = crit ? 2 : 1, total = 0, bd = {};
    for (var t in packet) {
      var v = packet[t], lo = Array.isArray(v) ? v[0] : v, hi = Array.isArray(v) ? v[1] : v;
      var d = lo + rng() * (hi - lo);
      d *= (t === "steel") ? (1 - physDR(dfn.armor || 0, al)) : (1 - ((dfn.resist && dfn.resist[t] || 0) / 100));
      d *= mult; bd[t] = Math.round(d * 10) / 10; total += d;
    }
    return { hit: true, crit: crit, damage: Math.round(total * 10) / 10, breakdown: bd };
  }
  function savingThrow(save, dc, rng) { rng = rng || Math.random; return Math.floor(rng() * 100 + 1) + save >= dc; }

  var RARITY_AFFIXES = { cracked: [0, 0], gilded: [1, 2], wrought: [3, 6] };
  // D2 prefix/suffix caps (Harrogath AffixCalc): Magic = 1 prefix + 1 suffix, Rare = 3 + 3.
  var RARITY_CAPS = { cracked: [0, 0], gilded: [1, 1], wrought: [3, 3] };
  function weighted(arr, w, rng) {
    var s = 0, i; for (i = 0; i < w.length; i++) s += w[i];
    var r = rng() * s, acc = 0;
    for (i = 0; i < arr.length; i++) { acc += w[i]; if (r <= acc) return arr[i]; }
    return arr[arr.length - 1];
  }
  // Diablo 2 affix level (alvl) — ported verbatim from Harrogath AffixCalc getAffixLevel().
  // qlvl = the base item's quality level; magicLvl = the base's 'magic lvl' (0 for all of
  // Deepgilt's clean-room bases). magic lvl RAISES alvl; no lower clamp (same as source).
  function affixLevel(ilvl, qlvl, magicLvl) {
    qlvl = qlvl || 0; magicLvl = magicLvl || 0;
    if (ilvl < qlvl) ilvl = qlvl;
    var alvl;
    if (magicLvl > 0) alvl = ilvl + magicLvl;
    else if (ilvl < 99 - Math.floor(qlvl / 2)) alvl = ilvl - Math.floor(qlvl / 2);
    else alvl = (ilvl * 2) - 99;
    return Math.min(99, alvl);
  }
  // Exclusion group: explicit 'group' wins, else the stat key (same-stat affixes never co-roll).
  function affixGroup(a) { return a.group || a.stat; }
  // Required affix level = lowest alvl among the affix's tiers (mirrors MagicPrefix 'level').
  function affixReqAlvl(a) {
    if (a.req_alvl != null) return a.req_alvl;
    var m = Infinity, i; for (i = 0; i < a.tiers.length; i++) if (a.tiers[i].ilvl < m) m = a.tiers[i].ilvl;
    return m === Infinity ? 1 : m;
  }
  function pickTier(tiers, alvl, rng) {
    var elig = tiers.filter(function (t) { return t.ilvl <= alvl; });
    if (!elig.length) return null;
    return weighted(elig, elig.map(function (t) { return Math.max(1, 9 - 2 * t.tier); }), rng);
  }
  function rollItem(slot, ilvl, rarity, affixes, rng, baseName, base, qlvl, magicLvl) {
    rng = rng || Math.random;
    var it = { slot: slot, base_name: baseName || slot, base: base || {}, affixes: [], sockets: [], rarity: rarity, name: baseName || slot, geasword: null };
    it.ilvl = ilvl;
    it.alvl = affixLevel(ilvl, qlvl, magicLvl);   // the gate for which affixes/tiers spawn
    var range = RARITY_AFFIXES[rarity] || [0, 0];
    var n = range[1] ? range[0] + Math.floor(rng() * (range[1] - range[0] + 1)) : 0;
    var caps = RARITY_CAPS[rarity] || [0, 0], preCap = caps[0], sufCap = caps[1];
    // Candidate pool: slot-eligible AND alvl >= the affix's Required_alvl. Each entry is
    // {kind,a} (no mutation of the shared affix records) so prefix/suffix caps can apply.
    var pool = [], i;
    function consider(list, kind) {
      for (i = 0; i < list.length; i++) {
        var a = list[i];
        if (a.slots.indexOf(slot) < 0 && a.slots.indexOf("any") < 0) continue;
        if (it.alvl < affixReqAlvl(a)) continue;   // item level too low for this affix
        pool.push({ kind: kind, a: a });
      }
    }
    consider(affixes.prefixes || [], "prefix");
    consider(affixes.suffixes || [], "suffix");
    var w = pool.map(function (p) { return p.a.weight || 10; });
    var usedGroups = {}, preN = 0, sufN = 0, guard = 0;
    while (it.affixes.length < n && pool.length && guard < 300) {
      guard++;
      var pick = weighted(pool, w, rng), a = pick.a, kind = pick.kind, grp = affixGroup(a);
      if (usedGroups[grp]) continue;               // already have an affix from this group
      if (kind === "prefix" && preN >= preCap) continue;   // prefix slots full
      if (kind === "suffix" && sufN >= sufCap) continue;   // suffix slots full
      var t = pickTier(a.tiers, it.alvl, rng);
      if (!t) continue;
      // each tier carries its own escalating name (e.g. Honed -> Savage -> Merciless); fall back to the affix name
      it.affixes.push({ name: t.name || a.name, stat: a.stat, value: t.min + Math.floor(rng() * (t.max - t.min + 1)), tier: t.tier, kind: kind });
      usedGroups[grp] = 1;
      if (kind === "prefix") preN++; else sufN++;
    }
    if (rarity !== "cracked") {
      var p = null, s = null;
      for (i = 0; i < it.affixes.length; i++) {
        if (it.affixes[i].kind === "prefix" && !p) p = it.affixes[i];
        else if (it.affixes[i].kind === "suffix" && !s) s = it.affixes[i];
      }
      var nm = it.base_name;
      if (p) nm = p.name + " " + nm;
      if (s) nm = nm + " " + s.name;
      it.name = nm;
    }
    return it;
  }
  function detectGeasword(sockets, slot, geaswords) {
    if (!sockets.length) return null;
    for (var i = 0; i < geaswords.length; i++) {
      var g = geaswords[i];
      if (g.sigils.length === sockets.length && g.sigils.every(function (x, j) { return x === sockets[j]; })
        && (g.bases.indexOf(slot) >= 0 || g.bases.indexOf("any") >= 0)) return g;
    }
    return null;
  }

  function scaleMon(mon, depth) {
    var f = 1 + 0.35 * (depth - 1), m = Object.assign({}, mon);
    m.hp = Math.round(m.hp * f); m.dmg = Math.round(m.dmg * f);
    m.level = (mon.level || 1) + (depth - 1) * 4; m.depth = depth;
    return m;
  }
  function champion(mon, affixIds) {
    var m = Object.assign({}, mon);
    m.hp = Math.round(m.hp * 2.5); m.dmg = Math.round(m.dmg * 1.4);
    m.affixes = affixIds.slice(); m.name = "Rare " + m.name;
    if (affixIds.indexOf("giltskin") >= 0) m.armor = (m.armor || 0) + 80;
    return m;
  }
  function toDefender(mon) {
    var res = {}; DMG_TYPES.forEach(function (t) { res[t] = (mon.resist && mon.resist[t]) || 0; });
    return { evasion: mon.evasion || Math.round((mon.level || 1) * 1.2 + 8), armor: mon.armor || 0, resist: res };
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // geas validation — mirrors engine/scroll.py (counts nested instructions, checks ops + budget)
  var GEAS_OPS = ["MOVE_TO", "FOLLOW", "HUNT", "ATTACK", "USE", "GRAB", "GUARD", "RETREAT", "WAIT", "DESCEND"];
  function geasCount(g) {
    var n = 0;
    for (var i = 0; i < g.length; i++) {
      n++;
      var x = g[i];
      if (x.IF) n += geasCount(x.IF.then || []) + geasCount(x.IF.else || []);
      else if (x.REPEAT) n += geasCount(x.REPEAT.body || []);
    }
    return n;
  }
  function validateGeas(g, cap) {
    var errs = [];
    (function walk(lst) {
      for (var i = 0; i < lst.length; i++) {
        var x = lst[i];
        if (x.IF) { walk(x.IF.then || []); walk(x.IF.else || []); }
        else if (x.REPEAT) walk(x.REPEAT.body || []);
        else if (GEAS_OPS.indexOf(x.op) < 0) errs.push("unknown op: " + x.op);
      }
    })(g);
    var used = geasCount(g);
    if (used > cap) errs.push("geas too long: " + used + " > capacity " + cap);
    return { ok: errs.length === 0, errors: errs, used: used };
  }

  // aggregate equipped items into attribute + gear bonuses — mirrors engine/items.py
  function gearFromItems(itemsList) {
    var ATTR = { might: 1, finesse: 1, vigor: 1, wit: 1, wyrd: 1 };
    var RES = ["res_steel", "res_ember", "res_rime", "res_galv", "res_rot", "res_wither"];
    var attrs = { might: 0, finesse: 0, vigor: 0, wit: 0, wyrd: 0 }, gear = {};
    function apply(stat, val) {
      if (ATTR[stat]) attrs[stat] += val;
      else if (stat === "all_attrs") { for (var k in attrs) attrs[k] += val; }
      else if (stat === "res_all") { for (var i = 0; i < RES.length; i++) gear[RES[i]] = (gear[RES[i]] || 0) + val; }
      else gear[stat] = (gear[stat] || 0) + val;
    }
    (itemsList || []).forEach(function (it) {
      if (it && it.dur != null && it.dur <= 0) return;                 // BROKEN item contributes no base stats or affixes
      var b = it.base || {};
      for (var st in b) if (typeof b[st] === "number") apply(st, b[st]);
      (it.affixes || []).forEach(function (a) { apply(a.stat, a.value); });
    });
    return { attrs: attrs, gear: gear };
  }

  // skill scaling -> damage packet — mirrors engine/skills.py (rank scaling + synergies + primary-attr)
  var DMG_STAT_TO_TYPE = { steel_dmg: "steel", ember_dmg: "ember", rime_dmg: "rime", galv_dmg: "galv", rot_dmg: "rot", wither_dmg: "wither" };
  var PRIMARY_SCALE = { reaver: ["might", 0.010], pyre: ["wit", 0.012], bonewright: ["wyrd", 0.010], warden: ["might", 0.008], stalker: ["finesse", 0.011], feral: ["vigor", 0.008] };
  function findSkill(skillData, id) {
    var tr = skillData.trees;
    for (var t in tr) for (var i = 0; i < tr[t].length; i++) if (tr[t][i].id === id) return tr[t][i];
    return null;
  }
  function skillValue(skill, ranks) {
    var r = ranks[skill.id] || 0; if (r <= 0) return 0;
    var sc = skill.scaling || {};
    var base = (sc.base || 0) + (sc.per_rank || 0) * (r - 1);
    var syn = 0.06 * (skill.synergies || []).reduce(function (a, s) { return a + (ranks[s] || 0); }, 0);
    return base * (1 + syn);
  }
  function skillPacket(classId, skill, ranks, attrs) {
    var typ = DMG_STAT_TO_TYPE[skill.scaling && skill.scaling.stat];
    var val = skillValue(skill, ranks);
    if (!typ || val <= 0) return null;
    var ps = PRIMARY_SCALE[classId] || ["might", 0.01];
    val *= 1 + (attrs[ps[0]] || 0) * ps[1];
    var o = {}; o[typ] = [val * 0.85, val * 1.15];
    return { packet: o, value: val, type: typ };
  }

  // D2 LOD 1.14d armor defense: %ED applies to the BASE only (native-tier seed = base_max+1), ethereal ×1.5 the base,
  // flat +Defense added AFTER %ED. Returns [def_min, def_max]; for a concrete item ed/flat are fixed so min==max.
  function armorDefense(baseMin, baseMax, edMin, edMax, flatMin, flatMax, ethereal, nativeTier) {
    function eth(x) { return ethereal ? Math.floor(x * 3 / 2) : x; }                       // floor(x * 1.5)
    if (edMax === 0) return [eth(baseMin) + flatMin, eth(baseMax) + flatMax];               // no %ED → base range + flat
    var seedMin = nativeTier ? (baseMax + 1) : baseMin, seedMax = nativeTier ? (baseMax + 1) : baseMax;
    return [Math.floor(eth(seedMin) * (100 + edMin) / 100) + flatMin,
            Math.floor(eth(seedMax) * (100 + edMax) / 100) + flatMax];
  }
  // a weapon/armor at 0 durability is BROKEN → provides no stats until repaired (rings/amulets have dur==null, never break).
  function isBroken(it) { return !!it && it.dur != null && it.dur <= 0; }
  // concrete defense of one worn armor piece: folds its own %ED (armor_pct) + flat (armor) affixes onto its base roll.
  function itemDefense(it) {
    if (!it || !it.base || it.base.amin == null || isBroken(it)) return 0;                  // broken / not an armor piece w/ a base def range
    var ed = 0, flat = 0, af = it.affixes || [], i;
    for (i = 0; i < af.length; i++) { if (af[i].stat === "armor_pct") ed += af[i].value; else if (af[i].stat === "armor") flat += af[i].value; }
    if (ed === 0) { var b = (it.base.roll != null) ? it.base.roll : it.base.amax; return armorDefense(b, b, 0, 0, flat, flat, !!it.ethereal, true)[1]; }
    return armorDefense(it.base.amin, it.base.amax, ed, ed, flat, flat, !!it.ethereal, true)[1];  // %ED present → native seed base_max+1
  }

  var DG = {
    ATTRS: ATTRS, DMG_TYPES: DMG_TYPES, CLASS_BASE: CLASS_BASE,
    derived: derived, hitChance: hitChance, physDR: physDR, resolveAttack: resolveAttack,
    savingThrow: savingThrow, rollItem: rollItem, detectGeasword: detectGeasword,
    affixLevel: affixLevel, affixGroup: affixGroup, affixReqAlvl: affixReqAlvl,
    scaleMon: scaleMon, champion: champion, toDefender: toDefender, mulberry32: mulberry32,
    GEAS_OPS: GEAS_OPS, geasCount: geasCount, validateGeas: validateGeas,
    gearFromItems: gearFromItems, armorDefense: armorDefense, itemDefense: itemDefense, isBroken: isBroken,
    DMG_STAT_TO_TYPE: DMG_STAT_TO_TYPE, findSkill: findSkill, skillValue: skillValue, skillPacket: skillPacket
  };
  if (typeof module !== "undefined" && module.exports) module.exports = DG;
  if (global) global.DG = DG;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
