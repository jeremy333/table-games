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
  const paid = [];
  if (!holders.length) { say(s, `No one holds ${CHAINS[c].name}: no bonuses`); ev(s, 'No one held ', { c }, ': no bonuses'); return paid; }
  const major = price * 10;
  const minor = price * 5;
  const pay = (seats, amount, what, kind) => {
    const each = roundUp(amount / seats.length);
    seats.forEach((seat) => { s.players[seat].cash += each; });
    paid.push({ seats, kind, each });
    ev(s, `${seats.map((x) => s.names[x]).join(' & ')} ${seats.length > 1 ? 'split' : 'got'} the `, { c }, ` ${kind} bonus (${money(each)}${seats.length > 1 ? ' each' : ''})`);
    say(s, `${seats.map((x) => s.names[x]).join(' & ')} ${seats.length > 1 ? 'split' : 'gets'} the ${what} bonus: ${money(each)}${seats.length > 1 ? ' each' : ''}`);
  };
  const top = holders.filter((h) => h.n === holders[0].n).map((h) => h.seat);
  if (top.length > 1 || holders.length === 1) {
    pay(top, major + minor, `${CHAINS[c].name} majority and minority`, 'majority + minority');
    return paid;
  }
  pay(top, major, `${CHAINS[c].name} majority`, 'majority');
  const rest = holders.filter((h) => h.n < holders[0].n);
  const second = rest.filter((h) => h.n === rest[0].n).map((h) => h.seat);
  pay(second, minor, `${CHAINS[c].name} minority`, 'minority');
  return paid;
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
  // Nothing they can buy (not enough cash, or no shares left): skip the buy step.
  // Kept when the game can end, so they still get the chance to end it.
  const p = s.players[s.turn];
  const sz = sizes(s.board);
  const affordable = CHAINS.some((_, c) => sz[c] > 0 && bankLeft(s, c) > 0 && priceOf(c, sz[c]) <= p.cash);
  if (!affordable && !canEnd(s)) {
    const anyForSale = CHAINS.some((_, c) => sz[c] > 0 && bankLeft(s, c) > 0);
    const why = anyForSale ? 'Not enough cash to buy — buy step skipped' : 'No shares to buy — buy step skipped';
    say(s, `${s.names[s.turn]}: ${why.toLowerCase()}`);
    ev(s, why);
    nextTurn(s);
  }
}

// Mergers, one company coming off at a time (biggest first):
//  1. bonuses are paid to its top two shareholders, and everyone sees who got what;
//  2. each shareholder, starting with the merging player, sells, trades or keeps;
//  3. everyone sees the full list of choices and taps OK;
// then the merging player finishes their turn by buying.
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
  m.bonuses = payBonuses(s, c, m.sizes[c]);
  m.choices = [];
  m.acks = [];
  const n = s.names.length;
  m.deciders = [];
  for (let k = 0; k < n; k++) {
    const seat = (s.turn + k) % n;
    if (s.players[seat].shares[c] > 0) m.deciders.push(seat);
  }
  m.di = 0;
  // No one held shares: nothing to decide or confirm.
  if (!m.deciders.length) { m.idx++; return nextDefunct(s); }
  s.phase = 'dispose';
}

function beginMerger(s, tile, survivor, chains) {
  const sz = sizes(s.board);
  const defunct = chains.filter((c) => c !== survivor).sort((a, b) => sz[b] - sz[a]);
  s.pending = {
    tile, survivor, defunct, sizes: Object.fromEntries(chains.map((c) => [c, sz[c]])),
    idx: 0, deciders: [], di: 0, bonuses: [], choices: [], acks: [],
  };
  nextDefunct(s);
}

function reviewDone(s) {
  const m = s.pending;
  m.idx++;
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
      'A tile joining chains merges them: the bigger chain stays (on a tie, the merging player picks) and the smaller comes off. Its top two shareholders get bonuses, ' +
      'then each shareholder, starting with the merging player, sells, trades 2 for 1, or keeps. Everyone sees the choices and taps OK, then the merging player buys. ' +
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
    let merger = null;
    if ((s.phase === 'dispose' || s.phase === 'review') && m) {
      const c = m.defunct[m.idx];
      merger = {
        chain: c, survivor: m.survivor, size: m.sizes[c], price: priceOf(c, m.sizes[c]),
        merger: s.turn, bonuses: m.bonuses, choices: m.choices,
        deciders: m.deciders, who: s.phase === 'dispose' ? m.deciders[m.di] : null,
        acks: m.acks, more: m.defunct.length - m.idx - 1,
      };
      if (s.phase === 'dispose' && merger.who === seat) {
        ask = { type: 'dispose', chain: c, survivor: m.survivor, held: me.shares[c], survivorBank: bankLeft(s, m.survivor), price: merger.price };
      }
      if (s.phase === 'review' && me && !m.acks.includes(seat)) ask = { type: 'review' };
    }
    return {
      seat, names: s.names, board: s.board, turn: s.turn, phase: s.phase, last: s.last,
      hand: me ? s.hands[seat].slice().sort((a, b) => a - b).map((t) => ({ t, ...analyze(s.board, t) })) : null,
      me: me ? { cash: me.cash, shares: me.shares } : null,
      others: s.players.map((p, i) => ({ cash: open || i === seat ? p.cash : null, shares: open || i === seat ? p.shares : null, tiles: s.hands[i].length })),
      chains, ask, merger, bag: s.bag.length, canEnd: canEnd(s), open: s.opts.open === 'open',
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
      // The host can move things along if a shareholder is away: they keep their shares.
      if (move.type === 'skipDecision' && seat === 0 && m.deciders[m.di] !== 0) {
        const away = m.deciders[m.di];
        const c = m.defunct[m.idx];
        const held = s.players[away].shares[c];
        m.choices.push({ seat: away, sell: 0, trade: 0, kept: held, cash: 0, skipped: true });
        say(s, `The host skipped ${s.names[away]}, who keeps ${held} ${CHAINS[c].name}`);
        ev(s, `${s.names[away]} kept ${held} (skipped by host) `, { c });
        m.di++;
        if (m.di >= m.deciders.length) s.phase = 'review';
        return null;
      }
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
      m.choices.push({ seat, sell, trade, kept, cash: sell * price });
      const parts = [sell ? `sold ${sell}` : null, trade ? `traded ${trade} for ${trade / 2} ${CHAINS[m.survivor].name}` : null, kept ? `kept ${kept}` : null].filter(Boolean);
      say(s, `${s.names[seat]} ${parts.join(', ')} (${CHAINS[c].name})`);
      ev(s, `${s.names[seat]} ${parts.join(', ')} `, { c });
      m.di++;
      if (m.di >= m.deciders.length) s.phase = 'review';
      return null;
    }

    if (s.phase === 'review') {
      const m = s.pending;
      if (move.type === 'continue') {
        if (seat !== 0) return 'Only the host can continue without waiting.';
        say(s, 'The host continued without waiting');
        reviewDone(s);
        return null;
      }
      if (move.type !== 'ok') return 'Tap OK to continue.';
      if (!m.acks.includes(seat)) m.acks.push(seat);
      if (m.acks.length >= n) reviewDone(s);
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
    const line = (...parts) => {
      const e = el('span', '');
      parts.forEach((p) => e.append(typeof p === 'object' && p && 'c' in p ? chip(p.c) : p));
      return e;
    };
    const who = (seat) => (seat === view.seat ? 'You' : view.names[seat]);
    const player = view.me != null;
    const myTurn = player && view.turn === view.seat && view.phase !== 'over';
    const ask = view.ask;
    const mg = view.merger;
    const ui = (root.__mh = root.__mh || { pick: null, buys: {}, dispose: null });
    const redraw = () => game.render(view, root, send);
    if (!myTurn || view.phase !== 'place') ui.pick = null;
    if (!myTurn || view.phase !== 'buy') ui.buys = {};
    if (!ask || ask.type !== 'dispose') ui.dispose = null;

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
    } else if (mg && view.phase === 'dispose') {
      status = mg.who === view.seat ? `Merger! What will you do with your ${view.chains[mg.chain].name} shares?`
        : `Merger: ${view.names[mg.who]} is deciding about their ${view.chains[mg.chain].name} shares`;
    } else if (mg && view.phase === 'review') {
      status = ask ? 'Merger done — check everyone’s choices and tap OK' : 'Waiting for everyone to tap OK';
    } else if (myTurn) {
      status = { place: 'Your turn — place a tile', found: 'You founded a chain! Pick which one', survivor: 'Tie! Pick which chain stays on the board', buy: 'Buy up to 3 shares' }[view.phase];
    } else {
      status = `${view.names[view.turn]} is ${{ place: 'placing a tile', found: 'founding a chain', survivor: 'choosing which chain stays', buy: 'buying shares' }[view.phase] || 'playing'}`;
    }
    root.append(el('p', 'status' + (myTurn || ask ? ' mine' : ''), status));

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

    // Merger announcement: bonuses, then each shareholder's choice, for everyone to see.
    if (mg) {
      const box = el('section', 'mh-merger');
      box.append(el('h3', '', ''));
      box.lastChild.append(line('Merger: ', { c: mg.chain }, ` (${mg.size} tiles) comes off — `, { c: mg.survivor }, ' stays'));
      box.append(el('p', 'note', `${who(mg.merger)} made the merger. ${view.chains[mg.chain].name} shares are worth ${money(mg.price)} each.`
        + (mg.more ? ` ${mg.more} more chain${mg.more > 1 ? 's' : ''} to merge after this one.` : '')));
      box.append(el('h4', '', 'Bonuses paid'));
      const bl = el('ul', '');
      if (!mg.bonuses.length) bl.append(el('li', '', 'No one held shares'));
      mg.bonuses.forEach((b) => bl.append(el('li', '', `${b.seats.map(who).join(' & ')} — ${b.kind}: ${money(b.each)}${b.seats.length > 1 ? ' each' : ''}`)));
      box.append(bl);
      box.append(el('h4', '', 'Shareholders’ choices'));
      const cl = el('ul', 'mh-choices-list');
      mg.deciders.forEach((seat, k) => {
        const ch = mg.choices[k];
        let text;
        if (ch) {
          text = [ch.sell ? `sold ${ch.sell} (+${money(ch.cash)})` : null, ch.trade ? `traded ${ch.trade} for ${ch.trade / 2} ${view.chains[mg.survivor].name}` : null,
            ch.kept ? `kept ${ch.kept}` : null].filter(Boolean).join(', ') + (ch.skipped ? ' (skipped by host)' : '');
        } else text = seat === mg.who ? 'deciding now…' : 'waiting…';
        const li = el('li', ch ? '' : seat === mg.who ? 'now' : 'later');
        li.append(el('strong', '', who(seat) + ': '), text);
        cl.append(li);
      });
      box.append(cl);
      if (view.phase === 'dispose' && view.seat === 0 && mg.who !== 0) {
        box.append(btn(`${view.names[mg.who]} is away? Skip — they keep their shares`, 'quiet', () => {
          if (confirm(`Skip ${view.names[mg.who]}? They keep all their ${view.chains[mg.chain].name} shares.`)) send({ type: 'skipDecision' });
        }));
      }
      if (view.phase === 'review') {
        const waiting = view.names.map((_, i) => i).filter((i) => !mg.acks.includes(i));
        box.append(el('p', 'note', waiting.length ? `Waiting for OK from: ${waiting.map(who).join(', ')}` : ''));
        const row = el('div', 'row');
        if (ask && ask.type === 'review') row.append(btn('OK', 'primary', () => send({ type: 'ok' })));
        if (view.seat === 0 && waiting.length && !(ask && ask.type === 'review')) {
          row.append(btn('Continue without waiting', 'quiet', () => send({ type: 'continue' })));
        }
        if (row.childNodes.length) box.append(row);
      }
      root.append(box);
    }

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
      act.append(el('p', 'note', 'These chains are the same size. Pick the one that stays on the board and grows; the other comes off.'));
      const row = el('div', 'mh-choices');
      ask.tied.forEach((c) => {
        const b = btn('', 'mh-choice', () => send({ type: 'survivor', chain: c }));
        b.append(chip(c), el('small', '', `${view.chains[c].size} tiles — keep this one`));
        row.append(b);
      });
      act.append(row);
    } else if (ask && ask.type === 'dispose') {
      if (!ui.dispose || ui.dispose.chain !== ask.chain || ui.dispose.held !== ask.held) ui.dispose = { chain: ask.chain, held: ask.held, sell: 0, trade: 0 };
      const d = ui.dispose;
      const canTradeMore = d.sell + d.trade + 2 <= ask.held && (d.trade + 2) / 2 <= ask.survivorBank;
      const stepper = (labelText, value, dec, inc, decOK, incOK) => {
        const r = el('div', 'mh-step');
        r.append(el('span', '', labelText), btn('−', '', dec, !decOK), el('strong', '', String(value)), btn('+', '', inc, !incOK));
        return r;
      };
      act.append(el('p', 'note', `You hold ${ask.held} ${view.chains[ask.chain].name} share${ask.held > 1 ? 's' : ''}. Sell for ${money(ask.price)} each, trade 2 for 1 ${view.chains[ask.survivor].name} (${ask.survivorBank} left), or keep them in case ${view.chains[ask.chain].name} comes back.`));
      act.append(stepper('Sell', d.sell, () => { d.sell--; redraw(); }, () => { d.sell++; redraw(); }, d.sell > 0, d.sell + d.trade < ask.held));
      act.append(stepper('Trade', d.trade, () => { d.trade -= 2; redraw(); }, () => { d.trade += 2; redraw(); }, d.trade > 0, canTradeMore));
      const keep = ask.held - d.sell - d.trade;
      act.append(el('p', 'note', `Keep ${keep}${d.sell ? ` · get ${money(d.sell * ask.price)}` : ''}${d.trade ? ` · get ${d.trade / 2} ${view.chains[ask.survivor].name}` : ''}`));
      act.append(btn('Done', 'primary', () => send({ type: 'dispose', sell: d.sell, trade: d.trade })));
    }
    if (act.childNodes.length) root.append(act);

    // Final results
    if (view.phase === 'over' && view.final) {
      const box = el('section', 'mh-final');
      box.append(el('h3', '', 'Final cash'));
      const ol = el('ol', '');
      view.final.forEach((f) => ol.append(el('li', view.winner.includes(f.seat) ? 'win' : '', `${view.names[f.seat]} — ${money(f.cash)}`)));
      box.append(ol);
      root.append(box);
    }

    // Hotels: size, price, shares left, what you own — and buying, all in one place.
    const buying = myTurn && view.phase === 'buy';
    const total = Object.values(ui.buys).reduce((a, b) => a + b, 0);
    const cost = view.chains.reduce((sum, c) => sum + (ui.buys[c.c] || 0) * c.price, 0);
    const hotels = el('section', 'mh-hotels' + (buying ? ' buying' : ''));
    const hdr = el('div', 'mh-row mh-hdr');
    ['Hotel', 'Size', 'Price', 'Left', 'You'].forEach((t) => hdr.append(el('span', '', t)));
    if (buying) hdr.append(el('span', 'mh-buycol', 'Buy'));
    hotels.append(hdr);
    view.chains.forEach((c) => {
      const row = el('div', 'mh-row' + (c.active ? '' : ' off'));
      const name = el('span', 'mh-name');
      name.append(chip(c.c));
      if (c.safe) name.append(el('small', 'mh-safe', 'safe'));
      row.append(name, el('span', '', c.active ? String(c.size) : '—'), el('span', '', money(c.price)), el('span', '', String(c.bank)),
        el('span', 'mine', player ? String(view.me.shares[c.c] || 0) : '—'));
      if (buying) {
        const q = ui.buys[c.c] || 0;
        const st = el('span', 'mh-buy');
        if (c.active) {
          st.append(
            btn('−', '', () => { ui.buys[c.c] = q - 1; redraw(); }, q <= 0),
            el('strong', '', String(q)),
            btn('+', '', () => { ui.buys[c.c] = q + 1; redraw(); }, total >= 3 || q >= c.bank || cost + c.price > view.me.cash));
        }
        row.append(st);
      }
      hotels.append(row);
      if (view.open) {
        const others = view.others.map((o, i) => (i !== view.seat && o.shares && o.shares[c.c] ? `${view.names[i]} ${o.shares[c.c]}` : null)).filter(Boolean);
        if (others.length) hotels.append(el('div', 'mh-others', others.join(' · ')));
      }
    });
    if (buying) {
      hotels.append(el('p', 'note mh-total', `${total} of 3 · cost ${money(cost)} · you have ${money(view.me.cash)}`));
      hotels.append(btn(total ? `Buy for ${money(cost)} and end turn` : 'Buy nothing and end turn', 'primary', () => send({ type: 'buy', buys: { ...ui.buys } })));
    }
    if (myTurn && view.canEnd && ['place', 'buy'].includes(view.phase)) {
      hotels.append(btn('End the game now', 'quiet mh-end', () => { if (confirm('End the game now? Final bonuses are paid and all shares are sold.')) send({ type: 'end' }); }));
    }
    root.append(hotels);
    root.append(el('p', 'note', `${view.bag} tiles left to draw`));

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
.mh-hotels { display: grid; gap: 0.15rem; margin: 0.3rem 0 0.4rem; font-size: 0.86rem; }
.mh-row { display: grid; grid-template-columns: minmax(5.8rem, 1.6fr) 2.1rem 3.1rem 1.9rem 1.9rem; align-items: center; gap: 0.3rem; padding: 0.2rem 0; border-top: 1px solid var(--felt-line); }
.mh-hotels.buying .mh-row { grid-template-columns: minmax(5.4rem, 1.5fr) 1.8rem 2.9rem 1.7rem 1.7rem 6.4rem; }
.mh-row.mh-hdr { border-top: none; color: var(--muted); font-weight: 600; font-size: 0.78rem; }
.mh-row.off > span:not(.mh-buy) { opacity: 0.5; }
.mh-row .mine { font-weight: 700; color: var(--brass); }
.mh-name { display: flex; align-items: center; gap: 0.25rem; min-width: 0; }
.mh-buy { display: grid; grid-template-columns: 2rem 1.6rem 2rem; align-items: center; gap: 0.2rem; }
.mh-buy button { padding: 0; min-height: 2.1rem; font-size: 1.1rem; }
.mh-buy strong { text-align: center; }
.mh-buycol { text-align: center; }
.mh-others { color: var(--muted); font-size: 0.78rem; padding: 0 0 0.2rem 0.3rem; }
.mh-total { margin-top: 0.4rem; }
.mh-merger { border: 1.5px solid var(--brass); border-radius: 12px; padding: 0.5rem 0.8rem 0.7rem; margin: 0.2rem 0 0.8rem; background: rgba(212, 173, 58, 0.07); }
.mh-merger h3 { margin: 0.1rem 0 0.3rem; font-size: 1rem; line-height: 1.7; }
.mh-merger h4 { margin: 0.6rem 0 0.2rem; font-size: 0.9rem; color: var(--muted); }
.mh-merger ul { margin: 0; padding-left: 1.1rem; font-size: 0.9rem; }
.mh-merger li.now { color: var(--brass); }
.mh-merger li.later { color: var(--muted); }
.mh-merger .row { margin-top: 0.6rem; }
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
