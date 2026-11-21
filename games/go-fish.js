// Go Fish — 2 to 6 players. On your turn, ask one player for a rank you hold.
// If they have any, they hand them all over and you go again. If not, "Go fish":
// draw a card, and if it's the rank you asked for, go again. Four of a rank makes
// a book. Most books when all 13 are made wins.
import { standardDeck, shuffle, rankOf, suitOf, RANKS, cardEl } from '../js/cards.js';

const RANK_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_NAME = { A: 'Aces', J: 'Jacks', Q: 'Queens', K: 'Kings' };
const rankName = (r) => RANK_NAME[r] || `${r}s`;

function say(s, t) {
  s.log.push(t);
  if (s.log.length > 30) s.log.shift();
}

function sortHand(h) {
  return h.slice().sort((a, b) => RANK_ORDER.indexOf(rankOf(a)) - RANK_ORDER.indexOf(rankOf(b)) || suitOf(a).localeCompare(suitOf(b)));
}

// Lay down any complete books in a hand.
function collectBooks(s, seat) {
  for (const r of RANKS) {
    const four = s.hands[seat].filter((c) => rankOf(c) === r);
    if (four.length === 4) {
      s.hands[seat] = s.hands[seat].filter((c) => rankOf(c) !== r);
      s.books[seat].push(r);
      say(s, `${s.names[seat]} made a book of ${rankName(r)}`);
    }
  }
}

// A player with no cards draws one if they can; otherwise they're out of cards.
function refill(s, seat) {
  if (s.hands[seat].length === 0 && s.deck.length) {
    s.hands[seat].push(s.deck.pop());
    collectBooks(s, seat);
  }
}

function gameOver(s) {
  return s.books.reduce((n, b) => n + b.length, 0) === 13;
}

function nextTurn(s, from) {
  const n = s.names.length;
  for (let k = 1; k <= n; k++) {
    const p = (from + k) % n;
    refill(s, p);
    if (s.hands[p].length) return p;
  }
  return from;
}

function finish(s) {
  const counts = s.books.map((b) => b.length);
  const best = Math.max(...counts);
  s.winners = counts.map((c, i) => (c === best ? i : -1)).filter((i) => i >= 0);
  s.phase = 'over';
  say(s, `${s.winners.map((i) => s.names[i]).join(' & ')} win${s.winners.length > 1 ? '' : 's'} with ${best} books!`);
}

export default {
  minPlayers: 2,
  maxPlayers: 6,
  rules: 'Ask one player for a rank you hold. If they have any, they give them all and you go again. If not, go fish: draw a card, and if it’s the rank you asked for, go again. Four of a kind makes a book. Most books wins.',

  setup(names) {
    const deck = shuffle(standardDeck());
    const n = names.length;
    const each = n <= 3 ? 7 : 5;
    const s = { names, deck, hands: names.map(() => []), books: names.map(() => []), turn: 0, phase: 'play', winners: null, last: null, log: [] };
    for (let i = 0; i < each; i++) for (let p = 0; p < n; p++) s.hands[p].push(s.deck.pop());
    names.forEach((_, p) => collectBooks(s, p));
    say(s, `${names[0]} goes first`);
    return s;
  },

  viewFor(s, seat) {
    return {
      seat,
      names: s.names,
      phase: s.phase,
      turn: s.turn,
      hand: sortHand(s.hands[seat]),
      counts: s.hands.map((h) => h.length),
      books: s.books,
      deckLeft: s.deck.length,
      last: s.last,
      winner: s.winners,
      log: s.log.slice(-5),
    };
  },

  applyMove(s, seat, move) {
    if (s.phase === 'over') return 'The game is over.';
    if (seat !== s.turn) return "It isn't your turn.";
    if (move.type !== 'ask') return 'Ask a player for a rank.';
    const target = Number(move.target);
    const rank = String(move.rank);
    if (!Number.isInteger(target) || target === seat || target < 0 || target >= s.names.length) return 'Pick another player to ask.';
    if (!s.hands[target].length) return `${s.names[target]} has no cards.`;
    if (!s.hands[seat].some((c) => rankOf(c) === rank)) return 'You can only ask for a rank you hold.';

    const got = s.hands[target].filter((c) => rankOf(c) === rank);
    let again = false;
    if (got.length) {
      s.hands[target] = s.hands[target].filter((c) => rankOf(c) !== rank);
      s.hands[seat].push(...got);
      s.last = { from: seat, to: target, rank, got: got.length, fished: false };
      say(s, `${s.names[seat]} got ${got.length} ${got.length > 1 ? rankName(rank) : rank} from ${s.names[target]}`);
      again = true;
    } else {
      s.last = { from: seat, to: target, rank, got: 0, fished: !!s.deck.length };
      if (s.deck.length) {
        const card = s.deck.pop();
        s.hands[seat].push(card);
        s.last.lucky = rankOf(card) === rank;
        say(s, `${s.names[target]} said “Go fish!” — ${s.names[seat]} drew${s.last.lucky ? ` the ${rank} they asked for!` : ' a card'}`);
        again = s.last.lucky;
      } else {
        say(s, `${s.names[target]} said “Go fish!” — the pond is empty`);
      }
    }
    collectBooks(s, seat);
    if (gameOver(s)) { finish(s); return null; }
    refill(s, target);
    refill(s, seat);
    s.turn = again && s.hands[seat].length ? seat : nextTurn(s, seat);
    if (!s.hands.some((h) => h.length) && !s.deck.length) finish(s);
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

    let status;
    if (view.phase === 'over') status = view.winner.includes(view.seat) ? 'You win!' : `${view.winner.map((i) => view.names[i]).join(' & ')} win`;
    else status = myTurn ? 'Your turn — ask someone for a rank' : `${view.names[view.turn]} is asking`;
    root.append(el('p', 'status' + (myTurn ? ' mine' : ''), status));

    if (view.last) {
      const l = view.last;
      const who = (i) => (i === view.seat ? 'you' : view.names[i]);
      const text = l.got
        ? `${who(l.from)} asked ${who(l.to)} for ${rankName(l.rank)} and got ${l.got}.`
        : `${who(l.from)} asked ${who(l.to)} for ${rankName(l.rank)} — Go fish!${l.lucky ? ' And drew one!' : ''}`;
      root.append(el('p', 'gofish-last', text.charAt(0).toUpperCase() + text.slice(1)));
    }

    // Players: cards in hand + books; tap one to choose who to ask
    let target = null;
    let rank = null;
    const askBtn = el('button', 'primary big', 'Pick a player and a rank');
    askBtn.disabled = true;
    const refresh = () => {
      askBtn.disabled = target == null || rank == null;
      askBtn.textContent = target == null || rank == null ? 'Pick a player and a rank'
        : `Ask ${view.names[target]} for ${rankName(rank)}`;
    };
    const players = el('div', 'gofish-players');
    view.names.forEach((n, i) => {
      if (i === view.seat) return;
      const canAsk = myTurn && view.counts[i] > 0;
      const p = el(canAsk ? 'button' : 'div', 'gofish-player' + (i === view.turn ? ' active' : ''));
      p.append(el('strong', '', n), el('span', '', `${view.counts[i]} card${view.counts[i] === 1 ? '' : 's'} · ${view.books[i].length} book${view.books[i].length === 1 ? '' : 's'}`));
      if (view.books[i].length) p.append(el('small', '', view.books[i].join(' ')));
      if (canAsk) {
        p.type = 'button';
        p.addEventListener('click', () => {
          target = i;
          players.querySelectorAll('.gofish-player').forEach((x) => x.classList.remove('selected'));
          p.classList.add('selected');
          refresh();
        });
      }
      players.append(p);
    });
    root.append(players);

    root.append(el('p', 'gofish-pond', `Pond: ${view.deckLeft} card${view.deckLeft === 1 ? '' : 's'} · Your books: ${view.books[view.seat].length ? view.books[view.seat].join(' ') : 'none yet'}`));

    if (myTurn) {
      askBtn.addEventListener('click', () => send({ type: 'ask', target, rank }));
      root.append(askBtn);
    }

    // Your hand: tap a card to choose its rank
    const hand = el('div', 'hand');
    for (const card of view.hand) {
      const c = cardEl(card, {
        playable: myTurn,
        onClick: () => {
          rank = rankOf(card);
          hand.querySelectorAll('.card').forEach((x) => x.classList.toggle('selected', x.dataset.rank === rank));
          refresh();
        },
      });
      c.dataset.rank = rankOf(card);
      hand.append(c);
    }
    root.append(hand);
    if (!view.hand.length && view.phase !== 'over') root.append(el('p', 'note', 'You’re out of cards.'));

    const log = el('ul', 'log');
    view.log.forEach((l) => log.append(el('li', '', l)));
    root.append(log);
  },

  styles: `
.gofish-last { text-align: center; background: rgba(0, 0, 0, 0.15); border-radius: 10px; padding: 0.5rem; margin: 0.5rem 0; }
.gofish-players { display: grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap: 0.45rem; margin: 0.6rem 0; }
.gofish-player { display: grid; gap: 0.1rem; text-align: left; border: 1.5px solid var(--felt-line); border-radius: 12px; padding: 0.5rem 0.7rem; background: transparent; color: var(--chalk); min-height: 0; }
.gofish-player.active { border-color: var(--brass); }
.gofish-player.selected { background: rgba(212, 173, 58, 0.2); border-color: var(--brass); outline: 2px solid var(--brass); }
.gofish-player span, .gofish-player small { color: var(--muted); font-size: 0.85rem; }
.gofish-pond { color: var(--muted); font-size: 0.9rem; text-align: center; }
`,
};
