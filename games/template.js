// template.js — a starting point for a new game. Copy this file, rename it
// (the file name becomes the game's id), fill in the name and the four
// functions, and upload it to games/. The game list updates by itself.
// (This file itself is skipped, so it never shows up in the app.)

export default {
  name: 'Your Game',
  blurb: 'One line shown under the name in the game list.',
  tags: ['cards'], // extra search words
  minPlayers: 2,
  maxPlayers: 4,
  rules: 'One or two sentences shown in the lobby.',

  // Optional table settings shown in the lobby; picks arrive in setup(names, options).
  options: [],

  // Optional styles for this game only (class names prefixed to avoid clashes).
  styles: `
    .mygame-board { display: grid; gap: 0.5rem; }
  `,

  // Host only. Return the whole game state as plain data.
  setup(names, options) {
    return { names, turn: 0, winner: null, log: [] };
  },

  // Host only. What player `seat` is allowed to see. Never include secrets.
  viewFor(state, seat) {
    return { seat, names: state.names, turn: state.turn, winner: state.winner, log: state.log.slice(-4) };
  },

  // Host only. Check the move, change the state, return an error message or null.
  applyMove(state, seat, move) {
    if (state.winner != null) return 'The game is over.';
    if (seat !== state.turn) return "It isn't your turn.";
    // ...apply move...
    state.turn = (state.turn + 1) % state.names.length;
    return null;
  },

  // Every phone. Draw the view into root; call send(move) when the player acts.
  render(view, root, send) {
    root.replaceChildren();
    const p = document.createElement('p');
    p.className = 'status' + (view.turn === view.seat ? ' mine' : '');
    p.textContent = view.turn === view.seat ? 'Your turn' : `${view.names[view.turn]} is playing`;
    root.append(p);
  },
};
