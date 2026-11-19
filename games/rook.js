// Rook — 4 players. The host picks the table settings in the lobby.
// Set partners: players 1 & 3 vs 2 & 4 (lobby order); bidder names trump.
// Pick partner: bidder names trump and calls a card; whoever holds it is the
// secret partner until that card is played. Scores are kept per player.
// Scoring matches the Rook Score app: make the bid and score your points,
// get set and lose the bid. A moon is all-or-nothing.

const MIN_BID = 100;
const BID_STEP = 5;
const NEST_SIZE = 5;

const COLORS = ['R', 'G', 'Y', 'B'];
const COLOR_NAME = { R: 'Red', G: 'Green', Y: 'Yellow', B: 'Black' };
const NUMBERS = [1, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // 1 ranks above 14
const ROOK = 'ROOK';
const ROOK_STRENGTH = { high: 100, mid: 10.5, low: 4 };
const ROOK_RANK_TEXT = {
  high: 'the highest trump, above the 1',
  mid: 'a trump between the 10 and 11',
  low: 'the lowest trump, below the 5',
};

// ---------- settings ----------
const OPTIONS = [
  { id: 'partners', label: 'Partners', type: 'select', default: 'set',
    choices: [['set', 'Set partners — across the table'], ['pick', 'Pick partner — bidder calls a card']] },
  { id: 'rook', label: 'Rook card', type: 'select', default: 'high',
    choices: [['high', 'High — above the 1'], ['mid', 'Middle — 10½'], ['low', 'Low — below the 5']] },
  { id: 'lastTrick', label: 'Last trick', type: 'select', default: '20',
    choices: [['20', 'Worth 20 (200 points per hand)'], ['0', 'No bonus (180 points per hand)']] },
  { id: 'moon', label: 'Moon is worth', type: 'number', default: 500, min: 50, max: 5000, step: 10 },
  { id: 'playTo', label: 'Play to', type: 'number', default: 1000, min: 100, max: 10000, step: 50 },
];

function cleanOptions(o = {}) {
  const num = (v, d, lo, hi) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && v !== '' && v != null ? Math.min(hi, Math.max(lo, n)) : d;
  };
  return {
    partners: o.partners === 'pick' ? 'pick' : 'set',
    rook: ['high', 'mid', 'low'].includes(o.rook) ? o.rook : 'high',
    lastTrick: String(o.lastTrick) === '0' ? 0 : 20,
    moon: num(o.moon, 500, 50, 5000),
    playTo: num(o.playTo, 1000, 100, 10000),
  };
}

// ---------- card helpers ----------
function makeDeck() {
  const deck = [ROOK];
  for (const c of COLORS) for (const n of NUMBERS) deck.push(n + c);
  return deck; // 45 cards: 10 each + 5 in the nest
}

function shuffle(arr) {
  const a = arr.slice();
  const rand = new Uint32Array(a.length);
  crypto.getRandomValues(rand);
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand[i] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const numOf = (card) => (card === ROOK ? 0 : parseInt(card, 10));
const colorOf = (card, trump) => (card === ROOK ? trump : card.slice(-1));

function pointsOf(card) {
  if (card === ROOK) return 20;
  const n = numOf(card);
  if (n === 1) return 15;
  if (n === 10 || n === 14) return 10;
  if (n === 5) return 5;
  return 0;
}

function strength(card, rookRank) {
  if (card === ROOK) return ROOK_STRENGTH[rookRank];
  const n = numOf(card);
  return n === 1 ? 15 : n;
}

function cardLabel(card) {
  return card === ROOK ? 'the Rook' : `${COLOR_NAME[card.slice(-1)]} ${card.slice(0, -1)}`;
}

function sortHand(hand, trump, rookRank) {
  const order = (c) => {
    const col = c === ROOK ? (trump || 'ROOK') : c.slice(-1);
    const colIdx = col === 'ROOK' ? -2 : trump && col === trump ? -1 : COLORS.indexOf(col);
    return colIdx * 1000 - strength(c, rookRank);
  };
  return hand.slice().sort((a, b) => order(a) - order(b));
}

function legalCards(hand, trick, trump) {
  if (trick.length === 0) return hand.slice();
  const led = colorOf(trick[0].card, trump);
  const follow = hand.filter((c) => colorOf(c, trump) === led);
  return follow.length ? follow : hand.slice();
}

function trickWinner(trick, trump, rookRank) {
  const led = colorOf(trick[0].card, trump);
  let best = trick[0];
  for (const t of trick.slice(1)) {
    const tc = colorOf(t.card, trump);
    const bc = colorOf(best.card, trump);
    const tTrump = tc === trump;
    const bTrump = bc === trump;
    if (tTrump && !bTrump) best = t;
    else if (tTrump === bTrump && tc === bc && strength(t.card, rookRank) > strength(best.card, rookRank)) best = t;
    else if (!tTrump && !bTrump && tc === led && bc !== led) best = t;
  }
  return best.seat;
}

// ---------- game flow ----------
function say(state, text) {
  state.log.push(text);
  if (state.log.length > 30) state.log.shift();
}

const perHand = (state) => 180 + state.opts.lastTrick;

function bidTeam(state) {
  if (state.opts.partners === 'set') return [state.bidder, (state.bidder + 2) % 4];
  return state.partner == null ? [state.bidder] : [state.bidder, state.partner];
}

function dealHand(state) {
  const deck = shuffle(makeDeck());
  state.hands = [0, 1, 2, 3].map(() => deck.splice(0, 10));
  state.nest = deck;
  state.discards = [];
  state.phase = 'bid';
  state.bid = 0;
  state.moon = false;
  state.bidder = null;
  state.passed = [false, false, false, false];
  state.turn = (state.dealer + 1) % 4;
  state.trump = null;
  state.called = null;
  state.partner = null;
  state.partnerShown = false;
  state.trick = [];
  state.lastTrick = null;
  state.taken = [[], [], [], []]; // cards won by each player
  state.tricksWon = [0, 0, 0, 0];
  say(state, `${state.names[state.dealer]} dealt`);
}

function nextActiveBidder(state, from) {
  for (let k = 1; k <= 4; k++) {
    const s = (from + k) % 4;
    if (!state.passed[s]) return s;
  }
  return from;
}

function finishBidding(state) {
  const remaining = [0, 1, 2, 3].filter((s) => !state.passed[s]);
  if (state.bidder == null) {
    state.bidder = remaining[0];
    state.bid = MIN_BID;
    say(state, `${state.names[state.bidder]} takes it at ${MIN_BID}`);
  }
  state.hands[state.bidder].push(...state.nest);
  state.nest = [];
  state.phase = 'nest';
  state.turn = state.bidder;
}

function endHand(state, lastWinner) {
  const pts = state.taken.map((cards) => cards.reduce((s, c) => s + pointsOf(c), 0));
  pts[lastWinner] += state.opts.lastTrick;
  const team = bidTeam(state);
  const isBid = (s) => team.includes(s);
  const defenders = [0, 1, 2, 3].filter((s) => !isBid(s));
  const bidPts = team.reduce((sum, s) => sum + pts[s], 0);
  const bidTricks = team.reduce((sum, s) => sum + state.tricksWon[s], 0);
  const defPts = perHand(state) - bidPts;
  const made = state.moon ? bidTricks === 10 : bidPts >= state.bid;
  const delta = [0, 1, 2, 3].map((s) => {
    if (state.moon) return isBid(s) ? (made ? state.opts.moon : -state.opts.moon) : 0;
    if (isBid(s)) return made ? bidPts : -state.bid;
    return defPts;
  });
  delta.forEach((d, s) => { state.scores[s] += d; });

  const bidNames = team.map((s) => state.names[s]).join(' & ');
  const defNames = defenders.map((s) => state.names[s]).join(' & ');
  const sign = (n) => (n > 0 ? '+' : '') + n;
  const each = state.opts.partners === 'pick' ? ' each' : '';
  state.summary = {
    headline: `${bidNames} bid ${state.moon ? 'the moon' : state.bid} and ${made ? 'made it' : 'got set'}.`,
    lines: [
      `${bidNames}: took ${bidPts}, scored ${sign(delta[team[0]])}${team.length > 1 ? each : ''}`,
      `${defNames}: took ${defPts}, scored ${sign(delta[defenders[0]])}${defenders.length > 1 ? each : ''}`,
    ],
  };
  say(state, made ? `${bidNames} made it` : `${bidNames} got set`);

  if (state.scores.some((s) => s >= state.opts.playTo)) {
    const best = Math.max(...state.scores);
    state.winners = [0, 1, 2, 3].filter((s) => state.scores[s] === best);
    // On a tie between the bidding side and defenders, the bidders win.
    if (state.winners.some(isBid) && !state.winners.every(isBid)) {
      state.winners = state.winners.filter(isBid);
    }
    state.phase = 'over';
    say(state, `${state.winners.map((s) => state.names[s]).join(' & ')} win the game!`);
  } else {
    state.phase = 'handOver';
  }
}

export default {
  id: 'rook',
  name: 'Rook',
  minPlayers: 4,
  maxPlayers: 4,
  // This game's own styles, added to the page when the game loads.
  styles: `
/* ---------- Rook ---------- */
.scoreboard { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; margin-top: 0.6rem; }
.score-box {
  display: grid; justify-items: center; padding: 0.5rem; border-radius: 12px;
  border: 1.5px solid var(--felt-line); text-align: center;
}
.score-box.mine { border-color: var(--brass); }
.score-box .team-name { font-size: 0.85rem; color: var(--muted); }
.score-box strong { font-family: var(--serif); font-size: 1.8rem; line-height: 1.2; }
.score-box small { color: var(--muted); }
.contract { text-align: center; margin: 0.6rem 0 0; color: var(--chalk); }
.contract[data-color="R"] { color: #ff8a8f; }
.contract[data-color="G"] { color: #7fd69c; }
.contract[data-color="Y"] { color: #f2cf5b; }
.contract[data-color="B"] { color: #ffffff; }

.bid-list { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; color: var(--muted); }
.bid-list .active { color: var(--brass); }
.bid-panel { display: grid; gap: 0.7rem; margin: 0.6rem 0 1rem; }
.bid-row { display: flex; align-items: center; justify-content: center; gap: 1rem; }
.bid-row button { width: 3rem; font-size: 1.4rem; padding: 0; }
.bid-amount { font-family: var(--serif); font-size: 2.2rem; min-width: 4.5rem; text-align: center; }

.color-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; margin: 0.8rem 0; }
.color-btn { color: #fff; border: none; font-weight: 600; min-height: 3.2rem; }
.color-btn.c-R { background: #c4262e; }
.color-btn.c-G { background: #1f7a3d; }
.color-btn.c-Y { background: #d9a520; color: #1a1405; }
.color-btn.c-B { background: #1b1b1b; border: 1.5px solid var(--muted); }

.trick {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.4rem;
  padding: 1rem 0; border-block: 1px solid var(--felt-line); text-align: center;
}
.trick-spot { display: grid; justify-items: center; gap: 0.3rem; font-size: 0.85rem; color: var(--muted); }
.trick-spot.active { color: var(--brass); }
.card.empty { background: transparent; border: 1.5px dashed var(--felt-line); box-shadow: none; }
.last-trick { font-size: 0.85rem; color: var(--muted); text-align: center; }

.rook-card .idx { font-family: var(--sans); }
.rook-card .pip { font-family: var(--sans); font-weight: 800; font-size: 1.5rem; }
.rook-card.c-R { color: #c4262e; }
.rook-card.c-G { color: #1f7a3d; }
.rook-card.c-Y { color: #a87a05; }
.rook-card.c-B { color: #1b1b1b; }
.rook-card.c-rook { background: #1b1b1b; color: #fff; }
.rook-card.c-rook .pip { font-size: 0.8rem; letter-spacing: 0.08em; padding-top: 0; }
.rook-card .pts {
  position: absolute; right: 0.25rem; bottom: 0.2rem; font: 700 0.65rem/1 var(--sans);
  color: var(--ink); background: var(--brass); border-radius: 999px; padding: 0.15rem 0.3rem;
}
.rook-card.trump { box-shadow: inset 0 -4px 0 var(--brass), 0 2px 0 rgba(0, 0, 0, 0.35); }
.scoreboard.four { grid-template-columns: 1fr 1fr; }
.called { text-align: center; margin: 0.2rem 0 0; color: var(--brass); font-size: 0.95rem; }
.call-picker { margin: 0.8rem 0; }
.call-row { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.5rem; }
.card.small { width: 2.6rem; height: 3.6rem; }
.card.small .idx { font-size: 0.75rem; }
.card.small .pip { font-size: 1.1rem; padding-top: 0.3rem; }
.rook-card.c-rook.small .pip { font-size: 0.6rem; }
`,
  options: OPTIONS,

  rules(raw) {
    const o = cleanOptions(raw);
    const partners = o.partners === 'set'
      ? 'Partners sit across: players 1 & 3 vs 2 & 4, in lobby order. The high bidder takes the nest, discards 5, and names trump.'
      : 'Pick partner: the high bidder takes the nest, discards 5, names trump, and calls a card. Whoever holds it is their secret partner. Scores are kept per player.';
    return `${partners} Bid from ${MIN_BID} by ${BID_STEP}s, or bid the moon (worth ${o.moon}) to take every trick. ` +
      `The Rook is ${ROOK_RANK_TEXT[o.rook]}. Counters: 5s = 5, 10s and 14s = 10, 1s = 15, Rook = 20` +
      (o.lastTrick ? `, plus ${o.lastTrick} and the discards for the last trick` : '; the discards go to the last trick') +
      `. Play to ${o.playTo}.`;
  },

  setup(names, rawOptions) {
    const state = {
      names,
      opts: cleanOptions(rawOptions),
      scores: [0, 0, 0, 0],
      dealer: 3,
      winners: null,
      summary: null,
      log: [],
    };
    dealHand(state);
    return state;
  },

  viewFor(state, seat) {
    const o = state.opts;
    const myTurn = state.turn === seat;
    const partnerKnown = state.partner != null &&
      (state.partnerShown || seat === state.partner || state.phase === 'handOver' || state.phase === 'over');
    return {
      seat,
      names: state.names,
      mode: o.partners,
      rookRank: o.rook,
      scores: state.scores,
      playTo: o.playTo,
      phase: state.phase,
      turn: state.turn,
      bid: state.bid,
      minBid: MIN_BID,
      bidStep: BID_STEP,
      maxBid: perHand(state),
      moonValue: o.moon,
      moon: state.moon,
      bidder: state.bidder,
      passed: state.passed,
      trump: state.trump,
      called: state.called,
      partner: partnerKnown ? state.partner : null,
      hand: sortHand(state.hands[seat], state.trump, o.rook),
      nestSize: NEST_SIZE,
      trick: state.trick,
      lastTrick: state.lastTrick,
      tricksWon: state.tricksWon,
      playable: state.phase === 'play' && myTurn ? legalCards(state.hands[seat], state.trick, state.trump) : [],
      // Cards the bidder may call: anything another player holds (not their hand or discards).
      callable: state.phase === 'call' && myTurn ? makeDeck().filter((c) => state.hands.some((hd, i) => i !== seat && hd.includes(c))) : [],
      summary: state.summary,
      winner: state.winners,
      log: state.log.slice(-4),
    };
  },

  applyMove(state, seat, move) {
    if (state.phase === 'over') return 'The game is over.';

    if (state.phase === 'handOver') {
      if (move.type !== 'next') return 'Tap Next hand to continue.';
      state.dealer = (state.dealer + 1) % 4;
      state.summary = null;
      dealHand(state);
      return null;
    }

    if (seat !== state.turn) return "It isn't your turn.";
    const name = state.names[seat];
    const hand = state.hands[seat];

    if (state.phase === 'bid') {
      if (move.type === 'pass') {
        state.passed[seat] = true;
        say(state, `${name} passed`);
      } else if (move.type === 'bid') {
        if (state.moon) return 'Someone already bid the moon.';
        if (move.moon) {
          state.moon = true;
          state.bid = state.opts.moon;
          say(state, `${name} bid the moon!`);
        } else {
          const amt = Number(move.amount);
          const low = state.bidder == null ? MIN_BID : state.bid + BID_STEP;
          if (!Number.isInteger(amt) || amt < low || amt > perHand(state) || amt % BID_STEP) {
            return `Bid between ${low} and ${perHand(state)}, by ${BID_STEP}s.`;
          }
          state.bid = amt;
          say(state, `${name} bid ${amt}`);
        }
        state.bidder = seat;
      } else {
        return 'Bid or pass.';
      }
      const left = state.passed.filter((p) => !p).length;
      if (state.moon || left === 1) {
        if (state.moon) state.passed = state.passed.map((_, s) => s !== state.bidder);
        finishBidding(state);
      } else {
        state.turn = nextActiveBidder(state, seat);
      }
      return null;
    }

    if (state.phase === 'nest') {
      if (move.type !== 'discard') return `Choose ${NEST_SIZE} cards to discard.`;
      const cards = Array.isArray(move.cards) ? move.cards : [];
      if (cards.length !== NEST_SIZE || new Set(cards).size !== NEST_SIZE) return `Choose exactly ${NEST_SIZE} cards.`;
      if (!cards.every((c) => hand.includes(c))) return "Those cards aren't all in your hand.";
      state.hands[seat] = hand.filter((c) => !cards.includes(c));
      state.discards = cards;
      state.phase = 'trump';
      say(state, `${name} discarded`);
      return null;
    }

    if (state.phase === 'trump') {
      if (move.type !== 'trump' || !COLORS.includes(move.color)) return 'Choose a trump color.';
      state.trump = move.color;
      say(state, `Trump is ${COLOR_NAME[move.color]}`);
      if (state.opts.partners === 'pick') {
        state.phase = 'call';
      } else {
        state.phase = 'play';
        state.turn = state.bidder;
      }
      return null;
    }

    if (state.phase === 'call') {
      if (move.type !== 'call' || !makeDeck().includes(move.card)) return 'Call a card for your partner.';
      if (hand.includes(move.card)) return "You can't call a card in your own hand.";
      if (state.discards.includes(move.card)) return 'That card is in your discards. Call a card another player holds.';
      const partner = state.hands.findIndex((hd) => hd.includes(move.card));
      if (partner < 0) return 'Call a card another player holds.';
      state.called = move.card;
      state.partner = partner;
      state.phase = 'play';
      state.turn = state.bidder;
      say(state, `${name} called ${cardLabel(move.card)} as partner`);
      return null;
    }

    if (state.phase === 'play') {
      if (move.type !== 'play') return 'Play a card.';
      if (!hand.includes(move.card)) return "That card isn't in your hand.";
      if (!legalCards(hand, state.trick, state.trump).includes(move.card)) return 'You must follow the color that was led.';
      hand.splice(hand.indexOf(move.card), 1);
      state.trick.push({ seat, card: move.card });
      if (move.card === state.called && !state.partnerShown) {
        state.partnerShown = true;
        say(state, `${name} is the partner!`);
      }
      if (state.trick.length < 4) {
        state.turn = (seat + 1) % 4;
        return null;
      }
      const win = trickWinner(state.trick, state.trump, state.opts.rook);
      state.taken[win].push(...state.trick.map((t) => t.card));
      state.tricksWon[win] += 1;
      state.lastTrick = { cards: state.trick, winner: win };
      state.trick = [];
      state.turn = win;
      say(state, `${state.names[win]} took the trick`);
      if (state.hands.every((hd) => hd.length === 0)) {
        state.taken[win].push(...state.discards);
        endHand(state, win);
      }
      return null;
    }

    return 'Unknown move.';
  },

  render(view, root, send) {
    root.replaceChildren();
    const myTurn = view.turn === view.seat;
    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };
    const inHand = ['nest', 'trump', 'call', 'play'].includes(view.phase);

    // Scoreboard: teams for set partners, players for pick partner
    const board = el('div', 'scoreboard' + (view.mode === 'pick' ? ' four' : ''));
    if (view.mode === 'set') {
      [0, 1].forEach((t) => {
        const seats = [t, t + 2];
        const box = el('div', 'score-box' + (seats.includes(view.seat) ? ' mine' : ''));
        box.append(el('span', 'team-name', seats.map((s) => view.names[s]).join(' & ')), el('strong', '', String(view.scores[t])));
        if (inHand) box.append(el('small', '', tricksText(view.tricksWon[t] + view.tricksWon[t + 2])));
        board.append(box);
      });
    } else {
      view.names.forEach((n, s) => {
        const box = el('div', 'score-box' + (s === view.seat ? ' mine' : ''));
        const tag = inHand && s === view.bidder ? ' · bid' : inHand && s === view.partner ? ' · partner' : '';
        box.append(el('span', 'team-name', n + tag), el('strong', '', String(view.scores[s])));
        if (inHand) box.append(el('small', '', tricksText(view.tricksWon[s])));
        board.append(box);
      });
    }
    root.append(board);

    // Contract line
    if (view.bidder != null && view.phase !== 'bid') {
      let text = `${view.names[view.bidder]} — ${view.moon ? `Moon (${view.moonValue})` : view.bid}`;
      if (view.trump) text += ` · ${COLOR_NAME[view.trump]} trump`;
      const c = el('p', 'contract', text);
      if (view.trump) c.dataset.color = view.trump;
      root.append(c);
      if (view.called) {
        const who = view.partner == null ? 'secret' : view.partner === view.seat ? 'you!' : view.names[view.partner];
        root.append(el('p', 'called', `Partner card: ${cardLabel(view.called)} — ${who}`));
      }
    }

    // Status
    let statusText;
    if (view.phase === 'over') {
      statusText = view.winner.includes(view.seat) ? 'You win!' : `${view.winner.map((s) => view.names[s]).join(' & ')} win`;
    } else if (view.phase === 'handOver') {
      statusText = 'Hand over';
    } else if (myTurn) {
      statusText = { bid: 'Your bid', nest: `Discard ${view.nestSize} cards`, trump: 'Name trump', call: 'Call your partner’s card', play: 'Your turn' }[view.phase];
    } else {
      const doing = { bid: 'bidding', nest: 'taking the nest', trump: 'naming trump', call: 'calling a partner', play: 'playing' }[view.phase];
      statusText = `${view.names[view.turn]} is ${doing}`;
    }
    const active = myTurn && view.phase !== 'handOver' && view.phase !== 'over';
    root.append(el('p', 'status' + (active ? ' mine' : ''), statusText));

    // Hand summary
    if (view.summary && (view.phase === 'handOver' || view.phase === 'over')) {
      const box = el('div', 'summary');
      box.append(el('p', '', view.summary.headline));
      view.summary.lines.forEach((l) => box.append(el('p', '', l)));
      if (view.phase === 'handOver') {
        const next = el('button', 'primary big', 'Next hand');
        next.addEventListener('click', () => send({ type: 'next' }));
        box.append(next);
      }
      root.append(box);
    }

    // Bidding
    if (view.phase === 'bid') {
      const bids = el('ul', 'bid-list');
      view.names.forEach((n, s) => {
        if (s === view.seat) return;
        const li = el('li', s === view.turn ? 'active' : '');
        li.textContent = `${n}: ${view.passed[s] ? 'passed' : view.bidder === s ? (view.moon ? 'Moon' : view.bid) : '—'}`;
        bids.append(li);
      });
      root.append(bids);

      if (myTurn) {
        let amount = view.bidder == null ? view.minBid : view.bid + view.bidStep;
        const low = amount;
        const panel = el('div', 'bid-panel');
        const minus = el('button', '', '−');
        const shown = el('strong', 'bid-amount', String(amount));
        const plus = el('button', '', '+');
        const update = () => {
          shown.textContent = String(amount);
          minus.disabled = amount <= low;
          plus.disabled = amount >= view.maxBid;
        };
        minus.setAttribute('aria-label', 'Lower bid');
        plus.setAttribute('aria-label', 'Raise bid');
        minus.addEventListener('click', () => { amount -= view.bidStep; update(); });
        plus.addEventListener('click', () => { amount += view.bidStep; update(); });
        update();
        const row = el('div', 'bid-row');
        row.append(minus, shown, plus);
        const actions = el('div', 'row');
        const bidBtn = el('button', 'primary', 'Bid');
        bidBtn.disabled = low > view.maxBid;
        bidBtn.addEventListener('click', () => send({ type: 'bid', amount }));
        const passBtn = el('button', '', 'Pass');
        passBtn.addEventListener('click', () => send({ type: 'pass' }));
        const moonBtn = el('button', '', `🌙 Moon (${view.moonValue})`);
        moonBtn.addEventListener('click', () => {
          const who = view.mode === 'set' ? 'Your team' : 'You and your partner';
          if (confirm(`Bid the moon for ${view.moonValue}? ${who} must take every trick.`)) send({ type: 'bid', moon: true });
        });
        actions.append(bidBtn, passBtn, moonBtn);
        panel.append(row, actions);
        root.append(panel);
      }
    }

    // Trump choice
    if (view.phase === 'trump' && myTurn) {
      const row = el('div', 'color-row');
      COLORS.forEach((c) => {
        const b = el('button', `color-btn c-${c}`, COLOR_NAME[c]);
        b.addEventListener('click', () => send({ type: 'trump', color: c }));
        row.append(b);
      });
      root.append(row);
    }

    // Partner card choice (pick partner)
    if (view.phase === 'call' && myTurn) {
      const picker = el('div', 'call-picker');
      picker.append(el('p', 'note', 'Tap the card your partner holds. Whoever has it plays with you, but nobody knows who until it’s played.'));
      [...COLORS, 'ROOK'].forEach((g) => {
        const cards = view.callable.filter((c) => (g === 'ROOK' ? c === ROOK : c !== ROOK && c.slice(-1) === g));
        if (!cards.length) return;
        const row = el('div', 'call-row');
        cards.sort((a, b) => strength(b, view.rookRank) - strength(a, view.rookRank))
          .forEach((c) => row.append(rookCardEl(c, view.trump, {
            playable: true,
            small: true,
            onClick: (cd) => { if (confirm(`Call ${cardLabel(cd)} as your partner?`)) send({ type: 'call', card: cd }); },
          })));
        picker.append(row);
      });
      root.append(picker);
    }

    // Current trick
    if (view.phase === 'play') {
      const trickBox = el('div', 'trick');
      for (let k = 0; k < 4; k++) {
        const s = (view.seat + k) % 4;
        const spot = el('div', 'trick-spot' + (s === view.turn ? ' active' : ''));
        const played = view.trick.find((t) => t.seat === s);
        spot.append(played ? rookCardEl(played.card, view.trump) : el('div', 'card empty'));
        spot.append(el('span', '', k === 0 ? 'You' : view.names[s]));
        trickBox.append(spot);
      }
      root.append(trickBox);
      if (view.lastTrick) {
        root.append(el('p', 'last-trick', `Last trick: ${view.names[view.lastTrick.winner]} took ` +
          view.lastTrick.cards.map((t) => cardLabel(t.card)).join(', ')));
      }
    }

    // Your hand
    const handEl = el('div', 'hand');
    const picking = view.phase === 'nest' && myTurn;
    const picked = new Set();
    let confirmBtn = null;
    for (const card of view.hand) {
      const playable = view.playable.includes(card);
      handEl.append(rookCardEl(card, view.trump, {
        playable: playable || picking,
        onClick: (cd, node) => {
          if (picking) {
            if (picked.has(cd)) picked.delete(cd); else if (picked.size < view.nestSize) picked.add(cd);
            node.classList.toggle('selected', picked.has(cd));
            confirmBtn.disabled = picked.size !== view.nestSize;
            confirmBtn.textContent = `Discard ${picked.size} of ${view.nestSize}`;
          } else {
            send({ type: 'play', card: cd });
          }
        },
      }));
    }
    if (picking) {
      confirmBtn = el('button', 'primary big', `Discard 0 of ${view.nestSize}`);
      confirmBtn.disabled = true;
      confirmBtn.addEventListener('click', () => send({ type: 'discard', cards: [...picked] }));
      root.append(confirmBtn);
    }
    root.append(handEl);

    const log = el('ul', 'log');
    view.log.forEach((line) => log.append(el('li', '', line)));
    root.append(log);
  },
};

const tricksText = (n) => `${n} trick${n === 1 ? '' : 's'}`;

function rookCardEl(card, trump, opts = {}) {
  const el = document.createElement(opts.onClick ? 'button' : 'div');
  const color = card === ROOK ? 'rook' : card.slice(-1);
  el.className = `card rook-card c-${color}` + (opts.playable ? ' playable' : '') + (opts.small ? ' small' : '') +
    (trump && card !== ROOK && color === trump ? ' trump' : '');
  if (card === ROOK) {
    el.innerHTML = '<span class="pip">ROOK</span>';
  } else {
    const n = card.slice(0, -1);
    el.innerHTML = `<span class="idx">${n}</span><span class="pip">${n}</span>`;
  }
  const pts = pointsOf(card);
  if (pts && !opts.small) el.insertAdjacentHTML('beforeend', `<span class="pts">${pts}</span>`);
  el.setAttribute('aria-label', cardLabel(card) + (pts ? `, ${pts} points` : ''));
  if (opts.onClick) {
    el.type = 'button';
    el.disabled = !opts.playable;
    el.addEventListener('click', () => opts.onClick(card, el));
  }
  return el;
}
