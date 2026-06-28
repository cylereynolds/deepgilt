// Deepgilt — core/LopAnim : 16-directional Lords-of-Pain character animator (config-driven).
// Drop-in for DGC.Animation (face/play/update/draw/frozen) so it plugs into the existing
// hero/monster game-state (position + dir + anim-mode) with no parallel state. Per-character
// config (CHARS) describes the LoP anim folders, frame counts, timing, mode fallbacks, and the
// CROPPED-frame anchor (from tools/crop_lop_frames.py). Loads lean cropped frames from
// art/lop_cropped/. Gated behind ?art=lop in index.html; old rendering untouched when off.
(function () {
  var ROOT = 'art/lop_cropped/';   // cropped frames (tools/crop_lop_frames.py) — padding removed

  // 16 LoP directions: name + baked angle (E=0deg, increasing COUNTER-CLOCKWISE). index = angle/22.5.
  var DIRS = [
    { n: 'E', a: 0 }, { n: 'NEE', a: 22.5 }, { n: 'NE', a: 45 }, { n: 'NNE', a: 67.5 },
    { n: 'N', a: 90 }, { n: 'NNW', a: 112.5 }, { n: 'NW', a: 135 }, { n: 'NWW', a: 157.5 },
    { n: 'W', a: 180 }, { n: 'SWW', a: 202.5 }, { n: 'SW', a: 225 }, { n: 'SSW', a: 247.5 },
    { n: 'S', a: 270 }, { n: 'SSE', a: 292.5 }, { n: 'SE', a: 315 }, { n: 'SEE', a: 337.5 }
  ];
  var DIR_OFFSET = 0;   // degrees added to the screen movement angle before snapping to a LoP dir
  var CHAR_SCALE = 0.62; // global down-scale for ALL LoP characters so they read smaller than walls/braziers (D2 proportion)

  // ---- per-character MODE TABLE -------------------------------------------------------------
  // Maps DeepGilt game modes (walk/idle/attack/cast/hit/death) -> a LoP anim folder suffix +
  // frame count + timing. loop:1 = locomotion (walk/idle); hold:1 = play-once then freeze last
  // frame (death); otherwise play-once -> revert to walk (attack/cast/hit). An UNDEFINED mode
  // falls back to walk locomotion (documented per character below).
  function humanoid(group) {                              // players + skeleton: full idle/walk/attack/death
    return {
      walk:   { lop: group + '_walk',   nfr: 8, fps: 4, loop: 1 },
      idle:   { lop: group + '_idle',   nfr: 1, fps: 6, loop: 1 },
      attack: { lop: group + '_attack', nfr: 8, fps: 3 },
      cast:   { lop: group + '_attack', nfr: 8, fps: 3 },   // FALLBACK: no cast anim -> reuse attack
      hit:    { lop: group + '_idle',   nfr: 1, fps: 2 },   // FALLBACK: no hit anim -> brief idle flinch
      death:  { lop: 'special_death',   nfr: 8, fps: 5, hold: 1 }
    };
  }
  var SLIME = {                                           // slime: NO attack, death is 7 frames
    walk:   { lop: 'default_walk',  nfr: 8, fps: 4, loop: 1 },
    idle:   { lop: 'default_idle',  nfr: 1, fps: 6, loop: 1 },
    death:  { lop: 'special_death', nfr: 7, fps: 5, hold: 1 }
    // FALLBACK: attack/cast/hit are UNDEFINED -> resolve to walk locomotion (the slime "attacks"
    // by lunging/bumping while walking; no distinct swing exists in the pack).
  };
  var DEMON = {                                           // boss: animated 8-frame idle + two attacks
    walk:   { lop: 'default_walk',    nfr: 8, fps: 4, loop: 1 },
    idle:   { lop: 'default_idle',    nfr: 8, fps: 5, loop: 1 },   // proper animated idle (not a 1-frame hold)
    attack: { lop: 'default_attack1', nfr: 8, fps: 3 },
    cast:   { lop: 'default_attack2', nfr: 8, fps: 3 },            // FALLBACK: cast -> the 2nd attack (variety)
    hit:    { lop: 'default_idle',    nfr: 8, fps: 2 },            // FALLBACK: no hit -> brief idle
    death:  { lop: 'special_death',   nfr: 8, fps: 5, hold: 1 }
    // (special_intro / special_laugh exist but aren't wired to a combat mode — boss-entrance use later.)
  };

  var GRAVELIGHT = {                                     // PLACEHOLDER: Blender-generated floating orb-wisp (tools/blender_creature.py)
    walk:   { lop: 'default_walk',   nfr: 6, fps: 4, loop: 1 },
    idle:   { lop: 'default_idle',   nfr: 1, fps: 6, loop: 1 },
    attack: { lop: 'default_attack', nfr: 4, fps: 3 },
    cast:   { lop: 'default_attack', nfr: 4, fps: 3 }     // hit/death undefined -> walk + alpha fade (no death frames rendered)
  };

  // anchors from tools/crop_lop_frames.py _anchor.json (cropped-frame values)
  var CHARS = {
    warrior:   { modes: humanoid('armed'),   anchor: { KH: 2.177, FEET: 0.696, XOFF: 0 } },
    knight:    { modes: humanoid('armed'),   anchor: { KH: 2.172, FEET: 0.676, XOFF: 0 } },
    fighter:   { modes: humanoid('armed'),   anchor: { KH: 2.135, FEET: 0.683, XOFF: 0 } },
    skeleton:  { modes: humanoid('default'), anchor: { KH: 2.040, FEET: 0.753, XOFF: 0 } },
    slime:     { modes: SLIME,               anchor: { KH: 1.747, FEET: 0.752, XOFF: 0 } },
    demonlord: { modes: DEMON,               anchor: { KH: 1.753, FEET: 0.739, XOFF: 0 } },
    gravelight: { modes: GRAVELIGHT,         anchor: { KH: 1.108, FEET: 0.952, XOFF: 0 } }   // Blender placeholder
  };

  function LopAnim(charName) {
    this.char = (charName && CHARS[charName]) ? charName : 'warrior';
    this.cfg = CHARS[this.char];
    // default 'walk' locomotion (NOT a one-shot 'idle'): the game drives walk/idle via
    // update(moving) and never calls play('walk'); _loco picks walk-vs-idle from movement.
    this.mode = 'walk'; this._loco = 'idle'; this.dir = 14 /*SE, faces camera*/;
    this.frame = 0; this._t = 0; this.alpha = 1; this.scale = 1; this.yoff = 0; this.done = false; this.onEnd = null;
    this._cache = {};
    this.preloadAnim(this.cfg.modes.walk); this.preloadAnim(this.cfg.modes.idle);
  }
  var P = LopAnim.prototype;

  P._url = function (lop, dirName, frame) {
    var a = null, i; for (i = 0; i < DIRS.length; i++) if (DIRS[i].n === dirName) { a = DIRS[i].a; break; }
    var ang = a.toFixed(1), c = this.char;
    return ROOT + c + '/' + c + '_' + lop + '/' + dirName + '/' + c + '_' + lop + '_' + dirName + '_' + ang + '_' + frame + '.png';
  };
  P._img = function (lop, dirName, frame) {
    var k = lop + '/' + dirName + '/' + frame, c = this._cache[k];
    if (c) return c;
    var im = new Image(); im.src = encodeURI(this._url(lop, dirName, frame)); this._cache[k] = im; return im;
  };
  P.preloadAnim = function (def) { if (!def) return; for (var d = 0; d < 16; d++) for (var f = 0; f < def.nfr; f++) this._img(def.lop, DIRS[d].n, f); };

  // the anim def actually showing right now: an active one-shot mode, else walk/idle locomotion
  P._cur = function () { var m = this.cfg.modes, k = this.mode; if (k !== 'walk' && m[k] && !m[k].loop) return m[k]; return m[this._loco] || m.walk; };

  P.face = function (d) { this.dir = ((d % 16) + 16) % 16; };
  // face from a WORLD movement vector -> on-screen iso angle (2:1 squash) -> nearest of 16 LoP dirs
  P.faceVec = function (dx, dy) {
    if (!dx && !dy) return;
    var sdx = (dx - dy), sdy = (dx + dy) * 0.5;
    var ang = Math.atan2(-sdy, sdx) * 180 / Math.PI + DIR_OFFSET;
    ang %= 360; if (ang < 0) ang += 360;
    this.dir = Math.round(ang / 22.5) % 16;
  };

  // play a game mode. Undefined / loop modes resolve to walk locomotion (the documented fallback).
  P.play = function (mode, opts) {
    opts = opts || {};
    var def = this.cfg.modes[mode];
    if (!def || def.loop) { this.mode = 'walk'; return; }     // no such one-shot -> stay in locomotion
    if (this.mode === mode && !opts.force) return;
    this.mode = mode; this.frame = 0; this._t = 0; this.done = false; this.onEnd = opts.onEnd || null;
    this.alpha = 1; this.scale = 1; this.yoff = 0; this.preloadAnim(def);
  };

  P.update = function (moving) {
    var m = this.cfg.modes;
    if (this.mode === 'walk') {                                // locomotion: animate walk (moving) or idle (stopped)
      var nl = moving ? 'walk' : 'idle';
      if (nl !== this._loco) { this._loco = nl; this.frame = 0; this._t = 0; }
      var lm = m[this._loco] || m.walk;
      if (++this._t >= lm.fps) { this._t = 0; this.frame = (this.frame + 1) % lm.nfr; }
      return;
    }
    var d = m[this.mode]; if (!d) { this.mode = 'walk'; return; }
    if (this.done) return;
    if (++this._t >= d.fps) {
      this._t = 0; this.frame++;
      if (this.frame >= d.nfr) {
        if (d.hold) { this.frame = d.nfr - 1; this.done = true; }              // death: hold last frame
        else { this.mode = 'walk'; this._loco = moving ? 'walk' : 'idle'; this.frame = 0; } // attack/cast/hit -> walk
        if (this.onEnd) { var f = this.onEnd; this.onEnd = null; f(); }
      }
    }
  };

  // H = size knob (90·SPR for the hero, _HH for monsters). The cropped frame is drawn at H·KH
  // (aspect-preserved), feet (FEET down the frame) anchored on the ground point, with a procedural
  // contact-shadow ellipse (the baked shadow was cropped out).
  P.draw = function (ctx, x, y, H) {
    var def = this._cur(), dirName = DIRS[this.dir].n;
    var im = this._img(def.lop, dirName, (this.frame | 0) % def.nfr);
    if (!im || !im.complete || !im.naturalWidth) return false;
    var an = this.cfg.anchor, drawH = H * an.KH * CHAR_SCALE * this.scale, drawW = drawH * im.naturalWidth / im.naturalHeight, oa = ctx.globalAlpha;
    ctx.save(); ctx.globalAlpha = oa * 0.28 * this.alpha; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(x, y, drawW * 0.17, drawW * 0.065, 0, 0, 6.28); ctx.fill(); ctx.restore();
    ctx.imageSmoothingEnabled = true; if (this.alpha < 1) ctx.globalAlpha = oa * this.alpha;
    ctx.drawImage(im, (x - drawW / 2 + an.XOFF * drawW) | 0, (y - drawH * an.FEET + this.yoff) | 0, drawW | 0, drawH | 0);
    ctx.globalAlpha = oa; return true;
  };

  P.frozen = function () { return { lop: true, char: this.char, mode: this.mode, loco: this._loco, dir: this.dir, frame: this.frame | 0 }; };

  (window.DGC = window.DGC || {}).LopAnim = LopAnim;
})();
