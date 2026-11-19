# Adding a game

Each game is one file in `games/`. The platform handles players, connections, and sending moves; your file handles the rules and the screen.

## Steps

1. Copy `games/crazy-eights.js` to `games/your-game.js`.
2. Change the parts below.
3. In `games/index.js`, import it and add it to `GAMES`.
4. In `sw.js`, add `'games/your-game.js'` to `FILES` and change `VERSION` (e.g. `'v2'`) so phones save the new version.
5. Test on your computer (see below), then commit.

## What a game file provides

```js
export default {
  id: 'your-game',          // unique, no spaces
  name: 'Your Game',        // shown in the lobby
  minPlayers: 2,
  maxPlayers: 4,
  rules: 'One or two sentences shown in the lobby.',

  setup(names) { ... },                 // host only: return the full game state
  viewFor(state, seat) { ... },         // host only: what player `seat` may see
  applyMove(state, seat, move) { ... }, // host only: change state, return an error string or null
  render(view, root, send) { ... },     // every phone: draw `view` into `root`; call send(move) to act
};
```

Rules for a smooth game:

- **State and views must be plain data** (strings, numbers, arrays, objects) since they travel between phones.
- **Never put secret info in a view.** Send other players' card counts, not their cards.
- **Check everything in `applyMove`.** Is it this player's turn, do they hold that card, is the move legal? The returned error message is shown to the player.
- Seat `0` is the host. Seats follow the lobby order.
- When the game ends, set something in state (like `winner`) and show it in your view. The host gets a **Play again** button when `view.winner` is set.
- `js/cards.js` has a standard deck, `shuffle`, and `cardEl` / `cardBackEl` for drawing cards. For a custom deck (like Rook), build your own list of card strings and drawing function.

## Testing on your computer

Run a local server in the project folder:

```
python3 -m http.server 8000
```

Open http://localhost:8000 in one browser window as the host and a private/incognito window as a player. Use **Copy link** and the paste box to connect them.
