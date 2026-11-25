// Reversi — 2 players on an 8×8 board. Black (the host) moves first.
// Place a disc so it traps a straight line of your opponent's discs between it
// and another of yours; every trapped disc flips to your color. If you can't
// move, you pass. When neither player can move, the most discs wins.

const BLACK = 0;
const WHITE = 1;
const COLOR_NAME = ['Black', 'White'];
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const rowOf = (i) => Math.floor(i / 8);
const colOf = (i) => i % 8;
const sqName = (i) => 'abcdefgh'[colOf(i)] + (rowOf(i) + 1);

// The discs that would flip if `color` played at square i (empty list = not a legal move).
export function flipsFor(board, i, color) {
  if (board[i] != null) return [];
  const out = [];
  for (const [dr, dc] of DIRS) {
    const line = [];
    let r = rowOf(i) + dr;
    let c = colOf(i) + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === 1 - color) {
      line.push(r * 8 + c);
      r += dr;
      c += dc;
    }
    if (line.length && r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === color) out.push(...line);
  }
  return out;
}

export function legalMoves(board, color) {
  const out = [];
  for (let i = 0; i < 64; i++) if (flipsFor(board, i, color).length) out.push(i);
  return out;
}

const countOf = (board, color) => board.filter((x) => x === color).length;

function say(s, t) {
  s.log.push(t);
  if (s.log.length > 30) s.log.shift();
}

function endGame(s, winners, text) {
  s.winners = winners;
  s.phase = 'over';
  s.result = text;
  say(s, text);
}

function finishByCount(s) {
  const b = countOf(s.board, BLACK);
  const w = countOf(s.board, WHITE);
  if (b === w) endGame(s, [0, 1], `Draw, ${b} to ${w}.`);
  else {
    const win = b > w ? BLACK : WHITE;
    endGame(s, [win], `${s.names[win]} wins, ${Math.max(b, w)} to ${Math.min(b, w)}!`);
  }
}

export default {
  minPlayers: 2,
  maxPlayers: 2,
  options: [
    { id: 'hints', label: 'Show legal moves', type: 'select', default: 'on', choices: [['on', 'Yes'], ['off', 'No']] },
  ],
  rules(o) {
    return 'Black (the host) moves first. Place a disc so it traps a straight line of your opponent’s discs, across, up and down, or diagonally, ' +
      'between it and another of your discs. Every trapped disc flips to your color. If you can’t move, your turn is passed. ' +
      'When neither player can move, the most discs wins.' + (o?.hints === 'off' ? ' Legal moves aren’t shown.' : '');
  },

  setup(names, options = {}) {
    const board = Array(64).fill(null);
    board[27] = WHITE; // d4
    board[28] = BLACK; // e4
    board[35] = BLACK; // d5
    board[36] = WHITE; // e5
    return {
      names, board, turn: BLACK, phase: 'play', winners: null, result: null,
      lastMove: null, flipped: [], opts: { hints: options.hints !== 'off' },
      log: [`${names[0]} plays Black and moves first`],
    };
  },

  viewFor(s, seat) {
    return {
      seat, names: s.names, board: s.board, turn: s.turn, phase: s.phase,
      moves: s.phase === 'play' && s.turn === seat ? legalMoves(s.board, seat) : [],
      hints: s.opts.hints, counts: [countOf(s.board, BLACK), countOf(s.board, WHITE)],
      lastMove: s.lastMove, flipped: s.flipped, result: s.result,
      winner: s.winners, drawn: s.phase === 'over' && s.winners.length === 2,
      log: s.log.slice(-4),
    };
  },

  applyMove(s, seat, move) {
    if (s.phase === 'over') return 'The game is over.';
    if (seat > 1) return 'Only the two players can move.';
    if (move.type === 'resign') {
      endGame(s, [1 - seat], `${s.names[seat]} resigned. ${s.names[1 - seat]} wins!`);
      return null;
    }
    if (seat !== s.turn) return "It isn't your turn.";
    if (move.type !== 'move') return 'Place a disc.';
    const i = Number(move.at);
    if (!Number.isInteger(i) || i < 0 || i > 63) return 'Pick a square on the board.';
    if (s.board[i] != null) return 'That square is taken.';
    const flips = flipsFor(s.board, i, seat);
    if (!flips.length) return 'That move doesn’t flip any discs.';

    s.board[i] = seat;
    flips.forEach((f) => { s.board[f] = seat; });
    s.lastMove = i;
    s.flipped = flips;
    say(s, `${s.names[seat]}: ${sqName(i)}, flipped ${flips.length}`);

    const other = 1 - seat;
    if (legalMoves(s.board, other).length) s.turn = other;
    else if (legalMoves(s.board, seat).length) {
      say(s, `${s.names[other]} has no move and passes`);
      s.turn = seat;
    } else finishByCount(s);
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
    const player = view.seat <= 1;
    const myTurn = view.phase === 'play' && view.turn === view.seat;

    const head = el('div', 'rv-head');
    [BLACK, WHITE].forEach((c) => {
      const b = el('div', 'rv-player' + (view.phase === 'play' && view.turn === c ? ' active' : ''));
      b.append(el('span', `rv-dot ${c === BLACK ? 'black' : 'white'}`), el('strong', '', view.names[c]),
        el('span', 'rv-count', String(view.counts[c])));
      b.setAttribute('aria-label', `${view.names[c]}, ${COLOR_NAME[c]}, ${view.counts[c]} discs`);
      head.append(b);
    });
    root.append(head);

    let status;
    if (view.phase === 'over') status = view.result;
    else if (!player) status = `${view.names[view.turn]} to move (you’re watching)`;
    else status = myTurn ? 'Your move' : `${view.names[view.turn]} is thinking`;
    root.append(el('p', 'status' + (myTurn ? ' mine' : ''), status));

    const legal = new Set(view.moves);
    const flipped = new Set(view.flipped);
    const board = el('div', 'rv-board');
    for (let i = 0; i < 64; i++) {
      const v = view.board[i];
      const can = myTurn && legal.has(i);
      const cell = el('button', 'rv-cell' + (can ? ' can' : '') + (can && view.hints ? ' hint' : '') + (view.lastMove === i ? ' last' : ''));
      cell.type = 'button';
      cell.setAttribute('aria-label', `${sqName(i)}${v != null ? `, ${COLOR_NAME[v].toLowerCase()}` : can ? ', legal move' : ''}`);
      if (v != null) cell.append(el('span', `rv-disc ${v === BLACK ? 'black' : 'white'}` + (flipped.has(i) ? ' flip' : '')));
      cell.addEventListener('click', () => {
        if (!myTurn) return;
        if (can) send({ type: 'move', at: i });
      });
      board.append(cell);
    }
    root.append(board);

    if (player && view.phase === 'play') {
      const acts = el('div', 'row rv-acts');
      const r = el('button', 'quiet', 'Resign');
      r.addEventListener('click', () => { if (confirm('Resign this game?')) send({ type: 'resign' }); });
      acts.append(r);
      root.append(acts);
    }

    const log = el('ul', 'log');
    view.log.forEach((l) => log.append(el('li', '', l)));
    root.append(log);
  },

  styles: `
.rv-head { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.5rem; }
.rv-player { display: flex; align-items: center; gap: 0.5rem; border: 1.5px solid var(--felt-line); border-radius: 10px; padding: 0.4rem 0.6rem; min-width: 0; }
.rv-player.active { border-color: var(--brass); }
.rv-player strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rv-count { margin-left: auto; font-family: var(--serif); font-size: 1.4rem; line-height: 1; }
.rv-dot { flex: none; width: 1.1rem; height: 1.1rem; border-radius: 50%; }
.rv-dot.black { background: #1a1a1a; border: 2px solid #f1e3c8; }
.rv-dot.white { background: #f6f3ea; border: 2px solid #1a1a1a; }
.rv-board { display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; padding: 2px; width: min(100%, 26rem); aspect-ratio: 1; margin: 0.8rem auto; background: #123d26; border: 4px solid #4a2f1b; border-radius: 6px; }
.rv-cell { position: relative; padding: 0; min-height: 0; border: none; border-radius: 0; background: #2b7a4b; display: grid; place-items: center; }
.rv-cell.can { cursor: pointer; }
.rv-cell.hint::after { content: ''; width: 26%; height: 26%; border-radius: 50%; background: rgba(255, 255, 255, 0.4); }
.rv-cell.can:focus-visible { outline: 3px solid var(--brass); outline-offset: -3px; }
.rv-cell.last { box-shadow: inset 0 0 0 3px var(--brass); }
.rv-disc { width: 80%; height: 80%; border-radius: 50%; box-shadow: inset 0 -4px 0 rgba(0, 0, 0, 0.25), 0 2px 3px rgba(0, 0, 0, 0.45); }
.rv-disc.black { background: radial-gradient(circle at 35% 30%, #4a4a4a, #141414 60%); }
.rv-disc.white { background: radial-gradient(circle at 35% 30%, #ffffff, #e4dfd2 65%); }
.rv-disc.flip { animation: rv-flip 0.35s ease-out; }
@keyframes rv-flip { 0% { transform: scaleX(1); } 50% { transform: scaleX(0.08); } 100% { transform: scaleX(1); } }
@media (prefers-reduced-motion: reduce) { .rv-disc.flip { animation: none; } }
.rv-acts { justify-content: center; }
`,
};
