// Homestead — an original deck-building game in the same style as Dominion.
// Everyone starts with a small deck, buys better cards from a shared supply,
// and the most victory points when the game ends wins.
//
// To add a card: add an entry to KINGDOM with an `effect` (and a `choice`
// handler if it asks the player to pick something). Every game uses all
// kingdom cards listed here, so keep it to 10 or add a random picker.

// ---------- Card list ----------
const BASE = {
  copper:    { name: 'Copper',    cost: 0, type: 'treasure', coins: 1 },
  silver:    { name: 'Silver',    cost: 3, type: 'treasure', coins: 2 },
  gold:      { name: 'Gold',      cost: 6, type: 'treasure', coins: 3 },
  acre:      { name: 'Acre',      cost: 2, type: 'victory',  vp: 1 },
  farmstead: { name: 'Farmstead', cost: 5, type: 'victory',  vp: 3 },
  manor:     { name: 'Manor',     cost: 8, type: 'victory',  vp: 6 },
  weeds:     { name: 'Weeds',     cost: 0, type: 'curse',    vp: -1 },
};

const KINGDOM = {
  burnpile:  { name: 'Burn Pile',     cost: 2, text: 'Trash up to 4 cards from your hand.',
    effect: (s, p) => ask(s, p, { kind: 'select', why: 'burnpile', min: 0, max: 4, prompt: 'Trash up to 4 cards' }) },
  sorting:   { name: 'Sorting Table', cost: 2, text: '+1 Action. Discard any number of cards, then draw that many.',
    effect: (s, p) => { s.actions += 1; ask(s, p, { kind: 'select', why: 'sorting', min: 0, max: 99, prompt: 'Discard any cards to redraw' }); } },
  barn:      { name: 'Barn Raising',  cost: 3, text: '+1 Card, +2 Actions.',
    effect: (s, p) => { draw(s, p, 1); s.actions += 2; } },
  toolshed:  { name: 'Toolshed',      cost: 4, text: '+3 Cards.',
    effect: (s, p) => draw(s, p, 3) },
  sawmill:   { name: 'Sawmill',       cost: 4, text: 'Gain a card costing up to 4.',
    effect: (s, p) => ask(s, p, { kind: 'gain', why: 'sawmill', max: 4, prompt: 'Gain a card costing up to 4' }) },
  renovate:  { name: 'Renovate',      cost: 4, text: 'Trash a card from your hand. Gain a card costing up to 2 more than it.',
    effect: (s, p) => ask(s, p, { kind: 'select', why: 'renovate', min: 1, max: 1, prompt: 'Trash a card to renovate' }) },
  feedstore: { name: 'Feed Store',    cost: 5, text: '+1 Card, +1 Action, +1 Buy, +1 coin.',
    effect: (s, p) => { draw(s, p, 1); s.actions += 1; s.buys += 1; s.coins += 1; } },
  granary:   { name: 'Granary',       cost: 5, text: '+2 Cards, +1 Action.',
    effect: (s, p) => { draw(s, p, 2); s.actions += 1; } },
  fair:      { name: 'Harvest Fair',  cost: 5, text: '+2 Actions, +1 Buy, +2 coins.',
    effect: (s, p) => { s.actions += 2; s.buys += 1; s.coins += 2; } },
  blight:    { name: 'Blight',        cost: 5, text: '+2 Cards. Each other player gains a Weeds.',
    effect: (s, p) => {
      draw(s, p, 2);
      for (let k = 1; k < s.names.length; k++) {
        const o = (p + k) % s.names.length;
        if (s.supply.weeds > 0) { s.supply.weeds--; s.players[o].discard.push('weeds'); }
      }
      say(s, `Weeds spread to the other players`);
    } },
};
for (const c of Object.values(KINGDOM)) c.type = 'action';

const CARDS = { ...BASE, ...KINGDOM };
const SUPPLY_ORDER = ['copper', 'silver', 'gold', 'acre', 'farmstead', 'manor', 'weeds',
  ...Object.keys(KINGDOM).sort((a, b) => KINGDOM[a].cost - KINGDOM[b].cost)];

// ---------- helpers ----------
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

function say(s, text) {
  s.log.push(text);
  if (s.log.length > 30) s.log.shift();
}

function draw(s, p, n) {
  const pl = s.players[p];
  for (let i = 0; i < n; i++) {
    if (pl.deck.length === 0) {
      if (pl.discard.length === 0) return;
      pl.deck = shuffle(pl.discard);
      pl.discard = [];
    }
    pl.hand.push(pl.deck.pop());
  }
}

function ask(s, p, choice) {
  if (choice.kind === 'select' && s.players[p].hand.length === 0) return; // nothing to pick
  if (choice.kind === 'gain' && !gainable(s, choice.max).length) return;
  s.pending = choice;
}

function gainable(s, max) {
  return SUPPLY_ORDER.filter((id) => s.supply[id] > 0 && CARDS[id].cost <= max);
}

function gain(s, p, id) {
  s.supply[id]--;
  s.players[p].discard.push(id);
}

function vpOf(pl) {
  return [...pl.deck, ...pl.hand, ...pl.discard, ...pl.inPlay]
    .reduce((sum, id) => sum + (CARDS[id].vp || 0), 0);
}

function gameOver(s) {
  const empty = SUPPLY_ORDER.filter((id) => s.supply[id] === 0).length;
  return s.supply.manor === 0 || empty >= 3;
}

function cleanup(s) {
  const pl = s.players[s.turn];
  pl.discard.push(...pl.hand, ...pl.inPlay);
  pl.hand = [];
  pl.inPlay = [];
  draw(s, s.turn, 5);
  if (gameOver(s)) {
    s.final = s.players.map(vpOf);
    const best = Math.max(...s.final);
    s.winner = s.final.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0);
    say(s, `Game over`);
    return;
  }
  s.turn = (s.turn + 1) % s.names.length;
  s.phase = 'action';
  s.actions = 1;
  s.buys = 1;
  s.coins = 0;
  s.pending = null;
}

// ---------- the game ----------
export default {
  id: 'homestead',
  name: 'Homestead',
  minPlayers: 2,
  maxPlayers: 4,
  // This game's own styles, added to the page when the game loads.
  styles: `
/* ---------- Homestead ---------- */
.counters { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
.counter { display: grid; justify-items: center; border: 1.5px solid var(--felt-line); border-radius: 12px; padding: 0.3rem; }
.counter strong { font-family: var(--serif); font-size: 1.6rem; line-height: 1.2; }
.counter span { font-size: 0.8rem; color: var(--muted); }
.in-play { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; margin: 0.7rem 0; font-size: 0.85rem; color: var(--muted); }
.chip { background: var(--paper); color: var(--ink); border-radius: 999px; padding: 0.1rem 0.6rem; }
.deck-info { font-size: 0.85rem; color: var(--muted); margin: 0.6rem 0 0.2rem; }

.tile-hand, .supply { display: grid; grid-template-columns: repeat(auto-fill, minmax(6.4rem, 1fr)); gap: 0.45rem; }
.supply-title { font-family: var(--serif); font-weight: 400; color: var(--muted); font-size: 1.1rem; margin: 1.4rem 0 0.5rem; }
.tile {
  position: relative; display: grid; align-content: start; gap: 0.2rem; text-align: left;
  background: var(--paper); color: var(--ink); border: none; border-radius: 10px;
  padding: 0.5rem 0.55rem 0.55rem; min-height: 6.2rem; font-size: 0.78rem; line-height: 1.3;
  box-shadow: inset 0 5px 0 var(--band, #888);
}
.tile.t-treasure { --band: #d4ad3a; }
.tile.t-victory { --band: #3f8f5f; }
.tile.t-action { --band: #6b7c8f; }
.tile.t-curse { --band: #7b3fa0; }
.tile-cost {
  position: absolute; top: 0.45rem; right: 0.45rem; width: 1.4rem; height: 1.4rem;
  display: grid; place-items: center; border-radius: 50%;
  background: #f3e2a6; font-weight: 700; font-size: 0.8rem;
}
.tile-name { font-family: var(--serif); font-weight: 700; font-size: 0.95rem; padding: 0.35rem 1.4rem 0 0; }
.tile-text { color: #444; }
.tile-count { color: #777; font-size: 0.72rem; }
.tile.empty { opacity: 0.45; }
button.tile:disabled { opacity: 1; }
.tile.playable { outline: 2px solid var(--brass); outline-offset: 2px; cursor: pointer; }
.tile.selected { outline: 3px solid #fff; transform: translateY(-4px); }
.chip.t-action, .chip.t-treasure { background: var(--paper); }
`,
  rules:
    'A deck-building game. Each turn: play action cards, then play treasure and buy one card. ' +
    'Bought cards go to your discard pile and get shuffled into your deck. Victory cards score but clog your hand. ' +
    'The game ends when the Manors run out or any three piles are empty. Most points wins.',

  setup(names) {
    const n = names.length;
    const vpPile = n === 2 ? 8 : 12;
    const supply = {
      copper: 60 - 7 * n, silver: 40, gold: 30,
      acre: vpPile, farmstead: vpPile, manor: vpPile,
      weeds: 10 * (n - 1),
    };
    for (const id of Object.keys(KINGDOM)) supply[id] = 10;
    const s = {
      names,
      supply,
      players: names.map(() => ({
        deck: shuffle([...Array(7).fill('copper'), ...Array(3).fill('acre')]),
        hand: [], discard: [], inPlay: [], turns: 0,
      })),
      turn: 0, phase: 'action', actions: 1, buys: 1, coins: 0,
      pending: null, winner: null, final: null, log: [],
    };
    names.forEach((_, p) => draw(s, p, 5));
    say(s, `${names[0]} goes first`);
    return s;
  },

  viewFor(s, seat) {
    const pl = s.players[seat];
    return {
      seat,
      names: s.names,
      turn: s.turn,
      phase: s.phase,
      actions: s.actions,
      buys: s.buys,
      coins: s.coins,
      hand: pl.hand.slice(),
      deckCount: pl.deck.length,
      discardCount: pl.discard.length,
      inPlay: s.players[s.turn].inPlay.slice(),
      others: s.players.map((p, i) => ({ name: s.names[i], hand: p.hand.length, total: p.deck.length + p.hand.length + p.discard.length + p.inPlay.length })),
      supply: SUPPLY_ORDER.map((id) => ({ id, count: s.supply[id] })),
      cards: Object.fromEntries(Object.entries(CARDS).map(([id, c]) => [id, { name: c.name, cost: c.cost, type: c.type, coins: c.coins, vp: c.vp, text: c.text }])),
      pending: s.turn === seat ? s.pending : null,
      waitingOn: s.pending ? s.names[s.turn] : null,
      final: s.final,
      winner: s.winner,
      log: s.log.slice(-5),
    };
  },

  applyMove(s, seat, move) {
    if (s.winner) return 'The game is over.';
    if (seat !== s.turn) return "It isn't your turn.";
    const pl = s.players[seat];
    const name = s.names[seat];

    if (s.pending) {
      const ch = s.pending;
      if (ch.kind === 'select' && move.type === 'select') {
        const idx = [...new Set(Array.isArray(move.indices) ? move.indices : [])]
          .filter((i) => Number.isInteger(i) && i >= 0 && i < pl.hand.length);
        if (idx.length < ch.min || idx.length > ch.max) return ch.min === ch.max ? `Choose ${ch.min} card.` : `Choose up to ${ch.max} cards.`;
        const chosen = idx.map((i) => pl.hand[i]);
        pl.hand = pl.hand.filter((_, i) => !idx.includes(i));
        s.pending = null;
        if (ch.why === 'burnpile') {
          say(s, chosen.length ? `${name} trashed ${chosen.map((id) => CARDS[id].name).join(', ')}` : `${name} trashed nothing`);
        } else if (ch.why === 'sorting') {
          pl.discard.push(...chosen);
          draw(s, seat, chosen.length);
          say(s, `${name} sorted ${chosen.length} card${chosen.length === 1 ? '' : 's'}`);
        } else if (ch.why === 'renovate') {
          say(s, `${name} trashed ${CARDS[chosen[0]].name}`);
          ask(s, seat, { kind: 'gain', why: 'renovate', max: CARDS[chosen[0]].cost + 2, prompt: `Gain a card costing up to ${CARDS[chosen[0]].cost + 2}` });
        }
        return null;
      }
      if (ch.kind === 'gain' && move.type === 'gain') {
        if (!gainable(s, ch.max).includes(move.id)) return `Pick a card costing up to ${ch.max}.`;
        gain(s, seat, move.id);
        s.pending = null;
        say(s, `${name} gained ${CARDS[move.id].name}`);
        return null;
      }
      return 'Finish your choice first.';
    }

    if (move.type === 'play') {
      const id = pl.hand[move.index];
      if (!id) return "That card isn't in your hand.";
      const card = CARDS[id];
      if (card.type === 'action') {
        if (s.phase !== 'action') return 'You can’t play actions after you start buying.';
        if (s.actions < 1) return 'No actions left.';
        s.actions--;
        pl.hand.splice(move.index, 1);
        pl.inPlay.push(id);
        say(s, `${name} played ${card.name}`);
        card.effect(s, seat);
        return null;
      }
      if (card.type === 'treasure') {
        s.phase = 'buy';
        pl.hand.splice(move.index, 1);
        pl.inPlay.push(id);
        s.coins += card.coins;
        return null;
      }
      return 'That card can’t be played.';
    }

    if (move.type === 'treasures') {
      s.phase = 'buy';
      const keep = [];
      for (const id of pl.hand) {
        if (CARDS[id].type === 'treasure') { pl.inPlay.push(id); s.coins += CARDS[id].coins; }
        else keep.push(id);
      }
      pl.hand = keep;
      return null;
    }

    if (move.type === 'buy') {
      const card = CARDS[move.id];
      if (!card || !(move.id in s.supply)) return 'Unknown card.';
      if (s.buys < 1) return 'No buys left.';
      if (s.supply[move.id] < 1) return 'That pile is empty.';
      if (s.coins < card.cost) return 'Not enough coins.';
      s.phase = 'buy';
      s.coins -= card.cost;
      s.buys--;
      gain(s, seat, move.id);
      say(s, `${name} bought ${card.name}`);
      return null;
    }

    if (move.type === 'end') {
      say(s, `${name} ended their turn`);
      cleanup(s);
      return null;
    }

    return 'Unknown move.';
  },

  render(view, root, send) {
    root.replaceChildren();
    const myTurn = view.turn === view.seat && !view.winner;
    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };
    const C = view.cards;

    // Status
    let status;
    if (view.winner) {
      status = view.winner.includes(view.seat) ? (view.winner.length > 1 ? 'You tied for the win!' : 'You win!')
        : `${view.winner.map((i) => view.names[i]).join(' & ')} win${view.winner.length > 1 ? '' : 's'}`;
    } else if (myTurn) {
      status = view.pending ? view.pending.prompt : view.phase === 'action' ? 'Your turn — play actions or start buying' : 'Buy a card or end your turn';
    } else {
      status = `${view.names[view.turn]} is playing`;
    }
    root.append(el('p', 'status' + (myTurn ? ' mine' : ''), status));

    if (view.final) {
      const box = el('div', 'summary');
      view.names.forEach((n, i) => box.append(el('p', '', `${n}: ${view.final[i]} points`)));
      root.append(box);
    }

    // Turn counters
    if (!view.winner) {
      const counters = el('div', 'counters');
      [['Actions', view.actions], ['Buys', view.buys], ['Coins', view.coins]].forEach(([k, v]) => {
        const c = el('div', 'counter');
        c.append(el('strong', '', String(v)), el('span', '', k));
        counters.append(c);
      });
      root.append(counters);
    }

    // Cards in play this turn
    if (view.inPlay.length) {
      const strip = el('div', 'in-play');
      strip.append(el('span', '', `${view.turn === view.seat ? 'You' : view.names[view.turn]} played:`));
      view.inPlay.forEach((id) => strip.append(el('span', `chip t-${C[id].type}`, C[id].name)));
      root.append(strip);
    }

    // Choices that select cards from your hand
    const selecting = myTurn && view.pending && view.pending.kind === 'select';
    const selected = new Set();
    let confirmBtn = null;

    // Your hand
    const hand = el('div', 'tile-hand');
    view.hand.forEach((id, i) => {
      const card = C[id];
      const canPlay = myTurn && !view.pending &&
        ((card.type === 'action' && view.phase === 'action' && view.actions > 0) || card.type === 'treasure');
      const t = tileEl(card, { interactive: selecting || canPlay });
      if (selecting || canPlay) {
        t.addEventListener('click', () => {
          if (selecting) {
            if (selected.has(i)) selected.delete(i);
            else if (selected.size < view.pending.max) selected.add(i);
            t.classList.toggle('selected', selected.has(i));
            confirmBtn.disabled = selected.size < view.pending.min;
          } else {
            send({ type: 'play', index: i });
          }
        });
      }
      hand.append(t);
    });

    const actions = el('div', 'actions');
    if (selecting) {
      confirmBtn = el('button', 'primary', 'Done');
      confirmBtn.disabled = view.pending.min > 0;
      confirmBtn.addEventListener('click', () => send({ type: 'select', indices: [...selected] }));
      actions.append(confirmBtn);
    } else if (myTurn && !view.pending) {
      const hasTreasure = view.hand.some((id) => C[id].type === 'treasure');
      const tBtn = el('button', '', 'Play all treasure');
      tBtn.disabled = !hasTreasure;
      tBtn.addEventListener('click', () => send({ type: 'treasures' }));
      const endBtn = el('button', 'primary', 'End turn');
      endBtn.addEventListener('click', () => send({ type: 'end' }));
      actions.append(tBtn, endBtn);
    }
    root.append(actions);
    root.append(el('p', 'deck-info', `Your hand · deck ${view.deckCount} · discard ${view.discardCount}`));
    root.append(hand);

    // Supply
    const gaining = myTurn && view.pending && view.pending.kind === 'gain';
    const supply = el('div', 'supply');
    view.supply.forEach(({ id, count }) => {
      const card = C[id];
      const canBuy = myTurn && !view.pending && view.buys > 0 && count > 0 && view.coins >= card.cost;
      const canGain = gaining && count > 0 && card.cost <= view.pending.max;
      const t = tileEl(card, { interactive: canBuy || canGain, count });
      if (canBuy || canGain) {
        t.addEventListener('click', () => send(canGain ? { type: 'gain', id } : { type: 'buy', id }));
      }
      supply.append(t);
    });
    root.append(el('h3', 'supply-title', gaining ? view.pending.prompt : 'Supply'));
    root.append(supply);

    // Other players
    const others = el('p', 'deck-info');
    others.textContent = view.others
      .filter((_, i) => i !== view.seat)
      .map((o) => `${o.name}: ${o.total} cards`).join(' · ');
    root.append(others);

    const log = el('ul', 'log');
    view.log.forEach((line) => log.append(el('li', '', line)));
    root.append(log);
  },
};

function tileEl(card, { interactive, count } = {}) {
  const t = document.createElement(interactive ? 'button' : 'div');
  if (interactive) t.type = 'button';
  t.className = `tile t-${card.type}` + (interactive ? ' playable' : '') + (count === 0 ? ' empty' : '');
  const detail = card.text || (card.coins ? `+${card.coins} coin${card.coins > 1 ? 's' : ''}` : `${card.vp > 0 ? '+' : ''}${card.vp} point${Math.abs(card.vp) === 1 ? '' : 's'}`);
  t.innerHTML = `<span class="tile-cost">${card.cost}</span><span class="tile-name"></span><span class="tile-text"></span>` +
    (count != null ? `<span class="tile-count">${count} left</span>` : '');
  t.querySelector('.tile-name').textContent = card.name;
  t.querySelector('.tile-text').textContent = detail;
  return t;
}
