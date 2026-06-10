/* Othello AI
 * Exposes window.OthelloAI with helpers for move generation and CPU choice.
 * Board is an 8x8 array of 0 (empty), 1 (black), 2 (white).
 */
(function () {
  const SIZE = 8;
  const DIRS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1],
  ];

  // Positional weights — corners are valuable, squares next to corners are risky.
  const WEIGHTS = [
    [120, -20, 20, 5, 5, 20, -20, 120],
    [-20, -40, -5, -5, -5, -5, -40, -20],
    [20, -5, 15, 3, 3, 15, -5, 20],
    [5, -5, 3, 3, 3, 3, -5, 5],
    [5, -5, 3, 3, 3, 3, -5, 5],
    [20, -5, 15, 3, 3, 15, -5, 20],
    [-20, -40, -5, -5, -5, -5, -40, -20],
    [120, -20, 20, 5, 5, 20, -20, 120],
  ];

  const opponent = (p) => (p === 1 ? 2 : 1);
  const inside = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

  // Returns array of [r,c] flipped if `player` plays at (row,col); empty if illegal.
  function flipsFor(board, row, col, player) {
    if (board[row][col] !== 0) return [];
    const opp = opponent(player);
    const flips = [];
    for (const [dr, dc] of DIRS) {
      let r = row + dr, c = col + dc;
      const line = [];
      while (inside(r, c) && board[r][c] === opp) {
        line.push([r, c]);
        r += dr; c += dc;
      }
      if (line.length && inside(r, c) && board[r][c] === player) {
        flips.push(...line);
      }
    }
    return flips;
  }

  function legalMoves(board, player) {
    const moves = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const flips = flipsFor(board, r, c, player);
        if (flips.length) moves.push({ row: r, col: c, flips });
      }
    }
    return moves;
  }

  function applyMove(board, move, player) {
    const next = board.map((row) => row.slice());
    next[move.row][move.col] = player;
    for (const [r, c] of move.flips) next[r][c] = player;
    return next;
  }

  function counts(board) {
    let black = 0, white = 0;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (board[r][c] === 1) black++;
        else if (board[r][c] === 2) white++;
      }
    }
    return { black, white };
  }

  // Heuristic from the perspective of `player`.
  function evaluate(board, player) {
    const opp = opponent(player);
    let positional = 0, mine = 0, theirs = 0;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = board[r][c];
        if (v === player) { positional += WEIGHTS[r][c]; mine++; }
        else if (v === opp) { positional -= WEIGHTS[r][c]; theirs++; }
      }
    }
    const myMoves = legalMoves(board, player).length;
    const oppMoves = legalMoves(board, opp).length;
    const mobility = 10 * (myMoves - oppMoves);

    const empties = SIZE * SIZE - mine - theirs;
    // In the endgame, raw disc count dominates.
    const discDiff = empties <= 12 ? 10 * (mine - theirs) : (mine - theirs);

    return positional + mobility + discDiff;
  }

  // Legal moves ordered by positional value (corners first). Good ordering
  // makes alpha-beta prune far more, which is what lets us search deeper.
  function orderedMoves(board, player) {
    const moves = legalMoves(board, player);
    moves.sort((a, b) => WEIGHTS[b.row][b.col] - WEIGHTS[a.row][a.col]);
    return moves;
  }

  // Final disc difference from `player`'s view (used at terminal nodes).
  function terminalScore(board, player) {
    const { black, white } = counts(board);
    const mine = player === 1 ? black : white;
    return mine - (mine === black ? white : black);
  }

  // Negamax with alpha-beta pruning.
  function negamax(board, player, depth, alpha, beta) {
    if (depth === 0) return evaluate(board, player);

    const moves = orderedMoves(board, player);
    if (moves.length === 0) {
      // No move: if opponent also stuck, game over -> final score.
      if (legalMoves(board, opponent(player)).length === 0) {
        return evaluate(board, player);
      }
      return -negamax(board, opponent(player), depth - 1, -beta, -alpha);
    }

    let best = -Infinity;
    for (const move of moves) {
      const next = applyMove(board, move, player);
      const score = -negamax(next, opponent(player), depth - 1, -beta, -alpha);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  // Exact endgame search: plays to the very end (no depth limit) and scores
  // by final disc difference, so the result is the perfect line.
  function endgameSolve(board, player, alpha, beta) {
    const moves = orderedMoves(board, player);
    if (moves.length === 0) {
      if (legalMoves(board, opponent(player)).length === 0) {
        return terminalScore(board, player);
      }
      return -endgameSolve(board, opponent(player), -beta, -alpha);
    }

    let best = -Infinity;
    for (const move of moves) {
      const next = applyMove(board, move, player);
      const score = -endgameSolve(next, opponent(player), -beta, -alpha);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  // Five difficulty levels (1 = easiest ... 5 = strongest).
  // "search" levels use negamax; mid = depth while the board is open,
  // end = depth once few empties remain (deeper, since branching is small).
  const LEVELS = {
    1: { kind: "random" },
    2: { kind: "greedy" },
    3: { kind: "search", mid: 2, end: 4 },
    4: { kind: "search", mid: 4, end: 6 },
    5: { kind: "search", mid: 5, end: 8 },
  };

  function pickRandom(moves) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  // Most flips, with a little corner preference. No lookahead.
  function pickGreedy(moves) {
    let best = moves[0], bestScore = -Infinity;
    for (const m of moves) {
      const score = m.flips.length + WEIGHTS[m.row][m.col] * 0.2;
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best;
  }

  // Search depth for a "search" level config: deeper as the board fills
  // (fewer branches near the end), capped at the number of empties so the
  // UI stays responsive.
  function searchDepth(board, cfg) {
    const filled = counts(board).black + counts(board).white;
    const empties = SIZE * SIZE - filled;
    return empties <= 8 ? Math.min(empties, cfg.end)
      : empties <= 12 ? cfg.end
      : cfg.mid;
  }

  function pickSearch(board, player, moves, cfg) {
    const depth = searchDepth(board, cfg);

    let best = moves[0], bestScore = -Infinity;
    let alpha = -Infinity;
    const beta = Infinity;
    for (const move of moves) {
      const next = applyMove(board, move, player);
      const score = -negamax(next, opponent(player), depth - 1, -beta, -alpha);
      if (score > bestScore) { bestScore = score; best = move; }
      if (score > alpha) alpha = score;
    }
    return best;
  }

  // The AI assistant searches deeper than any CPU level: a deep midgame
  // lookahead, and an exact solve once few empties remain. Following the
  // top-ranked move should reliably beat the built-in opponents.
  const ASSIST_MID_DEPTH = 7;
  const ASSIST_EXACT_EMPTIES = 12;

  // Score every legal move for `player` (higher = better for player).
  // Used by the AI-assistant overlay.
  function evaluateMoves(board, player) {
    const filled = counts(board).black + counts(board).white;
    const empties = SIZE * SIZE - filled;
    const exact = empties <= ASSIST_EXACT_EMPTIES;
    return legalMoves(board, player).map((move) => {
      const next = applyMove(board, move, player);
      const score = exact
        ? -endgameSolve(next, opponent(player), -Infinity, Infinity)
        : -negamax(next, opponent(player), ASSIST_MID_DEPTH - 1, -Infinity, Infinity);
      return { row: move.row, col: move.col, score };
    });
  }

  // Pick a move for the given difficulty level (1-5).
  function chooseMove(board, player, level) {
    const moves = legalMoves(board, player);
    if (moves.length === 0) return null;

    const cfg = LEVELS[Number(level)] || LEVELS[3];
    if (cfg.kind === "random") return pickRandom(moves);
    if (cfg.kind === "greedy") return pickGreedy(moves);
    return pickSearch(board, player, moves, cfg);
  }

  window.OthelloAI = {
    SIZE,
    legalMoves,
    flipsFor,
    applyMove,
    counts,
    chooseMove,
    evaluateMoves,
    opponent,
  };
})();
