// Firebase play-count tracker
// Auto-detects game ID from URL for /games/*.html pages.
// For subfolder games, set window.FIREBASE_COUNTER_ID before loading this script.
(function () {
  'use strict';
  var _CFG = {
    apiKey: "AIzaSyCtVa1Gb6ijxe-cMX6-QwAf0WzdMdkZFns",
    authDomain: "game-access-bec65.firebaseapp.com",
    projectId: "game-access-bec65"
  };
  var _BASE = 'https://www.gstatic.com/firebasejs/9.23.0';
  var _db = null;

  function _loadScripts(srcs, cb) {
    if (!srcs.length) { cb(); return; }
    var s = document.createElement('script');
    s.src = srcs[0];
    s.onload = function () { _loadScripts(srcs.slice(1), cb); };
    s.onerror = function () { cb(); };
    document.head.appendChild(s);
  }

  function _getDb(cb) {
    if (_db) { cb(_db); return; }
    var need = [];
    if (!window.firebase) {
      need = [_BASE + '/firebase-app-compat.js', _BASE + '/firebase-firestore-compat.js'];
    } else if (!window.firebase.firestore) {
      need = [_BASE + '/firebase-firestore-compat.js'];
    }
    _loadScripts(need, function () {
      try {
        if (!firebase.apps.length) firebase.initializeApp(_CFG);
        _db = firebase.firestore();
        cb(_db);
      } catch (e) { cb(null); }
    });
  }

  // Auto-detect game ID from URL (/games/foo.html → 'foo')
  var _gid = window.FIREBASE_COUNTER_ID || (function () {
    var m = location.pathname.match(/\/games\/([^\/]+)\.html$/);
    return m ? m[1] : null;
  })();

  // Track after page load (non-blocking)
  if (_gid) {
    window.addEventListener('load', function () {
      _getDb(function (db) {
        if (!db) return;
        db.collection('counts').doc(_gid)
          .set({ count: firebase.firestore.FieldValue.increment(1) }, { merge: true })
          .catch(function () {});
      });
    });
  }

  window.FirebaseCounter = {
    loadAll: function (cb) {
      _getDb(function (db) {
        if (!db) { cb({}); return; }
        db.collection('counts').get()
          .then(function (snap) {
            var m = {};
            snap.forEach(function (d) { m[d.id] = d.data().count || 0; });
            cb(m);
          }).catch(function () { cb({}); });
      });
    }
  };
})();
