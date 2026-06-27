// Deepgilt — common/iso : 2:1 isometric projection (pure, no engine deps).
// Clean-room reimplementation of the projection concept; OD2 is reference only.
// A factory bound to a grid (GW x GH cells of TS world-px) returns the screen-space
// projection for a "ground canvas" whose origin is offset so all coords are >= 0.
(function () {
  function Iso(GW, GH, TS) {
    var TW = 64, TH = 32, WALLZ = 30;          // diamond tile w/h on screen; wall height
    var OX = GH * (TW / 2) + TW / 2, OY = WALLZ + TH;            // ground-canvas origin offset
    var GCW = (GW + GH) * (TW / 2) + TW, GCH = (GW + GH) * (TH / 2) + OY + TH;
    function isoC(gx, gy) { return { x: (gx - gy) * (TW / 2) + OX, y: (gx + gy) * (TH / 2) + OY }; }
    function w2i(wx, wy) { return isoC(wx / TS, wy / TS); }        // world px -> ground-canvas px
    function i2w(ix, iy) {                                          // ground-canvas px -> world px
      var ax = ix - OX, ay = iy - OY;
      var gx = (ax / (TW / 2) + ay / (TH / 2)) / 2, gy = (ay / (TH / 2) - ax / (TW / 2)) / 2;
      return { x: gx * TS, y: gy * TS };
    }
    return { TW: TW, TH: TH, WALLZ: WALLZ, OX: OX, OY: OY, GCW: GCW, GCH: GCH, isoC: isoC, w2i: w2i, i2w: i2w };
  }
  (window.DGC = window.DGC || {}).Iso = Iso;
})();
