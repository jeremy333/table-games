// MergeHotels — 2 to 6 players. Lay tiles on a 12 × 9 grid to found hotel
// chains, buy shares, and merge chains for bonuses. The richest player wins.
//
// Each turn: place a tile, buy up to 3 shares, draw back to 6 tiles.
// A tile next to a lone tile founds a chain (with a free share). A tile joining
// two or more chains merges them: the biggest survives, the others' top two
// shareholders get bonuses, then every shareholder sells, trades 2 for 1, or
// keeps. Chains of 11+ tiles are safe and can't be merged away.
// The game ends when a chain reaches 41 tiles or every chain is safe.

const COLS = 12;
const ROWS = 9;
const LETTERS = 'ABCDEFGHI';
const HAND = 6;
const START_CASH = 6000;
const BANK_SHARES = 25;
const SAFE = 11;
const END_SIZE = 41;

// Seven chains in three price tiers (0 = cheapest).
const CHAINS = [
  { name: 'Sandpiper', short: 'SP', tier: 0, color: '#f5c518', ink: '#2b2100' },   // gold
  { name: 'Bluebell', short: 'BB', tier: 0, color: '#38bdf8', ink: '#04233a' },    // sky blue
  { name: 'Copperleaf', short: 'CL', tier: 1, color: '#9a5524', ink: '#ffffff' },  // copper brown
  { name: 'Peony', short: 'PN', tier: 1, color: '#ff6fb5', ink: '#3a0620' },       // pink
  { name: 'Lantern', short: 'LN', tier: 1, color: '#7c4dff', ink: '#ffffff' },     // violet
  { name: 'Silverline', short: 'SL', tier: 2, color: '#f1f3f5', ink: '#1a1f24' },  // silver white
  { name: 'Monarch', short: 'MN', tier: 2, color: '#d7263d', ink: '#ffffff' },     // red
];

const label = (i) => `${(i % COLS) + 1}${LETTERS[Math.floor(i / COLS)]}`;
const money = (n) => '$' + n.toLocaleString('en-US');
const roundUp = (n) => Math.ceil(n / 100) * 100;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function neighbors(i) {
  const r = Math.floor(i / COLS);
  const c = i % COLS;
  const out = [];
  if (r > 0) out.push(i - COLS);
  if (r < ROWS - 1) out.push(i + COLS);
  if (c > 0) out.push(i - 1);
  if (c < COLS - 1) out.push(i + 1);
  return out;
}

// Share price for a chain of `size` tiles.
export function priceOf(chain, size) {
  if (size < 2) return 0;
  const step = size <= 5 ? size : size <= 10 ? 6 : size <= 20 ? 7 : size <= 30 ? 8 : size <= 40 ? 9 : 10;
  return (step + CHAINS[chain].tier) * 100;
}

function sizes(board) {
  const out = CHAINS.map(() => 0);
  for (const v of board) if (typeof v === 'number') out[v]++;
  return out;
}

// What placing tile i would do: single, found, grow, merge, dead (can never be
// played: it would merge two safe chains) or blocked (no chain left to found).
export function analyze(board, i) {
  const near = neighbors(i).filter((n) => board[n] != null);
  const chains = [...new Set(near.filter((n) => typeof board[n] === 'number').map((n) => board[n]))];
  const sz = sizes(board);
  if (chains.length === 0) {
    if (!near.length) return { kind: 'single' };
    const free = CHAINS.map((_, c) => c).filter((c) => sz[c] === 0);
    return free.length ? { kind: 'found', free } : { kind: 'blocked' };
  }
  if (chains.length === 1) return { kind: 'grow', chain: chains[0] };
  if (chains.filter((c) => sz[c] >= SAFE).length >= 2) return { kind: 'dead' };
  const biggest = Math.max(...chains.map((c) => sz[c]));
  return { kind: 'merge', chains, tied: chains.filter((c) => sz[c] === biggest) };
}

// Every tile connected to i (through placed tiles) joins `chain`.
function absorb(board, i, chain) {
  const seen = new Set([i]);
  const stack = [i];
  while (stack.length) {
    const k = stack.pop();
    board[k] = chain;
    for (const n of neighbors(k)) if (board[n] != null && !seen.has(n)) { seen.add(n); stack.push(n); }
  }
}

function say(s, t) {
  s.log.push(t);
  if (s.log.length > 40) s.log.shift();
}

// "Last round": what happened on each of the last turns, one full round of the
// table, so every player can see who founded and bought what. Parts are text
// or { c } for a chain (drawn as its colored name).
function ev(s, ...parts) {
  const rec = s.turns[s.turns.length - 1];
  if (rec) rec.events.push(parts);
}

function newTurnRecord(s) {
  s.turns.push({ seat: s.turn, events: [] });
  // Keep the turn in progress plus one full round before it.
  while (s.turns.length > s.names.length + 1) s.turns.shift();
}

function bankLeft(s, c) {
  return BANK_SHARES - s.players.reduce((n, p) => n + p.shares[c], 0);
}

// Majority and minority bonuses for chain c at the given size.
function payBonuses(s, c, size) {
  const price = priceOf(c, size);
  const holders = s.players.map((p, seat) => ({ seat, n: p.shares[c] })).filter((h) => h.n > 0).sort((a, b) => b.n - a.n);
  if (!holders.length) { say(s, `No one holds ${CHAINS[c].name}: no bonuses`); ev(s, 'No one held ', { c }, ': no bonuses'); return; }
  const major = price * 10;
  const minor = price * 5;
  const pay = (seats, amount, what, kind) => {
    const each = roundUp(amount / seats.length);
    seats.forEach((seat) => { s.players[seat].cash += each; });
    ev(s, `${seats.map((x) => s.names[x]).join(' & ')} ${seats.length > 1 ? 'split' : 'got'} the `, { c }, ` ${kind} bonus (${money(each)}${seats.length > 1 ? ' each' : ''})`);
    say(s, `${seats.map((x) => s.names[x]).join(' & ')} ${seats.length > 1 ? 'split' : 'gets'} the ${what} bonus: ${money(each)}${seats.length > 1 ? ' each' : ''}`);
  };
  const top = holders.filter((h) => h.n === holders[0].n).map((h) => h.seat);
  if (top.length > 1 || holders.length === 1) {
    pay(top, major + minor, `${CHAINS[c].name} majority and minority`, 'majority + minority');
    return;
  }
  pay(top, major, `${CHAINS[c].name} majority`, 'majority');
  const rest = holders.filter((h) => h.n < holders[0].n);
  const second = rest.filter((h) => h.n === rest[0].n).map((h) => h.seat);
  pay(second, minor, `${CHAINS[c].name} minority`, 'minority');
}

function canEnd(s) {
  const sz = sizes(s.board);
  const active = sz.filter((n) => n > 0);
  return sz.some((n) => n >= END_SIZE) || (active.length > 0 && active.every((n) => n >= SAFE));
}

function playable(s, tile) {
  const a = analyze(s.board, tile);
  return a.kind !== 'dead' && a.kind !== 'blocked';
}

function finish(s, why) {
  say(s, why);
  const sz = sizes(s.board);
  CHAINS.forEach((ch, c) => {
    if (sz[c] > 0) {
      payBonuses(s, c, sz[c]);
      const price = priceOf(c, sz[c]);
      s.players.forEach((p) => { p.cash += p.shares[c] * price; p.shares[c] = 0; });
    }
  });
  const best = Math.max(...s.players.map((p) => p.cash));
  s.winners = s.players.map((p, i) => (p.cash === best ? i : -1)).filter((i) => i >= 0);
  s.phase = 'over';
  s.final = s.players.map((p, i) => ({ seat: i, cash: p.cash })).sort((a, b) => b.cash - a.cash);
  say(s, s.winners.length > 1 ? `Tie at ${money(best)}!` : `${s.names[s.winners[0]]} wins with ${money(best)}!`);
}

// Draw back up to 6, swapping out tiles that can never be played.
function refill(s, seat) {
  const hand = s.hands[seat];
  const dead = hand.filter((t) => analyze(s.board, t).kind === 'dead');
  if (dead.length) {
    s.hands[seat] = hand.filter((t) => !dead.includes(t));
    say(s, `${s.names[seat]} swapped out ${dead.length} unplayable tile${dead.length > 1 ? 's' : ''} (${dead.map(label).join(', ')})`);
  }
  while (s.hands[seat].length < HAND && s.bag.length) s.hands[seat].push(s.bag.pop());
}

function nextTurn(s) {
  refill(s, s.turn);
  const n = s.names.length;
  s.turn = (s.turn + 1) % n;
  s.phase = 'place';
  s.pending = null;
  newTurnRecord(s);
  // Nobody can place (every chain is on the board and all tiles would found a
  // new one): swap those tiles for fresh ones. If the tiles run out, it's over.
  const stuck = () => s.hands.every((h) => !h.some((t) => playable(s, t)));
  while (stuck() && s.bag.length) {
    s.hands.forEach((h, seat) => {
      const keep = h.filter((t) => playable(s, t));
      if (keep.length === h.length) return;
      s.hands[seat] = keep;
      while (s.hands[seat].length < HAND && s.bag.length) s.hands[seat].push(s.bag.pop());
    });
    say(s, 'No one could place a tile, so everyone swapped their blocked tiles');
  }
  if (stuck()) finish(s, 'No one can place a tile. Final payout:');
}

function startBuy(s) {
  s.phase = 'buy';
  s.pending = null;
}

// Begin handling the next defunct chain in a merger (or wrap the merger up).
function nextDefunct(s) {
  const m = s.pending;
  if (m.idx >= m.defunct.length) {
    absorb(s.board, m.tile, m.survivor);
    say(s, `${CHAINS[m.survivor].name} now has ${sizes(s.board)[m.survivor]} tiles`);
    return startBuy(s);
  }
  const c = m.defunct[m.idx];
  say(s, `${CHAINS[c].name} (${m.sizes[c]} tiles) merges into ${CHAINS[m.survivor].name}`);
  ev(s, 'Merger: ', { c }, ` (${m.sizes[c]}) into `, { c: m.survivor });
  payBonuses(s, c, m.sizes[c]);
  const n = s.names.length;
  m.deciders = [];
  for (let k = 0; k < n; k++) {
    const seat = (s.turn + k) % n;
    if (s.players[seat].shares[c] > 0) m.deciders.push(seat);
  }
  m.di = 0;
  if (!m.deciders.length) { m.idx++; return nextDefunct(s); }
  s.phase = 'dispose';
}

function beginMerger(s, tile, survivor, chains) {
  const sz = sizes(s.board);
  const defunct = chains.filter((c) => c !== survivor).sort((a, b) => sz[b] - sz[a]);
  s.pending = { tile, survivor, defunct, sizes: Object.fromEntries(chains.map((c) => [c, sz[c]])), idx: 0, deciders: [], di: 0 };
  nextDefunct(s);
}

function cleanOptions(o = {}) {
  return { open: o.open === 'open' ? 'open' : 'hidden' };
}

const game = {
  name: 'MergeHotels',
  blurb: 'Build hotel chains, buy shares, and merge for big bonuses. Richest player wins.',
  tags: ['board', 'strategy', 'tiles', 'stocks', 'shares', 'money', 'business', 'hotels', 'mergers', 'classic', 'acquire', 'family'],
  minPlayers: 2,
  maxPlayers: 6,
  options: [
    { id: 'open', label: 'Cash and shares', type: 'select', default: 'hidden',
      choices: [['hidden', 'Hidden — you see only your own'], ['open', 'Open — everyone sees everything']] },
  ],
  rules(o) {
    const open = cleanOptions(o).open === 'open';
    return 'Each turn: place a tile, buy up to 3 shares, and draw back to 6. A tile beside a lone tile founds a hotel chain, and you get a free share. ' +
      'A tile joining chains merges them: the biggest survives, the top two shareholders of each smaller chain get bonuses, then its shareholders sell, trade 2 for 1, or keep. ' +
      `Chains of ${SAFE}+ tiles are safe. When a chain reaches ${END_SIZE} or every chain is safe, the player on turn may end the game. Final bonuses are paid, shares are sold, and the most money wins. ` +
      (open ? 'Everyone’s cash and shares are shown.' : 'Cash and shares are private.');
  },

  setup(names, options = {}) {
    const n = names.length;
    const bag = shuffle([...Array(COLS * ROWS).keys()]);
    const board = Array(COLS * ROWS).fill(null);
    const s = {
      names, opts: cleanOptions(options), board, bag,
      hands: names.map(() => []),
      players: names.map(() => ({ cash: START_CASH, shares: CHAINS.map(() => 0) })),
      turn: 0, phase: 'place', pending: null, last: null, winners: null, final: null, log: [], turns: [],
    };
    // Each player draws a tile and places it; closest to 1A goes first.
    const starts = names.map(() => bag.pop());
    starts.forEach((t, seat) => { board[t] = 'u'; say(s, `${names[seat]} drew ${label(t)}`); });
    const key = (t) => (t % COLS) * ROWS + Math.floor(t / COLS); // by number, then letter
    s.turn = starts.reduce((best, t, seat) => (key(t) < key(starts[best]) ? seat : best), 0);
    say(s, `${names[s.turn]} is closest to 1A and goes first`);
    newTurnRecord(s);
    for (let seat = 0; seat < n; seat++) refill(s, seat);
    return s;
  },

  viewFor(s, seat) {
    const sz = sizes(s.board);
    const me = s.players[seat];
    const open = s.opts.open === 'open' || s.phase === 'over';
    const chains = CHAINS.map((ch, c) => ({
      c, name: ch.name, short: ch.short, color: ch.color, ink: ch.ink, tier: ch.tier,
      size: sz[c], price: priceOf(c, Math.max(sz[c], 2)), active: sz[c] > 0, safe: sz[c] >= SAFE, bank: bankLeft(s, c),
    }));
    const m = s.pending;
    let ask = null;
    if (s.phase === 'found' && m) ask = { type: 'found', free: m.free };
    if (s.phase === 'survivor' && m) ask = { type: 'survivor', tied: m.tied };
    if (s.phase === 'dispose' && m) {
      const c = m.defunct[m.idx];
      const who = m.deciders[m.di];
      ask = {
        type: 'dispose', chain: c, survivor: m.survivor, who,
        held: who === seat ? me.shares[c] : null,
        survivorBank: bankLeft(s, m.survivor), price: priceOf(c, m.sizes[c]),
      };
    }
    return {
      seat, names: s.names, board: s.board, turn: s.turn, phase: s.phase, last: s.last,
      hand: me ? s.hands[seat].slice().sort((a, b) => a - b).map((t) => ({ t, ...analyze(s.board, t) })) : null,
      me: me ? { cash: me.cash, shares: me.shares } : null,
      others: s.players.map((p, i) => ({ cash: open || i === seat ? p.cash : null, shares: open || i === seat ? p.shares : null, tiles: s.hands[i].length })),
      chains, ask, bag: s.bag.length, canEnd: canEnd(s), open: s.opts.open === 'open',
      winner: s.winners, final: s.final, log: s.log.slice(-4),
      rounds: (s.turns || []).filter((r) => r.events.length).map((r) => ({ seat: r.seat, events: r.events, now: s.phase !== 'over' && r === s.turns[s.turns.length - 1] })),
    };
  },

  applyMove(s, seat, move) {
    if (s.phase === 'over') return 'The game is over.';
    const n = s.names.length;
    if (seat >= n) return 'You’re watching this game.';
    const p = s.players[seat];

    if (s.phase === 'dispose') {
      const m = s.pending;
      if (seat !== m.deciders[m.di]) return `Waiting for ${s.names[m.deciders[m.di]]} to decide.`;
      if (move.type !== 'dispose') return 'Choose what to do with your shares.';
      const c = m.defunct[m.idx];
      const held = p.shares[c];
      const sell = Number(move.sell) || 0;
      const trade = Number(move.trade) || 0;
      if (!Number.isInteger(sell) || !Number.isInteger(trade) || sell < 0 || trade < 0 || trade % 2) return 'Trade in pairs.';
      if (sell + trade > held) return 'You don’t have that many shares.';
      if (trade / 2 > bankLeft(s, m.survivor)) return `Only ${bankLeft(s, m.survivor)} ${CHAINS[m.survivor].name} shares are left to trade for.`;
      const price = priceOf(c, m.sizes[c]);
      p.shares[c] -= sell + trade;
      p.cash += sell * price;
      p.shares[m.survivor] += trade / 2;
      const kept = held - sell - trade;
      const parts = [sell ? `sold ${sell}` : null, trade ? `traded ${trade} for ${trade / 2} ${CHAINS[m.survivor].name}` : null, kept ? `kept ${kept}` : null].filter(Boolean);
      say(s, `${s.names[seat]} ${parts.join(', ')} (${CHAINS[c].name})`);
      ev(s, `${s.names[seat]} ${parts.join(', ')} `, { c });
      m.di++;
      if (m.di >= m.deciders.length) { m.idx++; nextDefunct(s); }
      return null;
    }

    if (seat !== s.turn) return "It isn't your turn.";

    if (move.type === 'end') {
      if (!canEnd(s) || !['place', 'buy'].includes(s.phase)) return 'The game can’t end yet.';
      ev(s, 'Ended the game');
      finish(s, `${s.names[seat]} ended the game. Final payout:`);
      return null;
    }

    if (s.phase === 'place') {
      const hand = s.hands[seat];
      if (move.type === 'skip') {
        if (hand.some((t) => playable(s, t))) return 'You have a tile you can place.';
        say(s, `${s.names[seat]} has no tile to place`);
        ev(s, 'No tile to place');
        startBuy(s);
        return null;
      }
      if (move.type !== 'place') return 'Place a tile.';
      const t = Number(move.tile);
      if (!hand.includes(t)) return 'That tile isn’t in your hand.';
      const a = analyze(s.board, t);
      if (a.kind === 'dead') return 'That tile would merge two safe chains, so it can’t be placed.';
      if (a.kind === 'blocked') return 'All seven chains are on the board, so that tile can’t found a new one yet.';
      s.hands[seat] = hand.filter((x) => x !== t);
      s.board[t] = 'u';
      s.last = t;
      say(s, `${s.names[seat]} placed ${label(t)}`);
      ev(s, `Placed ${label(t)}`);
      if (a.kind === 'grow') ev(s, 'grew ', { c: a.chain });
      if (a.kind === 'single') return startBuy(s), null;
      if (a.kind === 'grow') { absorb(s.board, t, a.chain); startBuy(s); return null; }
      if (a.kind === 'found') {
        s.pending = { tile: t, free: a.free };
        s.phase = 'found';
        return null;
      }
      // merge
      if (a.tied.length > 1) {
        s.pending = { tile: t, chains: a.chains, tied: a.tied };
        s.phase = 'survivor';
        return null;
      }
      beginMerger(s, t, a.tied[0], a.chains);
      return null;
    }

    if (s.phase === 'found') {
      const c = Number(move.chain);
      if (move.type !== 'found' || !s.pending.free.includes(c)) return 'Pick a chain to found.';
      absorb(s.board, s.pending.tile, c);
      const free = bankLeft(s, c) > 0;
      if (free) p.shares[c]++;
      say(s, `${s.names[seat]} founded ${CHAINS[c].name}${free ? ' (+1 free share)' : ''}`);
      ev(s, 'Founded ', { c }, free ? ' (+1 free share)' : '');
      startBuy(s);
      return null;
    }

    if (s.phase === 'survivor') {
      const c = Number(move.chain);
      if (move.type !== 'survivor' || !s.pending.tied.includes(c)) return 'Pick which chain survives.';
      say(s, `${s.names[seat]} chose ${CHAINS[c].name} to survive`);
      ev(s, 'Chose ', { c }, ' to survive');
      beginMerger(s, s.pending.tile, c, s.pending.chains);
      return null;
    }

    if (s.phase === 'buy') {
      if (move.type !== 'buy') return 'Buy shares, or buy nothing.';
      const want = move.buys && typeof move.buys === 'object' ? move.buys : {};
      const sz = sizes(s.board);
      let total = 0;
      let cost = 0;
      for (const [k, v] of Object.entries(want)) {
        const c = Number(k);
        const q = Number(v);
        if (!q) continue;
        if (!CHAINS[c] || !Number.isInteger(q) || q < 0) return 'Pick shares to buy.';
        if (!sz[c]) return `${CHAINS[c].name} isn’t on the board.`;
        if (q > bankLeft(s, c)) return `Only ${bankLeft(s, c)} ${CHAINS[c].name} shares are left.`;
        total += q;
        cost += q * priceOf(c, sz[c]);
      }
      if (total > 3) return 'You can buy up to 3 shares a turn.';
      if (cost > p.cash) return 'You don’t have enough cash.';
      const bought = [];
      for (const [k, v] of Object.entries(want)) {
        const q = Number(v);
        if (!q) continue;
        p.shares[Number(k)] += q;
        bought.push(`${q} ${CHAINS[Number(k)].name}`);
      }
      p.cash -= cost;
      if (bought.length) say(s, `${s.names[seat]} bought ${bought.join(', ')}`);
      const parts = ['Bought '];
      Object.entries(want).filter(([, v]) => Number(v)).forEach(([k, v], i) => { parts.push(`${i ? ', ' : ''}${Number(v)} `, { c: Number(k) }); });
      if (parts.length > 1) ev(s, ...parts);
      else ev(s, 'Bought nothing');
      nextTurn(s);
      return null;
    }
    return 'Not now.';
  },

  render(view, root, send) {
    root.replaceChildren();
    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };
    const btn = (text, cls, fn, disabled) => {
      const b = el('button', cls || '', text);
      b.type = 'button';
      if (disabled) b.disabled = true;
      else b.addEventListener('click', fn);
      return b;
    };
    const chip = (c, text) => {
      const ch = view.chains[c];
      const e = el('span', 'mh-chip', text ?? ch.name);
      e.style.background = ch.color;
      e.style.color = ch.ink;
      return e;
    };
    const player = view.me != null;
    const myTurn = player && view.turn === view.seat && view.phase !== 'over';
    const ask = view.ask;
    const ui = (root.__mh = root.__mh || { pick: null, buys: {} });
    const redraw = () => game.render(view, root, send);
    if (!myTurn || view.phase !== 'place') ui.pick = null;
    if (!myTurn || view.phase !== 'buy') ui.buys = {};

    // Players
    const head = el('div', 'mh-players');
    view.names.forEach((nm, i) => {
      const o = view.others[i];
      const b = el('div', 'mh-player' + (i === view.turn && view.phase !== 'over' ? ' active' : '') + (i === view.seat ? ' me' : ''));
      b.append(el('strong', '', nm), el('span', '', o.cash != null ? money(o.cash) : '$ hidden'));
      head.append(b);
    });
    root.append(head);

    // Status
    let status;
    if (view.phase === 'over') {
      status = view.winner.length > 1 ? 'It’s a tie!' : view.winner[0] === view.seat ? 'You win!' : `${view.names[view.winner[0]]} wins`;
    } else if (ask && ask.type === 'dispose') {
      status = ask.who === view.seat ? `Merger! Decide what to do with your ${view.chains[ask.chain].name} shares`
        : `Merger: ${view.names[ask.who]} is deciding about their ${view.chains[ask.chain].name} shares`;
    } else if (myTurn) {
      status = { place: 'Your turn — place a tile', found: 'You founded a chain! Pick which one', survivor: 'Tie! Pick which chain survives', buy: 'Buy up to 3 shares' }[view.phase];
    } else {
      status = `${view.names[view.turn]} is ${{ place: 'placing a tile', found: 'founding a chain', survivor: 'choosing a survivor', buy: 'buying shares' }[view.phase] || 'playing'}`;
    }
    root.append(el('p', 'status' + (myTurn || (ask && ask.who === view.seat) ? ' mine' : ''), status));

    // Board
    const handSet = new Map((view.hand || []).map((h) => [h.t, h]));
    const board = el('div', 'mh-board');
    view.board.forEach((v, i) => {
      const h = handSet.get(i);
      const canPlace = myTurn && view.phase === 'place' && h && !['dead', 'blocked'].includes(h.kind);
      const cell = el(canPlace ? 'button' : 'div', 'mh-cell' + (v === 'u' ? ' lone' : '') + (h && v == null ? ' mine' : '')
        + (view.last === i ? ' last' : '') + (ui.pick === i ? ' picked' : ''));
      if (typeof v === 'number') {
        cell.style.background = view.chains[v].color;
        cell.style.color = view.chains[v].ink;
        cell.classList.add('chain');
      }
      cell.textContent = label(i);
      if (canPlace) {
        cell.type = 'button';
        cell.addEventListener('click', () => { ui.pick = i; redraw(); });
      }
      board.append(cell);
    });
    root.append(board);

    // Actions
    const act = el('section', 'mh-act');
    if (myTurn && view.phase === 'place') {
      const hand = el('div', 'mh-hand');
      view.hand.forEach((h) => {
        const bad = h.kind === 'dead' || h.kind === 'blocked';
        const b = btn(label(h.t), 'mh-tile' + (ui.pick === h.t ? ' picked' : '') + (bad ? ' bad' : ''), () => { ui.pick = h.t; redraw(); }, bad);
        b.title = h.kind === 'dead' ? 'Can’t be placed: it would merge two safe chains (swapped out at the end of your turn)'
          : h.kind === 'blocked' ? 'Can’t be placed yet: no chain left to found' : '';
        hand.append(b);
      });
      act.append(hand);
      const pick = view.hand.find((h) => h.t === ui.pick);
      const what = pick ? { single: 'just a tile', found: 'founds a chain', grow: `grows ${view.chains[pick.chain]?.name}`, merge: 'starts a merger' }[pick.kind] : null;
      const row = el('div', 'row');
      if (view.hand.some((h) => !['dead', 'blocked'].includes(h.kind))) {
        row.append(btn(pick ? `Place ${label(pick.t)} (${what})` : 'Pick a tile', 'primary', () => send({ type: 'place', tile: pick.t }), !pick));
      } else {
        row.append(btn('No tile can be placed — go to buying', 'primary', () => send({ type: 'skip' })));
      }
      act.append(row);
    } else if (myTurn && view.phase === 'found') {
      const row = el('div', 'mh-choices');
      ask.free.forEach((c) => {
        const b = btn('', 'mh-choice', () => send({ type: 'found', chain: c }));
        b.append(chip(c), el('small', '', ['Budget', 'Mid', 'Luxury'][view.chains[c].tier]));
        row.append(b);
      });
      act.append(row);
    } else if (myTurn && view.phase === 'survivor') {
      const row = el('div', 'mh-choices');
      ask.tied.forEach((c) => {
        const b = btn('', 'mh-choice', () => send({ type: 'survivor', chain: c }));
        b.append(chip(c), el('small', '', `${view.chains[c].size} tiles`));
        row.append(b);
      });
      act.append(row);
    } else if (ask && ask.type === 'dispose' && ask.who === view.seat) {
      const d = (ui.dispose = ui.dispose && ui.dispose.key === `${ask.chain}` ? ui.dispose : { key: `${ask.chain}`, sell: 0, trade: 0 });
      const maxTrade = Math.min(ask.held - d.sell - ((ask.held - d.sell) % 2), ask.survivorBank * 2);
      const keep = ask.held - d.sell - d.trade;
      const stepper = (labelText, value, dec, inc, decOK, incOK) => {
        const r = el('div', 'mh-step');
        r.append(el('span', '', labelText), btn('−', '', dec, !decOK), el('strong', '', String(value)), btn('+', '', inc, !incOK));
        return r;
      };
      act.append(el('p', 'note', `You hold ${ask.held} ${view.chains[ask.chain].name} share${ask.held > 1 ? 's' : ''}. Sell at ${money(ask.price)} each, or trade 2 for 1 ${view.chains[ask.survivor].name}.`));
      act.append(stepper('Sell', d.sell, () => { d.sell--; redraw(); }, () => { d.sell++; redraw(); }, d.sell > 0, d.sell + d.trade < ask.held));
      act.append(stepper('Trade', d.trade, () => { d.trade -= 2; redraw(); }, () => { d.trade += 2; redraw(); }, d.trade > 0, d.trade + 2 <= maxTrade + 0 && d.sell + d.trade + 2 <= ask.held && (d.trade + 2) / 2 <= ask.survivorBank));
      act.append(el('p', 'note', `Keep ${keep}${d.sell ? ` · +${money(d.sell * ask.price)}` : ''}${d.trade ? ` · get ${d.trade / 2} ${view.chains[ask.survivor].name}` : ''}`));
      act.append(btn('Done', 'primary', () => send({ type: 'dispose', sell: d.sell, trade: d.trade })));
    } else if (myTurn && view.phase === 'buy') {
      const active = view.chains.filter((c) => c.active);
      const total = Object.values(ui.buys).reduce((a, b) => a + b, 0);
      const cost = active.reduce((sum, c) => sum + (ui.buys[c.c] || 0) * c.price, 0);
      if (!active.length) act.append(el('p', 'note', 'No chains on the board yet.'));
      active.forEach((c) => {
        const q = ui.buys[c.c] || 0;
        const r = el('div', 'mh-step');
        const name = el('span', '');
        name.append(chip(c.c), ` ${money(c.price)} · ${c.bank} left`);
        r.append(name,
          btn('−', '', () => { ui.buys[c.c] = q - 1; redraw(); }, q <= 0),
          el('strong', '', String(q)),
          btn('+', '', () => { ui.buys[c.c] = q + 1; redraw(); }, total >= 3 || q >= c.bank || cost + c.price > view.me.cash));
        act.append(r);
      });
      act.append(el('p', 'note', `${total} of 3 · cost ${money(cost)} · you have ${money(view.me.cash)}`));
      act.append(btn(total ? `Buy for ${money(cost)} and end turn` : 'Buy nothing and end turn', 'primary', () => send({ type: 'buy', buys: { ...ui.buys } })));
    }
    if (myTurn && view.canEnd && ['place', 'buy'].includes(view.phase)) {
      act.append(btn('End the game now', 'quiet mh-end', () => { if (confirm('End the game now? Final bonuses are paid and all shares are sold.')) send({ type: 'end' }); }));
    }
    if (act.childNodes.length) root.append(act);

    // Last round: who placed, founded and bought what, oldest first.
    if (view.rounds && view.rounds.length) {
      const box = el('section', 'mh-round');
      box.append(el('h3', '', 'Last round'));
      const ol = el('ol', '');
      view.rounds.forEach((r) => {
        const li = el('li', r.now ? 'now' : '');
        li.append(el('strong', '', (r.seat === view.seat ? 'You' : view.names[r.seat]) + (r.now ? ' (now)' : '')));
        const body = el('span', '');
        r.events.forEach((parts, i) => {
          if (i) body.append(' · ');
          parts.forEach((part) => body.append(typeof part === 'string' ? part : chip(part.c)));
        });
        li.append(body);
        ol.append(li);
      });
      box.append(ol);
      root.append(box);
    }

    // Final results
    if (view.phase === 'over' && view.final) {
      const box = el('section', 'mh-final');
      box.append(el('h3', '', 'Final cash'));
      const ol = el('ol', '');
      view.final.forEach((f) => ol.append(el('li', view.winner.includes(f.seat) ? 'win' : '', `${view.names[f.seat]} — ${money(f.cash)}`)));
      box.append(ol);
      root.append(box);
    }

    // Chains table
    const table = el('table', 'mh-table');
    const thead = el('tr', '');
    ['Chain', 'Size', 'Price', 'Left', ...(player ? ['You'] : [])].forEach((t) => thead.append(el('th', '', t)));
    if (view.open) view.names.forEach((nm, i) => { if (i !== view.seat) thead.append(el('th', '', nm.slice(0, 6))); });
    table.append(thead);
    view.chains.forEach((c) => {
      const tr = el('tr', c.active ? '' : 'off');
      const td = el('td', '');
      td.append(chip(c.c), c.safe ? el('small', 'mh-safe', ' safe') : '');
      tr.append(td, el('td', '', c.active ? String(c.size) : '—'), el('td', '', money(c.price)), el('td', '', String(c.bank)));
      if (player) tr.append(el('td', 'mine', String(view.me.shares[c.c] || 0)));
      if (view.open) view.others.forEach((o, i) => { if (i !== view.seat) tr.append(el('td', '', o.shares ? String(o.shares[c.c]) : '')); });
      table.append(tr);
    });
    const wrap = el('div', 'mh-table-wrap');
    wrap.append(table);
    root.append(wrap);
    root.append(el('p', 'note', `${view.bag} tiles left to draw`));

    const log = el('ul', 'log');
    view.log.forEach((l) => log.append(el('li', '', l)));
    root.append(log);
  },

  styles: `
.mh-players { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.5rem; }
.mh-player { flex: 1 1 6.5rem; display: grid; border: 1.5px solid var(--felt-line); border-radius: 10px; padding: 0.3rem 0.55rem; min-width: 0; }
.mh-player strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mh-player span { color: var(--muted); font-size: 0.85rem; }
.mh-player.active { border-color: var(--brass); }
.mh-player.me span { color: var(--chalk); }
.mh-board { display: grid; grid-template-columns: repeat(12, 1fr); gap: 2px; width: min(100%, 34rem); margin: 0.7rem auto; padding: 3px; background: #123d26; border-radius: 8px; }
.mh-cell { aspect-ratio: 1; display: grid; place-items: center; font-size: clamp(0.5rem, 2.2vw, 0.72rem); color: rgba(255, 255, 255, 0.28); background: #1d5236; border-radius: 3px; padding: 0; min-height: 0; border: none; font-weight: 600; }
.mh-cell.lone { background: #8a8f86; color: #1a1a1a; }
.mh-cell.chain { box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.18); }
.mh-cell.mine { box-shadow: inset 0 0 0 2px var(--brass); color: var(--brass); }
button.mh-cell { cursor: pointer; }
.mh-cell.picked { background: var(--brass); color: #1a1a1a; }
.mh-cell.last { outline: 2px solid #fff; outline-offset: -2px; }
.mh-act { display: grid; gap: 0.5rem; margin: 0.4rem 0 0.8rem; }
.mh-hand { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.35rem; }
.mh-tile { padding: 0.55rem 0; font-weight: 700; border-radius: 8px; min-height: 2.6rem; background: #e9e3d0; color: #1a1a1a; border: 2px solid transparent; }
.mh-tile.picked { border-color: var(--brass); background: #fff4cc; }
.mh-tile.bad { opacity: 0.4; text-decoration: line-through; }
.mh-choices { display: grid; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); gap: 0.4rem; }
.mh-choice { display: grid; gap: 0.2rem; justify-items: start; padding: 0.5rem; }
.mh-choice small { color: var(--muted); }
.mh-chip { display: inline-block; padding: 0.1rem 0.45rem; border-radius: 6px; font-weight: 700; font-size: 0.85rem; white-space: nowrap; }
.mh-step { display: grid; grid-template-columns: 1fr 2.6rem 2rem 2.6rem; align-items: center; gap: 0.35rem; }
.mh-step strong { text-align: center; font-size: 1.1rem; }
.mh-step button { padding: 0; min-height: 2.4rem; font-size: 1.2rem; }
.mh-end { justify-self: start; }
.mh-table-wrap { overflow-x: auto; }
.mh-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.mh-table th { text-align: left; color: var(--muted); font-weight: 600; padding: 0.25rem 0.3rem; white-space: nowrap; }
.mh-table td { padding: 0.25rem 0.3rem; border-top: 1px solid var(--felt-line); white-space: nowrap; }
.mh-table tr.off td { opacity: 0.55; }
.mh-table td.mine { font-weight: 700; color: var(--brass); }
.mh-safe { color: var(--brass); font-weight: 700; }
.mh-round { margin: 0.2rem 0 0.8rem; }
.mh-round h3 { margin: 0.2rem 0 0.4rem; font-size: 1rem; }
.mh-round ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.35rem; }
.mh-round li { display: grid; gap: 0.15rem; border-left: 3px solid var(--felt-line); padding: 0.15rem 0 0.15rem 0.55rem; font-size: 0.88rem; line-height: 1.6; }
.mh-round li.now { border-left-color: var(--brass); }
.mh-round li .mh-chip { font-size: 0.78rem; padding: 0 0.35rem; }
.mh-final { border: 1.5px solid var(--brass); border-radius: 12px; padding: 0.3rem 0.9rem 0.6rem; margin: 0.4rem 0 0.8rem; }
.mh-final h3 { margin: 0.4rem 0; }
.mh-final li.win { color: var(--brass); font-weight: 700; }
`,
};

export default game;
