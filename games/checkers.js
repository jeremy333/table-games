// Checkers — 2 players, American rules. Dark moves first. Move diagonally forward;
// jump to capture, and keep jumping with the same piece if you can. Reach the far
// row to become a king, which moves both ways. Win by capturing or blocking all
// of your opponent's pieces.

const DARK = 'd';
const LIGHT = 'l';
const rowOf = (i) => Math.floor(i / 8);
const colOf = (i) => i % 8;
const at = (r, c) => (r >= 0 && r < 8 && c >= 0 && c < 8 ? r * 8 + c : -1);
const owner = (p) => (p ? (p.toLowerCase() === DARK ? 0 : 1) : null);
const isKing = (p) => p && p === p.toUpperCase();

function dirsFor(p) {
  if (isKing(p)) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  return owner(p) === 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
}

function jumpsFrom(board, i) {
  const p = board[i];
  const out = [];
  for (const [dr, dc] of dirsFor(p)) {
    const mid = at(rowOf(i) + dr, colOf(i) + dc);
    const land = at(rowOf(i) + 2 * dr, colOf(i) + 2 * dc);
    if (mid < 0 || land < 0) continue;
    if (board[mid] && owner(board[mid]) !== owner(p) && !board[land]) out.push({ from: i, to: land, capture: mid });
  }
  return out;
}

function stepsFrom(board, i) {
  const out = [];
  for (const [dr, dc] of dirsFor(board[i])) {
    const to = at(rowOf(i) + dr, colOf(i) + dc);
    if (to >= 0 && !board[to]) out.push({ from: i, to });
  }
  return out;
}

export function legalMoves(s) {
  const me = s.turn;
  if (s.mustContinue != null) return jumpsFrom(s.board, s.mustContinue);
  const jumps = [];
  const steps = [];
  s.board.forEach((p, i) => {
    if (owner(p) !== me) return;
    jumps.push(...jumpsFrom(s.board, i));
    steps.push(...stepsFrom(s.board, i));
  });
  if (jumps.length && s.opts.forced) return jumps;
  return [...jumps, ...steps];
}

function say(s, t) {
  s.log.push(t);
  if (s.log.length > 30) s.log.shift();
}

const sq = (i) => `${'abcdefgh'[colOf(i)]}${8 - rowOf(i)}`;

function endGame(s, winners, text) {
  s.winners = winners;
  s.phase = 'over';
  say(s, text);
}

export default {
  minPlayers: 2,
  maxPlayers: 2,
  options: [
    { id: 'forced', label: 'Captures', type: 'select', default: 'yes', choices: [['yes', 'Must jump when you can'], ['no', 'Jumping is optional']] },
  ],
  rules(o) {
    return 'Dark (the host) moves first. Move one square diagonally forward; jump an opponent’s piece to capture it, and keep jumping with the same piece if you can. ' +
      (o?.forced === 'no' ? 'Jumping is optional. ' : 'If you can jump, you must. ') +
      'Reach the far row to become a king, which moves and jumps both ways (crowning ends your turn). Win by capturing or blocking all of your opponent’s pieces.';
  },

  setup(names, options = {}) {
    const board = Array(64).fill(null);
    for (let i = 0; i < 64; i++) {
      if ((rowOf(i) + colOf(i)) % 2 !== 1) continue;
      if (rowOf(i) < 3) board[i] = LIGHT;
      if (rowOf(i) > 4) board[i] = DARK;
    }
    return {
      names, board, turn: 0, mustContinue: null, quiet: 0, lastMove: null,
      opts: { forced: options.forced !== 'no' }, phase: 'play', winners: null, drawOffer: null,
      log: [`${names[0]} (dark) moves first`],
    };
  },

  viewFor(s, seat) {
    return {
      seat, names: s.names, board: s.board, turn: s.turn, phase: s.phase,
      mustContinue: s.mustContinue, lastMove: s.lastMove, drawOffer: s.drawOffer,
      moves: s.phase === 'play' && s.turn === seat ? legalMoves(s) : [],
      counts: [0, 1].map((o) => s.board.filter((p) => owner(p) === o).length),
      winner: s.winners, drawn: s.phase === 'over' && s.winners && s.winners.length === 2,
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
    if (move.type === 'offerDraw') { s.drawOffer = seat; say(s, `${s.names[seat]} offered a draw`); return null; }
    if (move.type === 'answerDraw') {
      if (s.drawOffer == null || s.drawOffer === seat) return 'There’s no draw offer to answer.';
      if (move.accept) endGame(s, [0, 1], 'Draw agreed.');
      else { say(s, `${s.names[seat]} declined the draw`); s.drawOffer = null; }
      return null;
    }
    if (seat !== s.turn) return "It isn't your turn.";
    if (move.type !== 'move') return 'Make a move.';
    const m = legalMoves(s).find((x) => x.from === move.from && x.to === move.to);
    if (!m) return s.opts.forced && legalMoves(s).some((x) => x.capture != null) ? 'You must jump.' : 'You can’t move there.';

    const piece = s.board[m.from];
    s.board[m.to] = piece;
    s.board[m.from] = null;
    if (m.capture != null) s.board[m.capture] = null;
    s.drawOffer = null;
    let crowned = false;
    if (!isKing(piece) && (rowOf(m.to) === 0 || rowOf(m.to) === 7)) {
      s.board[m.to] = piece.toUpperCase();
      crowned = true;
    }
    s.lastMove = { from: m.from, to: m.to };
    say(s, `${s.names[seat]}: ${sq(m.from)}${m.capture != null ? '×' : '–'}${sq(m.to)}${crowned ? ' (king!)' : ''}`);
    s.quiet = m.capture != null || !isKing(piece) ? 0 : s.quiet + 1;

    // Keep jumping with the same piece if possible (crowning ends the turn).
    if (m.capture != null && !crowned && jumpsFrom(s.board, m.to).length) {
      s.mustContinue = m.to;
      return null;
    }
    s.mustContinue = null;
    s.turn = 1 - s.turn;
    const theirs = s.board.filter((p) => owner(p) === s.turn).length;
    if (!theirs || !legalMoves(s).length) {
      endGame(s, [seat], `${s.names[seat]} wins — ${theirs ? 'no moves left' : 'all pieces captured'}!`);
    } else if (s.quiet >= 80) {
      endGame(s, [0, 1], 'Draw — 40 moves each without a capture or a man moving.');
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
    const player = view.seat <= 1;
    const myTurn = view.phase === 'play' && view.turn === view.seat;
    const flip = view.seat === 1;

    const head = el('div', 'ck-head');
    [0, 1].forEach((o) => {
      const b = el('div', 'ck-player' + (view.turn === o && view.phase === 'play' ? ' active' : ''));
      b.append(el('span', `ck-dot ${o === 0 ? 'dark' : 'light'}`), el('strong', '', view.names[o]), el('small', '', `${view.counts[o]} pieces`));
      head.append(b);
    });
    root.append(head);

    let status;
    if (view.phase === 'over') status = view.drawn ? 'Draw' : view.winner.includes(view.seat) ? 'You win!' : `${view.names[view.winner[0]]} wins`;
    else if (!player) status = `${view.names[view.turn]} to move (you’re watching)`;
    else status = myTurn ? (view.mustContinue != null ? 'Keep jumping!' : 'Your move') : `${view.names[view.turn]} is thinking`;
    root.append(el('p', 'status' + (myTurn ? ' mine' : ''), status));

    let selected = view.mustContinue;
    const boardEl = el('div', 'ck-board');
    const draw = () => {
      boardEl.replaceChildren();
      const targets = new Set(view.moves.filter((m) => m.from === selected).map((m) => m.to));
      const movable = new Set(view.moves.map((m) => m.from));
      for (let k = 0; k < 64; k++) {
        const i = flip ? 63 - k : k;
        const dark = (rowOf(i) + colOf(i)) % 2 === 1;
        const cell = el('button', 'ck-cell' + (dark ? ' dark' : '') + (view.lastMove && (view.lastMove.from === i || view.lastMove.to === i) ? ' last' : '')
          + (targets.has(i) ? ' target' : '') + (selected === i ? ' sel' : ''));
        cell.type = 'button';
        cell.setAttribute('aria-label', sq(i));
        const p = view.board[i];
        if (p) {
          const piece = el('span', `ck-piece ${owner(p) === 0 ? 'dark' : 'light'}` + (isKing(p) ? ' king' : '') + (myTurn && movable.has(i) ? ' can' : ''));
          if (isKing(p)) piece.textContent = '★';
          cell.append(piece);
        }
        cell.addEventListener('click', () => {
          if (!myTurn) return;
          if (targets.has(i)) { send({ type: 'move', from: selected, to: i }); return; }
          if (movable.has(i) && view.mustContinue == null) { selected = i; draw(); }
        });
        boardEl.append(cell);
      }
    };
    draw();
    root.append(boardEl);

    if (player && view.phase === 'play') {
      const acts = el('div', 'row ck-acts');
      if (view.drawOffer != null && view.drawOffer !== view.seat) {
        acts.append(el('p', 'note', `${view.names[view.drawOffer]} offers a draw.`));
        const y = el('button', 'primary', 'Accept draw');
        y.addEventListener('click', () => send({ type: 'answerDraw', accept: true }));
        const n = el('button', '', 'Decline');
        n.addEventListener('click', () => send({ type: 'answerDraw', accept: false }));
        acts.append(y, n);
      } else {
        const d = el('button', 'quiet', view.drawOffer === view.seat ? 'Draw offered…' : 'Offer draw');
        d.disabled = view.drawOffer === view.seat;
        d.addEventListener('click', () => send({ type: 'offerDraw' }));
        const r = el('button', 'quiet', 'Resign');
        r.addEventListener('click', () => { if (confirm('Resign this game?')) send({ type: 'resign' }); });
        acts.append(d, r);
      }
      root.append(acts);
    }

    const log = el('ul', 'log');
    view.log.forEach((l) => log.append(el('li', '', l)));
    root.append(log);
  },

  styles: `
.ck-head { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.5rem; }
.ck-player { display: grid; grid-template-columns: auto 1fr; column-gap: 0.5rem; align-items: center; border: 1.5px solid var(--felt-line); border-radius: 10px; padding: 0.4rem 0.6rem; }
.ck-player.active { border-color: var(--brass); }
.ck-player small { grid-column: 2; color: var(--muted); font-size: 0.8rem; }
.ck-dot { width: 1.1rem; height: 1.1rem; border-radius: 50%; grid-row: span 2; }
.ck-dot.dark { background: #2a1d17; border: 2px solid #f1e3c8; }
.ck-dot.light { background: #e8c48a; border: 2px solid #6d4b2a; }
.ck-board { display: grid; grid-template-columns: repeat(8, 1fr); width: min(100%, 26rem); margin: 0.8rem auto; aspect-ratio: 1; border: 4px solid #4a2f1b; border-radius: 6px; overflow: hidden; }
.ck-cell { position: relative; padding: 0; min-height: 0; border: none; border-radius: 0; background: #ead9b8; display: grid; place-items: center; }
.ck-cell.dark { background: #8a5a36; }
.ck-cell.last { box-shadow: inset 0 0 0 3px rgba(212, 173, 58, 0.55); }
.ck-cell.sel { box-shadow: inset 0 0 0 4px var(--brass); }
.ck-cell.target::after { content: ''; width: 34%; height: 34%; border-radius: 50%; background: rgba(212, 173, 58, 0.85); }
.ck-piece { width: 78%; height: 78%; border-radius: 50%; display: grid; place-items: center; font-size: 1.1rem; box-shadow: inset 0 -4px 0 rgba(0, 0, 0, 0.3), 0 2px 3px rgba(0, 0, 0, 0.45); }
.ck-piece.dark { background: #2a1d17; color: #f6d77a; border: 2px solid #5a4030; }
.ck-piece.light { background: #f0d29c; color: #8a5a00; border: 2px solid #b88a4a; }
.ck-piece.can { outline: 2px solid var(--brass); outline-offset: 1px; }
.ck-acts { justify-content: center; align-items: center; }
`,
};
