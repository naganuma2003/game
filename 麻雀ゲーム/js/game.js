// game.js - ゲーム進行とUI（東風戦・門前のみ v1）

(() => {
  const SEAT_WIND_NAME = ['東', '南', '西', '北'];

  let state = null;
  let config = { seatTypes: ['cpu', 'cpu', 'cpu', 'cpu'], cpuLevel: 5, speed: 60, length: 'hanchan' };
  const cpuDelay = () => config.speed;
  const maxKyoku = () => (config.length === 'hanchan' ? 8 : 4);
  const AUTO_NEXT_SEC = 10;

  // ---------- 初期化 ----------
  function playerName(i, isCpu) {
    if (!isCpu) return i === 0 ? 'あなた' : 'プレイヤー' + (i + 1);
    return i === 0 ? 'CPU(手前)' : 'CPU' + i;
  }

  function newGame() {
    state = {
      players: [0, 1, 2, 3].map(i => {
        const isCpu = config.seatTypes[i] === 'cpu';
        return {
          name: playerName(i, isCpu), isCpu, cpuLevel: config.cpuLevel,
          hand: [], drawn: null, discards: [], melds: [],
          riichi: false, doubleRiichi: false, ippatsu: false,
          tempFuriten: false, score: 25000
        };
      }),
      wall: [], deadwall: [], doraIndicators: [], uraIndicators: [],
      dealer: 0, kyoku: 0, honba: 0, riichiSticks: 0,
      roundWind: 27, callMade: false,
      lastDiscard: null, lastDiscardBy: null,
      log: [], autoTimer: null
    };
  }

  function setupHand() {
    state.dealer = state.kyoku % 4;
    state.roundWind = state.kyoku < 4 ? 27 : 28;
    for (const p of state.players) {
      p.hand = []; p.drawn = null; p.discards = []; p.melds = [];
      p.riichi = false; p.doubleRiichi = false; p.ippatsu = false; p.tempFuriten = false;
    }
    state.callMade = false;
    state.afterKan = false;
    state.kanCount = 0;
    state.log.push({ title: roundText(), lines: [] });
    renderLog();
    const wall = Tiles.shuffle(Tiles.buildWall());
    const dw = wall.splice(wall.length - 14, 14);
    state.deadwall = dw;
    state.wall = wall;
    state.rinshan = [dw[0], dw[1], dw[2], dw[3]];                  // 嶺上牌(最大4)
    state.kanDoraInd = [dw[4], dw[6], dw[8], dw[10], dw[12]];      // 表ドラ表示(初+カン4)
    state.kanUraInd = [dw[5], dw[7], dw[9], dw[11], dw[13]];       // 裏ドラ表示
    state.doraIndicators = [state.kanDoraInd[0]];
    state.uraIndicators = [state.kanUraInd[0]];
    // 配牌
    for (let i = 0; i < 13; i++)
      for (let p = 0; p < 4; p++) state.players[p].hand.push(state.wall.shift());
    for (const p of state.players) p.hand = Tiles.sortTiles(p.hand);
  }

  function seatWind(p) { return 27 + ((p - state.dealer + 4) % 4); }
  function isDealer(p) { return p === state.dealer; }
  function doraTiles() { return state.doraIndicators.map(Tiles.doraNext); }
  function uraTiles() { return state.uraIndicators.map(Tiles.doraNext); }

  // 副露を Score 用に正規化
  function meldsForScore(pl) {
    return pl.melds.map(m => {
      if (m.type === 'chi') return { kind: 'chi', t: m.base, open: true, isKan: false };
      if (m.type === 'pon') return { kind: 'pon', t: m.base, open: true, isKan: false };
      if (m.type === 'minkan' || m.type === 'kakan') return { kind: 'pon', t: m.base, open: true, isKan: true };
      return { kind: 'pon', t: m.base, open: false, isKan: true }; // ankan
    });
  }
  function isMenzen(pl) { return pl.melds.every(m => m.type === 'ankan'); }

  // ---------- 文脈・和了判定 ----------
  function buildCtx(p, winTile, isTsumo, extra) {
    const pl = state.players[p];
    return {
      winTile, isTsumo,
      isRiichi: pl.riichi, isDoubleRiichi: pl.doubleRiichi, isIppatsu: pl.ippatsu,
      roundWind: state.roundWind, seatWind: seatWind(p),
      dora: doraTiles(), ura: uraTiles(), aka: 0,
      isHaitei: !!(extra && extra.haitei), isHoutei: !!(extra && extra.houtei),
      isRinshan: !!(extra && extra.rinshan), isChankan: false,
      dealer: isDealer(p), melds: meldsForScore(pl)
    };
  }

  // 赤牌対応ユーティリティ
  const bases = arr => arr.map(Tiles.base);
  const countRed = arr => arr.filter(Tiles.isRed).length;
  function akaInWin(pl, concealedFullIds) {
    let n = countRed(concealedFullIds);
    for (const m of pl.melds) n += countRed(m.tiles);
    return n;
  }

  function canAgari(p, concealedFull, winTile, isTsumo, extra) {
    const pl = state.players[p];
    const baseTiles = bases(concealedFull);
    const counts = Tiles.toCounts(baseTiles);
    if (!Agari.isAgariWithMelds(counts, pl.melds.length)) return null;
    const ctx = buildCtx(p, Tiles.base(winTile), isTsumo, extra);
    ctx.aka = akaInWin(pl, concealedFull);
    return Score.evaluate(baseTiles, ctx);
  }

  function isFuriten(p) {
    const pl = state.players[p];
    if (pl.tempFuriten) return true;
    const w = Agari.waitsWithMelds(bases(pl.hand), pl.melds.length);
    const discarded = new Set(pl.discards.map(d => Tiles.base(d.tile)));
    return w.some(t => discarded.has(t));
  }

  function keepsTenpai(full, discardTile, meldCount) {
    const rest = full.slice();
    rest.splice(rest.indexOf(discardTile), 1);
    return Agari.isTenpaiWithMelds(bases(rest), meldCount || 0);
  }
  function anyTenpaiDiscard(full, meldCount) {
    return [...new Set(full)].some(t => keepsTenpai(full, t, meldCount || 0));
  }

  // ---------- 途中流局 ----------
  // 九種九牌：第一ツモ・鳴き無し・自分の捨て無しで、么九牌が9種類以上
  function kyuushuEligible(p, drawn) {
    const pl = state.players[p];
    if (drawn === null || state.callMade || pl.discards.length > 0) return false;
    const set = new Set(bases(pl.hand.concat([drawn])).filter(Tiles.isYaochu));
    return set.size >= 9;
  }
  // 四風連打：全員が第一打のみ・同じ風牌・鳴き無し
  function suufonRenda() {
    if (state.callMade) return false;
    if (state.players.some(pl => pl.discards.length !== 1)) return false;
    const winds = state.players.map(pl => Tiles.base(pl.discards[0].tile));
    return Tiles.isWind(winds[0]) && winds.every(w => w === winds[0]);
  }

  // ---------- ターン処理 ----------
  async function playKyoku() {
    setupHand();
    renderAll();
    showMessage(roundText(), 900);
    let turnP = state.dealer;
    let draw = true;
    while (true) {
      const r = await doTurn(turnP, draw);
      if (r.type === 'tsumo') return onWin(r.player, r.res, true, null);
      if (r.type === 'ron') return onWin(r.q, r.res, false, r.discarder);
      if (r.type === 'ryuukyoku') return onRyuukyoku(r.abortive);
      if (r.type === 'call') { turnP = r.caller; draw = false; continue; }
      turnP = (turnP + 1) % 4; draw = true;
    }
  }

  async function doTurn(p, draw) {
    const pl = state.players[p];
    if (draw) {
      if (state.wall.length === 0) return { type: 'ryuukyoku' };
      pl.tempFuriten = false;
      pl.drawn = state.wall.shift();
      state.afterKan = false;
    }
    const haitei = draw && state.wall.length === 0;
    const rinshan = state.afterKan;
    renderAll();

    const full = pl.hand.concat(pl.drawn !== null ? [pl.drawn] : []);
    let decision;
    if (pl.isCpu) { await delay(cpuDelay()); decision = cpuTurn(p, pl.drawn, full, haitei); }
    else if (p === 0) decision = await humanTurn(p, pl.drawn, full, haitei);
    else decision = await opponentHumanTurn(p, pl.drawn, full, haitei);

    if (decision.action === 'tsumo') {
      const res = canAgari(p, full, pl.drawn, true, { haitei, rinshan });
      return { type: 'tsumo', player: p, res };
    }
    if (decision.action === 'kyuushu') return { type: 'ryuukyoku', abortive: 'kyuushu' };
    if (decision.action === 'ankan' || decision.action === 'kakan') {
      doKan(p, decision);
      renderAll();
      return await doTurn(p, false); // 嶺上牌で続行
    }

    if (pl.ippatsu && !decision.riichi) pl.ippatsu = false;
    state.afterKan = false;
    doDiscard(p, decision.tile, decision.riichi);
    renderAll();

    const houtei = state.wall.length === 0;
    const ron = await checkRon(p, decision.tile, houtei);
    if (ron) return { type: 'ron', q: ron.q, res: ron.res, discarder: p };

    // 途中流局（四風連打・四家立直）
    if (suufonRenda()) return { type: 'ryuukyoku', abortive: 'suufon' };
    if (state.players.every(x => x.riichi)) return { type: 'ryuukyoku', abortive: 'suucha' };

    const call = await checkCalls(p, decision.tile);
    if (call) { executeCall(call); renderAll(); return { type: 'call', caller: call.q }; }

    return { type: 'next' };
  }

  // 基準種別 baseType を捨てる実体（赤は残す＝赤でない方を優先）
  function pickDiscardInstance(tiles, baseType) {
    let idx = tiles.findIndex(t => Tiles.base(t) === baseType && !Tiles.isRed(t));
    if (idx < 0) idx = tiles.findIndex(t => Tiles.base(t) === baseType);
    return tiles[idx];
  }

  function cpuTurn(p, drawn, full, haitei) {
    const pl = state.players[p];
    const menzen = isMenzen(pl);
    if (drawn !== null && canAgari(p, full, drawn, true, { haitei, rinshan: state.afterKan }))
      return { action: 'tsumo' };
    if (pl.riichi) return { action: 'discard', tile: drawn, riichi: false };
    if (kyuushuEligible(p, drawn)) return { action: 'kyuushu' };

    // 暗槓（手を悪くしないときのみ・lv4以上）
    if (drawn !== null && pl.cpuLevel >= 4 && state.kanCount < 4 && state.wall.length > 0) {
      const cnt = Tiles.toCounts(bases(full));
      for (let t = 0; t < 34; t++) {
        if (cnt[t] !== 4) continue;
        const before = AI.shantenWithMelds(cnt, pl.melds.length);
        const after = AI.shantenWithMelds(Tiles.toCounts(bases(full).filter(x => x !== t)), pl.melds.length + 1);
        if (after <= before) return { action: 'ankan', tile: t };
      }
    }

    const dec = AI.chooseDiscard(bases(full), pl.cpuLevel);
    const discardId = pickDiscardInstance(full, dec.discard);
    if (menzen && dec.shanten === 0 && pl.score >= 1000 && state.wall.length >= 4
        && Math.random() < AI.riichiProb(pl.cpuLevel)) {
      if (keepsTenpai(full, discardId, pl.melds.length))
        return { action: 'discard', tile: discardId, riichi: true };
    }
    return { action: 'discard', tile: discardId, riichi: false };
  }

  function doDiscard(p, tile, riichi) {
    const pl = state.players[p];
    const full = pl.hand.concat(pl.drawn !== null ? [pl.drawn] : []);
    const tsumogiri = tile === pl.drawn;
    const idx = full.indexOf(tile);
    full.splice(idx, 1);
    pl.hand = Tiles.sortTiles(full);
    pl.drawn = null;
    if (riichi) {
      pl.riichi = true;
      pl.ippatsu = true;
      if (pl.discards.length === 0 && !state.callMade) pl.doubleRiichi = true;
      pl.score -= 1000;
      state.riichiSticks += 1;
      logLine(pl.name + ' リーチ');
    }
    pl.discards.push({ tile, riichi, tsumogiri });
    state.lastDiscard = tile;
    state.lastDiscardBy = p;
  }

  async function checkRon(discarder, tile, houtei) {
    for (let i = 1; i < 4; i++) {
      const q = (discarder + i) % 4;
      const pl = state.players[q];
      const full = pl.hand.concat([tile]);
      if (!Agari.isAgari(Tiles.toCounts(full))) continue;
      if (isFuriten(q)) continue;
      const res = canAgari(q, full, tile, false, { houtei });
      if (!res) continue;
      if (!pl.isCpu) {
        const ok = q === 0 ? await humanRonChoice(res, tile)
                           : await opponentHumanRon(q, res, tile);
        if (ok) return { q, res };
        pl.tempFuriten = true; // 見逃し → 同巡フリテン
        continue;
      }
      return { q, res };
    }
    return null;
  }

  // 自分の手番でのカン候補
  function kanCandidates(pl, full) {
    const counts = Tiles.toCounts(full);
    const ankan = [];
    for (let t = 0; t < 34; t++) if (counts[t] === 4) ankan.push(t);
    const kakan = [];
    for (const m of pl.melds)
      if (m.type === 'pon' && full.some(t => Tiles.base(t) === m.base)) kakan.push(m.base);
    return { ankan, kakan };
  }

  // ---------- 人間の操作 ----------
  function humanTurn(p, drawn, full, haitei) {
    return new Promise(resolve => {
      const pl = state.players[p];
      const menzen = isMenzen(pl);
      const mc = pl.melds.length;
      const tsumoRes = drawn !== null && canAgari(p, full, drawn, true, { haitei, rinshan: state.afterKan });
      const canRiichi = menzen && !pl.riichi && pl.score >= 1000 && state.wall.length >= 4 && anyTenpaiDiscard(full, mc);
      const kans = (drawn !== null && state.kanCount < 4 && state.wall.length > 0) ? kanCandidates(pl, full) : { ankan: [], kakan: [] };
      const canKan = !pl.riichi && (kans.ankan.length || kans.kakan.length);

      const finish = (decision) => { clearHandHandlers(); setActions([]); hideMessage(); resolve(decision); };

      function normalMode() {
        const actions = [];
        if (tsumoRes) actions.push({ label: 'ツモ', cls: 'btn-win', onClick: () => finish({ action: 'tsumo' }) });
        if (canRiichi) actions.push({ label: 'リーチ', cls: 'btn-riichi', onClick: riichiMode });
        if (canKan) actions.push({ label: 'カン', cls: 'btn-riichi', onClick: () => finish(pickKan(kans)) });
        if (kyuushuEligible(p, drawn)) actions.push({ label: '九種九牌', cls: '', onClick: () => finish({ action: 'kyuushu' }) });
        setActions(actions);
        if (pl.riichi) {
          enableHandClick([drawn], tile => finish({ action: 'discard', tile, riichi: false }));
          if (!tsumoRes && !canKan) setTimeout(() => finish({ action: 'discard', tile: drawn, riichi: false }), 450);
        } else {
          enableHandClick(full, tile => finish({ action: 'discard', tile, riichi: false }));
        }
      }
      function riichiMode() {
        showMessage('リーチ：捨てる牌を選んでください', 0);
        const allowed = [...new Set(full)].filter(t => keepsTenpai(full, t, mc));
        setActions([{ label: '取消', cls: '', onClick: () => { hideMessage(); normalMode(); } }]);
        enableHandClick(allowed, tile => finish({ action: 'discard', tile, riichi: true }), true);
      }
      normalMode();
    });
  }

  function pickKan(kans) {
    if (kans.ankan.length) return { action: 'ankan', tile: kans.ankan[0] };
    return { action: 'kakan', tile: kans.kakan[0] };
  }

  function humanRonChoice(res, tile) {
    return new Promise(resolve => {
      showMessage('ロンできます（' + tile2str(tile) + '）', 0);
      setActions([
        { label: 'ロン', cls: 'btn-win', onClick: () => { hideMessage(); setActions([]); resolve(true); } },
        { label: 'パス', cls: '', onClick: () => { hideMessage(); setActions([]); resolve(false); } }
      ]);
    });
  }

  // ---------- 人間の対面プレイヤー（手渡しオーバーレイ） ----------
  function renderPickHand(container, tiles, allowedSet, onPick, mark) {
    container.innerHTML = tiles.map(t =>
      `<button class="tile-btn${redCls(t)}" data-tile="${t}">${tileInner(t)}</button>`).join('');
    container.querySelectorAll('.tile-btn').forEach(btn => {
      const t = parseInt(btn.dataset.tile, 10);
      const ok = allowedSet.has(t);
      btn.classList.toggle('disabled', !ok);
      if (mark) btn.classList.toggle('riichi-cand', ok);
      btn.onclick = ok ? () => onPick(t) : null;
    });
  }
  function renderOvActions(container, actions) {
    container.innerHTML = '';
    for (const a of actions) {
      const b = document.createElement('button');
      b.textContent = a.label;
      b.className = 'action ' + (a.cls || '');
      b.onclick = a.on;
      container.appendChild(b);
    }
  }

  function opponentHumanTurn(p, drawn, full, haitei) {
    return new Promise(resolve => {
      const pl = state.players[p];
      const menzen = isMenzen(pl);
      const mc = pl.melds.length;
      const tsumoRes = drawn !== null && canAgari(p, full, drawn, true, { haitei, rinshan: state.afterKan });
      const canRiichi = menzen && !pl.riichi && pl.score >= 1000 && state.wall.length >= 4 && anyTenpaiDiscard(full, mc);
      const kans = (drawn !== null && state.kanCount < 4 && state.wall.length > 0) ? kanCandidates(pl, full) : { ankan: [], kakan: [] };
      const canKan = !pl.riichi && (kans.ankan.length || kans.kakan.length);
      const sorted = Tiles.sortTiles(full);

      el('seat-0').classList.add('conceal'); // 自分の手牌を隠す
      const ov = el('handover'), reveal = el('handover-reveal');
      const handEl = el('handover-hand'), actEl = el('handover-actions');
      el('handover-banner').textContent = pl.name + 'の番';
      handEl.innerHTML = ''; actEl.innerHTML = '';
      reveal.classList.remove('hidden');
      ov.classList.remove('hidden');

      const done = (decision) => {
        ov.classList.add('hidden');
        el('seat-0').classList.remove('conceal');
        resolve(decision);
      };

      function normal() {
        const actions = [];
        if (tsumoRes) actions.push({ label: 'ツモ', cls: 'btn-win', on: () => done({ action: 'tsumo' }) });
        if (canRiichi) actions.push({ label: 'リーチ', cls: 'btn-riichi', on: riichi });
        if (canKan) actions.push({ label: 'カン', cls: 'btn-riichi', on: () => done(pickKan(kans)) });
        if (kyuushuEligible(p, drawn)) actions.push({ label: '九種九牌', cls: '', on: () => done({ action: 'kyuushu' }) });
        renderOvActions(actEl, actions);
        if (pl.riichi) {
          renderPickHand(handEl, sorted, new Set([drawn]), t => done({ action: 'discard', tile: t, riichi: false }), false);
          if (!tsumoRes && !canKan) setTimeout(() => done({ action: 'discard', tile: drawn, riichi: false }), 500);
        } else {
          renderPickHand(handEl, sorted, new Set(sorted), t => done({ action: 'discard', tile: t, riichi: false }), false);
        }
      }
      function riichi() {
        const allowed = new Set([...new Set(full)].filter(t => keepsTenpai(full, t, mc)));
        renderOvActions(actEl, [{ label: '取消', cls: '', on: normal }]);
        renderPickHand(handEl, sorted, allowed, t => done({ action: 'discard', tile: t, riichi: true }), true);
      }

      reveal.onclick = () => { reveal.classList.add('hidden'); normal(); };
    });
  }

  function opponentHumanRon(p, res, tile) {
    return new Promise(resolve => {
      el('seat-0').classList.add('conceal');
      const ov = el('handover'), reveal = el('handover-reveal');
      const handEl = el('handover-hand'), actEl = el('handover-actions');
      el('handover-banner').textContent = state.players[p].name + '：ロンできます（' + Tiles.name(tile) + '）';
      reveal.classList.add('hidden'); handEl.innerHTML = '';
      const close = () => { ov.classList.add('hidden'); el('seat-0').classList.remove('conceal'); };
      renderOvActions(actEl, [
        { label: 'ロン', cls: 'btn-win', on: () => { close(); resolve(true); } },
        { label: 'パス', cls: '', on: () => { close(); resolve(false); } }
      ]);
      ov.classList.remove('hidden');
    });
  }

  // ---------- 鳴き（ポン・チー・カン） ----------
  function countInHand(pl, tile) {
    const b = Tiles.base(tile);
    return pl.hand.filter(x => Tiles.base(x) === b).length;
  }

  // 捨て牌 tile に対する q の可能なチー（[手牌2枚の基準種別]の組）
  function chiPatterns(hand, tile) {
    const t = Tiles.base(tile);
    if (t >= 27) return [];
    const hb = hand.map(Tiles.base);
    const has = x => hb.includes(x);
    const r = t % 9, suitBase = Math.floor(t / 9) * 9;
    const pats = [];
    const inSuit = x => x >= suitBase && x < suitBase + 9;
    if (r >= 2 && inSuit(t - 2) && has(t - 2) && has(t - 1)) pats.push([t - 2, t - 1]);
    if (r >= 1 && r <= 7 && has(t - 1) && has(t + 1)) pats.push([t - 1, t + 1]);
    if (r <= 6 && has(t + 1) && has(t + 2)) pats.push([t + 1, t + 2]);
    return pats;
  }

  function seatDist(from, q) { return (q - from + 4) % 4; }

  async function checkCalls(discarder, tile) {
    const cands = [];
    for (let i = 1; i < 4; i++) {
      const q = (discarder + i) % 4;
      const pl = state.players[q];
      if (pl.riichi) continue;
      const cnt = countInHand(pl, tile);
      const opts = {};
      if (cnt >= 2) opts.pon = true;
      if (cnt >= 3 && state.kanCount < 4 && state.wall.length > 0) opts.minkan = true;
      if (q === (discarder + 1) % 4) {
        const pats = chiPatterns(pl.hand, tile);
        if (pats.length) opts.chi = pats;
      }
      if (opts.pon || opts.minkan || opts.chi) cands.push({ q, opts });
    }
    if (!cands.length) return null;

    const declared = [];
    for (const c of cands) {
      const pl = state.players[c.q];
      let dec = pl.isCpu ? cpuCallDecision(c.q, tile, c.opts)
                         : await humanCallDecision(c.q, tile, c.opts);
      if (dec) declared.push({ q: c.q, call: dec });
    }
    if (!declared.length) return null;

    declared.sort((a, b) => {
      const pa = a.call.type === 'chi' ? 1 : 0, pb = b.call.type === 'chi' ? 1 : 0;
      if (pa !== pb) return pa - pb;                    // ポン/カン優先
      return seatDist(discarder, a.q) - seatDist(discarder, b.q);
    });
    return { q: declared[0].q, tile, call: declared[0].call, from: discarder };
  }

  function isYakuhaiBase(b, q) {
    return Tiles.isDragon(b) || b === state.roundWind || b === seatWind(q);
  }
  function hasYakuhaiMeld(pl, q) {
    return pl.melds.some(m => m.type !== 'ankan' && isYakuhaiBase(m.base, q));
  }
  // 鳴いた後の手内シャンテン（基準種別）
  function shantenAfterCall(pl, tile, type, chiTiles) {
    const arr = bases(pl.hand);
    const rm = type === 'chi' ? chiTiles.slice() : [Tiles.base(tile), Tiles.base(tile)];
    for (const x of rm) { const i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); }
    return AI.shantenWithMelds(Tiles.toCounts(arr), pl.melds.length + 1);
  }
  function shantenNow(pl) {
    return AI.shantenWithMelds(Tiles.toCounts(bases(pl.hand)), pl.melds.length);
  }

  // CPUの鳴き判断（役が確実に成立する場合のみ → 役なしの死に手を作らない）
  function cpuCallDecision(q, tile, opts) {
    const pl = state.players[q];
    const lv = pl.cpuLevel;
    const tb = Tiles.base(tile);

    // 役牌ポン（レベルが高いほど鳴く）
    const ponProb = { 1: 0.5, 2: 0.75, 3: 0.9, 4: 1, 5: 1 }[lv] || 1;
    if (opts.pon && isYakuhaiBase(tb, q) && Math.random() < ponProb) return { type: 'pon' };

    // すでに役牌で開いている＝役確定 → 手を前進させる鳴き（lv3以上）
    if (lv >= 3 && hasYakuhaiMeld(pl, q)) {
      const before = shantenNow(pl);
      if (opts.pon && shantenAfterCall(pl, tile, 'pon') < before) return { type: 'pon' };
      if (opts.chi) {
        for (const pat of opts.chi)
          if (shantenAfterCall(pl, tile, 'chi', pat) < before) return { type: 'chi', tiles: pat };
      }
    }
    return null;
  }

  function humanCallDecision(q, tile, opts) {
    return new Promise(resolve => {
      if (q === 0) {
        const actions = [];
        if (opts.pon) actions.push({ label: 'ポン', cls: 'btn-riichi', onClick: () => fin({ type: 'pon' }) });
        if (opts.minkan) actions.push({ label: 'カン', cls: 'btn-riichi', onClick: () => fin({ type: 'minkan' }) });
        if (opts.chi) actions.push({ label: 'チー', cls: 'btn-riichi', onClick: () => chooseChi() });
        actions.push({ label: 'スキップ', cls: '', onClick: () => fin(null) });
        showMessage('鳴けます（' + Tiles.name(tile) + '）', 0);
        setActions(actions);
        function fin(d) { hideMessage(); setActions([]); resolve(d); }
        function chooseChi() {
          if (opts.chi.length === 1) return fin({ type: 'chi', tiles: opts.chi[0] });
          setActions(opts.chi.map(pat => ({
            label: Tiles.name(pat[0]) + Tiles.name(pat[1]), cls: 'btn-riichi',
            onClick: () => fin({ type: 'chi', tiles: pat })
          })).concat([{ label: '取消', cls: '', onClick: () => { setActions([]); humanCallDecision(0, tile, opts).then(resolve); } }]));
        }
      } else {
        // 人間の対面プレイヤー：オーバーレイで確認
        el('seat-0').classList.add('conceal');
        const ov = el('handover'), reveal = el('handover-reveal');
        const handEl = el('handover-hand'), actEl = el('handover-actions');
        el('handover-banner').textContent = state.players[q].name + '：鳴けます（' + Tiles.name(tile) + '）';
        reveal.classList.add('hidden'); handEl.innerHTML = '';
        const close = () => { ov.classList.add('hidden'); el('seat-0').classList.remove('conceal'); };
        const list = [];
        if (opts.pon) list.push({ label: 'ポン', cls: 'btn-riichi', on: () => { close(); resolve({ type: 'pon' }); } });
        if (opts.minkan) list.push({ label: 'カン', cls: 'btn-riichi', on: () => { close(); resolve({ type: 'minkan' }); } });
        if (opts.chi) list.push({ label: 'チー', cls: 'btn-riichi', on: () => { close(); resolve({ type: 'chi', tiles: opts.chi[0] }); } });
        list.push({ label: 'スキップ', cls: '', on: () => { close(); resolve(null); } });
        renderOvActions(actEl, list);
        ov.classList.remove('hidden');
      }
    });
  }

  // 基準種別 baseType の牌を n 枚抜いて、抜いた実体IDを返す（赤は残す）
  function removeFromHand(pl, baseType, n, keepRed) {
    const removed = [];
    for (let k = 0; k < n; k++) {
      let idx = keepRed ? pl.hand.findIndex(t => Tiles.base(t) === baseType && !Tiles.isRed(t)) : -1;
      if (idx < 0) idx = pl.hand.findIndex(t => Tiles.base(t) === baseType);
      removed.push(pl.hand[idx]);
      pl.hand.splice(idx, 1);
    }
    return removed;
  }

  function executeCall(call) {
    const pl = state.players[call.q];
    const tileId = call.tile;          // 鳴いた捨て牌の実体ID（赤かも）
    const tb = Tiles.base(tileId);
    // 鳴かれた牌に印
    const dpl = state.players[call.from];
    for (let i = dpl.discards.length - 1; i >= 0; i--)
      if (dpl.discards[i].tile === tileId && !dpl.discards[i].called) { dpl.discards[i].called = true; break; }
    state.callMade = true;
    for (const x of state.players) x.ippatsu = false;
    state.afterKan = false;

    if (call.call.type === 'pon') {
      const used = removeFromHand(pl, tb, 2, true);
      pl.melds.push({ type: 'pon', base: tb, tiles: [tileId, ...used], from: call.from });
      pl.drawn = null;
      logLine(pl.name + ' ポン ' + Tiles.name(tb));
    } else if (call.call.type === 'minkan') {
      const used = removeFromHand(pl, tb, 3, false);
      pl.melds.push({ type: 'minkan', base: tb, tiles: [tileId, ...used], from: call.from });
      logLine(pl.name + ' カン ' + Tiles.name(tb));
      doRinshanDraw(call.q);
    } else if (call.call.type === 'chi') {
      const [a, b] = call.call.tiles; // 基準種別
      const ua = removeFromHand(pl, a, 1, true), ub = removeFromHand(pl, b, 1, true);
      const base = Math.min(a, b, tb);
      const tiles = [tileId, ua[0], ub[0]].sort((x, y) => Tiles.base(x) - Tiles.base(y));
      pl.melds.push({ type: 'chi', base, tiles, from: call.from });
      pl.drawn = null;
      logLine(pl.name + ' チー ' + Tiles.name(tb));
    }
    pl.hand = Tiles.sortTiles(pl.hand);
  }

  function doRinshanDraw(p) {
    const pl = state.players[p];
    pl.drawn = state.rinshan[state.kanCount];
    state.kanCount += 1;
    state.doraIndicators.push(state.kanDoraInd[state.kanCount]);
    state.uraIndicators.push(state.kanUraInd[state.kanCount]);
    if (state.wall.length) state.wall.pop(); // 王牌補充ぶん
    state.afterKan = true;
  }

  function doKan(p, decision) {
    const pl = state.players[p];
    const tb = decision.tile; // 基準種別
    const full = pl.hand.concat(pl.drawn !== null ? [pl.drawn] : []);
    state.callMade = true;
    for (const x of state.players) x.ippatsu = false;
    if (decision.action === 'ankan') {
      const used = full.filter(t => Tiles.base(t) === tb);   // 同種4枚（赤含む）
      pl.hand = Tiles.sortTiles(full.filter(t => Tiles.base(t) !== tb));
      pl.drawn = null;
      pl.melds.push({ type: 'ankan', base: tb, tiles: used, from: null });
      logLine(pl.name + ' 暗カン ' + Tiles.name(tb));
    } else { // kakan: 既存ポンに1枚追加
      const idx = full.findIndex(t => Tiles.base(t) === tb);
      const added = full[idx];
      const rest = full.slice(); rest.splice(idx, 1);
      pl.hand = Tiles.sortTiles(rest);
      pl.drawn = null;
      const m = pl.melds.find(mm => mm.type === 'pon' && mm.base === tb);
      m.type = 'kakan'; m.tiles = m.tiles.concat([added]);
      logLine(pl.name + ' 加カン ' + Tiles.name(tb));
    }
    doRinshanDraw(p);
  }

  // ---------- 局の終了処理 ----------
  function onWin(winner, res, isTsumo, discarder) {
    applyWin(res, winner, isTsumo, discarder);
    const pl = state.players[winner];
    const yakuStr = res.yaku.map(y => y.name).join('・');
    const head = res.limitName ? res.limitName : (res.fu + '符' + res.han + '翻');
    logLine(pl.name + ' ' + (isTsumo ? 'ツモ' : 'ロン') + ' ' + res.total + '点 ' + head, 'win');
    logLine('　' + yakuStr);
    const renchan = winner === state.dealer;
    showResult(winner, res, isTsumo, discarder, () => {
      if (renchan) state.honba += 1;
      else { state.honba = 0; state.kyoku += 1; }
      proceedOrFinish();
    });
  }

  function applyWin(res, w, isTsumo, loser) {
    const honba = state.honba;
    let collected = 0;
    if (isTsumo) {
      for (let q = 0; q < 4; q++) {
        if (q === w) continue;
        let pay = (w === state.dealer) ? res.tsumoNon
          : (q === state.dealer ? res.tsumoDealer : res.tsumoNon);
        pay += honba * 100;
        state.players[q].score -= pay;
        collected += pay;
      }
    } else {
      const pay = res.total + honba * 300;
      state.players[loser].score -= pay;
      collected += pay;
    }
    collected += state.riichiSticks * 1000;
    state.riichiSticks = 0;
    state.players[w].score += collected;
  }

  function onRyuukyoku(abortive) {
    if (abortive) {
      const names = { kyuushu: '九種九牌', suufon: '四風連打', suucha: '四家立直', suukan: '四開槓' };
      logLine('途中流局（' + names[abortive] + '）');
      showAbortive(names[abortive], () => { state.honba += 1; proceedOrFinish(); }); // 親は流れず連荘
      return;
    }
    const tenpai = state.players.map((pl, i) => pl.riichi || Agari.isTenpaiWithMelds(bases(pl.hand), pl.melds.length));
    const tCount = tenpai.filter(Boolean).length;
    if (tCount > 0 && tCount < 4) {
      const recv = 3000 / tCount, pay = 3000 / (4 - tCount);
      state.players.forEach((pl, i) => pl.score += tenpai[i] ? recv : -pay);
    }
    const dealerTenpai = tenpai[state.dealer];
    const names = state.players.filter((pl, i) => tenpai[i]).map(pl => pl.name);
    logLine('流局（テンパイ: ' + (names.length ? names.join('・') : 'なし') + '）');
    showRyuukyoku(tenpai, () => {
      state.honba += 1;
      if (!dealerTenpai) state.kyoku += 1;
      proceedOrFinish();
    });
  }

  // Mリーグ準拠: トビなし（持ち点マイナスでも続行）。規定局数で終了。
  function proceedOrFinish() {
    if (state.kyoku >= maxKyoku()) { showFinal(); return; }
    playKyoku();
  }

  // ---------- 描画 ----------
  function el(id) { return document.getElementById(id); }
  function tile2str(t) { return Tiles.name(t); }
  function redCls(t) { return Tiles.isRed(t) ? ' aka' : ''; }

  // 牌の絵柄（Unicode麻雀牌グリフ＝実際の牌に近い見た目）
  function tileInner(t) { return Tiles.glyph(t); }
  // 牌1枚のHTML（span）。extra はクラス追加用。
  function tileHtml(t, extra) {
    return `<span class="tile-glyph${extra ? ' ' + extra : ''}${redCls(t)}">${Tiles.glyph(t)}</span>`;
  }

  function roundText() {
    const wind = state.kyoku < 4 ? '東' : '南';
    return wind + ((state.kyoku % 4) + 1) + '局 ' + state.honba + '本場';
  }

  // ---------- 対局ログ ----------
  function logLine(text, cls) {
    if (!state.log.length) return;
    state.log[state.log.length - 1].lines.push({ text, cls: cls || '' });
    renderLog();
  }
  function renderLog() {
    const c = el('log-content');
    if (!c) return;
    c.innerHTML = state.log.map(h =>
      `<div class="log-hand"><div class="log-hand-title">${h.title}</div>` +
      h.lines.map(l => `<div class="log-line ${l.cls}">${l.text}</div>`).join('') +
      `</div>`).join('');
    c.scrollTop = c.scrollHeight;
  }

  function renderAll() {
    if (!state) return;
    // 中央情報
    el('center-round').textContent = roundText();
    el('center-wall').textContent = '残り ' + state.wall.length + '枚　供託 ' + state.riichiSticks + '本';
    el('dora-indicators').innerHTML = state.doraIndicators.map(t => tileHtml(t)).join('');

    for (let p = 0; p < 4; p++) renderSeat(p);
  }

  function renderSeat(p) {
    const pl = state.players[p];
    const seat = el('seat-' + p);
    const info = seat.querySelector('.pinfo');
    info.querySelector('.pname').textContent = pl.name + (p === state.dealer ? '（親）' : '');
    info.querySelector('.pscore').textContent = pl.score;
    info.querySelector('.pwind').textContent = SEAT_WIND_NAME[(p - state.dealer + 4) % 4];

    // 河（中央卓の各辺）：中→外へ 1行6牌で並べる
    renderPond(p, pl.discards);
    renderMelds(p);

    if (p === 0) {
      renderPlayerHand();
    } else {
      const back = seat.querySelector('.hand-back');
      const n = pl.hand.length + (pl.drawn !== null ? 1 : 0);
      back.innerHTML = Array(n).fill('<span class="tile-glyph back">🀫</span>').join('');
    }
  }

  function renderMelds(p) {
    const cont = el('melds-' + p);
    if (!cont) return;
    const pl = state.players[p];
    cont.innerHTML = pl.melds.map(m => {
      let cells;
      if (m.type === 'ankan') { // 暗槓は両端伏せ、中2枚は実体表示
        cells = ['<span class="tile-glyph meld-t back">🀫</span>',
          tileHtml(m.tiles[1], 'meld-t'), tileHtml(m.tiles[2], 'meld-t'),
          '<span class="tile-glyph meld-t back">🀫</span>'];
      } else {
        cells = m.tiles.map(t => tileHtml(t, 'meld-t'));
      }
      return '<span class="meld">' + cells.join('') + '</span>';
    }).join('');
  }

  function renderPond(p, discards) {
    const pond = el('pond-' + p);
    let html = '';
    for (let i = 0; i < discards.length; i += 6) {
      const row = discards.slice(i, i + 6);
      html += '<div class="prow">' + row.map(d =>
        tileHtml(d.tile, 'disc' + (d.riichi ? ' riichi' : ''))
      ).join('') + '</div>';
    }
    pond.innerHTML = html;
  }

  let handClickHandler = null;
  function renderPlayerHand() {
    const pl = state.players[0];
    const hand = el('player-hand');
    let html = pl.hand.map(t =>
      `<button class="tile-btn${redCls(t)}" data-tile="${t}">${tileInner(t)}</button>`).join('');
    if (pl.drawn !== null)
      html += `<button class="tile-btn drawn${redCls(pl.drawn)}" data-tile="${pl.drawn}" data-drawn="1">${tileInner(pl.drawn)}</button>`;
    hand.innerHTML = html;
    if (handClickHandler) attachHandClick();
  }

  // tilesAllowed: 種類の配列。onPick(tile)
  let currentAllowed = null, currentPick = null, currentMark = false;
  function enableHandClick(tilesAllowed, onPick, mark = false) {
    currentAllowed = tilesAllowed; currentPick = onPick; currentMark = mark;
    handClickHandler = true;
    attachHandClick();
  }
  function attachHandClick() {
    const hand = el('player-hand');
    const allowedSet = new Set(currentAllowed);
    hand.querySelectorAll('.tile-btn').forEach(btn => {
      const t = parseInt(btn.dataset.tile, 10);
      const ok = allowedSet.has(t);
      btn.classList.toggle('disabled', !ok);
      if (currentMark) btn.classList.toggle('riichi-cand', ok);
      btn.onclick = ok ? () => {
        const pick = currentPick;
        clearHandHandlers();
        pick(t);
      } : null;
    });
  }
  function clearHandHandlers() {
    handClickHandler = null; currentAllowed = null; currentPick = null; currentMark = false;
    el('player-hand').querySelectorAll('.tile-btn').forEach(b => {
      b.onclick = null; b.classList.remove('disabled', 'riichi-cand');
    });
  }

  function setActions(actions) {
    const bar = el('action-bar');
    bar.innerHTML = '';
    for (const a of actions) {
      const b = document.createElement('button');
      b.textContent = a.label;
      b.className = 'action ' + (a.cls || '');
      b.onclick = a.onClick;
      bar.appendChild(b);
    }
  }

  let msgTimer = null;
  function showMessage(text, ms) {
    const m = el('message');
    m.textContent = text; m.classList.remove('hidden');
    if (msgTimer) clearTimeout(msgTimer);
    if (ms > 0) msgTimer = setTimeout(() => m.classList.add('hidden'), ms);
  }
  function hideMessage() { el('message').classList.add('hidden'); }

  // ---------- 結果表示 ----------
  function showResult(winner, res, isTsumo, discarder, onNext) {
    const pl = state.players[winner];
    el('result-title').textContent =
      pl.name + ' ' + (isTsumo ? 'ツモ和了' : 'ロン和了') +
      (res.yakuman ? '　★' + res.limitName : (res.limitName ? '　' + res.limitName : ''));

    const winTile = res.yaku && res.winTile;
    const handTiles = Tiles.sortTiles(pl.hand.concat(isTsumo ? [] : []));
    el('result-hand').innerHTML = renderHandGlyphs(winner, isTsumo)
      + `<div class="dora-line">ドラ表示 ${state.doraIndicators.map(t => tileHtml(t)).join('')}`
      + (pl.riichi ? `　裏 ${state.uraIndicators.map(t => tileHtml(t)).join('')}` : '') + `</div>`;

    el('result-yaku').innerHTML = res.yaku.map(y =>
      `<div class="yaku-row"><span>${y.name}</span><span>${y.han < 13 ? y.han + '翻' : ''}</span></div>`).join('');

    let scoreLine;
    if (res.yakuman) scoreLine = res.limitName + '　' + res.total + '点';
    else scoreLine = res.fu + '符 ' + res.han + '翻　' + res.total + '点'
      + (res.limitName ? '（' + res.limitName + '）' : '');
    el('result-score').textContent = scoreLine;

    openResult(onNext);
  }

  function renderHandGlyphs(winner, isTsumo) {
    const pl = state.players[winner];
    const concealed = pl.hand.map(t => tileHtml(t)).join('');
    const melds = pl.melds.map(m =>
      '<span class="meld">' + m.tiles.map(t => tileHtml(t)).join('') + '</span>'
    ).join('');
    return `<div class="result-tiles">${concealed}${melds ? '　' + melds : ''}</div>`;
  }

  function showAbortive(label, onNext) {
    el('result-title').textContent = '途中流局';
    el('result-hand').innerHTML = `<div class="ten-row">${label}　親は連荘</div>`;
    el('result-yaku').innerHTML = '';
    el('result-score').textContent = '';
    openResult(onNext);
  }

  function showRyuukyoku(tenpai, onNext) {
    el('result-title').textContent = '流局';
    el('result-hand').innerHTML = state.players.map((pl, i) =>
      `<div class="ten-row">${pl.name}: ${tenpai[i] ? 'テンパイ' : 'ノーテン'}</div>`).join('');
    el('result-yaku').innerHTML = '';
    el('result-score').textContent = '';
    openResult(onNext);
  }

  function openResult(onNext) {
    renderAll();
    el('result').classList.remove('hidden');
    const btn = el('result-next');
    let n = AUTO_NEXT_SEC;
    const proceed = () => {
      if (state.autoTimer) { clearInterval(state.autoTimer); state.autoTimer = null; }
      btn.textContent = '次へ';
      el('result').classList.add('hidden');
      onNext();
    };
    btn.textContent = '次へ (' + n + ')';
    if (state.autoTimer) clearInterval(state.autoTimer);
    state.autoTimer = setInterval(() => {
      n -= 1;
      if (n <= 0) proceed();
      else btn.textContent = '次へ (' + n + ')';
    }, 1000);
    btn.onclick = proceed;
  }

  function showFinal() {
    if (state.autoTimer) { clearInterval(state.autoTimer); state.autoTimer = null; }
    const UMA = [30, 10, -10, -30]; // Mリーグ順位点
    const ranked = state.players.map((p, i) => ({ i, name: p.name, score: p.score }))
      .sort((a, b) => b.score - a.score || a.i - b.i);
    el('result-title').textContent = '対局終了 — 最終結果';
    el('result-hand').innerHTML = ranked.map((r, idx) => {
      const pt = (r.score - 25000) / 1000 + UMA[idx];
      const sign = pt >= 0 ? '+' : '';
      return `<div class="rank-row"><span>${idx + 1}位　${r.name}</span>` +
        `<span>${r.score}点　<b>${sign}${pt.toFixed(1)}</b></span></div>`;
    }).join('');
    el('result-yaku').innerHTML = '<div class="dora-line">順位点（ウマ +30/+10/−10/−30、原点25000）</div>';
    el('result-score').textContent = '';
    el('result').classList.remove('hidden');
    const btn = el('result-next');
    btn.textContent = 'もう一度';
    btn.onclick = () => { el('result').classList.add('hidden'); start(); };
  }

  // ---------- ユーティリティ ----------
  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ---------- 開始 ----------
  function readConfig() {
    const seatTypes = ['cpu', 'cpu', 'cpu', 'cpu'];
    for (let s = 0; s <= 3; s++) {
      const active = document.querySelector('.seat-opt.active[data-seat="' + s + '"]');
      seatTypes[s] = active ? active.dataset.type : 'cpu';
    }
    const lv = document.querySelector('.lv-opt.active');
    const sp = document.querySelector('.speed-opt.active');
    const ln = document.querySelector('.length-opt.active');
    return {
      seatTypes,
      cpuLevel: lv ? parseInt(lv.dataset.lv, 10) : 5,
      speed: sp ? parseInt(sp.dataset.speed, 10) : 60,
      length: ln ? ln.dataset.length : 'hanchan'
    };
  }

  function start() {
    config = readConfig();
    newGame();
    el('start-screen').classList.add('hidden');
    el('result-next').textContent = '次へ';
    playKyoku();
  }

  function wireConfig() {
    // 席ごとの CPU / 人間 トグル
    document.querySelectorAll('.seat-opt').forEach(btn => {
      btn.onclick = () => {
        const s = btn.dataset.seat;
        document.querySelectorAll('.seat-opt[data-seat="' + s + '"]')
          .forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      };
    });
    // CPU強さ
    document.querySelectorAll('.lv-opt').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.lv-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      };
    });
    // CPU速度
    document.querySelectorAll('.speed-opt').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.speed-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      };
    });
    // 局数
    document.querySelectorAll('.length-opt').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.length-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      };
    });
    // ログ開閉
    const lt = el('log-toggle');
    if (lt) lt.onclick = () => {
      const c = el('log-content');
      const open = c.classList.toggle('hidden') === false;
      lt.textContent = '対局ログ ' + (open ? '▼' : '▶');
    };
  }

  function bindStart() {
    const btn = el('btn-start');
    if (btn) btn.onclick = start;
    wireConfig();
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', bindStart);
  else
    bindStart();
})();
