/* board.js — 盤面・配置判定・地形の連結(Union-Find)・得点計算
 *
 * 地形ノードのキー: "x,y:featIdx"
 * 隣接タイルの一致する辺どうしを union して、都市/道が盤をまたいで連結される。
 */
(function (root) {
  'use strict';

  var Tiles = (typeof require !== 'undefined') ? require('./tiles.js') : root.Tiles;

  var DX = [0, 1, 0, -1]; // N,E,S,W の隣セル方向
  var DY = [-1, 0, 1, 0];
  // 草原のハーフ辺が隣接タイルとどう繋がるか [自分のハーフ, 相手のハーフ]
  var HALF_PAIRS = {
    0: [[0, 5], [1, 4]], // N
    1: [[2, 7], [3, 6]], // E
    2: [[4, 1], [5, 0]], // S
    3: [[6, 3], [7, 2]]  // W
  };
  function opp(d) { return (d + 2) % 4; }
  function key(x, y) { return x + ',' + y; }
  function nodeKey(x, y, idx) { return x + ',' + y + ':' + idx; }

  function Board() {
    this.tiles = {};        // "x,y" -> placed tile
    this.parent = {};       // union-find
    this.scores = {};       // player -> 点
    this.meeplesLeft = {};  // player -> 残ミープル
  }

  Board.prototype.initPlayers = function (players) {
    var self = this;
    players.forEach(function (p) { self.scores[p] = 0; self.meeplesLeft[p] = 7; });
  };

  // ---- union-find ----
  Board.prototype.find = function (k) {
    var p = this.parent;
    if (p[k] === undefined) { p[k] = k; return k; }
    var root = k;
    while (p[root] !== root) root = p[root];
    while (p[k] !== root) { var n = p[k]; p[k] = root; k = n; }
    return root;
  };
  Board.prototype.union = function (a, b) {
    var ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  };

  Board.prototype.get = function (x, y) { return this.tiles[key(x, y)] || null; };
  Board.prototype.has = function (x, y) { return !!this.tiles[key(x, y)]; };

  // 回転後の辺種別
  function edgesOf(type, rot) { return Tiles.rotateEdges(Tiles.TILE_DEFS[type].edges, rot); }

  // (x,y) に type を rot で置けるか（辺の一致＋既存タイルへの隣接）
  Board.prototype.canPlace = function (x, y, type, rot) {
    if (this.has(x, y)) return false;
    var edges = edgesOf(type, rot);
    var adjacent = false;
    for (var d = 0; d < 4; d++) {
      var nb = this.get(x + DX[d], y + DY[d]);
      if (!nb) continue;
      adjacent = true;
      if (edges[d] !== nb.edges[opp(d)]) return false;
    }
    return adjacent;
  };

  // 盤上の最初のタイル（開始タイル）を強制配置
  Board.prototype.placeStart = function (x, y, type, rot) {
    this._put(x, y, type, rot);
  };

  Board.prototype._put = function (x, y, type, rot) {
    var feats = Tiles.buildFeatures(type, rot);
    var edgeFeature = {};
    var fieldOfHalf = {};
    feats.forEach(function (f, idx) {
      f.edges.forEach(function (e) { edgeFeature[e] = idx; });
      if (f.type === 'field') f.halves.forEach(function (h) { fieldOfHalf[h] = idx; });
    });
    var tile = {
      x: x, y: y, type: type, rot: rot,
      edges: edgesOf(type, rot),
      features: feats,
      edgeFeature: edgeFeature,
      fieldOfHalf: fieldOfHalf,
      monastery: feats.some(function (f) { return f.type === 'monastery'; }),
      meeples: {} // featIdx -> player
    };
    this.tiles[key(x, y)] = tile;
    // ノード初期化
    feats.forEach(function (f, idx) { this.find(nodeKey(x, y, idx)); }, this);
    // 隣接辺で union（都市・道）
    for (var d = 0; d < 4; d++) {
      var nb = this.get(x + DX[d], y + DY[d]);
      if (!nb) continue;
      if (tile.edges[d] !== 'f') {
        var myIdx = edgeFeature[d];
        var nbIdx = nb.edgeFeature[opp(d)];
        if (myIdx !== undefined && nbIdx !== undefined) {
          this.union(nodeKey(x, y, myIdx), nodeKey(nb.x, nb.y, nbIdx));
        }
      }
      // ハーフ辺で union（草原）— 道辺でも両脇の草原は隣へ繋がる
      if (nb.fieldOfHalf) {
        HALF_PAIRS[d].forEach(function (pair) {
          var mf = fieldOfHalf[pair[0]], nf = nb.fieldOfHalf[pair[1]];
          if (mf !== undefined && nf !== undefined) {
            this.union(nodeKey(x, y, mf), nodeKey(nb.x, nb.y, nf));
          }
        }, this);
      }
    }
    return tile;
  };

  // 配置（検証あり）。成功なら tile を返す
  Board.prototype.place = function (x, y, type, rot) {
    if (!this.canPlace(x, y, type, rot)) return null;
    return this._put(x, y, type, rot);
  };

  // あるノード集合（同一地形）のメンバーを集める
  Board.prototype.membersOf = function (rootKey) {
    var members = [];
    for (var k in this.parent) {
      if (this.find(k) === rootKey) members.push(k);
    }
    return members;
  };

  function parseNode(k) {
    var i = k.indexOf(':');
    var idx = parseInt(k.slice(i + 1), 10);
    var xy = k.slice(0, i).split(',');
    return { x: parseInt(xy[0], 10), y: parseInt(xy[1], 10), idx: idx };
  }

  // 地形が完成しているか（全ての辺に隣接タイルがある）
  Board.prototype.isFeatureComplete = function (rootKey) {
    var members = this.membersOf(rootKey);
    for (var i = 0; i < members.length; i++) {
      var n = parseNode(members[i]);
      var tile = this.get(n.x, n.y);
      var f = tile.features[n.idx];
      for (var j = 0; j < f.edges.length; j++) {
        var d = f.edges[j];
        if (!this.has(n.x + DX[d], n.y + DY[d])) return false;
      }
    }
    return true;
  };

  // 地形の集計（タイル数・紋章・ミープル所有）
  Board.prototype.aggregate = function (rootKey) {
    var members = this.membersOf(rootKey);
    var tileset = {}, pennants = 0, meeples = {}, type = null;
    var meepleNodes = [];
    for (var i = 0; i < members.length; i++) {
      var n = parseNode(members[i]);
      var tile = this.get(n.x, n.y);
      var f = tile.features[n.idx];
      type = f.type;
      tileset[key(n.x, n.y)] = true;
      if (f.pennant) pennants++;
      if (tile.meeples[n.idx] !== undefined) {
        var owner = tile.meeples[n.idx];
        meeples[owner] = (meeples[owner] || 0) + 1;
        meepleNodes.push(members[i]);
      }
    }
    return {
      type: type,
      tiles: Object.keys(tileset).length,
      pennants: pennants,
      meeples: meeples,
      meepleNodes: meepleNodes
    };
  };

  // 多数のミープル所有者に得点を与え、ミープルを返却する
  Board.prototype._award = function (agg, points, log, label) {
    var owners = Object.keys(agg.meeples);
    if (owners.length > 0) {
      var max = 0;
      owners.forEach(function (o) { if (agg.meeples[o] > max) max = agg.meeples[o]; });
      var winners = owners.filter(function (o) { return agg.meeples[o] === max; });
      winners.forEach(function (w) { this.scores[w] += points; }, this);
      if (log) log.push({ label: label, points: points, winners: winners.slice() });
    }
    // ミープル返却
    agg.meepleNodes.forEach(function (nk) {
      var n = parseNode(nk);
      var tile = this.get(n.x, n.y);
      var owner = tile.meeples[n.idx];
      delete tile.meeples[n.idx];
      this.meeplesLeft[owner] += 1;
    }, this);
  };

  // 修道院の周囲8マスの埋まり数
  Board.prototype.monasteryNeighbors = function (x, y) {
    var c = 0;
    for (var dx = -1; dx <= 1; dx++)
      for (var dy = -1; dy <= 1; dy++)
        if (!(dx === 0 && dy === 0) && this.has(x + dx, y + dy)) c++;
    return c;
  };

  // タイル配置直後の完成判定＆得点（city/road は置いたタイル基準、修道院は周囲も確認）
  Board.prototype.resolveScoring = function (x, y) {
    var log = [];
    var tile = this.get(x, y);
    var seen = {};

    // 置いたタイルの都市・道
    tile.features.forEach(function (f, idx) {
      if (f.type !== 'city' && f.type !== 'road') return;
      var rk = this.find(nodeKey(x, y, idx));
      if (seen[rk]) return; seen[rk] = true;
      if (!this.isFeatureComplete(rk)) return;
      var agg = this.aggregate(rk);
      if (Object.keys(agg.meeples).length === 0) return;
      var pts = (agg.type === 'city') ? (2 * agg.tiles + 2 * agg.pennants) : agg.tiles;
      this._award(agg, pts, log, agg.type === 'city' ? '都市' : '道');
    }, this);

    // 置いたタイル＋周囲8マスの修道院
    for (var dx = -1; dx <= 1; dx++) {
      for (var dy = -1; dy <= 1; dy++) {
        var mt = this.get(x + dx, y + dy);
        if (!mt || !mt.monastery) continue;
        var mIdx = mt.features.reduce(function (acc, f, i) { return f.type === 'monastery' ? i : acc; }, -1);
        if (mIdx < 0 || mt.meeples[mIdx] === undefined) continue;
        if (this.monasteryNeighbors(mt.x, mt.y) === 8) {
          var rk = this.find(nodeKey(mt.x, mt.y, mIdx));
          var agg = this.aggregate(rk);
          this._award(agg, 9, log, '修道院');
        }
      }
    }
    return log;
  };

  // ゲーム終了時の未完成地形の得点
  Board.prototype.finalScoring = function () {
    var log = [];
    var seen = {};
    for (var k in this.tiles) {
      var tile = this.tiles[k];
      tile.features.forEach(function (f, idx) {
        if (tile.meeples[idx] === undefined) return; // ミープルがある地形のみ
        var rk = this.find(nodeKey(tile.x, tile.y, idx));
        if (seen[rk]) return; seen[rk] = true;
        var agg = this.aggregate(rk);
        if (f.type === 'monastery') {
          var pts = 1 + this.monasteryNeighbors(tile.x, tile.y);
          this._award(agg, pts, log, '修道院(未完成)');
        } else if (f.type === 'city') {
          this._award(agg, agg.tiles + agg.pennants, log, '都市(未完成)');
        } else if (f.type === 'road') {
          this._award(agg, agg.tiles, log, '道(未完成)');
        } else if (f.type === 'field') {
          var cities = this.completedCitiesByField(rk);
          this._award(agg, 3 * cities, log, '草原(農夫)');
        }
      }, this);
    }
    return log;
  };

  // 草原(field root)に接する「完成した都市」の数
  Board.prototype.completedCitiesByField = function (fieldRoot) {
    var members = this.membersOf(fieldRoot);
    var cityRoots = {};
    for (var i = 0; i < members.length; i++) {
      var n = parseNode(members[i]);
      var tile = this.get(n.x, n.y);
      var f = tile.features[n.idx];
      (f.cities || []).forEach(function (ci) {
        cityRoots[this.find(nodeKey(n.x, n.y, ci))] = true;
      }, this);
    }
    var count = 0;
    for (var cr in cityRoots) { if (this.isFeatureComplete(cr)) count++; }
    return count;
  };

  // この地形にミープルを置けるか（集合内にミープルが1つも無い）
  Board.prototype.featureClaimable = function (x, y, idx) {
    var rk = this.find(nodeKey(x, y, idx));
    var agg = this.aggregate(rk);
    return Object.keys(agg.meeples).length === 0;
  };

  // 置いたタイル上で、player が置けるミープル候補 [{idx, type, label}]
  Board.prototype.meepleOptions = function (x, y, player) {
    if (this.meeplesLeft[player] <= 0) return [];
    var tile = this.get(x, y);
    var out = [];
    tile.features.forEach(function (f, idx) {
      if (!this.featureClaimable(x, y, idx)) return;
      var label = f.type === 'city' ? '都市（騎士）' : f.type === 'road' ? '道（盗賊）' :
        f.type === 'monastery' ? '修道院（修道士）' : '草原（農夫）';
      out.push({ idx: idx, type: f.type, label: label });
    }, this);
    return out;
  };

  Board.prototype.placeMeeple = function (x, y, idx, player) {
    var tile = this.get(x, y);
    tile.meeples[idx] = player;
    this.meeplesLeft[player] -= 1;
  };

  // 指定タイプの合法手 [{x,y,rot}] を列挙
  Board.prototype.legalPlacements = function (type) {
    var cand = {};
    for (var k in this.tiles) {
      var t = this.tiles[k];
      for (var d = 0; d < 4; d++) {
        var nx = t.x + DX[d], ny = t.y + DY[d];
        if (!this.has(nx, ny)) cand[key(nx, ny)] = [nx, ny];
      }
    }
    var out = [];
    for (var ck in cand) {
      var c = cand[ck];
      for (var rot = 0; rot < 4; rot++) {
        if (this.canPlace(c[0], c[1], type, rot)) out.push({ x: c[0], y: c[1], rot: rot });
      }
    }
    return out;
  };

  Board.prototype.bounds = function () {
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (var k in this.tiles) {
      var t = this.tiles[k];
      if (t.x < minX) minX = t.x; if (t.x > maxX) maxX = t.x;
      if (t.y < minY) minY = t.y; if (t.y > maxY) maxY = t.y;
    }
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  };

  // ディープコピー（AIの先読み用）
  Board.prototype.clone = function () {
    var b = new Board();
    b.parent = JSON.parse(JSON.stringify(this.parent));
    b.scores = JSON.parse(JSON.stringify(this.scores));
    b.meeplesLeft = JSON.parse(JSON.stringify(this.meeplesLeft));
    for (var k in this.tiles) {
      var t = this.tiles[k];
      b.tiles[k] = {
        x: t.x, y: t.y, type: t.type, rot: t.rot,
        edges: t.edges.slice(),
        features: t.features.map(function (f) {
          return {
            type: f.type, edges: f.edges.slice(), pennant: f.pennant,
            halves: f.halves ? f.halves.slice() : undefined,
            cities: f.cities ? f.cities.slice() : undefined
          };
        }),
        edgeFeature: JSON.parse(JSON.stringify(t.edgeFeature)),
        fieldOfHalf: JSON.parse(JSON.stringify(t.fieldOfHalf || {})),
        monastery: t.monastery,
        meeples: JSON.parse(JSON.stringify(t.meeples))
      };
    }
    return b;
  };

  var api = { Board: Board, DX: DX, DY: DY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof window !== 'undefined' ? window : this);
