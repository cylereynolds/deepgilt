// Deepgilt — core/Hero : the player's RPG state, consolidated (OD2 d2hero + d2stats + d2inventory roles).
// A Hero IS a MapEntity (it lives on the map) that also owns attributes, level/xp, equipment,
// inventory, derived stats and the weapon damage packet. The stat MATH stays in engine.js (DG.*);
// this module is the state + the operations on it. Clean-room; OD2 is reference only.
(function () {
  var SLOTS = ['weapon', 'body', 'helm', 'gloves', 'ring', 'amulet', 'offhand', 'belt', 'boots'];
  function mergeAttrs(a, b) { var o = {}; DG.ATTRS.forEach(function (k) { o[k] = (a[k] || 0) + (b[k] || 0); }); return o; }

  function Hero(classid, baseAttrs) {
    DGC.MapEntity.call(this, 0, 0);
    this.classid = classid; this.attrs = baseAttrs || {};
    this.lvl = 5; this.xp = 0;
    this.statPts = 0; this.skillPts = 0;   // unspent points: 5 stat + 1 skill per level (skill trees TBD — skillPts just banks for now)
    this.equip = {}; this.inv = [];
    this.derived = null; this.totAttrs = null; this.wpack = null; this.wname = 'unarmed';
    this.skills = []; this.ranks = {};
    // entity/loop fields the game expects on the hero:
    this.tx = 0; this.ty = 0; this.spd = 2.1; this.acd = 0; this.swing = 0; this.face = 1; this.drg = 3; this.path = null;
  }
  Hero.prototype = Object.create(DGC.MapEntity.prototype); Hero.prototype.constructor = Hero;
  Hero.SLOTS = SLOTS;

  Hero.prototype.gearList = function () { var e = this.equip; return SLOTS.map(function (s) { return e[s]; }).filter(Boolean); };

  // build the 4-slot active skill bar (the class's lowest-tier damaging skills) + default ranks
  Hero.prototype.buildSkills = function (skilldata) {
    var off = [];
    if (skilldata && skilldata.trees) Object.keys(skilldata.trees).forEach(function (tn) {
      skilldata.trees[tn].forEach(function (s) { if (s.scaling && DG.DMG_STAT_TO_TYPE[s.scaling.stat]) off.push(s); });
    });
    off.sort(function (a, b) { return a.tier - b.tier; });
    this.skills = off.slice(0, 4); this.ranks = {}; var self = this;
    this.skills.forEach(function (s) { self.ranks[s.id] = 5; });
  };

  // recompute derived stats + weapon packet from base attributes + equipped gear (via the DG engine)
  Hero.prototype.recompute = function () {
    var gf = DG.gearFromItems(this.gearList());
    this.totAttrs = mergeAttrs(this.attrs, gf.attrs);
    this.derived = DG.derived(this.totAttrs, this.lvl, this.classid, gf.gear);
    var def = 0; this.gearList().forEach(function (it) { def += DG.itemDefense(it); });   // D2 per-item armor defense (%ED hits each base, then summed) replaces the global armor×(1+ED%)
    this.derived.armor = Math.round(def);
    this.mhp = this.derived.life; this.mcharge = this.derived.charge;
    var w = this.equip.weapon, mn = (w && w.base && w.base.dmg_min) || 4, mx = (w && w.base && w.base.dmg_max) || 8;
    if (w && DG.isBroken(w)) { mn = 1; mx = 2; }                                     // BROKEN weapon: near-useless until repaired
    else if (w && w.ethereal) { mn = Math.floor(mn * 1.5); mx = Math.floor(mx * 1.5); }   // Spectral: +50% base weapon damage
    var ed = (gf.gear.ed_pct || 0) + (this.derived.dmg_pct || 0), flat = gf.gear.flat_steel || 0;  // ed_pct affix + might-driven physical %
    this.wpack = { steel: [(mn + flat) * (1 + ed / 100), (mx + flat) * (1 + ed / 100)] };
    var wp = this.wpack; ['ember', 'rime', 'galv', 'rot', 'wither'].forEach(function (t) { var f = gf.gear[t + '_dmg']; if (f) wp[t] = [f * 0.8, f * 1.2]; });
    this.spd = 2.1 * Math.max(0.4, 1 + (this.derived.move_speed || 0) / 100);   // move-speed affixes (armor-weight speed penalty now applied per-frame in step, tied to stamina)
    this.mstam = 80 + (this.totAttrs.vigor || 0);                                // max stamina scales with Vigor (D2: Vitality)
    if (this.stam == null) this.stam = this.mstam; else if (this.stam > this.mstam) this.stam = this.mstam;
    this.wname = w ? w.name : 'unarmed';
    return this;
  };

  Hero.prototype.equipItem = function (it) {
    var i = this.inv.indexOf(it); if (i >= 0) this.inv.splice(i, 1);
    if (this.equip[it.slot]) this.inv.push(this.equip[it.slot]);
    this.equip[it.slot] = it; this.recompute();
  };
  Hero.prototype.unequip = function (slot) { if (this.equip[slot]) { this.inv.push(this.equip[slot]); delete this.equip[slot]; this.recompute(); } };
  Hero.prototype.addItem = function (it) { this.inv.push(it); if (this.inv.length > 14) this.inv.shift(); };

  // grant xp; returns how many levels gained (caller handles fx). Full heal on level up.
  Hero.prototype.gainXP = function (n) {
    var ups = 0; this.xp += n; var need = this.lvl * 120;
    while (this.xp >= need) { this.xp -= need; this.lvl++; ups++; this.statPts += 5; this.skillPts += 1; this.recompute(); this.hp = this.mhp; need = this.lvl * 120; }
    return ups;
  };
  // spend one stat point into a base attribute (raises base → total via recompute). Returns true if a point was spent.
  Hero.prototype.allocStat = function (attr) {
    if (this.statPts <= 0 || DG.ATTRS.indexOf(attr) < 0) return false;
    this.attrs[attr] = (this.attrs[attr] || 0) + 1; this.statPts--; this.recompute(); return true;
  };

  (window.DGC = window.DGC || {}).Hero = Hero;
})();
