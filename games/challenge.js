// Challenge — 2 to 12 players in teams (lobby order). Play a card from your hand
// and place a chip on a matching space on the board. Two-eyed Jacks (♦ ♣) are
// wild; one-eyed Jacks (♠ ♥) remove an opponent's chip. Five in a row is a
// sequence; the four corners count for everyone. Two teams need two sequences;
// three teams need one.
//
// The board uses its own fixed arrangement: every card except Jacks appears twice,
// plus four free corners.
import { standardDeck, shuffle, rankOf, suitOf, SUIT_SYMBOL, SUIT_NAME, cardEl } from '../js/cards.js';

const SIZE = 10;
const CORNERS = [0, 9, 90, 99];
const TWO_EYED = ['JD', 'JC'];
const ONE_EYED = ['JS', 'JH'];
const TEAM_NAMES = ['Blue', 'Green', 'Red'];
const HAND = { 2: 7, 3: 6, 4: 6, 5: 6, 6: 5, 7: 4, 8: 4, 9: 4, 10: 3, 11: 3, 12: 3 };

// The board layout: a fixed arrangement made with a seeded shuffle, so it's the
// same every game and players can learn it.
function seeded(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const LAYOUT = (() => {
  const cards = standardDeck().filter((c) => rankOf(c) !== 'J');
  const pool = [...cards, ...cards];
  const rand = seeded(20261121);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const layout = [];
  for (let i = 0; i < 100; i++) layout.push(CORNERS.includes(i) ? 'FREE' : pool.pop());
  return layout;
})();

const isJack = (c) => rankOf(c) === 'J';
const label = (c) => `${rankOf(c)}${SUIT_SYMBOL[suitOf(c)]}`;

function teamCount(n, opt) {
  if (n === 3) return 3;
  if (opt === '3' && n % 3 === 0 && n >= 6) return 3;
  return 2;
}

function say(s, t) {
  s.log.push(t);
  if (s.log.length > 30) s.log.shift();
}

function draw(s) {
  if (!s.deck.length && s.discard.length) {
    s.deck = shuffle(s.discard);
    s.discard = [];
  }
  return s.deck.pop() || null;
}

function isDead(s, card) {
  if (isJack(card)) return false;
  return LAYOUT.every((c, i) => c !== card || s.chips[i] !== null);
}

// Spaces this card could go on right now.
function targetsFor(s, seat, card) {
  const team = s.teamOf[seat];
  if (TWO_EYED.includes(card)) return LAYOUT.map((_, i) => i).filter((i) => !CORNERS.includes(i) && s.chips[i] === null);
  if (ONE_EYED.includes(card)) return LAYOUT.map((_, i) => i).filter((i) => s.chips[i] !== null && s.chips[i] !== team && !s.locked[i]);
  return LAYOUT.map((c, i) => (c === card && s.chips[i] === null ? i : -1)).filter((i) => i >= 0);
}

// No card can go anywhere and no dead card can be swapped: the player passes.
function mustPass(s, seat) {
  const hand = s.hands[seat];
  if (hand.some((c) => targetsFor(s, seat, c).length)) return false;
  return s.swapped || !hand.some((c) => isDead(s, c));
}

// After a chip lands at idx: find any new sequences of five through it.
function newSequences(s, idx, team) {
  const r0 = Math.floor(idx / SIZE);
  const c0 = idx % SIZE;
  const mine = (i) => CORNERS.includes(i) || s.chips[i] === team;
  const found = [];
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    // The run of this team's chips (and corners) through idx in this direction.
    const run = [idx];
    for (const sign of [-1, 1]) {
      let r = r0 + dr * sign;
      let c = c0 + dc * sign;
      while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && mine(r * SIZE + c)) {
        if (sign < 0) run.unshift(r * SIZE + c); else run.push(r * SIZE + c);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (run.length < 5) continue;
    // Windows of five containing idx; a new sequence may share at most one space with this team's others.
    for (let start = 0; start + 5 <= run.length; start++) {
      const win = run.slice(start, start + 5);
      if (!win.includes(idx)) continue;
      const used = new Set([...s.sequences[team].flat(), ...found.flat()]);
      if (win.filter((i) => used.has(i)).length > 1) continue;
      found.push(win);
    }
  }
  return found;
}

export default {
  minPlayers: 2,
  maxPlayers: 12,
  options: [
    { id: 'teams', label: 'Teams (6, 9 or 12 players)', type: 'select', default: '2', choices: [['2', 'Two teams'], ['3', 'Three teams']] },
  ],
  rules: 'Teams go by lobby order (players 1, 3, 5… vs 2, 4, 6…; with 3 players or three teams, every third player). ' +
    'On your turn, play a card and put a chip on a matching space. Two-eyed Jacks (♦ ♣) go anywhere open; one-eyed Jacks (♠ ♥) remove an opponent’s chip (not one in a finished sequence). ' +
    'If both spaces for a card are taken, swap it for a new one. Five in a row is a sequence; corners count for everyone. Two teams need two sequences to win, three teams need one.',

  setup(names, options = {}) {
    const n = names.length;
    const T = teamCount(n, options.teams);
    const deck = shuffle([...standardDeck(), ...standardDeck()]);
    const s = {
      names, T, needed: T === 2 ? 2 : 1,
      teamOf: names.map((_, i) => i % T),
      chips: Array(100).fill(null), locked: Array(100).fill(false),
      sequences: Array.from({ length: T }, () => []),
      deck, discard: [], hands: names.map(() => []),
      turn: 0, swapped: false, last: null, phase: 'play', winTeam: null, log: [],
    };
    for (let k = 0; k < HAND[n]; k++) for (let p = 0; p < n; p++) s.hands[p].push(s.deck.pop());
    say(s, `${names[0]} goes first`);
    return s;
  },

  viewFor(s, seat) {
    const myTurn = s.phase === 'play' && s.turn === seat;
    return {
      seat, names: s.names, T: s.T, needed: s.needed, teamOf: s.teamOf, layout: LAYOUT,
      chips: s.chips, locked: s.locked, seqCounts: s.sequences.map((x) => x.length),
      hand: s.hands[seat] || [], turn: s.turn, phase: s.phase, last: s.last, deckLeft: s.deck.length,
      targets: myTurn ? Object.fromEntries((s.hands[seat] || []).map((c) => [c, targetsFor(s, seat, c)])) : {},
      dead: myTurn && !s.swapped ? (s.hands[seat] || []).filter((c) => isDead(s, c)) : [],
      canPass: myTurn && mustPass(s, seat),
      winner: s.winTeam == null ? null : s.names.map((_, i) => i).filter((i) => s.teamOf[i] === s.winTeam),
      winTeam: s.winTeam, log: s.log.slice(-4),
    };
  },

  applyMove(s, seat, move) {
    if (s.phase === 'over') return 'The game is over.';
    if (seat !== s.turn) return "It isn't your turn.";
    const hand = s.hands[seat];
    const name = s.names[seat];
    const team = s.teamOf[seat];

    if (move.type === 'dead') {
      if (s.swapped) return 'You can swap one dead card per turn.';
      if (!hand.includes(move.card) || !isDead(s, move.card)) return 'That card isn’t dead — both its spaces aren’t taken.';
      hand.splice(hand.indexOf(move.card), 1);
      s.discard.push(move.card);
      const c = draw(s);
      if (c) hand.push(c);
      s.swapped = true;
      say(s, `${name} swapped a dead ${label(move.card)}`);
      return null;
    }

    if (move.type === 'pass') {
      if (!mustPass(s, seat)) return 'You have a card you can play (or a dead card to swap).';
      say(s, `${name} had no move and passed`);
      s.swapped = false;
      s.turn = (s.turn + 1) % s.names.length;
      return null;
    }

    if (move.type !== 'play') return 'Play a card.';
    if (!hand.includes(move.card)) return "That card isn't in your hand.";
    const cell = Number(move.cell);
    if (!targetsFor(s, seat, move.card).includes(cell)) {
      if (ONE_EYED.includes(move.card)) return 'One-eyed Jacks remove an opponent’s chip that isn’t in a sequence.';
      return 'That card can’t go there.';
    }
    hand.splice(hand.indexOf(move.card), 1);
    s.discard.push(move.card);
    if (ONE_EYED.includes(move.card)) {
      const from = s.chips[cell];
      s.chips[cell] = null;
      s.last = { cell, removed: true };
      say(s, `${name} removed a ${TEAM_NAMES[from]} chip with ${label(move.card)}`);
    } else {
      s.chips[cell] = team;
      s.last = { cell, removed: false };
      say(s, `${name} played ${label(move.card)}${TWO_EYED.includes(move.card) ? ' (wild)' : ''}`);
      const seqs = newSequences(s, cell, team);
      for (const win of seqs) {
        s.sequences[team].push(win);
        win.forEach((i) => { s.locked[i] = true; });
        say(s, `${TEAM_NAMES[team]} made a sequence!`);
      }
      if (s.sequences[team].length >= s.needed) {
        s.winTeam = team;
        s.phase = 'over';
        say(s, `${TEAM_NAMES[team]} team wins!`);
        return null;
      }
    }
    const c = draw(s);
    if (c) hand.push(c);
    s.swapped = false;
    s.turn = (s.turn + 1) % s.names.length;
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
    const myTurn = view.phase === 'play' && view.turn === view.seat;
    const myTeam = view.teamOf[view.seat];

    const teams = el('div', 'ch-teams');
    for (let t = 0; t < view.T; t++) {
      const members = view.names.filter((_, i) => view.teamOf[i] === t);
      const box = el('div', `ch-team t${t}` + (t === myTeam ? ' mine' : '') + (view.teamOf[view.turn] === t && view.phase === 'play' ? ' active' : ''));
      box.append(el('strong', '', `${TEAM_NAMES[t]}${t === myTeam ? ' (you)' : ''}`), el('span', '', members.join(', ')),
        el('small', '', `${view.seqCounts[t]} of ${view.needed} sequence${view.needed > 1 ? 's' : ''}`));
      teams.append(box);
    }
    root.append(teams);

    let status;
    if (view.phase === 'over') status = view.winTeam === myTeam ? 'Your team wins!' : `${TEAM_NAMES[view.winTeam]} team wins`;
    else status = myTurn ? 'Your turn — pick a card' : `${view.names[view.turn]} (${TEAM_NAMES[view.teamOf[view.turn]]}) is playing`;
    root.append(el('p', 'status' + (myTurn ? ' mine' : ''), status));

    let chosen = null;
    const board = el('div', 'ch-board');
    const drawBoard = () => {
      board.replaceChildren();
      const targets = new Set(chosen ? view.targets[chosen] || [] : []);
      view.layout.forEach((card, i) => {
        const can = targets.has(i);
        const cell = el(can ? 'button' : 'div', 'ch-cell' + (can ? ' can' : '') + (view.last && view.last.cell === i ? ' last' : ''));
        if (card === 'FREE') {
          cell.classList.add('free');
          cell.append(el('span', 'ch-free', '★'));
        } else {
          const red = ['H', 'D'].includes(suitOf(card));
          cell.append(el('span', 'ch-label' + (red ? ' red' : ''), `${rankOf(card)}${SUIT_SYMBOL[suitOf(card)]}`));
        }
        const chip = view.chips[i];
        if (chip !== null) cell.append(el('span', `ch-chip t${chip}` + (view.locked[i] ? ' locked' : '')));
        cell.setAttribute('aria-label', `${card === 'FREE' ? 'Free corner' : `${rankOf(card)} of ${SUIT_NAME[suitOf(card)]}`}${chip !== null ? `, ${TEAM_NAMES[chip]} chip` : ''}`);
        if (can) {
          cell.type = 'button';
          cell.addEventListener('click', () => send({ type: 'play', card: chosen, cell: i }));
        }
        board.append(cell);
      });
    };
    drawBoard();
    root.append(board);

    const tip = el('p', 'note ch-tip', myTurn ? 'Tap a card, then a highlighted space.' : '');
    root.append(tip);
    const deadBtn = el('button', '', 'Swap this dead card');
    deadBtn.hidden = true;
    deadBtn.addEventListener('click', () => send({ type: 'dead', card: chosen }));

    const hand = el('div', 'hand');
    view.hand.forEach((card) => {
      const c = cardEl(card, {
        playable: myTurn,
        onClick: () => {
          chosen = chosen === card ? null : card;
          hand.querySelectorAll('.card').forEach((x) => x.classList.toggle('selected', x.dataset.card === chosen));
          drawBoard();
          const n = chosen ? (view.targets[chosen] || []).length : 0;
          deadBtn.hidden = !(chosen && view.dead.includes(chosen));
          tip.textContent = !chosen ? 'Tap a card, then a highlighted space.'
            : TWO_EYED.includes(chosen) ? 'Two-eyed Jack: place a chip on any open space.'
              : ONE_EYED.includes(chosen) ? (n ? 'One-eyed Jack: tap an opponent’s chip to remove it.' : 'No opponent chips can be removed right now.')
                : n ? `Tap a highlighted ${label(chosen)} space.` : 'Both spaces for this card are taken — swap it.';
        },
      });
      c.dataset.card = card;
      hand.append(c);
    });
    root.append(hand);
    if (myTurn) root.append(deadBtn);
    if (view.canPass) {
      const pass = el('button', 'primary big', 'No card can be played — pass');
      pass.addEventListener('click', () => send({ type: 'pass' }));
      root.append(pass);
    }

    const log = el('ul', 'log');
    view.log.forEach((l) => log.append(el('li', '', l)));
    root.append(log);
  },

  styles: `
.ch-teams { display: grid; grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr)); gap: 0.4rem; margin-top: 0.5rem; }
.ch-team { display: grid; gap: 0.05rem; border: 1.5px solid var(--felt-line); border-radius: 10px; padding: 0.35rem 0.6rem; border-left-width: 6px; }
.ch-team.t0 { border-left-color: #2f7fd1; } .ch-team.t1 { border-left-color: #2e9a4b; } .ch-team.t2 { border-left-color: #d4381f; }
.ch-team.active { border-top-color: var(--brass); border-right-color: var(--brass); border-bottom-color: var(--brass); }
.ch-team span, .ch-team small { color: var(--muted); font-size: 0.78rem; }
.ch-board { display: grid; grid-template-columns: repeat(10, 1fr); gap: 2px; width: min(100%, 30rem); margin: 0.6rem auto; background: #0e2a1f; padding: 3px; border-radius: 8px; }
.ch-cell { position: relative; aspect-ratio: 5 / 6; background: #fffdf6; border: none; border-radius: 3px; padding: 0; min-height: 0; display: grid; place-items: center; overflow: hidden; }
.ch-cell.free { background: #f3e2a6; }
.ch-free { font-size: 1.1rem; color: #8a6a00; }
.ch-label { font: 700 clamp(0.55rem, 2.6vw, 0.85rem)/1 var(--sans); color: #1b1b1b; letter-spacing: -0.02em; }
.ch-label.red { color: #c4141c; }
.ch-cell.can { outline: 2px solid var(--brass); outline-offset: -2px; background: #fff3c4; cursor: pointer; }
.ch-cell.last { box-shadow: inset 0 0 0 2px #ff00aa; }
.ch-chip { position: absolute; width: 70%; aspect-ratio: 1; border-radius: 50%; opacity: 0.88; box-shadow: 0 1px 2px rgba(0,0,0,0.5); }
.ch-chip.t0 { background: #2f7fd1; } .ch-chip.t1 { background: #2e9a4b; } .ch-chip.t2 { background: #d4381f; }
.ch-chip.locked { box-shadow: 0 0 0 2px #fff, 0 0 0 4px rgba(0,0,0,0.6); opacity: 1; }
.ch-tip { text-align: center; min-height: 1.2rem; }
`,
};
