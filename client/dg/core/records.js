// Deepgilt — core/Records : the RecordManager. Loads + holds the game's data tables
// (affixes, monsters, geaswords, the active class's skills) from data/*.json and exposes
// typed accessors. Replaces the ad-hoc fetch-Promise that used to live in index.html.
// Clean-room; OD2's d2records is reference only (its tables come from Blizzard's MPQ — ours are our own JSON).
(function () {
  var Records = {
    affixes: null, monsters: null, geaswords: null, skills: null, classid: null,
    load: function (classid) {
      var self = this; this.classid = classid;
      var files = ['affixes.json', 'monsters.json', 'geaswords.json', 'skills/' + classid + '.json'];
      return Promise.all(files.map(function (u) { return fetch('../data/' + u, { cache: 'no-store' }).then(function (r) { return r.json(); }); }))
        .then(function (res) {
          self.affixes = res[0]; self.monsters = res[1];
          self.geaswords = (res[2] || {}).geaswords; self.skills = res[3];
          return self;
        });
    },
    monster: function (id) { return (this.monsters.monsters || []).filter(function (m) { return m.id === id; })[0]; }
  };
  (window.DGC = window.DGC || {}).Records = Records;
})();
