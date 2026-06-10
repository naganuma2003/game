// score.js - 役判定・符・翻・点数計算（門前 + 鳴き対応）

const Score = (() => {

  const GREEN = [19, 20, 21, 23, 25, 32]; // 2s3s4s6s8s 發 (緑一色)

  // ctx: { winTile, isTsumo, isRiichi, isDoubleRiichi, isIppatsu,
  //        roundWind, seatWind, dora:[ind], ura:[ind], aka:0,
  //        isHaitei, isHoutei, isRinshan, isChankan, dealer,
  //        melds:[{kind:'chi'|'pon', t, open, isKan}] }  // 副露（鳴き）
  // concealed: 手の内(和了牌込み)。length = 3*(4-melds.length)+2
  function evaluate(concealed, ctx) {
    const melds = ctx.melds || [];
    const menzen = melds.every(m => !m.open);
    const counts = Tiles.toCounts(concealed);
    let best = null;

    if (melds.length === 0) {
      // 国士無双
      if (Agari.isKokushi(counts)) {
        const dbl = counts[ctx.winTile] === 2;
        best = pickBest(best, makeYakuman(dbl ? 2 : 1,
          [{ name: dbl ? '国士無双十三面' : '国士無双', han: dbl ? 26 : 13 }], ctx));
      }
      // 七対子
      if (Agari.isChiitoitsu(counts)) best = pickBest(best, scoreChiitoi(counts, concealed, ctx, menzen));
    }

    // 通常形
    if (Agari.isStandard(counts)) {
      const decomps = Agari.decompose(counts);
      for (const d of decomps) {
        const r = scoreStandard(d, concealed, ctx, melds, menzen);
        if (r) best = pickBest(best, r);
      }
    }
    return best;
  }

  function pickBest(a, b) {
    if (!a) return b;
    if (!b) return a;
    if (b.yakuman !== a.yakuman) return b.yakuman > a.yakuman ? b : a;
    return b.total > a.total ? b : a;
  }

  // 全牌(手の内+副露)の種類カウント
  function fullCounts(concealed, melds) {
    const c = Tiles.toCounts(concealed);
    for (const m of melds) {
      if (m.kind === 'chi') { c[m.t]++; c[m.t + 1]++; c[m.t + 2]++; }
      else c[m.t] += 3;
    }
    return c;
  }

  // ---------- 七対子 ----------
  function scoreChiitoi(counts, concealed, ctx, menzen) {
    const yaku = [];
    addCommonYaku(yaku, ctx, menzen);
    yaku.push({ name: '七対子', han: 2 });
    addFlushYaku(yaku, counts, menzen);
    if (allTanyao(counts)) yaku.push({ name: '断么九', han: 1 });
    if (allHonors(counts)) return makeYakuman(1, [{ name: '字一色', han: 13 }], ctx);
    if (allYaochu(counts)) yaku.push({ name: '混老頭', han: 2 });

    let han = sumHan(yaku);
    if (han === 0) return null;
    const dora = countDora(concealed, [], ctx, menzen);
    han += dora.han;
    return finalize(han, 25, yaku.concat(dora.list), ctx);
  }

  // ---------- 通常形 ----------
  function scoreStandard(decomp, concealed, ctx, calledMelds, menzen) {
    // 待ちの帰属（和了牌は手の内側にある）
    const attrs = [];
    if (decomp.pair === ctx.winTile) attrs.push({ kind: 'pair' });
    decomp.melds.forEach((m, idx) => {
      if (m.type === 'pon' && m.t === ctx.winTile) attrs.push({ kind: 'pon', idx });
      if (m.type === 'chi' && ctx.winTile >= m.t && ctx.winTile <= m.t + 2)
        attrs.push({ kind: 'chi', idx, pos: ctx.winTile - m.t });
    });
    if (attrs.length === 0) return null;

    let best = null;
    for (const at of attrs) {
      const r = evalStandard(decomp, concealed, ctx, calledMelds, menzen, at);
      if (r) best = pickBest(best, r);
    }
    return best;
  }

  function evalStandard(decomp, concealed, ctx, calledMelds, menzen, at) {
    const pair = decomp.pair;
    // 全面子リスト（副露 + 手の内）
    const concealedMelds = decomp.melds.map((m, idx) => ({
      kind: m.type, t: m.t, open: false, isKan: false, concealed: true, idx
    }));
    const called = calledMelds.map(m => ({
      kind: m.kind, t: m.t, open: m.open, isKan: !!m.isKan, concealed: !m.open, idx: -1
    }));
    const melds = called.concat(concealedMelds);

    const counts = fullCounts(concealed, calledMelds);

    // 役満
    const ym = checkYakuman(melds, pair, counts, ctx, menzen, at);
    if (ym) return ym;

    const yaku = [];
    addCommonYaku(yaku, ctx, menzen);

    // 待ち種別
    let waitType = 'ryanmen';
    if (at.kind === 'pair') waitType = 'tanki';
    else if (at.kind === 'pon') waitType = 'shanpon';
    else if (at.kind === 'chi') {
      const base = decomp.melds[at.idx].t;
      if (at.pos === 1) waitType = 'kanchan';
      else if ((at.pos === 2 && Tiles.numOf(base) === 1) ||
               (at.pos === 0 && Tiles.numOf(base) === 7)) waitType = 'penchan';
      else waitType = 'ryanmen';
    }

    const chis = melds.filter(m => m.kind === 'chi');
    const pons = melds.filter(m => m.kind === 'pon');

    // 平和（門前のみ）
    const pairYakuhai = isYakuhaiTile(pair, ctx);
    const pinfu = menzen && chis.length === 4 && !pairYakuhai && waitType === 'ryanmen';
    if (pinfu) yaku.push({ name: '平和', han: 1 });

    if (allTanyao(counts)) yaku.push({ name: '断么九', han: 1 });

    // 役牌
    for (const m of pons) {
      if (Tiles.isDragon(m.t)) yaku.push({ name: '役牌 ' + Tiles.name(m.t), han: 1 });
      else if (m.t === ctx.roundWind) yaku.push({ name: '場風 ' + Tiles.name(m.t), han: 1 });
      else if (m.t === ctx.seatWind) yaku.push({ name: '自風 ' + Tiles.name(m.t), han: 1 });
    }

    // 一盃口 / 二盃口（門前のみ）
    if (menzen) {
      const peikou = countPeikou(chis);
      if (peikou === 2) yaku.push({ name: '二盃口', han: 3 });
      else if (peikou === 1) yaku.push({ name: '一盃口', han: 1 });
    }

    if (sanshokuDoujun(chis)) yaku.push({ name: '三色同順', han: menzen ? 2 : 1 });
    if (sanshokuDoukou(pons)) yaku.push({ name: '三色同刻', han: 2 });
    if (ittsu(chis)) yaku.push({ name: '一気通貫', han: menzen ? 2 : 1 });

    const chanta = chantaType(melds, pair);
    if (chanta === 'junchan') yaku.push({ name: '純全帯么九', han: menzen ? 3 : 2 });
    else if (chanta === 'chanta') yaku.push({ name: '混全帯么九', han: menzen ? 2 : 1 });

    if (pons.length === 4) yaku.push({ name: '対々和', han: 2 });

    const ankou = countAnkou(melds, ctx, at);
    if (ankou === 3) yaku.push({ name: '三暗刻', han: 2 });

    if (allYaochu(counts) && pons.length === 4) yaku.push({ name: '混老頭', han: 2 });
    if (shousangen(pons, pair)) yaku.push({ name: '小三元', han: 2 });

    addFlushYaku(yaku, counts, menzen);

    let han = sumHan(yaku);
    if (han === 0) return null;

    const dora = countDora(concealed, calledMelds, ctx, menzen);
    han += dora.han;

    const fu = calcFu(melds, ctx, at, waitType, pinfu, pair, menzen);
    return finalize(han, fu, yaku.concat(dora.list), ctx);
  }

  // ---------- 役満 ----------
  function checkYakuman(melds, pair, counts, ctx, menzen, at) {
    const pons = melds.filter(m => m.kind === 'pon');
    const list = [];
    let mult = 0;

    const ankou = countAnkou(melds, ctx, at);
    if (pons.length === 4 && ankou === 4) {
      const tanki = at.kind === 'pair';
      list.push({ name: tanki ? '四暗刻単騎' : '四暗刻', han: tanki ? 26 : 13 });
      mult += tanki ? 2 : 1;
    }
    const dragonPons = pons.filter(m => Tiles.isDragon(m.t)).length;
    if (dragonPons === 3) { list.push({ name: '大三元', han: 13 }); mult += 1; }
    const windPons = pons.filter(m => Tiles.isWind(m.t)).length;
    if (windPons === 4) { list.push({ name: '大四喜', han: 26 }); mult += 2; }
    else if (windPons === 3 && Tiles.isWind(pair)) { list.push({ name: '小四喜', han: 13 }); mult += 1; }
    if (allHonors(counts)) { list.push({ name: '字一色', han: 13 }); mult += 1; }
    if (allTerminalsOnly(counts)) { list.push({ name: '清老頭', han: 13 }); mult += 1; }
    if (allGreen(counts)) { list.push({ name: '緑一色', han: 13 }); mult += 1; }
    if (menzen && isChuuren(counts)) { list.push({ name: '九蓮宝燈', han: 13 }); mult += 1; }

    if (mult === 0) return null;
    return makeYakuman(mult, list, ctx);
  }

  function makeYakuman(mult, list, ctx) {
    const base = 8000 * mult;
    const pay = payments(base, ctx.dealer, ctx.isTsumo);
    return {
      yakuman: mult, han: 13 * mult, fu: 0, yaku: list,
      total: pay.total, tsumoDealer: pay.tsumoDealer, tsumoNon: pay.tsumoNon,
      limitName: mult === 1 ? '役満' : mult + '倍役満'
    };
  }

  // ---------- 共通役 ----------
  function addCommonYaku(yaku, ctx, menzen) {
    if (menzen && ctx.isDoubleRiichi) yaku.push({ name: 'ダブル立直', han: 2 });
    else if (menzen && ctx.isRiichi) yaku.push({ name: '立直', han: 1 });
    if (menzen && ctx.isIppatsu) yaku.push({ name: '一発', han: 1 });
    if (menzen && ctx.isTsumo) yaku.push({ name: '門前清自摸和', han: 1 });
    if (ctx.isHaitei) yaku.push({ name: '海底摸月', han: 1 });
    if (ctx.isHoutei) yaku.push({ name: '河底撈魚', han: 1 });
    if (ctx.isRinshan) yaku.push({ name: '嶺上開花', han: 1 });
    if (ctx.isChankan) yaku.push({ name: '槍槓', han: 1 });
  }

  function addFlushYaku(yaku, counts, menzen) {
    const suits = new Set();
    let honor = false;
    for (let i = 0; i < 34; i++) {
      if (counts[i] === 0) continue;
      if (i < 27) suits.add(Math.floor(i / 9)); else honor = true;
    }
    if (suits.size === 1 && !honor) yaku.push({ name: '清一色', han: menzen ? 6 : 5 });
    else if (suits.size === 1 && honor) yaku.push({ name: '混一色', han: menzen ? 3 : 2 });
  }

  // ---------- ヘルパー ----------
  function isYakuhaiTile(t, ctx) {
    return Tiles.isDragon(t) || t === ctx.roundWind || t === ctx.seatWind;
  }
  function allTanyao(counts) {
    for (let i = 0; i < 34; i++) if (counts[i] > 0 && Tiles.isYaochu(i)) return false;
    return true;
  }
  function allYaochu(counts) {
    for (let i = 0; i < 34; i++) if (counts[i] > 0 && !Tiles.isYaochu(i)) return false;
    return true;
  }
  function allTerminalsOnly(counts) {
    for (let i = 0; i < 34; i++) if (counts[i] > 0 && !Tiles.isTerminal(i)) return false;
    return true;
  }
  function allHonors(counts) {
    for (let i = 0; i < 27; i++) if (counts[i] > 0) return false;
    return true;
  }
  function allGreen(counts) {
    for (let i = 0; i < 34; i++) if (counts[i] > 0 && !GREEN.includes(i)) return false;
    return true;
  }
  function isChuuren(counts) {
    let suit = -1;
    for (let i = 0; i < 27; i++) if (counts[i] > 0) { suit = Math.floor(i / 9); break; }
    if (suit === -1) return false;
    for (let i = 0; i < 34; i++) if (counts[i] > 0 && (i < suit * 9 || i >= suit * 9 + 9)) return false;
    const base = suit * 9;
    const need = [3, 1, 1, 1, 1, 1, 1, 1, 3];
    let extra = 0;
    for (let k = 0; k < 9; k++) {
      const e = counts[base + k] - need[k];
      if (e < 0) return false;
      extra += e;
    }
    return extra === 1;
  }
  function countPeikou(chis) {
    const map = {};
    for (const c of chis) map[c.t] = (map[c.t] || 0) + 1;
    let pairs = 0;
    for (const k in map) pairs += Math.floor(map[k] / 2);
    return pairs;
  }
  function sanshokuDoujun(chis) {
    const byNum = {};
    for (const c of chis) {
      const n = Tiles.numOf(c.t), s = Tiles.suitOf(c.t);
      (byNum[n] = byNum[n] || new Set()).add(s);
    }
    for (const n in byNum) if (byNum[n].size === 3) return true;
    return false;
  }
  function sanshokuDoukou(pons) {
    const byNum = {};
    for (const p of pons) {
      if (p.t >= 27) continue;
      const n = Tiles.numOf(p.t), s = Tiles.suitOf(p.t);
      (byNum[n] = byNum[n] || new Set()).add(s);
    }
    for (const n in byNum) if (byNum[n].size === 3) return true;
    return false;
  }
  function ittsu(chis) {
    for (let s = 0; s < 3; s++) {
      const base = s * 9;
      const has = x => chis.some(c => c.t === x);
      if (has(base) && has(base + 3) && has(base + 6)) return true;
    }
    return false;
  }
  function chantaType(melds, pair) {
    let hasChi = false, allTerminal = true;
    const sets = melds.map(m => m.kind === 'chi'
      ? [m.t, m.t + 1, m.t + 2] : [m.t, m.t, m.t]);
    sets.push([pair, pair]);
    for (const m of melds) if (m.kind === 'chi') hasChi = true;
    for (const set of sets) {
      if (!set.some(t => Tiles.isYaochu(t))) return null;
      if (set.some(t => Tiles.isHonor(t))) allTerminal = false;
    }
    if (!hasChi) return null;
    return allTerminal ? 'junchan' : 'chanta';
  }
  // ロンで完成した手の内の刻子は明刻扱い → 暗刻に数えない
  function isRonCompleted(meld, ctx, at) {
    return !ctx.isTsumo && meld.concealed && !meld.isKan
      && at.kind === 'pon' && at.idx === meld.idx;
  }
  function countAnkou(melds, ctx, at) {
    let n = 0;
    for (const m of melds) {
      if (m.kind !== 'pon') continue;
      if (m.open) continue;                 // 明刻・明槓
      if (isRonCompleted(m, ctx, at)) continue;
      n++;                                  // 暗刻・暗槓
    }
    return n;
  }
  function shousangen(pons, pair) {
    return pons.filter(m => Tiles.isDragon(m.t)).length === 2 && Tiles.isDragon(pair);
  }

  // ---------- ドラ ----------
  function countDora(concealed, calledMelds, ctx, menzen) {
    const tiles = concealed.slice();
    for (const m of calledMelds) {
      if (m.kind === 'chi') tiles.push(m.t, m.t + 1, m.t + 2);
      else { const n = m.isKan ? 4 : 3; for (let k = 0; k < n; k++) tiles.push(m.t); }
    }
    let han = 0; const list = [];
    let d = 0;
    for (const t of tiles) for (const dt of ctx.dora) if (t === dt) d++;
    if (d > 0) { han += d; list.push({ name: 'ドラ', han: d }); }
    if (menzen && (ctx.isRiichi || ctx.isDoubleRiichi)) {
      let u = 0;
      for (const t of tiles) for (const dt of ctx.ura) if (t === dt) u++;
      if (u > 0) { han += u; list.push({ name: '裏ドラ', han: u }); }
    }
    if (ctx.aka > 0) { han += ctx.aka; list.push({ name: '赤ドラ', han: ctx.aka }); }
    return { han, list };
  }

  // ---------- 符 ----------
  function calcFu(melds, ctx, at, waitType, pinfu, pair, menzen) {
    if (pinfu) return ctx.isTsumo ? 20 : 30;
    let fu = 20;
    if (menzen && !ctx.isTsumo) fu += 10; // 門前ロン
    if (ctx.isTsumo) fu += 2;             // ツモ符
    if (waitType === 'kanchan' || waitType === 'penchan' || waitType === 'tanki') fu += 2;
    if (Tiles.isDragon(pair)) fu += 2;
    if (pair === ctx.roundWind) fu += 2;
    if (pair === ctx.seatWind) fu += 2;
    for (const m of melds) {
      if (m.kind !== 'pon') continue;
      const yao = Tiles.isYaochu(m.t);
      if (m.isKan) {
        if (m.open) fu += yao ? 16 : 8;     // 明槓
        else fu += yao ? 32 : 16;           // 暗槓
      } else if (m.open || isRonCompleted(m, ctx, at)) {
        fu += yao ? 4 : 2;                  // 明刻
      } else {
        fu += yao ? 8 : 4;                  // 暗刻
      }
    }
    fu = Math.ceil(fu / 10) * 10;
    if (!menzen && fu === 20) fu = 30;      // 喰い平和形は30符
    return fu;
  }

  // ---------- 点数 ----------
  function finalize(han, fu, yaku, ctx) {
    let base, mangan = false;
    if (han >= 13) base = 8000;
    else if (han >= 11) base = 6000;
    else if (han >= 8) base = 4000;
    else if (han >= 6) base = 3000;
    else if (han >= 5) base = 2000;
    else {
      base = fu * Math.pow(2, 2 + han);
      if (base > 2000) { base = 2000; mangan = true; }
    }
    const pay = payments(base, ctx.dealer, ctx.isTsumo);
    return {
      yakuman: 0, han, fu, yaku,
      total: pay.total, tsumoDealer: pay.tsumoDealer, tsumoNon: pay.tsumoNon,
      limitName: limitName(han, mangan)
    };
  }

  function limitName(han, mangan) {
    if (han >= 13) return '数え役満';
    if (han >= 11) return '三倍満';
    if (han >= 8) return '倍満';
    if (han >= 6) return '跳満';
    if (han >= 5 || mangan) return '満貫';
    return '';
  }

  function roundUp100(n) { return Math.ceil(n / 100) * 100; }

  function payments(base, dealer, isTsumo) {
    if (dealer) {
      if (isTsumo) { const each = roundUp100(base * 2); return { total: each * 3, tsumoDealer: 0, tsumoNon: each }; }
      return { total: roundUp100(base * 6), tsumoDealer: 0, tsumoNon: 0 };
    }
    if (isTsumo) {
      const fromDealer = roundUp100(base * 2), fromNon = roundUp100(base * 1);
      return { total: fromDealer + fromNon * 2, tsumoDealer: fromDealer, tsumoNon: fromNon };
    }
    return { total: roundUp100(base * 4), tsumoDealer: 0, tsumoNon: 0 };
  }

  function sumHan(yaku) { return yaku.reduce((s, y) => s + y.han, 0); }

  return { evaluate };
})();
