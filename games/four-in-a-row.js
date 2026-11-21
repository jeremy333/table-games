// Four in a Row — 2 players take turns dropping discs into a 7-column, 6-row grid.
// Discs fall to the lowest open space. Four of your discs in a line (across, up
// and down, or diagonally) wins. A full grid with no line is a draw.
const COLS = 7;
const ROWS = 6;
const COLORS = ['Red', 'Yellow'];

// The winning line through (r, c) for player p, or null.
function lineAt(board, r, c, p) {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = [[r, c]];
    for (const sign of [1, -1]) {
      let rr = r + dr * sign;
      let cc = c + dc * sign;
      while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && board[rr][cc] === p) {
        cells.push([rr, cc]);
        rr += dr * sign;
        cc += dc * sign;
      }
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}

export default {
  minPlayers: 2,
  maxPlayers: 2,
  rules: 'Take turns dropping a disc into a column; it falls to the lowest open space. Get four in a line across, up and down, or diagonally to win. The host is Red and goes first.',

  setup(names) {
    return {
      names, board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
      turn: 0, phase: 'play', winners: null, line: null, last: null,
    };
  },

  viewFor(s, seat) {
    return { seat, names: s.names, board: s.board, turn: s.turn, phase: s.phase, line: s.line, last: s.last, winner: s.winners };
  },

  applyMove(s, seat, move) {
    if (s.phase === 'over') return 'The game is over.';
    if (seat !== s.turn) return "It isn't your turn.";
    if (move.type !== 'drop') return 'Pick a column.';
    const c = Number(move.col);
    if (!Number.isInteger(c) || c < 0 || c >= COLS) return 'Pick a column.';
    let r = ROWS - 1;
    while (r >= 0 && s.board[r][c] !== null) r--;
    if (r < 0) return 'That column is full.';
    s.board[r][c] = seat;
    s.last = [r, c];
    const line = lineAt(s.board, r, c, seat);
    if (line) {
      s.line = line;
      s.winners = [seat];
      s.phase = 'over';
    } else if (s.board[0].every((x) => x !== null)) {
      s.winners = [0, 1];
      s.phase = 'over';
    } else {
      s.turn = 1 - seat;
    }
    return null;
  },

  render(view, root, send) {
    root.replaceChildren();
    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };
    const myTurn = view.phase === 'play' && view.turn === view.seat;
    const drawn = view.phase === 'over' && view.winner.length === 2;

    const head = el('div', 'fr-head');
    [0, 1].forEach((p) => {
      const b = el('div', 'fr-player' + (view.turn === p && view.phase === 'play' ? ' active' : ''));
      b.append(el('span', `fr-dot p${p}`), el('strong', '', view.names[p]), el('small', '', COLORS[p]));
      head.append(b);
    });
    root.append(head);

    let status;
    if (view.phase === 'over') status = drawn ? 'Draw — the grid is full' : view.winner[0] === view.seat ? 'You win!' : `${view.names[view.winner[0]]} wins`;
    else if (view.seat > 1) status = `${view.names[view.turn]} to move (you’re watching)`;
    else status = myTurn ? 'Your turn — tap a column' : `${view.names[view.turn]} is thinking`;
    root.append(el('p', 'status' + (myTurn ? ' mine' : ''), status));

    const winning = new Set((view.line || []).map(([r, c]) => `${r},${c}`));
    const grid = el('div', 'fr-grid');
    for (let c = 0; c < COLS; c++) {
      const full = view.board[0][c] !== null;
      const col = el(myTurn && !full ? 'button' : 'div', 'fr-col' + (myTurn && !full ? ' can' : ''));
      if (myTurn && !full) {
        col.type = 'button';
        col.setAttribute('aria-label', `Drop in column ${c + 1}`);
        col.addEventListener('click', () => send({ type: 'drop', col: c }));
      }
      for (let r = 0; r < ROWS; r++) {
        const v = view.board[r][c];
        const hole = el('span', 'fr-hole' + (v !== null ? ` p${v}` : '') + (winning.has(`${r},${c}`) ? ' win' : '')
          + (view.last && view.last[0] === r && view.last[1] === c ? ' last' : ''));
        col.append(hole);
      }
      grid.append(col);
    }
    root.append(grid);
  },

  styles: `
.fr-head { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.5rem; }
.fr-player { display: grid; grid-template-columns: auto 1fr; column-gap: 0.5rem; align-items: center; border: 1.5px solid var(--felt-line); border-radius: 10px; padding: 0.4rem 0.6rem; }
.fr-player.active { border-color: var(--brass); }
.fr-player small { grid-column: 2; color: var(--muted); font-size: 0.8rem; }
.fr-dot { width: 1.2rem; height: 1.2rem; border-radius: 50%; grid-row: span 2; }
.fr-dot.p0, .fr-hole.p0 { background: radial-gradient(circle at 35% 35%, #ff6b6b, #c4141c); }
.fr-dot.p1, .fr-hole.p1 { background: radial-gradient(circle at 35% 35%, #ffe680, #e0a800); }
.fr-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; background: #1f4fb5; padding: 6px; border-radius: 12px; width: min(100%, 26rem); margin: 0.9rem auto; box-shadow: 0 4px 0 #163a85; }
.fr-col { display: grid; grid-template-rows: repeat(6, 1fr); gap: 4px; padding: 3px; border: none; background: none; min-height: 0; border-radius: 8px; }
.fr-col.can { cursor: pointer; }
.fr-col.can:hover, .fr-col.can:focus-visible { background: rgba(255, 255, 255, 0.15); }
.fr-hole { aspect-ratio: 1; border-radius: 50%; background: #0f2c66; box-shadow: inset 0 3px 4px rgba(0, 0, 0, 0.45); }
.fr-hole.last { outline: 2px solid #fff; outline-offset: -2px; }
.fr-hole.win { box-shadow: 0 0 0 3px #fff, inset 0 3px 4px rgba(0, 0, 0, 0.2); }
`,
};
