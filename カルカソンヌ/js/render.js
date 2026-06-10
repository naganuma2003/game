/* render.js — タイルとミープルを canvas に手続き的に描画する */
(function (root) {
  'use strict';

  var COL = {
    field: '#86c443',
    cityFill: '#c9a86a',
    cityTop: '#ddc290',
    cityEdge: '#6e5325',
    cityBrick: 'rgba(95,72,33,0.45)',
    crenel: '#7d5f2e',
    road: '#efe9d8',
    roadEdge: '#8d8a7a',
    monRoof: '#b23b2e',
    monWall: '#f3ead2',
    border: '#5d4b2a'
  };

  // 辺の中点
  function edgePt(d, ox, oy, s) {
    switch (d) {
      case 0: return [ox + s / 2, oy];
      case 1: return [ox + s, oy + s / 2];
      case 2: return [ox + s / 2, oy + s];
      case 3: return [ox, oy + s / 2];
    }
  }

  // ハーフ辺(0..7)→タイル外周上の点（相対比率→絶対座標）
  var HALF_REL = [
    [0.30, 0], [0.70, 0], [1, 0.30], [1, 0.70],
    [0.70, 1], [0.30, 1], [0, 0.70], [0, 0.30]
  ];
  function halfPt(h, ox, oy, s) { return [ox + HALF_REL[h][0] * s, oy + HALF_REL[h][1] * s]; }

  // ---- 都市（城）----
  function cityRects(f, ox, oy, s) {
    var depth = s * 0.46, rects = [];
    f.edges.forEach(function (d) {
      if (d === 0) rects.push([ox, oy, s, depth]);
      else if (d === 1) rects.push([ox + s - depth, oy, depth, s]);
      else if (d === 2) rects.push([ox, oy + s - depth, s, depth]);
      else rects.push([ox, oy, depth, s]);
    });
    // 連結都市(辺2つ以上)は中央も塗ってひとつながりに
    if (f.edges.length >= 2) rects.push([ox + s * 0.27, oy + s * 0.27, s * 0.46, s * 0.46]);
    return rects;
  }

  function drawCrenel(ctx, d, ox, oy, s) {
    var n = 3, mw = s * 0.13, mh = s * 0.08, gap = (s - n * mw) / (n + 1);
    ctx.fillStyle = COL.crenel;
    for (var i = 0; i < n; i++) {
      var off = gap + i * (mw + gap);
      if (d === 0) ctx.fillRect(ox + off, oy, mw, mh);
      else if (d === 2) ctx.fillRect(ox + off, oy + s - mh, mw, mh);
      else if (d === 1) ctx.fillRect(ox + s - mh, oy + off, mh, mw);
      else ctx.fillRect(ox, oy + off, mh, mw);
    }
  }

  // 赤屋根の家（都市の中身）
  function drawHouse(ctx, cx, cy, w, blueRoof) {
    var h = w * 1.0;
    // 壁
    ctx.fillStyle = '#efe6cf';
    ctx.fillRect(cx - w / 2, cy - h * 0.05, w, h * 0.55);
    ctx.strokeStyle = 'rgba(110,83,37,0.5)'; ctx.lineWidth = Math.max(0.5, w * 0.06);
    ctx.strokeRect(cx - w / 2, cy - h * 0.05, w, h * 0.55);
    // 屋根
    ctx.fillStyle = blueRoof ? '#5d6f8c' : '#bb3b2c';
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.62, cy - h * 0.03);
    ctx.lineTo(cx, cy - h * 0.55);
    ctx.lineTo(cx + w * 0.62, cy - h * 0.03);
    ctx.closePath(); ctx.fill();
  }

  // 都市の塗り範囲に家を敷き詰める
  function drawHouses(ctx, rects, s) {
    var hw = s * 0.17;
    rects.forEach(function (r, ri) {
      var horiz = r[2] >= r[3];
      var span = horiz ? r[2] : r[3];
      var n = Math.max(1, Math.min(3, Math.floor(span / (s * 0.26))));
      for (var i = 0; i < n; i++) {
        var t = (i + 1) / (n + 1);
        var hx = horiz ? (r[0] + t * r[2]) : (r[0] + r[2] * 0.5);
        var hy = horiz ? (r[1] + r[3] * 0.58) : (r[1] + t * r[3]);
        drawHouse(ctx, hx, hy, hw, (ri + i) % 3 === 1);
      }
    });
  }

  // ---- 1辺だけの都市は角を草原に残したV字（くさび形）で描く ----
  function wedgePoly(d, ox, oy, s) {
    var cx = ox + s / 2, cy = oy + s / 2, ow = s * 0.34, iw = s * 0.20, dp = s * 0.42;
    if (d === 0) return [[cx - ow, oy], [cx + ow, oy], [cx + iw, oy + dp], [cx - iw, oy + dp]];
    if (d === 1) return [[ox + s, cy - ow], [ox + s, cy + ow], [ox + s - dp, cy + iw], [ox + s - dp, cy - iw]];
    if (d === 2) return [[cx + ow, oy + s], [cx - ow, oy + s], [cx - iw, oy + s - dp], [cx + iw, oy + s - dp]];
    return [[ox, cy + ow], [ox, cy - ow], [ox + dp, cy - iw], [ox + dp, cy + iw]];
  }
  function pathPoly(ctx, pts) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }
  function crenelSpan(ctx, d, ox, oy, s) {
    var cx = ox + s / 2, cy = oy + s / 2, ow = s * 0.34, n = 3, mw = s * 0.12, mh = s * 0.08;
    ctx.fillStyle = COL.crenel;
    for (var i = 0; i < n; i++) {
      var t = (i + 0.5) / n, p = (cx - ow) + 2 * ow * t, q = (cy - ow) + 2 * ow * t;
      if (d === 0) ctx.fillRect(p - mw / 2, oy, mw, mh);
      else if (d === 2) ctx.fillRect(p - mw / 2, oy + s - mh, mw, mh);
      else if (d === 1) ctx.fillRect(ox + s - mh, q - mw / 2, mh, mw);
      else ctx.fillRect(ox, q - mw / 2, mh, mw);
    }
  }
  function wedgeCentroid(d, ox, oy, s) {
    var cx = ox + s / 2, cy = oy + s / 2, k = s * 0.26;
    if (d === 0) return [cx, oy + k];
    if (d === 1) return [ox + s - k, cy];
    if (d === 2) return [cx, oy + s - k];
    return [ox + k, cy];
  }
  function drawWedgeCity(ctx, d, ox, oy, s) {
    var pts = wedgePoly(d, ox, oy, s);
    ctx.fillStyle = COL.cityFill; pathPoly(ctx, pts); ctx.fill();
    ctx.save(); pathPoly(ctx, pts); ctx.clip();
    ctx.fillStyle = COL.cityTop;
    var hb = s * 0.07;
    if (d === 0) ctx.fillRect(ox, oy, s, hb);
    else if (d === 2) ctx.fillRect(ox, oy + s - hb, s, hb);
    else if (d === 1) ctx.fillRect(ox + s - hb, oy, hb, s);
    else ctx.fillRect(ox, oy, hb, s);
    if (s >= 40) { var c = wedgeCentroid(d, ox, oy, s); drawHouse(ctx, c[0], c[1], s * 0.18, false); }
    ctx.restore();
    crenelSpan(ctx, d, ox, oy, s);
    ctx.strokeStyle = COL.cityEdge; ctx.lineWidth = Math.max(1, s * 0.025);
    pathPoly(ctx, pts); ctx.stroke();
  }

  // 向かい合う2辺が連結した都市＝砂時計型（中央がくびれる）
  function opposite(e) { return (e[0] + 2) % 4 === e[1]; }
  function hourglassPoly(e, ox, oy, s) {
    var cx = ox + s / 2, cy = oy + s / 2, ow = s * 0.34, iw = s * 0.12;
    if (e.indexOf(1) >= 0) { // 左右(E-W)
      return [[ox + s, cy - ow], [cx, cy - iw], [ox, cy - ow], [ox, cy + ow], [cx, cy + iw], [ox + s, cy + ow]];
    }
    return [[cx - ow, oy], [cx - iw, cy], [cx - ow, oy + s], [cx + ow, oy + s], [cx + iw, cy], [cx + ow, oy]];
  }
  function drawHourglassCity(ctx, e, ox, oy, s) {
    var pts = hourglassPoly(e, ox, oy, s);
    ctx.fillStyle = COL.cityFill; pathPoly(ctx, pts); ctx.fill();
    ctx.save(); pathPoly(ctx, pts); ctx.clip();
    ctx.fillStyle = COL.cityTop; var hb = s * 0.07;
    e.forEach(function (d) {
      if (d === 0) ctx.fillRect(ox, oy, s, hb);
      else if (d === 2) ctx.fillRect(ox, oy + s - hb, s, hb);
      else if (d === 1) ctx.fillRect(ox + s - hb, oy, hb, s);
      else ctx.fillRect(ox, oy, hb, s);
    });
    if (s >= 40) e.forEach(function (d) { var c = wedgeCentroid(d, ox, oy, s); drawHouse(ctx, c[0], c[1], s * 0.16, false); });
    ctx.restore();
    e.forEach(function (d) { crenelSpan(ctx, d, ox, oy, s); });
    ctx.strokeStyle = COL.cityEdge; ctx.lineWidth = Math.max(1, s * 0.025);
    pathPoly(ctx, pts); ctx.stroke();
  }

  // 青い盾（紋章）
  function drawShield(ctx, px, py, s) {
    ctx.fillStyle = '#2b6cb0';
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, s * 0.02);
    ctx.beginPath();
    ctx.moveTo(px - s * 0.09, py - s * 0.09);
    ctx.lineTo(px + s * 0.09, py - s * 0.09);
    ctx.lineTo(px + s * 0.09, py + s * 0.02);
    ctx.lineTo(px, py + s * 0.12);
    ctx.lineTo(px - s * 0.09, py + s * 0.02);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  // 紋章の位置（角の都市・3辺都市は角に寄せる）
  function pennantPos(e, ox, oy, s) {
    var cx = ox + s / 2, cy = oy + s / 2;
    var hasN = e.indexOf(0) >= 0, hasE = e.indexOf(1) >= 0, hasS = e.indexOf(2) >= 0, hasW = e.indexOf(3) >= 0;
    if (e.length === 2 && !opposite(e)) { // 角の都市 → 2辺の接する角へ
      return [hasW ? ox + s * 0.26 : ox + s * 0.74, hasN ? oy + s * 0.26 : oy + s * 0.74];
    }
    if (e.length === 3) { // 3辺都市 → 角へ
      var x = !hasE ? ox + s * 0.26 : !hasW ? ox + s * 0.74 : ox + s * 0.26;
      var y = !hasS ? oy + s * 0.26 : !hasN ? oy + s * 0.74 : oy + s * 0.26;
      return [x, y];
    }
    return [cx, cy]; // 4辺・砂時計は中央
  }
  function drawPennant(ctx, f, ox, oy, s) {
    if (!f.pennant) return;
    var p = pennantPos(f.edges, ox, oy, s);
    drawShield(ctx, p[0], p[1], s);
  }

  // 3辺都市：開いた辺から中央へ立ち上がる草原のV字
  function openEdge(e) { for (var d = 0; d < 4; d++) if (e.indexOf(d) < 0) return d; return 2; }
  function fieldVPoly(open, ox, oy, s) {
    var cx = ox + s / 2, cy = oy + s / 2, hw = s * 0.30, dp = s * 0.58;
    if (open === 2) return [[cx - hw, oy + s], [cx + hw, oy + s], [cx, oy + s - dp]];
    if (open === 0) return [[cx - hw, oy], [cx + hw, oy], [cx, oy + dp]];
    if (open === 1) return [[ox + s, cy - hw], [ox + s, cy + hw], [ox + s - dp, cy]];
    return [[ox, cy - hw], [ox, cy + hw], [ox + dp, cy]];
  }
  function drawThreeSideCity(ctx, f, ox, oy, s) {
    var e = f.edges, open = openEdge(e);
    // 全面を都市で塗る
    ctx.fillStyle = COL.cityFill; ctx.fillRect(ox, oy, s, s);
    // 各都市辺の上端ハイライト
    ctx.fillStyle = COL.cityTop; var hb = s * 0.06;
    e.forEach(function (d) {
      if (d === 0) ctx.fillRect(ox, oy, s, hb);
      else if (d === 2) ctx.fillRect(ox, oy + s - hb, s, hb);
      else if (d === 1) ctx.fillRect(ox + s - hb, oy, hb, s);
      else ctx.fillRect(ox, oy, hb, s);
    });
    if (s >= 40) drawHouses(ctx, cityRects(f, ox, oy, s), s);
    // 草原のV字（開いた辺から中央へ）
    var vp = fieldVPoly(open, ox, oy, s);
    ctx.fillStyle = COL.field; pathPoly(ctx, vp); ctx.fill();
    // 胸壁（3辺）＋ V字の城壁ライン
    e.forEach(function (d) { drawCrenel(ctx, d, ox, oy, s); });
    ctx.strokeStyle = COL.cityEdge; ctx.lineWidth = Math.max(1, s * 0.025);
    pathPoly(ctx, vp); ctx.stroke();
    drawPennant(ctx, f, ox, oy, s);
  }

  function drawCity(ctx, f, ox, oy, s) {
    var e = f.edges;
    // 1辺だけの都市は V字（角は草原のまま）
    if (e.length === 1) { drawWedgeCity(ctx, e[0], ox, oy, s); return; }
    // 向かい合う2辺の連結都市は砂時計型
    if (e.length === 2 && opposite(e)) { drawHourglassCity(ctx, e, ox, oy, s); drawPennant(ctx, f, ox, oy, s); return; }
    // 3辺都市は草原V字
    if (e.length === 3) { drawThreeSideCity(ctx, f, ox, oy, s); return; }
    // それ以外（角の2辺・3辺・4辺）は従来どおり
    var rects = cityRects(f, ox, oy, s);
    ctx.fillStyle = COL.cityFill;
    rects.forEach(function (r) { ctx.fillRect(r[0], r[1], r[2], r[3]); });
    ctx.fillStyle = COL.cityTop;
    rects.forEach(function (r) { ctx.fillRect(r[0], r[1], r[2], Math.max(2, s * 0.05)); });
    e.forEach(function (d) { drawCrenel(ctx, d, ox, oy, s); });
    if (s >= 40) drawHouses(ctx, rects, s);
    ctx.strokeStyle = COL.cityEdge;
    ctx.lineWidth = Math.max(1, s * 0.025);
    rects.forEach(function (r) { ctx.strokeRect(r[0], r[1], r[2], r[3]); });
    drawPennant(ctx, f, ox, oy, s);
  }

  function drawTile(ctx, ox, oy, s, tile) {
    // 草原
    ctx.fillStyle = COL.field;
    ctx.fillRect(ox, oy, s, s);

    // 都市（城）
    tile.features.forEach(function (f) { if (f.type === 'city') drawCity(ctx, f, ox, oy, s); });

    // 道（緑の余白 → 灰 → 白 の3層。緑層で都市との間に草原を確保）
    tile.features.forEach(function (f) {
      if (f.type !== 'road') return;
      var cx = ox + s / 2, cy = oy + s / 2;
      ctx.lineCap = 'round';
      function path() {
        if (f.edges.length === 2) {
          var a = edgePt(f.edges[0], ox, oy, s), b = edgePt(f.edges[1], ox, oy, s);
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(cx, cy); ctx.lineTo(b[0], b[1]);
        } else {
          ctx.beginPath();
          f.edges.forEach(function (d) { var p = edgePt(d, ox, oy, s); ctx.moveTo(p[0], p[1]); ctx.lineTo(cx, cy); });
        }
      }
      path(); ctx.strokeStyle = COL.field; ctx.lineWidth = s * 0.26; ctx.stroke();   // 草原の余白
      path(); ctx.strokeStyle = COL.roadEdge; ctx.lineWidth = s * 0.16; ctx.stroke(); // 道の縁
      path(); ctx.strokeStyle = COL.road; ctx.lineWidth = s * 0.1; ctx.stroke();      // 道
    });

    // 交差点の節
    var roadEnds = 0;
    tile.features.forEach(function (f) { if (f.type === 'road' && f.edges.length === 1) roadEnds++; });
    if (roadEnds >= 3) {
      ctx.fillStyle = COL.road;
      ctx.beginPath(); ctx.arc(ox + s / 2, oy + s / 2, s * 0.09, 0, Math.PI * 2); ctx.fill();
    }

    // 修道院
    if (tile.monastery) {
      var mx = ox + s / 2, my = oy + s / 2;
      ctx.fillStyle = COL.monWall;
      ctx.fillRect(mx - s * 0.14, my - s * 0.06, s * 0.28, s * 0.22);
      ctx.fillStyle = COL.monRoof;
      ctx.beginPath();
      ctx.moveTo(mx - s * 0.18, my - s * 0.06);
      ctx.lineTo(mx, my - s * 0.22);
      ctx.lineTo(mx + s * 0.18, my - s * 0.06);
      ctx.closePath(); ctx.fill();
    }

    // 枠
    ctx.strokeStyle = COL.border;
    ctx.lineWidth = Math.max(1, s * 0.02);
    ctx.strokeRect(ox + 0.5, oy + 0.5, s - 1, s - 1);

    // ミープル
    for (var idx in tile.meeples) {
      var f = tile.features[idx];
      var pos = meeplePos(f, ox, oy, s);
      var color = root.Game ? root.Game.playerColor(tile.meeples[idx]) : '#e53e3e';
      drawMeeple(ctx, pos[0], pos[1], s * 0.15, color, f.type === 'field');
    }
  }

  function meeplePos(f, ox, oy, s) {
    var cx = ox + s / 2, cy = oy + s / 2;
    if (f.type === 'monastery') return [cx, cy + s * 0.04];
    if (f.type === 'field' && f.halves && f.halves.length) {
      var sx = 0, sy = 0;
      f.halves.forEach(function (h) { var p = halfPt(h, ox, oy, s); sx += p[0]; sy += p[1]; });
      sx /= f.halves.length; sy /= f.halves.length;
      // 中心へ寄せて辺に被らないように
      return [sx + (cx - sx) * 0.45, sy + (cy - sy) * 0.45];
    }
    if (f.type === 'city' && f.edges.length === 1) {
      var p = edgePt(f.edges[0], ox, oy, s);
      return [(p[0] + cx) / 2, (p[1] + cy) / 2];
    }
    return [cx, cy];
  }

  // lying=true で寝そべったミープル（農夫）
  function drawMeeple(ctx, x, y, r, color, lying) {
    ctx.save();
    ctx.translate(x, y);
    if (lying) ctx.rotate(Math.PI / 2.2);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = r * 0.35;
    ctx.beginPath(); ctx.arc(0, -r * 0.7, r * 0.55, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.2);
    ctx.lineTo(r, r);
    ctx.lineTo(-r, r);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // ---- 当たり判定（座標→地形feature index）と領域ハイライト ----
  function pointInPoly(px, py, pts) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function distSeg(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    var t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    var qx = ax + t * dx, qy = ay + t * dy;
    return Math.sqrt((px - qx) * (px - qx) + (py - qy) * (py - qy));
  }
  function nearestHalf(px, py, ox, oy, s) {
    var best = 0, bd = Infinity;
    for (var h = 0; h < 8; h++) { var p = halfPt(h, ox, oy, s); var d = (p[0] - px) * (p[0] - px) + (p[1] - py) * (p[1] - py); if (d < bd) { bd = d; best = h; } }
    return best;
  }
  // (px,py)=スクリーン座標, tileの (ox,oy,s)。該当 feature index（無ければ-1）
  function featureAt(tile, px, py, ox, oy, s) {
    var feats = tile.features, cx = ox + s / 2, cy = oy + s / 2, i, k, f, e;
    // 修道院（中央）
    for (i = 0; i < feats.length; i++) if (feats[i].type === 'monastery' && Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy)) < s * 0.22) return i;
    // 道（線の近く）
    for (i = 0; i < feats.length; i++) {
      f = feats[i]; if (f.type !== 'road') continue;
      for (k = 0; k < f.edges.length; k++) { var p = edgePt(f.edges[k], ox, oy, s); if (distSeg(px, py, p[0], p[1], cx, cy) < s * 0.15) return i; }
    }
    // 都市（領域内）
    for (i = 0; i < feats.length; i++) {
      f = feats[i]; if (f.type !== 'city') continue; e = f.edges;
      if (e.length === 1) { if (pointInPoly(px, py, wedgePoly(e[0], ox, oy, s))) return i; }
      else if (e.length === 2 && opposite(e)) { if (pointInPoly(px, py, hourglassPoly(e, ox, oy, s))) return i; }
      else if (e.length === 3) { if (!pointInPoly(px, py, fieldVPoly(openEdge(e), ox, oy, s))) return i; }
      else { var rs = cityRects(f, ox, oy, s); for (k = 0; k < rs.length; k++) { var r = rs[k]; if (px >= r[0] && px <= r[0] + r[2] && py >= r[1] && py <= r[1] + r[3]) return i; } }
    }
    // 草原（最寄りハーフ辺を含む field）
    var h = nearestHalf(px, py, ox, oy, s);
    for (i = 0; i < feats.length; i++) { f = feats[i]; if (f.type === 'field' && f.halves && f.halves.indexOf(h) >= 0) return i; }
    for (i = 0; i < feats.length; i++) if (feats[i].type === 'field') return i;
    return -1;
  }
  // 指定featureの領域を塗る（ハイライト用、ctx.fillStyle は呼び出し側で設定）
  function fillFeatureRegion(ctx, f, ox, oy, s) {
    var cx = ox + s / 2, cy = oy + s / 2, e = f.edges;
    if (f.type === 'city') {
      if (e.length === 1) { pathPoly(ctx, wedgePoly(e[0], ox, oy, s)); ctx.fill(); }
      else if (e.length === 2 && opposite(e)) { pathPoly(ctx, hourglassPoly(e, ox, oy, s)); ctx.fill(); }
      else cityRects(f, ox, oy, s).forEach(function (r) { ctx.fillRect(r[0], r[1], r[2], r[3]); });
      return;
    }
    if (f.type === 'road') {
      ctx.lineCap = 'round'; ctx.lineWidth = s * 0.22;
      ctx.beginPath();
      if (e.length === 2) { var a = edgePt(e[0], ox, oy, s), b = edgePt(e[1], ox, oy, s); ctx.moveTo(a[0], a[1]); ctx.lineTo(cx, cy); ctx.lineTo(b[0], b[1]); }
      else e.forEach(function (d) { var p = edgePt(d, ox, oy, s); ctx.moveTo(p[0], p[1]); ctx.lineTo(cx, cy); });
      ctx.strokeStyle = ctx.fillStyle; ctx.stroke();
      return;
    }
    if (f.type === 'monastery') { ctx.beginPath(); ctx.arc(cx, cy, s * 0.22, 0, Math.PI * 2); ctx.fill(); return; }
    if (f.type === 'field' && f.halves) {
      var arr = f.halves.map(function (h) { var p = halfPt(h, ox, oy, s); return { p: p, a: Math.atan2(p[1] - cy, p[0] - cx) }; });
      arr.sort(function (u, v) { return u.a - v.a; });
      ctx.beginPath(); ctx.moveTo(cx, cy);
      arr.forEach(function (o) { ctx.lineTo(o.p[0], o.p[1]); });
      ctx.closePath(); ctx.fill();
    }
  }

  var api = {
    drawTile: drawTile, drawMeeple: drawMeeple, meeplePos: meeplePos,
    featureAt: featureAt, fillFeatureRegion: fillFeatureRegion, COL: COL
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Render = api;
})(typeof window !== 'undefined' ? window : this);
