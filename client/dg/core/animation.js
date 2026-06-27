// Deepgilt — core/Animation : per-actor multi-mode sprite animation over Assets sheets.
// Models OD2's COF idea: mode x direction x frame, with a layers hook for gear-on-sprite.
// Modes (each a baked sheet under art/sprites/<name>/<mode>/): walk (loop, driven by
// movement), attack (play-once -> back to walk), death (play-once -> hold last/prone frame).
// Clean-room; OD2's d2asset animation / d2cof are reference only.
(function () {
  // fps = game-ticks held per sprite frame (higher = slower). Tuned vs combat cadence.
  var CFG = {
    walk:   { fps: 5, loop: true },        // paced to the move speed below to limit foot-sliding
    idle:   { fps: 5, loop: true },        // idle reuses the walk sheet, frame held at 0
    attack: { fps: 3, loop: false },       // swing, then revert to walk (fits the 32-tick attack cd)
    cast:   { fps: 5, loop: false },       // deliberate spell cast, then revert to walk
    hit:    { fps: 2, loop: false },        // short flinch (kept brief so it doesn't dominate combat)
    death:  { fps: 5, loop: false, hold: true } // fall, then hold the final prone frame
  };

  function Animation(name, ndir, nfr) {
    this.name = name; this.ndir = ndir; this.nfr = nfr;
    this.sheets = {}; this.layers = [];     // layers = future gear sheets composited on top
    this.mode = 'walk'; this.dir = 0; this.frame = 0; this._t = 0;
    this.alpha = 1; this.scale = 1; this.yoff = 0; this.done = false; this.onEnd = null;
    if (name) this.sheet('walk');
  }
  var P = Animation.prototype;

  P.sheet = function (mode) {
    if (!this.name) return null;
    if (!this.sheets[mode]) this.sheets[mode] = DGC.Assets.sheet(this.name, mode === 'idle' ? 'walk' : mode, this.ndir, this.nfr);
    return this.sheets[mode];
  };
  P.face = function (d) { this.dir = ((d % this.ndir) + this.ndir) % this.ndir; };

  // Switch mode. once-modes (attack/death) reset to frame 0; opts.force replays the same mode.
  P.play = function (mode, opts) {
    opts = opts || {};
    if (this.mode === mode && !opts.force) return;
    this.mode = mode; this.frame = 0; this._t = 0; this.done = false; this.onEnd = opts.onEnd || null;
    this.alpha = 1; this.scale = 1; this.yoff = 0; this.sheet(mode);
  };

  P.update = function (moving) {
    var cfg = CFG[this.mode] || CFG.walk;
    if (cfg.loop) { if (moving) { if (++this._t >= cfg.fps) { this._t = 0; this.frame = (this.frame + 1) % this.nfr; } } else this.frame = 0; return; }
    if (this.done) return;                                  // death: holding final frame
    if (++this._t >= cfg.fps) {
      this._t = 0; this.frame++;
      if (this.frame >= this.nfr) {
        if (cfg.hold) { this.frame = this.nfr - 1; this.done = true; }   // hold prone frame
        else { this.mode = 'walk'; this.frame = 0; }                     // attack -> walk
        if (this.onEnd) { var f = this.onEnd; this.onEnd = null; f(); }
      }
    }
  };

  // snapshot the current frame (incl mode) so a corpse decal keeps drawing it after removal
  P.frozen = function () { return { name: this.name, mode: this.mode, dir: this.dir, frame: this.frame | 0, ndir: this.ndir, nfr: this.nfr }; };

  P.draw = function (ctx, x, y, H) {
    var Q = this.sheets[this.mode] || this.sheet(this.mode); if (!Q || !Q.ready) return false;
    var row = Q.fr[this.dir % Q.ndir], im = row && row[(this.frame | 0) % Q.nfr];
    if (!im || !im.complete || !im.naturalWidth) return false;
    var hh = H * this.scale, bw = im.naturalWidth * (hh / im.naturalHeight), oa = ctx.globalAlpha, ty = y - hh + 10 + this.yoff;
    ctx.imageSmoothingEnabled = true; if (this.alpha < 1) ctx.globalAlpha = oa * this.alpha;
    ctx.drawImage(im, x - bw / 2, ty, bw, hh);
    for (var i = 0; i < this.layers.length; i++) {
      var Lq = this.layers[i]; if (!Lq || !Lq.ready) continue;
      var lr = Lq.fr[this.dir % Lq.ndir], lim = lr && lr[(this.frame | 0) % Lq.nfr];
      if (lim && lim.complete && lim.naturalWidth) ctx.drawImage(lim, x - bw / 2, ty, bw, hh);
    }
    ctx.globalAlpha = oa; return true;
  };

  // draw a frozen snapshot (corpse decal) at a given alpha
  Animation.drawFrozen = function (ctx, snap, x, y, H, alpha) {
    var Q = DGC.Assets.sheet(snap.name, snap.mode === 'idle' ? 'walk' : snap.mode, snap.ndir, snap.nfr); if (!Q.ready) return;
    var row = Q.fr[snap.dir % Q.ndir], im = row && row[snap.frame % Q.nfr]; if (!im || !im.naturalWidth) return;
    var bw = im.naturalWidth * (H / im.naturalHeight), oa = ctx.globalAlpha;
    ctx.globalAlpha = oa * alpha; ctx.imageSmoothingEnabled = true; ctx.drawImage(im, x - bw / 2, y - H + 10, bw, H); ctx.globalAlpha = oa;
  };

  (window.DGC = window.DGC || {}).Animation = Animation;
})();
