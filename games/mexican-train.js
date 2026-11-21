// Mexican Train — 2 to 8 players with dominoes. Each round starts from a double
// "engine" (12-12, then 11-11, down to 0-0). Build your own train, the shared
// Mexican Train, or any train with a marker on it. Lowest total after all rounds wins.
import { shuffle } from '../js/cards.js';

const HAND = {
  12: { 2: 15, 3: 15, 4: 15, 5: 12, 6: 12, 7: 10, 8: 10 },
  9: { 2: 12, 3: 10, 4: 10, 5: 8, 6: 7, 7: 6, 8: 5 },
};
const PIP_COLORS = ['#8a8a8a', '#2f7fd1', '#2e9a4b', '#d4381f', '#7a3fb0', '#c98a00', '#1a9aa0', '#d14f9a', '#5a6b2f', '#3949ab', '#e06c00', '#00796b', '#8d6e63'];

const tileId = (a, b) => (a <= b ? `${a}-${b}` : `${b}-${a}`);
const parts = (t) => t.split('-').map(Number);
const pips = (t) => parts(t)[0] + parts(t)[1];
const isDouble = (t) => { const [a, b] = parts(t); return a === b; };

function makeSet(max) {
  const s = [];
  for (let a = 0; a <= max; a++) for (let b = a; b <= max; b++) s.push(tileId(a, b));
  return s;
}

function say(s, t) {
  s.log.push(t);
  if (s.log.length > 30) s.log.shift();
}

const trainKeys = (s) => [...s.names.map((_, i) => i), 'mx'];
const trainEnd = (s, key) => {
  const tr = s.trains[key];
  return tr.tiles.length ? tr.tiles[tr.tiles.length - 1].out : s.engineValue;
};

// Where could this player put this tile right now?
function placesFor(s, seat, tile) {
  const [a, b] = parts(tile);
  const fits = (key) => { const e = trainEnd(s, key); return a === e || b === e; };
  if (s.openDouble != null) return fits(s.openDouble) ? [s.openDouble] : [];
  return trainKeys(s).filter((key) => (key === seat || key === 'mx' || s.trains[key].open) && fits(key));
}

function legalPlays(s, seat) {
  const out = [];
  for (const tile of s.hands[seat]) for (const train of placesFor(s, seat, tile)) out.push({ tile, train });
  return out;
}

function startRound(s) {
  const engine = s.roundEngines[s.round];
  s.engineValue = engine;
  const set = shuffle(makeSet(s.opts.set).filter((t) => t !== tileId(engine, engine)));
  const each = HAND[s.opts.set][s.names.length];
  s.hands = s.names.map(() => set.splice(0, each));
  s.boneyard = set;
  s.trains = {};
  trainKeys(s).forEach((k) => { s.trains[k] = { tiles: [], open: k === 'mx' }; });
  s.openDouble = null;
  s.turn = s.round % s.names.length;
  s.drew = false;
  s.passes = 0;
  s.phase = 'play';
  s.summary = null;
  say(s, `Round ${s.round + 1}: engine is double ${engine}`);
}

function nextTurn(s) {
  s.turn = (s.turn + 1) % s.names.length;
  s.drew = false;
}

function endRound(s, winnerSeat) {
  const counts = s.hands.map((h) => h.reduce((t, x) => t + pips(x), 0));
  counts.forEach((c, i) => { s.scores[i] += c; });
  s.summary = {
    headline: winnerSeat != null ? `${s.names[winnerSeat]} played their last domino!` : 'Blocked — nobody can play.',
    lines: s.names.map((n, i) => `${n}: +${counts[i]} (total ${s.scores[i]})`),
  };
  say(s, s.summary.headline);
  s.ready = s.names.map(() => false);
  if (s.round + 1 >= s.roundEngines.length) {
    const low = Math.min(...s.scores);
    s.winners = s.scores.map((x, i) => (x === low ? i : -1)).filter((i) => i >= 0);
    s.phase = 'over';
    say(s, `${s.winners.map((i) => s.names[i]).join(' & ')} win${s.winners.length > 1 ? '' : 's'} with ${low}!`);
  } else {
    s.phase = 'roundOver';
  }
}

export default {
  minPlayers: 2,
  maxPlayers: 8,
  options: [
    { id: 'set', label: 'Domino set', type: 'select', default: '12', choices: [['12', 'Double-12 (91 dominoes)'], ['9', 'Double-9 (55 dominoes)']] },
    { id: 'rounds', label: 'Rounds', type: 'select', default: 'all', choices: [['all', 'Full game (every double)'], ['half', 'Half game'], ['3', 'Quick: 3 rounds']] },
  ],
  rules: 'Each round starts from a double engine in the middle (12-12, then 11-11, and so on). On your turn, add one matching domino to your own train, ' +
    'the shared Mexican Train, or any train with a marker. Can’t play? Draw one; if it still doesn’t fit, pass and put a marker on your train so others can use it. ' +
    'Play a double and you go again — and the next domino played by anyone must cover that double. The round ends when someone plays their last domino; ' +
    'everyone adds up the dots left in their hand. Lowest total wins.',

  setup(names, options = {}) {
    const set = Number(options.set) === 9 ? 9 : 12;
    let engines = [];
    for (let e = set; e >= 0; e--) engines.push(e);
    if (options.rounds === 'half') engines = engines.slice(0, Math.ceil(engines.length / 2));
    else if (options.rounds === '3') engines = engines.slice(0, 3);
    const s = { names, opts: { set }, roundEngines: engines, round: 0, scores: names.map(() => 0), winners: null, log: [], ready: names.map(() => false) };
    startRound(s);
    return s;
  },

  viewFor(s, seat) {
    const myTurn = s.phase === 'play' && s.turn === seat;
    const trains = trainKeys(s).map((key) => ({
      key, owner: key === 'mx' ? null : key, open: s.trains[key].open,
      tiles: s.trains[key].tiles.map((x) => [x.in, x.out]), end: trainEnd(s, key),
    }));
    const plays = myTurn ? legalPlays(s, seat) : [];
    return {
      seat, names: s.names, phase: s.phase, turn: s.turn, round: s.round, rounds: s.roundEngines.length,
      engine: s.engineValue, hand: s.hands[seat].slice().sort((x, y) => pips(y) - pips(x)),
      counts: s.hands.map((h) => h.length), trains, openDouble: s.openDouble, boneyard: s.boneyard.length,
      plays, canDraw: myTurn && !s.drew && !plays.length && s.boneyard.length > 0,
      canPass: myTurn && !plays.length && (s.drew || !s.boneyard.length),
      scores: s.scores, summary: s.summary, ready: s.ready, winner: s.winners, log: s.log.slice(-5),
    };
  },

  applyMove(s, seat, move) {
    if (s.phase === 'over') return 'The game is over.';
    if (s.phase === 'roundOver') {
      if (move.type === 'continue') {
        if (seat !== 0) return 'Only the host can continue without waiting.';
        s.ready = s.names.map(() => true);
      } else if (move.type === 'ready') s.ready[seat] = true;
      else return 'Tap Ready for the next round.';
      if (s.ready.every(Boolean)) { s.round += 1; startRound(s); }
      return null;
    }
    if (seat !== s.turn) return "It isn't your turn.";
    const name = s.names[seat];
    const plays = legalPlays(s, seat);

    if (move.type === 'draw') {
      if (plays.length) return 'You have a domino that fits — play it.';
      if (s.drew) return 'You already drew this turn.';
      if (!s.boneyard.length) return 'The boneyard is empty — pass.';
      s.hands[seat].push(s.boneyard.pop());
      s.drew = true;
      say(s, `${name} drew a domino`);
      return null;
    }

    if (move.type === 'pass') {
      if (plays.length) return 'You have a domino that fits — play it.';
      if (!s.drew && s.boneyard.length) return 'Draw first.';
      if (!s.trains[seat].open) say(s, `${name} passed — marker on their train`);
      else say(s, `${name} passed`);
      s.trains[seat].open = true;
      s.passes += 1;
      if (!s.boneyard.length && s.passes >= s.names.length) { endRound(s, null); return null; }
      nextTurn(s);
      return null;
    }

    if (move.type === 'play') {
      const key = move.train === 'mx' ? 'mx' : Number(move.train);
      if (!plays.some((p) => p.tile === move.tile && p.train === key)) {
        return s.openDouble != null ? 'The double must be covered first.' : 'That domino doesn’t fit there.';
      }
      const [a, b] = parts(move.tile);
      const end = trainEnd(s, key);
      const out = a === end ? b : a;
      s.trains[key].tiles.push({ in: end, out });
      s.hands[seat].splice(s.hands[seat].indexOf(move.tile), 1);
      if (key === seat) s.trains[seat].open = false; // playing on your own train removes your marker
      s.passes = 0;
      const where = key === 'mx' ? 'the Mexican Train' : key === seat ? 'their train' : `${s.names[key]}’s train`;
      say(s, `${name} played ${a}-${b} on ${where}`);
      if (s.openDouble === key) s.openDouble = null;
      if (!s.hands[seat].length) { endRound(s, seat); return null; }
      if (isDouble(move.tile)) {
        s.openDouble = key;
        s.drew = false;
        say(s, `${name} played a double and goes again`);
        return null; // same player again, and the double must be covered
      }
      nextTurn(s);
      return null;
    }
    return 'Play, draw, or pass.';
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
    const domino = (a, b, extra = '') => {
      const d = el('span', 'mt-dom' + extra);
      const half = (v) => { const x = el('span', 'mt-half', String(v)); x.style.color = PIP_COLORS[v]; return x; };
      d.append(half(a), half(b));
      d.setAttribute('aria-label', `${a}-${b}`);
      return d;
    };

    const board = el('div', 'mt-scores');
    view.names.forEach((n, i) => {
      const b = el('div', 'mt-score' + (i === view.turn && view.phase === 'play' ? ' active' : '') + (i === view.seat ? ' mine' : ''));
      b.append(el('span', '', n), el('strong', '', String(view.scores[i])), el('small', '', `${view.counts[i]} in hand`));
      board.append(b);
    });
    root.append(board);

    let status;
    if (view.phase === 'over') status = view.winner.includes(view.seat) ? 'You win!' : `${view.winner.map((i) => view.names[i]).join(' & ')} win`;
    else if (view.phase === 'roundOver') status = 'Round over';
    else if (myTurn) status = view.openDouble != null ? 'Cover the double!' : view.plays.length ? 'Your turn — pick a domino' : (view.canDraw ? 'No match — draw one' : 'No match — pass');
    else status = `${view.names[view.turn]} is playing`;
    root.append(el('p', 'status' + (myTurn ? ' mine' : ''), status));

    if (view.summary && view.phase !== 'play') {
      const box = el('div', 'summary');
      box.append(el('p', '', view.summary.headline));
      view.summary.lines.forEach((l) => box.append(el('p', '', l)));
      if (view.phase === 'roundOver') box.append(readyBox(view, send, 'Ready for the next round', el));
      root.append(box);
    }

    if (view.phase === 'play') {
      const top = el('div', 'mt-engine');
      top.append(el('span', '', `Round ${view.round + 1} of ${view.rounds} · Engine`), domino(view.engine, view.engine, ' engine'), el('span', '', `Boneyard: ${view.boneyard}`));
      root.append(top);
    }

    let chosen = null;
    const trainsEl = el('div', 'mt-trains');
    const drawTrains = () => {
      trainsEl.replaceChildren();
      const can = new Set(view.plays.filter((p) => p.tile === chosen).map((p) => String(p.train)));
      view.trains.forEach((t) => {
        const isMine = t.owner === view.seat;
        const label = t.key === 'mx' ? 'Mexican Train' : isMine ? 'Your train' : `${view.names[t.owner]}’s train`;
        const playable = can.has(String(t.key));
        const row = el(playable ? 'button' : 'div', 'mt-train' + (playable ? ' can' : '') + (view.openDouble === t.key ? ' double' : '') + (isMine ? ' mine' : ''));
        const head = el('div', 'mt-train-head');
        head.append(el('strong', '', label), el('span', 'mt-flag', t.open && t.key !== 'mx' ? '🚩 open' : ''), el('span', 'mt-end', `ends in ${t.end}`));
        row.append(head);
        const line = el('div', 'mt-line');
        const shown = t.tiles.slice(-4);
        if (t.tiles.length > 4) line.append(el('span', 'note', `+${t.tiles.length - 4} `));
        shown.forEach(([a, b]) => line.append(domino(a, b)));
        if (!t.tiles.length) line.append(el('span', 'note', 'not started'));
        row.append(line);
        if (playable) {
          row.type = 'button';
          row.addEventListener('click', () => send({ type: 'play', tile: chosen, train: t.key }));
        }
        trainsEl.append(row);
      });
    };
    if (view.phase === 'play') { drawTrains(); root.append(trainsEl); }

    if (view.phase === 'play') {
      const handHead = el('p', 'note', myTurn && view.plays.length ? 'Tap a domino, then tap a highlighted train.' : 'Your dominoes:');
      root.append(handHead);
      const hand = el('div', 'mt-hand');
      const playableTiles = new Set(view.plays.map((p) => p.tile));
      view.hand.forEach((t) => {
        const [a, b] = parts(t);
        const ok = playableTiles.has(t);
        const btn = el(ok ? 'button' : 'div', 'mt-pick' + (ok ? ' can' : ''));
        btn.append(domino(a, b));
        if (ok) {
          btn.type = 'button';
          btn.addEventListener('click', () => {
            chosen = chosen === t ? null : t;
            hand.querySelectorAll('.mt-pick').forEach((x) => x.classList.remove('sel'));
            if (chosen) btn.classList.add('sel');
            const targets = view.plays.filter((p) => p.tile === chosen);
            if (chosen && targets.length === 1 && view.trains.length > 0) {
              // Only one place it can go: highlight it (still tap to confirm).
            }
            drawTrains();
          });
        }
        hand.append(btn);
      });
      root.append(hand);
      if (myTurn && (view.canDraw || view.canPass)) {
        const b = el('button', 'primary big', view.canDraw ? 'Draw a domino' : 'Pass (put a marker on my train)');
        b.addEventListener('click', () => send({ type: view.canDraw ? 'draw' : 'pass' }));
        root.append(b);
      }
    }

    const log = el('ul', 'log');
    view.log.forEach((l) => log.append(el('li', '', l)));
    root.append(log);
  },

  styles: `
.mt-scores { display: grid; grid-template-columns: repeat(auto-fill, minmax(5.4rem, 1fr)); gap: 0.4rem; margin-top: 0.5rem; }
.mt-score { display: grid; justify-items: center; border: 1.5px solid var(--felt-line); border-radius: 10px; padding: 0.3rem; text-align: center; }
.mt-score.active { border-color: var(--brass); }
.mt-score.mine span { color: var(--brass); }
.mt-score span { font-size: 0.8rem; color: var(--muted); }
.mt-score strong { font-family: var(--serif); font-size: 1.2rem; }
.mt-score small { font-size: 0.7rem; color: var(--muted); }
.mt-engine { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; color: var(--muted); font-size: 0.85rem; margin: 0.4rem 0 0.6rem; }
.mt-dom { display: inline-flex; background: #fffdf6; border: 2px solid #1b1b1b; border-radius: 7px; overflow: hidden; vertical-align: middle; box-shadow: 0 2px 0 rgba(0,0,0,0.3); }
.mt-dom.engine { transform: scale(1.15); }
.mt-half { width: 1.75rem; height: 1.75rem; display: grid; place-items: center; font: 800 0.95rem/1 var(--sans); }
.mt-half + .mt-half { border-left: 2px solid #1b1b1b; }
.mt-trains { display: grid; gap: 0.4rem; }
.mt-train { display: grid; gap: 0.3rem; width: 100%; text-align: left; border: 1.5px solid var(--felt-line); border-radius: 10px; padding: 0.4rem 0.6rem; background: transparent; color: var(--chalk); min-height: 0; }
.mt-train.mine { background: rgba(212, 173, 58, 0.07); }
.mt-train.can { border-color: var(--brass); background: rgba(212, 173, 58, 0.18); cursor: pointer; }
.mt-train.double { border-color: #e0262e; }
.mt-train-head { display: flex; gap: 0.5rem; align-items: baseline; }
.mt-train-head strong { font-size: 0.92rem; }
.mt-flag { font-size: 0.78rem; }
.mt-end { margin-left: auto; color: var(--muted); font-size: 0.8rem; }
.mt-line { display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; min-height: 1.9rem; }
.mt-hand { display: flex; flex-wrap: wrap; gap: 0.45rem; justify-content: center; margin: 0.4rem 0 0.8rem; }
.mt-pick { padding: 0.15rem; border: none; background: none; min-height: 0; border-radius: 10px; opacity: 1; }
.mt-pick.can { outline: 2px solid var(--brass); outline-offset: 1px; cursor: pointer; }
.mt-pick.sel { transform: translateY(-6px); outline: 3px solid #fff; }
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
