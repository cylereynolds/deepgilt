// Deepgilt — core/MapEntity : base for anything that lives on the map at a world (x,y).
// Hero, monsters, servants all derive from this. Phase 1 keeps it minimal (position +
// facing + walk-frame state + a depth-sort key); Phase 2 will fold an Animation in here.
// Clean-room; OD2's d2mapentity is reference only.
(function () {
  function MapEntity(x, y) {
    this.x = x; this.y = y;   // world px
    this.dir = 0;             // 8-direction facing index
    this.fr = 0; this.ft = 0; // walk frame + frame timer
    this.fl = 0;              // hit-flash / flip flag (game-specific use)
  }
  // back-to-front isometric depth key (smaller = farther; drawn first)
  MapEntity.prototype.key = function (TS) { return (this.x + this.y) / TS; };
  (window.DGC = window.DGC || {}).MapEntity = MapEntity;
})();
