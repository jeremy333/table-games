// Farkle — 2 to 8 players. Roll six dice, set aside scoring dice, then bank your
// points or roll the rest. Roll nothing that scores and you "farkle", losing the
// turn's points. Score all six and you roll all six again. First to the target,
// then everyone else gets one last turn; highest score wins.
import { rollDice, dieEl, DICE_STYLES } from '../js/dice.js';

// Score a set of dice where every die must count. Returns 0 if any die doesn't score.
export function scoreDice(dice) {
  if (!dice.length) return 0;
  const c = [0, 0, 0, 0, 0, 0, 0];
  dice.forEach((d) => { c[d] += 1; });
  let best = 0;
  if (dice.length === 6) {
    const counts = c.slice(1).filter((n) => n > 0).sort((a, b) => a - b).join(',');
    if (counts === '1,1,1,1,1,1') best = 1500;          // 1-2-3-4-5-6
    else if (counts === '2,2,2') best = 1500;           // three pairs
    else if (counts === '2,4') best = 1500;             // four of a kind + a pair
    else if (counts === '3,3') best = 2500;             // two triplets
  }
  let total = 0;
  for (let f = 1; f <= 6; f++) {
    const n = c[f];
    if (n >= 6) total += 3000;
    else if (n === 5) total += 2000;
    else if (n === 4) total += 1000;
    else if (n === 3) total += f === 1 ? 300 : f * 100;
    else if (f === 1) total += n * 100;
    else if (f === 5) total += n * 50;
    else if (n > 0) { total = -1; break; } // a 2, 3, 4 or 6 that doesn't score
  }
  return Math.max(best, total > 0 ? total : 0);
}

// Does this roll contain anything that scores?
export function hasScore(dice) {
  const c = [0, 0, 0, 0, 0, 0, 0];
  dice.forEach((d) => { c[d] += 1; });
  if (c[1] || c[5] || c.some((n) => n >= 3)) return true;
  return dice.length === 6 && scoreDice(dice) > 0;
}

function say(s, t) {
  s.log.push(t);
  if (s.log.length > 30) s.log.shift();
}

function nextPlayer(s) {
  s.turn = (s.turn + 1) % s.names.length;
  s.dice = [];
  s.turnPoints = 0;
  s.diceLeft = 6;
  if (s.finalFrom != null && s.turn === s.finalFrom) {
    const best = Math.max(...s.scores);
    s.winners = s.scores.map((x, i) => (x === best ? i : -1)).filter((i) => i >= 0);
    s.phase = 'over';
    say(s, `${s.winners.map((i) => s.names[i]).join(' & ')} win${s.winners.length > 1 ? '' : 's'} with ${best}!`);
  }
}

function pick(s, keep) {
  const idx = [...new Set(Array.isArray(keep) ? keep : [])].filter((i) => Number.isInteger(i) && i >= 0 && i < s.dice.length);
  return { idx, dice: idx.map((i) => s.dice[i]) };
}

export default {
  minPlayers: 2,
  maxPlayers: 8,
  options: [
    { id: 'target', label: 'Play to', type: 'select', default: '10000', choices: [['5000', '5,000'], ['10000', '10,000']] },
    { id: 'entry', label: 'Points needed to get on the board', type: 'select', default: '500', choices: [['500', '500 in one turn'], ['0', 'None']] },
  ],
  rules(o) {
    const entry = Number(o?.entry ?? 500);
    return 'Roll six dice and set aside at least one scoring die each roll: 1 = 100, 5 = 50, three of a kind = 100 × the number (three 1s = 300), ' +
      'four of a kind 1000, five 2000, six 3000, a 1–6 straight or three pairs 1500, two triplets 2500. Then bank or roll the rest. ' +
      'No scoring dice = Farkle, and you lose the turn’s points. Score all six and roll them all again. ' +
      (entry ? `You need ${entry} in one turn to get on the board. ` : '') +
      `First to ${Number(o?.target || 10000).toLocaleString()}, then everyone else gets one last turn.`;
  },

  setup(names, options = {}) {
    return {
      names,
      opts: { target: Number(options.target) === 5000 ? 5000 : 10000, entry: Number(options.entry) === 0 ? 0 : 500 },
      scores: names.map(() => 0),
      turn: 0, dice: [], turnPoints: 0, diceLeft: 6,
      phase: 'play', finalFrom: null, winners: null, lastFarkle: null,
      log: [`${names[0]} goes first`],
    };
  },

  viewFor(s, seat) {
    return {
      seat, names: s.names, phase: s.phase, turn: s.turn, opts: s.opts,
      scores: s.scores, dice: s.dice, turnPoints: s.turnPoints, diceLeft: s.diceLeft,
      finalRound: s.finalFrom != null, lastFarkle: s.lastFarkle,
      winner: s.winners, log: s.log.slice(-5),
    };
  },

  applyMove(s, seat, move) {
    if (s.phase === 'over') return 'The game is over.';
    if (seat !== s.turn) return "It isn't your turn.";
    const name = s.names[seat];
    if (move.type !== 'roll' && move.type !== 'bank') return 'Roll or bank.';

    // Set aside the chosen dice (required after every roll).
    let gained = 0;
    if (s.dice.length) {
      const { idx, dice } = pick(s, move.keep);
      if (!idx.length) return 'Set aside at least one scoring die.';
      gained = scoreDice(dice);
      if (!gained) return 'Every die you set aside must score.';
      s.diceLeft = s.dice.length - idx.length;
    } else if (move.type === 'bank') {
      return 'Roll first.';
    }

    if (move.type === 'bank') {
      const total = s.turnPoints + gained;
      if (s.scores[seat] === 0 && total < s.opts.entry) return `You need ${s.opts.entry} in one turn to get on the board.`;
      s.scores[seat] += total;
      say(s, `${name} banked ${total}`);
      s.lastFarkle = null;
      if (s.finalFrom == null && s.scores[seat] >= s.opts.target) {
        s.finalFrom = seat;
        say(s, `${name} reached ${s.opts.target.toLocaleString()}! Everyone else gets one last turn.`);
      }
      nextPlayer(s);
      return null;
    }

    // Roll
    s.turnPoints += gained;
    if (s.diceLeft === 0) {
      s.diceLeft = 6;
      if (gained) say(s, `${name} scored all six dice — hot dice!`);
    }
    s.dice = rollDice(s.diceLeft);
    if (!hasScore(s.dice)) {
      say(s, `${name} rolled ${s.dice.join(' ')} — Farkle! Lost ${s.turnPoints}`);
      s.lastFarkle = { seat, dice: s.dice, lost: s.turnPoints };
      nextPlayer(s);
    } else {
      s.lastFarkle = null;
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
    const myTurn = view.phase === 'play' && view.turn === view.seat;

    const board = el('div', 'fk-scores');
    view.names.forEach((n, i) => {
      const b = el('div', 'fk-score' + (i === view.turn ? ' active' : '') + (i === view.seat ? ' mine' : ''));
      b.append(el('span', '', n), el('strong', '', view.scores[i].toLocaleString()));
      board.append(b);
    });
    root.append(board);
    if (view.finalRound && view.phase !== 'over') root.append(el('p', 'fk-final', 'Final round — last turn for everyone else!'));

    let status;
    if (view.phase === 'over') status = view.winner.includes(view.seat) ? 'You win!' : `${view.winner.map((i) => view.names[i]).join(' & ')} win`;
    else status = myTurn ? (view.dice.length ? 'Set aside scoring dice' : 'Your turn — roll!') : `${view.names[view.turn]} is rolling`;
    root.append(el('p', 'status' + (myTurn ? ' mine' : ''), status));

    if (view.lastFarkle) {
      const who = view.lastFarkle.seat === view.seat ? 'You' : view.names[view.lastFarkle.seat];
      root.append(el('p', 'fk-farkle', `${who} farkled${view.lastFarkle.lost ? ` and lost ${view.lastFarkle.lost}` : ''}!`));
    }

    const selected = new Set();
    const turnLine = el('p', 'fk-turn');
    const rollBtn = el('button', 'primary');
    const bankBtn = el('button', '');
    const update = () => {
      const keep = [...selected].map((i) => view.dice[i]);
      const gain = keep.length ? scoreDice(keep) : 0;
      const bad = keep.length && !gain;
      turnLine.textContent = `This turn: ${(view.turnPoints + gain).toLocaleString()}` + (bad ? ' · every set-aside die must score' : '');
      const left = view.dice.length ? view.dice.length - selected.size : 6;
      const need = view.dice.length > 0;
      rollBtn.textContent = need && !gain ? 'Set aside dice to roll' : `Roll ${left === 0 ? 6 : left} dice${left === 0 ? ' (hot dice!)' : ''}`;
      rollBtn.disabled = need && !gain;
      const total = view.turnPoints + gain;
      const entryOk = view.scores[view.seat] > 0 || total >= view.opts.entry;
      bankBtn.textContent = `Bank ${total.toLocaleString()}`;
      bankBtn.disabled = !need || !gain || !entryOk;
    };

    if (view.dice.length || myTurn) {
      const row = el('div', 'fk-dice');
      view.dice.forEach((d, i) => row.append(dieEl(d, {
        onClick: myTurn ? () => {
          if (selected.has(i)) selected.delete(i); else selected.add(i);
          row.children[i].classList.toggle('selected', selected.has(i));
          update();
        } : null,
      })));
      if (!view.dice.length) row.append(el('p', 'note', `${view.diceLeft} dice ready to roll`));
      root.append(row);
    }

    if (myTurn) {
      root.append(turnLine);
      rollBtn.addEventListener('click', () => send({ type: 'roll', keep: [...selected] }));
      bankBtn.addEventListener('click', () => send({ type: 'bank', keep: [...selected] }));
      const acts = el('div', 'row');
      acts.append(rollBtn, bankBtn);
      root.append(acts);
      if (view.scores[view.seat] === 0 && view.opts.entry) root.append(el('p', 'note', `You need ${view.opts.entry} in one turn to get on the board.`));
      update();
    } else if (view.phase === 'play') {
      root.append(el('p', 'fk-turn', `${view.names[view.turn]}’s turn so far: ${view.turnPoints.toLocaleString()}`));
    }

    const log = el('ul', 'log');
    view.log.forEach((l) => log.append(el('li', '', l)));
    root.append(log);
  },

  styles: DICE_STYLES + `
.fk-scores { display: grid; grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr)); gap: 0.4rem; margin-top: 0.5rem; }
.fk-score { display: grid; justify-items: center; border: 1.5px solid var(--felt-line); border-radius: 10px; padding: 0.35rem; text-align: center; }
.fk-score.active { border-color: var(--brass); }
.fk-score.mine span { color: var(--brass); }
.fk-score span { font-size: 0.8rem; color: var(--muted); }
.fk-score strong { font-family: var(--serif); font-size: 1.25rem; }
.fk-final { text-align: center; color: var(--brass); font-weight: 600; }
.fk-farkle { text-align: center; background: rgba(196, 38, 46, 0.2); border-radius: 10px; padding: 0.4rem; }
.fk-dice { display: flex; flex-wrap: wrap; gap: 0.55rem; justify-content: center; margin: 1rem 0 0.6rem; min-height: 3.6rem; align-items: center; }
.fk-turn { text-align: center; font-size: 1.1rem; }
`,
};
