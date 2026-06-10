/* ai.js — CPUの思考。合法手を列挙し、先読みクローンで評価して最良手を選ぶ。
 *
 * 返り値: { x, y, rot, meepleIdx(or null) }
 */
(function (root) {
  'use strict';

  // 地形の「育ち具合」見込み（未完成でも置く価値を概算）
  function potentialValue(board, x, y, idx, type) {
    var rk = board.find(x + ',' + y + ':' + idx);
    var agg = board.aggregate(rk);
    if (type === 'monastery') {
      var n = board.monasteryNeighbors(x, y);
      return 1 + n + (9 - (1 + n)) * 0.5; // 完成見込みを加味
    }
    if (type === 'city') return agg.tiles * 2 + agg.pennants * 2;
    if (type === 'field') {
      // 草原は終了時のみ得点。接する都市数で将来価値を控えめに見積もる
      var feat = board.get(x, y).features[idx];
      var localCities = (feat.cities || []).length;
      return localCities * 3 * 0.5;
    }
    return agg.tiles; // road
  }

  function chooseMove(board, type, player, opts) {
    opts = opts || {};
    var difficulty = opts.difficulty || 'normal';
    var placements = board.legalPlacements(type);
    if (placements.length === 0) return null;

    if (difficulty === 'easy') {
      var pick = placements[(placements.length * pseudo(player, board)) | 0];
      pick = pick || placements[0];
      var clone0 = board.clone();
      clone0.place(pick.x, pick.y, type, pick.rot);
      var opt0 = clone0.meepleOptions(pick.x, pick.y, player);
      var m0 = (opt0.length && board.meeplesLeft[player] > 2) ? opt0[0].idx : null;
      return { x: pick.x, y: pick.y, rot: pick.rot, meepleIdx: m0 };
    }

    var best = null, bestVal = -Infinity;
    for (var i = 0; i < placements.length; i++) {
      var p = placements[i];
      var base = board.clone();
      base.place(p.x, p.y, type, p.rot);

      // ミープルを置かない場合と各候補
      var choices = [null];
      var mopts = base.meepleOptions(p.x, p.y, player);
      mopts.forEach(function (o) { choices.push(o.idx); });

      for (var c = 0; c < choices.length; c++) {
        var sim = base.clone();
        var meepleIdx = choices[c];
        var feat = sim.get(p.x, p.y).features[meepleIdx === null ? 0 : meepleIdx];
        if (meepleIdx !== null) sim.placeMeeple(p.x, p.y, meepleIdx, player);

        var before = sim.scores[player];
        var oppBefore = otherTotal(sim, player);
        var log = sim.resolveScoring(p.x, p.y);
        var myGain = sim.scores[player] - before;
        var oppGain = otherTotal(sim, player) - oppBefore;

        var val = myGain * 1.0 - oppGain * 0.6;

        if (meepleIdx !== null) {
          // 即時得点しなかった場合は将来価値とコストを見る
          var stillThere = sim.get(p.x, p.y).meeples[meepleIdx] !== undefined;
          if (stillThere) {
            var ft = sim.get(p.x, p.y).features[meepleIdx].type;
            val += potentialValue(sim, p.x, p.y, meepleIdx, ft) * 0.45;
            val -= 1.2; // ミープルを拘束するコスト
            if (board.meeplesLeft[player] <= 2) val -= 2; // 残り少なければ温存
          }
        } else {
          val += 0.3; // ミープル温存の微ボーナス
        }

        // 中央寄りを微妙に好む（盤を広げ過ぎない）
        val -= (Math.abs(p.x) + Math.abs(p.y)) * 0.01;

        if (val > bestVal) { bestVal = val; best = { x: p.x, y: p.y, rot: p.rot, meepleIdx: meepleIdx }; }
      }
    }
    return best;
  }

  // 乱数を使わない簡易擬似値（easy用、盤面とプレイヤーから決定的に）
  function pseudo(player, board) {
    var n = Object.keys(board.tiles).length;
    var s = 0; for (var i = 0; i < player.length; i++) s += player.charCodeAt(i);
    return ((n * 73 + s * 31) % 100) / 100;
  }

  function otherTotal(board, player) {
    var t = 0;
    for (var p in board.scores) if (p !== player) t += board.scores[p];
    return t;
  }

  var api = { chooseMove: chooseMove };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AI = api;
})(typeof window !== 'undefined' ? window : this);
