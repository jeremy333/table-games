// Tic Tac Toe — 2 players on a 3×3 grid. X goes first; three in a row
// (across, up and down, or diagonally) wins. A full grid is a draw.

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

function winningLine(board) {
  return LINES.find(([a, b, c]) => board[a] != null && board[a] === board[b] && board[a] === board[c]) || null;
}

export default {
  name: 'Tic Tac Toe',
  blurb: 'Three in a row wins. Quick to learn, quick to play.',
  tags: ['board', 'classic', 'quick', 'easy', 'kids', 'two-player', 'noughts and crosses', 'x and o'],
  minPlayers: 2,
  maxPlayers: 2,
  options: [
    { id: 'first', label: 'Who goes first (as X)', type: 'select', default: 'host', choices: [['host', 'The host'], ['guest', 'The other player']] },
  ],
  rules(o) {
    return `Take turns marking a square. Get three in a row, across, up and down, or diagonally, to win. ${o?.first === 'guest' ? 'The other player' : 'The host'} is X and goes first.`;
  },

  setup(names, options = {}) {
    const x = options.first === 'guest' ? 1 : 0; // the seat playing X
    return { names, board: Array(9).fill(null), x, turn: x, phase: 'play', winners: null, line: null, last: null };
  },

  viewFor(s, seat) {
    return { seat, names: s.names, board: s.board, x: s.x, turn: s.turn, phase: s.phase, line: s.line, last: s.last, winner: s.winners };
  },

  applyMove(s, seat, move) {
    if (s.phase === 'over') return 'The game is over.';
    if (seat !== s.turn) return "It isn't your turn.";
    if (move.type !== 'mark') return 'Pick a square.';
    const i = Number(move.at);
    if (!Number.isInteger(i) || i < 0 || i > 8) return 'Pick a square.';
    if (s.board[i] != null) return 'That square is taken.';
    s.board[i] = seat;
    s.last = i;
    const line = winningLine(s.board);
    if (line) {
      s.line = line;
      s.winners = [seat];
      s.phase = 'over';
    } else if (s.board.every((v) => v != null)) {
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
    const mark = (seat) => (seat === view.x ? 'X' : 'O');
    const myTurn = view.phase === 'play' && view.turn === view.seat;
    const drawn = view.phase === 'over' && view.winner.length === 2;

    const head = el('div', 'tt-head');
    [view.x, 1 - view.x].forEach((p) => {
      const b = el('div', 'tt-player' + (view.turn === p && view.phase === 'play' ? ' active' : ''));
      b.append(el('span', `tt-mark ${mark(p).toLowerCase()}`, mark(p)), el('strong', '', view.names[p]));
      head.append(b);
    });
    root.append(head);

    let status;
    if (view.phase === 'over') status = drawn ? 'Draw — nobody got three in a row' : view.winner[0] === view.seat ? 'You win!' : `${view.names[view.winner[0]]} wins`;
    else if (view.seat > 1) status = `${view.names[view.turn]} to move (you’re watching)`;
    else status = myTurn ? `Your turn — you’re ${mark(view.seat)}` : `${view.names[view.turn]} is thinking`;
    root.append(el('p', 'status' + (myTurn ? ' mine' : ''), status));

    const winning = new Set(view.line || []);
    const grid = el('div', 'tt-grid' + (view.phase === 'over' && !drawn ? ' done' : ''));
    view.board.forEach((v, i) => {
      const can = myTurn && v == null;
      const cell = el('button', 'tt-cell' + (can ? ' can' : '') + (winning.has(i) ? ' win' : '') + (view.last === i ? ' last' : ''));
      cell.type = 'button';
      const row = Math.floor(i / 3) + 1;
      const col = (i % 3) + 1;
      cell.setAttribute('aria-label', `Row ${row}, column ${col}${v != null ? `, ${mark(v)}` : can ? ', empty' : ''}`);
      if (v != null) cell.append(el('span', `tt-mark ${mark(v).toLowerCase()}`, mark(v)));
      cell.addEventListener('click', () => { if (can) send({ type: 'mark', at: i }); });
      grid.append(cell);
    });
    root.append(grid);
  },

  styles: `
.tt-head { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.5rem; }
.tt-player { display: flex; align-items: center; gap: 0.5rem; border: 1.5px solid var(--felt-line); border-radius: 10px; padding: 0.4rem 0.6rem; min-width: 0; }
.tt-player.active { border-color: var(--brass); }
.tt-player strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tt-player .tt-mark { font-size: 1.3rem; }
.tt-mark { font-family: var(--serif); font-weight: 700; line-height: 1; }
.tt-mark.x { color: #ffd166; }
.tt-mark.o { color: #8ecae6; }
.tt-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; width: min(100%, 20rem); aspect-ratio: 1; margin: 1rem auto; padding: 6px; background: var(--felt-line); border-radius: 14px; }
.tt-cell { padding: 0; min-height: 0; border: none; border-radius: 9px; background: rgba(0, 0, 0, 0.22); display: grid; place-items: center; }
.tt-cell .tt-mark { font-size: clamp(2.6rem, 16vw, 4.4rem); }
.tt-cell.can { cursor: pointer; }
.tt-cell.can:hover, .tt-cell.can:focus-visible { background: rgba(255, 255, 255, 0.12); outline: none; }
.tt-cell.last { box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.35); }
.tt-grid.done .tt-cell:not(.win) { opacity: 0.45; }
.tt-cell.win { background: rgba(212, 173, 58, 0.3); box-shadow: inset 0 0 0 3px var(--brass); }
`,
};
