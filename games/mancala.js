// Mancala (Kalah rules) — 2 players. Each has 6 pits and a store on the right.
// Pick up all the seeds from one of your pits and sow them one by one
// counterclockwise into the following pits and your store (skipping your
// opponent's store). Last seed in your store: go again. Last seed in one of your
// own empty pits: capture it plus the seeds across from it. When one side is
// empty, each player keeps the seeds left on their side. Most seeds wins.
//
// Board array: [0..5] = player 1's pits, 6 = player 1's store,
//              [7..12] = player 2's pits, 13 = player 2's store.
const STORE = [6, 13];
const pitsOf = (p) => (p === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]);
const owner = (i) => (i < 6 ? 0 : i > 6 && i < 13 ? 1 : null);

export function sow(board, p, pit) {
  const b = board.slice();
  let seeds = b[pit];
  b[pit] = 0;
  let i = pit;
  while (seeds > 0) {
    i = (i + 1) % 14;
    if (i === STORE[1 - p]) continue;
    b[i] += 1;
    seeds -= 1;
  }
  let again = i === STORE[p];
  let captured = 0;
  if (!again && owner(i) === p && b[i] === 1) {
    const opposite = 12 - i;
    if (b[opposite] > 0) {
      captured = b[opposite] + 1;
      b[STORE[p]] += captured;
      b[i] = 0;
      b[opposite] = 0;
    }
  }
  // Game end: one side empty -> everyone keeps the seeds on their side.
  let over = false;
  if (pitsOf(0).every((x) => !b[x]) || pitsOf(1).every((x) => !b[x])) {
    for (const q of [0, 1]) for (const x of pitsOf(q)) { b[STORE[q]] += b[x]; b[x] = 0; }
    over = true;
    again = false;
  }
  return { board: b, again, captured, over, last: i };
}

export default {
  minPlayers: 2,
  maxPlayers: 2,
  options: [
    { id: 'seeds', label: 'Seeds per pit', type: 'select', default: '4', choices: [['3', '3'], ['4', '4'], ['5', '5'], ['6', '6']] },
  ],
  rules: 'Pick one of your pits and sow its seeds one at a time counterclockwise into the following pits and your store (skipping your opponent’s store). ' +
    'If your last seed lands in your store, go again. If it lands in one of your own empty pits, capture it and the seeds directly across. ' +
    'When one side runs out, each player keeps the seeds on their side. Most seeds in your store wins.',

  setup(names, options = {}) {
    const n = [3, 4, 5, 6].includes(Number(options.seeds)) ? Number(options.seeds) : 4;
    const board = Array(14).fill(n);
    board[6] = 0;
    board[13] = 0;
    return { names, board, turn: 0, phase: 'play', winners: null, last: null, note: null, log: [`${names[0]} goes first`] };
  },

  viewFor(s, seat) {
    return { seat, names: s.names, board: s.board, turn: s.turn, phase: s.phase, last: s.last, note: s.note, winner: s.winners, log: s.log.slice(-3) };
  },

  applyMove(s, seat, move) {
    if (s.phase === 'over') return 'The game is over.';
    if (seat !== s.turn) return "It isn't your turn.";
    const pit = Number(move.pit);
    if (move.type !== 'sow' || !pitsOf(seat).includes(pit)) return 'Pick one of your pits.';
    if (!s.board[pit]) return 'That pit is empty.';
    const n = s.board[pit];
    const r = sow(s.board, seat, pit);
    s.board = r.board;
    s.last = { pit, end: r.last, seat };
    const name = s.names[seat];
    s.note = r.captured ? `${name} captured ${r.captured}!` : r.again ? `${name} landed in their store — go again!` : null;
    s.log.push(`${name} sowed ${n}${r.captured ? `, captured ${r.captured}` : ''}${r.again ? ', goes again' : ''}`);
    if (s.log.length > 20) s.log.shift();
    if (r.over) {
      const [a, b] = [s.board[6], s.board[13]];
      s.winners = a === b ? [0, 1] : [a > b ? 0 : 1];
      s.phase = 'over';
      s.log.push(a === b ? `Tie, ${a} to ${b}` : `${s.names[s.winners[0]]} wins ${Math.max(a, b)} to ${Math.min(a, b)}`);
    } else if (!r.again) {
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
    const me = view.seat <= 1 ? view.seat : 0; // watchers see player 1's side at the bottom
    const them = 1 - me;
    const myTurn = view.phase === 'play' && view.turn === view.seat;
    const b = view.board;

    let status;
    if (view.phase === 'over') status = view.winner.length === 2 ? 'It’s a tie!' : view.winner[0] === view.seat ? 'You win!' : `${view.names[view.winner[0]]} wins`;
    else if (view.seat > 1) status = `${view.names[view.turn]} to move (you’re watching)`;
    else status = myTurn ? 'Your turn — pick a pit' : `${view.names[view.turn]} is thinking`;
    root.append(el('p', 'status' + (myTurn ? ' mine' : ''), status));
    if (view.note && view.phase === 'play') root.append(el('p', 'mc-note', view.note));

    const seedDots = (n) => {
      const box = el('span', 'mc-seeds');
      for (let k = 0; k < Math.min(n, 12); k++) box.append(el('i', ''));
      return box;
    };
    const pitEl = (i, mine) => {
      const can = mine && myTurn && b[i] > 0;
      const p = el(can ? 'button' : 'div', 'mc-pit' + (can ? ' can' : '') + (view.last && view.last.end === i ? ' last' : ''));
      p.append(seedDots(b[i]), el('span', 'mc-count', String(b[i])));
      if (can) {
        p.type = 'button';
        p.setAttribute('aria-label', `Pit with ${b[i]} seeds`);
        p.addEventListener('click', () => send({ type: 'sow', pit: i }));
      }
      return p;
    };

    const board = el('div', 'mc-board');
    // Opponent's store on the left, yours on the right; their pits run right-to-left along the top.
    const theirStore = el('div', 'mc-store');
    theirStore.append(el('span', 'mc-count big', String(b[STORE[them]])), el('small', '', view.names[them]));
    const myStore = el('div', 'mc-store mine');
    myStore.append(el('span', 'mc-count big', String(b[STORE[me]])), el('small', '', view.seat <= 1 ? 'You' : view.names[me]));
    const top = el('div', 'mc-row');
    pitsOf(them).slice().reverse().forEach((i) => top.append(pitEl(i, false)));
    const bottom = el('div', 'mc-row');
    pitsOf(me).forEach((i) => bottom.append(pitEl(i, view.seat === me)));
    const middle = el('div', 'mc-middle');
    middle.append(top, bottom);
    board.append(theirStore, middle, myStore);
    root.append(board);
    root.append(el('p', 'note mc-hint', 'Seeds move counterclockwise: along your row to the right, into your store, then along the top.'));

    const log = el('ul', 'log');
    view.log.forEach((l) => log.append(el('li', '', l)));
    root.append(log);
  },

  styles: `
.mc-note { text-align: center; color: var(--brass); font-weight: 600; }
.mc-board { display: grid; grid-template-columns: 3.4rem 1fr 3.4rem; gap: 0.4rem; background: linear-gradient(#8b5a2b, #6e4520); border-radius: 22px; padding: 0.6rem; margin: 0.8rem 0; box-shadow: inset 0 2px 0 rgba(255,255,255,0.15), 0 4px 0 #4a2f15; }
.mc-middle { display: grid; gap: 0.5rem; }
.mc-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.35rem; }
.mc-pit, .mc-store { position: relative; display: grid; place-items: center; background: #4e2f12; border-radius: 50%; box-shadow: inset 0 3px 6px rgba(0,0,0,0.5); border: none; padding: 0; min-height: 0; color: #fff; }
.mc-pit { aspect-ratio: 1; }
.mc-store { border-radius: 18px; }
.mc-pit.can { outline: 2px solid var(--brass); outline-offset: 1px; cursor: pointer; }
.mc-pit.last { box-shadow: inset 0 3px 6px rgba(0,0,0,0.5), 0 0 0 2px #fff; }
.mc-seeds { position: absolute; inset: 18%; display: flex; flex-wrap: wrap; gap: 2px; justify-content: center; align-content: center; }
.mc-seeds i { width: 22%; aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #fff2c9, #c9a14a); }
.mc-count { position: absolute; bottom: -0.15rem; right: -0.1rem; background: var(--paper); color: var(--ink); font: 700 0.7rem/1 var(--sans); border-radius: 999px; padding: 0.12rem 0.32rem; }
.mc-count.big { position: static; font-size: 1.1rem; padding: 0.2rem 0.5rem; }
.mc-store small { color: #f3e3c2; font-size: 0.65rem; text-align: center; padding: 0 0.15rem; overflow-wrap: anywhere; }
.mc-store.mine small { color: var(--brass); font-weight: 700; }
.mc-hint { text-align: center; }
`,
};
