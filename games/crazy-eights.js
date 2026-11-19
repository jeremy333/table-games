// Crazy Eights — the first game module. Copy this file's shape to add a new game.
// See ADDING-A-GAME.md for what each part does.
import {
  standardDeck, shuffle, rankOf, suitOf, SUITS, SUIT_SYMBOL, SUIT_NAME, cardEl, cardBackEl,
} from '../js/cards.js';

function topCard(state) {
  return state.discard[state.discard.length - 1];
}

function isLegal(card, top, suit) {
  return rankOf(card) === '8' || suitOf(card) === suit || rankOf(card) === rankOf(top);
}

function nextTurn(state) {
  state.turn = (state.turn + 1) % state.names.length;
  state.drewThisTurn = false;
}

function say(state, text) {
  state.log.push(text);
  if (state.log.length > 20) state.log.shift();
}

export default {
  id: 'crazy-eights',
  name: 'Crazy Eights',
  minPlayers: 2,
  maxPlayers: 7,
  rules:
    'Match the top card by suit or rank. Eights are wild: play one and pick the new suit. ' +
    "If you can't play, draw one card, then play or pass. First to empty their hand wins.",

  // Runs on the host only. Returns the full secret game state.
  setup(names) {
    let draw = shuffle(standardDeck());
    const handSize = names.length === 2 ? 7 : 5;
    const hands = names.map(() => draw.splice(0, handSize));
    // Starting card can't be an 8.
    const startIdx = draw.findIndex((c) => rankOf(c) !== '8');
    const start = draw.splice(startIdx, 1)[0];
    return {
      names,
      hands,
      draw,
      discard: [start],
      suit: suitOf(start),
      turn: 0,
      drewThisTurn: false,
      winner: null,
      log: [`Starting card: ${rankOf(start)}${SUIT_SYMBOL[suitOf(start)]}`],
    };
  },

  // Runs on the host. Returns only what one player is allowed to see.
  viewFor(state, seat) {
    return {
      seat,
      names: state.names,
      hand: state.hands[seat].slice(),
      counts: state.hands.map((h) => h.length),
      top: topCard(state),
      suit: state.suit,
      turn: state.turn,
      drewThisTurn: state.drewThisTurn,
      drawLeft: state.draw.length,
      winner: state.winner,
      log: state.log.slice(-4),
    };
  },

  // Runs on the host. Changes state; returns an error message or null.
  applyMove(state, seat, move) {
    if (state.winner != null) return 'The game is over.';
    if (seat !== state.turn) return "It isn't your turn.";
    const name = state.names[seat];
    const hand = state.hands[seat];

    if (move.type === 'play') {
      const i = hand.indexOf(move.card);
      if (i < 0) return "That card isn't in your hand.";
      if (!isLegal(move.card, topCard(state), state.suit)) return "That card doesn't match.";
      if (rankOf(move.card) === '8' && !SUITS.includes(move.suit)) return 'Pick a suit for your 8.';
      hand.splice(i, 1);
      state.discard.push(move.card);
      state.suit = rankOf(move.card) === '8' ? move.suit : suitOf(move.card);
      const played = `${rankOf(move.card)}${SUIT_SYMBOL[suitOf(move.card)]}`;
      say(state, rankOf(move.card) === '8'
        ? `${name} played ${played} and chose ${SUIT_NAME[state.suit]}`
        : `${name} played ${played}`);
      if (hand.length === 0) {
        state.winner = seat;
        say(state, `${name} wins!`);
      } else {
        nextTurn(state);
      }
      return null;
    }

    if (move.type === 'draw') {
      if (state.drewThisTurn) return 'You already drew this turn.';
      if (state.draw.length === 0) {
        const top = state.discard.pop();
        state.draw = shuffle(state.discard);
        state.discard = [top];
      }
      state.drewThisTurn = true;
      if (state.draw.length === 0) {
        say(state, 'No cards left to draw');
        return null;
      }
      hand.push(state.draw.pop());
      say(state, `${name} drew a card`);
      return null;
    }

    if (move.type === 'pass') {
      if (!state.drewThisTurn) return 'Draw a card before passing.';
      say(state, `${name} passed`);
      nextTurn(state);
      return null;
    }

    return 'Unknown move.';
  },

  // Runs on every phone. Draws one player's view; call send(move) to act.
  render(view, root, send) {
    const myTurn = view.turn === view.seat && view.winner == null;
    root.replaceChildren();

    const status = document.createElement('p');
    status.className = 'status' + (myTurn ? ' mine' : '');
    status.textContent = view.winner != null
      ? (view.winner === view.seat ? 'You win!' : `${view.names[view.winner]} wins`)
      : myTurn ? 'Your turn' : `${view.names[view.turn]} is playing`;
    root.append(status);

    // Other players around the table
    const others = document.createElement('div');
    others.className = 'opponents';
    view.names.forEach((n, i) => {
      if (i === view.seat) return;
      const seat = document.createElement('div');
      seat.className = 'seat' + (i === view.turn ? ' active' : '');
      seat.append(cardBackEl(view.counts[i]));
      const label = document.createElement('span');
      label.textContent = n;
      seat.append(label);
      others.append(seat);
    });
    root.append(others);

    // Middle of the table
    const middle = document.createElement('div');
    middle.className = 'middle';
    const pile = document.createElement('button');
    pile.type = 'button';
    pile.className = 'pile';
    pile.disabled = !myTurn || view.drewThisTurn;
    pile.append(cardBackEl(view.drawLeft));
    pile.setAttribute('aria-label', 'Draw a card');
    pile.addEventListener('click', () => send({ type: 'draw' }));
    middle.append(pile, cardEl(view.top));
    const suit = document.createElement('div');
    suit.className = 'suit-chip' + (['H', 'D'].includes(view.suit) ? ' red' : '');
    suit.textContent = `${SUIT_SYMBOL[view.suit]} ${SUIT_NAME[view.suit]}`;
    middle.append(suit);
    root.append(middle);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'actions';
    if (myTurn) {
      const drawBtn = document.createElement('button');
      drawBtn.textContent = 'Draw';
      drawBtn.disabled = view.drewThisTurn;
      drawBtn.addEventListener('click', () => send({ type: 'draw' }));
      const passBtn = document.createElement('button');
      passBtn.textContent = 'Pass';
      passBtn.disabled = !view.drewThisTurn;
      passBtn.addEventListener('click', () => send({ type: 'pass' }));
      actions.append(drawBtn, passBtn);
    }
    root.append(actions);

    // Your hand
    const hand = document.createElement('div');
    hand.className = 'hand';
    for (const card of view.hand) {
      const playable = myTurn && isLegal(card, view.top, view.suit);
      hand.append(cardEl(card, {
        playable,
        onClick: (c) => {
          if (rankOf(c) === '8') chooseSuit(root, (s) => send({ type: 'play', card: c, suit: s }));
          else send({ type: 'play', card: c });
        },
      }));
    }
    root.append(hand);

    const log = document.createElement('ul');
    log.className = 'log';
    for (const line of view.log) {
      const li = document.createElement('li');
      li.textContent = line;
      log.append(li);
    }
    root.append(log);
  },
};

function chooseSuit(root, pick) {
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.innerHTML = '<p>Choose the new suit</p>';
  const row = document.createElement('div');
  row.className = 'suit-row';
  for (const s of SUITS) {
    const b = document.createElement('button');
    b.className = 'suit-btn' + (['H', 'D'].includes(s) ? ' red' : '');
    b.textContent = SUIT_SYMBOL[s];
    b.setAttribute('aria-label', SUIT_NAME[s]);
    b.addEventListener('click', () => { sheet.remove(); pick(s); });
    row.append(b);
  }
  const cancel = document.createElement('button');
  cancel.className = 'quiet';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => sheet.remove());
  sheet.append(row, cancel);
  root.append(sheet);
}
