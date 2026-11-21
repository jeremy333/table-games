// Bird's Nest — 4 players. The host picks the table settings in the lobby.
// Set partners: players 1 & 3 vs 2 & 4 (lobby order); bidder names trump.
// Pick partner: bidder names trump and calls a card; whoever holds it is the
// secret partner until that card is played. Scores are kept per player.
// Scoring: make the bid and score your points,
// get set and lose the bid. A moon is all-or-nothing.

const MIN_BID = 100;
const BID_STEP = 5;
const NEST_SIZE = 5;
const MOON_VALUES = [300, 400, 500, 1000];
const MOON_SWAPS = [0, 1, 2];

const COLORS = ['R', 'G', 'Y', 'B'];
const COLOR_NAME = { R: 'Red', G: 'Green', Y: 'Yellow', B: 'Black' };
const NUMBERS = [1, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // 1 ranks above 14
const ROOK = 'BIRD'; // the bird card's code
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
  { id: 'rook', label: 'Bird card', type: 'select', default: 'high',
    choices: [['high', 'High — above the 1'], ['mid', 'Middle — 10½'], ['low', 'Low — below the 5']] },
  { id: 'lastTrick', label: 'Last trick', type: 'select', default: '20',
    choices: [['20', 'Worth 20 (200 points per hand)'], ['0', 'No bonus (180 points per hand)']] },
  { id: 'moon', label: 'Moon is worth (default)', type: 'select', default: '500',
    choices: [['300', '300'], ['400', '400'], ['500', '500'], ['1000', '1000']] },
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
    moon: MOON_VALUES.includes(Number(o.moon)) ? Number(o.moon) : 500,
    playTo: num(o.playTo, 1000, 100, 10000),
  };
}

// ---------- card helpers ----------
function makeDeck() {
  const deck = [ROOK];
  for (const c of COLORS) for (const n of NUMBERS) deck.push(n + c);
  return deck; // 45 cards: 10 each + 5 in the nest
}

// A fair random number from 0 to n-1 (no rounding bias), from the phone's secure random source.
function randomInt(n) {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return buf[0] % n;
}

// Fisher-Yates: every order of the deck is equally likely, like a thorough shuffle.
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
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
  return card === ROOK ? 'the Bird' : `${COLOR_NAME[card.slice(-1)]} ${card.slice(0, -1)}`;
}

function sortHand(hand, trump, rookRank) {
  const order = (c) => {
    const col = c === ROOK ? (trump || 'BIRD') : c.slice(-1);
    const colIdx = col === 'BIRD' ? -2 : trump && col === trump ? -1 : COLORS.indexOf(col);
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
  // Deal like a real table: one card at a time, starting left of the dealer,
  // with a card to the nest after each of the first five rounds.
  const deck = shuffle(makeDeck());
  state.hands = [[], [], [], []];
  state.nest = [];
  for (let round = 0; round < 10; round++) {
    for (let k = 1; k <= 4; k++) state.hands[(state.dealer + k) % 4].push(deck.pop());
    if (round < NEST_SIZE) state.nest.push(deck.pop());
  }
  state.redeal = null;
  state.moonValue = state.opts.moon;
  state.moonSwap = 0;
  state.moonPartnerPlays = true;
  state.moonWin = 'tricks';
  state.sitOut = null; // a moon partner sitting this hand out
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

// Can this player take every remaining trick no matter what anyone plays?
// True only when it's certain: their trumps outrank every other trump and can
// pull them all, and in every other color their cards are the highest left.
function canClaim(state, seat) {
  const t = state.trump;
  const rr = state.opts.rook;
  const mine = state.hands[seat];
  if (!mine.length || state.trick.length) return false;
  const others = activeSeats(state).filter((x) => x !== seat).map((x) => state.hands[x]);
  const isTrump = (c) => colorOf(c, t) === t;
  const str = (c) => strength(c, rr);
  const myTrump = mine.filter(isTrump);
  const theirTrump = others.map((h) => h.filter(isTrump));
  const theirTop = Math.max(-1, ...theirTrump.flat().map(str));
  if (myTrump.length) {
    if (Math.min(...myTrump.map(str)) <= theirTop) return false;
    if (theirTrump.some((h) => h.length > myTrump.length)) return false;
  } else if (theirTrump.flat().length) {
    return false;
  }
  for (const col of COLORS) {
    if (col === t) continue;
    const myCol = mine.filter((c) => colorOf(c, t) === col);
    if (!myCol.length) continue;
    const theirMax = Math.max(-1, ...others.flat().filter((c) => colorOf(c, t) === col).map(str));
    if (Math.min(...myCol.map(str)) <= theirMax) return false;
  }
  return true;
}

// Seats playing this hand (everyone, unless a moon partner is sitting out).
function activeSeats(state) {
  return [0, 1, 2, 3].filter((x) => x !== state.sitOut);
}

function nextActive(state, seat) {
  let n = (seat + 1) % 4;
  if (n === state.sitOut) n = (n + 1) % 4;
  return n;
}

function partnerSeat(state) {
  return state.opts.partners === 'set' ? (state.bidder + 2) % 4 : state.partner;
}

// After trump (and the partner call): moon card swap if asked for, then play.
function afterTrump(state) {
  if (state.moon && state.moonSwap > 0 && partnerSeat(state) != null) {
    state.phase = 'swapGive';
    state.turn = state.bidder; // the bidder chooses cards from the partner's hand
    if (state.opts.partners === 'pick' && !state.partnerShown) {
      state.partnerShown = true;
      say(state, `${state.names[state.partner]} is the partner (moon card swap)`);
    }
    say(state, `Moon: ${state.names[state.bidder]} takes ${state.moonSwap} card${state.moonSwap > 1 ? 's' : ''} from their partner`);
  } else {
    startMoonPlay(state);
  }
}

// Play begins; if the moon bidder chose to go alone, the partner sits out.
function startMoonPlay(state) {
  if (state.moon && !state.moonPartnerPlays && partnerSeat(state) != null) {
    state.sitOut = partnerSeat(state);
    if (state.opts.partners === 'pick' && !state.partnerShown) state.partnerShown = true;
    say(state, `${state.names[state.sitOut]} sits out this hand; ${state.names[state.bidder]} plays alone`);
  }
  state.phase = 'play';
  state.turn = state.bidder;
}

// Everyone has seen the trick: clear it, or score the hand after the last one.
function finishTrick(state) {
  const win = state.lastTrick.winner;
  state.trick = [];
  if (activeSeats(state).every((x) => state.hands[x].length === 0)) {
    state.taken[win].push(...state.discards);
    endHand(state, win);
  } else {
    state.phase = 'play';
    state.turn = win;
  }
}

function endHand(state, lastWinner) {
  const pts = state.taken.map((cards) => cards.reduce((s, c) => s + pointsOf(c), 0));
  pts[lastWinner] += state.opts.lastTrick;
  const team = bidTeam(state);
  const isBid = (s) => team.includes(s);
  const defenders = [0, 1, 2, 3].filter((s) => !isBid(s));
  const bidPts = team.reduce((sum, s) => sum + pts[s], 0);
  const bidTricks = team.reduce((sum, s) => sum + state.tricksWon[s], 0);
  const defPts = defenders.reduce((sum, s) => sum + pts[s], 0);
  const defTricks = defenders.reduce((sum, s) => sum + state.tricksWon[s], 0);
  const made = state.moon
    ? (state.moonWin === 'points' ? defPts === 0 : defTricks === 0)
    : bidPts >= state.bid;
  const delta = [0, 1, 2, 3].map((s) => {
    if (state.moon) return isBid(s) ? (made ? state.moonValue : -state.moonValue) : 0;
    if (isBid(s)) return made ? bidPts : -state.bid;
    return defPts;
  });
  delta.forEach((d, s) => { state.scores[s] += d; });

  const bidNames = team.map((s) => state.names[s]).join(' & ');
  const defNames = defenders.map((s) => state.names[s]).join(' & ');
  const sign = (n) => (n > 0 ? '+' : '') + n;
  const each = state.opts.partners === 'pick' ? ' each' : '';
  state.summary = {
    headline: `${bidNames} bid ${state.moon ? `the moon (${state.moonValue}, needing every ${state.moonWin === 'points' ? 'point' : 'trick'})` : state.bid} and ${made ? 'made it' : 'got set'}.`,
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
    state.ready = [false, false, false, false];
  }
}

export default {
  id: 'birds-nest',
  name: 'Bird’s Nest (Rook)',
  minPlayers: 4,
  maxPlayers: 4,
  // This game's own styles, added to the page when the game loads.
  styles: `
/* ---------- Bird's Nest ---------- */
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
.rook-card.c-R { color: #d4141c; background: #ffe9e9; box-shadow: inset 0 0 0 3px #e0262e, 0 2px 0 rgba(0, 0, 0, 0.35); }
.rook-card.c-G { color: #08893a; background: #e3f7ea; box-shadow: inset 0 0 0 3px #12a14a, 0 2px 0 rgba(0, 0, 0, 0.35); }
.rook-card.c-Y { color: #9a6400; background: #fff3c2; box-shadow: inset 0 0 0 3px #f2b600, 0 2px 0 rgba(0, 0, 0, 0.35); }
.rook-card.c-B { color: #111111; background: #ececec; box-shadow: inset 0 0 0 3px #222222, 0 2px 0 rgba(0, 0, 0, 0.35); }
/* Cards you can't play right now keep their full colors (they just don't lift). */
button.rook-card:disabled { filter: none; opacity: 1; }
.rook-card.c-rook { background: #ffffff; color: #1b1b1b; box-shadow: inset 0 0 0 3px #1b1b1b, 0 2px 0 rgba(0, 0, 0, 0.35); }
.rook-card .rook-word {
  position: absolute; top: 0.3rem; left: 0; right: 0; text-align: center;
  font: 800 0.55rem/1 var(--sans); letter-spacing: 0.12em;
}
.rook-card .rook-bird { position: absolute; inset: 0.95rem 0.35rem 0.75rem; display: grid; place-items: center; }
.rook-card .rook-bird svg { width: 100%; height: 100%; }
.rook-card.small .rook-word { display: none; }
.rook-card.small .rook-bird { inset: 0.35rem; }
.rook-card .pts {
  position: absolute; right: 0.25rem; bottom: 0.2rem; font: 700 0.65rem/1 var(--sans);
  color: var(--ink); background: var(--brass); border-radius: 999px; padding: 0.15rem 0.3rem;
}
.rook-card.trump::after {
  content: '★'; position: absolute; top: 0.15rem; right: 0.3rem; font-size: 0.75rem; color: #b8860b;
}
.trick-spot.won .card { outline: 3px solid var(--brass); outline-offset: 3px; }
.trick-spot.won > span { color: var(--brass); font-weight: 700; }
.trick-result { text-align: center; margin: 0.6rem 0 0.2rem; font-size: 1.05rem; }
.ready-box { display: grid; gap: 0.5rem; margin: 0.6rem 0; }
.ready-who { text-align: center; color: var(--muted); font-size: 0.9rem; margin: 0; }
.redeal-box { border: 1.5px solid var(--brass); border-radius: 12px; padding: 0.4rem 0.9rem 0.7rem; margin: 0.6rem 0; display: grid; gap: 0.4rem; }
.redeal-box p { margin: 0.3rem 0 0; }
.redeal-ask { display: block; margin: 0 auto 0.4rem; font-size: 0.9rem; }
.moon-panel { border: 1.5px solid var(--felt-line); border-radius: 12px; padding: 0.2rem 0.9rem 0.8rem; }
.moon-panel[hidden] { display: none; }
.claim-btn { margin: 0.6rem 0; }
.trick-spot.out { opacity: 0.45; }
.take-box { border: 1.5px solid var(--brass); border-radius: 12px; padding: 0.2rem 0.7rem 0.7rem; margin: 0.6rem 0; }
.scoreboard.four { grid-template-columns: 1fr 1fr; }
.called { text-align: center; margin: 0.2rem 0 0; color: var(--brass); font-size: 0.95rem; }
.call-picker { margin: 0.8rem 0; }
.call-row { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.5rem; }
.card.small { width: 2.6rem; height: 3.6rem; }
.card.small .idx { font-size: 0.75rem; }
.card.small .pip { font-size: 1.1rem; padding-top: 0.3rem; }

`,
  options: OPTIONS,

  rules(raw) {
    const o = cleanOptions(raw);
    const partners = o.partners === 'set'
      ? 'Partners sit across: players 1 & 3 vs 2 & 4, in lobby order. The high bidder takes the nest, discards 5, and names trump.'
      : 'Pick partner: the high bidder takes the nest, discards 5, names trump, and calls a card. Whoever holds it is their secret partner. Scores are kept per player.';
    return `${partners} Bid from ${MIN_BID} by ${BID_STEP}s, or bid the moon (300, 400, 500, or 1000; swap up to 2 cards with your partner; partner plays or sits out; take every trick or every point). ` +
      `The Bird is ${ROOK_RANK_TEXT[o.rook]}. Counters: 5s = 5, 10s and 14s = 10, 1s = 15, Bird = 20` +
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
      moonValue: state.moon ? state.moonValue : o.moon,
      moonDefault: o.moon,
      moonValues: MOON_VALUES,
      moonPartnerPlays: state.moonPartnerPlays !== false,
      moonWin: state.moonWin || 'tricks',
      sitOut: state.sitOut,
      partnerHand: state.phase === 'swapGive' && seat === state.bidder ? sortHand(state.hands[partnerSeat(state)], state.trump, o.rook) : null,
      partnerName: state.moon && partnerSeat(state) != null && (seat === state.bidder || seat === partnerSeat(state)) ? state.names[partnerSeat(state)] : null,
      moonSwap: state.moonSwap || 0,
      redeal: state.redeal ? { by: state.redeal.by, votes: state.redeal.votes } : null,
      canRedeal: state.phase === 'bid' && state.bidder == null && !state.passed.some(Boolean),
      canClaim: state.phase === 'play' && myTurn && seat === state.bidder && canClaim(state, seat),
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
      ready: state.ready || [false, false, false, false],
      trickWinner: state.phase === 'trickEnd' ? state.lastTrick.winner : null,
      trickPoints: state.phase === 'trickEnd' ? state.lastTrick.cards.reduce((sum, t) => sum + pointsOf(t.card), 0) : 0,
      winner: state.winners,
      log: state.log.slice(-4),
    };
  },

  applyMove(state, seat, move) {
    if (state.phase === 'over') return 'The game is over.';

    // After a trick or a hand: wait until everyone taps Ready (or the host continues).
    if (state.phase === 'trickEnd' || state.phase === 'handOver') {
      if (move.type === 'continue') {
        if (seat !== 0) return 'Only the host can continue without waiting.';
        state.ready = [true, true, true, true];
      } else if (move.type === 'ready' || move.type === 'next') {
        state.ready[seat] = true;
      } else {
        return 'Tap Ready to continue.';
      }
      if (!state.ready.every(Boolean)) return null;
      if (state.phase === 'trickEnd') finishTrick(state);
      else {
        state.dealer = (state.dealer + 1) % 4;
        state.summary = null;
        dealHand(state);
      }
      return null;
    }

    if (move.type === 'redealAsk' || move.type === 'redealVote') {
      if (state.phase !== 'bid' || state.bidder != null || state.passed.some(Boolean)) return 'A re-deal can only be asked for before bidding starts.';
      if (move.type === 'redealAsk') {
        if (state.redeal) return 'A re-deal request is already waiting.';
        state.redeal = { by: seat, votes: [null, null, null, null] };
        state.redeal.votes[seat] = true;
        say(state, `${state.names[seat]} asked for a re-deal`);
        return null;
      }
      if (!state.redeal) return 'There’s no re-deal request.';
      if (seat === state.redeal.by) return 'You asked for this re-deal.';
      if (state.redeal.votes[seat] != null) return 'You already answered.';
      state.redeal.votes[seat] = !!move.approve;
      if (!move.approve) {
        say(state, `${state.names[seat]} declined the re-deal`);
        state.redeal = null;
      } else if (state.redeal.votes.every((v) => v === true)) {
        say(state, 'Everyone agreed: re-dealing');
        dealHand(state);
      }
      return null;
    }

    if (seat !== state.turn) return seat === state.sitOut ? 'You’re sitting out this hand.' : "It isn't your turn.";
    const name = state.names[seat];
    const hand = state.hands[seat];

    if (state.phase === 'bid' && state.redeal) return 'Waiting for everyone to answer the re-deal request.';

    if (state.phase === 'bid') {
      if (move.type === 'pass') {
        state.passed[seat] = true;
        say(state, `${name} passed`);
      } else if (move.type === 'bid') {
        if (state.moon) return 'Someone already bid the moon.';
        if (move.moon) {
          const value = move.value == null ? state.opts.moon : Number(move.value);
          const swap = move.swap == null ? 0 : Number(move.swap);
          const partnerPlays = move.partnerPlays !== false;
          const win = move.win === 'points' ? 'points' : 'tricks';
          if (!MOON_VALUES.includes(value)) return `Moon value must be ${MOON_VALUES.join(', ')}.`;
          if (!MOON_SWAPS.includes(swap)) return 'Swap 0, 1, or 2 cards.';
          state.moon = true;
          state.moonValue = value;
          state.moonSwap = swap;
          state.moonPartnerPlays = partnerPlays;
          state.moonWin = win;
          state.bid = value;
          const extras = [swap ? `swapping ${swap} card${swap > 1 ? 's' : ''}` : null, partnerPlays ? null : 'playing alone',
            `needing every ${win === 'points' ? 'point' : 'trick'}`].filter(Boolean).join(', ');
          say(state, `${name} bid the moon for ${value} (${extras})!`);
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
      if (state.opts.partners === 'pick') state.phase = 'call';
      else afterTrump(state);
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
      say(state, `${name} called ${cardLabel(move.card)} as partner`);
      afterTrump(state);
      return null;
    }

    // Moon card swap: partner passes cards to the bidder, then the bidder passes the same number back.
    if (state.phase === 'swapGive' || state.phase === 'swapBack') {
      if (move.type !== 'swap') return `Choose ${state.moonSwap} card${state.moonSwap > 1 ? 's' : ''}.`;
      const cards = Array.isArray(move.cards) ? move.cards : [];
      if (cards.length !== state.moonSwap || new Set(cards).size !== cards.length) return `Choose exactly ${state.moonSwap}.`;
      if (state.phase === 'swapGive') {
        // The bidder takes cards out of the partner's hand.
        const p = partnerSeat(state);
        if (!cards.every((c) => state.hands[p].includes(c))) return "Those cards aren't in your partner's hand.";
        state.hands[p] = state.hands[p].filter((c) => !cards.includes(c));
        state.hands[seat].push(...cards);
        state.phase = 'swapBack';
        say(state, `${name} took ${cards.length} card${cards.length > 1 ? 's' : ''} from ${state.names[p]}`);
      } else {
        if (!cards.every((c) => hand.includes(c))) return "Those cards aren't all in your hand.";
        state.hands[seat] = hand.filter((c) => !cards.includes(c));
        state.hands[partnerSeat(state)].push(...cards);
        say(state, `${name} passed ${cards.length} card${cards.length > 1 ? 's' : ''} back`);
        startMoonPlay(state);
      }
      return null;
    }

    if (state.phase === 'play' && move.type === 'claim') {
      if (seat !== state.bidder) return 'Only the bidder can claim the rest.';
      if (!canClaim(state, seat)) return 'You can’t be sure of winning every trick yet.';
      const left = state.hands[seat].length;
      for (const x of activeSeats(state)) { state.taken[seat].push(...state.hands[x]); state.hands[x] = []; }
      state.taken[seat].push(...state.discards);
      state.tricksWon[seat] += left;
      state.lastTrick = { cards: [], winner: seat };
      say(state, `${name} claimed the last ${left} trick${left > 1 ? 's' : ''}`);
      endHand(state, seat);
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
      if (state.trick.length < activeSeats(state).length) {
        state.turn = nextActive(state, seat);
        return null;
      }
      const win = trickWinner(state.trick, state.trump, state.opts.rook);
      state.taken[win].push(...state.trick.map((t) => t.card));
      state.tricksWon[win] += 1;
      state.lastTrick = { cards: state.trick, winner: win };
      state.turn = win;
      // Leave the four cards on the table until everyone taps Ready.
      state.phase = 'trickEnd';
      state.ready = [false, false, false, false];
      say(state, `${state.names[win]} took the trick`);
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
    const inHand = ['nest', 'trump', 'call', 'swapGive', 'swapBack', 'play', 'trickEnd'].includes(view.phase);

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
      const moonBits = [view.moonValue, view.moonSwap ? `swap ${view.moonSwap}` : null, view.moonPartnerPlays ? null : 'alone',
        `all ${view.moonWin}`].filter(Boolean).join(' · ');
      let text = `${view.names[view.bidder]} — ${view.moon ? `Moon (${moonBits})` : view.bid}`;
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
    } else if (view.phase === 'trickEnd') {
      statusText = 'Trick over';
    } else if (myTurn) {
      const n = view.moonSwap;
      statusText = {
        bid: view.redeal ? 'Re-deal requested' : 'Your bid', nest: `Discard ${view.nestSize} cards`, trump: 'Name trump', call: 'Call your partner’s card',
        swapGive: `Take ${n} card${n > 1 ? 's' : ''} from ${view.partnerName}’s hand`,
        swapBack: `Pass ${n} card${n > 1 ? 's' : ''} back to your partner`, play: 'Your turn',
      }[view.phase];
    } else if (view.sitOut === view.seat && view.phase === 'play') {
      statusText = 'You’re sitting out this hand';
    } else if (view.phase === 'swapGive' && view.partnerName && view.seat !== view.bidder) {
      statusText = `${view.names[view.bidder]} is choosing cards from your hand`;
    } else if (view.phase === 'swapGive' || view.phase === 'swapBack') {
      statusText = 'Moon: partners are swapping cards';
    } else if (view.phase === 'bid' && view.redeal) {
      statusText = 'Re-deal requested';
    } else {
      const doing = { bid: 'bidding', nest: 'taking the nest', trump: 'naming trump', call: 'calling a partner', play: 'playing' }[view.phase];
      statusText = `${view.names[view.turn]} is ${doing}`;
    }
    const active = myTurn && !['handOver', 'over', 'trickEnd'].includes(view.phase);
    root.append(el('p', 'status' + (active ? ' mine' : ''), statusText));

    // Hand summary
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
      view.names.forEach((n, s) => {
        if (s === view.seat) return;
        const li = el('li', s === view.turn ? 'active' : '');
        li.textContent = `${n}: ${view.passed[s] ? 'passed' : view.bidder === s ? (view.moon ? 'Moon' : view.bid) : '—'}`;
        bids.append(li);
      });
      root.append(bids);

      // Re-deal: anyone may ask before bidding starts; everyone else must approve.
      if (view.redeal) {
        const r = view.redeal;
        const box = el('div', 'redeal-box');
        const asker = r.by === view.seat ? 'You' : view.names[r.by];
        box.append(el('p', '', `${asker} asked for a re-deal.`));
        const waiting = view.names.filter((_, s) => r.votes[s] == null);
        if (r.by !== view.seat && r.votes[view.seat] == null) {
          const row = el('div', 'row');
          const yes = el('button', 'primary', 'Approve re-deal');
          yes.addEventListener('click', () => send({ type: 'redealVote', approve: true }));
          const no = el('button', '', 'Decline');
          no.addEventListener('click', () => send({ type: 'redealVote', approve: false }));
          row.append(yes, no);
          box.append(row);
        }
        if (waiting.length) box.append(el('p', 'ready-who', `Waiting for: ${waiting.join(', ')}`));
        root.append(box);
      } else if (view.canRedeal) {
        const ask = el('button', 'quiet redeal-ask', 'Ask for a re-deal');
        ask.addEventListener('click', () => {
          if (confirm('Ask everyone for a re-deal? All other players must approve.')) send({ type: 'redealAsk' });
        });
        root.append(ask);
      }

      if (myTurn && !view.redeal) {
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
        const moonBtn = el('button', '', '🌙 Moon…');
        actions.append(bidBtn, passBtn, moonBtn);
        panel.append(row, actions);

        // Moon: four quick choices, then bid.
        const moon = el('div', 'moon-panel');
        moon.hidden = true;
        const choice = (label, opts, def) => {
          const sel = el('select');
          opts.forEach(([v, t]) => {
            const o = el('option', '', t);
            o.value = String(v);
            if (String(v) === String(def)) o.selected = true;
            sel.append(o);
          });
          const f = el('label', 'field');
          f.append(el('span', '', label), sel);
          moon.append(f);
          return sel;
        };
        moon.append(el('p', 'note', 'Choose how this moon works, then bid.'));
        const valueSel = choice('Hand value', view.moonValues.map((v) => [v, String(v)]), view.moonDefault);
        const swapSel = choice('Cards swapped with partner', [[0, 'None'], [1, '1 card'], [2, '2 cards']], 0);
        const playsSel = choice('Partner plays the hand', [['yes', 'Yes'], ['no', 'No — partner sits out']], 'yes');
        const winSel = choice('To succeed, take all the', [['tricks', 'Tricks'], ['points', 'Points']], 'tricks');
        const go = el('button', 'primary big', 'Bid the moon');
        go.addEventListener('click', () => {
          const value = Number(valueSel.value);
          const swap = Number(swapSel.value);
          const partnerPlays = playsSel.value === 'yes';
          const win = winSel.value;
          const parts = [`for ${value}`, swap ? `swap ${swap} card${swap > 1 ? 's' : ''} with your partner` : null,
            partnerPlays ? null : 'partner sits out', `take every ${win === 'points' ? 'point' : 'trick'}`].filter(Boolean);
          if (confirm(`Bid the moon: ${parts.join(', ')}?`)) send({ type: 'bid', moon: true, value, swap, partnerPlays, win });
        });
        moon.append(go);
        moonBtn.addEventListener('click', () => { moon.hidden = !moon.hidden; });
        panel.append(moon);
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
      [...COLORS, 'BIRD'].forEach((g) => {
        const cards = view.callable.filter((c) => (g === 'BIRD' ? c === ROOK : c !== ROOK && c.slice(-1) === g));
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

    // Current trick (stays on the table after the fourth card until everyone is ready)
    if (view.phase === 'play' || view.phase === 'trickEnd') {
      const ended = view.phase === 'trickEnd';
      const trickBox = el('div', 'trick');
      for (let k = 0; k < 4; k++) {
        const s = (view.seat + k) % 4;
        const spot = el('div', 'trick-spot' + (ended ? (s === view.trickWinner ? ' won' : '') : (s === view.turn ? ' active' : '')));
        const played = view.trick.find((t) => t.seat === s);
        if (s === view.sitOut) {
          spot.classList.add('out');
          spot.append(el('div', 'card empty'), el('span', '', `${k === 0 ? 'You' : view.names[s]} (out)`));
          trickBox.append(spot);
          continue;
        }
        spot.append(played ? rookCardEl(played.card, view.trump) : el('div', 'card empty'));
        spot.append(el('span', '', k === 0 ? 'You' : view.names[s]));
        trickBox.append(spot);
      }
      root.append(trickBox);
      if (ended) {
        const who = view.trickWinner === view.seat ? 'You take' : `${view.names[view.trickWinner]} takes`;
        root.append(el('p', 'trick-result', `${who} the trick${view.trickPoints ? ` (+${view.trickPoints} points)` : ''}`));
        root.append(readyBox(view, send, 'Ready for the next trick', el));
      } else if (view.lastTrick) {
        root.append(el('p', 'last-trick', `Last trick: ${view.names[view.lastTrick.winner]} took ` +
          view.lastTrick.cards.map((t) => cardLabel(t.card)).join(', ')));
      }
    }

    // Claim the rest: only offered when winning every remaining trick is certain.
    if (view.canClaim) {
      const claim = el('button', 'primary big claim-btn', `Claim the rest — you win all ${view.hand.length} remaining tricks`);
      claim.addEventListener('click', () => {
        if (confirm('Claim every remaining trick and end the hand?')) send({ type: 'claim' });
      });
      root.append(claim);
    }

    // Your hand
    const handEl = el('div', 'hand');
    // Moon swap, step 1: the bidder picks cards from the partner's hand.
    if (view.phase === 'swapGive' && myTurn && view.partnerHand) {
      const takeBox = el('div', 'take-box');
      takeBox.append(el('p', 'note', `${view.partnerName}’s hand: tap ${view.moonSwap} card${view.moonSwap > 1 ? 's' : ''} to take.`));
      const row = el('div', 'hand');
      const chosen = new Set();
      const takeBtn = el('button', 'primary big', `Take 0 of ${view.moonSwap}`);
      takeBtn.disabled = true;
      view.partnerHand.forEach((card) => row.append(rookCardEl(card, view.trump, {
        playable: true,
        onClick: (cd, node) => {
          if (chosen.has(cd)) chosen.delete(cd); else if (chosen.size < view.moonSwap) chosen.add(cd);
          node.classList.toggle('selected', chosen.has(cd));
          takeBtn.disabled = chosen.size !== view.moonSwap;
          takeBtn.textContent = `Take ${chosen.size} of ${view.moonSwap}`;
        },
      })));
      takeBtn.addEventListener('click', () => send({ type: 'swap', cards: [...chosen] }));
      takeBox.append(row, takeBtn);
      root.append(takeBox);
      root.append(el('p', 'note', 'Your hand:'));
    }

    const swapping = view.phase === 'swapBack' && myTurn;
    const picking = (view.phase === 'nest' || swapping) && myTurn;
    const need = swapping ? view.moonSwap : view.nestSize;
    const verb = swapping ? 'Pass' : 'Discard';
    const picked = new Set();
    let confirmBtn = null;
    for (const card of view.hand) {
      const playable = view.playable.includes(card);
      handEl.append(rookCardEl(card, view.trump, {
        playable: playable || picking,
        onClick: (cd, node) => {
          if (picking) {
            if (picked.has(cd)) picked.delete(cd); else if (picked.size < need) picked.add(cd);
            node.classList.toggle('selected', picked.has(cd));
            confirmBtn.disabled = picked.size !== need;
            confirmBtn.textContent = `${verb} ${picked.size} of ${need}`;
          } else {
            send({ type: 'play', card: cd });
          }
        },
      }));
    }
    if (picking) {
      confirmBtn = el('button', 'primary big', `${verb} 0 of ${need}`);
      confirmBtn.disabled = true;
      confirmBtn.addEventListener('click', () => send(swapping ? { type: 'swap', cards: [...picked] } : { type: 'discard', cards: [...picked] }));
      root.append(confirmBtn);
    }
    root.append(handEl);

    const log = el('ul', 'log');
    view.log.forEach((line) => log.append(el('li', '', line)));
    root.append(log);
  },
};

// An original bird drawing for the Bird card.
const BIRD_SVG = '<svg viewBox="4 8 40 38" aria-hidden="true"><path fill="#1b1b1b" d="M41 13.5c-1.2-2.3-3.6-3.6-6.2-3.4-2.4.2-4.3 1.6-5.3 3.7-1 2-1.6 4.3-2.9 6.1-2.3 3.1-6.2 4.4-10.1 5.2-3.3.7-6.7 1.2-9.5 3.2l-3 2.2 4.4.4c-1.5 1.3-2.8 2.8-3.6 4.6l4.3-1.4c2.1 2.6 5.4 4 8.8 4 3.2 0 6.3-1.2 8.8-3.1 3.6-2.8 5.9-7 6.7-11.4.3-1.6.4-3.2.9-4.7.4-1.1 1.2-2.1 2.4-2.4l4.6-1.6z"/><circle cx="36.6" cy="13.2" r="1.25" fill="#fff"/><path fill="none" stroke="#1b1b1b" stroke-width="1.8" stroke-linecap="round" d="M22 38.5l-1.2 5.2M26.2 37.6l.6 5.4M18.6 43.7h4.4M24.6 43h4.4"/></svg>';

const tricksText = (n) => `${n} trick${n === 1 ? '' : 's'}`;

// "Ready" button for everyone, plus who we're waiting on, plus a host override.
function readyBox(view, send, label, el) {
  const box = el('div', 'ready-box');
  const mine = view.ready[view.seat];
  const btn = el('button', 'primary big', mine ? 'Waiting for others…' : label);
  btn.disabled = mine;
  btn.addEventListener('click', () => send({ type: 'ready' }));
  box.append(btn);
  const waiting = view.names.filter((_, s) => !view.ready[s]);
  if (waiting.length) box.append(el('p', 'ready-who', `Waiting for: ${waiting.join(', ')}`));
  if (view.seat === 0 && waiting.length) {
    const go = el('button', 'quiet', 'Continue without waiting');
    go.addEventListener('click', () => send({ type: 'continue' }));
    box.append(go);
  }
  return box;
}

function rookCardEl(card, trump, opts = {}) {
  const el = document.createElement(opts.onClick ? 'button' : 'div');
  const color = card === ROOK ? 'rook' : card.slice(-1);
  el.className = `card rook-card c-${color}` + (opts.playable ? ' playable' : '') + (opts.small ? ' small' : '') +
    (trump && card !== ROOK && color === trump ? ' trump' : '');
  if (card === ROOK) {
    el.innerHTML = `<span class="rook-word">BIRD</span><span class="rook-bird">${BIRD_SVG}</span>`;
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
