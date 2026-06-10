// ai.js - CPU の思考（牌効率ベースの簡易AI）

const AI = (() => {

  // 通常形シャンテン数（seedMentsu = 既に確定している面子数＝副露数）
  function stdShantenSeed(counts0, seedMentsu) {
    const counts = counts0.slice();
    let best = 8;
    function rec(pos, mentsu, taatsu, pair) {
      while (pos < 34 && counts[pos] === 0) pos++;
      if (pos === 34) {
        let t = taatsu;
        if (mentsu + t > 4) t = 4 - mentsu;
        const sh = 8 - 2 * mentsu - t - (pair ? 1 : 0);
        if (sh < best) best = sh;
        return;
      }
      // 刻子
      if (counts[pos] >= 3) { counts[pos] -= 3; rec(pos, mentsu + 1, taatsu, pair); counts[pos] += 3; }
      // 順子
      if (pos < 27 && pos % 9 <= 6 && counts[pos + 1] > 0 && counts[pos + 2] > 0) {
        counts[pos]--; counts[pos + 1]--; counts[pos + 2]--;
        rec(pos, mentsu + 1, taatsu, pair);
        counts[pos]++; counts[pos + 1]++; counts[pos + 2]++;
      }
      // 対子
      if (counts[pos] >= 2) {
        if (!pair) { counts[pos] -= 2; rec(pos, mentsu, taatsu, true); counts[pos] += 2; }
        counts[pos] -= 2; rec(pos, mentsu, taatsu + 1, pair); counts[pos] += 2;
      }
      // 塔子（両面/嵌張）
      if (pos < 27) {
        const r = pos % 9;
        if (r <= 7 && counts[pos + 1] > 0) {
          counts[pos]--; counts[pos + 1]--; rec(pos, mentsu, taatsu + 1, pair); counts[pos]++; counts[pos + 1]++;
        }
        if (r <= 6 && counts[pos + 2] > 0) {
          counts[pos]--; counts[pos + 2]--; rec(pos, mentsu, taatsu + 1, pair); counts[pos]++; counts[pos + 2]++;
        }
      }
      // 浮き牌として捨てる
      counts[pos]--; rec(pos, mentsu, taatsu, pair); counts[pos]++;
    }
    rec(0, seedMentsu || 0, 0, false);
    return best;
  }
  function stdShanten(counts0) { return stdShantenSeed(counts0, 0); }
  // 副露ありシャンテン（meldCount 個の面子は確定）
  function shantenWithMelds(counts, meldCount) { return stdShantenSeed(counts, meldCount); }

  function chiitoiShanten(counts) {
    let pairs = 0, kinds = 0;
    for (let i = 0; i < 34; i++) {
      if (counts[i] >= 1) kinds++;
      if (counts[i] >= 2) pairs++;
    }
    return 6 - pairs + Math.max(0, 7 - kinds);
  }

  function kokushiShanten(counts) {
    const yaochu = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
    let kinds = 0, pair = 0;
    for (const t of yaochu) { if (counts[t] >= 1) kinds++; if (counts[t] >= 2) pair = 1; }
    return 13 - kinds - pair;
  }

  function shanten(counts) {
    return Math.min(stdShanten(counts), chiitoiShanten(counts), kokushiShanten(counts));
  }

  // 受け入れ枚数（種類×残り枚数は無視、種類数で近似）
  function ukeire(tiles13) {
    const counts = Tiles.toCounts(tiles13);
    const base = shanten(counts);
    let n = 0;
    for (let t = 0; t < 34; t++) {
      if (counts[t] >= 4) continue;
      counts[t]++;
      if (shanten(counts) < base) n++;
      counts[t]--;
    }
    return n;
  }

  // 強さレベル(1〜5)。mistake=最善でなく適当に切る確率、riichi=テンパイ時にリーチする確率
  const LEVELS = {
    1: { mistake: 0.70, riichi: 0.45 },
    2: { mistake: 0.45, riichi: 0.65 },
    3: { mistake: 0.25, riichi: 0.85 },
    4: { mistake: 0.10, riichi: 1.00 },
    5: { mistake: 0.00, riichi: 1.00 }
  };
  function levelParams(level) { return LEVELS[level] || LEVELS[5]; }
  function riichiProb(level) { return levelParams(level).riichi; }

  // 14枚から打牌を選ぶ。返り値: { discard, shanten }
  function chooseDiscard(tiles14, level = 5) {
    const uniq = [...new Set(tiles14)];
    let cands = [];
    for (const t of uniq) {
      const rest = tiles14.slice();
      rest.splice(rest.indexOf(t), 1);
      const sh = shanten(Tiles.toCounts(rest));
      cands.push({ t, sh, rest });
    }
    const minSh = Math.min(...cands.map(c => c.sh));

    // 弱いレベルは一定確率で最善を外す
    if (Math.random() < levelParams(level).mistake) {
      const c = cands[Math.floor(Math.random() * cands.length)];
      return { discard: c.t, shanten: c.sh };
    }

    cands = cands.filter(c => c.sh === minSh);
    for (const c of cands) c.uke = ukeire(c.rest);
    const maxUke = Math.max(...cands.map(c => c.uke));
    cands = cands.filter(c => c.uke === maxUke);
    cands.sort((a, b) => yaochuRank(b.t) - yaochuRank(a.t));
    return { discard: cands[0].t, shanten: minSh };
  }

  function yaochuRank(t) {
    if (Tiles.isHonor(t)) return 3;
    if (Tiles.isTerminal(t)) return 2;
    if (Tiles.numOf(t) === 2 || Tiles.numOf(t) === 8) return 1;
    return 0;
  }

  return { shanten, shantenWithMelds, chooseDiscard, ukeire, riichiProb, levelParams };
})();
