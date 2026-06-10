// tiles.js - 牌の定義とユーティリティ
// 牌は 0..33 の「種類インデックス」で表す
//   0-8  : 1m..9m (萬子)
//   9-17 : 1p..9p (筒子)
//   18-26: 1s..9s (索子)
//   27   : 東 28: 南 29: 西 30: 北
//   31   : 白 32: 發 33: 中
// 赤ドラ（赤5）は別ID: 34=赤5m, 35=赤5p, 36=赤5s（base()で基準種別4/13/22に戻る）

const Tiles = (() => {
  const SUIT_NAMES = ['m', 'p', 's'];
  const HONOR_NAMES = ['東', '南', '西', '北', '白', '發', '中'];
  const RED_BASE = [4, 13, 22]; // 34->4(5m), 35->13(5p), 36->22(5s)

  function base(t) { return t < 34 ? t : RED_BASE[t - 34]; }
  function isRed(t) { return t >= 34; }
  function redIdOf(b) { const i = RED_BASE.indexOf(b); return i < 0 ? b : 34 + i; }

  // Unicode 麻雀牌グリフ
  function glyph(t) {
    t = base(t);
    if (t < 9)  return String.fromCodePoint(0x1F007 + t);        // 萬子
    if (t < 18) return String.fromCodePoint(0x1F019 + (t - 9));  // 筒子
    if (t < 27) return String.fromCodePoint(0x1F010 + (t - 18)); // 索子
    const honor = [0x1F000, 0x1F001, 0x1F002, 0x1F003, 0x1F006, 0x1F005, 0x1F004];
    return String.fromCodePoint(honor[t - 27]);
  }

  function name(t) {
    t = base(t);
    if (t < 27) return (t % 9 + 1) + SUIT_NAMES[Math.floor(t / 9)];
    return HONOR_NAMES[t - 27];
  }

  function isHonor(t) { t = base(t); return t >= 27; }
  function isTerminal(t) { t = base(t); return t < 27 && (t % 9 === 0 || t % 9 === 8); }
  function isYaochu(t) { return isHonor(t) || isTerminal(t); }
  function isWind(t) { t = base(t); return t >= 27 && t <= 30; }
  function isDragon(t) { t = base(t); return t >= 31 && t <= 33; }
  function suitOf(t) { t = base(t); return t < 27 ? Math.floor(t / 9) : 3; }
  function numOf(t) { t = base(t); return t < 27 ? (t % 9 + 1) : 0; }

  // ドラ表示牌 -> ドラ本体
  function doraNext(t) {
    t = base(t);
    if (t < 27) {
      const b = Math.floor(t / 9) * 9;
      return b + ((t - b + 1) % 9);
    }
    if (t <= 30) return 27 + ((t - 27 + 1) % 4); // 風: 東南西北→東
    return 31 + ((t - 31 + 1) % 3);              // 三元: 白發中→白
  }

  // 山を作る（136枚、各種4枚 + 赤5を各色1枚）
  function buildWall() {
    const wall = [];
    for (let t = 0; t < 34; t++) for (let i = 0; i < 4; i++) wall.push(t);
    for (const b of RED_BASE) wall[wall.indexOf(b)] = redIdOf(b); // 各色5の1枚を赤に
    return wall;
  }

  // 配列を 基準種別 のカウント(length 34)へ（赤牌も基準種別で数える）
  function toCounts(tiles) {
    const c = new Array(34).fill(0);
    for (const t of tiles) c[base(t)]++;
    return c;
  }

  function shuffle(arr, rng = Math.random) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // 手牌ソート用（基準種別順、赤は同種別の隣）
  function sortTiles(tiles) {
    return tiles.slice().sort((a, b) => (base(a) - base(b)) || (a - b));
  }

  return {
    glyph, name, isHonor, isTerminal, isYaochu, isWind, isDragon,
    suitOf, numOf, doraNext, buildWall, toCounts, shuffle, sortTiles,
    base, isRed, redIdOf, HONOR_NAMES
  };
})();
