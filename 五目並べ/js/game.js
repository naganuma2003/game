/* Gomoku UI controller. */
(function () {
  const AI = window.GomokuAI;
  const SIZE = AI.SIZE;
  const BLACK = 1, WHITE = 2;

  // Setup
  const setupEl = document.getElementById("setup");
  const gameEl = document.getElementById("game");
  const startBtn = document.getElementById("start");
  const blackLevel = document.getElementById("black-level");
  const whiteLevel = document.getElementById("white-level");

  // Game
  const boardEl = document.getElementById("board");
  const turnEl = document.getElementById("turn-indicator");
  const messageEl = document.getElementById("message");
  const labelBlackEl = document.getElementById("label-black");
  const labelWhiteEl = document.getElementById("label-white");
  const scoreBlackEl = document.getElementById("score-black");
  const scoreWhiteEl = document.getElementById("score-white");
  const undoBtn = document.getElementById("undo");
  const resetBtn = document.getElementById("reset");
  const backBtn = document.getElementById("back");
  const assistEl = document.getElementById("assist");

  const LEVEL_NAMES = { 1: "入門", 2: "やさしい", 3: "ふつう", 4: "強い" };
  const players = {
    [BLACK]: { type: "human", level: "3" },
    [WHITE]: { type: "cpu", level: "3" },
  };

  let board, current, busy, gameOver, lastMove;
  let history = [];
  const cells = [];

  const colorName = (p) => (p === BLACK ? "黒" : "白");
  const isCpu = (p) => players[p].type === "cpu";
  const isCpuTurn = () => !gameOver && isCpu(current);
  const isHumanTurn = () => !busy && !gameOver && !isCpu(current);

  function playerLabel(p) {
    if (players[p].type === "human") return `${colorName(p)}（人間）`;
    return `${colorName(p)}（CPU・Lv${players[p].level} ${LEVEL_NAMES[players[p].level]}）`;
  }

  /* setup */
  function syncLevels() {
    blackLevel.disabled =
      document.querySelector('input[name="black-type"]:checked').value !== "cpu";
    whiteLevel.disabled =
      document.querySelector('input[name="white-type"]:checked').value !== "cpu";
  }
  document.querySelectorAll('input[name="black-type"], input[name="white-type"]')
    .forEach((el) => el.addEventListener("change", syncLevels));

  startBtn.addEventListener("click", () => {
    players[BLACK].type = document.querySelector('input[name="black-type"]:checked').value;
    players[WHITE].type = document.querySelector('input[name="white-type"]:checked').value;
    players[BLACK].level = blackLevel.value;
    players[WHITE].level = whiteLevel.value;
    setupEl.hidden = true;
    gameEl.hidden = false;
    labelBlackEl.textContent = playerLabel(BLACK);
    labelWhiteEl.textContent = playerLabel(WHITE);
    newGame();
  });
  backBtn.addEventListener("click", () => { gameEl.hidden = true; setupEl.hidden = false; });

  /* board */
  function edgeAttr(r, c) {
    const e = [];
    if (r === 0) e.push("top");
    if (r === SIZE - 1) e.push("bottom");
    if (c === 0) e.push("left");
    if (c === SIZE - 1) e.push("right");
    return e.join(" ");
  }
  const STAR = new Set(["3,3", "3,11", "11,3", "11,11", "7,7"]);

  function buildGrid() {
    boardEl.innerHTML = "";
    cells.length = 0;
    for (let r = 0; r < SIZE; r++) {
      cells.push([]);
      for (let c = 0; c < SIZE; c++) {
        const cell = document.createElement("div");
        cell.className = "intsec";
        const e = edgeAttr(r, c);
        if (e) cell.dataset.edge = e;
        let inner = "";
        if (STAR.has(`${r},${c}`)) inner += `<span class="dot"></span>`;
        inner += `<span class="reco-ring" style="position:absolute;inset:8%;border-radius:50%;z-index:2;"></span>`;
        inner += `<div class="piece"></div><span class="hint-score"></span>`;
        cell.innerHTML = inner;
        cell.addEventListener("click", () => onClick(r, c));
        boardEl.appendChild(cell);
        cells[r].push(cell);
      }
    }
  }

  function newGame() {
    board = Array.from({ length: SIZE }, () => new Array(SIZE).fill(0));
    current = BLACK;
    busy = false;
    gameOver = false;
    lastMove = null;
    history = [];
    messageEl.textContent = "";
    render();
    maybeCpu();
  }

  /* assist */
  function computeAssist() {
    if (!assistEl.checked || !isHumanTurn()) return null;
    const evals = AI.evaluateMoves(board, current);
    const map = new Map();
    for (const e of evals) map.set(e.row * SIZE + e.col, e.score);
    const uniq = [...new Set(map.values())].sort((a, b) => b - a);
    return { map, rankOf: (s) => uniq.indexOf(s) };
  }

  function fmt(score) {
    if (score >= 900000) return "★";
    if (score >= 1000) return Math.round(score / 100) + "";
    return score + "";
  }

  function render() {
    const assist = computeAssist();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = cells[r][c];
        const v = board[r][c];
        const piece = cell.querySelector(".piece");
        const hint = cell.querySelector(".hint-score");
        piece.classList.toggle("black", v === BLACK);
        piece.classList.toggle("white", v === WHITE);
        piece.classList.toggle("show", v !== 0);

        cell.classList.toggle("last", !!lastMove && lastMove[0] === r && lastMove[1] === c);
        let marker = cell.querySelector(".marker");
        const isLast = lastMove && lastMove[0] === r && lastMove[1] === c;
        if (isLast && !marker) { marker = document.createElement("span"); marker.className = "marker"; cell.appendChild(marker); }
        if (!isLast && marker) marker.remove();

        cell.classList.remove("assist", "rank1", "rank2", "rank3");
        hint.textContent = "";
        if (assist && v === 0 && assist.map.has(r * SIZE + c)) {
          const s = assist.map.get(r * SIZE + c);
          const rank = assist.rankOf(s);
          cell.classList.add("assist");
          if (rank === 0) cell.classList.add("rank1");
          else if (rank === 1) cell.classList.add("rank2");
          else if (rank === 2) cell.classList.add("rank3");
          hint.textContent = fmt(s);
        }
      }
    }
    scoreBlackEl.classList.toggle("active", !gameOver && current === BLACK);
    scoreWhiteEl.classList.toggle("active", !gameOver && current === WHITE);
    if (gameOver) {
      // message holds result
    } else if (isCpuTurn()) {
      turnEl.textContent = `${colorName(current)}の番（CPU思考中…）`;
    } else {
      turnEl.textContent = `${colorName(current)}の番`;
    }
    undoBtn.disabled = busy || history.length === 0;
  }

  function onClick(r, c) {
    if (!isHumanTurn() || board[r][c] !== 0) return;
    place(r, c);
  }

  function place(r, c) {
    history.push({ board: board.map((row) => row.slice()), current, lastMove });
    board[r][c] = current;
    lastMove = [r, c];
    if (AI.isWin(board, r, c, current)) {
      gameOver = true;
      render();
      const who = players[current].type === "human" && !isCpu(current)
        ? colorName(current) : colorName(current);
      messageEl.textContent = `${colorName(current)}の勝ち！🎉（五目完成）`;
      return;
    }
    if (AI.isFull(board)) {
      gameOver = true;
      render();
      messageEl.textContent = "引き分け（盤が埋まりました）";
      return;
    }
    current = AI.opponent(current);
    render();
    maybeCpu();
  }

  function maybeCpu() {
    if (!isCpuTurn()) return;
    busy = true;
    render();
    setTimeout(() => {
      const mv = AI.chooseMove(board, current, Number(players[current].level));
      busy = false;
      if (!mv) { gameOver = true; messageEl.textContent = "引き分け"; render(); return; }
      place(mv[0], mv[1]);
    }, 300);
  }

  function undo() {
    if (busy || history.length === 0) return;
    let snap = history.pop();
    while (isCpu(snap.current) && history.length > 0) snap = history.pop();
    board = snap.board.map((row) => row.slice());
    current = snap.current;
    lastMove = snap.lastMove;
    gameOver = false;
    messageEl.textContent = "";
    render();
    maybeCpu();
  }

  undoBtn.addEventListener("click", undo);
  resetBtn.addEventListener("click", newGame);
  assistEl.addEventListener("change", render);

  buildGrid();
  syncLevels();
})();
