// Deepgilt — core/LopAnim : 16-directional Lords-of-Pain character animator.
// Drop-in replacement for DGC.Animation (same face/play/update/draw/frozen interface) so it
// plugs into the existing hero/monster game-state (position + dir + anim-mode) with no parallel
// state. LoP specifics: 16 directions (vs 8), per-mode frame counts, 256px frames whose figure
// is small & centred with a baked drop-shadow, and the pack's own path/naming scheme.
// Gated behind ?art=lop in index.html; the old Animation path is untouched when the flag is off.
(function () {
  var ROOT = 'art/lop_cropped/';   // cropped frames (tools/crop_lop_frames.py) — lean, padding removed

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

  // --- calibration for the CROPPED warrior frames (from tools/crop_lop_frames.py _anchor.json) ---
  // drawH = H · KH (figure ends up ~0.85·H tall); the feet point sits FEET down the cropped frame
  // and is anchored on the ground; XOFF re-centres if the figure isn't centred in the crop.
  var KH = 2.177;       // 90·SPR·KH ≈ figure height on screen
  var FEET = 0.696;     // ground-contact fraction down the cropped frame
  var XOFF = 0.0;       // horizontal figure offset (fraction of cropped width); 0 = centred
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

  // H = the size knob (same contract as Animation.draw: 90·SPR). The cropped frame is drawn at
  // height H·KH (aspect-preserved) and anchored so the figure's feet (FEET down the frame) land on
  // the ground point (x,y). A small procedural contact-shadow ellipse replaces the cropped-out
  // baked shadow so the figure reads as grounded regardless of facing.
  P.draw = function (ctx, x, y, H) {
    var m = MAP[this.mode] || MAP.idle, dirName = DIRS[this.dir].n;
    var im = this._img(m.anim, dirName, (this.frame | 0) % m.nfr);
    if (!im || !im.complete || !im.naturalWidth) return false;
    var drawH = H * KH * this.scale, drawW = drawH * im.naturalWidth / im.naturalHeight, oa = ctx.globalAlpha;
    ctx.save(); ctx.globalAlpha = oa * 0.28 * this.alpha; ctx.fillStyle = '#000';      // contact shadow
    ctx.beginPath(); ctx.ellipse(x, y, drawW * 0.17, drawW * 0.065, 0, 0, 6.28); ctx.fill(); ctx.restore();
    ctx.imageSmoothingEnabled = true; if (this.alpha < 1) ctx.globalAlpha = oa * this.alpha;
    ctx.drawImage(im, (x - drawW / 2 + XOFF * drawW) | 0, (y - drawH * FEET + this.yoff) | 0, drawW | 0, drawH | 0);
    ctx.globalAlpha = oa; return true;
  };

  P.frozen = function () { return { lop: true, char: this.char, mode: this.mode, dir: this.dir, frame: this.frame | 0 }; };

  (window.DGC = window.DGC || {}).LopAnim = LopAnim;
})();
