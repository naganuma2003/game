/* Gomoku (五目並べ) AI.
 * Board: size x size array, 0 empty, 1 black (先手), 2 white (後手).
 * Exposes window.GomokuAI with rules helpers and CPU move selection.
 */
(function () {
  const SIZE = 15;
  const WIN = 5;
  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

  const inside = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  const opponent = (p) => (p === 1 ? 2 : 1);

  // Count consecutive stones of `player` through (r,c) along one axis.
  function lineLength(board, r, c, dr, dc, player) {
    let n = 1;
    let rr = r + dr, cc = c + dc;
    while (inside(rr, cc) && board[rr][cc] === player) { n++; rr += dr; cc += dc; }
    rr = r - dr; cc = c - dc;
    while (inside(rr, cc) && board[rr][cc] === player) { n++; rr -= dr; cc -= dc; }
    return n;
  }

  // Did placing `player` at (r,c) create five (or more) in a row?
  function isWin(board, r, c, player) {
    for (const [dr, dc] of DIRS) {
      if (lineLength(board, r, c, dr, dc, player) >= WIN) return true;
    }
    return false;
  }

  function isFull(board) {
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (board[r][c] === 0) return false;
    return true;
  }

  // Candidate moves: empty cells within distance 2 of an existing stone.
  function candidateMoves(board) {
    const res = [];
    let any = false;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (board[r][c] !== 0) { any = true; continue; }
      }
    }
    if (!any) return [[Math.floor(SIZE / 2), Math.floor(SIZE / 2)]];
    const seen = new Set();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (board[r][c] === 0) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const nr = r + dr, nc = c + dc;
            if (inside(nr, nc) && board[nr][nc] === 0) {
              const k = nr * SIZE + nc;
              if (!seen.has(k)) { seen.add(k); res.push([nr, nc]); }
            }
          }
        }
      }
    }
    return res;
  }

  /* ---------- shape scoring ---------- */

  // Score one line-shape for `player` at (r,c) along (dr,dc).
  // Returns a value based on run length and how open the ends are.
  function shapeScore(board, r, c, dr, dc, player) {
    let count = 1;
    let openEnds = 0;

    let rr = r + dr, cc = c + dc;
    while (inside(rr, cc) && board[rr][cc] === player) { count++; rr += dr; cc += dc; }
    if (inside(rr, cc) && board[rr][cc] === 0) openEnds++;

    rr = r - dr; cc = c - dc;
    while (inside(rr, cc) && board[rr][cc] === player) { count++; rr -= dr; cc -= dc; }
    if (inside(rr, cc) && board[rr][cc] === 0) openEnds++;

    if (count >= WIN) return 1000000;
    if (openEnds === 0) return 0; // blocked both ends, useless
    const table = {
      4: openEnds === 2 ? 100000 : 12000,
      3: openEnds === 2 ? 6000 : 800,
      2: openEnds === 2 ? 300 : 60,
      1: openEnds === 2 ? 20 : 5,
    };
    return table[count] || 0;
  }

  // Heuristic value of playing `player` at (r,c): offense + weighted defense.
  function moveValue(board, r, c, player) {
    const opp = opponent(player);
    let attack = 0, defend = 0;
    for (const [dr, dc] of DIRS) {
      attack += shapeScore(board, r, c, dr, dc, player);
      defend += shapeScore(board, r, c, dr, dc, opp);
    }
    // Slight central bias to break ties early.
    const center = SIZE / 2;
    const bias = -(Math.abs(r - center) + Math.abs(c - center));
    return attack * 1.05 + defend * 0.95 + bias;
  }

  /* ---------- move selection ---------- */

  // Find an immediate win or a must-block for `player`.
  function tacticalMove(board, player) {
    const opp = opponent(player);
    const cands = candidateMoves(board);
    // 1) win now
    for (const [r, c] of cands) {
      board[r][c] = player;
      const win = isWin(board, r, c, player);
      board[r][c] = 0;
      if (win) return [r, c];
    }
    // 2) block opponent's win
    for (const [r, c] of cands) {
      board[r][c] = opp;
      const win = isWin(board, r, c, opp);
      board[r][c] = 0;
      if (win) return [r, c];
    }
    return null;
  }

  // level: 1 easy, 2 normal, 3 strong, 4 very strong (1-ply lookahead).
  function chooseMove(board, player, level) {
    if (isFull(board)) return null;
    const cands = candidateMoves(board);

    if (level >= 2) {
      const t = tacticalMove(board, player);
      if (t) return t;
    }

    if (level === 1) {
      // Greedy on a noisy heuristic, no deep lookahead.
      let best = cands[0], bestScore = -Infinity;
      for (const [r, c] of cands) {
        const noise = ((r * 7 + c * 13) % 5) * 10;
        const v = moveValue(board, r, c, player) * 0.6 + noise;
        if (v > bestScore) { bestScore = v; best = [r, c]; }
      }
      return best;
    }

    if (level <= 3) {
      let best = cands[0], bestScore = -Infinity;
      for (const [r, c] of cands) {
        const v = moveValue(board, r, c, player);
        if (v > bestScore) { bestScore = v; best = [r, c]; }
      }
      return best;
    }

    // level 4: one-ply lookahead — assume opponent replies with their best move.
    const opp = opponent(player);
    let best = cands[0], bestScore = -Infinity;
    for (const [r, c] of cands) {
      board[r][c] = player;
      if (isWin(board, r, c, player)) { board[r][c] = 0; return [r, c]; }
      // opponent's best immediate threat after our move
      let worst = -Infinity;
      for (const [or, oc] of candidateMoves(board)) {
        const ov = moveValue(board, or, oc, opp);
        if (ov > worst) worst = ov;
      }
      const v = moveValue(board, r, c, player) - worst * 0.9;
      board[r][c] = 0;
      if (v > bestScore) { bestScore = v; best = [r, c]; }
    }
    return best;
  }

  // Score every empty candidate for the AI assistant (from player's view).
  function evaluateMoves(board, player) {
    const opp = opponent(player);
    return candidateMoves(board).map(([r, c]) => {
      let score;
      board[r][c] = player;
      if (isWin(board, r, c, player)) score = 1000000;
      else score = Math.round(moveValue(board, r, c, player));
      board[r][c] = 0;
      // mark forced blocks prominently
      board[r][c] = opp;
      if (isWin(board, r, c, opp)) score = Math.max(score, 900000);
      board[r][c] = 0;
      return { row: r, col: c, score };
    });
  }

  window.GomokuAI = {
    SIZE, WIN,
    isWin, isFull, opponent, candidateMoves,
    chooseMove, evaluateMoves,
  };
})();
