// agari.js - 和了形の判定・分解、テンパイ/待ち計算
// 門前手（鳴きなし）専用の v1 実装

const Agari = (() => {

  // counts(length34) が「すべて面子(刻子/順子)」に分解できるか（牌が残っていない前提）
  function canAllMelds(counts) {
    let i = -1;
    for (let k = 0; k < 34; k++) if (counts[k] > 0) { i = k; break; }
    if (i === -1) return true;

    // 刻子
    if (counts[i] >= 3) {
      counts[i] -= 3;
      if (canAllMelds(counts)) { counts[i] += 3; return true; }
      counts[i] += 3;
    }
    // 順子（数牌のみ、i,i+1,i+2が同じ色内）
    if (i < 27) {
      const r = i % 9;
      if (r <= 6 && counts[i + 1] > 0 && counts[i + 2] > 0) {
        counts[i]--; counts[i + 1]--; counts[i + 2]--;
        if (canAllMelds(counts)) { counts[i]++; counts[i + 1]++; counts[i + 2]++; return true; }
        counts[i]++; counts[i + 1]++; counts[i + 2]++;
      }
    }
    return false;
  }

  // 通常形の和了判定（14枚）
  function isStandard(counts) {
    for (let p = 0; p < 34; p++) {
      if (counts[p] >= 2) {
        counts[p] -= 2;
        const ok = canAllMelds(counts);
        counts[p] += 2;
        if (ok) return true;
      }
    }
    return false;
  }

  // 七対子
  function isChiitoitsu(counts) {
    let pairs = 0;
    for (let i = 0; i < 34; i++) {
      if (counts[i] === 2) pairs++;
      else if (counts[i] !== 0) return false;
    }
    return pairs === 7;
  }

  // 国士無双
  function isKokushi(counts) {
    const yaochu = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
    let pair = false, kinds = 0;
    for (let i = 0; i < 34; i++) {
      if (counts[i] === 0) continue;
      if (!yaochu.includes(i)) return false;
      kinds++;
      if (counts[i] === 2) pair = true;
      else if (counts[i] !== 1) return false;
    }
    return kinds === 13 && pair;
  }

  function isAgari(counts) {
    return isStandard(counts) || isChiitoitsu(counts) || isKokushi(counts);
  }

  // 副露(鳴き)がある手の和了判定。
  // counts は手の内(concealed, 和了牌込み) = 3*(4-meldCount)+2 枚。
  function isAgariWithMelds(counts, meldCount) {
    if (meldCount === 0) return isAgari(counts);
    return isStandard(counts); // 鳴きありは通常形のみ（七対子・国士は門前限定）
  }

  function waitsWithMelds(concealedTiles, meldCount) {
    const counts = Tiles.toCounts(concealedTiles);
    const res = [];
    for (let t = 0; t < 34; t++) {
      if (counts[t] >= 4) continue;
      counts[t]++;
      if (isAgariWithMelds(counts, meldCount)) res.push(t);
      counts[t]--;
    }
    return res;
  }
  function isTenpaiWithMelds(concealedTiles, meldCount) {
    return waitsWithMelds(concealedTiles, meldCount).length > 0;
  }

  // 14枚の通常形分解をすべて列挙
  // 返り値: [{pair, melds:[{type:'pon'|'chi', t}]}], t は順子なら先頭牌
  function decompose(counts) {
    const results = [];
    for (let p = 0; p < 34; p++) {
      if (counts[p] >= 2) {
        counts[p] -= 2;
        const melds = [];
        enumMelds(counts, melds, results, p);
        counts[p] += 2;
      }
    }
    return results;
  }

  function enumMelds(counts, melds, results, pair) {
    let i = -1;
    for (let k = 0; k < 34; k++) if (counts[k] > 0) { i = k; break; }
    if (i === -1) {
      results.push({ pair, melds: melds.map(m => ({ ...m })) });
      return;
    }
    // 刻子
    if (counts[i] >= 3) {
      counts[i] -= 3;
      melds.push({ type: 'pon', t: i });
      enumMelds(counts, melds, results, pair);
      melds.pop();
      counts[i] += 3;
    }
    // 順子
    if (i < 27) {
      const r = i % 9;
      if (r <= 6 && counts[i + 1] > 0 && counts[i + 2] > 0) {
        counts[i]--; counts[i + 1]--; counts[i + 2]--;
        melds.push({ type: 'chi', t: i });
        enumMelds(counts, melds, results, pair);
        melds.pop();
        counts[i]++; counts[i + 1]++; counts[i + 2]++;
      }
    }
  }

  // 13枚の手牌(tiles配列)からテンパイの待ち牌一覧を返す
  function waits(tiles13) {
    const counts = Tiles.toCounts(tiles13);
    const res = [];
    for (let t = 0; t < 34; t++) {
      if (counts[t] >= 4) continue;
      counts[t]++;
      if (isAgari(counts)) res.push(t);
      counts[t]--;
    }
    return res;
  }

  function isTenpai(tiles13) {
    return waits(tiles13).length > 0;
  }

  return {
    isStandard, isChiitoitsu, isKokushi, isAgari, decompose, waits, isTenpai, canAllMelds,
    isAgariWithMelds, waitsWithMelds, isTenpaiWithMelds
  };
})();
