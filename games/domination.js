// Domination — a deck-building game. Its cards match, one for one, the 26 kingdom
// cards and 7 basic cards of the classic base game, under synonym names and with
// card text written fresh. Card art and names from the original are not used.
//
// Each card's `play` is a generator: it `yield`s a question for a player (choose
// cards from hand, a pile from the supply, cards from a list, or yes/no) and
// receives their answer, so multi-step cards and attacks read top to bottom.

// ---------- cards ----------
// types: treasure, victory, curse, action, attack, reaction
const CARDS = {
  // Basic supply
  penny:    { name: 'Penny',    cost: 0, types: ['treasure'], coins: 1, text: '+1 coin.' },
  sterling: { name: 'Sterling', cost: 3, types: ['treasure'], coins: 2, text: '+2 coins.' },
  bullion:  { name: 'Bullion',  cost: 6, types: ['treasure'], coins: 3, text: '+3 coins.' },
  property: { name: 'Property', cost: 2, types: ['victory'], vp: 1, text: '1 point.' },
  dukedom:  { name: 'Dukedom',  cost: 5, types: ['victory'], vp: 3, text: '3 points.' },
  territory:{ name: 'Territory',cost: 8, types: ['victory'], vp: 6, text: '6 points.' },
  hex:      { name: 'Hex',      cost: 0, types: ['curse'], vp: -1, text: 'Minus 1 point.' },

  // Kingdom ($2)
  basement: { name: 'Basement', cost: 2, types: ['action'],
    text: '+1 Action. Discard as many cards as you like, then draw the same number.',
    *play(s, p) {
      s.actions += 1;
      const pick = yield ask(s, p, { kind: 'hand', text: 'Discard any cards to draw that many', min: 0, max: 99 });
      const out = takeFromHand(s, p, pick);
      me(s, p).discard.push(...out);
      draw(s, p, out.length);
      say(s, `${nm(s, p)} discarded and drew ${out.length}`);
    } },
  shrine: { name: 'Shrine', cost: 2, types: ['action'],
    text: 'Trash up to 4 cards from your hand.',
    *play(s, p) {
      const pick = yield ask(s, p, { kind: 'hand', text: 'Trash up to 4 cards', min: 0, max: 4 });
      const out = takeFromHand(s, p, pick);
      s.trash.push(...out);
      say(s, out.length ? `${nm(s, p)} trashed ${names(out)}` : `${nm(s, p)} trashed nothing`);
    } },
  trench: { name: 'Trench', cost: 2, types: ['action', 'reaction'],
    text: '+2 Cards. When another player plays an attack, if this is in your hand, the attack doesn’t affect you.',
    *play(s, p) { draw(s, p, 2); } },

  // Kingdom ($3)
  herald: { name: 'Herald', cost: 3, types: ['action'],
    text: '+1 Card, +1 Action. You may move a card from your discard pile to the top of your deck.',
    *play(s, p) {
      draw(s, p, 1);
      s.actions += 1;
      const pile = me(s, p).discard;
      if (!pile.length) return;
      const pick = yield ask(s, p, { kind: 'list', cards: pile.slice(), text: 'Put a card from your discard pile on top of your deck?', min: 0, max: 1 });
      if (pick.length) {
        const [c] = pile.splice(pick[0], 1);
        me(s, p).deck.push(c);
      }
    } },
  trader: { name: 'Trader', cost: 3, types: ['action'],
    text: '+1 Card, +1 Action. The first time you play a Sterling this turn, +1 coin.',
    *play(s, p) { draw(s, p, 1); s.actions += 1; s.traders += 1; } },
  liegeman: { name: 'Liegeman', cost: 3, types: ['action'],
    text: '+2 coins. Discard your top card. If it’s an Action, you may play it.',
    *play(s, p) {
      s.coins += 2;
      const [top] = takeTop(s, p, 1);
      if (!top) return;
      me(s, p).discard.push(top);
      say(s, `${nm(s, p)} discarded ${CARDS[top].name}`);
      if (!isType(top, 'action')) return;
      const yes = yield ask(s, p, { kind: 'yesno', text: `Play the ${CARDS[top].name} you discarded?`, yes: 'Play it', no: 'No thanks' });
      if (yes) {
        const pile = me(s, p).discard;
        pile.splice(pile.lastIndexOf(top), 1);
        me(s, p).inPlay.push(top);
        say(s, `${nm(s, p)} played ${CARDS[top].name}`);
        yield* CARDS[top].play(s, p);
      }
    } },
  township: { name: 'Township', cost: 3, types: ['action'],
    text: '+1 Card, +2 Actions.',
    *play(s, p) { draw(s, p, 1); s.actions += 2; } },
  workroom: { name: 'Workroom', cost: 3, types: ['action'],
    text: 'Gain a card costing up to 4.',
    *play(s, p) {
      const id = yield ask(s, p, { kind: 'supply', text: 'Gain a card costing up to 4', maxCost: 4 });
      if (id) gainCard(s, p, id, 'discard');
    } },

  // Kingdom ($4)
  official: { name: 'Official', cost: 4, types: ['action', 'attack'],
    text: 'Gain a Sterling onto your deck. Every other player puts a Victory card from their hand onto their deck (or shows they have none).',
    *play(s, p) {
      let where = 'deck';
      if (optionalDrawbacks(s) && s.supply.sterling > 0) {
        const top = yield ask(s, p, { kind: 'yesno', text: 'Gain a Sterling. Put it on top of your deck?', yes: 'On my deck', no: 'In my discard pile' });
        if (!top) where = 'discard';
      }
      gainCard(s, p, 'sterling', where);
      const hasVictory = (o) => me(s, o).hand.some((c) => isType(c, 'victory'));
      for (const o of yield* targets(s, p, 'official', 'put a Victory card from your hand on top of your deck', hasVictory)) {
        const vic = indicesWhere(me(s, o).hand, (c) => isType(c, 'victory'));
        if (!vic.length) { say(s, `${nm(s, o)} has no Victory cards`); continue; }
        const pick = yield ask(s, o, { kind: 'hand', text: 'Put a Victory card from your hand on top of your deck', min: 1, max: 1, allowed: vic });
        const [c] = takeFromHand(s, o, pick);
        me(s, o).deck.push(c);
        say(s, `${nm(s, o)} put ${CARDS[c].name} on their deck`);
      }
    } },
  orchards: { name: 'Orchards', cost: 4, types: ['victory'], vp: 0,
    text: 'Worth 1 point for every 10 cards you own (rounded down).' },
  yeomanry: { name: 'Yeomanry', cost: 4, types: ['action', 'attack'],
    text: '+2 coins. Every other player discards down to 3 cards in hand.',
    *play(s, p) {
      s.coins += 2;
      for (const o of yield* targets(s, p, 'yeomanry', 'discard down to 3 cards', (o) => me(s, o).hand.length > 3)) {
        const extra = me(s, o).hand.length - 3;
        if (extra <= 0) continue;
        const pick = yield ask(s, o, { kind: 'hand', text: `Discard ${extra} card${extra > 1 ? 's' : ''} (down to 3)`, min: extra, max: extra });
        me(s, o).discard.push(...takeFromHand(s, o, pick));
        say(s, `${nm(s, o)} discarded down to 3`);
      }
    } },
  usurer: { name: 'Usurer', cost: 4, types: ['action'],
    text: 'You may trash a Penny from your hand for +3 coins.',
    *play(s, p) {
      const pennies = indicesWhere(me(s, p).hand, (c) => c === 'penny');
      if (!pennies.length) return;
      const pick = yield ask(s, p, { kind: 'hand', text: 'Trash a Penny for +3 coins?', min: 0, max: 1, allowed: pennies });
      if (pick.length) {
        s.trash.push(...takeFromHand(s, p, pick));
        s.coins += 3;
        say(s, `${nm(s, p)} trashed a Penny for +3 coins`);
      }
    } },
  trespasser: { name: 'Trespasser', cost: 4, types: ['action'],
    text: '+1 Card, +1 Action, +1 coin. Discard a card for each empty supply pile.',
    *play(s, p) {
      draw(s, p, 1);
      s.actions += 1;
      s.coins += 1;
      const empty = Object.values(s.supply).filter((n) => n === 0).length;
      const k = Math.min(empty, me(s, p).hand.length);
      if (!k) return;
      const opt = optionalDrawbacks(s);
      const pick = yield ask(s, p, {
        kind: 'hand', min: opt ? 0 : k, max: k,
        text: opt ? `Discard up to ${k} card${k > 1 ? 's' : ''} (one per empty pile — optional at this table)` : `Discard ${k} card${k > 1 ? 's' : ''} (one per empty pile)`,
      });
      me(s, p).discard.push(...takeFromHand(s, p, pick));
    } },
  renovate: { name: 'Renovate', cost: 4, types: ['action'],
    text: 'Trash a card from your hand. Gain a card costing up to 2 more than it.',
    *play(s, p) {
      const pick = yield ask(s, p, { kind: 'hand', text: optionalDrawbacks(s) ? 'Trash a card to renovate? (optional)' : 'Trash a card to renovate', min: optionalDrawbacks(s) ? 0 : 1, max: 1 });
      if (!pick.length) return;
      const [c] = takeFromHand(s, p, pick);
      s.trash.push(c);
      say(s, `${nm(s, p)} trashed ${CARDS[c].name}`);
      const max = CARDS[c].cost + 2;
      const id = yield ask(s, p, { kind: 'supply', text: `Gain a card costing up to ${max}`, maxCost: max });
      if (id) gainCard(s, p, id, 'discard');
    } },
  forge: { name: 'Forge', cost: 4, types: ['action'],
    text: '+3 Cards.',
    *play(s, p) { draw(s, p, 3); } },
  dais: { name: 'Dais', cost: 4, types: ['action'],
    text: 'You may play an Action card from your hand twice.',
    *play(s, p) {
      const acts = indicesWhere(me(s, p).hand, (c) => isType(c, 'action'));
      if (!acts.length) return;
      const pick = yield ask(s, p, { kind: 'hand', text: 'Choose an Action to play twice', min: 0, max: 1, allowed: acts });
      if (!pick.length) return;
      const [c] = takeFromHand(s, p, pick);
      me(s, p).inPlay.push(c);
      say(s, `${nm(s, p)} played ${CARDS[c].name} twice`);
      yield* CARDS[c].play(s, p);
      yield* CARDS[c].play(s, p);
    } },

  // Kingdom ($5)
  brigand: { name: 'Brigand', cost: 5, types: ['action', 'attack'],
    text: 'Gain a Bullion. Every other player reveals their top 2 cards, trashes a revealed treasure other than Penny, and discards the rest.',
    *play(s, p) {
      gainCard(s, p, 'bullion', 'discard');
      for (const o of yield* targets(s, p, 'brigand', 'reveal your top 2 cards and trash a treasure other than a Penny', () => true)) {
        const shown = takeTop(s, o, 2);
        if (!shown.length) continue;
        say(s, `${nm(s, o)} revealed ${names(shown)}`);
        const good = indicesWhere(shown, (c) => isType(c, 'treasure') && c !== 'penny');
        let lose = null;
        if (good.length === 1 || (good.length === 2 && shown[0] === shown[1])) lose = good[0];
        else if (good.length === 2) {
          const pick = yield ask(s, o, { kind: 'list', cards: shown.slice(), text: 'Choose a treasure to trash', min: 1, max: 1, allowed: good });
          lose = pick[0];
        }
        if (lose != null) {
          const [c] = shown.splice(lose, 1);
          s.trash.push(c);
          say(s, `${nm(s, o)} trashed ${CARDS[c].name}`);
        }
        me(s, o).discard.push(...shown);
      }
    } },
  assembly: { name: 'Assembly Hall', cost: 5, types: ['action'],
    text: '+4 Cards, +1 Buy. Every other player draws a card.',
    *play(s, p) {
      draw(s, p, 4);
      s.buys += 1;
      if (optionalDrawbacks(s)) {
        const give = yield ask(s, p, { kind: 'yesno', text: 'Let every other player draw a card?', yes: 'Yes', no: 'No (optional at this table)' });
        if (!give) return;
      }
      for (const o of othersOf(s, p)) draw(s, o, 1);
    } },
  carnival: { name: 'Carnival', cost: 5, types: ['action'],
    text: '+2 Actions, +1 Buy, +2 coins.',
    *play(s) { s.actions += 2; s.buys += 1; s.coins += 2; } },
  study: { name: 'Study', cost: 5, types: ['action'],
    text: '+2 Cards, +1 Action.',
    *play(s, p) { draw(s, p, 2); s.actions += 1; } },
  archive: { name: 'Archive', cost: 5, types: ['action'],
    text: 'Draw until you hold 7 cards. You may set aside Action cards as you draw them; discard those afterward.',
    *play(s, p) {
      const aside = [];
      while (me(s, p).hand.length < 7) {
        const [c] = takeTop(s, p, 1);
        if (!c) break;
        if (isType(c, 'action')) {
          const skip = yield ask(s, p, { kind: 'yesno', text: `You drew ${CARDS[c].name}. Set it aside?`, yes: 'Set aside', no: 'Keep it' });
          if (skip) { aside.push(c); continue; }
        }
        me(s, p).hand.push(c);
      }
      me(s, p).discard.push(...aside);
    } },
  mart: { name: 'Mart', cost: 5, types: ['action'],
    text: '+1 Card, +1 Action, +1 Buy, +1 coin.',
    *play(s, p) { draw(s, p, 1); s.actions += 1; s.buys += 1; s.coins += 1; } },
  colliery: { name: 'Colliery', cost: 5, types: ['action'],
    text: 'You may trash a treasure from your hand. Gain a treasure costing up to 3 more, into your hand.',
    *play(s, p) {
      const tr = indicesWhere(me(s, p).hand, (c) => isType(c, 'treasure'));
      if (!tr.length) return;
      const pick = yield ask(s, p, { kind: 'hand', text: 'Trash a treasure to upgrade it?', min: 0, max: 1, allowed: tr });
      if (!pick.length) return;
      const [c] = takeFromHand(s, p, pick);
      s.trash.push(c);
      const max = CARDS[c].cost + 3;
      const id = yield ask(s, p, { kind: 'supply', text: `Gain a treasure costing up to ${max} into your hand`, maxCost: max, type: 'treasure' });
      if (id) gainCard(s, p, id, 'hand');
    } },
  sentinel: { name: 'Sentinel', cost: 5, types: ['action'],
    text: '+1 Card, +1 Action. Look at your top 2 cards. Trash or discard any of them; put the rest back in any order.',
    *play(s, p) {
      draw(s, p, 1);
      s.actions += 1;
      let look = takeTop(s, p, 2);
      if (!look.length) return;
      let pick = yield ask(s, p, { kind: 'list', cards: look.slice(), text: 'Your top cards. Trash any?', min: 0, max: look.length, button: 'Trash selected' });
      s.trash.push(...pick.map((i) => look[i]));
      look = look.filter((_, i) => !pick.includes(i));
      if (look.length) {
        pick = yield ask(s, p, { kind: 'list', cards: look.slice(), text: 'Discard any?', min: 0, max: look.length, button: 'Discard selected' });
        me(s, p).discard.push(...pick.map((i) => look[i]));
        look = look.filter((_, i) => !pick.includes(i));
      }
      if (look.length === 2 && look[0] !== look[1]) {
        pick = yield ask(s, p, { kind: 'list', cards: look.slice(), text: 'Which card goes on top?', min: 1, max: 1 });
        const top = look[pick[0]];
        look = [look[1 - pick[0]], top];
      }
      me(s, p).deck.push(...look); // last one ends up on top
    } },
  crone: { name: 'Crone', cost: 5, types: ['action', 'attack'],
    text: '+2 Cards. Every other player gains a Hex.',
    *play(s, p) {
      draw(s, p, 2);
      for (const o of yield* targets(s, p, 'crone', 'gain a Hex', () => s.supply.hex > 0)) {
        if (gainCard(s, o, 'hex', 'discard')) say(s, `${nm(s, o)} gained a Hex`);
      }
    } },

  // Kingdom ($6)
  craftsman: { name: 'Craftsman', cost: 6, types: ['action'],
    text: 'Gain a card costing up to 5 into your hand. Then put a card from your hand onto your deck.',
    *play(s, p) {
      const id = yield ask(s, p, { kind: 'supply', text: 'Gain a card costing up to 5 into your hand', maxCost: 5 });
      if (id) gainCard(s, p, id, 'hand');
      const pick = yield ask(s, p, { kind: 'hand', text: optionalDrawbacks(s) ? 'Put a card from your hand onto your deck? (optional)' : 'Put a card from your hand onto your deck', min: optionalDrawbacks(s) ? 0 : 1, max: 1 });
      if (pick.length) me(s, p).deck.push(...takeFromHand(s, p, pick));
    } },
};

// Original icons for each card, drawn as simple line art (24×24).
const ICONS = {
  penny: '<circle class="a" cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="4.5"/>',
  sterling: '<circle class="a" cx="9" cy="13" r="6"/><circle class="a" cx="15" cy="11" r="6"/><circle cx="15" cy="11" r="3.2"/>',
  bullion: '<path class="a" d="M3 19h18l-2.5-5h-13z"/><path class="a" d="M7 13h10l-2-4.5H9z"/><path d="M10 6l-1-2M14 6l1-2M12 5.5V3"/>',
  property: '<path d="M3.5 11L12 4.5l8.5 6.5"/><path class="a" d="M6 10v10h12V10"/><path d="M10.5 20v-5h3v5"/>',
  dukedom: '<path d="M2.5 12L12 6l9.5 6"/><path class="a" d="M4.5 11v9h15v-9"/><path d="M12 6V2.5l3.5 1.3L12 5"/><path d="M8 14.5v2M16 14.5v2M11 20v-4h2v4"/>',
  territory: '<path class="a" d="M3.5 21V7.5h3v3h3v-3h5v3h3v-3h3V21z"/><path d="M10 21v-3.5a2 2 0 0 1 4 0V21"/><path d="M12 7.5V3l3 1.2-3 1.2"/>',
  hex: '<path class="a" d="M7 15.5a4 4 0 0 1 .3-8 5 5 0 0 1 9.5 1.2 3.4 3.4 0 0 1-.3 6.8z"/><path d="M12.5 13.5l-2 3.5h3l-2 4"/>',
  basement: '<path d="M2.5 6h5v4h4v4h4v4h6"/><path d="M18 4v7"/><path d="M15.5 8.5L18 11l2.5-2.5"/><path class="a" d="M2.5 6h5v4h4v4h4v4h6V21H2.5z"/>',
  shrine: '<path class="a" d="M9 10.5h6V20H9z"/><path d="M12 3c2.2 2.6 2.2 4.6 0 6-2.2-1.4-2.2-3.4 0-6z"/><path d="M5.5 20h13"/>',
  trench: '<path class="a" d="M12 3l7.5 3v5c0 5-3.2 8.6-7.5 10-4.3-1.4-7.5-5-7.5-10V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  herald: '<path class="a" d="M3.5 9.5v5h3.5L16 19V5L7 9.5z"/><path d="M19 9a4.2 4.2 0 0 1 0 6"/><path d="M6 14.5l1.5 5h2.5l-1-4"/>',
  trader: '<path d="M12 3.5V20M7.5 20.5h9M4.5 7h15"/><path class="a" d="M4.5 7L2 12.5h5z"/><path class="a" d="M19.5 7L17 12.5h5z"/><circle cx="12" cy="3.5" r="1"/>',
  liegeman: '<path class="a" d="M4.5 15a7.5 7.5 0 0 1 15 0v4.5h-15z"/><path d="M4.5 15h15M12 7.5V15M8.5 18h7"/>',
  township: '<path class="a" d="M1.5 20.5v-6.5l3.8-3.2 3.7 3.2v6.5z"/><path class="a" d="M8.3 20.5v-9l3.7-3.2 3.7 3.2v9z"/><path class="a" d="M15 20.5v-6.5l3.7-3.2 3.8 3.2v6.5z"/>',
  workroom: '<path class="a" d="M13.5 4l6.5 6.5-2.3 2.3-6.5-6.5z"/><path d="M13.2 9.3L4 18.5 5.5 20l9.2-9.2"/>',
  official: '<path d="M5.5 3h9l3.5 3.5V21h-12.5z"/><path d="M8.5 8h6M8.5 11h6M8.5 14h3"/><circle class="a" cx="15" cy="16.5" r="3"/><path d="M14 19.3l-.5 2.2M16 19.3l.5 2.2"/>',
  orchards: '<circle class="a" cx="12" cy="9" r="6.5"/><path d="M12 15.5v5.5M8.5 21h7"/><circle cx="9.5" cy="8" r="1"/><circle cx="14.5" cy="10.5" r="1"/><circle cx="13" cy="6" r="1"/>',
  yeomanry: '<path class="a" d="M7 3c6.5 3.5 6.5 14.5 0 18z"/><path d="M7 3v18M3.5 12h17M17.5 9l3 3-3 3M3.5 12l-1.5-2M3.5 12l-1.5 2"/>',
  usurer: '<path d="M9.5 4h5l-1.5 3h-2z"/><path class="a" d="M9 7.5C5.5 9.5 4.3 13.5 5.2 16.8 6 20 18 20 18.8 16.8c.9-3.3-.3-7.3-3.8-9.3z"/><path d="M10 16.5l4-5"/><circle cx="10" cy="11.8" r=".9"/><circle cx="14" cy="16.2" r=".9"/>',
  trespasser: '<ellipse class="a" cx="8" cy="15.5" rx="2.6" ry="4"/><ellipse class="a" cx="16" cy="8.5" rx="2.6" ry="4"/><path d="M6 10.5h.01M8.5 10.2h.01M14 3.5h.01M16.5 3.2h.01"/>',
  renovate: '<path class="a" d="M14.5 3.5a4.5 4.5 0 0 0-4.2 6.1L3.5 16.4l3.1 3.1 6.8-6.8a4.5 4.5 0 0 0 6.1-4.2l-2.8 2.8-2.6-.7-.7-2.6z"/>',
  forge: '<path class="a" d="M3.5 8h13.5c0 2 1.5 3 3.5 3v1.5h-5.5l-1 3h2V19H8v-3.5h2l-1-3c-3.2 0-5.5-2-5.5-4.5z"/><path d="M6 21h12"/>',
  dais: '<path class="a" d="M2.5 20.5h19v-4h-19z"/><path class="a" d="M5.5 16.5v-4h13v4"/><path d="M8 4.5l3 3M11 4.5l-3 3"/><path d="M13.3 4.8a1.4 1.4 0 0 1 2.6.6c0 1.1-2.8 2.3-2.8 2.3h3"/>',
  brigand: '<path class="a" d="M2.5 10c3-2.2 6.3-1.2 9.5 0 3.2-1.2 6.5-2.2 9.5 0-1 4.3-4.2 5.4-6.4 4.3-1.1-.5-2-1.5-3.1-1.5s-2 1-3.1 1.5c-2.2 1.1-5.4 0-6.4-4.3z"/><ellipse cx="7.8" cy="11" rx="1.6" ry="1"/><ellipse cx="16.2" cy="11" rx="1.6" ry="1"/>',
  assembly: '<circle cx="6.5" cy="9.5" r="2.2"/><circle cx="17.5" cy="9.5" r="2.2"/><circle class="a" cx="12" cy="7" r="2.6"/><path d="M2.5 19a4 4 0 0 1 8 0M13.5 19a4 4 0 0 1 8 0"/><path class="a" d="M7.3 18a4.7 4.7 0 0 1 9.4 0z"/>',
  carnival: '<path class="a" d="M2.5 20.5L12 6.5l9.5 14z"/><path d="M12 6.5V2.5l3.2 1.3L12 5"/><path d="M9.8 20.5l2.2-5.5 2.2 5.5M7 20.5l5-14 5 14"/>',
  study: '<path class="a" d="M12 6.5C10 5 7 4.5 3.5 5v13.5c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z"/><path d="M12 6.5V20M6 9h3.5M6 12h3.5M14.5 9H18M14.5 12H18"/>',
  archive: '<path class="a" d="M4 5.5h3V19H4z"/><path d="M8 7.5h3V19H8z"/><path class="a" d="M12 4.5h3V19h-3z"/><path d="M16.3 18.8l2.8-10.6 2.6.7-2.8 10.6z"/><path d="M2.5 19.5h19"/>',
  mart: '<path d="M3 8l2-4h14l2 4M5 10v10.5M19 10v10.5M5 15.5h14"/><path class="a" d="M3 8a2.25 2.25 0 0 0 4.5 0 2.25 2.25 0 0 0 4.5 0 2.25 2.25 0 0 0 4.5 0 2.25 2.25 0 0 0 4.5 0z"/>',
  colliery: '<path class="a" d="M3.5 9.5C7.5 4 16.5 4 20.5 9.5l-1.6 1.2C15.5 6.8 8.5 6.8 5.1 10.7z"/><path d="M12.4 6.6L11 21"/>',
  sentinel: '<path d="M9 4.5h6M10 4.5a2 2 0 0 1 4 0"/><rect class="a" x="7" y="6.5" width="10" height="12" rx="2"/><path d="M12 9.5c1.6 2.1 1.6 3.6 0 4.7-1.6-1.1-1.6-2.6 0-4.7z"/><path d="M8 20.5h8"/>',
  crone: '<path class="a" d="M5 10.5h14c0 6-3 9-7 9s-7-3-7-9z"/><path d="M3.5 10.5h17M7 19l-1 2.5M17 19l1 2.5"/><circle cx="10" cy="6.5" r="1.2"/><circle cx="14" cy="4.5" r="1.6"/>',
  craftsman: '<path class="a" d="M18.02 10.53 L20.49 10.63 L20.49 13.37 L18.02 13.47 L17.30 15.22 L18.97 17.03 L17.03 18.97 L15.22 17.30 L13.47 18.02 L13.37 20.49 L10.63 20.49 L10.53 18.02 L8.78 17.30 L6.97 18.97 L5.03 17.03 L6.70 15.22 L5.98 13.47 L3.51 13.37 L3.51 10.63 L5.98 10.53 L6.70 8.78 L5.03 6.97 L6.97 5.03 L8.78 6.70 L10.53 5.98 L10.63 3.51 L13.37 3.51 L13.47 5.98 L15.22 6.70 L17.03 5.03 L18.97 6.97 L17.30 8.78Z"/><circle cx="12" cy="12" r="2.8"/>',
};

// Quick, plain-language descriptions shown in the card guide and on press-and-hold.
const TIPS = {
  penny: 'Your starting money.',
  sterling: 'The go-to early buy.',
  bullion: 'Buy it whenever you have 6 or 7 coins.',
  property: 'You start with 3. They clog your hand.',
  dukedom: 'Good late in the game.',
  territory: 'The main prize. The game ends when these run out.',
  orchards: 'Best if you buy lots of cards.',
  hex: 'You get these when attacked by Crone.',
  basement: 'Swap junk cards in your hand for fresh ones.',
  shrine: 'Slim your deck down to your best cards.',
  trench: 'Draw 2. Holding it blocks attacks.',
  herald: 'Draw 1, keep your actions, and set up a good card for next turn.',
  trader: 'Draw 1, keep your actions; your first Sterling is worth an extra coin.',
  liegeman: '+2 coins, and a free play if your top card is an action.',
  township: 'Draw 1 and get 2 more actions to chain actions together.',
  workroom: 'Grab a free card costing up to 4.',
  official: 'Gain a Sterling; opponents put a Victory card back on their decks.',
  yeomanry: '+2 coins, and opponents discard down to 3 cards.',
  usurer: 'Trash a Penny for +3 coins this turn.',
  trespasser: 'Draw 1, keep your actions, +1 coin; discard more as piles run out.',
  renovate: 'Turn a junk card into something better.',
  forge: 'Draw 3 cards. Simple and strong.',
  dais: 'Play another action from your hand twice.',
  brigand: 'Gain a Bullion; opponents may lose a Sterling or Bullion.',
  assembly: 'Draw 4 and an extra buy, but everyone else draws 1.',
  carnival: '2 more actions, an extra buy, and +2 coins.',
  study: 'Draw 2 and keep your actions.',
  archive: 'Draw until you hold 7 cards, skipping actions you don’t want.',
  mart: 'Draw 1, keep your actions, an extra buy, and +1 coin.',
  colliery: 'Upgrade a treasure in your hand for use this turn.',
  sentinel: 'Draw 1, keep your actions; trash, discard, or rearrange your next 2 cards.',
  crone: 'Draw 2; every opponent gets a Hex.',
  craftsman: 'Take a card costing up to 5 into your hand, then put one back on your deck.',
};

const BASIC = ['penny', 'sterling', 'bullion', 'property', 'dukedom', 'territory', 'hex'];
const KINGDOM = Object.keys(CARDS).filter((id) => !BASIC.includes(id));
const FIRST_GAME = ['basement', 'mart', 'trader', 'yeomanry', 'colliery', 'trench', 'renovate', 'forge', 'township', 'workroom'];

// ---------- helpers ----------
const me = (s, p) => s.players[p];
const nm = (s, p) => s.names[p];
const isType = (id, t) => CARDS[id].types.includes(t);
const names = (ids) => ids.map((id) => CARDS[id].name).join(', ');
const indicesWhere = (arr, fn) => arr.map((c, i) => (fn(c) ? i : -1)).filter((i) => i >= 0);
const othersOf = (s, p) => s.names.map((_, i) => (p + i) % s.names.length).slice(1);

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
  if (s.log.length > 40) s.log.shift();
}

// Take n cards off the top of a deck, shuffling the discard pile in if needed.
function takeTop(s, p, n) {
  const pl = me(s, p);
  const out = [];
  while (out.length < n) {
    if (!pl.deck.length) {
      if (!pl.discard.length) break;
      pl.deck = shuffle(pl.discard);
      pl.discard = [];
    }
    out.push(pl.deck.pop());
  }
  return out;
}

function draw(s, p, n) {
  me(s, p).hand.push(...takeTop(s, p, n));
}

function takeFromHand(s, p, indices) {
  const hand = me(s, p).hand;
  const set = new Set(indices);
  const out = hand.filter((_, i) => set.has(i));
  me(s, p).hand = hand.filter((_, i) => !set.has(i));
  return out;
}

function gainCard(s, p, id, where) {
  if (!(s.supply[id] > 0)) return false;
  s.supply[id] -= 1;
  const pl = me(s, p);
  if (where === 'hand') pl.hand.push(id);
  else if (where === 'deck') pl.deck.push(id);
  else pl.discard.push(id);
  return true;
}

const optionalDrawbacks = (s) => s.opts.drawbacks === 'optional';

// Other players hit by an attack, in turn order. A Trench in hand blocks it;
// otherwise attacks can't be refused.
function* targets(s, p, cardId, what, affects) {
  const hit = [];
  for (const o of othersOf(s, p)) {
    if (me(s, o).hand.includes('trench')) {
      say(s, `${nm(s, o)} revealed a Trench and is unaffected`);
      continue;
    }
    if (!affects(o)) continue;
    hit.push(o);
  }
  return hit;
}

// Build a question for one player.
function ask(s, seat, q) {
  q.seat = seat;
  if (q.kind === 'hand' && !q.allowed) q.allowed = me(s, seat).hand.map((_, i) => i);
  if (q.kind === 'list' && !q.allowed) q.allowed = q.cards.map((_, i) => i);
  if (q.kind === 'supply') {
    q.allowed = Object.keys(s.supply).filter((id) => s.supply[id] > 0 && CARDS[id].cost <= q.maxCost && (!q.type || isType(id, q.type)));
  }
  return q;
}

// Answer a question automatically when there's no real choice.
function autoAnswer(q) {
  if (q.kind === 'supply') return q.allowed.length ? undefined : null;
  if (q.kind === 'hand' || q.kind === 'list') {
    if (!q.allowed.length) return [];
    if (q.min === q.max && q.min >= q.allowed.length) return q.allowed.slice();
  }
  return undefined;
}

// Run the card in play until it needs an answer or finishes.
function runEngine(s, answer) {
  let next = answer;
  while (s.gen) {
    const r = s.gen.next(next);
    next = undefined;
    if (r.done) { s.gen = null; break; }
    const auto = autoAnswer(r.value);
    if (auto !== undefined) { next = auto; continue; }
    s.question = r.value;
    return;
  }
  s.question = null;
}

function cardCount(pl) {
  return pl.deck.length + pl.hand.length + pl.discard.length + pl.inPlay.length;
}

function vpOf(pl) {
  const all = [...pl.deck, ...pl.hand, ...pl.discard, ...pl.inPlay];
  const per10 = Math.floor(all.length / 10);
  return all.reduce((sum, id) => sum + (id === 'orchards' ? per10 : CARDS[id].vp || 0), 0);
}

function gameOver(s) {
  const empty = Object.values(s.supply).filter((n) => n === 0).length;
  return s.supply.territory === 0 || empty >= 3;
}

function startTurn(s) {
  s.phase = 'action';
  s.actions = 1;
  s.buys = 1;
  s.coins = 0;
  s.bought = false;
  s.traders = 0;
  s.sterlingPlayed = false;
}

function cleanup(s) {
  const pl = me(s, s.turn);
  pl.discard.push(...pl.hand, ...pl.inPlay);
  pl.hand = [];
  pl.inPlay = [];
  draw(s, s.turn, 5);
  if (gameOver(s)) {
    s.final = s.players.map(vpOf);
    const best = Math.max(...s.final);
    s.winner = s.final.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0);
    say(s, 'Game over');
    return;
  }
  s.turn = (s.turn + 1) % s.names.length;
  startTurn(s);
}

function playTreasure(s, p, index) {
  const pl = me(s, p);
  const id = pl.hand[index];
  pl.hand.splice(index, 1);
  pl.inPlay.push(id);
  s.coins += CARDS[id].coins;
  if (id === 'sterling' && !s.sterlingPlayed) {
    s.sterlingPlayed = true;
    s.coins += s.traders;
  }
}

function chooseKingdom(mode) {
  if (mode === 'first') return FIRST_GAME.slice();
  if (mode === 'all') return KINGDOM.slice();
  const pool = mode === 'noattack' ? KINGDOM.filter((id) => !isType(id, 'attack')) : KINGDOM;
  return shuffle(pool).slice(0, 10);
}

const TYPE_LABEL = { treasure: 'Treasure', victory: 'Victory', curse: 'Curse', action: 'Action', attack: 'Attack', reaction: 'Reaction' };

export default {
  minPlayers: 2,
  maxPlayers: 4,
  options: [
    { id: 'kingdom', label: 'Kingdom cards', type: 'select', default: 'random',
      choices: [['random', 'Random 10'], ['first', 'First game (a good starter set)'], ['noattack', 'Random 10, no attacks'], ['all', 'All 26 cards']] },
    { id: 'swap', label: 'Before starting', type: 'select', default: 'dealt',
      choices: [['dealt', 'Play the kingdom as dealt'], ['swap2', 'Host may swap up to 2 kingdom cards']] },
    { id: 'drawbacks', label: 'Your own cards’ drawbacks', type: 'select', default: 'required',
      choices: [['required', 'Required (standard rules)'], ['optional', 'Optional — you may skip them']] },
  ],
  rules(o) {
    const k = { random: '10 random kingdom cards', first: 'the starter set of kingdom cards', noattack: '10 random kingdom cards with no attacks', all: 'all 26 kingdom cards' }[o?.kingdom] || '10 random kingdom cards';
    return 'A deck-building game. Start with 7 Pennies and 3 Properties. Each turn: play Action cards, then play treasure and buy a card. ' +
      'New cards go to your discard pile and get shuffled into your deck. Victory cards score but clog your hand. ' +
      `This game uses ${k}${o?.swap === 'swap2' ? ', and the host may swap up to 2 of them before play' : ''}. ` +
      (o?.drawbacks === 'optional' ? 'The required parts of your own cards (like Trespasser’s discards) are optional. ' : '') +
      'It ends when the Territories run out or any three piles are empty. Most points wins.';
  },

  setup(names, options = {}) {
    const n = names.length;
    const vp = n === 2 ? 8 : 12;
    const opts = {
      kingdom: options.kingdom || 'random',
      swap: options.swap === 'swap2' ? 'swap2' : 'dealt',
      drawbacks: options.drawbacks === 'optional' ? 'optional' : 'required',
    };
    const kingdom = chooseKingdom(opts.kingdom);
    const supply = {
      penny: 60 - 7 * n, sterling: 40, bullion: 30,
      property: vp, dukedom: vp, territory: vp,
      hex: 10 * (n - 1),
    };
    for (const id of kingdom) supply[id] = id === 'orchards' ? vp : 10;
    const s = {
      names,
      opts,
      supply,
      kingdom,
      trash: [],
      players: names.map(() => ({
        deck: shuffle([...Array(7).fill('penny'), ...Array(3).fill('property')]),
        hand: [], discard: [], inPlay: [],
      })),
      turn: 0,
      gen: null,
      question: null,
      winner: null,
      final: null,
      log: [],
    };
    names.forEach((_, p) => draw(s, p, 5));
    startTurn(s);
    say(s, `Kingdom: ${kingdom.map((id) => CARDS[id].name).join(', ')}`);
    if (opts.swap === 'swap2') {
      s.phase = 'swap';
      s.swapsLeft = 2;
      say(s, `${names[0]} may swap up to 2 kingdom cards`);
    } else {
      say(s, `${names[0]} goes first`);
    }
    return s;
  },

  viewFor(s, seat) {
    const pl = me(s, seat);
    const q = s.question;
    const cards = {};
    for (const [id, c] of Object.entries(CARDS)) {
      cards[id] = { id, name: c.name, cost: c.cost, types: c.types, text: c.text, tip: TIPS[id] };
    }
    return {
      seat,
      names: s.names,
      turn: s.turn,
      phase: s.phase,
      actions: s.actions,
      buys: s.buys,
      coins: s.coins,
      bought: s.bought,
      hand: pl.hand.slice(),
      deckCount: pl.deck.length,
      discardCount: pl.discard.length,
      inPlay: me(s, s.turn).inPlay.slice(),
      others: s.players.map((o, i) => ({ name: s.names[i], hand: o.hand.length, total: cardCount(o) })),
      supply: [...BASIC, ...s.kingdom.slice().sort((a, b) => CARDS[a].cost - CARDS[b].cost || CARDS[a].name.localeCompare(CARDS[b].name))]
        .map((id) => ({ id, count: s.supply[id], kingdom: !BASIC.includes(id) })),
      trashCount: s.trash.length,
      cards,
      question: q && q.seat === seat ? { kind: q.kind, text: q.text, min: q.min, max: q.max, allowed: q.allowed, cards: q.cards, yes: q.yes, no: q.no, button: q.button } : null,
      waitingOn: q ? s.names[q.seat] : null,
      swapsLeft: s.phase === 'swap' ? s.swapsLeft : 0,
      swapPool: s.phase === 'swap' ? KINGDOM.filter((id) => !s.kingdom.includes(id)) : [],
      kingdomIds: s.kingdom.slice(),
      options: s.opts,
      final: s.final,
      winner: s.winner,
      log: s.log.slice(-5),
    };
  },

  applyMove(s, seat, move) {
    if (s.winner) return 'The game is over.';

    // Answering a card's question (may be another player during an attack)
    if (s.question) {
      const q = s.question;
      if (seat !== q.seat) return `Waiting for ${s.names[q.seat]} to choose.`;
      if (move.type !== 'answer') return 'Answer the question first.';
      let ans;
      if (q.kind === 'yesno') {
        ans = !!move.value;
      } else if (q.kind === 'supply') {
        if (!q.allowed.includes(move.id)) return 'Pick one of the highlighted cards.';
        ans = move.id;
      } else {
        const picks = [...new Set(Array.isArray(move.indices) ? move.indices : [])];
        if (!picks.every((i) => q.allowed.includes(i))) return 'Pick from the highlighted cards.';
        if (picks.length < Math.min(q.min, q.allowed.length) || picks.length > q.max) {
          return q.min === q.max ? `Choose ${q.min}.` : `Choose ${q.min ? `${q.min} to ` : 'up to '}${q.max}.`;
        }
        ans = picks;
      }
      s.question = null;
      runEngine(s, ans);
      return null;
    }

    if (s.phase === 'swap') {
      if (seat !== 0) return `Waiting for ${s.names[0]} to finish setting up the kingdom.`;
      if (move.type === 'startPlay') {
        s.phase = 'action';
        say(s, `Kingdom set. ${s.names[0]} goes first`);
        return null;
      }
      if (move.type !== 'swap') return 'Swap a card or start playing.';
      if (s.swapsLeft < 1) return 'No swaps left. Tap Start playing.';
      if (!s.kingdom.includes(move.out)) return 'Pick a kingdom card to swap out.';
      if (!KINGDOM.includes(move.in) || s.kingdom.includes(move.in)) return 'Pick a card that isn’t already in the kingdom.';
      const vp = s.names.length === 2 ? 8 : 12;
      s.kingdom[s.kingdom.indexOf(move.out)] = move.in;
      delete s.supply[move.out];
      s.supply[move.in] = move.in === 'orchards' ? vp : 10;
      s.swapsLeft -= 1;
      say(s, `${s.names[0]} swapped ${CARDS[move.out].name} for ${CARDS[move.in].name}`);
      if (s.swapsLeft === 0) {
        s.phase = 'action';
        say(s, `Kingdom set. ${s.names[0]} goes first`);
      }
      return null;
    }

    if (seat !== s.turn) return "It isn't your turn.";
    const pl = me(s, seat);

    if (move.type === 'play') {
      const id = pl.hand[move.index];
      if (!id) return "That card isn't in your hand.";
      if (isType(id, 'action')) {
        if (s.phase !== 'action') return 'Actions come before buying.';
        if (s.actions < 1) return 'No actions left.';
        s.actions -= 1;
        pl.hand.splice(move.index, 1);
        pl.inPlay.push(id);
        say(s, `${nm(s, seat)} played ${CARDS[id].name}`);
        s.gen = CARDS[id].play(s, seat);
        runEngine(s);
        return null;
      }
      if (isType(id, 'treasure')) {
        if (s.bought) return 'Play treasure before buying.';
        s.phase = 'buy';
        playTreasure(s, seat, move.index);
        return null;
      }
      return 'That card can’t be played.';
    }

    if (move.type === 'treasures') {
      if (s.bought) return 'Play treasure before buying.';
      s.phase = 'buy';
      for (let i = pl.hand.length - 1; i >= 0; i--) {
        if (isType(pl.hand[i], 'treasure')) playTreasure(s, seat, i);
      }
      return null;
    }

    if (move.type === 'buy') {
      const card = CARDS[move.id];
      if (!card || !(move.id in s.supply)) return 'Unknown card.';
      if (s.buys < 1) return 'No buys left.';
      if (s.supply[move.id] < 1) return 'That pile is empty.';
      if (s.coins < card.cost) return 'Not enough coins.';
      s.phase = 'buy';
      s.bought = true;
      s.coins -= card.cost;
      s.buys -= 1;
      gainCard(s, seat, move.id, 'discard');
      say(s, `${nm(s, seat)} bought ${card.name}`);
      return null;
    }

    if (move.type === 'end') {
      say(s, `${nm(s, seat)} ended their turn`);
      cleanup(s);
      return null;
    }

    return 'Unknown move.';
  },

  render(view, root, send) {
    root.replaceChildren();
    const C = view.cards;
    if (view.phase === 'swap') return renderSwap(view, root, send);
    const myTurn = view.turn === view.seat && !view.winner;
    const q = view.question;
    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };

    // Status
    let status;
    if (view.winner) {
      status = view.winner.includes(view.seat) ? (view.winner.length > 1 ? 'You tied for the win!' : 'You win!')
        : `${view.winner.map((i) => view.names[i]).join(' & ')} win${view.winner.length > 1 ? '' : 's'}`;
    } else if (q) {
      status = q.text;
    } else if (view.waitingOn) {
      status = `Waiting for ${view.waitingOn} to choose…`;
    } else if (myTurn) {
      status = view.phase === 'action' ? 'Your turn — play actions or start buying' : 'Buy a card or end your turn';
    } else {
      status = `${view.names[view.turn]} is playing`;
    }
    root.append(el('p', 'status' + (myTurn || q ? ' mine' : ''), status));

    if (view.final) {
      const box = el('div', 'summary');
      view.names.forEach((n, i) => box.append(el('p', '', `${n}: ${view.final[i]} points`)));
      root.append(box);
    }

    if (!view.winner) {
      const counters = el('div', 'dom-counters');
      [['Actions', view.actions], ['Buys', view.buys], ['Coins', view.coins]].forEach(([k, v]) => {
        const c = el('div', 'dom-counter');
        c.append(el('strong', '', String(v)), el('span', '', k));
        counters.append(c);
      });
      root.append(counters);
    }

    if (view.inPlay.length) {
      const strip = el('div', 'dom-in-play');
      strip.append(el('span', '', `${view.turn === view.seat ? 'You' : view.names[view.turn]} played:`));
      view.inPlay.forEach((id) => {
        const chip = el('span', `dom-chip t-${bandOf(C[id])}`);
        chip.innerHTML = ICONS[id] ? `<svg class="dom-chip-icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[id]}</svg>` : '';
        chip.append(C[id].name);
        strip.append(chip);
      });
      root.append(strip);
    }

    // A question from a card: answer area
    const selected = new Set();
    let doneBtn = null;
    const canDone = () => selected.size >= Math.min(q.min, q.allowed.length) && selected.size <= q.max;
    const toggle = (i, node) => {
      if (selected.has(i)) selected.delete(i);
      else if (selected.size < q.max) selected.add(i);
      else if (q.max === 1) { selected.clear(); root.querySelectorAll('.dom-tile.selected').forEach((n) => n.classList.remove('selected')); selected.add(i); }
      node.classList.toggle('selected', selected.has(i));
      if (doneBtn) doneBtn.disabled = !canDone();
    };

    if (q && q.kind === 'yesno') {
      const row = el('div', 'row dom-answer');
      const yes = el('button', 'primary', q.yes || 'Yes');
      yes.addEventListener('click', () => send({ type: 'answer', value: true }));
      const no = el('button', '', q.no || 'No');
      no.addEventListener('click', () => send({ type: 'answer', value: false }));
      row.append(yes, no);
      root.append(row);
    }

    if (q && q.kind === 'list') {
      const list = el('div', 'dom-grid dom-answer');
      q.cards.forEach((id, i) => {
        const ok = q.allowed.includes(i);
        const t = tileEl(C[id], { interactive: ok });
        if (ok) t.addEventListener('click', () => toggle(i, t));
        list.append(t);
      });
      root.append(list);
    }

    if (q && (q.kind === 'hand' || q.kind === 'list')) {
      doneBtn = el('button', 'primary big', q.button || 'Done');
      doneBtn.disabled = !canDone();
      doneBtn.addEventListener('click', () => send({ type: 'answer', indices: [...selected] }));
      root.append(doneBtn);
    }

    // Turn buttons
    if (myTurn && !q && !view.waitingOn) {
      const actions = el('div', 'actions');
      const hasTreasure = view.hand.some((id) => C[id].types.includes('treasure'));
      const tBtn = el('button', '', 'Play all treasure');
      tBtn.disabled = !hasTreasure || view.bought;
      tBtn.addEventListener('click', () => send({ type: 'treasures' }));
      const endBtn = el('button', 'primary', 'End turn');
      endBtn.addEventListener('click', () => send({ type: 'end' }));
      actions.append(tBtn, endBtn);
      root.append(actions);
    }

    // Your hand
    root.append(el('p', 'dom-info', `Your hand · deck ${view.deckCount} · discard ${view.discardCount}`));
    const hand = el('div', 'dom-grid');
    view.hand.forEach((id, i) => {
      const card = C[id];
      let interactive = false;
      let onClick = null;
      if (q && q.kind === 'hand') {
        interactive = q.allowed.includes(i);
        onClick = (t) => toggle(i, t);
      } else if (myTurn && !q && !view.waitingOn) {
        const isAction = card.types.includes('action');
        interactive = (isAction && view.phase === 'action' && view.actions > 0) || (card.types.includes('treasure') && !view.bought);
        onClick = () => send({ type: 'play', index: i });
      }
      const t = tileEl(card, { interactive });
      if (interactive) t.addEventListener('click', () => onClick(t));
      hand.append(t);
    });
    root.append(hand);

    // Supply
    const gaining = q && q.kind === 'supply';
    root.append(el('h3', 'dom-title', gaining ? q.text : 'Supply'));
    const supply = el('div', 'dom-grid');
    view.supply.forEach(({ id, count }) => {
      const card = C[id];
      const canBuy = myTurn && !q && !view.waitingOn && view.buys > 0 && count > 0 && view.coins >= card.cost;
      const canGain = gaining && q.allowed.includes(id);
      const t = tileEl(card, { interactive: canBuy || canGain, count });
      if (canBuy || canGain) t.addEventListener('click', () => send(canGain ? { type: 'answer', id } : { type: 'buy', id }));
      supply.append(t);
    });
    root.append(supply);

    root.append(el('p', 'dom-info', view.others.filter((_, i) => i !== view.seat).map((o) => `${o.name}: ${o.total} cards`).join(' · ') +
      ` · trash ${view.trashCount}`));

    const log = el('ul', 'log');
    view.log.forEach((line) => log.append(el('li', '', line)));
    root.append(log);
    addGuide(view, root);
  },

  styles: `
.dom-counters { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
.dom-counter { display: grid; justify-items: center; border: 1.5px solid var(--felt-line); border-radius: 12px; padding: 0.3rem; }
.dom-counter strong { font-family: var(--serif); font-size: 1.6rem; line-height: 1.2; }
.dom-counter span { font-size: 0.8rem; color: var(--muted); }
.dom-in-play { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; margin: 0.7rem 0; font-size: 0.85rem; color: var(--muted); }
.dom-chip { background: var(--paper); color: var(--ink); border-radius: 999px; padding: 0.1rem 0.6rem; box-shadow: inset 0 -3px 0 var(--band, #888); }
.dom-info { font-size: 0.85rem; color: var(--muted); margin: 0.6rem 0 0.2rem; }
.dom-title { font-family: var(--serif); font-weight: 400; color: var(--muted); font-size: 1.1rem; margin: 1.4rem 0 0.5rem; }
.dom-answer { margin: 0.6rem 0; }
.dom-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(6.6rem, 1fr)); gap: 0.45rem; }
.dom-tile {
  position: relative; display: grid; align-content: start; gap: 0.2rem; text-align: left;
  background: var(--paper); color: var(--ink); border: none; border-radius: 10px;
  padding: 0.5rem 0.55rem 0.55rem; min-height: 6.6rem; font-size: 0.76rem; line-height: 1.3;
  box-shadow: inset 0 5px 0 var(--band, #888);
}
.t-treasure { --band: #d4ad3a; }
.t-victory { --band: #3f8f5f; }
.t-curse { --band: #7b3fa0; }
.t-action { --band: #6b7c8f; }
.t-attack { --band: #c4262e; }
.t-reaction { --band: #2f6fb3; }
.dom-cost {
  position: absolute; top: 0.45rem; right: 0.45rem; width: 1.4rem; height: 1.4rem;
  display: grid; place-items: center; border-radius: 50%;
  background: #f3e2a6; font-weight: 700; font-size: 0.8rem;
}
.dom-name { font-family: var(--serif); font-weight: 700; font-size: 0.95rem; padding: 0.35rem 1.4rem 0 0; }
.dom-type { color: #777; font-size: 0.68rem; }
.dom-text { color: #333; }
.dom-count { color: #777; font-size: 0.7rem; }
.dom-tile.empty { opacity: 0.45; }
button.dom-tile:disabled { opacity: 1; }
.dom-tile.playable { outline: 2px solid var(--brass); outline-offset: 2px; cursor: pointer; }
.dom-tile.selected { outline: 3px solid #fff; transform: translateY(-4px); }
.dom-dim { opacity: 0.5; }
.dom-icon { display: block; width: 2.1rem; height: 2.1rem; margin: 0.15rem 0 0.05rem; }
.dom-icon svg, .dom-chip-icon { width: 100%; height: 100%; fill: none; stroke: #2a2a2a; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.dom-icon .a, .dom-chip-icon .a { fill: var(--band, #888); fill-opacity: 0.4; }
.dom-chip { display: inline-flex; align-items: center; gap: 0.25rem; }
.dom-chip-icon { width: 1rem; height: 1rem; flex: none; }
.dom-name { padding-top: 0 !important; }
.dom-tile { -webkit-touch-callout: none; user-select: none; }
.dom-guide-btn { float: right; margin: 0.4rem 0 0.4rem 0.5rem; padding: 0.35rem 0.8rem; min-height: 0; font-size: 0.9rem; }
.dom-guide {
  position: fixed; inset: 0; z-index: 30; overflow-y: auto;
  background: var(--felt-deep); padding: calc(1rem + env(safe-area-inset-top, 0px)) 1rem calc(2rem + env(safe-area-inset-bottom, 0px));
}
.dom-guide-head { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; max-width: 34rem; margin: 0 auto; }
.dom-guide-head h3 { font-family: var(--serif); font-weight: 400; margin: 0; }
.dom-guide ul { list-style: none; padding: 0; margin: 0.8rem auto 0; max-width: 34rem; display: grid; gap: 0.45rem; }
.dom-guide li {
  display: grid; grid-template-columns: 2.4rem 1fr; gap: 0.6rem; align-items: start;
  background: var(--paper); color: var(--ink); border-radius: 10px; padding: 0.55rem 0.7rem;
  box-shadow: inset 4px 0 0 var(--band, #888);
}
.dom-guide li svg { width: 2.4rem; height: 2.4rem; fill: none; stroke: #2a2a2a; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.dom-guide li svg .a { fill: var(--band, #888); fill-opacity: 0.4; }
.dom-guide li strong { font-family: var(--serif); }
.dom-guide-cost { color: #777; font-size: 0.85rem; }
.dom-guide li p { margin: 0.1rem 0 0; font-size: 0.9rem; color: #333; }
.dom-tip {
  position: fixed; left: 50%; bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%);
  width: min(22rem, 90vw); z-index: 40; background: var(--paper); color: var(--ink);
  border-radius: 12px; padding: 0.7rem 0.9rem; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35); pointer-events: none;
}
.dom-tip strong { font-family: var(--serif); }
.dom-tip p { margin: 0.2rem 0 0; font-size: 0.92rem; }
`,
};

// Before play: the host may swap up to 2 kingdom cards for others.
function renderSwap(view, root, send) {
  const C = view.cards;
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const deciding = view.seat === 0;
  addGuide(view, root, KINGDOM.filter((id) => view.kingdomIds.includes(id) || view.swapPool.includes(id)));
  root.append(el('p', 'status' + (deciding ? ' mine' : ''), deciding
    ? `Swap up to ${view.swapsLeft} kingdom card${view.swapsLeft === 1 ? '' : 's'}, or start playing`
    : `${view.names[0]} is setting up the kingdom…`));
  let out = null;
  const kingdom = el('div', 'dom-grid');
  const sorted = view.kingdomIds.slice().sort((a, b) => C[a].cost - C[b].cost || C[a].name.localeCompare(C[b].name));
  sorted.forEach((id) => {
    const t = tileEl(C[id], { interactive: deciding });
    if (deciding) {
      t.addEventListener('click', () => {
        out = out === id ? null : id;
        kingdom.querySelectorAll('.dom-tile').forEach((n) => n.classList.remove('selected'));
        if (out) t.classList.add('selected');
        poolTitle.textContent = out ? `Swap ${C[out].name} for:` : 'First tap a kingdom card above to swap out';
        pool.classList.toggle('dom-dim', !out);
      });
    }
    kingdom.append(t);
  });
  root.append(el('h3', 'dom-title', 'Kingdom'), kingdom);
  if (!deciding) return;
  const start = el('button', 'primary big', 'Start playing');
  start.addEventListener('click', () => send({ type: 'startPlay' }));
  root.append(start);
  const poolTitle = el('h3', 'dom-title', 'First tap a kingdom card above to swap out');
  const pool = el('div', 'dom-grid dom-dim');
  view.swapPool.slice().sort((a, b) => C[a].cost - C[b].cost || C[a].name.localeCompare(C[b].name)).forEach((id) => {
    const t = tileEl(C[id], { interactive: true });
    t.addEventListener('click', () => {
      if (!out) return;
      send({ type: 'swap', out, in: id });
    });
    pool.append(t);
  });
  root.append(poolTitle, pool);
}

// ---------- card guide + press-and-hold tips ----------
let guideOpen = false; // stays open across screen updates

function addGuide(view, root, ids) {
  const C = view.cards;
  const list = ids || [...BASIC, ...view.kingdomIds.slice().sort((a, b) => C[a].cost - C[b].cost || C[a].name.localeCompare(C[b].name))];
  const btn = document.createElement('button');
  btn.className = 'dom-guide-btn';
  btn.textContent = 'Card guide';
  btn.addEventListener('click', () => { guideOpen = true; render(); });
  root.prepend(btn);

  const sheet = document.createElement('div');
  sheet.className = 'dom-guide';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Card guide');
  const render = () => {
    sheet.hidden = !guideOpen;
    if (!guideOpen) return;
    sheet.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'dom-guide-head';
    const h = document.createElement('h3');
    h.textContent = ids ? 'Card guide — all kingdom cards' : 'Card guide — this game';
    const close = document.createElement('button');
    close.textContent = 'Close';
    close.addEventListener('click', () => { guideOpen = false; render(); });
    head.append(h, close);
    const ul = document.createElement('ul');
    for (const id of list) {
      const c = C[id];
      const li = document.createElement('li');
      li.className = `t-${bandOf(c)}`;
      li.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[id] || ''}</svg><div><strong></strong><span class="dom-guide-cost"></span><p></p></div>`;
      li.querySelector('strong').textContent = c.name;
      li.querySelector('.dom-guide-cost').textContent = ` · ${c.cost}`;
      li.querySelector('p').textContent = c.tip;
      ul.append(li);
    }
    sheet.append(head, ul);
  };
  render();
  root.append(sheet);
}

// Press and hold a card to see its quick description without playing it.
function addHoldTip(t, card) {
  let timer = null;
  let held = false;
  const show = () => {
    held = true;
    document.querySelectorAll('.dom-tip').forEach((n) => n.remove());
    const tip = document.createElement('div');
    tip.className = 'dom-tip';
    tip.setAttribute('role', 'status');
    tip.innerHTML = '<strong></strong><p></p>';
    tip.querySelector('strong').textContent = card.name;
    tip.querySelector('p').textContent = card.tip;
    document.body.append(tip);
    setTimeout(() => tip.remove(), 3500);
  };
  t.addEventListener('pointerdown', () => { held = false; timer = setTimeout(show, 450); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => t.addEventListener(ev, () => clearTimeout(timer)));
  t.addEventListener('contextmenu', (e) => e.preventDefault());
  // A hold shouldn't also count as a tap.
  t.addEventListener('click', (e) => {
    if (held) { e.stopImmediatePropagation(); e.preventDefault(); held = false; }
  }, true);
}

function bandOf(card) {
  for (const t of ['attack', 'reaction', 'curse', 'victory', 'treasure']) if (card.types.includes(t)) return t;
  return 'action';
}

function tileEl(card, { interactive, count } = {}) {
  const t = document.createElement(interactive ? 'button' : 'div');
  if (interactive) t.type = 'button';
  t.className = `dom-tile t-${bandOf(card)}` + (interactive ? ' playable' : '') + (count === 0 ? ' empty' : '');
  const add = (cls, text) => {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    t.append(s);
  };
  add('dom-cost', String(card.cost));
  if (ICONS[card.id]) {
    const icon = document.createElement('span');
    icon.className = 'dom-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[card.id]}</svg>`;
    t.append(icon);
  }
  add('dom-name', card.name);
  add('dom-type', card.types.map((x) => TYPE_LABEL[x]).join(' – '));
  add('dom-text', card.text);
  if (count != null) add('dom-count', `${count} left`);
  if (card.tip) addHoldTip(t, card);
  return t;
}
