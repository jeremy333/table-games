// Hearts — 4 players, each for themselves. Avoid hearts (1 point each) and the
// Queen of Spades (13). Take them all ("shoot the moon") and everyone else gets 26.
// Lowest score when someone reaches the target wins.
import { standardDeck, shuffle, rankOf, suitOf, SUIT_SYMBOL, SUIT_NAME, cardEl } from '../js/cards.js';

const RANK_ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const PASS_DIRS = ['left', 'right', 'across', 'hold'];
const SUIT_ORDER = ['C', 'D', 'S', 'H'];

const rankVal = (c) => RANK_ORDER.indexOf(rankOf(c));
const pointsOf = (c) => (suitOf(c) === 'H' ? 1 : c === 'QS' ? 13 : 0);
const label = (c) => `${rankOf(c)}${SUIT_SYMBOL[suitOf(c)]}`;

function sortHand(h) {
  return h.slice().sort((a, b) => SUIT_ORDER.indexOf(suitOf(a)) - SUIT_ORDER.indexOf(suitOf(b)) || rankVal(a) - rankVal(b));
}

function say(s, t) {
  s.log.push(t);
  if (s.log.length > 30) s.log.shift();
}

function passTarget(s, seat) {
  const dir = PASS_DIRS[s.handNo % 4];
  if (dir === 'left') return (seat + 1) % 4;
  if (dir === 'right') return (seat + 3) % 4;
  if (dir === 'across') return (seat + 2) % 4;
  return null;
}

function deal(s) {
  const deck = shuffle(standardDeck());
  s.hands = [[], [], [], []];
  for (let i = 0; i < 52; i++) s.hands[i % 4].push(deck[i]);
  s.taken = [[], [], [], []];
  s.trick = [];
  s.lastTrick = null;
  s.broken = false;
  s.firstTrick = true;
  s.passes = [null, null, null, null];
  s.summary = null;
  if (PASS_DIRS[s.handNo % 4] === 'hold') startPlay(s);
  else s.phase = 'pass';
}

function startPlay(s) {
  s.phase = 'play';
  s.turn = s.hands.findIndex((h) => h.includes('2C'));
}

function legal(s, seat) {
  const hand = s.hands[seat];
  if (s.trick.length === 0) {
    if (s.firstTrick) return hand.includes('2C') ? ['2C'] : [];
    if (!s.broken) {
      const nonHearts = hand.filter((c) => suitOf(c) !== 'H');
      if (nonHearts.length) return nonHearts;
    }
    return hand.slice();
  }
  const led = suitOf(s.trick[0].card);
  const follow = hand.filter((c) => suitOf(c) === led);
  if (follow.length) return follow;
  if (s.firstTrick) {
    // No points on the first trick unless that's all you have.
    const safe = hand.filter((c) => pointsOf(c) === 0);
    if (safe.length) return safe;
  }
  return hand.slice();
}

function endHand(s) {
  const pts = s.taken.map((cards) => cards.reduce((sum, c) => sum + pointsOf(c), 0));
  const shooter = pts.findIndex((p) => p === 26);
  const delta = shooter >= 0 ? pts.map((_, i) => (i === shooter ? 0 : 26)) : pts;
  delta.forEach((d, i) => { s.scores[i] += d; });
  s.summary = {
    lines: s.names.map((n, i) => `${n}: took ${pts[i]}${i === shooter ? ' — shot the moon!' : ''}, +${delta[i]}`),
  };
  say(s, shooter >= 0 ? `${s.names[shooter]} shot the moon!` : 'Hand over');
  if (s.scores.some((x) => x >= s.opts.playTo)) {
    const low = Math.min(...s.scores);
    s.winners = s.scores.map((x, i) => (x === low ? i : -1)).filter((i) => i >= 0);
    s.phase = 'over';
    say(s, `${s.winners.map((i) => s.names[i]).join(' & ')} win${s.winners.length > 1 ? '' : 's'}!`);
  } else {
    s.phase = 'handOver';
  }
  s.ready = [false, false, false, false];
}

export default {
  minPlayers: 4,
  maxPlayers: 4,
  options: [
    { id: 'playTo', label: 'Game ends at', type: 'select', default: '100', choices: [['50', '50 points'], ['100', '100 points']] },
  ],
  rules(o) {
    return 'Each player for themselves. Pass 3 cards (left, right, across, then hold). The 2♣ leads the first trick; follow suit if you can. ' +
      'Hearts can’t be led until one has been played, and no points go on the first trick. Each heart is 1 point, the Q♠ is 13. ' +
      `Take all 26 and everyone else gets 26 instead. Lowest score when someone reaches ${o?.playTo || 100} wins.`;
  },

  setup(names, options = {}) {
    const s = {
      names,
      opts: { playTo: Number(options.playTo) === 50 ? 50 : 100 },
      scores: [0, 0, 0, 0],
      handNo: 0,
      winners: null,
      ready: [false, false, false, false],
      log: [],
    };
    deal(s);
    say(s, `Pass ${PASS_DIRS[0]}`);
    return s;
  },

  viewFor(s, seat) {
    const myTurn = s.phase === 'play' && s.turn === seat;
    return {
      seat,
      names: s.names,
      phase: s.phase,
      turn: s.turn,
      hand: sortHand(s.hands[seat]),
      counts: s.hands.map((h) => h.length),
      passDir: PASS_DIRS[s.handNo % 4],
      passTo: passTarget(s, seat),
      passed: s.passes.map((p) => !!p),
      trick: s.trick,
      lastTrick: s.lastTrick,
      trickWinner: s.phase === 'trickEnd' ? s.lastTrick.winner : null,
      takenPoints: s.taken.map((cards) => cards.reduce((sum, c) => sum + pointsOf(c), 0)),
      scores: s.scores,
      broken: s.broken,
      playable: myTurn ? legal(s, seat) : [],
      summary: s.summary,
      ready: s.ready,
      winner: s.winners,
      log: s.log.slice(-4),
    };
  },

  applyMove(s, seat, move) {
    if (s.phase === 'over') return 'The game is over.';

    if (s.phase === 'trickEnd' || s.phase === 'handOver') {
      if (move.type === 'continue') {
        if (seat !== 0) return 'Only the host can continue without waiting.';
        s.ready = [true, true, true, true];
      } else if (move.type === 'ready') {
        s.ready[seat] = true;
      } else return 'Tap Ready to continue.';
      if (!s.ready.every(Boolean)) return null;
      if (s.phase === 'trickEnd') {
        s.trick = [];
        if (s.hands.every((h) => h.length === 0)) endHand(s);
        else { s.phase = 'play'; s.turn = s.lastTrick.winner; }
      } else {
        s.handNo += 1;
        deal(s);
        say(s, PASS_DIRS[s.handNo % 4] === 'hold' ? 'No passing this hand' : `Pass ${PASS_DIRS[s.handNo % 4]}`);
      }
      return null;
    }

    if (s.phase === 'pass') {
      if (move.type !== 'pass') return 'Choose 3 cards to pass.';
      if (s.passes[seat]) return 'You already passed.';
      const cards = Array.isArray(move.cards) ? move.cards : [];
      if (cards.length !== 3 || new Set(cards).size !== 3 || !cards.every((c) => s.hands[seat].includes(c))) return 'Choose exactly 3 of your cards.';
      s.passes[seat] = cards;
      s.hands[seat] = s.hands[seat].filter((c) => !cards.includes(c));
      if (s.passes.every(Boolean)) {
        s.passes.forEach((cards2, from) => s.hands[passTarget(s, from)].push(...cards2));
        say(s, 'Cards passed');
        startPlay(s);
      }
      return null;
    }

    if (s.phase === 'play') {
      if (seat !== s.turn) return "It isn't your turn.";
      if (move.type !== 'play') return 'Play a card.';
      if (!legal(s, seat).includes(move.card)) return s.trick.length === 0 && !s.broken && suitOf(move.card) === 'H'
        ? 'Hearts haven’t been broken yet.' : 'You can’t play that card now.';
      s.hands[seat].splice(s.hands[seat].indexOf(move.card), 1);
      s.trick.push({ seat, card: move.card });
      if (suitOf(move.card) === 'H') s.broken = true;
      if (s.trick.length < 4) {
        s.turn = (seat + 1) % 4;
        return null;
      }
      const led = suitOf(s.trick[0].card);
      let best = s.trick[0];
      for (const t of s.trick) if (suitOf(t.card) === led && rankVal(t.card) > rankVal(best.card)) best = t;
      s.taken[best.seat].push(...s.trick.map((t) => t.card));
      s.lastTrick = { cards: s.trick, winner: best.seat };
      s.firstTrick = false;
      s.phase = 'trickEnd';
      s.ready = [false, false, false, false];
      say(s, `${s.names[best.seat]} took the trick`);
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
    const myTurn = view.phase === 'play' && view.turn === view.seat;

    // Scores
    const board = el('div', 'hearts-scores');
    view.names.forEach((n, i) => {
      const box = el('div', 'hearts-score' + (i === view.seat ? ' mine' : ''));
      box.append(el('span', '', n), el('strong', '', String(view.scores[i])));
      if (view.phase === 'play' || view.phase === 'trickEnd') box.append(el('small', '', `this hand: ${view.takenPoints[i]}`));
      board.append(box);
    });
    root.append(board);

    // Status
    let status;
    if (view.phase === 'over') status = view.winner.includes(view.seat) ? 'You win!' : `${view.winner.map((i) => view.names[i]).join(' & ')} win`;
    else if (view.phase === 'handOver') status = 'Hand over';
    else if (view.phase === 'trickEnd') status = 'Trick over';
    else if (view.phase === 'pass') status = view.passed[view.seat] ? 'Waiting for others to pass…' : `Pass 3 cards ${view.passDir} to ${view.names[view.passTo]}`;
    else status = myTurn ? 'Your turn' : `${view.names[view.turn]} is playing`;
    root.append(el('p', 'status' + (myTurn || (view.phase === 'pass' && !view.passed[view.seat]) ? ' mine' : ''), status));

    if (view.summary && (view.phase === 'handOver' || view.phase === 'over')) {
      const box = el('div', 'summary');
      view.summary.lines.forEach((l) => box.append(el('p', '', l)));
      if (view.phase === 'handOver') box.append(readyBox(view, send, 'Ready for the next hand', el));
      root.append(box);
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
        const pts = view.trick.reduce((sum, t) => sum + pointsOf(t.card), 0);
        const who = view.trickWinner === view.seat ? 'You take' : `${view.names[view.trickWinner]} takes`;
        root.append(el('p', 'trick-result', `${who} the trick${pts ? ` (${pts} point${pts > 1 ? 's' : ''})` : ''}`));
        root.append(readyBox(view, send, 'Ready for the next trick', el));
      } else if (view.lastTrick) {
        root.append(el('p', 'last-trick', `Last trick: ${view.names[view.lastTrick.winner]} took ${view.lastTrick.cards.map((t) => label(t.card)).join(', ')}`));
      }
      if (!view.broken && view.phase === 'play') root.append(el('p', 'last-trick', 'Hearts not broken yet'));
    }

    // Hand (pass selection or play)
    const picking = view.phase === 'pass' && !view.passed[view.seat];
    const picked = new Set();
    let passBtn = null;
    if (picking) {
      passBtn = el('button', 'primary big', 'Pass 0 of 3');
      passBtn.disabled = true;
      passBtn.addEventListener('click', () => send({ type: 'pass', cards: [...picked] }));
      root.append(passBtn);
    }
    const hand = el('div', 'hand');
    for (const card of view.hand) {
      hand.append(cardEl(card, {
        playable: picking || view.playable.includes(card),
        onClick: (c) => {
          if (picking) {
            if (picked.has(c)) picked.delete(c); else if (picked.size < 3) picked.add(c);
            [...hand.children].forEach((n) => n.classList.toggle('selected', picked.has(n.dataset.card)));
            passBtn.disabled = picked.size !== 3;
            passBtn.textContent = `Pass ${picked.size} of 3`;
          } else send({ type: 'play', card: c });
        },
      }));
      hand.lastChild.dataset.card = card;
    }
    root.append(hand);

    const log = el('ul', 'log');
    view.log.forEach((l) => log.append(el('li', '', l)));
    root.append(log);
  },

  styles: `
.hearts-scores { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.4rem; margin-top: 0.5rem; }
.hearts-score { display: grid; justify-items: center; border: 1.5px solid var(--felt-line); border-radius: 10px; padding: 0.35rem 0.2rem; text-align: center; }
.hearts-score.mine { border-color: var(--brass); }
.hearts-score span { font-size: 0.8rem; color: var(--muted); }
.hearts-score strong { font-family: var(--serif); font-size: 1.4rem; line-height: 1.2; }
.hearts-score small { font-size: 0.72rem; color: var(--muted); }
`,
};

// Ready button for everyone, who we're waiting on, and a host override.
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
