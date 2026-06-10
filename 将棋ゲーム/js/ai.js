/* Shogi AI — material-based negamax with alpha-beta over the Shogi engine.
 *
 * For speed, the deep search uses pseudo-legal moves and treats capturing the
 * enemy king as an immediate win (so it avoids leaving its own king en prise
 * at depth >= 2). The ROOT move is always chosen from fully legal moves.
 */
(function () {
  const S = window.Shogi;
  const MATE = 1000000;
  const NODE_BUDGET = 250000; // soft cap so deep levels stay responsive

  const VAL = { P: 1, L: 3, N: 4, S: 5, G: 6, B: 8, R: 11, K: 1000 };
  const PROMO_VAL = { P: 7, L: 6, N: 6, S: 6, R: 13, B: 10 };
  const pieceValue = (p) => (p.promoted ? (PROMO_VAL[p.type] || VAL[p.type]) : VAL[p.type]);

  // Material balance (board + hands) from the side-to-move's perspective.
  function evaluate(state) {
    const me = state.turn, enemy = S.opp(me);
    let score = 0;
    for (let r = 0; r < S.N; r++) {
      for (let c = 0; c < S.N; c++) {
        const p = state.board[r][c];
        if (!p) continue;
        score += (p.owner === me ? 1 : -1) * pieceValue(p);
      }
    }
    for (const t of S.HAND_TYPES) {
      score += VAL[t] * (state.hands[me][t] - state.hands[enemy][t]);
    }
    return score;
  }

  // Captures (and promotions) first — better ordering prunes more.
  function orderScore(m) {
    let s = 0;
    if (m.capture) s += VAL[m.capture] * 10;
    if (m.promote) s += 5;
    return s;
  }
  function order(moves) {
    return moves.sort((a, b) => orderScore(b) - orderScore(a));
  }

  let nodes = 0;

  function negamax(state, depth, alpha, beta) {
    if (depth === 0 || nodes > NODE_BUDGET) return evaluate(state);
    const moves = order(S.pseudoMoves(state));
    if (moves.length === 0) return -MATE + (10 - depth); // stuck = losing
    let best = -Infinity;
    for (const m of moves) {
      nodes++;
      if (m.capturedKing) return MATE - (10 - depth); // capturing king wins now
      const sc = -negamax(S.applyMove(state, m), depth - 1, -beta, -alpha);
      if (sc > best) best = sc;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  // Choose a move for the side to move. level: 1 (weak) .. 3 (strong).
  function chooseMove(state, level) {
    const depthByLevel = { 1: 1, 2: 2, 3: 3 };
    const depth = depthByLevel[level] || 2;
    const moves = order(S.legalMoves(state));
    if (moves.length === 0) return null;

    nodes = 0;
    let best = moves[0], bestScore = -Infinity;
    let alpha = -Infinity;
    const beta = Infinity;
    for (const m of moves) {
      let sc = -negamax(S.applyMove(state, m), depth - 1, -beta, -alpha);
      // Level 1 plays greedily but with a little noise to vary its games.
      if (level === 1) sc += (m.to[0] * 7 + m.to[1] * 3) % 3 - 1;
      if (sc > bestScore) { bestScore = sc; best = m; }
      if (sc > alpha) alpha = sc;
    }
    return best;
  }

  // Score every legal move for the side to move (higher = better for them).
  // Used by the AI-assistant overlay.
  function evaluateMoves(state, depth) {
    const d = depth || 3;
    const moves = order(S.legalMoves(state));
    const out = [];
    for (const m of moves) {
      nodes = 0; // give each root move a fair node budget
      const sc = m.capturedKing
        ? MATE
        : -negamax(S.applyMove(state, m), d - 1, -Infinity, Infinity);
      out.push({ move: m, score: sc });
    }
    return out;
  }

  window.ShogiAI = { chooseMove, evaluate, evaluateMoves, MATE };
})();
