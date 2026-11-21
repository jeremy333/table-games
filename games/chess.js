// Chess — 2 players, full rules: castling, en passant, promotion, check,
// checkmate, stalemate, and draws by agreement, repetition, the 50-move rule
// and insufficient material. The host plays White.

const FILES = 'abcdefgh';
const rowOf = (i) => Math.floor(i / 8);
const colOf = (i) => i % 8;
const at = (r, c) => (r >= 0 && r < 8 && c >= 0 && c < 8 ? r * 8 + c : -1);
const isWhite = (p) => !!p && p === p.toUpperCase();
const colorOf = (p) => (p ? (isWhite(p) ? 0 : 1) : null);
const sqName = (i) => FILES[colOf(i)] + (8 - rowOf(i));
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const NAMES = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function initialBoard() {
  const b = Array(64).fill(null);
  'rnbqkbnr'.split('').forEach((p, c) => { b[c] = p; b[56 + c] = p.toUpperCase(); });
  for (let c = 0; c < 8; c++) { b[8 + c] = 'p'; b[48 + c] = 'P'; }
  return b;
}

// Is square i attacked by color `by`?
function attacked(b, i, by) {
  const r = rowOf(i);
  const c = colOf(i);
  const mine = (p, t) => p && colorOf(p) === by && p.toLowerCase() === t;
  const pr = by === 0 ? r + 1 : r - 1; // white pawns attack upward (toward row 0)
  for (const dc of [-1, 1]) if (mine(b[at(pr, c + dc)], 'p')) return true;
  for (const [dr, dc] of KNIGHT) if (mine(b[at(r + dr, c + dc)], 'n')) return true;
  for (const [dr, dc] of KING) if (mine(b[at(r + dr, c + dc)], 'k')) return true;
  const slide = (dirs, types) => dirs.some(([dr, dc]) => {
    for (let k = 1; k < 8; k++) {
      const j = at(r + dr * k, c + dc * k);
      if (j < 0) return false;
      if (b[j]) return colorOf(b[j]) === by && types.includes(b[j].toLowerCase());
    }
    return false;
  });
  return slide(DIAG, 'bq') || slide(ORTHO, 'rq');
}

const kingSquare = (b, color) => b.findIndex((p) => p && p.toLowerCase() === 'k' && colorOf(p) === color);
const inCheck = (b, color) => attacked(b, kingSquare(b, color), 1 - color);

function pseudoMoves(s, color) {
  const b = s.board;
  const out = [];
  b.forEach((p, i) => {
    if (!p || colorOf(p) !== color) return;
    const r = rowOf(i);
    const c = colOf(i);
    const t = p.toLowerCase();
    const add = (to, extra = {}) => out.push({ from: i, to, ...extra });
    if (t === 'p') {
      const dir = color === 0 ? -1 : 1;
      const startRow = color === 0 ? 6 : 1;
      const lastRow = color === 0 ? 0 : 7;
      const push = (to, extra) => {
        if (rowOf(to) === lastRow) for (const promo of 'qrbn') add(to, { ...extra, promo });
        else add(to, extra);
      };
      const one = at(r + dir, c);
      if (one >= 0 && !b[one]) {
        push(one);
        const two = at(r + 2 * dir, c);
        if (r === startRow && !b[two]) add(two, { double: true });
      }
      for (const dc of [-1, 1]) {
        const to = at(r + dir, c + dc);
        if (to < 0) continue;
        if (b[to] && colorOf(b[to]) !== color) push(to);
        else if (to === s.ep) add(to, { enPassant: true });
      }
    } else if (t === 'n' || t === 'k') {
      for (const [dr, dc] of t === 'n' ? KNIGHT : KING) {
        const to = at(r + dr, c + dc);
        if (to >= 0 && (!b[to] || colorOf(b[to]) !== color)) add(to);
      }
      if (t === 'k') {
        const home = color === 0 ? 60 : 4;
        const rights = s.castling;
        const side = (flag, rookSq, empty, pass) => {
          if (i !== home || !rights[flag] || b[rookSq] !== (color === 0 ? 'R' : 'r')) return;
          if (empty.some((x) => b[x])) return;
          if ([home, ...pass].some((x) => attacked(b, x, 1 - color))) return;
          add(pass[1], { castle: flag });
        };
        if (color === 0) { side('K', 63, [61, 62], [61, 62]); side('Q', 56, [57, 58, 59], [59, 58]); }
        else { side('k', 7, [5, 6], [5, 6]); side('q', 0, [1, 2, 3], [3, 2]); }
      }
    } else {
      const dirs = t === 'b' ? DIAG : t === 'r' ? ORTHO : [...DIAG, ...ORTHO];
      for (const [dr, dc] of dirs) {
        for (let k = 1; k < 8; k++) {
          const to = at(r + dr * k, c + dc * k);
          if (to < 0) break;
          if (!b[to]) { add(to); continue; }
          if (colorOf(b[to]) !== color) add(to);
          break;
        }
      }
    }
  });
  return out;
}

export function play(board, m) {
  const b = board.slice();
  const p = b[m.from];
  b[m.to] = m.promo ? (isWhite(p) ? m.promo.toUpperCase() : m.promo) : p;
  b[m.from] = null;
  if (m.enPassant) b[at(rowOf(m.from), colOf(m.to))] = null;
  if (m.castle) {
    const [rf, rt] = { K: [63, 61], Q: [56, 59], k: [7, 5], q: [0, 3] }[m.castle];
    b[rt] = b[rf];
    b[rf] = null;
  }
  return b;
}

export function legalMoves(s, color = s.turn) {
  return pseudoMoves(s, color).filter((m) => !inCheck(play(s.board, m), color));
}

function positionKey(s) {
  return s.board.map((p) => p || '.').join('') + s.turn + Object.entries(s.castling).filter(([, v]) => v).map(([k]) => k).join('') + (s.ep ?? '-');
}

function insufficient(b) {
  const pieces = b.map((p, i) => (p ? { t: p.toLowerCase(), i } : null)).filter((x) => x && x.t !== 'k');
  if (!pieces.length) return true;
  if (pieces.length === 1 && ['b', 'n'].includes(pieces[0].t)) return true;
  if (pieces.every((x) => x.t === 'b')) {
    const shades = new Set(pieces.map((x) => (rowOf(x.i) + colOf(x.i)) % 2));
    return shades.size === 1;
  }
  return false;
}

function notation(s, m, before) {
  if (m.castle) return m.castle.toLowerCase() === 'k' ? 'O-O' : 'O-O-O';
  const p = before[m.from].toLowerCase();
  const capture = !!before[m.to] || m.enPassant;
  let t = '';
  if (p === 'p') t = (capture ? FILES[colOf(m.from)] + 'x' : '') + sqName(m.to) + (m.promo ? '=' + m.promo.toUpperCase() : '');
  else {
    const others = legalMoves({ ...s, board: before }, colorOf(before[m.from]))
      .filter((x) => x.to === m.to && x.from !== m.from && before[x.from] === before[m.from]);
    let dis = '';
    if (others.length) dis = others.some((x) => colOf(x.from) === colOf(m.from)) ? sqName(m.from)[1] : FILES[colOf(m.from)];
    t = p.toUpperCase() + dis + (capture ? 'x' : '') + sqName(m.to);
  }
  return t;
}

function say(s, t) {
  s.log.push(t);
  if (s.log.length > 40) s.log.shift();
}

function endGame(s, winners, text) {
  s.winners = winners;
  s.phase = 'over';
  s.result = text;
  say(s, text);
}

export default {
  minPlayers: 2,
  maxPlayers: 2,
  rules: 'Standard chess. The host plays White and moves first. All the usual rules apply: castling, en passant, and promotion (you choose the piece). ' +
    'Checkmate wins; stalemate, repetition three times, 50 moves without a capture or pawn move, or too little material to mate is a draw. You can also offer a draw or resign.',

  setup(names) {
    const s = {
      names, board: initialBoard(), turn: 0, castling: { K: true, Q: true, k: true, q: true }, ep: null,
      halfmove: 0, moveNo: 1, lastMove: null, phase: 'play', winners: null, result: null, drawOffer: null,
      repeats: {}, moves: [], log: [`${names[0]} plays White`],
    };
    s.repeats[positionKey(s)] = 1;
    return s;
  },

  viewFor(s, seat) {
    const inCk = s.phase === 'play' && inCheck(s.board, s.turn);
    return {
      seat, names: s.names, board: s.board, turn: s.turn, phase: s.phase,
      lastMove: s.lastMove, check: inCk ? kingSquare(s.board, s.turn) : null, drawOffer: s.drawOffer,
      moves: s.phase === 'play' && s.turn === seat ? legalMoves(s).map((m) => ({ from: m.from, to: m.to, promo: m.promo || null })) : [],
      history: s.moves, result: s.result,
      winner: s.winners, drawn: s.phase === 'over' && s.winners && s.winners.length === 2,
      log: s.log.slice(-3),
    };
  },

  applyMove(s, seat, move) {
    if (s.phase === 'over') return 'The game is over.';
    if (seat > 1) return 'Only the two players can move.';
    if (move.type === 'resign') { endGame(s, [1 - seat], `${s.names[seat]} resigned. ${s.names[1 - seat]} wins!`); return null; }
    if (move.type === 'offerDraw') { s.drawOffer = seat; say(s, `${s.names[seat]} offered a draw`); return null; }
    if (move.type === 'answerDraw') {
      if (s.drawOffer == null || s.drawOffer === seat) return 'There’s no draw offer to answer.';
      if (move.accept) endGame(s, [0, 1], 'Draw agreed.');
      else { say(s, `${s.names[seat]} declined the draw`); s.drawOffer = null; }
      return null;
    }
    if (seat !== s.turn) return "It isn't your turn.";
    if (move.type !== 'move') return 'Make a move.';
    const m = legalMoves(s).find((x) => x.from === move.from && x.to === move.to && (x.promo || null) === (move.promo || null));
    if (!m) {
      const blocked = pseudoMoves(s, s.turn).some((x) => x.from === move.from && x.to === move.to);
      return blocked ? 'That would leave your king in check.' : 'That isn’t a legal move.';
    }
    const before = s.board;
    let text = notation(s, m, before);
    const moved = before[m.from].toLowerCase();
    const captured = !!before[m.to] || m.enPassant;
    s.board = play(before, m);
    // Castling rights
    const touch = (sqr) => {
      if (sqr === 60) { s.castling.K = false; s.castling.Q = false; }
      if (sqr === 4) { s.castling.k = false; s.castling.q = false; }
      if (sqr === 63) s.castling.K = false;
      if (sqr === 56) s.castling.Q = false;
      if (sqr === 7) s.castling.k = false;
      if (sqr === 0) s.castling.q = false;
    };
    touch(m.from);
    touch(m.to);
    s.ep = m.double ? at((rowOf(m.from) + rowOf(m.to)) / 2, colOf(m.from)) : null;
    s.halfmove = moved === 'p' || captured ? 0 : s.halfmove + 1;
    s.lastMove = { from: m.from, to: m.to };
    s.drawOffer = null;
    s.turn = 1 - s.turn;
    if (s.turn === 0) s.moveNo += 1;

    const replies = legalMoves(s);
    const check = inCheck(s.board, s.turn);
    if (check) text += replies.length ? '+' : '#';
    s.moves.push(text);
    say(s, `${s.names[seat]}: ${text}`);

    const key = positionKey(s);
    s.repeats[key] = (s.repeats[key] || 0) + 1;
    if (!replies.length) {
      if (check) endGame(s, [seat], `Checkmate! ${s.names[seat]} wins.`);
      else endGame(s, [0, 1], 'Stalemate — it’s a draw.');
    } else if (s.repeats[key] >= 3) endGame(s, [0, 1], 'Draw by repetition.');
    else if (s.halfmove >= 100) endGame(s, [0, 1], 'Draw — 50 moves without a capture or pawn move.');
    else if (insufficient(s.board)) endGame(s, [0, 1], 'Draw — not enough pieces left to checkmate.');
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

    // Captured pieces (what's missing from each side)
    const start = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    const missing = (color) => Object.entries(start).flatMap(([t, n]) => {
      const have = view.board.filter((p) => p && colorOf(p) === color && p.toLowerCase() === t).length;
      return Array(Math.max(0, n - have)).fill(t);
    });

    const head = el('div', 'cs-head');
    [0, 1].forEach((o) => {
      const b = el('div', 'cs-player' + (view.turn === o && view.phase === 'play' ? ' active' : ''));
      b.append(el('strong', '', `${view.names[o]} · ${o === 0 ? 'White' : 'Black'}`));
      const caps = missing(1 - o);
      b.append(el('span', 'cs-caps' + (o === 0 ? ' of-black' : ' of-white'), caps.map((t) => GLYPH[t] + '\uFE0E').join('')));
      head.append(b);
    });
    root.append(head);

    let status;
    if (view.phase === 'over') status = view.result;
    else if (!player) status = `${view.names[view.turn]} to move (you’re watching)`;
    else status = myTurn ? (view.check != null ? 'Your move — you’re in check!' : 'Your move') : `${view.names[view.turn]} is thinking`;
    root.append(el('p', 'status' + (myTurn ? ' mine' : ''), status));

    let selected = null;
    const boardEl = el('div', 'cs-board');
    const draw = () => {
      boardEl.replaceChildren();
      const targets = new Set(view.moves.filter((m) => m.from === selected).map((m) => m.to));
      const movable = new Set(view.moves.map((m) => m.from));
      for (let k = 0; k < 64; k++) {
        const i = flip ? 63 - k : k;
        const dark = (rowOf(i) + colOf(i)) % 2 === 1;
        const p = view.board[i];
        const cell = el('button', 'cs-cell' + (dark ? ' dark' : '')
          + (view.lastMove && (view.lastMove.from === i || view.lastMove.to === i) ? ' last' : '')
          + (selected === i ? ' sel' : '') + (targets.has(i) ? (p ? ' target cap' : ' target') : '')
          + (view.check === i ? ' check' : ''));
        cell.type = 'button';
        cell.setAttribute('aria-label', `${sqName(i)}${p ? `, ${isWhite(p) ? 'white' : 'black'} ${NAMES[p.toLowerCase()]}` : ''}`);
        if (p) cell.append(el('span', `cs-piece ${isWhite(p) ? 'white' : 'black'}`, GLYPH[p.toLowerCase()] + '\uFE0E'));
        // Coordinates on the edge squares
        if (k % 8 === 0) cell.append(el('span', 'cs-rank', String(8 - rowOf(i))));
        if (k >= 56) cell.append(el('span', 'cs-file', FILES[colOf(i)]));
        cell.addEventListener('click', () => {
          if (!myTurn) return;
          if (targets.has(i)) {
            const options = view.moves.filter((m) => m.from === selected && m.to === i);
            if (options.length > 1) choosePromotion(root, el, view.turn, (promo) => send({ type: 'move', from: selected, to: i, promo }));
            else send({ type: 'move', from: selected, to: i, promo: options[0].promo });
            return;
          }
          selected = movable.has(i) ? (selected === i ? null : i) : null;
          draw();
        });
        boardEl.append(cell);
      }
    };
    draw();
    root.append(boardEl);

    if (player && view.phase === 'play') {
      const acts = el('div', 'row cs-acts');
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

    if (view.history.length) {
      const moves = el('p', 'cs-moves');
      const parts = [];
      for (let k = 0; k < view.history.length; k += 2) parts.push(`${k / 2 + 1}. ${view.history[k]}${view.history[k + 1] ? ' ' + view.history[k + 1] : ''}`);
      moves.textContent = parts.slice(-8).join('   ');
      root.append(moves);
    }
  },

  styles: `
.cs-head { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.5rem; }
.cs-player { border: 1.5px solid var(--felt-line); border-radius: 10px; padding: 0.4rem 0.6rem; display: grid; gap: 0.1rem; min-width: 0; }
.cs-player.active { border-color: var(--brass); }
.cs-player strong { font-size: 0.9rem; }
.cs-caps { font-size: 1.05rem; letter-spacing: -0.1em; min-height: 1.3rem; overflow-wrap: anywhere; }
.cs-caps.of-black { color: #111; text-shadow: 0 0 1px #fff, 0 0 2px #fff; }
.cs-caps.of-white { color: #fff; text-shadow: 0 0 1px #000, 0 0 2px #000; }
.cs-board { display: grid; grid-template-columns: repeat(8, 1fr); width: min(100%, 26rem); margin: 0.8rem auto; aspect-ratio: 1; border: 4px solid #4a2f1b; border-radius: 6px; overflow: hidden; }
.cs-cell { position: relative; padding: 0; min-height: 0; border: none; border-radius: 0; background: #ecdcb9; display: grid; place-items: center; }
.cs-cell.dark { background: #a9774e; }
.cs-cell.last { background-image: linear-gradient(rgba(212, 173, 58, 0.45), rgba(212, 173, 58, 0.45)); }
.cs-cell.sel { box-shadow: inset 0 0 0 4px var(--brass); }
.cs-cell.check { background-image: radial-gradient(circle, rgba(220, 30, 30, 0.85) 0%, rgba(220, 30, 30, 0) 70%); }
.cs-cell.target::after { content: ''; position: absolute; width: 30%; height: 30%; border-radius: 50%; background: rgba(40, 40, 40, 0.35); }
.cs-cell.target.cap::after { width: 86%; height: 86%; background: none; border: 4px solid rgba(40, 40, 40, 0.4); }
.cs-piece { font-size: min(9vw, 2.4rem); line-height: 1; font-family: 'Segoe UI Symbol', 'DejaVu Sans', 'Noto Sans Symbols 2', serif; }
.cs-piece.white { color: #fff; text-shadow: 0 0 1px #000, 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; }
.cs-piece.black { color: #121212; text-shadow: 0 0 1px #fff; }
.cs-rank, .cs-file { position: absolute; font-size: 0.55rem; color: rgba(0, 0, 0, 0.55); font-weight: 700; }
.cs-rank { top: 2px; left: 3px; }
.cs-file { bottom: 1px; right: 3px; }
.cs-acts { justify-content: center; align-items: center; }
.cs-moves { font-family: ui-monospace, Menlo, monospace; font-size: 0.82rem; color: var(--muted); white-space: pre-wrap; }
.cs-promo { position: fixed; left: 0; right: 0; bottom: 0; z-index: 30; background: var(--felt-deep); border-top: 2px solid var(--brass); padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px)); text-align: center; }
.cs-promo .row { justify-content: center; }
.cs-promo button { font-size: 2.2rem; width: 4rem; height: 4rem; padding: 0; background: var(--paper); border: none; }
`,
};

function choosePromotion(root, el, color, pick) {
  const sheet = el('div', 'cs-promo');
  sheet.append(el('p', '', 'Promote your pawn to:'));
  const row = el('div', 'row');
  for (const t of 'qrbn') {
    const b = el('button', `cs-piece ${color === 0 ? 'white' : 'black'}`, GLYPH[t] + '\uFE0E');
    b.setAttribute('aria-label', NAMES[t]);
    b.addEventListener('click', () => { sheet.remove(); pick(t); });
    row.append(b);
  }
  const cancel = el('button', 'quiet', 'Cancel');
  cancel.style.cssText = 'font-size:1rem;width:auto;height:auto;padding:0.4rem 1rem;background:none';
  cancel.addEventListener('click', () => sheet.remove());
  sheet.append(row, cancel);
  root.append(sheet);
}
