// Deepgilt — core/MapRenderer : draws a MapEngine in isometric.
// Owns: the pre-rendered ground canvas, the iso wall cubes, the camera, and the
// back-to-front depth sort that interleaves wall tiles with game-supplied "drawables".
// The game stays out of projection/sort; it just hands over actors as
//   { k: <sortKey>, draw: function(ctx, renderer) { ... } }
// and may call renderer.project(wx,wy) inside draw to place sprites.
// Clean-room; OD2's d2maprenderer is reference only.
(function () {
  // §2 alpha edge-feathering — build the 4 per-edge masks (TR/RB/BL/TL) for a TWxTH diamond.
  // Each mask is opaque (white, alpha~255) along its shared edge and ramps to ~0 inward via a
  // smoothstep, clipped to the diamond. feather=0.85: the ramp reaches 0 at 85% of the way across,
  // giving a soft band ~1 tile wide. Pure function of the projection; computed once, reused.
  function buildFeatherMasks(TW, TH, feather) {
    var cx = TW / 2, cy = TH / 2;
    var T = [cx, 0], R = [TW, cy], B = [cx, TH], L = [0, cy];
    var edges = [['TR', T, R], ['RB', R, B], ['BL', B, L], ['TL', L, T]];
    function inDiamond(x, y) { return Math.abs(x - cx) / cx + Math.abs(y - cy) / cy <= 1.0001; }
    function segDist(px, py, ax, ay, bx, by) {
      var dx = bx - ax, dy = by - ay, LL = dx * dx + dy * dy || 1;
      var t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / LL));
      var qx = ax + t * dx, qy = ay + t * dy; return Math.hypot(px - qx, py - qy);
    }
    var masks = {};
    edges.forEach(function (e) {
      var a = e[1], b = e[2], maxD = 0, x, y, d;
      for (y = 0; y < TH; y++) for (x = 0; x < TW; x++) {                          // pass 1: max in-diamond seg distance (normaliser)
        if (!inDiamond(x + 0.5, y + 0.5)) continue;
        d = segDist(x + 0.5, y + 0.5, a[0], a[1], b[0], b[1]); if (d > maxD) maxD = d;
      }
      var cv = document.createElement('canvas'); cv.width = TW; cv.height = TH;
      var c = cv.getContext('2d'), img = c.createImageData(TW, TH), p = img.data;
      for (y = 0; y < TH; y++) for (x = 0; x < TW; x++) {
        var i = (y * TW + x) * 4;
        if (!inDiamond(x + 0.5, y + 0.5)) { p[i + 3] = 0; continue; }              // transparent outside the diamond
        var n = segDist(x + 0.5, y + 0.5, a[0], a[1], b[0], b[1]) / maxD;          // 0 at edge -> 1 at far side
        var tt = Math.max(0, Math.min(1, n / feather)), s = tt * tt * (3 - 2 * tt); // smoothstep ramp
        p[i] = 255; p[i + 1] = 255; p[i + 2] = 255; p[i + 3] = Math.round((1 - s) * 255);
      }
      c.putImageData(img, 0, 0); masks[e[0]] = cv;
    });
    return masks;
  }

  function MapRenderer(map, iso) {
    this.map = map; this.iso = iso;
    this.ground = null; this.camX = 0; this.camY = 0;
    this._feather = null; this._scratch = null; this._sctx = null;
  }
  var P = MapRenderer.prototype;

  // Pre-render every floor cell as a textured iso diamond into an offscreen canvas (once per map).
  // texFn(gx,gy) -> the cell's own texture (zoned floors); classFn(gx,gy) -> a seam-class string so
  // §2 can feather a differing neighbour's material inward across the shared edge. Both optional:
  // with no classFn (e.g. single-material dungeons) the feather pass is skipped entirely.
  P.buildGround = function (floorTex, floorReady, FPATCH, texFn, classFn) {
    var iso = this.iso, map = this.map, TW = iso.TW, TH = iso.TH;
    var cv = document.createElement('canvas'); cv.width = iso.GCW; cv.height = iso.GCH;
    var g = cv.getContext('2d'); g.imageSmoothingEnabled = true;
    if (!this._feather) {                                                          // build masks + reusable scratch once
      this._feather = buildFeatherMasks(TW, TH, 0.85);
      this._scratch = document.createElement('canvas'); this._scratch.width = TW; this._scratch.height = TH;
      this._sctx = this._scratch.getContext('2d');
    }
    var masks = this._feather, scr = this._scratch, sctx = this._sctx;
    function cellHash(gx, gy) { return ((gx * 73856093) ^ (gy * 19349663)) >>> 0; }
    // factored single-tile fill: cycle FPATCH, per-cell flip (kills the repeat), draw into the (dw x dh) diamond bbox centered at (cx,cy)
    function drawDiamondFill(c, tex, hash, dw, dh, cxp, cyp) {
      var pt = FPATCH[hash % FPATCH.length];
      c.save(); c.translate(cxp, cyp); c.scale((hash & 1) ? -1 : 1, (hash & 2) ? -1 : 1);
      c.drawImage(tex, pt[0], pt[1], 170, 170, -dw / 2, -dh / 2, dw, dh); c.restore();
    }
    // edge -> [neighbour dx, neighbour dy, mask]: TR shares with (gx,gy-1), RB (gx+1,gy), BL (gx,gy+1), TL (gx-1,gy)
    var EDGES = [[0, -1, masks.TR], [1, 0, masks.RB], [0, 1, masks.BL], [-1, 0, masks.TL]];
    // floor is laid only under floor cells + the walls that BORDER the play area (wallVisible). Deep-void walls beyond
    // the impassable boundary get no floor, so there is nothing past the edge of the map. Each drawn cell is covered by
    // the opaque stone texture (which fully fills its diamond), so the play area never shows black tiles.
    for (var gy = 0; gy < map.GH; gy++) for (var gx = 0; gx < map.GW; gx++) {
      if (map.cells[gy][gx] !== 0 && !map.wallVisible(gx, gy)) continue;
      var T = iso.isoC(gx, gy), R = iso.isoC(gx + 1, gy), B = iso.isoC(gx + 1, gy + 1), L = iso.isoC(gx, gy + 1);
      g.save(); g.beginPath(); g.moveTo(T.x, T.y); g.lineTo(R.x, R.y); g.lineTo(B.x, B.y); g.lineTo(L.x, L.y); g.closePath(); g.clip();
      var ztex = texFn && texFn(gx, gy), tex = (ztex && ztex.ready) ? ztex : floorTex, rdy = (ztex && ztex.ready) ? true : floorReady;
      if (rdy) {
        var h = cellHash(gx, gy), dw = R.x - L.x, dh = B.y - T.y, cxp = (L.x + R.x) / 2, cyp = (T.y + B.y) / 2;
        drawDiamondFill(g, tex, h, dw, dh, cxp, cyp);                              // base material
        if (classFn) {                                                            // §2: feather each differing neighbour's material inward from the shared edge
          var myClass = classFn(gx, gy);
          for (var ei = 0; ei < 4; ei++) {
            var ngx = gx + EDGES[ei][0], ngy = gy + EDGES[ei][1], mask = EDGES[ei][2];
            if (ngx < 0 || ngy < 0 || ngx >= map.GW || ngy >= map.GH) continue;
            if (map.cells[ngy][ngx] !== 0 && !map.wallVisible(ngx, ngy)) continue; // no neighbour floor -> nothing to bleed
            if (classFn(ngx, ngy) === myClass) continue;                          // same seam class -> no seam
            var ntex = texFn(ngx, ngy);
            if (!ntex || !ntex.ready) continue;
            sctx.clearRect(0, 0, TW, TH);
            drawDiamondFill(sctx, ntex, cellHash(ngx, ngy), TW, TH, TW / 2, TH / 2); // neighbour's tile (its own flip), centered in scratch
            sctx.globalCompositeOperation = 'destination-in'; sctx.drawImage(mask, 0, 0); sctx.globalCompositeOperation = 'source-over';
            g.drawImage(scr, L.x, T.y);                                           // blit the faded band into our diamond (aligned to its bbox)
          }
        }
        var jb = ((h >> 3) % 100) / 100;                                          // per-cell brightness jitter (base only)
        g.fillStyle = jb < 0.5 ? 'rgba(0,0,0,' + (0.05 + jb * 0.14).toFixed(3) + ')' : 'rgba(255,248,230,' + ((jb - 0.5) * 0.07).toFixed(3) + ')';
        g.fillRect(L.x, T.y, dw, dh);
      }
      else { g.fillStyle = ((gx + gy) & 1) ? '#16131b' : '#1a1622'; g.fillRect(L.x, T.y, R.x - L.x, B.y - T.y); }
      g.restore();
      // (no per-cell diamond outline — that read as a grid drawn on the ground)
    }
    var nc = document.createElement('canvas'); nc.width = 40; nc.height = 40; var ng = nc.getContext('2d');
    for (var ny = 0; ny < 40; ny++) for (var nx = 0; nx < 40; nx++) { var nv = 170 + (Math.random() * 85 | 0); ng.fillStyle = 'rgb(' + nv + ',' + nv + ',' + nv + ')'; ng.fillRect(nx, ny, 1, 1); }
    g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.55; g.imageSmoothingEnabled = true; g.drawImage(nc, 0, 0, 40, 40, 0, 0, iso.GCW, iso.GCH); g.restore();  // large soft blotches break the tiled-field uniformity
    g.fillStyle = 'rgba(8,6,12,0.10)'; g.fillRect(0, 0, iso.GCW, iso.GCH); // bake floor mood (light)
    this.ground = cv;
  };

  // AUTOTILED GROUND (town): blit pre-cut iso diamond tiles from an autotile sheet (SBS Grass<->Dirt
  // transitions) chosen per cell by cellFn(gx,gy) -> {c,r,flip} (source cell in a 128x64-tile grid).
  // Native diamonds drawn straight into each cell's clipped diamond bbox; the sheet's black corners
  // fall outside the clip. No procedural feather — the blend lives in the art.
  P.buildGroundAuto = function (sheet, ready, cellFn) {
    var iso = this.iso, map = this.map, STW = 128, STH = 64, INF = 1.16;          // INF: draw each tile oversized INSIDE its diamond clip so the tile's dark AA edge falls outside the clip and is trimmed — no lattice/grid lines
    var cv = document.createElement('canvas'); cv.width = iso.GCW; cv.height = iso.GCH;
    var g = cv.getContext('2d'); g.imageSmoothingEnabled = true;
    g.fillStyle = '#3c4f2b'; g.fillRect(0, 0, iso.GCW, iso.GCH);                   // grass base so any clip-edge AA reads green, never a dark grid line
    for (var gy = 0; gy < map.GH; gy++) for (var gx = 0; gx < map.GW; gx++) {
      if (map.cells[gy][gx] !== 0 && !map.wallVisible(gx, gy)) continue;
      var T = iso.isoC(gx, gy), R = iso.isoC(gx + 1, gy), B = iso.isoC(gx + 1, gy + 1), L = iso.isoC(gx, gy + 1);
      g.save(); g.beginPath(); g.moveTo(T.x, T.y); g.lineTo(R.x, R.y); g.lineTo(B.x, B.y); g.lineTo(L.x, L.y); g.closePath(); g.clip();
      if (ready) {
        var t = cellFn(gx, gy), dw = (R.x - L.x) * INF, dh = (B.y - T.y) * INF, h = ((gx * 73856093) ^ (gy * 19349663)) >>> 0;
        g.save(); g.translate((L.x + R.x) / 2, (T.y + B.y) / 2);
        if (t.flip) g.scale((h & 1) ? -1 : 1, (h & 2) ? -1 : 1);                 // 4-way flip — full/symmetric tiles only; transitions never flip (orientation matters)
        g.drawImage(sheet, t.c * STW, t.r * STH, STW, STH, -dw / 2, -dh / 2, dw, dh); g.restore();
      } else { g.fillStyle = ((gx + gy) & 1) ? '#16131b' : '#1a1622'; g.fillRect(L.x, T.y, R.x - L.x, B.y - T.y); }
      g.restore();
    }
    var nc = document.createElement('canvas'); nc.width = 40; nc.height = 40; var ng = nc.getContext('2d');   // large soft blotches break any residual field uniformity
    for (var ny = 0; ny < 40; ny++) for (var nx = 0; nx < 40; nx++) { var nv = 185 + (Math.random() * 60 | 0); ng.fillStyle = 'rgb(' + nv + ',' + nv + ',' + nv + ')'; ng.fillRect(nx, ny, 1, 1); }
    g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.30; g.imageSmoothingEnabled = true; g.drawImage(nc, 0, 0, 40, 40, 0, 0, iso.GCW, iso.GCH); g.restore();
    g.fillStyle = 'rgba(8,6,12,0.10)'; g.fillRect(0, 0, iso.GCW, iso.GCH); // light cohesion/mood
    this.ground = cv;
  };

  // SINGLE-IMAGE GROUND (town hub): pixelate one cohesive top-down ground image, then skew it into the
  // 2.5D iso plane — no per-cell tiling, so no repetition. PIX = pixels-per-tile (lower = chunkier).
  P.buildGroundImage = function (img, ready, PIX) {
    var iso = this.iso, map = this.map;
    var cv = document.createElement('canvas'); cv.width = iso.GCW; cv.height = iso.GCH;
    var g = cv.getContext('2d');
    g.fillStyle = '#15121a'; g.fillRect(0, 0, iso.GCW, iso.GCH);
    if (ready) {
      var pw = Math.max(8, Math.round(map.GW * PIX)), ph = Math.max(8, Math.round(map.GH * PIX));
      var pc = document.createElement('canvas'); pc.width = pw; pc.height = ph;        // 1) pixelate (downscale)
      var pg = pc.getContext('2d'); pg.imageSmoothingEnabled = true; pg.drawImage(img, 0, 0, pw, ph);
      var a = (map.GW / pw) * (iso.TW / 2), b = (map.GW / pw) * (iso.TH / 2);          // 2) skew image(col,row) -> isoC(col,row)
      var c = -(map.GH / ph) * (iso.TW / 2), d = (map.GH / ph) * (iso.TH / 2);
      g.imageSmoothingEnabled = false;                                                 // hard pixels (matches the sprite style)
      g.setTransform(a, b, c, d, iso.OX, iso.OY); g.drawImage(pc, 0, 0); g.setTransform(1, 0, 0, 1, 0, 0);
    }
    this.ground = cv;
  };

  // LORDS-OF-PAIN GROUND (evaluation path, ?art=lop): the pack's ground is a seamless 256x256
  // square stone MATERIAL (opaque) + transparent grunge OVERLAYS — not pre-projected diamonds.
  // So we tile the stone as a canvas-aligned repeating pattern (continuous across cells -> no
  // per-tile repeat, no seams) clipped to each floor diamond, then scatter the overlays on top
  // for grime variation. NO color grade — the art is already dark/grimy (show native look).
  P.buildGroundLOP = function (stoneImg, ready, overlays) {
    var iso = this.iso, map = this.map;
    var cv = document.createElement('canvas'); cv.width = iso.GCW; cv.height = iso.GCH;
    var g = cv.getContext('2d'); g.imageSmoothingEnabled = true;
    g.fillStyle = '#0b0a0d'; g.fillRect(0, 0, cv.width, cv.height);                 // void backdrop
    if (ready && stoneImg && stoneImg.complete && stoneImg.naturalWidth) {
      var pat = g.createPattern(stoneImg, 'repeat');                                 // canvas-aligned -> seamless across diamonds
      for (var gy = 0; gy < map.GH; gy++) for (var gx = 0; gx < map.GW; gx++) {
        if (map.cells[gy][gx] !== 0 && !map.wallVisible(gx, gy)) continue;
        var T = iso.isoC(gx, gy), R = iso.isoC(gx + 1, gy), B = iso.isoC(gx + 1, gy + 1), L = iso.isoC(gx, gy + 1);
        g.save(); g.beginPath(); g.moveTo(T.x, T.y); g.lineTo(R.x, R.y); g.lineTo(B.x, B.y); g.lineTo(L.x, L.y); g.closePath(); g.clip();
        g.fillStyle = pat; g.fillRect(L.x, T.y, R.x - L.x, B.y - T.y);
        g.restore();
      }
      if (overlays && overlays.length) {                                            // scatter transparent grunge decals (native alpha)
        var seed = 20240617; function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
        var n = Math.max(6, Math.round(map.GW * map.GH / 26));
        for (var s = 0; s < n; s++) {
          var ov = overlays[(rnd() * overlays.length) | 0]; if (!ov || !ov.complete || !ov.naturalWidth) continue;
          var cgx = rnd() * map.GW, cgy = rnd() * map.GH;
          if (map.cells[cgy | 0] && map.cells[cgy | 0][cgx | 0] !== 0) continue;     // only over floor
          var p = iso.isoC(cgx, cgy), sz = 60 + rnd() * 110;
          g.save(); g.globalAlpha = 0.45 + rnd() * 0.4; g.drawImage(ov, p.x - sz / 2, p.y - sz / 2, sz, sz); g.restore();
        }
      }
    }
    this.ground = cv;
  };

  // world px -> screen px (valid after camera is set in render())
  P.project = function (wx, wy) { var p = this.iso.w2i(wx, wy); return { x: p.x - this.camX, y: p.y - this.camY }; };

  // one iso wall cube at grid (gx,gy): SW face + SE face + raised top diamond
  P.drawWallIso = function (ctx, gx, gy) {
    var iso = this.iso, cx = this.camX, cy = this.camY, h = iso.WALLZ;
    var L = iso.isoC(gx, gy + 1), B = iso.isoC(gx + 1, gy + 1), R = iso.isoC(gx + 1, gy), T = iso.isoC(gx, gy);
    var Lx = L.x - cx, Ly = L.y - cy, Bx = B.x - cx, By = B.y - cy, Rx = R.x - cx, Ry = R.y - cy, Tx = T.x - cx, Ty = T.y - cy;
    ctx.fillStyle = '#171320'; ctx.beginPath(); ctx.moveTo(Lx, Ly); ctx.lineTo(Bx, By); ctx.lineTo(Bx, By - h); ctx.lineTo(Lx, Ly - h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#241f2e'; ctx.beginPath(); ctx.moveTo(Bx, By); ctx.lineTo(Rx, Ry); ctx.lineTo(Rx, Ry - h); ctx.lineTo(Bx, By - h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#332d3e'; ctx.beginPath(); ctx.moveTo(Tx, Ty - h); ctx.lineTo(Rx, Ry - h); ctx.lineTo(Bx, By - h); ctx.lineTo(Lx, Ly - h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(150,140,110,0.16)'; ctx.lineWidth = 1; ctx.stroke();
  };

  // Blit the ground camera window, then draw walls + drawables back-to-front.
  // fx,fy = world point to center the camera on (the hero). drawables = [{k,draw}].
  P.render = function (ctx, CW, CH, fx, fy, drawables) {
    var iso = this.iso, map = this.map, hi = iso.w2i(fx, fy);
    this.camX = Math.max(0, Math.min(iso.GCW - CW, hi.x - CW / 2));
    this.camY = Math.max(0, Math.min(iso.GCH - CH, hi.y - CH / 2));
    if (this.ground) ctx.drawImage(this.ground, this.camX, this.camY, CW, CH, 0, 0, CW, CH);
    var R = [], cx = this.camX, cy = this.camY;
    for (var gy = 0; gy < map.GH; gy++) for (var gx = 0; gx < map.GW; gx++) {
      if (map.cells[gy][gx] !== 1 || !map.wallVisible(gx, gy)) continue;
      var c = iso.isoC(gx + 0.5, gy + 0.5), sx = c.x - cx, sy = c.y - cy;
      if (sx < -48 || sx > CW + 48 || sy < -72 || sy > CH + 48) continue;  // cull walls outside the visible window (not a fixed cell radius) — no more pop-out at distance
      R.push({ k: gx + gy + 1, w: 1, gx: gx, gy: gy });
    }
    for (var i = 0; i < drawables.length; i++) R.push(drawables[i]);
    R.sort(function (a, b) { return (a.k - b.k) || ((a.w ? 0 : 1) - (b.w ? 0 : 1)); });
    for (var j = 0; j < R.length; j++) { var e = R[j]; if (e.w) this.drawWallIso(ctx, e.gx, e.gy); else e.draw(ctx, this); }
  };

  (window.DGC = window.DGC || {}).MapRenderer = MapRenderer;
})();
