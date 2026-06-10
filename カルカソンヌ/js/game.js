/* game.js — ゲーム進行・UI・入力。board/render/ai を束ねる。 */
(function () {
  'use strict';

  var PLAYER_COLORS = ['#e53e3e', '#3182ce', '#38a169', '#d69e2e', '#805ad5'];
  var COLOR_NAMES = ['赤', '青', '緑', '黄', '紫'];

  var G = {
    board: null, players: [], deck: [],
    currentType: null, currentRot: 0,
    turnIndex: 0, started: false, gameOver: false,
    placed: null,          // 配置済みで未確定のタイル {x,y}
    awaitingMeeple: false,
    meepleSpots: null,     // 配置可能な地形の目印 [{idx,type,label}]
    meepleHover: -1,
    view: { ox: 0, oy: 0, size: 72 },
    hover: null,
    legalCache: null,
    colorById: {}, speed: 700, difficulty: 'normal'
  };

  // render.js から参照される
  window.Game = { playerColor: function (id) { return G.colorById[id] || '#e53e3e'; } };

  var $ = function (id) { return document.getElementById(id); };
  var canvas, ctx, prevCanvas, prevCtx;

  // 致命的エラーを画面上部に赤帯で表示（無反応で気づけない事態を防ぐ）
  function showFatal(msg) {
    var d = document.getElementById('fatal-error');
    if (!d) {
      d = document.createElement('div');
      d.id = 'fatal-error';
      d.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#b23b2e;color:#fff;' +
        'padding:10px 14px;font-size:13px;z-index:9999;white-space:pre-wrap;box-shadow:0 2px 8px rgba(0,0,0,.4)';
      document.body.appendChild(d);
    }
    d.textContent = '⚠ ' + msg;
  }

  // ----- セットアップ -----
  function buildSeatRows() {
    var n = parseInt($('player-count').value, 10);
    var wrap = $('seat-list');
    wrap.innerHTML = '';
    for (var i = 0; i < n; i++) {
      var row = document.createElement('div');
      row.className = 'seat-row';
      row.innerHTML =
        '<span class="seat-chip" style="background:' + PLAYER_COLORS[i] + '"></span>' +
        '<span class="seat-name">' + COLOR_NAMES[i] + '</span>' +
        '<select class="seat-type" data-i="' + i + '">' +
        '<option value="human">人間</option>' +
        '<option value="cpu"' + (i === 0 ? '' : ' selected') + '>CPU</option>' +
        '</select>';
      wrap.appendChild(row);
    }
  }

  function startGame() {
    try {
      startGameImpl();
    } catch (e) {
      showFatal('対局開始でエラー: ' + (e && e.message ? e.message : e));
      if (window.console) console.error(e);
    }
  }

  function startGameImpl() {
    if (typeof Tiles === 'undefined' || typeof Engine === 'undefined' ||
      typeof Render === 'undefined' || typeof AI === 'undefined') {
      throw new Error('スクリプト(js/*.js)が読み込めていません。ページを再読み込み（Ctrl+Shift+R）してください。');
    }
    var n = parseInt($('player-count').value, 10);
    var types = Array.prototype.map.call(document.querySelectorAll('.seat-type'), function (s) { return s.value; });
    G.players = [];
    G.colorById = {};
    for (var i = 0; i < n; i++) {
      var id = 'P' + (i + 1);
      G.players.push({ id: id, name: COLOR_NAMES[i], type: types[i], color: PLAYER_COLORS[i] });
      G.colorById[id] = PLAYER_COLORS[i];
    }
    G.difficulty = $('difficulty').value;
    G.speed = parseInt($('speed').value, 10);

    G.board = new Engine.Board();
    G.board.initPlayers(G.players.map(function (p) { return p.id; }));
    G.deck = shuffle(Tiles.buildDeck());
    G.board.placeStart(0, 0, Tiles.startTileType(), 0);
    G.turnIndex = 0; G.started = true; G.gameOver = false;
    G.placed = null; G.awaitingMeeple = false; G.currentRot = 0;

    $('setup').classList.add('hidden');
    $('game').classList.remove('hidden');
    $('result').classList.add('hidden');

    G.needCenter = true;
    resizeCanvas();
    renderScoreboard();
    clearLog();
    log('ゲーム開始！');
    startTurn();
  }

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ----- ターン進行 -----
  function startTurn() {
    if (G.deck.length === 0) return endGame();
    // 置けるタイルが出るまで引く
    var guard = 0;
    while (G.deck.length > 0 && guard < 200) {
      G.currentType = G.deck.pop();
      G.currentRot = 0;
      G.legalCache = G.board.legalPlacements(G.currentType);
      if (G.legalCache.length > 0) break;
      log('「' + G.currentType + '」はどこにも置けないため山に戻して引き直し');
      guard++;
      G.currentType = null;
    }
    if (!G.currentType) return endGame();

    G.placed = null; G.awaitingMeeple = false;
    updateTurnInfo();
    drawPreview();
    hideMeepleControls();
    render();

    var player = current();
    if (player.type === 'cpu') {
      setTimeout(cpuTurn, Math.max(250, G.speed));
    }
  }

  function current() { return G.players[G.turnIndex]; }

  function cpuTurn() {
    if (!G.started || G.gameOver) return;
    var player = current();
    var move = AI.chooseMove(G.board, G.currentType, player.id, { difficulty: G.difficulty });
    if (!move) { return finishTurn(null); }
    G.currentRot = move.rot;
    G.board.place(move.x, move.y, G.currentType, move.rot);
    G.placed = { x: move.x, y: move.y };
    centerOn(move.x, move.y, true);
    render();
    var doMeeple = function () {
      if (move.meepleIdx !== null && move.meepleIdx !== undefined &&
        G.board.meeplesLeft[player.id] > 0 &&
        G.board.featureClaimable(move.x, move.y, move.meepleIdx)) {
        G.board.placeMeeple(move.x, move.y, move.meepleIdx, player.id);
        render();
      }
      setTimeout(function () { finishTurn({ x: move.x, y: move.y }); }, Math.max(200, G.speed * 0.5));
    };
    setTimeout(doMeeple, Math.max(200, G.speed * 0.5));
  }

  function finishTurn(pos) {
    if (pos) {
      var entries = G.board.resolveScoring(pos.x, pos.y);
      entries.forEach(function (e) {
        var who = e.winners.map(function (w) { return nameOf(w); }).join('・');
        log(who + ' が' + e.label + 'を完成 → +' + e.points + '点');
      });
    }
    renderScoreboard();
    G.placed = null; G.awaitingMeeple = false; G.meepleSpots = null; G.meepleHover = -1;
    hideMeepleControls();
    G.turnIndex = (G.turnIndex + 1) % G.players.length;
    render();
    startTurn();
  }

  // ----- 人間の操作 -----
  function onCanvasClick(cellX, cellY) {
    if (G.gameOver || G.placed) return;
    if (current().type !== 'human') return;
    if (!G.board.canPlace(cellX, cellY, G.currentType, G.currentRot)) return;
    G.board.place(cellX, cellY, G.currentType, G.currentRot);
    G.placed = { x: cellX, y: cellY };
    render();
    promptMeeple(cellX, cellY);
  }

  function promptMeeple(x, y) {
    var player = current();
    var opts = G.board.meepleOptions(x, y, player.id);
    var box = $('meeple-controls');
    box.innerHTML = '';
    if (opts.length === 0 || G.board.meeplesLeft[player.id] <= 0) {
      // 置けるものが無ければ即確定
      finishTurn({ x: x, y: y });
      return;
    }
    G.awaitingMeeple = true;
    G.meepleSpots = opts.map(function (o) { return { idx: o.idx, type: o.type, label: o.label }; });
    G.meepleHover = -1;
    centerOn(x, y, false); // 置いたタイルを中央に寄せて目印を押しやすく
    var title = document.createElement('div');
    title.className = 'meeple-title';
    title.textContent = '光っている地形をタッチしてミープルを配置（残り ' + G.board.meeplesLeft[player.id] + '）';
    box.appendChild(title);
    // 念のためボタンでも選べるように（地形名）
    G.meepleSpots.forEach(function (sp) {
      var b = document.createElement('button');
      b.textContent = sp.label;
      b.onclick = function () { placeMeepleAndFinish(sp.idx); };
      box.appendChild(b);
    });
    var skip = document.createElement('button');
    skip.className = 'skip';
    skip.textContent = '置かない';
    skip.onclick = function () { finishTurn({ x: x, y: y }); };
    box.appendChild(skip);
    box.classList.remove('hidden');
    render();
  }

  function placeMeepleAndFinish(idx) {
    if (!G.placed) return;
    G.board.placeMeeple(G.placed.x, G.placed.y, idx, current().id);
    render();
    finishTurn({ x: G.placed.x, y: G.placed.y });
  }

  // ミープル目印のスクリーン座標
  function spotScreenPos(spot) {
    var t = G.placed, s = G.view.size;
    var f = G.board.get(t.x, t.y).features[spot.idx];
    return Render.meeplePos(f, G.view.ox + t.x * s, G.view.oy + t.y * s, s);
  }

  function hideMeepleControls() {
    var box = $('meeple-controls');
    box.classList.add('hidden');
    box.innerHTML = '';
  }

  function rotateCurrent() {
    if (G.placed || current().type !== 'human') return;
    G.currentRot = (G.currentRot + 1) % 4;
    drawPreview();
    render();
  }

  // ----- 描画 -----
  function makeTileObj(type, rot) {
    return {
      type: type, rot: rot,
      edges: Tiles.rotateEdges(Tiles.TILE_DEFS[type].edges, rot),
      features: Tiles.buildFeatures(type, rot),
      monastery: Tiles.TILE_DEFS[type].monastery || false,
      meeples: {}
    };
  }

  function resizeCanvas() {
    var wrap = $('board-wrap');
    var w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) {
      // レイアウト未確定。次フレームで再試行
      if (window.requestAnimationFrame) requestAnimationFrame(resizeCanvas);
      return;
    }
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (G.needCenter) { centerView(); G.needCenter = false; }
    render();
  }

  function centerView() {
    G.view.ox = canvas.width / 2 - G.view.size / 2;
    G.view.oy = canvas.height / 2 - G.view.size / 2;
  }

  function centerOn(cx, cy, smooth) {
    G.view.ox = canvas.width / 2 - (cx + 0.5) * G.view.size;
    G.view.oy = canvas.height / 2 - (cy + 0.5) * G.view.size;
  }

  function render() {
    if (!ctx || !G.board) return;
    ctx.fillStyle = '#cfe3c8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    var s = G.view.size;

    // 既存タイル
    for (var k in G.board.tiles) {
      var t = G.board.tiles[k];
      Render.drawTile(ctx, G.view.ox + t.x * s, G.view.oy + t.y * s, s, t);
    }

    // 人間の手番: 合法マスのハイライト＋ゴースト
    if (G.legalCache && !G.placed && !G.gameOver && current() && current().type === 'human') {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      G.legalCache.forEach(function (p) {
        ctx.fillRect(G.view.ox + p.x * s, G.view.oy + p.y * s, s, s);
      });
      // 現在の回転で置けるマスを濃く
      ctx.fillStyle = 'rgba(43,108,176,0.18)';
      uniqueCells().forEach(function (c) {
        if (G.board.canPlace(c[0], c[1], G.currentType, G.currentRot)) {
          ctx.fillRect(G.view.ox + c[0] * s, G.view.oy + c[1] * s, s, s);
        }
      });
      ctx.restore();

      if (G.hover && G.board.canPlace(G.hover[0], G.hover[1], G.currentType, G.currentRot)) {
        ctx.save();
        ctx.globalAlpha = 0.65;
        Render.drawTile(ctx, G.view.ox + G.hover[0] * s, G.view.oy + G.hover[1] * s, s, makeTileObj(G.currentType, G.currentRot));
        ctx.restore();
      }
    }

    // ミープル配置中: 置ける地形に目印＋選択中の領域をハイライト
    if (G.awaitingMeeple && G.meepleSpots && current() && G.placed) {
      var t = G.placed;
      var tox = G.view.ox + t.x * s, toy = G.view.oy + t.y * s;
      var tile = G.board.get(t.x, t.y);
      // ホバー中の地形の領域を光らせる（どの城かを区別）
      if (G.meepleHover >= 0 && G.meepleSpots[G.meepleHover]) {
        ctx.save();
        ctx.beginPath(); ctx.rect(tox, toy, s, s); ctx.clip(); // タイル内に限定
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = '#fff34d';
        Render.fillFeatureRegion(ctx, tile.features[G.meepleSpots[G.meepleHover].idx], tox, toy, s);
        ctx.restore();
      }
      G.meepleSpots.forEach(function (spot, i) {
        var p = spotScreenPos(spot);
        var hovered = (G.meepleHover === i);
        var r = s * 0.2 * (hovered ? 1.2 : 1);
        ctx.save();
        ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
        ctx.lineWidth = Math.max(2, s * (hovered ? 0.06 : 0.045));
        ctx.strokeStyle = current().color; ctx.stroke();
        Render.drawMeeple(ctx, p[0], p[1], s * 0.13, current().color, spot.type === 'field');
        ctx.restore();
      });
    }
  }

  function uniqueCells() {
    var seen = {}, out = [];
    G.legalCache.forEach(function (p) {
      var kk = p.x + ',' + p.y;
      if (!seen[kk]) { seen[kk] = 1; out.push([p.x, p.y]); }
    });
    return out;
  }

  function drawPreview() {
    if (!prevCtx) return;
    var s = 96, pad = (prevCanvas.width - s) / 2;
    prevCtx.clearRect(0, 0, prevCanvas.width, prevCanvas.height);
    Render.drawTile(prevCtx, pad, pad, s, makeTileObj(G.currentType, G.currentRot));
  }

  function updateTurnInfo() {
    var p = current();
    $('turn-info').innerHTML = '<span class="dot" style="background:' + p.color + '"></span>' +
      p.name + ' の番（' + (p.type === 'cpu' ? 'CPU' : 'あなた') + '）';
    $('deck-count').textContent = '残りタイル: ' + G.deck.length;
    $('rotate-btn').disabled = (p.type !== 'human');
  }

  function renderScoreboard() {
    var box = $('scoreboard');
    box.innerHTML = '';
    G.players.forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'score-row';
      row.innerHTML = '<span class="dot" style="background:' + p.color + '"></span>' +
        '<span class="sc-name">' + p.name + '</span>' +
        '<span class="sc-meeple">👤×' + G.board.meeplesLeft[p.id] + '</span>' +
        '<span class="sc-pts">' + G.board.scores[p.id] + '</span>';
      box.appendChild(row);
    });
  }

  function nameOf(id) {
    var p = G.players.filter(function (x) { return x.id === id; })[0];
    return p ? p.name : id;
  }

  function log(msg) {
    var el = $('log');
    var line = document.createElement('div');
    line.textContent = msg;
    el.insertBefore(line, el.firstChild);
  }
  function clearLog() { $('log').innerHTML = ''; }

  function endGame() {
    G.gameOver = true;
    var entries = G.board.finalScoring();
    entries.forEach(function (e) {
      var who = e.winners.map(function (w) { return nameOf(w); }).join('・');
      log('【終了処理】' + who + ' が' + e.label + ' → +' + e.points + '点');
    });
    renderScoreboard();
    render();
    showResult();
  }

  function showResult() {
    var ranked = G.players.slice().sort(function (a, b) { return G.board.scores[b.id] - G.board.scores[a.id]; });
    var box = $('result-body');
    box.innerHTML = '';
    ranked.forEach(function (p, i) {
      var row = document.createElement('div');
      row.className = 'result-row' + (i === 0 ? ' winner' : '');
      row.innerHTML = (i === 0 ? '👑 ' : (i + 1) + '位 ') +
        '<span class="dot" style="background:' + p.color + '"></span>' + p.name +
        ' — <b>' + G.board.scores[p.id] + '</b> 点';
      box.appendChild(row);
    });
    $('result').classList.remove('hidden');
  }

  // ----- 入力（パン・クリック・ホバー） -----
  // ミープル配置中、座標(mx,my)が指す「置ける地形」の spot index（無ければ-1）
  // まず地形領域で判定（押した城そのもの）、外れたら最寄りの目印
  function spotAt(mx, my) {
    if (!G.awaitingMeeple || !G.meepleSpots || !G.placed) return -1;
    var t = G.placed, s = G.view.size;
    var tox = G.view.ox + t.x * s, toy = G.view.oy + t.y * s;
    // タイル内なら領域判定
    if (mx >= tox && mx <= tox + s && my >= toy && my <= toy + s) {
      var idx = Render.featureAt(G.board.get(t.x, t.y), mx, my, tox, toy, s);
      for (var k = 0; k < G.meepleSpots.length; k++) if (G.meepleSpots[k].idx === idx) return k;
    }
    // 最寄りの目印（タイル外をタップした場合など）
    var best = -1, bestD = Infinity;
    for (var i = 0; i < G.meepleSpots.length; i++) {
      var p = spotScreenPos(G.meepleSpots[i]);
      var d = (p[0] - mx) * (p[0] - mx) + (p[1] - my) * (p[1] - my);
      if (d < bestD) { bestD = d; best = i; }
    }
    var rad = G.view.size * 0.4;
    return (best >= 0 && bestD <= rad * rad) ? best : -1;
  }

  // タップ/クリック処理（盤の配置 or ミープルの選択）
  function handleTap(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var mx = clientX - rect.left, my = clientY - rect.top;
    if (mx < 0 || my < 0 || mx > canvas.width || my > canvas.height) return;
    if (G.awaitingMeeple) {
      var i = spotAt(mx, my);
      if (i >= 0) placeMeepleAndFinish(G.meepleSpots[i].idx);
      return;
    }
    var cx = Math.floor((mx - G.view.ox) / G.view.size);
    var cy = Math.floor((my - G.view.oy) / G.view.size);
    onCanvasClick(cx, cy);
  }

  function setupInput() {
    var dragging = false, moved = false, sx = 0, sy = 0, startOx = 0, startOy = 0;

    canvas.addEventListener('mousedown', function (e) {
      dragging = true; moved = false;
      sx = e.clientX; sy = e.clientY; startOx = G.view.ox; startOy = G.view.oy;
    });
    window.addEventListener('mousemove', function (e) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left, my = e.clientY - rect.top;
      if (dragging) {
        var dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        G.view.ox = startOx + dx; G.view.oy = startOy + dy;
        render();
      } else if (G.awaitingMeeple) {
        var hv = spotAt(mx, my);
        if (G.meepleHover !== hv) { G.meepleHover = hv; render(); }
      } else {
        var cx = Math.floor((mx - G.view.ox) / G.view.size);
        var cy = Math.floor((my - G.view.oy) / G.view.size);
        if (!G.hover || G.hover[0] !== cx || G.hover[1] !== cy) { G.hover = [cx, cy]; render(); }
      }
    });
    window.addEventListener('mouseup', function (e) {
      if (!dragging) return;
      dragging = false;
      if (!moved) handleTap(e.clientX, e.clientY);
    });

    // タッチ操作
    canvas.addEventListener('touchstart', function (e) {
      var t = e.touches[0]; dragging = true; moved = false;
      sx = t.clientX; sy = t.clientY; startOx = G.view.ox; startOy = G.view.oy;
    }, { passive: true });
    canvas.addEventListener('touchmove', function (e) {
      if (!dragging) return;
      var t = e.touches[0];
      var dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      G.view.ox = startOx + dx; G.view.oy = startOy + dy;
      render();
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchend', function (e) {
      if (!dragging) return;
      dragging = false;
      if (!moved) { var t = e.changedTouches[0]; handleTap(t.clientX, t.clientY); }
    }, { passive: true });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left, my = e.clientY - rect.top;
      var old = G.view.size;
      var ns = Math.max(36, Math.min(120, old * (e.deltaY < 0 ? 1.1 : 0.9)));
      // マウス位置を中心にズーム
      G.view.ox = mx - (mx - G.view.ox) * ns / old;
      G.view.oy = my - (my - G.view.oy) * ns / old;
      G.view.size = ns;
      render();
    }, { passive: false });
  }

  // ----- 初期化 -----
  // 想定外のエラーも画面に出す
  window.addEventListener('error', function (e) {
    showFatal((e.message || 'スクリプトエラー') + ' (' + (e.filename || '').split('/').pop() + ':' + e.lineno + ')');
  });

  window.addEventListener('DOMContentLoaded', function () {
    canvas = $('board'); ctx = canvas.getContext('2d');
    prevCanvas = $('preview'); prevCtx = prevCanvas.getContext('2d');

    $('player-count').addEventListener('change', buildSeatRows);
    $('start-btn').addEventListener('click', startGame);
    $('rotate-btn').addEventListener('click', rotateCurrent);
    $('recenter-btn').addEventListener('click', function () { centerView(); render(); });
    $('again-btn').addEventListener('click', function () {
      $('result').classList.add('hidden');
      $('game').classList.add('hidden');
      $('setup').classList.remove('hidden');
      G.started = false;
    });
    window.addEventListener('resize', function () { if (G.started) resizeCanvas(); });
    // コンテナのサイズ変化を監視（表示直後のレイアウト確定にも対応）
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { if (G.started) resizeCanvas(); });
      ro.observe($('board-wrap'));
    }

    buildSeatRows();
    setupInput();

    // キーボードでも回転（R）
    window.addEventListener('keydown', function (e) {
      if ((e.key === 'r' || e.key === 'R') && G.started) rotateCurrent();
    });
  });
})();
