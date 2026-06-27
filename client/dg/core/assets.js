// Deepgilt — core/Assets : the AssetManager. Central load+cache for sprite sheets and
// textures (our only "source" is HTTP/fetch). Returns sheet objects an Animation can play.
// Clean-room; OD2's d2asset/d2loader/d2cache are reference only.
(function () {
  var Assets = {
    _sheets: {}, _tex: {},

    // A sheet = one animation mode for one actor: ndir directions x nfr frames.
    // Path convention: art/sprites/<name>/<mode>/dir<d>_<NN>.png . Cached by name+mode.
    sheet: function (name, mode, ndir, nfr) {
      var key = name + '/' + mode; if (this._sheets[key]) return this._sheets[key];
      var Q = { name: name, mode: mode, ndir: ndir, nfr: nfr, fr: [], ready: false }, total = ndir * nfr, got = 0;
      function tick() { if (++got >= total) Q.ready = true; }
      for (var d = 0; d < ndir; d++) {
        Q.fr[d] = [];
        for (var f = 0; f < nfr; f++) {
          var im = new Image(); im.onload = tick; im.onerror = tick;
          im.src = 'art/sprites/' + name + '/' + mode + '/dir' + d + '_' + (f < 10 ? '0' + f : '' + f) + '.png';
          Q.fr[d][f] = im;
        }
      }
      this._sheets[key] = Q; return Q;
    },

    // A single cached texture (floor/wall/etc.). onready fires once it has loaded.
    texture: function (url, onready) {
      var c = this._tex[url];
      if (c) { if (c.ready && onready) onready(); return c; }
      var im = new Image(); im.ready = false;
      im.onload = function () { im.ready = true; if (onready) onready(); };
      im.src = url; this._tex[url] = im; return im;
    }
  };
  (window.DGC = window.DGC || {}).Assets = Assets;
})();
