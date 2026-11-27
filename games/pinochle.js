// Pinochle — 4 players, partners sit across (players 1 & 3 vs 2 & 4, lobby order).
// 48-card deck (9 through Ace, two of each). Bid for the right to name trump,
// partners exchange cards, meld is counted for you, then 12 tricks.
// Counters: Aces, 10s and Kings are worth 10; the last trick is worth 10 (250 total).
import { shuffle, SUIT_SYMBOL, SUIT_NAME, cardEl } from '../js/cards.js';

const SUITS = ['S', 'H', 'C', 'D'];
const RANKS = ['A', '10', 'K', 'Q', 'J', '9']; // high to low
const rankOf = (c) => c.slice(0, -1);
const suitOf = (c) => c.slice(-1);
const strength = (c) => 6 - RANKS.indexOf(rankOf(c));
const label = (c) => `${rankOf(c)}${SUIT_SYMBOL[suitOf(c)]}`;
const isCounter = (c) => ['A', '10', 'K'].includes(rankOf(c));

function makeDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push(r + s, r + s);
  return d;
}

function sortHand(h, trump) {
  const order = (c) => {
    const s = suitOf(c);
    const si = s === trump ? -1 : SUITS.indexOf(s);
    return si * 10 + RANKS.indexOf(rankOf(c));
  };
  return h.slice().sort((a, b) => order(a) - order(b));
}

// ---------- meld ----------
export function meldOf(hand, trump) {
  const n = (r, s) => hand.filter((c) => c === r + s).length;
  const items = [];
  const add = (name, points) => { if (points) items.push({ name, points }); };
  const run = trump ? Math.min(n('A', trump), n('10', trump), n('K', trump), n('Q', trump), n('J', trump)) : 0;
  if (run === 2) add('Double run', 1500);
  else if (run === 1) add('Run in trump', 150);
  if (trump) {
    const royal = Math.min(n('K', trump), n('Q', trump)) - run;
    for (let i = 0; i < royal; i++) add('Royal marriage', 40);
    const dix = n('9', trump);
    for (let i = 0; i < dix; i++) add('Dix (9 of trump)', 10);
  }
  for (const s of SUITS) {
    if (s === trump) continue;
    const m = Math.min(n('K', s), n('Q', s));
    for (let i = 0; i < m; i++) add(`Marriage in ${SUIT_NAME[s]}`, 20);
  }
  const pin = Math.min(n('Q', 'S'), n('J', 'D'));
  if (pin === 2) add('Double pinochle', 300);
  else if (pin === 1) add('Pinochle (Q♠ J♦)', 40);
  const around = (r, one, two, word) => {
    const k = Math.min(...SUITS.map((s) => n(r, s)));
    if (k === 2) add(`Double ${word} around`, two);
    else if (k === 1) add(`${word} around`, one);
  };
  around('A', 100, 1000, 'Aces');
  around('K', 80, 800, 'Kings');
  around('Q', 60, 600, 'Queens');
  around('J', 40, 400, 'Jacks');
  return { items, total: items.reduce((t, i) => t + i.points, 0) };
}

// ---------- trick rules ----------
function currentWinner(trick, trump) {
  const led = suitOf(trick[0].card);
  let best = trick[0];
  for (const t of trick.slice(1)) {
    const bt = suitOf(best.card) === trump;
    const tt = suitOf(t.card) === trump;
    if (tt && !bt) best = t;
    else if (tt === bt && suitOf(t.card) === suitOf(best.card) && strength(t.card) > strength(best.card)) best = t;
    else if (!tt && !bt && suitOf(t.card) === led && suitOf(best.card) !== led) best = t;
  }
  return best;
}

// Follow suit and beat the trick if you can; if you can't follow, trump (and over-trump) if you can.
function legalCards(hand, trick, trump) {
  if (!trick.length) return hand.slice();
  const led = suitOf(trick[0].card);
  const win = currentWinner(trick, trump);
  const follow = hand.filter((c) => suitOf(c) === led);
  if (follow.length) {
    if (suitOf(win.card) === led) {
      const beat = follow.filter((c) => strength(c) > strength(win.card));
      if (beat.length) return beat;
    }
    return follow;
  }
  const trumps = hand.filter((c) => suitOf(c) === trump);
  if (trumps.length) {
    if (suitOf(win.card) === trump) {
      const over = trumps.filter((c) => strength(c) > strength(win.card));
      if (over.length) return over;
    }
    return trumps;
  }
  return hand.slice();
}

function say(s, t) {
  s.log.push(t);
  if (s.log.length > 30) s.log.shift();
}

const team = (seat) => seat % 2;

function deal(s) {
  const deck = shuffle(makeDeck());
  s.hands = [[], [], [], []];
  for (let i = 0; i < 48; i++) s.hands[(s.dealer + 1 + i) % 4].push(deck[i]);
  Object.assign(s, {
    phase: 'bid', bid: 0, bidder: null, passed: [false, false, false, false], turn: (s.dealer + 1) % 4,
    trump: null, trick: [], lastTrick: null, taken: [[], []], tricksWon: [0, 0], melds: null, summary: null,
    ready: [false, false, false, false],
  });
  say(s, `${s.names[s.dealer]} dealt`);
}

function finishBidding(s) {
  if (s.bidder == null) {
    s.bidder = [0, 1, 2, 3].find((p) => !s.passed[p]);
    s.bid = s.opts.minBid;
    say(s, `${s.names[s.bidder]} takes it at ${s.bid}`);
  }
  s.phase = 'trump';
  s.turn = s.bidder;
}

function afterPassing(s) {
  s.melds = s.hands.map((h) => meldOf(h, s.trump));
  s.phase = 'meld';
  s.ready = [false, false, false, false];
}

function endHand(s, lastWinner) {
  const counters = [0, 1].map((t) => s.taken[t].filter(isCounter).length * 10);
  counters[team(lastWinner)] += 10;
  const meld = [0, 1].map((t) => s.melds[t].total + s.melds[t + 2].total);
  const kept = [0, 1].map((t) => (s.tricksWon[t] > 0 ? meld[t] : 0)); // a team must take a trick to keep its meld
  const bt = team(s.bidder);
  const total = [0, 1].map((t) => kept[t] + counters[t]);
  const made = total[bt] >= s.bid;
  const delta = [0, 1].map((t) => (t === bt && !made ? -s.bid : total[t]));
  s.scores[0] += delta[0];
  s.scores[1] += delta[1];
  const tn = s.teamNames;
  s.summary = {
    headline: `${tn[bt]} bid ${s.bid} and ${made ? 'made it' : 'got set'}.`,
    lines: [0, 1].map((t) => `${tn[t]}: meld ${kept[t]}${kept[t] !== meld[t] ? ` (lost ${meld[t]} — no tricks)` : ''} + counters ${counters[t]} → ${delta[t] >= 0 ? '+' : ''}${delta[t]}`),
  };
  say(s, made ? `${tn[bt]} made the bid` : `${tn[bt]} got set`);
  if (s.scores.some((x) => x >= s.opts.playTo)) {
    // If both teams cross the line in the same hand, the bidding team wins.
    const both = s.scores.every((x) => x >= s.opts.playTo);
    s.winTeam = both ? bt : (s.scores[0] >= s.opts.playTo ? 0 : 1);
    s.phase = 'over';
    say(s, `${tn[s.winTeam]} win the game!`);
  } else {
    s.phase = 'handOver';
  }
  s.ready = [false, false, false, false];
}

export default {
  minPlayers: 4,
  maxPlayers: 4,
  teams: true, // partners sit across the table; the host chooses them in the lobby
  options: [
    { id: 'minBid', label: 'Minimum bid', type: 'select', default: '250', choices: [['150', '150'], ['200', '200'], ['250', '250']] },
    { id: 'pass', label: 'Cards partners exchange', type: 'select', default: '4', choices: [['4', '4 cards'], ['3', '3 cards'], ['0', 'No exchange']] },
    { id: 'playTo', label: 'Play to', type: 'select', default: '1500', choices: [['500', '500'], ['1000', '1000'], ['1500', '1500']] },
  ],
  rules(o) {
    const pass = Number(o?.pass ?? 4);
    return `Two teams of partners, chosen by the host in the lobby. Bid from ${o?.minBid || 250} by 10s; the high bidder names trump. ` +
      (pass ? `Their partner passes them ${pass} cards, and they pass ${pass} back. ` : '') +
      'Meld is counted for you. In play, follow suit and beat the trick if you can; if you can’t follow, trump if you can. ' +
      `Aces, 10s and Kings are worth 10 and the last trick 10. A team must take a trick to keep its meld. Play to ${o?.playTo || 1500}.`;
  },

  setup(names, options = {}) {
    const opts = {
      minBid: [150, 200, 250].includes(Number(options.minBid)) ? Number(options.minBid) : 250,
      pass: [0, 3, 4].includes(Number(options.pass)) ? Number(options.pass) : 4,
      playTo: [500, 1000, 1500].includes(Number(options.playTo)) ? Number(options.playTo) : 1500,
    };
    const s = { names, opts, teamNames: [`${names[0]} & ${names[2]}`, `${names[1]} & ${names[3]}`], scores: [0, 0], dealer: 3, winTeam: null, log: [] };
    deal(s);
    return s;
  },

  viewFor(s, seat) {
    const myTurn = s.turn === seat;
    return {
      seat,
      names: s.names,
      teamNames: s.teamNames,
      phase: s.phase,
      turn: s.turn,
      opts: s.opts,
      bid: s.bid,
      bidder: s.bidder,
      passed: s.passed,
      trump: s.trump,
      hand: sortHand(s.hands[seat], s.trump),
      handSize: s.hands[seat].length,
      melds: s.melds,
      trick: s.trick,
      lastTrick: s.lastTrick,
      trickWinner: s.phase === 'trickEnd' ? s.lastTrick.winner : null,
      tricksWon: s.tricksWon,
      scores: s.scores,
      playable: s.phase === 'play' && myTurn ? legalCards(s.hands[seat], s.trick, s.trump) : [],
      summary: s.summary,
      ready: s.ready,
      winner: s.winTeam == null ? null : [s.winTeam, s.winTeam + 2],
      log: s.log.slice(-4),
    };
  },

  applyMove(s, seat, move) {
    if (s.phase === 'over') return 'The game is over.';

    if (['meld', 'trickEnd', 'handOver'].includes(s.phase)) {
      if (move.type === 'continue') {
        if (seat !== 0) return 'Only the host can continue without waiting.';
        s.ready = [true, true, true, true];
      } else if (move.type === 'ready') s.ready[seat] = true;
      else return 'Tap Ready to continue.';
      if (!s.ready.every(Boolean)) return null;
      if (s.phase === 'meld') { s.phase = 'play'; s.turn = s.bidder; say(s, `${s.names[s.bidder]} leads`); }
      else if (s.phase === 'trickEnd') {
        s.trick = [];
        if (s.hands.every((h) => h.length === 0)) endHand(s, s.lastTrick.winner);
        else { s.phase = 'play'; s.turn = s.lastTrick.winner; }
      } else { s.dealer = (s.dealer + 1) % 4; deal(s); }
      return null;
    }

    if (seat !== s.turn) return "It isn't your turn.";
    const name = s.names[seat];
    const hand = s.hands[seat];

    if (s.phase === 'bid') {
      if (move.type === 'pass') {
        s.passed[seat] = true;
        say(s, `${name} passed`);
      } else if (move.type === 'bid') {
        const low = s.bidder == null ? s.opts.minBid : s.bid + 10;
        const amt = Number(move.amount);
        if (!Number.isInteger(amt) || amt < low || amt % 10) return `Bid at least ${low}, by 10s.`;
        s.bid = amt;
        s.bidder = seat;
        say(s, `${name} bid ${amt}`);
      } else return 'Bid or pass.';
      if (s.passed.filter((p) => !p).length === 1) finishBidding(s);
      else {
        let n = seat;
        do { n = (n + 1) % 4; } while (s.passed[n]);
        s.turn = n;
      }
      return null;
    }

    if (s.phase === 'trump') {
      if (move.type !== 'trump' || !SUITS.includes(move.suit)) return 'Name trump.';
      s.trump = move.suit;
      say(s, `Trump is ${SUIT_NAME[move.suit]}`);
      if (s.opts.pass) { s.phase = 'passIn'; s.turn = (s.bidder + 2) % 4; }
      else afterPassing(s);
      return null;
    }

    if (s.phase === 'passIn' || s.phase === 'passBack') {
      if (move.type !== 'give') return `Choose ${s.opts.pass} cards to pass.`;
      const cards = Array.isArray(move.cards) ? move.cards : [];
      if (cards.length !== s.opts.pass) return `Choose exactly ${s.opts.pass}.`;
      const copy = hand.slice();
      for (const c of cards) {
        const i = copy.indexOf(c);
        if (i < 0) return "Those cards aren't all in your hand.";
        copy.splice(i, 1);
      }
      s.hands[seat] = copy;
      const to = s.phase === 'passIn' ? s.bidder : (s.bidder + 2) % 4;
      s.hands[to].push(...cards);
      say(s, `${name} passed ${cards.length} cards`);
      if (s.phase === 'passIn') { s.phase = 'passBack'; s.turn = s.bidder; }
      else afterPassing(s);
      return null;
    }

    if (s.phase === 'play') {
      if (move.type !== 'play') return 'Play a card.';
      if (!legalCards(hand, s.trick, s.trump).includes(move.card)) {
        return hand.includes(move.card) ? 'You must follow suit and beat the trick (or trump) if you can.' : "That card isn't in your hand.";
      }
      hand.splice(hand.indexOf(move.card), 1);
      s.trick.push({ seat, card: move.card });
      if (s.trick.length < 4) { s.turn = (seat + 1) % 4; return null; }
      const win = currentWinner(s.trick, s.trump).seat;
      s.taken[team(win)].push(...s.trick.map((t) => t.card));
      s.tricksWon[team(win)] += 1;
      s.lastTrick = { cards: s.trick, winner: win };
      s.phase = 'trickEnd';
      s.ready = [false, false, false, false];
      say(s, `${s.names[win]} took the trick`);
      return null;
    }
    return 'Unknown move.';
  },

  render(view, root, send) {
    root.replaceChildren();
    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };
    const myTurn = view.turn === view.seat;
    const myTeam = view.seat % 2;

    const board = el('div', 'pin-scores');
    [0, 1].forEach((t) => {
      const b = el('div', 'pin-score' + (t === myTeam ? ' mine' : ''));
      b.append(el('span', '', view.teamNames[t]), el('strong', '', String(view.scores[t])));
      if (['play', 'trickEnd'].includes(view.phase)) b.append(el('small', '', `${view.tricksWon[t]} trick${view.tricksWon[t] === 1 ? '' : 's'}`));
      board.append(b);
    });
    root.append(board);

    if (view.bidder != null && view.phase !== 'bid') {
      root.append(el('p', 'contract', `${view.names[view.bidder]} — ${view.bid}${view.trump ? ` · ${SUIT_SYMBOL[view.trump]} ${SUIT_NAME[view.trump]} trump` : ''}`));
    }

    const n = view.opts.pass;
    let status;
    if (view.phase === 'over') status = view.winner.includes(view.seat) ? 'Your team wins!' : `${view.teamNames[view.winner[0]]} win`;
    else if (view.phase === 'handOver') status = 'Hand over';
    else if (view.phase === 'trickEnd') status = 'Trick over';
    else if (view.phase === 'meld') status = 'Meld';
    else if (myTurn) status = { bid: 'Your bid', trump: 'Name trump', passIn: `Pass ${n} cards to your partner`, passBack: `Pass ${n} cards back to your partner`, play: 'Your turn' }[view.phase];
    else status = `${view.names[view.turn]} is ${{ bid: 'bidding', trump: 'naming trump', passIn: 'passing cards', passBack: 'passing cards back', play: 'playing' }[view.phase]}`;
    root.append(el('p', 'status' + (myTurn && !['meld', 'trickEnd', 'handOver', 'over'].includes(view.phase) ? ' mine' : ''), status));

    if (view.summary && (view.phase === 'handOver' || view.phase === 'over')) {
      const box = el('div', 'summary');
      box.append(el('p', '', view.summary.headline));
      view.summary.lines.forEach((l) => box.append(el('p', '', l)));
      if (view.phase === 'handOver') box.append(readyBox(view, send, 'Ready for the next hand', el));
      root.append(box);
    }

    // Bidding
    if (view.phase === 'bid') {
      const bids = el('ul', 'bid-list');
      view.names.forEach((nm, i) => {
        if (i === view.seat) return;
        bids.append(el('li', i === view.turn ? 'active' : '', `${nm}: ${view.passed[i] ? 'passed' : view.bidder === i ? view.bid : '—'}`));
      });
      root.append(bids);
      if (myTurn) {
        let amount = view.bidder == null ? view.opts.minBid : view.bid + 10;
        const low = amount;
        const row = el('div', 'bid-row');
        const minus = el('button', '', '−');
        const shown = el('strong', 'bid-amount', String(amount));
        const plus = el('button', '', '+');
        const upd = () => { shown.textContent = String(amount); minus.disabled = amount <= low; };
        minus.addEventListener('click', () => { amount -= 10; upd(); });
        plus.addEventListener('click', () => { amount += 10; upd(); });
        upd();
        row.append(minus, shown, plus);
        const acts = el('div', 'row');
        const b = el('button', 'primary', 'Bid');
        b.addEventListener('click', () => send({ type: 'bid', amount }));
        const p = el('button', '', 'Pass');
        p.addEventListener('click', () => send({ type: 'pass' }));
        acts.append(b, p);
        const panel = el('div', 'bid-panel');
        panel.append(row, acts);
        root.append(panel);
      }
    }

    // Trump
    if (view.phase === 'trump' && myTurn) {
      const row = el('div', 'pin-suits');
      SUITS.forEach((su) => {
        const b = el('button', 'pin-suit' + (['H', 'D'].includes(su) ? ' red' : ''), `${SUIT_SYMBOL[su]} ${SUIT_NAME[su]}`);
        b.addEventListener('click', () => send({ type: 'trump', suit: su }));
        row.append(b);
      });
      root.append(row);
      const preview = el('p', 'note', 'Meld for each choice: ' + SUITS.map((su) => `${SUIT_SYMBOL[su]} ${meldOf(view.hand, su).total}`).join(' · '));
      root.append(preview);
    }

    // Meld table
    if (view.phase === 'meld' && view.melds) {
      const box = el('div', 'pin-meld');
      [0, 1].forEach((t) => {
        const tm = el('div', 'pin-meld-team');
        const total = view.melds[t].total + view.melds[t + 2].total;
        tm.append(el('h4', '', `${view.teamNames[t]}: ${total}`));
        [t, t + 2].forEach((p) => {
          const m = view.melds[p];
          tm.append(el('p', 'pin-meld-player', `${p === view.seat ? 'You' : view.names[p]} — ${m.total}`));
          if (m.items.length) tm.append(el('p', 'note', m.items.map((i) => `${i.name} ${i.points}`).join(', ')));
        });
        box.append(tm);
      });
      root.append(box);
      root.append(readyBox(view, send, 'Ready to play', el));
    }

    // Trick
    if (view.phase === 'play' || view.phase === 'trickEnd') {
      const ended = view.phase === 'trickEnd';
      const trick = el('div', 'trick');
      for (let k = 0; k < 4; k++) {
        const s = (view.seat + k) % 4;
        const spot = el('div', 'trick-spot' + (ended ? (s === view.trickWinner ? ' won' : '') : (s === view.turn ? ' active' : '')));
        const played = view.trick.find((t) => t.seat === s);
        spot.append(played ? cardEl(played.card) : el('div', 'card empty'));
        spot.append(el('span', '', k === 0 ? 'You' : view.names[s]));
        trick.append(spot);
      }
      root.append(trick);
      if (ended) {
        const pts = view.trick.filter((t) => isCounter(t.card)).length * 10;
        root.append(el('p', 'trick-result', `${view.trickWinner === view.seat ? 'You take' : `${view.names[view.trickWinner]} takes`} the trick${pts ? ` (${pts} in counters)` : ''}`));
        root.append(readyBox(view, send, 'Ready for the next trick', el));
      } else if (view.lastTrick) {
        root.append(el('p', 'last-trick', `Last trick: ${view.names[view.lastTrick.winner]} took ${view.lastTrick.cards.map((t) => label(t.card)).join(', ')}`));
      }
    }

    // Hand
    const passing = (view.phase === 'passIn' || view.phase === 'passBack') && myTurn;
    const picked = [];
    let giveBtn = null;
    if (passing) {
      giveBtn = el('button', 'primary big', `Pass 0 of ${n}`);
      giveBtn.disabled = true;
      giveBtn.addEventListener('click', () => send({ type: 'give', cards: picked.map((x) => x.card) }));
      root.append(giveBtn);
    }
    const hand = el('div', 'hand');
    view.hand.forEach((card) => {
      const c = cardEl(card, {
        playable: passing || view.playable.includes(card),
        onClick: () => {
          if (passing) {
            const i = picked.findIndex((x) => x.node === c);
            if (i >= 0) picked.splice(i, 1); else if (picked.length < n) picked.push({ node: c, card });
            hand.querySelectorAll('.card').forEach((x) => x.classList.toggle('selected', picked.some((p) => p.node === x)));
            giveBtn.disabled = picked.length !== n;
            giveBtn.textContent = `Pass ${picked.length} of ${n}`;
          } else send({ type: 'play', card });
        },
      });
      if (view.trump && suitOf(card) === view.trump) c.classList.add('pin-trump');
      hand.append(c);
    });
    root.append(hand);

    const log = el('ul', 'log');
    view.log.forEach((l) => log.append(el('li', '', l)));
    root.append(log);
  },

  styles: `
.pin-scores { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; margin-top: 0.6rem; }
.pin-score { display: grid; justify-items: center; padding: 0.5rem; border-radius: 12px; border: 1.5px solid var(--felt-line); text-align: center; }
.pin-score.mine { border-color: var(--brass); }
.pin-score span { font-size: 0.85rem; color: var(--muted); }
.pin-score strong { font-family: var(--serif); font-size: 1.8rem; line-height: 1.2; }
.pin-score small { color: var(--muted); }
.pin-suits { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; margin: 0.8rem 0; }
.pin-suit { background: var(--paper); color: var(--ink); border: none; font-weight: 700; min-height: 3.2rem; font-size: 1.05rem; }
.pin-suit.red { color: #c4262e; }
.pin-meld { display: grid; gap: 0.6rem; margin: 0.6rem 0; }
.pin-meld-team { border: 1.5px solid var(--felt-line); border-radius: 12px; padding: 0.3rem 0.9rem 0.6rem; }
.pin-meld-team h4 { font-family: var(--serif); margin: 0.5rem 0 0.2rem; }
.pin-meld-player { margin: 0.4rem 0 0; font-weight: 600; }
.pin-meld-team .note { margin: 0.1rem 0 0.3rem; }
.card.pin-trump { box-shadow: inset 0 -4px 0 var(--brass), 0 2px 0 rgba(0, 0, 0, 0.35); }
`,
};

function readyBox(view, send, text, el) {
  const box = el('div', 'ready-box');
  const mine = view.ready[view.seat];
  const btn = el('button', 'primary big', mine ? 'Waiting for others…' : text);
  btn.disabled = mine;
  btn.addEventListener('click', () => send({ type: 'ready' }));
  box.append(btn);
  const waiting = view.names.filter((_, i) => !view.ready[i]);
  if (waiting.length) box.append(el('p', 'ready-who', `Waiting for: ${waiting.join(', ')}`));
  if (view.seat === 0 && waiting.length) {
    const go = el('button', 'quiet', 'Continue without waiting');
    go.addEventListener('click', () => send({ type: 'continue' }));
    box.append(go);
  }
  return box;
}
