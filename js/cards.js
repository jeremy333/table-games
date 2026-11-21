// cards.js — shared deck tools any game can use.
// A card is a string: rank + suit letter, e.g. "10H", "AS", "QC".

export const SUITS = ['S', 'H', 'D', 'C'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_NAME = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };

export function standardDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(r + s);
  return deck;
}

// A fair random number from 0 to n-1, from the phone's secure random source (no rounding bias).
export function randomInt(n) {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return buf[0] % n;
}

// Fisher-Yates: every order of the deck is equally likely.
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const rankOf = (card) => card.slice(0, -1);
export const suitOf = (card) => card.slice(-1);
export const isRed = (card) => ['H', 'D'].includes(suitOf(card));

// Draws a card face. Pass { onClick, playable } for cards in your hand.
export function cardEl(card, opts = {}) {
  const el = document.createElement(opts.onClick ? 'button' : 'div');
  el.className = 'card' + (isRed(card) ? ' red' : '') + (opts.playable ? ' playable' : '');
  const r = rankOf(card);
  const s = SUIT_SYMBOL[suitOf(card)];
  el.innerHTML = `<span class="idx">${r}<br>${s}</span><span class="pip">${s}</span>`;
  el.setAttribute('aria-label', `${r} of ${SUIT_NAME[suitOf(card)]}`);
  if (opts.onClick) {
    el.type = 'button';
    el.disabled = !opts.playable;
    el.addEventListener('click', () => opts.onClick(card));
  }
  return el;
}

export function cardBackEl(label) {
  const el = document.createElement('div');
  el.className = 'card back';
  if (label != null) el.innerHTML = `<span class="count">${label}</span>`;
  return el;
}
