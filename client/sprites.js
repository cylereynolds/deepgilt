/* Deepgilt per-class hero sprites. Each Gilded = a shared body + a class-specific
   head (horns/hat/hood/visor/feather/antlers) recolored by a class palette.
   Exposes window.DGART. Sample attribute builds drive DG.derived for the roster. */
(function () {
  "use strict";
  var K = '#0a0a0f', s = '#c9b27a';
  var HEAD = {
    reaver:     ["K.KKBBKK.K..", ".KBBBBBBK...", "..KBssssBK..", "..KBsKKsBK.."],
    pyre:       ["....KAK.....", "...KBBBK....", "..KBssssBK..", "..KBsKKsBK.."],
    bonewright: ["...KBBBBK...", "..KBBBBBBK..", "..KBBBBBBK..", "..KBsKKsBK.."],
    warden:     ["....KAK.....", "...KBBBBK...", "..KBBBBBBK..", "..KBKKKKBK.."],
    stalker:    ["...KBBBBKA..", "..KBBBBBBK..", "..KBssssBK..", "..KBsKKsBK.."],
    feral:      ["A.A.BB.A.A..", ".KABBBBAK...", "..KBssssBK..", "..KBsKKsBK.."]
  };
  var BODY = ["..KKBBBBKK..", "..KBAAAABK..", "..KBBBBBBK..", "..KBBBBBBK..",
              "..KBB..BBK..", "..KBB..BBK..", "..KKB..BKK..", "...KK..KK..."];
  var CLASSES = {
    reaver:     { name: 'The Barbarian',  arch: 'barbarian / fighter',   primary: 'might',   B: '#6a6a72', A: '#b0303a', attrs: { might: 50, finesse: 18, vigor: 40, wit: 12, wyrd: 14 } },
    pyre:       { name: 'The Pyre',       arch: 'sorceress / wizard',    primary: 'wit',     B: '#b3531f', A: '#e8b84b', attrs: { might: 14, finesse: 20, vigor: 28, wit: 55, wyrd: 18 } },
    bonewright: { name: 'The Bonewright', arch: 'necromancer / warlock', primary: 'wyrd',    B: '#3a3450', A: '#cfc6dd', attrs: { might: 14, finesse: 20, vigor: 30, wit: 30, wyrd: 55 } },
    warden:     { name: 'The Warden',     arch: 'paladin / cleric',      primary: 'might',   B: '#7a8a9a', A: '#e8b84b', attrs: { might: 42, finesse: 16, vigor: 42, wit: 18, wyrd: 26 } },
    stalker:    { name: 'The Stalker',    arch: 'amazon / ranger',       primary: 'finesse', B: '#4f6a3a', A: '#caa46a', attrs: { might: 20, finesse: 52, vigor: 30, wit: 16, wyrd: 16 } },
    feral:      { name: 'The Feral',      arch: 'druid / shapeshifter',  primary: 'vigor',   B: '#6a4a2a', A: '#cfc3a0', attrs: { might: 26, finesse: 24, vigor: 50, wit: 14, wyrd: 30 } }
  };
  function hexc(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  function makeSprite(rows, pal) {
    var h = rows.length, w = rows[0].length, c = document.createElement('canvas');
    c.width = w; c.height = h; var x = c.getContext('2d'), im = x.createImageData(w, h);
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
      var col = pal[rows[j][i]], o = (j * w + i) * 4;
      if (!col) { im.data[o + 3] = 0; continue; }
      var rg = hexc(col); im.data[o] = rg[0]; im.data[o + 1] = rg[1]; im.data[o + 2] = rg[2]; im.data[o + 3] = 255;
    }
    x.putImageData(im, 0, 0); return c;
  }
  var cache = {};
  function heroSprite(id) {
    if (cache[id]) return cache[id];
    var cl = CLASSES[id] || CLASSES.bonewright;
    var rows = (HEAD[id] || HEAD.bonewright).concat(BODY);
    cache[id] = makeSprite(rows, { K: K, s: s, B: cl.B, A: cl.A });
    return cache[id];
  }
  window.DGART = {
    heroSprite: heroSprite, classes: CLASSES, makeSprite: makeSprite,
    order: ['reaver', 'pyre', 'bonewright', 'warden', 'stalker', 'feral']
  };
})();
