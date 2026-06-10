/* tiles.js — カルカソンヌ基本セットのタイル定義（農夫/草原対応）
 *
 * 辺の向き: 0=N(上) 1=E(右) 2=S(下) 3=W(左)
 * 辺の種類: 'c'=都市 'r'=道 'f'=草原
 *
 * 草原の連結用に、タイル周囲を8つの「ハーフ辺」に分割して扱う:
 *        0   1
 *      7       2
 *      6       3
 *        5   4
 *   (0,1=上辺の左右 / 2,3=右辺の上下 / 4,5=下辺の右左 / 6,7=左辺の下上)
 *
 * features:
 *   cities: [{ edges:[向き...], pennant:bool }]   連結都市は1つにまとめる
 *   roads:  [{ edges:[向き...] }]                  交差点で分かれる道は別セグメント
 *   monastery: true なら中央に修道院
 *   fields: [{ halves:[ハーフ辺...], cities:[接する都市のindex...] }]
 *           cities は def.cities 配列のインデックス（=都市featureのindex）
 */
(function (root) {
  'use strict';

  var TILE_DEFS = {
    // 修道院＋道（下）
    A: {
      edges: ['f', 'f', 'r', 'f'], monastery: true, roads: [{ edges: [2] }], count: 2,
      fields: [{ halves: [0, 1, 2, 3, 4, 5, 6, 7], cities: [] }]
    },
    // 修道院
    B: {
      edges: ['f', 'f', 'f', 'f'], monastery: true, count: 4,
      fields: [{ halves: [0, 1, 2, 3, 4, 5, 6, 7], cities: [] }]
    },
    // 4辺すべて都市（紋章あり）
    C: {
      edges: ['c', 'c', 'c', 'c'], cities: [{ edges: [0, 1, 2, 3], pennant: true }], count: 1,
      fields: []
    },
    // 都市(上)＋道が左右に直進。開始タイル
    D: {
      edges: ['c', 'r', 'f', 'r'], cities: [{ edges: [0] }], roads: [{ edges: [1, 3] }], count: 4, start: true,
      fields: [{ halves: [2, 7], cities: [0] }, { halves: [3, 4, 5, 6], cities: [] }]
    },
    // 都市が上辺のみ
    E: {
      edges: ['c', 'f', 'f', 'f'], cities: [{ edges: [0] }], count: 5,
      fields: [{ halves: [2, 3, 4, 5, 6, 7], cities: [0] }]
    },
    // 都市が左右で連結（紋章あり）
    F: {
      edges: ['f', 'c', 'f', 'c'], cities: [{ edges: [1, 3], pennant: true }], count: 2,
      fields: [{ halves: [0, 1], cities: [0] }, { halves: [4, 5], cities: [0] }]
    },
    // 都市が上下で連結
    G: {
      edges: ['c', 'f', 'c', 'f'], cities: [{ edges: [0, 2] }], count: 1,
      fields: [{ halves: [6, 7], cities: [0] }, { halves: [2, 3], cities: [0] }]
    },
    // 都市が左右にあるが非連結（別々）
    H: {
      edges: ['f', 'c', 'f', 'c'], cities: [{ edges: [1] }, { edges: [3] }], count: 3,
      fields: [{ halves: [0, 1, 4, 5], cities: [0, 1] }]
    },
    // 都市が上と右にあり非連結
    I: {
      edges: ['c', 'c', 'f', 'f'], cities: [{ edges: [0] }, { edges: [1] }], count: 2,
      fields: [{ halves: [4, 5, 6, 7], cities: [0, 1] }]
    },
    // 都市(上)＋道がカーブ(右-下)
    J: {
      edges: ['c', 'r', 'r', 'f'], cities: [{ edges: [0] }], roads: [{ edges: [1, 2] }], count: 3,
      fields: [{ halves: [3, 4], cities: [] }, { halves: [2, 5, 6, 7], cities: [0] }]
    },
    // 都市(上)＋道がカーブ(下-左)
    K: {
      edges: ['c', 'f', 'r', 'r'], cities: [{ edges: [0] }], roads: [{ edges: [2, 3] }], count: 3,
      fields: [{ halves: [5, 6], cities: [] }, { halves: [2, 3, 4, 7], cities: [0] }]
    },
    // 都市(上)＋道がT字(右・下・左)
    L: {
      edges: ['c', 'r', 'r', 'r'], cities: [{ edges: [0] }], roads: [{ edges: [1] }, { edges: [2] }, { edges: [3] }], count: 3,
      fields: [{ halves: [2], cities: [0] }, { halves: [7], cities: [0] }, { halves: [3, 4], cities: [] }, { halves: [5, 6], cities: [] }]
    },
    // 都市が上と左で連結（紋章あり）
    M: {
      edges: ['c', 'f', 'f', 'c'], cities: [{ edges: [0, 3], pennant: true }], count: 2,
      fields: [{ halves: [2, 3, 4, 5], cities: [0] }]
    },
    // 都市が上と左で連結
    N: {
      edges: ['c', 'f', 'f', 'c'], cities: [{ edges: [0, 3] }], count: 3,
      fields: [{ halves: [2, 3, 4, 5], cities: [0] }]
    },
    // 都市(上+左で連結)＋道カーブ(右-下)（紋章あり）
    O: {
      edges: ['c', 'r', 'r', 'c'], cities: [{ edges: [0, 3], pennant: true }], roads: [{ edges: [1, 2] }], count: 2,
      fields: [{ halves: [3, 4], cities: [] }, { halves: [2, 5], cities: [0] }]
    },
    // 都市(上+左で連結)＋道カーブ(右-下)
    P: {
      edges: ['c', 'r', 'r', 'c'], cities: [{ edges: [0, 3] }], roads: [{ edges: [1, 2] }], count: 3,
      fields: [{ halves: [3, 4], cities: [] }, { halves: [2, 5], cities: [0] }]
    },
    // 都市が3辺(上右左)連結（紋章あり）
    Q: {
      edges: ['c', 'c', 'f', 'c'], cities: [{ edges: [0, 1, 3], pennant: true }], count: 1,
      fields: [{ halves: [4, 5], cities: [0] }]
    },
    // 都市が3辺(上右左)連結
    R: {
      edges: ['c', 'c', 'f', 'c'], cities: [{ edges: [0, 1, 3] }], count: 3,
      fields: [{ halves: [4, 5], cities: [0] }]
    },
    // 都市3辺(上右左)＋道(下)（紋章あり）
    S: {
      edges: ['c', 'c', 'r', 'c'], cities: [{ edges: [0, 1, 3], pennant: true }], roads: [{ edges: [2] }], count: 2,
      fields: [{ halves: [4], cities: [0] }, { halves: [5], cities: [0] }]
    },
    // 都市3辺(上右左)＋道(下)
    T: {
      edges: ['c', 'c', 'r', 'c'], cities: [{ edges: [0, 1, 3] }], roads: [{ edges: [2] }], count: 1,
      fields: [{ halves: [4], cities: [0] }, { halves: [5], cities: [0] }]
    },
    // 道が直進(上-下)
    U: {
      edges: ['r', 'f', 'r', 'f'], roads: [{ edges: [0, 2] }], count: 8,
      fields: [{ halves: [0, 5, 6, 7], cities: [] }, { halves: [1, 2, 3, 4], cities: [] }]
    },
    // 道がカーブ(下-左)
    V: {
      edges: ['f', 'f', 'r', 'r'], roads: [{ edges: [2, 3] }], count: 9,
      fields: [{ halves: [5, 6], cities: [] }, { halves: [0, 1, 2, 3, 4, 7], cities: [] }]
    },
    // 道がT字(右・下・左)
    W: {
      edges: ['f', 'r', 'r', 'r'], roads: [{ edges: [1] }, { edges: [2] }, { edges: [3] }], count: 4,
      fields: [{ halves: [0, 1, 2, 7], cities: [] }, { halves: [3, 4], cities: [] }, { halves: [5, 6], cities: [] }]
    },
    // 道が十字(4方向)
    X: {
      edges: ['r', 'r', 'r', 'r'], roads: [{ edges: [0] }, { edges: [1] }, { edges: [2] }, { edges: [3] }], count: 1,
      fields: [{ halves: [1, 2], cities: [] }, { halves: [3, 4], cities: [] }, { halves: [5, 6], cities: [] }, { halves: [0, 7], cities: [] }]
    }
  };

  // 向き e を時計回りに rot(0..3) 回転
  function rotDir(e, rot) { return (e + rot) % 4; }
  // ハーフ辺 h を時計回りに rot 回転（1回転=2ハーフ分）
  function rotHalf(h, rot) { return (h + 2 * rot) % 8; }

  // 辺配列を rot 回転
  function rotateEdges(edges, rot) {
    var out = [0, 0, 0, 0];
    for (var d = 0; d < 4; d++) out[(d + rot) % 4] = edges[d];
    return out;
  }

  // 回転後の features（描画順: cities -> roads -> monastery -> fields）
  function buildFeatures(type, rot) {
    var def = TILE_DEFS[type];
    var feats = [];
    (def.cities || []).forEach(function (c) {
      feats.push({ type: 'city', edges: c.edges.map(function (e) { return rotDir(e, rot); }), pennant: !!c.pennant });
    });
    (def.roads || []).forEach(function (r) {
      feats.push({ type: 'road', edges: r.edges.map(function (e) { return rotDir(e, rot); }) });
    });
    if (def.monastery) feats.push({ type: 'monastery', edges: [] });
    (def.fields || []).forEach(function (fl) {
      feats.push({
        type: 'field', edges: [],
        halves: fl.halves.map(function (h) { return rotHalf(h, rot); }),
        cities: fl.cities.slice()
      });
    });
    return feats;
  }

  function buildDeck() {
    var deck = [];
    Object.keys(TILE_DEFS).forEach(function (type) {
      var def = TILE_DEFS[type];
      var n = def.count;
      if (def.start) n -= 1;
      for (var i = 0; i < n; i++) deck.push(type);
    });
    return deck;
  }

  function startTileType() {
    var t = Object.keys(TILE_DEFS).filter(function (k) { return TILE_DEFS[k].start; });
    return t[0];
  }

  var api = {
    TILE_DEFS: TILE_DEFS,
    rotDir: rotDir,
    rotHalf: rotHalf,
    rotateEdges: rotateEdges,
    buildFeatures: buildFeatures,
    buildDeck: buildDeck,
    startTileType: startTileType
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Tiles = api;
})(typeof window !== 'undefined' ? window : this);
