// Deepgilt — core/LopAnim : 16-directional Lords-of-Pain character animator.
// Drop-in replacement for DGC.Animation (same face/play/update/draw/frozen interface) so it
// plugs into the existing hero/monster game-state (position + dir + anim-mode) with no parallel
// state. LoP specifics: 16 directions (vs 8), per-mode frame counts, 256px frames whose figure
// is small & centred with a baked drop-shadow, and the pack's own path/naming scheme.
// Gated behind ?art=lop in index.html; the old Animation path is untouched when the flag is off.
(function () {
  var ROOT = 'art/lords_of_pain/playable character/';

  // 16 LoP directions: name + baked angle (E=0deg, increasing COUNTER-CLOCKWISE). index = angle/22.5.
  var DIRS = [
    { n: 'E', a: 0 }, { n: 'NEE', a: 22.5 }, { n: 'NE', a: 45 }, { n: 'NNE', a: 67.5 },
    { n: 'N', a: 90 }, { n: 'NNW', a: 112.5 }, { n: 'NW', a: 135 }, { n: 'NWW', a: 157.5 },
    { n: 'W', a: 180 }, { n: 'SWW', a: 202.5 }, { n: 'SW', a: 225 }, { n: 'SSW', a: 247.5 },
    { n: 'S', a: 270 }, { n: 'SSE', a: 292.5 }, { n: 'SE', a: 315 }, { n: 'SEE', a: 337.5 }
  ];

  // game mode -> LoP <group>_<anim> + frame count + timing (mirrors Animation's CFG).
  // Hero is "armed". No native hit/cast in the pack -> hit reuses armed_idle, cast reuses armed_attack.
  var MAP = {
    idle:   { anim: 'armed_idle',    nfr: 1, fps: 5, loop: true },
    walk:   { anim: 'armed_walk',    nfr: 8, fps: 4, loop: true },
    attack: { anim: 'armed_attack',  nfr: 8, fps: 3, loop: false },
    cast:   { anim: 'armed_attack',  nfr: 8, fps: 3, loop: false },
    hit:    { anim: 'armed_idle',    nfr: 1, fps: 2, loop: false },
    death:  { anim: 'special_death', nfr: 8, fps: 5, loop: false, hold: true }
  };

  // --- calibration (measured from frame alpha bbox + tuned from Stage-4 screenshots) ---
  // The figure is only ~16% of the 256 frame (the rest is transparent padding + baked shadow), so
  // the frame must be drawn LARGE for the figure to read at the intended on-screen height.
  var FIG = 0.20;       // frame draw size = H / FIG  (figure ends up ~0.8·H tall on screen)
  var FEET = 0.52;      // figure's feet sit ~52% down the frame -> anchor that point on the ground
  var DIR_OFFSET = 0;   // degrees added to the screen movement angle before snapping to a LoP dir

  function LopAnim(charName) {
    this.char = charName || 'warrior';
    // default 'walk' (NOT 'idle') to match Animation's contract: the game drives walk/idle via
    // update(moving) within the walk mode and never calls play('walk'); idle = walk frame 0.
    this.mode = 'walk'; this.dir = 14 /*SE, faces camera*/; this.frame = 0; this._t = 0;
    this.alpha = 1; this.scale = 1; this.yoff = 0; this.done = false; this.onEnd = null;
    this._cache = {};
    this.preload('armed_idle', 1); this.preload('armed_walk', 8);   // instant turn/walk from spawn
  }
  var P = LopAnim.prototype;

  P._url = function (anim, dirName, frame) {
    var a = null, i; for (i = 0; i < DIRS.length; i++) if (DIRS[i].n === dirName) { a = DIRS[i].a; break; }
    var ang = a.toFixed(1);
    return ROOT + this.char + '/' + this.char + '_' + anim + '/' + dirName + '/' +
      this.char + '_' + anim + '_' + dirName + '_' + ang + '_' + frame + '.png';
  };
  P._img = function (anim, dirName, frame) {
    var k = anim + '/' + dirName + '/' + frame, c = this._cache[k];
    if (c) return c;
    var im = new Image(); im.src = encodeURI(this._url(anim, dirName, frame)); this._cache[k] = im; return im;
  };
  P.preload = function (anim, nfr) { for (var d = 0; d < 16; d++) for (var f = 0; f < nfr; f++) this._img(anim, DIRS[d].n, f); };

  // face by raw 0..15 index (kept for interface parity)
  P.face = function (d) { this.dir = ((d % 16) + 16) % 16; };

  // face from a WORLD movement vector: convert to the on-screen iso angle (2:1 squash), then snap
  // to the nearest of 16 LoP angles. DIR_OFFSET corrects any constant rotation. Screen +y is down,
  // so -sdy makes "up the screen" = +90 = N (matches the pack's angle convention).
  P.faceVec = function (dx, dy) {
    if (!dx && !dy) return;
    var sdx = (dx - dy), sdy = (dx + dy) * 0.5;          // world -> iso screen (TH/2 = TW/4 -> 0.5 vertical squash)
    var ang = Math.atan2(-sdy, sdx) * 180 / Math.PI + DIR_OFFSET;
    ang %= 360; if (ang < 0) ang += 360;
    this.dir = Math.round(ang / 22.5) % 16;
  };

  P.play = function (mode, opts) {
    opts = opts || {};
    if (this.mode === mode && !opts.force) return;
    this.mode = mode; this.frame = 0; this._t = 0; this.done = false; this.onEnd = opts.onEnd || null;
    this.alpha = 1; this.scale = 1; this.yoff = 0;
    var m = MAP[mode]; if (m) this.preload(m.anim, m.nfr);   // lazy-load attack/death on first use
  };

  P.update = function (moving) {
    var m = MAP[this.mode] || MAP.walk;
    if (m.loop) { if (moving) { if (++this._t >= m.fps) { this._t = 0; this.frame = (this.frame + 1) % m.nfr; } } else this.frame = 0; return; }
    if (this.done) return;
    if (++this._t >= m.fps) {
      this._t = 0; this.frame++;
      if (this.frame >= m.nfr) {
        if (m.hold) { this.frame = m.nfr - 1; this.done = true; }   // death: hold prone frame
        else { this.mode = 'walk'; this.frame = 0; }                // attack -> walk
        if (this.onEnd) { var f = this.onEnd; this.onEnd = null; f(); }
      }
    }
  };

  // H = target FIGURE height in px (same contract as Animation.draw). Frame is drawn at H/FIG and
  // anchored so the figure's feet (FEET down the frame) land on the ground point (x,y).
  P.draw = function (ctx, x, y, H) {
    var m = MAP[this.mode] || MAP.idle, dirName = DIRS[this.dir].n;
    var im = this._img(m.anim, dirName, (this.frame | 0) % m.nfr);
    if (!im || !im.complete || !im.naturalWidth) return false;
    var sz = (H / FIG) * this.scale, oa = ctx.globalAlpha;
    ctx.imageSmoothingEnabled = true; if (this.alpha < 1) ctx.globalAlpha = oa * this.alpha;
    ctx.drawImage(im, (x - sz / 2) | 0, (y - sz * FEET + this.yoff) | 0, sz | 0, sz | 0);
    ctx.globalAlpha = oa; return true;
  };

  P.frozen = function () { return { lop: true, char: this.char, mode: this.mode, dir: this.dir, frame: this.frame | 0 }; };

  (window.DGC = window.DGC || {}).LopAnim = LopAnim;
})();
