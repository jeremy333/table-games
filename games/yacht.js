// Yacht — 1 to 8 players, five dice, 13 rounds. Each turn, roll up to three
// times (hold any dice between rolls), then score the result in one empty box
// on your card. Highest total wins.
import { rollDice, dieEl, DICE_STYLES } from '../js/dice.js';

export const CATS = [
  { id: 'ones', name: 'Ones', upper: 1 }, { id: 'twos', name: 'Twos', upper: 2 }, { id: 'threes', name: 'Threes', upper: 3 },
  { id: 'fours', name: 'Fours', upper: 4 }, { id: 'fives', name: 'Fives', upper: 5 }, { id: 'sixes', name: 'Sixes', upper: 6 },
  { id: 'three', name: 'Three of a kind', hint: 'total of all dice' }, { id: 'four', name: 'Four of a kind', hint: 'total of all dice' },
  { id: 'full', name: 'Full house', hint: '25' }, { id: 'small', name: 'Small straight', hint: '30 (four in a row)' },
  { id: 'large', name: 'Large straight', hint: '40 (five in a row)' }, { id: 'yacht', name: 'Yacht', hint: '50 (all five the same)' },
  { id: 'chance', name: 'Chance', hint: 'total of all dice' },
];
const UPPER_BONUS = 35;
const UPPER_NEEDED = 63;
const EXTRA_YACHT = 100;

// Points these dice would earn in a category.
export function scoreFor(cat, dice) {
  const c = [0, 0, 0, 0, 0, 0, 0];
  dice.forEach((d) => { c[d] += 1; });
  const sum = dice.reduce((a, b) => a + b, 0);
  const has = (n) => c.some((x) => x >= n);
  const run = (len) => {
    for (let start = 1; start + len - 1 <= 6; start++) {
      let ok = true;
      for (let f = start; f < start + len; f++) if (!c[f]) ok = false;
      if (ok) return true;
    }
    return false;
  };
  const def = CATS.find((x) => x.id === cat);
  if (def.upper) return c[def.upper] * def.upper;
  switch (cat) {
    case 'three': return has(3) ? sum : 0;
    case 'four': return has(4) ? sum : 0;
    case 'full': return (c.includes(3) && c.includes(2)) || c.includes(5) ? 25 : 0;
    case 'small': return run(4) ? 30 : 0;
    case 'large': return run(5) ? 40 : 0;
    case 'yacht': return has(5) ? 50 : 0;
    case 'chance': return sum;
    default: return 0;
  }
}

export function totals(card) {
  const upper = CATS.filter((x) => x.upper).reduce((t, x) => t + (card[x.id] ?? 0), 0);
  const bonus = upper >= UPPER_NEEDED ? UPPER_BONUS : 0;
  const lower = CATS.filter((x) => !x.upper).reduce((t, x) => t + (card[x.id] ?? 0), 0);
  return { upper, bonus, lower, extra: card.extra || 0, total: upper + bonus + lower + (card.extra || 0) };
}

function say(s, t) {
  s.log.push(t);
  if (s.log.length > 30) s.log.shift();
}

export default {
  minPlayers: 1,
  maxPlayers: 8,
  rules: 'Roll five dice up to three times per turn, holding any between rolls, then score them in one empty box. ' +
    'Ones through Sixes count those dice; reach 63 in that section for a 35-point bonus. Three or Four of a kind and Chance count all dice; ' +
    'Full house 25, Small straight (four in a row) 30, Large straight 40, Yacht (all five the same) 50, and each extra Yacht +100. ' +
    'If nothing fits, you must score a 0 somewhere. Highest total after 13 rounds wins.',

  setup(names) {
    return {
      names, cards: names.map(() => ({})), turn: 0, round: 1, dice: [], rollsLeft: 3,
      phase: 'play', winners: null, log: [`${names[0]} goes first`],
    };
  },

  viewFor(s, seat) {
    return {
      seat, names: s.names, phase: s.phase, turn: s.turn, round: s.round,
      dice: s.dice, rollsLeft: s.rollsLeft, cards: s.cards,
      totals: s.cards.map(totals), winner: s.winners, log: s.log.slice(-4),
    };
  },

  applyMove(s, seat, move) {
    if (s.phase === 'over') return 'The game is over.';
    if (seat !== s.turn) return "It isn't your turn.";
    const name = s.names[seat];

    if (move.type === 'roll') {
      if (s.rollsLeft <= 0) return 'No rolls left — pick a box to score.';
      const hold = Array.isArray(move.hold) ? move.hold : [];
      if (!s.dice.length) s.dice = rollDice(5);
      else {
        const fresh = rollDice(5);
        s.dice = s.dice.map((d, i) => (hold[i] ? d : fresh[i]));
      }
      s.rollsLeft -= 1;
      return null;
    }

    if (move.type === 'score') {
      if (!s.dice.length) return 'Roll first.';
      const card = s.cards[seat];
      if (!CATS.some((x) => x.id === move.cat)) return 'Pick a box.';
      if (card[move.cat] != null) return 'That box is already filled.';
      const pts = scoreFor(move.cat, s.dice);
      if (scoreFor('yacht', s.dice) && card.yacht === 50) {
        card.extra = (card.extra || 0) + EXTRA_YACHT;
        say(s, `${name} rolled another Yacht! +${EXTRA_YACHT}`);
      }
      card[move.cat] = pts;
      say(s, `${name} scored ${pts} in ${CATS.find((x) => x.id === move.cat).name}`);
      // Next player
      s.dice = [];
      s.rollsLeft = 3;
      s.turn = (s.turn + 1) % s.names.length;
      if (s.turn === 0) s.round += 1;
      if (s.round > CATS.length) {
        const ts = s.cards.map((c) => totals(c).total);
        const best = Math.max(...ts);
        s.winners = ts.map((t, i) => (t === best ? i : -1)).filter((i) => i >= 0);
        s.phase = 'over';
        say(s, `${s.winners.map((i) => s.names[i]).join(' & ')} win${s.winners.length > 1 ? '' : 's'} with ${best}!`);
      }
      return null;
    }
    return 'Roll or score.';
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

    const board = el('div', 'yt-scores');
    view.names.forEach((n, i) => {
      const b = el('div', 'yt-score' + (i === view.turn ? ' active' : '') + (i === view.seat ? ' mine' : ''));
      b.append(el('span', '', n), el('strong', '', String(view.totals[i].total)));
      board.append(b);
    });
    root.append(board);

    let status;
    if (view.phase === 'over') status = view.winner.includes(view.seat) ? 'You win!' : `${view.winner.map((i) => view.names[i]).join(' & ')} win`;
    else status = myTurn
      ? (view.dice.length ? (view.rollsLeft ? `Hold dice and roll (${view.rollsLeft} left), or score` : 'Pick a box to score') : 'Your turn — roll!')
      : `${view.names[view.turn]} is rolling`;
    root.append(el('p', 'status' + (myTurn ? ' mine' : ''), status));
    if (view.phase !== 'over') root.append(el('p', 'note yt-round', `Round ${view.round} of 13`));

    // Dice
    const held = [false, false, false, false, false];
    const row = el('div', 'yt-dice');
    view.dice.forEach((d, i) => row.append(dieEl(d, {
      onClick: myTurn && view.rollsLeft > 0 ? () => {
        held[i] = !held[i];
        row.children[i].classList.toggle('held', held[i]);
      } : null,
      label: `Die showing ${d}`,
    })));
    if (!view.dice.length) row.append(el('p', 'note', 'Five dice ready to roll'));
    root.append(row);
    if (myTurn) {
      if (view.dice.length && view.rollsLeft) root.append(el('p', 'note yt-hint', 'Tap dice to hold them, then roll the rest.'));
      const roll = el('button', 'primary big', view.dice.length ? `Roll again (${view.rollsLeft} left)` : 'Roll');
      roll.disabled = view.rollsLeft <= 0;
      roll.addEventListener('click', () => send({ type: 'roll', hold: held }));
      root.append(roll);
    }

    // Scorecard: yours, with what each empty box would score right now
    const viewing = myTurn ? view.seat : (view.phase === 'over' ? view.seat : view.turn);
    const card = view.cards[viewing];
    const t = view.totals[viewing];
    const table = el('div', 'yt-card');
    table.append(el('h3', '', viewing === view.seat ? 'Your card' : `${view.names[viewing]}’s card`));
    const addRow = (c) => {
      const filled = card[c.id] != null;
      const canScore = myTurn && view.dice.length && !filled;
      const r = el(canScore ? 'button' : 'div', 'yt-row' + (filled ? ' filled' : '') + (canScore ? ' can' : ''));
      const left = el('span', 'yt-name', c.name);
      if (c.hint && !filled) left.append(el('small', '', ` ${c.hint}`));
      const val = filled ? String(card[c.id]) : canScore ? String(scoreFor(c.id, view.dice)) : '';
      r.append(left, el('span', 'yt-val', val));
      if (canScore) {
        r.type = 'button';
        r.addEventListener('click', () => {
          const pts = scoreFor(c.id, view.dice);
          if (pts === 0 && !confirm(`Score 0 in ${c.name}?`)) return;
          send({ type: 'score', cat: c.id });
        });
      }
      table.append(r);
    };
    CATS.filter((c) => c.upper).forEach(addRow);
    table.append(el('p', 'yt-sub', `Upper: ${t.upper} / 63${t.bonus ? ' · bonus +35' : ''}`));
    CATS.filter((c) => !c.upper).forEach(addRow);
    if (t.extra) table.append(el('p', 'yt-sub', `Extra Yachts: +${t.extra}`));
    table.append(el('p', 'yt-total', `Total: ${t.total}`));
    root.append(table);

    const log = el('ul', 'log');
    view.log.forEach((l) => log.append(el('li', '', l)));
    root.append(log);
  },

  styles: DICE_STYLES + `
.yt-scores { display: grid; grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr)); gap: 0.4rem; margin-top: 0.5rem; }
.yt-score { display: grid; justify-items: center; border: 1.5px solid var(--felt-line); border-radius: 10px; padding: 0.35rem; text-align: center; }
.yt-score.active { border-color: var(--brass); }
.yt-score.mine span { color: var(--brass); }
.yt-score span { font-size: 0.8rem; color: var(--muted); }
.yt-score strong { font-family: var(--serif); font-size: 1.25rem; }
.yt-round { text-align: center; margin-top: -0.4rem; }
.yt-dice { display: flex; gap: 0.55rem; justify-content: center; margin: 0.9rem 0 0.4rem; min-height: 3.6rem; align-items: center; }
.yt-hint { text-align: center; }
.yt-card { background: rgba(0, 0, 0, 0.15); border-radius: 12px; padding: 0.4rem 0.8rem 0.7rem; margin-top: 0.9rem; }
.yt-card h3 { font-family: var(--serif); font-weight: 400; margin: 0.4rem 0; }
.yt-row { display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 0.45rem 0.4rem; border: none; border-bottom: 1px solid var(--felt-line); background: none; color: var(--chalk); text-align: left; min-height: 0; border-radius: 0; }
.yt-row small { color: var(--muted); font-size: 0.75rem; }
.yt-row.filled .yt-val { color: var(--chalk); font-weight: 700; }
.yt-row.can { cursor: pointer; }
.yt-row.can .yt-val { color: var(--brass); font-weight: 700; }
.yt-row.can:hover { background: rgba(212, 173, 58, 0.12); }
.yt-sub { color: var(--muted); font-size: 0.85rem; margin: 0.4rem 0; }
.yt-total { font-family: var(--serif); font-size: 1.2rem; margin: 0.6rem 0 0; }
`,
};
