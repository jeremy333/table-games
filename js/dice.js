// dice.js — shared dice tools any game can use (fair rolls + dice drawings).

// A fair roll from 1 to sides, using the phone's secure random source (no rounding bias).
export function rollDie(sides = 6) {
  const limit = Math.floor(0x100000000 / sides) * sides;
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return (buf[0] % sides) + 1;
}

export function rollDice(n, sides = 6) {
  return Array.from({ length: n }, () => rollDie(sides));
}

const PIPS = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]],
};

// An SVG picture of one die face.
export function dieSvg(value) {
  const dots = (PIPS[value] || []).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9"/>`).join('');
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="4" y="4" width="92" height="92" rx="18" class="die-face"/>${dots}</svg>`;
}

// A die as a button (or plain box). opts: { onClick, selected, held, label, disabled }
export function dieEl(value, opts = {}) {
  const el = document.createElement(opts.onClick ? 'button' : 'div');
  el.className = 'die' + (opts.selected ? ' selected' : '') + (opts.held ? ' held' : '');
  el.innerHTML = dieSvg(value);
  el.setAttribute('aria-label', opts.label || `Die showing ${value}`);
  if (opts.onClick) {
    el.type = 'button';
    el.disabled = !!opts.disabled;
    el.addEventListener('click', opts.onClick);
  }
  return el;
}

// Styles for dice; a dice game adds these to its own styles.
export const DICE_STYLES = `
.die { width: 3.3rem; height: 3.3rem; padding: 0; border: none; background: none; min-height: 0; border-radius: 12px; flex: none; }
.die svg { width: 100%; height: 100%; display: block; }
.die .die-face { fill: #fffdf6; stroke: #1b1b1b; stroke-width: 3; }
.die circle { fill: #1b1b1b; }
button.die { cursor: pointer; transition: transform 0.12s ease; }
button.die:disabled { cursor: default; }
.die.selected, .die.held { transform: translateY(-6px); }
.die.selected .die-face, .die.held .die-face { fill: #f6e3a1; stroke: #b8860b; stroke-width: 5; }
`;
